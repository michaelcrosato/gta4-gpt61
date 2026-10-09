/** Derived rail geometry. The source city and its authored records are never mutated. */
import { createTerrain } from './terrain.js';
import { createRoadNetwork, findRoute } from './road-network.js';
import { createSpatialIndex } from './spatial-index.js';

const EPS = 1e-7;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const point = (p, z = p.z ?? 0) => ({ x: p.x, y: p.y, z });
const rectOverlap = (a, b) =>
  a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS && a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;

function project(p, road) {
  const dx = road.x2 - road.x1,
    dy = road.y2 - road.y1;
  const length = Math.hypot(dx, dy);
  const t = clamp(((p.x - road.x1) * dx + (p.y - road.y1) * dy) / length ** 2, 0, 1);
  return { x: road.x1 + dx * t, y: road.y1 + dy * t, t, length, ux: dx / length, uy: dy / length };
}
function clean(points) {
  return points.filter((p, i) => !i || distance(p, points[i - 1]) > EPS);
}
function simplify(points) {
  const result = clean(points);
  for (let i = 1; i < result.length - 1; i++) {
    const a = result[i - 1],
      b = result[i],
      c = result[i + 1];
    const ux = b.x - a.x,
      uy = b.y - a.y,
      vx = c.x - b.x,
      vy = c.y - b.y;
    if (Math.abs(ux * vy - uy * vx) <= EPS * Math.hypot(ux, uy) * Math.hypot(vx, vy)) {
      result.splice(i, 1);
      i = Math.max(0, i - 2);
    }
  }
  return result;
}
function boundsAt(p, heading, length, width) {
  const cx = Math.cos(heading),
    sy = Math.sin(heading);
  const w = Math.abs(cx) * length + Math.abs(sy) * width;
  const h = Math.abs(sy) * length + Math.abs(cx) * width;
  return { x: p.x - w / 2, y: p.y - h / 2, w, h };
}
function samples(points, step = 6) {
  const result = [];
  points.slice(1).forEach((b, i) => {
    const a = points[i],
      count = Math.max(1, Math.ceil(distance(a, b) / step));
    for (let j = i ? 1 : 0; j <= count; j++) {
      const t = j / count;
      result.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * t,
      });
    }
  });
  return result;
}
function grade(points, fromZ, toZ) {
  const lengths = points.slice(1).map((p, i) => distance(points[i], p));
  const total = lengths.reduce((sum, n) => sum + n, 0);
  let done = 0;
  return points.map((p, i) => {
    if (i) done += lengths[i - 1];
    return { x: p.x, y: p.y, z: fromZ + (toZ - fromZ) * (total ? done / total : 0) };
  });
}
function offset(points, amount) {
  const directions = points.slice(1).map((p, i) => {
    const n = distance(points[i], p);
    return { x: (p.x - points[i].x) / n, y: (p.y - points[i].y) / n };
  });
  return points.map((p, i) => {
    const before = directions[Math.max(0, i - 1)],
      after = directions[Math.min(i, directions.length - 1)];
    const nx = -(before.y + after.y),
      ny = before.x + after.x;
    const denominator = nx * -after.y + ny * after.x;
    // Reversals cannot form a miter; their constraint remains explicit in the audit.
    const scale =
      Math.abs(denominator) < EPS ? 0 : (Array.isArray(amount) ? amount[i] : amount) / denominator;
    return { x: p.x + nx * scale, y: p.y + ny * scale };
  });
}

// Route directed edges, so entering a corridor cannot immediately reverse the
// train. The virtual endpoints split existing street reservations only.
function directedRoute(network, start, end, startHeading, endHeading, turnAllowed = () => true) {
  const nodes = network.nodes.map((n) => ({ x: n.x, y: n.y, edges: new Map(n.edges) }));
  const attach = (p) => {
    const existing = nodes.findIndex((n) => distance(n, p) < EPS);
    if (existing >= 0) return existing;
    const id = nodes.length;
    nodes.push({ ...p, edges: new Map() });
    network.segments.forEach((segment, index) => {
      const projection = project(p, segment.road);
      if (distance(projection, p) > EPS) return;
      const splits = network.segmentNodes[index];
      let before = splits[0],
        after = splits.at(-1);
      for (const split of splits) {
        if (split.t <= projection.t + EPS) before = split;
        if (split.t >= projection.t - EPS) {
          after = split;
          break;
        }
      }
      for (const split of [before, after]) {
        const cost = distance(p, nodes[split.id]);
        nodes[id].edges.set(split.id, cost);
        nodes[split.id].edges.set(id, cost);
      }
    });
    return id;
  };
  const from = attach(start),
    to = attach(end);
  const forward = { x: Math.cos(startHeading), y: Math.sin(startHeading) },
    arrival = { x: Math.cos(endHeading), y: Math.sin(endHeading) };
  const queue = [{ node: from, previous: -1, cost: 0, key: `-1/${from}` }],
    costs = new Map([[`-1/${from}`, 0]]),
    parents = new Map();
  while (queue.length) {
    let best = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].cost < queue[best].cost) best = i;
    const current = queue.splice(best, 1)[0];
    if (current.cost > costs.get(current.key) + EPS) continue;
    if (current.node === to) {
      const path = [];
      let key = current.key;
      while (key) {
        const record = parents.get(key);
        const node = Number(key.split('/')[1]);
        path.push({ x: nodes[node].x, y: nodes[node].y });
        key = record;
      }
      return clean(path.reverse());
    }
    const at = nodes[current.node],
      before = current.previous < 0 ? null : nodes[current.previous];
    for (const [next, length] of at.edges) {
      if (length < EPS) continue;
      const dest = nodes[next],
        v = { x: (dest.x - at.x) / length, y: (dest.y - at.y) / length };
      const incoming = before
        ? {
            x: (at.x - before.x) / distance(at, before),
            y: (at.y - before.y) / distance(at, before),
          }
        : forward;
      if (incoming.x * v.x + incoming.y * v.y < -EPS) continue;
      if (before && !turnAllowed(before, at, dest)) continue;
      if (current.previous < 0 && forward.x * v.x + forward.y * v.y < 0.9) continue;
      if (next === to && arrival.x * v.x + arrival.y * v.y < 0.9) continue;
      const key = `${current.node}/${next}`,
        cost = current.cost + length;
      if (cost >= (costs.get(key) ?? Infinity) - EPS) continue;
      costs.set(key, cost);
      parents.set(key, current.key);
      queue.push({ node: next, previous: current.node, cost, key });
    }
  }
  return [];
}

function bodyMeetsBuilding(position, heading, box, settings) {
  if (position.z + settings.trainHeight <= 0 || position.z >= (box.height || 40)) return false;
  const c = Math.cos(heading),
    s = Math.sin(heading),
    dx = box.x + box.w / 2 - position.x,
    dy = box.y + box.h / 2 - position.y;
  const halfLength = settings.trainLength / 2,
    halfWidth = settings.trainWidth / 2;
  // Separating axes for the rotated train rectangle and authored building box.
  return (
    Math.abs(dx) < Math.abs(c) * halfLength + Math.abs(s) * halfWidth + box.w / 2 - EPS &&
    Math.abs(dy) < Math.abs(s) * halfLength + Math.abs(c) * halfWidth + box.h / 2 - EPS &&
    Math.abs(dx * c + dy * s) <
      halfLength + (box.w / 2) * Math.abs(c) + (box.h / 2) * Math.abs(s) - EPS &&
    Math.abs(-dx * s + dy * c) <
      halfWidth + (box.w / 2) * Math.abs(s) + (box.h / 2) * Math.abs(c) - EPS
  );
}
function turnBodies(a, at, b, z, terrain, settings, sourceCenter = true) {
  const L = distance(a, at),
    R = distance(at, b),
    u = { x: (at.x - a.x) / L, y: (at.y - a.y) / L },
    v = { x: (b.x - at.x) / R, y: (b.y - at.y) / R };
  const first = Math.atan2(u.y, u.x),
    last = Math.atan2(v.y, v.x),
    delta = Math.atan2(Math.sin(last - first), Math.cos(last - first));
  if (Math.abs(delta) < EPS) return [];
  let center = point(at, z);
  if (sourceCenter) {
    const nx = -u.y - v.y,
      ny = u.x + v.x,
      denominator = nx * -v.y + ny * v.x;
    if (Math.abs(denominator) < EPS) return ['invalid-turn'];
    center = {
      x: at.x + (settings.trackOffset * nx) / denominator,
      y: at.y + (settings.trackOffset * ny) / denominator,
      z,
    };
  }
  const radius = Math.hypot(settings.trainLength / 2, settings.trainWidth / 2),
    width = Math.min(12, L / 3, R / 3),
    hits = new Set();
  for (let i = -10; i <= 10; i++) {
    const d = (i * width) / 10,
      direction = d < 0 ? u : v;
    const position = { x: center.x + direction.x * d, y: center.y + direction.y * d, z };
    if (!sourceCenter)
      position.z = at.z + (d < 0 ? ((at.z - a.z) * d) / L : ((b.z - at.z) * d) / R);
    const t = (d + width) / (width * 2),
      heading = first + delta * t * t * (3 - 2 * t);
    for (const box of terrain.nearbyBuildings(position.x, position.y, radius))
      if (bodyMeetsBuilding(position, heading, box, settings)) hits.add(box.id);
  }
  return [...hits];
}

function arcLengths(points) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(lengths.at(-1) + distance(points[i - 1], points[i]));
  return lengths;
}
function atArc(points, lengths, d) {
  const at = clamp(d, 0, lengths.at(-1));
  let index = lengths.findIndex((end, i) => i && end >= at - EPS);
  if (index < 1) index = 1;
  const a = points[index - 1],
    b = points[index],
    t = clamp((at - lengths[index - 1]) / (lengths[index] - lengths[index - 1]), 0, 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: 0 };
}
function sourceRoadsAt(a, b, source) {
  return source.roads.filter((road) => {
    const pa = project(a, road),
      pb = project(b, road);
    return distance(pa, a) <= 64 + EPS && distance(pb, b) <= 64 + EPS;
  });
}
function sourceRoadsAlong(a, b, source) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    L = Math.hypot(dx, dy);
  return source.roads.flatMap((road) => {
    const rx = road.x2 - road.x1,
      ry = road.y2 - road.y1,
      R = Math.hypot(rx, ry);
    if (
      Math.abs(dx * ry - dy * rx) > EPS * L * R ||
      Math.abs((road.x1 - a.x) * dy - (road.y1 - a.y) * dx) > 64 * L + EPS
    )
      return [];
    const p = ((road.x1 - a.x) * dx + (road.y1 - a.y) * dy) / (L * L),
      q = p + (rx * dx + ry * dy) / (L * L);
    const lo = Math.max(0, Math.min(p, q)),
      hi = Math.min(1, Math.max(p, q));
    return hi - lo > EPS ? [{ road, lo, hi }] : [];
  });
}
function separateLanes(base, correction, settings) {
  const lengths = arcLengths(base),
    total = lengths.at(-1),
    controls = new Set(lengths);
  for (let d = 0; d < total; d += 40)
    if (lengths.every((at) => Math.abs(at - d) >= 36)) controls.add(d);
  const ds = [...controls].sort((a, b) => a - b),
    anchors = ds.map((d) => atArc(base, lengths, d)),
    bounds = correction.bounds;
  const amounts = anchors.map((p, i) => {
    const edge = Math.min(
      p.x - bounds.x,
      bounds.x + bounds.w - p.x,
      p.y - bounds.y,
      bounds.y + bounds.h - p.y,
    );
    const station = Math.min(ds[i], total - ds[i]) - settings.trainLength;
    return correction.amount * Math.min(clamp(edge / 160, 0, 1), clamp(station / 160, 0, 1));
  });
  const shifted = offset(anchors, amounts);
  shifted[0] = base[0];
  shifted[shifted.length - 1] = base.at(-1);
  return simplify(shifted);
}
function parallelCarOffsets(a, b, source) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    L = Math.hypot(dx, dy),
    nx = -dy / L,
    ny = dx / L;
  return source.roads
    .filter((r) => r.access?.includes('car'))
    .flatMap((road) => {
      const rx = road.x2 - road.x1,
        ry = road.y2 - road.y1,
        R = Math.hypot(rx, ry);
      if (Math.abs(dx * ry - dy * rx) > EPS * L * R) return [];
      const p = ((road.x1 - a.x) * dx + (road.y1 - a.y) * dy) / (L * L),
        q = p + (rx * dx + ry * dy) / (L * L);
      if (Math.min(1, Math.max(p, q)) - Math.max(0, Math.min(p, q)) <= EPS) return [];
      const delta = (road.x1 - a.x) * nx + (road.y1 - a.y) * ny + 24;
      return Math.abs(delta) <= 100 ? [{ road, delta }] : [];
    });
}
function levelProfile(centerline, from, to, source, terrain, settings, trackId) {
  const lengths = arcLengths(centerline),
    total = lengths.at(-1),
    blend = 160,
    zones = [],
    issues = [],
    spans = [];
  const fromLevel = from.z < 0 ? -18 : 18,
    toLevel = to.z < 0 ? -18 : 18;
  const startRun = Math.abs(from.z - fromLevel) / settings.maxRailGrade;
  const endRun = Math.abs(to.z - toLevel) / settings.maxRailGrade;
  if (startRun > EPS)
    zones.push({
      kind: 'station-level-transition',
      start: 0,
      end: startRun,
      fromZ: from.z,
      toZ: fromLevel,
    });
  if (endRun > EPS)
    zones.push({
      kind: 'station-level-transition',
      start: total - endRun,
      end: total,
      fromZ: toLevel,
      toZ: to.z,
    });
  let main = null;
  if (fromLevel !== toLevel) {
    const run = Math.abs(toLevel - fromLevel) / settings.maxRailGrade;
    let best = null;
    for (let i = 1; i < centerline.length; i++) {
      const segmentStart = lengths[i - 1],
        segmentEnd = lengths[i];
      const low = Math.max(segmentStart + blend, startRun + blend + settings.trainLength);
      const high = Math.min(
        segmentEnd - blend - run,
        total - endRun - blend - settings.trainLength - run,
      );
      if (high < low - EPS) continue;
      const positions = new Set([low, high, (low + high) / 2]);
      for (let d = low; d <= high; d += 100) positions.add(d);
      for (const start of positions) {
        const a = atArc(centerline, lengths, start - blend),
          b = atArc(centerline, lengths, start + run + blend);
        const heading = Math.atan2(b.y - a.y, b.x - a.x),
          neighbors = parallelCarOffsets(a, b, source);
        const required =
          settings.trafficLaneOffset +
          settings.carHalfWidth +
          settings.trainWidth / 2 +
          settings.deckThickness;
        let lateralOffset = null;
        for (let offset = settings.trafficTrackOffset; offset <= 48; offset++)
          if (neighbors.every(({ delta }) => Math.abs(offset - delta) >= required + 1)) {
            lateralOffset = offset;
            break;
          }
        if (lateralOffset === null) continue;
        const width = 2 * (lateralOffset + settings.trainWidth / 2 + 6);
        const nx = -Math.sin(heading),
          ny = Math.cos(heading);
        const bounds = boundsAt(
          {
            x: (a.x + b.x) / 2 - nx * settings.trackOffset,
            y: (a.y + b.y) / 2 - ny * settings.trackOffset,
          },
          heading,
          distance(a, b),
          width,
        );
        if ((source.buildings ?? []).some((box) => rectOverlap(bounds, box))) continue;
        const dry = samples([a, b], 24).every((p) =>
          [
            -width / 2 - settings.trackOffset,
            -settings.trackOffset,
            width / 2 - settings.trackOffset,
          ].every(
            (side) => !terrain.isWater(p.x + nx * side, p.y + ny * side, { ignoreDeck: true }),
          ),
        );
        if (!dry) continue;
        const associated = sourceRoadsAt(a, b, source),
          wide = associated.find((road) => road.width >= 80 && !road.bridge && !road.tunnel);
        const rampA = point(atArc(centerline, lengths, start), fromLevel),
          rampB = point(atArc(centerline, lengths, start + run), toLevel);
        let crossings = 0;
        for (const road of source.roads.filter((r) => r.access?.includes('car'))) {
          const hit = intersection(rampA, rampB, road);
          if (
            hit &&
            hit.z + settings.trainHeight > hit.roadZ &&
            hit.z < hit.roadZ + settings.vehicleHeight
          )
            crossings++;
        }
        const score = crossings * 1e6 + (wide ? 0 : 1e5) + Math.abs(start + run / 2 - total / 2);
        if (!best || score < best.score)
          best = {
            kind: 'elevated-metro-transition',
            start,
            end: start + run,
            fromZ: fromLevel,
            toZ: toLevel,
            blend,
            width,
            bounds,
            lateralOffset,
            sourceRoadIds: associated.map((r) => r.id),
            sourceRoadWidth: wide?.width ?? Math.max(0, ...associated.map((r) => r.width)),
            parallelCarRoadIds: neighbors.map(({ road }) => road.id),
            minParallelBodyClearance: neighbors.length
              ? Math.min(
                  ...neighbors.map(
                    ({ delta }) =>
                      Math.min(
                        Math.abs(lateralOffset - delta - settings.trafficLaneOffset),
                        Math.abs(lateralOffset - delta + settings.trafficLaneOffset),
                      ) -
                      settings.trainWidth / 2 -
                      settings.carHalfWidth,
                  ),
                )
              : null,
            reservation: wide
              ? 'existing-wide-street-reservation'
              : 'new-dedicated-rail-reservation',
            score,
          };
      }
    }
    if (best) {
      main = best;
      zones.push(main);
    } else {
      issues.push({
        kind: 'grade-transition-corridor-unresolved',
        recordId: trackId,
        requiredRun: run,
        requiredWidth: 96,
        requiredHandler:
          'Author a dry separated transition corridor; car closure is not authorized.',
        connectivityEffect: 'This rail leg is not ready for adoption; public roads remain open.',
      });
      const longest = lengths
        .slice(1)
        .map((end, i) => ({ start: lengths[i], end, length: end - lengths[i] }))
        .sort((a, b) => b.length - a.length)[0];
      main = {
        kind: 'unresolved-transition',
        start: longest.start,
        end: longest.end,
        fromZ: fromLevel,
        toZ: toLevel,
        blend: 0,
      };
      zones.push(main);
    }
  }
  zones.sort((a, b) => a.start - b.start);
  const baseLevel = (d) => {
    let z = from.z;
    for (const zone of zones) {
      if (d < zone.start) return z;
      if (d <= zone.end)
        return (
          zone.fromZ +
          (zone.toZ - zone.fromZ) * clamp((d - zone.start) / (zone.end - zone.start), 0, 1)
        );
      z = zone.toZ;
    }
    return z;
  };
  const offsetAt = (d) => {
    let amount = 0;
    if (main?.blend)
      amount = Math.max(
        amount,
        Math.min(
          clamp((d - main.start + blend) / blend, 0, 1),
          clamp((main.end + blend - d) / blend, 0, 1),
        ),
      );
    return ((main?.lateralOffset ?? settings.trafficTrackOffset) - settings.trackOffset) * amount;
  };
  // A separate rail viaduct above an existing public bridge keeps its entire
  // car/foot deck open. Its explicit span never changes land or water geometry.
  const supports = [];
  for (let i = 1; i < centerline.length; i++) {
    const a = centerline[i - 1],
      b = centerline[i],
      roads = sourceRoadsAlong(a, b, source).filter(
        ({ road }) => road.bridge && road.access?.includes('car'),
      );
    for (const { road, lo, hi } of roads) {
      const count = Math.max(1, Math.ceil((distance(a, b) * (hi - lo)) / 25));
      let used = false;
      for (let j = 0; j <= count; j++) {
        const d = lengths[i - 1] + distance(a, b) * (lo + ((hi - lo) * j) / count);
        if (baseLevel(d) < 0) continue;
        const p = atArc(centerline, lengths, d),
          projection = project(p, road);
        const roadZ =
          (road.z1 ?? road.z ?? 0) +
          ((road.z2 ?? road.z ?? 0) - (road.z1 ?? road.z ?? 0)) * projection.t;
        supports.push({ d, z: roadZ + settings.vehicleHeight + settings.deckThickness + 6 });
        used = true;
      }
      if (used)
        spans.push({
          kind: 'dedicated-rail-viaduct',
          trackId,
          sourceCrossingRoadId: road.id,
          start: lengths[i - 1] + distance(a, b) * lo,
          end: lengths[i - 1] + distance(a, b) * hi,
          width: settings.trainWidth,
          publicDeckPreserved: true,
          requiredHandler: 'Render/build a separate rail deck above the public bridge.',
          connectivityEffect: 'No car or foot access is removed.',
        });
    }
    for (const road of source.roads.filter((r) => r.bridge && r.access?.includes('car'))) {
      const hit = intersection(point(a), point(b), road);
      if (!hit) continue;
      const d = lengths[i - 1] + distance(a, hit);
      if (baseLevel(d) < 0) continue;
      supports.push({ d, z: hit.roadZ + settings.vehicleHeight + settings.deckThickness + 6 });
    }
  }
  const supportedLevel = (d) =>
    supports.reduce(
      (z, support) => Math.max(z, support.z - settings.maxRailGrade * Math.abs(d - support.d)),
      -Infinity,
    );
  // Finish a public-bridge overpass approach before the metro/elevated ramp
  // starts. Otherwise a bridge clearance cone can lengthen a nominal ramp.
  if (main?.kind === 'elevated-metro-transition') {
    for (let i = 0; i < 4; i++) {
      const excess = supportedLevel(main.start) - main.fromZ;
      if (excess <= EPS) break;
      const shift = ((main.fromZ > main.toZ ? 1 : -1) * excess) / settings.maxRailGrade;
      if (
        main.start + shift < startRun + settings.trainLength ||
        main.end + shift > total - endRun - settings.trainLength
      ) {
        issues.push({
          kind: 'transition-bridge-approach-unresolved',
          recordId: trackId,
          requiredHandler:
            'Lengthen or reroute the rail transition/viaduct approach without closing public roads.',
          connectivityEffect: 'Rail adoption requires authoring; public road access remains open.',
        });
        break;
      }
      main.start += shift;
      main.end += shift;
    }
    const a = atArc(centerline, lengths, main.start - blend),
      b = atArc(centerline, lengths, main.end + blend),
      heading = Math.atan2(b.y - a.y, b.x - a.x);
    main.bounds = boundsAt(
      {
        x: (a.x + b.x) / 2 + Math.sin(heading) * settings.trackOffset,
        y: (a.y + b.y) / 2 - Math.cos(heading) * settings.trackOffset,
      },
      heading,
      distance(a, b),
      main.width,
    );
  }
  const levelAt = (d) => Math.max(baseLevel(d), supportedLevel(d));
  for (const [d, face] of [
    [0, from],
    [total, to],
  ])
    if (Math.abs(levelAt(d) - face.z) > EPS)
      issues.push({
        kind: 'bridge-approach-clearance-unresolved',
        recordId: trackId,
        platformId: face.id,
        requiredHandler:
          'Reroute or lengthen the rail viaduct approach while keeping the station level.',
        connectivityEffect: 'Rail adoption requires authoring; public bridge access remains open.',
      });
  const controls = new Set([
    ...lengths,
    0,
    Math.min(settings.trainLength, total),
    Math.max(0, total - settings.trainLength),
    total,
  ]);
  for (const zone of zones)
    for (const d of [zone.start - blend, zone.start, zone.end, zone.end + blend])
      controls.add(clamp(d, 0, total));
  for (const support of supports)
    for (const d of [
      support.d,
      support.d - (support.z - 18) / settings.maxRailGrade,
      support.d + (support.z - 18) / settings.maxRailGrade,
    ])
      controls.add(clamp(d, 0, total));
  // Sampling only the profile is bounded; the resulting XY route retains its
  // authored vertices and explicit transition boundaries.
  for (let d = 0; d < total; d += 20) controls.add(d);
  const ds = [...controls]
    .sort((a, b) => a - b)
    .filter((d, i, array) => !i || d - array[i - 1] > EPS);
  const anchors = ds.map((d) => atArc(centerline, lengths, d)),
    shifted = offset(anchors, ds.map(offsetAt));
  shifted[0] = from.stopPoint;
  shifted[shifted.length - 1] = to.stopPoint;
  const points = shifted.map((p, i) => ({ ...p, z: levelAt(ds[i]) }));
  const compact = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = compact.at(-1),
      b = points[i],
      c = points[i + 1],
      L = distance(a, b),
      R = distance(b, c);
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const sameGrade = Math.abs((b.z - a.z) / L - (c.z - b.z) / R) < EPS;
    if (
      Math.abs(cross) <= EPS * L * R &&
      sameGrade &&
      (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) > 0
    )
      continue;
    compact.push(b);
  }
  compact.push(points.at(-1));
  for (const zone of zones)
    zone.points = [zone.start, zone.end].map((d) => {
      const index = ds.findIndex((at) => Math.abs(at - d) < EPS);
      return point(points[index >= 0 ? index : 0]);
    });
  for (const span of spans)
    span.points = points.filter((p, i) => ds[i] >= span.start - EPS && ds[i] <= span.end + EPS);
  return { points: compact, zones, issues, spans };
}
function addRoads(id, points, width, access, output, extra = {}) {
  return points.slice(1).map((b, i) => {
    const a = points[i],
      length = distance(a, b);
    const road = {
      id: `${id}:${i + 1}`,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      z1: a.z,
      z2: b.z,
      z: a.z,
      width,
      access,
      grade: (b.z - a.z) / length,
      layer: Math.min(a.z, b.z) < 0 ? 'subsurface' : Math.max(a.z, b.z) > 0 ? 'elevated' : 'ground',
      tunnel: Math.min(a.z, b.z) < 0,
      // An explicitly supported flat walkway remains at its own level when
      // crossing the projection of another station's underground stair.
      bridge: access.includes('foot') && a.z === b.z,
      kind: 'rail-access',
      ...extra,
    };
    output.push(road);
    return road.id;
  });
}
function intersection(a, b, road) {
  const ux = b.x - a.x,
    uy = b.y - a.y;
  const vx = road.x2 - road.x1,
    vy = road.y2 - road.y1;
  const dx = road.x1 - a.x,
    dy = road.y1 - a.y;
  const denominator = ux * vy - uy * vx;
  if (Math.abs(denominator) < EPS) return null;
  const t = (dx * vy - dy * vx) / denominator;
  const u = (dx * uy - dy * ux) / denominator;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return {
    x: a.x + ux * t,
    y: a.y + uy * t,
    z: a.z + (b.z - a.z) * t,
    roadZ: (road.z1 ?? road.z ?? 0) + ((road.z2 ?? road.z ?? 0) - (road.z1 ?? road.z ?? 0)) * u,
  };
}
function parallelOverlap(a, b, road, settings) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length = Math.hypot(dx, dy);
  const rx = road.x2 - road.x1,
    ry = road.y2 - road.y1,
    run = Math.hypot(rx, ry);
  if (Math.abs(dx * ry - dy * rx) > EPS * length * run) return null;
  const lateral = ((a.x - road.x1) * -ry + (a.y - road.y1) * rx) / run;
  const laneDistance = Math.min(
    Math.abs(lateral - settings.trafficLaneOffset),
    Math.abs(lateral + settings.trafficLaneOffset),
  );
  const required = settings.trainWidth / 2 + settings.carHalfWidth + settings.deckThickness;
  if (laneDistance >= required) return null;
  const first = ((a.x - road.x1) * rx + (a.y - road.y1) * ry) / run;
  const last = ((b.x - road.x1) * rx + (b.y - road.y1) * ry) / run;
  let lo = Math.max(0, Math.min(-first / (last - first), (run - first) / (last - first)));
  let hi = Math.min(1, Math.max(-first / (last - first), (run - first) / (last - first)));
  if (hi - lo < EPS) return null;
  const zAt = (t) =>
    (road.z1 ?? road.z ?? 0) + (((road.z2 ?? road.z ?? 0) - (road.z1 ?? road.z ?? 0)) * t) / run;
  const za = a.z - zAt(first),
    zb = b.z - zAt(last),
    delta = zb - za;
  const low = -settings.trainHeight - settings.deckThickness,
    high = settings.vehicleHeight + settings.deckThickness;
  if (Math.abs(delta) < EPS) {
    if (za <= low || za >= high) return null;
  } else {
    const x = (low - za) / delta,
      y = (high - za) / delta;
    lo = Math.max(lo, Math.min(x, y));
    hi = Math.min(hi, Math.max(x, y));
  }
  if (hi - lo < EPS) return null;
  const at = (t) => ({ x: a.x + dx * t, y: a.y + dy * t, z: a.z + (b.z - a.z) * t });
  return { from: at(lo), to: at(hi), length: (hi - lo) * length, laneDistance, required };
}

/** Exact 3D line/open box test with configurable horizontal/vertical clearance. */
function hitsBox(a, b, box, radius, height) {
  let lo = 0,
    hi = 1;
  for (const [key, min, max] of [
    ['x', box.x - radius, box.x + box.w + radius],
    ['y', box.y - radius, box.y + box.h + radius],
    ['z', -height, box.height || 40],
  ]) {
    const delta = b[key] - a[key];
    if (Math.abs(delta) < EPS) {
      if (a[key] <= min + EPS || a[key] >= max - EPS) return false;
    } else {
      let near = (min - a[key]) / delta,
        far = (max - a[key]) / delta;
      if (near > far) [near, far] = [far, near];
      lo = Math.max(lo, near);
      hi = Math.min(hi, far);
      if (hi - lo <= EPS) return false;
    }
  }
  return true;
}

function auditSource(source) {
  const platforms = source.transit.stations.flatMap((station) => station.platforms),
    byId = new Map(platforms.map((p) => [p.id, p]));
  const intersections = [],
    tangents = [],
    overlaps = [];
  for (const track of source.transit.tracks) {
    const segments = track.points
      .slice(1)
      .map((b, index) => ({ a: track.points[index], b, index }))
      .filter((s) => distance(s.a, s.b) > EPS);
    for (const { a, b, index } of segments)
      for (const building of source.buildings ?? [])
        if (hitsBox(a, b, building, 0, 0))
          intersections.push({ trackId: track.id, segmentIndex: index, buildingId: building.id });
    for (const [side, segment, id] of [
      ['from', segments[0], track.fromPlatformId],
      ['to', segments.at(-1), track.toPlatformId],
    ]) {
      const platform = byId.get(id);
      if (!platform || !segment) continue;
      const dx = segment.b.x - segment.a.x,
        dy = segment.b.y - segment.a.y;
      if (platform.axis === 'north-south' ? Math.abs(dx) > EPS : Math.abs(dy) > EPS)
        tangents.push({ trackId: track.id, side, platformId: id, axis: platform.axis, dx, dy });
    }
  }
  for (let i = 0; i < platforms.length; i++)
    for (let j = i + 1; j < platforms.length; j++) {
      const a = platforms[i],
        b = platforms[j],
        A = boundsAt(a, a.axis === 'north-south' ? Math.PI / 2 : 0, a.length, a.width),
        B = boundsAt(b, b.axis === 'north-south' ? Math.PI / 2 : 0, b.length, b.width);
      if (rectOverlap(A, B))
        overlaps.push({
          platformIds: [a.id, b.id],
          sameHeight: a.z === b.z,
          width: Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x),
          height: Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y),
        });
    }
  return {
    boundary:
      'Strict source centerline/building-volume audit; source footprints use authored platform centers. No playable certification.',
    centerlineBuildingIntersections: {
      segments: intersections.length,
      tracks: new Set(intersections.map((i) => i.trackId)).size,
      trackBuildingPairs: new Set(intersections.map((i) => `${i.trackId}|${i.buildingId}`)).size,
      buildings: new Set(intersections.map((i) => i.buildingId)).size,
      records: intersections,
    },
    endpointAxisMismatches: tangents,
    platformOverlaps: overlaps,
    sharedOpposedTracks: source.transit.tracks
      .filter((track) => {
        const uses = source.transit.throughServices.flatMap((service) =>
          (service.legs ?? []).filter((leg) => leg.trackId === track.id),
        );
        return uses.some((leg) => leg.reverse) && uses.some((leg) => !leg.reverse);
      })
      .map((track) => track.id),
  };
}

function railInterlocks(tracks, settings) {
  const padding = settings.trainWidth + settings.deckThickness,
    vertical = settings.trainHeight + settings.deckThickness;
  const segments = tracks.flatMap((track) =>
    track.points.slice(1).map((b, index) => ({
      trackId: track.id,
      serviceId: track.serviceId,
      a: track.points[index],
      b,
      index,
      order: 0,
      x: Math.min(track.points[index].x, b.x) - padding,
      y: Math.min(track.points[index].y, b.y) - padding,
      w: Math.abs(track.points[index].x - b.x) + padding * 2,
      h: Math.abs(track.points[index].y - b.y) + padding * 2,
    })),
  );
  segments.forEach((segment, index) => (segment.order = index));
  const index = createSpatialIndex(segments),
    constraints = new Map();
  let rawPairs = 0,
    separated = 0;
  const keyPoint = (p) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
  const store = (kind, A, B, points, detail = {}) => {
    const key = `${kind}:${points.map(keyPoint).sort().join('|')}`;
    let item = constraints.get(key);
    if (!item) {
      item = {
        id: '',
        kind,
        points,
        trackIds: new Set(),
        serviceIds: new Set(),
        segmentIds: new Set(),
        flowClasses: new Set(),
        flowPairs: new Map(),
        status: 'interlocking-required',
        requiredHandler:
          kind === 'shared-rail-span'
            ? 'Reserve the shared physical block across all track/service IDs until both carriages clear it.'
            : 'Arbitrate and reserve this physical junction before any train enters; release only after the complete train clears it.',
        connectivityEffect:
          'Rail services remain connected and yield at the interlock; no public road is closed.',
        ...detail,
      };
      constraints.set(key, item);
    }
    item.trackIds.add(A.trackId);
    item.trackIds.add(B.trackId);
    item.serviceIds.add(A.serviceId);
    item.serviceIds.add(B.serviceId);
    item.segmentIds.add(`${A.trackId}:${A.index}`);
    item.segmentIds.add(`${B.trackId}:${B.index}`);
    if (kind === 'shared-rail-span') {
      const sameDirection =
        (A.b.x - A.a.x) * (B.b.x - B.a.x) + (A.b.y - A.a.y) * (B.b.y - B.a.y) > 0;
      const flow = sameDirection ? 'same-direction-headway' : 'opposing-direction';
      item.flowClasses.add(flow);
      item.flowPairs.set([A.trackId, B.trackId].sort().join('|'), {
        trackIds: [A.trackId, B.trackId],
        flow,
      });
    }
    rawPairs++;
  };
  for (const A of segments)
    for (const B of index.queryRect(A)) {
      if (B.order <= A.order || (A.trackId === B.trackId && Math.abs(A.index - B.index) <= 1))
        continue;
      const ux = A.b.x - A.a.x,
        uy = A.b.y - A.a.y,
        L = Math.hypot(ux, uy),
        vx = B.b.x - B.a.x,
        vy = B.b.y - B.a.y,
        R = Math.hypot(vx, vy);
      const denominator = ux * vy - uy * vx;
      if (Math.abs(denominator) <= EPS * L * R) {
        const lateral = Math.abs((B.a.x - A.a.x) * uy - (B.a.y - A.a.y) * ux) / L;
        if (lateral >= padding) continue;
        const first = ((B.a.x - A.a.x) * ux + (B.a.y - A.a.y) * uy) / L,
          last = first + (vx * ux + vy * uy) / L;
        let lo = Math.max(0, Math.min(first, last)),
          hi = Math.min(L, Math.max(first, last));
        if (hi - lo <= EPS) continue;
        const atA = (d) => ({
          x: A.a.x + (ux * d) / L,
          y: A.a.y + (uy * d) / L,
          z: A.a.z + ((A.b.z - A.a.z) * d) / L,
        });
        const atB = (d) => {
          const t = (d - first) / (last - first);
          return { x: B.a.x + vx * t, y: B.a.y + vy * t, z: B.a.z + (B.b.z - B.a.z) * t };
        };
        const a = atA(lo).z - atB(lo).z,
          b = atA(hi).z - atB(hi).z,
          delta = b - a;
        if (Math.abs(delta) < EPS) {
          if (Math.abs(a) >= vertical) {
            separated++;
            continue;
          }
        } else {
          const p = (-vertical - a) / delta,
            q = (vertical - a) / delta,
            span = hi - lo;
          const start = lo;
          lo = start + Math.max(0, Math.min(p, q)) * span;
          hi = start + Math.min(1, Math.max(p, q)) * span;
          if (hi - lo <= EPS) {
            separated++;
            continue;
          }
        }
        const points = [atA(lo), atA(hi), atB(lo), atB(hi)];
        store('shared-rail-span', A, B, points, { length: hi - lo, lateralSeparation: lateral });
      } else {
        const hit = intersection(A.a, A.b, {
          x1: B.a.x,
          y1: B.a.y,
          x2: B.b.x,
          y2: B.b.y,
          z1: B.a.z,
          z2: B.b.z,
        });
        if (hit) {
          if (Math.abs(hit.z - hit.roadZ) >= vertical) {
            separated++;
            continue;
          }
          store(
            'rail-junction',
            A,
            B,
            [
              { x: hit.x, y: hit.y, z: hit.z },
              { x: hit.x, y: hit.y, z: hit.roadZ },
            ],
            { verticalSeparation: Math.abs(hit.z - hit.roadZ) },
          );
        }
      }
    }
  const clearance = settings.trainLength / 2 + settings.trainWidth / 2 + settings.deckThickness;
  const records = [...constraints.values()].map((item, i) => {
    const xs = item.points.map((p) => p.x),
      ys = item.points.map((p) => p.y),
      zs = item.points.map((p) => p.z);
    return {
      ...item,
      id: `rail-interlock:${i + 1}`,
      trackIds: [...item.trackIds].sort(),
      serviceIds: [...item.serviceIds].sort(),
      segmentIds: [...item.segmentIds].sort(),
      flowClasses: [...item.flowClasses],
      flowPairs: [...item.flowPairs.values()],
      bounds: {
        x: Math.min(...xs) - clearance,
        y: Math.min(...ys) - clearance,
        w: Math.max(...xs) - Math.min(...xs) + clearance * 2,
        h: Math.max(...ys) - Math.min(...ys) + clearance * 2,
        zMin: Math.min(...zs),
        zMax: Math.max(...zs) + settings.trainHeight,
      },
      fullTrainBuffer: clearance,
    };
  });
  return {
    records,
    rawPairs,
    gradeSeparatedPairs: separated,
    boundary:
      'Conservative cross-service rail-width/height audit with complete-train buffers. Parent must reserve actual swept rotated movement atomically per timestep.',
  };
}

function groupedResources(records, tracks, platforms, settings) {
  const parent = records.map((_, i) => i),
    root = (i) => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
  const union = (a, b) => {
    a = root(a);
    b = root(b);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };
  const zOverlap = (A, B) =>
    A.bounds.zMin < B.bounds.zMax - EPS && B.bounds.zMin < A.bounds.zMax - EPS;
  const axis = (record) => {
    const a = record.points[0],
      b = record.points[1],
      L = distance(a, b);
    return { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  };
  for (let i = 0; i < records.length; i++)
    for (let j = i + 1; j < records.length; j++) {
      const A = records[i],
        B = records[j];
      if (A.kind !== B.kind || !zOverlap(A, B)) continue;
      if (A.kind === 'rail-junction') {
        if (
          distance(A.points[0], B.points[0]) <=
          settings.trainLength + settings.trainWidth + settings.deckThickness * 2
        )
          union(i, j);
      } else {
        const u = axis(A),
          v = axis(B);
        if (Math.abs(u.x * v.y - u.y * v.x) > 1e-4) continue;
        const along = (points) => points.map((p) => p.x * u.x + p.y * u.y),
          across = (points) => points.map((p) => -p.x * u.y + p.y * u.x);
        const a = along(A.points),
          b = along(B.points),
          p = across(A.points),
          q = across(B.points);
        const gap = Math.max(Math.min(...p) - Math.max(...q), Math.min(...q) - Math.max(...p), 0);
        if (
          gap < settings.trainWidth + settings.deckThickness &&
          Math.min(Math.max(...a), Math.max(...b)) >= Math.max(Math.min(...a), Math.min(...b)) - EPS
        )
          union(i, j);
      }
    }
  const groups = new Map();
  records.forEach((record, i) => {
    const key = root(i);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  const margin = settings.trainWidth / 2 + settings.deckThickness,
    buffer = settings.trainLength / 2;
  const resources = [...groups.values()].map((group, i) => {
    const points = group.flatMap((r) => r.points),
      xs = points.map((p) => p.x),
      ys = points.map((p) => p.y),
      zs = points.map((p) => p.z);
    const physicalBounds = {
      x: Math.min(...xs) - margin,
      y: Math.min(...ys) - margin,
      w: Math.max(...xs) - Math.min(...xs) + margin * 2,
      h: Math.max(...ys) - Math.min(...ys) + margin * 2,
      zMin: Math.min(...zs),
      zMax: Math.max(...zs) + settings.trainHeight,
    };
    const entryBounds = {
      ...physicalBounds,
      x: physicalBounds.x - buffer,
      y: physicalBounds.y - buffer,
      w: physicalBounds.w + buffer * 2,
      h: physicalBounds.h + buffer * 2,
      zMin: physicalBounds.zMin - settings.trainHeight,
    };
    return {
      id: `rail-resource:${i + 1}`,
      type: group[0].kind === 'rail-junction' ? 'junction' : 'shared-block',
      physicalBounds,
      bounds: entryBounds,
      entryBounds,
      releaseBounds: { ...entryBounds },
      entryBuffer: buffer,
      releaseBuffer: buffer,
      trackIds: [...new Set(group.flatMap((r) => r.trackIds))].sort(),
      serviceIds: [...new Set(group.flatMap((r) => r.serviceIds))].sort(),
      flowClasses: [...new Set(group.flatMap((r) => r.flowClasses))],
      rawConstraintIds: group.map((r) => r.id),
      requiredHandler:
        'Acquire the complete outgoing-leg resource bundle atomically before departure; retain terminal holds until the full rear clears the release envelope.',
      connectivityEffect:
        'Services remain connected and wait at protected stops; public roads are not closed.',
    };
  });
  const intervals = (track, box) => {
    const runs = [0];
    for (let i = 1; i < track.points.length; i++) {
      const a = track.points[i - 1],
        b = track.points[i];
      runs.push(runs.at(-1) + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
    }
    let low = Infinity,
      high = -Infinity;
    for (let i = 1; i < track.points.length; i++) {
      const a = track.points[i - 1],
        b = track.points[i];
      let lo = 0,
        hi = 1;
      for (const [k, min, max] of [
        ['x', box.x, box.x + box.w],
        ['y', box.y, box.y + box.h],
        ['z', box.zMin, box.zMax],
      ]) {
        const delta = b[k] - a[k];
        if (Math.abs(delta) < EPS) {
          if (a[k] < min - EPS || a[k] > max + EPS) {
            hi = -1;
            break;
          }
        } else {
          const p = (min - a[k]) / delta,
            q = (max - a[k]) / delta;
          lo = Math.max(lo, Math.min(p, q));
          hi = Math.min(hi, Math.max(p, q));
        }
      }
      if (hi >= lo) {
        const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z),
          base = runs[i - 1];
        low = Math.min(low, base + length * lo);
        high = Math.max(high, base + length * hi);
      }
    }
    return Number.isFinite(low)
      ? { entryDistance: Math.max(0, low), releaseDistance: high + settings.trainLength / 2 }
      : null;
  };
  const legBundles = {};
  const resourceMap = new Map(resources.map((resource) => [resource.id, resource]));
  for (const track of tracks)
    legBundles[track.id] = resources.flatMap((resource) => {
      const interval = intervals(track, resource.entryBounds);
      return interval ? [{ resourceId: resource.id, ...interval }] : [];
    });
  for (const track of tracks)
    for (const { resourceId } of legBundles[track.id]) {
      const resource = resourceMap.get(resourceId);
      if (!resource.trackIds.includes(track.id)) resource.trackIds.push(track.id);
      if (!resource.serviceIds.includes(track.serviceId)) resource.serviceIds.push(track.serviceId);
    }
  resources.forEach((resource) => {
    resource.trackIds.sort();
    resource.serviceIds.sort();
  });
  const stationBundles = {};
  for (const platform of platforms.values()) {
    const p = platform.stopPoint;
    stationBundles[platform.id] = resources
      .filter(
        ({ entryBounds: b }) =>
          p.x >= b.x - EPS &&
          p.x <= b.x + b.w + EPS &&
          p.y >= b.y - EPS &&
          p.y <= b.y + b.h + EPS &&
          p.z >= b.zMin - EPS &&
          p.z <= b.zMax + EPS,
      )
      .map((r) => r.id);
  }
  return { resources, legBundles, stationBundles };
}

function groupedRoadGates(crossings, settings) {
  const groups = [];
  for (const crossing of crossings.filter((c) => c.status === 'gap-required')) {
    let group = groups.find(
      (g) =>
        g.roadId === crossing.roadId &&
        g.points.some((p) => distance(p, crossing) <= settings.trainLength + settings.trainWidth),
    );
    if (!group) {
      group = { roadId: crossing.roadId, points: [], trackIds: new Set() };
      groups.push(group);
    }
    group.points.push({ x: crossing.x, y: crossing.y, z: crossing.z, roadZ: crossing.roadZ });
    group.trackIds.add(crossing.trackId);
  }
  const buffer = settings.trainLength / 2 + 16 + settings.deckThickness;
  return groups.map((group, i) => {
    const xs = group.points.map((p) => p.x),
      ys = group.points.map((p) => p.y),
      zs = group.points.flatMap((p) => [p.z, p.roadZ]);
    return {
      ...group,
      id: `rail-road-gate:${i + 1}`,
      type: 'road-crossing',
      trackIds: [...group.trackIds].sort(),
      trackId: [...group.trackIds][0],
      policy: 'gate-cars',
      entryBuffer: buffer,
      releaseBuffer: buffer,
      clearance: Math.min(
        ...group.points.map((p) =>
          p.z >= p.roadZ
            ? p.z - p.roadZ - settings.deckThickness
            : p.roadZ - p.z - settings.trainHeight,
        ),
      ),
      required: Math.max(
        ...group.points.map((p) =>
          p.z >= p.roadZ ? settings.vehicleHeight : settings.deckThickness,
        ),
      ),
      bounds: {
        x: Math.min(...xs) - buffer,
        y: Math.min(...ys) - buffer,
        w: Math.max(...xs) - Math.min(...xs) + buffer * 2,
        h: Math.max(...ys) - Math.min(...ys) + buffer * 2,
        zMin: Math.min(...zs),
        zMax: Math.max(...zs) + Math.max(settings.trainHeight, settings.vehicleHeight),
      },
      requiredHandler:
        'Gate this local car/foot crossing before the complete train enters and release only after both carriages clear.',
      connectivityEffect:
        'The public road remains connected; no permanent closure or car rerouting is authorized.',
    };
  });
}

/**
 * Candidate geometry, not a completion certificate. All constraints are retained
 * in report.unresolved; callers must use their normal collision guard for trains.
 */
function buildRailWorld(source, options = {}, laneCorrections = []) {
  if (
    !source ||
    !Array.isArray(source.roads) ||
    !Array.isArray(source.transit?.stations) ||
    !Array.isArray(source.transit?.throughServices) ||
    !Array.isArray(source.transit?.tracks)
  )
    throw new TypeError('A city with authored roads and rail topology is required.');
  const settings = {
    actorRadius: 7,
    trainLength: 68,
    trainWidth: 20,
    trainHeight: 16,
    platformWidth: 24,
    platformLength: 104,
    trackOffset: 24,
    trafficTrackOffset: 36,
    trafficLaneOffset: 14,
    carHalfWidth: 8.5,
    maxFootGrade: 0.5,
    maxRailGrade: 0.06,
    vehicleHeight: 14,
    deckThickness: 2,
    ...options,
  };
  for (const [key, value] of Object.entries(settings))
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`Invalid rail option: ${key}.`);
  if (
    settings.platformWidth < settings.actorRadius * 2 + 2 ||
    settings.platformLength < settings.trainLength + settings.actorRadius * 2 ||
    settings.trackOffset < settings.platformWidth / 2 + settings.trainWidth / 2 + 2
  )
    throw new RangeError('Rail platforms require actor, train, and edge clearance.');
  const report = {
    status: 'candidate',
    certified: false,
    settings,
    sourceStations: source.transit.stations.length,
    sourcePlatforms: source.transit.stations.reduce((n, s) => n + s.platforms.length, 0),
    sourceTracks: source.transit.tracks.length,
    stations: [],
    tracks: [],
    unresolved: [],
    roadCrossings: [],
    trafficReservations: [],
    parallelConflicts: [],
    transitionZones: [],
    dedicatedRailSpans: [],
    waterCrossings: [],
    auditBoundary:
      'Geometry candidate; continuous gameplay, train conflicts, and rendered clearances need integration verification.',
    sourceAudit: auditSource(source),
  };
  const terrain = createTerrain(source),
    buildings = source.buildings ?? [],
    roads = [],
    decks = [],
    accessPaths = [],
    reservations = [],
    platforms = new Map(),
    stationMap = new Map(),
    eligible = source.roads.filter(
      (r) =>
        r.access?.includes('foot') &&
        !r.bridge &&
        !r.tunnel &&
        (r.z1 ?? r.z ?? 0) === 0 &&
        (r.z2 ?? r.z ?? 0) === 0,
    );
  const gap = (kind, recordId, detail) => report.unresolved.push({ kind, recordId, ...detail });
  const dry = (p) => !terrain.isWater(p.x, p.y, { ignoreDeck: true });
  const clearRect = (rect) => !buildings.some((b) => rectOverlap(rect, b));
  const pathSafe = (path) =>
    samples(path, 4).every(
      (p) => dry(p) && !terrain.isBlocked(p.x, p.y, settings.actorRadius, 0, { ignoreWater: true }),
    );
  const rampConflict = (a, b) =>
    accessPaths.some((path) =>
      path.points.slice(1).some((d, i) => {
        const c = path.points[i];
        if (c.z === d.z) return false;
        const u = { x: b.x - a.x, y: b.y - a.y },
          v = { x: d.x - c.x, y: d.y - c.y };
        const lu = Math.hypot(u.x, u.y),
          lv = Math.hypot(v.x, v.y);
        if (Math.abs(u.x * v.y - u.y * v.x) < EPS * lu * lv) {
          const perpendicular = Math.abs((c.x - a.x) * u.y - (c.y - a.y) * u.x) / lu;
          if (perpendicular >= 18) return false;
          const first = ((c.x - a.x) * u.x + (c.y - a.y) * u.y) / lu;
          const last = ((d.x - a.x) * u.x + (d.y - a.y) * u.y) / lu;
          return Math.min(lu, Math.max(first, last)) - Math.max(0, Math.min(first, last)) > 24;
        }
        const hit = intersection(a, b, { x1: c.x, y1: c.y, x2: d.x, y2: d.y, z1: c.z, z2: d.z });
        return !!hit && !(distance(hit, a) < 12 && distance(hit, c) < 12);
      }),
    );
  const stationSources = source.transit.stations;

  for (const station of stationSources) {
    const faces = [],
      islandReports = [];
    for (let roleIndex = 0; roleIndex < station.platforms.length; roleIndex++) {
      const original = station.platforms[roleIndex],
        entry = station.entrances?.[0];
      if (!entry) throw new TypeError(`Station ${station.id} has no street entrance.`);
      const candidateRoads = [...eligible].sort(
        (a, b) =>
          (a.id === entry.roadId ? -1e6 : distance(entry, project(entry, a))) -
          (b.id === entry.roadId ? -1e6 : distance(entry, project(entry, b))),
      );
      let placement = null;
      const lowElevated =
        original.z > 0 && original.z < settings.vehicleHeight + settings.deckThickness;
      const islandWidth = lowElevated
        ? settings.platformWidth + 2 * (settings.trafficTrackOffset - settings.trackOffset)
        : settings.platformWidth;
      const stopOffset = lowElevated ? settings.trafficTrackOffset : settings.trackOffset;
      const entranceRoad = source.roads.find((r) => r.id === entry.roadId);
      const entranceProjection = entranceRoad ? project(entry, entranceRoad) : null;
      for (const road of candidateRoads) {
        const projection = project(entry, road);
        if (distance(entry, projection) > 500) continue;
        const sign = roleIndex % 2 ? -1 : 1;
        for (const shift of [160, -160, 320, -320, 480, -480, 640, -640]) {
          const along = projection.t * projection.length + shift * sign;
          const endMargin = Math.max(settings.platformLength / 2 + 12, settings.trainLength + 12);
          if (along < endMargin || along > projection.length - endMargin) continue;
          const center = {
            x: road.x1 + projection.ux * along,
            y: road.y1 + projection.uy * along,
            z: original.z,
          };
          const approachDirection = Math.sign(along - projection.t * projection.length);
          const rampEnd = {
            x: center.x - (projection.ux * approachDirection * settings.platformLength) / 2,
            y: center.y - (projection.uy * approachDirection * settings.platformLength) / 2,
            z: center.z,
          };
          const heading = Math.atan2(projection.uy, projection.ux);
          const bounds = boundsAt(center, heading, settings.platformLength, islandWidth);
          if (
            !clearRect(bounds) ||
            reservations.some(
              (r) =>
                Math.abs(r.z - center.z) < settings.trainHeight && rectOverlap(r.bounds, bounds),
            )
          )
            continue;
          const railBounds = [-1, 1].map((side) =>
            boundsAt(
              {
                x: center.x - projection.uy * stopOffset * side,
                y: center.y + projection.ux * stopOffset * side,
              },
              heading,
              settings.trainLength,
              settings.trainWidth,
            ),
          );
          if (railBounds.some((rect) => !clearRect(rect))) continue;
          if (rampConflict(point(projection, 0), rampEnd)) continue;
          const walk =
            road.id === entry.roadId
              ? [projection]
              : findRoute(source, entranceProjection ?? entry, projection, { mode: 'foot' });
          if (!walk.length) continue;
          const groundPath = clean([
            point(entry, 0),
            ...(entranceProjection ? [point(entranceProjection, 0)] : []),
            ...walk.map((p) => point(p, 0)),
            point(center, 0),
          ]);
          if (groundPath.length < 2 || !pathSafe(groundPath)) continue;
          const run = distance(projection, rampEnd);
          if (Math.abs(original.z) / run > settings.maxFootGrade) continue;
          // The lateral street approach remains at ground level. One continuous
          // stair/ramp carries the actor to the island; no elevation teleport.
          const path = clean([...groundPath.slice(0, -1), rampEnd, point(center)]);
          placement = {
            center,
            heading,
            bounds,
            path,
            road,
            projection,
            footGrade: Math.abs(center.z) / run,
          };
          break;
        }
        if (placement) break;
      }
      if (!placement) {
        gap('station-reservation-unresolved', original.id, { stationId: station.id });
        continue;
      }
      const islandId = `${original.id}:island`,
        { center, heading, bounds, path, road, footGrade } = placement;
      reservations.push({ islandId, bounds, z: center.z });
      const accessId = `${original.id}:street-access`;
      const pathRoadIds = addRoads(
        accessId,
        path,
        Math.max(18, settings.actorRadius * 2 + 4),
        ['foot'],
        roads,
        {
          stationId: station.id,
          sourcePlatformId: original.id,
          pedestrianOnly: true,
          kind: 'station-stairs',
        },
      );
      const deckRoadPoints = [-1, 1].map((side) => ({
        x: center.x + ((Math.cos(heading) * settings.platformLength) / 2) * side,
        y: center.y + ((Math.sin(heading) * settings.platformLength) / 2) * side,
        z: center.z,
      }));
      const deckRoadIds = addRoads(islandId, deckRoadPoints, islandWidth, ['foot'], roads, {
        stationId: station.id,
        kind: 'station-platform',
        islandId,
      });
      decks.push({
        id: islandId,
        ...bounds,
        bounds,
        z: center.z,
        access: ['foot'],
        stationId: station.id,
        kind: 'station-platform',
        sourcePlatformId: original.id,
      });
      accessPaths.push({
        id: accessId,
        stationId: station.id,
        sourcePlatformId: original.id,
        points: path,
        width: Math.max(18, settings.actorRadius * 2 + 4),
        grade: footGrade,
        access: ['foot'],
        roadIds: pathRoadIds,
        fromEntranceId: entry.id,
        toIslandId: islandId,
      });
      const uses = source.transit.throughServices.filter((s) =>
        s.calls.some((call) => call.platformId === original.id),
      );
      uses.forEach((service, index) => {
        const direction = index % 2 ? -1 : 1,
          faceHeading = heading + (direction < 0 ? Math.PI : 0);
        const nx = -Math.sin(faceHeading),
          ny = Math.cos(faceHeading);
        const faceShift = stopOffset - settings.trackOffset;
        const faceCenter = {
          x: center.x + nx * faceShift,
          y: center.y + ny * faceShift,
          z: center.z,
        };
        const face = {
          ...original,
          id: `${original.id}@${service.id}`,
          sourcePlatformId: original.id,
          islandId,
          serviceId: service.id,
          direction,
          x: faceCenter.x,
          y: faceCenter.y,
          z: center.z,
          length: settings.platformLength,
          width: settings.platformWidth,
          heading: faceHeading,
          axis: Math.abs(Math.cos(heading)) > 0.5 ? 'east-west' : 'north-south',
          bounds: boundsAt(faceCenter, heading, settings.platformLength, settings.platformWidth),
          railAnchor: point(center),
          stopPoint: { x: center.x + nx * stopOffset, y: center.y + ny * stopOffset, z: center.z },
          boardingPoint: { x: faceCenter.x + nx * 4, y: faceCenter.y + ny * 4, z: center.z },
          accessPathIds: [accessId],
          deckRoadIds,
          runtimeStatus: 'candidate',
        };
        faces.push(face);
        platforms.set(face.id, face);
      });
      islandReports.push({
        sourcePlatformId: original.id,
        islandId,
        roadId: road.id,
        accessPathId: accessId,
        position: center,
        displacement: distance(original, center),
        faces: uses.length,
        status: 'reserved',
      });
    }
    const derived = {
      ...station,
      platforms: faces,
      runtimeStatus: 'candidate',
      sourcePlatformIds: station.platforms.map((p) => p.id),
    };
    stationMap.set(station.id, derived);
    report.stations.push({
      stationId: station.id,
      islands: islandReports,
      usable: faces.length === station.platforms.length * 2,
    });
  }
  const stationRoadIds = new Set(
    report.stations.flatMap((station) => station.islands.map((island) => island.roadId)),
  );
  const corridorSource = {
    ...source,
    roads: source.roads.filter((road) => road.width >= 50 || stationRoadIds.has(road.id)),
  };
  const corridorNetwork = createRoadNetwork(corridorSource, { mode: 'foot' });
  const undergroundNetwork = createRoadNetwork(source, { mode: 'foot' });
  const tracks = [],
    throughServices = [];
  for (const service of source.transit.throughServices) {
    const calls = service.calls.map((call) => ({
      ...call,
      sourcePlatformId: call.platformId,
      platformId: `${call.platformId}@${service.id}`,
    }));
    const legs = [];
    for (let i = 0; i < calls.length; i++) {
      const next = calls[(i + 1) % calls.length],
        a = platforms.get(calls[i].platformId),
        b = platforms.get(next.platformId);
      const sourceTrackId = service.legs?.[i]?.trackId ?? service.trackIds[i];
      const id = `${sourceTrackId}@${service.id}`;
      if (!a || !b) {
        gap('missing-platform-face', id, { serviceId: service.id });
        continue;
      }
      const stub = Math.max(60, settings.trainLength);
      const anchorA = a.railAnchor,
        anchorB = b.railAnchor;
      const start = {
        x: anchorA.x + Math.cos(a.heading) * stub,
        y: anchorA.y + Math.sin(a.heading) * stub,
      };
      const end = {
        x: anchorB.x - Math.cos(b.heading) * stub,
        y: anchorB.y - Math.sin(b.heading) * stub,
      };
      const corridor = directedRoute(
        a.z < 0 && b.z < 0 ? undergroundNetwork : corridorNetwork,
        start,
        end,
        a.heading,
        b.heading,
        a.z === b.z && a.z >= 0
          ? (before, at, after) =>
              turnBodies(before, at, after, a.z, terrain, settings).length === 0
          : undefined,
      );
      if (corridor.length < 2) {
        gap('rail-corridor-disconnected', id, { serviceId: service.id });
        continue;
      }
      const centers = clean([anchorA, start, ...corridor, end, anchorB]);
      const base = offset(centers, settings.trackOffset);
      base[0] = a.stopPoint;
      base[base.length - 1] = b.stopPoint;
      base[1] = {
        x: a.stopPoint.x + Math.cos(a.heading) * stub,
        y: a.stopPoint.y + Math.sin(a.heading) * stub,
      };
      base[base.length - 2] = {
        x: b.stopPoint.x - Math.cos(b.heading) * stub,
        y: b.stopPoint.y - Math.sin(b.heading) * stub,
      };
      let centerline = simplify(base);
      for (const correction of laneCorrections.filter((c) => c.trackId === id))
        centerline = separateLanes(centerline, correction, settings);
      const profile = levelProfile(centerline, a, b, source, terrain, settings, id),
        points = profile.points;
      report.unresolved.push(...profile.issues);
      report.transitionZones.push(
        ...profile.zones.map((zone, index) => ({
          ...zone,
          id: `${id}:transition:${index + 1}`,
          trackId: id,
          requiredHandler:
            zone.kind === 'elevated-metro-transition'
              ? 'Build separated rail cutting/ramps and protect the few crossing points.'
              : 'Connect the station level to the running level.',
          connectivityEffect: 'Public parallel car and foot routes remain open.',
        })),
      );
      report.dedicatedRailSpans.push(
        ...profile.spans.map((span, index) => ({ ...span, id: `${id}:viaduct:${index + 1}` })),
      );
      const length = points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0);
      const maxGrade = Math.max(
        ...points.slice(1).map((p, i) => Math.abs((p.z - points[i].z) / distance(points[i], p))),
      );
      const gradedDistance = points
        .slice(1)
        .reduce(
          (sum, p, i) => sum + (Math.abs(p.z - points[i].z) > EPS ? distance(points[i], p) : 0),
          0,
        );
      const track = {
        id,
        sourceTrackId,
        serviceId: service.id,
        fromPlatformId: a.id,
        toPlatformId: b.id,
        platformIds: [a.id, b.id],
        points,
        access: ['rail'],
        width: settings.trainWidth,
        layer: Math.min(a.z, b.z) < 0 ? 'subsurface' : 'elevated',
        runtimeStatus: 'candidate',
        collisionAndGradeStatus: 'audited-candidate',
        grade: (b.z - a.z) / length,
        maxGrade,
        gradedDistance,
        flatDistance: length - gradedDistance,
        transitionZones: profile.zones,
        corridorRoadIds: [],
        geometryStatus: 'candidate',
        trainEnvelope: {
          length: settings.trainLength,
          width: settings.trainWidth,
          height: settings.trainHeight,
        },
      };
      tracks.push(track);
      legs.push({
        trackId: id,
        sourceTrackId,
        fromPlatformId: a.id,
        toPlatformId: b.id,
        reverse: false,
      });
      const prior = report.unresolved.length;
      if (track.maxGrade > settings.maxRailGrade + EPS)
        gap('rail-grade-exceeded', id, { grade: track.maxGrade });
      const buildingIds = buildings
        .filter((box) =>
          points
            .slice(1)
            .some((p, j) =>
              hitsBox(points[j], p, box, settings.trainWidth / 2, settings.trainHeight),
            ),
        )
        .map((box) => box.id);
      if (buildingIds.length) gap('train-building-clearance', id, { buildingIds });
      const bodyBuildings = new Set();
      for (let j = 1; j < points.length - 1; j++)
        for (const buildingId of turnBodies(
          points[j - 1],
          points[j],
          points[j + 1],
          points[j].z,
          terrain,
          settings,
          false,
        ))
          bodyBuildings.add(buildingId);
      if (bodyBuildings.size)
        gap('train-body-building-clearance', id, {
          buildingIds: [...bodyBuildings],
          audit: '21 rotated envelope samples per turn',
        });
      for (let j = 1; j < points.length - 1; j++) {
        const u = { x: points[j].x - points[j - 1].x, y: points[j].y - points[j - 1].y },
          v = { x: points[j + 1].x - points[j].x, y: points[j + 1].y - points[j].y };
        const cosine = clamp(
          (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)),
          -1,
          1,
        );
        if (cosine < -0.9) gap('rail-reversal-needs-turnout', id, { pointIndex: j });
      }
      const sampledTrack = samples(points, 12),
        wet = sampledTrack.filter((p) => !dry(p));
      if (wet.length) {
        const unsupported = wet.filter(
          (p) =>
            !source.roads.some(
              (r) =>
                (r.bridge || r.tunnel) &&
                r.access?.length &&
                distance(p, project(p, r)) + settings.trainWidth / 2 <= r.width / 2 + EPS,
            ),
        );
        report.waterCrossings.push({
          trackId: id,
          samples: wet.length,
          unsupported: unsupported.length,
          usesExistingCrossing: unsupported.length === 0,
          requiresDedicatedRailStructure: true,
        });
        let group = [],
          spanNumber = 0;
        const flush = () => {
          if (!group.length) return;
          report.dedicatedRailSpans.push({
            id: `${id}:water-span:${++spanNumber}`,
            trackId: id,
            kind: group.some((p) => p.z >= 0) ? 'dedicated-rail-viaduct' : 'dedicated-rail-bore',
            points: group,
            width: settings.trainWidth,
            publicDeckPreserved: true,
            requiredHandler:
              'Render/build the declared rail deck or sealed bore on this crossing alignment.',
            connectivityEffect: 'Existing public bridges/tunnels retain all car and foot access.',
          });
          group = [];
        };
        sampledTrack.forEach((p, index) => {
          if (!dry(p)) {
            if (!group.length && index) group.push(sampledTrack[index - 1]);
            group.push(p);
          } else if (group.length) {
            group.push(p);
            flush();
          }
        });
        flush();
        if (unsupported.length)
          gap('rail-water-span-unresolved', id, {
            samples: unsupported.length,
            first: unsupported[0],
          });
      }
      const seen = new Set();
      for (const road of source.roads.filter((r) => r.access?.includes('car'))) {
        for (let j = 1; j < points.length; j++) {
          const parallel = parallelOverlap(points[j - 1], points[j], road, settings);
          if (parallel) {
            const constraint = {
              id: `${id}:parallel:${road.id}:${j}`,
              trackId: id,
              roadId: road.id,
              kind: 'parallel-clearance-unresolved',
              policy: 'reroute-rail',
              requiredHandler:
                'Reroute or vertically/laterally separate the rail; no public car closure is authorized.',
              connectivityEffect: 'Rail adoption requires authoring; this car road remains open.',
              ...parallel,
              bounds: {
                x: Math.min(parallel.from.x, parallel.to.x) - road.width / 2,
                y: Math.min(parallel.from.y, parallel.to.y) - road.width / 2,
                w: Math.abs(parallel.to.x - parallel.from.x) + road.width,
                h: Math.abs(parallel.to.y - parallel.from.y) + road.width,
              },
            };
            report.parallelConflicts.push(constraint);
            gap('parallel-clearance-unresolved', id, constraint);
          }
          const hit = intersection(points[j - 1], points[j], road);
          if (!hit) continue;
          const key = `${road.id}:${Math.round(hit.x)}:${Math.round(hit.y)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const clearance =
            hit.z >= hit.roadZ
              ? hit.z - hit.roadZ - settings.deckThickness
              : hit.roadZ - hit.z - settings.trainHeight;
          const required = hit.z >= hit.roadZ ? settings.vehicleHeight : settings.deckThickness;
          const crossing = {
            trackId: id,
            roadId: road.id,
            ...hit,
            clearance,
            required,
            status: clearance >= required ? 'separated' : 'gap-required',
          };
          report.roadCrossings.push(crossing);
          if (clearance < required)
            gap('vehicle-clearance-gap-required', id, {
              roadId: road.id,
              point: hit,
              clearance,
              required,
              requiredHandler:
                'Enforce a local car/foot crossing signal or author a grade-separated crossing.',
              connectivityEffect:
                'The road remains connected; traffic yields only during a train crossing.',
              gapBounds: {
                x: hit.x - settings.trainWidth,
                y: hit.y - settings.trainWidth,
                w: settings.trainWidth * 2,
                h: settings.trainWidth * 2,
              },
            });
        }
      }
      track.geometryStatus =
        !profile.issues.length && report.unresolved.length === prior
          ? 'reserved'
          : 'requires-authoring';
      track.corridorRoadIds = addRoads(id, points, settings.trainWidth, ['rail'], roads, {
        kind: 'rail-bed',
        sourceTrackId,
        serviceId: service.id,
      });
      report.tracks.push({
        trackId: id,
        sourceTrackId,
        length,
        grade: track.grade,
        maxGrade,
        gradedDistance,
        flatDistance: track.flatDistance,
        status: track.geometryStatus,
      });
    }
    throughServices.push({
      ...service,
      calls,
      legs,
      trackIds: legs.map((leg) => leg.trackId),
      runtimeStatus: 'candidate',
    });
  }
  const stations = [...stationMap.values()];
  const interchanges = (source.transit.interchanges ?? []).map((interchange) => {
    const station = stationMap.get(interchange.stationId),
      islandIds = [...new Set(station.platforms.map((p) => p.islandId))];
    const paths = accessPaths.filter((path) => path.stationId === station.id);
    const transferPaths = [];
    for (let i = 0; i < paths.length; i++)
      for (let j = i + 1; j < paths.length; j++) {
        const a = paths[i],
          b = paths[j],
          points = clean([...a.points].reverse().concat(b.points.slice(1)));
        transferPaths.push({
          id: `${station.id}:transfer:${i}-${j}`,
          stationId: station.id,
          fromIslandId: a.toIslandId,
          toIslandId: b.toIslandId,
          points,
          width: Math.min(a.width, b.width),
          access: ['foot'],
          roadIds: [...a.roadIds, ...b.roadIds],
          viaStreetEntrance: true,
          grade: Math.max(a.grade, b.grade),
        });
      }
    return {
      ...interchange,
      platformIds: station.platforms.map((p) => p.id),
      islandIds,
      transferPaths,
      pedestrianTransfer: transferPaths.length ? 'graded-walking-path' : 'unresolved',
    };
  });
  const segments = (source.transit.segments ?? []).map((segment) => {
    const service = throughServices.find((s) => s.segmentIds.includes(segment.id));
    return {
      ...segment,
      calls: segment.calls.map((call) => ({
        ...call,
        sourcePlatformId: call.platformId,
        platformId: `${call.platformId}@${service.id}`,
      })),
      runtimeStatus: 'candidate',
    };
  });
  const derived = {
    ...source,
    roads: [...source.roads, ...roads],
    decks: [...(source.decks ?? []), ...decks],
    navigationRevision: (source.navigationRevision ?? 0) + 1,
    transit: {
      ...source.transit,
      stations,
      tracks,
      throughServices,
      segments,
      interchanges,
      accessPaths,
      railGeometry: { status: 'candidate', sourceGeometryPreserved: true, settings },
      trafficReservations: report.trafficReservations,
      transitionZones: report.transitionZones,
      dedicatedRailSpans: report.dedicatedRailSpans,
      parallelClearanceConstraints: report.parallelConflicts,
      railCrossings: report.roadCrossings
        .filter((crossing) => crossing.status === 'gap-required')
        .map((crossing, index) => ({
          ...crossing,
          id: `rail-level-crossing:${index + 1}`,
          kind: 'perpendicular-level-crossing',
          policy: 'gate-cars',
          bounds: {
            x: crossing.x - settings.trainWidth,
            y: crossing.y - settings.trainWidth,
            w: settings.trainWidth * 2,
            h: settings.trainWidth * 2,
          },
        })),
      roadClearanceGaps: report.unresolved.filter(
        (issue) => issue.kind === 'vehicle-clearance-gap-required',
      ),
    },
  };
  report.usableStationComplexes = report.stations.filter((s) => s.usable).length;
  report.directionalFaces = platforms.size;
  report.directionalTracks = tracks.length;
  report.accessPaths = accessPaths.length;
  report.addedRoads = roads.length;
  report.addedDecks = decks.length;
  const shared = railInterlocks(tracks, settings);
  report.sharedRailConstraints = shared.records;
  report.sharedRailAudit = {
    rawSegmentPairs: shared.rawPairs,
    gradeSeparatedSegmentPairs: shared.gradeSeparatedPairs,
    boundary: shared.boundary,
    requiredHandler:
      'Acquire the complete canonical leg bundle and destination occupancy before departure, retain incoming terminal holds through full rear clearance, and also reserve proposed swept movement atomically each timestep; track IDs are not occupancy domains.',
  };
  derived.transit.railInterlocks = shared.records;
  const grouped = groupedResources(shared.records, tracks, platforms, settings);
  derived.transit.railResources = grouped.resources;
  derived.transit.legResourceBundles = grouped.legBundles;
  derived.transit.stationResourceBundles = grouped.stationBundles;
  report.physicalRailResources = grouped.resources;
  report.resourceClassification = grouped.resources.reduce(
    (counts, r) => ((counts[r.type] = (counts[r.type] ?? 0) + 1), counts),
    {},
  );
  derived.transit.railCrossingRecords = derived.transit.railCrossings;
  derived.transit.railCrossings = groupedRoadGates(report.roadCrossings, settings);
  report.roadGateResources = derived.transit.railCrossings;
  derived.transit.railOccupancyPolicy = {
    atomicStepReservations: true,
    completeLegReservationsRequired: true,
    destinationOccupancyRequired: true,
    rearClearanceReleaseRequired: true,
    mergeOverlappingBounds: true,
    trackIdsAreOccupancyDomains: false,
  };
  report.roadConnectivity = {
    carRecordsPreserved: true,
    footRecordsPreserved: true,
    permanentCarClosures: 0,
    gatedRoadIds: [
      ...new Set(
        report.roadCrossings
          .filter((crossing) => crossing.status === 'gap-required')
          .map((crossing) => crossing.roadId),
      ),
    ],
    unresolvedRailRoadIds: [
      ...new Set(report.parallelConflicts.map((conflict) => conflict.roadId)),
    ],
  };
  report.metrics = {
    runningDistance: report.tracks.reduce((n, t) => n + t.length, 0),
    gradedDistance: report.tracks.reduce((n, t) => n + t.gradedDistance, 0),
    flatDistance: report.tracks.reduce((n, t) => n + t.flatDistance, 0),
  };
  report.directionalLaneCorrections = laneCorrections;
  return { world: derived, report };
}

/** Build, audit, and separate opposing running lanes before exposing a candidate. */
export function createRailWorld(source, options = {}) {
  let corrections = [],
    result;
  for (let pass = 0; pass < 3; pass++) {
    result = buildRailWorld(source, options, corrections);
    const opposing = result.report.sharedRailConstraints.filter((r) =>
      r.flowClasses.includes('opposing-direction'),
    );
    if (!opposing.length) return result;
    const regions = new Map();
    for (const record of opposing)
      for (const pair of record.flowPairs.filter((p) => p.flow === 'opposing-direction'))
        for (const id of pair.trackIds) {
          if (!regions.has(id)) regions.set(id, []);
          regions.get(id).push(...record.points);
        }
    const updated = new Map(corrections.map((c) => [c.trackId, c]));
    for (const [trackId, points] of regions) {
      const xs = points.map((p) => p.x),
        ys = points.map((p) => p.y);
      updated.set(trackId, {
        trackId,
        amount: 14 + pass * 4,
        bounds: {
          x: Math.min(...xs) - 400,
          y: Math.min(...ys) - 240,
          w: Math.max(...xs) - Math.min(...xs) + 800,
          h: Math.max(...ys) - Math.min(...ys) + 480,
        },
        requiredHandler: 'Build directional parallel rail lanes in the reserved street corridor.',
      });
    }
    corrections = [...updated.values()];
  }
  for (const record of result.report.sharedRailConstraints.filter((r) =>
    r.flowClasses.includes('opposing-direction'),
  ))
    result.report.unresolved.push({
      kind: 'opposing-rail-corridor-unresolved',
      recordId: record.id,
      trackIds: record.trackIds,
      requiredHandler:
        'Author separated directional geometry; a head-on signal-only layout is not approved.',
      connectivityEffect: 'This rail resource needs authoring before adoption.',
    });
  return result;
}
