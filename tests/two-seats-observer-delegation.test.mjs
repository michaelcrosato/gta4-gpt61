/** Production guard/disarm plus explicit callback-registry contract fixtures.
 * Contract owner metadata below is not a mission start/completion observation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSimulation,
  fireWeapon,
  updateSimulation,
  setCampaignObservationHandlers,
  saveGame,
} from '../src/simulation.js';
import {
  guardedDisarm,
  captureProductionDisarm,
  restoreDisarmBoundary,
} from './helpers/two-seats-native-fixture.mjs';
test('wrapped real production disarm commits exact8once and held/repressed input cannot duplicate injury or drop', () => {
  const live = guardedDisarm(),
    proof = live.dax.disarmReceipt,
    capture = captureProductionDisarm(live.s);
  try {
    updateSimulation(live.s, 1 / 60, { block: true, disarm: true, aimAngle: Math.PI });
    updateSimulation(live.s, 1 / 60, { block: true, aimAngle: Math.PI });
    updateSimulation(live.s, 1 / 60, { block: true, disarm: true, aimAngle: Math.PI });
    assert.equal(capture.observed.disarms.length, 0);
    assert.equal(capture.observed.damage.length, 0);
    assert.equal(live.dax.health, 92);
    assert.equal(
      live.s.twoSeatsRuntime.run.damageEvents.filter((e) => e.kind === 'guard-disarm-wrist').length,
      1,
    );
    assert.equal(live.s.pickups.filter((p) => p.id === proof.dropId).length, 1);
    assert.equal(live.s.player.lastDisarm.id, proof.id);
  } finally {
    capture.stop();
  }
});
test('genuine fatal clamped live injury stays dead while captured valid bytes create a separate preinjury fixture', () => {
  const live = guardedDisarm({ daxHealth: 4 }),
    before = saveGame(live.s),
    fixture = restoreDisarmBoundary(live);
  assert.equal(live.dax.health, 0);
  assert.equal(live.s.twoSeatsRuntime.run.injury.damageRequested, 8);
  assert.equal(live.s.twoSeatsRuntime.run.injury.damageApplied, 4);
  assert.equal(live.s.twoSeatsRuntime.run.injury.fatal, true);
  assert.equal(fixture.dax.health, 4);
  assert.equal(fixture.s.twoSeatsRuntime.run.injury, null);
  assert.notEqual(fixture.s, live.s);
  assert.equal(saveGame(live.s), before);
  assert(fixture.fixtureBoundary.startsWith('NEW restored'));
});
function registryFixture() {
  const state = createSimulation(321);
  state.campaign = { active: { missionId: 'LL-ST-002' } }; // Declared dispatch-owner contract only.
  return state;
}
test('previous handler copy delegates the same actual public attack once and input registration objects are isolated', () => {
  const state = registryFixture(),
    old = [],
    wrapped = [],
    poison = [],
    original = (event) => old.push(event),
    supplied = { attack: original };
  assert.equal(setCampaignObservationHandlers(state, 'LL-ST-002', supplied), null);
  let previous;
  const wrapper = (event) => {
      wrapped.push(event);
      return previous.attack(event);
    },
    replacement = { attack: wrapper };
  previous = setCampaignObservationHandlers(state, 'LL-ST-002', replacement);
  assert.notEqual(previous, supplied);
  assert.equal(previous.attack, original);
  supplied.attack = (event) => poison.push(event);
  replacement.attack = (event) => poison.push(event);
  assert.equal(fireWeapon(state), true);
  assert.equal(old.length, 1);
  assert.equal(wrapped.length, 1);
  assert.equal(poison.length, 0);
  assert.equal(old[0], wrapped[0]);
  assert.equal(old[0].serial, state.player.lastAttack.serial);
  const removed = setCampaignObservationHandlers(state, 'LL-ST-002', null);
  assert.notEqual(removed, replacement);
  assert.equal(removed.attack, wrapper);
  removed.attack = () => poison.push('mutated-return');
  assert.equal(setCampaignObservationHandlers(state, 'LL-ST-002', null), null);
});
test('removal returns a detached previous set and leaves no observer to receive a subsequent real public attack', () => {
  const state = registryFixture(),
    events = [],
    handlers = { attack: (event) => events.push(event) };
  assert.equal(setCampaignObservationHandlers(state, 'LL-ST-002', handlers), null);
  const removed = setCampaignObservationHandlers(state, 'LL-ST-002', null);
  assert.notEqual(removed, handlers);
  assert.equal(removed.attack, handlers.attack);
  removed.attack = () => events.push('poison');
  assert.equal(fireWeapon(state), true);
  assert.equal(events.length, 0);
  assert.equal(setCampaignObservationHandlers(state, 'LL-ST-002', null), null);
});
