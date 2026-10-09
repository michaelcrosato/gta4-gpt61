/** Shared movement, navigation and reached-door authorization for campaign actors. */
import {
  INTERIOR_LAYOUTS,
  PORTAL_DEFINITIONS,
  interiorActors,
  setInteriorDoor,
} from '../interiors.js';
import { actorSceneId } from '../scene-context.js';
import { findRoute } from '../navigation.js';
import { getActor } from '../companions.js';
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (a, b, r = 8) => distance(a, b) <= r + 1e-6 && Math.abs((a.z ?? 0) - (b.z ?? 0)) <= 6;
function vehicleBlocks(state, specs, x, y, radius, z, sceneId, ignore) {
  return state.vehicles.some((v) => {
    if (
      v.id === ignore ||
      v.health <= 0 ||
      actorSceneId(v) !== sceneId ||
      z < (v.z ?? 0) - 4 ||
      z >= (v.z ?? 0) + 16
    )
      return false;
    const spec = specs[v.spec],
      c = Math.cos(v.angle),
      s = Math.sin(v.angle),
      dx = x - v.x,
      dy = y - v.y,
      a = dx * c + dy * s,
      b = -dx * s + dy * c;
    return (
      Math.hypot(
        a - Math.max(-spec.length / 2, Math.min(spec.length / 2, a)),
        b - Math.max(-spec.width / 2, Math.min(spec.width / 2, b)),
      ) < radius
    );
  });
}
export function createCampaignPhysicalContext(state, engine) {
  const { world, terrain, specs, scenes, localPath } = engine;
  for (const name of ['isBodyBlocked', 'bodySegmentBlocked', 'preferLocalFootPaths'])
    if (engine[name] !== undefined && typeof engine[name] !== 'function')
      throw TypeError('Invalid physical body query: ' + name);
  const query = (id) => scenes.queries(state, id);
  const location = (portal) => world.locations.find((l) => l.id === portal.locationId);
  const invited = (id) =>
    id !== 'dockside-rooms' ||
    state.storyInventory?.keys.includes('dockside-tenancy') ||
    state.campaign?.active?.missionId === 'LL-ST-001';
  const roomContext = (id) => ({
    ...state,
    interior: { ...state.interior, active: { roomId: id } },
  });
  const doorFor = (id) => INTERIOR_LAYOUTS[id]?.doors.find((d) => d.exit);
  const openDoor = (id) => {
    const room = roomContext(id);
    interiorActors(room);
    const door = doorFor(id);
    if (!door || state.interior.rooms[id].doors[door.id].locked || !invited(id)) return false;
    return setInteriorDoor(room, door.id, { open: true });
  };
  const geometry = (id, ignore) => ({
    isBlocked: (x, y, r, z) =>
      query(id).isBlocked(x, y, r, z) ||
      (engine.isBodyBlocked && engine.isBodyBlocked(x, y, r, z, id) !== false) ||
      vehicleBlocks(state, specs, x, y, r, z, id, ignore),
    surfaceHeight: (x, y, z) => (id ? INTERIOR_LAYOUTS[id].floorZ : terrain.surfaceHeight(x, y, z)),
    ...(engine.bodySegmentBlocked && engine.preferLocalFootPaths?.() === true
      ? {
          segmentBlocked: (a, b, radius) =>
            engine.bodySegmentBlocked(a, b, radius, id) !== false ||
            vehicleBlocks(
              state,
              specs,
              (a.x + b.x) / 2,
              (a.y + b.y) / 2,
              radius + distance(a, b) / 2,
              Math.min(a.z ?? 0, b.z ?? 0),
              id,
              ignore,
            ),
        }
      : {}),
  });
  const local = (actor, target, id, ignore) => {
    if (typeof localPath !== 'function') return [];
    const bounds = id
      ? {
          left: 0,
          top: 0,
          right: INTERIOR_LAYOUTS[id].width,
          bottom: INTERIOR_LAYOUTS[id].height + 25,
        }
      : world.bounds;
    return localPath(geometry(id, ignore), actor, target, {
      bounds,
      radius: 7,
      maxNodes: 4096,
      maxChecks: 60000,
    }).map((p) => ({ ...p, sceneId: id }));
  };
  const exterior = (actor, target) => {
    const checkedLocal = engine.preferLocalFootPaths?.() === true;
    if (distance(actor, target) < 140 || checkedLocal) {
      const path = local(actor, target, null);
      if (path.length || checkedLocal) return path;
    }
    return findRoute(world, actor, target, { mode: 'foot', includeZ: true }).map((p) => ({
      ...p,
      sceneId: null,
    }));
  };
  const context = {
    specs,
    sceneExists: (id) => id === null || Boolean(INTERIOR_LAYOUTS[id]),
    resolveActor: (id) =>
      id === 'player' || id === 'LL-CHAR-001' ? state.player : getActor(state, id),
    isScriptControlled: (actor) => engine.scriptControlled?.(actor) === true,
    isBlocked: (x, y, r, z, id, options = {}) =>
      geometry(id, options.ignoreVehicleId).isBlocked(x, y, r, z),
    hasLineOfSight: (a, b, id) => query(id).hasLineOfSight(a, b),
    surfaceHeight: (x, y, z, id) => geometry(id).surfaceHeight(x, y, z),
    moveBody(actor, dx, dy, radius, options = {}) {
      const ignoreVehicleId = ['boarding', 'exiting'].includes(options.phase)
        ? options.ignoreVehicleId
        : null;
      const count = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 3)),
        id = actorSceneId(actor);
      for (let i = 0; i < count; i++) {
        const x = actor.x + dx / count,
          y = actor.y + dy / count,
          z = geometry(id).surfaceHeight(x, y, actor.z ?? 0);
        if (vehicleBlocks(state, specs, x, y, radius, z, id, ignoreVehicleId)) return true;
        if (scenes.moveBody(state, actor, dx / count, dy / count, radius, { mode: 'foot' }))
          return true;
      }
      return false;
    },
    findRoute(actor, target) {
      const from = actorSceneId(actor),
        to = target.sceneId ?? null;
      if (from === to) {
        if (from) return local(actor, target, from);
        const berth = world.campaignSceneBindings?.['pier-berth'];
        if (
          berth &&
          actor.x > 1650 &&
          actor.x < 1770 &&
          actor.y > 750 &&
          actor.y < 920 &&
          distance(target, berth.taxiSpawn) < 70
        )
          return [...berth.apronWaypoints, { ...target, sceneId: null }].map((p) => ({
            ...p,
            sceneId: null,
          }));
        return exterior(actor, target);
      }
      const roomId = to ?? from,
        portal = PORTAL_DEFINITIONS.find((p) => p.roomId === roomId),
        entry = portal && location(portal),
        room = INTERIOR_LAYOUTS[roomId];
      if (!portal || !entry || !room || !invited(roomId)) return [];
      if (from === null) {
        const path = exterior(actor, { ...entry, z: entry.z ?? 0, sceneId: null });
        if (!path.length) return [];
        path[path.length - 1] = {
          ...entry,
          z: entry.z ?? 0,
          sceneId: null,
          portal: {
            id: portal.id,
            radius: 8,
            to: { ...room.spawn, z: room.floorZ, sceneId: roomId },
          },
        };
        return [...path, { ...target, sceneId: roomId }];
      }
      if (to === null && openDoor(roomId)) {
        const door = doorFor(roomId),
          threshold = {
            x: door.x + door.w / 2,
            y: room.height + 8,
            z: room.floorZ,
            sceneId: roomId,
          };
        const path = local(actor, threshold, roomId);
        if (!path.length) return [];
        path[path.length - 1] = {
          ...threshold,
          portal: {
            id: portal.id,
            radius: 3,
            to: { x: entry.x, y: entry.y, z: entry.z ?? 0, sceneId: null },
          },
        };
        return [...path, { ...target, sceneId: null }];
      }
      return [];
    },
    transitionScene(actor, transition) {
      const portal = PORTAL_DEFINITIONS.find((p) => p.id === transition.id),
        entry = portal && location(portal),
        room = portal && INTERIOR_LAYOUTS[portal.roomId];
      if (!entry || !room || !invited(room.id)) return false;
      const to = transition.to;
      if (actorSceneId(actor) === null && to.sceneId === room.id) {
        if (
          !near(actor, entry, transition.radius) ||
          !near(to, { ...room.spawn, z: room.floorZ }, 1e-6) ||
          Math.abs((to.z ?? 0) - room.floorZ) > 1e-6 ||
          !openDoor(room.id)
        )
          return false;
      } else if (actorSceneId(actor) === room.id && to.sceneId === null) {
        const door = doorFor(room.id);
        if (
          !door ||
          actor.y <= room.height ||
          actor.x < door.x ||
          actor.x > door.x + door.w ||
          !near(to, entry, 1e-6) ||
          Math.abs((to.z ?? 0) - (entry.z ?? 0)) > 1e-6
        )
          return false;
      } else return false;
      if (geometry(to.sceneId).isBlocked(to.x, to.y, 7, to.z ?? 0)) return false;
      Object.assign(actor, {
        x: to.x,
        y: to.y,
        z: to.z ?? 0,
        sceneId: to.sceneId,
        groundZ: to.z ?? 0,
        vz: 0,
      });
      return true;
    },
    canRideSceneTransition(actor, vehicle, oldPose) {
      const from = oldPose?.sceneId ?? null,
        to = actorSceneId(vehicle),
        active = state.interior?.active;
      if (from === to) return true;
      if (active?.vehicleId === vehicle.id && active.roomId === to && from === null)
        return state.player.vehicleId === vehicle.id;
      const exit = state.interior?.lastExit;
      return Boolean(
        to === null &&
        exit?.roomId === from &&
        state.time - exit.time < 0.1 &&
        state.player.vehicleId === vehicle.id,
      );
    },
    onEvent: (event) => engine.onEvent?.(event),
  };
  return context;
}
