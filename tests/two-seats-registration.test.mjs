import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD, TWO_SEATS_GEOMETRY_REPORT as report } from '../src/world.js';
import { INTERIOR_LAYOUTS, PORTAL_DEFINITIONS } from '../src/interiors.js';
import {
  TWO_SEATS_PORTALS,
  TWO_SEATS_CLOSED_ACCESS,
} from '../src/campaign/two-seats-registration.js';
import { createSceneBodyClearance } from '../src/scene-body-clearance.js';
import { createSceneContext } from '../src/scene-context.js';
import {
  createSimulation,
  updateSimulation,
  interact,
  nearestInteractable,
  saveGame,
  restoreGame,
  MISSIONS,
} from '../src/simulation.js';
const full = createSceneBodyClearance(WORLD);
test('exact authored site aliases and actual room/portal registry produce checked geometry readiness separate from art/gameplay', () => {
  assert.equal(report.registrationReady, true);
  assert.equal(report.geometryReady, true);
  assert.equal(report.ready, true);
  assert.equal(report.artReady, false);
  assert.equal(report.gameplayReady, false);
  assert.equal(report.runtimeReady, false);
  for (const p of TWO_SEATS_PORTALS) {
    assert.deepEqual(
      PORTAL_DEFINITIONS.find((x) => x.id === p.id),
      p,
    );
    const b = WORLD.campaignSceneBindings[p.roomId],
      l = WORLD.locations.find((l) => l.id === p.locationId);
    assert.equal(l.siteId, p.siteId);
    assert.deepEqual([l.x, l.y], [b.entry.x, b.entry.y]);
    assert.ok(INTERIOR_LAYOUTS[p.roomId]);
  }
  assert.ok(Object.keys(report.geometry.checks).length >= 20);
});
test('unavailable station gates have real collision while original Metro access remains present', () => {
  const b = WORLD.campaignSceneBindings['boardwalk-station'];
  assert.equal(b.stationId, 'LL-CITY-ST01');
  assert.deepEqual([b.catalogueAnchor.x, b.catalogueAnchor.y], [429, 113]);
  for (const g of TWO_SEATS_CLOSED_ACCESS) {
    assert.equal(
      full.inspect({}, { x: g.x + 0.375, y: g.y + g.h / 2, z: 0 }, { sceneId: null }).clear,
      false,
    );
    assert.ok(WORLD.obstacles.some((o) => o.id === g.id));
  }
  for (const id of b.retainOperatingAccessPathIds)
    assert.ok(WORLD.transit.accessPaths.some((p) => p.id === id));
});
test('registered M3 exterior and interior paths use the same full-body callback as production scene movement', () => {
  const scene = createSceneContext(WORLD, full.exterior.terrain, { canMoveBody: full.canMoveBody }),
    s = {
      time: 0,
      player: { x: 0, y: 0, z: 0, health: 100 },
      vehicles: [],
      interior: { active: null },
    };
  for (const key of ['nadiaBoard', 'tessBoard', 'nadiaFromDocksideStreet']) {
    const path = WORLD.campaignSceneBindings['boardwalk-station'][key],
      actor = { ...path[0], groundZ: 0, collisionHeight: 30 };
    for (let i = 1; i < path.length; i++) {
      const b = path[i];
      assert.equal(full.sweep(s, actor, b, { sceneId: null, height: 30, radius: 7 }).clear, true);
      assert.equal(scene.moveBody(s, actor, b.x - actor.x, b.y - actor.y, 7, { state: s }), false);
    }
    assert.ok(Math.hypot(actor.x - path.at(-1).x, actor.y - path.at(-1).y) < 1e-8);
  }
});
for (const [id, x, moveX] of [
  ['tess-flat', 745, -1],
  ['pier-goods', 215, 1],
])
  test(`${id} actual shared input enters, saves, continues and exits through its real open doorway`, () => {
    let s = createSimulation(314);
    s.mission = null;
    s.dialogue = null;
    s.progress.completed = MISSIONS.map((m) => m.id);
    Object.assign(s.player, { x, y: 308, z: 0, groundZ: 0 });
    const initialHealth = s.player.health;
    for (let i = 0; i < 11; i++) {
      updateSimulation(s, 1 / 60, { moveX });
      assert.equal(full.inspect(s, s.player, { sceneId: null, height: 30, radius: 7 }).clear, true);
    }
    assert.equal(nearestInteractable(s).type, 'interior-portal');
    assert.equal(interact(s).type, 'enter');
    assert.equal(s.interior.active.roomId, id);
    const origin = { ...s.interior.active.exterior };
    s = restoreGame(saveGame(s));
    assert.deepEqual(s.interior.active.exterior, origin);
    for (let i = 0; i < 120 && s.interior.active; i++) {
      assert.equal(full.inspect(s, s.player, { sceneId: id, height: 30, radius: 7 }).clear, true);
      updateSimulation(s, 1 / 60, { moveY: 1 });
    }
    assert.equal(s.interior.active, null);
    assert.equal(full.inspect(s, s.player, { sceneId: null, height: 30, radius: 7 }).clear, true);
    assert.equal(s.player.health, initialHealth);
    assert.ok(Math.hypot(s.player.x - origin.x, s.player.y - origin.y) < 45);
  });

test('full taxi approach clears actual live waiting bodies at ordinary speed; former Tess mark is a real swept collision', async () => {
  const { checkLateMeterVehicleSweep } = await import('../src/campaign/late-meter-scenes.js');
  const b = WORLD.campaignSceneBindings['boardwalk-station'];
  assert.deepEqual([b.newTessWait.x, b.newTessWait.y], [303, 143]);
  const obstacle = (id, p) => ({ id, x: p.x - 7, y: p.y - 7, w: 14, h: 14, z: 0, height: 30 });
  const check = (tess) =>
    checkLateMeterVehicleSweep(
      {
        ...WORLD,
        obstacles: [
          ...WORLD.obstacles,
          obstacle('nadia', b.existingNadiaWait),
          obstacle('tess', tess),
        ],
      },
      b.approach,
      { length: 29, width: 15, height: 16 },
      { terrain: full.exterior.terrain },
    );
  assert.equal(check(b.newTessWait).clear, true);
  assert.equal(
    check({ x: 344, y: 143 }).clear,
    false,
    'ordinary moving taxi overlaps former living Tess body; no speed cap may hide it',
  );
  assert.deepEqual(b.boardingOrder, ['LL-CHAR-008', 'LL-CHAR-025']);
  const nearSegment = (a, b, p) => {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      t = Math.max(
        0,
        Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
      );
    return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
  };
  assert.ok(
    b.tessBoard.slice(1).every((p, i) => nearSegment(b.tessBoard[i], p, b.existingNadiaWait) >= 18),
    'complete rear-door walk also clears the standing Nadia arrival disk',
  );
  for (const p of b.tessBoard) {
    assert.ok(Math.hypot(p.x - b.pickupPose.x, p.y - b.pickupPose.y) > 7);
  }
});
