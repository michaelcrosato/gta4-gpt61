import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import {
  restoreGame,
  updateSimulation,
  saveGame,
  damageStoryActor,
  setCampaignObservationHandlers,
  WORLD,
  createSimulationCampaignAdapters,
  namedHostilityContext,
} from '../src/simulation.js';
import { startCampaignMission } from '../src/campaign/director.js';
import * as C from '../src/companions.js';
import { TWO_SEATS_APPEARANCES } from '../src/campaign/two-seats-scenes.js';
import { enterInterior } from '../src/interiors.js';
import {
  registerNamedHostile,
  engageNamedHostile,
  requestNamedRetreat,
  releaseNamedHostile,
  isNamedHostile,
  namedHostileObservation,
  validateNamedHostility,
} from '../src/named-hostility.js';
const BASE = restoreGame(
  gunzipSync(
    readFileSync(new URL('./fixtures/campaign-0.6-completed-save.json.gz', import.meta.url)),
  ).toString(),
);
// Genuine completed M1/M2 save. Initial room/actor poses and setup-only M3
// contract adapter below are declared component fixtures, never M3 completion.
function fixture() {
  const s = structuredClone(BASE);
  s.interior.active = null;
  s.scene = { kind: 'exterior', id: 'harbor-city' };
  s.mission = null;
  s.dialogue = null;
  s.player.vehicleId = null;
  Object.assign(s.player, {
    x: 458,
    y: 700,
    z: 0,
    groundZ: 0,
    sceneId: null,
    health: 100,
    angle: 0,
  });
  assert(enterInterior(s, 'voss-dispatch-entry', { world: WORLD }).ok);
  Object.assign(s.player, { x: 130, y: 150, z: 0, groundZ: 0, angle: 0 });
  for (const [id, x, y, weapon] of [
    ['LL-ARC-DAX', 160, 150, 'knife'],
    ['LL-ARC-PEL', 180, 165, 'unarmed'],
  ])
    C.ensureNamedActor(s, {
      id,
      name: id,
      x,
      y,
      z: 0,
      sceneId: 'voss-dispatch',
      health: 100,
      weapon,
      angle: Math.PI,
      ammo: { clip: 0, reserve: 0 },
      appearance: id === 'LL-ARC-DAX' ? TWO_SEATS_APPEARANCES.dax : TWO_SEATS_APPEARANCES.pel,
    });
  const actual = createSimulationCampaignAdapters(s),
    setup = {
      ...actual,
      supportsMission: () => true,
      capabilitiesForMission: () =>
        Object.fromEntries(
          ['passengers', 'clothing', 'melee', 'friendship', 'director'].map((k) => [k, true]),
        ),
      supportsStage: () => true,
      activateStage: () => ({ ok: true }),
      supportsCondition: () => true,
      observe: () => false,
      supportsAction: () => true,
      applyActions: () => ({ ok: true }),
      canCompleteStage: () => false,
    };
  const started = startCampaignMission(s.campaign, 'LL-ST-003', setup);
  assert(started.ok, JSON.stringify(started));
  const run = s.campaign.active,
    scope = {
      missionId: run.missionId,
      stageId: run.stageId,
      attempt: run.attempt,
      activationReceipt: Object.keys(s.campaign.receipts).find(
        (k) => k.includes('LL-ST-003') && k.includes(':activate:dispatch-threat:'),
      ),
    };
  return { s, scope, dax: C.getActor(s, 'LL-ARC-DAX'), pel: C.getActor(s, 'LL-ARC-PEL') };
}
function step(f, seconds, input = {}) {
  for (let n = 0; n < Math.round(seconds * 60); n++) updateSimulation(f.s, 1 / 60, input);
}
test('canonical registration never clones, heals, rearms or completes the mission', () => {
  const f = fixture(),
    before = structuredClone(f.dax),
    count = f.s.hostiles.length;
  const r = registerNamedHostile(f.s, { actorId: f.dax.id, scope: f.scope });
  assert(r.ok);
  assert.equal(f.s.hostiles.length, count);
  assert.deepEqual(f.dax, before);
  assert(isNamedHostile(f.s, f.dax.id));
  assert(registerNamedHostile(f.s, { actorId: f.dax.id, scope: f.scope }).replayed);
  step(f, 1, {});
  assert.equal(f.s.player.health, 100);
  assert.equal(f.s.campaign.completed['LL-ST-003'], undefined);
});
test('engaged canonical knife attacker walks and attacks through actual shared simulation', () => {
  const f = fixture();
  registerNamedHostile(f.s, { actorId: f.dax.id, scope: f.scope });
  engageNamedHostile(f.s, f.dax.id, f.scope);
  const start = f.dax.x;
  step(f, 1.8, {});
  assert(f.dax.x < start);
  assert(f.s.player.health < 100);
  assert.equal(
    f.s.hostiles.some((a) => a.id === f.dax.id),
    false,
  );
  assert.equal(f.s.campaign.completed['LL-ST-003'], undefined);
});
test('actual guard/disarm binds canonical knife body and source observer, without false civilian assault', () => {
  const f = fixture(),
    events = [];
  registerNamedHostile(f.s, { actorId: f.dax.id, scope: f.scope });
  engageNamedHostile(f.s, f.dax.id, f.scope);
  setCampaignObservationHandlers(f.s, 'LL-ST-003', { disarm: (e) => events.push(e) });
  for (let i = 0; i < 180 && !f.dax.meleeAction; i++)
    updateSimulation(f.s, 1 / 60, { aimAngle: 0 });
  assert(f.dax.meleeAction, 'wait for the real approaching blade strike before timing guard');
  for (let i = 0; i < 180 && !f.s.player.counterWindow; i++)
    updateSimulation(f.s, 1 / 60, { block: true, aimAngle: 0 });
  assert(f.s.player.counterWindow);
  assert.equal(f.s.player.counterTarget, f.dax.id);
  updateSimulation(f.s, 1 / 60, { block: true, disarm: true, aimAngle: 0 });
  assert.equal(f.dax.weapon, 'unarmed');
  assert.equal(events.length, 1);
  assert.equal(events[0].targetId, f.dax.id);
  assert.equal(f.s.player.health, 100);
  const hp = f.dax.health;
  assert(damageStoryActor(f.s, f.dax.id, 8).ok);
  assert.equal(f.dax.health, hp - 8);
  assert.equal(f.s.wanted.level, 0);
  assert.equal(f.s.policeDispatch.reports.length, 0);
});
test('release removes hostile classification while leaving actual health and ownership intact', () => {
  const f = fixture();
  registerNamedHostile(f.s, { actorId: f.dax.id, scope: f.scope });
  assert.equal(engageNamedHostile(f.s, f.dax.id, { ...f.scope, attempt: 2 }).ok, false);
  releaseNamedHostile(f.s, f.dax.id, f.scope);
  assert.equal(isNamedHostile(f.s, f.dax.id), false);
  const hp = f.dax.health;
  damageStoryActor(f.s, f.dax.id, 8);
  assert.equal(f.dax.health, hp - 8);
  assert(f.s.policeDispatch.reports.length > 0);
});
test('actual dead body cannot acquire control or be healed by registration', () => {
  const f = fixture();
  damageStoryActor(f.s, f.dax.id, 100);
  const dead = structuredClone(f.dax);
  assert.equal(registerNamedHostile(f.s, { actorId: f.dax.id, scope: f.scope }).ok, false);
  assert.deepEqual(f.dax, dead);
});
test('canonical intent survives a director-excluded full physical checkpoint', () => {
  const f = fixture();
  registerNamedHostile(f.s, { actorId: f.dax.id, scope: f.scope });
  engageNamedHostile(f.s, f.dax.id, f.scope);
  step(f, 0.2, {});
  validateNamedHostility(f.s);
  const bytes = JSON.parse(saveGame(f.s));
  delete bytes.state.campaign;
  const restored = restoreGame(bytes, { physicalOnly: true });
  assert.equal(
    restored.hostiles.some((a) => a.id === f.dax.id),
    false,
  );
  assert.equal(C.getActor(restored, f.dax.id).health, f.dax.health);
  assert.deepEqual(
    namedHostileObservation(restored, f.dax.id).registration,
    namedHostileObservation(f.s, f.dax.id).registration,
  );
});
test('retreat is actual escort movement and is not completed by accepting an order', () => {
  const f = fixture();
  registerNamedHostile(f.s, { actorId: f.dax.id, scope: f.scope });
  const target = { x: 458, y: 700, z: 0, sceneId: null, radius: 12 },
    context = {
      ...namedHostilityContext(f.s),
      allowedRetreatTarget: (_id, p) => JSON.stringify(p) === JSON.stringify(target),
    };
  const r = requestNamedRetreat(f.s, f.dax.id, target, f.scope, context);
  assert(r.ok);
  assert.equal(namedHostileObservation(f.s, f.dax.id).mode, 'retreat');
  assert.equal(r.receipt.arrivedAt, null);
  assert.equal(isNamedHostile(f.s, f.dax.id), false);
  step(f, 15, {});
  const observed = namedHostileObservation(f.s, f.dax.id);
  assert.equal(observed.mode, 'retreated');
  assert.equal(observed.pose.sceneId, null);
  assert(observed.retreat.arrivedAt > r.receipt.at);
  assert.equal(f.s.campaign.completed['LL-ST-003'], undefined);
});
test('an unowned role, changed weapon or arbitrary retreat target cannot mutate a live canonical body', () => {
  const f = fixture(),
    before = structuredClone(f.s);
  assert.equal(registerNamedHostile(f.s, { actorId: 'LL-CHAR-002', scope: f.scope }).ok, false);
  assert.deepEqual(f.s, before);
  assert.equal(
    registerNamedHostile(f.s, { actorId: f.dax.id, scope: { ...f.scope, attempt: 2 } }).ok,
    false,
  );
  assert.deepEqual(f.s, before);
  f.dax.weapon = 'unarmed';
  const disarmed = structuredClone(f.s);
  assert.equal(registerNamedHostile(f.s, { actorId: f.dax.id, scope: f.scope }).ok, false);
  assert.deepEqual(f.s, disarmed);
  const g = fixture();
  registerNamedHostile(g.s, { actorId: g.dax.id, scope: g.scope });
  const owned = structuredClone(g.s);
  assert.equal(
    requestNamedRetreat(
      g.s,
      g.dax.id,
      { x: 458, y: 700, z: 0, sceneId: null, radius: 12 },
      g.scope,
      { ...namedHostilityContext(g.s), allowedRetreatTarget: () => false },
    ).ok,
    false,
  );
  assert.deepEqual(g.s, owned);
});
test('saved role owner, registration, namespace and retreat identity reject mismatched records', () => {
  const f = fixture();
  registerNamedHostile(f.s, { actorId: f.dax.id, scope: f.scope });
  for (const mutate of [
    (s) => (s.namedHostility.namespace = 'deadbeef'),
    (s) => (s.namedHostility.records[f.dax.id].registration.id = 'other'),
    (s) => (s.namedHostility.records[f.dax.id].registration.weapon = 'pistol'),
    (s) => (s.namedHostility.records[f.dax.id].scope.missionId = 'LL-ST-002'),
    (s) => (s.namedHostility.records[f.dax.id].mode = 'retreated'),
  ]) {
    const saved = structuredClone(f.s);
    mutate(saved);
    assert.throws(() => validateNamedHostility(saved));
  }
});
test('Pel engages as his own canonical unarmed body while an unregistered Dax stays passive', () => {
  const f = fixture();
  assert(registerNamedHostile(f.s, { actorId: f.pel.id, scope: f.scope }).ok);
  assert(engageNamedHostile(f.s, f.pel.id, f.scope).ok);
  const start = { x: f.pel.x, y: f.pel.y };
  step(f, 2.5, {});
  assert(Math.hypot(f.pel.x - start.x, f.pel.y - start.y) > 1);
  assert(f.s.player.health < 100);
  assert.equal(f.pel.weapon, 'unarmed');
  assert.equal(f.dax.meleeAction ?? null, null);
  assert.equal(
    f.s.hostiles.some((a) => [f.dax.id, f.pel.id].includes(a.id)),
    false,
  );
});
