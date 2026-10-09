/** Native Metro construction, shared rails, platforms and rolling stock. */
import { createSpatialIndex } from './spatial-index.js';
import { railPassenger } from './rail-runtime.js';

const E = globalThis.My3D2dge;
const EPS = 1e-6;
const palette = {
  floor: '#52635d',
  deck: '#748178',
  platform: '#8e9582',
  wall: '#61756c',
  cut: '#787c68',
  rim: '#9ba494',
  steel: '#3d5651',
};
const round = (n) => Math.round(n * 1000) / 1000;
const area = (p) =>
  p.reduce((n, a, i) => {
    const b = p[(i + 1) % p.length];
    return n + a.x * b.y - a.y * b.x;
  }, 0) / 2;
const bbox = (p) => {
  const xs = p.map((v) => v.x),
    ys = p.map((v) => v.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
};
const overlaps = (a, b) =>
  a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
const plane = (a, b, fallback) => {
  if (!a || !b) return { a: 0, b: 0, c: fallback };
  const x = b.x - a.x,
    y = b.y - a.y,
    L = x * x + y * y,
    k = L ? (b.z - a.z) / L : 0;
  return { a: k * x, b: k * y, c: a.z - k * (x * a.x + y * a.y) };
};
const at = (p, x, y) => p.a * x + p.b * y + p.c;
const minus = (a, b, c = 0) => ({ a: a.a - b.a, b: a.b - b.b, c: a.c - b.c + c });
const vertex = (p, z) => ({ x: p.x, y: p.y, z });
function clip(poly, linear) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i],
      q = poly[(i + 1) % poly.length],
      a = at(linear, p.x, p.y),
      b = at(linear, q.x, q.y),
      P = a >= -EPS,
      Q = b >= -EPS;
    if (P) out.push(p);
    if (P !== Q) {
      const t = a / (a - b);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  }
  return out.length >= 3 && Math.abs(area(out)) > EPS ? out : [];
}
function subtract(poly, cover) {
  let inside = poly;
  const pieces = [];
  for (let i = 0; i < cover.length && inside.length; i++) {
    const a = cover[i],
      b = cover[(i + 1) % cover.length],
      line = { a: -(b.y - a.y), b: b.x - a.x, c: (b.y - a.y) * a.x - (b.x - a.x) * a.y };
    const outside = clip(inside, { a: -line.a, b: -line.b, c: -line.c });
    if (outside.length) pieces.push(outside);
    inside = clip(inside, line);
  }
  return pieces;
}
function interval(poly, a, b) {
  let lo = 0,
    hi = 1;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i],
      q = poly[(i + 1) % poly.length],
      dx = q.x - p.x,
      dy = q.y - p.y,
      start = dx * (a.y - p.y) - dy * (a.x - p.x),
      delta = dx * (b.y - a.y) - dy * (b.x - a.x);
    if (Math.abs(delta) < EPS) {
      if (start < -EPS) return null;
    } else {
      const t = -start / delta;
      if (delta > 0) lo = Math.max(lo, t);
      else hi = Math.min(hi, t);
    }
    if (hi - lo <= EPS) return null;
  }
  return { lo, hi };
}
function clipInterval(value, start, end) {
  const delta = end - start;
  if (Math.abs(delta) < EPS) return start >= -EPS ? value : null;
  const t = -start / delta;
  const lo = delta > 0 ? Math.max(value.lo, t) : value.lo,
    hi = delta < 0 ? Math.min(value.hi, t) : value.hi;
  return hi - lo > EPS ? { lo, hi } : null;
}
function remainingIntervals(covers) {
  const sorted = covers.sort((a, b) => a.lo - b.lo);
  let end = 0;
  const out = [];
  for (const c of sorted) {
    if (c.lo > end + EPS) out.push({ lo: end, hi: c.lo });
    end = Math.max(end, c.hi);
  }
  if (end < 1 - EPS) out.push({ lo: end, hi: 1 });
  return out;
}
const polyKey = (points) =>
  points
    .map((p) => [round(p.x), round(p.y), round(p.z ?? 0)].join(','))
    .sort()
    .join(';');
function mergeStrips(items) {
  const groups = new Map(),
    other = [];
  for (const item of items) {
    const map = new Map();
    for (const p of item.points) {
      const key = `${round(p.x)},${round(p.y)}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    if (map.size !== 2) {
      other.push(item);
      continue;
    }
    let [A, B] = [...map.values()],
      a = A[0],
      b = B[0],
      dx = b.x - a.x,
      dy = b.y - a.y,
      L = Math.hypot(dx, dy);
    if (L < EPS) {
      other.push(item);
      continue;
    }
    if (dx < -EPS || (Math.abs(dx) < EPS && dy < 0)) {
      [A, B] = [B, A];
      [a, b] = [b, a];
      dx = -dx;
      dy = -dy;
    }
    const ux = dx / L,
      uy = dy / L,
      nx = -uy,
      ny = ux,
      t0 = a.x * ux + a.y * uy,
      t1 = b.x * ux + b.y * uy,
      offset = a.x * nx + a.y * ny,
      lo0 = Math.min(...A.map((p) => p.z)),
      lo1 = Math.min(...B.map((p) => p.z)),
      hi0 = Math.max(...A.map((p) => p.z)),
      hi1 = Math.max(...B.map((p) => p.z)),
      fs = (lo1 - lo0) / L,
      rs = (hi1 - hi0) / L,
      fc = lo0 - fs * t0,
      rc = hi0 - rs * t0;
    const key = [
      item.category,
      item.kind,
      item.color,
      ux.toFixed(6),
      uy.toFixed(6),
      round(offset),
      fs.toFixed(6),
      round(fc),
      rs.toFixed(6),
      round(rc),
      item.normal?.x.toFixed(6),
      item.normal?.y.toFixed(6),
    ].join('|');
    if (!groups.has(key))
      groups.set(key, { item, ux, uy, nx, ny, offset, fs, rs, fc, rc, runs: [] });
    groups.get(key).runs.push({ lo: t0, hi: t1 });
  }
  for (const g of groups.values()) {
    const merged = [];
    for (const span of g.runs.sort((a, b) => a.lo - b.lo)) {
      const last = merged.at(-1);
      if (last && span.lo <= last.hi + 0.001) last.hi = Math.max(last.hi, span.hi);
      else merged.push({ ...span });
    }
    const atPoint = (t, z) => ({ x: g.ux * t + g.nx * g.offset, y: g.uy * t + g.ny * g.offset, z });
    for (const r of merged) {
      const a = atPoint(r.lo, g.fs * r.lo + g.fc),
        b = atPoint(r.hi, g.fs * r.hi + g.fc);
      other.push({
        ...g.item,
        points:
          g.item.points.length === 2
            ? [a, b]
            : [a, b, atPoint(r.hi, g.rs * r.hi + g.rc), atPoint(r.lo, g.rs * r.lo + g.rc)],
      });
    }
  }
  return other;
}
function volumesOf(world, stats) {
  const seen = new Set(),
    result = [];
  for (const source of world.transit?.railClearanceVolumes ?? []) {
    let polygon = source.polygon.map((p) => ({ x: p.x, y: p.y }));
    if (area(polygon) < 0) polygon.reverse();
    const floor = plane(source.floorStart, source.floorEnd, source.zMin),
      roof = plane(source.roofStart, source.roofEnd, source.zMax);
    const key = [
      source.kind,
      polyKey(polygon),
      ...[floor, roof].flatMap((p) => [p.a.toFixed(9), p.b.toFixed(9), p.c.toFixed(5)]),
    ].join('|');
    if (seen.has(key)) {
      stats.duplicateVolumes++;
      continue;
    }
    seen.add(key);
    result.push({
      id: source.id,
      index: result.length,
      kind: source.kind,
      polygon,
      bounds: bbox(polygon),
      floor,
      roof,
      floorMin: Math.min(...polygon.map((p) => at(floor, p.x, p.y))),
      floorMax: Math.max(...polygon.map((p) => at(floor, p.x, p.y))),
    });
  }
  stats.rawVolumes = (world.transit?.railClearanceVolumes ?? []).length;
  stats.uniqueVolumes = result.length;
  return result;
}
function platformGeometry(world) {
  const result = [],
    map = new Map();
  for (const station of world.transit?.stations ?? [])
    for (const face of station.platforms ?? []) {
      const id = face.islandId ?? face.sourcePlatformId ?? face.id;
      if (map.has(id)) continue;
      const deck = world.decks?.find((d) => d.id === id),
        b = deck?.bounds ?? deck ?? face.bounds;
      let polygon;
      if (b && Number.isFinite(b.w))
        polygon = [
          { x: b.x, y: b.y },
          { x: b.x + b.w, y: b.y },
          { x: b.x + b.w, y: b.y + b.h },
          { x: b.x, y: b.y + b.h },
        ];
      else {
        const c = Math.cos(face.heading ?? 0),
          s = Math.sin(face.heading ?? 0);
        polygon = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([u, v]) => ({
          x: face.x + (c * u * face.length) / 2 - (s * v * face.width) / 2,
          y: face.y + (s * u * face.length) / 2 + (c * v * face.width) / 2,
        }));
      }
      const box = bbox(polygon),
        p = {
          id,
          station,
          face,
          polygon,
          bounds: box,
          z: deck?.z ?? face.z,
          x: box.x + box.w / 2,
          y: box.y + box.h / 2,
        };
      map.set(id, p);
      result.push(p);
    }
  return result;
}
function compileSurfaces(world, stats) {
  const volumes = volumesOf(world, stats),
    platforms = platformGeometry(world),
    index = createSpatialIndex(volumes, { getBounds: (v) => v.bounds }),
    floors = [],
    walls = [],
    rims = [],
    edges = [],
    roofEdges = [];
  for (const v of volumes) {
    const neighbors = index.queryRect(v.bounds).filter((n) => n !== v);
    let pieces = [v.polygon];
    for (const n of neighbors) {
      if (v.polygon.every((p) => Math.abs(at(v.floor, p.x, p.y) - at(n.floor, p.x, p.y)) < 0.0001))
        continue;
      let cover = clip(n.polygon, minus(v.floor, n.floor, n.index < v.index ? EPS * 2 : -EPS * 2));
      if (cover.length) cover = clip(cover, minus(n.roof, v.floor, EPS));
      if (!cover.length) continue;
      const cb = bbox(cover);
      pieces = pieces.flatMap((p) => (overlaps(bbox(p), cb) ? subtract(p, cover) : [p]));
      if (!pieces.length) break;
    }
    for (const polygon of pieces)
      if (Math.abs(area(polygon)) > 0.001)
        floors.push({
          kind: v.kind,
          category: 'floor',
          points: polygon.map((p) => vertex(p, at(v.floor, p.x, p.y))),
          color: v.kind === 'viaduct' ? palette.deck : palette.floor,
        });
    for (let i = 0; i < v.polygon.length; i++) {
      const a = v.polygon[i],
        b = v.polygon[(i + 1) % v.polygon.length],
        L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < EPS) continue;
      const normal = { x: (b.y - a.y) / L, y: -(b.x - a.x) / L },
        probeA = { x: a.x + normal.x * 0.0001, y: a.y + normal.y * 0.0001 },
        probeB = { x: b.x + normal.x * 0.0001, y: b.y + normal.y * 0.0001 };
      const fa = at(v.floor, a.x, a.y),
        fb = at(v.floor, b.x, b.y),
        ra = at(v.roof, a.x, a.y),
        rb = at(v.roof, b.x, b.y),
        floorCovers = [],
        roofCovers = [],
        fullCovers = [],
        partial = [];
      for (const n of neighbors) {
        const span = interval(n.polygon, probeA, probeB);
        if (!span) continue;
        const nfa = at(n.floor, a.x, a.y),
          nfb = at(n.floor, b.x, b.y),
          nra = at(n.roof, a.x, a.y),
          nrb = at(n.roof, b.x, b.y);
        let f = clipInterval(span, fa - nfa, fb - nfb);
        if (f) f = clipInterval(f, nra - fa, nrb - fb);
        if (f) floorCovers.push(f);
        if (nfa <= fa + EPS && nfb <= fb + EPS && nra >= ra - EPS && nrb >= rb - EPS)
          fullCovers.push(span);
        else partial.push({ span, nfa, nfb, nra, nrb });
      }
      for (const n of neighbors) {
        const exterior = interval(n.polygon, probeA, probeB),
          touch = exterior ?? interval(n.polygon, a, b);
        if (!touch) continue;
        const nfa = at(n.floor, a.x, a.y),
          nfb = at(n.floor, b.x, b.y),
          nra = at(n.roof, a.x, a.y),
          nrb = at(n.roof, b.x, b.y);
        const sameRoof = Math.abs(nra - ra) < EPS && Math.abs(nrb - rb) < EPS;
        if (!exterior && sameRoof && n.index > v.index) continue;
        let ceiling = clipInterval(touch, ra - nfa, rb - nfb);
        if (ceiling) ceiling = clipInterval(ceiling, nra - ra, nrb - rb);
        if (ceiling) roofCovers.push(ceiling);
      }
      const point = (t, z) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z });
      for (const span of remainingIntervals(floorCovers)) {
        const A = point(span.lo, fa + (fb - fa) * span.lo),
          B = point(span.hi, fa + (fb - fa) * span.hi);
        edges.push({
          kind: v.kind,
          category: 'floor-edge',
          normal,
          points: [A, B],
          floor: v.floor,
          roof: v.roof,
          color: palette.rim,
        });
      }
      for (const span of remainingIntervals(roofCovers))
        roofEdges.push({
          kind: v.kind,
          category: 'roof-edge',
          normal,
          points: [
            point(span.lo, ra + (rb - ra) * span.lo),
            point(span.hi, ra + (rb - ra) * span.hi),
          ],
          color: palette.rim,
        });
      for (const span of remainingIntervals(fullCovers)) {
        let wall = [
            { x: span.lo, y: fa + (fb - fa) * span.lo },
            { x: span.hi, y: fa + (fb - fa) * span.hi },
            { x: span.hi, y: ra + (rb - ra) * span.hi },
            { x: span.lo, y: ra + (rb - ra) * span.lo },
          ],
          parts = [wall];
        for (const n of partial) {
          const lo = Math.max(span.lo, n.span.lo),
            hi = Math.min(span.hi, n.span.hi);
          if (hi - lo <= EPS) continue;
          const cover = [
            { x: lo, y: n.nfa + (n.nfb - n.nfa) * lo },
            { x: hi, y: n.nfa + (n.nfb - n.nfa) * hi },
            { x: hi, y: n.nra + (n.nrb - n.nra) * hi },
            { x: lo, y: n.nra + (n.nrb - n.nra) * lo },
          ];
          parts = parts.flatMap((p) => subtract(p, cover));
          if (!parts.length) break;
        }
        for (const p of parts)
          if (v.kind !== 'viaduct' && v.kind !== 'surface-rail')
            walls.push({
              kind: v.kind,
              category: 'wall',
              normal,
              points: p.map((q) => point(q.x, q.y)),
              floor: v.floor,
              roof: v.roof,
              color: v.kind === 'cutting' ? palette.cut : palette.wall,
            });
      }
    }
  }
  const outerEdges = mergeStrips(edges);
  // Only exterior floor edges receive fascia; never one retaining wall per cell.
  for (const edge of outerEdges)
    if (edge.kind === 'viaduct') {
      const [a, b] = edge.points;
      walls.push({
        ...edge,
        category: 'fascia',
        points: [{ ...a, z: a.z - 1 }, { ...b, z: b.z - 1 }, b, a],
        color: palette.steel,
      });
    }
  for (const edge of mergeStrips(roofEdges))
    if (edge.kind === 'sealed-bore') {
      const [A, B] = edge.points;
      rims.push({
        kind: edge.kind,
        category: 'roof-rim',
        normal: edge.normal,
        points: [
          A,
          B,
          { x: B.x + edge.normal.x * 1.5, y: B.y + edge.normal.y * 1.5, z: B.z },
          { x: A.x + edge.normal.x * 1.5, y: A.y + edge.normal.y * 1.5, z: A.z },
        ],
        color: palette.rim,
      });
    }
  for (const platform of platforms)
    floors.push({
      kind: platform.z < 0 ? 'sealed-bore' : 'viaduct',
      category: 'platform',
      points: platform.polygon.map((p) => vertex(p, platform.z)),
      color: palette.platform,
      platform,
    });
  const dedupe = (items) => {
    const seen = new Set();
    return items.filter((item) => {
      const key = item.category + '|' + polyKey(item.points);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const result = {
    volumes,
    platforms,
    index,
    floors: dedupe(floors),
    walls: dedupe(mergeStrips(walls)),
    rims: dedupe(rims),
    edges: dedupe(outerEdges),
  };
  stats.floorPieces = result.floors.length;
  stats.outerWallPieces = result.walls.length;
  stats.outerEdges = result.edges.length;
  return result;
}
function compileSupports(world, structures, runs, stats) {
  const roads = world.roads.filter((r) =>
      r.access?.some((mode) => mode === 'car' || mode === 'foot'),
    ),
    roadIndex = createSpatialIndex(roads, {
      getBounds: (r) => ({
        x: Math.min(r.x1, r.x2) - r.width / 2,
        y: Math.min(r.y1, r.y2) - r.width / 2,
        w: Math.abs(r.x2 - r.x1) + r.width,
        h: Math.abs(r.y2 - r.y1) + r.width,
      }),
    }),
    buildingIndex = createSpatialIndex(world.buildings ?? []),
    supports = [],
    seen = new Set();
  const inside = (v, x, y) =>
    v.polygon.every((a, i) => {
      const b = v.polygon[(i + 1) % v.polygon.length];
      return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= -EPS;
    });
  for (const run of runs)
    for (let d = Math.ceil(run.start / 160) * 160; d < run.end; d += 160) {
      const x = run.ux * d + run.nx * run.offset,
        y = run.uy * d + run.ny * run.offset,
        z = run.slope * d + run.intercept;
      if (z < 10) continue;
      const volumes = structures.index
        .queryRadius(x, y, 0)
        .filter(
          (v) =>
            v.kind === 'viaduct' &&
            inside(v, x, y) &&
            at(v.floor, x, y) <= z + EPS &&
            at(v.roof, x, y) >= z - EPS,
        );
      if (!volumes.length) continue;
      const floor = Math.min(...volumes.map((v) => at(v.floor, x, y)));
      if (floor < 8) continue;
      for (const side of [-1, 1])
        for (const offset of [14, 26, 40, 54, 68]) {
          const px = x + run.nx * offset * side,
            py = y + run.ny * offset * side,
            box = { x: px - 1.5, y: py - 1.5, w: 3, h: 3 };
          if (
            roadIndex.queryRect(box).some((r) => {
              const dx = r.x2 - r.x1,
                dy = r.y2 - r.y1,
                L = dx * dx + dy * dy,
                t = Math.max(0, Math.min(1, ((px - r.x1) * dx + (py - r.y1) * dy) / L));
              return Math.hypot(px - r.x1 - dx * t, py - r.y1 - dy * t) < r.width / 2 + 2;
            })
          )
            continue;
          if (buildingIndex.queryRect(box).length) continue;
          if (
            structures.index
              .queryRect(box)
              .some(
                (v) =>
                  inside(v, px, py) && at(v.floor, px, py) < floor - 1 && at(v.roof, px, py) > 0,
              )
          )
            continue;
          const key = `${round(px)},${round(py)},${round(floor)}`;
          if (seen.has(key)) break;
          seen.add(key);
          const a = { x: px - 1.5, y: py - 1.5 },
            b = { x: px + 1.5, y: py - 1.5 },
            c = { x: px + 1.5, y: py + 1.5 },
            e = { x: px - 1.5, y: py + 1.5 };
          for (const [A, B] of [
            [a, b],
            [b, c],
            [c, e],
            [e, a],
          ])
            supports.push({
              category: 'support',
              kind: 'viaduct',
              points: [vertex(A, 0), vertex(B, 0), vertex(B, floor - 1), vertex(A, floor - 1)],
              color: palette.steel,
            });
          supports.push({
            category: 'brace',
            kind: 'viaduct',
            points: [
              { x: px, y: py, z: floor - 1 },
              { x, y, z: floor - 1 },
            ],
            color: palette.steel,
            width: 2,
          });
          break;
        }
    }
  stats.supportPiers = seen.size;
  return supports;
}
function canonicalRails(world, stats) {
  const groups = new Map();
  let raw = 0;
  for (const track of world.transit?.tracks ?? [])
    for (let i = 1; i < track.points.length; i++) {
      let a = track.points[i - 1],
        b = track.points[i],
        dx = b.x - a.x,
        dy = b.y - a.y,
        L = Math.hypot(dx, dy);
      if (L < EPS) continue;
      raw++;
      if (dx < -EPS || (Math.abs(dx) < EPS && dy < 0)) {
        [a, b] = [b, a];
        dx = -dx;
        dy = -dy;
      }
      const ux = dx / L,
        uy = dy / L,
        nx = -uy,
        ny = ux,
        start = a.x * ux + a.y * uy,
        end = b.x * ux + b.y * uy,
        offset = a.x * nx + a.y * ny,
        slope = (b.z - a.z) / L,
        intercept = a.z - slope * start;
      const key = [
        ux.toFixed(6),
        uy.toFixed(6),
        round(offset),
        slope.toFixed(6),
        round(intercept),
      ].join('|');
      if (!groups.has(key)) groups.set(key, { ux, uy, nx, ny, offset, slope, intercept, runs: [] });
      groups.get(key).runs.push({ start, end });
    }
  const runs = [];
  for (const group of groups.values()) {
    const merged = [];
    for (const run of group.runs.sort((a, b) => a.start - b.start)) {
      const last = merged.at(-1);
      if (last && run.start <= last.end + 0.001) last.end = Math.max(last.end, run.end);
      else merged.push({ ...run });
    }
    for (const run of merged) runs.push({ ...group, ...run, runs: undefined });
  }
  const lines = [],
    sleepers = new Set();
  for (const run of runs) {
    const atRun = (t, side = 0, lift = 0) => ({
      x: run.ux * t + run.nx * (run.offset + side),
      y: run.uy * t + run.ny * (run.offset + side),
      z: run.slope * t + run.intercept + lift,
    });
    for (const side of [-7, 7])
      lines.push({
        category: 'rail',
        kind: 'rail',
        points: [atRun(run.start, side, 1), atRun(run.end, side, 1)],
        color: '#b2bcb1',
        width: 2,
      });
    for (let d = Math.ceil(run.start / 14) * 14; d <= run.end + EPS; d += 14) {
      const points = [atRun(d, -9, 0.35), atRun(d, 9, 0.35)],
        key = polyKey(points);
      if (sleepers.has(key)) continue;
      sleepers.add(key);
      lines.push({ category: 'sleeper', kind: 'rail', points, color: '#7d8170', width: 2 });
    }
  }
  stats.rawRailSegments = raw;
  stats.canonicalRailSegments = runs.length;
  stats.duplicateRailSegments = raw - runs.length;
  stats.sleepers = sleepers.size;
  return { runs, lines };
}
function projectBounds(points, view, pad = 1) {
  const p = points.map((v) => view.p(v.x, v.y, v.z)),
    xs = p.map((v) => v[0]),
    ys = p.map((v) => v[1]);
  return {
    x: Math.min(...xs) - pad,
    y: Math.min(...ys) - pad,
    w: Math.max(...xs) - Math.min(...xs) + pad * 2,
    h: Math.max(...ys) - Math.min(...ys) + pad * 2,
  };
}
function screenPoints(r, points) {
  return points.map((p) => r.w(p.x, p.y, p.z));
}
const viewKey = (view) => [view.ax, view.ay, view.bx, view.by, view.bz].join(':');
function drawPoly(r, g, points, color) {
  E.px.poly(g, screenPoints(r, points), color);
}
function stroke(r, g, points, color, width = 1) {
  const [a, b] = screenPoints(r, points),
    dx = b[0] - a[0],
    dy = b[1] - a[1];
  let lo = 0,
    hi = 1;
  for (const [start, delta, min, max] of [
    [a[0], dx, -width, r.bw + width],
    [a[1], dy, -width, r.bh + width],
  ]) {
    if (Math.abs(delta) < EPS) {
      if (start < min || start > max) return;
    } else {
      const p = (min - start) / delta,
        q = (max - start) / delta;
      lo = Math.max(lo, Math.min(p, q));
      hi = Math.min(hi, Math.max(p, q));
    }
    if (hi < lo) return;
  }
  E.px.line(g, a[0] + dx * lo, a[1] + dy * lo, a[0] + dx * hi, a[1] + dy * hi, color, width);
}
function queuePoly(r, item, points, color, options = {}) {
  if (points.length < 3) return;
  const center = points.reduce(
    (p, a) => ({
      x: p.x + a.x / points.length,
      y: p.y + a.y / points.length,
      z: p.z + a.z / points.length,
    }),
    { x: 0, y: 0, z: 0 },
  );
  r.queue(center.x, center.y, center.z, (g) => drawPoly(r, g, points, color), options);
}
function clippedWall(item, view, structures) {
  let polygon = item.points;
  const near = item.normal ? item.normal.x * view.fx + item.normal.y * view.fy > 0.03 : false;
  if (item.category === 'wall' && (near || item.kind === 'cutting')) {
    const componentFloor = (p) => {
      const start = at(item.floor, p.x, p.y),
        roof = at(item.roof, p.x, p.y),
        key = `${round(p.x)},${round(p.y)},${round(start)},${round(roof)}`;
      if (structures.cutFloors.has(key)) return structures.cutFloors.get(key);
      const candidates = structures.index.queryRadius(p.x, p.y, 0.001).filter((v) =>
        v.polygon.every((a, i) => {
          const b = v.polygon[(i + 1) % v.polygon.length];
          return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= -EPS;
        }),
      );
      let lo = start,
        hi = roof,
        changed = true;
      while (changed) {
        changed = false;
        for (const v of candidates) {
          const f = at(v.floor, p.x, p.y),
            r = at(v.roof, p.x, p.y);
          if (f <= hi + EPS && r >= lo - EPS && (f < lo - EPS || r > hi + EPS)) {
            lo = Math.min(lo, f);
            hi = Math.max(hi, r);
            changed = true;
          }
        }
      }
      structures.cutFloors.set(key, lo);
      return lo;
    };
    const limit = (p) => {
      const base = componentFloor(p),
        top = item.kind === 'cutting' ? Math.max(0, at(item.floor, p.x, p.y) + 2) : Infinity;
      return near ? Math.min(top, base + 3) : top;
    };
    const out = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length],
        limitA = limit(a),
        limitB = limit(b),
        A = a.z <= limitA + EPS,
        B = b.z <= limitB + EPS;
      if (A) out.push(a);
      if (A !== B) {
        const t = (limitA - a.z) / (b.z - a.z - (limitB - limitA));
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
      }
    }
    polygon = out;
  }
  // Authored boarding faces open the platform-facing wall, including its end.
  if (item.category === 'wall' && polygon.length) {
    const mid = polygon.reduce(
      (p, q) => ({ x: p.x + q.x / polygon.length, y: p.y + q.y / polygon.length }),
      { x: 0, y: 0 },
    );
    if (
      structures.platforms.some(
        (p) =>
          Math.abs(p.z - at(item.floor, mid.x, mid.y)) < 6 &&
          mid.x >= p.bounds.x - 12 &&
          mid.x <= p.bounds.x + p.bounds.w + 12 &&
          mid.y >= p.bounds.y - 12 &&
          mid.y <= p.bounds.y + p.bounds.h + 12 &&
          (p.x - mid.x) * item.normal.x + (p.y - mid.y) * item.normal.y > 0,
      )
    )
      return [];
  }
  return polygon;
}

export function createRailRenderer(game, world, { cacheProjection = true } = {}) {
  const stats = {
    rawVolumes: 0,
    uniqueVolumes: 0,
    duplicateVolumes: 0,
    floorPieces: 0,
    outerWallPieces: 0,
    outerEdges: 0,
    rawRailSegments: 0,
    canonicalRailSegments: 0,
    duplicateRailSegments: 0,
    sleepers: 0,
    queriedRails: 0,
    visibleFloors: 0,
    visibleWalls: 0,
    drawnTrains: 0,
    drawnPlatforms: 0,
    drawnGates: 0,
    drawnGatePoints: 0,
    projectionIndexes: 0,
  };
  const structures = compileSurfaces(world, stats),
    rails = canonicalRails(world, stats),
    supports = compileSupports(world, structures, rails.runs, stats),
    views = new Map();
  structures.cutFloors = new Map();
  const staticItems = [
    ...structures.floors,
    ...structures.walls,
    ...structures.rims,
    ...supports,
    ...rails.lines,
  ];
  function visible(r) {
    if (!cacheProjection)
      return staticItems.filter((item) =>
        overlaps(projectBounds(item.points, r.view, item.width ?? 1), {
          x: r.ix,
          y: r.iy,
          w: r.bw,
          h: r.bh,
        }),
      );
    const key = viewKey(r.view);
    let cached = cacheProjection ? views.get(key) : null;
    if (!cached) {
      const projected = staticItems.map((item) => ({
        item,
        bounds: projectBounds(item.points, r.view, item.width ?? 1),
      }));
      cached = { index: createSpatialIndex(projected, { getBounds: (p) => p.bounds }) };
      if (cacheProjection) {
        if (views.size >= 2) views.delete(views.keys().next().value);
        views.set(key, cached);
      }
    } else {
      views.delete(key);
      views.set(key, cached);
    }
    stats.projectionIndexes = views.size;
    return cached.index.queryRect({ x: r.ix, y: r.iy, w: r.bw, h: r.bh }).map((p) => p.item);
  }
  function modeVisible(item, underground) {
    if (item.kind === 'cutting') return true;
    const below = Math.max(...item.points.map((p) => p.z)) < -1;
    return below === underground;
  }
  function drawTrain(r, train, config) {
    const total = config.cars * config.carLength + (config.cars - 1) * config.couplerGap,
      c = Math.cos(train.heading),
      s = Math.sin(train.heading),
      half = config.trainWidth / 2;
    const p = (x, y, z) => ({
      x: train.x + x * c - y * s,
      y: train.y + x * s + y * c,
      z: train.z + z,
    });
    const box = projectBounds(
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].flatMap(([a, b]) => [
        p((a * total) / 2, b * half, 0),
        p((a * total) / 2, b * half, config.trainHeight),
      ]),
      r.view,
      2,
    );
    if (!overlaps(box, { x: r.ix, y: r.iy, w: r.bw, h: r.bh })) return;
    stats.drawnTrains++;
    r.shadow?.(train.x, train.y, total / 2, 0.22, '#1d302b', train.z);
    r.queue(
      train.x,
      train.y,
      train.z,
      (g) => {
        for (let car = 0; car < config.cars - 1; car++) {
          const x = -total / 2 + (car + 1) * config.carLength + car * config.couplerGap;
          drawPoly(
            r,
            g,
            [
              p(x, -2, 4),
              p(x + config.couplerGap, -2, 4),
              p(x + config.couplerGap, 2, 4),
              p(x, 2, 4),
            ],
            '#263d38',
          );
        }
        for (let car = 0; car < config.cars; car++) {
          const center =
              -total / 2 + config.carLength / 2 + car * (config.carLength + config.couplerGap),
            a = center - config.carLength / 2,
            b = center + config.carLength / 2,
            h = config.trainHeight;
          const faces = [];
          for (const side of [-1, 1])
            faces.push({
              points: [
                p(a, side * half, 1),
                p(b, side * half, 1),
                p(b, side * half, h),
                p(a, side * half, h),
              ],
              side,
            });
          for (const x of [a, b])
            faces.push({
              points: [p(x, -half, 1), p(x, half, 1), p(x, half, h), p(x, -half, h)],
              end: x,
            });
          faces.push({
            points: [p(a, -half, h), p(b, -half, h), p(b, half, h), p(a, half, h)],
            roof: true,
          });
          faces.sort(
            (A, B) =>
              A.points.reduce((n, q) => n + r.view.depth(q.x, q.y, q.z), 0) -
              B.points.reduce((n, q) => n + r.view.depth(q.x, q.y, q.z), 0),
          );
          for (const face of faces) {
            drawPoly(
              r,
              g,
              face.points,
              face.roof
                ? '#a7b6a9'
                : face.side === 1
                  ? '#748e86'
                  : face.side === -1
                    ? '#4c6861'
                    : '#58786e',
            );
            if (face.side) {
              const side = face.side;
              stroke(r, g, [p(a, side * half, 5), p(b, side * half, 5)], '#d3c17e', 2);
              for (const x of [a + 4, b - 8])
                drawPoly(
                  r,
                  g,
                  [
                    p(x, side * half, 8),
                    p(x + 4, side * half, 8),
                    p(x + 4, side * half, 13),
                    p(x, side * half, 13),
                  ],
                  '#213d3b',
                );
              const opening = Math.max(0, Math.min(1, train.doorProgress ?? 0)) * 3;
              drawPoly(
                r,
                g,
                [
                  p(center - 3, side * half, 2),
                  p(center + 3, side * half, 2),
                  p(center + 3, side * half, 13),
                  p(center - 3, side * half, 13),
                ],
                '#172c2b',
              );
              for (const [lo, hi] of [
                [center - 3, center - opening],
                [center + opening, center + 3],
              ])
                if (hi > lo + EPS)
                  drawPoly(
                    r,
                    g,
                    [
                      p(lo, side * half, 2),
                      p(hi, side * half, 2),
                      p(hi, side * half, 13),
                      p(lo, side * half, 13),
                    ],
                    '#a8b6a0',
                  );
              for (const axle of [a + 5, b - 5])
                drawPoly(
                  r,
                  g,
                  [
                    p(axle - 2, side * (half - 0.1), 0.5),
                    p(axle + 2, side * (half - 0.1), 0.5),
                    p(axle + 2, side * (half - 0.1), 3),
                    p(axle - 2, side * (half - 0.1), 3),
                  ],
                  '#18302c',
                );
            } else if (face.roof) stroke(r, g, [p(a + 3, 0, h), p(b - 3, 0, h)], '#778f82', 2);
          }
        }
        for (const side of [-1, 1]) {
          const q = p(total / 2, side * 6, 9),
            [x, y] = r.w(q.x, q.y, q.z);
          E.px.rect(g, x - 1, y - 1, 3, 3, '#eddb9c');
        }
      },
      { solid: true },
    );
    game.lights?.add(train.x, train.y, train.z + 12, 42, 0.3, { color: '#c9d3a5' });
  }
  function drawSigns(r, underground) {
    for (const platform of structures.platforms) {
      if (platform.z < -1 !== underground) continue;
      const x = platform.x,
        y = platform.y,
        z = platform.z,
        points = [
          { x, y, z },
          { x, y, z: z + 25 },
        ];
      if (!overlaps(projectBounds(points, r.view, 12), { x: r.ix, y: r.iy, w: r.bw, h: r.bh }))
        continue;
      r.queue(x, y, z, (g) => {
        stroke(r, g, points, '#4a645a', 2);
        const [sx, sy] = r.w(x, y, z + 25);
        E.px.rect(g, sx - 8, sy - 7, 16, 10, '#426c5d');
        E.font.text(g, 'M', sx, sy - 5, '#e2dfba', { align: 'center', outline: false });
      });
    }
  }
  function drawGates(r, state, underground) {
    const closed = new Set(state.railSignals?.closedGates ?? []),
      seen = new Set(),
      visibleGates = new Set();
    for (const gate of world.transit?.railCrossings ?? [])
      for (const source of gate.points ?? []) {
        const key = `${gate.roadId}:${round(source.x)}:${round(source.y)}`;
        if (seen.has(key) || source.roadZ < -1 !== underground) continue;
        seen.add(key);
        const road = world.roads.find((p) => p.id === gate.roadId);
        if (!road) continue;
        const dx = road.x2 - road.x1,
          dy = road.y2 - road.y1,
          L = Math.hypot(dx, dy),
          nx = -dy / L,
          ny = dx / L;
        const height = (x, y) => {
          const t = ((x - road.x1) * dx + (y - road.y1) * dy) / (L * L);
          return (
            (road.z1 ?? road.z ?? source.roadZ) +
            ((road.z2 ?? road.z ?? source.roadZ) - (road.z1 ?? road.z ?? source.roadZ)) * t
          );
        };
        const A = { x: source.x - (nx * road.width) / 2, y: source.y - (ny * road.width) / 2 },
          B = { x: source.x + (nx * road.width) / 2, y: source.y + (ny * road.width) / 2 };
        A.z = height(A.x, A.y);
        B.z = height(B.x, B.y);
        if (
          !overlaps(
            projectBounds([A, B, { ...A, z: A.z + 14 }, { ...B, z: B.z + 14 }], r.view, 3),
            { x: r.ix, y: r.iy, w: r.bw, h: r.bh },
          )
        )
          continue;
        visibleGates.add(gate.id);
        stats.drawnGatePoints++;
        const active = closed.has(gate.id);
        r.queue(
          source.x,
          source.y,
          source.roadZ,
          (g) => {
            for (const p of [A, B]) {
              stroke(r, g, [p, { ...p, z: p.z + 14 }], palette.steel, 2);
              const [x, y] = r.w(p.x, p.y, p.z + 14);
              E.px.rect(g, x - 2, y - 2, 4, 4, active ? '#df8369' : '#9ab47b');
            }
            if (active) {
              stroke(
                r,
                g,
                [
                  { ...A, z: A.z + 8 },
                  { ...B, z: B.z + 8 },
                ],
                '#d7c078',
                3,
              );
              for (let t = 0.1; t < 1; t += 0.2) {
                const p = {
                    x: A.x + (B.x - A.x) * t,
                    y: A.y + (B.y - A.y) * t,
                    z: A.z + (B.z - A.z) * t + 8,
                  },
                  [x, y] = r.w(p.x, p.y, p.z);
                E.px.rect(g, x - 2, y - 1, 4, 3, '#344f45');
              }
            }
          },
          { solid: true },
        );
      }
    stats.drawnGates = visibleGates.size;
  }
  return {
    stats,
    draw(r, state) {
      if (state.interior?.active || !state.transit) return false;
      const underground = (state.player.z ?? 0) < -1,
        items = visible(r);
      stats.visibleFloors =
        stats.visibleWalls =
        stats.queriedRails =
        stats.drawnTrains =
        stats.drawnPlatforms =
        stats.drawnGates =
        stats.drawnGatePoints =
          0;
      const floors = items.filter(
        (item) =>
          (item.category === 'floor' || item.category === 'platform') &&
          modeVisible(item, underground),
      );
      floors.sort(
        (a, b) =>
          a.points.reduce((n, p) => n + r.view.depth(p.x, p.y, p.z), 0) / a.points.length -
          b.points.reduce((n, p) => n + r.view.depth(p.x, p.y, p.z), 0) / b.points.length,
      );
      for (const item of floors) {
        drawPoly(r, r.ctx, item.points, item.color);
        stats.visibleFloors++;
        if (item.category === 'platform') {
          stats.drawnPlatforms++;
          for (let i = 0; i < item.points.length; i++)
            stroke(
              r,
              r.ctx,
              [item.points[i], item.points[(i + 1) % item.points.length]],
              '#d5c58a',
              2,
            );
        }
      }
      for (const item of items) {
        if (!modeVisible(item, underground)) continue;
        if (item.category === 'rail' || item.category === 'sleeper') {
          stroke(r, r.ctx, item.points, item.color, item.width);
          stats.queriedRails++;
        } else if (item.category === 'brace') {
          const [a, b] = item.points;
          r.queue(
            (a.x + b.x) / 2,
            (a.y + b.y) / 2,
            (a.z + b.z) / 2,
            (g) => stroke(r, g, item.points, item.color, item.width),
            { solid: true },
          );
        } else if (['wall', 'fascia', 'roof-rim', 'support'].includes(item.category)) {
          if (
            item.category === 'roof-rim' &&
            item.normal.x * r.view.fx + item.normal.y * r.view.fy > 0.03
          )
            continue;
          const points = clippedWall(item, r.view, structures);
          if (points.length < 3) continue;
          stats.visibleWalls++;
          queuePoly(r, item, points, item.color, {
            occluder: item.category === 'wall',
            solid: true,
          });
        }
      }
      drawSigns(r, underground);
      for (const train of state.transit.trains ?? []) {
        const portal = structures.index
          .queryRadius(train.x, train.y, 0)
          .some((v) => v.kind === 'cutting');
        if (
          train.z < -1 === underground ||
          (portal && (underground ? train.z < 10 : train.z + state.transit.config.trainHeight > 0))
        )
          drawTrain(r, train, state.transit.config);
      }
      drawGates(r, state, underground);
      return true;
    },
    dispose() {
      views.clear();
      structures.cutFloors.clear();
      stats.projectionIndexes = 0;
    },
    renderPlayer(state) {
      return railPassenger(state)
        ? { ...state, player: { ...state.player, vehicleId: 'metro-passenger' } }
        : state;
    },
  };
}
