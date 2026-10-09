/** Actual native parent fixtures plus explicit metadata-corruption components.
 * Missing physical ownership is never repaired by a test or treated as success. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, ownThreat, guardedDisarm } from './helpers/two-seats-native-fixture.mjs';
import {
  createTwoSeatsAdapters,
  initializeTwoSeatsRuntime,
} from '../src/campaign/two-seats-runtime.js';
import { getActor } from '../src/companions.js';
const M = 'LL-ST-003',
  D = 'LL-ARC-DAX';
const requestFor = (m) => ({ missionId: M, stageId: m.active.stageId, attempt: m.active.attempt });

test('a director-only M3 owner cannot observe failures or complete from missing physical activation', () => {
  const f = fixture(),
    m = initializeTwoSeatsRuntime(f.s),
    adapters = createTwoSeatsAdapters(f.s, f.parent);
  assert.equal(m.active, null);
  // Stale run facts are an explicit corrupt-metadata component, not gameplay edits.
  m.run.playerDead = true;
  m.run.playerArrested = true;
  m.run.civilianHarm = { old: true };
  const before = structuredClone({ player: f.s.player, companions: f.s.companions });
  const conditions = [
    { type: 'player-dead' },
    { type: 'player-arrested' },
    { type: 'civilian-damaged-by-player' },
    ...f.authored.failures.map((f) => f.condition),
    ...f.authored.stages.flatMap((s) => s.completion).filter((c) => c.type !== 'dialogue-finished'),
  ];
  for (const condition of conditions)
    assert.equal(adapters.observe(condition, { missionId: M }), false, condition.type);
  assert.deepEqual(
    adapters.canCompleteStage(f.authored.stages[0], {
      missionId: M,
      stageId: 'dispatch-threat',
      attempt: 1,
    }),
    { unmet: 'two-seats-stage-not-activated' },
  );
  assert.deepEqual(
    { player: f.s.player, companions: f.s.companions },
    before,
    'Observations neither activate nor heal bodies',
  );
  assert.equal(m.active, null);
  assert.equal(f.s.campaign.completed[M], undefined);
});

test('the physical completion gate requires its owned running stage and preserves explicit staging blocks', () => {
  const f = fixture({ combat: true }),
    m = ownThreat(f),
    adapters = createTwoSeatsAdapters(f.s, f.parent),
    stage = f.authored.stages[0],
    request = requestFor(m);
  // This is only the extra physical hook; authored conditions still must pass.
  assert.equal(adapters.canCompleteStage(stage, request), true);
  assert.equal(adapters.observe({ type: 'actor-alive', actor: 'LL-CHAR-002' }, request), true);
  assert.equal(adapters.observe({ type: 'disarmed', actor: D }, request), false);
  assert.deepEqual(adapters.canCompleteStage(stage, { ...request, attempt: request.attempt + 1 }), {
    unmet: 'two-seats-stage-not-activated',
  });
  assert.deepEqual(adapters.canCompleteStage(stage, { ...request, stageId: 'pickup' }), {
    unmet: 'two-seats-stage-not-activated',
  });
  m.active.blocked = 'actual-test-obstruction';
  assert.deepEqual(adapters.canCompleteStage(stage, request), { unmet: 'actual-test-obstruction' });
  m.active.blocked = null;
  m.active.phase = 'failed';
  assert.deepEqual(adapters.canCompleteStage(stage, request), {
    unmet: 'two-seats-stage-not-activated',
  });
  assert.equal(f.s.campaign.completed[M], undefined);
});

test('real committed disarm/injury facts cannot win after their physical activation is absent or unowned', () => {
  const live = guardedDisarm(),
    request = requestFor(live.m),
    stage = live.authored.stages[0],
    adapters = createTwoSeatsAdapters(live.s, live.parent);
  assert.equal(adapters.observe({ type: 'disarmed', actor: D }, request), true);
  assert.equal(getActor(live.s, D).health, 92);
  const clone = structuredClone(live.s),
    proof = clone.twoSeatsRuntime.active.receipt;
  delete clone.twoSeatsRuntime.activations[proof];
  const unowned = createTwoSeatsAdapters(clone, live.parent);
  assert.equal(unowned.observe({ type: 'disarmed', actor: D }, request), false);
  assert.deepEqual(unowned.canCompleteStage(stage, request), {
    unmet: 'two-seats-stage-not-activated',
  });
  clone.twoSeatsRuntime.active = null;
  assert.equal(unowned.observe({ type: 'disarmed', actor: D }, request), false);
  assert.deepEqual(unowned.canCompleteStage(stage, request), {
    unmet: 'two-seats-stage-not-activated',
  });
  assert.equal(getActor(live.s, D).health, 92, 'The original live injury is never rewound');
  assert.equal(live.s.twoSeatsRuntime.run.injury.damageApplied, 8);
  assert.equal(live.s.campaign.completed[M], undefined);
});
