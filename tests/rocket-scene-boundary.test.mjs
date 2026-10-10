import test from 'node:test';
import assert from 'node:assert/strict';
import { updateOrdnance } from '../src/combat.js';

function rocketFlight(playerSceneId, rocketSceneId) {
  const state = {
    time: 0,
    player: { x: 50, y: 50, z: 0, health: 100, sceneId: playerSceneId },
    hostiles: [],
    police: [],
    pedestrians: [],
    vehicles: [],
    pickups: [],
    fires: [],
    combatEffects: [],
    ordnance: [
      {
        id: 'enemy-rocket',
        sceneId: rocketSceneId,
        weapon: 'rpg',
        kind: 'rocket',
        x: 20,
        y: 50,
        z: 10,
        groundZ: 0,
        vx: 235,
        vy: 0,
        vz: 0,
        remaining: 2,
        damage: 175,
        radius: 68,
        owner: 'enemy',
      },
    ],
  };
  let sequence = 0;
  updateOrdnance(state, 0.2, {
    sceneId: rocketSceneId,
    surfaceHeight: () => 0,
    isBlocked: () => false,
    hasLineOfSight: (_from, to) => to !== state.player || playerSceneId === rocketSceneId,
    damagePlayer: (amount) => (state.player.health = Math.max(0, state.player.health - amount)),
    id: () => `effect-${++sequence}`,
  });
  return state;
}

test('rockets pass the matching coordinates of a player in another physical scene', () => {
  for (const [playerScene, rocketScene] of [
    ['lantern-bar', null],
    [null, 'lantern-bar'],
    ['voss-dispatch', 'lantern-bar'],
  ]) {
    const state = rocketFlight(playerScene, rocketScene);
    assert.equal(state.ordnance.length, 1);
    assert.equal(state.ordnance[0].x, 67);
    assert.equal(state.combatEffects.length, 0);
    assert.equal(state.player.health, 100);
  }
});

test('rockets retain swept contact with a player in the same physical scene', () => {
  for (const scene of [null, 'lantern-bar']) {
    const state = rocketFlight(scene, scene);
    assert.equal(state.ordnance.length, 0);
    assert.equal(state.combatEffects[0].type, 'explosion');
    assert.equal(state.combatEffects[0].x, 42);
    assert.ok(state.player.health < 100);
  }
});
