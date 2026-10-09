/** Bounded same-scene foot paths. Queries own geometry; callers own actual movement. */
const EPS = 1e-6;
const sceneOf = (p) =>
  p?.sceneId !== undefined ? p.sceneId : p?.scene?.kind === 'interior' ? p.scene.id : undefined;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const finitePoint = (p) => p && [p.x, p.y, p.z ?? 0].every(Number.isFinite);
const LIMIT = Symbol('local-navigation-budget');

class Frontier {
  items = [];
  push(item) {
    const a = this.items;
    let i = a.length;
    a.push(item);
    while (i) {
      const p = (i - 1) >> 1;
      if (this.before(a[p], item)) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = item;
  }
  before(a, b) {
    return a.f < b.f || (a.f === b.f && (a.h < b.h || (a.h === b.h && a.order < b.order)));
  }
  pop() {
    const a = this.items,
      first = a[0],
      last = a.pop();
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let c = i * 2 + 1;
        if (c + 1 < a.length && this.before(a[c + 1], a[c])) c++;
        if (this.before(last, a[c])) break;
        a[i] = a[c];
        i = c;
      }
      a[i] = last;
    }
    return first;
  }
}

/**
 * Return exact endpoint poses and checked intermediate poses, or [] when no path is proved.
 * Bounds describe the permitted whole-body area, as {x,y,w,h} or {left,top,right,bottom}.
 * Optional segmentBlocked(a,b,radius) supplies an analytic swept-solid check. Without it,
 * inflated midpoint disks conservatively cover each entire XY segment, refining near edges.
 * This is a local grid search, not a completeness guarantee for sub-cell corridors.
 */
export function findLocalFootPath(geometry, start, target, options = {}) {
  const {
    bounds,
    radius = 7,
    cellSize = 8,
    maxNodes = 4096,
    maxChecks = 60000,
    sampleStep = 2,
    minSampleStep = 0.125,
    maxStepHeight = 6,
    layerTolerance = 0.05,
    maxWaypoints = 1024,
    stats,
  } = options;
  if (
    !geometry ||
    typeof geometry.isBlocked !== 'function' ||
    typeof geometry.surfaceHeight !== 'function'
  )
    throw new TypeError('Local navigation requires collision and floor queries.');
  if (!finitePoint(start) || !finitePoint(target))
    throw new TypeError('Invalid local path endpoints.');
  const area = bounds && {
    left: bounds.left ?? bounds.x,
    top: bounds.top ?? bounds.y,
    right: bounds.right ?? bounds.x + bounds.w,
    bottom: bounds.bottom ?? bounds.y + bounds.h,
  };
  if (
    !area ||
    !Object.values(area).every(Number.isFinite) ||
    area.right <= area.left ||
    area.bottom <= area.top
  )
    throw new TypeError('Local navigation requires finite bounds.');
  if (
    ![radius, cellSize, sampleStep, minSampleStep, maxStepHeight].every(
      (v) => Number.isFinite(v) && v > 0,
    ) ||
    !Number.isFinite(layerTolerance) ||
    layerTolerance < 0 ||
    minSampleStep > sampleStep ||
    ![maxNodes, maxChecks, maxWaypoints].every((v) => Number.isSafeInteger(v) && v > 0)
  )
    throw new TypeError('Invalid local navigation limits.');
  const counts = { checks: 0, nodes: 0, expanded: 0, maxFrontier: 0, reason: 'unreachable' };
  const finish = (path, reason) => {
    counts.reason = reason;
    if (stats) Object.assign(stats, counts);
    return path;
  };
  const startScene = sceneOf(start),
    targetScene = sceneOf(target);
  if (startScene !== undefined && targetScene !== undefined && startScene !== targetScene)
    return finish([], 'scene-mismatch');
  const sceneId = startScene ?? targetScene ?? null;
  const pose = (p) => ({ x: p.x, y: p.y, z: p.z ?? 0, sceneId });
  const from = pose(start),
    to = pose(target);
  const within = (p, pad = radius) =>
    p.x - pad >= area.left - EPS &&
    p.x + pad <= area.right + EPS &&
    p.y - pad >= area.top - EPS &&
    p.y + pad <= area.bottom + EPS;
  const spend = () => {
    if (counts.checks >= maxChecks) throw LIMIT;
    counts.checks++;
  };
  const height = (x, y, z) => {
    spend();
    return geometry.surfaceHeight(x, y, z, { mode: 'foot' });
  };
  const blocked = (p, r = radius) => {
    if (!within(p, r)) return true;
    spend();
    return geometry.isBlocked(p.x, p.y, r, p.z) !== false;
  };
  const validHeight = (z, previous) =>
    Number.isFinite(z) && Math.abs(z - previous) <= maxStepHeight + EPS;
  function endpoint(p) {
    if (!within(p) || blocked(p)) return false;
    const floor = height(p.x, p.y, p.z);
    return Number.isFinite(floor) && Math.abs(floor - p.z) <= layerTolerance + EPS;
  }
  function span(a, b) {
    const length = distance(a, b),
      mid = {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        z: height((a.x + b.x) / 2, (a.y + b.y) / 2, a.z),
        sceneId,
      };
    if (!validHeight(mid.z, a.z) || !validHeight(b.z, mid.z) || blocked(mid)) return false;
    const endFloor = height(b.x, b.y, mid.z);
    if (!Number.isFinite(endFloor) || Math.abs(endFloor - b.z) > layerTolerance + EPS) return false;
    if (geometry.segmentBlocked) {
      spend();
      const hit = geometry.segmentBlocked(a, b, radius);
      if (typeof hit !== 'boolean') throw new TypeError('segmentBlocked must return a boolean.');
      return !hit;
    }
    if (!blocked(mid, radius + length / 2)) return true;
    if (length <= minSampleStep + EPS) return false;
    return span(a, mid) && span(mid, b);
  }
  function trace(a, b) {
    const length = distance(a, b);
    if (length < EPS) return Math.abs(a.z - b.z) <= layerTolerance ? [a] : null;
    const n = Math.max(1, Math.ceil(length / Math.min(sampleStep, radius / 2))),
      points = [a];
    let previous = a;
    for (let i = 1; i <= n; i++) {
      const t = i / n,
        p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: 0, sceneId };
      p.z = height(p.x, p.y, previous.z);
      if (!validHeight(p.z, previous.z) || blocked(p) || !span(previous, p)) return null;
      points.push(p);
      previous = p;
    }
    if (Math.abs(previous.z - b.z) > layerTolerance + EPS) return null;
    points[points.length - 1] = b;
    return points;
  }
  const edge = (a, b) => {
    const path = trace(a, b);
    return path && trace(b, a) ? path : null;
  };
  function compact(path) {
    const result = [];
    for (const p of path) {
      if (result.length >= 2) {
        const a = result.at(-2),
          b = result.at(-1),
          ab = distance(a, b),
          bp = distance(b, p),
          ap = distance(a, p);
        const linear = ap > EPS ? Math.abs(b.z - (a.z + ((p.z - a.z) * ab) / ap)) <= EPS : true;
        if (Math.abs(ab + bp - ap) <= EPS && linear) result.pop();
      }
      result.push(p);
    }
    return result;
  }
  try {
    if (!endpoint(from) || !endpoint(to)) return finish([], 'blocked-endpoint');
    const direct = edge(from, to);
    if (direct) {
      const path = compact(direct);
      return path.length <= maxWaypoints ? finish(path, 'found') : finish([], 'waypoint-limit');
    }
    if (distance(from, to) < EPS) return finish([], 'inaccessible-layer');
    const frontier = new Frontier(),
      seen = new Map();
    let order = 0;
    const heuristic = (p) => Math.hypot(p.x - to.x, p.y - to.y, p.z - to.z);
    const key = (gx, gy, z) => `${gx},${gy},${Math.round(z * 10000)}`;
    const first = {
      p: from,
      gx: 0,
      gy: 0,
      g: 0,
      h: heuristic(from),
      parent: null,
      edge: null,
      order: order++,
    };
    first.f = first.h;
    first.key = key(0, 0, from.z);
    seen.set(first.key, first);
    frontier.push(first);
    counts.nodes = 1;
    while (frontier.items.length) {
      counts.maxFrontier = Math.max(counts.maxFrontier, frontier.items.length);
      const current = frontier.pop();
      if (seen.get(current.key) !== current || current.closed) continue;
      current.closed = true;
      counts.expanded++;
      if (distance(current.p, to) <= cellSize * Math.SQRT2 + EPS) {
        const last = edge(current.p, to);
        if (last) {
          const parts = [last];
          let node = current;
          while (node.parent) {
            parts.push(node.edge);
            node = node.parent;
          }
          const path = compact(parts.reverse().flatMap((part, i) => (i ? part.slice(1) : part)));
          return path.length <= maxWaypoints ? finish(path, 'found') : finish([], 'waypoint-limit');
        }
      }
      // Four-neighbour expansion prevents diagonal movement through blocked corner cells.
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]) {
        const gx = current.gx + dx,
          gy = current.gy + dy,
          p = { x: from.x + gx * cellSize, y: from.y + gy * cellSize, z: 0, sceneId };
        if (!within(p)) continue;
        p.z = height(p.x, p.y, current.p.z);
        if (!validHeight(p.z, current.p.z) || blocked(p)) continue;
        const id = key(gx, gy, p.z),
          g = current.g + Math.hypot(p.x - current.p.x, p.y - current.p.y, p.z - current.p.z),
          old = seen.get(id);
        if (old && old.g <= g + EPS) continue;
        const path = edge(current.p, p);
        if (!path) continue;
        if (!old && counts.nodes >= maxNodes) return finish([], 'node-limit');
        const node = {
          p,
          gx,
          gy,
          g,
          h: heuristic(p),
          parent: current,
          edge: path,
          order: order++,
          key: id,
        };
        node.f = g + node.h;
        seen.set(id, node);
        frontier.push(node);
        if (!old) counts.nodes++;
        if (frontier.items.length > maxNodes * 4) return finish([], 'frontier-limit');
      }
    }
    return finish([], 'unreachable');
  } catch (error) {
    if (error === LIMIT) return finish([], 'query-limit');
    throw error;
  }
}
