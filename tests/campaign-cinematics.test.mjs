import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain } from '../src/terrain.js';
import { createSurfaceMovement } from '../src/surface-movement.js';
import {
  startCinematic,
  skipCinematic,
  tickCinematics,
  cinematicFinished,
  cinematicView,
  validateCinematics,
} from '../src/campaign/cinematics.js';
function fixture(blocked = false) {
  const terrain = createTerrain({
      bounds: { left: -100, top: -100, right: 200, bottom: 200 },
      roads: [],
      obstacles: [],
      buildings: blocked ? [{ x: 30, y: -30, w: 2, h: 60, height: 50 }] : [],
    }),
    movement = createSurfaceMovement(terrain);
  const state = {
    time: 0,
    player: { id: 'mara-voss', x: 0, y: 0, z: 0, groundZ: 0, health: 100, sceneId: null },
  };
  const config = {
    id: 'arrival',
    sceneId: null,
    phases: [
      {
        id: 'walk',
        holdSeconds: 0,
        tracks: [{ actorId: 'mara-voss', points: [{ x: 60, y: 0, z: 0 }], speed: 30 }],
        camera: { actorId: 'mara-voss', offset: { x: 10, y: 0, z: 5 } },
      },
      {
        id: 'reunion',
        holdSeconds: 0.5,
        dialogueReady: true,
        tracks: [],
        camera: { focus: { x: 60, y: 0, z: 10 } },
      },
    ],
  };
  let calls = 0;
  const context = {
    sequence: (id) => (id === 'arrival' ? config : null),
    actor: (id) => (id === 'mara-voss' ? state.player : null),
    moveActor(id, dx, dy, radius) {
      calls++;
      movement.moveBody(state.player, dx, dy, radius);
    },
  };
  return {
    state,
    context,
    config,
    get calls() {
      return calls;
    },
  };
}
test('scene staging uses shared collision movement and only completes after the actual walk and reunion hold', () => {
  const f = fixture();
  assert.equal(startCinematic(f.state, 'arrival', 'arrival:1', f.context).ok, true);
  tickCinematics(f.state, 0.5, f.context);
  assert.equal(f.state.player.x, 15);
  assert.equal(cinematicFinished(f.state, 'arrival'), false);
  assert.equal(cinematicView(f.state, f.context).focus.x, 25);
  for (let i = 0; i < 5; i++) tickCinematics(f.state, 0.5, f.context);
  assert.equal(cinematicFinished(f.state, 'arrival', 'arrival:1'), true);
  assert.equal(f.state.player.x, 60);
  assert.ok(f.calls >= 20);
  assert.equal(startCinematic(f.state, 'arrival', 'arrival:1', f.context).replayed, true);
});
test('skip accelerates real collision-checked travel and cannot pass a wall or invent completion', () => {
  const f = fixture(true);
  startCinematic(f.state, 'arrival', 'arrival:1', f.context);
  skipCinematic(f.state);
  for (let i = 0; i < 20; i++) tickCinematics(f.state, 0.1, f.context);
  assert.ok(f.state.player.x <= 23);
  assert.equal(cinematicFinished(f.state, 'arrival'), false);
  assert.equal(f.state.cinematics.active.blocked, 'physical-route-blocked');
});
test('mid-scene JSON continuation preserves route progress and same physical ending', () => {
  const f = fixture();
  startCinematic(f.state, 'arrival', 'arrival:1', f.context);
  tickCinematics(f.state, 0.3, f.context);
  const saved = JSON.stringify(f.state),
    g = fixture();
  Object.assign(g.state, JSON.parse(saved));
  validateCinematics(g.state, g.context);
  for (let i = 0; i < 30; i++) {
    tickCinematics(f.state, 0.1, f.context);
    tickCinematics(g.state, 0.1, g.context);
  }
  assert.deepEqual(g.state, f.state);
});
test('actors in another room or unavailable authored scenes cannot be staged at ghost coordinates', () => {
  const f = fixture();
  f.state.player.sceneId = 'dockside-rooms';
  assert.equal(
    startCinematic(f.state, 'arrival', 'arrival:1', f.context).reason,
    'actor-unavailable',
  );
  assert.equal(startCinematic(f.state, 'unknown', 'arrival:1', f.context).ok, false);
});
test('Continue rejects altered cinematic routes, unsafe receipts and out-of-range progress', () => {
  const f = fixture();
  startCinematic(f.state, 'arrival', 'arrival:1', f.context);
  f.state.cinematics.active.tracks = { 0: { index: 5, blockedFor: 0 } };
  assert.throws(() => validateCinematics(f.state, f.context), /route progress/);
  f.state.cinematics.active.tracks = {};
  f.state.cinematics.active.receipt = '__proto__';
  assert.throws(() => validateCinematics(f.state, f.context), /playback/);
  f.state.cinematics.active.receipt = 'arrival:1';
  f.config.phases[0].tracks[0].points[0].x = 70;
  assert.throws(() => validateCinematics(f.state, f.context), /playback/);
});
