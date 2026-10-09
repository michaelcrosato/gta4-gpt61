/**
 * Complete production-simulation Night Crossing regression. The driver uses
 * normal movement, steering, braking and confirm inputs. Caption presentation,
 * acknowledgment and the explicit room response stand in for UI controls.
 * Storage is a declared real filesystem adapter, not browser localStorage.
 * No actor pose, health, clock, objective, mission or receipt is assigned here.
 * This test does not establish natural browser completion or source release credit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CampaignJourneyDriver } from './campaign-journey-helper.mjs';
import {
  WORLD,
  VEHICLE_SPECS,
  nearestInteractable,
  storyView,
  selectStoryChoice,
  prepareStorySave,
  commitStorySave,
  rollbackStorySave,
  setCampaignStorageVerifier,
  saveGame,
  restoreGame,
} from '../src/simulation.js';
import { worldHours } from '../src/calendar.js';

const MISSION = 'LL-ST-001';
const companion = (state, id) => state.companions.actors.find((actor) => actor.id === id);
const service = (state, kind) => state.campaignRuntime.night.services[kind];
function assertParkedTaxi(state) {
  const car = state.vehicles.find((body) => body.id === 'arc-arrival-taxi'),
    bay = WORLD.campaignSceneBindings['dockside-rooms'].parkingBay,
    spec = VEHICLE_SPECS[car.spec];
  assert(Math.abs(car.speed) < 2);
  for (const along of [-spec.length / 2, spec.length / 2])
    for (const across of [-spec.width / 2, spec.width / 2]) {
      const x = car.x + Math.cos(car.angle) * along - Math.sin(car.angle) * across,
        y = car.y + Math.sin(car.angle) * along + Math.cos(car.angle) * across;
      assert(x >= bay.x && x <= bay.x + bay.w && y >= bay.y && y <= bay.y + bay.h);
    }
}

test(
  'Night Crossing completes through actual route, choice, meal, stored save and six-hour rest',
  { timeout: 180_000 },
  async (t) => {
    const output = mkdtempSync('/tmp/lowlight-campaign-regression-'),
      savePath = join(output, 'actual-save.json'),
      driver = new CampaignJourneyDriver({ output }),
      initialMoney = driver.state.player.money;
    // Keep TAP concise while preserving the same detailed actual-input telemetry.
    driver.log = (event, extra = {}) => {
      const item = { event, ...driver.read(), extra };
      driver.report.timeline.push(item);
      return item;
    };
    const regression = {
      fixture:
        'Actual simulation inputs; public caption/choice UI APIs; real filesystem storage adapter.',
      naturalBrowserCompletion: false,
      status: 'running',
      output,
    };
    setCampaignStorageVerifier((bytes) => {
      try {
        return readFileSync(savePath, 'utf8') === bytes;
      } catch {
        return false;
      }
    });
    try {
      const journey = await driver.run(),
        state = driver.state;
      assert.equal(journey.status, 'fixture-ready', journey.error);
      assert.deepEqual(
        state.campaignRuntime.night.route.stops.map((stop) => stop.id),
        ['pier-berth', 'fairground', 'dispatch'],
      );
      assert(state.campaignRuntime.night.route.stops[1].stoppedSeconds >= 2 - 1e-7);
      assert.equal(state.campaignRuntime.night.route.discontinuity, null);
      assert.equal(state.campaignRuntime.night.route.offRoadSeconds, 0);
      assert(state.progress.distanceDriven > 2_000);
      assert.equal(state.player.sceneId, 'dockside-rooms');
      assert.equal(companion(state, 'LL-CHAR-002').sceneId, 'dockside-rooms');
      assert.equal(companion(state, 'LL-CHAR-008').sceneId, 'dockside-rooms');
      assert.equal(state.player.health, 100);
      assert.equal(companion(state, 'LL-CHAR-002').health, 100);
      assert.equal(companion(state, 'LL-CHAR-008').health, 100);
      assert.equal(state.progress.deaths, 0);
      assert.equal(state.wanted.level, 0);
      assertParkedTaxi(state);
      assert.equal(state.campaign.active.choices['room-response'], 'thank-nadia');
      assert.equal(state.campaign.trust['LL-CHAR-008'], 1);
      assert(state.storyInventory.keys.includes('dockside-tenancy'));
      // The second response is exercised from the genuine pre-choice save, not
      // by rewinding a director field or inventing a completed reveal.
      const alternate = restoreGame(
        readFileSync(journey.snapshots['shelter-before-choice'].file, 'utf8'),
      );
      assert.equal(selectStoryChoice(alternate, 'room-response', 'ask-contracts').ok, true);
      assert.equal(alternate.campaign.active.choices['room-response'], 'ask-contracts');
      assert(alternate.storyInventory.evidence.includes('co-op-arrears'));
      assert.equal(alternate.campaign.completed[MISSION], undefined);
      assert.equal(service(alternate, 'food'), null);
      const duffel = state.campaignRuntime.sceneProps['arrival-duffel'];
      assert.equal(duffel.sceneId, 'dockside-rooms');
      assert.equal(duffel.carrierId, null);
      assert.equal(storyView(state).stageId, 'rest');
      assert.equal(state.campaign.completed[MISSION], undefined);
      assert.equal(
        prepareStorySave(state).ok,
        false,
        'An unfinished meal cannot certify the tutorial save.',
      );

      driver.waitUntil(() => !storyView(state).dialogue, {
        label: 'actual-rest-tutorial-captions',
        seconds: 5,
      });
      driver.walkTo(WORLD.campaignSceneBindings['dockside-rooms'].hooks.food);
      assert.equal(nearestInteractable(state).id, 'dockside-kettle');
      driver.interact('actual-kettle-confirm-input');
      assert.equal(state.shelterServices.active.kind, 'food');
      assert.equal(state.shelterServices.foodStock, 2);
      assert.equal(
        service(state, 'food'),
        null,
        'Food animation must finish before its objective commits.',
      );
      driver.waitUntil(() => Boolean(service(state, 'food')), {
        label: 'actual-meal-completed',
        seconds: 3,
      });
      assert.equal(state.shelterServices.receipts[service(state, 'food').id].status, 'committed');
      assert.equal(state.campaign.completed[MISSION], undefined);

      driver.walkTo(WORLD.campaignSceneBindings['dockside-rooms'].hooks.save);
      assert.equal(nearestInteractable(state).id, 'dockside-save');
      driver.interact('actual-shelter-save-confirm-input');
      const previous = saveGame(state);
      writeFileSync(savePath, previous);
      assert.equal(
        service(restoreGame(readFileSync(savePath, 'utf8')), 'save'),
        null,
        'An ordinary save cannot create a shelter-save objective.',
      );

      const rejected = prepareStorySave(state);
      assert.equal(rejected.ok, true);
      const unpersistedBytes = saveGame(rejected.candidate);
      assert.equal(
        commitStorySave(state, rejected, { bytes: unpersistedBytes }).ok,
        false,
        'Claimed bytes without an actual matching storage write must be rejected.',
      );
      assert.equal(service(state, 'save'), null);
      assert.throws(() => writeFileSync(output, unpersistedBytes));
      assert.equal(rollbackStorySave(state, rejected).ok, true);
      assert.equal(
        readFileSync(savePath, 'utf8'),
        previous,
        'Failed storage leaves the previous real save intact.',
      );
      assert.equal(service(state, 'save'), null);

      const prepared = prepareStorySave(state);
      assert.equal(prepared.ok, true);
      const bytes = saveGame(prepared.candidate);
      assert.equal(
        service(state, 'save'),
        null,
        'Preparing storage cannot modify live save completion.',
      );
      writeFileSync(savePath, bytes);
      assert.equal(readFileSync(savePath, 'utf8'), bytes);
      assert.equal(commitStorySave(state, prepared, { bytes }).ok, true);
      assert.equal(service(state, 'save').status, 'committed');
      assert.equal(
        service(restoreGame(readFileSync(savePath, 'utf8')), 'save').id,
        service(state, 'save').id,
      );
      assert.equal(
        state.campaign.completed[MISSION],
        undefined,
        'A confirmed save still requires real rest.',
      );

      driver.walkTo(WORLD.campaignSceneBindings['dockside-rooms'].hooks.rest);
      assert.equal(nearestInteractable(state).id, 'dockside-bed');
      const beforeRest = {
        time: state.time,
        hours: worldHours(state),
        offset: state.calendar.offsetHours,
      };
      driver.interact('actual-bed-confirm-input');
      assert.equal(state.shelterServices.active.kind, 'rest');
      assert.equal(state.calendar.offsetHours, beforeRest.offset);
      assert.equal(service(state, 'rest'), null);
      driver.waitUntil(() => Boolean(state.campaign.completed[MISSION]), {
        label: 'actual-rest-and-mission-completion',
        seconds: 5,
      });
      assert(state.time - beforeRest.time >= 2);
      assert.equal(state.calendar.offsetHours - beforeRest.offset, 6);
      assert(
        Math.abs(worldHours(state) - beforeRest.hours - (state.time - beforeRest.time) / 90 - 6) <
          1e-7,
      );
      assert.equal(state.calendar.receipts[service(state, 'rest').id].hours, 6);
      assert.equal(state.shelterServices.foodStock, 3);
      assert.equal(state.campaign.active, null);
      assert.equal(state.campaign.completed[MISSION].releaseValidated, false);
      assert.equal(state.player.money, initialMoney);
      assert.equal(state.progress.cashEarned, 0);
      assert.equal(
        state.progress.completed.length,
        0,
        'Additional onboarding jobs are independent of Night Crossing.',
      );

      const completed = saveGame(state),
        restored = restoreGame(completed),
        campaignReceipts = Object.keys(state.campaignEffects.receipts),
        restReceipts = Object.keys(state.calendar.receipts);
      assert(restored.campaign.completed[MISSION]);
      assert.equal(restored.calendar.offsetHours, 6);
      for (let index = 0; index < 20; index++) driver.step({});
      assert.deepEqual(Object.keys(state.campaignEffects.receipts), campaignReceipts);
      assert.deepEqual(Object.keys(state.calendar.receipts), restReceipts);
      assert.equal(state.player.money, initialMoney);
      regression.status = 'passed';
      regression.complete = driver.read();
      regression.storage = {
        savePath,
        food: service(state, 'food').id,
        save: service(state, 'save').id,
        rest: service(state, 'rest').id,
      };
      writeFileSync(join(output, 'completed.json'), completed);
      t.diagnostic(`Complete production-input campaign evidence: ${output}`);
    } catch (error) {
      regression.status = 'failed';
      regression.error = String(error.stack || error);
      regression.failureTelemetry = driver.read();
      throw error;
    } finally {
      setCampaignStorageVerifier(null);
      writeFileSync(
        join(output, 'completion-report.json'),
        `${JSON.stringify(regression, null, 2)}\n`,
      );
    }
  },
);
