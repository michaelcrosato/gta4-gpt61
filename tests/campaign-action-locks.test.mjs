import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSimulation,
  fireWeapon,
  jumpOrVault,
  toggleCover,
  leaveStory,
  WORLD,
  TERRAIN,
} from '../src/simulation.js';
import { enterInterior } from '../src/interiors.js';
import { createSceneContext } from '../src/scene-context.js';
import {
  applyStoryInventoryEffect,
  useShelterService,
  tickShelterServices,
} from '../src/campaign/shelter-services.js';

// Service approach/key ownership are explicitly declared component fixtures.
// Real room collision/LOS and the actual service ledger start each lock; these
// are public-action regressions, not a natural campaign playthrough.
function serviceFixture(kind) {
  const state = createSimulation({ seed: 61, campaign: true });
  assert.equal(leaveStory(state).ok, true);
  assert.equal(state.cinematics.active, null);
  applyStoryInventoryEffect(
    state,
    { type: 'grant-key', id: 'dockside-tenancy' },
    'action-lock-fixture:key',
  );
  Object.assign(state.player, WORLD.campaignSceneBindings['dockside-rooms'].entry, {
    z: 0,
    groundZ: 0,
    sceneId: null,
  });
  assert.equal(enterInterior(state, 'dockside-rooms-entry', { world: WORLD }).ok, true);
  Object.assign(state.player, kind === 'food' ? { x: 100, y: 162 } : { x: 100, y: 86 });
  assert.equal(
    createSceneContext(WORLD, TERRAIN)
      .queries(state)
      .isBlocked(state.player.x, state.player.y, 7, 0),
    false,
  );
  const result = useShelterService(
    state,
    kind,
    { id: `action-lock-fixture:${kind}` },
    { canRest: () => true },
  );
  assert.equal(result.ok, true);
  assert.equal(state.shelterServices.active.kind, kind);
  return state;
}

test('public jump/vault and fire reject action-shelf bypasses during a real arrival cinematic', () => {
  for (const action of [
    fireWeapon,
    jumpOrVault,
    toggleCover,
    (state) => jumpOrVault(state, { vaultOnly: true }),
  ]) {
    const state = createSimulation({ seed: 61, campaign: true });
    assert(state.cinematics.active);
    const before = JSON.stringify(state);
    assert.equal(action(state), false);
    assert.equal(
      JSON.stringify(state),
      before,
      'Locked direct actions cannot spend stamina/ammo or start physics/attacks',
    );
  }
});

test('public jump/fire cannot bypass real pending food/rest service locks', () => {
  for (const kind of ['food', 'rest']) {
    const state = serviceFixture(kind),
      before = JSON.stringify(state);
    assert.equal(jumpOrVault(state), false);
    assert.equal(fireWeapon(state), false);
    assert.equal(toggleCover(state), false);
    assert.equal(JSON.stringify(state), before);
    for (let i = 0; i < 4; i++) tickShelterServices(state, 0.5, { canRest: () => true });
    assert.equal(state.shelterServices.active, null);
    assert.equal(
      fireWeapon(state),
      true,
      'Physical service completion releases ordinary player attacks',
    );
    assert.equal(jumpOrVault(state), true, 'Physical service completion releases ordinary jumps');
  }
});

test('actual food service releases desk cover only when its physical eating action has finished', () => {
  const state = serviceFixture('food');
  assert.equal(toggleCover(state), false);
  assert.equal(state.player.cover, null);
  for (let i = 0; i < 3; i++) tickShelterServices(state, 0.5, { canRest: () => true });
  assert.equal(toggleCover(state), true);
  assert.equal(state.player.cover.volumeId, 'dockside-save-desk');
});

test('ordinary free movement retains jump/fire after a scene is genuinely cancelled', () => {
  const state = createSimulation({ seed: 61, campaign: true });
  assert.equal(leaveStory(state).ok, true);
  assert.equal(state.cinematics.active, null);
  assert.equal(jumpOrVault(state), true);
  assert.equal(fireWeapon(state), true);
});
