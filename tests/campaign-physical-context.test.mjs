import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORLD,
  TERRAIN,
  VEHICLE_SPECS,
  createSimulation,
  interact,
  updateSimulation,
} from '../src/simulation.js';
import { createSceneContext } from '../src/scene-context.js';
import { findLocalFootPath } from '../src/local-navigation.js';
import { createCampaignPhysicalContext } from '../src/campaign/physical-context.js';
import { createSceneBodyClearance } from '../src/scene-body-clearance.js';
import { INTERIOR_LAYOUTS } from '../src/interiors.js';
import * as companions from '../src/companions.js';
const bindings = WORLD.campaignSceneBindings;
function fixture(options = {}) {
  const state = createSimulation(61);
  state.mission = null;
  state.dialogue = null;
  companions.initializeCompanions(state);
  const context = createCampaignPhysicalContext(state, {
    world: WORLD,
    terrain: TERRAIN,
    specs: VEHICLE_SPECS,
    scenes: createSceneContext(WORLD, TERRAIN),
    localPath: findLocalFootPath,
    ...options,
  });
  return { state, context };
}
test('actual berth apron and ramp let Felix physically reach and occupy the real taxi passenger seat', () => {
  const { state, context } = fixture(),
    b = bindings['pier-berth'];
  const car = {
    ...b.taxiSpawn,
    id: 'arc-arrival-taxi',
    spec: 'taxi',
    groundZ: 0,
    speed: 0,
    health: 120,
    occupied: false,
    kind: 'parked',
    owned: true,
  };
  state.vehicles.push(car);
  Object.assign(state.player, { x: car.x + 20, y: car.y, z: 0, groundZ: 0 });
  companions.ensureNamedActor(
    state,
    {
      id: 'LL-CHAR-002',
      name: 'Felix',
      ...b.target,
      groundZ: b.target.z,
      health: 100,
      sceneId: null,
    },
    context,
  );
  assert.equal(companions.requestBoard(state, 'LL-CHAR-002', car.id, context).ok, true);
  for (let i = 0; i < 500 && !companions.getSeat(state, 'LL-CHAR-002'); i++) {
    state.time += 0.05;
    companions.updateCompanions(state, 0.05, context);
  }
  const seat = companions.getSeat(state, 'LL-CHAR-002');
  assert.ok(seat, 'boarding must finish through actual coast/ramp/vehicle collision');
  assert.equal(seat.seat, 1);
  assert.equal(companions.getActor(state, 'LL-CHAR-002').health, 100);
  companions.validateCompanions(state, context);
  // Isolate the actual occupied-car driving loop from unrelated city traffic.
  state.vehicles = [car];
  state.pedestrians = [];
  assert.equal(interact(state).type, 'vehicle');
  const y = car.y;
  updateSimulation(state, 0.5, { up: true });
  assert.ok(car.y - y > 5 && car.speed > 18, 'the live car must actually accelerate');
  assert.equal(
    companions.getActor(state, 'LL-CHAR-002').health,
    100,
    'a seated passenger is not a pedestrian in front of their own car',
  );
  assert.equal(state.wanted.level, 0, 'ordinary passenger travel must not report hit-and-run');
});
test('home escort authorizes only a reached real portal then walks through the actual room props', () => {
  const { state, context } = fixture(),
    h = bindings['dockside-rooms'];
  state.storyInventory = { keys: ['dockside-tenancy'] };
  companions.ensureNamedActor(
    state,
    {
      id: 'LL-CHAR-002',
      name: 'Felix',
      x: 129,
      y: 300,
      z: 0,
      groundZ: 0,
      sceneId: null,
      health: 100,
    },
    context,
  );
  assert.equal(companions.requestEscort(state, 'LL-CHAR-002', h.felixTarget, context).ok, true);
  for (let i = 0; i < 400; i++) {
    state.time += 0.05;
    companions.updateCompanions(state, 0.05, context);
    if (companions.companionObservation(state, 'LL-CHAR-002').arrived) break;
  }
  const actor = companions.getActor(state, 'LL-CHAR-002');
  assert.equal(actor.sceneId, h.roomId);
  assert.equal(companions.companionObservation(state, 'LL-CHAR-002').arrived, true);
  assert.ok(
    Math.hypot(actor.x - h.felixTarget.x, actor.y - h.felixTarget.y) <= h.felixTarget.radius + 1e-6,
  );
  const before = { ...actor };
  assert.equal(
    context.transitionScene(actor, {
      id: h.portalId,
      radius: 999,
      to: { x: 1, y: 1, z: 0, sceneId: null, health: 1000 },
    }),
    false,
  );
  assert.equal(actor.health, before.health);
});

test('checked foot routing cannot fall back to a feet-only road route beneath a native low deck', () => {
  const { state } = fixture(),
    full = createSceneBodyClearance(WORLD),
    target = { x: 456, y: 320, z: 0, sceneId: null },
    context = createCampaignPhysicalContext(state, {
      world: WORLD,
      terrain: TERRAIN,
      specs: VEHICLE_SPECS,
      scenes: createSceneContext(WORLD, TERRAIN),
      localPath: findLocalFootPath,
      preferLocalFootPaths: () => true,
      isBodyBlocked: (x, y, radius, z, sceneId) =>
        !full.inspect(state, { x, y, radius, z, height: 30 }, { sceneId }).clear,
    }),
    actor = { id: 'route-body', x: 458, y: 700, z: 0, health: 74, sceneId: null },
    before = structuredClone(actor);
  assert.equal(TERRAIN.isBlocked(target.x, target.y, 7, target.z), false);
  assert.equal(full.inspect(state, { ...target, radius: 7, height: 30 }).clear, false);
  assert.equal(context.isBlocked(target.x, target.y, 7, target.z, null), true);
  assert.deepEqual(context.findRoute(actor, target), []);
  assert.deepEqual(actor, before);
});

test('a reached portal still rejects a blocked destination body without changing the actor', () => {
  let blocked = true;
  const { state, context } = fixture({
      isBodyBlocked: (_x, _y, _radius, _z, sceneId) => blocked && sceneId === 'dockside-rooms',
    }),
    room = INTERIOR_LAYOUTS['dockside-rooms'],
    actor = { id: 'portal-body', x: 129, y: 308, z: 0, health: 74, sceneId: null },
    before = structuredClone(actor),
    transition = {
      id: 'dockside-rooms-entry',
      radius: 8,
      to: { ...room.spawn, z: room.floorZ, sceneId: room.id },
    };
  state.storyInventory = { keys: ['dockside-tenancy'] };
  assert.equal(context.transitionScene(actor, transition), false);
  assert.deepEqual(actor, before);
  blocked = false;
  assert.equal(context.transitionScene(actor, transition), true);
  assert.equal(actor.sceneId, room.id);
  assert.equal(actor.health, 74);
});

test('the local route around a desk uses the exact conservative movement sweep at a close corner', () => {
  const { state } = fixture(),
    full = createSceneBodyClearance(WORLD),
    sceneId = 'voss-dispatch',
    actor = { x: 192.809616, y: 44.731878, z: 0, sceneId, health: 100 },
    target = { x: 168, y: 216, z: 0, sceneId },
    context = createCampaignPhysicalContext(state, {
      world: WORLD,
      terrain: TERRAIN,
      specs: VEHICLE_SPECS,
      scenes: createSceneContext(WORLD, TERRAIN),
      localPath: findLocalFootPath,
      preferLocalFootPaths: () => true,
      isBodyBlocked: (x, y, radius, z, id) =>
        !full.inspect(state, { x, y, z, radius, height: 30 }, { sceneId: id }).clear,
      bodySegmentBlocked: (from, to, radius, id) =>
        !full.sweep(state, from, to, { sceneId: id, radius, height: 30 }).clear,
    }),
    path = context.findRoute(actor, target);
  assert(path.length > 1, 'a real desk-safe route must remain available');
  for (let i = 1; i < path.length; i++)
    assert.equal(
      full.sweep(state, path[i - 1], path[i], { sceneId, radius: 7, height: 30 }).clear,
      true,
    );
  assert.equal(actor.x, 192.809616);
  assert.equal(actor.y, 44.731878);
  assert.equal(actor.health, 100);
});
