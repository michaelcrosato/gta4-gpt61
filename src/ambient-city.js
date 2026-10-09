import { createSpatialIndex } from './spatial-index.js';
import { createTerrain } from './terrain.js';

const ACTIVE_RADIUS = 1100;
const RETAIN_RADIUS = 1450;
const MAX_VEHICLES = 80;
const MAX_PEDESTRIANS = 140;
const MAX_REGIONS = 3;
const cache = new WeakMap();
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const STYLES = {
  finance: {
    cars: 14,
    people: 24,
    colors: ['#798a99', '#aaaead', '#566977'],
    specs: ['taxi', 'taxi', 'sedan', 'sports'],
  },
  industrial: {
    cars: 9,
    people: 9,
    colors: ['#6e7c78', '#838579', '#b2916e'],
    specs: ['van', 'van', 'van', 'sedan'],
  },
  warehouse: {
    cars: 9,
    people: 10,
    colors: ['#74776b', '#9b8c70', '#696d63'],
    specs: ['van', 'van', 'sedan'],
  },
  park: { cars: 2, people: 12, colors: ['#7d9575', '#899779', '#bdad86'], specs: ['sedan'] },
  island: { cars: 0, people: 7, colors: ['#9b9c85', '#8c987f', '#b7ab93'], specs: ['sedan'] },
  airport: {
    cars: 12,
    people: 9,
    colors: ['#87979b', '#7d8788', '#c5b880'],
    specs: ['taxi', 'taxi', 'van', 'sedan'],
  },
  nightlife: {
    cars: 10,
    people: 24,
    colors: ['#8d8990', '#999187', '#a48087'],
    specs: ['taxi', 'sports', 'sedan'],
  },
  coastal: {
    cars: 6,
    people: 12,
    colors: ['#a4947c', '#8e9985', '#8097a0'],
    specs: ['sedan', 'sports'],
  },
  housing: {
    cars: 8,
    people: 20,
    colors: ['#888c7d', '#9a8c75', '#a9a598'],
    specs: ['sedan', 'sedan', 'taxi'],
  },
  default: {
    cars: 8,
    people: 17,
    colors: ['#968877', '#7a8b94', '#8f947f'],
    specs: ['sedan', 'taxi', 'van'],
  },
};

function invalid(reason) {
  throw new Error(`Invalid ambient city state: ${reason}.`);
}
function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}
function hash(seed, text) {
  let result = (2166136261 ^ seed) >>> 0;
  for (const c of text) result = Math.imul(result ^ c.charCodeAt(0), 16777619) >>> 0;
  return result;
}
function generator(seed) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
function inside(p, r, padding = 0) {
  return (
    p.x >= r.x - padding &&
    p.x <= r.x + r.w + padding &&
    p.y >= r.y - padding &&
    p.y <= r.y + r.h + padding
  );
}
function boxDistance(p, r) {
  return Math.hypot(p.x - clamp(p.x, r.x, r.x + r.w), p.y - clamp(p.y, r.y, r.y + r.h));
}
function geometry(world) {
  if (cache.has(world)) return cache.get(world);
  if (!world || typeof world !== 'object' || !Array.isArray(world.neighbourhoods ?? []))
    invalid('world regions');
  const regions = [...(world.neighbourhoods ?? [])]
    .map((item) => ({ ...item, bounds: { ...(item.bounds ?? item) } }))
    .sort((a, b) => compare(a.id, b.id));
  const ids = new Set();
  for (const region of regions) {
    if (
      typeof region.id !== 'string' ||
      !region.id.length ||
      region.id.length > 128 ||
      ids.has(region.id) ||
      ['__proto__', 'constructor', 'prototype'].includes(region.id)
    )
      invalid('region IDs');
    ids.add(region.id);
  }
  const roads = [...(world.roads ?? [])]
    .filter(
      (road) =>
        !road.bridge &&
        !road.tunnel &&
        (road.z ?? 0) === 0 &&
        (road.z1 ?? 0) === 0 &&
        (road.z2 ?? 0) === 0,
    )
    .map((road) => ({
      ...road,
      access: [...(road.access ?? ['foot', 'car'])],
      bounds: {
        x: Math.min(road.x1, road.x2) - road.width / 2,
        y: Math.min(road.y1, road.y2) - road.width / 2,
        w: Math.abs(road.x2 - road.x1) + road.width,
        h: Math.abs(road.y2 - road.y1) + road.width,
      },
    }))
    .sort((a, b) => compare(a.id, b.id));
  const result = {
    regions,
    byId: new Map(regions.map((region) => [region.id, region])),
    regionIndex: createSpatialIndex(regions, { getBounds: (region) => region.bounds }),
    roadIndex: createSpatialIndex(roads, { getBounds: (road) => road.bounds }),
    protectedBounds: world.legacy?.protectedBounds ? { ...world.legacy.protectedBounds } : null,
    terrain: null,
  };
  cache.set(world, result);
  return result;
}
function stateShape(state) {
  if (
    !state ||
    !state.player ||
    !finite(state.player.x) ||
    !finite(state.player.y) ||
    !Array.isArray(state.vehicles) ||
    !Array.isArray(state.pedestrians)
  )
    invalid('active actors/player');
}

/** Initialize metadata only. Existing prologue actors are never tagged or changed. */
export function initializeAmbient(state, world) {
  stateShape(state);
  const geo = geometry(world);
  if (state.ambient !== undefined) {
    validateAmbient(state, world);
    return state.ambient;
  }
  const seed = (state.initialSeed ?? state.seed ?? state.rng ?? 61) >>> 0;
  state.ambient = {
    version: 1,
    seed,
    activeRegions: [],
    regions: {},
    dormant: {},
    scanRemaining: 0,
    anchor: { x: state.player.x, y: state.player.y },
  };
  for (const region of geo.regions) {
    state.ambient.regions[region.id] = {
      id: region.id,
      seed: hash(seed, region.id),
      profile: region.profile ?? 'default',
      districtId: region.districtId ?? region.district ?? '',
      status: 'unvisited',
      generated: false,
      vehiclesGenerated: 0,
      pedestriansGenerated: 0,
    };
    state.ambient.dormant[region.id] = { vehicles: [], pedestrians: [] };
  }
  return state.ambient;
}

function clipRoad(road, box, margin) {
  const a = { x: road.x1, y: road.y1 },
    dx = road.x2 - road.x1,
    dy = road.y2 - road.y1;
  const x0 = box.x + margin,
    x1 = box.x + box.w - margin,
    y0 = box.y + margin,
    y1 = box.y + box.h - margin;
  if (x0 >= x1 || y0 >= y1 || !Math.hypot(dx, dy)) return null;
  let start = 0,
    end = 1;
  for (const [position, delta, low, high] of [
    [a.x, dx, x0, x1],
    [a.y, dy, y0, y1],
  ]) {
    if (!delta) {
      if (position < low || position > high) return null;
      continue;
    }
    let s = (low - position) / delta,
      e = (high - position) / delta;
    if (s > e) [s, e] = [e, s];
    start = Math.max(start, s);
    end = Math.min(end, e);
  }
  if (start >= end) return null;
  return {
    a: { x: a.x + dx * start, y: a.y + dy * start },
    b: { x: a.x + dx * end, y: a.y + dy * end },
  };
}
function candidateRoute(road, region, kind, random) {
  const length = Math.hypot(road.x2 - road.x1, road.y2 - road.y1);
  if (!length || !road.access.includes(kind === 'vehicle' ? 'car' : 'foot')) return null;
  if (kind === 'vehicle' && road.width < 28) return null;
  const direction = { x: (road.x2 - road.x1) / length, y: (road.y2 - road.y1) / length };
  const offset =
    kind === 'vehicle'
      ? Math.min(14, road.width * 0.18)
      : road.access.includes('car')
        ? road.width / 2 + 9
        : 0;
  const clipped = clipRoad(road, region.bounds, offset + (kind === 'vehicle' ? 12 : 7));
  if (!clipped) return null;
  const available = distance(clipped.a, clipped.b),
    span = Math.min(available, kind === 'vehicle' ? 360 : 160);
  if (span < (kind === 'vehicle' ? 80 : 35)) return null;
  const along = random() * (available - span),
    side = random() < 0.5 ? 1 : -1;
  const normal = { x: -direction.y, y: direction.x };
  const at = (d, lane) => ({
    x: clipped.a.x + direction.x * d + normal.x * lane,
    y: clipped.a.y + direction.y * d + normal.y * lane,
    z: 0,
    roadId: road.id,
  });
  const a = at(along, offset * side),
    b = at(along + span, offset * side);
  return kind === 'vehicle'
    ? [a, b, at(along + span, -offset * side), at(along, -offset * side)]
    : [a, b];
}
function routeIsClear(route, radius, blocked, protectedBounds) {
  for (let i = 0; i < route.length; i++) {
    const a = route[i],
      b = route[(i + 1) % route.length],
      steps = Math.max(1, Math.ceil(distance(a, b) / Math.max(1, radius * 0.6)));
    for (let j = 0; j <= steps; j++) {
      const t = j / steps,
        x = a.x + (b.x - a.x) * t,
        y = a.y + (b.y - a.y) * t;
      if (
        (protectedBounds && inside({ x, y }, protectedBounds, radius)) ||
        blocked(x, y, radius, 0)
      )
        return false;
    }
  }
  return true;
}
function generateRegion(state, world, region, geo, context) {
  const record = state.ambient.regions[region.id],
    bucket = state.ambient.dormant[region.id];
  if (record.generated) return;
  const random = generator(record.seed),
    style = STYLES[region.profile] ?? STYLES.default;
  const roads = geo.roadIndex.queryRect(region.bounds);
  const blocked = context.isBlocked ?? (geo.terrain ??= createTerrain(world)).isBlocked;
  const specKeys = context.specs
    ? Object.keys(context.specs)
        .filter((key) => key !== 'police')
        .sort(compare)
    : ['sedan', 'taxi', 'van', 'sports'];
  const weights = style.specs.filter((key) => specKeys.includes(key));
  const specs = weights.length ? weights : specKeys;
  const areaAccess = region.access ?? ['foot', 'car'];
  const plannedCars =
    areaAccess.includes('car') && specs.length
      ? Math.min(16, Math.max(0, style.cars + Math.floor(random() * 5) - 2))
      : 0;
  const plannedPeople = areaAccess.includes('foot')
    ? Math.min(28, Math.max(0, style.people + Math.floor(random() * 5) - 2))
    : 0;
  const placed = [],
    generated = { vehicles: [], pedestrians: [] };
  for (const [kind, count, radius] of [
    ['vehicle', plannedCars, 10],
    ['pedestrian', plannedPeople, 6],
  ]) {
    for (let slot = 0; slot < count && roads.length; slot++) {
      let route, position;
      for (let attempt = 0; attempt < 28; attempt++) {
        route = candidateRoute(roads[Math.floor(random() * roads.length)], region, kind, random);
        if (!route || !routeIsClear(route, radius, blocked, geo.protectedBounds)) {
          route = null;
          continue;
        }
        const t = random(),
          a = route[0],
          b = route[1];
        position = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        if (placed.some((other) => distance(position, other) < (kind === 'vehicle' ? 36 : 16))) {
          route = null;
          continue;
        }
        break;
      }
      if (!route) continue;
      const id = `ambient-${encodeURIComponent(region.id)}-${kind === 'vehicle' ? 'car' : 'person'}-${slot}`;
      const angle = Math.atan2(route[1].y - position.y, route[1].x - position.x);
      const color = style.colors[Math.floor(random() * style.colors.length)];
      const metadata = {
        id,
        ...position,
        z: 0,
        angle,
        color,
        ambientRegion: region.id,
        ambientDistrict: record.districtId,
        ambientProfile: record.profile,
        route,
        routeIndex: 1,
      };
      if (kind === 'vehicle') {
        const spec = specs[Math.floor(random() * specs.length)];
        const definition = { ...metadata, spec, kind: 'traffic' };
        const vehicle = context.createVehicle
          ? context.createVehicle(definition)
          : {
              health: context.specs?.[spec]?.health ?? 115,
              occupied: false,
              stolen: false,
              blockedTime: 0,
            };
        if (
          !vehicle ||
          typeof vehicle !== 'object' ||
          !finite(vehicle.health) ||
          vehicle.health <= 0
        )
          invalid('vehicle factory');
        Object.assign(vehicle, definition, { speed: 30 + random() * 16 });
        vehicle.occupied ??= false;
        vehicle.stolen ??= false;
        vehicle.blockedTime ??= 0;
        generated.vehicles.push(vehicle);
      } else {
        generated.pedestrians.push({
          ...metadata,
          health: 100,
          speed: 12 + random() * 8,
          homeX: position.x,
          minY: Math.min(...route.map((p) => p.y)),
          maxY: Math.max(...route.map((p) => p.y)),
          panic: 0,
        });
      }
      placed.push(position);
    }
  }
  bucket.vehicles.push(...generated.vehicles);
  bucket.pedestrians.push(...generated.pedestrians);
  record.generated = true;
  record.vehiclesGenerated = bucket.vehicles.length;
  record.pedestriansGenerated = bucket.pedestrians.length;
  record.status = bucket.vehicles.length + bucket.pedestrians.length ? 'populated' : 'empty';
}

function protectedIds(state, context) {
  const ids = new Set([state.player.vehicleId]);
  for (const values of [
    context.protectedVehicleIds,
    context.protectedActorIds,
    state.progress?.ownedVehicles,
    state.progress?.ownedVehicleIds,
    state.mission?.vehicleIds,
  ])
    if (Array.isArray(values))
      for (const value of values) ids.add(typeof value === 'string' ? value : value?.id);
  for (const field of ['vehicleId', 'vehicle', 'requiredVehicle'])
    if (state.mission?.[field]) ids.add(state.mission[field]);
  for (const report of state.policeDispatch?.reports ?? [])
    if (report.remaining > 0) ids.add(report.witnessId);
  return ids;
}
function protectedActor(actor, ids) {
  return (
    ids.has(actor.id) ||
    actor.health <= 0 ||
    actor.occupied ||
    actor.companionOccupied ||
    actor.companionSeats?.length > 0 ||
    actor.stolen ||
    actor.owned ||
    actor.playerOwned ||
    actor.mission ||
    actor.missionId ||
    actor.missionVehicle ||
    actor.policeControlled ||
    actor.spec === 'police' ||
    actor.kind === 'police' ||
    actor.reporting ||
    actor.activeWitness ||
    actor.witness ||
    actor.panic > 0
  );
}

/**
 * Stream only tagged civilians/traffic. Dormant bodies retain every field and do
 * not advance off-screen. Each region generates once using its independent seed.
 * Budgets include legacy actors; gameplay-protected bodies may exceed these soft
 * limits and are never removed to satisfy a count. Nearby bodies use hysteresis.
 * The caller moves active traffic/pedestrian routes; this module only streams.
 */
export function updateAmbient(state, world, dt, context = {}) {
  stateShape(state);
  if (!finite(dt) || dt < 0) invalid('elapsed time');
  if (
    !context ||
    typeof context !== 'object' ||
    (context.isBlocked !== undefined && typeof context.isBlocked !== 'function') ||
    (context.createVehicle !== undefined && typeof context.createVehicle !== 'function')
  )
    invalid('context');
  if (!state.ambient) initializeAmbient(state, world);
  const ambient = state.ambient,
    geo = geometry(world);
  ambient.scanRemaining = Math.max(0, ambient.scanRemaining - dt);
  if (ambient.scanRemaining > 0 && distance(state.player, ambient.anchor) < 128) return ambient;
  ambient.scanRemaining = 0.5;
  ambient.anchor = { x: state.player.x, y: state.player.y };
  const ids = protectedIds(state, context);
  for (const key of ['vehicles', 'pedestrians']) {
    const retained = [];
    for (const actor of state[key]) {
      if (
        !actor.ambientRegion ||
        distance(actor, state.player) <= RETAIN_RADIUS ||
        protectedActor(actor, ids)
      )
        retained.push(actor);
      else {
        const bucket = ambient.dormant[actor.ambientRegion];
        if (!bucket) invalid('unknown actor region');
        bucket[key].push(actor);
      }
    }
    state[key] = retained;
  }
  const nearby = geo.regionIndex
    .queryRadius(state.player.x, state.player.y, ACTIVE_RADIUS)
    .filter((region) => boxDistance(state.player, region.bounds) <= ACTIVE_RADIUS)
    .sort(
      (a, b) =>
        boxDistance(state.player, a.bounds) - boxDistance(state.player, b.bounds) ||
        compare(a.id, b.id),
    )
    .slice(0, MAX_REGIONS);
  for (const region of nearby) generateRegion(state, world, region, geo, context);
  for (const [key, limit] of [
    ['vehicles', MAX_VEHICLES],
    ['pedestrians', MAX_PEDESTRIANS],
  ]) {
    const candidates = nearby
      .flatMap((region) => ambient.dormant[region.id][key])
      .filter((actor) => distance(actor, state.player) <= ACTIVE_RADIUS)
      .sort((a, b) => distance(a, state.player) - distance(b, state.player) || compare(a.id, b.id));
    const activated = new Set(),
      activeIds = new Set(state[key].map((actor) => actor.id));
    for (const actor of candidates) {
      if (state[key].length >= limit) break;
      if (activeIds.has(actor.id)) invalid('duplicate active/dormant actor');
      state[key].push(actor);
      activeIds.add(actor.id);
      activated.add(actor.id);
    }
    for (const region of nearby)
      ambient.dormant[region.id][key] = ambient.dormant[region.id][key].filter(
        (actor) => !activated.has(actor.id),
      );
  }
  ambient.activeRegions = [
    ...new Set(
      [...state.vehicles, ...state.pedestrians].map((actor) => actor.ambientRegion).filter(Boolean),
    ),
  ].sort(compare);
  return ambient;
}

/** Validate persisted streaming records along with their active actor references. */
export function validateAmbient(state, world) {
  stateShape(state);
  const ambient = state.ambient,
    geo = geometry(world);
  if (
    !ambient ||
    ambient.version !== 1 ||
    !Number.isInteger(ambient.seed) ||
    ambient.seed < 0 ||
    ambient.seed > 0xffffffff ||
    !ambient.regions ||
    !ambient.dormant ||
    !Array.isArray(ambient.activeRegions) ||
    !finite(ambient.scanRemaining) ||
    ambient.scanRemaining < 0 ||
    ambient.scanRemaining > 0.5 ||
    !ambient.anchor ||
    !finite(ambient.anchor.x) ||
    !finite(ambient.anchor.y)
  )
    invalid('metadata');
  const expected = geo.regions.map((region) => region.id).sort(compare);
  for (const records of [ambient.regions, ambient.dormant])
    if (JSON.stringify(Object.keys(records).sort(compare)) !== JSON.stringify(expected))
      invalid('region coverage');
  if (
    new Set(ambient.activeRegions).size !== ambient.activeRegions.length ||
    ambient.activeRegions.some((id) => !geo.byId.has(id))
  )
    invalid('active regions');
  const actorIds = new Set(
    [...state.vehicles, ...state.pedestrians]
      .filter((actor) => !actor.ambientRegion)
      .map((actor) => actor.id),
  );
  const totals = new Map(expected.map((id) => [id, { vehicles: 0, pedestrians: 0 }]));
  function actorCheck(actor, key, regionId) {
    if (
      !actor ||
      typeof actor !== 'object' ||
      actor.ambientRegion !== regionId ||
      !geo.byId.has(regionId) ||
      typeof actor.id !== 'string' ||
      actorIds.has(actor.id) ||
      !finite(actor.x) ||
      !finite(actor.y) ||
      !finite(actor.z ?? 0) ||
      !finite(actor.health) ||
      actor.health < 0 ||
      actor.health > 1000 ||
      !finite(actor.angle) ||
      !finite(actor.speed) ||
      Math.abs(actor.speed) > 300 ||
      !Array.isArray(actor.route) ||
      actor.route.length < 2 ||
      actor.route.length > 20 ||
      !Number.isInteger(actor.routeIndex) ||
      actor.routeIndex < 0 ||
      actor.routeIndex >= actor.route.length ||
      actor.route.some((p) => !p || !finite(p.x) || !finite(p.y) || !finite(p.z ?? 0))
    )
      invalid('actor fields/routes');
    if (typeof actor.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(actor.color))
      invalid('actor palette');
    const limits = world.bounds ?? { left: 0, top: 0, right: world.width, bottom: world.height };
    const validPoint = (p) =>
      p.x >= limits.left && p.x <= limits.right && p.y >= limits.top && p.y <= limits.bottom;
    if (
      !validPoint(actor) ||
      actor.route.some((p) => !validPoint(p)) ||
      actor.ambientProfile !== ambient.regions[regionId]?.profile ||
      actor.ambientDistrict !== ambient.regions[regionId]?.districtId
    )
      invalid('actor geometry/metadata');
    if (
      !actor.id.startsWith(
        `ambient-${encodeURIComponent(regionId)}-${key === 'vehicles' ? 'car' : 'person'}-`,
      )
    )
      invalid('actor identity');
    if (
      key === 'vehicles' &&
      (typeof actor.spec !== 'string' ||
        !['traffic', 'parked'].includes(actor.kind) ||
        typeof actor.occupied !== 'boolean' ||
        typeof actor.stolen !== 'boolean')
    )
      invalid('vehicle fields');
    if (
      key === 'pedestrians' &&
      (!finite(actor.homeX) ||
        !finite(actor.minY) ||
        !finite(actor.maxY) ||
        actor.minY > actor.maxY ||
        !finite(actor.panic) ||
        actor.panic < 0 ||
        actor.panic > 100 ||
        actor.speed < 0 ||
        actor.speed > 100)
    )
      invalid('pedestrian fields');
    actorIds.add(actor.id);
    totals.get(regionId)[key]++;
  }
  for (const key of ['vehicles', 'pedestrians'])
    for (const actor of state[key])
      if (actor.ambientRegion) actorCheck(actor, key, actor.ambientRegion);
  for (const id of expected) {
    const record = ambient.regions[id],
      bucket = ambient.dormant[id];
    if (
      !record ||
      record.id !== id ||
      record.seed !== hash(ambient.seed, id) ||
      typeof record.generated !== 'boolean' ||
      !['unvisited', 'empty', 'populated'].includes(record.status) ||
      typeof record.profile !== 'string' ||
      typeof record.districtId !== 'string' ||
      !Number.isInteger(record.vehiclesGenerated) ||
      record.vehiclesGenerated < 0 ||
      record.vehiclesGenerated > 16 ||
      !Number.isInteger(record.pedestriansGenerated) ||
      record.pedestriansGenerated < 0 ||
      record.pedestriansGenerated > 28 ||
      !bucket ||
      !Array.isArray(bucket.vehicles) ||
      bucket.vehicles.length > 16 ||
      !Array.isArray(bucket.pedestrians) ||
      bucket.pedestrians.length > 28
    )
      invalid('region record');
    const source = geo.byId.get(id);
    if (
      record.profile !== (source.profile ?? 'default') ||
      record.districtId !== (source.districtId ?? source.district ?? '')
    )
      invalid('region metadata');
    for (const key of ['vehicles', 'pedestrians'])
      for (const actor of bucket[key]) actorCheck(actor, key, id);
    const generated = record.vehiclesGenerated + record.pedestriansGenerated;
    if (
      (!record.generated && (record.status !== 'unvisited' || generated > 0)) ||
      (record.generated && record.status !== (generated ? 'populated' : 'empty')) ||
      totals.get(id).vehicles > record.vehiclesGenerated ||
      totals.get(id).pedestrians > record.pedestriansGenerated
    )
      invalid('generation history');
  }
  const active = [
    ...new Set(
      [...state.vehicles, ...state.pedestrians].map((actor) => actor.ambientRegion).filter(Boolean),
    ),
  ].sort(compare);
  if (JSON.stringify(active) !== JSON.stringify([...ambient.activeRegions].sort(compare)))
    invalid('active region membership');
  return true;
}
