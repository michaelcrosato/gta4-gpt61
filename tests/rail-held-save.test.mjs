import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { restoreGame, saveGame, updateSimulation, WORLD } from '../src/simulation.js';
import { validateRailRuntime } from '../src/rail-runtime.js';

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
  assert.deepEqual(s.transit, original.state.transit);
  assert.deepEqual(s.railSignals, original.state.railSignals);
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
