/** Authored Night Crossing spaces, kept separate from campaign facts and services. */
import { FIRST_ARC_SCENES } from './first-arc.js';
import { createTerrain } from '../terrain.js';

const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const point = (x, y, z = 0, extra = {}) => ({ x, y, z, ...extra });
const prop = (id, x, y, w, h, height, type, color, extra = {}) => ({
  id,
  x,
  y,
  w,
  h,
  height,
  type,
  color,
  health: 100,
  ...extra,
});
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const DOCKSIDE_ROOM_LAYOUT = freeze({
  id: 'dockside-rooms',
  name: 'Dockside Rooms',
  theme: 'a shared co-op walk-up with practical shelter and two narrow beds',
  width: 240,
  height: 220,
  floorZ: 0,
  palette: { floor: '#6e6958', wall: '#7c8375', light: '#d8c597' },
  spawn: { x: 122, y: 184, angle: -Math.PI / 2 },
  walls: [
    prop('wall-west', 0, 0, 10, 220, 72, 'wall', '#78816f'),
    prop('wall-east', 230, 0, 10, 220, 72, 'wall', '#78816f'),
    prop('wall-north', 0, 0, 240, 10, 72, 'wall', '#78816f'),
    prop('wall-south-west', 0, 210, 94, 10, 72, 'wall', '#78816f'),
    prop('wall-south-east', 150, 210, 90, 10, 72, 'wall', '#78816f'),
    prop('bed-privacy-screen', 122, 14, 6, 94, 35, 'partition', '#8b8c70'),
  ],
  doors: [
    {
      id: 'front-door',
      x: 94,
      y: 210,
      w: 56,
      h: 10,
      height: 68,
      open: false,
      locked: false,
      exit: true,
      edge: 'south',
      vehicleAllowed: false,
    },
  ],
  props: [
    prop('dockside-bed-frame', 22, 32, 54, 84, 12, 'bed', '#81765f'),
    prop('spare-bed-frame', 158, 32, 62, 84, 12, 'bed', '#8a816b'),
    prop('dockside-kettle-table', 22, 150, 52, 24, 18, 'kettle-table', '#8b7e61'),
    prop('dockside-wardrobe-case', 180, 144, 36, 50, 48, 'wardrobe', '#777d68'),
    prop('dockside-ledger-desk', 92, 30, 42, 24, 18, 'ledger-desk', '#8c795a'),
    prop('dockside-save-desk', 112, 146, 30, 18, 18, 'shelter-desk', '#8e826a'),
    prop('dockside-key-rack', 157, 204, 18, 6, 32, 'key-rack', '#8e8a70'),
    prop('dockside-wash-basin', 22, 194, 38, 12, 17, 'wash-basin', '#8e9b8b'),
  ],
  hooks: [
    {
      id: 'dockside-kettle',
      type: 'shelter-food',
      service: 'shelter-food',
      x: 82,
      y: 162,
      radius: 22,
      prompt: 'Share soup and tea',
      requiresExplicitResult: true,
    },
    {
      id: 'dockside-save',
      type: 'shelter-save',
      service: 'shelter-save',
      x: 122,
      y: 175,
      radius: 20,
      prompt: 'Save at Dockside Rooms',
      requiresExplicitResult: true,
    },
    {
      id: 'dockside-bed',
      type: 'shelter-rest',
      service: 'shelter-rest',
      x: 84,
      y: 86,
      radius: 22,
      hours: 6,
      prompt: 'Rest for six hours',
      requiresExplicitResult: true,
    },
    {
      id: 'dockside-wardrobe',
      type: 'wardrobe',
      service: 'wardrobe',
      x: 164,
      y: 167,
      radius: 20,
      prompt: 'Choose a work outfit',
      requiresExplicitResult: true,
    },
    {
      id: 'dockside-ledger',
      type: 'evidence',
      service: 'evidence',
      evidenceId: 'co-op-arrears',
      x: 112,
      y: 74,
      radius: 22,
      prompt: 'Read the unpaid-contract ledger',
      requiresExplicitResult: true,
    },
    {
      id: 'dockside-key',
      type: 'evidence',
      service: 'shelter-key',
      evidenceId: 'dockside-tenancy',
      x: 167,
      y: 190,
      radius: 18,
      prompt: 'Inspect the spare shelter key',
      requiresExplicitResult: true,
    },
  ],
  // Canonical companions own Felix and Nadia; no second persistent room copies.
  actors: [],
  lights: [
    { x: 82, y: 130, z: 46, color: '#d8c597' },
    { x: 170, y: 140, z: 42, color: '#b8c4a3' },
  ],
  floorRegions: [
    { id: 'sleeping-boards', x: 14, y: 14, w: 212, h: 110, material: 'worn-timber' },
    { id: 'shared-kitchen', x: 14, y: 136, w: 92, h: 70, material: 'worn-linoleum' },
    { id: 'entry-mat', x: 100, y: 178, w: 46, h: 28, material: 'woven-mat' },
  ],
});

export const DOCKSIDE_PORTAL = freeze({
  id: 'dockside-rooms-entry',
  roomId: 'dockside-rooms',
  locationId: 'dockside-rooms',
  siteId: 'LL-CITY-LOC054',
  roleReferences: ['LL-CITY-LOC054'],
  entryRadius: 26,
  vehicleAllowed: false,
  wantedMax: 0,
  keyId: 'dockside-tenancy',
});

const ROUTES = freeze({
  ferryToApron: [
    point(1830, 814, 6),
    point(1830, 800, 6),
    point(1818, 800, 6),
    point(1768, 800, 4),
    point(1696, 800, 4),
    point(1696, 842, 4),
  ],
  apronToTaxi: [
    point(1696, 842, 4),
    point(1690, 842, 4),
    point(1690, 892, 16 / 7),
    point(1672.5, 892, 0),
    point(1672.5, 923.5, 0),
  ],
  driverToTaxi: [
    point(1696, 842, 4),
    point(1707.5, 842, 4),
    point(1707.5, 880, 4),
    point(1707.5, 908),
    point(1707.5, 923.5),
  ],
  siteToApron: [
    point(1431, 828),
    point(1431, 912),
    point(1690, 912),
    point(1690, 908),
    point(1690, 880, 4),
    point(1696, 842, 4),
  ],
});
const SAMPLE_PROPS = freeze({
  'arrival-duffel': {
    id: 'arrival-duffel',
    kind: 'duffel',
    sceneId: null,
    x: 1826,
    y: 844,
    z: 6,
    w: 10,
    h: 8,
    height: 8,
    color: '#806f50',
    visible: true,
  },
});
export const NIGHT_CROSSING_DEFAULT_PROPS = SAMPLE_PROPS;

function addRoad(roads, id, a, b, width, access = ['foot'], extra = {}) {
  roads.push({
    id,
    name: 'Night Crossing approach',
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
    z1: a.z,
    z2: b.z,
    z: a.z,
    width,
    access,
    bridge: a.z !== 0 || b.z !== 0,
    layer: a.z !== b.z ? 'ramp' : a.z > 0 ? 'elevated' : 'ground',
    grade: (b.z - a.z) / Math.hypot(b.x - a.x, b.y - a.y),
    kind: 'campaign-access',
    ...extra,
  });
}
function obstacle(id, x, y, w, h, z, height, type, color) {
  return {
    id,
    x,
    y,
    w,
    h,
    z,
    height,
    type,
    color,
    render: false,
    traversable: false,
    campaignSceneId: 'night-crossing',
  };
}
function addDeck(decks, id, x, y, w, h, z) {
  decks.push({
    id,
    x,
    y,
    w,
    h,
    bounds: { x, y, w, h },
    z,
    access: ['foot'],
    kind: 'campaign-passenger-deck',
  });
}
function obstructionReport(source, obstacles) {
  const issues = [];
  for (const item of obstacles)
    for (const building of source.buildings ?? []) {
      const z = building.z ?? 0;
      if (overlaps(item, building) && item.z + item.height > z && item.z < z + building.height)
        issues.push({
          type: 'protected-building-overlap',
          itemId: item.id,
          buildingId: building.id,
        });
    }
  return issues;
}

/** Return scene amendments without changing a source record or inventing service success. */
export function createNightCrossingWorld(source) {
  if (!source?.sites || !source.roads || !source.buildings)
    throw new TypeError('Night Crossing needs the authored city.');
  const required = ['pier-berth', 'dockside-rooms', 'fairground'];
  for (const key of required)
    if (!source.sites.some((s) => s.id === FIRST_ARC_SCENES[key].anchor.id))
      throw new Error(`Missing Night Crossing anchor ${key}.`);
  if (source.locations?.some((l) => l.id === DOCKSIDE_PORTAL.locationId))
    throw new Error('Night Crossing amendments have already been installed.');
  const roads = [],
    decks = [],
    obstacles = [];
  addDeck(decks, 'arrival-passenger-apron', 1678, 750, 90, 130, 4);
  addDeck(decks, 'arrival-ferry-deck', 1818, 748, 62, 152, 6);
  addRoad(roads, 'arrival-gangway', point(1768, 800, 4), point(1818, 800, 6), 20);
  addRoad(roads, 'arrival-ferry-landing', point(1818, 800, 6), point(1830, 800, 6), 20);
  addRoad(roads, 'arrival-ferry-walk', point(1830, 748, 6), point(1830, 900, 6), 24);
  addRoad(roads, 'arrival-apron-walk', point(1768, 800, 4), point(1690, 800, 4), 24);
  addRoad(roads, 'arrival-apron-spine', point(1690, 800, 4), point(1690, 880, 4), 24);
  addRoad(roads, 'arrival-apron-ramp', point(1690, 880, 4), point(1690, 908), 20);
  addRoad(roads, 'arrival-driver-ramp', point(1707.5, 880, 4), point(1707.5, 908), 20);
  addRoad(roads, 'arrival-driver-boardwalk', point(1707.5, 908), point(1707.5, 934), 20, ['foot'], {
    bridge: true,
  });
  addRoad(roads, 'arrival-ramp-landing', point(1690, 908), point(1690, 912), 20);
  addRoad(roads, 'arrival-land-walk', point(1431, 912), point(1690, 912), 20);
  addRoad(roads, 'arrival-yard-walk', point(1431, 828), point(1431, 912), 20);
  addRoad(roads, 'arrival-taxi-approach', point(1690, 960), point(1690, 900), 28, ['car', 'foot'], {
    reservedFor: 'arc-arrival-taxi',
    traffic: false,
  });
  addRoad(roads, 'dockside-parking-drive', point(180, 310), point(147, 310), 28, ['car', 'foot'], {
    kind: 'campaign-parking',
    traffic: false,
  });
  addRoad(roads, 'dockside-parking-spine', point(147, 250), point(147, 330), 26, ['car', 'foot'], {
    kind: 'campaign-parking',
    traffic: false,
  });
  obstacles.push(
    obstacle('arrival-ferry-hull', 1830, 748, 50, 152, -4, 10, 'ferry-hull', '#46636a'),
    obstacle('arrival-ferry-port-north', 1818, 748, 12, 40, -4, 10, 'ferry-hull', '#46636a'),
    obstacle('arrival-ferry-port-south', 1818, 812, 12, 88, -4, 10, 'ferry-hull', '#46636a'),
    obstacle('arrival-ferry-cabin', 1846, 782, 30, 72, 6, 28, 'ferry-cabin', '#b0b4a0'),
    obstacle('arrival-apron-rail-north', 1678, 748, 90, 2, 4, 11, 'mooring-rail', '#596f68'),
    obstacle('arrival-apron-rail-east-north', 1766, 750, 2, 36, 4, 11, 'mooring-rail', '#596f68'),
    obstacle('arrival-apron-rail-east-south', 1766, 814, 2, 66, 4, 11, 'mooring-rail', '#596f68'),
    obstacle('arrival-safety-locker', 1744, 850, 16, 22, 4, 18, 'safety-locker', '#8b9b7b'),
    obstacle('dockside-canopy-post-a', 130, 240, 3, 3, 0, 40, 'canopy-post', '#64746a'),
    obstacle('dockside-canopy-post-b', 130, 337, 3, 3, 0, 40, 'canopy-post', '#64746a'),
    obstacle('dockside-canopy-roof', 124, 240, 36, 100, 40, 3, 'canopy-roof', '#708176'),
    obstacle('muster-sign-post', 129, 1039, 2, 2, 0, 28, 'muster-post', '#728170'),
  );
  const dressing = {
    apron: { id: 'arrival-passenger-apron', x: 1678, y: 750, w: 90, h: 130, z: 4 },
    gangway: {
      id: 'arrival-gangway',
      from: point(1768, 800, 4),
      to: point(1818, 800, 6),
      width: 20,
    },
    ferry: {
      id: 'relief-ferry',
      deck: decks[1],
      cabin: obstacles.find((o) => o.id === 'arrival-ferry-cabin'),
    },
    canopy: { id: 'dockside-canopy', x: 124, y: 240, w: 36, h: 100, z: 40, height: 3 },
    door: { id: 'dockside-front-door', x: 116.05, y: 308, z: 0, width: 24, height: 32 },
    muster: { id: 'arrival-muster-board', x: 130, y: 1040, z: 0, height: 28 },
    obstacleIds: obstacles.map((o) => o.id),
  };
  const world = {
    ...source,
    locations: [
      ...(source.locations ?? []),
      {
        id: 'dockside-rooms',
        name: 'Dockside Rooms',
        type: 'home',
        x: 129,
        y: 308,
        z: 0,
        description: 'Co-op rooms · shared food, saved progress and six-hour rest',
        siteId: 'LL-CITY-LOC054',
      },
    ],
    roads: [...source.roads, ...roads],
    decks: [...(source.decks ?? []), ...decks],
    obstacles: [...(source.obstacles ?? []), ...obstacles],
    campaignDressing: dressing,
    navigationRevision: (source.navigationRevision ?? 0) + 1,
  };
  const issues = obstructionReport(source, obstacles),
    terrain = createTerrain(world);
  const clear = (p) => !terrain.isBlocked(p.x, p.y, 7, p.z);
  for (const path of Object.values(ROUTES))
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i],
        count = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2);
      for (let j = 0; j <= count; j++) {
        const t = j / count,
          p = point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
        if (!clear(p)) {
          issues.push({ type: 'foot-access-blocked', point: p });
          break;
        }
      }
    }
  const hookMap = Object.fromEntries(
    DOCKSIDE_ROOM_LAYOUT.hooks.map((h) => [h.id, { ...h, z: 0, sceneId: 'dockside-rooms' }]),
  );
  const bindings = {
    'pier-berth': {
      ready: issues.length === 0,
      sceneId: null,
      siteId: 'LL-CITY-LOC137',
      target: point(1696, 842, 4, { radius: 24 }),
      playerSpawn: point(1830, 814, 6, { groundZ: 6, angle: Math.PI }),
      reunionTarget: point(1696, 842, 4, { radius: 24 }),
      actorSpawns: {
        felix: point(1829, 858, 6, { id: 'LL-CHAR-002', groundZ: 6, angle: Math.PI }),
        workers: [
          point(1829, 882, 6, { id: 'arc-ferry-worker', groundZ: 6, angle: Math.PI }),
          point(1702, 772, 4, { id: 'arc-berth-worker', groundZ: 4, angle: Math.PI / 2 }),
        ],
      },
      taxiSpawn: point(1690, 920, 0, {
        id: 'arc-arrival-taxi',
        spec: 'taxi',
        angle: Math.PI / 2,
        ownership: 'cooperative',
        seats: 4,
      }),
      taxiCurb: point(1690, 920, 0, { angle: Math.PI / 2, radius: 24 }),
      gangway: ROUTES.ferryToApron,
      apronWaypoints: ROUTES.apronToTaxi,
      driverWaypoints: ROUTES.driverToTaxi,
      siteAccessPath: ROUTES.siteToApron,
      duffel: SAMPLE_PROPS['arrival-duffel'],
      duffelPropId: 'arrival-duffel',
    },
    fairground: {
      ready: true,
      sceneId: null,
      siteId: 'LL-CITY-LOC131',
      target: point(147, 1088, 0, { radius: 22 }),
      stop: { x: 135, y: 1065, w: 24, h: 46, z: 0, angle: -Math.PI / 2, maxSpeed: 5, seconds: 2 },
      musterSign: point(130, 1040),
    },
    dispatch: {
      ready: true,
      sceneId: null,
      locationId: 'felix-office',
      roomId: 'voss-dispatch',
      target: point(440, 748, 0, { radius: 25 }),
      stop: { x: 424, y: 735, w: 32, h: 26, z: 0, angle: 0, maxSpeed: 5, seconds: 1 },
      entry: point(458, 700),
    },
    'dockside-rooms': {
      ready: true,
      sceneId: 'dockside-rooms',
      siteId: 'LL-CITY-LOC054',
      roomId: 'dockside-rooms',
      portalId: DOCKSIDE_PORTAL.id,
      target: point(122, 184, 0, { radius: 26 }),
      entry: point(129, 308),
      playerSpawn: point(122, 184, 0, { angle: -Math.PI / 2 }),
      parkingBay: {
        id: 'dockside-coop-bay',
        x: 135,
        y: 250,
        w: 24,
        h: 80,
        z: 0,
        angle: -Math.PI / 2,
        angleTolerance: Math.PI / 4,
        spaces: [
          { id: 'dockside-coop-bay-a', x: 135, y: 250, w: 24, h: 40 },
          { id: 'dockside-coop-bay-b', x: 135, y: 290, w: 24, h: 40 },
        ],
        exitMarks: [point(129, 270), point(129, 310)],
        preferredExitSide: 'left',
      },
      actorSpawns: {
        nadia: point(78, 128, 0, {
          id: 'LL-CHAR-008',
          sceneId: 'dockside-rooms',
          angle: Math.PI / 2,
        }),
      },
      felixTarget: point(144, 134, 0, { id: 'LL-CHAR-002', sceneId: 'dockside-rooms', radius: 18 }),
      hooks: {
        food: hookMap['dockside-kettle'],
        save: hookMap['dockside-save'],
        rest: hookMap['dockside-bed'],
        wardrobe: hookMap['dockside-wardrobe'],
        evidence: hookMap['dockside-ledger'],
        key: hookMap['dockside-key'],
      },
      keyId: 'dockside-tenancy',
      evidenceId: 'co-op-arrears',
      duffelDrop: point(30, 134, 0, { sceneId: 'dockside-rooms' }),
    },
  };
  for (const [id, binding] of Object.entries(bindings))
    if (binding.sceneId === null && !clear(binding.target)) {
      binding.ready = false;
      issues.push({ type: 'scene-target-blocked', sceneId: id, point: binding.target });
    }
  for (const p of [
    bindings['pier-berth'].taxiSpawn,
    bindings.fairground.target,
    bindings.dispatch.target,
    ...bindings['dockside-rooms'].parkingBay.spaces.map((s) => point(s.x + s.w / 2, s.y + s.h / 2)),
  ])
    if (terrain.isBlocked(p.x, p.y, 12, p.z)) issues.push({ type: 'car-stop-blocked', point: p });
  if (issues.length) for (const binding of Object.values(bindings)) binding.ready = false;
  world.campaignSceneBindings = bindings;
  return {
    world,
    bindings,
    report: {
      status: 'authored-geometry',
      ready: issues.length === 0,
      issues,
      protectedGeometryPreserved: true,
      newRoadIds: roads.map((r) => r.id),
      newDeckIds: decks.map((d) => d.id),
      newObstacleIds: obstacles.map((o) => o.id),
      requiredHandlers: [
        'canonical companions/workers',
        'single scene-prop pose ownership',
        'shelter food/save/rest/wardrobe/evidence',
        'cinematic actor/camera paths',
        'parking persistence',
      ],
    },
  };
}

/** A present registry is authoritative: an absent/moved bag never creates a second default bag. */
export function nightCrossingProps(state, sceneId = null) {
  const registry =
    state.campaignRuntime?.sceneProps ??
    (state.campaignRuntime && Object.hasOwn(state.campaignRuntime, 'sceneProps')
      ? {}
      : SAMPLE_PROPS);
  return Object.values(registry).filter(
    (p) =>
      p?.visible !== false && p.sceneId === sceneId && [p.x, p.y, p.z ?? 0].every(Number.isFinite),
  );
}
function sceneRect(r, g, x, y, w, h, z, color) {
  globalThis.My3D2dge.px.poly(
    g,
    [r.w(x, y, z), r.w(x + w, y, z), r.w(x + w, y + h, z), r.w(x, y + h, z)],
    color,
  );
}
function sceneLine(r, g, a, b, color, width = 1) {
  globalThis.My3D2dge.px.line(g, ...r.w(...a), ...r.w(...b), color, width);
}
function projectedBounds(r, item) {
  const points = [];
  for (const x of [item.x, item.x + item.w])
    for (const y of [item.y, item.y + item.h])
      for (const z of [item.z ?? 0, (item.z ?? 0) + (item.height ?? 0)]) points.push(r.w(x, y, z));
  return [
    Math.min(...points.map((p) => p[0])) - 3,
    Math.min(...points.map((p) => p[1])) - 3,
    Math.max(...points.map((p) => p[0])) + 3,
    Math.max(...points.map((p) => p[1])) + 3,
  ];
}
function sceneVisible(r, item) {
  const b = projectedBounds(r, item);
  return b[2] >= 0 && b[0] < r.bw && b[3] >= 0 && b[1] < r.bh;
}
function queueBox(r, item, details, color = item.color) {
  if (!sceneVisible(r, item)) return false;
  const z = item.z ?? 0;
  r.queue(
    item.x + item.w / 2,
    item.y + item.h / 2,
    z,
    (g) => {
      const alpha = g.globalAlpha;
      if (!g._info && !g._cover) g.globalAlpha *= item.opacity ?? 1;
      r.box(
        g,
        item.x,
        item.y,
        z,
        item.x + item.w,
        item.y + item.h,
        z + item.height,
        globalThis.My3D2dge.shade(color, 0.12),
        color,
      );
      details?.(g);
      g.globalAlpha = alpha;
    },
    { occluder: (item.opacity ?? 1) === 1, box: projectedBounds(r, item) },
  );
  return true;
}
export function drawNightCrossingProps(r, state, sceneId = null) {
  let count = 0;
  for (const p of nightCrossingProps(state, sceneId)) {
    if (p.kind !== 'duffel') continue;
    const item = {
      ...p,
      x: p.x - (p.w ?? 10) / 2,
      y: p.y - (p.h ?? 8) / 2,
      w: p.w ?? 10,
      h: p.h ?? 8,
      height: p.height ?? 8,
      color: p.color ?? '#806f50',
    };
    if (
      queueBox(r, item, (g) => {
        const z = (p.z ?? 0) + item.height;
        sceneLine(r, g, [p.x - 2, p.y - 2, z], [p.x - 2, p.y + 2, z], '#c2b18b', 2);
        sceneLine(r, g, [p.x + 2, p.y - 2, z], [p.x + 2, p.y + 2, z], '#c2b18b', 2);
        sceneLine(r, g, [p.x - 2, p.y, z + 1], [p.x + 2, p.y, z + 1], '#3c4c40', 2);
      })
    )
      count++;
  }
  return count;
}

/** Native engine scenery. Ground is a separate phase so every real deck precedes actors. */
export function createNightCrossingRenderer(game, world) {
  if (!world.campaignDressing)
    throw new Error('Night Crossing geometry must be installed before its renderer.');
  const dressing = world.campaignDressing,
    items = world.obstacles.filter((o) => dressing.obstacleIds.includes(o.id));
  let disposed = false;
  const stats = { frames: 0, groundPieces: 0, structures: 0, props: 0 };
  const active = (state) => !state.interior?.active;
  function check() {
    if (disposed) throw new Error('Night Crossing renderer is disposed.');
  }
  return {
    stats,
    drawGround(r, state) {
      check();
      stats.groundPieces = 0;
      if (!active(state)) return false;
      for (const deck of [dressing.apron, dressing.ferry.deck]) {
        if (!sceneVisible(r, { ...deck, height: 1 })) continue;
        sceneRect(
          r,
          r.ctx,
          deck.x,
          deck.y,
          deck.w,
          deck.h,
          deck.z,
          deck.id.includes('ferry') ? '#8b947d' : '#777f6b',
        );
        for (let y = deck.y + 6; y < deck.y + deck.h; y += 8)
          sceneLine(r, r.ctx, [deck.x, y, deck.z], [deck.x + deck.w, y, deck.z], '#647561');
        if (deck.id.includes('apron'))
          for (let y = deck.y + 12; y < deck.y + deck.h; y += 20)
            sceneRect(r, r.ctx, deck.x + 7, y, 3, 9, deck.z + 0.01, '#c4b984');
        stats.groundPieces++;
      }
      const gangway = dressing.gangway,
        a = gangway.from,
        b = gangway.to;
      if (sceneVisible(r, { x: a.x, y: a.y - 10, w: b.x - a.x, h: 20, z: a.z, height: 2 })) {
        globalThis.My3D2dge.px.poly(
          r.ctx,
          [
            r.w(a.x, a.y - 10, a.z),
            r.w(b.x, b.y - 10, b.z),
            r.w(b.x, b.y + 10, b.z),
            r.w(a.x, a.y + 10, a.z),
          ],
          '#a3a78b',
        );
        for (let x = a.x; x <= b.x; x += 5) {
          const z = a.z + ((b.z - a.z) * (x - a.x)) / (b.x - a.x);
          sceneLine(r, r.ctx, [x, a.y - 10, z], [x, a.y + 10, z], '#66766a');
        }
        stats.groundPieces++;
      }
      const bay = world.campaignSceneBindings['dockside-rooms'].parkingBay;
      if (sceneVisible(r, { ...bay, height: 1 }))
        for (const s of bay.spaces) {
          for (const y of [s.y + 2, s.y + s.h - 2])
            sceneLine(r, r.ctx, [s.x, y, 0], [s.x + s.w, y, 0], '#b8bd89', 2);
          sceneLine(r, r.ctx, [s.x, s.y + 2, 0], [s.x, s.y + s.h - 2, 0], '#b8bd89');
          stats.groundPieces++;
        }
      return true;
    },
    draw(r, state) {
      check();
      if (!active(state)) return false;
      stats.frames++;
      stats.structures = 0;
      for (const sourceItem of items) {
        const sheltered =
          sourceItem.type === 'canopy-roof' &&
          [state.player, ...(state.vehicles ?? [])].some(
            (body) =>
              body &&
              body.z < sourceItem.z &&
              body.x >= sourceItem.x &&
              body.x <= sourceItem.x + sourceItem.w &&
              body.y >= sourceItem.y &&
              body.y <= sourceItem.y + sourceItem.h,
          );
        const item = sheltered ? { ...sourceItem, opacity: 0.35 } : sourceItem;
        // The floor phase owns deck tops: a giant queued hull top would erase cabin and passengers.
        if (item.type === 'ferry-hull') {
          if (!sceneVisible(r, item)) continue;
          r.queue(item.x + item.w / 2, item.y + item.h / 2, item.z, (g) => {
            const E = globalThis.My3D2dge,
              z = item.z + item.height;
            for (const [a, b] of [
              [
                [item.x, item.y],
                [item.x + item.w, item.y],
              ],
              [
                [item.x + item.w, item.y],
                [item.x + item.w, item.y + item.h],
              ],
              [
                [item.x + item.w, item.y + item.h],
                [item.x, item.y + item.h],
              ],
              [
                [item.x, item.y + item.h],
                [item.x, item.y],
              ],
            ])
              E.px.poly(
                g,
                [r.w(...a, item.z), r.w(...b, item.z), r.w(...b, z), r.w(...a, z)],
                item.color,
              );
            sceneLine(
              r,
              g,
              [item.x, item.y + item.h, z - 3],
              [item.x + item.w, item.y + item.h, z - 3],
              '#b7c3a0',
              2,
            );
          });
          stats.structures++;
          continue;
        }
        const drawn = queueBox(r, item, (g) => {
          const E = globalThis.My3D2dge,
            z = item.z + item.height;
          if (item.type === 'ferry-cabin') {
            for (let y = item.y + 8; y < item.y + item.h - 8; y += 16) {
              E.px.poly(
                g,
                [
                  r.w(item.x - 0.01, y, item.z + 10),
                  r.w(item.x - 0.01, y + 10, item.z + 10),
                  r.w(item.x - 0.01, y + 10, item.z + 21),
                  r.w(item.x - 0.01, y, item.z + 21),
                ],
                '#304f53',
              );
              sceneLine(
                r,
                g,
                [item.x - 0.02, y, item.z + 20],
                [item.x - 0.02, y + 10, item.z + 20],
                '#97b3a0',
              );
            }
            sceneRect(r, g, item.x + 7, item.y + 16, 12, 18, z + 0.01, '#6b817b');
            E.font.text(
              g,
              'RELIEF',
              ...r.w(item.x + item.w / 2, item.y + item.h / 2, z + 0.1),
              '#d9d3a8',
              { align: 'center', font: 'tiny', outline: false },
            );
          } else if (item.type === 'canopy-roof')
            for (let y = item.y + 8; y < item.y + item.h; y += 12)
              sceneLine(r, g, [item.x, y, z + 0.1], [item.x + item.w, y, z + 0.1], '#8d9c83');
          else if (item.type === 'safety-locker') {
            sceneRect(r, g, item.x + 4, item.y + 4, 8, 14, z + 0.1, '#c4b783');
            const p = r.w(item.x + 8, item.y + 12, z + 0.2);
            E.px.disc(g, p[0], p[1], 4, '#d7b174');
            E.px.disc(g, p[0], p[1], 2, '#677a68');
          } else if (item.type === 'muster-post') {
            const p = r.w(130, 1040, 26);
            E.px.rect(g, p[0] - 23, p[1] - 10, 46, 17, '#536b5d');
            E.font.text(g, 'CO-OP', p[0], p[1] - 8, '#d4d3a7', {
              align: 'center',
              font: 'tiny',
              outline: false,
            });
            E.font.text(g, 'MUSTER', p[0], p[1], '#b5c9a8', {
              align: 'center',
              font: 'tiny',
              outline: false,
            });
          }
        });
        if (drawn) stats.structures++;
      }
      // The original building remains solid. Its authored portal is depicted on its east facade.
      const d = dressing.door;
      if (
        sceneVisible(r, {
          x: d.x,
          y: d.y - d.width / 2,
          w: 1,
          h: d.width,
          z: d.z,
          height: d.height,
        })
      )
        r.queue(d.x, d.y, d.z, (g) => {
          const E = globalThis.My3D2dge;
          E.px.poly(
            g,
            [
              r.w(d.x, d.y - 12, 0),
              r.w(d.x, d.y + 12, 0),
              r.w(d.x, d.y + 12, 32),
              r.w(d.x, d.y - 12, 32),
            ],
            '#394f42',
          );
          sceneLine(r, g, [d.x + 0.1, d.y + 7, 12], [d.x + 0.1, d.y + 7, 16], '#d8c28d', 2);
          const p = r.w(d.x + 0.1, d.y, 39);
          E.font.text(g, 'DOCKSIDE', p[0], p[1] - 8, '#d4d2a8', {
            align: 'center',
            font: 'tiny',
            outline: '#31473a',
          });
        });
      stats.props = drawNightCrossingProps(r, state, null);
      return true;
    },
    dispose() {
      disposed = true;
    },
  };
}
