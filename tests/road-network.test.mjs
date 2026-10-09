import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoadNetwork,
  findRoute,
  snapToRoad,
  invalidateRoadNetwork,
} from '../src/navigation.js';
const road = (id, x1, y1, x2, y2, extra = {}) => ({ id, x1, y1, x2, y2, ...extra });
const length = (route) =>
  route.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - route[i].x, p.y - route[i].y), 0);

test('moving endpoints reuse topology without changing its vertices or edges', () => {
  const world = { roads: [road('east-west', 0, 0, 100, 0), road('north-south', 50, -50, 50, 50)] };
  const graph = createRoadNetwork(world),
    nodes = graph.nodes.length,
    edges = graph.nodes.reduce((sum, node) => sum + node.edges.size, 0);
  for (let i = 1; i < 100; i++) {
    assert.ok(
      Math.abs(
        length(findRoute(world, { x: i, y: 0 }, { x: 50, y: 40 })) - (Math.abs(i - 50) + 40),
      ) < 1e-7,
    );
    assert.equal(createRoadNetwork(world), graph);
  }
  assert.equal(graph.nodes.length, nodes);
  assert.equal(
    graph.nodes.reduce((sum, node) => sum + node.edges.size, 0),
    edges,
  );
});
test('foot access permits a short footbridge while cars take a legal detour and closed roads remain absent', () => {
  const world = {
    roads: [
      road('west', 0, 0, 0, 10),
      road('north', 0, 10, 10, 10),
      road('east', 10, 10, 10, 0),
      road('walk', 0, 0, 10, 0, { access: ['foot'] }),
      road('closed', 0, 0, 10, 0, { access: [] }),
    ],
  };
  assert.equal(length(findRoute(world, { x: 0, y: 0 }, { x: 10, y: 0 })), 30);
  assert.equal(length(findRoute(world, { x: 0, y: 0 }, { x: 10, y: 0 }, { mode: 'foot' })), 10);
  assert.ok(
    !createRoadNetwork(world).segments.some((segment) =>
      ['walk', 'closed'].includes(segment.road.id),
    ),
  );
});
test('an overhead interior crossing does not invent a junction or instant layer change', () => {
  const world = {
    roads: [
      road('street', -20, 0, 20, 0),
      road('overpass', 0, -20, 0, 20, { z: 28, kind: 'bridge' }),
    ],
  };
  assert.deepEqual(findRoute(world, { x: -10, y: 0, z: 0 }, { x: 0, y: 10, z: 28 }), []);
  assert.deepEqual(findRoute(world, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 28 }), []);
  assert.equal(createRoadNetwork(world).components, 2);
});
test('explicit terminal ramps join an elevated bridge to both ground approaches', () => {
  const world = {
    roads: [
      road('left', -10, 0, 0, 0),
      road('up', 0, 0, 10, 0, { z1: 0, z2: 28, kind: 'bridge' }),
      road('deck', 10, 0, 20, 0, { z1: 28, z2: 28, kind: 'bridge' }),
      road('down', 20, 0, 30, 0, { z1: 28, z2: 0, kind: 'bridge' }),
      road('right', 30, 0, 40, 0),
    ],
  };
  const route = findRoute(world, { x: -5, y: 0, z: 0 }, { x: 35, y: 0, z: 0 });
  assert.equal(length(route), 40);
  assert.equal(createRoadNetwork(world).components, 1);
  assert.deepEqual(route[0], { x: -5, y: 0 });
  assert.deepEqual(route.at(-1), { x: 35, y: 0 });
});
test('coincident explicit road layers stay separate and snapping follows actor height', () => {
  const world = {
    roads: [
      road('ground', 0, 0, 20, 0, { z1: 0, z2: 0 }),
      road('upper', 0, 0, 20, 0, { z1: 28, z2: 28 }),
    ],
  };
  assert.equal(snapToRoad(world, { x: 10, y: 0, z: 28 }).roadId, 'upper');
  assert.equal(snapToRoad(world, { x: 10, y: 0, z: 0 }).roadId, 'ground');
  assert.equal(createRoadNetwork(world).components, 2);
});
test('revision and explicit invalidation rebuild changed static geometry', () => {
  const world = { roads: [road('street', 0, 0, 10, 0)] },
    first = createRoadNetwork(world);
  world.roads[0].x2 = 20;
  invalidateRoadNetwork(world);
  const second = createRoadNetwork(world);
  assert.notEqual(first, second);
  assert.equal(snapToRoad(world, { x: 25, y: 0 }).x, 20);
  world.roads[0].x2 = 30;
  world.navigationRevision = 1;
  assert.notEqual(createRoadNetwork(world), second);
});
test('a large grid yields exact shortest routes from one compiled topology', () => {
  const roads = [];
  for (let i = 0; i < 18; i++) {
    roads.push(road(`v${i}`, i * 100, 0, i * 100, 1700));
    roads.push(road(`h${i}`, 0, i * 100, 1700, i * 100));
  }
  const world = { roads },
    graph = createRoadNetwork(world);
  for (let i = 0; i < 80; i++) {
    const a = { x: (i % 18) * 100, y: ((i * 7) % 18) * 100 },
      b = { x: ((i * 11) % 18) * 100, y: ((i * 13) % 18) * 100 };
    assert.equal(length(findRoute(world, a, b)), Math.abs(a.x - b.x) + Math.abs(a.y - b.y));
    assert.equal(createRoadNetwork(world), graph);
  }
});
