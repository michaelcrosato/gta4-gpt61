import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSimulation,
  nearestInteractable,
  interact,
  WORLD,
  WEAPONS,
  MISSIONS,
} from '../src/simulation.js';

test('the assigned starter taxi wins when its entry radius overlaps the dispatch room door', () => {
  const state = createSimulation();
  while (state.dialogue) interact(state);
  interact(state);
  while (state.dialogue) interact(state);
  assert.equal(state.mission.stageType, 'vehicle');
  assert.equal(nearestInteractable(state).id, 'starter-taxi');
  assert.equal(interact(state).type, 'vehicle');
  assert.equal(state.player.vehicleId, 'starter-taxi');
  assert.equal(state.interior.active, null);
});

test('driving near a foot-only room entrance still offers a real vehicle exit', () => {
  const state = createSimulation();
  state.mission = null;
  state.dialogue = null;
  state.progress.completed = MISSIONS.map((m) => m.id);
  const car = state.vehicles.find((car) => car.id === 'starter-taxi');
  const venue = WORLD.locations.find((location) => location.id === 'lantern-darts');
  Object.assign(car, { x: venue.x, y: venue.y, speed: 0, occupied: true });
  Object.assign(state.player, { x: venue.x, y: venue.y, vehicleId: car.id });
  assert.equal(nearestInteractable(state).type, 'exit');
  interact(state);
  assert.equal(state.player.vehicleId, null);
  assert.equal(state.interior.active, null);
});

function freeRoam() {
  const state = createSimulation(61);
  state.mission = null;
  state.dialogue = null;
  state.player.vehicleId = null;
  state.player.money = 1000;
  return state;
}

test('standing at a shop marker selects the shop and allows a purchase beside stopped traffic', () => {
  const state = freeRoam();
  Object.assign(state.player, { x: 1380, y: 440 });
  state.vehicles = [
    {
      id: 'parked-by-shop',
      kind: 'traffic',
      spec: 'sedan',
      x: 1372,
      y: 454,
      health: 115,
      speed: 0,
      angle: 0,
      occupied: false,
    },
  ];
  assert.equal(nearestInteractable(state).type, 'weapons');
  const result = interact(state);
  assert.equal(result.type, 'weapons');
  assert.equal(state.player.vehicleId, null);
  assert.ok(state.player.ownedWeapons.includes('shotgun'));
  assert.equal(state.player.money, 1000 - WEAPONS.shotgun.cost);
});

test('outside the exact service marker a nearby car remains a normal vehicle interaction', () => {
  const state = freeRoam();
  Object.assign(state.player, { x: 1355, y: 440 });
  state.vehicles = [
    {
      id: 'nearby-car',
      kind: 'traffic',
      spec: 'sedan',
      x: 1357,
      y: 441,
      health: 115,
      speed: 0,
      angle: 0,
      occupied: false,
    },
  ];
  assert.equal(nearestInteractable(state).type, 'vehicle');
  interact(state);
  assert.equal(state.player.vehicleId, 'nearby-car');
});

test('a required nearby taxi still wins over a service at a vehicle-gated objective', () => {
  const state = createSimulation(61);
  state.dialogue = null;
  state.mission.stage = 3;
  state.mission.stageType = 'interact';
  state.mission.target = { x: 180, y: 440, name: 'Ferry passenger', radius: 35 };
  Object.assign(state.player, { x: 180, y: 440, vehicleId: null });
  const taxi = state.vehicles.find((vehicle) => vehicle.id === 'starter-taxi');
  Object.assign(taxi, { x: 201, y: 445, speed: 0 });
  // A synthetic nearby vendor tests the conflict without changing campaign rules.
  const vendor = {
    id: 'test-ferry-vendor',
    type: 'food',
    x: 180,
    y: 440,
    cost: 18,
    name: 'Ferry vendor',
  };
  WORLD.locations.push(vendor);
  try {
    assert.equal(nearestInteractable(state).id, 'starter-taxi');
    const before = state.player.money;
    interact(state);
    assert.equal(state.player.vehicleId, 'starter-taxi');
    assert.equal(state.player.money, before);
  } finally {
    WORLD.locations.splice(WORLD.locations.indexOf(vendor), 1);
  }
});
