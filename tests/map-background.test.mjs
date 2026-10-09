import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapBackground, createMapProjection } from '../src/map-background.js';

class Canvas {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.g = new Context(this);
  }
  getContext() {
    return this.g;
  }
}
class Context {
  constructor(canvas) {
    this.canvas = canvas;
    this.commands = [];
    this.images = [];
    this.path = [];
    this.clips = [];
    this.stack = [];
    this.dash = [];
  }
  save() {
    this.stack.push({
      clips: [...this.clips],
      dash: [...this.dash],
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
    });
  }
  restore() {
    Object.assign(this, this.stack.pop());
  }
  beginPath() {
    this.path = [];
  }
  moveTo(x, y) {
    this.path.push(['move', x, y]);
  }
  lineTo(x, y) {
    this.path.push(['line', x, y]);
  }
  closePath() {
    this.path.push(['close']);
  }
  rect(x, y, w, h) {
    this.path.push(['rect', x, y, w, h]);
  }
  clip(rule = 'nonzero') {
    this.clips.push({ rule, path: [...this.path] });
    this.commands.push({ kind: 'clip', rule, path: [...this.path] });
  }
  setLineDash(dash) {
    this.dash = [...dash];
  }
  fill() {
    this.commands.push({ kind: 'fill', color: this.fillStyle, path: [...this.path] });
  }
  stroke() {
    this.commands.push({
      kind: 'stroke',
      color: this.strokeStyle,
      width: this.lineWidth,
      dash: [...this.dash],
      path: [...this.path],
      clips: [...this.clips],
    });
  }
  fillRect(x, y, w, h) {
    this.commands.push({ kind: 'rect', color: this.fillStyle, x, y, w, h });
  }
  fillText(text, x, y) {
    this.commands.push({ kind: 'text', text, x, y });
  }
  drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh) {
    this.images.push({ source, sx, sy, sw, sh, dx, dy, dw, dh });
  }
}
function world(extra = {}) {
  return {
    width: 1000,
    height: 1000,
    spawn: { x: 500, y: 500 },
    buildings: [],
    roads: [],
    districts: [],
    ...extra,
  };
}
function map(world, options = {}) {
  const canvases = [];
  const background = createMapBackground(world, {
    canvasFactory: () => {
      const canvas = new Canvas();
      canvases.push(canvas);
      return canvas;
    },
    ...options,
  });
  return { background, canvases };
}
function target(width, height) {
  const canvas = new Canvas();
  canvas.width = width;
  canvas.height = height;
  return canvas.g;
}

test('full and mini projections share exact origins, route/player alignment and inverse hit testing', () => {
  const city = world({ width: 12000, height: 10000, spawn: { x: 480, y: 700 } });
  const full = createMapProjection(city, 900, 700, { full: true });
  assert.equal(full.scale, 0.07);
  assert.ok(Math.abs(full.originX - 30) < 1e-10);
  assert.ok(Math.abs(full.originY) < 1e-10);
  const player = full.project(480, 700);
  assert.ok(Math.abs(player[0] - 63.6) < 1e-10);
  assert.ok(Math.abs(player[1] - 49) < 1e-10);
  const inverse = full.unproject(...player);
  assert.ok(Math.abs(inverse.x - 480) < 1e-10);
  assert.ok(Math.abs(inverse.y - 700) < 1e-10);
  const mini = createMapProjection(city, 228, 156, { center: city.spawn });
  assert.deepEqual(mini.project(480, 700), [114, 78]);
  assert.deepEqual(mini.project(580, 700), [151, 78]);
  assert.ok(Math.abs(mini.unproject(151, 78).x - 580) < 1e-10);
});

test('polygon landforms and lakes draw exact coast/island geometry instead of district rectangles or coarse ocean tiles', () => {
  const city = world({
    width: 200,
    height: 200,
    districts: [{ id: 'test', name: 'Test', x: 0, y: 0, w: 200, h: 200, color: '#789a73' }],
    landforms: [
      {
        districtId: 'test',
        polygon: [
          [0, 0],
          [200, 0],
          [0, 200],
        ],
      },
    ],
    lakes: [{ x: 30, y: 30, w: 20, h: 20 }],
    water: [{ x: 40, y: 40, w: 100, h: 100 }],
  });
  const { background } = map(city),
    g = target(200, 200);
  background.draw(g, createMapProjection(city, 200, 200, { full: true }));
  const commands = g.images[0].source.g.commands;
  assert.ok(
    commands.some(
      (c) =>
        c.kind === 'fill' &&
        JSON.stringify(c.path) ===
          JSON.stringify([['move', 0, 0], ['line', 200, 0], ['line', 0, 200], ['close']]),
    ),
  );
  assert.ok(
    commands.some(
      (c) =>
        c.kind === 'rect' &&
        c.color === '#1b3d43' &&
        c.x === 30 &&
        c.y === 30 &&
        c.w === 20 &&
        c.h === 20,
    ),
  );
  assert.ok(!commands.some((c) => c.kind === 'rect' && c.x === 40 && c.y === 40));
  assert.equal(commands.filter((c) => c.kind === 'rect' && c.w === 200 && c.h === 200).length, 1);
});

test('diagonal and reversed road endpoints use the same projection as all other map geometry', () => {
  const city = world({
    width: 200,
    height: 200,
    roads: [{ id: 'diagonal', x1: 180, y1: 170, x2: 20, y2: 10, width: 20 }],
  });
  const { background } = map(city),
    g = target(100, 100);
  background.draw(g, createMapProjection(city, 100, 100, { full: true }));
  const main = g.images[0].source.g.commands.find(
    (c) => c.kind === 'stroke' && c.color === '#304236',
  );
  assert.deepEqual(main.path, [
    ['move', 90, 85],
    ['line', 10, 5],
  ]);
  assert.equal(main.width, 10);
});

test('ground roads clip to polygon land and every lake, while explicit elevated/rail/tunnel/closed styles stay distinct', () => {
  const road = { x1: 10, y1: 50, x2: 190, y2: 50, width: 20 };
  const city = world({
    width: 200,
    height: 200,
    landforms: [
      {
        polygon: [
          [0, 0],
          [200, 0],
          [0, 200],
        ],
      },
    ],
    lakes: [
      { x: 30, y: 30, w: 20, h: 20 },
      { x: 40, y: 40, w: 20, h: 20 },
    ],
    roads: [
      { ...road, id: 'street', access: ['foot', 'car'] },
      { ...road, id: 'path', y1: 60, y2: 60, access: ['foot'] },
      { ...road, id: 'bridge', y1: 70, y2: 70, bridge: true, z: 28, access: ['foot', 'car'] },
      { ...road, id: 'rail', y1: 80, y2: 80, access: ['rail'] },
      { ...road, id: 'tunnel', y1: 90, y2: 90, tunnel: true, z: -18, access: ['car'] },
      { ...road, id: 'closed', y1: 100, y2: 100, access: [] },
    ],
  });
  const { background } = map(city),
    g = target(200, 200);
  background.draw(g, createMapProjection(city, 200, 200, { full: true }));
  const commands = g.images[0].source.g.commands,
    strokes = commands.filter((c) => c.kind === 'stroke');
  for (const color of ['#304236', '#8a9d75', '#87886d', '#8f9fa7', '#718d9e', '#ab7669'])
    assert.ok(
      strokes.some((c) => c.color === color),
      color,
    );
  assert.equal(strokes.find((c) => c.color === '#304236').clips.length, 3);
  assert.equal(strokes.find((c) => c.color === '#87886d').clips.length, 0);
  assert.deepEqual(strokes.find((c) => c.color === '#ab7669').dash, [6, 4]);
  assert.deepEqual(strokes.find((c) => c.color === '#718d9e').dash, [5, 4]);
  assert.equal(commands.filter((c) => c.kind === 'clip' && c.rule === 'evenodd').length, 2);
});

test('warmed mini views reuse tile canvases and rerender neither coast nor building/road primitives', () => {
  const city = world({
    buildings: [{ x: 100, y: 100, w: 30, h: 30 }],
    roads: [{ id: 'street', x1: 0, y1: 100, x2: 250, y2: 100, width: 20 }],
  });
  const { background } = map(city),
    a = target(100, 100),
    b = target(100, 100);
  background.draw(a, createMapProjection(city, 100, 100, { center: { x: 128, y: 128 }, scale: 1 }));
  const first = background.stats(),
    primitiveCount = a.images[0].source.g.commands.length;
  background.draw(b, createMapProjection(city, 100, 100, { center: { x: 138, y: 138 }, scale: 1 }));
  assert.equal(a.images[0].source, b.images[0].source);
  assert.equal(background.stats().tileRenders, first.tileRenders);
  assert.equal(b.images[0].source.g.commands.length, primitiveCount);
  assert.equal(b.commands.length, 0);
  assert.equal(b.images[0].sx, a.images[0].sx + 10);
  assert.equal(b.images[0].sy, a.images[0].sy + 10);
});

test('tile blits crop to the actual viewport at fractional origins, negative coordinates and boundaries', () => {
  const city = world(),
    { background } = map(city);
  for (const center of [
    { x: -500, y: -200 },
    { x: 0, y: 0 },
    { x: 255.5, y: 256.25 },
    { x: 600, y: 600 },
  ]) {
    const g = target(228, 156),
      p = createMapProjection(city, 228, 156, { center, scale: 1 });
    background.draw(g, p);
    assert.ok(g.images.length <= 4);
    let area = 0;
    for (const image of g.images) {
      assert.ok(image.sx >= 2 && image.sy >= 2);
      assert.ok(image.sx + image.sw <= image.source.width - 2 + 1e-8);
      assert.ok(image.sy + image.sh <= image.source.height - 2 + 1e-8);
      assert.ok(
        image.dx >= 0 && image.dy >= 0 && image.dx + image.dw <= 228 && image.dy + image.dh <= 156,
      );
      assert.equal(image.dw, image.sw);
      assert.equal(image.dh, image.sh);
      area += image.dw * image.dh;
    }
    assert.ok(Math.abs(area - 228 * 156) < 1e-8, 'tiles cover the entire visible viewport once');
  }
});

test('LRU tiles remain bounded across city travel and release evicted native backing stores', () => {
  const city = world({ width: 20000 }),
    { background, canvases } = map(city, { maxTiles: 4 });
  for (let x = 128; x < 4000; x += 300) {
    const g = target(100, 100);
    background.draw(g, createMapProjection(city, 100, 100, { center: { x, y: 128 }, scale: 1 }));
    assert.ok(background.stats().tiles <= 4);
    assert.ok(background.stats().cachedPixels <= 4 * 260 * 260);
  }
  assert.ok(canvases.filter((canvas) => canvas.width === 0 && canvas.height === 0).length >= 6);
  background.clear();
  assert.equal(background.stats().tiles, 0);
  assert.equal(background.stats().cachedPixels, 0);
  assert.ok(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0));
});

test('full map reuses one bitmap, independent of player movement, and replaces it on output resize', () => {
  const city = world(),
    { background } = map(city),
    a = target(900, 700),
    b = target(900, 700);
  background.draw(a, createMapProjection(city, 900, 700, { full: true, center: { x: 10, y: 10 } }));
  background.draw(
    b,
    createMapProjection(city, 900, 700, { full: true, center: { x: 900, y: 900 } }),
  );
  assert.equal(a.images[0].source, b.images[0].source);
  assert.equal(background.stats().fullRenders, 1);
  const c = target(700, 500);
  background.draw(c, createMapProjection(city, 700, 500, { full: true }));
  assert.equal(background.stats().fullRenders, 2);
  assert.equal(a.images[0].source.width, 0);
  assert.equal(background.stats().cachedPixels, 700 * 500);
});

test('scale changes create appropriate tiles while static world arrays and geometry are captured once', () => {
  let reads = 0;
  const buildings = Array.from({ length: 2000 }, (_, i) => ({
    get x() {
      reads++;
      return i * 300;
    },
    y: 100,
    w: 20,
    h: 20,
  }));
  const city = world({ width: 700000, buildings }),
    { background } = map(city);
  assert.equal(reads, 2000);
  reads = 0;
  city.buildings.length = 0;
  const g = target(100, 100);
  for (const scale of [1, 0.5, 1, 0.5])
    background.draw(g, createMapProjection(city, 100, 100, { center: { x: 128, y: 128 }, scale }));
  assert.equal(reads, 0);
  assert.ok(background.stats().tileRenders <= 5);
  assert.ok(
    g.images.some((image) =>
      image.source.g.commands.some((c) => c.kind === 'rect' && c.color === '#526654'),
    ),
  );
});

test('place labels resolve authoritative region/district IDs rather than overlapping district rectangles', () => {
  const city = world({
    districts: [
      { id: 'wrong', name: 'Wrong District', x: 0, y: 0, w: 1000, h: 1000 },
      { id: 'actual', name: 'Ironhaven', x: 0, y: 0, w: 1000, h: 1000 },
    ],
    neighbourhoods: [
      { id: 'area', name: 'Foundry Court', districtId: 'actual', x: 0, y: 0, w: 1000, h: 1000 },
    ],
  });
  const { background } = map(city);
  assert.deepEqual(background.place({ neighbourhood: 'area', district: 'wrong' }), {
    areaName: 'Foundry Court',
    districtName: 'Ironhaven',
  });
  assert.deepEqual(background.place({ neighbourhood: null, district: 'actual' }), {
    areaName: null,
    districtName: 'Ironhaven',
  });
  assert.deepEqual(background.place({ district: 'missing' }), {
    areaName: null,
    districtName: 'Harbor City',
  });
});

test('legacy rectangle water remains visible and invalid geometry/viewports fail safely', () => {
  const city = world({ water: [{ x: 100, y: 0, w: 50, h: 1000 }] }),
    { background } = map(city),
    g = target(100, 100);
  background.draw(g, createMapProjection(city, 100, 100, { full: true }));
  assert.ok(
    g.images[0].source.g.commands.some(
      (c) => c.kind === 'rect' && c.color === '#1b3d43' && c.x === 10 && c.w === 5,
    ),
  );
  for (const options of [
    { tilePixels: 0 },
    { tilePixels: 513 },
    { maxTiles: 100 },
    { canvasFactory: null },
  ])
    assert.throws(() => createMapBackground(city, options), /Invalid city map/);
  assert.throws(() => createMapProjection(city, 0, 100), /Invalid city map/);
  assert.throws(() => createMapProjection(city, 100, 100, { scale: 0 }), /Invalid city map/);
  assert.throws(
    () => background.draw(g, { width: 100, height: 100, scale: 1, originX: 1e100, originY: 0 }),
    /Invalid city map/,
  );
  assert.equal(g.stack.length, 0);
});
