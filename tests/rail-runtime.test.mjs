import test from 'node:test';
import assert from 'node:assert/strict';
import { CITY_BLUEPRINT } from '../src/city-blueprint.js';
import { createRailWorld } from '../src/rail-geometry.js';
import { createTerrain } from '../src/terrain.js';
import {
  initializeRail,
  updateRail,
  railInteraction,
  interactRail,
  railPassenger,
  validateRailRuntime,
} from '../src/rail-runtime.js';
const { world } = createRailWorld(CITY_BLUEPRINT);
const terrain = createTerrain(world);
function fixture(money = 100) {
  const state = {
    player: {
      money,
      health: 100,
      vehicleId: null,
      sceneId: null,
      x: 0,
      y: 0,
      z: 0,
      groundZ: 0,
      angle: 0,
    },
    wanted: { level: 0 },
    scene: { kind: 'exterior', id: 'harbor-city' },
  };
  initializeRail(state, world);
  const train = state.transit.trains[0],
    service = world.transit.throughServices.find((s) => s.id === train.serviceId),
    call = service.calls[0];
  const platform = world.transit.stations
    .flatMap((s) => s.platforms)
    .find((p) => p.id === call.platformId);
  Object.assign(state.player, platform.boardingPoint, { groundZ: platform.z });
  const notices = [],
    options = { terrain, notify: (text) => notices.push(text), canMoveTrain: () => true };
  updateRail(state, world, 1.01, options);
  return { state, options, notices, train, service };
}
test('real platform offers board freely, follows analytic train poses, and settles the wallet at a later stop', () => {
  const { state, options, train } = fixture();
  const offer = railInteraction(state, world);
  assert.equal(offer.type, 'rail-board');
  assert.equal(interactRail(state, world, offer, options).ok, true);
  assert.equal(state.player.money, 100);
  assert.ok(railPassenger(state));
  const start = { x: state.player.x, y: state.player.y };
  for (let i = 0; i < 1800 && train.visits === 0; i++) updateRail(state, world, 0.5, options);
  assert.ok(train.visits > 0);
  assert.ok(Math.hypot(state.player.x - start.x, state.player.y - start.y) > 100);
  updateRail(state, world, 1.01, options);
  const result = interactRail(state, world, railInteraction(state, world), options);
  assert.equal(result.ok, true);
  assert.equal(state.player.money, 98);
  assert.equal(railPassenger(state), null);
  assert.equal(state.player.sceneId, null);
  validateRailRuntime(state, world);
});
test('boarding pursuit policy refuses high wanted levels without changing actor, fare or rider state', () => {
  const { state, options } = fixture();
  state.wanted.level = 3;
  const before = { ...state.player };
  assert.equal(interactRail(state, world, railInteraction(state, world), options).ok, false);
  assert.deepEqual(state.player, before);
  assert.equal(railPassenger(state), null);
});
test('a checked movement guard is required; rejected train motion cannot move an aboard actor through obstacles', () => {
  const { state, options } = fixture();
  interactRail(state, world, railInteraction(state, world), options);
  const point = { x: state.player.x, y: state.player.y, z: state.player.z };
  updateRail(state, world, 30, { ...options, canMoveTrain: () => false });
  assert.deepEqual({ x: state.player.x, y: state.player.y, z: state.player.z }, point);
  assert.ok(state.transit.trains.some((train) => train.phase === 'blocked'));
});
test('insufficient fare is an explicit debt and never a negative wallet or a trapped rider', () => {
  const { state, options, train } = fixture(1);
  interactRail(state, world, railInteraction(state, world), options);
  for (let i = 0; i < 1800 && train.visits === 0; i++) updateRail(state, world, 0.5, options);
  updateRail(state, world, 1.01, options);
  const result = interactRail(state, world, railInteraction(state, world), options);
  assert.equal(result.ok, true);
  assert.equal(state.player.money, 0);
  assert.equal(result.receipt.owed, 1);
  assert.equal(state.transit.stats.fareOwed, 1);
  assert.equal(railPassenger(state), null);
});
test('saved rail passenger geometry rejects a changed body pose or simultaneous garage occupancy', () => {
  const { state, options } = fixture();
  interactRail(state, world, railInteraction(state, world), options);
  validateRailRuntime(state, world);
  const bad = JSON.parse(JSON.stringify(state));
  bad.player.x += 100;
  assert.throws(() => validateRailRuntime(bad, world), /passenger body/);
  const occupied = JSON.parse(JSON.stringify(state));
  occupied.player.vehicleId = 'starter-taxi';
  assert.throws(() => validateRailRuntime(occupied, world), /passenger body/);
});
