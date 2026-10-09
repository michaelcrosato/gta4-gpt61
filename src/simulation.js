import {
  initializePolicing,
  resetPolicing,
  forcePoliceWanted,
  reportObservedCrime,
  updatePolicing,
  relinquishPoliceVehicle,
  validatePoliceSave,
} from './police.js';
import { WORLD, ROAD_XS as roadXs, ROAD_YS as roadYs } from './world.js';
import {
  WEAPONS,
  SHOP_WEAPONS,
  initializeCombat,
  equipOwnedWeapon,
  acquireWeapon,
  fireCombatWeapon,
  combatDefenseInput,
  updateMelee,
  updateOrdnance,
  hitCombatant,
  predictThrow,
  startActorMelee,
  validateCombatSave,
} from './combat.js';
export { WORLD, WEAPONS };
/** LOWLIGHT's deterministic, renderer-independent city simulation. */
const TAU = Math.PI * 2;
const SAVE_VERSION = 1;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const normalizeAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const clone = (value) => JSON.parse(JSON.stringify(value));

export const VEHICLE_SPECS = Object.freeze({
  taxi: {
    name: 'Crownline taxi',
    width: 15,
    length: 29,
    maxSpeed: 145,
    acceleration: 74,
    braking: 180,
    grip: 3.1,
    reverseSpeed: 47,
    health: 120,
    seats: 4,
  },
  sedan: {
    name: 'Alder sedan',
    width: 15,
    length: 29,
    maxSpeed: 157,
    acceleration: 78,
    braking: 178,
    grip: 2.8,
    reverseSpeed: 45,
    health: 115,
    seats: 4,
  },
  van: {
    name: 'Porter cargo van',
    width: 17,
    length: 34,
    maxSpeed: 112,
    acceleration: 56,
    braking: 152,
    grip: 2.4,
    reverseSpeed: 34,
    health: 190,
    seats: 2,
  },
  sports: {
    name: 'Vesper coupe',
    width: 15,
    length: 28,
    maxSpeed: 205,
    acceleration: 103,
    braking: 205,
    grip: 3.6,
    reverseSpeed: 51,
    health: 90,
    seats: 2,
  },
  police: {
    name: 'Harbor patrol cruiser',
    width: 16,
    length: 31,
    maxSpeed: 172,
    acceleration: 90,
    braking: 190,
    grip: 3,
    reverseSpeed: 45,
    health: 170,
    seats: 4,
  },
});

const target = (x, y, name, radius = 35) => ({ x, y, name, radius });
export const MISSIONS = [
  {
    id: 'first-shift',
    title: 'The First Shift',
    chapter: 1,
    contact: 'Felix Voss',
    reward: 450,
    prerequisite: null,
    summary: 'A relief driver, a late ferry passenger, and a family business running on fumes.',
    stages: [
      {
        type: 'interact',
        objective: 'Talk to Felix at Voss Dispatch.',
        target: target(458, 700, 'Felix'),
        spawnVehicle: {
          id: 'starter-taxi',
          spec: 'taxi',
          x: 504,
          y: 700,
          angle: Math.PI,
          color: '#dfb447',
        },
        dialogue: [
          ['Felix', 'Mara. You made it. City still smells like rain and unpaid bills.'],
          ['Mara', 'You said there was work. You did not mention the bills.'],
          [
            'Felix',
            'Take the yellow Crownline. A ferry passenger needs Southbank. One quiet fare.',
          ],
        ],
      },
      {
        type: 'vehicle',
        objective: 'Get into Felix’s yellow taxi.',
        vehicle: 'starter-taxi',
        target: target(504, 700, 'Felix’s taxi', 28),
      },
      {
        type: 'drive',
        objective: 'Drive to the Old Quay ferry pickup.',
        target: target(180, 440, 'Ferry terminal'),
        requiredVehicle: 'taxi',
        dialogue: [
          ['Felix', 'Keep to the roads. This taxi is the only thing the bank has not taken.'],
        ],
      },
      {
        type: 'interact',
        objective: 'Collect June, the ferry passenger.',
        target: target(180, 440, 'June’s pickup'),
        requiredVehicle: 'taxi',
        dialogue: [
          ['June', 'Southbank clinic. My mother works nights.'],
          ['Mara', 'So does everyone I know.'],
          ['June', 'Then you will fit right in.'],
        ],
      },
      {
        type: 'drive',
        objective: 'Deliver June to Southbank Clinic.',
        target: target(180, 960, 'Southbank Clinic'),
        requiredVehicle: 'taxi',
      },
      {
        type: 'drive',
        objective: 'Bring the taxi back to Voss Dispatch.',
        target: target(480, 700, 'Voss Dispatch'),
        requiredVehicle: 'taxi',
        dialogue: [
          [
            'June',
            'Here. Keep the change. And do not trust men who call you family on the first day.',
          ],
        ],
      },
      {
        type: 'interact',
        objective: 'Report to Felix.',
        target: target(458, 700, 'Felix'),
        dialogue: [
          ['Felix', 'Good shift. Saira needs help collecting some repair bills tomorrow.'],
          ['Mara', 'Repair bills, or your repair bills?'],
          ['Felix', 'You always did ask expensive questions.'],
        ],
      },
    ],
  },
  {
    id: 'collection-day',
    title: 'The Price of a Promise',
    chapter: 1,
    contact: 'Saira Bell',
    reward: 650,
    prerequisite: 'first-shift',
    summary: 'Two unpaid invoices uncover a protection racket around a neighborhood garage.',
    stages: [
      {
        type: 'interact',
        objective: 'Meet Saira at her garage.',
        target: target(780, 718, 'Saira'),
        dialogue: [
          [
            'Saira',
            'I fix engines. Somehow that makes everybody think I can fix their life on credit.',
          ],
          ['Mara', 'Felix sent me.'],
          ['Saira', 'Of course he did. Two invoices. Ask politely first. Always.'],
        ],
      },
      {
        type: 'interact',
        objective: 'Collect the invoice from Alder Printworks.',
        target: target(1080, 440, 'Alder Printworks'),
        dialogue: [
          ['Emil', 'I paid Danton’s boys already. They said they were collecting for Saira.'],
          ['Mara', 'They were not. Tell me where to find them.'],
          ['Emil', 'East Port. Red van. Please do not tell them my name.'],
        ],
      },
      {
        type: 'interact',
        objective: 'Ask about the red van in East Port.',
        target: target(1380, 700, 'East Port collection'),
        dialogue: [
          ['Bram', 'New face. Same bad idea. This block belongs to us.'],
          ['Mara', 'Then you can afford to pay for the repairs.'],
        ],
        encounter: { x: 1380, y: 735, count: 3, health: 65, weapon: 'pistol' },
      },
      {
        type: 'combat',
        objective: 'Survive Bram’s crew. Use cover and keep moving.',
        target: target(1380, 735, 'Bram’s crew'),
        dialogue: [['Saira', 'Mara? I heard the shots. Get clear before patrol seals the roads.']],
      },
      {
        type: 'escape',
        objective: 'Break police sight, leave the search circle, and lose your wanted level.',
        heat: 2,
        dialogue: [
          ['Mara', 'Those were not repairmen.'],
          ['Saira', 'Nothing in this city is what the sign says.'],
        ],
      },
      {
        type: 'interact',
        objective: 'Return the recovered invoices to Saira.',
        target: target(780, 718, 'Saira’s Garage'),
        dialogue: [
          ['Saira', 'The money helps. The attention does not.'],
          ['Mara', 'I am beginning to see the family resemblance.'],
          ['Saira', 'Keep the taxi repaired. The city eats anything that stops moving.'],
        ],
      },
    ],
  },
  {
    id: 'cold-freight',
    title: 'Cold Freight',
    chapter: 1,
    contact: 'Tomas Reed',
    reward: 950,
    prerequisite: 'collection-day',
    summary:
      'Move refrigerated medicine through the port, then protect it from a deliberate ambush.',
    stages: [
      {
        type: 'interact',
        objective: 'Meet Tomas at Pier 8 Depot.',
        target: target(1620, 960, 'Tomas'),
        dialogue: [
          ['Tomas', 'Clinic stock. Insulin, mostly. The official trucks went missing.'],
          ['Mara', 'Why ask a taxi driver?'],
          ['Tomas', 'Because a taxi driver can still choose where to stop.'],
        ],
        spawnVehicle: {
          id: 'medicine-van',
          spec: 'van',
          x: 1620,
          y: 986,
          angle: Math.PI,
          color: '#8eaaa6',
        },
      },
      {
        type: 'vehicle',
        objective: 'Get into the refrigerated Porter van.',
        vehicle: 'medicine-van',
        target: target(1620, 986, 'Medicine van', 28),
      },
      {
        type: 'drive',
        objective: 'Take the medicine through the customs junction.',
        target: target(1080, 960, 'Customs junction'),
        requiredVehicle: 'medicine-van',
        deadline: 160,
      },
      {
        type: 'drive',
        objective: 'Reach the Southbank service road.',
        target: target(780, 1220, 'Service road'),
        requiredVehicle: 'medicine-van',
        encounter: { x: 754, y: 1204, count: 4, health: 72, weapon: 'pistol' },
        dialogue: [['Tomas', 'That car behind you has no plates. Do not let them take the van.']],
      },
      {
        type: 'combat',
        objective: 'Protect the medicine from the ambush.',
        target: target(780, 1220, 'Ambush'),
        protectVehicle: 'medicine-van',
      },
      {
        type: 'drive',
        objective: 'Deliver the medicine to the clinic service entrance.',
        target: target(180, 960, 'Clinic service entrance'),
        requiredVehicle: 'medicine-van',
        deadline: 150,
        dialogue: [
          ['Dr. Chen', 'Put the crates inside. People are waiting.'],
          ['Mara', 'Someone tried very hard to make sure they kept waiting.'],
        ],
      },
      {
        type: 'interact',
        objective: 'Check in with Dr. Chen.',
        target: target(180, 960, 'Dr. Chen'),
        dialogue: [
          ['Dr. Chen', 'This should not require heroics.'],
          ['Mara', 'It was supposed to be a delivery.'],
          ['Dr. Chen', 'Remember that. Before this city makes the other version sound normal.'],
        ],
      },
    ],
  },
  {
    id: 'glass-house',
    title: 'People in Glass Houses',
    chapter: 1,
    contact: 'Imani Vale',
    reward: 1200,
    prerequisite: 'cold-freight',
    summary:
      'A radio journalist needs proof of the port diversion. Enter quietly or force an exit.',
    stages: [
      {
        type: 'interact',
        objective: 'Meet Imani at Signal House.',
        target: target(780, 440, 'Imani'),
        dialogue: [
          ['Imani', 'Your medicine route was not an accident. Someone bought the detour.'],
          ['Mara', 'Put that on the radio.'],
          [
            'Imani',
            'I need proof first. A camera card is hidden at Civic Market. Leave the car and use the alley.',
          ],
        ],
      },
      {
        type: 'interact',
        objective: 'On foot, collect the camera card at Civic Market.',
        target: target(1080, 180, 'Camera card', 27),
        onFoot: true,
        encounter: { x: 1120, y: 202, count: 3, health: 80, weapon: 'smg' },
        dialogue: [['Imani', 'You have the card. Now keep it out of their hands.']],
      },
      {
        type: 'reach',
        objective: 'Get the evidence out through Old Quay.',
        target: target(480, 180, 'Old Quay exit'),
        dialogue: [
          ['Mara', 'I saw my cousin’s company on the shipping ledger.'],
          [
            'Imani',
            'A name on a form is a question. Bring me the rest before you make it an answer.',
          ],
        ],
      },
      { type: 'escape', objective: 'Lose the police before approaching Signal House.', heat: 2 },
      {
        type: 'interact',
        objective: 'Deliver the camera card to Imani.',
        target: target(780, 440, 'Signal House'),
        dialogue: [
          ['Imani', 'Now we have a story. You have a choice about what to do with it.'],
          ['Mara', 'First I ask Felix. Face to face.'],
          ['Imani', 'Then keep a copy. People forget promises when the lights go out.'],
        ],
      },
    ],
  },
];

function random(state) {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
  return state.rng / 4294967296;
}
function nextId(state, prefix) {
  state.sequence += 1;
  return `${prefix}-${state.sequence}`;
}
function notify(state, text, kind = 'info') {
  state.notifications.push({
    id: nextId(state, 'notice'),
    text,
    kind,
    time: state.time,
    expires: state.time + 9,
  });
  state.notifications = state.notifications.slice(-8);
}
function say(state, lines) {
  if (!lines?.length) return;
  state.dialogue = {
    lines: clone(lines),
    index: 0,
    speaker: lines[0][0],
    text: lines[0][1],
    expires: state.time + 14,
  };
  state.dialogueHistory.push(
    ...lines.map(([speaker, text]) => ({ speaker, text, time: state.time })),
  );
  state.dialogueHistory = state.dialogueHistory.slice(-60);
}
function createVehicle(state, definition) {
  const spec = VEHICLE_SPECS[definition.spec || 'sedan'];
  return {
    id: definition.id || nextId(state, 'vehicle'),
    spec: definition.spec || 'sedan',
    x: definition.x,
    y: definition.y,
    angle: definition.angle || 0,
    speed: 0,
    health: spec.health,
    color: definition.color || '#a3b8b6',
    kind: definition.kind || 'parked',
    occupied: false,
    route: definition.route || null,
    routeIndex: 0,
    blockedTime: 0,
    stolen: false,
  };
}

export function createSimulation(seed = 61) {
  const numericSeed = typeof seed === 'object' ? (seed.seed ?? 61) : seed;
  const state = {
    version: SAVE_VERSION,
    rng: (Number(numericSeed) || 61) >>> 0,
    sequence: 0,
    time: 0,
    clock: 20.25,
    player: {
      x: WORLD.spawn.x,
      y: WORLD.spawn.y,
      angle: 0,
      health: 100,
      armour: 0,
      money: 240,
      vehicleId: null,
      weapon: 'pistol',
      weapons: ['pistol'],
      ammo: {
        pistol: { clip: 12, reserve: 48 },
        shotgun: { clip: 0, reserve: 0 },
        smg: { clip: 0, reserve: 0 },
      },
      fireCooldown: 0,
      reloadRemaining: 0,
      stamina: 100,
      speed: 0,
    },
    vehicles: [],
    pedestrians: [],
    police: [],
    hostiles: [],
    bullets: [],
    particles: [],
    wanted: {
      level: 0,
      heat: 0,
      status: 'clear',
      lastSeen: { x: WORLD.spawn.x, y: WORLD.spawn.y },
      searchRadius: 0,
      timer: 0,
      unseen: 0,
      pursuitTime: 0,
    },
    mission: null,
    taxiJob: null,
    progress: {
      completed: [],
      failed: [],
      deaths: 0,
      fares: 0,
      kills: 0,
      distanceDriven: 0,
      cashEarned: 0,
    },
    notifications: [],
    dialogue: null,
    dialogueHistory: [],
    lastInput: {},
    district: 'breakwater',
    weather: { rain: 0.4, fog: 0.14 },
    radio: {
      station: 0,
      stations: [
        'HBR 91.7 · After Hours',
        'Signal House · Independent',
        'Port Radio · Night Freight',
      ],
    },
    checkpoint: { x: WORLD.spawn.x, y: WORLD.spawn.y },
    respawnTimer: 0,
    lastCrimeTime: -100,
    saveRequested: false,
  };
  state.vehicles.push(
    createVehicle(state, {
      id: 'starter-taxi',
      spec: 'taxi',
      x: 504,
      y: 700,
      angle: Math.PI,
      color: '#dfb447',
    }),
  );
  const parking = [
    ['sedan', 480, 408, '#536983'],
    ['sports', 808, 440, '#c27565'],
    ['van', 1620, 922, '#9eafa6'],
    ['sedan', 180, 732, '#a59c84'],
    ['taxi', 1108, 960, '#d4b050'],
    ['sedan', 1380, 408, '#978da9'],
  ];
  for (const [spec, x, y, color] of parking)
    state.vehicles.push(createVehicle(state, { spec, x, y, color }));
  for (let i = 0; i < 18; i += 1) {
    const row = i % (roadYs.length - 1);
    const col = (i * 3 + Math.floor(i / 5)) % (roadXs.length - 1);
    const clockwise = i % 2 === 0;
    const x1 = roadXs[col] + 14,
      x2 = roadXs[col + 1] - 14;
    const y1 = roadYs[row] + 14,
      y2 = roadYs[row + 1] - 14;
    const route = clockwise
      ? [
          { x: x1, y: y1 },
          { x: x2, y: y1 },
          { x: x2, y: y2 },
          { x: x1, y: y2 },
        ]
      : [
          { x: x1, y: y2 },
          { x: x2, y: y2 },
          { x: x2, y: y1 },
          { x: x1, y: y1 },
        ];
    const start = (i + 1) % 4;
    const colors = ['#b7b5a6', '#73889a', '#a27269', '#91a49b', '#b5a06d'];
    const vehicle = createVehicle(state, {
      spec: i % 7 === 0 ? 'taxi' : i % 6 === 0 ? 'van' : 'sedan',
      x: route[start].x,
      y: route[start].y,
      angle: angleTo(route[start], route[(start + 1) % 4]),
      kind: 'traffic',
      route,
      color: colors[i % colors.length],
    });
    vehicle.routeIndex = (start + 1) % 4;
    vehicle.speed = 35 + random(state) * 22;
    state.vehicles.push(vehicle);
  }
  for (let i = 0; i < 52; i += 1) {
    const avenue = roadXs[i % roadXs.length];
    const row = i % (roadYs.length - 1);
    const x = avenue + (i % 2 ? 47 : -47);
    const y = roadYs[row] + 50 + random(state) * 150;
    state.pedestrians.push({
      id: nextId(state, 'pedestrian'),
      x,
      y,
      angle: i % 2 ? Math.PI / 2 : -Math.PI / 2,
      health: 100,
      speed: 12 + random(state) * 8,
      color: ['#968877', '#7a8b94', '#a4867a', '#8f947f'][i % 4],
      homeX: x,
      minY: roadYs[row] + 48,
      maxY: roadYs[row + 1] - 48,
      panic: 0,
    });
  }
  initializeCombat(state, WORLD.pickups || []);
  initializePolicing(state);
  startMission(state, 'first-shift');
  return state;
}

export function currentVehicle(state) {
  return state.vehicles.find((item) => item.id === state.player.vehicleId) || null;
}

function circleRectCollision(x, y, radius, rect) {
  const nearX = clamp(x, rect.x, rect.x + rect.w);
  const nearY = clamp(y, rect.y, rect.y + rect.h);
  return Math.hypot(x - nearX, y - nearY) < radius;
}
export function isBlocked(x, y, radius = 7, z = 0) {
  if (
    x - radius < WORLD.bounds.left ||
    x + radius > WORLD.bounds.right ||
    y - radius < WORLD.bounds.top ||
    y + radius > WORLD.bounds.bottom
  )
    return true;
  return (
    WORLD.buildings.some(
      (building) => z < (building.height || 40) && circleRectCollision(x, y, radius, building),
    ) ||
    (WORLD.obstacles || []).some(
      (obstacle) => z < obstacle.height && circleRectCollision(x, y, radius, obstacle),
    )
  );
}
function moveBody(body, dx, dy, radius) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (radius * 0.65)));
  let collided = false;
  for (let i = 0; i < steps; i += 1) {
    const nextX = body.x + dx / steps;
    const nextY = body.y + dy / steps;
    if (!isBlocked(nextX, nextY, radius, body.z || 0)) {
      body.x = nextX;
      body.y = nextY;
      continue;
    }
    collided = true;
    if (!isBlocked(nextX, body.y, radius, body.z || 0)) body.x = nextX;
    if (!isBlocked(body.x, nextY, radius, body.z || 0)) body.y = nextY;
  }
  return collided;
}
function hasLineOfSight(a, b) {
  const length = distance(a, b);
  const segments = Math.ceil(length / 9);
  for (let i = 1; i < segments; i += 1) {
    const fraction = i / segments;
    const z0 = (a.z || 0) + (a.health !== undefined ? 14 : 0),
      z1 = (b.z || 0) + (b.health !== undefined ? 14 : 0);
    const z = z0 + (z1 - z0) * fraction;
    if (
      [...WORLD.buildings, ...(WORLD.obstacles || [])].some(
        (building) =>
          z <
            (building.type === 'barrier' || building.type === 'ledge' || building.type === 'fence'
              ? building.height
              : building.height || 40) &&
          circleRectCollision(
            a.x + (b.x - a.x) * fraction,
            a.y + (b.y - a.y) * fraction,
            1,
            building,
          ),
      )
    )
      return false;
  }
  return true;
}
function damagePlayer(state, damage) {
  if (state.player.health <= 0 || state.respawnTimer > 0) return;
  const absorbed = Math.min(state.player.armour, damage * 0.75);
  state.player.armour -= absorbed;
  state.player.health = Math.max(0, state.player.health - (damage - absorbed));
  if (damage > 0) state.player.reloadRemaining = 0;
  if (state.player.health <= 0) killPlayer(state);
}
function damageVehicle(state, vehicle, damage) {
  if (vehicle.health <= 0) return;
  if (vehicle.armour > 0) {
    const absorbed = Math.min(vehicle.armour, damage * 0.55);
    vehicle.armour -= absorbed;
    damage -= absorbed;
  }
  vehicle.health = Math.max(0, vehicle.health - damage);
  if (vehicle.health === 0) {
    vehicle.speed = 0;
    if (state.player.vehicleId === vehicle.id) {
      vehicle.occupied = false;
      state.player.vehicleId = null;
      damagePlayer(state, 32);
      notify(state, 'Vehicle disabled. Get clear and find another ride.', 'danger');
    }
  }
}
function killPlayer(state) {
  state.player.health = 0;
  state.progress.deaths += 1;
  state.respawnTimer = 2.5;
  const vehicle = currentVehicle(state);
  if (vehicle) {
    vehicle.occupied = false;
    vehicle.speed = 0;
  }
  state.player.vehicleId = null;
  state.player.cover = null;
  state.player.traversal = null;
  state.player.meleeAction = null;
  state.player.defending = false;
  state.player.z = 0;
  state.player.vz = 0;
  if (state.mission) failMission(state, 'Mara was incapacitated. The assignment can be retried.');
  state.taxiJob = null;
  state.hostiles = [];
  state.bullets = [];
  notify(state, 'INCAPACITATED · Clinic recovery in a moment.', 'danger');
}
function respawn(state) {
  const fee = Math.min(80, state.player.money);
  state.player.money -= fee;
  Object.assign(state.player, {
    x: 180,
    y: 960,
    health: 100,
    armour: 0,
    speed: 0,
    reloadRemaining: 0,
  });
  state.wanted = {
    level: 0,
    heat: 0,
    status: 'clear',
    lastSeen: { x: 180, y: 960 },
    searchRadius: 0,
    timer: 0,
    unseen: 0,
    pursuitTime: 0,
  };
  resetPolicing(state);
  state.respawnTimer = 0;
  notify(state, `Southbank Clinic patched you up. Treatment: $${fee}.`, 'info');
}

function policeContext(state) {
  return {
    world: WORLD,
    specs: VEHICLE_SPECS,
    id: (prefix) => nextId(state, prefix),
    random: () => random(state),
    hasLineOfSight,
    isBlocked,
    moveBody,
    damageVehicle: (vehicle, amount) => damageVehicle(state, vehicle, amount),
    fire: (actor) => fireHostile(state, actor),
    reloadActor: updateEnemyReload,
    notify: (text, kind) => notify(state, text, kind),
    onArrest: () => {
      if (state.mission) failMission(state, 'Mara was arrested. The assignment can be retried.');
      state.taxiJob = null;
      state.dialogue = null;
      state.bullets = [];
      state.ordnance = [];
    },
  };
}
export function forceWanted(state, level, point = state.player) {
  forcePoliceWanted(state, level, point, policeContext(state));
}
export function reportCrime(state, crime) {
  return reportObservedCrime(state, crime, policeContext(state));
}
function raiseWanted(state, level = 1) {
  forceWanted(state, level);
}
function finishReload(state) {
  const ammo = state.player.ammo[state.player.weapon];
  const needed = WEAPONS[state.player.weapon].clipSize - ammo.clip;
  const amount = Math.min(needed, ammo.reserve);
  ammo.clip += amount;
  ammo.reserve -= amount;
}
export function reloadWeapon(state) {
  const weapon = WEAPONS[state.player.weapon];
  const ammo = state.player.ammo[state.player.weapon];
  if (
    state.player.health <= 0 ||
    !['ballistic', 'rocket'].includes(weapon.mode) ||
    state.player.reloadRemaining > 0 ||
    ammo.clip === weapon.clipSize ||
    ammo.reserve <= 0
  )
    return false;
  state.player.reloadRemaining = weapon.reloadTime;
  return true;
}
export function selectWeapon(state, id) {
  return equipOwnedWeapon(state, id);
}
function combatContext(state) {
  return {
    random: () => random(state),
    id: (prefix) => nextId(state, prefix),
    damagePlayer: (amount) => damagePlayer(state, amount),
    damageVehicle: (vehicle, amount) => damageVehicle(state, vehicle, amount),
    raiseWanted: (level) => reportCrime(state, { type: 'gunfire', severity: level }),
    reportCrime: (crime) => reportCrime(state, crime),
    hasLineOfSight,
    isBlocked,
    moveBody,
    reload: () => reloadWeapon(state),
    notify: (text, kind) => notify(state, text, kind),
  };
}
export function fireWeapon(state, input = {}) {
  return fireCombatWeapon(state, combatContext(state), input);
}
export function throwTrajectory(state) {
  return predictThrow(state, combatContext(state));
}
function updateEnemyReload(actor, dt) {
  const weapon = WEAPONS[actor.weapon] || WEAPONS.pistol;
  actor.ammo ??= {
    clip: weapon.mode === 'throwable' ? weapon.supply || 1 : weapon.clipSize,
    reserve: weapon.mode === 'throwable' ? 0 : weapon.clipSize * 3,
  };
  actor.reloadRemaining ??= 0;
  if (actor.reloadRemaining > 0) {
    actor.reloadRemaining = Math.max(0, actor.reloadRemaining - dt);
    if (actor.reloadRemaining === 0) {
      const amount = Math.min(weapon.clipSize - actor.ammo.clip, actor.ammo.reserve);
      actor.ammo.clip += amount;
      actor.ammo.reserve -= amount;
    }
  }
}
function fireHostile(state, hostile) {
  const weapon = WEAPONS[hostile.weapon] || WEAPONS.pistol;
  if (hostile.staggerRemaining > 0 || hostile.reloadRemaining > 0) return;
  if (weapon.mode === 'melee' || distance(hostile, state.player) < 24) {
    startActorMelee(
      state,
      hostile,
      weapon.mode === 'melee' ? hostile.weapon : 'unarmed',
      combatContext(state),
    );
    return;
  }
  hostile.ammo ??= { clip: weapon.clipSize, reserve: weapon.clipSize * 3 };
  if (hostile.ammo.clip <= 0) {
    if (hostile.ammo.reserve > 0) hostile.reloadRemaining = weapon.reloadTime;
    else hostile.weapon = 'unarmed';
    return;
  }
  hostile.ammo.clip--;
  const angle = angleTo(hostile, state.player) + (random(state) - 0.5) * 0.22;
  if (weapon.mode === 'rocket' || weapon.mode === 'throwable') {
    const speed = weapon.mode === 'rocket' ? weapon.bulletSpeed : weapon.throwSpeed;
    const range = Math.max(1, distance(hostile, state.player)),
      heightDelta = (state.player.z || 0) + 12 - ((hostile.z || 0) + 13),
      length = Math.hypot(range, heightDelta);
    const horizontalSpeed = weapon.mode === 'rocket' ? (speed * range) / length : speed;
    state.ordnance.push({
      id: nextId(state, 'enemy-ordnance'),
      kind: weapon.mode === 'rocket' ? 'rocket' : weapon.kind,
      weapon: hostile.weapon,
      owner: hostile.id,
      x: hostile.x,
      y: hostile.y,
      z: (hostile.z || 0) + 13,
      vx: Math.cos(angle) * horizontalSpeed,
      vy: Math.sin(angle) * horizontalSpeed,
      vz: weapon.mode === 'rocket' ? (speed * heightDelta) / length : weapon.throwLift,
      remaining: weapon.mode === 'rocket' ? weapon.range / speed : 8,
      fuse: weapon.fuse ?? null,
      damage: weapon.damage * 0.65,
      radius: weapon.blastRadius || 0,
      material: 'metal',
      objectName: 'Discarded can',
      bounces: 0,
    });
    hostile.fireCooldown = weapon.mode === 'rocket' ? 3.8 : 3;
    return;
  }
  for (let pellet = 0; pellet < Math.max(1, weapon.pellets); pellet++) {
    const direction = angle + (pellet ? (random(state) - 0.5) * weapon.spread * 2 : 0);
    const range = Math.max(1, distance(hostile, state.player)),
      heightDelta =
        (state.player.z || 0) + (state.player.crouching ? 8 : 12) - ((hostile.z || 0) + 13);
    const length = Math.hypot(range, heightDelta),
      speed = Math.min(600, weapon.bulletSpeed),
      horizontalSpeed = (speed * range) / length;
    state.bullets.push({
      id: nextId(state, 'bullet'),
      x: hostile.x + Math.cos(direction) * 10,
      y: hostile.y + Math.sin(direction) * 10,
      prevX: hostile.x,
      prevY: hostile.y,
      z: (hostile.z || 0) + 13,
      angle: direction,
      vx: Math.cos(direction) * horizontalSpeed,
      vy: Math.sin(direction) * horizontalSpeed,
      vz: (speed * heightDelta) / length,
      remaining: Math.min(weapon.range, 500),
      damage: weapon.damage * (hostile.kind === 'police' ? 0.25 : 0.33),
      owner: hostile.id,
      weapon: hostile.weapon,
    });
  }
  hostile.fireCooldown = Math.max(0.3, weapon.fireInterval * 3) + random(state) * 0.4;
}
function segmentDistance(point, start, end) {
  const dx = end.x - start.x,
    dy = end.y - start.y;
  const fraction = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1),
    0,
    1,
  );
  return Math.hypot(point.x - start.x - dx * fraction, point.y - start.y - dy * fraction);
}
function segmentHeight(point, start, end) {
  const dx = end.x - start.x,
    dy = end.y - start.y,
    t = clamp(
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1),
      0,
      1,
    );
  return (start.z || 0) + ((end.z || 0) - (start.z || 0)) * t;
}
function updateBullets(state, dt) {
  for (const bullet of state.bullets) {
    bullet.prevX = bullet.x;
    bullet.prevY = bullet.y;
    bullet.prevZ = bullet.z;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    if (bullet.vz) {
      bullet.z = (bullet.z || 0) + bullet.vz * dt;
      if (bullet.z < 0) {
        bullet.remaining = 0;
        continue;
      }
    }
    bullet.remaining -= Math.hypot(bullet.vx, bullet.vy, bullet.vz || 0) * dt;
    const previous = { x: bullet.prevX, y: bullet.prevY, z: bullet.prevZ };
    if (!hasLineOfSight(previous, bullet) || isBlocked(bullet.x, bullet.y, 1, bullet.z || 0)) {
      bullet.remaining = 0;
      continue;
    }
    if (bullet.owner === 'player') {
      const targets = [
        ...state.hostiles,
        ...state.police,
        ...state.pedestrians,
        ...state.policeAircraft,
      ].filter(
        (person) =>
          person.health > 0 &&
          segmentDistance(person, previous, bullet) < (person.role === 'air-search' ? 24 : 9) &&
          (bullet.z === undefined ||
            (segmentHeight(person, previous, bullet) >= (person.z || 0) &&
              segmentHeight(person, previous, bullet) <= (person.z || 0) + 18)),
      );
      targets.sort((a, b) => distance(a, previous) - distance(b, previous));
      const victim = targets[0];
      const car = state.vehicles
        .filter(
          (vehicle) =>
            vehicle.health > 0 &&
            vehicle.id !== state.player.vehicleId &&
            segmentDistance(vehicle, previous, bullet) < VEHICLE_SPECS[vehicle.spec].width * 0.7 &&
            (bullet.z === undefined || segmentHeight(vehicle, previous, bullet) <= 18),
        )
        .sort((a, b) => distance(a, previous) - distance(b, previous))[0];
      if (car && (!victim || distance(car, previous) < distance(victim, previous))) {
        damageVehicle(state, car, bullet.damage * 0.65);
        bullet.remaining = 0;
      } else if (victim) {
        hitCombatant(state, victim, bullet.damage, 'player', combatContext(state));
        bullet.remaining = 0;
      }
    } else if (
      segmentDistance(state.player, previous, bullet) < (state.player.vehicleId ? 16 : 8) &&
      (bullet.z === undefined ||
        state.player.vehicleId ||
        (segmentHeight(state.player, previous, bullet) >= state.player.z &&
          segmentHeight(state.player, previous, bullet) <=
            state.player.z + (state.player.crouching ? 10 : 18)))
    ) {
      const vehicle = currentVehicle(state);
      if (vehicle) damageVehicle(state, vehicle, bullet.damage * 1.3);
      else damagePlayer(state, bullet.damage);
      bullet.remaining = 0;
    }
  }
  state.bullets = state.bullets.filter((bullet) => bullet.remaining > 0);
}

function drive(state, vehicle, dt, input) {
  const spec = VEHICLE_SPECS[vehicle.spec];
  const throttle = (input.forward || input.up ? 1 : 0) - (input.backward || input.down ? 1 : 0);
  const steering = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (input.brake) {
    vehicle.speed *= Math.max(0, 1 - dt * 6.5);
  } else if (throttle) {
    const accelerating = Math.sign(vehicle.speed) === throttle || Math.abs(vehicle.speed) < 4;
    vehicle.speed += throttle * (accelerating ? spec.acceleration : spec.braking) * dt;
  } else vehicle.speed *= Math.max(0, 1 - dt * 1.35);
  vehicle.speed = clamp(
    vehicle.speed,
    -spec.reverseSpeed,
    spec.maxSpeed * (vehicle.health < 35 ? 0.55 : 1),
  );
  if (Math.abs(vehicle.speed) < 0.2) vehicle.speed = 0;
  const turning =
    Math.min(1, Math.abs(vehicle.speed) / 26) *
    Math.max(0.42, 1 - Math.abs(vehicle.speed) / (spec.maxSpeed * 1.45));
  vehicle.angle = normalizeAngle(
    vehicle.angle + steering * spec.grip * turning * Math.sign(vehicle.speed || 1) * dt,
  );
  const before = { x: vehicle.x, y: vehicle.y };
  const collided = moveBody(
    vehicle,
    Math.cos(vehicle.angle) * vehicle.speed * dt,
    Math.sin(vehicle.angle) * vehicle.speed * dt,
    spec.width * 0.62,
  );
  if (collided) {
    if (Math.abs(vehicle.speed) > 40)
      damageVehicle(state, vehicle, Math.abs(vehicle.speed) * 0.075);
    vehicle.speed *= -0.15;
  }
  for (const other of state.vehicles) {
    if (other.id === vehicle.id || other.health <= 0) continue;
    const minimumDistance = (spec.width + VEHICLE_SPECS[other.spec].width) * 0.69;
    if (distance(vehicle, other) < minimumDistance) {
      const speed = Math.abs(vehicle.speed - other.speed);
      const separationAngle = angleTo(other, vehicle);
      moveBody(
        vehicle,
        Math.cos(separationAngle) * 2,
        Math.sin(separationAngle) * 2,
        spec.width * 0.62,
      );
      vehicle.speed *= -0.1;
      other.speed *= 0.2;
      if (speed > 35) {
        damageVehicle(state, vehicle, speed * 0.12);
        damageVehicle(state, other, speed * 0.15);
      }
    }
  }
  for (const person of [...state.pedestrians, ...state.hostiles, ...state.police]) {
    if (
      person.health <= 0 ||
      distance(vehicle, person) > spec.width * 0.65 + 6 ||
      Math.abs(vehicle.speed) < 18
    )
      continue;
    person.health = Math.max(0, person.health - Math.abs(vehicle.speed) * 0.9);
    person.panic = 8;
    vehicle.speed *= 0.68;
    if (!state.hostiles.some((hostile) => hostile.id === person.id))
      reportCrime(state, {
        type: person.kind === 'police' ? 'police-assault' : 'hit-and-run',
        severity: person.kind === 'police' ? 3 : 2,
      });
  }
  state.progress.distanceDriven += distance(vehicle, before);
  state.player.x = vehicle.x;
  state.player.y = vehicle.y;
  state.player.angle = vehicle.angle;
  state.player.speed = vehicle.speed;
}
export function toggleCover(state) {
  const p = state.player;
  if (p.vehicleId || p.health <= 0 || p.z > 1 || p.traversal) return false;
  if (p.cover) {
    p.cover = null;
    return true;
  }
  let best = null;
  for (const b of WORLD.buildings) {
    const candidates = [
      {
        x: b.x - 8,
        y: clamp(p.y, b.y, b.y + b.h),
        side: 'west',
        nx: -1,
        ny: 0,
        min: b.y,
        max: b.y + b.h,
      },
      {
        x: b.x + b.w + 8,
        y: clamp(p.y, b.y, b.y + b.h),
        side: 'east',
        nx: 1,
        ny: 0,
        min: b.y,
        max: b.y + b.h,
      },
      {
        x: clamp(p.x, b.x, b.x + b.w),
        y: b.y - 8,
        side: 'north',
        nx: 0,
        ny: -1,
        min: b.x,
        max: b.x + b.w,
      },
      {
        x: clamp(p.x, b.x, b.x + b.w),
        y: b.y + b.h + 8,
        side: 'south',
        nx: 0,
        ny: 1,
        min: b.x,
        max: b.x + b.w,
      },
    ];
    for (const point of candidates) {
      const d = distance(p, point);
      if (d < 20 && (!best || d < best.distance) && !isBlocked(point.x, point.y, 7))
        best = { ...point, buildingId: b.id, distance: d };
    }
  }
  if (!best) return false;
  p.cover = best;
  p.x = best.x;
  p.y = best.y;
  p.crouching = true;
  return true;
}
function carBlocksFoot(state, x, y, z = 0) {
  if (z >= 16) return false;
  return state.vehicles.some((car) => {
    if (car.health <= 0) return false;
    const spec = VEHICLE_SPECS[car.spec],
      dx = x - car.x,
      dy = y - car.y,
      c = Math.cos(car.angle),
      s = Math.sin(car.angle);
    const lx = dx * c + dy * s,
      ly = -dx * s + dy * c;
    return (
      Math.hypot(
        lx - clamp(lx, -spec.length / 2, spec.length / 2),
        ly - clamp(ly, -spec.width / 2, spec.width / 2),
      ) < 7
    );
  });
}
function movePlayer(state, dx, dy) {
  const p = state.player,
    steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
  for (let i = 0; i < steps; i++) {
    const x = p.x + dx / steps,
      y = p.y + dy / steps;
    if (!carBlocksFoot(state, x, y, p.z)) moveBody(p, dx / steps, dy / steps, 7);
    else if (!carBlocksFoot(state, x, p.y, p.z)) moveBody(p, dx / steps, 0, 7);
    else if (!carBlocksFoot(state, p.x, y, p.z)) moveBody(p, 0, dy / steps, 7);
  }
}
export function jumpOrVault(state, { vaultOnly = false } = {}) {
  const p = state.player;
  if (p.vehicleId || p.health <= 0 || p.z > 0 || p.traversal || p.stamina < 16) return false;
  let obstacle = null;
  for (const item of WORLD.obstacles || []) {
    const nearest = {
      x: clamp(p.x, item.x, item.x + item.w),
      y: clamp(p.y, item.y, item.y + item.h),
    };
    if (
      item.height <= 36 &&
      distance(p, nearest) < 24 &&
      Math.abs(normalizeAngle(angleTo(p, nearest) - p.angle)) < 1
    ) {
      const nx = Math.cos(p.angle),
        ny = Math.sin(p.angle);
      const end =
        Math.abs(nx) > Math.abs(ny)
          ? { x: nx > 0 ? item.x + item.w + 12 : item.x - 12, y: p.y }
          : { x: p.x, y: ny > 0 ? item.y + item.h + 12 : item.y - 12 };
      if (!isBlocked(end.x, end.y, 7) && !carBlocksFoot(state, end.x, end.y))
        obstacle = { kind: item.height > 20 ? 'climb' : 'vault', end, height: item.height + 12 };
    }
  }
  if (!obstacle)
    for (const car of state.vehicles) {
      if (
        car.health <= 0 ||
        Math.abs(car.speed) > 2 ||
        distance(p, car) > 36 ||
        Math.abs(normalizeAngle(angleTo(p, car) - p.angle)) > 0.8
      )
        continue;
      const end = { x: car.x + Math.cos(p.angle) * 29, y: car.y + Math.sin(p.angle) * 29 };
      if (!isBlocked(end.x, end.y, 7) && !carBlocksFoot(state, end.x, end.y))
        obstacle = { kind: 'vault', end, height: 26 };
    }
  p.cover = null;
  p.crouching = false;
  if (obstacle) {
    // Reject a path that would tunnel through an unrelated building.
    const clear = WORLD.buildings.every(
      (b) =>
        !Array.from({ length: 8 }, (_, i) => ({
          x: p.x + ((obstacle.end.x - p.x) * (i + 1)) / 8,
          y: p.y + ((obstacle.end.y - p.y) * (i + 1)) / 8,
        })).some((q) => circleRectCollision(q.x, q.y, 7, b)),
    );
    if (!clear) return false;
    p.stamina -= 20;
    p.traversal = {
      ...obstacle,
      start: { x: p.x, y: p.y },
      elapsed: 0,
      duration: obstacle.kind === 'climb' ? 0.95 : 0.62,
    };
    return true;
  }
  if (vaultOnly) return false;
  p.stamina -= 16;
  p.vz = 94;
  return true;
}
function walk(state, dt, input) {
  const p = state.player;
  p.aiming = Boolean(input.aim);
  p.aimTarget =
    input.aimTarget &&
    Number.isFinite(input.aimTarget.x) &&
    Number.isFinite(input.aimTarget.y) &&
    Number.isFinite(input.aimTarget.z)
      ? { x: input.aimTarget.x, y: input.aimTarget.y, z: clamp(input.aimTarget.z, 0, 250) }
      : null;
  if (p.aimTarget) p.angle = angleTo(p, p.aimTarget);
  p.scoped = Boolean(input.aim && WEAPONS[p.weapon].scopeZoom);
  if (p.cover) p.cover.peeking = p.aiming;
  p.throwCharge = clamp(Number(input.throwCharge) || 0, 0, 1);
  p.crouching = Boolean(input.crouch || p.cover);
  if (Number.isFinite(input.aimAngle) && !p.aimTarget) p.angle = normalizeAngle(input.aimAngle);
  if (p.traversal) {
    const action = p.traversal;
    action.elapsed += dt;
    const t = clamp(action.elapsed / action.duration, 0, 1);
    p.x = action.start.x + (action.end.x - action.start.x) * t;
    p.y = action.start.y + (action.end.y - action.start.y) * t;
    p.z = Math.sin(Math.PI * t) * action.height;
    p.speed = 0;
    if (t === 1) {
      p.z = 0;
      p.vz = 0;
      p.traversal = null;
    }
    return;
  }
  if (p.z > 0 || p.vz > 0) {
    p.vz -= 220 * dt;
    p.z = Math.max(0, p.z + p.vz * dt);
    if (p.z === 0) p.vz = 0;
  }
  if (p.dodgeRemaining > 0) {
    p.dodgeRemaining = Math.max(0, p.dodgeRemaining - dt);
    movePlayer(state, Math.cos(p.dodgeAngle) * 125 * dt, Math.sin(p.dodgeAngle) * 125 * dt);
    p.speed = 125;
    return;
  }
  let dx = Number.isFinite(input.moveX)
    ? clamp(input.moveX, -1, 1)
    : (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let dy = Number.isFinite(input.moveY)
    ? clamp(input.moveY, -1, 1)
    : (input.backward || input.down ? 1 : 0) - (input.forward || input.up ? 1 : 0);
  const magnitude = Math.hypot(dx, dy);
  if (magnitude > 1) {
    dx /= magnitude;
    dy /= magnitude;
  }
  if (p.cover) {
    if (dx * p.cover.nx + dy * p.cover.ny > 0.45) p.cover = null;
    else {
      const vertical = p.cover.nx !== 0;
      dx = vertical ? 0 : dx;
      dy = vertical ? dy : 0;
    }
  }
  const sprint = input.sprint && magnitude > 0 && p.stamina > 0 && !p.crouching && !p.defending;
  const speed = p.crouching ? 27 : p.defending ? 31 : sprint ? 88 : 51;
  p.stamina = clamp(p.stamina + (sprint ? -17 : 12) * dt, 0, 100);
  p.speed = magnitude ? speed : 0;
  if (magnitude > 0) {
    if (!Number.isFinite(input.aimAngle) && !input.fire && !p.cover) p.angle = Math.atan2(dy, dx);
    movePlayer(state, dx * speed * dt, dy * speed * dt);
  }
  if (p.cover) {
    const coordinate = p.cover.nx !== 0 ? p.y : p.x;
    if (coordinate < p.cover.min - 1 || coordinate > p.cover.max + 1) p.cover = null;
  }
}
function updateTraffic(state, dt) {
  for (const vehicle of state.vehicles) {
    if (vehicle.policeControlled) continue;
    if (vehicle.kind !== 'traffic' || vehicle.occupied || vehicle.health <= 0 || !vehicle.route)
      continue;
    const waypoint = vehicle.route[vehicle.routeIndex];
    const remaining = distance(vehicle, waypoint);
    if (remaining < 6) {
      vehicle.routeIndex = (vehicle.routeIndex + 1) % vehicle.route.length;
      continue;
    }
    const desiredAngle = angleTo(vehicle, waypoint);
    const desiredSpeed = 37 + (Number(vehicle.id.split('-').pop()) % 7) * 3;
    const obstacle = state.vehicles.some(
      (other) =>
        other.id !== vehicle.id &&
        other.health > 0 &&
        distance(other, vehicle) < 31 &&
        Math.abs(normalizeAngle(angleTo(vehicle, other) - desiredAngle)) < 0.8,
    );
    vehicle.speed += ((obstacle ? 0 : desiredSpeed) - vehicle.speed) * Math.min(1, dt * 3);
    vehicle.angle = desiredAngle;
    const travel = Math.min(remaining, vehicle.speed * dt);
    if (moveBody(vehicle, Math.cos(vehicle.angle) * travel, Math.sin(vehicle.angle) * travel, 8))
      vehicle.speed = 0;
  }
}
function updatePedestrians(state, dt) {
  for (const person of state.pedestrians) {
    if (person.health <= 0) continue;
    person.panic = Math.max(0, person.panic - dt);
    if (person.panic > 0 && distance(person, state.player) < 100) {
      person.angle = angleTo(state.player, person);
      moveBody(person, Math.cos(person.angle) * 43 * dt, Math.sin(person.angle) * 43 * dt, 6);
    } else {
      const direction = Math.sin(person.angle) >= 0 ? 1 : -1;
      person.angle = (direction * Math.PI) / 2;
      person.x += (person.homeX - person.x) * Math.min(1, dt);
      moveBody(person, 0, direction * person.speed * dt, 6);
      if (person.y > person.maxY || person.y < person.minY) person.angle *= -1;
    }
  }
}
function spawnPolice(state) {
  state.policeDispatch.nextDeployment = state.time;
}
function updatePolice(state, dt, input = {}) {
  updatePolicing(state, dt, input, policeContext(state));
}
function updateHostiles(state, dt) {
  for (const hostile of state.hostiles) {
    if (hostile.health <= 0) continue;
    hostile.fireCooldown = Math.max(0, hostile.fireCooldown - dt);
    updateEnemyReload(hostile, dt);
    const range = distance(hostile, state.player);
    if (range > 500) continue;
    hostile.angle = angleTo(hostile, state.player);
    if (
      range > (WEAPONS[hostile.weapon]?.mode === 'melee' ? 18 : 120) ||
      !hasLineOfSight(hostile, state.player)
    )
      moveBody(hostile, Math.cos(hostile.angle) * 32 * dt, Math.sin(hostile.angle) * 32 * dt, 7);
    if (range < 250 && hasLineOfSight(hostile, state.player) && hostile.fireCooldown === 0)
      fireHostile(state, hostile);
  }
}
function spawnEncounter(state, definition) {
  for (let i = 0; i < definition.count; i += 1) {
    const x = definition.x + (i % 2 ? -22 : 22);
    const y = definition.y + Math.floor(i / 2) * 25;
    state.hostiles.push({
      id: nextId(state, 'hostile'),
      kind: 'hostile',
      x,
      y,
      angle: Math.PI,
      health: definition.health || 70,
      weapon: definition.weapon || 'pistol',
      fireCooldown: 1.8 + i * 0.5,
      encounter: state.mission.id,
      color: '#aa6f69',
      speed: 32,
    });
  }
}
function enterStage(state) {
  const definition = MISSIONS.find((mission) => mission.id === state.mission.id);
  const stage = definition.stages[state.mission.stage];
  Object.assign(state.mission, {
    title: definition.title,
    objective: stage.objective,
    stageType: stage.type,
    target: stage.target ? clone(stage.target) : null,
    stageElapsed: 0,
    deadline: stage.deadline || null,
  });
  if (stage.type === 'escape') {
    raiseWanted(state, stage.heat || 1);
    state.mission.target = {
      ...state.wanted.lastSeen,
      radius: state.wanted.searchRadius,
      name: 'Leave the police search circle',
    };
    spawnPolice(state);
  }
  if (stage.dialogue) say(state, stage.dialogue);
  if (stage.spawnVehicle) {
    const existing = state.vehicles.find((vehicle) => vehicle.id === stage.spawnVehicle.id);
    if (!existing) state.vehicles.push(createVehicle(state, stage.spawnVehicle));
    else if (existing.health <= 0)
      Object.assign(existing, createVehicle(state, stage.spawnVehicle));
  }
  notify(state, stage.objective, 'mission');
}
function advanceMission(state) {
  if (!state.mission) return;
  const definition = MISSIONS.find((mission) => mission.id === state.mission.id);
  const completedStage = definition.stages[state.mission.stage];
  if (completedStage.encounter) spawnEncounter(state, completedStage.encounter);
  state.mission.stage += 1;
  if (state.mission.stage >= definition.stages.length) {
    state.progress.completed.push(definition.id);
    state.player.money += definition.reward;
    state.progress.cashEarned += definition.reward;
    state.hostiles = state.hostiles.filter((hostile) => hostile.encounter !== definition.id);
    state.mission = null;
    notify(state, `${definition.title} complete · +$${definition.reward}`, 'success');
    const next = MISSIONS.find((mission) => mission.prerequisite === definition.id);
    if (next) notify(state, `New contact: ${next.contact} · ${next.title}`, 'mission');
    return;
  }
  enterStage(state);
}
export function startMission(state, id) {
  const definition = MISSIONS.find((mission) => mission.id === id);
  if (
    !definition ||
    state.mission ||
    state.player.health <= 0 ||
    state.wanted.level > 0 ||
    state.progress.completed.includes(id)
  )
    return false;
  if (definition.prerequisite && !state.progress.completed.includes(definition.prerequisite))
    return false;
  state.mission = {
    id,
    stage: 0,
    elapsed: 0,
    stageElapsed: 0,
    objective: '',
    stageType: '',
    target: null,
  };
  state.hostiles = [];
  state.taxiJob = null;
  enterStage(state);
  return true;
}
function failMission(state, reason) {
  if (!state.mission) return;
  const id = state.mission.id;
  state.progress.failed.push({ id, reason, time: state.time });
  state.progress.failed = state.progress.failed.slice(-30);
  state.mission = null;
  state.hostiles = [];
  notify(state, `Assignment failed · ${reason}`, 'danger');
}
function vehicleRequirementMet(state, required) {
  const vehicle = currentVehicle(state);
  return !required || Boolean(vehicle && (vehicle.id === required || vehicle.spec === required));
}
function updateMission(state, dt) {
  if (!state.mission) return;
  const definition = MISSIONS.find((mission) => mission.id === state.mission.id);
  const stage = definition.stages[state.mission.stage];
  state.mission.elapsed += dt;
  state.mission.stageElapsed += dt;
  if (stage.type === 'vehicle') {
    const requestedVehicle = state.vehicles.find((vehicle) => vehicle.id === stage.vehicle);
    if (requestedVehicle && state.mission.target) {
      state.mission.target.x = requestedVehicle.x;
      state.mission.target.y = requestedVehicle.y;
    }
    if (requestedVehicle?.health <= 0) {
      failMission(state, 'The mission vehicle was destroyed.');
      return;
    }
  }
  if (stage.deadline && state.mission.stageElapsed > stage.deadline) {
    failMission(state, 'The delivery window closed.');
    return;
  }
  const essentialVehicle =
    stage.requiredVehicle && state.vehicles.find((vehicle) => vehicle.id === stage.requiredVehicle);
  const protectedVehicle =
    stage.protectVehicle && state.vehicles.find((vehicle) => vehicle.id === stage.protectVehicle);
  if (essentialVehicle?.health <= 0 || protectedVehicle?.health <= 0) {
    failMission(state, 'The mission vehicle was destroyed.');
    return;
  }
  if (stage.type === 'vehicle' && state.player.vehicleId === stage.vehicle) advanceMission(state);
  else if (
    (stage.type === 'drive' || stage.type === 'reach') &&
    distance(state.player, stage.target) < stage.target.radius &&
    vehicleRequirementMet(state, stage.requiredVehicle) &&
    (!stage.onFoot || !state.player.vehicleId)
  )
    advanceMission(state);
  else if (
    stage.type === 'combat' &&
    !state.hostiles.some((hostile) => hostile.encounter === definition.id && hostile.health > 0)
  )
    advanceMission(state);
  else if (stage.type === 'escape') {
    if (state.mission.target) Object.assign(state.mission.target, state.wanted.lastSeen);
    if (!state.wanted.level) advanceMission(state);
  }
}

function validExitPoint(state, vehicle) {
  for (const offset of [Math.PI / 2, -Math.PI / 2, Math.PI, 0]) {
    const angle = vehicle.angle + offset;
    const point = { x: vehicle.x + Math.cos(angle) * 25, y: vehicle.y + Math.sin(angle) * 25 };
    if (
      !isBlocked(point.x, point.y, 7) &&
      !state.vehicles.some((other) => other.id !== vehicle.id && distance(point, other) < 17)
    )
      return point;
  }
  return null;
}
function interactionCandidates(state) {
  const candidates = [];
  const player = state.player;
  if (state.mission && state.mission.stageType === 'interact') {
    const stage = MISSIONS.find((mission) => mission.id === state.mission.id).stages[
      state.mission.stage
    ];
    candidates.push({
      ...state.mission.target,
      id: `mission-${state.mission.id}`,
      type: 'objective',
      prompt: stage.objective,
      available:
        vehicleRequirementMet(state, stage.requiredVehicle) && (!stage.onFoot || !player.vehicleId),
      radius: stage.target.radius + 8,
    });
  }
  if (!state.mission) {
    for (const mission of MISSIONS) {
      if (
        state.progress.completed.includes(mission.id) ||
        (mission.prerequisite && !state.progress.completed.includes(mission.prerequisite))
      )
        continue;
      const position = mission.stages[0].target;
      candidates.push({
        ...position,
        id: mission.id,
        missionId: mission.id,
        name: `${mission.contact} · ${mission.title}`,
        type: 'mission',
        prompt: `Begin ${mission.title}`,
        available: state.wanted.level === 0,
        radius: 38,
      });
    }
  }
  if (!player.vehicleId) {
    for (const pickup of state.pickups || [])
      if (pickup.available)
        candidates.push({
          ...pickup,
          type: 'pickup',
          name: WEAPONS[pickup.weapon]?.name || pickup.name,
          prompt: `Pick up ${pickup.type === 'object' ? pickup.name : WEAPONS[pickup.weapon]?.name || pickup.name}`,
          radius: 27,
          available: true,
        });
    for (const vehicle of state.vehicles) {
      if (vehicle.health <= 0 || (vehicle.kind === 'traffic' && vehicle.speed > 24)) continue;
      candidates.push({
        id: vehicle.id,
        type: 'vehicle',
        x: vehicle.x,
        y: vehicle.y,
        name: VEHICLE_SPECS[vehicle.spec].name,
        prompt: `Enter ${VEHICLE_SPECS[vehicle.spec].name}`,
        radius: 31,
        available: true,
      });
    }
  }
  for (const location of WORLD.locations)
    candidates.push({ ...location, prompt: location.description, available: true, radius: 34 });
  return candidates
    .map((item) => ({ ...item, distance: distance(player, item) }))
    .filter((item) => item.distance < item.radius)
    .sort((a, b) => {
      const priority = { objective: 0, mission: 1, pickup: 1.5, vehicle: 2 };
      const currentStage = state.mission
        ? MISSIONS.find((mission) => mission.id === state.mission.id)?.stages[state.mission.stage]
        : null;
      const requiredVehicle = currentStage?.requiredVehicle || currentStage?.vehicle;
      const rank = (item) => {
        if (item.type === 'objective' && !item.available) return 2.5;
        if (item.type === 'vehicle' && requiredVehicle) {
          const vehicle = state.vehicles.find((vehicle) => vehicle.id === item.id);
          if (vehicle && (vehicle.id === requiredVehicle || vehicle.spec === requiredVehicle))
            return 1.3;
        }
        if (!(item.type in priority) && item.distance <= 16) return 1.4;
        return priority[item.type] ?? 3;
      };
      return rank(a) - rank(b) || a.distance - b.distance;
    });
}
export function nearestInteractable(state) {
  if (state.player.health <= 0) return null;
  if (state.dialogue)
    return {
      id: 'dialogue',
      type: 'dialogue',
      name: state.dialogue.speaker,
      x: state.player.x,
      y: state.player.y,
      distance: 0,
      prompt: 'Continue conversation',
      available: true,
    };
  if (state.player.vehicleId) {
    const objective = interactionCandidates(state).find(
      (item) => item.type === 'objective' && item.available,
    );
    if (objective) return objective;
    const service = interactionCandidates(state).find((item) =>
      ['garage', 'taxi'].includes(item.type),
    );
    if (service) return service;
    return {
      id: state.player.vehicleId,
      type: 'exit',
      name: 'Exit vehicle',
      x: state.player.x,
      y: state.player.y,
      distance: 0,
      prompt: 'Exit vehicle',
      available: true,
    };
  }
  return interactionCandidates(state)[0] || null;
}
function pay(state, amount) {
  if (state.player.money < amount) {
    notify(state, `You need $${amount}.`, 'info');
    return false;
  }
  state.player.money -= amount;
  return true;
}
function atWeaponStore(state) {
  return (
    !state.player.vehicleId &&
    state.player.health > 0 &&
    WORLD.locations.some(
      (location) => location.type === 'weapons' && distance(location, state.player) < 42,
    )
  );
}
export function buyWeapon(state, id) {
  const weapon = WEAPONS[id];
  if (!weapon || !SHOP_WEAPONS.includes(id) || !atWeaponStore(state)) return false;
  if (state.player.ownedWeapons.includes(id)) {
    equipOwnedWeapon(state, id);
    notify(state, `${weapon.name} equipped from your stored loadout.`, 'success');
    return true;
  }
  if (!pay(state, weapon.cost)) return false;
  acquireWeapon(state, id, weapon.mode === 'melee' ? 0 : (weapon.supply ?? weapon.clipSize * 5));
  notify(state, `${weapon.name} purchased.`, 'success');
  return true;
}
export function buyAmmo(state, id = state.player.weapon) {
  const weapon = WEAPONS[id],
    ammo = state.player.ammo[id];
  if (
    !weapon ||
    !SHOP_WEAPONS.includes(id) ||
    weapon.mode === 'melee' ||
    !state.player.ownedWeapons.includes(id) ||
    !atWeaponStore(state) ||
    !ammo
  )
    return false;
  if ((weapon.mode === 'throwable' && ammo.clip >= weapon.clipSize) || ammo.reserve >= 100000)
    return false;
  if (!pay(state, weapon.ammoCost)) return false;
  if (weapon.mode === 'throwable')
    ammo.clip = Math.min(weapon.clipSize, ammo.clip + (weapon.supply || 3));
  else
    ammo.reserve = Math.min(
      100000,
      ammo.reserve + (weapon.mode === 'rocket' ? 1 : weapon.clipSize * 3),
    );
  notify(state, `${weapon.name} ammunition restocked.`, 'success');
  return true;
}
export function pickupWeapon(state, id) {
  const pickup = state.pickups.find((item) => item.id === id && item.available);
  if (
    !pickup ||
    state.player.vehicleId ||
    state.player.health <= 0 ||
    distance(state.player, pickup) >= 28 ||
    !hasLineOfSight(state.player, pickup)
  )
    return false;
  if (
    !acquireWeapon(
      state,
      pickup.weapon,
      pickup.ammo ?? WEAPONS[pickup.weapon].clipSize,
      pickup.type === 'object'
        ? { name: pickup.name, material: pickup.material, pickupId: pickup.id }
        : null,
    )
  )
    return false;
  pickup.available = false;
  pickup.remaining = pickup.respawnSeconds || 0;
  notify(
    state,
    `Collected ${pickup.type === 'object' ? pickup.name : WEAPONS[pickup.weapon].name}.`,
    'success',
  );
  return true;
}
function startTaxiJob(state) {
  if (state.mission) {
    notify(state, 'Finish your assignment before taking a fare.');
    return false;
  }
  if (currentVehicle(state)?.spec !== 'taxi') {
    notify(state, 'Bring a taxi to the rank.');
    return false;
  }
  if (state.taxiJob) {
    notify(state, 'A passenger is already waiting.');
    return false;
  }
  const routes = [
    {
      pickup: target(1080, 440, 'Night nurse'),
      dropoff: target(180, 960, 'Southbank Clinic'),
      fare: 140,
    },
    {
      pickup: target(1620, 700, 'Dock worker'),
      dropoff: target(480, 180, 'Old Quay home'),
      fare: 180,
    },
    {
      pickup: target(780, 1220, 'Late student'),
      dropoff: target(1080, 180, 'Civic Market'),
      fare: 160,
    },
    {
      pickup: target(180, 440, 'Ferry visitor'),
      dropoff: target(1380, 960, 'East Port lodging'),
      fare: 170,
    },
  ];
  const route = routes[state.progress.fares % routes.length];
  state.taxiJob = {
    ...clone(route),
    stage: 'pickup',
    target: clone(route.pickup),
    elapsed: 0,
    timeLimit: 210,
  };
  notify(state, `Taxi dispatch · Pick up the ${route.pickup.name.toLowerCase()}.`, 'mission');
  return true;
}
function updateTaxiJob(state, dt) {
  const job = state.taxiJob;
  if (!job) return;
  job.elapsed += dt;
  if (job.elapsed > job.timeLimit || state.wanted.level >= 3) {
    notify(state, 'Fare canceled. The passenger found another ride.', 'danger');
    state.taxiJob = null;
    return;
  }
  const vehicle = currentVehicle(state);
  if (
    vehicle?.spec !== 'taxi' ||
    distance(vehicle, job.target) > 32 ||
    Math.abs(vehicle.speed) > 20
  )
    return;
  if (job.stage === 'pickup') {
    job.stage = 'dropoff';
    job.target = clone(job.dropoff);
    say(state, [['Passenger', `Thanks for stopping. ${job.dropoff.name}, please.`]]);
    notify(state, `Passenger aboard · Drive to ${job.dropoff.name}.`, 'mission');
  } else {
    const tip = Math.max(0, Math.round((job.timeLimit - job.elapsed) * 0.25));
    state.player.money += job.fare + tip;
    state.progress.cashEarned += job.fare + tip;
    state.progress.fares += 1;
    notify(state, `Fare complete · $${job.fare} + $${tip} tip`, 'success');
    state.taxiJob = null;
  }
}

export function interact(state) {
  const candidate = nearestInteractable(state);
  if (!candidate) return null;
  if (candidate.type === 'dialogue') {
    state.dialogue.index += 1;
    const line = state.dialogue.lines[state.dialogue.index];
    if (!line) state.dialogue = null;
    else {
      [state.dialogue.speaker, state.dialogue.text] = line;
      state.dialogue.expires = state.time + 14;
    }
    return candidate;
  }
  if (!candidate.available) {
    notify(state, 'Finish the objective on foot or bring the requested vehicle.');
    return candidate;
  }
  if (candidate.type === 'objective') {
    advanceMission(state);
    return candidate;
  }
  if (candidate.type === 'mission') {
    startMission(state, candidate.missionId);
    return candidate;
  }
  if (candidate.type === 'pickup') {
    pickupWeapon(state, candidate.id);
    return candidate;
  }
  if (candidate.type === 'activity') {
    if (state.mission || state.taxiJob || state.wanted.level) {
      notify(state, 'Finish the assignment and lose police attention before taking a break.');
      return null;
    }
    return candidate;
  }
  if (candidate.type === 'vehicle') {
    if (state.player.traversal || state.player.z > 2 || state.player.dodgeRemaining > 0) {
      notify(state, 'Land and finish moving before entering the vehicle.');
      return null;
    }
    const vehicle = state.vehicles.find((item) => item.id === candidate.id);
    if (vehicle.policeControlled) {
      if (Math.abs(vehicle.speed) > 20) {
        notify(state, 'The cruiser is moving too fast to take.');
        return null;
      }
      relinquishPoliceVehicle(state, vehicle, policeContext(state));
      reportCrime(state, { type: 'vehicle-theft', severity: 2 });
    }
    vehicle.occupied = true;
    const isOwned = vehicle.id === 'starter-taxi' || vehicle.id === 'medicine-van';
    if (!isOwned && !vehicle.stolen) {
      vehicle.stolen = true;
      reportCrime(state, { type: 'vehicle-theft', severity: vehicle.spec === 'police' ? 2 : 1 });
      notify(state, `Borrowed ${VEHICLE_SPECS[vehicle.spec].name}.`, 'info');
    }
    vehicle.kind = 'parked';
    state.player.cover = null;
    state.player.crouching = false;
    state.player.defending = false;
    state.player.meleeAction = null;
    state.player.vehicleId = vehicle.id;
    state.player.x = vehicle.x;
    state.player.y = vehicle.y;
    state.player.angle = vehicle.angle;
    return candidate;
  }
  if (candidate.type === 'exit') {
    const vehicle = currentVehicle(state);
    if (Math.abs(vehicle.speed) > 42) {
      notify(state, 'Slow down before stepping out.');
      return candidate;
    }
    const point = validExitPoint(state, vehicle);
    if (!point) {
      notify(state, 'The doors are blocked. Move the vehicle.');
      return candidate;
    }
    vehicle.occupied = false;
    vehicle.speed = 0;
    state.player.vehicleId = null;
    Object.assign(state.player, point, { speed: 0 });
    return candidate;
  }
  if (candidate.type === 'garage') {
    const vehicle = currentVehicle(state);
    if (!vehicle) notify(state, 'Bring a vehicle to Saira’s garage.');
    else if (pay(state, candidate.cost)) {
      vehicle.health = vehicle.maxHealth || VEHICLE_SPECS[vehicle.spec].health;
      notify(state, 'Repairs complete. Drive carefully.', 'success');
    }
  } else if (candidate.type === 'home') {
    if (state.wanted.level) notify(state, 'Lose the police before returning home.');
    else {
      state.saveRequested = true;
      state.player.health = Math.min(100, state.player.health + 25);
      state.checkpoint = { x: candidate.x, y: candidate.y };
      notify(state, 'Rested at Voss Dispatch. Progress saved.', 'success');
    }
  } else if (candidate.type === 'clinic' || candidate.type === 'food') {
    if (pay(state, candidate.cost)) {
      state.player.health = Math.min(
        100,
        state.player.health + (candidate.type === 'clinic' ? 100 : 35),
      );
      notify(
        state,
        candidate.type === 'clinic' ? 'Treatment complete.' : 'A warm meal. Health restored.',
        'success',
      );
    }
  } else if (candidate.type === 'armour') {
    if (pay(state, candidate.cost)) {
      state.player.armour = 100;
      for (const weapon of state.player.weapons)
        if (['ballistic', 'rocket'].includes(WEAPONS[weapon].mode))
          state.player.ammo[weapon].reserve = Math.min(
            100000,
            state.player.ammo[weapon].reserve + WEAPONS[weapon].clipSize * 2,
          );
      notify(state, 'Body armour equipped. Ammunition restocked.', 'success');
    }
  } else if (candidate.type === 'weapons') {
    const nextWeapon = SHOP_WEAPONS.find((id) => !state.player.ownedWeapons.includes(id));
    if (nextWeapon) buyWeapon(state, nextWeapon);
    else buyAmmo(state);
  } else if (candidate.type === 'taxi') startTaxiJob(state);
  else if (candidate.type === 'radio') {
    state.radio.station = (state.radio.station + 1) % state.radio.stations.length;
    notify(state, state.radio.stations[state.radio.station]);
  } else notify(state, candidate.description || candidate.name);
  return candidate;
}

export function updateSimulation(state, dt, input = {}) {
  if (!Number.isFinite(dt) || dt <= 0) return state;
  const elapsed = Math.min(dt, 0.5);
  const steps = Math.max(1, Math.ceil(elapsed / (1 / 60)));
  const step = elapsed / steps;
  if (input.confirm && !state.lastInput.confirm) interact(state);
  if (input.reload && !state.lastInput.reload) reloadWeapon(state);
  if (input.weapon && input.weapon !== state.player.weapon) selectWeapon(state, input.weapon);
  if (input.cover && !state.lastInput.cover) toggleCover(state);
  if (input.jump && !state.lastInput.jump) jumpOrVault(state);
  if (input.vault && !state.lastInput.vault) jumpOrVault(state, { vaultOnly: true });
  const context = combatContext(state);
  combatDefenseInput(state, input, context);
  for (let i = 0; i < steps; i += 1) {
    state.time += step;
    state.clock = (20.25 + state.time / 90) % 24;
    state.player.fireCooldown = Math.max(0, state.player.fireCooldown - step);
    state.player.recoil = Math.max(0, state.player.recoil - step * 0.2);
    if (state.player.reloadRemaining > 0) {
      state.player.reloadRemaining = Math.max(0, state.player.reloadRemaining - step);
      if (state.player.reloadRemaining === 0) finishReload(state);
    }
    if (state.respawnTimer > 0) {
      state.respawnTimer -= step;
      updateOrdnance(state, step, context);
      if (state.respawnTimer <= 0) respawn(state);
      continue;
    }
    const vehicle = currentVehicle(state);
    if (vehicle) {
      drive(state, vehicle, step, input);
      state.player.cover = null;
      state.player.z = 0;
      state.player.vz = 0;
      state.player.crouching = false;
      if (Number.isFinite(input.aimAngle) && WEAPONS[state.player.weapon].vehicleAllowed)
        state.player.angle = normalizeAngle(input.aimAngle);
    } else walk(state, step, input);
    if (input.fire) fireWeapon(state, input);
    updateTraffic(state, step);
    updatePedestrians(state, step);
    updateHostiles(state, step);
    updatePolice(state, step, input);
    updateBullets(state, step);
    updateMelee(state, step, context);
    updateOrdnance(state, step, context);
    if (state.player.health > 0) {
      updateMission(state, step);
      updateTaxiJob(state, step);
    }
    if (state.dialogue && state.time > state.dialogue.expires) state.dialogue = null;
    state.notifications = state.notifications.filter((notice) => notice.expires > state.time);
  }
  const district = WORLD.districts.find(
    (item) =>
      state.player.x >= item.x &&
      state.player.x < item.x + item.w &&
      state.player.y >= item.y &&
      state.player.y < item.y + item.h,
  );
  if (district) state.district = district.id;
  state.lastInput = Object.fromEntries(
    [
      'confirm',
      'reload',
      'cover',
      'jump',
      'vault',
      'block',
      'dodge',
      'counter',
      'disarm',
      'fire',
    ].map((key) => [key, Boolean(input[key])]),
  );
  return state;
}

export function saveGame(state) {
  const saved = clone(state);
  saved.lastInput = {};
  saved.saveRequested = false;
  return JSON.stringify({ format: 'lowlight-save', version: SAVE_VERSION, state: saved });
}

function finiteNumber(value, low, high) {
  return typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
}
function validPoint(value) {
  return value && finiteNumber(value.x, 0, WORLD.width) && finiteNumber(value.y, 0, WORLD.height);
}
export function restoreGame(serialized) {
  let saved;
  try {
    saved = typeof serialized === 'string' ? JSON.parse(serialized) : clone(serialized);
  } catch {
    throw new Error('This save is not valid JSON.');
  }
  if (!saved || saved.format !== 'lowlight-save' || saved.version !== SAVE_VERSION)
    throw new Error('This save version is not supported.');
  const state = saved.state;
  if (
    !state ||
    !validPoint(state.player) ||
    !finiteNumber(state.player.health, 0, 100) ||
    !finiteNumber(state.player.armour, 0, 100) ||
    !finiteNumber(state.player.money, 0, 1e9) ||
    !finiteNumber(state.time, 0, 1e9) ||
    !Number.isInteger(state.rng) ||
    !Array.isArray(state.vehicles) ||
    !Array.isArray(state.pedestrians) ||
    !Array.isArray(state.hostiles) ||
    !Array.isArray(state.police) ||
    !Array.isArray(state.bullets) ||
    !state.wanted ||
    !state.progress ||
    !Array.isArray(state.progress.completed) ||
    !Array.isArray(state.progress.failed) ||
    !WEAPONS[state.player.weapon] ||
    !Array.isArray(state.player.weapons) ||
    !Number.isInteger(state.sequence) ||
    state.sequence < 0 ||
    !finiteNumber(state.respawnTimer, 0, 3) ||
    !finiteNumber(state.player.angle, -TAU, TAU) ||
    !finiteNumber(state.player.stamina, 0, 100) ||
    !finiteNumber(state.player.fireCooldown, 0, 5) ||
    !finiteNumber(state.player.reloadRemaining, 0, 5) ||
    !finiteNumber(state.player.speed, -300, 300) ||
    !finiteNumber(state.lastCrimeTime, -1000, 1e9)
  )
    throw new Error('The save is incomplete or corrupted.');
  if (state.combatVersion === undefined) initializeCombat(state, WORLD.pickups || []);
  validateCombatSave(state, WORLD);
  if (state.policeVersion === undefined) initializePolicing(state);
  validatePoliceSave(state, WORLD);
  if (
    state.vehicles.length > 200 ||
    state.pedestrians.length > 500 ||
    state.hostiles.length > 100 ||
    state.police.length > 100 ||
    state.bullets.length > 1000
  )
    throw new Error('The save contains too many entities.');
  if (
    state.vehicles.some(
      (vehicle) =>
        !validPoint(vehicle) ||
        !VEHICLE_SPECS[vehicle.spec] ||
        !finiteNumber(vehicle.health, 0, 1000) ||
        !finiteNumber(vehicle.angle, -TAU, TAU) ||
        !finiteNumber(vehicle.speed, -300, 300),
    )
  )
    throw new Error('The saved vehicles are invalid.');
  if (
    state.vehicles.some(
      (vehicle) =>
        typeof vehicle.id !== 'string' ||
        !['traffic', 'parked'].includes(vehicle.kind) ||
        (vehicle.route &&
          (!Array.isArray(vehicle.route) ||
            vehicle.route.length > 20 ||
            vehicle.route.some((point) => !validPoint(point)) ||
            !Number.isInteger(vehicle.routeIndex) ||
            vehicle.routeIndex < 0 ||
            vehicle.routeIndex >= vehicle.route.length)),
    )
  )
    throw new Error('The saved traffic routes are invalid.');
  if (
    [...state.pedestrians, ...state.hostiles, ...state.police].some(
      (person) => !validPoint(person) || !finiteNumber(person.health, 0, 1000),
    )
  )
    throw new Error('The saved people are invalid.');
  if (
    state.pedestrians.some(
      (person) =>
        !finiteNumber(person.speed, 0, 100) ||
        !finiteNumber(person.homeX, 0, WORLD.width) ||
        !finiteNumber(person.minY, 0, WORLD.height) ||
        !finiteNumber(person.maxY, 0, WORLD.height) ||
        !finiteNumber(person.panic, 0, 100),
    )
  )
    throw new Error('The saved pedestrians are invalid.');
  if (
    [...state.hostiles, ...state.police].some(
      (person) =>
        !finiteNumber(person.fireCooldown, 0, 1000) ||
        !finiteNumber(person.speed, 0, 200) ||
        !WEAPONS[person.weapon],
    )
  )
    throw new Error('The saved combatants are invalid.');
  if (
    state.bullets.some(
      (bullet) =>
        !validPoint(bullet) ||
        !finiteNumber(bullet.prevX, 0, WORLD.width) ||
        !finiteNumber(bullet.prevY, 0, WORLD.height) ||
        !finiteNumber(bullet.vx, -1000, 1000) ||
        !finiteNumber(bullet.vy, -1000, 1000) ||
        !finiteNumber(bullet.remaining, 0, 1000) ||
        !finiteNumber(bullet.damage, 0, 1000) ||
        typeof bullet.owner !== 'string',
    )
  )
    throw new Error('The saved projectiles are invalid.');
  if (
    !Number.isInteger(state.wanted.level) ||
    !finiteNumber(state.wanted.level, 0, 6) ||
    !validPoint(state.wanted.lastSeen) ||
    !finiteNumber(state.wanted.searchRadius, 0, 1000) ||
    !finiteNumber(state.wanted.timer, 0, 1e9) ||
    !finiteNumber(state.wanted.unseen, 0, 1e9) ||
    !finiteNumber(state.wanted.pursuitTime, 0, 1e9) ||
    !['clear', 'pursuit', 'search', 'cooling', 'arrest'].includes(state.wanted.status)
  )
    throw new Error('The saved police state is invalid.');
  if (
    state.player.weapons.some((id) => !WEAPONS[id]) ||
    !state.player.weapons.includes(state.player.weapon)
  )
    throw new Error('The saved weapon inventory is invalid.');
  for (const id of Object.keys(WEAPONS)) {
    const ammo = state.player.ammo?.[id];
    if (
      !ammo ||
      !Number.isInteger(ammo.clip) ||
      ammo.clip < 0 ||
      ammo.clip > WEAPONS[id].clipSize ||
      !Number.isInteger(ammo.reserve) ||
      ammo.reserve < 0 ||
      ammo.reserve > 100000
    )
      throw new Error('The saved ammunition is invalid.');
  }
  if (
    state.player.vehicleId &&
    !state.vehicles.some((vehicle) => vehicle.id === state.player.vehicleId && vehicle.health > 0)
  )
    throw new Error('The saved player vehicle is missing.');
  if (state.mission) {
    const definition = MISSIONS.find((mission) => mission.id === state.mission.id);
    if (
      !definition ||
      !Number.isInteger(state.mission.stage) ||
      !definition.stages[state.mission.stage] ||
      !finiteNumber(state.mission.elapsed, 0, 1e9) ||
      !finiteNumber(state.mission.stageElapsed, 0, 1e9)
    )
      throw new Error('The saved assignment is invalid.');
    const stage = definition.stages[state.mission.stage];
    state.mission.title = definition.title;
    state.mission.objective = stage.objective;
    state.mission.stageType = stage.type;
    if (stage.target) state.mission.target = clone(stage.target);
    else if (stage.type === 'escape')
      state.mission.target = {
        ...state.wanted.lastSeen,
        radius: state.wanted.searchRadius,
        name: 'Leave the police search circle',
      };
  }
  if (state.progress.completed.some((id) => !MISSIONS.some((mission) => mission.id === id)))
    throw new Error('The saved campaign progress is invalid.');
  if (
    ['deaths', 'fares', 'kills', 'distanceDriven', 'cashEarned'].some(
      (key) => !finiteNumber(state.progress[key], 0, 1e12),
    )
  )
    throw new Error('The saved statistics are invalid.');
  if (
    state.taxiJob &&
    (!validPoint(state.taxiJob.target) ||
      !validPoint(state.taxiJob.pickup) ||
      !validPoint(state.taxiJob.dropoff) ||
      !['pickup', 'dropoff'].includes(state.taxiJob.stage) ||
      !finiteNumber(state.taxiJob.fare, 0, 10000) ||
      !finiteNumber(state.taxiJob.elapsed, 0, 1e9) ||
      !finiteNumber(state.taxiJob.timeLimit, 0, 10000))
  )
    throw new Error('The saved taxi fare is invalid.');
  const baseline = createSimulation();
  for (const key of [
    'notifications',
    'dialogueHistory',
    'weather',
    'radio',
    'checkpoint',
    'particles',
  ])
    if (state[key] === undefined) state[key] = baseline[key];
  state.lastInput = {};
  state.saveRequested = false;
  return state;
}
