import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { CITY_BLUEPRINT } from '../src/city-blueprint.js';
import { WORLD } from '../src/world.js';
import { createSimulation, updateSimulation } from '../src/simulation.js';

// The oracle was captured from the unmodified 0.5 candidate before caching road
// bounds. Full snapshots protect values, identities and array/property order;
// update them only alongside an intentionally reviewed world/behavior change.
const baseline = JSON.parse(
  await readFile(new URL('./fixtures/city-startup-baseline.json', import.meta.url), 'utf8'),
);
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const input = (frame) =>
  frame < 60
    ? {}
    : frame < 120
      ? { moveY: -1 }
      : frame < 180
        ? { moveX: 1 }
        : { moveY: -1, sprint: true, fire: true, aimAngle: 0 };

for (const [label, value] of [
  ['city', CITY_BLUEPRINT],
  ['world', WORLD],
])
  test(`road-volume caching preserves the complete serialized ${label}`, () => {
    assert.equal(Buffer.byteLength(JSON.stringify(value)), baseline[label].bytes);
    assert.equal(hash(value), baseline[label].sha256);
  });

for (const expected of baseline.seeds)
  test(`seed${expected.seed} ${expected.mode} preserves actors, movement, firing and RNG`, () => {
    const option =
      expected.mode === 'story' ? { seed: expected.seed, campaign: true } : expected.seed;
    const state = createSimulation(option),
      initialPlayer = structuredClone(state.player),
      initialCinematic = state.cinematics?.active?.id,
      idle = expected.mode === 'story' ? createSimulation(option) : null,
      trace = [];
    let movedAt120 = 0,
      fireStartClip,
      fireStartRng;
    assert.equal(hash(state), expected.initial.sha256);
    assert.equal(state.rng, expected.initialRng);
    for (let frame = 0; frame < baseline.frames; frame++) {
      if (frame === 180) {
        fireStartClip = state.player.ammo.pistol.clip;
        fireStartRng = state.rng;
      }
      updateSimulation(state, baseline.dt, input(frame));
      if (idle) updateSimulation(idle, baseline.dt, {});
      if (frame === 119)
        movedAt120 = Math.hypot(state.player.x - initialPlayer.x, state.player.y - initialPlayer.y);
      trace.push(state.rng);
    }
    assert.equal(hash(state), expected.afterSteps.sha256);
    assert.equal(state.rng, expected.finalRng);
    assert.equal(hash(trace), expected.rngTraceSha256);
    if (expected.mode === 'legacy') {
      assert.ok(movedAt120 > 30, 'explicit moveY input must actually move the player');
      assert.ok(
        Math.hypot(state.player.x - initialPlayer.x, state.player.y - initialPlayer.y) > 80,
        'legacy controls must physically traverse the city',
      );
      assert.ok(state.player.ammo.pistol.clip < fireStartClip, 'firing must consume ammunition');
      assert.notEqual(state.rng, fireStartRng, 'the firing phase must advance RNG');
      assert.ok(state.player.stamina < initialPlayer.stamina, 'sprinting must spend stamina');
    } else {
      assert.ok(initialCinematic, 'story begins in its actual arrival cinematic');
      assert.equal(state.cinematics?.active?.id, initialCinematic);
      assert.deepStrictEqual(state.player, idle.player, 'controlled player matches idle cinematic');
      assert.deepStrictEqual(
        state.cinematics,
        idle.cinematics,
        'controls preserve cinematic locks',
      );
      assert.equal(state.rng, idle.rng);
    }
  });
