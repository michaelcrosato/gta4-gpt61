/** Reusable road topology, access modes, grade-separated crossings and shortest routes. */
const EPSILON = 1e-7;
const networks = new WeakMap();
const clamp = (value) => Math.max(0, Math.min(1, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (a, b) => a.x * b.y - a.y * b.x;
const finitePoint = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const heightAt = (segment, t) => {
  const a = Number.isFinite(segment.road.z1) ? segment.road.z1 : segment.road.z || 0;
  const b = Number.isFinite(segment.road.z2) ? segment.road.z2 : segment.road.z || 0;
  return a + (b - a) * t;
};

function project(segment, point) {
  const { start, vector } = segment;
  const t = clamp(
    ((point.x - start.x) * vector.x + (point.y - start.y) * vector.y) /
      (vector.x * vector.x + vector.y * vector.y),
  );
  const projected = { x: start.x + vector.x * t, y: start.y + vector.y * t };
  return { ...projected, t, distance: distance(point, projected), height: heightAt(segment, t) };
}
function roadSegments(world, mode) {
  if (!Array.isArray(world?.roads)) return [];
  return world.roads.flatMap((road, index) => {
    if (!road || ![road.x1, road.y1, road.x2, road.y2].every(Number.isFinite)) return [];
    if (Array.isArray(road.access) && !road.access.includes(mode)) return [];
    const start = { x: road.x1, y: road.y1 },
      end = { x: road.x2, y: road.y2 };
    if (distance(start, end) <= EPSILON) return [];
    return [{ road, index, start, end, vector: { x: end.x - start.x, y: end.y - start.y } }];
  });
}
function closestProjection(segments, point) {
  let nearest = null;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i],
      p = project(segment, point);
    const layerDistance = Math.abs(p.height - (Number.isFinite(point.z) ? point.z : 0));
    if (
      !nearest ||
      p.distance < nearest.distance - EPSILON ||
      (Math.abs(p.distance - nearest.distance) <= EPSILON &&
        layerDistance < nearest.layerDistance - EPSILON)
    )
      nearest = {
        ...p,
        roadId: segment.road.id ?? `road-${segment.index}`,
        roadIndex: segment.index,
        segmentIndex: i,
        layerDistance,
      };
  }
  return nearest;
}
function intersections(a, b) {
  const delta = { x: b.start.x - a.start.x, y: b.start.y - a.start.y },
    denominator = cross(a.vector, b.vector);
  let points;
  if (Math.abs(denominator) > EPSILON) {
    const t = cross(delta, b.vector) / denominator,
      u = cross(delta, a.vector) / denominator;
    if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) return [];
    points = [{ x: a.start.x + a.vector.x * clamp(t), y: a.start.y + a.vector.y * clamp(t) }];
  } else {
    if (Math.abs(cross(delta, a.vector)) > EPSILON) return [];
    points = [a.start, a.end, b.start, b.end].filter(
      (p) => project(a, p).distance <= EPSILON && project(b, p).distance <= EPSILON,
    );
  }
  return points.filter((p) => {
    const ap = project(a, p),
      bp = project(b, p);
    if (Math.abs(ap.height - bp.height) <= EPSILON) return true;
    const hasGrades =
      Number.isFinite(a.road.z1) ||
      Number.isFinite(a.road.z2) ||
      Number.isFinite(b.road.z1) ||
      Number.isFinite(b.road.z2);
    // Older scalar-height bridge data has implicit terminal ramps. Interior
    // grade-separated crossings never create a false road junction.
    const implicitRamp = [a.road, b.road].some(
      (road) => road.bridge || road.tunnel || ['bridge', 'tunnel'].includes(road.kind),
    );
    return (
      !hasGrades &&
      implicitRamp &&
      (ap.t < EPSILON || ap.t > 1 - EPSILON || bp.t < EPSILON || bp.t > 1 - EPSILON)
    );
  });
}

class MinHeap {
  constructor() {
    this.items = [];
  }
  before(a, b) {
    return a.cost < b.cost - EPSILON || (Math.abs(a.cost - b.cost) <= EPSILON && a.id < b.id);
  }
  push(item) {
    const values = this.items;
    let index = values.length;
    values.push(item);
    while (index) {
      const parent = (index - 1) >> 1;
      if (!this.before(item, values[parent])) break;
      values[index] = values[parent];
      index = parent;
    }
    values[index] = item;
  }
  pop() {
    const values = this.items,
      result = values[0],
      tail = values.pop();
    if (!values.length) return result;
    let index = 0;
    while (true) {
      let child = index * 2 + 1;
      if (child >= values.length) break;
      if (child + 1 < values.length && this.before(values[child + 1], values[child])) child++;
      if (!this.before(values[child], tail)) break;
      values[index] = values[child];
      index = child;
    }
    values[index] = tail;
    return result;
  }
  get size() {
    return this.items.length;
  }
}

function compile(world, mode) {
  const segments = roadSegments(world, mode),
    rawNodes = [],
    parents = [],
    splits = segments.map(() => new Map());
  const root = (id) => {
    while (parents[id] !== id) {
      parents[id] = parents[parents[id]];
      id = parents[id];
    }
    return id;
  };
  const union = (a, b) => {
    a = root(a);
    b = root(b);
    if (a !== b) parents[Math.max(a, b)] = Math.min(a, b);
  };
  const split = (index, point) => {
    const p = project(segments[index], point),
      key = Math.round(p.t / EPSILON);
    if (splits[index].has(key)) return splits[index].get(key).id;
    const id = rawNodes.length;
    rawNodes.push({ x: p.x, y: p.y, z: p.height });
    parents.push(id);
    splits[index].set(key, { id, t: p.t });
    return id;
  };
  segments.forEach((segment, index) => {
    split(index, segment.start);
    split(index, segment.end);
  });
  for (let i = 0; i < segments.length; i++)
    for (let j = i + 1; j < segments.length; j++)
      for (const point of intersections(segments[i], segments[j]))
        union(split(i, point), split(j, point));
  const nodes = [],
    canonical = new Map();
  const nodeId = (id) => {
    const key = root(id);
    if (!canonical.has(key)) {
      canonical.set(key, nodes.length);
      nodes.push({ ...rawNodes[key], edges: new Map() });
    }
    return canonical.get(key);
  };
  rawNodes.forEach((_, id) => nodeId(id));
  const segmentNodes = splits.map((division) =>
    [...division.values()].sort((a, b) => a.t - b.t).map((p) => ({ ...p, id: nodeId(p.id) })),
  );
  for (const list of segmentNodes)
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1].id,
        b = list[i].id;
      if (a === b) continue;
      const length = distance(nodes[a], nodes[b]);
      nodes[a].edges.set(b, Math.min(nodes[a].edges.get(b) ?? Infinity, length));
      nodes[b].edges.set(a, Math.min(nodes[b].edges.get(a) ?? Infinity, length));
    }
  const component = Array(nodes.length).fill(-1);
  let components = 0;
  for (let id = 0; id < nodes.length; id++)
    if (component[id] === -1) {
      const queue = [id];
      component[id] = components;
      for (let i = 0; i < queue.length; i++)
        for (const next of nodes[queue[i]].edges.keys())
          if (component[next] === -1) {
            component[next] = components;
            queue.push(next);
          }
      components++;
    }
  return {
    segments,
    nodes,
    segmentNodes,
    component,
    components,
    mode,
    roadArray: world.roads,
    roadCount: world.roads.length,
    revision: world.navigationRevision || 0,
  };
}

/** Static geometry is compiled once; invalidate after editing a road in place. */
export function createRoadNetwork(world, { mode = 'car' } = {}) {
  if (!world || typeof world !== 'object' || !Array.isArray(world.roads))
    return compile({ roads: [] }, mode);
  let modes = networks.get(world);
  if (!modes) {
    modes = new Map();
    networks.set(world, modes);
  }
  let network = modes.get(mode);
  if (
    !network ||
    network.roadArray !== world.roads ||
    network.roadCount !== world.roads.length ||
    network.revision !== (world.navigationRevision || 0)
  ) {
    network = compile(world, mode);
    modes.set(mode, network);
  }
  return network;
}
export function invalidateRoadNetwork(world) {
  if (world && typeof world === 'object') networks.delete(world);
}

/** Nearest accessible road projection. Off-road inputs never become road edges. */
export function snapToRoad(world, point, options = {}) {
  if (!finitePoint(point)) return null;
  const p = closestProjection(createRoadNetwork(world, options).segments, point);
  if (!p) return null;
  return {
    x: p.x,
    y: p.y,
    ...(options.includeZ ? { z: p.height } : {}),
    t: p.t,
    distance: p.distance,
    roadId: p.roadId,
    roadIndex: p.roadIndex,
  };
}

export function findRoute(world, start, end, options = {}) {
  if (!finitePoint(start) || !finitePoint(end)) return [];
  const network = createRoadNetwork(world, options),
    { segments, nodes, segmentNodes } = network;
  const from = closestProjection(segments, start),
    to = closestProjection(segments, end);
  if (!from || !to) return [];
  if (distance(from, to) <= EPSILON && Math.abs(from.height - to.height) <= EPSILON)
    return [{ x: from.x, y: from.y, ...(options.includeZ ? { z: from.height } : {}) }];
  const source = nodes.length,
    destination = source + 1,
    extra = new Map(),
    ends = [from, to];
  const connect = (a, b, cost) => {
    if (!extra.has(a)) extra.set(a, new Map());
    if (!extra.has(b)) extra.set(b, new Map());
    extra.get(a).set(b, Math.min(extra.get(a).get(b) ?? Infinity, cost));
    extra.get(b).set(a, Math.min(extra.get(b).get(a) ?? Infinity, cost));
  };
  const containing = ends.map((point) =>
    segments
      .map((segment, index) => ({ index, projection: project(segment, point) }))
      .filter(
        (item) =>
          item.projection.distance <= EPSILON &&
          Math.abs(item.projection.height - point.height) <= EPSILON,
      ),
  );
  containing.forEach((members, index) => {
    const virtual = index === 0 ? source : destination,
      point = ends[index];
    for (const member of members) {
      const list = segmentNodes[member.index];
      let before = list[0],
        after = list.at(-1);
      for (const split of list) {
        if (split.t <= member.projection.t + EPSILON) before = split;
        if (split.t >= member.projection.t - EPSILON) {
          after = split;
          break;
        }
      }
      connect(virtual, before.id, distance(point, nodes[before.id]));
      connect(virtual, after.id, distance(point, nodes[after.id]));
    }
  });
  if (containing[0].some((a) => containing[1].some((b) => a.index === b.index)))
    connect(source, destination, distance(from, to));
  const costs = Array(nodes.length + 2).fill(Infinity),
    previous = Array(nodes.length + 2).fill(-1),
    heap = new MinHeap();
  costs[source] = 0;
  heap.push({ id: source, cost: 0 });
  while (heap.size) {
    const current = heap.pop();
    if (current.cost > costs[current.id] + EPSILON) continue;
    if (current.id === destination) break;
    for (const edges of [nodes[current.id]?.edges, extra.get(current.id)])
      if (edges)
        for (const [next, length] of edges) {
          const cost = current.cost + length;
          if (cost < costs[next] - EPSILON) {
            costs[next] = cost;
            previous[next] = current.id;
            heap.push({ id: next, cost });
          }
        }
  }
  if (!Number.isFinite(costs[destination])) return [];
  const route = [];
  for (let id = destination; id !== -1; id = previous[id]) {
    const point = id === source ? from : id === destination ? to : nodes[id];
    route.push({
      x: point.x,
      y: point.y,
      ...(options.includeZ ? { z: point.height ?? point.z ?? 0 } : {}),
    });
    if (id === source) break;
  }
  return route.reverse();
}
