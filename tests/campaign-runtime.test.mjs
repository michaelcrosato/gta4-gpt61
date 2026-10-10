import test from 'node:test';
import assert from 'node:assert/strict';
import * as passengers from '../src/companions.js';
import { createTerrain } from '../src/terrain.js';
import { createSceneContext } from '../src/scene-context.js';
import { INTERIOR_LAYOUTS, initializeInteriors, enterInterior } from '../src/interiors.js';
import { initializeCalendar, worldHours, validateCalendar } from '../src/calendar.js';
import { initializeWardrobe, validateWardrobe } from '../src/wardrobe.js';
import {
  initializeCinematics,
  startCinematic,
  tickCinematics,
  cinematicFinished,
} from '../src/campaign/cinematics.js';
import {
  initializeShelterServices,
  useShelterService,
  tickShelterServices,
  shelterReceipt,
  cancelShelterService,
  applyStoryInventoryEffect,
  validateShelterServices,
} from '../src/campaign/shelter-services.js';
import { FIRST_ARC_MISSIONS } from '../src/campaign/first-arc.js';
import {
  createCampaignDirector,
  startCampaignMission,
  updateCampaignDirector,
  currentCampaignDialogue,
  advanceCampaignDialogue,
  chooseCampaignOption,
  retryCampaignMission,
  abandonCampaignMission,
  campaignAvailability,
} from '../src/campaign/director.js';
import {
  initializeCampaignRuntime,
  createCampaignAdapters,
  tickCampaignRuntime,
  campaignRuntimeView,
  performCampaignService,
  prepareCampaignSave,
  commitCampaignSave,
  rollbackCampaignSave,
  validateCampaignRuntime,
  NIGHT_CROSSING_CINEMATICS,
} from '../src/campaign/runtime.js';

// Declared isolated parent integration fixtures, not Harbor City/campaign
// playthrough evidence. Real surface collision, companion approach/boarding,
// room portals, shelter stock, wardrobe and calendar code are used. Driver input,
// cinematic tracks, transaction notifications and memory storage are synthetic
// parent orchestration. Production browser/natural-input validation remains due.
const copy = (v) => JSON.parse(JSON.stringify(v));
const FELIX = 'LL-CHAR-002',
  TAXI = 'arc-arrival-taxi';
const specs = { taxi: { width: 15, length: 29, seats: 4, maxSpeed: 145 } };
const at = (x, y, extra = {}) => ({ x, y, z: 0, ...extra });
const line = (text) => ({ speaker: 'Fixture', text, when: 'always' });

function fixture() {
  const world = {
    width: 1000,
    height: 600,
    bounds: { left: 0, top: 0, right: 1000, bottom: 600 },
    buildings: [],
    obstacles: [],
    roads: [{ id: 'road', x1: 20, y1: 100, x2: 800, y2: 100, width: 80, access: ['car', 'foot'] }],
    water: [],
    landforms: [],
    tunnels: [],
    decks: [],
    locations: [{ id: 'dockside-rooms', x: 129, y: 308 }],
  };
  const room = INTERIOR_LAYOUTS['dockside-rooms'];
  assert(room, 'Production Dockside room must be integrated before this parent-adapter test.');
  const hookServices = {
    food: 'shelter-food',
    save: 'shelter-save',
    rest: 'shelter-rest',
    wardrobe: 'wardrobe',
    evidence: 'evidence',
  };
  const hooks = Object.fromEntries(
    Object.entries(hookServices).map(([kind, service]) => {
      const hook = room.hooks.find((entry) => entry.service === service);
      assert(hook, `Real ${kind} room hook must exist.`);
      return [kind, { ...hook, z: 0, sceneId: room.id }];
    }),
  );
  const sceneBindings = {
    'pier-berth': {
      ready: true,
      sceneId: null,
      target: at(100, 100, { radius: 60 }),
      playerSpawn: at(100, 100),
      actorSpawns: { felix: at(100, 125), workers: [] },
      taxiSpawn: at(140, 100, { angle: 0 }),
      duffel: { id: 'arrival-duffel' },
    },
    fairground: { ready: true, sceneId: null, target: at(300, 100, { radius: 18 }) },
    dispatch: { ready: true, sceneId: null, target: at(500, 100, { radius: 18 }) },
    'dockside-rooms': {
      ready: true,
      roomId: room.id,
      portalId: 'dockside-rooms-entry',
      entry: at(129, 308),
      actorSpawns: { nadia: at(78, 128, { sceneId: room.id }) },
      felixTarget: at(144, 134, { sceneId: room.id, radius: 18 }),
      parkingBay: { x: 540, y: 75, w: 40, h: 60, z: 0, angle: 0, angleTolerance: Math.PI / 4 },
      hooks,
    },
  };
  const state = {
    time: 0,
    clock: 20.25,
    player: {
      ...at(100, 100),
      groundZ: 0,
      health: 80,
      stamina: 80,
      money: 240,
      vehicleId: null,
      sceneId: null,
    },
    vehicles: [],
    hostiles: [],
    wanted: { level: 0, status: 'clear' },
    progress: { completed: [], cashEarned: 0 },
    scene: { kind: 'exterior', id: 'harbor-city' },
    parentEffects: {},
    rewardCalls: 0,
    arrestEvents: [],
    respawnTimer: 0,
  };
  initializeInteriors(state);
  initializeCalendar(state);
  initializeWardrobe(state);
  initializeShelterServices(state);
  initializeCinematics(state);
  passengers.initializeCompanions(state);
  initializeCampaignRuntime(state);
  state.campaign = createCampaignDirector();
  const terrain = createTerrain(world),
    scenes = createSceneContext(world, terrain),
    storage = new Map();
  const actor = (id) => (id === 'player' ? state.player : passengers.getActor(state, id));
  const companionContext = {
    specs,
    sceneExists: (id) => id === null || Boolean(INTERIOR_LAYOUTS[id]),
    moveBody: (body, dx, dy, radius) => scenes.moveBody(state, body, dx, dy, radius),
    isBlocked: (x, y, r, z, id) => scenes.queries(state, id).isBlocked(x, y, r, z),
    hasLineOfSight: (a, b, id) => scenes.queries(state, id).hasLineOfSight(a, b),
    surfaceHeight: (x, y, z, id) => (id ? 0 : terrain.surfaceHeight(x, y, z)),
    findRoute(body, target) {
      if (body.sceneId === target.sceneId || (body.sceneId ?? null) === (target.sceneId ?? null)) {
        if (target.sceneId === room.id)
          return [at(150, 184, { sceneId: room.id }), at(150, 134, { sceneId: room.id }), target];
        return [target];
      }
      if ((body.sceneId ?? null) === null && target.sceneId === room.id)
        return [
          at(129, 308, {
            sceneId: null,
            portal: {
              id: 'dockside-rooms-entry',
              radius: 8,
              to: at(122, 184, { sceneId: room.id }),
            },
          }),
          target,
        ];
      return [];
    },
    transitionScene(body, portal) {
      if (Math.hypot(body.x - 129, body.y - 308) > 8.01) return false;
      Object.assign(body, portal.to, { groundZ: 0 });
      return true;
    },
  };
  const definitions = {
    [NIGHT_CROSSING_CINEMATICS.berth]: {
      id: NIGHT_CROSSING_CINEMATICS.berth,
      sceneId: null,
      phases: [{ holdSeconds: 1, tracks: [{ actorId: FELIX, points: [at(110, 110)], speed: 20 }] }],
    },
    [NIGHT_CROSSING_CINEMATICS.shelter]: {
      id: NIGHT_CROSSING_CINEMATICS.shelter,
      sceneId: room.id,
      phases: [{ holdSeconds: 0.4, tracks: [] }],
    },
    [NIGHT_CROSSING_CINEMATICS.ambient]: {
      id: NIGHT_CROSSING_CINEMATICS.ambient,
      sceneId: null,
      phases: [{ holdSeconds: 1, tracks: [] }],
    },
  };
  const cinematicContext = {
    sequence: (id) => definitions[id],
    actor,
    moveActor: (id, dx, dy, r) => scenes.moveBody(state, actor(id), dx, dy, r),
    currentSceneId: () => state.player.sceneId,
  };
  const canRest = (s) =>
    !s.wanted.level && !s.hostiles.some((body) => body.health > 0 && body.sceneId === room.id);
  const ready = { passengers: true, interior: true, shelter: true, cinematic: true };
  const services = {
    ready: { food: true, save: true, rest: true, wardrobe: true, evidence: true },
    handlers: {},
    calendarHours: worldHours,
    verifyReceipt(s, receipt) {
      return Boolean(shelterReceipt(s, receipt.id)) && s.shelterServices.active?.id !== receipt.id;
    },
    getReceipt(s, id) {
      return (
        shelterReceipt(s, id) ||
        (s.shelterServices.cancelled[id]
          ? { id, kind: s.shelterServices.cancelled[id].kind, status: 'cancelled' }
          : null)
      );
    },
    cancel: cancelShelterService,
    prepareSave(candidate, request) {
      const record = {
        id: request.id,
        kind: 'save',
        status: 'committed',
        roomId: room.id,
        hookId: request.hookId,
        time: candidate.time,
      };
      candidate.shelterServices.receipts[request.id] = record;
      return { ok: true, receipt: copy(record) };
    },
    confirmSaved(s, candidate, receipt, proof) {
      if (proof?.key !== 'save' || storage.get('save') !== JSON.stringify(candidate)) return false;
      s.shelterServices.receipts[receipt.id] = copy(candidate.shelterServices.receipts[receipt.id]);
      return true;
    },
  };
  for (const kind of ['food', 'rest', 'wardrobe', 'evidence'])
    services.handlers[kind] = (s, request) => {
      const result = useShelterService(s, kind, request, { canRest });
      return result.ok && s.shelterServices.active?.id === result.receipt.id
        ? { ...result, pending: true }
        : result;
    };
  const handlers = {};
  for (const kind of ['grant-key', 'evidence-note'])
    handlers[kind] = (s, action, request) => applyStoryInventoryEffect(s, action, request.id);
  for (const kind of [
    'campaign-reward',
    'mission-failed',
    'mission-abandoned',
    'mission-suspended',
    'mission-restarted',
  ])
    handlers[kind] = (s, action, request) => {
      if (!s.parentEffects[request.id]) {
        if (kind === 'campaign-reward') {
          s.player.money += action.rewards.cash;
          s.rewardCalls++;
        }
        s.parentEffects[request.id] = { id: request.id, kind, status: 'committed', time: s.time };
      }
      return { ok: true, receipt: copy(s.parentEffects[request.id]) };
    };
  const context = {
    world,
    terrain,
    bindings: sceneBindings,
    ready,
    passengers,
    companionContext,
    vehicles: {
      specs,
      ensure(s, definition) {
        if (!s.vehicles.some((body) => body.id === definition.id))
          s.vehicles.push({
            ...copy(definition),
            groundZ: definition.z || 0,
            health: 120,
            speed: 0,
          });
        return { ok: true };
      },
    },
    interiors: { hasRoom: (id) => Boolean(INTERIOR_LAYOUTS[id]) },
    cinematics: {
      start: (s, id, payload) => startCinematic(s, id, payload.receipt, cinematicContext),
      isFinished: cinematicFinished,
    },
    services,
    effects: {
      handlers,
      verifyReceipt: (s, receipt) =>
        Boolean(s.parentEffects[receipt.id] || s.storyInventory.receipts[receipt.id]),
    },
    observations: {
      playerArrested: (s, since) => s.arrestEvents.some((event) => event.time >= since),
      inCombat: (s) => !canRest(s),
    },
    snapshots: {
      capture: (s) =>
        copy(Object.fromEntries(Object.entries(s).filter(([key]) => key !== 'campaign'))),
      validate(snapshot) {
        try {
          validateCampaignRuntime(snapshot);
          passengers.validateCompanions(snapshot, companionContext);
          validateCalendar(snapshot);
          validateWardrobe(snapshot);
          validateShelterServices(snapshot);
          return true;
        } catch {
          return false;
        }
      },
      restore(s, snapshot) {
        const director = s.campaign;
        for (const key of Object.keys(s)) if (key !== 'campaign') delete s[key];
        Object.assign(s, copy(snapshot));
        s.campaign = director;
        return { ok: true };
      },
    },
  };
  const adapters = createCampaignAdapters(state, context);
  function step(dt = 0.05) {
    state.time += dt;
    passengers.updateCompanions(state, dt, companionContext);
    tickCinematics(state, dt, cinematicContext);
    tickShelterServices(state, dt, { canRest });
    tickCampaignRuntime(state, dt, context);
  }
  function until(predicate, max = 1600) {
    for (let i = 0; i < max && !predicate(); i++) step();
    assert(
      predicate(),
      JSON.stringify({
        stage: state.campaignRuntime.active,
        companions: state.companions.records,
        runtime: state.campaignRuntime.night,
      }),
    );
  }
  function move(body, target, speed = 50) {
    for (let i = 0; i < 1600 && Math.hypot(body.x - target.x, body.y - target.y) > 0.2; i++) {
      const d = Math.hypot(target.x - body.x, target.y - body.y),
        amount = Math.min(speed * 0.05, d);
      body.speed = speed;
      scenes.moveBody(
        state,
        body,
        ((target.x - body.x) / d) * amount,
        ((target.y - body.y) / d) * amount,
        body.spec ? 10 : 7,
      );
      if (body.spec && state.player.vehicleId === body.id)
        Object.assign(state.player, { x: body.x, y: body.y, z: body.z });
      step();
    }
    assert(
      Math.hypot(body.x - target.x, body.y - target.y) <= 0.21,
      'Physical movement did not reach its target',
    );
    body.speed = 0;
  }
  function acknowledge() {
    assert.equal(campaignRuntimeView(state, context).dialogueReady, true);
    while (currentCampaignDialogue(state.campaign, adapters).line)
      advanceCampaignDialogue(state.campaign, adapters);
  }
  function start() {
    const result = startCampaignMission(state.campaign, 'LL-ST-001', adapters);
    assert.equal(result.ok, true, JSON.stringify(result));
  }
  function board() {
    until(() => cinematicFinished(state, NIGHT_CROSSING_CINEMATICS.berth));
    acknowledge();
    assert.equal(updateCampaignDirector(state.campaign, adapters).stageId, 'taxi');
    move(state.player, at(130, 100));
    state.player.vehicleId = TAXI;
    state.player.x = 140;
    state.player.y = 100;
    step();
    assert.equal(campaignRuntimeView(state, context).dialogueReady, false);
    until(() => Boolean(passengers.getSeat(state, FELIX)));
    step();
  }
  function toShelter() {
    start();
    board();
    acknowledge();
    assert.equal(updateCampaignDirector(state.campaign, adapters).stageId, 'drill');
    acknowledge();
    const car = state.vehicles.find((body) => body.id === TAXI);
    move(car, at(300, 100), 40);
    until(() => state.campaignRuntime.night.route.index === 2);
    move(car, at(500, 100), 40);
    step();
    assert.equal(updateCampaignDirector(state.campaign, adapters).stageId, 'shelter');
    move(car, at(560, 100), 30);
    state.player.vehicleId = null;
    Object.assign(state.player, at(560, 120));
    step();
    move(state.player, at(129, 308), 60);
    const entered = enterInterior(state, 'dockside-rooms-entry', { world });
    assert.equal(entered.ok, true, JSON.stringify(entered));
    until(() => Boolean(state.campaignRuntime.night.cinematics.shelter));
    until(() => cinematicFinished(state, NIGHT_CROSSING_CINEMATICS.shelter));
  }
  function toRest() {
    toShelter();
    acknowledge();
    assert.equal(
      chooseCampaignOption(state.campaign, 'room-response', 'ask-contracts', adapters).ok,
      true,
    );
    assert.equal(updateCampaignDirector(state.campaign, adapters).stageId, 'rest');
    acknowledge();
  }
  function approach(kind) {
    const target = hooks[kind];
    const routes =
      kind === 'food'
        ? [at(100, 184), target]
        : kind === 'save'
          ? [at(100, 184), target]
          : kind === 'rest'
            ? [at(150, 184), at(150, 126), at(110, 126), at(110, 86), target]
            : [target];
    for (const destination of routes) move(state.player, destination, 35);
  }
  function eatAndSave() {
    approach('food');
    assert.equal(performCampaignService(state, 'food', context).ok, true);
    until(() => Boolean(state.campaignRuntime.night.services.food));
    approach('save');
    const prepared = prepareCampaignSave(state, context);
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    storage.set('save', JSON.stringify(prepared.candidate));
    assert.equal(commitCampaignSave(state, prepared, { key: 'save' }, context).ok, true);
    return prepared;
  }
  return {
    state,
    context,
    adapters,
    world,
    terrain,
    storage,
    step,
    until,
    move,
    acknowledge,
    start,
    board,
    toShelter,
    toRest,
    approach,
    eatAndSave,
  };
}

test('unknown/unintegrated parent dependencies gate Night Crossing and all later handlers stay explicit', () => {
  const h = fixture();
  h.context.ready.cinematic = false;
  assert.equal(
    campaignAvailability(h.state.campaign, h.adapters)[0].status,
    'unmet-integration-gates',
  );
  assert.equal(startCampaignMission(h.state.campaign, 'LL-ST-001', h.adapters).ok, false);
  assert.equal(h.state.vehicles.length, 0);
  h.context.ready.cinematic = true;
  assert.equal(
    h.adapters.supportsStage(FIRST_ARC_MISSIONS[1].stages[0].type, FIRST_ARC_MISSIONS[1].stages[0]),
    false,
  );
  assert.equal(h.adapters.supportsCondition('tail-target-lost'), false);
});

test('acknowledged berth dialogue cannot skip a real moving cinematic; supplied unknown staging also blocks', () => {
  const h = fixture();
  h.start();
  h.acknowledge();
  assert.equal(
    updateCampaignDirector(h.state.campaign, h.adapters).waiting,
    'physical-stage-staging',
  );
  const actor = passengers.getActor(h.state, FELIX),
    original = { x: actor.x, y: actor.y };
  h.step();
  assert(Math.hypot(actor.x - original.x, actor.y - original.y) > 0);
  h.until(() => cinematicFinished(h.state, NIGHT_CROSSING_CINEMATICS.berth));
  const normal = h.adapters.canCompleteStage;
  h.adapters.canCompleteStage = () => undefined;
  assert.equal(updateCampaignDirector(h.state.campaign, h.adapters).ok, false);
  h.adapters.canCompleteStage = normal;
  assert.equal(updateCampaignDirector(h.state.campaign, h.adapters).stageId, 'taxi');
});

test('boarding reservation is not a seat and taxi subtitles wait for actual Mara and living Felix seating', () => {
  const h = fixture();
  h.start();
  h.board();
  assert.equal(campaignRuntimeView(h.state, h.context).dialogueReady, true);
  const seat = passengers.getSeat(h.state, FELIX);
  assert(seat?.alive);
  assert.equal(seat.vehicleId, TAXI);
  assert.equal(passengers.vehicleOccupants(h.state, TAXI).length, 1);
  passengers.damageCompanion(h.state, FELIX, 1000, 'fixture-damage', h.context.companionContext);
  h.step();
  assert.equal(campaignRuntimeView(h.state, h.context).dialogueReady, false);
  assert.equal(updateCampaignDirector(h.state.campaign, h.adapters).failed, true);
});

test('actual Nadia death before the reveal fails the arrival instead of leaving an unmet scene forever', () => {
  const h = fixture();
  h.start();
  const nadia = 'LL-CHAR-008';
  assert.equal(
    h.adapters.observe({ type: 'actor-dead', actor: nadia }, { missionId: 'LL-ST-001' }),
    false,
  );
  passengers.damageCompanion(
    h.state,
    nadia,
    1000,
    'declared-damage-fixture',
    h.context.companionContext,
  );
  h.step();
  assert.equal(passengers.companionObservation(h.state, nadia).alive, false);
  assert.equal(updateCampaignDirector(h.state.campaign, h.adapters).failureId, 'lost-nadia');
  assert.equal(h.state.campaign.active.phase, 'failed');
  assert.equal(h.state.campaign.active.failure.resumeCheckpoint, 'arrival');
  assert.equal(h.state.rewardCalls, 0);
  assert.equal(h.state.campaign.completed['LL-ST-001'], undefined);
  assert.equal(retryCampaignMission(h.state.campaign, h.adapters).ok, true);
  assert.equal(passengers.companionObservation(h.state, nadia).health, 100);
  assert.equal(
    h.state.campaign.active.stageId,
    'berth',
    'An uncommitted arrival falls back to its real start snapshot',
  );
});

test('Nadia death at the room response blocks choice/reward and retry restores the committed living cast', () => {
  const h = fixture();
  h.toShelter();
  h.acknowledge();
  assert.equal(campaignRuntimeView(h.state, h.context).choicePending, true);
  passengers.damageCompanion(
    h.state,
    'LL-CHAR-008',
    1000,
    'declared-damage-fixture',
    h.context.companionContext,
  );
  assert.equal(campaignRuntimeView(h.state, h.context).dialogueReady, false);
  assert.equal(
    h.state.campaign.active.phase,
    'running',
    'Exercise the input interval before the next director failure tick',
  );
  assert.equal(
    chooseCampaignOption(h.state.campaign, 'room-response', 'thank-nadia', h.adapters).ok,
    false,
  );
  h.step();
  assert.equal(updateCampaignDirector(h.state.campaign, h.adapters).failureId, 'lost-nadia');
  assert.equal(
    chooseCampaignOption(h.state.campaign, 'room-response', 'thank-nadia', h.adapters).ok,
    false,
  );
  assert.equal(h.state.storyInventory.keys.includes('dockside-tenancy'), false);
  assert.equal(h.state.rewardCalls, 0);
  assert.equal(retryCampaignMission(h.state.campaign, h.adapters).ok, true);
  assert.equal(h.state.campaign.active.stageId, 'taxi');
  assert.equal(passengers.companionObservation(h.state, 'LL-CHAR-008').health, 100);
  assert.equal(passengers.companionObservation(h.state, FELIX).alive, true);
});

test('missing required Nadia observations are an explicit integration gate, never a fake death or success', () => {
  const h = fixture();
  h.start();
  h.context.passengers = {
    ...passengers,
    companionObservation: (state, id) =>
      id === 'LL-CHAR-008' ? null : passengers.companionObservation(state, id),
  };
  const result = updateCampaignDirector(h.state.campaign, h.adapters);
  assert.equal(result.ok, false);
  assert.deepEqual(result.unmet, ['actor-dead:required-actor-observation-missing:LL-CHAR-008']);
  assert.equal(h.state.campaign.active.phase, 'running');
  assert.equal(h.state.rewardCalls, 0);
});

test('Nadia death wins over otherwise completed shelter services and prevents mission reward', () => {
  const h = fixture();
  h.toRest();
  h.eatAndSave();
  h.approach('rest');
  assert.equal(performCampaignService(h.state, 'rest', h.context).pending, true);
  h.until(() => Boolean(h.state.campaignRuntime.night.services.rest));
  assert.equal(h.state.calendar.offsetHours, 6);
  passengers.damageCompanion(
    h.state,
    'LL-CHAR-008',
    1000,
    'declared-damage-fixture',
    h.context.companionContext,
  );
  h.step();
  assert.equal(updateCampaignDirector(h.state.campaign, h.adapters).failureId, 'lost-nadia');
  assert.equal(h.state.campaign.completed['LL-ST-001'], undefined);
  assert.equal(h.state.rewardCalls, 0);
  assert.equal(retryCampaignMission(h.state.campaign, h.adapters).ok, true);
  assert.equal(
    h.state.calendar.offsetHours,
    0,
    'Committed arrival checkpoint restores its actual pre-rest calendar',
  );
  assert.equal(h.state.storyInventory.keys.includes('dockside-tenancy'), false);
  assert.equal(passengers.companionObservation(h.state, 'LL-CHAR-008').health, 100);
});

test('actual ordered route requires two uninterrupted stopped seconds, correct taxi and a living seated cousin', () => {
  const h = fixture();
  h.start();
  h.board();
  h.acknowledge();
  updateCampaignDirector(h.state.campaign, h.adapters);
  h.acknowledge();
  const car = h.state.vehicles[0];
  h.move(car, at(500, 100), 60);
  h.step();
  assert.equal(h.state.campaignRuntime.night.route.index, 1, 'Dispatch cannot skip the fairground');
  h.move(car, at(300, 100), 60);
  for (let i = 0; i < 20; i++) h.step();
  car.speed = 8;
  h.step();
  car.speed = 0;
  for (let i = 0; i < 30; i++) h.step();
  assert.equal(h.state.campaignRuntime.night.route.index, 1, 'Rolling breaks stopped dwell');
  h.until(() => h.state.campaignRuntime.night.route.index === 2);
  h.move(car, at(500, 100), 60);
  h.step();
  assert.equal(h.state.campaignRuntime.night.route.index, 3);
  assert.deepEqual(
    h.state.campaignRuntime.night.route.stops.map((stop) => stop.id),
    ['pier-berth', 'fairground', 'dispatch'],
  );
});

test('repeated samples with no actual simulation-clock advancement cannot fabricate fairground dwell', () => {
  const h = fixture();
  h.start();
  h.board();
  const car = h.state.vehicles[0];
  h.move(car, at(300, 100), 60);
  for (let i = 0; i < 200; i++) tickCampaignRuntime(h.state, 0.05, h.context);
  assert.equal(h.state.campaignRuntime.night.route.index, 1);
  assert.equal(h.state.campaignRuntime.night.route.dwell, 0);
});

test('shelter dialogue waits for real parking, player room entry and physical companion escort/portal arrival', () => {
  const h = fixture();
  h.toShelter();
  assert.equal(h.state.player.sceneId, 'dockside-rooms');
  assert.equal(passengers.getActor(h.state, FELIX).sceneId, 'dockside-rooms');
  assert.equal(campaignRuntimeView(h.state, h.context).dialogueReady, true);
  h.acknowledge();
  assert.equal(
    updateCampaignDirector(h.state.campaign, h.adapters).waiting,
    'physical-stage-staging',
  );
  assert.equal(campaignRuntimeView(h.state, h.context).choicePending, true);
  assert.equal(
    chooseCampaignOption(h.state.campaign, 'room-response', 'thank-nadia', h.adapters).ok,
    true,
  );
  assert.equal(updateCampaignDirector(h.state.campaign, h.adapters).stageId, 'rest');
  assert(h.state.storyInventory.keys.includes('dockside-tenancy'));
  assert.deepEqual(
    h.state.progress.completed,
    [],
    'Source arrival cannot complete optional onboarding jobs',
  );
});

test('home choices apply real inventory effects or director trust, without inventing later mission support', () => {
  const h = fixture();
  h.toShelter();
  h.acknowledge();
  assert.equal(
    chooseCampaignOption(h.state.campaign, 'room-response', 'thank-nadia', h.adapters).ok,
    true,
  );
  assert.equal(h.state.campaign.trust['LL-CHAR-008'], 1);
  assert.equal(
    chooseCampaignOption(h.state.campaign, 'room-response', 'thank-nadia', h.adapters)
      .alreadyChosen,
    true,
  );
  assert.equal(h.state.campaign.trust['LL-CHAR-008'], 1);
});

test('real finite food/eating, successful candidate persistence and interrupted six-hour rest use actual ledgers', () => {
  const h = fixture();
  h.toRest();
  assert(h.state.storyInventory.evidence.includes('co-op-arrears'));
  h.approach('food');
  const before = h.state.player.health;
  const food = performCampaignService(h.state, 'food', h.context);
  assert.equal(food.pending, true);
  assert.equal(h.state.shelterServices.foodStock, 2);
  assert(h.state.player.health >= before);
  assert.equal(h.state.campaignRuntime.night.services.food, null);
  h.until(() => Boolean(h.state.campaignRuntime.night.services.food));
  h.approach('save');
  const prepared = prepareCampaignSave(h.state, h.context);
  assert.equal(prepared.ok, true);
  assert.equal(h.state.campaignRuntime.night.services.save, null);
  assert(prepared.candidate.campaignRuntime.night.services.save);
  assert.equal(commitCampaignSave(h.state, prepared, { key: 'not-written' }, h.context).ok, false);
  rollbackCampaignSave(h.state, prepared);
  assert.equal(h.state.campaignRuntime.night.services.save, null);
  h.storage.set('save', JSON.stringify(prepared.candidate));
  assert.equal(commitCampaignSave(h.state, prepared, { key: 'save' }, h.context).ok, true);
  h.approach('rest');
  const hours = h.state.calendar.offsetHours;
  assert.equal(performCampaignService(h.state, 'rest', h.context).pending, true);
  h.state.wanted.level = 1;
  h.step();
  assert.equal(h.state.calendar.offsetHours, hours);
  assert.equal(h.state.campaignRuntime.night.services.rest, null);
  assert.equal(h.state.shelterServices.active, null);
});

test('confirmed save candidate survives Continue, and rest completes only after real animation/calendar commit', () => {
  const h = fixture();
  h.toRest();
  h.eatAndSave();
  const saved = JSON.parse(h.storage.get('save'));
  assert.equal(saved.campaignRuntime.night.services.save.kind, 'save');
  assert.equal(validateCampaignRuntime(saved), true);
  assert(
    h.adapters.restoreWorld(
      copy(Object.fromEntries(Object.entries(saved).filter(([key]) => key !== 'campaign'))),
      { reason: 'continue-contract' },
    ).ok,
  );
  assert.equal(
    h.state.campaignRuntime.night.services.save.id,
    saved.campaignRuntime.night.services.save.id,
  );
  h.approach('rest');
  const calendarBefore = worldHours(h.state);
  const result = performCampaignService(h.state, 'rest', h.context);
  assert.equal(result.pending, true);
  for (let i = 0; i < 20; i++) h.step();
  assert.equal(h.state.calendar.offsetHours, 0);
  assert.equal(h.state.campaignRuntime.night.services.rest, null);
  h.until(() => Boolean(h.state.campaignRuntime.night.services.rest));
  assert.equal(h.state.calendar.offsetHours, 6);
  assert(worldHours(h.state) >= calendarBefore + 6);
  assert.equal(updateCampaignDirector(h.state.campaign, h.adapters).completed, 'LL-ST-001');
  assert.equal(h.state.rewardCalls, 1);
  assert.equal(h.state.player.money, 240);
  for (let i = 0; i < 3; i++) updateCampaignDirector(h.state.campaign, h.adapters);
  assert.equal(h.state.rewardCalls, 1);
  assert.equal(h.state.campaign.completed['LL-ST-001'].releaseValidated, false);
  assert(h.state.campaign.unlocks.includes('first-shift'));
  assert.deepEqual(h.state.progress.completed, []);
});

test('an interrupted shelter rest can restart in the same mission attempt and complete once', () => {
  const h = fixture();
  h.toRest();
  h.eatAndSave();
  h.approach('rest');
  const first = performCampaignService(h.state, 'rest', h.context);
  assert.equal(first.pending, true);
  h.state.wanted.level = 1;
  h.step();
  assert.equal(h.state.shelterServices.active, null);
  assert.equal(h.state.campaignRuntime.night.pendingServices.rest, undefined);
  assert.equal(h.state.calendar.offsetHours, 0);

  h.state.wanted.level = 0;
  const restarted = performCampaignService(h.state, 'rest', h.context);
  assert.equal(restarted.pending, true);
  assert.equal(restarted.receipt.id, first.receipt.id);
  h.step();
  assert.ok(
    h.state.campaignRuntime.night.pendingServices.rest,
    'The cancelled action must not discard the replacement rest.',
  );
  h.until(() => Boolean(h.state.campaignRuntime.night.services.rest));
  assert.equal(h.state.calendar.offsetHours, 6);
  assert.equal(updateCampaignDirector(h.state.campaign, h.adapters).completed, 'LL-ST-001');
  assert.equal(h.state.rewardCalls, 1);
});

test('a continued completed rest with a lost campaign observation uses its original calendar receipt', () => {
  const h = fixture();
  h.toRest();
  h.eatAndSave();
  h.approach('rest');
  const first = performCampaignService(h.state, 'rest', h.context);
  h.state.wanted.level = 1;
  h.step();
  const cancellation = copy(h.state.shelterServices.cancelled[first.receipt.id]);
  h.state.wanted.level = 0;
  assert.equal(performCampaignService(h.state, 'rest', h.context).pending, true);
  // Existing-save fixture: the old version retained this cancellation while
  // the replacement physical rest was active, then lost its pending observer.
  h.state.shelterServices.cancelled[first.receipt.id] = cancellation;
  h.step();
  assert.equal(h.state.campaignRuntime.night.pendingServices.rest, undefined);
  h.until(() => h.state.shelterServices.active === null);
  assert.equal(h.state.calendar.offsetHours, 6);
  assert.equal(h.state.campaignRuntime.night.services.rest, null);
  const world = h.adapters.captureWorld();
  assert.equal(h.adapters.restoreWorld(world, { reason: 'continue-contract' }).ok, true);

  const result = performCampaignService(h.state, 'rest', h.context);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(h.state.calendar.offsetHours, 6, 'Recovery must not apply another six hours.');
  assert.equal(h.state.shelterServices.active, null);
  assert.equal(updateCampaignDirector(h.state.campaign, h.adapters).completed, 'LL-ST-001');
  assert.equal(h.state.rewardCalls, 1);
});

test('checkpoints exclude only the director, restore actual bodies/calendar/ledgers in place and emit an input/camera epoch', () => {
  const h = fixture();
  h.start();
  h.board();
  const before = h.adapters.captureWorld();
  assert(!Object.hasOwn(before, 'campaign'));
  assert(before.companions && before.cinematics && before.calendar && before.storyInventory);
  const identity = h.state,
    epoch = h.state.campaignRuntime.restoreEpoch;
  h.state.player.money = 1;
  h.state.vehicles[0].health = 5;
  passengers.damageCompanion(h.state, FELIX, 10, 'damage', h.context.companionContext);
  assert.equal(h.adapters.restoreWorld(before, { reason: 'checkpoint-test' }).ok, true);
  assert.equal(h.state, identity);
  assert.equal(h.state.player.money, 240);
  assert.equal(h.state.vehicles[0].health, 120);
  assert.equal(passengers.getActor(h.state, FELIX).health, 100);
  const view = campaignRuntimeView(h.state, h.context);
  assert(view.restoreEpoch > epoch);
  assert.equal(view.cameraEpoch, view.inputEpoch);
  const recursive = { ...before, campaign: h.state.campaign };
  assert.equal(h.adapters.validateWorld(recursive), false);
});

test('actual death/failure and retry preserve prior world data without reviving an existing actor by activation', () => {
  const h = fixture();
  h.start();
  h.board();
  h.state.vehicles[0].health = 0;
  h.step();
  assert.equal(updateCampaignDirector(h.state.campaign, h.adapters).failed, true);
  const retried = retryCampaignMission(h.state.campaign, h.adapters);
  assert.equal(retried.ok, true, JSON.stringify(retried));
  assert.equal(h.state.vehicles[0].health, 120);
  assert.equal(h.state.campaign.active.stageId, 'taxi');
  assert(h.state.campaign.history.some((entry) => entry.event === 'mission-failed'));
});

test('full restart binds its lifecycle effect to the real director request before physical stage activation', () => {
  const h = fixture();
  h.start();
  h.board();
  h.state.vehicles[0].health = 0;
  h.step();
  assert.equal(updateCampaignDirector(h.state.campaign, h.adapters).failed, true);
  const result = retryCampaignMission(h.state.campaign, h.adapters, { mode: 'restart-mission' });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(h.state.campaign.active.stageId, 'berth');
  assert.equal(h.state.campaign.active.attempt, 2);
  assert.equal(h.state.vehicles[0].health, 120);
  assert(h.state.campaignRuntime.night.cinematics.berth);
  assert.equal(h.state.rewardCalls, 0);
  assert.equal(validateCampaignRuntime(h.state), true);
});

test('a forged restart lifecycle request cannot bypass physical/world restoration or grant an action scope', () => {
  const h = fixture();
  h.start();
  const before = JSON.stringify(h.state);
  const result = h.adapters.applyActions(
    [
      {
        type: 'mission-restarted',
        missionId: 'LL-ST-001',
        preserveCompleted: [],
        preserveOnboarding: [],
      },
    ],
    {
      contentId: h.state.campaign.contentId,
      missionId: 'LL-ST-001',
      stageId: 'berth',
      attempt: 2,
      kind: 'restart',
      receipt: `campaign:${h.state.campaign.contentFingerprint}:LL-ST-001:attempt:2:restart`,
    },
  );
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(h.state), before);
});

test('discontinuous driver state is an unmet observation rather than a skipped road trip', () => {
  const h = fixture();
  h.start();
  h.board();
  h.acknowledge();
  updateCampaignDirector(h.state.campaign, h.adapters);
  h.acknowledge();
  h.state.vehicles[0].x = 500;
  h.state.player.x = 500;
  h.step();
  assert(h.state.campaignRuntime.night.route.discontinuity);
  assert.deepEqual(updateCampaignDirector(h.state.campaign, h.adapters).unmet, [
    'route-stops:route-observation-discontinuous',
  ]);
  assert.equal(h.state.campaign.active.stageId, 'drill');
});

test('a declining parent service cannot leave partial physical health, stock or receipt mutations', () => {
  const h = fixture();
  h.toRest();
  h.approach('food');
  const health = h.state.player.health,
    stock = h.state.shelterServices.foodStock,
    epoch = h.state.campaignRuntime.restoreEpoch;
  h.context.services.handlers.food = (state) => {
    state.player.health = 1;
    state.shelterServices.foodStock = 0;
    return { ok: false };
  };
  assert.equal(performCampaignService(h.state, 'food', h.context).ok, false);
  assert.equal(h.state.player.health, health);
  assert.equal(h.state.shelterServices.foodStock, stock);
  assert.equal(h.state.campaignRuntime.night.services.food, null);
  assert(h.state.campaignRuntime.restoreEpoch > epoch);
});

test('abandoning a pending bed action cancels the real service before any six-hour calendar receipt', () => {
  const h = fixture();
  h.toRest();
  h.eatAndSave();
  h.approach('rest');
  assert.equal(performCampaignService(h.state, 'rest', h.context).pending, true);
  assert.equal(abandonCampaignMission(h.state.campaign, h.adapters).ok, true);
  for (let i = 0; i < 80; i++) h.step();
  assert.equal(h.state.calendar.offsetHours, 0);
  assert.equal(h.state.shelterServices.active, null);
  assert.deepEqual(Object.keys(h.state.campaign.completed), []);
  assert.equal(h.state.rewardCalls, 0);
});

test('tampered or stale candidate saves never mark the live shelter objective confirmed', () => {
  const h = fixture();
  h.toRest();
  h.approach('food');
  performCampaignService(h.state, 'food', h.context);
  h.until(() => Boolean(h.state.campaignRuntime.night.services.food));
  h.approach('save');
  const prepared = prepareCampaignSave(h.state, h.context),
    tampered = copy(prepared);
  tampered.candidate.player.money = 999;
  assert.equal(commitCampaignSave(h.state, tampered, { key: 'save' }, h.context).ok, false);
  h.storage.set('save', JSON.stringify(prepared.candidate));
  h.step();
  assert.equal(commitCampaignSave(h.state, prepared, { key: 'save' }, h.context).ok, false);
  assert.equal(h.state.campaignRuntime.night.services.save, null);
  assert.equal(h.state.player.money, 240);
});

test('malformed ordered route and service receipts reject before a physical checkpoint restore', () => {
  const h = fixture();
  h.start();
  h.board();
  const valid = h.adapters.captureWorld();
  const bad = copy(valid);
  bad.campaignRuntime.night.route.index = 3;
  assert.equal(h.adapters.validateWorld(bad), false);
  const badService = copy(valid);
  badService.campaignRuntime.night.services.food = {
    id: 'fake',
    kind: 'food',
    status: 'committed',
    scope: {},
  };
  assert.equal(h.adapters.validateWorld(badService), false);
  const before = h.state.player.money;
  assert.equal(h.adapters.restoreWorld(badService, { reason: 'invalid-save' }).ok, false);
  assert.equal(h.state.player.money, before);
});
