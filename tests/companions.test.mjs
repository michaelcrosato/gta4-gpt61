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
  driverSeatPose,
  requestDriver,
  driverObservation,
  playerDriverAdmission,
  preemptDriverReservation,
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

// Driver tests use the same declared actual terrain/surface-movement fixture,
// with vehicle footprint collision enabled. Vehicle movement is an explicit
// parent physical callback; these are not a Harbor City/NPC pursuit playthrough.
function driverFixture(options = {}) {
  const h = fixture(options),
    vehicle = h.state.vehicles[0];
  vehicle.occupied = false;
  const actor = add(h.state, 'LL-ARC-REEVE', { x: 103.48, y: -70 });
  const blocked = h.context.isBlocked,
    moveBody = h.context.moveBody;
  const carBlocks = (x, y, radius, z, sceneId, ignored) =>
    h.state.vehicles.some((car) => {
      if (
        car.id === ignored ||
        car.health <= 0 ||
        (car.sceneId ?? null) !== sceneId ||
        z < (car.z ?? 0) - 4 ||
        z >= (car.z ?? 0) + 16
      )
        return false;
      const spec = specs[car.spec],
        c = Math.cos(car.angle),
        s = Math.sin(car.angle),
        dx = x - car.x,
        dy = y - car.y,
        a = dx * c + dy * s,
        b = -dx * s + dy * c;
      return (
        Math.hypot(
          a - Math.max(-spec.length / 2, Math.min(spec.length / 2, a)),
          b - Math.max(-spec.width / 2, Math.min(spec.width / 2, b)),
        ) <
        radius - 1e-6
      );
    });
  h.context.isBlocked = (x, y, radius, z, sceneId, metadata = {}) =>
    blocked(x, y, radius, z, sceneId) ||
    carBlocks(x, y, radius, z, sceneId, metadata.ignoreVehicleId);
  h.context.moveBody = (body, dx, dy, radius, metadata = {}) => {
    const count = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 3));
    const ignored = ['boarding', 'exiting'].includes(metadata.phase)
      ? metadata.ignoreVehicleId
      : null;
    for (let index = 0; index < count; index++) {
      if (
        carBlocks(
          body.x + dx / count,
          body.y + dy / count,
          radius,
          body.z,
          body.sceneId ?? null,
          ignored,
        )
      )
        return true;
      if (moveBody(body, dx / count, dy / count, radius)) return true;
    }
    return false;
  };
  h.context.findRoute = (body, target) => {
    if ((body.sceneId ?? null) !== target.sceneId) return undefined;
    const sameSide = (body.y - vehicle.y) * (target.y - vehicle.y) >= 0;
    if (vehicle.angle === 0 && !sameSide) {
      const rear = vehicle.x - specs[vehicle.spec].length / 2 - 12;
      return [
        { x: rear, y: body.y, z: 0, sceneId: target.sceneId },
        { x: rear, y: target.y, z: 0, sceneId: target.sceneId },
        target,
      ];
    }
    return [target];
  };
  const parentMoveVehicle = (dx, dy, dt = 0.5) => {
    const before = { x: vehicle.x, y: vehicle.y };
    moveBody(vehicle, dx, dy, specs[vehicle.spec].width * 0.62);
    vehicle.speed = Math.hypot(vehicle.x - before.x, vehicle.y - before.y) / dt;
  };
  return { ...h, actor, vehicle, parentMoveVehicle };
}
function driverBoarded(options = {}) {
  const h = driverFixture(options);
  assert.equal(requestDriver(h.state, h.actor.id, h.vehicle.id, h.context).ok, true);
  until(
    h.state,
    h.context,
    () => driverObservation(h.state, h.vehicle.id, h.context)?.seated === true,
  );
  return h;
}

test('explicit NPC driver request reserves zero but only physical door approach/boarding creates a controllable driver', () => {
  const h = driverFixture(),
    beforeVehicle = clone(h.vehicle),
    start = { x: h.actor.x, y: h.actor.y };
  const result = requestDriver(h.state, h.actor.id, h.vehicle.id, h.context);
  assert.deepEqual(result, { ok: true, seated: false, seat: 0 });
  assert.equal(getSeat(h.state, h.actor.id), null);
  assert.equal(driverObservation(h.state, h.vehicle.id, h.context).controllable, false);
  assert.equal(driverObservation(h.state, h.vehicle.id, h.context).reserved, true);
  const sequence = h.state.companions.sequence;
  assert.equal(requestDriver(h.state, h.actor.id, h.vehicle.id, h.context).ok, true);
  assert.equal(h.state.companions.sequence, sequence);
  until(h.state, h.context, () => h.actor.companionPhase === 'boarding');
  assert.equal(getSeat(h.state, h.actor.id), null);
  assert.equal(driverObservation(h.state, h.vehicle.id, h.context).seated, false);
  assert(Math.hypot(h.actor.x - start.x, h.actor.y - start.y) > 30);
  until(
    h.state,
    h.context,
    () => driverObservation(h.state, h.vehicle.id, h.context)?.controllable === true,
  );
  const observation = driverObservation(h.state, h.vehicle.id, h.context);
  assert.equal(observation.seat, 0);
  assert.equal(observation.alive, true);
  assert.equal(h.actor.radius, 3);
  assert.equal(h.actor.collisionHeight, 8);
  assert.equal(h.actor.eyeHeight, 6);
  close(observation.eye.z, h.actor.z + 6);
  assert.equal(h.vehicle.x, beforeVehicle.x);
  assert.equal(h.vehicle.y, beforeVehicle.y);
  roundTrip(h.state, h.context);
});

test('driver geometry uses the actual opposite front door and canonical seat pose at the annex sedan heading', () => {
  const h = driverFixture();
  Object.assign(h.vehicle, { x: 400, y: 463, angle: Math.PI });
  Object.assign(h.actor, { x: 400, y: 490 });
  requestDriver(h.state, h.actor.id, h.vehicle.id, h.context);
  until(h.state, h.context, () => h.actor.companionPhase === 'boarding');
  const transition = h.state.companions.records.find((r) => r.id === h.actor.id).transition;
  assert(Math.hypot(transition.from.x - 396.52, transition.from.y - 479.5) <= 1.001);
  assert(transition.from.y > h.vehicle.y, 'Driver approaches the south side, not passenger side.');
  until(h.state, h.context, () => Boolean(getSeat(h.state, h.actor.id)));
  const pose = driverSeatPose(h.vehicle, h.context);
  close(pose.x, 396.52);
  close(pose.y, 466.3);
  close(h.actor.x, pose.x);
  close(h.actor.y, pose.y);
  assert.throws(() => companionSeatPose(h.vehicle, 0, h.context), /passenger seat/);
  roundTrip(h.state, h.context);
});

test('one driver and three actual passengers share four distinct seats without lending zero to passenger requests', () => {
  const h = driverFixture();
  requestDriver(h.state, h.actor.id, h.vehicle.id, h.context);
  const ids = ['one', 'two', 'three'];
  for (const id of ids) {
    add(h.state, id);
    const result = requestBoard(h.state, id, h.vehicle.id, h.context);
    assert(result.seat >= 1);
  }
  until(h.state, h.context, () => vehicleOccupants(h.state, h.vehicle.id).length === 4);
  assert.deepEqual(
    vehicleOccupants(h.state, h.vehicle.id).map((seat) => seat.seat),
    [0, 1, 2, 3],
  );
  assert.equal(requestBoard(h.state, h.actor.id, h.vehicle.id, h.context).ok, false);
  add(h.state, 'fifth');
  assert.equal(requestBoard(h.state, 'fifth', h.vehicle.id, h.context).reason, 'full');
  roundTrip(h.state, h.context);
});

test('Mara, anonymous occupied drivers, external owners and another NPC reservation block seat zero acquisition', () => {
  for (const kind of ['player', 'anonymous', 'external', 'other-npc']) {
    const h = driverFixture();
    if (kind === 'player') h.state.player.vehicleId = h.vehicle.id;
    if (kind === 'anonymous') h.vehicle.occupied = true;
    if (kind === 'external')
      h.context.externalSeatOwners = () => [{ actorId: 'external-driver', seat: 0 }];
    if (kind === 'other-npc') {
      const other = add(h.state, 'another-driver', { x: 90, y: -70 });
      assert.equal(requestDriver(h.state, other.id, h.vehicle.id, h.context).ok, true);
    }
    assert.equal(requestDriver(h.state, h.actor.id, h.vehicle.id, h.context).ok, false);
    assert.equal(getSeat(h.state, h.actor.id), null);
  }
  const h = driverFixture();
  const alias = add(h.state, 'LL-CHAR-001');
  assert.equal(
    requestDriver(h.state, alias.id, h.vehicle.id, h.context).reason,
    'player-is-not-npc-driver',
  );
});

test('a late parent driver-seat conflict stops boarding without teleporting or taking Mara control and cannot be saved', () => {
  const h = driverFixture();
  requestDriver(h.state, h.actor.id, h.vehicle.id, h.context);
  h.state.player.vehicleId = h.vehicle.id;
  const before = { x: h.actor.x, y: h.actor.y };
  tick(h.state, h.context);
  assert.deepEqual({ x: h.actor.x, y: h.actor.y }, before);
  assert(driverObservation(h.state, h.vehicle.id, h.context).unmet);
  assert.equal(getSeat(h.state, h.actor.id), null);
  assert.throws(() => validateCompanions(h.state, h.context), /player driver seat collision/);
});

test('driver egress keeps ownership until the actual door path completes and prevents command races', () => {
  const h = driverBoarded();
  requestExit(h.state, h.actor.id, h.context);
  assert.equal(driverObservation(h.state, h.vehicle.id, h.context).controllable, false);
  assert.equal(requestDriver(h.state, h.actor.id, h.vehicle.id, h.context).ok, false);
  tick(h.state, h.context);
  assert.equal(h.actor.companionPhase, 'exiting');
  assert.equal(driverObservation(h.state, h.vehicle.id, h.context).owned, true);
  assert.equal(driverObservation(h.state, h.vehicle.id, h.context).seated, false);
  const other = add(h.state, 'waiting-driver', { x: 90, y: -70 });
  assert.equal(requestDriver(h.state, other.id, h.vehicle.id, h.context).ok, false);
  roundTrip(h.state, h.context);
  until(h.state, h.context, () => h.actor.vehicleId === null);
  assert.equal(driverObservation(h.state, h.vehicle.id, h.context), null);
  assert.equal(h.actor.radius, 7);
  assert.equal(h.actor.collisionHeight, 30);
  assert.equal(requestDriver(h.state, other.id, h.vehicle.id, h.context).ok, true);
  roundTrip(h.state, h.context);
});

test('driver walk, boarding, seated and exiting saves preserve proof and resume without replaying driver acquisition', () => {
  for (const phase of ['approaching', 'boarding', 'seated', 'exiting']) {
    const h = driverFixture();
    requestDriver(h.state, h.actor.id, h.vehicle.id, h.context);
    if (phase !== 'approaching')
      until(
        h.state,
        h.context,
        () => h.actor.companionPhase === (phase === 'exiting' ? 'seated' : phase),
      );
    if (phase === 'boarding') tick(h.state, h.context, 0.2);
    if (phase === 'exiting') {
      requestExit(h.state, h.actor.id, h.context);
      tick(h.state, h.context, 0.2);
    }
    roundTrip(h.state, h.context);
    const copy = clone(h.state);
    copy.companions = restoreCompanions(JSON.stringify(copy.companions), copy, h.context);
    until(copy, h.context, () =>
      phase === 'exiting'
        ? getActor(copy, h.actor.id).vehicleId === null
        : driverObservation(copy, h.vehicle.id, h.context)?.controllable === true,
    );
    assert.equal(copy.companions.events.filter((e) => e.kind === 'driver-requested').length, 1);
    assert.equal(copy.companions.events.filter((e) => e.kind === 'boarded').length, 1);
    roundTrip(copy, h.context);
  }
});

test('dead named drivers never revive or disappear, and dead occupied seat zero cannot drive or be stolen by another request', () => {
  const before = driverFixture();
  requestDriver(before.state, before.actor.id, before.vehicle.id, before.context);
  damageCompanion(before.state, before.actor.id, 200, 'bullet', before.context);
  assert.equal(driverObservation(before.state, before.vehicle.id, before.context), null);
  assert.equal(
    requestDriver(before.state, before.actor.id, before.vehicle.id, before.context).reason,
    'dead',
  );
  roundTrip(before.state, before.context);
  const h = driverBoarded();
  damageCompanion(h.state, h.actor.id, 200, 'bullet', h.context);
  tick(h.state, h.context);
  const observation = driverObservation(h.state, h.vehicle.id, h.context);
  assert.equal(observation.seated, true);
  assert.equal(observation.alive, false);
  assert.equal(observation.controllable, false);
  const other = add(h.state, 'replacement-driver', { x: 90, y: -70 });
  assert.equal(requestDriver(h.state, other.id, h.vehicle.id, h.context).ok, false);
  assert.equal(
    ensureNamedActor(h.state, { id: h.actor.id, x: 0, y: 0, health: 100 }, h.context),
    h.actor,
  );
  assert.equal(h.actor.health, 0);
  roundTrip(h.state, h.context);
});

test('parent physical vehicle movement updates the canonical seated driver and real wall collision blocks the car', () => {
  const h = driverBoarded({ walls: [{ x: 135, y: -100, w: 20, h: 200, height: 50 }] });
  const before = h.vehicle.x;
  h.parentMoveVehicle(100, 0);
  assert(h.vehicle.x > before && h.vehicle.x < 135);
  assert(
    driverObservation(h.state, h.vehicle.id, h.context).unmet,
    'Read observation never snaps a stale body to claim coupled motion.',
  );
  tick(h.state, h.context);
  assert.equal(driverObservation(h.state, h.vehicle.id, h.context).seated, true);
  close(h.actor.x, driverSeatPose(h.vehicle, h.context).x);
  assert.equal(h.actor.health, 100);
  roundTrip(h.state, h.context);
});

test('destroyed/missing driver vehicles produce real loss or egress instead of a ghost occupied driver', () => {
  const h = driverBoarded();
  h.vehicle.health = 0;
  tick(h.state, h.context);
  assert.equal(driverObservation(h.state, h.vehicle.id, h.context).controllable, false);
  until(h.state, h.context, () => h.actor.vehicleId === null);
  assert(h.actor.health > 0 && h.actor.health < 100);
  assert.equal(requestDriver(h.state, h.actor.id, h.vehicle.id, h.context).ok, false);
  roundTrip(h.state, h.context);
  const missing = driverBoarded();
  missing.state.vehicles = [];
  assert.equal(driverObservation(missing.state, missing.vehicle.id, missing.context), null);
  assert.throws(
    () => validateCompanions(missing.state, missing.context),
    /missing occupied vehicle/,
  );
});

test('driver save validation rejects passenger relabeling, forged proof and mismatched physical seat/body/ownership', () => {
  const h = driverBoarded();
  for (const mutate of [
    (s) => {
      delete s.companions.records[0].driver;
    },
    (s) => {
      s.companions.records[0].driver.vehicleId = 'another-car';
    },
    (s) => {
      s.companions.records[0].driver.requestEvent = s.companions.sequence + 1;
    },
    (s) => {
      s.companions.records[0].driver.requestedAt = s.companions.time + 1;
    },
    (s) => {
      s.companions.records[0].order.kind = 'board';
    },
    (s) => {
      s.companions.actors[0].seat = 1;
    },
    (s) => {
      s.companions.actors[0].radius = 7;
    },
    (s) => {
      s.companions.actors[0].x += 10;
    },
    (s) => {
      s.player.vehicleId = s.vehicles[0].id;
    },
  ]) {
    const bad = clone(h.state);
    mutate(bad);
    assert.throws(() => restoreCompanions(bad.companions, bad, h.context), /Invalid companion/);
  }
});

test('driver event observers see complete valid saved ownership at request, boarding and exit commits', () => {
  const h = driverFixture();
  const validated = [];
  h.context.onEvent = (event) => {
    validateCompanions(h.state, h.context);
    validated.push(event.kind);
  };
  requestDriver(h.state, h.actor.id, h.vehicle.id, h.context);
  until(
    h.state,
    h.context,
    () => driverObservation(h.state, h.vehicle.id, h.context)?.seated === true,
  );
  requestExit(h.state, h.actor.id, h.context);
  until(h.state, h.context, () => h.actor.vehicleId === null);
  assert(validated.includes('driver-requested'));
  assert(validated.includes('boarded'));
  assert(validated.includes('exited'));
});

test('driver-side approach walls and both blocked exit doors keep the canonical actor outside or seated', () => {
  const blocked = driverFixture({ walls: [{ x: 85, y: -32, w: 40, h: 12, height: 50 }] });
  requestDriver(blocked.state, blocked.actor.id, blocked.vehicle.id, blocked.context);
  for (let i = 0; i < 40; i++) tick(blocked.state, blocked.context);
  assert.equal(getSeat(blocked.state, blocked.actor.id), null);
  assert.equal(driverObservation(blocked.state, blocked.vehicle.id, blocked.context).seated, false);
  assert(blocked.actor.y <= -39 + 1e-5);
  roundTrip(blocked.state, blocked.context);
  const h = driverBoarded(),
    original = h.context.isBlocked;
  let doorsBlocked = true;
  h.context.isBlocked = (x, y, radius, z, sceneId, metadata) =>
    (doorsBlocked && Math.abs(x - 103.48) < 10 && Math.abs(Math.abs(y) - 16.5) < 8) ||
    original(x, y, radius, z, sceneId, metadata);
  requestExit(h.state, h.actor.id, h.context);
  for (let i = 0; i < 20; i++) tick(h.state, h.context);
  assert.equal(driverObservation(h.state, h.vehicle.id, h.context).seated, true);
  assert.equal(driverObservation(h.state, h.vehicle.id, h.context).controllable, false);
  assert.equal(h.actor.companionPhase, 'waiting-exit');
  roundTrip(h.state, h.context);
  doorsBlocked = false;
  until(h.state, h.context, () => h.actor.vehicleId === null);
  assert.equal(driverObservation(h.state, h.vehicle.id, h.context), null);
});

test('a parent vehicle scene jump cannot silently teleport the seated driver or authorize a save', () => {
  const h = driverBoarded(),
    before = { x: h.actor.x, y: h.actor.y, z: h.actor.z, sceneId: h.actor.sceneId };
  Object.assign(h.vehicle, { sceneId: 'dockside-rooms', x: 100, y: 90 });
  tick(h.state, h.context);
  assert.deepEqual({ x: h.actor.x, y: h.actor.y, z: h.actor.z, sceneId: h.actor.sceneId }, before);
  assert.equal(
    driverObservation(h.state, h.vehicle.id, h.context).unmet,
    'driver-scene-transition-denied',
  );
  assert.throws(() => validateCompanions(h.state, h.context), /occupied scene/);
});

test('an explicitly proved parent vehicle portal carries the real seated driver without granting an arbitrary scene transform', () => {
  const h = driverBoarded();
  h.parentMoveVehicle(20, 0);
  tick(h.state, h.context);
  close(h.vehicle.x, 120);
  const portal = {
    from: { x: h.vehicle.x, y: h.vehicle.y, sceneId: null },
    to: { x: 100, y: 90, sceneId: 'dockside-rooms' },
  };
  h.context.canRideSceneTransition = (actor, vehicle, oldPose) =>
    actor.vehicleId === vehicle.id &&
    oldPose.sceneId === portal.from.sceneId &&
    Math.abs(oldPose.x - portal.from.x) < 1e-5 &&
    Math.abs(oldPose.y - portal.from.y) < 1e-5 &&
    vehicle.sceneId === portal.to.sceneId &&
    vehicle.x === portal.to.x &&
    vehicle.y === portal.to.y;
  Object.assign(h.vehicle, { ...portal.to, speed: 0 });
  tick(h.state, h.context);
  assert.equal(driverObservation(h.state, h.vehicle.id, h.context).seated, true);
  assert.equal(h.actor.sceneId, 'dockside-rooms');
  close(h.actor.x, driverSeatPose(h.vehicle, h.context).x);
  close(h.actor.y, driverSeatPose(h.vehicle, h.context).y);
  roundTrip(h.state, h.context);
});

test('a teleporting parent foot callback cannot manufacture an occupied NPC driver', () => {
  const h = driverFixture();
  requestDriver(h.state, h.actor.id, h.vehicle.id, h.context);
  const before = { x: h.actor.x, y: h.actor.y, z: h.actor.z };
  h.context.moveBody = (actor) => {
    actor.x += 1000;
  };
  assert.throws(() => tick(h.state, h.context), /teleported actor/);
  assert.deepEqual({ x: h.actor.x, y: h.actor.y, z: h.actor.z }, before);
  assert.equal(driverObservation(h.state, h.vehicle.id, h.context).seated, false);
  roundTrip(h.state, h.context);
});

test('seat role changes require physical exit and old version1 passenger saves remain valid without driver fields', () => {
  const passenger = boarded(),
    old = clone(passenger.state);
  for (const record of old.companions.records) delete record.driver;
  assert.equal(validateCompanions(old, passenger.context), true);
  assert.equal(restoreCompanions(old.companions, old, passenger.context).version, 1);
  const h = driverBoarded();
  assert.equal(requestBoard(h.state, h.actor.id, h.vehicle.id, h.context).ok, false);
  requestExit(h.state, h.actor.id, h.context);
  until(h.state, h.context, () => h.actor.vehicleId === null);
  assert.equal(requestBoard(h.state, h.actor.id, h.vehicle.id, h.context).seat, 1);
  until(h.state, h.context, () => Boolean(getSeat(h.state, h.actor.id)));
  assert.equal(getSeat(h.state, h.actor.id).seat, 1);
  assert.equal(driverObservation(h.state, h.vehicle.id, h.context), null);
  assert.equal(
    requestDriver(h.state, h.actor.id, h.vehicle.id, h.context).reason,
    'already-seated',
  );
  roundTrip(h.state, h.context);
});

test('a moving vehicle during driver boarding freezes actual progress and saves the real unseated body', () => {
  const h = driverFixture();
  requestDriver(h.state, h.actor.id, h.vehicle.id, h.context);
  until(h.state, h.context, () => h.actor.companionPhase === 'boarding');
  tick(h.state, h.context, 0.2);
  const before = { x: h.actor.x, y: h.actor.y, z: h.actor.z };
  h.parentMoveVehicle(10, 0, 0.33);
  tick(h.state, h.context);
  assert.deepEqual({ x: h.actor.x, y: h.actor.y, z: h.actor.z }, before);
  assert.equal(driverObservation(h.state, h.vehicle.id, h.context).seated, false);
  assert.equal(driverObservation(h.state, h.vehicle.id, h.context).controllable, false);
  roundTrip(h.state, h.context);
});

test('player admission may explicitly preempt only a real unseated driver approach without moving or reviving the actor', () => {
  const h = driverFixture();
  requestDriver(h.state, h.actor.id, h.vehicle.id, h.context);
  for (let i = 0; i < 5; i++) tick(h.state, h.context);
  const body = { x: h.actor.x, y: h.actor.y, z: h.actor.z, health: h.actor.health },
    car = { x: h.vehicle.x, y: h.vehicle.y };
  assert.equal(playerDriverAdmission(h.state, h.vehicle.id).canPreempt, true);
  assert.equal(playerDriverAdmission(h.state, h.vehicle.id).allowed, false);
  const result = preemptDriverReservation(h.state, h.vehicle.id, h.context);
  assert.equal(result.preempted, true);
  assert.deepEqual({ x: h.actor.x, y: h.actor.y, z: h.actor.z, health: h.actor.health }, body);
  assert.deepEqual({ x: h.vehicle.x, y: h.vehicle.y }, car);
  assert.equal(driverObservation(h.state, h.vehicle.id, h.context), null);
  assert.equal(playerDriverAdmission(h.state, h.vehicle.id).allowed, true);
  const sequence = h.state.companions.sequence;
  assert.equal(preemptDriverReservation(h.state, h.vehicle.id, h.context).preempted, false);
  assert.equal(h.state.companions.sequence, sequence);
  h.state.player.vehicleId = h.vehicle.id;
  h.vehicle.occupied = true;
  for (let i = 0; i < 20; i++) tick(h.state, h.context);
  assert.equal(h.actor.vehicleId, null);
  assert.deepEqual({ x: h.actor.x, y: h.actor.y, z: h.actor.z, health: h.actor.health }, body);
  assert.equal(requestDriver(h.state, h.actor.id, h.vehicle.id, h.context).ok, false);
  roundTrip(h.state, h.context);
});

test('boarding, occupied and exiting leases block player admission until a real physical exit', () => {
  for (const phase of ['boarding', 'seated', 'exiting']) {
    const h = driverFixture();
    requestDriver(h.state, h.actor.id, h.vehicle.id, h.context);
    until(
      h.state,
      h.context,
      () => h.actor.companionPhase === (phase === 'exiting' ? 'seated' : phase),
    );
    if (phase === 'exiting') {
      requestExit(h.state, h.actor.id, h.context);
      tick(h.state, h.context);
    }
    const before = clone(h.state.companions);
    assert.equal(playerDriverAdmission(h.state, h.vehicle.id).canPreempt, false);
    assert.equal(playerDriverAdmission(h.state, h.vehicle.id).requiresPhysicalExit, true);
    assert.equal(preemptDriverReservation(h.state, h.vehicle.id, h.context).ok, false);
    assert.deepEqual(h.state.companions, before);
    if (phase !== 'exiting') requestExit(h.state, h.actor.id, h.context);
    until(h.state, h.context, () => playerDriverAdmission(h.state, h.vehicle.id).allowed);
    assert.equal(driverObservation(h.state, h.vehicle.id, h.context), null);
    h.state.player.vehicleId = h.vehicle.id;
    roundTrip(h.state, h.context);
  }
});

test('named-lease admission leaves ordinary anonymous traffic/player policy to root and never frees a dead occupied driver', () => {
  const normal = driverFixture();
  normal.vehicle.occupied = true;
  assert.equal(
    playerDriverAdmission(normal.state, normal.vehicle.id).allowed,
    true,
    'No named lease changes legacy traffic policy.',
  );
  const h = driverBoarded();
  damageCompanion(h.state, h.actor.id, 200, 'bullet', h.context);
  assert.equal(playerDriverAdmission(h.state, h.vehicle.id).allowed, false);
  assert.equal(playerDriverAdmission(h.state, h.vehicle.id).lease.alive, false);
  assert.equal(preemptDriverReservation(h.state, h.vehicle.id, h.context).ok, false);
  assert.equal(h.actor.health, 0);
  roundTrip(h.state, h.context);
});

test('driver rejoin preserves actual occupied control and cannot corrupt a physical transition', () => {
  const h = driverBoarded();
  h.state.player.x = 40;
  const body = { x: h.actor.x, y: h.actor.y, z: h.actor.z };
  assert.equal(rejoinCompanion(h.state, h.actor.id, h.context).ok, true);
  assert.equal(driverObservation(h.state, h.vehicle.id, h.context).controllable, true);
  assert.deepEqual({ x: h.actor.x, y: h.actor.y, z: h.actor.z }, body);
  roundTrip(h.state, h.context);
  requestExit(h.state, h.actor.id, h.context);
  tick(h.state, h.context);
  const before = clone(h.state.companions);
  assert.equal(rejoinCompanion(h.state, h.actor.id, h.context).ok, false);
  assert.deepEqual(h.state.companions, before);
  roundTrip(h.state, h.context);
});

test('a parent echo of the same canonical driver owner is not a second body or an available seat', () => {
  const h = driverFixture();
  h.context.externalSeatOwners = () => [{ actorId: h.actor.id, seat: 0 }];
  assert.equal(requestDriver(h.state, h.actor.id, h.vehicle.id, h.context).ok, true);
  roundTrip(h.state, h.context);
  until(
    h.state,
    h.context,
    () => driverObservation(h.state, h.vehicle.id, h.context)?.seated === true,
  );
  assert.equal(playerDriverAdmission(h.state, h.vehicle.id).allowed, false);
  assert.equal(vehicleOccupants(h.state, h.vehicle.id).length, 1);
  roundTrip(h.state, h.context);
});

test('a driver reservation cannot become a saved occupied seat by inventing body coordinates without physical boarding proof', () => {
  const h = driverFixture();
  requestDriver(h.state, h.actor.id, h.vehicle.id, h.context);
  const bad = clone(h.state),
    actor = bad.companions.actors[0],
    record = bad.companions.records[0];
  Object.assign(actor, driverSeatPose(bad.vehicles[0], h.context), {
    vehicleId: h.vehicle.id,
    seat: 0,
    radius: 3,
    collisionHeight: 8,
    eyeHeight: 6,
    inVehicle: true,
    companionPhase: 'seated',
  });
  Object.assign(record, {
    phase: 'seated',
    reservedVehicleId: null,
    reservedSeat: null,
    lastVehicleHealth: h.vehicle.health,
    lastVehiclePose: {
      x: h.vehicle.x,
      y: h.vehicle.y,
      z: 0,
      sceneId: null,
      angle: h.vehicle.angle,
    },
  });
  bad.vehicles[0].companionSeats = [{ actorId: actor.id, seat: 0, status: 'occupied' }];
  bad.vehicles[0].companionOccupied = true;
  assert.equal(driverObservation(bad, h.vehicle.id, h.context).seated, false);
  assert.throws(
    () => restoreCompanions(bad.companions, bad, h.context),
    /unboarded driver occupancy/,
  );
});

test('saved driver proof cannot claim Mara or reuse a lease that has already physically exited', () => {
  const h = driverBoarded(),
    occupiedActor = clone(h.actor),
    occupiedRecord = clone(h.state.companions.records[0]);
  const alias = clone(h.state),
    id = 'LL-CHAR-001';
  alias.companions.actors[0].id = id;
  alias.companions.actors[0].companionId = id;
  alias.companions.records[0].id = id;
  for (const event of alias.companions.events) event.actorId = id;
  alias.vehicles[0].companionSeats[0].actorId = id;
  assert.throws(
    () => restoreCompanions(alias.companions, alias, h.context),
    /player actor in NPC driver ownership/,
  );
  requestExit(h.state, h.actor.id, h.context);
  until(h.state, h.context, () => h.actor.vehicleId === null);
  const reused = clone(h.state);
  reused.companions.actors[0] = occupiedActor;
  reused.companions.records[0] = occupiedRecord;
  reused.vehicles[0].companionSeats = [{ actorId: occupiedActor.id, seat: 0, status: 'occupied' }];
  reused.vehicles[0].companionOccupied = true;
  assert.throws(
    () => restoreCompanions(reused.companions, reused, h.context),
    /released driver lease/,
  );
});

test('driver proof remains valid after bounded event history rolls past its genuine request and boarding', () => {
  const h = driverBoarded();
  const proof = clone(h.state.companions.records[0].driver);
  for (let i = 0; i < 140; i++)
    damageCompanion(h.state, h.actor.id, 0, 'capacity-fixture', h.context);
  assert(h.state.companions.events[0].id > proof.boardEvent);
  assert.equal(driverObservation(h.state, h.vehicle.id, h.context).controllable, true);
  assert.equal(h.actor.health, 100);
  roundTrip(h.state, h.context);
});

test('driver preemption events expose valid cancelled ownership and preserve real passenger seats', () => {
  const h = driverFixture(),
    passenger = add(h.state, 'passenger');
  requestBoard(h.state, passenger.id, h.vehicle.id, h.context);
  until(h.state, h.context, () => Boolean(getSeat(h.state, passenger.id)));
  requestDriver(h.state, h.actor.id, h.vehicle.id, h.context);
  const valid = [];
  h.context.onEvent = (event) => {
    if (event.kind === 'driver-preempted') {
      validateCompanions(h.state, h.context);
      valid.push(event.id);
    }
  };
  assert.equal(preemptDriverReservation(h.state, h.vehicle.id, h.context).ok, true);
  assert.equal(valid.length, 1);
  assert.equal(getSeat(h.state, passenger.id).seat, 1);
  assert.deepEqual(
    vehicleOccupants(h.state, h.vehicle.id).map((p) => p.seat),
    [1],
  );
  assert.equal(playerDriverAdmission(h.state, h.vehicle.id).allowed, true);
  roundTrip(h.state, h.context);
});

test('a follow order cancels an unseated driver approach and saves without a released driver intent', () => {
  const h = driverFixture();
  requestDriver(h.state, h.actor.id, h.vehicle.id, h.context);
  const pose = clone(h.actor);
  assert.equal(followCompanion(h.state, h.actor.id, 'player', h.context).ok, true);
  assert.equal(playerDriverAdmission(h.state, h.vehicle.id).allowed, true);
  assert.equal(h.state.companions.records.find((r) => r.id === h.actor.id).driver, null);
  assert.deepEqual(
    { x: h.actor.x, y: h.actor.y, health: h.actor.health },
    {
      x: pose.x,
      y: pose.y,
      health: pose.health,
    },
  );
  roundTrip(h.state, h.context);
});

test('cancelling driver boarding keeps the lease through real egress and publishes a valid final exit', () => {
  const h = driverFixture();
  requestDriver(h.state, h.actor.id, h.vehicle.id, h.context);
  const record = h.state.companions.records.find((r) => r.id === h.actor.id);
  until(h.state, h.context, () => record.phase === 'boarding' && record.transition.elapsed > 0);
  assert.equal(requestExit(h.state, h.actor.id, h.context).ok, true);
  assert.equal(playerDriverAdmission(h.state, h.vehicle.id).allowed, false);
  roundTrip(h.state, h.context);
  const events = [];
  h.context.onEvent = (event) => {
    if (event.kind === 'exited') {
      validateCompanions(h.state, h.context);
      events.push(event);
    }
  };
  until(h.state, h.context, () => playerDriverAdmission(h.state, h.vehicle.id).allowed);
  assert.equal(events.length, 1);
  assert.equal(events[0].data.seat, 0);
  assert.equal(h.actor.vehicleId, null);
  assert.equal(h.actor.health, 100);
  assert.equal(h.actor.radius, 7);
  roundTrip(h.state, h.context);
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
