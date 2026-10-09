/**
 * Physical parent adapters for the authored campaign. No simulation import.
 * Only Night Crossing has registered handlers. Registration/callback presence
 * does not establish release verification; root must explicitly mark integrated
 * dependencies ready. Later missions remain individually authored and gated.
 *
 * Parent owns movement, companion physics, scenes, cinematics, health, calendar,
 * inventory, persistence and UI. This module observes those actual states and
 * verified transaction ledgers; it never teleports a player/actor or fabricates
 * a successful physical condition. Tick AFTER physical movement at simulation
 * frequency; tick the larger pure director separately (about 10 Hz).
 *
 * Integration:
 *   initializeCampaignRuntime(state);
 *   state.campaign ??= createCampaignDirector(); // imported by the parent
 *   const adapters = createCampaignAdapters(state, parentContext);
 *   startCampaignMission(state.campaign, 'LL-ST-001', adapters);
 *   // After vehicle/companion/cinematic/service physics: tickCampaignRuntime.
 *   // At progression cadence/input: updateCampaignDirector(state.campaign,...).
 *
 * parentContext supplies real world/terrain/bindings, explicit ready flags,
 * passenger API + its physical context, vehicle ensure/specs, room existence,
 * cinematic start/isFinished (with receipt), and service/effect handlers with
 * actual receipt verification. Snapshot capture/validate/restore are mandatory;
 * restore mutates state in place and invalidates parent rail caches. Ordinary
 * director snapshots strip only state.campaign. Save preparation instead makes
 * an isolated complete candidate; confirmSaved must verify the actual stored
 * candidate and commit its parent save ledger before runtime commits live.
 * Read runtimeView.dialogueReady/autoDialogue/choices before showing controls.
 * E acknowledges visible ride subtitles and must not also exit the vehicle.
 */
import { FIRST_ARC_MISSIONS } from './first-arc.js';
import { campaignReceiptNamespace } from './director.js';
import { findRoute, snapToRoad } from '../navigation.js';

const MISSION = 'LL-ST-001';
const FELIX = 'LL-CHAR-002';
const NADIA = 'LL-CHAR-008';
const TAXI = 'arc-arrival-taxi';
const VERSION = 1;
const EPS = 1e-6;
const authored = FIRST_ARC_MISSIONS.find((mission) => mission.id === MISSION);
const own = (value, key) => Object.hasOwn(value, key);
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const identifier = (value) =>
  typeof value === 'string' &&
  /^[a-z0-9][a-z0-9:._-]{0,127}$/i.test(value) &&
  !['constructor', 'prototype', '__proto__'].includes(value);
const point = (value) =>
  object(value) && finite(value.x) && finite(value.y) && finite(value.z ?? 0);
const sceneOf = (body) => body?.sceneId ?? null;
const playerScene = (state) => state.interior?.active?.roomId ?? state.player?.sceneId ?? null;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const accepted = (value) => value === true || (object(value) && value.ok === true);
const gate = (reason) => ({ ok: false, unmet: [reason] });
function clone(value) {
  const ancestors = new Set();
  function visit(v, depth) {
    if (depth > 100) throw Error('Campaign runtime snapshot is too deeply nested.');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (finite(v)) return v;
    if (!v || typeof v !== 'object' || ancestors.has(v))
      throw Error('Campaign runtime requires finite JSON data.');
    if (!Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v)))
      throw Error('Campaign runtime snapshot has an unsafe prototype.');
    ancestors.add(v);
    const result = Array.isArray(v) ? [] : {};
    for (const key of Object.keys(v)) {
      if (['__proto__', 'prototype', 'constructor', 'toJSON'].includes(key))
        throw Error('Unsafe campaign runtime snapshot key.');
      const d = Object.getOwnPropertyDescriptor(v, key);
      if (!own(d, 'value')) throw Error('Campaign runtime snapshot accessors are not allowed.');
      result[key] = visit(d.value, depth + 1);
    }
    if (Array.isArray(v) && result.length !== v.length)
      throw Error('Sparse campaign runtime snapshot.');
    ancestors.delete(v);
    return result;
  }
  return visit(value, 0);
}
function sync(fn, ...args) {
  if (typeof fn !== 'function') return undefined;
  const result = fn(...args);
  if (result && typeof result.then === 'function')
    throw Error('Campaign parent adapters must be synchronous.');
  return result;
}
function hash(value) {
  let result = 2166136261;
  for (const c of JSON.stringify(value))
    result = Math.imul(result ^ c.charCodeAt(0), 16777619) >>> 0;
  return result.toString(16).padStart(8, '0');
}

export const NIGHT_CROSSING_IDS = Object.freeze({
  mission: MISSION,
  felix: FELIX,
  nadia: NADIA,
  taxi: TAXI,
  home: 'dockside-rooms',
  key: 'dockside-tenancy',
  evidence: 'co-op-arrears',
});
export const NIGHT_CROSSING_CINEMATICS = Object.freeze({
  berth: 'night-crossing-berth',
  shelter: 'night-crossing-shelter',
  rest: 'night-crossing-rest',
  ambient: 'night-crossing-drill-ambient',
});
export const CAMPAIGN_RUNTIME_REGISTRY = Object.freeze({
  [MISSION]: Object.freeze({
    stages: Object.freeze(authored.stages.map((stage) => stage.id)),
    status: 'parent-integration-required',
    sourceVerification: false,
  }),
});

function blankNight() {
  return {
    route: {
      started: false,
      index: 0,
      dwell: 0,
      stops: [],
      lastSample: null,
      discontinuity: null,
      offRoadSeconds: 0,
    },
    abandonmentSeconds: 0,
    homeEntered: false,
    cinematics: { berth: null, shelter: null, ambient: null },
    services: { food: null, save: null, rest: null, wardrobe: null, evidence: null },
    pendingServices: {},
    failure: { dead: false, arrested: false },
  };
}
export function initializeCampaignRuntime(state) {
  state.campaignRuntime ??= {
    version: VERSION,
    sequence: 0,
    restoreEpoch: 0,
    active: null,
    transactions: {},
    activations: {},
    night: blankNight(),
    lastObservedTime: finite(state.time) ? state.time : 0,
    lastRestoreReason: null,
  };
  if (state.campaignRuntime.version !== VERSION)
    throw Error('Unsupported campaign runtime version.');
  return state.campaignRuntime;
}
function bindings(context) {
  return typeof context.bindings === 'function' ? sync(context.bindings) : context.bindings;
}
function binding(context, id) {
  return bindings(context)?.[id] ?? null;
}
function validTarget(target) {
  return point(target) && finite(target.radius) && target.radius > 0;
}
function near(body, target, sceneId = null) {
  return (
    point(body) &&
    validTarget(target) &&
    sceneOf(body) === sceneId &&
    Math.abs((body.z ?? 0) - (target.z ?? 0)) <= 3 &&
    distance(body, target) <= target.radius + EPS
  );
}
function home(context) {
  return binding(context, 'dockside-rooms');
}
function homeInside(state, context) {
  const room = home(context)?.roomId;
  return (
    room &&
    state.interior?.active?.roomId === room &&
    state.player.sceneId === room &&
    state.player.health > 0 &&
    !state.player.vehicleId
  );
}
function vehicle(state) {
  return state.vehicles?.find((item) => item.id === TAXI) ?? null;
}
function passenger(state, context, id = FELIX) {
  return sync(context.passengers?.companionObservation, state, id) ?? null;
}
function seated(state, context, id = FELIX) {
  const observation = passenger(state, context, id),
    seat = sync(context.passengers?.getSeat, state, id);
  const occupants = sync(context.passengers?.vehicleOccupants, state, TAXI);
  return Boolean(
    observation?.alive &&
    observation.seated &&
    observation.vehicleId === TAXI &&
    seat?.alive &&
    seat.vehicleId === TAXI &&
    Array.isArray(occupants) &&
    occupants.some(
      (entry) =>
        entry.actorId === id && entry.alive && entry.vehicleId === TAXI && entry.seat === seat.seat,
    ),
  );
}
function riding(state, context) {
  const car = vehicle(state);
  return Boolean(
    car &&
    car.spec === 'taxi' &&
    car.health > 0 &&
    sceneOf(car) === null &&
    state.player.health > 0 &&
    state.player.vehicleId === TAXI &&
    playerScene(state) === null &&
    seated(state, context),
  );
}
function stageKey(stage) {
  return FIRST_ARC_MISSIONS.flatMap((mission) =>
    mission.stages
      .filter(
        (candidate) =>
          candidate.id === stage?.id &&
          candidate.type === stage?.type &&
          JSON.stringify(candidate) === JSON.stringify(stage),
      )
      .map((candidate) => `${mission.id}:${candidate.id}`),
  );
}
function supportedStage(stage) {
  const keys = stageKey(stage);
  return keys.length === 1 && keys[0].startsWith(`${MISSION}:`);
}
function readyMap(state, context) {
  const b = binding(context, 'pier-berth'),
    h = home(context),
    f = binding(context, 'fairground'),
    d = binding(context, 'dispatch');
  const p = context.passengers;
  const passengers =
    context.ready?.passengers === true &&
    [
      'ensureNamedActor',
      'getActor',
      'getSeat',
      'vehicleOccupants',
      'requestBoard',
      'requestEscort',
      'companionObservation',
    ].every((name) => typeof p?.[name] === 'function') &&
    object(context.companionContext) &&
    typeof context.vehicles?.ensure === 'function' &&
    context.vehicles?.specs?.taxi?.seats >= 4;
  const interior =
    context.ready?.interior === true &&
    h?.ready === true &&
    h.roomId === 'dockside-rooms' &&
    identifier(h.portalId) &&
    sync(context.interiors?.hasRoom, h.roomId) === true;
  const cinematic =
    context.ready?.cinematic === true &&
    typeof context.cinematics?.start === 'function' &&
    typeof context.cinematics?.isFinished === 'function' &&
    b?.ready === true &&
    validTarget(b.reunion || b.target) &&
    point(b.actorSpawns?.felix) &&
    point(b.taxiSpawn);
  const services = context.services;
  const hooks = ['food', 'save', 'rest', 'wardrobe', 'evidence'].every(
    (kind) =>
      services?.ready?.[kind] === true &&
      validTarget(h?.hooks?.[kind]) &&
      identifier(h.hooks[kind].id),
  );
  const callbacks =
    ['food', 'rest', 'wardrobe', 'evidence'].every(
      (kind) => typeof services?.handlers?.[kind] === 'function',
    ) &&
    ['verifyReceipt', 'getReceipt', 'cancel', 'calendarHours', 'prepareSave', 'confirmSaved'].every(
      (name) => typeof services?.[name] === 'function',
    );
  const snapshots = ['capture', 'validate', 'restore'].every(
    (name) => typeof context.snapshots?.[name] === 'function',
  );
  const effectHandlers =
    [...actions].every((kind) => typeof context.effects?.handlers?.[kind] === 'function') &&
    typeof context.effects?.verifyReceipt === 'function';
  const shelter =
    context.ready?.shelter === true &&
    interior &&
    passengers &&
    cinematic &&
    hooks &&
    callbacks &&
    snapshots &&
    effectHandlers &&
    Array.isArray(context.world?.roads) &&
    validTarget(f?.target) &&
    validTarget(d?.target) &&
    point(h.actorSpawns?.nadia) &&
    point(h.felixTarget) &&
    validParking(h.parkingBay) &&
    typeof context.terrain?.isBlocked === 'function' &&
    typeof context.observations?.playerArrested === 'function';
  return { passengers, interior, cinematic, shelter };
}
function validParking(bay) {
  return point(bay) && finite(bay.w) && bay.w > 0 && finite(bay.h) && bay.h > 0;
}
function parked(state, context) {
  const car = vehicle(state),
    bay = home(context)?.parkingBay,
    spec = context.vehicles?.specs?.taxi;
  if (
    !car ||
    car.health <= 0 ||
    sceneOf(car) !== null ||
    !validParking(bay) ||
    !finite(spec?.length) ||
    !finite(spec?.width) ||
    Math.abs(car.speed || 0) >= (bay.speedBelow ?? 2) ||
    Math.abs((car.z || 0) - (bay.z || 0)) > 3
  )
    return false;
  const c = Math.cos(car.angle || 0),
    s = Math.sin(car.angle || 0);
  for (const along of [-spec.length / 2, spec.length / 2])
    for (const across of [-spec.width / 2, spec.width / 2]) {
      const x = car.x + c * along - s * across,
        y = car.y + s * along + c * across;
      if (x < bay.x || x > bay.x + bay.w || y < bay.y || y > bay.y + bay.h) return false;
    }
  if (finite(bay.angle) && finite(bay.angleTolerance)) {
    const difference = Math.abs(
      Math.atan2(
        Math.sin(2 * ((car.angle || 0) - bay.angle)),
        Math.cos(2 * ((car.angle || 0) - bay.angle)),
      ) / 2,
    );
    if (difference > bay.angleTolerance) return false;
  }
  return true;
}
function scope(state) {
  const a = initializeCampaignRuntime(state).active;
  return a
    ? {
        missionId: a.missionId,
        stageId: a.stageId,
        attempt: a.attempt,
        activationReceipt: a.receipt,
      }
    : null;
}
function token(state, suffix) {
  const a = initializeCampaignRuntime(state).active;
  return `cr:${a?.missionId || MISSION}:${a?.attempt || 1}:${suffix}`;
}
function startCinematic(state, kind, context, extra = {}) {
  const model = initializeCampaignRuntime(state),
    id = NIGHT_CROSSING_CINEMATICS[kind];
  if (model.night.cinematics[kind]) return { ok: true };
  const receipt = token(state, `cinematic:${kind}`);
  const result = sync(context.cinematics?.start, state, id, {
    id,
    receipt,
    missionId: MISSION,
    stageId: model.active?.stageId,
    bindings: clone(bindings(context)),
    ...extra,
  });
  if (!accepted(result)) return gate(`cinematic-not-started:${kind}`);
  model.night.cinematics[kind] = { id, receipt };
  return { ok: true };
}
function cinematicFinished(state, kind, context) {
  const record = state.campaignRuntime?.night.cinematics[kind];
  return Boolean(
    record && sync(context.cinematics?.isFinished, state, record.id, record.receipt) === true,
  );
}
function ensureCast(state, context) {
  const b = binding(context, 'pier-berth'),
    h = home(context),
    p = context.passengers;
  for (const definition of [
    { id: FELIX, name: 'Felix Voss', castId: 'felix-voss', ...b.actorSpawns.felix, health: 100 },
    {
      id: NADIA,
      name: 'Nadia Sol',
      castId: 'nadia-sol',
      ...h.actorSpawns.nadia,
      sceneId: h.roomId,
      health: 100,
    },
    ...(b.actorSpawns.workers || []).map((worker, index) => ({
      ...worker,
      name: worker.name || (index === 0 ? 'Ferry steward' : 'Pier worker'),
    })),
  ]) {
    const result = sync(p.ensureNamedActor, state, definition, context.companionContext);
    if (!result || result.ok === false || !sync(p.getActor, state, definition.id))
      return gate(`actor-not-available:${definition.id}`);
  }
  if (!vehicle(state)) {
    const result = sync(context.vehicles.ensure, state, {
      id: TAXI,
      spec: 'taxi',
      seats: 4,
      owned: true,
      ownership: 'cooperative',
      kind: 'mission',
      color: '#dfb447',
      ...b.taxiSpawn,
    });
    if (!accepted(result) && !vehicle(state)) return gate('arrival-taxi-not-created');
  }
  return vehicle(state) ? { ok: true } : gate('arrival-taxi-missing');
}
function activateStage(state, stage, request, context) {
  if (request.missionId !== MISSION || !supportedStage(stage))
    return gate(`unregistered-stage:${request.missionId}:${stage.id}`);
  if (Object.values(readyMap(state, context)).some((ready) => !ready))
    return gate('night-crossing-dependencies-not-integrated');
  const model = initializeCampaignRuntime(state);
  if (own(model.activations, request.receipt)) return { ok: true, replayed: true };
  if (stage.id === 'berth' && request.reason === 'start') {
    model.night = blankNight();
    model.lastObservedTime = state.time;
  }
  model.active = {
    missionId: MISSION,
    stageId: stage.id,
    attempt: request.attempt,
    receipt: request.receipt,
    startedAt: state.time,
    phase: 'running',
    blocked: null,
  };
  const cast = ensureCast(state, context);
  if (!cast.ok) return cast;
  if (stage.id === 'berth') {
    const b = binding(context, 'pier-berth');
    const arrivalSpawn = { ...b.playerSpawn, radius: 30 };
    if (
      !near(state.player, b.reunionTarget || b.reunion || b.target, null) &&
      !near(state.player, arrivalSpawn, null)
    )
      return gate('arrival-player-not-at-physical-arrival');
    const started = startCinematic(state, 'berth', context, { duffel: b.duffel || null });
    if (!started.ok) return started;
  }
  if (stage.id === 'drill') {
    const b = binding(context, 'pier-berth'),
      f = binding(context, 'fairground'),
      d = binding(context, 'dispatch');
    const routes = [
      [b.taxiSpawn, f.target],
      [f.target, d.target],
    ].map(([from, to]) => findRoute(context.world, from, to, { mode: 'car', includeZ: true }));
    if (routes.some((route) => route.length < 2)) return gate('arrival-road-route-unavailable');
  }
  model.activations[request.receipt] = {
    missionId: MISSION,
    stageId: stage.id,
    attempt: request.attempt,
    time: state.time,
  };
  return { ok: true };
}
function routeTick(state, elapsed, context) {
  const n = state.campaignRuntime.night,
    car = vehicle(state),
    r = n.route;
  if (!riding(state, context)) {
    r.dwell = 0;
    r.lastSample = null;
    return;
  }
  const start = { ...binding(context, 'pier-berth').taxiSpawn, radius: 45 };
  if (!r.started) {
    if (!near(car, start, null)) return;
    r.started = true;
    r.index = 1;
    r.stops.push({ id: 'pier-berth', time: state.time, vehicleId: TAXI, passenger: FELIX });
  }
  if (r.lastSample && elapsed > 0) {
    const max = (context.vehicles.specs.taxi.maxSpeed || 145) * elapsed + 32;
    if (distance(car, r.lastSample) > max || Math.abs((car.z || 0) - r.lastSample.z) > max)
      r.discontinuity = { at: state.time, distance: distance(car, r.lastSample) };
  }
  r.lastSample = { x: car.x, y: car.y, z: car.z || 0, time: state.time };
  const road = snapToRoad(context.world, car, { mode: 'car', includeZ: true });
  if (!road || road.distance > 55) r.offRoadSeconds += elapsed;
  const target = binding(context, r.index === 1 ? 'fairground' : 'dispatch')?.target;
  if (r.index === 1) {
    if (near(car, target, null) && Math.abs(car.speed || 0) < 5) r.dwell += elapsed;
    else r.dwell = 0;
    if (r.dwell + EPS >= 2) {
      r.stops.push({
        id: 'fairground',
        time: state.time,
        stoppedSeconds: r.dwell,
        vehicleId: TAXI,
        passenger: FELIX,
      });
      r.index = 2;
      r.dwell = 0;
    }
  } else if (r.index === 2 && near(car, target, null) && Math.abs(car.speed || 0) < 5) {
    r.stops.push({ id: 'dispatch', time: state.time, vehicleId: TAXI, passenger: FELIX });
    r.index = 3;
  }
}
function serviceSafe(state, context, kind) {
  if (!homeInside(state, context) || state.player.health <= 0) return false;
  if (
    kind === 'rest' &&
    (state.wanted?.level > 0 || sync(context.observations?.inCombat, state) === true)
  )
    return false;
  return true;
}
function verifiedService(state, receipt, context) {
  return (
    object(receipt) &&
    identifier(receipt.id) &&
    receipt.status === 'committed' &&
    sync(context.services?.verifyReceipt, state, receipt) === true
  );
}
function pollServices(state, context) {
  const n = state.campaignRuntime.night;
  for (const [kind, pending] of Object.entries(n.pendingServices)) {
    if (!serviceSafe(state, context, kind)) {
      sync(context.services.cancel, state, pending.receipt, 'physical-interruption');
      delete n.pendingServices[kind];
      continue;
    }
    const receipt = sync(context.services.getReceipt, state, pending.receipt.id);
    if (!receipt) continue;
    if (receipt.status === 'cancelled') {
      delete n.pendingServices[kind];
      continue;
    }
    if (!verifiedService(state, receipt, context)) continue;
    if (
      kind === 'rest' &&
      (receipt.hours !== 6 ||
        sync(context.services.calendarHours, state) + EPS < pending.calendarBefore + 6)
    )
      continue;
    n.services[kind] = {
      ...clone(receipt),
      scope: clone(pending.scope),
      calendarBefore: pending.calendarBefore,
    };
    state.campaignRuntime.transactions[receipt.id] = {
      kind,
      receipt: clone(receipt),
      scope: clone(pending.scope),
    };
    state.campaignRuntime.sequence++;
    delete n.pendingServices[kind];
  }
}
export function tickCampaignRuntime(state, dt, context) {
  const model = initializeCampaignRuntime(state),
    a = model.active;
  if (!finite(dt) || dt < 0 || dt > 0.5)
    throw Error('Invalid campaign physical observation timestep.');
  if (!a || a.missionId !== MISSION || a.phase !== 'running') return model;
  a.blocked = null;
  const delta = finite(state.time) ? state.time - model.lastObservedTime : 0;
  const elapsed = delta > 0 ? Math.min(dt, delta) : 0;
  model.lastObservedTime = state.time;
  const n = model.night;
  n.failure.dead ||= state.player.health <= 0 || (state.respawnTimer || 0) > 0;
  n.failure.arrested ||= sync(context.observations?.playerArrested, state, a.startedAt) === true;
  const observation = passenger(state, context);
  if (observation?.alive) {
    const separated =
      observation.sceneId !== playerScene(state) || distance(observation, state.player) > 150;
    n.abandonmentSeconds =
      !seated(state, context) && separated ? n.abandonmentSeconds + elapsed : 0;
  }
  if (['taxi', 'drill'].includes(a.stageId)) {
    if (observation?.alive && !seated(state, context) && observation.reservedVehicleId !== TAXI)
      sync(context.passengers.requestBoard, state, FELIX, TAXI, context.companionContext);
    routeTick(state, elapsed, context);
  }
  if (a.stageId === 'shelter') {
    if (
      !n.cinematics.shelter &&
      parked(state, context) &&
      !state.player.vehicleId &&
      observation?.alive
    )
      sync(
        context.passengers.requestEscort,
        state,
        FELIX,
        home(context).felixTarget,
        context.companionContext,
      );
    const nadia = passenger(state, context, NADIA);
    if (homeInside(state, context)) n.homeEntered = true;
    if (
      homeInside(state, context) &&
      observation?.alive &&
      observation.sceneId === home(context).roomId &&
      near(observation, home(context).felixTarget, home(context).roomId) &&
      nadia?.alive &&
      nadia.sceneId === home(context).roomId
    ) {
      const result = startCinematic(state, 'shelter', context);
      if (!result.ok) a.blocked = result.unmet[0];
    }
  }
  if (a.stageId === 'drill' && n.route.index >= 2 && !n.cinematics.ambient) {
    const stage = authored.stages.find((entry) => entry.id === 'drill');
    const result = startCinematic(state, 'ambient', context, {
      kind: 'ambient-dialogue',
      lines: stage.ambient,
    });
    if (!result.ok) a.blocked = result.unmet[0];
  }
  pollServices(state, context);
  return model;
}

function capturePhysical(state, context) {
  const raw = sync(context.snapshots?.capture, state, { exclude: ['campaign'] });
  if (!object(raw)) throw Error('Parent must capture a complete physical world object.');
  const result = clone(
    Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'campaign')),
  );
  const required = Object.keys(state).filter((key) => key !== 'campaign');
  if (required.some((key) => !own(result, key)))
    throw Error('Parent checkpoint omitted physical state.');
  if (sync(context.snapshots?.validate, result) !== true)
    throw Error('Parent physical snapshot failed validation.');
  validateCampaignRuntime(result);
  return result;
}
function restorePhysical(state, snapshot, context, reason) {
  if (
    !object(snapshot) ||
    own(snapshot, 'campaign') ||
    sync(context.snapshots?.validate, snapshot) !== true
  )
    return gate('invalid-physical-campaign-snapshot');
  validateCampaignRuntime(snapshot);
  const director = state.campaign,
    beforeEpoch = state.campaignRuntime?.restoreEpoch || 0;
  const result = sync(context.snapshots?.restore, state, clone(snapshot), {
    reason,
    preserve: ['campaign'],
    invalidateRailDispatcher: true,
  });
  if (!accepted(result)) return gate('parent-physical-restore-declined');
  if (director !== undefined) state.campaign = director;
  const model = initializeCampaignRuntime(state);
  model.restoreEpoch = Math.max(beforeEpoch, model.restoreEpoch) + 1;
  model.lastObservedTime = state.time;
  model.lastRestoreReason = reason;
  return { ok: true };
}
function atomic(state, context, reason, operation) {
  const before = capturePhysical(state, context);
  try {
    const result = operation();
    if (result.ok) return result;
    const restored = restorePhysical(state, before, context, `rollback:${reason}`);
    if (!restored.ok) throw Error('Parent campaign transaction rollback failed.');
    return result;
  } catch (error) {
    const restored = restorePhysical(state, before, context, `rollback:${reason}`);
    if (!restored.ok) throw Error(`Parent campaign rollback failed after ${error.message}`);
    throw error;
  }
}
function hookAvailable(state, context, kind) {
  const hook = home(context)?.hooks?.[kind];
  return (
    serviceSafe(state, context, kind) &&
    near(state.player, hook, home(context).roomId) &&
    sync(context.services?.canUse, state, kind, hook) !== false
  );
}
export function performCampaignService(state, kind, context, options = {}) {
  const model = initializeCampaignRuntime(state),
    a = model.active;
  if (
    !a ||
    a.phase !== 'running' ||
    a.missionId !== MISSION ||
    !['shelter', 'rest'].includes(a.stageId) ||
    !['food', 'save', 'rest', 'wardrobe', 'evidence'].includes(kind)
  )
    return gate('campaign-service-not-available');
  if (!readyMap(state, context).shelter) return gate('shelter-dependencies-not-integrated');
  if (!hookAvailable(state, context, kind)) return gate('physical-shelter-hook-not-in-reach');
  if (kind === 'save') return { ok: true, type: 'save-request', requiresPrepareCommit: true };
  if (model.night.services[kind])
    return { ok: true, replayed: true, receipt: clone(model.night.services[kind]) };
  if (model.night.pendingServices[kind])
    return { ok: true, pending: true, receipt: clone(model.night.pendingServices[kind].receipt) };
  if (kind === 'rest' && (!model.night.services.food || !model.night.services.save))
    return gate('eat-and-confirm-shelter-save-before-rest');
  if (
    context.services?.ready?.[kind] !== true ||
    typeof context.services.handlers?.[kind] !== 'function'
  )
    return gate(`unintegrated-shelter-service:${kind}`);
  return atomic(state, context, `service:${kind}`, () => {
    const request = {
      ...clone(options),
      id: token(state, `service:${kind}`),
      kind,
      hookId: home(context).hooks[kind].id,
      roomId: home(context).roomId,
      hours: kind === 'rest' ? 6 : 0,
      scope: scope(state),
    };
    const calendarBefore = sync(context.services.calendarHours, state);
    const result = sync(context.services.handlers[kind], state, request);
    if (
      !accepted(result) ||
      !object(result.receipt) ||
      result.receipt.id !== request.id ||
      result.receipt.kind !== kind
    )
      return gate(`shelter-service-declined:${kind}`);
    if (
      result.pending ||
      result.receipt.status === 'pending' ||
      !verifiedService(state, result.receipt, context)
    ) {
      model.night.pendingServices[kind] = {
        receipt: clone(result.receipt),
        scope: scope(state),
        calendarBefore: finite(calendarBefore) ? calendarBefore : 0,
      };
      model.sequence++;
      return { ok: true, pending: true, receipt: clone(result.receipt) };
    }
    if (
      kind === 'rest' &&
      (result.receipt.hours !== 6 ||
        sync(context.services.calendarHours, state) + EPS < calendarBefore + 6)
    )
      return gate('six-hours-of-actual-calendar-rest-not-observed');
    model.night.services[kind] = {
      ...clone(result.receipt),
      scope: scope(state),
      calendarBefore: finite(calendarBefore) ? calendarBefore : 0,
    };
    model.transactions[request.id] = { kind, receipt: clone(result.receipt), scope: scope(state) };
    model.sequence++;
    return { ok: true, receipt: clone(result.receipt), type: result.type || 'service' };
  });
}

/** Prepare is isolated: a failed storage write never puts a save fact live. */
export function prepareCampaignSave(state, context) {
  const model = initializeCampaignRuntime(state);
  if (!readyMap(state, context).shelter) return gate('shelter-dependencies-not-integrated');
  if (
    model.active?.missionId !== MISSION ||
    model.active.phase !== 'running' ||
    model.active.stageId !== 'rest' ||
    !hookAvailable(state, context, 'save')
  )
    return gate('physical-shelter-save-not-available');
  if (!model.night.services.food) return gate('eat-before-shelter-save');
  const candidate = clone(state),
    request = {
      id: token(state, 'service:save'),
      kind: 'save',
      hookId: home(context).hooks.save.id,
      roomId: home(context).roomId,
      scope: scope(state),
    };
  const result = sync(context.services?.prepareSave, candidate, request);
  if (
    !accepted(result) ||
    !object(result.receipt) ||
    result.receipt.id !== request.id ||
    result.receipt.kind !== 'save' ||
    !['committed', 'confirmed'].includes(result.receipt.status)
  )
    return gate('parent-save-candidate-not-prepared');
  candidate.campaignRuntime.night.services.save = {
    ...clone(result.receipt),
    scope: clone(request.scope),
  };
  candidate.campaignRuntime.transactions[request.id] = {
    kind: 'save',
    receipt: clone(result.receipt),
    scope: clone(request.scope),
  };
  candidate.campaignRuntime.sequence++;
  validateCampaignRuntime(candidate);
  return {
    ok: true,
    id: request.id,
    receipt: clone(result.receipt),
    candidate,
    candidateHash: hash(candidate),
    baselineHash: hash(model),
    scope: clone(request.scope),
  };
}
export function commitCampaignSave(state, prepared, storageProof, context) {
  if (
    !object(prepared) ||
    prepared.ok !== true ||
    !object(prepared.candidate) ||
    prepared.candidateHash !== hash(prepared.candidate)
  )
    return gate('invalid-campaign-save-candidate');
  if (
    hash(initializeCampaignRuntime(state)) !== prepared.baselineHash ||
    JSON.stringify(scope(state)) !== JSON.stringify(prepared.scope)
  )
    return gate('stale-campaign-save-candidate');
  if (
    sync(
      context.services?.confirmSaved,
      state,
      prepared.candidate,
      prepared.receipt,
      storageProof,
    ) !== true
  )
    return gate('actual-storage-write-not-confirmed');
  state.campaignRuntime = clone(prepared.candidate.campaignRuntime);
  return { ok: true, receipt: clone(prepared.receipt) };
}
export function rollbackCampaignSave(state, prepared) {
  return {
    ok: true,
    discarded: prepared?.id || null,
    liveSaveConfirmed: Boolean(state.campaignRuntime?.night.services.save),
  };
}

const conditions = new Set([
  'vehicle-boarded',
  'route-stops',
  'parked',
  'scene-entered',
  'food-used',
  'shelter-save-confirmed',
  'rest-completed',
  'player-dead',
  'player-arrested',
  'passenger-dead-or-abandoned',
  'actor-dead',
  'required-vehicle-destroyed',
  'choice-permitted',
]);
function observe(state, condition, request, context) {
  const model = initializeCampaignRuntime(state),
    n = model.night;
  if (request.missionId !== MISSION || !conditions.has(condition.type))
    return { unmet: `unregistered-condition:${request.missionId}:${condition.type}` };
  if (condition.type === 'player-dead')
    return n.failure.dead || state.player.health <= 0 || (state.respawnTimer || 0) > 0;
  if (condition.type === 'player-arrested')
    return (
      n.failure.arrested ||
      sync(context.observations.playerArrested, state, model.active?.startedAt) === true
    );
  if (condition.type === 'required-vehicle-destroyed')
    return Boolean(vehicle(state) && vehicle(state).health <= 0);
  if (condition.type === 'actor-dead') {
    const actor = passenger(state, context, condition.actor);
    if (!actor || typeof actor.alive !== 'boolean' || !finite(actor.health))
      return { unmet: `required-actor-observation-missing:${condition.actor}` };
    return !actor.alive || actor.health <= 0;
  }
  if (condition.type === 'passenger-dead-or-abandoned') {
    const p = passenger(state, context, condition.actor);
    return Boolean(p && (!p.alive || n.abandonmentSeconds >= condition.grace));
  }
  if (condition.type === 'vehicle-boarded')
    return (
      condition.vehicle === TAXI &&
      riding(state, context) &&
      (condition.passengers || []).every((id) => seated(state, context, id))
    );
  if (condition.type === 'route-stops' && n.route.discontinuity)
    return { unmet: 'route-observation-discontinuous' };
  if (condition.type === 'route-stops')
    return (
      !n.route.discontinuity &&
      n.route.index === 3 &&
      riding(state, context) &&
      JSON.stringify(n.route.stops.map((stop) => stop.id)) === JSON.stringify(condition.route)
    );
  if (condition.type === 'parked') return condition.vehicle === TAXI && parked(state, context);
  if (condition.type === 'scene-entered')
    return condition.scene === 'dockside-rooms' && homeInside(state, context) && n.homeEntered;
  if (condition.type === 'food-used')
    return Boolean(n.services.food && verifiedService(state, n.services.food, context));
  if (condition.type === 'shelter-save-confirmed')
    return Boolean(
      n.services.save && sync(context.services.verifyReceipt, state, n.services.save) === true,
    );
  if (condition.type === 'rest-completed')
    return Boolean(
      condition.hours === 6 &&
      n.services.rest &&
      n.services.rest.hours === 6 &&
      verifiedService(state, n.services.rest, context) &&
      sync(context.services.calendarHours, state) + EPS >= n.services.rest.calendarBefore + 6,
    );
  if (condition.type === 'choice-permitted')
    return (
      condition.choiceId === 'room-response' &&
      ['thank-nadia', 'ask-contracts'].includes(condition.optionId) &&
      homeInside(state, context) &&
      cinematicFinished(state, 'shelter', context) &&
      state.campaign?.active?.dialogue?.index >=
        (state.campaign?.active?.dialogue?.lines.length ?? Infinity) &&
      passenger(state, context, NADIA)?.alive === true
    );
  return { unmet: `unregistered-condition:${condition.type}` };
}
function completionGate(state, stage, request, context) {
  if (request.missionId !== MISSION || !supportedStage(stage))
    return { unmet: 'unregistered-physical-stage-completion' };
  const view = campaignRuntimeView(state, context);
  if (!view.dialogueReady) return false;
  if (stage.id === 'berth') return cinematicFinished(state, 'berth', context);
  if (stage.id === 'shelter')
    return (
      cinematicFinished(state, 'shelter', context) && own(request.choices || {}, 'room-response')
    );
  if (stage.id === 'drill')
    return (
      !state.campaignRuntime.night.route.discontinuity &&
      cinematicFinished(state, 'ambient', context)
    );
  return true;
}
const actions = new Set([
  'grant-key',
  'evidence-note',
  'campaign-reward',
  'mission-failed',
  'mission-abandoned',
  'mission-suspended',
  'mission-restarted',
]);
function actionScope(state, batch, request) {
  if (!batch.some((action) => action.type === 'mission-restarted')) return scope(state);
  // The real implicit-start snapshot precedes physical stage activation. A
  // restart therefore has no runtime.active yet; bind this one lifecycle effect
  // to the validated director request, not to an invented stage activation.
  const director = state.campaign,
    run =
      director?.active ||
      director?.suspended?.find(
        (entry) =>
          entry.missionId === MISSION && entry.resumeInfo?.reason === 'return-to-free-roam',
      ),
    action = batch[0];
  if (
    batch.length !== 1 ||
    action.type !== 'mission-restarted' ||
    action.missionId !== MISSION ||
    request.kind !== 'restart' ||
    request.contentId !== director?.contentId ||
    request.missionId !== MISSION ||
    request.stageId !== run?.stageId ||
    !authored.stages.some((stage) => stage.id === request.stageId) ||
    run?.missionId !== MISSION ||
    !run.checkpoints.some((entry) => entry.id === 'start') ||
    !Number.isSafeInteger(request.attempt) ||
    request.attempt !== (director.attempts[MISSION] || 0) + 1 ||
    request.receipt !==
      `campaign:${campaignReceiptNamespace(director)}:${MISSION}:attempt:${request.attempt}:restart` ||
    state.campaignRuntime.lastRestoreReason !== 'retry:start' ||
    JSON.stringify(action.preserveCompleted) !== JSON.stringify(Object.keys(director.completed)) ||
    JSON.stringify(action.preserveOnboarding) !==
      JSON.stringify(Object.keys(director.onboardingCompleted))
  )
    return null;
  return {
    missionId: request.missionId,
    stageId: request.stageId,
    attempt: request.attempt,
    activationReceipt: request.receipt,
  };
}
function applyActions(state, batch, request, context) {
  const model = initializeCampaignRuntime(state);
  if (own(model.transactions, request.receipt)) return { ok: true, replayed: true };
  if (
    request.missionId !== MISSION ||
    batch.some(
      (action) =>
        !actions.has(action.type) || typeof context.effects?.handlers?.[action.type] !== 'function',
    )
  )
    return gate('unregistered-physical-campaign-action');
  const effectScope = actionScope(state, batch, request);
  if (!effectScope) return gate('validated-physical-action-scope-unavailable');
  return atomic(state, context, 'director-actions', () => {
    if (
      batch.some((action) =>
        ['mission-failed', 'mission-abandoned', 'mission-suspended', 'mission-restarted'].includes(
          action.type,
        ),
      )
    ) {
      for (const pending of Object.values(model.night.pendingServices))
        sync(context.services.cancel, state, pending.receipt, 'campaign-interrupted');
      model.night.pendingServices = {};
    }
    const receipts = [];
    for (let index = 0; index < batch.length; index++) {
      const action = batch[index],
        id = `cr:effect:${hash(request.receipt)}:${index}`;
      const result = sync(context.effects.handlers[action.type], state, clone(action), {
        id,
        directorReceipt: request.receipt,
        scope: effectScope,
      });
      if (
        !accepted(result) ||
        !object(result.receipt) ||
        result.receipt.id !== id ||
        sync(context.effects.verifyReceipt, state, result.receipt) !== true
      )
        return gate(`physical-effect-not-committed:${action.type}`);
      receipts.push(clone(result.receipt));
    }
    model.transactions[request.receipt] = { kind: request.kind, receipts, scope: effectScope };
    if (batch.some((action) => action.type === 'mission-failed')) model.active.phase = 'failed';
    if (batch.some((action) => ['campaign-reward', 'mission-abandoned'].includes(action.type)))
      model.active.phase = 'finished';
    model.sequence++;
    return { ok: true };
  });
}
export function createCampaignAdapters(state, context) {
  initializeCampaignRuntime(state);
  return {
    get capabilities() {
      return readyMap(state, context);
    },
    supportsStage: (type, stage) => supportedStage(stage) && stage.type === type,
    activateStage: (stage, request) => activateStage(state, stage, request, context),
    supportsCondition: (type) => conditions.has(type),
    observe: (condition, request) => observe(state, condition, request, context),
    canCompleteStage: (stage, request) => completionGate(state, stage, request, context),
    supportsAction: (type) =>
      actions.has(type) && typeof context.effects?.handlers?.[type] === 'function',
    applyActions: (batch, request) => applyActions(state, batch, request, context),
    captureWorld: () => capturePhysical(state, context),
    validateWorld: (snapshot) => {
      if (!object(snapshot) || own(snapshot, 'campaign')) return false;
      try {
        validateCampaignRuntime(snapshot);
        return sync(context.snapshots?.validate, snapshot) === true;
      } catch {
        return false;
      }
    },
    restoreWorld: (snapshot, request) => restorePhysical(state, snapshot, context, request.reason),
  };
}
export function campaignRuntimeView(state, context) {
  const model = initializeCampaignRuntime(state),
    a = model.active;
  if (!a)
    return {
      active: false,
      restoreEpoch: model.restoreEpoch,
      cameraEpoch: model.restoreEpoch,
      inputEpoch: model.restoreEpoch,
      dialogueReady: false,
      autoDialogue: false,
    };
  const stage = authored.stages.find((entry) => entry.id === a.stageId),
    n = model.night;
  let dialogueReady = false,
    target = null;
  if (a.stageId === 'berth') {
    const b = binding(context, 'pier-berth');
    target = b?.reunionTarget || b?.reunion || b?.target;
    const p = passenger(state, context);
    const spawn = b?.playerSpawn && { ...b.playerSpawn, radius: 55 },
      curb = b?.taxiSpawn && { ...b.taxiSpawn, radius: 55 };
    dialogueReady = Boolean(
      n.cinematics.berth &&
      p?.alive &&
      p.sceneId === null &&
      playerScene(state) === null &&
      distance(p, state.player) < 80 &&
      (near(state.player, target, null) ||
        near(state.player, spawn, null) ||
        near(state.player, curb, null)),
    );
  }
  if (a.stageId === 'taxi') {
    target = { ...binding(context, 'pier-berth')?.taxiSpawn, radius: 30 };
    dialogueReady = riding(state, context);
  }
  if (a.stageId === 'drill') {
    target = binding(context, n.route.index <= 1 ? 'fairground' : 'dispatch')?.target;
    dialogueReady = riding(state, context);
  }
  if (a.stageId === 'shelter') {
    const h = home(context);
    target = parked(state, context)
      ? { ...h.entry, radius: 25 }
      : {
          x: h.parkingBay.x + h.parkingBay.w / 2,
          y: h.parkingBay.y + h.parkingBay.h / 2,
          z: h.parkingBay.z || 0,
          radius: 20,
        };
    dialogueReady = Boolean(homeInside(state, context) && n.cinematics.shelter);
  }
  if (a.stageId === 'rest') {
    const kind = !n.services.food ? 'food' : !n.services.save ? 'save' : 'rest';
    target = home(context)?.hooks?.[kind];
    dialogueReady = Boolean(homeInside(state, context));
  }
  if (['shelter', 'rest'].includes(a.stageId) && passenger(state, context, NADIA)?.alive !== true)
    dialogueReady = false;
  if (
    ['berth', 'shelter'].includes(a.stageId) &&
    typeof context.cinematics?.dialogueReady === 'function'
  ) {
    const record = n.cinematics[a.stageId];
    dialogueReady = Boolean(
      dialogueReady &&
      record &&
      sync(context.cinematics.dialogueReady, state, record.id, record.receipt) === true,
    );
  }
  return {
    active: a.phase === 'running',
    missionId: a.missionId,
    stageId: a.stageId,
    objective: stage?.objective || '',
    target: target ? clone(target) : null,
    requiredVehicleId: ['taxi', 'drill'].includes(a.stageId) ? TAXI : null,
    dialogueReady,
    autoDialogue: dialogueReady && ['taxi', 'drill'].includes(a.stageId),
    choices: authored.choices
      .filter((choice) => choice.stage === a.stageId)
      .map((choice) => ({
        id: choice.id,
        options: choice.options.map((option) => ({ id: option.id, text: option.text })),
      })),
    choicePending:
      a.stageId === 'shelter' && !own(state.campaign?.active?.choices || {}, 'room-response'),
    pendingServices: clone(n.pendingServices),
    services: Object.fromEntries(
      Object.entries(n.services).map(([kind, value]) => [kind, Boolean(value)]),
    ),
    route: clone(n.route),
    restoreEpoch: model.restoreEpoch,
    cameraEpoch: model.restoreEpoch,
    inputEpoch: model.restoreEpoch,
    blocked: a.blocked,
    releaseValidated: false,
  };
}

export function validateCampaignRuntime(state) {
  const m = state?.campaignRuntime;
  clone(m);
  if (
    !object(m) ||
    m.version !== VERSION ||
    !Number.isSafeInteger(m.sequence) ||
    m.sequence < 0 ||
    !Number.isSafeInteger(m.restoreEpoch) ||
    m.restoreEpoch < 0 ||
    !finite(m.lastObservedTime) ||
    !object(m.transactions) ||
    !object(m.activations) ||
    !object(m.night)
  )
    throw Error('Invalid saved campaign runtime.');
  if (Object.keys(m.transactions).length > 4096 || Object.keys(m.activations).length > 4096)
    throw Error('Campaign runtime ledger exceeds its bound.');
  const validScope = (value) =>
    object(value) &&
    value.missionId === MISSION &&
    authored.stages.some((stage) => stage.id === value.stageId) &&
    Number.isSafeInteger(value.attempt) &&
    value.attempt > 0 &&
    identifier(value.activationReceipt);
  for (const [receipt, activation] of Object.entries(m.activations))
    if (
      !identifier(receipt) ||
      !object(activation) ||
      activation.missionId !== MISSION ||
      !authored.stages.some((stage) => stage.id === activation.stageId) ||
      !Number.isSafeInteger(activation.attempt) ||
      activation.attempt < 1 ||
      !finite(activation.time)
    )
      throw Error('Invalid campaign activation receipt.');
  for (const [id, transaction] of Object.entries(m.transactions))
    if (
      !identifier(id) ||
      !object(transaction) ||
      typeof transaction.kind !== 'string' ||
      !validScope(transaction.scope) ||
      (!object(transaction.receipt) && !Array.isArray(transaction.receipts))
    )
      throw Error('Invalid campaign transaction ledger.');
  if (
    m.active &&
    (m.active.missionId !== MISSION ||
      !authored.stages.some((stage) => stage.id === m.active.stageId) ||
      !Number.isSafeInteger(m.active.attempt) ||
      m.active.attempt < 1 ||
      !identifier(m.active.receipt) ||
      !finite(m.active.startedAt) ||
      !['running', 'failed', 'finished'].includes(m.active.phase))
  )
    throw Error('Invalid physical campaign activation.');
  const n = m.night,
    r = n.route;
  if (
    !object(r) ||
    typeof r.started !== 'boolean' ||
    !Number.isInteger(r.index) ||
    r.index < 0 ||
    r.index > 3 ||
    !finite(r.dwell) ||
    r.dwell < 0 ||
    !Array.isArray(r.stops) ||
    r.stops.length > 3 ||
    !finite(r.offRoadSeconds) ||
    r.offRoadSeconds < 0 ||
    !finite(n.abandonmentSeconds) ||
    n.abandonmentSeconds < 0 ||
    typeof n.homeEntered !== 'boolean'
  )
    throw Error('Invalid saved route observations.');
  if (r.index !== r.stops.length || r.started !== r.index > 0)
    throw Error('Inconsistent route progress.');
  const order = ['pier-berth', 'fairground', 'dispatch'];
  for (let index = 0; index < r.stops.length; index++) {
    const stop = r.stops[index];
    if (
      !object(stop) ||
      stop.id !== order[index] ||
      stop.vehicleId !== TAXI ||
      stop.passenger !== FELIX ||
      !finite(stop.time) ||
      stop.time < 0 ||
      stop.time > state.time + EPS ||
      (index > 0 && stop.time < r.stops[index - 1].time) ||
      (stop.id === 'fairground' && (!finite(stop.stoppedSeconds) || stop.stoppedSeconds + EPS < 2))
    )
      throw Error('Invalid ordered physical route receipt.');
  }
  if (
    (r.lastSample !== null && !point(r.lastSample)) ||
    (r.discontinuity !== null && !object(r.discontinuity))
  )
    throw Error('Invalid route sample.');
  if (
    !object(n.services) ||
    !object(n.pendingServices) ||
    !object(n.cinematics) ||
    !object(n.failure) ||
    typeof n.failure.dead !== 'boolean' ||
    typeof n.failure.arrested !== 'boolean'
  )
    throw Error('Invalid saved campaign observations.');
  for (const [kind, receipt] of Object.entries(n.services))
    if (
      !['food', 'save', 'rest', 'wardrobe', 'evidence'].includes(kind) ||
      (receipt &&
        (!object(receipt) ||
          !identifier(receipt.id) ||
          !['committed', 'confirmed'].includes(receipt.status) ||
          receipt.kind !== kind ||
          !validScope(receipt.scope) ||
          !own(m.transactions, receipt.id) ||
          (kind === 'rest' && (receipt.hours !== 6 || !finite(receipt.calendarBefore)))))
    )
      throw Error('Invalid saved campaign service receipt.');
  for (const [kind, pending] of Object.entries(n.pendingServices))
    if (
      !['food', 'rest', 'wardrobe', 'evidence'].includes(kind) ||
      !object(pending) ||
      !identifier(pending.receipt?.id) ||
      !finite(pending.calendarBefore) ||
      pending.receipt.kind !== kind ||
      !validScope(pending.scope)
    )
      throw Error('Invalid pending campaign service.');
  if (
    Object.keys(n.cinematics).length !== 3 ||
    !['berth', 'shelter', 'ambient'].every((key) => own(n.cinematics, key))
  )
    throw Error('Unknown physical cinematic slot.');
  for (const [kind, record] of Object.entries(n.cinematics))
    if (
      record !== null &&
      (!object(record) ||
        NIGHT_CROSSING_CINEMATICS[kind] !== record.id ||
        !identifier(record.receipt))
    )
      throw Error('Invalid saved physical cinematic reference.');
  return true;
}
