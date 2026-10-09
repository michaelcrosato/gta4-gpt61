/** Genuine failed journey save continued as a NEW declared regression fixture.
 * No post-load body/health/clock/director/receipt edits; ordinary braking inputs
 * must complete real boarding without inventing presented dialogue or a win. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { restoreGame, updateSimulation, saveGame } from '../src/simulation.js';
import { getActor, getSeat, companionObservation } from '../src/companions.js';

test('completed wait preparation does not reclaim Nadia while pickup physically boards her then Tess', () => {
  const raw = gunzipSync(
      readFileSync(
        new URL('./fixtures/two-seats-native-pickup-failed-save.json.gz', import.meta.url),
      ),
    ).toString(),
    meta = JSON.parse(
      readFileSync(
        new URL('./fixtures/two-seats-native-pickup-failed-save.meta.json', import.meta.url),
      ),
    ),
    state = restoreGame(raw);
  assert.equal(createHash('sha256').update(raw).digest('hex'), meta.rawSha256);
  assert.equal(state.campaign.active.stageId, 'pickup');
  assert.equal(state.twoSeatsRuntime.preparation.nadia.ready, true);
  assert.equal(getSeat(state, 'LL-CHAR-008'), null);
  assert.equal(getSeat(state, 'LL-CHAR-025'), null);
  const before = {
      time: state.time,
      money: state.player.money,
      health: state.player.health,
      ids: state.companions.actors.map((a) => a.id),
      life: state.companions.actors.map((a) => [a.id, a.health]),
      injury: structuredClone(state.twoSeatsRuntime.run.injury),
      director: structuredClone(state.campaign),
      events: state.companions.sequence,
    },
    car = state.player.vehicleId;
  let nadiaAt = null,
    tessAt = null;
  for (let frame = 0; frame < 1200 && !tessAt; frame++) {
    updateSimulation(state, 1 / 60, { brake: true });
    const n = getSeat(state, 'LL-CHAR-008'),
      t = getSeat(state, 'LL-CHAR-025');
    if (n && !nadiaAt) {
      assert.equal(n.vehicleId, car);
      assert.equal(n.seat, 1);
      assert.equal(n.alive, true);
      nadiaAt = state.time;
    }
    if (t) {
      assert(n, 'Tess cannot own her seat before actual living Nadia');
      assert.equal(t.vehicleId, car);
      assert.equal(t.seat, 3);
      assert.equal(t.alive, true);
      tessAt = state.time;
    }
    assert.equal(state.campaign.completed['LL-ST-003'], undefined);
  }
  assert(nadiaAt, JSON.stringify(companionObservation(state, 'LL-CHAR-008')));
  assert(tessAt, JSON.stringify(companionObservation(state, 'LL-CHAR-025')));
  assert(tessAt > nadiaAt);
  for (let n = 0; n < 60; n++) updateSimulation(state, 1 / 60, { brake: true });
  assert.equal(getSeat(state, 'LL-CHAR-008')?.seat, 1);
  assert.equal(getSeat(state, 'LL-CHAR-025')?.seat, 3);
  assert.equal(getSeat(state, 'LL-CHAR-002')?.seat, 2);
  assert.equal(
    state.campaign.active.stageId,
    'pickup',
    'unpresented introduction lines cannot auto-complete',
  );
  assert.equal(state.campaign.active.dialogue.index, 0);
  assert.deepEqual(state.campaign, before.director);
  assert.equal(state.player.money, before.money);
  assert.equal(state.player.health, before.health);
  assert.deepEqual(
    state.companions.actors.map((a) => a.id),
    before.ids,
  );
  assert.deepEqual(
    state.companions.actors.map((a) => [a.id, a.health]),
    before.life,
  );
  assert.deepEqual(state.twoSeatsRuntime.run.injury, before.injury);
  assert.equal(getActor(state, 'LL-ARC-DAX').health, 92);
  assert(state.time > before.time && state.time - before.time < 21);
  assert.equal(
    state.companions.events.some(
      (e) =>
        e.id > before.events &&
        e.actorId === 'LL-CHAR-008' &&
        e.kind === 'ordered' &&
        e.data.kind === 'escort',
    ),
    false,
  );
  const continued = restoreGame(saveGame(state));
  assert.deepEqual(getSeat(continued, 'LL-CHAR-008'), getSeat(state, 'LL-CHAR-008'));
  assert.deepEqual(getSeat(continued, 'LL-CHAR-025'), getSeat(state, 'LL-CHAR-025'));
});
