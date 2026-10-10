import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createSimulation,
  updateSimulation,
  fireWeapon,
  reloadWeapon,
  selectWeapon,
  buyWeapon,
  buyAmmo,
  pickupWeapon,
  saveGame,
  restoreGame,
  toggleCover,
  jumpOrVault,
  throwTrajectory,
  interact,
  WORLD,
  WEAPONS,
} from '../src/simulation.js';
import { acquireWeapon } from '../src/combat.js';
import { INTERIOR_LAYOUTS } from '../src/interiors.js';

function free() {
  const state = createSimulation(2026);
  state.mission = null;
  state.dialogue = null;
  state.vehicles = [];
  state.pedestrians = [];
  state.police = [];
  state.hostiles = [];
  state.player.x = 780;
  state.player.y = 700;
  state.player.angle = 0;
  return state;
}
function tick(state, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds * 60); i++) updateSimulation(state, 1 / 60, input);
  return state;
}
function enemy(x, y, changes = {}) {
  return {
    id: 'opponent',
    kind: 'hostile',
    x,
    y,
    angle: Math.PI,
    health: 250,
    weapon: 'pistol',
    speed: 32,
    fireCooldown: 100,
    ...changes,
  };
}
function equip(state, id, amount = 100) {
  acquireWeapon(state, id, amount);
  state.player.fireCooldown = 0;
  state.player.reloadRemaining = 0;
  state.player.recoil = 0;
}
function atShop(state) {
  const shop = WORLD.locations.find((location) => location.type === 'weapons');
  state.player.x = shop.x;
  state.player.y = shop.y;
  return shop;
}

test('all17 researched weapon roles map to distinct original mechanics and a real supply path', async () => {
  const research = JSON.parse(
    await readFile(new URL('../docs/research/systems-source-map.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(
    Object.values(WEAPONS)
      .map((weapon) => weapon.catalogId)
      .sort(),
    research.inventories.weapons.map((weapon) => weapon.id).sort(),
  );
  const state = free();
  for (const id of Object.keys(WEAPONS)) {
    if (id === 'unarmed') {
      assert.ok(state.player.weapons.includes(id));
      continue;
    }
    const pickup = state.pickups.find((item) => item.weapon === id);
    assert.ok(pickup, `${id} requires an authored pickup`);
    assert.equal(isFinite(pickup.x) && isFinite(pickup.y), true);
    state.player.x = pickup.x;
    state.player.y = pickup.y;
    assert.equal(pickupWeapon(state, pickup.id), true, `${id} pickup must be obtainable`);
    assert.equal(state.player.weapon, id);
    assert.ok(state.player.ownedWeapons.includes(id));
    assert.equal(pickup.available, false);
    assert.equal(
      pickupWeapon(state, pickup.id),
      false,
      'a collected pickup cannot duplicate supply',
    );
  }
});

test('shop purchases enforce location, affordability, finite ammo and one carried weapon per class', () => {
  const state = free();
  state.player.money = 3000;
  assert.equal(buyWeapon(state, 'combat-pistol'), false);
  atShop(state);
  const money = state.player.money;
  assert.equal(buyWeapon(state, 'combat-pistol'), true);
  assert.equal(state.player.money, money - WEAPONS['combat-pistol'].cost);
  assert.equal(state.player.weapons.includes('pistol'), false);
  assert.ok(state.player.ownedWeapons.includes('pistol'));
  assert.ok(state.player.ownedWeapons.includes('combat-pistol'));
  assert.equal(selectWeapon(state, 'pistol'), true);
  assert.equal(state.player.weapons.includes('combat-pistol'), false);
  const clip = state.player.ammo.pistol.clip,
    reserve = state.player.ammo.pistol.reserve,
    before = state.player.money;
  assert.equal(buyWeapon(state, 'pistol'), true);
  assert.equal(state.player.money, before);
  assert.deepEqual(
    state.player.ammo.pistol,
    { clip, reserve },
    're-equipping owned weapons cannot mint ammo',
  );
  assert.equal(buyAmmo(state, 'pistol'), true);
  assert.equal(state.player.ammo.pistol.reserve, reserve + WEAPONS.pistol.clipSize * 3);
  state.player.money = 1;
  assert.equal(buyWeapon(state, 'rpg'), false);
  assert.equal(buyAmmo(state, 'pistol'), false);
});

test('fists hit after their windup, miss outside their cone, and heavyclub reaches beyond a knife', () => {
  const state = free();
  equip(state, 'unarmed', 0);
  state.hostiles = [enemy(800, 700)];
  assert.equal(fireWeapon(state), true);
  assert.equal(state.hostiles[0].health, 250);
  tick(state, 0.08);
  assert.equal(state.hostiles[0].health, 250);
  tick(state, 0.1);
  assert.equal(state.hostiles[0].health, 250 - WEAPONS.unarmed.damage);
  const wrongWay = free();
  equip(wrongWay, 'unarmed', 0);
  wrongWay.hostiles = [enemy(760, 700)];
  fireWeapon(wrongWay);
  tick(wrongWay, 0.2);
  assert.equal(wrongWay.hostiles[0].health, 250);
  const knife = free();
  equip(knife, 'knife', 0);
  knife.hostiles = [enemy(807, 700)];
  fireWeapon(knife);
  tick(knife, 0.2);
  assert.equal(knife.hostiles[0].health, 250);
  const club = free();
  equip(club, 'club', 0);
  club.hostiles = [enemy(807, 700)];
  fireWeapon(club, { heavyAttack: true });
  tick(club, 0.45);
  assert.ok(club.hostiles[0].health < 250 - WEAPONS.club.damage);
  assert.ok(club.player.stamina < 100);
});

test('timed front block opens a genuine counter/disarm window and an expired window rejects it', () => {
  const state = free();
  equip(state, 'unarmed', 0);
  state.hostiles = [enemy(800, 700, { fireCooldown: 0 })];
  tick(state, 0.18, { block: true });
  assert.equal(state.player.health, 100);
  assert.equal(state.player.counterTarget, 'opponent');
  updateSimulation(state, 1 / 60, { block: true, disarm: true });
  assert.equal(state.hostiles[0].weapon, 'unarmed');
  assert.equal(state.player.weapon, 'pistol');
  assert.ok(state.combatEffects.some((effect) => effect.type === 'disarm'));
  const counter = free();
  equip(counter, 'unarmed', 0);
  counter.hostiles = [enemy(800, 700, { fireCooldown: 0 })];
  tick(counter, 0.18, { block: true });
  updateSimulation(counter, 1 / 60, { counter: true });
  tick(counter, 0.15);
  assert.ok(counter.hostiles[0].health < 250);
  const late = free();
  late.hostiles = [enemy(800, 700)];
  late.player.counterTarget = 'opponent';
  late.player.counterUntil = -1;
  updateSimulation(late, 1 / 60, { disarm: true });
  assert.equal(late.hostiles[0].weapon, 'pistol');
});

test('dodge costs stamina and physically changes position instead of awarding a free escape', () => {
  const state = free(),
    start = state.player.y;
  updateSimulation(state, 1 / 60, { dodge: true });
  tick(state, 0.3);
  assert.ok(state.player.y > start + 25);
  assert.ok(state.player.stamina < 85);
  assert.ok(state.player.dodgeRemaining > 0);
});

test('handgun, pump, semiauto shotgun, SMGs, rifles and sniper cycles have distinct live firing behavior', () => {
  for (const id of [
    'pistol',
    'combat-pistol',
    'shotgun',
    'combat-shotgun',
    'smg',
    'full-smg',
    'assault-rifle',
    'carbine',
    'sniper',
    'combat-sniper',
  ]) {
    const state = free();
    equip(state, id);
    assert.equal(fireWeapon(state), true);
    assert.equal(state.bullets.length, WEAPONS[id].pellets);
    assert.equal(state.player.ammo[id].clip, WEAPONS[id].clipSize - 1);
    assert.equal(fireWeapon(state), false);
    assert.equal(state.bullets[0].damage, WEAPONS[id].damage);
    assert.ok(state.player.recoil > 0);
  }
  const bolt = free();
  equip(bolt, 'sniper');
  fireWeapon(bolt);
  tick(bolt, 0.6);
  assert.equal(fireWeapon(bolt), false);
  const semi = free();
  equip(semi, 'combat-sniper');
  fireWeapon(semi);
  tick(semi, 0.6);
  assert.equal(fireWeapon(semi), true);
  const rifle = free();
  equip(rifle, 'assault-rifle');
  tick(rifle, 0.6, { fire: true });
  assert.ok(rifle.player.ammo['assault-rifle'].clip < 27);
  assert.ok(WEAPONS['assault-rifle'].recoil > WEAPONS.carbine.recoil);
});

test('weapon restrictions allow handgun/compactSMG drive-by aiming and reject long arms, explosives and melee', () => {
  const state = createSimulation();
  state.dialogue = null;
  state.mission = null;
  const taxi = state.vehicles.find((car) => car.id === 'starter-taxi');
  state.player.vehicleId = taxi.id;
  taxi.occupied = true;
  for (const id of ['pistol', 'smg']) {
    equip(state, id);
    assert.equal(fireWeapon(state), true);
  }
  for (const id of ['shotgun', 'carbine', 'sniper', 'rpg', 'grenade', 'unarmed']) {
    equip(state, id);
    assert.equal(fireWeapon(state), false);
  }
  equip(state, 'pistol');
  updateSimulation(state, 1 / 60, { aimAngle: Math.PI / 2 });
  assert.equal(state.player.angle, Math.PI / 2);
});

test('every ballistic counterpart resolves an actual actor hit rather than only creating inventory metadata', () => {
  for (const [id, weapon] of Object.entries(WEAPONS).filter(
    ([, weapon]) => weapon.mode === 'ballistic',
  )) {
    const state = free();
    equip(state, id);
    const target = enemy(840, 700, { health: 500 });
    state.hostiles = [target];
    fireWeapon(state);
    tick(state, 0.2);
    assert.ok(target.health < 500, `${id} must damage a live actor`);
  }
});

test('knife has a quick close hit and heavyclub can strike two opponents during a sweep', () => {
  const knife = free();
  equip(knife, 'knife', 0);
  const victim = enemy(797, 700);
  knife.hostiles = [victim];
  fireWeapon(knife);
  tick(knife, 0.12);
  assert.ok(victim.health < 250);
  assert.ok(victim.bleedingRemaining > 0);
  const club = free();
  equip(club, 'club', 0);
  club.hostiles = [enemy(805, 697, { id: 'first' }), enemy(805, 705, { id: 'second' })];
  fireWeapon(club);
  tick(club, 0.3);
  assert.ok(club.hostiles.every((target) => target.health < 250));
});

test('reload can be interrupted without duplicating reserves and finite enemy ammo eventually runs dry', () => {
  const state = free();
  state.player.ammo.pistol = { clip: 1, reserve: 3 };
  reloadWeapon(state);
  tick(state, 0.4);
  selectWeapon(state, 'unarmed');
  assert.equal(state.player.reloadRemaining, 0);
  selectWeapon(state, 'pistol');
  assert.deepEqual(state.player.ammo.pistol, { clip: 1, reserve: 3 });
  reloadWeapon(state);
  tick(state, 1.3);
  assert.deepEqual(state.player.ammo.pistol, { clip: 4, reserve: 0 });
  const enemyState = free();
  enemyState.hostiles = [enemy(850, 700, { fireCooldown: 0, ammo: { clip: 1, reserve: 0 } })];
  tick(enemyState, 2);
  assert.equal(enemyState.hostiles[0].weapon, 'unarmed');
  assert.equal(enemyState.hostiles[0].ammo.clip, 0);
});

test('physical rockets explode at a backstop, damage exposed actors/vehicles and respect building occlusion', () => {
  const state = free(),
    b = WORLD.buildings[0];
  state.player.x = b.x - 30;
  state.player.y = b.y + 30;
  state.player.armour = 100;
  equip(state, 'rpg', 3);
  const exposed = enemy(b.x - 12, b.y + 10, { id: 'exposed' }),
    sheltered = enemy(b.x + 30, b.y - 8, { id: 'sheltered' });
  state.hostiles = [exposed, sheltered];
  state.vehicles = [
    { id: 'blast-car', spec: 'sedan', x: b.x - 15, y: b.y + 55, angle: 0, health: 115, speed: 0 },
  ];
  assert.equal(fireWeapon(state), true);
  assert.equal(state.ordnance[0].kind, 'rocket');
  assert.equal(state.player.ammo.rpg.clip, 0);
  tick(state, 0.35);
  assert.equal(state.ordnance.length, 0);
  assert.ok(exposed.health < 250);
  assert.equal(sheltered.health, 250);
  assert.ok(state.vehicles[0].health < 115);
  assert.ok(state.combatEffects.some((effect) => effect.type === 'explosion'));
  assert.ok(state.player.health < 100, 'firing near a backstop has genuine self-damage risk');
});

test('grenade has a finite fuse, gravity, bounce and damage after the delay', () => {
  const state = free();
  equip(state, 'grenade', 3);
  state.hostiles = [enemy(870, 700)];
  assert.equal(fireWeapon(state), true);
  assert.equal(state.player.ammo.grenade.clip, 2);
  const grenade = state.ordnance[0];
  tick(state, 1.1);
  assert.equal(state.ordnance.length, 1);
  assert.ok(grenade.bounces > 0);
  assert.ok(grenade.fuse > 0);
  assert.equal(state.hostiles[0].health, 250);
  tick(state, 1.9);
  assert.equal(state.ordnance.length, 0);
  assert.ok(state.hostiles[0].health < 250);
  assert.equal(reloadWeapon(state), false, 'throwables do not manufacture magazine reloads');
});

test('fire bottle breaks into a finite damaging surface fire and makes victims flee', () => {
  const state = free();
  equip(state, 'molotov', 2);
  const victim = enemy(858, 700);
  state.hostiles = [victim];
  fireWeapon(state);
  tick(state, 1);
  assert.equal(state.ordnance.length, 0);
  assert.ok(state.fires.length > 0);
  const start = victim.x,
    health = victim.health;
  tick(state, 1);
  assert.ok(victim.health < health);
  assert.ok(victim.x > start);
  tick(state, 7);
  assert.equal(state.fires.length, 0);
});

test('street objects have material-dependent breakage and reusable objects return as physical pickups', () => {
  for (const material of ['glass', 'metal', 'stone']) {
    const state = free();
    acquireWeapon(state, 'street-object', 1, { name: `Test ${material}`, material });
    const before = state.pickups.length;
    fireWeapon(state);
    assert.equal(state.player.ammo['street-object'].clip, 0);
    assert.equal(state.player.heldObject, null);
    tick(state, 1.3);
    assert.equal(state.ordnance.length, 0);
    const dropped = state.pickups.slice(before).find((item) => item.type === 'object');
    if (material === 'glass') assert.equal(dropped, undefined);
    else {
      assert.ok(dropped);
      state.player.x = dropped.x;
      state.player.y = dropped.y;
      assert.equal(pickupWeapon(state, dropped.id), true);
      assert.equal(state.player.heldObject.material, material);
    }
  }
});

test('improvised throws damage live opponents according to their material', () => {
  for (const [material, damage] of [
    ['glass', 8],
    ['metal', 15],
    ['stone', 24],
  ]) {
    const state = free();
    acquireWeapon(state, 'street-object', 1, { name: `Thrown ${material}`, material });
    const target = enemy(866, 700);
    state.hostiles = [target];
    fireWeapon(state);
    tick(state, 1);
    assert.equal(target.health, 250 - damage);
  }
});

test('aimed scope, crouch and cover alter actual stance/accuracy/movement while cover traversal respects walls', () => {
  const state = free();
  equip(state, 'sniper');
  updateSimulation(state, 1 / 60, { aim: true, crouch: true });
  assert.equal(state.player.scoped, true);
  assert.equal(state.player.crouching, true);
  const b = WORLD.buildings[0];
  state.player.x = b.x - 9;
  state.player.y = b.y + 40;
  assert.equal(toggleCover(state), true);
  assert.equal(state.player.cover.buildingId, b.id);
  const x = state.player.x,
    y = state.player.y;
  tick(state, 0.4, { moveY: 1 });
  assert.equal(state.player.x, x);
  assert.ok(state.player.y > y);
  assert.equal(state.player.crouching, true);
  updateSimulation(state, 1 / 60, { moveX: -1 });
  assert.equal(state.player.cover, null);
});

test('jump, obstacle vault and ledge climb follow timed height trajectories and land safely', () => {
  const jump = free();
  assert.equal(jumpOrVault(jump), true);
  tick(jump, 0.2);
  assert.ok(jump.player.z > 10);
  tick(jump, 1);
  assert.equal(jump.player.z, 0);
  for (const obstacle of WORLD.obstacles.filter(
    (item) => item.traversable !== false && (item.z ?? 0) === 0 && item.height <= 36,
  )) {
    const state = free();
    state.player.x = obstacle.x + obstacle.w / 2;
    state.player.y = obstacle.y - 12;
    state.player.angle = Math.PI / 2;
    assert.equal(
      jumpOrVault(state, { vaultOnly: true }),
      true,
      `${obstacle.id} must be traversable`,
    );
    assert.equal(state.player.traversal.kind, obstacle.height > 20 ? 'climb' : 'vault');
    tick(state, 0.2);
    assert.ok(state.player.z > 0);
    tick(state, 1);
    assert.equal(state.player.traversal, null);
    assert.equal(state.player.z, 0);
    assert.ok(state.player.y > obstacle.y + obstacle.h);
  }
});

test('cars block a grounded pedestrian but an actual vehicle vault crosses the parked car', () => {
  const state = free();
  state.player.x = 480;
  state.player.y = 700;
  state.vehicles = [
    { id: 'parked', spec: 'taxi', x: 504, y: 700, angle: 0, speed: 0, health: 120 },
  ];
  tick(state, 0.4, { moveX: 1 });
  assert.ok(state.player.x < 489);
  assert.equal(jumpOrVault(state, { vaultOnly: true }), true);
  tick(state, 0.8);
  assert.ok(state.player.x > 525);
  assert.equal(state.player.z, 0);
  assert.equal(state.player.traversal, null);
});

test('enemy launchers emit physical ordnance and depleted NPC supply cannot create endless shots', () => {
  const state = free();
  state.hostiles = [
    enemy(920, 700, { weapon: 'rpg', fireCooldown: 0, ammo: { clip: 1, reserve: 0 } }),
  ];
  updateSimulation(state, 1 / 60);
  assert.equal(state.ordnance.length, 1);
  assert.equal(state.ordnance[0].kind, 'rocket');
  assert.equal(state.bullets.length, 0);
  assert.equal(state.hostiles[0].ammo.clip, 0);
});

test('an elevated launcher fires a normalized downward rocket that physically hits a ground-level player', () => {
  const state = free();
  state.player.armour = 100;
  state.hostiles = [
    enemy(830, 700, { weapon: 'rpg', z: 60, fireCooldown: 0, ammo: { clip: 1, reserve: 0 } }),
  ];
  updateSimulation(state, 1 / 60);
  const rocket = state.ordnance[0];
  assert.ok(rocket);
  assert.ok(rocket.vz < 0);
  assert.ok(Math.abs(Math.hypot(rocket.vx, rocket.vy, rocket.vz) - WEAPONS.rpg.bulletSpeed) < 1e-6);
  tick(state, 0.6);
  assert.equal(state.ordnance.length, 0);
  assert.ok(state.player.health < 100);
  assert.ok(state.combatEffects.some((effect) => effect.type === 'explosion' && effect.z < 25));
});

test('missed upward rockets continue in height and remain valid deterministic saves above the old200unit ceiling', () => {
  const state = free();
  equip(state, 'rpg', 3);
  updateSimulation(state, 1 / 60, {
    aim: true,
    aimTarget: { x: state.player.x, y: state.player.y, z: 250 },
    fire: true,
  });
  tick(state, 1);
  assert.ok(state.ordnance[0].z > 200);
  const restored = restoreGame(saveGame(state));
  tick(state, 0.3);
  tick(restored, 0.3);
  assert.deepEqual(restored, state);
});

test('throw preview follows gravity and stops at terrain instead of predicting through buildings', () => {
  const state = free();
  equip(state, 'grenade', 3);
  const points = throwTrajectory(state);
  assert.ok(points.length > 4);
  assert.equal(points.at(-1).z, 0);
  const b = WORLD.buildings[0];
  state.player.x = b.x - 15;
  state.player.y = b.y + 30;
  state.player.angle = 0;
  const blocked = throwTrajectory(state);
  assert.ok(blocked.length < points.length);
  assert.ok(blocked.at(-1).x < b.x);
});

test('live ordnance, partial reload/traversal and pickup depletion survive deterministic save continuation', () => {
  const state = free();
  equip(state, 'grenade', 3);
  fireWeapon(state);
  tick(state, 0.4);
  const restored = restoreGame(saveGame(state));
  assert.deepEqual(restored.ordnance, state.ordnance);
  tick(state, 0.2);
  tick(restored, 0.2);
  assert.deepEqual(restored, state);
  const traversal = free(),
    obstacle = WORLD.obstacles[0];
  traversal.player.x = obstacle.x + 15;
  traversal.player.y = obstacle.y - 12;
  traversal.player.angle = Math.PI / 2;
  jumpOrVault(traversal);
  tick(traversal, 0.15);
  const restoredTraversal = restoreGame(saveGame(traversal));
  tick(traversal, 0.15);
  tick(restoredTraversal, 0.15);
  assert.deepEqual(restoredTraversal, traversal);
  const reloading = free();
  reloading.player.ammo.pistol = { clip: 2, reserve: 12 };
  reloadWeapon(reloading);
  tick(reloading, 0.6);
  const restoredReload = restoreGame(saveGame(reloading));
  tick(reloading, 0.7);
  tick(restoredReload, 0.7);
  assert.deepEqual(restoredReload, reloading);
  assert.equal(reloading.player.ammo.pistol.clip, 12);
  const depleted = free(),
    pickup = depleted.pickups.find((item) => item.weapon === 'club');
  depleted.player.x = pickup.x;
  depleted.player.y = pickup.y;
  pickupWeapon(depleted, pickup.id);
  const restoredPickup = restoreGame(saveGame(depleted));
  assert.equal(restoredPickup.pickups.find((item) => item.id === pickup.id).available, false);
});

test('respawned pickups keep a valid timer and remain available after Continue', () => {
  const state = free(),
    pickup = state.pickups.find((item) => item.respawnSeconds);
  Object.assign(state.player, { x: pickup.x, y: pickup.y });
  assert.equal(pickupWeapon(state, pickup.id), true);
  assert.equal(pickup.remaining, pickup.respawnSeconds);
  // This timer fixture starts within one fixed step of a real pickup's respawn.
  pickup.remaining = 0.01;
  const continued = restoreGame(saveGame(state));
  updateSimulation(continued, 1 / 60);
  const respawned = continued.pickups.find((item) => item.id === pickup.id);
  assert.equal(respawned.available, true);
  assert.equal(respawned.remaining, 0);
  const restored = restoreGame(saveGame(continued));
  assert.equal(restored.pickups.find((item) => item.id === pickup.id).remaining, 0);
  assert.equal(pickupWeapon(restored, pickup.id), true);
});

test('Continue repairs only the old completed pickup timer underflow', () => {
  const state = free(),
    pickup = state.pickups.find((item) => item.respawnSeconds);
  pickup.remaining = -1 / 120;
  const saved = JSON.parse(saveGame(state));
  const restored = restoreGame(saved);
  assert.equal(restored.pickups.find((item) => item.id === pickup.id).remaining, 0);
  assert.equal(restored.pickups.find((item) => item.id === pickup.id).available, true);
  for (const change of [{ remaining: -1 }, { available: false }, { respawnSeconds: 0 }]) {
    const corrupt = structuredClone(saved);
    Object.assign(
      corrupt.state.pickups.find((item) => item.id === pickup.id),
      change,
    );
    assert.throws(() => restoreGame(corrupt), /pickups/);
  }
});

test('legacy version1 saves gain new combat defaults while corrupt new records are rejected', () => {
  const legacy = JSON.parse(saveGame(createSimulation()));
  delete legacy.state.combatVersion;
  for (const field of ['ordnance', 'fires', 'combatEffects', 'pickups']) delete legacy.state[field];
  legacy.state.player.weapons = ['pistol'];
  delete legacy.state.player.ownedWeapons;
  for (const field of [
    'z',
    'vz',
    'crouching',
    'cover',
    'traversal',
    'recoil',
    'scoped',
    'aiming',
    'meleeAction',
    'defending',
    'defenseStarted',
    'counterUntil',
    'counterTarget',
    'dodgeRemaining',
    'dodgeAngle',
    'heldObject',
    'throwCharge',
    'attackSerial',
    'lastAttack',
  ])
    delete legacy.state.player[field];
  legacy.state.player.ammo = {
    pistol: { clip: 12, reserve: 48 },
    shotgun: { clip: 0, reserve: 0 },
    smg: { clip: 0, reserve: 0 },
  };
  const migrated = restoreGame(legacy);
  assert.ok(migrated.player.weapons.includes('unarmed'));
  assert.equal(Object.keys(migrated.player.ammo).length, 17);
  const bad = JSON.parse(saveGame(createSimulation()));
  bad.state.ordnance = [{ kind: 'rocket', x: 780, y: 700, z: 12, vx: Infinity }];
  assert.throws(() => restoreGame(bad), /ordnance/);
  const inventory = JSON.parse(saveGame(createSimulation()));
  inventory.state.player.ownedWeapons.push('not-a-weapon');
  assert.throws(() => restoreGame(inventory), /loadout/);
});

test('activity interaction hands control to a real minigame without granting money and rejects active assignments', () => {
  const state = free(),
    venue = WORLD.locations.find((location) => location.type === 'activity');
  state.player.x = venue.x;
  state.player.y = venue.y;
  state.pickups = [];
  const before = state.player.money;
  let result = interact(state);
  if (result.type === 'enter') {
    const hook = INTERIOR_LAYOUTS[state.interior.active.roomId].hooks.find(
      (hook) => hook.type === 'activity',
    );
    Object.assign(state.player, { x: hook.x, y: hook.y });
    result = interact(state);
  }
  assert.equal(result.type, 'activity');
  assert.equal(result.activity, venue.activity);
  assert.equal(state.player.money, before);
  state.mission = { id: 'first-shift', stage: 0, stageType: 'vehicle' };
  assert.equal(interact(state), null);
});
