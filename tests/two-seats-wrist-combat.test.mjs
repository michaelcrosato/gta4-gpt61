/** Actual native melee + actual committed parent injury/calendar checks.
 * Declared Dispatch duel setup and component calendar-rest APIs; no full M3 claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { guardedDisarm } from './helpers/two-seats-native-fixture.mjs';
import { updateSimulation } from '../src/simulation.js';
import { startActorMelee, WEAPONS } from '../src/combat.js';
import { getActor } from '../src/companions.js';
import { applyRestHours } from '../src/calendar.js';
import { observeTwoSeatsDisarm } from '../src/campaign/two-seats-runtime.js';
import {
  twoSeatsWristView,
  validateTwoSeatsParentState,
} from '../src/campaign/two-seats-parent-context.js';

test('genuinely injured right wrist halves actual strike harm and adds recovery through full physical checkpoint; left and actual48h expiry stay normal', () => {
  const f = guardedDisarm();
  assert(observeTwoSeatsDisarm(f.s, f.dax.disarmReceipt, f.parent).ok);
  const injury = structuredClone(f.s.twoSeatsRuntime.run.injury),
    health = { felix: f.health.felix, nadia: f.health.nadia, money: f.health.money };
  const step = (seconds) => {
    for (let n = 0; n < Math.round(seconds * 100); n++) updateSimulation(f.s, 0.01, {});
  };
  step(1.2); // Actual committed disarm stagger must end; no stagger/cooldown edits.
  let dax = getActor(f.s, 'LL-ARC-DAX');
  assert.equal(dax.health, 92);
  const before = f.s.player.health;
  assert(startActorMelee(f.s, dax, 'unarmed', f.ctx, { hand: 'right' }));
  assert.equal(dax.meleeAction.hand, 'right');
  assert.equal(dax.meleeAction.windup, WEAPONS.unarmed.windup);
  assert(Math.abs(dax.meleeAction.duration - 0.585) < 1e-9);
  step(0.05);
  const checkpoint = f.parent.snapshots.capture(f.s, { exclude: ['campaign'] });
  const flight = structuredClone(dax.meleeAction),
    director = f.s.campaign;
  assert(
    f.parent.snapshots.restore(f.s, checkpoint, { reason: 'declared-component-checkpoint' }).ok,
  );
  assert.equal(f.s.campaign, director);
  dax = getActor(f.s, 'LL-ARC-DAX');
  assert.deepEqual(dax.meleeAction, flight);
  step(0.05);
  assert.equal(f.s.player.health, before, 'original hit frame is preserved');
  step(0.03);
  assert(Math.abs(f.s.player.health - (before - 4.8)) < 1e-8);
  step(0.32);
  assert.equal(startActorMelee(f.s, dax, 'unarmed', f.ctx, { hand: 'right' }), false);
  step(0.15);
  assert.equal(dax.meleeAction, null);
  const leftBefore = f.s.player.health;
  assert(startActorMelee(f.s, dax, 'unarmed', f.ctx, { hand: 'left' }));
  assert.equal(dax.meleeAction.duration, WEAPONS.unarmed.fireInterval);
  step(0.13);
  assert(Math.abs(f.s.player.health - (leftBefore - 9.6)) < 1e-8);
  step(0.31);
  assert(applyRestHours(f.s, 24, 'component:wrist-expiry-one').ok);
  assert(applyRestHours(f.s, 24, 'component:wrist-expiry-two').ok);
  const view = twoSeatsWristView(f.s);
  assert.equal(view.active, false);
  assert.equal(view.damageScale, 1);
  assert.equal(view.recoveryScale, 1);
  assert.equal(view.bandageVisible, true);
  assert.equal(dax.health, 92);
  const expiredBefore = f.s.player.health;
  assert(startActorMelee(f.s, dax, 'unarmed', f.ctx, { hand: 'right' }));
  assert.equal(dax.meleeAction.duration, WEAPONS.unarmed.fireInterval);
  step(0.13);
  assert(Math.abs(f.s.player.health - (expiredBefore - 9.6)) < 1e-8);
  assert.deepEqual(f.s.twoSeatsRuntime.run.injury, injury);
  assert.deepEqual(
    {
      felix: getActor(f.s, 'LL-CHAR-002').health,
      nadia: getActor(f.s, 'LL-CHAR-008').health,
      money: f.s.player.money,
    },
    health,
  );
  assert.equal(validateTwoSeatsParentState(f.s), true);
  assert.equal(f.s.campaign.completed['LL-ST-003'], undefined);
});
