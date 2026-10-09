import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { restoreGame, saveGame, updateSimulation, WORLD } from '../src/simulation.js';
import { validateRailRuntime } from '../src/rail-runtime.js';
import { DISPATCH_WORLD_MIGRATION } from '../src/dispatch-save-migration.js';

test('genuine all-held0.6 whole-game save resumes through normal simulation and Continue without resetting world costs', async () => {
  const meta = JSON.parse(
      await readFile(
        new URL('./fixtures/metro-0.6-held-whole-save.meta.json', import.meta.url),
        'utf8',
      ),
    ),
    raw = gunzipSync(
      await readFile(new URL('./fixtures/metro-0.6-held-whole-save.json.gz', import.meta.url)),
    );
  assert.equal(createHash('sha256').update(raw).digest('hex'), meta.sha256);
  const original = JSON.parse(raw),
    s = restoreGame(raw.toString()),
    before = structuredClone(s.transit.trains),
    money = s.player.money,
    health = s.player.health,
    cast = structuredClone(s.companions),
    director = structuredClone(s.campaign);
  assert(before.every((t) => t.phase === 'held'));
  // This immutable genuine0.6 fixture now undergoes the exact approved rail
  // geometry migration. Its owned state and planar progress must survive; the
  // old geometry signature and physical signal claims must not be relabeled.
  assert.equal(original.state.transit.topology, DISPATCH_WORLD_MIGRATION.fromTransit);
  assert.equal(s.transit.topology, DISPATCH_WORLD_MIGRATION.toTransit);
  assert.equal(s.railSignals.topology, DISPATCH_WORLD_MIGRATION.toSignals);
  assert.equal(s.worldGeometryVersion, DISPATCH_WORLD_MIGRATION.id);
  for (const key of [
    'version',
    'config',
    'time',
    'passengers',
    'tickets',
    'ledger',
    'transactionSequence',
    'events',
    'eventSequence',
    'callbackErrors',
    'stats',
  ])
    assert.deepEqual(s.transit[key], original.state.transit[key], key);
  assert.equal(s.time, original.state.time);
  assert.equal(s.player.money, original.state.player.money);
  assert.equal(s.player.health, original.state.player.health);
  assert.deepEqual(s.campaign.receipts, original.state.campaign.receipts);
  assert.deepEqual(s.campaign.completed, original.state.campaign.completed);
  for (let i = 0; i < before.length; i++) {
    const prior = original.state.transit.trains[i],
      actual = before[i];
    for (const key of [
      'id',
      'serviceId',
      'ordinal',
      'callIndex',
      'segmentId',
      'phase',
      'phaseRemaining',
      'doorProgress',
      'visits',
      'circuits',
      'passengerIds',
      'blockedReason',
    ])
      assert.deepEqual(actual[key], prior[key], key);
    assert(
      Math.hypot(actual.x - prior.x, actual.y - prior.y) < 1e-6,
      'approved height changes preserve the actual planar train position',
    );
  }
  for (const key of ['time', 'waiting', 'nextWaitSequence', 'stats'])
    assert.deepEqual(s.railSignals[key], original.state.railSignals[key], key);
  validateRailRuntime(s, WORLD);
  for (let frame = 0; frame < 60; frame++) updateSimulation(s, 0.5, {});
  assert(s.transit.trains.some((t, i) => Math.hypot(t.x - before[i].x, t.y - before[i].y) > 1));
  assert.deepEqual(
    s.transit.trains.map((t) => t.id),
    before.map((t) => t.id),
  );
  assert(
    s.transit.trains.every(
      (t, i) => t.visits >= before[i].visits && t.circuits >= before[i].circuits,
    ),
  );
  assert(Math.abs(s.time - meta.time - 30) < 1e-6);
  assert.equal(s.player.money, money);
  assert.equal(s.player.health, health);
  assert.deepEqual(
    s.companions.actors.map((a) => [a.id, a.health]),
    cast.actors.map((a) => [a.id, a.health]),
  );
  assert.deepEqual(s.campaign, director, 'idle train recovery invents no story progress');
  validateRailRuntime(s, WORLD);
  const continued = restoreGame(saveGame(s));
  assert.deepEqual(continued.transit, s.transit);
  assert.deepEqual(continued.railSignals, s.railSignals);
  for (let frame = 0; frame < 10; frame++) updateSimulation(continued, 0.5, {});
  assert.equal(continued.player.money, money);
  assert.equal(continued.progress.deaths, original.state.progress.deaths);
  validateRailRuntime(continued, WORLD);
});
