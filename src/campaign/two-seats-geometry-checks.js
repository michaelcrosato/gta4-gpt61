/** Deterministic physical geometry proof, not a mission/playthrough receipt. */
import { createSceneBodyClearance } from '../scene-body-clearance.js';
import { checkLateMeterVehicleSweep } from './late-meter-scenes.js';
import {
  initializeInteriors,
  INTERIOR_LAYOUTS,
  PORTAL_DEFINITIONS,
  setInteriorDoor,
  hasInteriorLineOfSight,
} from '../interiors.js';
export function proveTwoSeatsGeometry(world, plan) {
  const full = createSceneBodyClearance(world),
    checks = {},
    add = (name, value) => (checks[name] = value);
  const path = (name, points, sceneId = null, height = 30, radius = 7, state = {}) => {
    const failures = [];
    for (let i = 1; i < points.length; i++) {
      const r = full.sweep(state, points[i - 1], points[i], { sceneId, height, radius });
      if (!r.clear) failures.push({ leg: i - 1, ...r });
    }
    add(name, { ready: !failures.length, failures });
  };
  for (const key of ['boardwalk-station', 'tess-flat', 'pier-goods'])
    path(key + ':car', plan.bindings[key].approach, null, 16, Math.hypot(29, 15) / 2);
  const b = plan.bindings['boardwalk-station'];
  const waitBodies = [
    ['LL-CHAR-008', b.existingNadiaWait],
    ['LL-CHAR-025', b.newTessWait],
  ].map(([id, p]) => ({
    id: 'waiting:' + id,
    x: p.x - 11,
    y: p.y - 11,
    w: 22,
    h: 22,
    z: 0,
    height: 30,
  }));
  for (const [id, p] of [
    ['nadia', b.existingNadiaWait],
    ['tess', b.newTessWait],
  ]) {
    const result = full.inspect({}, p, { sceneId: null, radius: 11, height: 30 });
    add('boardwalk:accepted-wait-disk:' + id, {
      ready: result.clear,
      bodyRadius: 7,
      arrivalRadius: 4,
      issues: result.issues,
    });
  }
  const approachWorld = { ...world, obstacles: [...(world.obstacles ?? []), ...waitBodies] };
  const actorClear = checkLateMeterVehicleSweep(
    approachWorld,
    b.approach,
    { length: 29, width: 15, height: 16 },
    { terrain: full.exterior.terrain },
  );
  add('boardwalk:approach-live-wait-bodies', {
    ready: actorClear.clear,
    ...actorClear,
    bodyRadius: 7,
    arrivalRadius: 4,
  });
  add('boardwalk:sequential-boarding-order', {
    ready: JSON.stringify(b.boardingOrder) === JSON.stringify(['LL-CHAR-008', 'LL-CHAR-025']),
    requiresActualSeatedFirst: true,
  });

  for (const key of ['nadiaBoard', 'tessBoard', 'felixDoorToEntry', 'nadiaFromDocksideStreet'])
    path('boardwalk:' + key, b[key]);
  path('dispatch:exteriorRetreat', plan.bindings.dispatch.encounter.exteriorRetreat);
  for (const key of ['boardwalk-station', 'tess-flat', 'pier-goods']) {
    const pose = plan.bindings[key].pickupPose,
      c = Math.cos(pose.angle),
      s = Math.sin(pose.angle);
    const seats = key === 'pier-goods' ? [0, 2] : [0, 1, 2, 3];
    for (const seat of seats) {
      const along = seat < 2 ? 29 * 0.12 : -29 * 0.21,
        side = seat % 2 ? 16.5 : -16.5,
        p = { x: pose.x + along * c - side * s, y: pose.y + along * s + side * c, z: 0 };
      const result = full.inspect({}, p, { sceneId: null, height: 30, radius: 7 });
      add(key + ':standing-seat-door-' + seat, {
        ready: result.clear,
        pose: p,
        issues: result.issues,
      });
    }
  }

  for (const key of ['tess-flat', 'pier-goods']) {
    const b = plan.bindings[key],
      p = PORTAL_DEFINITIONS.find((p) => p.id === b.portal.id),
      alias = world.locations.find((l) => l.id === key);
    add(key + ':registry', {
      ready:
        !!INTERIOR_LAYOUTS[key] &&
        JSON.stringify(p) === JSON.stringify(b.portal) &&
        alias?.x === b.entry.x &&
        alias?.y === b.entry.y &&
        alias?.siteId === b.siteId,
    });
    for (const name of Object.keys(b).filter((k) => k.endsWith('ToEntry')))
      path(key + ':' + name, b[name]);
  }
  for (const [id, paths] of Object.entries({
    'voss-dispatch': {
      playerApproach: plan.bindings.dispatch.encounter.playerApproach,
      daxRetreat: plan.bindings.dispatch.encounter.daxRetreat,
      pelRetreat: plan.bindings.dispatch.encounter.pelRetreat,
    },
    'tess-flat': { interiorWalk: plan.bindings['tess-flat'].interiorWalk },
    'pier-goods': Object.fromEntries(
      ['interiorWalk', 'changingWalk', 'clerkWalk', 'felixInteriorWalk'].map((k) => [
        k,
        plan.bindings['pier-goods'][k],
      ]),
    ),
  })) {
    const state = { time: 0, player: { health: 100 }, vehicles: [] };
    initializeInteriors(state);
    state.interior.active = { roomId: id };
    for (const d of INTERIOR_LAYOUTS[id].doors.filter((d) => d.exit))
      setInteriorDoor(state, d.id, { open: true });
    for (const [name, p] of Object.entries(paths)) path(id + ':' + name, p, id, 30, 7, state);
    if (id === 'pier-goods') {
      const b = plan.bindings['pier-goods'],
        eye = (p) => ({ ...p, z: 0, health: 100, eyeHeight: 24 });
      add('pier-goods:actual-speakers', {
        ready: [b.clerkServiceMark, b.felixServiceMark].every(
          (p) =>
            Math.hypot(p.x - b.dialogue.hook.x, p.y - b.dialogue.hook.y) <=
              b.dialogue.speakerRange &&
            hasInteriorLineOfSight(state, eye(b.dialogue.hook), eye(p)),
        ),
      });
    }
  }
  add('closed-station-doors', {
    ready:
      b.closedAccess?.every(
        (g) =>
          world.obstacles.some((o) => o.id === g.id) &&
          !full.inspect(
            {},
            { x: g.x + 0.375, y: g.y + g.h / 2, z: 0, radius: 7, height: 30 },
            { sceneId: null },
          ).clear,
      ) === true,
  });
  return {
    ready: Object.values(checks).every((c) => c.ready),
    checks,
    body: { radius: 7, height: 30 },
    car: { length: 29, width: 15, conservativeHeight: 16 },
    doors:
      'Room route proofs require actual open exit doors; closed doors still block shared movement.',
    boundary:
      'Declared static physical check using production room registry and exact native deck/pier queries. No actor movement, campaign progress, rendered-art or natural-input journey credit.',
  };
}
