/** Original weapon handling and combat rules. Rendering and audio consume the same live state. */
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const spatialDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const angleDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const melee = (catalogId, name, changes) => ({
  catalogId,
  name,
  class: 'melee',
  mode: 'melee',
  damage: 20,
  range: 25,
  reach: 25,
  arc: 0.75,
  windup: 0.13,
  fireInterval: 0.48,
  reloadTime: 0,
  clipSize: 0,
  pellets: 0,
  spread: 0,
  bulletSpeed: 0,
  recoil: 0,
  cost: 0,
  ammoCost: 0,
  vehicleAllowed: false,
  ...changes,
});
const gun = (catalogId, name, group, changes) => ({
  catalogId,
  name,
  class: group,
  mode: 'ballistic',
  damage: 28,
  range: 370,
  fireInterval: 0.25,
  reloadTime: 1.15,
  clipSize: 12,
  pellets: 1,
  spread: 0.025,
  bulletSpeed: 600,
  recoil: 0.035,
  automatic: false,
  cost: 0,
  ammoCost: 45,
  vehicleAllowed: false,
  scopeZoom: 0,
  ...changes,
});
const thrown = (catalogId, name, changes) => ({
  catalogId,
  name,
  class: 'throwable',
  mode: 'throwable',
  damage: 100,
  range: 140,
  fireInterval: 0.8,
  reloadTime: 0,
  clipSize: 12,
  pellets: 0,
  spread: 0,
  bulletSpeed: 130,
  throwSpeed: 130,
  throwLift: 75,
  recoil: 0,
  automatic: false,
  cost: 180,
  ammoCost: 90,
  supply: 3,
  vehicleAllowed: false,
  ...changes,
});

export const WEAPONS = Object.freeze({
  unarmed: melee('WPN-01', 'Unarmed', {
    class: 'unarmed',
    damage: 16,
    reach: 23,
    range: 23,
    windup: 0.12,
    fireInterval: 0.43,
  }),
  club: melee('WPN-02', 'Utility Club', {
    damage: 43,
    reach: 32,
    range: 32,
    arc: 1,
    windup: 0.27,
    fireInterval: 0.9,
    cost: 85,
    sweep: 2,
  }),
  knife: melee('WPN-03', 'Workblade', {
    damage: 31,
    reach: 19,
    range: 19,
    windup: 0.085,
    fireInterval: 0.32,
    cost: 70,
    piercing: true,
  }),
  pistol: gun('WPN-04', 'Pier Nine', 'handgun', { vehicleAllowed: true }),
  'combat-pistol': gun('WPN-05', 'Magnus', 'handgun', {
    damage: 49,
    clipSize: 8,
    fireInterval: 0.43,
    reloadTime: 1.5,
    recoil: 0.09,
    spread: 0.04,
    cost: 480,
    ammoCost: 65,
    vehicleAllowed: true,
  }),
  shotgun: gun('WPN-06', 'Gatekeeper', 'shotgun', {
    damage: 15,
    clipSize: 6,
    fireInterval: 0.82,
    reloadTime: 1.8,
    range: 210,
    bulletSpeed: 510,
    spread: 0.14,
    pellets: 6,
    recoil: 0.14,
    cost: 620,
    ammoCost: 80,
  }),
  'combat-shotgun': gun('WPN-07', 'Breachline', 'shotgun', {
    damage: 12,
    clipSize: 8,
    fireInterval: 0.36,
    reloadTime: 2.1,
    range: 190,
    bulletSpeed: 550,
    spread: 0.17,
    pellets: 8,
    recoil: 0.1,
    cost: 1200,
    ammoCost: 100,
  }),
  smg: gun('WPN-08', 'Wren', 'smg', {
    damage: 17,
    clipSize: 30,
    fireInterval: 0.095,
    reloadTime: 1.45,
    range: 340,
    bulletSpeed: 640,
    spread: 0.065,
    recoil: 0.027,
    automatic: true,
    cost: 940,
    ammoCost: 85,
    vehicleAllowed: true,
  }),
  'full-smg': gun('WPN-09', 'Rook SM9', 'smg', {
    damage: 21,
    clipSize: 24,
    fireInterval: 0.13,
    reloadTime: 1.65,
    range: 415,
    bulletSpeed: 710,
    spread: 0.035,
    recoil: 0.021,
    automatic: true,
    cost: 1450,
    ammoCost: 110,
  }),
  'assault-rifle': gun('WPN-10', 'Foundry AR', 'rifle', {
    damage: 37,
    clipSize: 30,
    fireInterval: 0.14,
    reloadTime: 2.2,
    range: 530,
    bulletSpeed: 820,
    spread: 0.05,
    recoil: 0.064,
    automatic: true,
    cost: 1850,
    ammoCost: 140,
  }),
  carbine: gun('WPN-11', 'Calder C4', 'rifle', {
    damage: 30,
    clipSize: 30,
    fireInterval: 0.115,
    reloadTime: 1.85,
    range: 570,
    bulletSpeed: 850,
    spread: 0.028,
    recoil: 0.037,
    automatic: true,
    cost: 2300,
    ammoCost: 165,
  }),
  sniper: gun('WPN-12', 'Coastwatch', 'sniper', {
    damage: 126,
    clipSize: 5,
    fireInterval: 1.35,
    reloadTime: 2.45,
    range: 900,
    bulletSpeed: 980,
    spread: 0.009,
    recoil: 0.19,
    scopeZoom: 2.5,
    cost: 2500,
    ammoCost: 190,
  }),
  'combat-sniper': gun('WPN-13', 'Overlook', 'sniper', {
    damage: 78,
    clipSize: 8,
    fireInterval: 0.48,
    reloadTime: 2.15,
    range: 780,
    bulletSpeed: 950,
    spread: 0.013,
    recoil: 0.105,
    scopeZoom: 2,
    cost: 3200,
    ammoCost: 220,
  }),
  rpg: gun('WPN-14', 'Hullbreaker', 'heavy', {
    mode: 'rocket',
    damage: 175,
    clipSize: 1,
    fireInterval: 1.05,
    reloadTime: 2.3,
    range: 660,
    bulletSpeed: 235,
    spread: 0.015,
    recoil: 0.25,
    blastRadius: 68,
    cost: 3800,
    ammoCost: 390,
    supply: 3,
  }),
  grenade: thrown('WPN-15', 'Fragment Canister', {
    kind: 'grenade',
    damage: 150,
    blastRadius: 62,
    fuse: 2.8,
  }),
  molotov: thrown('WPN-16', 'Fire Bottle', {
    kind: 'molotov',
    damage: 12,
    fireRadius: 27,
    maxFireRadius: 39,
    fireDuration: 7,
    fireDamage: 19,
    cost: 95,
    ammoCost: 55,
    throwSpeed: 115,
    throwLift: 63,
  }),
  'street-object': thrown('WPN-17', 'Street Objects', {
    class: 'improvised',
    kind: 'object',
    damage: 15,
    clipSize: 1,
    cost: 0,
    ammoCost: 0,
    throwSpeed: 145,
    throwLift: 60,
    supply: 1,
  }),
});

export const SHOP_WEAPONS = Object.freeze([
  'shotgun',
  'smg',
  'club',
  'knife',
  'combat-pistol',
  'combat-shotgun',
  'full-smg',
  'assault-rifle',
  'carbine',
  'sniper',
  'combat-sniper',
  'rpg',
  'grenade',
  'molotov',
  'pistol',
]);

export function initializeCombat(state, pickups = []) {
  state.combatVersion ??= 1;
  state.ordnance ??= [];
  state.fires ??= [];
  state.combatEffects ??= [];
  state.pickups ??= pickups.map((item) => ({ ...item, available: true, remaining: 0 }));
  const player = state.player;
  player.ownedWeapons ??= [...new Set(['unarmed', ...player.weapons])];
  if (!player.weapons.includes('unarmed')) player.weapons.unshift('unarmed');
  for (const id of Object.keys(WEAPONS)) player.ammo[id] ??= { clip: 0, reserve: 0 };
  player.z ??= 0;
  player.vz ??= 0;
  player.crouching ??= false;
  player.cover ??= null;
  player.traversal ??= null;
  player.recoil ??= 0;
  player.scoped ??= false;
  player.aiming ??= false;
  player.meleeAction ??= null;
  player.defending ??= false;
  player.defenseStarted ??= -10;
  player.counterUntil ??= -10;
  player.counterTarget ??= null;
  player.dodgeRemaining ??= 0;
  player.dodgeAngle ??= 0;
  player.heldObject ??= null;
  player.throwCharge ??= 0;
  player.attackSerial ??= 0;
  player.lastAttack ??= null;
  player.aimTarget ??= null;
}

export function equipOwnedWeapon(state, id) {
  const player = state.player,
    weapon = WEAPONS[id];
  if (!weapon || !player.ownedWeapons.includes(id)) return false;
  player.weapons = player.weapons.filter(
    (other) => other === id || WEAPONS[other].class !== weapon.class,
  );
  if (!player.weapons.includes(id)) player.weapons.push(id);
  player.weapon = id;
  player.reloadRemaining = 0;
  player.meleeAction = null;
  player.scoped = false;
  player.recoil = 0;
  return true;
}

export function acquireWeapon(state, id, amount = 0, object = null) {
  const weapon = WEAPONS[id];
  if (!weapon) return false;
  const player = state.player;
  if (!player.ownedWeapons.includes(id)) player.ownedWeapons.push(id);
  equipOwnedWeapon(state, id);
  if (weapon.mode !== 'melee') {
    const ammo = player.ammo[id];
    if (weapon.mode === 'throwable')
      ammo.clip = Math.min(weapon.clipSize, ammo.clip + Math.max(0, Math.floor(amount)));
    else {
      const supplied = Math.max(0, Math.floor(amount));
      const loaded = Math.min(weapon.clipSize - ammo.clip, supplied);
      ammo.clip += loaded;
      ammo.reserve = Math.min(100000, ammo.reserve + supplied - loaded);
    }
  }
  if (id === 'street-object')
    player.heldObject = object || { name: 'Metal can', material: 'metal' };
  return true;
}

function effect(state, ctx, type, point, details = {}) {
  state.combatEffects.push({
    id: ctx.id('effect'),
    type,
    x: point.x,
    y: point.y,
    z: point.z || 0,
    remaining: type === 'explosion' ? 0.65 : 0.35,
    ...details,
  });
  state.combatEffects = state.combatEffects.slice(-50);
}

export function hitCombatant(state, victim, damage, owner, ctx, kind = 'bullet') {
  if (victim.health <= 0) return;
  const before = victim.health;
  if (
    owner === 'player' &&
    ctx.reportCrime &&
    !state.hostiles.includes(victim) &&
    state.time >= (victim.nextCrimeReport || 0)
  ) {
    ctx.reportCrime({
      type: victim.kind === 'police' ? 'police-assault' : 'assault',
      severity: victim.kind === 'police' ? Math.min(6, Math.max(3, state.wanted.level + 1)) : 2,
      victimId: victim.id,
    });
    victim.nextCrimeReport = state.time + 1;
  }
  if (victim.kind === 'police' && victim.armour > 0) {
    const absorbed = Math.min(victim.armour, damage * 0.65);
    victim.armour -= absorbed;
    damage -= absorbed;
  }
  victim.health = Math.max(0, victim.health - damage);
  victim.panic = 9;
  victim.hitReaction = { kind, until: state.time + 0.3 };
  if (owner === 'player') {
    if (before > 0 && victim.health <= 0) state.progress.kills++;
  }
  if (victim.health <= 0 && victim.weapon && victim.weapon !== 'unarmed' && !victim.droppedWeapon) {
    victim.droppedWeapon = true;
    const ammo = victim.ammo
      ? victim.ammo.clip + victim.ammo.reserve
      : WEAPONS[victim.weapon].clipSize;
    state.pickups.push({
      id: ctx.id('dropped-weapon'),
      type: 'weapon',
      weapon: victim.weapon,
      name: WEAPONS[victim.weapon].name,
      x: victim.x,
      y: victim.y,
      ammo,
      available: true,
      remaining: 0,
      despawnRemaining: 120,
    });
  }
  if (state.time >= (victim.nextHitEffect || 0)) {
    effect(state, ctx, 'impact', victim, { kind });
    victim.nextHitEffect = state.time + 0.15;
  }
}

function hostileList(state) {
  return [...state.hostiles, ...state.police, ...state.pedestrians];
}
function recordAttack(state, player, weapon, kind) {
  player.attackSerial++;
  player.lastAttack = {
    serial: player.attackSerial,
    weapon,
    kind,
    time: state.time,
    angle: player.angle,
  };
}
export function startActorMelee(
  state,
  actor,
  id,
  ctx,
  { heavy = false, kind = 'strike', targetId = null } = {},
) {
  if (actor.meleeAction || actor.fireCooldown > 0 || actor.health <= 0) return false;
  const weapon = WEAPONS[id],
    isPlayer = actor === state.player;
  const stamina = heavy ? 24 : id === 'club' ? 15 : 7;
  if (isPlayer && actor.stamina < stamina) return false;
  if (isPlayer) actor.stamina -= stamina;
  const windup = kind === 'counter' ? 0.07 : weapon.windup * (heavy ? 1.35 : 1);
  actor.meleeAction = {
    weapon: id,
    kind,
    elapsed: 0,
    duration: weapon.fireInterval * (heavy ? 1.25 : 1),
    windup,
    hit: false,
    damage: weapon.damage * (heavy ? 1.55 : kind === 'counter' ? 1.7 : 1),
    reach: weapon.reach + (heavy ? 3 : 0),
    arc: weapon.arc,
    targetId,
    sweep: weapon.sweep || 1,
  };
  actor.fireCooldown = actor.meleeAction.duration;
  if (isPlayer) recordAttack(state, actor, id, kind);
  return true;
}

function defendMelee(state, attacker, damage, ctx) {
  const player = state.player;
  if (player.dodgeRemaining > 0) return;
  const front = Math.abs(angleDifference(angleTo(player, attacker), player.angle)) < 1.2;
  if (player.defending && front && player.stamina >= 10) {
    player.stamina -= 10;
    const perfect = state.time - player.defenseStarted <= 0.3;
    player.counterTarget = attacker.id;
    player.counterUntil = state.time + 0.8;
    attacker.staggerRemaining = perfect ? 0.85 : 0.4;
    if (!perfect) ctx.damagePlayer(damage * 0.18);
    effect(state, ctx, perfect ? 'parry' : 'block', player);
  } else ctx.damagePlayer(damage);
}

export function updateMelee(state, dt, ctx) {
  for (const actor of [state.player, ...state.hostiles, ...state.police]) {
    const action = actor.meleeAction;
    actor.staggerRemaining = Math.max(0, (actor.staggerRemaining || 0) - dt);
    if (!action || actor.health <= 0) continue;
    action.elapsed += dt;
    if (!action.hit && action.elapsed >= action.windup) {
      action.hit = true;
      if (actor === state.player) {
        const targets = hostileList(state)
          .filter(
            (victim) =>
              victim.health > 0 &&
              distance(actor, victim) <= action.reach &&
              Math.abs(angleDifference(angleTo(actor, victim), actor.angle)) <= action.arc &&
              ctx.hasLineOfSight(actor, victim),
          )
          .sort((a, b) => distance(actor, a) - distance(actor, b));
        for (const victim of targets.slice(0, action.sweep)) {
          hitCombatant(state, victim, action.damage, 'player', ctx, action.kind);
          victim.staggerRemaining = action.weapon === 'club' ? 0.9 : 0.35;
          if (action.weapon === 'knife') victim.bleedingRemaining = 1.5;
        }
        for (const vehicle of state.vehicles)
          if (
            vehicle.health > 0 &&
            distance(actor, vehicle) < action.reach &&
            Math.abs(angleDifference(angleTo(actor, vehicle), actor.angle)) < action.arc
          )
            ctx.damageVehicle(vehicle, action.damage * 0.45);
      } else if (
        distance(actor, state.player) <= action.reach &&
        ctx.hasLineOfSight(actor, state.player)
      ) {
        defendMelee(state, actor, action.damage * 0.6, ctx);
      }
    }
    if (action.elapsed >= action.duration) actor.meleeAction = null;
  }
}

export function combatDefenseInput(state, input, ctx) {
  const player = state.player;
  if (player.vehicleId || player.health <= 0) {
    player.defending = false;
    return;
  }
  if (input.block && !state.lastInput.block) player.defenseStarted = state.time;
  player.defending = Boolean(input.block);
  if (input.dodge && !state.lastInput.dodge && player.stamina >= 24 && player.dodgeRemaining <= 0) {
    player.stamina -= 24;
    player.dodgeRemaining = 0.36;
    player.cover = null;
    player.dodgeAngle =
      Math.hypot(input.moveX || 0, input.moveY || 0) > 0.1
        ? Math.atan2(input.moveY, input.moveX)
        : player.angle + Math.PI / 2;
  }
  const target = [...state.hostiles, ...state.police].find(
    (actor) => actor.id === player.counterTarget && actor.health > 0,
  );
  if (!target || state.time > player.counterUntil || distance(player, target) > 31) return;
  if (
    input.disarm &&
    !state.lastInput.disarm &&
    target.weapon &&
    WEAPONS[target.weapon].mode !== 'melee'
  ) {
    const weapon = target.weapon,
      ammo = target.ammo ? target.ammo.clip + target.ammo.reserve : WEAPONS[weapon].clipSize;
    acquireWeapon(state, weapon, ammo);
    target.weapon = 'unarmed';
    target.ammo = { clip: 0, reserve: 0 };
    target.meleeAction = null;
    target.staggerRemaining = 1.1;
    player.counterUntil = -10;
    effect(state, ctx, 'disarm', target);
    ctx.notify(`${WEAPONS[weapon].name} disarmed and taken.`, 'success');
  } else if (input.counter && !state.lastInput.counter) {
    player.fireCooldown = 0;
    player.meleeAction = null;
    player.angle = angleTo(player, target);
    startActorMelee(state, player, 'unarmed', ctx, { kind: 'counter', targetId: target.id });
    player.counterUntil = -10;
  }
}

export function fireCombatWeapon(state, ctx, input = {}) {
  const player = state.player,
    weapon = WEAPONS[player.weapon];
  if (
    !weapon ||
    player.health <= 0 ||
    player.reloadRemaining > 0 ||
    player.fireCooldown > 0 ||
    player.traversal ||
    (player.vehicleId && !weapon.vehicleAllowed) ||
    player.defending
  )
    return false;
  if (weapon.mode === 'melee')
    return startActorMelee(state, player, player.weapon, ctx, {
      heavy: Boolean(input.heavyAttack),
    });
  const ammo = player.ammo[player.weapon];
  if (ammo.clip <= 0) {
    ctx.reload();
    return false;
  }
  ammo.clip--;
  player.fireCooldown = weapon.fireInterval;
  const movement = Math.abs(player.speed || 0) > 20 ? 1.5 : 1;
  const accuracy =
    (player.aiming ? (weapon.scopeZoom ? 0.35 : 0.6) : weapon.scopeZoom ? 8 : 1) *
    (player.crouching ? 0.75 : 1) *
    (player.cover && !player.aiming ? 2.2 : 1);
  const spread = weapon.spread * movement * accuracy + player.recoil * 0.16;
  const angle = player.angle + (ctx.random() - 0.5) * spread * 2;
  player.recoil = Math.min(0.65, player.recoil + weapon.recoil);
  recordAttack(state, player, player.weapon, weapon.mode);
  if (weapon.mode === 'ballistic') {
    const horizontalDistance = player.aimTarget
      ? Math.max(1, distance(player, player.aimTarget))
      : 1;
    const heightDelta = player.aimTarget
      ? player.aimTarget.z - ((player.z || 0) + (player.crouching ? 8 : 13))
      : 0;
    const trajectoryLength = Math.hypot(horizontalDistance, heightDelta),
      horizontalSpeed = (weapon.bulletSpeed * horizontalDistance) / trajectoryLength;
    for (let pellet = 0; pellet < weapon.pellets; pellet++) {
      const pelletAngle = pellet === 0 ? angle : player.angle + (ctx.random() - 0.5) * spread * 2;
      state.bullets.push({
        id: ctx.id('bullet'),
        x: player.x + Math.cos(pelletAngle) * 10,
        y: player.y + Math.sin(pelletAngle) * 10,
        prevX: player.x,
        prevY: player.y,
        z: (player.z || 0) + (player.crouching ? 8 : 13),
        angle: pelletAngle,
        vx: Math.cos(pelletAngle) * horizontalSpeed,
        vy: Math.sin(pelletAngle) * horizontalSpeed,
        vz: (weapon.bulletSpeed * heightDelta) / trajectoryLength,
        remaining: weapon.range,
        damage: weapon.damage,
        owner: 'player',
        weapon: player.weapon,
      });
    }
  } else if (weapon.mode === 'rocket') {
    const originZ = (player.z || 0) + (player.crouching ? 8 : 12);
    const aimRange = player.aimTarget ? distance(player, player.aimTarget) : 1,
      aimHeight = player.aimTarget ? player.aimTarget.z - originZ : 0;
    const aimLength = Math.hypot(aimRange, aimHeight) || 1,
      horizontalOffset = aimRange / aimLength,
      verticalOffset = aimHeight / aimLength;
    let offset = 13;
    while (
      offset > 0 &&
      ctx.isBlocked(
        player.x + Math.cos(angle) * offset * horizontalOffset,
        player.y + Math.sin(angle) * offset * horizontalOffset,
        2,
        originZ + offset * verticalOffset,
      )
    )
      offset -= 2;
    const muzzle = {
      x: player.x + Math.cos(angle) * Math.max(0, offset) * horizontalOffset,
      y: player.y + Math.sin(angle) * Math.max(0, offset) * horizontalOffset,
      z: Math.max(0, originZ + Math.max(0, offset) * verticalOffset),
    };
    const target = player.aimTarget;
    const planarRange = target ? Math.max(0.001, distance(muzzle, target)) : 1,
      heightDelta = target ? target.z - muzzle.z : 0;
    const trajectoryLength = Math.hypot(planarRange, heightDelta),
      horizontalSpeed = (weapon.bulletSpeed * planarRange) / trajectoryLength;
    const heading = target ? angleTo(muzzle, target) + (angle - player.angle) : angle;
    state.ordnance.push({
      id: ctx.id('rocket'),
      kind: 'rocket',
      weapon: player.weapon,
      owner: 'player',
      ...muzzle,
      vx: Math.cos(heading) * horizontalSpeed,
      vy: Math.sin(heading) * horizontalSpeed,
      vz: (weapon.bulletSpeed * heightDelta) / trajectoryLength,
      remaining: weapon.range / weapon.bulletSpeed,
      damage: weapon.damage,
      radius: weapon.blastRadius,
    });
  } else {
    const material = player.heldObject?.material || 'metal';
    const charge = 0.7 + clamp(player.throwCharge, 0, 1) * 0.6;
    let offset = 11;
    while (
      offset > 0 &&
      ctx.isBlocked(
        player.x + Math.cos(angle) * offset,
        player.y + Math.sin(angle) * offset,
        2,
        (player.z || 0) + 13,
      )
    )
      offset -= 2;
    state.ordnance.push({
      id: ctx.id('thrown'),
      kind: weapon.kind,
      weapon: player.weapon,
      owner: 'player',
      x: player.x + Math.cos(angle) * Math.max(0, offset),
      y: player.y + Math.sin(angle) * Math.max(0, offset),
      z: (player.z || 0) + 13,
      vx: Math.cos(angle) * weapon.throwSpeed * charge,
      vy: Math.sin(angle) * weapon.throwSpeed * charge,
      vz: weapon.throwLift,
      fuse: weapon.fuse ?? null,
      remaining: 8,
      damage: weapon.damage,
      radius: weapon.blastRadius || 0,
      material,
      objectName: player.heldObject?.name || 'Street object',
      bounces: 0,
    });
    if (weapon.kind === 'object') player.heldObject = null;
  }
  state.pedestrians.forEach((person) => {
    if (distance(person, player) < 130) person.panic = 7;
  });
  if (ctx.reportCrime)
    ctx.reportCrime({
      type: weapon.mode === 'rocket' ? 'explosion' : 'gunfire',
      severity: weapon.mode === 'rocket' ? 3 : 1,
    });
  return true;
}

function explode(state, projectile, ctx) {
  effect(state, ctx, 'explosion', projectile, { radius: projectile.radius });
  for (const person of [...hostileList(state), ...(state.policeAircraft || [])]) {
    const range = spatialDistance(
      { ...person, z: (person.z || 0) + (person.crouching ? 5 : 9) },
      projectile,
    );
    if (person.health > 0 && range < projectile.radius && ctx.hasLineOfSight(projectile, person))
      hitCombatant(
        state,
        person,
        projectile.damage * Math.max(0.12, 1 - range / projectile.radius),
        projectile.owner,
        ctx,
        'blast',
      );
  }
  const playerRange = spatialDistance(
    { ...state.player, z: (state.player.z || 0) + (state.player.crouching ? 5 : 9) },
    projectile,
  );
  if (playerRange < projectile.radius && ctx.hasLineOfSight(projectile, state.player))
    ctx.damagePlayer(projectile.damage * Math.max(0.12, 1 - playerRange / projectile.radius));
  for (const vehicle of state.vehicles) {
    const range = spatialDistance({ ...vehicle, z: (vehicle.z || 0) + 7 }, projectile);
    if (range < projectile.radius + 8 && ctx.hasLineOfSight(projectile, vehicle))
      ctx.damageVehicle(
        vehicle,
        projectile.damage * 1.8 * Math.max(0.1, 1 - range / (projectile.radius + 8)),
      );
  }
  state.pedestrians.forEach((person) => {
    if (distance(person, projectile) < projectile.radius + 120) person.panic = 12;
  });
  if (projectile.owner === 'player' && ctx.reportCrime)
    ctx.reportCrime({ type: 'explosion', severity: 3 });
  projectile.remaining = 0;
}
function ignite(state, projectile, ctx) {
  const weapon = WEAPONS.molotov;
  state.fires.push({
    id: ctx.id('fire'),
    x: projectile.x,
    y: projectile.y,
    radius: weapon.fireRadius,
    maxRadius: weapon.maxFireRadius,
    remaining: weapon.fireDuration,
    damage: weapon.fireDamage,
    owner: projectile.owner,
  });
  effect(state, ctx, 'fire-impact', projectile, { radius: weapon.fireRadius });
  projectile.remaining = 0;
}
function settleObject(state, projectile, ctx) {
  if (projectile.material !== 'glass' && !ctx.isBlocked(projectile.x, projectile.y, 3))
    state.pickups.push({
      id: ctx.id('street-object'),
      type: 'object',
      weapon: 'street-object',
      x: projectile.x,
      y: projectile.y,
      name: projectile.objectName,
      material: projectile.material,
      ammo: 1,
      available: true,
      remaining: 0,
      despawnRemaining: 120,
    });
  effect(state, ctx, projectile.material === 'glass' ? 'glass-break' : 'object-impact', projectile);
  projectile.remaining = 0;
}

// Earliest swept cylinder contact. Clip the flight segment to the body's height
// before solving its planar footprint; high rockets cannot hit cars underneath.
function rocketActorContact(actor, start, end) {
  const radius = actor.role === 'air-search' ? 22 : actor.spec ? 12 : 8;
  const bottom = (actor.z || 0) - 2,
    top = (actor.z || 0) + (actor.spec ? 17 : actor.crouching ? 10 : 18) + 2;
  const dx = end.x - start.x,
    dy = end.y - start.y,
    dz = end.z - start.z;
  let low = 0,
    high = 1;
  if (Math.abs(dz) < 1e-9) {
    if (start.z < bottom || start.z > top) return null;
  } else {
    const a = (bottom - start.z) / dz,
      b = (top - start.z) / dz;
    low = Math.max(0, Math.min(a, b));
    high = Math.min(1, Math.max(a, b));
    if (low > high) return null;
  }
  const ox = start.x - actor.x,
    oy = start.y - actor.y,
    A = dx * dx + dy * dy,
    B = 2 * (ox * dx + oy * dy),
    C = ox * ox + oy * oy - radius * radius;
  if (A < 1e-12) return C <= 0 ? low : null;
  const discriminant = B * B - 4 * A * C;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant),
    enter = (-B - root) / (2 * A),
    exit = (-B + root) / (2 * A);
  low = Math.max(low, enter);
  high = Math.min(high, exit);
  return low <= high ? clamp(low, 0, 1) : null;
}
function rocketSolidContact(start, end, ctx) {
  const steps = Math.max(1, Math.ceil(spatialDistance(start, end) / 3));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps,
      point = {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
        z: start.z + (end.z - start.z) * t,
      };
    if (!ctx.isBlocked(point.x, point.y, 2, Math.max(0, point.z))) continue;
    let low = (i - 1) / steps,
      high = t;
    for (let iteration = 0; iteration < 8; iteration++) {
      const mid = (low + high) / 2;
      if (
        ctx.isBlocked(
          start.x + (end.x - start.x) * mid,
          start.y + (end.y - start.y) * mid,
          2,
          Math.max(0, start.z + (end.z - start.z) * mid),
        )
      )
        high = mid;
      else low = mid;
    }
    return low;
  }
  return null;
}

export function updateOrdnance(state, dt, ctx) {
  for (const projectile of state.ordnance) {
    const previous = { x: projectile.x, y: projectile.y, z: projectile.z };
    projectile.remaining -= dt;
    if (projectile.fuse !== null && projectile.fuse !== undefined) projectile.fuse -= dt;
    if (projectile.kind !== 'rocket') projectile.vz -= 180 * dt;
    const next = {
      x: projectile.x + projectile.vx * dt,
      y: projectile.y + projectile.vy * dt,
      z: projectile.z + projectile.vz * dt,
    };
    if (projectile.kind === 'rocket') {
      let impact = rocketSolidContact(previous, next, ctx);
      if (next.z <= 0) {
        const ground = previous.z > 0 ? previous.z / (previous.z - next.z) : 0;
        impact = impact === null ? ground : Math.min(impact, ground);
      }
      const actors = [
        ...hostileList(state),
        ...(state.policeAircraft || []),
        ...state.vehicles,
        state.player,
      ];
      for (const actor of actors) {
        if (
          actor.health <= 0 ||
          actor.id === projectile.owner ||
          (actor === state.player && projectile.owner === 'player') ||
          actor.crewIds?.includes(projectile.owner)
        )
          continue;
        const contact = rocketActorContact(actor, previous, next);
        if (contact !== null && (impact === null || contact < impact)) impact = contact;
      }
      const fraction = impact === null ? 1 : clamp(impact, 0, 1);
      projectile.x = previous.x + (next.x - previous.x) * fraction;
      projectile.y = previous.y + (next.y - previous.y) * fraction;
      projectile.z = Math.max(0, previous.z + (next.z - previous.z) * fraction);
      if (impact !== null || projectile.remaining <= 0) explode(state, projectile, ctx);
      continue;
    }
    const wall =
      ctx.isBlocked(next.x, next.y, 2, Math.max(0, next.z)) || !ctx.hasLineOfSight(previous, next);
    if (!wall) {
      projectile.x = next.x;
      projectile.y = next.y;
    }
    projectile.z = next.z;
    if (wall) {
      projectile.vx *= -0.45;
      projectile.vy *= -0.45;
      projectile.bounces++;
    }
    const victims = hostileList(state).filter(
      (person) =>
        person.id !== projectile.owner &&
        person.health > 0 &&
        distance(person, projectile) < 8 &&
        projectile.z < 18,
    );
    const ground = projectile.z <= 0;
    if (projectile.kind === 'molotov' && (wall || ground || victims.length))
      ignite(state, projectile, ctx);
    else if (projectile.kind === 'object' && (wall || ground || victims.length)) {
      const damage =
        projectile.material === 'stone' ? 24 : projectile.material === 'glass' ? 8 : 15;
      if (victims[0])
        hitCombatant(state, victims[0], damage, projectile.owner, ctx, 'thrown-object');
      settleObject(state, projectile, ctx);
    } else if (projectile.kind === 'grenade') {
      if (ground) {
        projectile.z = 0;
        projectile.vz = Math.abs(projectile.vz) > 17 ? -projectile.vz * 0.35 : 0;
        projectile.vx *= 0.64;
        projectile.vy *= 0.64;
        projectile.bounces++;
      }
      if (projectile.fuse <= 0 || projectile.remaining <= 0) explode(state, projectile, ctx);
    }
  }
  state.ordnance = state.ordnance.filter((projectile) => projectile.remaining > 0);
  for (const fire of state.fires) {
    fire.remaining -= dt * (1 + (state.weather?.rain || 0) * 0.2);
    fire.radius = Math.min(fire.maxRadius, fire.radius + dt * 2);
    for (const victim of hostileList(state))
      if (
        victim.health > 0 &&
        distance(victim, fire) < fire.radius &&
        ctx.hasLineOfSight(fire, victim)
      ) {
        hitCombatant(state, victim, fire.damage * dt, fire.owner, ctx, 'fire');
        victim.panic = 12;
        victim.burningRemaining = 1;
        const angle = angleTo(fire, victim);
        ctx.moveBody(victim, Math.cos(angle) * 35 * dt, Math.sin(angle) * 35 * dt, 6);
      }
    if (distance(state.player, fire) < fire.radius && ctx.hasLineOfSight(fire, state.player))
      ctx.damagePlayer(fire.damage * dt);
    for (const vehicle of state.vehicles)
      if (
        vehicle.health > 0 &&
        distance(vehicle, fire) < fire.radius &&
        ctx.hasLineOfSight(fire, vehicle)
      )
        ctx.damageVehicle(vehicle, fire.damage * dt * 0.8);
  }
  state.fires = state.fires.filter((fire) => fire.remaining > 0);
  for (const item of state.combatEffects) item.remaining -= dt;
  state.combatEffects = state.combatEffects.filter((item) => item.remaining > 0);
  for (const pickup of state.pickups)
    if (!pickup.available && pickup.respawnSeconds) {
      pickup.remaining -= dt;
      if (pickup.remaining <= 0) pickup.available = true;
    }
  for (const pickup of state.pickups)
    if (pickup.despawnRemaining !== undefined) pickup.despawnRemaining -= dt;
  state.pickups = state.pickups.filter(
    (pickup) => pickup.despawnRemaining === undefined || pickup.despawnRemaining > 0,
  );
  for (const person of [...state.hostiles, ...state.police])
    if (person.health > 0 && person.bleedingRemaining > 0) {
      person.bleedingRemaining = Math.max(0, person.bleedingRemaining - dt);
      hitCombatant(state, person, dt * 2, 'player', ctx, 'bleeding');
    }
}

export function predictThrow(state, ctx, steps = 90) {
  const player = state.player,
    weapon = WEAPONS[player.weapon];
  if (!weapon || weapon.mode !== 'throwable') return [];
  const speed = weapon.throwSpeed * (0.7 + clamp(player.throwCharge, 0, 1) * 0.6);
  let offset = 11;
  while (
    offset > 0 &&
    ctx.isBlocked(
      player.x + Math.cos(player.angle) * offset,
      player.y + Math.sin(player.angle) * offset,
      2,
      (player.z || 0) + 13,
    )
  )
    offset -= 2;
  const point = {
    x: player.x + Math.cos(player.angle) * Math.max(0, offset),
    y: player.y + Math.sin(player.angle) * Math.max(0, offset),
    z: (player.z || 0) + 13,
  };
  let lift = weapon.throwLift;
  const points = [{ ...point }];
  for (let i = 0; i < steps; i++) {
    lift -= 180 / 60;
    const next = {
      x: point.x + (Math.cos(player.angle) * speed) / 60,
      y: point.y + (Math.sin(player.angle) * speed) / 60,
      z: point.z + lift / 60,
    };
    if (ctx.isBlocked(next.x, next.y, 2, Math.max(0, next.z)) || !ctx.hasLineOfSight(point, next))
      break;
    point.x = next.x;
    point.y = next.y;
    point.z = next.z;
    points.push({ ...point, z: Math.max(0, point.z) });
    if (point.z <= 0) break;
  }
  return points;
}

/** Reject corrupt runtime records before accepting a persisted combat world. */
export function validateCombatSave(state, world) {
  const finite = (value, min, max) =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const point = (item) => item && finite(item.x, 0, world.width) && finite(item.y, 0, world.height);
  const p = state.player;
  if (
    state.combatVersion !== 1 ||
    !Array.isArray(state.ordnance) ||
    !Array.isArray(state.fires) ||
    !Array.isArray(state.pickups) ||
    !Array.isArray(state.combatEffects) ||
    state.ordnance.length > 200 ||
    state.fires.length > 50 ||
    state.pickups.length > 600 ||
    state.combatEffects.length > 100
  )
    throw new Error('The saved combat world is invalid.');
  if (
    !Array.isArray(p.ownedWeapons) ||
    p.ownedWeapons.some((id) => !WEAPONS[id]) ||
    new Set(p.ownedWeapons).size !== p.ownedWeapons.length ||
    p.weapons.some((id) => !p.ownedWeapons.includes(id)) ||
    new Set(p.weapons.map((id) => WEAPONS[id].class)).size !== p.weapons.length
  )
    throw new Error('The saved weapon loadout is invalid.');
  if (
    !finite(p.z, 0, 100) ||
    !finite(p.vz, -500, 500) ||
    !finite(p.recoil, 0, 2) ||
    !finite(p.dodgeRemaining, 0, 1) ||
    !finite(p.dodgeAngle, -10, 10) ||
    !finite(p.defenseStarted, -1000, 1e9) ||
    !finite(p.counterUntil, -1000, 1e9) ||
    !finite(p.throwCharge, 0, 1) ||
    !Number.isInteger(p.attackSerial) ||
    p.attackSerial < 0 ||
    ['crouching', 'scoped', 'aiming', 'defending'].some((key) => typeof p[key] !== 'boolean')
  )
    throw new Error('The saved combat stance is invalid.');
  if (
    p.cover &&
    (!point(p.cover) ||
      !world.buildings.some((b) => b.id === p.cover.buildingId) ||
      !['west', 'east', 'north', 'south'].includes(p.cover.side) ||
      ![-1, 0, 1].includes(p.cover.nx) ||
      ![-1, 0, 1].includes(p.cover.ny) ||
      Math.abs(p.cover.nx) + Math.abs(p.cover.ny) !== 1 ||
      !finite(p.cover.min, 0, Math.max(world.width, world.height)) ||
      !finite(p.cover.max, p.cover.min, Math.max(world.width, world.height)))
  )
    throw new Error('The saved cover position is invalid.');
  if (
    p.traversal &&
    (!['vault', 'climb'].includes(p.traversal.kind) ||
      !point(p.traversal.start) ||
      !point(p.traversal.end) ||
      !finite(p.traversal.elapsed, 0, 3) ||
      !finite(p.traversal.duration, 0.01, 3) ||
      !finite(p.traversal.height, 0, 100))
  )
    throw new Error('The saved traversal is invalid.');
  if (
    p.heldObject &&
    (!['glass', 'metal', 'stone'].includes(p.heldObject.material) ||
      typeof p.heldObject.name !== 'string' ||
      p.heldObject.name.length > 100)
  )
    throw new Error('The saved held object is invalid.');
  for (const actor of [p, ...state.hostiles, ...state.police]) {
    if (
      actor.meleeAction &&
      (!WEAPONS[actor.meleeAction.weapon] ||
        WEAPONS[actor.meleeAction.weapon].mode !== 'melee' ||
        !finite(actor.meleeAction.elapsed, 0, 5) ||
        !finite(actor.meleeAction.duration, 0.01, 5) ||
        !finite(actor.meleeAction.windup, 0, 3) ||
        !finite(actor.meleeAction.damage, 0, 150) ||
        !finite(actor.meleeAction.reach, 0, 50))
    )
      throw new Error('The saved melee action is invalid.');
    if (
      actor !== p &&
      actor.ammo &&
      (!WEAPONS[actor.weapon] ||
        !Number.isInteger(actor.ammo.clip) ||
        !finite(actor.ammo.clip, 0, WEAPONS[actor.weapon]?.clipSize) ||
        !Number.isInteger(actor.ammo.reserve) ||
        !finite(actor.ammo.reserve, 0, 100000))
    )
      throw new Error('The saved combatant supply is invalid.');
  }
  if (
    state.ordnance.some(
      (item) =>
        !point(item) ||
        !WEAPONS[item.weapon] ||
        !['rocket', 'grenade', 'molotov', 'object'].includes(item.kind) ||
        !finite(item.z, 0, 1000) ||
        !finite(item.vx, -1000, 1000) ||
        !finite(item.vy, -1000, 1000) ||
        !finite(item.vz, -500, 500) ||
        !finite(item.remaining, 0, 30) ||
        !finite(item.damage, 0, 500) ||
        !finite(item.radius, 0, 200) ||
        typeof item.owner !== 'string' ||
        (item.fuse !== null && item.fuse !== undefined && !finite(item.fuse, 0, 30)),
    )
  )
    throw new Error('The saved ordnance is invalid.');
  if (
    state.fires.some(
      (item) =>
        !point(item) ||
        !finite(item.radius, 0, 200) ||
        !finite(item.maxRadius, item.radius, 200) ||
        !finite(item.remaining, 0, 30) ||
        !finite(item.damage, 0, 100) ||
        typeof item.owner !== 'string',
    )
  )
    throw new Error('The saved fires are invalid.');
  if (
    state.pickups.some(
      (item) =>
        !point(item) ||
        !WEAPONS[item.weapon] ||
        !['weapon', 'object'].includes(item.type) ||
        typeof item.available !== 'boolean' ||
        !finite(item.remaining, 0, 3600) ||
        (item.ammo !== undefined &&
          (!Number.isInteger(item.ammo) || !finite(item.ammo, 0, 100000))) ||
        (item.type === 'object' && !['glass', 'metal', 'stone'].includes(item.material)),
    )
  )
    throw new Error('The saved pickups are invalid.');
  if (
    state.combatEffects.some(
      (item) => !point(item) || typeof item.type !== 'string' || !finite(item.remaining, 0, 5),
    )
  )
    throw new Error('The saved combat effects are invalid.');
}
