import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { runTwoSeatsJourney } from './campaign-two-seats-journey-helper.mjs';
import { FIRST_ARC_MISSIONS } from '../src/campaign/first-arc.js';
import { getActor, getSeat } from '../src/companions.js';
import { restoreGame, saveGame, updateSimulation } from '../src/simulation.js';

// The initial published save is declared setup. Thereafter only ordinary
// controls and real caption/choice/Save/Continue parent APIs drive the mission.
// This surviving-arrival-taxi scenario earns no source or browser completion.
test('Two Seats Open completes every authored stage through actual inputs, ordered living passengers, wrist damage, Continue and one real voucher purchase', async () => {
  const fixture = new URL('./fixtures/campaign-0.6-completed-save.json.gz', import.meta.url);
  const metadata = JSON.parse(
    await readFile(
      new URL('./fixtures/campaign-0.6-completed-save.meta.json', import.meta.url),
      'utf8',
    ),
  );
  const raw = gunzipSync(await readFile(fixture));
  assert.equal(createHash('sha256').update(raw).digest('hex'), metadata.sha256);
  const { report, state } = await runTwoSeatsJourney({ quiet: true });
  console.log(
    `Two Seats production-input evidence: ${report.snapshots['completed-two-seats']?.file || report.error}`,
  );
  assert.equal(report.status, 'completed-by-production-input', report.error);
  assert.deepEqual(report.sourceChanges, []);
  assert.equal(report.initialFixture.sha256, metadata.sha256);
  assert.equal(report.naturalBrowserCompletion, false);
  const authored = FIRST_ARC_MISSIONS.find((m) => m.id === 'LL-ST-003');
  const completed = state.campaign.completed[authored.id];
  assert.deepEqual(
    completed.completedStages,
    authored.stages.map((s) => s.id),
  );
  assert.equal(
    completed.releaseValidated,
    false,
    'Input orchestration does not grant source/release credit',
  );
  assert.equal(report.captions.length, 18);
  assert.deepEqual(
    authored.stages.map(
      (stage) => report.captions.filter((c) => c.key.split(':')[1] === stage.id).length,
    ),
    [4, 4, 5, 5],
  );
  for (const stage of authored.stages) {
    assert.deepEqual(
      report.captions
        .filter((c) => c.key.split(':')[1] === stage.id)
        .map((c) => ({ speaker: c.speaker, text: c.text })),
      stage.dialogue.map((c) => ({ speaker: c.speaker, text: c.text })),
      `Every ${stage.id} line is actually presented in order`,
    );
  }
  assert.deepEqual(
    report.continues.map((c) => c.name),
    ['actual-wrist-before-retreat', 'all-four-seats'],
  );
  const snapshot = async (name) => {
    const record = report.snapshots[name],
      bytes = await readFile(record.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256);
    return restoreGame(bytes.toString());
  };
  const accepted = await snapshot('dispatch-accepted-before-dialogue');
  assert.equal(accepted.campaign.active.stageId, 'dispatch-threat');
  assert.equal(accepted.campaign.active.dialogue.index, 0);
  assert.equal(getActor(accepted, 'LL-ARC-DAX').health, 100);
  assert.equal(getActor(accepted, 'LL-ARC-DAX').weapon, 'knife');
  const wrist = await snapshot('actual-wrist-before-retreat');
  const injury = wrist.twoSeatsRuntime.run.injury;
  assert.equal(injury.healthBefore, 100);
  assert.equal(injury.healthAfter, 92);
  assert.equal(injury.damageApplied, 8);
  assert.equal(injury.damageRequested, 8);
  assert.equal(getActor(wrist, 'LL-ARC-DAX').health, 92);
  assert.equal(getActor(state, 'LL-ARC-DAX').health, 92);
  assert.equal(Object.keys(state.twoSeatsEffects.injuries).length, 1);
  assert.equal(getActor(state, 'LL-ARC-DAX').storyInjuryIds.length, 1);
  assert.equal(getActor(state, 'LL-ARC-DAX').weapon, 'unarmed');
  const seated = await snapshot('all-four-seats');
  assert.equal(seated.player.vehicleId, 'arc-arrival-taxi');
  for (const [id, seat] of [
    ['LL-CHAR-002', 2],
    ['LL-CHAR-008', 1],
    ['LL-CHAR-025', 3],
  ]) {
    assert.equal(getSeat(seated, id).vehicleId, seated.player.vehicleId);
    assert.equal(getSeat(seated, id).seat, seat);
    assert.equal(getSeat(seated, id).alive, true);
  }
  const run = state.twoSeatsRuntime.run;
  assert.deepEqual(
    run.dropoffs.map((r) => [r.actorId, r.sceneId, r.actorPose.sceneId]),
    [
      ['LL-CHAR-025', 'tess-flat', 'tess-flat'],
      ['LL-CHAR-008', 'voss-dispatch', 'voss-dispatch'],
    ],
  );
  assert(run.dropoffs[0].at < run.dropoffs[1].at);
  for (const receipt of run.dropoffs) {
    assert(receipt.exitObservedAt < receipt.at);
    assert.equal(receipt.vehicleId, 'arc-arrival-taxi');
    assert.equal(getActor(state, receipt.actorId).sceneId, receipt.sceneId);
    assert(getActor(state, receipt.actorId).health > 0);
  }
  assert(run.contact.at >= run.dropoffs[1].at);
  assert.equal(state.phoneCalls.contacts['LL-CHAR-025'].receipt, run.contact.proof.phoneReceipt.id);
  assert.deepEqual(Object.keys(run.retreat.proofs).sort(), ['LL-ARC-DAX', 'LL-ARC-PEL']);
  for (const id of Object.keys(run.retreat.proofs)) {
    assert.equal(getActor(state, id).sceneId, null, 'Collector actually left the office');
    assert(getActor(state, id).health > 0);
  }
  const grants = Object.values(state.clothingServices.grants),
    purchases = Object.values(state.clothingServices.purchases);
  assert.equal(grants.length, 1);
  assert.equal(purchases.length, 1);
  assert.equal(grants[0].count, 1);
  assert.equal(grants[0].spentBy, purchases[0].id);
  assert.equal(purchases[0].payment, 'cooperative-voucher');
  assert.equal(purchases[0].charged, 0);
  assert.equal(purchases[0].outfitId, 'slate-work-jacket');
  assert.equal(state.wardrobe.equipped, 'slate-work-jacket');
  assert.equal(state.player.money, report.initial.money);
  assert.equal(state.player.health, report.initial.health);
  assert.equal(state.progress.deaths, report.initial.deaths);
  assert.equal(state.progress.arrests, report.initial.arrests);
  for (const actor of report.initial.cast)
    assert.equal(
      getActor(state, actor.id).health,
      actor.health,
      `Original ${actor.id} health is preserved`,
    );
  assert.equal(getActor(state, 'LL-ARC-PEL').health, 100);
  assert.equal(getActor(state, 'LL-CHAR-025').health, 100);
  assert.equal(getActor(state, 'LL-ARC-BEA').health, 100);
  const continued = restoreGame(saveGame(state)),
    money = continued.player.money;
  updateSimulation(continued, 0.2, {});
  assert.equal(continued.player.money, money);
  assert.equal(
    Object.values(continued.clothingServices.purchases).length,
    1,
    'Continue cannot duplicate the voucher purchase',
  );
  assert.equal(
    Object.keys(continued.twoSeatsEffects.injuries).length,
    1,
    'Continue cannot repeat wrist harm',
  );
  assert.equal(getActor(continued, 'LL-ARC-DAX').health, 92);
});
