/** Resolve physical bodies and geometry without mixing room-local and city coordinates. */
import {
  INTERIOR_LAYOUTS,
  interiorActors,
  interiorCollisionVolumes,
  isInteriorBlocked,
  hasInteriorLineOfSight,
} from './interiors.js';
import { createTerrain } from './terrain.js';
import { createSurfaceMovement } from './surface-movement.js';

export const actorSceneId = (actor) =>
  actor?.sceneId ?? (actor?.scene?.kind === 'interior' ? actor.scene.id : null);
export const currentSceneId = (state) => state.interior?.active?.roomId ?? null;
export const inScene = (actor, id) => actorSceneId(actor) === id;

function roomContext(state, id) {
  return currentSceneId(state) === id
    ? state
    : {
        ...state,
        interior: { ...state.interior, active: { roomId: id } },
      };
}

export function scenePeople(state, id = currentSceneId(state)) {
  if (id)
    return [
      ...interiorActors(roomContext(state, id)),
      ...[...state.hostiles, ...state.police, ...state.pedestrians].filter((actor) =>
        inScene(actor, id),
      ),
    ];
  return [...state.hostiles, ...state.police, ...state.pedestrians].filter((actor) =>
    inScene(actor, null),
  );
}
export function sceneVehicles(state, id = currentSceneId(state)) {
  return state.vehicles.filter((actor) => inScene(actor, id));
}
export function findScenePerson(state, id) {
  for (const actor of [...state.hostiles, ...state.police, ...state.pedestrians])
    if (actor.id === id) return actor;
  for (const roomId of Object.keys(state.interior?.rooms || {})) {
    const actor = interiorActors(roomContext(state, roomId)).find((actor) => actor.id === id);
    if (actor) return actor;
  }
  return null;
}

export function createSceneContext(world, terrain = createTerrain(world)) {
  const outsideMovement = createSurfaceMovement(terrain);
  function queries(state, id = currentSceneId(state)) {
    if (!id) return terrain;
    const room = INTERIOR_LAYOUTS[id];
    if (!room) throw new Error('Unknown physical room scene.');
    const local = roomContext(state, id),
      ceiling = room.ceilingZ ?? 72;
    return {
      isBlocked(x, y, radius = 7, z = 0) {
        if (z < room.floorZ || z >= ceiling) return true;
        return isInteriorBlocked(local, x, y, radius, z);
      },
      hasLineOfSight(a, b) {
        const eye = (point) => (point.z || 0) + (point.health !== undefined ? 14 : 0);
        if (eye(a) < room.floorZ || eye(b) < room.floorZ || eye(a) >= ceiling || eye(b) >= ceiling)
          return false;
        return hasInteriorLineOfSight(
          local,
          { ...a, eyeHeight: a.eyeHeight ?? 26 },
          { ...b, eyeHeight: b.eyeHeight ?? 26 },
        );
      },
      traceSolid(a, b, radius = 1) {
        let hit = null;
        for (const volume of interiorCollisionVolumes(local)) {
          let enter = 0,
            leave = 1;
          for (const [axis, min, max] of [
            ['x', volume.x - radius, volume.x + volume.w + radius],
            ['y', volume.y - radius, volume.y + volume.h + radius],
            ['z', 0, volume.height],
          ]) {
            const start = a[axis] || 0,
              delta = (b[axis] || 0) - start;
            if (!delta) {
              if (start < min || start > max) {
                enter = 2;
                break;
              }
              continue;
            }
            const t0 = (min - start) / delta,
              t1 = (max - start) / delta;
            enter = Math.max(enter, Math.min(t0, t1));
            leave = Math.min(leave, Math.max(t0, t1));
          }
          if (enter <= leave && enter <= 1 && (!hit || enter < hit.t))
            hit = {
              volume,
              t: enter,
              point: {
                x: a.x + (b.x - a.x) * enter,
                y: a.y + (b.y - a.y) * enter,
                z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * enter,
              },
            };
        }
        return hit;
      },
      surfaceHeight() {
        return room.floorZ;
      },
      nearbyBuildings(x, y, radius = 0) {
        return interiorCollisionVolumes(local).filter(
          (item) =>
            x + radius >= item.x &&
            x - radius <= item.x + item.w &&
            y + radius >= item.y &&
            y - radius <= item.y + item.h,
        );
      },
      isWater() {
        return false;
      },
    };
  }
  function sight(state, a, b, id = currentSceneId(state)) {
    const scene = (actor) =>
      actor === state.player
        ? currentSceneId(state)
        : actor?.sceneId !== undefined || actor?.scene
          ? actorSceneId(actor)
          : actor?.id || actor?.health !== undefined
            ? null
            : id;
    if (scene(a) !== id || scene(b) !== id) return false;
    return queries(state, id).hasLineOfSight(a, b);
  }
  function moveBody(state, body, dx, dy, radius, options = {}) {
    const id = body === state.player ? currentSceneId(state) : actorSceneId(body);
    if (!id) return outsideMovement.moveBody(body, dx, dy, radius, options);
    const geometry = queries(state, id),
      steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (radius * 0.6)));
    let collided = false;
    for (let i = 0; i < steps; i++) {
      const x = body.x + dx / steps,
        y = body.y + dy / steps;
      if (!geometry.isBlocked(x, y, radius, body.z || 0)) {
        body.x = x;
        body.y = y;
        continue;
      }
      collided = true;
      if (!geometry.isBlocked(x, body.y, radius, body.z || 0)) body.x = x;
      if (!geometry.isBlocked(body.x, y, radius, body.z || 0)) body.y = y;
    }
    body.groundZ = INTERIOR_LAYOUTS[id].floorZ;
    body.z ??= body.groundZ;
    return collided;
  }
  function validationWorld(state) {
    if (!currentSceneId(state)) return world;
    return { ...world, buildings: [...world.buildings, ...interiorCollisionVolumes(state)] };
  }
  return { queries, sight, moveBody, validationWorld };
}
