/** Actual Renderer queue/flush tests with declared art-only initial body poses.
 * Callback view fixtures test art lifetime/ownership; they are not injury or M3 proof.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createSimulation, WORLD } from '../src/simulation.js';
import { ensureNamedActor } from '../src/companions.js';
import { enterInterior } from '../src/interiors.js';
import { createJourneyRenderer } from './helpers/campaign-native-renderer.mjs';
import { RIGHT_WRIST_BANDAGE_ART } from '../src/actor-dressings.js';
const sourceRoot = fileURLToPath(new URL('..', import.meta.url)),
  DAX = 'LL-ARC-DAX';
for (const room of [false, true])
  test(`actual queued ${room ? 'interior' : 'exterior'} dressing preserves canonical body and original full-state callback identity`, async () => {
    const state = createSimulation(61);
    Object.assign(state.player, {
      x: room ? 458 : 1696,
      y: room ? 700 : 842,
      z: room ? 0 : 4,
      groundZ: room ? 0 : 4,
      vehicleId: null,
    });
    if (room) {
      assert.equal(enterInterior(state, 'voss-dispatch-entry', { world: WORLD }).ok, true);
      Object.assign(state.player, { x: 198, y: 40 });
    }
    const actor = ensureNamedActor(state, {
      id: DAX,
      name: 'Dax',
      x: room ? 180 : 1714,
      y: room ? 40 : 842,
      z: room ? 0 : 4,
      sceneId: room ? 'voss-dispatch' : null,
      health: 92,
      weapon: 'unarmed',
      angle: 0,
    });
    const before = JSON.stringify(state),
      seen = [];
    let active = true;
    const native = await createJourneyRenderer(sourceRoot, {
      width: 600,
      height: 420,
      getActorDressing(actual, id) {
        assert.equal(actual, state, 'local scene projection must retain authoritative state');
        if (id !== DAX) return null;
        seen.push({ actorId: id, active });
        return {
          actorId: id,
          hand: 'right',
          active,
          bandageVisible: true,
          bandage: { ...RIGHT_WRIST_BANDAGE_ART },
        };
      },
    });
    try {
      const first = native.draw(state);
      active = false; // A subsequent parent view; saved state/time is never edited.
      const expired = native.draw(state);
      assert.deepEqual(seen, [
        { actorId: DAX, active: true },
        { actorId: DAX, active: false },
      ]);
      assert(first.nativeStats.actors > 0 && expired.nativeStats.actors > 0);
      assert.equal(JSON.stringify(state), before);
      assert.equal(state.companions.actors.filter((body) => body.id === actor.id).length, 1);
      assert.equal(actor.health, 92);
    } finally {
      native.dispose();
    }
  });
