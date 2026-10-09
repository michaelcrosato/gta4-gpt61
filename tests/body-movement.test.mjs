import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD } from '../src/world.js';
import { createBodyClearance } from '../src/body-clearance.js';
import { createSceneContext } from '../src/scene-context.js';
import { createSurfaceMovement } from '../src/surface-movement.js';
const c = createBodyClearance(WORLD);
const guard = ({ from, to, radius, allowWater }) =>
  c.sweep(from, to, { radius, height: 30, ignoreWater: allowWater }).clear;
test('shared scene/surface walking callbacks enforce actual full-height native deck and support piers', () => {
  const scene = createSceneContext(WORLD, c.terrain, { canMoveBody: guard }),
    state = { interior: { active: null } },
    body = { x: 458, y: 700, z: 0, groundZ: 0 };
  assert.equal(scene.moveBody(state, body, -18, 0, 7), false);
  assert.equal(body.x, 440);
  for (let i = 0; i < 30; i++) scene.moveBody(state, body, 0, -2, 7);
  assert.equal(body.y, 640);
  const pole = { x: 430, y: 660, z: 0, groundZ: 0 };
  let collision = false;
  for (let i = 0; i < 20; i++) collision = scene.moveBody(state, pole, 0, -1, 7) || collision;
  assert.equal(collision, true);
  assert.ok(pole.y > 648, 'native3-wide pier must stop body7 before640');
  assert.equal(c.inspect({ ...pole, radius: 7, height: 30 }).clear, true);
});
test('exact native ceiling clips normal upward integration without lowering body scale or changing XY/health', () => {
  const actor = { x: 458, y: 700, z: 0, radius: 7, height: 30, health: 76 },
    initial = { ...actor },
    roof = c.ceiling(actor.x, actor.y, 0, 7);
  let vz = 94;
  let hits = 0;
  for (let i = 0; i < 60; i++) {
    vz -= 220 / 60;
    const requested = actor.z + vz / 60;
    if (requested > actor.z) {
      const hit = c.limitRise(actor, requested);
      actor.z = hit.z;
      if (hit.hit) {
        vz = 0;
        hits++;
      }
    } else actor.z = Math.max(0, requested);
    assert.equal(c.inspect(actor).clear, true);
    assert.ok(actor.z + 30 <= roof + 1e-9);
  }
  assert.ok(hits > 0);
  assert.equal(actor.z, 0);
  assert.equal(actor.x, initial.x);
  assert.equal(actor.y, initial.y);
  assert.equal(actor.health, 76);
  assert.equal(actor.height, 30);
});
test('movement guard is optional legacy-compatible and strict checked admission cannot be bypassed by undefined', () => {
  const terrain = { isBlocked: () => false, surfaceHeight: () => 0 },
    old = createSurfaceMovement(terrain),
    denied = createSurfaceMovement(terrain, { canMoveBody: () => undefined }),
    a = { x: 0, y: 0, z: 0, groundZ: 0 },
    b = { ...a };
  assert.equal(old.moveBody(a, 10, 0, 7), false);
  assert.equal(a.x, 10);
  assert.equal(denied.moveBody(b, 10, 0, 7), true);
  assert.equal(b.x, 0);
  assert.throws(() => createSurfaceMovement(terrain, { canMoveBody: 3 }));
});

test('exterior scene movement gives conditional body admission the authoritative current world', () => {
  const terrain = { isBlocked: () => false, surfaceHeight: () => 0 },
    state = { interior: { active: null }, standingAllowed: false },
    body = { x: 0, y: 0, z: 0, groundZ: 0 },
    seen = [],
    scene = createSceneContext(WORLD, terrain, {
      canMoveBody(request) {
        seen.push(request.state);
        return request.state === state && state.standingAllowed;
      },
    });
  assert.equal(scene.moveBody(state, body, 5, 0, 7), true);
  assert.equal(body.x, 0);
  state.standingAllowed = true;
  assert.equal(scene.moveBody(state, body, 5, 0, 7, { state: { standingAllowed: false } }), false);
  assert.equal(body.x, 5);
  assert(seen.length >= 2 && seen.every((actual) => actual === state));
});
