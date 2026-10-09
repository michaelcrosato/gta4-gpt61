/** Exact historical pack migration. Genuine whole-game saves are distinguished
 * from the synthetic pure-director owned-M3 rejection fixture below. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import {
  restoreGame,
  saveGame,
  createSimulationCampaignAdapters,
  WORLD,
} from '../src/simulation.js';
import { validateRailRuntime } from '../src/rail-runtime.js';
import {
  CAMPAIGN_CONTENT,
  CAMPAIGN_CONTENT_HISTORY,
  campaignContentFingerprint,
  createCampaignDirector,
  migrateCampaignDirectorContent,
  startCampaignMission,
  currentCampaignDialogue,
  advanceCampaignDialogue,
  updateCampaignDirector,
  chooseCampaignOption,
} from '../src/campaign/director.js';
import {
  FIRST_ARC_06_CONTENT,
  FIRST_ARC_06_FINGERPRINT,
} from '../src/campaign/history/first-arc-0.6.js';
const clone = (v) => structuredClone(v);
function without(value, keys) {
  const result = clone(value);
  for (const key of keys) delete result[key];
  return result;
}
function assertOwnedRunAndMigratedWorlds(actual, old) {
  const outline = (run) => ({
    ...run,
    checkpoints: run.checkpoints.map((checkpoint) => without(checkpoint, ['world'])),
  });
  assert.deepEqual(
    outline(actual),
    outline(old),
    'all owned narrative/checkpoint metadata stays exact',
  );
  for (let i = 0; i < old.checkpoints.length; i++) {
    const before = old.checkpoints[i].world,
      after = actual.checkpoints[i].world;
    assert.deepEqual(
      without(after, ['transit', 'railSignals', 'worldGeometryVersion']),
      without(before, ['transit', 'railSignals', 'worldGeometryVersion']),
      'these genuine ground-level fixtures change only their physical rail geometry',
    );
    assert.equal(validateRailRuntime(after, WORLD), true);
    assert.deepEqual(
      without(after.transit, ['topology', 'trains']),
      without(before.transit, ['topology', 'trains']),
      'fleet clock, riders, fares and event history stay exact',
    );
    assert.equal(after.transit.trains.length, before.transit.trains.length);
    for (let j = 0; j < before.transit.trains.length; j++) {
      const A = before.transit.trains[j],
        B = after.transit.trains[j];
      assert.deepEqual(
        without(B, ['x', 'y', 'z', 'distance', 'legElapsed', 'speed']),
        without(A, ['x', 'y', 'z', 'distance', 'legElapsed', 'speed']),
        'only geometry-dependent kinematics change; identity/phase/visits/ownership do not',
      );
      assert(Math.hypot(B.x - A.x, B.y - A.y) < 1e-6, 'old planar train progress is retained');
    }
  }
}
test('compact exact0.6 reconstruction preserves complete fingerprint and every owned M1/M2 definition', () => {
  assert.equal(FIRST_ARC_06_FINGERPRINT, '38b480d9');
  assert.equal(
    campaignContentFingerprint({ content: FIRST_ARC_06_CONTENT }),
    FIRST_ARC_06_FINGERPRINT,
  );
  assert.equal(CAMPAIGN_CONTENT_HISTORY[FIRST_ARC_06_FINGERPRINT], FIRST_ARC_06_CONTENT);
  assert.deepEqual(
    CAMPAIGN_CONTENT.missions.slice(0, 2),
    FIRST_ARC_06_CONTENT.missions.slice(0, 2),
  );
  assert.equal(CAMPAIGN_CONTENT.missions[2].failures.length, 6);
  assert.equal(FIRST_ARC_06_CONTENT.missions[2].failures.length, 2);
  assert(Object.isFrozen(FIRST_ARC_06_CONTENT.missions[1].stages[2]));
});
for (const name of ['arrival', 'home', 'warn'])
  test(`genuine0.6 ${name} save migrates unchanged owned dialogue/checkpoints, bodies, costs and original receipt namespace`, () => {
    const bytes = gunzipSync(
        readFileSync(new URL(`./fixtures/campaign-0.6-${name}-save.json.gz`, import.meta.url)),
      ).toString(),
      meta = JSON.parse(
        readFileSync(new URL(`./fixtures/campaign-0.6-${name}-save.meta.json`, import.meta.url)),
      ),
      source = JSON.parse(bytes),
      old = clone(source.state),
      result = restoreGame(source);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), meta.sha256);
    assert.equal(old.campaign.contentFingerprint, '38b480d9');
    assert.equal(result.campaign.contentFingerprint, campaignContentFingerprint());
    assert.equal(
      result.campaign.receiptNamespace,
      old.campaign.receiptNamespace ?? old.campaign.contentFingerprint,
    );
    assertOwnedRunAndMigratedWorlds(result.campaign.active, old.campaign.active);
    assert.deepEqual(result.campaign.receipts, old.campaign.receipts);
    assert.deepEqual(result.campaign.completed, old.campaign.completed);
    assert.deepEqual(result.companions, old.companions);
    assert.equal(result.player.money, old.player.money);
    assert.equal(result.player.health, old.player.health);
    assert.deepEqual(result.calendar, old.calendar);
    assert.deepEqual(result.phoneCalls, old.phoneCalls);
    assert.deepEqual(source.state, old, 'caller save remains unchanged');
    const second = restoreGame(saveGame(result));
    assert.deepEqual(second.campaign.active, result.campaign.active);
  });
test('genuine completed0.6 M1/M2 migration grants no reward, world movement or M3 completion', () => {
  const bytes = gunzipSync(
      readFileSync(new URL('./fixtures/campaign-0.6-completed-save.json.gz', import.meta.url)),
    ).toString(),
    old = JSON.parse(bytes).state,
    next = restoreGame(bytes);
  assert.deepEqual(next.campaign.completed, old.campaign.completed);
  assert.deepEqual(next.campaign.receipts, old.campaign.receipts);
  assert.equal(next.campaign.active, null);
  assert.equal(next.campaign.completed['LL-ST-003'], undefined);
  assert.equal(next.player.money, old.player.money);
  assert.equal(next.time, old.time);
  assert.deepEqual(next.companions, old.companions);
});
function ownedOldM3() {
  // Synthetic pure-director observations establish ONLY historical definition
  // ownership for a rejection test. No Harbor City physical outcome is asserted.
  const content = FIRST_ARC_06_CONTENT,
    failureTypes = new Set(
      content.missions.flatMap((m) => [
        ...m.commonFailures,
        ...m.failures.map((f) => f.condition.type),
      ]),
    ),
    world = { synthetic: true };
  const a = {
    content,
    capabilitiesForMission: (id) =>
      Object.fromEntries(
        content.missions.find((m) => m.id === id).requiredCapabilities.map((c) => [c.id, true]),
      ),
    supportsMission: () => true,
    supportsStage: () => true,
    activateStage: () => ({ ok: true }),
    supportsCondition: () => true,
    observe: (c) => !failureTypes.has(c.type),
    supportsAction: () => true,
    applyActions: () => ({ ok: true }),
    captureWorld: () => clone(world),
    validateWorld: (w) => w?.synthetic === true,
    restoreWorld: () => ({ ok: true }),
  };
  const d = createCampaignDirector({ content });
  for (const id of ['LL-ST-001', 'LL-ST-002']) {
    assert(startCampaignMission(d, id, a).ok);
    for (let guard = 0; d.active && guard < 30; guard++) {
      while (currentCampaignDialogue(d, a).line) assert(advanceCampaignDialogue(d, a).ok);
      const m = content.missions.find((m) => m.id === id);
      for (const choice of m.choices)
        if (choice.stage === d.active.stageId && !d.active.choices[choice.id])
          assert(chooseCampaignOption(d, choice.id, choice.options[0].id, a).ok);
      assert(updateCampaignDirector(d, a).ok);
    }
    assert.equal(d.active, null);
  }
  assert(startCampaignMission(d, 'LL-ST-003', a).ok);
  return { d, a };
}
test('known0.6 pack with owned M3 rejects changed M3 definitions instead of rewriting historical progress', () => {
  const { d, a } = ownedOldM3(),
    before = clone(d);
  assert.throws(
    () => migrateCampaignDirectorContent(d, { ...a, content: CAMPAIGN_CONTENT }),
    /owned mission.*LL-ST-003/,
  );
  assert.deepEqual(d, before);
});
test('unknown packs, changed owned M1 and corrupted real checkpoints remain rejected', () => {
  const bytes = gunzipSync(
      readFileSync(new URL('./fixtures/campaign-0.6-home-save.json.gz', import.meta.url)),
    ).toString(),
    original = JSON.parse(bytes),
    s = restoreGame(bytes),
    adapters = createSimulationCampaignAdapters(s);
  const unknown = clone(original);
  unknown.state.campaign.contentFingerprint = 'deadbeef';
  assert.throws(() => restoreGame(unknown), /unknown campaign content version/);
  const changed = clone(CAMPAIGN_CONTENT);
  changed.missions[0].stages[0].dialogue[0].text += ' Changed';
  assert.throws(
    () =>
      migrateCampaignDirectorContent(original.state.campaign, { ...adapters, content: changed }),
    /owned mission.*LL-ST-001/,
  );
  const checkpoint = clone(original);
  checkpoint.state.campaign.active.checkpoints[0].world.player.health = 999;
  assert.throws(() => restoreGame(checkpoint), /checkpoint/);
});
