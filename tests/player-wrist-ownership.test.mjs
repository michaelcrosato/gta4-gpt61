/** Unmodified published M3 production-journey fixture, then the real voucher
 * choice/final caption APIs. Actual player input and the shared canonical NPC
 * attack callback test wrist ownership, not a new earned hostile encounter.
 * No actor/player/health/clock/injury/receipt setup mutations or private R6 save. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import * as api from '../src/simulation.js';
import { getActor } from '../src/companions.js';
const raw = gunzipSync(
    readFileSync(new URL('./fixtures/two-seats-genuine-shop-choice-save.json.gz', import.meta.url)),
  ).toString(),
  meta = JSON.parse(
    readFileSync(
      new URL('./fixtures/two-seats-genuine-shop-choice-save.meta.json', import.meta.url),
    ),
  );

test('Mara keeps her normal right-hand attack while the genuinely injured Dax retains his reduced strike through full Continue', () => {
  assert.equal(createHash('sha256').update(raw).digest('hex'), meta.rawSha256);
  const s = api.restoreGame(raw);
  assert.equal(api.storyView(s).choiceReady, true);
  assert(api.selectStoryChoice(s, 'outfit', 'slate-work-jacket').ok);
  for (const speaker of ['Felix', 'Mara']) {
    assert.equal(api.storyView(s).dialogue.speaker, speaker);
    api.presentStoryDialogue(s);
    assert(api.acknowledgeStory(s).ok);
  }
  assert(s.campaign.completed['LL-ST-003']);
  const dax = getActor(s, 'LL-ARC-DAX'),
    before = {
      money: s.player.money,
      health: s.player.health,
      dax: dax.health,
      injury: structuredClone(s.twoSeatsEffects.injuries),
    },
    condition = api.storyActorDressing(s, dax.id);
  assert.equal(condition.active, true);
  assert.equal(condition.affectedHand, 'right');
  assert.equal(dax.health, 92);
  assert.equal(s.player.id, undefined, 'The real player body has no canonical NPC ID');
  assert(api.selectWeapon(s, 'unarmed'));
  api.updateSimulation(s, 1 / 60, { fire: true, aimAngle: Math.PI });
  assert(s.player.meleeAction);
  assert.equal(s.player.meleeAction.damage, api.WEAPONS.unarmed.damage);
  assert.equal(s.player.meleeAction.duration, api.WEAPONS.unarmed.fireInterval);
  api.namedHostilityContext(s).fireActor(dax);
  assert(dax.meleeAction, 'The actual canonical body starts through the shared native callback');
  assert.equal(dax.meleeAction.hand, 'right');
  assert.equal(dax.meleeAction.damage, api.WEAPONS.unarmed.damage * 0.5);
  assert(
    Math.abs(
      dax.meleeAction.duration -
        (api.WEAPONS.unarmed.windup +
          (api.WEAPONS.unarmed.fireInterval - api.WEAPONS.unarmed.windup) * 1.5),
    ) < 1e-9,
  );
  assert.equal(s.player.money, before.money);
  assert.equal(s.player.health, before.health);
  assert.equal(dax.health, before.dax);
  assert.deepEqual(s.twoSeatsEffects.injuries, before.injury);
  const continued = api.restoreGame(api.saveGame(s));
  assert.deepEqual(continued.player.meleeAction, s.player.meleeAction);
  assert.deepEqual(getActor(continued, dax.id).meleeAction, dax.meleeAction);
  assert.deepEqual(continued.twoSeatsEffects.injuries, before.injury);
});
