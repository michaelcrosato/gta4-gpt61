import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSimulation,
  updateSimulation,
  leaveStory,
  retryStory,
  storyView,
  saveGame,
  restoreGame,
  startMission,
  setStoryPresentationVisibility,
} from '../src/simulation.js';
import { damageCompanion, getActor } from '../src/companions.js';
import { startSubtitleSequence, presentSubtitle } from '../src/campaign/subtitles.js';

test('leaving a failed arrival preserves real checkpoints through free movement and Continue until an explicit retry', () => {
  const state = createSimulation({ seed: 61, campaign: true });
  const initialPose = { x: state.player.x, y: state.player.y, z: state.player.z };
  const initialMoney = state.player.money;
  const checkpointBytes = JSON.stringify(state.campaign.active.checkpoints);
  startSubtitleSequence(state, 'interrupted-dialogue', 'regression:interrupted-line', [
    { speaker: 'Felix', text: 'An interrupted mission must not keep talking in free roam.' },
  ]);
  presentSubtitle(state, 'regression:interrupted-line', 0);
  // Component fixture: actual companion damage, then normal failure observation.
  // This is lifecycle validation, not a natural-input campaign claim.
  damageCompanion(state, 'LL-CHAR-008', 100, 'regression');
  updateSimulation(state, 0.2);
  assert.equal(state.campaign.active.failure.id, 'lost-nadia');
  assert.equal(getActor(state, 'LL-CHAR-008').health, 0);
  assert.equal(leaveStory(state).ok, true);
  assert.equal(state.campaign.active, null);
  assert.equal(state.campaign.suspended.length, 1);
  assert.equal(JSON.stringify(state.campaign.suspended[0].checkpoints), checkpointBytes);
  assert.equal(state.player.money, initialMoney, 'leaving earns no mission reward');
  assert.equal(storyView(state).interrupted.missionId, 'LL-ST-001');
  assert.equal(storyView(state).failed, false);
  assert.equal(storyView(state).ambient, null);
  const subtitleBytes = JSON.stringify(state.subtitles);
  setStoryPresentationVisibility(state, true);
  const before = state.time;
  updateSimulation(state, 0.2, { moveY: 1 });
  assert.ok(state.time > before);
  assert.equal(
    JSON.stringify(state.subtitles),
    subtitleBytes,
    'interrupted lines earn no display time',
  );
  assert.notDeepEqual(
    { x: state.player.x, y: state.player.y, z: state.player.z },
    initialPose,
    'returning to the city releases actual movement',
  );
  assert.equal(
    startMission(state, 'first-shift'),
    false,
    'unfinished arrival is not completed by leaving',
  );
  const saved = saveGame(state);
  for (const mode of ['retry-last-checkpoint', 'restart-mission']) {
    const continued = restoreGame(saved);
    assert.equal(storyView(continued).interrupted.stageId, 'berth');
    assert.equal(getActor(continued, 'LL-CHAR-008').health, 0, 'Continue does not secretly retry');
    assert.equal(JSON.stringify(continued.campaign.suspended[0].checkpoints), checkpointBytes);
    const result = retryStory(continued, mode);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(continued.campaign.active.phase, 'running');
    assert.equal(continued.campaign.active.stageId, 'berth');
    assert.equal(continued.campaign.active.attempt, 2);
    assert.equal(continued.campaign.suspended.length, 0);
    assert.equal(storyView(continued).interrupted, null);
    assert.equal(getActor(continued, 'LL-CHAR-008').health, 100);
    assert.deepEqual(
      { x: continued.player.x, y: continued.player.y, z: continued.player.z },
      initialPose,
      'explicit retry restores the actual implicit-start world',
    );
    assert.equal(continued.companions.actors.length, 4);
    assert.equal(continued.player.money, initialMoney);
    assert.deepEqual(continued.campaign.completed, {});
    assert.equal(restoreGame(saveGame(continued)).campaign.active.attempt, 2);
  }
  const corrupted = JSON.parse(saved);
  corrupted.state.campaignRuntime.active.phase = 'running';
  assert.throws(() => restoreGame(corrupted), /interrupted assignment/);
});
