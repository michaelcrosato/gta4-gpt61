/** Physical floors and connected empty space inside built Metro chambers. */
import { createSpatialIndex } from './spatial-index.js';

const EPS = 1e-7;
const INTERVAL_EPS = Number.EPSILON * 32;
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const cross = (a, b, p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
function validatePoint(x, y, z, radius = 0) {
  if (![x, y, z, radius].every(finite) || radius < 0)
    throw new TypeError('Invalid Metro chamber query.');
}
function area(polygon) {
  const origin = polygon[0];
  return (
    polygon.reduce((sum, a, i) => {
      const b = polygon[(i + 1) % polygon.length];
      return sum + (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
    }, 0) / 2
  );
}
function containsCircle(polygon, x, y, radius) {
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L && cross(a, b, { x, y }) < radius * L - EPS * L) return false;
  }
  return true;
}
function clip(polygon, value, inside = true) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      u = value(a),
      v = value(b),
      A = inside ? u >= -EPS : u <= EPS,
      B = inside ? v >= -EPS : v <= EPS;
    if (A) result.push(a);
    if (A !== B) {
      const t = u / (u - v);
      result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  if (result.length < 3) return [];
  const xs = result.map((p) => p.x),
    ys = result.map((p) => p.y),
    extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const coordinateScale = Math.max(1, ...xs.map(Math.abs), ...ys.map(Math.abs));
  // Translation keeps the area stable; the remaining degeneracy bound follows
  // floating-point precision at these coordinates, not the collision tolerance.
  const roundoff = Number.EPSILON * coordinateScale * extent * 16;
  return Math.abs(area(result)) > roundoff ? result : [];
}
function subtract(A, B) {
  const result = [];
  let current = A;
  for (let i = 0; i < B.length && current.length; i++) {
    const a = B[i],
      b = B[(i + 1) % B.length],
      length = Math.hypot(b.x - a.x, b.y - a.y);
    if (!length) continue;
    const value = (p) => cross(a, b, p) / length,
      outside = clip(current, value, false);
    if (outside.length) result.push(outside);
    current = clip(current, value);
  }
  return result;
}
function distanceToEdge(x, y, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    L = dx * dx + dy * dy,
    t = L ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L)) : 0;
  return Math.hypot(x - a.x - dx * t, y - a.y - dy * t);
}
function diskMeetsInterior(polygon, x, y, radius) {
  if (containsCircle(polygon, x, y, 0)) return true;
  return polygon.some(
    (a, i) => distanceToEdge(x, y, a, polygon[(i + 1) % polygon.length]) < radius - EPS,
  );
}
function diskCovered(polygons, x, y, radius) {
  if (polygons.some((polygon) => containsCircle(polygon, x, y, radius))) return true;
  if (!radius) return false;
  let remaining = [
    [
      { x: x - radius, y: y - radius },
      { x: x + radius, y: y - radius },
      { x: x + radius, y: y + radius },
      { x: x - radius, y: y + radius },
    ],
  ];
  for (const polygon of polygons) {
    remaining = remaining.flatMap((piece) => subtract(piece, polygon));
    if (!remaining.length) return true;
  }
  return !remaining.some((piece) => diskMeetsInterior(piece, x, y, radius));
}
function planeHeight(a, b, fallback, x, y) {
  if (!a || !b) return fallback;
  const dx = b.x - a.x,
    dy = b.y - a.y,
    L = dx * dx + dy * dy,
    t = L ? ((x - a.x) * dx + (y - a.y) * dy) / L : 0;
  return a.z + (b.z - a.z) * t;
}
function railFloorHeight(volume, x, y) {
  return planeHeight(volume.floorStart, volume.floorEnd, volume.referenceFloorMin, x, y);
}
function railRoofHeight(volume, x, y) {
  return planeHeight(volume.roofStart, volume.roofEnd, volume.zMax, x, y);
}

/** Exact continuous interval inside one convex 3D chamber, including its planes. */
export function railSpaceInterval(volume, a, b) {
  let low = 0,
    high = 1;
  const constrain = (u, v) => {
    const delta = v - u;
    if (Math.abs(delta) <= EPS) {
      if (u < -EPS) return false;
      return true;
    }
    const t = (-EPS - u) / delta;
    if (delta > 0) low = Math.max(low, t);
    else high = Math.min(high, t);
    return high >= low - INTERVAL_EPS;
  };
  const polygon = volume.polygon;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i],
      q = polygon[(i + 1) % polygon.length],
      L = Math.hypot(q.x - p.x, q.y - p.y);
    if (!L) continue;
    if (!constrain(cross(p, q, a) / L, cross(p, q, b) / L)) return null;
  }
  if (
    !constrain(
      a.z - railFloorHeight(volume, a.x, a.y) + 0.5,
      b.z - railFloorHeight(volume, b.x, b.y) + 0.5,
    )
  )
    return null;
  if (!constrain(railRoofHeight(volume, a.x, a.y) - a.z, railRoofHeight(volume, b.x, b.y) - b.z))
    return null;
  low = Math.max(0, low);
  high = Math.min(1, high);
  return high >= low - INTERVAL_EPS ? [low, high] : null;
}
export function railIntervalsCover(intervals, start = 0, end = 1) {
  let covered = start;
  for (const [low, high] of [...intervals].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    if (high < covered - INTERVAL_EPS) continue;
    if (low > covered + INTERVAL_EPS) return false;
    covered = Math.max(covered, high);
    if (covered >= end - INTERVAL_EPS) return true;
  }
  return covered >= end - INTERVAL_EPS;
}
export function createRailTerrain(world) {
  const source = world.transit?.railClearanceVolumes ?? [],
    volumes = source.map((volume) => {
      if (
        !Array.isArray(volume.polygon) ||
        volume.polygon.length < 3 ||
        !volume.polygon.every((p) => finite(p.x) && finite(p.y)) ||
        !finite(volume.referenceFloorMin) ||
        !finite(volume.zMin) ||
        !finite(volume.zMax) ||
        volume.zMax <= volume.zMin
      )
        throw new TypeError('Invalid built Metro chamber.');
      for (const [a, b] of [
        [volume.floorStart, volume.floorEnd],
        [volume.roofStart, volume.roofEnd],
      ])
        if ((a || b) && ![a, b].every((p) => p && finite(p.x) && finite(p.y) && finite(p.z)))
          throw new TypeError('Invalid built Metro floor grade.');
      let polygon = volume.polygon;
      if (area(polygon) < 0) polygon = [...polygon].reverse();
      if (
        Math.abs(area(polygon)) <= EPS ||
        polygon.some(
          (p, i) =>
            cross(p, polygon[(i + 1) % polygon.length], polygon[(i + 2) % polygon.length]) < -EPS,
        )
      )
        throw new TypeError('Invalid convex Metro chamber.');
      return { ...volume, polygon };
    });
  const index = createSpatialIndex(volumes, { getBounds: (volume) => volume.bounds });
  const nearby = (x, y, radius = 0) => index.queryRadius(x, y, radius);
  function atHeight(volume, z) {
    let polygon = clip(volume.polygon, (p) => z - railFloorHeight(volume, p.x, p.y) + 0.5);
    if (polygon.length) polygon = clip(polygon, (p) => railRoofHeight(volume, p.x, p.y) - z);
    return polygon;
  }
  function space(x, y, z, radius = 0, additionalVolumes = []) {
    validatePoint(x, y, z, radius);
    const polygons = [];
    for (const volume of [...nearby(x, y, radius), ...additionalVolumes]) {
      if (
        !radius &&
        containsCircle(volume.polygon, x, y, 0) &&
        z >= railFloorHeight(volume, x, y) - 0.5 - EPS &&
        z <= railRoofHeight(volume, x, y) + EPS
      )
        return true;
      const polygon = atHeight(volume, z);
      if (!polygon.length) continue;
      if (containsCircle(polygon, x, y, radius)) return true;
      polygons.push(polygon);
    }
    return diskCovered(polygons, x, y, radius);
  }
  return {
    space,
    openPortal(x, y) {
      validatePoint(x, y, 0);
      return nearby(x, y).some(
        (v) =>
          v.kind === 'cutting' &&
          containsCircle(v.polygon, x, y, 0) &&
          railFloorHeight(v, x, y) <= EPS &&
          railRoofHeight(v, x, y) >= -EPS,
      );
    },
    surfaces(x, y, radius = 0) {
      validatePoint(x, y, 0, radius);
      const candidates = [];
      for (const volume of nearby(x, y))
        if (containsCircle(volume.polygon, x, y, 0)) {
          const height = railFloorHeight(volume, x, y),
            ramp = volume.floorStart?.z !== volume.floorEnd?.z,
            existing = candidates.find((surface) => Math.abs(surface.height - height) <= EPS);
          if (existing) existing.ramp ||= ramp;
          else candidates.push({ height, ramp, access: ['foot', 'rail'] });
        }
      return candidates.filter((surface) => space(x, y, surface.height, radius));
    },
    segmentIntervals(a, b) {
      validatePoint(a.x, a.y, a.z);
      validatePoint(b.x, b.y, b.z);
      const query = {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        w: Math.abs(b.x - a.x),
        h: Math.abs(b.y - a.y),
      };
      return index
        .queryRect(query)
        .map((v) => railSpaceInterval(v, a, b))
        .filter(Boolean);
    },
  };
}
