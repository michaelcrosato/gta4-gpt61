import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORLD,
  TERRAIN,
  VEHICLE_SPECS,
  createSimulation,
  saveGame,
  restoreGame,
} from '../src/simulation.js';
import { createSceneContext } from '../src/scene-context.js';
import { findLocalFootPath } from '../src/local-navigation.js';
import { enterInterior } from '../src/interiors.js';
import * as companions from '../src/companions.js';
import { createCampaignPhysicalContext } from '../src/campaign/physical-context.js';
import {
  createCampaignParentContext,
  validateCampaignParentState,
} from '../src/campaign/parent-context.js';
import {
  initializeCampaignRuntime,
  createCampaignAdapters,
  tickCampaignRuntime,
  campaignRuntimeView,
  NIGHT_CROSSING_CINEMATICS,
} from '../src/campaign/runtime.js';
import {
  createCampaignDirector,
  startCampaignMission,
  advanceCampaignDialogue,
  currentCampaignDialogue,
  updateCampaignDirector,
} from '../src/campaign/director.js';
import {
  tickCinematics,
  cinematicFinished,
  validateCinematics,
} from '../src/campaign/cinematics.js';
import {
  subtitleLine,
  presentSubtitle,
  tickSubtitles,
  validateSubtitles,
} from '../src/campaign/subtitles.js';
import {
  applyStoryInventoryEffect,
  tickShelterServices,
  shelterReceipt,
} from '../src/campaign/shelter-services.js';
import { FIRST_ARC_MISSIONS } from '../src/campaign/first-arc.js';

// Actual authored city/room/vehicle collision and production modules. Scene-entry
// positions and in-memory storage are explicitly declared component fixtures;
// these tests are not browser input or a natural full campaign playthrough.
const copy = (value) => JSON.parse(JSON.stringify(value));
const bindings = WORLD.campaignSceneBindings;
const FELIX = 'LL-CHAR-002',
  NADIA = 'LL-CHAR-008';
function fixture({ home = false, ready = true } = {}) {
  const state = createSimulation(61);
  state.mission = null;
  state.dialogue = null;
  initializeCampaignRuntime(state);
  state.campaign = createCampaignDirector();
  state.campaignMode = 'story';
  Object.assign(state.player, bindings['pier-berth'].playerSpawn, {
    sceneId: null,
    vehicleId: null,
  });
  const scenes = createSceneContext(WORLD, TERRAIN),
    storage = new Map();
  let parent;
  const actor = (id) =>
    id === 'player' || id === 'LL-CHAR-001' ? state.player : companions.getActor(state, id);
  const physical = createCampaignPhysicalContext(state, {
    world: WORLD,
    terrain: TERRAIN,
    specs: VEHICLE_SPECS,
    scenes,
    localPath: findLocalFootPath,
    scriptControlled(body) {
      const active = state.cinematics?.active;
      return Boolean(
        active &&
        parent?.cinematicContext
          .sequence(active.id)
          ?.phases[active.phase].tracks.some((track) => track.actorId === body.id),
      );
    },
  });
  const engine = {
    world: WORLD,
    terrain: TERRAIN,
    bindings,
    specs: VEHICLE_SPECS,
    companionContext: physical,
    actor,
    moveActor: (id, dx, dy, radius) => physical.moveBody(actor(id), dx, dy, radius),
    ready: ready ? { passengers: true, interior: true, shelter: true, cinematic: true } : {},
    canRest: (s) =>
      s.wanted.level === 0 &&
      s.player.health > 0 &&
      !s.hostiles.some((body) => body.health > 0 && body.sceneId === 'dockside-rooms'),
    confirmStorage: (s, candidate, receipt, proof) =>
      proof?.key === 'save' && storage.get('save') === saveGame(candidate),
    notify: () => {},
    snapshots: {
      capture: (s) =>
        copy(Object.fromEntries(Object.entries(s).filter(([key]) => key !== 'campaign'))),
      validate(snapshot) {
        try {
          restoreGame(
            { format: 'lowlight-save', version: snapshot.version, state: snapshot },
            { physicalOnly: true },
          );
          validateCampaignParentState(snapshot);
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
  parent = createCampaignParentContext(state, engine);
  if (home) {
    applyStoryInventoryEffect(
      state,
      { type: 'grant-key', id: 'dockside-tenancy' },
      'fixture:home-key',
    );
    Object.assign(state.player, bindings['dockside-rooms'].entry, {
      groundZ: 0,
      vehicleId: null,
      sceneId: null,
    });
    assert.equal(enterInterior(state, 'dockside-rooms-entry', { world: WORLD }).ok, true);
    companions.ensureNamedActor(
      state,
      {
        id: FELIX,
        name: 'Felix Voss',
        x: 150,
        y: 150,
        z: 0,
        sceneId: 'dockside-rooms',
        health: 100,
      },
      physical,
    );
    companions.ensureNamedActor(
      state,
      {
        id: NADIA,
        name: 'Nadia Sol',
        ...bindings['dockside-rooms'].actorSpawns.nadia,
        health: 100,
      },
      physical,
    );
  }
  const adapters = createCampaignAdapters(state, parent);
  function step(dt = 0.05) {
    state.time += dt;
    companions.updateCompanions(state, dt, physical);
    tickCinematics(state, dt, parent.cinematicContext);
    tickShelterServices(state, dt, { canRest: engine.canRest });
    parent.syncSceneProps();
    tickCampaignRuntime(state, dt, parent);
  }
  function until(predicate, limit = 2500) {
    for (let i = 0; i < limit && !predicate(); i++) step();
    assert(
      predicate(),
      JSON.stringify({
        cinematic: state.cinematics,
        felix: actor(FELIX),
        player: state.player,
        runtime: state.campaignRuntime.active,
      }),
    );
  }
  return { state, parent, engine, adapters, actor, physical, storage, step, until };
}

test('factory remains explicitly unready without root integration flags', () => {
  const h = fixture({ ready: false });
  assert.deepEqual(h.parent.ready, {
    passengers: false,
    interior: false,
    shelter: false,
    cinematic: false,
  });
  assert.equal(startCampaignMission(h.state.campaign, 'LL-ST-001', h.adapters).ok, false);
});

test('actual arrival taxi uses the production vehicle schema, ownership and authorized-driver provenance', () => {
  const h = fixture();
  const definition = {
    ...bindings['pier-berth'].taxiSpawn,
    id: 'arc-arrival-taxi',
    spec: 'taxi',
    kind: 'mission',
    ownership: 'cooperative',
    owned: true,
  };
  assert.equal(h.parent.vehicles.ensure(h.state, definition).ok, true);
  const car = h.state.vehicles.find((body) => body.id === definition.id);
  assert.equal(car.kind, 'parked');
  assert.equal(car.missionVehicle, true);
  assert.equal(car.owned, true);
  assert.equal(car.ownership, 'cooperative');
  assert(car.authorizedDrivers.includes('mara-voss'));
  assert.doesNotThrow(() => restoreGame(saveGame(h.state)));
  car.health = 3;
  h.parent.vehicles.ensure(h.state, definition);
  assert.equal(car.health, 3, 'Re-entry never heals/recreates an existing taxi');
});

test('full authored ferry/gangway reunion physically completes and slow manual dialogue never races a departure', () => {
  const h = fixture();
  const started = startCampaignMission(h.state.campaign, 'LL-ST-001', h.adapters);
  assert.equal(started.ok, true, JSON.stringify(started));
  assert.equal(
    campaignRuntimeView(h.state, h.parent).dialogueReady,
    false,
    'Bag handling is not a prematurely visible reunion',
  );
  h.until(() => cinematicFinished(h.state, NIGHT_CROSSING_CINEMATICS.berth));
  const reunion = bindings['pier-berth'].target,
    mara = h.state.player,
    felix = h.actor(FELIX);
  assert(Math.hypot(mara.x - reunion.x, mara.y - reunion.y) < 0.4);
  assert(Math.hypot(mara.x - felix.x, mara.y - felix.y) >= 14, 'Final actor marks do not overlap');
  assert.equal(h.state.campaignRuntime.sceneProps['arrival-duffel'].carrierId, FELIX);
  let lines = 0;
  while (currentCampaignDialogue(h.state.campaign, h.adapters).line) {
    for (let i = 0; i < 160; i++) h.step();
    assert.equal(campaignRuntimeView(h.state, h.parent).dialogueReady, true);
    assert.equal(updateCampaignDirector(h.state.campaign, h.adapters).waiting, 'dialogue');
    advanceCampaignDialogue(h.state.campaign, h.adapters);
    lines++;
  }
  assert.equal(lines, 5);
  assert.equal(updateCampaignDirector(h.state.campaign, h.adapters).stageId, 'taxi');
  h.until(() => Boolean(companions.getSeat(h.state, FELIX)));
  assert.equal(companions.getSeat(h.state, FELIX).vehicleId, 'arc-arrival-taxi');
  assert.equal(
    h.state.campaignRuntime.sceneProps['arrival-duffel'].visible,
    false,
    'The physically carried bag goes inside the genuinely occupied taxi',
  );
  validateCinematics(h.state, h.parent.cinematicContext);
  validateCampaignParentState(h.state);
});

test('ambient cannot finish until the real subtitle line has been presented, then duration/ack is saved', () => {
  const h = fixture(),
    lines = FIRST_ARC_MISSIONS[0].stages.find((stage) => stage.id === 'drill').ambient;
  const receipt = 'test:ambient';
  assert.equal(
    h.parent.cinematics.start(h.state, NIGHT_CROSSING_CINEMATICS.ambient, { receipt, lines }).ok,
    true,
  );
  for (let i = 0; i < 400; i++) tickSubtitles(h.state, 0.1);
  assert.equal(
    h.parent.cinematics.isFinished(h.state, NIGHT_CROSSING_CINEMATICS.ambient, receipt),
    false,
  );
  assert.equal(h.state.subtitles.active.elapsed, 0);
  const shown = subtitleLine(h.state);
  assert.equal(shown.text, lines[0].text);
  assert.equal(presentSubtitle(h.state, shown.receipt, shown.index), true);
  for (let i = 0; i < 100; i++) {
    h.state.time += 0.1;
    tickSubtitles(h.state, 0.1);
  }
  assert.equal(
    h.parent.cinematics.isFinished(h.state, NIGHT_CROSSING_CINEMATICS.ambient, receipt),
    true,
  );
  assert(h.state.subtitles.completed[receipt].history[0].visibleSeconds >= 2);
  validateSubtitles(h.state);
});

test('home uses actual props/vehicle-aware paths, saves its planned configuration and delivers the real bag', () => {
  const h = fixture({ home: true });
  const bag = h.state.campaignRuntime.sceneProps['arrival-duffel'];
  bag.carrierId = FELIX;
  h.parent.syncSceneProps();
  Object.assign(h.state.player, { x: 164, y: 167 }); // Declared wardrobe-side scene-entry fixture.
  const receipt = 'test:home-reveal';
  assert.equal(
    h.parent.cinematics.start(h.state, NIGHT_CROSSING_CINEMATICS.shelter, { receipt }).ok,
    true,
  );
  const before = JSON.stringify(h.state.campaignEffects.cinematicConfigs[receipt]);
  h.until(() => cinematicFinished(h.state, NIGHT_CROSSING_CINEMATICS.shelter, receipt));
  assert.equal(
    JSON.stringify(h.state.campaignEffects.cinematicConfigs[receipt]),
    before,
    'Moving actor positions never rehash/replan the active definition',
  );
  assert.equal(bag.delivered, true);
  assert.equal(bag.carrierId, null);
  assert.equal(bag.sceneId, 'dockside-rooms');
  assert.equal(bag.x, bindings['dockside-rooms'].duffelDrop.x);
  assert(
    Math.hypot(h.actor(FELIX).x - h.state.player.x, h.actor(FELIX).y - h.state.player.y) >= 14,
  );
  assert(
    Math.hypot(h.actor(NADIA).x - h.actor(FELIX).x, h.actor(NADIA).y - h.actor(FELIX).y) >= 14,
  );
  validateCampaignParentState(h.state);
  validateCinematics(h.state, h.parent.cinematicContext);
});

test('actual companion arrival exactly at the authored eighteen-unit radius begins reveal without moving the marker or actor', () => {
  const h = fixture({ home: true }),
    target = bindings['dockside-rooms'].felixTarget,
    felix = h.actor(FELIX);
  h.physical.moveBody(felix, 162 - felix.x, 134 - felix.y, 7);
  assert(Math.abs(Math.hypot(felix.x - target.x, felix.y - target.y) - 18) < 1e-9);
  assert.equal(companions.requestEscort(h.state, FELIX, target, h.physical).ok, true);
  h.step();
  assert.equal(companions.companionObservation(h.state, FELIX).arrived, true);
  const before = { x: felix.x, y: felix.y };
  const stage = FIRST_ARC_MISSIONS[0].stages.find((entry) => entry.id === 'shelter');
  assert.equal(
    h.adapters.activateStage(stage, {
      missionId: 'LL-ST-001',
      stageId: 'shelter',
      attempt: 1,
      receipt: 'test:exact-home-arrival',
      reason: 'declared-stage-fixture',
    }).ok,
    true,
  );
  h.step();
  assert(h.state.campaignRuntime.night.cinematics.shelter);
  assert.equal(target.radius, 18);
  assert.deepEqual({ x: felix.x, y: felix.y }, before);
});

test('save candidate is isolated; only verified actual parent storage commits its live ledger', () => {
  const h = fixture({ home: true }),
    hook = bindings['dockside-rooms'].hooks.save;
  Object.assign(h.state.player, { x: hook.x, y: hook.y }); // Declared service approach fixture.
  const candidate = copy(h.state),
    request = { id: 'test:save', hookId: hook.id };
  const prepared = h.parent.services.prepareSave(candidate, request);
  assert.equal(prepared.ok, true);
  assert.equal(shelterReceipt(h.state, request.id), null);
  assert.equal(
    h.parent.services.confirmSaved(h.state, candidate, prepared.receipt, { key: 'save' }),
    false,
  );
  assert.equal(shelterReceipt(h.state, request.id), null);
  h.storage.set('save', saveGame(candidate));
  assert.equal(
    h.parent.services.confirmSaved(h.state, candidate, prepared.receipt, { key: 'save' }),
    true,
  );
  assert.equal(shelterReceipt(h.state, request.id).kind, 'save');
});

test('real food stock/animation and wardrobe/evidence ledgers have no synthetic completion callbacks', () => {
  const h = fixture({ home: true }),
    home = bindings['dockside-rooms'];
  const food = home.hooks.food;
  Object.assign(h.state.player, { x: food.x, y: food.y, health: 50 });
  const result = h.parent.services.handlers.food(h.state, { id: 'test:food' });
  assert.equal(result.pending, true);
  assert.equal(h.state.shelterServices.foodStock, 2);
  assert.equal(h.state.player.health, 75);
  assert.equal(h.parent.services.verifyReceipt(h.state, result.receipt), false);
  for (let i = 0; i < 30; i++) h.step();
  assert.equal(h.parent.services.verifyReceipt(h.state, result.receipt), true);
  Object.assign(h.state.player, { x: home.hooks.wardrobe.x, y: home.hooks.wardrobe.y });
  assert.equal(h.parent.services.handlers.wardrobe(h.state, { id: 'test:wardrobe' }).ok, true);
  assert(h.state.wardrobe.owned.includes('co-op-workwear'));
  assert(h.state.wardrobe.owned.includes('shore-knit'));
  Object.assign(h.state.player, { x: home.hooks.evidence.x, y: home.hooks.evidence.y });
  assert.equal(h.parent.services.handlers.evidence(h.state, { id: 'test:ledger' }).ok, true);
  assert(h.state.storyInventory.evidence.includes('co-op-arrears'));
});

test('factory rejects unearned story reward and corrupt prop/config receipts', () => {
  const h = fixture();
  const before = h.state.player.money;
  const result = h.parent.effects.handlers['campaign-reward'](
    h.state,
    { type: 'campaign-reward', rewards: FIRST_ARC_MISSIONS[0].rewards },
    { id: 'test:premature-reward', scope: { missionId: 'LL-ST-001' } },
  );
  assert.equal(result.ok, false);
  assert.equal(h.state.player.money, before);
  assert.equal(Object.keys(h.state.campaignEffects.receipts).length, 0);
  const bad = copy(h.state);
  bad.campaignRuntime.sceneProps['arrival-duffel'].carrierId = 'fake';
  assert.throws(() => validateCampaignParentState(bad), /duffel/);
  const empty = fixture();
  empty.state.campaignRuntime.sceneProps = {};
  createCampaignParentContext(empty.state, empty.engine);
  assert.deepEqual(
    empty.state.campaignRuntime.sceneProps,
    {},
    'Explicit missing/destroyed bag never silently respawns',
  );
});
