/** Genuine completed-save body/vehicle physics. Directorless pickup ownership is
 * an explicit component fixture; no source stage or whole M3 completion claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/two-seats-native-fixture.mjs';
import { updateSimulation } from '../src/simulation.js';
import { setInteriorDoor, INTERIOR_LAYOUTS } from '../src/interiors.js';
import { getActor, companionObservation, getSeat } from '../src/companions.js';
import { FIRST_ARC_MISSIONS } from '../src/campaign/first-arc.js';
import {
  initializeTwoSeatsRuntime,
  tickTwoSeatsRuntime,
  createTwoSeatsAdapters,
} from '../src/campaign/two-seats-runtime.js';
const F = 'LL-CHAR-002';
function pickupFixture({ locked = false } = {}) {
  const f = fixture();
  // Setup-only directorless component ownership leaves genuine player/car/Felix
  // health and positions untouched. The published 4-stage campaign is not run.
  f.s.campaign = null;
  f.s.campaignMode = 'legacy';
  const m = initializeTwoSeatsRuntime(f.s),
    scope = {
      missionId: 'LL-ST-003',
      stageId: 'pickup',
      attempt: 1,
      activationReceipt: 'fixture:physical-felix-pickup',
    };
  m.active = {
    ...scope,
    receipt: scope.activationReceipt,
    startedAt: f.s.time,
    phase: 'running',
    blocked: null,
  };
  delete m.active.activationReceipt;
  m.run.startedAt = f.s.time;
  m.activations[scope.activationReceipt] = { scope, at: f.s.time };
  if (locked) {
    // Actual room door policy is the declared initial obstruction. No fake
    // blocked flag/clock is written; normal route queries discover the lock.
    const room = { ...f.s, interior: { ...f.s.interior, active: { roomId: 'voss-dispatch' } } };
    assert.equal(
      setInteriorDoor(room, INTERIOR_LAYOUTS['voss-dispatch'].doors.find((d) => d.exit).id, {
        open: false,
        locked: true,
      }),
      true,
    );
  }
  const rule = FIRST_ARC_MISSIONS[2].failures.find((x) => x.id === 'required-felix-lost').condition,
    adapters = createTwoSeatsAdapters(f.s, f.parent),
    history = [];
  const step = () => {
    updateSimulation(f.s, 0.1, {});
    tickTwoSeatsRuntime(f.s, 0.1, f.parent);
    history.push(companionObservation(f.s, F));
  };
  return {
    ...f,
    m,
    rule,
    adapters,
    history,
    step,
    lost: () => adapters.observe(rule, { missionId: 'LL-ST-003' }),
  };
}
test('existing living Felix physically exits Dispatch and reaches real seat2 without triggering lost-passenger failure', () => {
  const f = pickupFixture(),
    health = getActor(f.s, F).health,
    car = f.s.player.vehicleId;
  assert.equal(companionObservation(f.s, F).sceneId, 'voss-dispatch');
  for (let n = 0; n < 200 && !getSeat(f.s, F); n++) {
    f.step();
    assert.equal(f.lost(), false);
  }
  assert.equal(getSeat(f.s, F)?.vehicleId, car);
  assert.equal(getSeat(f.s, F)?.seat, 2);
  assert(f.history.some((x) => x.sceneId === null && x.phase !== 'seated'));
  assert.equal(getActor(f.s, F).health, health);
  assert.equal(f.s.player.money, f.health.money);
  assert.equal(f.m.run.dropoffs.length, 0);
});
test('a real locked exit strands the living Felix; actual blocked/separation clocks reach authored35s without any timer write', () => {
  const f = pickupFixture({ locked: true }),
    start = f.s.time,
    health = getActor(f.s, F).health;
  for (let n = 0; n < 349; n++) {
    f.step();
    assert.equal(
      f.lost(),
      false,
      JSON.stringify({
        elapsed: f.s.time - start,
        clock: f.s.companions.time,
        obs: companionObservation(f.s, F),
        local: f.m.run.abandonment[F],
      }),
    );
  }
  for (let n = 0; n < 5 && !f.lost(); n++) f.step();
  assert.equal(f.lost(), true);
  assert(f.s.time - start >= 35 - 1e-6);
  const observed = companionObservation(f.s, F);
  assert.equal(observed.alive, true);
  assert.equal(observed.sceneId, 'voss-dispatch');
  assert(observed.blockedSeconds > 0 || observed.separationSeconds > 0);
  assert.equal(getSeat(f.s, F), null);
  assert.equal(getActor(f.s, F).health, health);
  assert.equal(f.s.player.money, f.health.money);
  assert.equal(f.m.run.dropoffs.length, 0);
});
