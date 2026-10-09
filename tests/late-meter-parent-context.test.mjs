/** Parent contract tests with declared actor/vehicle poses and synthetic director ownership.
 * Native terrain/companions/phone receipts are real. These are not a mission playthrough.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, VEHICLE_SPECS } from '../src/simulation.js';
import { WORLD } from '../src/world.js';
import { createTerrain } from '../src/terrain.js';
import { createSceneContext } from '../src/scene-context.js';
import { createCampaignPhysicalContext } from '../src/campaign/physical-context.js';
import { findLocalFootPath } from '../src/local-navigation.js';
import { INTERIOR_LAYOUTS, interiorActors } from '../src/interiors.js';
import * as companions from '../src/companions.js';
import * as phone from '../src/phone-calls.js';
import { FIRST_ARC_MISSIONS } from '../src/campaign/first-arc.js';
import { LATE_METER_CLIPBOARD } from '../src/campaign/late-meter-scenes.js';
import {
  initializeLateMeterRuntime,
  validateLateMeterRuntime,
  observeLateMeterDamage,
  observeLateMeterAttack,
  actLateMeter,
} from '../src/campaign/late-meter-runtime.js';
import {
  createLateMeterParentContext,
  validateLateMeterParentState,
} from '../src/campaign/late-meter-parent-context.js';

const copy = (v) => JSON.parse(JSON.stringify(v));
const BASE = createSimulation({ campaign: false });
const terrain = createTerrain(WORLD),
  scenes = createSceneContext(WORLD, terrain);
const authored = copy(FIRST_ARC_MISSIONS[1]);
const historical = copy(authored);
historical.failures = historical.failures.filter(
  (entry) =>
    !['protected-target-harmed', 'lookout-timeout', 'collector-door-arrived'].includes(
      entry.condition.type,
    ),
);
const I = {
  mission: 'LL-ST-002',
  felix: 'LL-CHAR-002',
  yara: 'LL-ARC-YARA',
  reeve: 'LL-ARC-REEVE',
  watcher: 'holt-collector-watch',
  pursuer: 'holt-tow-sedan',
};
function fixture({ stage = 'warn', migrated = true, ready = true, collector = true } = {}) {
  const s = copy(BASE);
  s.time = 0;
  s.vehicles = [];
  s.wanted.level = 0;
  s.mission = null;
  s.interior.active = null;
  s.companions = { version: 1, time: 0, actors: [], records: [], events: [], sequence: 0 };
  s.campaignRuntime ??= {};
  s.campaignRuntime.sceneProps ??= {};
  const a = WORLD.campaignSceneBindings['impound-counter'],
    d = WORLD.campaignSceneBindings.dispatch;
  Object.assign(s.player, {
    x: 231,
    y: 393,
    z: 0,
    groundZ: 0,
    health: 100,
    sceneId: null,
    vehicleId: null,
    money: 40,
  });
  const cc = createCampaignPhysicalContext(s, {
    world: WORLD,
    terrain,
    specs: VEHICLE_SPECS,
    scenes,
    localPath: findLocalFootPath,
  });
  const car = {
    id: 'owned-taxi',
    spec: 'taxi',
    kind: 'parked',
    owned: true,
    ...a.parkingBay.pose,
    speed: 0,
    health: 120,
    occupied: false,
    sceneId: null,
  };
  s.vehicles.push(car);
  if (collector)
    s.vehicles.push({
      ...a.pursuerSpawn,
      sceneId: null,
      kind: 'parked',
      missionVehicle: true,
      z: 0,
      groundZ: 0,
      speed: 0,
      health: VEHICLE_SPECS.sedan.health,
      occupied: false,
      route: null,
      routeIndex: 0,
      blockedTime: 0,
      stolen: false,
    });
  companions.ensureNamedActor(
    s,
    { id: I.felix, castId: 'felix-voss', name: 'Felix Voss', ...a.counterTarget },
    cc,
  );
  for (const def of Object.values(a.actorSpawns)) companions.ensureNamedActor(s, copy(def), cc);
  // This is a declared pose fixture, before observations/inputs. The actual actor remains canonical.
  Object.assign(companions.getActor(s, I.reeve), { x: 347, y: 397 });
  s.phoneCalls = null;
  phone.initializePhoneCalls(s, { contacts: [{ id: I.felix, name: 'Felix Voss' }] });
  const m = initializeLateMeterRuntime(s),
    receipt = `fixture:activate:${stage}`;
  m.active = {
    missionId: I.mission,
    stageId: stage,
    attempt: 1,
    receipt,
    startedAt: 0,
    phase: 'running',
    blocked: null,
  };
  const scope = { missionId: I.mission, stageId: stage, attempt: 1, activationReceipt: receipt };
  m.activations[receipt] = { scope: copy(scope), at: 0 };
  m.run.rideId = car.id;
  m.run.startedAt = 0;
  m.run.counterTrip = {
    boardedAt: 0,
    pickupPose: { x: d.stop.x, y: d.stop.y, z: 0, sceneId: null },
    distance: 600,
    lastPose: null,
  };
  m.run.counterDelivered = {
    id: 'fixture:counter',
    at: 0,
    scope: { ...scope, stageId: 'counter' },
    actorId: I.felix,
    vehicleId: car.id,
    vehiclePose: { x: car.x, y: car.y, z: 0, sceneId: null },
    pose: { ...a.counterTarget },
    trip: copy(m.run.counterTrip),
  };
  const warnReceipt = stage === 'warn' ? receipt : 'fixture:activate:warn';
  const owner = { missionId: I.mission, stageId: 'warn', attempt: 1, receipt: warnReceipt };
  m.run.recognition = {
    id: 'fixture:recognition',
    actorId: I.reeve,
    at: 0,
    clues: ['grey tow jacket', 'co-op repossession clipboard'],
    explicitInput: true,
    cameraVisible: true,
    lineOfSight: true,
    observerPose: { x: s.player.x, y: s.player.y, z: 0, sceneId: null },
    actorPose: { x: 347, y: 397, z: 0, sceneId: null },
    range: 180,
    inputReceipt: 'fixture:recognize',
    scope: { ...scope, stageId: 'lookout' },
  };
  m.run.lookoutExchange = {
    id: 'fixture:lookout-exchange',
    at: 0,
    lineCount: 2,
    scope: { ...scope, stageId: 'lookout' },
  };
  m.run.approachStartedAt = 0;
  m.run.warning.owner = owner;
  m.run.warning.callId = 'late-meter:warning:1';
  s.campaign = {
    contentId: 'fixture-pack',
    contentFingerprint: 'fixture-fingerprint',
    receiptNamespace: 'fixture-original',
    active: {
      missionId: I.mission,
      stageId: stage,
      attempt: 1,
      phase: 'running',
      dialogue: {
        kind: 'stage',
        lines: copy(authored.stages.find((e) => e.id === stage).dialogue),
        index: 0,
      },
      checkpoints: [{ id: 'start' }],
    },
    suspended: [],
    completed: { 'LL-ST-001': { fixture: true } },
    attempts: { [I.mission]: 1 },
    receipts: {
      [receipt]: { kind: 'stage-activation', missionId: I.mission, stageId: stage, attempt: 1 },
    },
  };
  const calls = {
    driverDrive: 0,
    release: 0,
    mirror: 0,
    choose: 0,
    recognition: 0,
    create: 0,
    notify: 0,
  };
  const e = {
    world: WORLD,
    bindings: WORLD.campaignSceneBindings,
    terrain,
    specs: VEHICLE_SPECS,
    companionContext: cc,
    authoredMission: migrated ? authored : historical,
    ready: ready
      ? { passengers: true, interior: true, phone: true, chase: true, director: true, props: true }
      : {},
    phone: {
      ready: true,
      nonmodal: true,
      contactAnswered: () => true,
      presentationObserved: () => true,
    },
    recognition: {
      ready: true,
      observe: (state, actorId, clues, inputReceipt) => {
        calls.recognition++;
        return {
          id: `recognition:${inputReceipt}`,
          at: state.time,
          explicitInput: true,
          cameraVisible: true,
          renderedClues: copy(a.observation.clueIds),
        };
      },
    },
    damage: { ready: true, observerBound: true },
    attacks: { ready: true, observerBound: true, perceived: () => false },
    drivers: {
      ready: true,
      requestDriver: (state, id, vehicleId) => companions.requestDriver(state, id, vehicleId, cc),
      observe: (state, id) => companions.driverObservation(state, id, cc),
      drive: () => {
        calls.driverDrive++;
        return { ok: true };
      },
      release: () => {
        calls.release++;
        return { ok: true };
      },
    },
    moveActor: (id, dx, dy, radius) => cc.moveBody(companions.getActor(s, id), dx, dy, radius),
    poseActor: (id, desired) => {
      const body = companions.getActor(s, id);
      body.action = desired.action;
      if (desired.angle !== null) body.angle = desired.angle;
      return { ok: true };
    },
    createVehicle: (def) => {
      calls.create++;
      return {
        ...def,
        z: def.z ?? 0,
        groundZ: def.z ?? 0,
        speed: 0,
        health: VEHICLE_SPECS[def.spec].health,
        occupied: false,
        route: null,
        routeIndex: 0,
        blockedTime: 0,
        stolen: false,
        sceneId: null,
      };
    },
    chooseCampaignOption: (state, choiceId, optionId) => {
      calls.choose++;
      const option = authored.choices
        .find((entry) => entry.id === choiceId)
        ?.options.find((entry) => entry.id === optionId);
      if (!option) return { ok: false };
      const active = state.lateMeterRuntime.active;
      const result = parent.effects.handlers['authored-effect'](
        state,
        { type: 'authored-effect', text: option.effects[0] },
        {
          id: 'fixture:choice-warning',
          directorReceipt: 'fixture:choice-warning',
          scope: {
            missionId: I.mission,
            stageId: active.stageId,
            attempt: active.attempt,
            activationReceipt: active.receipt,
          },
        },
      );
      if (result.ok) {
        state.campaign.active.choices ??= {};
        state.campaign.active.choices[choiceId] = optionId;
      }
      return result;
    },
    acknowledgeCampaignDialogue: (state, payload) => {
      calls.mirror++;
      assert.equal(state.campaign.active.dialogue.index, payload.index);
      state.campaign.active.dialogue.index++;
      return { ok: true };
    },
    notify: () => {
      calls.notify++;
    },
    snapshots: {
      capture: (state) => {
        const value = copy(state);
        delete value.campaign;
        return value;
      },
      validate: (value) =>
        Boolean(
          value.player &&
          Array.isArray(value.vehicles) &&
          value.companions &&
          value.lateMeterRuntime &&
          value.phoneCalls,
        ),
      restore: (state, value) => {
        const director = state.campaign;
        for (const key of Object.keys(state)) delete state[key];
        Object.assign(state, copy(value), { campaign: director });
        return { ok: true };
      },
    },
  };
  const parent = createLateMeterParentContext(s, e);
  if (stage === 'lookout') s.campaign.active.dialogue.index = 2;
  assert.equal(parent.syncSceneProps(s).ok, ready);
  return { s, e, parent, a, d, car, cc, calls, m, owner, scope };
}
function register(f) {
  return f.parent.phone.register(
    f.s,
    f.parent.phone.warningDefinition(authored, f.owner, {
      id: f.m.run.warning.callId,
      identifiedAt: 0,
    }),
  );
}
function connected(f) {
  assert.equal(register(f).ok, true);
  assert.equal(
    f.parent.phone.act(f.s, { type: 'dial', id: f.m.run.warning.callId, contact: I.felix }).ok,
    true,
  );
  f.s.time = 0.1;
  f.parent.phone.tick(f.s, 0.1);
  assert.equal(f.parent.phone.view(f.s).phase, 'connected');
}
function acknowledge(f) {
  const v = f.parent.phone.view(f.s);
  assert.equal(f.parent.phone.present(f.s, v.id, v.line.index, v.line.dialCount), true);
  return f.parent.phone.act(f.s, {
    type: 'acknowledge',
    id: v.id,
    index: v.line.index,
    dialCount: v.line.dialCount,
  });
}
function effectRequest(f, id = 'fixture:effect') {
  return { id, directorReceipt: 'fixture:director-effect', scope: copy(f.scope) };
}

function terminalFixture() {
  const f = fixture();
  f.parent.vehicles.ensure(f.s, {
    ...f.a.pursuerSpawn,
    id: I.pursuer,
    spec: 'sedan',
    kind: 'parked',
    missionVehicle: true,
  });
  assert.equal(register(f).ok, true);
  assert.equal(
    actLateMeter(
      f.s,
      {
        type: 'dial-warning',
        method: 'phone',
        contact: I.felix,
        inputReceipt: 'fixture:actual-dial',
      },
      f.parent,
    ).ok,
    true,
  );
  f.s.time = 0.1;
  f.parent.phone.tick(f.s, 0.1);
  for (let i = 0; i < 3; i++) assert.equal(acknowledge(f).ok, true);
  f.m.run.warning.delivered = f.parent.phone.outcome(f.s, {
    kind: 'delivered',
    direction: 'outgoing',
    contact: I.felix,
    topic: 'collector-warning',
    owner: f.owner,
  });
  // Declared final-route/physical-pose fixture only. The phone outcome above is produced
  // by actual dial/present/ack inputs, not this fixture's escape/return metadata.
  f.s.time = 12;
  const token = 'fixture:activate:return',
    scope = { missionId: I.mission, stageId: 'return', attempt: 1, activationReceipt: token };
  Object.assign(f.m.active, { stageId: 'return', receipt: token, startedAt: 11 });
  f.m.activations[token] = { scope: copy(scope), at: 11 };
  f.s.campaign.active.stageId = 'return';
  f.s.campaign.active.dialogue = {
    kind: 'stage',
    lines: copy(authored.stages.find((entry) => entry.id === 'return').dialogue),
    index: 4,
  };
  f.s.campaign.receipts[token] = {
    kind: 'stage-activation',
    missionId: I.mission,
    stageId: 'return',
    attempt: 1,
  };
  const stop = f.d.stop;
  Object.assign(f.car, {
    x: stop.x + stop.w / 2,
    y: stop.y + stop.h / 2,
    angle: stop.angle ?? 0,
    speed: 0,
  });
  const target = f.parent.bindings.dispatch.felixTarget;
  Object.assign(companions.getActor(f.s, I.felix), copy(target));
  const lastSeen = { x: 0, y: 0, z: 0, sceneId: null },
    vehiclePose = { x: f.car.x, y: f.car.y, z: 0, sceneId: null };
  Object.assign(f.m.run.pursuit, {
    started: true,
    startedAt: 0.1,
    observedOnce: true,
    driverId: I.reeve,
    lastSeen,
    lastSeenAt: 0.1,
    unseenSeconds: 10,
    escape: {
      id: 'fixture:escape',
      at: 10.1,
      scope: { ...scope, stageId: 'extract' },
      vehicleId: f.car.id,
      pursuerVehicleId: I.pursuer,
      driverId: I.reeve,
      lastSeen,
      lastSeenAt: 0.1,
      vehiclePose,
      outsideRadius: 120,
      unseenSeconds: 10,
    },
  });
  f.m.run.returned = {
    id: 'fixture:returned',
    at: 12,
    scope,
    actorId: I.felix,
    vehicleId: f.car.id,
    vehiclePose,
    pose: { x: target.x, y: target.y, z: 0, sceneId: target.sceneId },
  };
  f.scope = scope;
  assert.equal(validateLateMeterRuntime(f.s), true);
  return f;
}

test('declared terminal physical fixture still requires real phone/choice proof and rewards exactly once after evidence commit', () => {
  const f = terminalFixture(),
    before = f.s.player.money;
  const evidence = f.parent.effects.handlers['evidence-note'](
    f.s,
    { type: 'evidence-note', id: 'duplicate-impound-invoices' },
    effectRequest(f, 'fixture:evidence'),
  );
  assert.equal(evidence.ok, true);
  assert(f.s.storyInventory.evidence.includes('duplicate-impound-invoices'));
  const request = effectRequest(f, 'fixture:reward'),
    action = { type: 'campaign-reward', rewards: copy(authored.rewards) },
    reward = f.parent.effects.handlers['campaign-reward'](f.s, action, request);
  assert.equal(reward.ok, true);
  assert.equal(f.s.player.money, before + 120);
  assert.equal(f.parent.effects.handlers['campaign-reward'](f.s, action, request).replayed, true);
  assert.equal(
    f.parent.effects.handlers['campaign-reward'](f.s, action, {
      ...request,
      id: 'fixture:another-reward',
    }).ok,
    false,
  );
  assert.equal(f.s.player.money, before + 120);
  assert.equal(validateLateMeterParentState(f.s), true);
});

test('terminal reward rejects missing actual phone/choice, dead Felix, moving wrong car or unread return dialogue', () => {
  for (const alter of [
    (f) => {
      f.m.run.warning.delivered = { id: 'invented', kind: 'delivered' };
    },
    (f) => {
      f.s.campaign.active.choices = {};
    },
    (f) => {
      companions.damageCompanion(f.s, I.felix, 1000);
    },
    (f) => {
      f.car.speed = 10;
    },
    (f) => {
      f.car.spec = 'sedan';
    },
    (f) => {
      f.s.campaign.active.dialogue.index = 3;
    },
    (f) => {
      f.m.run.pursuit.escape = null;
    },
  ]) {
    const f = terminalFixture(),
      before = f.s.player.money;
    alter(f);
    assert.equal(
      f.parent.effects.handlers['campaign-reward'](
        f.s,
        { type: 'campaign-reward', rewards: copy(authored.rewards) },
        effectRequest(f, 'fixture:blocked-reward'),
      ).ok,
      false,
    );
    assert.equal(f.s.player.money, before);
  }
});

test('default missing integrations and unadopted failure data keep director availability false', () => {
  const f = fixture({ ready: false });
  assert(Object.values(f.parent.ready).every((v) => v === false));
  assert.equal(f.parent.phone.ready, false);
  assert.equal(f.parent.drivers.ready, false);
  assert.equal(f.parent.recognition.ready, false);
  const g = fixture({ migrated: false });
  assert.equal(g.parent.ready.director, false);
  assert.equal(historical.failures.length, 3);
  assert.equal(FIRST_ARC_MISSIONS[1].failures.length, 6);
});
test('ready flags cannot substitute for actual callbacks, contacts, full snapshots or event observers', () => {
  const f = fixture();
  assert.equal(f.parent.ready.director, true);
  assert.equal(f.parent.ready.phone, true);
  f.e.damage.observerBound = false;
  assert.equal(f.parent.damage.ready, false);
  assert.equal(f.parent.ready.director, false);
  f.e.damage.observerBound = true;
  f.e.attacks.perceived = null;
  assert.equal(f.parent.ready.director, false);
  f.e.phone.nonmodal = false;
  assert.equal(f.parent.ready.phone, false);
  const g = fixture();
  delete g.s.phoneCalls.contacts[I.felix];
  assert.equal(g.parent.phone.ready, false);
  g.e.snapshots.restore = null;
  assert.equal(g.parent.ready.director, false);
});
test('dispatch target comes from the actual interior layout and a canonical portal', () => {
  const f = fixture(),
    actual = INTERIOR_LAYOUTS['voss-dispatch'].actors.find((a) => a.castId === 'felix-voss');
  assert.deepEqual(f.parent.bindings.dispatch.felixTarget, {
    x: actual.x,
    y: actual.y,
    z: 0,
    sceneId: 'voss-dispatch',
    radius: 10,
  });
  assert.equal(f.parent.bindings.dispatch.portalId, 'voss-dispatch-entry');
});
test('canonical actor ensure cannot resurrect Felix or register invented cast; clipboard is registered once and remains dropped', () => {
  const f = fixture(),
    felix = companions.getActor(f.s, I.felix);
  companions.damageCompanion(f.s, I.felix, 25);
  const before = copy(felix);
  assert.equal(
    f.parent.passengers.ensureNamedActor(f.s, { id: I.felix, x: 0, y: 0, health: 100 }, f.cc),
    felix,
  );
  assert.deepEqual(felix, before);
  assert.equal(
    f.parent.passengers.ensureNamedActor(f.s, { id: 'invented', x: 0, y: 0 }, f.cc),
    null,
  );
  const prop = f.s.campaignRuntime.sceneProps[LATE_METER_CLIPBOARD.id];
  Object.assign(prop, { state: 'dropped', ownerActorId: null, x: 347, y: 397, z: 0, angle: 0 });
  assert.equal(f.parent.syncSceneProps().ok, true);
  assert.equal(prop.state, 'dropped');
  assert.equal(prop.ownerActorId, null);
});
test('actual recognition needs input, camera-rendered canonical clues, current LOS and actual matching poses', () => {
  const f = fixture({ stage: 'lookout' }),
    clues = authored.stages.find((s) => s.id === 'lookout').completion[1]?.evidence ?? [
      'grey tow jacket',
      'co-op repossession clipboard',
    ];
  const r = f.parent.recognition.observe(f.s, I.reeve, clues, 'pointer:recognize');
  assert.equal(r.ok, true);
  assert.equal(r.receipt.range, 180);
  assert.deepEqual(r.receipt.observerPose, { x: 231, y: 393, z: 0, sceneId: null });
  assert.deepEqual(r.receipt.actorPose, { x: 347, y: 397, z: 0, sceneId: null });
  assert.equal(f.parent.recognition.observe(f.s, I.reeve, clues, null).ok, false);
  f.e.recognition.observe = () => ({
    id: 'input:bad',
    at: 0,
    explicitInput: true,
    cameraVisible: true,
    renderedClues: ['grey-tow-jacket'],
  });
  assert.equal(f.parent.recognition.observe(f.s, I.reeve, clues, 'pointer:bad').ok, false);
  f.cc.hasLineOfSight = () => false;
  assert.equal(f.parent.recognition.observe(f.s, I.reeve, clues, 'pointer:wall').ok, false);
});
test('a dropped clipboard, unknown actor, different scene or stale rendering result cannot become recognition', () => {
  const f = fixture({ stage: 'lookout' }),
    clues = ['grey tow jacket', 'co-op repossession clipboard'];
  assert.equal(f.parent.recognition.observe(f.s, 'other', clues, 'input:1').ok, false);
  f.s.campaignRuntime.sceneProps[LATE_METER_CLIPBOARD.id].state = 'dropped';
  assert.equal(f.parent.recognition.observe(f.s, I.reeve, clues, 'input:2').ok, false);
  f.s.campaignRuntime.sceneProps[LATE_METER_CLIPBOARD.id] = copy(LATE_METER_CLIPBOARD);
  companions.getActor(f.s, I.reeve).sceneId = 'impound-annex';
  assert.equal(f.parent.recognition.observe(f.s, I.reeve, clues, 'input:3').ok, false);
});
test('phone registration binds exact authored lines, original recognition time and real committed ownership', () => {
  const f = fixture(),
    definition = f.parent.phone.warningDefinition(authored, f.owner, {
      id: f.m.run.warning.callId,
      identifiedAt: 0,
    }),
    short = copy(definition);
  short.lines = short.lines.slice(0, 1);
  assert.equal(f.parent.phone.register(f.s, short).ok, false);
  assert.equal(Object.keys(f.s.phoneCalls.calls).length, 0);
  f.s.campaign.active.stageId = 'lookout';
  assert.equal(register(f).ok, false);
  f.s.campaign.active.stageId = 'warn';
  assert.equal(register(f).ok, true);
  assert.equal(f.s.phoneCalls.calls[f.m.run.warning.callId].definition.lines.length, 3);
});
test('wrong contact and unmet answer stay real and never reset the 18-second warning deadline', () => {
  const f = fixture();
  register(f);
  assert.equal(
    f.parent.phone.act(f.s, { type: 'dial', id: f.m.run.warning.callId, contact: 'wrong' }).reason,
    'wrong-contact',
  );
  assert.equal(f.s.phoneCalls.calls[f.m.run.warning.callId].definition.window.startedAt, 0);
  f.e.phone.contactAnswered = () => false;
  assert.equal(
    f.parent.phone.act(f.s, { type: 'dial', id: f.m.run.warning.callId, contact: I.felix }).ok,
    true,
  );
  f.s.time = 1;
  f.parent.phone.tick(f.s, 0.5);
  assert.equal(f.parent.phone.view(f.s).phase, 'ringing');
  f.s.time = 18;
  f.parent.phone.tick(f.s, 0.1);
  assert.equal(f.parent.phone.view(f.s).active, false);
  assert.equal(
    f.parent.phone.outcome(f.s, {
      kind: 'delivered',
      direction: 'outgoing',
      contact: I.felix,
      topic: 'collector-warning',
      owner: f.owner,
    }),
    null,
  );
});
test('only actually presented phone lines mirror ordered authored director acknowledgments and earn delivery', () => {
  const f = fixture();
  connected(f);
  assert.equal(
    f.parent.phone.act(f.s, { type: 'acknowledge', id: f.m.run.warning.callId, index: 0 }).ok,
    false,
  );
  assert.equal(f.calls.mirror, 0);
  for (let i = 0; i < 3; i++) assert.equal(acknowledge(f).ok, true);
  const receipt = f.parent.phone.outcome(f.s, {
    kind: 'delivered',
    direction: 'outgoing',
    contact: I.felix,
    topic: 'collector-warning',
    owner: f.owner,
  });
  assert.equal(receipt.history.length, 3);
  assert.equal(f.calls.mirror, 3);
  assert.equal(f.s.campaign.active.dialogue.index, 3);
  assert.equal(
    Object.values(f.s.lateMeterEffects.receipts).filter((r) => r.kind === 'phone-dialogue').length,
    3,
  );
  assert.equal(validateLateMeterParentState(f.s), true);
});
test('declined mutating composed acknowledgment rolls back phone, complete world and director in place', () => {
  const f = fixture();
  connected(f);
  const v = f.parent.phone.view(f.s);
  f.parent.phone.present(f.s, v.id, 0, v.line.dialCount);
  const before = copy(f.s),
    identity = f.s.campaign;
  f.e.acknowledgeCampaignDialogue = (state) => {
    state.player.money = 0;
    state.calendar.offsetHours = 12;
    state.campaign.active.dialogue.index = 2;
    return { ok: false };
  };
  assert.equal(
    f.parent.phone.act(f.s, {
      type: 'acknowledge',
      id: v.id,
      index: 0,
      dialCount: v.line.dialCount,
    }).ok,
    false,
  );
  assert.equal(f.s.campaign, identity);
  before.lateMeterRuntime.restoreEpoch++;
  before.lateMeterRuntime.lastObservedTime = before.time;
  before.lateMeterRuntime.lastRestoreReason = 'rollback:phone-dialogue';
  before.phoneCalls.calls[v.id].presentation.visible = false;
  before.phoneCalls.calls[v.id].presentation.presented = false;
  assert.deepEqual(f.s, before);
});
test('same-attempt warning resume preserves the real earlier phone owner and presented cursor', () => {
  const f = fixture();
  connected(f);
  assert.equal(acknowledge(f).ok, true);
  const oldOwner = copy(f.owner),
    newReceipt = 'fixture:warn:resume';
  f.m.active.receipt = newReceipt;
  f.m.activations[newReceipt] = {
    scope: { ...f.scope, activationReceipt: newReceipt },
    at: f.s.time,
  };
  f.s.campaign.receipts[newReceipt] = {
    kind: 'stage-activation',
    missionId: I.mission,
    stageId: 'warn',
    attempt: 1,
  };
  assert.equal(register(f).ok, true);
  assert.deepEqual(f.s.phoneCalls.calls[f.m.run.warning.callId].definition.owner, oldOwner);
  assert.equal(f.parent.phone.view(f.s).line.index, 1);
  assert.equal(acknowledge(f).ok, true);
  assert.equal(f.calls.mirror, 2);
});
test('redial rereads actual lines without double-advancing the director or changing original deadline', () => {
  const f = fixture();
  connected(f);
  acknowledge(f);
  f.parent.phone.act(f.s, { type: 'hang-up', id: f.m.run.warning.callId });
  assert.equal(
    f.parent.phone.act(f.s, { type: 'dial', id: f.m.run.warning.callId, contact: I.felix }).ok,
    true,
  );
  f.s.time = 0.2;
  f.parent.phone.tick(f.s, 0.1);
  assert.equal(acknowledge(f).ok, true);
  assert.equal(f.calls.mirror, 1);
  assert.equal(f.s.campaign.active.dialogue.index, 1);
  assert.equal(f.s.phoneCalls.calls[f.m.run.warning.callId].definition.window.startedAt, 0);
});
test('a current collector door pose blocks final warning even before the runtime arrival flag updates', () => {
  const f = fixture();
  connected(f);
  acknowledge(f);
  acknowledge(f);
  Object.assign(companions.getActor(f.s, I.reeve), f.a.entry);
  assert.equal(f.m.run.doorReachedAt, null);
  const result = acknowledge(f);
  assert.equal(result.ok, true);
  assert.equal(result.deliveryPending, true);
  assert.equal(f.s.campaign.active.dialogue.index, 3);
  assert.equal(
    f.parent.phone.outcome(f.s, {
      kind: 'delivered',
      direction: 'outgoing',
      contact: I.felix,
      topic: 'collector-warning',
      owner: f.owner,
    }),
    null,
  );
});
test('actual death or leaving the annex prevents phone connection/delivery and failed ownership cancels it', () => {
  const f = fixture();
  connected(f);
  companions.damageCompanion(f.s, I.yara, 1000);
  acknowledge(f);
  acknowledge(f);
  assert.equal(acknowledge(f).deliveryPending, true);
  assert.equal(
    Object.values(f.s.phoneCalls.outcomes).some((r) => r.kind === 'delivered'),
    false,
  );
  f.s.campaign.active.phase = 'failed';
  f.parent.phone.tick(f.s, 0);
  assert.equal(f.s.phoneCalls.activeId, null);
  assert.equal(f.s.phoneCalls.calls[f.m.run.warning.callId].phase, 'cancelled');
});
test('native driver lease must physically board, couple and remain controllable before any pursuit callback', () => {
  const f = fixture({ stage: 'extract' }),
    def = {
      ...f.a.pursuerSpawn,
      id: I.pursuer,
      spec: 'sedan',
      kind: 'parked',
      missionVehicle: true,
    };
  assert.equal(f.parent.vehicles.ensure(f.s, def).ok, true);
  // Declared start at the actual authored driver door; boarding itself uses real collision/movement.
  Object.assign(companions.getActor(f.s, I.reeve), { ...f.a.pursuerDriverDoor, sceneId: null });
  assert.equal(f.parent.drivers.requestDriver(f.s, I.reeve, I.pursuer).ok, true);
  assert.equal(
    f.parent.drivers.drive(f.s, I.pursuer, 0.1, {
      up: true,
      brake: false,
      left: false,
      right: false,
    }).ok,
    false,
  );
  for (let i = 0; i < 30 && !f.parent.drivers.observe(f.s, I.pursuer)?.controllable; i++) {
    f.s.time += 0.05;
    companions.updateCompanions(f.s, 0.05, f.cc);
  }
  assert.equal(f.parent.drivers.observe(f.s, I.pursuer).controllable, true);
  assert.equal(
    f.parent.drivers.drive(f.s, I.pursuer, 0.1, {
      up: true,
      brake: false,
      left: false,
      right: false,
    }).ok,
    true,
  );
  assert.equal(f.calls.driverDrive, 1);
  companions.requestExit(f.s, I.reeve, f.cc);
  assert.equal(
    f.parent.drivers.drive(f.s, I.pursuer, 0.1, {
      up: true,
      brake: false,
      left: false,
      right: false,
    }).ok,
    false,
  );
  assert.equal(f.calls.driverDrive, 1);
});
test('fake seated driver observation cannot supply control without actual canonical seat-zero ownership', () => {
  const f = fixture();
  f.parent.vehicles.ensure(f.s, {
    ...f.a.pursuerSpawn,
    id: I.pursuer,
    spec: 'sedan',
    kind: 'parked',
    missionVehicle: true,
  });
  f.e.drivers.observe = () => ({
    actorId: I.reeve,
    vehicleId: I.pursuer,
    seat: 0,
    seated: true,
    alive: true,
    controllable: true,
  });
  assert(f.parent.drivers.observe(f.s, I.pursuer).unmet);
  assert.equal(
    f.parent.drivers.drive(f.s, I.pursuer, 0.1, {
      up: true,
      brake: false,
      left: false,
      right: false,
    }).ok,
    false,
  );
  assert.equal(f.calls.driverDrive, 0);
});
test('only an actual owned or acquired healthy taxi is selected; no free player replacement or sedan substitution', () => {
  const f = fixture();
  assert.equal(f.parent.vehicles.chooseTaxi(f.s), f.car);
  f.car.health = 0;
  assert.equal(f.parent.vehicles.chooseTaxi(f.s), null);
  assert.equal(f.calls.create, 0);
  const replacement = { ...f.car, id: 'acquired-taxi', health: 90, owned: false, stolen: true };
  f.s.vehicles.push(replacement);
  assert.equal(f.parent.vehicles.chooseTaxi(f.s), replacement);
  replacement.spec = 'sedan';
  assert.equal(f.parent.vehicles.chooseTaxi(f.s), null);
});
test('an actual acquired taxi parked at Dispatch takes priority over a distant owned taxi without granting ownership or healing', () => {
  const f = fixture();
  f.car.id = 'arc-arrival-taxi';
  f.car.health = 91;
  const stop = f.d.stop,
    current = {
      ...f.car,
      id: 'actual-acquired-taxi',
      owned: false,
      stolen: true,
      health: 77,
      x: stop.x + stop.w / 2,
      y: stop.y + stop.h / 2,
      angle: stop.angle ?? 0,
      speed: 0,
    };
  f.s.vehicles.push(current);
  f.s.player.vehicleId = current.id;
  const before = copy(f.s.vehicles);
  assert.equal(f.parent.vehicles.chooseTaxi(f.s), current);
  assert.deepEqual(f.s.vehicles, before);
  assert.equal(current.owned, false);
  assert.equal(current.health, 77);
  assert.equal(f.calls.create, 0);
  current.x += 100;
  assert.equal(f.parent.vehicles.chooseTaxi(f.s), f.car);
  const unacquired = {
    ...current,
    id: 'unacquired-taxi',
    owned: false,
    stolen: false,
    x: stop.x + stop.w / 2,
  };
  f.s.vehicles.push(unacquired);
  assert.equal(f.parent.vehicles.chooseTaxi(f.s), f.car);
});

test('collector factory permits exact canonical setup only and preserves existing damage/body pose', () => {
  const f = fixture({ collector: false }),
    def = {
      ...f.a.pursuerSpawn,
      id: I.pursuer,
      spec: 'sedan',
      kind: 'parked',
      missionVehicle: true,
    };
  assert.equal(f.parent.vehicles.ensure(f.s, { ...def, id: 'free-taxi', spec: 'taxi' }).ok, false);
  assert.equal(f.calls.create, 0);
  assert.equal(f.parent.vehicles.ensure(f.s, def).ok, true);
  const car = f.s.vehicles.find((v) => v.id === I.pursuer);
  car.health = 20;
  car.x += 4;
  assert.equal(f.parent.vehicles.ensure(f.s, def).ok, true);
  assert.equal(car.health, 20);
  assert.equal(car.x, def.x + 4);
  assert.equal(f.calls.create, 1);
});
test('collector scripted movement uses collision callbacks, refuses teleport, and does not erase real injury', () => {
  const f = fixture(),
    body = companions.getActor(f.s, I.reeve),
    before = copy(body);
  f.e.moveActor = () => {
    body.x += 200;
    body.health = 80;
    return true;
  };
  assert.equal(f.parent.actors.move(f.s, I.reeve, 1, 0, 7).ok, false);
  assert.equal(body.x, before.x);
  assert.equal(body.health, 80);
  assert.equal(f.parent.actors.move(f.s, I.felix, 1, 0, 7).ok, false);
});
test('damage and attacks expose only committed runtime ledgers with immediate perception, not health deltas', () => {
  const f = fixture(),
    yara = companions.getActor(f.s, I.yara);
  companions.damageCompanion(f.s, I.yara, 5);
  assert.deepEqual(f.parent.damage.events(f.s, 0), []);
  const event = {
    entityType: 'actor',
    targetId: I.yara,
    targetKind: 'companion',
    owner: 'player',
    kind: 'bullet',
    healthBefore: 100,
    healthAfter: 95,
    armourBefore: 0,
    armourAfter: 0,
    x: yara.x,
    y: yara.y,
    z: yara.z,
    sceneId: yara.sceneId,
    at: f.s.time,
  };
  assert.equal(observeLateMeterDamage(f.s, event).ok, true);
  assert.equal(f.parent.damage.events(f.s, 0).length, 1);
  const attack = {
    owner: 'player',
    kind: 'hitscan',
    weapon: 'pistol',
    angle: 0,
    x: f.s.player.x,
    y: f.s.player.y,
    z: 0,
    sceneId: null,
    at: 0,
    serial: 1,
  };
  f.s.player.lastAttack = { serial: 1, kind: 'hitscan', weapon: 'pistol', angle: 0, time: 0 };
  f.e.attacks.perceived = () => true;
  assert.equal(observeLateMeterAttack(f.s, attack, f.parent).ok, true);
  f.e.attacks.perceived = () => false;
  assert.equal(f.parent.attacks.events(f.s, 0)[0].perceived, true);
});
test('unknown effects, forged scopes, choice strings and terminal booleans cannot grant evidence or money', () => {
  const f = fixture(),
    before = f.s.player.money;
  const request = effectRequest(f);
  assert.equal(
    f.parent.effects.handlers['campaign-reward'](
      f.s,
      { type: 'campaign-reward', rewards: copy(authored.rewards) },
      request,
    ).ok,
    false,
  );
  assert.equal(f.s.player.money, before);
  assert.equal(
    f.parent.effects.handlers['evidence-note'](
      f.s,
      { type: 'evidence-note', id: 'invented' },
      request,
    ).ok,
    false,
  );
  f.m.run.warning.method = { id: 'phone', at: 0, inputReceipt: 'pointer:phone' };
  assert.equal(
    f.parent.effects.handlers['authored-effect'](
      f.s,
      { type: 'authored-effect', text: 'skip clock' },
      request,
    ).ok,
    false,
  );
  const result = f.parent.effects.handlers['authored-effect'](
    f.s,
    { type: 'authored-effect', text: 'normal warning' },
    request,
  );
  assert.equal(result.ok, true);
  assert.equal(f.parent.effects.verifyReceipt(f.s, result.receipt), true);
  assert.equal(f.parent.effects.verifyReceipt(f.s, { ...result.receipt, time: 9 }), false);
  assert.equal(
    f.parent.effects.handlers['authored-effect'](
      f.s,
      { type: 'authored-effect', text: 'normal warning' },
      { ...request, scope: { ...request.scope, attempt: 2 } },
    ).ok,
    false,
  );
});
test('lifecycle cancels only actual communication/releases control without moving, healing or paying actors', () => {
  const f = fixture();
  connected(f);
  const before = copy(f.s.companions.actors),
    money = f.s.player.money;
  const result = f.parent.effects.handlers['mission-abandoned'](
    f.s,
    { type: 'mission-abandoned', missionId: I.mission },
    effectRequest(f),
  );
  assert.equal(result.ok, true);
  assert.equal(f.s.phoneCalls.activeId, null);
  assert.deepEqual(f.s.companions.actors, before);
  assert.equal(f.s.player.money, money);
  assert.equal(f.calls.release, 1);
  assert.equal(
    f.parent.effects.handlers['mission-abandoned'](
      f.s,
      { type: 'mission-abandoned', missionId: I.mission },
      effectRequest(f),
    ).replayed,
    true,
  );
  assert.equal(f.calls.release, 1);
});
test('full restart lifecycle requires real retained start checkpoint, exact namespace token and actual restore reason', () => {
  const f = fixture();
  const run = f.s.campaign.active;
  run.resumeInfo = { reason: 'return-to-free-roam' };
  f.s.campaign.suspended = [run];
  f.s.campaign.active = null;
  f.m.active = null;
  const token = 'campaign:fixture-original:LL-ST-002:attempt:2:restart',
    request = {
      id: 'fixture:restart-effect',
      directorReceipt: token,
      scope: { missionId: I.mission, stageId: 'warn', attempt: 2, activationReceipt: token },
    },
    action = { type: 'mission-restarted', missionId: I.mission };
  assert.equal(f.parent.effects.handlers['mission-restarted'](f.s, action, request).ok, false);
  f.m.lastRestoreReason = 'retry:start';
  assert.equal(f.parent.effects.handlers['mission-restarted'](f.s, action, request).ok, true);
  assert.equal(f.s.player.money, 40);
});
test('partial snapshots and unsafe JSON/accessors fail before callbacks or receipt mutation', () => {
  const f = fixture(),
    before = copy(f.s.lateMeterEffects);
  f.e.snapshots.capture = () => ({ player: copy(f.s.player) });
  assert.throws(() => f.parent.snapshots.capture(f.s), /complete/);
  let invoked = 0;
  const action = {
    type: 'authored-effect',
    get effect() {
      invoked++;
      return 'normal warning';
    },
  };
  assert.throws(
    () => f.parent.effects.handlers['authored-effect'](f.s, action, effectRequest(f)),
    /Unsafe/,
  );
  assert.equal(invoked, 0);
  assert.deepEqual(f.s.lateMeterEffects, before);
});
test('saved parent mirror receipts cannot be invented or detached from actual typed phone acknowledgment history', () => {
  const f = fixture();
  f.parent.vehicles.ensure(f.s, {
    ...f.a.pursuerSpawn,
    id: I.pursuer,
    spec: 'sedan',
    kind: 'parked',
    missionVehicle: true,
  });
  connected(f);
  acknowledge(f);
  const key = Object.values(f.s.lateMeterEffects.receipts).find(
      (entry) => entry.kind === 'phone-dialogue',
    ).id,
    saved = copy(f.s);
  saved.lateMeterEffects.receipts[key].phoneReceipt.index = 2;
  assert.throws(() => validateLateMeterParentState(saved), /Unproved/);
  assert.equal(validateLateMeterRuntime(f.s), true);
  assert.equal(validateLateMeterParentState(f.s), true);
});

test('multiple redials preserve every actual typed mirror receipt in a valid complete save', () => {
  const f = fixture();
  connected(f);
  acknowledge(f);
  for (let dial = 2; dial <= 3; dial++) {
    f.parent.phone.act(f.s, { type: 'hang-up', id: f.m.run.warning.callId });
    assert.equal(
      f.parent.phone.act(f.s, { type: 'dial', id: f.m.run.warning.callId, contact: I.felix }).ok,
      true,
    );
    f.s.time += 0.1;
    f.parent.phone.tick(f.s, 0.1);
    assert.equal(validateLateMeterParentState(f.s), true);
    assert.equal(acknowledge(f).ok, true);
    if (dial === 2) assert.equal(acknowledge(f).ok, true);
    assert.equal(validateLateMeterParentState(f.s), true);
  }
  assert.equal(f.calls.mirror, 2);
  assert.equal(f.s.campaign.active.dialogue.index, 2);
  assert.equal(f.parent.phone.acknowledgments(f.s, f.m.run.warning.callId).length, 4);
  assert.equal(phone.validatePhoneCalls(f.s), true);
});

test('director-shaped authored and common failure actions need no invented missionId field', () => {
  for (const definition of [
    authored.failures[0],
    { id: 'player-dead', condition: { type: 'player-dead' }, resumeCheckpoint: 'start' },
  ]) {
    const f = fixture();
    connected(f);
    const action = {
      type: 'mission-failed',
      failureId: definition.id,
      condition: copy(definition.condition),
      resumeCheckpoint: definition.resumeCheckpoint,
    };
    assert.equal(
      f.parent.effects.handlers['mission-failed'](f.s, action, effectRequest(f)).ok,
      true,
    );
    assert.equal(f.s.phoneCalls.activeId, null);
    assert.equal(f.calls.release, 1);
    assert.equal(f.s.player.money, 40);
  }
  const f = fixture();
  assert.equal(
    f.parent.effects.handlers['mission-failed'](
      f.s,
      {
        type: 'mission-failed',
        failureId: 'invented',
        condition: { type: 'player-dead' },
        resumeCheckpoint: 'start',
      },
      effectRequest(f),
    ).ok,
    false,
  );
});

test('existing Felix ensure refreshes a newly instantiated Dispatch proxy without another body or life gain', () => {
  const f = fixture(),
    felix = companions.getActor(f.s, I.felix);
  companions.damageCompanion(f.s, I.felix, 25);
  const roomState = { ...f.s, interior: { ...f.s.interior, active: { roomId: 'voss-dispatch' } } },
    proxies = interiorActors(roomState),
    proxy = proxies.find((a) => a.castId === 'felix-voss');
  assert(proxy);
  assert.notEqual(proxy.companionId, I.felix);
  const before = {
    x: felix.x,
    y: felix.y,
    z: felix.z,
    sceneId: felix.sceneId,
    health: felix.health,
  };
  assert.equal(f.parent.passengers.ensureNamedActor(f.s, { ...felix }, f.cc), felix);
  assert.equal(proxy.companionId, I.felix);
  assert.equal(proxy.health, 75);
  assert.equal(f.s.companions.actors.filter((a) => a.id === I.felix).length, 1);
  assert.deepEqual(
    { x: felix.x, y: felix.y, z: felix.z, sceneId: felix.sceneId, health: felix.health },
    before,
  );
});

test('recognition cannot bypass the real two-line exchange, timed lookout window or full parked footprint', () => {
  const f = fixture({ stage: 'lookout' }),
    clues = ['grey tow jacket', 'co-op repossession clipboard'];
  f.s.campaign.active.dialogue.index = 1;
  assert.equal(f.parent.recognition.observe(f.s, I.reeve, clues, 'input:early').ok, false);
  f.s.campaign.active.dialogue.index = 2;
  f.s.time = 45;
  assert.equal(f.parent.recognition.observe(f.s, I.reeve, clues, 'input:late').ok, false);
  f.s.time = 0;
  f.car.x += 10;
  assert.equal(f.parent.recognition.observe(f.s, I.reeve, clues, 'input:bad-park').ok, false);
  assert.equal(f.calls.recognition, 0);
});

test('collector pose callback cannot become a hidden spatial movement or erase actual injury', () => {
  const f = fixture(),
    reeve = companions.getActor(f.s, I.reeve),
    before = { x: reeve.x, y: reeve.y, z: reeve.z, sceneId: reeve.sceneId };
  f.e.poseActor = () => {
    reeve.x += 100;
    reeve.health = 70;
    return { ok: true };
  };
  assert.equal(f.parent.actors.pose(f.s, I.reeve, { action: 'idle', angle: 0 }).ok, false);
  assert.deepEqual({ x: reeve.x, y: reeve.y, z: reeve.z, sceneId: reeve.sceneId }, before);
  assert.equal(reeve.health, 70);
});

test('a once-registered clipboard is never recreated after deletion or re-equipped after a saved drop', () => {
  const f = fixture(),
    prop = f.s.campaignRuntime.sceneProps[LATE_METER_CLIPBOARD.id];
  Object.assign(prop, { state: 'dropped', ownerActorId: null, x: 347, y: 397, z: 0, angle: 0 });
  assert.equal(f.parent.syncSceneProps().ok, true);
  assert.equal(validateLateMeterParentState(f.s), true);
  delete f.s.campaignRuntime.sceneProps[LATE_METER_CLIPBOARD.id];
  assert.equal(f.parent.syncSceneProps().ok, false);
  assert.equal(Object.hasOwn(f.s.campaignRuntime.sceneProps, LATE_METER_CLIPBOARD.id), false);
  assert.throws(() => validateLateMeterParentState(f.s), /collector prop/);
});

test('saved physical receipts reject detached reward proof, extra rewards and arbitrary authored strings', () => {
  const f = terminalFixture();
  f.parent.effects.handlers['evidence-note'](
    f.s,
    { type: 'evidence-note', id: 'duplicate-impound-invoices' },
    effectRequest(f, 'fixture:evidence'),
  );
  f.parent.effects.handlers['campaign-reward'](
    f.s,
    { type: 'campaign-reward', rewards: copy(authored.rewards) },
    effectRequest(f, 'fixture:reward'),
  );
  for (const alter of [
    (s) => {
      s.lateMeterEffects.receipts['fixture:reward'].proof.escapeId = 'invented:escape';
    },
    (s) => {
      s.lateMeterEffects.receipts['fixture:reward'].action.rewards.unlocks.push('invented');
    },
    (s) => {
      s.lateMeterEffects.receipts['fixture:choice-warning'].action.text = 'skip warning';
    },
  ]) {
    const saved = copy(f.s);
    alter(saved);
    assert.throws(() => validateLateMeterParentState(saved));
  }
});

test('saved clipboard rejects forged geometry, clue tags, presentation identity and missing/nonfinite dropped poses', () => {
  const f = fixture();
  for (const alter of [
    (p) => {
      p.width = 20;
    },
    (p) => {
      p.height = 20;
    },
    (p) => {
      p.thickness = 4;
    },
    (p) => {
      p.boardColor = '#ffffff';
    },
    (p) => {
      p.title = 'fabricated';
    },
    (p) => {
      p.evidenceTags = ['invented-clue'];
    },
    (p) => {
      p.state = 'dropped';
      p.ownerActorId = null;
    },
    (p) => {
      Object.assign(p, { state: 'dropped', ownerActorId: null, x: NaN, y: 0, z: 0, angle: 0 });
    },
    (p) => {
      Object.assign(p, { state: 'dropped', ownerActorId: null, x: 1e100, y: 0, z: 0, angle: 0 });
    },
    (p) => {
      Object.assign(p, {
        state: 'dropped',
        ownerActorId: null,
        x: 1,
        y: 0,
        z: 0,
        angle: 0,
        sceneId: 'invented-room',
      });
    },
  ]) {
    const saved = copy(f.s);
    alter(saved.campaignRuntime.sceneProps[LATE_METER_CLIPBOARD.id]);
    assert.throws(() => validateLateMeterParentState(saved));
  }
});

test('a saved warning owner without its actual director activation receipt cannot register a call', () => {
  const f = fixture();
  delete f.s.campaign.receipts[f.owner.receipt];
  assert.equal(register(f).ok, false);
  assert.equal(Object.keys(f.s.phoneCalls.calls).length, 0);
});

test('full snapshots independently reject corrupt owned runtime/phone state even if the engine forgot new validators', () => {
  const f = fixture();
  connected(f);
  const valid = f.parent.snapshots.capture(f.s);
  assert.equal(f.parent.snapshots.validate(valid), true);
  const invalidRuntime = copy(valid);
  invalidRuntime.lateMeterRuntime.run.lookoutExchange = null;
  assert.equal(f.parent.snapshots.validate(invalidRuntime), false);
  const invalidPhone = copy(valid);
  invalidPhone.phoneCalls.calls[f.m.run.warning.callId].definition.lines[0].text = 'invented';
  assert.equal(f.parent.snapshots.validate(invalidPhone), false);
  f.e.snapshots.capture = () => invalidRuntime;
  assert.throws(() => f.parent.snapshots.capture(f.s), /complete/);
});
