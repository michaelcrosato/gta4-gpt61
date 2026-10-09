import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain } from '../src/terrain.js';
import { createSurfaceMovement } from '../src/surface-movement.js';
import {
  initializeCompanions,
  ensureNamedActor,
  getActor,
  getSeat,
  vehicleOccupants,
  vehicleCapacity,
  companionSeatPose,
  requestBoard,
  requestExit,
  requestEscort,
  followCompanion,
  rejoinCompanion,
  updateCompanions,
  companionObservation,
  visibleCompanions,
  damageCompanion,
  applyVehicleImpact,
  validateCompanions,
  restoreCompanions,
} from '../src/companions.js';
const clone = (v) => JSON.parse(JSON.stringify(v));
const specs = {
  taxi: { length: 29, width: 15, seats: 4 },
  sedan: { length: 29, width: 15, seats: 4 },
  van: { length: 34, width: 17, seats: 2 },
  sports: { length: 28, width: 15, seats: 2 },
  police: { length: 31, width: 16, seats: 4 },
};
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
function fixture({ walls = [], carSpec = 'taxi' } = {}) {
  const geometry = {
    bounds: { left: -200, top: -200, right: 500, bottom: 500 },
    buildings: walls,
    obstacles: [],
    roads: [],
    water: [],
    landforms: [],
    tunnels: [],
  };
  const outside = createTerrain(geometry),
    inside = createTerrain({
      ...geometry,
      bounds: { left: 0, top: 0, right: 220, bottom: 180 },
      buildings: [],
    });
  const moves = new Map([
      [null, createSurfaceMovement(outside)],
      ['dockside-rooms', createSurfaceMovement(inside)],
    ]),
    queries = new Map([
      [null, outside],
      ['dockside-rooms', inside],
    ]);
  const state = {
    time: 0,
    player: {
      id: 'player',
      x: 0,
      y: 0,
      z: 0,
      groundZ: 0,
      health: 100,
      sceneId: null,
      vehicleId: null,
    },
    wanted: { level: 0 },
    vehicles: [
      {
        id: 'arc-arrival-taxi',
        spec: carSpec,
        x: 100,
        y: 0,
        z: 0,
        groundZ: 0,
        angle: 0,
        speed: 0,
        health: 120,
        occupied: true,
      },
    ],
    interior: { rooms: {} },
  };
  const context = {
    specs,
    sceneExists: (id) => queries.has(id),
    moveBody(actor, dx, dy, radius) {
      return moves.get(actor.sceneId ?? null).moveBody(actor, dx, dy, radius);
    },
    isBlocked: (x, y, r, z, id) => queries.get(id).isBlocked(x, y, r, z),
    hasLineOfSight: (a, b, id) => queries.get(id).hasLineOfSight(a, b),
    surfaceHeight: (x, y, z, id) => queries.get(id).surfaceHeight(x, y, z),
  };
  initializeCompanions(state);
  return { state, context };
}
function add(state, id = 'LL-CHAR-002', extra = {}) {
  return ensureNamedActor(state, {
    id,
    name: id === 'LL-CHAR-002' ? 'Felix Voss' : 'Nadia',
    x: 0,
    y: 20,
    z: 0,
    sceneId: null,
    health: 100,
    ...extra,
  });
}
function tick(state, context, dt = 0.05) {
  state.time += dt;
  updateCompanions(state, dt, context);
}
function until(state, context, predicate, max = 1200, dt = 0.05) {
  for (let i = 0; i < max && !predicate(); i++) tick(state, context, dt);
  assert.ok(
    predicate(),
    JSON.stringify({
      time: state.time,
      actors: state.companions.actors,
      records: state.companions.records,
    }),
  );
}
function boarded(extra = {}) {
  const f = fixture(extra),
    actor = add(f.state);
  assert.equal(requestBoard(f.state, actor.id, 'arc-arrival-taxi', f.context).ok, true);
  until(f.state, f.context, () => Boolean(getSeat(f.state, actor.id)));
  return { ...f, actor, vehicle: f.state.vehicles[0] };
}
function roundTrip(state, context) {
  validateCompanions(state, context);
  const model = restoreCompanions(JSON.stringify(state.companions), state, context);
  assert.deepEqual(model, state.companions);
  assert.notEqual(model, state.companions);
  return model;
}

test('canonical actors preserve identity, injury and position across ensure calls and proxy binding', () => {
  const { state, context } = fixture(),
    actor = add(state);
  damageCompanion(state, actor.id, 35, 'bullet', context);
  const before = clone(actor);
  assert.equal(
    ensureNamedActor(state, {
      id: actor.id,
      name: 'Felix',
      x: 300,
      y: 300,
      z: 0,
      sceneId: 'dockside-rooms',
      health: 100,
    }),
    actor,
  );
  assert.deepEqual(actor, before);
  assert.equal(actor.health, 65);
  add(state, 'LL-CHAR-008', { x: 30, y: 20 });
  roundTrip(state, context);
  const fresh = fixture(),
    proxy = {
      id: 'interior:dockside-rooms:felix-desk-role',
      layoutActorId: 'felix-desk-role',
      castId: 'felix-voss',
      sceneId: 'dockside-rooms',
      x: 50,
      y: 40,
      z: 0,
      groundZ: 0,
      angle: 0,
      health: 42,
      armour: 0,
    };
  fresh.state.interior.rooms['dockside-rooms'] = { actors: [proxy] };
  const bound = add(fresh.state);
  assert.equal(bound.sceneId, 'dockside-rooms');
  assert.equal(bound.x, 50);
  assert.equal(bound.health, 42);
  assert.equal(proxy.id, 'interior:dockside-rooms:felix-desk-role');
  assert.equal(proxy.companionId, bound.id);
  damageCompanion(fresh.state, bound.id, 12, 'impact', fresh.context);
  assert.equal(proxy.health, 30);
  roundTrip(fresh.state, fresh.context);
});

test('boarding walks to the passenger door and animates continuously before occupying a seat', () => {
  const { state, context } = fixture(),
    actor = add(state);
  const result = requestBoard(state, actor.id, 'arc-arrival-taxi', context);
  assert.equal(result.seat, 1);
  assert.equal(getSeat(state, actor.id), null);
  assert.deepEqual(vehicleOccupants(state, 'arc-arrival-taxi'), []);
  assert.equal(state.vehicles[0].companionSeats[0].status, 'reserved');
  let previous = { ...actor },
    boardingFrames = 0;
  for (let i = 0; i < 1000 && !getSeat(state, actor.id); i++) {
    tick(state, context, 0.02);
    assert.ok(Math.hypot(actor.x - previous.x, actor.y - previous.y) <= 1.041);
    assert.ok(Math.abs(actor.z - previous.z) <= 0.126);
    if (companionObservation(state, actor.id).phase === 'boarding') {
      boardingFrames++;
      assert.equal(getSeat(state, actor.id), null);
    }
    previous = { ...actor };
  }
  assert.ok(boardingFrames >= 30);
  assert.ok(getSeat(state, actor.id));
  close(actor.x, 103.48);
  close(actor.y, 3.3);
  close(actor.z, 5);
  roundTrip(state, context);
});

test('taxi/sedan allow three passengers plus parent driver and van/sports allow one passenger', () => {
  for (const spec of ['taxi', 'sedan', 'van', 'sports']) {
    const { state, context } = fixture({ carSpec: spec }),
      capacity = vehicleCapacity(state.vehicles[0], context);
    assert.equal(capacity, ['van', 'sports'].includes(spec) ? 2 : 4);
    for (let i = 0; i < capacity; i++) {
      const actor = add(state, `LL-CHAR-${String(i + 2).padStart(3, '0')}`, {
          x: -20,
          y: 20 + i * 10,
        }),
        result = requestBoard(state, actor.id, 'arc-arrival-taxi', context);
      assert.equal(result.ok, i < capacity - 1);
      if (result.ok) assert.ok(result.seat > 0 && result.seat < capacity);
      else assert.equal(result.reason, 'full');
    }
    assert.equal(state.vehicles[0].companionSeats.length, capacity - 1);
    roundTrip(state, context);
  }
});

test('three actual passengers occupy distinct physical seats and keep exact ownership through a turn', () => {
  const { state, context } = fixture();
  for (const [id, x, y] of [
    ['LL-CHAR-002', 0, 20],
    ['LL-CHAR-008', 0, -20],
    ['LL-CHAR-011', -20, 40],
  ]) {
    add(state, id, { x, y });
    requestBoard(state, id, 'arc-arrival-taxi', context);
  }
  until(state, context, () => vehicleOccupants(state, 'arc-arrival-taxi').length === 3);
  const occupants = vehicleOccupants(state, 'arc-arrival-taxi');
  assert.deepEqual(
    occupants.map((p) => p.seat),
    [1, 2, 3],
  );
  assert.ok(occupants.every((p) => p.alive));
  for (let i = 0; i < occupants.length; i++)
    for (let j = i + 1; j < occupants.length; j++)
      assert.ok(
        Math.hypot(
          occupants[i].pose.x - occupants[j].pose.x,
          occupants[i].pose.y - occupants[j].pose.y,
        ) >= 6,
      );
  state.vehicles[0].angle = Math.PI / 2;
  state.vehicles[0].x = 180;
  tick(state, context);
  assert.equal(state.vehicles[0].companionSeats.length, 3);
  roundTrip(state, context);
});

test('per-seat poses rotate, follow vehicle elevation and produce distinct visible seated descriptors', () => {
  const { state, context, actor, vehicle } = boarded();
  vehicle.x = 200;
  vehicle.y = 100;
  vehicle.z = 8;
  vehicle.groundZ = 8;
  vehicle.angle = Math.PI / 2;
  tick(state, context);
  const seat = getSeat(state, actor.id);
  close(seat.pose.x, 196.7);
  close(seat.pose.y, 103.48);
  close(seat.pose.z, 13);
  assert.equal(seat.pose.groundZ, 8);
  const rear = companionSeatPose(vehicle, 2, context);
  close(rear.x, 203.3);
  close(rear.y, 93.91);
  close(rear.z, 13);
  const descriptor = visibleCompanions(state, null)[0];
  assert.equal(descriptor.id, actor.id);
  assert.equal(descriptor.seated, true);
  assert.equal(descriptor.collisionRadius, 3);
  roundTrip(state, context);
});

test('safe exits reverse the real door path and stop counting the body as seated during egress', () => {
  const { state, context, actor, vehicle } = boarded();
  requestExit(state, actor.id, context);
  let previous = { ...actor },
    frames = 0;
  for (let i = 0; i < 100 && actor.vehicleId; i++) {
    tick(state, context, 0.02);
    assert.ok(Math.hypot(actor.x - previous.x, actor.y - previous.y) <= 1.041);
    assert.ok(Math.abs(actor.z - previous.z) <= 0.126);
    if (companionObservation(state, actor.id).phase === 'exiting') {
      frames++;
      assert.equal(getSeat(state, actor.id), null);
    }
    previous = { ...actor };
  }
  assert.ok(frames >= 30);
  assert.equal(actor.vehicleId, null);
  close(actor.y, 16.5);
  close(actor.z, 0);
  assert.deepEqual(vehicle.companionSeats, []);
  assert.equal(vehicle.occupied, true);
  roundTrip(state, context);
});

test('moving cars and blocked exits wait with finite abandonment and preserve the living body', () => {
  const { state, context, actor, vehicle } = boarded();
  vehicle.speed = 50;
  requestExit(state, actor.id, context);
  const before = { ...actor };
  for (let i = 0; i < 380; i++) tick(state, context);
  assert.equal(companionObservation(state, actor.id).abandoned, true);
  assert.equal(actor.health, 100);
  close(actor.x, before.x);
  close(actor.y, before.y);
  vehicle.speed = 0;
  const real = context.isBlocked;
  context.isBlocked = () => true;
  for (let i = 0; i < 20; i++) tick(state, context);
  assert.equal(actor.vehicleId, vehicle.id);
  context.isBlocked = real;
  until(state, context, () => actor.vehicleId === null);
  assert.equal(actor.health, 100);
});

test('a real wall prevents boarding and a physical waypoint path reaches the car around it', () => {
  const wall = { id: 'wall', x: 35, y: -30, w: 10, h: 60, height: 60 },
    blocked = fixture({ walls: [wall] }),
    a = add(blocked.state);
  requestBoard(blocked.state, a.id, 'arc-arrival-taxi', blocked.context);
  for (let i = 0; i < 380; i++) tick(blocked.state, blocked.context);
  assert.equal(getSeat(blocked.state, a.id), null);
  assert.equal(companionObservation(blocked.state, a.id).abandoned, true);
  assert.ok(a.x < 35);
  const routed = fixture({ walls: [wall] }),
    b = add(routed.state);
  routed.context.findRoute = (actor, target) =>
    actor.x < 55
      ? [{ x: 20, y: 50, z: 0, sceneId: null }, { x: 60, y: 50, z: 0, sceneId: null }, target]
      : [target];
  requestBoard(routed.state, b.id, 'arc-arrival-taxi', routed.context);
  until(routed.state, routed.context, () => Boolean(getSeat(routed.state, b.id)));
  assert.equal(b.health, 100);
});

test('follow, physical vehicle rejoin and escort exit retain the same living companion', () => {
  const { state, context } = fixture(),
    actor = add(state);
  state.player.x = 100;
  followCompanion(state, actor.id, 'player', context);
  until(state, context, () => Math.hypot(actor.x - 100, actor.y) <= 25.1);
  state.player.vehicleId = 'arc-arrival-taxi';
  until(state, context, () => Boolean(getSeat(state, actor.id)));
  state.player.vehicleId = null;
  requestEscort(state, actor.id, { x: 150, y: 80, z: 0, sceneId: null, radius: 3 }, context);
  until(state, context, () => companionObservation(state, actor.id).arrived);
  assert.equal(actor.vehicleId, null);
  assert.ok(Math.hypot(actor.x - 150, actor.y - 80) <= 3.01);
  assert.equal(actor.health, 100);
});

test('scene changes require a reached authorized portal and opaque scene mismatches never teleport', () => {
  const { state, context } = fixture(),
    actor = add(state);
  requestEscort(state, actor.id, { x: 80, y: 40, z: 0, sceneId: 'dockside-rooms' }, context);
  for (let i = 0; i < 20; i++) tick(state, context);
  assert.equal(actor.sceneId, null);
  assert.equal(actor.x, 0);
  const portal = {
    id: 'dockside-door',
    radius: 3,
    to: { x: 20, y: 20, z: 0, sceneId: 'dockside-rooms' },
  };
  context.findRoute = (body, target) =>
    body.sceneId === null ? [{ x: 50, y: 20, z: 0, sceneId: null, portal }, target] : [target];
  let transitions = 0;
  context.transitionScene = (body, link) => {
    assert.ok(Math.hypot(body.x - 50, body.y - 20) <= 3.01);
    transitions++;
    Object.assign(body, link.to, { groundZ: 0 });
    return true;
  };
  until(state, context, () => companionObservation(state, actor.id).arrived);
  assert.equal(transitions, 1);
  assert.equal(actor.sceneId, 'dockside-rooms');
  assert.equal(visibleCompanions(state, null).length, 0);
  assert.equal(visibleCompanions(state, 'dockside-rooms').length, 1);
  roundTrip(state, context);
});

test('collision damage, vehicle destruction and pursuit remain linked without replay or healing', () => {
  const { state, context, actor, vehicle } = boarded();
  state.wanted.level = 3;
  vehicle.health -= 20;
  applyVehicleImpact(state, vehicle.id, 20, context);
  close(actor.health, 89);
  tick(state, context);
  close(actor.health, 89);
  assert.equal(companionObservation(state, actor.id).pursuitLevel, 3);
  vehicle.health = 0;
  tick(state, context);
  assert.ok(actor.health < 89);
  assert.ok(actor.health > 0);
  until(state, context, () => actor.vehicleId === null);
  assert.equal(companionObservation(state, actor.id).failure.kind, 'vehicle-destroyed');
  const health = actor.health;
  ensureNamedActor(state, { id: actor.id, name: 'Felix', x: 0, y: 0, z: 0, health: 100 });
  assert.equal(actor.health, health);
  roundTrip(state, context);
});

test('death remains an occupied visible corpse and cannot respawn through boarding, escort or reentry', () => {
  const { state, context, actor, vehicle } = boarded();
  damageCompanion(state, actor.id, 1000, 'gunfire', context);
  assert.equal(actor.health, 0);
  assert.equal(companionObservation(state, actor.id).alive, false);
  assert.equal(vehicleOccupants(state, vehicle.id)[0].alive, false);
  assert.equal(requestExit(state, actor.id, context).reason, 'dead');
  assert.equal(requestBoard(state, actor.id, vehicle.id, context).reason, 'dead');
  assert.equal(
    requestEscort(state, actor.id, { x: 0, y: 0, z: 0, sceneId: null }, context).reason,
    'dead',
  );
  ensureNamedActor(state, { id: actor.id, name: 'Felix', x: 0, y: 0, z: 0, health: 100 });
  assert.equal(actor.health, 0);
  roundTrip(state, context);
});

test('repeated orders preserve finite grace and a nearby explicit rejoin preserves health and pose', () => {
  const { state, context } = fixture(),
    actor = add(state);
  state.player.x = 450;
  followCompanion(state, actor.id, 'player', context);
  context.hasLineOfSight = () => false;
  for (let i = 0; i < 400; i++) {
    followCompanion(state, actor.id, 'player', context);
    tick(state, context);
  }
  assert.equal(companionObservation(state, actor.id).abandoned, true);
  assert.equal(rejoinCompanion(state, actor.id, context).reason, 'leader-out-of-reach');
  state.player.x = 20;
  context.hasLineOfSight = () => true;
  const before = { ...actor };
  assert.equal(rejoinCompanion(state, actor.id, context).ok, true);
  assert.equal(actor.x, before.x);
  assert.equal(actor.health, before.health);
  tick(state, context);
  assert.equal(companionObservation(state, actor.id).abandoned, false);
});

test('mid-walk, mid-boarding, seated and mid-exit saves resume physical progress without event replay', () => {
  const { state, context } = fixture(),
    actor = add(state);
  requestBoard(state, actor.id, 'arc-arrival-taxi', context);
  tick(state, context, 0.3);
  roundTrip(state, context);
  until(state, context, () => companionObservation(state, actor.id).phase === 'boarding');
  tick(state, context, 0.2);
  roundTrip(state, context);
  const copy = clone(state);
  copy.companions = restoreCompanions(JSON.stringify(copy.companions), copy, context);
  for (let i = 0; i < 30; i++) {
    tick(state, context);
    tick(copy, context);
  }
  assert.deepEqual(copy, state);
  requestExit(state, actor.id, context);
  tick(state, context, 0.2);
  roundTrip(state, context);
  until(state, context, () => actor.vehicleId === null);
  roundTrip(state, context);
});

test('frame partitions and registry order preserve independent direct walking outcomes', () => {
  const A = fixture(),
    B = fixture();
  for (const f of [A, B]) {
    add(f.state);
    add(f.state, 'LL-CHAR-008', { x: 10, y: 40 });
    for (const actor of f.state.companions.actors)
      requestEscort(
        f.state,
        actor.id,
        { x: 150, y: actor.y, z: 0, sceneId: null, radius: 3 },
        f.context,
      );
  }
  B.state.companions.actors.reverse();
  B.state.companions.records.reverse();
  for (let i = 0; i < 100; i++) tick(A.state, A.context, 0.03);
  for (let i = 0; i < 60; i++) tick(B.state, B.context, 0.05);
  for (const actor of A.state.companions.actors) {
    const other = getActor(B.state, actor.id);
    close(actor.x, other.x);
    close(actor.y, other.y);
    assert.equal(actor.health, other.health);
  }
});

test('whole-save validation rejects wrong seats, ownership, cars, poses, scenes, health and unsafe JSON', () => {
  const { state, context } = boarded();
  roundTrip(state, context);
  for (const mutate of [
    (s) => (s.companions.version = 2),
    (s) => (s.companions.actors[0].health = Infinity),
    (s) => (s.companions.actors[0].x += 5),
    (s) => (s.companions.actors[0].sceneId = 'dockside-rooms'),
    (s) => (s.companions.actors[0].seat = 0),
    (s) => (s.vehicles[0].companionSeats = []),
    (s) => (s.companions.records[0].reservedVehicleId = 'missing'),
    (s) => s.companions.records.push(clone(s.companions.records[0])),
    (s) => (s.vehicles = []),
  ]) {
    const bad = clone(state);
    mutate(bad);
    assert.throws(() => validateCompanions(bad, context), /Invalid companion/);
  }
  const bad = clone(state.companions);
  Object.defineProperty(bad, 'poison', {
    enumerable: true,
    get() {
      throw Error('getter ran');
    },
  });
  assert.throws(() => restoreCompanions(bad, state, context), /JSON accessor/);
  assert.throws(() => restoreCompanions(null, state, context), /registry/);
  assert.throws(() => restoreCompanions('{', state, context), /save JSON/);
});

test('an escort order reverses unfinished boarding physically before walking away', () => {
  const { state, context } = fixture(),
    actor = add(state);
  requestBoard(state, actor.id, 'arc-arrival-taxi', context);
  until(state, context, () => companionObservation(state, actor.id).phase === 'boarding');
  tick(state, context, 0.2);
  const before = { ...actor };
  assert.equal(getSeat(state, actor.id), null);
  requestEscort(state, actor.id, { x: 150, y: 80, z: 0, sceneId: null, radius: 3 }, context);
  roundTrip(state, context);
  let previous = { ...actor };
  for (let i = 0; i < 1000 && !companionObservation(state, actor.id).arrived; i++) {
    tick(state, context, 0.02);
    assert.ok(Math.hypot(actor.x - previous.x, actor.y - previous.y) <= 1.041);
    roundTrip(state, context);
    previous = { ...actor };
  }
  assert.ok(companionObservation(state, actor.id).arrived);
  assert.equal(actor.vehicleId, null);
  assert.equal(actor.radius, 7);
  assert.equal(actor.inVehicle, false);
  assert.equal(actor.collisionHeight, 30);
  assert.equal(actor.eyeHeight, 14);
  assert.equal(actor.health, before.health);
});

test('transition, order, route and proxy tampering cannot become a post-restore teleport or crash', () => {
  const { state, context } = fixture(),
    actor = add(state);
  requestBoard(state, actor.id, 'arc-arrival-taxi', context);
  until(state, context, () => companionObservation(state, actor.id).phase === 'boarding');
  tick(state, context, 0.2);
  roundTrip(state, context);
  for (const mutate of [
    (s) => (s.companions.records[0].transition.from.x += 100),
    (s) => (s.companions.records[0].transition.elapsed = 0.7),
    (s) => (s.companions.records[0].transition.to.sceneId = 'dockside-rooms'),
    (s) => (s.companions.records[0].transition.vehicleId = 'missing'),
    (s) => (s.companions.records[0].order = { kind: 'escort' }),
    (s) => (s.companions.records[0].order.vehicleId = 'other-car'),
    (s) => (s.companions.records[0].route[0].portal = { id: 'bad' }),
    (s) => (s.companions.actors[0].proxyBindings = {}),
    (s) => (s.companions.sequence += 0.5),
  ]) {
    const bad = clone(state);
    mutate(bad);
    assert.throws(() => restoreCompanions(bad.companions, bad, context), /Invalid companion/);
  }
  const complete = boarded(),
    copy = clone(complete.state);
  copy.vehicles[0].companionSeats = copy.vehicles[0].companionSeats.map(
    ({ actorId, seat, status }) => ({ status, seat, actorId }),
  );
  assert.equal(
    validateCompanions(copy, complete.context),
    true,
    'JSON object key order has no ownership meaning',
  );
  copy.vehicles.push(clone(copy.vehicles[0]));
  assert.throws(() => validateCompanions(copy, complete.context), /duplicate vehicle/);
});

test('every public command has a complete immediately saveable ownership state', () => {
  const { state, context, actor } = boarded();
  requestExit(state, actor.id, context);
  roundTrip(state, context);
  until(state, context, () => !actor.vehicleId);
  requestEscort(state, actor.id, { x: 150, y: 80, z: 0, sceneId: null }, context);
  roundTrip(state, context);
  followCompanion(state, actor.id, 'player', context);
  roundTrip(state, context);
});

test('script control leaves cinematic foot movement to its owner while preserving damage and mounted ownership', () => {
  const { state, context } = fixture(),
    actor = add(state);
  requestEscort(state, actor.id, { x: 150, y: 80, z: 0, sceneId: null }, context);
  actor.scriptControlled = true;
  const before = { ...actor };
  tick(state, context, 2);
  assert.equal(actor.x, before.x);
  assert.equal(actor.y, before.y);
  assert.equal(companionObservation(state, actor.id).scriptControlled, true);
  damageCompanion(state, actor.id, 20, 'cinematic-crossfire', context);
  assert.equal(actor.health, 80);
  actor.scriptControlled = false;
  tick(state, context);
  assert.ok(actor.x > before.x);
  roundTrip(state, context);
  const seated = boarded();
  seated.context.isScriptControlled = () => true;
  seated.vehicle.x += 10;
  tick(seated.state, seated.context);
  close(seated.actor.x, 113.48);
  assert.equal(seated.actor.inVehicle, true);
  assert.equal(seated.actor.radius, 3);
  assert.equal(seated.actor.collisionHeight, 8);
  assert.equal(seated.actor.eyeHeight, 6);
});

test('an impossible seat count is refused and existing external passengers keep their real seat', () => {
  const { state, context } = fixture(),
    actor = add(state);
  context.externalSeatOwners = () => [{ actorId: 'existing-passenger', seat: 1 }];
  assert.equal(requestBoard(state, actor.id, 'arc-arrival-taxi', context).seat, 2);
  roundTrip(state, context);
  const invalid = fixture();
  invalid.context.specs = { ...specs, taxi: { ...specs.taxi, seats: 8 } };
  assert.throws(
    () => requestBoard(invalid.state, add(invalid.state).id, 'arc-arrival-taxi', invalid.context),
    /physically contain/,
  );
});

test('shared damage callbacks can apply real armour rules but cannot heal or asynchronously mutate life', () => {
  const { state, context } = fixture(),
    actor = add(state);
  let seen = null;
  context.damageActor = (body, amount, meta) => {
    seen = meta.cause;
    body.health -= amount / 2;
  };
  damageCompanion(state, actor.id, 30, 'pursuit-hit', context);
  assert.equal(actor.health, 85);
  assert.equal(seen, 'pursuit-hit');
  context.damageActor = (body) => (body.health = 100);
  assert.throws(() => damageCompanion(state, actor.id, 10, 'bad', context), /resolved health/);
  assert.equal(actor.health, 85);
  context.damageActor = async () => {};
  assert.throws(() => damageCompanion(state, actor.id, 10, 'bad', context), /async damage/);
  assert.equal(actor.health, 85);
});

test('a movement callback cannot teleport a companion or leave its body corrupted after rejection', () => {
  const { state, context } = fixture(),
    actor = add(state);
  requestEscort(state, actor.id, { x: 100, y: 20, z: 0, sceneId: null }, context);
  const before = { ...actor };
  context.moveBody = (body) => {
    body.x += 100;
    body.health -= 5;
  };
  assert.throws(() => tick(state, context), /teleported/);
  assert.equal(actor.x, before.x);
  assert.equal(actor.sceneId, before.sceneId);
  assert.equal(actor.health, 95, 'real damage is not rolled back with rejected position');
});

test('a missing occupied vehicle is never reported as a living seated passenger', () => {
  const { state, context, actor } = boarded();
  state.vehicles = [];
  assert.equal(getSeat(state, actor.id), null);
  assert.deepEqual(vehicleOccupants(state, 'arc-arrival-taxi'), []);
  tick(state, context);
  assert.equal(companionObservation(state, actor.id).seated, false);
  assert.equal(companionObservation(state, actor.id).failure.kind, 'vehicle-missing');
});

test('a refused asynchronous damage resolver cannot mutate the actual actor after its rejection', async () => {
  const { state, context } = fixture(),
    actor = add(state);
  context.damageActor = (draft) => Promise.resolve().then(() => (draft.health = 0));
  assert.throws(() => damageCompanion(state, actor.id, 40, 'bad-async', context), /async damage/);
  await Promise.resolve();
  assert.equal(actor.health, 100);
  assert.equal(companionObservation(state, actor.id).alive, true);
});

test('a throwing portal callback rolls back only position and scene, preserving actual injury', () => {
  const { state, context } = fixture(),
    actor = add(state),
    before = { x: 0, y: 20, sceneId: null };
  const portal = {
    id: 'dockside-door',
    radius: 3,
    to: { x: 20, y: 20, z: 0, sceneId: 'dockside-rooms' },
  };
  context.findRoute = () => [
    { x: 0, y: 20, z: 0, sceneId: null, portal },
    { x: 80, y: 40, z: 0, sceneId: 'dockside-rooms' },
  ];
  context.transitionScene = (body) => {
    Object.assign(body, portal.to);
    body.health = 80;
    throw Error('door callback failed');
  };
  requestEscort(state, actor.id, { x: 80, y: 40, z: 0, sceneId: 'dockside-rooms' }, context);
  assert.throws(() => tick(state, context), /door callback failed/);
  assert.equal(actor.x, before.x);
  assert.equal(actor.y, before.y);
  assert.equal(actor.sceneId, before.sceneId);
  assert.equal(actor.health, 80);
  roundTrip(state, context);
});
