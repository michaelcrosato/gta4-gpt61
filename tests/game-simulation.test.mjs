import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSimulation,
  updateSimulation,
  interact,
  fireWeapon,
  saveGame,
  restoreGame,
  nearestInteractable,
  startMission,
  reloadWeapon,
  selectWeapon,
  currentVehicle,
  isBlocked,
  WORLD,
  MISSIONS,
  WEAPONS,
  VEHICLE_SPECS,
} from '../src/simulation.js';

function tick(state, seconds, input = {}) {
  const frames = Math.round(seconds * 60);
  for (let frame = 0; frame < frames; frame += 1) updateSimulation(state, 1 / 60, input);
  return state;
}
function freeRoam(seed = 61) {
  const state = createSimulation(seed);
  state.mission = null;
  state.dialogue = null;
  state.police = [];
  state.hostiles = [];
  state.progress.completed = MISSIONS.map((mission) => mission.id);
  return state;
}
function clearDialogue(state) {
  while (state.dialogue) interact(state);
}
function relocate(state, point) {
  Object.assign(state.player, { x: point.x, y: point.y });
  const vehicle = currentVehicle(state);
  if (vehicle) Object.assign(vehicle, { x: point.x, y: point.y, speed: 0 });
}
function occupy(state, id) {
  const previous = currentVehicle(state);
  if (previous) previous.occupied = false;
  const vehicle = state.vehicles.find((item) => item.id === id);
  assert.ok(vehicle, `Expected ${id} to exist`);
  vehicle.occupied = true;
  state.player.vehicleId = vehicle.id;
  Object.assign(state.player, { x: vehicle.x, y: vehicle.y, angle: vehicle.angle });
}

test('city connects five districts with traversable roads and collision geometry', () => {
  assert.equal(WORLD.districts.length, 5);
  assert.ok(WORLD.buildings.length >= 35);
  assert.ok(WORLD.roads.every((road) => road.width >= 80));
  for (const road of WORLD.roads) {
    const samples = 20;
    for (let i = 0; i <= samples; i += 1) {
      const fraction = i / samples;
      assert.equal(
        isBlocked(
          road.x1 + (road.x2 - road.x1) * fraction,
          road.y1 + (road.y2 - road.y1) * fraction,
          10,
        ),
        false,
      );
    }
  }
});

test('seeded simulation and identical inputs reproduce traffic and player state', () => {
  const a = createSimulation(1234),
    b = createSimulation(1234);
  tick(a, 4, { moveX: 0.6, moveY: -0.3, sprint: true });
  tick(b, 4, { moveX: 0.6, moveY: -0.3, sprint: true });
  assert.deepEqual(a, b);
  const c = createSimulation(4321);
  assert.notDeepEqual(
    a.pedestrians.map((person) => person.speed),
    c.pedestrians.map((person) => person.speed),
  );
});

test('analog walking normalizes diagonal movement and respects buildings and bounds', () => {
  const state = freeRoam();
  state.vehicles = [];
  const start = { x: 780, y: 700 };
  relocate(state, start);
  tick(state, 0.5, { moveX: 1, moveY: 1 });
  assert.ok(Math.abs(Math.hypot(state.player.x - start.x, state.player.y - start.y) - 25.5) < 0.01);
  const building = WORLD.buildings[0];
  relocate(state, { x: building.x - 10, y: building.y + building.h / 2 });
  tick(state, 2, { moveX: 1 });
  assert.ok(state.player.x <= building.x - 7);
  relocate(state, { x: WORLD.bounds.left + 8, y: 700 });
  tick(state, 1, { moveX: -1 });
  assert.ok(state.player.x >= WORLD.bounds.left + 7);
});

test('sprinting consumes stamina and resting regenerates it', () => {
  const state = freeRoam();
  state.vehicles = [];
  tick(state, 2, { moveX: 1, sprint: true });
  assert.ok(state.player.stamina < 70);
  const tired = state.player.stamina;
  tick(state, 1);
  assert.ok(state.player.stamina > tired);
});

test('nearby taxi can be entered, driven with throttle and steering, and safely exited', () => {
  const state = freeRoam();
  state.pedestrians = [];
  const taxi = state.vehicles.find((vehicle) => vehicle.id === 'starter-taxi');
  state.vehicles = [taxi];
  relocate(state, taxi);
  assert.equal(nearestInteractable(state).type, 'vehicle');
  interact(state);
  assert.equal(state.player.vehicleId, taxi.id);
  const startingX = taxi.x;
  tick(state, 1, { forward: true });
  assert.ok(taxi.speed > 65);
  assert.ok(taxi.x < startingX - 30);
  const startingAngle = taxi.angle;
  tick(state, 0.1, { forward: true, right: true });
  assert.notEqual(taxi.angle, startingAngle);
  taxi.speed = 0;
  relocate(state, { x: 600, y: 700 });
  interact(state);
  assert.equal(state.player.vehicleId, null);
  assert.equal(taxi.occupied, false);
  assert.equal(isBlocked(state.player.x, state.player.y), false);
});

test('vehicle collision cannot tunnel through a building at maximum speed', () => {
  const state = freeRoam();
  state.pedestrians = [];
  const taxi = state.vehicles.find((vehicle) => vehicle.id === 'starter-taxi');
  state.vehicles = [taxi];
  occupy(state, taxi.id);
  const building = WORLD.buildings[0];
  relocate(state, { x: building.x - 35, y: building.y + 50 });
  taxi.angle = 0;
  taxi.speed = VEHICLE_SPECS.taxi.maxSpeed;
  updateSimulation(state, 0.5, { forward: true });
  assert.ok(taxi.x < building.x - VEHICLE_SPECS.taxi.width * 0.62);
  assert.ok(taxi.health < VEHICLE_SPECS.taxi.health);
});

test('player bullets consume ammunition, enforce cooldown, and damage targets', () => {
  const state = freeRoam();
  state.pedestrians = [];
  state.vehicles = [];
  relocate(state, { x: 480, y: 700 });
  state.player.angle = 0;
  state.hostiles = [
    {
      id: 'target',
      x: 540,
      y: 700,
      angle: Math.PI,
      health: 100,
      fireCooldown: 100,
      weapon: 'pistol',
    },
  ];
  assert.equal(fireWeapon(state), true);
  assert.equal(fireWeapon(state), false);
  assert.equal(state.player.ammo.pistol.clip, 11);
  tick(state, 0.2);
  assert.equal(state.hostiles[0].health, 100 - WEAPONS.pistol.damage);
  assert.equal(state.bullets.length, 0);
});

test('bullets stop at solid walls instead of damaging people behind them', () => {
  const state = freeRoam();
  state.pedestrians = [];
  state.vehicles = [];
  const building = WORLD.buildings[0];
  relocate(state, { x: building.x - 20, y: building.y + 50 });
  state.player.angle = 0;
  state.hostiles = [
    {
      id: 'behind-wall',
      x: building.x + building.w + 20,
      y: state.player.y,
      angle: Math.PI,
      health: 100,
      fireCooldown: 100,
      weapon: 'pistol',
    },
  ];
  fireWeapon(state);
  tick(state, 0.5);
  assert.equal(state.hostiles[0].health, 100);
  assert.equal(state.bullets.length, 0);
});

test('reload transfers finite reserves and blocks firing until complete', () => {
  const state = freeRoam();
  state.player.ammo.pistol = { clip: 2, reserve: 5 };
  assert.equal(reloadWeapon(state), true);
  assert.equal(fireWeapon(state), false);
  tick(state, WEAPONS.pistol.reloadTime + 0.1);
  assert.deepEqual(state.player.ammo.pistol, { clip: 7, reserve: 0 });
  assert.equal(reloadWeapon(state), false);
  assert.equal(selectWeapon(state, 'smg'), false);
});

test('assaulting civilians creates police pursuit and leaving the search clears it', () => {
  const state = freeRoam();
  state.vehicles = [];
  state.pedestrians = [];
  relocate(state, { x: 480, y: 700 });
  state.player.angle = 0;
  state.pedestrians.push({
    id: 'civilian',
    x: 530,
    y: 700,
    health: 100,
    speed: 0,
    angle: Math.PI / 2,
    homeX: 530,
    minY: 690,
    maxY: 710,
    panic: 0,
  });
  fireWeapon(state);
  tick(state, 0.1);
  assert.equal(state.wanted.level, 2);
  assert.equal(state.wanted.status, 'pursuit');
  state.police = [];
  state.pedestrians = [];
  relocate(state, { x: 1620, y: 1220 });
  // Patrol remains at its last known position: this checks the actual cooling state machine.
  state.police = [
    {
      id: 'distant-patrol',
      kind: 'police',
      x: 180,
      y: 180,
      health: 100,
      speed: 0,
      angle: 0,
      fireCooldown: 100,
    },
  ];
  state.wanted.level = 1;
  state.wanted.searchRadius = 185;
  tick(state, 13);
  assert.equal(state.wanted.level, 0);
  assert.equal(state.wanted.status, 'clear');
});

test('armour absorbs damage, death fails the assignment, and clinic respawn restores control', () => {
  const state = createSimulation();
  state.dialogue = null;
  state.player.armour = 20;
  state.bullets = [
    {
      id: 'injury',
      owner: 'enemy',
      x: state.player.x,
      y: state.player.y,
      prevX: state.player.x,
      prevY: state.player.y,
      vx: 0,
      vy: 0,
      remaining: 10,
      damage: 40,
    },
  ];
  updateSimulation(state, 1 / 60);
  assert.equal(state.player.armour, 0);
  assert.equal(state.player.health, 80);
  state.bullets = [
    {
      id: 'lethal',
      owner: 'enemy',
      x: state.player.x,
      y: state.player.y,
      prevX: state.player.x,
      prevY: state.player.y,
      vx: 0,
      vy: 0,
      remaining: 10,
      damage: 200,
    },
  ];
  updateSimulation(state, 1 / 60);
  assert.equal(state.player.health, 0);
  assert.equal(state.mission, null);
  assert.equal(state.progress.failed[0].id, 'first-shift');
  tick(state, 3);
  assert.equal(state.player.health, 100);
  assert.equal(state.progress.deaths, 1);
  assert.equal(state.player.money, 160);
  assert.equal(state.player.vehicleId, null);
  assert.equal(startMission(state, 'first-shift'), true);
});

test('opening assignment requires its taxi and pays only after every authored stage', () => {
  const state = createSimulation();
  clearDialogue(state);
  relocate(state, MISSIONS[0].stages[0].target);
  interact(state);
  assert.equal(state.mission.stageType, 'vehicle');
  occupy(state, 'starter-taxi');
  updateSimulation(state, 1 / 60);
  assert.equal(state.mission.stage, 2);
  for (let index = 2; index < MISSIONS[0].stages.length; index += 1) {
    const stage = MISSIONS[0].stages[index];
    assert.equal(state.mission.stage, index);
    clearDialogue(state);
    relocate(state, stage.target);
    if (stage.type === 'interact') interact(state);
    else updateSimulation(state, 1 / 60);
  }
  assert.equal(state.mission, null);
  assert.deepEqual(state.progress.completed, ['first-shift']);
  assert.equal(state.player.money, 240 + MISSIONS[0].reward);
  assert.equal(startMission(state, 'first-shift'), false);
  assert.equal(startMission(state, 'glass-house'), false);
  assert.equal(startMission(state, 'collection-day'), true);
});

test('collection assignment spawns its ambush, waits for victory, then demands a police escape', () => {
  const state = createSimulation();
  state.mission = null;
  state.dialogue = null;
  state.progress.completed = ['first-shift'];
  assert.equal(startMission(state, 'collection-day'), true);
  for (let index = 0; index < 3; index += 1) {
    clearDialogue(state);
    relocate(state, state.mission.target);
    interact(state);
  }
  assert.equal(state.mission.stageType, 'combat');
  assert.equal(state.hostiles.length, 3);
  updateSimulation(state, 1 / 60);
  assert.equal(state.mission.stageType, 'combat');
  state.hostiles.forEach((hostile) => {
    hostile.health = 0;
  });
  updateSimulation(state, 1 / 60);
  assert.equal(state.mission.stageType, 'escape');
  assert.equal(state.wanted.level, 2);
  state.wanted.level = 0;
  updateSimulation(state, 1 / 60);
  assert.equal(state.mission.stageType, 'interact');
  clearDialogue(state);
  relocate(state, state.mission.target);
  interact(state);
  assert.equal(state.mission, null);
  assert.ok(state.progress.completed.includes('collection-day'));
});

test('freight requires its cargo van, fails its timed window, and supports retry', () => {
  const state = createSimulation();
  state.mission = null;
  state.dialogue = null;
  state.progress.completed = ['first-shift', 'collection-day'];
  startMission(state, 'cold-freight');
  clearDialogue(state);
  relocate(state, state.mission.target);
  interact(state);
  assert.ok(state.vehicles.some((vehicle) => vehicle.id === 'medicine-van'));
  occupy(state, 'starter-taxi');
  updateSimulation(state, 1 / 60);
  assert.equal(state.mission.stageType, 'vehicle');
  occupy(state, 'medicine-van');
  updateSimulation(state, 1 / 60);
  assert.equal(state.mission.stageType, 'drive');
  state.mission.stageElapsed = 160;
  updateSimulation(state, 1 / 60);
  assert.equal(state.mission, null);
  assert.match(state.progress.failed.at(-1).reason, /window/);
  assert.equal(startMission(state, 'cold-freight'), true);
});

test('an unmet vehicle objective does not prevent getting back into its nearby vehicle', () => {
  const state = createSimulation();
  state.dialogue = null;
  state.mission.stage = 3;
  state.mission.stageType = 'interact';
  state.mission.target = structuredClone(MISSIONS[0].stages[3].target);
  const taxi = state.vehicles.find((vehicle) => vehicle.id === 'starter-taxi');
  Object.assign(taxi, { x: state.mission.target.x, y: state.mission.target.y, speed: 0 });
  relocate(state, { x: taxi.x + 20, y: taxi.y });
  assert.equal(nearestInteractable(state).type, 'vehicle');
  interact(state);
  assert.equal(state.player.vehicleId, taxi.id);
  assert.equal(nearestInteractable(state).type, 'objective');
  interact(state);
  assert.equal(state.mission.stage, 4);
});

test('freight ambush can be completed and its destroyed van is restored for a retry', () => {
  const state = createSimulation();
  state.mission = null;
  state.dialogue = null;
  state.progress.completed = ['first-shift', 'collection-day'];
  startMission(state, 'cold-freight');
  clearDialogue(state);
  relocate(state, state.mission.target);
  interact(state);
  occupy(state, 'medicine-van');
  updateSimulation(state, 1 / 60);
  for (let index = 2; index < MISSIONS[2].stages.length; index += 1) {
    const stage = MISSIONS[2].stages[index];
    clearDialogue(state);
    if (stage.target) relocate(state, stage.target);
    if (stage.type === 'combat') {
      assert.equal(state.hostiles.length, 4);
      state.hostiles.forEach((hostile) => {
        hostile.health = 0;
      });
    }
    if (stage.type === 'interact') interact(state);
    else updateSimulation(state, 1 / 60);
  }
  assert.ok(state.progress.completed.includes('cold-freight'));
  assert.equal(state.player.money, 240 + MISSIONS[2].reward);
  const retry = createSimulation();
  retry.mission = null;
  retry.dialogue = null;
  retry.progress.completed = ['first-shift', 'collection-day'];
  startMission(retry, 'cold-freight');
  clearDialogue(retry);
  relocate(retry, retry.mission.target);
  interact(retry);
  occupy(retry, 'medicine-van');
  updateSimulation(retry, 1 / 60);
  const van = currentVehicle(retry);
  van.health = 0;
  retry.player.vehicleId = null;
  updateSimulation(retry, 1 / 60);
  assert.equal(retry.mission, null);
  startMission(retry, 'cold-freight');
  assert.equal(van.health, VEHICLE_SPECS.van.health);
});

test('evidence mission demands an on-foot pickup, allows escaping guards, and delivers the proof', () => {
  const state = createSimulation();
  state.mission = null;
  state.dialogue = null;
  state.progress.completed = ['first-shift', 'collection-day', 'cold-freight'];
  startMission(state, 'glass-house');
  clearDialogue(state);
  relocate(state, state.mission.target);
  interact(state);
  clearDialogue(state);
  occupy(state, 'starter-taxi');
  relocate(state, state.mission.target);
  interact(state);
  assert.equal(state.player.vehicleId, null);
  assert.equal(state.mission.stage, 1);
  clearDialogue(state);
  relocate(state, state.mission.target);
  interact(state);
  assert.equal(state.mission.stageType, 'reach');
  assert.equal(state.hostiles.length, 3);
  clearDialogue(state);
  relocate(state, state.mission.target);
  updateSimulation(state, 1 / 60);
  assert.equal(state.mission.stageType, 'escape');
  state.wanted.level = 0;
  updateSimulation(state, 1 / 60);
  clearDialogue(state);
  relocate(state, state.mission.target);
  interact(state);
  assert.equal(state.mission, null);
  assert.ok(state.progress.completed.includes('glass-house'));
  assert.equal(state.player.money, 240 + MISSIONS[3].reward);
});

test('food, garage and weapon shops enforce costs and change durable state', () => {
  const state = freeRoam();
  state.player.money = 2000;
  state.player.health = 35;
  relocate(
    state,
    WORLD.locations.find((location) => location.type === 'food'),
  );
  interact(state);
  assert.equal(state.player.health, 70);
  assert.equal(state.player.money, 1982);
  relocate(
    state,
    WORLD.locations.find((location) => location.type === 'weapons'),
  );
  state.vehicles = state.vehicles.filter(
    (vehicle) => Math.hypot(vehicle.x - state.player.x, vehicle.y - state.player.y) > 40,
  );
  interact(state);
  assert.ok(state.player.weapons.includes('shotgun'));
  assert.equal(state.player.weapon, 'shotgun');
  assert.equal(state.player.ammo.shotgun.clip, WEAPONS.shotgun.clipSize);
  const taxi = state.vehicles.find((vehicle) => vehicle.id === 'starter-taxi');
  occupy(state, taxi.id);
  taxi.health = 25;
  relocate(
    state,
    WORLD.locations.find((location) => location.type === 'garage'),
  );
  const before = state.player.money;
  interact(state);
  assert.equal(taxi.health, VEHICLE_SPECS.taxi.health);
  assert.equal(state.player.money, before - 120);
});

test('repeatable taxi fares require a taxi and pay a fare plus time-based tip', () => {
  const state = freeRoam();
  state.pedestrians = [];
  occupy(state, 'starter-taxi');
  relocate(
    state,
    WORLD.locations.find((location) => location.type === 'taxi'),
  );
  interact(state);
  assert.equal(state.taxiJob.stage, 'pickup');
  relocate(state, state.taxiJob.target);
  updateSimulation(state, 1 / 60);
  assert.equal(state.taxiJob.stage, 'dropoff');
  const before = state.player.money;
  relocate(state, state.taxiJob.target);
  updateSimulation(state, 1 / 60);
  assert.equal(state.taxiJob, null);
  assert.equal(state.progress.fares, 1);
  assert.ok(state.player.money >= before + 140);
});

test('save roundtrip preserves an in-progress encounter and deterministic continuation', () => {
  const original = createSimulation(90210);
  tick(original, 2, { moveX: 1 });
  const saved = saveGame(original);
  const restored = restoreGame(saved);
  assert.equal(restored.mission.id, original.mission.id);
  assert.equal(restored.mission.stage, original.mission.stage);
  assert.deepEqual(restored.player, original.player);
  tick(original, 1, { moveY: 1 });
  tick(restored, 1, { moveY: 1 });
  assert.deepEqual(restored, original);
});

test('restore rejects unsupported versions, corrupt ammo, and missing mission or vehicle references', () => {
  assert.throws(() => restoreGame('{bad'), /JSON/);
  const saved = JSON.parse(saveGame(createSimulation()));
  assert.throws(() => restoreGame({ ...saved, version: 999 }), /version/);
  const badAmmo = structuredClone(saved);
  badAmmo.state.player.ammo.pistol.clip = 999;
  assert.throws(() => restoreGame(badAmmo), /ammunition/);
  const badMission = structuredClone(saved);
  badMission.state.mission.stage = 99;
  assert.throws(() => restoreGame(badMission), /assignment/);
  const badVehicle = structuredClone(saved);
  badVehicle.state.player.vehicleId = 'missing';
  assert.throws(() => restoreGame(badVehicle), /vehicle/);
  const badPosition = structuredClone(saved);
  badPosition.state.player.x = NaN;
  assert.throws(() => restoreGame(badPosition), /corrupted/);
});
