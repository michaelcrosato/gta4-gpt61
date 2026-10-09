/** Native declared car/actor setup followed by real boarding and ordinary
 * public fire. No friendly immunity, actor health edits or mission outcomes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSimulation,
  updateSimulation,
  interact,
  nearestInteractable,
  WEAPONS,
  WORLD,
  TERRAIN,
} from '../src/simulation.js';
import { ensureNamedActor, requestBoard, getSeat } from '../src/companions.js';
import { acquireWeapon } from '../src/combat.js';
import { createCampaignPhysicalContext } from '../src/campaign/physical-context.js';
import { createSceneContext } from '../src/scene-context.js';
import { findLocalFootPath } from '../src/local-navigation.js';
import { VEHICLE_SPECS } from '../src/simulation.js';
const BASE = createSimulation(2026),
  DT = 1 / 60;
const copy = (v) => JSON.parse(JSON.stringify(v));
function fixture({ passenger = true } = {}) {
  const s = copy(BASE);
  s.mission = null;
  s.dialogue = null;
  s.vehicles = [];
  s.pedestrians = [];
  s.police = [];
  s.hostiles = [];
  s.bullets = [];
  s.pickups = [];
  Object.assign(s.player, {
    x: 183.48,
    y: 423.5,
    z: 0,
    groundZ: 0,
    angle: 0,
    sceneId: null,
    vehicleId: null,
  });
  acquireWeapon(s, 'pistol', 6);
  s.player.ammo.pistol = { clip: 6, reserve: 0 };
  const car = {
    id: 'capsule-taxi',
    spec: 'taxi',
    kind: 'parked',
    owned: true,
    x: 180,
    y: 440,
    z: 0,
    groundZ: 0,
    angle: 0,
    speed: 0,
    health: 120,
    occupied: false,
    route: null,
    routeIndex: 0,
    blockedTime: 0,
    stolen: false,
  };
  s.vehicles.push(car);
  const cc = createCampaignPhysicalContext(s, {
    world: WORLD,
    terrain: TERRAIN,
    specs: VEHICLE_SPECS,
    scenes: createSceneContext(WORLD, TERRAIN),
    localPath: findLocalFootPath,
  });
  let felix = null;
  if (passenger) {
    felix = ensureNamedActor(
      s,
      { id: 'LL-CHAR-002', name: 'Felix', x: 183.48, y: 456.5, z: 0, sceneId: null, health: 100 },
      cc,
    );
    assert.equal(requestBoard(s, felix.id, car.id, cc).ok, true);
    for (let i = 0; i < 100 && !getSeat(s, felix.id); i++) updateSimulation(s, DT, { brake: true });
    assert.equal(getSeat(s, felix.id).seat, 1);
    assert.equal(felix.radius, 3);
    assert.equal(felix.collisionHeight, 8);
  }
  return { s, car, felix, cc };
}
function finishShot(s, seconds = 0.4) {
  for (let i = 0; i < Math.round(seconds * 60); i++) updateSimulation(s, DT, { brake: true });
}

test('real drive-by muzzle clears its actual seated companion capsule and hits the intended outside body', () => {
  const f = fixture(),
    target = ensureNamedActor(
      f.s,
      {
        id: 'capsule-outside-target',
        name: 'Outside target',
        x: 330,
        y: 395,
        z: 0,
        sceneId: null,
        health: 100,
      },
      f.cc,
    );
  assert.equal(nearestInteractable(f.s).id, f.car.id);
  assert.equal(interact(f.s).type, 'vehicle');
  assert.equal(f.s.player.vehicleId, f.car.id);
  updateSimulation(f.s, DT, {
    brake: true,
    aim: true,
    aimAngle: Math.atan2(target.y - f.s.player.y, target.x - f.s.player.x),
    fire: true,
  });
  finishShot(f.s);
  assert.equal(f.s.player.ammo.pistol.clip, 5);
  assert.equal(f.car.health, 120);
  assert.equal(
    f.felix.health,
    100,
    'The radius3 seated body plus projectile margin must not reach backward beyond the10-unit muzzle',
  );
  assert.equal(target.health, 100 - WEAPONS.pistol.damage);
  assert.equal(getSeat(f.s, f.felix.id).seat, 1);
});

test('an actual outside shooter can still hit the seated friendly body through its real capsule', () => {
  const f = fixture();
  assert.equal(interact(f.s).type, 'vehicle');
  assert.equal(interact(f.s).type, 'exit');
  assert.equal(f.s.player.vehicleId, null);
  const seat = getSeat(f.s, f.felix.id).pose;
  updateSimulation(f.s, DT, {
    aim: true,
    aimAngle: Math.atan2(seat.y - f.s.player.y, seat.x - f.s.player.x),
    aimTarget: { x: seat.x, y: seat.y, z: seat.z + 4 },
    fire: true,
  });
  finishShot(f.s, 0.2);
  assert.equal(f.s.player.ammo.pistol.clip, 5);
  assert.equal(
    f.felix.health,
    100 - WEAPONS.pistol.damage,
    'Correct capsule size must not introduce friendly or own-car immunity',
  );
  assert.equal(f.car.health, 120);
});

test('ordinary on-foot radius7 retains the existing9-unit bullet capsule margin', () => {
  const f = fixture({ passenger: false });
  f.s.vehicles = [];
  Object.assign(f.s.player, { x: 180, y: 440, angle: 0 });
  const target = ensureNamedActor(
    f.s,
    {
      id: 'capsule-standing-target',
      name: 'Standing target',
      x: 330,
      y: 447,
      z: 0,
      sceneId: null,
      health: 100,
    },
    f.cc,
  );
  assert.equal(target.radius, 7);
  updateSimulation(f.s, DT, { aim: true, crouch: true, aimAngle: 0, fire: true });
  finishShot(f.s);
  assert.equal(target.health, 100 - WEAPONS.pistol.damage);
  assert.equal(f.s.player.ammo.pistol.clip, 5);
});
