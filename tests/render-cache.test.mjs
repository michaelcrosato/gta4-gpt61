import test from 'node:test';
import assert from 'node:assert/strict';
import '../my-3d2dge.js';
import { createWorldRenderer } from '../src/renderer.js';

const E = globalThis.My3D2dge;
const originalDocument = globalThis.document;
const canvases = [];

class RasterCanvas {
  constructor() {
    this._width = 0;
    this._height = 0;
    this.pixels = new Float64Array(0);
    this.g = new RasterContext(this);
    canvases.push(this);
  }
  get width() {
    return this._width;
  }
  set width(value) {
    this._width = value;
    this.resize();
  }
  get height() {
    return this._height;
  }
  set height(value) {
    this._height = value;
    this.resize();
  }
  resize() {
    this.pixels = new Float64Array(this._width * this._height * 4);
  }
  getContext() {
    return this.g;
  }
}
class RasterContext {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = '#000000';
    this.globalAlpha = 1;
    this.globalCompositeOperation = 'source-over';
    this.filter = 'none';
    this.shadowBlur = 0;
    this.shadowOffsetX = 0;
    this.shadowOffsetY = 0;
    this.images = [];
    this.fills = 0;
  }
  getTransform() {
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }
  fillRect(x, y, w, h) {
    this.fills++;
    const color = E.hex(this.fillStyle).map((value) => value / 255),
      alpha = this.globalAlpha;
    const pixels = this.canvas.pixels,
      width = this.canvas.width,
      height = this.canvas.height;
    for (let row = Math.max(0, y); row < Math.min(height, y + h); row++)
      for (let column = Math.max(0, x); column < Math.min(width, x + w); column++) {
        const index = (row * width + column) * 4;
        for (let channel = 0; channel < 3; channel++)
          pixels[index + channel] = color[channel] * alpha + pixels[index + channel] * (1 - alpha);
        pixels[index + 3] = alpha + pixels[index + 3] * (1 - alpha);
      }
  }
  drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh) {
    assert.equal(arguments.length, 9, 'floor drawImage must crop its source explicitly');
    assert.equal(dw, sw);
    assert.equal(dh, sh);
    this.images.push({ source, sx, sy, sw, sh, dx, dy, dw, dh });
    for (let row = 0; row < sh; row++)
      for (let column = 0; column < sw; column++) {
        const targetX = dx + column,
          targetY = dy + row;
        if (
          targetX < 0 ||
          targetX >= this.canvas.width ||
          targetY < 0 ||
          targetY >= this.canvas.height
        )
          continue;
        const from = ((sy + row) * source.width + sx + column) * 4,
          to = (targetY * this.canvas.width + targetX) * 4;
        const alpha = source.pixels[from + 3] * this.globalAlpha;
        for (let channel = 0; channel < 3; channel++)
          this.canvas.pixels[to + channel] =
            source.pixels[from + channel] * this.globalAlpha +
            this.canvas.pixels[to + channel] * (1 - alpha);
        this.canvas.pixels[to + 3] = alpha + this.canvas.pixels[to + 3] * (1 - alpha);
      }
  }
}

const world = {
  width: 200,
  height: 150,
  buildings: [],
  locations: [],
  districts: [
    { x: 0, y: 0, w: 100, h: 150, color: '#789a73' },
    { x: 100, y: 0, w: 100, h: 150, color: '#a09571' },
  ],
  water: [{ x: 185, y: 0, w: 15, h: 150 }],
  roads: [
    { id: 'avenue', x1: 60, y1: 20, x2: 60, y2: 130, width: 30 },
    { id: 'street', x1: 20, y1: 70, x2: 180, y2: 70, width: 30 },
  ],
};
const state = {
  player: { x: 60, y: 70, angle: 0, health: 100, vehicleId: 'hidden' },
  vehicles: [],
  pedestrians: [],
  police: [],
  hostiles: [],
  bullets: [],
  mission: null,
};
function renderer(view, ix = 0, iy = 0, width = 64, height = 48, { uncached = false } = {}) {
  const cv = new RasterCanvas();
  cv.width = width;
  cv.height = height;
  const g = cv.getContext('2d');
  if (uncached) g.getTransform = undefined;
  return {
    ctx: g,
    view,
    ix,
    iy,
    bw: width,
    bh: height,
    W: width,
    H: height,
    w(x, y, z = 0) {
      const p = view.p(x, y, z);
      return [p[0] - ix, p[1] - iy];
    },
    visible(x, y, z = 0, margin = 60, up = 30, down = 90) {
      const p = this.w(x, y, z);
      return p[0] > -margin && p[0] < width + margin && p[1] > -up && p[1] < height + down;
    },
    sky() {
      g.fillStyle = '#263f40';
      g.fillRect(0, 0, width, height);
      g._c = null;
    },
    groundDisc(x, y, radius, color, alpha = 1, z = 0) {
      const points = [];
      for (let i = 0; i < 18; i++) {
        const angle = (i / 18) * Math.PI * 2;
        points.push(this.w(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, z));
      }
      E.px.polyDither(g, points, color, alpha, ix, iy);
    },
    queue() {},
    actor() {},
    shadow() {},
    overlay() {},
    groundRing() {},
  };
}
function assertPixels(actual, expected, label) {
  assert.equal(actual.ctx.canvas.pixels.length, expected.ctx.canvas.pixels.length);
  actual.ctx.canvas.pixels.forEach((value, index) =>
    assert.ok(
      Math.abs(value - expected.ctx.canvas.pixels[index]) < 1e-12,
      `${label}: component ${index} (${value} vs ${expected.ctx.canvas.pixels[index]})`,
    ),
  );
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

test('cached floor matches live procedural floor pixels across camera crops and both projections', () =>
  withCanvas(() => {
    const draw = createWorldRenderer({ time: 0, real: 0 }, world, {});
    const views = [
      new E.View('city', 'City', 35, 48, 0.7),
      new E.View('overhead', 'Overhead', 0, 82, 1),
    ];
    for (const view of views)
      for (const [ix, iy] of [
        [-45, -25],
        [0, 0],
        [25, 30],
        [100, 90],
        [160, 130],
      ]) {
        const cached = renderer(view, ix, iy),
          live = renderer(view, ix, iy, 64, 48, { uncached: true });
        draw.draw(cached, state, { rain: false });
        draw.draw(live, state, { rain: false });
        assertPixels(cached, live, `${view.id}:${ix},${iy}`);
        assert.ok(cached.ctx.images.length <= 1);
        for (const image of cached.ctx.images) {
          assert.ok(image.sw <= cached.bw && image.sh <= cached.bh);
          assert.ok(image.sx >= 0 && image.sy >= 0);
        }
      }
  }));

test('floor atlas builds once per transform, reuses across frames, and crops rather than blitting the whole world', () =>
  withCanvas(() => {
    const draw = createWorldRenderer({ time: 0, real: 0 }, world, {}),
      view = new E.View('city', 'City', 35, 48, 1);
    const a = renderer(view, 10, 15);
    draw.draw(a, state, { rain: false });
    assert.equal(a.ctx.images.length, 1);
    const atlas = a.ctx.images[0].source,
      initialFills = atlas.g.fills;
    assert.ok(atlas.width > a.bw && atlas.height > a.bh);
    const b = renderer(view, 40, 35);
    draw.draw(b, state, { rain: false });
    assert.equal(b.ctx.images[0].source, atlas);
    assert.equal(atlas.g.fills, initialFills);
    assert.equal(b.ctx.fills, 1, 'only the live sky draws floor primitives on a warmed frame');
    assert.equal(b.ctx.images[0].sw, b.bw);
    assert.equal(b.ctx.images[0].sh, b.bh);
    assert.equal(b.ctx.images[0].dw, b.bw);
    assert.equal(b.ctx.images[0].dh, b.bh);
  }));

test('floor atlases retain at most two transforms and release the least recently used backing store', () =>
  withCanvas(() => {
    const draw = createWorldRenderer({ time: 0, real: 0 }, world, {});
    const views = [
      new E.View('one', 'One', 0, 82, 1),
      new E.View('two', 'Two', 35, 48, 1),
      new E.View('three', 'Three', 15, 62, 1),
    ];
    const first = renderer(views[0]);
    draw.draw(first, state, { rain: false });
    const atlas1 = first.ctx.images[0].source;
    const second = renderer(views[1]);
    draw.draw(second, state, { rain: false });
    const atlas2 = second.ctx.images[0].source;
    const recent = renderer(views[0]);
    draw.draw(recent, state, { rain: false });
    assert.equal(recent.ctx.images[0].source, atlas1);
    const third = renderer(views[2]);
    draw.draw(third, state, { rain: false });
    assert.equal(atlas2.width, 0);
    assert.equal(atlas2.height, 0);
    assert.ok(atlas1.width > 0);
    const restored = renderer(views[1]);
    draw.draw(restored, state, { rain: false });
    assert.notEqual(restored.ctx.images[0].source, atlas2);
  }));

test('dither-style cache uses the same world-anchored pattern as live puddles', () =>
  withCanvas(() => {
    const previous = E.style.trans;
    E.style.trans = 'dither';
    try {
      const draw = createWorldRenderer({ time: 0, real: 0 }, world, {}),
        view = new E.View('city', 'City', 35, 48, 0.8);
      for (const [ix, iy] of [
        [-15, 5],
        [32, 17],
        [80, 60],
      ]) {
        const cached = renderer(view, ix, iy),
          live = renderer(view, ix, iy, 64, 48, { uncached: true });
        draw.draw(cached, state, { rain: false });
        draw.draw(live, state, { rain: false });
        assertPixels(cached, live, `dither ${ix},${iy}`);
      }
    } finally {
      E.style.trans = previous;
    }
  }));

test('camera outside the atlas still draws live sky and performs no out-of-range image copy', () =>
  withCanvas(() => {
    const draw = createWorldRenderer({ time: 0, real: 0 }, world, {}),
      view = new E.View('city', 'City', 0, 82, 1);
    const outside = renderer(view, 10000, 10000);
    draw.draw(outside, state, { rain: false });
    assert.equal(outside.ctx.images.length, 0);
    assert.equal(outside.ctx.fills, 1);
    assert.ok(outside.ctx.canvas.pixels[3] === 1);
  }));

test('oversized views and unsupported contexts fall back to live floor primitives without allocating an atlas', () =>
  withCanvas(() => {
    const draw = createWorldRenderer({ time: 0, real: 0 }, world, {}),
      huge = new E.View('huge', 'Huge', 0, 82, 30);
    const oversize = renderer(huge);
    const before = canvases.length;
    draw.draw(oversize, state, { rain: false });
    assert.equal(canvases.length, before);
    assert.equal(oversize.ctx.images.length, 0);
    assert.ok(oversize.ctx.fills > 1);
    const fractional = renderer(new E.View('normal', 'Normal', 0, 82, 1), 0.5, 0.25);
    draw.draw(fractional, state, { rain: false });
    assert.equal(fractional.ctx.images.length, 0);
    assert.ok(fractional.ctx.fills > 1);
  }));
