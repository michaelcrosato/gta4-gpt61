import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPAIGN_CONTENT,
  createCampaignDirector,
  campaignAvailability,
  startCampaignMission,
  currentCampaignStage,
  currentCampaignDialogue,
  advanceCampaignDialogue,
  chooseCampaignOption,
  activateConcurrentCampaignEvent,
  updateCampaignDirector,
  retryCampaignMission,
  abandonCampaignMission,
  suspendCampaignMission,
  resumeCampaignMission,
  recordExternalCampaignCompletion,
  recordCampaignFacts,
  saveCampaignDirector,
  restoreCampaignDirector,
  validateCampaignDirector,
} from '../src/campaign/director.js';

// These are declared synthetic director-contract fixtures. They do not simulate
// Harbor City, drive cars, shoot actors or validate any campaign playthrough.
const copy = (value) => JSON.parse(JSON.stringify(value));
const line = (text, when = 'always') => ({ speaker: 'Contract actor', text, when });
const stage = (id, extra = {}) => ({
  id,
  type: 'test-physical-stage',
  scene: 'fixture-room',
  objective: `Observe ${id}`,
  completion: [{ type: 'physical-done' }],
  dialogue: [line(`Enter ${id}`)],
  ...extra,
});
const mission = (id, stages, extra = {}) => ({
  id,
  title: `Contract ${id}`,
  status: 'authored-unintegrated',
  runtimeValidated: false,
  sourceMissionCredit: 1,
  startStage: stages[0].id,
  stages,
  dependencies: { all: [] },
  requiredCapabilities: [{ id: 'director' }],
  commonFailures: ['player-dead', 'player-arrested'],
  retryPolicy: { dialogue: [line('Retry the physical attempt')] },
  checkpoints: [],
  failures: [
    {
      id: 'danger',
      condition: { type: 'danger' },
      resumeCheckpoint: 'start',
      dialogue: [line('Observed failure')],
    },
  ],
  choices: [],
  consequences: ['Synthetic contract consequence'],
  rewards: { cash: 10, unlocks: [] },
  ...extra,
});
const content = (missions) => ({
  missions,
  scenes: { 'fixture-room': { status: 'test-only' } },
  capabilities: { director: { status: 'implemented' } },
  manifest: {
    id: 'declared-director-contract-fixture',
    additionalOnboardingIds: ['first-shift', 'collection-day', 'cold-freight', 'glass-house'],
  },
});

function harness(pack = content([mission('LL-ST-001', [stage('one'), stage('two')])])) {
  let world = {
    cash: 100,
    health: 100,
    ammo: 9,
    actors: [{ id: 'actor', x: 12, y: 34 }],
    physics: { velocity: 3.5, routeIndex: 2 },
    inventory: [],
    conditions: {},
    receipts: [],
    activations: [],
    outcome: null,
  };
  const conditions = new Set([
    'physical-done',
    'danger',
    'player-dead',
    'player-arrested',
    'choice-permitted',
    'external-mission-completed',
    'onboarding-job-completed',
    'mission-resume-permitted',
    'concurrent-event-ready',
    'phone-distraction-resolved',
    'dialogue-condition',
    'campaign-facts-observed',
    'left-exit',
    'right-exit',
  ]);
  const actions = new Set([
    'campaign-reward',
    'grant-item',
    'mission-failed',
    'mission-abandoned',
    'mission-suspended',
    'mission-restarted',
    'authored-effect',
    'passenger-disembark',
    'queue-invitation',
    'flag-from-actor',
    'record-vehicle-condition',
  ]);
  const adapters = {
    content: pack,
    capabilities: {},
    supportsStage: (type) => type === 'test-physical-stage' || type === 'test-phone-event',
    supportsCondition: (type) => conditions.has(type),
    observe: (condition, ctx) => {
      const key = `${ctx.stageId}:${condition.type}`;
      return Object.hasOwn(world.conditions, key)
        ? world.conditions[key]
        : (world.conditions[condition.type] ?? false);
    },
    supportsAction: (type) => actions.has(type),
    activateStage: (definition, ctx) => {
      if (!world.receipts.includes(ctx.receipt)) {
        world.receipts.push(ctx.receipt);
        world.activations.push({ id: definition.id, missionId: ctx.missionId, reason: ctx.reason });
      }
      return { ok: true };
    },
    applyActions: (batch, ctx) => {
      if (world.receipts.includes(ctx.receipt)) return { ok: true };
      for (const action of batch) {
        if (action.type === 'campaign-reward') world.cash += action.rewards.cash;
        if (action.type === 'grant-item') world.inventory.push(action.id);
      }
      world.receipts.push(ctx.receipt);
      return { ok: true };
    },
    captureWorld: () => copy(world),
    validateWorld: (snapshot) =>
      Boolean(
        snapshot &&
        Number.isFinite(snapshot.cash) &&
        Number.isFinite(snapshot.health) &&
        Number.isFinite(snapshot.ammo) &&
        Array.isArray(snapshot.actors) &&
        snapshot.actors.every((actor) => Number.isFinite(actor.x) && Number.isFinite(actor.y)) &&
        snapshot.physics &&
        Number.isFinite(snapshot.physics.velocity) &&
        Array.isArray(snapshot.inventory) &&
        Array.isArray(snapshot.receipts) &&
        Array.isArray(snapshot.activations) &&
        snapshot.conditions,
      ),
    restoreWorld: (snapshot) => {
      world = copy(snapshot);
      return { ok: true };
    },
    readOutcome: () => world.outcome,
  };
  return {
    adapters,
    conditions,
    actions,
    state: createCampaignDirector({ content: pack, seed: 73 }),
    get world() {
      return world;
    },
    observe(type, value = true, stageId = null) {
      world.conditions[stageId ? `${stageId}:${type}` : type] = value;
    },
  };
}
function acknowledge(state, adapters) {
  for (let count = 0; count < 100; count++) {
    const next = currentCampaignDialogue(state, adapters);
    assert.deepEqual(next.unmet, []);
    if (!next.line) return;
    assert.equal(advanceCampaignDialogue(state, adapters).ok, true);
  }
  assert.fail('Unbounded dialogue');
}
function progress(h) {
  acknowledge(h.state, h.adapters);
  h.observe('physical-done', true, h.state.active.stageId);
  return updateCampaignDirector(h.state, h.adapters);
}

test('default first arc has twenty authored records and explicit integration gates; prologue is not campaign credit', () => {
  const state = createCampaignDirector();
  const availability = campaignAvailability(state);
  assert.equal(availability.length, 20);
  assert.equal(availability[0].status, 'unmet-integration-gates');
  assert(availability[0].unmet.includes('unintegrated-capability:passengers'));
  assert(availability[0].unmet.includes('missing-adapter:activateStage'));
  assert(availability.every((entry) => entry.runtimeValidated === false));
  assert.deepEqual(Object.keys(state.completed), []);
  assert.deepEqual(CAMPAIGN_CONTENT.manifest.additionalOnboardingIds, [
    'first-shift',
    'collection-day',
    'cold-freight',
    'glass-house',
  ]);
  assert.equal(startCampaignMission(state, 'LL-ST-001').ok, false);
  assert.equal(state.active, null);
});

test('dependency graph preserves Public Terminal outside the first twenty and requires observed external proof', () => {
  assert(
    CAMPAIGN_CONTENT.missions
      .find((entry) => entry.id === 'LL-ST-018')
      .dependencies.all.includes('LL-ST-022'),
  );
  const pack = content([
    mission('LL-ST-018', [stage('truck')], { dependencies: { all: ['LL-ST-022'] } }),
  ]);
  const h = harness(pack);
  assert.equal(campaignAvailability(h.state, h.adapters)[0].status, 'dependency-locked');
  assert.deepEqual(startCampaignMission(h.state, 'LL-ST-018', h.adapters).unmet, [
    'dependency:LL-ST-022',
  ]);
  assert.equal(
    recordExternalCampaignCompletion(h.state, 'LL-ST-022', 'terminal-proof', h.adapters).ok,
    false,
  );
  h.observe('external-mission-completed');
  assert.equal(
    recordExternalCampaignCompletion(h.state, 'LL-ST-022', 'terminal-proof', h.adapters).ok,
    true,
  );
  assert.equal(startCampaignMission(h.state, 'LL-ST-022', h.adapters).ok, false);
  assert.equal(startCampaignMission(h.state, 'LL-ST-018', h.adapters).ok, true);
});

test('dialogue acknowledgments and real physical observations gate every stage; repeated updates create no elapsed-time win', () => {
  const h = harness();
  assert.equal(startCampaignMission(h.state, 'LL-ST-001', h.adapters).ok, true);
  h.observe('physical-done', true);
  assert.equal(updateCampaignDirector(h.state, h.adapters).waiting, 'dialogue');
  acknowledge(h.state, h.adapters);
  h.observe('physical-done', false);
  const before = JSON.stringify(h.state);
  for (let i = 0; i < 100; i++)
    assert.equal(updateCampaignDirector(h.state, h.adapters).waiting, 'observed-conditions');
  assert.equal(JSON.stringify(h.state), before);
  assert.equal(h.state.active.stageId, 'one');
  h.observe('physical-done', true);
  assert.equal(updateCampaignDirector(h.state, h.adapters).stageId, 'two');
  assert.equal(h.world.cash, 100);
});

test('unknown condition and unresolved registered observation remain explicit unmet gates', () => {
  const h = harness(
    content([
      mission('LL-ST-001', [stage('one', { completion: [{ type: 'unbuilt-roof-hang' }] })]),
    ]),
  );
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  acknowledge(h.state, h.adapters);
  assert.deepEqual(updateCampaignDirector(h.state, h.adapters).unmet, [
    'unintegrated-condition:unbuilt-roof-hang',
  ]);
  h.conditions.add('unbuilt-roof-hang');
  h.adapters.observe = (condition) => (condition.type === 'unbuilt-roof-hang' ? undefined : false);
  assert.deepEqual(updateCampaignDirector(h.state, h.adapters).unmet, [
    'unbuilt-roof-hang:unresolved-observation',
  ]);
  assert.equal(h.state.active.stageId, 'one');
  assert.equal(h.world.cash, 100);
});

test('stage activation refusal rolls back both the director and the entire parent world', () => {
  const h = harness();
  const before = copy(h.state),
    world = copy(h.world);
  h.adapters.activateStage = () => {
    h.world.cash = 0;
    h.world.actors[0].x = 999;
    return { ok: false };
  };
  assert.equal(startCampaignMission(h.state, 'LL-ST-001', h.adapters).ok, false);
  assert.deepEqual(h.state, before);
  assert.deepEqual(h.world, world);
});

test('observed death outranks completed objective, retry restores physical actor/ammo/physics/wallet and preserves failure history', () => {
  const h = harness();
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  acknowledge(h.state, h.adapters);
  h.world.health = 0;
  h.world.cash = 60;
  h.world.ammo = 0;
  h.world.actors[0].x = 200;
  h.world.physics.velocity = 0;
  h.observe('player-dead');
  h.observe('physical-done');
  assert.equal(updateCampaignDirector(h.state, h.adapters).failed, true);
  assert.equal(h.state.active.phase, 'failed');
  assert.equal(h.world.cash, 60);
  assert.equal(updateCampaignDirector(h.state, h.adapters).failed, true);
  assert.equal(retryCampaignMission(h.state, h.adapters).ok, true);
  assert.equal(h.world.cash, 100);
  assert.equal(h.world.health, 100);
  assert.equal(h.world.ammo, 9);
  assert.equal(h.world.actors[0].x, 12);
  assert.equal(h.world.physics.velocity, 3.5);
  assert.equal(h.state.active.attempt, 2);
  assert(h.state.history.some((entry) => entry.event === 'mission-failed'));
  assert.deepEqual(Object.keys(h.state.completed), []);
});

test('checkpoint retry resumes second stage with the first physical grant intact and without issuing it twice', () => {
  const pack = content([
    mission(
      'LL-ST-001',
      [stage('one', { onComplete: [{ type: 'grant-item', id: 'manifest' }] }), stage('two')],
      {
        checkpoints: [{ id: 'ready', afterStage: 'one', resumeStage: 'two', snapshot: ['world'] }],
        failures: [
          {
            id: 'danger',
            condition: { type: 'danger' },
            resumeCheckpoint: 'ready',
            dialogue: [line('Danger')],
          },
        ],
      },
    ),
  ]);
  const h = harness(pack);
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  progress(h);
  assert.deepEqual(h.world.inventory, ['manifest']);
  h.observe('danger');
  assert.equal(updateCampaignDirector(h.state, h.adapters).failed, true);
  assert.equal(retryCampaignMission(h.state, h.adapters).stageId, 'two');
  assert.deepEqual(h.world.inventory, ['manifest']);
  assert.equal(h.state.active.completedStages.includes('one'), true);
});

test('choice needs a real permission observation, commits once and cannot fabricate a physical completion', () => {
  const choices = [
    {
      id: 'fate',
      stage: 'one',
      options: [
        { id: 'safe', effects: [{ type: 'flag', id: 'witness-safe', value: true }] },
        { id: 'capture', effects: [{ type: 'flag', id: 'witness-safe', value: false }] },
      ],
    },
  ];
  const h = harness(content([mission('LL-ST-001', [stage('one')], { choices })]));
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  assert.equal(chooseCampaignOption(h.state, 'fate', 'safe', h.adapters).ok, false);
  h.observe('choice-permitted');
  assert.equal(chooseCampaignOption(h.state, 'fate', 'safe', h.adapters).ok, true);
  assert.equal(h.state.flags['witness-safe'], true);
  assert.equal(chooseCampaignOption(h.state, 'fate', 'capture', h.adapters).ok, false);
  assert.equal(chooseCampaignOption(h.state, 'fate', 'safe', h.adapters).alreadyChosen, true);
  acknowledge(h.state, h.adapters);
  assert.equal(updateCampaignDirector(h.state, h.adapters).waiting, 'observed-conditions');
  assert.equal(h.world.cash, 100);
});

test('failed physical choice batch rolls back cash, facts, choices and grants', () => {
  const choices = [
    {
      id: 'pay',
      stage: 'one',
      options: [
        {
          id: 'yes',
          effects: [
            { type: 'grant-item', id: 'receipt' },
            { type: 'flag', id: 'paid', value: true },
          ],
        },
        { id: 'no', effects: [] },
      ],
    },
  ];
  const h = harness(content([mission('LL-ST-001', [stage('one')], { choices })]));
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  h.observe('choice-permitted');
  const before = copy(h.state),
    world = copy(h.world);
  h.adapters.applyActions = () => {
    h.world.cash -= 40;
    h.world.inventory.push('receipt');
    return { ok: false };
  };
  assert.equal(chooseCampaignOption(h.state, 'pay', 'yes', h.adapters).ok, false);
  assert.deepEqual(h.state, before);
  assert.deepEqual(h.world, world);
});

test('disabled stages are skipped only by observed authored conditions; ambiguous physical branches are blocked', () => {
  const branchStage = stage('one', {
    branches: [
      { when: { type: 'left-exit' }, next: 'left' },
      { when: { type: 'right-exit' }, next: 'right' },
    ],
  });
  const h = harness(content([mission('LL-ST-001', [branchStage, stage('left'), stage('right')])]));
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  acknowledge(h.state, h.adapters);
  h.observe('physical-done');
  h.observe('left-exit');
  h.observe('right-exit');
  assert.deepEqual(updateCampaignDirector(h.state, h.adapters).unmet, ['ambiguous-stage-branches']);
  h.observe('right-exit', false);
  assert.equal(updateCampaignDirector(h.state, h.adapters).stageId, 'left');
  const h2 = harness(
    content([
      mission('LL-ST-001', [
        stage('optional', {
          enabledWhen: { type: 'flag-is', id: 'deferred', value: true },
          disabledNext: 'main',
        }),
        stage('main'),
      ]),
    ]),
  );
  assert.equal(startCampaignMission(h2.state, 'LL-ST-001', h2.adapters).stageId, 'main');
  assert.deepEqual(
    h2.world.activations.map((entry) => entry.id),
    ['main'],
  );
});

test('reward and consequences are one parent transaction; Continue and later updates cannot pay them again', () => {
  const h = harness(
    content([
      mission('LL-ST-001', [stage('one')], {
        rewards: { cash: 35, unlocks: ['a-service'], flags: ['actor-outcome-observed'] },
      }),
    ]),
  );
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  assert.equal(progress(h).completed, 'LL-ST-001');
  assert.equal(h.world.cash, 135);
  assert.equal(h.state.flags['actor-outcome-observed'], true);
  assert.equal(h.state.completed['LL-ST-001'].releaseValidated, false);
  const saved = saveCampaignDirector(h.state, h.adapters);
  assert.equal(saved.ok, true);
  const restored = restoreCampaignDirector(saved.json, h.adapters);
  assert.equal(restored.ok, true);
  for (let i = 0; i < 10; i++)
    assert.equal(updateCampaignDirector(restored.state, h.adapters).idle, true);
  assert.equal(h.world.cash, 135);
  assert.equal(startCampaignMission(restored.state, 'LL-ST-001', h.adapters).ok, false);
});

test('outcome dialogue uses actual parent activity result, including quit, and rechecks physical completion after dialogue', () => {
  const h = harness(
    content([
      mission('LL-ST-001', [
        stage('one', {
          outcomeDialogue: {
            won: [line('Won')],
            lost: [line('Lost')],
            quit: [line('Quit without a victory')],
          },
        }),
      ]),
    ]),
  );
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  acknowledge(h.state, h.adapters);
  h.observe('physical-done');
  assert.equal(updateCampaignDirector(h.state, h.adapters).ok, false);
  h.world.outcome = 'quit';
  assert.equal(updateCampaignDirector(h.state, h.adapters).waiting, 'outcome-dialogue');
  assert.equal(currentCampaignDialogue(h.state, h.adapters).line.text, 'Quit without a victory');
  acknowledge(h.state, h.adapters);
  h.observe('physical-done', false);
  assert.equal(updateCampaignDirector(h.state, h.adapters).waiting, 'observed-conditions');
  h.observe('physical-done');
  assert.equal(updateCampaignDirector(h.state, h.adapters).completed, 'LL-ST-001');
  assert.equal(h.world.cash, 110);
});

test('rescue interruption starts a separate mission; resumed checkpoint cannot undo its completion or reward', () => {
  const parent = mission(
    'LL-ST-004',
    [
      stage('call', {
        completion: [{ type: 'branch-resolved', choice: 'priority' }],
        branches: [
          {
            choice: 'rescue',
            suspendMissionAt: 'after',
            activate: 'LL-ST-005',
            effects: [{ type: 'passenger-disembark', actor: 'Tess' }],
          },
          { choice: 'stay', next: 'after' },
        ],
      }),
      stage('after'),
    ],
    {
      choices: [
        {
          id: 'priority',
          stage: 'call',
          options: [
            {
              id: 'rescue',
              effects: [{ type: 'activate-mission', id: 'LL-ST-005', variant: 'court' }],
            },
            { id: 'stay', effects: [] },
          ],
        },
      ],
    },
  );
  const h = harness(
    content([
      parent,
      mission('LL-ST-005', [stage('rescue')], {
        rewards: { cash: 80, unlocks: [], flags: ['Felix-rescued'] },
      }),
    ]),
  );
  startCampaignMission(h.state, 'LL-ST-004', h.adapters);
  acknowledge(h.state, h.adapters);
  h.observe('choice-permitted');
  assert.equal(chooseCampaignOption(h.state, 'priority', 'rescue', h.adapters).ok, true);
  assert.equal(updateCampaignDirector(h.state, h.adapters).ok, true);
  assert.equal(h.state.active.missionId, 'LL-ST-005');
  assert.equal(h.state.suspended[0].stageId, 'after');
  assert.equal(progress(h).completed, 'LL-ST-005');
  assert.equal(h.world.cash, 180);
  h.observe('mission-resume-permitted');
  assert.equal(resumeCampaignMission(h.state, 'LL-ST-004', h.adapters).ok, true);
  h.observe('danger');
  assert.equal(updateCampaignDirector(h.state, h.adapters).failed, true);
  assert.equal(retryCampaignMission(h.state, h.adapters).ok, true);
  assert.equal(h.world.cash, 180);
  assert.equal(h.state.flags['Felix-rescued'], true);
  assert(h.state.completed['LL-ST-005']);
});

test('additional onboarding interleaves while suspended and receives zero source mission credit', () => {
  const h = harness();
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  assert.equal(
    recordExternalCampaignCompletion(h.state, 'first-shift', 'fare-proof', h.adapters).ok,
    false,
  );
  assert.equal(suspendCampaignMission(h.state, h.adapters).ok, true);
  h.observe('onboarding-job-completed');
  assert.equal(
    recordExternalCampaignCompletion(h.state, 'first-shift', 'fare-proof', h.adapters).sourceCredit,
    0,
  );
  assert.deepEqual(Object.keys(h.state.completed), []);
  assert(h.state.onboardingCompleted['first-shift']);
  h.observe('mission-resume-permitted');
  assert.equal(resumeCampaignMission(h.state, 'LL-ST-001', h.adapters).ok, true);
  assert.equal(h.state.active.stageId, 'one');
});

test('concurrent phone event needs an observed trigger, sequences its own saved dialogue and must resolve before tail exit', () => {
  const pack = content([
    mission('LL-ST-019', [
      stage('tail'),
      stage('phone', {
        type: 'test-phone-event',
        concurrentWith: 'tail',
        completion: [{ type: 'phone-distraction-resolved' }],
        dialogue: [line('Phone one'), line('Phone two')],
      }),
      stage('stairs'),
    ]),
  ]);
  const h = harness(pack);
  startCampaignMission(h.state, 'LL-ST-019', h.adapters);
  acknowledge(h.state, h.adapters);
  h.observe('physical-done');
  assert.equal(updateCampaignDirector(h.state, h.adapters).waiting, 'observed-conditions');
  assert.equal(activateConcurrentCampaignEvent(h.state, 'phone', h.adapters).ok, false);
  h.observe('concurrent-event-ready');
  assert.equal(activateConcurrentCampaignEvent(h.state, 'phone', h.adapters).ok, true);
  assert.equal(currentCampaignDialogue(h.state, h.adapters).kind, 'concurrent');
  advanceCampaignDialogue(h.state, h.adapters);
  const saved = saveCampaignDirector(h.state, h.adapters),
    restored = restoreCampaignDirector(saved.json, h.adapters);
  assert.equal(restored.ok, true);
  h.state = restored.state;
  assert.equal(currentCampaignDialogue(h.state, h.adapters).line.text, 'Phone two');
  assert.equal(h.world.activations.length, 2);
  acknowledge(h.state, h.adapters);
  assert.equal(updateCampaignDirector(h.state, h.adapters).waiting, 'concurrent-event-conditions');
  h.observe('phone-distraction-resolved');
  assert.equal(updateCampaignDirector(h.state, h.adapters).concurrentCompleted, 'phone');
  assert.equal(updateCampaignDirector(h.state, h.adapters).stageId, 'stairs');
  assert.equal(h.world.activations.filter((entry) => entry.id === 'phone').length, 1);
});

test('abandon keeps ordinary world costs and never issues a win reward', () => {
  const h = harness();
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  h.world.cash -= 40;
  assert.equal(abandonCampaignMission(h.state, h.adapters).reward, false);
  assert.equal(h.world.cash, 60);
  assert.equal(h.state.active, null);
  assert.deepEqual(Object.keys(h.state.completed), []);
  assert(h.state.history.some((entry) => entry.event === 'mission-abandoned'));
});

test('preserved failed abandonment survives Continue without healing or reversing ordinary costs until explicit retry', () => {
  const h = harness();
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  const checkpoints = copy(h.state.active.checkpoints);
  h.world.cash = 60;
  h.world.health = 0;
  h.world.ammo = 2;
  h.world.actors[0].x = 81;
  h.world.physics.velocity = 17.25;
  h.observe('danger');
  assert.equal(updateCampaignDirector(h.state, h.adapters).failed, true);
  const left = abandonCampaignMission(h.state, h.adapters, { preserveRetry: true });
  assert.equal(left.reward, false);
  assert.equal(left.retryPreserved, true);
  assert.equal(h.state.active, null);
  assert.equal(h.state.suspended.length, 1);
  assert.equal(h.state.suspended[0].phase, 'failed');
  assert.equal(h.state.suspended[0].resumeInfo.reason, 'return-to-free-roam');
  assert.deepEqual(h.state.suspended[0].checkpoints, checkpoints);
  assert.equal(h.world.cash, 60);
  assert.equal(h.world.health, 0);
  assert.equal(h.world.ammo, 2);
  assert.equal(h.world.actors[0].x, 81);
  assert.equal(h.world.physics.velocity, 17.25);
  assert.deepEqual(Object.keys(h.state.completed), []);
  const unchanged = copy(h.state),
    liveWorld = copy(h.world);
  assert.equal(abandonCampaignMission(h.state, h.adapters, { preserveRetry: true }).ok, false);
  assert.equal(startCampaignMission(h.state, 'LL-ST-001', h.adapters).ok, false);
  assert.equal(resumeCampaignMission(h.state, 'LL-ST-001', h.adapters).ok, false);
  assert.deepEqual(h.state, unchanged);
  assert.deepEqual(h.world, liveWorld);
  const saved = saveCampaignDirector(h.state, h.adapters),
    restored = restoreCampaignDirector(saved.json, h.adapters);
  assert.equal(restored.ok, true);
  assert.equal(h.world.cash, 60);
  assert.equal(h.world.health, 0);
  h.state = restored.state;
  assert.equal(
    retryCampaignMission(h.state, h.adapters).ok,
    false,
    'A retained retry needs an explicit mission owner.',
  );
  assert.equal(
    retryCampaignMission(h.state, h.adapters, { missionId: 'LL-ST-001' }).stageId,
    'one',
  );
  assert.equal(h.state.suspended.length, 0);
  assert.equal(h.state.active.attempt, 2);
  assert.equal(h.state.active.resumeInfo, null);
  assert.equal(h.world.cash, 100);
  assert.equal(h.world.health, 100);
  assert.equal(h.world.ammo, 9);
  assert.equal(h.world.actors[0].x, 12);
  assert.equal(h.world.physics.velocity, 3.5);
  assert(
    h.state.history.some((entry) => entry.event === 'mission-abandoned' && entry.retryPreserved),
  );
  assert(h.state.history.some((entry) => entry.event === 'mission-retried' && entry.fromSuspended));
  assert.deepEqual(Object.keys(h.state.completed), []);
});

for (const mode of ['retry-last-checkpoint', 'restart-mission'])
  test(`retained ${mode} restores its real named checkpoint or original start, including physical grants`, () => {
    const pack = content([
        mission(
          'LL-ST-001',
          [stage('one', { onComplete: [{ type: 'grant-item', id: 'manifest' }] }), stage('two')],
          {
            checkpoints: [
              { id: 'ready', afterStage: 'one', resumeStage: 'two', snapshot: ['world'] },
            ],
            failures: [
              {
                id: 'danger',
                condition: { type: 'danger' },
                resumeCheckpoint: 'ready',
                dialogue: [line('Danger')],
              },
            ],
          },
        ),
      ]),
      h = harness(pack);
    startCampaignMission(h.state, 'LL-ST-001', h.adapters);
    assert.equal(progress(h).stageId, 'two');
    h.world.cash -= 30;
    h.observe('danger');
    assert.equal(updateCampaignDirector(h.state, h.adapters).failed, true);
    abandonCampaignMission(h.state, h.adapters, { preserveRetry: true });
    assert.equal(h.world.cash, 70);
    const result = retryCampaignMission(h.state, h.adapters, { missionId: 'LL-ST-001', mode });
    assert.equal(result.stageId, mode === 'restart-mission' ? 'one' : 'two');
    assert.equal(h.world.cash, 100);
    assert.deepEqual(h.world.inventory, mode === 'restart-mission' ? [] : ['manifest']);
    assert.deepEqual(h.state.active.completedStages, mode === 'restart-mission' ? [] : ['one']);
    assert.equal(h.state.suspended.length, 0);
    assert.equal(h.state.active.attempt, 2);
    assert.equal(
      h.world.receipts.some((token) => token.endsWith(':restart')),
      mode === 'restart-mission',
    );
  });

test('failed retained retry rolls back restored physics and keeps the retained run and ordinary costs', () => {
  const h = harness();
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  h.world.cash = 47;
  h.world.health = 0;
  h.observe('danger');
  updateCampaignDirector(h.state, h.adapters);
  abandonCampaignMission(h.state, h.adapters, { preserveRetry: true });
  const director = copy(h.state),
    world = copy(h.world);
  h.adapters.activateStage = () => {
    h.world.cash = 1;
    h.world.actors[0].x = -90;
    return { ok: false };
  };
  assert.equal(
    retryCampaignMission(h.state, h.adapters, { missionId: 'LL-ST-001', mode: 'restart-mission' })
      .ok,
    false,
  );
  assert.deepEqual(h.state, director);
  assert.deepEqual(h.world, world);
});

test('retained retries cannot claim another active mission, bypass ordinary suspension, or undo completed external work', () => {
  const h = harness(
    content([mission('LL-ST-001', [stage('one')]), mission('LL-ST-002', [stage('two')])]),
  );
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  abandonCampaignMission(h.state, h.adapters, { preserveRetry: true });
  startCampaignMission(h.state, 'LL-ST-002', h.adapters);
  const owned = copy(h.state),
    world = copy(h.world);
  assert.equal(retryCampaignMission(h.state, h.adapters, { missionId: 'LL-ST-001' }).ok, false);
  assert.deepEqual(h.state, owned);
  assert.deepEqual(h.world, world);
  abandonCampaignMission(h.state, h.adapters);
  h.observe('onboarding-job-completed');
  recordExternalCampaignCompletion(h.state, 'first-shift', 'observed-work', h.adapters);
  h.world.cash = 72;
  const conflict = copy(h.state);
  assert.equal(retryCampaignMission(h.state, h.adapters, { missionId: 'LL-ST-001' }).ok, false);
  assert.deepEqual(h.state, conflict);
  assert.equal(h.world.cash, 72);

  const normal = harness();
  startCampaignMission(normal.state, 'LL-ST-001', normal.adapters);
  assert.equal(
    suspendCampaignMission(normal.state, normal.adapters, 'return-to-free-roam').ok,
    false,
  );
  suspendCampaignMission(normal.state, normal.adapters);
  assert.equal(
    retryCampaignMission(normal.state, normal.adapters, { missionId: 'LL-ST-001' }).ok,
    false,
  );
  normal.observe('mission-resume-permitted');
  assert.equal(resumeCampaignMission(normal.state, 'LL-ST-001', normal.adapters).ok, true);
});

test('serialized retained ownership requires its exact leave receipt, history, metadata and original checkpoint', () => {
  const h = harness();
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  abandonCampaignMission(h.state, h.adapters, { preserveRetry: true });
  for (const corrupt of [
    (s) => {
      s.suspended[0].resumeInfo.afterMission = 'LL-ST-001';
    },
    (s) => {
      s.suspended[0].resumeInfo.unowned = true;
    },
    (s) => {
      s.suspended[0].checkpoints = [];
    },
    (s) => {
      s.history.find((entry) => entry.event === 'mission-abandoned').retryPreserved = false;
    },
    (s) => {
      delete s.receipts[Object.keys(s.receipts).find((token) => token.endsWith(':abandon'))];
    },
    (s) => {
      s.active = s.suspended.pop();
    },
  ]) {
    const forged = copy(h.state);
    corrupt(forged);
    assert.throws(
      () => validateCampaignDirector(forged, h.adapters),
      /retained retry ownership|resumption metadata/,
    );
  }
  const envelope = JSON.parse(saveCampaignDirector(h.state, h.adapters).json),
    world = copy(h.world);
  envelope.director.suspended[0].checkpoints[0].world.cash = 'not-physical-cash';
  assert.equal(restoreCampaignDirector(JSON.stringify(envelope), h.adapters).ok, false);
  assert.deepEqual(
    h.world,
    world,
    'Invalid retained physical snapshots are rejected before touching the live world.',
  );
});

test('whole-state Continue preserves midphysics world and current dialogue without reactivation', () => {
  const h = harness();
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  h.world.physics.velocity = 17.25;
  h.world.actors[0].x = 81.5;
  h.world.ammo = 4;
  const saved = saveCampaignDirector(h.state, h.adapters);
  h.world.cash = 0;
  h.world.physics.velocity = 0;
  const restored = restoreCampaignDirector(saved.json, h.adapters);
  assert.equal(restored.ok, true);
  assert.equal(h.world.cash, 100);
  assert.equal(h.world.physics.velocity, 17.25);
  assert.equal(h.world.actors[0].x, 81.5);
  assert.equal(h.world.ammo, 4);
  assert.equal(h.world.activations.length, 1);
  assert.equal(currentCampaignDialogue(restored.state, h.adapters).line.text, 'Enter one');
});

test('corrupt content, choices, dialogue and world/checkpoint saves reject before mutating the parent', () => {
  const h = harness();
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  const original = JSON.parse(saveCampaignDirector(h.state, h.adapters).json),
    world = copy(h.world);
  for (const alter of [
    (save) => {
      save.director.contentFingerprint = 'wrong';
    },
    (save) => {
      save.director.active.choices.fake = 'win';
    },
    (save) => {
      save.director.active.dialogue.lines[0].text = 'Fabricated victory';
    },
    (save) => {
      save.director.suspended.push(copy(save.director.active));
    },
    (save) => {
      save.director.active.checkpoints[0].run.choices.fake = 'win';
    },
    (save) => {
      save.director.active.checkpoints[0].owned.completed = {};
    },
    (save) => {
      save.director.active.failure = { id: 'pretend-failure', sequence: 1 };
      save.director.active.phase = 'failed';
      save.director.active.dialogue = {
        kind: 'failure',
        lines: [line('Retry the physical attempt')],
        index: 0,
      };
    },
  ]) {
    const saved = copy(original);
    alter(saved);
    assert.throws(
      () => restoreCampaignDirector(JSON.stringify(saved), h.adapters),
      /Invalid campaign/,
    );
    assert.deepEqual(h.world, world);
  }
  const brokenWorld = copy(original);
  brokenWorld.world.actors[0].x = null;
  assert.equal(restoreCampaignDirector(JSON.stringify(brokenWorld), h.adapters).ok, false);
  assert.deepEqual(h.world, world);
  const brokenCheckpoint = copy(original);
  brokenCheckpoint.director.active.checkpoints[0].world.physics = null;
  assert.equal(restoreCampaignDirector(JSON.stringify(brokenCheckpoint), h.adapters).ok, false);
  assert.deepEqual(h.world, world);
});

test('callbacks must be synchronous; a parent exception is compensated and cannot commit completion', () => {
  const h = harness();
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  acknowledge(h.state, h.adapters);
  h.observe('physical-done');
  const state = copy(h.state),
    world = copy(h.world);
  h.adapters.activateStage = () => {
    h.world.cash = 0;
    throw new Error('Renderer adapter failed');
  };
  assert.throws(() => updateCampaignDirector(h.state, h.adapters), /Renderer adapter failed/);
  assert.deepEqual(h.state, state);
  assert.deepEqual(h.world, world);
  h.adapters.observe = () => Promise.resolve(true);
  assert.throws(() => updateCampaignDirector(h.state, h.adapters), /must be synchronous/);
});

test('same seed, data, input acknowledgments and observed conditions serialize identically', () => {
  const a = harness(),
    b = harness();
  for (const h of [a, b]) {
    startCampaignMission(h.state, 'LL-ST-001', h.adapters);
    progress(h);
    progress(h);
  }
  assert.deepEqual(a.state, b.state);
  assert.deepEqual(a.world, b.world);
  assert.equal(
    saveCampaignDirector(a.state, a.adapters).json,
    saveCampaignDirector(b.state, b.adapters).json,
  );
  assert.equal(validateCampaignDirector(a.state, a.adapters), true);
  assert.equal(currentCampaignStage(a.state, a.adapters), null);
});

test('observed parent facts persist for conditional dialogue but cannot complete a physical objective', () => {
  const h = harness(
    content([
      mission('LL-ST-001', [
        stage('one', {
          dialogue: [line('Unspotted', 'courier-unspotted'), line('Detected', 'courier-spotted')],
        }),
      ]),
    ]),
  );
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  assert.equal(
    recordCampaignFacts(h.state, { 'courier-spotted': false }, 'tail-observation', h.adapters).ok,
    false,
  );
  h.observe('campaign-facts-observed');
  assert.equal(
    recordCampaignFacts(h.state, { 'courier-spotted': false }, 'tail-observation', h.adapters).ok,
    true,
  );
  assert.equal(currentCampaignDialogue(h.state, h.adapters).line.text, 'Unspotted');
  assert.equal(
    recordCampaignFacts(h.state, { 'courier-spotted': true }, 'tail-observation', h.adapters)
      .alreadyRecorded,
    true,
  );
  assert.equal(h.state.flags['courier-spotted'], false);
  acknowledge(h.state, h.adapters);
  assert.equal(updateCampaignDirector(h.state, h.adapters).waiting, 'observed-conditions');
  assert.equal(recordCampaignFacts(h.state, { unsafe: {} }, 'invalid-facts', h.adapters).ok, false);
});

test('full restart uses a parent reset transaction and first stage; free-roam retry preserves ordinary costs', () => {
  const h = harness();
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  progress(h);
  assert.equal(h.state.active.stageId, 'two');
  assert.equal(
    retryCampaignMission(h.state, h.adapters, { mode: 'restart-mission' }).stageId,
    'one',
  );
  assert.deepEqual(h.state.active.completedStages, []);
  assert.equal(h.state.active.attempt, 2);
  h.world.cash -= 40;
  assert.equal(
    retryCampaignMission(h.state, h.adapters, { mode: 'return-to-free-roam' }).reward,
    false,
  );
  assert.equal(h.world.cash, 60);
  assert.equal(h.state.active, null);
});

test('manual suspension preserves the acknowledged dialogue cursor rather than replaying its introduction', () => {
  const h = harness(
    content([mission('LL-ST-001', [stage('one', { dialogue: [line('First'), line('Second')] })])]),
  );
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  advanceCampaignDialogue(h.state, h.adapters);
  suspendCampaignMission(h.state, h.adapters);
  h.observe('mission-resume-permitted');
  resumeCampaignMission(h.state, 'LL-ST-001', h.adapters);
  assert.equal(currentCampaignDialogue(h.state, h.adapters).line.text, 'Second');
});

test('failure interrupts concurrent phone dialogue and cannot be masked by the phone overlay', () => {
  const h = harness(
    content([
      mission('LL-ST-019', [
        stage('tail'),
        stage('phone', {
          type: 'test-phone-event',
          concurrentWith: 'tail',
          completion: [{ type: 'phone-distraction-resolved' }],
          dialogue: [line('Still on phone')],
        }),
        stage('stairs'),
      ]),
    ]),
  );
  startCampaignMission(h.state, 'LL-ST-019', h.adapters);
  h.observe('concurrent-event-ready');
  activateConcurrentCampaignEvent(h.state, 'phone', h.adapters);
  h.observe('danger');
  assert.equal(updateCampaignDirector(h.state, h.adapters).failed, true);
  assert.equal(currentCampaignDialogue(h.state, h.adapters).kind, 'failure');
  assert.equal(currentCampaignDialogue(h.state, h.adapters).line.text, 'Observed failure');
});

test('losing a stage handler midmission becomes an integration gate rather than an observed success', () => {
  const h = harness();
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  acknowledge(h.state, h.adapters);
  h.observe('physical-done');
  h.adapters.supportsStage = () => false;
  assert.deepEqual(updateCampaignDirector(h.state, h.adapters).unmet, [
    'unintegrated-stage:test-physical-stage',
  ]);
  assert.equal(h.state.active.stageId, 'one');
  assert.equal(h.world.cash, 100);
});

test('a declined reward transaction cannot leave money, completion, consequences or a receipt behind', () => {
  const h = harness(content([mission('LL-ST-001', [stage('one')])]));
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  acknowledge(h.state, h.adapters);
  h.observe('physical-done');
  const state = copy(h.state),
    world = copy(h.world);
  h.adapters.applyActions = (actions) => {
    assert.equal(actions[0].type, 'campaign-reward');
    h.world.cash += 10;
    return { ok: false };
  };
  assert.equal(updateCampaignDirector(h.state, h.adapters).ok, false);
  assert.deepEqual(h.state, state);
  assert.deepEqual(h.world, world);
});

test('actor-derived action facts require the actual named observed value before progression', () => {
  const h = harness(
    content([
      mission('LL-ST-001', [
        stage('one', {
          onComplete: [
            {
              type: 'flag-from-actor',
              id: 'owner-fate',
              actor: 'owner',
              values: ['alive', 'dead'],
            },
          ],
        }),
        stage('two'),
      ]),
    ]),
  );
  startCampaignMission(h.state, 'LL-ST-001', h.adapters);
  acknowledge(h.state, h.adapters);
  h.observe('physical-done');
  assert.deepEqual(updateCampaignDirector(h.state, h.adapters).unmet, [
    'missing-observed-fact:owner-fate',
  ]);
  assert.equal(h.state.active.stageId, 'one');
  h.adapters.applyActions = () => ({ ok: true, facts: { 'owner-fate': 'alive' } });
  assert.equal(updateCampaignDirector(h.state, h.adapters).stageId, 'two');
  assert.equal(h.state.flags['owner-fate'], 'alive');
});
