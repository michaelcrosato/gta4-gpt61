import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain } from '../src/terrain.js';
import { WORLD as legacy } from '../src/prologue-world.js';
import { CITY_BLUEPRINT as city } from '../src/city-blueprint.js';

const square = (x, y, w, h) => ({
  polygon: [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ],
});
function world(extra = {}) {
  return {
    bounds: { left: -100, top: -100, right: 1000, bottom: 1000 },
    buildings: [],
    obstacles: [],
    roads: [],
    ...extra,
  };
}
function bridge(overrides = {}) {
  return {
    id: 'bridge',
    x1: 0,
    y1: 50,
    x2: 300,
    y2: 50,
    width: 30,
    z: 30,
    bridge: true,
    access: ['foot', 'car'],
    rampStart: 100,
    rampEnd: 100,
    ...overrides,
  };
}

test('legacy bounds, building volumes and obstacle heights retain their collision behavior', () => {
  const terrain = createTerrain(legacy),
    b = legacy.buildings[0],
    obstacle = legacy.obstacles[0];
  assert.equal(terrain.isBlocked(legacy.spawn.x, legacy.spawn.y), false);
  assert.equal(terrain.isBlocked(legacy.bounds.left + 7, 700), false);
  assert.equal(terrain.isBlocked(legacy.bounds.left + 6.99, 700), true);
  assert.equal(terrain.isBlocked(b.x + b.w / 2, b.y + b.h / 2, 7, b.height - 0.001), true);
  assert.equal(terrain.isBlocked(b.x + b.w / 2, b.y + b.h / 2, 7, b.height), false);
  assert.equal(terrain.isBlocked(b.x + b.w / 2, b.y + b.h / 2, 7, -1), false);
  assert.equal(terrain.isBlocked(obstacle.x + 2, obstacle.y + 2, 1, obstacle.height - 1), true);
  assert.equal(terrain.isBlocked(obstacle.x + 2, obstacle.y + 2, 1, obstacle.height), false);
  assert.equal(terrain.isWater(1760, 700), true);
  assert.equal(terrain.isBlocked(1760, 700), true);
  assert.equal(terrain.surfaceHeight(480, 700), 0);
});

test('rectangle-only legacy water remains queryable without newly blocking dry movement', () => {
  const terrain = createTerrain(world({ water: [{ x: 10, y: 10, w: 30, h: 30 }] }));
  assert.equal(terrain.isWater(20, 20), true);
  assert.equal(terrain.isBlocked(20, 20), false);
});

test('circle collisions are exact at corners, tangencies, points and narrow obstacles', () => {
  const terrain = createTerrain(
    world({
      buildings: [{ id: 'block', x: 10, y: 10, w: 10, h: 10, height: 40 }],
      obstacles: [{ x: 40.2, y: 0, w: 0.1, h: 80, height: 12 }],
    }),
  );
  assert.equal(terrain.isBlocked(5, 5, 7), false);
  assert.equal(terrain.isBlocked(5, 5, 7.1), true);
  assert.equal(terrain.isBlocked(5, 15, 5), false);
  assert.equal(terrain.isBlocked(5.001, 15, 5), true);
  assert.equal(terrain.isBlocked(15, 15, 0), true);
  assert.equal(terrain.isBlocked(40.25, 30, 0), true);
  assert.equal(terrain.isBlocked(39.5, 30, 1), true);
});

test('3D segment/AABB visibility catches a narrow wall missed by nine-unit samples', () => {
  const terrain = createTerrain(
    world({ buildings: [{ x: 45.2, y: -1, w: 0.1, h: 2, height: 20 }] }),
  );
  assert.equal(terrain.hasLineOfSight({ x: 0, y: 0, z: 5 }, { x: 100, y: 0, z: 5 }), false);
  assert.equal(terrain.hasLineOfSight({ x: 100, y: 0, z: 5 }, { x: 0, y: 0, z: 5 }), false);
  assert.equal(terrain.hasLineOfSight({ x: 0, y: 1.01, z: 5 }, { x: 100, y: 1.01, z: 5 }), true);
});

test('visibility uses the whole vertical segment and permits rays on or above roofs', () => {
  const terrain = createTerrain(world({ buildings: [{ x: 40, y: 40, w: 20, h: 20, height: 30 }] }));
  for (const z of [30, 31, 60])
    assert.equal(terrain.hasLineOfSight({ x: 0, y: 50, z }, { x: 100, y: 50, z }), true);
  assert.equal(
    terrain.hasLineOfSight({ x: 0, y: 50, z: 29.99 }, { x: 100, y: 50, z: 29.99 }),
    false,
  );
  assert.equal(terrain.hasLineOfSight({ x: 0, y: 50, z: -1 }, { x: 100, y: 50, z: -1 }), true);
  assert.equal(terrain.hasLineOfSight({ x: 50, y: 50, z: 60 }, { x: 50, y: 50, z: 30 }), true);
  assert.equal(terrain.hasLineOfSight({ x: 50, y: 50, z: 60 }, { x: 50, y: 50, z: 20 }), false);
  assert.equal(terrain.hasLineOfSight({ x: 0, y: 50, z: 100 }, { x: 100, y: 50, z: 0 }), true);
  assert.equal(terrain.hasLineOfSight({ x: 0, y: 50, z: 40 }, { x: 100, y: 50, z: 0 }), false);
});

test('actors with a health field use the existing fourteen-unit body-eye convention', () => {
  const terrain = createTerrain(world({ obstacles: [{ x: 40, y: 0, w: 2, h: 100, height: 12 }] }));
  assert.equal(
    terrain.hasLineOfSight({ x: 0, y: 50, health: 100 }, { x: 100, y: 50, health: 0 }),
    true,
  );
  assert.equal(terrain.hasLineOfSight({ x: 0, y: 50 }, { x: 100, y: 50 }), false);
  assert.equal(
    terrain.hasLineOfSight({ x: 0, y: 50, health: 100 }, { x: 100, y: 50, z: 14 }),
    true,
  );
  assert.equal(
    terrain.hasLineOfSight({ x: -101, y: 50, z: 100 }, { x: 100, y: 50, z: 100 }),
    false,
  );
});

test('polygon coasts differ from their envelopes and circle bodies cannot clip a diagonal shoreline', () => {
  const terrain = createTerrain(
    world({
      landforms: [
        {
          polygon: [
            [0, 0],
            [200, 0],
            [0, 200],
          ],
        },
      ],
    }),
  );
  assert.equal(terrain.isWater(150, 150), true);
  assert.equal(terrain.isWater(50, 50), false);
  assert.equal(terrain.isBlocked(50, 50), false);
  assert.equal(terrain.isBlocked(100, 90, 7), false);
  assert.equal(terrain.isBlocked(100, 90, 7.2), true);
  assert.equal(terrain.isBlocked(50, 50, 60), true);
  assert.equal(terrain.isBlocked(100, 100, 0), false);
  assert.equal(terrain.isBlocked(150, 150, 2, 0, { ignoreWater: true }), false);
  assert.equal(terrain.isBlocked(150, 150, 2, 10), false);
});

test('landform unions retain overlap and shared-edge crossings without erasing outer coast boundaries', () => {
  for (const forms of [
    [square(0, 0, 100, 100), square(50, 0, 100, 100)],
    [square(0, 0, 100, 100), square(100, 0, 100, 100)],
  ]) {
    const terrain = createTerrain(world({ landforms: forms }));
    assert.equal(terrain.isBlocked(100, 50, 10), false);
    assert.equal(terrain.isBlocked(50, 5, 7), true);
  }
  const duplicate = createTerrain(
    world({ landforms: [square(0, 0, 100, 100), square(0, 0, 100, 100)] }),
  );
  assert.equal(duplicate.isBlocked(95, 50, 7), true);
});

test('a water hole enclosed by land is detected even when the whole body circumference stays on land', () => {
  const terrain = createTerrain(
    world({
      landforms: [
        square(0, 0, 100, 40),
        square(0, 60, 100, 40),
        square(0, 40, 40, 20),
        square(60, 40, 40, 20),
      ],
    }),
  );
  assert.equal(terrain.isWater(50, 50), true);
  assert.equal(terrain.isBlocked(35, 50, 30), true);
});

test('a concave inlet remains water and circle bodies detect its interior shoreline', () => {
  const terrain = createTerrain(
    world({
      landforms: [
        {
          polygon: [
            [0, 0],
            [100, 0],
            [100, 100],
            [60, 100],
            [60, 40],
            [40, 40],
            [40, 100],
            [0, 100],
          ],
        },
      ],
    }),
  );
  assert.equal(terrain.isWater(50, 60), true);
  assert.equal(terrain.isWater(30, 60), false);
  assert.equal(terrain.isBlocked(30, 60, 9), false);
  assert.equal(terrain.isBlocked(30, 60, 11), true);
  assert.equal(terrain.isBlocked(50, 20, 30), true);
});

test('lakes and explicit water rectangles block circles, while broad ocean envelopes do not flood authored land', () => {
  const terrain = createTerrain(
    world({
      landforms: [square(0, 0, 300, 300)],
      lakes: [{ x: 40, y: 40, w: 0.5, h: 30 }],
      water: [{ x: 150, y: 150, w: 10, h: 10 }],
      waterVolumes: [{ bounds: { x: -100, y: -100, w: 1100, h: 1100 }, zMin: -30, zMax: 0 }],
    }),
  );
  assert.equal(terrain.isWater(100, 100), false);
  assert.equal(terrain.isWater(40.25, 50), true);
  assert.equal(terrain.isBlocked(39.5, 50, 1), true);
  assert.equal(terrain.isBlocked(30, 50, 1), false);
  assert.equal(terrain.isWater(155, 155), true);
  assert.equal(terrain.isWater(350, 100, { ignoreDeck: true }), true);
});

test('bridge decks mask surface water without removing water beneath them or beside their exact footprint', () => {
  const terrain = createTerrain(
    world({
      landforms: [square(0, 0, 70, 100), square(230, 0, 100, 100)],
      roads: [bridge({ rampStart: 60, rampEnd: 60 })],
      waterVolumes: [{ bounds: { x: 0, y: 0, w: 330, h: 100 } }],
    }),
  );
  assert.equal(terrain.isWater(150, 50), false);
  assert.equal(terrain.isWater(150, 50, { ignoreDeck: true }), true);
  assert.equal(terrain.isWater(150, 66), true);
  assert.equal(terrain.isBlocked(150, 50, 7, 0), true);
  assert.equal(terrain.isBlocked(150, 50, 7, 0, { ignoreWater: true }), false);
  assert.equal(terrain.isBlocked(150, 50, 7, 30), false);
  assert.equal(terrain.surfaceHeight(150, 50, 0), 0);
  assert.equal(terrain.surfaceHeight(150, 50, 30), 30);
});

test('continuous bridge ramp entry and exit follow height without snapping a ground underpass', () => {
  const terrain = createTerrain(
    world({ landforms: [square(-100, -100, 1100, 1100)], roads: [bridge()] }),
  );
  let height = 0;
  for (let x = 0; x <= 300; x += 10) {
    height = terrain.surfaceHeight(x, 50, height);
    const expected = x < 100 ? x * 0.3 : x > 200 ? (300 - x) * 0.3 : 30;
    assert.ok(Math.abs(height - expected) < 1e-8, `bridge x=${x}, z=${height}`);
  }
  assert.equal(terrain.surfaceHeight(150, 50, 0), 0);
  assert.equal(terrain.surfaceHeight(150, 50, 30), 30);
  assert.equal(terrain.surfaceHeight(150, 66, 30), 0);
});

test('scalar linked bridge segments infer ramps only at dry terminal endpoints', () => {
  const roads = [
    bridge({ x2: 200, z: 24, rampStart: undefined, rampEnd: undefined }),
    bridge({ id: 'bridge-2', x1: 200, x2: 400, z: 24, rampStart: undefined, rampEnd: undefined }),
  ];
  const terrain = createTerrain(world({ landforms: [square(-100, -100, 1100, 1100)], roads }));
  assert.equal(terrain.surfaceHeight(0, 50, 0), 0);
  assert.ok(terrain.surfaceHeight(10, 50, 0) > 0);
  assert.equal(terrain.surfaceHeight(200, 50, 24), 24);
  assert.equal(terrain.surfaceHeight(200, 50, 0), 0);
  assert.equal(terrain.surfaceHeight(400, 50, 24), 0);
});

test('explicit endpoint grades, diagonal widths and access modes select the correct surface', () => {
  const roads = [
    bridge({ x1: 0, y1: 0, x2: 100, y2: 100, z1: 0, z2: 20, width: 20 }),
    bridge({ id: 'rail', y1: 200, y2: 200, access: ['rail'], rampStart: 0, rampEnd: 0 }),
    bridge({ id: 'closed', y1: 300, y2: 300, access: [], rampStart: 0, rampEnd: 0 }),
  ];
  const terrain = createTerrain(world({ roads }));
  assert.equal(terrain.surfaceHeight(25, 25, 5), 5);
  assert.equal(terrain.surfaceHeight(50, 50, 10), 10);
  assert.equal(terrain.surfaceHeight(50, 65, 10), 0);
  assert.equal(terrain.surfaceHeight(150, 200, 30), 0);
  assert.equal(terrain.surfaceHeight(150, 200, 30, { mode: 'rail' }), 30);
  assert.equal(terrain.surfaceHeight(150, 300, 30, { mode: 'car' }), 0);
});

test('car-only tunnel portals descend continuously and retain water/ground above the tunnel', () => {
  const road = bridge({ bridge: false, tunnel: true, z: -18, access: ['car'] });
  const terrain = createTerrain(
    world({ landforms: [square(0, 0, 80, 100), square(220, 0, 100, 100)], roads: [road] }),
  );
  let height = 0;
  for (let x = 0; x <= 300; x += 10) {
    height = terrain.surfaceHeight(x, 50, height, { mode: 'car' });
    const expected = x < 100 ? x * -0.18 : x > 200 ? (300 - x) * -0.18 : -18;
    assert.ok(Math.abs(height - expected) < 1e-8);
  }
  assert.equal(terrain.surfaceHeight(150, 50, -18), 0);
  assert.equal(terrain.surfaceHeight(150, 50, 0, { mode: 'car' }), 0);
  assert.equal(terrain.isWater(150, 50), true);
  assert.equal(terrain.isBlocked(150, 50, 7, -18), false);
  assert.equal(terrain.isBlocked(150, 50, 7, 0), true);
});

test('standalone deck rectangles support elevated actors while closed/rail-only surfaces remain unavailable to foot travel', () => {
  const terrain = createTerrain(
    world({
      landforms: [square(0, 0, 50, 50)],
      decks: [{ x: 100, y: 100, w: 100, h: 100, z: 20, access: ['foot'] }],
    }),
  );
  assert.equal(terrain.surfaceHeight(150, 150, 20), 20);
  assert.equal(terrain.surfaceHeight(150, 150, 0), 0);
  assert.equal(terrain.isWater(150, 150), false);
  assert.equal(terrain.isWater(150, 150, { ignoreDeck: true }), true);
});

test('nearby building results use exact circular distance, preserve metadata/references and retain order', () => {
  const a = { id: 'near', x: 20, y: 0, w: 10, h: 10, height: 30, neighbourhoodId: 'N1' };
  const b = { id: 'corner', x: 9, y: 9, w: 1, h: 1, height: 30 };
  const area = {
    id: 'N1',
    name: 'Foundry Court',
    x: -50,
    y: -50,
    w: 100,
    h: 100,
    districtId: 'ironhaven',
  };
  const terrain = createTerrain(world({ buildings: [a, b], neighbourhoods: [area] }));
  assert.deepEqual(terrain.nearbyBuildings(0, 0, 10), []);
  assert.deepEqual(terrain.nearbyBuildings(0, 0, 20), [a, b]);
  assert.equal(terrain.nearbyBuildings(20, 5, 0)[0], a);
  assert.equal(terrain.neighbourhoodAt(0, 0), area);
  assert.equal(terrain.neighbourhoodAt(60, 0), null);
});

test('queries use captured geometry rather than rereading every city building and road', () => {
  let reads = 0;
  const buildings = Array.from({ length: 2000 }, (_, i) => ({
    id: i,
    get x() {
      reads++;
      return i * 300;
    },
    y: 0,
    w: 20,
    h: 20,
    height: 30,
  }));
  const roads = [bridge()];
  const terrain = createTerrain(
    world({ bounds: { left: -100, top: -100, right: 700000, bottom: 1000 }, buildings, roads }),
  );
  assert.equal(reads, 2000);
  reads = 0;
  buildings.length = 0;
  roads.length = 0;
  for (let i = 0; i < 100; i++) {
    assert.equal(terrain.isBlocked(600, 10, 1), true);
    assert.equal(terrain.nearbyBuildings(600, 10, 1).length, 1);
    assert.equal(terrain.hasLineOfSight({ x: 590, y: 10, z: 10 }, { x: 630, y: 10, z: 10 }), false);
    assert.equal(terrain.surfaceHeight(150, 50, 30), 30);
  }
  assert.equal(reads, 0);
});

test('actual blueprint keeps opening services dry, exposes lake water and preserves physical neighbourhood metadata', () => {
  const terrain = createTerrain(city);
  for (const location of city.locations) {
    assert.equal(terrain.isWater(location.x, location.y), false, location.id);
    assert.equal(terrain.isBlocked(location.x, location.y), false, location.id);
  }
  const lake = city.lakes[0];
  assert.equal(
    terrain.isWater(lake.x + lake.w / 2, lake.y + lake.h / 2, { ignoreDeck: true }),
    true,
  );
  assert.equal(terrain.isBlocked(lake.x + lake.w / 2, lake.y + lake.h / 2), true);
  const area = city.neighbourhoods[0];
  assert.equal(terrain.neighbourhoodAt(area.x + area.w / 2, area.y + area.h / 2), area);
  const crossing = city.roads.find(
    (road) => road.bridge && road.z > 20 && road.access.includes('foot'),
  );
  const x = (crossing.x1 + crossing.x2) / 2,
    y = (crossing.y1 + crossing.y2) / 2;
  assert.equal(terrain.surfaceHeight(x, y, 0), 0);
  const middleHeight = ((crossing.z1 ?? crossing.z) + (crossing.z2 ?? crossing.z)) / 2;
  assert.equal(terrain.surfaceHeight(x, y, middleHeight), middleHeight);
});

test('invalid terrain geometry and query inputs fail safely', () => {
  for (const bad of [
    null,
    world({ buildings: null, roads: 'bad' }),
    world({ bounds: {} }),
    world({ buildings: [{ x: 0, y: 0, w: -1, h: 1 }] }),
    world({
      landforms: [
        {
          polygon: [
            [0, 0],
            [1, 1],
            [2, 2],
          ],
        },
      ],
    }),
    world({ roads: [bridge({ access: 'foot' })] }),
    world({ roads: [bridge({ rampStart: 400 })] }),
  ])
    assert.throws(() => createTerrain(bad), /Invalid terrain/);
  const terrain = createTerrain(world());
  for (const action of [
    () => terrain.isBlocked(NaN, 0),
    () => terrain.isBlocked(0, 0, -1),
    () => terrain.isWater(Infinity, 0),
    () => terrain.surfaceHeight(0, 0, NaN),
    () => terrain.surfaceHeight(0, 0, 0, { mode: null }),
    () => terrain.hasLineOfSight({}, { x: 1, y: 1 }),
    () => terrain.nearbyBuildings(0, 0, -1),
    () => terrain.neighbourhoodAt('0', 0),
  ])
    assert.throws(action, /Invalid terrain/);
});
