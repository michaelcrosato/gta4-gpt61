#!/usr/bin/env node
import assert from 'node:assert/strict';
/** Production-input orchestration from a genuine completed M1/M2 save.
 * No direct actor/car/health/wallet/clock/director/receipt edits after restore.
 * Explicit caption/choice and Save/Continue APIs are declared parent actions;
 * this is not a natural keyboard/browser completion claim.
 */
import { readFile, writeFile, mkdir, readdir, mkdtemp } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Exact successful arrival-taxi controller, with dependencies selected explicitly.
 * Importing this helper neither reads CLI arguments nor starts a journey. */
export async function runTwoSeatsJourney(options = {}) {
  const root = resolve(options.sourceRoot || ROOT);
  const output = resolve(options.output || (await mkdtemp('/tmp/lowlight-two-seats-regression-')));
  const fixture = resolve(
    options.fixture || resolve(root, 'tests/fixtures/campaign-0.6-completed-save.json.gz'),
  );
  const outfit = options.outfit || 'slate-work-jacket';
  if (!output.startsWith('/tmp/')) throw Error('Artifacts belong outside the repository.');
  const load = (file) => import(pathToFileURL(resolve(root, file)).href);
  const API = await load('src/simulation.js');
  const { CampaignJourneyDriver } = await load('tests/campaign-journey-helper.mjs');
  const { getActor, getSeat } = await load('src/companions.js');
  const { INTERIOR_LAYOUTS } = await load('src/interiors.js');
  const { createSceneContext } = await load('src/scene-context.js');
  const { createSceneBodyClearance } = await load('src/scene-body-clearance.js');
  const { findLocalFootPath } = await load('src/local-navigation.js');
  const { findRoute } = await load('src/navigation.js');
  const { storyChoicePresentation } = await load('src/campaign/choice-presentation.js');
  const scenes = createSceneContext(API.WORLD),
    bodies = createSceneBodyClearance(API.WORLD);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));
  const actorIds = ['LL-CHAR-002', 'LL-CHAR-008', 'LL-CHAR-025'];
  class TwoSeatsJourney extends CampaignJourneyDriver {
    step(input = {}, options = {}) {
      super.step(input, options);
      const car = API.currentVehicle(this.state);
      if (!car || Math.abs(car.speed) < 0.1) return;
      const spec = API.VEHICLE_SPECS[car.spec],
        c = Math.cos(car.angle),
        sn = Math.sin(car.angle);
      for (const actor of this.state.companions.actors) {
        if (
          actor.health <= 0 ||
          actor.vehicleId ||
          actor.inVehicle ||
          ['boarding', 'exiting'].includes(actor.companionPhase) ||
          (actor.sceneId ?? null) !== (car.sceneId ?? null) ||
          (actor.z ?? 0) >= (car.z ?? 0) + 16 ||
          (actor.z ?? 0) + 30 <= (car.z ?? 0)
        )
          continue;
        const dx = actor.x - car.x,
          dy = actor.y - car.y,
          forward = dx * c + dy * sn,
          right = -dx * sn + dy * c,
          gap = Math.hypot(
            forward - Math.max(-spec.length / 2, Math.min(spec.length / 2, forward)),
            right - Math.max(-spec.width / 2, Math.min(spec.width / 2, right)),
          );
        if (gap < (actor.radius ?? 7) - 1e-6)
          throw Error(
            'Actual moving car intersects canonical foot body even below damage speed: ' + actor.id,
          );
      }
    }
    log(event, extra = {}) {
      const entry = { event, ...this.read(), extra };
      this.report.timeline.push(entry);
      if (!options.quiet)
        process.stdout.write(
          JSON.stringify({
            event,
            time: entry.time,
            stage: entry.stage,
            player: entry.player,
            extra,
          }) + '\n',
        );
      return entry;
    }
    read() {
      const v = API.storyView(this.state);
      return {
        ...super.read(),
        choiceReady: v?.choiceReady,
        dropoffs: clone(v?.dropoffs ?? []),
        dax: clone(getActor(this.state, 'LL-ARC-DAX')),
        seats: actorIds.map((id) => ({ id, seat: clone(getSeat(this.state, id)) })),
      };
    }
    walkTo(target, options = {}) {
      const s = this.state,
        sceneId = s.player.sceneId ?? null,
        geometry = scenes.queries(s, sceneId),
        room = INTERIOR_LAYOUTS[sceneId];
      const vehicleBlocked = (x, y, radius, z) =>
        s.vehicles.some((car) => {
          if (
            car.health <= 0 ||
            (car.sceneId ?? null) !== sceneId ||
            z < (car.z ?? 0) - 4 ||
            z >= (car.z ?? 0) + 16
          )
            return false;
          const spec = API.VEHICLE_SPECS[car.spec],
            c = Math.cos(car.angle),
            sn = Math.sin(car.angle),
            dx = x - car.x,
            dy = y - car.y,
            a = dx * c + dy * sn,
            b = -dx * sn + dy * c;
          return (
            Math.hypot(
              a - Math.max(-spec.length / 2, Math.min(spec.length / 2, a)),
              b - Math.max(-spec.width / 2, Math.min(spec.width / 2, b)),
            ) < radius
          );
        });
      const query = {
        surfaceHeight: (x, y, z) => geometry.surfaceHeight(x, y, z),
        isBlocked: (x, y, radius, z) =>
          !bodies.inspect(s, { x, y, z, radius, height: 30 }, { sceneId }).clear ||
          vehicleBlocked(x, y, radius, z),
        segmentBlocked: (a, b, radius) =>
          !bodies.sweep(s, a, b, { sceneId, radius, height: 30 }).clear ||
          vehicleBlocked(
            (a.x + b.x) / 2,
            (a.y + b.y) / 2,
            radius + distance(a, b) / 2,
            Math.min(a.z ?? 0, b.z ?? 0),
          ),
      };
      const path = findLocalFootPath(
        query,
        { ...s.player, sceneId },
        { ...target, sceneId },
        {
          bounds: room ? { x: 0, y: 0, w: room.width, h: room.height } : API.WORLD.bounds,
          radius: 7,
          maxChecks: 60000,
          maxNodes: 4096,
        },
      );
      if (!path.length)
        throw Error('No calibrated standing foot route to ' + JSON.stringify(target));
      for (let i = 1; i < path.length; i++)
        assertClear(
          bodies.sweep(s, path[i - 1], path[i], { sceneId, radius: 7, height: 30 }),
          path[i],
        );
      this.log('actual-full-body-foot-route', { target, path });
      this.walk(path, options);
    }
    exitRoom() {
      const room = INTERIOR_LAYOUTS[this.state.player.sceneId];
      if (!room) return;
      const door = room.doors.find((d) => d.exit);
      this.walkTo({ x: door.x + door.w / 2, y: door.y - 12, z: room.floorZ }, { radius: 1 });
      if (!this.state.interior.rooms[room.id].doors[door.id].open)
        this.interact('open-real-room-door');
      this.waitUntil(() => !this.state.interior.active, {
        seconds: 8,
        label: 'actual-room-exit',
        input: { moveY: 1 },
      });
    }
    boardTaxi() {
      const car = this.state.vehicles.find((v) => v.id === 'arc-arrival-taxi');
      if (!car || car.health <= 0) throw Error('Surviving actual taxi unavailable.');
      const spec = API.VEHICLE_SPECS[car.spec],
        forward = spec.length * 0.12,
        right = -(spec.width / 2 + 9),
        target = {
          x: car.x + Math.cos(car.angle) * forward - Math.sin(car.angle) * right,
          y: car.y + Math.sin(car.angle) * forward + Math.cos(car.angle) * right,
          z: car.z ?? 0,
        };
      if (API.nearestInteractable(this.state)?.id !== car.id) this.walkTo(target, { radius: 1 });
      if (API.nearestInteractable(this.state)?.id !== car.id)
        throw Error('Actual taxi door cannot be reached.');
      this.interact('actual-taxi-entry');
      if (API.currentVehicle(this.state)?.id !== car.id) throw Error('Actual boarding failed.');
    }
    forwardAlong(points, { radius = 2 } = {}) {
      let i = 1;
      const goal = points.at(-1),
        until = this.state.time + 90;
      while (this.state.time < until) {
        const car = API.currentVehicle(this.state);
        while (i < points.length - 1 && distance(car, points[i]) < 4) i++;
        const remaining = distance(car, goal);
        if (remaining < radius) {
          this.stop(1.5);
          return;
        }
        const target = points[Math.min(points.length - 1, i + 2)],
          desired = Math.atan2(target.y - car.y, target.x - car.x),
          error = Math.atan2(Math.sin(desired - car.angle), Math.cos(desired - car.angle)),
          speed = Math.min(15, Math.max(4, remaining * 1.2));
        this.step({
          up: car.speed < speed - 1,
          brake: Math.abs(car.speed) > speed + 2,
          right: error > 0.04,
          left: error < -0.04,
        });
      }
      throw Error('Actual steering/throttle could not reach marked bay.');
    }
    parked(binding) {
      const car = API.currentVehicle(this.state),
        spec = car && API.VEHICLE_SPECS[car.spec],
        bay = binding.bay ?? binding.parkingBay,
        expected = bay?.angle;
      if (!car || !bay || Math.abs(car.speed) >= 2) return false;
      if (
        Number.isFinite(expected) &&
        Math.abs(Math.atan2(Math.sin(car.angle - expected), Math.cos(car.angle - expected))) >
          (bay.angleTolerance ?? 0.3) + 1e-6
      )
        return false;
      for (const along of [-spec.length / 2, spec.length / 2])
        for (const across of [-spec.width / 2, spec.width / 2]) {
          const x = car.x + Math.cos(car.angle) * along - Math.sin(car.angle) * across,
            y = car.y + Math.sin(car.angle) * along + Math.cos(car.angle) * across;
          if (
            x < bay.x - 1e-6 ||
            x > bay.x + bay.w + 1e-6 ||
            y < bay.y - 1e-6 ||
            y > bay.y + bay.h + 1e-6
          )
            return false;
        }
      return true;
    }
    reverseTo(target) {
      const until = this.state.time + 25;
      while (this.state.time < until) {
        const car = API.currentVehicle(this.state);
        if (distance(car, target) < 2) {
          this.stop(1);
          return;
        }
        const desired = Math.atan2(target.y - car.y, target.x - car.x) + Math.PI,
          error = Math.atan2(Math.sin(desired - car.angle), Math.cos(desired - car.angle));
        this.step({
          down: car.speed > -7,
          brake: Math.abs(car.speed) > 10,
          right: error < -0.04,
          left: error > 0.04,
        });
      }
      throw Error('Real reverse controls did not reach the safe bay approach correction mark.');
    }
    park(binding, { radius = 2 } = {}) {
      const approach = binding.approach ?? binding.taxiApproach;
      if (!approach?.length) throw Error('Missing physical bay approach.');
      this.driveTo(approach[0], { speed: 20, radius: 2 });
      this.forwardAlong(approach, { radius });
      this.stop(1.5);
      for (let correction = 0; !this.parked(binding) && correction < 2; correction++) {
        this.log('actual-bay-alignment-correction', { bay: binding.bay ?? binding.parkingBay });
        this.reverseTo(approach.at(-2));
        this.forwardAlong(approach.slice(-2), { radius });
        this.stop(1.5);
      }
      if (!this.parked(binding))
        throw Error(
          'Input controller failed full stopped footprint/heading admission; no boarding outcome is assumed.',
        );
      this.log('actual-full-footprint-parked', { bay: binding.bay ?? binding.parkingBay });
    }
    async continueAt(name) {
      const bytes = await this.snapshot(name),
        before = JSON.parse(bytes).state;
      this.state = API.restoreGame(bytes);
      for (const key of [
        'player',
        'companions',
        'transit',
        'railSignals',
        'campaign',
        'twoSeatsRuntime',
        'twoSeatsEffects',
        'calendar',
      ])
        assert.deepEqual(this.state[key], before[key], 'Actual Continue preserves ' + key);
      this.report.continues ??= [];
      this.report.continues.push({
        name,
        time: this.state.time,
        money: this.state.player.money,
        method: 'actual saveGame bytes and restoreGame replacement, followed by ordinary input',
      });
      this.log('actual-Save-Continue', { name });
    }
    async startAndDisarm() {
      const d = API.WORLD.campaignSceneBindings.dispatch;
      if (this.state.player.vehicleId) this.interact('exit-completed-M2-taxi');
      if (this.state.interior.active) this.exitRoom();
      this.walkTo(d.entry, { radius: 1 });
      const door = API.nearestInteractable(this.state);
      if (door?.type !== 'interior-portal' || door.roomId !== d.roomId)
        throw Error('Actual E selects ' + JSON.stringify(door) + ' rather than the Dispatch door.');
      this.interact('Dispatch-door-E');
      if (this.state.player.sceneId !== d.roomId)
        throw Error('Actual Dispatch doorway input did not enter its room.');
      const felix = getActor(this.state, 'LL-CHAR-002');
      if (!felix || felix.health <= 0 || felix.sceneId !== 'voss-dispatch')
        throw Error('Persistent living Felix not at Dispatch.');
      this.walkTo({ x: felix.x + 22, y: felix.y, z: felix.z ?? 0 }, { radius: 1 });
      const result = API.startStoryMission(this.state, 'LL-ST-003');
      this.log('actual-M3-assignment-acceptance', { result });
      if (!result.ok) throw Error('Actual M3 readiness refused: ' + JSON.stringify(result));
      await this.snapshot('dispatch-accepted-before-dialogue');
      const target = API.storyView(this.state).target;
      if (
        target &&
        !API.storyView(this.state).dialogueReady &&
        distance(this.state.player, target) > 25
      )
        this.walkTo({ x: target.x + 22, y: target.y, z: target.z ?? 0 }, { radius: 1 });
      this.waitUntil(
        () =>
          this.state.campaign.active.dialogue.index ===
          this.state.campaign.active.dialogue.lines.length,
        { seconds: 30, label: 'actual-four-presented-threat-lines' },
      );
      const dax = () => getActor(this.state, 'LL-ARC-DAX');
      this.waitUntil(() => !!dax()?.meleeAction, {
        seconds: 15,
        label: 'actual-approaching-blade-strike',
        input: {
          aimAngle: Math.atan2(dax().y - this.state.player.y, dax().x - this.state.player.x),
        },
      });
      this.waitUntil(() => this.state.player.counterWindow?.attackerId === 'LL-ARC-DAX', {
        seconds: 3,
        label: 'actual-timed-guard-window',
        input: {
          block: true,
          aimAngle: Math.atan2(dax().y - this.state.player.y, dax().x - this.state.player.x),
        },
      });
      this.step({
        block: true,
        disarm: true,
        aimAngle: Math.atan2(dax().y - this.state.player.y, dax().x - this.state.player.x),
      });
      if (dax().weapon !== 'unarmed' || !this.state.twoSeatsRuntime.run.injury)
        throw Error('Guarded disarm did not produce the actual saved wrist injury.');
      await this.continueAt('actual-wrist-before-retreat');
      this.waitUntil(() => API.storyView(this.state).stageId === 'pickup', {
        seconds: 70,
        label: 'both-actual-collector-exterior-retreats',
      });
      await this.snapshot('pickup-ready');
    }
    driveToDispatch(binding) {
      // The equal-length northern road route avoids the observed parked taxi just
      // before the southern route's corner, where the generic lane controller
      // intentionally merges toward the next waypoint. Every input still uses
      // the original driving physics, collision and ordinary obstruction recovery.
      const avenue = API.WORLD.roads.find((r) => r.id === 'avenue-1'),
        street = API.WORLD.roads.find((r) => r.id === 'street-1');
      if (!avenue?.access?.includes('car') || !street?.access?.includes('car'))
        throw Error('Actual legal alternate Dispatch road intersection is unavailable.');
      const via = { x: avenue.x1, y: street.y1, z: street.z ?? 0 },
        car = API.currentVehicle(this.state),
        route = findRoute(API.WORLD, car, via, { mode: 'car', includeZ: true }),
        points = [car, ...route],
        radius = API.VEHICLE_SPECS[car.spec].width * 0.62;
      if (!route.length)
        throw Error('No legal road route exists to alternate Dispatch intersection.');
      for (let i = 1; i < points.length; i++)
        assertClear(
          bodies.sweep(this.state, points[i - 1], points[i], {
            sceneId: null,
            radius,
            height: 16,
          }),
          points[i],
        );
      this.log('checked-legal-Dispatch-road-detour', {
        via,
        route,
        obstruction: this.state.vehicles.find((v) => v.id === 'starter-taxi') && {
          id: 'starter-taxi',
          x: this.state.vehicles.find((v) => v.id === 'starter-taxi').x,
          y: this.state.vehicles.find((v) => v.id === 'starter-taxi').y,
        },
      });
      this.driveTo(via, { speed: 18, radius: 3, route });
      const bay = binding.stop,
        crossing = API.WORLD.roads.find((r) => r.id === 'street-2'),
        centre = { x: bay.x + bay.w / 2, y: bay.y + bay.h / 2, z: bay.z ?? 0 },
        west = bay.x - 39,
        turnRadius = (centre.y - crossing.y1) / 2,
        approach = [{ x: west, y: crossing.y1, z: centre.z, angle: Math.PI }];
      if (!crossing?.access?.includes('car') || turnRadius <= 0 || bay.angle !== 0)
        throw Error('Actual east-facing Dispatch rank approach is unsupported.');
      for (let i = 1; i <= 36; i++) {
        const theta = -Math.PI / 2 - (Math.PI * i) / 36;
        approach.push({
          x: west + turnRadius * Math.cos(theta),
          y: crossing.y1 + turnRadius + turnRadius * Math.sin(theta),
          z: centre.z,
          angle: Math.atan2(-Math.cos(theta), Math.sin(theta)),
        });
      }
      approach.push({ ...centre, angle: bay.angle });
      for (let i = 1; i < approach.length; i++)
        assertClear(
          bodies.sweep(this.state, approach[i - 1], approach[i], {
            sceneId: null,
            radius,
            height: 16,
          }),
          approach[i],
        );
      this.log('checked-east-facing-Dispatch-rank-approach', { bay, approach });
      this.park({ bay, approach }, { radius: 0.7 });
    }
    async passengers() {
      const station = API.WORLD.campaignSceneBindings['boardwalk-station'];
      this.exitRoom();
      this.boardTaxi();
      this.waitUntil(() => getSeat(this.state, 'LL-CHAR-002')?.seat === 2, {
        seconds: 30,
        label: 'actual-Felix-seat2',
        input: { brake: true },
      });
      this.park(station);
      this.waitUntil(() => API.storyView(this.state).stageId === 'home', {
        seconds: 100,
        label: 'actual-three-passengers-and-four-presented-introductions',
        input: { brake: true },
      });
      for (const [id, seat] of [
        ['LL-CHAR-002', 2],
        ['LL-CHAR-008', 1],
        ['LL-CHAR-025', 3],
      ])
        if (getSeat(this.state, id)?.seat !== seat)
          throw Error('Wrong actual passenger slot: ' + id);
      await this.continueAt('all-four-seats');
      const flat = API.WORLD.campaignSceneBindings['tess-flat'];
      this.park(flat);
      this.waitUntil(() => this.state.twoSeatsRuntime.run.dropoffs.length === 1, {
        seconds: 60,
        label: 'actual-Tess-exit-doorway-and-first-drop',
        input: { brake: true },
      });
      const d = API.WORLD.campaignSceneBindings.dispatch;
      this.driveToDispatch(d);
      this.stop(2);
      this.waitUntil(() => API.storyView(this.state).stageId === 'workwear', {
        seconds: 70,
        label: 'actual-Nadia-exit-Dispatch-second-drop-and-Tess-contact',
        input: { brake: true },
      });
      await this.snapshot('outfit-ready');
    }
    async purchase() {
      const shop = API.WORLD.campaignSceneBindings['pier-goods'];
      this.park(shop);
      this.interact('actual-Pier-Goods-taxi-exit');
      this.walkTo(shop.entry, { radius: 1 });
      const door = API.nearestInteractable(this.state);
      if (door?.type !== 'interior-portal' || door.roomId !== shop.roomId)
        throw Error('Actual E does not select the Pier Goods door.');
      this.interact('Pier-Goods-door-E');
      if (this.state.player.sceneId !== shop.roomId)
        throw Error('Actual Pier Goods doorway input did not enter its room.');
      const hook = INTERIOR_LAYOUTS['pier-goods'].hooks.find(
        (h) => h.service === 'pier-goods-selector',
      );
      this.walkTo({ x: hook.x, y: hook.y, z: 0 }, { radius: 1 });
      this.waitUntil(() => !!storyChoicePresentation(API.storyView(this.state)), {
        seconds: 60,
        label: 'actual-three-Bea-intro-lines-and-local-Felix-shop-ready',
      });
      const choice = storyChoicePresentation(API.storyView(this.state));
      if (!choice.options.some((x) => x.id === outfit))
        throw Error('Actual UI choice excludes requested outfit.');
      const before = this.state.player.money,
        result = API.selectStoryChoice(this.state, choice.id, outfit);
      this.log('actual-public-voucher-outfit-choice', { outfit, result });
      if (!result.ok) throw Error('Actual voucher purchase refused.');
      if (this.state.player.money !== before) throw Error('Starter voucher charged cash.');
      this.waitUntil(() => !!this.state.campaign.completed['LL-ST-003'], {
        seconds: 30,
        label: 'actual-equipped-outfit-final-local-dialogue-and-M3-completion',
      });
      if (this.state.wardrobe.equipped !== outfit) throw Error('Actual selected outfit not worn.');
      const receipts = this.state.twoSeatsRuntime.run.dropoffs;
      if (receipts.map((r) => r.actorId).join(',') !== 'LL-CHAR-025,LL-CHAR-008')
        throw Error('Actual dropoff order wrong.');
      await this.snapshot('completed-two-seats');
    }
    async runTwoSeats() {
      await mkdir(output, { recursive: true });
      const bytes = await readFile(fixture),
        raw = fixture.endsWith('.gz') ? gunzipSync(bytes) : bytes;
      this.state = API.restoreGame(raw.toString());
      this.report.boundary =
        'Genuine published completed M1/M2 whole save and surviving arrival-taxi scenario, then ordinary simulation inputs, exact calibrated foot paths and declared public caption/choice/Save/Continue APIs. Actual Continue replaces state from real saved bytes; no other state edits. Not alternate-car or natural browser completion proof.';
      this.report.initialFixture = {
        path: fixture,
        sha256: createHash('sha256').update(raw).digest('hex'),
      };
      this.report.sourceRoot = root;
      this.report.initial = {
        time: this.state.time,
        money: this.state.player.money,
        health: this.state.player.health,
        deaths: this.state.progress.deaths,
        arrests: this.state.progress.arrests,
        cast: this.state.companions.actors.map((a) => ({ id: a.id, health: a.health })),
        arrivalTaxiId: this.state.vehicles.find((v) => v.id === 'arc-arrival-taxi')?.id ?? null,
      };
      const scan = async (dir) => {
        for (const e of await readdir(resolve(root, dir), { withFileTypes: true })) {
          const f = dir + '/' + e.name;
          if (e.isDirectory()) await scan(f);
          else if (f.endsWith('.js'))
            this.report.sourceHashes[f] = createHash('sha256')
              .update(await readFile(resolve(root, f)))
              .digest('hex');
        }
      };
      await scan('src');
      try {
        this.log('genuine-completed-M1-M2-save');
        await this.startAndDisarm();
        await this.passengers();
        await this.purchase();
        this.report.status = 'completed-by-production-input';
      } catch (error) {
        this.report.status = 'incomplete';
        this.report.error = String(error.stack ?? error);
        try {
          await writeFile(resolve(output, 'failed-observation.json'), API.saveGame(this.state));
        } catch (e) {
          this.report.failureSnapshotError = e.message;
        }
      } finally {
        this.report.final = this.read();
        this.report.sourceChanges = [];
        for (const [f, h] of Object.entries(this.report.sourceHashes))
          if (
            createHash('sha256')
              .update(await readFile(resolve(root, f)))
              .digest('hex') !== h
          )
            this.report.sourceChanges.push(f);
        await writeFile(
          resolve(output, 'report.json'),
          JSON.stringify(this.report, null, 2) + '\n',
        );
      }
      return this.report;
    }
  }
  function assertClear(result, point) {
    if (!result.clear)
      throw Error('Planned actual body sweep rejected: ' + JSON.stringify({ point, result }));
  }
  const driver = new TwoSeatsJourney({ dt: options.dt ?? 0.05, output });
  const report = await driver.runTwoSeats();
  return { report, state: driver.state };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2),
    option = (key) => {
      const index = args.indexOf(key);
      return index < 0 ? undefined : args[index + 1];
    };
  const { report } = await runTwoSeatsJourney({
    sourceRoot: option('--source-root'),
    output: option('--output'),
    fixture: option('--fixture'),
    outfit: option('--outfit'),
    dt: option('--dt') === undefined ? undefined : Number(option('--dt')),
    quiet: args.includes('--quiet'),
  });
  process.stdout.write(
    JSON.stringify({
      status: report.status,
      error: report.error,
      output: report.snapshots['completed-two-seats']?.file,
    }) + '\n',
  );
  if (report.status !== 'completed-by-production-input') process.exitCode = 1;
}
