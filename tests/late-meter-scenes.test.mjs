import test from 'node:test';
import assert from 'node:assert/strict';
import '../my-3d2dge.js';
import { RasterCanvas } from './helpers/raster-canvas.mjs';
import { createInteriorRenderer } from '../src/interior-renderer.js';
import { WORLD, LATE_METER_BINDINGS, LATE_METER_SCENE_REPORT } from '../src/world.js';
import { CITY_BLUEPRINT } from '../src/city-blueprint.js';
import { createNightCrossingWorld } from '../src/campaign/scenes.js';
import { createTerrain } from '../src/terrain.js';
import { createSurfaceMovement } from '../src/surface-movement.js';
import {
  createSimulation,
  updateSimulation,
  saveGame,
  restoreGame,
  VEHICLE_SPECS,
} from '../src/simulation.js';
import {
  enterInterior,
  isInteriorBlocked,
  setInteriorDoor,
  damageInteriorProp,
} from '../src/interiors.js';
import {
  createLateMeterWorld,
  IMPOUND_ANNEX_LAYOUT,
  IMPOUND_ANNEX_PORTAL,
  createImpoundAnnexGeometry,
  checkLateMeterVehicleSweep,
  impoundAudibility,
  LATE_METER_APPEARANCES,
  LATE_METER_CLIPBOARD,
  lateMeterClipboardPose,
  lateMeterPropDescriptors,
  createLateMeterRenderer,
  impoundWindowActor,
  drawLateMeterClipboard,
  drawLateMeterClothingMarks,
} from '../src/campaign/late-meter-scenes.js';
const E = globalThis.My3D2dge,
  b = LATE_METER_BINDINGS['impound-counter'],
  terrain = createTerrain(WORLD);
function renderer(
  view = new E.View('city', 'City', 35, 48, 1.6),
  { x = 290, y = 390, width = 640, height = 480, live = false } = {},
) {
  const canvas = new RasterCanvas();
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d'),
    origin = view.p(x, y, 0);
  if (live) ctx.getTransform = undefined;
  const r = {
    ctx,
    view,
    ix: Math.floor(origin[0]) - width / 2,
    iy: Math.floor(origin[1]) - height / 2,
    bw: width,
    bh: height,
    W: width,
    H: height,
    queued: [],
    actors: [],
    boxes: [],
    get tgt() {
      return ctx;
    },
    w(x, y, z = 0) {
      const p = view.p(x, y, z);
      return [p[0] - this.ix, p[1] - this.iy];
    },
    visible(x, y, z = 0, margin = 60, up = 30, down = 90) {
      const p = this.w(x, y, z);
      return p[0] > -margin && p[0] < width + margin && p[1] > -up && p[1] < height + down;
    },
    queue(x, y, z, fn, options) {
      this.queued.push({ x, y, z, fn, options });
    },
    actor(x, y, z, fn, options) {
      this.actors.push({ x, y, z, fn, options });
    },
    box(g, ...args) {
      this.boxes.push(args);
      E.Renderer.prototype.box.call(this, g, ...args);
    },
    shadow() {},
    groundPts(...a) {
      return E.Renderer.prototype.groundPts.apply(this, a);
    },
    groundDisc(...a) {
      return E.Renderer.prototype.groundDisc.apply(this, a);
    },
    groundRing(...a) {
      return E.Renderer.prototype.groundRing.apply(this, a);
    },
    glowDisc(g, x, y, radius, color, alpha) {
      E.px.ddisc(g, x, y, radius, color, alpha, this.ix, this.iy);
    },
    overlay() {},
    flush() {
      const q = [
        ...this.queued,
        ...this.actors.map((a) => ({ ...a, fn: (g) => a.fn(g, ...this.w(a.x, a.y, a.z)) })),
      ];
      for (const a of q.sort(
        (a, b) =>
          view.order(a.x, a.y, a.z) +
          (a.options?.bias || 0) -
          view.order(b.x, b.y, b.z) -
          (b.options?.bias || 0),
      ))
        a.fn(ctx);
    },
  };
  return r;
}
const game = () => ({ time: 12, real: 12, lights: { add() {} } });
function withCanvas(fn) {
  const old = globalThis.document;
  globalThis.document = { createElement: () => new RasterCanvas() };
  try {
    return fn();
  } finally {
    globalThis.document = old;
  }
}
function hash(canvas) {
  let h = 2166136261;
  for (const p of canvas.pixels) h = Math.imul(h ^ Math.round(p * 255), 16777619);
  return h >>> 0;
}

function unitState() {
  // Explicit native-unit setup, never evidence of a natural story playthrough.
  const s = createSimulation(61);
  Object.assign(s.player, { x: b.entry.x, y: b.entry.y, z: 0, groundZ: 0, vehicleId: null });
  return s;
}
function enter() {
  const s = unitState();
  const result = enterInterior(s, IMPOUND_ANNEX_PORTAL.id, {
    world: WORLD,
    isBlocked: terrain.isBlocked,
    hasLineOfSight: terrain.hasLineOfSight,
  });
  assert.equal(result.ok, true);
  return s;
}
function people() {
  return [
    { ...structuredClone(b.actorSpawns.yara), health: 100, z: 0, eyeHeight: 14 },
    { id: 'LL-CHAR-002', x: 36, y: 144, z: 0, sceneId: 'impound-annex', health: 100 },
    { ...structuredClone(b.actorSpawns.reeve), ...b.actorMarks.reeveReview, health: 100, z: 0 },
  ];
}
function actorsState(actors = people()) {
  return {
    player: { ...b.parkingBay.pose, health: 100, vehicleId: 'arc-arrival-taxi', eyeHeight: 8 },
    vehicles: [],
    pedestrians: [],
    police: [],
    hostiles: [],
    companions: { actors },
    interior: { active: null, rooms: {} },
    campaignRuntime: {
      sceneProps: { [LATE_METER_CLIPBOARD.id]: structuredClone(LATE_METER_CLIPBOARD) },
    },
  };
}
function audioContext(actors, room = createImpoundAnnexGeometry()) {
  return {
    getActor: (id) => actors.find((a) => a.id === id),
    hasExteriorLineOfSight: terrain.hasLineOfSight,
    hasInteriorLineOfSight: (id, a, c) => id === 'impound-annex' && room.hasLineOfSight(a, c),
  };
}
function footPath(path, geometry = terrain) {
  const actor = { ...path[0], groundZ: path[0].z ?? 0, health: 100 },
    movement = createSurfaceMovement(geometry);
  for (let i = 1; i < path.length; i++) {
    const p = path[i],
      count = Math.max(1, Math.ceil(Math.hypot(p.x - actor.x, p.y - actor.y))),
      dx = (p.x - actor.x) / count,
      dy = (p.y - actor.y) / count;
    for (let n = 0; n < count; n++)
      assert.equal(movement.moveBody(actor, dx, dy, 7), false, JSON.stringify({ actor, p }));
    assert.ok(Math.hypot(actor.x - p.x, actor.y - p.y) < 1e-8);
  }
  return actor;
}
function carBlocked(p, car, radius = 7) {
  const spec = VEHICLE_SPECS[car.spec],
    c = Math.cos(car.angle),
    s = Math.sin(car.angle),
    dx = p.x - car.x,
    dy = p.y - car.y,
    x = dx * c + dy * s,
    y = -dx * s + dy * c;
  return (
    Math.hypot(
      x - Math.max(-spec.length / 2, Math.min(spec.length / 2, x)),
      y - Math.max(-spec.width / 2, Math.min(spec.width / 2, y)),
    ) < radius
  );
}
function simpleWorld(extra = {}) {
  return {
    width: 1000,
    height: 1000,
    bounds: { left: 0, top: 0, right: 1000, bottom: 1000 },
    buildings: [],
    obstacles: [],
    roads: [],
    water: [],
    ...extra,
  };
}

test('annex geometry is checked against the published physical city and keeps the real precinct anchor', () => {
  assert.equal(LATE_METER_SCENE_REPORT.ready, true);
  assert.deepEqual(LATE_METER_SCENE_REPORT.issues, []);
  assert.equal(b.siteId, 'LL-CITY-LOC059');
  assert.equal(b.hostBuildingId, 'block-0-0-0');
  assert.equal(IMPOUND_ANNEX_LAYOUT.width, 180);
  assert.equal(IMPOUND_ANNEX_LAYOUT.height, 220);
  assert.deepEqual(
    IMPOUND_ANNEX_LAYOUT.actors,
    [],
    'canonical principals must not have room proxy duplicates',
  );
  assert.equal(
    LATE_METER_SCENE_REPORT.runtimeReady,
    false,
    'scene metadata alone is not playable Late Meter',
  );
  assert.ok(LATE_METER_SCENE_REPORT.requiredHandlers.some((h) => h.includes('driver/seat0')));
});
test('world amendments preserve every original coast, road, building and site record without mutation', () => {
  const source = createNightCrossingWorld(CITY_BLUEPRINT).world,
    before = JSON.stringify(source),
    candidate = createLateMeterWorld(source);
  assert.equal(JSON.stringify(source), before);
  for (const key of [
    'buildings',
    'sites',
    'landforms',
    'lakes',
    'water',
    'waterVolumes',
    'decks',
    'districts',
  ])
    assert.equal(candidate.world[key], source[key]);
  for (const key of ['roads', 'obstacles', 'locations'])
    for (let i = 0; i < source[key].length; i++)
      assert.equal(candidate.world[key][i], source[key][i]);
  assert.equal(
    candidate.world.campaignSceneBindings.dispatch,
    source.campaignSceneBindings.dispatch,
  );
  assert.throws(() => createLateMeterWorld(candidate.world), /already/);
  assert.throws(
    () => createLateMeterWorld({ roads: [], buildings: [], sites: [] }),
    /actual Old Quay/,
  );
});
test('all authored foot approaches and the real door-to-passenger route traverse in both directions', () => {
  for (const path of [
    b.collectorApproaches.east.path,
    b.collectorApproaches.north.path,
    b.felixDoorToTaxi,
    b.pursuerDriverPath,
  ]) {
    footPath(path);
    footPath([...path].reverse());
  }
  const cars = [{ ...b.parkingBay.pose, spec: 'taxi' }, { ...b.pursuerSpawn }];
  for (const path of [
    b.felixDoorToTaxi,
    b.pursuerDriverPath,
    b.collectorApproaches.east.path,
    b.collectorApproaches.north.path,
  ])
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        p = path[i],
        n = Math.max(1, Math.ceil(Math.hypot(p.x - a.x, p.y - a.y) * 2));
      for (let j = 0; j <= n; j++) {
        const q = { x: a.x + ((p.x - a.x) * j) / n, y: a.y + ((p.y - a.y) * j) / n };
        for (const car of cars) assert.equal(carBlocked(q, car), false, JSON.stringify({ q, car }));
      }
    }
});
test('full taxi and sedan bodies clear their continuous entry, reverse exit and departure sweeps', () => {
  for (const [path, spec] of [
    [b.taxiApproach, VEHICLE_SPECS.taxi],
    [b.taxiExit, VEHICLE_SPECS.taxi],
    [b.pursuerDeparture, VEHICLE_SPECS.sedan],
  ]) {
    assert.equal(
      checkLateMeterVehicleSweep(WORLD, path, { ...spec, height: 16 }, { terrain }).clear,
      true,
    );
  }
  const pose = b.parkingBay.pose,
    spec = VEHICLE_SPECS.taxi;
  for (const x of [-spec.length / 2, spec.length / 2])
    for (const y of [-spec.width / 2, spec.width / 2]) {
      const px = pose.x + x * Math.cos(pose.angle) - y * Math.sin(pose.angle),
        py = pose.y + x * Math.sin(pose.angle) + y * Math.cos(pose.angle),
        bay = b.parkingBay;
      assert.ok(px >= bay.x && px <= bay.x + bay.w && py >= bay.y && py <= bay.y + bay.h);
    }
});
test('sweeps reject body-corner, mid-chord and rotation-only blockers missed by center checks', () => {
  const dimensions = { length: 29, width: 15, height: 16 },
    corner = simpleWorld({
      obstacles: [{ id: 'corner', x: 214.2, y: 507.2, w: 0.2, h: 0.2, height: 20 }],
    }),
    p = { x: 200, y: 500, z: 0, angle: 0 };
  assert.equal(createTerrain(corner).isBlocked(p.x, p.y, 15 * 0.62, 0), false);
  assert.equal(
    checkLateMeterVehicleSweep(corner, [p, { ...p, x: 200.01 }], dimensions).clear,
    false,
  );
  const chord = simpleWorld({
    obstacles: [{ id: 'narrow', x: 230, y: 507, w: 0.1, h: 0.2, height: 20 }],
  });
  assert.equal(checkLateMeterVehicleSweep(chord, [p, { ...p, x: 260 }], dimensions).clear, false);
  const rotating = simpleWorld({
    obstacles: [{ id: 'turn-corner', x: 210.2, y: 510.2, w: 0.1, h: 0.1, height: 20 }],
  });
  assert.equal(
    checkLateMeterVehicleSweep(rotating, [p, { ...p, angle: Math.PI / 2 }], dimensions).clear,
    false,
  );
});
test('sweeps check the whole vertical interval, bounds and actual unsupported water', () => {
  const dimensions = { length: 29, width: 15, height: 16 },
    path = [
      { x: 200, y: 500, z: 0 },
      { x: 260, y: 500, z: 0 },
    ],
    beam = (z) =>
      simpleWorld({
        obstacles: [{ id: 'thin-beam', x: 220, y: 480, w: 20, h: 40, z, height: 0.1 }],
      });
  assert.equal(createTerrain(beam(1.55)).isBlocked(230, 500, 7, 0), false);
  assert.equal(checkLateMeterVehicleSweep(beam(1.55), path, dimensions).clear, false);
  assert.equal(checkLateMeterVehicleSweep(beam(16.01), path, dimensions).clear, true);
  assert.equal(
    checkLateMeterVehicleSweep(
      simpleWorld(),
      [
        { x: 10, y: 10 },
        { x: 10, y: 30 },
      ],
      dimensions,
    ).clear,
    false,
  );
  const wet = simpleWorld({
    landforms: [
      {
        id: 'land',
        polygon: [
          [0, 0],
          [1000, 0],
          [1000, 1000],
          [0, 1000],
        ],
      },
    ],
    lakes: [{ id: 'lake', x: 220, y: 480, w: 20, h: 40 }],
  });
  assert.equal(checkLateMeterVehicleSweep(wet, path, dimensions).clear, false);
  assert.throws(
    () => checkLateMeterVehicleSweep(simpleWorld(), path, { ...dimensions, height: NaN }),
    /dimensions/,
  );
  assert.throws(
    () =>
      checkLateMeterVehicleSweep(
        simpleWorld(),
        [
          { x: NaN, y: 0 },
          { x: 0, y: 0 },
        ],
        dimensions,
      ),
    /pose/,
  );
});
test('lookout has real unobstructed views of both approaches and the clerk intercom window', () => {
  const eye = { ...b.parkingBay.pose, health: 100, eyeHeight: 8 };
  for (const p of [
    b.actorMarks.reeveReview,
    { x: 410, y: 397, z: 20 },
    { x: 231, y: 300, z: 20 },
    b.serviceWindow.exterior,
  ])
    assert.equal(terrain.hasLineOfSight(eye, p), true);
  assert.equal(
    terrain.hasLineOfSight(eye, { x: 293, y: 310, z: 14 }),
    false,
    'the preserved precinct still occludes its actual body',
  );
  assert.equal(b.observation.observationWindowSeconds, 45);
  assert.equal(b.observation.requiresExplicitRecognition, true);
  const review = b.collectorApproaches.east.clipboardReview,
    path = b.collectorApproaches.east.path,
    index = path.indexOf(review);
  const remaining =
    path
      .slice(index + 1)
      .reduce(
        (sum, p, i) => sum + Math.hypot(p.x - path[index + i].x, p.y - path[index + i].y),
        0,
      ) / b.collectorApproaches.east.speed;
  const firstEligibleX =
      b.parkingBay.pose.x +
      Math.sqrt(b.observation.recognitionRange ** 2 - (review.y - b.parkingBay.pose.y) ** 2),
    beforeReview = (firstEligibleX - review.x) / b.collectorApproaches.east.speed;
  assert.equal(review.dwellSeconds, 15);
  assert.ok(
    beforeReview + review.dwellSeconds + remaining >= 18,
    'first eligible recognition has the authored warning window',
  );
  assert.ok(
    review.dwellSeconds + remaining >= 18,
    'the first front-facing clipboard review gives the full warning window',
  );
  assert.ok(
    review.dwellSeconds - 4 + remaining < 18,
    'hesitating at the review still risks the actual earlier-door failure',
  );
});
test('actual room portal, native movement, physical exit and saves use the dedicated annex', () => {
  const s = enter(),
    initialMoney = s.player.money;
  assert.equal(s.interior.active.roomId, 'impound-annex');
  for (let n = 0; n < 54; n++) updateSimulation(s, 1 / 60, { moveY: -1 });
  for (let n = 0; n < 63; n++) updateSimulation(s, 1 / 60, { moveX: -1 });
  assert.ok(Math.hypot(s.player.x - b.counterTarget.x, s.player.y - b.counterTarget.y) < 8);
  assert.equal(isInteriorBlocked(s, 36, 172, 7), true, 'the counter is physical');
  const saved = restoreGame(saveGame(s));
  assert.equal(saved.interior.active.roomId, 'impound-annex');
  assert.equal(saved.player.money, initialMoney);
  for (let n = 0; n < 63; n++) updateSimulation(s, 1 / 60, { moveX: 1 });
  for (let n = 0; n < 160 && s.interior.active; n++) updateSimulation(s, 1 / 60, { moveY: 1 });
  assert.equal(s.interior.active, null);
  assert.ok(Math.hypot(s.player.x - b.entry.x, s.player.y - b.entry.y) < 2);
});
test('local geometry agrees with the registered shared room, including closed door and exit apron', () => {
  const s = enter();
  for (const open of [true, false]) {
    assert.equal(setInteriorDoor(s, 'front-door', { open }), true);
    const q = createImpoundAnnexGeometry({ doorOpen: open });
    for (const x of [7, 36, 63, 70, 90, 120, 165, 175])
      for (const y of [7, 24, 94, 144, 164, 184, 205, 214, 224, 244])
        for (const z of [0, 14, 24, 70])
          assert.equal(
            q.isBlocked(x, y, 7, z),
            isInteriorBlocked(s, x, y, 7, z),
            JSON.stringify({ open, x, y, z }),
          );
  }
  footPath(b.interiorCounterPath, createImpoundAnnexGeometry());
});
test('intercom perception follows actual living room bodies and both real scene rays', () => {
  const actors = people(),
    s = actorsState(actors),
    context = audioContext(actors),
    observer = s.player;
  assert.deepEqual(impoundAudibility(s, WORLD, observer, context).speakers, [
    'LL-ARC-YARA',
    'LL-CHAR-002',
  ]);
  assert.equal(impoundAudibility(s, WORLD, { ...observer, y: 590 }, context).audible, false);
  assert.equal(
    impoundAudibility(s, WORLD, { ...observer, x: 293, y: 310 }, context).audible,
    false,
  );
  assert.equal(
    impoundAudibility(s, WORLD, observer, { ...context, intercomEnabled: false }).audible,
    false,
  );
  assert.equal(impoundAudibility(s, WORLD, observer, {}).audible, false);
  actors[0].health = 0;
  assert.deepEqual(impoundAudibility(s, WORLD, observer, context).speakers, ['LL-CHAR-002']);
  actors[1].sceneId = 'voss-dispatch';
  assert.equal(impoundAudibility(s, WORLD, observer, context).audible, false);
  assert.equal(
    impoundAudibility(s, WORLD, observer, { ...context, hasInteriorLineOfSight: () => false })
      .audible,
    false,
  );
});
test('clipboard is one authoritative held or dropped prop, with no phantom default or duplicate principal', () => {
  const s = actorsState(),
    reeve = s.companions.actors.find((a) => a.id === 'LL-ARC-REEVE'),
    before = JSON.stringify(s);
  const descriptors = lateMeterPropDescriptors(s);
  assert.equal(descriptors.length, 1);
  assert.equal(descriptors[0].ownerActorId, reeve.id);
  assert.equal(JSON.stringify(s), before);
  const oldPose = descriptors[0];
  reeve.x += 20;
  assert.equal(lateMeterPropDescriptors(s)[0].x - oldPose.x, 20);
  reeve.health = 0;
  assert.deepEqual(lateMeterPropDescriptors(s), []);
  reeve.health = 100;
  reeve.inVehicle = true;
  assert.deepEqual(lateMeterPropDescriptors(s), []);
  reeve.inVehicle = false;
  const prop = s.campaignRuntime.sceneProps[LATE_METER_CLIPBOARD.id];
  Object.assign(prop, { state: 'dropped', ownerActorId: null, x: 300, y: 400, z: 0, angle: 0 });
  assert.equal(lateMeterPropDescriptors(s).length, 1);
  delete s.campaignRuntime.sceneProps[LATE_METER_CLIPBOARD.id];
  assert.deepEqual(lateMeterPropDescriptors(s), []);
  assert.equal(lateMeterClipboardPose(reeve, null), null);
  s.companions.actors.push({ ...s.companions.actors[0] });
  assert.equal(impoundWindowActor(s, WORLD), null, 'ambiguous duplicate Yara bodies fail closed');
});
test('native frontage shows the actual clerk, and removes that view when she leaves or dies', () =>
  withCanvas(() => {
    const s = actorsState(),
      a = createLateMeterRenderer(game(), WORLD),
      r = renderer();
    a.drawGround(r, s);
    a.draw(r, s);
    r.flush();
    assert.equal(a.stats.windowViews, 1);
    const occupied = hash(r.ctx.canvas);
    assert.ok(a.stats.frontage === 2 && a.stats.bayMarks > 0);
    s.companions.actors[0].y = 100;
    const q = renderer();
    a.draw(q, s);
    q.flush();
    assert.equal(a.stats.windowViews, 0);
    assert.notEqual(hash(q.ctx.canvas), occupied);
    s.companions.actors[0].y = 194;
    s.companions.actors[0].health = 0;
    assert.equal(impoundWindowActor(s, WORLD), null);
    a.dispose();
    assert.throws(() => a.draw(r, s), /disposed/);
  }));
test('native grey jacket, tow badge and carried board are distinct physical visual details', () =>
  withCanvas(() => {
    const s = actorsState(),
      actor = s.companions.actors[2],
      r = renderer(),
      appearance = actor.appearance,
      rig = new E.Humanoid({ ...appearance, weapon: null });
    rig.update(1 / 60, { x: actor.x, y: actor.y, z: 0, facing: actor.angle, vx: 0, vy: 0 });
    r.actor(actor.x, actor.y, 0, (g, x, y) => {
      rig.draw(g, x, y, r.view);
      drawLateMeterClothingMarks(r, g, actor);
    });
    r.flush();
    const jacket = hash(r.ctx.canvas);
    const pose = { ...lateMeterPropDescriptors(s)[0], state: 'carried' };
    assert.equal(drawLateMeterClipboard(r, r.ctx, pose), true);
    assert.notEqual(hash(r.ctx.canvas), jacket);
    assert.equal(
      drawLateMeterClothingMarks(r, r.ctx, {
        ...actor,
        appearance: LATE_METER_APPEARANCES.watcher,
      }),
      0,
    );
    assert.equal(drawLateMeterClipboard(r, r.ctx, { x: NaN, y: 0 }), false);
  }));

test('actual taxi throttle/steering parks and reverses out without pose or health resets', () => {
  // Initial native-physics fixture isolates the authored bay from moving city
  // traffic. Every subsequent pose and speed comes from ordinary simulation inputs.
  const s = createSimulation(61),
    car = s.vehicles.find((v) => v.id === 'starter-taxi');
  Object.assign(car, { ...b.taxiApproach[0], z: 0, groundZ: 0, speed: 0, occupied: true });
  Object.assign(s.player, { x: car.x, y: car.y, z: 0, groundZ: 0, vehicleId: car.id });
  s.vehicles = [car];
  s.pedestrians = [];
  s.police = [];
  const initialHealth = car.health;
  const drive = (path, reverse) => {
    let index = 1,
      finished = false;
    const trace = [{ x: car.x, y: car.y, z: car.z, angle: car.angle }],
      goal = path.at(-1);
    for (let frame = 0; frame < 1100; frame++) {
      while (
        index < path.length - 1 &&
        Math.hypot(car.x - path[index].x, car.y - path[index].y) < 4
      )
        index++;
      const remaining = Math.hypot(car.x - goal.x, car.y - goal.y);
      if (remaining < 2.5) {
        for (let n = 0; n < 90; n++) updateSimulation(s, 1 / 60, { brake: true });
        finished = true;
        break;
      }
      const target = path[Math.min(path.length - 1, index + 3)],
        desired = Math.atan2(target.y - car.y, target.x - car.x) + (reverse ? Math.PI : 0),
        error = Math.atan2(Math.sin(desired - car.angle), Math.cos(desired - car.angle)),
        limit = Math.min(reverse ? 12 : 18, Math.max(4, remaining * 1.3)),
        steer = error * (reverse ? -1 : 1);
      updateSimulation(s, 1 / 60, {
        forward: !reverse && car.speed < limit - 1,
        backward: reverse && car.speed > -limit + 1,
        brake: Math.abs(car.speed) > limit + 2,
        right: steer > 0.04,
        left: steer < -0.04,
      });
      trace.push({ x: car.x, y: car.y, z: car.z, angle: car.angle });
    }
    assert.equal(finished, true, JSON.stringify({ car, goal, index }));
    assert.equal(
      checkLateMeterVehicleSweep(WORLD, trace, { ...VEHICLE_SPECS.taxi, height: 16 }, { terrain })
        .clear,
      true,
    );
  };
  drive(b.taxiApproach, false);
  assert.ok(
    Math.abs(
      Math.atan2(
        Math.sin(car.angle - b.parkingBay.angle),
        Math.cos(car.angle - b.parkingBay.angle),
      ),
    ) < b.parkingBay.angleTolerance,
  );
  assert.ok(Math.abs(car.speed) < 0.2);
  drive(b.taxiExit, true);
  assert.ok(s.progress.distanceDriven > 100);
  assert.equal(car.health, initialHealth);
});

test('badge and clipboard rebase into the actual glyph-local actor origin', () =>
  withCanvas(() => {
    const s = actorsState(),
      actor = s.companions.actors[2],
      world = renderer(),
      glyph = new RasterCanvas();
    glyph.width = 100;
    glyph.height = 100;
    const g = glyph.getContext('2d'),
      origin = [50, 80];
    assert.equal(drawLateMeterClothingMarks(world, g, actor, { origin }), 1);
    assert.ok(
      glyph.pixels.some((x, i) => i % 4 === 3 && x > 0),
      'a world-projected badge must land in the glyph, not offscreen',
    );
    const badgeOnly = hash(glyph),
      pose = lateMeterPropDescriptors(s)[0];
    assert.equal(
      drawLateMeterClipboard(world, g, pose, LATE_METER_CLIPBOARD, { actor, origin }),
      true,
    );
    assert.notEqual(hash(glyph), badgeOnly);
    assert.equal(
      drawLateMeterClipboard(world, g, pose, LATE_METER_CLIPBOARD, { origin }),
      false,
      'origin mapping requires the authoritative owner body',
    );
  }));

test('registered annex renders its authored room sign without an undefined label', () =>
  withCanvas(() => {
    const s = enter(),
      r = renderer(new E.View('room', 'Room', 0, 74, 1.5), {
        x: 90,
        y: 110,
        width: 480,
        height: 420,
      }),
      rooms = createInteriorRenderer(game(), VEHICLE_SPECS),
      originalText = E.font.text,
      labels = [];
    E.font.text = function (g, text, ...args) {
      labels.push(text);
      return originalText.call(this, g, text, ...args);
    };
    try {
      rooms.draw(r, s);
      r.flush();
    } finally {
      E.font.text = originalText;
      rooms.dispose();
    }
    assert.ok(labels.includes('IMPOUND RELEASES'));
    assert.ok(labels.every((text) => typeof text === 'string' && !text.includes('UNDEFINED')));
  }));

test('room-specific printer, files and invoice art follows real saved prop destruction', () =>
  withCanvas(() => {
    const s = enter(),
      scene = createLateMeterRenderer(game(), WORLD),
      intact = renderer(new E.View('room', 'Room', 0, 74, 1.5), {
        x: 90,
        y: 110,
        width: 480,
        height: 420,
      });
    scene.drawRoomDetails(intact, s);
    intact.flush();
    assert.equal(scene.stats.roomDetails, 5);
    const before = hash(intact.ctx.canvas);
    for (const id of [
      'release-counter',
      'duplicate-printer',
      'release-file-rack',
      'public-form-table',
    ])
      assert.equal(damageInteriorProp(s, id, 100), true);
    const broken = renderer(new E.View('room', 'Room', 0, 74, 1.5), {
      x: 90,
      y: 110,
      width: 480,
      height: 420,
    });
    scene.drawRoomDetails(broken, s);
    broken.flush();
    assert.equal(scene.stats.roomDetails, 1);
    assert.notEqual(
      hash(broken.ctx.canvas),
      before,
      'destroyed furniture must not retain floating detail art',
    );
  }));

test('authored spawn metadata never substitutes for an actual living principal', () => {
  const actors = [structuredClone(b.actorSpawns.yara), structuredClone(b.actorSpawns.reeve)],
    s = actorsState(actors);
  assert.equal(impoundWindowActor(s, WORLD), null);
  assert.equal(impoundAudibility(s, WORLD, s.player, audioContext(actors)).audible, false);
  assert.deepEqual(lateMeterPropDescriptors(s), []);
});

test('saved local geometry preserves actual destruction and rejects corrupt collision state', () => {
  assert.equal(createImpoundAnnexGeometry().isBlocked(36, 172, 7), true);
  assert.equal(
    createImpoundAnnexGeometry({ propHealth: { 'release-counter': { health: 0 } } }).isBlocked(
      36,
      172,
      7,
    ),
    false,
  );
  assert.equal(
    createImpoundAnnexGeometry({ propHealth: { 'release-counter': 0 } }).isBlocked(36, 172, 7),
    false,
  );
  assert.throws(
    () => createImpoundAnnexGeometry({ propHealth: { 'release-counter': { health: NaN } } }),
    /health/,
  );
  assert.throws(() => createImpoundAnnexGeometry({ doorOpen: 'yes' }), /geometry state/);
});
