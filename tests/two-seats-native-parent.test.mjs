/** Declared Dispatch native-component fixture, not registered/full M3 completion.
 * After initial fixture/real director ownership, combat and retreat advance through
 * actual updateSimulation controls and canonical physical parent callbacks only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, ownThreat } from './helpers/two-seats-native-fixture.mjs';
import * as Companions from '../src/companions.js';
import * as Named from '../src/named-hostility.js';
import {
  updateSimulation,
  damageStoryActor,
  namedHostilityContext,
  setCampaignObservationHandlers,
} from '../src/simulation.js';
import { advanceCampaignDialogue } from '../src/campaign/director.js';
import {
  tickTwoSeatsRuntime,
  observeTwoSeatsDamage,
  observeTwoSeatsDisarm,
  validateTwoSeatsRuntime,
} from '../src/campaign/two-seats-runtime.js';
import {
  createTwoSeatsParentContext,
  validateTwoSeatsParentState,
  twoSeatsWristView,
} from '../src/campaign/two-seats-parent-context.js';

test('production parent registers actual canonical threats, preserves every line, and observes native guard/disarm/8damage/physical retreat', () => {
  const f = fixture({ combat: true });
  const m = ownThreat(f);
  for (const definition of f.parent.actors
    .definitions()
    .filter((d) => d.sceneId === 'voss-dispatch'))
    Companions.ensureNamedActor(f.s, definition, f.cc);
  const target = {
    ...f.engine.bindings.dispatch.encounter.exteriorRetreat.at(-1),
    sceneId: null,
    radius: 6,
  };
  f.engine.ready.hostility = true;
  f.engine.enemies = {
    ready: true,
    register: Named.registerNamedHostile,
    engage: Named.engageNamedHostile,
    retreat: (s, id, destination, scope) =>
      Named.requestNamedRetreat(s, id, destination, scope, {
        ...namedHostilityContext(s),
        allowedRetreatTarget: (actor, p) =>
          ['LL-ARC-DAX', 'LL-ARC-PEL'].includes(actor) &&
          JSON.stringify(p) === JSON.stringify(target),
      }),
    release: Named.releaseNamedHostile,
    observe: Named.namedHostileObservation,
  };
  f.engine.damageActor = (s, id, amount, cause) =>
    damageStoryActor(s, id, amount, cause.owner, cause.kind);
  const parent = createTwoSeatsParentContext(f.s, f.engine),
    observed = { disarms: [], damage: [] };
  setCampaignObservationHandlers(f.s, 'LL-ST-003', {
    disarm: (receipt) => {
      observed.disarms.push(receipt);
      const result = observeTwoSeatsDisarm(f.s, receipt, parent);
      assert(result.ok, JSON.stringify(result));
    },
    damage: (event) => {
      observed.damage.push(event);
      const result = observeTwoSeatsDamage(f.s, event, parent);
      assert(result.ok, JSON.stringify(result));
    },
  });
  const step = (input = {}) => {
    updateSimulation(f.s, 1 / 60, input);
    tickTwoSeatsRuntime(f.s, 1 / 60, parent);
  };
  step();
  for (const id of ['LL-ARC-DAX', 'LL-ARC-PEL'])
    assert.equal(Named.namedHostileObservation(f.s, id).mode, 'threat');
  assert.equal(f.s.campaign.active.dialogue.index, 0);
  for (let line = 0; line < 4; line++) {
    // Explicit presented-caption fixture. The real director acknowledges all four
    // authored lines, with no line-index write and no physical objective advance.
    assert.equal(f.s.campaign.active.dialogue.index, line);
    assert(advanceCampaignDialogue(f.s.campaign, f.native).ok);
    step();
    if (line < 3) assert.equal(Named.namedHostileObservation(f.s, 'LL-ARC-DAX').mode, 'threat');
  }
  assert.equal(Named.namedHostileObservation(f.s, 'LL-ARC-DAX').mode, 'combat');
  for (let n = 0; n < 120 && !f.s.player.counterWindow; n++)
    step({ block: true, aimAngle: Math.PI });
  assert(f.s.player.counterWindow, 'real canonical knife strike must produce the guard window');
  assert.equal(f.s.player.counterTarget, 'LL-ARC-DAX');
  step({ block: true, disarm: true, aimAngle: Math.PI });
  const dax = Companions.getActor(f.s, 'LL-ARC-DAX');
  assert.equal(observed.disarms.length, 1);
  assert.equal(observed.damage.filter((e) => e.kind === 'guard-disarm-wrist').length, 1);
  assert.equal(dax.weapon, 'unarmed');
  assert.equal(dax.health, 92);
  assert.equal(f.s.player.health, 100);
  assert.equal(m.run.injury.damageApplied, 8);
  assert(m.run.retreat.trigger);
  assert.equal(twoSeatsWristView(f.s).damageScale, 0.5);
  assert.equal(twoSeatsWristView(f.s).recoveryScale, 1.5);
  assert.equal(twoSeatsWristView(f.s).affectedHand, 'right');
  assert.equal(Object.keys(m.run.retreat.proofs).length, 0, 'accepting an escort is not arrival');
  for (let n = 0; n < 2400 && Object.keys(m.run.retreat.proofs).length < 2; n++) step();
  assert.equal(
    Object.keys(m.run.retreat.proofs).length,
    2,
    JSON.stringify({
      dax: Companions.companionObservation(f.s, 'LL-ARC-DAX'),
      pel: Companions.companionObservation(f.s, 'LL-ARC-PEL'),
      blocked: m.active.blocked,
    }),
  );
  for (const id of ['LL-ARC-DAX', 'LL-ARC-PEL']) {
    const a = Companions.getActor(f.s, id),
      receipt = m.run.retreat.proofs[id];
    assert.equal(a.sceneId, null);
    assert(a.health > 0);
    assert(receipt.at > receipt.parentReceipt.proof.observed.retreat.at);
    assert(Math.hypot(a.x - target.x, a.y - target.y) <= target.radius + 1e-6);
    assert.equal(Named.namedHostileObservation(f.s, id).mode, 'released');
  }
  assert.equal(
    f.s.hostiles.some((a) => ['LL-ARC-DAX', 'LL-ARC-PEL'].includes(a.id)),
    false,
  );
  assert.equal(Companions.getActor(f.s, 'LL-CHAR-002').health, f.health.felix);
  assert.equal(Companions.getActor(f.s, 'LL-CHAR-008').health, f.health.nadia);
  assert.equal(f.s.player.money, f.health.money);
  assert.equal(f.s.campaign.completed['LL-ST-003'], undefined);
  assert.equal(
    parent.ready.melee,
    false,
    'actual hand-scale core/art remain explicit missing gates',
  );
  assert.equal(validateTwoSeatsRuntime(f.s), true);
  assert.equal(validateTwoSeatsParentState(f.s), true);
  assert.equal(Named.validateNamedHostility(f.s), true);
});
