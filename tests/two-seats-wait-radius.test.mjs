/** Actual shared escort arrival on an explicitly synthetic flat physical context.
 * This verifies the runtime/physical disk contract, not Harbor City car clearance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/companions.js';
import { prepareTwoSeatsStart } from '../src/campaign/two-seats-runtime.js';
const N = 'LL-CHAR-008',
  target = { x: 368, y: 143, z: 0, sceneId: null };
function fixture(x) {
  const s = {
      time: 0,
      sequence: 0,
      player: { x: 400, y: 143, z: 0, health: 100 },
      vehicles: [],
      wanted: { level: 0 },
      campaign: { completed: { 'LL-ST-002': {} }, active: null, suspended: [] },
    },
    cc = {
      specs: {},
      sceneExists: (id) => id === null,
      isBlocked: () => false,
      hasLineOfSight: () => true,
      surfaceHeight: () => 0,
      findRoute: (_a, to) => [{ ...to }],
      moveBody: (a, dx, dy) => {
        a.x += dx;
        a.y += dy;
        return false;
      },
      resolveActor: (id) => (id === 'player' ? s.player : C.getActor(s, id)),
    };
  C.ensureNamedActor(s, { id: N, name: 'Nadia', x, y: 143, z: 0, sceneId: null, health: 73 }, cc);
  const p = {
    ready: { geometry: true },
    bindings: {
      'boardwalk-station': {
        ready: true,
        existingNadiaWait: target,
        nadiaFromDocksideStreet: [target],
      },
    },
    passengers: C,
    companionContext: cc,
  };
  const physicalStep = () => {
    s.time += 0.05;
    C.updateCompanions(s, 0.05, cc);
  };
  return { s, p, physicalStep };
}
test('old wait pose seven units from the new mark is not ready and queues the actual four-unit escort disk', () => {
  const f = fixture(361),
    before = structuredClone(C.getActor(f.s, N));
  const result = prepareTwoSeatsStart(f.s, f.p);
  assert.equal(result.ready, false);
  assert.equal(f.s.twoSeatsRuntime.preparation.nadia.ready, false);
  const actor = C.getActor(f.s, N),
    record = f.s.companions.records.find((r) => r.id === N);
  assert.equal(actor.x, before.x);
  assert.equal(actor.y, before.y);
  assert.equal(actor.health, 73);
  assert.equal(record.order.kind, 'escort');
  assert.equal(record.order.target.radius, 4);
});
test('actual shared escort stops at four units and that inclusive physical boundary becomes ready without pose edits', () => {
  const f = fixture(361);
  assert.equal(prepareTwoSeatsStart(f.s, f.p).ready, false);
  f.physicalStep();
  assert.equal(prepareTwoSeatsStart(f.s, f.p).ready, false);
  for (let n = 0; n < 10 && !C.companionObservation(f.s, N).arrived; n++) f.physicalStep();
  const observed = C.companionObservation(f.s, N);
  assert.equal(observed.arrived, true);
  assert(Math.abs(Math.hypot(observed.x - target.x, observed.y - target.y) - 4) < 1e-6);
  assert.equal(prepareTwoSeatsStart(f.s, f.p).ready, true);
  assert.equal(C.getActor(f.s, N).health, 73);
});
test('a pose strictly outside the accepted four-unit disk stays unready; exact boundary is admitted', () => {
  const outside = fixture(368 - 4.0001),
    boundary = fixture(364);
  assert.equal(prepareTwoSeatsStart(outside.s, outside.p).ready, false);
  assert.equal(prepareTwoSeatsStart(boundary.s, boundary.p).ready, true);
});
