/**
 * Pure rail service controller. The parent owns actors, wallets, rendering and
 * physical access/collision; no player or vehicle object is stored or mutated.
 * SYS-30 / city transport acceptance still requires live station traversal and
 * collision/camera evidence. Source policy context: post-trip fares and pursuit
 * restrictions: https://www.grandtheftwiki.com/Subway_in_GTA_IV
 */
const worlds = new WeakMap();
const transactions = new WeakSet();
const EPSILON = 1e-7;
const DEFAULTS = {
  trainsPerService: 1,
  cruiseSpeed: 90,
  acceleration: 16,
  braking: 20,
  doorSeconds: 1,
  dwellSeconds: 12,
  cars: 2,
  carLength: 32,
  couplerGap: 4,
  trainWidth: 20,
  trainHeight: 16,
  capacity: 16,
  boardingRange: 18,
  heightTolerance: 1,
  actorRadius: 7,
  // Original configurable LOWLIGHT tariff; exact source prices are not inferred.
  baseFare: 2,
  perStopFare: 1,
  freeTransferSeconds: 120,
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function invalid(reason) {
  throw new Error(`Invalid transit state: ${reason}.`);
}
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(label);
}
function number(value, label, low = 0, high = 1e12, integer = false) {
  if (
    !Number.isFinite(value) ||
    value < low ||
    value > high ||
    (integer && !Number.isSafeInteger(value))
  )
    invalid(label);
  return value;
}
function text(value, label, max = 128) {
  if (typeof value !== 'string' || !value.length || value.length > max) invalid(label);
  return value;
}
function point(value, label) {
  if (!value || typeof value !== 'object') invalid(label);
  return {
    x: number(value.x, `${label}.x`, -1e9, 1e9),
    y: number(value.y, `${label}.y`, -1e9, 1e9),
    z: number(value.z ?? 0, `${label}.z`, -1e6, 1e6),
  };
}
function array(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) invalid(label);
}
function hash(value) {
  let result = 2166136261;
  for (const ch of value) result = Math.imul(result ^ ch.charCodeAt(0), 16777619) >>> 0;
  return result.toString(16).padStart(8, '0');
}
function samePoint(a, b) {
  return distance(a, b) <= EPSILON;
}
function options(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('options');
  for (const key of Reflect.ownKeys(input)) {
    if (
      typeof key !== 'string' ||
      !Object.hasOwn(DEFAULTS, key) ||
      !Object.hasOwn(Object.getOwnPropertyDescriptor(input, key), 'value')
    )
      invalid('unknown/accessor option');
  }
  const config = { ...DEFAULTS, ...input };
  for (const [key, [low, high, integer]] of Object.entries({
    trainsPerService: [1, 4, true],
    cruiseSpeed: [1, 300],
    acceleration: [1, 200],
    braking: [1, 200],
    doorSeconds: [0.1, 10],
    dwellSeconds: [0.1, 120],
    cars: [1, 3, true],
    carLength: [10, 60],
    couplerGap: [0, 10],
    trainWidth: [8, 40],
    trainHeight: [8, 30],
    capacity: [1, 64, true],
    boardingRange: [1, 40],
    heightTolerance: [0, 3],
    actorRadius: [0.5, 15],
    baseFare: [0, 10000, true],
    perStopFare: [0, 1000, true],
    freeTransferSeconds: [0, 600],
  }))
    number(config[key], key, low, high, integer);
  return config;
}
function trainLength(config) {
  return config.cars * config.carLength + (config.cars - 1) * config.couplerGap;
}
function profile(length, config) {
  const peak = Math.min(
    config.cruiseSpeed,
    Math.sqrt(
      (2 * length * config.acceleration * config.braking) / (config.acceleration + config.braking),
    ),
  );
  const accelerationTime = peak / config.acceleration,
    brakingTime = peak / config.braking;
  const accelerationDistance = (peak * accelerationTime) / 2,
    brakingDistance = (peak * brakingTime) / 2;
  const cruiseDistance = Math.max(0, length - accelerationDistance - brakingDistance),
    cruiseTime = cruiseDistance / peak;
  return {
    peak,
    accelerationTime,
    brakingTime,
    accelerationDistance,
    cruiseDistance,
    cruiseTime,
    duration: accelerationTime + cruiseTime + brakingTime,
  };
}
function motion(elapsed, length, config) {
  const p = profile(length, config),
    t = clamp(elapsed, 0, p.duration);
  if (t < p.accelerationTime)
    return { distance: (config.acceleration * t * t) / 2, speed: config.acceleration * t };
  if (t < p.accelerationTime + p.cruiseTime)
    return { distance: p.accelerationDistance + p.peak * (t - p.accelerationTime), speed: p.peak };
  const braking = t - p.accelerationTime - p.cruiseTime;
  return {
    distance: Math.min(
      length,
      p.accelerationDistance +
        p.cruiseDistance +
        p.peak * braking -
        (config.braking * braking * braking) / 2,
    ),
    speed: Math.max(0, p.peak - config.braking * braking),
  };
}
function sample(leg, travelled) {
  const d = clamp(travelled, 0, leg.length);
  let index = leg.lengths.findIndex((end) => end >= d - EPSILON);
  if (index < 0) index = leg.lengths.length - 1;
  const start = index ? leg.lengths[index - 1] : 0,
    a = leg.points[index],
    b = leg.points[index + 1];
  const t = clamp((d - start) / (leg.lengths[index] - start), 0, 1);
  let heading = Math.atan2(b.y - a.y, b.x - a.x);
  for (let i = 0; i < leg.points.length - 2; i++) {
    const before = leg.points[i],
      turn = leg.points[i + 1],
      after = leg.points[i + 2];
    const at = leg.lengths[i],
      width = Math.min(12, distance(before, turn) / 3, distance(turn, after) / 3);
    if (d < at - width || d > at + width) continue;
    const first = Math.atan2(turn.y - before.y, turn.x - before.x),
      last = Math.atan2(after.y - turn.y, after.x - turn.x);
    const delta = Math.atan2(Math.sin(last - first), Math.cos(last - first));
    const ratio = clamp((d - at + width) / (width * 2), 0, 1),
      blend = ratio * ratio * (3 - 2 * ratio);
    heading = first + delta * blend;
    break;
  }
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, heading };
}
function swept(leg, start, end) {
  const points = [point(sample(leg, start), 'swept start')];
  leg.lengths.forEach((d, i) => {
    if (d > start + EPSILON && d < end - EPSILON) points.push({ ...leg.points[i + 1] });
  });
  points.push(point(sample(leg, end), 'swept end'));
  return points;
}

function compile(world) {
  if (!world || typeof world !== 'object' || !world.transit) invalid('world topology');
  if (worlds.has(world)) return worlds.get(world);
  const source = world.transit;
  array(source.stations, 'stations', 1, 1024);
  array(source.tracks, 'tracks', 1, 4096);
  array(source.throughServices, 'services', 1, 32);
  array(source.segments ?? [], 'segments', 0, 128);
  const stations = new Map(),
    platforms = new Map(),
    tracks = new Map(),
    segments = new Map(),
    services = new Map();
  for (const item of source.stations) {
    const id = text(item.id, 'station id');
    if (stations.has(id)) invalid('duplicate station');
    const station = { id, name: text(item.name ?? id, 'station name'), platformIds: [] };
    array(item.platforms, 'platforms', 1, 32);
    for (const itemPlatform of item.platforms) {
      const platformId = text(itemPlatform.id, 'platform id');
      if (platforms.has(platformId)) invalid('duplicate platform');
      const center = point(itemPlatform, 'platform position');
      const platform = {
        id: platformId,
        stationId: id,
        ...center,
        sourcePlatformId: itemPlatform.sourcePlatformId ?? platformId,
        heading: number(
          itemPlatform.heading ?? (itemPlatform.axis === 'north-south' ? Math.PI / 2 : 0),
          'platform heading',
          -Math.PI * 2,
          Math.PI * 2,
        ),
        length: number(itemPlatform.length, 'platform length', 1, 2000),
        width: number(itemPlatform.width, 'platform width', 1, 200),
        stopPoint: point(itemPlatform.stopPoint ?? center, 'stop point'),
        boardingPoint: point(itemPlatform.boardingPoint ?? center, 'boarding point'),
      };
      if (
        Math.abs(platform.stopPoint.z - center.z) > EPSILON ||
        Math.abs(platform.boardingPoint.z - center.z) > EPSILON
      )
        invalid('platform/stop level');
      platforms.set(platformId, platform);
      station.platformIds.push(platformId);
    }
    stations.set(id, station);
  }
  for (const item of source.tracks) {
    const id = text(item.id, 'track id');
    if (tracks.has(id)) invalid('duplicate track');
    array(item.points, 'track points', 2, 2048);
    const points = item.points
      .map((p) => point(p, 'track point'))
      .filter((p, i, all) => !i || !samePoint(p, all[i - 1]));
    if (points.length < 2) invalid('empty track');
    const from = platforms.get(item.fromPlatformId),
      to = platforms.get(item.toPlatformId);
    if (
      !from ||
      !to ||
      !samePoint(points[0], from.stopPoint) ||
      !samePoint(points.at(-1), to.stopPoint)
    )
      invalid('track/platform endpoint');
    const lengths = [];
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y) <= EPSILON)
        invalid('vertical rail teleport');
      length += distance(points[i], points[i - 1]);
      lengths.push(length);
    }
    number(length, 'track length', 1, 1e8);
    tracks.set(id, { id, fromPlatformId: from.id, toPlatformId: to.id, points, length, lengths });
  }
  for (const item of source.segments ?? []) {
    const id = text(item.id, 'segment id');
    if (segments.has(id)) invalid('duplicate segment');
    segments.set(id, {
      id,
      boundaryStationId: item.boundaryStationId,
      nextSegmentId: item.nextSegmentId,
    });
  }
  for (const item of source.throughServices) {
    const id = text(item.id, 'service id');
    if (services.has(id)) invalid('duplicate service');
    array(item.calls, 'service calls', 2, 256);
    array(item.legs, 'service legs', item.calls.length, item.calls.length);
    if (item.closedLoop !== true) invalid('service must be a closed through-circuit');
    const calls = item.calls.map((call) => {
      const platform = platforms.get(call.platformId);
      if (!platform || platform.stationId !== call.stationId) invalid('station/platform call');
      return { stationId: call.stationId, platformId: call.platformId };
    });
    const legs = item.legs.map((leg, i) => {
      const track = tracks.get(leg.trackId),
        from = calls[i].platformId,
        to = calls[(i + 1) % calls.length].platformId;
      if (
        !track ||
        leg.fromPlatformId !== from ||
        leg.toPlatformId !== to ||
        typeof leg.reverse !== 'boolean' ||
        (leg.reverse
          ? track.toPlatformId !== from || track.fromPlatformId !== to
          : track.fromPlatformId !== from || track.toPlatformId !== to)
      )
        invalid('service/track direction');
      const points = leg.reverse ? [...track.points].reverse() : [...track.points],
        lengths = [];
      let length = 0;
      for (let j = 1; j < points.length; j++) {
        length += distance(points[j], points[j - 1]);
        lengths.push(length);
      }
      return { trackId: track.id, points, lengths, length };
    });
    const segmentIds = item.segmentIds ?? [];
    if (segmentIds.some((segmentId) => !segments.has(segmentId)))
      invalid('unknown service segment');
    const segmentAtCall = calls.map((call, i) => {
      for (let offset = 0; offset < calls.length; offset++) {
        const previous = calls[(i - offset + calls.length) % calls.length];
        const boundary = segmentIds
          .map((sid) => segments.get(sid))
          .find((s) => s.boundaryStationId === previous.stationId);
        if (boundary) {
          if (!segmentIds.includes(boundary.nextSegmentId)) invalid('segment handoff');
          return boundary.nextSegmentId;
        }
      }
      return segmentIds[0] ?? null;
    });
    services.set(id, {
      id,
      name: text(item.name ?? id, 'service name'),
      calls,
      legs,
      segmentIds: [...segmentIds],
      segmentAtCall,
    });
  }
  const fingerprint = hash(
    JSON.stringify({
      platforms: [...platforms.values()].sort((a, b) => compare(a.id, b.id)),
      services: [...services.values()].sort((a, b) => compare(a.id, b.id)),
    }),
  );
  const result = { stations, platforms, tracks, services, fingerprint };
  worlds.set(world, result);
  return result;
}

function observer(state, context, callback, data, passenger = null) {
  if (typeof context[callback] !== 'function') return;
  try {
    const accepted = context[callback](clone(data));
    if (passenger && accepted === false) throw new Error('Rider sync declined');
    if (passenger) passenger.syncPending = false;
  } catch (error) {
    if (passenger) passenger.syncPending = true;
    state.callbackErrors.push({
      time: state.time,
      callback,
      message: String(error?.message ?? error).slice(0, 512) || 'Callback failed',
    });
    state.callbackErrors = state.callbackErrors.slice(-32);
  }
}
function event(state, context, kind, data) {
  const record = { id: ++state.eventSequence, time: state.time, kind, data: clone(data) };
  state.events.push(record);
  state.events = state.events.slice(-128);
  observer(state, context, 'onEvent', record);
}
function trainView(train) {
  return {
    id: train.id,
    serviceId: train.serviceId,
    callIndex: train.callIndex,
    visits: train.visits,
    circuits: train.circuits,
    distance: train.distance,
    legElapsed: train.legElapsed,
    phase: train.phase,
    doorProgress: train.doorProgress,
    x: train.x,
    y: train.y,
    z: train.z,
    heading: train.heading,
    speed: train.speed,
    segmentId: train.segmentId,
  };
}
function policy(context, name, data) {
  if (context[name] === undefined) return true;
  if (typeof context[name] !== 'function') invalid(`${name} callback`);
  const result = context[name](clone(data));
  if (typeof result !== 'boolean') invalid(`${name} must return a synchronous boolean`);
  return result;
}
function currentCall(train, topology) {
  return topology.services.get(train.serviceId).calls[train.callIndex];
}
function setStoppedPose(train, topology) {
  const call = currentCall(train, topology),
    platform = topology.platforms.get(call.platformId);
  const service = topology.services.get(train.serviceId);
  Object.assign(train, platform.stopPoint, {
    heading: sample(service.legs[train.callIndex], 0).heading,
    speed: 0,
    distance: 0,
    legElapsed: 0,
  });
}

export function createTransit(world, input = {}) {
  const topology = compile(world),
    config = options(input);
  const state = {
    version: 1,
    topology: topology.fingerprint,
    config,
    time: 0,
    trains: [],
    passengers: [],
    tickets: [],
    ledger: [],
    transactionSequence: 0,
    events: [],
    eventSequence: 0,
    callbackErrors: [],
    stats: {
      boardings: 0,
      alightings: 0,
      transfers: 0,
      missedStops: 0,
      recoveries: 0,
      fareAccrued: 0,
      farePaid: 0,
      fareOwed: 0,
      fareWaived: 0,
    },
  };
  for (const service of [...topology.services.values()].sort((a, b) => compare(a.id, b.id))) {
    for (let i = 0; i < config.trainsPerService; i++) {
      const callIndex = Math.floor((i * service.calls.length) / config.trainsPerService);
      const train = {
        id: `rail-${service.id}-${i}`,
        serviceId: service.id,
        ordinal: i,
        callIndex,
        segmentId: service.segmentAtCall[callIndex],
        phase: 'opening',
        phaseRemaining: config.doorSeconds,
        doorProgress: 0,
        legElapsed: 0,
        distance: 0,
        speed: 0,
        x: 0,
        y: 0,
        z: 0,
        heading: 0,
        visits: 0,
        circuits: 0,
        passengerIds: [],
        blockedReason: null,
      };
      setStoppedPose(train, topology);
      state.trains.push(train);
    }
  }
  return state;
}

function arrival(state, train, topology, context) {
  const service = topology.services.get(train.serviceId),
    previous = train.segmentId;
  train.callIndex = (train.callIndex + 1) % service.calls.length;
  train.visits++;
  if (!train.callIndex) train.circuits++;
  train.segmentId = service.segmentAtCall[train.callIndex];
  setStoppedPose(train, topology);
  train.phase = 'opening';
  train.phaseRemaining = state.config.doorSeconds;
  train.doorProgress = 0;
  const call = currentCall(train, topology);
  for (const passenger of state.passengers.filter((rider) => rider.trainId === train.id)) {
    passenger.stopsTravelled++;
    if (passenger.destination?.platformId === call.platformId) passenger.arrivalPending = true;
  }
  event(state, context, 'arrival', { trainId: train.id, ...call, visits: train.visits });
  if (previous !== train.segmentId)
    event(state, context, 'handoff', { trainId: train.id, from: previous, to: train.segmentId });
  if (!policy(context, 'canStop', { train: trainView(train), call })) {
    markMissed(state, train, context, 'stop-closed');
    train.phase = 'moving';
    train.phaseRemaining = 0;
    train.doorProgress = 0;
    event(state, context, 'stop-skipped', { trainId: train.id, ...call });
  }
}
function markMissed(state, train, context, reason) {
  for (const passenger of state.passengers.filter(
    (rider) => rider.trainId === train.id && rider.arrivalPending,
  )) {
    passenger.arrivalPending = false;
    passenger.missedStops++;
    passenger.lastMiss = reason;
    state.stats.missedStops++;
    event(state, context, 'missed-stop', {
      passengerId: passenger.id,
      trainId: train.id,
      destination: passenger.destination,
      reason,
    });
  }
}

/** Analytical acceleration/cruise/braking, real polyline movement, timed doors/stops. */
export function updateTransit(state, world, dt, context = {}) {
  number(dt, 'elapsed time', 0, 3600);
  const topology = compile(world);
  if (state?.version !== 1 || state.topology !== topology.fingerprint)
    invalid('world/version mismatch');
  if (!context || typeof context !== 'object') invalid('context');
  const endTime = number(state.time + dt, 'clock');
  state.trains.sort((a, b) => compare(a.id, b.id));
  let transitions = 0;
  while (endTime - state.time > 0) {
    if (++transitions > 1000000) invalid('too many timetable transitions');
    let used = endTime - state.time;
    for (const train of state.trains) {
      const call = currentCall(train, topology);
      if (
        train.phase === 'held' &&
        policy(context, 'canDepart', { train: trainView(train), call })
      ) {
        train.phase = 'closing';
        train.phaseRemaining = state.config.doorSeconds;
        event(state, context, 'released', { trainId: train.id, ...call });
      }
      if (train.phase === 'held' || train.phase === 'blocked') used = Math.min(used, 0.1);
      if (train.phase === 'moving' || train.phase === 'blocked') {
        const leg = topology.services.get(train.serviceId).legs[train.callIndex];
        used = Math.min(used, profile(leg.length, state.config).duration - train.legElapsed);
      } else if (train.phase !== 'held') used = Math.min(used, train.phaseRemaining);
    }
    if (used <= 0) invalid('stalled timetable boundary');
    const moves = [];
    for (const train of state.trains) {
      if (train.phase === 'moving' || train.phase === 'blocked') {
        const leg = topology.services.get(train.serviceId).legs[train.callIndex];
        const advanced = Math.min(
          used,
          profile(leg.length, state.config).duration - train.legElapsed,
        );
        const next = motion(train.legElapsed + advanced, leg.length, state.config),
          path = swept(leg, train.distance, next.distance);
        if (
          !policy(context, 'canMoveTrain', {
            train: trainView(train),
            path,
            endPose: sample(leg, next.distance),
            length: trainLength(state.config),
            width: state.config.trainWidth,
            height: state.config.trainHeight,
          })
        ) {
          if (train.phase !== 'blocked')
            event(state, context, 'blocked', { trainId: train.id, trackId: leg.trackId });
          train.phase = 'blocked';
          train.speed = 0;
          train.blockedReason = 'corridor-blocked';
          continue;
        }
        if (train.phase === 'blocked') event(state, context, 'resumed', { trainId: train.id });
        moves.push({ train, leg, advanced, next, path });
      } else if (train.phase !== 'held') {
        train.phaseRemaining = Math.max(0, train.phaseRemaining - used);
        if (train.phase === 'opening')
          train.doorProgress = 1 - train.phaseRemaining / state.config.doorSeconds;
        if (train.phase === 'closing')
          train.doorProgress = train.phaseRemaining / state.config.doorSeconds;
      }
    }
    state.time += used;
    for (const { train, leg, advanced, next } of moves) {
      train.phase = 'moving';
      train.blockedReason = null;
      train.legElapsed += advanced;
      train.distance = next.distance;
      train.speed = next.speed;
      Object.assign(train, sample(leg, next.distance));
    }
    for (const { train, path } of moves) {
      observer(state, context, 'onTrainMove', { train: trainView(train), path });
    }
    // All train positions now share one time. Same-time callbacks use stable IDs.
    for (const train of state.trains) {
      const call = currentCall(train, topology),
        service = topology.services.get(train.serviceId);
      if (train.phase === 'moving') {
        if (
          train.legElapsed >=
          profile(service.legs[train.callIndex].length, state.config).duration - EPSILON
        )
          arrival(state, train, topology, context);
      } else if (
        train.phase !== 'held' &&
        train.phase !== 'blocked' &&
        train.phaseRemaining <= EPSILON
      ) {
        if (train.phase === 'opening') {
          train.phase = 'dwelling';
          train.phaseRemaining = state.config.dwellSeconds;
          train.doorProgress = 1;
          event(state, context, 'doors-open', { trainId: train.id, ...call });
          for (const passenger of state.passengers.filter(
            (rider) => rider.trainId === train.id && rider.arrivalPending,
          ))
            observer(state, context, 'onRequestedStop', {
              passengerId: passenger.id,
              trainId: train.id,
              ...call,
            });
        } else if (train.phase === 'dwelling') {
          if (!policy(context, 'canDepart', { train: trainView(train), call })) {
            train.phase = 'held';
            train.phaseRemaining = 0;
            event(state, context, 'held', { trainId: train.id, ...call });
          } else {
            train.phase = 'closing';
            train.phaseRemaining = state.config.doorSeconds;
          }
        } else if (train.phase === 'closing') {
          if (!policy(context, 'canDepart', { train: trainView(train), call })) {
            train.phase = 'opening';
            train.phaseRemaining = state.config.doorSeconds;
            train.doorProgress = 0;
          } else {
            markMissed(state, train, context, 'doors-closed');
            train.phase = 'moving';
            train.phaseRemaining = 0;
            train.doorProgress = 0;
            event(state, context, 'departure', { trainId: train.id, ...call });
          }
        } else invalid('train phase');
      }
    }
  }
  state.time = endTime;
  for (const passenger of state.passengers)
    observer(
      state,
      context,
      'onRide',
      { passengerId: passenger.id, pose: getTransitPassengerPose(state, passenger.id) },
      passenger,
    );
  return state;
}

function platformContains(platform, position, radius) {
  const dx = position.x - platform.x,
    dy = position.y - platform.y,
    cos = Math.cos(platform.heading),
    sin = Math.sin(platform.heading);
  return (
    Math.abs(dx * cos + dy * sin) + radius <= platform.length / 2 + EPSILON &&
    Math.abs(-dx * sin + dy * cos) + radius <= platform.width / 2 + EPSILON
  );
}
function closestDoor(state, train, position) {
  const cos = Math.cos(train.heading),
    sin = Math.sin(train.heading);
  const side = -(position.x - train.x) * sin + (position.y - train.y) * cos >= 0 ? 1 : -1;
  let closest = null;
  for (let car = 0; car < state.config.cars; car++) {
    const center =
      (car - (state.config.cars - 1) / 2) * (state.config.carLength + state.config.couplerGap);
    // Two side doors per authored car; the coupler is not a boarding door.
    for (const offset of [-0.35, 0.35]) {
      const along = center + state.config.carLength * offset;
      const door = {
        x: train.x + cos * along - (sin * side * state.config.trainWidth) / 2,
        y: train.y + sin * along + (cos * side * state.config.trainWidth) / 2,
        z: train.z,
      };
      const range = distance(position, door);
      if (!closest || range < closest.distance) closest = { ...door, distance: range, car };
    }
  }
  return closest;
}
function nearDoor(state, train, platform, position, radius) {
  if (!platformContains(platform, position, radius)) return 'outside-platform';
  if (trainLength(state.config) > platform.length + EPSILON) return 'platform-too-short';
  if (
    Math.abs(position.z - platform.z) > state.config.heightTolerance ||
    Math.abs(train.z - platform.z) > EPSILON
  )
    return 'wrong-height';
  if (Math.abs(Math.sin(train.heading - platform.heading)) > 0.15) return 'platform-alignment';
  const cos = Math.cos(train.heading),
    sin = Math.sin(train.heading),
    dx = position.x - train.x,
    dy = position.y - train.y;
  const along = dx * cos + dy * sin,
    lateral = -dx * sin + dy * cos;
  const nearestAlong = clamp(along, -trainLength(state.config) / 2, trainLength(state.config) / 2);
  const nearestLateral = clamp(lateral, -state.config.trainWidth / 2, state.config.trainWidth / 2);
  if (Math.hypot(along - nearestAlong, lateral - nearestLateral) < radius - EPSILON)
    return 'inside-train-footprint';
  if (closestDoor(state, train, position).distance > state.config.boardingRange + EPSILON)
    return 'door-out-of-range';
  return null;
}
function openDoors(train) {
  return (train.phase === 'dwelling' || train.phase === 'held') && train.doorProgress === 1;
}
function resolveDestination(service, topology, train, destination) {
  if (!destination) return null;
  text(destination.stationId, 'destination station');
  for (let offset = 1; offset <= service.calls.length; offset++) {
    const callIndex = (train.callIndex + offset) % service.calls.length,
      call = service.calls[callIndex],
      platform = topology.platforms.get(call.platformId);
    if (
      call.stationId === destination.stationId &&
      (!destination.platformId ||
        destination.platformId === call.platformId ||
        destination.platformId === platform.sourcePlatformId)
    )
      return { ...call, callIndex };
  }
  return null;
}
function fare(state, passenger) {
  if (passenger.freeTransfer || !passenger.stopsTravelled) return 0;
  return number(
    state.config.baseFare + Math.max(0, passenger.stopsTravelled - 1) * state.config.perStopFare,
    'fare',
    0,
    1e9,
    true,
  );
}
export function quoteTransitFare(state, passengerId) {
  const passenger = state.passengers.find((item) => item.id === passengerId);
  return passenger
    ? {
        amount: fare(state, passenger),
        stopsTravelled: passenger.stopsTravelled,
        freeTransfer: passenger.freeTransfer,
      }
    : null;
}
function receipt(value, amount) {
  if (value === true) return { approved: true, paid: amount, owed: 0, waived: 0 };
  if (value === false || value?.approved === false)
    return { approved: false, paid: 0, owed: 0, waived: 0 };
  if (!value || value.approved !== true) invalid('transaction receipt');
  for (const key of ['paid', 'owed', 'waived'])
    number(value[key], `receipt ${key}`, 0, amount, true);
  if (value.paid + value.owed + value.waived !== amount) invalid('unaccounted fare');
  return { approved: true, paid: value.paid, owed: value.owed, waived: value.waived };
}
function restoreInPlace(state, before, sequence) {
  // Keep fleet objects/array alive for same-time timetable callbacks that refuse
  // an exit. Replacing them would leave the running controller with stale refs.
  const trains = state.trains,
    live = new Map(trains.map((train) => [train.id, train]));
  const restored = before.trains.map((saved) => {
    const train = live.get(saved.id) ?? {};
    for (const key of Object.keys(train)) delete train[key];
    Object.assign(train, saved);
    return train;
  });
  trains.splice(0, trains.length, ...restored);
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, before, { trains, transactionSequence: sequence });
}
function transact(state, context, request, change) {
  if (typeof context.transact !== 'function')
    return { ok: false, reason: 'transaction-authority-required' };
  if (transactions.has(state)) invalid('nested transaction');
  transactions.add(state);
  const before = clone(state),
    sequence = ++state.transactionSequence;
  const transaction = { id: `rail-tx-${sequence}`, time: state.time, ...request };
  let active = true,
    applied = false,
    accepted = false;
  try {
    const value = context.transact(clone(transaction), () => {
      if (!active || applied) invalid('transaction apply is expired or repeated');
      applied = true;
      accepted = change();
      return accepted;
    });
    active = false;
    const settlement = receipt(value, request.amount);
    if (!settlement.approved || !applied || !accepted) {
      restoreInPlace(state, before, sequence);
      return { ok: false, reason: 'transaction-declined' };
    }
    state.ledger.push({ ...transaction, ...settlement });
    state.ledger = state.ledger.slice(-256);
    if (request.kind === 'fare' || request.kind === 'recovery') {
      state.stats.fareAccrued += request.amount;
      state.stats.fareOwed += settlement.owed;
    } else if (request.kind === 'debt') state.stats.fareOwed -= settlement.paid + settlement.waived;
    state.stats.farePaid += settlement.paid;
    state.stats.fareWaived += settlement.waived;
    return { ok: true, transactionId: transaction.id, receipt: settlement };
  } catch (error) {
    active = false;
    restoreInPlace(state, before, sequence);
    throw error;
  } finally {
    transactions.delete(state);
  }
}

/**
 * transact(request, apply) must synchronously authorize wallet AND actor changes,
 * call apply once, and roll back its external changes if apply fails/refuses.
 * Return true for fully paid, false for refusal, or approved paid/owed/waived sums.
 * Actor callbacks onBoard/onAlight/onRecover may return false to reject a move.
 */
export function boardTransit(state, world, request, context = {}) {
  const topology = compile(world),
    id = text(request?.passengerId, 'passenger id');
  const train = state.trains.find((item) => item.id === request.trainId);
  if (!train) return { ok: false, reason: 'unknown-train' };
  if (state.passengers.some((passenger) => passenger.id === id))
    return { ok: false, reason: 'already-aboard' };
  if (!openDoors(train)) return { ok: false, reason: 'doors-not-open' };
  if (train.passengerIds.length >= state.config.capacity)
    return { ok: false, reason: 'train-full' };
  const call = currentCall(train, topology),
    platform = topology.platforms.get(call.platformId);
  if (
    request.platformId &&
    request.platformId !== platform.id &&
    request.platformId !== platform.sourcePlatformId
  )
    return { ok: false, reason: 'wrong-platform' };
  const position = point(request.position, 'boarding position'),
    radius = number(request.radius ?? state.config.actorRadius, 'actor radius', 0.5, 15);
  const reason = nearDoor(state, train, platform, position, radius);
  if (reason) return { ok: false, reason };
  if (
    !policy(context, 'canBoard', {
      passengerId: id,
      position,
      radius,
      train: trainView(train),
      call,
    })
  )
    return { ok: false, reason: 'boarding-policy' };
  const destination = resolveDestination(
    topology.services.get(train.serviceId),
    topology,
    train,
    request.destination,
  );
  if (request.destination && !destination) return { ok: false, reason: 'destination-not-served' };
  const ticket = state.tickets.find((item) => item.passengerId === id);
  if (
    !ticket &&
    new Set([
      ...state.tickets.map((item) => item.passengerId),
      ...state.passengers.map((p) => p.id),
    ]).size >= 4096
  )
    return { ok: false, reason: 'passenger-register-full' };
  const freeTransfer =
    state.config.freeTransferSeconds > 0 &&
    !!ticket &&
    ticket.transferEligible &&
    !ticket.owed &&
    ticket.stationId === call.stationId &&
    ticket.validUntil >= state.time;
  const seat = Array.from({ length: state.config.capacity }, (_, i) => i).find(
    (i) => !state.passengers.some((p) => p.trainId === train.id && p.seat === i),
  );
  const result = transact(
    state,
    context,
    { kind: 'board', passengerId: id, trainId: train.id, ...call, amount: 0 },
    () => {
      const passenger = {
        id,
        trainId: train.id,
        seat,
        radius,
        boardedAt: state.time,
        boardedVisits: train.visits,
        stopsTravelled: 0,
        freeTransfer,
        destination,
        arrivalPending: false,
        missedStops: 0,
        lastMiss: null,
        syncPending: false,
      };
      state.passengers.push(passenger);
      train.passengerIds.push(id);
      state.stats.boardings++;
      if (freeTransfer) state.stats.transfers++;
      if (
        context.onBoard &&
        context.onBoard({
          passengerId: id,
          pose: getTransitPassengerPose(state, id),
          call: clone(call),
        }) === false
      )
        return false;
      return true;
    },
  );
  if (result.ok)
    event(state, context, 'board', { passengerId: id, trainId: train.id, ...call, freeTransfer });
  return { ...result, trainId: train.id, freeTransfer };
}

export function getTransitPassengerPose(state, passengerId) {
  const passenger = state.passengers.find((p) => p.id === passengerId);
  if (!passenger) return null;
  const train = state.trains.find((t) => t.id === passenger.trainId),
    rows = Math.ceil(state.config.capacity / 2);
  const along =
    ((Math.floor(passenger.seat / 2) + 1) / (rows + 1) - 0.5) * trainLength(state.config);
  const lateral = (passenger.seat % 2 ? 1 : -1) * state.config.trainWidth * 0.2;
  return {
    x: train.x + Math.cos(train.heading) * along - Math.sin(train.heading) * lateral,
    y: train.y + Math.sin(train.heading) * along + Math.cos(train.heading) * lateral,
    z: train.z,
    groundZ: train.z,
    heading: train.heading,
    trainId: train.id,
  };
}

export function requestTransitStop(state, world, request) {
  const passenger = state.passengers.find((p) => p.id === request?.passengerId);
  if (!passenger) return { ok: false, reason: 'not-aboard' };
  const topology = compile(world),
    train = state.trains.find((t) => t.id === passenger.trainId);
  const destination = resolveDestination(
    topology.services.get(train.serviceId),
    topology,
    train,
    request,
  );
  if (!destination) return { ok: false, reason: 'destination-not-served' };
  passenger.destination = destination;
  passenger.arrivalPending = false;
  return { ok: true, destination: clone(destination) };
}

export function alightTransit(state, world, request, context = {}) {
  const topology = compile(world),
    passenger = state.passengers.find((p) => p.id === request?.passengerId);
  if (!passenger) return { ok: false, reason: 'not-aboard' };
  const train = state.trains.find((t) => t.id === passenger.trainId),
    call = currentCall(train, topology);
  if (!openDoors(train))
    return { ok: false, reason: 'doors-not-open', recovery: 'request-next-stop' };
  const platform = topology.platforms.get(call.platformId),
    position = point(request.position ?? platform.boardingPoint, 'exit position');
  if (
    request.platformId &&
    request.platformId !== platform.id &&
    request.platformId !== platform.sourcePlatformId
  )
    return { ok: false, reason: 'wrong-platform' };
  const reason = nearDoor(state, train, platform, position, passenger.radius);
  if (reason) return { ok: false, reason };
  if (
    !policy(context, 'canAlight', {
      passengerId: passenger.id,
      position,
      radius: passenger.radius,
      train: trainView(train),
      call,
    })
  )
    return { ok: false, reason: 'exit-blocked', recovery: 'retry-or-request-next-stop' };
  const amount = fare(state, passenger);
  const result = transact(
    state,
    context,
    {
      kind: 'fare',
      passengerId: passenger.id,
      trainId: train.id,
      ...call,
      amount,
      stopsTravelled: passenger.stopsTravelled,
    },
    () => {
      if (
        context.onAlight &&
        context.onAlight({
          passengerId: passenger.id,
          position: clone(position),
          call: clone(call),
        }) === false
      )
        return false;
      train.passengerIds = train.passengerIds.filter((id) => id !== passenger.id);
      state.passengers = state.passengers.filter((p) => p.id !== passenger.id);
      state.stats.alightings++;
      return true;
    },
  );
  if (result.ok) {
    const oldTicket = state.tickets.find((ticket) => ticket.passengerId === passenger.id);
    // A zero-stop cancellation cannot mint a free ride. A free transfer keeps
    // its original expiry instead of refreshing a chain of free journeys.
    if (passenger.stopsTravelled) {
      const ticket = {
        passengerId: passenger.id,
        stationId: call.stationId,
        platformId: call.platformId,
        validUntil: passenger.freeTransfer
          ? oldTicket.validUntil
          : state.time + state.config.freeTransferSeconds,
        transferEligible: state.config.freeTransferSeconds > 0,
        transactionId: result.transactionId,
        owed: (oldTicket?.owed ?? 0) + result.receipt.owed,
      };
      state.tickets = state.tickets.filter((item) => item.passengerId !== passenger.id);
      state.tickets.push(ticket);
    }
    event(state, context, 'alight', {
      passengerId: passenger.id,
      ...call,
      amount,
      receipt: result.receipt,
    });
  }
  return { ...result, position, amount, stationId: call.stationId, platformId: call.platformId };
}

/** Parent-authorized death/disconnect recovery, never normal missed-stop teleporting. */
export function recoverTransitPassenger(state, world, request, context = {}) {
  const topology = compile(world);
  const passenger = state.passengers.find((p) => p.id === request?.passengerId);
  if (!passenger) return { ok: false, reason: 'not-aboard' };
  if (
    !['death', 'disconnect', 'world-reset'].includes(request.reason) ||
    typeof context.canRecover !== 'function' ||
    !policy(context, 'canRecover', { passengerId: passenger.id, reason: request.reason })
  )
    return { ok: false, reason: 'recovery-not-authorized' };
  const train = state.trains.find((t) => t.id === passenger.trainId),
    amount = fare(state, passenger);
  const result = transact(
    state,
    context,
    {
      kind: 'recovery',
      passengerId: passenger.id,
      trainId: train.id,
      reason: request.reason,
      amount,
    },
    () => {
      if (
        context.onRecover &&
        context.onRecover({ passengerId: passenger.id, reason: request.reason }) === false
      )
        return false;
      train.passengerIds = train.passengerIds.filter((id) => id !== passenger.id);
      state.passengers = state.passengers.filter((p) => p.id !== passenger.id);
      state.stats.recoveries++;
      return true;
    },
  );
  if (result.ok) {
    const call = currentCall(train, topology),
      old = state.tickets.find((ticket) => ticket.passengerId === passenger.id);
    state.tickets = state.tickets.filter((ticket) => ticket.passengerId !== passenger.id);
    state.tickets.push({
      passengerId: passenger.id,
      ...call,
      validUntil: 0,
      transferEligible: false,
      transactionId: result.transactionId,
      owed: (old?.owed ?? 0) + result.receipt.owed,
    });
    event(state, context, 'recovery', {
      passengerId: passenger.id,
      reason: request.reason,
      amount,
    });
  }
  return result;
}

export function settleTransitDebt(state, request, context = {}) {
  const ticket = state.tickets.find((t) => t.passengerId === request?.passengerId);
  if (!ticket?.owed) return { ok: false, reason: 'no-debt' };
  const amount = ticket.owed;
  const result = transact(
    state,
    context,
    { kind: 'debt', passengerId: ticket.passengerId, amount },
    () => true,
  );
  if (result.ok) ticket.owed = result.receipt.owed;
  return result;
}

export function getTransitDoors(state, world, request) {
  const topology = compile(world),
    position = point(request.position, 'door query position');
  const radius = number(request.radius ?? state.config.actorRadius, 'actor radius', 0.5, 15);
  return state.trains
    .filter(openDoors)
    .flatMap((train) => {
      const call = currentCall(train, topology),
        platform = topology.platforms.get(call.platformId);
      const door = closestDoor(state, train, position);
      return nearDoor(state, train, platform, position, radius)
        ? []
        : [
            {
              trainId: train.id,
              serviceId: train.serviceId,
              serviceName: topology.services.get(train.serviceId).name,
              stationId: call.stationId,
              stationName: topology.stations.get(call.stationId).name,
              platformId: call.platformId,
              sourcePlatformId: platform.sourcePlatformId,
              x: door.x,
              y: door.y,
              z: door.z,
              boardingPoint: { ...platform.boardingPoint },
              distance: door.distance,
              full: train.passengerIds.length >= state.config.capacity,
            },
          ];
    })
    .sort((a, b) => a.distance - b.distance || compare(a.trainId, b.trainId));
}

function safeClone(value) {
  let nodes = 0;
  const ancestors = new Set();
  function copy(item, depth) {
    if (++nodes > 150000 || depth > 24) invalid('oversized/deep save');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'number')
      return number(
        item,
        'non-finite save value',
        -Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
      );
    if (typeof item === 'string') {
      if (item.length > 2048) invalid('save text');
      return item;
    }
    if (!item || typeof item !== 'object' || ancestors.has(item)) invalid('non-JSON/cyclic save');
    const prototype = Object.getPrototypeOf(item);
    if (
      Array.isArray(item)
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null
    )
      invalid('save prototype');
    ancestors.add(item);
    const result = Array.isArray(item) ? [] : {};
    if (Array.isArray(item) && item.length > 4096) invalid('save array size');
    const descriptors = Object.getOwnPropertyDescriptors(item),
      keys = Reflect.ownKeys(descriptors);
    if (keys.length > (Array.isArray(item) ? 4097 : 128)) invalid('save fields');
    for (const key of keys) {
      if (Array.isArray(item) && key === 'length') continue;
      const descriptor = descriptors[key];
      if (
        typeof key !== 'string' ||
        ['__proto__', 'constructor', 'prototype'].includes(key) ||
        !descriptor.enumerable ||
        !Object.hasOwn(descriptor, 'value') ||
        descriptor.value === undefined
      )
        invalid('unsafe save property');
      if (Array.isArray(item) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length))
        invalid('save array property');
      result[key] = copy(descriptor.value, depth + 1);
    }
    if (Array.isArray(item) && Object.keys(result).length !== item.length)
      invalid('sparse save array');
    ancestors.delete(item);
    return result;
  }
  return copy(value, 0);
}

export function validateTransit(value, world) {
  const state = safeClone(value),
    topology = compile(world);
  object(state, 'save root');
  object(state.config, 'saved config');
  const config = options(state.config);
  if (Object.keys(state.config).length !== Object.keys(DEFAULTS).length)
    invalid('incomplete saved config');
  if (state.version !== 1 || state.topology !== topology.fingerprint)
    invalid('save topology/version');
  number(state.time, 'clock');
  number(state.transactionSequence, 'transaction sequence', 0, 1e12, true);
  array(
    state.trains,
    'saved fleet',
    topology.services.size * config.trainsPerService,
    topology.services.size * config.trainsPerService,
  );
  const trainIds = new Set(),
    passengerIds = new Set();
  for (const train of state.trains) {
    object(train, 'saved train');
    const service = topology.services.get(train.serviceId);
    if (!service) invalid('saved service');
    number(train.ordinal, 'train ordinal', 0, config.trainsPerService - 1, true);
    if (train.id !== `rail-${train.serviceId}-${train.ordinal}` || trainIds.has(train.id))
      invalid('saved train identity');
    trainIds.add(train.id);
    number(train.callIndex, 'call index', 0, service.calls.length - 1, true);
    if (train.segmentId !== service.segmentAtCall[train.callIndex]) invalid('saved handoff label');
    if (!['opening', 'dwelling', 'closing', 'moving', 'held', 'blocked'].includes(train.phase))
      invalid('saved train phase');
    number(train.visits, 'visit count', 0, 1e12, true);
    number(train.circuits, 'circuit count', 0, train.visits, true);
    const initial = Math.floor((train.ordinal * service.calls.length) / config.trainsPerService);
    if (
      train.callIndex !== (initial + train.visits) % service.calls.length ||
      train.circuits !== Math.floor((initial + train.visits) / service.calls.length)
    )
      invalid('call/circuit progression');
    array(train.passengerIds, 'train passengers', 0, config.capacity);
    if (new Set(train.passengerIds).size !== train.passengerIds.length)
      invalid('duplicate train passenger');
    point(train, 'saved train pose');
    number(train.heading, 'heading', -Math.PI * 2, Math.PI * 2);
    number(train.speed, 'speed', 0, config.cruiseSpeed);
    number(train.distance, 'distance');
    number(train.legElapsed, 'leg time');
    number(train.doorProgress, 'door progress', 0, 1);
    number(train.phaseRemaining, 'phase remaining', 0, 120);
    const moving = train.phase === 'moving' || train.phase === 'blocked';
    if (moving) {
      const leg = service.legs[train.callIndex],
        duration = profile(leg.length, config).duration;
      if (
        train.legElapsed >= duration + EPSILON ||
        train.distance > leg.length + EPSILON ||
        train.doorProgress !== 0 ||
        train.phaseRemaining !== 0
      )
        invalid('moving train fields');
      const expected = motion(train.legElapsed, leg.length, config),
        pose = sample(leg, expected.distance);
      if (
        Math.abs(train.distance - expected.distance) > EPSILON ||
        !samePoint(train, pose) ||
        Math.abs(
          Math.atan2(
            Math.sin(train.heading - pose.heading),
            Math.cos(train.heading - pose.heading),
          ),
        ) > EPSILON ||
        Math.abs(train.speed - (train.phase === 'blocked' ? 0 : expected.speed)) > EPSILON
      )
        invalid('moving pose/profile');
      if (train.blockedReason !== (train.phase === 'blocked' ? 'corridor-blocked' : null))
        invalid('blocked state');
    } else {
      const platform = topology.platforms.get(currentCall(train, topology).platformId);
      if (
        !samePoint(train, platform.stopPoint) ||
        train.speed !== 0 ||
        train.distance !== 0 ||
        train.legElapsed !== 0 ||
        train.blockedReason !== null
      )
        invalid('stopped pose');
      const heading = sample(service.legs[train.callIndex], 0).heading;
      if (
        Math.abs(Math.atan2(Math.sin(train.heading - heading), Math.cos(train.heading - heading))) >
        EPSILON
      )
        invalid('stopped heading');
      const remaining =
        train.phase === 'dwelling'
          ? config.dwellSeconds
          : train.phase === 'held'
            ? 0
            : config.doorSeconds;
      if (train.phaseRemaining > remaining || (train.phase !== 'held' && train.phaseRemaining <= 0))
        invalid('stop timer');
      const door =
        train.phase === 'opening'
          ? 1 - train.phaseRemaining / config.doorSeconds
          : train.phase === 'closing'
            ? train.phaseRemaining / config.doorSeconds
            : 1;
      if (Math.abs(train.doorProgress - door) > EPSILON) invalid('stop doors');
    }
  }
  array(state.passengers, 'passengers', 0, state.trains.length * config.capacity);
  array(state.tickets, 'tickets', 0, 4096);
  const seats = new Set();
  for (const passenger of state.passengers) {
    object(passenger, 'saved passenger');
    text(passenger.id, 'passenger id');
    if (passengerIds.has(passenger.id)) invalid('duplicate passenger');
    passengerIds.add(passenger.id);
    const train = state.trains.find((t) => t.id === passenger.trainId);
    if (!train || !train.passengerIds.includes(passenger.id)) invalid('passenger/train link');
    number(passenger.seat, 'seat', 0, config.capacity - 1, true);
    const key = `${train.id}:${passenger.seat}`;
    if (seats.has(key)) invalid('duplicate seat');
    seats.add(key);
    number(passenger.radius, 'passenger radius', 0.5, 15);
    number(passenger.boardedAt, 'boarding time', 0, state.time);
    number(passenger.boardedVisits, 'boarding visit', 0, train.visits, true);
    number(passenger.stopsTravelled, 'stops travelled', 0, train.visits, true);
    if (passenger.stopsTravelled !== train.visits - passenger.boardedVisits)
      invalid('ride progression');
    number(passenger.missedStops, 'missed stops', 0, passenger.stopsTravelled, true);
    for (const key of ['freeTransfer', 'arrivalPending', 'syncPending'])
      if (typeof passenger[key] !== 'boolean') invalid('passenger flags');
    if (passenger.freeTransfer) {
      const ticket = state.tickets.find((t) => t?.passengerId === passenger.id),
        service = topology.services.get(train.serviceId);
      const initial = Math.floor((train.ordinal * service.calls.length) / config.trainsPerService);
      const boardedCall = service.calls[(initial + passenger.boardedVisits) % service.calls.length];
      if (
        !ticket ||
        !ticket.transferEligible ||
        ticket.owed ||
        ticket.stationId !== boardedCall.stationId ||
        ticket.validUntil < passenger.boardedAt
      )
        invalid('unearned transfer');
    }
    if (
      passenger.lastMiss !== null &&
      !['doors-closed', 'stop-closed'].includes(passenger.lastMiss)
    )
      invalid('miss reason');
    if (passenger.destination !== null) {
      const service = topology.services.get(train.serviceId),
        destination = passenger.destination;
      number(destination.callIndex, 'destination index', 0, service.calls.length - 1, true);
      const call = service.calls[destination.callIndex];
      if (call.stationId !== destination.stationId || call.platformId !== destination.platformId)
        invalid('destination call');
    }
    if (
      passenger.arrivalPending &&
      (!passenger.destination ||
        passenger.destination.platformId !== currentCall(train, topology).platformId ||
        (train.phase !== 'opening' && !openDoors(train) && train.phase !== 'closing'))
    )
      invalid('pending arrival');
  }
  for (const train of state.trains)
    if (train.passengerIds.some((id) => !passengerIds.has(id))) invalid('orphan train passenger');
  array(state.tickets, 'tickets', 0, 4096);
  const ticketIds = new Set();
  for (const ticket of state.tickets) {
    object(ticket, 'saved ticket');
    text(ticket.passengerId, 'ticket passenger');
    if (ticketIds.has(ticket.passengerId)) invalid('duplicate ticket');
    ticketIds.add(ticket.passengerId);
    if (
      !topology.platforms.has(ticket.platformId) ||
      topology.platforms.get(ticket.platformId).stationId !== ticket.stationId
    )
      invalid('ticket platform');
    number(ticket.validUntil, 'ticket expiry', 0, state.time + config.freeTransferSeconds);
    if (
      typeof ticket.transferEligible !== 'boolean' ||
      (ticket.transferEligible && !config.freeTransferSeconds)
    )
      invalid('ticket transfer policy');
    number(ticket.owed, 'ticket debt', 0, 1e9, true);
    text(ticket.transactionId, 'ticket transaction');
    const transactionId = Number(/^rail-tx-(\d+)$/.exec(ticket.transactionId)?.[1]);
    number(transactionId, 'ticket transaction reference', 1, state.transactionSequence, true);
  }
  array(state.ledger, 'fare ledger', 0, 256);
  let lastTransaction = 0;
  for (const transaction of state.ledger) {
    object(transaction, 'saved transaction');
    const id = Number(/^rail-tx-(\d+)$/.exec(transaction.id)?.[1]);
    number(id, 'ledger id', lastTransaction + 1, state.transactionSequence, true);
    lastTransaction = id;
    if (!['board', 'fare', 'recovery', 'debt'].includes(transaction.kind)) invalid('ledger kind');
    text(transaction.passengerId, 'ledger passenger');
    number(transaction.time, 'ledger time', 0, state.time);
    number(transaction.amount, 'ledger amount', 0, 1e9, true);
    if (!receipt(transaction, transaction.amount).approved) invalid('unapproved saved transaction');
    if (transaction.kind === 'board' && transaction.amount !== 0) invalid('board fare timing');
    if (transaction.kind === 'board' || transaction.kind === 'fare') {
      const platform = topology.platforms.get(transaction.platformId);
      if (
        !platform ||
        platform.stationId !== transaction.stationId ||
        !trainIds.has(transaction.trainId)
      )
        invalid('transaction station/train');
      if (transaction.kind === 'fare')
        number(transaction.stopsTravelled, 'fare stop count', 0, 1e12, true);
    }
  }
  for (const key of Object.keys(createTransit(world, config).stats))
    number(state.stats?.[key], `statistics ${key}`, 0, 1e12, true);
  if (
    state.stats.boardings !==
      state.passengers.length + state.stats.alightings + state.stats.recoveries ||
    state.stats.transfers > state.stats.boardings ||
    state.stats.missedStops <
      state.passengers.reduce((total, passenger) => total + passenger.missedStops, 0)
  )
    invalid('passenger statistics');
  if (
    state.stats.fareAccrued !==
      state.stats.farePaid + state.stats.fareOwed + state.stats.fareWaived ||
    state.stats.fareOwed !== state.tickets.reduce((total, ticket) => total + ticket.owed, 0)
  )
    invalid('fare accounting');
  if (
    state.stats.farePaid < state.ledger.reduce((total, tx) => total + tx.paid, 0) ||
    state.stats.fareWaived < state.ledger.reduce((total, tx) => total + tx.waived, 0) ||
    state.stats.fareAccrued <
      state.ledger.reduce(
        (total, tx) => total + (tx.kind === 'fare' || tx.kind === 'recovery' ? tx.amount : 0),
        0,
      )
  )
    invalid('retained fare ledger');
  array(state.events, 'events', 0, 128);
  number(state.eventSequence, 'event sequence', 0, 1e12, true);
  let lastEvent = 0;
  for (const record of state.events) {
    object(record, 'saved event');
    number(record.id, 'event id', lastEvent + 1, state.eventSequence, true);
    lastEvent = record.id;
    number(record.time, 'event time', 0, state.time);
    text(record.kind, 'event kind');
    if (!record.data || typeof record.data !== 'object' || Array.isArray(record.data))
      invalid('event data');
  }
  if (lastEvent !== state.eventSequence) invalid('event tail');
  array(state.callbackErrors, 'callback errors', 0, 32);
  for (const failure of state.callbackErrors) {
    object(failure, 'callback failure');
    number(failure.time, 'callback error time', 0, state.time);
    text(failure.callback, 'callback error kind');
    text(failure.message, 'callback error message', 512);
  }
  return true;
}

export function restoreTransit(serializedOrObject, world) {
  let value = serializedOrObject;
  if (typeof value === 'string') {
    if (value.length > 8 * 1024 * 1024) invalid('serialized save size');
    try {
      value = JSON.parse(value);
    } catch {
      invalid('malformed JSON');
    }
  }
  const restored = safeClone(value);
  validateTransit(restored, world);
  return restored;
}
