/** Renderer-independent navigation along the city's actual road center lines. */
const EPSILON = 1e-8;
const clamp = (value) => Math.max(0, Math.min(1, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (a, b) => a.x * b.y - a.y * b.x;
const finitePoint = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y);

function roadSegments(world) {
  if (!Array.isArray(world?.roads)) return [];
  return world.roads.flatMap((road, index) => {
    if (!road || ![road.x1, road.y1, road.x2, road.y2].every(Number.isFinite)) return [];
    const start = { x: road.x1, y: road.y1 };
    const end = { x: road.x2, y: road.y2 };
    if (distance(start, end) <= EPSILON) return [];
    return [{ road, index, start, end, vector: { x: end.x - start.x, y: end.y - start.y } }];
  });
}

function project(segment, point) {
  const { start, vector } = segment;
  const lengthSquared = vector.x * vector.x + vector.y * vector.y;
  const t = clamp(
    ((point.x - start.x) * vector.x + (point.y - start.y) * vector.y) / lengthSquared,
  );
  const projected = { x: start.x + vector.x * t, y: start.y + vector.y * t };
  return { ...projected, t, distance: distance(point, projected) };
}

function closestProjection(segments, point) {
  let nearest = null;
  for (const segment of segments) {
    const projected = project(segment, point);
    // Stable ordering makes intersection and equidistant-road choices reproducible.
    if (!nearest || projected.distance < nearest.distance - EPSILON) {
      nearest = {
        ...projected,
        roadId: segment.road.id ?? `road-${segment.index}`,
        roadIndex: segment.index,
      };
    }
  }
  return nearest;
}

/** Project a marker onto its nearest valid road segment; never mutate the marker. */
export function snapToRoad(world, point) {
  return finitePoint(point) ? closestProjection(roadSegments(world), point) : null;
}

function intersections(a, b) {
  const delta = { x: b.start.x - a.start.x, y: b.start.y - a.start.y };
  const denominator = cross(a.vector, b.vector);
  if (Math.abs(denominator) > EPSILON) {
    const t = cross(delta, b.vector) / denominator;
    const u = cross(delta, a.vector) / denominator;
    if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) return [];
    return [{ x: a.start.x + a.vector.x * clamp(t), y: a.start.y + a.vector.y * clamp(t) }];
  }
  if (Math.abs(cross(delta, a.vector)) > EPSILON) return [];
  // Overlapping collinear roads share all contained endpoints, not just one arbitrary crossing.
  return [a.start, a.end, b.start, b.end].filter(
    (point) => project(a, point).distance <= EPSILON && project(b, point).distance <= EPSILON,
  );
}

/**
 * Return the shortest legal road route, including exact start/end projections.
 * Road crossings connect at intersections. Off-road connectors are deliberately
 * absent: the caller can label the small remaining walk to a building separately.
 * An empty route means the projected endpoints are on disconnected networks.
 */
export function findRoute(world, start, end) {
  if (!finitePoint(start) || !finitePoint(end)) return [];
  const segments = roadSegments(world);
  const from = closestProjection(segments, start);
  const to = closestProjection(segments, end);
  if (!from || !to) return [];
  if (distance(from, to) <= EPSILON) return [{ x: from.x, y: from.y }];

  const nodes = [];
  const coordinates = new Map();
  const splits = segments.map(() => new Map());
  const addNode = (point) => {
    const key = `${Math.round(point.x / EPSILON)},${Math.round(point.y / EPSILON)}`;
    if (coordinates.has(key)) return coordinates.get(key);
    const id = nodes.length;
    nodes.push({ x: point.x, y: point.y, edges: new Map() });
    coordinates.set(key, id);
    return id;
  };
  const split = (segmentIndex, point) => {
    const id = addNode(point);
    splits[segmentIndex].set(id, project(segments[segmentIndex], point).t);
    return id;
  };

  segments.forEach((segment, index) => {
    split(index, segment.start);
    split(index, segment.end);
  });
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      for (const point of intersections(segments[i], segments[j])) {
        split(i, point);
        split(j, point);
      }
    }
  }
  // A projection at an intersection/overlap belongs to every road passing through it.
  let source = null,
    destination = null;
  segments.forEach((segment, index) => {
    if (project(segment, from).distance <= EPSILON) source = split(index, from);
    if (project(segment, to).distance <= EPSILON) destination = split(index, to);
  });
  if (source === null || destination === null) return [];
  for (const division of splits) {
    const ordered = [...division].sort((a, b) => a[1] - b[1]);
    for (let i = 1; i < ordered.length; i += 1) {
      const a = ordered[i - 1][0],
        b = ordered[i][0];
      if (a === b) continue;
      const length = distance(nodes[a], nodes[b]);
      nodes[a].edges.set(b, Math.min(nodes[a].edges.get(b) ?? Infinity, length));
      nodes[b].edges.set(a, Math.min(nodes[b].edges.get(a) ?? Infinity, length));
    }
  }

  const costs = Array(nodes.length).fill(Infinity);
  const previous = Array(nodes.length).fill(-1);
  const visited = new Set();
  costs[source] = 0;
  // The authored city has a small network; a stable linear minimum avoids heap dependencies.
  while (visited.size < nodes.length) {
    let current = -1;
    for (let i = 0; i < nodes.length; i += 1) {
      if (!visited.has(i) && (current === -1 || costs[i] < costs[current] - EPSILON)) current = i;
    }
    if (current === -1 || !Number.isFinite(costs[current])) break;
    if (current === destination) break;
    visited.add(current);
    for (const [neighbor, length] of nodes[current].edges) {
      const candidateCost = costs[current] + length;
      if (candidateCost < costs[neighbor] - EPSILON) {
        costs[neighbor] = candidateCost;
        previous[neighbor] = current;
      }
    }
  }
  if (!Number.isFinite(costs[destination])) return [];
  const route = [];
  for (let current = destination; current !== -1; current = previous[current]) {
    route.push({ x: nodes[current].x, y: nodes[current].y });
    if (current === source) break;
  }
  route.reverse();
  route[0] = { x: from.x, y: from.y };
  route[route.length - 1] = { x: to.x, y: to.y };
  return route;
}
