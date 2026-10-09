import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD, LEGACY_WORLD } from '../src/world.js';
import {
  migrateDispatchSave,
  DISPATCH_WORLD_MIGRATION as M,
} from '../src/dispatch-save-migration.js';
import { migrateDispatchSupports } from '../src/dispatch-support-migration.js';
import { validateRailRuntime } from '../src/rail-runtime.js';
import { getTransitPassengerPose } from '../src/transit.js';
import { compileRailConstruction } from '../src/rail-construction.js';
import { createDispatchMigrationFixtures } from './helpers/dispatch-migration-fixture.mjs';
const copy = (x) => JSON.parse(JSON.stringify(x));
const fixtures = createDispatchMigrationFixtures();
const envelope = (state) => ({ format: 'lowlight-save', version: 1, state: copy(state) });
const migrate = (s) => migrateDispatchSave(s, { fromWorld: LEGACY_WORLD, toWorld: WORLD });
const logicalTrain = (t) =>
  Object.fromEntries(
    Object.entries(t).filter(
      ([k]) => !['x', 'y', 'z', 'heading', 'speed', 'distance', 'legElapsed'].includes(k),
    ),
  );
for (const phase of ['opening', 'moving', 'blocked'])
  test(`known ${phase} fleet preserves every rail ledger and parent clock while recoupling actual rider`, () => {
    const input = envelope(fixtures[phase]),
      before = copy(input),
      { save, report } = migrate(input),
      s = save.state;
    assert.deepEqual(input, before, 'conversion must be detached');
    assert.equal(s.time, 937);
    assert.equal(s.transit.time, before.state.transit.time);
    assert.equal(s.railSignals.time, s.transit.time);
    assert.equal(s.transit.topology, M.toTransit);
    assert.equal(s.railSignals.topology, M.toSignals);
    validateRailRuntime(s, WORLD);
    for (const key of [
      'passengers',
      'tickets',
      'ledger',
      'events',
      'eventSequence',
      'transactionSequence',
      'callbackErrors',
      'stats',
      'config',
    ])
      assert.deepEqual(s.transit[key], before.state.transit[key], key);
    assert.deepEqual(
      s.transit.trains.map(logicalTrain),
      before.state.transit.trains.map(logicalTrain),
    );
    assert.equal(s.player.health, 83);
    assert.equal(s.player.money, before.state.player.money);
    const p = getTransitPassengerPose(s.transit, 'mara-voss');
    assert.deepEqual(
      [s.player.x, s.player.y, s.player.z, s.player.groundZ, s.player.angle],
      [p.x, p.y, p.z, p.groundZ, p.heading],
    );
    assert.equal(report.physicalWorlds, 1);
    if (phase !== 'opening') {
      const old = before.state.transit.trains[0],
        next = s.transit.trains[0];
      assert.ok(Math.abs(next.x - old.x) < 1e-6 && Math.abs(next.y - old.y) < 1e-6);
      assert.equal(old.z, 18);
      assert.equal(next.z, 38);
      assert.ok(next.distance > old.distance);
      assert.ok(next.legElapsed > old.legElapsed);
      assert.equal(s.transit.tickets[0].owed, 1);
      assert.ok(s.transit.passengers[0].destination);
      if (phase === 'blocked') assert.equal(next.speed, 0);
    }
  });
test('live, active and suspended checkpoint worlds are explicitly replaced with identities intact', () => {
  const e = envelope(fixtures.moving),
    checkpoint = (id, state) => ({
      id,
      at: 7,
      missionId: 'LL-ST-002',
      stageId: 'warn',
      progressFingerprint: 'same-receipt',
      owned: ['physical'],
      world: copy(state),
      notes: { id },
    });
  e.state.campaign = {
    active: {
      checkpoints: [checkpoint('start', fixtures.opening), checkpoint('annex', fixtures.blocked)],
    },
    suspended: [{ checkpoints: [checkpoint('warned', fixtures.moving)] }],
  };
  const before = copy(e),
    { save, report } = migrate(e);
  assert.equal(report.physicalWorlds, 4);
  const cps = [
      ...save.state.campaign.active.checkpoints,
      ...save.state.campaign.suspended[0].checkpoints,
    ],
    old = [
      ...before.state.campaign.active.checkpoints,
      ...before.state.campaign.suspended[0].checkpoints,
    ];
  cps.forEach((cp, i) => {
    assert.equal(cp.world.transit.topology, M.toTransit);
    validateRailRuntime(cp.world, WORLD);
    const { world, ...metadata } = cp,
      { world: ignored, ...expected } = old[i];
    assert.deepEqual(metadata, expected);
  });
  assert.deepEqual(e, before);
  const second = migrate(save);
  assert.deepEqual(second.save, save, 'already migrated worlds must be idempotent');
});
test('unknown topology, stale claims, changed rider/death and conflicting clocks are rejected atomically', () => {
  for (const corrupt of [
    (e) => (e.state.transit.topology = 'unknown'),
    (e) => (e.state.railSignals.topology = 'unknown'),
    (e) => e.state.railSignals.time++,
    (e) => e.state.player.z++,
    (e) => (e.state.player.health = 0),
    (e) => (e.state.worldGeometryVersion = 'unknown'),
    (e) => e.state.railSignals.reservations[0].releaseDistance++,
    (e) => e.state.transit.config.trainWidth++,
  ]) {
    const e = envelope(fixtures.moving);
    corrupt(e);
    const before = copy(e);
    assert.throws(() => migrate(e));
    assert.deepEqual(e, before);
  }
  const e = envelope(fixtures.moving);
  e.state.campaign = { active: { checkpoints: [{ id: 'bad', world: copy(fixtures.blocked) }] } };
  e.state.campaign.active.checkpoints[0].world.transit.topology = 'stale';
  assert.throws(() => migrate(e));
});
test('actual native support-relative foot actor and grounded dropped objects move with deck, never ground/interior/vehicle actors', () => {
  const player = {
      id: 'mara',
      x: 456,
      y: 700,
      z: 19.5,
      groundZ: 17.5,
      health: 77,
      vz: 3,
      traversal: { groundZ: 17.5 },
    },
    state = {
      player,
      companions: {
        actors: [
          { id: 'ground', x: 456, y: 700, z: 0, groundZ: 0, health: 40 },
          { id: 'room', x: 456, y: 700, z: 17.5, groundZ: 17.5, sceneId: 'voss-dispatch' },
          { id: 'seated', x: 456, y: 700, z: 17.5, groundZ: 17.5, vehicleId: 'taxi' },
        ],
      },
      pickups: [{ id: 'knife', x: 456, y: 700, z: 17.9 }],
      fires: [{ id: 'flame', x: 456, y: 700, z: 17.5 }],
      campaignRuntime: {
        sceneProps: {
          board: { id: 'clipboard', x: 456, y: 700, z: 17.5, state: 'dropped', ownerActorId: null },
        },
      },
    };
  const before = copy(state),
    report = migrateDispatchSupports(state, LEGACY_WORLD, WORLD);
  assert.equal(report.actors.length, 1);
  assert.equal(report.items.length, 3);
  const delta = state.player.groundZ - 17.5;
  assert.ok(delta > 18 && delta < 21);
  assert.equal(state.player.z - state.player.groundZ, 2);
  assert.equal(state.player.vz, 3);
  assert.equal(state.player.health, 77);
  assert.equal(state.player.traversal.groundZ, state.player.groundZ);
  assert.deepEqual(state.companions, before.companions);
  assert.ok(Math.abs(state.pickups[0].z - state.player.groundZ - 0.4) < 1e-9);
  const floors = compileRailConstruction(WORLD).structures.floors;
  assert.ok(floors.some((f) => f.trackIds?.includes('HC-TRACK-17@LL-CITY-SERVICE-01')));
  const oldGround = copy(before.player);
  oldGround.z = 0;
  oldGround.groundZ = 0;
  const noChange = { player: oldGround };
  assert.deepEqual(migrateDispatchSupports(noChange, LEGACY_WORLD, WORLD), {
    actors: [],
    items: [],
  });
  assert.equal(oldGround.z, 0);
});

test('known raw0.5 signal encoding is strictly canonicalized before physical migration; forged signatures are rejected', () => {
  const e = envelope(fixtures.moving);
  delete e.state.railSignals.topologyEncoding;
  e.state.railSignals.topology = 'ff6cd5ce';
  const result = migrate(e);
  assert.equal(result.save.state.railSignals.topology, M.toSignals);
  assert.equal(result.save.state.railSignals.topologyEncoding, 2);
  const bad = copy(e);
  bad.state.railSignals.topology = 'unregistered-raw';
  assert.throws(() => migrate(bad));
});
test('a mixed live-new/checkpoint-old envelope replaces the checkpoint payload rather than only validating a converted copy', () => {
  const e = migrate(envelope(fixtures.moving)).save;
  e.state.campaign = {
    active: { checkpoints: [{ id: 'retained-old', world: copy(fixtures.blocked) }] },
  };
  const r = migrate(e);
  assert.equal(r.save.state.campaign.active.checkpoints[0].world.transit.topology, M.toTransit);
  assert.equal(r.report.physicalWorlds, 1);
});

test('known Tess deck foot/jump and dormant corpse/pickup supports reconcile with unchanged identities and relative heights', () => {
  const state = {
    player: { id: 'mara', x: 756, y: 308, z: 19.5, groundZ: 17.5, health: 76 },
    ambient: {
      dormant: {
        region: {
          pedestrians: [{ id: 'corpse', x: 756, y: 308, z: 17.5, groundZ: 17.5, health: 0 }],
        },
      },
    },
    pickups: [{ id: 'knife', x: 756, y: 308, z: 17.9 }],
  };
  const report = migrateDispatchSupports(state, LEGACY_WORLD, WORLD);
  assert.equal(report.actors.length, 2);
  assert.equal(report.items.length, 1);
  assert.ok(Math.abs(state.player.groundZ - 37.5) < 1e-7);
  assert.equal(state.player.z - state.player.groundZ, 2);
  assert.equal(state.player.health, 76);
  assert.equal(state.ambient.dormant.region.pedestrians[0].health, 0);
  assert.ok(Math.abs(state.pickups[0].z - 37.9) < 1e-7);
});

test('current physical marker with published old fleet/signals is contradictory tampering, including nested worlds', () => {
  const e = envelope(fixtures.moving);
  e.state.worldGeometryVersion = M.id;
  assert.throws(() => migrate(e), /marker contradicts/);
  const parent = migrate(envelope(fixtures.moving)).save;
  parent.state.campaign = { active: { checkpoints: [{ id: 'tampered', world: copy(e.state) }] } };
  assert.throws(() => migrate(parent), /marker contradicts/);
});
test('actual second-service moving/blocked rider follows Tess grade with debt/destination/event history intact', () => {
  const f = createDispatchMigrationFixtures({
    trainIndex: 1,
    targetCall: 1,
    minY: 300,
    maxY: 320,
    targetX: 756,
  });
  for (const phase of ['moving', 'blocked']) {
    const prior = f[phase],
      next = migrate(envelope(prior)).save.state,
      oldTrain = prior.transit.trains[1],
      newTrain = next.transit.trains[1];
    assert.equal(oldTrain.z, 18);
    assert.equal(newTrain.z, 38);
    assert.ok(Math.hypot(newTrain.x - oldTrain.x, newTrain.y - oldTrain.y) < 1e-6);
    assert.equal(next.transit.tickets[0].owed, 1);
    for (const key of ['passengers', 'tickets', 'events', 'ledger', 'stats', 'callbackErrors'])
      assert.deepEqual(next.transit[key], prior.transit[key], key);
    validateRailRuntime(next, WORLD);
    if (phase === 'blocked') assert.equal(newTrain.speed, 0);
  }
});
