import test from 'node:test';
import assert from 'node:assert/strict';
import '../my-3d2dge.js';
import { RasterCanvas } from './helpers/raster-canvas.mjs';
import { createRailRenderer } from '../src/rail-renderer.js';
const E = globalThis.My3D2dge;
const config = { cars: 2, carLength: 32, couplerGap: 4, trainWidth: 20, trainHeight: 16 };
function volume(id, x, y, w, h, z = -20, kind = 'sealed-bore', rise = 0) {
  return {
    id,
    kind,
    polygon: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    bounds: { x, y, w, h },
    zMin: z - 0.5,
    zMax: z + 18 + Math.abs(rise),
    referenceFloorMin: z,
    floorStart: { x, y, z },
    floorEnd: { x: x + w, y, z: z + rise },
    roofStart: { x, y, z: z + 18 },
    roofEnd: { x: x + w, y, z: z + rise + 18 },
    trackIds: ['track'],
  };
}
function world(volumes = [], tracks = [], extra = {}) {
  return {
    roads: [],
    buildings: [],
    decks: [],
    transit: { stations: [], railClearanceVolumes: volumes, tracks, railCrossings: [] },
    ...extra,
  };
}
function state(z = -18, trains = []) {
  return {
    player: { x: 0, y: 0, z },
    transit: { config, trains, passengers: [] },
    railSignals: { closedGates: [] },
  };
}
function renderer(
  view = new E.View('iso', 'Iso', 0, 55, 1),
  { ix = -80, iy = -60, width = 260, height = 160, direct = false } = {},
) {
  const canvas = new RasterCanvas();
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (direct) ctx.getTransform = undefined;
  return {
    ctx,
    view,
    ix,
    iy,
    bw: width,
    bh: height,
    W: width,
    H: height,
    queued: [],
    projected: [],
    w(x, y, z = 0) {
      this.projected.push({ x, y, z });
      const p = view.p(x, y, z);
      return [p[0] - ix, p[1] - iy];
    },
    queue(x, y, z, fn, options) {
      this.queued.push({ x, y, z, fn, options });
    },
    shadow() {},
    flush() {
      for (const q of this.queued.sort(
        (a, b) =>
          view.order(a.x, a.y, a.z) +
          (a.options?.bias ?? 0) -
          view.order(b.x, b.y, b.z) -
          (b.options?.bias ?? 0),
      ))
        q.fn(ctx);
      this.queued = [];
    },
  };
}
const rgb = (hex) => E.hex(hex).map((c) => c / 255);
function count(r, hex) {
  const c = rgb(hex);
  let n = 0;
  for (let i = 0; i < r.ctx.canvas.pixels.length; i += 4)
    if (
      c.every((v, k) => Math.abs(r.ctx.canvas.pixels[i + k] - v) < 1e-10) &&
      r.ctx.canvas.pixels[i + 3] > 0.99
    )
      n++;
  return n;
}
function equalPixels(a, b, label) {
  assert.deepEqual(a.ctx.canvas.pixels, b.ctx.canvas.pixels, label);
}
function components(r, hex) {
  const c = rgb(hex),
    cv = r.ctx.canvas,
    seen = new Set();
  let total = 0;
  const match = (index) =>
    c.every((v, k) => Math.abs(cv.pixels[index * 4 + k] - v) < 1e-10) &&
    cv.pixels[index * 4 + 3] > 0.99;
  for (let i = 0; i < cv.width * cv.height; i++) {
    if (seen.has(i) || !match(i)) continue;
    total++;
    const stack = [i];
    seen.add(i);
    while (stack.length) {
      const p = stack.pop(),
        x = p % cv.width,
        y = Math.floor(p / cv.width);
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ])
        if (nx >= 0 && nx < cv.width && ny >= 0 && ny < cv.height) {
          const q = ny * cv.width + nx;
          if (!seen.has(q) && match(q)) {
            seen.add(q);
            stack.push(q);
          }
        }
    }
  }
  return total;
}

test('overlapping chambers render the same outer boundary as their actual union', () => {
  const A = volume('a', 0, 0, 100, 60),
    B = volume('b', 80, 0, 100, 60),
    U = volume('u', 0, 0, 180, 60),
    view = new E.View('v', 'V', 0, 55, 1);
  const split = createRailRenderer({}, world([A, B])),
    whole = createRailRenderer({}, world([U])),
    a = renderer(view),
    b = renderer(view);
  split.draw(a, state());
  whole.draw(b, state());
  a.flush();
  b.flush();
  equalPixels(a, b, 'covered interior cells may not add any wall or floor seam');
  assert.equal(split.stats.outerWallPieces, 4);
  assert.equal(split.stats.outerEdges, 4);
});

test('duplicate cells and shared or reversed track sections cannot overpaint a rail braid', () => {
  const room = volume('a', -50, -30, 230, 60),
    points = [
      { x: -40, y: 0, z: -18 },
      { x: 160, y: 0, z: -18 },
    ],
    single = world([room], [{ id: 'one', points }]);
  const duplicate = world(
    [room, { ...room, id: 'duplicate' }],
    [
      { id: 'one', points },
      { id: 'two', points: [...points].reverse() },
      {
        id: 'partial',
        points: [
          { x: 20, y: 0, z: -18 },
          { x: 120, y: 0, z: -18 },
        ],
      },
    ],
  );
  const a = renderer(),
    b = renderer(),
    s = createRailRenderer({}, single),
    d = createRailRenderer({}, duplicate);
  s.draw(a, state());
  d.draw(b, state());
  a.flush();
  b.flush();
  equalPixels(a, b, 'shared lines and sleepers must use one physical run');
  assert.equal(d.stats.canonicalRailSegments, 1);
  assert.equal(d.stats.duplicateRailSegments, 2);
  assert.equal(d.stats.duplicateVolumes, 1);
});

test('connected vertical intervals remove internal floor and roof seams while preserving their outside shell', () => {
  const lower = volume('lower', 0, 0, 100, 60, -40),
    upper = volume('upper', 0, 0, 100, 60, -30),
    whole = volume('whole', 0, 0, 100, 60, -40);
  whole.roofStart.z = whole.roofEnd.z = -12;
  whole.zMax = -12;
  const split = createRailRenderer({}, world([lower, upper])),
    united = createRailRenderer({}, world([whole])),
    a = renderer(),
    b = renderer();
  split.draw(a, state(-30));
  united.draw(b, state(-30));
  a.flush();
  b.flush();
  equalPixels(a, b, 'connected room union');
});

test('supports use run spacing and avoid existing public paths rather than multiplying by chamber cells', () => {
  const points = [
      { x: 0, y: 0, z: 20 },
      { x: 320, y: 0, z: 20 },
    ],
    road = { id: 'public', x1: -100, y1: 0, x2: 500, y2: 0, width: 40, access: ['car', 'foot'] };
  const scene = world(
      [
        volume('a', -40, -30, 400, 60, 19, 'viaduct'),
        volume('overlap', -30, -30, 380, 60, 19, 'viaduct'),
      ],
      [{ id: 'rail', points }],
      { roads: [road] },
    ),
    draw = createRailRenderer({}, scene);
  assert.ok(draw.stats.supportPiers > 0 && draw.stats.supportPiers <= 4);
});

test('full authored floor draws before the existing actor queue and extends beyond the old narrow rail strip', () => {
  const draw = createRailRenderer({}, world([volume('wide', -50, -35, 100, 70)])),
    r = renderer(new E.View('top', 'Top', 0, 90, 1), { ix: -60, iy: -45, width: 120, height: 90 });
  const p = r.w(0, 20, -18);
  r.queue(0, 20, -18, (g) => E.px.rect(g, p[0] - 2, p[1] - 2, 5, 5, '#ff2233'));
  draw.draw(r, state());
  assert.ok(
    count(r, '#52635d') > 5000,
    'chamber floor must cover the whole allowed body footprint',
  );
  assert.equal(count(r, '#ff2233'), 0);
  r.flush();
  assert.equal(count(r, '#ff2233'), 25);
});

test('unclamped grade planes render at their actual construction heights', () => {
  const draw = createRailRenderer(
      {},
      world([volume('slope', 0, -20, 120, 40, -24, 'cutting', 7.2)]),
    ),
    r = renderer();
  draw.draw(r, state(-12));
  r.flush();
  assert.ok(r.projected.some((p) => Math.abs(p.x - 0) < 1e-5 && Math.abs(p.z + 24) < 1e-5));
  assert.ok(r.projected.some((p) => Math.abs(p.x - 120) < 1e-5 && Math.abs(p.z + 16.8) < 1e-5));
  assert.ok(count(r, '#52635d') > 0);
});

test('separate vertical components retain both decks and select the proper exterior/bore layer', () => {
  const draw = createRailRenderer(
    {},
    world([
      volume('deep', -40, -25, 100, 50, -20),
      volume('high', -40, -25, 100, 50, 20, 'viaduct'),
    ]),
  );
  const below = renderer(),
    above = renderer();
  draw.draw(below, state(-18));
  draw.draw(above, state(20));
  below.flush();
  above.flush();
  assert.ok(count(below, '#52635d') > 0);
  assert.equal(count(below, '#748178'), 0);
  assert.ok(count(above, '#748178') > 0);
  assert.equal(count(above, '#52635d'), 0);
  assert.equal(draw.stats.floorPieces, 2);
});

test('projected polygon culling retains visible tips with offscreen chamber centers', () => {
  const draw = createRailRenderer(
    {},
    world([volume('long', -200, 0, 500, 40, -20), volume('far', 9000, 9000, 100, 60, -20)]),
  );
  const r = renderer(new E.View('v', 'V', 0, 55, 1), { ix: 260, iy: 0, width: 50, height: 90 });
  draw.draw(r, state());
  r.flush();
  assert.ok(draw.stats.visibleFloors > 0);
  assert.ok(count(r, '#52635d') > 0);
  assert.ok(draw.stats.visibleFloors < draw.stats.floorPieces);
});

test('projection caches retain at most two transforms and dispose them', () => {
  const draw = createRailRenderer({}, world([volume('a', -40, -20, 100, 40)]));
  for (const yaw of [0, 30, 60, 90, 0])
    draw.draw(renderer(new E.View('v', 'V', yaw, 55, 1)), state());
  assert.equal(draw.stats.projectionIndexes, 2);
  draw.dispose();
  assert.equal(draw.stats.projectionIndexes, 0);
});

test('native cached/indexed and direct rendering produce identical cropped pixels', () => {
  const scene = world([
      volume('a', -80, -40, 220, 80),
      volume('b', 100, -20, 100, 60, -18, 'cutting', 2),
    ]),
    cached = createRailRenderer({}, scene),
    direct = createRailRenderer({}, scene, { cacheProjection: false });
  for (const view of [new E.View('iso', 'Iso', 35, 40, 1), new E.View('top', 'Top', 0, 82, 1)])
    for (const crop of [
      [-90, -50],
      [25, -10],
      [130, 30],
    ]) {
      const a = renderer(view, { ix: crop[0], iy: crop[1] }),
        b = renderer(view, { ix: crop[0], iy: crop[1], direct: true });
      cached.draw(a, state());
      direct.draw(b, state());
      a.flush();
      b.flush();
      equalPixels(a, b, view.id + crop.join(','));
    }
});

test('two native cars retain separate roofs, visible windows, opening side doors, and a coupler', () => {
  const draw = createRailRenderer({}, world()),
    train = { id: 't', x: 0, y: 0, z: 18, heading: 0, doorProgress: 1 },
    r = renderer(new E.View('car', 'Car', 0, 55, 2), { ix: -90, iy: -60, width: 180, height: 120 });
  draw.draw(r, state(18, [train]));
  r.flush();
  assert.equal(draw.stats.drawnTrains, 1);
  assert.equal(components(r, '#a7b6a9'), 2, 'both roof silhouettes must remain separated');
  assert.ok(count(r, '#213d3b') > 0, 'windows');
  assert.ok(count(r, '#172c2b') > 0, 'open side doors');
  assert.ok(count(r, '#263d38') > 0, 'visible coupler gap');
});

test('actual canonical point arrays render underground graded road gates', () => {
  const road = {
    id: 'bore',
    x1: -60,
    y1: 0,
    x2: 60,
    y2: 0,
    width: 24,
    z1: -30,
    z2: -6,
    access: ['car', 'foot'],
    tunnel: true,
  };
  const scene = world([], [], {
      roads: [road],
      transit: {
        stations: [],
        tracks: [],
        railClearanceVolumes: [],
        railCrossings: [
          { id: 'gate', roadId: 'bore', points: [{ x: 0, y: 0, z: -18, roadZ: -18 }] },
        ],
      },
    }),
    draw = createRailRenderer({}, scene),
    r = renderer();
  const s = state(-18);
  s.railSignals.closedGates = ['gate'];
  draw.draw(r, s);
  r.flush();
  assert.equal(draw.stats.drawnGates, 1);
  assert.ok(count(r, '#df8369') > 0);
  assert.ok(count(r, '#d7c078') > 0);
  assert.ok(
    r.projected.some((p) => p.z === -4),
    'signal head follows actual −18 road height',
  );
});

test('a merged gate paints both physical crossings and long visible rails are clipped before the native line cap', () => {
  const road = {
      id: 'street',
      x1: -200,
      y1: 0,
      x2: 200,
      y2: 0,
      width: 24,
      z1: 0,
      z2: 0,
      access: ['car', 'foot'],
    },
    scene = world(
      [],
      [
        {
          id: 'long',
          points: [
            { x: -9000, y: 20, z: 0 },
            { x: 9000, y: 20, z: 0 },
          ],
        },
      ],
      { roads: [road] },
    );
  scene.transit.railCrossings = [
    {
      id: 'g',
      roadId: 'street',
      points: [
        { x: -30, y: 0, z: 0, roadZ: 0 },
        { x: 30, y: 0, z: 0, roadZ: 0 },
      ],
    },
  ];
  const draw = createRailRenderer({}, scene),
    r = renderer(new E.View('top', 'Top', 0, 90, 1));
  draw.draw(r, state(0));
  r.flush();
  assert.equal(draw.stats.drawnGates, 1);
  assert.equal(draw.stats.drawnGatePoints, 2);
  assert.ok(count(r, '#b2bcb1') > 0, 'visible middle of an 18,000-unit run');
});
