#!/usr/bin/env node
/** Declared production-save setup, then actual simulation controls/public UI APIs only.
 * Deterministic parent orchestration; not a natural keyboard/browser playthrough. */
import { readFile, writeFile, mkdir, readdir, mkdtemp } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function runLateMeterJourney(options = {}) {
  const sourceRoot = resolve(options.sourceRoot || ROOT);
  const output = resolve(options.output || (await mkdtemp('/tmp/lowlight-late-meter-regression-')));
  const fixture = resolve(
    options.fixture || resolve(sourceRoot, 'tests/fixtures/campaign-0.5-completed-save.json.gz'),
  );
  if (!output.startsWith('/tmp/')) throw Error('Journey artifacts must be in /tmp.');
  const load = (file) => import(pathToFileURL(resolve(sourceRoot, file)).href);
  const API = await load('src/simulation.js');
  const { CampaignJourneyDriver } = await load('tests/campaign-journey-helper.mjs');
  const { INTERIOR_LAYOUTS } = await load('src/interiors.js');
  const { getActor, getSeat } = await load('src/companions.js');
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const required = [
    'startStoryMission',
    'recognizeStoryActor',
    'storyPhoneView',
    'presentStoryPhoneLine',
    'actStoryPhone',
    'dialStoryWarning',
    'hideStoryPhone',
  ];
  for (const key of required)
    if (typeof API[key] !== 'function') throw Error(`Integrated public API missing:${key}`);
  class LateMeterJourney extends CampaignJourneyDriver {
    constructor(options) {
      super(options);
      this.phoneKey = null;
      this.phoneShownAt = 0;
      this.native = null;
      this.report.boundary =
        'Declared production-validated completed Night Crossing save, then ordinary simulation controls, native rendering and explicit public caption/phone/recognition actions. No later actor, vehicle, world, director, health, inventory, receipt or clock mutation. Not natural browser completion.';
      this.report.attempts = [];
    }
    log(event, extra = {}) {
      const item = { event, ...this.read(), extra };
      this.report.timeline.push(item);
      if (!options.quiet)
        process.stdout.write(
          JSON.stringify({
            event,
            time: item.time,
            stage: item.stage,
            player: item.player,
            extra,
          }) + '\n',
        );
      return item;
    }
    read() {
      const r = super.read(),
        v = API.storyView(this.state);
      return {
        ...r,
        phone: API.storyPhoneView(this.state),
        pursuit: v?.pursuit,
        warningSecondsRemaining: v?.warningSecondsRemaining,
        recognitionReady: v?.recognitionReady,
        lateMeterPhase: this.state.lateMeterRuntime?.active?.phase,
      };
    }
    presentCaptions() {
      super.presentCaptions();
      const p = API.storyPhoneView(this.state);
      if (!p?.line) {
        this.phoneKey = null;
        return;
      }
      const key = `${p.id}:${p.line.dialCount}:${p.line.index}`;
      if (key !== this.phoneKey) {
        this.phoneKey = key;
        this.phoneShownAt = this.state.time;
        this.log('actual-phone-caption-presented', {
          speaker: p.line.speaker,
          text: p.line.text,
          token: key,
        });
      }
      const token = { callId: p.id, index: p.line.index, dialCount: p.line.dialCount };
      if (!API.presentStoryPhoneLine(this.state, token))
        throw Error('Actual phone token presentation rejected.');
      if (this.state.time - this.phoneShownAt >= 0.45) {
        const result = API.actStoryPhone(this.state, {
          type: 'acknowledge',
          id: p.id,
          index: p.line.index,
          dialCount: p.line.dialCount,
        });
        this.log('actual-phone-line-acknowledgment', { token, result });
        if (!result.ok && !result.acknowledged)
          throw Error('Actual presented phone acknowledgment rejected.');
      }
    }
    exitRoom() {
      const room = INTERIOR_LAYOUTS[this.state.player.sceneId];
      if (!room) return;
      const door = room.doors.find((d) => d.exit);
      if (!door) throw Error('No actual room exit.');
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
      if (!car || car.health <= 0) throw Error('Owned real taxi unavailable; no free replacement.');
      const spec = API.VEHICLE_SPECS[car.spec],
        forward = spec.length * 0.12,
        right = -(spec.width / 2 + 9),
        target = {
          x: car.x + Math.cos(car.angle) * forward - Math.sin(car.angle) * right,
          y: car.y + Math.sin(car.angle) * forward + Math.cos(car.angle) * right,
          z: car.z || 0,
        };
      if (API.nearestInteractable(this.state)?.id !== car.id) this.walkTo(target, { radius: 1 });
      for (const offset of [12, -12]) {
        if (API.nearestInteractable(this.state)?.id === car.id) break;
        this.walkTo(
          {
            x: target.x + Math.cos(car.angle) * offset,
            y: target.y + Math.sin(car.angle) * offset,
            z: target.z,
          },
          { radius: 1 },
        );
      }
      if (API.nearestInteractable(this.state)?.id !== car.id)
        throw Error('Normal E entry does not select the real taxi after ordinary side approaches.');
      this.interact('actual-owned-taxi-entry');
      if (API.currentVehicle(this.state)?.id !== car.id) throw Error('Actual taxi entry failed.');
    }
    async pickupAndAccept() {
      if (this.state.interior.active) this.exitRoom();
      this.boardTaxi();
      const d = API.WORLD.campaignSceneBindings.dispatch;
      this.driveTo({ x: 385, y: 748, z: 0 }, { speed: 23, radius: 2 });
      this.driveTo(d.target, {
        speed: 12,
        radius: 1.2,
        route: [{ x: 385, y: 748, z: 0 }, d.target],
      });
      this.stop(1.5);
      this.interact('actual-dispatch-taxi-exit');
      this.walkTo(d.entry, { radius: 1 });
      this.interact('actual-dispatch-office-entry');
      const felix = getActor(this.state, 'LL-CHAR-002');
      if (felix?.sceneId !== 'voss-dispatch') throw Error('Persistent Felix not at real office.');
      this.walkTo({ x: 200, y: felix.y, z: 0 }, { radius: 1 });
      const start = API.startStoryMission(this.state, 'LL-ST-002');
      this.log('actual-dispatch-assignment-acceptance', { start });
      if (!start.ok) throw Error(`Physical acceptance rejected:${JSON.stringify(start)}`);
      this.exitRoom();
      this.boardTaxi();
      this.waitUntil(
        () => getSeat(this.state, 'LL-CHAR-002')?.vehicleId === API.currentVehicle(this.state)?.id,
        { seconds: 25, label: 'actual-living-felix-pickup', input: { brake: true } },
      );
    }
    parkAnnex() {
      const a = API.WORLD.campaignSceneBindings['impound-counter'];
      this.driveTo({ x: 100, y: 440, z: 0 }, { speed: 23, radius: 2 });
      this.driveTo(a.taxiApproach[0], {
        speed: 12,
        radius: 1.2,
        route: [{ x: 100, y: 440, z: 0 }, a.taxiApproach[0]],
      });
      this.forwardAlong(a.taxiApproach);
      this.stop(2);
      this.waitUntil(() => API.storyView(this.state)?.stageId === 'lookout', {
        seconds: 30,
        label: 'actual-counter-room-delivery-and-bay',
        input: { brake: true },
      });
    }
    async recognizeAndCall() {
      this.waitUntil(() => API.storyView(this.state)?.recognitionReady, {
        seconds: 30,
        label: 'actual-two-line-bargaining-exchange',
        input: { brake: true },
      });
      let recognized = false,
        lastRender = -10;
      const until = this.state.time + 35;
      while (this.state.time < until && !recognized) {
        if (this.state.time - lastRender >= 0.2) {
          const rendered = this.native.draw(this.state);
          this.report.nativeFrames ??= [];
          this.report.nativeFrames.push(rendered);
          lastRender = this.state.time;
          const result = API.recognizeStoryActor(
            this.state,
            'LL-ARC-REEVE',
            `journey:recognition:${this.report.inputFrames}`,
          );
          if (result.ok) {
            recognized = true;
            this.native.export(resolve(this.output, 'recognized-clues.png'));
            this.log('actual-native-visible-clue-recognition', { result });
          }
        }
        if (!recognized) this.step({ brake: true });
      }
      if (!recognized) throw Error('No actual native camera/LOS/clue recognition before timeout.');
      this.waitUntil(
        () =>
          API.storyView(this.state)?.stageId === 'warn' &&
          Object.hasOwn(
            this.state.phoneCalls.calls,
            this.state.lateMeterRuntime.run.warning.callId,
          ),
        { seconds: 1, label: 'actual-warning-stage-registered', input: { brake: true } },
      );
      await this.snapshot('warn-before-dial');
      const before = this.state.lateMeterRuntime.run.recognition.at,
        wrong = API.dialStoryWarning(
          this.state,
          'dispatch-line',
          'phone',
          `journey:wrong-contact:${this.report.inputFrames}`,
        );
      this.log('actual-wrong-known-contact', { wrong });
      if (wrong.ok || this.state.lateMeterRuntime.run.recognition.at !== before)
        throw Error('Wrong contact changed physical warning evidence.');
      this.step({ brake: true });
      const dial = API.dialStoryWarning(
        this.state,
        'LL-CHAR-002',
        'phone',
        `journey:felix-contact:${this.report.inputFrames}`,
      );
      this.log('actual-felix-outgoing-call', { dial });
      if (!dial.ok) throw Error('Actual outgoing call could not begin.');
      this.waitUntil(() => API.storyView(this.state)?.stageId === 'extract', {
        seconds: 18,
        label: 'actual-presented-warning-and-extraction',
        input: { brake: true },
      });
      await this.snapshot('extract-before-board');
    }
    forwardAlong(path) {
      let index = 1;
      const goal = path.at(-1),
        deadline = this.state.time + 60;
      while (this.state.time < deadline) {
        const car = API.currentVehicle(this.state);
        while (index < path.length - 1 && distance(car, path[index]) < 4) index++;
        const remaining = distance(car, goal);
        if (remaining < 2.5) {
          this.stop(1.5);
          this.log('actual-forward-marked-bay-park');
          return;
        }
        const target = path[Math.min(path.length - 1, index + 3)],
          desired = Math.atan2(target.y - car.y, target.x - car.x),
          error = Math.atan2(Math.sin(desired - car.angle), Math.cos(desired - car.angle)),
          limit = Math.min(18, Math.max(4, remaining * 1.3));
        this.step({
          up: car.speed < limit - 1,
          brake: Math.abs(car.speed) > limit + 2,
          right: error > 0.04,
          left: error < -0.04,
        });
      }
      throw Error('Actual throttle/steering could not park in marked bay.');
    }
    reverseAlong(path) {
      let index = 1;
      const goal = path.at(-1),
        deadline = this.state.time + 50;
      while (this.state.time < deadline) {
        const car = API.currentVehicle(this.state);
        while (index < path.length - 1 && distance(car, path[index]) < 4) index++;
        const remaining = distance(car, goal);
        if (remaining < 3) {
          this.stop(1.5);
          this.log('actual-reverse-bay-exit');
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
      throw Error('Actual reverse controls could not leave marked bay.');
    }
    escape() {
      this.waitUntil(
        () => getSeat(this.state, 'LL-CHAR-002')?.vehicleId === API.currentVehicle(this.state)?.id,
        { seconds: 25, label: 'actual-felix-annex-exit-and-boarding', input: { brake: true } },
      );
      const a = API.WORLD.campaignSceneBindings['impound-counter'];
      this.reverseAlong(a.taxiExit);
      this.driveTo({ x: 1000, y: 440, z: 0 }, { speed: 85, radius: 6 });
      this.waitUntil(() => API.storyView(this.state)?.stageId === 'return', {
        seconds: 65,
        label: 'actual-routed-driver-los-escape',
        input: { brake: true },
      });
    }
    finishReturn() {
      const d = API.WORLD.campaignSceneBindings.dispatch;
      this.driveTo({ x: 385, y: 748, z: 0 }, { speed: 30, radius: 2 });
      this.driveTo(d.target, {
        speed: 12,
        radius: 1.2,
        route: [{ x: 385, y: 748, z: 0 }, d.target],
      });
      this.stop(2);
      this.waitUntil(() => !!this.state.campaign.completed['LL-ST-002'], {
        seconds: 35,
        label: 'actual-return-dialogue-office-delivery-and-reward',
        input: { brake: true },
      });
    }
    async runLate() {
      await mkdir(this.output, { recursive: true });
      const fixtureDisk = await readFile(fixture),
        fixtureBytes = fixture.endsWith('.gz') ? gunzipSync(fixtureDisk) : fixtureDisk;
      this.state = API.restoreGame(fixtureBytes.toString('utf8'));
      this.report.initialFixture = {
        path: fixture,
        sha256: createHash('sha256').update(fixtureBytes).digest('hex'),
        compressed: fixture.endsWith('.gz'),
        loadedBy: 'production restoreGame, initial setup only',
      };
      this.report.sourceRoot = sourceRoot;
      this.report.sourceHashes = {};
      const scan = async (dir) => {
        for (const e of await readdir(resolve(sourceRoot, dir), { withFileTypes: true })) {
          let f = `${dir}/${e.name}`;
          if (e.isDirectory()) await scan(f);
          else if (f.endsWith('.js'))
            this.report.sourceHashes[f] = createHash('sha256')
              .update(await readFile(resolve(sourceRoot, f)))
              .digest('hex');
        }
      };
      await scan('src');
      try {
        const { createJourneyRenderer } = await import(
          pathToFileURL(resolve(ROOT, 'tests/helpers/campaign-native-renderer.mjs')).href
        );
        this.native = await createJourneyRenderer(
          sourceRoot,
          options.captureFrames ? { output: this.output } : {},
        );
        this.log('declared-initial-completed-save');
        if (
          !this.state.campaign.completed['LL-ST-001'] ||
          this.state.campaign.completed['LL-ST-002']
        )
          throw Error('Initial fixture must contain completed Night Crossing only.');
        this.report.initialMoney = this.state.player.money;
        const idleStartedAt = this.state.time,
          preparationSeconds = options.preparationSeconds ?? 180;
        if (
          !Number.isFinite(preparationSeconds) ||
          preparationSeconds < 0 ||
          preparationSeconds > 180
        )
          throw Error('Preparation idle must be within 0..180 real simulation seconds.');
        // The authentic prepared scenario used 10800 ordinary 60 Hz frames.
        // Parent-frame cadence affects ambient traffic RNG; retain that cadence
        // before switching to the separately declared 0.1 s route-input driver.
        const routeTimestep = this.dt;
        this.dt = 1 / 60;
        for (let frame = 0; frame < Math.round(preparationSeconds * 60); frame++) this.step({});
        this.dt = routeTimestep;
        this.report.preassignmentIdle = {
          startedAt: idleStartedAt,
          endedAt: this.state.time,
          seconds: preparationSeconds,
          frames: Math.round(preparationSeconds * 60),
          timestep: 1 / 60,
          routeTimestep,
          method: 'ordinary updateSimulation input frames; every physical step processed',
        };
        this.waitUntil(
          () =>
            this.state.lateMeterRuntime?.preparation.ready &&
            getActor(this.state, 'LL-CHAR-002')?.sceneId === 'voss-dispatch',
          { seconds: 180, label: 'actual-felix-dockside-to-dispatch-preparation' },
        );
        await this.pickupAndAccept();
        this.parkAnnex();
        await this.recognizeAndCall();
        this.escape();
        this.finishReturn();
        await this.snapshot('completed-late-meter');
        this.report.status = 'completed-by-production-input';
      } catch (error) {
        this.report.status = 'blocked';
        this.report.error = String(error.stack || error);
        this.log('honest-late-meter-blocker', { error: error.message });
        try {
          await writeFile(
            resolve(this.output, 'failed-observation.json'),
            API.saveGame(this.state),
          );
        } catch (e) {
          this.report.failureSnapshotError = e.message;
        }
      } finally {
        this.report.finishedAt = new Date().toISOString();
        this.report.final = this.read();
        this.report.finalMoney = this.state.player.money;
        this.report.sourceChanges = [];
        for (const [f, h] of Object.entries(this.report.sourceHashes))
          if (
            createHash('sha256')
              .update(await readFile(resolve(sourceRoot, f)))
              .digest('hex') !== h
          )
            this.report.sourceChanges.push(f);
        await writeFile(
          resolve(this.output, 'report.json'),
          JSON.stringify(this.report, null, 2) + '\n',
        );
        this.native?.dispose?.();
      }
      return this.report;
    }
  }
  const driver = new LateMeterJourney({ output, dt: options.dt ?? 0.1 });
  const report = await driver.runLate();
  return { report, state: driver.state };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2),
    option = (key) => {
      const i = args.indexOf(key);
      return i < 0 ? undefined : args[i + 1];
    };
  const { report } = await runLateMeterJourney({
    sourceRoot: option('--source-root'),
    output: option('--output'),
    fixture: option('--fixture'),
    captureFrames: args.includes('--capture-native'),
    preparationSeconds:
      option('--preparation-seconds') === undefined
        ? undefined
        : Number(option('--preparation-seconds')),
  });
  console.log(
    JSON.stringify({
      status: report.status,
      error: report.error,
      output: report.snapshots?.['completed-late-meter']?.file,
    }),
  );
  if (report.status !== 'completed-by-production-input') process.exitCode = 1;
}
