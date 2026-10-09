/** Saved original phone conversations. World success belongs to explicit parent observers. */
const VERSION = 1;
const MAX_CALLS = 2048;
const MAX_CONTACTS = 128;
const EPS = 1e-7;
const own = (v, k) => Object.hasOwn(v, k);
const lookup = (map, key) => (typeof key === 'string' && own(map, key) ? map[key] : null);
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const id = (v) =>
  typeof v === 'string' &&
  /^[a-z0-9][a-z0-9:._-]{0,255}$/i.test(v) &&
  !['constructor', 'prototype', '__proto__', 'toJSON'].includes(v);
const phases = new Set([
  'ready',
  'queued',
  'ringing',
  'connected',
  'fallback',
  'ended',
  'missed',
  'declined',
  'cancelled',
]);
const busy = new Set(['ringing', 'connected', 'fallback']);
const terminal = new Set(['ended', 'missed', 'declined', 'cancelled']);
const fail = (reason) => ({ ok: false, reason });
function copy(value) {
  const seen = new Set();
  function visit(v, depth = 0) {
    if (depth > 80) throw Error('Phone data is too deeply nested.');
    if (v === null || typeof v === 'string' || typeof v === 'boolean' || finite(v)) return v;
    if (!v || typeof v !== 'object' || seen.has(v))
      throw Error('Phone state requires finite acyclic JSON.');
    if (!Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v)))
      throw Error('Unsafe phone data prototype.');
    seen.add(v);
    const out = Array.isArray(v) ? [] : {};
    for (const key of Object.keys(v)) {
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      if (
        ['constructor', 'prototype', '__proto__', 'toJSON'].includes(key) ||
        !own(descriptor, 'value')
      )
        throw Error('Unsafe phone data property.');
      out[key] = visit(descriptor.value, depth + 1);
    }
    if (Array.isArray(v) && out.length !== v.length) throw Error('Sparse phone array.');
    seen.delete(v);
    return out;
  }
  return visit(value);
}
function hash(value) {
  let result = 2166136261;
  for (const c of JSON.stringify(value))
    result = Math.imul(result ^ c.charCodeAt(0), 16777619) >>> 0;
  return result.toString(16).padStart(8, '0');
}
function now(state) {
  if (!finite(state.time) || state.time < 0)
    throw Error('Phone requires the actual parent simulation clock.');
  return state.time;
}
function validOwner(v) {
  return (
    object(v) &&
    /^LL-ST-\d{3}$/.test(v.missionId) &&
    id(v.stageId) &&
    Number.isSafeInteger(v.attempt) &&
    v.attempt > 0 &&
    id(v.receipt)
  );
}
const normalizeOwner = (owner) => ({
  missionId: owner.missionId,
  stageId: owner.stageId,
  attempt: owner.attempt,
  receipt: owner.receipt,
});
function normalizeLines(lines) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 200)
    throw Error('Invalid phone conversation length.');
  return lines.map((line) => {
    if (
      !object(line) ||
      typeof line.speaker !== 'string' ||
      !line.speaker.length ||
      line.speaker.length > 100 ||
      typeof line.text !== 'string' ||
      !line.text.length ||
      line.text.length > 4000 ||
      (line.when !== undefined && line.when !== 'always')
    )
      throw Error('Invalid or unbound phone dialogue.');
    const seconds = line.seconds ?? Math.max(2, Math.min(7, 1 + line.text.length / 16));
    if (!finite(seconds) || seconds <= 0 || seconds > 60)
      throw Error('Invalid phone line duration.');
    return { speaker: line.speaker, text: line.text, seconds };
  });
}
function normalizeDefinition(definition) {
  copy(definition);
  if (
    !object(definition) ||
    !id(definition.id) ||
    !validOwner(definition.owner) ||
    !id(definition.contact) ||
    !id(definition.topic) ||
    !['incoming', 'outgoing'].includes(definition.direction)
  )
    throw Error('Invalid phone call identity/ownership.');
  const ringSeconds = definition.ringSeconds ?? 15;
  const callerName = definition.callerName ?? null;
  if (
    callerName !== null &&
    (typeof callerName !== 'string' || !callerName.length || callerName.length > 100)
  )
    throw Error('Invalid incoming caller label.');
  if (!finite(ringSeconds) || ringSeconds <= 0 || ringSeconds > 120)
    throw Error('Invalid ring duration.');
  const window = definition.window ?? null;
  if (
    window &&
    (!object(window) ||
      !finite(window.startedAt) ||
      window.startedAt < 0 ||
      !finite(window.seconds) ||
      window.seconds <= 0 ||
      window.seconds > 3600 ||
      !object(window.trigger))
  )
    throw Error('Invalid observed call window.');
  if (!object(definition.trigger) || !object(definition.connection) || !object(definition.delivery))
    throw Error('Physical phone trigger/connection/delivery adapters must be explicit.');
  const fallback = definition.fallback
    ? {
        lines: normalizeLines(definition.fallback.lines),
        ready: copy(definition.fallback.ready),
      }
    : null;
  if (fallback && !object(fallback.ready))
    throw Error('Fallback requires actual message availability.');
  return {
    id: definition.id,
    owner: normalizeOwner(definition.owner),
    contact: definition.contact,
    topic: definition.topic,
    direction: definition.direction,
    callerName,
    lines: normalizeLines(definition.lines),
    ringSeconds,
    auto: definition.auto === true,
    trigger: copy(definition.trigger),
    connection: copy(definition.connection),
    delivery: copy(definition.delivery),
    window: window ? copy(window) : null,
    fallback,
  };
}
function ownershipKey(definition) {
  return hash([definition.owner, definition.direction, definition.contact, definition.topic]);
}
function observe(context, state, condition, call) {
  if (typeof context?.observe !== 'function') return { unmet: ['phone-world-observer-missing'] };
  const result = context.observe(state, copy(condition), copy(call.definition.owner), call.id);
  if (result && typeof result.then === 'function')
    throw Error('Phone observers must be synchronous.');
  if (result === true || result === false) return { met: result };
  const reasons = object(result) ? [].concat(result.unmet || []) : [];
  return {
    unmet:
      reasons.length &&
      reasons.every((reason) => typeof reason === 'string' && reason.length <= 1000)
        ? reasons
        : ['phone-world-observation-unknown'],
  };
}
function ownerStatus(context, state, owner) {
  if (typeof context?.ownerStatus !== 'function') return 'unknown';
  const value = context.ownerStatus(state, copy(owner));
  if (value && typeof value.then === 'function')
    throw Error('Phone ownership observation must be synchronous.');
  return ['active', 'suspended', 'finished', 'failed', 'abandoned'].includes(value)
    ? value
    : 'unknown';
}
function available(state, call, context) {
  const status = ownerStatus(context, state, call.definition.owner);
  return status === 'active'
    ? { met: true }
    : status === 'unknown'
      ? { unmet: ['phone-owner-observation-unknown'] }
      : { met: false };
}
function event(state, call, type, detail = {}) {
  call.events.push({ type, at: now(state), ...copy(detail) });
  if (call.events.length > 128) call.events.shift();
}
export function initializePhoneCalls(state, { contacts = [] } = {}) {
  now(state);
  if (!state.phoneCalls) {
    state.phoneCalls = {
      version: VERSION,
      sequence: 0,
      muted: false,
      lastObservedTime: state.time,
      activeId: null,
      queue: [],
      contacts: {},
      calls: {},
      ownership: {},
      outcomes: {},
      contactReceipts: {},
    };
    for (const contact of contacts) {
      if (
        !object(contact) ||
        !id(contact.id) ||
        typeof contact.name !== 'string' ||
        !contact.name.length
      )
        throw Error('Invalid initial phone contact.');
      state.phoneCalls.contacts[contact.id] = {
        id: contact.id,
        name: contact.name,
        addedAt: now(state),
        receipt: `initial:${contact.id}`,
      };
    }
  }
  if (state.phoneCalls.version !== VERSION) throw Error('Unsupported phone version.');
  return state.phoneCalls;
}
function activateNext(state) {
  const m = initializePhoneCalls(state);
  if (m.activeId) return;
  while (m.queue.length) {
    const call = m.calls[m.queue.shift()];
    if (call.phase !== 'queued') continue;
    call.phase = 'ringing';
    call.ringingAt = now(state);
    m.activeId = call.id;
    event(state, call, 'ringing');
    break;
  }
}
export function registerPhoneCall(state, definition, context) {
  const m = initializePhoneCalls(state),
    normalized = normalizeDefinition(definition),
    key = ownershipKey(normalized);
  if (own(m.calls, normalized.id))
    return m.calls[normalized.id].definitionHash === hash(normalized)
      ? { ok: true, replayed: true, id: normalized.id }
      : fail('phone-call-definition-conflict');
  if (own(m.ownership, key)) return fail('phone-owner-already-has-this-call');
  if (Object.keys(m.calls).length >= MAX_CALLS) return fail('phone-history-capacity');
  if (
    !own(m.contacts, normalized.contact) &&
    !(normalized.direction === 'incoming' && normalized.callerName)
  )
    return fail('phone-contact-not-known');
  if (normalized.window && normalized.window.startedAt > now(state) + EPS)
    return fail('phone-window-start-is-in-the-future');
  const call = {
    id: normalized.id,
    definition: normalized,
    definitionHash: hash(normalized),
    phase: normalized.direction === 'incoming' ? 'queued' : 'ready',
    createdAt: now(state),
    ringingAt: null,
    connectedAt: null,
    fallbackAt: null,
    finishedAt: null,
    index: 0,
    dialCount: 0,
    dialogueKind: 'conversation',
    history: [],
    acknowledgments: [],
    events: [],
    presentation: { visible: false, presented: false, seconds: 0 },
    fallbackRead: false,
    blocked: [],
  };
  const status = available(state, call, context);
  if (!status.met)
    return status.unmet ? { ok: false, unmet: status.unmet } : fail('phone-owner-not-active');
  for (const condition of [
    normalized.trigger,
    ...(normalized.window ? [normalized.window.trigger] : []),
  ]) {
    const proof = observe(context, state, condition, call);
    if (!proof.met)
      return proof.unmet ? { ok: false, unmet: proof.unmet } : fail('phone-trigger-not-observed');
  }
  m.calls[call.id] = call;
  m.ownership[key] = call.id;
  m.sequence++;
  event(state, call, 'created');
  if (normalized.direction === 'incoming') m.queue.push(call.id);
  activateNext(state);
  return { ok: true, id: call.id };
}
function linesFor(call) {
  return call.dialogueKind === 'message' ? call.definition.fallback.lines : call.definition.lines;
}
function outcome(state, call, kind) {
  const m = initializePhoneCalls(state),
    receipt = `phone:${call.id}:${kind}`;
  if (!own(m.outcomes, receipt))
    m.outcomes[receipt] = {
      id: receipt,
      callId: call.id,
      kind,
      direction: call.definition.direction,
      contact: call.definition.contact,
      topic: call.definition.topic,
      owner: copy(call.definition.owner),
      at: now(state),
      history: copy(call.history),
    };
  return copy(m.outcomes[receipt]);
}
function finish(state, call, phase, kind) {
  const m = initializePhoneCalls(state);
  call.phase = phase;
  call.finishedAt = now(state);
  call.presentation.visible = call.presentation.presented = false;
  const receipt = outcome(state, call, kind);
  event(state, call, phase, { outcome: kind });
  if (m.activeId === call.id) m.activeId = null;
  m.queue = m.queue.filter((entry) => entry !== call.id);
  activateNext(state);
  return { ok: true, receipt };
}
function expired(state, call) {
  const window = call.definition.window;
  return Boolean(window && now(state) + EPS >= window.startedAt + window.seconds);
}
function tryDelivery(state, call, context) {
  const ownership =
    call.phase === 'fallback'
      ? {
          met: ownerStatus(context, state, call.definition.owner) !== 'unknown',
        }
      : available(state, call, context);
  if (!ownership.met)
    return ownership.unmet ? { ok: false, unmet: ownership.unmet } : fail('phone-owner-not-active');
  if (call.phase !== 'fallback' && expired(state, call))
    return finish(state, call, 'missed', 'deadline-missed');
  const proof = observe(
    context,
    state,
    call.phase === 'fallback' ? call.definition.fallback.ready : call.definition.delivery,
    call,
  );
  if (!proof.met) {
    call.blocked = proof.unmet || ['phone-delivery-not-observed'];
    return {
      ok: false,
      waiting: 'world-delivery-observation',
      unmet: copy(call.blocked),
    };
  }
  call.blocked = [];
  if (call.phase === 'fallback') {
    call.fallbackRead = true;
    return finish(state, call, 'ended', 'fallback-read');
  }
  return finish(
    state,
    call,
    'ended',
    call.definition.direction === 'outgoing' ? 'delivered' : 'answered',
  );
}
export function actPhoneCalls(state, action, context = {}) {
  copy(action);
  const m = initializePhoneCalls(state);
  if (action.type === 'mute') {
    m.muted = action.muted === true;
    return { ok: true };
  }
  const call = lookup(m.calls, action.id);
  if (!call) return fail('phone-call-not-found');
  const historical = action.type === 'read-fallback' || call.phase === 'fallback';
  const ownership = historical
    ? { met: ownerStatus(context, state, call.definition.owner) !== 'unknown' }
    : available(state, call, context);
  if (!ownership.met)
    return ownership.unmet ? { ok: false, unmet: ownership.unmet } : fail('phone-owner-not-active');
  if (!historical && !terminal.has(call.phase) && expired(state, call))
    return finish(state, call, 'missed', 'deadline-missed');
  if (action.type === 'dial') {
    if (
      call.definition.direction !== 'outgoing' ||
      !['ready', 'missed', 'cancelled'].includes(call.phase)
    )
      return fail('phone-call-not-ready-to-dial');
    if (action.contact !== call.definition.contact) {
      event(state, call, 'wrong-contact');
      return { ok: false, reason: 'wrong-contact', keepOpen: true };
    }
    if (expired(state, call)) return fail('phone-warning-window-expired');
    if (m.activeId) return fail('phone-busy');
    call.index = 0;
    call.history = [];
    call.dialogueKind = 'conversation';
    call.fallbackRead = false;
    call.fallbackAt = null;
    call.connectedAt = null;
    call.finishedAt = null;
    call.presentation = { visible: false, presented: false, seconds: 0 };
    call.dialCount++;
    call.phase = 'ringing';
    call.ringingAt = now(state);
    m.activeId = call.id;
    event(state, call, 'dialled');
    return { ok: true };
  }
  if (action.type === 'answer') {
    if (
      m.activeId !== call.id ||
      call.phase !== 'ringing' ||
      call.definition.direction !== 'incoming'
    )
      return fail('phone-is-not-ringing-incoming');
    return connect(state, call, context);
  }
  if (action.type === 'decline' || action.type === 'hang-up') {
    if (m.activeId !== call.id || !busy.has(call.phase)) return fail('phone-call-not-active');
    return finish(
      state,
      call,
      action.type === 'decline' ? 'declined' : 'cancelled',
      action.type === 'decline' ? 'declined' : 'cancelled',
    );
  }
  if (action.type === 'read-fallback') {
    if (!call.definition.fallback || !['missed', 'declined', 'cancelled'].includes(call.phase))
      return fail('phone-fallback-not-available');
    if (m.activeId) return fail('phone-busy');
    const proof = observe(context, state, call.definition.fallback.ready, call);
    if (!proof.met)
      return proof.unmet ? { ok: false, unmet: proof.unmet } : fail('phone-message-not-observed');
    call.phase = 'fallback';
    if (call.dialogueKind !== 'message') {
      call.dialogueKind = 'message';
      call.fallbackAt = now(state);
      call.index = 0;
      call.history = [];
      call.presentation = { visible: false, presented: false, seconds: 0 };
    }
    m.activeId = call.id;
    event(state, call, 'fallback-opened');
    return { ok: true };
  }
  if (action.type === 'acknowledge') {
    if (
      m.activeId !== call.id ||
      !['connected', 'fallback'].includes(call.phase) ||
      (action.dialCount !== undefined && action.dialCount !== call.dialCount) ||
      action.index !== call.index ||
      !call.presentation.visible ||
      !call.presentation.presented
    )
      return fail('phone-line-not-presented');
    const lines = linesFor(call);
    if (call.index >= lines.length) return tryDelivery(state, call, context);
    if (call.acknowledgments.length >= 20000) return fail('phone-acknowledgment-capacity');
    if (action.automatic === true && call.presentation.seconds + EPS < lines[call.index].seconds)
      return fail('phone-line-duration-not-observed');
    const acknowledgment = {
      index: call.index,
      dialCount: call.dialCount,
      kind: call.phase === 'fallback' ? 'message' : 'conversation',
      at: now(state),
      visibleSeconds: call.presentation.seconds,
      channel: m.muted || call.phase === 'fallback' ? 'text' : 'voice-and-captions',
      acknowledged: action.automatic !== true,
    };
    call.history.push(acknowledgment);
    call.acknowledgments.push({
      ...copy(acknowledgment),
      startedAt: call.phase === 'fallback' ? call.fallbackAt : call.connectedAt,
    });
    event(state, call, 'line-acknowledged', {
      index: call.index,
      dialCount: call.dialCount,
      kind: acknowledgment.kind,
    });
    call.index++;
    call.presentation = { visible: true, presented: false, seconds: 0 };
    const result =
      call.index === lines.length
        ? tryDelivery(state, call, context)
        : { ok: true, index: call.index };
    return {
      ...result,
      acknowledged: true,
      acknowledgment: phoneAcknowledgments(state, call.id).at(-1),
    };
  }
  return fail('unknown-phone-action');
}
function connect(state, call, context) {
  const proof = observe(context, state, call.definition.connection, call);
  if (!proof.met) {
    call.blocked = proof.unmet || ['phone-contact-has-not-answered'];
    return { ok: false, waiting: 'connection', unmet: copy(call.blocked) };
  }
  call.phase = 'connected';
  if (call.definition.direction === 'incoming' && call.dialCount === 0) call.dialCount = 1;
  call.connectedAt = now(state);
  call.blocked = [];
  event(state, call, 'connected');
  return { ok: true };
}
export function presentPhoneLine(state, callId, index, dialCount = null) {
  const m = initializePhoneCalls(state),
    call = lookup(m.calls, callId);
  if (
    !call ||
    m.activeId !== callId ||
    !['connected', 'fallback'].includes(call.phase) ||
    call.index !== index ||
    (dialCount !== null && dialCount !== call.dialCount) ||
    index >= linesFor(call).length
  )
    return false;
  call.presentation.visible = call.presentation.presented = true;
  return true;
}
export function setPhonePresentationVisibility(state, visible) {
  const m = initializePhoneCalls(state),
    call = lookup(m.calls, m.activeId);
  if (!call) return;
  call.presentation.visible = visible === true;
  if (!visible) call.presentation.presented = false;
}
/** Stable receipts let a parent mirror only actually presented lines into its director. */
export function phoneAcknowledgments(state, callId) {
  const call = lookup(initializePhoneCalls(state).calls, callId);
  if (!call) return [];
  return call.acknowledgments.map((entry) => {
    const lines = entry.kind === 'message' ? call.definition.fallback.lines : call.definition.lines;
    return {
      ...copy(entry),
      id: `phone-ack:${hash(callId)}:${entry.kind}:${entry.dialCount}:${entry.index}`,
      callId,
      owner: copy(call.definition.owner),
      speaker: lines[entry.index].speaker,
      text: lines[entry.index].text,
    };
  });
}
export function updatePhoneCalls(state, dt, context = {}) {
  const m = initializePhoneCalls(state),
    time = now(state);
  if (!finite(dt) || dt < 0 || dt > 0.5 || time + EPS < m.lastObservedTime)
    throw Error('Invalid observed phone timestep.');
  const elapsed = Math.min(dt, Math.max(0, time - m.lastObservedTime));
  m.lastObservedTime = time;
  if (context.paused) {
    setPhonePresentationVisibility(state, false);
    return m;
  }
  for (const call of Object.values(m.calls)) {
    if (terminal.has(call.phase)) continue;
    const status = ownerStatus(context, state, call.definition.owner);
    if (call.phase !== 'fallback' && ['finished', 'failed', 'abandoned'].includes(status)) {
      finish(state, call, 'cancelled', 'owner-ended');
      continue;
    }
    if (status === 'unknown' || (call.phase !== 'fallback' && status !== 'active')) {
      call.presentation.visible = call.presentation.presented = false;
      call.blocked = [
        status === 'suspended' ? 'phone-owner-suspended' : 'phone-owner-observation-unknown',
      ];
      continue;
    }
    if (call.phase !== 'fallback' && expired(state, call)) {
      finish(state, call, 'missed', 'deadline-missed');
      continue;
    }
    if (call.phase === 'ringing') {
      if (time + EPS >= call.ringingAt + call.definition.ringSeconds) {
        finish(state, call, 'missed', 'missed');
        continue;
      }
      if (call.definition.direction === 'outgoing') connect(state, call, context);
    }
    if (['connected', 'fallback'].includes(call.phase)) {
      const lines = linesFor(call);
      if (call.index === lines.length) {
        tryDelivery(state, call, context);
        continue;
      }
      if (call.presentation.visible && call.presentation.presented) {
        call.presentation.seconds = Math.min(
          lines[call.index].seconds,
          call.presentation.seconds + elapsed,
        );
        if (call.definition.auto && call.presentation.seconds + EPS >= lines[call.index].seconds)
          actPhoneCalls(
            state,
            {
              type: 'acknowledge',
              id: call.id,
              index: call.index,
              automatic: true,
            },
            context,
          );
      }
    }
  }
  activateNext(state);
  return m;
}
export function phoneCallView(state) {
  const m = initializePhoneCalls(state),
    call = lookup(m.calls, m.activeId);
  if (!call)
    return {
      active: false,
      muted: m.muted,
      incoming: null,
      line: null,
      history: Object.values(m.outcomes).map(copy),
    };
  const lines = ['connected', 'fallback'].includes(call.phase) ? linesFor(call) : [];
  return {
    active: true,
    id: call.id,
    phase: call.phase,
    direction: call.definition.direction,
    contact: copy(
      lookup(m.contacts, call.definition.contact) || {
        id: call.definition.contact,
        name: call.definition.callerName,
        known: false,
      },
    ),
    topic: call.definition.topic,
    owner: copy(call.definition.owner),
    muted: m.muted,
    audibleRing: call.phase === 'ringing' && !m.muted,
    visualRing: call.phase === 'ringing',
    channel: m.muted || call.phase === 'fallback' ? 'text' : 'voice-and-captions',
    line: lines[call.index]
      ? {
          ...copy(lines[call.index]),
          callId: call.id,
          index: call.index,
          dialCount: call.dialCount,
        }
      : null,
    secondsRemaining: call.definition.window
      ? Math.max(0, call.definition.window.startedAt + call.definition.window.seconds - now(state))
      : null,
    waitingForDelivery:
      ['connected', 'fallback'].includes(call.phase) && call.index === lines.length,
  };
}
export function phoneOutcome(state, query) {
  query = copy(query);
  const m = initializePhoneCalls(state);
  if (!validOwner(query.owner)) return null;
  return copy(
    Object.values(m.outcomes).find(
      (entry) =>
        entry.kind === query.kind &&
        entry.direction === query.direction &&
        entry.contact === query.contact &&
        entry.topic === query.topic &&
        JSON.stringify(entry.owner) === JSON.stringify(normalizeOwner(query.owner)),
    ) || null,
  );
}
export function addPhoneContact(state, contact, owner, requirement, receipt, context) {
  contact = copy(contact);
  owner = copy(owner);
  requirement = copy(requirement);
  const m = initializePhoneCalls(state);
  if (
    !object(contact) ||
    !id(contact.id) ||
    typeof contact.name !== 'string' ||
    !contact.name.length ||
    !validOwner(owner) ||
    !object(requirement) ||
    !id(receipt)
  )
    return fail('invalid-phone-contact-unlock');
  owner = normalizeOwner(owner);
  contact = { id: contact.id, name: contact.name };
  const existing = lookup(m.contacts, contact.id);
  if (existing && existing.name !== contact.name) return fail('phone-contact-identity-conflict');
  const signature = hash([contact, owner, requirement]);
  if (own(m.contactReceipts, receipt))
    return m.contactReceipts[receipt].signature === signature
      ? { ok: true, replayed: true }
      : fail('phone-contact-receipt-conflict');
  if (ownerStatus(context, state, owner) !== 'active')
    return fail('phone-contact-owner-not-active');
  const proof = observe(context, state, requirement, {
    id: receipt,
    definition: { owner },
  });
  if (!proof.met)
    return proof.unmet
      ? { ok: false, unmet: proof.unmet }
      : fail('phone-contact-world-condition-not-observed');
  if (!own(m.contacts, contact.id) && Object.keys(m.contacts).length >= MAX_CONTACTS)
    return fail('phone-contact-capacity');
  if (!existing)
    m.contacts[contact.id] = {
      id: contact.id,
      name: contact.name,
      addedAt: now(state),
      receipt,
    };
  m.contactReceipts[receipt] = {
    id: receipt,
    contact: contact.id,
    owner: copy(owner),
    requirement: copy(requirement),
    signature,
    at: now(state),
  };
  return { ok: true, receipt };
}

/** Read exact authored phone content; this does not integrate its actor/route stages. */
export function collectorWarningDefinition(mission, owner, { id: callId, identifiedAt } = {}) {
  const stage = mission?.stages?.find((entry) => entry.id === 'warn'),
    rule = stage?.completion?.find((entry) => entry.type === 'outgoing-call-delivered');
  if (
    mission?.id !== 'LL-ST-002' ||
    owner?.missionId !== mission.id ||
    owner?.stageId !== 'warn' ||
    !rule ||
    stage.clock?.startsOn !== 'collector-identification'
  )
    throw Error('Unbound collector-warning mission definition.');
  return {
    id: callId,
    owner: copy(owner),
    contact: rule.contact,
    topic: rule.topic,
    direction: 'outgoing',
    lines: copy(stage.dialogue),
    ringSeconds: 10,
    auto: false,
    window: {
      startedAt: identifiedAt,
      seconds: stage.clock.seconds,
      trigger: {
        type: 'collector-identification',
        actor: 'LL-ARC-REEVE',
        at: identifiedAt,
      },
    },
    trigger: {
      type: 'phone-objective-active',
      missionId: mission.id,
      stageId: stage.id,
    },
    connection: { type: 'phone-contact-answered', actor: rule.contact },
    delivery: {
      type: 'collector-warning-permitted',
      actor: rule.contact,
      collector: 'LL-ARC-REEVE',
      before: 'annex-door',
    },
  };
}
export function tessContactRequirement(mission) {
  const stage = mission?.stages?.find((entry) => entry.id === 'home'),
    rule = stage?.completion?.find((entry) => entry.type === 'dropoffs-complete');
  if (
    mission?.id !== 'LL-ST-003' ||
    !rule ||
    !stage.onComplete?.some(
      (entry) => entry.type === 'contact-added' && entry.actor === 'LL-CHAR-025',
    )
  )
    throw Error('Unbound Tess contact requirement.');
  return copy(rule);
}

export function validatePhoneCalls(state) {
  const m = state.phoneCalls;
  copy(m);
  if (
    !object(m) ||
    m.version !== VERSION ||
    !Number.isSafeInteger(m.sequence) ||
    m.sequence < 0 ||
    typeof m.muted !== 'boolean' ||
    !finite(m.lastObservedTime) ||
    m.lastObservedTime < 0 ||
    m.lastObservedTime > now(state) + EPS ||
    !object(m.calls) ||
    !object(m.contacts) ||
    !object(m.outcomes) ||
    !object(m.ownership) ||
    !object(m.contactReceipts) ||
    !Array.isArray(m.queue) ||
    new Set(m.queue).size !== m.queue.length ||
    !(m.activeId === null || id(m.activeId))
  )
    throw Error('Invalid saved phone state.');
  if (
    Object.keys(m.calls).length > MAX_CALLS ||
    Object.keys(m.contacts).length > MAX_CONTACTS ||
    JSON.stringify(m).length > 8_000_000
  )
    throw Error('Saved phone state exceeds limits.');
  for (const [contactId, contact] of Object.entries(m.contacts))
    if (
      !id(contactId) ||
      contact.id !== contactId ||
      typeof contact.name !== 'string' ||
      !contact.name.length ||
      !id(contact.receipt) ||
      !finite(contact.addedAt) ||
      contact.addedAt < 0 ||
      contact.addedAt > state.time + EPS
    )
      throw Error('Invalid saved phone contact.');
  for (const [callId, call] of Object.entries(m.calls)) {
    const definition = normalizeDefinition(call.definition);
    if (
      call.id !== callId ||
      callId !== definition.id ||
      call.definitionHash !== hash(definition) ||
      !phases.has(call.phase) ||
      (!own(m.contacts, definition.contact) &&
        !(definition.direction === 'incoming' && definition.callerName)) ||
      m.ownership[ownershipKey(definition)] !== callId ||
      !finite(call.createdAt) ||
      call.createdAt < 0 ||
      call.createdAt > state.time + EPS ||
      !Array.isArray(call.history) ||
      !Array.isArray(call.acknowledgments) ||
      call.acknowledgments.length > 20000 ||
      !Array.isArray(call.events) ||
      call.events.length > 128 ||
      !Number.isSafeInteger(call.index) ||
      call.index < 0 ||
      !Number.isSafeInteger(call.dialCount) ||
      call.dialCount < 0 ||
      !['conversation', 'message'].includes(call.dialogueKind) ||
      typeof call.fallbackRead !== 'boolean' ||
      !Array.isArray(call.blocked)
    )
      throw Error('Invalid saved phone call.');
    if (call.dialogueKind === 'message' && !definition.fallback)
      throw Error('Saved fallback has no authored content.');
    const lines = linesFor(call);
    if (
      call.index > lines.length ||
      call.history.length !== call.index ||
      !object(call.presentation) ||
      typeof call.presentation.visible !== 'boolean' ||
      typeof call.presentation.presented !== 'boolean' ||
      !finite(call.presentation.seconds) ||
      call.presentation.seconds < 0 ||
      call.presentation.seconds > (lines[call.index]?.seconds || 60) + EPS ||
      (call.presentation.presented && !call.presentation.visible)
    )
      throw Error('Invalid phone presentation cursor.');
    if (
      (call.dialogueKind === 'conversation' && call.history.length && call.connectedAt === null) ||
      (['ready', 'queued', 'ringing'].includes(call.phase) && call.index !== 0)
    )
      throw Error('Saved phone dialogue has no actual connection.');
    const groups = new Map();
    let previousAck = call.createdAt;
    for (const entry of call.acknowledgments) {
      const lines = entry.kind === 'message' ? definition.fallback?.lines : definition.lines;
      const key = `${entry.kind}:${entry.dialCount}`,
        group = groups.get(key) || { index: 0, startedAt: entry.startedAt };
      if (
        !['conversation', 'message'].includes(entry.kind) ||
        !Number.isSafeInteger(entry.dialCount) ||
        entry.dialCount < (entry.kind === 'conversation' ? 1 : 0) ||
        entry.dialCount > call.dialCount ||
        entry.index !== group.index ||
        !lines?.[entry.index] ||
        !finite(entry.startedAt) ||
        entry.startedAt < call.createdAt ||
        entry.startedAt !== group.startedAt ||
        !finite(entry.at) ||
        entry.at + EPS < Math.max(previousAck, entry.startedAt) ||
        entry.at > state.time + EPS ||
        !finite(entry.visibleSeconds) ||
        entry.visibleSeconds < 0 ||
        entry.visibleSeconds > lines[entry.index].seconds + EPS ||
        typeof entry.acknowledged !== 'boolean' ||
        (!entry.acknowledged && entry.visibleSeconds + EPS < lines[entry.index].seconds) ||
        !['text', 'voice-and-captions'].includes(entry.channel)
      )
        throw Error('Invalid durable phone acknowledgment ledger.');
      previousAck = entry.at;
      group.index++;
      groups.set(key, group);
    }
    for (let index = 0; index < call.history.length; index++) {
      const entry = call.history[index];
      const durable = call.acknowledgments.find(
        (ack) =>
          ack.kind === entry.kind && ack.dialCount === entry.dialCount && ack.index === index,
      );
      const raw = durable && copy(durable);
      if (raw) delete raw.startedAt;
      if (!durable || JSON.stringify(raw) !== JSON.stringify(entry))
        throw Error('Current phone history lacks its durable acknowledgment.');
      if (
        entry.index !== index ||
        entry.dialCount !== call.dialCount ||
        entry.kind !== call.dialogueKind ||
        !finite(entry.at) ||
        entry.at < call.createdAt ||
        entry.at > state.time + EPS ||
        !finite(entry.visibleSeconds) ||
        entry.visibleSeconds < 0 ||
        entry.visibleSeconds > lines[index].seconds + EPS ||
        !['text', 'voice-and-captions'].includes(entry.channel) ||
        typeof entry.acknowledged !== 'boolean'
      )
        throw Error('Invalid actual phone acknowledgment history.');
      if (
        entry.at + EPS < (entry.kind === 'message' ? call.fallbackAt : call.connectedAt) ||
        (index > 0 && entry.at + EPS < call.history[index - 1].at)
      )
        throw Error('Phone acknowledgments precede their actual connection.');
    }
    for (const key of ['ringingAt', 'connectedAt', 'fallbackAt', 'finishedAt'])
      if (!(
        call[key] === null ||
        (finite(call[key]) && call[key] >= call.createdAt && call[key] <= state.time + EPS)
      ))
        throw Error('Invalid phone lifecycle clock.');
    if (
      (call.phase === 'ready' && definition.direction !== 'outgoing') ||
      (call.phase === 'queued' && definition.direction !== 'incoming') ||
      (call.phase === 'ringing' && call.ringingAt === null) ||
      (call.phase === 'connected' && (call.ringingAt === null || call.connectedAt === null)) ||
      (call.dialogueKind === 'message' && call.fallbackAt === null) ||
      (terminal.has(call.phase) && call.finishedAt === null)
    )
      throw Error('Saved phone phase has no actual lifecycle.');
    if (
      (call.connectedAt !== null &&
        (call.ringingAt === null || call.connectedAt + EPS < call.ringingAt)) ||
      (terminal.has(call.phase) &&
        call.finishedAt + EPS <
          Math.max(
            call.connectedAt || call.createdAt,
            call.dialogueKind === 'message' ? call.fallbackAt : call.createdAt,
          ))
    )
      throw Error('Saved phone lifecycle is out of order.');
    if (
      (busy.has(call.phase) && m.activeId !== callId) ||
      (call.phase === 'queued' && !m.queue.includes(callId))
    )
      throw Error('Saved phone ownership disagrees with call phase.');
    if (
      call.phase === 'ended' &&
      !own(
        m.outcomes,
        `phone:${callId}:${call.fallbackRead ? 'fallback-read' : definition.direction === 'outgoing' ? 'delivered' : 'answered'}`,
      )
    )
      throw Error('Completed call lacks its outcome.');
  }
  if (
    m.activeId !== null &&
    (!lookup(m.calls, m.activeId) || !busy.has(lookup(m.calls, m.activeId).phase))
  )
    throw Error('Invalid active saved phone owner.');
  for (const callId of m.queue)
    if (!lookup(m.calls, callId) || lookup(m.calls, callId).phase !== 'queued')
      throw Error('Invalid incoming phone queue.');
  for (const [receipt, entry] of Object.entries(m.outcomes)) {
    const call = lookup(m.calls, entry.callId);
    if (
      !call ||
      receipt !== `phone:${call.id}:${entry.kind}` ||
      entry.id !== receipt ||
      ![
        'delivered',
        'answered',
        'fallback-read',
        'missed',
        'deadline-missed',
        'declined',
        'cancelled',
        'owner-ended',
      ].includes(entry.kind) ||
      entry.direction !== call.definition.direction ||
      entry.contact !== call.definition.contact ||
      entry.topic !== call.definition.topic ||
      JSON.stringify(entry.owner) !== JSON.stringify(call.definition.owner) ||
      !finite(entry.at) ||
      entry.at < call.createdAt ||
      entry.at > state.time + EPS ||
      !Array.isArray(entry.history)
    )
      throw Error('Invalid saved phone outcome.');
    let priorAck = call.createdAt;
    for (let index = 0; index < entry.history.length; index++) {
      const ack = entry.history[index],
        lines = ack.kind === 'message' ? call.definition.fallback?.lines : call.definition.lines;
      if (
        !lines ||
        ack.index !== index ||
        !['conversation', 'message'].includes(ack.kind) ||
        !lines[index] ||
        !finite(ack.at) ||
        ack.at + EPS < priorAck ||
        ack.at > entry.at + EPS ||
        !finite(ack.visibleSeconds) ||
        ack.visibleSeconds < 0 ||
        ack.visibleSeconds > lines[index].seconds + EPS ||
        typeof ack.acknowledged !== 'boolean' ||
        !['text', 'voice-and-captions'].includes(ack.channel)
      )
        throw Error('Invalid saved phone outcome acknowledgments.');
      const durable = call.acknowledgments.find(
        (record) =>
          record.kind === ack.kind &&
          record.dialCount === ack.dialCount &&
          record.index === ack.index,
      );
      const raw = durable && copy(durable);
      if (raw) delete raw.startedAt;
      if (!durable || JSON.stringify(raw) !== JSON.stringify(ack))
        throw Error('Phone outcome lacks its durable acknowledgment.');
      priorAck = ack.at;
    }
    if (
      ['delivered', 'answered'].includes(entry.kind) &&
      (call.phase !== 'ended' ||
        call.dialogueKind !== 'conversation' ||
        call.fallbackRead ||
        call.connectedAt === null ||
        entry.history.length !== call.definition.lines.length ||
        JSON.stringify(entry.history) !== JSON.stringify(call.history) ||
        (entry.kind === 'delivered') !== (entry.direction === 'outgoing'))
    )
      throw Error('Unproved saved phone delivery.');
    if (
      ['delivered', 'answered'].includes(entry.kind) &&
      (Math.abs(entry.at - call.finishedAt) > EPS ||
        (call.definition.window &&
          entry.at + EPS >= call.definition.window.startedAt + call.definition.window.seconds))
    )
      throw Error('Unproved saved timely phone delivery.');
    if (
      entry.kind === 'fallback-read' &&
      (!call.definition.fallback ||
        call.phase !== 'ended' ||
        !call.fallbackRead ||
        call.dialogueKind !== 'message' ||
        call.fallbackAt === null ||
        entry.history.length !== call.definition.fallback.lines.length ||
        JSON.stringify(entry.history) !== JSON.stringify(call.history))
    )
      throw Error('Unproved saved fallback reading.');
  }
  for (const [key, callId] of Object.entries(m.ownership))
    if (!lookup(m.calls, callId) || ownershipKey(lookup(m.calls, callId).definition) !== key)
      throw Error('Invalid saved phone ownership index.');
  for (const [receipt, entry] of Object.entries(m.contactReceipts))
    if (
      !id(receipt) ||
      entry.id !== receipt ||
      !own(m.contacts, entry.contact) ||
      !validOwner(entry.owner) ||
      !object(entry.requirement) ||
      entry.signature !==
        hash([
          { id: entry.contact, name: m.contacts[entry.contact].name },
          entry.owner,
          entry.requirement,
        ]) ||
      !finite(entry.at) ||
      entry.at < 0 ||
      entry.at > state.time + EPS
    )
      throw Error('Invalid saved contact ownership receipt.');
  for (const contact of Object.values(m.contacts))
    if (
      !contact.receipt.startsWith('initial:') &&
      m.contactReceipts[contact.receipt]?.contact !== contact.id
    )
      throw Error('Saved contact lacks its actual unlock receipt.');
  return true;
}
export function serializePhoneCalls(state) {
  validatePhoneCalls(state);
  return JSON.stringify({
    format: 'lowlight-phone-calls',
    version: VERSION,
    phoneCalls: state.phoneCalls,
  });
}
export function restorePhoneCalls(state, serialized) {
  const value = typeof serialized === 'string' ? JSON.parse(serialized) : copy(serialized);
  if (value.format !== 'lowlight-phone-calls' || value.version !== VERSION)
    throw Error('Unsupported phone save.');
  const candidate = { time: now(state), phoneCalls: copy(value.phoneCalls) };
  validatePhoneCalls(candidate);
  for (const call of Object.values(candidate.phoneCalls.calls))
    call.presentation.visible = call.presentation.presented = false;
  state.phoneCalls = candidate.phoneCalls;
  return state.phoneCalls;
}
