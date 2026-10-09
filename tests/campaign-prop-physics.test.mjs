import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSimulation,
  updateSimulation,
  fireWeapon,
  saveGame,
  restoreGame,
  WORLD,
  TERRAIN,
  WEAPONS,
} from '../src/simulation.js';
import { acquireWeapon } from '../src/combat.js';
import { ensureNamedActor } from '../src/companions.js';
import { enterInterior } from '../src/interiors.js';
import {
  LATE_METER_APPEARANCES,
  LATE_METER_CLIPBOARD,
  lateMeterPropDescriptors,
  traceLateMeterClipboard,
  closestLateMeterClipboardPoint,
} from '../src/campaign/late-meter-scenes.js';
import { initializeCampaignParentState } from '../src/campaign/parent-context.js';
import { initializeLateMeterParentState } from '../src/campaign/late-meter-parent-context.js';

// Declared physical fixtures: the authored static WORLD, a minimal population,
// finite supplied ammo and an explicitly registered clipboard. All harm below
// uses public fire/held-input simulation physics. No mission completion is earned.
const BASE = createSimulation(441);
const PROP_RECEIPT = 'late-meter:prop:reeve-repossession-clipboard';
function fixture() {
  const state = structuredClone(BASE);
  state.mission = null;
  state.dialogue = null;
  state.vehicles = [];
  state.hostiles = [];
  state.pedestrians = [];
  state.police = [];
  state.policeAircraft = [];
  state.companions = { version: 1, time: 0, actors: [], records: [], events: [], sequence: 0 };
  Object.assign(state.player, {
    x: 780,
    y: 696,
    z: 0,
    groundZ: 0,
    angle: 0,
    vehicleId: null,
    sceneId: null,
  });
  assert.equal(TERRAIN.isBlocked(780, 696, 7, 0), false);
  initializeCampaignParentState(state);
  initializeLateMeterParentState(state);
  const actor = ensureNamedActor(state, {
    id: 'LL-ARC-REEVE',
    x: 824,
    y: 700,
    z: 0,
    sceneId: null,
    angle: Math.PI,
    health: 1000,
    maxHealth: 1000,
    appearance: structuredClone(LATE_METER_APPEARANCES.reeve),
  });
  const prop = structuredClone(LATE_METER_CLIPBOARD);
  state.campaignRuntime.sceneProps[prop.id] = prop;
  state.lateMeterEffects.receipts[PROP_RECEIPT] = {
    id: PROP_RECEIPT,
    kind: 'scene-prop',
    status: 'committed',
    time: 0,
    scope: {
      missionId: 'LL-ST-002',
      stageId: 'lookout',
      attempt: 1,
      activationReceipt: 'prop-physics:declared-registration',
    },
    propId: prop.id,
  };
  const scope = state.lateMeterEffects.receipts[PROP_RECEIPT].scope;
  state.lateMeterRuntime.activations[scope.activationReceipt] = {
    scope: structuredClone(scope),
    at: 0,
  };
  return { state, actor, prop };
}
function tick(state, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds * 60); i++) updateSimulation(state, 1 / 60, input);
}
function equip(state, weapon, ammo = 3) {
  acquireWeapon(state, weapon, ammo);
  state.player.fireCooldown = 0;
  state.player.reloadRemaining = 0;
  state.player.recoil = 0;
}
function aim(state, target) {
  state.player.angle = Math.atan2(target.y - state.player.y, target.x - state.player.x);
  state.player.aimTarget = { ...target };
  state.player.aiming = true;
}
function drop(prop, { x = 820, y = 696, z = 0.4, angle = 0, sceneId = null } = {}) {
  Object.assign(prop, { state: 'dropped', ownerActorId: null, x, y, z, angle, sceneId });
}

test('exact board traces agree with independent finite panel extents through all orientations', () => {
  for (const state of ['carried', 'dropped'])
    for (const angle of [0, Math.PI / 7, Math.PI / 2, Math.PI, 4.9]) {
      const prop = { ...LATE_METER_CLIPBOARD, state, x: 30, y: 50, z: 11, angle };
      const c = Math.cos(angle),
        s = Math.sin(angle),
        tilt = state === 'dropped' ? 1 : 0.35,
        rise = Math.sqrt(1 - tilt * tilt),
        right = [-s, c, 0],
        up = [c * tilt, s * tilt, rise],
        normal = [c * rise, s * rise, -tilt];
      for (const across of [-4, -3, 0, 3, 4])
        for (const along of [-1, 0.5, 4, 8, 9.6]) {
          const plane = [30, 50, 11].map((v, i) => v + across * right[i] + along * up[i]);
          const point = (distance) => {
            const [x, y, z] = plane.map((v, i) => v + normal[i] * distance);
            return { x, y, z };
          };
          const hit = traceLateMeterClipboard(point(5), point(-5), prop);
          const expected = Math.abs(across) < 3.1 && along > 0 && along < 8.6;
          assert.equal(Boolean(hit), expected, `${state}/${angle}/${across}/${along}`);
          if (hit)
            assert.ok(Math.abs(hit.t - 0.46) < 1e-12, 'first contact includes 0.8-unit thickness');
        }
    }
});

test('a dropped board has a thin horizontal slab, with exact closest point above its surface', () => {
  const prop = {
    ...LATE_METER_CLIPBOARD,
    state: 'dropped',
    x: 30,
    y: 50,
    z: 0.4,
    angle: Math.PI / 2,
  };
  const closest = closestLateMeterClipboardPoint({ x: 25, y: 54, z: 10 }, prop);
  assert.ok(Math.abs(closest.x - 26.9) < 1e-12);
  assert.ok(Math.abs(closest.y - 54) < 1e-12);
  assert.ok(Math.abs(closest.z - 0.8) < 1e-12);
  assert.equal(traceLateMeterClipboard({ x: 20, y: 54, z: 4 }, { x: 40, y: 54, z: 4 }, prop), null);
  assert.ok(traceLateMeterClipboard({ x: 20, y: 54, z: 0.6 }, { x: 40, y: 54, z: 0.6 }, prop));
});

test('a public pistol shot hits the visible upper carried form and misses below it', () => {
  for (const [z, shouldHit] of [
    [18, true],
    [8, false],
  ]) {
    const f = fixture();
    equip(f.state, 'pistol');
    // Native board rises from z11 to ~19.06 while leaning toward x817.49.
    // The upper-panel intersection at z18 is near x817.885, y696.
    aim(f.state, { x: 820.5 - ((z - 11) * 0.35) / Math.sqrt(1 - 0.35 ** 2), y: 696, z });
    const clip = f.state.player.ammo.pistol.clip;
    assert.equal(fireWeapon(f.state), true);
    assert.equal(f.state.player.ammo.pistol.clip, clip - 1);
    tick(f.state, 0.1);
    assert.equal((f.prop.health ?? 100) < 100, shouldHit, `shot at height${z}`);
    if (shouldHit) assert.equal(f.prop.health, 100 - WEAPONS.pistol.damage);
    assert.ok(
      f.actor.health < 1000,
      'the same physical trajectory can also strike the living holder',
    );
  }
});

test('public downward fire hits a dropped clipboard while a higher crossing misses its thin slab', () => {
  for (const [z, shouldHit] of [
    [0.6, true],
    [4, false],
  ]) {
    const f = fixture();
    drop(f.prop);
    // The dropped board is no longer held; keep the living former owner out of
    // the shot so his real body cannot intercept the downward trajectory first.
    Object.assign(f.actor, { x: 900, y: 750 });
    equip(f.state, 'pistol');
    aim(f.state, { x: 824, y: 696, z });
    assert.equal(fireWeapon(f.state), true);
    tick(f.state, 0.12);
    assert.equal((f.prop.health ?? 100) < 100, shouldHit, `dropped shot at height${z}`);
  }
});

test('actual melee windup damages a reachable held board but cannot reach an elevated board', () => {
  for (const [height, shouldHit] of [
    [0, true],
    [36, false],
  ]) {
    const f = fixture();
    Object.assign(f.state.player, { x: 800, y: 696 });
    Object.assign(f.actor, { z: height, groundZ: height, scriptControlled: true });
    equip(f.state, 'unarmed', 0);
    assert.equal(fireWeapon(f.state), true);
    tick(f.state, 0.08);
    assert.equal(f.prop.health, undefined, 'attack startup cannot damage a prop');
    tick(f.state, 0.1);
    assert.equal((f.prop.health ?? 100) < 100, shouldHit);
    assert.equal(f.actor.health, 1000, 'holder body remains outside this strike reach');
  }
});

test('the earlier-contact fix does not let a bullet damage a board behind the actual market ledge', () => {
  const f = fixture(),
    ledge = WORLD.obstacles.find((item) => item.id === 'market-service-ledge'),
    x = ledge.x + ledge.w / 2;
  Object.assign(f.state.player, { x, y: ledge.y - 25, angle: Math.PI / 2 });
  Object.assign(f.actor, { x: 900, y: 750 });
  assert.equal(TERRAIN.isBlocked(f.state.player.x, f.state.player.y, 7, 0), false);
  drop(f.prop, { x, y: ledge.y + ledge.h + 0.2, angle: Math.PI / 2 });
  equip(f.state, 'pistol');
  aim(f.state, { x, y: f.prop.y + 4, z: 0.6 });
  assert.equal(fireWeapon(f.state), true);
  tick(f.state, 0.15);
  assert.equal(f.state.bullets.length, 0, 'the real 24-unit-high slab absorbs the projectile');
  assert.equal(
    f.prop.health,
    undefined,
    'an exact board contact beyond an earlier wall is not harm',
  );
});

test('real grenade fuse and surface fire damage the same persistent prop without free reset', () => {
  const grenade = fixture();
  Object.assign(grenade.state.player, { x: 950, y: 696, angle: Math.PI });
  drop(grenade.prop, { x: 810, y: 696 });
  equip(grenade.state, 'grenade', 1);
  assert.equal(fireWeapon(grenade.state), true);
  tick(grenade.state, 1.1);
  assert.equal(grenade.prop.health, undefined, 'a live fuse is not an explosion');
  tick(grenade.state, 2);
  assert.ok((grenade.prop.health ?? 100) < 100);
  assert.equal(grenade.state.ordnance.length, 0);

  const fire = fixture();
  Object.assign(fire.state.player, { x: 780, y: 700, angle: 0 });
  drop(fire.prop, { x: 858, y: 700 });
  equip(fire.state, 'molotov', 1);
  assert.equal(fireWeapon(fire.state), true);
  tick(fire.state, 1.5);
  assert.ok(fire.state.fires.length > 0);
  assert.ok(fire.prop.health < 100);
  const damaged = fire.prop.health;
  tick(fire.state, 0.5);
  assert.ok(fire.prop.health < damaged, 'ongoing physical fire continues committed harm');
  tick(fire.state, 7);
  assert.equal(fire.state.fires.length, 0);
  assert.equal(fire.prop.state, 'destroyed');
  assert.equal(fire.prop.health, 0);
  assert.equal(fire.prop.visible, false);
  assert.deepEqual(lateMeterPropDescriptors(fire.state), []);
});

test('holder death physically drops the existing board once and never re-equips or revives it', () => {
  const f = fixture();
  f.actor.health = 1;
  equip(f.state, 'pistol');
  aim(f.state, { x: 824, y: 700, z: 13 });
  assert.equal(fireWeapon(f.state), true);
  tick(f.state, 0.1);
  assert.equal(f.actor.health, 0);
  assert.equal(f.prop.state, 'dropped');
  assert.equal(f.prop.ownerActorId, null);
  assert.equal(f.prop.visible, true);
  assert.equal(f.prop.x, 820.5);
  assert.equal(f.prop.y, 696);
  assert.equal(f.prop.z, 0.4);
  const after = structuredClone(f.prop);
  tick(f.state, 0.3);
  assert.deepEqual(f.prop, after);
  assert.equal(f.actor.health, 0);
  assert.equal(lateMeterPropDescriptors(f.state).length, 1);
});

test('the same coordinates in another scene cannot receive the room strike', () => {
  for (const [sceneId, shouldHit] of [
    [null, false],
    ['impound-annex', true],
  ]) {
    const f = fixture();
    Object.assign(f.state.player, { x: 293, y: 389 });
    assert.equal(enterInterior(f.state, 'impound-annex-entry', { world: WORLD }).ok, true);
    Object.assign(f.state.player, { x: 90, y: 144, angle: 0 });
    drop(f.prop, { x: 108, y: 144, sceneId });
    equip(f.state, 'unarmed', 0);
    assert.equal(fireWeapon(f.state), true);
    tick(f.state, 0.2);
    assert.equal((f.prop.health ?? 100) < 100, shouldHit);
  }
});

test('whole physical checkpoint saves preserve prop harm/drop and reject invalid owner/state/scene poses', () => {
  const f = fixture();
  f.state.campaignMode = 'story';
  f.prop.health = 63;
  const payload = saveGame(f.state);
  const restored = restoreGame(payload, { physicalOnly: true });
  assert.equal(restored.campaignRuntime.sceneProps[LATE_METER_CLIPBOARD.id].health, 63);
  assert.equal(
    restored.companions.actors.find((actor) => actor.id === 'LL-ARC-REEVE').health,
    1000,
  );
  const alterations = [
    (s, p) => (p.health = 0),
    (s, p) =>
      Object.assign(p, {
        state: 'destroyed',
        health: 63,
        visible: true,
        ownerActorId: null,
        x: 820,
        y: 696,
        z: 0.4,
        angle: 0,
      }),
    (s, p) => (p.sceneId = 'impound-annex'),
    (s) => {
      s.companions.actors = [];
      s.companions.records = [];
    },
    (s) => delete s.companions.actors[0].appearance,
    (s) => delete s.lateMeterRuntime.activations['prop-physics:declared-registration'],
    (s) =>
      (s.lateMeterRuntime.activations['prop-physics:declared-registration'].scope.stageId =
        'counter'),
    (s, p) => {
      drop(p);
      p.x = WORLD.width + 1;
    },
    (s, p) => {
      drop(p, { sceneId: 'impound-annex' });
      p.x = 500;
    },
  ];
  for (const alter of alterations) {
    const tampered = JSON.parse(payload);
    alter(tampered.state, tampered.state.campaignRuntime.sceneProps[LATE_METER_CLIPBOARD.id]);
    assert.throws(() => restoreGame(tampered, { physicalOnly: true }));
  }
  drop(f.prop);
  const dropped = restoreGame(saveGame(f.state), { physicalOnly: true });
  assert.deepEqual(dropped.campaignRuntime.sceneProps[LATE_METER_CLIPBOARD.id], f.prop);
});

test('legacy full saves validate physical campaign props rather than bypassing their schema', () => {
  const f = fixture();
  drop(f.prop);
  assert.equal(f.state.campaignMode, 'legacy');
  const payload = JSON.parse(saveGame(f.state));
  assert.equal(restoreGame(payload).campaignRuntime.sceneProps[LATE_METER_CLIPBOARD.id].width, 6.2);
  payload.state.campaignRuntime.sceneProps[LATE_METER_CLIPBOARD.id].width = 1e9;
  assert.throws(() => restoreGame(payload));
});
