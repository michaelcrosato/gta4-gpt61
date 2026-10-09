/** Native/component tests with declared setup poses and synthetic parent readiness.
 * They are not a natural browser mission playthrough or integration credit. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, VEHICLE_SPECS } from '../src/simulation.js';
import { WORLD } from '../src/world.js';
import { createTerrain } from '../src/terrain.js';
import { createSceneContext } from '../src/scene-context.js';
import { createCampaignPhysicalContext } from '../src/campaign/physical-context.js';
import { findLocalFootPath } from '../src/local-navigation.js';
import { INTERIOR_LAYOUTS, PORTAL_DEFINITIONS } from '../src/interiors.js';
import * as Companions from '../src/companions.js';
import * as Phone from '../src/phone-calls.js';
import { FIRST_ARC_MISSIONS } from '../src/campaign/first-arc.js';
import {
  initializeLateMeterRuntime,
  createLateMeterAdapters,
  tickLateMeterRuntime,
  actLateMeter,
  lateMeterView,
  lateMeterIntegrationGates,
  observeLateMeterDamage,
  lateMeterDamageEvents,
  observeLateMeterAttack,
  lateMeterAttackEvents,
  validateLateMeterRuntime,
} from '../src/campaign/late-meter-runtime.js';
const copy = (v) => JSON.parse(JSON.stringify(v));
const authored = copy(FIRST_ARC_MISSIONS[1]);
const historical = copy(authored);
historical.failures = historical.failures.filter(
  (entry) =>
    !['protected-target-harmed', 'lookout-timeout', 'collector-door-arrived'].includes(
      entry.condition.type,
    ),
);
const terrain = createTerrain(WORLD),
  scenes = createSceneContext(WORLD, terrain);
const BASE = createSimulation({ campaign: false });
const ids = {
  felix: 'LL-CHAR-002',
  yara: 'LL-ARC-YARA',
  reeve: 'LL-ARC-REEVE',
  watcher: 'holt-collector-watch',
  pursuer: 'holt-tow-sedan',
};
function fixture({ stage = 'counter', bay = false, sourceOnly = false, physical = true } = {}) {
  const state = copy(BASE);
  state.vehicles = [];
  state.companions = {
    version: 1,
    time: state.time,
    actors: [],
    records: [],
    events: [],
    sequence: 0,
  };
  state.time = 0;
  state.wanted.level = 0;
  state.mission = null;
  const bindings = copy(WORLD.campaignSceneBindings),
    d = bindings.dispatch,
    a = bindings['impound-counter'];
  d.portalId = 'voss-dispatch-entry';
  d.felixTarget = { x: 162, y: 40, z: 0, sceneId: d.roomId, radius: 10 };
  const car = {
    id: 'test-owned-taxi',
    spec: 'taxi',
    kind: 'parked',
    owned: true,
    x: 440,
    y: 748,
    z: 0,
    sceneId: null,
    angle: 0,
    speed: 0,
    health: 120,
  };
  if (bay) Object.assign(car, a.parkingBay.pose);
  state.vehicles.push(car);
  Object.assign(state.player, {
    x: car.x,
    y: car.y,
    z: 0,
    sceneId: null,
    vehicleId: car.id,
    health: 100,
  });
  state.interior.active = null;
  state.campaign = {
    completed: { 'LL-ST-001': { fixture: true } },
    active: {
      missionId: 'LL-ST-002',
      stageId: stage,
      attempt: 1,
      dialogue: {
        index: 0,
        lines: authored.stages.find((s) => s.id === stage).dialogue,
      },
    },
  };
  const companionContext = physical
    ? createCampaignPhysicalContext(state, {
        world: WORLD,
        terrain,
        specs: VEHICLE_SPECS,
        scenes,
        localPath: findLocalFootPath,
        scriptControlled: (a) =>
          Boolean(
            state.lateMeterRuntime?.run.itineraries[a.id] &&
            !state.lateMeterRuntime.run.itineraries[a.id].finished,
          ),
      })
    : { specs: VEHICLE_SPECS };
  Companions.ensureNamedActor(
    state,
    {
      id: ids.felix,
      castId: 'felix-voss',
      name: 'Felix Voss',
      ...d.felixTarget,
    },
    companionContext,
  );
  const effects = {};
  for (const type of [
    'actor-route',
    'evidence-note',
    'authored-effect',
    'campaign-reward',
    'mission-failed',
    'mission-abandoned',
    'mission-suspended',
    'mission-restarted',
  ])
    effects[type] = (s, action, request) => {
      s.testEffects ??= {};
      const receipt = {
        id: request.id,
        status: 'committed',
        type: action.type,
        scope: request.scope,
      };
      s.testEffects[receipt.id] = receipt;
      return { ok: true, receipt };
    };
  const phoneContext = {
    ownerStatus: (s, o) =>
      s.lateMeterRuntime?.active?.stageId === o.stageId ? 'active' : 'suspended',
    observe: (s, condition) =>
      condition.type === 'collector-warning-permitted'
        ? s.lateMeterRuntime.run.doorReachedAt === null
        : true,
  };
  const parent = {
    world: WORLD,
    bindings,
    authoredMission: sourceOnly ? historical : authored,
    companionContext,
    passengers: Companions,
    ready: {
      phone: true,
      chase: true,
      passengers: true,
      interior: true,
      director: true,
    },
    rooms: {
      hasRoom: (id) => Boolean(INTERIOR_LAYOUTS[id]),
      hasPortal: (id) => PORTAL_DEFINITIONS.some((p) => p.id === id),
    },
    vehicles: {
      specs: VEHICLE_SPECS,
      chooseTaxi: () => car,
      ensure: (s, definition) => {
        if (!s.vehicles.some((v) => v.id === definition.id))
          s.vehicles.push({
            ...definition,
            speed: 0,
            health: 115,
            sceneId: null,
          });
        return { ok: true };
      },
    },
    actors: {
      move: (s, id, dx, dy, radius) => {
        companionContext.moveBody(Companions.getActor(s, id), dx, dy, radius);
        return { ok: true };
      },
      pose: (s, id, pose) => {
        const a = Companions.getActor(s, id);
        if (pose.angle !== null) a.angle = pose.angle;
        a.action = pose.action;
        return { ok: true };
      },
    },
    drivers: {
      ready: true,
      requestDriver: () => ({
        ok: false,
        unmet: ['synthetic-driver-not-implemented'],
      }),
      observe: () => null,
      drive: () => ({ ok: false }),
      release: () => ({ ok: true }),
    },
    damage: { ready: true, events: lateMeterDamageEvents },
    attacks: {
      ready: true,
      events: lateMeterAttackEvents,
      perceived: () => false,
    },
    recognition: {
      ready: true,
      observe: (s, id, clues, inputReceipt) => ({
        ok: true,
        receipt: {
          id: `recognition:${inputReceipt}`,
          actorId: id,
          at: s.time,
          clues,
          explicitInput: true,
          cameraVisible: true,
          lineOfSight: true,
          range: 180,
          inputReceipt,
          observerPose: {
            x: s.player.x,
            y: s.player.y,
            z: s.player.z,
            sceneId: null,
          },
          actorPose: {
            x: Companions.getActor(s, id).x,
            y: Companions.getActor(s, id).y,
            z: 0,
            sceneId: null,
          },
        },
      }),
    },
    sight: (s, from, to) => terrain.hasLineOfSight(from, to),
    observations: { playerArrested: () => false },
    dialogue: { annexReady: () => true },
    director: { chooseOption: () => ({ ok: true }) },
    effects: {
      handlers: effects,
      verifyReceipt: (s, r) => s.testEffects?.[r.id]?.id === r.id,
    },
    snapshots: {
      capture: (s) => {
        const w = copy(s);
        delete w.campaign;
        return w;
      },
      validate: () => true,
      restore: (s, w) => {
        const director = s.campaign;
        for (const key of Object.keys(s)) delete s[key];
        Object.assign(s, copy(w), { campaign: director });
        return { ok: true };
      },
    },
    phone: {
      ready: true,
      register: (s, d) => Phone.registerPhoneCall(s, d, phoneContext),
      act: (s, a) => Phone.actPhoneCalls(s, a, phoneContext),
      tick: (s, dt) => Phone.updatePhoneCalls(s, dt, phoneContext),
      view: Phone.phoneCallView,
      outcome: Phone.phoneOutcome,
      acknowledgments: Phone.phoneAcknowledgments,
      validate: Phone.validatePhoneCalls,
      warningDefinition: Phone.collectorWarningDefinition,
    },
  };
  initializeLateMeterRuntime(state);
  Phone.initializePhoneCalls(state, {
    contacts: [{ id: ids.felix, name: 'Felix Voss' }],
  });
  const adapters = createLateMeterAdapters(state, parent),
    stageDef = parent.authoredMission.stages.find((s) => s.id === stage);
  const request = {
    missionId: 'LL-ST-002',
    stageId: stage,
    attempt: 1,
    receipt: `campaign:test:LL-ST-002:attempt:1:stage:${stage}`,
    reason: stage === 'counter' ? 'start' : 'stage-transition',
  };
  if (stage === 'warn') {
    state.lateMeterRuntime.run.recognition = {
      id: 'recognition:setup',
      actorId: ids.reeve,
      at: 0,
      clues: ['grey tow jacket', 'co-op repossession clipboard'],
      explicitInput: true,
      cameraVisible: true,
      lineOfSight: true,
      range: 180,
      inputReceipt: 'fixture',
      observerPose: { x: 231, y: 393, z: 0, sceneId: null },
      actorPose: { x: 347, y: 397, z: 0, sceneId: null },
      scope: {
        missionId: 'LL-ST-002',
        stageId: 'lookout',
        attempt: 1,
        activationReceipt: 'fixture:lookout',
      },
    };
  }
  if (stage !== 'counter') {
    const r = state.lateMeterRuntime.run;
    r.rideId = car.id;
    r.startedAt = 0;
    r.counterTrip = {
      boardedAt: 0,
      pickupPose: { x: 440, y: 748, z: 0, sceneId: null },
      distance: 500,
      lastPose: null,
    };
    r.counterDelivered = {
      id: 'fixture:counter',
      at: 0,
      scope: {
        missionId: 'LL-ST-002',
        stageId: 'counter',
        attempt: 1,
        activationReceipt: 'fixture:counter-stage',
      },
      actorId: ids.felix,
      vehicleId: car.id,
      vehiclePose: copy(a.parkingBay.pose),
      trip: copy(r.counterTrip),
      pose: copy(a.counterTarget),
    };
  }
  if (stage === 'warn') {
    const r = state.lateMeterRuntime.run;
    r.lookoutExchange = {
      id: 'fixture:exchange',
      at: 0,
      scope: {
        missionId: 'LL-ST-002',
        stageId: 'lookout',
        attempt: 1,
        activationReceipt: 'fixture:lookout',
      },
      lineCount: 2,
    };
    r.approachStartedAt = 0;
  }
  const result = adapters.activateStage(stageDef, request);
  return {
    state,
    parent,
    adapters,
    car,
    a,
    d,
    result,
    request,
    step(dt = 0.1, { companions = false } = {}) {
      state.time += dt;
      if (companions) Companions.updateCompanions(state, dt, companionContext);
      tickLateMeterRuntime(state, dt, parent);
    },
  };
}
const observe = (f, type, extra = {}) =>
  f.adapters.observe(
    { type, ...extra },
    {
      missionId: 'LL-ST-002',
      stageId: f.state.lateMeterRuntime.active.stageId,
    },
  );

test('historical02 without adopted safety/approach rules remains gated', () => {
  const f = fixture({ sourceOnly: true });
  assert.equal(f.result.ok, false);
  assert(
    lateMeterIntegrationGates(f.state, f.parent).includes(
      'approach-failures-not-authored-or-migrated',
    ),
  );
  assert.equal(historical.failures.length, 3);
  assert.equal(FIRST_ARC_MISSIONS[1].failures.length, 6);
});
test('unknown missions, altered stages, absent drivers, physical movement and recognition remain unmet gates', () => {
  const f = fixture();
  assert.equal(f.result.ok, true);
  assert.equal(f.adapters.supportsMission('LL-ST-003'), false);
  const altered = copy(authored.stages[0]);
  altered.objective = 'skip';
  assert.equal(f.adapters.supportsStage(altered.type, altered), false);
  f.parent.drivers.ready = false;
  f.parent.actors.move = null;
  assert(lateMeterIntegrationGates(f.state, f.parent).length > 0);
});
test('ensure uses actual keyed scene spawn definitions and preserves persistent actor health', () => {
  const f = fixture();
  assert.equal(f.result.ok, true);
  assert.equal(Companions.getActor(f.state, ids.yara).sceneId, 'impound-annex');
  Companions.damageCompanion(f.state, ids.yara, 12);
  assert.equal(f.adapters.activateStage(authored.stages[0], f.request).replayed, true);
  assert.equal(Companions.getActor(f.state, ids.yara).health, 88);
});
test('45-second lookout timeout,18-second identification clock and actual door arrival are distinct', () => {
  const f = fixture({ stage: 'lookout', bay: true });
  assert.equal(f.result.ok, true);
  assert.equal(observe(f, 'clock-expired', { clock: 'warn' }), false);
  f.state.time = 45;
  assert.equal(observe(f, 'lookout-timeout', { seconds: 45 }), true);
  assert.equal(observe(f, 'clock-expired', { clock: 'warn' }), false);
  const r = Companions.getActor(f.state, ids.reeve);
  Object.assign(r, { x: f.a.entry.x, y: f.a.entry.y });
  f.state.time += 0.1;
  tickLateMeterRuntime(f.state, 0.1, f.parent);
  assert.equal(
    observe(f, 'collector-door-arrived', {
      actor: ids.reeve,
      beforeWarning: true,
    }),
    true,
  );
  assert.equal(observe(f, 'clock-expired', { clock: 'warn' }), false);
});
test('scripted collectors move at binding speeds through collision callbacks and actually dwell with their prop', () => {
  const f = fixture({ stage: 'lookout', bay: true });
  f.state.campaign.active.dialogue.index = 2;
  f.step(0.1);
  const reeve = Companions.getActor(f.state, ids.reeve);
  let maxStep = 0,
    last = reeve.x;
  for (let i = 0; i < 90; i++) {
    f.step(0.1);
    maxStep = Math.max(maxStep, Math.abs(reeve.x - last));
    last = reeve.x;
  }
  assert(maxStep <= 1.800001);
  assert(Math.abs(reeve.x - 347) < 1);
  assert.equal(reeve.action, 'read-clipboard');
  const at = { x: reeve.x, y: reeve.y };
  for (
    let i = 0;
    i < Math.floor(f.a.collectorApproaches.east.clipboardReview.dwellSeconds * 5);
    i++
  )
    f.step(0.1);
  assert.equal(reeve.x, at.x);
  assert.equal(reeve.y, at.y);
  assert.equal(
    observe(f, 'collector-door-arrived', {
      actor: ids.reeve,
      beforeWarning: true,
    }),
    false,
  );
  for (let i = 0; i < 120; i++) f.step(0.1);
  assert.equal(
    observe(f, 'collector-door-arrived', {
      actor: ids.reeve,
      beforeWarning: true,
    }),
    true,
  );
});
test('a declined/blocked physical movement callback never advances an itinerary or produces recognition', () => {
  const f = fixture({ stage: 'lookout', bay: true });
  f.state.campaign.active.dialogue.index = 2;
  f.step(0.1);
  f.parent.actors.move = () => ({ ok: false });
  const x = Companions.getActor(f.state, ids.reeve).x;
  for (let i = 0; i < 40; i++) f.step(0.1);
  assert.equal(Companions.getActor(f.state, ids.reeve).x, x);
  assert.equal(
    observe(f, 'identified-actor', {
      actor: ids.reeve,
      evidence: ['grey tow jacket'],
    }),
    false,
  );
  assert.equal(f.state.lateMeterRuntime.active.blocked, 'actual-collector-movement-declined');
});
test('recognition needs actual parked taxi, explicit visible clues, LOS and matching saved poses', () => {
  const f = fixture({ stage: 'lookout', bay: true });
  f.state.campaign.active.dialogue.index = 2;
  f.step(0.1);
  const reeve = Companions.getActor(f.state, ids.reeve);
  Object.assign(reeve, { x: 347, y: 397 });
  assert.equal(
    actLateMeter(
      f.state,
      { type: 'recognize', actorId: ids.reeve, inputReceipt: 'pointer:1' },
      f.parent,
    ).ok,
    true,
  );
  assert.equal(f.state.lateMeterRuntime.run.recognition.at, f.state.time);
  f.car.x += 4;
  assert.equal(
    actLateMeter(
      f.state,
      { type: 'recognize', actorId: ids.reeve, inputReceipt: 'pointer:2' },
      f.parent,
    ).ok,
    false,
  );
  const saved = copy(f.state);
  saved.lateMeterRuntime.run.recognition.cameraVisible = false;
  assert.throws(() => validateLateMeterRuntime(saved));
});
test('arrival at annex cannot substitute for actual dispatch pickup, passenger ride, parking dwell and room delivery', () => {
  const f = fixture();
  assert.equal(f.result.ok, true);
  // Declared later-stage observation fixture; no genuine trip or boarding proof is supplied.
  Object.assign(f.car, f.a.parkingBay.pose);
  Object.assign(f.state.player, { x: f.car.x, y: f.car.y });
  const felix = Companions.getActor(f.state, ids.felix);
  Object.assign(felix, f.a.counterTarget);
  for (let i = 0; i < 30; i++) f.step(0.1);
  assert.equal(f.state.lateMeterRuntime.run.counterDelivered, null);
  assert.equal(observe(f, 'passenger-delivered', { actor: ids.felix }), false);
  f.car.angle += 0.3;
  assert.equal(observe(f, 'parked-in-lookout-bay'), false);
});
test('committed actual companion damage records health and armour deltas, attribution and idempotence', () => {
  const f = fixture();
  const yara = Companions.getActor(f.state, ids.yara);
  Companions.damageCompanion(f.state, ids.yara, 12);
  const event = {
    entityType: 'actor',
    targetId: ids.yara,
    targetKind: 'companion',
    owner: 'player',
    kind: 'bullet',
    healthBefore: 100,
    healthAfter: 88,
    armourBefore: 0,
    armourAfter: 0,
    x: yara.x,
    y: yara.y,
    z: yara.z,
    sceneId: yara.sceneId,
    at: f.state.time,
  };
  const r = observeLateMeterDamage(f.state, event);
  assert.equal(r.ok, true);
  assert.equal(observeLateMeterDamage(f.state, event).replayed, true);
  assert.equal(observe(f, 'protected-target-harmed'), true);
  assert.equal(lateMeterDamageEvents(f.state).length, 1);
  assert.equal(observeLateMeterDamage(f.state, { ...event, healthAfter: 87 }).ok, false);
  assert.equal(observeLateMeterDamage(f.state, { ...event, owner: { id: 'player' } }).ok, false);
});
test('world damage to Yara is not player harm; essential Yara death still fails with real health observation', () => {
  const f = fixture();
  const y = Companions.getActor(f.state, ids.yara);
  Companions.damageCompanion(f.state, ids.yara, 12);
  observeLateMeterDamage(f.state, {
    entityType: 'actor',
    targetId: ids.yara,
    targetKind: 'companion',
    owner: 'world',
    kind: 'fire',
    healthBefore: 100,
    healthAfter: 88,
    armourBefore: 0,
    armourAfter: 0,
    x: y.x,
    y: y.y,
    z: y.z,
    sceneId: y.sceneId,
    at: f.state.time,
  });
  assert.equal(observe(f, 'protected-target-harmed'), false);
  Companions.damageCompanion(f.state, ids.yara, 1000);
  f.step(0.1);
  assert.equal(observe(f, 'protected-target-harmed'), true);
});
test('missed attacks spook only from real lastAttack and immediate actual collector perception', () => {
  const f = fixture({ stage: 'lookout', bay: true });
  const event = {
    owner: 'player',
    kind: 'hitscan',
    weapon: 'pistol',
    angle: 0,
    x: f.state.player.x,
    y: f.state.player.y,
    z: 0,
    sceneId: null,
    at: 0,
    serial: 1,
  };
  assert.equal(observeLateMeterAttack(f.state, event, f.parent).ok, false);
  f.state.player.lastAttack = {
    serial: 1,
    kind: 'hitscan',
    weapon: 'pistol',
    angle: 0,
    time: 0,
  };
  let perceived = false;
  f.parent.attacks.perceived = () => perceived;
  assert.equal(observeLateMeterAttack(f.state, event, f.parent).ok, true);
  perceived = true;
  f.step(0.1);
  assert.equal(observe(f, 'attack-before-warning', { group: 'holt-collectors' }), false);
  f.state.player.lastAttack = {
    ...f.state.player.lastAttack,
    serial: 2,
    time: 0.1,
  };
  assert.equal(
    observeLateMeterAttack(f.state, { ...event, serial: 2, at: 0.1 }, f.parent).ok,
    true,
  );
  assert.equal(observe(f, 'attack-before-warning', { group: 'holt-collectors' }), true);
});
test('missing perception never fabricates spooking or silently changes the saved attack result later', () => {
  const f = fixture();
  f.state.player.lastAttack = {
    serial: 1,
    kind: 'hitscan',
    weapon: 'pistol',
    angle: 0,
    time: 0,
  };
  f.parent.attacks.perceived = () => undefined;
  assert.equal(
    observeLateMeterAttack(
      f.state,
      {
        owner: 'player',
        kind: 'hitscan',
        weapon: 'pistol',
        angle: 0,
        x: f.state.player.x,
        y: f.state.player.y,
        z: 0,
        sceneId: null,
        at: 0,
        serial: 1,
      },
      f.parent,
    ).ok,
    false,
  );
  f.parent.attacks.perceived = () => true;
  f.step(0.1);
  assert.equal(f.state.lateMeterRuntime.active.blocked, 'collector-attack-perception-unavailable');
  assert.equal(f.state.lateMeterRuntime.run.preWarningAttack, null);
});
test('warning registration is deferred until committed director stage; wrong contact keeps original real deadline', () => {
  const f = fixture({ stage: 'warn', bay: true });
  assert.equal(f.result.ok, true);
  f.state.campaign.active.stageId = 'lookout';
  f.step(0.1);
  assert.equal(Object.keys(f.state.phoneCalls.calls).length, 0);
  f.state.campaign.active.stageId = 'warn';
  f.step(0.1);
  assert.equal(Object.keys(f.state.phoneCalls.calls).length, 1);
  const callId = f.state.lateMeterRuntime.run.warning.callId;
  const epochBeforeWrongContact = f.state.lateMeterRuntime.restoreEpoch,
    playerBeforeWrongContact = copy(f.state.player),
    companionsBeforeWrongContact = copy(f.state.companions);
  const wrong = actLateMeter(
    f.state,
    {
      type: 'dial-warning',
      method: 'phone',
      contact: 'LL-CHAR-025',
      inputReceipt: 'pointer:wrong',
    },
    f.parent,
  );
  assert.equal(f.state.lateMeterRuntime.restoreEpoch, epochBeforeWrongContact);
  assert.deepEqual(f.state.player, playerBeforeWrongContact);
  assert.deepEqual(f.state.companions, companionsBeforeWrongContact);
  assert.equal(wrong.ok, false);
  assert.equal(f.state.phoneCalls.calls[callId].definition.window.startedAt, 0);
  assert.equal(f.state.lateMeterRuntime.run.warning.method, null);
});
test('actual phone presentation/acknowledgments produce outgoing warning, never an incoming answer or timer-only success', () => {
  const f = fixture({ stage: 'warn', bay: true });
  f.step(0.1);
  assert.equal(
    actLateMeter(
      f.state,
      {
        type: 'dial-warning',
        method: 'phone',
        contact: ids.felix,
        inputReceipt: 'pointer:dial',
      },
      f.parent,
    ).ok,
    true,
  );
  f.step(0.1);
  let view = f.parent.phone.view(f.state);
  assert(view.line);
  assert.equal(
    f.parent.phone.act(f.state, { type: 'acknowledge', id: view.id, index: 0 }).ok,
    false,
  );
  for (let i = 0; i < 3; i++) {
    view = f.parent.phone.view(f.state);
    assert.equal(Phone.presentPhoneLine(f.state, view.id, view.line.index), true);
    assert.equal(
      f.parent.phone.act(f.state, {
        type: 'acknowledge',
        id: view.id,
        index: view.line.index,
      }).ok,
      true,
    );
  }
  f.step(0.1);
  assert.equal(
    observe(f, 'outgoing-call-delivered', {
      contact: ids.felix,
      topic: 'collector-warning',
    }),
    true,
  );
  assert.equal(f.state.lateMeterRuntime.run.warning.delivered.kind, 'delivered');
  assert.equal(f.state.lateMeterRuntime.run.warning.delivered.history.length, 3);
  assert.equal(validateLateMeterRuntime(f.state), true);
});
test('18-second warning clock follows actual clock and cannot reset by opening/dialing the phone', () => {
  const f = fixture({ stage: 'warn', bay: true });
  f.step(0.1);
  for (let i = 0; i < 180; i++) f.step(0.1);
  assert.equal(observe(f, 'clock-expired', { clock: 'warn' }), true);
  assert.equal(
    actLateMeter(
      f.state,
      {
        type: 'dial-warning',
        method: 'phone',
        contact: ids.felix,
        inputReceipt: 'late:dial',
      },
      f.parent,
    ).ok,
    false,
  );
  assert.equal(f.state.lateMeterRuntime.run.warning.delivered, null);
});
test('missing physical NPC driver cannot create pursuit progress or an escape by waiting', () => {
  const f = fixture({ stage: 'lookout', bay: true });
  const r = f.state.lateMeterRuntime.run;
  r.pursuit.observedOnce = true;
  r.pursuit.lastSeen = { x: 0, y: 0, z: 0, sceneId: null };
  r.pursuit.lastSeenAt = 0;
  for (let i = 0; i < 120; i++) f.step(0.1);
  assert.equal(r.pursuit.started, false);
  assert.equal(r.pursuit.escape, null);
});
test('full checkpoint snapshots exclude only director, restore same state identity and advance input/camera epoch', () => {
  const f = fixture();
  f.state.calendar = { offsetHours: 6 };
  f.state.testWallet = 123;
  const d = f.state.campaign,
    s = f.state,
    checkpoint = f.adapters.captureWorld();
  assert.equal(Object.hasOwn(checkpoint, 'campaign'), false);
  f.state.testWallet = 1;
  assert.equal(f.adapters.restoreWorld(checkpoint, { reason: 'retry:checkpoint' }).ok, true);
  assert.equal(f.state, s);
  assert.equal(f.state.campaign, d);
  assert.equal(f.state.testWallet, 123);
  assert.deepEqual(f.state.calendar, { offsetHours: 6 });
  assert.equal(lateMeterView(f.state, f.parent).inputEpoch, 1);
});
test('saved forged escape or delivery lacks geometric/chronological proof and fails validation', () => {
  const f = fixture();
  const r = f.state.lateMeterRuntime.run;
  r.pursuit = {
    ...r.pursuit,
    started: true,
    startedAt: 0,
    observedOnce: true,
    lastSeen: { x: 0, y: 0, z: 0, sceneId: null },
    lastSeenAt: 0,
    unseenSeconds: 10,
    escape: {
      id: 'forged:escape',
      at: 10,
      scope: {
        missionId: 'LL-ST-002',
        stageId: 'extract',
        attempt: 1,
        activationReceipt: 'fixture:extract',
      },
      vehicleId: r.rideId,
      pursuerVehicleId: ids.pursuer,
      driverId: ids.reeve,
      lastSeen: { x: 0, y: 0, z: 0, sceneId: null },
      lastSeenAt: 0,
      vehiclePose: { x: 1, y: 1, z: 0, sceneId: null },
      outsideRadius: 120,
      unseenSeconds: 10,
    },
  };
  f.state.time = 10;
  assert.throws(() => validateLateMeterRuntime(f.state), /Unproved/);
});
test('persistent Felix reaches real Dispatch from Dockside through two actual room/world portal legs', () => {
  const f = fixture();
  f.state.campaign.active = null;
  f.state.lateMeterRuntime.active = null;
  f.state.storyInventory = {
    version: 1,
    keys: ['dockside-tenancy'],
    evidence: [],
  };
  const felix = Companions.getActor(f.state, ids.felix);
  Object.assign(felix, {
    x: 144,
    y: 134,
    z: 0,
    sceneId: 'dockside-rooms',
    vehicleId: null,
    seat: null,
  });
  const start = { x: felix.x, y: felix.y, sceneId: felix.sceneId };
  let switched = false;
  for (let i = 0; i < 1200 && !f.state.lateMeterRuntime.preparation.ready; i++) {
    f.step(0.1, { companions: true });
    if (felix.sceneId === null) switched = true;
  }
  assert(switched, 'must physically leave Dockside first');
  assert.equal(
    f.state.lateMeterRuntime.preparation.ready,
    true,
    JSON.stringify(Companions.companionObservation(f.state, ids.felix)),
  );
  assert.equal(felix.sceneId, 'voss-dispatch');
  assert(Math.hypot(felix.x - 162, felix.y - 40) <= 10.000001);
  assert.deepEqual(start, { x: 144, y: 134, sceneId: 'dockside-rooms' });
});
test('collector approaches and recognition wait for both actual bargaining lines, within finite lookout timeout', () => {
  const f = fixture({ stage: 'lookout', bay: true });
  const reeve = Companions.getActor(f.state, ids.reeve),
    x = reeve.x;
  for (let i = 0; i < 100; i++) f.step(0.1);
  assert.equal(reeve.x, x);
  assert.equal(f.state.lateMeterRuntime.run.lookoutExchange, null);
  assert.equal(lateMeterView(f.state, f.parent).recognitionReady, false);
  f.state.campaign.active.dialogue.index = 1;
  f.step(0.1);
  assert.equal(reeve.x, x);
  f.state.campaign.active.dialogue.index = 2;
  f.step(0.1);
  assert.equal(f.state.lateMeterRuntime.run.lookoutExchange.lineCount, 2);
  assert.equal(lateMeterView(f.state, f.parent).recognitionReady, true);
  for (let i = 0; i < 10; i++) f.step(0.1);
  assert(reeve.x < x);
  assert.equal(observe(f, 'lookout-timeout', { seconds: 45 }), false);
});
test('full restart and implicit-start checkpoint retry select the real healthy taxi from restored Dispatch state', () => {
  for (const reason of ['full-mission-restart', 'checkpoint-retry']) {
    const f = fixture();
    f.state.lateMeterRuntime.active = null;
    f.state.lateMeterRuntime.run.rideId = null;
    const request = {
      ...f.request,
      attempt: 2,
      receipt: `actual:restart:${reason}`,
      reason,
    };
    assert.equal(f.adapters.activateStage(authored.stages[0], request).ok, true);
    assert.equal(f.state.lateMeterRuntime.run.rideId, f.car.id);
    assert.equal(f.state.lateMeterRuntime.active.attempt, 2);
    assert.equal(f.state.vehicles.filter((v) => v.id === f.car.id).length, 1);
  }
});
test('same-attempt Warn resume retains connected call ownership and original deadline', () => {
  const f = fixture({ stage: 'warn', bay: true });
  f.step(0.1);
  assert.equal(
    actLateMeter(
      f.state,
      {
        type: 'dial-warning',
        method: 'phone',
        contact: ids.felix,
        inputReceipt: 'real:dial',
      },
      f.parent,
    ).ok,
    true,
  );
  f.step(0.1);
  const previous = copy(f.state.lateMeterRuntime.run.warning.owner),
    callId = f.state.lateMeterRuntime.run.warning.callId;
  assert.equal(
    f.adapters.activateStage(authored.stages[2], {
      ...f.request,
      receipt: 'actual:resume:warn',
      reason: 'resume',
    }).ok,
    true,
  );
  f.step(0.1);
  assert.deepEqual(f.state.lateMeterRuntime.run.warning.owner, previous);
  assert.equal(f.state.lateMeterRuntime.run.warning.callId, callId);
  assert.equal(f.state.phoneCalls.calls[callId].definition.window.startedAt, 0);
  assert.equal(f.state.lateMeterRuntime.active.blocked, null);
});
test('retained interruption does not auto-walk Felix or restore the world while free roaming', () => {
  const f = fixture();
  const req = {
    missionId: 'LL-ST-002',
    receipt: 'actual:suspend',
    kind: 'suspend',
  };
  assert.equal(
    f.adapters.applyActions([{ type: 'mission-suspended', missionId: 'LL-ST-002' }], req).ok,
    true,
  );
  assert.equal(f.state.lateMeterRuntime.active.phase, 'suspended');
  f.state.campaign.active = null;
  f.state.campaign.suspended = [
    { missionId: 'LL-ST-002', resumeInfo: { reason: 'return-to-free-roam' } },
  ];
  const felix = Companions.getActor(f.state, ids.felix);
  Object.assign(felix, { x: 144, y: 134, sceneId: 'dockside-rooms' });
  const before = copy(f.state.companions.records.find((r) => r.id === ids.felix).order);
  for (let i = 0; i < 10; i++) f.step(0.1);
  assert.deepEqual(f.state.companions.records.find((r) => r.id === ids.felix).order, before);
  assert.equal(felix.sceneId, 'dockside-rooms');
  assert.equal(f.state.lateMeterRuntime.restoreEpoch, 0);
});
test('recognition cannot beat the45-second physical deadline between director ticks', () => {
  const f = fixture({ stage: 'lookout', bay: true });
  f.state.campaign.active.dialogue.index = 2;
  f.step(0.1);
  Object.assign(Companions.getActor(f.state, ids.reeve), { x: 347, y: 397 });
  f.state.time = 45;
  const result = actLateMeter(
    f.state,
    { type: 'recognize', actorId: ids.reeve, inputReceipt: 'late:input' },
    f.parent,
  );
  assert.equal(result.ok, false);
  assert.equal(f.state.lateMeterRuntime.run.recognition, null);
  assert.equal(observe(f, 'lookout-timeout', { seconds: 45 }), true);
});
test('authored25-second escort grace uses actual separation or blockage rather than the shared18-second generic failure flag', () => {
  const f = fixture(),
    record = f.state.companions.records.find((r) => r.id === ids.felix);
  record.failure = { kind: 'abandoned', at: 18 };
  record.separationSeconds = 18;
  f.state.time = 18;
  f.state.lateMeterRuntime.run.abandonmentSeconds = 18;
  assert.equal(observe(f, 'escort-or-vehicle-lost', { actor: ids.felix, grace: 25 }), false);
  record.separationSeconds = 25;
  f.state.time = 25;
  assert.equal(observe(f, 'escort-or-vehicle-lost', { actor: ids.felix, grace: 25 }), true);
});
test('Felix physically leaves actual Dispatch and boards the selected taxi at its marked pickup stop', () => {
  const f = fixture();
  let seat = null;
  for (let i = 0; i < 500 && !seat; i++) {
    f.step(0.1, { companions: true });
    seat = Companions.getSeat(f.state, ids.felix);
  }
  assert(seat?.alive, JSON.stringify(Companions.companionObservation(f.state, ids.felix)));
  assert.equal(seat.vehicleId, f.car.id);
  assert(seat.seat >= 1);
  assert.equal(Companions.getActor(f.state, ids.felix).sceneId, null);
  assert.equal(f.state.lateMeterRuntime.run.counterTrip.boardedAt, f.state.time);
  assert.equal(f.state.lateMeterRuntime.run.counterTrip.distance, 0);
});
test('acceptance requires the genuinely acquired working taxi at actual Dispatch before escort grace begins', () => {
  const f = fixture({ bay: true });
  assert.equal(f.result.ok, false);
  assert(f.result.unmet.includes('bring-working-taxi-to-dispatch-before-accepting'));
  assert.equal(f.state.lateMeterRuntime.active, null);
  assert.equal(Companions.getSeat(f.state, ids.felix), null);
});
