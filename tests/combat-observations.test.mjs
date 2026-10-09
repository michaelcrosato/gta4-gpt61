import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeCombat,
  acquireWeapon,
  hitCombatant,
  fireCombatWeapon,
  updateMelee,
  updateOrdnance,
  WEAPONS,
} from '../src/combat.js';
import { createSimulation, fireWeapon, setCampaignObservationHandlers } from '../src/simulation.js';

// These declared component fixtures exercise the real combat functions and
// public observer registry. They do not advance or complete an authored mission.
function fixture() {
  const state = {
    time: 12.5,
    player: {
      x: 0,
      y: 0,
      z: 0,
      angle: 0,
      health: 100,
      armour: 0,
      stamina: 100,
      speed: 0,
      weapon: 'pistol',
      weapons: ['pistol'],
      ammo: { pistol: { clip: 12, reserve: 24 } },
      fireCooldown: 0,
      reloadRemaining: 0,
    },
    progress: { kills: 0 },
    wanted: { level: 0 },
    weather: { rain: 0 },
    lastInput: {},
    hostiles: [],
    police: [],
    pedestrians: [],
    vehicles: [],
    bullets: [],
  };
  initializeCombat(state);
  const damage = [],
    attacks = [],
    vehicleHits = [];
  let sequence = 0,
    randomCalls = 0,
    reloads = 0;
  const context = {
    sceneId: null,
    id: (prefix) => `${prefix}-${++sequence}`,
    random: () => {
      randomCalls++;
      return 0.5;
    },
    hasLineOfSight: () => true,
    isBlocked: () => false,
    surfaceHeight: () => 0,
    moveBody: (body, dx, dy) => {
      body.x += dx;
      body.y += dy;
    },
    damagePlayer: () => {},
    damageVehicle: (vehicle, amount, owner, kind) => {
      vehicleHits.push({ vehicle, amount, owner, kind });
      vehicle.health = Math.max(0, vehicle.health - amount);
    },
    reload: () => reloads++,
    notify: () => {},
    onDamage: (event) => damage.push(event),
    onAttack: (event) => attacks.push(event),
  };
  return {
    state,
    context,
    damage,
    attacks,
    vehicleHits,
    randomCalls: () => randomCalls,
    reloads: () => reloads,
  };
}
const actor = (changes = {}) => ({
  id: 'fixture-actor',
  kind: 'hostile',
  health: 100,
  x: 20,
  y: 0,
  z: 0,
  angle: Math.PI,
  ...changes,
});
const vehicle = (changes = {}) => ({
  id: 'fixture-car',
  spec: 'sedan',
  health: 500,
  x: 95,
  y: 0,
  z: 0,
  angle: 0,
  ...changes,
});
function equip(f, id, amount = 10) {
  acquireWeapon(f.state, id, amount);
  f.state.player.fireCooldown = 0;
}
function advanceOrdnance(f, seconds) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    f.state.time += 1 / 60;
    updateOrdnance(f.state, 1 / 60, f.context);
  }
}

test('resolved damage reports post-armour harm and immutable physical facts', () => {
  const f = fixture(),
    target = actor({ kind: 'police', armour: 20, x: 42, y: -17, z: -18 });
  f.state.police.push(target);
  hitCombatant(f.state, target, 40, 'player', f.context);
  assert.equal(target.health, 80, 'twenty armour absorbs twenty of the forty-point hit');
  assert.equal(target.armour, 0);
  assert.deepEqual(f.damage, [
    {
      entityType: 'actor',
      targetId: 'fixture-actor',
      targetKind: 'police',
      owner: 'player',
      kind: 'bullet',
      healthBefore: 100,
      healthAfter: 80,
      armourBefore: 20,
      armourAfter: 0,
      x: 42,
      y: -17,
      z: -18,
      sceneId: null,
      at: 12.5,
    },
  ]);
  assert.ok(Object.isFrozen(f.damage[0]));
  assert.throws(() => (f.damage[0].owner = 'other'), TypeError);
  target.x = 900;
  target.health = 1;
  f.state.time = 99;
  assert.equal(f.damage[0].x, 42);
  assert.equal(f.damage[0].healthAfter, 80);
  assert.equal(f.damage[0].at, 12.5);
});

test('zero damage and already dead bodies emit no harm; lethal delta is capped by life', () => {
  const f = fixture(),
    target = actor({ health: 7 });
  f.state.hostiles.push(target);
  hitCombatant(f.state, target, 0, 'player', f.context);
  assert.equal(f.damage.length, 0);
  hitCombatant(f.state, target, 200, 'LL-ARC-REEVE', f.context, 'blast');
  assert.equal(target.health, 0);
  assert.equal(f.damage.length, 1);
  assert.equal(f.damage[0].healthBefore - f.damage[0].healthAfter, 7);
  assert.equal(f.damage[0].owner, 'LL-ARC-REEVE');
  assert.equal(f.damage[0].kind, 'blast');
  hitCombatant(f.state, target, 10, 'player', f.context);
  assert.equal(f.damage.length, 1);
  assert.equal(f.state.progress.kills, 0, 'an NPC-owned kill is not credited to Mara');
});

test('damage preserves actual interior coordinates and actor scene identity', () => {
  const f = fixture(),
    target = actor({ scene: { kind: 'interior', id: 'impound-annex' }, x: 36, y: 194 });
  f.context.sceneId = 'dispatch-office';
  hitCombatant(f.state, target, 5, 'player', f.context, 'strike');
  assert.equal(f.damage[0].sceneId, 'impound-annex');
  assert.deepEqual([f.damage[0].x, f.damage[0].y, f.damage[0].z], [36, 194, 0]);
  assert.equal(f.damage[0].kind, 'strike');
});

test('an actual missed shot emits one committed attack after ammunition and serial change', () => {
  const f = fixture(),
    snapshots = [];
  f.state.player.x = 81;
  f.state.player.y = 93;
  f.state.player.z = 16;
  f.context.sceneId = 'impound-annex';
  f.context.onAttack = (event) => {
    f.attacks.push(event);
    snapshots.push({ clip: f.state.player.ammo.pistol.clip, serial: f.state.player.attackSerial });
  };
  assert.equal(fireCombatWeapon(f.state, f.context), true);
  assert.deepEqual(snapshots, [{ clip: 11, serial: 1 }]);
  assert.deepEqual(f.attacks[0], {
    owner: 'player',
    kind: 'ballistic',
    weapon: 'pistol',
    angle: 0,
    x: 81,
    y: 93,
    z: 16,
    sceneId: 'impound-annex',
    at: 12.5,
    serial: 1,
  });
  assert.ok(Object.isFrozen(f.attacks[0]));
  assert.throws(() => (f.attacks[0].at = -1), TypeError);
  assert.equal(f.state.bullets.length, 1, 'a real outbound projectile exists despite no target');
  assert.equal(f.state.bullets[0].owner, 'player');
  assert.equal(f.damage.length, 0, 'firing into empty space is an attack, without invented harm');
  assert.equal(f.randomCalls(), 1);
  assert.equal(fireCombatWeapon(f.state, f.context), false, 'cooldown prevents a duplicate attack');
  assert.equal(f.attacks.length, 1);
  assert.equal(f.state.player.ammo.pistol.clip, 11);
  f.state.player.x = 500;
  f.state.time = 80;
  assert.equal(f.attacks[0].x, 81);
  assert.equal(f.attacks[0].at, 12.5);
});

test('blocked combat actions spend no ammo, serial or RNG and emit no attack', () => {
  for (const changes of [
    { health: 0 },
    { fireCooldown: 0.1 },
    { reloadRemaining: 1 },
    { traversal: { kind: 'vault' } },
    { swimming: true },
    { defending: true },
  ]) {
    const f = fixture();
    Object.assign(f.state.player, changes);
    assert.equal(fireCombatWeapon(f.state, f.context), false);
    assert.equal(f.state.player.ammo.pistol.clip, 12);
    assert.equal(f.state.player.attackSerial, 0);
    assert.equal(f.randomCalls(), 0);
    assert.equal(f.attacks.length, 0);
  }
  const empty = fixture();
  empty.state.player.ammo.pistol.clip = 0;
  assert.equal(fireCombatWeapon(empty.state, empty.context), false);
  assert.equal(empty.reloads(), 1);
  assert.equal(empty.attacks.length, 0);
  const tired = fixture();
  equip(tired, 'unarmed');
  tired.state.player.stamina = 6;
  assert.equal(fireCombatWeapon(tired.state, tired.context), false);
  assert.equal(tired.state.player.attackSerial, 0);
});

test('real melee windup carries player ownership and strike kind to vehicle damage', () => {
  const f = fixture(),
    car = vehicle({ x: 20 });
  f.state.vehicles.push(car);
  equip(f, 'unarmed');
  assert.equal(fireCombatWeapon(f.state, f.context), true);
  assert.equal(f.attacks.length, 1);
  assert.equal(f.attacks[0].kind, 'strike');
  assert.equal(f.state.player.stamina, 93);
  updateMelee(f.state, 0.1, f.context);
  assert.equal(f.vehicleHits.length, 0, 'starting an animation is not yet vehicle harm');
  updateMelee(f.state, 0.03, f.context);
  assert.equal(f.vehicleHits.length, 1);
  assert.equal(f.vehicleHits[0].vehicle, car);
  assert.equal(f.vehicleHits[0].amount, 7.2);
  assert.equal(f.vehicleHits[0].owner, 'player');
  assert.equal(f.vehicleHits[0].kind, 'strike');
  updateMelee(f.state, 0.2, f.context);
  assert.equal(f.vehicleHits.length, 1, 'the same strike cannot resolve twice');
});

test('a real thrown grenade retains ownership through fuse, bounce and vehicle blast callback', () => {
  const f = fixture(),
    car = vehicle();
  f.state.vehicles.push(car);
  equip(f, 'grenade', 2);
  assert.equal(fireCombatWeapon(f.state, f.context), true);
  assert.equal(f.state.player.ammo.grenade.clip, 1);
  assert.equal(f.attacks[0].kind, 'throwable');
  const grenade = f.state.ordnance[0];
  advanceOrdnance(f, 1.2);
  assert.ok(grenade.bounces > 0);
  assert.equal(f.vehicleHits.length, 0);
  advanceOrdnance(f, 1.8);
  assert.equal(f.state.ordnance.length, 0);
  assert.equal(f.vehicleHits.length, 1);
  assert.equal(f.vehicleHits[0].vehicle, car);
  assert.equal(f.vehicleHits[0].owner, 'player');
  assert.equal(f.vehicleHits[0].kind, 'blast');
  assert.ok(f.vehicleHits[0].amount > 0);
  assert.ok(car.health < 500);
});

test('molotov-created surface fire retains its actual NPC owner in vehicle harm', () => {
  const f = fixture(),
    car = vehicle({ x: 75 });
  f.state.vehicles.push(car);
  equip(f, 'molotov', 1);
  assert.equal(fireCombatWeapon(f.state, f.context), true);
  // Explicit ordnance-owner fixture represents an NPC throw, then runs the
  // unchanged flight/impact/fire code; no synthetic damage callback is invoked.
  f.state.ordnance[0].owner = 'LL-ARC-REEVE';
  advanceOrdnance(f, 1.1);
  assert.equal(f.state.ordnance.length, 0);
  assert.equal(f.state.fires.length, 1);
  assert.ok(f.vehicleHits.length > 0);
  assert.ok(f.vehicleHits.every((hit) => hit.owner === 'LL-ARC-REEVE' && hit.kind === 'fire'));
  assert.ok(car.health < 500);
  const before = f.vehicleHits.length;
  f.context.sceneId = 'impound-annex';
  advanceOrdnance(f, 0.2);
  assert.equal(f.vehicleHits.length, before, 'another scene cannot receive this exterior fire');
});

test('public registry isolates states and mission owners, unregisters and replaces handlers', () => {
  const first = createSimulation(321),
    second = createSimulation(321),
    firstEvents = [],
    secondEvents = [],
    unrelated = [],
    replacement = [];
  first.campaign = { active: { missionId: 'LL-ST-002' } };
  second.campaign = { active: { missionId: 'LL-ST-002' } };
  setCampaignObservationHandlers(first, 'LL-ST-002', {
    attack: (event) => firstEvents.push(event),
  });
  setCampaignObservationHandlers(first, 'LL-ST-003', { attack: (event) => unrelated.push(event) });
  setCampaignObservationHandlers(second, 'LL-ST-002', {
    attack: (event) => secondEvents.push(event),
  });
  assert.equal(fireWeapon(first), true);
  assert.equal(firstEvents.length, 1);
  assert.equal(secondEvents.length, 0);
  assert.equal(unrelated.length, 0);
  assert.equal(fireWeapon(second), true);
  assert.equal(secondEvents.length, 1);
  setCampaignObservationHandlers(first, 'LL-ST-002', {
    attack: (event) => replacement.push(event),
  });
  first.player.fireCooldown = 0;
  assert.equal(fireWeapon(first), true);
  assert.equal(firstEvents.length, 1);
  assert.equal(replacement.length, 1);
  setCampaignObservationHandlers(first, 'LL-ST-002', null);
  first.player.fireCooldown = 0;
  assert.equal(fireWeapon(first), true);
  assert.equal(replacement.length, 1);
  first.campaign.active.missionId = 'LL-ST-003';
  first.player.fireCooldown = 0;
  assert.equal(fireWeapon(first), true);
  assert.equal(unrelated.length, 1);
  assert.doesNotThrow(() => JSON.stringify(first), 'callbacks remain outside saved state');
});

test('an actual arrival cinematic suppresses public attacks and observer notifications', () => {
  const state = createSimulation({ seed: 321, campaign: true }),
    events = [];
  assert.ok(state.cinematics.active);
  setCampaignObservationHandlers(state, 'LL-ST-001', { attack: (event) => events.push(event) });
  const clip = state.player.ammo.pistol.clip,
    serial = state.player.attackSerial,
    rng = state.rng;
  assert.equal(fireWeapon(state), false);
  assert.equal(events.length, 0);
  assert.equal(state.player.ammo.pistol.clip, clip);
  assert.equal(state.player.attackSerial, serial);
  assert.equal(state.rng, rng);
});

test('observer registration rejects malformed owners, unknown hooks and nonfunctions', () => {
  const state = {};
  for (const [owner, handlers] of [
    ['Late Meter', { damage() {} }],
    ['LL-ST-002', {}],
    ['LL-ST-002', { harm() {} }],
    ['LL-ST-002', { attack: true }],
    ['LL-ST-002', []],
  ])
    assert.throws(() => setCampaignObservationHandlers(state, owner, handlers), TypeError);
  assert.throws(
    () => setCampaignObservationHandlers(null, 'LL-ST-002', { attack() {} }),
    TypeError,
  );
  assert.doesNotThrow(() => setCampaignObservationHandlers(state, 'LL-ST-002', null));
});
