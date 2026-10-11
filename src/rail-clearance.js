import { createSpatialIndex } from './spatial-index.js';

/** Full consist clearance. This module never moves trains or changes the city. */
const EPS = 1e-7;
const DEFAULT = { length: 68, width: 20, height: 16 };
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function finite(v, label, min = -1e9, max = 1e9) {
  if (!Number.isFinite(v) || v < min || v > max) throw Error(`Invalid rail clearance ${label}.`);
  return v;
}
function point(p, label = 'point') {
  if (!p || typeof p !== 'object') throw Error(`Invalid rail clearance ${label}.`);
  return { x: finite(p.x, label), y: finite(p.y, label), z: finite(p.z ?? 0, label, -1e6, 1e6) };
}
function bounds(points) {
  const x = points.map((p) => p.x),
    y = points.map((p) => p.y);
  return {
    x: Math.min(...x),
    y: Math.min(...y),
    w: Math.max(...x) - Math.min(...x),
    h: Math.max(...y) - Math.min(...y),
  };
}
function rect(r) {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}
function hull(points) {
  const ordered = [...points].sort((a, b) => a.x - b.x || a.y - b.y),
    lo = [],
    hi = [];
  for (const p of ordered) {
    while (lo.length > 1 && cross(lo.at(-2), lo.at(-1), p) <= EPS) lo.pop();
    lo.push(p);
  }
  for (const p of [...ordered].reverse()) {
    while (hi.length > 1 && cross(hi.at(-2), hi.at(-1), p) <= EPS) hi.pop();
    hi.push(p);
  }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
function area(poly) {
  return (
    Math.abs(
      poly.reduce((s, a, i) => {
        const b = poly[(i + 1) % poly.length];
        return s + a.x * b.y - a.y * b.x;
      }, 0),
    ) / 2
  );
}
function halfPlane(poly, a, b, inside = true) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i],
      q = poly[(i + 1) % poly.length],
      u = cross(a, b, p),
      v = cross(a, b, q),
      P = inside ? u >= -EPS : u <= EPS,
      Q = inside ? v >= -EPS : v <= EPS;
    if (P) out.push(p);
    if (P !== Q) {
      const t = u / (u - v);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  }
  return out.length >= 3 && area(out) > EPS ? out : [];
}
function intersect(A, B) {
  let poly = A;
  for (let i = 0; i < B.length && poly.length; i++)
    poly = halfPlane(poly, B[i], B[(i + 1) % B.length]);
  return poly;
}
function subtract(A, B) {
  const pieces = [];
  let current = A;
  for (let i = 0; i < B.length && current.length; i++) {
    const outside = halfPlane(current, B[i], B[(i + 1) % B.length], false);
    if (outside.length) pieces.push(outside);
    current = halfPlane(current, B[i], B[(i + 1) % B.length]);
  }
  return pieces;
}
function uncovered(polygons, covers) {
  let remaining = polygons;
  for (const cover of covers) {
    remaining = remaining.flatMap((p) => subtract(p, cover));
    if (!remaining.length) break;
  }
  return remaining;
}
function expanded(poly, padding) {
  return padding
    ? hull(
        poly.flatMap((p) =>
          [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ].map(([a, b]) => ({ x: p.x + a * padding, y: p.y + b * padding })),
        ),
      )
    : poly;
}
function plane(a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    denominator = dx * dx + dy * dy;
  if (denominator <= EPS * EPS) throw Error('Invalid rail clearance plane endpoints.');
  const x = ((b.z - a.z) * dx) / denominator,
    y = ((b.z - a.z) * dy) / denominator;
  return { x, y, offset: a.z - x * a.x - y * a.y };
}
function heightAt(p, at) {
  return p.x * at.x + p.y * at.y + p.offset;
}
function heightClip(poly, p, height, below) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      u = heightAt(p, a) - height,
      v = heightAt(p, b) - height,
      A = below ? u <= EPS : u >= -EPS,
      B = below ? v <= EPS : v >= -EPS;
    if (A) out.push(a);
    if (A !== B) {
      const t = u / (u - v);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out.length >= 3 && area(out) > EPS ? out : [];
}
function body(pose, d) {
  const c = Math.cos(pose.heading),
    s = Math.sin(pose.heading);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => ({
    x: pose.x + ((a * d.length) / 2) * c - ((b * d.width) / 2) * s,
    y: pose.y + ((a * d.length) / 2) * s + ((b * d.width) / 2) * c,
  }));
}
function pathData(points) {
  let length = 0;
  const lengths = [];
  for (let i = 1; i < points.length; i++) {
    const span = distance(points[i - 1], points[i]);
    if (
      span <= EPS ||
      Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y) <= EPS
    )
      throw Error('Invalid rail clearance track span.');
    length += span;
    lengths.push(length);
  }
  return { points, lengths, length };
}
function sample(leg, d) {
  d = clamp(d, 0, leg.length);
  let i = leg.lengths.findIndex((at) => at >= d - EPS);
  if (i < 0) i = leg.lengths.length - 1;
  const start = i ? leg.lengths[i - 1] : 0,
    a = leg.points[i],
    b = leg.points[i + 1],
    t = clamp((d - start) / (leg.lengths[i] - start), 0, 1);
  let heading = Math.atan2(b.y - a.y, b.x - a.x);
  for (let j = 0; j < leg.points.length - 2; j++) {
    const before = leg.points[j],
      turn = leg.points[j + 1],
      after = leg.points[j + 2],
      at = leg.lengths[j],
      w = Math.min(12, distance(before, turn) / 3, distance(turn, after) / 3);
    if (d < at - w || d > at + w) continue;
    const first = Math.atan2(turn.y - before.y, turn.x - before.x),
      last = Math.atan2(after.y - turn.y, after.x - turn.x),
      delta = Math.atan2(Math.sin(last - first), Math.cos(last - first)),
      ratio = clamp((d - at + w) / (w * 2), 0, 1);
    heading = first + delta * ratio * ratio * (3 - 2 * ratio);
    break;
  }
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, heading };
}
function cuts(leg, start, end, turnStep = 2, gradeStep = 32) {
  const result = [start, end];
  for (let i = 0; i < leg.lengths.length; i++) {
    const at = leg.lengths[i];
    if (at > start + EPS && at < end - EPS) result.push(at);
    if (i < leg.lengths.length - 1) {
      const w = Math.min(
          12,
          distance(leg.points[i], leg.points[i + 1]) / 3,
          distance(leg.points[i + 1], leg.points[i + 2]) / 3,
        ),
        lo = Math.max(start, at - w),
        hi = Math.min(end, at + w);
      for (const d of [lo, hi]) if (d > start + EPS && d < end - EPS) result.push(d);
      for (let d = lo + turnStep; d < hi - EPS; d += turnStep) result.push(d);
    }
    if (Math.abs(leg.points[i + 1].z - leg.points[i].z) > EPS) {
      const lo = Math.max(start, i ? leg.lengths[i - 1] : 0),
        hi = Math.min(end, at);
      for (let d = lo + gradeStep; d < hi - EPS; d += gradeStep) result.push(d);
    }
  }
  return [...new Set(result)].sort((a, b) => a - b);
}
function envelope(leg, a, b, d, margin = 0) {
  const A = sample(leg, a),
    B = sample(leg, b),
    delta = Math.abs(Math.atan2(Math.sin(B.heading - A.heading), Math.cos(B.heading - A.heading)));
  // Monotone rotation on each subdivided corner: R*delta encloses every
  // intermediate corner relative to either endpoint. Refinement tightens it.
  const padding = (Math.hypot(d.length, d.width) / 2) * delta + margin;
  const polygon = expanded(hull([...body(A, d), ...body(B, d)]), padding);
  return {
    polygon,
    bounds: bounds(polygon),
    zMin: Math.min(A.z, B.z),
    zMax: Math.max(A.z, B.z) + d.height,
    referenceFloorMin: Math.min(A.z, B.z),
    referenceFloorMax: Math.max(A.z, B.z),
  };
}
function lineRect(a, b, width) {
  const L = Math.hypot(b.x - a.x, b.y - a.y),
    x = ((-(b.y - a.y) / L) * width) / 2,
    y = (((b.x - a.x) / L) * width) / 2;
  return hull([
    { x: a.x + x, y: a.y + y },
    { x: a.x - x, y: a.y - y },
    { x: b.x + x, y: b.y + y },
    { x: b.x - x, y: b.y - y },
  ]);
}
function index(items) {
  return createSpatialIndex(items, { getBounds: (item) => item.bounds });
}
function compile(world) {
  const t = world?.transit;
  if (!t || !Array.isArray(t.tracks) || !Array.isArray(t.throughServices))
    throw Error('Invalid rail clearance world.');
  const settings = t.railGeometry?.settings;
  if (
    !settings ||
    settings.trainLength !== 68 ||
    settings.trainWidth !== 20 ||
    settings.trainHeight !== 16
  )
    throw Error('Rail clearance requires the authored 68×20×16 consist.');
  const tracks = new Map();
  for (const track of t.tracks) {
    if (tracks.has(track.id) || !Array.isArray(track.points) || track.points.length < 2)
      throw Error('Invalid rail clearance track.');
    tracks.set(track.id, { id: track.id, ...pathData(track.points.map((p) => point(p))) });
  }
  const services = new Map();
  for (const s of t.throughServices) {
    if (services.has(s.id) || !Array.isArray(s.legs))
      throw Error('Invalid rail clearance service.');
    services.set(
      s.id,
      s.legs.map((l) => {
        const track = tracks.get(l.trackId);
        if (!track || typeof l.reverse !== 'boolean') throw Error('Invalid rail clearance leg.');
        return l.reverse ? { ...track, ...pathData([...track.points].reverse()) } : track;
      }),
    );
  }
  const boundsRect = {
    x: finite(world.bounds?.left, 'bounds'),
    y: finite(world.bounds?.top, 'bounds'),
    w: finite(world.bounds?.right - world.bounds?.left, 'bounds', 1),
    h: finite(world.bounds?.bottom - world.bounds?.top, 'bounds', 1),
  };
  const solids = [...(world.buildings ?? []), ...(world.obstacles ?? [])].map((item, i) => ({
    id: item.id ?? `solid:${i}`,
    polygon: rect({
      x: finite(item.x, 'solid'),
      y: finite(item.y, 'solid'),
      w: finite(item.w, 'solid', 0),
      h: finite(item.h, 'solid', 0),
    }),
    bounds: { x: item.x, y: item.y, w: item.w, h: item.h },
    zMin: finite(item.z ?? 0, 'solid floor', -1e6, 1e6),
    zMax: finite((item.z ?? 0) + (item.height ?? 40), 'solid height', -1e6, 1e6),
  }));
  const land = (world.landforms ?? []).map((f) => {
    const p = f.polygon ?? f.points;
    if (!Array.isArray(p) || p.length < 3) throw Error('Invalid rail clearance landform.');
    const polygon = p.map((v) => ({
      x: finite(Array.isArray(v) ? v[0] : v.x, 'land'),
      y: finite(Array.isArray(v) ? v[1] : v.y, 'land'),
    }));
    return { polygon, bounds: bounds(polygon) };
  });
  // Landforms may be concave. Triangulate by ear clipping before subtraction.
  const triangles = land.flatMap((f) =>
    triangulate(f.polygon).map((polygon) => ({ polygon, bounds: bounds(polygon) })),
  );
  const water = [
    ...(world.lakes ?? []),
    ...(world.water ?? []),
    ...(land.length ? [] : (world.waterVolumes ?? [])),
  ].map((item) => {
    const r = item.bounds ?? item;
    const b = {
      x: finite(r.x, 'water'),
      y: finite(r.y, 'water'),
      w: finite(r.w, 'water', 0),
      h: finite(r.h, 'water', 0),
    };
    return { polygon: rect(b), bounds: b };
  });
  let volumes = [];
  if (t.railClearanceVolumes !== undefined) {
    if (!Array.isArray(t.railClearanceVolumes) || t.railClearanceVolumes.length > 50000)
      throw Error('Invalid rail clearance volumes.');
    volumes = t.railClearanceVolumes.map((v) => {
      if (
        !['sealed-bore', 'cutting', 'viaduct', 'surface-rail'].includes(v.kind) ||
        !Array.isArray(v.polygon) ||
        v.polygon.length < 3 ||
        !Array.isArray(v.trackIds) ||
        !v.trackIds.length ||
        v.trackIds.some((id) => !tracks.has(id))
      )
        throw Error('Invalid rail clearance volume.');
      const polygon = v.polygon.map((p) => ({
        x: finite(p.x, 'volume'),
        y: finite(p.y, 'volume'),
      }));
      if (Math.abs(area(hull(polygon)) - area(polygon)) > 1e-4)
        throw Error('Rail clearance volumes must be convex.');
      const zMin = finite(v.zMin, 'volume floor', -1e6, 1e6),
        zMax = finite(v.zMax, 'volume roof', -1e6, 1e6);
      if (zMax <= zMin) throw Error('Invalid rail clearance headroom.');
      let floorPlane = null,
        roofPlane = null;
      if (
        v.floorStart !== undefined ||
        v.floorEnd !== undefined ||
        v.roofStart !== undefined ||
        v.roofEnd !== undefined
      ) {
        floorPlane = plane(point(v.floorStart, 'floor start'), point(v.floorEnd, 'floor end'));
        roofPlane = plane(point(v.roofStart, 'roof start'), point(v.roofEnd, 'roof end'));
        if (polygon.some((p) => heightAt(roofPlane, p) <= heightAt(floorPlane, p)))
          throw Error('Invalid rail clearance planar headroom.');
      }
      return {
        ...v,
        polygon: hull(polygon),
        bounds: bounds(polygon),
        zMin,
        zMax,
        floorPlane,
        roofPlane,
      };
    });
  } else {
    for (const road of world.roads ?? [])
      if (
        road.access?.includes('rail') &&
        (road.tunnel || Math.min(road.z1 ?? road.z ?? 0, road.z2 ?? road.z ?? 0) < 0)
      ) {
        const a = { x: road.x1, y: road.y1, z: road.z1 ?? road.z ?? 0 },
          b = { x: road.x2, y: road.y2, z: road.z2 ?? road.z ?? 0 },
          polygon = lineRect(a, b, road.width),
          floor = Math.min(a.z, b.z),
          ceiling = floor < -8 ? Math.min(-2, floor + 18) : floor + 18;
        volumes.push({
          id: `legacy-bore:${road.id}`,
          kind: 'sealed-bore',
          polygon,
          bounds: bounds(polygon),
          zMin: floor - 0.5,
          zMax: ceiling,
          trackIds: [],
        });
      }
    for (const span of t.dedicatedRailSpans ?? [])
      for (let i = 1; i < span.points.length; i++) {
        const a = span.points[i - 1],
          b = span.points[i];
        if (Math.hypot(b.x - a.x, b.y - a.y) <= EPS) continue;
        const polygon = lineRect(a, b, span.width);
        volumes.push({
          id: `legacy-span:${span.id}:${i}`,
          kind: span.kind === 'dedicated-rail-bore' ? 'sealed-bore' : 'viaduct',
          polygon,
          bounds: bounds(polygon),
          zMin: Math.min(a.z, b.z) - 0.5,
          zMax: Math.max(a.z, b.z) + 16.5,
          trackIds: [span.trackId],
        });
      }
  }
  return {
    world,
    tracks,
    services,
    bounds: boundsRect,
    solids,
    solidIndex: index(solids),
    land: triangles,
    landIndex: index(triangles),
    water,
    waterIndex: index(water),
    volumes,
    volumeIndex: index(volumes),
  };
}
function triangulate(input) {
  let p = [...input];
  if (
    p.reduce((s, a, i) => {
      const b = p[(i + 1) % p.length];
      return s + a.x * b.y - a.y * b.x;
    }, 0) < 0
  )
    p.reverse();
  const result = [];
  let iterations = 0;
  while (p.length > 3) {
    if (++iterations > input.length * input.length)
      throw Error('Invalid rail clearance polygon topology.');
    let clipped = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length],
        b = p[i],
        c = p[(i + 1) % p.length];
      if (cross(a, b, c) <= EPS) continue;
      if (
        p.some(
          (q, j) =>
            j !== i &&
            j !== (i + p.length - 1) % p.length &&
            j !== (i + 1) % p.length &&
            cross(a, b, q) >= -EPS &&
            cross(b, c, q) >= -EPS &&
            cross(c, a, q) >= -EPS,
        )
      )
        continue;
      result.push([a, b, c]);
      p.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) throw Error('Invalid rail clearance polygon topology.');
  }
  result.push(p);
  return result;
}
function issuesFor(data, zone, trackId) {
  const issues = [];
  if (
    zone.polygon.some(
      (p) =>
        p.x < data.bounds.x - EPS ||
        p.y < data.bounds.y - EPS ||
        p.x > data.bounds.x + data.bounds.w + EPS ||
        p.y > data.bounds.y + data.bounds.h + EPS,
    )
  )
    issues.push({ kind: 'world-bounds' });
  for (const solid of data.solidIndex.queryRect(zone.bounds))
    if (
      zone.zMax > solid.zMin + EPS &&
      zone.zMin < solid.zMax - EPS &&
      intersect(zone.polygon, solid.polygon).length
    )
      issues.push({ kind: 'solid-body', solidId: solid.id });
  const nearby = data.volumeIndex
    .queryRect(zone.bounds)
    .filter(
      (v) =>
        (!v.trackIds.length || v.trackIds.includes(trackId)) &&
        v.zMin <= zone.zMin + EPS &&
        v.zMax >= zone.zMax - EPS,
    )
    .map((v) => {
      let polygon = v.polygon;
      if (v.floorPlane) polygon = heightClip(polygon, v.floorPlane, zone.zMin, true);
      if (v.roofPlane && polygon.length)
        polygon = heightClip(polygon, v.roofPlane, zone.zMax, false);
      return { ...v, polygon };
    })
    .filter((v) => v.polygon.length);
  if (
    zone.zMin < 0 &&
    uncovered(
      [zone.polygon],
      nearby.filter((v) => v.kind === 'sealed-bore' || v.kind === 'cutting').map((v) => v.polygon),
    ).length
  )
    issues.push({ kind: 'bore-containment' });
  let wet = data.land.length
    ? uncovered(
        [zone.polygon],
        data.landIndex.queryRect(zone.bounds).map((f) => f.polygon),
      )
    : [];
  for (const water of data.waterIndex.queryRect(zone.bounds)) {
    const overlap = intersect(zone.polygon, water.polygon);
    if (overlap.length) wet.push(overlap);
  }
  const supporting = nearby.filter((v) =>
    zone.zMin >= 0 ? v.kind === 'viaduct' : v.kind === 'sealed-bore',
  );
  if (
    wet.length &&
    uncovered(
      wet,
      supporting.map((v) => v.polygon),
    ).length
  )
    issues.push({ kind: 'water-support' });
  return issues;
}
function requestLeg(data, request) {
  if (
    !request ||
    typeof request !== 'object' ||
    request.length !== 68 ||
    request.width !== 20 ||
    request.height !== 16
  )
    throw Error('Rail clearance movement dimensions must be 68×20×16.');
  const train = request.train,
    legs = data.services.get(train?.serviceId),
    index = train?.callIndex;
  if (!legs || !Number.isSafeInteger(index) || index < 0 || index >= legs.length)
    throw Error('Invalid rail clearance train leg.');
  const leg = legs[index],
    start = finite(train.distance, 'start distance', 0, leg.length),
    pose = point(train, 'train'),
    expectedStart = sample(leg, start);
  if (
    distance(pose, expectedStart) > 1e-5 ||
    Math.abs(
      Math.atan2(
        Math.sin(train.heading - expectedStart.heading),
        Math.cos(train.heading - expectedStart.heading),
      ),
    ) > 1e-5 ||
    !Number.isFinite(train.heading)
  )
    throw Error('Invalid rail clearance start pose.');
  if (!Array.isArray(request.path) || request.path.length < 2 || request.path.length > 2048)
    throw Error('Invalid rail clearance swept path.');
  const path = request.path.map((p) => point(p, 'sweep')),
    end = start + path.slice(1).reduce((sum, p, i) => sum + distance(path[i], p), 0),
    expected = sample(leg, end),
    actual = point(request.endPose, 'end pose');
  const vertices = leg.lengths
    .filter((d) => d > start + EPS && d < end - EPS)
    .map((d) => sample(leg, d));
  if (
    end > leg.length + 1e-5 ||
    distance(path[0], pose) > 1e-5 ||
    distance(expected, actual) > 1e-5 ||
    !Number.isFinite(request.endPose.heading) ||
    Math.abs(
      Math.atan2(
        Math.sin(expected.heading - request.endPose.heading),
        Math.cos(expected.heading - request.endPose.heading),
      ),
    ) > 1e-5 ||
    vertices.length + 2 !== path.length ||
    vertices.some((p, i) => distance(p, path[i + 1]) > 1e-5)
  )
    throw Error('Invalid rail clearance authored sweep.');
  return { leg, start, end: Math.min(end, leg.length) };
}

/**
 * Returns a synchronous checked callback and inspection helpers. Conservative
 * continuous envelopes refine around possible contact; no nine-unit sampling,
 * city-position radius, centerline-only permission, or ignored bore walls.
 */
export function createRailClearance(world) {
  const data = compile(world);
  function inspect(request) {
    const { leg, start, end } = requestLeg(data, request),
      division = cuts(leg, start, end),
      issues = [];
    const check = (a, b, depth) => {
      if (issues.length) return;
      const zone = envelope(leg, a, b, DEFAULT),
        found = issuesFor(data, zone, leg.id);
      if (!found.length) return;
      if (depth < 18 && b - a > 1e-4) {
        const middle = (a + b) / 2;
        check(a, middle, depth + 1);
        if (!issues.length) check(middle, b, depth + 1);
        return;
      }
      for (const issue of found)
        if (!issues.some((i) => i.kind === issue.kind && i.solidId === issue.solidId))
          issues.push({
            ...issue,
            trackId: leg.id,
            distance: a,
            pose: sample(leg, (a + b) / 2),
            bounds: zone.bounds,
          });
    };
    for (let i = 1; i < division.length && !issues.length; i++)
      check(division[i - 1], division[i], 0);
    return { clear: issues.length === 0, issues };
  }
  const predicate = (request) => inspect(request).clear;
  predicate.inspect = inspect;
  predicate.inspectBody = (pose, trackId) => {
    const leg = data.tracks.get(trackId);
    if (!leg) throw Error('Invalid rail clearance body track.');
    const p = point(pose, 'body');
    finite(pose.heading, 'body heading', -Math.PI * 4, Math.PI * 4);
    const polygon = body({ ...p, heading: pose.heading }, DEFAULT);
    const issues = issuesFor(
      data,
      { polygon, bounds: bounds(polygon), zMin: p.z, zMax: p.z + 16 },
      trackId,
    );
    return { clear: issues.length === 0, issues };
  };
  predicate.dimensions = { ...DEFAULT };
  return predicate;
}

/**
 * Candidate construction geometry. Volumes describe actual bore/cutting walls
 * and rail-only deck support, including end/turn chambers. Parent must build and
 * render them before exposure; no terrain, coast, road, or protected solid is
 * removed. Rooms near protected solids are refined; true conflicts are returned
 * as explicit routing repairs and never clipped away or silently permitted.
 */
export function createRailClearanceWorld(world) {
  const data = compile(world),
    volumes = [],
    refined = [],
    unresolved = [];
  for (const leg of data.tracks.values()) {
    const division = cuts(leg, 0, leg.length, 2, 32);
    const build = (start, end, depth) => {
      if (end - start <= EPS * 2) return;
      const zone = envelope(leg, start, end, DEFAULT, 0.5),
        railStart = sample(leg, start),
        railEnd = sample(leg, end),
        span = Math.hypot(railEnd.x - railStart.x, railEnd.y - railStart.y),
        relief = 0.5 + ((Math.abs(railEnd.z - railStart.z) / span) * Math.hypot(68, 20)) / 2;
      const floorStart = { ...railStart, z: railStart.z - relief },
        floorEnd = { ...railEnd, z: railEnd.z - relief },
        roofStart = { ...railStart, z: railStart.z + 16 + relief },
        roofEnd = { ...railEnd, z: railEnd.z + 16 + relief };
      const floor = plane(floorStart, floorEnd),
        roof = plane(roofStart, roofEnd),
        zMin = Math.min(...zone.polygon.map((p) => heightAt(floor, p))),
        zMax = Math.max(...zone.polygon.map((p) => heightAt(roof, p)));
      const nearby = data.solidIndex
        .queryRect(zone.bounds)
        .filter((s) => zMax > s.zMin + EPS && zMin < s.zMax - EPS);
      const conflicts = nearby.filter((s) => {
        let polygon = intersect(zone.polygon, s.polygon);
        if (polygon.length) polygon = heightClip(polygon, floor, s.zMax, true);
        if (polygon.length) polygon = heightClip(polygon, roof, s.zMin, false);
        return polygon.length;
      });
      if (conflicts.length) {
        if (depth < 12 && end - start > 1e-3) {
          if (!depth)
            refined.push({
              trackId: leg.id,
              startDistance: start,
              endDistance: end,
              solidIds: conflicts.map((s) => s.id),
            });
          const mid = (start + end) / 2;
          build(start, mid, depth + 1);
          build(mid, end, depth + 1);
          return;
        }
        unresolved.push({
          kind: 'protected-solid-routing-required',
          trackId: leg.id,
          startDistance: start,
          endDistance: end,
          solidIds: conflicts.map((s) => s.id),
          requiredHandler:
            'Reroute the track and recompute platforms/resources before constructing this chamber; no protected solid can be removed.',
        });
        return;
      }
      const polygon = zone.polygon;
      volumes.push({
        id: `rail-clearance:${volumes.length + 1}`,
        trackIds: [leg.id],
        kind:
          zone.referenceFloorMin >= 0
            ? zone.referenceFloorMin > EPS
              ? 'viaduct'
              : 'surface-rail'
            : zMax < 0
              ? 'sealed-bore'
              : 'cutting',
        polygon,
        bounds: bounds(polygon),
        zMin,
        zMax,
        railStart,
        railEnd,
        floorStart,
        floorEnd,
        roofStart,
        roofEnd,
        verticalRelief: relief,
        referenceFloorMin: zone.referenceFloorMin,
        referenceFloorMax: zone.referenceFloorMax,
        startDistance: start,
        endDistance: end,
        access: ['rail'],
        construction: 'required',
        sourceSpanIds: (world.transit.dedicatedRailSpans ?? [])
          .filter((s) => s.trackId === leg.id)
          .map((s) => s.id),
        requiredHandler:
          'Build this bounded rail-only clearance chamber/deck; preserve protected solids and raw water below it.',
      });
    };
    for (let i = 1; i < division.length; i++) build(division[i - 1], division[i], 0);
  }
  const candidate = {
    ...world,
    transit: {
      ...world.transit,
      railClearanceVolumes: volumes,
      railClearanceGeometry: {
        version: 1,
        status: 'candidate',
        dimensions: { ...DEFAULT },
        protectedGeometryPreserved: true,
        requiresConstruction: true,
      },
    },
  };
  return {
    world: candidate,
    report: {
      status: 'candidate',
      certified: false,
      requiresConstruction: true,
      dimensions: { ...DEFAULT },
      tracks: data.tracks.size,
      volumes: volumes.length,
      clippedRooms: [],
      refinedRooms: refined,
      unresolved,
      repairs: volumes.map((v) => ({
        volumeId: v.id,
        trackId: v.trackIds[0],
        kind: v.kind,
        startDistance: v.startDistance,
        endDistance: v.endDistance,
        requiredHandler: v.requiredHandler,
      })),
      boundary:
        'Actual full-body and swept circuit checks still required; traffic/player impacts and rendered structures are parent-owned.',
    },
  };
}
