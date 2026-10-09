import test from 'node:test';
import assert from 'node:assert/strict';
import '../my-3d2dge.js';
import { createCityGroundRenderer, buildGroundPrimitives } from '../src/city-ground.js';
import { RasterCanvas, canvases } from './helpers/raster-canvas.mjs';
const E = globalThis.My3D2dge;
const originalDocument = globalThis.document;
const world = {
  width: 12000,
  height: 10000,
  landforms: [
    {
      polygon: [
        [40, 40],
        [1800, 40],
        [1800, 1500],
        [40, 1500],
      ],
    },
  ],
  lakes: [{ x: 300, y: 280, w: 110, h: 70 }],
  districts: [],
  neighbourhoods: [
    { profile: 'park', bounds: { x: 40, y: 40, w: 660, h: 1400 } },
    { profile: 'finance', bounds: { x: 700, y: 40, w: 1000, h: 1400 } },
  ],
  roads: [
    { id: 'reversed', x1: 1600, y1: 160, x2: 80, y2: 160, width: 60, access: ['car', 'foot'] },
    { id: 'diagonal', x1: 80, y1: 80, x2: 1600, y2: 1400, width: 40, access: ['car', 'foot'] },
    { id: 'walk', x1: 500, y1: 500, x2: 500, y2: 1400, width: 22, access: ['foot'] },
  ],
  sites: [],
  airport: { runways: [] },
};
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
function context(view, ix, iy) {
  const cv = new RasterCanvas();
  cv.width = 72;
  cv.height = 55;
  return {
    ctx: cv.g,
    view,
    ix,
    iy,
    bw: 72,
    bh: 55,
    sky() {
      cv.g.fillStyle = '#263f40';
      cv.g.fillRect(0, 0, cv.width, cv.height);
      cv.g._c = null;
    },
    queue() {},
    w(x, y, z = 0) {
      const p = view.p(x, y, z);
      return [p[0] - ix, p[1] - iy];
    },
  };
}
function equalPixels(a, b) {
  assert.equal(a.ctx.canvas.pixels.length, b.ctx.canvas.pixels.length);
  for (let i = 0; i < a.ctx.canvas.pixels.length; i++)
    assert.ok(
      Math.abs(a.ctx.canvas.pixels[i] - b.ctx.canvas.pixels[i]) < 1e-12,
      `pixel component ${i}`,
    );
}

test('visible ground tiles match live pixels across reversed/diagonal roads, coast, water and camera boundaries', () =>
  withCanvas(() => {
    for (const view of [
      new E.View('flat', 'Flat', 0, 90, 1, 1),
      new E.View('iso', 'Isometric', 35, 48, 0.8, 1),
    ]) {
      const ground = createCityGroundRenderer(world, { tileSize: 64, maxTiles: 12 });
      for (const point of [
        [-50, -40],
        [0, 0],
        [40, 130],
        [256, 280],
        [650, 155],
        [1740, 1420],
        [4000, 4000],
      ]) {
        const at = view.p(...point, 0),
          ix = Math.floor(at[0]),
          iy = Math.floor(at[1]);
        const cached = context(view, ix, iy),
          live = context(view, ix, iy);
        ground.draw(cached);
        ground.drawLive(live);
        equalPixels(cached, live);
        for (const copy of cached.ctx.images) {
          assert.ok(copy.sw <= 64 && copy.sh <= 64);
          assert.ok(copy.sx >= 0 && copy.sy >= 0);
          assert.ok(
            copy.sx + copy.sw <= copy.source.width && copy.sy + copy.sh <= copy.source.height,
          );
        }
      }
      ground.dispose();
    }
  }));
test('a huge world allocates only bounded viewport tiles and reuses them on an unchanged camera', () =>
  withCanvas(() => {
    const ground = createCityGroundRenderer(world, { tileSize: 64, maxTiles: 8 }),
      view = new E.View('flat', 'Flat', 0, 90, 1, 1);
    const before = canvases.length;
    ground.draw(context(view, 320, 256));
    const generated = ground.stats.generatedTiles;
    ground.draw(context(view, 320, 256));
    assert.equal(ground.stats.generatedTiles, generated);
    assert.ok(ground.stats.cachedTiles <= 8);
    for (const canvas of canvases.slice(before))
      assert.ok(canvas.width <= 72 && canvas.height <= 64, 'no whole-world atlas allocation');
    for (let i = 0; i < 40; i++) ground.draw(context(view, 300 + i * 111, 200 + i * 81));
    assert.ok(ground.stats.cachedTiles <= 8);
    ground.dispose();
    assert.equal(ground.stats.cachedTiles, 0);
  }));
test('evicted tile backing stores are released and unsupported contexts use the live raster path', () =>
  withCanvas(() => {
    const ground = createCityGroundRenderer(world, { tileSize: 64, maxTiles: 4 }),
      view = new E.View('flat', 'Flat', 0, 90, 1, 1);
    const first = context(view, 40, 40);
    ground.draw(first);
    const used = first.ctx.images.map((copy) => copy.source);
    ground.draw(context(view, 5000, 5000));
    assert.ok(used.some((canvas) => canvas.width === 0 && canvas.height === 0));
    const live = context(view, 150, 150);
    live.ctx.getTransform = undefined;
    ground.draw(live);
    assert.equal(live.ctx.images.length, 0);
    const reference = context(view, 150, 150);
    ground.drawLive(reference);
    equalPixels(live, reference);
    ground.dispose();
  }));
test('geometry builds directed road polygons and keeps elevated decks out of the ground plane', () => {
  const deck = {
    id: 'bridge',
    x1: 80,
    y1: 100,
    x2: 600,
    y2: 100,
    width: 80,
    z1: 0,
    z2: 28,
    access: ['car', 'foot'],
  };
  const primitives = buildGroundPrimitives({ ...world, roads: [deck] });
  assert.ok(!primitives.some((item) => item.color === '#354542'));
  const reversed = buildGroundPrimitives({ ...world, roads: [world.roads[0]] }).find(
    (item) => item.color === '#354542',
  );
  assert.ok(reversed.points.some((point) => point[0] === 1600));
  assert.ok(reversed.points.some((point) => point[0] === 80));
});
