/** Native component tests; genuine live production injury and NEW restored
 * pre-injury save fixtures are distinct. No live healing or gameplay bypass. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { updateSimulation, WORLD } from '../src/simulation.js';
import * as Companions from '../src/companions.js';
import { applyRestHours, initializeCalendar } from '../src/calendar.js';
import { FIRST_ARC_MISSIONS } from '../src/campaign/first-arc.js';
import { FIRST_ARC_06_CONTENT } from '../src/campaign/history/first-arc-0.6.js';
import { validateCampaignDirector } from '../src/campaign/director.js';
import { createTwoSeatsScenePlan } from '../src/campaign/two-seats-scenes.js';
import {
  initializeTwoSeatsRuntime,
  createTwoSeatsAdapters,
  twoSeatsIntegrationGates,
  prepareTwoSeatsStart,
  observeTwoSeatsDisarm,
  observeTwoSeatsDamage,
  validateTwoSeatsRuntime,
} from '../src/campaign/two-seats-runtime.js';
import {
  twoSeatsWristView,
  validateTwoSeatsParentState,
} from '../src/campaign/two-seats-parent-context.js';
import {
  fixture,
  guardedDisarm,
  restoreDisarmBoundary,
} from './helpers/two-seats-native-fixture.mjs';
const copy = (v) => JSON.parse(JSON.stringify(v)),
  F = 'LL-CHAR-002',
  N = 'LL-CHAR-008',
  D = 'LL-ARC-DAX',
  plan = createTwoSeatsScenePlan(WORLD);
test('owned M1/M2 definitions stay unmodified; physical/art dependencies explicitly gate authored M3', () => {
  const f = fixture(),
    gates = twoSeatsIntegrationGates(f.s, f.parent);
  assert(gates.includes('two-seats-geometry-unintegrated'));
  assert(gates.includes('two-seats-melee-unintegrated'));
  assert.equal(createTwoSeatsAdapters(f.s, f.parent).supportsMission('LL-ST-003'), false);
  assert.equal(FIRST_ARC_MISSIONS[2].failures.length, 6);
  assert.deepEqual(FIRST_ARC_MISSIONS.slice(0, 2), FIRST_ARC_06_CONTENT.missions.slice(0, 2));
  assert.equal(plan.report.ready, false);
  assert.deepEqual(
    {
      felix: Companions.getActor(f.s, F).health,
      nadia: Companions.getActor(f.s, N).health,
      money: f.s.player.money,
    },
    f.health,
  );
});
test('missing standing route cannot replace or reposition genuine Nadia at a fake curb', () => {
  const f = fixture(),
    before = copy(Companions.getActor(f.s, N)),
    length = f.s.companions.actors.length;
  assert.equal(prepareTwoSeatsStart(f.s, f.parent).ok, false);
  assert.deepEqual(Companions.getActor(f.s, N), before);
  assert.equal(f.s.companions.actors.length, length);
});
test('actual existing Felix walks out of Dispatch and boards real selected seat2 without healing or seat assignment', () => {
  const f = fixture(),
    v = f.s.vehicles.find((v) => v.id === 'arc-arrival-taxi');
  assert.equal(Companions.requestBoardSlot(f.s, F, v.id, 2, f.cc).ok, true);
  for (let n = 0; n < 1200 && !Companions.getSeat(f.s, F); n++) updateSimulation(f.s, 1 / 60, {});
  const seat = Companions.getSeat(f.s, F);
  assert(seat?.alive, JSON.stringify(Companions.companionObservation(f.s, F)));
  assert.equal(seat.seat, 2);
  assert.equal(seat.vehicleId, v.id);
  assert.equal(Companions.getActor(f.s, F).health, f.health.felix);
  assert.equal(Companions.getActor(f.s, N).health, f.health.nadia);
  assert.equal(f.s.player.money, f.health.money);
});
test('forged reversed passenger order cannot validate or unlock Tess contact', () => {
  const f = fixture(),
    m = initializeTwoSeatsRuntime(f.s);
  m.run.startedAt = f.s.time;
  m.run.dropoffs = [
    {
      id: 'forged:nadia-first',
      at: f.s.time,
      scope: {
        missionId: 'LL-ST-003',
        stageId: 'home',
        attempt: 1,
        activationReceipt: 'forged:home',
      },
      actorId: N,
      sceneId: 'voss-dispatch',
      actorPose: { x: 162, y: 40, z: 0, sceneId: 'voss-dispatch' },
      vehicleId: 'arc-arrival-taxi',
      vehiclePose: { x: 440, y: 748, z: 0, sceneId: null },
      exitObservedAt: f.s.time,
    },
  ];
  assert.throws(() => validateTwoSeatsRuntime(f.s), /ordered/);
  assert.equal(f.s.phoneCalls.contacts['LL-CHAR-025'], undefined);
});
test('actual guarded knife strike/disarm commits8real damage and immutable48-hour wrist record, retaining bandage after impairment expires', () => {
  const f = guardedDisarm(),
    { m, dax } = f;
  const result = observeTwoSeatsDisarm(f.s, dax.disarmReceipt, f.parent);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(dax.health, 92);
  assert.equal(m.run.damageEvents.at(-1).owner, 'player');
  assert.equal(m.run.damageEvents.at(-1).healthBefore, 100);
  assert.equal(m.run.damageEvents.at(-1).healthAfter, 92);
  const before = copy(m.run.injury),
    view = twoSeatsWristView(f.s);
  assert.equal(view.active, true);
  assert.equal(view.bandageVisible, true);
  assert.equal(observeTwoSeatsDisarm(f.s, dax.disarmReceipt, f.parent).replayed, true);
  assert.equal(dax.health, 92);
  assert.equal(applyRestHours(f.s, 24, 'component:rest-one').ok, true);
  assert.equal(applyRestHours(f.s, 24, 'component:rest-two').ok, true);
  assert.equal(twoSeatsWristView(f.s).active, false);
  assert.equal(twoSeatsWristView(f.s).bandageVisible, true);
  assert.deepEqual(m.run.injury, before);
  assert.equal(validateTwoSeatsParentState(f.s), true);
  assert.equal(Companions.getActor(f.s, F).health, f.health.felix);
  assert.equal(Companions.getActor(f.s, N).health, f.health.nadia);
  assert.equal(f.s.player.money, f.health.money);
  assert.equal(
    f.parent.ready.melee,
    false,
    'custom component bindings intentionally omit full gameplay readiness',
  );
});
test('NEW restored pre-injury fixture rolls back declined damage and retries without changing its live run', () => {
  const f = restoreDisarmBoundary(guardedDisarm()),
    proof = copy(f.dax.disarmReceipt),
    costs = {
      stamina: f.s.player.stamina,
      pickups: copy(f.s.pickups),
      weapons: copy(f.s.player.weapons),
      kills: f.s.progress.kills,
    },
    damage = f.engine.damageActor,
    requested = [];
  f.engine.damageActor = (...args) => {
    requested.push(args[2]);
    damage(...args);
    return { ok: false, unmet: 'declared-component-decline-after-real-damage' };
  };
  const declined = observeTwoSeatsDisarm(f.s, proof, f.parent);
  assert.equal(declined.ok, false);
  assert.equal(Companions.getActor(f.s, D).health, 100);
  assert.equal(f.s.twoSeatsRuntime.run.injury, null);
  assert.equal(f.s.twoSeatsRuntime.run.damageEvents.length, 0);
  assert.deepEqual(f.s.twoSeatsRuntime.run.disarm.receipt, proof);
  assert.equal(f.s.player.stamina, costs.stamina);
  assert.deepEqual(f.s.pickups, costs.pickups);
  assert.deepEqual(f.s.player.weapons, costs.weapons);
  assert.deepEqual(f.s.player.lastDisarm, proof);
  assert.equal(f.s.progress.kills, costs.kills);
  assert.equal(validateTwoSeatsRuntime(f.s), true);
  assert.equal(validateTwoSeatsParentState(f.s), true);

  f.engine.damageActor = (...args) => {
    requested.push(args[2]);
    return damage(...args);
  };
  const retried = observeTwoSeatsDisarm(f.s, proof, f.parent);
  assert.equal(retried.ok, true, JSON.stringify(retried));
  assert.equal(retried.replayed, undefined, 'pending injury must actually retry');
  assert.deepEqual(requested, [8, 8]);
  assert.equal(Companions.getActor(f.s, D).health, 92);
  assert.equal(f.s.twoSeatsRuntime.run.damageEvents.length, 1);
  assert.equal(f.s.player.stamina, costs.stamina);
  assert.deepEqual(f.s.pickups, costs.pickups);
  assert.deepEqual(f.s.player.lastDisarm, proof);
  assert.equal(observeTwoSeatsDisarm(f.s, proof, f.parent).replayed, true);
  assert.deepEqual(requested, [8, 8]);
  assert.equal(Companions.getActor(f.s, F).health, f.health.felix);
  assert.equal(Companions.getActor(f.s, N).health, f.health.nadia);
  assert.equal(f.s.player.money, f.health.money);
  validateCampaignDirector(f.s.campaign, f.native);
  assert.equal(f.live.dax.health, 92, 'independent fixture does not heal or redamage live body');
  assert.equal(
    f.live.s.twoSeatsRuntime.run.damageEvents.filter((e) => e.kind === 'guard-disarm-wrist').length,
    1,
  );
});
test('NEW restored pre-injury fixture reproduces fatal clamped damage without rewinding its already-fatal live run', () => {
  const f = restoreDisarmBoundary(guardedDisarm({ daxHealth: 4 })),
    damage = f.engine.damageActor,
    requested = [];
  f.engine.damageActor = (...args) => {
    requested.push(args[2]);
    return damage(...args);
  };
  const result = observeTwoSeatsDisarm(f.s, f.dax.disarmReceipt, f.parent);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(requested, [8]);
  assert.equal(Companions.getActor(f.s, D).health, 0);
  const event = f.s.twoSeatsRuntime.run.damageEvents.at(-1);
  assert.equal(event.healthBefore, 4);
  assert.equal(event.healthAfter, 0);
  assert.equal(event.owner, 'player');
  assert.equal(event.kind, 'guard-disarm-wrist');
  assert.equal(f.s.twoSeatsRuntime.run.injury.damageRequested, 8);
  assert.equal(f.s.twoSeatsRuntime.run.injury.damageApplied, 4);
  assert.equal(f.s.twoSeatsRuntime.run.injury.fatal, true);
  const adapters = createTwoSeatsAdapters(f.s, f.parent),
    failure = f.authored.failures.find((x) => x.id === 'dispatch-person-lost');
  assert.equal(
    adapters.observe(failure.condition, { missionId: 'LL-ST-003' }),
    true,
    'actual dead collector must be an explicit failure observation',
  );
  assert.equal(adapters.observe({ type: 'disarmed', actor: D }, { missionId: 'LL-ST-003' }), false);
  assert.deepEqual(f.s.twoSeatsRuntime.run.retreat.proofs, {});
  assert.equal(f.s.campaign.completed['LL-ST-003'], undefined);
  assert.deepEqual(f.s.campaign.active.completedStages, []);
  assert.equal(Companions.getActor(f.s, F).health, f.health.felix);
  assert.equal(Companions.getActor(f.s, N).health, f.health.nadia);
  assert.equal(f.s.player.money, f.health.money);
  assert.equal(validateTwoSeatsRuntime(f.s), true);
  assert.equal(validateTwoSeatsParentState(f.s), true);
  assert.equal(f.live.dax.health, 0, 'fatal live body remains dead');
});

test('world-caused damage ticks never fill the bounded Two Seats damage history', () => {
  const s = { time: 100, player: { x: 0, y: 0, health: 100 }, vehicles: [] };
  initializeCalendar(s);
  const m = initializeTwoSeatsRuntime(s);
  m.active = {
    missionId: 'LL-ST-003',
    stageId: 'pickup',
    attempt: 1,
    receipt: 'campaign:abc:LL-ST-003:attempt:1:activate:pickup:1',
    startedAt: 50,
    phase: 'running',
    blocked: null,
  };
  m.run.startedAt = 50;
  const target = { id: 'ped-1', x: 10, y: 10, z: 0, health: 100, armour: 0, sceneId: null };
  const parent = { damage: { getTarget: () => target, isCivilian: () => true } };
  const burn = (owner) => {
    const healthBefore = target.health;
    target.health = Math.max(0.0001, target.health - 0.01);
    return observeTwoSeatsDamage(
      s,
      {
        entityType: 'actor',
        targetId: target.id,
        targetKind: 'pedestrian',
        owner,
        kind: 'fire',
        healthBefore,
        healthAfter: target.health,
        armourBefore: 0,
        armourAfter: 0,
        x: target.x,
        y: target.y,
        z: 0,
        sceneId: null,
        at: s.time,
      },
      parent,
    );
  };
  for (let i = 0; i < 2100; i++) assert.equal(burn('world').ignored, true);
  assert.equal(m.run.damageEvents.length, 0);
  assert.equal(m.run.civilianHarm, null);
  assert.equal(validateTwoSeatsRuntime(s), true);
  const harmed = burn('player');
  assert.equal(harmed.ok, true);
  assert.equal(m.run.civilianHarm.id, harmed.receipt.id);
  m.run.damageEvents.push(
    ...Array.from({ length: 2047 }, (_, i) => ({ ...harmed.receipt, id: `fixture:${i}` })),
  );
  assert.deepEqual(burn('player'), { ok: false, unmet: ['damage-observation-capacity-reached'] });
  assert.equal(m.run.damageEvents.length, 2048);
});
