/** Native combat component checks. A declared condition callback supplies the
 * policy; the authored injury receipt/whole-save path is tested by its owner.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, updateSimulation, saveGame, restoreGame } from '../src/simulation.js';
import { startActorMelee, WEAPONS } from '../src/combat.js';
import { ensureNamedActor } from '../src/companions.js';
const BASE = createSimulation(2026);
function fixture(condition) {
  const s = structuredClone(BASE);
  s.mission = null;
  s.dialogue = null;
  s.hostiles = [];
  s.police = [];
  s.vehicles = [];
  s.pedestrians = [];
  Object.assign(s.player, { x: 780, y: 700, z: 0, groundZ: 0, angle: 0 });
  const actor = ensureNamedActor(s, {
    id: 'LL-ARC-DAX',
    name: 'Dax',
    x: 798,
    y: 700,
    z: 0,
    sceneId: null,
    health: 92,
    weapon: 'unarmed',
    angle: Math.PI,
  });
  return { s, actor, ctx: { handImpairment: () => condition } };
}
function tick(s, duration) {
  for (let i = 0; i < Math.round(duration * 100); i++) updateSimulation(s, 0.01, {});
}
const condition = Object.freeze({
  affectedHand: 'right',
  active: true,
  damageScale: 0.5,
  recoveryScale: 1.5,
});
test('impaired right fist hits at the original frame for half actual harm and cannot attack during added recovery', () => {
  const { s, actor, ctx } = fixture(condition);
  assert(startActorMelee(s, actor, 'unarmed', ctx, { hand: 'right' }));
  assert.equal(actor.meleeAction.hand, 'right');
  const health = s.player.health;
  tick(s, 0.1);
  assert.equal(s.player.health, health);
  tick(s, 0.03);
  assert(Math.abs(s.player.health - (health - 4.8)) < 1e-8);
  tick(s, 0.32);
  assert.equal(startActorMelee(s, actor, 'unarmed', ctx), false);
  tick(s, 0.15);
  assert.equal(actor.meleeAction, null);
  assert.equal(actor.fireCooldown, 0);
  assert(startActorMelee(s, actor, 'unarmed', ctx));
  assert.equal(actor.health, 92, 'an attack never treats the injured body');
});
test('left fist and expired right impairment retain their full actual damage and original recovery', () => {
  for (const [hand, view] of [
    ['left', condition],
    ['right', { ...condition, active: false }],
  ]) {
    const { s, actor, ctx } = fixture(view);
    assert(startActorMelee(s, actor, 'unarmed', ctx, { hand }));
    assert.equal(actor.meleeAction.duration, WEAPONS.unarmed.fireInterval);
    tick(s, 0.13);
    assert(Math.abs(s.player.health - 90.4) < 1e-8);
    tick(s, 0.31);
    assert.equal(actor.meleeAction, null);
    assert.equal(actor.fireCooldown, 0);
  }
});
test('an in-flight impaired strike keeps actual hand, hit timing and half harm through native save/Continue', () => {
  const { s, actor, ctx } = fixture(condition);
  assert(startActorMelee(s, actor, 'unarmed', ctx));
  tick(s, 0.05);
  const restored = restoreGame(saveGame(s)),
    continued = restored.companions.actors.find((a) => a.id === actor.id);
  assert.deepEqual(continued.meleeAction, actor.meleeAction);
  tick(restored, 0.08);
  assert(Math.abs(restored.player.health - 95.2) < 1e-8);
  assert.equal(continued.meleeAction.hand, 'right');
  assert.equal(continued.health, 92);
});
test('invalid hand or active policy is rejected before any stamina, attack or cooldown mutation', () => {
  for (const [hand, view] of [
    ['both', condition],
    ['right', { ...condition, damageScale: NaN }],
    ['right', { ...condition, recoveryScale: 0 }],
  ]) {
    const { s, actor, ctx } = fixture(view),
      before = structuredClone(actor);
    assert.equal(startActorMelee(s, actor, 'unarmed', ctx, { hand }), false);
    assert.deepEqual(actor, before);
  }
});
