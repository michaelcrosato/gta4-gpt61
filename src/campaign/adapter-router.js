/**
 * Route director contracts to explicitly registered authored missions.
 * The director must honor supportsMission/capabilitiesForMission; bare global
 * capabilities intentionally remain empty. Parent snapshot callbacks alone own
 * the complete physical world, including every mission and ordinary city cost.
 * This module neither ticks actors nor creates mission/communication outcomes.
 */
const own = (value, key) => Object.hasOwn(value, key);
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const missionId = (value) => typeof value === 'string' && /^LL-ST-\d{3}$/.test(value);
const required = [
  'supportsStage',
  'activateStage',
  'supportsCondition',
  'observe',
  'supportsAction',
  'applyActions',
];
const empty = Object.freeze({});
function deeplyFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && own(descriptor, 'value') && deeplyFrozen(descriptor.value, seen);
  });
}
function dataField(value, key) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && own(descriptor, 'value') ? descriptor.value : undefined;
}

/** Full structural identity; object key order is irrelevant, array order is authored. */
function identity(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (!value || typeof value !== 'object' || ancestors.has(value))
    throw TypeError('Campaign route identities require finite acyclic JSON.');
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    throw TypeError('Unsafe campaign route identity prototype.');
  const keys = Reflect.ownKeys(value).filter((key) => key !== 'length' || !Array.isArray(value));
  if (
    keys.some(
      (key) =>
        typeof key !== 'string' ||
        ['__proto__', 'prototype', 'constructor', 'toJSON'].includes(key),
    )
  )
    throw TypeError('Unsafe campaign route identity key.');
  ancestors.add(value);
  try {
    const field = (key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !own(descriptor, 'value') || !descriptor.enumerable)
        throw TypeError('Campaign route identities cannot execute accessors.');
      return identity(descriptor.value, ancestors);
    };
    if (Array.isArray(value)) {
      if (keys.length !== value.length || keys.some((key, index) => key !== String(index)))
        throw TypeError('Campaign route identities require dense plain arrays.');
      return `[${keys.map(field).join(',')}]`;
    }
    return `{${keys
      .sort()
      .map((key) => `${JSON.stringify(key)}:${field(key)}`)
      .join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}
function invoke(target, method, args) {
  const result = target[method](...args);
  if (result && typeof result.then === 'function')
    throw TypeError(`Campaign route callback ${method} must be synchronous.`);
  return result;
}
function flag(map, key) {
  if (!object(map)) return false;
  const descriptor = Object.getOwnPropertyDescriptor(map, key);
  if (!descriptor || !own(descriptor, 'value')) return false;
  const value = descriptor.value;
  if (value === true) return true;
  if (!object(value)) return false;
  const ready = Object.getOwnPropertyDescriptor(value, 'ready');
  return Boolean(ready && own(ready, 'value') && ready.value === true);
}
const observationGate = (reason) => ({ unmet: reason });
const operationGate = (reason) => ({ ok: false, unmet: [reason] });

export function createCampaignAdapterRouter({ content, registrations = [], parent } = {}) {
  if (object(content)) identity(content);
  if (!object(content) || !Array.isArray(content.missions) || !Array.isArray(registrations))
    throw TypeError(
      'Campaign router requires an authored content catalogue and explicit registrations.',
    );
  if (
    !object(parent) ||
    !['captureWorld', 'validateWorld', 'restoreWorld'].every(
      (key) => typeof parent[key] === 'function',
    )
  )
    throw TypeError('Campaign router requires parent-owned complete snapshot callbacks.');
  const immutableCatalogue = deeplyFrozen(content),
    trustedIdentities = new WeakMap();
  const authoredIdentity = (value) =>
    value && typeof value === 'object' && trustedIdentities.has(value)
      ? trustedIdentities.get(value)
      : identity(value);
  const catalogue = new Map(),
    owners = new Map(),
    handlers = new Map();
  for (const mission of content.missions) {
    if (
      !object(mission) ||
      !missionId(mission.id) ||
      catalogue.has(mission.id) ||
      !Array.isArray(mission.stages)
    )
      throw TypeError('Invalid or duplicate authored campaign mission.');
    const signature = identity(mission),
      stages = new Map();
    if (immutableCatalogue) trustedIdentities.set(mission, signature);
    for (const stage of mission.stages) {
      if (
        !object(stage) ||
        typeof stage.id !== 'string' ||
        typeof stage.type !== 'string' ||
        stages.has(stage.id)
      )
        throw TypeError('Invalid or duplicate authored campaign stage.');
      const key = identity(stage);
      if (immutableCatalogue) trustedIdentities.set(stage, key);
      stages.set(stage.id, { key, stage });
      if (!owners.has(key)) owners.set(key, []);
      owners.get(key).push(mission.id);
    }
    catalogue.set(mission.id, { mission, signature, stages });
  }
  for (const registration of registrations) {
    if (
      !object(registration) ||
      !catalogue.has(registration.missionId) ||
      handlers.has(registration.missionId) ||
      !object(registration.adapter)
    )
      throw TypeError('Campaign handler registration must have one exact authored mission owner.');
    handlers.set(registration.missionId, registration.adapter);
  }
  function currentEntry(id) {
    const entry = catalogue.get(id),
      adapter = handlers.get(id);
    if (!entry || !adapter || !required.every((key) => typeof adapter[key] === 'function'))
      return null;
    // The complete JSON catalogue was validated before deep immutability was
    // proved. Only these retained references may bypass repeated traversal.
    // Backend methods/readiness remain live and are never cached as permission.
    if (immutableCatalogue) return { ...entry, adapter };
    const missions = dataField(content, 'missions');
    if (!Array.isArray(missions)) return null;
    let actual;
    for (let index = 0; index < missions.length; index++) {
      const candidate = dataField(missions, String(index));
      if (object(candidate) && dataField(candidate, 'id') === id) {
        actual = candidate;
        break;
      }
    }
    return actual && identity(actual) === entry.signature ? { ...entry, adapter } : null;
  }
  function exactStage(id, type, stage) {
    if (!object(stage)) return null;
    const signature = authoredIdentity(stage);
    const entry = currentEntry(id),
      authored = entry?.stages.get(stage?.id);
    return entry && authored && type === stage.type && authored.key === signature
      ? { ...entry, authored }
      : null;
  }
  function supportsStage(type, stage) {
    if (!object(stage)) return false;
    const signature = authoredIdentity(stage);
    if (stage.type !== type) return false;
    const matches = owners.get(signature);
    // A cloned shared stage cannot identify one owner. Never borrow a handler
    // from a different or unregistered mission with identical stage content.
    return Boolean(
      matches?.length &&
      matches.every((id) => {
        const entry = exactStage(id, type, stage);
        return entry && invoke(entry.adapter, 'supportsStage', [type, stage]) === true;
      }),
    );
  }
  function scopedStage(stage, request) {
    if (!object(stage) || !object(request)) return null;
    authoredIdentity(stage);
    identity(request);
    if (!object(request) || !missionId(request.missionId) || request.stageId !== stage?.id)
      return null;
    const entry = exactStage(request.missionId, stage?.type, stage);
    return entry && invoke(entry.adapter, 'supportsStage', [stage.type, stage]) === true
      ? entry
      : null;
  }
  function supportsKind(method, type) {
    return [...handlers.keys()].some((id) => {
      const entry = currentEntry(id);
      return entry && invoke(entry.adapter, method, [type]) === true;
    });
  }
  return {
    // Preserve the original authored object/order and serialized fingerprint.
    content,
    capabilities: empty,
    supportsMission(id, mission) {
      if (!object(mission)) return false;
      const signature = authoredIdentity(mission);
      const entry = currentEntry(id);
      return Boolean(
        entry &&
        object(mission) &&
        mission.id === id &&
        signature === entry.signature &&
        (typeof entry.adapter.supportsMission !== 'function' ||
          invoke(entry.adapter, 'supportsMission', [id, entry.mission]) === true) &&
        [...entry.stages.values()].every(({ stage }) => supportsStage(stage.type, stage)),
      );
    },
    capabilitiesForMission(id) {
      const entry = currentEntry(id);
      if (!entry) return empty;
      const flags = entry.adapter.capabilities;
      if (flags && typeof flags.then === 'function')
        throw TypeError('Campaign capabilities must be synchronous.');
      return Object.freeze(
        Object.fromEntries(
          (entry.mission.requiredCapabilities || []).map(({ id: key }) => [
            key,
            key === 'director' && typeof entry.adapter.supportsMission !== 'function'
              ? true
              : flag(flags, key),
          ]),
        ),
      );
    },
    supportsStage,
    activateStage(stage, request) {
      const entry = scopedStage(stage, request);
      return entry
        ? invoke(entry.adapter, 'activateStage', [stage, request])
        : operationGate('unregistered-authored-stage-handler');
    },
    supportsCondition: (type) => supportsKind('supportsCondition', type),
    observe(condition, request) {
      if (object(condition)) identity(condition);
      if (object(request)) identity(request);
      const entry = object(request) && currentEntry(request.missionId);
      if (
        !entry ||
        !object(condition) ||
        invoke(entry.adapter, 'supportsCondition', [condition.type]) !== true
      )
        return observationGate('unregistered-mission-condition-handler');
      return invoke(entry.adapter, 'observe', [condition, request]);
    },
    supportsAction: (type) => supportsKind('supportsAction', type),
    applyActions(actions, request) {
      if (Array.isArray(actions)) identity(actions);
      if (object(request)) identity(request);
      const entry = object(request) && currentEntry(request.missionId);
      if (
        !entry ||
        !Array.isArray(actions) ||
        !actions.every(
          (action) =>
            object(action) && invoke(entry.adapter, 'supportsAction', [action.type]) === true,
        )
      )
        return operationGate('unregistered-mission-action-handler');
      return invoke(entry.adapter, 'applyActions', [actions, request]);
    },
    canCompleteStage(stage, request) {
      const entry = scopedStage(stage, request);
      if (!entry) return observationGate('unregistered-authored-stage-handler');
      return typeof entry.adapter.canCompleteStage === 'function'
        ? invoke(entry.adapter, 'canCompleteStage', [stage, request])
        : true;
    },
    readOutcome(stage, request) {
      const entry = scopedStage(stage, request);
      return entry && typeof entry.adapter.readOutcome === 'function'
        ? invoke(entry.adapter, 'readOutcome', [stage, request])
        : observationGate('mission-outcome-observer-missing');
    },
    captureWorld: (request) => invoke(parent, 'captureWorld', [request]),
    validateWorld: (snapshot, request) => invoke(parent, 'validateWorld', [snapshot, request]),
    restoreWorld: (snapshot, request) => invoke(parent, 'restoreWorld', [snapshot, request]),
  };
}
