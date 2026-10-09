import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSimulation,
  updateSimulation,
  interact,
  nearestInteractable,
  saveGame,
  restoreGame,
  MISSIONS,
  WORLD,
} from '../src/simulation.js';
import { createBodyClearance } from '../src/body-clearance.js';
import { DISPATCH_WORLD_MIGRATION as M } from '../src/dispatch-save-migration.js';
const clearance = createBodyClearance(WORLD);
const body = (s) => ({ x: s.player.x, y: s.player.y, z: s.player.z ?? 0, radius: 7, height: 30 });
function tick(state, seconds, input) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const old = body(state);
    updateSimulation(state, 1 / 60, input);
    if (!state.interior.active) {
      assert.equal(clearance.inspect(body(state)).clear, true, JSON.stringify(body(state)));
      if (!state.scene?.id || state.scene.kind !== 'interior')
        assert.equal(clearance.sweep(old, body(state)).clear, true);
    }
  }
}
function declaredCurb() {
  const s = createSimulation(314);
  s.mission = null;
  s.dialogue = null;
  s.progress.completed = MISSIONS.map((m) => m.id);
  Object.assign(s.player, { x: 440, y: 700, z: 0, groundZ: 0, angle: 0 });
  return s;
}
test('shared normal movement reaches real Dispatch portal, saves inside and physically walks out with standing native headroom', () => {
  let s = declaredCurb();
  assert.equal(clearance.inspect(body(s)).clear, true);
  tick(s, 0.18, { moveX: 1 });
  assert.ok(s.player.x > 445 && s.player.x < 458);
  assert.equal(nearestInteractable(s).type, 'interior-portal');
  assert.equal(interact(s).type, 'enter');
  assert.equal(s.interior.active.roomId, 'voss-dispatch');
  const exterior = { ...s.interior.active.exterior },
    health = s.player.health,
    saved = saveGame(s);
  s = restoreGame(saved);
  assert.deepEqual(s.interior.active.exterior, exterior);
  assert.equal(s.player.health, health);
  tick(s, 0.27, { moveY: 1 });
  assert.equal(nearestInteractable(s).type, 'door');
  interact(s);
  assert.equal(s.interior.rooms['voss-dispatch'].doors['front-door'].open, true);
  // Normal held walking traverses the actual open door; no exitInterior/destination setter.
  for (let i = 0; i < 120 && s.interior.active; i++) updateSimulation(s, 1 / 60, { moveY: 1 });
  assert.equal(s.interior.active, null);
  assert.ok(Math.hypot(s.player.x - exterior.x, s.player.y - exterior.y) < 45);
  assert.equal(clearance.inspect(body(s)).clear, true);
  assert.equal(s.player.health, health);
  const resumed = restoreGame(saveGame(s));
  assert.equal(resumed.transit.topology, M.toTransit);
  assert.deepEqual(body(resumed), body(s));
});

test('fresh current-geometry whole save restores byte-identically with the exported geometry marker', () => {
  const state = createSimulation(73);
  assert.equal(state.worldGeometryVersion, M.id);
  const saved = saveGame(state),
    restored = restoreGame(saved);
  assert.equal(saveGame(restored), saved);
});
