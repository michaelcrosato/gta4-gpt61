/** A genuine production-input extraction save is the declared initial fixture.
 * The only extra setup is24 finite pistol rounds. Actor death, boarding, E,
 * escape motion, LOS and elapsed time then come from actual public inputs.
 * This is a focused branch regression, not natural browser/source completion.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { CampaignJourneyDriver } from './campaign-journey-helper.mjs';
import {
  restoreGame,
  saveGame,
  selectWeapon,
  currentVehicle,
  WORLD,
  storyView,
} from '../src/simulation.js';
import { acquireWeapon } from '../src/combat.js';
import { getActor, getSeat } from '../src/companions.js';
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
class BranchDriver extends CampaignJourneyDriver {
  log(event, extra = {}) {
    const entry = { event, ...this.read(), extra };
    this.report.timeline.push(entry);
    return entry;
  }
  reverseAlong(path) {
    let index = 1;
    const goal = path.at(-1),
      deadline = this.state.time + 50;
    while (this.state.time < deadline) {
      const car = currentVehicle(this.state);
      assert(car, 'Actual taxi must remain available');
      while (index < path.length - 1 && distance(car, path[index]) < 4) index++;
      const remaining = distance(car, goal);
      if (remaining < 3) {
        this.stop(1.5);
        return;
      }
      const target = path[Math.min(path.length - 1, index + 3)],
        desired = Math.atan2(target.y - car.y, target.x - car.x) + Math.PI,
        error = Math.atan2(Math.sin(desired - car.angle), Math.cos(desired - car.angle)),
        limit = Math.min(12, Math.max(4, remaining * 1.3)),
        steer = -error;
      this.step({
        down: car.speed > -limit + 1,
        brake: Math.abs(car.speed) > limit + 2,
        right: steer > 0.04,
        left: steer < -0.04,
      });
    }
    assert.fail('Actual reverse controls could not leave the marked bay');
  }
}
test('killing the actual designated collector on foot after warning can resolve through real unseen escape without automatic completion', () => {
  const bytes = gunzipSync(
      readFileSync(new URL('./fixtures/late-meter-extract-input-save.json.gz', import.meta.url)),
    ),
    meta = JSON.parse(
      readFileSync(new URL('./fixtures/late-meter-extract-input-save.meta.json', import.meta.url)),
    );
  assert.equal(createHash('sha256').update(bytes).digest('hex'), meta.sha256);
  const output = mkdtempSync(join(tmpdir(), 'lowlight-driver-death-')),
    driver = new BranchDriver({ dt: 0.1, output });
  driver.state = restoreGame(bytes.toString());
  assert.equal(storyView(driver.state).stageId, 'extract');
  assert.equal(getActor(driver.state, 'LL-ARC-REEVE').health, 100);
  assert.equal(getSeat(driver.state, 'LL-ARC-REEVE'), null);
  assert(driver.state.lateMeterRuntime.run.warning.delivered);
  acquireWeapon(driver.state, 'pistol', 24);
  driver.state.player.ammo.pistol = { clip: 12, reserve: 12 };
  driver.state = restoreGame(saveGame(driver.state));
  const money = driver.state.player.money;
  driver.waitUntil(
    () => getSeat(driver.state, 'LL-CHAR-002')?.vehicleId === currentVehicle(driver.state)?.id,
    { seconds: 25, label: 'real-Felix-boarding', input: { brake: true } },
  );
  driver.reverseAlong(WORLD.campaignSceneBindings['impound-counter'].taxiExit);
  for (let press = 0; press < 4 && driver.state.player.vehicleId; press++)
    driver.interact('real-caption-or-taxi-exit');
  assert.equal(driver.state.player.vehicleId, null);
  const deadline = driver.state.time + 6;
  while (getActor(driver.state, 'LL-ARC-REEVE').health > 0 && driver.state.time < deadline) {
    const target = getActor(driver.state, 'LL-ARC-REEVE'),
      p = driver.state.player;
    driver.step({
      aim: true,
      aimAngle: Math.atan2(target.y - p.y, target.x - p.x),
      aimTarget: { x: target.x, y: target.y, z: (target.z || 0) + 14 },
      fire: true,
    });
  }
  assert.equal(getActor(driver.state, 'LL-ARC-REEVE').health, 0);
  assert.equal(getSeat(driver.state, 'LL-ARC-REEVE'), null);
  assert.equal(getActor(driver.state, 'holt-collector-watch').health, 100);
  assert.equal(getActor(driver.state, 'LL-CHAR-002').health, 100);
  assert(
    driver.state.lateMeterRuntime.run.damageEvents.some(
      (e) =>
        e.targetId === 'LL-ARC-REEVE' &&
        e.owner === 'player' &&
        e.kind === 'bullet' &&
        e.healthAfter === 0,
    ),
  );
  selectWeapon(driver.state, 'unarmed');
  driver.interact('real-taxi-reentry');
  assert(currentVehicle(driver.state));
  writeFileSync(join(output, 'actual-foot-death.json'), saveGame(driver.state));
  driver.driveTo({ x: 1000, y: 440, z: 0 }, { speed: 85, radius: 6 });
  driver.waitUntil(() => storyView(driver.state).stageId === 'return', {
    seconds: 20,
    label: 'real-physical-disabled-escape',
    input: { brake: true },
  });
  const s = driver.state,
    p = s.lateMeterRuntime.run.pursuit,
    r = p.escape;
  assert(r);
  assert.equal(r.resolution, 'physically-disabled-threat');
  assert.equal(r.driverId, null);
  assert(r.unseenSeconds >= 10 - 1e-6);
  assert(r.at - r.lastSeenAt >= 10 - 1e-6);
  assert(distance(r.vehiclePose, r.lastSeen) > r.outsideRadius);
  assert.equal(r.outsideRadius, 120);
  assert.equal(getActor(s, 'LL-ARC-REEVE').health, 0);
  assert.equal(getActor(s, 'holt-collector-watch').health, 100);
  assert.equal(s.vehicles.find((v) => v.id === 'holt-tow-sedan').health, 115);
  assert.equal(currentVehicle(s).health, 120);
  assert.equal(s.player.health, 100);
  assert.equal(getActor(s, 'LL-CHAR-002').health, 100);
  assert.equal(s.wanted.level, 0);
  assert.equal(s.player.money, money);
  assert.equal(s.campaign.completed['LL-ST-002'], undefined);
  writeFileSync(join(output, 'actual-escaped.json'), saveGame(s));
  writeFileSync(join(output, 'input-trace.json'), JSON.stringify(driver.report, null, 2));
  const continued = restoreGame(saveGame(s));
  assert.equal(storyView(continued).stageId, 'return');
  assert.equal(getActor(continued, 'LL-ARC-REEVE').health, 0);
  assert.equal(continued.lateMeterRuntime.run.pursuit.escape.id, r.id);
});
