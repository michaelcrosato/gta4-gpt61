import test from 'node:test';
import assert from 'node:assert/strict';
import '../my-3d2dge.js';

const E = globalThis.My3D2dge;
const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(
  (value) => (value + 0.5) / 16,
);
const bayer = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
const quantizedAlpha = (alpha) => Math.round(Math.max(0, Math.min(1, alpha)) * 8) / 8;

// Frozen pre-optimization scan algorithm: the comparison does not call engine scan.
function originalScan(points, span) {
  let y0 = 1e9,
    y1 = -1e9;
  for (const point of points) {
    if (point[1] < y0) y0 = point[1];
    if (point[1] > y1) y1 = point[1];
  }
  y0 = Math.round(y0);
  y1 = Math.round(y1);
  for (let y = y0; y <= y1; y += 1) {
    const xs = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i],
        b = points[j];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y))
        xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((a, b) => a - b);
    for (let index = 0; index + 1 < xs.length; index += 2) {
      const xa = Math.round(xs[index]),
        xb = Math.round(xs[index + 1]);
      span(xa, Math.max(xa, xb), y);
    }
  }
}
function originalColor(context, color) {
  const material = context._info ? context._mat : color;
  if (context._c !== material) {
    context.fillStyle = material;
    context._c = material;
  }
}
function originalPoly(context, points, color) {
  originalColor(context, color);
  originalScan(points, (a, b, y) => context.fillRect(a, y, b - a + 1, 1));
}
function originalPolyDither(context, points, color, alpha, worldX = 0, worldY = 0) {
  if (alpha <= 0) return;
  if (alpha >= 1) return originalPoly(context, points, color);
  if (E.style.trans !== 'dither' && !context._info) {
    const quantized = quantizedAlpha(alpha);
    if (quantized <= 0) return;
    const previousAlpha = context.globalAlpha,
      previousComposite = context.globalCompositeOperation;
    if (!context._cover) {
      context.globalAlpha *= quantized;
      context.globalCompositeOperation = 'source-over';
    }
    try {
      originalPoly(context, points, color);
    } finally {
      context.globalAlpha = previousAlpha;
      context.globalCompositeOperation = previousComposite;
    }
    return;
  }
  originalColor(context, color);
  originalScan(points, (a, b, y) => {
    for (let x = a; x <= b; x += 1)
      if (alpha > bayer(x + worldX, y + worldY)) context.fillRect(x, y, 1, 1);
  });
}

// An area-coverage raster for axis-aligned transformed rectangles. It retains
// fractional edge coverage and alpha accumulation rather than rounding them away.
function context(matrix = IDENTITY, width = 32, height = 24) {
  const pixels = new Float64Array(width * height * 4);
  const calls = [];
  const g = {
    canvas: { width, height },
    calls,
    pixels,
    fillStyle: '#000000',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    filter: 'none',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    getTransform: () => ({ ...matrix }),
    fillRect(x, y, w, h) {
      calls.push({
        x,
        y,
        w,
        h,
        color: this.fillStyle,
        alpha: this.globalAlpha,
        composite: this.globalCompositeOperation,
      });
      // Unsupported transforms are tested by exact calls, rather than approximated pixels.
      if (matrix.b !== 0 || matrix.c !== 0) return;
      const left = Math.min(matrix.a * x + matrix.e, matrix.a * (x + w) + matrix.e);
      const right = Math.max(matrix.a * x + matrix.e, matrix.a * (x + w) + matrix.e);
      const top = Math.min(matrix.d * y + matrix.f, matrix.d * (y + h) + matrix.f);
      const bottom = Math.max(matrix.d * y + matrix.f, matrix.d * (y + h) + matrix.f);
      const rgb = E.hex(this.fillStyle).map((value) => value / 255);
      for (
        let row = Math.max(0, Math.floor(top));
        row < Math.min(height, Math.ceil(bottom));
        row += 1
      ) {
        const coverageY = Math.max(0, Math.min(bottom, row + 1) - Math.max(top, row));
        for (
          let column = Math.max(0, Math.floor(left));
          column < Math.min(width, Math.ceil(right));
          column += 1
        ) {
          const coverageX = Math.max(0, Math.min(right, column + 1) - Math.max(left, column));
          const alpha = coverageX * coverageY * this.globalAlpha;
          const pixel = (row * width + column) * 4;
          for (let channel = 0; channel < 3; channel += 1)
            pixels[pixel + channel] = rgb[channel] * alpha + pixels[pixel + channel] * (1 - alpha);
          pixels[pixel + 3] = alpha + pixels[pixel + 3] * (1 - alpha);
        }
      }
    },
  };
  return g;
}
function assertPixelsEqual(actual, expected, label) {
  assert.equal(actual.pixels.length, expected.pixels.length);
  for (let index = 0; index < actual.pixels.length; index += 1) {
    assert.ok(
      Math.abs(actual.pixels[index] - expected.pixels[index]) < 1e-12,
      `${label}: component ${index} differs (${actual.pixels[index]} vs ${expected.pixels[index]})`,
    );
  }
}
const POLYGONS = [
  [
    [2, 2],
    [26, 3],
    [13, 20],
  ],
  [
    [-25, -20],
    [57, -5],
    [48, 46],
    [-15, 37],
  ],
  [
    [-7.2, 4.3],
    [12.8, -8.4],
    [42.3, 6.8],
    [21.2, 33.6],
    [0.1, 19.9],
  ],
  [
    [-10, -5],
    [40, -5],
    [40, 8],
    [10, 8],
    [10, 16],
    [40, 16],
    [40, 32],
    [-10, 32],
  ],
  [
    [-20, 12],
    [16, -13],
    [53, 12],
    [16, 7],
    [16, 42],
  ],
  [
    [-50, -40],
    [-20, -40],
    [-20, -10],
    [-50, -10],
  ],
  [
    [60, 8],
    [90, 4],
    [83, 35],
  ],
  [
    [0, 0],
    [31, 0],
    [31, 23],
    [0, 23],
  ],
  [
    [3, 3],
    [3, 3],
    [13, 4],
    [8, 18],
    [3, 3],
  ],
  [],
];
const TRANSFORMS = [
  IDENTITY,
  { a: 1, b: 0, c: 0, d: 1, e: 12.35, f: -7.4 },
  { a: 1.6, b: 0, c: 0, d: 0.75, e: 4.2, f: 3.1 },
  { a: -1.25, b: 0, c: 0, d: -0.6, e: 25.75, f: 19.3 },
  { a: 0.4, b: 0, c: 0, d: 2.5, e: -8.1, f: 0.25 },
];

test('clipped solid polygons preserve visible raster pixels for convex, concave and offscreen shapes', () => {
  for (const matrix of TRANSFORMS) {
    for (const polygon of POLYGONS) {
      for (const points of [polygon, polygon.slice().reverse()]) {
        const baseline = context(matrix),
          optimized = context(matrix);
        originalPoly(baseline, points, '#73bda6');
        E.px.poly(optimized, points, '#73bda6');
        assertPixelsEqual(optimized, baseline, JSON.stringify({ matrix, points }));
      }
    }
  }
});

test('deterministic varied polygon geometry is pixel-equivalent to the original scan', () => {
  let seed = 9123;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let sample = 0; sample < 80; sample += 1) {
    const center = [random() * 100 - 35, random() * 80 - 30];
    const points = Array.from({ length: 3 + (sample % 8) }, (_, index) => {
      const angle = (index / (3 + (sample % 8))) * Math.PI * 2;
      const radius = 8 + random() * 65;
      return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
    });
    const matrix = TRANSFORMS[sample % TRANSFORMS.length];
    const baseline = context(matrix),
      optimized = context(matrix);
    originalPoly(baseline, points, '#82a1c7');
    E.px.poly(optimized, points, '#82a1c7');
    assertPixelsEqual(optimized, baseline, `sample ${sample}`);
  }
});

test('ordered dithering retains its original world-anchored Bayer pattern after clipping', () => {
  const previousStyle = E.style.trans;
  E.style.trans = 'dither';
  try {
    for (const matrix of TRANSFORMS)
      for (const polygon of POLYGONS)
        for (const alpha of [0, 0.12, 0.5, 0.88, 1]) {
          const baseline = context(matrix),
            optimized = context(matrix);
          originalPolyDither(baseline, polygon, '#b8a375', alpha, -11, 7);
          E.px.polyDither(optimized, polygon, '#b8a375', alpha, -11, 7);
          assertPixelsEqual(optimized, baseline, `dither ${alpha} ${JSON.stringify(matrix)}`);
        }
  } finally {
    E.style.trans = previousStyle;
  }
});

test('quantized alpha and blend-state restoration remain identical for overlapping polygons', () => {
  const previousStyle = E.style.trans;
  E.style.trans = 'alpha';
  try {
    for (const matrix of TRANSFORMS) {
      const baseline = context(matrix),
        optimized = context(matrix);
      baseline.globalAlpha = optimized.globalAlpha = 0.7;
      for (let index = 0; index < POLYGONS.length; index += 1) {
        const alpha = (index + 1) / 13;
        originalPolyDither(baseline, POLYGONS[index], '#a776b9', alpha);
        E.px.polyDither(optimized, POLYGONS[index], '#a776b9', alpha);
      }
      assertPixelsEqual(optimized, baseline, 'alpha accumulation');
      assert.equal(optimized.globalAlpha, 0.7);
      assert.equal(optimized.globalCompositeOperation, 'source-over');
    }
  } finally {
    E.style.trans = previousStyle;
  }
});

test('GPU info material and dither coverage-mask paths preserve visible output', () => {
  const previousStyle = E.style.trans;
  E.style.trans = 'alpha';
  try {
    const baseline = context(),
      optimized = context();
    baseline._info = optimized._info = true;
    baseline._mat = optimized._mat = '#00aaff';
    originalPolyDither(baseline, POLYGONS[1], '#ff0000', 0.5, 12, -5);
    E.px.polyDither(optimized, POLYGONS[1], '#ff0000', 0.5, 12, -5);
    assertPixelsEqual(optimized, baseline, 'GPU information mask');
    assert.ok(optimized.calls.every((call) => call.color === '#00aaff'));
    const coverBaseline = context(),
      coverOptimized = context();
    coverBaseline._cover = coverOptimized._cover = true;
    originalPolyDither(coverBaseline, POLYGONS[1], '#d5a870', 0.25);
    E.px.polyDither(coverOptimized, POLYGONS[1], '#d5a870', 0.25);
    assertPixelsEqual(coverOptimized, coverBaseline, 'full coverage cut mask');
  } finally {
    E.style.trans = previousStyle;
  }
});

test('fractional translation retains partly visible logical edge cells', () => {
  const matrix = { ...IDENTITY, e: 0.25, f: 0.4 };
  const baseline = context(matrix),
    optimized = context(matrix);
  const polygon = [
    [-4, -4],
    [4, -4],
    [4, 4],
    [-4, 4],
  ];
  originalPoly(baseline, polygon, '#ffffff');
  E.px.poly(optimized, polygon, '#ffffff');
  assertPixelsEqual(optimized, baseline, 'fractional edge coverage');
  assert.ok(optimized.calls.some((call) => call.x === -1 && call.y === -1));
  assert.ok(optimized.pixels[3] > 0 && optimized.pixels[3] < 1);
});

test('rotated, sheared, singular and unknown contexts retain every original draw call', () => {
  const fallbackMatrices = [
    { a: 0, b: 1, c: -1, d: 0, e: 20, f: 2 },
    { a: 1, b: 0.2, c: 0.3, d: 1, e: 0, f: 0 },
    { ...IDENTITY, a: 0 },
    { ...IDENTITY, e: NaN },
  ];
  for (const matrix of fallbackMatrices) {
    const baseline = context(matrix),
      optimized = context(matrix);
    originalPoly(baseline, POLYGONS[1], '#77aa99');
    E.px.poly(optimized, POLYGONS[1], '#77aa99');
    assert.deepEqual(optimized.calls, baseline.calls);
  }
  for (const setup of [
    (g) => {
      delete g.getTransform;
    },
    (g) => {
      g.getTransform = () => {
        throw new Error('unsupported context');
      };
    },
    (g) => {
      delete g.canvas;
    },
  ]) {
    const baseline = context(),
      optimized = context();
    setup(baseline);
    setup(optimized);
    originalPoly(baseline, POLYGONS[1], '#77aa99');
    E.px.poly(optimized, POLYGONS[1], '#77aa99');
    assert.deepEqual(optimized.calls, baseline.calls);
  }
});

test('destination-clearing composites, shadow and filter effects safely retain original calls', () => {
  const fallbackProperties = [
    ...['copy', 'source-in', 'source-out', 'destination-in', 'destination-atop'].map((mode) => ({
      globalCompositeOperation: mode,
    })),
    { shadowBlur: 5 },
    { shadowOffsetX: -12 },
    { shadowOffsetY: 8 },
    { filter: 'blur(2px)' },
  ];
  for (const properties of fallbackProperties) {
    const baseline = context(),
      optimized = context();
    Object.assign(baseline, properties);
    Object.assign(optimized, properties);
    originalPoly(baseline, POLYGONS[1], '#c48f73');
    E.px.poly(optimized, POLYGONS[1], '#c48f73');
    assert.deepEqual(optimized.calls, baseline.calls);
  }
});

test('actor fillRect wrappers still track the complete visible composite rectangle', () => {
  function tracked(g) {
    const bounds = [g.canvas.width, g.canvas.height, 0, 0];
    const original = g.fillRect.bind(g);
    g.fillRect = (x, y, w, h) => {
      bounds[0] = Math.min(bounds[0], x);
      bounds[1] = Math.min(bounds[1], y);
      bounds[2] = Math.max(bounds[2], x + w);
      bounds[3] = Math.max(bounds[3], y + h);
      original(x, y, w, h);
    };
    return () => [
      Math.max(0, Math.floor(bounds[0]) - 2),
      Math.max(0, Math.floor(bounds[1]) - 2),
      Math.min(g.canvas.width, Math.ceil(bounds[2]) + 2),
      Math.min(g.canvas.height, Math.ceil(bounds[3]) + 2),
    ];
  }
  const baseline = context(),
    optimized = context();
  const oldBounds = tracked(baseline),
    newBounds = tracked(optimized);
  originalPoly(baseline, POLYGONS[1], '#d19c67');
  E.px.poly(optimized, POLYGONS[1], '#d19c67');
  assert.deepEqual(newBounds(), oldBounds());
  assertPixelsEqual(optimized, baseline, 'tracked actor');
});

test('offscreen polygons issue no draws and an enormous visible floor visits only canvas rows', () => {
  const offscreen = context();
  E.px.poly(
    offscreen,
    [
      [1e6, 1e6],
      [2e6, 1e6],
      [2e6, 2e6],
      [1e6, 2e6],
    ],
    '#ffffff',
  );
  E.px.poly(
    offscreen,
    [
      [-2e6, 0],
      [-1e6, 0],
      [-1e6, 24],
      [-2e6, 24],
    ],
    '#ffffff',
  );
  assert.equal(offscreen.calls.length, 0);
  const floor = [
    [-1e6, -1e6],
    [1e6, -1e6],
    [1e6, 1e6],
    [-1e6, 1e6],
  ];
  const g = context();
  E.px.poly(g, floor, '#ffffff');
  assert.equal(g.calls.length, g.canvas.height);
  assert.ok(g.calls.every((call) => call.x === 0 && call.w === g.canvas.width && call.h === 1));
  const previousStyle = E.style.trans;
  E.style.trans = 'dither';
  try {
    const dither = context();
    E.px.polyDither(dither, floor, '#ffffff', 0.5);
    assert.equal(dither.calls.length, (dither.canvas.width * dither.canvas.height) / 2);
    E.px.polyDither(
      offscreen,
      [
        [1e6, 1e6],
        [2e6, 1e6],
        [2e6, 2e6],
        [1e6, 2e6],
      ],
      '#ffffff',
      0.5,
    );
    assert.equal(offscreen.calls.length, 0);
  } finally {
    E.style.trans = previousStyle;
  }
});
