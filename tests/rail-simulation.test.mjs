import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORLD,
  TERRAIN,
  MISSIONS,
  createSimulation,
  interact,
  nearestInteractable,
  updateSimulation,
  saveGame,
  restoreGame,
} from '../src/simulation.js';
import { updateRail, railPassenger } from '../src/rail-runtime.js';
import { createTerrain } from '../src/terrain.js';

function platformFixture() {
  const state = createSimulation(61);
  state.mission = null;
  state.dialogue = null;
  state.progress.completed = MISSIONS.map((m) => m.id);
  const train = state.transit.trains[0];
  const service = WORLD.transit.throughServices.find((s) => s.id === train.serviceId);
  const platform = WORLD.transit.stations
    .flatMap((s) => s.platforms)
    .find((p) => p.id === service.calls[0].platformId);
  Object.assign(state.player, platform.boardingPoint, {
    groundZ: platform.z,
    money: 1000,
    vehicleId: null,
    sceneId: null,
  });
  updateSimulation(state, 0.5);
  updateSimulation(state, 0.5);
  updateSimulation(state, 0.1);
  return { state, train };
}

test('whole-game save and Continue preserve a real Metro rider, checked fleet and signal reservations', () => {
  const { state, train } = platformFixture();
  assert.equal(nearestInteractable(state).type, 'rail-board');
  interact(state);
  assert.ok(railPassenger(state));
  const original = { x: state.player.x, y: state.player.y };
  for (let i = 0; i < 700 && train.speed <= 1; i++)
    updateRail(state, WORLD, 0.5, { terrain: TERRAIN });
  assert.ok(
    train.speed > 1,
    'production physical guard and dispatcher must allow the actual departure',
  );
  for (let i = 0; i < 10; i++) updateSimulation(state, 0.1, { moveX: 1, fire: true, jump: true });
  assert.ok(Math.hypot(state.player.x - original.x, state.player.y - original.y) > 1);
  const saved = saveGame(state),
    continued = restoreGame(saved);
  assert.deepEqual(continued.transit, state.transit);
  assert.deepEqual(continued.railSignals, state.railSignals);
  assert.deepEqual(continued.player, state.player);
  updateSimulation(continued, 0.1);
  assert.ok(railPassenger(continued));
  assert.equal(continued.player.money, 1000);
});

test('the production default rejects a newly obstructed full consist without an unchecked movement callback', () => {
  const state = createSimulation(61),
    train = state.transit.trains[0];
  const start = { x: train.x, y: train.y, z: train.z };
  const blockedWorld = {
    ...WORLD,
    buildings: [
      ...WORLD.buildings,
      {
        id: 'clearance-regression-wall',
        x: train.x - 1,
        y: train.y - 1,
        w: 2,
        h: 2,
        z: train.z,
        height: 16,
      },
    ],
  };
  const terrain = createTerrain(blockedWorld);
  for (let i = 0; i < 100; i++) updateRail(state, blockedWorld, 0.5, { terrain });
  assert.deepEqual({ x: train.x, y: train.y, z: train.z }, start);
  assert.equal(train.phase, 'blocked');
});
test('Continue rejects an impossible dead boarded rider without a recovery transition', () => {
  const { state } = platformFixture();
  interact(state);
  assert.ok(railPassenger(state));
  const saved = JSON.parse(saveGame(state));
  saved.state.player.health = 0;
  saved.state.respawnTimer = 0;
  assert.throws(() => restoreGame(JSON.stringify(saved)), /incapacitated Metro passenger/);
});
test('Continue checks physical consist dimensions even when signal state is removed', () => {
  const saved = JSON.parse(saveGame(createSimulation(61)));
  delete saved.state.railSignals;
  saved.state.transit.config.trainWidth = 22;
  assert.throws(() => restoreGame(JSON.stringify(saved)), /physical corridors/);
  saved.state.transit.config.trainWidth = 20;
  assert.throws(() => restoreGame(JSON.stringify(saved)), /signal reservations are missing/);
});
test('old exterior saves without any Metro model migrate to a checked initial fleet and reservations', () => {
  const saved = JSON.parse(saveGame(createSimulation(61)));
  delete saved.state.transit;
  delete saved.state.railSignals;
  const continued = restoreGame(JSON.stringify(saved));
  assert.equal(continued.transit.trains.length, 4);
  assert.equal(continued.railSignals.version, 1);
  updateSimulation(continued, 0.1);
  assert.equal(continued.player.health, 100);
});
test('Continue rejects a signal clock that would crash the first fleet step', () => {
  const saved = JSON.parse(saveGame(createSimulation(61)));
  saved.state.railSignals.time = 100;
  assert.throws(() => restoreGame(JSON.stringify(saved)), /signals and fleet clocks differ/);
});
