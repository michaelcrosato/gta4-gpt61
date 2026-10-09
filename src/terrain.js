import { createSpatialIndex } from './spatial-index.js';
import { createRailTerrain, railSpaceInterval, railIntervalsCover } from './rail-terrain.js';

const EPSILON = 1e-9;
const STEP_HEIGHT = 6;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const cross = (ax, ay, bx, by) => ax * by - ay * bx;

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new TypeError(`Invalid terrain ${label}: expected a finite number.`);
  return value;
}
function point(x, y, radius = 0) {
  finite(x, 'x');
  finite(y, 'y');
  finite(radius, 'radius');
  if (radius < 0) throw new RangeError('Invalid terrain radius: must be nonnegative.');
}
function rect(value) {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid terrain rectangle.');
  const { x, y, w, h } = value;
  point(x, y);
  finite(w, 'width');
  finite(h, 'height');
  if (w < 0 || h < 0 || !Number.isFinite(x + w) || !Number.isFinite(y + h))
    throw new RangeError('Invalid terrain rectangle extent.');
  return { x, y, w, h };
}
function contains(x, y, box) {
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}
function circleRect(x, y, radius, box, inclusive = false) {
  if (!radius) return contains(x, y, box);
  const dx = x - clamp(x, box.x, box.x + box.w),
    dy = y - clamp(y, box.y, box.y + box.h);
  return inclusive ? dx * dx + dy * dy <= radius * radius : dx * dx + dy * dy < radius * radius;
}
function segmentProjection(x, y, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? clamp(((x - a.x) * dx + (y - a.y) * dy) / lengthSquared, 0, 1) : 0;
  const px = a.x + t * dx,
    py = a.y + t * dy;
  return { t, distance: Math.hypot(x - px, y - py) };
}
function polygonContains(x, y, polygon, boundary = true) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j],
      b = polygon[i];
    if (segmentProjection(x, y, a, b).distance <= EPSILON) return boundary;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function polygonRecord(item) {
  if (!Array.isArray(item.polygon) || item.polygon.length < 3 || item.polygon.length > 4096)
    throw new TypeError('Invalid terrain landform polygon.');
  const polygon = item.polygon.map((p) => {
    const x = Array.isArray(p) ? p[0] : p?.x,
      y = Array.isArray(p) ? p[1] : p?.y;
    point(x, y);
    return { x, y };
  });
  let twiceArea = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    twiceArea += cross(a.x, a.y, b.x, b.y);
  }
  if (!Number.isFinite(twiceArea) || Math.abs(twiceArea) <= EPSILON)
    throw new RangeError('Invalid terrain landform area.');
  const xs = polygon.map((p) => p.x),
    ys = polygon.map((p) => p.y);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return {
    item,
    polygon,
    orientation: Math.sign(twiceArea),
    bounds: rect({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }),
  };
}
function coversOutside(form, x, y, outwardX, outwardY) {
  if (polygonContains(x, y, form.polygon, false)) return true;
  // Adjacent landforms can share an edge. Its orientation determines whether
  // the other polygon covers the outside, without sampling an epsilon offset.
  for (let i = 0; i < form.polygon.length; i++) {
    const a = form.polygon[i],
      b = form.polygon[(i + 1) % form.polygon.length];
    if (
      segmentProjection(x, y, a, b).distance <= EPSILON &&
      cross(b.x - a.x, b.y - a.y, outwardX, outwardY) * form.orientation > EPSILON
    )
      return true;
  }
  return false;
}
function segmentCuts(a, b, c, d) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    ex = d.x - c.x,
    ey = d.y - c.y;
  const denominator = cross(dx, dy, ex, ey);
  if (Math.abs(denominator) <= EPSILON) {
    if (Math.abs(cross(c.x - a.x, c.y - a.y, dx, dy)) > EPSILON) return [];
    const lengthSquared = dx * dx + dy * dy;
    return lengthSquared
      ? [
          ((c.x - a.x) * dx + (c.y - a.y) * dy) / lengthSquared,
          ((d.x - a.x) * dx + (d.y - a.y) * dy) / lengthSquared,
        ].filter((t) => t > 0 && t < 1)
      : [];
  }
  const t = cross(c.x - a.x, c.y - a.y, ex, ey) / denominator;
  const u = cross(c.x - a.x, c.y - a.y, dx, dy) / denominator;
  return t > 0 && t < 1 && u >= 0 && u <= 1 ? [t] : [];
}
function diskEdgeInterval(x, y, radius, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    ox = a.x - x,
    oy = a.y - y;
  const quadratic = dx * dx + dy * dy;
  if (!quadratic) return null;
  const linear = 2 * (ox * dx + oy * dy),
    constant = ox * ox + oy * oy - radius * radius;
  const discriminant = linear * linear - 4 * quadratic * constant;
  if (discriminant <= 0) return null;
  const root = Math.sqrt(discriminant);
  const start = Math.max(0, (-linear - root) / (2 * quadratic));
  const end = Math.min(1, (-linear + root) / (2 * quadratic));
  return start < end ? [start, end] : null;
}
function segmentHitsVolume(a, b, box, height) {
  if (height <= 0 || (a.z >= height && b.z >= height) || (a.z < 0 && b.z < 0)) return false;
  let enter = 0,
    leave = 1;
  for (const [axis, low, high] of [
    ['x', box.x, box.x + box.w],
    ['y', box.y, box.y + box.h],
    ['z', 0, height],
  ]) {
    const delta = b[axis] - a[axis];
    if (!delta) {
      if (a[axis] < low || a[axis] > high) return false;
      continue;
    }
    let t0 = (low - a[axis]) / delta,
      t1 = (high - a[axis]) / delta;
    if (t0 > t1) [t0, t1] = [t1, t0];
    enter = Math.max(enter, t0);
    leave = Math.min(leave, t1);
    if (enter > leave) return false;
  }
  const z = a.z + ((b.z - a.z) * (enter + leave)) / 2;
  return z >= 0 && z < height;
}
function list(world, key) {
  const items = world[key] ?? [];
  if (!Array.isArray(items)) throw new TypeError(`Invalid terrain ${key}: expected an array.`);
  return items;
}
const indexRecords = (items) => createSpatialIndex(items, { getBounds: (item) => item.bounds });

/**
 * Snapshot static world geometry once; query methods never rescan the world arrays.
 * Landform worlds use exact coasts/lakes plus explicit water rectangles. Broad
 * water-volume envelopes cannot flood land inside an authored landform. Legacy
 * rectangle-only worlds retain their previous dry movement collision behavior.
 * Road z1/z2 grade endpoints or rampStart/rampEnd lengths connect elevations to
 * z0 (optional startZ/endZ). Scalar elevated roads infer ramps at dry terminal
 * endpoints; explicit profiles override inference. previousHeight selects the
 * connected layer, so a ground underpass never snaps to a flat elevated deck.
 */
export function createTerrain(world) {
  if (!world || typeof world !== 'object') throw new TypeError('Invalid terrain world.');
  const bounds = world.bounds ?? { left: 0, top: 0, right: world.width, bottom: world.height };
  const worldBox = rect({
    x: bounds.left,
    y: bounds.top,
    w: bounds.right - bounds.left,
    h: bounds.bottom - bounds.top,
  });
  const buildings = list(world, 'buildings').map((item) => ({
    item,
    bounds: rect(item),
    height: finite(item.height || 40, 'building height'),
  }));
  const obstacles = list(world, 'obstacles').map((item) => ({
    item,
    bounds: rect(item),
    height: finite(item.height, 'obstacle height'),
  }));
  if ([...buildings, ...obstacles].some((item) => item.height < 0))
    throw new RangeError('Invalid terrain obstacle height.');
  const buildingIndex = indexRecords(buildings),
    blockerIndex = indexRecords([...buildings, ...obstacles]);
  const forms = list(world, 'landforms').map(polygonRecord),
    formIndex = indexRecords(forms);
  const lakes = list(world, 'lakes').map((item) => ({ item, bounds: rect(item.bounds ?? item) }));
  const water = list(world, 'water').map((item) => ({ item, bounds: rect(item.bounds ?? item) }));
  const volumes = list(world, 'waterVolumes').map((item) => ({
    item,
    bounds: rect(item.bounds ?? item),
  }));
  const lakeIndex = indexRecords(lakes),
    waterIndex = indexRecords(water),
    volumeIndex = indexRecords(volumes);
  const areas = list(world, world.neighbourhoods ? 'neighbourhoods' : 'districts').map((item) => ({
    item,
    bounds: rect(item.bounds ?? item),
  }));
  const areaIndex = indexRecords(areas);

  function landAt(x, y) {
    return formIndex.queryRadius(x, y, 0).some((form) => polygonContains(x, y, form.polygon));
  }
  function rawWater(x, y) {
    if (lakeIndex.queryRadius(x, y, 0).some((record) => contains(x, y, record.bounds))) return true;
    if (waterIndex.queryRadius(x, y, 0).some((record) => contains(x, y, record.bounds)))
      return true;
    if (forms.length) return !landAt(x, y);
    return volumeIndex.queryRadius(x, y, 0).some((record) => contains(x, y, record.bounds));
  }

  const roads = list(world, 'roads').map((item) => {
    const a = { x: finite(item.x1, 'road x1'), y: finite(item.y1, 'road y1') };
    const b = { x: finite(item.x2, 'road x2'), y: finite(item.y2, 'road y2') };
    const width = finite(item.width, 'road width'),
      z = finite(item.z ?? 0, 'road z');
    if (width <= 0) throw new RangeError('Invalid terrain road width.');
    const access = item.access ?? ['foot', 'car'];
    if (!Array.isArray(access) || access.some((mode) => typeof mode !== 'string'))
      throw new TypeError('Invalid terrain road access.');
    const elevated =
      !!item.bridge || !!item.tunnel || z !== 0 || (item.z1 ?? 0) !== 0 || (item.z2 ?? 0) !== 0;
    return {
      item,
      a,
      b,
      width,
      z,
      length: Math.hypot(b.x - a.x, b.y - a.y),
      access: [...access],
      elevated,
      bounds: rect({
        x: Math.min(a.x, b.x) - width / 2,
        y: Math.min(a.y, b.y) - width / 2,
        w: Math.abs(b.x - a.x) + width,
        h: Math.abs(b.y - a.y) + width,
      }),
    };
  });
  const nodeKey = (p, z) => `${p.x},${p.y},${z}`;
  const degrees = new Map();
  for (const road of roads.filter((road) => road.elevated))
    for (const p of [road.a, road.b]) {
      const key = nodeKey(p, road.z);
      degrees.set(key, (degrees.get(key) ?? 0) + 1);
    }
  for (const road of roads) {
    const item = road.item;
    if (item.z1 !== undefined || item.z2 !== undefined) {
      road.z1 = finite(item.z1 ?? road.z, 'road z1');
      road.z2 = finite(item.z2 ?? road.z, 'road z2');
      finite(road.z2 - road.z1, 'road grade extent');
    } else {
      const inferred = Math.min(160, road.length / 3);
      road.rampStart = finite(
        item.rampStart ??
          (road.elevated &&
          degrees.get(nodeKey(road.a, road.z)) === 1 &&
          !rawWater(road.a.x, road.a.y)
            ? inferred
            : 0),
        'ramp start',
      );
      road.rampEnd = finite(
        item.rampEnd ??
          (road.elevated &&
          degrees.get(nodeKey(road.b, road.z)) === 1 &&
          !rawWater(road.b.x, road.b.y)
            ? inferred
            : 0),
        'ramp end',
      );
      road.startZ = finite(item.startZ ?? 0, 'ramp start height');
      road.endZ = finite(item.endZ ?? 0, 'ramp end height');
      if (
        road.rampStart < 0 ||
        road.rampEnd < 0 ||
        road.rampStart + road.rampEnd > road.length + EPSILON
      )
        throw new RangeError('Invalid terrain road ramp lengths.');
    }
  }
  const roadIndex = indexRecords(roads.filter((road) => road.elevated));
  const tunnelIndex = indexRecords(
    roads.filter((road) => road.item.tunnel || Math.min(road.z1 ?? road.z, road.z2 ?? road.z) < 0),
  );
  const railTerrain = createRailTerrain(world);
  const legacyTunnelSpaces = roads
    .filter((road) => road.item.tunnel || Math.min(road.z1 ?? road.z, road.z2 ?? road.z) < 0)
    .flatMap((road) => {
      const positions = [0, road.length];
      if (road.z1 === undefined) {
        if (road.rampStart) positions.push(road.rampStart);
        if (road.rampEnd) positions.push(road.length - road.rampEnd);
      }
      positions.sort((a, b) => a - b);
      const at = (d) => ({
        x: road.a.x + ((road.b.x - road.a.x) * d) / road.length,
        y: road.a.y + ((road.b.y - road.a.y) * d) / road.length,
      });
      const initial = [...new Set(positions)],
        cuts = [...initial];
      for (let i = 1; i < initial.length; i++) {
        const lo = initial[i - 1],
          hi = initial[i],
          a = at(lo),
          b = at(hi),
          A = roadSurface(road, a.x, a.y).height,
          B = roadSurface(road, b.x, b.y).height;
        for (const h of [-20, -8])
          if (h > Math.min(A, B) + EPSILON && h < Math.max(A, B) - EPSILON)
            cuts.push(lo + ((hi - lo) * (h - A)) / (B - A));
      }
      cuts.sort((a, b) => a - b);
      return cuts.slice(1).flatMap((end, i) => {
        const start = cuts[i];
        if (end - start <= EPSILON) return [];
        const a = at(start),
          b = at(end),
          A = roadSurface(road, a.x, a.y).height,
          B = roadSurface(road, b.x, b.y).height,
          mid = (A + B) / 2,
          L = Math.hypot(b.x - a.x, b.y - a.y),
          nx = ((-(b.y - a.y) / L) * road.width) / 2,
          ny = (((b.x - a.x) / L) * road.width) / 2;
        const polygon = [
          { x: a.x - nx, y: a.y - ny },
          { x: b.x - nx, y: b.y - ny },
          { x: b.x + nx, y: b.y + ny },
          { x: a.x + nx, y: a.y + ny },
        ];
        const floorStart = { ...a, z: A },
          floorEnd = { ...b, z: B },
          roofStart = { ...a, z: mid >= -8 || mid < -20 ? A + 18 : -2 },
          roofEnd = { ...b, z: mid >= -8 || mid < -20 ? B + 18 : -2 };
        const xs = polygon.map((p) => p.x),
          ys = polygon.map((p) => p.y),
          x = Math.min(...xs),
          y = Math.min(...ys);
        return [
          {
            polygon,
            floorStart,
            floorEnd,
            roofStart,
            roofEnd,
            referenceFloorMin: Math.min(A, B),
            zMax: Math.max(roofStart.z, roofEnd.z),
            bounds: { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y },
          },
        ];
      });
    });
  const legacyTunnelSpaceIndex = indexRecords(legacyTunnelSpaces);
  const earthEnabled =
    (Array.isArray(world.tunnels) && world.tunnels.length > 0) ||
    !!world.transit?.railClearanceVolumes?.length;
  function tunnelSpace(x, y, z, radius = 0) {
    return (
      tunnelIndex.queryRadius(x, y, radius).some((road) => {
        const surface = roadSurface(road, x, y);
        if (!surface || segmentProjection(x, y, road.a, road.b).distance + radius > road.width / 2)
          return false;
        const ceiling =
          surface.height < -8 ? Math.min(-2, surface.height + 18) : surface.height + 18;
        return z >= surface.height - 0.5 && z <= ceiling;
      }) || railTerrain.space(x, y, z, radius, legacyTunnelSpaceIndex.queryRadius(x, y, radius))
    );
  }
  const roadIds = new Set(roads.map((road) => road.item.id));
  const separateDecks = list(world, 'decks')
    .filter((deck) => !roadIds.has(deck.roadId))
    .map((item) => {
      const access = item.access ?? ['foot', 'car'];
      if (!Array.isArray(access) || access.some((mode) => typeof mode !== 'string'))
        throw new TypeError('Invalid terrain deck access.');
      return {
        item,
        bounds: rect(item.bounds ?? item),
        z: finite(item.z ?? 0, 'deck z'),
        access: [...access],
      };
    });
  const deckIndex = indexRecords(separateDecks);

  function roadSurface(road, x, y) {
    const along =
      ((x - road.a.x) * (road.b.x - road.a.x) + (y - road.a.y) * (road.b.y - road.a.y)) /
      (road.length * road.length);
    if (along < -EPSILON || along > 1 + EPSILON) return null;
    const projection = segmentProjection(x, y, road.a, road.b);
    if (projection.distance > road.width / 2) return null;
    const distance = projection.t * road.length;
    if (road.z1 !== undefined)
      return { height: road.z1 + (road.z2 - road.z1) * projection.t, ramp: road.z1 !== road.z2 };
    if (road.rampStart && distance < road.rampStart)
      return {
        height: road.startZ + ((road.z - road.startZ) * distance) / road.rampStart,
        ramp: true,
      };
    if (road.rampEnd && distance > road.length - road.rampEnd)
      return {
        height: road.endZ + ((road.z - road.endZ) * (road.length - distance)) / road.rampEnd,
        ramp: true,
      };
    return { height: road.z, ramp: false };
  }
  function surfaces(x, y, radius = 0) {
    const result = railTerrain.surfaces(x, y, radius);
    for (const road of roadIndex.queryRadius(x, y, radius)) {
      const surface = roadSurface(road, x, y);
      if (surface && segmentProjection(x, y, road.a, road.b).distance + radius <= road.width / 2)
        result.push({ ...surface, access: road.access });
    }
    for (const deck of deckIndex.queryRadius(x, y, radius)) {
      if (
        x - radius >= deck.bounds.x &&
        x + radius <= deck.bounds.x + deck.bounds.w &&
        y - radius >= deck.bounds.y &&
        y + radius <= deck.bounds.y + deck.bounds.h
      )
        result.push({ height: deck.z, ramp: false, access: deck.access });
    }
    return result;
  }
  function circleMeetsWater(x, y, radius) {
    if (!radius) return rawWater(x, y);
    if (
      lakeIndex.queryRadius(x, y, radius).some((record) => circleRect(x, y, radius, record.bounds))
    )
      return true;
    if (
      waterIndex.queryRadius(x, y, radius).some((record) => circleRect(x, y, radius, record.bounds))
    )
      return true;
    if (!forms.length)
      return volumeIndex
        .queryRadius(x, y, radius)
        .some((record) => circleRect(x, y, radius, record.bounds));
    if (!landAt(x, y)) return true;
    const nearby = formIndex.queryRadius(x, y, radius);
    for (const form of nearby)
      for (let i = 0; i < form.polygon.length; i++) {
        const a = form.polygon[i],
          b = form.polygon[(i + 1) % form.polygon.length];
        const interval = diskEdgeInterval(x, y, radius, a, b);
        if (!interval) continue;
        const cuts = [...interval];
        for (const other of nearby)
          if (other !== form)
            for (let j = 0; j < other.polygon.length; j++)
              cuts.push(
                ...segmentCuts(
                  a,
                  b,
                  other.polygon[j],
                  other.polygon[(j + 1) % other.polygon.length],
                ).filter((t) => t > interval[0] && t < interval[1]),
              );
        cuts.sort((u, v) => u - v);
        for (let j = 1; j < cuts.length; j++) {
          if (cuts[j] - cuts[j - 1] <= EPSILON) continue;
          const t = (cuts[j] + cuts[j - 1]) / 2,
            px = a.x + (b.x - a.x) * t,
            py = a.y + (b.y - a.y) * t;
          const outwardX = (b.y - a.y) * form.orientation,
            outwardY = (a.x - b.x) * form.orientation;
          if (
            !nearby.some(
              (other) => other !== form && coversOutside(other, px, py, outwardX, outwardY),
            )
          )
            return true;
        }
      }
    return false;
  }

  return {
    isBlocked(x, y, radius = 7, z = 0, { ignoreWater = false } = {}) {
      point(x, y, radius);
      finite(z, 'z');
      if (
        x - radius < worldBox.x ||
        x + radius > worldBox.x + worldBox.w ||
        y - radius < worldBox.y ||
        y + radius > worldBox.y + worldBox.h
      )
        return true;
      if (earthEnabled && z < 0 && !tunnelSpace(x, y, z, radius)) return true;
      if (
        blockerIndex
          .queryRadius(x, y, radius)
          .some((record) => z >= 0 && z < record.height && circleRect(x, y, radius, record.bounds))
      )
        return true;
      if (
        !ignoreWater &&
        forms.length &&
        Math.abs(z) <= EPSILON &&
        circleMeetsWater(x, y, radius)
      ) {
        const supported = surfaces(x, y, radius).some(
          (surface) =>
            surface.access.some((mode) => mode === 'foot' || mode === 'car') &&
            Math.abs(surface.height - z) <= EPSILON,
        );
        if (!supported) return true;
      }
      return false;
    },
    hasLineOfSight(a, b) {
      const eye = (body) => {
        if (!body || typeof body !== 'object')
          throw new TypeError('Invalid terrain sight endpoint.');
        point(body.x, body.y);
        return {
          x: body.x,
          y: body.y,
          z: finite(body.z ?? 0, 'sight z') + (body.health !== undefined ? 14 : 0),
        };
      };
      const start = eye(a),
        end = eye(b);
      if (!contains(start.x, start.y, worldBox) || !contains(end.x, end.y, worldBox)) return false;
      if (earthEnabled && (start.z < 0 || end.z < 0)) {
        if (start.z < 0 !== end.z < 0) {
          const t = -start.z / (end.z - start.z),
            x = start.x + (end.x - start.x) * t,
            y = start.y + (end.y - start.y) * t;
          const openPortal =
            railTerrain.openPortal(x, y) ||
            tunnelIndex.queryRadius(x, y, 0).some((road) => {
              const surface = roadSurface(road, x, y);
              return surface && surface.height >= -8;
            });
          if (!openPortal) return false;
        }
        const delta = end.z - start.z,
          zero = delta ? -start.z / delta : 0;
        const low = start.z < 0 ? 0 : zero,
          high = end.z < 0 ? 1 : zero;
        const query = {
          x: Math.min(start.x, end.x),
          y: Math.min(start.y, end.y),
          w: Math.abs(end.x - start.x),
          h: Math.abs(end.y - start.y),
        };
        const intervals = [
          ...railTerrain.segmentIntervals(start, end),
          ...legacyTunnelSpaceIndex
            .queryRect(query)
            .map((volume) => railSpaceInterval(volume, start, end))
            .filter(Boolean),
        ];
        if (!railIntervalsCover(intervals, low, high)) return false;
      }
      const query = {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        w: Math.abs(end.x - start.x),
        h: Math.abs(end.y - start.y),
      };
      return !blockerIndex
        .queryRect(query)
        .some((record) => segmentHitsVolume(start, end, record.bounds, record.height));
    },
    isWater(x, y, { ignoreDeck = false } = {}) {
      point(x, y);
      if (!rawWater(x, y)) return false;
      return (
        ignoreDeck ||
        !surfaces(x, y).some(
          (surface) =>
            surface.height >= 0 && surface.access.some((mode) => mode === 'foot' || mode === 'car'),
        )
      );
    },
    surfaceHeight(x, y, previousHeight = 0, { mode = 'foot' } = {}) {
      point(x, y);
      finite(previousHeight, 'previous height');
      if (typeof mode !== 'string' || !mode.length)
        throw new TypeError('Invalid terrain movement mode.');
      let selected = 0,
        difference = Infinity;
      for (const surface of surfaces(x, y)) {
        if (
          !surface.access.includes(mode) ||
          (Math.abs(previousHeight) <= EPSILON &&
            !surface.ramp &&
            Math.abs(surface.height) > EPSILON)
        )
          continue;
        const delta = Math.abs(surface.height - previousHeight);
        if (
          delta <= STEP_HEIGHT &&
          (delta < difference || (delta === difference && surface.height > selected))
        ) {
          selected = surface.height;
          difference = delta;
        }
      }
      return selected;
    },
    infrastructureAt(x, y, z = 0) {
      point(x, y);
      finite(z, 'z');
      return (
        roadIndex
          .queryRadius(x, y, 0)
          .filter((road) => road.item.bridge || road.item.tunnel)
          .find((road) => {
            const surface = roadSurface(road, x, y);
            return surface && Math.abs(surface.height - z) < 3;
          })?.item ?? null
      );
    },
    overheadDeck(x, y, bodyHeight = 18, z = 0) {
      point(x, y);
      finite(z, 'z');
      finite(bodyHeight, 'body height');
      return (
        surfaces(x, y)
          .filter(
            (surface) =>
              surface.height > z + bodyHeight &&
              surface.access.some((mode) => mode === 'car' || mode === 'foot'),
          )
          .sort((a, b) => a.height - b.height)[0]?.height ?? null
      );
    },
    nearbyBuildings(x, y, radius = 0) {
      point(x, y, radius);
      return buildingIndex
        .queryRadius(x, y, radius)
        .filter((record) => circleRect(x, y, radius, record.bounds, true))
        .map((record) => record.item);
    },
    neighbourhoodAt(x, y) {
      point(x, y);
      return (
        areaIndex.queryRadius(x, y, 0).find((record) => contains(x, y, record.bounds))?.item ?? null
      );
    },
  };
}
