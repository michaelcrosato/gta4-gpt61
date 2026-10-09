import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD } from '../src/world.js';
import { createSceneBodyClearance } from '../src/scene-body-clearance.js';
import { createSceneContext } from '../src/scene-context.js';
import {
  initializeInteriors,
  INTERIOR_LAYOUTS,
  setInteriorDoor,
  damageInteriorProp,
} from '../src/interiors.js';
const full = createSceneBodyClearance(WORLD);
const fixture = () => {
  const s = {
    time: 0,
    player: { x: 168, y: 198, z: 0, groundZ: 0, sceneId: 'voss-dispatch', health: 100 },
    vehicles: [],
    hostiles: [],
    police: [],
    pedestrians: [],
  };
  initializeInteriors(s);
  s.interior.active = { roomId: 'voss-dispatch' };
  return s;
};
test('same full-body adapter drives actual scene walking and planner queries in Dispatch', () => {
  const state = fixture(),
    scene = createSceneContext(WORLD, full.exterior.terrain, { canMoveBody: full.canMoveBody });
  const start = { ...state.player };
  assert.equal(
    full.sweep(
      state,
      start,
      { x: 168, y: 110, z: 0 },
      { sceneId: 'voss-dispatch', radius: 7, height: 30 },
    ).clear,
    true,
  );
  assert.equal(scene.moveBody(state, state.player, 0, -88, 7), false);
  assert.ok(Math.abs(state.player.y - 110) < 1e-9);
  assert.equal(scene.moveBody(state, state.player, 0, -50, 7), true);
  assert.ok(state.player.y > 93, 'real desk still blocks');
});
test('current destructible props and actual open door aperture are used without stale room geometry', () => {
  const state = fixture(),
    room = INTERIOR_LAYOUTS['voss-dispatch'],
    door = room.doors.find((d) => d.exit);
  assert.equal(
    full.sweep(state, { x: 168, y: 198, z: 0 }, { x: 168, y: 244, z: 0 }, { sceneId: room.id })
      .clear,
    false,
  );
  setInteriorDoor(state, door.id, { open: true });
  assert.equal(
    full.sweep(state, { x: 168, y: 198, z: 0 }, { x: 168, y: 244, z: 0 }, { sceneId: room.id })
      .clear,
    true,
  );
  const prop = room.props.find((p) => p.health > 0),
    at = { x: prop.x + prop.w / 2, y: prop.y + prop.h / 2, z: 0 };
  assert.equal(full.inspect(state, at).clear, false);
  damageInteriorProp(state, prop.id, 1000);
  assert.equal(full.inspect(state, at).clear, true);
});
test('room roof limits rising standing bodies and never shrinks or teleports the body', () => {
  const state = fixture(),
    b = { x: 168, y: 198, z: 35, height: 30, radius: 7 };
  const r = full.limitRise(state, b, 60, { sceneId: 'voss-dispatch' });
  assert.equal(r.ceiling, 72);
  assert.equal(r.z, 42);
  assert.equal(r.hit, true);
  assert.equal(full.inspect(state, { ...b, z: r.z }).clear, true);
  assert.equal(full.inspect(state, { ...b, z: r.z + 0.001 }).clear, false);
  assert.equal(b.z, 35);
  assert.equal(b.height, 30);
  assert.throws(() => full.limitRise(state, b, NaN));
});
test('scene identity and standing negative chamber boundaries cannot masquerade as checked access', () => {
  const s = fixture();
  assert.throws(() => full.inspect(s, { x: 0, y: 0 }, { sceneId: 'missing' }));
  assert.equal(full.inspect(s, { x: 458, y: 700, z: 0 }, { sceneId: null }).clear, true);
  assert.equal(full.inspect(s, { x: 458, y: 700, z: -18 }, { sceneId: null }).clear, false);
});
