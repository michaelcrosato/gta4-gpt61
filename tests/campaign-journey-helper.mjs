#!/usr/bin/env node
/**
 * Deterministic parent-orchestration fixture for Night Crossing UI tests.
 * Movement, driving and interactions use updateSimulation inputs. Caption
 * presentation/acknowledgment and the explicit room response use their public
 * UI APIs. No position, health, clock, actor, receipt or director mutation is
 * permitted. This is not a natural browser playthrough or release validation.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  WORLD,
  TERRAIN,
  VEHICLE_SPECS,
  createSimulation,
  updateSimulation,
  currentVehicle,
  nearestInteractable,
  storyView,
  presentStoryDialogue,
  acknowledgeStory,
  setStoryPresentationVisibility,
  selectStoryChoice,
  saveGame,
  restoreGame,
} from '../src/simulation.js';
import { findRoute } from '../src/navigation.js';
import { findLocalFootPath } from '../src/local-navigation.js';
import { createSceneContext } from '../src/scene-context.js';
import { INTERIOR_LAYOUTS } from '../src/interiors.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCENES = createSceneContext(WORLD, TERRAIN);
async function sourceFiles(directory = 'src') {
  const files = [];
  for (const entry of await readdir(resolve(ROOT, directory), { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await sourceFiles(file)));
    else if (entry.name.endsWith('.js')) files.push(file);
  }
  return files;
}
const copy = (value) => JSON.parse(JSON.stringify(value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleError = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
function compactRoute(points) {
  const result = [];
  for (const point of points) {
    if (result.length >= 2) {
      const a = result.at(-2),
        b = result.at(-1),
        ab = distance(a, b),
        bp = distance(b, point),
        ap = distance(a, point),
        expectedZ = ap ? (a.z ?? 0) + (((point.z ?? 0) - (a.z ?? 0)) * ab) / ap : 0;
      if (Math.abs(ab + bp - ap) < 1e-6 && Math.abs((b.z ?? 0) - expectedZ) < 1e-6) result.pop();
    }
    result.push(point);
  }
  return result;
}
const pose = (actor) =>
  actor && {
    id: actor.id,
    x: actor.x,
    y: actor.y,
    z: actor.z ?? 0,
    sceneId: actor.sceneId ?? null,
    health: actor.health,
    angle: actor.angle,
    speed: actor.speed ?? 0,
    vehicleId: actor.vehicleId ?? null,
    companionPhase: actor.companionPhase,
  };

export class CampaignJourneyDriver {
  constructor({ seed = 61, dt = 0.1, output = '/tmp/lowlight-campaign-journey' } = {}) {
    if (!(dt > 0 && dt <= 0.2)) throw Error('Journey input steps must be within (0, 0.2].');
    this.state = createSimulation({ seed, campaign: true });
    this.dt = dt;
    this.output = resolve(output);
    if (!this.output.startsWith('/tmp/'))
      throw Error('Journey evidence must be outside the repo in /tmp.');
    this.captionKey = null;
    this.captionShownAt = 0;
    this.nextTelemetry = 0;
    this.lastStage = null;
    this.report = {
      fixture: 'Production simulation input with explicit parent caption/choice orchestration',
      naturalBrowserCompletion: false,
      stateMutation:
        'None; all progress comes from production updateSimulation and public UI actions.',
      seed,
      dt,
      startedAt: new Date().toISOString(),
      inputFrames: 0,
      interactions: [],
      captions: [],
      timeline: [],
      snapshots: {},
      sourceHashes: {},
      status: 'running',
    };
  }

  read() {
    const s = this.state,
      v = storyView(s);
    return {
      time: s.time,
      player: pose(s.player),
      vehicle: pose(currentVehicle(s)),
      felix: pose(s.companions?.actors.find((actor) => actor.id === 'LL-CHAR-002')),
      nadia: pose(s.companions?.actors.find((actor) => actor.id === 'LL-CHAR-008')),
      mission: s.campaign.active?.missionId,
      stage: v?.stageId,
      failed: v?.failed,
      failure: copy(v?.failure ?? null),
      route: copy(v?.route ?? null),
      cinematic: copy(v?.cinematic ?? null),
      blocked: v?.blocked,
      choicePending: v?.choicePending,
      dialogueReady: v?.dialogueReady,
      dialogue: v?.dialogue && { speaker: v.dialogue.speaker, text: v.dialogue.text },
      dialogueIndex: v?.dialogueIndex,
      services: copy(v?.services ?? null),
      wanted: copy(s.wanted),
      deaths: s.progress.deaths,
      notices: copy(s.notifications.slice(-5)),
      interaction: copy(nearestInteractable(s)),
    };
  }

  log(event, extra = {}) {
    const item = { event, ...this.read(), extra };
    this.report.timeline.push(item);
    process.stdout.write(
      `${JSON.stringify({ event, time: item.time, stage: item.stage, player: item.player, extra })}\n`,
    );
    return item;
  }

  presentCaptions() {
    const view = storyView(this.state),
      line = view?.dialogue || view?.ambient;
    setStoryPresentationVisibility(this.state, true);
    if (!line) {
      this.captionKey = null;
      return;
    }
    const key = view.dialogue
      ? `${view.missionId}:${view.stageId}:${view.attempt}:${view.dialogueIndex}`
      : `${view.ambient.receipt}:${view.ambient.index}`;
    if (this.captionKey !== key) {
      this.captionKey = key;
      this.captionShownAt = this.state.time;
      this.report.captions.push({
        key,
        time: this.state.time,
        speaker: line.speaker,
        text: line.text,
      });
    }
    presentStoryDialogue(this.state);
    // Driving and ambient captions use the real duration-driven core. Manual
    // captions receive a declared simulated CONTINUE after actual presentation.
    if (view.dialogue && !view.autoDialogue && this.state.time - this.captionShownAt >= 0.35) {
      const result = acknowledgeStory(this.state);
      if (!result.ok)
        throw Error(`Presented caption could not be acknowledged: ${JSON.stringify(result)}`);
    }
  }

  step(input = {}, { captions = true } = {}) {
    if (captions) this.presentCaptions();
    updateSimulation(this.state, this.dt, input);
    this.report.inputFrames++;
    const view = storyView(this.state);
    if (view?.stageId !== this.lastStage) {
      this.lastStage = view?.stageId;
      this.log('stage-changed');
    } else if (this.state.time >= this.nextTelemetry) {
      this.nextTelemetry = this.state.time + 10;
      this.log('input-progress');
    }
    if (view?.failed || this.state.player.health <= 0 || this.state.progress.deaths)
      throw Error(`Journey failed through normal simulation: ${JSON.stringify(this.read())}`);
  }

  waitUntil(predicate, { seconds = 45, label = 'condition', input = {} } = {}) {
    const deadline = this.state.time + seconds;
    while (!predicate() && this.state.time < deadline) this.step(input);
    if (!predicate()) throw Error(`Timed out waiting for ${label}: ${JSON.stringify(this.read())}`);
    this.log(label);
  }

  interact(label) {
    const candidate = nearestInteractable(this.state);
    this.report.interactions.push({ label, time: this.state.time, candidate: copy(candidate) });
    this.step({ confirm: true });
    this.step({});
    this.log(label, { candidate });
  }

  walk(points, { radius = 0.6, secondsPerPoint = 20 } = {}) {
    for (const target of points) {
      const deadline = this.state.time + secondsPerPoint;
      while (distance(this.state.player, target) > radius && this.state.time < deadline) {
        const dx = target.x - this.state.player.x,
          dy = target.y - this.state.player.y,
          length = Math.hypot(dx, dy),
          scale = Math.min(1, length / (51 * this.dt));
        this.step({ moveX: (dx / length) * scale, moveY: (dy / length) * scale });
      }
      if (distance(this.state.player, target) > radius)
        throw Error(
          `Physical foot route stalled at ${JSON.stringify(target)}: ${JSON.stringify(this.read())}`,
        );
    }
    this.step({});
  }

  walkTo(target, options = {}) {
    const s = this.state,
      sceneId = s.player.sceneId ?? null,
      query = SCENES.queries(s, sceneId),
      room = INTERIOR_LAYOUTS[sceneId],
      geometry = {
        surfaceHeight: (x, y, z) => query.surfaceHeight(x, y, z),
        isBlocked: (x, y, radius, z) =>
          query.isBlocked(x, y, radius, z) ||
          s.vehicles.some((car) => {
            if (
              car.health <= 0 ||
              (car.sceneId ?? null) !== sceneId ||
              z < (car.z ?? 0) - 4 ||
              z >= (car.z ?? 0) + 16
            )
              return false;
            const spec = VEHICLE_SPECS[car.spec],
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
          }),
      },
      path = findLocalFootPath(
        geometry,
        { ...pose(s.player), sceneId },
        { ...target, sceneId },
        {
          bounds: room ? { x: 0, y: 0, w: room.width, h: room.height } : WORLD.bounds,
          radius: 7,
          maxChecks: 60000,
          maxNodes: 4096,
        },
      );
    if (!path.length)
      throw Error(
        `No physical local foot path: ${JSON.stringify({ target, telemetry: this.read() })}`,
      );
    this.log('physical-foot-route', { target, path });
    this.walk(path, options);
  }

  stop(seconds = 1.2) {
    const until = this.state.time + seconds;
    while (this.state.time < until) this.step({ brake: true });
  }

  laneFor(car, a, b, along, length, look) {
    if (length < 100 || length - along < 55) return 0;
    const nx = (b.x - a.x) / length,
      ny = (b.y - a.y) / length,
      current = (car.x - a.x) * -ny + (car.y - a.y) * nx,
      relevant = this.state.vehicles.filter(
        (other) =>
          other.id !== car.id &&
          other.health > 0 &&
          (other.sceneId ?? null) === null &&
          Math.abs((other.z ?? 0) - (car.z ?? 0)) < 8 &&
          distance(car, other) < 130,
      ),
      scores = [0, -24, 24].map((lane) => {
        let cost = Math.abs(lane) * 0.05 + Math.abs(lane - current) * 0.04;
        for (let index = 1; index <= 8; index++) {
          const step = Math.min(length, along + (Math.max(look - along, 65) * index) / 8),
            x = a.x + nx * step - ny * lane,
            y = a.y + ny * step + nx * lane;
          if (TERRAIN.isBlocked(x, y, VEHICLE_SPECS[car.spec].width * 0.62, car.z ?? 0))
            cost += 1000;
          for (const other of relevant) {
            const clearance =
              (VEHICLE_SPECS[car.spec].width + VEHICLE_SPECS[other.spec].width) * 0.69 + 2;
            cost += Math.max(0, clearance - Math.hypot(x - other.x, y - other.y)) * 10;
          }
        }
        return { lane, cost };
      });
    scores.sort((x, y) => x.cost - y.cost || Math.abs(x.lane) - Math.abs(y.lane));
    if (this.forcedLane) {
      const obstacle = this.state.vehicles.find((other) => other.id === this.forcedLane.id),
        ahead = obstacle && (obstacle.x - car.x) * nx + (obstacle.y - car.y) * ny;
      if (ahead !== undefined && ahead > -40 && ahead < 140) return this.forcedLane.lane;
      this.forcedLane = null;
    }
    return scores[0].lane;
  }

  driveTo(goal, { radius = 7, speed = 23, seconds = 180, route = null } = {}) {
    if (!currentVehicle(this.state)) throw Error('Driving requires actual player boarding.');
    const start = currentVehicle(this.state),
      raw = route ? copy(route) : findRoute(WORLD, start, goal, { mode: 'car', includeZ: true });
    if (!raw.length) throw Error(`No car road route exists to ${JSON.stringify(goal)}.`);
    if (distance(raw.at(-1), goal) > 0.1) raw.push(copy(goal));
    const points = compactRoute(raw);
    let index = points.length > 1 ? 1 : 0;
    const deadline = this.state.time + seconds;
    let lastProgressAt = this.state.time,
      lastProgressPose = pose(start),
      recoveries = 0;
    this.forcedLane = null;
    this.log('drive-route', { goal, points });
    while (this.state.time < deadline) {
      const car = currentVehicle(this.state);
      if (!car || car.id !== 'arc-arrival-taxi') throw Error('The real arrival taxi was lost.');
      if (distance(car, goal) <= radius) {
        this.stop();
        if (distance(car, goal) <= radius + 4) {
          this.log('drive-arrived', { goal });
          return;
        }
      }
      while (index < points.length - 1) {
        const a = points[index - 1] || points[index],
          b = points[index],
          length = distance(a, b) || 1,
          along = ((car.x - a.x) * (b.x - a.x) + (car.y - a.y) * (b.y - a.y)) / length,
          lateral = Math.abs(((car.x - a.x) * (b.y - a.y) - (car.y - a.y) * (b.x - a.x)) / length);
        if (distance(car, b) > 11 && !(along >= length - 8 && lateral < 18)) break;
        index++;
      }
      const a = points[Math.max(0, index - 1)],
        b = points[index],
        dx = b.x - a.x,
        dy = b.y - a.y,
        length = Math.hypot(dx, dy) || 1,
        nx = dx / length,
        ny = dy / length,
        along = Math.max(0, Math.min(length, (car.x - a.x) * nx + (car.y - a.y) * ny)),
        look = Math.min(length, along + Math.max(13, Math.abs(car.speed) * 0.65)),
        lane = this.laneFor(car, a, b, along, length, look),
        target = { x: a.x + nx * look - ny * lane, y: a.y + ny * look + nx * lane },
        error = angleError(Math.atan2(target.y - car.y, target.x - car.x), car.angle);
      let desiredSpeed = speed;
      if (Math.abs(error) > 0.3) desiredSpeed = Math.min(desiredSpeed, 14);
      if (index === points.length - 1)
        desiredSpeed = Math.min(desiredSpeed, Math.max(5, distance(car, goal) * 0.7));
      // Stay below the pedestrian strike threshold around actual street actors.
      if (
        [...this.state.pedestrians, ...this.state.police].some(
          (actor) => actor.health > 0 && !actor.inVehicle && distance(car, actor) < 55,
        )
      )
        desiredSpeed = Math.min(desiredSpeed, 15);
      const input = {
        up: car.speed < desiredSpeed - 1.5,
        brake: car.speed > desiredSpeed + 2,
        right: error > 0.045,
        left: error < -0.045,
      };
      this.step(input);
      if (distance(car, lastProgressPose) > 5) {
        lastProgressAt = this.state.time;
        lastProgressPose = pose(car);
      } else if (this.state.time - lastProgressAt > 5) {
        if (recoveries++ >= 4)
          throw Error(
            `The input driver exhausted its real obstruction recoveries: ${JSON.stringify({ goal, waypoint: b, error, input, telemetry: this.read() })}`,
          );
        const obstacle = this.state.vehicles
          .filter(
            (other) => other.id !== car.id && other.health > 0 && (other.sceneId ?? null) === null,
          )
          .sort((x, y) => distance(car, x) - distance(car, y))[0];
        if (obstacle && distance(car, obstacle) < 45 && length >= 100) {
          const lateral = (car.x - a.x) * -ny + (car.y - a.y) * nx;
          this.forcedLane = { id: obstacle.id, lane: lateral >= 0 ? 24 : -24 };
        }
        this.log('real-driving-obstruction-recovery', {
          goal,
          waypoint: b,
          obstacle: pose(obstacle),
          forcedLane: this.forcedLane,
        });
        this.stop(0.4);
        const reverseUntil = this.state.time + 1.6;
        while (this.state.time < reverseUntil) {
          const reversing = currentVehicle(this.state);
          this.step({ down: reversing.speed > -9, brake: reversing.speed < -12 });
        }
        this.stop(0.4);
        lastProgressAt = this.state.time;
        lastProgressPose = pose(currentVehicle(this.state));
      }
    }
    throw Error(
      `Driving input budget expired: ${JSON.stringify({ goal, telemetry: this.read() })}`,
    );
  }

  async snapshot(name) {
    const bytes = saveGame(this.state);
    restoreGame(bytes); // Actual production save validation; no restoration into the live journey.
    const file = resolve(this.output, `${name}.json`);
    await writeFile(file, bytes);
    this.report.snapshots[name] = {
      file,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      ...this.read(),
    };
    this.log('fixture-snapshot-saved', { name, file });
    return bytes;
  }

  async run() {
    await mkdir(this.output, { recursive: true });
    const sources = [...(await sourceFiles()), 'tests/campaign-journey-helper.mjs'];
    for (const file of sources)
      this.report.sourceHashes[file] = createHash('sha256')
        .update(await readFile(resolve(ROOT, file)))
        .digest('hex');
    try {
      this.log('clean-production-story-start');
      this.waitUntil(() => storyView(this.state)?.stageId === 'taxi', {
        label: 'actual-arrival-and-reunion',
        seconds: 60,
      });
      this.walk(WORLD.campaignSceneBindings['pier-berth'].driverWaypoints);
      this.interact('actual-driver-boarding');
      this.waitUntil(() => storyView(this.state)?.stageId === 'drill', {
        label: 'felix-seated-and-taxi-dialogue',
        seconds: 35,
      });
      this.driveTo(WORLD.campaignSceneBindings.fairground.target);
      this.waitUntil(() => storyView(this.state)?.route.index === 2, {
        label: 'actual-fairground-two-second-stop',
        seconds: 5,
        input: { brake: true },
      });
      this.driveTo(WORLD.campaignSceneBindings.dispatch.target);
      this.waitUntil(() => storyView(this.state)?.stageId === 'shelter', {
        label: 'ordered-dispatch-and-presented-ride-dialogue',
        seconds: 40,
        input: { brake: true },
      });
      this.driveTo({ x: 147, y: 290, z: 0 }, { radius: 1.5, speed: 18, seconds: 120 });
      this.stop();
      this.interact('actual-parked-taxi-exit');
      this.walkTo({ x: 129, y: 308, z: 0 }, { radius: 1 });
      this.interact('actual-room-portal');
      this.waitUntil(
        () => {
          const view = storyView(this.state);
          return (
            view?.stageId === 'shelter' &&
            view.choicePending &&
            view.dialogueReady &&
            !view.dialogue
          );
        },
        { label: 'actual-felix-escort-bag-home-and-room-dialogue', seconds: 100 },
      );
      await this.snapshot('shelter-before-choice');
      const result = selectStoryChoice(this.state, 'room-response', 'thank-nadia');
      this.log('explicit-public-room-response', { result });
      if (!result.ok) throw Error(`The explicit room response failed: ${JSON.stringify(result)}`);
      this.waitUntil(() => storyView(this.state)?.stageId === 'rest', {
        label: 'rest-before-services',
        seconds: 3,
      });
      await this.snapshot('rest-before-services');
      this.report.status = 'fixture-ready';
    } catch (error) {
      this.report.status = 'blocked';
      this.report.error = String(error.stack || error);
      this.log('honest-journey-blocker', { error: error.message });
    } finally {
      this.report.final = this.read();
      this.report.sourcesChangedDuringRun = [];
      for (const file of sources) {
        const current = createHash('sha256')
          .update(await readFile(resolve(ROOT, file)))
          .digest('hex');
        if (current !== this.report.sourceHashes[file])
          this.report.sourcesChangedDuringRun.push(file);
      }
      this.report.finishedAt = new Date().toISOString();
      await writeFile(
        resolve(this.output, 'report.json'),
        `${JSON.stringify(this.report, null, 2)}\n`,
      );
    }
    return this.report;
  }
}

export async function createCampaignJourneyFixtures(options = {}) {
  return new CampaignJourneyDriver(options).run();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2),
    outputIndex = args.indexOf('--output'),
    report = await createCampaignJourneyFixtures({
      output: outputIndex >= 0 ? args[outputIndex + 1] : undefined,
    });
  process.stdout.write(
    `${JSON.stringify({ status: report.status, snapshots: report.snapshots, error: report.error })}\n`,
  );
  if (report.status !== 'fixture-ready') process.exitCode = 1;
}
