/** Native physics tests use a declared setup derived from a genuine Night Crossing
 * home save. Added named drivers/vehicles and road poses are test fixtures, not
 * Late Meter integration or mission completion. All subsequent motion uses real
 * companion requests and updateSimulation, with explicit parent input queues.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {
  restoreGame,
  saveGame,
  updateSimulation,
  WORLD,
  TERRAIN,
  VEHICLE_SPECS,
  queueNPCVehicleInput,
  releaseNPCVehicleInput,
  resetNPCVehicleInputs,
  createSimulationCampaignAdapters,
  setCampaignObservationHandlers,
  interact,
  nearestInteractable,
  leaveStory,
} from '../src/simulation.js';
import * as companions from '../src/companions.js';
import { createSceneContext } from '../src/scene-context.js';
import { createCampaignPhysicalContext } from '../src/campaign/physical-context.js';
import { findLocalFootPath } from '../src/local-navigation.js';

const copy = (v) => JSON.parse(JSON.stringify(v)),
  DT = 1 / 60;
const BASE = restoreGame(
  zlib
    .gunzipSync(
      fs.readFileSync(new URL('./fixtures/campaign-0.5-home-save.json.gz', import.meta.url)),
    )
    .toString(),
);
const DRIVER = 'native-test-driver',
  CAR = 'native-npc-sedan',
  spec = VEHICLE_SPECS.sedan;
function fixture({ x = 440, y = 748, angle = 0, traffic = false, boarding = true } = {}) {
  const s = copy(BASE);
  s.vehicles = s.vehicles.filter((v) => v.id === s.campaignRuntime.night.vehicleId);
  s.pedestrians = [];
  s.hostiles = [];
  s.police = [];
  s.bullets = [];
  s.ordnance = [];
  s.fires = [];
  const car = {
    id: CAR,
    spec: 'sedan',
    kind: traffic ? 'traffic' : 'parked',
    missionVehicle: true,
    x,
    y,
    z: 0,
    groundZ: 0,
    angle,
    speed: 0,
    health: spec.health,
    occupied: false,
    route: traffic
      ? [
          { x, y: y + 100 },
          { x, y },
        ]
      : null,
    routeIndex: 0,
    blockedTime: 0,
    stolen: false,
  };
  s.vehicles.push(car);
  const scenes = createSceneContext(WORLD, TERRAIN),
    cc = createCampaignPhysicalContext(s, {
      world: WORLD,
      terrain: TERRAIN,
      specs: VEHICLE_SPECS,
      scenes,
      localPath: findLocalFootPath,
    }),
    c = Math.cos(angle),
    sin = Math.sin(angle),
    door = {
      x: x + spec.length * 0.12 * c + (spec.width / 2 + 9) * sin,
      y: y + spec.length * 0.12 * sin - (spec.width / 2 + 9) * c,
    };
  assert.equal(
    cc.isBlocked(door.x, door.y, 7, 0, null),
    false,
    'Declared driver door must really be clear',
  );
  const actor = companions.ensureNamedActor(
    s,
    { id: DRIVER, name: 'Native test driver', ...door, z: 0, sceneId: null, health: 100 },
    cc,
  );
  const events = [];
  setCampaignObservationHandlers(s, 'LL-ST-001', { damage: (event) => events.push(copy(event)) });
  if (boarding) {
    assert.equal(companions.requestDriver(s, DRIVER, CAR, cc).ok, true);
    for (let i = 0; i < 120 && !companions.getSeat(s, DRIVER); i++) updateSimulation(s, DT, {});
    assert.equal(companions.driverObservation(s, CAR, cc)?.controllable, true);
  }
  return { s, car, actor, cc, events };
}
function scope(s) {
  const a = s.campaignRuntime.active;
  return {
    missionId: a.missionId,
    stageId: a.stageId,
    attempt: a.attempt,
    activationReceipt: a.receipt,
  };
}
function queue(f, input = { up: true, brake: false, left: false, right: false }, dt = DT) {
  return queueNPCVehicleInput(f.s, {
    vehicleId: CAR,
    actorId: DRIVER,
    scope: scope(f.s),
    input,
    dt,
  });
}
function tick(f, count = 1, input = { up: true, brake: false, left: false, right: false }) {
  for (let i = 0; i < count; i++) {
    assert.equal(queue(f, input).ok, true);
    updateSimulation(f.s, DT, {});
  }
}
function close(a, b) {
  assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
}
function coupled(f) {
  const observation = companions.driverObservation(f.s, CAR, f.cc);
  assert.equal(observation.seated, true);
  assert.equal(observation.controllable, true);
  close(observation.pose.x, companions.driverSeatPose(f.car, f.cc).x);
  close(observation.pose.y, companions.driverSeatPose(f.car, f.cc).y);
  companions.validateCompanions(f.s, f.cc);
}

test('real NPC throttle/steering moves its physical car and coupled body without copying Mara or distance statistics', () => {
  const f = fixture(),
    baseline = copy(f.s);
  assert.equal(queue(f).ok, true);
  updateSimulation(f.s, DT, {});
  updateSimulation(baseline, DT, {});
  assert(f.car.x > 440);
  assert(f.car.speed > 0);
  assert.deepEqual(f.s.player, baseline.player);
  assert.equal(f.s.progress.distanceDriven, baseline.progress.distanceDriven);
  assert.equal(f.s.wanted.level, 0);
  coupled(f);
  tick(f, 40, { up: true, brake: false, left: false, right: true });
  assert(f.car.angle > 0);
  assert(f.car.y > 748);
  coupled(f);
});
test('unseated reservations and fabricated or unsafe ownership cannot supply physical controls', () => {
  const f = fixture({ boarding: false });
  assert.equal(companions.requestDriver(f.s, DRIVER, CAR, f.cc).ok, true);
  assert.equal(queue(f).ok, false);
  assert.equal(f.car.speed, 0);
  let invoked = 0;
  assert.equal(
    queueNPCVehicleInput(f.s, {
      get vehicleId() {
        invoked++;
        return CAR;
      },
      actorId: DRIVER,
      scope: scope(f.s),
      input: { up: true, brake: false, left: false, right: false },
      dt: DT,
    }).ok,
    false,
  );
  assert.equal(invoked, 0);
  const g = fixture();
  assert.equal(
    queueNPCVehicleInput(g.s, {
      vehicleId: CAR,
      actorId: DRIVER,
      scope: { ...scope(g.s), activationReceipt: 'fabricated' },
      input: { up: true, brake: false, left: false, right: false },
      dt: DT,
    }).ok,
    false,
  );
  assert.equal(
    queueNPCVehicleInput(g.s, {
      vehicleId: CAR,
      actorId: DRIVER,
      scope: { ...scope(g.s), missionId: 'LL-ST-003' },
      input: { up: true, brake: false, left: false, right: false },
      dt: DT,
    }).ok,
    false,
  );
});
test('queued input is consumed once and missing/expired input applies real brakes with real remaining travel', () => {
  const f = fixture();
  queue(f);
  updateSimulation(f.s, DT, {});
  const speed = f.car.speed,
    x = f.car.x;
  updateSimulation(f.s, DT, {});
  assert(f.car.speed < speed);
  assert(f.car.x > x);
  releaseNPCVehicleInput(f.s, CAR, 'test-stop');
  for (let i = 0; i < 80; i++) updateSimulation(f.s, DT, {});
  assert.equal(f.car.speed, 0);
  const g = fixture();
  queue(g, undefined, 0.001);
  updateSimulation(g.s, DT, {});
  assert.equal(g.car.speed, 0);
  assert.equal(g.car.x, 440);
});
test('release/reset/death discard acceleration while preserving actual body lease and braking momentum', () => {
  const f = fixture();
  tick(f, 20);
  const before = { health: f.actor.health, speed: f.car.speed, x: f.car.x };
  queue(f);
  releaseNPCVehicleInput(f.s, CAR, 'mission-failed');
  updateSimulation(f.s, DT, {});
  assert(f.car.speed < before.speed);
  assert(f.car.x > before.x);
  assert.equal(f.actor.health, before.health);
  assert.equal(companions.getSeat(f.s, DRIVER).seat, 0);
  queue(f);
  resetNPCVehicleInputs(f.s);
  const v = f.car.speed;
  updateSimulation(f.s, DT, {});
  assert(f.car.speed < v);
  companions.damageCompanion(f.s, DRIVER, 1000, 'actual-test-damage', f.cc);
  const dead = f.actor.health;
  updateSimulation(f.s, DT, {});
  assert.equal(dead, 0);
  assert.equal(f.actor.health, 0);
  assert.equal(companions.playerDriverAdmission(f.s, CAR).allowed, false);
  assert.equal(queue(f).ok, false);
});
test('leaving the real owning campaign expires a previously queued control without restoring or reviving anyone', () => {
  const f = fixture();
  tick(f, 15);
  queue(f);
  const speed = f.car.speed,
    health = f.actor.health;
  assert.equal(leaveStory(f.s).ok, true);
  updateSimulation(f.s, DT, {});
  assert(f.car.speed < speed);
  assert.equal(f.actor.health, health);
  assert.equal(f.s.campaign.active, null);
  assert.equal(companions.getSeat(f.s, DRIVER).seat, 0);
});
test('real whole-world restore and save/Continue never replay a pre-restore NPC command', () => {
  const f = fixture(),
    adapters = createSimulationCampaignAdapters(f.s),
    snapshot = adapters.captureWorld();
  queue(f);
  assert.equal(adapters.restoreWorld(snapshot, { reason: 'retry:test-native-driver' }).ok, true);
  const car = f.s.vehicles.find((v) => v.id === CAR);
  updateSimulation(f.s, DT, {});
  assert.equal(car.speed, 0);
  const g = fixture();
  queue(g);
  const restored = restoreGame(saveGame(g.s));
  updateSimulation(restored, DT, {});
  assert.equal(restored.vehicles.find((v) => v.id === CAR).speed, 0);
  assert.equal(companions.getSeat(restored, DRIVER).seat, 0);
});
test('a named driver owns a traffic car exclusively and generic traffic cannot rotate or move it twice', () => {
  const f = fixture({ traffic: true });
  tick(f, 12);
  assert(f.car.x > 440);
  close(f.car.y, 748);
  close(f.car.angle, 0);
  coupled(f);
});
test('player admission cancels only a real unseated approach, retaining position/health and no ghost driver', () => {
  const f = fixture({ boarding: false });
  assert.equal(companions.requestDriver(f.s, DRIVER, CAR, f.cc).ok, true);
  Object.assign(f.s.player, { x: 440, y: 748, z: 0, groundZ: 0, vehicleId: null, sceneId: null });
  f.s.interior.active = null;
  f.s.scene = { kind: 'exterior', id: 'harbor-city' };
  const before = copy(f.actor);
  assert.equal(nearestInteractable(f.s).id, CAR);
  assert.equal(interact(f.s).type, 'vehicle');
  assert.equal(f.s.player.vehicleId, CAR);
  assert.equal(f.actor.vehicleId, null);
  assert.equal(f.actor.health, before.health);
  close(f.actor.x, before.x);
  close(f.actor.y, before.y);
  assert.equal(companions.driverObservation(f.s, CAR, f.cc), null);
});
test('Mara cannot duplicate a seated/exiting or dead driver; real braking and physical egress precede entry', () => {
  const f = fixture();
  Object.assign(f.s.player, { x: 440, y: 770, z: 0, groundZ: 0, vehicleId: null, sceneId: null });
  f.s.interior.active = null;
  f.s.scene = { kind: 'exterior', id: 'harbor-city' };
  assert.equal(interact(f.s).waiting, 'named-driver-egress');
  assert.equal(f.s.player.vehicleId, null);
  assert.equal(companions.playerDriverAdmission(f.s, CAR).allowed, false);
  for (let i = 0; i < 100 && !companions.playerDriverAdmission(f.s, CAR).allowed; i++)
    updateSimulation(f.s, DT, {});
  assert.equal(companions.playerDriverAdmission(f.s, CAR).allowed, true);
  assert.equal(f.actor.vehicleId, null);
  assert.equal(interact(f.s).type, 'vehicle');
  assert.equal(f.s.player.vehicleId, CAR);
  assert.equal(f.actor.health, 100);
  const g = fixture();
  companions.damageCompanion(g.s, DRIVER, 1000, 'actual-test-damage', g.cc);
  updateSimulation(g.s, DT, {});
  Object.assign(g.s.player, { x: 440, y: 770, z: 0, groundZ: 0, vehicleId: null, sceneId: null });
  g.s.interior.active = null;
  g.s.scene = { kind: 'exterior', id: 'harbor-city' };
  assert.equal(interact(g.s).waiting, 'named-driver-egress');
  assert.equal(g.s.player.vehicleId, null);
  assert.equal(g.actor.vehicleId, CAR);
});
test('native car/car harm assigns both cars and actual passenger injuries to the moving NPC, not parked Mara', () => {
  const f = fixture(),
    other = { ...f.car, id: 'parked-player-taxi', spec: 'taxi', x: 510, health: 120, owned: true };
  delete other.companionSeats;
  delete other.companionOccupied;
  f.s.vehicles.push(other);
  Object.assign(f.s.player, {
    x: other.x,
    y: other.y,
    z: 0,
    groundZ: 0,
    vehicleId: other.id,
    sceneId: null,
  });
  f.s.interior.active = null;
  f.s.scene = { kind: 'exterior', id: 'harbor-city' };
  other.occupied = true;
  for (let i = 0; i < 180 && other.health === 120; i++) tick(f);
  assert(other.health < 120);
  assert(f.car.health < spec.health);
  assert(f.actor.health < 100);
  const vehicleEvents = f.events.filter(
    (e) => e.entityType === 'vehicle' && (e.targetId === CAR || e.targetId === other.id),
  );
  assert(vehicleEvents.length >= 2);
  assert(vehicleEvents.every((e) => e.owner === DRIVER));
  assert(
    f.events.some(
      (e) => e.targetId === DRIVER && e.owner === DRIVER && e.healthAfter < e.healthBefore,
    ),
  );
  assert.equal(f.s.wanted.level, 0);
  assert.equal(f.s.progress.distanceDriven, BASE.progress.distanceDriven);
});
test('real NPC vehicle motion can hit an actual outside pedestrian while Mara is indoors without blaming her', () => {
  const f = fixture();
  const victim = companions.ensureNamedActor(
    f.s,
    {
      id: 'native-test-pedestrian',
      name: 'Physical pedestrian',
      x: 492,
      y: 748,
      z: 0,
      sceneId: null,
      health: 100,
    },
    f.cc,
  );
  for (let i = 0; i < 180 && victim.health === 100; i++) tick(f);
  assert(victim.health < 100);
  assert(f.events.some((e) => e.targetId === victim.id && e.owner === DRIVER));
  assert.equal(f.s.wanted.level, 0);
  assert.equal(f.s.player.sceneId, 'dockside-rooms');
});

test('NPC cars use the same native wall collision and actual vehicle/passenger health costs', () => {
  const radius = spec.width * 0.62;
  const wall = WORLD.buildings.find((b) => {
    const x = b.x - 100,
      y = b.y + b.h / 2;
    return (
      b.x > 1000 &&
      b.h > 60 &&
      TERRAIN.isBlocked(b.x + 1, y, radius, 0) &&
      !TERRAIN.isBlocked(x + spec.length * 0.12, y - (spec.width / 2 + 9), 7, 0) &&
      Array.from({ length: 30 }, (_, i) => x + i * 3).every(
        (px) =>
          !TERRAIN.isBlocked(px, y, radius, 0) && Math.abs(TERRAIN.surfaceHeight(px, y, 0)) < 1e-6,
      )
    );
  });
  assert(wall, 'Native world must provide a real clear approach to a solid wall');
  const f = fixture({ x: wall.x - 100, y: wall.y + wall.h / 2 });
  for (let i = 0; i < 240 && f.car.health === spec.health; i++) tick(f);
  assert(f.car.health < spec.health);
  assert(f.actor.health < 100);
  assert(f.car.x < wall.x);
  assert(f.events.some((e) => e.targetId === CAR && e.owner === DRIVER));
  assert(f.events.some((e) => e.targetId === DRIVER && e.owner === DRIVER));
  coupled(f);
});

test('NPC run-over can cause actual Mara harm without copying car pose or attributing NPC travel to her', () => {
  const f = fixture();
  Object.assign(f.s.player, { x: 492, y: 748, z: 0, groundZ: 0, vehicleId: null, sceneId: null });
  f.s.interior.active = null;
  f.s.scene = { kind: 'exterior', id: 'harbor-city' };
  const before = {
    x: f.s.player.x,
    y: f.s.player.y,
    distance: f.s.progress.distanceDriven,
    health: f.s.player.health,
  };
  for (let i = 0; i < 180 && f.s.player.health === before.health; i++) tick(f);
  assert(f.s.player.health < before.health);
  close(f.s.player.x, before.x);
  close(f.s.player.y, before.y);
  assert.equal(f.s.progress.distanceDriven, before.distance);
  assert(
    f.events.some(
      (e) => e.targetId === 'player' && e.owner === DRIVER && e.healthAfter < e.healthBefore,
    ),
  );
  assert.equal(f.s.wanted.level, 0);
});

test('Mara physically driving into a stationary occupied NPC car remains player-attributed shared collision', () => {
  const f = fixture(),
    playerCar = {
      ...f.car,
      id: 'actual-player-car',
      spec: 'taxi',
      x: 370,
      health: 120,
      owned: true,
      occupied: true,
    };
  delete playerCar.companionSeats;
  delete playerCar.companionOccupied;
  f.s.vehicles.push(playerCar);
  Object.assign(f.s.player, {
    x: 370,
    y: 748,
    z: 0,
    groundZ: 0,
    vehicleId: playerCar.id,
    sceneId: null,
  });
  f.s.interior.active = null;
  f.s.scene = { kind: 'exterior', id: 'harbor-city' };
  for (let i = 0; i < 180 && f.car.health === spec.health; i++)
    updateSimulation(f.s, DT, { up: true });
  assert(f.car.health < spec.health);
  assert(playerCar.health < 120);
  assert(f.s.progress.distanceDriven > BASE.progress.distanceDriven);
  assert(f.events.filter((e) => e.entityType === 'vehicle').every((e) => e.owner === 'player'));
  assert(f.events.some((e) => e.targetId === DRIVER && e.owner === 'player'));
  assert.equal(f.s.player.vehicleId, playerCar.id);
});
