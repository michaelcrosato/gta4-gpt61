import test from 'node:test';
import assert from 'node:assert/strict';
import '../my-3d2dge.js';
import { RasterCanvas } from './helpers/raster-canvas.mjs';
import { createInteriorRenderer, sceneRenderState } from '../src/interior-renderer.js';
import {
  INTERIOR_LAYOUTS,
  PORTAL_DEFINITIONS,
  enterInterior,
  interiorActors,
  setInteriorDoor,
  damageInteriorProp,
} from '../src/interiors.js';
const E = globalThis.My3D2dge;
const originalDocument = globalThis.document;
const specs = { sedan: { length: 29, width: 15 }, taxi: { length: 29, width: 15 } };
const world = {
  width: 2000,
  height: 2000,
  buildings: [],
  obstacles: [],
  roads: [],
  water: [],
  locations: [
    { id: 'felix-office', x: 458, y: 700 },
    { id: 'saira-shop', x: 780, y: 718 },
    { id: 'lantern-darts', x: 723, y: 918 },
    { id: 'blue-hour-lanes', x: 411, y: 654 },
    { id: 'dockside-rooms', x: 129, y: 308 },
  ],
};
function exterior() {
  return {
    time: 2,
    player: {
      x: 458,
      y: 700,
      z: 0,
      groundZ: 0,
      angle: 0,
      health: 100,
      weapon: 'pistol',
      vehicleId: null,
    },
    scene: { kind: 'exterior', id: 'harbor-city' },
    wanted: { level: 0, observed: false },
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
    mission: null,
  };
}
function state(roomId = 'voss-dispatch') {
  const s = exterior(),
    portal = PORTAL_DEFINITIONS.find((portal) => portal.roomId === roomId),
    anchor = world.locations.find((location) => location.id === portal.locationId);
  Object.assign(s.player, { x: anchor.x, y: anchor.y });
  assert.equal(enterInterior(s, portal.id, { world }).ok, true);
  return s;
}
function withCanvas(fn) {
  globalThis.document = {
    createElement: (name) => {
      assert.equal(name, 'canvas');
      return new RasterCanvas();
    },
  };
  try {
    return fn();
  } finally {
    globalThis.document = originalDocument;
  }
}
function game() {
  const lights = [];
  return {
    time: 2,
    real: 2,
    lights: {
      add(...args) {
        lights.push(args);
      },
    },
    addedLights: lights,
  };
}
function renderer(
  view = new E.View('top', 'Top', 0, 90, 1),
  { ix = -10, iy = -90, width = 600, height = 640, live = false } = {},
) {
  const canvas = new RasterCanvas();
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (live) ctx.getTransform = undefined;
  const r = {
    ctx,
    view,
    ix,
    iy,
    bw: width,
    bh: height,
    W: width,
    H: height,
    queued: [],
    actors: [],
    boxes: [],
    shadows: [],
    rings: [],
    glows: [],
    overlays: [],
    get tgt() {
      return ctx;
    },
    w(x, y, z = 0) {
      const p = view.p(x, y, z);
      return [p[0] - ix, p[1] - iy];
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
      this.boxes.push({ args, alpha: g.globalAlpha });
      E.Renderer.prototype.box.call(this, g, ...args);
    },
    shadow(...args) {
      this.shadows.push(args);
    },
    groundPts(...args) {
      return E.Renderer.prototype.groundPts.apply(this, args);
    },
    groundDisc(...args) {
      E.Renderer.prototype.groundDisc.apply(this, args);
    },
    groundRing(...args) {
      this.rings.push(args);
      E.Renderer.prototype.groundRing.apply(this, args);
    },
    glowDisc(g, x, y, radius, color, alpha) {
      this.glows.push({ x, y, radius, color, alpha });
      E.px.ddisc(g, x, y, radius, color, alpha, this.ix, this.iy);
    },
    overlay(fn) {
      this.overlays.push(fn);
    },
    flush({ actors = true } = {}) {
      const queued = [...this.queued];
      if (actors)
        for (const actor of this.actors)
          queued.push({ ...actor, fn: (g) => actor.fn(g, ...this.w(actor.x, actor.y, actor.z)) });
      for (const item of queued.sort(
        (a, b) =>
          view.order(a.x, a.y, a.z) +
          (a.options?.bias || 0) -
          view.order(b.x, b.y, b.z) -
          (b.options?.bias || 0),
      ))
        item.fn(ctx);
    },
  };
  return r;
}
function fingerprint(pixels) {
  let h = 2166136261;
  for (const pixel of pixels) h = Math.imul(h ^ Math.round(pixel * 255), 16777619);
  return h >>> 0;
}

test('strict room scene filtering retains persisted references and rejects overlapping exterior bodies/effects', () => {
  const s = state(),
    roomId = 'voss-dispatch',
    actor = interiorActors(s)[0];
  const inside = {
    id: 'inside',
    sceneId: roomId,
    x: 60,
    y: 60,
    z: 0,
    kind: 'civilian',
    health: 100,
  };
  const taggedScene = {
    id: 'tagged-scene',
    scene: { kind: 'interior', id: roomId },
    x: 90,
    y: 90,
    z: 0,
  };
  const outside = { id: 'outside-overlap', sceneId: null, x: 60, y: 60, z: 0 };
  const other = { id: 'other-room', sceneId: 'lantern-bar', x: 60, y: 60, z: 0 };
  s.pedestrians = [outside, inside, actor, other];
  for (const key of ['bullets', 'fires', 'ordnance', 'pickups', 'combatEffects'])
    s[key] = [inside, taggedScene, outside, other, { id: 'untagged', x: 60, y: 60 }];
  s.hostiles = [{ ...inside, id: 'hostile', kind: 'hostile' }];
  s.police = [{ ...inside, id: 'officer', kind: 'police' }];
  s.waypoint = outside;
  s.mission = { id: 'exterior-job', stageType: 'interact', target: outside };
  const filtered = sceneRenderState(s);
  assert.equal(filtered.player, s.player);
  assert.equal(filtered.pedestrians[0], actor);
  assert.equal(filtered.pedestrians[1], inside);
  assert.equal(filtered.pedestrians.length, 2);
  for (const key of ['bullets', 'fires', 'ordnance', 'pickups', 'combatEffects'])
    assert.deepEqual(filtered[key], [inside, taggedScene]);
  assert.equal(filtered.hostiles.length, 1);
  assert.equal(filtered.police.length, 1);
  assert.equal(filtered.waypoint, null);
  assert.equal(filtered.mission, null);
  actor.health = 0;
  actor.panic = 9;
  assert.equal(filtered.pedestrians[0].health, 0);
  assert.equal(filtered.pedestrians[0].panic, 9);
  assert.equal(s.pedestrians.length, 4);
  s.mission = { id: 'indoor-job', stageType: 'interact', target: inside };
  s.waypoint = inside;
  assert.equal(sceneRenderState(s).mission.stageType, 'room-target');
  assert.equal(sceneRenderState(s).waypoint, inside);
});

test('the entered local garage vehicle is rendered while unrelated or exterior traffic remains separate', () => {
  const s = exterior();
  Object.assign(s.player, { x: 780, y: 718, vehicleId: 'cab' });
  const car = {
    id: 'cab',
    spec: 'taxi',
    x: 780,
    y: 718,
    z: 0,
    groundZ: 0,
    angle: 0,
    speed: 0,
    health: 100,
    occupied: true,
  };
  s.vehicles = [car];
  enterInterior(s, 'saira-garage-entry', { world });
  s.vehicles.push({ ...car, id: 'other-car' }, { ...car, id: 'exterior-car', scene: null });
  assert.deepEqual(sceneRenderState(s).vehicles, [car]);
  assert.equal(s.vehicles.length, 3);
});

test('an exterior draw allocates no room renderer and does not alter the frame', () =>
  withCanvas(() => {
    const draw = createInteriorRenderer(game(), specs),
      r = renderer();
    assert.equal(draw.draw(r, exterior()), false);
    assert.equal(draw.stats.cachedRooms, 0);
    assert.equal(draw.stats.floorPixels, 0);
    assert.equal(r.ctx.fills, 0);
    assert.equal(r.queued.length, 0);
    draw.dispose();
  }));

test('all authored rooms produce distinct native floor and furniture pixels with no outdoor weather overlays', () =>
  withCanvas(() => {
    const signatures = [];
    for (const roomId of Object.keys(INTERIOR_LAYOUTS)) {
      const draw = createInteriorRenderer(game(), specs),
        r = renderer();
      draw.draw(r, state(roomId), { rain: true });
      r.flush();
      signatures.push(fingerprint(r.ctx.canvas.pixels));
      assert.equal(r.overlays.length, 0);
      assert.ok(draw.stats.props >= 5);
      assert.ok(draw.stats.wallPieces >= 20);
      assert.ok(r.boxes.length >= draw.stats.props + draw.stats.wallPieces);
      assert.ok(r.glows.length > 0);
      draw.dispose();
    }
    assert.equal(new Set(signatures).size, Object.keys(INTERIOR_LAYOUTS).length);
  }));

test('room floor atlases exactly match live pixels across both projections and camera crops', () =>
  withCanvas(() => {
    const draw = createInteriorRenderer(game(), specs);
    for (const roomId of ['voss-dispatch', 'blue-hour-lanes']) {
      const s = state(roomId);
      for (const view of [
        new E.View('city', 'City', 35, 48, 0.8),
        new E.View('top', 'Top', 0, 90, 1),
      ])
        for (const [ix, iy] of [
          [-90, -75],
          [30, 25],
          [225, 185],
        ]) {
          const cached = renderer(view, { ix, iy, width: 160, height: 110 }),
            live = renderer(view, { ix, iy, width: 160, height: 110, live: true });
          draw.draw(cached, s);
          draw.draw(live, s);
          assert.deepEqual(
            cached.ctx.canvas.pixels,
            live.ctx.canvas.pixels,
            `${roomId}:${view.id}:${ix},${iy}`,
          );
          assert.ok(
            cached.ctx.images.every(
              (image) =>
                image.sw <= cached.bw && image.sh <= cached.bh && image.sx >= 0 && image.sy >= 0,
            ),
          );
        }
    }
    draw.dispose();
  }));

test('live walls, closed doors and intact props use their actual collision footprints and heights', () =>
  withCanvas(() => {
    const s = state(),
      room = INTERIOR_LAYOUTS['voss-dispatch'],
      draw = createInteriorRenderer(game(), specs),
      r = renderer();
    draw.draw(r, s);
    r.flush({ actors: false });
    for (const item of [...room.props, ...room.doors])
      assert.ok(
        r.boxes.some(
          (box) =>
            box.args[0] === item.x &&
            box.args[1] === item.y &&
            box.args[3] === item.x + item.w &&
            box.args[4] === item.y + item.h &&
            box.args[5] === item.height,
        ),
        item.id,
      );
    const walls = r.boxes.filter((box) => box.args[5] === 72);
    assert.ok(walls.length > 5);
    assert.ok(
      walls.every((box) => Math.max(box.args[3] - box.args[0], box.args[4] - box.args[1]) <= 32),
    );
    setInteriorDoor(s, 'records-door', { open: true });
    damageInteriorProp(s, 'dispatch-desk', 100);
    const changed = renderer();
    draw.draw(changed, s);
    changed.flush({ actors: false });
    assert.ok(
      !changed.boxes.some(
        (box) => box.args[0] === 214 && box.args[1] === 110 && box.args[5] === 68,
      ),
    );
    assert.ok(
      !changed.boxes.some((box) => box.args[0] === 112 && box.args[1] === 58 && box.args[5] === 18),
    );
    assert.equal(draw.stats.props, room.props.length - 1);
    draw.dispose();
  }));

test('front wall cutaways retain full collision height while reducing opacity to keep the player readable', () =>
  withCanvas(() => {
    const draw = createInteriorRenderer(game(), specs),
      r = renderer(new E.View('city', 'City', 35, 48, 1), { ix: -160, iy: -150 });
    draw.draw(r, state());
    r.flush({ actors: false });
    assert.ok(r.boxes.some((box) => box.args[5] === 72 && box.alpha < 0.5));
    assert.ok(r.boxes.some((box) => box.args[5] === 72 && box.alpha === 1));
    assert.equal(r.ctx.globalAlpha, 1);
    draw.dispose();
  }));

test('a closed entrance door overlapping the player uses the wall cutaway opacity without changing its physical slab', () =>
  withCanvas(() => {
    const s = state(),
      draw = createInteriorRenderer(game(), specs),
      r = renderer(new E.View('city', 'City', 35, 48, 1), { ix: -160, iy: -150 });
    draw.draw(r, s);
    r.flush({ actors: false });
    const door = r.boxes.find(
      (box) =>
        box.args[0] === 136 &&
        box.args[1] === 230 &&
        box.args[3] === 200 &&
        box.args[4] === 240 &&
        box.args[5] === 68,
    );
    assert.ok(door, 'the full closed slab remains present');
    assert.equal(door.alpha, 0.25);
    assert.equal(s.interior.rooms['voss-dispatch'].doors['front-door'].open, false);
    assert.equal(r.ctx.globalAlpha, 1);
    const away = state();
    Object.assign(away.player, { x: 160, y: 120 });
    const distant = renderer(new E.View('city', 'City', 35, 48, 1), { ix: -160, iy: -150 });
    draw.draw(distant, away);
    distant.flush({ actors: false });
    assert.equal(
      distant.boxes.find((box) => box.args[0] === 136 && box.args[1] === 230 && box.args[5] === 68)
        .alpha,
      1,
    );
    draw.dispose();
  }));

test('lights use authored world coordinates and colors and service/exit markers reflect actual door state', () =>
  withCanvas(() => {
    const g = game(),
      draw = createInteriorRenderer(g, specs),
      s = state('lantern-bar'),
      room = INTERIOR_LAYOUTS['lantern-bar'],
      r = renderer();
    draw.draw(r, s);
    r.flush({ actors: false });
    assert.equal(g.addedLights.length, room.lights.length);
    for (let index = 0; index < room.lights.length; index++) {
      const light = room.lights[index],
        actual = g.addedLights[index];
      assert.deepEqual(actual.slice(0, 3), [light.x, light.y, light.z]);
      assert.equal(actual[5].color, light.color);
      assert.equal(actual[5].shadow, true);
    }
    assert.equal(draw.stats.markers, room.hooks.length + 1);
    const closedColor = r.rings.find((ring) => ring[0] === 66 && ring[1] === 237)[3];
    setInteriorDoor(s, 'front-door', { open: true });
    const opened = renderer();
    draw.draw(opened, s);
    assert.notEqual(opened.rings.find((ring) => ring[0] === 66 && ring[1] === 237)[3], closedColor);
    draw.dispose();
  }));

test('venue plaques keep every visible glyph when their physical wall is split into depth-sorted pieces', () =>
  withCanvas(() => {
    for (const [roomId, label] of [
      ['voss-dispatch', 'VOSS DISPATCH'],
      ['saira-garage', 'SAIRA SERVICE'],
      ['lantern-bar', 'THE LANTERN'],
      ['blue-hour-lanes', 'BLUE HOUR LANES'],
    ]) {
      const draw = createInteriorRenderer(game(), specs),
        view = new E.View('city', 'City', 35, 48, 1),
        r = renderer(view, { ix: -220, iy: -100 }),
        room = INTERIOR_LAYOUTS[roomId];
      draw.draw(r, state(roomId));
      r.flush({ actors: false });
      const expected = renderer(view, { ix: -220, iy: -100 });
      const point = expected.w(room.width / 2, 11, 46);
      E.font.text(expected.ctx, label, point[0], point[1], '#e4d3a4', {
        align: 'center',
        font: 'tiny',
        outline: false,
      });
      const color = E.hex('#e4d3a4').map((value) => value / 255),
        pixels = expected.ctx.canvas.pixels;
      let glyphs = 0,
        visible = 0;
      for (let index = 0; index < pixels.length; index += 4)
        if (pixels[index + 3]) {
          glyphs++;
          if (color.every((value, channel) => r.ctx.canvas.pixels[index + channel] === value))
            visible++;
        }
      assert.ok(glyphs > 40);
      assert.equal(visible, glyphs, roomId);
      draw.dispose();
    }
  }));

test('shared rigs preserve indoor jump/crouch/death animation and native equipment rendering', () =>
  withCanvas(() => {
    const original = E.Humanoid.prototype.update,
      poses = [];
    E.Humanoid.prototype.update = function (dt, pose) {
      poses.push(pose);
      return original.call(this, dt, pose);
    };
    try {
      const draw = createInteriorRenderer(game(), specs),
        s = state(),
        r = renderer(new E.View('city', 'City', 35, 48, 1), { ix: -180, iy: -90 });
      Object.assign(s.player, {
        z: 24,
        groundZ: 0,
        vz: 40,
        crouching: true,
        weapon: 'rpg',
        aiming: true,
      });
      interiorActors(s)[0].health = 0;
      draw.draw(r, s);
      r.flush();
      assert.ok(
        poses.some(
          (pose) => pose.x === s.player.x && pose.z === 24 && pose.air && pose.pose === 'crouch',
        ),
      );
      assert.ok(poses.some((pose) => pose.x === 162 && pose.pose === 'down'));
      assert.ok(r.actors.some((actor) => actor.z === 24));
      assert.ok(r.ctx.fills > 100);
      draw.dispose();
    } finally {
      E.Humanoid.prototype.update = original;
    }
  }));

test('room-specific projectiles, fire, ordnance and supplies remain visible at their absolute local height', () =>
  withCanvas(() => {
    const s = state(),
      roomId = 'voss-dispatch';
    s.bullets = [
      { id: 'inside-bullet', sceneId: roomId, x: 150, y: 130, z: 24, vx: 60, vy: 0 },
      { id: 'outside-bullet', x: 155, y: 132, z: 24, vx: 60, vy: 0 },
    ];
    s.ordnance = [
      {
        id: 'grenade',
        sceneId: roomId,
        kind: 'grenade',
        x: 155,
        y: 135,
        z: 28,
        groundZ: 18,
        fuse: 1,
      },
    ];
    s.fires = [{ id: 'fire', sceneId: roomId, x: 165, y: 145, z: 18, radius: 8 }];
    s.pickups = [
      {
        id: 'gun',
        sceneId: roomId,
        type: 'weapon',
        weapon: 'pistol',
        x: 175,
        y: 155,
        z: 18,
        available: true,
      },
    ];
    const draw = createInteriorRenderer(game(), specs),
      r = renderer();
    draw.draw(r, s);
    r.flush();
    assert.ok(r.queued.some((item) => item.x === 150 && item.y === 130 && item.z === 24));
    assert.ok(!r.queued.some((item) => item.x === 155 && item.y === 132));
    assert.ok(
      r.shadows.some((shadow) => shadow[0] === 155 && shadow[1] === 135 && shadow[5] === 18),
    );
    assert.ok(r.rings.some((ring) => ring[0] === 175 && ring[1] === 155 && ring[5] === 18));
    assert.ok(r.queued.some((item) => item.x === 165 && item.y === 145 && item.z === 18));
    draw.dispose();
  }));

test('room renderers and floor projections obey global pixel/room bounds and release evicted backing stores', () =>
  withCanvas(() => {
    const draw = createInteriorRenderer(game(), specs, { maxRooms: 2, maxFloorPixels: 450000 });
    const first = renderer();
    draw.draw(first, state());
    const originalFloor = first.ctx.images[0].source;
    const second = renderer();
    draw.draw(second, state('lantern-bar'));
    draw.draw(renderer(), state());
    draw.draw(renderer(), state('saira-garage'));
    assert.equal(draw.stats.cachedRooms, 2);
    assert.equal(draw.stats.createdRooms, 3);
    assert.equal(draw.stats.retiredRooms, 1);
    assert.ok(draw.stats.floorPixels <= 450000);
    const voss = state();
    const old = renderer(new E.View('a', 'A', 0, 90, 1));
    draw.draw(old, voss);
    const oldFloor = old.ctx.images[0].source;
    draw.draw(renderer(new E.View('b', 'B', 10, 70, 1)), voss);
    draw.draw(renderer(new E.View('c', 'C', 35, 48, 1)), voss);
    assert.equal(oldFloor.width, 0);
    assert.equal(oldFloor.height, 0);
    draw.dispose();
    assert.equal(originalFloor.width, 0);
    assert.equal(originalFloor.height, 0);
    assert.equal(draw.stats.floorPixels, 0);
    assert.equal(draw.stats.floorAtlases, 0);
    assert.equal(draw.stats.cachedRooms, 0);
    assert.equal(draw.stats.rigs, 0);
    assert.throws(() => draw.draw(renderer(), voss), /disposed/);
  }));

test('oversized floor projections draw live within the pixel budget and invalid cache limits reject', () =>
  withCanvas(() => {
    const draw = createInteriorRenderer(game(), specs, { maxFloorPixels: 100 }),
      r = renderer();
    draw.draw(r, state('blue-hour-lanes'));
    assert.equal(draw.stats.floorPixels, 0);
    assert.equal(draw.stats.floorAtlases, 0);
    assert.equal(r.ctx.images.length, 0);
    assert.ok(r.ctx.fills > 40);
    draw.dispose();
    assert.throws(() => createInteriorRenderer(game(), specs, { maxRooms: 0 }), /bounds/);
    assert.throws(() => createInteriorRenderer(game(), specs, { maxFloorPixels: NaN }), /bounds/);
  }));
