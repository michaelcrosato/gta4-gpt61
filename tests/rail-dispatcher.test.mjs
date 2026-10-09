import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRailDispatcher,
  validateRailDispatch,
  restoreRailDispatch,
  railDispatchTopology,
} from '../src/rail-dispatcher.js';
import { createTransit, updateTransit, restoreTransit } from '../src/transit.js';
import { CITY_BLUEPRINT } from '../src/city-blueprint.js';
import { createRailWorld } from '../src/rail-geometry.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
test('recognized legacy rail signatures migrate metadata while retaining every physical reservation', () => {
  const { world } = createRailWorld(CITY_BLUEPRINT),
    model = createTransit(world),
    snapshot = createRailDispatcher(world, model.trains).snapshot();
  assert.equal(snapshot.topologyEncoding, 2);
  const legacy = clone(snapshot);
  delete legacy.topologyEncoding;
  legacy.topology = railDispatchTopology(world).legacyTopology;
  assert.equal(validateRailDispatch(legacy, world, model.trains), true);
  const restored = restoreRailDispatch(legacy, world, model.trains);
  assert.equal(restored.topologyEncoding, 2);
  assert.equal(restored.topology, snapshot.topology);
  assert.deepEqual(restored.reservations, snapshot.reservations);
  assert.deepEqual(restored.closedGates, snapshot.closedGates);
  assert.equal(legacy.topologyEncoding, undefined, 'migration must not mutate the caller save');
});
test('semantic topology fingerprints ignore only sub-nanounit derived noise and still reject actual resource changes', () => {
  const { world } = createRailWorld(CITY_BLUEPRINT),
    model = createTransit(world),
    snapshot = createRailDispatcher(world, model.trains).snapshot();
  const noise = clone(world);
  noise.transit.railResources[0].bounds.x += 1e-11;
  assert.equal(railDispatchTopology(noise).topology, snapshot.topology);
  const changed = clone(world);
  changed.transit.railResources[0].bounds.x += 1;
  assert.notEqual(railDispatchTopology(changed).topology, snapshot.topology);
  assert.throws(() => validateRailDispatch(snapshot, changed, model.trains), /version\/topology/);
});
const config = {
  cars: 1,
  carLength: 24,
  couplerGap: 0,
  trainWidth: 8,
  trainHeight: 8,
  doorSeconds: 0.1,
  dwellSeconds: 0.2,
  cruiseSpeed: 60,
  acceleration: 20,
  braking: 20,
};
function junctionWorld() {
  const routes = [
    [
      [0, 0],
      [400, 0],
      [400, 400],
      [0, 400],
    ],
    [
      [200, -200],
      [200, 200],
      [600, 200],
      [600, -200],
    ],
  ];
  const stations = [],
    tracks = [],
    throughServices = [],
    legResourceBundles = {},
    stationResourceBundles = {};
  routes.forEach((route, s) => {
    const calls = route.map(([x, y], i) => {
      const [nx, ny] = route[(i + 1) % route.length],
        id = `p${s}-${i}`,
        heading = Math.atan2(ny - y, nx - x);
      stations.push({
        id: `s${s}-${i}`,
        name: `Stop ${s}/${i}`,
        platforms: [
          {
            id,
            x,
            y,
            z: 0,
            heading,
            length: 100,
            width: 24,
            stopPoint: { x, y, z: 0 },
            boardingPoint: { x: x - Math.sin(heading) * 20, y: y + Math.cos(heading) * 20, z: 0 },
          },
        ],
      });
      stationResourceBundles[id] = [];
      return { stationId: `s${s}-${i}`, platformId: id };
    });
    const legs = route.map(([x, y], i) => {
      const [nx, ny] = route[(i + 1) % route.length],
        id = `t${s}-${i}`;
      tracks.push({
        id,
        fromPlatformId: calls[i].platformId,
        toPlatformId: calls[(i + 1) % route.length].platformId,
        points: [
          { x, y, z: 0 },
          { x: nx, y: ny, z: 0 },
        ],
      });
      legResourceBundles[id] = [];
      return {
        trackId: id,
        fromPlatformId: calls[i].platformId,
        toPlatformId: calls[(i + 1) % route.length].platformId,
        reverse: false,
      };
    });
    throughServices.push({
      id: `service${s}`,
      name: `Service ${s}`,
      closedLoop: true,
      calls,
      legs,
      trackIds: legs.map((l) => l.trackId),
      segmentIds: [],
    });
  });
  const railResources = [
    [200, 0, ['t0-0', 't1-0']],
    [400, 200, ['t0-1', 't1-1']],
  ].map(([x, y, trackIds], i) => {
    const physicalBounds = { x: x - 6, y: y - 6, w: 12, h: 12, zMin: 0, zMax: 8 },
      bounds = { x: x - 18, y: y - 18, w: 36, h: 36, zMin: -8, zMax: 8 },
      id = `junction${i}`;
    trackIds.forEach((track) =>
      legResourceBundles[track].push({ resourceId: id, entryDistance: 182, releaseDistance: 230 }),
    );
    return {
      id,
      type: 'junction',
      trackIds,
      bounds,
      physicalBounds,
      entryBounds: bounds,
      releaseBounds: bounds,
      flowClasses: [],
      entryBuffer: 12,
      releaseBuffer: 12,
    };
  });
  const railCrossings = [
    {
      id: 'gate0',
      roadId: 'public-street',
      trackIds: ['t0-0', 't1-0'],
      points: [{ x: 200, y: 0, z: 0, roadZ: 0 }],
      bounds: { x: 166, y: -34, w: 68, h: 68, zMin: 0, zMax: 8 },
      entryBuffer: 34,
      releaseBuffer: 34,
    },
  ];
  return {
    transit: {
      stations,
      tracks,
      throughServices,
      segments: [],
      railResources,
      legResourceBundles,
      stationResourceBundles,
      railCrossings,
      railGeometry: { settings: { trainLength: 24, trainWidth: 8, trainHeight: 8 } },
    },
  };
}
function step(model, world, dispatcher, dt = 0.1) {
  dispatcher.beginStep(model.trains, model.time);
  updateTransit(model, world, dt, dispatcher);
  dispatcher.endStep(model.trains, model.time);
}
function until(model, world, dispatcher, predicate, limit = 2000, dt = 0.1) {
  for (let i = 0; i < limit && !predicate(); i++) step(model, world, dispatcher, dt);
  assert.ok(predicate(), `condition failed at ${model.time}`);
}
function has(dispatcher, id, trainId) {
  return dispatcher
    .snapshot()
    .reservations.some((r) => r.resourceId === id && (!trainId || r.trainId === trainId));
}

test('departure acquires the entire leg atomically and conflicting requests keep only their old station', () => {
  const world = junctionWorld(),
    model = createTransit(world, config),
    dispatcher = createRailDispatcher(world, model.trains);
  until(model, world, dispatcher, () => model.trains[0].phase === 'moving');
  const [first, second] = model.trains;
  assert.equal(first.phase, 'moving');
  assert.equal(second.phase, 'held');
  assert.equal(has(dispatcher, 'junction0', first.id), true);
  assert.equal(has(dispatcher, 'platform:p0-1', first.id), true);
  assert.equal(has(dispatcher, 'platform:p1-0', second.id), true);
  assert.equal(has(dispatcher, 'platform:p1-1', second.id), false);
  assert.equal(dispatcher.snapshot().waiting[0].trainId, second.id);
  assert.equal(dispatcher.snapshot().stats.grants, 1);
});

test('the full rear must clear a physical junction before the queued train can leave', () => {
  const world = junctionWorld(),
    model = createTransit(world, config),
    dispatcher = createRailDispatcher(world, model.trains);
  until(model, world, dispatcher, () => model.trains[0].distance > 210);
  assert.equal(model.trains[1].phase, 'held');
  assert.equal(has(dispatcher, 'junction0', model.trains[0].id), true);
  until(model, world, dispatcher, () => model.trains[1].phase === 'moving');
  assert.ok(model.trains[0].distance > 230);
  assert.equal(has(dispatcher, 'junction0', model.trains[1].id), true);
  assert.equal(dispatcher.snapshot().waiting.length, 0);
});

test('source and destination platform occupancy survives dwell and releases only after the full carriage clears', () => {
  const world = junctionWorld(),
    model = createTransit(world, config),
    dispatcher = createRailDispatcher(world, model.trains),
    first = model.trains[0];
  until(model, world, dispatcher, () => first.distance > 10);
  assert.equal(has(dispatcher, 'platform:p0-0', first.id), true);
  until(model, world, dispatcher, () => first.distance > 30);
  assert.equal(has(dispatcher, 'platform:p0-0', first.id), false);
  until(model, world, dispatcher, () => first.visits === 1 && first.phase === 'dwelling');
  assert.equal(has(dispatcher, 'platform:p0-1', first.id), true);
  until(model, world, dispatcher, () => first.visits === 1 && first.distance > 10);
  assert.equal(has(dispatcher, 'platform:p0-1', first.id), true);
  until(model, world, dispatcher, () => first.visits === 1 && first.distance > 30);
  assert.equal(has(dispatcher, 'platform:p0-1', first.id), false);
});

test('road gates close near the approaching train and reopen after its rear clears rather than closing a complete leg', () => {
  const world = junctionWorld(),
    model = createTransit(world, config),
    dispatcher = createRailDispatcher(world, model.trains),
    first = model.trains[0];
  until(model, world, dispatcher, () => first.distance > 60);
  assert.deepEqual(dispatcher.closedGates, []);
  until(model, world, dispatcher, () => first.distance > 175);
  assert.deepEqual(dispatcher.closedGates, ['gate0']);
  until(model, world, dispatcher, () => first.distance > 240 && model.trains[1].distance < 120);
  assert.deepEqual(dispatcher.closedGates, []);
});

test('both perpendicular services complete circuits with fair waiting and no physical overlap', () => {
  const world = junctionWorld(),
    model = createTransit(world, config),
    dispatcher = createRailDispatcher(world, model.trains);
  until(model, world, dispatcher, () => model.trains.every((t) => t.circuits >= 2), 5000, 0.5);
  assert.ok(dispatcher.snapshot().stats.denials > 0);
  assert.ok(dispatcher.snapshot().stats.maxWait < 20);
  assert.equal(validateRailDispatch(dispatcher.snapshot(), world, model.trains), true);
});

test('three trains sharing one direction follow occupied platforms without resetting or starving the follower', () => {
  const world = junctionWorld();
  world.transit.throughServices = world.transit.throughServices.slice(0, 1);
  const model = createTransit(world, { ...config, trainsPerService: 3 }),
    dispatcher = createRailDispatcher(world, model.trains);
  until(
    model,
    world,
    dispatcher,
    () => model.trains.every((train) => train.visits >= 8),
    5000,
    0.25,
  );
  assert.equal(model.trains.length, 3);
  assert.ok(dispatcher.snapshot().stats.denials > 0);
  assert.ok(dispatcher.snapshot().stats.maxWait < 60);
  assert.equal(validateRailDispatch(dispatcher.snapshot(), world, model.trains), true);
});

test('reordering fleet input cannot change simultaneous junction priority or resulting saves', () => {
  const world = junctionWorld(),
    a = createTransit(world, config),
    b = clone(a);
  b.trains.reverse();
  const first = createRailDispatcher(world, a.trains),
    second = createRailDispatcher(world, b.trains);
  for (let i = 0; i < 200; i++) {
    step(a, world, first, 0.1);
    step(b, world, second, 0.1);
  }
  assert.deepEqual(a, b);
  assert.deepEqual(first.snapshot(), second.snapshot());
});

test('mid-leg saves restore detached reservations and continue the same fleet without regranting or resetting waits', () => {
  const world = junctionWorld(),
    model = createTransit(world, config),
    dispatcher = createRailDispatcher(world, model.trains);
  until(model, world, dispatcher, () => model.trains[0].distance > 180);
  const saved = dispatcher.snapshot(),
    restoredModel = restoreTransit(JSON.stringify(model), world),
    restored = restoreRailDispatch(JSON.stringify(saved), world, restoredModel.trains),
    other = createRailDispatcher(world, restoredModel.trains, restored);
  restored.reservations.length = 0;
  for (let i = 0; i < 150; i++) {
    step(model, world, dispatcher, 0.1);
    step(restoredModel, world, other, 0.1);
  }
  assert.deepEqual(restoredModel, model);
  assert.deepEqual(other.snapshot(), dispatcher.snapshot());
});

test('validator rejects missing destination/rear holds, changed owners, stale records and unsafe JSON', () => {
  const world = junctionWorld(),
    model = createTransit(world, config),
    dispatcher = createRailDispatcher(world, model.trains);
  until(model, world, dispatcher, () => model.trains[0].distance > 10);
  const saved = dispatcher.snapshot();
  const mutations = [
    (s) => {
      s.version = 2;
    },
    (s) => {
      s.topology = 'old';
    },
    (s) => {
      s.dimensions.length = 25;
    },
    (s) => {
      s.reservations = s.reservations.filter((r) => r.resourceId !== 'platform:p0-1');
    },
    (s) => {
      s.reservations = s.reservations.filter((r) => r.resourceId !== 'platform:p0-0');
    },
    (s) => {
      s.reservations.find((r) => r.resourceId === 'junction0').trainId = 'unknown';
    },
    (s) => {
      s.reservations.push(clone(s.reservations[0]));
    },
    (s) => {
      s.reservations.find((r) => r.resourceId === 'junction0').releaseDistance = 1;
    },
    (s) => {
      s.closedGates = ['gate0'];
    },
    (s) => {
      s.waiting[0].sequence = 0;
    },
    (s) => {
      s.stats.maxWait = Infinity;
    },
  ];
  mutations.forEach((mutate) => {
    const broken = clone(saved);
    mutate(broken);
    assert.throws(() => restoreRailDispatch(broken, world, model.trains), /Invalid rail dispatch/);
  });
  const unsafe = clone(saved);
  Object.defineProperty(unsafe, 'poison', {
    enumerable: true,
    get() {
      throw Error('getter ran');
    },
  });
  assert.throws(() => restoreRailDispatch(unsafe, world, model.trains), /JSON accessor/);
  const cleared = clone(saved);
  until(model, world, dispatcher, () => model.trains[0].distance > 250);
  cleared.time = model.time;
  assert.throws(
    () => validateRailDispatch(cleared, world, model.trains),
    /stale|progression|occupancy/,
  );
  assert.throws(() => restoreRailDispatch('{', world, model.trains), /save JSON/);
});

test('unreserved motion, altered dimensions and off-corridor sweep attempts cannot be approved', () => {
  const world = junctionWorld(),
    model = createTransit(world, config),
    dispatcher = createRailDispatcher(world, model.trains),
    train = model.trains[0];
  const request = {
    train: clone(train),
    path: [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
    ],
    endPose: { x: 10, y: 0, z: 0, heading: 0 },
    length: 24,
    width: 8,
    height: 8,
  };
  assert.equal(dispatcher.canMoveTrain(request), false);
  assert.throws(() => dispatcher.canMoveTrain({ ...request, width: 9 }), /dimensions/);
  assert.throws(
    () => dispatcher.canMoveTrain({ ...request, endPose: { x: 10, y: 10, z: 0, heading: 0 } }),
    /off-corridor/,
  );
  const before = clone(model.trains);
  dispatcher.canDepart({ train: clone(train) });
  assert.deepEqual(model.trains, before, 'dispatcher mutated its fleet');
});

test('an incoming terminal block remains occupied through arrival and the next departure until rear clearance', () => {
  const world = junctionWorld();
  world.transit.throughServices = world.transit.throughServices.slice(0, 1);
  const physicalBounds = { x: 394, y: -6, w: 12, h: 12, zMin: 0, zMax: 8 },
    bounds = { x: 382, y: -18, w: 36, h: 36, zMin: -8, zMax: 8 };
  world.transit.railResources.push({
    id: 'terminal',
    type: 'junction',
    trackIds: ['t0-0', 't0-1'],
    physicalBounds,
    bounds,
    releaseBounds: bounds,
  });
  world.transit.legResourceBundles['t0-0'].push({
    resourceId: 'terminal',
    entryDistance: 382,
    releaseDistance: 430,
  });
  world.transit.legResourceBundles['t0-1'].push({
    resourceId: 'terminal',
    entryDistance: 0,
    releaseDistance: 30,
  });
  world.transit.stationResourceBundles['p0-1'] = ['terminal'];
  const model = createTransit(world, config),
    dispatcher = createRailDispatcher(world, model.trains),
    train = model.trains[0];
  until(model, world, dispatcher, () => train.visits === 1 && train.phase === 'dwelling');
  assert.equal(has(dispatcher, 'terminal', train.id), true);
  const corrupted = dispatcher.snapshot();
  corrupted.reservations = corrupted.reservations.filter((r) => r.resourceId !== 'terminal');
  assert.throws(
    () => validateRailDispatch(corrupted, world, model.trains),
    /station physical occupancy/,
  );
  until(model, world, dispatcher, () => train.visits === 1 && train.distance > 20);
  assert.equal(has(dispatcher, 'terminal', train.id), true);
  until(model, world, dispatcher, () => train.visits === 1 && train.distance > 35);
  assert.equal(has(dispatcher, 'terminal', train.id), false);
});

test('a stopped train still closes a road crossing and overlapping fleets cannot be adopted', () => {
  const world = junctionWorld();
  Object.assign(world.transit.railCrossings[0], {
    bounds: { x: -34, y: -34, w: 68, h: 68, zMin: 0, zMax: 8 },
    points: [{ x: 0, y: 0, z: 0, roadZ: 0 }],
  });
  const model = createTransit(world, config),
    dispatcher = createRailDispatcher(world, model.trains);
  assert.equal(model.trains[0].phase, 'opening');
  assert.deepEqual(dispatcher.closedGates, ['gate0']);
  const overlappingWorld = junctionWorld();
  overlappingWorld.transit.throughServices = [
    overlappingWorld.transit.throughServices[0],
    { ...overlappingWorld.transit.throughServices[0], id: 'duplicate-path' },
  ];
  assert.throws(
    () => createRailDispatcher(overlappingWorld, createTransit(overlappingWorld, config).trains),
    /overlapping fleet/,
  );
});

test('a forged sweep cannot replace an authored bend with a diagonal shortcut', () => {
  const world = junctionWorld();
  world.transit.throughServices = world.transit.throughServices.slice(0, 1);
  world.transit.tracks[0].points = [
    { x: 0, y: 0, z: 0 },
    { x: 200, y: 0, z: 0 },
    { x: 200, y: 200, z: 0 },
    { x: 400, y: 0, z: 0 },
  ];
  const model = createTransit(world, config),
    dispatcher = createRailDispatcher(world, model.trains);
  let inspected = false;
  const context = {
    ...dispatcher,
    canMoveTrain(request) {
      if (request.path.length > 2) {
        const shortcut = { ...request, path: [request.path[0], request.path.at(-1)] };
        assert.throws(() => dispatcher.canMoveTrain(shortcut), /off-corridor|missing swept corner/);
        inspected = true;
      }
      return dispatcher.canMoveTrain(request);
    },
  };
  for (let i = 0; i < 30 && !inspected; i++) {
    dispatcher.beginStep(model.trains, model.time);
    updateTransit(model, world, 1, context);
    dispatcher.endStep(model.trains, model.time);
  }
  assert.equal(inspected, true);
});

test('closed-stop bypasses still acquire the next complete leg or queue safely with doors closed', () => {
  const world = junctionWorld(),
    model = createTransit(world, config),
    dispatcher = createRailDispatcher(world, model.trains);
  const context = { ...dispatcher, canStop: () => false };
  for (let i = 0; i < 400 && !model.trains.every((train) => train.circuits >= 1); i++) {
    dispatcher.beginStep(model.trains, model.time);
    updateTransit(model, world, 0.5, context);
    dispatcher.endStep(model.trains, model.time);
    const restored = restoreRailDispatch(dispatcher.snapshot(), world, model.trains);
    assert.equal(validateRailDispatch(restored, world, model.trains), true);
    for (const train of model.trains) if (train.visits) assert.equal(train.doorProgress, 0);
  }
  assert.ok(model.trains.every((train) => train.circuits >= 1));
});

test('all four actual city services complete a bounded circuit together under physical reservations', () => {
  const { world, report } = createRailWorld(CITY_BLUEPRINT),
    model = createTransit(world),
    dispatcher = createRailDispatcher(world, model.trains);
  assert.equal(world.transit.railCrossings.length, 7);
  assert.equal(report.directionalTracks, 56);
  const reached = new Set();
  for (let i = 0; i < 2500 && !model.trains.every((t) => t.circuits >= 1); i++) {
    step(model, world, dispatcher, 1);
    for (const train of model.trains) reached.add(`${train.serviceId}:${train.callIndex}`);
  }
  assert.ok(
    model.trains.every((t) => t.circuits >= 1),
    JSON.stringify({
      trains: model.trains.map((t) => ({ id: t.id, visits: t.visits, phase: t.phase })),
      waiting: dispatcher.snapshot().waiting,
    }),
  );
  assert.equal(reached.size, 56);
  assert.ok(model.time < 2500);
  assert.ok(dispatcher.snapshot().stats.maxWait < 350);
  assert.equal(validateRailDispatch(dispatcher.snapshot(), world, model.trains), true);
});
