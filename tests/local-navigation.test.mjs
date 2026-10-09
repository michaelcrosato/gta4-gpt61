import test from 'node:test';
import assert from 'node:assert/strict';
import { findLocalFootPath } from '../src/local-navigation.js';
import { createTerrain } from '../src/terrain.js';
import { createSurfaceMovement } from '../src/surface-movement.js';
import { createSceneContext } from '../src/scene-context.js';
import { CITY_BLUEPRINT } from '../src/city-blueprint.js';
import { createNightCrossingWorld, DOCKSIDE_ROOM_LAYOUT } from '../src/campaign/scenes.js';
import { enterInterior, setInteriorDoor, interiorActors } from '../src/interiors.js';
const rect = (x, y, w, h, id = 'solid') => ({ id, x, y, w, h, height: 72 });
function terrainFor(buildings = [], bounds = { left: 0, top: 0, right: 240, bottom: 180 }) {
  return createTerrain({ bounds, buildings, obstacles: [], roads: [], water: [] });
}
function verify(path, geometry, { radius = 7, sample = 0.1, maxStep = 6 } = {}) {
  assert.ok(path.length);
  let last = path[0];
  assert.equal(geometry.isBlocked(last.x, last.y, radius, last.z), false);
  for (let i = 1; i < path.length; i++) {
    const end = path[i],
      n = Math.max(1, Math.ceil(Math.hypot(end.x - last.x, end.y - last.y) / sample)),
      from = last;
    for (let j = 1; j <= n; j++) {
      const p = {
        x: from.x + ((end.x - from.x) * j) / n,
        y: from.y + ((end.y - from.y) * j) / n,
        z: 0,
      };
      p.z = geometry.surfaceHeight(p.x, p.y, last.z, { mode: 'foot' });
      assert.ok(Math.abs(p.z - last.z) <= maxStep + 1e-6);
      assert.equal(geometry.isBlocked(p.x, p.y, radius, p.z), false, JSON.stringify(p));
      last = p;
    }
    assert.ok(Math.abs(last.z - end.z) < 0.051);
  }
}
const candidate = createNightCrossingWorld(CITY_BLUEPRINT),
  world = candidate.world;
function roomState(id = 'dockside-rooms') {
  const location = world.locations.find(
    (p) => p.id === (id === 'voss-dispatch' ? 'felix-office' : 'dockside-rooms'),
  );
  const s = {
    player: { x: location.x, y: location.y, z: 0, groundZ: 0, health: 100, angle: 0 },
    vehicles: [],
    hostiles: [],
    police: [],
    pedestrians: [],
    wanted: { level: 0 },
    scene: { kind: 'exterior', id: 'harbor-city' },
  };
  assert.equal(
    enterInterior(s, id === 'voss-dispatch' ? 'voss-dispatch-entry' : 'dockside-rooms-entry', {
      world,
    }).ok,
    true,
  );
  return s;
}
const pose = (x, y, z = 0, sceneId = null) => ({ x, y, z, sceneId });

test('fractional origins and exact targets survive a bounded obstacle detour without mutating inputs', () => {
  const geometry = terrainFor([rect(80, 20, 10, 80)]),
    start = Object.freeze(pose(20.25, 40.75)),
    target = Object.freeze(pose(180.3, 40.125)),
    stats = {};
  const path = findLocalFootPath(geometry, start, target, {
    bounds: { x: 0, y: 0, w: 240, h: 180 },
    stats,
  });
  assert.deepEqual(path[0], start);
  assert.deepEqual(path.at(-1), target);
  assert.ok(path.length > 2);
  verify(path, geometry);
  assert.equal(stats.reason, 'found');
  assert.ok(stats.nodes <= 4096 && stats.checks <= 60000);
  assert.deepEqual(
    path,
    findLocalFootPath(geometry, start, target, {
      bounds: { left: 0, top: 0, right: 240, bottom: 180 },
    }),
  );
});

test('actual Dockside spawn reaches Felix reveal and every service around the real furniture', () => {
  const s = roomState(),
    context = createSceneContext(world),
    geometry = context.queries(s, 'dockside-rooms'),
    start = { ...s.player, sceneId: 'dockside-rooms' };
  for (const target of [
    candidate.bindings['dockside-rooms'].felixTarget,
    ...DOCKSIDE_ROOM_LAYOUT.hooks,
  ]) {
    const stats = {},
      path = findLocalFootPath(
        geometry,
        start,
        { ...target, z: 0, sceneId: 'dockside-rooms' },
        { bounds: { x: 0, y: 0, w: 240, h: 220 }, stats },
      );
    verify(path, geometry);
    assert.ok(stats.nodes < 100 && stats.checks < 6000, target.id);
    const body = { ...start };
    for (const p of path.slice(1)) {
      const n = Math.max(1, Math.ceil(Math.hypot(p.x - body.x, p.y - body.y))),
        dx = (p.x - body.x) / n,
        dy = (p.y - body.y) / n;
      for (let j = 0; j < n; j++) assert.equal(context.moveBody(s, body, dx, dy, 7), false);
    }
    assert.ok(Math.hypot(body.x - target.x, body.y - target.y) < 0.001);
    assert.equal(body.z, 0);
  }
  assert.deepEqual(interiorActors(s), []);
});

test('actual dispatch records door changes room connectivity and opening it permits a real continuous crossing', () => {
  const s = roomState('voss-dispatch'),
    geometry = createSceneContext(world).queries(s, 'voss-dispatch'),
    bounds = { x: 0, y: 0, w: 320, h: 240 },
    a = pose(188, 137, 0, 'voss-dispatch'),
    b = pose(250, 137, 0, 'voss-dispatch');
  assert.deepEqual(findLocalFootPath(geometry, a, b, { bounds }), []);
  assert.equal(setInteriorDoor(s, 'records-door', { open: true }), true);
  const path = findLocalFootPath(geometry, a, b, { bounds });
  assert.equal(path.length, 2);
  verify(path, geometry);
  assert.equal(setInteriorDoor(s, 'records-door', { open: false }), true);
  assert.deepEqual(findLocalFootPath(geometry, a, b, { bounds }), []);
});

test('Dockside front door opens only a same-scene apron route and cannot plan a portal teleport', () => {
  const s = roomState(),
    geometry = createSceneContext(world).queries(s, 'dockside-rooms'),
    a = pose(122, 184, 0, 'dockside-rooms'),
    b = pose(122, 232, 0, 'dockside-rooms'),
    bounds = { x: 0, y: 0, w: 240, h: 250 };
  assert.deepEqual(findLocalFootPath(geometry, a, b, { bounds }), []);
  setInteriorDoor(s, 'front-door', { open: true });
  verify(findLocalFootPath(geometry, a, b, { bounds }), geometry);
  assert.deepEqual(findLocalFootPath(geometry, a, { ...b, sceneId: null }, { bounds }), []);
});

test('a real home taxi footprint forces a local car-door detour while leaving the canopy and facade intact', () => {
  const terrain = createTerrain(world),
    car = rect(139.5, 255.5, 15, 29, 'parked-taxi'),
    bodyTerrain = terrainFor([car], { left: 40, top: 40, right: 11960, bottom: 9960 });
  const geometry = {
    surfaceHeight: terrain.surfaceHeight,
    isBlocked: (x, y, r, z) => terrain.isBlocked(x, y, r, z) || bodyTerrain.isBlocked(x, y, r, z),
  };
  const path = findLocalFootPath(geometry, pose(129, 270), pose(165, 270), {
    bounds: { x: 120, y: 230, w: 80, h: 90 },
    cellSize: 4,
  });
  assert.ok(path.length > 2);
  verify(path, geometry);
  assert.ok(path.some((p) => p.y > 291.5));
});

test('a tiny near-tangent obstacle cannot fall between collision samples', () => {
  const geometry = terrainFor([rect(60.25, 50.5, 0.001, 0.001)]),
    a = pose(20, 20),
    b = pose(100, 100),
    path = findLocalFootPath(geometry, a, b, { bounds: { x: 0, y: 0, w: 140, h: 140 } });
  assert.ok(path.length > 2);
  verify(path, geometry, { sample: 0.02 });
});

test('diagonal corner contacts cannot cut between wall ends', () => {
  const geometry = terrainFor([rect(15, 0, 5, 19), rect(0, 15, 19, 5)], {
    left: 0,
    top: 0,
    right: 40,
    bottom: 40,
  });
  assert.deepEqual(
    findLocalFootPath(geometry, pose(10, 10), pose(30, 30), {
      radius: 1,
      cellSize: 2,
      bounds: { x: 0, y: 0, w: 40, h: 40 },
    }),
    [],
  );
});

test('graded paths retain actual floor poses and run through the movement API without vertical jumps', () => {
  const floor = (x) => Math.max(0, Math.min(6, (x - 20) / 10)),
    geometry = { isBlocked: () => false, surfaceHeight: (x) => floor(x) },
    start = pose(10, 30),
    target = pose(100, 30, 6);
  const path = findLocalFootPath(geometry, start, target, {
    bounds: { x: 0, y: 0, w: 140, h: 80 },
  });
  verify(path, geometry);
  assert.ok(path.length >= 4);
  assert.equal(path.at(-1).z, 6);
  const body = { ...start, groundZ: 0 },
    movement = createSurfaceMovement(geometry);
  for (const p of path.slice(1)) {
    const n = Math.ceil(Math.hypot(p.x - body.x, p.y - body.y)),
      dx = (p.x - body.x) / n,
      dy = (p.y - body.y) / n;
    for (let j = 0; j < n; j++) assert.equal(movement.moveBody(body, dx, dy, 7), false);
  }
  assert.equal(body.z, 6);
});

test('abrupt ledges, unsupported target levels and coincident disconnected floors are refused', () => {
  const bounds = { x: 0, y: 0, w: 140, h: 80 };
  const cliff = { isBlocked: () => false, surfaceHeight: (x) => (x >= 60 ? 18 : 0) };
  assert.deepEqual(findLocalFootPath(cliff, pose(20, 30), pose(100, 30, 18), { bounds }), []);
  const unsupported = { isBlocked: () => false, surfaceHeight: () => 0 };
  assert.deepEqual(findLocalFootPath(unsupported, pose(20, 30), pose(100, 30, 18), { bounds }), []);
  const layers = { isBlocked: () => false, surfaceHeight: (x, y, z) => (z > 9 ? 18 : 0) };
  assert.deepEqual(findLocalFootPath(layers, pose(50, 30), pose(50, 30, 18), { bounds }), []);
});

test('node and geometry-query budgets cap work on huge or unreachable domains', () => {
  const bounds = { left: -1e9, top: -1e9, right: 1e9, bottom: 1e9 },
    wall = terrainFor([rect(80, -1e8, 1, 2e8)], bounds),
    nodes = {},
    queries = {};
  assert.deepEqual(
    findLocalFootPath(wall, pose(20, 40), pose(140, 40), { bounds, maxNodes: 8, stats: nodes }),
    [],
  );
  assert.equal(nodes.reason, 'node-limit');
  assert.ok(nodes.nodes <= 8);
  let calls = 0;
  const counted = {
    surfaceHeight(...a) {
      calls++;
      return wall.surfaceHeight(...a);
    },
    isBlocked(...a) {
      calls++;
      return wall.isBlocked(...a);
    },
  };
  assert.deepEqual(
    findLocalFootPath(counted, pose(20, 40), pose(140, 40), {
      bounds,
      maxChecks: 17,
      stats: queries,
    }),
    [],
  );
  assert.equal(calls, 17);
  assert.equal(queries.checks, 17);
  assert.equal(queries.reason, 'query-limit');
});

test('invalid inputs cannot trigger an unbounded search and missing query results fail closed', () => {
  const geometry = { isBlocked: () => false, surfaceHeight: () => 0 },
    a = pose(20, 20),
    b = pose(30, 30),
    bounds = { x: 0, y: 0, w: 80, h: 80 };
  for (const options of [
    {},
    { bounds, maxNodes: Infinity },
    { bounds, cellSize: 0 },
    { bounds, maxChecks: 0 },
    { bounds, minSampleStep: 3 },
    { bounds: { x: 0, y: 0, w: Infinity, h: 80 } },
  ])
    assert.throws(() => findLocalFootPath(geometry, a, b, options), TypeError);
  assert.throws(() => findLocalFootPath({}, a, b, { bounds }), TypeError);
  assert.throws(() => findLocalFootPath(geometry, a, { x: NaN, y: 10 }, { bounds }), TypeError);
  assert.deepEqual(
    findLocalFootPath({ ...geometry, isBlocked: () => undefined }, a, b, { bounds }),
    [],
  );
  assert.deepEqual(
    findLocalFootPath({ ...geometry, surfaceHeight: () => NaN }, a, b, { bounds }),
    [],
  );
  const stats = {};
  assert.deepEqual(findLocalFootPath(geometry, a, b, { bounds, maxWaypoints: 1, stats }), []);
  assert.equal(stats.reason, 'waypoint-limit');
});

test('optional analytic segment checks participate in the same hard budget and cannot silently return no answer', () => {
  const bounds = { x: 0, y: 0, w: 100, h: 80 },
    a = pose(20, 30),
    b = pose(80, 30),
    geometry = { isBlocked: () => false, surfaceHeight: () => 0, segmentBlocked: () => false },
    stats = {};
  verify(findLocalFootPath(geometry, a, b, { bounds, stats }), geometry);
  assert.ok(stats.checks > 100);
  assert.throws(
    () => findLocalFootPath({ ...geometry, segmentBlocked: () => undefined }, a, b, { bounds }),
    /boolean/,
  );
});
