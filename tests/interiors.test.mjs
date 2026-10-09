import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTERIOR_LAYOUTS,
  PORTAL_DEFINITIONS,
  initializeInteriors,
  interiorAvailability,
  nearbyInteriorPortals,
  enterInterior,
  exitInterior,
  emergencyExteriorReturn,
  updateInterior,
  tickInterior,
  isInteriorBlocked,
  interiorCollisionVolumes,
  toggleInteriorCover,
  interiorActors,
  hasInteriorLineOfSight,
  setInteriorDoor,
  damageInteriorProp,
  nearestInteriorInteractable,
  interactInterior,
  withExteriorContext,
  interiorScene,
  validateInteriorState,
  saveInteriorState,
  restoreInteriorState,
} from '../src/interiors.js';
import { hitCombatant } from '../src/combat.js';
import { WORLD as CITY } from '../src/world.js';

const world = {
  width: 2000,
  height: 2000,
  bounds: { left: 0, top: 0, right: 2000, bottom: 2000 },
  spawn: { x: 500, y: 500 },
  buildings: [],
  obstacles: [],
  roads: [],
  water: [],
  locations: [
    { id: 'felix-office', x: 458, y: 700 },
    { id: 'saira-shop', x: 780, y: 718 },
    { id: 'lantern-darts', x: 723, y: 918 },
    { id: 'blue-hour-lanes', x: 411, y: 654 },
    { id: 'dockside-rooms', x: 129, y: 308 },
  ],
};
function state() {
  return {
    time: 12,
    player: {
      x: 458,
      y: 700,
      z: 0,
      groundZ: 0,
      angle: 0.7,
      health: 100,
      money: 240,
      armour: 40,
      vehicleId: null,
    },
    vehicles: [],
    wanted: { level: 0, observed: false },
    scene: { kind: 'exterior', id: 'harbor-city' },
  };
}
function enter(roomId = 'voss-dispatch', extra = {}) {
  const s = state(),
    definition = PORTAL_DEFINITIONS.find((portal) => portal.roomId === roomId),
    anchor = world.locations.find((location) => location.id === definition.locationId);
  s.player.x = anchor.x;
  s.player.y = anchor.y;
  assert.equal(enterInterior(s, definition.id, { world, ...extra }).ok, true);
  return s;
}
function tick(s, seconds, input = {}, callbacks = { world }) {
  for (let i = 0; i < Math.round(seconds * 60); i++) updateInterior(s, 1 / 60, input, callbacks);
  return s;
}
function at(s, x, y) {
  s.player.x = x;
  s.player.y = y;
}

test('authored original layouts have distinct dimensions, floor zones, physical walls/props, doors and hooks', () => {
  assert.deepEqual(Object.keys(INTERIOR_LAYOUTS).sort(), [
    'blue-hour-lanes',
    'dockside-rooms',
    'lantern-bar',
    'saira-garage',
    'voss-dispatch',
  ]);
  assert.equal(
    new Set(Object.values(INTERIOR_LAYOUTS).map((room) => `${room.width}x${room.height}`)).size,
    5,
  );
  for (const room of Object.values(INTERIOR_LAYOUTS)) {
    assert.ok(room.walls.length >= 5);
    assert.ok(room.props.length >= 5);
    assert.ok(room.doors.some((door) => door.exit));
    assert.ok(room.hooks.length >= 2);
    assert.ok(room.floorRegions.length >= 2);
    assert.ok(Object.isFrozen(room));
  }
  assert.ok(
    INTERIOR_LAYOUTS['blue-hour-lanes'].floorRegions.filter((region) =>
      region.id.startsWith('lane-'),
    ).length === 4,
  );
});

test('every demo service and actor has a traversable local approach through actual open door geometry', () => {
  for (const room of Object.values(INTERIOR_LAYOUTS)) {
    const s = enter(room.id);
    for (const door of room.doors) setInteriorDoor(s, door.id, { locked: false, open: true });
    const cell = 4,
      queue = [{ x: room.spawn.x, y: room.spawn.y }],
      seen = new Set();
    for (let index = 0; index < queue.length; index++) {
      const point = queue[index];
      for (const [dx, dy] of [
        [cell, 0],
        [-cell, 0],
        [0, cell],
        [0, -cell],
      ]) {
        const next = { x: point.x + dx, y: point.y + dy },
          key = `${next.x},${next.y}`;
        if (
          seen.has(key) ||
          next.x < 0 ||
          next.x > room.width ||
          next.y < 0 ||
          next.y > room.height
        )
          continue;
        seen.add(key);
        if (!isInteriorBlocked(s, next.x, next.y, 6)) queue.push(next);
      }
    }
    for (const hook of room.hooks)
      assert.ok(
        queue.some(
          (point) =>
            Math.hypot(point.x - hook.x, point.y - hook.y) < hook.radius &&
            hasInteriorLineOfSight(s, { ...point, z: 14 }, { ...hook, z: 12 }),
        ),
        `${room.id}:${hook.id} must have a reachable usable approach`,
      );
    for (const actor of interiorActors(s)) {
      assert.equal(
        isInteriorBlocked(s, actor.x, actor.y, 6),
        false,
        `${actor.id} must start clear of furniture and walls`,
      );
      assert.ok(
        queue.some((point) => Math.hypot(point.x - actor.x, point.y - actor.y) < 12),
        `${actor.id} must be physically reachable`,
      );
    }
  }
});

test('all authored portals enter and return at the established collision-clear live city addresses', () => {
  for (const portal of PORTAL_DEFINITIONS) {
    const s = state(),
      anchor = CITY.locations.find((location) => location.id === portal.locationId);
    Object.assign(s.player, { x: anchor.x, y: anchor.y, z: anchor.z || 0, groundZ: anchor.z || 0 });
    assert.equal(enterInterior(s, portal.id, { world: CITY }).ok, true);
    assert.equal(emergencyExteriorReturn(s, { world: CITY }).ok, true);
    assert.equal(s.player.x, anchor.x);
    assert.equal(s.player.y, anchor.y);
    assert.equal(s.scene.kind, 'exterior');
  }
});

test('unsupported city addresses do not become generic rooms and authored demos do not claim catalogue-wide coverage', () => {
  assert.equal(interiorAvailability('LL-CITY-LOC001').status, 'unimplemented');
  assert.equal(interiorAvailability('LL-CITY-LOC161').status, 'unimplemented');
  assert.equal(interiorAvailability('felix-office').roomId, 'voss-dispatch');
  assert.equal(PORTAL_DEFINITIONS.length, 5);
  const s = state();
  assert.equal(enterInterior(s, 'LL-CITY-LOC001', { world }).ok, false);
  assert.equal(s.scene.kind, 'exterior');
});

test('portal entry requires actual proximity, supported venue, grounded health and appropriate pursuit state', () => {
  const s = state();
  initializeInteriors(s);
  s.player.x = 1200;
  assert.equal(enterInterior(s, 'voss-dispatch-entry', { world }).ok, false);
  assert.equal(nearbyInteriorPortals(s, world).length, 0);
  s.player.x = 458;
  s.player.health = 0;
  assert.equal(enterInterior(s, 'voss-dispatch-entry', { world }).ok, false);
  s.player.health = 100;
  s.wanted.level = 1;
  assert.equal(enterInterior(s, 'voss-dispatch-entry', { world }).ok, false);
  s.wanted.level = 0;
  s.player.z = 20;
  assert.equal(enterInterior(s, 'voss-dispatch-entry', { world }).ok, false);
  s.player.z = 0;
  assert.equal(enterInterior(s, 'voss-dispatch-entry', { world, canEnter: () => false }).ok, false);
  assert.equal(nearbyInteriorPortals(s, world)[0].id, 'voss-dispatch-entry');
  assert.equal(enterInterior(s, 'voss-dispatch-entry', { world }).ok, true);
  assert.equal(nearbyInteriorPortals(s, world).length, 0);
});

test('a nearby portal cannot teleport the player through a solid exterior obstruction', () => {
  const s = state();
  assert.equal(
    enterInterior(s, 'voss-dispatch-entry', { world, hasExteriorLineOfSight: () => false }).ok,
    false,
  );
  assert.equal(s.scene.kind, 'exterior');
});

test('entry stores an explicit exterior identity and moves only the player into real room coordinates', () => {
  const s = state(),
    money = s.player.money;
  let event;
  assert.equal(
    enterInterior(s, 'voss-dispatch-entry', { world, onEnter: (value) => (event = value) }).ok,
    true,
  );
  assert.equal(s.scene.kind, 'interior');
  assert.equal(s.player.sceneId, 'voss-dispatch');
  assert.deepEqual({ x: s.player.x, y: s.player.y }, { x: 168, y: 198 });
  assert.deepEqual(
    { x: s.interior.active.exterior.x, y: s.interior.active.exterior.y },
    { x: 458, y: 700 },
  );
  assert.equal(s.player.money, money);
  assert.equal(event.portalId, 'voss-dispatch-entry');
  assert.equal(interiorScene(s).room.id, 'voss-dispatch');
});

test('solid walls, floor bounds and furniture are actual collision volumes and fast movement cannot tunnel through them', () => {
  const s = enter();
  assert.equal(isInteriorBlocked(s, 0, 30, 7), true);
  assert.equal(isInteriorBlocked(s, 120, 70, 7), true);
  assert.equal(isInteriorBlocked(s, 160, 150, 7), false);
  at(s, 160, 140);
  tick(s, 3, { moveY: -1, sprint: true });
  assert.ok(s.player.y >= 93);
  assert.ok(!isInteriorBlocked(s, s.player.x, s.player.y, 7));
  at(s, 40, 110);
  tick(s, 3, { moveX: -1 });
  assert.ok(s.player.x >= 17);
});

test('closed internal doors block movement and sight, opening connects the rooms and occupied doors cannot crush the player', () => {
  const s = enter();
  const a = { x: 195, y: 136, z: 14 },
    b = { x: 239, y: 136, z: 14 };
  assert.equal(hasInteriorLineOfSight(s, a, b), false);
  assert.equal(isInteriorBlocked(s, 220, 136, 7), true);
  assert.equal(setInteriorDoor(s, 'records-door', { open: true }), true);
  assert.equal(hasInteriorLineOfSight(s, a, b), true);
  assert.equal(isInteriorBlocked(s, 220, 136, 7), false);
  at(s, 195, 136);
  tick(s, 1, { moveX: 1 });
  assert.ok(s.player.x > 224);
  at(s, 220, 136);
  assert.equal(setInteriorDoor(s, 'records-door', { open: false }), false);
});

test('the locked staff door remains a gate until explicitly unlocked by the caller', () => {
  const s = enter('lantern-bar');
  at(s, 310, 46);
  assert.equal(nearestInteriorInteractable(s).id, 'staff-door');
  assert.equal(interactInterior(s, { world }).ok, false);
  assert.equal(setInteriorDoor(s, 'staff-door', { open: true }), false);
  assert.equal(setInteriorDoor(s, 'staff-door', { locked: false, open: true }), true);
});

test('sight through low cover respects actual ray height and destroyed room props cease blocking', () => {
  const s = enter();
  const lowA = { x: 110, y: 40, z: 10 },
    lowB = { x: 110, y: 104, z: 10 };
  assert.equal(hasInteriorLineOfSight(s, lowA, lowB), true, 'ray beside the desk stays clear');
  assert.equal(
    hasInteriorLineOfSight(s, { x: 150, y: 40, z: 10 }, { x: 150, y: 110, z: 10 }),
    false,
  );
  assert.equal(
    hasInteriorLineOfSight(s, { x: 150, y: 40, z: 25 }, { x: 150, y: 110, z: 25 }),
    true,
  );
  assert.equal(damageInteriorProp(s, 'dispatch-desk', 100), true);
  assert.equal(isInteriorBlocked(s, 150, 70, 7), false);
  assert.equal(
    hasInteriorLineOfSight(s, { x: 150, y: 40, z: 10 }, { x: 150, y: 110, z: 10 }),
    true,
  );
});

test('indoor cover attaches to real volumes, constrains movement along the edge and permits moving away', () => {
  const s = enter();
  at(s, 160, 95);
  assert.ok(interiorCollisionVolumes(s).some((volume) => volume.id === 'dispatch-desk'));
  assert.equal(toggleInteriorCover(s), true);
  assert.equal(s.player.cover.buildingId, 'dispatch-desk');
  assert.equal(s.player.cover.side, 'south');
  assert.equal(s.player.y, 94);
  tick(s, 0.4, { moveX: 1 });
  assert.ok(s.player.x > 170 && s.player.x < 171);
  assert.equal(s.player.y, 94);
  assert.equal(s.player.crouching, true);
  tick(s, 0.2, { moveY: 1 });
  assert.equal(s.player.cover, null);
  assert.ok(s.player.y > 100);
  at(s, 160, 95);
  toggleInteriorCover(s);
  damageInteriorProp(s, 'dispatch-desk', 100);
  assert.equal(s.player.cover, null);
  assert.ok(!interiorCollisionVolumes(s).some((volume) => volume.id === 'dispatch-desk'));
});

test('the shared-core portal tick preserves jumping, stance, world time and actor positions', () => {
  const s = enter(),
    player = s.player;
  Object.assign(player, {
    z: 24,
    vz: 32,
    crouching: true,
    scoped: true,
    defending: true,
    speed: 61,
  });
  const before = structuredClone(player),
    actors = structuredClone(interiorActors(s));
  const time = s.time;
  tickInterior(s, 0.2, { world });
  assert.deepEqual(player, before);
  assert.deepEqual(interiorActors(s), actors);
  assert.equal(s.time, time);
  assert.equal(s.interior.active.elapsed, 0.2);
  assert.ok(Math.abs(s.interior.active.cooldown - 0.15) < 1e-9);
  setInteriorDoor(s, 'front-door', { open: true });
  at(s, 168, 241);
  tickInterior(s, 0.2, { world });
  assert.equal(s.interior.active, null);
  assert.equal(s.scene.kind, 'exterior');
});

test('portal-only incapacity recovery keeps actual health and returns to a collision-clear exterior', () => {
  const s = enter();
  s.player.health = 0;
  tickInterior(s, 0.1, { world });
  assert.equal(s.scene.kind, 'interior');
  tickInterior(s, 0.1, { world, returnOnIncapacitation: true });
  assert.equal(s.scene.kind, 'exterior');
  assert.equal(s.player.health, 0);
  assert.equal(s.interior.lastExit.reason, 'incapacitated');
});

test('room actors are persistent combatants and essential role metadata does not grant invulnerability', () => {
  const s = enter();
  const exteriorPeople = [{ id: 'exterior-person', x: 980, y: 930, health: 100 }];
  Object.assign(s, {
    pedestrians: exteriorPeople,
    police: [],
    hostiles: [],
    progress: { kills: 0 },
    combatEffects: [],
    pickups: [],
  });
  const felix = interiorActors(s)[0],
    reports = [];
  let sequence = 0;
  const ctx = {
    id: (prefix) => `${prefix}-${++sequence}`,
    reportCrime: (crime) => reports.push(crime),
  };
  assert.equal(felix.id, 'interior:voss-dispatch:felix-desk-role');
  assert.equal(felix.castId, 'felix-voss');
  assert.equal(felix.sceneId, 'voss-dispatch');
  assert.equal(felix.essential, true);
  hitCombatant(s, felix, 34, 'player', ctx);
  assert.equal(felix.health, 66);
  assert.equal(felix.panic, 9);
  assert.equal(reports[0].victimId, felix.id);
  hitCombatant(s, felix, 100, 'player', ctx);
  assert.equal(felix.health, 0);
  assert.equal(s.progress.kills, 1);
  assert.equal(s.pedestrians, exteriorPeople);
  assert.equal(exteriorPeople[0].health, 100);
  const target = state();
  restoreInteriorState(target, saveInteriorState(s), { world });
  assert.equal(interiorActors(target)[0].health, 0);
  assert.equal(interiorActors(target)[0].hitReaction.kind, 'bullet');
  emergencyExteriorReturn(target, { world });
  assert.deepEqual(interiorActors(target), []);
  enterInterior(target, 'voss-dispatch-entry', { world });
  assert.equal(interiorActors(target)[0].health, 0);
});

test('activity/shop/home hooks require a real local approach and hand decisions to callbacks without generic rewards', () => {
  for (const [roomId, hookId] of [
    ['voss-dispatch', 'refuge-rest'],
    ['lantern-bar', 'lantern-service'],
    ['lantern-bar', 'lantern-darts'],
    ['blue-hour-lanes', 'lanes-admission'],
  ]) {
    const s = enter(roomId),
      hook = INTERIOR_LAYOUTS[roomId].hooks.find((hook) => hook.id === hookId),
      money = s.player.money;
    at(s, hook.x, hook.y);
    assert.equal(
      interactInterior(s, { world }).ok,
      false,
      'unintegrated services must not pretend success',
    );
    let action;
    assert.equal(
      interactInterior(s, {
        world,
        onHook: (value) => {
          action = value;
          return { ok: true };
        },
      }).ok,
      true,
    );
    assert.equal(action.hookId, hookId);
    assert.equal(action.roomId, roomId);
    assert.equal(s.player.money, money);
    assert.equal(s.interior.rooms[roomId].hookCalls[hookId], 1);
  }
});

test('rejected hooks do not increment invocation state or grant cash/progression', () => {
  const s = enter('lantern-bar');
  at(s, 280, 130);
  const money = s.player.money;
  assert.equal(interactInterior(s, { world, onHook: () => ({ ok: false }) }).ok, false);
  assert.equal(s.player.money, money);
  assert.deepEqual(s.interior.rooms['lantern-bar'].hookCalls, {});
  assert.equal(interactInterior(s, { world, onHook: async () => ({ ok: true }) }).ok, false);
  assert.deepEqual(s.interior.rooms['lantern-bar'].hookCalls, {});
});

test('a normal exit requires a nearby open exterior doorway, then restores the exact world identity and preserves transactions', () => {
  const s = enter();
  assert.equal(exitInterior(s, { world }).ok, false);
  at(s, 168, 218);
  assert.equal(interactInterior(s, { world }).ok, true);
  assert.equal(s.interior.rooms['voss-dispatch'].doors['front-door'].open, true);
  s.player.money = 198;
  let event;
  assert.equal(exitInterior(s, { world, onExit: (value) => (event = value) }).ok, true);
  assert.equal(s.scene.kind, 'exterior');
  assert.equal(s.scene.id, 'harbor-city');
  assert.equal(s.player.x, 458);
  assert.equal(s.player.y, 700);
  assert.equal(s.player.money, 198);
  assert.equal(s.interior.active, null);
  assert.equal(event.type, 'exit');
});

test('walking through an opened door performs a real threshold crossing and exterior transition', () => {
  const s = enter();
  setInteriorDoor(s, 'front-door', { open: true });
  at(s, 168, 220);
  tick(s, 1, { moveY: 1 });
  assert.equal(s.interior.active, null);
  assert.equal(s.scene.kind, 'exterior');
  assert.equal(s.player.y, 700);
});

test('garage admission transfers the actual vehicle, permits bounded indoor driving, and returns the same entity', () => {
  const s = state();
  s.player.x = 780;
  s.player.y = 718;
  s.player.vehicleId = 'cab';
  s.vehicles = [
    {
      id: 'cab',
      spec: 'taxi',
      x: 780,
      y: 718,
      z: 0,
      groundZ: 0,
      angle: 1,
      speed: 0,
      health: 80,
      occupied: true,
    },
  ];
  assert.equal(enterInterior(s, 'voss-dispatch-entry', { world }).ok, false);
  assert.equal(enterInterior(s, 'saira-garage-entry', { world }).ok, true);
  const car = s.vehicles[0];
  assert.equal(car.scene.id, 'saira-garage');
  assert.equal(car.x, 96);
  assert.equal(car.y, 232);
  tick(s, 0.5, { up: true });
  assert.ok(car.y < 232);
  assert.equal(car.x, s.player.x);
  car.health = 120;
  setInteriorDoor(s, 'front-door', { open: true });
  at(s, 96, 277);
  car.x = 96;
  car.y = 277;
  assert.equal(exitInterior(s, { world }).ok, true);
  assert.equal(s.player.vehicleId, 'cab');
  assert.equal(car.x, 780);
  assert.equal(car.y, 718);
  assert.equal(car.health, 120);
  assert.equal(car.scene, null);
});

test('observed pursuit and fast vehicles cannot use a service-door transition as an evasion shortcut', () => {
  const s = state();
  s.player.x = 780;
  s.player.y = 718;
  s.player.vehicleId = 'cab';
  s.vehicles = [
    {
      id: 'cab',
      x: 780,
      y: 718,
      z: 0,
      groundZ: 0,
      angle: 0,
      speed: 30,
      health: 100,
      occupied: true,
    },
  ];
  assert.equal(enterInterior(s, 'saira-garage-entry', { world }).ok, false);
  s.vehicles[0].speed = 0;
  s.wanted.level = 2;
  s.wanted.observed = true;
  assert.equal(enterInterior(s, 'saira-garage-entry', { world }).ok, false);
  s.wanted.observed = false;
  assert.equal(enterInterior(s, 'saira-garage-entry', { world }).ok, true);
  assert.equal(s.wanted.level, 2);
});

test('world transaction adapters preserve local player/car coordinates even when a callback throws', () => {
  const s = enter(),
    local = { x: s.player.x, y: s.player.y },
    scene = s.scene;
  withExteriorContext(s, (current) => {
    assert.equal(current.player.x, 458);
    assert.equal(current.player.y, 700);
    assert.equal(current.scene.kind, 'exterior');
    current.player.money -= 18;
  });
  assert.deepEqual({ x: s.player.x, y: s.player.y }, local);
  assert.equal(s.scene, scene);
  assert.equal(s.player.money, 222);
  assert.throws(
    () =>
      withExteriorContext(s, () => {
        throw new Error('transaction interrupted');
      }),
    /interrupted/,
  );
  assert.deepEqual({ x: s.player.x, y: s.player.y }, local);
  assert.throws(() => withExteriorContext(s, async () => {}), /synchronous/);
});

test('garage world adapters retain real vehicle repairs but never leave the car parked in exterior coordinates indoors', () => {
  const s = state();
  s.player.x = 780;
  s.player.y = 718;
  s.player.vehicleId = 'cab';
  s.vehicles = [
    { id: 'cab', x: 780, y: 718, z: 0, groundZ: 0, angle: 0, speed: 0, health: 80, occupied: true },
  ];
  enterInterior(s, 'saira-garage-entry', { world });
  const car = s.vehicles[0];
  car.speed = 12;
  withExteriorContext(s, (current) => {
    assert.equal(current.vehicles[0].x, 780);
    assert.equal(current.vehicles[0].speed, 0);
    current.player.money -= 120;
    current.vehicles[0].health = 120;
  });
  assert.equal(car.x, 96);
  assert.equal(car.y, 232);
  assert.equal(car.health, 120);
  assert.equal(s.player.money, 120);
  assert.equal(
    car.speed,
    12,
    'exterior callbacks must restore indoor speed while retaining real repair costs',
  );
  s.player.vehicleId = null;
  car.occupied = false;
  withExteriorContext(
    s,
    (current) => {
      assert.equal(current.player.vehicleId, 'cab');
      assert.equal(current.player.sceneId, null);
      assert.equal(current.vehicles[0].x, 780);
      current.vehicles[0].health = 160;
    },
    { includeEnteredVehicle: true },
  );
  assert.equal(s.player.vehicleId, null);
  assert.equal(s.player.sceneId, 'saira-garage');
  assert.equal(car.health, 160);
  assert.equal(car.x, 96);
  assert.equal(car.occupied, false);
});

test('a disabled service vehicle becomes an on-foot emergency return while its actual wreck stays at the original exterior bay', () => {
  const s = state();
  s.player.x = 780;
  s.player.y = 718;
  s.player.vehicleId = 'cab';
  s.vehicles = [
    { id: 'cab', x: 780, y: 718, z: 0, groundZ: 0, angle: 0, speed: 0, health: 80, occupied: true },
  ];
  enterInterior(s, 'saira-garage-entry', { world });
  s.vehicles[0].health = 0;
  updateInterior(s, 1 / 60, {}, { world });
  assert.equal(s.player.vehicleId, null);
  assert.equal(emergencyExteriorReturn(s, { world }, 'vehicle-disabled').ok, true);
  assert.equal(s.vehicles[0].x, 780);
  assert.equal(s.vehicles[0].y, 718);
  assert.equal(s.vehicles[0].health, 0);
  assert.equal(s.vehicles[0].occupied, false);
  assert.equal(s.player.vehicleId, null);
});

test('blocked exterior returns search actual nearby collision-clear points rather than placing the player in a wall', () => {
  const s = enter();
  setInteriorDoor(s, 'front-door', { open: true });
  at(s, 168, 218);
  const collision = (x, y) => Math.hypot(x - 458, y - 700) < 20;
  assert.equal(exitInterior(s, { world, isExteriorBlocked: collision }).ok, true);
  assert.ok(Math.hypot(s.player.x - 458, s.player.y - 700) >= 20);
});

test('emergency return can recover at an explicit safe destination, and a completely obstructed world preserves the indoor identity', () => {
  const s = enter();
  assert.equal(
    emergencyExteriorReturn(
      s,
      { world, emergencyDestination: { x: 600, y: 600, z: 0 } },
      'recovery',
    ).ok,
    true,
  );
  assert.equal(s.player.x, 600);
  assert.equal(s.interior.lastExit.reason, 'recovery');
  const blocked = enter();
  assert.equal(
    emergencyExteriorReturn(blocked, { world, isExteriorBlocked: () => true }, 'recovery').ok,
    false,
  );
  assert.equal(blocked.scene.kind, 'interior');
  assert.ok(blocked.interior.active);
});

test('door/prop state and local/exterior save identities survive deterministic continuation and re-entry', () => {
  const a = enter();
  setInteriorDoor(a, 'records-door', { open: true });
  damageInteriorProp(a, 'dispatch-desk', 34);
  at(a, 170, 140);
  tick(a, 0.2, { moveX: 1 });
  const saved = saveInteriorState(a),
    b = state();
  b.player.money = 123;
  restoreInteriorState(b, saved, { world });
  assert.equal(b.player.money, 123, 'the interior snapshot cannot overwrite economy');
  tick(a, 0.2, { moveX: 1 });
  tick(b, 0.2, { moveX: 1 });
  assert.deepEqual(b.interior, a.interior);
  assert.deepEqual({ x: b.player.x, y: b.player.y }, { x: a.player.x, y: a.player.y });
  emergencyExteriorReturn(a, { world });
  enterInterior(a, 'voss-dispatch-entry', { world });
  assert.equal(a.interior.rooms['voss-dispatch'].doors['records-door'].open, true);
  assert.equal(a.interior.rooms['voss-dispatch'].props['dispatch-desk'].health, 66);
  assert.equal(a.interior.rooms['voss-dispatch'].visits, 2);
});

test('restoring invalid versions, missing room identities, corrupt doors and nonfinite positions is atomic', () => {
  const original = enter(),
    snapshot = JSON.parse(saveInteriorState(original)),
    target = state(),
    before = JSON.stringify(target);
  const invalidVersion = { ...snapshot, version: 99 };
  assert.throws(() => restoreInteriorState(target, invalidVersion, { world }), /format/);
  const corrupt = structuredClone(snapshot);
  corrupt.interior.rooms['voss-dispatch'].doors['records-door'] = { open: true, locked: true };
  assert.throws(() => restoreInteriorState(target, corrupt, { world }), /doorway/);
  const missing = structuredClone(snapshot);
  missing.interior.active.roomId = 'generic-for-every-address';
  assert.throws(() => restoreInteriorState(target, missing, { world }), /context/);
  const nonfinite = structuredClone(snapshot);
  nonfinite.player.x = NaN;
  assert.throws(() => restoreInteriorState(target, nonfinite, { world }), /coordinates/);
  const economy = structuredClone(snapshot);
  economy.player.money = 99999;
  assert.throws(() => restoreInteriorState(target, economy, { world }), /external gameplay/);
  const falseOwnership = structuredClone(snapshot);
  falseOwnership.player.vehicleId = 'unrelated-car';
  assert.throws(() => restoreInteriorState(target, falseOwnership, { world }), /ownership/);
  assert.equal(JSON.stringify(target), before);
  assert.throws(() => restoreInteriorState(target, '{bad'), /JSON/);
  assert.equal(validateInteriorState(state(), { world }), true);
});

test('room actor identity, local coordinates, health, equipment and cooldowns are validated before any restore mutation', () => {
  const source = enter(),
    snapshot = JSON.parse(saveInteriorState(source)),
    target = state(),
    before = JSON.stringify(target);
  for (const change of [
    (actor) => (actor.id = 'exterior-person'),
    (actor) => (actor.sceneId = 'harbor-city'),
    (actor) => (actor.castId = 'unrelated-cast'),
    (actor) => (actor.health = 101),
    (actor) => (actor.x = 12000),
    (actor) => (actor.weapon = 'imaginary-weapon'),
    (actor) => (actor.ammo.clip = 999),
    (actor) => (actor.fireCooldown = NaN),
  ]) {
    const corrupt = structuredClone(snapshot);
    change(corrupt.interior.rooms['voss-dispatch'].actors[0]);
    assert.throws(() => restoreInteriorState(target, corrupt, { world }), /room actor/);
    assert.equal(JSON.stringify(target), before);
  }
});

test('locking an open door or closing over a parked indoor vehicle is rejected atomically', () => {
  const s = enter();
  setInteriorDoor(s, 'front-door', { open: true });
  assert.equal(setInteriorDoor(s, 'front-door', { locked: true }), false);
  assert.deepEqual(s.interior.rooms['voss-dispatch'].doors['front-door'], {
    open: true,
    locked: false,
  });
  const garage = state();
  garage.player.x = 780;
  garage.player.y = 718;
  garage.player.vehicleId = 'cab';
  garage.vehicles = [
    {
      id: 'cab',
      x: 780,
      y: 718,
      z: 0,
      groundZ: 0,
      angle: 0,
      speed: 0,
      health: 100,
      occupied: true,
    },
  ];
  enterInterior(garage, 'saira-garage-entry', { world });
  setInteriorDoor(garage, 'front-door', { open: true });
  garage.player.vehicleId = null;
  garage.vehicles[0].x = 96;
  garage.vehicles[0].y = 292;
  at(garage, 250, 160);
  assert.equal(setInteriorDoor(garage, 'front-door', { open: false }), false);
  assert.equal(garage.interior.rooms['saira-garage'].doors['front-door'].open, true);
});

test('cover stance survives a deterministic room snapshot without replacing external combat supply or economy', () => {
  const source = enter();
  at(source, 160, 95);
  toggleInteriorCover(source);
  tick(source, 0.2, { moveX: 1 });
  const target = state();
  target.player.money = 88;
  target.player.weapon = 'smg';
  restoreInteriorState(target, saveInteriorState(source), { world });
  assert.equal(target.player.crouching, true);
  assert.equal(target.player.cover.buildingId, 'dispatch-desk');
  assert.equal(target.player.weapon, 'smg');
  assert.equal(target.player.money, 88);
  tick(source, 0.2, { moveX: 1 });
  tick(target, 0.2, { moveX: 1 });
  assert.deepEqual(target.player.cover, source.player.cover);
  assert.equal(target.player.x, source.player.x);
  assert.equal(target.player.y, source.player.y);
});
