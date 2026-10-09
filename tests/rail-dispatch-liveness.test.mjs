/** Real four-service controller/resource snapshots and sustained native motion.
 * No actor/wallet/world reset, route bypass or gameplay/source completion claim.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createTransit, updateTransit, validateTransit, restoreTransit } from '../src/transit.js';
import {
  createRailDispatcher,
  validateRailDispatch,
  restoreRailDispatch,
  railDispatchTopology,
} from '../src/rail-dispatcher.js';
import { createRailClearance } from '../src/rail-clearance.js';
const fixtures = JSON.parse(
    readFileSync(new URL('./fixtures/rail-dispatch-deadlocks-0.6.json', import.meta.url)),
  ),
  worlds = await import(
    process.env.LOWLIGHT_RAIL_TEST_WORLD
      ? pathToFileURL(process.env.LOWLIGHT_RAIL_TEST_WORLD).href
      : new URL('../src/world.js', import.meta.url).href
  ),
  legacy = worlds.LEGACY_WORLD ?? worlds.WORLD,
  clone = (v) => JSON.parse(JSON.stringify(v));
const id = (n) => `rail-LL-CITY-SERVICE-0${n}-0`;
function restored(label) {
  const f = fixtures.cases.find((c) => c.label === label),
    fleet = clone(f.fleet),
    signals = clone(f.signals);
  assert.equal(railDispatchTopology(legacy).topology, fixtures.topology);
  return { f, fleet, signals, d: createRailDispatcher(legacy, fleet, signals) };
}
function owners(snapshot) {
  return new Map(snapshot.reservations.map((r) => [r.resourceId, r.trainId]));
}

test('published all-held deadlock recovers without releasing occupied rear/crossing/platform ownership', () => {
  const { fleet, signals, d } = restored('published2478'),
    before = clone(fleet),
    train = fleet.find((t) => t.id === id(3));
  assert.equal(d.canDepart({ train }), true);
  const after = d.snapshot(),
    map = owners(after);
  for (const r of signals.reservations) assert.equal(map.get(r.resourceId), r.trainId);
  assert.equal(map.get('platform:LL-CITY-ST07:inner_line_platform@LL-CITY-SERVICE-04'), id(4));
  for (const resource of ['rail-resource:53', 'rail-resource:54', 'rail-resource:179'])
    assert.equal(map.get(resource), id(3));
  assert.deepEqual(fleet, before);
  assert.equal(validateRailDispatch(after, legacy, fleet), true);
  assert.equal(after.topology, signals.topology);
  assert.equal(after.topologyEncoding, 2);
});
test('buffered rail-resource membership does not block a full route that never sweeps the physical envelope', () => {
  const { fleet, signals, d } = restored('falseResource6488'),
    before = owners(signals);
  assert.equal(before.get('rail-resource:189'), id(3));
  assert.equal(d.canDepart({ train: fleet.find((t) => t.id === id(4)) }), true);
  const after = d.snapshot();
  assert.equal(owners(after).get('rail-resource:189'), id(3));
  assert.equal(
    owners(after).get('platform:LL-CITY-ST15:inner_line_platform@LL-CITY-SERVICE-03'),
    id(3),
  );
  assert.equal(validateRailDispatch(after, legacy, fleet), true);
});
test('FIFO orders complete grantable bundles while an older third-party-blocked request cannot create a dependency cycle', () => {
  const { fleet, signals, d } = restored('transitiveFifo6478'),
    firstWait = signals.waiting.find((w) => w.trainId === id(3));
  assert.equal(
    d.canDepart({ train: fleet.find((t) => t.id === id(2)) }),
    false,
    'Ready04 remains ahead of ready02',
  );
  assert.equal(
    d.canDepart({ train: fleet.find((t) => t.id === id(4)) }),
    true,
    '03 cannot block04 while03 waits for02',
  );
  const after = d.snapshot();
  assert.deepEqual(
    after.waiting.find((w) => w.trainId === id(3)),
    firstWait,
  );
  assert.equal(owners(after).get('rail-resource:66'), id(2));
  assert.equal(
    owners(after).get('platform:LL-CITY-ST19:outer_line_platform@LL-CITY-SERVICE-02'),
    id(2),
  );
  assert.equal(validateRailDispatch(after, legacy, fleet), true);
});

function intersect(a, b, dimensions) {
  if (a.z + dimensions.height <= b.z + 1e-6 || b.z + dimensions.height <= a.z + 1e-6) return false;
  const polygon = (t) =>
      [-1, 1].flatMap((x) =>
        [-1, 1].map((y) => ({
          x:
            t.x +
            (Math.cos(t.heading) * x * dimensions.length) / 2 -
            (Math.sin(t.heading) * y * dimensions.width) / 2,
          y:
            t.y +
            (Math.sin(t.heading) * x * dimensions.length) / 2 +
            (Math.cos(t.heading) * y * dimensions.width) / 2,
        })),
      ),
    A = polygon(a),
    B = polygon(b);
  for (const t of [a, b])
    for (const angle of [t.heading, t.heading + Math.PI / 2]) {
      const project = (p) => p.x * Math.cos(angle) + p.y * Math.sin(angle),
        p = A.map(project),
        q = B.map(project);
      if (Math.max(...p) <= Math.min(...q) + 1e-6 || Math.max(...q) <= Math.min(...p) + 1e-6)
        return false;
    }
  return true;
}
function run(world, { snapshot = null, additional = 5 } = {}) {
  const model = createTransit(world);
  if (snapshot)
    Object.assign(model, {
      time: snapshot.time,
      trains: clone(snapshot.fleet),
      events: clone(snapshot.recentEvents),
      eventSequence: snapshot.recentEvents.at(-1)?.id ?? 0,
    });
  validateTransit(model, world);
  let dispatcher = createRailDispatcher(
    world,
    model.trains,
    snapshot ? clone(snapshot.signals) : null,
  );
  const physical = createRailClearance(world),
    start = model.time,
    initial = model.trains.map((t) => t.circuits),
    dimensions = dispatcher.snapshot().dimensions,
    advanced = new Map(model.trains.map((t) => [t.id, model.time]));
  let lastGlobal = model.time,
    restoreCount = 0,
    moves = 0;
  const assertBodies = () => {
    for (let i = 0; i < model.trains.length; i++)
      for (let j = i + 1; j < model.trains.length; j++)
        assert.equal(
          intersect(model.trains[i], model.trains[j], dimensions),
          false,
          'Independent oriented bodies cannot overlap',
        );
  };
  const ctx = {
    canDepart: (r) => dispatcher.canDepart(r),
    canMoveTrain: (r) => {
      assert.equal(physical(r), true, 'Actual static train clearance stays valid');
      return dispatcher.canMoveTrain(r);
    },
    onTrainMove: () => {
      moves++;
      assertBodies();
    },
  };
  while (
    model.time - start < 14000 &&
    !model.trains.every((t, i) => t.circuits >= initial[i] + additional)
  ) {
    const before = model.trains.map((t) => ({ x: t.x, y: t.y, z: t.z, visits: t.visits }));
    dispatcher.beginStep(model.trains, model.time);
    updateTransit(model, world, 0.25, ctx);
    dispatcher.endStep(model.trains, model.time);
    for (let i = 0; i < model.trains.length; i++) {
      const t = model.trains[i],
        b = before[i];
      if (t.visits !== b.visits || Math.hypot(t.x - b.x, t.y - b.y, t.z - b.z) > 1e-6) {
        advanced.set(t.id, model.time);
        lastGlobal = model.time;
      }
      assert(model.time - advanced.get(t.id) <= 900, `Service starvation: ${t.id}`);
    }
    assert(
      model.time - lastGlobal <= 120,
      'Whole fleet cannot stall for120 actual simulation seconds',
    );
    assertBodies();
    if (restoreCount < 2 && model.time - start >= [2200, 4800][restoreCount]) {
      const bytes = JSON.stringify(model),
        signals = dispatcher.snapshot(),
        restored = restoreTransit(bytes, world),
        restoredSignals = restoreRailDispatch(signals, world, restored.trains);
      Object.assign(model, restored);
      dispatcher = createRailDispatcher(world, model.trains, restoredSignals);
      assert.equal(JSON.stringify(model), bytes);
      restoreCount++;
    }
  }
  assert(
    model.trains.every((t, i) => t.circuits >= initial[i] + additional),
    JSON.stringify(model.trains),
  );
  assert.equal(restoreCount, 2);
  assert(moves > 10000);
  assert.deepEqual(model.callbackErrors, [], 'Native inner-step body checks cannot be swallowed');
  assert.equal(validateTransit(model, world), true);
  assert.equal(validateRailDispatch(dispatcher.snapshot(), world, model.trains), true);
}
test('all four actual current-world services sustain at least five circuits each with physical safety and two saves', () =>
  run(worlds.WORLD));
test('the exact published all-held fleet resumes for five further circuits each without a fleet reset', () =>
  run(legacy, { snapshot: fixtures.cases.find((c) => c.label === 'published2478') }));
