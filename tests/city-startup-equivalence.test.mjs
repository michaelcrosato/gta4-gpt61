import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { CITY_BLUEPRINT } from '../src/city-blueprint.js';
import { WORLD, LEGACY_WORLD } from '../src/world.js';
import { createSimulation, updateSimulation } from '../src/simulation.js';

// The oracle was captured from the unmodified 0.5 candidate before caching road
// bounds. Keep this historical city/legacy oracle intact. Late Meter appends
// reviewed scene geometry and adds composed story/phone state in its own oracle.
const baseline = JSON.parse(
  await readFile(new URL('./fixtures/city-startup-baseline.json', import.meta.url), 'utf8'),
);
const lateMeter = JSON.parse(
  await readFile(new URL('./fixtures/city-startup-late-meter.json', import.meta.url), 'utf8'),
);
// New content/geometry has its own reviewed baseline. Never rewrite either
// historical oracle to hide a change in those published versions.
const twoSeats = JSON.parse(
  await readFile(new URL('./fixtures/city-startup-two-seats.json', import.meta.url), 'utf8'),
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

const { lateMeterDressing, ...priorWorld } = LEGACY_WORLD;
priorWorld.roads = priorWorld.roads.filter((road) => !road.id.startsWith('late-meter-'));
priorWorld.obstacles = priorWorld.obstacles.filter((item) => item.id !== 'impound-annex-awning');
priorWorld.locations = priorWorld.locations.filter((item) => item.id !== 'impound-annex');
priorWorld.campaignSceneBindings = Object.fromEntries(
  Object.entries(priorWorld.campaignSceneBindings).filter(([id]) => id !== 'impound-counter'),
);
priorWorld.navigationRevision--;
for (const [label, value] of [
  ['city', CITY_BLUEPRINT],
  ['world', priorWorld],
])
  test(`Late Meter preserves the complete prior serialized ${label}`, () => {
    assert.equal(Buffer.byteLength(JSON.stringify(value)), baseline[label].bytes);
    assert.equal(hash(value), baseline[label].sha256);
  });
test('the reviewed Late Meter world includes its exact physical additions', () => {
  assert.equal(Buffer.byteLength(JSON.stringify(LEGACY_WORLD)), lateMeter.world.bytes);
  assert.equal(hash(LEGACY_WORLD), lateMeter.world.sha256);
  assert.equal(LEGACY_WORLD.roads.length - priorWorld.roads.length, 29);
  assert(lateMeterDressing.serviceWindow);
});
test('the reviewed Two Seats world retains its exact new geometry and real actor/site registrations', () => {
  assert.equal(Buffer.byteLength(JSON.stringify(WORLD)), twoSeats.world.bytes);
  assert.equal(hash(WORLD), twoSeats.world.sha256);
  assert.equal(WORLD.campaignSceneReports['LL-ST-003'].ready, true);
  assert.equal(WORLD.campaignSceneReports['LL-ST-003'].injuryArt, true);
  assert.equal(WORLD.locations.find((site) => site.id === 'tess-flat').siteId, 'LL-CITY-LOC174');
  assert.equal(WORLD.locations.find((site) => site.id === 'pier-goods').siteId, 'LL-CITY-LOC034');
  assert.deepEqual(
    Object.keys(WORLD.campaignActorDefinitions['LL-ST-003']).sort(),
    ['LL-CHAR-025', 'LL-ARC-DAX', 'LL-ARC-PEL', 'LL-ARC-BEA'].sort(),
  );
});

for (const expected of [
  ...baseline.seeds.filter((seed) => seed.mode === 'legacy'),
  ...lateMeter.seeds,
])
  test(`seed${expected.seed} ${expected.mode} preserves actors, movement, firing and RNG`, () => {
    const current = twoSeats.seeds.find(
      (seed) => seed.seed === expected.seed && seed.mode === expected.mode,
    );
    assert(current, 'each published scenario has a reviewed current-version oracle');
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
    assert.equal(hash(state), current.initial.sha256);
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
    assert.equal(hash(state), current.afterSteps.sha256);
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
