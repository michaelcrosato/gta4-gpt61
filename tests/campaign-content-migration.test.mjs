import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { restoreGame, createSimulationCampaignAdapters } from '../src/simulation.js';
import {
  CAMPAIGN_CONTENT,
  campaignContentFingerprint,
  campaignReceiptNamespace,
  createCampaignDirector,
  startCampaignMission,
  updateCampaignDirector,
  retryCampaignMission,
  abandonCampaignMission,
  validateCampaignDirector,
  migrateCampaignDirectorContent,
  saveCampaignDirector,
  restoreCampaignDirector,
  recordExternalCampaignCompletion,
} from '../src/campaign/director.js';
import {
  FIRST_ARC_05_CONTENT,
  FIRST_ARC_05_FINGERPRINT,
} from '../src/campaign/history/first-arc-0.5.js';

const copy = (value) => JSON.parse(JSON.stringify(value));
const content = () => ({
  manifest: { id: 'explicit-migration-contract', additionalOnboardingIds: [] },
  scenes: { room: { status: 'synthetic fixture' } },
  capabilities: { director: { status: 'fixture' } },
  missions: [1, 2, 3].map((number) => ({
    id: `LL-ST-00${number}`,
    title: `Migration contract ${number}`,
    status: 'authored-unintegrated',
    runtimeValidated: false,
    sourceMissionCredit: 1,
    startStage: 'observe',
    stages: [
      {
        id: 'observe',
        type: 'synthetic-observation',
        scene: 'room',
        objective: 'Observe the declared fixture',
        completion: [{ type: 'done' }],
        dialogue: [],
      },
    ],
    dependencies: { all: number === 1 ? [] : [`LL-ST-00${number - 1}`] },
    requiredCapabilities: [{ id: 'director' }],
    commonFailures: ['player-dead', 'player-arrested'],
    retryPolicy: { dialogue: [{ speaker: 'Fixture', text: 'Retry.', when: 'always' }] },
    checkpoints: [],
    failures: [],
    choices: [],
    consequences: [],
    rewards: { cash: 10, unlocks: [] },
  })),
});

// Declared synthetic parent-schema fixtures exercise migration/ledger contracts.
// They neither drive Harbor City actors nor establish mission completion credit.
function fixture(pack = content()) {
  const world = { version: 1, health: 100, cash: 100, done: false, receipts: [] },
    calls = { capture: 0, restore: 0, effects: 0 },
    adapters = {
      content: pack,
      capabilities: {},
      supportsStage: () => true,
      activateStage: () => ({ ok: true }),
      supportsCondition: () => true,
      observe: (rule) =>
        rule.type === 'player-dead' ? world.health <= 0 : rule.type === 'done' && world.done,
      supportsAction: () => true,
      applyActions: (actions, request) => {
        calls.effects++;
        if (!world.receipts.includes(request.receipt)) {
          for (const action of actions)
            if (action.type === 'campaign-reward') world.cash += action.rewards.cash;
          world.receipts.push(request.receipt);
        }
        return { ok: true };
      },
      captureWorld: () => {
        calls.capture++;
        return copy(world);
      },
      validateWorld: (value) =>
        value?.version === 1 &&
        value.health >= 0 &&
        value.health <= 100 &&
        Number.isFinite(value.cash) &&
        Array.isArray(value.receipts),
      restoreWorld: (value) => {
        calls.restore++;
        for (const key of Object.keys(world)) delete world[key];
        Object.assign(world, copy(value));
        return { ok: true };
      },
    },
    state = createCampaignDirector({ content: pack, seed: 61 });
  const next = copy(pack);
  next.missions[1].rewards.cash = 20;
  return {
    pack,
    next,
    world,
    calls,
    state,
    adapters,
    upgraded: {
      ...adapters,
      content: next,
      contentHistory: { [state.contentFingerprint]: pack },
    },
  };
}

test('approved historical content retains the exact published 0.5 fingerprint and values', () => {
  assert.equal(
    campaignContentFingerprint({ content: FIRST_ARC_05_CONTENT }),
    FIRST_ARC_05_FINGERPRINT,
  );
  assert.deepEqual(FIRST_ARC_05_CONTENT.missions[0], CAMPAIGN_CONTENT.missions[0]);
  assert(Object.isFrozen(FIRST_ARC_05_CONTENT.missions[0].stages[0]));
});

test('unowned future content can change without renaming real receipts or restoring the live world', () => {
  const h = fixture();
  assert.equal(startCampaignMission(h.state, 'LL-ST-001', h.adapters).ok, true);
  h.world.health = 0;
  updateCampaignDirector(h.state, h.adapters);
  assert.equal(h.state.active.phase, 'failed');
  assert.equal(abandonCampaignMission(h.state, h.adapters, { preserveRetry: true }).ok, true);
  h.world.cash -= 20;
  const beforeState = copy(h.state),
    beforeWorld = copy(h.world),
    beforeCalls = copy(h.calls),
    migrated = migrateCampaignDirectorContent(h.state, h.upgraded);
  assert.deepEqual(h.state, beforeState);
  assert.deepEqual(h.world, beforeWorld, 'migration preserves ordinary damage/costs');
  assert.deepEqual(h.calls, beforeCalls, 'migration invokes no capture/restore/effect callback');
  assert.notEqual(migrated.contentFingerprint, h.state.contentFingerprint);
  assert.equal(migrated.receiptNamespace, h.state.contentFingerprint);
  assert.deepEqual(migrated.receipts, h.state.receipts);
  assert.deepEqual(migrated.suspended, h.state.suspended);
  validateCampaignDirector(migrated, h.upgraded);
  assert.throws(() => validateCampaignDirector(migrated, h.adapters), /fingerprint/);
  assert.equal(retryCampaignMission(migrated, h.upgraded, { missionId: 'LL-ST-001' }).ok, true);
  assert.equal(h.world.health, 100, 'only the explicit retry restores the checkpoint');
  assert.equal(migrated.active.attempt, 2);
  assert(
    Object.keys(migrated.receipts).every((token) =>
      token.startsWith(`campaign:${h.state.contentFingerprint}:`),
    ),
  );
  assert.deepEqual(migrated.completed, {});
});

test('current content stays byte-identical and receives no unnecessary legacy namespace', () => {
  const h = fixture(),
    result = migrateCampaignDirectorContent(h.state, h.adapters);
  assert.deepEqual(result, h.state);
  assert.notEqual(result, h.state);
  assert.equal(Object.hasOwn(result, 'receiptNamespace'), false);
});

test('owned mission edits/removal, unknown history and damaged checkpoints reject without world mutation', () => {
  const h = fixture();
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  const before = copy(h.world);
  for (const change of [
    (pack) => {
      pack.missions[0].rewards.cash++;
    },
    (pack) => {
      pack.missions[0].stages[0].objective = 'Different owned contract';
    },
    (pack) => {
      pack.missions.shift();
    },
  ]) {
    const target = copy(h.next);
    change(target);
    assert.throws(
      () => migrateCampaignDirectorContent(h.state, { ...h.upgraded, content: target }),
      /owned mission/,
    );
  }
  assert.throws(
    () => migrateCampaignDirectorContent(h.state, { ...h.upgraded, contentHistory: {} }),
    /unknown.*version/,
  );
  assert.throws(
    () =>
      migrateCampaignDirectorContent(h.state, {
        ...h.upgraded,
        contentHistory: { [h.state.contentFingerprint]: h.next },
      }),
    /historical.*fingerprint/,
  );
  const damaged = copy(h.state);
  damaged.active.checkpoints[0].world.health = 1000;
  assert.throws(() => migrateCampaignDirectorContent(damaged, h.upgraded), /checkpoint world/);
  assert.deepEqual(h.world, before);
});

test('legacy validation still rejects malformed receipts and never executes a history accessor', () => {
  const h = fixture();
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  const malformed = copy(h.state);
  malformed.receipts['campaign:unknown:forged'] = { kind: 'stage-activation' };
  assert.throws(() => migrateCampaignDirectorContent(malformed, h.upgraded), /receipt/);
  let calls = 0;
  const history = Object.defineProperty({}, h.state.contentFingerprint, {
    get() {
      calls++;
      return h.pack;
    },
  });
  assert.throws(
    () => migrateCampaignDirectorContent(h.state, { ...h.upgraded, contentHistory: history }),
    /unknown.*version/,
  );
  assert.equal(calls, 0);
});

test('successive pack upgrades keep the original namespace while newly played missions use current rules', () => {
  const h = fixture();
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  const first = migrateCampaignDirectorContent(h.state, h.upgraded);
  h.world.done = true;
  updateCampaignDirector(first, h.upgraded);
  assert.equal(h.world.cash, 110);
  startCampaignMission(first, 'LL-ST-002', h.upgraded);
  updateCampaignDirector(first, h.upgraded);
  assert.equal(h.world.cash, 130, 'the new unowned mission uses the upgraded 20 reward');
  const thirdPack = copy(h.next);
  thirdPack.missions[2].rewards.cash = 30;
  const thirdAdapters = {
    ...h.upgraded,
    content: thirdPack,
    contentHistory: { ...h.upgraded.contentHistory, [first.contentFingerprint]: h.next },
  };
  const before = copy(first),
    next = migrateCampaignDirectorContent(first, thirdAdapters);
  assert.equal(campaignReceiptNamespace(next), h.state.contentFingerprint);
  assert.deepEqual(next.receipts, before.receipts);
  assert.deepEqual(next.completed, before.completed);
  const saved = saveCampaignDirector(next, thirdAdapters);
  assert.equal(saved.ok, true);
  const restored = restoreCampaignDirector(saved.json, thirdAdapters);
  assert.equal(restored.ok, true);
  assert.deepEqual(restored.state, next);
  assert.equal(h.world.cash, 130, 'Continue never repeats either reward');
});

test('receipt origins must be known content versions owned by the same campaign', () => {
  const h = fixture(),
    migrated = migrateCampaignDirectorContent(h.state, h.upgraded);
  for (const value of ['unknown', '12345678', '__proto__']) {
    const tampered = copy(migrated);
    tampered.receiptNamespace = value;
    assert.throws(() => validateCampaignDirector(tampered, h.upgraded), /namespace|version/);
  }
  const wrongOwner = copy(h.pack);
  wrongOwner.manifest.id = 'another-campaign';
  const namespace = campaignContentFingerprint({ content: wrongOwner }),
    tampered = { ...migrated, receiptNamespace: namespace };
  assert.throws(
    () =>
      validateCampaignDirector(tampered, {
        ...h.upgraded,
        contentHistory: { [namespace]: wrongOwner },
      }),
    /namespace.*owner/,
  );
});

test('unchanged external prerequisite proof remains external and is never replaced with invented stages', () => {
  const pack = content();
  pack.missions[0].dependencies.all = ['LL-ST-022'];
  const h = fixture(pack),
    observers = {
      ...h.adapters,
      observe: (rule, request) =>
        rule.type === 'external-mission-completed' || h.adapters.observe(rule, request),
    };
  assert.equal(
    recordExternalCampaignCompletion(h.state, 'LL-ST-022', 'parent:terminal-proof', observers).ok,
    true,
  );
  assert.equal(startCampaignMission(h.state, 'LL-ST-001', observers).ok, true);
  const migrated = migrateCampaignDirectorContent(h.state, h.upgraded);
  assert.deepEqual(migrated.externalCompleted, h.state.externalCompleted);
  assert.equal(Object.hasOwn(migrated.completed, 'LL-ST-022'), false);
  assert.equal(Object.hasOwn(migrated.attempts, 'LL-ST-022'), false);
});

test('actual 0.5 home/checkpoint data migrates unchanged when an unplayed mission changes', () => {
  const bytes = gunzipSync(
      readFileSync(new URL('./fixtures/campaign-0.5-home-save.json.gz', import.meta.url)),
    ),
    metadata = JSON.parse(
      readFileSync(new URL('./fixtures/campaign-0.5-home-save.meta.json', import.meta.url)),
    ),
    saved = JSON.parse(bytes.toString());
  assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
  assert.equal(saved.state.campaign.contentFingerprint, FIRST_ARC_05_FINGERPRINT);
  const original = copy(saved),
    future = copy(CAMPAIGN_CONTENT);
  future.missions[1].rewards.cash++;
  let validated = 0;
  const adapters = {
      content: future,
      validateWorld: (snapshot) => {
        validated++;
        restoreGame(
          { format: 'lowlight-save', version: 1, state: snapshot },
          { physicalOnly: true },
        );
        return true;
      },
      captureWorld: () => {
        throw Error('Migration must not capture/alter the parent');
      },
      restoreWorld: () => {
        throw Error('Migration must not restore the parent');
      },
      applyActions: () => {
        throw Error('Migration must not invent action receipts');
      },
    },
    migrated = migrateCampaignDirectorContent(saved.state.campaign, adapters);
  assert.equal(migrated.active.stageId, 'rest');
  assert.equal(migrated.receiptNamespace, FIRST_ARC_05_FINGERPRINT);
  assert.deepEqual(migrated.active, original.state.campaign.active);
  assert.deepEqual(migrated.receipts, original.state.campaign.receipts);
  assert.deepEqual(migrated.history, original.state.campaign.history);
  assert.equal(validated, migrated.active.checkpoints.length);
  assert.deepEqual(saved, original, 'the actual saved world/input remains untouched');
  const continued = restoreGame(saved);
  assert.deepEqual(continued.player, saved.state.player);
  assert.deepEqual(continued.companions, saved.state.companions);
});

test('actual home save can fully restart through production adapters after content migration', () => {
  const bytes = gunzipSync(
      readFileSync(new URL('./fixtures/campaign-0.5-home-save.json.gz', import.meta.url)),
    ),
    state = restoreGame(bytes.toString()),
    adapters = createSimulationCampaignAdapters(state);
  assert.equal(state.campaign.contentFingerprint, campaignContentFingerprint(adapters));
  const fingerprint = state.campaign.contentFingerprint;
  assert.equal(state.campaign.active.stageId, 'rest');
  const result = retryCampaignMission(state.campaign, adapters, { mode: 'restart-mission' });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(state.campaign.contentFingerprint, fingerprint);
  assert.equal(state.campaign.receiptNamespace, FIRST_ARC_05_FINGERPRINT);
  assert.equal(state.campaign.active.stageId, 'berth');
  assert.equal(state.campaign.active.attempt, 2);
  assert.equal(state.campaignRuntime.active.stageId, 'berth');
  assert.equal(state.campaignRuntime.active.attempt, 2);
  assert.equal(state.companions.actors.length, 4);
  assert(state.companions.actors.every((actor) => actor.health === 100));
  assert.deepEqual(
    { x: state.player.x, y: state.player.y, z: state.player.z },
    { x: 1830, y: 814, z: 6 },
  );
  const restart = Object.values(state.campaignEffects.receipts).filter(
    (entry) => entry.kind === 'mission-restarted',
  );
  assert.equal(restart.length, 1);
  const transactions = Object.entries(state.campaignRuntime.transactions).filter(
    ([, value]) => value.kind === 'restart',
  );
  assert.equal(transactions.length, 1);
  assert(transactions[0][0].startsWith(`campaign:${FIRST_ARC_05_FINGERPRINT}:`));
  assert.equal(transactions[0][1].receipts[0].id, restart[0].id);
  validateCampaignDirector(state.campaign, adapters);
});
