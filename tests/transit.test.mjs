import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTransit,
  updateTransit,
  boardTransit,
  alightTransit,
  requestTransitStop,
  getTransitDoors,
  getTransitPassengerPose,
  recoverTransitPassenger,
  settleTransitDebt,
  validateTransit,
  restoreTransit,
} from '../src/transit.js';
import { CITY_BLUEPRINT as city } from '../src/city-blueprint.js';
import { createRailWorld } from '../src/rail-geometry.js';
import { createTerrain } from '../src/terrain.js';
import { createSurfaceMovement } from '../src/surface-movement.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const close = (actual, expected, label = '') =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} != ${expected}`);
const settings = { cruiseSpeed: 10, acceleration: 10, braking: 10, dwellSeconds: 2 };
function squareWorld({ reverse = false } = {}) {
  const stops = [
    { x: 50, y: 0, z: 0 },
    { x: 100, y: 50, z: 0 },
    { x: 50, y: 100, z: 0 },
    { x: 0, y: 50, z: 0 },
  ];
  const centers = [
    [50, -20],
    [120, 50],
    [50, 120],
    [-20, 50],
  ];
  const headings = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  const platforms = stops.map((stop, i) => ({
    id: `${'ABCD'[i]}:platform`,
    x: centers[i][0],
    y: centers[i][1],
    z: 0,
    width: 24,
    length: 100,
    heading: headings[i],
    stopPoint: stop,
  }));
  const corners = [
    { x: 100, y: 0, z: 0 },
    { x: 100, y: 100, z: 0 },
    { x: 0, y: 100, z: 0 },
    { x: 0, y: 0, z: 0 },
  ];
  const tracks = platforms.map((p, i) => ({
    id: `track-${i}`,
    fromPlatformId: p.id,
    toPlatformId: platforms[(i + 1) % 4].id,
    points: [p.stopPoint, corners[i], platforms[(i + 1) % 4].stopPoint],
  }));
  const calls = platforms.map((p, i) => ({ stationId: 'ABCD'[i], platformId: p.id }));
  const legs = tracks.map((track) => ({
    trackId: track.id,
    fromPlatformId: track.fromPlatformId,
    toPlatformId: track.toPlatformId,
    reverse: false,
  }));
  const services = [
    { id: 'forward', name: 'Clockwise service', closedLoop: true, calls, legs, segmentIds: [] },
  ];
  if (reverse) {
    const reversed = [calls[0], calls[3], calls[2], calls[1]];
    services.push({
      id: 'reverse',
      name: 'Counterclockwise service',
      closedLoop: true,
      calls: reversed,
      legs: [3, 2, 1, 0].map((i) => ({
        trackId: tracks[i].id,
        fromPlatformId: tracks[i].toPlatformId,
        toPlatformId: tracks[i].fromPlatformId,
        reverse: true,
      })),
      segmentIds: [],
    });
  }
  return {
    transit: {
      stations: platforms.map((p, i) => ({
        id: 'ABCD'[i],
        name: `Station ${'ABCD'[i]}`,
        platforms: [p],
      })),
      tracks,
      throughServices: services,
      segments: [],
    },
  };
}
function slopeWorld() {
  const a = {
    id: 'A:p',
    x: 0,
    y: 20,
    z: 0,
    width: 24,
    length: 100,
    heading: 0,
    stopPoint: { x: 0, y: 0, z: 0 },
  };
  const b = {
    id: 'B:p',
    x: 10,
    y: 40,
    z: 30,
    width: 24,
    length: 100,
    heading: Math.PI / 2,
    stopPoint: { x: 30, y: 40, z: 30 },
  };
  const calls = [
    { stationId: 'A', platformId: a.id },
    { stationId: 'B', platformId: b.id },
  ];
  return {
    transit: {
      stations: [
        { id: 'A', platforms: [a] },
        { id: 'B', platforms: [b] },
      ],
      segments: [],
      tracks: [
        {
          id: 'slope',
          fromPlatformId: a.id,
          toPlatformId: b.id,
          points: [a.stopPoint, { x: 30, y: 0, z: 0 }, b.stopPoint],
        },
      ],
      throughServices: [
        {
          id: 'forward',
          calls,
          closedLoop: true,
          legs: [
            { trackId: 'slope', fromPlatformId: a.id, toPlatformId: b.id, reverse: false },
            { trackId: 'slope', fromPlatformId: b.id, toPlatformId: a.id, reverse: true },
          ],
        },
      ],
    },
  };
}
function owner(initial = 100) {
  const wallet = { money: initial },
    actors = new Map(),
    charged = [];
  const context = {
    transact(request, apply) {
      if (request.amount > wallet.money) return false;
      const beforeMoney = wallet.money,
        beforeActors = clone([...actors]);
      wallet.money -= request.amount;
      try {
        const accepted = apply();
        if (!accepted) {
          wallet.money = beforeMoney;
          actors.clear();
          beforeActors.forEach(([id, actor]) => actors.set(id, actor));
          return false;
        }
        charged.push(clone(request));
        return true;
      } catch (error) {
        wallet.money = beforeMoney;
        actors.clear();
        beforeActors.forEach(([id, actor]) => actors.set(id, actor));
        throw error;
      }
    },
    onBoard({ passengerId, pose }) {
      actors.set(passengerId, { riding: pose.trainId, ...pose });
    },
    onRide({ passengerId, pose }) {
      Object.assign(actors.get(passengerId), pose);
    },
    onAlight({ passengerId, position }) {
      actors.set(passengerId, { riding: null, ...position });
    },
  };
  return { wallet, actors, charged, context };
}
function boardAtFirst(state, world, context, passengerId = 'player', extra = {}) {
  const train = state.trains[0],
    service = world.transit.throughServices.find((s) => s.id === train.serviceId);
  const call = service.calls[train.callIndex];
  const platform = world.transit.stations
    .find((s) => s.id === call.stationId)
    .platforms.find((p) => p.id === call.platformId);
  return boardTransit(
    state,
    world,
    { passengerId, trainId: train.id, position: platform.boardingPoint ?? platform, ...extra },
    context,
  );
}
function until(state, world, predicate, context = {}, limit = 5000, step = 0.1) {
  for (let i = 0; i < limit && !predicate(); i++) updateTransit(state, world, step, context);
  assert.ok(predicate(), 'transit did not reach its expected state');
}
function roundTrip(state, world) {
  assert.equal(validateTransit(state, world), true);
  const restored = restoreTransit(JSON.stringify(state), world);
  assert.deepEqual(restored, state);
  assert.notEqual(restored, state);
  assert.notEqual(restored.trains[0], state.trains[0]);
  return restored;
}

test('doors open and close on a timetable while the train stays still and boards only fully open', () => {
  const world = squareWorld(),
    state = createTransit(world, settings),
    o = owner();
  assert.equal(boardAtFirst(state, world, o.context).reason, 'doors-not-open');
  updateTransit(state, world, 0.5);
  close(state.trains[0].doorProgress, 0.5);
  assert.equal(state.trains[0].x, 50);
  roundTrip(state, world);
  updateTransit(state, world, 0.5);
  assert.equal(state.trains[0].phase, 'dwelling');
  assert.equal(boardAtFirst(state, world, o.context).ok, true);
  assert.equal(o.wallet.money, 100, 'source-style post-trip billing must not debit boarding');
  updateTransit(state, world, 2.5, o.context);
  assert.equal(state.trains[0].phase, 'closing');
  close(state.trains[0].doorProgress, 0.5);
  assert.equal(
    alightTransit(state, world, { passengerId: 'player' }, o.context).reason,
    'doors-not-open',
  );
  updateTransit(state, world, 0.5, o.context);
  assert.equal(state.trains[0].phase, 'moving');
  assert.equal(state.trains[0].doorProgress, 0);
  assert.equal(state.trains[0].speed, 0);
  roundTrip(state, world);
});

test('real polyline motion accelerates, brakes, and carries the rider continuously through a corner', () => {
  const world = squareWorld(),
    state = createTransit(world, settings),
    o = owner();
  updateTransit(state, world, 1);
  assert.equal(boardAtFirst(state, world, o.context).ok, true);
  updateTransit(state, world, 3);
  updateTransit(state, world, 0.5, o.context);
  close(state.trains[0].x, 51.25);
  close(state.trains[0].speed, 5);
  updateTransit(state, world, 5, o.context);
  close(state.trains[0].x, 100);
  close(state.trains[0].y, 0);
  const before = getTransitPassengerPose(state, 'player');
  updateTransit(state, world, 0.00001, o.context);
  const after = getTransitPassengerPose(state, 'player');
  assert.ok(
    Math.hypot(after.x - before.x, after.y - before.y) < 0.001,
    'seat must not snap on a sharp path vertex',
  );
  updateTransit(state, world, 4.99999, o.context);
  close(state.trains[0].y, 48.75);
  close(state.trains[0].speed, 5);
  updateTransit(state, world, 0.5, o.context);
  assert.equal(state.trains[0].phase, 'opening');
  close(state.trains[0].x, 100);
  close(state.trains[0].y, 50);
  close(state.trains[0].speed, 0);
  assert.equal(o.actors.get('player').trainId, state.trains[0].id);
  roundTrip(state, world);
});

test('a genuine 3-4-5 sloping segment interpolates XYZ and preserves partial-physics saves', () => {
  const world = slopeWorld();
  let state = createTransit(world, settings);
  updateTransit(state, world, 4);
  updateTransit(state, world, 5);
  close(state.trains[0].x, 30);
  close(state.trains[0].y, 12);
  close(state.trains[0].z, 9);
  close(state.trains[0].distance, 45);
  state = roundTrip(state, world);
  updateTransit(state, world, 4);
  assert.equal(state.trains[0].phase, 'opening');
  close(state.trains[0].z, 30);
  roundTrip(state, world);
});

test('frame partitions and source service/track order preserve schedules, positions, visits and event ordering', () => {
  const world = squareWorld({ reverse: true }),
    reordered = clone(world);
  reordered.transit.stations.reverse();
  reordered.transit.tracks.reverse();
  reordered.transit.throughServices.reverse();
  const a = createTransit(world, settings),
    b = createTransit(reordered, settings);
  updateTransit(a, world, 137);
  for (let i = 0; i < 1370; i++) updateTransit(b, reordered, 0.1);
  for (let i = 0; i < a.trains.length; i++) {
    for (const key of ['id', 'phase', 'callIndex', 'visits', 'circuits'])
      assert.equal(a.trains[i][key], b.trains[i][key]);
    for (const key of ['x', 'y', 'z', 'distance', 'speed', 'phaseRemaining'])
      close(a.trains[i][key], b.trains[i][key]);
  }
  assert.equal(a.events.length, b.events.length);
  a.events.forEach((event, i) => {
    assert.equal(event.kind, b.events[i].kind);
    assert.deepEqual(event.data, b.events[i].data);
    close(event.time, b.events[i].time);
  });
  roundTrip(a, world);
  roundTrip(b, reordered);
});

test('movement observers see every train at the same global time instead of half-updated fleet poses', () => {
  const world = squareWorld({ reverse: true }),
    state = createTransit(world, settings);
  updateTransit(state, world, 4);
  const observed = [];
  updateTransit(state, world, 2, {
    onTrainMove() {
      observed.push(state.trains.map((train) => train.distance));
    },
  });
  assert.equal(observed.length, 2);
  assert.deepEqual(observed, [
    [15, 15],
    [15, 15],
  ]);
});

test('boarding rejects out-of-range/wrong-level/platform/train-footprint entries before any transaction', () => {
  const world = squareWorld(),
    state = createTransit(world, settings),
    o = owner();
  updateTransit(state, world, 1);
  for (const [extra, reason] of [
    [{ position: { x: 50, y: -20, z: 5 } }, 'wrong-height'],
    [{ position: { x: 50, y: 0, z: 0 } }, 'outside-platform'],
    [{ position: { x: 93, y: -25, z: 0 } }, 'door-out-of-range'],
    [{ platformId: 'B:platform' }, 'wrong-platform'],
  ])
    assert.equal(boardAtFirst(state, world, o.context, 'player', extra).reason, reason);
  assert.equal(state.transactionSequence, 0);
  assert.equal(o.charged.length, 0);
  assert.equal(o.wallet.money, 100);
  const overlapping = squareWorld();
  overlapping.transit.stations[0].platforms[0].y = 0;
  const unsafe = createTransit(overlapping, settings);
  updateTransit(unsafe, overlapping, 1);
  assert.equal(boardAtFirst(unsafe, overlapping, o.context).reason, 'inside-train-footprint');
});

test('capacity, identity and pursuit/progression policies gate real boarding', () => {
  const world = squareWorld(),
    state = createTransit(world, { ...settings, capacity: 1 }),
    o = owner();
  updateTransit(state, world, 1);
  assert.equal(
    boardAtFirst(state, world, { ...o.context, canBoard: () => false }).reason,
    'boarding-policy',
  );
  assert.equal(boardAtFirst(state, world, {}).reason, 'transaction-authority-required');
  assert.equal(boardAtFirst(state, world, o.context).ok, true);
  assert.equal(boardAtFirst(state, world, o.context).reason, 'already-aboard');
  assert.equal(boardAtFirst(state, world, o.context, 'other').reason, 'train-full');
  assert.equal(getTransitDoors(state, world, { position: { x: 50, y: -20, z: 0 } })[0].full, true);
});

test('the parent wallet and actor callbacks own post-trip billing and exact physical alighting', () => {
  const world = squareWorld(),
    state = createTransit(world, settings),
    o = owner();
  updateTransit(state, world, 1);
  assert.equal(
    boardAtFirst(state, world, o.context, 'player', { destination: { stationId: 'B' } }).ok,
    true,
  );
  until(
    state,
    world,
    () => state.trains[0].callIndex === 1 && state.trains[0].phase === 'dwelling',
    o.context,
  );
  assert.equal(o.wallet.money, 100);
  const result = alightTransit(state, world, { passengerId: 'player' }, o.context);
  assert.equal(result.ok, true);
  assert.equal(result.amount, 2);
  assert.equal(o.wallet.money, 98);
  assert.deepEqual(o.actors.get('player'), { riding: null, x: 120, y: 50, z: 0 });
  assert.equal(state.passengers.length, 0);
  assert.equal(state.trains[0].passengerIds.length, 0);
  assert.equal(state.stats.fareAccrued, 2);
  assert.equal(state.stats.farePaid, 2);
  assert.equal(
    alightTransit(state, world, { passengerId: 'player' }, o.context).reason,
    'not-aboard',
  );
  assert.equal(o.wallet.money, 98);
  roundTrip(state, world);
});

test('staying aboard multiple actual stops accrues the configured distance tariff only once', () => {
  const world = squareWorld(),
    state = createTransit(world, settings),
    o = owner();
  updateTransit(state, world, 1);
  boardAtFirst(state, world, o.context);
  until(
    state,
    world,
    () => state.trains[0].visits === 3 && state.trains[0].phase === 'dwelling',
    o.context,
  );
  assert.equal(o.wallet.money, 100);
  assert.equal(alightTransit(state, world, { passengerId: 'player' }, o.context).amount, 4);
  assert.equal(o.wallet.money, 96);
  assert.equal(state.stats.farePaid, 4);
});

test('cancelling at the same platform before departure is a real zero-stop exit', () => {
  const world = squareWorld(),
    state = createTransit(world, settings),
    o = owner();
  updateTransit(state, world, 1);
  boardAtFirst(state, world, o.context);
  const exit = alightTransit(state, world, { passengerId: 'player' }, o.context);
  assert.equal(exit.ok, true);
  assert.equal(exit.amount, 0);
  assert.equal(o.wallet.money, 100);
  assert.equal(
    boardAtFirst(state, world, o.context).freeTransfer,
    false,
    'cancelled boarding cannot mint free travel',
  );
  until(
    state,
    world,
    () => state.trains[0].callIndex === 1 && state.trains[0].phase === 'dwelling',
    o.context,
  );
  assert.equal(alightTransit(state, world, { passengerId: 'player' }, o.context).amount, 2);
  assert.equal(o.wallet.money, 98);
});

test('insufficient fare never invents payment; authorized debt/waivers allow recovery and truthful settlement', () => {
  const world = squareWorld(),
    state = createTransit(world, settings),
    o = owner(0);
  updateTransit(state, world, 1);
  boardAtFirst(state, world, o.context);
  until(
    state,
    world,
    () => state.trains[0].callIndex === 1 && state.trains[0].phase === 'dwelling',
    o.context,
  );
  assert.equal(
    alightTransit(state, world, { passengerId: 'player' }, o.context).reason,
    'transaction-declined',
  );
  assert.equal(state.passengers.length, 1);
  assert.equal(state.stats.farePaid, 0);
  const debt = {
    ...o.context,
    transact: (tx, apply) =>
      apply() ? { approved: true, paid: 0, owed: tx.amount, waived: 0 } : false,
  };
  assert.equal(alightTransit(state, world, { passengerId: 'player' }, debt).ok, true);
  assert.equal(state.stats.fareOwed, 2);
  assert.equal(state.stats.farePaid, 0);
  assert.equal(state.tickets[0].owed, 2);
  o.wallet.money = 10;
  assert.equal(settleTransitDebt(state, { passengerId: 'player' }, o.context).ok, true);
  assert.equal(o.wallet.money, 8);
  assert.equal(state.tickets[0].owed, 0);
  assert.equal(state.stats.fareOwed, 0);
  assert.equal(state.stats.farePaid, 2);
  assert.equal(state.stats.fareAccrued, 2);
  roundTrip(state, world);
});

test('same-station transfers require actual walking to the new platform and its current height/range', () => {
  const world = squareWorld(),
    base = world.transit.stations[1].platforms[0];
  const upper = {
    ...clone(base),
    id: 'B:upper',
    x: 150,
    z: 20,
    stopPoint: { x: 130, y: 50, z: 20 },
  };
  const c = {
    id: 'C:upper',
    x: 150,
    y: 150,
    z: 20,
    width: 24,
    length: 100,
    heading: Math.PI / 2,
    stopPoint: { x: 130, y: 150, z: 20 },
  };
  world.transit.stations[1].platforms.push(upper);
  world.transit.stations[2].platforms.push(c);
  world.transit.tracks.push({
    id: 'upper',
    fromPlatformId: upper.id,
    toPlatformId: c.id,
    points: [upper.stopPoint, c.stopPoint],
  });
  world.transit.throughServices.push({
    id: 'upper-service',
    closedLoop: true,
    calls: [
      { stationId: 'B', platformId: upper.id },
      { stationId: 'C', platformId: c.id },
    ],
    legs: [
      { trackId: 'upper', fromPlatformId: upper.id, toPlatformId: c.id, reverse: false },
      { trackId: 'upper', fromPlatformId: c.id, toPlatformId: upper.id, reverse: true },
    ],
  });
  const state = createTransit(world, settings),
    o = owner();
  updateTransit(state, world, 1);
  boardAtFirst(state, world, o.context);
  until(
    state,
    world,
    () => state.trains[0].callIndex === 1 && state.trains[0].phase === 'dwelling',
    o.context,
  );
  alightTransit(state, world, { passengerId: 'player' }, o.context);
  assert.equal(o.wallet.money, 98);
  const train = state.trains.find((t) => t.serviceId === 'upper-service');
  until(state, world, () => train.callIndex === 0 && train.phase === 'dwelling');
  assert.equal(
    boardTransit(
      state,
      world,
      { passengerId: 'player', trainId: train.id, position: base },
      o.context,
    ).ok,
    false,
  );
  const transfer = boardTransit(
    state,
    world,
    { passengerId: 'player', trainId: train.id, position: upper },
    o.context,
  );
  assert.equal(transfer.ok, true);
  assert.equal(transfer.freeTransfer, true);
  until(state, world, () => train.callIndex === 1 && train.phase === 'dwelling', o.context);
  assert.equal(alightTransit(state, world, { passengerId: 'player' }, o.context).amount, 0);
  assert.equal(o.wallet.money, 98);
  assert.equal(state.stats.transfers, 1);
  roundTrip(state, world);
});

test('a free transfer cannot renew its paid ticket indefinitely across later circuits', () => {
  const world = squareWorld(),
    state = createTransit(world, settings),
    o = owner();
  updateTransit(state, world, 1);
  boardAtFirst(state, world, o.context);
  until(
    state,
    world,
    () => state.trains[0].callIndex === 1 && state.trains[0].phase === 'dwelling',
    o.context,
  );
  alightTransit(state, world, { passengerId: 'player' }, o.context);
  assert.equal(o.wallet.money, 98);
  const expiry = state.tickets[0].validUntil;
  assert.equal(boardAtFirst(state, world, o.context).freeTransfer, true);
  until(
    state,
    world,
    () => state.time > expiry + 1 && state.trains[0].phase === 'dwelling',
    o.context,
  );
  assert.equal(alightTransit(state, world, { passengerId: 'player' }, o.context).amount, 0);
  assert.equal(state.tickets[0].validUntil, expiry);
  assert.equal(boardAtFirst(state, world, o.context).freeTransfer, false);
  const visit = state.trains[0].visits;
  until(
    state,
    world,
    () => state.trains[0].visits > visit && state.trains[0].phase === 'dwelling',
    o.context,
  );
  assert.equal(alightTransit(state, world, { passengerId: 'player' }, o.context).amount, 2);
  assert.equal(o.wallet.money, 96);
  roundTrip(state, world);
});

test('only an authorized fare waiver can replace payment and it remains explicit in the ledger', () => {
  const world = squareWorld(),
    state = createTransit(world, settings),
    o = owner();
  updateTransit(state, world, 1);
  boardAtFirst(state, world, o.context);
  until(
    state,
    world,
    () => state.trains[0].callIndex === 1 && state.trains[0].phase === 'dwelling',
    o.context,
  );
  const ctx = {
    ...o.context,
    transact: (tx, apply) =>
      apply() ? { approved: true, paid: 0, owed: 0, waived: tx.amount } : false,
  };
  assert.equal(alightTransit(state, world, { passengerId: 'player' }, ctx).ok, true);
  assert.equal(o.wallet.money, 100);
  assert.equal(state.stats.farePaid, 0);
  assert.equal(state.stats.fareWaived, 2);
  assert.equal(state.stats.fareAccrued, 2);
  roundTrip(state, world);
});

test('a missed stop keeps the actor aboard and permits a physical next-stop exit or a full return circuit', () => {
  const world = squareWorld(),
    state = createTransit(world, settings),
    o = owner();
  updateTransit(state, world, 1);
  boardAtFirst(state, world, o.context, 'player', { destination: { stationId: 'B' } });
  until(
    state,
    world,
    () => state.trains[0].visits === 2 && state.trains[0].phase === 'dwelling',
    o.context,
  );
  assert.equal(state.passengers[0].missedStops, 1);
  assert.equal(state.passengers[0].lastMiss, 'doors-closed');
  assert.equal(state.passengers[0].trainId, state.trains[0].id);
  assert.equal(
    requestTransitStop(state, world, { passengerId: 'player', stationId: 'unserved' }).reason,
    'destination-not-served',
  );
  assert.equal(
    requestTransitStop(state, world, { passengerId: 'player', stationId: 'B' }).ok,
    true,
  );
  until(
    state,
    world,
    () => state.trains[0].visits === 5 && state.trains[0].phase === 'dwelling',
    o.context,
  );
  assert.equal(state.passengers[0].arrivalPending, true);
  assert.equal(state.trains[0].callIndex, 1);
  assert.equal(alightTransit(state, world, { passengerId: 'player' }, o.context).amount, 6);
  assert.equal(o.wallet.money, 94);
});

test('closed stops do not open doors or teleport riders; a held service allows exit and timed recovery', () => {
  const world = squareWorld(),
    state = createTransit(world, settings),
    o = owner();
  updateTransit(state, world, 1);
  boardAtFirst(state, world, o.context, 'player', { destination: { stationId: 'B' } });
  const closed = { ...o.context, canStop: ({ call }) => call.stationId !== 'B' };
  until(state, world, () => state.trains[0].visits === 1, closed);
  assert.equal(state.trains[0].phase, 'moving');
  assert.equal(state.passengers[0].lastMiss, 'stop-closed');
  assert.equal(
    alightTransit(state, world, { passengerId: 'player' }, o.context).reason,
    'doors-not-open',
  );
  until(state, world, () => state.trains[0].callIndex === 2 && state.trains[0].phase === 'held', {
    ...closed,
    canDepart: ({ call }) => call.stationId !== 'C',
  });
  roundTrip(state, world);
  assert.equal(state.trains[0].doorProgress, 1);
  assert.equal(alightTransit(state, world, { passengerId: 'player' }, o.context).ok, true);
  updateTransit(state, world, 0.5, o.context);
  assert.equal(state.trains[0].phase, 'closing');
  updateTransit(state, world, 0.5, o.context);
  assert.equal(state.trains[0].phase, 'moving');
});

test('blocked corridors freeze at the last approved pose and resume with a complete swept path through bends', () => {
  const world = squareWorld(),
    state = createTransit(world, settings);
  updateTransit(state, world, 4);
  updateTransit(state, world, 2);
  const before = {
    x: state.trains[0].x,
    y: state.trains[0].y,
    z: state.trains[0].z,
    legElapsed: state.trains[0].legElapsed,
  };
  updateTransit(state, world, 1, { canMoveTrain: () => false });
  assert.equal(state.trains[0].phase, 'blocked');
  assert.equal(state.trains[0].speed, 0);
  for (const key of Object.keys(before)) assert.equal(state.trains[0][key], before[key]);
  roundTrip(state, world);
  const paths = [];
  updateTransit(state, world, 5, {
    canMoveTrain: ({ path, endPose }) => {
      paths.push({ path, endPose });
      return true;
    },
  });
  assert.equal(state.trains[0].phase, 'moving');
  assert.ok(paths.some(({ path }) => path.some((p) => p.x === 100 && p.y === 0)));
  assert.ok(state.events.some((e) => e.kind === 'resumed'));
});

test('blocked exits can be retried without charges; refusal inside a stop callback does not stale the fleet', () => {
  const world = squareWorld({ reverse: true }),
    state = createTransit(world, settings),
    o = owner();
  updateTransit(state, world, 1);
  boardAtFirst(state, world, o.context, 'player', { destination: { stationId: 'B' } });
  const attempts = [];
  const context = {
    ...o.context,
    onRequestedStop() {
      attempts.push(
        alightTransit(
          state,
          world,
          { passengerId: 'player' },
          { ...o.context, onAlight: () => false },
        ),
      );
    },
  };
  updateTransit(state, world, 15, context);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].reason, 'transaction-declined');
  assert.equal(o.wallet.money, 100);
  assert.equal(state.passengers.length, 1);
  assert.equal(state.trains[0].phase, 'dwelling');
  assert.equal(state.trains[1].phase, 'dwelling');
  roundTrip(state, world);
});

test('authorized death/disconnect recovery detaches ownership and accounts for pending fare without ordinary teleport recovery', () => {
  const world = squareWorld(),
    state = createTransit(world, settings),
    o = owner(0);
  updateTransit(state, world, 1);
  boardAtFirst(state, world, o.context);
  until(state, world, () => state.trains[0].visits === 1 && state.trains[0].phase === 'moving');
  assert.equal(
    recoverTransitPassenger(
      state,
      world,
      { passengerId: 'player', reason: 'missed-stop' },
      o.context,
    ).reason,
    'recovery-not-authorized',
  );
  const recovery = {
    canRecover: () => true,
    onRecover: () => o.actors.delete('player'),
    transact: (tx, apply) =>
      apply() ? { approved: true, paid: 0, owed: tx.amount, waived: 0 } : false,
  };
  assert.equal(
    recoverTransitPassenger(state, world, { passengerId: 'player', reason: 'death' }, recovery).ok,
    true,
  );
  assert.equal(state.passengers.length, 0);
  assert.equal(state.stats.recoveries, 1);
  assert.equal(state.stats.fareOwed, 2);
  assert.equal(state.tickets[0].owed, 2);
  assert.equal(state.tickets[0].validUntil, 0);
  roundTrip(state, world);
});

test('failed/throwing/double/deferred transactions cannot charge twice or leave a half-boarding', () => {
  const world = squareWorld();
  for (const factory of [
    () => ({ transact: () => false }),
    () => ({
      transact: (tx, apply) => {
        apply();
        return false;
      },
    }),
    () => ({
      transact: (tx, apply) => {
        apply();
        apply();
        return true;
      },
    }),
    () => ({
      transact: (tx, apply) => {
        apply();
        return { approved: true, paid: 1, owed: 0, waived: 0 };
      },
    }),
    () => ({
      transact: (tx, apply) => apply(),
      onBoard: () => {
        throw new Error('actor failed');
      },
    }),
  ]) {
    const state = createTransit(world, settings);
    updateTransit(state, world, 1);
    try {
      boardAtFirst(state, world, factory());
    } catch (error) {
      assert.match(error.message, /Invalid transit|actor failed/);
    }
    assert.equal(state.passengers.length, 0);
    assert.equal(state.trains[0].passengerIds.length, 0);
    assert.equal(state.stats.boardings, 0);
    roundTrip(state, world);
  }
  const state = createTransit(world, settings);
  updateTransit(state, world, 1);
  let deferred;
  boardAtFirst(state, world, {
    transact: (tx, apply) => {
      deferred = apply;
      return false;
    },
  });
  assert.throws(() => deferred(), /expired/);
  assert.equal(state.passengers.length, 0);
});

test('observer sync failures retain the rider and can be recovered without resetting the journey', () => {
  const world = squareWorld(),
    state = createTransit(world, settings),
    o = owner();
  updateTransit(state, world, 1);
  boardAtFirst(state, world, o.context);
  updateTransit(state, world, 3, {
    onRide: () => {
      throw new Error('');
    },
  });
  assert.equal(state.passengers[0].syncPending, true);
  assert.equal(state.callbackErrors[0].message, 'Callback failed');
  roundTrip(state, world);
  updateTransit(state, world, 1, o.context);
  assert.equal(state.passengers[0].syncPending, false);
  assert.equal(state.passengers[0].trainId, state.trains[0].id);
  updateTransit(state, world, 1, { onRide: () => false });
  assert.equal(state.passengers[0].syncPending, true);
  updateTransit(state, world, 0, o.context);
  assert.equal(state.passengers[0].syncPending, false);
});

test('JSON saves resume partial doors, moving riders, missed stops, tickets and debt without billing replay', () => {
  const world = squareWorld(),
    original = createTransit(world, settings),
    o = owner();
  updateTransit(original, world, 1);
  boardAtFirst(original, world, o.context);
  updateTransit(original, world, 7.25, o.context);
  const restored = roundTrip(original, world),
    beforeMoney = o.wallet.money;
  updateTransit(original, world, 30);
  updateTransit(restored, world, 30);
  assert.deepEqual(restored, original);
  assert.equal(o.wallet.money, beforeMoney);
  until(restored, world, () => restored.trains[0].phase === 'dwelling');
  const debt = {
    transact: (tx, apply) =>
      apply() ? { approved: true, paid: 0, owed: tx.amount, waived: 0 } : false,
  };
  alightTransit(restored, world, { passengerId: 'player' }, debt);
  roundTrip(restored, world);
});

test('all actual four services make full circuits, preserve eight label handoffs, and visit both Brigid levels distinctly', () => {
  const { world } = createRailWorld(city),
    state = createTransit(world),
    events = [];
  until(
    state,
    world,
    () => state.trains.every((t) => t.circuits >= 1),
    { onEvent: (e) => events.push(e) },
    5000,
    1,
  );
  for (const train of state.trains) {
    const service = world.transit.throughServices.find((s) => s.id === train.serviceId);
    const arrivals = events
      .filter((e) => e.kind === 'arrival' && e.data.trainId === train.id)
      .slice(0, service.calls.length);
    assert.deepEqual(
      arrivals.map((e) => e.data.stationId),
      [...service.calls.slice(1), service.calls[0]].map((c) => c.stationId),
    );
    assert.deepEqual(
      arrivals.map((e) => e.data.platformId),
      [...service.calls.slice(1), service.calls[0]].map((c) => c.platformId),
    );
    assert.ok(events.some((e) => e.kind === 'handoff' && e.data.trainId === train.id));
  }
  assert.equal(
    new Set(events.filter((e) => e.kind === 'handoff').flatMap((e) => [e.data.from, e.data.to]))
      .size,
    8,
  );
  const calls = events
    .filter(
      (e) =>
        e.kind === 'arrival' &&
        e.data.trainId === state.trains[0].id &&
        e.data.stationId === 'LL-CITY-ST04',
    )
    .slice(0, 2);
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].data.platformId, calls[1].data.platformId);
  assert.ok(calls[0].data.platformId.includes(':lower'));
  assert.ok(calls[1].data.platformId.includes(':upper'));
  roundTrip(state, world);
});

test('every actual directional face offers a physically checked boarding and same-stop exit window', () => {
  const { world } = createRailWorld(city),
    state = createTransit(world),
    faces = new Map(world.transit.stations.flatMap((s) => s.platforms.map((p) => [p.id, p])));
  const terrain = createTerrain(world),
    seen = new Set(),
    o = owner();
  const ctx = {
    ...o.context,
    canAlight: ({ position, radius }) =>
      !terrain.isBlocked(position.x, position.y, radius, position.z),
    onEvent(e) {
      if (e.kind !== 'doors-open' || seen.has(e.data.platformId)) return;
      const face = faces.get(e.data.platformId),
        passengerId = `test-${seen.size}`;
      const boarding = boardTransit(
        state,
        world,
        { passengerId, trainId: e.data.trainId, platformId: face.id, position: face.boardingPoint },
        o.context,
      );
      assert.equal(boarding.ok, true, `${face.id}: ${boarding.reason}`);
      const exit = alightTransit(state, world, { passengerId }, ctx);
      assert.equal(exit.ok, true, `${face.id}: ${exit.reason}`);
      assert.equal(exit.amount, 0);
      seen.add(face.id);
    },
  };
  until(state, world, () => seen.size === 56, ctx, 5000, 1);
  assert.deepEqual(state.callbackErrors, []);
  assert.equal(state.stats.boardings, 56);
  assert.equal(state.stats.alightings, 56);
  assert.equal(o.wallet.money, 100);
  roundTrip(state, world);
});

test('a city rider actually walks the graded approach, boards, travels, and pays to exit at another station', () => {
  const { world } = createRailWorld(city),
    terrain = createTerrain(world),
    movement = createSurfaceMovement(terrain);
  const state = createTransit(world),
    service = world.transit.throughServices[0],
    firstCall = service.calls[0];
  const face = world.transit.stations
    .find((s) => s.id === firstCall.stationId)
    .platforms.find((p) => p.id === firstCall.platformId);
  const path = world.transit.accessPaths.find((p) => face.accessPathIds.includes(p.id));
  assert.ok(path);
  const actor = { ...path.points[0], groundZ: path.points[0].z };
  for (const target of path.points.slice(1)) {
    const start = { ...actor },
      steps = Math.ceil(Math.hypot(target.x - start.x, target.y - start.y) / 2);
    for (let i = 0; i < steps; i++)
      movement.moveBody(actor, (target.x - start.x) / steps, (target.y - start.y) / steps, 7);
  }
  close(actor.z, face.z);
  close(actor.x, face.x);
  close(actor.y, face.y);
  // The boarding strip remains on the same actor-safe island; walking covers it.
  const delta = { x: face.boardingPoint.x - actor.x, y: face.boardingPoint.y - actor.y };
  movement.moveBody(actor, delta.x, delta.y, 7);
  close(actor.x, face.boardingPoint.x);
  close(actor.y, face.boardingPoint.y);
  updateTransit(state, world, 1);
  const o = owner();
  const ctx = {
    ...o.context,
    onRide({ pose }) {
      Object.assign(actor, pose);
    },
    onAlight({ position }) {
      Object.assign(actor, position, { groundZ: position.z });
    },
    canAlight: ({ position, radius }) =>
      !terrain.isBlocked(position.x, position.y, radius, position.z),
  };
  assert.equal(
    boardTransit(
      state,
      world,
      { passengerId: 'player', trainId: state.trains[0].id, position: actor },
      ctx,
    ).ok,
    true,
  );
  until(
    state,
    world,
    () => state.trains[0].visits === 1 && state.trains[0].phase === 'dwelling',
    ctx,
  );
  assert.equal(alightTransit(state, world, { passengerId: 'player' }, ctx).ok, true);
  assert.equal(o.wallet.money, 98);
  assert.equal(terrain.isBlocked(actor.x, actor.y, 7, actor.z), false);
  roundTrip(state, world);
});

test('raw blueprint metadata cannot pass actor-safe boarding and is not silently treated as playable stations', () => {
  const state = createTransit(city);
  updateTransit(state, city, 1);
  assert.equal(boardAtFirst(state, city, owner().context).reason, 'outside-platform');
});

test('validation rejects corrupt identities, progress, profiles, associations, fares and JSON hazards', () => {
  const world = squareWorld(),
    state = createTransit(world, settings);
  updateTransit(state, world, 1);
  boardAtFirst(state, world, owner().context);
  updateTransit(state, world, 5);
  for (const [name, mutation] of [
    [
      'version',
      (s) => {
        s.version = 2;
      },
    ],
    [
      'topology',
      (s) => {
        s.topology = 'other';
      },
    ],
    [
      'missing config',
      (s) => {
        delete s.config;
      },
    ],
    [
      'missing option',
      (s) => {
        delete s.config.cruiseSpeed;
      },
    ],
    [
      'null train',
      (s) => {
        s.trains[0] = null;
      },
    ],
    [
      'null passenger',
      (s) => {
        s.passengers[0] = null;
      },
    ],
    [
      'config',
      (s) => {
        s.config.cruiseSpeed = -1;
      },
    ],
    [
      'phase',
      (s) => {
        s.trains[0].phase = 'won';
      },
    ],
    [
      'pose',
      (s) => {
        s.trains[0].x++;
      },
    ],
    [
      'progress',
      (s) => {
        s.trains[0].callIndex = 2;
      },
    ],
    [
      'speed',
      (s) => {
        s.trains[0].speed = 300;
      },
    ],
    [
      'door',
      (s) => {
        s.trains[0].doorProgress = 1;
      },
    ],
    [
      'visits',
      (s) => {
        s.trains[0].visits = 1;
      },
    ],
    [
      'orphan',
      (s) => {
        s.trains[0].passengerIds = [];
      },
    ],
    [
      'seat',
      (s) => {
        s.passengers[0].seat = 100;
      },
    ],
    [
      'fare',
      (s) => {
        s.stats.farePaid = 2;
      },
    ],
    [
      'statistics',
      (s) => {
        s.stats.boardings = 0;
      },
    ],
    [
      'non-finite',
      (s) => {
        s.time = NaN;
      },
    ],
    [
      'unearned transfer',
      (s) => {
        s.passengers[0].freeTransfer = true;
      },
    ],
    [
      'function',
      (s) => {
        s.extra = () => 1;
      },
    ],
    [
      'cycle',
      (s) => {
        s.extra = s;
      },
    ],
    [
      'prototype object',
      (s) => {
        s.extra = new Date();
      },
    ],
    [
      'sparse',
      (s) => {
        delete s.trains[0].passengerIds[0];
      },
    ],
    [
      'unsafe key',
      (s) => {
        Object.defineProperty(s, '__proto__', { value: {}, enumerable: true });
      },
    ],
  ]) {
    const corrupted = clone(state);
    mutation(corrupted);
    assert.throws(() => restoreTransit(corrupted, world), /Invalid transit/, name);
  }
  assert.throws(() => restoreTransit('{', world), /malformed/);
  let invoked = false;
  const accessor = clone(state);
  Object.defineProperty(accessor, 'time', {
    get() {
      invoked = true;
      return 1;
    },
    enumerable: true,
  });
  assert.throws(() => restoreTransit(accessor, world), /unsafe/);
  assert.equal(invoked, false);
});

test('invalid topology/options/times and async policy callbacks reject without inventing transit', () => {
  for (const mutate of [
    (w) => {
      w.transit.stations[0].platforms[0].width = 0;
    },
    (w) => {
      w.transit.tracks[0].points[0] = { ...w.transit.tracks[0].points[0], x: 51 };
    },
    (w) => {
      w.transit.throughServices[0].legs[0].reverse = true;
    },
    (w) => {
      w.transit.throughServices[0].closedLoop = false;
    },
  ]) {
    const w = squareWorld();
    mutate(w);
    assert.throws(() => createTransit(w), /Invalid transit/);
  }
  assert.throws(() => createTransit({}, settings), /topology/);
  assert.throws(() => createTransit(squareWorld(), { capacity: 0 }), /Invalid transit/);
  assert.throws(() => createTransit(squareWorld(), { unsupported: true }), /Invalid transit/);
  const world = squareWorld(),
    state = createTransit(world, settings);
  for (const dt of [-1, NaN, Infinity, 3601])
    assert.throws(() => updateTransit(state, world, dt), /Invalid transit/);
  updateTransit(state, world, 1);
  assert.throws(
    () => boardAtFirst(state, world, { canBoard: () => Promise.resolve(true) }),
    /synchronous/,
  );
});

test('sub-frame elapsed time advances door physics instead of silently dropping time', () => {
  const world = squareWorld(),
    state = createTransit(world, settings);
  updateTransit(state, world, 1e-8);
  assert.equal(state.time, 1e-8);
  assert.ok(state.trains[0].doorProgress > 0);
  assert.ok(state.trains[0].phaseRemaining < 1);
  roundTrip(state, world);
});
