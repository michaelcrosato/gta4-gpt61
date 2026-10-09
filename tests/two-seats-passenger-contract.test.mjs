/** Synthetic callback-observation contracts only. These are not a native route,
 * full campaign run or physical completion claim. Native boarding is tested separately. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeTwoSeatsRuntime,
  tickTwoSeatsRuntime,
  validateTwoSeatsRuntime,
  createTwoSeatsAdapters,
} from '../src/campaign/two-seats-runtime.js';
import { FIRST_ARC_MISSIONS } from '../src/campaign/first-arc.js';
const F = 'LL-CHAR-002',
  N = 'LL-CHAR-008',
  T = 'LL-CHAR-025';
const clone = (v) => structuredClone(v);
function fixture() {
  const car = {
    id: 'real-observed-four-seat',
    spec: 'taxi',
    x: 752,
    y: 308,
    z: 0,
    sceneId: null,
    angle: Math.PI / 2,
    speed: 0,
    health: 76,
  };
  const s = {
    time: 10,
    player: { ...car, id: 'player', health: 100, vehicleId: car.id },
    wanted: { level: 0 },
    vehicles: [car],
    calendar: { version: 1, startHours: 20.25, offsetHours: 0, sleptHours: 0, receipts: {} },
    campaign: {
      active: {
        missionId: 'LL-ST-003',
        stageId: 'home',
        attempt: 1,
        phase: 'running',
        dialogue: {
          index: 5,
          lines: Array.from({ length: 5 }, () => ({
            speaker: 'fixture',
            text: 'previously acknowledged fixture line',
          })),
        },
      },
    },
  };
  const m = initializeTwoSeatsRuntime(s),
    scope = (stage) => ({
      missionId: 'LL-ST-003',
      stageId: stage,
      attempt: 1,
      activationReceipt: `campaign:cbf05190:LL-ST-003:attempt:1:activate:${stage}:1`,
    });
  m.active = {
    ...scope('home'),
    receipt: scope('home').activationReceipt,
    startedAt: 10,
    phase: 'running',
    blocked: null,
  };
  delete m.active.activationReceipt;
  m.run.startedAt = 10;
  m.run.rideId = car.id;
  for (const stage of ['pickup', 'home']) {
    const q = scope(stage);
    m.activations[q.activationReceipt] = { scope: q, at: 10 };
  }
  const actors = Object.fromEntries(
    [F, N, T].map((id) => [
      id,
      {
        id,
        alive: true,
        health: 100,
        x: car.x,
        y: car.y,
        z: 0,
        sceneId: null,
        seated: true,
        vehicleId: car.id,
        seat: id === F ? 2 : id === N ? 1 : 3,
        blockedSeconds: 0,
        separationSeconds: 0,
      },
    ]),
  );
  const getSeat = (_s, id) =>
    actors[id]?.seated
      ? {
          actorId: id,
          vehicleId: actors[id].vehicleId,
          seat: actors[id].seat,
          alive: actors[id].alive,
          pose: { x: actors[id].x, y: actors[id].y, z: 0, sceneId: actors[id].sceneId },
        }
      : null;
  m.run.pickup.boarded = {
    id: 'two-seats:fixture:boarded',
    at: 10,
    scope: scope('pickup'),
    vehicleId: car.id,
    vehiclePose: { x: 752, y: 308, z: 0, sceneId: null },
    seats: [F, N, T].map((id) => getSeat(s, id)),
  };
  const calls = { board: [], escort: [], exit: [] };
  const target = { x: 72, y: 158, z: 0, sceneId: 'tess-flat', radius: 10 };
  const p = {
    ready: {},
    observations: { playerArrested: () => false },
    companionContext: {},
    bindings: {
      'tess-flat': { bay: { x: 740, y: 286, w: 24, h: 44, maxSpeed: 5 }, dropoffTarget: target },
      dispatch: {
        stop: { x: 417, y: 725, w: 46, h: 46, maxSpeed: 5 },
        felixTarget: { x: 170, y: 44, z: 0, sceneId: 'voss-dispatch', radius: 10 },
      },
    },
    vehicles: { specs: { taxi: { seats: 4, length: 29, width: 15 } }, availableRide: () => car },
    passengers: {
      companionObservation: (_s, id) => actors[id] ?? null,
      getActor: (_s, id) => actors[id] ?? null,
      getSeat,
      vehicleOccupants: () => [F, N, T].map((id) => getSeat(s, id)).filter(Boolean),
      requestBoardSlot: (_s, id, vehicle, seat) => {
        calls.board.push({ id, vehicle, seat });
        return { ok: true };
      },
      requestExit: (_s, id) => {
        calls.exit.push(id);
        return { ok: true };
      },
      requestEscort: (_s, id, to) => {
        calls.escort.push({ id, target: clone(to) });
        return { ok: true };
      },
    },
  };
  const tick = (after) => {
    if (after) after();
    s.time += 0.1;
    tickTwoSeatsRuntime(s, 0.1, p);
  };
  return { s, m, p, actors, car, calls, tick, target };
}
test('accepted exit request cannot count as physical exit or ordered delivery; repeated ticks keep its escort intention', () => {
  const f = fixture();
  f.tick();
  assert(f.m.run.exitRequests[T]);
  assert.equal(f.m.run.exitObservations[T], undefined);
  assert.deepEqual(f.m.run.dropoffs, []);
  assert.equal(f.actors[T].seated, true);
  f.calls.board = [];
  for (let i = 0; i < 8; i++) f.tick();
  assert.equal(
    f.calls.board.some((c) => c.id === T),
    false,
  );
  assert(f.calls.escort.length > 1);
  assert(f.calls.escort.every((c) => c.id === T && c.target.sceneId === 'tess-flat'));
  assert.equal(f.m.run.exitRequests[T].at, 10.1);
  assert.equal(validateTwoSeatsRuntime(f.s), true);
});
test('actual supplied unseating and later target arrival have separate times and preserve parking-at-exit after Mara leaves', () => {
  const f = fixture();
  f.tick();
  const parkedPose = clone(f.m.run.exitRequests[T].vehiclePose);
  f.tick(() => Object.assign(f.actors[T], { seated: false, vehicleId: null, x: 735.5, y: 301.91 }));
  const exit = f.m.run.exitObservations[T];
  assert(exit.at > f.m.run.exitRequests[T].at);
  assert.deepEqual(f.m.run.dropoffs, []);
  f.calls.board = [];
  f.tick(() => {
    f.car.x = 800;
    f.car.y = 340;
    f.car.speed = 30;
  });
  assert.equal(
    f.calls.board.some((c) => c.id === T),
    false,
  );
  assert.equal(f.m.run.dropoffs.length, 0);
  f.tick(() => Object.assign(f.actors[T], { ...f.target }));
  const delivered = f.m.run.dropoffs[0];
  assert.equal(delivered.actorId, T);
  assert.equal(delivered.exitObservedAt, exit.at);
  assert(delivered.at > exit.at);
  assert.deepEqual(delivered.vehiclePose, parkedPose);
  assert.equal(delivered.exitObservationId, exit.id);
  assert.equal(validateTwoSeatsRuntime(f.s), true);
});
test('Nadia cannot begin delivery before Tess reaches her actual target; moving car or wanted status cannot create an exit proof', () => {
  const f = fixture();
  f.car.speed = 12;
  f.tick();
  assert.deepEqual(f.m.run.exitRequests, {});
  f.car.speed = 0;
  f.s.wanted.level = 1;
  f.tick();
  assert.deepEqual(f.m.run.exitRequests, {});
  f.s.wanted.level = 0;
  f.tick();
  assert(f.m.run.exitRequests[T]);
  assert.equal(f.m.run.exitRequests[N], undefined);
  f.tick(() => Object.assign(f.actors[T], { seated: false, vehicleId: null, x: 735.5, y: 301.91 }));
  assert.equal(f.m.run.exitRequests[N], undefined);
  assert.equal(f.m.run.dropoffs.length, 0);
});
test('save validation rejects missing exit, reordered actors or altered target references', () => {
  const f = fixture();
  f.tick();
  f.tick(() => Object.assign(f.actors[T], { ...f.target, seated: false, vehicleId: null }));
  assert.equal(validateTwoSeatsRuntime(f.s), true);
  for (const mutate of [
    (s) => delete s.twoSeatsRuntime.run.exitObservations[T],
    (s) => (s.twoSeatsRuntime.run.dropoffs[0].actorId = N),
    (s) => (s.twoSeatsRuntime.run.dropoffs[0].exitObservedAt -= 0.1),
    (s) => (s.twoSeatsRuntime.run.dropoffs[0].target.x += 100),
  ]) {
    const saved = clone(f.s);
    mutate(saved);
    assert.throws(() => validateTwoSeatsRuntime(saved));
  }
});
test('legitimate saved Felix shop escort excludes separation, while real blocked duration and a different intent still fail', () => {
  const f = fixture(),
    mark = { x: 170, y: 186, z: 0, sceneId: 'pier-goods', radius: 8 };
  // Declared callback fixture; actual Pier Goods portal/body coverage awaits its
  // registration. This checks the specific exemption, not a physical room visit.
  f.s.player.vehicleId = null;
  f.s.player.sceneId = 'pier-goods';
  f.s.campaign.active.stageId = 'workwear';
  const scope = {
    missionId: 'LL-ST-003',
    stageId: 'workwear',
    attempt: 1,
    activationReceipt: 'fixture:workwear',
  };
  Object.assign(f.m.active, { stageId: 'workwear', receipt: scope.activationReceipt });
  f.m.activations[scope.activationReceipt] = { scope, at: f.s.time };
  f.s.companions = { time: 0, records: [{ id: F, order: { kind: 'idle' }, afterExit: null }] };
  f.p.bindings['pier-goods'] = {
    roomId: 'pier-goods',
    felixMark: mark,
    hook: { x: 132, y: 166, z: 0, sceneId: 'pier-goods' },
  };
  f.p.clothing = { grantVoucher: () => ({ ok: false }), verify: () => false };
  f.actors[F].phase = 'waiting-exit';
  f.actors[F].separationSeconds = 36;
  f.p.passengers.requestEscort = (_s, id, target) => {
    if (id === F) f.s.companions.records[0].afterExit = { kind: 'escort', target: clone(target) };
    return { ok: true };
  };
  f.tick();
  const rule = FIRST_ARC_MISSIONS[2].failures.find((x) => x.id === 'required-felix-lost').condition,
    lost = () => createTwoSeatsAdapters(f.s, f.p).observe(rule, { missionId: 'LL-ST-003' });
  assert(f.m.run.shopEscort);
  assert.equal(f.m.run.abandonment[F], 0);
  assert.equal(lost(), false);
  f.actors[F].blockedSeconds = 35;
  assert.equal(lost(), true);
  f.actors[F].blockedSeconds = 0;
  f.s.companions.records[0].afterExit.target = { ...mark, x: 40 };
  assert.equal(lost(), true, 'a different saved intent cannot borrow the shop-transfer exemption');
});
