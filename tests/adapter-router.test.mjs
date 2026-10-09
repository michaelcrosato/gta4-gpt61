import test from 'node:test';
import assert from 'node:assert/strict';
import { createCampaignAdapterRouter } from '../src/campaign/adapter-router.js';
import {
  CAMPAIGN_CONTENT,
  createCampaignDirector,
  campaignAvailability,
  startCampaignMission,
  advanceCampaignDialogue,
  updateCampaignDirector,
  retryCampaignMission,
  abandonCampaignMission,
  saveCampaignDirector,
  restoreCampaignDirector,
  validateCampaignDirector,
} from '../src/campaign/director.js';

// Synthetic world adapters exercise real router/director contracts. No physical
// Harbor City, phone, actor, route or source completion is claimed by these tests.
const ONE = 'LL-ST-001',
  TWO = 'LL-ST-002',
  THREE = 'LL-ST-003';
const clone = (value) => JSON.parse(JSON.stringify(value));
function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
}
const stage = (title) => ({
  id: 'shared',
  type: 'test-stage',
  scene: 'fixture',
  objective: title,
  completion: [{ type: 'physical-done' }],
  dialogue: [{ speaker: title, text: `Observe ${title}`, when: 'always' }],
});
function mission(id, title) {
  return {
    id,
    title,
    status: 'authored-unintegrated',
    runtimeValidated: false,
    sourceMissionCredit: 1,
    startStage: 'shared',
    stages: [stage(title)],
    dependencies: { all: [] },
    requiredCapabilities: [{ id: 'director' }, { id: 'shared-capability' }],
    commonFailures: ['player-dead', 'player-arrested'],
    retryPolicy: {
      dialogue: [{ speaker: title, text: 'Retry', when: 'always' }],
    },
    checkpoints: [],
    failures: [],
    choices: [],
    consequences: [],
    rewards: { cash: id === ONE ? 10 : 20, unlocks: [] },
  };
}
function fixture({ register = [ONE, TWO], pack = null } = {}) {
  const content = pack || {
    missions: [mission(ONE, 'First'), mission(TWO, 'Second'), mission(THREE, 'Unregistered')],
    scenes: { fixture: { status: 'synthetic' } },
    capabilities: {},
    manifest: { id: 'router-contract-fixture', additionalOnboardingIds: [] },
  };
  let world = {
    cash: 100,
    actors: { first: { x: 12, health: 100 }, second: { x: 80, health: 100 } },
    calendar: { hours: 20.25 },
    phone: { calls: ['existing-message'] },
    city: { trafficPosition: 48, paidServiceReceipts: ['prior-purchase'] },
    signals: { [ONE]: false, [TWO]: false, [THREE]: false },
    receipts: [],
  };
  const calls = [],
    parentCalls = [],
    adapters = {};
  for (const id of [ONE, TWO, THREE]) {
    const caps = { 'shared-capability': true };
    adapters[id] = {
      capabilities: caps,
      supportsStage: (type) => type === 'test-stage',
      supportsCondition: (type) =>
        [
          'physical-done',
          'player-dead',
          'player-arrested',
          id === ONE ? 'first-only' : 'second-only',
        ].includes(type),
      supportsAction: (type) =>
        [
          'campaign-reward',
          'mission-failed',
          'mission-restarted',
          'mission-abandoned',
          id === ONE ? 'first-action' : 'second-action',
        ].includes(type),
      activateStage(definition, request) {
        calls.push({
          method: 'activate',
          owner: id,
          definition: clone(definition),
          request: clone(request),
        });
        return { ok: true };
      },
      observe(condition, request) {
        calls.push({ method: 'observe', owner: id, request: clone(request) });
        return condition.type === 'physical-done' ? world.signals[id] : false;
      },
      applyActions(batch, request) {
        calls.push({ method: 'actions', owner: id, request: clone(request) });
        if (!world.receipts.includes(request.receipt)) {
          for (const action of batch)
            if (action.type === 'campaign-reward') world.cash += action.rewards.cash;
          world.receipts.push(request.receipt);
        }
        return { ok: true };
      },
      captureWorld() {
        throw Error('Mission-specific partial capture must never be used.');
      },
      validateWorld() {
        throw Error('Mission-specific partial validation must never be used.');
      },
      restoreWorld() {
        throw Error('Mission-specific partial restore must never be used.');
      },
    };
  }
  const parent = {
    captureWorld(request) {
      parentCalls.push({ method: 'capture', request: clone(request) });
      return clone(world);
    },
    validateWorld(snapshot, request) {
      parentCalls.push({ method: 'validate', request: clone(request) });
      return Boolean(
        snapshot &&
        typeof snapshot.cash === 'number' &&
        snapshot.actors?.first &&
        snapshot.actors?.second &&
        snapshot.calendar &&
        snapshot.phone &&
        snapshot.city &&
        snapshot.signals &&
        Array.isArray(snapshot.receipts),
      );
    },
    restoreWorld(snapshot, request) {
      parentCalls.push({ method: 'restore', request: clone(request) });
      world = clone(snapshot);
      return { ok: true };
    },
  };
  const router = createCampaignAdapterRouter({
    content,
    registrations: register.map((id) => ({
      missionId: id,
      adapter: adapters[id],
    })),
    parent,
  });
  return {
    content,
    adapters,
    parent,
    router,
    calls,
    parentCalls,
    get world() {
      return world;
    },
  };
}
const request = (missionId, stageId = 'shared') => ({
  missionId,
  stageId,
  attempt: 1,
  receipt: 'fixture:operation',
});

test('exact authored stage content routes reused IDs/types to the correct owner and rejects mutations', () => {
  const h = fixture(),
    first = h.content.missions[0].stages[0],
    second = h.content.missions[1].stages[0];
  assert.equal(h.router.supportsStage(first.type, clone(first)), true);
  assert.equal(h.router.supportsStage(second.type, clone(second)), true);
  assert.equal(h.router.activateStage(first, request(ONE)).ok, true);
  assert.equal(h.router.activateStage(second, request(TWO)).ok, true);
  assert.deepEqual(
    h.calls.map((call) => call.owner),
    [ONE, TWO],
  );
  const count = h.calls.length,
    changed = { ...first, dialogue: second.dialogue };
  assert.equal(h.router.supportsStage(first.type, changed), false);
  assert.equal(h.router.activateStage(second, request(ONE)).ok, false);
  assert.equal(h.router.activateStage(first, request(THREE)).ok, false);
  assert.equal(h.router.activateStage(first, request(ONE, 'different')).ok, false);
  assert.equal(h.calls.length, count);
});

test('structurally identical stages with unregistered owners remain ambiguous and cannot borrow a handler', () => {
  const a = mission(ONE, 'First'),
    b = mission(TWO, 'Second');
  b.stages = clone(a.stages);
  const h = fixture({
    register: [ONE],
    pack: {
      missions: [a, b],
      scenes: {},
      capabilities: {},
      manifest: { id: 'ambiguous', additionalOnboardingIds: [] },
    },
  });
  assert.equal(h.router.supportsStage(a.stages[0].type, clone(a.stages[0])), false);
  assert.equal(h.router.supportsMission(ONE, a), false);
  assert.equal(h.router.activateStage(a.stages[0], request(TWO)).ok, false);
});

test('condition/action type discovery never overrides request-scoped ownership or upgrades unknown observations', () => {
  const h = fixture();
  assert.equal(h.router.supportsCondition('first-only'), true);
  assert.deepEqual(h.router.observe({ type: 'first-only', missionId: ONE }, request(TWO)), {
    unmet: 'unregistered-mission-condition-handler',
  });
  assert.equal(h.calls.length, 0);
  h.world.signals[ONE] = false;
  h.world.signals[TWO] = true;
  assert.equal(h.router.observe({ type: 'physical-done', missionId: TWO }, request(ONE)), false);
  assert.equal(h.router.observe({ type: 'physical-done' }, request(TWO)), true);
  assert.deepEqual(
    h.calls.map((call) => call.owner),
    [ONE, TWO],
  );
  assert.equal(h.router.supportsAction('first-action'), true);
  const count = h.calls.length;
  assert.equal(h.router.applyActions([{ type: 'first-action' }], request(TWO)).ok, false);
  assert.equal(
    h.router.applyActions([{ type: 'first-action' }, { type: 'second-action' }], request(ONE)).ok,
    false,
  );
  assert.equal(
    h.router.applyActions([{ type: 'campaign-reward', rewards: { cash: 999 } }], request(THREE)).ok,
    false,
  );
  assert.equal(h.calls.length, count);
  assert.equal(h.world.cash, 100);
  h.adapters[ONE].observe = () => undefined;
  assert.equal(h.router.observe({ type: 'physical-done' }, request(ONE)), undefined);
});

test('per-mission readiness gates availability and preflight even when missions require identical global capabilities', () => {
  const h = fixture(),
    state = createCampaignDirector({ content: h.content });
  h.adapters[TWO].capabilities['shared-capability'] = false;
  assert.deepEqual(h.router.capabilities, {});
  assert.equal(h.router.capabilitiesForMission(ONE)['shared-capability'], true);
  assert.equal(h.router.capabilitiesForMission(TWO)['shared-capability'], false);
  assert.deepEqual(h.router.capabilitiesForMission(THREE), {});
  const availability = campaignAvailability(state, h.router);
  assert.equal(availability[0].status, 'available-for-parent-activation');
  assert(availability[1].unmet.includes('unintegrated-capability:shared-capability'));
  assert(availability[2].unmet.includes(`unregistered-mission-handler:${THREE}`));
  assert.equal(startCampaignMission(state, THREE, h.router).ok, false);
  assert.equal(startCampaignMission(state, TWO, h.router).ok, false);
  assert.equal(h.parentCalls.length, 0);
  assert.equal(h.calls.length, 0);
  assert.equal(startCampaignMission(state, ONE, h.router).ok, true);
});

test('an unregistered director-only mission is gated without depending on capability names', () => {
  const h = fixture();
  h.content.missions[2].requiredCapabilities = [{ id: 'director' }];
  const state = createCampaignDirector({ content: h.content });
  assert.equal(startCampaignMission(state, THREE, h.router).ok, false);
  assert(
    campaignAvailability(state, h.router)[2].unmet.includes(
      `unregistered-mission-handler:${THREE}`,
    ),
  );
  assert.equal(h.parentCalls.length, 0);
});

test('complete snapshots belong only to parent and preserve all mission, phone, calendar and ordinary city state', () => {
  const h = fixture(),
    state = createCampaignDirector({ content: h.content });
  startCampaignMission(state, ONE, h.router);
  advanceCampaignDialogue(state, h.router);
  h.world.signals[ONE] = true;
  assert.equal(updateCampaignDirector(state, h.router).completed, ONE);
  assert.equal(h.world.cash, 110);
  startCampaignMission(state, TWO, h.router);
  const checkpointWorld = clone(state.active.checkpoints[0].world);
  h.world.cash -= 7;
  h.world.actors.first.x = 99;
  h.world.calendar.hours = 25;
  h.world.phone.calls.push('new-message');
  h.world.city.trafficPosition = 123;
  const beforeSave = clone(h.world),
    saved = saveCampaignDirector(state, h.router);
  assert.equal(saved.ok, true);
  assert.deepEqual(JSON.parse(saved.json).world, beforeSave);
  h.world.cash = 1;
  const loaded = restoreCampaignDirector(saved.json, h.router);
  assert.equal(loaded.ok, true);
  assert.deepEqual(h.world, beforeSave);
  assert.equal(retryCampaignMission(loaded.state, h.router, { mode: 'restart-mission' }).ok, true);
  assert.deepEqual(
    { ...h.world, receipts: h.world.receipts.slice(0, checkpointWorld.receipts.length) },
    checkpointWorld,
  );
  assert.equal(h.world.receipts.length, checkpointWorld.receipts.length + 1);
  assert(h.world.receipts.at(-1).endsWith(':restart'));
  assert(loaded.state.completed[ONE]);
  assert.equal(h.world.cash, 110, 'Retrying mission two cannot undo mission one reward.');
  assert(
    h.parentCalls.some(
      (call) => call.method === 'restore' && call.request.reason === 'retry:start',
    ),
  );
});

test('unregistered or unready retry fails before capturing/restoring the parent world', () => {
  const h = fixture({ register: [ONE, TWO, THREE] }),
    state = createCampaignDirector({ content: h.content });
  startCampaignMission(state, TWO, h.router);
  const limited = createCampaignAdapterRouter({
    content: h.content,
    registrations: [{ missionId: ONE, adapter: h.adapters[ONE] }],
    parent: h.parent,
  });
  h.world.cash = 61;
  const beforeState = clone(state),
    beforeWorld = clone(h.world),
    count = h.parentCalls.length;
  assert.equal(retryCampaignMission(state, limited).ok, false);
  assert.deepEqual(state, beforeState);
  assert.deepEqual(h.world, beforeWorld);
  assert.equal(h.parentCalls.length, count);
  h.adapters[TWO].capabilities['shared-capability'] = false;
  assert.equal(retryCampaignMission(state, h.router).ok, false);
  assert.equal(h.parentCalls.length, count);
});

test('retained Night Crossing-shaped saves keep fingerprint/ordinary costs and retry through the same full snapshot owner', () => {
  const h = fixture(),
    state = createCampaignDirector({ content: h.content });
  const fingerprint = state.contentFingerprint;
  assert.equal(h.router.content, h.content);
  startCampaignMission(state, ONE, h.router);
  h.world.cash = 63;
  abandonCampaignMission(state, h.router, { preserveRetry: true });
  const saved = saveCampaignDirector(state, h.router),
    restored = restoreCampaignDirector(saved.json, h.router);
  assert.equal(restored.ok, true);
  assert.equal(restored.state.contentFingerprint, fingerprint);
  assert.equal(h.world.cash, 63);
  assert.equal(retryCampaignMission(restored.state, h.router, { missionId: ONE }).ok, true);
  assert.equal(h.world.cash, 100);
  assert.equal(restored.state.active.attempt, 2);
  assert.equal(restored.state.suspended.length, 0);
  assert.equal(validateCampaignDirector(restored.state, h.router), true);
  assert.deepEqual(Object.keys(restored.state.completed), []);
});

test('optional physical gates/outcomes route by exact mission and preserve missing-gate semantics only for known handlers', () => {
  const h = fixture(),
    first = h.content.missions[0].stages[0],
    second = h.content.missions[1].stages[0];
  h.adapters[ONE].canCompleteStage = () => ({
    unmet: 'actual-cinematic-not-finished',
  });
  h.adapters[ONE].readOutcome = () => 'quit';
  assert.deepEqual(h.router.canCompleteStage(first, request(ONE)), {
    unmet: 'actual-cinematic-not-finished',
  });
  assert.equal(h.router.canCompleteStage(second, request(TWO)), true);
  assert(h.router.canCompleteStage(first, request(THREE)).unmet);
  assert.equal(h.router.readOutcome(first, request(ONE)), 'quit');
  assert(h.router.readOutcome(second, request(TWO)).unmet);
});

test('scope flags cannot come from another handler, inherited readiness or a truthy nonboolean', () => {
  const h = fixture();
  h.adapters[TWO].capabilities = Object.create({ 'shared-capability': true });
  assert.equal(h.router.capabilitiesForMission(TWO)['shared-capability'], false);
  h.adapters[TWO].capabilities = { 'shared-capability': { ready: 'yes' } };
  assert.equal(h.router.capabilitiesForMission(TWO)['shared-capability'], false);
  h.adapters[TWO].capabilities = {
    'shared-capability': Object.create({ ready: true }),
  };
  assert.equal(h.router.capabilitiesForMission(TWO)['shared-capability'], false);
  assert.equal(h.router.capabilitiesForMission(ONE)['shared-capability'], true);
});

test('asynchronous callbacks are rejected instead of treated as ready, delivered or restored', () => {
  const h = fixture();
  h.adapters[ONE].observe = async () => true;
  assert.throws(() => h.router.observe({ type: 'physical-done' }, request(ONE)), /synchronous/);
  h.parent.restoreWorld = async () => ({ ok: true });
  assert.throws(() => h.router.restoreWorld(clone(h.world), request(ONE)), /synchronous/);
  h.adapters[ONE].supportsStage = async () => true;
  assert.throws(() => h.router.supportsMission(ONE, h.content.missions[0]), /synchronous/);
});

test('registration cannot bind unknown or duplicate mission owners, and old adapters keep legacy capability behavior', () => {
  const h = fixture();
  assert.throws(
    () =>
      createCampaignAdapterRouter({
        content: h.content,
        registrations: [{ missionId: 'LL-ST-999', adapter: h.adapters[ONE] }],
        parent: h.parent,
      }),
    /owner/,
  );
  assert.throws(
    () =>
      createCampaignAdapterRouter({
        content: h.content,
        registrations: [
          { missionId: ONE, adapter: h.adapters[ONE] },
          { missionId: ONE, adapter: h.adapters[TWO] },
        ],
        parent: h.parent,
      }),
    /owner/,
  );
  const legacy = { ...h.adapters[ONE], ...h.parent, content: h.content };
  const state = createCampaignDirector({ content: h.content });
  assert.equal(startCampaignMission(state, ONE, legacy).ok, true);
  assert.equal(
    state.contentFingerprint,
    createCampaignDirector({ content: h.content }).contentFingerprint,
  );
});

test('untouched0.5 authored content keeps its exact fingerprint and is not rewritten by router registration', () => {
  const original = JSON.stringify(CAMPAIGN_CONTENT),
    before = createCampaignDirector();
  const h = fixture({ pack: CAMPAIGN_CONTENT, register: [ONE] });
  h.adapters[ONE].supportsStage = () => true;
  h.adapters[ONE].capabilities = Object.fromEntries(
    CAMPAIGN_CONTENT.missions[0].requiredCapabilities.map(({ id }) => [id, true]),
  );
  assert.equal(h.router.content, CAMPAIGN_CONTENT);
  assert.equal(JSON.stringify(CAMPAIGN_CONTENT), original);
  assert.equal(createCampaignDirector(h.router).contentFingerprint, before.contentFingerprint);
  assert.equal(validateCampaignDirector(before, h.router), true);
  assert.equal(h.router.supportsMission(ONE, CAMPAIGN_CONTENT.missions[0]), true);
  assert.equal(campaignAvailability(before, h.router)[0].status, 'available-for-parent-activation');
  assert.equal(h.router.supportsMission(TWO, CAMPAIGN_CONTENT.missions[1]), false);
});

test('authored identity validation rejects unsafe stage/condition/request accessors before executing them', () => {
  const h = fixture(),
    authored = h.content.missions[0].stages[0];
  let executions = 0;
  const unsafeStage = clone(authored);
  Object.defineProperty(unsafeStage, 'type', {
    enumerable: true,
    get() {
      executions++;
      return 'test-stage';
    },
  });
  assert.throws(() => h.router.supportsStage('test-stage', unsafeStage), /accessors/);
  const unsafeCondition = { type: 'physical-done' };
  Object.defineProperty(unsafeCondition, 'proof', {
    enumerable: true,
    get() {
      executions++;
      return true;
    },
  });
  assert.throws(() => h.router.observe(unsafeCondition, request(ONE)), /accessors/);
  const unsafeRequest = {};
  Object.defineProperty(unsafeRequest, 'missionId', {
    enumerable: true,
    get() {
      executions++;
      return ONE;
    },
  });
  assert.throws(() => h.router.activateStage(authored, unsafeRequest), /accessors/);
  assert.equal(executions, 0);
  assert.equal(h.calls.length, 0);
});

test('changing authored content after binding cannot silently reuse a registered handler', () => {
  const h = fixture();
  h.content.missions[0].stages[0].objective = 'Changed after binding';
  assert.equal(h.router.supportsMission(ONE, h.content.missions[0]), false);
  assert.equal(h.router.activateStage(h.content.missions[0].stages[0], request(ONE)).ok, false);
  assert.equal(h.calls.length, 0);
});

test('both unchanged Night Crossing and Late Meter stage definitions are individually registrable without certifying mission three', () => {
  const h = fixture({ pack: CAMPAIGN_CONTENT, register: [ONE, TWO] });
  for (const id of [ONE, TWO]) {
    const mission = CAMPAIGN_CONTENT.missions.find((entry) => entry.id === id);
    h.adapters[id].supportsStage = () => true;
    h.adapters[id].capabilities = Object.fromEntries(
      mission.requiredCapabilities.map(({ id: capability }) => [capability, true]),
    );
    assert.equal(h.router.supportsMission(id, mission), true);
    assert(
      !campaignAvailability(createCampaignDirector(), h.router)
        .find((entry) => entry.id === id)
        .unmet.includes(`unregistered-mission-handler:${id}`),
    );
  }
  assert.equal(h.router.supportsMission(THREE, CAMPAIGN_CONTENT.missions[2]), false);
  assert.deepEqual(h.router.capabilitiesForMission(THREE), {});
});

test('mutated catalogue identity accessors cannot execute through unknown or registered request lookup', () => {
  const h = fixture();
  let reads = 0;
  Object.defineProperty(h.content.missions[0], 'id', {
    enumerable: true,
    get() {
      reads++;
      return ONE;
    },
  });
  assert(h.router.observe({ type: 'physical-done' }, request(THREE)).unmet);
  assert(h.router.observe({ type: 'physical-done' }, request(ONE)).unmet);
  assert.equal(reads, 0);
  assert.equal(h.calls.length, 0);
});

test('shared snapshot callbacks preserve object identity and their rejection without consulting mission snapshot methods', () => {
  const h = fixture(),
    snapshot = clone(h.world),
    context = request(THREE);
  h.parent.captureWorld = () => snapshot;
  h.parent.validateWorld = (value) => value === snapshot;
  h.parent.restoreWorld = (value) =>
    value === snapshot ? { ok: false, reason: 'parent-declined' } : { ok: true };
  assert.equal(h.router.captureWorld(context), snapshot);
  assert.equal(h.router.validateWorld(snapshot, context), true);
  assert.deepEqual(h.router.restoreWorld(snapshot, context), {
    ok: false,
    reason: 'parent-declined',
  });
  const state = createCampaignDirector({ content: h.content });
  h.parent.validateWorld = () => false;
  assert.equal(startCampaignMission(state, ONE, h.router).ok, false);
  assert.equal(state.active, null);
  assert.equal(h.calls.length, 0);
});

test('an explicitly registered partial backend cannot become available through ready capability flags', () => {
  const h = fixture(),
    state = createCampaignDirector({ content: h.content }),
    observe = h.adapters[TWO].observe;
  h.adapters[TWO].observe = undefined;
  assert.equal(h.router.supportsMission(TWO, h.content.missions[1]), false);
  assert.deepEqual(h.router.capabilitiesForMission(TWO), {});
  assert.equal(startCampaignMission(state, TWO, h.router).ok, false);
  h.adapters[TWO].observe = observe;
  h.adapters[TWO].supportsStage = () => false;
  assert.equal(h.router.capabilitiesForMission(TWO)['shared-capability'], true);
  assert.equal(h.router.supportsMission(TWO, h.content.missions[1]), false);
  assert.equal(startCampaignMission(state, TWO, h.router).ok, false);
  assert.equal(h.parentCalls.length, 0);
  assert.equal(h.calls.length, 0);
});

test('verified deeply frozen catalogue references preserve routing while backend callbacks and readiness stay live', () => {
  const content = freezeDeep(fixture().content),
    h = fixture({ pack: content });
  const authored = content.missions[0];
  assert.equal(h.router.supportsMission(ONE, authored), true);
  assert.equal(h.router.activateStage(authored.stages[0], request(ONE)).ok, true);
  assert.equal(h.router.observe({ type: 'physical-done' }, request(ONE)), false);
  h.adapters[ONE].observe = () => true;
  assert.equal(h.router.observe({ type: 'physical-done' }, request(ONE)), true);
  h.adapters[ONE].capabilities['shared-capability'] = false;
  assert.equal(h.router.capabilitiesForMission(ONE)['shared-capability'], false);
  h.adapters[ONE].supportsStage = () => false;
  assert.equal(h.router.supportsMission(ONE, authored), false);
  h.adapters[ONE].observe = undefined;
  assert(h.router.observe({ type: 'physical-done' }, request(ONE)).unmet);
  assert(h.router.observe({ type: 'physical-done' }, request(THREE)).unmet);
  assert.throws(() => {
    authored.stages[0].objective = 'Changed';
  }, TypeError);
});

test('shallowly frozen outer content still detects changes in mutable nested authored data', () => {
  const content = Object.freeze(fixture().content),
    h = fixture({ pack: content });
  content.missions[0].stages[0].objective = 'Changed inside a shallow freeze';
  assert.equal(h.router.supportsMission(ONE, content.missions[0]), false);
  assert(h.router.observe({ type: 'physical-done' }, request(ONE)).unmet);
  assert.equal(h.calls.length, 0);
});

test('a mutable outer catalogue cannot cache frozen old missions after its mission list is replaced', () => {
  const content = fixture().content;
  freezeDeep(content.missions);
  const h = fixture({ pack: content });
  assert.equal(h.router.supportsMission(ONE, content.missions[0]), true);
  const replacements = clone(content.missions);
  replacements[0].stages[0].objective = 'Replacement definition';
  content.missions = replacements;
  assert.equal(h.router.supportsMission(ONE, replacements[0]), false);
  assert(h.router.observe({ type: 'physical-done' }, request(ONE)).unmet);
  assert.equal(h.calls.length, 0);
});

test('the immutable fast path never trusts arbitrary frozen clones, altered content or accessor-bearing caller data', () => {
  const content = freezeDeep(fixture().content),
    h = fixture({ pack: content }),
    authored = content.missions[0].stages[0];
  const altered = freezeDeep({ ...clone(authored), objective: 'Not the authored stage' });
  assert.equal(h.router.supportsStage(authored.type, altered), false);
  assert.equal(h.router.activateStage(altered, request(ONE)).ok, false);
  let reads = 0;
  const unsafeStage = clone(authored);
  Object.defineProperty(unsafeStage, 'type', {
    enumerable: true,
    get() {
      reads++;
      return authored.type;
    },
  });
  Object.freeze(unsafeStage);
  assert.throws(() => h.router.supportsStage(authored.type, unsafeStage), /accessors/);
  const unsafeRequest = {};
  Object.defineProperty(unsafeRequest, 'missionId', {
    enumerable: true,
    get() {
      reads++;
      return ONE;
    },
  });
  Object.freeze(unsafeRequest);
  assert.throws(() => h.router.activateStage(authored, unsafeRequest), /accessors/);
  assert.equal(reads, 0);
  assert.equal(h.calls.length, 0);
});
