import test from 'node:test';
import assert from 'node:assert/strict';
import '../my-3d2dge.js';
import { RasterCanvas } from './helpers/raster-canvas.mjs';
import { CITY_BLUEPRINT } from '../src/city-blueprint.js';
import { createTerrain } from '../src/terrain.js';
import { createSurfaceMovement } from '../src/surface-movement.js';
import { createSceneContext } from '../src/scene-context.js';
import {
  createNightCrossingWorld,
  DOCKSIDE_ROOM_LAYOUT,
  DOCKSIDE_PORTAL,
  nightCrossingProps,
  drawNightCrossingProps,
  createNightCrossingRenderer,
} from '../src/campaign/scenes.js';
import {
  enterInterior,
  interiorActors,
  isInteriorBlocked,
  setInteriorDoor,
  nearestInteriorInteractable,
  interactInterior,
  saveInteriorState,
  restoreInteriorState,
} from '../src/interiors.js';
import { createInteriorRenderer, sceneRenderState } from '../src/interior-renderer.js';
import { createRoomMap } from '../src/room-map.js';
const E = globalThis.My3D2dge;
const candidate = createNightCrossingWorld(CITY_BLUEPRINT),
  { world, bindings, report } = candidate;
const terrain = createTerrain(world),
  movement = createSurfaceMovement(terrain);
function state() {
  return {
    time: 12,
    player: {
      x: 129,
      y: 308,
      z: 0,
      groundZ: 0,
      angle: 0,
      health: 100,
      money: 240,
      armour: 0,
      stamina: 100,
      vehicleId: null,
    },
    vehicles: [],
    pedestrians: [],
    police: [],
    hostiles: [],
    policeAircraft: [],
    bullets: [],
    fires: [],
    ordnance: [],
    pickups: [],
    combatEffects: [],
    wanted: { level: 0, observed: false },
    scene: { kind: 'exterior', id: 'harbor-city' },
  };
}
function entered() {
  const s = state();
  assert.equal(
    enterInterior(s, DOCKSIDE_PORTAL.id, {
      world,
      isBlocked: terrain.isBlocked,
      hasLineOfSight: terrain.hasLineOfSight,
    }).ok,
    true,
  );
  return s;
}
function traverse(path, radius = 7, car = false) {
  const a = { ...path[0], groundZ: path[0].z, ...(car ? { spec: 'taxi' } : {}) };
  for (let i = 1; i < path.length; i++) {
    const p = path[i],
      n = Math.ceil(Math.hypot(p.x - a.x, p.y - a.y)),
      dx = (p.x - a.x) / n,
      dy = (p.y - a.y) / n;
    for (let j = 0; j < n; j++)
      assert.equal(movement.moveBody(a, dx, dy, radius), false, JSON.stringify({ a, p }));
    assert.ok(Math.hypot(a.x - p.x, a.y - p.y) < 0.01);
    assert.ok(Math.abs(a.z - p.z) < 0.75);
  }
  return a;
}
function renderer(
  view = new E.View('iso', 'ISO', 45, 40, 1),
  { x = 1600, y = 720, width = 640, height = 480, live = false } = {},
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
    ix: Math.floor(origin[0]) - 80,
    iy: Math.floor(origin[1]) - 80,
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

test('scene amendments preserve every existing protected geometry record and actual source anchors', () => {
  assert.equal(report.ready, true);
  assert.deepEqual(report.issues, []);
  for (const key of ['buildings', 'sites', 'landforms', 'water', 'districts'])
    assert.equal(world[key], CITY_BLUEPRINT[key]);
  for (const key of ['roads', 'decks', 'obstacles', 'locations'])
    for (let i = 0; i < (CITY_BLUEPRINT[key]?.length ?? 0); i++)
      assert.equal(world[key][i], CITY_BLUEPRINT[key][i]);
  for (const [id, siteId] of [
    ['pier-berth', 'LL-CITY-LOC137'],
    ['dockside-rooms', 'LL-CITY-LOC054'],
    ['fairground', 'LL-CITY-LOC131'],
  ]) {
    assert.equal(bindings[id].siteId, siteId);
    assert.equal(bindings[id].ready, true);
  }
  assert.throws(() => createNightCrossingWorld(world), /already/);
});

test('radius7 feet traverse both directions across the real graded ferry gangway and both taxi door approaches', () => {
  const b = bindings['pier-berth'];
  for (const path of [b.gangway, b.apronWaypoints, b.driverWaypoints, b.siteAccessPath]) {
    traverse(path);
    traverse([...path].reverse());
  }
  assert.equal(terrain.isWater(1790, 800, { ignoreDeck: true }), true);
  assert.equal(terrain.isBlocked(1790, 800, 7, 4.88), false);
  assert.equal(terrain.isBlocked(1848, 800, 7, 6), true);
  assert.ok(world.roads.find((r) => r.id === 'arrival-gangway').grade < 0.05);
});
test('both actual taxi door approaches clear the solid parked taxi throughout their swept foot paths', () => {
  const b = bindings['pier-berth'],
    car = b.taxiSpawn,
    c = Math.cos(car.angle),
    s = Math.sin(car.angle);
  const vehicleTerrain = {
    ...terrain,
    isBlocked(x, y, r, z) {
      if (terrain.isBlocked(x, y, r, z)) return true;
      if (z < -4 || z >= 16) return false;
      const dx = x - car.x,
        dy = y - car.y,
        a = dx * c + dy * s,
        d = -dx * s + dy * c;
      return (
        Math.hypot(a - Math.max(-14.5, Math.min(14.5, a)), d - Math.max(-7.5, Math.min(7.5, d))) < r
      );
    },
  };
  const walk = createSurfaceMovement(vehicleTerrain);
  for (const path of [b.apronWaypoints, b.driverWaypoints]) {
    const actor = { ...path[0], groundZ: path[0].z };
    for (const target of path.slice(1)) {
      const length = Math.hypot(target.x - actor.x, target.y - actor.y),
        steps = Math.ceil(length),
        dx = (target.x - actor.x) / steps,
        dy = (target.y - actor.y) / steps;
      for (let i = 0; i < steps; i++) assert.equal(walk.moveBody(actor, dx, dy, 7), false);
      assert.ok(Math.hypot(actor.x - target.x, actor.y - target.y) < 1e-5);
    }
  }
});

test('arrival and sheltered two-car bays are naturally driveable on dry ground with clear exterior exits', () => {
  traverse(
    [
      { x: 1690, y: 960, z: 0 },
      { x: 1690, y: 920, z: 0 },
    ],
    12,
    true,
  );
  for (const y of [270, 310]) {
    traverse(
      [
        { x: 180, y: 310, z: 0 },
        { x: 147, y: 310, z: 0 },
        { x: 147, y, z: 0 },
      ],
      12,
      true,
    );
    traverse([
      { x: 129, y, z: 0 },
      { x: 129, y: 308, z: 0 },
    ]);
  }
  for (const p of [bindings.fairground.target, bindings.dispatch.target])
    assert.equal(terrain.isBlocked(p.x, p.y, 12, 0), false);
  traverse(
    [
      { x: 1690, y: 920, z: 0 },
      { x: 1690, y: 960, z: 0 },
      { x: 180, y: 960, z: 0 },
      { x: 180, y: 1088, z: 0 },
      { x: 147, y: 1088, z: 0 },
      { x: 180, y: 1088, z: 0 },
      { x: 180, y: 700, z: 0 },
      { x: 440, y: 700, z: 0 },
      { x: 440, y: 748, z: 0 },
      { x: 440, y: 700, z: 0 },
      { x: 180, y: 700, z: 0 },
      { x: 180, y: 310, z: 0 },
      { x: 147, y: 310, z: 0 },
    ],
    12,
    true,
  );
  const canopy = world.obstacles.find((o) => o.id === 'dockside-canopy-roof');
  assert.equal(canopy.z, 40);
  assert.equal(canopy.traversable, false);
  assert.equal(terrain.isBlocked(147, 270, 12, 0), false);
  assert.equal(terrain.isBlocked(147, 270, 7, 40), true);
  // Axis-aligned body bounds of north/south taxis fit the marked bays and clear the facade/traffic lane.
  for (const s of bindings['dockside-rooms'].parkingBay.spaces) {
    assert.ok(s.w >= 15 + 4);
    assert.ok(s.h >= 29 + 4);
    assert.ok(s.x + s.w / 2 - 7.5 > 116);
    assert.ok(s.x + s.w / 2 + 7.5 < 157.5);
  }
});

test('Dockside is the actual240x220 portal room with no duplicate canonical companion bodies', () => {
  const s = entered();
  assert.equal(s.interior.active.roomId, 'dockside-rooms');
  assert.equal(DOCKSIDE_ROOM_LAYOUT.width, 240);
  assert.equal(DOCKSIDE_ROOM_LAYOUT.height, 220);
  assert.deepEqual(interiorActors(s), []);
  assert.equal(bindings['dockside-rooms'].actorSpawns.nadia.id, 'LL-CHAR-008');
  assert.equal(bindings['dockside-rooms'].felixTarget.id, 'LL-CHAR-002');
  assert.equal(terrain.isBlocked(129, 308, 7, 0), false);
  assert.equal(terrain.isBlocked(110, 308, 7, 0), true);
});

test('every actual home service and reunion spot has a radius7 local approach through physical furniture', () => {
  const s = entered(),
    q = [{ x: 122, y: 184 }],
    seen = new Set(['122,184']);
  for (let i = 0; i < q.length; i++)
    for (const [dx, dy] of [
      [4, 0],
      [-4, 0],
      [0, 4],
      [0, -4],
    ]) {
      const p = { x: q[i].x + dx, y: q[i].y + dy },
        k = `${p.x},${p.y}`;
      if (
        !seen.has(k) &&
        p.x > 0 &&
        p.x < 240 &&
        p.y > 0 &&
        p.y < 220 &&
        !isInteriorBlocked(s, p.x, p.y, 7, 0)
      ) {
        seen.add(k);
        q.push(p);
      }
    }
  for (const p of [
    ...DOCKSIDE_ROOM_LAYOUT.hooks,
    bindings['dockside-rooms'].actorSpawns.nadia,
    bindings['dockside-rooms'].felixTarget,
  ])
    assert.ok(
      q.some((a) => Math.hypot(a.x - p.x, a.y - p.y) < 4),
      p.id,
    );
  const ctx = createSceneContext(world);
  for (const p of [
    bindings['dockside-rooms'].actorSpawns.nadia,
    bindings['dockside-rooms'].felixTarget,
  ])
    assert.equal(ctx.queries(s, 'dockside-rooms').isBlocked(p.x, p.y, 7, 0), false);
});

test('home hooks cannot claim success without a committed explicit handler result', () => {
  const s = entered();
  for (const hook of DOCKSIDE_ROOM_LAYOUT.hooks) {
    Object.assign(s.player, { x: hook.x, y: hook.y });
    assert.equal(nearestInteriorInteractable(s)?.id, hook.id);
    assert.equal(interactInterior(s).ok, false);
    assert.equal(interactInterior(s, { onHook() {} }).ok, false);
    assert.equal(interactInterior(s, { onHook: () => ({ pending: true }) }).ok, false);
    assert.equal(interactInterior(s, { onHook: () => ({ ok: false }) }).ok, false);
    assert.equal(interactInterior(s, { onHook: () => ({ ok: true }) }).ok, true);
    assert.equal(s.interior.rooms['dockside-rooms'].hookCalls[hook.id], 1);
  }
  assert.equal(
    DOCKSIDE_ROOM_LAYOUT.hooks.find((h) => h.id === 'dockside-ledger').service,
    'evidence',
  );
});

test('room doors and hooks survive saved continuation while canonical NPCs remain companion owned', () => {
  const s = entered();
  setInteriorDoor(s, 'front-door', { open: true });
  const snapshot = saveInteriorState(s),
    restored = state();
  restoreInteriorState(restored, snapshot, { world });
  assert.equal(restored.interior.active.roomId, 'dockside-rooms');
  assert.equal(restored.interior.rooms['dockside-rooms'].doors['front-door'].open, true);
  assert.deepEqual(interiorActors(restored), []);
});

test('the one duffel follows the authoritative scene prop pose and never defaults after the registry exists', () => {
  const s = state();
  assert.equal(nightCrossingProps(s).length, 1);
  s.campaignRuntime = { sceneProps: {} };
  assert.equal(nightCrossingProps(s).length, 0);
  s.campaignRuntime.sceneProps['arrival-duffel'] = {
    id: 'arrival-duffel',
    kind: 'duffel',
    sceneId: 'dockside-rooms',
    x: 30,
    y: 134,
    z: 0,
    visible: true,
  };
  assert.equal(nightCrossingProps(s).length, 0);
  assert.equal(nightCrossingProps(s, 'dockside-rooms').length, 1);
  s.campaignRuntime.sceneProps['arrival-duffel'].visible = false;
  assert.equal(nightCrossingProps(s, 'dockside-rooms').length, 0);
});

test('native ferry floors precede queued structures, actual cabin windows/duffel render, and offscreen structures are culled', () => {
  const s = state(),
    r = renderer(),
    art = createNightCrossingRenderer(game(), world);
  art.drawGround(r, s);
  assert.ok(r.ctx.fills > 0);
  assert.equal(r.queued.length, 0);
  art.draw(r, s);
  assert.ok(art.stats.structures >= 6);
  assert.equal(art.stats.props, 1);
  const before = hash(r.ctx.canvas);
  r.flush();
  assert.notEqual(hash(r.ctx.canvas), before);
  const windowColor = E.hex('#304f53').map((c) => c / 255);
  assert.ok(
    r.ctx.canvas.pixels.some(
      (p, i) =>
        i % 4 === 0 &&
        p === windowColor[0] &&
        r.ctx.canvas.pixels[i + 1] === windowColor[1] &&
        r.ctx.canvas.pixels[i + 2] === windowColor[2],
    ),
    'the actual dark cabin windows remain visible after hull paint',
  );
  assert.ok(r.boxes.some((b) => b[0] === 1846 && b[2] === 6 && b[5] === 34));
  const far = renderer(undefined, { x: 9000, y: 9000 });
  art.drawGround(far, s);
  art.draw(far, s);
  assert.equal(far.queued.length, 0);
  assert.equal(art.stats.structures, 0);
  assert.equal(art.stats.groundPieces, 0);
  art.dispose();
  assert.throws(() => art.draw(r, s), /disposed/);
});

test('a sheltered car keeps the real raised roof visible as a cutaway and restores drawing opacity', () => {
  const s = state();
  s.vehicles = [{ id: 'arc-arrival-taxi', x: 147, y: 270, z: 0 }];
  const r = renderer(new E.View('top', 'Top', 0, 90, 1), {
      x: 100,
      y: 220,
      width: 240,
      height: 240,
    }),
    art = createNightCrossingRenderer(game(), world);
  const alphas = [],
    box = r.box;
  r.box = function (g, ...args) {
    if (args[2] === 40) alphas.push(g.globalAlpha);
    return box.call(this, g, ...args);
  };
  art.draw(r, s);
  r.flush();
  assert.deepEqual(alphas, [0.35]);
  assert.equal(r.ctx.globalAlpha, 1);
  assert.ok(r.queued.some((q) => q.z === 40 && q.options.occluder === false));
  art.dispose();
});

test('a canonical companion suppresses its immutable stored dispatch proxy in scene rendering', () => {
  const s = state();
  Object.assign(s.player, { x: 458, y: 700 });
  assert.equal(enterInterior(s, 'voss-dispatch-entry', { world }).ok, true);
  const proxy = interiorActors(s).find((a) => a.castId === 'felix-voss') ?? interiorActors(s)[0];
  proxy.companionId = 'LL-CHAR-002';
  const felix = {
    id: 'LL-CHAR-002',
    sceneId: 'voss-dispatch',
    x: 200,
    y: 150,
    z: 0,
    health: 100,
    kind: 'civilian',
  };
  s.companions = { actors: [felix] };
  const people = sceneRenderState(s).pedestrians;
  assert.ok(people.includes(felix));
  assert.ok(!people.includes(proxy));
  assert.ok(interiorActors(s).includes(proxy));
});

test('native room dressing matches cached/direct pixels and includes canonical companions without a duplicate prop', () =>
  withCanvas(() => {
    const s = entered();
    s.companions = {
      actors: [
        {
          id: 'LL-CHAR-008',
          sceneId: 'dockside-rooms',
          x: 78,
          y: 128,
          z: 0,
          health: 100,
          kind: 'civilian',
          angle: 0,
        },
      ],
    };
    assert.equal(sceneRenderState(s).pedestrians[0], s.companions.actors[0]);
    s.campaignRuntime = {
      sceneProps: {
        'arrival-duffel': {
          id: 'arrival-duffel',
          kind: 'duffel',
          sceneId: 'dockside-rooms',
          x: 30,
          y: 134,
          z: 0,
          visible: true,
        },
      },
    };
    for (const view of [new E.View('iso', 'ISO', 45, 40, 1), new E.View('top', 'TOP', 0, 90, 1)]) {
      const art = createInteriorRenderer(game(), { taxi: { length: 29, width: 15 } }),
        a = renderer(view, { x: 0, y: 0, width: 500, height: 450 }),
        b = renderer(view, { x: 0, y: 0, width: 500, height: 450, live: true });
      a.ix = b.ix = -200;
      art.draw(a, s);
      art.draw(b, s);
      a.flush();
      b.flush();
      assert.deepEqual(a.ctx.canvas.pixels, b.ctx.canvas.pixels);
      assert.equal(art.stats.props, 8);
      assert.ok(a.boxes.some((p) => p[0] === 25 && p[1] === 130 && p[5] === 8));
      art.dispose();
    }
  }));

test('local map includes actual companion and mutable duffel without rebuilding its bounded background', () =>
  withCanvas(() => {
    const s = entered(),
      map = createRoomMap(),
      c = new RasterCanvas();
    c.width = 240;
    c.height = 220;
    const g = c.getContext('2d');
    for (const name of ['beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke'])
      g[name] = () => {};
    map.draw(g, s);
    const before = hash(c);
    s.companions = {
      actors: [
        {
          id: 'LL-CHAR-008',
          sceneId: 'dockside-rooms',
          x: 78,
          y: 128,
          health: 100,
          kind: 'civilian',
        },
      ],
    };
    s.campaignRuntime = {
      sceneProps: {
        'arrival-duffel': {
          id: 'arrival-duffel',
          kind: 'duffel',
          sceneId: 'dockside-rooms',
          x: 30,
          y: 134,
          z: 0,
        },
      },
    };
    map.draw(g, s);
    assert.notEqual(hash(c), before);
    assert.equal(map.stats().renders, 1);
    assert.equal(map.stats().cachedRooms, 1);
    map.dispose();
  }));
