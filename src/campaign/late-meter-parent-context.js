/** Real Late Meter parent bindings. Engine supplies physics, presentation and whole saves.
 * Missing integrations remain unavailable. This module never drives a car by setting its pose.
 */
import * as companions from '../companions.js';
import * as phone from '../phone-calls.js';
import { INTERIOR_LAYOUTS, PORTAL_DEFINITIONS } from '../interiors.js';
import { actorSceneId } from '../scene-context.js';
import { FIRST_ARC_MISSIONS } from './first-arc.js';
import { applyStoryInventoryEffect } from './shelter-services.js';
import {
  LATE_METER_IDS as I,
  initializeLateMeterRuntime,
  validateLateMeterRuntime,
  lateMeterDamageEvents,
  lateMeterAttackEvents,
} from './late-meter-runtime.js';
import {
  LATE_METER_CLIPBOARD,
  lateMeterPropDescriptors,
  impoundAudibility,
} from './late-meter-scenes.js';

const SOURCE = FIRST_ARC_MISSIONS.find((entry) => entry.id === I.mission);
const EPS = 1e-6;
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const own = (v, key) => object(v) && Object.hasOwn(v, key);
const id = (v) =>
  typeof v === 'string' &&
  /^[a-z0-9][a-z0-9:._-]{0,255}$/i.test(v) &&
  !['__proto__', 'prototype', 'constructor', 'toJSON'].includes(v);
const point = (v) => object(v) && [v.x, v.y, v.z ?? 0].every(finite);
const pose = (v) => ({ x: v.x, y: v.y, z: v.z ?? 0, sceneId: actorSceneId(v) });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const accepted = (v) => v === true || (object(v) && v.ok === true);
const gate = (reason) => ({ ok: false, unmet: [reason] });
const lifecycle = ['mission-failed', 'mission-abandoned', 'mission-suspended', 'mission-restarted'];
const kinds = ['actor-route', 'evidence-note', 'authored-effect', 'campaign-reward', ...lifecycle];
const PROP_RECEIPT = 'late-meter:prop:reeve-repossession-clipboard';
export function isLateMeterClipboard(prop) {
  try {
    prop = copy(prop);
  } catch {
    return false;
  }
  const mutable = ['state', 'ownerActorId', 'visible', 'sceneId'];
  return (
    object(prop) &&
    prop.id === LATE_METER_CLIPBOARD.id &&
    prop.kind === LATE_METER_CLIPBOARD.kind &&
    prop.version === 1 &&
    ['carried', 'dropped', 'destroyed'].includes(prop.state) &&
    typeof prop.visible === 'boolean' &&
    (prop.state === 'carried' ? prop.ownerActorId === I.reeve : prop.ownerActorId === null) &&
    Object.keys(LATE_METER_CLIPBOARD)
      .filter((key) => !mutable.includes(key))
      .every((key) => equal(prop[key], LATE_METER_CLIPBOARD[key])) &&
    Object.keys(prop).every(
      (key) =>
        Object.hasOwn(LATE_METER_CLIPBOARD, key) ||
        ['x', 'y', 'z', 'angle', 'health'].includes(key),
    ) &&
    (prop.sceneId === null ||
      (typeof prop.sceneId === 'string' && Boolean(INTERIOR_LAYOUTS[prop.sceneId]))) &&
    (prop.health === undefined ||
      (finite(prop.health) && prop.health >= 0 && prop.health <= 100)) &&
    (prop.state === 'destroyed'
      ? prop.health === 0 && prop.visible === false
      : (prop.health ?? 100) > 0 && prop.visible === true) &&
    (prop.state === 'carried'
      ? !['x', 'y', 'z', 'angle'].some((key) => own(prop, key))
      : point(prop) &&
        Math.abs(prop.x) <= 1e9 &&
        Math.abs(prop.y) <= 1e9 &&
        Math.abs(prop.z ?? 0) <= 1e6 &&
        finite(prop.angle) &&
        Math.abs(prop.angle) <= Math.PI * 4)
  );
}
function copy(value) {
  const seen = new Set();
  let count = 0;
  function visit(v, depth) {
    if (++count > 300000 || depth > 100) throw Error('Late Meter parent JSON exceeds its limits.');
    if (v === null || typeof v === 'boolean' || typeof v === 'string' || finite(v)) return v;
    if (
      !v ||
      typeof v !== 'object' ||
      seen.has(v) ||
      ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(v))
    )
      throw Error('Unsafe Late Meter parent JSON.');
    seen.add(v);
    const result = Array.isArray(v) ? [] : {};
    for (const key of Reflect.ownKeys(v)) {
      if (key === 'length' && Array.isArray(v)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      if (
        typeof key !== 'string' ||
        ['__proto__', 'prototype', 'constructor', 'toJSON'].includes(key) ||
        !descriptor?.enumerable ||
        !Object.hasOwn(descriptor, 'value')
      )
        throw Error('Unsafe Late Meter parent property.');
      result[key] = visit(descriptor.value, depth + 1);
    }
    if (Array.isArray(v) && Object.keys(result).length !== v.length)
      throw Error('Sparse Late Meter parent array.');
    seen.delete(v);
    return result;
  }
  return visit(value, 0);
}
function sync(fn, ...args) {
  const result = typeof fn === 'function' ? fn(...args) : undefined;
  if (result && typeof result.then === 'function')
    throw Error('Late Meter engine callbacks must be synchronous.');
  return result;
}
const functions = (provider, keys) => keys.every((key) => typeof provider?.[key] === 'function');
function scopeValid(value) {
  return (
    object(value) &&
    value.missionId === I.mission &&
    SOURCE.stages.some((s) => s.id === value.stageId) &&
    Number.isSafeInteger(value.attempt) &&
    value.attempt > 0 &&
    id(value.activationReceipt)
  );
}
const activeScope = (s) => {
  const a = s.lateMeterRuntime?.active;
  return a
    ? {
        missionId: a.missionId,
        stageId: a.stageId,
        attempt: a.attempt,
        activationReceipt: a.receipt,
      }
    : null;
};
const ownerScope = (owner) => ({
  missionId: owner.missionId,
  stageId: owner.stageId,
  attempt: owner.attempt,
  activationReceipt: owner.receipt,
});
const receiptOwner = (scope) => ({
  missionId: scope.missionId,
  stageId: scope.stageId,
  attempt: scope.attempt,
  receipt: scope.activationReceipt,
});
function committedScope(s, scope) {
  const run = s.campaign?.active,
    receipt = s.campaign?.receipts?.[scope?.activationReceipt];
  return (
    scopeValid(scope) &&
    equal(scope, activeScope(s)) &&
    run?.missionId === I.mission &&
    run.stageId === scope.stageId &&
    run.attempt === scope.attempt &&
    receipt?.kind === 'stage-activation' &&
    receipt.missionId === I.mission &&
    receipt.stageId === scope.stageId &&
    receipt.attempt === scope.attempt
  );
}
function near(body, target) {
  return (
    point(body) &&
    point(target) &&
    actorSceneId(body) === actorSceneId(target) &&
    Math.abs((body.z ?? 0) - (target.z ?? 0)) <= 3 &&
    distance(body, target) <= (target.radius ?? 8) + EPS
  );
}
function parked(car, bay, specs) {
  const spec = specs?.[car?.spec];
  if (
    !car ||
    car.health <= 0 ||
    actorSceneId(car) !== null ||
    !spec ||
    !point(bay) ||
    !finite(bay.w) ||
    !finite(bay.h) ||
    Math.abs(car.speed ?? 0) > (bay.maxSpeed ?? bay.speedBelow ?? 2) + EPS ||
    Math.abs((car.z ?? 0) - (bay.z ?? 0)) > 3
  )
    return false;
  if (
    finite(bay.angle) &&
    Math.abs(Math.atan2(Math.sin(car.angle - bay.angle), Math.cos(car.angle - bay.angle))) >
      (bay.angleTolerance ?? Math.PI / 8) + EPS
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
  return [-spec.length / 2, spec.length / 2].every((x) =>
    [-spec.width / 2, spec.width / 2].every((y) => {
      const px = car.x + x * c - y * s,
        py = car.y + x * s + y * c;
      return (
        px >= bay.x - EPS &&
        px <= bay.x + bay.w + EPS &&
        py >= bay.y - EPS &&
        py <= bay.y + bay.h + EPS
      );
    }),
  );
}
function dialogueFinished(s, mission, stageId) {
  const dialogue = s.campaign?.active?.dialogue,
    authored = mission.stages.find((stage) => stage.id === stageId)?.dialogue;
  return (
    dialogue?.kind === 'stage' &&
    equal(dialogue.lines, authored) &&
    dialogue.index === authored?.length
  );
}
export function initializeLateMeterParentState(state) {
  initializeLateMeterRuntime(state);
  companions.initializeCompanions(state);
  phone.initializePhoneCalls(state);
  state.lateMeterEffects ??= { version: 1, receipts: {} };
  if (state.lateMeterEffects.version !== 1 || !object(state.lateMeterEffects.receipts))
    throw Error('Unsupported Late Meter parent ledger.');
  return state.lateMeterEffects;
}

export function createLateMeterParentContext(state, engine = {}) {
  initializeLateMeterParentState(state);
  const mission = copy(engine.authoredMission ?? SOURCE);
  const readBindings = () => {
    const supplied =
      typeof engine.bindings === 'function'
        ? sync(engine.bindings)
        : (engine.bindings ?? engine.world?.campaignSceneBindings);
    if (!supplied) return {};
    const result = copy(supplied),
      d = result.dispatch,
      room = INTERIOR_LAYOUTS[d?.roomId],
      mark = room?.actors.find((a) => a.castId === 'felix-voss'),
      portal = PORTAL_DEFINITIONS.find((p) => p.roomId === d?.roomId);
    if (d && mark && portal) {
      d.portalId = portal.id;
      d.felixTarget = { x: mark.x, y: mark.y, z: room.floorZ, sceneId: room.id, radius: 10 };
    }
    return result;
  };
  // Bindings are authored catalogue geometry; runtime bodies are always looked up anew.
  const bindings = readBindings(),
    a = bindings['impound-counter'],
    d = bindings.dispatch;
  const actor = (s, actorId) => companions.getActor(s, actorId);
  const vehicle = (s, vehicleId) => s.vehicles?.find((v) => v.id === vehicleId) ?? null;
  const physical = () =>
    functions(engine.companionContext, [
      'moveBody',
      'isBlocked',
      'hasLineOfSight',
      'surfaceHeight',
      'findRoute',
      'transitionScene',
    ]);
  const snapshotsReady = () => functions(engine.snapshots, ['capture', 'validate', 'restore']);
  const phoneReady = () =>
    engine.ready?.phone === true &&
    engine.phone?.ready === true &&
    engine.phone.nonmodal === true &&
    functions(engine.phone, ['contactAnswered', 'presentationObserved']) &&
    typeof engine.acknowledgeCampaignDialogue === 'function' &&
    snapshotsReady() &&
    own(state.phoneCalls.contacts, I.felix);
  const driversReady = () =>
    engine.ready?.chase === true &&
    engine.drivers?.ready === true &&
    functions(engine.drivers, ['requestDriver', 'observe', 'drive', 'release']) &&
    physical();
  const recognitionReady = () =>
    engine.recognition?.ready === true &&
    typeof engine.recognition.observe === 'function' &&
    engine.ready?.props === true &&
    physical();
  const damageReady = () => engine.damage?.ready === true && engine.damage.observerBound === true;
  const attacksReady = () =>
    engine.attacks?.ready === true &&
    engine.attacks.observerBound === true &&
    typeof engine.attacks.perceived === 'function';
  const safety = () =>
    mission.id === I.mission &&
    mission.failures.some(
      (f) =>
        f.condition?.type === 'protected-target-harmed' &&
        f.condition.requiresPlayerAttribution === true &&
        f.condition.actors?.includes(I.yara) &&
        f.condition.groups?.includes('police') &&
        f.condition.essentialActorDeath?.includes(I.yara),
    ) &&
    mission.failures.some(
      (f) => f.condition?.type === 'lookout-timeout' && f.condition.seconds === 45,
    ) &&
    mission.failures.some(
      (f) =>
        f.condition?.type === 'collector-door-arrived' &&
        f.condition.actor === I.reeve &&
        f.condition.beforeWarning === true,
    );
  function syncSceneProps(s = state) {
    if (engine.ready?.props !== true || !object(s.campaignRuntime?.sceneProps))
      return gate('late-meter-shared-props-unintegrated');
    const reeve = actor(s, I.reeve);
    if (!reeve) return gate('canonical-collector-not-created');
    const ledger = initializeLateMeterParentState(s).receipts;
    if (!own(s.campaignRuntime.sceneProps, LATE_METER_CLIPBOARD.id)) {
      if (own(ledger, PROP_RECEIPT)) return gate('registered-collector-prop-missing');
      s.campaignRuntime.sceneProps[LATE_METER_CLIPBOARD.id] = copy(LATE_METER_CLIPBOARD);
    }
    const prop = s.campaignRuntime.sceneProps[LATE_METER_CLIPBOARD.id];
    if (!isLateMeterClipboard(prop)) return gate('invalid-canonical-collector-prop');
    if (!own(ledger, PROP_RECEIPT)) {
      const scope = activeScope(s);
      if (!scopeValid(scope)) return gate('collector-prop-activation-owner-unavailable');
      ledger[PROP_RECEIPT] = {
        id: PROP_RECEIPT,
        kind: 'scene-prop',
        status: 'committed',
        time: s.time,
        scope,
        propId: LATE_METER_CLIPBOARD.id,
      };
    }
    return { ok: true };
  }
  const passengers = {
    ...companions,
    ensureNamedActor(s, definition, context) {
      definition = copy(definition);
      if (definition.id === I.felix) {
        const existing = actor(s, I.felix);
        return existing ? companions.ensureNamedActor(s, { ...existing }, context) : null;
      }
      const canonical = Object.values(a?.actorSpawns ?? {}).find(
        (entry) => entry.id === definition.id,
      );
      if (!canonical || !equal(definition, canonical)) return null;
      if (
        definition.id === I.reeve &&
        (engine.ready?.props !== true || !object(s.campaignRuntime?.sceneProps))
      )
        return null;
      const result = companions.ensureNamedActor(s, definition, context);
      return definition.id !== I.reeve || syncSceneProps(s).ok ? result : null;
    },
  };
  function sight(s, from, to) {
    if (!point(from) || !point(to) || actorSceneId(from) !== actorSceneId(to) || !physical())
      return false;
    return sync(engine.companionContext.hasLineOfSight, from, to, actorSceneId(from)) === true;
  }
  function ownerStatus(s, owner) {
    if (!object(owner) || !scopeValid(ownerScope(owner))) return 'unknown';
    const m = s.lateMeterRuntime,
      activation = m?.activations?.[owner.receipt],
      run = s.campaign?.active,
      committed = s.campaign?.receipts?.[owner.receipt];
    if (!activation || !equal(activation.scope, ownerScope(owner))) return 'unknown';
    if (
      committed?.kind !== 'stage-activation' ||
      committed.missionId !== owner.missionId ||
      committed.stageId !== owner.stageId ||
      committed.attempt !== owner.attempt
    )
      return 'unknown';
    if (s.campaign?.completed?.[I.mission]) return 'finished';
    if ((s.campaign?.attempts?.[I.mission] ?? 0) > owner.attempt) return 'abandoned';
    const retained = s.campaign?.suspended?.find(
      (r) => r.missionId === I.mission && r.attempt === owner.attempt,
    );
    if (retained)
      return retained.resumeInfo?.reason === 'return-to-free-roam' ? 'abandoned' : 'suspended';
    if (run?.missionId !== I.mission || run.attempt !== owner.attempt) return 'unknown';
    if (run.phase === 'failed' || m.active?.phase === 'failed') return 'failed';
    if (run.stageId !== owner.stageId) return 'finished';
    return m.active?.phase === 'running' &&
      m.active.attempt === owner.attempt &&
      m.active.stageId === owner.stageId &&
      committedScope(s, activeScope(s))
      ? 'active'
      : 'unknown';
  }
  function phoneObserve(s, condition, owner, callId) {
    const r = s.lateMeterRuntime?.run;
    if (
      ownerStatus(s, owner) !== 'active' ||
      owner.stageId !== 'warn' ||
      !equal(owner, r?.warning.owner) ||
      callId !== r.warning.callId
    )
      return { unmet: 'unowned-late-meter-phone-observation' };
    if (condition.type === 'phone-objective-active')
      return condition.missionId === I.mission && condition.stageId === 'warn';
    if (condition.type === 'collector-identification')
      return (
        condition.actor === I.reeve &&
        r.recognition?.explicitInput === true &&
        r.recognition.cameraVisible === true &&
        r.recognition.lineOfSight === true &&
        condition.at === r.recognition.at
      );
    if (condition.type === 'phone-contact-answered') {
      const felix = actor(s, I.felix);
      return (
        condition.actor === I.felix &&
        felix?.health > 0 &&
        actorSceneId(felix) === a.roomId &&
        sync(engine.phone?.contactAnswered, s, I.felix, owner, callId) === true
      );
    }
    if (condition.type === 'collector-warning-permitted') {
      const felix = actor(s, I.felix),
        yara = actor(s, I.yara),
        reeve = actor(s, I.reeve),
        seconds = mission.stages.find((stage) => stage.id === 'warn').clock.seconds;
      return (
        condition.actor === I.felix &&
        condition.collector === I.reeve &&
        condition.before === 'annex-door' &&
        felix?.health > 0 &&
        yara?.health > 0 &&
        actorSceneId(felix) === a.roomId &&
        actorSceneId(yara) === a.roomId &&
        reeve?.health > 0 &&
        actorSceneId(reeve) === null &&
        r.doorReachedAt === null &&
        !near(reeve, { ...(a.collectorApproaches?.east?.doorTarget ?? a.entry), radius: 0.5 }) &&
        r.recognition &&
        s.time + EPS < r.recognition.at + seconds
      );
    }
    return { unmet: `unregistered-late-meter-phone-condition:${condition.type}` };
  }
  const phoneContext = { ownerStatus, observe: phoneObserve };
  const requiredWorld = [
    'player',
    'vehicles',
    'companions',
    'phoneCalls',
    'lateMeterRuntime',
    'lateMeterEffects',
    'interior',
    'wanted',
  ];
  const snapshots = {
    capture(s, options) {
      if (!snapshotsReady()) throw Error('Full Late Meter snapshot callbacks are unavailable.');
      const value = copy(sync(engine.snapshots.capture, s, options));
      if (
        own(value, 'campaign') ||
        !requiredWorld.every((key) => own(value, key)) ||
        !snapshots.validate(value)
      )
        throw Error('A complete director-excluded parent snapshot is required.');
      return value;
    },
    validate(value) {
      try {
        value = copy(value);
        validateLateMeterRuntime(value);
        phone.validatePhoneCalls(value);
        return (
          !own(value, 'campaign') &&
          requiredWorld.every((key) => own(value, key)) &&
          sync(engine.snapshots?.validate, value) === true &&
          validateLateMeterParentState(value, mission) === true
        );
      } catch {
        return false;
      }
    },
    restore(s, value, request) {
      if (!snapshots.validate(value)) return gate('invalid-full-late-meter-parent-snapshot');
      return sync(engine.snapshots.restore, s, copy(value), request);
    },
  };
  function phoneTransaction(s, operation) {
    if (!snapshotsReady()) return gate('full-phone-acknowledgment-rollback-unavailable');
    const before = snapshots.capture(s, { exclude: ['campaign'] }),
      director = s.campaign,
      directorBefore = copy(director),
      priorEpoch = s.lateMeterRuntime.restoreEpoch;
    const rollback = () => {
      if (
        !accepted(
          snapshots.restore(s, before, {
            reason: 'rollback:phone-dialogue',
            preserve: ['campaign'],
          }),
        )
      )
        throw Error('Phone acknowledgment rollback failed.');
      for (const key of Object.keys(director)) delete director[key];
      Object.assign(director, directorBefore);
      s.campaign = director;
      const model = initializeLateMeterRuntime(s);
      model.restoreEpoch = Math.max(priorEpoch, model.restoreEpoch) + 1;
      model.lastObservedTime = s.time;
      model.lastRestoreReason = 'rollback:phone-dialogue';
      phone.setPhonePresentationVisibility(s, false);
    };
    try {
      const result = operation();
      if (result.ok) return result;
      rollback();
      return result;
    } catch (error) {
      rollback();
      throw error;
    }
  }
  function mirrorAcknowledgment(s, ack) {
    if (!ack || ack.kind !== 'conversation' || ownerStatus(s, ack.owner) !== 'active')
      return gate('unowned-phone-dialogue-acknowledgment');
    const line = mission.stages.find((stage) => stage.id === 'warn').dialogue[ack.index],
      dialogue = s.campaign.active.dialogue,
      ledger = s.lateMeterEffects.receipts;
    if (
      !line ||
      line.speaker !== ack.speaker ||
      line.text !== ack.text ||
      !equal(dialogue.lines, mission.stages.find((stage) => stage.id === 'warn').dialogue) ||
      dialogue.kind !== 'stage'
    )
      return gate('phone-dialogue-content-mismatch');
    const old = ledger[ack.id];
    if (old)
      return equal(old.phoneReceipt, ack) && dialogue.index > ack.index
        ? { ok: true, replayed: true }
        : gate('phone-dialogue-mirror-conflict');
    if (
      dialogue.index < ack.index ||
      dialogue.index > mission.stages.find((stage) => stage.id === 'warn').dialogue.length
    )
      return gate('phone-dialogue-index-mismatch');
    if (dialogue.index === ack.index) {
      const originalRun = s.campaign.active,
        scope = activeScope(s),
        result = sync(engine.acknowledgeCampaignDialogue, s, {
          callId: ack.callId,
          index: ack.index,
          dialCount: ack.dialCount,
          phoneReceipt: copy(ack),
          owner: copy(ack.owner),
        });
      if (
        !accepted(result) ||
        s.campaign.active !== originalRun ||
        !equal(activeScope(s), scope) ||
        dialogue.index !== ack.index + 1 ||
        s.campaign.active.dialogue !== dialogue ||
        !committedScope(s, scope)
      )
        return gate('composed-phone-dialogue-acknowledgment-declined');
    }
    ledger[ack.id] = {
      id: ack.id,
      kind: 'phone-dialogue',
      status: 'committed',
      time: s.time,
      scope: ownerScope(ack.owner),
      phoneReceipt: copy(ack),
    };
    return { ok: true };
  }
  const phoneBindings = {
    get ready() {
      return phoneReady();
    },
    warningDefinition: phone.collectorWarningDefinition,
    register(s, definition) {
      if (!phoneReady()) return gate('nonmodal-phone-not-integrated');
      definition = copy(definition);
      const r = s.lateMeterRuntime.run;
      if (
        !r.recognition ||
        !r.warning.owner ||
        !equal(
          definition,
          phone.collectorWarningDefinition(mission, r.warning.owner, {
            id: r.warning.callId,
            identifiedAt: r.recognition.at,
          }),
        )
      )
        return gate('unregistered-late-meter-phone-definition');
      return phone.registerPhoneCall(s, definition, phoneContext);
    },
    act(s, action) {
      action = copy(action);
      if (!phoneReady()) return gate('nonmodal-phone-not-integrated');
      if (action.type !== 'acknowledge') return phone.actPhoneCalls(s, action, phoneContext);
      if (
        sync(engine.phone.presentationObserved, s, {
          callId: action.id,
          index: action.index,
          dialCount: action.dialCount,
        }) !== true
      )
        return gate('actual-phone-presentation-not-observed');
      return phoneTransaction(s, () => {
        const result = phone.actPhoneCalls(s, action, phoneContext);
        if (!result.acknowledged) return result;
        const mirrored = mirrorAcknowledgment(s, result.acknowledgment);
        return mirrored.ok
          ? { ...result, ok: true, deliveryPending: result.ok !== true }
          : mirrored;
      });
    },
    tick(s, dt) {
      return phone.updatePhoneCalls(s, dt, { ...phoneContext, paused: engine.paused === true });
    },
    present(s, callId, index, dialCount) {
      if (
        !phoneReady() ||
        !Number.isSafeInteger(dialCount) ||
        dialCount < 1 ||
        sync(engine.phone.presentationObserved, s, { callId, index, dialCount }) !== true
      )
        return false;
      return phone.presentPhoneLine(s, callId, index, dialCount);
    },
    hide: phone.setPhonePresentationVisibility,
    view: phone.phoneCallView,
    acknowledgments: phone.phoneAcknowledgments,
    outcome: phone.phoneOutcome,
    validate: phone.validatePhoneCalls,
  };
  const drivers = {
    get ready() {
      return driversReady();
    },
    requestDriver(s, actorId, vehicleId) {
      if (
        !driversReady() ||
        actorId !== I.reeve ||
        vehicleId !== I.pursuer ||
        actor(s, actorId)?.health <= 0
      )
        return gate('canonical-collector-driver-unavailable');
      return sync(engine.drivers.requestDriver, s, actorId, vehicleId);
    },
    observe(s, vehicleId) {
      if (!driversReady() || vehicleId !== I.pursuer)
        return { unmet: 'collector-driver-unintegrated' };
      const actual = companions.driverObservation(s, vehicleId, engine.companionContext),
        observed = sync(engine.drivers.observe, s, vehicleId);
      if (!actual) return observed === null ? null : { unmet: 'unregistered-collector-driver' };
      if (
        actual.unmet ||
        !observed ||
        observed.unmet ||
        actual.actorId !== I.reeve ||
        observed.actorId !== actual.actorId ||
        observed.vehicleId !== vehicleId ||
        observed.seat !== 0 ||
        observed.seated !== actual.seated ||
        observed.alive !== actual.alive ||
        observed.controllable !== actual.controllable ||
        !equal(observed.pose, actual.pose) ||
        !equal(observed.eye, actual.eye)
      )
        return { unmet: 'collector-driver-observation-mismatch' };
      return copy(actual);
    },
    drive(s, vehicleId, dt, input) {
      const observed = drivers.observe(s, vehicleId);
      if (observed?.controllable !== true || !finite(dt) || dt < 0 || dt > 0.5)
        return gate('actual-seated-collector-driver-required');
      input = copy(input);
      if (
        !['up', 'brake', 'left', 'right'].every((key) => typeof input[key] === 'boolean') ||
        Object.keys(input).some((key) => !['up', 'brake', 'left', 'right'].includes(key))
      )
        return gate('invalid-collector-drive-input');
      return sync(engine.drivers.drive, s, vehicleId, dt, input);
    },
    release(s, vehicleId, reason) {
      return driversReady() && vehicleId === I.pursuer && typeof reason === 'string'
        ? sync(engine.drivers.release, s, vehicleId, reason)
        : gate('collector-driver-release-unintegrated');
    },
  };
  const recognition = {
    get ready() {
      return recognitionReady();
    },
    observe(s, actorId, expectedClues, inputReceipt) {
      expectedClues = copy(expectedClues);
      const rule = mission.stages
          .find((stage) => stage.id === 'lookout')
          .completion.find((c) => c.type === 'identified-actor'),
        target = actor(s, actorId),
        range = a?.observation?.recognitionRange;
      if (
        !recognitionReady() ||
        !id(inputReceipt) ||
        actorId !== I.reeve ||
        !equal(expectedClues, rule.evidence) ||
        !committedScope(s, activeScope(s)) ||
        s.lateMeterRuntime.active.stageId !== 'lookout' ||
        !dialogueFinished(s, mission, 'lookout') ||
        s.lateMeterRuntime.run.lookoutExchange?.lineCount !== 2 ||
        s.time + EPS >= s.lateMeterRuntime.active.startedAt + 45 ||
        !parked(vehicle(s, s.lateMeterRuntime.run.rideId), a.parkingBay, engine.specs) ||
        s.wanted.level ||
        s.player.health <= 0 ||
        !target ||
        target.health <= 0 ||
        actorSceneId(s.player) !== null ||
        actorSceneId(target) !== null ||
        !finite(range) ||
        distance(s.player, target) > range + EPS ||
        !sight(s, s.player, target)
      )
        return gate('actual-visible-collector-recognition-unavailable');
      const descriptor = lateMeterPropDescriptors(s).find(
        (p) =>
          p.id === a.observation.requiredPropId &&
          p.ownerActorId === actorId &&
          p.state === 'carried',
      );
      if (target.appearance?.id !== a.observation.requiredAppearanceId || !descriptor)
        return gate('canonical-visible-clue-props-unavailable');
      const observed = sync(engine.recognition.observe, s, actorId, expectedClues, inputReceipt);
      if (!observed) return gate('rendered-clue-observer-unavailable');
      const result = copy(observed);
      if (
        !result ||
        result.explicitInput !== true ||
        result.cameraVisible !== true ||
        !id(result.id) ||
        result.at !== s.time ||
        !Array.isArray(result.renderedClues) ||
        !a.observation.clueIds.every((clue) => result.renderedClues.includes(clue))
      )
        return gate('rendered-clues-not-explicitly-recognized');
      return {
        ok: true,
        receipt: {
          id: result.id,
          actorId,
          at: s.time,
          clues: expectedClues,
          renderedClueIds: copy(result.renderedClues),
          explicitInput: true,
          cameraVisible: true,
          lineOfSight: true,
          observerPose: pose(s.player),
          actorPose: pose(target),
          range,
          inputReceipt,
        },
      };
    },
  };
  function allowedScope(s, action, request) {
    if (action.type !== 'mission-restarted') return committedScope(s, request.scope);
    const c = s.campaign,
      run =
        c?.active ??
        c?.suspended?.find(
          (r) => r.missionId === I.mission && r.resumeInfo?.reason === 'return-to-free-roam',
        ),
      next = (c?.attempts?.[I.mission] ?? 0) + 1,
      token = `campaign:${c?.receiptNamespace || c?.contentFingerprint}:${I.mission}:attempt:${next}:restart`;
    return (
      scopeValid(request.scope) &&
      action.missionId === I.mission &&
      run?.missionId === I.mission &&
      run.stageId === request.scope.stageId &&
      request.scope.attempt === next &&
      request.scope.activationReceipt === token &&
      request.directorReceipt === token &&
      s.lateMeterRuntime.lastRestoreReason === 'retry:start' &&
      run.checkpoints?.some((p) => p.id === 'start')
    );
  }
  function terminalProof(s) {
    const r = s.lateMeterRuntime.run,
      felix = actor(s, I.felix),
      car = vehicle(s, r.rideId),
      warning =
        r.warning.owner &&
        phone.phoneOutcome(s, {
          kind: 'delivered',
          direction: 'outgoing',
          contact: I.felix,
          topic: 'collector-warning',
          owner: r.warning.owner,
        }),
      method = r.warning.method,
      option = mission.choices
        .find((entry) => entry.id === 'warning-method')
        ?.options.find((entry) => entry.id === method?.id),
      chosen =
        option &&
        s.campaign?.active?.choices?.['warning-method'] === method.id &&
        Object.values(s.lateMeterEffects.receipts).some(
          (entry) =>
            entry.kind === 'authored-effect' &&
            entry.scope.stageId === 'warn' &&
            option.effects.includes(entry.action.text) &&
            equal(entry.proof, method),
        );
    try {
      validateLateMeterRuntime(s);
      phone.validatePhoneCalls(s);
    } catch {
      return false;
    }
    return (
      s.lateMeterRuntime.active?.stageId === 'return' &&
      s.lateMeterRuntime.active.phase === 'running' &&
      warning &&
      chosen &&
      equal(warning, r.warning.delivered) &&
      r.pursuit.escape &&
      r.returned &&
      equal(r.returned.scope, activeScope(s)) &&
      felix?.health > 0 &&
      !felix.vehicleId &&
      near(felix, d.felixTarget) &&
      car?.spec === 'taxi' &&
      parked(car, d.stop, engine.specs) &&
      !s.wanted.level &&
      s.player.health > 0 &&
      dialogueFinished(s, mission, 'return')
    );
  }
  function recordEffect(s, action, request, perform) {
    action = copy(action);
    request = copy(request);
    if (
      !id(request.id) ||
      !id(request.directorReceipt) ||
      !scopeValid(request.scope) ||
      !kinds.includes(action.type)
    )
      return gate('invalid-late-meter-effect-request');
    const ledger = initializeLateMeterParentState(s).receipts,
      old = ledger[request.id];
    if (old)
      return equal(old.action, action) &&
        equal(old.scope, request.scope) &&
        old.directorReceipt === request.directorReceipt
        ? { ok: true, replayed: true, receipt: copy(old) }
        : gate('late-meter-effect-receipt-conflict');
    if (
      action.type === 'campaign-reward' &&
      Object.values(ledger).some((entry) => entry.kind === 'campaign-reward')
    )
      return gate('late-meter-reward-already-committed');
    if (Object.keys(ledger).length >= 4096 || !allowedScope(s, action, request))
      return gate('unowned-late-meter-effect');
    const result = perform(action, request);
    if (!accepted(result)) return result ?? gate('late-meter-effect-declined');
    const receipt = {
      id: request.id,
      kind: action.type,
      status: 'committed',
      time: s.time,
      directorReceipt: request.directorReceipt,
      scope: copy(request.scope),
      action: copy(action),
      proof: copy(result.proof ?? null),
    };
    ledger[request.id] = receipt;
    return { ok: true, receipt: copy(receipt) };
  }
  const handlers = {};
  handlers['actor-route'] = (s, action, request) =>
    recordEffect(s, action, request, (action) => {
      const r = s.lateMeterRuntime.run,
        felix = actor(s, I.felix),
        target = a?.felixDoorToTaxi?.at(-1),
        outcome =
          r.warning.owner &&
          phone.phoneOutcome(s, {
            kind: 'delivered',
            direction: 'outgoing',
            contact: I.felix,
            topic: 'collector-warning',
            owner: r.warning.owner,
          });
      if (
        action.actor !== I.felix ||
        action.to !== 'taxi curb' ||
        s.lateMeterRuntime.active.stageId !== 'warn' ||
        !outcome ||
        !equal(outcome, r.warning.delivered) ||
        !dialogueFinished(s, mission, 'warn') ||
        !felix ||
        felix.health <= 0 ||
        !point(target)
      )
        return gate('actual-warning-and-felix-route-required');
      return companions.requestEscort(
        s,
        I.felix,
        { ...target, sceneId: null, radius: 2 },
        engine.companionContext,
      );
    });
  handlers['authored-effect'] = (s, action, request) =>
    recordEffect(s, action, request, (action) => {
      const selected = s.lateMeterRuntime.run.warning.method,
        option = mission.choices
          .find((choice) => choice.id === 'warning-method')
          ?.options.find((entry) => entry.id === selected?.id);
      return s.lateMeterRuntime.active.stageId === 'warn' &&
        selected &&
        id(selected.inputReceipt) &&
        selected.at <= s.time &&
        option?.effects.includes(action.text) &&
        Object.keys(action).every((key) => ['type', 'text'].includes(key))
        ? { ok: true, proof: copy(selected) }
        : gate('actual-warning-input-choice-required');
    });
  handlers['evidence-note'] = (s, action, request) =>
    recordEffect(s, action, request, (action, request) => {
      if (action.id !== I.evidence || !terminalProof(s))
        return gate('actual-final-invoices-delivery-required');
      const result = applyStoryInventoryEffect(s, action, request.id);
      return result.ok ? { ok: true, proof: result.receipt } : result;
    });
  handlers['campaign-reward'] = (s, action, request) =>
    recordEffect(s, action, request, (action) => {
      if (
        mission.rewards.cash !== 120 ||
        !equal(action.rewards, mission.rewards) ||
        !terminalProof(s) ||
        !finite(s.player.money) ||
        !s.storyInventory?.evidence?.includes(I.evidence)
      )
        return gate('actual-late-meter-terminal-proof-required');
      const before = s.player.money;
      s.player.money += 120;
      if (finite(s.progress?.cashEarned)) s.progress.cashEarned += 120;
      return {
        ok: true,
        proof: {
          cash: 120,
          moneyBefore: before,
          moneyAfter: s.player.money,
          returnedId: s.lateMeterRuntime.run.returned.id,
          warningId: s.lateMeterRuntime.run.warning.delivered.id,
          escapeId: s.lateMeterRuntime.run.pursuit.escape.id,
        },
      };
    });
  for (const kind of lifecycle)
    handlers[kind] = (s, action, request) =>
      recordEffect(s, action, request, () => {
        if (kind === 'mission-failed') {
          const failure =
            mission.failures.find((entry) => entry.id === action.failureId) ??
            (mission.commonFailures.includes(action.failureId)
              ? { condition: { type: action.failureId }, resumeCheckpoint: 'start' }
              : null);
          if (
            !failure ||
            !equal(action.condition, failure.condition) ||
            action.resumeCheckpoint !== failure.resumeCheckpoint
          )
            return gate('unknown-late-meter-failure');
        } else if (action.missionId !== I.mission) return gate('unknown-late-meter-lifecycle');
        const warning = s.lateMeterRuntime.run.warning,
          call = warning.callId && s.phoneCalls.calls[warning.callId];
        if (
          call &&
          ownerStatus(s, call.definition.owner) === 'active' &&
          s.phoneCalls.activeId === call.id
        )
          phone.actPhoneCalls(s, { type: 'hang-up', id: call.id }, phoneContext);
        else phone.updatePhoneCalls(s, 0, phoneContext);
        const result = drivers.release(s, I.pursuer, kind);
        if (!accepted(result)) return result;
        sync(
          engine.notify,
          kind === 'mission-failed'
            ? 'Late Meter was interrupted. Retry from a real checkpoint or return to the city.'
            : 'Late Meter left unfinished.',
        );
        return { ok: true };
      });
  return {
    authoredMission: mission,
    world: engine.world,
    terrain: engine.terrain,
    bindings,
    get ready() {
      return {
        passengers: engine.ready?.passengers === true && physical(),
        interior: Boolean(
          engine.ready?.interior === true && a?.ready === true && d?.ready === true,
        ),
        phone: phoneReady(),
        chase: driversReady(),
        director:
          engine.ready?.director === true &&
          safety() &&
          engine.ready?.props === true &&
          snapshotsReady() &&
          physical() &&
          functions(engine, ['moveActor', 'poseActor', 'createVehicle', 'chooseCampaignOption']) &&
          recognitionReady() &&
          damageReady() &&
          attacksReady(),
      };
    },
    passengers,
    companionContext: engine.companionContext,
    phone: phoneBindings,
    drivers,
    recognition,
    sight,
    snapshots,
    syncSceneProps,
    damage: {
      get ready() {
        return damageReady();
      },
      events(s, since) {
        return damageReady()
          ? lateMeterDamageEvents(s, since)
          : { unmet: 'actual-damage-observer-unbound' };
      },
    },
    attacks: {
      get ready() {
        return attacksReady();
      },
      events(s, since) {
        return attacksReady()
          ? lateMeterAttackEvents(s, since)
          : { unmet: 'actual-attack-observer-unbound' };
      },
      perceived(s, event, collectorIds) {
        return attacksReady()
          ? sync(engine.attacks.perceived, s, copy(event), copy(collectorIds))
          : undefined;
      },
    },
    director: {
      chooseOption: (s, choiceId, optionId) =>
        typeof engine.chooseCampaignOption === 'function'
          ? sync(engine.chooseCampaignOption, s, choiceId, optionId)
          : gate('composed-director-choice-unintegrated'),
    },
    observations: {
      playerArrested: (s, since) =>
        finite(s.policeDispatch?.lastArrest?.time) && s.policeDispatch.lastArrest.time >= since,
    },
    rooms: {
      hasRoom: (roomId) => Boolean(INTERIOR_LAYOUTS[roomId]),
      hasPortal: (portalId) => PORTAL_DEFINITIONS.some((entry) => entry.id === portalId),
    },
    dialogue: {
      annexReady(s) {
        const result = impoundAudibility(s, engine.world, s.player, {
          getActor: (actorId) => actor(s, actorId),
          hasExteriorLineOfSight: (from, to) => sight(s, from, to),
          hasInteriorLineOfSight: (roomId, from, to) =>
            sight(s, { ...from, sceneId: roomId }, { ...to, sceneId: roomId }),
        });
        return (
          result.audible && [I.felix, I.yara].every((actorId) => result.speakers.includes(actorId))
        );
      },
    },
    actors: {
      move(s, actorId, dx, dy, radius) {
        const body = actor(s, actorId),
          record = s.companions.records.find((entry) => entry.id === actorId);
        if (
          ![I.reeve, I.watcher].includes(actorId) ||
          !body ||
          body.health <= 0 ||
          body.vehicleId ||
          record?.reservedVehicleId ||
          record?.transition ||
          !finite(dx) ||
          !finite(dy) ||
          radius !== 7 ||
          typeof engine.moveActor !== 'function'
        )
          return gate('actual-scripted-collector-movement-unavailable');
        const before = pose(body);
        let result;
        try {
          result = sync(engine.moveActor, actorId, dx, dy, radius);
        } catch (error) {
          Object.assign(body, before);
          throw error;
        }
        if (
          (!accepted(result) && typeof result !== 'boolean') ||
          !point(body) ||
          actorSceneId(body) !== before.sceneId ||
          distance(before, body) > Math.hypot(dx, dy) + EPS
        ) {
          Object.assign(body, before);
          return gate('collector-movement-declined-or-teleported');
        }
        return { ok: true, moved: distance(before, body) };
      },
      pose(s, actorId, desired) {
        desired = copy(desired);
        const body = actor(s, actorId);
        if (
          ![I.reeve, I.watcher].includes(actorId) ||
          !body ||
          body.health <= 0 ||
          body.vehicleId ||
          typeof engine.poseActor !== 'function' ||
          !['walk', 'idle', 'read-clipboard'].includes(desired.action) ||
          !(desired.angle === null || finite(desired.angle))
        )
          return gate('actual-collector-pose-unavailable');
        const before = pose(body);
        let result;
        try {
          result = sync(engine.poseActor, actorId, desired);
        } catch (error) {
          Object.assign(body, before);
          throw error;
        }
        if (!accepted(result) || !equal(pose(body), before)) {
          Object.assign(body, before);
          return gate('collector-pose-callback-moved-body');
        }
        return { ok: true };
      },
    },
    vehicles: {
      specs: engine.specs,
      chooseTaxi(s) {
        const available = (car) =>
          car.spec === 'taxi' &&
          car.health > 0 &&
          actorSceneId(car) === null &&
          !car.policeControlled &&
          (!car.occupied || s.player.vehicleId === car.id) &&
          companions.playerDriverAdmission(s, car.id).allowed;
        const candidates = (s.vehicles ?? []).filter(
            (car) =>
              available(car) &&
              (car.owned === true || s.player.vehicleId === car.id || car.stolen === true),
          ),
          atPickup = candidates.filter((car) => parked(car, d?.stop, engine.specs)),
          preferred = atPickup.length ? atPickup : candidates,
          selected =
            preferred.find((car) => car.id === 'arc-arrival-taxi' && car.owned === true) ||
            preferred.find((car) => car.owned === true) ||
            preferred.find((car) => s.player.vehicleId === car.id || car.stolen === true);
        return selected ?? null;
      },
      ensure(s, definition) {
        definition = copy(definition);
        const expected = {
          ...a?.pursuerSpawn,
          id: I.pursuer,
          spec: a?.pursuerSpawn?.spec ?? 'sedan',
          kind: 'parked',
          missionVehicle: true,
        };
        if (!equal(definition, expected)) return gate('unregistered-collector-vehicle-spawn');
        const existing = vehicle(s, I.pursuer);
        if (existing)
          return existing.spec === 'sedan'
            ? { ok: true, existing: true }
            : gate('collector-vehicle-identity-conflict');
        if (typeof engine.createVehicle !== 'function')
          return gate('actual-collector-vehicle-factory-unavailable');
        const made = sync(engine.createVehicle, copy(definition));
        if (
          !made ||
          made.id !== I.pursuer ||
          made.spec !== 'sedan' ||
          !point(made) ||
          !near(made, { ...definition, sceneId: null, radius: EPS }) ||
          made.health <= 0 ||
          made.speed !== 0
        )
          return gate('actual-collector-vehicle-spawn-declined');
        if (!vehicle(s, I.pursuer)) s.vehicles.push(made);
        return vehicle(s, I.pursuer) === made
          ? { ok: true }
          : gate('collector-vehicle-factory-ownership-conflict');
      },
    },
    effects: {
      handlers,
      verifyReceipt(s, receipt) {
        try {
          receipt = copy(receipt);
          return (
            own(s.lateMeterEffects?.receipts, receipt?.id) &&
            equal(s.lateMeterEffects.receipts[receipt.id], receipt) &&
            receipt.status === 'committed'
          );
        } catch {
          return false;
        }
      },
    },
    validateState: (s) => validateLateMeterParentState(s, mission),
  };
}

export function validateLateMeterParentState(state, authoredMission = SOURCE) {
  const m = copy(state.lateMeterEffects);
  const authored = copy(authoredMission);
  let rewardCount = 0;
  if (
    !object(m) ||
    m.version !== 1 ||
    !object(m.receipts) ||
    Object.keys(m).some((key) => !['version', 'receipts'].includes(key)) ||
    Object.keys(m.receipts).length > 4096
  )
    throw Error('Invalid Late Meter parent ledger.');
  for (const [key, r] of Object.entries(m.receipts)) {
    if (
      !id(key) ||
      r.id !== key ||
      r.status !== 'committed' ||
      !finite(r.time) ||
      r.time < 0 ||
      r.time > state.time + EPS ||
      !scopeValid(r.scope)
    )
      throw Error('Invalid saved Late Meter parent receipt.');
    if (r.kind === 'scene-prop') {
      const activation = state.lateMeterRuntime?.activations?.[r.scope.activationReceipt];
      if (
        key !== PROP_RECEIPT ||
        r.propId !== LATE_METER_CLIPBOARD.id ||
        !equal(activation?.scope, r.scope) ||
        !isLateMeterClipboard(state.campaignRuntime?.sceneProps?.[r.propId])
      )
        throw Error('Unproved saved collector prop registration.');
      const prop = state.campaignRuntime.sceneProps[r.propId],
        carrier = prop.state === 'carried' && companions.getActor(state, prop.ownerActorId);
      if (
        prop.state === 'carried' &&
        (!carrier || carrier.health <= 0 || actorSceneId(carrier) !== prop.sceneId)
      )
        throw Error('The saved clipboard has no living carrier in its scene.');
    } else if (r.kind === 'phone-dialogue') {
      const ack = r.phoneReceipt,
        call = state.phoneCalls?.calls?.[ack?.callId];
      if (
        !call ||
        ack.kind !== 'conversation' ||
        r.id !== ack.id ||
        !equal(ownerScope(ack.owner), r.scope) ||
        !phone.phoneAcknowledgments(state, ack.callId).some((entry) => equal(entry, ack))
      )
        throw Error('Unproved saved phone-dialogue mirror.');
    } else {
      if (!kinds.includes(r.kind) || r.action?.type !== r.kind || !id(r.directorReceipt))
        throw Error('Invalid saved Late Meter effect.');
      if (
        r.kind === 'actor-route' &&
        (r.action.actor !== I.felix || r.action.to !== 'taxi curb' || r.scope.stageId !== 'warn')
      )
        throw Error('Invalid saved collector warning route.');
      if (r.kind === 'authored-effect') {
        const option = authored.choices
          .find((entry) => entry.id === 'warning-method')
          ?.options.find((entry) => entry.id === r.proof?.id);
        if (
          r.scope.stageId !== 'warn' ||
          !option?.effects.includes(r.action.text) ||
          !id(r.proof.inputReceipt) ||
          !finite(r.proof.at) ||
          r.proof.at > r.time
        )
          throw Error('Unproved saved warning input effect.');
      }
      if (lifecycle.includes(r.kind)) {
        if (r.kind === 'mission-failed') {
          const failure =
            authored.failures.find((entry) => entry.id === r.action.failureId) ??
            (authored.commonFailures.includes(r.action.failureId)
              ? { condition: { type: r.action.failureId }, resumeCheckpoint: 'start' }
              : null);
          if (
            !failure ||
            !equal(failure.condition, r.action.condition) ||
            failure.resumeCheckpoint !== r.action.resumeCheckpoint
          )
            throw Error('Invalid saved Late Meter failure effect.');
        } else if (r.action.missionId !== I.mission)
          throw Error('Invalid saved Late Meter lifecycle owner.');
      }
      if (
        r.kind === 'evidence-note' &&
        (r.action.id !== I.evidence ||
          state.storyInventory?.receipts?.[key]?.itemId !== I.evidence ||
          !state.storyInventory.evidence.includes(I.evidence))
      )
        throw Error('Unproved saved Late Meter evidence.');
      if (
        r.kind === 'campaign-reward' &&
        (++rewardCount > 1 ||
          !equal(r.action.rewards, authored.rewards) ||
          r.action.rewards?.cash !== 120 ||
          r.proof?.cash !== 120 ||
          !finite(r.proof.moneyBefore) ||
          !finite(r.proof.moneyAfter) ||
          r.proof.moneyAfter - r.proof.moneyBefore !== 120 ||
          !id(r.proof.returnedId) ||
          !id(r.proof.warningId) ||
          !id(r.proof.escapeId) ||
          r.proof.returnedId !== state.lateMeterRuntime?.run.returned?.id ||
          r.proof.escapeId !== state.lateMeterRuntime?.run.pursuit.escape?.id ||
          r.proof.warningId !== state.lateMeterRuntime?.run.warning.delivered?.id)
      )
        throw Error('Unproved saved Late Meter reward.');
    }
  }
  return true;
}
