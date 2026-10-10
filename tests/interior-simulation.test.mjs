import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSimulation,
  updateSimulation,
  interact,
  nearestInteractable,
  fireWeapon,
  saveGame,
  restoreGame,
  buyWeapon,
  getEquipmentStore,
  equipmentPrice,
  WORLD,
  MISSIONS,
  toggleCover,
  jumpOrVault,
} from '../src/simulation.js';
import {
  INTERIOR_LAYOUTS,
  PORTAL_DEFINITIONS,
  interiorActors,
  setInteriorDoor,
  exitInterior,
} from '../src/interiors.js';
import { acquireWeapon } from '../src/combat.js';
const tick = (s, t, input = {}) => {
  for (let i = 0; i < Math.round(t * 60); i++) updateSimulation(s, 1 / 60, input);
};
function free() {
  const s = createSimulation(314);
  s.mission = null;
  s.dialogue = null;
  s.progress.completed = MISSIONS.map((m) => m.id);
  return s;
}
function enter(s, id) {
  const p = PORTAL_DEFINITIONS.find((p) => p.roomId === id),
    location = WORLD.locations.find((l) => l.id === p.locationId);
  Object.assign(s.player, { x: location.x, y: location.y, z: 0, groundZ: 0 });
  const car = s.vehicles.find((v) => v.id === s.player.vehicleId);
  if (car) Object.assign(car, { x: location.x, y: location.y, speed: 0 });
  assert.equal(interact(s).type, 'enter');
  assert.equal(s.interior.active.roomId, id);
  return INTERIOR_LAYOUTS[id];
}
function hook(s, type) {
  const h = INTERIOR_LAYOUTS[s.interior.active.roomId].hooks.find(
    (h) => h.service === type || h.activity === type,
  );
  Object.assign(s.player, { x: h.x, y: h.y });
  return h;
}

test('portal entry uses the shared walking, jump, collision and physical open-door return mechanics', () => {
  const s = free(),
    room = enter(s, 'voss-dispatch');
  assert.equal(s.player.sceneId, room.id);
  tick(s, 2, { moveY: -1 });
  assert.ok(s.player.y >= 93, 'The dispatch desk blocks shared walking');
  const before = s.player.z;
  assert.equal(jumpOrVault(s), true);
  tick(s, 0.15);
  assert.ok(s.player.z > before);
  tick(s, 1);
  assert.equal(s.player.z, 0);
  Object.assign(s.player, { x: 168, y: 212 });
  assert.equal(nearestInteractable(s).type, 'door');
  interact(s);
  assert.equal(s.interior.rooms[room.id].doors['front-door'].open, true);
  tick(s, 1, { moveY: 1 });
  assert.equal(s.interior.active, null);
  assert.equal(s.player.sceneId, null);
  assert.ok(Math.hypot(s.player.x - 458, s.player.y - 700) < 100);
});
test('garage keeps an actual vehicle, charges its repair and preserves local/exterior ownership in whole saves', () => {
  const s = free(),
    car = s.vehicles.find((v) => v.id === 'starter-taxi');
  car.occupied = true;
  car.health = 25;
  s.player.vehicleId = car.id;
  enter(s, 'saira-garage');
  assert.equal(car.scene.id, 'saira-garage');
  Object.assign(s.player, { x: 105, y: 168 });
  Object.assign(car, { x: 105, y: 168 });
  const money = s.player.money;
  assert.equal(interact(s).type, 'repair');
  assert.equal(car.health, 120);
  assert.equal(s.player.money, money - 120);
  const restored = restoreGame(saveGame(s));
  assert.equal(restored.interior.active.vehicleId, car.id);
  assert.equal(restored.vehicles.find((v) => v.id === car.id).x, 105);
  exitInterior(s, { world: WORLD }, { emergency: true });
  assert.equal(car.scene, null);
  assert.equal(car.health, 120);
  assert.equal(s.player.sceneId, null);
});
test('a slow multi-step frame drops held room movement as soon as the physical portal returns outside', () => {
  const s = free();
  enter(s, 'voss-dispatch');
  tick(s, 0.5);
  setInteriorDoor(s, 'front-door', { open: true });
  Object.assign(s.player, { x: 168, y: 218 });
  updateSimulation(s, 0.5, { moveY: 1 });
  assert.equal(s.interior.active, null);
  assert.equal(s.player.sceneId, null);
  assert.ok(
    Math.hypot(s.player.x - 458, s.player.y - 700) < 1e-6,
    'remaining fixed steps must not replay local movement in the exterior',
  );
});
test('room-local bullets and off-scene fires cannot hit exterior people or an interior player at matching coordinates', () => {
  const s = free();
  enter(s, 'voss-dispatch');
  Object.assign(s.player, { x: 168, y: 147, angle: 0 });
  s.hostiles = [
    {
      id: 'outside-same-coordinate',
      x: 205,
      y: 147,
      z: 0,
      health: 100,
      weapon: 'pistol',
      fireCooldown: 100,
      speed: 0,
      angle: 0,
    },
  ];
  s.fires = [
    {
      id: 'outside-fire',
      x: 168,
      y: 147,
      z: 0,
      radius: 15,
      maxRadius: 15,
      remaining: 10,
      damage: 50,
      owner: 'enemy',
      sceneId: null,
    },
  ];
  const health = s.player.health;
  assert.equal(fireWeapon(s), true);
  tick(s, 0.2);
  assert.equal(s.hostiles[0].health, 100);
  assert.equal(s.player.health, health);
  assert.ok(s.fires[0].remaining < 10, 'Off-scene fire clocks still advance');
});
test('indoor weapon pickups use the normal interaction and persist as collected after Continue', () => {
  const s = free();
  enter(s, 'voss-dispatch');
  Object.assign(s.player, { x: 112, y: 118, angle: 0 });
  const pickup = {
    id: 'indoor-dropped-shotgun',
    type: 'weapon',
    weapon: 'shotgun',
    sceneId: 'voss-dispatch',
    x: 117,
    y: 118,
    z: 0,
    ammo: 4,
    available: true,
    remaining: 0,
  };
  s.pickups.push(pickup);
  assert.equal(nearestInteractable(s)?.id, pickup.id);
  assert.equal(interact(s)?.type, 'pickup');
  assert.equal(pickup.available, false);
  assert.equal(s.player.weapon, 'shotgun');
  assert.equal(s.player.ammo.shotgun.clip, 4);
  assert.equal(s.player.sceneId, 'voss-dispatch');
  const restored = restoreGame(saveGame(s));
  assert.equal(restored.pickups.find((item) => item.id === pickup.id).available, false);
  assert.equal(restored.player.ammo.shotgun.clip, 4);
});
test('exterior interactions exclude room pickups and vehicles at matching local coordinates', () => {
  const s = free();
  Object.assign(s.player, { x: 180, y: 180 });
  s.pickups = [
    {
      id: 'room-pickup',
      type: 'weapon',
      weapon: 'shotgun',
      sceneId: 'voss-dispatch',
      x: 180,
      y: 180,
      z: 0,
      ammo: 4,
      available: true,
      remaining: 0,
    },
  ];
  const car = s.vehicles.find((item) => item.id === 'starter-taxi');
  Object.assign(car, { x: 180, y: 180, scene: { kind: 'interior', id: 'saira-garage' } });
  s.vehicles = [car];
  assert.notEqual(nearestInteractable(s)?.id, 'room-pickup');
  s.pickups = [];
  assert.notEqual(nearestInteractable(s)?.id, car.id);
  interact(s);
  assert.equal(s.player.vehicleId, null);
  assert.equal(car.occupied, false);
});
test('actual indoor gunfire damages an occupant and reports the exterior entrance through the witness delay', () => {
  const s = free();
  enter(s, 'voss-dispatch');
  Object.assign(s.player, { x: 100, y: 40 });
  const actor = interiorActors(s)[0];
  tick(s, 1 / 60, { aim: true, aimTarget: { x: actor.x, y: actor.y, z: 26 } });
  fireWeapon(s);
  tick(s, 0.2);
  assert.ok(actor.health < 100, 'The native room occupant must be a combat target');
  assert.ok(s.policeDispatch.reports.some((r) => r.witnessId === actor.id));
  tick(s, 3);
  assert.ok(s.wanted.level >= 1);
  assert.equal(s.wanted.lastSeen.x, 458);
  assert.equal(s.wanted.lastSeen.y, 700);
  assert.deepEqual(restoreGame(saveGame(s)), JSON.parse(saveGame(s)).state);
});
test('owned room cover, doors and persistent NPC damage survive the whole-game save boundary', () => {
  const s = free();
  enter(s, 'voss-dispatch');
  Object.assign(s.player, { x: 206, y: 178 });
  assert.equal(toggleCover(s), true);
  const actor = interiorActors(s)[0];
  actor.health = 61;
  setInteriorDoor(s, 'records-door', { open: true });
  const restored = restoreGame(saveGame(s));
  assert.equal(restored.player.cover.roomId, 'voss-dispatch');
  assert.equal(interiorActors(restored)[0].health, 61);
  assert.equal(restored.interior.rooms['voss-dispatch'].doors['records-door'].open, true);
  const bad = JSON.parse(saveGame(s));
  bad.state.interior.active.roomId = 'invented-room';
  assert.throws(() => restoreGame(bad), /interior|room|identity|portal/);
});
test('workshop purchases enforce physical reach, stock, wallet and paid consumable replenishment', () => {
  const s = free();
  enter(s, 'saira-garage');
  assert.equal(getEquipmentStore(s), null);
  hook(s, 'garage-parts');
  assert.equal(getEquipmentStore(s).id, 'workshop');
  assert.equal(equipmentPrice(s, 'knife'), 60);
  const money = s.player.money;
  assert.equal(buyWeapon(s, 'knife'), true);
  assert.equal(s.player.money, money - 60);
  assert.equal(buyWeapon(s, 'pistol'), false);
  assert.equal(buyWeapon(s, 'street-object'), true);
  const first = s.player.money;
  assert.equal(buyWeapon(s, 'street-object'), true);
  assert.equal(s.player.money, first - 12);
  assert.equal(s.player.heldObject.material, 'metal');
  assert.deepEqual(restoreGame(saveGame(s)), JSON.parse(saveGame(s)).state);
});
test('bar and bowling hooks perform actual refreshment and activity handoffs without an exterior coordinate shortcut', () => {
  const s = free();
  enter(s, 'lantern-bar');
  hook(s, 'bar-drink');
  const money = s.player.money;
  assert.equal(interact(s).type, 'refreshment');
  assert.equal(s.player.money, money - 12);
  assert.equal(s.player.intoxication, 0.25);
  hook(s, 'darts');
  assert.equal(interact(s).activity, 'darts');
  exitInterior(s, { world: WORLD }, { emergency: true });
  enter(s, 'blue-hour-lanes');
  hook(s, 'bowling');
  assert.equal(interact(s).activity, 'bowling');
  s.mission = { id: 'first-shift', stage: 0, stageType: 'vehicle' };
  assert.equal(interact(s), null);
});
test('incapacitation retains the room until normal clinic recovery returns to a valid exterior', () => {
  const s = free();
  enter(s, 'voss-dispatch');
  s.player.health = 1;
  s.fires = [
    {
      id: 'local-fatal-fire',
      sceneId: 'voss-dispatch',
      x: s.player.x,
      y: s.player.y,
      z: 0,
      radius: 20,
      maxRadius: 20,
      remaining: 5,
      damage: 100,
      owner: 'enemy',
    },
  ];
  tick(s, 0.1);
  assert.equal(s.player.health, 0);
  assert.equal(s.interior.active.roomId, 'voss-dispatch');
  assert.ok(s.respawnTimer > 0);
  const deadSave = restoreGame(saveGame(s));
  tick(deadSave, 3);
  assert.equal(deadSave.interior.active, null);
  assert.equal(deadSave.player.sceneId, null);
  assert.equal(deadSave.player.health, 100);
  assert.equal(deadSave.player.x, 180);
  assert.equal(deadSave.player.y, 960);
});

test('shared gunfire destroys a room prop and that physical destruction survives leaving and saving', () => {
  const s = free();
  enter(s, 'voss-dispatch');
  Object.assign(s.player, { x: 250, y: 80, angle: 0 });
  for (let i = 0; i < 4; i++) {
    assert.equal(fireWeapon(s), true);
    tick(s, 0.3);
  }
  assert.equal(s.interior.rooms['voss-dispatch'].props['files-cabinet'].health, 0);
  const saved = restoreGame(saveGame(s));
  exitInterior(saved, { world: WORLD }, { emergency: true });
  enter(saved, 'voss-dispatch');
  assert.equal(saved.interior.rooms['voss-dispatch'].props['files-cabinet'].health, 0);
});

test('a scene-tagged hostile uses shared indoor firing while exterior enemies remain separated', () => {
  const s = free();
  enter(s, 'voss-dispatch');
  Object.assign(s.player, { x: 100, y: 120 });
  s.hostiles = [
    {
      id: 'room-attacker',
      sceneId: 'voss-dispatch',
      x: 100,
      y: 160,
      z: 0,
      angle: -Math.PI / 2,
      health: 100,
      weapon: 'pistol',
      fireCooldown: 0,
      speed: 0,
    },
  ];
  const health = s.player.health;
  tick(s, 0.3);
  assert.ok(s.player.health < health);
  assert.ok(s.bullets.every((b) => b.sceneId === 'voss-dispatch'));
  const bad = JSON.parse(saveGame(s));
  bad.state.hostiles[0].sceneId = 'constructor';
  assert.throws(() => restoreGame(bad), /scene/);
});

test('repeated exterior updates do not pin an indoor garage car to a one-frame acceleration pulse', () => {
  const s = free(),
    car = s.vehicles.find((v) => v.id === 'starter-taxi');
  car.occupied = true;
  s.player.vehicleId = car.id;
  enter(s, 'saira-garage');
  const start = car.y;
  tick(s, 0.6, { up: true });
  assert.ok(
    Math.abs(car.speed) > 20,
    'the car must retain acceleration across actual simulation steps',
  );
  assert.ok(start - car.y > 8, 'real indoor driving must reach beyond the doorway spawn');
  assert.equal(s.interior.active.roomId, 'saira-garage');
});
