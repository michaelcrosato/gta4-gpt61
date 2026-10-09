/** Genuine failed-purchase save continued as a NEW declared regression fixture.
 * Public choice and actual caption APIs perform the final authored transactions;
 * no physical state, voucher, inventory, receipt or win fields are manufactured. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import {
  restoreGame,
  saveGame,
  selectStoryChoice,
  storyView,
  presentStoryDialogue,
  acknowledgeStory,
} from '../src/simulation.js';
import { getActor } from '../src/companions.js';
const raw = gunzipSync(
    readFileSync(new URL('./fixtures/two-seats-genuine-shop-choice-save.json.gz', import.meta.url)),
  ).toString(),
  meta = JSON.parse(
    readFileSync(
      new URL('./fixtures/two-seats-genuine-shop-choice-save.meta.json', import.meta.url),
    ),
  );
function loaded() {
  assert.equal(createHash('sha256').update(raw).digest('hex'), meta.rawSha256);
  return restoreGame(raw);
}
test('actual shared hook LOS point permits one real voucher purchase and the final two genuinely presented local captions', () => {
  const s = loaded(),
    before = {
      money: s.player.money,
      life: s.companions.actors.map((a) => [a.id, a.health]),
      injury: structuredClone(s.twoSeatsRuntime.run.injury),
      time: s.time,
    },
    voucher = s.twoSeatsRuntime.run.voucher.id;
  assert.equal(storyView(s).choiceReady, true);
  assert.equal(s.campaign.active.dialogue.index, 3);
  assert.equal(s.clothingServices.grants[voucher].spentBy, null);
  assert.equal(s.twoSeatsRuntime.run.outfit, null);
  const result = selectStoryChoice(s, 'outfit', 'slate-work-jacket');
  assert(result.ok, JSON.stringify(result));
  const purchase = s.twoSeatsRuntime.run.outfit;
  assert.equal(purchase.kind, 'clothing-purchase');
  assert.equal(purchase.payment, 'cooperative-voucher');
  assert.equal(purchase.charged, 0);
  assert.equal(purchase.voucherId, voucher);
  assert.equal(s.clothingServices.grants[voucher].spentBy, purchase.id);
  assert.deepEqual(s.twoSeatsRuntime.run.voucher, s.clothingServices.grants[voucher]);
  assert.equal(Object.keys(s.clothingServices.purchases).length, 1);
  assert.equal(s.wardrobe.equipped, 'slate-work-jacket');
  assert(s.wardrobe.owned.includes('slate-work-jacket'));
  assert.equal(s.player.money, before.money);
  assert.equal(s.campaign.completed['LL-ST-003'], undefined);
  for (const expected of ['Felix', 'Mara']) {
    const view = storyView(s);
    assert.equal(view.dialogue.speaker, expected);
    presentStoryDialogue(s);
    assert(acknowledgeStory(s).ok);
  }
  assert(s.campaign.completed['LL-ST-003']);
  assert.equal(s.player.money, before.money);
  assert.deepEqual(
    s.companions.actors.map((a) => [a.id, a.health]),
    before.life,
  );
  assert.deepEqual(s.twoSeatsRuntime.run.injury, before.injury);
  assert.equal(s.time, before.time);
  assert.equal(Object.keys(s.clothingServices.purchases).length, 1);
  assert.equal(selectStoryChoice(s, 'outfit', 'ochre-rain-shell').ok, false);
  const continued = restoreGame(saveGame(s));
  assert.equal(continued.wardrobe.equipped, 'slate-work-jacket');
  assert.deepEqual(continued.clothingServices, s.clothingServices);
});
test('actual clerk outside this room or dead cannot borrow the query point scene to make a purchase', () => {
  for (const mutation of [(a) => (a.sceneId = null), (a) => (a.health = 0)]) {
    const s = loaded();
    mutation(getActor(s, 'LL-ARC-BEA'));
    // Explicit corruption fixtures test rejection only; these are not gameplay
    // actions or a claim of naturally killing/moving the actual shopkeeper.
    const before = saveGame(s);
    assert.equal(selectStoryChoice(s, 'outfit', 'slate-work-jacket').ok, false);
    assert.equal(saveGame(s), before);
    assert.equal(s.twoSeatsRuntime.run.outfit, null);
  }
});
