/** Shared physical combat component tests. Declared native-world/canonical actor
 * setup, real startActorMelee parent commands and actual guard/disarm/counter
 * inputs. They do not implement Dax's authored injury/retreat or M3 completion.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSimulation,
  updateSimulation,
  saveGame,
  restoreGame,
  pickupWeapon,
  scenePeople,
  WORLD,
} from '../src/simulation.js';
import {
  acquireWeapon,
  startActorMelee,
  combatDefenseInput,
  validateCombatSave,
} from '../src/combat.js';
import { ensureNamedActor, getActor } from '../src/companions.js';
import { createSceneContext } from '../src/scene-context.js';
import { enterInterior } from '../src/interiors.js';
const BASE = createSimulation(2026),
  DT = 1 / 60,
  DAX = 'LL-ARC-DAX',
  PEL = 'LL-ARC-PEL';
const copy = (v) => JSON.parse(JSON.stringify(v));
function fixture({ room = false, weapon = 'knife', health = 100, pel = false } = {}) {
  const s = copy(BASE);
  s.mission = null;
  s.dialogue = null;
  s.vehicles = [];
  s.pedestrians = [];
  s.hostiles = [];
  s.police = [];
  s.bullets = [];
  Object.assign(s.player, { x: 780, y: 700, z: 0, groundZ: 0, angle: 0, vehicleId: null });
  acquireWeapon(s, 'unarmed', 0);
  if (room) {
    Object.assign(s.player, { x: 458, y: 700 });
    assert.equal(enterInterior(s, 'voss-dispatch-entry', { world: WORLD }).ok, true);
    Object.assign(s.player, { x: 110, y: 150, angle: 0 });
  }
  const sceneId = s.player.sceneId ?? null,
    scenes = createSceneContext(WORLD),
    x = s.player.x,
    y = s.player.y;
  const dax = ensureNamedActor(s, {
    id: DAX,
    name: 'Dax',
    x: x + 18,
    y,
    z: 0,
    sceneId,
    health,
    weapon,
    angle: Math.PI,
    ammo: { clip: weapon === 'pistol' ? 5 : 0, reserve: weapon === 'pistol' ? 7 : 0 },
  });
  const other = pel
    ? ensureNamedActor(s, {
        id: PEL,
        name: 'Pel',
        x: x + 22,
        y: y + 9,
        z: 0,
        sceneId,
        health: 100,
        weapon: 'unarmed',
      })
    : null;
  const events = [],
    attacks = [];
  const ctx = {
    sceneId,
    combatants: () => scenePeople(s, sceneId),
    hasLineOfSight: (a, b) => scenes.sight(s, a, b, sceneId),
    id: (prefix) => `${prefix}-${++s.sequence}`,
    notify() {},
    damagePlayer: (n) => {
      s.player.health = Math.max(0, s.player.health - n);
    },
    onAttack: (e) => attacks.push(copy(e)),
    onDisarm: (event) => events.push(event),
  };
  assert.equal(ctx.hasLineOfSight(s.player, dax), true);
  return { s, dax, pel: other, ctx, events, attacks };
}
function tick(f, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds * 60); i++) updateSimulation(f.s, DT, input);
}
function guard(f) {
  assert.equal(
    startActorMelee(f.s, f.dax, f.dax.weapon === 'pistol' ? 'unarmed' : f.dax.weapon, f.ctx),
    true,
  );
  for (let i = 0; i < 20 && !f.s.player.counterWindow; i++)
    updateSimulation(f.s, DT, { block: true });
  assert.equal(f.s.player.counterTarget, DAX);
  assert.equal(f.s.player.counterWindow.attackerId, DAX);
  assert.equal(f.s.player.health, 100);
  return f.s.player.counterWindow;
}
function physicalDisarm(f) {
  updateSimulation(f.s, DT, { block: true, disarm: true });
  return f.s.player.lastDisarm;
}

test('canonical Dax actual guarded knife strike opens a real window and one input drops one physical Workblade', () => {
  const f = fixture({ pel: true }),
    window = guard(f),
    money = f.s.player.money,
    kills = f.s.progress.kills,
    health = f.dax.health;
  const r = physicalDisarm(f);
  assert(r);
  assert.equal(r.targetId, DAX);
  assert.equal(r.weapon, 'knife');
  assert.equal(r.counter.id, window.id);
  assert.equal(r.counter.attackWeapon, 'knife');
  assert.equal(r.destination, 'ground');
  assert.equal(r.hand, 'right');
  assert.equal(f.dax.weapon, 'unarmed');
  assert.equal(f.dax.meleeAction, null);
  assert.equal(f.dax.health, health);
  assert(f.dax.staggerRemaining > 1);
  assert.equal(f.pel.health, 100);
  assert.equal(f.pel.weapon, 'unarmed');
  assert.equal(f.s.player.weapon, 'unarmed');
  assert.equal(f.s.player.meleeAction.kind, 'disarm');
  assert.equal(f.s.player.meleeAction.hit, true);
  assert.equal(f.s.player.lastAttack.kind, 'disarm');
  assert.equal(f.s.player.counterWindow, null);
  const drops = f.s.pickups.filter((p) => p.id === r.dropId);
  assert.equal(drops.length, 1);
  assert.equal(drops[0].weapon, 'knife');
  assert.equal(drops[0].ammo, 0);
  assert.equal(drops[0].available, true);
  assert.equal(drops[0].sceneId, null);
  assert.equal(drops[0].x, f.dax.x);
  assert.equal(drops[0].y, f.dax.y);
  assert.deepEqual(f.dax.disarmReceipt, r);
  assert.equal(f.s.player.money, money);
  assert.equal(f.s.progress.kills, kills);
  assert.equal(f.dax.surrendering, undefined);
  assert.equal(f.pel.surrendering, undefined);
  assert.equal(f.s.campaign?.completed?.['LL-ST-003'], undefined);
});
test('actual disarmed blade requires real pickup, grants no duplicate supply and conserves existing inventory', () => {
  const f = fixture();
  guard(f);
  const before = copy(f.s.player.ownedWeapons),
    r = physicalDisarm(f);
  assert.deepEqual(f.s.player.ownedWeapons, before);
  assert.equal(pickupWeapon(f.s, r.dropId), true);
  assert.equal(f.s.player.weapon, 'knife');
  assert.equal(pickupWeapon(f.s, r.dropId), false);
  assert.equal(f.s.player.ownedWeapons.filter((id) => id === 'knife').length, 1);
  assert.equal(f.s.pickups.filter((p) => p.id === r.dropId).length, 1);
});
test('held/repressed disarm cannot duplicate the dropped weapon or replay committed action identity', () => {
  const f = fixture();
  guard(f);
  const r = physicalDisarm(f),
    serial = f.s.player.disarmSerial;
  tick(f, 0.4, { disarm: true });
  updateSimulation(f.s, DT, {});
  updateSimulation(f.s, DT, { disarm: true });
  assert.equal(f.s.player.disarmSerial, serial);
  assert.deepEqual(f.s.player.lastDisarm, r);
  assert.equal(f.s.pickups.filter((p) => p.id === r.dropId).length, 1);
});
test('missing genuine guarded-strike proof cannot turn legacy target/until fields into blade success', () => {
  const f = fixture();
  f.s.player.counterTarget = DAX;
  f.s.player.counterUntil = 10;
  physicalDisarm(f);
  assert.equal(f.dax.weapon, 'knife');
  assert.equal(f.s.player.lastDisarm, null);
  assert.equal(f.s.player.disarmSerial, 0);
});
test('expired real blade window and actual movement beyond close reach reject disarm', () => {
  const f = fixture();
  guard(f);
  tick(f, 0.9, { block: true });
  physicalDisarm(f);
  assert.equal(f.dax.weapon, 'knife');
  assert.equal(f.s.player.lastDisarm, null);
  const g = fixture();
  guard(g);
  tick(g, 0.3, { moveX: -1 });
  assert(Math.hypot(g.s.player.x - g.dax.x, g.s.player.y - g.dax.y) > 31);
  physicalDisarm(g);
  assert.equal(g.dax.weapon, 'knife');
});
test('turning away through actual aim input closes physical front access even while the time window remains open', () => {
  const f = fixture();
  guard(f);
  updateSimulation(f.s, DT, { aimAngle: Math.PI });
  physicalDisarm(f);
  assert.equal(f.dax.weapon, 'knife');
  assert.equal(f.s.player.lastDisarm, null);
});
test('lost or missing LOS cannot commit weapon transfer, drop, animation or an observer outcome', () => {
  for (const los of [() => false, undefined]) {
    const f = fixture();
    guard(f);
    f.ctx.hasLineOfSight = los;
    const before = copy(f.s);
    combatDefenseInput(f.s, { block: true, disarm: true }, f.ctx);
    assert.equal(f.dax.weapon, 'knife');
    assert.equal(f.events.length, 0);
    assert.equal(f.s.player.lastDisarm, null);
    assert.equal(f.s.sequence, before.sequence);
    assert.equal(f.s.pickups.length, before.pickups.length);
  }
});
test('different-scene or vertically separated body cannot be grabbed by matching ID and counter fields', () => {
  for (const change of [{ sceneId: 'voss-dispatch' }, { z: 12, groundZ: 12 }]) {
    const f = fixture();
    guard(f);
    Object.assign(f.dax, change);
    combatDefenseInput(f.s, { block: true, disarm: true }, f.ctx);
    assert.equal(f.dax.weapon, 'knife');
    assert.equal(f.events.length, 0);
  }
});
test('duplicate same canonical reference is one target, while conflicting bodies sharing ID fail closed', () => {
  const f = fixture();
  guard(f);
  f.ctx.combatants = () => [f.dax, f.dax];
  combatDefenseInput(f.s, { block: true, disarm: true }, f.ctx);
  assert.equal(f.dax.weapon, 'unarmed');
  assert.equal(f.events.length, 1);
  const g = fixture();
  guard(g);
  g.ctx.combatants = () => [g.dax, { ...g.dax }];
  combatDefenseInput(g.s, { block: true, disarm: true }, g.ctx);
  assert.equal(g.dax.weapon, 'knife');
  assert.equal(g.events.length, 0);
});
test('the actual committed observer sees immutable complete target/drop/attack state once, with no health fabrication', () => {
  const f = fixture({ health: 9 });
  guard(f);
  let observed = 0;
  f.ctx.onDisarm = (r) => {
    observed++;
    assert.equal(f.dax.health, 9);
    assert.equal(f.dax.weapon, 'unarmed');
    assert.equal(f.dax.meleeAction, null);
    assert(f.s.pickups.some((p) => p.id === r.dropId));
    assert.equal(f.s.player.counterWindow, null);
    assert.equal(f.s.player.lastAttack.kind, 'disarm');
    assert(Object.isFrozen(r));
    assert(Object.isFrozen(r.counter));
    assert(Object.isFrozen(r.targetPose));
    assert.throws(() => {
      r.counter.attackerId = 'invented';
    }, TypeError);
  };
  combatDefenseInput(f.s, { block: true, disarm: true }, f.ctx);
  assert.equal(observed, 1);
  assert.equal(f.attacks.length, 1);
  assert.equal(f.attacks[0].owner, 'player');
  assert.equal(f.attacks[0].kind, 'disarm');
  assert.equal(f.dax.health, 9);
  assert.equal(f.dax.disarmReceipt.targetHealth, 9);
});
test('insufficient real stamina or pickup capacity refuses a blade disarm without consuming its guard proof', () => {
  for (const full of [false, true]) {
    const f = fixture();
    guard(f);
    if (full)
      while (f.s.pickups.length < 600) f.s.pickups.push({ id: `capacity:${f.s.pickups.length}` });
    else f.s.player.stamina = 0;
    const window = copy(f.s.player.counterWindow),
      seq = f.s.sequence;
    combatDefenseInput(f.s, { block: true, disarm: true }, f.ctx);
    assert.equal(f.dax.weapon, 'knife');
    assert.deepEqual(f.s.player.counterWindow, window);
    assert.equal(f.s.sequence, seq);
    assert.equal(f.events.length, 0);
  }
});
test('saved genuine guard resumes through ordinary disarm input and committed body receipt survives Continue', () => {
  const f = fixture();
  guard(f);
  const restored = restoreGame(saveGame(f.s));
  updateSimulation(restored, DT, { block: true, disarm: true });
  const dax = getActor(restored, DAX);
  assert.equal(dax.weapon, 'unarmed');
  assert.equal(restored.player.lastDisarm.weapon, 'knife');
  assert.deepEqual(dax.disarmReceipt, restored.player.lastDisarm);
  const again = restoreGame(saveGame(restored));
  assert.deepEqual(getActor(again, DAX).disarmReceipt, dax.disarmReceipt);
  assert.equal(again.pickups.filter((p) => p.id === dax.disarmReceipt.dropId).length, 1);
});
test('corrupted saved guard/disarm records and canonical melee actions are rejected', () => {
  const f = fixture();
  guard(f);
  for (const alter of [
    (s) => {
      s.player.counterWindow.attackerId = 'invented';
    },
    (s) => {
      s.player.counterWindow.expiresAt += 5;
    },
    (s) => {
      s.player.counterWindow.attackerPose.z = 90;
    },
  ]) {
    const saved = copy(f.s);
    alter(saved);
    assert.throws(() => validateCombatSave(saved, WORLD));
  }
  physicalDisarm(f);
  for (const alter of [
    (s) => {
      s.player.lastDisarm.serial++;
    },
    (s) => {
      getActor(s, DAX).disarmReceipt.targetId = PEL;
    },
    (s) => {
      getActor(s, DAX).meleeAction = {
        weapon: 'knife',
        elapsed: 0,
        duration: 0.2,
        windup: 0.1,
        damage: 999,
        reach: 19,
      };
    },
  ]) {
    const saved = copy(f.s);
    alter(saved);
    assert.throws(() => validateCombatSave(saved, WORLD));
  }
});
test('canonical named actor guard/disarm uses real room scene combatants and drops in that room only', () => {
  const f = fixture({ room: true });
  guard(f);
  const r = physicalDisarm(f);
  assert.equal(r.weapon, 'knife');
  assert.equal(r.targetPose.sceneId, 'voss-dispatch');
  assert.equal(f.s.pickups.find((p) => p.id === r.dropId).sceneId, 'voss-dispatch');
  assert.equal(f.dax.health, 100);
  restoreGame(saveGame(f.s));
});
test('targeted actual counter strikes the blocked canonical actor, preserving a nearer co-op worker', () => {
  const f = fixture(),
    worker = ensureNamedActor(f.s, {
      id: 'dispatch-worker-test',
      name: 'Co-op worker',
      x: f.s.player.x + 10,
      y: f.s.player.y + 2,
      z: 0,
      sceneId: null,
      health: 100,
      weapon: 'unarmed',
    });
  guard(f);
  updateSimulation(f.s, DT, { counter: true });
  tick(f, 0.15);
  assert(f.dax.health < 100);
  assert.equal(worker.health, 100);
  assert.equal(f.s.player.counterWindow, null);
});
test('named NPC melee recovers its actual cooldown after a missed window and cannot attack while staggered or seated', () => {
  const f = fixture();
  guard(f);
  assert.equal(startActorMelee(f.s, f.dax, 'knife', f.ctx), false);
  tick(f, 1.1);
  assert.equal(f.dax.fireCooldown, 0);
  assert.equal(startActorMelee(f.s, f.dax, 'knife', f.ctx), true);
  const g = fixture();
  g.dax.vehicleId = 'occupied-test';
  g.dax.inVehicle = true;
  assert.equal(startActorMelee(g.s, g.dax, 'knife', g.ctx), false);
  assert.equal(startActorMelee(g.s, g.dax, 'utility-blade', g.ctx), false);
  assert.equal(startActorMelee(g.s, g.dax, 'pistol', g.ctx), false);
});
test('existing real firearm guard still takes actual finite ammunition and never creates a blade drop', () => {
  const f = fixture({ weapon: 'pistol' });
  guard(f);
  const before = f.s.pickups.length,
    ammoBefore = f.s.player.ammo.pistol.clip + f.s.player.ammo.pistol.reserve,
    r = physicalDisarm(f);
  assert.equal(r.weapon, 'pistol');
  assert.equal(r.destination, 'player');
  assert.equal(r.dropId, null);
  assert.equal(r.ammo, 12);
  assert.equal(f.s.player.weapon, 'pistol');
  assert.equal(f.s.player.ammo.pistol.clip + f.s.player.ammo.pistol.reserve, ammoBefore + 12);
  assert.equal(f.s.pickups.length, before);
  assert.equal(f.dax.health, 100);
});

test('an actual club guard remains counterable but does not silently become a new disarmable weapon role', () => {
  const f = fixture({ weapon: 'club' });
  guard(f);
  physicalDisarm(f);
  assert.equal(f.dax.weapon, 'club');
  assert.equal(f.s.player.lastDisarm, null);
  assert.equal(f.s.player.disarmSerial, 0);
});
test('inherited or unknown weapon names cannot mutate inventory through a forged legacy target window', () => {
  for (const weapon of ['constructor', 'toString', 'utility-blade']) {
    const f = fixture();
    f.dax.weapon = weapon;
    f.s.player.counterTarget = DAX;
    f.s.player.counterUntil = 10;
    const before = copy(f.s.player.ownedWeapons);
    combatDefenseInput(f.s, { block: true, disarm: true }, f.ctx);
    assert.deepEqual(f.s.player.ownedWeapons, before);
    assert.equal(f.s.player.lastDisarm, null);
    assert.equal(f.dax.weapon, weapon);
  }
});

test('saved blade success cannot be moved to the expired boundary, detached from its physical drop or reused for another body', () => {
  const f = fixture();
  guard(f);
  physicalDisarm(f);
  for (const alter of [
    (s) => {
      s.time = s.player.lastDisarm.counter.expiresAt;
      s.player.lastDisarm.at = s.time;
      getActor(s, DAX).disarmReceipt = copy(s.player.lastDisarm);
    },
    (s) => {
      s.player.lastDisarm.counter.attackWeapon = 'unarmed';
      getActor(s, DAX).disarmReceipt = copy(s.player.lastDisarm);
    },
    (s) => {
      getActor(s, DAX).disarmReceipt.targetHealth = 99;
    },
    (s) => {
      const drop = s.pickups.find((p) => p.id === s.player.lastDisarm.dropId);
      s.pickups.push(copy(drop));
    },
    (s) => {
      s.pickups.find((p) => p.id === s.player.lastDisarm.dropId).weapon = 'pistol';
    },
  ]) {
    const saved = copy(f.s);
    alter(saved);
    assert.throws(() => validateCombatSave(saved, WORLD));
  }
});

test('published version1 saves may omit new defense fields, while new claimed progress must carry its committed proof', () => {
  const f = fixture();
  for (const key of ['counterSerial', 'counterWindow', 'disarmSerial', 'lastDisarm'])
    delete f.s.player[key];
  const restored = restoreGame(saveGame(f.s)),
    dax = getActor(restored, DAX);
  assert.equal(startActorMelee(restored, dax, 'knife', f.ctx), true);
  for (let i = 0; i < 20 && !restored.player.counterWindow; i++)
    updateSimulation(restored, DT, { block: true });
  updateSimulation(restored, DT, { block: true, disarm: true });
  assert.equal(dax.weapon, 'unarmed');
  assert.equal(restored.player.disarmSerial, 1);
  restoreGame(saveGame(restored));
  const forged = copy(f.s);
  forged.player.disarmSerial = 1;
  assert.throws(() => validateCombatSave(forged, WORLD), /Missing saved committed disarm/);
});
