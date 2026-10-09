/**
 * Pure deterministic campaign bookkeeping. This is not a physical mission engine.
 * The default pack remains authored-unintegrated. Missing capabilities, handlers
 * and observations are gates, never successful objectives. Contract-test adapters
 * are not evidence of playable routes/combat or release-verified campaign credit.
 *
 * All parent callbacks are synchronous. applyActions(batch, context) must be atomic
 * and deduplicate context.receipt in its own world transaction ledger. A failed
 * transition is compensated with the complete captureWorld/restoreWorld snapshot.
 * saveCampaignDirector includes that complete parent world and the director state.
 *
 * Adapter contract:
 * - capabilities[id] is true/{ready:true} only for an integrated implementation.
 * - supportsStage/Condition/Action explicitly register individual handlers.
 * - observe(rule, context) is read-only and returns boolean or {met:boolean};
 *   undefined/{unmet:reason} blocks. Parent simulation owns every clock/physics.
 * - activateStage(stage, context) returns true/{ok:true} only after real setup;
 *   context.reason distinguishes start/transition/retry/resume and has a receipt.
 * - applyActions(batch, context) returns true/{ok:true,facts?}; derived actor/car
 *   actions must return their actual named facts. Descriptive string effects are
 *   explicit authored-effect contracts, never executable instructions or wins.
 * - captureWorld returns the complete JSON simulation/economy/transaction state;
 *   validateWorld returns true only for its actual schema; restoreWorld acks it.
 * - readOutcome supplies a real completed minigame outcome, including quit.
 * - optional canCompleteStage(stage, context) adds an observed physical staging
 *   gate AFTER authored conditions; false waits and unknown blocks. Adapters
 *   without this hook retain the pure director's existing contract.
 * - route events explicitly call activateConcurrentCampaignEvent; no event is
 *   started by a director timer. Unknown rules are not silently skipped.
 */
import {
  FIRST_ARC_MISSIONS,
  FIRST_ARC_SCENES,
  FIRST_ARC_CAPABILITY_AUDIT,
  FIRST_ARC_MANIFEST,
} from './first-arc.js';
import { FIRST_ARC_05_CONTENT, FIRST_ARC_05_FINGERPRINT } from './history/first-arc-0.5.js';

export const CAMPAIGN_CONTENT = Object.freeze({
  missions: FIRST_ARC_MISSIONS,
  scenes: FIRST_ARC_SCENES,
  capabilities: FIRST_ARC_CAPABILITY_AUDIT,
  manifest: FIRST_ARC_MANIFEST,
});
export const CAMPAIGN_CONTENT_HISTORY = Object.freeze({
  [FIRST_ARC_05_FINGERPRINT]: FIRST_ARC_05_CONTENT,
});
const VERSION = 1;
const MAX_JSON_BYTES = 32 * 1024 * 1024;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const own = (value, key) => Object.hasOwn(value, key);
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const id = (value) => typeof value === 'string' && value.length > 0 && value.length <= 256;
const integer = (value, max = 1e9) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const receiptKinds = new Set([
  'stage-activation',
  'concurrent-activation',
  'choice',
  'stage-completion',
  'failure',
  'mission-reward',
  'concurrent-completion',
  'abandon',
  'suspend',
  'restart',
  'observed-facts',
]);
const fingerprints = new WeakMap();
const immutableContents = new WeakSet([CAMPAIGN_CONTENT, FIRST_ARC_05_CONTENT]);

function invalid(reason) {
  throw new Error(`Invalid campaign state: ${reason}.`);
}
function clone(value, depth = 0) {
  if (depth > 120) invalid('JSON nesting');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (value.length > 100000) invalid('JSON array size');
    for (let i = 0; i < value.length; i++) if (!own(value, i)) invalid('sparse JSON array');
    return value.map((item) => clone(item, depth + 1));
  }
  if (!object(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    invalid('non-JSON value');
  const result = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || forbidden.has(key)) invalid('unsafe JSON key');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!own(descriptor, 'value') || !descriptor.enumerable) invalid('JSON accessor/property');
    result[key] = clone(descriptor.value, depth + 1);
  }
  return result;
}
function frozen(value) {
  if (object(value) || Array.isArray(value)) {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}
function hash(value) {
  let result = 2166136261;
  for (const char of JSON.stringify(value))
    result = Math.imul(result ^ char.charCodeAt(0), 16777619) >>> 0;
  return result.toString(16).padStart(8, '0');
}
function contentOf(adapters = {}) {
  const content = adapters.content || CAMPAIGN_CONTENT;
  if (
    !object(content) ||
    !Array.isArray(content.missions) ||
    !object(content.manifest) ||
    !id(content.manifest.id)
  )
    invalid('content');
  return content;
}
function fingerprint(content) {
  // Recompute mutable fixture/custom packs; approved shipped/history data is frozen.
  if (immutableContents.has(content) && fingerprints.has(content)) return fingerprints.get(content);
  const result = hash(clone(content));
  if (immutableContents.has(content)) fingerprints.set(content, result);
  return result;
}
export function campaignContentFingerprint(adapters = {}) {
  return fingerprint(contentOf(adapters));
}
export function campaignReceiptNamespace(state) {
  return own(state, 'receiptNamespace') ? state.receiptNamespace : state.contentFingerprint;
}
function historicalContent(namespace, adapters) {
  const history = adapters.contentHistory ?? CAMPAIGN_CONTENT_HISTORY;
  if (!object(history)) invalid('content history');
  const descriptor = Object.getOwnPropertyDescriptor(history, namespace);
  if (!descriptor || !own(descriptor, 'value')) invalid('unknown campaign content version');
  const content = contentOf({ content: descriptor.value });
  if (fingerprint(content) !== namespace) invalid('historical content fingerprint');
  return content;
}
function missionFor(content, missionId) {
  return content.missions.find((mission) => mission.id === missionId);
}
function stageFor(content, run) {
  return missionFor(content, run.missionId)?.stages.find((stage) => stage.id === run.stageId);
}
function context(state, extra = {}) {
  return frozen(
    clone({
      contentId: state.contentId,
      sequence: state.sequence,
      seed: state.seed,
      missionId: state.active?.missionId || null,
      stageId: state.active?.stageId || null,
      attempt: state.active?.attempt || null,
      choices: state.active?.choices || {},
      flags: state.flags,
      completed: Object.keys(state.completed),
      externalCompleted: Object.keys(state.externalCompleted),
      onboardingCompleted: Object.keys(state.onboardingCompleted),
      evidence: 'parent-observation-contract; not release verification',
      ...extra,
    }),
  );
}
function call(adapters, name, args) {
  if (typeof adapters[name] !== 'function') return { unmet: `missing-adapter:${name}` };
  const value = adapters[name](...args);
  if (value && typeof value.then === 'function')
    throw new Error(`Campaign adapter ${name} must be synchronous.`);
  return { value };
}
function gate(unmet, extra = {}) {
  return { ok: false, unmet: [...new Set(unmet)], ...extra };
}
function accepted(value) {
  return value === true || (object(value) && value.ok === true);
}
function metValue(value) {
  if (typeof value === 'boolean') return { met: value, unmet: [] };
  if (object(value) && typeof value.met === 'boolean') return { met: value.met, unmet: [] };
  return {
    met: false,
    unmet: [object(value) && id(value.unmet) ? value.unmet : 'unresolved-observation'],
  };
}
function completed(state, missionId) {
  return own(state.completed, missionId) || own(state.externalCompleted, missionId);
}
function query(state, condition, adapters) {
  if (!object(condition) || !id(condition.type))
    return { met: false, unmet: ['invalid-condition'] };
  if (condition.type === 'flag-is')
    return {
      met: own(state.flags, condition.id) && state.flags[condition.id] === condition.value,
      unmet: [],
    };
  if (condition.type === 'choice-is')
    return { met: state.active?.choices[condition.id] === condition.value, unmet: [] };
  if (condition.type === 'mission-incomplete')
    return { met: !completed(state, condition.id), unmet: [] };
  if (condition.type === 'branch-resolved')
    return { met: own(state.active?.choices || {}, condition.choice), unmet: [] };
  if (condition.type === 'dialogue-finished') {
    const next = peekDialogue(state, adapters);
    return { met: !next.line && next.unmet.length === 0, unmet: next.unmet };
  }
  if (condition.type === 'conditional-hostile-neutralized' && condition.enabledWhen) {
    const enabled = when(state, condition.enabledWhen, adapters);
    if (enabled.unmet.length) return enabled;
    if (!enabled.met) return { met: true, unmet: [] };
  }
  const supported = call(adapters, 'supportsCondition', [condition.type]);
  if (supported.unmet || supported.value !== true)
    return { met: false, unmet: [supported.unmet || `unintegrated-condition:${condition.type}`] };
  const result = call(adapters, 'observe', [frozen(clone(condition)), context(state)]);
  if (result.unmet) return { met: false, unmet: [result.unmet] };
  const answer = metValue(result.value);
  if (answer.unmet.length)
    answer.unmet = answer.unmet.map((reason) => `${condition.type}:${reason}`);
  return answer;
}
function when(state, expression, adapters) {
  if (expression === undefined || expression === 'always') return { met: true, unmet: [] };
  if (object(expression)) return query(state, expression, adapters);
  if (!id(expression)) return { met: false, unmet: ['invalid-dialogue-condition'] };
  const missionExpression = /^(LL-ST-\d{3})-(complete|incomplete)$/.exec(expression);
  if (missionExpression)
    return {
      met: completed(state, missionExpression[1]) === (missionExpression[2] === 'complete'),
      unmet: [],
    };
  const comparison = /^([a-zA-Z0-9_-]+)(=|>=)(.+)$/.exec(expression);
  if (comparison && own(state.flags, comparison[1])) {
    const actual = state.flags[comparison[1]],
      expected = comparison[3];
    return {
      met:
        comparison[2] === '='
          ? String(actual) === expected
          : typeof actual === 'number' && actual >= Number(expected),
      unmet: [],
    };
  }
  if (own(state.flags, expression)) return { met: Boolean(state.flags[expression]), unmet: [] };
  if (expression === 'courier-unspotted' && own(state.flags, 'courier-spotted'))
    return { met: !state.flags['courier-spotted'], unmet: [] };
  return query(state, { type: 'dialogue-condition', expression }, adapters);
}
function peekDialogue(state, adapters) {
  const event = Object.values(state.active?.concurrent || {}).find(
    (entry) => entry.status === 'active',
  );
  const dialogue = event?.dialogue || state.active?.dialogue;
  if (!dialogue) return { line: null, index: 0, unmet: [], kind: null };
  for (let index = dialogue.index; index < dialogue.lines.length; index++) {
    const candidate = dialogue.lines[index],
      result = when(state, candidate.when, adapters);
    if (result.unmet.length) return { line: null, index, unmet: result.unmet, kind: dialogue.kind };
    if (result.met) return { line: clone(candidate), index, unmet: [], kind: dialogue.kind };
  }
  return { line: null, index: dialogue.lines.length, unmet: [], kind: dialogue.kind };
}
function pushHistory(state, event, details = {}) {
  if (state.history.length >= 25000)
    invalid('history capacity; archive explicitly before continuing');
  state.sequence++;
  state.history.push({ sequence: state.sequence, event, ...clone(details) });
}
function receipt(state, suffix) {
  return `campaign:${campaignReceiptNamespace(state)}:${suffix}`;
}
function commit(state, draft) {
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, draft);
}

export function createCampaignDirector(options = {}) {
  const content = contentOf(options);
  const seed = options.seed ?? 1;
  if (!integer(seed, 0xffffffff)) invalid('seed');
  const state = {
    schemaVersion: VERSION,
    contentId: content.manifest.id,
    contentFingerprint: fingerprint(content),
    seed,
    sequence: 0,
    completed: {},
    externalCompleted: {},
    onboardingCompleted: {},
    flags: {},
    trust: {},
    unlocks: [],
    deferredUnlocks: [],
    queued: [],
    streetContent: {},
    attempts: {},
    receipts: {},
    active: null,
    suspended: [],
    history: [],
  };
  validateCampaignDirector(state, options);
  return state;
}
function prerequisites(state, mission) {
  return (mission.dependencies?.all || []).filter((missionId) => !completed(state, missionId));
}
function capabilityGates(mission, adapters) {
  if (typeof adapters.supportsMission === 'function') {
    const supported = call(adapters, 'supportsMission', [mission.id, frozen(clone(mission))]);
    if (supported.unmet || supported.value !== true)
      return [supported.unmet || `unregistered-mission-handler:${mission.id}`];
  }
  const scoped =
    typeof adapters.capabilitiesForMission === 'function'
      ? call(adapters, 'capabilitiesForMission', [mission.id])
      : { value: adapters.capabilities };
  if (scoped.unmet) return [scoped.unmet];
  if (typeof adapters.capabilitiesForMission === 'function' && !object(scoped.value))
    return [`unresolved-mission-capabilities:${mission.id}`];
  return (mission.requiredCapabilities || []).flatMap(({ id: capability }) => {
    if (capability === 'director') return [];
    const entry = scoped.value?.[capability];
    return entry === true || (object(entry) && entry.ready === true)
      ? []
      : [`unintegrated-capability:${capability}`];
  });
}
function adapterGates(adapters) {
  return [
    'supportsStage',
    'activateStage',
    'supportsCondition',
    'observe',
    'supportsAction',
    'applyActions',
    'captureWorld',
    'restoreWorld',
    'validateWorld',
  ]
    .filter((name) => typeof adapters[name] !== 'function')
    .map((name) => `missing-adapter:${name}`);
}
export function campaignAvailability(state, adapters = {}) {
  validateCampaignDirector(state, adapters);
  return contentOf(adapters).missions.map((mission) => {
    const dependencies = prerequisites(state, mission);
    const unmet = [...capabilityGates(mission, adapters), ...adapterGates(adapters)];
    const inProgress =
      state.active?.missionId === mission.id ||
      state.suspended.some((run) => run.missionId === mission.id);
    return {
      id: mission.id,
      status: completed(state, mission.id)
        ? 'completed'
        : inProgress
          ? 'in-progress'
          : dependencies.length
            ? 'dependency-locked'
            : unmet.length
              ? 'unmet-integration-gates'
              : 'available-for-parent-activation',
      dependencies,
      unmet,
      authoringStatus: mission.status,
      runtimeValidated: mission.runtimeValidated === true,
      evidenceBoundary:
        'Availability/contract progress does not certify playable campaign content.',
    };
  });
}
export function currentCampaignStage(state, adapters = {}) {
  validateCampaignDirector(state, adapters);
  return state.active ? clone(stageFor(contentOf(adapters), state.active)) : null;
}
export function currentCampaignDialogue(state, adapters = {}) {
  validateCampaignDirector(state, adapters);
  const result = peekDialogue(state, adapters);
  return {
    ...result,
    missionId: state.active?.missionId || null,
    stageId: state.active?.stageId || null,
  };
}
export function advanceCampaignDialogue(state, adapters = {}) {
  validateCampaignDirector(state, adapters);
  if (!state.active) return gate(['no-active-mission']);
  const next = peekDialogue(state, adapters);
  if (next.unmet.length) return gate(next.unmet);
  if (!next.line) return { ok: true, done: true };
  const event = Object.values(state.active.concurrent).find((entry) => entry.status === 'active');
  const dialogue = event?.dialogue || state.active.dialogue;
  dialogue.index = next.index + 1;
  pushHistory(state, 'dialogue-acknowledged', {
    missionId: state.active.missionId,
    stageId: state.active.stageId,
    kind: dialogue.kind,
    index: next.index,
  });
  return { ok: true, done: !peekDialogue(state, adapters).line };
}
function capture(state, adapters, reason) {
  const result = call(adapters, 'captureWorld', [context(state, { reason })]);
  if (result.unmet) return gate([result.unmet]);
  const world = clone(result.value);
  const valid = call(adapters, 'validateWorld', [frozen(clone(world)), context(state, { reason })]);
  if (valid.unmet || valid.value !== true)
    return gate([valid.unmet || 'invalid-parent-world-snapshot']);
  return { ok: true, world };
}
function restoreWorld(state, world, adapters, reason) {
  const valid = call(adapters, 'validateWorld', [frozen(clone(world)), context(state, { reason })]);
  if (valid.unmet || valid.value !== true)
    return gate([valid.unmet || 'invalid-parent-world-snapshot']);
  const result = call(adapters, 'restoreWorld', [frozen(clone(world)), context(state, { reason })]);
  return result.unmet || !accepted(result.value)
    ? gate([result.unmet || 'parent-world-restore-declined'])
    : { ok: true };
}
function transaction(state, adapters, reason, operation) {
  const before = capture(state, adapters, `before:${reason}`);
  if (!before.ok) return before;
  const draft = clone(state);
  try {
    const result = operation(draft);
    if (result.ok) {
      validateCampaignDirector(draft, adapters);
      commit(state, draft);
      return result;
    }
    const restored = restoreWorld(state, before.world, adapters, `rollback:${reason}`);
    if (!restored.ok)
      throw new Error(`Campaign transaction rollback failed: ${restored.unmet.join(', ')}.`);
    return result;
  } catch (error) {
    const restored = restoreWorld(state, before.world, adapters, `rollback:${reason}`);
    if (!restored.ok)
      throw new Error(
        `Campaign rollback failed after ${error.message}: ${restored.unmet.join(', ')}.`,
      );
    throw error;
  }
}
function checkpointSnapshot(state, run, definition, adapters) {
  const saved = capture(state, adapters, `checkpoint:${definition.id}`);
  if (!saved.ok) return saved;
  return {
    ok: true,
    checkpoint: {
      id: definition.id,
      resumeStage: definition.resumeStage,
      afterStage: definition.afterStage || null,
      sequence: state.sequence,
      progressFingerprint: hash([
        state.completed,
        state.externalCompleted,
        state.onboardingCompleted,
      ]),
      owned: clone({
        flags: state.flags,
        trust: state.trust,
        unlocks: state.unlocks,
        deferredUnlocks: state.deferredUnlocks,
        queued: state.queued,
        streetContent: state.streetContent,
        receipts: state.receipts,
      }),
      run: clone({
        choices: run.choices,
        completedStages: run.completedStages,
        stageVisits: run.stageVisits,
        variant: run.variant,
      }),
      world: saved.world,
    },
  };
}
function enabledStage(state, mission, candidateId, adapters) {
  let index = mission.stages.findIndex((stage) => stage.id === candidateId);
  if (index < 0) return gate([`unknown-stage:${candidateId}`]);
  const visited = new Set();
  while (index < mission.stages.length) {
    const stage = mission.stages[index];
    if (visited.has(stage.id)) return gate(['disabled-stage-cycle']);
    visited.add(stage.id);
    if (stage.concurrentWith) {
      index++;
      continue;
    }
    const enabled = stage.enabledWhen
      ? query(state, stage.enabledWhen, adapters)
      : { met: true, unmet: [] };
    if (enabled.unmet.length) return gate(enabled.unmet);
    if (enabled.met) return { ok: true, stage };
    if (stage.disabledNext)
      index = mission.stages.findIndex((candidate) => candidate.id === stage.disabledNext);
    else index++;
    if (index < 0) return gate(['invalid-disabled-stage-target']);
  }
  return { ok: true, stage: null };
}
function activate(state, run, stage, adapters, reason) {
  const supported = call(adapters, 'supportsStage', [stage.type, frozen(clone(stage))]);
  if (supported.unmet || supported.value !== true)
    return gate([supported.unmet || `unintegrated-stage:${stage.type}`]);
  run.stageId = stage.id;
  run.stageVisits[stage.id] = (run.stageVisits[stage.id] || 0) + 1;
  run.phase = 'running';
  run.outcome = null;
  let lines = stage.dialogue;
  if (stage.alternateDialogue) {
    const alternatives = stage.alternateDialogue.map((candidate) =>
      when(state, candidate.when, adapters),
    );
    const unmet = alternatives.flatMap((result) => result.unmet);
    if (unmet.length) return gate(unmet);
    if (alternatives.some((result) => result.met)) lines = stage.alternateDialogue;
  }
  run.dialogue = {
    kind: lines === stage.dialogue ? 'stage' : 'alternate',
    lines: clone(lines),
    index: 0,
  };
  run.concurrent = {};
  const mission = missionFor(contentOf(adapters), run.missionId);
  const events = mission.stages.filter((event) => event.concurrentWith === stage.id);
  for (const event of events) {
    const eventSupported = call(adapters, 'supportsStage', [event.type, frozen(clone(event))]);
    if (eventSupported.unmet || eventSupported.value !== true)
      return gate([eventSupported.unmet || `unintegrated-stage:${event.type}`]);
    run.concurrent[event.id] = { resolved: false, status: 'pending', dialogue: null };
  }
  const token = receipt(
    state,
    `${run.missionId}:attempt:${run.attempt}:activate:${stage.id}:${run.stageVisits[stage.id]}`,
  );
  const result = call(adapters, 'activateStage', [
    frozen(clone(stage)),
    context(state, {
      reason,
      receipt: token,
      variant: run.variant,
      concurrentStages: events,
      resumeInfo: run.resumeInfo,
    }),
  ]);
  if (result.unmet || !accepted(result.value))
    return gate([result.unmet || `stage-activation-declined:${stage.id}`]);
  state.receipts[token] = {
    kind: 'stage-activation',
    missionId: run.missionId,
    attempt: run.attempt,
    stageId: stage.id,
  };
  pushHistory(state, 'stage-activated', {
    missionId: run.missionId,
    stageId: stage.id,
    attempt: run.attempt,
  });
  return { ok: true, stageId: stage.id };
}
export function startCampaignMission(state, missionId, adapters = {}, options = {}) {
  validateCampaignDirector(state, adapters);
  const content = contentOf(adapters),
    mission = missionFor(content, missionId);
  if (!mission) return gate([`not-authored-in-pack:${missionId}`]);
  if (state.active) return gate(['active-mission-must-finish-or-suspend']);
  if (completed(state, missionId)) return gate(['mission-already-completed']);
  if (state.suspended.some((run) => run.missionId === missionId))
    return gate(['mission-already-suspended']);
  const missing = [
    ...prerequisites(state, mission).map((dep) => `dependency:${dep}`),
    ...capabilityGates(mission, adapters),
    ...adapterGates(adapters),
  ];
  if (missing.length) return gate(missing);
  return transaction(state, adapters, `start:${missionId}`, (draft) => {
    const run = {
      missionId,
      attempt: (draft.attempts[missionId] || 0) + 1,
      stageId: mission.startStage,
      phase: 'running',
      variant:
        options.variant || draft.queued.find((item) => item.id === missionId)?.variant || null,
      choices: {},
      completedStages: [],
      stageVisits: {},
      concurrent: {},
      checkpoints: [],
      failure: null,
      outcome: null,
      dialogue: { kind: 'stage', lines: [], index: 0 },
      resumeInfo: null,
    };
    draft.active = run;
    draft.attempts[missionId] = run.attempt;
    draft.queued = draft.queued.filter((item) => item.id !== missionId);
    const selected = enabledStage(draft, mission, mission.startStage, adapters);
    if (!selected.ok || !selected.stage)
      return selected.ok ? gate(['mission-has-no-enabled-start']) : selected;
    const start = checkpointSnapshot(
      draft,
      run,
      { id: 'start', resumeStage: selected.stage.id },
      adapters,
    );
    if (!start.ok) return start;
    run.checkpoints.push(start.checkpoint);
    return activate(draft, run, selected.stage, adapters, 'start');
  });
}
const internalActions = new Set([
  'flag',
  'trust',
  'unlock',
  'unlock-when',
  'activate-mission',
  'queue-mission',
]);
function refreshUnlocks(state) {
  const pending = [];
  for (const unlock of state.deferredUnlocks) {
    if (unlock.all.every((missionId) => completed(state, missionId))) addUnlock(state, unlock.id);
    else pending.push(unlock);
  }
  state.deferredUnlocks = pending;
  state.queued = state.queued.filter((entry) => !completed(state, entry.id));
}
function addUnlock(state, value) {
  if (!id(value)) invalid('unlock');
  const conditional = /^(.+) when (LL-ST-\d{3}) (?:also )?complete$/.exec(value);
  if (conditional) {
    state.deferredUnlocks.push({ id: conditional[1], all: [conditional[2]] });
    return;
  }
  if (!state.unlocks.includes(value)) state.unlocks.push(value);
}
function internalAction(state, action) {
  if (action.type === 'flag') state.flags[action.id] = clone(action.value);
  if (action.type === 'trust')
    state.trust[action.actor] = (state.trust[action.actor] || 0) + action.delta;
  if (action.type === 'unlock')
    (action.ids || [action.id]).forEach((value) => addUnlock(state, value));
  if (action.type === 'unlock-when')
    state.deferredUnlocks.push({ id: action.id, all: clone(action.all) });
  if (action.type === 'activate-mission')
    state.active.pendingActivation = { id: action.id, variant: action.variant || null };
  if (action.type === 'queue-mission') {
    if (completed(state, action.id)) return;
    const variant = action.variantWhen && state.flags[action.variantWhen] ? action.variant : null;
    const entry = { id: action.id, variant };
    const prior = state.queued.findIndex((item) => item.id === action.id);
    if (prior < 0) state.queued.push(entry);
    else state.queued[prior] = entry;
  }
}
function effects(state, actions, token, adapters, kind) {
  if (own(state.receipts, token)) return { ok: true, alreadyApplied: true };
  const normalized = actions.map((action) =>
    typeof action === 'string' ? { type: 'authored-effect', text: action } : clone(action),
  );
  const external = normalized.filter((action) => !internalActions.has(action.type));
  for (const action of external) {
    const support = call(adapters, 'supportsAction', [action.type]);
    if (support.unmet || support.value !== true)
      return gate([support.unmet || `unintegrated-action:${action.type}`]);
  }
  if (external.length) {
    const result = call(adapters, 'applyActions', [
      frozen(clone(external)),
      context(state, { receipt: token, kind }),
    ]);
    if (result.unmet || !accepted(result.value))
      return gate([result.unmet || `parent-actions-declined:${kind}`]);
    const facts = object(result.value) && result.value.facts ? clone(result.value.facts) : {};
    if (!validFacts(facts)) return gate(['invalid-action-facts']);
    for (const action of normalized.filter(
      (item) => item.type === 'flag-from-actor' || item.type === 'record-vehicle-condition',
    )) {
      if (!own(facts, action.id) || (action.values && !action.values.includes(facts[action.id])))
        return gate([`missing-observed-fact:${action.id}`]);
    }
    Object.assign(state.flags, facts);
  }
  normalized
    .filter((action) => internalActions.has(action.type))
    .forEach((action) => internalAction(state, action));
  for (const action of normalized) {
    if (
      ['queue-street-content', 'unlock-street-content', 'disable-street-content'].includes(
        action.type,
      )
    )
      state.streetContent[action.id] = {
        status: action.type === 'disable-street-content' ? 'disabled' : 'pending-integration',
        receipt: token,
      };
  }
  state.receipts[token] = {
    kind,
    missionId: state.active?.missionId || null,
    attempt: state.active?.attempt || null,
    stageId: state.active?.stageId || null,
  };
  refreshUnlocks(state);
  return { ok: true };
}
export function chooseCampaignOption(state, choiceId, optionId, adapters = {}) {
  validateCampaignDirector(state, adapters);
  const run = state.active;
  if (!run || run.phase === 'failed') return gate(['no-running-mission']);
  const mission = missionFor(contentOf(adapters), run.missionId);
  const choice = mission.choices.find(
    (entry) => entry.id === choiceId && entry.stage === run.stageId,
  );
  const option = choice?.options.find((entry) => entry.id === optionId);
  if (!option) return gate(['choice-not-available-in-active-stage']);
  if (own(run.choices, choiceId))
    return run.choices[choiceId] === optionId
      ? { ok: true, alreadyChosen: true }
      : gate(['choice-already-committed']);
  // Even a menu selection must be permitted by real state. In particular, the
  // emergent chase/death/tail options cannot set their own physical evidence.
  const permitted = query(
    state,
    {
      type: 'choice-permitted',
      missionId: run.missionId,
      stageId: run.stageId,
      choiceId,
      optionId,
    },
    adapters,
  );
  if (permitted.unmet.length || !permitted.met)
    return gate(
      permitted.unmet.length ? permitted.unmet : ['choice-not-permitted-by-observed-state'],
    );
  return transaction(state, adapters, `choice:${choiceId}`, (draft) => {
    const result = effects(
      draft,
      option.effects || [],
      receipt(draft, `${run.missionId}:attempt:${run.attempt}:choice:${choiceId}`),
      adapters,
      'choice',
    );
    if (!result.ok) return result;
    draft.active.choices[choiceId] = optionId;
    pushHistory(draft, 'choice-committed', {
      missionId: run.missionId,
      stageId: run.stageId,
      choiceId,
      optionId,
    });
    return { ok: true };
  });
}
/** Called by the parent's observed route/phone event, not a director clock. */
export function activateConcurrentCampaignEvent(state, eventId, adapters = {}) {
  validateCampaignDirector(state, adapters);
  const run = state.active;
  if (!run || run.phase === 'failed') return gate(['no-running-mission']);
  const mission = missionFor(contentOf(adapters), run.missionId);
  const event = mission.stages.find(
    (entry) => entry.id === eventId && entry.concurrentWith === run.stageId,
  );
  if (!event || !own(run.concurrent, eventId))
    return gate(['concurrent-event-not-in-active-stage']);
  if (run.concurrent[eventId].status !== 'pending') return { ok: true, alreadyActivated: true };
  if (Object.values(run.concurrent).some((entry) => entry.status === 'active'))
    return gate(['concurrent-dialogue-already-active']);
  const ready = query(
    state,
    { type: 'concurrent-event-ready', eventId, ownerStage: run.stageId },
    adapters,
  );
  if (ready.unmet.length || !ready.met)
    return gate(ready.unmet.length ? ready.unmet : ['concurrent-event-not-observed']);
  return transaction(state, adapters, `concurrent:${eventId}`, (draft) => {
    const token = receipt(
      draft,
      `${run.missionId}:attempt:${run.attempt}:concurrent:${eventId}:${run.stageVisits[run.stageId]}`,
    );
    const result = call(adapters, 'activateStage', [
      frozen(clone(event)),
      context(draft, {
        reason: 'observed-concurrent-event',
        receipt: token,
        concurrentOwner: run.stageId,
      }),
    ]);
    if (result.unmet || !accepted(result.value))
      return gate([result.unmet || `concurrent-activation-declined:${eventId}`]);
    draft.active.concurrent[eventId] = {
      status: 'active',
      resolved: false,
      dialogue: { kind: 'concurrent', lines: clone(event.dialogue), index: 0 },
    };
    draft.receipts[token] = {
      kind: 'concurrent-activation',
      missionId: run.missionId,
      attempt: run.attempt,
      stageId: eventId,
    };
    pushHistory(draft, 'concurrent-event-activated', {
      missionId: run.missionId,
      eventId,
      ownerStage: run.stageId,
    });
    return { ok: true };
  });
}
function validFacts(facts) {
  return (
    object(facts) &&
    Object.keys(facts).length <= 1000 &&
    Object.entries(facts).every(
      ([key, value]) =>
        id(key) &&
        (value === null ||
          typeof value === 'boolean' ||
          (typeof value === 'string' && value.length <= 4096) ||
          (typeof value === 'number' && Number.isFinite(value))),
    )
  );
}
/** Parent route/actor events may publish facts only with an observed proof. */
export function recordCampaignFacts(state, facts, proofReceipt, adapters = {}) {
  validateCampaignDirector(state, adapters);
  if (!validFacts(facts) || !id(proofReceipt)) return gate(['invalid-parent-facts']);
  const token = receipt(state, `facts:${proofReceipt}`);
  if (!id(token)) return gate(['invalid-parent-facts-receipt-length']);
  if (own(state.receipts, token)) return { ok: true, alreadyRecorded: true };
  const proof = query(
    state,
    { type: 'campaign-facts-observed', facts: clone(facts), receipt: proofReceipt },
    adapters,
  );
  if (proof.unmet.length || !proof.met)
    return gate(proof.unmet.length ? proof.unmet : ['campaign-facts-not-observed']);
  Object.assign(state.flags, clone(facts));
  state.receipts[token] = {
    kind: 'observed-facts',
    missionId: state.active?.missionId || null,
    attempt: state.active?.attempt || null,
    stageId: state.active?.stageId || null,
  };
  pushHistory(state, 'facts-observed', { receipt: proofReceipt, keys: Object.keys(facts) });
  return { ok: true };
}
function selectedBranch(state, stage, adapters) {
  const matches = [];
  for (const branch of stage.branches || []) {
    if (branch.choice) {
      if (Object.values(state.active.choices).includes(branch.choice)) matches.push(branch);
    } else if (branch.when) {
      const result = query(state, branch.when, adapters);
      if (result.unmet.length) return gate(result.unmet);
      if (result.met) matches.push(branch);
    }
  }
  if (matches.length > 1) return gate(['ambiguous-stage-branches']);
  if (
    (stage.branches || []).some((branch) => branch.next || branch.activate) &&
    matches.length === 0
  )
    return gate(['branch-exit-not-observed']);
  return { ok: true, branch: matches[0] || null };
}
function recordFailure(state, definition, adapters) {
  return transaction(state, adapters, `failure:${definition.id}`, (draft) => {
    const run = draft.active;
    const action = effects(
      draft,
      [
        {
          type: 'mission-failed',
          failureId: definition.id,
          condition: definition.condition,
          resumeCheckpoint: definition.resumeCheckpoint,
        },
      ],
      receipt(draft, `${run.missionId}:attempt:${run.attempt}:failure:${draft.sequence}`),
      adapters,
      'failure',
    );
    if (!action.ok) return action;
    run.phase = 'failed';
    run.concurrent = {};
    run.failure = {
      id: definition.id,
      stageId: run.stageId,
      resumeCheckpoint: definition.resumeCheckpoint,
      sequence: draft.sequence + 1,
    };
    run.dialogue = { kind: 'failure', lines: clone(definition.dialogue), index: 0 };
    pushHistory(draft, 'mission-failed', {
      missionId: run.missionId,
      attempt: run.attempt,
      failureId: definition.id,
      stageId: run.stageId,
    });
    return { ok: true, failed: true, failureId: definition.id };
  });
}
function finishMission(state, mission, adapters) {
  const run = state.active,
    token = receipt(state, `${mission.id}:reward`);
  const result = effects(
    state,
    [
      {
        type: 'campaign-reward',
        rewards: mission.rewards,
        choices: run.choices,
        consequences: mission.consequences,
        releaseValidated: false,
      },
    ],
    token,
    adapters,
    'mission-reward',
  );
  if (!result.ok) return result;
  (mission.rewards.unlocks || []).forEach((value) => addUnlock(state, value));
  for (const value of mission.rewards.flags || []) state.flags[value] = true;
  for (const [optionId, unlocks] of Object.entries(mission.rewards.branchUnlocks || {}))
    if (Object.values(run.choices).includes(optionId))
      unlocks.forEach((value) => addUnlock(state, value));
  pushHistory(state, 'mission-completed', {
    missionId: mission.id,
    attempt: run.attempt,
    releaseValidated: false,
  });
  state.completed[mission.id] = {
    receipt: token,
    sequence: state.sequence,
    choices: clone(run.choices),
    completedStages: clone(run.completedStages),
    consequences: clone(mission.consequences),
    evidence: 'parent-observed-conditions',
    releaseValidated: false,
  };
  state.active = null;
  refreshUnlocks(state);
  return { ok: true, completed: mission.id, releaseValidated: false };
}
function completeStage(state, adapters) {
  const content = contentOf(adapters),
    run = state.active,
    mission = missionFor(content, run.missionId),
    stage = stageFor(content, run);
  const branchResult = selectedBranch(state, stage, adapters);
  if (!branchResult.ok) return branchResult;
  return transaction(state, adapters, `complete:${run.missionId}:${stage.id}`, (draft) => {
    const active = draft.active,
      branch = branchResult.branch;
    const applied = effects(
      draft,
      [...(stage.onComplete || []), ...(branch?.effects || [])],
      receipt(
        draft,
        `${run.missionId}:attempt:${run.attempt}:stage:${stage.id}:visit:${run.stageVisits[stage.id]}:complete`,
      ),
      adapters,
      'stage-completion',
    );
    if (!applied.ok) return applied;
    if (!active.completedStages.includes(stage.id)) active.completedStages.push(stage.id);
    pushHistory(draft, 'stage-completed', { missionId: run.missionId, stageId: stage.id });
    for (const definition of mission.checkpoints.filter((entry) => entry.afterStage === stage.id)) {
      const snapshot = checkpointSnapshot(draft, active, definition, adapters);
      if (!snapshot.ok) return snapshot;
      active.checkpoints = active.checkpoints.filter((entry) => entry.id !== definition.id);
      active.checkpoints.push(snapshot.checkpoint);
    }
    if (branch?.activate) {
      const target = missionFor(content, branch.activate);
      if (!target) return gate([`not-authored-in-pack:${branch.activate}`]);
      const missing = [
        ...prerequisites(draft, target).map((dep) => `dependency:${dep}`),
        ...capabilityGates(target, adapters),
      ];
      if (missing.length) return gate(missing);
      active.stageId = branch.suspendMissionAt;
      const resumeStage = mission.stages.find((entry) => entry.id === active.stageId);
      if (!resumeStage) return gate(['invalid-interruption-resume-stage']);
      active.dialogue = { kind: 'stage', lines: clone(resumeStage.dialogue), index: 0 };
      active.concurrent = {};
      active.resumeInfo = {
        reason: 'authored-interruption',
        afterMission: branch.activate,
        resumption: branch.resumption || null,
      };
      active.pendingActivation = null;
      draft.suspended.push(active);
      draft.active = null;
      pushHistory(draft, 'mission-suspended', {
        missionId: run.missionId,
        stageId: active.stageId,
        interruptingMission: branch.activate,
      });
      // Nested call captures the already-applied world; the outer transaction
      // still rolls it all back if the child cannot activate.
      return startCampaignMission(draft, branch.activate, adapters, {
        variant: run.pendingActivation?.variant || null,
      });
    }
    const index = mission.stages.findIndex((entry) => entry.id === stage.id);
    const nextId =
      branch?.next ||
      stage.next ||
      mission.stages.slice(index + 1).find((entry) => !entry.concurrentWith)?.id;
    if (!nextId) return finishMission(draft, mission, adapters);
    const next = enabledStage(draft, mission, nextId, adapters);
    if (!next.ok) return next;
    if (!next.stage) return finishMission(draft, mission, adapters);
    return activate(draft, active, next.stage, adapters, 'stage-transition');
  });
}
export function updateCampaignDirector(state, adapters = {}) {
  validateCampaignDirector(state, adapters);
  if (!state.active) return { ok: true, idle: true };
  const content = contentOf(adapters),
    run = state.active,
    mission = missionFor(content, run.missionId),
    stage = stageFor(content, run);
  if (run.phase === 'failed') return { ok: true, failed: true, failureId: run.failure.id };
  const unmet = capabilityGates(mission, adapters);
  const supported = call(adapters, 'supportsStage', [stage.type, frozen(clone(stage))]);
  if (supported.unmet || supported.value !== true)
    unmet.push(supported.unmet || `unintegrated-stage:${stage.type}`);
  if (unmet.length) return gate(unmet);
  const failures = [
    ...(mission.commonFailures || []).map((type) => ({
      id: type,
      condition: { type },
      resumeCheckpoint: 'start',
      dialogue: mission.retryPolicy.dialogue,
    })),
    ...mission.failures,
  ];
  for (const definition of failures) {
    const observed = query(state, definition.condition, adapters);
    if (observed.unmet.length) return gate(observed.unmet);
    if (observed.met) return recordFailure(state, definition, adapters);
  }
  const dialogue = peekDialogue(state, adapters);
  if (dialogue.unmet.length) return gate(dialogue.unmet);
  if (dialogue.line) return { ok: true, waiting: 'dialogue' };
  const activeEventId = Object.keys(run.concurrent).find(
    (eventId) => run.concurrent[eventId].status === 'active',
  );
  if (activeEventId) {
    const event = mission.stages.find((entry) => entry.id === activeEventId),
      waiting = [];
    for (const condition of event.completion) {
      const result = query(state, condition, adapters);
      if (result.unmet.length) return gate(result.unmet);
      if (!result.met) waiting.push(condition.type);
    }
    if (waiting.length)
      return { ok: true, waiting: 'concurrent-event-conditions', conditions: waiting };
    return transaction(state, adapters, `concurrent-complete:${activeEventId}`, (draft) => {
      const result = effects(
        draft,
        event.onComplete || [],
        receipt(
          draft,
          `${run.missionId}:attempt:${run.attempt}:concurrent:${activeEventId}:complete`,
        ),
        adapters,
        'concurrent-completion',
      );
      if (!result.ok) return result;
      draft.active.concurrent[activeEventId].status = 'resolved';
      draft.active.concurrent[activeEventId].resolved = true;
      if (!draft.active.completedStages.includes(activeEventId))
        draft.active.completedStages.push(activeEventId);
      pushHistory(draft, 'concurrent-event-completed', {
        missionId: run.missionId,
        eventId: activeEventId,
      });
      return { ok: true, concurrentCompleted: activeEventId };
    });
  }
  const waiting = [];
  for (const condition of stage.completion) {
    const observed = query(state, condition, adapters);
    if (observed.unmet.length) return gate(observed.unmet);
    if (!observed.met) waiting.push(condition.type);
  }
  // Concurrent events are owned by the physical activation callback and must
  // be observed as resolved before leaving their parent stage.
  for (const event of mission.stages.filter((entry) => entry.concurrentWith === stage.id)) {
    if (!run.concurrent[event.id]?.resolved)
      waiting.push(`${event.id}:concurrent-event-unresolved`);
  }
  if (waiting.length) return { ok: true, waiting: 'observed-conditions', conditions: waiting };
  if (typeof adapters.canCompleteStage === 'function') {
    const result = call(adapters, 'canCompleteStage', [frozen(clone(stage)), context(state)]);
    const observed = result.unmet ? { met: false, unmet: [result.unmet] } : metValue(result.value);
    if (observed.unmet.length) return gate(observed.unmet);
    if (!observed.met) return { ok: true, waiting: 'physical-stage-staging' };
  }
  if (stage.outcomeDialogue && run.dialogue.kind !== 'outcome') {
    const result = call(adapters, 'readOutcome', [frozen(clone(stage)), context(state)]);
    if (result.unmet || !own(stage.outcomeDialogue, result.value))
      return gate([result.unmet || 'activity-outcome-not-observed']);
    run.outcome = result.value;
    run.dialogue = { kind: 'outcome', lines: clone(stage.outcomeDialogue[result.value]), index: 0 };
    pushHistory(state, 'outcome-dialogue-started', {
      missionId: run.missionId,
      stageId: run.stageId,
      outcome: result.value,
    });
    return { ok: true, waiting: 'outcome-dialogue' };
  }
  return completeStage(state, adapters);
}
export function retryCampaignMission(state, adapters = {}, options = {}) {
  validateCampaignDirector(state, adapters);
  const mode = options.mode || 'retry-last-checkpoint';
  if (!['retry-last-checkpoint', 'restart-mission', 'return-to-free-roam'].includes(mode))
    return gate(['unknown-retry-mode']);
  if (
    options.missionId !== undefined &&
    (!missionFor(contentOf(adapters), options.missionId) ||
      (state.active && state.active.missionId !== options.missionId))
  )
    return gate(['retry-mission-does-not-match-owner']);
  if (mode === 'return-to-free-roam') return abandonCampaignMission(state, adapters);
  const retained =
      !state.active && options.missionId
        ? state.suspended.find(
            (entry) =>
              entry.missionId === options.missionId &&
              entry.resumeInfo?.reason === 'return-to-free-roam',
          )
        : null,
    run = state.active || retained;
  if (!run)
    return gate([options.missionId ? 'mission-not-retained-for-retry' : 'no-active-mission']);
  const mission = missionFor(contentOf(adapters), run.missionId);
  if (
    typeof adapters.supportsMission === 'function' ||
    typeof adapters.capabilitiesForMission === 'function'
  ) {
    const missing = capabilityGates(mission, adapters);
    if (missing.length) return gate(missing);
  }
  if (
    options.checkpoint &&
    options.checkpoint !== 'start' &&
    !mission.checkpoints.some((checkpoint) => checkpoint.id === options.checkpoint)
  )
    return gate(['unknown-checkpoint']);
  const preferred =
    mode === 'restart-mission'
      ? 'start'
      : options.checkpoint ||
        run.failure?.resumeCheckpoint ||
        run.checkpoints.at(-1)?.id ||
        'start';
  const snapshot =
    run.checkpoints.find((entry) => entry.id === preferred) ||
    (mode === 'restart-mission' ? null : run.checkpoints.at(-1));
  if (!snapshot) return gate(['no-committed-checkpoint']);
  if (
    snapshot.progressFingerprint !==
    hash([state.completed, state.externalCompleted, state.onboardingCompleted])
  )
    return gate(['checkpoint-world-history-conflict']);
  return transaction(state, adapters, `retry:${run.missionId}`, (draft) => {
    if (retained) {
      const selected = draft.suspended.find((entry) => entry.missionId === run.missionId);
      draft.suspended = draft.suspended.filter((entry) => entry !== selected);
      draft.active = selected;
      draft.active.resumeInfo = null;
    }
    const restored = restoreWorld(draft, snapshot.world, adapters, `retry:${snapshot.id}`);
    if (!restored.ok) return restored;
    const active = draft.active;
    Object.assign(draft, clone(snapshot.owned));
    Object.assign(active, clone(snapshot.run));
    active.checkpoints = active.checkpoints.filter((entry) => entry.sequence <= snapshot.sequence);
    active.attempt = draft.attempts[run.missionId] + 1;
    draft.attempts[run.missionId] = active.attempt;
    active.failure = null;
    active.pendingActivation = null;
    if (mode === 'restart-mission') {
      active.choices = {};
      active.completedStages = [];
      active.stageVisits = {};
      const reset = effects(
        draft,
        [
          {
            type: 'mission-restarted',
            missionId: run.missionId,
            preserveCompleted: Object.keys(draft.completed),
            preserveOnboarding: Object.keys(draft.onboardingCompleted),
          },
        ],
        receipt(draft, `${run.missionId}:attempt:${active.attempt}:restart`),
        adapters,
        'restart',
      );
      if (!reset.ok) return reset;
    }
    active.stageId = mode === 'restart-mission' ? mission.startStage : snapshot.resumeStage;
    const selected = enabledStage(draft, mission, active.stageId, adapters);
    if (!selected.ok || !selected.stage)
      return selected.ok ? gate(['retry-stage-unavailable']) : selected;
    pushHistory(draft, 'mission-retried', {
      missionId: run.missionId,
      checkpoint: snapshot.id,
      failedAttempt: run.attempt,
      attempt: active.attempt,
      mode,
      ...(retained ? { fromSuspended: true } : {}),
    });
    return activate(
      draft,
      active,
      selected.stage,
      adapters,
      mode === 'restart-mission' ? 'full-mission-restart' : 'checkpoint-retry',
    );
  });
}
/** Preserving a retry keeps existing checkpoints; leaving never restores the world. */
export function abandonCampaignMission(state, adapters = {}, options = {}) {
  validateCampaignDirector(state, adapters);
  if (
    !object(options) ||
    (own(options, 'preserveRetry') && typeof options.preserveRetry !== 'boolean')
  )
    return gate(['invalid-preserve-retry-option']);
  if (!state.active) return gate(['no-active-mission']);
  return transaction(state, adapters, 'abandon', (draft) => {
    const run = draft.active;
    const result = effects(
      draft,
      [{ type: 'mission-abandoned', missionId: run.missionId }],
      receipt(draft, `${run.missionId}:attempt:${run.attempt}:abandon`),
      adapters,
      'abandon',
    );
    if (!result.ok) return result;
    pushHistory(draft, 'mission-abandoned', {
      missionId: run.missionId,
      attempt: run.attempt,
      stageId: run.stageId,
      ...(options.preserveRetry ? { retryPreserved: true } : {}),
    });
    if (options.preserveRetry) {
      run.resumeInfo = {
        reason: 'return-to-free-roam',
        afterMission: null,
        resumption: 'Explicit checkpoint retry or full restart restores the saved physical world.',
      };
      draft.suspended.push(run);
    }
    draft.active = null;
    return {
      ok: true,
      abandoned: run.missionId,
      reward: false,
      ...(options.preserveRetry ? { retryPreserved: true } : {}),
    };
  });
}
export function suspendCampaignMission(state, adapters = {}, reason = 'additional-onboarding') {
  validateCampaignDirector(state, adapters);
  if (reason === 'return-to-free-roam') return gate(['reserved-suspension-reason']);
  if (!state.active || state.active.phase === 'failed') return gate(['no-running-mission']);
  return transaction(state, adapters, 'suspend', (draft) => {
    const run = draft.active;
    const result = effects(
      draft,
      [{ type: 'mission-suspended', missionId: run.missionId, reason }],
      receipt(draft, `${run.missionId}:attempt:${run.attempt}:suspend:${draft.sequence}`),
      adapters,
      'suspend',
    );
    if (!result.ok) return result;
    run.resumeInfo = {
      reason,
      afterMission: null,
      resumption: 'Parent must restore physical objective ownership before resumption.',
    };
    draft.suspended.push(run);
    draft.active = null;
    pushHistory(draft, 'mission-suspended', {
      missionId: run.missionId,
      stageId: run.stageId,
      reason,
    });
    return { ok: true };
  });
}
export function resumeCampaignMission(state, missionId, adapters = {}) {
  validateCampaignDirector(state, adapters);
  if (state.active) return gate(['active-mission-must-finish-or-suspend']);
  const run = state.suspended.find((entry) => entry.missionId === missionId);
  if (!run) return gate(['mission-not-suspended']);
  if (run.resumeInfo?.reason === 'return-to-free-roam')
    return gate(['retained-mission-requires-explicit-retry']);
  if (run.resumeInfo?.afterMission && !completed(state, run.resumeInfo.afterMission))
    return gate([`dependency:${run.resumeInfo.afterMission}`]);
  const mission = missionFor(contentOf(adapters), missionId),
    missing = capabilityGates(mission, adapters);
  if (missing.length) return gate(missing);
  const permitted = query(
    state,
    {
      type: 'mission-resume-permitted',
      missionId,
      stageId: run.stageId,
      resumeInfo: run.resumeInfo,
    },
    adapters,
  );
  if (permitted.unmet.length || !permitted.met)
    return gate(
      permitted.unmet.length ? permitted.unmet : ['physical-mission-resumption-not-ready'],
    );
  return transaction(state, adapters, `resume:${missionId}`, (draft) => {
    const active = draft.suspended.find((entry) => entry.missionId === missionId);
    draft.suspended = draft.suspended.filter((entry) => entry !== active);
    draft.active = active;
    const savedDialogue = clone(active.dialogue),
      savedConcurrent = clone(active.concurrent);
    // Rebase checkpoint world/owned state after interleaved jobs. A retry must
    // never undo the genuinely completed rescue or a paid prologue shift.
    const snapshot = checkpointSnapshot(
      draft,
      active,
      { id: 'start', resumeStage: active.stageId },
      adapters,
    );
    if (!snapshot.ok) return snapshot;
    active.checkpoints = [snapshot.checkpoint];
    const selected = enabledStage(draft, mission, active.stageId, adapters);
    if (!selected.ok || !selected.stage)
      return selected.ok ? gate(['resume-stage-unavailable']) : selected;
    pushHistory(draft, 'mission-resumed', { missionId, stageId: active.stageId });
    const activated = activate(
      draft,
      active,
      selected.stage,
      adapters,
      'resume-after-interleaving',
    );
    if (activated.ok && active.resumeInfo?.reason !== 'authored-interruption') {
      active.dialogue = savedDialogue;
      active.concurrent = savedConcurrent;
    }
    return activated;
  });
}
export function recordExternalCampaignCompletion(state, missionId, proofReceipt, adapters = {}) {
  validateCampaignDirector(state, adapters);
  const content = contentOf(adapters),
    onboarding = content.manifest.additionalOnboardingIds?.includes(missionId);
  const external =
    content.missions.some((mission) => mission.dependencies?.all.includes(missionId)) &&
    !missionFor(content, missionId);
  if (!onboarding && !external) return gate(['unknown-external-mission']);
  if (!id(proofReceipt)) return gate(['invalid-parent-proof-receipt']);
  if (state.active) return gate(['external-work-requires-idle-or-suspended-campaign']);
  const records = onboarding ? state.onboardingCompleted : state.externalCompleted;
  if (own(records, missionId))
    return records[missionId].receipt === proofReceipt
      ? { ok: true, alreadyRecorded: true }
      : gate(['external-completion-receipt-conflict']);
  const proof = query(
    state,
    {
      type: onboarding ? 'onboarding-job-completed' : 'external-mission-completed',
      missionId,
      receipt: proofReceipt,
    },
    adapters,
  );
  if (proof.unmet.length || !proof.met)
    return gate(proof.unmet.length ? proof.unmet : ['external-completion-not-observed']);
  records[missionId] = {
    receipt: proofReceipt,
    sequence: state.sequence + 1,
    releaseValidated: false,
  };
  pushHistory(state, onboarding ? 'onboarding-completed' : 'external-mission-completed', {
    missionId,
    receipt: proofReceipt,
    sourceCredit: onboarding ? 0 : 'outside-this-pack',
  });
  refreshUnlocks(state);
  return { ok: true, sourceCredit: onboarding ? 0 : 'outside-this-pack' };
}

function validateLines(lines) {
  if (
    !Array.isArray(lines) ||
    lines.length > 1000 ||
    !lines.every(
      (entry) =>
        object(entry) &&
        id(entry.speaker) &&
        typeof entry.text === 'string' &&
        entry.text.length <= 10000,
    )
  )
    invalid('dialogue lines');
}
function validReceipt(token, entry, state) {
  return (
    id(token) &&
    token.startsWith(`campaign:${campaignReceiptNamespace(state)}:`) &&
    object(entry) &&
    receiptKinds.has(entry.kind)
  );
}
function validQueued(entries) {
  return (
    Array.isArray(entries) &&
    entries.every(
      (entry) => object(entry) && id(entry.id) && (entry.variant === null || id(entry.variant)),
    )
  );
}
function validDeferred(entries) {
  return (
    Array.isArray(entries) &&
    entries.every(
      (entry) => object(entry) && id(entry.id) && Array.isArray(entry.all) && entry.all.every(id),
    )
  );
}
function validateRun(run, content, state) {
  const mission = missionFor(content, run?.missionId);
  if (
    !mission ||
    !object(run) ||
    !integer(run.attempt) ||
    run.attempt < 1 ||
    run.attempt > state.attempts[run.missionId]
  )
    invalid('mission attempt');
  const stage = mission.stages.find((entry) => entry.id === run.stageId);
  const runKeys = [
    'missionId',
    'attempt',
    'stageId',
    'phase',
    'variant',
    'choices',
    'completedStages',
    'stageVisits',
    'concurrent',
    'checkpoints',
    'failure',
    'outcome',
    'dialogue',
    'resumeInfo',
  ];
  if (
    !runKeys.every((key) => own(run, key)) ||
    Object.keys(run).some((key) => !runKeys.includes(key) && key !== 'pendingActivation')
  )
    invalid('run fields');
  const suspended = state.suspended.includes(run),
    resume = run.resumeInfo;
  if (
    (suspended && resume === null) ||
    (resume !== null &&
      (!object(resume) ||
        Object.keys(resume).length !== 3 ||
        !['reason', 'afterMission', 'resumption'].every((key) => own(resume, key)) ||
        !id(resume.reason) ||
        (resume.afterMission !== null && !id(resume.afterMission)) ||
        (resume.resumption !== null &&
          (typeof resume.resumption !== 'string' || resume.resumption.length > 10000))))
  )
    invalid('resumption metadata');
  if (resume?.reason === 'return-to-free-roam') {
    const token = receipt(state, `${run.missionId}:attempt:${run.attempt}:abandon`),
      abandoned = state.receipts[token];
    if (
      !suspended ||
      resume.afterMission !== null ||
      run.attempt !== state.attempts[run.missionId] ||
      !Array.isArray(run.checkpoints) ||
      !run.checkpoints.some((checkpoint) => checkpoint?.id === 'start') ||
      abandoned?.kind !== 'abandon' ||
      abandoned.missionId !== run.missionId ||
      abandoned.attempt !== run.attempt ||
      abandoned.stageId !== run.stageId ||
      !state.history.some(
        (entry) =>
          entry.event === 'mission-abandoned' &&
          entry.missionId === run.missionId &&
          entry.attempt === run.attempt &&
          entry.stageId === run.stageId &&
          entry.retryPreserved === true,
      )
    )
      invalid('retained retry ownership');
  }
  if (!stage || stage.concurrentWith || !['running', 'failed'].includes(run.phase))
    invalid('active stage');
  if (own(state.completed, run.missionId)) invalid('completed mission still active');
  if (
    !object(run.choices) ||
    !object(run.stageVisits) ||
    !object(run.concurrent) ||
    !Array.isArray(run.completedStages) ||
    !Array.isArray(run.checkpoints)
  )
    invalid('run records');
  for (const [eventId, record] of Object.entries(run.concurrent)) {
    const event = mission.stages.find(
      (entry) => entry.id === eventId && entry.concurrentWith === run.stageId,
    );
    if (
      !event ||
      !object(record) ||
      !['pending', 'active', 'resolved'].includes(record.status) ||
      record.resolved !== (record.status === 'resolved')
    )
      invalid('concurrent event');
    if (record.status === 'pending') {
      if (record.dialogue !== null) invalid('pending event dialogue');
    } else if (
      !object(record.dialogue) ||
      record.dialogue.kind !== 'concurrent' ||
      !integer(record.dialogue.index) ||
      record.dialogue.index > event.dialogue.length ||
      JSON.stringify(record.dialogue.lines) !== JSON.stringify(event.dialogue)
    )
      invalid('concurrent dialogue');
  }
  for (const [choiceId, optionId] of Object.entries(run.choices))
    if (
      !mission.choices.some(
        (choice) =>
          choice.id === choiceId && choice.options.some((option) => option.id === optionId),
      )
    )
      invalid('saved choice');
  for (const [stageId, count] of Object.entries(run.stageVisits))
    if (!mission.stages.some((entry) => entry.id === stageId) || !integer(count) || count < 1)
      invalid('stage visits');
  if (
    new Set(run.completedStages).size !== run.completedStages.length ||
    !run.completedStages.every((stageId) => mission.stages.some((entry) => entry.id === stageId))
  )
    invalid('completed stages');
  if (
    !object(run.dialogue) ||
    !integer(run.dialogue.index) ||
    run.dialogue.index > run.dialogue.lines?.length ||
    !['stage', 'alternate', 'outcome', 'failure'].includes(run.dialogue.kind)
  )
    invalid('dialogue cursor');
  validateLines(run.dialogue.lines);
  const expected =
    run.dialogue.kind === 'outcome'
      ? stage.outcomeDialogue?.[run.outcome]
      : run.dialogue.kind === 'alternate'
        ? stage.alternateDialogue
        : run.dialogue.kind === 'failure'
          ? mission.failures.find((entry) => entry.id === run.failure?.id)?.dialogue ||
            mission.retryPolicy.dialogue
          : stage.dialogue;
  if (!expected || JSON.stringify(expected) !== JSON.stringify(run.dialogue.lines))
    invalid('dialogue does not match authored content');
  if (
    (run.phase === 'failed') !== Boolean(run.failure) ||
    (run.phase === 'failed' && run.dialogue.kind !== 'failure')
  )
    invalid('failure phase');
  if (
    run.failure &&
    ((!mission.failures.some((entry) => entry.id === run.failure.id) &&
      !mission.commonFailures.includes(run.failure.id)) ||
      !integer(run.failure.sequence) ||
      run.failure.sequence > state.sequence)
  )
    invalid('failure record');
  if (run.checkpoints.length > mission.checkpoints.length + 1) invalid('checkpoint capacity');
  const names = new Set();
  for (const checkpoint of run.checkpoints) {
    if (
      !object(checkpoint) ||
      names.has(checkpoint.id) ||
      (checkpoint.id !== 'start' &&
        !mission.checkpoints.some((entry) => entry.id === checkpoint.id))
    )
      invalid('checkpoint identity');
    names.add(checkpoint.id);
    if (
      Object.keys(checkpoint).length !== 8 ||
      !mission.stages.some((entry) => entry.id === checkpoint.resumeStage) ||
      !integer(checkpoint.sequence) ||
      checkpoint.sequence > state.sequence ||
      !/^[0-9a-f]{8}$/.test(checkpoint.progressFingerprint) ||
      !object(checkpoint.owned) ||
      !object(checkpoint.run) ||
      !own(checkpoint, 'world')
    )
      invalid('checkpoint snapshot');
    const authored = mission.checkpoints.find((entry) => entry.id === checkpoint.id);
    if (
      (authored &&
        (checkpoint.resumeStage !== authored.resumeStage ||
          checkpoint.afterStage !== authored.afterStage)) ||
      (checkpoint.id === 'start' && checkpoint.afterStage !== null)
    )
      invalid('checkpoint content binding');
    const ownedKeys = [
      'flags',
      'trust',
      'unlocks',
      'deferredUnlocks',
      'queued',
      'streetContent',
      'receipts',
    ];
    if (
      Object.keys(checkpoint.owned).length !== ownedKeys.length ||
      !ownedKeys.every((key) => own(checkpoint.owned, key)) ||
      Object.keys(checkpoint.run).length !== 4 ||
      !['choices', 'completedStages', 'stageVisits', 'variant'].every((key) =>
        own(checkpoint.run, key),
      )
    )
      invalid('checkpoint fields');
    if (
      !object(checkpoint.run.choices) ||
      !Array.isArray(checkpoint.run.completedStages) ||
      !object(checkpoint.run.stageVisits)
    )
      invalid('checkpoint run');
    for (const [choiceId, optionId] of Object.entries(checkpoint.run.choices))
      if (
        !mission.choices.some(
          (choice) =>
            choice.id === choiceId && choice.options.some((option) => option.id === optionId),
        )
      )
        invalid('checkpoint choice');
    if (
      !checkpoint.run.completedStages.every((stageId) =>
        mission.stages.some((entry) => entry.id === stageId),
      )
    )
      invalid('checkpoint completed stage');
    for (const [stageId, count] of Object.entries(checkpoint.run.stageVisits))
      if (!mission.stages.some((entry) => entry.id === stageId) || !integer(count) || count < 1)
        invalid('checkpoint visits');
    if (
      !validFacts(checkpoint.owned.flags) ||
      !object(checkpoint.owned.trust) ||
      !Array.isArray(checkpoint.owned.unlocks) ||
      !checkpoint.owned.unlocks.every(id) ||
      !Array.isArray(checkpoint.owned.deferredUnlocks) ||
      !Array.isArray(checkpoint.owned.queued) ||
      !object(checkpoint.owned.streetContent) ||
      !object(checkpoint.owned.receipts)
    )
      invalid('checkpoint owned state');
    for (const [actor, value] of Object.entries(checkpoint.owned.trust))
      if (!id(actor) || !Number.isFinite(value) || Math.abs(value) > 1e6)
        invalid('checkpoint trust');
    for (const [token, entry] of Object.entries(checkpoint.owned.receipts))
      if (!validReceipt(token, entry, state)) invalid('checkpoint receipt');
    if (
      new Set(checkpoint.owned.unlocks).size !== checkpoint.owned.unlocks.length ||
      !validQueued(checkpoint.owned.queued) ||
      !validDeferred(checkpoint.owned.deferredUnlocks)
    )
      invalid('checkpoint logical records');
  }
}
export function validateCampaignDirector(state, adapters = {}) {
  clone(state); // Reject getters, prototypes, NaN, unsafe keys and non-JSON data.
  const content = contentOf(adapters);
  if (
    !object(state) ||
    state.schemaVersion !== VERSION ||
    state.contentId !== content.manifest.id ||
    state.contentFingerprint !== fingerprint(content)
  )
    invalid('version/content fingerprint');
  if (!integer(state.seed, 0xffffffff) || !integer(state.sequence)) invalid('seed/sequence');
  if (own(state, 'receiptNamespace')) {
    if (typeof state.receiptNamespace !== 'string' || !/^[0-9a-f]{8}$/.test(state.receiptNamespace))
      invalid('receipt namespace');
    const origin = historicalContent(state.receiptNamespace, adapters);
    if (origin.manifest.id !== content.manifest.id) invalid('receipt namespace content owner');
  }
  const keys = [
    'schemaVersion',
    'contentId',
    'contentFingerprint',
    'seed',
    'sequence',
    'completed',
    'externalCompleted',
    'onboardingCompleted',
    'flags',
    'trust',
    'unlocks',
    'deferredUnlocks',
    'queued',
    'streetContent',
    'attempts',
    'receipts',
    'active',
    'suspended',
    'history',
  ];
  if (
    Object.keys(state).length !== keys.length + (own(state, 'receiptNamespace') ? 1 : 0) ||
    !keys.every((key) => own(state, key)) ||
    (state.active !== null && !object(state.active))
  )
    invalid('state fields');
  for (const key of [
    'completed',
    'externalCompleted',
    'onboardingCompleted',
    'flags',
    'trust',
    'streetContent',
    'attempts',
    'receipts',
  ])
    if (!object(state[key])) invalid(key);
  for (const key of ['unlocks', 'deferredUnlocks', 'queued', 'suspended', 'history'])
    if (!Array.isArray(state[key])) invalid(key);
  if (
    state.history.length > 25000 ||
    state.suspended.length > content.missions.length ||
    Object.keys(state.receipts).length > 100000
  )
    invalid('state capacity');
  if (!state.unlocks.every(id) || new Set(state.unlocks).size !== state.unlocks.length)
    invalid('unlocks');
  for (const [actor, value] of Object.entries(state.trust))
    if (!id(actor) || !Number.isFinite(value) || Math.abs(value) > 1e6) invalid('trust');
  if (!validFacts(state.flags)) invalid('facts');
  for (const [missionId, attempt] of Object.entries(state.attempts))
    if (!missionFor(content, missionId) || !integer(attempt) || attempt < 1)
      invalid('attempt count');
  for (const [token, entry] of Object.entries(state.receipts))
    if (!validReceipt(token, entry, state)) invalid('transaction receipt');
  for (const [missionId, entry] of Object.entries(state.completed)) {
    const mission = missionFor(content, missionId);
    if (
      !mission ||
      !object(entry) ||
      entry.releaseValidated !== false ||
      !own(state.receipts, entry.receipt) ||
      state.receipts[entry.receipt].kind !== 'mission-reward' ||
      entry.receipt !== receipt(state, `${missionId}:reward`) ||
      !integer(entry.sequence) ||
      entry.sequence > state.sequence ||
      !Array.isArray(entry.completedStages) ||
      !entry.completedStages.includes(mission.stages.at(-1).id)
    )
      invalid('completed mission evidence');
    if (prerequisites(state, mission).length) invalid('completed mission missing dependencies');
    if (
      !object(entry.choices) ||
      new Set(entry.completedStages).size !== entry.completedStages.length ||
      !entry.completedStages.every((stageId) =>
        mission.stages.some((stage) => stage.id === stageId),
      )
    )
      invalid('completed mission stages');
    for (const [choiceId, optionId] of Object.entries(entry.choices))
      if (
        !mission.choices.some(
          (choice) =>
            choice.id === choiceId && choice.options.some((option) => option.id === optionId),
        )
      )
        invalid('completed mission choice');
    if (
      !state.history.some(
        (event) =>
          event.sequence === entry.sequence &&
          event.event === 'mission-completed' &&
          event.missionId === missionId,
      )
    )
      invalid('completion history');
  }
  for (const [missionId, entry] of Object.entries(state.onboardingCompleted))
    if (
      !content.manifest.additionalOnboardingIds?.includes(missionId) ||
      !object(entry) ||
      !id(entry.receipt) ||
      entry.releaseValidated !== false
    )
      invalid('onboarding completion');
  for (const [missionId, entry] of Object.entries(state.externalCompleted))
    if (
      missionFor(content, missionId) ||
      !content.missions.some((mission) => mission.dependencies?.all.includes(missionId)) ||
      !object(entry) ||
      !id(entry.receipt) ||
      entry.releaseValidated !== false
    )
      invalid('external completion');
  if (!validQueued(state.queued)) invalid('queued mission');
  if (!validDeferred(state.deferredUnlocks)) invalid('deferred unlock');
  let previous = 0;
  for (const entry of state.history) {
    if (
      !object(entry) ||
      !integer(entry.sequence) ||
      entry.sequence <= previous ||
      entry.sequence > state.sequence ||
      !id(entry.event)
    )
      invalid('history order');
    previous = entry.sequence;
  }
  if (previous !== state.sequence) invalid('history sequence');
  const runs = [...state.suspended, ...(state.active ? [state.active] : [])];
  if (new Set(runs.map((run) => run.missionId)).size !== runs.length)
    invalid('duplicate mission ownership');
  runs.forEach((run) => validateRun(run, content, state));
  return true;
}
/**
 * Rebase content identity only when every previously owned mission is unchanged.
 * Original transaction IDs remain exact: their namespace is saved separately
 * from the current pack fingerprint. No world restore, rewards or actions occur.
 */
export function migrateCampaignDirectorContent(saved, adapters = {}) {
  if (!object(saved)) invalid('content migration state');
  const state = clone(saved),
    target = contentOf(adapters),
    nextFingerprint = fingerprint(target);
  if (state.contentFingerprint === nextFingerprint) {
    validateCampaignDirector(state, adapters);
    return state;
  }
  const previous = historicalContent(state.contentFingerprint, adapters);
  if (previous.manifest.id !== target.manifest.id) invalid('content migration owner');
  validateCampaignDirector(state, { ...adapters, content: previous });
  const owned = new Set([
    ...Object.keys(state.attempts),
    ...Object.keys(state.completed),
    ...state.suspended.map((run) => run.missionId),
    ...(state.active ? [state.active.missionId] : []),
  ]);
  for (const entry of state.history)
    if (
      typeof entry.missionId === 'string' &&
      /^LL-ST-\d{3}$/.test(entry.missionId) &&
      !own(state.externalCompleted, entry.missionId) &&
      !own(state.onboardingCompleted, entry.missionId)
    )
      owned.add(entry.missionId);
  const prefix = `campaign:${campaignReceiptNamespace(state)}:`;
  for (const token of Object.keys(state.receipts)) {
    const match = /^(LL-ST-\d{3}):/.exec(token.slice(prefix.length));
    if (match) owned.add(match[1]);
  }
  for (const missionId of owned) {
    const from = missionFor(previous, missionId),
      to = missionFor(target, missionId);
    if (!from || !to || JSON.stringify(from) !== JSON.stringify(to))
      invalid(`owned mission requires an explicit content migration: ${missionId}`);
  }
  for (const run of [...state.suspended, ...(state.active ? [state.active] : [])])
    for (const checkpoint of run.checkpoints) {
      const valid = call(adapters, 'validateWorld', [
        frozen(clone(checkpoint.world)),
        context(state, { reason: 'content-migration-checkpoint-validation' }),
      ]);
      if (valid.unmet || valid.value !== true) invalid('content migration checkpoint world');
    }
  state.receiptNamespace = campaignReceiptNamespace(state);
  state.contentFingerprint = nextFingerprint;
  validateCampaignDirector(state, adapters);
  return state;
}

export function saveCampaignDirector(state, adapters = {}) {
  validateCampaignDirector(state, adapters);
  const saved = capture(state, adapters, 'whole-state-save');
  if (!saved.ok) return saved;
  const json = JSON.stringify({
    schemaVersion: VERSION,
    director: clone(state),
    world: saved.world,
  });
  if (json.length > MAX_JSON_BYTES) invalid('save size');
  return { ok: true, json };
}
export function restoreCampaignDirector(saved, adapters = {}) {
  if (typeof saved !== 'string' || saved.length > MAX_JSON_BYTES) invalid('save JSON/size');
  let envelope;
  try {
    envelope = JSON.parse(saved);
  } catch {
    invalid('save JSON');
  }
  clone(envelope);
  if (
    !object(envelope) ||
    Object.keys(envelope).length !== 3 ||
    envelope.schemaVersion !== VERSION ||
    !own(envelope, 'director') ||
    !own(envelope, 'world')
  )
    invalid('save envelope');
  if (!object(envelope.director)) invalid('state fields');
  const state =
    envelope.director.contentFingerprint === campaignContentFingerprint(adapters)
      ? clone(envelope.director)
      : migrateCampaignDirectorContent(envelope.director, adapters);
  validateCampaignDirector(state, adapters);
  // Validate every stored checkpoint with the same physical schema as the live
  // world before touching the parent. Structural director validation is not a
  // substitute for actor/vehicle/scene/physics/economy snapshot validation.
  for (const run of [...state.suspended, ...(state.active ? [state.active] : [])])
    for (const checkpoint of run.checkpoints) {
      const result = call(adapters, 'validateWorld', [
        frozen(clone(checkpoint.world)),
        context(state, { reason: 'saved-checkpoint-validation' }),
      ]);
      if (result.unmet || result.value !== true)
        return gate([result.unmet || `invalid-saved-world-checkpoint:${checkpoint.id}`]);
    }
  const restored = restoreWorld(state, envelope.world, adapters, 'whole-state-continue');
  return restored.ok ? { ok: true, state } : restored;
}
