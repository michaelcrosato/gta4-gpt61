import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, restoreGame, saveGame, WORLD } from '../src/simulation.js';

test('campaign saves preserve exterior and room companions and reject invalid physical coordinates', () => {
  const original = createSimulation({ seed: 61, campaign: true });
  const saved = JSON.parse(saveGame(original));
  const restored = restoreGame(saved);
  assert.deepEqual(restored.companions, original.companions);

  const outside = structuredClone(saved);
  outside.state.companions.actors.find((actor) => actor.id === 'arc-berth-worker').x =
    WORLD.width + 1;
  assert.throws(() => restoreGame(outside), /saved people/);

  const room = structuredClone(saved);
  room.state.companions.actors.find((actor) => actor.id === 'LL-CHAR-008').x = 500;
  assert.throws(() => restoreGame(room), /local entity coordinates/);

  const height = structuredClone(saved);
  height.state.companions.actors.find((actor) => actor.id === 'arc-berth-worker').groundZ = 99999;
  assert.throws(() => restoreGame(height), /saved people/);
  assert.deepEqual(
    saved.state.companions,
    original.companions,
    'validation must not alter the caller save',
  );
});
