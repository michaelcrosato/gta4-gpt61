/** Scoped combat intent for the shared canonical cast; no duplicate hostile bodies. */
import * as Companions from './companions.js';
import { actorSceneId } from './scene-context.js';
import { campaignReceiptNamespace } from './campaign/director.js';

const MISSION = 'LL-ST-003',
  STAGE = 'dispatch-threat';
export const NAMED_HOSTILE_ROLES = Object.freeze({
  'LL-ARC-DAX': Object.freeze({ weapon: 'knife', speed: 32, reach: 18 }),
  'LL-ARC-PEL': Object.freeze({ weapon: 'unarmed', speed: 30, reach: 18 }),
});
const own = (v, k) => !!v && Object.hasOwn(v, k);
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const finite = Number.isFinite,
  distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const point = (v) => object(v) && [v.x, v.y, v.z ?? 0].every(finite);
const id = (v) =>
  typeof v === 'string' &&
  /^[a-z0-9][a-z0-9:._-]{0,255}$/i.test(v) &&
  !['constructor', 'prototype', '__proto__', 'toJSON'].includes(v);
const copy = (v) => JSON.parse(JSON.stringify(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = (reason) => ({ ok: false, reason });
function validScope(scope) {
  return (
    object(scope) &&
    Object.keys(scope).length === 4 &&
    scope.missionId === MISSION &&
    scope.stageId === STAGE &&
    Number.isSafeInteger(scope.attempt) &&
    scope.attempt > 0 &&
    id(scope.activationReceipt)
  );
}
function currentScope(state, scope) {
  const run = state.campaign?.active,
    receipt = state.campaign?.receipts?.[scope?.activationReceipt];
  return (
    validScope(scope) &&
    run?.missionId === MISSION &&
    run.stageId === STAGE &&
    run.phase === 'running' &&
    run.attempt === scope.attempt &&
    receipt?.kind === 'stage-activation' &&
    receipt.missionId === MISSION &&
    receipt.stageId === STAGE &&
    receipt.attempt === scope.attempt
  );
}
function model(state) {
  return (state.namedHostility ??= {
    version: 1,
    namespace: campaignReceiptNamespace(state.campaign),
    records: {},
  });
}
function record(state, actorId) {
  return own(state.namedHostility?.records, actorId) ? state.namedHostility.records[actorId] : null;
}
function actor(state, actorId) {
  return Companions.getActor(state, actorId);
}
function pose(a) {
  return { x: a.x, y: a.y, z: a.z ?? 0, sceneId: actorSceneId(a) };
}
function control(state, actorId, scope) {
  const r = record(state, actorId),
    a = actor(state, actorId);
  return r && a && a.health > 0 && same(r.scope, scope) && currentScope(state, scope)
    ? { r, a }
    : null;
}
export function registerNamedHostile(state, request) {
  const actorId = request?.actorId,
    a = actor(state, actorId),
    role = NAMED_HOSTILE_ROLES[actorId],
    scope = request?.scope;
  if (
    !role ||
    !a ||
    a.health <= 0 ||
    !currentScope(state, scope) ||
    actorSceneId(a) !== 'voss-dispatch' ||
    a.vehicleId ||
    state.companions.records.find((r) => r.id === actorId)?.reservedVehicleId
  )
    return fail('actual-canonical-threat-unavailable');
  const old = record(state, actorId);
  if (old)
    return same(old.scope, scope)
      ? { ok: true, replayed: true, receipt: copy(old.registration) }
      : fail('named-threat-already-owned');
  if (a.weapon !== role.weapon) return fail('actual-authored-threat-weapon-unavailable');
  const registration = {
    id: 'named-threat:' + scope.activationReceipt + ':' + actorId,
    kind: 'named-hostile-registration',
    actorId,
    scope: copy(scope),
    at: state.time,
    pose: pose(a),
    weapon: a.weapon,
  };
  model(state).records[actorId] = {
    actorId,
    scope: copy(scope),
    mode: 'threat',
    registration,
    engagedAt: null,
    releasedAt: null,
    retreat: null,
    path: [],
    pathIndex: 0,
    nextPlanAt: 0,
  };
  return { ok: true, receipt: copy(registration) };
}
export function engageNamedHostile(state, actorId, scope) {
  const c = control(state, actorId, scope);
  if (!c || !['threat', 'combat'].includes(c.r.mode)) return fail('actual-named-threat-not-owned');
  c.r.mode = 'combat';
  c.r.engagedAt ??= state.time;
  return { ok: true, registrationId: c.r.registration.id };
}
export function requestNamedRetreat(state, actorId, target, scope, context) {
  const c = control(state, actorId, scope);
  if (
    !c ||
    !point(target) ||
    target.sceneId !== null ||
    !finite(target.radius) ||
    target.radius < 1 ||
    target.radius > 20 ||
    typeof context?.allowedRetreatTarget !== 'function' ||
    context.allowedRetreatTarget(actorId, target) !== true
  )
    return fail('actual-registered-retreat-target-required');
  if (c.r.retreat) {
    return same(c.r.retreat.target, target)
      ? { ok: true, replayed: true, receipt: copy(c.r.retreat) }
      : fail('retreat-target-conflict');
  }
  const result = Companions.requestEscort(state, actorId, target, context);
  if (!result.ok) return result;
  c.a.meleeAction = null;
  c.r.mode = 'retreat';
  c.r.path = [];
  c.r.pathIndex = 0;
  c.r.retreat = {
    id: 'named-retreat:' + scope.activationReceipt + ':' + actorId,
    kind: 'physical-retreat-order',
    actorId,
    scope: copy(scope),
    at: state.time,
    from: pose(c.a),
    target: copy(target),
    arrivedAt: null,
    arrivalPose: null,
  };
  return { ok: true, receipt: copy(c.r.retreat) };
}
export function releaseNamedHostile(state, actorId, scope) {
  const r = record(state, actorId),
    a = actor(state, actorId);
  if (!r) return { ok: true, unregistered: true };
  if (!same(r.scope, scope)) return fail('named-threat-owner-mismatch');
  if (r.mode === 'released') return { ok: true, replayed: true };
  r.mode = 'released';
  r.releasedAt = state.time;
  r.path = [];
  r.pathIndex = 0;
  if (a) {
    a.meleeAction = null;
    a.speed = 0;
  }
  return { ok: true, registrationId: r.registration.id };
}
export function isNamedHostile(state, actorId) {
  const r = record(state, actorId);
  return !!(
    r &&
    ['threat', 'combat'].includes(r.mode) &&
    currentScope(state, r.scope) &&
    actor(state, actorId)?.health > 0
  );
}
export function namedCombatControlsActor(state, actorId) {
  const r = record(state, actorId);
  return !!(r && ['threat', 'combat'].includes(r.mode) && currentScope(state, r.scope));
}
export function namedHostileObservation(state, actorId) {
  const r = record(state, actorId),
    a = actor(state, actorId);
  if (!r || !a) return null;
  return {
    actorId,
    scope: copy(r.scope),
    mode: r.mode,
    weapon: a.weapon,
    pose: pose(a),
    alive: a.health > 0,
    health: a.health,
    controlled: currentScope(state, r.scope),
    registration: copy(r.registration),
    retreat: r.retreat ? copy(r.retreat) : null,
  };
}
/** Called after world time advances, before shared companion/weapon physics. */
export function updateNamedHostility(state, dt, context) {
  const m = state.namedHostility;
  if (!m) return;
  if (!finite(dt) || dt < 0 || dt > 0.5) throw Error('Invalid named-combat timestep.');
  for (const r of Object.values(m.records)) {
    const a = actor(state, r.actorId),
      role = NAMED_HOSTILE_ROLES[r.actorId];
    if (!a || a.health <= 0 || !currentScope(state, r.scope)) continue;
    if (r.mode === 'retreat') {
      const observed = Companions.companionObservation(state, r.actorId, context);
      if (
        observed?.phase === 'arrived' &&
        actorSceneId(a) === r.retreat.target.sceneId &&
        distance(a, r.retreat.target) <= r.retreat.target.radius &&
        Math.abs((a.z ?? 0) - (r.retreat.target.z ?? 0)) <= 3
      ) {
        r.mode = 'retreated';
        r.retreat.arrivedAt = state.time;
        r.retreat.arrivalPose = pose(a);
      }
      continue;
    }
    if (
      r.mode !== 'combat' ||
      a.vehicleId ||
      actorSceneId(a) !== actorSceneId(state.player) ||
      state.player.health <= 0
    )
      continue;
    a.speed = 0;
    if (a.staggerRemaining > 0 || a.meleeAction) continue;
    const player = state.player,
      range = distance(a, player),
      scene = actorSceneId(a);
    if (range > 500) continue;
    if (range > role.reach || context.hasLineOfSight(a, player, scene) !== true) {
      if (state.time >= r.nextPlanAt || !r.path.length || r.pathIndex >= r.path.length) {
        const path = context.findRoute(a, { ...pose(player), radius: role.reach * 0.7 });
        r.path = Array.isArray(path) ? copy(path) : [];
        r.pathIndex = 0;
        r.nextPlanAt = state.time + 0.5;
      }
      while (r.pathIndex < r.path.length - 1 && distance(a, r.path[r.pathIndex]) < 2) r.pathIndex++;
      const waypoint = r.path[r.pathIndex];
      if (waypoint) {
        const before = pose(a),
          angle = Math.atan2(waypoint.y - a.y, waypoint.x - a.x),
          travel = Math.min(role.speed * dt, distance(a, waypoint));
        context.moveBody(a, Math.cos(angle) * travel, Math.sin(angle) * travel, a.radius ?? 7);
        if (
          actorSceneId(a) !== before.sceneId ||
          distance(before, a) > travel + 1e-6 ||
          Math.abs((a.z ?? 0) - before.z) > 6
        ) {
          Object.assign(a, before);
          a.speed = 0;
          throw Error('Named combat movement exceeded its actual physical step.');
        }
        a.speed = dt > 0 ? distance(before, a) / dt : 0;
        a.angle = angle;
      }
    }
    if (
      distance(a, player) <= role.reach + 1 &&
      context.hasLineOfSight(a, player, scene) === true &&
      a.fireCooldown <= 0
    ) {
      a.angle = Math.atan2(player.y - a.y, player.x - a.x);
      context.fireActor(a);
    }
  }
}
export function validateNamedHostility(state, { expectedNamespace } = {}) {
  if (!state.namedHostility) return true;
  const m = state.namedHostility;
  if (
    !object(m) ||
    m.version !== 1 ||
    !object(m.records) ||
    Object.keys(m.records).length > 2 ||
    !/^[a-f0-9]{8}$/.test(m.namespace) ||
    (state.campaign && m.namespace !== campaignReceiptNamespace(state.campaign)) ||
    (expectedNamespace !== undefined && m.namespace !== expectedNamespace)
  )
    throw Error('Invalid saved canonical hostility registry.');
  for (const [key, r] of Object.entries(m.records)) {
    const a = actor(state, key);
    if (
      !own(NAMED_HOSTILE_ROLES, key) ||
      !a ||
      r.actorId !== key ||
      !validScope(r.scope) ||
      !['threat', 'combat', 'retreat', 'retreated', 'released'].includes(r.mode) ||
      r.registration?.actorId !== key ||
      !same(r.registration.scope, r.scope) ||
      r.registration.kind !== 'named-hostile-registration' ||
      !id(r.registration.id) ||
      r.registration.id !== 'named-threat:' + r.scope.activationReceipt + ':' + key ||
      r.registration.weapon !== NAMED_HOSTILE_ROLES[key].weapon ||
      !finite(r.registration.at) ||
      r.registration.at < 0 ||
      r.registration.at > state.time ||
      !point(r.registration.pose) ||
      r.registration.pose.sceneId !== 'voss-dispatch' ||
      !Array.isArray(r.path) ||
      r.path.length > 512 ||
      !r.path.every(point) ||
      !Number.isSafeInteger(r.pathIndex) ||
      r.pathIndex < 0 ||
      r.pathIndex > r.path.length ||
      !finite(r.nextPlanAt)
    )
      throw Error('Invalid saved named combat ownership.');
    if (
      ![r.engagedAt, r.releasedAt].every(
        (at) => at === null || (finite(at) && at >= r.registration.at && at <= state.time),
      )
    )
      throw Error('Invalid saved named combat lifecycle time.');
    if (
      r.retreat &&
      (!id(r.retreat.id) ||
        r.retreat.actorId !== key ||
        !same(r.retreat.scope, r.scope) ||
        r.retreat.kind !== 'physical-retreat-order' ||
        !point(r.retreat.from) ||
        !point(r.retreat.target) ||
        r.retreat.target.sceneId !== null ||
        !finite(r.retreat.target.radius) ||
        r.retreat.target.radius < 1 ||
        r.retreat.target.radius > 20 ||
        !finite(r.retreat.at) ||
        r.retreat.at > state.time)
    )
      throw Error('Invalid saved physical retreat.');
    if (
      r.mode === 'retreated' &&
      (!finite(r.retreat?.arrivedAt) ||
        r.retreat.arrivedAt > state.time ||
        !point(r.retreat.arrivalPose) ||
        r.retreat.arrivalPose.sceneId !== null ||
        distance(r.retreat.arrivalPose, r.retreat.target) > r.retreat.target.radius)
    )
      throw Error('Unproved saved collector retreat.');
  }
  return true;
}
