import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { runLateMeterJourney } from './campaign-late-meter-journey-helper.mjs';
import { FIRST_ARC_MISSIONS } from '../src/campaign/first-arc.js';
import { restoreGame, saveGame, updateSimulation } from '../src/simulation.js';
import { getActor } from '../src/companions.js';

test('Late Meter completes all five authored stages through ordinary production inputs and actual native clues after an authentic completed0.5 save', async () => {
  const fixture = new URL('./fixtures/campaign-0.5-completed-save.json.gz', import.meta.url);
  const meta = JSON.parse(
    await readFile(
      new URL('./fixtures/campaign-0.5-completed-save.meta.json', import.meta.url),
      'utf8',
    ),
  );
  const bytes = gunzipSync(await readFile(fixture));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), meta.sha256);
  const { report, state } = await runLateMeterJourney({ quiet: true });
  console.log(
    `Late Meter production-input evidence: ${report.snapshots['completed-late-meter']?.file || report.error}`,
  );
  assert.equal(report.status, 'completed-by-production-input', report.error);
  assert.deepEqual(report.sourceChanges, [], 'App source stays unchanged throughout the journey');
  const authored = FIRST_ARC_MISSIONS.find((m) => m.id === 'LL-ST-002');
  assert.deepEqual(
    state.campaign.completed['LL-ST-002'].completedStages,
    authored.stages.map((s) => s.id),
  );
  assert.equal(
    state.campaign.completed['LL-ST-002'].releaseValidated,
    false,
    'A deterministic Node orchestration earns no browser/source completion credit',
  );
  assert.equal(report.preassignmentIdle.frames, 10800);
  assert.equal(report.preassignmentIdle.timestep, 1 / 60);
  const heard = [
    ...report.captions,
    ...report.timeline
      .filter((e) => e.event === 'actual-phone-caption-presented')
      .map((e) => e.extra),
  ];
  for (const line of authored.stages.flatMap((s) => s.dialogue))
    assert(
      heard.some((h) => h.speaker === line.speaker && h.text === line.text),
      `Authored line was actually presented: ${line.speaker}: ${line.text}`,
    );
  assert.equal(report.finalMoney - report.initialMoney, 120);
  assert.equal(state.progress.deaths, 0);
  assert(state.vehicles.find((v) => v.id === state.lateMeterRuntime.run.rideId).health > 0);
  assert.equal(getActor(state, 'LL-CHAR-002').sceneId, 'voss-dispatch');
  assert(getActor(state, 'LL-CHAR-002').health > 0);
  assert(
    report.nativeFrames.some((f) =>
      f.proofs.some(
        (p) =>
          p.actorId === 'LL-ARC-REEVE' &&
          ['grey-tow-jacket', 'co-op-repossession-clipboard'].every((clue) =>
            p.clues.includes(clue),
          ),
      ),
    ),
    'Only an actual native rendered frame can establish recognition',
  );
  const warning = state.lateMeterRuntime.run.warning.delivered;
  assert.equal(warning.kind, 'delivered');
  assert.equal(warning.history.length, 3);
  assert(warning.at < state.lateMeterRuntime.run.recognition.at + 18);
  assert.equal(state.lateMeterRuntime.run.pursuit.escape.resolution, 'routed-vehicle-pursuit');
  assert(state.lateMeterRuntime.run.pursuit.escape.unseenSeconds >= 10);
  const escape = state.lateMeterRuntime.run.pursuit.escape;
  assert(
    Math.hypot(escape.vehiclePose.x - escape.lastSeen.x, escape.vehiclePose.y - escape.lastSeen.y) >
      escape.outsideRadius,
  );
  assert(state.lateMeterRuntime.run.pursuit.startedAt <= escape.at - 10 + 1e-6);
  assert.equal(state.lateMeterRuntime.run.pursuit.lastVehiclePose.driverId, 'LL-ARC-REEVE');
  assert.equal(
    Object.values(state.lateMeterEffects.receipts).filter((r) => r.kind === 'campaign-reward')
      .length,
    1,
  );
  const continued = restoreGame(saveGame(state)),
    money = continued.player.money;
  updateSimulation(continued, 0.2, {});
  assert.equal(continued.player.money, money, 'Continue does not repeat the actual reward');
});
