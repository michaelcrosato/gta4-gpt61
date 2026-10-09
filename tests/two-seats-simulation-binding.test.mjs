/** Real save/router/component contracts. Initial Dispatch owner/duel fixture is
 * declared; this does not establish a playable or completed Two Seats Open. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fixture, ownThreat, guardedDisarm } from './helpers/two-seats-native-fixture.mjs';
import {
  createSimulation,
  createSimulationCampaignAdapters,
  saveGame,
  restoreGame,
  updateSimulation,
  storyView,
  startStoryMission,
  setCampaignObservationHandlers,
  nearestInteractable,
  WORLD,
} from '../src/simulation.js';
import {
  CAMPAIGN_CONTENT,
  campaignAvailability,
  campaignContentFingerprint,
  advanceCampaignDialogue,
} from '../src/campaign/director.js';
import { observeTwoSeatsDisarm, observeTwoSeatsDamage } from '../src/campaign/two-seats-runtime.js';
import { twoSeatsWristView } from '../src/campaign/two-seats-parent-context.js';
import * as Named from '../src/named-hostility.js';
import { ensureNamedActor, getActor } from '../src/companions.js';
import { applyRestHours } from '../src/calendar.js';

test('production M3 registration stays unavailable on unchanged owned mission definitions and missing physical/art dependencies', () => {
  const original = gunzipSync(
    readFileSync(new URL('./fixtures/campaign-0.6-completed-save.json.gz', import.meta.url)),
  ).toString();
  const s = restoreGame(original),
    before = {
      money: s.player.money,
      companions: structuredClone(s.companions),
      director: JSON.stringify(s.campaign),
    };
  const adapters = createSimulationCampaignAdapters(s),
    availability = campaignAvailability(s.campaign, adapters);
  assert.equal(availability.find((m) => m.id === 'LL-ST-001').status, 'completed');
  assert.equal(availability.find((m) => m.id === 'LL-ST-002').status, 'completed');
  const m3 = availability.find((m) => m.id === 'LL-ST-003');
  if (
    WORLD.campaignSceneReports?.['LL-ST-003']?.ready !== true ||
    WORLD.campaignSceneReports?.['LL-ST-003']?.injuryArt !== true
  ) {
    assert.equal(m3.status, 'unmet-integration-gates');
    assert(m3.unmet.length > 0);
    assert.equal(adapters.supportsMission('LL-ST-003', CAMPAIGN_CONTENT.missions[2]), false);
  }
  assert.equal(
    CAMPAIGN_CONTENT.missions[2].failures.length,
    6,
    'explicitly authored essential failure guards',
  );
  const result = startStoryMission(s, 'LL-ST-003');
  assert.equal(result.ok, false);
  assert.equal(s.campaign.active, null);
  assert.equal(JSON.stringify(s.campaign), before.director);
  assert.equal(s.player.money, before.money);
  assert.deepEqual(s.companions, before.companions);
  assert.notEqual(campaignContentFingerprint(adapters), '38b480d9');
  assert.equal(s.campaign.receiptNamespace, 'cbf05190');
  const arrival = createSimulation({ seed: 61, campaign: true }),
    a = createSimulationCampaignAdapters(arrival);
  assert.equal(a.supportsMission('LL-ST-001', CAMPAIGN_CONTENT.missions[0]), true);
  assert.equal(a.supportsMission('LL-ST-002', CAMPAIGN_CONTENT.missions[1]), true);
  const continued = restoreGame(saveGame(arrival));
  assert.equal(continued.campaign.active.missionId, 'LL-ST-001');
  assert.deepEqual(continued.campaign.active.checkpoints, arrival.campaign.active.checkpoints);
});
test('whole save and director-excluded physical snapshots select actual M3 ledger, preserve injury and reject mismatched ownership', () => {
  const f = guardedDisarm();
  assert(observeTwoSeatsDisarm(f.s, f.dax.disarmReceipt, f.parent).ok);
  const bytes = saveGame(f.s),
    continued = restoreGame(bytes);
  assert.equal(continued.campaign.active.missionId, 'LL-ST-003');
  assert.equal(continued.twoSeatsRuntime.active.missionId, 'LL-ST-003');
  assert.deepEqual(continued.twoSeatsRuntime, f.s.twoSeatsRuntime);
  assert.deepEqual(continued.twoSeatsEffects, f.s.twoSeatsEffects);
  assert.equal(continued.player.money, f.s.player.money);
  assert.deepEqual(twoSeatsWristView(continued), twoSeatsWristView(f.s));
  const view = storyView(continued);
  assert.equal(view.missionId, 'LL-ST-003');
  assert.equal(view.stageId, 'dispatch-threat');
  assert.equal(view.title, 'Two Seats Open');
  assert.equal(view.active, true);
  const adapters = createSimulationCampaignAdapters(continued),
    checkpoint = adapters.captureWorld({ reason: 'declared-M3-physical-checkpoint' });
  assert.equal(Object.hasOwn(checkpoint, 'campaign'), false);
  assert.equal(adapters.validateWorld(checkpoint), true);
  const oldEpoch = continued.twoSeatsRuntime.restoreEpoch,
    identity = continued,
    director = continued.campaign;
  updateSimulation(continued, 0.1, {});
  assert(continued.time > checkpoint.time);
  const restored = adapters.restoreWorld(checkpoint, { reason: 'declared-M3-physical-checkpoint' });
  assert(restored.ok);
  assert.equal(continued, identity);
  assert.equal(continued.campaign, director);
  assert.equal(continued.time, checkpoint.time);
  assert.equal(continued.twoSeatsRuntime.restoreEpoch, oldEpoch + 1);
  assert.equal(storyView(continued).inputEpoch, oldEpoch + 1);
  for (const mutate of [
    (s) => (s.twoSeatsRuntime.active.stageId = 'pickup'),
    (s) => (s.twoSeatsRuntime.active.attempt += 1),
    (s) => (s.twoSeatsEffects.injuries[s.twoSeatsRuntime.run.injury.id].healthAfter -= 1),
  ]) {
    const broken = JSON.parse(bytes);
    mutate(broken.state);
    assert.throws(() => restoreGame(broken));
  }
  assert.equal(continued.campaign.completed['LL-ST-003'], undefined);
});

test('shared production combatContext consumes the actual wrist receipt for autonomous canonical right-hand attacks', () => {
  const f = fixture({ combat: true }),
    m = ownThreat(f);
  const dax = ensureNamedActor(
    f.s,
    {
      ...f.engine.actorDefinitions.find((a) => a.id === 'LL-ARC-DAX'),
      name: 'Dax Lorne',
      angle: 0,
    },
    f.cc,
  );
  const scope = m.activations[m.active.receipt].scope;
  assert(Named.registerNamedHostile(f.s, { actorId: dax.id, scope }).ok);
  // Four real pure-director acknowledgments are a declared presented-caption
  // fixture, not fabricated physical progress or a claim of natural UI play.
  for (let n = 0; n < 4; n++) assert(advanceCampaignDialogue(f.s.campaign, f.native).ok);
  assert(Named.engageNamedHostile(f.s, dax.id, scope).ok);
  setCampaignObservationHandlers(f.s, 'LL-ST-003', {
    damage: (e) => observeTwoSeatsDamage(f.s, e, f.parent),
    disarm: (r) => assert(observeTwoSeatsDisarm(f.s, r, f.parent).ok),
  });
  const step = (input = {}) => updateSimulation(f.s, 1 / 60, input);
  for (let n = 0; n < 180 && !f.s.player.counterWindow; n++)
    step({ block: true, aimAngle: Math.PI });
  assert(f.s.player.counterWindow);
  step({ block: true, disarm: true, aimAngle: Math.PI });
  assert.equal(dax.health, 92);
  assert.equal(twoSeatsWristView(f.s).active, true);
  for (let n = 0; n < 180 && !dax.meleeAction; n++) step();
  assert.equal(dax.meleeAction.hand, 'right');
  assert.equal(dax.meleeAction.damage, 8);
  assert(Math.abs(dax.meleeAction.duration - 0.585) < 1e-9);
  const before = f.s.player.health;
  for (let n = 0; n < 20 && f.s.player.health === before; n++) step();
  assert(Math.abs(f.s.player.health - (before - 4.8)) < 1e-8);
  for (let n = 0; n < 90 && dax.meleeAction; n++) step();
  assert.equal(dax.meleeAction, null);
  assert(applyRestHours(f.s, 24, 'component:common-hand-expiry-one').ok);
  assert(applyRestHours(f.s, 24, 'component:common-hand-expiry-two').ok);
  for (let n = 0; n < 90 && !dax.meleeAction; n++) step();
  assert.equal(dax.meleeAction.damage, 16);
  assert.equal(dax.meleeAction.duration, 0.43);
  assert.equal(twoSeatsWristView(f.s).bandageVisible, true);
  assert.equal(dax.health, 92);
  assert.equal(getActor(f.s, 'LL-CHAR-002').health, f.health.felix);
  assert.equal(getActor(f.s, 'LL-CHAR-008').health, f.health.nadia);
  assert.equal(f.s.player.money, f.health.money);
  assert.equal(f.s.campaign.completed['LL-ST-003'], undefined);
  assert.doesNotThrow(() => restoreGame(saveGame(f.s)));
});

test('completed M1/M2 actual E reaches Felix through the real doorway and respects current mission readiness', () => {
  const bytes = gunzipSync(
      readFileSync(new URL('./fixtures/campaign-0.6-completed-save.json.gz', import.meta.url)),
    ).toString(),
    s = restoreGame(bytes),
    health = getActor(s, 'LL-CHAR-002').health,
    money = s.player.money;
  // Declared initial doorstep pose only. Real E and movement are used from here;
  // no enterInterior call, actor relocation, mission edit or readiness override.
  Object.assign(s.player, { x: 458, y: 700, z: 0, groundZ: 0, vehicleId: null });
  assert.equal(s.campaignMode, 'story');
  assert.equal(nearestInteractable(s).type, 'interior-portal');
  updateSimulation(s, 1 / 60, { confirm: true });
  assert.equal(s.interior.active?.roomId, 'voss-dispatch');
  for (const goal of [
    { x: 200, y: 198 },
    { x: 200, y: 45 },
  ]) {
    for (let n = 0; n < 250 && Math.hypot(s.player.x - goal.x, s.player.y - goal.y) > 2; n++) {
      const dx = goal.x - s.player.x,
        dy = goal.y - s.player.y,
        length = Math.hypot(dx, dy);
      updateSimulation(s, 0.05, { moveX: dx / length, moveY: dy / length });
    }
    assert(
      Math.hypot(s.player.x - goal.x, s.player.y - goal.y) <= 2,
      'actual desk-safe walking route',
    );
  }
  const item = nearestInteractable(s);
  assert.equal(item.type, 'story-mission');
  assert.equal(item.id, 'LL-ST-003');
  const ready = createSimulationCampaignAdapters(s).supportsMission(
    'LL-ST-003',
    CAMPAIGN_CONTENT.missions[2],
  );
  assert.equal(
    item.available,
    ready,
    'a physical conversation uses the actual registered capabilities',
  );
  updateSimulation(s, 1 / 60, { confirm: true });
  if (ready) {
    assert.equal(s.campaign.active.missionId, 'LL-ST-003');
    assert.equal(s.twoSeatsRuntime.active.stageId, 'dispatch-threat');
    assert.equal(s.campaign.active.dialogue.index, 0);
  } else {
    assert.equal(s.campaign.active, null, 'missing capabilities cannot be bypassed by E');
  }
  assert.equal(getActor(s, 'LL-CHAR-002').health, health);
  assert.equal(s.player.money, money);
});
