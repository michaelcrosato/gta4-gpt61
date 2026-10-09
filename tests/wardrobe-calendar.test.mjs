import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, saveGame, restoreGame, updateSimulation } from '../src/simulation.js';
import { purchaseOutfit, grantOutfit, equipOutfit, outfitAppearance } from '../src/wardrobe.js';
import { worldHours, clockHour, applyRestHours } from '../src/calendar.js';

test('outfit purchase uses the real wallet once and ownership/equipping survive the whole save', () => {
  const s = createSimulation(61),
    cash = s.player.money;
  assert.equal(equipOutfit(s, 'co-op-workwear').ok, false);
  assert.equal(purchaseOutfit(s, 'co-op-workwear', 'clothes:purchase:1').ok, true);
  assert.equal(s.player.money, cash - 45);
  assert.equal(purchaseOutfit(s, 'co-op-workwear', 'clothes:purchase:1').replayed, true);
  assert.equal(s.player.money, cash - 45);
  assert.equal(equipOutfit(s, 'co-op-workwear').ok, true);
  const continued = restoreGame(saveGame(s));
  assert.equal(outfitAppearance(continued).id, 'co-op-workwear');
  assert.deepEqual(continued.wardrobe, s.wardrobe);
});
test('unaffordable, unknown and conflicting clothing transactions cannot change wallet or inventory', () => {
  const s = createSimulation(61);
  s.player.money = 10;
  const before = saveGame(s);
  assert.equal(purchaseOutfit(s, 'shore-knit', 'clothes:purchase:1').ok, false);
  assert.equal(purchaseOutfit(s, 'constructor', 'clothes:purchase:1').ok, false);
  assert.equal(saveGame(s), before);
  assert.equal(grantOutfit(s, 'shore-knit', 'shelter:kit:1').ok, true);
  assert.equal(grantOutfit(s, 'co-op-workwear', 'shelter:kit:1').reason, 'receipt-conflict');
  assert.equal(s.player.money, 10);
});
test('Continue rejects a nonexistent owned outfit, unowned selection and forged purchase price', () => {
  const s = createSimulation(61);
  purchaseOutfit(s, 'shore-knit', 'clothes:purchase:1');
  for (const mutate of [
    (x) => x.wardrobe.owned.push('designer-fiction'),
    (x) => (x.wardrobe.equipped = 'co-op-workwear'),
    (x) => (x.wardrobe.receipts['clothes:purchase:1'].price = 0),
  ]) {
    const saved = JSON.parse(saveGame(s));
    mutate(saved.state);
    assert.throws(() => restoreGame(JSON.stringify(saved)), /wardrobe/);
  }
});
test('six-hour rest advances actual calendar time once without replacing physics or fleet clocks', () => {
  const s = createSimulation(61),
    before = worldHours(s),
    time = s.time,
    trainTime = s.transit.time;
  assert.equal(applyRestHours(s, 6, 'shelter:rest:1').ok, true);
  assert.equal(worldHours(s), before + 6);
  assert.equal(s.time, time);
  assert.equal(s.transit.time, trainTime);
  assert.equal(applyRestHours(s, 6, 'shelter:rest:1').replayed, true);
  assert.equal(worldHours(s), before + 6);
  const continued = restoreGame(saveGame(s));
  updateSimulation(continued, 0.5);
  assert.ok(Math.abs(worldHours(continued) - (before + 6 + 0.5 / 90)) < 1e-8);
  assert.equal(continued.clock, clockHour(continued));
});
test('calendar corruption and reused rest receipts cannot silently alter appointments', () => {
  const s = createSimulation(61);
  applyRestHours(s, 6, 'shelter:rest:1');
  assert.equal(applyRestHours(s, 3, 'shelter:rest:1').reason, 'receipt-conflict');
  const saved = JSON.parse(saveGame(s));
  saved.state.calendar.offsetHours = 12;
  assert.throws(() => restoreGame(JSON.stringify(saved)), /calendar/);
});
test('older saves migrate wardrobe and calendar without changing their elapsed world hour', () => {
  const s = createSimulation(61);
  updateSimulation(s, 0.5);
  const saved = JSON.parse(saveGame(s));
  delete saved.state.wardrobe;
  delete saved.state.calendar;
  const continued = restoreGame(JSON.stringify(saved));
  assert.equal(outfitAppearance(continued).id, 'relief-coat');
  assert.equal(continued.clock, s.clock);
});
