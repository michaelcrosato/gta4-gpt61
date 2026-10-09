/** Actual shared companion leases, approach and interpolation on a declared
 * synthetic flat physical context. No Harbor City or full M3 progress claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/companions.js';
import {
  initializeTwoSeatsRuntime,
  tickTwoSeatsRuntime,
} from '../src/campaign/two-seats-runtime.js';
const F = 'LL-CHAR-002',
  N = 'LL-CHAR-008',
  T = 'LL-CHAR-025';
function fixture({ order = [N, T], priorSeat = null, priorCar = null } = {}) {
  const car = {
      id: 'actual-current-car',
      spec: 'taxi',
      x: 80,
      y: 80,
      z: 0,
      groundZ: 0,
      sceneId: null,
      angle: 0,
      speed: 0,
      health: 100,
    },
    other = { ...car, id: 'actual-other-car', x: 180 };
  const s = {
    time: 0,
    sequence: 0,
    player: { x: 80, y: 80, z: 0, health: 100, vehicleId: car.id },
    wanted: { level: 0 },
    vehicles: [car, other],
    campaign: null,
    respawnTimer: 0,
  };
  const cc = {
    specs: { taxi: { length: 29, width: 15, seats: 4 } },
    sceneExists: (id) => id === null,
    resolveActor: (id) => (id === 'player' ? s.player : C.getActor(s, id)),
    isBlocked: () => false,
    hasLineOfSight: () => true,
    surfaceHeight: () => 0,
    findRoute: (_actor, target) => [{ ...target }],
    moveBody: (actor, dx, dy) => {
      actor.x += dx;
      actor.y += dy;
      return false;
    },
  };
  for (const [id, x, y] of [
    [F, 72, 110],
    [N, 115, 115],
    [T, 50, 120],
  ])
    C.ensureNamedActor(s, { id, name: id, x, y, z: 0, sceneId: null, health: 100 }, cc);
  const physicalStep = () => {
    s.time += 0.05;
    C.updateCompanions(s, 0.05, cc);
  };
  C.requestBoardSlot(s, F, car.id, 2, cc);
  for (let n = 0; n < 200 && !C.getSeat(s, F); n++) physicalStep();
  assert.equal(C.getSeat(s, F)?.seat, 2);
  if (priorSeat) {
    const target = priorCar === 'other' ? other : car;
    C.requestBoardSlot(s, N, target.id, priorSeat, cc);
    for (let n = 0; n < 200 && !C.getSeat(s, N); n++) physicalStep();
    assert.equal(C.getSeat(s, N)?.seat, priorSeat);
  }
  const m = initializeTwoSeatsRuntime(s);
  m.active = {
    missionId: 'LL-ST-003',
    stageId: 'pickup',
    attempt: 1,
    receipt: 'fixture:pickup',
    startedAt: s.time,
    phase: 'running',
    blocked: null,
  };
  m.run.startedAt = s.time;
  m.preparation.nadia.ready = true;
  const requests = [];
  const p = {
    bindings: {
      'boardwalk-station': {
        bay: { x: 50, y: 50, z: 0, w: 60, h: 60, maxSpeed: 5 },
        boardingOrder: order,
      },
    },
    companionContext: cc,
    vehicles: { specs: cc.specs, availableRide: () => car },
    observations: { playerArrested: () => false },
    passengers: {
      ...C,
      requestBoardSlot: (state, id, vehicleId, seat, context) => {
        requests.push({ id, vehicleId, seat, at: state.time, nadia: C.getSeat(state, N) });
        return C.requestBoardSlot(state, id, vehicleId, seat, context);
      },
    },
  };
  const tick = () => tickTwoSeatsRuntime(s, 0.05, p);
  return { s, m, p, car, other, cc, requests, physicalStep, tick };
}
test('Tess is withheld during actual Nadia reservation/approach/boarding and requested only after living same-car seat1 occupancy', () => {
  const f = fixture();
  f.tick();
  const reserved = C.companionObservation(f.s, N);
  assert.equal(reserved.reservedSeat, 1);
  assert.equal(reserved.seated, false);
  assert.equal(
    f.requests.some((x) => x.id === T),
    false,
  );
  const phases = new Set();
  for (let n = 0; n < 200 && !C.getSeat(f.s, N); n++) {
    f.physicalStep();
    phases.add(C.companionObservation(f.s, N).phase);
    f.tick();
    if (!C.getSeat(f.s, N))
      assert.equal(
        f.requests.some((x) => x.id === T),
        false,
      );
  }
  assert(phases.has('approaching'));
  assert(phases.has('boarding'));
  const seat = C.getSeat(f.s, N);
  assert.equal(seat.vehicleId, f.car.id);
  assert.equal(seat.seat, 1);
  assert.equal(seat.alive, true);
  f.tick();
  const request = f.requests.find((x) => x.id === T);
  assert(request);
  assert.equal(request.seat, 3);
  assert.equal(request.nadia.vehicleId, f.car.id);
  assert.equal(request.nadia.seat, 1);
  assert.equal(request.nadia.alive, true);
  assert.equal(f.m.run.pickup.boarded, null, 'a Tess command is not a completed pickup');
});
test('an actual same-car wrong slot or another-car occupied seat1 cannot release Tess boarding', () => {
  for (const prior of [{ priorSeat: 3 }, { priorSeat: 1, priorCar: 'other' }]) {
    const f = fixture(prior);
    f.tick();
    assert.equal(
      f.requests.some((x) => x.id === T),
      false,
    );
    assert.equal(f.m.run.pickup.boarded, null);
  }
});
test('changed or unknown boarding order explicitly blocks without Tess reservation or successful pickup', () => {
  for (const order of [[T, N], [N], null]) {
    const f = fixture({ order });
    f.tick();
    assert.equal(f.m.active.blocked, 'actual-two-seats-boarding-order-unregistered');
    assert.equal(
      f.requests.some((x) => x.id === T),
      false,
    );
    assert.equal(C.companionObservation(f.s, T).reservedVehicleId, null);
    assert.equal(f.m.run.pickup.boarded, null);
  }
});
