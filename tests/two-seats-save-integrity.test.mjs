/** Genuine live production injury followed by detached corrupt-save copies.
 * Fixture ownership/presentation setup is explicit; no simulated HP relaxation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Companions from '../src/companions.js';
import { applyRestHours } from '../src/calendar.js';
import { validateTwoSeatsRuntime } from '../src/campaign/two-seats-runtime.js';
import {
  twoSeatsWristView,
  validateTwoSeatsParentState,
  TWO_SEATS_WRIST_IMPAIRMENT,
} from '../src/campaign/two-seats-parent-context.js';
import { guardedDisarm } from './helpers/two-seats-native-fixture.mjs';
const copy = (v) => JSON.parse(JSON.stringify(v)),
  F = 'LL-CHAR-002',
  N = 'LL-CHAR-008',
  D = 'LL-ARC-DAX';
const genuine = guardedDisarm();
assert.equal(genuine.capturedDisarm.disarms.length, 1);
assert.equal(genuine.dax.health, 92, 'real production observer already committed exact8once');
const committedWorld = copy(genuine.s);
delete committedWorld.campaign;
const injuryOf = (s) => Object.values(s.twoSeatsEffects.injuries)[0];
function corruptInjury(mutate) {
  const value = copy(committedWorld);
  mutate(value, injuryOf(value));
  value.twoSeatsRuntime.run.injury = copy(injuryOf(value));
  return value;
}
function requireRejected(value) {
  assert.throws(() => validateTwoSeatsParentState(value), /Unproved|Invalid/);
  assert.equal(
    genuine.parent.snapshots.validate(value),
    false,
    'full parent snapshot acceptance must reject the owned corrupted history',
  );
}
test('genuine input-generated injury retains its committed damage, physical blade and unchanged companions/economy', () => {
  assert.equal(validateTwoSeatsRuntime(committedWorld), true);
  assert.equal(validateTwoSeatsParentState(committedWorld), true);
  assert.equal(genuine.parent.snapshots.validate(committedWorld), true);
  assert.equal(Companions.getActor(committedWorld, D).health, 92);
  assert.equal(Companions.getActor(committedWorld, F).health, genuine.health.felix);
  assert.equal(Companions.getActor(committedWorld, N).health, genuine.health.nadia);
  assert.equal(committedWorld.player.money, genuine.health.money);
  assert.equal(
    committedWorld.pickups.filter((p) => p.id === genuine.dax.disarmReceipt.dropId).length,
    1,
  );
  assert.deepEqual(
    committedWorld.twoSeatsRuntime.run.disarm.receipt,
    committedWorld.player.lastDisarm,
  );
  assert.equal(genuine.parent.ready.melee, false);
  assert.equal(Object.isFrozen(TWO_SEATS_WRIST_IMPAIRMENT), true);
  assert.deepEqual(injuryOf(committedWorld).impairment, {
    affectedHand: 'right',
    damageScale: 0.5,
    recoveryScale: 1.5,
    hours: 48,
  });
  const view = twoSeatsWristView(committedWorld);
  assert.equal(view.affectedHand, 'right');
  assert.equal(view.damageScale, 0.5);
  assert.equal(view.recoveryScale, 1.5);
  assert.equal(genuine.s.campaign.completed['LL-ST-003'], undefined);
  assert.deepEqual(genuine.s.campaign.active.completedStages, []);
});
test('saved bandage geometry and color must remain the exact immutable source descriptor', () => {
  for (const mutate of [
    (r) => {
      r.bandage.width = 999;
    },
    (r) => {
      r.bandage.color = '#ff00ff';
    },
  ])
    requireRejected(corruptInjury((s, r) => mutate(r)));
});
test('saved finite injury cannot shift its exact48hour window by a million hours', () => {
  requireRejected(
    corruptInjury((s, r) => {
      r.startedAtHours += 1000000;
      r.expiresAtHours += 1000000;
    }),
  );
});
test('saved injury cannot alter or omit its immutable right-hand impairment policy', () => {
  for (const mutate of [
    (r) => {
      delete r.impairment;
    },
    (r) => {
      r.impairment.affectedHand = 'left';
    },
    (r) => {
      r.impairment.damageScale = 1;
    },
    (r) => {
      r.impairment.recoveryScale = 1;
    },
    (r) => {
      r.impairment.hours = 24;
    },
  ])
    requireRejected(corruptInjury((s, r) => mutate(r)));
});
test('saved injury health delta must match its referenced genuine committed damage event', () => {
  requireRejected(
    corruptInjury((s, r) => {
      r.healthBefore -= 5;
      r.healthAfter -= 5;
    }),
  );
});
test('saved fatal flag cannot contradict the real nonfatal8damage commit', () => {
  requireRejected(
    corruptInjury((s, r) => {
      r.fatal = true;
    }),
  );
});
test('saved invented dressing treatment cannot remove the persistent bandage', () => {
  requireRejected(
    corruptInjury((s, r) => {
      const id = 'two-seats:invented-treatment';
      s.twoSeatsEffects.receipts[id] = {
        id,
        kind: 'dressing-treatment',
        status: 'committed',
        at: s.time,
        scope: copy(r.scope),
        proof: { injuryId: r.id },
      };
      s.twoSeatsEffects.dressings[r.id].removedBy = id;
    }),
  );
});
test('saved injury cannot omit genuine earlier Night Crossing rest to backdate its impairment by6hours', () => {
  const value = corruptInjury((s, r) => {
    const e = s.twoSeatsRuntime.run.damageEvents.find((e) => e.id === r.damageReceiptId);
    assert(
      e.calendarOffsetHours > 0 && e.calendarReceiptIds.length > 0,
      'fixture retains real earlier Night Crossing rest',
    );
    const hours = e.calendarOffsetHours;
    r.startedAtHours -= hours;
    r.expiresAtHours -= hours;
    e.worldHours -= hours;
    e.calendarOffsetHours = 0;
    e.calendarReceiptIds = [];
  });
  requireRejected(value);
});
test('later actual component rest ages impairment but keeps the historical injury and bandage valid', () => {
  const value = copy(committedWorld),
    before = copy(injuryOf(value));
  assert.equal(applyRestHours(value, 24, 'component:integrity-rest-one').ok, true);
  assert.equal(applyRestHours(value, 24, 'component:integrity-rest-two').ok, true);
  assert.equal(twoSeatsWristView(value).active, false);
  assert.equal(twoSeatsWristView(value).damageScale, 1);
  assert.equal(twoSeatsWristView(value).recoveryScale, 1);
  assert.equal(twoSeatsWristView(value).bandageVisible, true);
  assert.deepEqual(injuryOf(value), before);
  assert.equal(validateTwoSeatsParentState(value), true);
  assert.equal(genuine.parent.snapshots.validate(value), true);
});
