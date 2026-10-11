/**
 * Late Meter physical director adapter, isolated review work. No simulation import.
 * Every stage observes actual parent bodies/vehicles/doors/phone/driver physics.
 * Published first-arc remains untouched; safety authoring/migration and missing
 * NPC-driver, damage, recognition and nonmodal-phone bindings remain hard gates.
 */
import { FIRST_ARC_MISSIONS } from './first-arc.js';
import { findRoute } from '../navigation.js';

const SOURCE = FIRST_ARC_MISSIONS.find((mission) => mission.id === 'LL-ST-002');
export const LATE_METER_IDS = Object.freeze({
  mission: 'LL-ST-002',
  felix: 'LL-CHAR-002',
  yara: 'LL-ARC-YARA',
  reeve: 'LL-ARC-REEVE',
  watcher: 'holt-collector-watch',
  pursuer: 'holt-tow-sedan',
  evidence: 'duplicate-impound-invoices',
});
const I = LATE_METER_IDS,
  EPS = 1e-6,
  VERSION = 1;
const own = (v, k) => Object.hasOwn(v, k);
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const id = (v) =>
  typeof v === 'string' &&
  /^[a-z0-9][a-z0-9:._-]{0,255}$/i.test(v) &&
  !['__proto__', 'prototype', 'constructor', 'toJSON'].includes(v);
const point = (p) => object(p) && finite(p.x) && finite(p.y) && finite(p.z ?? 0);
const scene = (p) => p?.sceneId ?? null;
const playerScene = (state) => state.interior?.active?.roomId ?? scene(state.player);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleError = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const gate = (reason) => ({ ok: false, unmet: [reason] });
const accepted = (v) => v === true || (object(v) && v.ok === true);
function copy(value) {
  const ancestors = new Set();
  function visit(v, depth = 0) {
    if (depth > 100) throw Error('Late Meter JSON is too deeply nested.');
    if (v === null || typeof v === 'string' || typeof v === 'boolean' || finite(v)) return v;
    if (!v || typeof v !== 'object' || ancestors.has(v))
      throw Error('Late Meter requires finite acyclic JSON.');
    if (!Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v)))
      throw Error('Unsafe Late Meter prototype.');
    ancestors.add(v);
    const result = Array.isArray(v) ? [] : {};
    for (const key of Object.keys(v)) {
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      if (
        ['__proto__', 'prototype', 'constructor', 'toJSON'].includes(key) ||
        !own(descriptor, 'value')
      )
        throw Error('Unsafe Late Meter JSON property.');
      result[key] = visit(descriptor.value, depth + 1);
    }
    if (Array.isArray(v) && result.length !== v.length) throw Error('Sparse Late Meter array.');
    ancestors.delete(v);
    return result;
  }
  return visit(value);
}
function sync(fn, ...args) {
  if (typeof fn !== 'function') return undefined;
  const result = fn(...args);
  if (result && typeof result.then === 'function')
    throw Error('Late Meter parent callbacks must be synchronous.');
  return result;
}
function hash(value) {
  let h = 2166136261;
  for (const c of JSON.stringify(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h.toString(16).padStart(8, '0');
}
const mission = (parent) => parent.authoredMission || SOURCE;
const bindings = (parent) =>
  typeof parent.bindings === 'function' ? sync(parent.bindings) : parent.bindings;
const annex = (parent) => bindings(parent)?.['impound-counter'];
const dispatch = (parent) => bindings(parent)?.dispatch;
const actor = (state, parent, actorId) =>
  sync(parent.passengers?.companionObservation, state, actorId) ?? null;
const body = (state, parent, actorId) => sync(parent.passengers?.getActor, state, actorId) ?? null;
const ride = (state) =>
  state.vehicles?.find((vehicle) => vehicle.id === state.lateMeterRuntime?.run.rideId) ?? null;
const pursuer = (state) => state.vehicles?.find((vehicle) => vehicle.id === I.pursuer) ?? null;
const near = (p, target, expectedScene = target?.sceneId ?? null) =>
  point(p) &&
  point(target) &&
  scene(p) === expectedScene &&
  Math.abs((p.z || 0) - (target.z || 0)) <= 3 &&
  distance(p, target) <= (target.radius ?? 8) + EPS;
function freshRun() {
  return {
    rideId: null,
    startedAt: null,
    counterTrip: {
      boardedAt: null,
      pickupPose: null,
      distance: 0,
      lastPose: null,
    },
    parkedSeconds: 0,
    counterDelivered: null,
    recognition: null,
    lookoutExchange: null,
    approachStartedAt: null,
    doorReachedAt: null,
    warning: { callId: null, owner: null, delivered: null, method: null },
    pursuit: {
      started: false,
      startedAt: null,
      observedOnce: false,
      driverId: null,
      lastSeen: null,
      lastSeenAt: null,
      unseenSeconds: 0,
      escape: null,
      route: [],
      routeIndex: 0,
      lastPlanAt: null,
      lastVehiclePose: null,
      resolution: null,
    },
    returned: null,
    abandonmentSeconds: 0,
    playerDead: false,
    playerArrested: false,
    protectedHarm: null,
    preWarningAttack: null,
    damageEvents: [],
    attackEvents: [],
    damageCheckedAt: 0,
    attackCheckedAt: 0,
    attackUnmet: false,
    itineraries: {},
  };
}
export function initializeLateMeterRuntime(state) {
  if (!finite(state.time) || state.time < 0)
    throw Error('Late Meter requires the real simulation clock.');
  state.lateMeterRuntime ??= {
    version: VERSION,
    sequence: 0,
    restoreEpoch: 0,
    lastObservedTime: state.time,
    lastRestoreReason: null,
    active: null,
    activations: {},
    transactions: {},
    preparation: { leg: 0, started: false, ready: false },
    run: freshRun(),
  };
  if (state.lateMeterRuntime.version !== VERSION) throw Error('Unsupported Late Meter runtime.');
  return state.lateMeterRuntime;
}
function scope(state) {
  const a = initializeLateMeterRuntime(state).active;
  return a
    ? {
        missionId: a.missionId,
        stageId: a.stageId,
        attempt: a.attempt,
        activationReceipt: a.receipt,
      }
    : null;
}
function supportedStage(stage, parent) {
  return (
    mission(parent).id === I.mission &&
    mission(parent).stages.some(
      (entry) => entry.id === stage.id && JSON.stringify(entry) === JSON.stringify(stage),
    )
  );
}
function hasSafetyRule(parent) {
  return mission(parent).failures.some(
    (failure) =>
      failure.condition.type === 'protected-target-harmed' &&
      failure.condition.actors?.includes(I.yara) &&
      failure.condition.groups?.includes('police') &&
      failure.condition.requiresPlayerAttribution === true &&
      failure.condition.essentialActorDeath?.includes(I.yara),
  );
}
function hasApproachRules(parent) {
  return (
    mission(parent).failures.some(
      (f) => f.condition.type === 'lookout-timeout' && f.condition.seconds === 45,
    ) &&
    mission(parent).failures.some(
      (f) =>
        f.condition.type === 'collector-door-arrived' &&
        f.condition.actor === I.reeve &&
        f.condition.beforeWarning === true,
    )
  );
}
const actionTypes = new Set([
  'actor-route',
  'evidence-note',
  'authored-effect',
  'campaign-reward',
  'mission-failed',
  'mission-abandoned',
  'mission-suspended',
  'mission-restarted',
]);
function readiness(state, parent) {
  const a = annex(parent),
    d = dispatch(parent),
    p = parent.passengers;
  const passengers =
    parent.ready?.passengers === true &&
    [
      'getActor',
      'companionObservation',
      'getSeat',
      'vehicleOccupants',
      'ensureNamedActor',
      'requestBoard',
      'requestExit',
      'requestEscort',
    ].every((key) => typeof p?.[key] === 'function') &&
    object(parent.companionContext);
  const interior =
    parent.ready?.interior === true &&
    a?.ready === true &&
    d?.ready === true &&
    point(a.entry) &&
    point(a.counterTarget) &&
    point(d.entry) &&
    point(d.felixTarget) &&
    sync(parent.rooms?.hasRoom, a.roomId) === true &&
    sync(parent.rooms?.hasPortal, a.portalId) === true;
  const phone =
    parent.ready?.phone === true &&
    parent.phone?.ready === true &&
    [
      'register',
      'act',
      'tick',
      'view',
      'outcome',
      'acknowledgments',
      'validate',
      'warningDefinition',
    ].every((key) => typeof parent.phone?.[key] === 'function');
  const chase =
    parent.ready?.chase === true &&
    parent.drivers?.ready === true &&
    ['requestDriver', 'observe', 'drive', 'release'].every(
      (key) => typeof parent.drivers?.[key] === 'function',
    ) &&
    Array.isArray(parent.world?.roads) &&
    typeof parent.sight === 'function';
  const director =
    parent.ready?.director === true &&
    hasSafetyRule(parent) &&
    hasApproachRules(parent) &&
    typeof parent.actors?.move === 'function' &&
    typeof parent.actors?.pose === 'function' &&
    ['chooseTaxi', 'ensure'].every((key) => typeof parent.vehicles?.[key] === 'function') &&
    typeof parent.director?.chooseOption === 'function' &&
    parent.attacks?.ready === true &&
    typeof parent.attacks.events === 'function' &&
    typeof parent.attacks.perceived === 'function' &&
    parent.damage?.ready === true &&
    typeof parent.damage.events === 'function' &&
    parent.recognition?.ready === true &&
    typeof parent.recognition.observe === 'function' &&
    ['capture', 'validate', 'restore'].every(
      (key) => typeof parent.snapshots?.[key] === 'function',
    ) &&
    [...actionTypes].every((key) => typeof parent.effects?.handlers?.[key] === 'function') &&
    typeof parent.effects?.verifyReceipt === 'function' &&
    typeof parent.observations?.playerArrested === 'function';
  return { passengers, interior, phone, chase, director };
}
export function lateMeterIntegrationGates(state, parent) {
  const gates = Object.entries(readiness(state, parent))
    .filter(([, value]) => !value)
    .map(([key]) => `late-meter-${key}-unintegrated`);
  if (!hasSafetyRule(parent)) gates.push('protected-target-failure-not-authored-or-migrated');
  if (!hasApproachRules(parent)) gates.push('approach-failures-not-authored-or-migrated');
  return gates;
}
function physicallyParked(state, car, bay, parent) {
  const spec = car && parent.vehicles?.specs?.[car.spec];
  if (
    !car ||
    car.health <= 0 ||
    scene(car) !== null ||
    !point(bay) ||
    !finite(bay.w) ||
    !finite(bay.h) ||
    !spec ||
    Math.abs(car.speed || 0) > (bay.maxSpeed ?? bay.speedBelow ?? 2) + EPS ||
    Math.abs((car.z || 0) - (bay.z || 0)) > 3
  )
    return false;
  if (
    finite(bay.angle) &&
    Math.abs(angleError(car.angle, bay.angle)) > (bay.angleTolerance ?? Math.PI / 8) + EPS
  )
    return false;
  if (
    point(bay.pose) &&
    finite(bay.positionTolerance) &&
    distance(car, bay.pose) > bay.positionTolerance + EPS
  )
    return false;
  const c = Math.cos(car.angle),
    s = Math.sin(car.angle);
  for (const longitudinal of [-spec.length / 2, spec.length / 2])
    for (const lateral of [-spec.width / 2, spec.width / 2]) {
      const x = car.x + c * longitudinal - s * lateral,
        y = car.y + s * longitudinal + c * lateral;
      if (x < bay.x - EPS || x > bay.x + bay.w + EPS || y < bay.y - EPS || y > bay.y + bay.h + EPS)
        return false;
    }
  return true;
}
function livingSeat(state, parent) {
  const car = ride(state),
    seat = sync(parent.passengers?.getSeat, state, I.felix);
  return Boolean(
    car?.health > 0 &&
    seat?.alive &&
    seat.vehicleId === car.id &&
    seat.seat >= 1 &&
    sync(parent.passengers.vehicleOccupants, state, car.id)?.some(
      (entry) => entry.actorId === I.felix && entry.alive,
    ),
  );
}
function riding(state, parent) {
  return Boolean(
    ride(state) &&
    state.player.health > 0 &&
    state.player.vehicleId === ride(state).id &&
    livingSeat(state, parent),
  );
}
function delivered(state, parent, target) {
  const p = actor(state, parent, I.felix);
  return Boolean(p?.alive && !p.seated && near(p, target));
}
function dialogueFinished(state) {
  const dialogue = state.campaign?.active?.dialogue;
  return Boolean(dialogue && dialogue.index >= dialogue.lines.length);
}
function observationReceipt(state, name, fields) {
  const m = initializeLateMeterRuntime(state);
  return {
    id: `lm:${name}:${m.active?.attempt || 0}:${m.sequence++}`,
    at: state.time,
    scope: scope(state),
    ...copy(fields),
  };
}
function makeItinerary(state, actorId, points, speed) {
  const m = initializeLateMeterRuntime(state);
  if (
    !Array.isArray(points) ||
    !points.length ||
    !points.every(point) ||
    !finite(speed) ||
    speed <= 0
  )
    return gate(`physical-itinerary-missing:${actorId}`);
  m.run.itineraries[actorId] ??= {
    points: copy(points.map((p) => ({ ...p, radius: p.radius ?? 0.5 }))),
    speed,
    index: 0,
    arrivedAt: null,
    finished: false,
    blockedSeconds: 0,
  };
  return { ok: true };
}
function tickItineraries(state, parent, dt) {
  const m = initializeLateMeterRuntime(state);
  for (const [actorId, route] of Object.entries(m.run.itineraries)) {
    if (route.finished) continue;
    const observed = actor(state, parent, actorId),
      target = route.points[route.index];
    if (!observed?.alive || observed.seated) continue;
    if (scene(observed) !== scene(target)) {
      m.active.blocked = 'scripted-approach-scene-mismatch';
      continue;
    }
    if (!near(observed, target)) {
      route.arrivedAt = null;
      const length = distance(observed, target),
        amount = Math.min(length, route.speed * dt),
        before = { x: observed.x, y: observed.y };
      const result = sync(
        parent.actors.move,
        state,
        actorId,
        ((target.x - observed.x) / length) * amount,
        ((target.y - observed.y) / length) * amount,
        7,
      );
      const after = actor(state, parent, actorId);
      if (!accepted(result) || !after || distance(before, after) > amount + EPS) {
        m.active.blocked = 'actual-collector-movement-declined';
        continue;
      }
      route.blockedSeconds =
        distance(before, after) < amount * 0.05 ? route.blockedSeconds + dt : 0;
      if (route.blockedSeconds > 3) m.active.blocked = 'collector-approach-physically-blocked';
      sync(parent.actors.pose, state, actorId, {
        action: 'walk',
        angle: Math.atan2(target.y - observed.y, target.x - observed.x),
      });
      continue;
    }
    route.arrivedAt ??= state.time;
    sync(parent.actors.pose, state, actorId, {
      action: target.action || 'idle',
      angle: target.angle ?? null,
    });
    if (state.time - route.arrivedAt + EPS < (target.dwellSeconds || 0)) continue;
    route.index++;
    route.arrivedAt = null;
    if (route.index >= route.points.length) route.finished = true;
  }
}
/** Saved two-leg room→world→room preparation; never recruit/relocate a missing Felix. */
function prepareLateMeterStart(state, parent) {
  const m = initializeLateMeterRuntime(state),
    d = dispatch(parent),
    p = actor(state, parent, I.felix);
  if (
    !state.campaign?.completed?.['LL-ST-001'] ||
    state.campaign.completed[I.mission] ||
    m.active?.phase === 'running' ||
    state.campaign?.suspended?.some((run) => run.missionId === I.mission)
  )
    return { ok: true, idle: true };
  if (!p?.alive || !point(d?.entry) || !point(d?.felixTarget))
    return gate('real-felix-dispatch-itinerary-unavailable');
  sync(
    parent.passengers.ensureNamedActor,
    state,
    { ...body(state, parent, I.felix) },
    parent.companionContext,
  );
  if (near(p, d.felixTarget, d.roomId)) {
    m.preparation.ready = true;
    m.preparation.leg = 2;
    return { ok: true, ready: true };
  }
  m.preparation.started = true;
  if (p.sceneId === d.roomId) m.preparation.leg = 1;
  const target =
    m.preparation.leg === 0
      ? { ...d.entry, sceneId: null, radius: d.entry.radius ?? 10 }
      : d.felixTarget;
  if (m.preparation.leg === 0 && near(p, target, null)) m.preparation.leg = 1;
  sync(
    parent.passengers?.requestEscort,
    state,
    I.felix,
    m.preparation.leg === 1 ? d.felixTarget : target,
    parent.companionContext,
  );
  return { ok: true, ready: false, leg: m.preparation.leg };
}
function ensureCast(state, parent) {
  const a = annex(parent),
    felix = actor(state, parent, I.felix);
  if (!felix?.alive) return gate('persistent-felix-unavailable');
  for (const actorId of [I.yara, I.reeve, I.watcher]) {
    const definition = Object.values(a.actorSpawns || {}).find((entry) => entry.id === actorId);
    if (!definition || !point(definition)) return gate(`authored-actor-spawn-missing:${actorId}`);
    const result = sync(
      parent.passengers.ensureNamedActor,
      state,
      { ...definition, id: actorId },
      parent.companionContext,
    );
    if (!result || result.id !== actorId || !body(state, parent, actorId))
      return gate(`canonical-actor-unavailable:${actorId}`);
  }
  const result = sync(parent.vehicles?.ensure, state, {
    ...a.pursuerSpawn,
    id: I.pursuer,
    spec: a.pursuerSpawn?.spec || 'sedan',
    kind: 'parked',
    missionVehicle: true,
  });
  return accepted(result) && pursuer(state)
    ? { ok: true }
    : gate('real-collector-vehicle-unavailable');
}
function activate(state, stage, request, parent) {
  if (request.missionId !== I.mission || !supportedStage(stage, parent))
    return gate('unregistered-late-meter-stage');
  const gates = lateMeterIntegrationGates(state, parent);
  if (gates.length) return { ok: false, unmet: gates };
  const m = initializeLateMeterRuntime(state);
  if (own(m.activations, request.receipt)) return { ok: true, replayed: true };
  if (
    stage.id === 'counter' &&
    ['start', 'full-mission-restart', 'checkpoint-retry'].includes(request.reason)
  ) {
    if (
      state.mission ||
      state.wanted?.level ||
      !near(actor(state, parent, I.felix), dispatch(parent).felixTarget, dispatch(parent).roomId)
    )
      return gate('real-dispatch-start-not-ready');
    m.run = freshRun();
    m.run.startedAt = state.time;
    m.run.damageCheckedAt = state.time;
    m.run.attackCheckedAt = state.time;
    const selected = sync(parent.vehicles.chooseTaxi, state);
    if (!selected || selected.spec !== 'taxi' || selected.health <= 0 || scene(selected) !== null)
      return gate('genuinely-available-healthy-taxi-required');
    if (!physicallyParked(state, selected, dispatch(parent).stop, parent))
      return gate('bring-working-taxi-to-dispatch-before-accepting');
    m.run.rideId = selected.id;
  }
  if (
    stage.id !== 'counter' &&
    (!ride(state) || !finite(m.run.startedAt) || !m.run.counterDelivered)
  )
    return gate('actual-counter-delivery-history-required');
  m.active = {
    missionId: I.mission,
    stageId: stage.id,
    attempt: request.attempt,
    receipt: request.receipt,
    startedAt:
      request.reason === 'resume-after-interleaving' &&
      m.active?.stageId === stage.id &&
      m.active?.attempt === request.attempt
        ? m.active.startedAt
        : state.time,
    phase: 'running',
    blocked: null,
  };
  const cast = ensureCast(state, parent);
  if (!cast.ok) return cast;
  if (stage.id === 'lookout') {
    for (const approach of Object.values(annex(parent).collectorApproaches || {})) {
      const result = makeItinerary(state, approach.actorId, approach.path, approach.speed);
      if (!result.ok) return result;
    }
  }
  if (stage.id === 'extract') {
    const driverId = annex(parent).pursuerDriverActorId;
    if (driverId !== I.reeve || !Array.isArray(annex(parent).pursuerDriverPath))
      return gate('authored-collector-driver-route-missing');
    const current = m.run.itineraries[driverId];
    if (!current) return gate('real-collector-approach-history-missing');
    if (!current.driverExtended) {
      current.points.push(
        ...copy(
          annex(parent)
            .pursuerDriverPath.slice(1)
            .map((p) => ({ ...p, radius: 0.5 })),
        ),
      );
      current.driverExtended = true;
      current.finished = false;
    }
  }
  if (stage.id === 'warn') {
    if (!m.run.recognition || !m.run.lookoutExchange)
      return gate('actual-collector-recognition-required');
    if (!m.run.warning.owner) {
      m.run.warning.owner = {
        missionId: I.mission,
        stageId: 'warn',
        attempt: request.attempt,
        receipt: request.receipt,
      };
      m.run.warning.callId = `late-meter:warning:${request.attempt}`;
    }
  }
  m.activations[request.receipt] = { scope: scope(state), at: state.time };
  m.sequence++;
  return { ok: true };
}
function capture(state, parent) {
  const snapshot = sync(parent.snapshots?.capture, state, {
    exclude: ['campaign'],
  });
  if (!object(snapshot) || own(snapshot, 'campaign'))
    throw Error('Parent must capture the complete director-excluded world.');
  const value = copy(snapshot);
  validateLateMeterRuntime(value);
  if (sync(parent.snapshots?.validate, value) !== true)
    throw Error('Parent rejected the full Late Meter physical snapshot.');
  return value;
}
function restore(state, snapshot, parent, reason) {
  if (
    !object(snapshot) ||
    own(snapshot, 'campaign') ||
    sync(parent.snapshots?.validate, snapshot) !== true
  )
    return gate('invalid-full-late-meter-world-snapshot');
  validateLateMeterRuntime(snapshot);
  const oldEpoch = initializeLateMeterRuntime(state).restoreEpoch,
    director = state.campaign;
  if (
    !accepted(
      sync(parent.snapshots.restore, state, copy(snapshot), {
        reason,
        preserve: ['campaign'],
        invalidateRailDispatcher: true,
      }),
    )
  )
    return gate('parent-late-meter-restore-declined');
  state.campaign = director;
  const m = initializeLateMeterRuntime(state);
  m.restoreEpoch = Math.max(oldEpoch, m.restoreEpoch) + 1;
  m.lastObservedTime = state.time;
  m.lastRestoreReason = reason;
  return { ok: true };
}
function atomic(state, parent, reason, operation) {
  const before = capture(state, parent);
  try {
    const result = operation();
    if (result.ok) return result;
    if (!restore(state, before, parent, `rollback:${reason}`).ok)
      throw Error('Late Meter rollback failed.');
    return result;
  } catch (error) {
    if (!restore(state, before, parent, `rollback:${reason}`).ok)
      throw Error('Late Meter error rollback failed.');
    throw error;
  }
}
export function actLateMeter(state, action, parent) {
  action = copy(action);
  const m = initializeLateMeterRuntime(state);
  if (m.active?.phase !== 'running') return gate('late-meter-not-running');
  if (action.type === 'recognize') {
    if (
      m.active.stageId !== 'lookout' ||
      action.actorId !== I.reeve ||
      !physicallyParked(state, ride(state), annex(parent).parkingBay, parent) ||
      !dialogueFinished(state) ||
      !m.run.lookoutExchange ||
      state.time + EPS >= m.active.startedAt + 45
    )
      return gate('collector-lookout-not-physically-ready');
    const rule = mission(parent)
      .stages.find((entry) => entry.id === 'lookout')
      .completion.find((entry) => entry.type === 'identified-actor');
    const result = sync(
      parent.recognition?.observe,
      state,
      I.reeve,
      rule.evidence,
      action.inputReceipt,
    );
    if (
      !accepted(result) ||
      !id(result.receipt?.id) ||
      result.receipt.actorId !== I.reeve ||
      !finite(result.receipt.at) ||
      Math.abs(result.receipt.at - state.time) > EPS ||
      !rule.evidence.every((clue) => result.receipt.clues?.includes(clue)) ||
      result.receipt.explicitInput !== true ||
      result.receipt.cameraVisible !== true ||
      result.receipt.lineOfSight !== true ||
      !point(result.receipt.observerPose) ||
      !point(result.receipt.actorPose) ||
      scene(result.receipt.observerPose) !== null ||
      scene(result.receipt.actorPose) !== null ||
      result.receipt.range !== annex(parent).observation.recognitionRange ||
      distance(result.receipt.observerPose, result.receipt.actorPose) >
        result.receipt.range + EPS ||
      distance(state.player, result.receipt.observerPose) > EPS ||
      distance(actor(state, parent, I.reeve), result.receipt.actorPose) > EPS
    )
      return gate('actual-visible-clue-recognition-not-observed');
    m.run.recognition ??= { ...copy(result.receipt), scope: scope(state) };
    m.sequence++;
    return { ok: true, receipt: copy(m.run.recognition) };
  }
  if (action.type === 'dial-warning') {
    if (
      m.active.stageId !== 'warn' ||
      !['phone', 'accessibility-hotkey'].includes(action.method) ||
      !id(action.inputReceipt)
    )
      return gate('real-warning-input-required');
    // A mistaken contact is an ordinary phone input. Keep its retry/history
    // observation without rewinding the physical world or clearing held input.
    if (action.contact !== I.felix)
      return (
        sync(parent.phone.act, state, {
          type: 'dial',
          id: m.run.warning.callId,
          contact: action.contact,
        }) || gate('phone-controller-unavailable')
      );
    return atomic(state, parent, 'warning-dial', () => {
      const result = sync(parent.phone.act, state, {
        type: 'dial',
        id: m.run.warning.callId,
        contact: action.contact,
      });
      if (!result?.ok) return result || gate('phone-controller-unavailable');
      if (!m.run.warning.method) {
        m.run.warning.method = {
          id: action.method,
          at: state.time,
          inputReceipt: action.inputReceipt,
          scope: scope(state),
        };
        const choice = sync(parent.director.chooseOption, state, 'warning-method', action.method);
        if (!choice.ok) return choice;
      }
      return result;
    });
  }
  return gate('unknown-late-meter-input');
}
function ownerId(owner) {
  return typeof owner === 'string' ? owner : null;
}
function playerOwned(state, owner) {
  return ['player', 'mara-voss', 'LL-CHAR-001', state.player.id]
    .filter(Boolean)
    .includes(ownerId(owner));
}
function damageTarget(state, event) {
  if (event.entityType === 'vehicle')
    return state.vehicles?.find((entry) => entry.id === event.targetId);
  return [
    ...(state.companions?.actors || []),
    ...(state.police || []),
    ...(state.hostiles || []),
    ...(state.pedestrians || []),
    ...Object.values(state.interior?.rooms || {}).flatMap((room) => room.actors || []),
  ].find((entry) => entry.id === event.targetId);
}
/** Parent calls synchronously after actual committed damage, before body cleanup. */
export function observeLateMeterDamage(state, event) {
  const m = initializeLateMeterRuntime(state);
  if (m.active?.phase !== 'running') return { ok: true, ignored: true };
  event = copy(event);
  if (
    !['actor', 'vehicle'].includes(event.entityType) ||
    !id(event.targetId) ||
    !id(event.targetKind) ||
    !id(ownerId(event.owner)) ||
    !id(event.kind) ||
    !point(event) ||
    !(event.sceneId === null || id(event.sceneId)) ||
    !finite(event.at) ||
    Math.abs(event.at - state.time) > EPS ||
    !['healthBefore', 'healthAfter', 'armourBefore', 'armourAfter'].every(
      (key) => finite(event[key]) && event[key] >= 0,
    ) ||
    event.healthAfter > event.healthBefore ||
    event.armourAfter > event.armourBefore ||
    (event.healthAfter === event.healthBefore && event.armourAfter === event.armourBefore)
  )
    return gate('invalid-committed-late-meter-damage');
  const target = damageTarget(state, event);
  if (
    !target ||
    Math.abs(target.health - event.healthAfter) > EPS ||
    Math.abs((target.armour || 0) - event.armourAfter) > EPS ||
    scene(target) !== event.sceneId ||
    distance(target, event) > EPS ||
    Math.abs((target.z || 0) - event.z) > EPS
  )
    return gate('damage-does-not-match-actual-target-after-state');
  const protectedTarget =
    event.targetId === I.yara ||
    (event.entityType === 'actor' && state.police?.some((a) => a === target)) ||
    (event.entityType === 'vehicle' && target.spec === 'police');
  const collector = [I.reeve, I.watcher, I.pursuer].includes(event.targetId);
  if (!protectedTarget && !collector) return { ok: true, ignored: true };
  const receipt = {
    ...event,
    owner: ownerId(event.owner),
    id: `lm:damage:${hash(event)}`,
    scope: scope(state),
  };
  if (m.run.damageEvents.some((entry) => entry.id === receipt.id))
    return { ok: true, replayed: true };
  if (m.run.damageEvents.length >= 1024) {
    m.active.blocked = 'damage-observation-capacity-reached';
    return gate(m.active.blocked);
  }
  m.run.damageEvents.push(receipt);
  if (playerOwned(state, event.owner) && protectedTarget) m.run.protectedHarm ??= copy(receipt);
  if (playerOwned(state, event.owner) && collector && !m.run.warning.delivered)
    m.run.preWarningAttack ??= copy(receipt);
  m.sequence++;
  return { ok: true, receipt: copy(receipt) };
}
export function lateMeterDamageEvents(state, since = 0) {
  return copy(
    initializeLateMeterRuntime(state).run.damageEvents.filter((event) => event.at >= since),
  );
}
/** Parent calls immediately after combat.js commits a real player action. */
export function observeLateMeterAttack(state, event, parent) {
  const m = initializeLateMeterRuntime(state);
  if (m.active?.phase !== 'running') return { ok: true, ignored: true };
  event = copy(event);
  if (
    !id(event.owner) ||
    !id(event.kind) ||
    !id(event.weapon) ||
    !point(event) ||
    !(event.sceneId === null || id(event.sceneId)) ||
    !finite(event.angle) ||
    !finite(event.at) ||
    Math.abs(event.at - state.time) > EPS ||
    !Number.isSafeInteger(event.serial) ||
    event.serial <= 0
  )
    return gate('invalid-committed-late-meter-attack');
  if (!playerOwned(state, event.owner)) return { ok: true, ignored: true };
  const attack = state.player.lastAttack;
  if (
    !attack ||
    attack.serial !== event.serial ||
    attack.weapon !== event.weapon ||
    attack.kind !== event.kind ||
    Math.abs(attack.time - event.at) > EPS ||
    Math.abs(angleError(attack.angle, event.angle)) > EPS ||
    playerScene(state) !== event.sceneId ||
    distance(state.player, event) > EPS ||
    Math.abs((state.player.z || 0) - event.z) > EPS
  )
    return gate('attack-does-not-match-performed-player-action');
  const perceived = sync(parent?.attacks?.perceived, state, event, [I.reeve, I.watcher]);
  const receipt = {
    ...event,
    id: `lm:attack:${event.serial}`,
    scope: scope(state),
    perceived: perceived === true ? true : perceived === false ? false : null,
  };
  if (m.run.attackEvents.some((entry) => entry.id === receipt.id))
    return { ok: true, replayed: true };
  if (m.run.attackEvents.length >= 1024) {
    m.active.blocked = 'attack-observation-capacity-reached';
    return gate(m.active.blocked);
  }
  m.run.attackEvents.push(receipt);
  m.sequence++;
  if (!m.run.warning.delivered && receipt.perceived === true)
    m.run.preWarningAttack ??= copy(receipt);
  if (receipt.perceived === null) {
    m.run.attackUnmet = true;
    m.active.blocked = 'collector-attack-perception-unavailable';
    return gate(m.active.blocked);
  }
  return { ok: true, receipt: copy(receipt) };
}
export function lateMeterAttackEvents(state, since = 0) {
  return copy(
    initializeLateMeterRuntime(state).run.attackEvents.filter((event) => event.at >= since),
  );
}
function updateDamage(state, parent) {
  const m = initializeLateMeterRuntime(state),
    events = sync(parent.damage?.events, state, m.run.damageCheckedAt);
  if (!Array.isArray(events)) {
    m.active.blocked = 'actual-damage-attribution-unavailable';
    return false;
  }
  const damageById = new Map(m.run.damageEvents.map((e) => [e.id, e]));
  for (const event of events) {
    if (
      !id(event.id) ||
      !finite(event.at) ||
      event.at < m.run.startedAt ||
      event.at > state.time + EPS ||
      JSON.stringify(damageById.get(event.id)) !== JSON.stringify(event)
    ) {
      m.active.blocked = 'unverified-recorded-damage-observation';
      return false;
    }
  }
  const attacks = sync(parent.attacks?.events, state, m.run.attackCheckedAt);
  if (!Array.isArray(attacks)) {
    m.active.blocked = 'actual-attack-observations-unavailable';
    return false;
  }
  const attacksById = new Map(m.run.attackEvents.map((e) => [e.id, e]));
  for (const event of attacks) {
    if (
      !id(event.id) ||
      !finite(event.at) ||
      event.at < m.run.startedAt ||
      event.at > state.time + EPS ||
      !id(ownerId(event.owner)) ||
      JSON.stringify(attacksById.get(event.id)) !== JSON.stringify(event)
    ) {
      m.active.blocked = 'invalid-performed-attack-observation';
      return false;
    }
    if (!playerOwned(state, event.owner) || m.run.warning.delivered || m.run.preWarningAttack)
      continue;
    const perceived = event.perceived;
    if (perceived !== true && perceived !== false) {
      m.active.blocked = 'collector-attack-perception-unavailable';
      return false;
    }
    if (perceived) m.run.preWarningAttack = { ...copy(event), scope: scope(state) };
  }
  m.run.damageCheckedAt = state.time;
  m.run.attackCheckedAt = state.time;
  if (m.run.attackUnmet) {
    m.active.blocked = 'collector-attack-perception-unavailable';
    return false;
  }
  const yara = actor(state, parent, I.yara);
  if (!yara) {
    m.active.blocked = 'required-clerk-observation-missing';
    return false;
  }
  if (!yara.alive)
    m.run.protectedHarm ??= {
      id: `lm:yara-dead:${m.active.attempt}`,
      at: state.time,
      targetId: I.yara,
      kind: 'essential-actor-dead',
      owner: 'world',
      scope: scope(state),
    };
  return true;
}
function recordSight(state, parent) {
  const m = initializeLateMeterRuntime(state),
    p = m.run.pursuit,
    car = ride(state);
  if (!car || playerScene(state) !== null) return { known: true, seen: false };
  const target = {
    x: state.player.x,
    y: state.player.y,
    z: (state.player.z || 0) + (state.player.vehicleId ? 12 : 14),
  };
  for (const actorId of [I.reeve, I.watcher]) {
    const observed = actor(state, parent, actorId);
    if (!observed) return { known: false, seen: false };
    if (!observed.alive || observed.sceneId !== null) continue;
    const eye = {
      x: observed.x,
      y: observed.y,
      z: (observed.z || 0) + (observed.seated ? 9 : 14),
    };
    const sight = sync(parent.sight, state, eye, target);
    if (sight !== true && sight !== false) return { known: false, seen: false };
    if (distance(eye, target) <= (annex(parent).pursuit?.sightRange ?? 180) && sight) {
      p.observedOnce = true;
      p.lastSeen = {
        x: target.x,
        y: target.y,
        z: state.player.z || 0,
        sceneId: null,
      };
      p.lastSeenAt = state.time;
      p.unseenSeconds = 0;
      return { known: true, seen: true };
    }
  }
  return { known: true, seen: false };
}
function pursuitInput(state, parent, dt) {
  const m = initializeLateMeterRuntime(state),
    p = m.run.pursuit,
    car = pursuer(state),
    driver = sync(parent.drivers?.observe, state, I.pursuer);
  if (
    !car ||
    car.health <= 0 ||
    !driver?.alive ||
    driver.controllable !== true ||
    !driver.seated ||
    driver.seat !== 0 ||
    driver.vehicleId !== car.id ||
    ![I.reeve, I.watcher].includes(driver.actorId)
  ) {
    p.lastVehiclePose = null;
    return { ready: false, moved: false };
  }
  const canonical = actor(state, parent, driver.actorId);
  if (
    !canonical?.alive ||
    !canonical.seated ||
    canonical.vehicleId !== car.id ||
    canonical.seat !== 0
  )
    return { ready: false, moved: false };
  p.driverId = driver.actorId;
  if (!p.lastSeen) return { ready: true, moved: false };
  if (p.lastPlanAt === null || state.time - p.lastPlanAt >= 0.5 || p.routeIndex >= p.route.length) {
    p.route = findRoute(parent.world, car, p.lastSeen, {
      mode: 'car',
      includeZ: true,
    });
    p.routeIndex = p.route.length > 1 ? 1 : 0;
    p.lastPlanAt = state.time;
  }
  if (!p.route.length) {
    m.active.blocked = 'real-collector-road-route-unavailable';
    return { ready: false, moved: false };
  }
  while (
    p.routeIndex < p.route.length - 1 &&
    distance(car, p.route[p.routeIndex]) < Math.max(12, Math.abs(car.speed || 0) * 0.2)
  )
    p.routeIndex++;
  const target = p.route[p.routeIndex],
    error = angleError(Math.atan2(target.y - car.y, target.x - car.x), car.angle),
    targetSpeed =
      Math.abs(error) > 0.7
        ? 24
        : Math.abs(error) > 0.35
          ? 48
          : Math.min(105, parent.vehicles.specs[car.spec].maxSpeed * 0.7);
  // Engine input is queued for the next physical substep. Only movement
  // already observed between two live driver samples can start the chase.
  const before = {
      x: car.x,
      y: car.y,
      z: car.z || 0,
      sceneId: null,
      vehicleId: car.id,
      driverId: driver.actorId,
      at: state.time,
    },
    previous = p.lastVehiclePose,
    elapsed = previous ? state.time - previous.at : 0,
    moved = Boolean(
      previous &&
      previous.vehicleId === car.id &&
      previous.driverId === driver.actorId &&
      elapsed > 0 &&
      elapsed <= 0.5 + EPS &&
      distance(previous, before) > 0.05 &&
      distance(previous, before) <= parent.vehicles.specs[car.spec].maxSpeed * elapsed + 2,
    );
  const result = sync(parent.drivers.drive, state, car.id, dt, {
    up: Math.abs(car.speed || 0) < targetSpeed,
    brake: Math.abs(car.speed || 0) > targetSpeed + 5 || distance(car, target) < 12,
    left: error < -0.06,
    right: error > 0.06,
  });
  if (!accepted(result)) {
    m.active.blocked = 'actual-npc-vehicle-physics-declined';
    return { ready: false, moved: false };
  }
  p.lastVehiclePose = before;
  return { ready: true, moved };
}
function tickPursuit(state, dt, parent) {
  const m = initializeLateMeterRuntime(state),
    p = m.run.pursuit,
    threat = pursuer(state);
  const seen = recordSight(state, parent);
  if (!seen.known) {
    m.active.blocked = 'actual-collector-visibility-unavailable';
    return;
  }
  if (!riding(state, parent) || !m.run.warning.delivered) return;
  const group = [I.reeve, I.watcher].map((actorId) => actor(state, parent, actorId));
  if (group.some((entry) => !entry)) {
    m.active.blocked = 'collector-body-observation-missing';
    return;
  }
  const driver = sync(parent.drivers.observe, state, I.pursuer);
  if (!driver?.seated && threat?.health > 0) {
    const candidate = group.find(
      (entry) => entry.id === annex(parent).pursuerDriverActorId && entry.alive,
    );
    if (
      candidate &&
      m.run.itineraries[candidate.id]?.finished &&
      near(candidate, { ...annex(parent).pursuerDriverDoor, radius: 1 }, null)
    )
      sync(parent.drivers.requestDriver, state, candidate.id, I.pursuer);
  }
  const motion = pursuitInput(state, parent, dt);
  const designatedDriver = group.find((entry) => entry.id === annex(parent).pursuerDriverActorId);
  const disabled =
    threat?.health <= 0 ||
    // This authored crew has one vehicle driver. Losing that actual body on
    // foot disables the vehicle threat just as losing him in seat zero does.
    designatedDriver?.alive === false ||
    group.every((entry) => !entry.alive) ||
    (driver && !driver.alive && driver.seated);
  if (!p.started && p.observedOnce && ((motion.ready && motion.moved) || disabled)) {
    p.started = true;
    p.startedAt = state.time;
    p.unseenSeconds = 0;
    p.resolution = disabled ? 'physically-disabled-threat' : 'routed-vehicle-pursuit';
  }
  if (!p.started || p.escape) return;
  if (!seen.seen) p.unseenSeconds += dt;
  const radius = annex(parent).pursuit?.searchRadius ?? 120;
  const rule = mission(parent)
    .stages.find((entry) => entry.id === 'extract')
    .completion.find((entry) => entry.type === 'pursuit-broken');
  if (
    !seen.seen &&
    p.lastSeen &&
    p.unseenSeconds + EPS >= rule.unseenSeconds &&
    state.time + EPS >= p.startedAt + rule.unseenSeconds &&
    distance(ride(state), p.lastSeen) > radius
  )
    p.escape = observationReceipt(state, 'escape', {
      vehicleId: m.run.rideId,
      driverId: p.driverId,
      pursuerVehicleId: I.pursuer,
      lastSeen: copy(p.lastSeen),
      lastSeenAt: p.lastSeenAt,
      vehiclePose: {
        x: ride(state).x,
        y: ride(state).y,
        z: ride(state).z || 0,
        sceneId: null,
      },
      unseenSeconds: p.unseenSeconds,
      outsideRadius: radius,
      observedOnce: true,
      resolution: p.resolution,
    });
}
export function tickLateMeterRuntime(state, dt, parent) {
  const m = initializeLateMeterRuntime(state);
  if (!finite(dt) || dt < 0 || dt > 0.5 || state.time + EPS < m.lastObservedTime)
    throw Error('Invalid actual Late Meter observation timestep.');
  const elapsed = Math.min(dt, Math.max(0, state.time - m.lastObservedTime));
  m.lastObservedTime = state.time;
  if (!m.active || m.active.phase !== 'running') {
    if (!state.campaign?.active) prepareLateMeterStart(state, parent);
    return m;
  }
  m.active.blocked = null;
  const r = m.run,
    a = annex(parent),
    d = dispatch(parent),
    felix = actor(state, parent, I.felix),
    car = ride(state);
  r.playerDead ||= state.player.health <= 0 || (state.respawnTimer || 0) > 0;
  const arrested = sync(parent.observations?.playerArrested, state, r.startedAt);
  if (arrested === true) r.playerArrested = true;
  if (!updateDamage(state, parent)) return m;
  const reeve = actor(state, parent, I.reeve);
  if (
    reeve?.alive &&
    (reeve.sceneId === a.roomId ||
      near(
        reeve,
        {
          ...(a.collectorApproaches?.east?.doorTarget || a.entry),
          radius: 0.5,
        },
        null,
      ))
  )
    r.doorReachedAt ??= state.time;
  const expectedAnnex =
    ['counter', 'lookout', 'warn'].includes(m.active.stageId) &&
    felix?.sceneId === a.roomId &&
    physicallyParked(state, car, a.parkingBay, parent);
  const separated =
    felix?.alive &&
    !livingSeat(state, parent) &&
    !expectedAnnex &&
    (felix.sceneId !== playerScene(state) || distance(felix, state.player) > 150);
  r.abandonmentSeconds = separated ? r.abandonmentSeconds + elapsed : 0;
  if (m.active.stageId === 'counter') {
    const atPickup = physicallyParked(state, car, d.stop, parent);
    if (
      state.player.vehicleId === car?.id &&
      atPickup &&
      !livingSeat(state, parent) &&
      !r.counterDelivered
    )
      sync(parent.passengers.requestBoard, state, I.felix, car.id, parent.companionContext);
    if (riding(state, parent)) {
      const pose = { x: car.x, y: car.y, z: car.z || 0, sceneId: null };
      if (r.counterTrip.boardedAt === null && atPickup) {
        r.counterTrip.boardedAt = state.time;
        r.counterTrip.pickupPose = copy(pose);
      }
      if (r.counterTrip.boardedAt !== null && r.counterTrip.lastPose)
        r.counterTrip.distance += distance(pose, r.counterTrip.lastPose);
      r.counterTrip.lastPose = copy(pose);
    } else r.counterTrip.lastPose = null;
    const tripProved =
      r.counterTrip.boardedAt !== null &&
      r.counterTrip.distance >= Math.max(1, distance(d.stop, a.parkingBay.pose) * 0.8);
    const parked =
      physicallyParked(state, car, a.parkingBay, parent) &&
      state.player.vehicleId === car?.id &&
      !state.wanted.level;
    r.parkedSeconds = parked ? r.parkedSeconds + elapsed : 0;
    if (
      parked &&
      tripProved &&
      dialogueFinished(state) &&
      r.parkedSeconds + EPS >= (a.parkingBay.seconds ?? 0) &&
      felix?.alive &&
      !delivered(state, parent, a.counterTarget)
    )
      sync(
        parent.passengers.requestEscort,
        state,
        I.felix,
        a.counterTarget,
        parent.companionContext,
      );
    if (
      parked &&
      tripProved &&
      r.parkedSeconds + EPS >= (a.parkingBay.seconds ?? 0) &&
      delivered(state, parent, a.counterTarget)
    )
      r.counterDelivered ??= observationReceipt(state, 'counter-delivered', {
        actorId: I.felix,
        vehicleId: car.id,
        vehiclePose: { x: car.x, y: car.y, z: car.z || 0, sceneId: null },
        trip: copy(r.counterTrip),
        pose: { x: felix.x, y: felix.y, z: felix.z, sceneId: felix.sceneId },
      });
  }
  if (['lookout', 'warn'].includes(m.active.stageId)) {
    if (m.active.stageId === 'lookout' && dialogueFinished(state) && !r.lookoutExchange) {
      r.lookoutExchange = observationReceipt(state, 'lookout-exchange', {
        lineCount: mission(parent).stages.find((s) => s.id === 'lookout').dialogue.length,
      });
      r.approachStartedAt = state.time;
    }
    if (r.lookoutExchange) tickItineraries(state, parent, elapsed);
    recordSight(state, parent);
  }
  if (
    m.active.stageId === 'warn' &&
    state.campaign?.active?.stageId === 'warn' &&
    state.campaign.active.attempt === m.active.attempt
  ) {
    const result = sync(
      parent.phone.register,
      state,
      parent.phone.warningDefinition(mission(parent), r.warning.owner, {
        id: r.warning.callId,
        identifiedAt: r.recognition.at,
      }),
    );
    if (!result?.ok)
      m.active.blocked = result?.unmet?.[0] || result?.reason || 'phone-registration-unavailable';
  }
  sync(parent.phone.tick, state, elapsed);
  if (r.warning.owner)
    r.warning.delivered =
      sync(parent.phone.outcome, state, {
        kind: 'delivered',
        direction: 'outgoing',
        contact: I.felix,
        topic: 'collector-warning',
        owner: r.warning.owner,
      }) || null;
  if (m.active.stageId === 'extract') {
    if (felix?.alive && !livingSeat(state, parent))
      sync(parent.passengers.requestBoard, state, I.felix, r.rideId, parent.companionContext);
    tickItineraries(state, parent, elapsed);
    tickPursuit(state, elapsed, parent);
  }
  if (m.active.stageId === 'return') {
    sync(parent.drivers.release, state, I.pursuer, 'escape-complete');
    if (
      dialogueFinished(state) &&
      physicallyParked(state, car, d.stop, parent) &&
      !state.wanted.level
    )
      sync(parent.passengers.requestEscort, state, I.felix, d.felixTarget, parent.companionContext);
    if (
      dialogueFinished(state) &&
      delivered(state, parent, d.felixTarget) &&
      physicallyParked(state, car, d.stop, parent)
    )
      r.returned ??= observationReceipt(state, 'dispatch-delivered', {
        actorId: I.felix,
        vehicleId: car.id,
        vehiclePose: { x: car.x, y: car.y, z: car.z || 0, sceneId: null },
        pose: { x: felix.x, y: felix.y, z: felix.z, sceneId: felix.sceneId },
      });
  }
  return m;
}
const conditionTypes = new Set([
  'passenger-delivered',
  'parked-in-lookout-bay',
  'identified-actor',
  'outgoing-call-delivered',
  'passenger-boarded',
  'pursuit-broken',
  'player-dead',
  'player-arrested',
  'clock-expired',
  'attack-before-warning',
  'escort-or-vehicle-lost',
  'protected-target-harmed',
  'lookout-timeout',
  'collector-door-arrived',
  'choice-permitted',
  'actor-alive',
]);
function observe(state, condition, request, parent) {
  const m = initializeLateMeterRuntime(state),
    r = m.run,
    felix = actor(state, parent, I.felix),
    car = ride(state);
  if (request.missionId !== I.mission || !conditionTypes.has(condition.type))
    return { unmet: `unregistered-late-meter-condition:${condition.type}` };
  if (condition.type === 'actor-alive')
    return [I.reeve, I.felix, I.yara, I.watcher].includes(condition.actor)
      ? actor(state, parent, condition.actor)?.alive === true
      : { unmet: 'unknown-speaking-actor' };
  if (condition.type === 'player-dead')
    return r.playerDead || state.player.health <= 0 || state.respawnTimer > 0;
  if (condition.type === 'player-arrested')
    return (
      r.playerArrested || sync(parent.observations?.playerArrested, state, r.startedAt) === true
    );
  if (condition.type === 'protected-target-harmed')
    return hasSafetyRule(parent)
      ? Boolean(r.protectedHarm || actor(state, parent, I.yara)?.alive === false)
      : { unmet: 'protected-target-failure-not-authored' };
  if (condition.type === 'attack-before-warning')
    return condition.group === 'holt-collectors'
      ? Boolean(r.preWarningAttack)
      : { unmet: 'unknown-pre-warning-attack-group' };
  if (condition.type === 'clock-expired')
    return condition.clock === 'warn'
      ? Boolean(
          !r.warning.delivered &&
          r.recognition &&
          state.time + EPS >=
            r.recognition.at +
              mission(parent).stages.find((entry) => entry.id === 'warn').clock.seconds,
        )
      : { unmet: 'unknown-warning-clock' };
  if (condition.type === 'lookout-timeout')
    return condition.seconds === 45
      ? Boolean(
          m.active?.stageId === 'lookout' &&
          !r.recognition &&
          state.time + EPS >= m.active.startedAt + condition.seconds,
        )
      : { unmet: 'unknown-lookout-window' };
  if (condition.type === 'collector-door-arrived')
    return condition.actor === I.reeve && condition.beforeWarning === true
      ? Boolean(r.doorReachedAt !== null && !r.warning.delivered)
      : { unmet: 'unknown-collector-door-failure' };
  if (condition.type === 'escort-or-vehicle-lost')
    return condition.actor === I.felix
      ? Boolean(
          (felix &&
            (!felix.alive ||
              felix.blockedSeconds >= condition.grace ||
              felix.separationSeconds >= condition.grace ||
              r.abandonmentSeconds >= condition.grace)) ||
          (car && car.health <= 0),
        )
      : { unmet: 'unknown-escort' };
  if (condition.type === 'passenger-delivered') {
    if (condition.actor !== I.felix) return { unmet: 'unknown-delivery-passenger' };
    return request.stageId === 'counter'
      ? Boolean(r.counterDelivered && delivered(state, parent, annex(parent).counterTarget))
      : request.stageId === 'return'
        ? Boolean(r.returned && delivered(state, parent, dispatch(parent).felixTarget))
        : { unmet: 'unknown-passenger-delivery-stage' };
  }
  if (condition.type === 'parked-in-lookout-bay')
    return (
      physicallyParked(state, car, annex(parent).parkingBay, parent) &&
      r.parkedSeconds + EPS >= (annex(parent).parkingBay.seconds || 0) &&
      !state.wanted.level
    );
  if (condition.type === 'identified-actor')
    return condition.actor === I.reeve && r.recognition
      ? condition.evidence.every((clue) => r.recognition.clues.includes(clue))
      : false;
  if (condition.type === 'outgoing-call-delivered')
    return condition.contact === I.felix && condition.topic === 'collector-warning'
      ? Boolean(
          r.warning.delivered &&
          sync(parent.phone.outcome, state, {
            kind: 'delivered',
            direction: 'outgoing',
            contact: I.felix,
            topic: 'collector-warning',
            owner: r.warning.owner,
          })?.id === r.warning.delivered.id,
        )
      : { unmet: 'unknown-outgoing-warning' };
  if (condition.type === 'passenger-boarded')
    return condition.actor === I.felix && riding(state, parent);
  if (condition.type === 'pursuit-broken')
    return condition.group === 'holt-collectors' &&
      condition.outsideLastSeen === true &&
      r.pursuit.escape
      ? riding(state, parent) && r.pursuit.escape.unseenSeconds + EPS >= condition.unseenSeconds
      : false;
  if (condition.type === 'choice-permitted')
    return (
      condition.choiceId === 'warning-method' &&
      ['phone', 'accessibility-hotkey'].includes(condition.optionId) &&
      r.warning.method?.id === condition.optionId
    );
  return { unmet: 'unknown-late-meter-observation' };
}
function effectScope(state, batch, request) {
  if (!batch.some((action) => action.type === 'mission-restarted')) return scope(state);
  const d = state.campaign,
    run =
      d?.active ||
      d?.suspended?.find(
        (entry) =>
          entry.missionId === I.mission && entry.resumeInfo?.reason === 'return-to-free-roam',
      ),
    action = batch[0];
  if (
    batch.length !== 1 ||
    action.missionId !== I.mission ||
    request.kind !== 'restart' ||
    request.contentId !== d?.contentId ||
    request.stageId !== run?.stageId ||
    !SOURCE.stages.some((stage) => stage.id === request.stageId) ||
    request.attempt !== (d.attempts[I.mission] || 0) + 1 ||
    request.receipt !==
      `campaign:${d.receiptNamespace || d.contentFingerprint}:${I.mission}:attempt:${request.attempt}:restart` ||
    state.lateMeterRuntime.lastRestoreReason !== 'retry:start' ||
    !run.checkpoints.some((entry) => entry.id === 'start')
  )
    return null;
  return {
    missionId: I.mission,
    stageId: request.stageId,
    attempt: request.attempt,
    activationReceipt: request.receipt,
  };
}
function applyActions(state, batch, request, parent) {
  const m = initializeLateMeterRuntime(state);
  if (
    request.missionId !== I.mission ||
    !id(request.receipt) ||
    batch.some(
      (action) =>
        !actionTypes.has(action.type) ||
        typeof parent.effects?.handlers?.[action.type] !== 'function',
    )
  )
    return gate('unregistered-late-meter-effect');
  if (own(m.transactions, request.receipt)) return { ok: true, replayed: true };
  const owner = effectScope(state, batch, request);
  if (!owner) return gate('validated-late-meter-effect-scope-unavailable');
  return atomic(state, parent, 'effects', () => {
    const receipts = [];
    for (let index = 0; index < batch.length; index++) {
      const action = batch[index],
        receiptId = `lm:effect:${hash(request.receipt)}:${index}`;
      if (action.type === 'actor-route' && (action.actor !== I.felix || action.to !== 'taxi curb'))
        return gate('unknown-late-meter-actor-route');
      if (action.type === 'evidence-note' && action.id !== I.evidence)
        return gate('unknown-late-meter-evidence');
      const result = sync(parent.effects.handlers[action.type], state, copy(action), {
        id: receiptId,
        directorReceipt: request.receipt,
        scope: owner,
      });
      if (
        !accepted(result) ||
        result.receipt?.id !== receiptId ||
        sync(parent.effects.verifyReceipt, state, result.receipt) !== true
      )
        return gate(`late-meter-effect-not-committed:${action.type}`);
      receipts.push(copy(result.receipt));
    }
    m.transactions[request.receipt] = {
      kind: request.kind,
      scope: owner,
      receipts,
    };
    if (batch.some((action) => action.type === 'mission-failed')) m.active.phase = 'failed';
    if (batch.some((action) => action.type === 'mission-suspended')) m.active.phase = 'suspended';
    if (batch.some((action) => ['campaign-reward', 'mission-abandoned'].includes(action.type)))
      m.active.phase = 'finished';
    m.sequence++;
    return { ok: true };
  });
}
export function createLateMeterAdapters(state, parent) {
  initializeLateMeterRuntime(state);
  return {
    get capabilities() {
      return readiness(state, parent);
    },
    supportsMission: (missionId) =>
      missionId === I.mission && !lateMeterIntegrationGates(state, parent).length,
    supportsStage: (type, stage) => stage.type === type && supportedStage(stage, parent),
    activateStage: (stage, request) => activate(state, stage, request, parent),
    supportsCondition: (type) => conditionTypes.has(type),
    observe: (condition, request) => observe(state, condition, request, parent),
    canCompleteStage: (stage, request) =>
      request.missionId === I.mission && supportedStage(stage, parent)
        ? state.lateMeterRuntime.active?.blocked
          ? { unmet: state.lateMeterRuntime.active.blocked }
          : stage.id === 'warn'
            ? Boolean(
                state.lateMeterRuntime.run.warning.method &&
                state.lateMeterRuntime.run.warning.delivered,
              )
            : true
        : { unmet: 'unknown-late-meter-stage-completion' },
    supportsAction: (type) =>
      actionTypes.has(type) && typeof parent.effects?.handlers?.[type] === 'function',
    applyActions: (batch, request) => applyActions(state, batch, request, parent),
    captureWorld: () => capture(state, parent),
    validateWorld: (snapshot) => {
      try {
        validateLateMeterRuntime(snapshot);
        return !own(snapshot, 'campaign') && sync(parent.snapshots?.validate, snapshot) === true;
      } catch {
        return false;
      }
    },
    restoreWorld: (snapshot, request) => restore(state, snapshot, parent, request.reason),
  };
}
export function lateMeterView(state, parent) {
  const m = initializeLateMeterRuntime(state),
    a = m.active,
    r = m.run;
  if (!a)
    return {
      active: false,
      preparation: copy(m.preparation),
      restoreEpoch: m.restoreEpoch,
      inputEpoch: m.restoreEpoch,
      cameraEpoch: m.restoreEpoch,
      integrationGates: lateMeterIntegrationGates(state, parent),
      releaseValidated: false,
    };
  const stage = mission(parent).stages.find((entry) => entry.id === a.stageId);
  let target = null,
    dialogueReady = false;
  if (a.stageId === 'counter') {
    target = riding(state, parent)
      ? annex(parent).parkingBay.pose
      : state.player.vehicleId === r.rideId
        ? dispatch(parent).entry
        : ride(state);
    dialogueReady = riding(state, parent);
  }
  if (a.stageId === 'lookout') {
    target = annex(parent).parkingBay.pose;
    dialogueReady = sync(parent.dialogue?.annexReady, state) === true;
  }
  if (a.stageId === 'warn') {
    dialogueReady = sync(parent.phone.view, state)?.phase === 'connected';
  }
  if (a.stageId === 'extract') {
    target = ride(state);
    dialogueReady = riding(state, parent);
  }
  if (a.stageId === 'return') {
    const d = dispatch(parent);
    target = {
      x: d.stop.x + d.stop.w / 2,
      y: d.stop.y + d.stop.h / 2,
      z: d.stop.z ?? 0,
      sceneId: null,
    };
    dialogueReady = riding(state, parent);
  }
  return {
    active: a.phase === 'running',
    missionId: I.mission,
    title: SOURCE.title,
    stageId: a.stageId,
    objective: stage.objective,
    requiredVehicleId: r.rideId,
    target: target ? copy(target) : null,
    dialogueReady: a.phase === 'running' && dialogueReady,
    autoDialogue: ['counter', 'extract', 'return'].includes(a.stageId) && dialogueReady,
    dialogueSource: a.stageId === 'warn' ? 'phone' : 'director',
    phone: a.stageId === 'warn' ? sync(parent.phone.view, state) : null,
    recognitionReady:
      a.phase === 'running' &&
      a.stageId === 'lookout' &&
      dialogueFinished(state) &&
      Boolean(r.lookoutExchange) &&
      physicallyParked(state, ride(state), annex(parent).parkingBay, parent) &&
      state.time < a.startedAt + 45,
    warningSecondsRemaining: r.recognition ? Math.max(0, r.recognition.at + 18 - state.time) : null,
    pursuit: copy(r.pursuit),
    restoreEpoch: m.restoreEpoch,
    inputEpoch: m.restoreEpoch,
    cameraEpoch: m.restoreEpoch,
    blocked: a.blocked,
    releaseValidated: false,
  };
}
export function validateLateMeterRuntime(state) {
  const m = state.lateMeterRuntime;
  copy(m);
  if (
    !object(m) ||
    m.version !== VERSION ||
    !Number.isSafeInteger(m.sequence) ||
    m.sequence < 0 ||
    !Number.isSafeInteger(m.restoreEpoch) ||
    m.restoreEpoch < 0 ||
    !finite(m.lastObservedTime) ||
    m.lastObservedTime > state.time + EPS ||
    !object(m.activations) ||
    !object(m.transactions) ||
    !object(m.preparation) ||
    !object(m.run)
  )
    throw Error('Invalid saved Late Meter runtime.');
  const validScope = (value) =>
    object(value) &&
    value.missionId === I.mission &&
    SOURCE.stages.some((stage) => stage.id === value.stageId) &&
    Number.isSafeInteger(value.attempt) &&
    value.attempt > 0 &&
    id(value.activationReceipt);
  if (
    m.active &&
    (!validScope({ ...m.active, activationReceipt: m.active.receipt }) ||
      !['running', 'failed', 'finished', 'suspended'].includes(m.active.phase) ||
      !finite(m.active.startedAt) ||
      m.active.startedAt > state.time + EPS)
  )
    throw Error('Invalid Late Meter physical stage.');
  const r = m.run;
  if (
    m.active &&
    (![I.felix, I.yara, I.reeve, I.watcher].every((id) =>
      state.companions?.actors?.some((a) => a.id === id),
    ) ||
      !state.vehicles?.some((v) => v.id === r.rideId) ||
      !state.vehicles?.some((v) => v.id === I.pursuer))
  )
    throw Error('Missing persistent campaign physical principals.');
  if (
    !(r.rideId === null || id(r.rideId)) ||
    !(r.startedAt === null || (finite(r.startedAt) && r.startedAt <= state.time + EPS)) ||
    !finite(r.abandonmentSeconds) ||
    r.abandonmentSeconds < 0 ||
    typeof r.playerDead !== 'boolean' ||
    typeof r.playerArrested !== 'boolean' ||
    !object(r.warning) ||
    !object(r.pursuit) ||
    !object(r.itineraries) ||
    !object(r.counterTrip) ||
    !finite(r.counterTrip.distance) ||
    r.counterTrip.distance < 0 ||
    !finite(r.parkedSeconds) ||
    r.parkedSeconds < 0 ||
    !Array.isArray(r.damageEvents) ||
    !Array.isArray(r.attackEvents) ||
    typeof r.attackUnmet !== 'boolean' ||
    ![r.damageCheckedAt, r.attackCheckedAt].every(
      (t) => finite(t) && t >= 0 && t <= state.time + EPS,
    )
  )
    throw Error('Invalid Late Meter physical observations.');
  for (const receipt of [r.counterDelivered, r.recognition, r.returned, r.pursuit.escape])
    if (
      receipt !== null &&
      (!object(receipt) ||
        !id(receipt.id) ||
        !finite(receipt.at) ||
        receipt.at > state.time + EPS ||
        !validScope(receipt.scope))
    )
      throw Error('Invalid Late Meter observed receipt.');
  if (
    r.lookoutExchange &&
    (r.lookoutExchange.lineCount !== 2 ||
      r.lookoutExchange.scope.stageId !== 'lookout' ||
      r.approachStartedAt !== r.lookoutExchange.at)
  )
    throw Error('Unproved actual lookout exchange.');
  if (r.recognition && (!r.lookoutExchange || r.recognition.at < r.lookoutExchange.at))
    throw Error('Collector recognition precedes required bargaining.');
  if (
    r.recognition &&
    (r.recognition.explicitInput !== true ||
      r.recognition.cameraVisible !== true ||
      r.recognition.lineOfSight !== true ||
      !point(r.recognition.observerPose) ||
      !point(r.recognition.actorPose) ||
      r.recognition.range !== 180 ||
      scene(r.recognition.observerPose) !== null ||
      scene(r.recognition.actorPose) !== null ||
      distance(r.recognition.observerPose, r.recognition.actorPose) > r.recognition.range + EPS ||
      r.recognition.actorId !== I.reeve ||
      !Array.isArray(r.recognition.clues) ||
      !['grey tow jacket', 'co-op repossession clipboard'].every((clue) =>
        r.recognition.clues.includes(clue),
      ))
  )
    throw Error('Invalid real collector identification.');
  if (m.active && m.active.stageId !== 'counter' && !r.counterDelivered)
    throw Error('Later stage lacks actual counter delivery history.');
  if (m.active && ['extract', 'return'].includes(m.active.stageId) && !r.warning.delivered)
    throw Error('Extraction lacks actual outgoing warning.');
  if (m.active?.stageId === 'return' && !r.pursuit.escape)
    throw Error('Return lacks actual escape.');
  const p = r.pursuit;
  if (
    !(p.startedAt === null || (finite(p.startedAt) && p.startedAt <= state.time + EPS)) ||
    !(p.lastSeenAt === null || (finite(p.lastSeenAt) && p.lastSeenAt <= state.time + EPS)) ||
    !(p.driverId === null || [I.reeve, I.watcher].includes(p.driverId)) ||
    typeof p.started !== 'boolean' ||
    typeof p.observedOnce !== 'boolean' ||
    !finite(p.unseenSeconds) ||
    p.unseenSeconds < 0 ||
    !Array.isArray(p.route) ||
    !p.route.every(point) ||
    !Number.isSafeInteger(p.routeIndex) ||
    p.routeIndex < 0 ||
    p.routeIndex > p.route.length ||
    !(p.lastSeen === null || point(p.lastSeen))
  )
    throw Error('Invalid collector pursuit observations.');
  if (
    p.lastVehiclePose !== null &&
    (!point(p.lastVehiclePose) ||
      p.lastVehiclePose.sceneId !== null ||
      p.lastVehiclePose.vehicleId !== I.pursuer ||
      ![I.reeve, I.watcher].includes(p.lastVehiclePose.driverId) ||
      !finite(p.lastVehiclePose.at) ||
      p.lastVehiclePose.at > state.time + EPS)
  )
    throw Error('Invalid actual collector vehicle motion sample.');
  if (
    p.escape &&
    (!p.started ||
      !p.observedOnce ||
      !p.lastSeen ||
      p.escape.vehicleId !== r.rideId ||
      (![I.reeve, I.watcher].includes(p.escape.driverId) &&
        p.escape.resolution !== 'physically-disabled-threat') ||
      p.escape.pursuerVehicleId !== I.pursuer ||
      p.escape.unseenSeconds + EPS < 10 ||
      p.escape.at + EPS < p.startedAt + 10 ||
      p.escape.at + EPS < p.escape.lastSeenAt + 10 ||
      !finite(p.escape.outsideRadius) ||
      p.escape.outsideRadius <= 0 ||
      !point(p.escape.vehiclePose) ||
      distance(p.escape.vehiclePose, p.escape.lastSeen) <= p.escape.outsideRadius)
  )
    throw Error('Unproved actual collector escape.');
  if (
    r.counterTrip.boardedAt !== null &&
    (!finite(r.counterTrip.boardedAt) ||
      r.counterTrip.boardedAt < r.startedAt ||
      r.counterTrip.boardedAt > state.time + EPS ||
      !point(r.counterTrip.pickupPose))
  )
    throw Error('Invalid actual passenger pickup observation.');
  if (
    r.counterDelivered &&
    (r.counterTrip.boardedAt === null ||
      !point(r.counterDelivered.vehiclePose) ||
      !point(r.counterDelivered.pose) ||
      r.counterDelivered.actorId !== I.felix ||
      r.counterDelivered.vehicleId !== r.rideId ||
      r.counterDelivered.pose.sceneId !== 'impound-annex' ||
      r.counterDelivered.trip.boardedAt !== r.counterTrip.boardedAt ||
      r.counterDelivered.trip.distance < 1)
  )
    throw Error('Unproved actual counter delivery.');
  if (
    r.returned &&
    (!r.pursuit.escape ||
      !point(r.returned.pose) ||
      !point(r.returned.vehiclePose) ||
      r.returned.actorId !== I.felix ||
      r.returned.vehicleId !== r.rideId ||
      r.returned.pose.sceneId !== 'voss-dispatch' ||
      r.returned.at < r.pursuit.escape.at)
  )
    throw Error('Unproved actual return delivery.');
  if (
    r.doorReachedAt !== null &&
    (!finite(r.doorReachedAt) ||
      r.doorReachedAt < r.startedAt ||
      r.doorReachedAt > state.time + EPS)
  )
    throw Error('Invalid actual collector door time.');
  const w = r.warning;
  if (
    w.owner !== null &&
    (!object(w.owner) ||
      w.owner.missionId !== I.mission ||
      w.owner.stageId !== 'warn' ||
      !Number.isSafeInteger(w.owner.attempt) ||
      w.owner.attempt < 1 ||
      !id(w.owner.receipt) ||
      !id(w.callId) ||
      !r.recognition)
  )
    throw Error('Invalid saved warning call owner.');
  if (
    w.method !== null &&
    (!object(w.method) ||
      !['phone', 'accessibility-hotkey'].includes(w.method.id) ||
      !id(w.method.inputReceipt) ||
      !validScope(w.method.scope) ||
      !finite(w.method.at) ||
      w.method.at < r.recognition?.at ||
      w.method.at > state.time + EPS)
  )
    throw Error('Invalid actual warning input.');
  if (
    w.delivered !== null &&
    (!w.owner ||
      !w.method ||
      w.delivered.kind !== 'delivered' ||
      w.delivered.direction !== 'outgoing' ||
      w.delivered.contact !== I.felix ||
      w.delivered.topic !== 'collector-warning' ||
      JSON.stringify(w.delivered.owner) !== JSON.stringify(w.owner) ||
      !finite(w.delivered.at) ||
      w.delivered.at < r.recognition.at ||
      w.delivered.at >= r.recognition.at + 18 ||
      (r.doorReachedAt !== null && w.delivered.at >= r.doorReachedAt))
  )
    throw Error('Unproved timely actual warning.');
  for (const event of r.damageEvents)
    if (
      !id(event.id) ||
      !validScope(event.scope) ||
      !finite(event.at) ||
      event.at < r.startedAt ||
      event.at > state.time + EPS ||
      !id(event.owner) ||
      !point(event) ||
      !['healthBefore', 'healthAfter', 'armourBefore', 'armourAfter'].every(
        (key) => finite(event[key]) && event[key] >= 0,
      ) ||
      event.healthBefore < event.healthAfter ||
      event.armourBefore < event.armourAfter ||
      (event.healthBefore === event.healthAfter && event.armourBefore === event.armourAfter)
    )
      throw Error('Invalid saved committed damage.');
  for (const event of r.attackEvents)
    if (
      !id(event.id) ||
      !validScope(event.scope) ||
      !finite(event.at) ||
      event.at < r.startedAt ||
      event.at > state.time + EPS ||
      !id(event.owner) ||
      !point(event) ||
      !Number.isSafeInteger(event.serial) ||
      event.serial <= 0 ||
      ![true, false, null].includes(event.perceived)
    )
      throw Error('Invalid saved performed attack.');
  if (
    new Set(r.damageEvents.map((e) => e.id)).size !== r.damageEvents.length ||
    new Set(r.attackEvents.map((e) => e.id)).size !== r.attackEvents.length ||
    r.damageEvents.length > 1024 ||
    r.attackEvents.length > 1024
  )
    throw Error('Invalid observation ledger capacity or duplicates.');
  for (const [actorId, route] of Object.entries(r.itineraries))
    if (
      !id(actorId) ||
      !Array.isArray(route.points) ||
      !route.points.length ||
      !route.points.every(point) ||
      !Number.isSafeInteger(route.index) ||
      route.index < 0 ||
      route.index > route.points.length ||
      typeof route.finished !== 'boolean' ||
      !finite(route.speed) ||
      route.speed <= 0 ||
      !finite(route.blockedSeconds) ||
      route.blockedSeconds < 0 ||
      !(
        route.arrivedAt === null ||
        (finite(route.arrivedAt) && route.arrivedAt <= state.time + EPS)
      )
    )
      throw Error('Invalid saved actual actor itinerary.');
  for (const [receipt, record] of Object.entries(m.activations))
    if (
      !id(receipt) ||
      !validScope(record.scope) ||
      !finite(record.at) ||
      record.at > state.time + EPS
    )
      throw Error('Invalid Late Meter activation receipt.');
  for (const [receipt, record] of Object.entries(m.transactions))
    if (
      !id(receipt) ||
      !validScope(record.scope) ||
      !Array.isArray(record.receipts) ||
      record.receipts.some((entry) => !id(entry.id) || entry.status !== 'committed')
    )
      throw Error('Invalid Late Meter transaction receipt.');
  return true;
}
