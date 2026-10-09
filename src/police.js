import { worldElevation } from './world-elevation.js';
/** Observation-driven dispatch, road pursuit, arrest and six escalating response tiers. */
import { findRoute, snapToRoad, createRoadNetwork } from './navigation.js';
import { WEAPONS } from './combat.js';
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const angleDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export const POLICE_TIERS = Object.freeze({
  1: {
    name: 'Neighborhood patrol',
    foot: 2,
    cruisers: 0,
    roadblocks: 0,
    armored: 0,
    rooftop: 0,
    air: 0,
    cordon: 0,
    radius: 185,
    cooling: 9,
    sight: 190,
  },
  2: {
    name: 'Armed pursuit',
    foot: 2,
    cruisers: 2,
    roadblocks: 0,
    armored: 0,
    rooftop: 0,
    air: 0,
    cordon: 0,
    radius: 230,
    cooling: 11,
    sight: 210,
  },
  3: {
    name: 'Search and interception',
    foot: 4,
    cruisers: 2,
    roadblocks: 2,
    armored: 0,
    rooftop: 0,
    air: 0,
    cordon: 0,
    radius: 290,
    cooling: 13,
    sight: 230,
  },
  4: {
    name: 'Tactical response',
    foot: 4,
    cruisers: 3,
    roadblocks: 2,
    armored: 2,
    rooftop: 0,
    air: 0,
    cordon: 0,
    radius: 350,
    cooling: 16,
    sight: 240,
  },
  5: {
    name: 'Air and elevated search',
    foot: 4,
    cruisers: 3,
    roadblocks: 2,
    armored: 2,
    rooftop: 2,
    air: 1,
    cordon: 0,
    radius: 430,
    cooling: 19,
    sight: 260,
  },
  6: {
    name: 'Persistent city cordon',
    foot: 6,
    cruisers: 4,
    roadblocks: 2,
    armored: 2,
    rooftop: 3,
    air: 2,
    cordon: 4,
    radius: 500,
    cooling: 24,
    sight: 280,
  },
});
const SEVERITY = {
  gunfire: 1,
  'vehicle-theft': 1,
  assault: 2,
  'hit-and-run': 2,
  explosion: 3,
  'police-assault': 3,
  'police-killing': 4,
  'arrest-resistance': 2,
};

export function initializePolicing(state) {
  state.policeVersion ??= 1;
  state.policeAircraft ??= [];
  state.policeDispatch ??= {
    reports: [],
    roadblocks: [],
    cordon: [],
    nextDeployment: 0,
    knownHeading: 0,
    knownSpeed: 0,
    knownVehicleId: null,
    observedBy: [],
    arrestOfficerId: null,
    arrestProgress: 0,
    lastArrest: null,
    deploymentSequence: 0,
  };
  state.player.surrendering ??= false;
  state.progress.arrests ??= 0;
  state.wanted.observed ??= false;
  state.wanted.lastSeenTime ??= -1;
}

function clearResponse(state) {
  state.vehicles = state.vehicles.filter(
    (vehicle) => !vehicle.policeControlled || vehicle.id === state.player.vehicleId,
  );
  state.police = [];
  state.policeAircraft = [];
  state.policeDispatch.roadblocks = [];
  state.policeDispatch.cordon = [];
  state.policeDispatch.arrestOfficerId = null;
  state.policeDispatch.arrestProgress = 0;
  state.policeDispatch.observedBy = [];
}
export function resetPolicing(state) {
  initializePolicing(state);
  clearResponse(state);
  state.policeDispatch.reports = [];
  state.policeDispatch.nextDeployment = state.time;
  state.player.surrendering = false;
  state.wanted.observed = false;
}

export function forcePoliceWanted(state, level, point, ctx, observedAt = state.time) {
  point = ctx.dispatchPoint?.(point) ?? point;
  const desired = clamp(Math.round(Number(level) || 1), 1, 6),
    wanted = state.wanted;
  const previousLevel = wanted.level;
  wanted.level = Math.max(wanted.level, desired);
  wanted.heat = Math.max(wanted.heat, desired);
  wanted.status = 'pursuit';
  wanted.timer = 0;
  wanted.unseen = 0;
  wanted.observed = false;
  if (!previousLevel || observedAt >= wanted.lastSeenTime) {
    wanted.lastSeen = {
      x: clamp(point?.x ?? state.player.x, ctx.world.bounds.left + 8, ctx.world.bounds.right - 8),
      y: clamp(point?.y ?? state.player.y, ctx.world.bounds.top + 8, ctx.world.bounds.bottom - 8),
      ...((point?.z ?? state.player.z) ? { z: point?.z ?? state.player.z } : {}),
    };
    wanted.lastSeenTime = observedAt;
  }
  wanted.searchRadius = POLICE_TIERS[wanted.level].radius;
  if (point?.vehicleId !== undefined) {
    state.policeDispatch.knownVehicleId = point.vehicleId;
    state.policeDispatch.knownHeading = point.angle || 0;
    state.policeDispatch.knownSpeed = point.speed || 0;
  }
  if (!previousLevel || wanted.level > previousLevel)
    state.policeDispatch.nextDeployment = Math.min(state.policeDispatch.nextDeployment, state.time);
  state.lastCrimeTime = state.time;
}

function canObserve(observer, point, range, ctx) {
  const separation = distance(observer, point);
  if (observer.health <= 0 || separation > range * (point.crouching ? 0.78 : 1)) return false;
  if (
    observer.kind === 'police' &&
    observer.role !== 'air-search' &&
    Number.isFinite(observer.angle) &&
    separation > 48 &&
    Math.abs(angleDifference(angleTo(observer, point), observer.angle)) > 1.5
  )
    return false;
  return ctx.hasLineOfSight(observer, point);
}

/** Civilian and driver reports have an interruptible delay; visible police act immediately. */
export function reportObservedCrime(state, crime, ctx) {
  if (!crime || typeof crime.type !== 'string') return false;
  const point = {
    x: crime.x ?? state.player.x,
    y: crime.y ?? state.player.y,
    z: crime.z ?? state.player.z ?? 0,
    ...(crime.sceneId ? { sceneId: crime.sceneId } : {}),
    health: state.player.health,
  };
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  const severity = clamp(Math.round(crime.severity || SEVERITY[crime.type] || 1), 1, 6);
  for (const actor of state.police)
    if (actor.id === crime.victimId && actor.health > 0) actor.angle = angleTo(actor, point);
  const direct = [...state.police, ...state.policeAircraft.filter((air) => air.observing)].filter(
    (officer) => canObserve(officer, point, officer.role === 'air-search' ? 420 : 280, ctx),
  );
  if (direct.length) {
    forcePoliceWanted(state, severity, point, ctx);
    state.policeDispatch.knownHeading = state.player.angle;
    state.policeDispatch.knownSpeed = state.player.speed || 0;
    state.policeDispatch.knownVehicleId = state.player.vehicleId;
    return true;
  }
  const witnesses = [
    ...(ctx.civilianWitnesses?.() ?? state.pedestrians).filter((person) =>
      canObserve(person, point, 220, ctx),
    ),
    ...state.vehicles.filter(
      (vehicle) =>
        vehicle.kind === 'traffic' &&
        !vehicle.policeControlled &&
        canObserve(vehicle, point, 200, ctx),
    ),
  ];
  let queued = false;
  for (const witness of witnesses.slice(0, 5)) {
    if (
      state.policeDispatch.reports.some(
        (report) =>
          report.witnessId === witness.id &&
          report.type === crime.type &&
          state.time - report.time < 2,
      )
    )
      continue;
    state.policeDispatch.reports.push({
      id: ctx.id('report'),
      witnessId: witness.id,
      type: crime.type,
      severity,
      time: state.time,
      remaining: 1.4 + ctx.random() * 1.6,
      point: {
        x: point.x,
        y: point.y,
        ...(point.z ? { z: point.z } : {}),
        ...(point.sceneId ? { sceneId: point.sceneId } : {}),
      },
      heading: state.player.angle,
      speed: state.player.speed || 0,
      vehicleId: state.player.vehicleId,
    });
    witness.reporting = true;
    queued = true;
  }
  state.policeDispatch.reports = state.policeDispatch.reports.slice(-30);
  if (queued) ctx.notify('A witness is calling dispatch. Get out of sight.', 'danger');
  return queued;
}
function updateReports(state, dt, ctx) {
  for (const report of state.policeDispatch.reports) {
    const witness =
      ctx.findWitness?.(report.witnessId) ??
      [...state.pedestrians, ...state.vehicles].find((actor) => actor.id === report.witnessId);
    if (!witness || witness.health <= 0) {
      report.remaining = -1;
      if (witness) witness.reporting = false;
      continue;
    }
    report.remaining -= dt;
    if (report.remaining <= 0) {
      const newer = report.time >= state.wanted.lastSeenTime || !state.wanted.level;
      forcePoliceWanted(state, report.severity, report.point, ctx, report.time);
      if (newer)
        Object.assign(state.policeDispatch, {
          knownHeading: report.heading,
          knownSpeed: report.speed,
          knownVehicleId: report.vehicleId,
        });
      witness.reporting = false;
    }
  }
  state.policeDispatch.reports = state.policeDispatch.reports.filter(
    (report) => report.remaining > 0,
  );
}
function roadJunctions(world) {
  return createRoadNetwork(world).nodes.filter((node) => node.edges.size >= 3);
}
function deploymentPoint(state, ctx, offset = 260) {
  for (let attempt = 0; attempt < 16; attempt++) {
    const count = state.policeDispatch.deploymentSequence++,
      angle = ((count % 4) * Math.PI) / 2 + Math.PI / 4;
    const radius = offset + Math.floor(count / 4) * 55;
    const known = state.wanted.lastSeen,
      desired = { x: known.x + Math.cos(angle) * radius, y: known.y + Math.sin(angle) * radius };
    const point = snapToRoad(ctx.world, { ...desired, z: known.z || 0 }, { includeZ: true });
    if (
      point &&
      !ctx.isBlocked(point.x, point.y, 10, point.z || 0) &&
      !state.vehicles.some((car) => car.health > 0 && distance(point, car) < 36) &&
      !state.police.some((actor) => actor.health > 0 && distance(point, actor) < 20)
    )
      return { x: point.x, y: point.y, z: point.z || 0 };
  }
  return null;
}
function officer(state, ctx, point, role = 'patrol', tier = state.wanted.level) {
  const tactical = role === 'tactical' || role === 'cordon',
    marksman = role === 'overwatch';
  const actor = {
    id: ctx.id('police'),
    kind: 'police',
    role,
    tier,
    x: point.x,
    y: point.y,
    z: point.z || 0,
    groundZ: point.z || 0,
    angle: angleTo(point, state.wanted.lastSeen),
    health: tactical ? 120 : marksman ? 95 : 85,
    armour: tactical ? 65 : marksman ? 25 : 0,
    speed: tactical ? 44 : 46,
    weapon: tier === 1 ? 'unarmed' : marksman ? 'sniper' : tactical ? 'carbine' : 'pistol',
    fireCooldown: 2,
    mode: 'respond',
    inVehicle: false,
    vehicleId: null,
    route: [],
    routeIndex: 0,
    nextRoute: 0,
    armedAuthorized: tier >= 2,
    color: tactical ? '#3b5351' : '#719bbb',
  };
  state.police.push(actor);
  return actor;
}
function cruiser(state, ctx, response = 'patrol', point = deploymentPoint(state, ctx)) {
  if (!point) return null;
  const armored = response === 'armored',
    spec = armored ? 'van' : 'police',
    id = ctx.id('response-vehicle');
  const car = {
    id,
    spec,
    x: point.x,
    y: point.y,
    z: point.z || 0,
    groundZ: point.z || 0,
    angle: angleTo(point, state.wanted.lastSeen),
    speed: 0,
    health: armored ? 340 : 170,
    maxHealth: armored ? 340 : 170,
    armour: armored ? 120 : 0,
    color: armored ? '#354a46' : '#7c9595',
    kind: 'parked',
    occupied: true,
    route: null,
    routeIndex: 0,
    blockedTime: 0,
    stolen: false,
    policeControlled: true,
    response,
    driverId: null,
    crewIds: [],
    policeRoute: [],
    policeRouteIndex: 0,
    nextRoute: 0,
  };
  for (let i = 0; i < 2; i++) {
    const member = officer(state, ctx, point, armored ? 'tactical' : 'patrol');
    member.inVehicle = true;
    member.vehicleId = id;
    member.seat = i;
    car.crewIds.push(member.id);
    if (i === 0) car.driverId = member.id;
  }
  state.vehicles.push(car);
  return car;
}
function roadblock(state, ctx, point, cordon = false) {
  const id = ctx.id(cordon ? 'cordon' : 'roadblock'),
    nearest = snapToRoad(ctx.world, point, { includeZ: true });
  if (!nearest) return null;
  const road = ctx.world.roads[nearest.roadIndex],
    vertical = road.x1 === road.x2;
  const record = {
    id,
    x: nearest.x,
    y: nearest.y,
    z: nearest.z || 0,
    vehicleIds: [],
    officerIds: [],
    persistent: cordon,
    active: true,
  };
  for (const side of [-1, 1]) {
    const carPoint = {
      x: nearest.x + (vertical ? side * 17 : 0),
      y: nearest.y + (vertical ? 0 : side * 17),
      z: nearest.z || 0,
      groundZ: nearest.z || 0,
    };
    const car = {
      id: ctx.id('blocker'),
      spec: 'police',
      ...carPoint,
      angle: vertical ? 0 : Math.PI / 2,
      speed: 0,
      health: 180,
      armour: cordon ? 65 : 0,
      color: cordon ? '#52665e' : '#839c97',
      kind: 'parked',
      occupied: false,
      route: null,
      routeIndex: 0,
      blockedTime: 0,
      stolen: false,
      policeControlled: true,
      response: cordon ? 'cordon' : 'roadblock',
      roadblockId: id,
      driverId: null,
      crewIds: [],
      policeRoute: [],
      policeRouteIndex: 0,
      nextRoute: 0,
    };
    if (ctx.isBlocked(car.x, car.y, 10, car.z || 0)) continue;
    state.vehicles.push(car);
    record.vehicleIds.push(car.id);
    const actorPoint = {
      x: nearest.x + (vertical ? side * 31 : 25),
      y: nearest.y + (vertical ? 25 : side * 31),
      z: nearest.z || 0,
    };
    const member = officer(state, ctx, actorPoint, cordon ? 'cordon' : 'search');
    member.anchor = { x: actorPoint.x, y: actorPoint.y };
    record.officerIds.push(member.id);
  }
  if (!record.vehicleIds.length) return null;
  (cordon ? state.policeDispatch.cordon : state.policeDispatch.roadblocks).push(record);
  return record;
}
function deployRoadblocks(state, ctx, count, cordon = false) {
  const existing = cordon ? state.policeDispatch.cordon : state.policeDispatch.roadblocks;
  const known = state.wanted.lastSeen;
  const junctions = roadJunctions(ctx.world)
    .filter(
      (point) =>
        Math.abs((point.z || 0) - (known.z || 0)) < 6 &&
        distance(point, known) > 130 &&
        distance(point, known) < (cordon ? 1050 : 650),
    )
    .sort(
      (a, b) =>
        Math.abs(distance(a, known) - (cordon ? 400 : 260)) -
        Math.abs(distance(b, known) - (cordon ? 400 : 260)),
    );
  for (const point of junctions) {
    if (existing.filter((block) => block.active).length >= count) break;
    if (
      [...state.policeDispatch.roadblocks, ...state.policeDispatch.cordon].some(
        (block) => block.active && distance(block, point) < 140,
      )
    )
      continue;
    roadblock(state, ctx, point, cordon);
  }
}
function deployOverwatch(state, ctx, count) {
  const current = state.police.filter((actor) => actor.health > 0 && actor.role === 'overwatch');
  const buildings = ctx.world.buildings
    .filter((b) => distance({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, state.wanted.lastSeen) < 430)
    .sort((a, b) => b.height - a.height);
  for (const b of buildings) {
    if (current.length >= count) break;
    if (current.some((actor) => actor.buildingId === b.id)) continue;
    const center = { x: b.x + b.w / 2, y: b.y + b.h / 2 },
      angle = angleTo(center, state.wanted.lastSeen);
    const point =
      Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))
        ? { x: Math.cos(angle) > 0 ? b.x + b.w - 1 : b.x + 1, y: center.y, z: b.height }
        : { x: center.x, y: Math.sin(angle) > 0 ? b.y + b.h - 1 : b.y + 1, z: b.height };
    const member = officer(state, ctx, point, 'overwatch');
    member.buildingId = b.id;
    member.speed = 0;
    current.push(member);
  }
}
function deploy(state, ctx) {
  const tier = POLICE_TIERS[state.wanted.level];
  if (!tier) return;
  state.policeDispatch.roadblocks = state.policeDispatch.roadblocks.filter((block) => block.active);
  state.policeDispatch.cordon = state.policeDispatch.cordon.filter((block) => block.active);
  const foot = state.police.filter(
    (actor) => actor.health > 0 && !actor.inVehicle && ['patrol', 'search'].includes(actor.role),
  );
  while (foot.length < tier.foot) {
    const point = deploymentPoint(state, ctx);
    if (!point) break;
    foot.push(officer(state, ctx, point, state.wanted.level >= 3 ? 'search' : 'patrol'));
  }
  for (const [response, total] of [
    ['patrol', tier.cruisers],
    ['armored', tier.armored],
  ]) {
    let count = state.vehicles.filter(
      (car) => car.policeControlled && car.response === response && car.health > 0,
    ).length;
    while (count < total) {
      if (!cruiser(state, ctx, response)) break;
      count++;
    }
  }
  deployRoadblocks(state, ctx, tier.roadblocks);
  deployRoadblocks(state, ctx, tier.cordon, true);
  deployOverwatch(state, ctx, tier.rooftop);
  while (state.policeAircraft.filter((air) => air.health > 0).length < tier.air) {
    const point = deploymentPoint(state, ctx, 420);
    if (!point) break;
    state.policeAircraft.push({
      id: ctx.id('air-search'),
      kind: 'police',
      role: 'air-search',
      x: point.x,
      y: point.y,
      z: 120,
      angle: 0,
      health: 260,
      speed: 105,
      phase: state.policeAircraft.length * Math.PI,
      searchlight: { x: state.wanted.lastSeen.x, y: state.wanted.lastSeen.y, radius: 58 },
      observing: false,
    });
  }
  state.policeDispatch.nextDeployment = state.time + 8;
}
function routeBody(body, destination, state, ctx, dt, speed, radius = 8) {
  if (state.time >= body.nextRoute || !body.policeRoute?.length) {
    body.policeRoute = findRoute(ctx.world, body, destination, {
      mode: body.spec ? 'car' : 'foot',
      includeZ: true,
    });
    body.policeRouteIndex = 0;
    body.nextRoute = state.time + 1.2;
  }
  let waypoint = body.policeRoute?.[body.policeRouteIndex];
  while (waypoint && distance(body, waypoint) < 4) {
    body.policeRouteIndex++;
    waypoint = body.policeRoute[body.policeRouteIndex];
  }
  if (!waypoint) return false;
  const angle = angleTo(body, waypoint),
    range = distance(body, waypoint);
  body.angle = angle;
  const traveled = Math.min(range, speed * dt);
  return ctx.moveBody(body, Math.cos(angle) * traveled, Math.sin(angle) * traveled, radius);
}
function disembark(state, car, ctx) {
  car.speed = 0;
  car.occupied = false;
  for (const [index, id] of car.crewIds.entries()) {
    const member = state.police.find((actor) => actor.id === id);
    if (!member || member.health <= 0 || !member.inVehicle) continue;
    member.inVehicle = false;
    member.vehicleId = null;
    const point = {
      x: car.x + Math.cos(car.angle + Math.PI / 2) * (index ? 24 : -24),
      y: car.y + Math.sin(car.angle + Math.PI / 2) * (index ? 24 : -24),
      z: car.z || 0,
    };
    if (!ctx.isBlocked(point.x, point.y, 7, point.z || 0)) {
      member.x = point.x;
      member.y = point.y;
      member.z = point.z || 0;
      member.groundZ = car.groundZ || 0;
    }
  }
}
export function relinquishPoliceVehicle(state, car, ctx) {
  if (!car.policeControlled) return;
  disembark(state, car, ctx);
  car.policeControlled = false;
  car.driverId = null;
  car.crewIds = [];
}
function updateCruisers(state, dt, ctx) {
  const known = state.wanted.lastSeen,
    dispatch = state.policeDispatch;
  for (const car of state.vehicles) {
    if (
      !car.policeControlled ||
      !['patrol', 'armored'].includes(car.response) ||
      car.id === state.player.vehicleId
    )
      continue;
    const driver = state.police.find((actor) => actor.id === car.driverId);
    if (car.health <= 0 || !driver || driver.health <= 0) {
      disembark(state, car, ctx);
      car.policeControlled = false;
      car.driverId = null;
      car.crewIds = [];
      continue;
    }
    if (!driver.inVehicle) continue;
    const target =
      state.wanted.observed && dispatch.knownVehicleId
        ? {
            x: known.x + Math.cos(dispatch.knownHeading) * Math.min(80, dispatch.knownSpeed * 0.45),
            y: known.y + Math.sin(dispatch.knownHeading) * Math.min(80, dispatch.knownSpeed * 0.45),
          }
        : known;
    const desired =
      distance(car, known) < 60 && !dispatch.knownVehicleId
        ? 0
        : Math.min(
            car.response === 'armored' ? 105 : 132 + state.wanted.level * 5,
            distance(car, target) * 1.4,
          );
    car.speed += (desired - car.speed) * Math.min(1, dt * 2.5);
    const before = { x: car.x, y: car.y };
    const blocked = routeBody(
      car,
      target,
      state,
      ctx,
      dt,
      car.speed,
      ctx.specs[car.spec].width * 0.62,
    );
    if (blocked) {
      ctx.damageVehicle(car, Math.abs(car.speed) * 0.02);
      car.speed *= 0.2;
    }
    for (const other of state.vehicles) {
      if (
        other.id === car.id ||
        other.health <= 0 ||
        Math.abs((other.z || 0) - (car.z || 0)) > 12 ||
        distance(other, car) > 22
      )
        continue;
      const impact = Math.abs(car.speed - other.speed);
      if (impact > 30) {
        ctx.damageVehicle(other, impact * 0.05);
        ctx.damageVehicle(car, impact * 0.035);
      }
      car.speed *= 0.25;
      if (other.id === state.player.vehicleId) other.speed *= 0.65;
      car.x = before.x;
      car.y = before.y;
    }
    for (const id of car.crewIds) {
      const member = state.police.find((actor) => actor.id === id);
      if (member && member.inVehicle) {
        member.x = car.x;
        member.y = car.y;
        member.z = car.z || 0;
        member.groundZ = car.groundZ || 0;
        member.angle = car.angle;
      }
    }
    if (car.speed < 12 && distance(car, known) < 68 && !dispatch.knownVehicleId)
      disembark(state, car, ctx);
  }
}
function searchPoint(state, officer, ctx) {
  const known = state.wanted.lastSeen,
    number = Number(officer.id.split('-').at(-1)) || 0;
  const phase = (Math.floor(state.time / 7) + number) % 8,
    angle = (phase * Math.PI) / 4;
  return (
    snapToRoad(ctx.world, {
      x: known.x + Math.cos(angle) * 120,
      y: known.y + Math.sin(angle) * 120,
    }) || known
  );
}
function updateOfficers(state, dt, ctx) {
  for (const actor of state.police) {
    if (actor.health <= 0) continue;
    actor.fireCooldown = Math.max(0, actor.fireCooldown - dt);
    ctx.reloadActor(actor, dt);
    if (state.wanted.level >= 2 && !actor.armedAuthorized && actor.role !== 'overwatch') {
      actor.weapon = 'pistol';
      actor.ammo = { clip: 12, reserve: 36 };
      actor.reloadRemaining = 0;
      actor.armedAuthorized = true;
    }
    actor.mode = state.wanted.status;
    const sees = canObserve(actor, state.player, POLICE_TIERS[state.wanted.level].sight, ctx);
    const target = sees
      ? state.player
      : state.wanted.status === 'pursuit'
        ? state.wanted.lastSeen
        : searchPoint(state, actor, ctx);
    if (actor.inVehicle) {
      if (
        actor.seat === 1 &&
        sees &&
        state.wanted.level >= 2 &&
        distance(actor, state.player) < 175 &&
        actor.fireCooldown === 0
      )
        ctx.fire(actor);
      continue;
    }
    if (actor.role === 'overwatch') {
      actor.angle = angleTo(actor, state.wanted.lastSeen);
    } else if (actor.anchor) {
      if (distance(actor, actor.anchor) > 25)
        routeBody(actor, actor.anchor, state, ctx, dt, actor.speed, 7);
      else actor.angle = angleTo(actor, target);
    } else if (
      sees &&
      distance(actor, target) < 90 &&
      distance(actor, target) > (state.wanted.level === 1 ? 13 : 60)
    ) {
      actor.angle = angleTo(actor, target);
      ctx.moveBody(
        actor,
        Math.cos(actor.angle) * actor.speed * dt,
        Math.sin(actor.angle) * actor.speed * dt,
        7,
      );
    } else if (distance(actor, target) > (state.wanted.level === 1 ? 13 : 60))
      routeBody(actor, target, state, ctx, dt, actor.speed, 7);
    else actor.angle = angleTo(actor, target);
    if (
      sees &&
      state.wanted.level >= 2 &&
      distance(actor, state.player) < (actor.role === 'overwatch' ? 500 : 185) &&
      actor.fireCooldown === 0
    )
      ctx.fire(actor);
  }
}
function updateAircraft(state, dt, ctx) {
  for (const air of state.policeAircraft) {
    if (air.health <= 0) {
      air.observing = false;
      air.fallSpeed = (air.fallSpeed || 0) + 80 * dt;
      air.z = Math.max(0, air.z - air.fallSpeed * dt);
      if (air.z === 0)
        state.combatEffects.push({
          id: ctx.id('air-impact'),
          type: 'explosion',
          x: air.x,
          y: air.y,
          z: 0,
          remaining: 0.65,
          radius: 34,
        });
      continue;
    }
    air.phase += dt * 0.35;
    const known = state.wanted.lastSeen,
      target = { x: known.x + Math.cos(air.phase) * 140, y: known.y + Math.sin(air.phase) * 140 };
    air.angle = angleTo(air, target);
    const travel = Math.min(distance(air, target), air.speed * dt);
    air.x = clamp(
      air.x + Math.cos(air.angle) * travel,
      ctx.world.bounds.left,
      ctx.world.bounds.right,
    );
    air.y = clamp(
      air.y + Math.sin(air.angle) * travel,
      ctx.world.bounds.top,
      ctx.world.bounds.bottom,
    );
    const sweep = 125 * Math.sin(air.phase * 0.8) ** 2;
    air.searchlight.x = clamp(
      known.x + Math.cos(air.phase * 1.7) * sweep,
      ctx.world.bounds.left,
      ctx.world.bounds.right,
    );
    air.searchlight.y = clamp(
      known.y + Math.sin(air.phase * 1.7) * sweep,
      ctx.world.bounds.top,
      ctx.world.bounds.bottom,
    );
    air.observing =
      distance(state.player, air.searchlight) < air.searchlight.radius &&
      canObserve(air, state.player, 420, ctx);
  }
  state.policeAircraft = state.policeAircraft.filter((air) => air.health > 0 || air.z > 0);
}
function arrest(state, officer, ctx) {
  const carried = state.player.weapons.filter((id) => id !== 'unarmed'),
    fee = Math.min(state.player.money, 75);
  state.player.money -= fee;
  state.player.armour = 0;
  for (const id of carried) state.player.ammo[id] = { clip: 0, reserve: 0 };
  state.player.ownedWeapons = state.player.ownedWeapons.filter((id) => !carried.includes(id));
  state.player.weapons = ['unarmed'];
  state.player.weapon = 'unarmed';
  state.player.reloadRemaining = 0;
  state.player.meleeAction = null;
  state.player.cover = null;
  state.player.traversal = null;
  state.player.dodgeRemaining = 0;
  const car = state.vehicles.find((vehicle) => vehicle.id === state.player.vehicleId);
  if (car) {
    car.occupied = false;
    car.speed = 0;
  }
  state.player.vehicleId = null;
  state.player.z = 0;
  state.player.groundZ = 0;
  state.player.swimming = false;
  state.player.vz = 0;
  state.player.speed = 0;
  state.player.surrendering = false;
  const precinct = ctx.world.locations.find((location) => location.type === 'police') || {
    x: 1080,
    y: 440,
  };
  state.player.x = precinct.x;
  state.player.y = precinct.y;
  state.progress.arrests++;
  state.policeDispatch.lastArrest = {
    time: state.time,
    fee,
    confiscated: carried,
    officerId: officer.id,
  };
  Object.assign(state.wanted, {
    level: 0,
    heat: 0,
    status: 'clear',
    lastSeen: { x: precinct.x, y: precinct.y },
    searchRadius: 0,
    timer: 0,
    unseen: 0,
    pursuitTime: 0,
    observed: false,
  });
  clearResponse(state);
  state.policeDispatch.reports = [];
  ctx.onArrest();
  ctx.notify(
    `Released from holding · $${fee} fee. Carried weapons and armour confiscated.`,
    'danger',
  );
}
function updateArrest(state, dt, input, ctx) {
  const dispatch = state.policeDispatch;
  if (state.wanted.level !== 1 || state.player.vehicleId || state.player.health <= 0) {
    dispatch.arrestProgress = 0;
    dispatch.arrestOfficerId = null;
    return;
  }
  const officer = state.police.find(
    (actor) =>
      actor.health > 0 &&
      !actor.inVehicle &&
      distance(actor, state.player) < 22 &&
      canObserve(actor, state.player, 50, ctx),
  );
  if (!officer) {
    dispatch.arrestProgress = 0;
    dispatch.arrestOfficerId = null;
    return;
  }
  const movement =
    Math.hypot(input.moveX || 0, input.moveY || 0) > 0.15 ||
    input.forward ||
    input.backward ||
    input.left ||
    input.right ||
    input.up ||
    input.down;
  if (movement || input.fire || input.dodge || input.jump) {
    if (dispatch.arrestProgress > 0.15 || input.fire) {
      forcePoliceWanted(state, 2, state.player, ctx);
      ctx.notify('Resisting arrest. Armed response authorized.', 'danger');
    }
    dispatch.arrestProgress = 0;
    dispatch.arrestOfficerId = null;
    return;
  }
  if (dispatch.arrestOfficerId !== officer.id) {
    dispatch.arrestOfficerId = officer.id;
    ctx.notify('Police: stand still or hold surrender. Moving resists arrest.', 'danger');
  }
  state.wanted.status = 'arrest';
  dispatch.arrestProgress += dt * (state.player.surrendering ? 1.25 : 0.65);
  if (dispatch.arrestProgress >= 1) arrest(state, officer, ctx);
}

export function updatePolicing(state, dt, input, ctx) {
  initializePolicing(state);
  updateReports(state, dt, ctx);
  const movement =
    Math.hypot(input.moveX || 0, input.moveY || 0) > 0.15 ||
    input.forward ||
    input.backward ||
    input.left ||
    input.right ||
    input.up ||
    input.down;
  state.player.surrendering = Boolean(
    input.surrender && !movement && !input.fire && !state.player.vehicleId,
  );
  if (!state.wanted.level) {
    if (
      state.police.some((actor) => actor.role) ||
      state.policeAircraft.length ||
      state.policeDispatch.roadblocks.length
    )
      clearResponse(state);
    return;
  }
  const wanted = state.wanted,
    tier = POLICE_TIERS[wanted.level];
  wanted.searchRadius = tier.radius;
  wanted.pursuitTime += dt;
  const observers = state.police.filter((actor) =>
    canObserve(actor, state.player, tier.sight, ctx),
  );
  const aircraft = state.policeAircraft.filter(
    (air) => air.health > 0 && air.observing && canObserve(air, state.player, 420, ctx),
  );
  wanted.observed = observers.length + aircraft.length > 0;
  state.policeDispatch.observedBy = [...observers, ...aircraft].map((actor) => actor.id);
  if (wanted.observed) {
    wanted.lastSeen = {
      x: state.player.x,
      y: state.player.y,
      ...(state.player.z ? { z: state.player.z } : {}),
    };
    wanted.lastSeenTime = state.time;
    wanted.unseen = 0;
    wanted.timer = 0;
    wanted.status = 'pursuit';
    Object.assign(state.policeDispatch, {
      knownHeading: state.player.angle,
      knownSpeed: state.player.speed || 0,
      knownVehicleId: state.player.vehicleId,
    });
  } else {
    wanted.unseen += dt;
    if (wanted.unseen > 2.5) wanted.status = 'search';
    const beyond = distance(state.player, wanted.lastSeen) > wanted.searchRadius;
    const clearCordon = state.policeDispatch.cordon.every(
      (block) => !block.active || distance(block, state.player) > 85,
    );
    if (wanted.unseen > 2.5 && beyond && clearCordon) {
      wanted.status = 'cooling';
      wanted.timer += dt;
    } else if (wanted.status !== 'pursuit') wanted.timer = 0;
    if (wanted.timer >= tier.cooling) {
      Object.assign(wanted, {
        level: 0,
        heat: 0,
        status: 'clear',
        searchRadius: 0,
        observed: false,
      });
      clearResponse(state);
      ctx.notify('Pursuit ended. Your wanted level is clear.', 'success');
      return;
    }
  }
  if (state.time >= state.policeDispatch.nextDeployment) deploy(state, ctx);
  updateCruisers(state, dt, ctx);
  updateOfficers(state, dt, ctx);
  updateAircraft(state, dt, ctx);
  for (const block of [...state.policeDispatch.roadblocks, ...state.policeDispatch.cordon])
    block.active = block.vehicleIds.some((id) =>
      state.vehicles.some(
        (car) =>
          car.id === id && car.health > 0 && car.policeControlled && distance(car, block) < 55,
      ),
    );
  for (const actor of state.police)
    if (actor.health <= 0) {
      actor.corpseRemaining ??= 12;
      actor.corpseRemaining -= dt;
    }
  state.police = state.police.filter((actor) => actor.health > 0 || actor.corpseRemaining > 0);
  updateArrest(state, dt, input, ctx);
}

export function validatePoliceSave(state, world) {
  const finite = (value, min, max) =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const point = (value) =>
    value && finite(value.x, 0, world.width) && finite(value.y, 0, world.height);
  const dispatch = state.policeDispatch;
  const elevation = worldElevation(world);
  if (
    state.policeVersion !== 1 ||
    !dispatch ||
    !Array.isArray(dispatch.reports) ||
    !Array.isArray(dispatch.roadblocks) ||
    !Array.isArray(dispatch.cordon) ||
    !Array.isArray(state.policeAircraft) ||
    dispatch.reports.length > 30 ||
    dispatch.roadblocks.length > 20 ||
    dispatch.cordon.length > 20 ||
    state.policeAircraft.length > 4 ||
    !finite(dispatch.nextDeployment, 0, 1e9) ||
    !finite(dispatch.knownHeading, -10, 10) ||
    !finite(dispatch.knownSpeed, -300, 300) ||
    !finite(dispatch.arrestProgress, 0, 2) ||
    !Number.isInteger(state.progress.arrests) ||
    state.progress.arrests < 0 ||
    typeof state.player.surrendering !== 'boolean'
  )
    throw new Error('The saved dispatch state is invalid.');
  if (
    !Number.isInteger(dispatch.deploymentSequence) ||
    !finite(dispatch.deploymentSequence, 0, 1e9) ||
    !Array.isArray(dispatch.observedBy) ||
    dispatch.observedBy.length > 100 ||
    dispatch.observedBy.some((id) => typeof id !== 'string') ||
    typeof state.wanted.observed !== 'boolean' ||
    !finite(state.wanted.lastSeenTime, -1, state.time + 1e-6) ||
    !finite(state.wanted.heat, 0, 6)
  )
    throw new Error('The saved observation state is invalid.');
  if (
    state.police.some(
      (actor) =>
        (actor.role !== undefined &&
          !['patrol', 'search', 'tactical', 'cordon', 'overwatch'].includes(actor.role)) ||
        (actor.armour !== undefined && !finite(actor.armour, 0, 200)) ||
        (actor.z !== undefined && !finite(actor.z, elevation.min, elevation.max)) ||
        (actor.inVehicle !== undefined && typeof actor.inVehicle !== 'boolean') ||
        (actor.policeRoute &&
          (!Array.isArray(actor.policeRoute) ||
            actor.policeRoute.length > 40 ||
            actor.policeRoute.some((position) => !point(position)))) ||
        (actor.inVehicle &&
          !state.vehicles.some(
            (car) => car.id === actor.vehicleId && car.crewIds?.includes(actor.id),
          )),
    )
  )
    throw new Error('The saved response officers are invalid.');
  if (
    dispatch.reports.some(
      (report) =>
        !point(report.point) ||
        typeof report.witnessId !== 'string' ||
        typeof report.type !== 'string' ||
        !finite(report.remaining, 0, 4) ||
        !finite(report.severity, 1, 6),
    )
  )
    throw new Error('The saved witness reports are invalid.');
  if (
    [...dispatch.roadblocks, ...dispatch.cordon].some(
      (block) =>
        !point(block) ||
        !Array.isArray(block.vehicleIds) ||
        !Array.isArray(block.officerIds) ||
        typeof block.active !== 'boolean',
    )
  )
    throw new Error('The saved roadblocks are invalid.');
  if (
    state.policeAircraft.some(
      (air) =>
        !point(air) ||
        !finite(air.z, 0, elevation.max) ||
        !finite(air.health, 0, 500) ||
        !finite(air.angle, -10, 10) ||
        !point(air.searchlight) ||
        !finite(air.searchlight.radius, 0, 150) ||
        typeof air.observing !== 'boolean',
    )
  )
    throw new Error('The saved airborne response is invalid.');
  if (
    state.vehicles.some(
      (car) =>
        car.policeControlled &&
        (!['patrol', 'armored', 'roadblock', 'cordon'].includes(car.response) ||
          !Array.isArray(car.crewIds) ||
          !Array.isArray(car.policeRoute) ||
          car.policeRoute.length > 30 ||
          car.policeRoute.some((pointValue) => !point(pointValue))),
    )
  )
    throw new Error('The saved police vehicles are invalid.');
  if (
    state.vehicles.some(
      (car) =>
        car.policeControlled &&
        ((car.armour !== undefined && !finite(car.armour, 0, 250)) ||
          (car.driverId && !state.police.some((actor) => actor.id === car.driverId)) ||
          car.crewIds.some(
            (id) => typeof id !== 'string' || !state.police.some((actor) => actor.id === id),
          )),
    )
  )
    throw new Error('The saved response ownership is invalid.');
}
