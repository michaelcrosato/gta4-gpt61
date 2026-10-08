import test from 'node:test';
import assert from 'node:assert/strict';
import { snapToRoad, findRoute } from '../src/navigation.js';
import { WORLD } from '../src/simulation.js';

const EPSILON = 1e-6;
const road = (id, x1, y1, x2, y2) => ({ id, x1, y1, x2, y2, width: 80 });
const length = (route) =>
  route
    .slice(1)
    .reduce(
      (sum, point, index) => sum + Math.hypot(point.x - route[index].x, point.y - route[index].y),
      0,
    );
function pointOnRoad(point, segment) {
  const dx = segment.x2 - segment.x1,
    dy = segment.y2 - segment.y1;
  const t = ((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / (dx * dx + dy * dy);
  const perpendicular = Math.abs((point.x - segment.x1) * dy - (point.y - segment.y1) * dx);
  return t >= -EPSILON && t <= 1 + EPSILON && perpendicular <= EPSILON;
}
function assertLegal(world, route) {
  assert.ok(route.length > 0);
  for (let index = 1; index < route.length; index += 1) {
    assert.ok(
      world.roads.some(
        (segment) => pointOnRoad(route[index - 1], segment) && pointOnRoad(route[index], segment),
      ),
      `Illegal road segment ${JSON.stringify(route[index - 1])} -> ${JSON.stringify(route[index])}`,
    );
  }
}

test('long routes cross the real city road network without cutting through blocks', () => {
  const journeys = [
    [
      { x: 480, y: 700 },
      { x: 1620, y: 1220 },
    ],
    [
      { x: 180, y: 440 },
      { x: 1380, y: 960 },
    ],
    [
      { x: 1620, y: 960 },
      { x: 1080, y: 180 },
    ],
    [
      { x: 155, y: 88 },
      { x: 1670, y: 1310 },
    ],
  ];
  for (const [start, end] of journeys) {
    const route = findRoute(WORLD, start, end);
    assertLegal(WORLD, route);
    const from = snapToRoad(WORLD, start),
      to = snapToRoad(WORLD, end);
    assert.deepEqual(route[0], { x: from.x, y: from.y });
    assert.deepEqual(route.at(-1), { x: to.x, y: to.y });
    assert.ok(
      Math.abs(length(route) - Math.abs(to.x - from.x) - Math.abs(to.y - from.y)) < EPSILON,
    );
  }
});

test('off-road markers project onto the nearest segment with exact clamped coordinates', () => {
  const world = { roads: [road('horizontal', 0, 20, 100, 20), road('vertical', 70, 20, 70, 100)] };
  const marker = { x: 30, y: 42 };
  assert.deepEqual(snapToRoad(world, marker), {
    x: 30,
    y: 20,
    t: 0.3,
    distance: 22,
    roadId: 'horizontal',
    roadIndex: 0,
  });
  assert.deepEqual(marker, { x: 30, y: 42 });
  assert.deepEqual(snapToRoad(world, { x: -30, y: 20 }), {
    x: 0,
    y: 20,
    t: 0,
    distance: 30,
    roadId: 'horizontal',
    roadIndex: 0,
  });
  const route = findRoute(world, marker, { x: 84, y: 89 });
  assert.deepEqual(route[0], { x: 30, y: 20 });
  assert.deepEqual(route.at(-1), { x: 70, y: 89 });
  assertLegal(world, route);
});

test('GPS chooses the shorter legal route when a longer detour competes', () => {
  const world = {
    roads: [
      road('left', 0, 0, 0, 90),
      road('right', 100, 0, 100, 90),
      road('short-bridge', 0, 20, 100, 20),
      road('long-bridge', 0, 90, 100, 90),
    ],
  };
  const route = findRoute(world, { x: 0, y: 0 }, { x: 100, y: 0 });
  assertLegal(world, route);
  assert.equal(length(route), 140);
  assert.ok(route.some((point) => point.x === 0 && point.y === 20));
  assert.equal(
    route.some((point) => point.y === 90),
    false,
  );
});

test('roads crossing away from endpoints connect at the actual intersection', () => {
  const world = { roads: [road('east-west', 0, 50, 100, 50), road('north-south', 50, 0, 50, 100)] };
  const route = findRoute(world, { x: 10, y: 50 }, { x: 50, y: 90 });
  assert.deepEqual(route, [
    { x: 10, y: 50 },
    { x: 50, y: 50 },
    { x: 50, y: 90 },
  ]);
  assert.equal(length(route), 80);
  assertLegal(world, route);
});

test('collinear overlapping roads and reversed segments retain their connections', () => {
  const world = {
    roads: [
      road('first', 0, 0, 70, 0),
      road('second-reversed', 110, 0, 30, 0),
      road('spur', 90, 0, 90, 40),
    ],
  };
  const route = findRoute(world, { x: 10, y: 0 }, { x: 90, y: 35 });
  assertLegal(world, route);
  assert.equal(length(route), 115);
  assert.deepEqual(route.at(-1), { x: 90, y: 35 });
});

test('disconnected and parallel road networks return no fabricated route', () => {
  const world = { roads: [road('west', 0, 0, 0, 100), road('east', 100, 0, 100, 100)] };
  assert.deepEqual(findRoute(world, { x: 0, y: 20 }, { x: 100, y: 80 }), []);
  const separated = { roads: [road('a', 0, 0, 40, 0), road('b', 45, 0, 90, 0)] };
  assert.deepEqual(findRoute(separated, { x: 10, y: 0 }, { x: 80, y: 0 }), []);
});

test('coincident projected destinations return one road point', () => {
  const world = { roads: [road('street', 0, 0, 100, 0)] };
  assert.deepEqual(findRoute(world, { x: 25, y: 0 }, { x: 25, y: 0 }), [{ x: 25, y: 0 }]);
  assert.deepEqual(findRoute(world, { x: 25, y: 10 }, { x: 25, y: -10 }), [{ x: 25, y: 0 }]);
});

test('diagonal authored roads remain legal roads rather than being replaced by artificial L shapes', () => {
  const world = { roads: [road('diagonal', 0, 0, 100, 100), road('crossing', 50, 0, 50, 100)] };
  const projected = snapToRoad(world, { x: 20, y: 30 });
  assert.ok(Math.abs(projected.x - 25) < EPSILON && Math.abs(projected.y - 25) < EPSILON);
  const route = findRoute(world, { x: 0, y: 0 }, { x: 50, y: 90 });
  assertLegal(world, route);
  assert.ok(Math.abs(length(route) - Math.hypot(50, 50) - 40) < EPSILON);
});

test('invalid points, empty worlds, and unusable road definitions fail honestly', () => {
  assert.equal(snapToRoad({}, { x: 0, y: 0 }), null);
  assert.equal(snapToRoad(WORLD, { x: NaN, y: 0 }), null);
  assert.deepEqual(findRoute(WORLD, { x: 0, y: 0 }, { x: Infinity, y: 0 }), []);
  const malformed = { roads: [null, road('zero', 1, 1, 1, 1), road('bad', 0, NaN, 20, 20)] };
  assert.equal(snapToRoad(malformed, { x: 0, y: 0 }), null);
  assert.deepEqual(findRoute(malformed, { x: 0, y: 0 }, { x: 10, y: 10 }), []);
});

test('routing is deterministic and preserves immutable input geometry', () => {
  const snapshot = JSON.stringify(WORLD);
  const a = findRoute(WORLD, { x: 500, y: 703 }, { x: 1380, y: 1100 });
  const b = findRoute(WORLD, { x: 500, y: 703 }, { x: 1380, y: 1100 });
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(WORLD), snapshot);
});
