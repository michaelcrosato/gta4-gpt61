import test from 'node:test';
import assert from 'node:assert/strict';
import '../my-3d2dge.js';
import { RasterCanvas } from './helpers/raster-canvas.mjs';
import { WORLD, LEGACY_WORLD } from '../src/world.js';
import { createBodyClearance } from '../src/body-clearance.js';
import { DISPATCH_RAIL_PROFILE as P } from '../src/dispatch-standing-world.js';
import { compileRailConstruction } from '../src/rail-construction.js';
const E = globalThis.My3D2dge;
const old = createBodyClearance(LEGACY_WORLD),
  next = createBodyClearance(WORLD);
const standing = (x, y, z = 0) => ({ x, y, z, radius: 7, height: 30 });
test('actual native standing and crouching bodies exceed old Dispatch underside without any metadata scale reduction', () => {
  const view = new E.View('audit-side', 'Audit side', 0, 0, 4);
  for (const [size, min] of [
    [0.86, 27],
    [0.78, 24],
  ]) {
    for (const pose of [undefined, 'crouch']) {
      const rig = new E.Humanoid({
        build: 'heroic',
        size,
        weapon: null,
        outfit: 'shirt',
        sleeves: 'long',
      });
      rig.t = 0;
      for (let i = 0; i < 120; i++) rig.update(1 / 60, { x: 0, y: 0, z: 0, facing: 0, pose });
      const cv = new RasterCanvas();
      cv.width = 160;
      cv.height = 160;
      rig.draw(cv.g, 80, 150, view);
      let lo = 160,
        hi = -1;
      for (let y = 0; y < 160; y++)
        for (let x = 0; x < 160; x++)
          if (cv.pixels[(y * 160 + x) * 4 + 3] > 0.01) {
            lo = Math.min(lo, y);
            hi = Math.max(hi, y);
          }
      const height = (hi - lo + 1) / 4;
      assert.ok(height > 16.5, 'real native mesh, including ordinary crouch, clips old deck');
      if (!pose) assert.ok(height > min && height <= 30, `standing native${size}: ${height}`);
    }
  }
});
test('known door/body repro fails old18 rail and admits genuine standing30 under raised native exterior floor', () => {
  assert.equal(old.terrain.isBlocked(458, 700, 7, 0), false, 'old feet-only query misses head');
  assert.equal(old.inspect(standing(458, 700)).clear, false);
  assert.equal(next.inspect(standing(458, 700)).clear, true);
  const ceiling = next.ceiling(458, 700, 0, 7);
  assert.ok(
    ceiling > 34 && ceiling < 37,
    'actual grade cell relief/exterior union, not assumed trackZ-fascia',
  );
  assert.equal(next.sweep(standing(443.48, 731.5), standing(458, 700)).clear, true);
  assert.equal(next.sweep(standing(458, 700), standing(440, 700)).clear, true);
  assert.equal(next.sweep(standing(440, 700), standing(440, 640)).clear, true);
  assert.equal(
    next.sweep(standing(458, 700), standing(458, 700, 12)).clear,
    false,
    'a jumping head still hits the real deck',
  );
});
test('native support piers remain solid; the old proposed retreat through430640 cannot receive access credit', () => {
  const hit = next.sweep(standing(430, 700), standing(430, 640));
  assert.equal(hit.clear, false);
  assert.ok(
    hit.issues.some((i) => i.id?.startsWith('rail-support:430,640,')),
    JSON.stringify(hit),
  );
  assert.ok(next.supportSolids.length > 600);
});
test('local upgrade preserves every platform/access/XY corridor and leaves explicit other low-deck and bore limits', () => {
  const selected = WORLD.transit.tracks.find((t) => t.id === P.trackId),
    baseline = LEGACY_WORLD.transit.tracks.find((t) => t.id === P.trackId);
  assert.equal(selected.points.find((p) => Math.abs(p.y - P.riseEnd) < 1e-6).z, 38);
  assert.deepEqual(WORLD.transit.stations, LEGACY_WORLD.transit.stations);
  assert.deepEqual(WORLD.transit.accessPaths, LEGACY_WORLD.transit.accessPaths);
  for (const track of WORLD.transit.tracks) {
    if (![P.trackId, 'HC-TRACK-16@LL-CITY-SERVICE-02'].includes(track.id))
      assert.deepEqual(
        track.points,
        LEGACY_WORLD.transit.tracks.find((t) => t.id === track.id).points,
      );
    for (const p of track.points)
      assert.ok(
        baseline.id !== track.id ||
          Math.abs(p.x - 456) < 1e-6 ||
          baseline.points.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < 1e-6),
      );
  }
  assert.equal(
    next.inspect(standing(458, 700, -18)).clear,
    false,
    'negative standing clearance remains explicitly unverified',
  );
  assert.match(next.boundary, /Negative chambers/);
});
function synthetic(volumes = [], obstacles = []) {
  return {
    bounds: { left: -100, top: -100, right: 1000, bottom: 1000 },
    buildings: [],
    obstacles,
    roads: [],
    transit: { stations: [], tracks: [], railClearanceVolumes: volumes },
  };
}
function floor(z = 32, rise = 0) {
  return {
    id: 'deck',
    kind: 'viaduct',
    bounds: { x: 0, y: 0, w: 100, h: 100 },
    polygon: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
    floorStart: { x: 0, y: 0, z },
    floorEnd: { x: 100, y: 0, z: z + rise },
    roofStart: { x: 0, y: 0, z: z + 18 },
    roofEnd: { x: 100, y: 0, z: z + rise + 18 },
    zMin: z,
    zMax: z + rise + 18,
    referenceFloorMin: z,
    trackIds: ['test'],
  };
}
test('exact disk/graded-floor extrema include edge intersections, corners and fascia without broad-phase false walls', () => {
  const c = createBodyClearance(synthetic([floor(32, 10)]));
  assert.equal(c.ceiling(50, 50, 0, 7), 35.3);
  assert.equal(
    c.inspect({ x: 50, y: 50, z: 0, radius: 7, height: 35.3 }).clear,
    true,
    'exact fascia tangent is clear',
  );
  assert.equal(c.inspect({ x: 50, y: 50, z: 0, radius: 7, height: 35.30001 }).clear, false);
  assert.equal(
    c.inspect({ x: -8, y: -8, z: 0, radius: 7, height: 80 }).clear,
    true,
    'bounding rectangle corner outside disk cannot collide',
  );
  assert.equal(
    c.inspect({ x: 50, y: 50, z: 37, radius: 7, height: 30 }).clear,
    true,
    'standing on the actual center floor is not an overhead collision',
  );
  const point = createBodyClearance(
    synthetic([], [{ id: 'raised', x: 10, y: 10, w: 10, h: 10, z: 5, height: 5 }]),
  );
  assert.equal(point.inspect({ x: 15, y: 15, z: 0, radius: 7, height: 8 }).clear, false);
});
test('conservative continuous capsule sweep catches thin walls and validates bounded finite requests', () => {
  const c = createBodyClearance(
    synthetic([], [{ id: 'thin', x: 40.01, y: 0, w: 0.01, h: 100, z: 0, height: 50 }]),
  );
  assert.equal(c.sweep(standing(10, 50), standing(90, 50)).clear, false);
  assert.equal(c.sweep(standing(10, 120), standing(90, 120)).clear, true);
  for (const bad of [
    { x: NaN, y: 0 },
    { x: 0, y: 0, height: 0 },
    { x: 0, y: 0, radius: -1 },
  ])
    assert.throws(() => c.inspect(bad));
  assert.throws(() => c.sweep(standing(0, 0), standing(1e7, 0)), /budget/);
  const model = compileRailConstruction(WORLD);
  assert.equal(
    compileRailConstruction(WORLD),
    model,
    'one immutable-world geometry compile is shared',
  );
});

test('second real rail grade admits standing driver/Tess approach while reserving the original dry sidewalk from native piers', () => {
  for (const x of [735.5, 745, 752, 756, 768.5, 780])
    assert.equal(next.inspect({ x, y: 308, z: 0, radius: 7, height: 30 }).clear, true, String(x));
  assert.equal(
    next.sweep({ x: 768.5, y: 308, z: 0 }, { x: 729, y: 308, z: 0 }, { radius: 7, height: 30 })
      .clear,
    true,
  );
  assert.equal(
    next.sweep({ x: 729, y: 308, z: 0 }, { x: 729, y: 380, z: 0 }, { radius: 7, height: 30 }).clear,
    true,
  );
  assert.equal(
    next.supportSolids.some((s) => s.id.startsWith('rail-support:730,320,')),
    false,
    'actual protected sidewalk causes support placement to move, not a collision exception',
  );
  assert.ok(
    WORLD.roads.some(
      (r) => r.id === 'tess-standing-access' && r.access.length === 1 && r.access[0] === 'foot',
    ),
  );
});
