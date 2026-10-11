/** Explicit native-component setup. Genuine completed0.6 bodies/economy retained;
 * no full M3, original browser journey or source-credit claim. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import {
  restoreGame,
  saveGame,
  updateSimulation,
  WORLD,
  VEHICLE_SPECS,
  scenePeople,
  createSimulationCampaignAdapters,
  setCampaignObservationHandlers,
} from '../../src/simulation.js';
import { createSceneContext } from '../../src/scene-context.js';
import { createTerrain } from '../../src/terrain.js';
import { createCampaignPhysicalContext } from '../../src/campaign/physical-context.js';
import { findLocalFootPath } from '../../src/local-navigation.js';
import { INTERIOR_LAYOUTS, PORTAL_DEFINITIONS, enterInterior } from '../../src/interiors.js';
import * as Companions from '../../src/companions.js';
import { startActorMelee, hitCombatant, validateCombatSave } from '../../src/combat.js';
import { FIRST_ARC_MISSIONS } from '../../src/campaign/first-arc.js';
import { startCampaignMission, validateCampaignDirector } from '../../src/campaign/director.js';
import { createTwoSeatsScenePlan } from '../../src/campaign/two-seats-scenes.js';
import {
  initializeTwoSeatsRuntime,
  createTwoSeatsAdapters,
  observeTwoSeatsDamage,
  validateTwoSeatsRuntime,
} from '../../src/campaign/two-seats-runtime.js';
import {
  createTwoSeatsParentContext,
  twoSeatsWristView,
  validateTwoSeatsParentState,
} from '../../src/campaign/two-seats-parent-context.js';
const copy = (v) => JSON.parse(JSON.stringify(v)),
  F = 'LL-CHAR-002',
  N = 'LL-CHAR-008',
  D = 'LL-ARC-DAX';
const original = gunzipSync(
  fs.readFileSync(new URL('../fixtures/campaign-0.6-completed-save.json.gz', import.meta.url)),
).toString();
const plan = createTwoSeatsScenePlan(WORLD),
  terrain = createTerrain(WORLD),
  scenes = createSceneContext(WORLD, terrain);
function loaded() {
  return restoreGame(original);
}
export function fixture({ combat = false, restoredState = null } = {}) {
  const s = restoredState ?? loaded(),
    health = {
      felix: Companions.getActor(s, F).health,
      nadia: Companions.getActor(s, N).health,
      money: s.player.money,
    };
  if (!restoredState) s.campaignMode = 'legacy';
  if (combat && !restoredState) {
    // Declared ONLY initial Mara room/duel pose; existing Felix/Nadia are never relocated/healed.
    Object.assign(s.player, {
      x: 458,
      y: 700,
      z: 0,
      groundZ: 0,
      vehicleId: null,
    });
    assert.equal(enterInterior(s, 'voss-dispatch-entry', { world: WORLD }).ok, true);
    Object.assign(s.player, { x: 198, y: 40, angle: Math.PI });
  }
  const cc = createCampaignPhysicalContext(s, {
    world: WORLD,
    terrain,
    specs: VEHICLE_SPECS,
    scenes,
    localPath: findLocalFootPath,
  });
  const native = createSimulationCampaignAdapters(s);
  const validateSnapshot = (world) => {
    try {
      if (native.validateWorld(world) !== true) {
        try {
          restoreGame(
            { format: 'lowlight-save', version: 1, state: world },
            { physicalOnly: true },
          );
        } catch (e) {
          console.error('Native physical validation:', e.message);
        }
        return false;
      }
      validateCombatSave(world, WORLD);
      Companions.validateCompanions(world, cc);
      validateTwoSeatsRuntime(world);
      validateTwoSeatsParentState(world);
      return true;
    } catch {
      return false;
    }
  };
  const authored = copy(FIRST_ARC_MISSIONS[2]);

  const b = copy(plan.bindings);
  b['pier-goods'].felixServiceMark = {
    x: 170,
    y: 186,
    z: 0,
    sceneId: 'pier-goods',
    radius: 8,
  };
  b['pier-goods'].clerkServiceMark = {
    x: 170,
    y: 156,
    z: 0,
    sceneId: 'pier-goods',
    radius: 8,
  };
  b['pier-goods'].clerkWalk = [
    { x: 132, y: 24, z: 0 },
    { x: 170, y: 80, z: 0 },
    { x: 170, y: 156, z: 0 },
  ];
  let parent;
  const ctx = {
    sceneId: 'voss-dispatch',
    handImpairment: (actor) => twoSeatsWristView(s, actor.id),
    combatants: () => scenePeople(s, 'voss-dispatch'),
    hasLineOfSight: (a, b) => scenes.sight(s, a, b, 'voss-dispatch'),
    id: (prefix) => `${prefix}-${++s.sequence}`,
    notify() {},
    onDamage: (e) => observeTwoSeatsDamage(s, e, parent),
  };
  const engine = {
    world: WORLD,
    bindings: b,
    sceneReport: plan.report,
    specs: VEHICLE_SPECS,
    companionContext: cc,
    authoredMission: authored,
    actorDefinitions: Object.values(plan.newActors),
    rooms: {
      hasRoom: (id) => !!INTERIOR_LAYOUTS[id],
      hasPortal: (id) => PORTAL_DEFINITIONS.some((x) => x.id === id),
      layout: (id) => INTERIOR_LAYOUTS[id] ?? plan.rooms[id],
    },
    ready: { disarm: combat, friendship: true },
    disarmObserverBound: combat,
    damageObserverBound: combat,
    isCivilian: (s, a) => ![D, 'LL-ARC-PEL'].includes(a.id),
    damageActor: (s, id, n, cause) => {
      hitCombatant(s, Companions.getActor(s, id), n, cause.owner, ctx, cause.kind);
      return { ok: true };
    },
    snapshots: {
      capture: (s) => {
        const w = copy(s);
        delete w.campaign;
        return w;
      },
      validate: validateSnapshot,
      restore: (s, w) => {
        const d = s.campaign;
        for (const k of Object.keys(s)) delete s[k];
        Object.assign(s, copy(w), { campaign: d });
        return { ok: true };
      },
    },
  };
  parent = createTwoSeatsParentContext(s, engine);
  return { s, parent, engine, cc, health, ctx, authored, native };
}
/** Read-only telemetry before delegating the real production injury observer.
 * Callback registration stays outside saved state. No product handler is suppressed.
 */
export function captureProductionDisarm(state) {
  const observed = { boundary: null, disarms: [], damage: [], attacks: [] };
  let previous;
  const wrapped = {
    disarm(receipt) {
      observed.disarms.push(copy(receipt));
      assert.equal(observed.boundary, null, 'one actual committed native disarm boundary');
      observed.boundary = Object.freeze({
        bytes: saveGame(state),
        receipt: copy(receipt),
      });
      return previous.disarm(receipt);
    },
    damage(event) {
      observed.damage.push(copy(event));
      return previous.damage?.(event);
    },
    attack(event) {
      observed.attacks.push(copy(event));
      return previous.attack?.(event);
    },
  };
  previous = setCampaignObservationHandlers(state, 'LL-ST-003', wrapped);
  assert.equal(typeof previous?.disarm, 'function', 'production M3 disarm observer is bound');
  assert.equal(typeof previous?.damage, 'function', 'production M3 damage observer is bound');
  previous = Object.freeze(previous);
  let stopped = false;
  return {
    observed,
    stop() {
      if (stopped) return;
      stopped = true;
      setCampaignObservationHandlers(state, 'LL-ST-003', previous);
    },
  };
}
export function ownThreat(f) {
  // Declared metadata-only native-component owner. The REAL pure director creates
  // its attempt/checkpoint/receipt from the unchanged published catalogue. This
  // adapter cannot observe/complete objectives, reward, retreat, or bypass the
  // production M3 readiness gates; no dialogue is acknowledged by this setup.
  const mission = FIRST_ARC_MISSIONS[2],
    start = mission.stages[0],
    exact = (a, b) => JSON.stringify(a) === JSON.stringify(b),
    adapters = {
      ...f.native,
      supportsMission: (id, definition) => id === mission.id && exact(definition, mission),
      capabilitiesForMission: (id) =>
        id === mission.id
          ? Object.fromEntries(mission.requiredCapabilities.map(({ id }) => [id, true]))
          : {},
      supportsStage: (type, stage) => type === start.type && exact(stage, start),
      supportsCondition: () => false,
      observe: () => ({
        unmet: 'declared-component-has-no-objective-observations',
      }),
      supportsAction: () => false,
      applyActions: () => ({
        ok: false,
        unmet: 'declared-component-has-no-effects',
      }),
      validateWorld: f.engine.snapshots.validate,
      activateStage: (stage, request) => {
        assert(exact(stage, start));
        assert.equal(request.missionId, mission.id);
        assert.equal(request.reason, 'start');
        const m = initializeTwoSeatsRuntime(f.s);
        m.active = {
          missionId: request.missionId,
          stageId: stage.id,
          attempt: request.attempt,
          receipt: request.receipt,
          startedAt: f.s.time,
          phase: 'running',
          blocked: null,
        };
        m.run.startedAt = f.s.time;
        m.activations[request.receipt] = {
          scope: {
            missionId: request.missionId,
            stageId: stage.id,
            attempt: request.attempt,
            activationReceipt: request.receipt,
          },
          at: f.s.time,
        };
        return { ok: true };
      },
    };
  const result = startCampaignMission(f.s.campaign, mission.id, adapters);
  assert.equal(result.ok, true, JSON.stringify(result));
  validateCampaignDirector(f.s.campaign, f.native);
  assert.equal(f.s.campaign.active.dialogue.index, 0);
  assert.deepEqual(f.s.campaign.active.completedStages, []);
  assert.equal(createTwoSeatsAdapters(f.s, f.parent).supportsMission(mission.id, mission), false);
  const m = initializeTwoSeatsRuntime(f.s);
  assert.equal(f.s.campaign.receipts[m.active.receipt].kind, 'stage-activation');
  return m;
}
export function guardedDisarm({ daxHealth = 100 } = {}) {
  const f = fixture({ combat: true }),
    m = ownThreat(f),
    dax = Companions.ensureNamedActor(
      f.s,
      {
        ...plan.newActors['LL-ARC-DAX'],
        name: 'Dax Lorne',
        health: daxHealth,
        angle: 0,
      },
      f.cc,
    );
  // Dax's initial health is a declared native-component condition. Every combat
  // change below comes from the real attack command and public simulation input.
  assert.equal(f.ctx.hasLineOfSight(dax, f.s.player), true);
  assert.equal(startActorMelee(f.s, dax, 'knife', f.ctx), true);
  for (let n = 0; n < 90 && !f.s.player.counterWindow; n++)
    updateSimulation(f.s, 1 / 60, { block: true, aimAngle: Math.PI });
  assert(
    f.s.player.counterWindow,
    `real guard must establish actual counter proof: ${JSON.stringify({
      playerPose: { x: f.s.player.x, y: f.s.player.y, z: f.s.player.z },
      daxPose: { x: dax.x, y: dax.y, z: dax.z },
      action: dax.meleeAction,
      activeRoom: f.s.interior.active?.roomId,
    })}`,
  );
  assert.equal(f.s.player.health, 100);
  const capture = captureProductionDisarm(f.s);
  try {
    updateSimulation(f.s, 1 / 60, {
      block: true,
      disarm: true,
      aimAngle: Math.PI,
    });
  } finally {
    capture.stop();
  }
  assert.equal(dax.weapon, 'unarmed');
  const injury = f.s.twoSeatsRuntime.run.injury;
  assert.equal(
    dax.health,
    Math.max(0, daxHealth - 8),
    'live production injury commits exact damage',
  );
  assert.equal(injury.damageRequested, 8);
  assert.equal(injury.damageApplied, Math.min(8, daxHealth));
  assert.equal(injury.healthBefore, daxHealth);
  assert.equal(injury.healthAfter, Math.max(0, daxHealth - 8));
  assert.equal(injury.fatal, daxHealth <= 8);
  assert.equal(capture.observed.disarms.length, 1);
  assert.equal(capture.observed.damage.filter((e) => e.kind === 'guard-disarm-wrist').length, 1);
  assert.equal(
    f.s.twoSeatsRuntime.run.damageEvents.filter((e) => e.kind === 'guard-disarm-wrist').length,
    1,
  );
  assert.equal(dax.disarmReceipt.targetId, D);
  assert.deepEqual(dax.disarmReceipt, f.s.player.lastDisarm);
  assert(capture.observed.boundary);
  return { ...f, m, dax, capturedDisarm: capture.observed };
}
/** A NEW explicitly restored component fixture, never a rewind/heal of live.s.
 * Production save bytes precede authored injury but include the actual committed
 * native drop, stamina cost and disarm proof. Custom parents bind this new state.
 */
export function restoreDisarmBoundary(live) {
  const boundary = live.capturedDisarm.boundary,
    liveBefore = saveGame(live.s),
    saved = JSON.parse(boundary.bytes).state,
    restored = restoreGame(boundary.bytes),
    beforeBinding = copy({
      time: restored.time,
      player: restored.player,
      companions: restored.companions,
      campaign: restored.campaign,
    }),
    f = fixture({ combat: true, restoredState: restored }),
    dax = Companions.getActor(restored, D);
  assert.notEqual(restored, live.s);
  assert.notEqual(dax, live.dax);
  assert.equal(restored.time, saved.time);
  assert.equal(dax.health, boundary.receipt.targetHealth);
  assert.equal(restored.twoSeatsRuntime.run.injury, null);
  assert.deepEqual(dax.disarmReceipt, boundary.receipt);
  assert.deepEqual(restored.player.lastDisarm, boundary.receipt);
  assert.equal(live.dax.health, Math.max(0, boundary.receipt.targetHealth - 8));
  assert.deepEqual(
    {
      time: restored.time,
      player: restored.player,
      companions: restored.companions,
      campaign: restored.campaign,
    },
    beforeBinding,
    'rebuilding component contexts cannot edit pose, health, clock, bodies or director',
  );
  assert.equal(saveGame(live.s), liveBefore, 'restoring a new fixture cannot rewind the live run');
  return {
    ...f,
    m: restored.twoSeatsRuntime,
    dax,
    live,
    fixtureBoundary: 'NEW restored valid save at committed native disarm before authored injury',
  };
}
