import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireWeapon } from '../src/combat.js';
import {
  createSimulation,
  updateSimulation,
  saveGame,
  restoreGame,
  WORLD,
  TERRAIN,
  fireWeapon,
} from '../src/simulation.js';
const run = (s, seconds, input = {}) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) updateSimulation(s, 1 / 60, input);
};
function roam(point) {
  const state = createSimulation(123);
  state.mission = null;
  state.dialogue = null;
  state.wanted.level = 0;
  Object.assign(state.player, point, { z: point.z || 0, groundZ: point.z || 0 });
  return state;
}
test('full-city populations move along authored routes and retain identities across saves/revisits', () => {
  const area = WORLD.neighbourhoods.find((a) => a.profile === 'finance');
  const road = WORLD.roads.find(
    (r) => area.roadIds.includes(r.id) && r.access.includes('car') && !r.z,
  );
  const state = roam({ x: road.x1, y: road.y1 });
  run(state, 0.6);
  const active = state.pedestrians.filter((p) => p.ambientRegion);
  assert.ok(active.length > 0);
  const person = active.find((p) => p.health > 0),
    before = { x: person.x, y: person.y };
  run(state, 0.5);
  assert.ok(Math.hypot(person.x - before.x, person.y - before.y) > 1);
  assert.equal(TERRAIN.isBlocked(person.x, person.y, 6, person.z), false);
  const copy = restoreGame(saveGame(state));
  run(state, 0.2);
  run(copy, 0.2);
  assert.deepEqual(copy, state);
  const id = person.id;
  Object.assign(state.player, { x: 458, y: 700, z: 0, groundZ: 0 });
  run(state, 0.6);
  assert.ok(
    Object.values(state.ambient.dormant).some((bucket) =>
      bucket.pedestrians.some((p) => p.id === id),
    ),
  );
  Object.assign(state.player, { x: road.x1, y: road.y1, z: 0, groundZ: 0 });
  run(state, 0.6);
  assert.equal(state.pedestrians.filter((p) => p.id === id).length, 1);
});
test('bore saves accept negative ground heights and reject unsupported height corruption', () => {
  const road = WORLD.roads.find((r) => r.tunnel && r.z1 < 0 && r.z2 < 0);
  assert.ok(road, 'A bore needs a real flat underground section');
  const state = roam({ x: (road.x1 + road.x2) / 2, y: (road.y1 + road.y2) / 2, z: road.z1 });
  run(state, 0.1);
  assert.equal(state.player.z, road.z1);
  assert.deepEqual(restoreGame(saveGame(state)), JSON.parse(saveGame(state)).state);
  const corrupt = JSON.parse(saveGame(state));
  corrupt.state.player.groundZ = -10000;
  assert.throws(() => restoreGame(corrupt), /stance/);
});
test('aiming and saves support authored high roofs beyond the opening height cap', () => {
  const state = roam({ x: 780, y: 700 });
  const high = Math.max(...WORLD.buildings.map((b) => b.height));
  assert.ok(high > 250);
  run(state, 1 / 60, { aim: true, aimTarget: { x: 820, y: 700, z: high + 13 } });
  assert.equal(state.player.aimTarget.z, high + 13);
  state.police.push({
    id: 'rooftop-save',
    x: 780,
    y: 700,
    z: high,
    angle: 0,
    health: 100,
    armour: 0,
    weapon: 'pistol',
    fireCooldown: 0,
    speed: 0,
    role: 'overwatch',
  });
  assert.equal(restoreGame(saveGame(state)).police.at(-1).z, high);
});
test('underground bullets follow negative heights and cannot pass through the earth roof', () => {
  const road = WORLD.roads.find((r) => r.tunnel && r.z1 < 0 && r.z2 < 0);
  const state = roam({ x: (road.x1 + road.x2) / 2, y: (road.y1 + road.y2) / 2, z: road.z1 });
  state.vehicles = [];
  state.pedestrians = [];
  state.hostiles = [];
  state.player.angle = Math.atan2(road.y2 - road.y1, road.x2 - road.x1);
  assert.equal(fireWeapon(state), true);
  const bullet = state.bullets[0];
  assert.ok(bullet.z < 0);
  run(state, 0.1);
  assert.ok(state.bullets.length > 0, 'A horizontal tunnel shot must travel inside the bore');
  state.player.fireCooldown = 0;
  state.player.aimTarget = { x: state.player.x, y: state.player.y, z: 30 };
  fireWeapon(state);
  run(state, 0.1);
  assert.ok(
    state.bullets.every((b) => b.z < 0),
    'An upward shot must hit the earth roof',
  );
});

test('swimming trades stroke speed for stamina, floats to recover and blocks gunfire', () => {
  const lake = WORLD.lakes[0];
  const state = roam({ x: lake.x + lake.w / 2, y: lake.y + lake.h / 2 });
  state.player.stamina = 40;
  run(state, 0.1);
  assert.equal(state.player.swimming, true);
  assert.equal(fireWeapon(state), false);
  const rested = state.player.stamina;
  run(state, 1, { moveX: 1, sprint: true });
  assert.ok(state.player.stamina < rested - 10);
  const tired = state.player.stamina;
  run(state, 1);
  assert.ok(state.player.stamina > tired + 5);
  state.player.stamina = 0;
  const health = state.player.health;
  run(state, 0.5, { moveX: 1 });
  assert.ok(state.player.health < health);
  const hurt = state.player.health;
  run(state, 0.5);
  assert.equal(state.player.health, hurt);
  assert.ok(state.player.stamina > 2);
});

test('bore ceiling bounces grenades and keeps fire and recoverable objects on the underground floor', () => {
  const road = WORLD.roads.find((r) => r.tunnel && r.z1 < 0 && r.z1 === r.z2);
  const point = { x: (road.x1 + road.x2) / 2, y: (road.y1 + road.y2) / 2, z: road.z1 };
  const grenade = roam(point);
  grenade.pedestrians = [];
  grenade.vehicles = [];
  acquireWeapon(grenade, 'grenade', 1);
  assert.equal(fireWeapon(grenade), true);
  run(grenade, 0.15);
  assert.ok(grenade.ordnance[0].bounces > 0);
  assert.ok(grenade.ordnance[0].z < 0);
  assert.ok(grenade.ordnance[0].vz < 0);
  assert.deepEqual(restoreGame(saveGame(grenade)), JSON.parse(saveGame(grenade)).state);
  const fire = roam(point);
  fire.vehicles = [];
  fire.pedestrians = [];
  acquireWeapon(fire, 'molotov', 1);
  fireWeapon(fire);
  run(fire, 0.3);
  assert.ok(fire.fires.length > 0);
  assert.equal(fire.fires[0].z, road.z1);
  assert.equal(restoreGame(saveGame(fire)).fires[0].z, road.z1);
  const object = roam(point);
  object.vehicles = [];
  object.pedestrians = [];
  acquireWeapon(object, 'street-object', 1, { material: 'metal', name: 'Test tool' });
  fireWeapon(object);
  run(object, 0.3);
  const pickup = object.pickups.find((p) => p.name === 'Test tool');
  assert.ok(pickup);
  assert.equal(pickup.z, road.z1);
  assert.equal(restoreGame(saveGame(object)).pickups.find((p) => p.id === pickup.id).z, road.z1);
});
