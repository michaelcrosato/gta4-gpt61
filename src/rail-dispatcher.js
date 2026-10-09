/**
 * Deterministic physical rail reservations. Geometry owns corridors; transit owns
 * its timetable; callers own road users and static collision. A reservation is
 * an exclusive physical resource, never merely a track ID. No actor is mutated.
 */
const EPS = 1e-6;
const MAX_RECORDS = 32768;
const compiledWorlds = new WeakMap();
const copy = (value) => JSON.parse(JSON.stringify(value));
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const clamp = (value, a, b) => Math.max(a, Math.min(b, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function bad(reason) {
  throw new Error(`Invalid rail dispatch: ${reason}.`);
}
function numeric(value, label, min = 0, max = 1e12, integer = false) {
  if (
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    bad(label);
  return value;
}
function name(value, label) {
  if (typeof value !== 'string' || !value.length || value.length > 256) bad(label);
  return value;
}
function point(value, label) {
  if (!value || typeof value !== 'object') bad(label);
  return {
    x: numeric(value.x, label, -1e9, 1e9),
    y: numeric(value.y, label, -1e9, 1e9),
    z: numeric(value.z ?? 0, label, -1e6, 1e6),
  };
}
function rectangle(value, label) {
  if (!value || typeof value !== 'object') bad(label);
  const bounds = {
    x: numeric(value.x, label, -1e9, 1e9),
    y: numeric(value.y, label, -1e9, 1e9),
    w: numeric(value.w, label, 0, 1e8),
    h: numeric(value.h, label, 0, 1e8),
    zMin: numeric(value.zMin ?? -1e6, label, -1e6, 1e6),
    zMax: numeric(value.zMax ?? 1e6, label, -1e6, 1e6),
  };
  if (bounds.zMax < bounds.zMin) bad(label);
  return bounds;
}
function list(value, label, max = MAX_RECORDS) {
  if (!Array.isArray(value) || value.length > max) bad(label);
  return value;
}
function safeJSON(value) {
  let count = 0;
  const ancestors = new Set();
  const visit = (item, depth) => {
    if (++count > 500000 || depth > 32) bad('JSON limits');
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) bad('nonfinite JSON');
      return;
    }
    if (typeof item === 'string') {
      if (item.length > 10000) bad('JSON text size');
      return;
    }
    if (!item || typeof item !== 'object' || ancestors.has(item)) bad('unsafe JSON');
    if (Object.getPrototypeOf(item) !== Object.prototype && !Array.isArray(item))
      bad('JSON prototype');
    ancestors.add(item);
    const keys = Reflect.ownKeys(item);
    for (const key of keys) {
      if (key === 'length' && Array.isArray(item)) continue;
      if (
        typeof key !== 'string' ||
        ['__proto__', 'prototype', 'constructor', 'toJSON'].includes(key)
      )
        bad('JSON key');
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable)
        bad('JSON accessor');
      visit(descriptor.value, depth + 1);
    }
    if (Array.isArray(item) && (item.length > MAX_RECORDS || keys.length !== item.length + 1))
      bad('JSON array');
    ancestors.delete(item);
  };
  visit(value, 0);
}
function hash(value) {
  let h = 2166136261;
  for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h.toString(16).padStart(8, '0');
}
function polygon(pose, length, width) {
  const cos = Math.cos(pose.heading),
    sin = Math.sin(pose.heading);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => ({
    x: pose.x + ((a * length) / 2) * cos - ((b * width) / 2) * sin,
    y: pose.y + ((a * length) / 2) * sin + ((b * width) / 2) * cos,
  }));
}
function hull(points) {
  const ordered = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const lower = [],
    upper = [];
  for (const p of ordered) {
    while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), p) <= EPS) lower.pop();
    lower.push(p);
  }
  for (const p of [...ordered].reverse()) {
    while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), p) <= EPS) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
function overlaps(A, B) {
  if (A.zMax <= B.zMin + EPS || B.zMax <= A.zMin + EPS) return false;
  const padding = (A.padding ?? 0) + (B.padding ?? 0);
  for (const shape of [A.points, B.points])
    for (let i = 0; i < shape.length; i++) {
      const a = shape[i],
        b = shape[(i + 1) % shape.length],
        dx = b.x - a.x,
        dy = b.y - a.y,
        L = Math.hypot(dx, dy);
      if (L <= EPS) continue;
      const x = -dy / L,
        y = dx / L;
      const first = A.points.map((p) => p.x * x + p.y * y),
        second = B.points.map((p) => p.x * x + p.y * y);
      if (
        Math.max(...first) + padding <= Math.min(...second) + EPS ||
        Math.max(...second) + padding <= Math.min(...first) + EPS
      )
        return false;
    }
  return true;
}
function body(pose, dimensions) {
  return {
    points: polygon(pose, dimensions.length, dimensions.width),
    zMin: pose.z,
    zMax: pose.z + dimensions.height,
    padding: 0,
  };
}
function box(bounds) {
  return {
    points: [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.w, y: bounds.y },
      { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
      { x: bounds.x, y: bounds.y + bounds.h },
    ],
    zMin: bounds.zMin,
    zMax: bounds.zMax,
    padding: 0,
  };
}
function pathData(points) {
  const lengths = [];
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const d = distance(points[i - 1], points[i]);
    if (d <= EPS || Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y) <= EPS)
      bad('degenerate track');
    length += d;
    lengths.push(length);
  }
  return { points, lengths, length };
}
function boundsInterval(track, bounds) {
  let entryDistance = Infinity,
    releaseDistance = -Infinity;
  for (let i = 1; i < track.points.length; i++) {
    const a = track.points[i - 1],
      b = track.points[i],
      base = i > 1 ? track.lengths[i - 2] : 0,
      length = track.lengths[i - 1] - base;
    let lo = 0,
      hi = 1;
    for (const [axis, min, max] of [
      ['x', bounds.x, bounds.x + bounds.w],
      ['y', bounds.y, bounds.y + bounds.h],
      ['z', bounds.zMin, bounds.zMax],
    ]) {
      const delta = b[axis] - a[axis];
      if (Math.abs(delta) < EPS) {
        if (a[axis] < min - EPS || a[axis] > max + EPS) {
          hi = -1;
          break;
        }
      } else {
        const first = (min - a[axis]) / delta,
          last = (max - a[axis]) / delta;
        lo = Math.max(lo, Math.min(first, last));
        hi = Math.min(hi, Math.max(first, last));
      }
    }
    if (hi >= lo - EPS) {
      entryDistance = Math.min(entryDistance, base + length * Math.max(0, lo));
      releaseDistance = Math.max(releaseDistance, base + length * Math.min(1, hi));
    }
  }
  return Number.isFinite(entryDistance)
    ? { entryDistance: Math.max(0, entryDistance), releaseDistance }
    : null;
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
      width = Math.min(12, distance(before, turn) / 3, distance(turn, after) / 3);
    if (d < at - width || d > at + width) continue;
    const first = Math.atan2(turn.y - before.y, turn.x - before.x),
      last = Math.atan2(after.y - turn.y, after.x - turn.x),
      delta = Math.atan2(Math.sin(last - first), Math.cos(last - first));
    const ratio = clamp((d - at + width) / (width * 2), 0, 1);
    heading = first + delta * ratio * ratio * (3 - 2 * ratio);
    break;
  }
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, heading };
}
function sweep(leg, start, end, dimensions) {
  const divisions = [start, end];
  for (let i = 0; i < leg.points.length - 2; i++) {
    const d = leg.lengths[i],
      w = Math.min(
        12,
        distance(leg.points[i], leg.points[i + 1]) / 3,
        distance(leg.points[i + 1], leg.points[i + 2]) / 3,
      );
    for (const at of [d - w, d, d + w]) if (at > start + EPS && at < end - EPS) divisions.push(at);
    const lo = Math.max(start, d - w),
      hi = Math.min(end, d + w);
    for (let at = lo + 1; at < hi - EPS; at += 1) divisions.push(at);
  }
  divisions.sort((a, b) => a - b);
  const zones = [];
  for (let i = 1; i < divisions.length; i++) {
    const a = sample(leg, divisions[i - 1]),
      b = sample(leg, divisions[i]),
      delta = Math.abs(
        Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading)),
      );
    zones.push({
      points: hull([
        ...polygon(a, dimensions.length, dimensions.width),
        ...polygon(b, dimensions.length, dimensions.width),
      ]),
      zMin: Math.min(a.z, b.z),
      zMax: Math.max(a.z, b.z) + dimensions.height,
      padding: (Math.hypot(dimensions.length, dimensions.width) / 2) * delta,
    });
  }
  return zones;
}
function compile(world) {
  if (compiledWorlds.has(world)) return compiledWorlds.get(world);
  const transit = world?.transit;
  if (!transit || !transit.railGeometry?.settings) bad('checked geometry required');
  const settings = transit.railGeometry.settings,
    dimensions = {
      length: numeric(settings.trainLength, 'train length', 1, 500),
      width: numeric(settings.trainWidth, 'train width', 1, 100),
      height: numeric(settings.trainHeight, 'train height', 1, 100),
    };
  const resources = new Map(),
    platforms = new Map(),
    tracks = new Map(),
    services = new Map(),
    gates = new Map();
  for (const raw of list(transit.railResources, 'physical resources')) {
    const id = name(raw.id, 'resource id');
    if (resources.has(id) || id.startsWith('platform:')) bad('duplicate resource');
    const bounds = rectangle(raw.bounds, 'resource bounds'),
      physicalBounds = rectangle(raw.physicalBounds, 'physical bounds'),
      releaseBounds = rectangle(raw.releaseBounds ?? raw.bounds, 'release bounds');
    if (!['junction', 'shared-block'].includes(raw.type)) bad('resource type');
    resources.set(id, {
      id,
      type: raw.type,
      bounds,
      physicalBounds,
      releaseBounds,
      trackIds: list(raw.trackIds, 'resource tracks', 4096).map((id) => name(id, 'resource track')),
    });
  }
  for (const station of list(transit.stations, 'stations', 1024))
    for (const p of list(station.platforms, 'platforms', 128)) {
      const id = name(p.id, 'platform id');
      if (platforms.has(id)) bad('duplicate platform');
      const pose = {
        ...point(p.stopPoint ?? p, 'stop point'),
        heading: numeric(
          p.heading ?? (p.axis === 'north-south' ? Math.PI / 2 : 0),
          'platform heading',
          -Math.PI * 2,
          Math.PI * 2,
        ),
      };
      platforms.set(id, { id, pose, stationId: station.id });
      resources.set(`platform:${id}`, {
        id: `platform:${id}`,
        type: 'platform',
        platformId: id,
        shape: body(pose, dimensions),
      });
    }
  for (const t of list(transit.tracks, 'tracks', 4096)) {
    const id = name(t.id, 'track id');
    if (tracks.has(id)) bad('duplicate track');
    const points = list(t.points, 'track points', 2048).map((p) => point(p, 'track point'));
    if (points.length < 2) bad('track points');
    const entries = list(transit.legResourceBundles?.[id], 'leg resource bundle').map((raw) => {
      const resource = resources.get(raw.resourceId);
      if (!resource || resource.type === 'platform') bad('leg resource reference');
      return {
        resourceId: raw.resourceId,
        entryDistance: numeric(raw.entryDistance, 'entry distance', 0, 1e9),
        releaseDistance: numeric(raw.releaseDistance, 'release distance', 0, 1e9),
      };
    });
    if (
      new Set(entries.map((e) => e.resourceId)).size !== entries.length ||
      entries.some((e) => e.releaseDistance < e.entryDistance)
    )
      bad('leg resource intervals');
    tracks.set(id, { id, ...pathData(points), entries });
  }
  // A leg may loop back beside its departure stop or pass another platform.
  // Reserve every swept platform ahead of time, including the last such visit.
  const radius = Math.hypot(dimensions.length, dimensions.width) / 2;
  for (const track of tracks.values())
    track.platformEntries = [...platforms.values()].flatMap((platform) => {
      const shape = resources.get(`platform:${platform.id}`).shape,
        xs = shape.points.map((p) => p.x),
        ys = shape.points.map((p) => p.y);
      const bounds = {
        x: Math.min(...xs) - radius,
        y: Math.min(...ys) - radius,
        w: Math.max(...xs) - Math.min(...xs) + radius * 2,
        h: Math.max(...ys) - Math.min(...ys) + radius * 2,
        zMin: platform.pose.z - dimensions.height,
        zMax: platform.pose.z + dimensions.height,
      };
      const at = boundsInterval(track, bounds);
      return at ? [{ resourceId: `platform:${platform.id}`, ...at }] : [];
    });
  for (const resource of resources.values())
    if (resource.type !== 'platform' && resource.trackIds.some((id) => !tracks.has(id)))
      bad('unknown resource track');
  for (const p of platforms.values()) {
    p.resources = list(transit.stationResourceBundles?.[p.id], 'station bundle').map((id) => {
      if (!resources.has(id) || resources.get(id).type === 'platform')
        bad('station resource reference');
      return id;
    });
    if (new Set(p.resources).size !== p.resources.length) bad('duplicate station resource');
  }
  for (const service of list(transit.throughServices, 'services', 32)) {
    const id = name(service.id, 'service id');
    if (services.has(id)) bad('duplicate service');
    const calls = list(service.calls, 'service calls', 256).map((c) => {
      if (!platforms.has(c.platformId)) bad('service platform');
      return c.platformId;
    });
    if (calls.length < 2 || !service.closedLoop) bad('closed service');
    const legs = list(service.legs, 'service legs', 256).map((l, i) => {
      const track = tracks.get(l.trackId);
      if (!track || typeof l.reverse !== 'boolean') bad('service track');
      if (l.reverse && track.entries.length) bad('directional resource distances required');
      const leg = l.reverse ? { ...track, ...pathData([...track.points].reverse()) } : track;
      if (
        distance(leg.points[0], platforms.get(calls[i]).pose) > EPS ||
        distance(leg.points.at(-1), platforms.get(calls[(i + 1) % calls.length]).pose) > EPS
      )
        bad('service endpoint');
      return leg;
    });
    if (legs.length !== calls.length) bad('service leg count');
    services.set(id, { id, calls, legs });
  }
  for (const gate of list(transit.railCrossings ?? [], 'road gates', 4096)) {
    const id = name(gate.id, 'road gate id');
    if (gates.has(id)) bad('duplicate gate');
    const points = list(gate.points ?? [], 'gate points', 128).map((p) => point(p, 'gate point'));
    const bounds = rectangle(gate.bounds, 'gate bounds');
    gates.set(id, {
      id,
      roadId: name(gate.roadId, 'gate road'),
      trackIds: list(gate.trackIds, 'gate tracks', 4096).map((id) => {
        if (!tracks.has(id)) bad('gate track');
        return id;
      }),
      points,
      bounds,
      entryBuffer: numeric(gate.entryBuffer, 'gate entry buffer', 0, 500),
      releaseBuffer: numeric(gate.releaseBuffer, 'gate release buffer', 0, 500),
    });
  }
  const topology = {
    dimensions,
    resources: [...resources.values()].sort((a, b) => compare(a.id, b.id)),
    tracks: [...tracks.values()].sort((a, b) => compare(a.id, b.id)),
    platforms: [...platforms.values()].sort((a, b) => compare(a.id, b.id)),
    services: [...services.values()].sort((a, b) => compare(a.id, b.id)),
    gates: [...gates.values()].sort((a, b) => compare(a.id, b.id)),
  };
  const legacyFingerprint = hash(JSON.stringify(topology));
  // Derived trigonometric/length results can differ by a few ulps across JS
  // engines. Canonical metadata is much finer than the collision tolerance;
  // all actual geometry remains untouched and is still checked continuously.
  const fingerprint = hash(
    JSON.stringify(topology, (_key, value) =>
      typeof value === 'number' ? Math.round(value * 1e9) / 1e9 : value,
    ),
  );
  const data = {
    dimensions,
    resources,
    platforms,
    tracks,
    services,
    gates,
    fingerprint,
    legacyFingerprint,
  };
  compiledWorlds.set(world, data);
  return data;
}
function fleetData(fleet, data) {
  const map = new Map();
  for (const train of list(fleet, 'fleet', 128)) {
    const id = name(train.id, 'train id');
    if (map.has(id)) bad('duplicate train');
    const service = data.services.get(train.serviceId);
    if (!service) bad('fleet service');
    numeric(train.callIndex, 'call index', 0, service.calls.length - 1, true);
    numeric(train.visits, 'visits', 0, 1e12, true);
    const pose = {
      ...point(train, 'train pose'),
      heading: numeric(train.heading, 'train heading', -Math.PI * 4, Math.PI * 4),
    };
    if (!['opening', 'dwelling', 'closing', 'moving', 'held', 'blocked'].includes(train.phase))
      bad('train phase');
    const leg = service.legs[train.callIndex];
    numeric(train.distance, 'train distance', 0, leg.length + EPS);
    const expected = sample(leg, ['moving', 'blocked'].includes(train.phase) ? train.distance : 0);
    if (
      distance(pose, expected) > EPS * 10 ||
      Math.abs(
        Math.atan2(
          Math.sin(pose.heading - expected.heading),
          Math.cos(pose.heading - expected.heading),
        ),
      ) >
        EPS * 10
    )
      bad('fleet physical pose');
    map.set(id, {
      train,
      service,
      leg,
      pose,
      sourcePlatform: service.calls[train.callIndex],
      destinationPlatform: service.calls[(train.callIndex + 1) % service.calls.length],
    });
  }
  const bodies = [...map.values()];
  for (let i = 0; i < bodies.length; i++)
    for (let j = i + 1; j < bodies.length; j++)
      if (overlaps(body(bodies[i].pose, data.dimensions), body(bodies[j].pose, data.dimensions)))
        bad('overlapping fleet');
  return map;
}
function token(id) {
  return `platform:${id}`;
}
function release(record, entry, data) {
  const { train, leg, pose } = entry,
    resource = data.resources.get(record.resourceId);
  if (resource.type === 'platform') {
    if (record.kind === 'leg' && record.visits === train.visits && record.trackId === leg.id)
      return (
        ['moving', 'blocked'].includes(train.phase) && train.distance > record.releaseDistance + EPS
      );
    if (!['moving', 'blocked'].includes(train.phase) && record.platformId === entry.sourcePlatform)
      return false;
    return !overlaps(body(pose, data.dimensions), resource.shape);
  }
  if (record.kind === 'leg' && record.visits === train.visits && record.trackId === leg.id)
    return (
      ['moving', 'blocked'].includes(train.phase) && train.distance > record.releaseDistance + EPS
    );
  return !overlaps(body(pose, data.dimensions), box(resource.physicalBounds));
}
function interval(track, id) {
  return [...track.entries, ...track.platformEntries].find((e) => e.resourceId === id);
}
function grantRecord(resourceId, entry, time, kind = 'leg') {
  return {
    resourceId,
    trainId: entry.train.id,
    trackId: kind === 'station' ? null : entry.leg.id,
    visits: entry.train.visits,
    callIndex: entry.train.callIndex,
    kind,
    platformId: resourceId.startsWith('platform:') ? resourceId.slice(9) : null,
    acquiredAt: time,
    releaseDistance: kind === 'leg' ? (interval(entry.leg, resourceId)?.releaseDistance ?? 0) : 0,
  };
}
function needed(entry) {
  return [
    ...new Set(
      [...entry.leg.entries, ...entry.leg.platformEntries]
        .filter((e) => e.releaseDistance >= entry.train.distance - EPS)
        .map((e) => e.resourceId),
    ),
  ];
}
function closedGates(data, fleet) {
  const result = [];
  for (const gate of data.gates.values()) {
    let closed = false;
    for (const entry of fleet.values()) {
      const bounds = gate.bounds,
        p = entry.pose;
      if (
        p.x >= bounds.x - EPS &&
        p.x <= bounds.x + bounds.w + EPS &&
        p.y >= bounds.y - EPS &&
        p.y <= bounds.y + bounds.h + EPS &&
        p.z + data.dimensions.height > bounds.zMin + EPS &&
        p.z < bounds.zMax - EPS
      ) {
        closed = true;
        break;
      }
    }
    if (closed) result.push(gate.id);
  }
  return result.sort(compare);
}
function empty(data) {
  return {
    version: 1,
    topology: data.fingerprint,
    topologyEncoding: 2,
    dimensions: { ...data.dimensions },
    revision: 0,
    time: 0,
    reservations: [],
    waiting: [],
    nextWaitSequence: 0,
    closedGates: [],
    stats: { grants: 0, denials: 0, maxWait: 0 },
  };
}
function seed(state, fleet, data) {
  const owners = new Map();
  const add = (record) => {
    const prior = owners.get(record.resourceId);
    if (prior && prior !== record.trainId) bad('initial occupied physical resource');
    if (!prior) {
      owners.set(record.resourceId, record.trainId);
      state.reservations.push(record);
    } else if (record.kind === 'leg') {
      const index = state.reservations.findIndex((r) => r.resourceId === record.resourceId);
      state.reservations[index] = record;
    }
  };
  for (const entry of [...fleet.values()].sort((a, b) => compare(a.train.id, b.train.id))) {
    const source = data.resources.get(token(entry.sourcePlatform));
    if (
      !['moving', 'blocked'].includes(entry.train.phase) ||
      overlaps(body(entry.pose, data.dimensions), source.shape)
    )
      add({
        ...grantRecord(token(entry.sourcePlatform), entry, state.time, 'station'),
        platformId: entry.sourcePlatform,
      });
    for (const id of data.platforms.get(entry.sourcePlatform).resources)
      if (overlaps(body(entry.pose, data.dimensions), box(data.resources.get(id).physicalBounds)))
        add(grantRecord(id, entry, state.time, 'station'));
    if (['moving', 'blocked', 'closing'].includes(entry.train.phase))
      for (const id of needed(entry)) add(grantRecord(id, entry, state.time));
  }
  state.closedGates = closedGates(data, fleet);
  state.reservations.sort((a, b) => compare(a.resourceId, b.resourceId));
}
function validate(saved, data, fleet) {
  safeJSON(saved);
  const topologyValid =
    saved?.topologyEncoding === 2
      ? saved.topology === data.fingerprint
      : saved?.topologyEncoding === undefined && saved.topology === data.legacyFingerprint;
  if (saved?.version !== 1 || !topologyValid) bad('version/topology');
  if (
    !saved.dimensions ||
    ['length', 'width', 'height'].some((key) => saved.dimensions[key] !== data.dimensions[key])
  )
    bad('geometry dimensions');
  numeric(saved.time, 'clock');
  numeric(saved.revision, 'revision', 0, 1e12, true);
  numeric(saved.nextWaitSequence, 'wait sequence', 0, 1e12, true);
  list(saved.waiting, 'waiting', 128);
  const owners = new Map();
  for (const r of list(saved.reservations, 'reservations')) {
    const resource = data.resources.get(r.resourceId),
      entry = fleet.get(r.trainId);
    if (!resource || !entry || owners.has(r.resourceId)) bad('reservation identity/owner');
    owners.set(r.resourceId, r.trainId);
    numeric(r.visits, 'reservation epoch', 0, entry.train.visits, true);
    numeric(r.callIndex, 'reservation call', 0, entry.service.calls.length - 1, true);
    const expectedIndex =
      (entry.train.callIndex -
        ((entry.train.visits - r.visits) % entry.service.calls.length) +
        entry.service.calls.length) %
      entry.service.calls.length;
    if (expectedIndex !== r.callIndex || !['leg', 'station'].includes(r.kind))
      bad('reservation progression');
    numeric(r.acquiredAt, 'reservation time', 0, saved.time);
    const oldLeg = entry.service.legs[r.callIndex];
    if (r.kind === 'station') {
      if (r.trackId !== null || r.releaseDistance !== 0) bad('station hold');
    } else {
      if (r.trackId !== oldLeg.id) bad('reservation track');
      const ref = interval(oldLeg, r.resourceId);
      if (!ref || Math.abs(r.releaseDistance - ref.releaseDistance) > EPS)
        bad('resource release distance');
    }
    if (resource.type === 'platform') {
      if (
        r.platformId !== resource.platformId ||
        (r.kind === 'leg' && !oldLeg.platformEntries.some((e) => e.resourceId === r.resourceId)) ||
        (r.kind === 'station' && r.platformId !== entry.service.calls[r.callIndex])
      )
        bad('platform occupancy');
    } else if (r.platformId !== null) bad('resource platform');
    if (release(r, entry, data)) bad('stale rear-cleared reservation');
  }
  for (const entry of fleet.values()) {
    const pendingDeparture =
      entry.train.distance <= EPS &&
      saved.waiting.some(
        (wait) =>
          wait.trainId === entry.train.id &&
          wait.trackId === entry.leg.id &&
          wait.visits === entry.train.visits,
      );
    const atStation =
      !['moving', 'blocked'].includes(entry.train.phase) || entry.train.distance <= EPS;
    if (
      (atStation ||
        overlaps(
          body(entry.pose, data.dimensions),
          data.resources.get(token(entry.sourcePlatform)).shape,
        )) &&
      owners.get(token(entry.sourcePlatform)) !== entry.train.id
    )
      bad(`missing current station occupancy ${entry.train.id}/${entry.sourcePlatform}`);
    for (const id of data.platforms.get(entry.sourcePlatform).resources)
      if (
        atStation &&
        overlaps(body(entry.pose, data.dimensions), box(data.resources.get(id).physicalBounds)) &&
        owners.get(id) !== entry.train.id
      )
        bad('missing station physical occupancy');
    if (['moving', 'blocked', 'closing'].includes(entry.train.phase) && !pendingDeparture)
      for (const id of needed(entry))
        if (owners.get(id) !== entry.train.id) bad('missing active leg/destination reservation');
  }
  const waits = new Set(),
    sequences = new Set();
  for (const wait of list(saved.waiting, 'waiting', 128)) {
    const entry = fleet.get(wait.trainId);
    if (
      !entry ||
      waits.has(wait.trainId) ||
      (!['held', 'dwelling', 'closing', 'opening'].includes(entry.train.phase) &&
        !(['moving', 'blocked'].includes(entry.train.phase) && entry.train.distance <= EPS)) ||
      wait.trackId !== entry.leg.id ||
      wait.visits !== entry.train.visits
    )
      bad('waiting train');
    waits.add(wait.trainId);
    numeric(wait.sequence, 'wait priority', 1, saved.nextWaitSequence, true);
    if (sequences.has(wait.sequence)) bad('duplicate wait priority');
    sequences.add(wait.sequence);
    numeric(wait.since, 'wait time', 0, saved.time);
    if (needed(entry).every((id) => owners.get(id) === entry.train.id)) bad('stale granted waiter');
  }
  const gates = list(saved.closedGates, 'closed gates', 4096);
  if (JSON.stringify([...gates].sort(compare)) !== JSON.stringify(closedGates(data, fleet)))
    bad('gate occupancy');
  if (!saved.stats || typeof saved.stats !== 'object') bad('stats');
  for (const key of ['grants', 'denials']) numeric(saved.stats[key], key, 0, 1e12, true);
  numeric(saved.stats.maxWait, 'max wait', 0, saved.time);
  return true;
}

/** Validates reservations against physical geometry and the exact current fleet. */
export function validateRailDispatch(saved, world, trains) {
  const data = compile(world);
  return validate(saved, data, fleetData(trains, data));
}
export function railDispatchTopology(world) {
  const data = compile(world);
  return { encoding: 2, topology: data.fingerprint, legacyTopology: data.legacyFingerprint };
}
/** Detached, strict JSON restore; it never invents missing owners or releases. */
export function restoreRailDispatch(serializedOrObject, world, trains) {
  let value = serializedOrObject;
  if (typeof value === 'string') {
    if (value.length > 8000000) bad('save size');
    try {
      value = JSON.parse(value);
    } catch {
      bad('save JSON');
    }
  }
  validateRailDispatch(value, world, trains);
  const migrated = copy(value),
    data = compile(world);
  migrated.topology = data.fingerprint;
  migrated.topologyEncoding = 2;
  return migrated;
}

/**
 * Wrap each updateTransit call with beginStep(fleet,time) / endStep(fleet,time).
 * Pass canDepart and canMoveTrain as synchronous policy callbacks. Road users
 * must obey closedGates, and the parent must still guard buildings/road users.
 */
export function createRailDispatcher(world, trains = [], savedState = null) {
  const data = compile(world);
  let live = trains,
    fleet = fleetData(trains, data),
    state = savedState === null ? empty(data) : restoreRailDispatch(savedState, world, trains),
    signature = '',
    approved = [];
  if (savedState === null) seed(state, fleet, data);
  function sync() {
    fleet = fleetData(live, data);
    const next = JSON.stringify(
      [...fleet.values()]
        .map((e) => [
          e.train.id,
          e.train.visits,
          e.train.phase,
          e.train.distance,
          e.pose.x,
          e.pose.y,
          e.pose.z,
          e.pose.heading,
        ])
        .sort((a, b) => compare(a[0], b[0])),
    );
    if (next !== signature) {
      signature = next;
      approved = [];
      state.reservations = state.reservations.filter(
        (r) => !release(r, fleet.get(r.trainId), data),
      );
    }
    state.closedGates = closedGates(data, fleet);
  }
  function ownerMap() {
    return new Map(state.reservations.map((r) => [r.resourceId, r.trainId]));
  }
  function entryFor(train) {
    sync();
    const entry = fleet.get(train?.id);
    if (
      !entry ||
      train.serviceId !== entry.train.serviceId ||
      train.callIndex !== entry.train.callIndex ||
      train.visits !== entry.train.visits ||
      distance(point(train, 'policy train'), entry.pose) > EPS * 10
    )
      bad('policy fleet mismatch');
    return entry;
  }
  function enqueue(entry) {
    let wait = state.waiting.find((w) => w.trainId === entry.train.id);
    if (!wait) {
      wait = {
        trainId: entry.train.id,
        trackId: entry.leg.id,
        visits: entry.train.visits,
        since: state.time,
        sequence: ++state.nextWaitSequence,
      };
      state.waiting.push(wait);
    }
    return wait;
  }
  const dispatcher = {
    beginStep(nextFleet, time = state.time) {
      numeric(time, 'step time', state.time);
      live = nextFleet;
      state.time = time;
      sync();
      return dispatcher;
    },
    canDepart({ train }) {
      const entry = entryFor(train),
        owners = ownerMap(),
        ids = needed(entry);
      if (ids.every((id) => owners.get(id) === entry.train.id)) {
        for (const id of ids) {
          const prior = state.reservations.find((r) => r.resourceId === id);
          if (
            prior.visits !== entry.train.visits ||
            prior.kind !== 'leg' ||
            prior.trackId !== entry.leg.id
          )
            Object.assign(prior, grantRecord(id, entry, prior.acquiredAt));
        }
        state.waiting = state.waiting.filter((w) => w.trainId !== entry.train.id);
        return true;
      }
      const wait = enqueue(entry);
      const blocked = ids.some((id) => owners.has(id) && owners.get(id) !== entry.train.id);
      const older = state.waiting.some(
        (w) =>
          w.sequence < wait.sequence &&
          w.trainId !== entry.train.id &&
          (() => {
            const other = fleet.get(w.trainId);
            if (!other) return false;
            const wanted = needed(other);
            return (
              wanted.some((id) => ids.includes(id)) &&
              !wanted.some((id) => owners.get(id) === entry.train.id)
            );
          })(),
      );
      if (blocked || older) {
        state.stats.denials++;
        return false;
      }
      for (const id of ids) {
        if (!owners.has(id)) state.reservations.push(grantRecord(id, entry, state.time));
        else {
          const prior = state.reservations.find((r) => r.resourceId === id);
          Object.assign(prior, grantRecord(id, entry, prior.acquiredAt));
        }
      }
      state.reservations.sort((a, b) => compare(a.resourceId, b.resourceId));
      state.waiting = state.waiting.filter((w) => w.trainId !== entry.train.id);
      state.stats.grants++;
      state.stats.maxWait = Math.max(state.stats.maxWait, state.time - wait.since);
      state.revision++;
      return true;
    },
    canMoveTrain(request) {
      const entry = entryFor(request.train);
      let owners = ownerMap();
      if (['length', 'width', 'height'].some((key) => request[key] !== data.dimensions[key]))
        bad('movement dimensions differ from geometry');
      const path = list(request.path, 'swept path', 2048).map((p) => point(p, 'swept point'));
      if (path.length < 2) bad('swept path');
      if (distance(path[0], entry.pose) > EPS * 10) bad('swept start');
      const advance = path.slice(1).reduce((sum, p, i) => sum + distance(path[i], p), 0),
        end = entry.train.distance + advance;
      if (end > entry.leg.length + EPS * 10) bad('swept endpoint');
      const expected = sample(entry.leg, end),
        pose = {
          ...point(request.endPose, 'end pose'),
          heading: numeric(request.endPose.heading, 'end heading', -Math.PI * 4, Math.PI * 4),
        };
      if (
        distance(expected, pose) > EPS * 10 ||
        Math.abs(
          Math.atan2(
            Math.sin(expected.heading - pose.heading),
            Math.cos(expected.heading - pose.heading),
          ),
        ) >
          EPS * 10
      )
        bad('off-corridor movement');
      const corners = entry.leg.lengths
        .filter((d) => d > entry.train.distance + EPS && d < end - EPS)
        .map((d) => sample(entry.leg, d));
      if (
        path.length !== corners.length + 2 ||
        corners.some((p, i) => distance(p, path[i + 1]) > EPS * 10)
      )
        bad('missing swept corner');
      if (!needed(entry).every((id) => owners.get(id) === entry.train.id)) {
        if (
          entry.train.distance > EPS ||
          !['moving', 'blocked'].includes(entry.train.phase) ||
          !dispatcher.canDepart({ train: request.train })
        )
          return false;
        owners = ownerMap();
        if (!needed(entry).every((id) => owners.get(id) === entry.train.id)) return false;
      }
      const zones = sweep(
        entry.leg,
        entry.train.distance,
        Math.min(end, entry.leg.length),
        data.dimensions,
      );
      for (const other of fleet.values())
        if (
          other.train.id !== entry.train.id &&
          zones.some((zone) => overlaps(zone, body(other.pose, data.dimensions)))
        )
          return false;
      for (const prior of approved)
        if (
          prior.trainId !== entry.train.id &&
          zones.some((zone) => prior.zones.some((other) => overlaps(zone, other)))
        )
          return false;
      approved.push({ trainId: entry.train.id, zones });
      for (const gate of data.gates.values())
        if (
          gate.trackIds.includes(entry.leg.id) &&
          zones.some((zone) => overlaps(zone, box({ ...gate.bounds, zMin: -1e6, zMax: 1e6 })))
        )
          state.closedGates = [...new Set([...state.closedGates, gate.id])].sort(compare);
      return true;
    },
    endStep(nextFleet = live, time = state.time) {
      numeric(time, 'step time', state.time);
      live = nextFleet;
      state.time = time;
      sync();
      // A closed stop can be bypassed exactly at the end of this timestep.
      // Reserve its next leg now, or retain a safe zero-distance queued train.
      for (const entry of fleet.values())
        if (
          ['moving', 'blocked'].includes(entry.train.phase) &&
          entry.train.distance <= EPS &&
          !needed(entry).every((id) => ownerMap().get(id) === entry.train.id)
        )
          dispatcher.canDepart({ train: entry.train });
      state.waiting = state.waiting.filter((w) => {
        const e = fleet.get(w.trainId);
        return (
          e &&
          w.visits === e.train.visits &&
          w.trackId === e.leg.id &&
          (!['moving', 'blocked'].includes(e.train.phase) || e.train.distance <= EPS)
        );
      });
      state.closedGates = closedGates(data, fleet);
      state.revision++;
      validate(state, data, fleet);
      return dispatcher;
    },
    snapshot() {
      return copy(state);
    },
    get closedGates() {
      return [...state.closedGates];
    },
  };
  signature = JSON.stringify(
    [...fleet.values()]
      .map((e) => [
        e.train.id,
        e.train.visits,
        e.train.phase,
        e.train.distance,
        e.pose.x,
        e.pose.y,
        e.pose.z,
        e.pose.heading,
      ])
      .sort((a, b) => compare(a[0], b[0])),
  );
  return dispatcher;
}
