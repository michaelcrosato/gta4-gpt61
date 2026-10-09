import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialIndex } from '../src/spatial-index.js';

function intersects(a, b) {
  return a.x + a.w >= b.x && a.x <= b.x + b.w && a.y + a.h >= b.y && a.y <= b.y + b.h;
}
const brute = (items, bounds, getBounds = (item) => item) =>
  [...new Set(items)].filter((item) => intersects(getBounds(item), bounds));

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test('closed edge contacts, negative cells, points and lines match geometric overlap', () => {
  const items = [
    { id: 'negative', x: -512, y: -256, w: 256, h: 256 },
    { id: 'origin', x: 0, y: 0, w: 256, h: 256 },
    { id: 'point', x: 256, y: 256, w: 0, h: 0 },
    { id: 'line', x: 256, y: -256, w: 0, h: 512 },
    { id: 'next', x: 256, y: 0, w: 256, h: 256 },
  ];
  const index = createSpatialIndex(items);
  assert.deepEqual(index.queryRect({ x: 256, y: 256, w: 0, h: 0 }), items.slice(1));
  assert.deepEqual(index.queryRadius(-256, 0, 0), [items[0]]);
  for (const x of [-512, -256, -0.001, 0, 256, 512, 512.001])
    for (const y of [-256, -0.001, 0, 256, 256.001]) {
      const query = { x, y, w: 0, h: 0 };
      assert.deepEqual(index.queryRect(query), brute(items, query));
    }
});

test('multi-cell and repeated input entries return one original reference in original order', () => {
  const a = { id: 'a', x: 500, y: 500, w: 700, h: 700 };
  const b = { id: 'b', x: 0, y: 0, w: 800, h: 800 };
  const c = { id: 'c', x: 200, y: 200, w: 100, h: 100 };
  const index = createSpatialIndex([a, b, a, c, b], { cellSize: 100 });
  const result = index.queryRect({ x: 0, y: 0, w: 1500, h: 1500 });
  assert.equal(result.length, 3);
  assert.equal(result[0], a);
  assert.equal(result[1], b);
  assert.equal(result[2], c);
  result.pop();
  assert.deepEqual(index.queryRect({ x: 200, y: 200, w: 100, h: 100 }), [b, c]);
});

test('huge bounds use a bounded fallback and mix with regular cells in stable order', () => {
  const items = [
    { id: 'far', x: 1e12, y: 1e12, w: 10, h: 10 },
    { id: 'continent', x: -1e12, y: -1e12, w: 2e12, h: 2e12 },
    { id: 'block', x: -5, y: -5, w: 10, h: 10 },
    { id: 'huge-line', x: -1e12, y: 0, w: 2e12, h: 0 },
    { id: 'astronomical-point', x: 1e100, y: -1e100, w: 0, h: 0 },
  ];
  const index = createSpatialIndex(items, { cellSize: 0.1 });
  assert.deepEqual(index.queryRadius(0, 0, 0), [items[1], items[2], items[3]]);
  assert.deepEqual(index.queryRadius(1e100, -1e100, 0), [items[4]]);
  for (const query of [
    { x: -1e12, y: -1e12, w: 2e12 + 10, h: 2e12 + 10 },
    { x: 0, y: 100, w: 1, h: 1 },
    { x: 1e12, y: 1e12, w: 0, h: 0 },
  ])
    assert.deepEqual(index.queryRect(query), brute(items, query));
});

test('subnormal cell sizes and maximum safe cell indices cannot create non-advancing loops', () => {
  const point = { x: Number.MAX_SAFE_INTEGER, y: -Number.MAX_SAFE_INTEGER, w: 0, h: 0 };
  const origin = { x: 0, y: 0, w: 0, h: 0 };
  for (const cellSize of [1, Number.MIN_VALUE]) {
    const index = createSpatialIndex([point, origin], { cellSize });
    assert.deepEqual(index.queryRect(point), [point]);
    assert.deepEqual(index.queryRadius(0, 0, 0), [origin]);
  }
});

test('radius queries retain all true circle contacts and document bounding-square candidates', () => {
  const corner = { x: 9, y: 9, w: 1, h: 1 };
  const tangent = { x: 10, y: 0, w: 0, h: 0 };
  const outside = { x: 10.001, y: 0, w: 0, h: 0 };
  const index = createSpatialIndex([corner, tangent, outside], { cellSize: 2 });
  assert.deepEqual(index.queryRadius(0, 0, 10), [corner, tangent]);
  assert.ok(Math.hypot(corner.x, corner.y) > 10);
});

test('custom envelopes support road and landform objects without mutating input or bounds', () => {
  const bounds = Object.freeze({ x: -50, y: -10, w: 100, h: 20 });
  const road = Object.freeze({
    id: 'road',
    envelope: bounds,
    points: Object.freeze([
      [-50, 0],
      [50, 0],
    ]),
  });
  const landform = Object.freeze({
    id: 'island',
    envelope: Object.freeze({ x: 100, y: 100, w: 50, h: 40 }),
  });
  const items = Object.freeze([landform, road]);
  let calls = 0;
  const index = createSpatialIndex(items, {
    getBounds: (item) => {
      calls++;
      return item.envelope;
    },
  });
  const query = Object.freeze({ x: -20, y: -5, w: 40, h: 10 });
  assert.deepEqual(index.queryRect(query), [road]);
  assert.deepEqual(index.queryRadius(125, 120, 0), [landform]);
  assert.equal(calls, 2);
  assert.deepEqual(bounds, { x: -50, y: -10, w: 100, h: 20 });
});

test('static bounds and source order are snapshots while returned items retain identity', () => {
  const bounds = { x: 0, y: 0, w: 10, h: 10 };
  const a = { id: 'a', bounds },
    b = { id: 'b', bounds: { x: 0, y: 0, w: 10, h: 10 } };
  const items = [a, b];
  const index = createSpatialIndex(items, { getBounds: (item) => item.bounds });
  items.reverse();
  items.length = 0;
  bounds.x = 1000;
  a.id = 'updated a';
  const result = index.queryRadius(5, 5, 0);
  assert.equal(result[0], a);
  assert.equal(result[1], b);
  assert.equal(result[0].id, 'updated a');
  assert.deepEqual(index.queryRadius(1000, 0, 0), []);
});

test('empty indexes return fresh arrays and still validate every query', () => {
  const index = createSpatialIndex([]);
  const first = index.queryRect({ x: -10, y: -10, w: 20, h: 20 });
  assert.deepEqual(first, []);
  assert.notEqual(first, index.queryRadius(0, 0, 100));
  assert.throws(() => index.queryRadius(NaN, 0, 1), /Invalid spatial/);
});

test('generated layouts and queries agree exactly with independent brute-force rectangle overlap', () => {
  for (let seed = 1; seed <= 16; seed++) {
    const random = seeded(seed);
    const items = Array.from({ length: 240 }, (_, id) => ({
      id,
      x: Math.floor(random() * 16000) - 8000,
      y: Math.floor(random() * 16000) - 8000,
      w: id % 17 === 0 ? 0 : Math.floor(random() * 1200),
      h: id % 19 === 0 ? 0 : Math.floor(random() * 1200),
    }));
    items.splice(37, 0, items[11]);
    items.push({ id: 'overflow', x: -20000, y: -20000, w: 40000, h: 40000 });
    const index = createSpatialIndex(items, { cellSize: [17, 64, 256, 511][seed % 4] });
    for (let q = 0; q < 180; q++) {
      const bounds = {
        x: Math.floor(random() * 24000) - 12000,
        y: Math.floor(random() * 24000) - 12000,
        w: q % 23 === 0 ? 30000 : Math.floor(random() * 1800),
        h: q % 29 === 0 ? 30000 : Math.floor(random() * 1800),
      };
      assert.deepEqual(
        index.queryRect(bounds),
        brute(items, bounds),
        `seed ${seed} rectangle ${q}`,
      );
      const radius = Math.floor(random() * 1200);
      const square = { x: bounds.x - radius, y: bounds.y - radius, w: 2 * radius, h: 2 * radius };
      assert.deepEqual(
        index.queryRadius(bounds.x, bounds.y, radius),
        brute(items, square),
        `seed ${seed} radius ${q}`,
      );
    }
  }
});

test('invalid items, geometry, options and queries fail safely without mutating inputs', () => {
  const valid = { x: 0, y: 0, w: 1, h: 1 };
  for (const items of [null, {}, 'items', [null], [{}], Array(1)])
    assert.throws(() => createSpatialIndex(items), /Invalid spatial/);
  for (const options of [
    null,
    [],
    { cellSize: 0 },
    { cellSize: -1 },
    { cellSize: NaN },
    { cellSize: Infinity },
    { cellSize: '256' },
    { getBounds: null },
  ])
    assert.throws(() => createSpatialIndex([valid], options), /Invalid spatial/);
  for (const bad of [
    { ...valid, x: NaN },
    { ...valid, y: Infinity },
    { ...valid, w: -1 },
    { ...valid, h: -1 },
    { ...valid, w: undefined },
    { ...valid, x: '0' },
    { ...valid, x: Number.MAX_VALUE, w: Number.MAX_VALUE },
  ]) {
    const snapshot = { ...bad };
    assert.throws(() => createSpatialIndex([bad]), /Invalid spatial/);
    assert.deepEqual(bad, snapshot);
  }
  const index = createSpatialIndex([valid]);
  for (const query of [null, [], {}, { ...valid, w: -1 }, { ...valid, x: Infinity }])
    assert.throws(() => index.queryRect(query), /Invalid spatial/);
  for (const [x, y, radius] of [
    [0, 0, -1],
    [NaN, 0, 1],
    [0, Infinity, 1],
    [0, 0, '1'],
    [Number.MAX_VALUE, 0, Number.MAX_VALUE],
  ])
    assert.throws(() => index.queryRadius(x, y, radius), /Invalid spatial/);
  assert.deepEqual(valid, { x: 0, y: 0, w: 1, h: 1 });
  assert.deepEqual(index.queryRadius(0, 0, 0), [valid]);
});
