import {
  initializePolicing,
  resetPolicing,
  forcePoliceWanted,
  reportObservedCrime,
  updatePolicing,
  relinquishPoliceVehicle,
  validatePoliceSave,
} from './police.js';
import { WORLD, LEGACY_WORLD, ROAD_XS as roadXs, ROAD_YS as roadYs } from './world.js';
import { migrateDispatchSave, DISPATCH_WORLD_MIGRATION } from './dispatch-save-migration.js';
import { createTerrain } from './terrain.js';
import { createSurfaceMovement } from './surface-movement.js';
import { createTwoSeatsBodyContext } from './campaign/two-seats-body-context.js';
import { worldElevation } from './world-elevation.js';
import {
  initializeRail,
  updateRail,
  railPassenger,
  railInteraction,
  interactRail,
  chooseRailStop,
  recoverRail,
  validateRailRuntime,
  resetRailRuntime,
  migrateRailSignals,
} from './rail-runtime.js';
import { railGateBlocked, updateRailImpacts } from './rail-collision.js';
import { initializeWardrobe, validateWardrobe, equipOutfit } from './wardrobe.js';
import { initializeCalendar, clockHour, validateCalendar } from './calendar.js';
import * as PhoneCalls from './phone-calls.js';
import { CAMPAIGN_CONTENT } from './campaign/director.js';
import { createCampaignAdapterRouter } from './campaign/adapter-router.js';
import {
  createLateMeterParentContext,
  initializeLateMeterParentState,
  validateLateMeterParentState,
} from './campaign/late-meter-parent-context.js';
import {
  createLateMeterAdapters,
  tickLateMeterRuntime,
  lateMeterView,
  actLateMeter,
  observeLateMeterDamage,
  observeLateMeterAttack,
  validateLateMeterRuntime,
} from './campaign/late-meter-runtime.js';
import {
  LATE_METER_APPEARANCES,
  LATE_METER_CLIPBOARD,
  lateMeterPropDescriptors,
  closestLateMeterClipboardPoint,
  traceLateMeterClipboard,
} from './campaign/late-meter-scenes.js';
import { TWO_SEATS_APPEARANCES } from './campaign/two-seats-scenes.js';
import {
  createTwoSeatsParentContext,
  initializeTwoSeatsParentState,
  validateTwoSeatsParentState,
  twoSeatsWristView,
} from './campaign/two-seats-parent-context.js';
import {
  createTwoSeatsAdapters,
  tickTwoSeatsRuntime,
  twoSeatsView,
  observeTwoSeatsDisarm,
  observeTwoSeatsDamage,
  validateTwoSeatsRuntime,
} from './campaign/two-seats-runtime.js';
import * as Companions from './companions.js';
import * as NamedHostility from './named-hostility.js';
import { createCampaignPhysicalContext } from './campaign/physical-context.js';
import { findLocalFootPath } from './local-navigation.js';
import {
  initializeCinematics,
  validateCinematics,
  tickCinematics,
  cinematicView,
  skipCinematic,
} from './campaign/cinematics.js';
import {
  initializeSubtitles,
  validateSubtitles,
  subtitleLine,
  presentSubtitle,
  tickSubtitles,
  advanceSubtitle,
} from './campaign/subtitles.js';
import {
  createCampaignParentContext,
  initializeCampaignParentState,
  validateCampaignParentState,
} from './campaign/parent-context.js';
import {
  createCampaignDirector,
  startCampaignMission,
  updateCampaignDirector,
  currentCampaignDialogue,
  advanceCampaignDialogue,
  chooseCampaignOption,
  retryCampaignMission,
  abandonCampaignMission,
  validateCampaignDirector,
  campaignContentFingerprint,
  migrateCampaignDirectorContent,
} from './campaign/director.js';
import {
  createCampaignAdapters,
  tickCampaignRuntime,
  campaignRuntimeView,
  performCampaignService,
  prepareCampaignSave,
  commitCampaignSave,
  rollbackCampaignSave,
  validateCampaignRuntime,
} from './campaign/runtime.js';
import {
  initializeShelterServices,
  tickShelterServices,
  shelterActionView,
  validateShelterServices,
  shelterHook,
  useShelterService,
} from './campaign/shelter-services.js';
import {
  PORTAL_DEFINITIONS,
  INTERIOR_LAYOUTS,
  initializeInteriors,
  nearbyInteriorPortals,
  enterInterior,
  emergencyExteriorReturn,
  tickInterior,
  interiorScene,
  interiorActors,
  interiorCollisionVolumes,
  nearestInteriorInteractable,
  interactInterior,
  toggleInteriorCover,
  withExteriorContext,
  validateInteriorState,
  damageInteriorProp,
} from './interiors.js';
import {
  createSceneContext,
  currentSceneId,
  actorSceneId,
  inScene,
  scenePeople,
  sceneVehicles,
  findScenePerson,
} from './scene-context.js';
import { initializeAmbient, updateAmbient, validateAmbient } from './ambient-city.js';
import {
  WEAPONS,
  SHOP_WEAPONS,
  initializeCombat,
  equipOwnedWeapon,
  acquireWeapon,
  fireCombatWeapon,
  combatDefenseInput,
  updateMelee,
  updateOrdnance,
  hitCombatant,
  predictThrow,
  startActorMelee,
  notifyCommittedDamage,
  validateCombatSave,
} from './combat.js';
export { WORLD, WEAPONS, currentSceneId, scenePeople };
/** LOWLIGHT's deterministic, renderer-independent city simulation. */
const TAU = Math.PI * 2;
const SAVE_VERSION = 1;
export const TERRAIN = createTerrain(WORLD);
const ELEVATION = worldElevation(WORLD);
const twoSeatsBodies = createTwoSeatsBodyContext(WORLD);
const surfaceMovement = createSurfaceMovement(TERRAIN, { canMoveBody: twoSeatsBodies.canMoveBody });
const SCENES = createSceneContext(WORLD, TERRAIN, { canMoveBody: twoSeatsBodies.canMoveBody });
const campaignParents = new WeakMap(),
  physicalContexts = new WeakMap(),
  storyDialogueCache = new WeakMap(),
  lateMeterParents = new WeakMap(),
  twoSeatsParents = new WeakMap(),
  campaignRouters = new WeakMap(),
  renderedStoryClues = new WeakMap(),
  phonePresentations = new WeakMap();
let campaignStorageVerifier = null;
const campaignObservationHandlers = new WeakMap();
/** Runtime callbacks stay outside saved state and read the current restored world. */
export function setCampaignObservationHandlers(state, missionId, handlers) {
  if (!state || typeof state !== 'object' || !/^LL-ST-\d{3}$/.test(missionId))
    throw TypeError('Campaign observation registration needs a state and mission owner.');
  let registry = campaignObservationHandlers.get(state);
  const previous = registry?.get(missionId);
  if (handlers === null) {
    registry?.delete(missionId);
    return previous ? { ...previous } : null;
  }
  if (
    !handlers ||
    typeof handlers !== 'object' ||
    Array.isArray(handlers) ||
    Object.keys(handlers).some((key) => !['damage', 'attack', 'disarm'].includes(key)) ||
    !Object.values(handlers).every((value) => typeof value === 'function') ||
    !Object.keys(handlers).length
  )
    throw TypeError('Campaign observation handlers must be synchronous damage/attack callbacks.');
  if (!registry) {
    registry = new Map();
    campaignObservationHandlers.set(state, registry);
  }
  registry.set(missionId, { ...handlers });
  return previous ? { ...previous } : null;
}
function campaignObservers(state) {
  return campaignObservationHandlers.get(state)?.get(state.campaign?.active?.missionId);
}
/** Read-only canonical dressing view; a renderer never creates an injury. */
export function storyActorDressing(state, actorId) {
  return twoSeatsWristView(state, actorId);
}
export function setCampaignStorageVerifier(verifier) {
  campaignStorageVerifier = verifier;
}
function campaignContext(state) {
  let parent = campaignParents.get(state);
  if (parent) return parent;
  parent = createCampaignParentContext(state, {
    ready: { passengers: true, interior: true, shelter: true, cinematic: true },
    world: WORLD,
    bindings: WORLD.campaignSceneBindings,
    terrain: TERRAIN,
    specs: VEHICLE_SPECS,
    companionContext: companionContext(state),
    actor: (id) => Companions.getActor(state, id),
    moveActor: (id, dx, dy, radius) => {
      const actor =
        id === 'player' || id === 'LL-CHAR-001' ? state.player : Companions.getActor(state, id);
      return actor
        ? companionContext(state).moveBody(actor, dx, dy, radius, { phase: 'cinematic' })
        : false;
    },
    canRest: (s) =>
      s.player.health > 0 &&
      !s.wanted.level &&
      !s.mission &&
      (!s.campaign?.active || s.campaign.active.stageId === 'rest') &&
      !scenePeople(s).some((actor) => actor.kind === 'hostile' && actor.health > 0),
    notify: (text) => notify(state, text),
    confirmStorage: (s, candidate, receipt, proof) => {
      if (
        typeof proof?.bytes !== 'string' ||
        typeof campaignStorageVerifier !== 'function' ||
        campaignStorageVerifier(proof.bytes) !== true
      )
        return false;
      try {
        const stored = JSON.parse(proof.bytes);
        return (
          stored.format === 'lowlight-save' &&
          JSON.stringify(stored.state.shelterServices?.receipts?.[receipt.id]) ===
            JSON.stringify(candidate.shelterServices.receipts[receipt.id]) &&
          JSON.stringify(stored.state.campaignRuntime?.night?.services?.save) ===
            JSON.stringify(candidate.campaignRuntime.night.services.save)
        );
      } catch {
        return false;
      }
    },
    snapshots: {
      capture: (s) =>
        clone(Object.fromEntries(Object.entries(s).filter(([key]) => key !== 'campaign'))),
      validate: (snapshot) => {
        try {
          restoreGame(
            { format: 'lowlight-save', version: SAVE_VERSION, state: snapshot },
            { physicalOnly: true },
          );
          return true;
        } catch {
          return false;
        }
      },
      restore: (s, snapshot) => {
        const director = s.campaign,
          restored = restoreGame(
            { format: 'lowlight-save', version: SAVE_VERSION, state: snapshot },
            { physicalOnly: true },
          );
        for (const key of Object.keys(s)) delete s[key];
        Object.assign(s, restored);
        s.campaign = director;
        resetRailRuntime(s);
        physicalContexts.delete(s);
        campaignParents.delete(s);
        lateMeterParents.delete(s);
        twoSeatsParents.delete(s);
        campaignRouters.delete(s);
        renderedStoryClues.delete(s);
        phonePresentations.delete(s);
        storyDialogueCache.delete(s);
        resetNPCVehicleInputs(s);
        return true;
      },
    },
  });
  campaignParents.set(state, parent);
  return parent;
}
function initializeStoryPhone(state) {
  PhoneCalls.initializePhoneCalls(state, {
    contacts: [
      { id: 'LL-CHAR-002', name: 'Felix Voss' },
      { id: 'dispatch-line', name: 'Voss Dispatch' },
    ],
  });
}
function lateMeterContext(state) {
  let parent = lateMeterParents.get(state);
  if (parent) return parent;
  initializeStoryPhone(state);
  initializeLateMeterParentState(state);
  const physical = companionContext(state);
  parent = createLateMeterParentContext(state, {
    authoredMission: CAMPAIGN_CONTENT.missions.find((mission) => mission.id === 'LL-ST-002'),
    ready: {
      passengers: true,
      interior: true,
      phone: true,
      chase: true,
      director: true,
      props: true,
    },
    world: WORLD,
    bindings: WORLD.campaignSceneBindings,
    terrain: TERRAIN,
    specs: VEHICLE_SPECS,
    companionContext: physical,
    moveActor: (id, dx, dy, radius) => {
      const actor = Companions.getActor(state, id);
      return actor ? physical.moveBody(actor, dx, dy, radius) : false;
    },
    poseActor: (id, pose) => {
      const actor = Companions.getActor(state, id);
      if (!actor) return false;
      if (pose.angle !== null) actor.angle = pose.angle;
      actor.sceneAction = pose.action;
      actor.speed = pose.action === 'walk' ? 18 : 0;
      return { ok: true };
    },
    createVehicle: (definition) => ({ ...createVehicle(state, definition), missionVehicle: true }),
    drivers: {
      ready: true,
      requestDriver: (s, actorId, vehicleId) =>
        Companions.requestDriver(s, actorId, vehicleId, companionContext(s)),
      observe: (s, vehicleId) => Companions.driverObservation(s, vehicleId, companionContext(s)),
      drive: (s, vehicleId, dt, input) => {
        const active = s.lateMeterRuntime.active,
          observed = Companions.driverObservation(s, vehicleId, companionContext(s));
        return queueNPCVehicleInput(s, {
          vehicleId,
          actorId: observed?.actorId,
          dt,
          input,
          scope: {
            missionId: active.missionId,
            stageId: active.stageId,
            attempt: active.attempt,
            activationReceipt: active.receipt,
          },
        });
      },
      release: releaseNPCVehicleInput,
    },
    recognition: {
      ready: true,
      observe: (s, id, clues, inputReceipt) => {
        const proof = renderedStoryClues.get(s)?.get(id),
          actor = Companions.getActor(s, id);
        if (
          !proof ||
          !actor ||
          proof.epoch !== storyRestoreEpoch(s) ||
          s.time - proof.at > 0.2 ||
          s.time < proof.at ||
          distance(actor, proof.pose) > 8 ||
          actorSceneId(actor) !== proof.sceneId ||
          !WORLD.campaignSceneBindings['impound-counter'].observation.clueIds.every((clue) =>
            proof.clues.includes(clue),
          )
        )
          return null;
        return {
          id: inputReceipt,
          at: s.time,
          explicitInput: true,
          cameraVisible: true,
          renderedClues: proof.clues,
        };
      },
    },
    damage: { ready: true, observerBound: true },
    attacks: {
      ready: true,
      observerBound: true,
      perceived: (s, event, ids) =>
        ids.some((id) => {
          const actor = Companions.getActor(s, id);
          if (!actor || actor.health <= 0 || actorSceneId(actor) !== event.sceneId) return false;
          const range = distance(actor, event),
            noisy = WEAPONS[event.weapon]?.mode !== 'melee',
            facing = Math.abs(normalizeAngle(angleTo(actor, event) - actor.angle)) <= Math.PI / 3;
          return (
            range <= (noisy ? 180 : 80) &&
            (noisy || facing) &&
            physical.hasLineOfSight(actor, event, event.sceneId)
          );
        }),
    },
    phone: {
      ready: true,
      nonmodal: true,
      contactAnswered: (s, id) => {
        const actor = Companions.getActor(s, id);
        return Boolean(actor?.health > 0 && actorSceneId(actor) === 'impound-annex');
      },
      presentationObserved: (s, token) => {
        const shown = phonePresentations.get(s);
        return Boolean(
          shown &&
          shown.epoch === storyRestoreEpoch(s) &&
          shown.callId === token.callId &&
          shown.index === token.index &&
          shown.dialCount === token.dialCount,
        );
      },
    },
    acknowledgeCampaignDialogue: (s, token) => {
      const run = s.campaign?.active;
      if (
        run?.missionId !== 'LL-ST-002' ||
        run.stageId !== 'warn' ||
        run.dialogue.index !== token.index ||
        token.owner.receipt !== s.lateMeterRuntime.run.warning.owner?.receipt
      )
        return false;
      return advanceCampaignDialogue(s.campaign, campaignAdapters(s));
    },
    chooseCampaignOption: (s, id, option) =>
      chooseCampaignOption(s.campaign, id, option, campaignAdapters(s)),
    snapshots: campaignContext(state).snapshots,
    notify: (message) => notify(state, message),
  });
  lateMeterParents.set(state, parent);
  setCampaignObservationHandlers(state, 'LL-ST-002', {
    damage: (event) => observeLateMeterDamage(state, event),
    attack: (event) => observeLateMeterAttack(state, event, lateMeterContext(state)),
  });
  return parent;
}
/** Actual registered scenes and native-art composition determine availability;
 * a content catalogue entry alone cannot activate the mission. */
function twoSeatsContext(state) {
  let parent = twoSeatsParents.get(state);
  if (parent) return parent;
  initializeStoryPhone(state);
  initializeTwoSeatsParentState(state);
  const physical = companionContext(state),
    report = WORLD.campaignSceneReports?.['LL-ST-003'],
    bindings = WORLD.campaignSceneBindings;
  parent = createTwoSeatsParentContext(state, {
    authoredMission: CAMPAIGN_CONTENT.missions.find((m) => m.id === 'LL-ST-003'),
    ready: {
      geometry: report?.ready === true,
      passengers: true,
      hostility: true,
      disarm: true,
      handImpairment: true,
      injuryArt: report?.injuryArt === true,
      clothing: true,
      friendship: true,
      director: true,
    },
    world: WORLD,
    bindings,
    sceneReport: report,
    specs: VEHICLE_SPECS,
    actorDefinitions: Object.values(WORLD.campaignActorDefinitions?.['LL-ST-003'] ?? {}),
    companionContext: physical,
    rooms: {
      hasRoom: (id) => Boolean(INTERIOR_LAYOUTS[id]),
      hasPortal: (id) => PORTAL_DEFINITIONS.some((p) => p.id === id),
      layout: (id) => INTERIOR_LAYOUTS[id] ?? null,
    },
    enemies: {
      ready: true,
      register: NamedHostility.registerNamedHostile,
      engage: NamedHostility.engageNamedHostile,
      retreat: (s, id, target, scope) =>
        NamedHostility.requestNamedRetreat(s, id, target, scope, {
          ...namedHostilityContext(s),
          allowedRetreatTarget: (actorId, actual) => {
            const mark = bindings?.dispatch?.encounter?.exteriorRetreat?.at(-1);
            return (
              ['LL-ARC-DAX', 'LL-ARC-PEL'].includes(actorId) &&
              mark &&
              JSON.stringify(actual) === JSON.stringify({ ...mark, sceneId: null, radius: 6 })
            );
          },
        }),
      release: NamedHostility.releaseNamedHostile,
      observe: NamedHostility.namedHostileObservation,
    },
    disarmObserverBound: true,
    damageObserverBound: true,
    damageActor: (s, id, amount, cause) => damageStoryActor(s, id, amount, cause.owner, cause.kind),
    isCivilian: (s, actor) => {
      const threat = NamedHostility.namedHostileObservation(s, actor.id);
      return (
        actor.kind !== 'hostile' &&
        actor.kind !== 'police' &&
        !(threat?.controlled && ['threat', 'combat'].includes(threat.mode))
      );
    },
    chooseCampaignOption: (s, id, option) =>
      chooseCampaignOption(s.campaign, id, option, campaignAdapters(s)),
    snapshots: campaignContext(state).snapshots,
  });
  twoSeatsParents.set(state, parent);
  setCampaignObservationHandlers(state, 'LL-ST-003', {
    damage: (event) => observeTwoSeatsDamage(state, event, twoSeatsContext(state)),
    disarm: (receipt) => observeTwoSeatsDisarm(state, receipt, twoSeatsContext(state)),
  });
  return parent;
}
function campaignAdapters(state) {
  let router = campaignRouters.get(state);
  if (router) return router;
  const night = createCampaignAdapters(state, campaignContext(state)),
    late = createLateMeterAdapters(state, lateMeterContext(state)),
    twoSeats = createTwoSeatsAdapters(state, twoSeatsContext(state)),
    snapshots = campaignContext(state).snapshots;
  router = createCampaignAdapterRouter({
    content: CAMPAIGN_CONTENT,
    registrations: [
      { missionId: 'LL-ST-001', adapter: night },
      { missionId: 'LL-ST-002', adapter: late },
      { missionId: 'LL-ST-003', adapter: twoSeats },
    ],
    parent: {
      captureWorld: () => snapshots.capture(state, { exclude: ['campaign'] }),
      validateWorld: (snapshot) => snapshots.validate(snapshot),
      restoreWorld: (snapshot, request) => {
        const nightEpoch = state.campaignRuntime?.restoreEpoch ?? 0,
          lateEpoch = state.lateMeterRuntime?.restoreEpoch ?? 0,
          twoSeatsEpoch = state.twoSeatsRuntime?.restoreEpoch ?? 0;
        const result = snapshots.restore(state, snapshot, request);
        if (!(result === true || result?.ok)) return result;
        for (const [model, epoch] of [
          [state.campaignRuntime, nightEpoch],
          [state.lateMeterRuntime, lateEpoch],
          [state.twoSeatsRuntime, twoSeatsEpoch],
        ]) {
          if (!model) continue;
          model.restoreEpoch = Math.max(model.restoreEpoch, epoch) + 1;
          model.lastObservedTime = state.time;
          model.lastRestoreReason = request.reason;
        }
        state.campaignPresentation.presented = false;
        state.campaignPresentation.visible = false;
        hideStoryPhone(state);
        return { ok: true };
      },
    },
  });
  campaignRouters.set(state, router);
  return router;
}
function storyRestoreEpoch(state) {
  return (
    String(state.campaignRuntime?.restoreEpoch ?? 0) +
    ':' +
    String(state.lateMeterRuntime?.restoreEpoch ?? 0) +
    ':' +
    String(state.twoSeatsRuntime?.restoreEpoch ?? 0)
  );
}
/** Renderer records only clues actually drawn in the current camera. Never saved. */
export function recordStoryRenderedClues(state, actor, clues) {
  if (!actor || actor.health <= 0 || !Array.isArray(clues)) return;
  let records = renderedStoryClues.get(state);
  if (!records) renderedStoryClues.set(state, (records = new Map()));
  records.set(actor.id, {
    at: state.time,
    epoch: storyRestoreEpoch(state),
    pose: { x: actor.x, y: actor.y },
    sceneId: actorSceneId(actor),
    clues: [...clues],
  });
}
export function recognizeStoryActor(state, actorId, inputReceipt) {
  return actLateMeter(state, { type: 'recognize', actorId, inputReceipt }, lateMeterContext(state));
}
export function dialStoryWarning(state, contact, method, inputReceipt) {
  return actLateMeter(
    state,
    { type: 'dial-warning', contact, method, inputReceipt },
    lateMeterContext(state),
  );
}
export function storyPhoneView(state) {
  return state.phoneCalls ? PhoneCalls.phoneCallView(state) : null;
}
export function presentStoryPhoneLine(state, token) {
  const view = storyPhoneView(state);
  if (
    !view?.line ||
    view.id !== token.callId ||
    view.line.index !== token.index ||
    view.line.dialCount !== token.dialCount
  )
    return false;
  phonePresentations.set(state, { ...token, epoch: storyRestoreEpoch(state) });
  return lateMeterContext(state).phone.present(state, token.callId, token.index, token.dialCount);
}
export function actStoryPhone(state, action) {
  return lateMeterContext(state).phone.act(state, action);
}
export function hideStoryPhone(state) {
  phonePresentations.delete(state);
  if (state.phoneCalls) PhoneCalls.setPhonePresentationVisibility(state, false);
}
export function startStoryMission(state, missionId) {
  if (
    !['LL-ST-002', 'LL-ST-003'].includes(missionId) ||
    state.mission ||
    state.campaign?.active ||
    state.wanted.level
  )
    return { ok: false, reason: 'assignment-unavailable' };
  const felix = Companions.getActor(state, 'LL-CHAR-002');
  if (
    currentSceneId(state) !== 'voss-dispatch' ||
    actorSceneId(felix) !== 'voss-dispatch' ||
    !felix ||
    felix.health <= 0 ||
    distance(state.player, felix) > 35
  )
    return { ok: false, reason: 'speak-to-felix-at-dispatch' };
  const result = startCampaignMission(state.campaign, missionId, campaignAdapters(state));
  if (!result.ok)
    notify(
      state,
      missionId === 'LL-ST-002'
        ? 'Bring a working taxi to the marked dispatch rank, then speak to Felix.'
        : 'This assignment is not ready.',
    );
  return result;
}
/** Actual simulation/world bindings for composed campaign controllers and integration tools. */
export function createSimulationCampaignAdapters(state) {
  return campaignAdapters(state);
}
function startStory(state) {
  initializeCampaignParentState(state);
  state.campaign = createCampaignDirector({ seed: state.initialSeed });
  state.campaignMode = 'story';
  state.campaignPresentation = {
    version: 1,
    lineKey: null,
    elapsed: 0,
    presented: false,
    visible: false,
  };
  const result = startCampaignMission(state.campaign, 'LL-ST-001', campaignAdapters(state));
  if (!result.ok) throw Error(`The campaign arrival is unavailable: ${result.unmet.join(', ')}`);
}
function interruptedStory(state) {
  if (state.campaign?.active) return null;
  return (
    state.campaign?.suspended.find(
      (run) =>
        ['LL-ST-001', 'LL-ST-002', 'LL-ST-003'].includes(run.missionId) &&
        run.resumeInfo?.reason === 'return-to-free-roam',
    ) ?? null
  );
}
function pendingDispatchMission(state) {
  if (!state.campaign?.completed?.['LL-ST-001'] || state.campaign.active) return null;
  const interrupted = interruptedStory(state);
  if (interrupted)
    return ['LL-ST-002', 'LL-ST-003'].includes(interrupted.missionId)
      ? interrupted.missionId
      : null;
  return !state.campaign.completed['LL-ST-002']
    ? 'LL-ST-002'
    : !state.campaign.completed['LL-ST-003']
      ? 'LL-ST-003'
      : null;
}
function availableStoryAssignment(state) {
  if (
    !state.campaign ||
    state.campaign.active ||
    interruptedStory(state) ||
    !state.campaign.completed['LL-ST-001']
  )
    return null;
  if (!state.campaign.completed['LL-ST-002'])
    return {
      id: 'LL-ST-002',
      title: 'Late Meter',
      preparation: { ...state.lateMeterRuntime.preparation },
      objective: 'Bring a working taxi to the dispatch rank, then talk to Felix inside.',
      target: { ...WORLD.campaignSceneBindings.dispatch.target, sceneId: null },
    };
  const definition = CAMPAIGN_CONTENT.missions.find((m) => m.id === 'LL-ST-003');
  if (
    !state.campaign.completed['LL-ST-003'] &&
    campaignAdapters(state).supportsMission(definition.id, definition)
  )
    return {
      id: definition.id,
      title: definition.title,
      preparation: clone(state.twoSeatsRuntime.preparation),
      objective: 'Talk to Felix inside Voss Dispatch.',
      target: { ...WORLD.campaignSceneBindings.dispatch.target, sceneId: null },
    };
  return null;
}
export function storyView(state) {
  if (!state.campaign) return null;
  const context = campaignContext(state),
    owner = state.campaign.active?.missionId ?? interruptedStory(state)?.missionId,
    view =
      owner === 'LL-ST-003'
        ? twoSeatsView(state, twoSeatsContext(state))
        : owner === 'LL-ST-002'
          ? lateMeterView(state, lateMeterContext(state))
          : campaignRuntimeView(state, context);
  const key = `${state.campaign.sequence}:${Math.floor(state.time * 10)}:${storyRestoreEpoch(state)}`;
  let cached = storyDialogueCache.get(state);
  if (!cached || cached.director !== state.campaign || cached.key !== key) {
    cached = {
      director: state.campaign,
      key,
      dialogue: currentCampaignDialogue(state.campaign, campaignAdapters(state)),
    };
    storyDialogueCache.set(state, cached);
  }
  const dialogue = cached.dialogue,
    interrupted = interruptedStory(state);
  const availableAssignment = availableStoryAssignment(state);
  return {
    ...view,
    title: CAMPAIGN_CONTENT.missions.find((mission) => mission.id === owner)?.title ?? null,
    availableAssignment,
    interrupted: interrupted
      ? {
          missionId: interrupted.missionId,
          stageId: interrupted.stageId,
          attempt: interrupted.attempt,
        }
      : null,
    failed: state.campaign.active?.phase === 'failed',
    failure: state.campaign.active?.failure,
    dialogue:
      state.campaign.active?.phase === 'failed' ||
      (view.dialogueSource !== 'phone' && view.dialogueReady)
        ? dialogue.line
        : null,
    dialogueIndex: state.campaign.active?.dialogue.index ?? 0,
    attempt: state.campaign.active?.attempt ?? 0,
    ambient: state.campaign.active?.phase === 'running' ? subtitleLine(state) : null,
    cinematic: cinematicView(state, context.cinematicContext),
    shelterAction: shelterActionView(state),
  };
}
function tickStory(state, dt) {
  if (!state.campaign) return;
  const context = campaignContext(state);
  tickCinematics(state, dt, context.cinematicContext);
  tickShelterServices(state, dt, {
    canRest: (s) =>
      s.player.health > 0 &&
      !s.wanted.level &&
      !s.mission &&
      (!s.campaign?.active || s.campaign.active.stageId === 'rest') &&
      !scenePeople(s).some((actor) => actor.kind === 'hostile' && actor.health > 0),
  });
  context.syncSceneProps();
  tickCampaignRuntime(state, dt, context);
  tickLateMeterRuntime(state, dt, lateMeterContext(state));
  tickTwoSeatsRuntime(state, dt, twoSeatsContext(state));
  const view = storyView(state),
    presentation = state.campaignPresentation;
  tickSubtitles(state, dt, {
    visible: Boolean(
      state.campaign.active?.phase === 'running' && presentation?.visible && !view.dialogue,
    ),
  });
  if (view.autoDialogue && view.dialogue && presentation?.visible && presentation.presented) {
    const key = `${view.missionId}:${view.stageId}:${view.attempt}:${view.dialogueIndex}`;
    if (presentation.lineKey === key) {
      presentation.elapsed += dt;
      if (presentation.elapsed >= Math.max(2, Math.min(7, 1 + view.dialogue.text.length / 16)))
        acknowledgeStory(state);
    } else presentation.presented = false;
  }
  if (state.time >= (state.nextCampaignUpdate ?? 0)) {
    updateCampaignDirector(state.campaign, campaignAdapters(state));
    state.nextCampaignUpdate = state.time + 0.1;
  }
}
export function presentStoryDialogue(state) {
  const view = storyView(state);
  if (!view) return;
  state.campaignPresentation.visible = true;
  if (view.dialogue) {
    const key = `${view.missionId}:${view.stageId}:${view.attempt}:${view.dialogueIndex}`;
    if (state.campaignPresentation.lineKey !== key)
      Object.assign(state.campaignPresentation, { lineKey: key, elapsed: 0, presented: true });
    else state.campaignPresentation.presented = true;
  } else if (view.ambient) presentSubtitle(state, view.ambient.receipt, view.ambient.index);
}
export function setStoryPresentationVisibility(state, visible) {
  if (!state.campaignPresentation) return;
  state.campaignPresentation.visible = Boolean(visible);
  if (!visible) {
    hideStoryPhone(state);
    state.campaignPresentation.presented = false;
    if (state.subtitles?.active) state.subtitles.active.presented = false;
  }
}
export function chooseWardrobeOutfit(state, id) {
  return shelterHook(state, 'wardrobe')
    ? equipOutfit(state, id)
    : { ok: false, reason: 'wardrobe-out-of-reach' };
}
export function acknowledgeStory(state) {
  const view = storyView(state);
  if (view?.dialogue) {
    const key = `${view.missionId}:${view.stageId}:${view.attempt}:${view.dialogueIndex}`;
    if (!state.campaignPresentation?.presented || state.campaignPresentation.lineKey !== key)
      return { ok: false, reason: 'line-not-presented' };
    const result = advanceCampaignDialogue(state.campaign, campaignAdapters(state));
    if (result.ok) {
      state.campaignPresentation.presented = false;
      updateCampaignDirector(state.campaign, campaignAdapters(state));
    }
    return result;
  }
  if (view?.ambient) return { ok: advanceSubtitle(state, { acknowledged: true }) };
  return { ok: false };
}
export function selectStoryChoice(state, id, option) {
  return chooseCampaignOption(state.campaign, id, option, campaignAdapters(state));
}
export function retryStory(state, mode = 'retry-last-checkpoint') {
  const missionId = state.campaign?.active?.missionId ?? interruptedStory(state)?.missionId;
  return retryCampaignMission(state.campaign, campaignAdapters(state), { mode, missionId });
}
export function leaveStory(state) {
  return abandonCampaignMission(state.campaign, campaignAdapters(state), { preserveRetry: true });
}
export function skipStoryCinematic(state) {
  return skipCinematic(state);
}
export function prepareStorySave(state) {
  return prepareCampaignSave(state, campaignContext(state));
}
export function commitStorySave(state, prepared, proof) {
  return commitCampaignSave(state, prepared, proof, campaignContext(state));
}
export function rollbackStorySave(state, prepared) {
  return rollbackCampaignSave(state, prepared);
}
function companionContext(state) {
  let context = physicalContexts.get(state);
  if (!context) {
    context = createCampaignPhysicalContext(state, {
      world: WORLD,
      terrain: TERRAIN,
      specs: VEHICLE_SPECS,
      scenes: SCENES,
      localPath: findLocalFootPath,
      isBodyBlocked: (x, y, radius, z, sceneId) =>
        twoSeatsBodies.isBodyBlocked(state, x, y, radius, z, sceneId),
      bodySegmentBlocked: (from, to, radius, sceneId) =>
        twoSeatsBodies.segmentBlocked(state, from, to, radius, sceneId),
      preferLocalFootPaths: () => twoSeatsBodies.enabled(state),
      scriptControlled: (actor) => {
        const active = state.cinematics?.active,
          definition = active && campaignParents.get(state)?.cinematicContext.sequence(active.id);
        return Boolean(
          NamedHostility.namedCombatControlsActor(state, actor.id) ||
          definition?.phases[active.phase]?.tracks.some((track) => track.actorId === actor.id),
        );
      },
    });
    physicalContexts.set(state, context);
  }
  return context;
}
const geometryFor = (state) => SCENES.queries(state);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const normalizeAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const clone = (value) => JSON.parse(JSON.stringify(value));

export const VEHICLE_SPECS = Object.freeze({
  taxi: {
    name: 'Crownline taxi',
    width: 15,
    length: 29,
    maxSpeed: 145,
    acceleration: 74,
    braking: 180,
    grip: 3.1,
    reverseSpeed: 47,
    health: 120,
    seats: 4,
  },
  sedan: {
    name: 'Alder sedan',
    width: 15,
    length: 29,
    maxSpeed: 157,
    acceleration: 78,
    braking: 178,
    grip: 2.8,
    reverseSpeed: 45,
    health: 115,
    seats: 4,
  },
  van: {
    name: 'Porter cargo van',
    width: 17,
    length: 34,
    maxSpeed: 112,
    acceleration: 56,
    braking: 152,
    grip: 2.4,
    reverseSpeed: 34,
    health: 190,
    seats: 2,
  },
  sports: {
    name: 'Vesper coupe',
    width: 15,
    length: 28,
    maxSpeed: 205,
    acceleration: 103,
    braking: 205,
    grip: 3.6,
    reverseSpeed: 51,
    health: 90,
    seats: 2,
  },
  police: {
    name: 'Harbor patrol cruiser',
    width: 16,
    length: 31,
    maxSpeed: 172,
    acceleration: 90,
    braking: 190,
    grip: 3,
    reverseSpeed: 45,
    health: 170,
    seats: 4,
  },
});

const target = (x, y, name, radius = 35) => ({ x, y, name, radius });
export const MISSIONS = [
  {
    id: 'first-shift',
    title: 'The First Shift',
    chapter: 1,
    contact: 'Felix Voss',
    reward: 450,
    prerequisite: null,
    summary: 'A relief driver, a late ferry passenger, and a family business running on fumes.',
    stages: [
      {
        type: 'interact',
        objective: 'Talk to Felix at Voss Dispatch.',
        target: target(458, 700, 'Felix'),
        spawnVehicle: {
          id: 'starter-taxi',
          spec: 'taxi',
          x: 504,
          y: 700,
          angle: Math.PI,
          color: '#dfb447',
        },
        dialogue: [
          ['Felix', 'Mara. You made it. City still smells like rain and unpaid bills.'],
          ['Mara', 'You said there was work. You did not mention the bills.'],
          [
            'Felix',
            'Take the yellow Crownline. A ferry passenger needs Southbank. One quiet fare.',
          ],
        ],
      },
      {
        type: 'vehicle',
        objective: 'Get into Felix’s yellow taxi.',
        vehicle: 'starter-taxi',
        target: target(504, 700, 'Felix’s taxi', 28),
      },
      {
        type: 'drive',
        objective: 'Drive to the Old Quay ferry pickup.',
        target: target(180, 440, 'Ferry terminal'),
        requiredVehicle: 'taxi',
        dialogue: [
          ['Felix', 'Keep to the roads. This taxi is the only thing the bank has not taken.'],
        ],
      },
      {
        type: 'interact',
        objective: 'Collect June, the ferry passenger.',
        target: target(180, 440, 'June’s pickup'),
        requiredVehicle: 'taxi',
        dialogue: [
          ['June', 'Southbank clinic. My mother works nights.'],
          ['Mara', 'So does everyone I know.'],
          ['June', 'Then you will fit right in.'],
        ],
      },
      {
        type: 'drive',
        objective: 'Deliver June to Southbank Clinic.',
        target: target(180, 960, 'Southbank Clinic'),
        requiredVehicle: 'taxi',
      },
      {
        type: 'drive',
        objective: 'Bring the taxi back to Voss Dispatch.',
        target: target(480, 700, 'Voss Dispatch'),
        requiredVehicle: 'taxi',
        dialogue: [
          [
            'June',
            'Here. Keep the change. And do not trust men who call you family on the first day.',
          ],
        ],
      },
      {
        type: 'interact',
        objective: 'Report to Felix.',
        target: target(458, 700, 'Felix'),
        dialogue: [
          ['Felix', 'Good shift. Saira needs help collecting some repair bills tomorrow.'],
          ['Mara', 'Repair bills, or your repair bills?'],
          ['Felix', 'You always did ask expensive questions.'],
        ],
      },
    ],
  },
  {
    id: 'collection-day',
    title: 'The Price of a Promise',
    chapter: 1,
    contact: 'Saira Bell',
    reward: 650,
    prerequisite: 'first-shift',
    summary: 'Two unpaid invoices uncover a protection racket around a neighborhood garage.',
    stages: [
      {
        type: 'interact',
        objective: 'Meet Saira at her garage.',
        target: target(780, 718, 'Saira'),
        dialogue: [
          [
            'Saira',
            'I fix engines. Somehow that makes everybody think I can fix their life on credit.',
          ],
          ['Mara', 'Felix sent me.'],
          ['Saira', 'Of course he did. Two invoices. Ask politely first. Always.'],
        ],
      },
      {
        type: 'interact',
        objective: 'Collect the invoice from Alder Printworks.',
        target: target(1080, 440, 'Alder Printworks'),
        dialogue: [
          ['Emil', 'I paid Danton’s boys already. They said they were collecting for Saira.'],
          ['Mara', 'They were not. Tell me where to find them.'],
          ['Emil', 'East Port. Red van. Please do not tell them my name.'],
        ],
      },
      {
        type: 'interact',
        objective: 'Ask about the red van in East Port.',
        target: target(1380, 700, 'East Port collection'),
        dialogue: [
          ['Bram', 'New face. Same bad idea. This block belongs to us.'],
          ['Mara', 'Then you can afford to pay for the repairs.'],
        ],
        encounter: { x: 1380, y: 735, count: 3, health: 65, weapon: 'pistol' },
      },
      {
        type: 'combat',
        objective: 'Survive Bram’s crew. Use cover and keep moving.',
        target: target(1380, 735, 'Bram’s crew'),
        dialogue: [['Saira', 'Mara? I heard the shots. Get clear before patrol seals the roads.']],
      },
      {
        type: 'escape',
        objective: 'Break police sight, leave the search circle, and lose your wanted level.',
        heat: 2,
        dialogue: [
          ['Mara', 'Those were not repairmen.'],
          ['Saira', 'Nothing in this city is what the sign says.'],
        ],
      },
      {
        type: 'interact',
        objective: 'Return the recovered invoices to Saira.',
        target: target(780, 718, 'Saira’s Garage'),
        dialogue: [
          ['Saira', 'The money helps. The attention does not.'],
          ['Mara', 'I am beginning to see the family resemblance.'],
          ['Saira', 'Keep the taxi repaired. The city eats anything that stops moving.'],
        ],
      },
    ],
  },
  {
    id: 'cold-freight',
    title: 'Cold Freight',
    chapter: 1,
    contact: 'Tomas Reed',
    reward: 950,
    prerequisite: 'collection-day',
    summary:
      'Move refrigerated medicine through the port, then protect it from a deliberate ambush.',
    stages: [
      {
        type: 'interact',
        objective: 'Meet Tomas at Pier 8 Depot.',
        target: target(1620, 960, 'Tomas'),
        dialogue: [
          ['Tomas', 'Clinic stock. Insulin, mostly. The official trucks went missing.'],
          ['Mara', 'Why ask a taxi driver?'],
          ['Tomas', 'Because a taxi driver can still choose where to stop.'],
        ],
        spawnVehicle: {
          id: 'medicine-van',
          spec: 'van',
          x: 1620,
          y: 986,
          angle: Math.PI,
          color: '#8eaaa6',
        },
      },
      {
        type: 'vehicle',
        objective: 'Get into the refrigerated Porter van.',
        vehicle: 'medicine-van',
        target: target(1620, 986, 'Medicine van', 28),
      },
      {
        type: 'drive',
        objective: 'Take the medicine through the customs junction.',
        target: target(1080, 960, 'Customs junction'),
        requiredVehicle: 'medicine-van',
        deadline: 160,
      },
      {
        type: 'drive',
        objective: 'Reach the Southbank service road.',
        target: target(780, 1220, 'Service road'),
        requiredVehicle: 'medicine-van',
        encounter: { x: 754, y: 1204, count: 4, health: 72, weapon: 'pistol' },
        dialogue: [['Tomas', 'That car behind you has no plates. Do not let them take the van.']],
      },
      {
        type: 'combat',
        objective: 'Protect the medicine from the ambush.',
        target: target(780, 1220, 'Ambush'),
        protectVehicle: 'medicine-van',
      },
      {
        type: 'drive',
        objective: 'Deliver the medicine to the clinic service entrance.',
        target: target(180, 960, 'Clinic service entrance'),
        requiredVehicle: 'medicine-van',
        deadline: 150,
        dialogue: [
          ['Dr. Chen', 'Put the crates inside. People are waiting.'],
          ['Mara', 'Someone tried very hard to make sure they kept waiting.'],
        ],
      },
      {
        type: 'interact',
        objective: 'Check in with Dr. Chen.',
        target: target(180, 960, 'Dr. Chen'),
        dialogue: [
          ['Dr. Chen', 'This should not require heroics.'],
          ['Mara', 'It was supposed to be a delivery.'],
          ['Dr. Chen', 'Remember that. Before this city makes the other version sound normal.'],
        ],
      },
    ],
  },
  {
    id: 'glass-house',
    title: 'People in Glass Houses',
    chapter: 1,
    contact: 'Imani Vale',
    reward: 1200,
    prerequisite: 'cold-freight',
    summary:
      'A radio journalist needs proof of the port diversion. Enter quietly or force an exit.',
    stages: [
      {
        type: 'interact',
        objective: 'Meet Imani at Signal House.',
        target: target(780, 440, 'Imani'),
        dialogue: [
          ['Imani', 'Your medicine route was not an accident. Someone bought the detour.'],
          ['Mara', 'Put that on the radio.'],
          [
            'Imani',
            'I need proof first. A camera card is hidden at Civic Market. Leave the car and use the alley.',
          ],
        ],
      },
      {
        type: 'interact',
        objective: 'On foot, collect the camera card at Civic Market.',
        target: target(1080, 180, 'Camera card', 27),
        onFoot: true,
        encounter: { x: 1120, y: 202, count: 3, health: 80, weapon: 'smg' },
        dialogue: [['Imani', 'You have the card. Now keep it out of their hands.']],
      },
      {
        type: 'reach',
        objective: 'Get the evidence out through Old Quay.',
        target: target(480, 180, 'Old Quay exit'),
        dialogue: [
          ['Mara', 'I saw my cousin’s company on the shipping ledger.'],
          [
            'Imani',
            'A name on a form is a question. Bring me the rest before you make it an answer.',
          ],
        ],
      },
      { type: 'escape', objective: 'Lose the police before approaching Signal House.', heat: 2 },
      {
        type: 'interact',
        objective: 'Deliver the camera card to Imani.',
        target: target(780, 440, 'Signal House'),
        dialogue: [
          ['Imani', 'Now we have a story. You have a choice about what to do with it.'],
          ['Mara', 'First I ask Felix. Face to face.'],
          ['Imani', 'Then keep a copy. People forget promises when the lights go out.'],
        ],
      },
    ],
  },
];

function random(state) {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
  return state.rng / 4294967296;
}
function nextId(state, prefix) {
  state.sequence += 1;
  return `${prefix}-${state.sequence}`;
}
function notify(state, text, kind = 'info') {
  state.notifications.push({
    id: nextId(state, 'notice'),
    text,
    kind,
    time: state.time,
    expires: state.time + 9,
  });
  state.notifications = state.notifications.slice(-8);
}
function say(state, lines) {
  if (!lines?.length) return;
  state.dialogue = {
    lines: clone(lines),
    index: 0,
    speaker: lines[0][0],
    text: lines[0][1],
    expires: state.time + 14,
  };
  state.dialogueHistory.push(
    ...lines.map(([speaker, text]) => ({ speaker, text, time: state.time })),
  );
  state.dialogueHistory = state.dialogueHistory.slice(-60);
}
function createVehicle(state, definition) {
  const spec = VEHICLE_SPECS[definition.spec || 'sedan'];
  return {
    id: definition.id || nextId(state, 'vehicle'),
    spec: definition.spec || 'sedan',
    x: definition.x,
    y: definition.y,
    z: definition.z || 0,
    groundZ: definition.z || 0,
    angle: definition.angle || 0,
    speed: 0,
    health: spec.health,
    color: definition.color || '#a3b8b6',
    kind: definition.kind || 'parked',
    occupied: false,
    route: definition.route || null,
    routeIndex: 0,
    blockedTime: 0,
    stolen: false,
  };
}

export function createSimulation(seed = 61) {
  const requestedStory = typeof seed === 'object' && seed.campaign === true;
  const numericSeed = typeof seed === 'object' ? (seed.seed ?? 61) : seed;
  const state = {
    worldGeometryVersion: DISPATCH_WORLD_MIGRATION.id,
    campaignMode: requestedStory ? 'story' : 'legacy',
    campaignPresentation: {
      version: 1,
      lineKey: null,
      elapsed: 0,
      presented: false,
      visible: false,
    },
    version: SAVE_VERSION,
    rng: (Number(numericSeed) || 61) >>> 0,
    initialSeed: (Number(numericSeed) || 61) >>> 0,
    sequence: 0,
    time: 0,
    clock: 20.25,
    player: {
      x: WORLD.spawn.x,
      y: WORLD.spawn.y,
      angle: 0,
      health: 100,
      armour: 0,
      money: 240,
      vehicleId: null,
      sceneId: null,
      weapon: 'pistol',
      weapons: ['pistol'],
      ammo: {
        pistol: { clip: 12, reserve: 48 },
        shotgun: { clip: 0, reserve: 0 },
        smg: { clip: 0, reserve: 0 },
      },
      fireCooldown: 0,
      reloadRemaining: 0,
      stamina: 100,
      speed: 0,
    },
    scene: { kind: 'exterior', id: 'harbor-city' },
    vehicles: [],
    pedestrians: [],
    police: [],
    hostiles: [],
    bullets: [],
    particles: [],
    wanted: {
      level: 0,
      heat: 0,
      status: 'clear',
      lastSeen: { x: WORLD.spawn.x, y: WORLD.spawn.y },
      searchRadius: 0,
      timer: 0,
      unseen: 0,
      pursuitTime: 0,
    },
    mission: null,
    taxiJob: null,
    progress: {
      completed: [],
      failed: [],
      deaths: 0,
      fares: 0,
      kills: 0,
      distanceDriven: 0,
      cashEarned: 0,
    },
    notifications: [],
    dialogue: null,
    dialogueHistory: [],
    lastInput: {},
    district: 'breakwater',
    weather: { rain: 0.4, fog: 0.14 },
    radio: {
      station: 0,
      stations: [
        'HBR 91.7 · After Hours',
        'Signal House · Independent',
        'Port Radio · Night Freight',
      ],
    },
    checkpoint: { x: WORLD.spawn.x, y: WORLD.spawn.y },
    respawnTimer: 0,
    lastCrimeTime: -100,
    saveRequested: false,
  };
  state.vehicles.push(
    createVehicle(state, {
      id: 'starter-taxi',
      spec: 'taxi',
      x: 504,
      y: 700,
      angle: Math.PI,
      color: '#dfb447',
    }),
  );
  const parking = [
    ['sedan', 480, 408, '#536983'],
    ['sports', 808, 440, '#c27565'],
    ['van', 1620, 922, '#9eafa6'],
    ['sedan', 180, 732, '#a59c84'],
    ['taxi', 1108, 960, '#d4b050'],
    ['sedan', 1380, 408, '#978da9'],
  ];
  for (const [spec, x, y, color] of parking)
    state.vehicles.push(createVehicle(state, { spec, x, y, color }));
  for (let i = 0; i < 18; i += 1) {
    const row = i % (roadYs.length - 1);
    const col = (i * 3 + Math.floor(i / 5)) % (roadXs.length - 1);
    const clockwise = i % 2 === 0;
    const x1 = roadXs[col] + 14,
      x2 = roadXs[col + 1] - 14;
    const y1 = roadYs[row] + 14,
      y2 = roadYs[row + 1] - 14;
    const route = clockwise
      ? [
          { x: x1, y: y1 },
          { x: x2, y: y1 },
          { x: x2, y: y2 },
          { x: x1, y: y2 },
        ]
      : [
          { x: x1, y: y2 },
          { x: x2, y: y2 },
          { x: x2, y: y1 },
          { x: x1, y: y1 },
        ];
    const start = (i + 1) % 4;
    const colors = ['#b7b5a6', '#73889a', '#a27269', '#91a49b', '#b5a06d'];
    const vehicle = createVehicle(state, {
      spec: i % 7 === 0 ? 'taxi' : i % 6 === 0 ? 'van' : 'sedan',
      x: route[start].x,
      y: route[start].y,
      angle: angleTo(route[start], route[(start + 1) % 4]),
      kind: 'traffic',
      route,
      color: colors[i % colors.length],
    });
    vehicle.routeIndex = (start + 1) % 4;
    vehicle.speed = 35 + random(state) * 22;
    state.vehicles.push(vehicle);
  }
  for (let i = 0; i < 52; i += 1) {
    const avenue = roadXs[i % roadXs.length];
    const row = i % (roadYs.length - 1);
    const x = avenue + (i % 2 ? 47 : -47);
    const y = roadYs[row] + 50 + random(state) * 150;
    state.pedestrians.push({
      id: nextId(state, 'pedestrian'),
      x,
      y,
      angle: i % 2 ? Math.PI / 2 : -Math.PI / 2,
      health: 100,
      speed: 12 + random(state) * 8,
      color: ['#968877', '#7a8b94', '#a4867a', '#8f947f'][i % 4],
      homeX: x,
      minY: roadYs[row] + 48,
      maxY: roadYs[row + 1] - 48,
      panic: 0,
    });
  }
  initializeInteriors(state);
  initializeWardrobe(state);
  initializeCalendar(state);
  Companions.initializeCompanions(state);
  initializeCinematics(state);
  initializeSubtitles(state);
  initializeShelterServices(state);
  initializeRail(state, WORLD);
  updateRail(state, WORLD, 0, railOptions(state));
  initializeCombat(state, WORLD.pickups || []);
  if (requestedStory) {
    const spawn = WORLD.campaignSceneBindings['pier-berth'].playerSpawn;
    Object.assign(state.player, spawn, {
      sceneId: null,
      vehicleId: null,
      weapon: 'unarmed',
      weapons: ['unarmed'],
      ownedWeapons: ['unarmed'],
    });
    for (const ammo of Object.values(state.player.ammo)) {
      ammo.clip = 0;
      ammo.reserve = 0;
    }
    state.checkpoint = { x: spawn.x, y: spawn.y };
  }
  initializePolicing(state);
  if (!requestedStory) startMission(state, 'first-shift');
  initializeAmbient(state, WORLD);
  updateAmbient(state, WORLD, 0, ambientContext(state));
  if (requestedStory) startStory(state);
  return state;
}

export function currentVehicle(state) {
  return state.vehicles.find((item) => item.id === state.player.vehicleId) || null;
}

function circleRectCollision(x, y, radius, rect) {
  const nearX = clamp(x, rect.x, rect.x + rect.w);
  const nearY = clamp(y, rect.y, rect.y + rect.h);
  return Math.hypot(x - nearX, y - nearY) < radius;
}
export function isBlocked(x, y, radius = 7, z = 0, state = null) {
  return (state ? geometryFor(state) : TERRAIN).isBlocked(x, y, radius, z);
}
function moveBody(body, dx, dy, radius, options = {}) {
  if (
    options.state &&
    body.spec &&
    actorSceneId(body) === null &&
    railGateBlocked(options.state, WORLD, body.x + dx, body.y + dy, radius, body.z || 0, body)
  )
    return true;
  return options.state
    ? SCENES.moveBody(options.state, body, dx, dy, radius, options)
    : surfaceMovement.moveBody(body, dx, dy, radius, options);
}
function hasLineOfSight(a, b, state = null, sceneId) {
  return state
    ? SCENES.sight(state, a, b, sceneId === undefined ? currentSceneId(state) : sceneId)
    : TERRAIN.hasLineOfSight(a, b);
}
function damagePlayer(state, damage) {
  if (state.player.health <= 0 || state.respawnTimer > 0) return;
  const absorbed = Math.min(state.player.armour, damage * 0.75);
  state.player.armour -= absorbed;
  state.player.health = Math.max(0, state.player.health - (damage - absorbed));
  if (damage > 0) state.player.reloadRemaining = 0;
  if (state.player.health <= 0) killPlayer(state);
}
function damageVehicle(state, vehicle, damage, owner = 'world', kind = 'vehicle-impact') {
  if (vehicle.health <= 0) return;
  const previousHealth = vehicle.health,
    previousArmour = vehicle.armour ?? 0;
  if (vehicle.armour > 0) {
    const absorbed = Math.min(vehicle.armour, damage * 0.55);
    vehicle.armour -= absorbed;
    damage -= absorbed;
  }
  vehicle.health = Math.max(0, vehicle.health - damage);
  const passengerLife = (state.companions?.actors ?? [])
    .filter((actor) => actor.vehicleId === vehicle.id)
    .map((actor) => ({ actor, health: actor.health, armour: actor.armour ?? 0 }));
  Companions.applyVehicleImpact(
    state,
    vehicle.id,
    previousHealth - vehicle.health,
    companionContext(state),
  );
  for (const before of passengerLife)
    notifyCommittedDamage(
      state,
      before.actor,
      before.health,
      before.armour,
      owner,
      { onDamage: campaignObservers(state)?.damage, sceneId: actorSceneId(before.actor) },
      kind,
    );
  if (vehicle.health === 0) {
    vehicle.speed = 0;
    if (state.player.vehicleId === vehicle.id) {
      vehicle.occupied = false;
      state.player.vehicleId = null;
      damagePlayer(state, 32);
      notify(state, 'Vehicle disabled. Get clear and find another ride.', 'danger');
    }
  }
  notifyCommittedDamage(
    state,
    vehicle,
    previousHealth,
    previousArmour,
    owner,
    { onDamage: campaignObservers(state)?.damage, sceneId: actorSceneId(vehicle) },
    kind,
    'vehicle',
  );
}
function killPlayer(state) {
  state.player.health = 0;
  if (railPassenger(state)) recoverRail(state, WORLD, railOptions(state));
  state.progress.deaths += 1;
  state.respawnTimer = 2.5;
  const vehicle = currentVehicle(state);
  if (vehicle) {
    vehicle.occupied = false;
    vehicle.speed = 0;
  }
  state.player.vehicleId = null;
  state.player.cover = null;
  state.player.traversal = null;
  state.player.meleeAction = null;
  state.player.defending = false;
  state.player.z = state.player.groundZ || 0;
  state.player.vz = 0;
  if (state.mission) failMission(state, 'Mara was incapacitated. The assignment can be retried.');
  state.taxiJob = null;
  state.hostiles = [];
  state.bullets = [];
  notify(state, 'INCAPACITATED · Clinic recovery in a moment.', 'danger');
}
function respawn(state) {
  if (state.interior?.active)
    emergencyExteriorReturn(state, interiorContext(state), 'clinic-recovery');
  const fee = Math.min(80, state.player.money);
  state.player.money -= fee;
  Object.assign(state.player, {
    x: 180,
    y: 960,
    health: 100,
    armour: 0,
    speed: 0,
    reloadRemaining: 0,
    z: 0,
    groundZ: 0,
    swimming: false,
    vz: 0,
  });
  state.wanted = {
    level: 0,
    heat: 0,
    status: 'clear',
    lastSeen: { x: 180, y: 960 },
    searchRadius: 0,
    timer: 0,
    unseen: 0,
    pursuitTime: 0,
  };
  resetPolicing(state);
  state.respawnTimer = 0;
  notify(state, `Southbank Clinic patched you up. Treatment: $${fee}.`, 'info');
}

function policeContext(state) {
  return {
    world: WORLD,
    specs: VEHICLE_SPECS,
    id: (prefix) => nextId(state, prefix),
    random: () => random(state),
    civilianWitnesses: () =>
      scenePeople(state).filter((actor) => actor.kind !== 'police' && actor.kind !== 'hostile'),
    findWitness: (id) => findScenePerson(state, id) || state.vehicles.find((car) => car.id === id),
    dispatchPoint: (point) => {
      const roomId = point?.sceneId;
      if (!roomId) return point;
      const portal = PORTAL_DEFINITIONS.find((portal) => portal.roomId === roomId);
      const location = WORLD.locations.find((location) => location.id === portal?.locationId);
      return location ? { x: location.x, y: location.y, z: location.z || 0 } : point;
    },
    hasLineOfSight: (a, b) => hasLineOfSight(a, b, state, actorSceneId(a)),
    isBlocked,
    moveBody: (body, dx, dy, r) => moveBody(body, dx, dy, r, { state }),
    damageVehicle: (vehicle, amount) => damageVehicle(state, vehicle, amount),
    fire: (actor) => fireHostile(state, actor),
    reloadActor: updateEnemyReload,
    notify: (text, kind) => notify(state, text, kind),
    onArrest: () => {
      if (state.mission) failMission(state, 'Mara was arrested. The assignment can be retried.');
      state.taxiJob = null;
      state.dialogue = null;
      state.bullets = [];
      state.ordnance = [];
    },
  };
}
export function forceWanted(state, level, point = state.player) {
  forcePoliceWanted(state, level, point, policeContext(state));
}
export function reportCrime(state, crime) {
  return reportObservedCrime(
    state,
    { ...crime, sceneId: crime.sceneId ?? currentSceneId(state) },
    policeContext(state),
  );
}
function raiseWanted(state, level = 1) {
  forceWanted(state, level);
}
function finishReload(state) {
  const ammo = state.player.ammo[state.player.weapon];
  const needed = WEAPONS[state.player.weapon].clipSize - ammo.clip;
  const amount = Math.min(needed, ammo.reserve);
  ammo.clip += amount;
  ammo.reserve -= amount;
}
export function reloadWeapon(state) {
  const weapon = WEAPONS[state.player.weapon];
  const ammo = state.player.ammo[state.player.weapon];
  if (
    state.player.health <= 0 ||
    !['ballistic', 'rocket'].includes(weapon.mode) ||
    state.player.reloadRemaining > 0 ||
    ammo.clip === weapon.clipSize ||
    ammo.reserve <= 0
  )
    return false;
  state.player.reloadRemaining = weapon.reloadTime;
  return true;
}
export function selectWeapon(state, id) {
  return equipOwnedWeapon(state, id);
}
function damageSceneProp(state, sceneId, id, amount) {
  const local =
    currentSceneId(state) === sceneId
      ? state
      : {
          ...state,
          player: { ...state.player, cover: null },
          interior: { ...state.interior, active: { roomId: sceneId } },
        };
  return damageInteriorProp(local, id, amount);
}
function damageSceneArea(state, sceneId, point, radius, amount) {
  const geometry = SCENES.queries(state, sceneId);
  for (const prop of lateMeterPropDescriptors(state)) {
    const target = closestLateMeterClipboardPoint(point, prop),
      range = Math.hypot(point.x - target.x, point.y - target.y, (point.z ?? 0) - target.z);
    if (prop.sceneId === sceneId && range < radius && geometry.hasLineOfSight(point, target))
      damageCampaignProp(state, prop, amount * Math.max(0.15, 1 - range / radius));
  }
  if (!sceneId) return;
  for (const item of INTERIOR_LAYOUTS[sceneId].props) {
    const target = {
      x: item.x + item.w / 2,
      y: item.y + item.h / 2,
      z: Math.min(26, item.height) / 2,
    };
    const range = Math.hypot(point.x - target.x, point.y - target.y, (point.z || 0) - target.z);
    if (range > radius) continue;
    const contact = geometry.traceSolid(point, target, 0);
    if (!contact || contact.volume.id === item.id)
      damageSceneProp(state, sceneId, item.id, amount * Math.max(0.15, 1 - range / radius));
  }
}
function damageCampaignProp(state, descriptor, amount) {
  const prop = state.campaignRuntime?.sceneProps?.[descriptor.id];
  if (!prop || prop.state === 'destroyed' || !Number.isFinite(amount) || amount <= 0) return false;
  prop.health = Math.max(0, (prop.health ?? 100) - amount);
  if (!prop.health)
    Object.assign(prop, {
      state: 'destroyed',
      ownerActorId: null,
      visible: false,
      x: descriptor.x,
      y: descriptor.y,
      z: descriptor.z,
      angle: descriptor.angle,
      sceneId: descriptor.sceneId,
    });
  return true;
}
function syncCarriedCampaignProps(state) {
  const prop = state.campaignRuntime?.sceneProps?.[LATE_METER_CLIPBOARD.id];
  if (prop?.state !== 'carried') return;
  const actor = Companions.getActor(state, prop.ownerActorId);
  if (!actor || actor.health > 0) return;
  const { forward, right } = prop.attachment,
    c = Math.cos(actor.angle),
    s = Math.sin(actor.angle);
  Object.assign(prop, {
    state: 'dropped',
    ownerActorId: null,
    x: actor.x + forward * c - right * s,
    y: actor.y + forward * s + right * c,
    z:
      SCENES.queries(state, actorSceneId(actor)).surfaceHeight(actor.x, actor.y, actor.z ?? 0) +
      0.4,
    angle: actor.angle,
    sceneId: actorSceneId(actor),
    health: prop.health ?? 100,
  });
}
function combatContext(state, sceneId = currentSceneId(state)) {
  const geometry = SCENES.queries(state, sceneId);
  return {
    sceneId,
    handImpairment: (actor) =>
      twoSeatsWristView(state, actor === state.player ? 'player' : (actor?.id ?? null)),
    onDamage: campaignObservers(state)?.damage,
    onAttack: campaignObservers(state)?.attack,
    onDisarm: campaignObservers(state)?.disarm,
    isHostile: (actor) => NamedHostility.isNamedHostile(state, actor.id),
    damageProps: (point, radius, amount) => damageSceneArea(state, sceneId, point, radius, amount),
    strikeProps: (actor, action) => {
      for (const prop of lateMeterPropDescriptors(state)) {
        const hand = { x: actor.x, y: actor.y, z: (actor.z ?? 0) + (actor.crouching ? 8 : 13) },
          target = closestLateMeterClipboardPoint(hand, prop),
          range = Math.hypot(hand.x - target.x, hand.y - target.y, hand.z - target.z);
        if (
          prop.sceneId === sceneId &&
          range <= action.reach &&
          Math.abs(normalizeAngle(angleTo(actor, target) - actor.angle)) <= action.arc &&
          geometry.hasLineOfSight(hand, target)
        )
          damageCampaignProp(state, prop, action.damage);
      }
      if (!sceneId) return;
      for (const item of INTERIOR_LAYOUTS[sceneId].props) {
        const point = {
          x: clamp(actor.x, item.x, item.x + item.w),
          y: clamp(actor.y, item.y, item.y + item.h),
          z: Math.min(14, item.height),
        };
        if (
          distance(actor, point) <= action.reach &&
          Math.abs(normalizeAngle(angleTo(actor, point) - actor.angle)) <= action.arc
        ) {
          const contact = geometry.traceSolid({ ...actor, z: (actor.z || 0) + 13 }, point, 0);
          if (!contact || contact.volume.id === item.id)
            damageSceneProp(state, sceneId, item.id, action.damage);
        }
      }
    },
    combatants: () => scenePeople(state, sceneId),
    civilians: () =>
      scenePeople(state, sceneId).filter(
        (actor) => actor.kind !== 'hostile' && actor.kind !== 'police',
      ),
    vehicles: () => sceneVehicles(state, sceneId),
    aircraft: () => (sceneId ? [] : state.policeAircraft),
    random: () => random(state),
    id: (prefix) => nextId(state, prefix),
    damagePlayer: (amount) => {
      if (currentSceneId(state) === sceneId) damagePlayer(state, amount);
    },
    damageVehicle: (vehicle, amount, owner, kind) =>
      damageVehicle(state, vehicle, amount, owner ?? 'world', kind ?? 'explosion'),
    raiseWanted: (level) => reportCrime(state, { type: 'gunfire', severity: level }),
    reportCrime: (crime) => reportCrime(state, { ...crime, sceneId }),
    hasLineOfSight: (a, b) => hasLineOfSight(a, b, state, sceneId),
    isBlocked: (x, y, r, z) => geometry.isBlocked(x, y, r, z),
    surfaceHeight: (x, y, z) => geometry.surfaceHeight(x, y, z),
    moveBody: (body, dx, dy, r) => moveBody(body, dx, dy, r, { state }),
    reload: () => reloadWeapon(state),
    notify: (text, kind) => notify(state, text, kind),
  };
}
export function fireWeapon(state, input = {}) {
  if (state.cinematics?.active || state.shelterServices?.active || railPassenger(state))
    return false;
  return fireCombatWeapon(state, combatContext(state), input);
}
export function throwTrajectory(state) {
  return predictThrow(state, combatContext(state));
}
function updateEnemyReload(actor, dt) {
  const weapon = WEAPONS[actor.weapon] || WEAPONS.pistol;
  actor.ammo ??= {
    clip: weapon.mode === 'throwable' ? weapon.supply || 1 : weapon.clipSize,
    reserve: weapon.mode === 'throwable' ? 0 : weapon.clipSize * 3,
  };
  actor.reloadRemaining ??= 0;
  if (actor.reloadRemaining > 0) {
    actor.reloadRemaining = Math.max(0, actor.reloadRemaining - dt);
    if (actor.reloadRemaining === 0) {
      const amount = Math.min(weapon.clipSize - actor.ammo.clip, actor.ammo.reserve);
      actor.ammo.clip += amount;
      actor.ammo.reserve -= amount;
    }
  }
}
function fireHostile(state, hostile) {
  const weapon = WEAPONS[hostile.weapon] || WEAPONS.pistol;
  if (hostile.staggerRemaining > 0 || hostile.reloadRemaining > 0) return;
  if (weapon.mode === 'melee' || distance(hostile, state.player) < 24) {
    startActorMelee(
      state,
      hostile,
      weapon.mode === 'melee' ? hostile.weapon : 'unarmed',
      combatContext(state),
    );
    return;
  }
  hostile.ammo ??= { clip: weapon.clipSize, reserve: weapon.clipSize * 3 };
  if (hostile.ammo.clip <= 0) {
    if (hostile.ammo.reserve > 0) hostile.reloadRemaining = weapon.reloadTime;
    else hostile.weapon = 'unarmed';
    return;
  }
  hostile.ammo.clip--;
  const angle = angleTo(hostile, state.player) + (random(state) - 0.5) * 0.22;
  if (weapon.mode === 'rocket' || weapon.mode === 'throwable') {
    const speed = weapon.mode === 'rocket' ? weapon.bulletSpeed : weapon.throwSpeed;
    const range = Math.max(1, distance(hostile, state.player)),
      heightDelta = (state.player.z || 0) + 12 - ((hostile.z || 0) + 13),
      length = Math.hypot(range, heightDelta);
    const horizontalSpeed = weapon.mode === 'rocket' ? (speed * range) / length : speed;
    state.ordnance.push({
      id: nextId(state, 'enemy-ordnance'),
      kind: weapon.mode === 'rocket' ? 'rocket' : weapon.kind,
      weapon: hostile.weapon,
      owner: hostile.id,
      sceneId: actorSceneId(hostile),
      x: hostile.x,
      y: hostile.y,
      z: (hostile.z || 0) + 13,
      groundZ: hostile.groundZ || 0,
      vx: Math.cos(angle) * horizontalSpeed,
      vy: Math.sin(angle) * horizontalSpeed,
      vz: weapon.mode === 'rocket' ? (speed * heightDelta) / length : weapon.throwLift,
      remaining: weapon.mode === 'rocket' ? weapon.range / speed : 8,
      fuse: weapon.fuse ?? null,
      damage: weapon.damage * 0.65,
      radius: weapon.blastRadius || 0,
      material: 'metal',
      objectName: 'Discarded can',
      bounces: 0,
    });
    hostile.fireCooldown = weapon.mode === 'rocket' ? 3.8 : 3;
    return;
  }
  for (let pellet = 0; pellet < Math.max(1, weapon.pellets); pellet++) {
    const direction = angle + (pellet ? (random(state) - 0.5) * weapon.spread * 2 : 0);
    const range = Math.max(1, distance(hostile, state.player)),
      heightDelta =
        (state.player.z || 0) + (state.player.crouching ? 8 : 12) - ((hostile.z || 0) + 13);
    const length = Math.hypot(range, heightDelta),
      speed = Math.min(600, weapon.bulletSpeed),
      horizontalSpeed = (speed * range) / length;
    state.bullets.push({
      id: nextId(state, 'bullet'),
      x: hostile.x + Math.cos(direction) * 10,
      y: hostile.y + Math.sin(direction) * 10,
      prevX: hostile.x,
      prevY: hostile.y,
      z: (hostile.z || 0) + 13,
      angle: direction,
      vx: Math.cos(direction) * horizontalSpeed,
      vy: Math.sin(direction) * horizontalSpeed,
      vz: (speed * heightDelta) / length,
      remaining: Math.min(weapon.range, 500),
      damage: weapon.damage * (hostile.kind === 'police' ? 0.25 : 0.33),
      owner: hostile.id,
      sceneId: actorSceneId(hostile),
      weapon: hostile.weapon,
    });
  }
  hostile.fireCooldown = Math.max(0.3, weapon.fireInterval * 3) + random(state) * 0.4;
}
function segmentDistance(point, start, end) {
  const dx = end.x - start.x,
    dy = end.y - start.y;
  const fraction = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1),
    0,
    1,
  );
  return Math.hypot(point.x - start.x - dx * fraction, point.y - start.y - dy * fraction);
}
function segmentHeight(point, start, end) {
  const dx = end.x - start.x,
    dy = end.y - start.y,
    t = clamp(
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1),
      0,
      1,
    );
  return (start.z || 0) + ((end.z || 0) - (start.z || 0)) * t;
}
function updateBullets(state, dt) {
  for (const bullet of state.bullets) {
    const sceneId = bullet.sceneId ?? null,
      geometry = SCENES.queries(state, sceneId);
    bullet.prevX = bullet.x;
    bullet.prevY = bullet.y;
    bullet.prevZ = bullet.z;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    if (bullet.vz) {
      bullet.z = (bullet.z || 0) + bullet.vz * dt;
    }
    bullet.remaining -= Math.hypot(bullet.vx, bullet.vy, bullet.vz || 0) * dt;
    const previous = { x: bullet.prevX, y: bullet.prevY, z: bullet.prevZ };
    for (const prop of lateMeterPropDescriptors(state)) {
      if (prop.sceneId !== sceneId) continue;
      const contact = traceLateMeterClipboard(previous, bullet, prop);
      if (
        contact &&
        hasLineOfSight(previous, contact, state, sceneId) &&
        !geometry.isBlocked(contact.x, contact.y, 0.05, contact.z)
      )
        damageCampaignProp(state, prop, bullet.damage);
    }
    if (
      bullet.z < ELEVATION.min ||
      !hasLineOfSight(previous, bullet, state, sceneId) ||
      geometry.isBlocked(bullet.x, bullet.y, 1, bullet.z || 0)
    ) {
      if (sceneId) {
        const contact = geometry.traceSolid?.(previous, bullet);
        if (contact) damageSceneProp(state, sceneId, contact.volume.id, bullet.damage);
      }
      bullet.remaining = 0;
      continue;
    }
    if (bullet.owner === 'player') {
      const targets = [
        ...scenePeople(state, sceneId),
        ...(sceneId ? [] : state.policeAircraft),
      ].filter(
        (person) =>
          person.health > 0 &&
          segmentDistance(person, previous, bullet) <
            (person.role === 'air-search' ? 24 : (person.radius ?? 7) + 2) &&
          (bullet.z === undefined ||
            (segmentHeight(person, previous, bullet) >= (person.z || 0) &&
              segmentHeight(person, previous, bullet) <=
                (person.z || 0) + (person.collisionHeight ?? (actorSceneId(person) ? 30 : 18)))),
      );
      targets.sort((a, b) => distance(a, previous) - distance(b, previous));
      const victim = targets[0];
      const car = sceneVehicles(state, sceneId)
        .filter(
          (vehicle) =>
            vehicle.health > 0 &&
            vehicle.id !== state.player.vehicleId &&
            segmentDistance(vehicle, previous, bullet) < VEHICLE_SPECS[vehicle.spec].width * 0.7 &&
            (bullet.z === undefined ||
              (segmentHeight(vehicle, previous, bullet) >= (vehicle.z || 0) &&
                segmentHeight(vehicle, previous, bullet) <= (vehicle.z || 0) + 18)),
        )
        .sort((a, b) => distance(a, previous) - distance(b, previous))[0];
      if (car && (!victim || distance(car, previous) < distance(victim, previous))) {
        damageVehicle(state, car, bullet.damage * 0.65, 'player', 'bullet');
        bullet.remaining = 0;
      } else if (victim) {
        hitCombatant(state, victim, bullet.damage, 'player', combatContext(state, sceneId));
        bullet.remaining = 0;
      }
    } else if (
      sceneId === currentSceneId(state) &&
      segmentDistance(state.player, previous, bullet) < (state.player.vehicleId ? 16 : 8) &&
      (bullet.z === undefined ||
        state.player.vehicleId ||
        (segmentHeight(state.player, previous, bullet) >= state.player.z &&
          segmentHeight(state.player, previous, bullet) <=
            state.player.z + (state.player.crouching ? 10 : 18)))
    ) {
      const vehicle = currentVehicle(state);
      if (vehicle) damageVehicle(state, vehicle, bullet.damage * 1.3, bullet.owner, 'bullet');
      else damagePlayer(state, bullet.damage);
      bullet.remaining = 0;
    }
  }
  state.bullets = state.bullets.filter((bullet) => bullet.remaining > 0);
}

const npcVehicleInputs = new WeakMap();
function npcInputState(state) {
  let controls = npcVehicleInputs.get(state);
  if (!controls) {
    controls = { pending: new Map(), managed: new Set() };
    npcVehicleInputs.set(state, controls);
  }
  return controls;
}
function npcPlain(value, keys) {
  return (
    value &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).length === keys.length &&
    keys.every((key) => {
      const d = Object.getOwnPropertyDescriptor(value, key);
      return d?.enumerable && Object.hasOwn(d, 'value');
    })
  );
}
function npcPhysicalOwner(state, scope) {
  const model =
      scope.missionId === 'LL-ST-001'
        ? state.campaignRuntime
        : scope.missionId === 'LL-ST-002'
          ? state.lateMeterRuntime
          : null,
    active = model?.active,
    run = state.campaign?.active,
    receipt = state.campaign?.receipts?.[scope.activationReceipt];
  return model &&
    active?.phase === 'running' &&
    run?.phase === 'running' &&
    active.missionId === scope.missionId &&
    run.missionId === scope.missionId &&
    active.stageId === scope.stageId &&
    run.stageId === scope.stageId &&
    active.attempt === scope.attempt &&
    run.attempt === scope.attempt &&
    active.receipt === scope.activationReceipt &&
    receipt?.kind === 'stage-activation' &&
    receipt.missionId === scope.missionId &&
    receipt.stageId === scope.stageId &&
    receipt.attempt === scope.attempt
    ? model
    : null;
}
/** Parent queues a single physical-step input after actual mission/driver observation.
 * Commands are transient; no input survives restore, failure, scope change or expiry.
 */
export function queueNPCVehicleInput(state, request) {
  if (
    !npcPlain(request, ['vehicleId', 'actorId', 'scope', 'input', 'dt']) ||
    !npcPlain(request.scope, ['missionId', 'stageId', 'attempt', 'activationReceipt']) ||
    !npcPlain(request.input, ['up', 'brake', 'left', 'right'])
  )
    return { ok: false, unmet: ['invalid-npc-driver-input'] };
  const { vehicleId, actorId, scope, input, dt } = request;
  if (
    typeof vehicleId !== 'string' ||
    typeof actorId !== 'string' ||
    !Number.isFinite(dt) ||
    dt <= 0 ||
    dt > 0.5 ||
    !Number.isSafeInteger(scope.attempt) ||
    scope.attempt < 1 ||
    !['missionId', 'stageId', 'activationReceipt'].every((key) => typeof scope[key] === 'string') ||
    !Object.values(input).every((v) => typeof v === 'boolean')
  )
    return { ok: false, unmet: ['invalid-npc-driver-input'] };
  const model = npcPhysicalOwner(state, scope),
    driver = Companions.driverObservation(state, vehicleId, companionContext(state));
  if (!model || driver?.actorId !== actorId || driver.controllable !== true)
    return { ok: false, unmet: ['actual-owned-seated-npc-driver-required'] };
  const controls = npcInputState(state);
  controls.pending.set(vehicleId, {
    actorId,
    scope: { ...scope },
    input: { ...input },
    at: state.time,
    dt,
    model,
    epoch: model.restoreEpoch,
    campaign: state.campaign,
  });
  controls.managed.add(vehicleId);
  return { ok: true };
}
/** Release control, leaving the actual named body/seat and vehicle momentum intact. */
export function releaseNPCVehicleInput(state, vehicleId, reason = 'released') {
  const controls = npcInputState(state);
  controls.pending.delete(vehicleId);
  if (
    state.vehicles.some(
      (v) => v.id === vehicleId && v.companionSeats?.some((seat) => seat.seat === 0),
    )
  )
    controls.managed.add(vehicleId);
  return { ok: true, vehicleId, reason };
}
export function resetNPCVehicleInputs(state) {
  npcVehicleInputs.delete(state);
}
function vehicleControllerOwner(state, vehicle, controller) {
  if (state.player.vehicleId === vehicle.id) return 'player';
  if (controller?.actorId) return controller.actorId;
  const actor = (state.companions?.actors ?? []).find(
    (body) =>
      body.vehicleId === vehicle.id &&
      body.seat === 0 &&
      body.health > 0 &&
      Companions.getSeat(state, body.id),
  );
  return actor?.id ?? 'world';
}
function collisionOwner(state, vehicle, other, controller) {
  const toward = (from, to) => {
      const dx = to.x - from.x,
        dy = to.y - from.y,
        length = Math.hypot(dx, dy);
      return length
        ? Math.max(
            0,
            (Math.cos(from.angle) * (from.speed ?? 0) * dx +
              Math.sin(from.angle) * (from.speed ?? 0) * dy) /
              length,
          )
        : 0;
    },
    own = toward(vehicle, other),
    theirs = toward(other, vehicle);
  return own > 0 && own >= theirs
    ? vehicleControllerOwner(state, vehicle, controller)
    : theirs > 0
      ? vehicleControllerOwner(state, other)
      : 'world';
}
function updateNPCVehicles(state, dt) {
  const controls = npcInputState(state),
    present = new Set();
  for (const vehicle of state.vehicles) {
    const leased = vehicle.companionSeats?.some((seat) => seat.seat === 0);
    if (!leased && !controls.managed.has(vehicle.id)) continue;
    present.add(vehicle.id);
    const queued = controls.pending.get(vehicle.id);
    controls.pending.delete(vehicle.id);
    if (state.player.vehicleId === vehicle.id) {
      controls.managed.delete(vehicle.id);
      continue;
    }
    if (vehicle.health <= 0) {
      controls.managed.delete(vehicle.id);
      continue;
    }
    const driver = Companions.driverObservation(state, vehicle.id, companionContext(state)),
      model = queued && npcPhysicalOwner(state, queued.scope),
      usable =
        queued &&
        driver?.controllable === true &&
        driver.actorId === queued.actorId &&
        model === queued.model &&
        model.restoreEpoch === queued.epoch &&
        state.campaign === queued.campaign &&
        state.time + 1e-6 >= queued.at &&
        state.time <= queued.at + queued.dt + 1e-6;
    // Missing control applies real brakes; boarding/egress/death never fabricates a driver.
    const input = usable ? queued.input : { brake: true };
    drive(state, vehicle, dt, input, { actorId: driver?.actorId ?? null, player: false });
    if (!leased && vehicle.speed === 0) controls.managed.delete(vehicle.id);
  }
  for (const key of controls.pending.keys()) if (!present.has(key)) controls.pending.delete(key);
}
function drive(state, vehicle, dt, input, controller = null) {
  const playerControlled = controller === null && state.player.vehicleId === vehicle.id,
    owner = vehicleControllerOwner(state, vehicle, controller);
  const spec = VEHICLE_SPECS[vehicle.spec];
  const throttle = (input.forward || input.up ? 1 : 0) - (input.backward || input.down ? 1 : 0);
  const steering = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (input.brake) {
    vehicle.speed *= Math.max(0, 1 - dt * 6.5);
  } else if (throttle) {
    const accelerating = Math.sign(vehicle.speed) === throttle || Math.abs(vehicle.speed) < 4;
    vehicle.speed += throttle * (accelerating ? spec.acceleration : spec.braking) * dt;
  } else vehicle.speed *= Math.max(0, 1 - dt * 1.35);
  vehicle.speed = clamp(
    vehicle.speed,
    -spec.reverseSpeed,
    spec.maxSpeed * (vehicle.health < 35 ? 0.55 : 1),
  );
  if (Math.abs(vehicle.speed) < 0.2) vehicle.speed = 0;
  const turning =
    Math.min(1, Math.abs(vehicle.speed) / 26) *
    Math.max(0.42, 1 - Math.abs(vehicle.speed) / (spec.maxSpeed * 1.45));
  vehicle.angle = normalizeAngle(
    vehicle.angle + steering * spec.grip * turning * Math.sign(vehicle.speed || 1) * dt,
  );
  const before = { x: vehicle.x, y: vehicle.y };
  const collided = moveBody(
    vehicle,
    Math.cos(vehicle.angle) * vehicle.speed * dt,
    Math.sin(vehicle.angle) * vehicle.speed * dt,
    spec.width * 0.62,
    { state },
  );
  if (collided) {
    if (Math.abs(vehicle.speed) > 40)
      damageVehicle(state, vehicle, Math.abs(vehicle.speed) * 0.075, owner);
    vehicle.speed *= -0.15;
  }
  for (const other of state.vehicles) {
    if (
      other.id === vehicle.id ||
      actorSceneId(other) !== actorSceneId(vehicle) ||
      other.health <= 0 ||
      Math.abs((other.z || 0) - (vehicle.z || 0)) > 12
    )
      continue;
    const minimumDistance = (spec.width + VEHICLE_SPECS[other.spec].width) * 0.69;
    if (distance(vehicle, other) < minimumDistance) {
      const speed = Math.abs(vehicle.speed - other.speed);
      const causalOwner = collisionOwner(state, vehicle, other, controller);
      const separationAngle = angleTo(other, vehicle);
      moveBody(
        vehicle,
        Math.cos(separationAngle) * 2,
        Math.sin(separationAngle) * 2,
        spec.width * 0.62,
        { state },
      );
      vehicle.speed *= -0.1;
      other.speed *= 0.2;
      if (speed > 35) {
        damageVehicle(state, vehicle, speed * 0.12, causalOwner);
        damageVehicle(state, other, speed * 0.15, causalOwner);
      }
    }
  }
  const people = scenePeople(state, actorSceneId(vehicle));
  if (
    !playerControlled &&
    !state.player.vehicleId &&
    actorSceneId(state.player) === actorSceneId(vehicle)
  )
    people.push(state.player);
  for (const person of people) {
    if (
      person.health <= 0 ||
      person.inVehicle ||
      person.vehicleId === vehicle.id ||
      Math.abs((person.z || 0) - (vehicle.z || 0)) > 12 ||
      distance(vehicle, person) > spec.width * 0.65 + 6 ||
      Math.abs(vehicle.speed) < 18
    )
      continue;
    const healthBefore = person.health,
      armourBefore = person.armour ?? 0;
    if (person === state.player) damagePlayer(state, Math.abs(vehicle.speed) * 0.9);
    else person.health = Math.max(0, person.health - Math.abs(vehicle.speed) * 0.9);
    notifyCommittedDamage(
      state,
      person,
      healthBefore,
      armourBefore,
      owner,
      { onDamage: campaignObservers(state)?.damage, sceneId: actorSceneId(person) },
      'vehicle-impact',
    );
    if (person !== state.player) person.panic = 8;
    vehicle.speed *= 0.68;
    if (owner === 'player' && !state.hostiles.some((hostile) => hostile.id === person.id))
      reportCrime(state, {
        type: person.kind === 'police' ? 'police-assault' : 'hit-and-run',
        severity: person.kind === 'police' ? 3 : 2,
      });
  }
  if (playerControlled) {
    state.progress.distanceDriven += distance(vehicle, before);
    state.player.x = vehicle.x;
    state.player.y = vehicle.y;
    state.player.angle = vehicle.angle;
    state.player.speed = vehicle.speed;
  }
}
export function toggleCover(state) {
  if (state.cinematics?.active || state.shelterServices?.active || railPassenger(state))
    return false;
  if (currentSceneId(state)) return toggleInteriorCover(state);
  const p = state.player;
  if (
    p.vehicleId ||
    p.health <= 0 ||
    Math.abs(p.z - (p.groundZ || 0)) > 1 ||
    p.swimming ||
    p.groundZ < 0 ||
    p.traversal
  )
    return false;
  if (p.cover) {
    p.cover = null;
    return true;
  }
  let best = null;
  for (const b of geometryFor(state).nearbyBuildings(p.x, p.y, 22)) {
    const candidates = [
      {
        x: b.x - 8,
        y: clamp(p.y, b.y, b.y + b.h),
        side: 'west',
        nx: -1,
        ny: 0,
        min: b.y,
        max: b.y + b.h,
      },
      {
        x: b.x + b.w + 8,
        y: clamp(p.y, b.y, b.y + b.h),
        side: 'east',
        nx: 1,
        ny: 0,
        min: b.y,
        max: b.y + b.h,
      },
      {
        x: clamp(p.x, b.x, b.x + b.w),
        y: b.y - 8,
        side: 'north',
        nx: 0,
        ny: -1,
        min: b.x,
        max: b.x + b.w,
      },
      {
        x: clamp(p.x, b.x, b.x + b.w),
        y: b.y + b.h + 8,
        side: 'south',
        nx: 0,
        ny: 1,
        min: b.x,
        max: b.x + b.w,
      },
    ];
    for (const point of candidates) {
      const d = distance(p, point);
      if (d < 20 && (!best || d < best.distance) && !isBlocked(point.x, point.y, 7, p.z, state))
        best = { ...point, buildingId: b.id, distance: d };
    }
  }
  if (!best) return false;
  p.cover = best;
  p.x = best.x;
  p.y = best.y;
  p.crouching = true;
  return true;
}
function carBlocksFoot(state, x, y, z = 0) {
  return sceneVehicles(state).some((car) => {
    if (car.health <= 0 || z < (car.z || 0) - 4 || z >= (car.z || 0) + 16) return false;
    const spec = VEHICLE_SPECS[car.spec],
      dx = x - car.x,
      dy = y - car.y,
      c = Math.cos(car.angle),
      s = Math.sin(car.angle);
    const lx = dx * c + dy * s,
      ly = -dx * s + dy * c;
    return (
      Math.hypot(
        lx - clamp(lx, -spec.length / 2, spec.length / 2),
        ly - clamp(ly, -spec.width / 2, spec.width / 2),
      ) < 7
    );
  });
}
function movePlayer(state, dx, dy) {
  const p = state.player,
    steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
  for (let i = 0; i < steps; i++) {
    const x = p.x + dx / steps,
      y = p.y + dy / steps;
    if (!carBlocksFoot(state, x, y, p.z))
      moveBody(p, dx / steps, dy / steps, 7, { allowWater: true, state });
    else if (!carBlocksFoot(state, x, p.y, p.z))
      moveBody(p, dx / steps, 0, 7, { allowWater: true, state });
    else if (!carBlocksFoot(state, p.x, y, p.z))
      moveBody(p, 0, dy / steps, 7, { allowWater: true, state });
  }
}
export function jumpOrVault(state, { vaultOnly = false } = {}) {
  if (state.cinematics?.active || state.shelterServices?.active || railPassenger(state))
    return false;
  const p = state.player;
  if (
    p.vehicleId ||
    p.health <= 0 ||
    Math.abs(p.z - (p.groundZ || 0)) > 0.1 ||
    p.swimming ||
    p.traversal ||
    p.stamina < 16
  )
    return false;
  let obstacle = null;
  for (const item of currentSceneId(state)
    ? interiorCollisionVolumes(state)
    : WORLD.obstacles || []) {
    if (item.traversable === false || (item.z ?? 0) > (p.groundZ ?? 0) + 6) continue;
    const relativeHeight = (item.z ?? 0) + item.height - (p.groundZ ?? 0);
    const nearest = {
      x: clamp(p.x, item.x, item.x + item.w),
      y: clamp(p.y, item.y, item.y + item.h),
    };
    if (
      relativeHeight > 0 &&
      relativeHeight <= 36 &&
      distance(p, nearest) < 24 &&
      Math.abs(normalizeAngle(angleTo(p, nearest) - p.angle)) < 1
    ) {
      const nx = Math.cos(p.angle),
        ny = Math.sin(p.angle);
      const end =
        Math.abs(nx) > Math.abs(ny)
          ? { x: nx > 0 ? item.x + item.w + 12 : item.x - 12, y: p.y }
          : { x: p.x, y: ny > 0 ? item.y + item.h + 12 : item.y - 12 };
      if (
        !isBlocked(end.x, end.y, 7, p.groundZ || 0, state) &&
        !carBlocksFoot(state, end.x, end.y, p.groundZ || 0)
      )
        obstacle = {
          sourceVolumeId: item.id,
          kind: relativeHeight > 20 ? 'climb' : 'vault',
          end,
          height: relativeHeight + 12,
        };
    }
  }
  if (!obstacle)
    for (const car of sceneVehicles(state)) {
      if (
        car.health <= 0 ||
        Math.abs(car.speed) > 2 ||
        distance(p, car) > 36 ||
        Math.abs(normalizeAngle(angleTo(p, car) - p.angle)) > 0.8
      )
        continue;
      const end = { x: car.x + Math.cos(p.angle) * 29, y: car.y + Math.sin(p.angle) * 29 };
      if (
        !isBlocked(end.x, end.y, 7, p.groundZ || 0, state) &&
        !carBlocksFoot(state, end.x, end.y, p.groundZ || 0)
      )
        obstacle = { kind: 'vault', end, height: 26 };
    }
  p.cover = null;
  p.crouching = false;
  if (obstacle) {
    // Reject a path that would tunnel through an unrelated building.
    const clear = geometryFor(state)
      .nearbyBuildings(p.x, p.y, 80)
      .filter((b) => b.id !== obstacle.sourceVolumeId)
      .every(
        (b) =>
          !Array.from({ length: 8 }, (_, i) => ({
            x: p.x + ((obstacle.end.x - p.x) * (i + 1)) / 8,
            y: p.y + ((obstacle.end.y - p.y) * (i + 1)) / 8,
          })).some((q) => circleRectCollision(q.x, q.y, 7, b)),
      );
    if (!clear) return false;
    if (twoSeatsBodies.enabled(state)) {
      let previous = { x: p.x, y: p.y, z: p.groundZ || 0 };
      for (let i = 1; i <= 24; i++) {
        const t = i / 24,
          next = {
            x: p.x + (obstacle.end.x - p.x) * t,
            y: p.y + (obstacle.end.y - p.y) * t,
            z: (p.groundZ || 0) + Math.sin(Math.PI * t) * obstacle.height,
          };
        if (
          !twoSeatsBodies.native.sweep(state, previous, next, {
            sceneId: currentSceneId(state),
            radius: 7,
            height: 30,
          }).clear
        )
          return false;
        previous = next;
      }
    }
    p.stamina -= 20;
    p.traversal = {
      ...obstacle,
      start: { x: p.x, y: p.y },
      groundZ: p.groundZ || 0,
      elapsed: 0,
      duration: obstacle.kind === 'climb' ? 0.95 : 0.62,
    };
    return true;
  }
  if (vaultOnly) return false;
  p.stamina -= 16;
  p.vz = 94;
  return true;
}
function walk(state, dt, input) {
  const p = state.player;
  p.aiming = Boolean(input.aim);
  p.aimTarget =
    input.aimTarget &&
    Number.isFinite(input.aimTarget.x) &&
    Number.isFinite(input.aimTarget.y) &&
    Number.isFinite(input.aimTarget.z)
      ? {
          x: input.aimTarget.x,
          y: input.aimTarget.y,
          z: clamp(input.aimTarget.z, ELEVATION.min, ELEVATION.max),
        }
      : null;
  if (p.aimTarget) p.angle = angleTo(p, p.aimTarget);
  p.scoped = Boolean(input.aim && WEAPONS[p.weapon].scopeZoom);
  if (p.cover) p.cover.peeking = p.aiming;
  p.throwCharge = clamp(Number(input.throwCharge) || 0, 0, 1);
  p.crouching = Boolean(input.crouch || p.cover);
  if (Number.isFinite(input.aimAngle) && !p.aimTarget) p.angle = normalizeAngle(input.aimAngle);
  if (p.traversal) {
    const action = p.traversal;
    action.elapsed += dt;
    const t = clamp(action.elapsed / action.duration, 0, 1);
    const next = {
      x: action.start.x + (action.end.x - action.start.x) * t,
      y: action.start.y + (action.end.y - action.start.y) * t,
      z: (action.groundZ || 0) + Math.sin(Math.PI * t) * action.height,
    };
    if (
      twoSeatsBodies.enabled(state) &&
      !twoSeatsBodies.native.sweep(state, p, next, {
        sceneId: currentSceneId(state),
        radius: 7,
        height: 30,
      }).clear
    ) {
      p.traversal = null;
      p.vz = 0;
      p.speed = 0;
      return;
    }
    Object.assign(p, next);
    p.speed = 0;
    if (t === 1) {
      p.groundZ = geometryFor(state).surfaceHeight(p.x, p.y, action.groundZ || 0);
      p.z = p.groundZ;
      p.vz = 0;
      p.traversal = null;
    }
    return;
  }
  p.groundZ ??= geometryFor(state).surfaceHeight(p.x, p.y, p.z);
  p.vz ||= 0;
  if (p.z > p.groundZ || p.vz > 0) {
    p.vz -= 220 * dt;
    const requested = Math.max(p.groundZ, p.z + p.vz * dt),
      roof =
        requested > p.z
          ? twoSeatsBodies.limitRise(state, p, requested, currentSceneId(state))
          : { z: requested, hit: false };
    p.z = roof.z;
    if (roof.hit) p.vz = 0;
    if (p.z === p.groundZ) p.vz = 0;
  }
  p.swimming = Boolean(
    geometryFor(state).isWater(p.x, p.y, { ignoreDeck: true }) && p.z <= 0 && p.groundZ >= 0,
  );
  if (p.dodgeRemaining > 0) {
    p.dodgeRemaining = Math.max(0, p.dodgeRemaining - dt);
    movePlayer(state, Math.cos(p.dodgeAngle) * 125 * dt, Math.sin(p.dodgeAngle) * 125 * dt);
    p.speed = 125;
    return;
  }
  let dx = Number.isFinite(input.moveX)
    ? clamp(input.moveX, -1, 1)
    : (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let dy = Number.isFinite(input.moveY)
    ? clamp(input.moveY, -1, 1)
    : (input.backward || input.down ? 1 : 0) - (input.forward || input.up ? 1 : 0);
  const magnitude = Math.hypot(dx, dy);
  if (magnitude > 1) {
    dx /= magnitude;
    dy /= magnitude;
  }
  if (p.intoxication && magnitude > 0) {
    const sway = Math.sin(state.time * 2.4) * p.intoxication * 0.22,
      x = dx;
    dx = x * Math.cos(sway) - dy * Math.sin(sway);
    dy = x * Math.sin(sway) + dy * Math.cos(sway);
  }
  if (p.cover) {
    if (dx * p.cover.nx + dy * p.cover.ny > 0.45) p.cover = null;
    else {
      const vertical = p.cover.nx !== 0;
      dx = vertical ? 0 : dx;
      dy = vertical ? dy : 0;
    }
  }
  const sprint = input.sprint && magnitude > 0 && p.stamina > 0 && !p.crouching && !p.defending;
  const speed = p.swimming
    ? sprint && p.stamina > 0
      ? 38
      : 24
    : p.crouching
      ? 27
      : p.defending
        ? 31
        : sprint
          ? 88
          : 51;
  p.stamina = clamp(
    p.stamina + (p.swimming ? (!magnitude ? 6 : sprint ? -12 : -1.8) : sprint ? -17 : 12) * dt,
    0,
    100,
  );
  if (p.swimming && magnitude > 0 && p.stamina <= 0) damagePlayer(state, 6 * dt);
  p.speed = magnitude ? speed : 0;
  if (magnitude > 0) {
    if (!Number.isFinite(input.aimAngle) && !input.fire && !p.cover) p.angle = Math.atan2(dy, dx);
    movePlayer(state, dx * speed * dt, dy * speed * dt);
  }
  if (p.cover) {
    const coordinate = p.cover.nx !== 0 ? p.y : p.x;
    if (coordinate < p.cover.min - 1 || coordinate > p.cover.max + 1) p.cover = null;
  }
}
function updateTraffic(state, dt) {
  for (const vehicle of state.vehicles) {
    if (!inScene(vehicle, null)) continue;
    if (vehicle.policeControlled) continue;
    if (vehicle.companionSeats?.some((seat) => seat.seat === 0)) continue;
    if (vehicle.kind !== 'traffic' || vehicle.occupied || vehicle.health <= 0 || !vehicle.route)
      continue;
    const waypoint = vehicle.route[vehicle.routeIndex];
    const remaining = distance(vehicle, waypoint);
    if (remaining < 6) {
      vehicle.routeIndex = (vehicle.routeIndex + 1) % vehicle.route.length;
      continue;
    }
    const desiredAngle = angleTo(vehicle, waypoint);
    const desiredSpeed = 37 + (Number(vehicle.id.split('-').pop()) % 7) * 3;
    const obstacle = state.vehicles.some(
      (other) =>
        other.id !== vehicle.id &&
        other.health > 0 &&
        distance(other, vehicle) < 31 &&
        Math.abs(normalizeAngle(angleTo(vehicle, other) - desiredAngle)) < 0.8,
    );
    vehicle.speed += ((obstacle ? 0 : desiredSpeed) - vehicle.speed) * Math.min(1, dt * 3);
    vehicle.angle = desiredAngle;
    const travel = Math.min(remaining, vehicle.speed * dt);
    if (
      moveBody(vehicle, Math.cos(vehicle.angle) * travel, Math.sin(vehicle.angle) * travel, 8, {
        state,
      })
    )
      vehicle.speed = 0;
  }
}
function ambientContext(state) {
  return {
    createVehicle: (definition) => createVehicle(state, definition),
    isBlocked,
    specs: VEHICLE_SPECS,
    protectedVehicleIds: ['starter-taxi', 'medicine-van'],
  };
}
function updatePedestrians(state, dt) {
  for (const person of state.pedestrians) {
    if (!inScene(person, null)) continue;
    if (person.health <= 0) continue;
    person.panic = Math.max(0, person.panic - dt);
    if (person.panic > 0 && distance(person, state.player) < 100) {
      person.angle = angleTo(state.player, person);
      moveBody(person, Math.cos(person.angle) * 43 * dt, Math.sin(person.angle) * 43 * dt, 6);
    } else if (person.route?.length) {
      const waypoint = person.route[person.routeIndex];
      const remaining = distance(person, waypoint);
      if (remaining < 3) person.routeIndex = (person.routeIndex + 1) % person.route.length;
      else {
        person.angle = angleTo(person, waypoint);
        const travel = Math.min(remaining, person.speed * dt);
        moveBody(person, Math.cos(person.angle) * travel, Math.sin(person.angle) * travel, 6);
      }
    } else {
      const direction = Math.sin(person.angle) >= 0 ? 1 : -1;
      person.angle = (direction * Math.PI) / 2;
      person.x += (person.homeX - person.x) * Math.min(1, dt);
      moveBody(person, 0, direction * person.speed * dt, 6);
      // Head back into the patrol band; flipping every frame would strand a pushed pedestrian.
      if (person.y > person.maxY) person.angle = -Math.PI / 2;
      else if (person.y < person.minY) person.angle = Math.PI / 2;
    }
  }
}
function spawnPolice(state) {
  state.policeDispatch.nextDeployment = state.time;
}
function updatePolice(state, dt, input = {}) {
  updatePolicing(state, dt, input, policeContext(state));
}
function updateHostiles(state, dt, sceneId = currentSceneId(state)) {
  for (const hostile of state.hostiles) {
    if (!inScene(hostile, sceneId)) continue;
    if (hostile.health <= 0) continue;
    hostile.fireCooldown = Math.max(0, hostile.fireCooldown - dt);
    updateEnemyReload(hostile, dt);
    const range = distance(hostile, state.player);
    if (range > 500) continue;
    hostile.angle = angleTo(hostile, state.player);
    if (
      range > (WEAPONS[hostile.weapon]?.mode === 'melee' ? 18 : 120) ||
      !hasLineOfSight(hostile, state.player, state, sceneId)
    )
      moveBody(hostile, Math.cos(hostile.angle) * 32 * dt, Math.sin(hostile.angle) * 32 * dt, 7, {
        state,
      });
    if (
      range < 250 &&
      hasLineOfSight(hostile, state.player, state, sceneId) &&
      hostile.fireCooldown === 0
    )
      fireHostile(state, hostile);
  }
}
/** Canonical threat bindings, with the same physical cast and weapon contexts. */
export function namedHostilityContext(state) {
  const physical = companionContext(state);
  return { ...physical, fireActor: (actor) => fireHostile(state, actor) };
}
export function damageStoryActor(state, actorId, amount, owner = 'player', kind = 'wrist-injury') {
  const actor = Companions.getActor(state, actorId);
  if (!actor || !Number.isFinite(amount) || amount <= 0)
    return { ok: false, reason: 'actual-actor-damage-required' };
  const before = { health: actor.health, armour: actor.armour ?? 0 };
  hitCombatant(state, actor, amount, owner, combatContext(state, actorSceneId(actor)), kind);
  return {
    ok: true,
    actorId,
    healthBefore: before.health,
    healthAfter: actor.health,
    armourBefore: before.armour,
    armourAfter: actor.armour ?? 0,
    at: state.time,
  };
}
function spawnEncounter(state, definition) {
  for (let i = 0; i < definition.count; i += 1) {
    const x = definition.x + (i % 2 ? -22 : 22);
    const y = definition.y + Math.floor(i / 2) * 25;
    state.hostiles.push({
      id: nextId(state, 'hostile'),
      kind: 'hostile',
      x,
      y,
      angle: Math.PI,
      health: definition.health || 70,
      weapon: definition.weapon || 'pistol',
      fireCooldown: 1.8 + i * 0.5,
      encounter: state.mission.id,
      color: '#aa6f69',
      speed: 32,
    });
  }
}
function enterStage(state) {
  const definition = MISSIONS.find((mission) => mission.id === state.mission.id);
  const stage = definition.stages[state.mission.stage];
  Object.assign(state.mission, {
    title: definition.title,
    objective: stage.objective,
    stageType: stage.type,
    target: stage.target ? clone(stage.target) : null,
    stageElapsed: 0,
    deadline: stage.deadline || null,
  });
  if (stage.type === 'escape') {
    raiseWanted(state, stage.heat || 1);
    state.mission.target = {
      ...state.wanted.lastSeen,
      radius: state.wanted.searchRadius,
      name: 'Leave the police search circle',
    };
    spawnPolice(state);
  }
  if (stage.dialogue) say(state, stage.dialogue);
  if (stage.spawnVehicle) {
    const existing = state.vehicles.find((vehicle) => vehicle.id === stage.spawnVehicle.id);
    if (!existing) state.vehicles.push(createVehicle(state, stage.spawnVehicle));
    else if (existing.health <= 0)
      Object.assign(existing, createVehicle(state, stage.spawnVehicle));
  }
  notify(state, stage.objective, 'mission');
}
function advanceMission(state) {
  if (!state.mission) return;
  const definition = MISSIONS.find((mission) => mission.id === state.mission.id);
  const completedStage = definition.stages[state.mission.stage];
  if (completedStage.encounter) spawnEncounter(state, completedStage.encounter);
  state.mission.stage += 1;
  if (state.mission.stage >= definition.stages.length) {
    state.progress.completed.push(definition.id);
    state.player.money += definition.reward;
    state.progress.cashEarned += definition.reward;
    state.hostiles = state.hostiles.filter((hostile) => hostile.encounter !== definition.id);
    state.mission = null;
    notify(state, `${definition.title} complete · +$${definition.reward}`, 'success');
    const next = MISSIONS.find((mission) => mission.prerequisite === definition.id);
    if (next) notify(state, `New contact: ${next.contact} · ${next.title}`, 'mission');
    return;
  }
  enterStage(state);
}
export function startMission(state, id) {
  if (
    state.campaignMode === 'story' &&
    (state.campaign?.active || !state.campaign?.completed?.['LL-ST-001'])
  ) {
    notify(state, 'Finish the arrival before taking another assignment.');
    return false;
  }
  const definition = MISSIONS.find((mission) => mission.id === id);
  if (
    !definition ||
    state.mission ||
    state.player.health <= 0 ||
    state.wanted.level > 0 ||
    state.progress.completed.includes(id)
  )
    return false;
  if (definition.prerequisite && !state.progress.completed.includes(definition.prerequisite))
    return false;
  state.mission = {
    id,
    stage: 0,
    elapsed: 0,
    stageElapsed: 0,
    objective: '',
    stageType: '',
    target: null,
  };
  state.hostiles = [];
  state.taxiJob = null;
  enterStage(state);
  return true;
}
function failMission(state, reason) {
  if (!state.mission) return;
  const id = state.mission.id;
  state.progress.failed.push({ id, reason, time: state.time });
  state.progress.failed = state.progress.failed.slice(-30);
  state.mission = null;
  state.hostiles = [];
  notify(state, `Assignment failed · ${reason}`, 'danger');
}
function vehicleRequirementMet(state, required) {
  const vehicle = currentVehicle(state);
  return !required || Boolean(vehicle && (vehicle.id === required || vehicle.spec === required));
}
function updateMission(state, dt) {
  if (!state.mission) return;
  const definition = MISSIONS.find((mission) => mission.id === state.mission.id);
  const stage = definition.stages[state.mission.stage];
  state.mission.elapsed += dt;
  state.mission.stageElapsed += dt;
  if (stage.type === 'vehicle') {
    const requestedVehicle = state.vehicles.find((vehicle) => vehicle.id === stage.vehicle);
    if (requestedVehicle && state.mission.target) {
      state.mission.target.x = requestedVehicle.x;
      state.mission.target.y = requestedVehicle.y;
    }
    if (requestedVehicle?.health <= 0) {
      failMission(state, 'The mission vehicle was destroyed.');
      return;
    }
  }
  if (stage.deadline && state.mission.stageElapsed > stage.deadline) {
    failMission(state, 'The delivery window closed.');
    return;
  }
  const essentialVehicle =
    stage.requiredVehicle && state.vehicles.find((vehicle) => vehicle.id === stage.requiredVehicle);
  const protectedVehicle =
    stage.protectVehicle && state.vehicles.find((vehicle) => vehicle.id === stage.protectVehicle);
  if (essentialVehicle?.health <= 0 || protectedVehicle?.health <= 0) {
    failMission(state, 'The mission vehicle was destroyed.');
    return;
  }
  if (stage.type === 'vehicle' && state.player.vehicleId === stage.vehicle) advanceMission(state);
  else if (
    (stage.type === 'drive' || stage.type === 'reach') &&
    distance(state.player, stage.target) < stage.target.radius &&
    vehicleRequirementMet(state, stage.requiredVehicle) &&
    (!stage.onFoot || !state.player.vehicleId)
  )
    advanceMission(state);
  else if (
    stage.type === 'combat' &&
    !state.hostiles.some((hostile) => hostile.encounter === definition.id && hostile.health > 0)
  )
    advanceMission(state);
  else if (stage.type === 'escape') {
    if (state.mission.target) Object.assign(state.mission.target, state.wanted.lastSeen);
    if (!state.wanted.level) advanceMission(state);
  }
}

function validExitPoint(state, vehicle) {
  for (const offset of [Math.PI / 2, -Math.PI / 2, Math.PI, 0]) {
    const angle = vehicle.angle + offset;
    const point = {
      x: vehicle.x + Math.cos(angle) * 25,
      y: vehicle.y + Math.sin(angle) * 25,
      z: vehicle.z || 0,
      groundZ: vehicle.groundZ || 0,
    };
    if (
      !isBlocked(point.x, point.y, 7, point.z, state) &&
      !twoSeatsBodies.isBodyBlocked(state, point.x, point.y, 7, point.z, currentSceneId(state)) &&
      Math.abs(geometryFor(state).surfaceHeight(point.x, point.y, point.groundZ) - point.groundZ) <
        6 &&
      !sceneVehicles(state).some((other) => other.id !== vehicle.id && distance(point, other) < 17)
    )
      return point;
  }
  return null;
}
function interactionCandidates(state) {
  const candidates = [];
  const player = state.player;
  if (state.mission && state.mission.stageType === 'interact') {
    const stage = MISSIONS.find((mission) => mission.id === state.mission.id).stages[
      state.mission.stage
    ];
    candidates.push({
      ...state.mission.target,
      id: `mission-${state.mission.id}`,
      type: 'objective',
      prompt: stage.objective,
      available:
        vehicleRequirementMet(state, stage.requiredVehicle) && (!stage.onFoot || !player.vehicleId),
      radius: stage.target.radius + 8,
    });
  }
  if (
    !state.mission &&
    !(
      state.campaignMode === 'story' &&
      (state.campaign?.active || !state.campaign?.completed?.['LL-ST-001'])
    )
  ) {
    for (const mission of MISSIONS) {
      if (
        state.progress.completed.includes(mission.id) ||
        (mission.prerequisite && !state.progress.completed.includes(mission.prerequisite))
      )
        continue;
      const position = mission.stages[0].target;
      candidates.push({
        ...position,
        id: mission.id,
        missionId: mission.id,
        name: `${mission.contact} · ${mission.title}`,
        type: 'mission',
        prompt: `Begin ${mission.title}`,
        available: state.wanted.level === 0,
        radius: 38,
      });
    }
  }
  if (!player.vehicleId) {
    for (const pickup of state.pickups || [])
      if (pickup.available)
        candidates.push({
          ...pickup,
          type: 'pickup',
          name: WEAPONS[pickup.weapon]?.name || pickup.name,
          prompt: `Pick up ${pickup.type === 'object' ? pickup.name : WEAPONS[pickup.weapon]?.name || pickup.name}`,
          radius: 27,
          available: true,
        });
    for (const vehicle of state.vehicles) {
      if (vehicle.health <= 0 || (vehicle.kind === 'traffic' && vehicle.speed > 24)) continue;
      candidates.push({
        id: vehicle.id,
        type: 'vehicle',
        x: vehicle.x,
        y: vehicle.y,
        z: vehicle.z || 0,
        name: VEHICLE_SPECS[vehicle.spec].name,
        prompt: `Enter ${VEHICLE_SPECS[vehicle.spec].name}`,
        radius: 31,
        available: true,
      });
    }
  }
  for (const portal of nearbyInteriorPortals(state, WORLD))
    candidates.push({
      ...portal,
      type: 'interior-portal',
      prompt: `Enter ${portal.name}`,
      available: true,
      radius: portal.entryRadius,
    });
  const rail = railInteraction(state, WORLD);
  if (rail) candidates.push({ ...rail, radius: 32 });
  for (const location of WORLD.locations)
    candidates.push({ ...location, prompt: location.description, available: true, radius: 34 });
  return candidates
    .map((item) => ({ ...item, distance: distance(player, item) }))
    .filter((item) => item.distance < item.radius && Math.abs((item.z || 0) - (player.z || 0)) < 16)
    .sort((a, b) => {
      const priority = {
        objective: 0,
        mission: 1,
        'interior-portal': 1.2,
        'rail-board': 1.4,
        pickup: 1.5,
        vehicle: 2,
      };
      const currentStage = state.mission
        ? MISSIONS.find((mission) => mission.id === state.mission.id)?.stages[state.mission.stage]
        : null;
      const requiredVehicle = currentStage?.requiredVehicle || currentStage?.vehicle;
      const rank = (item) => {
        if (item.type === 'objective' && !item.available) return 2.5;
        if (
          item.type === 'interior-portal' &&
          item.roomId === WORLD.campaignSceneBindings.dispatch.roomId &&
          !state.campaign?.active &&
          pendingDispatchMission(state)
        )
          return 0.9;
        if (item.type === 'vehicle' && requiredVehicle) {
          const vehicle = state.vehicles.find((vehicle) => vehicle.id === item.id);
          if (vehicle && (vehicle.id === requiredVehicle || vehicle.spec === requiredVehicle))
            return 1.05;
        }
        if (!(item.type in priority) && item.distance <= 16) return 1.4;
        return priority[item.type] ?? 3;
      };
      return rank(a) - rank(b) || a.distance - b.distance;
    });
}
export function nearestInteractable(state) {
  if (state.player.health <= 0) return null;
  const story = storyView(state);
  if (story?.dialogue || story?.ambient)
    return {
      id: 'story-dialogue',
      type: 'story-dialogue',
      available: true,
      distance: 0,
      prompt: story.autoDialogue ? 'Conversation · E to continue' : 'Continue conversation',
    };
  if (story?.cinematic)
    return {
      id: 'story-scene',
      type: 'story-scene',
      available: true,
      distance: 0,
      prompt: 'Skip scene staging',
    };
  if (story?.shelterAction)
    return {
      id: 'story-action',
      type: 'story-action',
      available: false,
      distance: 0,
      prompt:
        story.shelterAction.kind === 'rest' ? 'Resting for six hours…' : 'Having a warm meal…',
    };
  if (story?.recognitionReady)
    return {
      id: 'story-recognize',
      type: 'story-recognize',
      available: true,
      distance: 0,
      prompt: 'Identify the grey jacket and clipboard',
    };
  const pendingAssignment = pendingDispatchMission(state);
  if (pendingAssignment && !interruptedStory(state) && currentSceneId(state) === 'voss-dispatch') {
    const felix = Companions.getActor(state, 'LL-CHAR-002');
    if (
      felix?.health > 0 &&
      actorSceneId(felix) === 'voss-dispatch' &&
      distance(state.player, felix) <= 35
    )
      return {
        id: pendingAssignment,
        type: 'story-mission',
        available:
          pendingAssignment === 'LL-ST-002' ||
          campaignAdapters(state).supportsMission(
            pendingAssignment,
            CAMPAIGN_CONTENT.missions.find((m) => m.id === pendingAssignment),
          ),
        distance: distance(state.player, felix),
        prompt: `Talk to Felix · ${CAMPAIGN_CONTENT.missions.find((m) => m.id === pendingAssignment).title}`,
      };
  }
  if (railPassenger(state)) return railInteraction(state, WORLD);
  if (state.dialogue)
    return {
      id: 'dialogue',
      type: 'dialogue',
      name: state.dialogue.speaker,
      x: state.player.x,
      y: state.player.y,
      distance: 0,
      prompt: 'Continue conversation',
      available: true,
    };
  if (currentSceneId(state)) {
    const item = nearestInteriorInteractable(state);
    if (item)
      return {
        ...item,
        name: item.prompt || item.id,
        prompt: item.prompt || `Use ${item.id}`,
        available: true,
        distance: item.distance || 0,
      };
    const car = sceneVehicles(state).find(
      (car) => car.health > 0 && distance(car, state.player) < 31,
    );
    if (state.player.vehicleId)
      return {
        id: state.player.vehicleId,
        type: 'exit',
        name: 'Leave vehicle',
        prompt: 'Leave vehicle',
        available: true,
        distance: 0,
      };
    if (car)
      return {
        id: car.id,
        type: 'vehicle',
        name: VEHICLE_SPECS[car.spec].name,
        prompt: `Enter ${VEHICLE_SPECS[car.spec].name}`,
        available: true,
        distance: distance(car, state.player),
      };
    return null;
  }
  if (state.player.vehicleId) {
    const objective = interactionCandidates(state).find(
      (item) => item.type === 'objective' && item.available,
    );
    if (objective) return objective;
    const service = interactionCandidates(state).find(
      (item) =>
        ['garage', 'taxi'].includes(item.type) ||
        (item.type === 'interior-portal' && item.vehicleAllowed),
    );
    if (service) return service;
    return {
      id: state.player.vehicleId,
      type: 'exit',
      name: 'Exit vehicle',
      x: state.player.x,
      y: state.player.y,
      distance: 0,
      prompt: 'Exit vehicle',
      available: true,
    };
  }
  return interactionCandidates(state)[0] || null;
}
function pay(state, amount) {
  if (state.player.money < amount) {
    notify(state, `You need $${amount}.`, 'info');
    return false;
  }
  state.player.money -= amount;
  return true;
}
const WORKSHOP = ['club', 'knife', 'street-object'];
const WORKSHOP_PRICES = { club: 55, knife: 60, 'street-object': 12 };
export function getEquipmentStore(state) {
  if (state.player.vehicleId || state.player.health <= 0) return null;
  if (currentSceneId(state)) {
    const item = nearestInteriorInteractable(state);
    return currentSceneId(state) === 'saira-garage' &&
      item?.service === 'garage-parts' &&
      interiorActors(state).some((actor) => actor.health > 0)
      ? {
          id: 'workshop',
          name: 'Saira’s Tools',
          weaponIds: WORKSHOP,
          ammoIds: [],
          repeatPurchase: ['street-object'],
        }
      : null;
  }
  const shop = WORLD.locations.find(
    (location) => location.type === 'weapons' && distance(location, state.player) < 42,
  );
  return shop
    ? {
        id: 'weapons',
        name: shop.name,
        weaponIds: SHOP_WEAPONS,
        ammoIds: SHOP_WEAPONS.filter((id) => WEAPONS[id].mode !== 'melee'),
        repeatPurchase: [],
      }
    : null;
}
export function equipmentPrice(state, id) {
  return getEquipmentStore(state)?.id === 'workshop'
    ? (WORKSHOP_PRICES[id] ?? WEAPONS[id]?.cost ?? 0)
    : (WEAPONS[id]?.cost ?? 0);
}
export function buyWeapon(state, id) {
  const weapon = WEAPONS[id];
  const store = getEquipmentStore(state);
  if (!weapon || !store?.weaponIds.includes(id)) return false;
  if (store.repeatPurchase.includes(id)) {
    if (!pay(state, equipmentPrice(state, id))) return false;
    acquireWeapon(state, id, 1, { material: 'metal', name: 'Workshop tool' });
    notify(state, 'Workshop tool purchased.', 'success');
    return true;
  }
  if (state.player.ownedWeapons.includes(id)) {
    equipOwnedWeapon(state, id);
    notify(state, `${weapon.name} equipped from your stored loadout.`, 'success');
    return true;
  }
  if (!pay(state, equipmentPrice(state, id))) return false;
  acquireWeapon(state, id, weapon.mode === 'melee' ? 0 : (weapon.supply ?? weapon.clipSize * 5));
  notify(state, `${weapon.name} purchased.`, 'success');
  return true;
}
export function buyAmmo(state, id = state.player.weapon) {
  const weapon = WEAPONS[id],
    ammo = state.player.ammo[id];
  if (
    !weapon ||
    !getEquipmentStore(state)?.ammoIds.includes(id) ||
    weapon.mode === 'melee' ||
    !state.player.ownedWeapons.includes(id) ||
    !ammo
  )
    return false;
  if ((weapon.mode === 'throwable' && ammo.clip >= weapon.clipSize) || ammo.reserve >= 100000)
    return false;
  if (!pay(state, weapon.ammoCost)) return false;
  if (weapon.mode === 'throwable')
    ammo.clip = Math.min(weapon.clipSize, ammo.clip + (weapon.supply || 3));
  else
    ammo.reserve = Math.min(
      100000,
      ammo.reserve + (weapon.mode === 'rocket' ? 1 : weapon.clipSize * 3),
    );
  notify(state, `${weapon.name} ammunition restocked.`, 'success');
  return true;
}
export function pickupWeapon(state, id) {
  const pickup = state.pickups.find((item) => item.id === id && item.available);
  if (
    !pickup ||
    !inScene(pickup, currentSceneId(state)) ||
    state.player.vehicleId ||
    state.player.health <= 0 ||
    distance(state.player, pickup) >= 28 ||
    !hasLineOfSight(state.player, pickup, state)
  )
    return false;
  if (
    !acquireWeapon(
      state,
      pickup.weapon,
      pickup.ammo ?? WEAPONS[pickup.weapon].clipSize,
      pickup.type === 'object'
        ? { name: pickup.name, material: pickup.material, pickupId: pickup.id }
        : null,
    )
  )
    return false;
  pickup.available = false;
  pickup.remaining = pickup.respawnSeconds || 0;
  notify(
    state,
    `Collected ${pickup.type === 'object' ? pickup.name : WEAPONS[pickup.weapon].name}.`,
    'success',
  );
  return true;
}
function startTaxiJob(state) {
  if (state.mission) {
    notify(state, 'Finish your assignment before taking a fare.');
    return false;
  }
  if (currentVehicle(state)?.spec !== 'taxi') {
    notify(state, 'Bring a taxi to the rank.');
    return false;
  }
  if (state.taxiJob) {
    notify(state, 'A passenger is already waiting.');
    return false;
  }
  const routes = [
    {
      pickup: target(1080, 440, 'Night nurse'),
      dropoff: target(180, 960, 'Southbank Clinic'),
      fare: 140,
    },
    {
      pickup: target(1620, 700, 'Dock worker'),
      dropoff: target(480, 180, 'Old Quay home'),
      fare: 180,
    },
    {
      pickup: target(780, 1220, 'Late student'),
      dropoff: target(1080, 180, 'Civic Market'),
      fare: 160,
    },
    {
      pickup: target(180, 440, 'Ferry visitor'),
      dropoff: target(1380, 960, 'East Port lodging'),
      fare: 170,
    },
  ];
  const route = routes[state.progress.fares % routes.length];
  state.taxiJob = {
    ...clone(route),
    stage: 'pickup',
    target: clone(route.pickup),
    elapsed: 0,
    timeLimit: 210,
  };
  notify(state, `Taxi dispatch · Pick up the ${route.pickup.name.toLowerCase()}.`, 'mission');
  return true;
}
function updateTaxiJob(state, dt) {
  const job = state.taxiJob;
  if (!job) return;
  job.elapsed += dt;
  if (job.elapsed > job.timeLimit || state.wanted.level >= 3) {
    notify(state, 'Fare canceled. The passenger found another ride.', 'danger');
    state.taxiJob = null;
    return;
  }
  const vehicle = currentVehicle(state);
  if (
    vehicle?.spec !== 'taxi' ||
    distance(vehicle, job.target) > 32 ||
    Math.abs(vehicle.speed) > 20
  )
    return;
  if (job.stage === 'pickup') {
    job.stage = 'dropoff';
    job.target = clone(job.dropoff);
    say(state, [['Passenger', `Thanks for stopping. ${job.dropoff.name}, please.`]]);
    notify(state, `Passenger aboard · Drive to ${job.dropoff.name}.`, 'mission');
  } else {
    const tip = Math.max(0, Math.round((job.timeLimit - job.elapsed) * 0.25));
    state.player.money += job.fare + tip;
    state.progress.cashEarned += job.fare + tip;
    state.progress.fares += 1;
    notify(state, `Fare complete · $${job.fare} + $${tip} tip`, 'success');
    state.taxiJob = null;
  }
}

export function interact(state) {
  const candidate = nearestInteractable(state);
  if (!candidate) return null;
  if (candidate.type === 'story-dialogue')
    return { type: 'story-dialogue', ...acknowledgeStory(state) };
  if (candidate.type === 'story-mission')
    return { type: 'story-mission', ...startStoryMission(state, candidate.id) };
  if (candidate.type === 'story-recognize') {
    const result = {
      type: 'story-recognize',
      ...recognizeStoryActor(
        state,
        'LL-ARC-REEVE',
        'identify:' + state.time + ':' + state.campaign.sequence,
      ),
    };
    if (!result.ok)
      notify(state, 'Keep the grey jacket and clipboard in view before identifying him.');
    return result;
  }
  if (candidate.type === 'story-scene')
    return { type: 'story-scene', ok: skipStoryCinematic(state) };
  if (candidate.type === 'story-action') return null;
  if (candidate.type === 'dialogue') {
    state.dialogue.index += 1;
    const line = state.dialogue.lines[state.dialogue.index];
    if (!line) state.dialogue = null;
    else {
      [state.dialogue.speaker, state.dialogue.text] = line;
      state.dialogue.expires = state.time + 14;
    }
    return candidate;
  }
  if (currentSceneId(state) && !['dialogue', 'vehicle', 'exit'].includes(candidate.type)) {
    const result = interactInterior(state, interiorContext(state));
    if (result.ok) return result.result || result;
    // A hook that returns false has already told the player why it refused.
    if (result.result !== false)
      notify(state, result.reason || result.result?.reason || 'That service is unavailable.');
    return null;
  }
  if (['rail-board', 'rail-alight'].includes(candidate.type))
    return interactRail(state, WORLD, candidate, railOptions(state));
  if (candidate.type === 'interior-portal') {
    if (
      candidate.id === 'dockside-rooms-entry' &&
      !state.storyInventory?.keys.includes('dockside-tenancy') &&
      state.campaign?.active?.missionId !== 'LL-ST-001'
    ) {
      notify(state, 'Nadia has not offered you this room yet.');
      return null;
    }
    const car = currentVehicle(state);
    if (
      car &&
      (car.companionSeats?.some((seat) => seat.status === 'reserved') ||
        state.companions?.actors.some(
          (actor) => actor.vehicleId === car.id && actor.companionPhase === 'exiting',
        ))
    ) {
      notify(state, 'Wait for passengers to finish entering or leaving.');
      return null;
    }
    const result = enterInterior(state, candidate.id, interiorContext(state));
    if (!result.ok) notify(state, result.reason);
    return result;
  }
  if (!candidate.available) {
    notify(state, 'Finish the objective on foot or bring the requested vehicle.');
    return candidate;
  }
  if (candidate.type === 'objective') {
    advanceMission(state);
    return candidate;
  }
  if (candidate.type === 'mission') {
    startMission(state, candidate.missionId);
    return candidate;
  }
  if (candidate.type === 'pickup') {
    pickupWeapon(state, candidate.id);
    return candidate;
  }
  if (candidate.type === 'activity') {
    if (state.mission || state.taxiJob || state.wanted.level) {
      notify(state, 'Finish the assignment and lose police attention before taking a break.');
      return null;
    }
    return candidate;
  }
  if (candidate.type === 'vehicle') {
    if (
      state.player.traversal ||
      Math.abs(state.player.z - (state.player.groundZ || 0)) > 2 ||
      state.player.dodgeRemaining > 0
    ) {
      notify(state, 'Land and finish moving before entering the vehicle.');
      return null;
    }
    const vehicle = state.vehicles.find((item) => item.id === candidate.id);
    const admission = Companions.playerDriverAdmission(state, vehicle.id);
    if (!admission.allowed) {
      releaseNPCVehicleInput(state, vehicle.id, 'player-admission');
      if (admission.canPreempt) {
        const cancelled = Companions.preemptDriverReservation(
          state,
          vehicle.id,
          companionContext(state),
        );
        if (!cancelled.ok) return null;
      } else {
        if (admission.lease?.alive)
          Companions.requestExit(state, admission.lease.actorId, companionContext(state));
        notify(
          state,
          admission.lease?.alive
            ? 'Wait for the driver to step out before entering.'
            : 'The driver seat is still physically occupied.',
        );
        return { ...candidate, ok: false, waiting: 'named-driver-egress' };
      }
    }
    if (vehicle.policeControlled) {
      if (Math.abs(vehicle.speed) > 20) {
        notify(state, 'The cruiser is moving too fast to take.');
        return null;
      }
      relinquishPoliceVehicle(state, vehicle, policeContext(state));
      reportCrime(state, { type: 'vehicle-theft', severity: 2 });
    }
    vehicle.occupied = true;
    const isOwned =
      vehicle.id === 'starter-taxi' ||
      vehicle.id === 'medicine-van' ||
      vehicle.owned === true ||
      vehicle.playerOwned === true ||
      (Array.isArray(vehicle.authorizedDrivers) && vehicle.authorizedDrivers.includes('mara-voss'));
    if (!isOwned && !vehicle.stolen) {
      vehicle.stolen = true;
      reportCrime(state, { type: 'vehicle-theft', severity: vehicle.spec === 'police' ? 2 : 1 });
      notify(state, `Borrowed ${VEHICLE_SPECS[vehicle.spec].name}.`, 'info');
    }
    vehicle.kind = 'parked';
    state.player.cover = null;
    state.player.crouching = false;
    state.player.defending = false;
    state.player.meleeAction = null;
    state.player.vehicleId = vehicle.id;
    state.player.x = vehicle.x;
    state.player.y = vehicle.y;
    state.player.angle = vehicle.angle;
    state.player.z = vehicle.z || 0;
    state.player.groundZ = vehicle.groundZ || 0;
    return candidate;
  }
  if (candidate.type === 'exit') {
    const vehicle = currentVehicle(state);
    if (Math.abs(vehicle.speed) > 42) {
      notify(state, 'Slow down before stepping out.');
      return candidate;
    }
    const point = validExitPoint(state, vehicle);
    if (!point) {
      notify(state, 'The doors are blocked. Move the vehicle.');
      return candidate;
    }
    vehicle.occupied = false;
    vehicle.speed = 0;
    state.player.vehicleId = null;
    Object.assign(state.player, point, { speed: 0 });
    return candidate;
  }
  if (candidate.type === 'garage') {
    const vehicle = currentVehicle(state);
    if (!vehicle) notify(state, 'Bring a vehicle to Saira’s garage.');
    else if (pay(state, candidate.cost)) {
      vehicle.health = vehicle.maxHealth || VEHICLE_SPECS[vehicle.spec].health;
      notify(state, 'Repairs complete. Drive carefully.', 'success');
    }
  } else if (candidate.type === 'home') {
    if (state.wanted.level) notify(state, 'Lose the police before returning home.');
    else {
      state.saveRequested = true;
      state.player.health = Math.min(100, state.player.health + 25);
      state.checkpoint = { x: candidate.x, y: candidate.y };
      notify(state, `Rested at ${candidate.name}.`, 'success');
      return { ...candidate, type: 'save' };
    }
  } else if (candidate.type === 'clinic' || candidate.type === 'food') {
    if (pay(state, candidate.cost)) {
      state.player.health = Math.min(
        100,
        state.player.health + (candidate.type === 'clinic' ? 100 : 35),
      );
      notify(
        state,
        candidate.type === 'clinic' ? 'Treatment complete.' : 'A warm meal. Health restored.',
        'success',
      );
    }
  } else if (candidate.type === 'armour') {
    if (pay(state, candidate.cost)) {
      state.player.armour = 100;
      for (const weapon of state.player.weapons)
        if (['ballistic', 'rocket'].includes(WEAPONS[weapon].mode))
          state.player.ammo[weapon].reserve = Math.min(
            100000,
            state.player.ammo[weapon].reserve + WEAPONS[weapon].clipSize * 2,
          );
      notify(state, 'Body armour equipped. Ammunition restocked.', 'success');
    }
  } else if (candidate.type === 'weapons') {
    const nextWeapon = SHOP_WEAPONS.find((id) => !state.player.ownedWeapons.includes(id));
    if (nextWeapon) buyWeapon(state, nextWeapon);
    else buyAmmo(state);
  } else if (candidate.type === 'taxi') startTaxiJob(state);
  else if (candidate.type === 'radio') {
    state.radio.station = (state.radio.station + 1) % state.radio.stations.length;
    notify(state, state.radio.stations[state.radio.station]);
  } else notify(state, candidate.description || candidate.name);
  return candidate;
}

function railOptions(state) {
  return {
    terrain: TERRAIN,
    notify: (text) => notify(state, text),
    damagePlayer: (amount) => damagePlayer(state, amount),
    damageVehicle: (car, amount) => damageVehicle(state, car, amount),
  };
}
export function selectMetroStop(state, stationId, platformId) {
  return chooseRailStop(state, WORLD, stationId, platformId);
}

function interiorContext(state) {
  return {
    world: WORLD,
    terrain: TERRAIN,
    canEnter: (portal) => {
      if (!twoSeatsBodies.enabled(state)) return true;
      const room = INTERIOR_LAYOUTS[portal.roomId],
        car = currentVehicle(state),
        spawn = car ? room.vehicleSpawn : room.spawn;
      return (
        !!spawn &&
        twoSeatsBodies.native.inspect(
          state,
          {
            ...spawn,
            z: room.floorZ,
            radius: car ? 12 : 7,
            height: car ? 16 : 30,
          },
          { sceneId: room.id },
        ).clear
      );
    },
    isExteriorBlocked: (x, y, radius, z) =>
      TERRAIN.isBlocked(x, y, radius, z) ||
      (twoSeatsBodies.enabled(state) &&
        !twoSeatsBodies.native.inspect(
          state,
          {
            x,
            y,
            z,
            radius,
            height: currentVehicle(state) ? 16 : 30,
          },
          { sceneId: null },
        ).clear),
    returnOnIncapacitation: false,
    notify: (text) => notify(state, text),
    onEnter: () => {
      state.dialogue = null;
      state.lastInput = {};
    },
    onExit: () => {
      state.dialogue = null;
      state.lastInput = {};
    },
    onHook: (action) => {
      if (action.roomId === 'dockside-rooms') {
        if (!state.campaign && !state.storyInventory?.keys.includes('dockside-tenancy'))
          return { ok: false, reason: 'Nadia has not offered you this room yet.' };
        if (action.service === 'shelter-key') {
          if (!state.storyInventory?.keys.includes('dockside-tenancy')) {
            notify(state, 'Nadia has not handed you the spare key yet.');
            return { ok: true, type: 'inspection' };
          }
          notify(state, 'Your spare key opens Dockside Rooms.');
          return { ok: true, type: 'journal' };
        }
        if (action.service === 'shelter-save')
          return {
            ok: true,
            type:
              state.campaignRuntime?.active?.phase === 'running' &&
              state.campaignRuntime.active.stageId === 'rest'
                ? 'story-save'
                : 'save',
          };
        const kind = {
          'shelter-food': 'food',
          'shelter-rest': 'rest',
          wardrobe: 'wardrobe',
          evidence: 'evidence',
        }[action.service];
        if (!kind) return { ok: false, reason: 'There is nothing to use here.' };
        const result =
          state.campaignRuntime?.active?.phase === 'running'
            ? performCampaignService(state, kind, campaignContext(state))
            : useShelterService(
                state,
                kind,
                { id: nextId(state, `shelter-${kind}`) },
                { canRest: (s) => !s.wanted.level && !s.mission && !s.campaign?.active },
              );
        if (result.ok && kind === 'wardrobe') return { ...result, type: 'wardrobe' };
        if (result.ok && kind === 'evidence') {
          notify(state, 'The unpaid-contract ledger is recorded in your journal.');
          return { ...result, type: 'journal' };
        }
        return result;
      }
      if (action.type === 'activity') {
        if (state.mission || state.taxiJob || state.wanted.level) {
          notify(state, 'Finish the assignment and lose police attention before taking a break.');
          return false;
        }
        return { type: 'activity', activity: action.activity };
      }
      if (action.type === 'job') return { type: 'journal' };
      if (action.service === 'garage-parts') return { type: 'workshop' };
      if (action.service === 'rest-save') {
        if (state.wanted.level) {
          notify(state, 'Lose police attention before resting.');
          return false;
        }
        state.player.health = Math.min(100, state.player.health + 25);
        state.saveRequested = true;
        state.checkpoint = { x: action.exterior.x, y: action.exterior.y };
        notify(state, 'Rested at the cooperative. Progress can be saved.', 'success');
        return { type: 'save' };
      }
      if (!interiorActors(state).some((actor) => actor.health > 0)) {
        notify(state, 'The attendant is unavailable.');
        return false;
      }
      if (action.service === 'vehicle-repair') {
        const vehicle = state.vehicles.find((car) => car.id === state.interior.active.vehicleId);
        if (!vehicle || vehicle.health <= 0) {
          notify(state, 'Bring a working vehicle into the service bay.');
          return false;
        }
        const cost = WORLD.locations.find((location) => location.id === 'saira-shop').cost;
        if (!pay(state, cost)) return false;
        vehicle.health = vehicle.maxHealth || VEHICLE_SPECS[vehicle.spec].health;
        notify(state, 'Repairs complete. Drive carefully.', 'success');
        return { type: 'repair', cost };
      }
      if (action.service === 'bar-drink' || action.service === 'venue-food') {
        const cost = action.service === 'bar-drink' ? 12 : 18;
        if (!pay(state, cost)) return false;
        state.player.health = Math.min(
          100,
          state.player.health + (action.service === 'bar-drink' ? 5 : 35),
        );
        if (action.service === 'bar-drink')
          state.player.intoxication = Math.min(1, (state.player.intoxication || 0) + 0.25);
        notify(
          state,
          action.service === 'bar-drink' ? 'Drink served.' : 'A warm meal. Health restored.',
          'success',
        );
        return { type: 'refreshment', cost };
      }
      return { ok: false };
    },
  };
}
function updateRoomPeople(state, dt) {
  const room = interiorScene(state)?.room;
  if (!room) return;
  for (const actor of interiorActors(state)) {
    if (actor.health <= 0) {
      actor.speed = 0;
      continue;
    }
    actor.panic = Math.max(0, (actor.panic || 0) - dt);
    if (actor.panic > 0 && !(actor.staggerRemaining > 0)) {
      actor.angle = angleTo(state.player, actor);
      actor.speed = 35;
      moveBody(actor, Math.cos(actor.angle) * 35 * dt, Math.sin(actor.angle) * 35 * dt, 6, {
        state,
      });
      actor.x = clamp(actor.x, 8, room.width - 8);
      actor.y = clamp(actor.y, 8, room.height - 8);
    } else actor.speed = 0;
  }
}
function updateAllOrdnance(state, dt) {
  const ids = new Set([
    currentSceneId(state),
    null,
    ...Object.keys(state.interior?.rooms || {}),
    ...state.ordnance.map(actorSceneId),
    ...state.fires.map(actorSceneId),
    ...state.pickups.map(actorSceneId),
    ...state.combatEffects.map(actorSceneId),
  ]);
  for (const sceneId of ids) updateOrdnance(state, dt, combatContext(state, sceneId));
}

export function updateSimulation(state, dt, input = {}) {
  if (!Number.isFinite(dt) || dt <= 0) return state;
  const frameScene = currentSceneId(state),
    originalInput = input;
  const elapsed = Math.min(dt, 0.5);
  const steps = Math.max(1, Math.ceil(elapsed / (1 / 60)));
  const step = elapsed / steps;
  if (input.confirm && !state.lastInput.confirm) interact(state);
  if (state.cinematics?.active || state.shelterServices?.active) input = {};
  if (currentSceneId(state) !== frameScene) input = {};
  if (input.reload && !state.lastInput.reload) reloadWeapon(state);
  if (input.weapon && input.weapon !== state.player.weapon) selectWeapon(state, input.weapon);
  if (input.cover && !state.lastInput.cover) toggleCover(state);
  if (input.jump && !state.lastInput.jump) jumpOrVault(state);
  if (input.vault && !state.lastInput.vault) jumpOrVault(state, { vaultOnly: true });
  const context = combatContext(state);
  combatDefenseInput(state, input, context);
  for (let i = 0; i < steps; i += 1) {
    // A portal may change scenes inside a multi-step frame. Discard the old
    // scene's held commands immediately, before another step can move/fire.
    if (currentSceneId(state) !== frameScene) input = {};
    if (state.cinematics?.active || state.shelterServices?.active) input = {};
    state.time += step;
    updateRail(state, WORLD, step, railOptions(state));
    state.clock = clockHour(state);
    state.player.intoxication = Math.max(0, (state.player.intoxication || 0) - step * 0.0007);
    state.player.fireCooldown = Math.max(0, state.player.fireCooldown - step);
    state.player.recoil = Math.max(0, state.player.recoil - step * 0.2);
    if (state.player.reloadRemaining > 0) {
      state.player.reloadRemaining = Math.max(0, state.player.reloadRemaining - step);
      if (state.player.reloadRemaining === 0) finishReload(state);
    }
    if (state.respawnTimer > 0) {
      state.respawnTimer -= step;
      updateNPCVehicles(state, step);
      Companions.updateCompanions(state, step, companionContext(state));
      updateAllOrdnance(state, step);
      syncCarriedCampaignProps(state);
      if (state.respawnTimer <= 0) respawn(state);
      tickStory(state, step);
      continue;
    }
    const vehicle = currentVehicle(state);
    if (railPassenger(state)) {
      state.player.cover = null;
      state.player.vz = 0;
      state.player.crouching = false;
    } else if (vehicle) {
      drive(state, vehicle, step, input);
      state.player.cover = null;
      state.player.z = vehicle.z || 0;
      state.player.groundZ = vehicle.groundZ || 0;
      state.player.swimming = false;
      state.player.vz = 0;
      state.player.crouching = false;
      if (Number.isFinite(input.aimAngle) && WEAPONS[state.player.weapon].vehicleAllowed)
        state.player.angle = normalizeAngle(input.aimAngle);
    } else walk(state, step, input);
    if (input.fire) fireWeapon(state, input);
    if (currentSceneId(state)) {
      tickInterior(state, step, interiorContext(state));
      if (currentSceneId(state)) {
        updateRoomPeople(state, step);
        updateHostiles(state, step, currentSceneId(state));
      }
      withExteriorContext(state, () => {
        updateTraffic(state, step);
        updatePedestrians(state, step);
        updateHostiles(state, step, null);
        updatePolice(state, step, input);
      });
    } else {
      updateTraffic(state, step);
      updatePedestrians(state, step);
      updateHostiles(state, step);
      updatePolice(state, step, input);
    }
    updateRailImpacts(state, step, railOptions(state));
    updateNPCVehicles(state, step);
    NamedHostility.updateNamedHostility(state, step, namedHostilityContext(state));
    Companions.updateCompanions(state, step, companionContext(state));
    updateBullets(state, step);
    for (const sceneId of new Set([null, ...Object.keys(state.interior?.rooms || {})]))
      updateMelee(state, step, combatContext(state, sceneId));
    updateAllOrdnance(state, step);
    syncCarriedCampaignProps(state);
    tickStory(state, step);
    if (state.player.health > 0 && !currentSceneId(state)) {
      updateMission(state, step);
      updateTaxiJob(state, step);
    }
    if (state.dialogue && state.time > state.dialogue.expires) state.dialogue = null;
    state.notifications = state.notifications.filter((notice) => notice.expires > state.time);
  }
  withExteriorContext(state, () => updateAmbient(state, WORLD, elapsed, ambientContext(state)));
  if (!currentSceneId(state)) {
    const district = WORLD.districts.find(
      (item) =>
        state.player.x >= item.x &&
        state.player.x < item.x + item.w &&
        state.player.y >= item.y &&
        state.player.y < item.y + item.h,
    );
    const area = TERRAIN.neighbourhoodAt(state.player.x, state.player.y);
    if (area?.districtId) state.district = area.districtId;
    else if (district) state.district = district.id;
    state.neighbourhood = area?.id || null;
    const infrastructure = TERRAIN.infrastructureAt(
      state.player.x,
      state.player.y,
      state.player.groundZ || 0,
    );
    const place = infrastructure
      ? [...WORLD.bridges, ...WORLD.tunnels].find((item) => item.id === infrastructure.catalogueId)
      : null;
    state.place = place
      ? { id: place.id, name: place.name, type: infrastructure.tunnel ? 'tunnel' : 'bridge' }
      : null;
  } else {
    const room = interiorScene(state).room;
    state.place = { id: room.id, name: room.name, type: 'interior' };
  }
  state.lastInput = Object.fromEntries(
    [
      'confirm',
      'reload',
      'cover',
      'jump',
      'vault',
      'block',
      'dodge',
      'counter',
      'disarm',
      'fire',
    ].map((key) => [key, Boolean(originalInput[key])]),
  );
  return state;
}

export function saveGame(state) {
  const saved = clone(state);
  saved.lastInput = {};
  saved.saveRequested = false;
  return JSON.stringify({ format: 'lowlight-save', version: SAVE_VERSION, state: saved });
}

function finiteNumber(value, low, high) {
  return typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
}
function validPoint(value) {
  return value && finiteNumber(value.x, 0, WORLD.width) && finiteNumber(value.y, 0, WORLD.height);
}
function validateSceneLedger(state) {
  const current = currentSceneId(state);
  if ((state.player.sceneId ?? null) !== current)
    throw new Error('The saved player scene is invalid.');
  const clipboard = state.campaignRuntime?.sceneProps?.[LATE_METER_CLIPBOARD.id];
  if (clipboard && clipboard.state !== 'carried') {
    const room = clipboard.sceneId && INTERIOR_LAYOUTS[clipboard.sceneId];
    if (
      !(room
        ? finiteNumber(clipboard.x, -40, room.width + 40) &&
          finiteNumber(clipboard.y, -40, room.height + 40) &&
          finiteNumber(clipboard.z, room.floorZ, room.ceilingZ ?? 72)
        : validPoint(clipboard) && finiteNumber(clipboard.z, ELEVATION.min, ELEVATION.max))
    )
      throw Error('The saved clipboard is outside its physical scene.');
  }
  const entities = [
    ...state.vehicles,
    ...state.pedestrians,
    ...state.hostiles,
    ...state.police,
    ...state.bullets,
    ...state.ordnance,
    ...state.fires,
    ...state.pickups,
    ...state.combatEffects,
    ...state.companions.actors,
  ];
  for (const item of entities) {
    const id = actorSceneId(item);
    if (id !== null && (!Object.hasOwn(INTERIOR_LAYOUTS, id) || typeof id !== 'string'))
      throw new Error('The saved entity scene is invalid.');
    if (
      item.scene &&
      (!['interior', 'exterior'].includes(item.scene.kind) ||
        (item.scene.kind === 'exterior' && item.scene.id !== 'harbor-city'))
    )
      throw new Error('The saved entity scene identity is invalid.');
    if (id) {
      const room = INTERIOR_LAYOUTS[id];
      if (
        !finiteNumber(item.x, -40, room.width + 40) ||
        !finiteNumber(item.y, -40, room.height + 40)
      )
        throw new Error('The saved local entity coordinates are invalid.');
    }
  }
  for (const report of state.policeDispatch.reports)
    if (report.point?.sceneId && !Object.hasOwn(INTERIOR_LAYOUTS, report.point.sceneId))
      throw new Error('The saved witness scene is invalid.');
}

export function restoreGame(serialized, options = {}) {
  let saved;
  try {
    saved = typeof serialized === 'string' ? JSON.parse(serialized) : clone(serialized);
  } catch {
    throw new Error('This save is not valid JSON.');
  }
  if (!saved || saved.format !== 'lowlight-save' || saved.version !== SAVE_VERSION)
    throw new Error('This save version is not supported.');
  let state = saved.state;
  if (
    !state ||
    !validPoint(state.player) ||
    !finiteNumber(state.player.health, 0, 100) ||
    !finiteNumber(state.player.armour, 0, 100) ||
    !finiteNumber(state.player.money, 0, 1e9) ||
    !finiteNumber(state.time, 0, 1e9) ||
    !Number.isInteger(state.rng) ||
    !Array.isArray(state.vehicles) ||
    !Array.isArray(state.pedestrians) ||
    !Array.isArray(state.hostiles) ||
    !Array.isArray(state.police) ||
    !Array.isArray(state.bullets) ||
    !state.wanted ||
    !state.progress ||
    !Array.isArray(state.progress.completed) ||
    !Array.isArray(state.progress.failed) ||
    !WEAPONS[state.player.weapon] ||
    !Array.isArray(state.player.weapons) ||
    !Number.isInteger(state.sequence) ||
    state.sequence < 0 ||
    !finiteNumber(state.respawnTimer, 0, 3) ||
    !finiteNumber(state.player.angle, -TAU, TAU) ||
    !finiteNumber(state.player.stamina, 0, 100) ||
    (state.player.intoxication !== undefined && !finiteNumber(state.player.intoxication, 0, 1)) ||
    !finiteNumber(state.player.fireCooldown, 0, 5) ||
    !finiteNumber(state.player.reloadRemaining, 0, 5) ||
    !finiteNumber(state.player.speed, -300, 300) ||
    !finiteNumber(state.lastCrimeTime, -1000, 1e9)
  )
    throw new Error('The save is incomplete or corrupted.');
  if (
    state.worldGeometryVersion ||
    [DISPATCH_WORLD_MIGRATION.fromTransit, DISPATCH_WORLD_MIGRATION.toTransit].includes(
      state.transit?.topology,
    )
  )
    state = migrateDispatchSave({ ...saved, state }, { fromWorld: LEGACY_WORLD, toWorld: WORLD })
      .save.state;
  initializeInteriors(state);
  state.scene ??= { kind: 'exterior', id: 'harbor-city' };
  state.player.sceneId ??= currentSceneId(state);
  validateInteriorState(state, { world: WORLD });
  initializeWardrobe(state);
  validateWardrobe(state);
  initializeCalendar(state);
  validateCalendar(state);
  state.clock = clockHour(state);
  state.campaignMode ??= state.campaign ? 'story' : 'legacy';
  if (!['legacy', 'story'].includes(state.campaignMode))
    throw Error('The saved story mode is invalid.');
  state.campaignPresentation ??= {
    version: 1,
    lineKey: null,
    elapsed: 0,
    presented: false,
    visible: false,
  };
  state.campaignPresentation.visible ??= false;
  const presentation = state.campaignPresentation;
  if (
    presentation.version !== 1 ||
    !(presentation.lineKey === null || typeof presentation.lineKey === 'string') ||
    !finiteNumber(presentation.elapsed, 0, 10) ||
    typeof presentation.presented !== 'boolean' ||
    typeof presentation.visible !== 'boolean'
  )
    throw Error('The saved conversation presentation is invalid.');
  Companions.initializeCompanions(state);
  Companions.validateCompanions(state, companionContext(state));
  NamedHostility.validateNamedHostility(state);
  initializeSubtitles(state);
  validateSubtitles(state);
  initializeShelterServices(state);
  validateShelterServices(state);
  initializeCinematics(state);
  if (
    state.campaign ||
    state.campaignMode === 'story' ||
    state.campaignRuntime ||
    state.lateMeterRuntime ||
    state.twoSeatsRuntime ||
    state.twoSeatsEffects ||
    state.clothingServices ||
    state.campaignEffects ||
    state.lateMeterEffects
  ) {
    initializeCampaignParentState(state);
    initializeStoryPhone(state);
    initializeLateMeterParentState(state);
    initializeTwoSeatsParentState(state);
    validateCampaignParentState(state);
    validateCampaignRuntime(state);
    validateLateMeterRuntime(state);
    validateLateMeterParentState(state);
    validateTwoSeatsRuntime(state);
    validateTwoSeatsParentState(state);
    PhoneCalls.validatePhoneCalls(state);
    const appearances = {
      'LL-ARC-REEVE': LATE_METER_APPEARANCES.reeve,
      'LL-ARC-YARA': LATE_METER_APPEARANCES.yara,
      'holt-collector-watch': LATE_METER_APPEARANCES.watcher,
      ...(state.twoSeatsRuntime || state.twoSeatsEffects
        ? {
            'LL-CHAR-025': TWO_SEATS_APPEARANCES.tess,
            'LL-ARC-DAX': TWO_SEATS_APPEARANCES.dax,
            'LL-ARC-PEL': TWO_SEATS_APPEARANCES.pel,
            'LL-ARC-BEA': TWO_SEATS_APPEARANCES.bea,
          }
        : {}),
    };
    for (const actor of state.companions.actors)
      if (
        (actor.appearance || appearances[actor.id]) &&
        JSON.stringify(actor.appearance) !== JSON.stringify(appearances[actor.id])
      )
        throw Error('The saved named appearance is not registered.');
    if (
      state.campaignRuntime.sceneProps['reeve-repossession-clipboard'] &&
      !state.lateMeterEffects.receipts['late-meter:prop:reeve-repossession-clipboard']
    )
      throw Error('The collector prop has no physical registration.');
    validateCinematics(state, campaignContext(state).cinematicContext);
  } else {
    validateCinematics(state, {});
    if (state.phoneCalls) PhoneCalls.validatePhoneCalls(state);
    if (state.companions.actors.some((actor) => actor.appearance))
      throw Error('The saved named appearance has no registered campaign state.');
  }
  const hadSavedTransit = state.transit !== undefined;
  initializeRail(state, WORLD);
  if (!hadSavedTransit) updateRail(state, WORLD, 0, railOptions(state));
  validateRailRuntime(state, WORLD);
  migrateRailSignals(state, WORLD);
  if (!state.railSignals) throw new Error('The saved Metro signal reservations are missing.');
  if (state.combatVersion === undefined) initializeCombat(state, WORLD.pickups || []);
  validateCombatSave(state, SCENES.validationWorld(state));
  if (state.policeVersion === undefined) initializePolicing(state);
  validatePoliceSave(state, WORLD);
  validateSceneLedger(state);
  if (!state.ambient) initializeAmbient(state, WORLD);
  withExteriorContext(state, () => validateAmbient(state, WORLD));
  if (
    state.vehicles.length > 200 ||
    state.pedestrians.length > 500 ||
    state.hostiles.length > 100 ||
    state.police.length > 100 ||
    state.bullets.length > 1000
  )
    throw new Error('The save contains too many entities.');
  if (
    [
      ...state.vehicles,
      ...Object.values(state.ambient.dormant).flatMap((bucket) => bucket.vehicles),
    ].some(
      (vehicle) =>
        !validPoint(vehicle) ||
        !VEHICLE_SPECS[vehicle.spec] ||
        !finiteNumber(vehicle.health, 0, 1000) ||
        !finiteNumber(vehicle.angle, -TAU, TAU) ||
        !finiteNumber(vehicle.speed, -300, 300) ||
        (vehicle.authorizedDrivers !== undefined &&
          (!Array.isArray(vehicle.authorizedDrivers) ||
            vehicle.authorizedDrivers.length > 16 ||
            vehicle.authorizedDrivers.some((id) => typeof id !== 'string' || id.length > 160))) ||
        (vehicle.z !== undefined && !finiteNumber(vehicle.z, ELEVATION.min, ELEVATION.max)) ||
        (vehicle.groundZ !== undefined &&
          !finiteNumber(vehicle.groundZ, ELEVATION.min, ELEVATION.max)),
    )
  )
    throw new Error('The saved vehicles are invalid.');
  if (
    state.vehicles.some(
      (vehicle) =>
        typeof vehicle.id !== 'string' ||
        !['traffic', 'parked'].includes(vehicle.kind) ||
        (vehicle.route &&
          (!Array.isArray(vehicle.route) ||
            vehicle.route.length > 20 ||
            vehicle.route.some((point) => !validPoint(point)) ||
            !Number.isInteger(vehicle.routeIndex) ||
            vehicle.routeIndex < 0 ||
            vehicle.routeIndex >= vehicle.route.length)),
    )
  )
    throw new Error('The saved traffic routes are invalid.');
  if (
    [...state.pedestrians, ...state.hostiles, ...state.police, ...state.companions.actors].some(
      (person) =>
        !validPoint(person) ||
        !finiteNumber(person.health, 0, 1000) ||
        (person.z !== undefined && !finiteNumber(person.z, ELEVATION.min, ELEVATION.max)) ||
        (person.groundZ !== undefined &&
          !finiteNumber(person.groundZ, ELEVATION.min, ELEVATION.max)),
    )
  )
    throw new Error('The saved people are invalid.');
  if (
    state.pedestrians.some(
      (person) =>
        !finiteNumber(person.speed, 0, 100) ||
        !finiteNumber(person.homeX, 0, WORLD.width) ||
        !finiteNumber(person.minY, 0, WORLD.height) ||
        !finiteNumber(person.maxY, 0, WORLD.height) ||
        !finiteNumber(person.panic, 0, 100),
    )
  )
    throw new Error('The saved pedestrians are invalid.');
  if (
    [...state.hostiles, ...state.police].some(
      (person) =>
        !finiteNumber(person.fireCooldown, 0, 1000) ||
        !finiteNumber(person.speed, 0, 200) ||
        !WEAPONS[person.weapon],
    )
  )
    throw new Error('The saved combatants are invalid.');
  if (
    state.bullets.some(
      (bullet) =>
        !validPoint(bullet) ||
        !finiteNumber(bullet.prevX, 0, WORLD.width) ||
        !finiteNumber(bullet.prevY, 0, WORLD.height) ||
        !finiteNumber(bullet.vx, -1000, 1000) ||
        !finiteNumber(bullet.vy, -1000, 1000) ||
        !finiteNumber(bullet.remaining, 0, 1000) ||
        !finiteNumber(bullet.damage, 0, 1000) ||
        typeof bullet.owner !== 'string',
    )
  )
    throw new Error('The saved projectiles are invalid.');
  if (
    !Number.isInteger(state.wanted.level) ||
    !finiteNumber(state.wanted.level, 0, 6) ||
    !validPoint(state.wanted.lastSeen) ||
    !finiteNumber(state.wanted.searchRadius, 0, 1000) ||
    !finiteNumber(state.wanted.timer, 0, 1e9) ||
    !finiteNumber(state.wanted.unseen, 0, 1e9) ||
    !finiteNumber(state.wanted.pursuitTime, 0, 1e9) ||
    !['clear', 'pursuit', 'search', 'cooling', 'arrest'].includes(state.wanted.status)
  )
    throw new Error('The saved police state is invalid.');
  if (
    state.player.weapons.some((id) => !WEAPONS[id]) ||
    !state.player.weapons.includes(state.player.weapon)
  )
    throw new Error('The saved weapon inventory is invalid.');
  for (const id of Object.keys(WEAPONS)) {
    const ammo = state.player.ammo?.[id];
    if (
      !ammo ||
      !Number.isInteger(ammo.clip) ||
      ammo.clip < 0 ||
      ammo.clip > WEAPONS[id].clipSize ||
      !Number.isInteger(ammo.reserve) ||
      ammo.reserve < 0 ||
      ammo.reserve > 100000
    )
      throw new Error('The saved ammunition is invalid.');
  }
  if (
    state.player.vehicleId &&
    !state.vehicles.some((vehicle) => vehicle.id === state.player.vehicleId && vehicle.health > 0)
  )
    throw new Error('The saved player vehicle is missing.');
  if (state.mission) {
    const definition = MISSIONS.find((mission) => mission.id === state.mission.id);
    if (
      !definition ||
      !Number.isInteger(state.mission.stage) ||
      !definition.stages[state.mission.stage] ||
      !finiteNumber(state.mission.elapsed, 0, 1e9) ||
      !finiteNumber(state.mission.stageElapsed, 0, 1e9)
    )
      throw new Error('The saved assignment is invalid.');
    const stage = definition.stages[state.mission.stage];
    state.mission.title = definition.title;
    state.mission.objective = stage.objective;
    state.mission.stageType = stage.type;
    if (stage.target) state.mission.target = clone(stage.target);
    else if (stage.type === 'escape')
      state.mission.target = {
        ...state.wanted.lastSeen,
        radius: state.wanted.searchRadius,
        name: 'Leave the police search circle',
      };
  }
  if (state.progress.completed.some((id) => !MISSIONS.some((mission) => mission.id === id)))
    throw new Error('The saved campaign progress is invalid.');
  if (
    ['deaths', 'fares', 'kills', 'distanceDriven', 'cashEarned'].some(
      (key) => !finiteNumber(state.progress[key], 0, 1e12),
    )
  )
    throw new Error('The saved statistics are invalid.');
  if (
    state.taxiJob &&
    (!validPoint(state.taxiJob.target) ||
      !validPoint(state.taxiJob.pickup) ||
      !validPoint(state.taxiJob.dropoff) ||
      !['pickup', 'dropoff'].includes(state.taxiJob.stage) ||
      !finiteNumber(state.taxiJob.fare, 0, 10000) ||
      !finiteNumber(state.taxiJob.elapsed, 0, 1e9) ||
      !finiteNumber(state.taxiJob.timeLimit, 0, 10000))
  )
    throw new Error('The saved taxi fare is invalid.');
  const optionalKeys = [
    'notifications',
    'dialogueHistory',
    'weather',
    'radio',
    'checkpoint',
    'particles',
  ];
  if (optionalKeys.some((key) => state[key] === undefined)) {
    const baseline = createSimulation();
    for (const key of optionalKeys) if (state[key] === undefined) state[key] = baseline[key];
  }
  if (state.campaign && !options.physicalOnly) {
    const adapters = campaignAdapters(state);
    if (state.campaign.contentFingerprint !== campaignContentFingerprint(adapters))
      state.campaign = migrateCampaignDirectorContent(state.campaign, adapters);
    validateCampaignDirector(state.campaign, adapters);
    const active = state.campaign.active,
      physical =
        active?.missionId === 'LL-ST-003'
          ? state.twoSeatsRuntime.active
          : active?.missionId === 'LL-ST-002'
            ? state.lateMeterRuntime.active
            : state.campaignRuntime.active;
    if (
      active &&
      (!physical ||
        active.missionId !== physical.missionId ||
        active.stageId !== physical.stageId ||
        active.attempt !== physical.attempt ||
        active.phase !== physical.phase)
    )
      throw Error('The saved physical assignment and story director disagree.');
    const interrupted = interruptedStory(state);
    const interruptedPhysical =
      interrupted?.missionId === 'LL-ST-003'
        ? state.twoSeatsRuntime.active
        : interrupted?.missionId === 'LL-ST-002'
          ? state.lateMeterRuntime.active
          : state.campaignRuntime.active;
    if (
      interrupted &&
      (!interruptedPhysical ||
        interruptedPhysical.missionId !== interrupted.missionId ||
        interruptedPhysical.stageId !== interrupted.stageId ||
        interruptedPhysical.attempt !== interrupted.attempt ||
        !['finished', 'suspended'].includes(interruptedPhysical.phase))
    )
      throw Error('The saved interrupted assignment and physical world disagree.');
  }
  if (state.campaignMode === 'story' && !state.campaign && !options.physicalOnly)
    throw Error('The saved story director is missing.');
  state.lastInput = {};
  state.saveRequested = false;
  hideStoryPhone(state);
  return state;
}
