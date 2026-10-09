/** Actual fatal native guard/disarm fixture and public lifecycle APIs. Initial
 * wounded-Dax component provenance is explicit; no natural M3 completion claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import {
  restoreGame,
  saveGame,
  leaveStory,
  retryStory,
  storyView,
  updateSimulation,
} from '../src/simulation.js';
import { getActor } from '../src/companions.js';
import { fixture } from './helpers/two-seats-native-fixture.mjs';
const raw = gunzipSync(
    readFileSync(new URL('./fixtures/two-seats-fatal-failed-save.json.gz', import.meta.url)),
  ).toString(),
  meta = JSON.parse(
    readFileSync(new URL('./fixtures/two-seats-fatal-failed-save.meta.json', import.meta.url)),
  );
function failed() {
  assert.equal(createHash('sha256').update(raw).digest('hex'), meta.rawSha256);
  const s = restoreGame(raw);
  assert.equal(s.campaign.active.phase, 'failed');
  assert.equal(s.campaign.active.failure.id, 'dispatch-person-lost');
  assert.equal(getActor(s, 'LL-ARC-DAX').health, 0);
  assert.equal(s.twoSeatsRuntime.run.injury.damageApplied, 4);
  return s;
}
test('real failed M3 can return to the city without healing, restoring time/costs, rewarding or dropping its retry checkpoints', () => {
  const s = failed(),
    before = {
      time: s.time,
      money: s.player.money,
      playerHealth: s.player.health,
      actors: structuredClone(s.companions),
      injury: structuredClone(s.twoSeatsRuntime.run.injury),
      checkpoints: structuredClone(s.campaign.active.checkpoints),
      completed: structuredClone(s.campaign.completed),
    };
  const result = leaveStory(s);
  assert(result.ok, JSON.stringify(result));
  assert.equal(s.campaign.active, null);
  assert.equal(s.campaign.suspended.length, 1);
  assert.equal(s.campaign.suspended[0].resumeInfo.reason, 'return-to-free-roam');
  assert.deepEqual(s.campaign.suspended[0].checkpoints, before.checkpoints);
  assert.equal(s.time, before.time);
  assert.equal(s.player.money, before.money);
  assert.equal(s.player.health, before.playerHealth);
  assert.deepEqual(s.companions.actors, before.actors.actors);
  assert.deepEqual(s.twoSeatsRuntime.run.injury, before.injury);
  assert.deepEqual(s.campaign.completed, before.completed);
  assert.equal(s.campaign.completed['LL-ST-003'], undefined);
  assert.equal(getActor(s, 'LL-ARC-DAX').health, 0);
  assert.equal(storyView(s).interrupted.missionId, 'LL-ST-003');
  const continued = restoreGame(saveGame(s));
  assert.equal(getActor(continued, 'LL-ARC-DAX').health, 0);
  assert.equal(continued.time, before.time);
  assert.equal(continued.player.money, before.money);
  assert.deepEqual(continued.campaign.suspended[0].checkpoints, before.checkpoints);
  updateSimulation(continued, 0.1, { moveY: 1 });
  assert(continued.time > before.time);
  assert.equal(getActor(continued, 'LL-ARC-DAX').health, 0);
  assert.equal(continued.campaign.active, null);
});
test('both explicit UI retry modes restore the actual retained start world after Save/Continue, with no implicit retry merely loading', () => {
  const s = failed(),
    checkpoint = structuredClone(s.campaign.active.checkpoints.find((c) => c.id === 'start').world);
  assert(leaveStory(s).ok);
  const bytes = saveGame(s);
  for (const mode of ['retry-last-checkpoint', 'restart-mission']) {
    const resumed = restoreGame(bytes);
    assert.equal(getActor(resumed, 'LL-ARC-DAX').health, 0);
    const result = retryStory(resumed, mode);
    assert(result.ok, JSON.stringify({ mode, result }));
    assert.equal(resumed.campaign.active.missionId, 'LL-ST-003');
    assert.equal(resumed.campaign.active.phase, 'running');
    assert.equal(resumed.campaign.active.stageId, 'dispatch-threat');
    assert.equal(resumed.campaign.active.attempt, 2);
    assert.equal(resumed.campaign.suspended.length, 0);
    assert.equal(storyView(resumed).interrupted, null);
    assert.equal(resumed.time, checkpoint.time);
    assert.equal(resumed.player.money, checkpoint.player.money);
    assert.equal(resumed.player.x, checkpoint.player.x);
    assert.equal(resumed.player.y, checkpoint.player.y);
    assert.equal(
      getActor(resumed, 'LL-ARC-DAX').health,
      100,
      'explicit pre-spawn checkpoint legitimately creates fresh attempt body',
    );
    assert.equal(resumed.twoSeatsRuntime.run.injury, null);
    assert.equal(resumed.campaign.completed['LL-ST-003'], undefined);
    assert.doesNotThrow(() => restoreGame(saveGame(resumed)));
  }
});
test('unknown lifecycle kind/token/scope or unmatched actual failure identity cannot perform cleanup', () => {
  const initial = failed(),
    a = initial.twoSeatsRuntime.active,
    scope = {
      missionId: a.missionId,
      stageId: a.stageId,
      attempt: a.attempt,
      activationReceipt: a.receipt,
    },
    token = `campaign:${initial.campaign.receiptNamespace ?? initial.campaign.contentFingerprint}:LL-ST-003:attempt:${a.attempt}:abandon`;
  const requests = [
    (r) => (r.directorRequest.kind = 'suspend'),
    (r) => (r.directorRequest.receipt = 'forged:abandon'),
    (r) => (r.scope.activationReceipt = 'forged:activation'),
    (r) => (r.scope.attempt += 1),
    (r) => (r.directorRequest.stageId = 'pickup'),
    (r) => (r.directorRequest.sequence += 1),
  ];
  for (const mutate of requests) {
    const s = failed(),
      f = fixture({ restoredState: s }),
      request = {
        id: 'fixture:bad-cleanup',
        scope: structuredClone(scope),
        directorRequest: {
          kind: 'abandon',
          receipt: token,
          missionId: 'LL-ST-003',
          stageId: a.stageId,
          attempt: a.attempt,
          sequence: s.campaign.sequence,
        },
      };
    mutate(request);
    const before = saveGame(s);
    assert.equal(
      f.parent.effects.apply(s, { type: 'mission-abandoned', missionId: 'LL-ST-003' }, request).ok,
      false,
    );
    assert.equal(saveGame(s), before);
  }
  const s = failed(),
    f = fixture({ restoredState: s });
  s.campaign.active.failure.sequence += 10;
  const before = saveGame(s),
    request = {
      id: 'fixture:bad-failure-cleanup',
      scope,
      directorRequest: {
        kind: 'abandon',
        receipt: token,
        missionId: 'LL-ST-003',
        stageId: a.stageId,
        attempt: a.attempt,
        sequence: s.campaign.sequence,
      },
    };
  assert.equal(
    f.parent.effects.apply(s, { type: 'mission-abandoned', missionId: 'LL-ST-003' }, request).ok,
    false,
  );
  assert.equal(saveGame(s), before);
});
