import assert from 'node:assert/strict';
import { LEGACY_WORLD } from '../../src/world.js';
import { createTerrain } from '../../src/terrain.js';
import {
  initializeRail,
  updateRail,
  railInteraction,
  interactRail,
  chooseRailStop,
  validateRailRuntime,
  createRailContext,
} from '../../src/rail-runtime.js';
import { createRailDispatcher } from '../../src/rail-dispatcher.js';
import { updateTransit } from '../../src/transit.js';
const copy = (value) => JSON.parse(JSON.stringify(value));
/** Declared rail-only parent fixture; all rail phases/fare/rider poses below use production APIs. */
export function createDispatchMigrationFixtures({
  trainIndex = 0,
  targetCall = 16,
  minY = 690,
  maxY = 710,
  targetX = 456,
} = {}) {
  const world = LEGACY_WORLD,
    terrain = createTerrain(world),
    options = { terrain },
    state = {
      time: 937,
      player: {
        x: 0,
        y: 0,
        z: 0,
        groundZ: 0,
        angle: 0,
        money: 1,
        health: 83,
        vehicleId: null,
        sceneId: null,
      },
      wanted: { level: 0 },
      scene: { kind: 'exterior', id: 'harbor-city' },
    };
  initializeRail(state, world);
  const train = state.transit.trains[trainIndex],
    service = world.transit.throughServices.find((s) => s.id === train.serviceId),
    platform = world.transit.stations
      .flatMap((s) => s.platforms)
      .find((p) => p.id === service.calls[0].platformId);
  Object.assign(state.player, platform.boardingPoint, { groundZ: platform.z });
  updateRail(state, world, 1.01, options);
  assert.equal(interactRail(state, world, railInteraction(state, world), options).ok, true);
  const opening = copy(state);
  for (
    let i = 0;
    i < 10000 && !(train.visits === 1 && ['opening', 'dwelling'].includes(train.phase));
    i++
  )
    updateRail(state, world, 0.25, options);
  assert.equal(train.visits, 1);
  updateRail(state, world, 1.01, options);
  assert.equal(interactRail(state, world, railInteraction(state, world), options).ok, true);
  assert.equal(state.player.money, 0);
  assert.equal(state.transit.tickets.find((t) => t.passengerId === 'mara-voss').owed, 1);
  assert.equal(interactRail(state, world, railInteraction(state, world), options).ok, true);
  const destination = service.calls.at(-1);
  assert.equal(
    chooseRailStop(state, world, destination.stationId, destination.platformId).ok,
    true,
  );
  for (
    let i = 0;
    i < 15000 &&
    !(
      train.callIndex === targetCall &&
      train.phase === 'moving' &&
      train.y > minY &&
      train.y < maxY &&
      Math.abs(train.x - targetX) < 1e-7
    );
    i++
  )
    updateRail(state, world, 0.25, options);
  assert.equal(train.callIndex, targetCall);
  assert.ok(train.y > minY && train.y < maxY && Math.abs(train.x - targetX) < 1e-7);
  validateRailRuntime(state, world);
  const moving = copy(state);
  const dispatch = createRailDispatcher(world, state.transit.trains, state.railSignals);
  dispatch.beginStep(state.transit.trains, state.transit.time);
  updateTransit(
    state.transit,
    world,
    0.25,
    createRailContext(state, world, {
      terrain,
      canDepart: dispatch.canDepart,
      canMoveTrain: () => false,
    }),
  );
  dispatch.endStep(state.transit.trains, state.transit.time);
  state.railSignals = dispatch.snapshot();
  assert.equal(train.phase, 'blocked');
  validateRailRuntime(state, world);
  return { opening, moving, blocked: copy(state) };
}
