/** Candidate LL-ST-003 physical bindings. No actors, saves or campaign facts are changed. */
import { FIRST_ARC_SCENES, FIRST_ARC_MISSIONS } from './first-arc.js';
import { OUTFITS } from '../wardrobe.js';
import { createTerrain } from '../terrain.js';
import { createSpatialIndex } from '../spatial-index.js';
import { checkLateMeterVehicleSweep } from './late-meter-scenes.js';
const freeze = (value) => {
  if (value && typeof value === 'object') Object.values(value).forEach(freeze);
  return Object.freeze(value);
};
export const TWO_SEATS_WRIST_BANDAGE = freeze({
  id: 'dax-wrist-bandage',
  color: '#c9c6a8',
  attachment: 'right-wrist',
  savedOnActor: true,
});
const p = (x, y, z = 0, extra = {}) => ({ x, y, z, ...extra });
const volume = (id, x, y, w, h, height, type, color) => ({
  id,
  x,
  y,
  w,
  h,
  height,
  type,
  color,
  health: 100,
});
const room = (id, name, width, height, doorX, doorWidth, props, hooks) => ({
  id,
  name,
  width,
  height,
  floorZ: 0,
  ceilingZ: 72,
  floorRegions: [
    {
      id: `${id}-main-floor`,
      x: 10,
      y: 10,
      w: width - 20,
      h: height - 20,
      material: id === 'pier-goods' ? 'worn-linoleum' : 'timber',
    },
  ],
  palette: { floor: '#777568', wall: '#7c8879', light: '#d9d0a5' },
  spawn: p(doorX + doorWidth / 2, height - 30, 0, { angle: -Math.PI / 2 }),
  walls: [
    volume(`${id}:west`, 0, 0, 10, height, 72, 'wall', '#778471'),
    volume(`${id}:east`, width - 10, 0, 10, height, 72, 'wall', '#778471'),
    volume(`${id}:north`, 0, 0, width, 10, 72, 'wall', '#778471'),
    volume(`${id}:south-west`, 0, height - 10, doorX, 10, 72, 'wall', '#778471'),
    volume(
      `${id}:south-east`,
      doorX + doorWidth,
      height - 10,
      width - doorX - doorWidth,
      10,
      72,
      'wall',
      '#778471',
    ),
  ],
  doors: [
    {
      id: 'front-door',
      x: doorX,
      y: height - 10,
      w: doorWidth,
      h: 10,
      height: 68,
      open: true,
      locked: false,
      exit: true,
      edge: 'south',
      vehicleAllowed: false,
    },
  ],
  props,
  hooks,
  actors: [],
  lights: [
    { x: width * 0.3, y: height * 0.45, z: 48, color: '#d8cca2' },
    { x: width * 0.7, y: height * 0.7, z: 48, color: '#bac7ad' },
  ],
});

export const TWO_SEATS_ROOMS = freeze({
  'tess-flat': room(
    'tess-flat',
    'Tess’s Kiln Row Flat',
    220,
    200,
    82,
    56,
    [
      volume('tess-couch', 24, 48, 64, 24, 16, 'sofa', '#79857b'),
      volume('tess-table', 104, 66, 44, 28, 18, 'table', '#8b8064'),
      volume('tess-bed', 144, 22, 54, 30, 18, 'bed', '#8c8f7f'),
      volume('tess-wardrobe', 166, 124, 32, 42, 48, 'wardrobe', '#777d6c'),
      volume('unopened-survey-kit', 28, 106, 24, 16, 10, 'closed-kit', '#7e8872'),
    ],
    [
      {
        id: 'tess-front-hall',
        type: 'campaign-contact',
        service: 'tess-contact',
        x: 110,
        y: 164,
        radius: 22,
        requiresExplicitResult: true,
        prompt: 'Speak with Tess at her doorway',
      },
    ],
  ),
  'pier-goods': room(
    'pier-goods',
    'Pier Goods — Old Quay',
    260,
    220,
    104,
    56,
    [
      volume('bea-counter', 18, 38, 100, 22, 18, 'counter', '#8e8769'),
      {
        ...volume('slate-display', 22, 98, 48, 18, 40, 'clothing-rack', '#65756e'),
        outfitId: 'slate-work-jacket',
      },
      {
        ...volume('ochre-display', 104, 98, 48, 18, 40, 'clothing-rack', '#65756e'),
        outfitId: 'ochre-rain-shell',
      },
      {
        ...volume('navy-display', 186, 132, 48, 18, 40, 'clothing-rack', '#65756e'),
        outfitId: 'navy-coveralls',
      },
      volume('changing-left', 194, 22, 8, 76, 58, 'partition', '#88947c'),
      volume('changing-back', 194, 22, 52, 8, 58, 'partition', '#88947c'),
      volume('changing-right', 238, 22, 8, 76, 58, 'partition', '#88947c'),
    ],
    [
      {
        id: 'pier-goods-outfits',
        type: 'clothing-service',
        service: 'pier-goods-selector',
        x: 132,
        y: 166,
        radius: 22,
        requiresExplicitResult: true,
        prompt: 'Choose an original work outfit at Pier Goods',
      },
    ],
  ),
});

export const TWO_SEATS_OUTFITS = freeze(
  Object.fromEntries(
    ['slate-work-jacket', 'ochre-rain-shell', 'navy-coveralls'].map((id) => [id, OUTFITS[id]]),
  ),
);

export const TWO_SEATS_APPEARANCES = freeze({
  tess: {
    id: 'tess-survey-raincoat',
    version: 1,
    build: 'heroic',
    size: 0.78,
    outfit: 'coat',
    sleeves: 'long',
    hat: null,
    colors: {
      skin: '#b99b80',
      cloth: '#a5aa82',
      coat: '#69775d',
      pants: '#3c4c48',
      boot: '#343b31',
      hair: '#302d27',
      trim: '#d5be8a',
    },
    marks: [{ id: 'survey-camera-strap', kind: 'diagonal-strap', color: '#474e3d' }],
  },
  dax: {
    id: 'dax-collector-work-jacket',
    version: 1,
    build: 'heroic',
    size: 0.78,
    outfit: 'coat',
    sleeves: 'long',
    hat: null,
    colors: {
      skin: '#a78165',
      cloth: '#9b967d',
      coat: '#635a4c',
      pants: '#323d38',
      boot: '#252d26',
      hair: '#352b24',
      trim: '#c1b78f',
    },
    marks: [{ id: 'dax-recovery-crew-tabs', kind: 'collar-tabs', color: '#b4a56c' }],
  },
  pel: {
    id: 'pel-collector-canvas-jacket',
    version: 1,
    build: 'heroic',
    size: 0.78,
    outfit: 'coat',
    sleeves: 'long',
    hat: 'cap',
    colors: {
      skin: '#906d55',
      cloth: '#aaa38a',
      coat: '#4b605b',
      pants: '#343e3d',
      boot: '#242e29',
      hair: '#292821',
      trim: '#b8b18d',
    },
    marks: [{ id: 'pel-canvas-cuffs', kind: 'cuffs', color: '#9b9c7f' }],
  },
  bea: {
    id: 'bea-pier-goods-apron',
    version: 1,
    build: 'heroic',
    size: 0.78,
    outfit: 'shirt',
    sleeves: 'long',
    hat: null,
    colors: {
      skin: '#ac876e',
      cloth: '#8d9a8b',
      coat: '#8d9a8b',
      pants: '#3b4b53',
      boot: '#303b34',
      hair: '#504739',
      trim: '#d0bf8c',
    },
    marks: [
      { id: 'pier-goods-apron', kind: 'apron', color: '#526a7b' },
      { id: 'bea-name-card', kind: 'name-card', text: 'BEA' },
    ],
  },
});

export const TWO_SEATS_CAPABILITY_GAPS = freeze([
  {
    id: 'named-blade-combat',
    needs:
      'Actual canonical Dax knife attacks, guarded disarm and one physical weapon drop; same persistent body in combat/companions.',
  },
  {
    id: 'wrist-injury-and-retreat',
    needs:
      'Observe committed right-hand disarm; save finite wrist injury and native bandage; both living collectors walk out via the real door before retreat credit.',
  },
  {
    id: 'civilian-harm',
    needs:
      'Real player-owned harm to Felix/workers, health and death, with no blanket immunity or lifecycle health reset.',
  },
  {
    id: 'nadia-itinerary',
    needs:
      'Existing Nadia walks from her actual saved room to Boardwalk; no replacement curb body or offscreen relocation.',
  },
  {
    id: 'ordered-passenger-delivery',
    needs:
      'Two live distinct occupants in a real four-seat car; Tess physically exits and walks through her portal first, Nadia then reaches Dispatch.',
  },
  {
    id: 'store-felix-presence',
    needs:
      'An actual post-dropoff Felix boarding/walk itinerary or genuine perceived channel for his authored store line; no teleport to the shop.',
  },
  {
    id: 'three-original-outfits',
    needs:
      'Integrate and render the exact three authored outfits, owned preview/equip state and paid later prices.',
  },
  {
    id: 'single-use-voucher',
    needs:
      'One mission-owned cooperative voucher pays for one selected listed outfit; transactional consume/equip/checkpoint/save, no duplicate issuance.',
  },
  {
    id: 'contact-boundaries',
    needs:
      'Add Tess contact from actual delivery; no automatic date/romance flag, preserve later explicit invitation/consent choices.',
  },
  {
    id: 'closed-station-spur',
    needs:
      'Build a genuinely unavailable lift/stair spur and readable alternate-ramp signage without blocking the sole existing operating station path.',
  },
  {
    id: 'western-storefront-visibility',
    needs:
      'Make the retained western Pier Goods doorway readable in native camera/cutaway, with no moved catalogue entrance.',
  },
  {
    id: 'future-breakable-storefront',
    needs:
      'A saved actual glass panel/opening, shards and physical projectile/throw interactions; a painted crack over a solid host wall is insufficient.',
  },
]);

function circleRect(x, y, radius, b) {
  return (
    Math.hypot(
      x - Math.max(b.x, Math.min(b.x + b.w, x)),
      y - Math.max(b.y, Math.min(b.y + b.h, y)),
    ) < radius
  );
}
function fullBodyPath(world, terrain, path, radius = 7, height = 30) {
  const solids = createSpatialIndex([
    ...(world.buildings ?? []),
    ...(world.obstacles ?? []),
    ...(world.decks ?? []),
  ]);
  const issues = [];
  const elevated = createSpatialIndex(
    world.roads.filter(
      (r) =>
        Math.max(r.z1 ?? r.z ?? 0, r.z2 ?? r.z ?? 0) > 0 &&
        (r.bridge || r.access?.includes('rail') || r.kind?.startsWith('station-')),
    ),
    {
      getBounds: (r) => ({
        x: Math.min(r.x1, r.x2) - r.width / 2,
        y: Math.min(r.y1, r.y2) - r.width / 2,
        w: Math.abs(r.x2 - r.x1) + r.width,
        h: Math.abs(r.y2 - r.y1) + r.width,
      }),
    },
  );
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      length = Math.hypot(b.x - a.x, b.y - a.y),
      steps = Math.max(1, Math.ceil(length / 2));
    for (let j = 0; j < steps; j++) {
      const t = (j + 0.5) / steps,
        z = a.z + (b.z - a.z) * t,
        x = a.x + (b.x - a.x) * t,
        y = a.y + (b.y - a.y) * t,
        envelope = radius + length / steps / 2,
        blocked =
          terrain.isBlocked(x, y, envelope, z) ||
          solids
            .queryRadius(x, y, envelope)
            .some(
              (s) =>
                z < (s.z ?? 0) + (s.height ?? 0) &&
                z + height > (s.z ?? 0) &&
                circleRect(x, y, envelope, s),
            ) ||
          elevated.queryRadius(x, y, envelope).some((r) => {
            const dx = r.x2 - r.x1,
              dy = r.y2 - r.y1,
              len = Math.hypot(dx, dy),
              t = Math.max(0, Math.min(1, ((x - r.x1) * dx + (y - r.y1) * dy) / (len * len))),
              reach = (envelope + r.width / 2) / len,
              a = r.z1 ?? r.z ?? 0,
              delta = (r.z2 ?? r.z ?? 0) - a,
              z0 = a + delta * Math.max(0, t - reach),
              z1 = a + delta * Math.min(1, t + reach);
            return (
              Math.hypot(x - r.x1 - dx * t, y - r.y1 - dy * t) < envelope + r.width / 2 &&
              z < Math.max(z0, z1) + 1.5 &&
              z + height > Math.min(z0, z1)
            );
          });
      if (blocked) {
        issues.push({ leg: i - 1, x, y, z, envelope });
        break;
      }
    }
  }
  return {
    ready: !issues.length,
    issues,
    method:
      'Continuous conservative capsule cover: midpoint disks contain each complete subsegment; full vertical body intervals include thin elevated obstacles.',
  };
}

export function createTwoSeatsScenePlan(source) {
  const mission = FIRST_ARC_MISSIONS.find((m) => m.id === 'LL-ST-003');
  const locate = (key) => {
    const anchor = FIRST_ARC_SCENES[key].anchor;
    return anchor.kind === 'station'
      ? source.transit.stations.find((s) => s.id === anchor.id)
      : source.sites.find((s) => s.id === anchor.id);
  };
  const station = locate('boardwalk-station'),
    tess = locate('tess-flat'),
    shop = locate('pier-goods');
  if (!station || !tess || !shop || !source.campaignSceneBindings?.dispatch)
    throw Error('Two Seats Open requires its actual original station, site and Dispatch anchors.');
  const pose = (x, y, angle) => p(x, y, 0, { angle });
  const stationApproach = [pose(380, 180, Math.PI), pose(364, 180, Math.PI)];
  for (let i = 1; i <= 18; i++) {
    const theta = Math.PI / 2 + (i * Math.PI) / 36;
    stationApproach.push(
      pose(364 + 24 * Math.cos(theta), 156 + 24 * Math.sin(theta), theta + Math.PI / 2),
    );
  }
  stationApproach.push(pose(340, 113, -Math.PI / 2));
  const stationRoads = stationApproach.slice(1).map((b, index) => {
    const a = stationApproach[index];
    return {
      id: `two-seats-boardwalk-curb-${index}`,
      name: 'Boardwalk street pickup',
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      z: 0,
      z1: 0,
      z2: 0,
      width: 28,
      access: ['car', 'foot'],
      kind: 'campaign-curb',
      ambient: false,
    };
  });
  const world = { ...source, roads: [...source.roads, ...stationRoads] };
  const bindings = {
    dispatch: {
      ...source.campaignSceneBindings.dispatch,
      encounter: {
        roomId: 'voss-dispatch',
        existingCast: ['LL-CHAR-002'],
        createOnlyIfAbsent: ['LL-ARC-DAX', 'LL-ARC-PEL'],
        dax: p(180, 40, 0, {
          sceneId: 'voss-dispatch',
          id: 'LL-ARC-DAX',
          angle: Math.PI,
          weapon: 'knife',
          authoredRole: 'utility-blade',
        }),
        pel: p(196, 108, 0, {
          sceneId: 'voss-dispatch',
          id: 'LL-ARC-PEL',
          angle: Math.PI / 2,
          weapon: 'unarmed',
        }),
        workers: [
          p(46, 132, 0, { id: 'dispatch-worker-a', sceneId: 'voss-dispatch' }),
          p(104, 132, 0, { id: 'dispatch-worker-b', sceneId: 'voss-dispatch' }),
        ],
        playerApproach: [p(168, 198), p(200, 130), p(200, 40)],
        daxRetreat: [p(180, 40), p(200, 40), p(200, 130), p(168, 198), p(168, 224), p(168, 244)],
        pelRetreat: [p(196, 108), p(196, 140), p(168, 198), p(168, 224), p(168, 244)],
        exteriorRetreat: [p(458, 700), p(440, 700), p(440, 640)],
        injury: {
          id: 'dax-right-wrist-disarm',
          actorId: 'LL-ARC-DAX',
          hand: 'right',
          requiresCommittedDisarm: true,
          bandage: TWO_SEATS_WRIST_BANDAGE,
          actualRetreatRequired: ['LL-ARC-DAX', 'LL-ARC-PEL'],
        },
      },
    },
    'boardwalk-station': {
      stationId: station.id,
      catalogueAnchor: { ...station.entrances[0] },
      retainOperatingAccessPathIds: source.transit.accessPaths
        .filter((a) => a.stationId === station.id)
        .map((a) => a.id),
      pickupPose: pose(340, 113, -Math.PI / 2),
      bay: {
        x: 328,
        y: 91,
        w: 24,
        h: 44,
        maxSpeed: 5,
        seatsRequired: 3,
        vehicleCapacity: 4,
      },
      approach: stationApproach,
      existingNadiaWait: p(376, 143),
      nadiaFromDocksideStreet: [
        p(129, 308),
        p(147, 308),
        p(147, 231),
        p(231, 231),
        p(231, 81),
        p(429, 81),
        p(429, 113),
        p(429, 81),
        p(361, 81),
        p(361, 143),
        p(376, 143),
      ],
      newTessWait: p(303, 143),
      seatPolicy: [
        { actorId: 'LL-CHAR-002', seat: 2 },
        { actorId: 'LL-CHAR-008', seat: 1 },
        { actorId: 'LL-CHAR-025', seat: 3 },
      ],
      nadiaBoard: [p(376, 143), p(361, 143), p(361, 109.52), p(356.5, 109.52)],
      tessBoard: [p(303, 143), p(356.5, 143), p(356.5, 119.09)],
      felixWestDoor: p(323.5, 119.09),
      felixDoorToEntry: [p(323.5, 119.09), p(323.5, 81), p(429, 81), p(429, 113)],
      boardingOrder: ['LL-CHAR-008', 'LL-CHAR-025'],
      waitArrivalRadius: 4,
      blockedAccessSpur: {
        status: 'needs-authored-geometry',
        preserveOperatingRamp: true,
      },
    },
    'tess-flat': {
      siteId: tess.id,
      buildingId: tess.buildingId,
      entry: { ...tess.entrance },
      roomId: 'tess-flat',
      pickupPose: pose(752, 308, Math.PI / 2),
      bay: { x: 740, y: 286, w: 24, h: 44, maxSpeed: 5 },
      approach: [pose(752, 260, Math.PI / 2), pose(752, 308, Math.PI / 2)],
      tessDoorToEntry: [p(735.5, 301.91), p(729, 301.91), p(729, 308)],
      interiorWalk: [p(110, 170), p(110, 158), p(72, 158)],
      portal: {
        id: 'tess-flat-entry',
        roomId: 'tess-flat',
        locationId: 'tess-flat',
        siteId: tess.id,
        entryRadius: 22,
        vehicleAllowed: false,
        wantedMax: 0,
      },
      deliverActorId: 'LL-CHAR-025',
      retainPassengerId: 'LL-CHAR-008',
    },
    'pier-goods': {
      siteId: shop.id,
      buildingId: shop.buildingId,
      entry: { ...shop.entrance },
      roomId: 'pier-goods',
      pickupPose: pose(208, 308, Math.PI / 2),
      bay: { x: 196, y: 286, w: 24, h: 44, maxSpeed: 5 },
      approach: [pose(208, 260, Math.PI / 2), pose(208, 308, Math.PI / 2)],
      doorToEntry: [p(224.5, 311.48), p(231, 311.48), p(231, 308)],
      felixEastDoor: p(224.5, 301.91),
      felixDoorToEntry: [p(224.5, 301.91), p(231, 301.91), p(231, 308)],
      exitOrder: ['player', 'LL-CHAR-002'],
      beaSpawn: p(85, 24, 0, {
        id: 'LL-ARC-BEA',
        sceneId: 'pier-goods',
        angle: Math.PI / 2,
      }),
      clerkServiceMark: p(170, 156, 0, { sceneId: 'pier-goods' }),
      clerkWalk: [p(85, 24), p(132, 24), p(170, 80), p(170, 156)],
      felixServiceMark: p(170, 186, 0, { sceneId: 'pier-goods' }),
      felixInteriorWalk: [p(132, 190), p(170, 190), p(170, 186)],
      dialogue: {
        hook: p(132, 166, 0, { sceneId: 'pier-goods' }),
        speakerRange: 80,
        mouthHeight: 24,
        requiresActualLivingSpeaker: true,
        requiresActualRoomLineOfSight: true,
      },
      interiorWalk: [p(132, 190), p(132, 166), p(174, 166), p(174, 80), p(85, 80)],
      changingWalk: [p(132, 166), p(174, 166), p(174, 118), p(220, 118), p(220, 76)],
      stock: [...mission.stages.find((s) => s.id === 'workwear').stock],
      voucher: {
        id: 'nadia-starter-outfit',
        count: 1,
        payment: 'cooperative-voucher',
        consumeOnce: true,
      },
      portal: {
        id: 'pier-goods-entry',
        roomId: 'pier-goods',
        locationId: 'pier-goods',
        siteId: shop.id,
        entryRadius: 22,
        vehicleAllowed: false,
        wantedMax: 0,
      },
    },
  };
  const newActors = freeze({
    'LL-CHAR-025': {
      id: 'LL-CHAR-025',
      name: 'Tess Vale',
      ...bindings['boardwalk-station'].newTessWait,
      sceneId: null,
      angle: Math.PI / 2,
      health: 100,
      createOnlyIfAbsent: true,
      appearance: TWO_SEATS_APPEARANCES.tess,
    },
    'LL-ARC-DAX': {
      ...bindings.dispatch.encounter.dax,
      name: 'Dax Lorne',
      health: 100,
      createOnlyIfAbsent: true,
      appearance: TWO_SEATS_APPEARANCES.dax,
    },
    'LL-ARC-PEL': {
      ...bindings.dispatch.encounter.pel,
      name: 'Pel Sedge',
      health: 100,
      createOnlyIfAbsent: true,
      appearance: TWO_SEATS_APPEARANCES.pel,
    },
    'LL-ARC-BEA': {
      ...bindings['pier-goods'].beaSpawn,
      name: 'Bea Marsh',
      health: 100,
      createOnlyIfAbsent: true,
      appearance: TWO_SEATS_APPEARANCES.bea,
    },
  });
  const terrain = createTerrain(world),
    checks = {};
  for (const [key, binding] of Object.entries(bindings))
    if (binding.approach) {
      const swept = checkLateMeterVehicleSweep(
        world,
        binding.approach,
        { length: 29, width: 15, height: 16 },
        { terrain },
      );
      const headroom = fullBodyPath(world, terrain, binding.approach, Math.hypot(29, 15) / 2, 16);
      checks[`${key}:vehicle`] = {
        ...swept,
        ready: swept.clear && headroom.ready,
        headroomIssues: headroom.issues,
      };
    }
  for (const [key, path] of Object.entries({
    'boardwalk-station:nadia': bindings['boardwalk-station'].nadiaBoard,
    'boardwalk-station:tess': bindings['boardwalk-station'].tessBoard,
    'boardwalk-station:nadia-arrival': bindings['boardwalk-station'].nadiaFromDocksideStreet,
    'tess-flat:entry': bindings['tess-flat'].tessDoorToEntry,
    'pier-goods:entry': bindings['pier-goods'].doorToEntry,
    'dispatch:retreat': bindings.dispatch.encounter.exteriorRetreat,
  }))
    checks[key] = fullBodyPath(world, terrain, path);
  const report = {
    status: 'candidate-physical-plan',
    ready: false,
    runtimeReady: false,
    checks,
    allReportedChecksClear: Object.values(checks).every((c) => c.ready),
    requiredCapabilities: TWO_SEATS_CAPABILITY_GAPS,
    boundary:
      'Checked candidate spatial requirements only. Room registration, native art, station spur, live cast itineraries, blade/injury/retreat, voucher and campaign integration are not complete.',
  };
  return {
    world: {
      ...world,
      campaignSceneBindings: { ...world.campaignSceneBindings, ...bindings },
      campaignSceneReports: { ...world.campaignSceneReports, 'LL-ST-003': report },
    },
    bindings,
    rooms: TWO_SEATS_ROOMS,
    outfits: TWO_SEATS_OUTFITS,
    newActors,
    appearances: TWO_SEATS_APPEARANCES,
    report,
  };
}
