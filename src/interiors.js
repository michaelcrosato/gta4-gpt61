/** Original local interior spaces and deterministic portal transitions. No simulation dependency. */
import { createTerrain } from './terrain.js';
import { WEAPONS } from './combat.js';
import { DOCKSIDE_ROOM_LAYOUT, DOCKSIDE_PORTAL } from './campaign/scenes.js';
import { IMPOUND_ANNEX_LAYOUT, IMPOUND_ANNEX_PORTAL } from './campaign/late-meter-scenes.js';
import { TWO_SEATS_ROOMS } from './campaign/two-seats-scenes.js';
import { TWO_SEATS_PORTALS } from './campaign/two-seats-registration.js';

const VERSION = 1;
const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const finite = (value, low = -1e9, high = 1e9) =>
  typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
const recordObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const exteriorTerrains = new WeakMap();
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
function prop(id, x, y, w, h, height, type, color, extra = {}) {
  return { id, x, y, w, h, height, type, color, health: 100, ...extra };
}
function southWalls(w, h, start, size, t = 10) {
  return [
    prop('wall-west', 0, 0, t, h, 72, 'wall', '#6f7768'),
    prop('wall-east', w - t, 0, t, h, 72, 'wall', '#6f7768'),
    prop('wall-north', 0, 0, w, t, 72, 'wall', '#6f7768'),
    prop('wall-south-west', 0, h - t, start, t, 72, 'wall', '#6f7768'),
    prop('wall-south-east', start + size, h - t, w - start - size, t, 72, 'wall', '#6f7768'),
  ];
}
function frontDoor(x, y, w, h, { vehicle = false } = {}) {
  return {
    id: 'front-door',
    x,
    y,
    w,
    h,
    height: 68,
    open: false,
    locked: false,
    exit: true,
    edge: 'south',
    vehicleAllowed: vehicle,
  };
}

export const INTERIOR_LAYOUTS = freeze({
  ...TWO_SEATS_ROOMS,
  'impound-annex': IMPOUND_ANNEX_LAYOUT,
  'dockside-rooms': DOCKSIDE_ROOM_LAYOUT,
  'voss-dispatch': {
    id: 'voss-dispatch',
    name: 'Voss Dispatch',
    theme: 'cooperative office and after-hours refuge',
    width: 320,
    height: 240,
    floorZ: 0,
    palette: { floor: '#69634f', wall: '#777a67', light: '#dcc48a' },
    spawn: { x: 168, y: 198, angle: -Math.PI / 2 },
    walls: [
      ...southWalls(320, 240, 136, 64),
      prop('office-partition-north', 214, 10, 10, 100, 68, 'wall', '#73816f'),
      prop('office-partition-south', 214, 164, 10, 66, 68, 'wall', '#73816f'),
    ],
    doors: [
      frontDoor(136, 230, 64, 10),
      {
        id: 'records-door',
        x: 214,
        y: 110,
        w: 10,
        h: 54,
        height: 68,
        open: false,
        locked: false,
        exit: false,
      },
    ],
    props: [
      prop('dispatch-desk', 112, 58, 76, 28, 18, 'desk', '#8d7856'),
      prop('radio-shelf', 22, 28, 26, 70, 46, 'shelf', '#73776c'),
      prop('waiting-bench', 25, 154, 65, 24, 14, 'bench', '#777957'),
      prop('files-cabinet', 268, 24, 30, 78, 55, 'cabinet', '#788c7f'),
      prop('rest-sofa', 238, 180, 60, 26, 15, 'sofa', '#78836c'),
    ],
    hooks: [
      {
        id: 'dispatch-board',
        type: 'job',
        service: 'taxi-dispatch',
        x: 112,
        y: 105,
        radius: 25,
        prompt: 'Ask dispatch about work',
      },
      {
        id: 'refuge-rest',
        type: 'home',
        service: 'rest-save',
        x: 250,
        y: 164,
        radius: 25,
        prompt: 'Rest at the cooperative',
      },
    ],
    actors: [
      {
        id: 'felix-desk-role',
        castId: 'felix-voss',
        role: 'dispatch',
        x: 162,
        y: 40,
        angle: Math.PI / 2,
      },
    ],
    lights: [
      { x: 144, y: 116, z: 48, color: '#dec28a' },
      { x: 260, y: 150, z: 40, color: '#acb899' },
    ],
    floorRegions: [
      { id: 'waiting-room', x: 12, y: 116, w: 194, h: 110, material: 'worn-linoleum' },
      { id: 'records-room', x: 226, y: 12, w: 82, h: 216, material: 'timber' },
    ],
  },
  'saira-garage': {
    id: 'saira-garage',
    name: 'Saira’s Garage',
    theme: 'working service bay and parts counter',
    width: 420,
    height: 300,
    floorZ: 0,
    palette: { floor: '#53615a', wall: '#6e7b6a', light: '#b8cab0' },
    spawn: { x: 96, y: 232, angle: -Math.PI / 2 },
    vehicleSpawn: { x: 96, y: 232, angle: -Math.PI / 2 },
    walls: southWalls(420, 300, 38, 116),
    doors: [frontDoor(38, 290, 116, 10, { vehicle: true })],
    props: [
      prop('lift-post-left', 42, 64, 12, 78, 50, 'lift-post', '#788b72'),
      prop('lift-post-right', 169, 64, 12, 78, 50, 'lift-post', '#788b72'),
      prop('parts-shelves', 282, 18, 118, 36, 54, 'shelf', '#687e72'),
      prop('parts-counter', 285, 176, 101, 28, 19, 'counter', '#85917b'),
      prop('tool-cart', 220, 92, 34, 26, 17, 'tool-cart', '#839788'),
      prop('bench', 240, 242, 125, 22, 20, 'workbench', '#798175'),
    ],
    hooks: [
      {
        id: 'repair-pad',
        type: 'service',
        service: 'vehicle-repair',
        x: 105,
        y: 168,
        radius: 44,
        vehicleAllowed: true,
        prompt: 'Repair this vehicle · $120',
      },
      {
        id: 'parts-counter',
        type: 'shop',
        service: 'garage-parts',
        x: 300,
        y: 220,
        radius: 28,
        prompt: 'Browse workshop parts',
      },
    ],
    actors: [
      {
        id: 'saira-work-role',
        castId: 'saira-bell',
        role: 'mechanic',
        x: 245,
        y: 137,
        angle: Math.PI,
      },
    ],
    lights: [
      { x: 110, y: 125, z: 56, color: '#bdd3bb' },
      { x: 300, y: 180, z: 44, color: '#ccd3a5' },
    ],
    floorRegions: [
      { id: 'service-bay', x: 56, y: 38, w: 106, h: 180, material: 'painted-concrete' },
      { id: 'parts-area', x: 270, y: 80, w: 135, h: 190, material: 'concrete' },
    ],
  },
  'lantern-bar': {
    id: 'lantern-bar',
    name: 'The Lantern',
    theme: 'neighborhood pub, darts corner and quiet booths',
    width: 360,
    height: 260,
    floorZ: 0,
    palette: { floor: '#655c4b', wall: '#7d7159', light: '#d8b576' },
    spawn: { x: 66, y: 212, angle: -Math.PI / 2 },
    walls: [
      ...southWalls(360, 260, 32, 68),
      prop('booth-divider', 132, 132, 12, 100, 28, 'partition', '#726a50'),
      prop('staff-screen-left', 173, 28, 112, 10, 66, 'wall', '#756e56'),
      prop('staff-screen-right', 333, 28, 17, 10, 66, 'wall', '#756e56'),
    ],
    doors: [
      frontDoor(32, 250, 68, 10),
      {
        id: 'staff-door',
        x: 285,
        y: 28,
        w: 48,
        h: 10,
        height: 66,
        open: false,
        locked: true,
        exit: false,
      },
    ],
    props: [
      prop('long-bar', 173, 40, 162, 30, 20, 'bar-counter', '#8f7854'),
      prop('booth-one', 22, 64, 74, 32, 16, 'booth', '#6d7757'),
      prop('booth-two', 22, 124, 74, 32, 16, 'booth', '#6d7757'),
      prop('small-table', 176, 173, 46, 34, 17, 'table', '#88744f'),
      prop('darts-return', 306, 156, 28, 30, 16, 'cabinet', '#777b62'),
    ],
    hooks: [
      {
        id: 'lantern-service',
        type: 'shop',
        service: 'bar-drink',
        x: 217,
        y: 87,
        radius: 28,
        prompt: 'Have a drink · $12',
      },
      {
        id: 'lantern-darts',
        type: 'activity',
        activity: 'darts',
        x: 280,
        y: 130,
        radius: 26,
        prompt: 'Play a match of darts · Free',
      },
    ],
    actors: [
      { id: 'lantern-attendant-role', role: 'bar-attendant', x: 267, y: 87, angle: Math.PI / 2 },
    ],
    lights: [
      { x: 220, y: 110, z: 40, color: '#e2c182' },
      { x: 65, y: 170, z: 38, color: '#cbb787' },
    ],
    floorRegions: [
      { id: 'darts-oche', x: 258, y: 96, w: 10, h: 72, material: 'oche-marking' },
      { id: 'booth-floor', x: 14, y: 52, w: 110, h: 134, material: 'timber' },
    ],
  },
  'blue-hour-lanes': {
    id: 'blue-hour-lanes',
    name: 'Blue Hour Lanes',
    theme: 'four-lane bowling hall with admission desk and spectator court',
    width: 520,
    height: 480,
    floorZ: 0,
    palette: { floor: '#778575', wall: '#7e8c78', light: '#c8d5ad' },
    spawn: { x: 260, y: 434, angle: -Math.PI / 2 },
    walls: southWalls(520, 480, 220, 80),
    doors: [frontDoor(220, 470, 80, 10)],
    props: [
      prop('lane-left-rail', 38, 38, 8, 287, 13, 'lane-divider', '#7c9478'),
      prop('lane-mid-rail', 142, 38, 6, 287, 13, 'lane-divider', '#7c9478'),
      prop('lane-right-rail', 248, 38, 6, 287, 13, 'lane-divider', '#7c9478'),
      prop('outer-lane-rail', 355, 38, 8, 287, 13, 'lane-divider', '#7c9478'),
      prop('spectator-bench', 28, 368, 160, 27, 15, 'bench', '#8a9774'),
      prop('admission-desk', 408, 338, 90, 40, 20, 'counter', '#879b7b'),
      prop('shoe-rack', 406, 220, 86, 75, 45, 'shelf', '#7e9183'),
    ],
    hooks: [
      {
        id: 'lanes-admission',
        type: 'activity',
        activity: 'bowling',
        x: 380,
        y: 390,
        radius: 32,
        prompt: 'Start a ten-frame bowling match · $10',
      },
      {
        id: 'lanes-kitchen',
        type: 'shop',
        service: 'venue-food',
        x: 390,
        y: 120,
        radius: 28,
        prompt: 'Have a meal · $18',
      },
    ],
    actors: [
      { id: 'lanes-attendant-role', role: 'alley-attendant', x: 451, y: 315, angle: Math.PI / 2 },
    ],
    lights: [
      { x: 130, y: 160, z: 60, color: '#d1dfba' },
      { x: 285, y: 160, z: 60, color: '#d1dfba' },
      { x: 360, y: 390, z: 44, color: '#d9cb96' },
    ],
    floorRegions: [
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `lane-${i + 1}`,
        x: 48 + i * 105,
        y: 40,
        w: 94,
        h: 284,
        material: 'lane-timber',
      })),
      { id: 'approach', x: 38, y: 326, w: 398, h: 38, material: 'approach-timber' },
      { id: 'spectator-court', x: 18, y: 350, w: 480, h: 112, material: 'linoleum' },
    ],
  },
});

/** Only these explicitly authored demonstration portals exist. Research addresses are never auto-filled with generic rooms. */
export const PORTAL_DEFINITIONS = freeze([
  ...TWO_SEATS_PORTALS,
  DOCKSIDE_PORTAL,
  IMPOUND_ANNEX_PORTAL,
  {
    id: 'voss-dispatch-entry',
    roomId: 'voss-dispatch',
    locationId: 'felix-office',
    roleReferences: ['LL-CITY-LOC161'],
    entryRadius: 28,
    vehicleAllowed: false,
    wantedMax: 0,
  },
  {
    id: 'saira-garage-entry',
    roomId: 'saira-garage',
    locationId: 'saira-shop',
    roleReferences: ['LL-CITY-LOC044'],
    entryRadius: 36,
    vehicleAllowed: true,
    blockObservedPursuit: true,
  },
  {
    id: 'lantern-bar-entry',
    roomId: 'lantern-bar',
    locationId: 'lantern-darts',
    roleReferences: [],
    entryRadius: 28,
    vehicleAllowed: false,
    wantedMax: 0,
  },
  {
    id: 'blue-hour-lanes-entry',
    roomId: 'blue-hour-lanes',
    locationId: 'blue-hour-lanes',
    roleReferences: [],
    entryRadius: 28,
    vehicleAllowed: false,
    wantedMax: 0,
  },
]);

export function initializeInteriors(state) {
  state.interior ??= { version: VERSION, active: null, rooms: {}, lastExit: null };
  return state.interior;
}
function createRoomActor(room, definition) {
  return {
    ...clone(definition),
    id: `interior:${room.id}:${definition.id}`,
    layoutActorId: definition.id,
    sceneId: room.id,
    kind: 'civilian',
    castId: definition.castId ?? null,
    essential: Boolean(definition.castId),
    z: room.floorZ,
    groundZ: room.floorZ,
    health: 100,
    armour: 0,
    weapon: 'unarmed',
    ammo: { clip: 0, reserve: 0 },
    color: room.palette.wall,
    speed: 0,
    homeX: definition.x,
    minY: 17,
    maxY: room.height - 17,
    panic: 0,
    reporting: false,
    fireCooldown: 0,
    reloadRemaining: 0,
    staggerRemaining: 0,
    bleedingRemaining: 0,
    nextCrimeReport: 0,
    nextHitEffect: 0,
    meleeAction: null,
    hitReaction: null,
    droppedWeapon: false,
  };
}
function roomState(state, roomId) {
  const context = initializeInteriors(state),
    room = INTERIOR_LAYOUTS[roomId];
  if (!room) throw new Error('Unknown authored interior.');
  context.rooms[roomId] ??= {
    doors: Object.fromEntries(
      room.doors.map((door) => [door.id, { open: door.open, locked: door.locked }]),
    ),
    props: Object.fromEntries(room.props.map((item) => [item.id, { health: item.health }])),
    visits: 0,
    hookCalls: {},
    flags: {},
    actors: room.actors.map((definition) => createRoomActor(room, definition)),
  };
  return context.rooms[roomId];
}
/** Actual persistent occupants, separate from every exterior pedestrian/police/hostile array. */
export function interiorActors(state) {
  const active = state.interior?.active;
  return active ? roomState(state, active.roomId).actors : [];
}
function resolvedPortal(world, id) {
  const definition = PORTAL_DEFINITIONS.find((portal) => portal.id === id);
  if (!definition) return null;
  const anchor = world?.locations?.find((location) => location.id === definition.locationId);
  if (!anchor) return null;
  return {
    ...definition,
    x: anchor.x,
    y: anchor.y,
    z: anchor.z || 0,
    name: INTERIOR_LAYOUTS[definition.roomId].name,
  };
}
export function interiorAvailability(addressId) {
  const portal = PORTAL_DEFINITIONS.find(
    (portal) => portal.locationId === addressId || portal.siteId === addressId,
  );
  return portal
    ? { status: 'authored-demo-unintegrated', portalId: portal.id, roomId: portal.roomId }
    : { status: 'unimplemented', portalId: null, roomId: null };
}
export function nearbyInteriorPortals(state, world) {
  if (state.interior?.active || state.player.health <= 0) return [];
  return PORTAL_DEFINITIONS.map((portal) => resolvedPortal(world, portal.id))
    .filter(Boolean)
    .map((portal) => ({ ...portal, distance: distance(state.player, portal) }))
    .filter((portal) => portal.distance <= portal.entryRadius)
    .sort((a, b) => a.distance - b.distance);
}
function blocked(reason) {
  return { ok: false, type: 'blocked', reason };
}
function notify(callbacks, text) {
  callbacks.notify?.(text);
}
function exteriorCollision(world, callbacks) {
  if (callbacks.isExteriorBlocked) return callbacks.isExteriorBlocked;
  const terrain = callbacks.terrain || exteriorTerrains.get(world) || createTerrain(world);
  exteriorTerrains.set(world, terrain);
  return (x, y, radius, z) => terrain.isBlocked(x, y, radius, z);
}
function exteriorSight(world, callbacks, a, b) {
  if (callbacks.hasExteriorLineOfSight) return callbacks.hasExteriorLineOfSight(a, b);
  const terrain = callbacks.terrain || exteriorTerrains.get(world) || createTerrain(world);
  exteriorTerrains.set(world, terrain);
  return terrain.hasLineOfSight(a, b);
}
function resetMotion(player) {
  player.speed = 0;
  player.vz = 0;
  player.cover = null;
  player.traversal = null;
  player.dodgeRemaining = 0;
  player.swimming = false;
  player.scoped = false;
  player.aimTarget = null;
  player.meleeAction = null;
  player.reloadRemaining = 0;
}

export function enterInterior(state, portalId, callbacks = {}) {
  const context = initializeInteriors(state),
    world = callbacks.world;
  if (!world) return blocked('An exterior world is required.');
  if (context.active) return blocked('Already inside an interior.');
  const portal = resolvedPortal(world, portalId);
  if (!portal) return blocked('This address has no authored interior portal.');
  const player = state.player;
  if (
    !player ||
    ![player.x, player.y, player.z || 0, player.angle || 0, player.health].every((value) =>
      finite(value),
    ) ||
    player.health <= 0
  )
    return blocked('The player is incapacitated or has an invalid exterior position.');
  if (distance(player, portal) > portal.entryRadius || Math.abs((player.z || 0) - portal.z) > 8)
    return blocked('Reach the entrance first.');
  if (!exteriorSight(world, callbacks, player, portal))
    return blocked('The exterior doorway is not visible from here.');
  if (player.traversal || (player.z || 0) - (player.groundZ || 0) > 3)
    return blocked('Finish traversing before using the doorway.');
  if (player.vehicleId && !portal.vehicleAllowed) return blocked('Leave the vehicle outside.');
  if (
    (portal.wantedMax !== undefined && (state.wanted?.level || 0) > portal.wantedMax) ||
    (portal.blockObservedPursuit && state.wanted?.observed)
  )
    return blocked('The venue cannot admit an observed pursuit.');
  if (callbacks.canEnter && callbacks.canEnter(portal, state) === false)
    return blocked('The entrance is currently closed.');
  const vehicle = player.vehicleId
    ? state.vehicles?.find((vehicle) => vehicle.id === player.vehicleId)
    : null;
  if (player.vehicleId && (!vehicle || vehicle.health <= 0 || Math.abs(vehicle.speed) > 12))
    return blocked('Bring the vehicle slowly to the service door.');
  const room = INTERIOR_LAYOUTS[portal.roomId],
    spawn = vehicle ? room.vehicleSpawn : room.spawn;
  if (!spawn) return blocked('This room cannot hold that vehicle.');
  const active = {
    roomId: room.id,
    portalId: portal.id,
    worldLocationId: portal.locationId,
    enteredAt: state.time || 0,
    elapsed: 0,
    cooldown: 0.35,
    exterior: {
      x: player.x,
      y: player.y,
      z: player.z || 0,
      groundZ: player.groundZ || 0,
      angle: player.angle || 0,
      scene: clone(state.scene || { kind: 'exterior', id: 'harbor-city' }),
      sceneId: player.sceneId ?? null,
    },
    vehicleId: vehicle?.id || null,
    vehicleExterior: vehicle
      ? {
          x: vehicle.x,
          y: vehicle.y,
          z: vehicle.z || 0,
          groundZ: vehicle.groundZ || 0,
          angle: vehicle.angle || 0,
          speed: 0,
          scene: vehicle.scene ? clone(vehicle.scene) : null,
        }
      : null,
  };
  context.active = active;
  roomState(state, room.id).visits++;
  resetMotion(player);
  Object.assign(player, spawn, { z: room.floorZ, groundZ: room.floorZ, sceneId: room.id });
  state.scene = { kind: 'interior', id: room.id, portalId: portal.id };
  if (vehicle)
    Object.assign(vehicle, spawn, {
      z: room.floorZ,
      groundZ: room.floorZ,
      speed: 0,
      occupied: true,
      scene: { kind: 'interior', id: room.id },
    });
  const transition = {
    ok: true,
    type: 'enter',
    roomId: room.id,
    portalId: portal.id,
    exterior: clone(active.exterior),
  };
  callbacks.onEnter?.(transition, state);
  return transition;
}

function circleRect(x, y, radius, rect) {
  const dx = x - clamp(x, rect.x, rect.x + rect.w),
    dy = y - clamp(y, rect.y, rect.y + rect.h);
  return radius
    ? dx * dx + dy * dy < radius * radius
    : x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}
function volumes(state) {
  const active = state.interior?.active;
  if (!active) return [];
  const room = INTERIOR_LAYOUTS[active.roomId],
    saved = roomState(state, room.id);
  return [
    ...room.walls,
    ...room.props.filter((item) => saved.props[item.id].health > 0),
    ...room.doors.filter((door) => !saved.doors[door.id].open),
  ];
}
export function isInteriorBlocked(state, x, y, radius = 7, z = 0) {
  if (!finite(x) || !finite(y) || !finite(radius, 0, 100) || !finite(z, -100, 300))
    throw new Error('Invalid local collision query.');
  const active = state.interior?.active;
  if (!active) return true;
  const room = INTERIOR_LAYOUTS[active.roomId],
    saved = roomState(state, room.id);
  const within =
    x - radius >= 0 && x + radius <= room.width && y - radius >= 0 && y + radius <= room.height;
  const exitApron = room.doors.some(
    (door) =>
      door.exit &&
      saved.doors[door.id].open &&
      x - radius >= door.x &&
      x + radius <= door.x + door.w &&
      y >= door.y - 20 &&
      y <= room.height + 30,
  );
  if (!within && !exitApron) return true;
  return volumes(state).some(
    (volume) => z >= 0 && z < volume.height && circleRect(x, y, radius, volume),
  );
}
export function interiorCollisionVolumes(state) {
  return volumes(state);
}
export function toggleInteriorCover(state) {
  const player = state.player,
    active = state.interior?.active;
  if (!active || player.vehicleId || player.health <= 0) return false;
  if (player.cover?.roomId === active.roomId) {
    player.cover = null;
    return true;
  }
  let best = null;
  for (const item of volumes(state).filter((item) => !item.exit && item.height >= 12)) {
    const points = [
      {
        x: item.x - 8,
        y: clamp(player.y, item.y, item.y + item.h),
        nx: -1,
        ny: 0,
        min: item.y,
        max: item.y + item.h,
      },
      {
        x: item.x + item.w + 8,
        y: clamp(player.y, item.y, item.y + item.h),
        nx: 1,
        ny: 0,
        min: item.y,
        max: item.y + item.h,
      },
      {
        x: clamp(player.x, item.x, item.x + item.w),
        y: item.y - 8,
        nx: 0,
        ny: -1,
        min: item.x,
        max: item.x + item.w,
      },
      {
        x: clamp(player.x, item.x, item.x + item.w),
        y: item.y + item.h + 8,
        nx: 0,
        ny: 1,
        min: item.x,
        max: item.x + item.w,
      },
    ];
    for (const point of points) {
      const range = distance(player, point);
      if (
        range < 19 &&
        (!best || range < best.distance) &&
        !isInteriorBlocked(state, point.x, point.y, 7)
      )
        best = {
          ...point,
          distance: range,
          volumeId: item.id,
          buildingId: item.id,
          side: point.nx < 0 ? 'west' : point.nx > 0 ? 'east' : point.ny < 0 ? 'north' : 'south',
          roomId: active.roomId,
        };
    }
  }
  if (!best) return false;
  player.cover = best;
  player.x = best.x;
  player.y = best.y;
  player.crouching = true;
  return true;
}
export function hasInteriorLineOfSight(state, a, b) {
  if (!state.interior?.active || ![a?.x, a?.y, b?.x, b?.y].every((value) => finite(value)))
    return false;
  const start = {
      x: a.x,
      y: a.y,
      z: (a.z || 0) + (a.health !== undefined ? (a.eyeHeight ?? 14) : 0),
    },
    end = { x: b.x, y: b.y, z: (b.z || 0) + (b.health !== undefined ? (b.eyeHeight ?? 14) : 0) };
  const ray = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  for (const volume of volumes(state)) {
    let low = 0,
      high = 1;
    for (const [axis, min, max] of [
      ['x', volume.x, volume.x + volume.w],
      ['y', volume.y, volume.y + volume.h],
      ['z', 0, volume.height],
    ]) {
      if (Math.abs(ray[axis]) < 1e-9) {
        if (start[axis] < min || start[axis] > max) {
          low = 2;
          break;
        }
      } else {
        const t0 = (min - start[axis]) / ray[axis],
          t1 = (max - start[axis]) / ray[axis];
        low = Math.max(low, Math.min(t0, t1));
        high = Math.min(high, Math.max(t0, t1));
      }
    }
    if (low <= high && low <= 1 && high >= 0) return false;
  }
  return true;
}
export function setInteriorDoor(state, id, { open, locked } = {}) {
  const active = state.interior?.active;
  if (!active) return false;
  const room = INTERIOR_LAYOUTS[active.roomId],
    door = room.doors.find((door) => door.id === id);
  if (!door) return false;
  const saved = roomState(state, room.id).doors[id];
  if (
    (locked !== undefined && typeof locked !== 'boolean') ||
    (open !== undefined && typeof open !== 'boolean')
  )
    return false;
  const nextOpen = open ?? saved.open,
    nextLocked = locked ?? saved.locked;
  if (nextOpen && nextLocked) return false;
  if (saved.open && !nextOpen) {
    if (circleRect(state.player.x, state.player.y, state.player.vehicleId ? 12 : 7, door))
      return false;
    const vehicle = active.vehicleId
      ? state.vehicles?.find((vehicle) => vehicle.id === active.vehicleId)
      : null;
    if (vehicle && circleRect(vehicle.x, vehicle.y, 12, door)) return false;
  }
  Object.assign(saved, { open: nextOpen, locked: nextLocked });
  return true;
}
export function damageInteriorProp(state, id, damage) {
  if (!state.interior?.active || !finite(damage, 0, 10000)) return false;
  const saved = roomState(state, state.interior.active.roomId),
    item = saved.props[id];
  if (!item) return false;
  item.health = Math.max(0, item.health - damage);
  if (item.health === 0 && state.player.cover?.buildingId === id) state.player.cover = null;
  return true;
}
function doorDistance(point, door) {
  return Math.hypot(
    point.x - clamp(point.x, door.x, door.x + door.w),
    point.y - clamp(point.y, door.y, door.y + door.h),
  );
}
export function nearestInteriorInteractable(state) {
  const active = state.interior?.active;
  if (!active || state.player.health <= 0) return null;
  const room = INTERIOR_LAYOUTS[active.roomId],
    saved = roomState(state, room.id),
    vehicle = Boolean(state.player.vehicleId),
    candidates = [];
  for (const door of room.doors) {
    const range = doorDistance(state.player, door);
    if (range < 23 && (!vehicle || door.vehicleAllowed))
      candidates.push({
        ...door,
        type: 'door',
        distance: range,
        locked: saved.doors[door.id].locked,
        open: saved.doors[door.id].open,
        prompt: saved.doors[door.id].open ? 'Close doorway' : 'Open doorway',
      });
  }
  for (const hook of room.hooks)
    if (
      (!vehicle || hook.vehicleAllowed) &&
      distance(hook, state.player) < hook.radius &&
      hasInteriorLineOfSight(state, state.player, { ...hook, z: 12 })
    )
      candidates.push({ ...hook, distance: distance(hook, state.player) });
  return candidates.sort((a, b) => a.distance - b.distance)[0] || null;
}
export function interactInterior(state, callbacks = {}) {
  const item = nearestInteriorInteractable(state);
  if (!item) return blocked('There is nothing usable within reach.');
  if (item.type === 'door') {
    if (item.locked) {
      notify(callbacks, 'That doorway is locked.');
      return blocked('Door locked.');
    }
    const changed = setInteriorDoor(state, item.id, { open: !item.open });
    return { ok: changed, type: 'door', doorId: item.id, open: changed ? !item.open : item.open };
  }
  const active = state.interior.active,
    callback = callbacks.onHook;
  if (!callback) return blocked('This service has not been integrated.');
  if (callback.constructor?.name === 'AsyncFunction')
    return blocked('Interior hook dispatch must be synchronous.');
  const action = {
    type: item.type,
    hookId: item.id,
    service: item.service || null,
    activity: item.activity || null,
    roomId: active.roomId,
    portalId: active.portalId,
    worldLocationId: active.worldLocationId,
    exterior: clone(active.exterior),
  };
  const result = callback(action, state);
  if (result && typeof result.then === 'function')
    return blocked('Interior hook dispatch must be synchronous.');
  if (item.requiresExplicitResult && result !== true && result?.ok !== true)
    return {
      ok: false,
      type: 'hook',
      action,
      result: result ?? null,
      reason: 'This service has not returned a successful transaction.',
    };
  if (result === false || result?.ok === false)
    return { ok: false, type: 'hook', action, result: result ?? null };
  const saved = roomState(state, active.roomId);
  saved.hookCalls[item.id] = (saved.hookCalls[item.id] || 0) + 1;
  return { ok: true, type: 'hook', action, result: result ?? null };
}

/** Bridge existing synchronous world services without leaving local coordinates behind. */
export function withExteriorContext(state, fn, { includeEnteredVehicle = false } = {}) {
  if (typeof fn !== 'function' || fn.constructor?.name === 'AsyncFunction')
    throw new Error('Interior transaction callbacks must be synchronous.');
  const active = state.interior?.active;
  if (!active) return fn(state);
  const player = state.player,
    local = {
      x: player.x,
      y: player.y,
      z: player.z,
      groundZ: player.groundZ,
      angle: player.angle,
      vehicleId: player.vehicleId,
      sceneId: player.sceneId,
    },
    scene = state.scene;
  const vehicle = active.vehicleId
      ? state.vehicles?.find((vehicle) => vehicle.id === active.vehicleId)
      : null,
    vehicleLocal = vehicle
      ? {
          x: vehicle.x,
          y: vehicle.y,
          z: vehicle.z,
          groundZ: vehicle.groundZ,
          angle: vehicle.angle,
          speed: vehicle.speed,
          scene: vehicle.scene,
        }
      : null;
  Object.assign(player, {
    x: active.exterior.x,
    y: active.exterior.y,
    z: active.exterior.z,
    groundZ: active.exterior.groundZ,
    angle: active.exterior.angle,
    sceneId: active.exterior.sceneId,
  });
  state.scene = clone(active.exterior.scene);
  if (includeEnteredVehicle && vehicle?.health > 0) player.vehicleId = vehicle.id;
  if (vehicle) Object.assign(vehicle, active.vehicleExterior);
  try {
    const result = fn(state);
    if (result && typeof result.then === 'function')
      throw new Error('Interior transaction callbacks must be synchronous.');
    return result;
  } finally {
    Object.assign(player, local);
    state.scene = scene;
    if (vehicle) Object.assign(vehicle, vehicleLocal);
  }
}
function safeReturn(world, anchor, radius, callbacks) {
  const blocked = exteriorCollision(world, callbacks),
    points = [anchor];
  for (const length of [16, 32, 48, 64, 96])
    for (let i = 0; i < 8; i++)
      points.push({
        x: anchor.x + Math.cos((i * Math.PI) / 4) * length,
        y: anchor.y + Math.sin((i * Math.PI) / 4) * length,
        z: anchor.z || 0,
      });
  for (const point of points) if (!blocked(point.x, point.y, radius, point.z || 0)) return point;
  return null;
}
export function exitInterior(state, callbacks = {}, options = {}) {
  const context = initializeInteriors(state),
    active = context.active;
  if (!active) return blocked('Not inside an interior.');
  const world = callbacks.world;
  if (!world) return blocked('An exterior world is required.');
  const room = INTERIOR_LAYOUTS[active.roomId],
    saved = roomState(state, room.id),
    player = state.player;
  if (
    !options.emergency &&
    !room.doors.some(
      (door) => door.exit && saved.doors[door.id].open && doorDistance(player, door) <= 24,
    )
  )
    return blocked('Reach an open exterior doorway first.');
  const vehicle = active.vehicleId
    ? state.vehicles?.find((vehicle) => vehicle.id === active.vehicleId)
    : null;
  const driving = !options.emergency && vehicle?.health > 0 && player.vehicleId === vehicle.id;
  let destination = safeReturn(
    world,
    options.destination || active.exterior,
    driving ? 12 : 7,
    callbacks,
  );
  if (!destination && options.emergency)
    destination = safeReturn(
      world,
      world.spawn || { x: world.width / 2, y: world.height / 2, z: 0 },
      7,
      callbacks,
    );
  if (!destination) {
    notify(callbacks, 'The exterior doorway is obstructed.');
    return blocked('No safe exterior return position.');
  }
  if (vehicle) {
    Object.assign(vehicle, active.vehicleExterior, {
      speed: 0,
      occupied: driving,
      scene: active.vehicleExterior.scene,
    });
    if (driving) {
      vehicle.x = destination.x;
      vehicle.y = destination.y;
      vehicle.z = destination.z || 0;
    }
  }
  resetMotion(player);
  Object.assign(player, {
    x: destination.x,
    y: destination.y,
    z: destination.z || 0,
    groundZ: destination.z || 0,
    angle: active.exterior.angle,
    sceneId: active.exterior.sceneId,
    vehicleId: driving ? vehicle.id : null,
  });
  state.scene = clone(active.exterior.scene);
  context.lastExit = {
    roomId: active.roomId,
    portalId: active.portalId,
    reason: options.reason || 'doorway',
    time: state.time || 0,
    destination: clone(destination),
  };
  context.active = null;
  const transition = { ok: true, type: 'exit', ...clone(context.lastExit) };
  callbacks.onExit?.(transition, state);
  return transition;
}
export function emergencyExteriorReturn(state, callbacks = {}, reason = 'emergency') {
  return exitInterior(state, callbacks, {
    emergency: true,
    reason,
    destination: callbacks.emergencyDestination,
  });
}

function moveLocal(state, dx, dy, radius) {
  const player = state.player,
    steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (radius * 0.6)));
  for (let i = 0; i < steps; i++) {
    const x = player.x + dx / steps,
      y = player.y + dy / steps;
    if (!isInteriorBlocked(state, x, y, radius, player.z || 0)) {
      player.x = x;
      player.y = y;
    } else {
      if (!isInteriorBlocked(state, x, player.y, radius, player.z || 0)) player.x = x;
      if (!isInteriorBlocked(state, player.x, y, radius, player.z || 0)) player.y = y;
    }
  }
}

function checkInteriorReturn(state, callbacks) {
  const active = state.interior?.active;
  if (!active) return;
  if (state.player.health <= 0) {
    if (callbacks.returnOnIncapacitation)
      emergencyExteriorReturn(state, callbacks, 'incapacitated');
    return;
  }
  const room = INTERIOR_LAYOUTS[active.roomId],
    saved = roomState(state, room.id),
    player = state.player;
  if (
    active.cooldown === 0 &&
    room.doors.some(
      (door) =>
        door.exit &&
        saved.doors[door.id].open &&
        player.y > room.height &&
        player.x >= door.x &&
        player.x <= door.x + door.w,
    )
  )
    exitInterior(state, callbacks);
}

/** Shared-core integration: advance portal time and transitions without actor physics or stance changes. */
export function tickInterior(state, dt, callbacks = {}) {
  const active = state.interior?.active;
  if (!active || !finite(dt, 0, 10) || dt === 0) return state;
  const elapsed = Math.min(dt, 0.5);
  active.cooldown = Math.max(0, active.cooldown - elapsed);
  active.elapsed = (active.elapsed || 0) + elapsed;
  checkInteriorReturn(state, callbacks);
  return state;
}

export function updateInterior(state, dt, input = {}, callbacks = {}) {
  const active = state.interior?.active;
  if (!active || !finite(dt, 0, 10) || dt === 0) return state;
  tickInterior(state, dt, callbacks);
  if (!state.interior?.active || state.player.health <= 0) return state;
  const room = INTERIOR_LAYOUTS[active.roomId],
    player = state.player;
  if (input.confirm && !active.confirmHeld) interactInterior(state, callbacks);
  if (state.interior?.active !== active) return state;
  active.confirmHeld = !!input.confirm;
  if (input.cover && !active.coverHeld) toggleInteriorCover(state);
  active.coverHeld = !!input.cover;
  let vehicle = player.vehicleId
    ? state.vehicles?.find((vehicle) => vehicle.id === player.vehicleId)
    : null;
  if (vehicle && vehicle.health <= 0) {
    vehicle.occupied = false;
    player.vehicleId = null;
    vehicle = null;
    notify(callbacks, 'The service vehicle is disabled. Leave on foot.');
  }
  const elapsed = Math.min(dt, 0.5),
    steps = Math.ceil(elapsed / (1 / 60)),
    step = elapsed / steps;
  for (let i = 0; i < steps; i++) {
    if (vehicle) {
      const throttle = (input.up || input.forward ? 1 : 0) - (input.down || input.backward ? 1 : 0),
        steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      vehicle.speed = clamp((vehicle.speed || 0) + throttle * 45 * step, -32, 55);
      if (!throttle) vehicle.speed *= Math.max(0, 1 - step * 2.4);
      if (input.brake) vehicle.speed *= Math.max(0, 1 - step * 8);
      vehicle.angle +=
        steer *
        1.8 *
        Math.min(1, Math.abs(vehicle.speed) / 20) *
        Math.sign(vehicle.speed || 1) *
        step;
      player.angle = vehicle.angle;
      moveLocal(
        state,
        Math.cos(vehicle.angle) * vehicle.speed * step,
        Math.sin(vehicle.angle) * vehicle.speed * step,
        12,
      );
      vehicle.x = player.x;
      vehicle.y = player.y;
      vehicle.z = room.floorZ;
    } else {
      let dx = finite(input.moveX, -1, 1)
          ? input.moveX
          : (input.right ? 1 : 0) - (input.left ? 1 : 0),
        dy = finite(input.moveY, -1, 1)
          ? input.moveY
          : (input.down || input.backward ? 1 : 0) - (input.up || input.forward ? 1 : 0);
      const length = Math.hypot(dx, dy);
      if (length > 1) {
        dx /= length;
        dy /= length;
      }
      const cover = player.cover?.roomId === active.roomId ? player.cover : null;
      if (cover) {
        if (
          !volumes(state).some((volume) => volume.id === cover.volumeId) ||
          dx * cover.nx + dy * cover.ny > 0.45
        ) {
          player.cover = null;
        } else if (cover.nx) dx = 0;
        else dy = 0;
      }
      const speed = input.crouch || player.cover ? 26 : input.sprint ? 78 : 49;
      if (dx || dy) {
        player.angle = Math.atan2(dy, dx);
        moveLocal(state, dx * speed * step, dy * speed * step, 7);
      }
      if (player.cover?.roomId === active.roomId) {
        const along = player.cover.nx ? player.y : player.x;
        if (along < player.cover.min || along > player.cover.max) player.cover = null;
      }
      player.speed = dx || dy ? speed : 0;
      player.crouching = !!input.crouch || Boolean(player.cover);
    }
    player.z = room.floorZ;
    player.groundZ = room.floorZ;
    checkInteriorReturn(state, callbacks);
    if (!state.interior?.active) break;
  }
  return state;
}

export function interiorScene(state) {
  const active = state.interior?.active;
  return active
    ? {
        kind: 'interior',
        room: INTERIOR_LAYOUTS[active.roomId],
        state: roomState(state, active.roomId),
        exterior: active.exterior,
      }
    : null;
}
function validateRoomActors(room, saved) {
  if (
    !Array.isArray(saved.actors) ||
    saved.actors.length !== room.actors.length ||
    new Set(saved.actors.map((actor) => actor?.id)).size !== room.actors.length
  )
    throw new Error('The saved room actors are invalid.');
  for (const actor of saved.actors) {
    const definition = room.actors.find((definition) => definition.id === actor?.layoutActorId);
    if (
      !definition ||
      actor.id !== `interior:${room.id}:${definition.id}` ||
      actor.sceneId !== room.id ||
      actor.role !== definition.role ||
      actor.castId !== (definition.castId ?? null) ||
      actor.essential !== Boolean(definition.castId) ||
      actor.kind !== 'civilian' ||
      !finite(actor.x, 0, room.width) ||
      !finite(actor.y, 0, room.height + 30) ||
      !finite(actor.z, room.floorZ, room.floorZ + 80) ||
      !finite(actor.groundZ, room.floorZ, room.floorZ + 72) ||
      !finite(actor.angle, -100, 100) ||
      !finite(actor.health, 0, 100) ||
      !finite(actor.armour, 0, 100) ||
      !finite(actor.speed, 0, 100) ||
      !finite(actor.homeX, 0, room.width) ||
      !finite(actor.minY, 0, room.height) ||
      !finite(actor.maxY, actor.minY, room.height) ||
      !finite(actor.panic, 0, 100) ||
      !WEAPONS[actor.weapon] ||
      !recordObject(actor.ammo) ||
      !Number.isInteger(actor.ammo.clip) ||
      !finite(actor.ammo.clip, 0, WEAPONS[actor.weapon].clipSize) ||
      !Number.isInteger(actor.ammo.reserve) ||
      !finite(actor.ammo.reserve, 0, 100000) ||
      typeof actor.reporting !== 'boolean' ||
      typeof actor.droppedWeapon !== 'boolean' ||
      typeof actor.color !== 'string' ||
      !/^#[0-9a-f]{6}$/i.test(actor.color) ||
      ['fireCooldown', 'reloadRemaining', 'staggerRemaining', 'bleedingRemaining'].some(
        (key) => !finite(actor[key], 0, 1000),
      ) ||
      ['nextCrimeReport', 'nextHitEffect'].some((key) => !finite(actor[key], 0, 1e12))
    )
      throw new Error('The saved room actor state is invalid.');
    const action = actor.meleeAction;
    if (
      action &&
      (!WEAPONS[action.weapon] ||
        WEAPONS[action.weapon].mode !== 'melee' ||
        !finite(action.elapsed, 0, 5) ||
        !finite(action.duration, 0.01, 5) ||
        !finite(action.windup, 0, 3) ||
        !finite(action.damage, 0, 150) ||
        !finite(action.reach, 0, 50))
    )
      throw new Error('The saved room actor melee state is invalid.');
    if (
      actor.hitReaction &&
      (!recordObject(actor.hitReaction) ||
        typeof actor.hitReaction.kind !== 'string' ||
        !finite(actor.hitReaction.until, 0, 1e12))
    )
      throw new Error('The saved room actor reaction is invalid.');
  }
}
export function validateInteriorState(state, { world } = {}) {
  const context = state.interior;
  if (!context) return true;
  if (
    context.version !== VERSION ||
    !recordObject(context.rooms) ||
    !(context.active === null || recordObject(context.active))
  )
    throw new Error('Unsupported interior save identity.');
  for (const [id, saved] of Object.entries(context.rooms)) {
    const room = INTERIOR_LAYOUTS[id];
    if (
      !room ||
      !recordObject(saved) ||
      !recordObject(saved.doors) ||
      !recordObject(saved.props) ||
      !recordObject(saved.hookCalls) ||
      !recordObject(saved.flags) ||
      !Number.isInteger(saved.visits) ||
      saved.visits < 0
    )
      throw new Error('The saved room state is invalid.');
    if (
      Object.keys(saved.doors).some((id) => !room.doors.some((door) => door.id === id)) ||
      room.doors.some(
        (door) =>
          typeof saved.doors[door.id]?.open !== 'boolean' ||
          typeof saved.doors[door.id]?.locked !== 'boolean' ||
          (saved.doors[door.id].open && saved.doors[door.id].locked),
      )
    )
      throw new Error('The saved doorway state is invalid.');
    if (
      Object.keys(saved.props).some((id) => !room.props.some((prop) => prop.id === id)) ||
      room.props.some((prop) => !finite(saved.props[prop.id]?.health, 0, prop.health))
    )
      throw new Error('The saved room props are invalid.');
    if (
      Object.entries(saved.hookCalls).some(
        ([id, count]) =>
          !room.hooks.some((hook) => hook.id === id) || !Number.isInteger(count) || count < 0,
      ) ||
      Object.values(saved.flags).some(
        (value) =>
          !['boolean', 'string', 'number'].includes(typeof value) ||
          (typeof value === 'number' && !finite(value)),
      )
    )
      throw new Error('The saved room flags are invalid.');
    validateRoomActors(room, saved);
  }
  if (
    context.lastExit !== null &&
    (!recordObject(context.lastExit) ||
      !INTERIOR_LAYOUTS[context.lastExit.roomId] ||
      !PORTAL_DEFINITIONS.some(
        (portal) =>
          portal.id === context.lastExit.portalId && portal.roomId === context.lastExit.roomId,
      ) ||
      typeof context.lastExit.reason !== 'string' ||
      !finite(context.lastExit.time, 0, 1e12) ||
      !finite(context.lastExit.destination?.x, 0, world?.width || 1e6) ||
      !finite(context.lastExit.destination?.y, 0, world?.height || 1e6) ||
      !finite(context.lastExit.destination?.z ?? 0, -1000, 1000))
  )
    throw new Error('The saved exterior return record is invalid.');
  const active = context.active;
  if (!active) {
    if (state.scene?.kind === 'interior')
      throw new Error('The saved exterior identity is invalid.');
    if (
      !finite(state.player?.x, 0, world?.width || 1e6) ||
      !finite(state.player?.y, 0, world?.height || 1e6)
    )
      throw new Error('The saved exterior coordinates are invalid.');
    return true;
  }
  const room = INTERIOR_LAYOUTS[active.roomId],
    portal = PORTAL_DEFINITIONS.find((portal) => portal.id === active.portalId);
  if (
    !room ||
    !portal ||
    portal.roomId !== room.id ||
    !context.rooms[room.id] ||
    !active.exterior ||
    !finite(active.exterior.x, 0, world?.width || 1e6) ||
    !finite(active.exterior.y, 0, world?.height || 1e6) ||
    !finite(active.exterior.z, -1000, 1000) ||
    !finite(active.exterior.groundZ, -1000, 1000) ||
    !finite(active.exterior.angle, -100, 100) ||
    !finite(active.cooldown, 0, 1) ||
    ['confirmHeld', 'coverHeld'].some(
      (key) => active[key] !== undefined && typeof active[key] !== 'boolean',
    ) ||
    !finite(active.enteredAt, 0, 1e12) ||
    !finite(active.elapsed, 0, 1e12)
  )
    throw new Error('The saved portal context is invalid.');
  if (
    !active.exterior.scene ||
    typeof active.exterior.scene.kind !== 'string' ||
    active.exterior.scene.kind === 'interior' ||
    typeof active.exterior.scene.id !== 'string' ||
    !(active.exterior.sceneId === null || typeof active.exterior.sceneId === 'string') ||
    active.worldLocationId !== portal.locationId
  )
    throw new Error('The saved exterior identity is invalid.');
  if (
    !finite(state.player.x, -20, room.width + 20) ||
    !finite(state.player.y, -20, room.height + 30) ||
    !finite(state.player.z, 0, room.floorZ + 80) ||
    !finite(state.player.groundZ, 0, room.floorZ + 72) ||
    state.scene?.kind !== 'interior' ||
    state.scene.id !== room.id ||
    state.scene.portalId !== portal.id ||
    state.player.sceneId !== room.id
  )
    throw new Error('The saved local player context is invalid.');
  if (state.player.vehicleId && state.player.vehicleId !== active.vehicleId)
    throw new Error('The saved local vehicle ownership is invalid.');
  if (
    active.vehicleId &&
    (!portal.vehicleAllowed ||
      !state.vehicles?.some((vehicle) => vehicle.id === active.vehicleId) ||
      !active.vehicleExterior ||
      !finite(active.vehicleExterior.x, 0, world?.width || 1e6) ||
      !finite(active.vehicleExterior.y, 0, world?.height || 1e6) ||
      !finite(active.vehicleExterior.z, -1000, 1000) ||
      !finite(active.vehicleExterior.groundZ, -1000, 1000) ||
      !finite(active.vehicleExterior.angle, -100, 100) ||
      !finite(active.vehicleExterior.speed, -300, 300) ||
      !(active.vehicleExterior.scene === null || recordObject(active.vehicleExterior.scene)))
  )
    throw new Error('The saved interior vehicle is invalid.');
  if (active.vehicleId) {
    const vehicle = state.vehicles.find((vehicle) => vehicle.id === active.vehicleId);
    if (
      !finite(vehicle.x, 0, room.width) ||
      !finite(vehicle.y, 0, room.height + 30) ||
      !finite(vehicle.z, room.floorZ, room.floorZ + 80) ||
      !finite(vehicle.groundZ, room.floorZ, room.floorZ + 72) ||
      !finite(vehicle.angle, -100, 100) ||
      !finite(vehicle.speed, -300, 300) ||
      vehicle.scene?.kind !== 'interior' ||
      vehicle.scene.id !== room.id
    )
      throw new Error('The saved local vehicle context is invalid.');
  }
  if (state.player.cover) {
    const cover = state.player.cover,
      volume = volumes(state).find((volume) => volume.id === cover.buildingId);
    if (
      !volume ||
      !['west', 'east', 'north', 'south'].includes(cover.side) ||
      ![-1, 0, 1].includes(cover.nx) ||
      ![-1, 0, 1].includes(cover.ny) ||
      Math.abs(cover.nx) + Math.abs(cover.ny) !== 1 ||
      !finite(cover.x, 0, room.width) ||
      !finite(cover.y, 0, room.height) ||
      !finite(cover.min, 0, Math.max(room.width, room.height)) ||
      !finite(cover.max, cover.min, Math.max(room.width, room.height)) ||
      (cover.roomId !== undefined && cover.roomId !== room.id)
    )
      throw new Error('The saved interior cover position is invalid.');
  }
  return true;
}
export function saveInteriorState(state) {
  validateInteriorState(state);
  return JSON.stringify({
    format: 'lowlight-interior',
    version: VERSION,
    interior: clone(
      state.interior || { version: VERSION, active: null, rooms: {}, lastExit: null },
    ),
    player: {
      x: state.player.x,
      y: state.player.y,
      z: state.player.z || 0,
      groundZ: state.player.groundZ || 0,
      angle: state.player.angle || 0,
      vehicleId: state.player.vehicleId || null,
      sceneId: state.player.sceneId ?? null,
      cover: state.player.cover ? clone(state.player.cover) : null,
      crouching: Boolean(state.player.crouching),
    },
    scene: clone(state.scene || { kind: 'exterior', id: 'harbor-city' }),
    vehicles: (state.vehicles || [])
      .filter((vehicle) => vehicle.id === state.interior?.active?.vehicleId)
      .map((vehicle) => ({
        id: vehicle.id,
        x: vehicle.x,
        y: vehicle.y,
        z: vehicle.z || 0,
        groundZ: vehicle.groundZ || 0,
        angle: vehicle.angle,
        speed: vehicle.speed,
        occupied: vehicle.occupied,
        scene: vehicle.scene,
      })),
  });
}
export function restoreInteriorState(state, serialized, callbacks = {}) {
  let record;
  try {
    record = typeof serialized === 'string' ? JSON.parse(serialized) : clone(serialized);
  } catch {
    throw new Error('The interior save is not valid JSON.');
  }
  if (
    !record ||
    record.format !== 'lowlight-interior' ||
    record.version !== VERSION ||
    !recordObject(record.interior) ||
    !record.player ||
    !Array.isArray(record.vehicles)
  )
    throw new Error('Unsupported interior save format.');
  const playerFields = [
      'x',
      'y',
      'z',
      'groundZ',
      'angle',
      'vehicleId',
      'sceneId',
      'cover',
      'crouching',
    ],
    vehicleFields = ['id', 'x', 'y', 'z', 'groundZ', 'angle', 'speed', 'occupied', 'scene'];
  if (
    Object.keys(record.player).some((key) => !playerFields.includes(key)) ||
    record.vehicles.some((vehicle) =>
      Object.keys(vehicle).some((key) => !vehicleFields.includes(key)),
    )
  )
    throw new Error('The interior snapshot cannot replace external gameplay fields.');
  if (
    ![
      record.player.x,
      record.player.y,
      record.player.z,
      record.player.groundZ,
      record.player.angle,
    ].every((value) => finite(value)) ||
    !record.scene ||
    typeof record.scene.id !== 'string' ||
    typeof record.scene.kind !== 'string'
  )
    throw new Error('The saved interior coordinates are invalid.');
  if (
    typeof record.player.crouching !== 'boolean' ||
    !(record.player.cover === null || recordObject(record.player.cover))
  )
    throw new Error('The saved interior stance is invalid.');
  if (
    record.vehicles.length > 1 ||
    record.vehicles.some(
      (saved) =>
        saved.id !== record.interior?.active?.vehicleId ||
        !state.vehicles?.some((vehicle) => vehicle.id === saved.id) ||
        ![saved.x, saved.y, saved.z, saved.groundZ, saved.angle, saved.speed].every((value) =>
          finite(value),
        ) ||
        typeof saved.occupied !== 'boolean',
    )
  )
    throw new Error('The saved interior vehicle snapshot is invalid.');
  const candidate = {
    ...state,
    interior: record.interior,
    player: { ...state.player, ...record.player },
    scene: record.scene,
    vehicles: (state.vehicles || []).map((vehicle) => ({
      ...vehicle,
      ...record.vehicles.find((saved) => saved.id === vehicle.id),
    })),
  };
  validateInteriorState(candidate, callbacks);
  state.interior = clone(candidate.interior);
  Object.assign(state.player, record.player);
  state.scene = clone(record.scene);
  for (const saved of record.vehicles) {
    const vehicle = state.vehicles?.find((vehicle) => vehicle.id === saved.id);
    if (vehicle) Object.assign(vehicle, saved);
  }
  return state;
}
