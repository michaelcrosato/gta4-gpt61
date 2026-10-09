import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initializePhoneCalls,
  registerPhoneCall,
  actPhoneCalls,
  presentPhoneLine,
  setPhonePresentationVisibility,
  updatePhoneCalls,
  phoneCallView,
  phoneOutcome,
  phoneAcknowledgments,
  addPhoneContact,
  collectorWarningDefinition,
  tessContactRequirement,
  validatePhoneCalls,
  serializePhoneCalls,
  restorePhoneCalls,
} from '../src/phone-calls.js';
import { FIRST_ARC_MISSIONS } from '../src/campaign/first-arc.js';

// Parent observation callbacks below are explicit synthetic contract fixtures.
// Phone behavior is real deterministic code; no UI/actor/mission playthrough or
// source-completion claim is made. The exact authored warning dialogue/rule is
// read from the immutable0.5 reference copy rather than invented test missions.
const copy = (v) => JSON.parse(JSON.stringify(v));
const FELIX = 'LL-CHAR-002',
  NADIA = 'LL-CHAR-008',
  TESS = 'LL-CHAR-025';
const warningOwner = {
  missionId: 'LL-ST-002',
  stageId: 'warn',
  attempt: 1,
  receipt: 'director:002:warn:1',
};
function fixture() {
  const state = {
    time: 0,
    world: {
      owner: 'active',
      identifiedAt: 0,
      answered: true,
      alive: true,
      doorReached: false,
      trigger: true,
      delivery: true,
      message: true,
      dropoffs: [],
      money: 240,
      actorMoves: 0,
    },
  };
  initializePhoneCalls(state, {
    contacts: [
      { id: FELIX, name: 'Felix Voss' },
      { id: NADIA, name: 'Nadia Sol' },
    ],
  });
  const context = {
    ownerStatus: (s) => s.world.owner,
    observe(s, rule) {
      switch (rule.type) {
        case 'phone-objective-active':
        case 'incoming-event':
          return s.world.trigger;
        case 'collector-identification':
          return s.world.identifiedAt === rule.at;
        case 'phone-contact-answered':
        case 'contact-available':
          return s.world.answered && s.world.alive;
        case 'collector-warning-permitted':
          return s.world.alive && !s.world.doorReached && s.world.delivery;
        case 'phone-delivery':
          return s.world.delivery;
        case 'message-ready':
          return s.world.message;
        case 'dropoffs-complete':
          return (
            JSON.stringify(s.world.dropoffs) ===
            JSON.stringify(rule.order.map((actor, i) => ({ actor, scene: rule.scenes[i] })))
          );
        default:
          return { unmet: 'fixture-observation-not-bound' };
      }
    },
    applyWorldAction() {
      throw Error('Phone cannot move actors, pay rewards or complete missions.');
    },
  };
  return { state, context };
}
function warning(f, extra = {}) {
  const definition = {
    ...collectorWarningDefinition(FIRST_ARC_MISSIONS[1], warningOwner, {
      id: 'warning:1',
      identifiedAt: 0,
    }),
    ...extra,
  };
  assert.equal(registerPhoneCall(f.state, definition, f.context).ok, true);
  return definition;
}
function incoming(id = 'incoming:1', extra = {}) {
  return {
    id,
    owner: {
      missionId: 'LL-ST-099',
      stageId: 'fixture-call',
      attempt: 1,
      receipt: `fixture:${id}`,
    },
    contact: NADIA,
    topic: 'fixture-message',
    direction: 'incoming',
    lines: [
      { speaker: 'Nadia', text: 'The room is ready.' },
      { speaker: 'Mara', text: 'I will check in after this fare.' },
    ],
    ringSeconds: 4,
    trigger: { type: 'incoming-event' },
    connection: { type: 'contact-available' },
    delivery: { type: 'phone-delivery' },
    fallback: {
      lines: [{ speaker: 'Nadia', text: 'I left the room details in this message.' }],
      ready: { type: 'message-ready' },
    },
    ...extra,
  };
}
function advance(f, seconds, { visible = false, paused = false } = {}) {
  for (let rest = seconds; rest > 1e-8; rest -= 0.1) {
    const dt = Math.min(0.1, rest);
    if (visible) {
      const line = phoneCallView(f.state).line;
      if (line) presentPhoneLine(f.state, line.callId, line.index);
    }
    if (!paused) f.state.time += dt;
    updatePhoneCalls(f.state, dt, { ...f.context, paused });
  }
}
function dial(f, id = 'warning:1') {
  assert.equal(actPhoneCalls(f.state, { type: 'dial', id, contact: FELIX }, f.context).ok, true);
  advance(f, 0.1);
}
function acknowledge(f) {
  const view = phoneCallView(f.state);
  assert(view.line);
  assert.equal(presentPhoneLine(f.state, view.id, view.line.index), true);
  return actPhoneCalls(
    f.state,
    { type: 'acknowledge', id: view.id, index: view.line.index },
    f.context,
  );
}
function finishConversation(f) {
  let result;
  while (phoneCallView(f.state).line) result = acknowledge(f);
  return result;
}
const query = (definition, kind = 'delivered') => ({
  owner: definition.owner,
  direction: definition.direction,
  contact: definition.contact,
  topic: definition.topic,
  kind,
});

test('LL-ST-002 uses all exact authored warning lines/contact/topic and the observed18-second identification window', () => {
  const f = fixture(),
    definition = warning(f),
    stage = FIRST_ARC_MISSIONS[1].stages.find((s) => s.id === 'warn');
  assert.equal(definition.window.seconds, 18);
  assert.equal(definition.contact, FELIX);
  assert.equal(definition.topic, 'collector-warning');
  assert.deepEqual(
    f.state.phoneCalls.calls[definition.id].definition.lines.map(({ speaker, text }) => ({
      speaker,
      text,
    })),
    stage.dialogue.map(({ speaker, text }) => ({ speaker, text })),
  );
  assert.throws(
    () =>
      collectorWarningDefinition(FIRST_ARC_MISSIONS[2], warningOwner, {
        id: 'wrong',
        identifiedAt: 0,
      }),
    /Unbound/,
  );
});

test('unknown or unobserved physical triggers cannot register a phone objective', () => {
  const f = fixture(),
    definition = collectorWarningDefinition(FIRST_ARC_MISSIONS[1], warningOwner, {
      id: 'warning:1',
      identifiedAt: 0,
    });
  f.state.world.trigger = false;
  assert.equal(registerPhoneCall(f.state, definition, f.context).ok, false);
  f.state.world.trigger = true;
  assert.deepEqual(registerPhoneCall(f.state, definition, { ownerStatus: () => 'active' }).unmet, [
    'phone-world-observer-missing',
  ]);
  assert.equal(Object.keys(f.state.phoneCalls.calls).length, 0);
});

test('wrong contacts keep contact selection available and never reset the live warning window', () => {
  const f = fixture(),
    definition = warning(f);
  advance(f, 12);
  for (let i = 0; i < 8; i++)
    assert.deepEqual(
      actPhoneCalls(f.state, { type: 'dial', id: definition.id, contact: NADIA }, f.context),
      { ok: false, reason: 'wrong-contact', keepOpen: true },
    );
  assert.equal(f.state.phoneCalls.calls[definition.id].phase, 'ready');
  assert.equal(f.state.phoneCalls.calls[definition.id].definition.window.startedAt, 0);
  advance(f, 6);
  assert.equal(f.state.phoneCalls.calls[definition.id].phase, 'missed');
  assert.equal(phoneOutcome(f.state, query(definition)), null);
  assert.equal(phoneOutcome(f.state, query(definition, 'deadline-missed')).kind, 'deadline-missed');
});

test('outgoing ringing needs a real contact-answer observation, not a timer or dial-menu success', () => {
  const f = fixture(),
    definition = warning(f);
  f.state.world.answered = false;
  dial(f);
  advance(f, 3);
  assert.equal(phoneCallView(f.state).phase, 'ringing');
  assert.equal(phoneOutcome(f.state, query(definition)), null);
  f.state.world.answered = true;
  advance(f, 0.1);
  assert.equal(phoneCallView(f.state).phase, 'connected');
  assert.equal(phoneOutcome(f.state, query(definition)), null);
});

test('only actual presented acknowledgments of every warning line create one communication receipt', () => {
  const f = fixture(),
    definition = warning(f);
  dial(f);
  assert.equal(
    actPhoneCalls(f.state, { type: 'acknowledge', id: definition.id, index: 0 }, f.context).ok,
    false,
  );
  assert.equal(presentPhoneLine(f.state, definition.id, 1), false);
  acknowledge(f);
  assert.equal(phoneOutcome(f.state, query(definition)), null);
  finishConversation(f);
  const receipt = phoneOutcome(f.state, query(definition));
  assert.equal(receipt.history.length, 3);
  assert.deepEqual(
    receipt.history.map((h) => h.index),
    [0, 1, 2],
  );
  assert.equal(f.state.world.money, 240);
  assert.equal(f.state.world.actorMoves, 0);
  assert.equal(Object.keys(f.state.phoneCalls.outcomes).length, 1);
  assert.equal(
    actPhoneCalls(f.state, { type: 'acknowledge', id: definition.id, index: 2 }, f.context).ok,
    false,
  );
  assert.deepEqual(phoneOutcome(f.state, query(definition)), receipt);
  assert.equal(validatePhoneCalls(f.state), true);
});

test('fully read dialogue cannot defeat a real collector-at-door or unavailable-delivery condition', () => {
  const f = fixture(),
    definition = warning(f);
  dial(f);
  f.state.world.doorReached = true;
  const result = finishConversation(f);
  assert.equal(result.ok, false);
  assert.equal(phoneCallView(f.state).waitingForDelivery, true);
  assert.equal(phoneOutcome(f.state, query(definition)), null);
  advance(f, 18);
  assert.equal(phoneOutcome(f.state, query(definition)), null);
  assert(phoneOutcome(f.state, query(definition, 'deadline-missed')));
});

test('a pending phone delivery may commit only when its explicit live-world gate becomes true', () => {
  const f = fixture(),
    definition = warning(f);
  dial(f);
  f.state.world.delivery = false;
  finishConversation(f);
  assert.equal(phoneOutcome(f.state, query(definition)), null);
  f.state.world.delivery = true;
  advance(f, 0.1);
  assert(phoneOutcome(f.state, query(definition)));
  const count = Object.keys(f.state.phoneCalls.outcomes).length;
  advance(f, 1);
  assert.equal(Object.keys(f.state.phoneCalls.outcomes).length, count);
});

test('a real final-line acknowledgment remains explicit even while physical delivery is pending', () => {
  const f = fixture(),
    definition = warning(f);
  dial(f);
  f.state.world.delivery = false;
  const result = finishConversation(f);
  assert.equal(result.ok, false);
  assert.equal(result.acknowledged, true);
  assert.equal(result.acknowledgment.index, 2);
  assert.equal(result.acknowledgment.kind, 'conversation');
  assert.equal(result.acknowledgment.text, definition.lines[2].text);
  const receipts = phoneAcknowledgments(f.state, definition.id);
  const saved = serializePhoneCalls(f.state),
    g = fixture();
  g.state.time = f.state.time;
  restorePhoneCalls(g.state, saved);
  assert.deepEqual(phoneAcknowledgments(g.state, definition.id), receipts);
  assert.equal(phoneOutcome(g.state, query(definition)), null);
});

test('the exact18-second boundary expires before a last-line acknowledgment can deliver a warning', () => {
  const f = fixture(),
    definition = warning(f);
  dial(f);
  acknowledge(f);
  acknowledge(f);
  presentPhoneLine(f.state, definition.id, 2);
  f.state.time = 18;
  const result = actPhoneCalls(
    f.state,
    { type: 'acknowledge', id: definition.id, index: 2 },
    f.context,
  );
  assert.equal(result.receipt.kind, 'deadline-missed');
  assert.equal(phoneOutcome(f.state, query(definition)), null);
});

test('incoming rings visibly and audibly, and a real answer plus presented conversation gives answered rather than outgoing-delivered', () => {
  const f = fixture(),
    definition = incoming();
  registerPhoneCall(f.state, definition, f.context);
  assert.equal(phoneCallView(f.state).audibleRing, true);
  assert.equal(phoneCallView(f.state).visualRing, true);
  assert.equal(actPhoneCalls(f.state, { type: 'answer', id: definition.id }, f.context).ok, true);
  finishConversation(f);
  assert(phoneOutcome(f.state, query(definition, 'answered')));
  assert.equal(phoneOutcome(f.state, { ...query(definition), direction: 'outgoing' }), null);
});

test('an observed unknown incoming caller rings without silently unlocking an outgoing contact', () => {
  const f = fixture(),
    definition = incoming('unknown:incoming', {
      contact: TESS,
      callerName: 'Unknown caller',
    });
  assert.equal(registerPhoneCall(f.state, definition, f.context).ok, true);
  assert.equal(phoneCallView(f.state).contact.known, false);
  assert.equal(phoneCallView(f.state).contact.name, 'Unknown caller');
  assert.equal(f.state.phoneCalls.contacts[TESS], undefined);
  actPhoneCalls(f.state, { type: 'answer', id: definition.id }, f.context);
  finishConversation(f);
  assert.equal(f.state.phoneCalls.contacts[TESS], undefined);
  assert.equal(
    registerPhoneCall(
      f.state,
      { ...definition, id: 'unknown:outgoing', direction: 'outgoing' },
      f.context,
    ).ok,
    false,
  );
  assert.equal(validatePhoneCalls(f.state), true);
});

test('missed incoming ringing persists a missed call without inventing accepted dialogue', () => {
  const f = fixture(),
    definition = incoming();
  registerPhoneCall(f.state, definition, f.context);
  advance(f, 4);
  const receipt = phoneOutcome(f.state, query(definition, 'missed'));
  assert(receipt);
  assert.deepEqual(receipt.history, []);
  assert.equal(phoneOutcome(f.state, query(definition, 'answered')), null);
  assert.equal(phoneCallView(f.state).active, false);
});

test('muting preserves visual ringing and text dialogue; it neither answers nor automatically succeeds', () => {
  const f = fixture(),
    definition = incoming();
  actPhoneCalls(f.state, { type: 'mute', muted: true });
  registerPhoneCall(f.state, definition, f.context);
  assert.equal(phoneCallView(f.state).audibleRing, false);
  assert.equal(phoneCallView(f.state).visualRing, true);
  advance(f, 1);
  assert.equal(phoneCallView(f.state).phase, 'ringing');
  actPhoneCalls(f.state, { type: 'answer', id: definition.id }, f.context);
  finishConversation(f);
  assert(
    phoneOutcome(f.state, query(definition, 'answered')).history.every(
      (line) => line.channel === 'text',
    ),
  );
});

test('muted outgoing accessibility uses the same actual conversation and original warning clock', () => {
  const f = fixture(),
    definition = warning(f);
  actPhoneCalls(f.state, { type: 'mute', muted: true });
  dial(f);
  finishConversation(f);
  assert(phoneOutcome(f.state, query(definition)).history.every((line) => line.channel === 'text'));
  assert.equal(f.state.phoneCalls.calls[definition.id].definition.window.seconds, 18);
});

test('an authored fallback can be read after a missed/finished owner but remains a distinct receipt', () => {
  const f = fixture(),
    definition = incoming('incoming:critical', {
      window: { startedAt: 0, seconds: 2, trigger: { type: 'incoming-event' } },
    });
  registerPhoneCall(f.state, definition, f.context);
  advance(f, 2);
  f.state.world.owner = 'finished';
  assert.equal(
    actPhoneCalls(f.state, { type: 'read-fallback', id: definition.id }, f.context).ok,
    true,
  );
  finishConversation(f);
  assert(phoneOutcome(f.state, query(definition, 'fallback-read')));
  assert(phoneOutcome(f.state, query(definition, 'deadline-missed')));
  assert.equal(phoneOutcome(f.state, query(definition, 'answered')), null);
  assert.equal(validatePhoneCalls(f.state), true);
});

test('fallback availability is a real parent message observation, not a mute toggle or a fabricated conversation', () => {
  const f = fixture(),
    definition = incoming();
  registerPhoneCall(f.state, definition, f.context);
  advance(f, 4);
  f.state.world.message = false;
  assert.equal(
    actPhoneCalls(f.state, { type: 'read-fallback', id: definition.id }, f.context).ok,
    false,
  );
  assert.equal(phoneOutcome(f.state, query(definition, 'fallback-read')), null);
});

test('saved fallback-read facts require actual ended message reading and matching acknowledgment history', () => {
  const f = fixture(),
    definition = incoming();
  registerPhoneCall(f.state, definition, f.context);
  actPhoneCalls(f.state, { type: 'decline', id: definition.id }, f.context);
  const forged = copy(f.state),
    old = Object.values(forged.phoneCalls.outcomes)[0];
  const receipt = `phone:${definition.id}:fallback-read`;
  forged.phoneCalls.outcomes[receipt] = {
    ...old,
    id: receipt,
    kind: 'fallback-read',
    history: [
      {
        index: 0,
        dialCount: 0,
        kind: 'message',
        at: 0,
        visibleSeconds: 0,
        channel: 'text',
        acknowledged: true,
      },
    ],
  };
  assert.throws(() => validatePhoneCalls(forged), /Unproved saved fallback|durable acknowledgment/);
});

test('partially read longer fallback survives hang-up, save and reopening without changing dialogue channels', () => {
  const f = fixture(),
    definition = incoming('long:message', {
      lines: [{ speaker: 'Nadia', text: 'Call me.' }],
      fallback: {
        lines: [1, 2, 3].map((i) => ({
          speaker: 'Nadia',
          text: `Message part ${i}.`,
        })),
        ready: { type: 'message-ready' },
      },
    });
  registerPhoneCall(f.state, definition, f.context);
  actPhoneCalls(f.state, { type: 'decline', id: definition.id }, f.context);
  actPhoneCalls(f.state, { type: 'read-fallback', id: definition.id }, f.context);
  acknowledge(f);
  acknowledge(f);
  assert.equal(actPhoneCalls(f.state, { type: 'hang-up', id: definition.id }, f.context).ok, true);
  const saved = serializePhoneCalls(f.state),
    g = fixture();
  restorePhoneCalls(g.state, saved);
  assert.equal(
    actPhoneCalls(g.state, { type: 'read-fallback', id: definition.id }, g.context).ok,
    true,
  );
  assert.equal(phoneCallView(g.state).line.index, 2);
  acknowledge(g);
  assert.equal(phoneOutcome(g.state, query(definition, 'fallback-read')).history.length, 3);
  assert.equal(validatePhoneCalls(g.state), true);
});

test('busy incoming calls queue in saved order and never own two simultaneous conversations', () => {
  const f = fixture(),
    first = incoming('incoming:one'),
    second = incoming('incoming:two');
  registerPhoneCall(f.state, first, f.context);
  registerPhoneCall(f.state, second, f.context);
  assert.equal(f.state.phoneCalls.calls[second.id].phase, 'queued');
  assert.equal(actPhoneCalls(f.state, { type: 'answer', id: second.id }, f.context).ok, false);
  actPhoneCalls(f.state, { type: 'decline', id: first.id }, f.context);
  assert.equal(phoneCallView(f.state).id, second.id);
  assert.equal(phoneCallView(f.state).phase, 'ringing');
  assert.equal(validatePhoneCalls(f.state), true);
});

test('a queued critical call still uses its external event deadline, not a reset when the phone becomes free', () => {
  const f = fixture(),
    first = incoming('incoming:busy', { ringSeconds: 30 }),
    second = incoming('incoming:deadline', {
      window: { startedAt: 0, seconds: 3, trigger: { type: 'incoming-event' } },
    });
  registerPhoneCall(f.state, first, f.context);
  registerPhoneCall(f.state, second, f.context);
  advance(f, 3);
  assert(phoneOutcome(f.state, query(second, 'deadline-missed')));
  assert.equal(phoneCallView(f.state).id, first.id);
});

test('JSON continuation preserves a ring without replaying its event or extending the clock', () => {
  const f = fixture(),
    definition = incoming();
  registerPhoneCall(f.state, definition, f.context);
  advance(f, 2);
  const saved = serializePhoneCalls(f.state),
    g = fixture();
  g.state.time = f.state.time;
  restorePhoneCalls(g.state, saved);
  assert.equal(registerPhoneCall(g.state, definition, g.context).replayed, true);
  assert.equal(g.state.phoneCalls.calls[definition.id].ringingAt, 0);
  advance(g, 2);
  assert(phoneOutcome(g.state, query(definition, 'missed')));
});

test('JSON continuation retains acknowledged lines but requires a fresh actual presentation', () => {
  const f = fixture(),
    definition = warning(f);
  dial(f);
  acknowledge(f);
  presentPhoneLine(f.state, definition.id, 1);
  advance(f, 0.5);
  const saved = serializePhoneCalls(f.state),
    g = fixture();
  g.state.time = f.state.time;
  restorePhoneCalls(g.state, saved);
  assert.equal(g.state.phoneCalls.calls[definition.id].index, 1);
  assert.equal(
    actPhoneCalls(g.state, { type: 'acknowledge', id: definition.id, index: 1 }, g.context).ok,
    false,
  );
  finishConversation(g);
  assert.equal(phoneOutcome(g.state, query(definition)).history.length, 3);
  assert.equal(validatePhoneCalls(g.state), true);
});

test('automatic dialogue advances only while actually presented and the real simulation clock advances', () => {
  const f = fixture(),
    definition = incoming('auto:1', { auto: true });
  registerPhoneCall(f.state, definition, f.context);
  actPhoneCalls(f.state, { type: 'answer', id: definition.id }, f.context);
  for (let i = 0; i < 100; i++) updatePhoneCalls(f.state, 0.5, f.context);
  assert.equal(f.state.phoneCalls.calls[definition.id].index, 0);
  advance(f, 5);
  assert.equal(f.state.phoneCalls.calls[definition.id].index, 0);
  advance(f, 4, { visible: true });
  assert(f.state.phoneCalls.calls[definition.id].index >= 1);
  setPhonePresentationVisibility(f.state, false);
  const index = f.state.phoneCalls.calls[definition.id].index;
  advance(f, 5);
  assert.equal(f.state.phoneCalls.calls[definition.id].index, index);
});

test('global pause freezes ringing and warning time; hidden contact menus do not pause world deadlines', () => {
  const f = fixture(),
    definition = warning(f);
  advance(f, 30, { paused: true });
  assert.equal(f.state.time, 0);
  assert.equal(f.state.phoneCalls.calls[definition.id].phase, 'ready');
  advance(f, 18);
  assert(phoneOutcome(f.state, query(definition, 'deadline-missed')));
});

test('actual owner failure cancels a live call and prevents a late receipt from another attempt', () => {
  const f = fixture(),
    definition = warning(f);
  dial(f);
  acknowledge(f);
  f.state.world.owner = 'failed';
  advance(f, 0.1);
  assert(phoneOutcome(f.state, query(definition, 'owner-ended')));
  assert.equal(phoneOutcome(f.state, query(definition)), null);
  assert.equal(
    actPhoneCalls(f.state, { type: 'acknowledge', id: definition.id, index: 1 }, f.context).ok,
    false,
  );
});

test('LL-ST-003 Tess unlock requires the exact actual ordered dropoffs and is idempotent', () => {
  const f = fixture(),
    owner = {
      missionId: 'LL-ST-003',
      stageId: 'home',
      attempt: 1,
      receipt: 'director:003:home:1',
    },
    rule = tessContactRequirement(FIRST_ARC_MISSIONS[2]),
    contact = { id: TESS, name: 'Tess Vale' };
  assert.deepEqual(rule.order, [TESS, NADIA]);
  assert.equal(
    addPhoneContact(f.state, contact, owner, rule, 'contact:tess:1', f.context).ok,
    false,
  );
  f.state.world.dropoffs = [
    { actor: NADIA, scene: 'dispatch' },
    { actor: TESS, scene: 'tess-flat' },
  ];
  assert.equal(
    addPhoneContact(f.state, contact, owner, rule, 'contact:tess:1', f.context).ok,
    false,
  );
  f.state.world.dropoffs = [
    { actor: TESS, scene: 'tess-flat' },
    { actor: NADIA, scene: 'dispatch' },
  ];
  assert.equal(
    addPhoneContact(f.state, contact, owner, rule, 'contact:tess:1', f.context).ok,
    true,
  );
  assert.equal(
    addPhoneContact(f.state, contact, owner, rule, 'contact:tess:1', f.context).replayed,
    true,
  );
  assert.equal(Object.keys(f.state.phoneCalls.contactReceipts).length, 1);
  assert.equal(f.state.world.actorMoves, 0);
  assert.equal(validatePhoneCalls(f.state), true);
});

test('definition/receipt conflicts cannot substitute new dialogue, contact or owner in a saved call', () => {
  const f = fixture(),
    definition = warning(f);
  assert.equal(registerPhoneCall(f.state, { ...definition, topic: 'other' }, f.context).ok, false);
  assert.equal(registerPhoneCall(f.state, { ...definition, id: 'second-id' }, f.context).ok, false);
  assert.equal(Object.keys(f.state.phoneCalls.calls).length, 1);
});

test('a new observed contact receipt cannot silently rename an existing stable contact or corrupt its save', () => {
  const f = fixture(),
    before = JSON.stringify(f.state);
  const result = addPhoneContact(
    f.state,
    { id: FELIX, name: 'Different identity' },
    warningOwner,
    { type: 'incoming-event' },
    'contact:rename',
    f.context,
  );
  assert.equal(result.reason, 'phone-contact-identity-conflict');
  assert.equal(JSON.stringify(f.state), before);
  assert.equal(validatePhoneCalls(f.state), true);
});

test('contact unlock rejects toJSON/accessor payloads before hashing, observing or executing caller code', () => {
  const f = fixture();
  let observations = 0;
  const context = {
    ...f.context,
    observe() {
      observations++;
      return true;
    },
  };
  const requirement = {
    type: 'incoming-event',
    toJSON() {
      f.state.world.money = 0;
      return {};
    },
  };
  assert.throws(
    () =>
      addPhoneContact(
        f.state,
        { id: TESS, name: 'Tess Vale' },
        warningOwner,
        requirement,
        'contact:unsafe',
        context,
      ),
    /Unsafe/,
  );
  const contact = { id: TESS };
  Object.defineProperty(contact, 'name', {
    enumerable: true,
    get() {
      f.state.world.money = 0;
      return 'Tess Vale';
    },
  });
  assert.throws(
    () =>
      addPhoneContact(
        f.state,
        contact,
        warningOwner,
        { type: 'incoming-event' },
        'contact:unsafe2',
        context,
      ),
    /Unsafe/,
  );
  assert.equal(f.state.world.money, 240);
  assert.equal(observations, 0);
  assert.equal(f.state.phoneCalls.contacts[TESS], undefined);
});

test('serial validation rejects cursor, owner, phase, forged receipt and callback-unsafe data', () => {
  const f = fixture(),
    definition = warning(f);
  dial(f);
  finishConversation(f);
  const original = copy(f.state);
  for (const mutate of [
    (s) => (s.phoneCalls.calls[definition.id].definition.owner.attempt = 2),
    (s) => (s.phoneCalls.calls[definition.id].phase = 'won-mission'),
    (s) => (s.phoneCalls.calls[definition.id].index = 0),
    (s) => (s.phoneCalls.calls[definition.id].connectedAt = null),
    (s) => (s.phoneCalls.calls[definition.id].history[0].index = 7),
    (s) => (Object.values(s.phoneCalls.outcomes)[0].direction = 'incoming'),
    (s) => (s.phoneCalls.activeId = definition.id),
  ]) {
    const s = copy(original);
    mutate(s);
    assert.throws(() => validatePhoneCalls(s));
  }
  const accessor = copy(original);
  Object.defineProperty(accessor.phoneCalls, 'bad', {
    enumerable: true,
    get() {
      throw Error('Getter executed');
    },
  });
  assert.throws(() => validatePhoneCalls(accessor), /Unsafe/);
  const cyclic = copy(original);
  cyclic.phoneCalls.bad = cyclic.phoneCalls;
  assert.throws(() => validatePhoneCalls(cyclic), /acyclic/);
});

test('identical observed inputs produce identical saved phone state without randomness or wall-clock dependence', () => {
  const f = fixture(),
    g = fixture();
  for (const h of [f, g]) {
    warning(h);
    dial(h);
    acknowledge(h);
    advance(h, 1);
    finishConversation(h);
  }
  assert.equal(serializePhoneCalls(f.state), serializePhoneCalls(g.state));
});

test('string null identifiers never alias the inactive phone sentinel or inherited dictionary properties', () => {
  const f = fixture(),
    definition = warning(f, { id: 'null' });
  assert.equal(phoneCallView(f.state).active, false);
  assert.deepEqual(
    actPhoneCalls(f.state, { type: 'dial', id: 'toString', contact: FELIX }, f.context),
    { ok: false, reason: 'phone-call-not-found' },
  );
  assert.equal(
    actPhoneCalls(f.state, { type: 'dial', id: definition.id, contact: FELIX }, f.context).ok,
    true,
  );
  assert.equal(phoneCallView(f.state).id, 'null');
  assert.equal(validatePhoneCalls(f.state), true);
});

test('unknown incoming prototype-like contact names stay unknown without inherited-object lookup', () => {
  const f = fixture(),
    definition = incoming('prototype:caller', {
      contact: 'toString',
      callerName: 'Unknown caller',
    });
  assert.equal(registerPhoneCall(f.state, definition, f.context).ok, true);
  assert.equal(phoneCallView(f.state).contact.known, false);
  assert.equal(phoneCallView(f.state).contact.name, 'Unknown caller');
  assert.equal(validatePhoneCalls(f.state), true);
});

test('all valid call identifiers remain JSON-safe and cannot create an unsaveable toJSON dictionary key', () => {
  const f = fixture(),
    before = JSON.stringify(f.state);
  const definition = collectorWarningDefinition(FIRST_ARC_MISSIONS[1], warningOwner, {
    id: 'toJSON',
    identifiedAt: 0,
  });
  assert.throws(() => registerPhoneCall(f.state, definition, f.context), /identity/);
  assert.equal(JSON.stringify(f.state), before);
  assert.equal(validatePhoneCalls(f.state), true);
});

test('saved successful warnings cannot be rewritten to arrive after their original physical deadline', () => {
  const f = fixture(),
    definition = warning(f);
  dial(f);
  finishConversation(f);
  const forged = copy(f.state);
  forged.time = 30;
  forged.phoneCalls.calls[definition.id].finishedAt = 30;
  Object.values(forged.phoneCalls.outcomes)[0].at = 30;
  assert.throws(() => validatePhoneCalls(forged), /timely phone delivery/);
});

test('an explicit outgoing redial preserves the original warning deadline and separates stale acknowledgments', () => {
  const f = fixture(),
    definition = warning(f);
  dial(f);
  acknowledge(f);
  const oldCount = f.state.phoneCalls.calls[definition.id].dialCount;
  actPhoneCalls(f.state, { type: 'hang-up', id: definition.id }, f.context);
  advance(f, 2);
  assert.equal(
    actPhoneCalls(f.state, { type: 'dial', id: definition.id, contact: FELIX }, f.context).ok,
    true,
  );
  advance(f, 0.1);
  assert.equal(f.state.phoneCalls.calls[definition.id].definition.window.startedAt, 0);
  assert.equal(f.state.phoneCalls.calls[definition.id].dialCount, oldCount + 1);
  assert.equal(presentPhoneLine(f.state, definition.id, 0, oldCount), false);
  assert.equal(
    actPhoneCalls(
      f.state,
      { type: 'acknowledge', id: definition.id, index: 0, dialCount: oldCount },
      f.context,
    ).ok,
    false,
  );
  finishConversation(f);
  assert(phoneOutcome(f.state, query(definition)));
  assert.equal(validatePhoneCalls(f.state), true);
});

test('redial after a missed warning cannot restart its18-second physical window', () => {
  const f = fixture(),
    definition = warning(f);
  dial(f);
  actPhoneCalls(f.state, { type: 'hang-up', id: definition.id }, f.context);
  advance(f, 18);
  assert.equal(
    actPhoneCalls(f.state, { type: 'dial', id: definition.id, contact: FELIX }, f.context).reason,
    'phone-warning-window-expired',
  );
  assert.equal(phoneOutcome(f.state, query(definition)), null);
});

test('unsafe unknown observation payloads never enter saved call state and partial dialogue needs a connection', () => {
  const f = fixture(),
    definition = warning(f);
  dial(f);
  acknowledge(f);
  actPhoneCalls(f.state, { type: 'hang-up', id: definition.id }, f.context);
  const forged = copy(f.state);
  forged.phoneCalls.calls[definition.id].connectedAt = null;
  assert.throws(() => validatePhoneCalls(forged), /actual connection/);
  const g = fixture();
  warning(g);
  g.context.observe = () => ({ unmet: () => true });
  assert.equal(
    actPhoneCalls(g.state, { type: 'dial', id: definition.id, contact: FELIX }, g.context).ok,
    true,
  );
  advance(g, 0.1);
  assert.deepEqual(g.state.phoneCalls.calls[definition.id].blocked, [
    'phone-world-observation-unknown',
  ]);
  assert.equal(validatePhoneCalls(g.state), true);
});
test('partial acknowledgments on repeated cancelled dials remain durable through later redial and Continue', () => {
  const f = fixture(),
    d = warning(f);
  const ids = [];
  for (let n = 1; n <= 3; n++) {
    dial(f);
    const result = acknowledge(f);
    ids.push(result.acknowledgment.id);
    assert.equal(result.acknowledgment.dialCount, n);
    actPhoneCalls(f.state, { type: 'hang-up', id: d.id }, f.context);
  }
  dial(f);
  assert.equal(f.state.phoneCalls.calls[d.id].history.length, 0);
  assert.equal(phoneAcknowledgments(f.state, d.id).length, 3);
  assert.deepEqual(
    phoneAcknowledgments(f.state, d.id).map((a) => a.id),
    ids,
  );
  assert.equal(validatePhoneCalls(f.state), true);
  const restored = { time: f.state.time };
  restorePhoneCalls(restored, serializePhoneCalls(f.state));
  assert.deepEqual(
    phoneAcknowledgments(restored, d.id).map((a) => a.id),
    ids,
  );
  assert.equal(restored.phoneCalls.calls[d.id].dialCount, 4);
});
test('durable receipts preserve separate conversation and fallback channels across repeated dialing', () => {
  const f = fixture();
  const d = warning(f, {
    fallback: {
      lines: [
        { speaker: 'Felix', text: 'I will wait by the counter.' },
        { speaker: 'Mara', text: 'Keep the engine running.' },
      ],
      ready: { type: 'message-ready' },
    },
  });
  dial(f);
  acknowledge(f);
  actPhoneCalls(f.state, { type: 'hang-up', id: d.id }, f.context);
  actPhoneCalls(f.state, { type: 'read-fallback', id: d.id }, f.context);
  acknowledge(f);
  actPhoneCalls(f.state, { type: 'hang-up', id: d.id }, f.context);
  dial(f);
  const receipts = phoneAcknowledgments(f.state, d.id);
  assert.deepEqual(
    receipts.map((r) => [r.kind, r.dialCount, r.text]),
    [
      ['conversation', 1, d.lines[0].text],
      ['message', 1, d.fallback.lines[0].text],
    ],
  );
  assert.equal(validatePhoneCalls(f.state), true);
});
test('automatic acknowledgment requires actual presented duration; the flag cannot skip an unread line', () => {
  const f = fixture(),
    d = warning(f);
  dial(f);
  const view = phoneCallView(f.state);
  presentPhoneLine(f.state, view.id, 0);
  assert.equal(
    actPhoneCalls(f.state, { type: 'acknowledge', id: d.id, index: 0, automatic: true }, f.context)
      .reason,
    'phone-line-duration-not-observed',
  );
  assert.equal(phoneAcknowledgments(f.state, d.id).length, 0);
  assert.equal(acknowledge(f).ok, true);
});
test('saved current and outcome histories must remain anchored to the durable acknowledgment ledger', () => {
  const f = fixture(),
    d = warning(f);
  dial(f);
  acknowledge(f);
  actPhoneCalls(f.state, { type: 'hang-up', id: d.id }, f.context);
  const removed = copy(f.state);
  removed.phoneCalls.calls[d.id].acknowledgments = [];
  assert.throws(() => validatePhoneCalls(removed), /durable acknowledgment/);
  dial(f);
  const forged = copy(f.state);
  forged.phoneCalls.calls[d.id].acknowledgments[0].startedAt = f.state.time + 1;
  assert.throws(() => validatePhoneCalls(forged), /durable phone acknowledgment/);
  const wrongDial = copy(f.state);
  wrongDial.phoneCalls.calls[d.id].acknowledgments[0].dialCount = 99;
  assert.throws(() => validatePhoneCalls(wrongDial), /durable phone acknowledgment/);
});
