/**
 * Production parent factory for Night Crossing. No simulation import.
 * Engine callbacks are real physical movement/snapshot/storage bindings, not
 * condition shortcuts. Readiness is explicit; absent engine.ready flags stay
 * false. Root ticks cinematicContext and syncSceneProps after physical movement,
 * and presents subtitleLine with presentSubtitle before ticking its duration.
 */
import * as companions from '../companions.js';
import { INTERIOR_LAYOUTS } from '../interiors.js';
import { initializeCalendar, worldHours } from '../calendar.js';
import { initializeWardrobe } from '../wardrobe.js';
import {
  initializeShelterServices,
  useShelterService,
  shelterReceipt,
  cancelShelterService,
  applyStoryInventoryEffect,
  shelterHook,
} from './shelter-services.js';
import {
  initializeCinematics,
  startCinematic,
  cinematicFinished,
  cinematicView,
  cancelCinematic,
} from './cinematics.js';
import { initializeSubtitles, startSubtitleSequence, subtitleFinished } from './subtitles.js';
import { FIRST_ARC_MISSIONS } from './first-arc.js';
import { NIGHT_CROSSING_DEFAULT_PROPS } from './scenes.js';
import { isLateMeterClipboard } from './late-meter-parent-context.js';
import { initializeCampaignRuntime, NIGHT_CROSSING_CINEMATICS } from './runtime.js';

const MISSION = 'LL-ST-001',
  FELIX = 'LL-CHAR-002',
  NADIA = 'LL-CHAR-008';
const authored = FIRST_ARC_MISSIONS.find((mission) => mission.id === MISSION);
const copy = (value) => JSON.parse(JSON.stringify(value));
const own = (value, key) => Object.hasOwn(value, key);
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const validId = (value) =>
  typeof value === 'string' &&
  /^[a-z0-9][a-z0-9:._-]{0,127}$/i.test(value) &&
  !['constructor', 'prototype', '__proto__'].includes(value);
const point = (p) => object(p) && [p.x, p.y, p.z ?? 0].every(finite);
const scene = (body) => body?.sceneId ?? null;
const at = (x, y, z = 0) => ({ x, y, z });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const hash = (value) => {
  let result = 2166136261;
  for (const c of JSON.stringify(value))
    result = Math.imul(result ^ c.charCodeAt(0), 16777619) >>> 0;
  return result.toString(16);
};
function call(fn, ...args) {
  const result = typeof fn === 'function' ? fn(...args) : undefined;
  if (result && typeof result.then === 'function')
    throw Error('Campaign engine callbacks must be synchronous.');
  return result;
}
function unavailable(reason) {
  return { ok: false, reason };
}

export function initializeCampaignParentState(state) {
  initializeCampaignRuntime(state);
  initializeCalendar(state);
  initializeWardrobe(state);
  initializeShelterServices(state);
  initializeCinematics(state);
  initializeSubtitles(state);
  companions.initializeCompanions(state);
  state.campaignEffects ??= { version: 1, receipts: {}, cinematicConfigs: {}, latestCinematic: {} };
  if (!own(state.campaignRuntime, 'sceneProps'))
    state.campaignRuntime.sceneProps = copy(NIGHT_CROSSING_DEFAULT_PROPS);
  return state.campaignEffects;
}
function physicalHome(state) {
  return (
    state.interior?.active?.roomId === 'dockside-rooms' &&
    state.player.sceneId === 'dockside-rooms' &&
    state.player.health > 0 &&
    !state.player.vehicleId
  );
}
function routePoints(path) {
  return Array.isArray(path) && path.length && path.every(point);
}
function sceneReady(bindings) {
  const b = bindings?.['pier-berth'],
    h = bindings?.['dockside-rooms'];
  return Boolean(
    b?.ready &&
    h?.ready &&
    bindings?.fairground?.ready &&
    bindings?.dispatch?.ready &&
    routePoints(b.gangway) &&
    routePoints(b.apronWaypoints) &&
    routePoints(b.driverWaypoints) &&
    point(b.duffel) &&
    point(h.duffelDrop) &&
    point(h.actorSpawns?.nadia) &&
    point(h.felixTarget) &&
    INTERIOR_LAYOUTS[h.roomId],
  );
}
function track(actorId, points, speed) {
  return { actorId, points: copy(points), speed };
}

/** Saved once per receipt: no path/config hash changes as actors move. */
function buildDefinition(state, id, bindings, engine, actor) {
  const b = bindings['pier-berth'],
    h = bindings['dockside-rooms'];
  if (!sceneReady(bindings)) return null;
  if (id === NIGHT_CROSSING_CINEMATICS.berth) {
    const gangway = b.gangway,
      reunion = b.reunionTarget || b.target;
    const felixMark = at(reunion.x + 16, reunion.y, reunion.z);
    const workers = b.actorSpawns.workers || [];
    const workerTrack = (index, delta) =>
      workers[index]
        ? [
            track(
              workers[index].id,
              [at(workers[index].x, workers[index].y + delta, workers[index].z)],
              16,
            ),
          ]
        : [];
    return {
      id,
      sceneId: null,
      phases: [
        {
          id: 'collect-duffel',
          holdSeconds: 0.4,
          dialogueReady: false,
          camera: { focus: b.playerSpawn, zoom: 1.12 },
          tracks: [track(FELIX, [b.duffel], 30), ...workerTrack(0, 4)],
        },
        {
          id: 'felix-crosses-gangway',
          holdSeconds: 0.2,
          dialogueReady: false,
          camera: { actorId: FELIX, offset: { x: 0, y: -8, z: 6 }, zoom: 1.08 },
          tracks: [track(FELIX, [...gangway, felixMark], 42)],
        },
        {
          id: 'mara-crosses-gangway',
          holdSeconds: 0.2,
          dialogueReady: false,
          camera: { actorId: 'player', zoom: 1.08 },
          tracks: [track('player', gangway, 42), ...workerTrack(1, 8)],
        },
        {
          id: 'reunion',
          holdSeconds: 1.2,
          dialogueReady: true,
          camera: { focus: at(reunion.x + 8, reunion.y, reunion.z + 6), zoom: 1.12 },
          tracks: [],
        },
      ],
    };
  }
  if (id === NIGHT_CROSSING_CINEMATICS.shelter) {
    const mara = actor('player');
    if (!mara || scene(mara) !== h.roomId) return null;
    const mark = { ...h.playerSpawn, sceneId: h.roomId };
    let playerRoute = call(engine.companionContext?.findRoute, mara, mark, state);
    if (
      playerRoute === undefined &&
      call(engine.companionContext?.hasLineOfSight, mara, mark, h.roomId) === true
    )
      playerRoute = [mark];
    if (
      !Array.isArray(playerRoute) ||
      !playerRoute.length ||
      !playerRoute.every(point) ||
      playerRoute.some((p) => p.portal || (p.sceneId ?? h.roomId) !== h.roomId)
    )
      return null;
    const nz = h.actorSpawns.nadia.z || 0;
    return {
      id,
      sceneId: h.roomId,
      phases: [
        {
          id: 'mara-entry-mark',
          holdSeconds: 0.2,
          dialogueReady: false,
          camera: { focus: at(122, 142, 8), zoom: 1.04 },
          tracks: [track('player', playerRoute, 28)],
        },
        {
          id: 'nadia-clears-aisle',
          holdSeconds: 0.2,
          dialogueReady: false,
          camera: { actorId: NADIA, zoom: 1.04 },
          tracks: [track(NADIA, [at(98, 128, nz), at(98, 112, nz)], 26)],
        },
        {
          id: 'duffel-delivery',
          holdSeconds: 0.3,
          dialogueReady: false,
          camera: { actorId: FELIX, zoom: 1.04 },
          tracks: [track(FELIX, [at(150, 134), at(84, 134), h.duffelDrop], 32)],
        },
        {
          id: 'felix-home-mark',
          holdSeconds: 0.2,
          dialogueReady: false,
          camera: { focus: at(122, 140, 8), zoom: 1.04 },
          tracks: [track(FELIX, [at(84, 134), h.felixTarget], 32)],
        },
        {
          id: 'nadia-home-mark',
          holdSeconds: 0.2,
          dialogueReady: false,
          camera: { actorId: NADIA, zoom: 1.04 },
          tracks: [track(NADIA, [at(98, 128, nz), h.actorSpawns.nadia], 26)],
        },
        {
          id: 'home-reveal',
          holdSeconds: 1.2,
          dialogueReady: true,
          camera: { focus: at(122, 138, 8), zoom: 1.04 },
          tracks: [],
        },
      ],
    };
  }
  return null;
}

export function createCampaignParentContext(state, engine) {
  initializeCampaignParentState(state);
  const bindings = typeof engine.bindings === 'function' ? call(engine.bindings) : engine.bindings;
  const actor = (id) =>
    id === 'player' || id === 'LL-CHAR-001'
      ? state.player
      : call(engine.actor, id) || companions.getActor(state, id);
  const readDefinition = (id) => {
    const effects = state.campaignEffects,
      active = state.cinematics?.active;
    const receipt = active?.id === id ? active.receipt : effects.latestCinematic[id];
    return effects.cinematicConfigs[receipt] || null;
  };
  function syncSceneProps() {
    const prop = state.campaignRuntime.sceneProps?.['arrival-duffel'];
    if (!prop) return;
    const felix = actor(FELIX),
      active = state.cinematics?.active;
    if (!felix) return;
    if (
      !prop.carrierId &&
      !prop.delivered &&
      active?.id === NIGHT_CROSSING_CINEMATICS.berth &&
      scene(felix) === null &&
      Math.abs((felix.z || 0) - (prop.z || 0)) <= 3 &&
      distance(felix, prop) < 8
    )
      prop.carrierId = FELIX;
    if (prop.carrierId === FELIX) {
      const drop = bindings?.['dockside-rooms']?.duffelDrop;
      if (
        active?.id === NIGHT_CROSSING_CINEMATICS.shelter &&
        scene(felix) === 'dockside-rooms' &&
        point(drop) &&
        distance(felix, drop) < 4
      ) {
        Object.assign(prop, {
          x: drop.x,
          y: drop.y,
          z: drop.z || 0,
          sceneId: 'dockside-rooms',
          carrierId: null,
          delivered: true,
          visible: true,
        });
      } else {
        Object.assign(prop, {
          x: felix.x + Math.cos(felix.angle || 0) * 4 - 5,
          y: felix.y + Math.sin(felix.angle || 0) * 4 - 4,
          z: (felix.z || 0) + 9,
          sceneId: scene(felix),
          visible: !felix.vehicleId,
        });
      }
    }
  }
  const cinematicContext = {
    sequence: readDefinition,
    actor,
    moveActor(id, dx, dy, radius) {
      const result = call(engine.moveActor, id, dx, dy, radius);
      syncSceneProps();
      return result;
    },
    onComplete() {
      syncSceneProps();
    },
  };
  const canRest = (s) => typeof engine.canRest === 'function' && call(engine.canRest, s) === true;
  const verifyService = (s, receipt) => {
    const actual = shelterReceipt(s, receipt?.id);
    return Boolean(
      actual && actual.kind === receipt.kind && s.shelterServices.active?.id !== receipt.id,
    );
  };
  const serviceHandlers = {};
  for (const kind of ['food', 'rest', 'wardrobe', 'evidence'])
    serviceHandlers[kind] = (s, request) => {
      const result = useShelterService(s, kind, request, { canRest });
      if (result.ok && s.shelterServices.active?.id === result.receipt?.id)
        return { ...result, pending: true };
      return result;
    };
  function recordEffect(s, action, request, perform) {
    if (!validId(request?.id) || !object(action))
      return unavailable('invalid-physical-effect-request');
    const ledger = s.campaignEffects.receipts,
      old = ledger[request.id],
      actionHash = hash(action);
    if (old)
      return old.actionHash === actionHash
        ? { ok: true, replayed: true, receipt: copy(old) }
        : unavailable('effect-receipt-conflict');
    const performed = perform();
    if (!performed?.ok) return performed || unavailable('effect-declined');
    const receipt = {
      id: request.id,
      kind: action.type,
      status: 'committed',
      actionHash,
      time: s.time,
      parentReceipt: performed.receipt?.id || null,
    };
    ledger[request.id] = receipt;
    return { ok: true, receipt: copy(receipt) };
  }
  const effectHandlers = {};
  for (const kind of ['grant-key', 'evidence-note'])
    effectHandlers[kind] = (s, action, request) =>
      recordEffect(s, action, request, () => {
        if (
          !physicalHome(s) ||
          s.campaignRuntime.active?.missionId !== MISSION ||
          !companions.getActor(s, NADIA)?.health
        )
          return unavailable('home-inventory-scene-not-ready');
        const reveal = s.campaignRuntime.night.cinematics.shelter;
        if (!reveal || !cinematicFinished(s, reveal.id, reveal.receipt))
          return unavailable('home-reveal-not-completed');
        if (action.id !== (kind === 'grant-key' ? 'dockside-tenancy' : 'co-op-arrears'))
          return unavailable('unregistered-story-item');
        return applyStoryInventoryEffect(s, action, request.id);
      });
  effectHandlers['campaign-reward'] = (s, action, request) =>
    recordEffect(s, action, request, () => {
      if (
        request.scope?.missionId !== MISSION ||
        JSON.stringify(action.rewards) !== JSON.stringify(authored.rewards) ||
        s.campaignRuntime.active?.stageId !== 'rest'
      )
        return unavailable('unregistered-campaign-reward');
      const services = s.campaignRuntime.night.services;
      if (
        !physicalHome(s) ||
        !['food', 'save', 'rest'].every(
          (kind) => services[kind] && verifyService(s, services[kind]),
        ) ||
        s.calendar.receipts[services.rest.id]?.hours !== 6
      )
        return unavailable('physical-arrival-objectives-incomplete');
      s.player.money += authored.rewards.cash;
      if (s.progress && finite(s.progress.cashEarned))
        s.progress.cashEarned += authored.rewards.cash;
      return { ok: true };
    });
  for (const kind of [
    'mission-failed',
    'mission-abandoned',
    'mission-suspended',
    'mission-restarted',
  ])
    effectHandlers[kind] = (s, action, request) =>
      recordEffect(s, action, request, () => {
        if (request.scope?.missionId !== MISSION)
          return unavailable('unregistered-campaign-lifecycle');
        if (s.shelterServices.active) cancelShelterService(s, s.shelterServices.active.id, kind);
        if (kind !== 'mission-suspended') cancelCinematic(s, kind);
        call(
          engine.notify,
          kind === 'mission-failed'
            ? 'The arrival was interrupted. Retry from a checkpoint or return to the city.'
            : kind === 'mission-abandoned'
              ? 'Assignment left unfinished.'
              : kind === 'mission-restarted'
                ? 'Restarting the arrival.'
                : 'Assignment suspended.',
        );
        return { ok: true };
      });
  const physicalCallbacks =
    object(engine.companionContext) &&
    [
      'moveBody',
      'isBlocked',
      'hasLineOfSight',
      'surfaceHeight',
      'findRoute',
      'transitionScene',
    ].every((key) => typeof engine.companionContext[key] === 'function');
  const built = sceneReady(bindings),
    snapshots = ['capture', 'validate', 'restore'].every(
      (key) => typeof engine.snapshots?.[key] === 'function',
    );
  return {
    world: engine.world,
    terrain: engine.terrain,
    bindings,
    get ready() {
      return {
        passengers: engine.ready?.passengers === true && physicalCallbacks,
        interior: engine.ready?.interior === true && built,
        shelter:
          engine.ready?.shelter === true &&
          built &&
          snapshots &&
          typeof engine.confirmStorage === 'function' &&
          typeof engine.canRest === 'function',
        cinematic:
          engine.ready?.cinematic === true &&
          built &&
          typeof engine.moveActor === 'function' &&
          typeof engine.actor === 'function',
      };
    },
    passengers: companions,
    companionContext: engine.companionContext,
    interiors: { hasRoom: (id) => Boolean(INTERIOR_LAYOUTS[id]) },
    vehicles: {
      specs: engine.specs,
      ensure(s, definition) {
        const old = s.vehicles.find((body) => body.id === definition.id);
        if (old) return { ok: true, vehicle: old, existing: true };
        const spec = engine.specs?.[definition.spec];
        if (!spec || !finite(spec.health) || !point(definition) || spec.seats < 4)
          return unavailable('vehicle-specification-unavailable');
        const body = {
          ...copy(definition),
          kind: 'parked',
          missionVehicle: true,
          owned: definition.owned !== false,
          ownership: definition.ownership || 'cooperative',
          authorizedDrivers: [...new Set([...(definition.authorizedDrivers || []), 'mara-voss'])],
          z: definition.z || 0,
          groundZ: definition.z || 0,
          speed: 0,
          health: spec.health,
          maxHealth: spec.health,
          occupied: false,
          route: null,
          routeIndex: 0,
          blockedTime: 0,
          stolen: false,
        };
        s.vehicles.push(body);
        return { ok: true, vehicle: body };
      },
    },
    cinematics: {
      start(s, id, payload) {
        if (id === NIGHT_CROSSING_CINEMATICS.ambient)
          return startSubtitleSequence(s, id, payload.receipt, payload.lines);
        if (![NIGHT_CROSSING_CINEMATICS.berth, NIGHT_CROSSING_CINEMATICS.shelter].includes(id))
          return unavailable('unregistered-physical-cinematic');
        const effects = initializeCampaignParentState(s);
        if (!effects.cinematicConfigs[payload.receipt]) {
          const definition = buildDefinition(s, id, bindings, engine, actor);
          if (!definition) return unavailable('physical-cinematic-route-unavailable');
          effects.cinematicConfigs[payload.receipt] = definition;
        }
        effects.latestCinematic[id] = payload.receipt;
        return startCinematic(s, id, payload.receipt, cinematicContext);
      },
      isFinished(s, id, receipt) {
        return id === NIGHT_CROSSING_CINEMATICS.ambient
          ? subtitleFinished(s, id, receipt)
          : cinematicFinished(s, id, receipt);
      },
      dialogueReady(s, id, receipt) {
        if (cinematicFinished(s, id, receipt)) return true;
        return (
          s.cinematics?.active?.receipt === receipt &&
          s.cinematics.active.id === id &&
          cinematicView(s, cinematicContext)?.dialogueReady === true
        );
      },
    },
    services: {
      ready: {
        food: built,
        rest: built,
        wardrobe: built,
        evidence: built,
        save: built && typeof engine.confirmStorage === 'function',
      },
      handlers: serviceHandlers,
      verifyReceipt: verifyService,
      calendarHours: worldHours,
      getReceipt(s, id) {
        return (
          shelterReceipt(s, id) ||
          (s.shelterServices.cancelled[id]
            ? { id, ...copy(s.shelterServices.cancelled[id]), status: 'cancelled' }
            : null)
        );
      },
      cancel: cancelShelterService,
      canUse: (s, kind) => Boolean(shelterHook(s, kind)),
      prepareSave(candidate, request) {
        const hook = shelterHook(candidate, 'save');
        if (!hook || hook.id !== request.hookId || !physicalHome(candidate))
          return unavailable('physical-save-hook-unavailable');
        const record = {
          id: request.id,
          kind: 'save',
          status: 'committed',
          roomId: 'dockside-rooms',
          hookId: hook.id,
          time: candidate.time,
        };
        const old = candidate.shelterServices.receipts[request.id];
        if (old && old.kind !== 'save') return unavailable('save-receipt-conflict');
        candidate.shelterServices.receipts[request.id] = record;
        return { ok: true, receipt: copy(record) };
      },
      confirmSaved(s, candidate, receipt, proof) {
        if (call(engine.confirmStorage, s, candidate, receipt, proof) !== true) return false;
        const saved = candidate.shelterServices?.receipts?.[receipt.id];
        if (
          !saved ||
          saved.kind !== 'save' ||
          saved.status !== 'committed' ||
          saved.id !== receipt.id
        )
          return false;
        s.shelterServices.receipts[receipt.id] = copy(saved);
        return true;
      },
    },
    effects: {
      handlers: effectHandlers,
      verifyReceipt(s, receipt) {
        const record = s.campaignEffects.receipts[receipt?.id];
        return Boolean(
          record &&
          record.status === 'committed' &&
          record.kind === receipt.kind &&
          record.actionHash === receipt.actionHash,
        );
      },
    },
    observations: {
      playerArrested: (s, since) =>
        finite(s.policeDispatch?.lastArrest?.time) && s.policeDispatch.lastArrest.time >= since,
      inCombat: (s) => !canRest(s),
    },
    snapshots: engine.snapshots,
    cinematicContext,
    syncSceneProps,
    validateState: (snapshot) => validateCampaignParentState(snapshot),
  };
}

export function validateCampaignParentState(state) {
  const effects = state.campaignEffects;
  if (
    !effects ||
    effects.version !== 1 ||
    !object(effects.receipts) ||
    !object(effects.cinematicConfigs) ||
    !object(effects.latestCinematic) ||
    Object.keys(effects.receipts).length > 4096 ||
    Object.keys(effects.cinematicConfigs).length > 128
  )
    throw Error('Invalid saved campaign parent ledger.');
  for (const [id, receipt] of Object.entries(effects.receipts))
    if (
      !validId(id) ||
      !receipt ||
      receipt.id !== id ||
      receipt.status !== 'committed' ||
      !finite(receipt.time) ||
      typeof receipt.actionHash !== 'string'
    )
      throw Error('Invalid saved physical campaign effect.');
  for (const [id, config] of Object.entries(effects.cinematicConfigs))
    if (
      !validId(id) ||
      !config ||
      ![NIGHT_CROSSING_CINEMATICS.berth, NIGHT_CROSSING_CINEMATICS.shelter].includes(config.id) ||
      !Array.isArray(config.phases) ||
      !config.phases.length
    )
      throw Error('Invalid saved campaign cinematic configuration.');
  for (const [id, receipt] of Object.entries(effects.latestCinematic))
    if (effects.cinematicConfigs[receipt]?.id !== id)
      throw Error('Invalid saved campaign cinematic reference.');
  const props = state.campaignRuntime?.sceneProps;
  if (!object(props)) throw Error('Invalid saved campaign scene props.');
  for (const [id, prop] of Object.entries(props)) {
    if (id === 'reeve-repossession-clipboard' && isLateMeterClipboard(prop)) continue;
    if (
      id !== 'arrival-duffel' ||
      prop.id !== id ||
      prop.kind !== 'duffel' ||
      !point(prop) ||
      ![prop.w, prop.h, prop.height].every((value) => finite(value) && value > 0 && value <= 100) ||
      ![null, 'dockside-rooms'].includes(prop.sceneId) ||
      typeof prop.visible !== 'boolean' ||
      (prop.carrierId && prop.carrierId !== FELIX) ||
      (prop.delivered && prop.carrierId)
    )
      throw Error('Invalid saved physical duffel state.');
  }
  return true;
}
