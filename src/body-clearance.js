/** Full-height aboveground body audit against the actual native rail floor planes.
 * Negative chambers intentionally remain an explicit unverified boundary here.
 */
import { createSpatialIndex } from './spatial-index.js';
import { createTerrain } from './terrain.js';
import { compileRailConstruction } from './rail-construction.js';
const EPS = 1e-9;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const floorAt = (volume, x, y) =>
  volume.floorPlane.a * x + volume.floorPlane.b * y + volume.floorPlane.c;
const inside = (polygon, x, y) =>
  polygon.every((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= -EPS;
  });
function planeExtrema(volume, x, y, radius) {
  const polygon = volume.polygon,
    points = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      dx = b.x - a.x,
      dy = b.y - a.y,
      L = dx * dx + dy * dy;
    if (Math.hypot(a.x - x, a.y - y) <= radius + EPS) points.push(a);
    const A = L,
      B = 2 * ((a.x - x) * dx + (a.y - y) * dy),
      C = (a.x - x) ** 2 + (a.y - y) ** 2 - radius ** 2,
      discriminant = B * B - 4 * A * C;
    if (A && discriminant >= 0)
      for (const t of [
        (-B - Math.sqrt(discriminant)) / (2 * A),
        (-B + Math.sqrt(discriminant)) / (2 * A),
      ])
        if (t >= 0 && t <= 1) points.push({ x: a.x + dx * t, y: a.y + dy * t });
  }
  const base = floorAt(volume, x, y),
    gx = volume.floorPlane.a,
    gy = volume.floorPlane.b,
    length = Math.hypot(gx, gy);
  if (length)
    for (const sign of [-1, 1]) {
      const p = { x: x + (sign * radius * gx) / length, y: y + (sign * radius * gy) / length };
      if (inside(polygon, p.x, p.y)) points.push(p);
    }
  if (inside(polygon, x, y)) points.push({ x, y });
  if (!points.length) return null;
  const values = points.map((p) => floorAt(volume, p.x, p.y));
  return { min: Math.min(...values), max: Math.max(...values), center: base };
}
const boxIntersects = (b, x, y, r) =>
  r === 0
    ? x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h
    : Math.hypot(x - clamp(x, b.x, b.x + b.w), y - clamp(y, b.y, b.y + b.h)) < r;
function body(input) {
  const result = {
    x: input?.x,
    y: input?.y,
    z: input?.z ?? 0,
    radius: input?.radius ?? 7,
    height: input?.height ?? 30,
  };
  if (
    !Object.values(result).every(Number.isFinite) ||
    result.radius < 0 ||
    result.radius > 1000 ||
    result.height <= 0 ||
    result.height > 1000
  )
    throw TypeError('Invalid full-height body query.');
  return result;
}
export function createBodyClearance(world) {
  const model = compileRailConstruction(world);
  const terrain = createTerrain(world),
    solids = createSpatialIndex([
      ...(world.buildings ?? []).map((b) => ({ ...b, z: b.z ?? 0, height: b.height ?? 40 })),
      ...(world.obstacles ?? []),
      ...model.supportSolids,
    ]),
    floors = model.structures.floors
      .filter((v) => ['viaduct', 'surface-rail'].includes(v.kind))
      .map((v, index) => {
        let polygon = v.points.map((p) => ({ x: p.x, y: p.y }));
        const area = polygon.reduce((sum, a, i) => {
          const b = polygon[(i + 1) % polygon.length];
          return sum + a.x * b.y - a.y * b.x;
        }, 0);
        if (area < 0) polygon.reverse();
        const xs = polygon.map((p) => p.x),
          ys = polygon.map((p) => p.y);
        return {
          ...v,
          id: `native-rail-floor:${index}`,
          polygon,
          bounds: {
            x: Math.min(...xs),
            y: Math.min(...ys),
            w: Math.max(...xs) - Math.min(...xs),
            h: Math.max(...ys) - Math.min(...ys),
          },
        };
      }),
    floorIndex = createSpatialIndex(floors, { getBounds: (v) => v.bounds });
  function inspect(input, { ignoreWater = false } = {}) {
    const b = body(input),
      issues = [];
    if (b.z < 0)
      return { clear: false, issues: [{ kind: 'negative-full-height-chamber-unverified' }] };
    if (terrain.isBlocked(b.x, b.y, b.radius, b.z, { ignoreWater }))
      issues.push({ kind: 'feet-or-world-boundary' });
    for (const solid of solids.queryRadius(b.x, b.y, b.radius)) {
      if (
        b.z < (solid.z ?? 0) + solid.height &&
        b.z + b.height > (solid.z ?? 0) &&
        boxIntersects(solid, b.x, b.y, b.radius)
      )
        issues.push({ kind: 'solid-body-volume', id: solid.id });
    }
    for (const volume of floorIndex.queryRadius(b.x, b.y, b.radius)) {
      const range = planeExtrema(volume, b.x, b.y, b.radius);
      if (!range || Math.abs(range.center - b.z) <= EPS) continue; // standing on this floor, not beneath it
      if (b.z < range.max && b.z + b.height > range.min - 1)
        issues.push({
          kind: 'overhead-rail-floor',
          id: volume.id,
          undersideMin: range.min - 1,
          undersideMax: range.max - 1,
        });
    }
    return { clear: !issues.length, issues };
  }
  function sweep(a, b, options = {}) {
    const A = body({ ...a, ...options }),
      B = body({ ...b, ...options }),
      distance = Math.hypot(B.x - A.x, B.y - A.y),
      steps = Math.max(1, Math.ceil(distance / 2));
    if (steps > 50000) throw RangeError('Full-height sweep exceeds its bounded query budget.');
    for (let i = 0; i < steps; i++) {
      const lo = i / steps,
        hi = (i + 1) / steps,
        t = (lo + hi) / 2,
        z0 = A.z + (B.z - A.z) * lo,
        z1 = A.z + (B.z - A.z) * hi,
        sample = {
          x: A.x + (B.x - A.x) * t,
          y: A.y + (B.y - A.y) * t,
          z: Math.min(z0, z1),
          radius: Math.max(A.radius, B.radius) + distance / steps / 2,
          height: Math.max(A.height, B.height) + Math.abs(z1 - z0),
        },
        found = inspect(sample, options);
      if (!found.clear) return { ...found, segment: i, sample };
    }
    return { clear: true, issues: [] };
  }
  function ceiling(x, y, z = 0, radius = 7) {
    const b = body({ x, y, z, radius }),
      heights = [];
    for (const volume of floorIndex.queryRadius(x, y, radius)) {
      const range = planeExtrema(volume, x, y, radius);
      if (range && range.min - 1 > z) heights.push(range.min - 1);
    }
    for (const solid of solids.queryRadius(x, y, radius))
      if ((solid.z ?? 0) > z && boxIntersects(solid, x, y, radius)) heights.push(solid.z);
    return heights.length ? Math.min(...heights) : null;
  }
  function limitRise(input, targetZ) {
    const b = body(input);
    if (!Number.isFinite(targetZ) || targetZ < b.z)
      throw TypeError('A body ceiling query requires a finite upward target.');
    const roof = ceiling(b.x, b.y, b.z, b.radius);
    const z = roof === null ? targetZ : Math.max(b.z, Math.min(targetZ, roof - b.height));
    return { z, hit: z < targetZ, ceiling: roof };
  }
  return {
    inspect,
    sweep,
    ceiling,
    limitRise,
    terrain,
    supportSolids: model.supportSolids,
    boundary:
      'Full aboveground body audit uses exact exterior native floor sheets and support piers. Negative chambers remain an explicit unverified boundary.',
  };
}
