/** Late Meter's original impound annex, physical routes and native scene art. */
import { FIRST_ARC_SCENES } from './first-arc.js';
import { createTerrain } from '../terrain.js';
import { createSpatialIndex } from '../spatial-index.js';

const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const point = (x, y, z = 0, extra = {}) => ({ x, y, z, ...extra });
const volume = (id, x, y, w, h, height, color, type, extra = {}) => ({
  id,
  x,
  y,
  w,
  h,
  height,
  color,
  type,
  health: 100,
  ...extra,
});
const sceneId = (actor) =>
  actor && Object.hasOwn(actor, 'sceneId')
    ? (actor.sceneId ?? null)
    : actor?.scene?.kind === 'interior'
      ? actor.scene.id
      : null;
const actorId = (actor) =>
  actor?.canonicalId ??
  ((typeof actor?.id === 'string' && actor.id.startsWith('LL-')) ||
  actor?.id === 'holt-collector-watch'
    ? actor.id
    : (actor?.castId ?? actor?.id));
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const living = (actor) => finite(actor?.health) && actor.health > 0;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const within = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export const LATE_METER_APPEARANCES = freeze({
  reeve: {
    id: 'reeve-grey-tow-jacket',
    version: 1,
    build: 'heroic',
    size: 0.78,
    outfit: 'coat',
    sleeves: 'long',
    hat: null,
    colors: {
      skin: '#ab8267',
      cloth: '#7e8582',
      coat: '#7e8582',
      pants: '#343d3c',
      boot: '#252d29',
      hair: '#43362e',
      trim: '#c2c5ac',
    },
    marks: [
      { id: 'grey-tow-jacket', kind: 'clothing', color: '#7e8582' },
      { id: 'holt-tow-badge', kind: 'chest-badge', color: '#cab779', icon: 'tow-hook' },
    ],
  },
  yara: {
    id: 'yara-impound-clerk',
    version: 1,
    build: 'heroic',
    size: 0.78,
    outfit: 'shirt',
    sleeves: 'long',
    hat: null,
    colors: {
      skin: '#b68a6d',
      cloth: '#526f69',
      coat: '#526f69',
      pants: '#37423d',
      boot: '#29332f',
      hair: '#3c302c',
      trim: '#b8b58e',
    },
    marks: [
      { id: 'impound-clerk-apron', kind: 'apron', color: '#8d947d' },
      { id: 'yara-name-card', kind: 'name-card', text: 'YARA' },
    ],
  },
  watcher: {
    id: 'holt-collector-watch-jacket',
    version: 1,
    build: 'heroic',
    size: 0.78,
    outfit: 'coat',
    sleeves: 'long',
    hat: 'cap',
    colors: {
      skin: '#896b55',
      cloth: '#4d6068',
      coat: '#4d6068',
      pants: '#323a3b',
      boot: '#252c29',
      hair: '#34312b',
      trim: '#949c8b',
    },
    marks: [{ id: 'collector-watch-patch', kind: 'sleeve-patch', color: '#9eab99' }],
  },
});

export const IMPOUND_ANNEX_LAYOUT = freeze({
  id: 'impound-annex',
  name: 'Old Quay Impound Annex',
  theme: 'a municipal release office with a real public counter and a glazed intercom window',
  width: 180,
  height: 220,
  floorZ: 0,
  palette: { floor: '#797769', wall: '#808a7b', light: '#d9cba0' },
  spawn: { x: 90, y: 190, angle: -Math.PI / 2 },
  walls: [
    volume('annex-west', 0, 0, 10, 220, 72, '#7a8577', 'wall'),
    volume('annex-east', 170, 0, 10, 220, 72, '#7a8577', 'wall'),
    volume('annex-north', 0, 0, 180, 10, 72, '#7a8577', 'wall'),
    volume('annex-south-west', 0, 210, 64, 10, 72, '#7a8577', 'wall'),
    volume('annex-south-east', 116, 210, 64, 10, 72, '#7a8577', 'wall'),
  ],
  doors: [
    {
      id: 'front-door',
      x: 64,
      y: 210,
      w: 52,
      h: 10,
      height: 68,
      open: true,
      locked: false,
      exit: true,
      edge: 'south',
      vehicleAllowed: false,
    },
  ],
  props: [
    volume('release-counter', 14, 164, 52, 18, 17, '#8c876d', 'counter'),
    volume('duplicate-printer', 134, 38, 25, 25, 22, '#879287', 'printer'),
    volume('release-file-rack', 136, 76, 28, 62, 48, '#6b7e76', 'files'),
    volume('waiting-bench', 18, 94, 46, 18, 14, '#8c8b6f', 'bench'),
    volume('public-form-table', 122, 160, 34, 22, 17, '#8b8267', 'table'),
  ],
  hooks: [
    {
      id: 'impound-release-counter',
      type: 'campaign-counter',
      service: 'impound-release',
      x: 36,
      y: 145,
      radius: 20,
      prompt: 'Speak at the impound release counter',
      requiresExplicitResult: true,
    },
    {
      id: 'impound-invoice-forms',
      type: 'evidence',
      service: 'inspect-impound-invoices',
      evidenceId: 'duplicate-impound-invoices',
      x: 58,
      y: 145,
      radius: 16,
      prompt: 'Inspect the release invoices',
      requiresExplicitResult: true,
    },
  ],
  // Canonical named bodies own Yara/Felix. Registration must not create room proxies.
  actors: [],
  lights: [
    { x: 42, y: 164, z: 48, color: '#d9cba0' },
    { x: 138, y: 84, z: 48, color: '#b8c6ae' },
  ],
  floorRegions: [
    { id: 'public-queue', x: 12, y: 116, w: 102, h: 90, material: 'worn-linoleum' },
    { id: 'records-office', x: 116, y: 14, w: 50, h: 190, material: 'painted-concrete' },
  ],
});

export const IMPOUND_ANNEX_PORTAL = freeze({
  id: 'impound-annex-entry',
  roomId: 'impound-annex',
  locationId: 'impound-annex',
  siteId: 'LL-CITY-LOC059',
  roleReferences: ['LL-CITY-LOC059'],
  entryRadius: 22,
  vehicleAllowed: false,
  wantedMax: 0,
});

export const LATE_METER_CLIPBOARD = freeze({
  id: 'reeve-repossession-clipboard',
  kind: 'repossession-clipboard',
  version: 1,
  state: 'carried',
  ownerActorId: 'LL-ARC-REEVE',
  sceneId: null,
  visible: true,
  attachment: { kind: 'hand', hand: 'right', forward: 3.5, right: 4, z: 11 },
  width: 6.2,
  height: 8.6,
  thickness: 0.8,
  boardColor: '#78674b',
  paperColor: '#d8d1aa',
  evidenceTags: ['co-op-repossession-clipboard'],
  title: 'CO-OP RELEASE',
});
const INTERIOR_TO_COUNTER = freeze([point(90, 190), point(90, 144), point(36, 144)]);
const INTERIOR_EXIT = freeze([point(36, 144), point(90, 144), point(90, 190), point(90, 224)]);
const TAXI = freeze({ length: 29, width: 15, height: 16 });
const SEDAN = TAXI;
const TAXI_POSE = freeze(point(231, 393, 0, { angle: -Math.PI / 2 }));
const PASSENGER_DOOR = freeze(point(247.5, 389.52));
const ENTRY = freeze(point(293, 389));
const CLIPBOARD_REVIEW = freeze(
  point(347, 397, 0, { action: 'read-clipboard', dwellSeconds: 15, angle: Math.PI / 3 }),
);
const EAST = freeze([point(430, 397), CLIPBOARD_REVIEW, point(293, 397), ENTRY]);
const NORTH = freeze([point(231, 228), point(231, 366), point(209, 366), point(209, 424)]);
const FELIX = freeze([ENTRY, point(247.5, 389), PASSENGER_DOOR]);
const PURSUER = freeze(point(400, 463, 0, { id: 'holt-tow-sedan', spec: 'sedan', angle: Math.PI }));
const DRIVER_DOOR = freeze(point(396.52, 479.5));
const DRIVER = freeze([
  ENTRY,
  point(293, 389),
  point(263, 389),
  point(263, 488),
  point(396.52, 488),
  DRIVER_DOOR,
]);
const taxiApproach = [point(180, 440, 0, { angle: 0 }), point(207, 440, 0, { angle: 0 })];
for (let i = 1; i <= 18; i++) {
  const angle = (i * Math.PI) / 36;
  taxiApproach.push(
    point(207 + 24 * Math.sin(angle), 416 + 24 * Math.cos(angle), 0, { angle: -angle }),
  );
}
taxiApproach.push(TAXI_POSE);
const TAXI_APPROACH = freeze(taxiApproach);

function footTouchesCar(p, car, dimensions, radius = 7) {
  const c = Math.cos(car.angle),
    s = Math.sin(car.angle),
    dx = p.x - car.x,
    dy = p.y - car.y,
    x = dx * c + dy * s,
    y = -dx * s + dy * c;
  return (
    Math.hypot(
      x - Math.max(-dimensions.length / 2, Math.min(dimensions.length / 2, x)),
      y - Math.max(-dimensions.width / 2, Math.min(dimensions.width / 2, y)),
    ) < radius
  );
}

function groundRoad(id, a, b, width, access) {
  return {
    id,
    name: 'Old Quay Annex Approach',
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
    width,
    z: 0,
    z1: 0,
    z2: 0,
    grade: 0,
    layer: 'ground',
    kind: access.includes('car') ? 'campaign-parking' : 'campaign-walk',
    access,
    traffic: false,
    districtId: 'breakwater',
    neighbourhoodId: 'LL-CITY-N008',
    reservedFor: 'LL-ST-002',
  };
}
function addPath(roads, prefix, path, width, access) {
  for (let i = 1; i < path.length; i++)
    if (distance(path[i - 1], path[i]) > 0)
      roads.push(groundRoad(`${prefix}:${i}`, path[i - 1], path[i], width, access));
}

/** Conservative continuous body envelope: each chord's midpoint disk contains
 * every rotated full vehicle body throughout that chord, including its corners.
 * It may reject a tight but valid path; it never certifies centerline-only clearance.
 */
export function checkLateMeterVehicleSweep(
  world,
  path,
  dimensions = TAXI,
  { terrain = createTerrain(world) } = {},
) {
  if (
    !world ||
    !terrain ||
    typeof terrain.isBlocked !== 'function' ||
    !Array.isArray(path) ||
    path.length < 2 ||
    path.length > 1024
  )
    throw new TypeError('Vehicle sweep needs checked terrain, bounded poses and body dimensions.');
  for (const key of ['length', 'width', 'height'])
    if (!finite(dimensions[key]) || dimensions[key] <= 0 || dimensions[key] > 100)
      throw new RangeError('Invalid vehicle sweep dimensions.');
  if (path.some((p) => ![p?.x, p?.y, p?.z ?? 0, p?.angle ?? 0].every(finite)))
    throw new TypeError('Invalid vehicle sweep pose.');
  const radius = Math.hypot(dimensions.length, dimensions.width) / 2,
    issues = [],
    solids = createSpatialIndex([
      ...(world.buildings ?? []).map((item) => ({ ...item, height: item.height || 40 })),
      ...(world.obstacles ?? []),
    ]);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      length = distance(a, b),
      steps = Math.max(1, Math.ceil(length));
    if (steps > 10000) throw new RangeError('Vehicle sweep segment is too large.');
    for (let j = 0; j < steps; j++) {
      const t = (j + 0.5) / steps,
        x = a.x + (b.x - a.x) * t,
        y = a.y + (b.y - a.y) * t,
        z = (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * t,
        margin = length / steps / 2;
      const fullRadius = radius + margin,
        zMin = Math.min(a.z ?? 0, b.z ?? 0),
        zMax = Math.max(a.z ?? 0, b.z ?? 0) + dimensions.height;
      const solid = solids.queryRadius(x, y, fullRadius).find((item) => {
        if (zMin >= (item.z ?? 0) + item.height || zMax <= (item.z ?? 0)) return false;
        const dx = x - Math.max(item.x, Math.min(item.x + item.w, x)),
          dy = y - Math.max(item.y, Math.min(item.y + item.h, y));
        return dx * dx + dy * dy < fullRadius * fullRadius;
      });
      if (solid || terrain.isBlocked(x, y, fullRadius, z))
        issues.push({
          type: 'vehicle-sweep-blocked',
          segment: i - 1,
          x,
          y,
          z,
          solidId: solid?.id ?? null,
        });
      if (issues.length) break;
    }
    if (issues.length) break;
  }
  return { clear: issues.length === 0, issues, fullBodyRadius: radius };
}

export function createImpoundAnnexGeometry({ doorOpen = true, propHealth = {} } = {}) {
  if (
    typeof doorOpen !== 'boolean' ||
    !propHealth ||
    typeof propHealth !== 'object' ||
    Array.isArray(propHealth)
  )
    throw new TypeError('Invalid saved annex geometry state.');
  const propAlive = (p) => {
    const value = propHealth[p.id],
      health =
        value === undefined
          ? p.health
          : typeof value === 'object' && value !== null
            ? value.health
            : value;
    if (!finite(health) || health < 0 || health > 100)
      throw new RangeError('Invalid saved annex prop health.');
    return health > 0;
  };
  const room = IMPOUND_ANNEX_LAYOUT,
    door = room.doors[0],
    boxes = [...room.walls, ...room.props.filter(propAlive), ...(doorOpen ? [] : [door])],
    terrain = createTerrain({
      width: room.width,
      height: room.height + 60,
      bounds: { left: 0, top: 0, right: room.width, bottom: room.height + 60 },
      buildings: boxes,
      roads: [],
      water: [],
    });
  return {
    isBlocked(x, y, radius = 7, z = 0) {
      const inside =
          x - radius >= 0 &&
          x + radius <= room.width &&
          y - radius >= 0 &&
          y + radius <= room.height,
        apron =
          doorOpen &&
          x - radius >= door.x &&
          x + radius <= door.x + door.w &&
          y >= door.y - 20 &&
          y <= room.height + 30;
      return (!inside && !apron) || terrain.isBlocked(x, y, radius, z);
    },
    hasLineOfSight: terrain.hasLineOfSight,
    surfaceHeight: () => 0,
  };
}

export function createLateMeterWorld(source) {
  const site = source?.sites?.find((s) => s.id === FIRST_ARC_SCENES['impound-counter'].anchor.id),
    host = source?.buildings?.find((b) => b.id === site?.buildingId);
  if (!site || !host || !Array.isArray(source.roads))
    throw new Error('Late Meter needs the actual Old Quay Precinct anchor.');
  if (
    source.campaignSceneBindings?.['impound-counter'] ||
    source.locations?.some((l) => l.id === 'impound-annex')
  )
    throw new Error('Late Meter annex already installed.');
  const roads = [],
    obstacles = [
      volume('impound-annex-awning', 281, 376, 24, 21, 3, '#698276', 'annex-awning', {
        z: 34,
        render: false,
      }),
    ];
  addPath(roads, 'late-meter-bay-drive', TAXI_APPROACH, 28, ['car']);
  addPath(roads, 'late-meter-forecourt', [point(180, 389), ENTRY], 18, ['foot']);
  addPath(roads, 'late-meter-passenger-walk', FELIX, 18, ['foot']);
  addPath(roads, 'late-meter-east-walk', EAST, 18, ['foot']);
  addPath(roads, 'late-meter-north-walk', NORTH, 18, ['foot']);
  const binding = {
    ready: false,
    sceneId: null,
    siteId: site.id,
    hostBuildingId: host.id,
    roomId: IMPOUND_ANNEX_LAYOUT.id,
    portalId: IMPOUND_ANNEX_PORTAL.id,
    target: { ...TAXI_POSE, radius: 24 },
    entry: ENTRY,
    counterTarget: point(36, 144, 0, { sceneId: 'impound-annex', radius: 18 }),
    clerkTarget: point(36, 194, 0, { sceneId: 'impound-annex', actorId: 'LL-ARC-YARA' }),
    parkingBay: {
      id: 'impound-lookout-bay',
      x: 217,
      y: 371,
      w: 26,
      h: 44,
      z: 0,
      pose: TAXI_POSE,
      angle: TAXI_POSE.angle,
      angleTolerance: 0.18,
      positionTolerance: 3,
      maxSpeed: 2.5,
      seconds: 1.5,
      vehicleSpec: 'taxi',
      passengerDoor: PASSENGER_DOOR,
    },
    taxiApproach: TAXI_APPROACH,
    taxiExit: [...TAXI_APPROACH].reverse(),
    felixDoorToTaxi: FELIX,
    interiorCounterPath: INTERIOR_TO_COUNTER,
    interiorExitPath: INTERIOR_EXIT,
    collectorApproaches: {
      east: {
        actorId: 'LL-ARC-REEVE',
        path: EAST,
        speed: 18,
        doorTarget: ENTRY,
        clipboardReview: CLIPBOARD_REVIEW,
      },
      north: { actorId: 'holt-collector-watch', path: NORTH, speed: 10, curbTarget: NORTH.at(-1) },
    },
    observation: {
      observationWindowSeconds: 45,
      recognitionRange: 180,
      requiresExplicitRecognition: true,
      requiresCameraVisibility: true,
      requiresLineOfSight: true,
      requiredAppearanceId: LATE_METER_APPEARANCES.reeve.id,
      requiredPropId: LATE_METER_CLIPBOARD.id,
      clueIds: ['grey-tow-jacket', 'co-op-repossession-clipboard'],
      actorHeight: 20,
    },
    actorMarks: {
      reeveReview: CLIPBOARD_REVIEW,
      reeveDoor: ENTRY,
      watcherCurb: NORTH.at(-1),
      yaraCounter: point(36, 194, 0, { sceneId: 'impound-annex' }),
      felixCounter: point(36, 144, 0, { sceneId: 'impound-annex' }),
    },
    actorSpawns: {
      yara: {
        ...point(36, 194),
        id: 'LL-ARC-YARA',
        name: 'Yara Fen',
        role: 'impound-clerk',
        sceneId: 'impound-annex',
        angle: -Math.PI / 2,
        appearance: LATE_METER_APPEARANCES.yara,
      },
      reeve: {
        ...EAST[0],
        id: 'LL-ARC-REEVE',
        name: 'Reeve Holt',
        role: 'collector',
        carriedPropIds: [LATE_METER_CLIPBOARD.id],
        sceneId: null,
        angle: Math.PI,
        appearance: LATE_METER_APPEARANCES.reeve,
      },
      watcher: {
        ...NORTH[0],
        id: 'holt-collector-watch',
        name: 'Holt collector',
        role: 'collector-watch',
        sceneId: null,
        angle: Math.PI / 2,
        appearance: LATE_METER_APPEARANCES.watcher,
      },
    },
    pursuerSpawn: PURSUER,
    pursuerDriverActorId: 'LL-ARC-REEVE',
    pursuerDriverPath: DRIVER,
    pursuerDriverDoor: DRIVER_DOOR,
    pursuerDeparture: [
      PURSUER,
      point(280, 463, 0, { angle: Math.PI }),
      point(180, 463, 0, { angle: Math.PI }),
    ],
    serviceWindow: {
      id: 'impound-service-window',
      exterior: point(258, 376.75, 24),
      interior: point(36, 205, 24, { sceneId: 'impound-annex' }),
      frontage: { x: 244, y: 376.5, w: 28, h: 0.25, z: 13, height: 22 },
      glazing: 'laminated-service-glass',
      acousticDevice: 'counter-intercom',
      range: 136,
      speakerRange: 80,
      mouthHeight: 24,
      speakerZone: { x: 14, y: 128, w: 60, h: 80 },
      visibleClerkZone: { x: 14, y: 184, w: 52, h: 24 },
      speakerIds: ['LL-ARC-YARA', 'LL-CHAR-002'],
    },
  };
  const world = {
    ...source,
    roads: [...source.roads, ...roads],
    obstacles: [...(source.obstacles ?? []), ...obstacles],
    locations: [
      ...(source.locations ?? []),
      {
        id: 'impound-annex',
        name: 'Old Quay Impound Annex',
        type: 'campaign-interior',
        ...ENTRY,
        siteId: site.id,
        description: 'Municipal taxi release counter and lookout curb',
      },
    ],
    campaignSceneBindings: { ...(source.campaignSceneBindings ?? {}), 'impound-counter': binding },
    lateMeterDressing: {
      hostBuildingId: host.id,
      door: { x: 293, y: 376.5, width: 24, z: 0, height: 32 },
      serviceWindow: binding.serviceWindow,
      bay: binding.parkingBay,
      obstacleIds: obstacles.map((p) => p.id),
    },
    navigationRevision: (source.navigationRevision ?? 0) + 1,
  };
  const terrain = createTerrain(world),
    issues = [];
  for (const path of [EAST, NORTH, FELIX, DRIVER])
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i],
        steps = Math.max(1, Math.ceil(distance(a, b)));
      for (let j = 0; j <= steps; j++) {
        const t = j / steps,
          p = point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        if (
          terrain.isBlocked(p.x, p.y, 7, p.z) ||
          footTouchesCar(p, TAXI_POSE, TAXI) ||
          footTouchesCar(p, PURSUER, SEDAN)
        ) {
          issues.push({ type: 'foot-access-blocked', pathStart: path[0], point: p });
          break;
        }
      }
    }
  for (const [label, path, dimensions] of [
    ['taxi', TAXI_APPROACH, TAXI],
    ['pursuer', binding.pursuerDeparture, SEDAN],
  ])
    for (const issue of checkLateMeterVehicleSweep(world, path, dimensions, { terrain }).issues)
      issues.push({ ...issue, vehicle: label });
  const room = createImpoundAnnexGeometry();
  for (let i = 1; i < INTERIOR_TO_COUNTER.length; i++) {
    const a = INTERIOR_TO_COUNTER[i - 1],
      b = INTERIOR_TO_COUNTER[i],
      n = Math.max(1, Math.ceil(distance(a, b)));
    for (let j = 0; j <= n; j++)
      if (room.isBlocked(a.x + ((b.x - a.x) * j) / n, a.y + ((b.y - a.y) * j) / n, 7)) {
        issues.push({ type: 'room-counter-path-blocked', segment: i - 1 });
        break;
      }
  }
  for (const mark of [
    CLIPBOARD_REVIEW,
    point(410, 397, 20),
    point(231, 300, 20),
    binding.serviceWindow.exterior,
  ])
    if (!terrain.hasLineOfSight({ ...TAXI_POSE, health: 100, eyeHeight: 8 }, mark))
      issues.push({ type: 'lookout-view-blocked', mark });
  binding.ready = issues.length === 0;
  return {
    world,
    bindings: { 'impound-counter': binding },
    room: IMPOUND_ANNEX_LAYOUT,
    portal: IMPOUND_ANNEX_PORTAL,
    report: {
      status: 'authored-physical-candidate',
      ready: binding.ready,
      issues,
      existingGeometryPreserved: true,
      runtimeReady: false,
      requiredHandlers: [
        'register real impound-annex layout/portal',
        'persistent canonical Yara/Reeve/watcher bodies and appearance validation',
        'actual Felix door crossing and scene transform',
        'intercom/optical window presentation from live room bodies',
        'explicit recognition with visible jacket and actual carried clipboard',
        'physical scripted clipboard-review dwell',
        'real NPC driver/seat0 boarding and adaptive sedan motion',
        'collector arrival and protected-cast/patrol damage failures',
        'whole-save scene/actor/prop consistency',
      ],
      newRoadIds: roads.map((r) => r.id),
      newObstacleIds: obstacles.map((p) => p.id),
    },
  };
}

function findActor(state, id, context) {
  if (context?.getActor) return context.getActor(id) ?? null;
  const pools = [
      state.companions?.actors,
      state.campaignActors,
      state.pedestrians,
      state.hostiles,
      state.police,
      ...Object.values(state.interior?.rooms ?? {}).map((r) => r.actors),
    ].filter(Array.isArray),
    matches = [...new Set(pools.flat())].filter(
      (a) => a && typeof a === 'object' && (actorId(a) === id || a.id === id),
    );
  return matches.length === 1 ? matches[0] : null;
}

/** A live intercom joins two checked scene rays. It does not bypass a wall for combat. */
export function impoundAudibility(state, world, observer, context = {}) {
  const binding = world?.campaignSceneBindings?.['impound-counter'],
    window = binding?.serviceWindow;
  if (state.interior?.active && observer === state.player) return { audible: false, speakers: [] };
  if (
    !binding?.ready ||
    !window ||
    sceneId(observer) !== null ||
    ![observer?.x, observer?.y].every(finite)
  )
    return { audible: false, speakers: [] };
  if (
    context.intercomEnabled === false ||
    typeof context.hasExteriorLineOfSight !== 'function' ||
    typeof context.hasInteriorLineOfSight !== 'function'
  )
    return { audible: false, speakers: [] };
  if (
    distance(observer, window.exterior) > window.range ||
    !context.hasExteriorLineOfSight(observer, window.exterior)
  )
    return { audible: false, speakers: [] };
  const speakers = [];
  for (const id of window.speakerIds) {
    const actor = findActor(state, id, context);
    if (
      !actor ||
      !living(actor) ||
      sceneId(actor) !== binding.roomId ||
      !within(actor, window.speakerZone) ||
      distance(actor, window.interior) > window.speakerRange
    )
      continue;
    const mouth = { x: actor.x, y: actor.y, z: (actor.z ?? 0) + window.mouthHeight };
    if (context.hasInteriorLineOfSight(binding.roomId, mouth, window.interior)) speakers.push(id);
  }
  return {
    audible: speakers.length > 0,
    speakers,
    via: window.id,
    exterior: window.exterior,
    interior: window.interior,
  };
}

export function lateMeterClipboardPose(actor, prop = LATE_METER_CLIPBOARD) {
  if (
    !actor ||
    !living(actor) ||
    (actor.inVehicle && actor.companionPhase !== 'exiting') ||
    !prop ||
    typeof prop !== 'object' ||
    prop.state !== 'carried' ||
    prop.ownerActorId !== actorId(actor) ||
    prop.visible === false
  )
    return null;
  const local = prop.attachment;
  if (
    ![
      actor.x,
      actor.y,
      actor.z ?? 0,
      actor.angle ?? 0,
      local?.forward,
      local?.right,
      local?.z,
    ].every(finite)
  )
    return null;
  const a = actor.angle ?? 0,
    c = Math.cos(a),
    s = Math.sin(a);
  return {
    x: actor.x + local.forward * c - local.right * s,
    y: actor.y + local.forward * s + local.right * c,
    z: (actor.z ?? 0) + local.z,
    angle: a,
    sceneId: sceneId(actor),
    ownerActorId: actorId(actor),
    propId: prop.id,
  };
}
export function lateMeterPropDescriptors(state, context = {}) {
  const props = state.campaignRuntime?.sceneProps;
  if (!props || !Object.hasOwn(props, LATE_METER_CLIPBOARD.id)) return [];
  const prop = props[LATE_METER_CLIPBOARD.id];
  if (
    !prop ||
    prop.visible === false ||
    prop.id !== LATE_METER_CLIPBOARD.id ||
    prop.kind !== LATE_METER_CLIPBOARD.kind ||
    prop.version !== 1
  )
    return [];
  if (prop.state === 'carried') {
    const pose = lateMeterClipboardPose(findActor(state, prop.ownerActorId, context), prop);
    return pose ? [{ ...prop, ...pose }] : [];
  }
  return prop.state === 'dropped' &&
    prop.ownerActorId === null &&
    [prop.x, prop.y, prop.z ?? 0, prop.angle ?? 0].every(finite)
    ? [prop]
    : [];
}

/** The same tilted board axes used by native drawing, in physical scene coordinates. */
function clipboardShape(prop) {
  const c = Math.cos(prop.angle),
    s = Math.sin(prop.angle),
    tilt = prop.state === 'dropped' ? 1 : 0.35,
    rise = Math.sqrt(1 - tilt * tilt),
    axes = [
      [-s, c, 0],
      [c * tilt, s * tilt, rise],
      [c * rise, s * rise, -tilt],
    ],
    half = [prop.width / 2, prop.height / 2, prop.thickness / 2],
    center = [prop.x, prop.y, prop.z].map((v, i) => v + axes[1][i] * half[1]);
  return { axes, half, center };
}
export function closestLateMeterClipboardPoint(point, prop) {
  const { axes, half, center } = clipboardShape(prop),
    delta = [point.x, point.y, point.z ?? 0].map((v, i) => v - center[i]),
    local = axes.map((axis, i) =>
      Math.max(
        -half[i],
        Math.min(
          half[i],
          axis.reduce((sum, v, j) => sum + v * delta[j], 0),
        ),
      ),
    );
  const [x, y, z] = center.map(
    (v, i) => v + axes.reduce((sum, axis, j) => sum + axis[i] * local[j], 0),
  );
  return { x, y, z };
}
export function traceLateMeterClipboard(start, end, prop) {
  const { axes, half, center } = clipboardShape(prop),
    from = [start.x, start.y, start.z ?? 0].map((v, i) => v - center[i]),
    delta = [end.x - start.x, end.y - start.y, (end.z ?? 0) - (start.z ?? 0)];
  let enter = 0,
    leave = 1;
  for (let i = 0; i < axes.length; i++) {
    const origin = axes[i].reduce((sum, v, j) => sum + v * from[j], 0),
      direction = axes[i].reduce((sum, v, j) => sum + v * delta[j], 0);
    if (Math.abs(direction) < 1e-10) {
      if (origin < -half[i] || origin > half[i]) return null;
    } else {
      const a = (-half[i] - origin) / direction,
        b = (half[i] - origin) / direction;
      enter = Math.max(enter, Math.min(a, b));
      leave = Math.min(leave, Math.max(a, b));
      if (enter > leave) return null;
    }
  }
  return {
    t: enter,
    x: start.x + delta[0] * enter,
    y: start.y + delta[1] * enter,
    z: (start.z ?? 0) + delta[2] * enter,
  };
}

const native = () => {
  if (!globalThis.My3D2dge?.px) throw new Error('Late Meter needs the supplied native engine.');
  return globalThis.My3D2dge;
};
function polygon(r, g, points, color) {
  native().px.poly(
    g,
    points.map((p) => r.w(...p)),
    color,
  );
}
function line(r, g, a, b, color, width = 1) {
  native().px.line(g, ...r.w(...a), ...r.w(...b), color, width);
}
function face(r, g, x0, x1, y, z0, z1, color) {
  polygon(
    r,
    g,
    [
      [x0, y, z0],
      [x1, y, z0],
      [x1, y, z1],
      [x0, y, z1],
    ],
    color,
  );
}
function visible(r, box) {
  const points = [];
  for (const x of [box.x, box.x + box.w])
    for (const y of [box.y, box.y + box.h])
      for (const z of [box.z ?? 0, (box.z ?? 0) + (box.height ?? 0)]) points.push(r.w(x, y, z));
  return (
    Math.max(...points.map((p) => p[0])) >= 0 &&
    Math.min(...points.map((p) => p[0])) < r.bw &&
    Math.max(...points.map((p) => p[1])) >= 0 &&
    Math.min(...points.map((p) => p[1])) < r.bh
  );
}

function actorProjection(r, actor, origin) {
  if (!origin) return r;
  const at = Array.isArray(origin) ? origin : [origin.x, origin.y];
  if (!actor || ![actor.x, actor.y, actor.z ?? 0, ...at].every(finite)) return null;
  const feet = r.w(actor.x, actor.y, actor.z ?? 0),
    projected = Object.create(r);
  projected.w = (x, y, z = 0) => {
    const p = r.w(x, y, z);
    return [p[0] - feet[0] + at[0], p[1] - feet[1] + at[1]];
  };
  return projected;
}

/** Draw one actual carried/dropped board inside the shared actor/prop renderer.
 * The caller owns depth ordering and body rendering; this function creates none.
 */
export function drawLateMeterClipboard(
  r,
  g,
  pose,
  definition = LATE_METER_CLIPBOARD,
  { actor = null, origin = null } = {},
) {
  r = actorProjection(r, actor, origin);
  if (!r) return false;
  if (
    ![
      pose?.x,
      pose?.y,
      pose?.z ?? 0,
      pose?.angle ?? 0,
      definition?.width,
      definition?.height,
    ].every(finite) ||
    definition.width <= 0 ||
    definition.height <= 0
  )
    return false;
  const a = pose.angle ?? 0,
    c = Math.cos(a),
    s = Math.sin(a),
    carried = pose.state !== 'dropped',
    tilt = carried ? 0.35 : 1,
    rise = carried ? Math.sqrt(1 - tilt * tilt) : 0,
    p = (right, up, depth = 0) => [
      pose.x - s * right + c * up * tilt - c * depth,
      pose.y + c * right + s * up * tilt - s * depth,
      (pose.z ?? 0) + up * rise,
    ],
    quad = (left, bottom, right, top, depth = 0) => [
      p(left, bottom, depth),
      p(right, bottom, depth),
      p(right, top, depth),
      p(left, top, depth),
    ],
    half = definition.width / 2,
    height = definition.height;
  polygon(r, g, quad(-half, 0, half, height), definition.boardColor);
  polygon(r, g, quad(-half + 0.45, 0.5, half - 0.45, height - 0.7, 0.02), definition.paperColor);
  polygon(r, g, quad(-1.3, height - 1.2, 1.3, height + 0.2, 0.04), '#aab3a2');
  // The co-op's paired wheel/key icon and checked ledger rows remain distinct
  // from the broad grey jacket clue even when tiny text cannot be read.
  for (const right of [-1.2, 1.2]) {
    line(r, g, p(right - 0.7, height - 2.2, 0.06), p(right + 0.7, height - 2.2, 0.06), '#426f69');
    line(r, g, p(right, height - 2.9, 0.06), p(right, height - 1.5, 0.06), '#426f69');
  }
  for (const up of [1.5, 3, 4.5]) {
    line(r, g, p(-half + 1, up, 0.06), p(half - 1, up, 0.06), '#79795e');
    line(r, g, p(-half + 0.7, up - 0.3, 0.06), p(-half + 1, up, 0.06), '#4d7363');
  }
  return true;
}

export function impoundWindowActor(state, world, context = {}) {
  const b = world?.campaignSceneBindings?.['impound-counter'],
    actor = findActor(state, 'LL-ARC-YARA', context);
  if (
    !b?.ready ||
    !actor ||
    !living(actor) ||
    sceneId(actor) !== b.roomId ||
    !within(actor, b.serviceWindow.visibleClerkZone)
  )
    return null;
  return {
    actor,
    actorId: 'LL-ARC-YARA',
    sourceSceneId: b.roomId,
    windowId: b.serviceWindow.id,
    exterior: b.serviceWindow.exterior,
  };
}
function drawClerkWindow(r, g, descriptor, window) {
  if (!descriptor) return;
  const body = descriptor.actor,
    colors = body.appearance?.colors ?? LATE_METER_APPEARANCES.yara.colors,
    x = window.exterior.x + (body.x - 36) * 0.2,
    y = window.frontage.y + 0.04;
  face(r, g, x - 3.8, x + 3.8, y, 15, 23, colors.cloth);
  const frontFacing = Math.sin(body.angle ?? -Math.PI / 2) > 0;
  if (frontFacing) face(r, g, x - 2.6, x + 2.6, y + 0.01, 14, 20, '#8d947d');
  face(r, g, x - 2.4, x + 2.4, y + 0.02, 23, 29, colors.skin);
  face(r, g, x - 2.6, x + 2.6, y + 0.03, frontFacing ? 27.5 : 23, 30, colors.hair);
  face(r, g, x + 1.5, x + 3.3, y, 27, 30.5, colors.hair);
  for (const dx of frontFacing ? [-1.1, 1.1] : [])
    face(r, g, x + dx - 0.2, x + dx + 0.2, y + 0.04, 25.6, 26.1, '#293c37');
}

/** Shared world/room hooks own scenery only. Named bodies and held props are
 * rendered once by the parent's authoritative appearance/prop path.
 */
export function createLateMeterRenderer(
  game,
  world,
  { getActor, drawWindowActor = drawClerkWindow } = {},
) {
  const binding = world?.campaignSceneBindings?.['impound-counter'];
  if (!binding?.ready || !world.lateMeterDressing)
    throw new Error('Checked Late Meter staging is required.');
  let disposed = false;
  const stats = { frames: 0, bayMarks: 0, frontage: 0, windowViews: 0, roomDetails: 0 };
  const check = () => {
    if (disposed) throw new Error('Late Meter renderer is disposed.');
  };
  return {
    stats,
    drawGround(r, state) {
      check();
      stats.bayMarks = 0;
      if (state.interior?.active || !visible(r, { ...binding.parkingBay, height: 1 })) return false;
      const b = binding.parkingBay;
      for (const x of [b.x, b.x + b.w])
        line(r, r.ctx, [x, b.y, 0.03], [x, b.y + b.h, 0.03], '#d0c48b', 2);
      line(r, r.ctx, [b.x, b.y, 0.03], [b.x + b.w, b.y, 0.03], '#d0c48b', 2);
      const { x, y } = b.pose;
      line(r, r.ctx, [x, y + 5, 0.04], [x, y - 10, 0.04], '#b6bd97');
      line(r, r.ctx, [x, y - 10, 0.04], [x - 4, y - 4, 0.04], '#b6bd97');
      line(r, r.ctx, [x, y - 10, 0.04], [x + 4, y - 4, 0.04], '#b6bd97');
      stats.bayMarks = 6;
      return true;
    },
    draw(r, state) {
      check();
      stats.frames++;
      stats.frontage = 0;
      stats.windowViews = 0;
      if (state.interior?.active) return false;
      const d = world.lateMeterDressing,
        door = d.door,
        window = d.serviceWindow;
      if (
        !r.view.isTop &&
        r.view.fy > 0.02 &&
        visible(r, { x: 243, y: 376, w: 63, h: 2, z: 0, height: 48 })
      ) {
        r.queue(
          door.x,
          door.y,
          0,
          (g) => {
            const saved = state.interior?.rooms?.[binding.roomId]?.doors?.['front-door'],
              open = saved?.open ?? IMPOUND_ANNEX_LAYOUT.doors[0].open;
            face(r, g, door.x - 13, door.x + 13, door.y, 0, 33, '#b9bba0');
            face(
              r,
              g,
              door.x - 11,
              door.x + 11,
              door.y + 0.01,
              0,
              31,
              open ? '#263e39' : '#506e62',
            );
            if (open) face(r, g, door.x + 5, door.x + 11, door.y + 0.02, 0, 31, '#627b68');
            line(
              r,
              g,
              [door.x + 8, door.y + 0.03, 12],
              [door.x + 8, door.y + 0.03, 16],
              '#d5c58d',
              2,
            );
            const q = r.w(door.x, door.y, 44);
            native().font.text(g, 'IMPOUND ANNEX', q[0], q[1], '#ded4ae', {
              align: 'center',
              font: 'tiny',
              outline: '#3a5147',
            });
          },
          { bias: 0.03 },
        );
        r.queue(
          window.exterior.x,
          window.frontage.y,
          0,
          (g) => {
            const f = window.frontage;
            face(r, g, f.x - 1, f.x + f.w + 1, f.y, f.z - 1, f.z + f.height + 1, '#c0c2a4');
            face(r, g, f.x, f.x + f.w, f.y + 0.01, f.z, f.z + f.height, '#304c49');
            const descriptor = impoundWindowActor(state, world, { getActor });
            if (descriptor) {
              drawWindowActor(r, g, descriptor, window);
              stats.windowViews++;
            }
            line(
              r,
              g,
              [f.x + 1, f.y + 0.08, f.z + 2],
              [f.x + f.w - 2, f.y + 0.08, f.z + f.height - 2],
              '#83a397',
            );
            face(
              r,
              g,
              f.x + f.w / 2 - 0.5,
              f.x + f.w / 2 + 0.5,
              f.y + 0.09,
              f.z,
              f.z + f.height,
              '#b3b99e',
            );
            face(r, g, f.x + f.w + 2, f.x + f.w + 6, f.y + 0.05, 15, 21, '#6f8174');
            for (const z of [16, 17.5, 19])
              line(
                r,
                g,
                [f.x + f.w + 2.5, f.y + 0.1, z],
                [f.x + f.w + 5.5, f.y + 0.1, z],
                '#293f39',
              );
            const q = r.w(window.exterior.x, f.y + 0.1, 41);
            native().font.text(g, 'RELEASES', q[0], q[1], '#d8d0a4', {
              align: 'center',
              font: 'tiny',
              outline: '#3c5248',
            });
          },
          { bias: 0.04 },
        );
        stats.frontage = 2;
      }
      const roof = world.obstacles.find((o) => o.id === 'impound-annex-awning');
      if (roof && visible(r, roof))
        r.queue(
          roof.x + roof.w / 2,
          roof.y + roof.h / 2,
          roof.z,
          (g) => {
            const under = within(state.player, roof) && (state.player.z ?? 0) < roof.z;
            const alpha = g.globalAlpha;
            g.globalAlpha *= under ? 0.4 : 1;
            r.box(
              g,
              roof.x,
              roof.y,
              roof.z,
              roof.x + roof.w,
              roof.y + roof.h,
              roof.z + roof.height,
              '#7f9582',
              '#567465',
            );
            line(
              r,
              g,
              [roof.x, roof.y + roof.h, roof.z],
              [roof.x + roof.w, roof.y + roof.h, roof.z],
              '#bac5a0',
              2,
            );
            g.globalAlpha = alpha;
          },
          { occluder: true },
        );
      return true;
    },
    drawRoomDetails(r, state) {
      check();
      stats.roomDetails = 0;
      if (state.interior?.active?.roomId !== binding.roomId) return false;
      const saved = state.interior.rooms?.[binding.roomId];
      if (!saved?.props) return false;
      const alive = (id) => saved.props[id]?.health > 0;
      if (alive('release-counter')) {
        r.queue(
          40,
          174,
          17.1,
          (g) => {
            for (const x of [22, 37, 50]) {
              polygon(
                r,
                g,
                [
                  [x, 167, 17.2],
                  [x + 10, 167, 17.2],
                  [x + 10, 179, 17.2],
                  [x, 179, 17.2],
                ],
                '#d8d2b0',
              );
              for (const y of [170, 173, 176])
                line(r, g, [x + 2, y, 17.3], [x + 8, y, 17.3], '#7c8064');
            }
          },
          { bias: 0.02 },
        );
        stats.roomDetails++;
      }
      if (alive('duplicate-printer')) {
        r.queue(
          146.5,
          50.5,
          0,
          (g) => {
            face(r, g, 137, 156, 63.1, 8, 14, '#354e48');
            polygon(
              r,
              g,
              [
                [139, 61, 14.1],
                [153, 61, 14.1],
                [153, 68, 14.1],
                [139, 68, 14.1],
              ],
              '#d8d2b0',
            );
            for (const y of [63, 65]) line(r, g, [141, y, 14.2], [151, y, 14.2], '#797c65');
            polygon(
              r,
              g,
              [
                [148, 41, 22.1],
                [155, 41, 22.1],
                [155, 49, 22.1],
                [148, 49, 22.1],
              ],
              '#364d48',
            );
            const p = r.w(151, 44, 22.2);
            native().px.disc(g, p[0], p[1], 1.2, '#b8c68c');
          },
          { bias: 0.02 },
        );
        stats.roomDetails++;
      }
      if (alive('release-file-rack')) {
        r.queue(
          150,
          107,
          0,
          (g) => {
            for (const z of [10, 21, 32, 43]) {
              face(r, g, 138, 162, 138.1, z - 6, z, '#819081');
              line(r, g, [139, 138.2, z - 5], [161, 138.2, z - 5], '#556d61');
              face(r, g, 147, 153, 138.3, z - 4, z - 2, '#b9bba0');
            }
          },
          { bias: 0.02 },
        );
        stats.roomDetails++;
      }
      if (alive('public-form-table')) {
        r.queue(
          139,
          171,
          0,
          (g) => {
            for (const x of [126, 141])
              polygon(
                r,
                g,
                [
                  [x, 164, 17.2],
                  [x + 10, 164, 17.2],
                  [x + 10, 177, 17.2],
                  [x, 177, 17.2],
                ],
                '#c9cba7',
              );
            line(r, g, [134, 178, 17.4], [145, 176, 17.4], '#3e5c52', 2);
          },
          { bias: 0.02 },
        );
        stats.roomDetails++;
      }
      const q = r.w(36, 210, 44);
      r.queue(36, 210, 0, (g) =>
        native().font.text(g, 'YARA / RELEASES', q[0], q[1], '#ddd1a5', {
          align: 'center',
          font: 'tiny',
          outline: '#3b5147',
        }),
      );
      stats.roomDetails++;
      return true;
    },
    dispose() {
      disposed = true;
    },
  };
}

/** Optional shared-appearance hook: native badge detail, never another body. */
export function drawLateMeterClothingMarks(r, g, actor, { origin = null } = {}) {
  r = actorProjection(r, actor, origin);
  if (!r) return 0;
  if (!actor || !living(actor) || ![actor.x, actor.y, actor.z ?? 0, actor.angle ?? 0].every(finite))
    return 0;
  const appearance = actor.appearance;
  if (Math.cos(actor.angle ?? 0) * r.view.fx + Math.sin(actor.angle ?? 0) * r.view.fy <= 0)
    return 0;
  if (appearance?.id !== LATE_METER_APPEARANCES.reeve.id) return 0;
  const a = actor.angle ?? 0,
    c = Math.cos(a),
    s = Math.sin(a),
    p = (right, z) => [
      actor.x + c * 2.7 - s * right,
      actor.y + s * 2.7 + c * right,
      (actor.z ?? 0) + z,
    ];
  polygon(r, g, [p(-2.8, 14), p(-0.5, 14), p(-0.5, 17.3), p(-2.8, 17.3)], '#cab779');
  line(r, g, p(-1.7, 16.6), p(-1.7, 14.8), '#40594e');
  line(r, g, p(-1.7, 14.8), p(-1, 14.8), '#40594e');
  line(r, g, p(-1, 14.8), p(-1, 15.5), '#40594e');
  return 1;
}
