import test from 'node:test';
import assert from 'node:assert/strict';
import { trainContainsBody, railGateBlocked, updateRailImpacts } from '../src/rail-collision.js';
import { WORLD } from '../src/world.js';
const config = { cars: 2, carLength: 32, couplerGap: 4, trainWidth: 20, trainHeight: 16 };
test('rotated train bodies use the actual consist and separate elevated/subway occupants', () => {
  const train = { x: 100, y: 100, z: 18, heading: Math.PI / 2 };
  assert.equal(trainContainsBody(train, { x: 100, y: 129, z: 18 }, config), true);
  assert.equal(trainContainsBody(train, { x: 129, y: 100, z: 18 }, config), false);
  assert.equal(trainContainsBody(train, { x: 100, y: 100, z: 0 }, config, 7, 18), false);
  assert.equal(trainContainsBody({ ...train, z: -18 }, { x: 100, y: 100, z: 0 }, config), false);
});
test('only closed gates block their car level and clearing the signal restores the road', () => {
  const world = {
    transit: { railCrossings: [{ id: 'g', roadZ: 0, bounds: { x: 90, y: 90, w: 20, h: 20 } }] },
  };
  const state = { railSignals: { closedGates: ['g'] } };
  assert.equal(railGateBlocked(state, world, 100, 100), true);
  assert.equal(railGateBlocked(state, world, 100, 100, 9, 28), false);
  state.railSignals.closedGates = [];
  assert.equal(railGateBlocked(state, world, 100, 100), false);
});
test('moving trains damage actual street bodies once per impact cooldown and preserve interior/passenger separation', () => {
  const state = {
    time: 0,
    player: { x: 100, y: 100, z: 0, health: 100, sceneId: null },
    pedestrians: [{ id: 'room', x: 100, y: 100, z: 0, health: 100, sceneId: 'voss-dispatch' }],
    police: [],
    hostiles: [],
    vehicles: [{ id: 'car', spec: 'sedan', x: 100, y: 100, z: 0, health: 115, speed: 20 }],
    transit: {
      config,
      trains: [{ id: 'train', x: 100, y: 100, z: 0, heading: 0, speed: 40 }],
      passengers: [],
    },
  };
  const options = {
    damagePlayer: (n) => (state.player.health = Math.max(0, state.player.health - n)),
    damageVehicle: (v, n) => (v.health = Math.max(0, v.health - n)),
  };
  updateRailImpacts(state, 1 / 60, options);
  assert.equal(state.player.health, 4);
  assert.equal(state.vehicles[0].health, 35);
  assert.equal(state.pedestrians[0].health, 100);
  updateRailImpacts(state, 1 / 60, options);
  assert.equal(state.player.health, 4);
  state.time = 1;
  state.transit.passengers = [{ id: 'mara-voss', trainId: 'train' }];
  updateRailImpacts(state, 1 / 60, options);
  assert.equal(state.player.health, 4);
});
test('closed signals reject an entire fast crossing sweep while allowing cars already inside to leave', () => {
  const world = {
    transit: { railCrossings: [{ id: 'g', roadZ: 0, bounds: { x: 90, y: 90, w: 20, h: 20 } }] },
  };
  const state = { railSignals: { closedGates: ['g'] } };
  assert.equal(railGateBlocked(state, world, 150, 100, 9, 0, { x: 50, y: 100 }), true);
  assert.equal(railGateBlocked(state, world, 150, 120, 9, 0, { x: 50, y: 120 }), false);
  assert.equal(railGateBlocked(state, world, 150, 100, 9, 0, { x: 100, y: 100 }), false);
  assert.equal(railGateBlocked(state, world, 150, 100, 9, 28, { x: 50, y: 100 }), false);
});
test('the actual tunnel crossing signal blocks its recorded underground road level', () => {
  const gate = WORLD.transit.railCrossings.find((gate) => gate.id === 'rail-road-gate:1');
  assert.equal(gate.points[0].roadZ, -18);
  const state = { railSignals: { closedGates: [gate.id] } };
  assert.equal(railGateBlocked(state, WORLD, 6549, 9350, 9, -18, { x: 6640, y: 9350 }), true);
  assert.equal(railGateBlocked(state, WORLD, 6549, 9350, 9, 0, { x: 6640, y: 9350 }), false);
});
