import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSimulation,
  updateSimulation,
  forceWanted,
  reportCrime,
  saveGame,
  restoreGame,
  fireWeapon,
  reloadWeapon,
  interact,
  WORLD,
} from '../src/simulation.js';
import { POLICE_TIERS } from '../src/police.js';
import { acquireWeapon } from '../src/combat.js';

function free() {
  const state = createSimulation(704);
  state.mission = null;
  state.dialogue = null;
  state.vehicles = [];
  state.pedestrians = [];
  state.police = [];
  state.hostiles = [];
  state.player.x = 780;
  state.player.y = 700;
  state.player.angle = 0;
  return state;
}
function tick(state, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds * 60); i++) updateSimulation(state, 1 / 60, input);
  return state;
}
function civilian(id, x, y) {
  return {
    id,
    x,
    y,
    health: 100,
    angle: Math.PI / 2,
    speed: 0,
    homeX: x,
    minY: y - 1,
    maxY: y + 1,
    panic: 0,
  };
}
function constable(x, y, changes = {}) {
  return {
    id: 'near-officer',
    kind: 'police',
    role: 'patrol',
    tier: 1,
    x,
    y,
    z: 0,
    health: 85,
    armour: 0,
    speed: 0,
    weapon: 'unarmed',
    fireCooldown: 1000,
    inVehicle: false,
    vehicleId: null,
    nextRoute: 1000,
    ...changes,
  };
}
function quiet(state) {
  state.police.forEach((actor) => (actor.fireCooldown = 1000));
  return state;
}

test('unwitnessed crime does not invent a police report or the offender location', () => {
  const state = free();
  assert.equal(reportCrime(state, { type: 'assault' }), false);
  tick(state, 4);
  assert.equal(state.wanted.level, 0);
  assert.equal(state.policeDispatch.reports.length, 0);
  assert.equal(state.police.length, 0);
});

test('civilian reports have a real delay and retain the crime location after the offender leaves', () => {
  const state = free();
  state.pedestrians = [civilian('witness', 820, 700)];
  assert.equal(reportCrime(state, { type: 'gunfire' }), true);
  assert.equal(state.wanted.level, 0);
  assert.equal(state.policeDispatch.reports.length, 1);
  tick(state, 1);
  assert.equal(state.wanted.level, 0);
  state.player.x = 1620;
  state.player.y = 1220;
  tick(state, 2.1);
  assert.equal(state.wanted.level, 1);
  assert.deepEqual(state.wanted.lastSeen, { x: 780, y: 700 });
  assert.equal(state.policeDispatch.reports.length, 0);
});

test('a dead witness cannot finish a queued report and occluded bystanders cannot identify an unseen offender', () => {
  const state = free(),
    witness = civilian('witness', 820, 700);
  state.pedestrians = [witness];
  reportCrime(state, { type: 'assault' });
  witness.health = 0;
  tick(state, 3.2);
  assert.equal(state.wanted.level, 0);
  assert.equal(state.policeDispatch.reports.length, 0);
  const block = WORLD.buildings[0],
    hidden = free();
  hidden.player.x = block.x - 20;
  hidden.player.y = block.y + 35;
  hidden.pedestrians = [civilian('occluded', block.x + 30, block.y - 8)];
  assert.equal(reportCrime(hidden, { type: 'assault' }), false);
});

test('a nearby police observer acts immediately instead of waiting for civilian dispatch', () => {
  const state = free();
  state.police = [constable(830, 700)];
  assert.equal(reportCrime(state, { type: 'assault' }), true);
  assert.equal(state.wanted.level, 2);
  assert.deepEqual(state.wanted.lastSeen, { x: 780, y: 700 });
  assert.equal(state.policeDispatch.reports.length, 0);
});

test('existing moving traffic drivers can make delayed reports without becoming omniscient', () => {
  const state = free();
  state.vehicles = [
    {
      id: 'driver-car',
      spec: 'sedan',
      kind: 'traffic',
      x: 860,
      y: 700,
      health: 115,
      speed: 0,
      angle: 0,
      route: null,
      occupied: false,
    },
  ];
  assert.equal(reportCrime(state, { type: 'vehicle-theft' }), true);
  tick(state, 3.2);
  assert.equal(state.wanted.level, 1);
});

test('all six tiers create their actual distinct response participants', () => {
  for (let level = 1; level <= 6; level++) {
    const state = free(),
      tier = POLICE_TIERS[level];
    forceWanted(state, level);
    updateSimulation(state, 1 / 60);
    assert.equal(state.wanted.level, level);
    assert.ok(
      state.police.filter((actor) => !actor.inVehicle && ['patrol', 'search'].includes(actor.role))
        .length >= tier.foot,
    );
    assert.equal(state.vehicles.filter((car) => car.response === 'patrol').length, tier.cruisers);
    assert.equal(state.vehicles.filter((car) => car.response === 'armored').length, tier.armored);
    assert.equal(state.policeDispatch.roadblocks.length, tier.roadblocks);
    assert.equal(state.policeDispatch.cordon.length, tier.cordon);
    assert.equal(state.policeAircraft.length, tier.air);
    assert.equal(state.police.filter((actor) => actor.role === 'overwatch').length, tier.rooftop);
    if (level === 1) assert.ok(state.police.every((actor) => actor.weapon === 'unarmed'));
    for (const car of state.vehicles.filter((car) =>
      ['patrol', 'armored'].includes(car.response),
    )) {
      assert.equal(car.policeControlled, true);
      assert.equal(car.occupied, true);
      const driver = state.police.find((actor) => actor.id === car.driverId);
      assert.ok(driver?.inVehicle);
      assert.equal(driver.vehicleId, car.id);
    }
  }
});

test('tier1 surrender requires a physically close officer and applies fees and confiscation only after grace', () => {
  const state = free();
  state.player.armour = 75;
  forceWanted(state, 1);
  state.police = [constable(798, 700)];
  state.policeDispatch.nextDeployment = 1000;
  const money = state.player.money;
  tick(state, 0.4, { surrender: true });
  assert.equal(state.progress.arrests, 0);
  assert.equal(state.wanted.status, 'arrest');
  assert.ok(state.policeDispatch.arrestProgress > 0);
  tick(state, 0.6, { surrender: true });
  assert.equal(state.progress.arrests, 1);
  assert.equal(state.wanted.level, 0);
  assert.equal(state.player.money, money - 75);
  assert.equal(state.player.armour, 0);
  assert.deepEqual(state.player.weapons, ['unarmed']);
  assert.equal(state.player.ammo.pistol.clip, 0);
  assert.equal(state.player.ammo.pistol.reserve, 0);
  assert.ok(state.policeDispatch.lastArrest.confiscated.includes('pistol'));
  assert.equal(state.police.length, 0);
  assert.equal(state.policeAircraft.length, 0);
});

test('surrender far away cannot trigger arrest and movement breaks a real arrest attempt with escalation', () => {
  const distant = free();
  forceWanted(distant, 1);
  distant.police = [constable(480, 180)];
  distant.policeDispatch.nextDeployment = 1000;
  tick(distant, 1, { surrender: true });
  assert.equal(distant.progress.arrests, 0);
  const state = free();
  forceWanted(state, 1);
  state.police = [constable(798, 700)];
  state.policeDispatch.nextDeployment = 1000;
  tick(state, 0.4, { surrender: true });
  updateSimulation(state, 1 / 60, { moveX: 1 });
  assert.equal(state.wanted.level, 2);
  assert.equal(state.progress.arrests, 0);
  assert.equal(state.player.surrendering, false);
  assert.equal(state.policeDispatch.arrestProgress, 0);
});

test('arrest fails the active assignment and does not masquerade as medical death recovery', () => {
  const state = createSimulation();
  state.dialogue = null;
  state.pedestrians = [];
  state.vehicles = [];
  forceWanted(state, 1);
  state.police = [constable(state.player.x + 18, state.player.y)];
  state.policeDispatch.nextDeployment = 1000;
  tick(state, 1, { surrender: true });
  assert.equal(state.mission, null);
  assert.match(state.progress.failed.at(-1).reason, /arrested/);
  assert.equal(state.progress.deaths, 0);
  assert.equal(state.player.health, 100);
});

test('patrol vehicles navigate real roads, move toward the reported getaway car and retain crew ownership', () => {
  const state = free();
  state.vehicles = [
    {
      id: 'getaway',
      spec: 'taxi',
      x: 780,
      y: 700,
      health: 120,
      angle: 0,
      speed: 0,
      kind: 'parked',
      occupied: true,
      route: null,
    },
  ];
  state.player.vehicleId = 'getaway';
  forceWanted(state, 2);
  updateSimulation(state, 1 / 60);
  const car = state.vehicles.find((vehicle) => vehicle.response === 'patrol'),
    start = { x: car.x, y: car.y };
  tick(state, 0.8);
  assert.ok(Math.hypot(car.x - start.x, car.y - start.y) > 8);
  assert.ok(car.policeRoute.length > 1);
  for (let i = 1; i < car.policeRoute.length; i++) {
    const a = car.policeRoute[i - 1],
      b = car.policeRoute[i];
    assert.ok(
      Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6,
      'cruiser cannot cut diagonally through a block',
    );
  }
  const driver = state.police.find((actor) => actor.id === car.driverId);
  assert.equal(driver.x, car.x);
  assert.equal(driver.y, car.y);
  assert.equal(driver.inVehicle, true);
});

test('intercepting cruiser collisions physically slow and damage the getaway vehicle', () => {
  const state = free(),
    getaway = {
      id: 'getaway',
      spec: 'taxi',
      x: 780,
      y: 700,
      health: 120,
      angle: 0,
      speed: 0,
      kind: 'parked',
      occupied: true,
      route: null,
    };
  state.vehicles = [getaway];
  state.player.vehicleId = getaway.id;
  forceWanted(state, 2);
  updateSimulation(state, 1 / 60);
  const car = state.vehicles.find((vehicle) => vehicle.response === 'patrol');
  car.x = 832;
  car.y = 700;
  car.angle = Math.PI;
  car.speed = 85;
  car.policeRoute = [];
  quiet(state);
  tick(state, 0.65);
  assert.ok(getaway.health < 120);
  assert.ok(car.x >= getaway.x + 20);
  assert.ok(car.speed < 85);
});

test('tier3 roadblock records correspond to solid real vehicles and officers at the junction', () => {
  const state = free();
  forceWanted(state, 3);
  updateSimulation(state, 1 / 60);
  for (const block of state.policeDispatch.roadblocks) {
    assert.equal(block.active, true);
    assert.equal(block.vehicleIds.length, 2);
    assert.equal(block.officerIds.length, 2);
    assert.ok(
      block.vehicleIds.every((id) =>
        state.vehicles.some(
          (car) => car.id === id && car.health > 0 && car.response === 'roadblock',
        ),
      ),
    );
    assert.ok(
      block.officerIds.every((id) => state.police.some((actor) => actor.id === id && actor.anchor)),
    );
  }
});

test('a roadblock physically stops a car from driving straight through its occupied lane', () => {
  const state = free();
  forceWanted(state, 3);
  updateSimulation(state, 1 / 60);
  const block = state.policeDispatch.roadblocks[0];
  state.police = [];
  state.policeDispatch.nextDeployment = 1000;
  state.vehicles = state.vehicles.filter((car) => block.vehicleIds.includes(car.id));
  const car = {
    id: 'getaway',
    spec: 'taxi',
    x: block.x,
    y: block.y - 70,
    health: 120,
    angle: Math.PI / 2,
    speed: 0,
    kind: 'parked',
    occupied: true,
    route: null,
  };
  state.vehicles.push(car);
  state.player.vehicleId = car.id;
  state.player.x = car.x;
  state.player.y = car.y;
  tick(state, 1.5, { forward: true });
  assert.ok(car.y < block.y + 8);
  assert.ok(car.health < 120);
  assert.ok(car.speed < 60);
});

test('taking a stopped police vehicle disembarks the real crew and transfers its driving authority', () => {
  const state = free();
  forceWanted(state, 2);
  updateSimulation(state, 1 / 60);
  const car = state.vehicles.find((vehicle) => vehicle.response === 'patrol'),
    crew = [...car.crewIds];
  car.speed = 0;
  state.player.x = car.x + 24;
  state.player.y = car.y;
  state.pickups = [];
  interact(state);
  assert.equal(state.player.vehicleId, car.id);
  assert.equal(car.policeControlled, false);
  assert.equal(car.driverId, null);
  assert.deepEqual(car.crewIds, []);
  assert.ok(
    crew.every((id) =>
      state.police.some((actor) => actor.id === id && !actor.inVehicle && actor.vehicleId === null),
    ),
  );
});

test('tier4 tactical armor absorbs real incoming rounds and armored vans preserve their physical protection', () => {
  const state = free();
  forceWanted(state, 4);
  updateSimulation(state, 1 / 60);
  quiet(state);
  const actor = state.police.find((officer) => officer.role === 'tactical');
  const health = actor.health,
    armour = actor.armour;
  actor.inVehicle = false;
  actor.vehicleId = null;
  actor.x = 780;
  actor.y = 735;
  state.player.x = 780;
  state.player.y = 700;
  state.player.angle = Math.PI / 2;
  fireWeapon(state);
  tick(state, 0.12);
  assert.ok(actor.armour < armour);
  assert.ok(actor.health < health);
  assert.ok(actor.health > health - 28);
  const van = state.vehicles.find((car) => car.response === 'armored');
  assert.ok(van.armour > 0);
  assert.equal(van.maxHealth, 340);
});

test('aircraft search is a moving physical cone and live line of sight can reacquire the reported player', () => {
  const state = free();
  forceWanted(state, 5);
  updateSimulation(state, 1 / 60);
  state.police = [];
  state.vehicles = [];
  state.policeDispatch.nextDeployment = 1000;
  const air = state.policeAircraft[0];
  air.x = 780;
  air.y = 700;
  air.phase = 0;
  air.observing = false;
  const start = { x: air.x, y: air.y };
  tick(state, 0.1);
  assert.ok(air.observing);
  assert.equal(state.wanted.observed, true);
  assert.ok(Math.hypot(air.x - start.x, air.y - start.y) > 1);
  assert.ok(air.searchlight.radius > 0);
});

test('a tall building blocks the airborne search cone rather than granting omniscient sight through cover', () => {
  const state = free(),
    block = WORLD.buildings.find((building) => building.height > 100);
  state.player.x = block.x - 10;
  state.player.y = block.y + block.h / 2;
  forceWanted(state, 5);
  updateSimulation(state, 1 / 60);
  state.police = [];
  state.vehicles = [];
  state.policeDispatch.nextDeployment = 1000;
  const air = state.policeAircraft[0];
  air.x = block.x + block.w + 120;
  air.y = state.player.y;
  air.phase = 0;
  air.observing = false;
  tick(state, 0.15);
  assert.equal(air.observing, false);
  assert.equal(state.wanted.observed, false);
});

test('tier5 rooftop marksmen have actual elevation and their shots descend toward the player', () => {
  const state = free();
  forceWanted(state, 5);
  updateSimulation(state, 1 / 60);
  const marksman = state.police.find((actor) => actor.role === 'overwatch');
  assert.ok(marksman.z > 50);
  assert.equal(marksman.weapon, 'sniper');
  assert.equal(marksman.speed, 0);
  const building = WORLD.buildings.find((item) => item.id === marksman.buildingId);
  assert.equal(marksman.z, building.height);
  // A controlled unobstructed roof-edge placement exercises the descending projectile path.
  marksman.x = 780;
  marksman.y = 740;
  marksman.z = 60;
  marksman.fireCooldown = 0;
  state.police = [marksman];
  state.vehicles = [];
  state.policeAircraft = [];
  state.policeDispatch.nextDeployment = 1000;
  updateSimulation(state, 1 / 60);
  const bullet = state.bullets.find((item) => item.owner === marksman.id);
  assert.ok(bullet);
  assert.ok(bullet.vz < 0);
  assert.ok(bullet.z > 12);
});

test('scoped vertical fire can damage and destroy an airborne search unit with a genuine falling wreck', () => {
  const state = free();
  forceWanted(state, 6);
  updateSimulation(state, 1 / 60);
  quiet(state);
  const air = state.policeAircraft[0];
  air.x = 840;
  air.y = 700;
  air.z = 120;
  air.speed = 0;
  air.phase = 0;
  acquireWeapon(state, 'sniper', 10);
  for (let shot = 0; shot < 3; shot++) {
    if (shot) tick(state, 1.4);
    updateSimulation(state, 1 / 60, {
      aim: true,
      aimTarget: { x: air.x, y: air.y, z: air.z + 8 },
      fire: true,
    });
    tick(state, 0.2);
  }
  assert.equal(air.health, 0);
  assert.ok(air.z < 120 && air.z > 0);
  assert.equal(air.observing, false);
  tick(state, 2);
  assert.equal(
    state.policeAircraft.some((actor) => actor.id === air.id),
    false,
  );
});

test('actual upward rockets damage and destroy an aircraft, preserve ground targets below the blast, and leave a falling wreck', () => {
  const state = free();
  forceWanted(state, 6);
  updateSimulation(state, 1 / 60);
  state.police = [];
  state.vehicles = [];
  state.policeAircraft = state.policeAircraft.slice(0, 1);
  state.policeDispatch.nextDeployment = 1000;
  const air = state.policeAircraft[0];
  air.x = 840;
  air.y = 700;
  air.z = 120;
  air.speed = 0;
  air.phase = 0;
  const underneath = {
    id: 'parked-under-air',
    spec: 'sedan',
    x: 840,
    y: 700,
    health: 115,
    angle: 0,
    speed: 0,
    kind: 'parked',
    occupied: false,
    route: null,
  };
  state.vehicles.push(underneath);
  acquireWeapon(state, 'rpg', 3);
  updateSimulation(state, 1 / 60, {
    aim: true,
    aimTarget: { x: air.x, y: air.y, z: air.z + 8 },
    fire: true,
  });
  assert.equal(state.ordnance.length, 1);
  const first = state.ordnance[0];
  assert.ok(first.vz > 0);
  assert.ok(Math.abs(Math.hypot(first.vx, first.vy, first.vz) - 235) < 1e-6);
  tick(state, 0.7);
  assert.ok(air.health > 0 && air.health < 260);
  assert.equal(state.ordnance.length, 0);
  assert.equal(
    underneath.health,
    115,
    'airborne blast must not damage a car more than100units below it',
  );
  assert.equal(state.player.health, 100);
  assert.equal(reloadWeapon(state), true);
  tick(state, 2.4);
  updateSimulation(state, 1 / 60, {
    aim: true,
    aimTarget: { x: air.x, y: air.y, z: air.z + 8 },
    fire: true,
  });
  tick(state, 0.7);
  assert.equal(air.health, 0);
  assert.ok(air.z > 0 && air.z < 120);
  assert.equal(air.observing, false);
  assert.ok(state.combatEffects.some((effect) => effect.type === 'explosion' && effect.z > 90));
  assert.equal(state.player.ammo.rpg.clip, 0);
  assert.equal(state.player.ammo.rpg.reserve, 1);
  tick(state, 2);
  assert.equal(
    state.policeAircraft.some((actor) => actor.id === air.id),
    false,
  );
  assert.equal(underneath.health, 115);
});

test('a ground grenade blast includes aircraft in the damage rules but cannot reach a helicopter high above it', () => {
  const state = free();
  forceWanted(state, 6);
  updateSimulation(state, 1 / 60);
  state.police = [];
  state.vehicles = [];
  state.policeAircraft = state.policeAircraft.slice(0, 1);
  state.policeDispatch.nextDeployment = 1000;
  const air = state.policeAircraft[0];
  air.x = 880;
  air.y = 700;
  air.z = 120;
  air.speed = 0;
  air.phase = 0;
  acquireWeapon(state, 'grenade', 3);
  fireWeapon(state);
  tick(state, 3.1);
  assert.equal(state.ordnance.length, 0);
  assert.equal(air.health, 260);
  assert.ok(state.combatEffects.some((effect) => effect.type === 'explosion' && effect.z === 0));
});

test('six-star cordons remain real persistent blockers while the player is observed', () => {
  const state = free();
  forceWanted(state, 6);
  updateSimulation(state, 1 / 60);
  quiet(state);
  const ids = state.policeDispatch.cordon.flatMap((block) => block.vehicleIds);
  assert.equal(ids.length, 8);
  tick(state, 5);
  assert.equal(state.wanted.level, 6);
  assert.equal(state.wanted.timer, 0);
  assert.ok(ids.every((id) => state.vehicles.some((car) => car.id === id && car.health > 0)));
  assert.ok(state.policeDispatch.cordon.every((block) => block.active && block.persistent));
});

test('hidden movement does not update last-known position or send reinforcements to the unseen destination', () => {
  const state = free();
  forceWanted(state, 2);
  updateSimulation(state, 1 / 60);
  const known = { ...state.wanted.lastSeen };
  state.player.x = 1620;
  state.player.y = 1220;
  quiet(state);
  tick(state, 5);
  assert.deepEqual(state.wanted.lastSeen, known);
  assert.equal(state.wanted.observed, false);
  assert.ok(['search', 'cooling'].includes(state.wanted.status));
  assert.ok(
    state.vehicles
      .filter((car) => car.policeControlled)
      .every((car) => Math.hypot(car.x - 1620, car.y - 1220) > 250),
  );
});

test('a delayed older witness report cannot overwrite newer officer observations', () => {
  const state = free();
  state.pedestrians = [civilian('witness', 820, 700)];
  reportCrime(state, { type: 'gunfire' });
  tick(state, 0.4);
  state.player.x = 1080;
  state.player.y = 700;
  state.police = [constable(1110, 700)];
  reportCrime(state, { type: 'assault' });
  state.police = [];
  state.policeDispatch.nextDeployment = 1000;
  state.player.x = 1620;
  state.player.y = 1220;
  tick(state, 3);
  assert.deepEqual(state.wanted.lastSeen, { x: 1080, y: 700 });
});

test('quiet search uses the observer facing cone rather than seeing through its own back', () => {
  const state = free();
  forceWanted(state, 1, { x: 900, y: 960 });
  state.police = [constable(900, 700, { angle: 0 })];
  state.policeDispatch.nextDeployment = 1000;
  updateSimulation(state, 1 / 60);
  assert.equal(state.wanted.observed, false);
  state.police[0].angle = Math.PI;
  updateSimulation(state, 1 / 60);
  assert.equal(state.wanted.observed, true);
  assert.deepEqual(state.wanted.lastSeen, { x: 780, y: 700 });
});

test('disabled response vehicles disembark surviving crew once without dragging them back every frame', () => {
  const state = free();
  forceWanted(state, 2);
  updateSimulation(state, 1 / 60);
  const car = state.vehicles.find((vehicle) => vehicle.response === 'patrol'),
    crew = state.police.find((actor) => actor.id === car.crewIds[1]);
  car.health = 0;
  updateSimulation(state, 1 / 60);
  assert.equal(crew.inVehicle, false);
  assert.equal(car.policeControlled, false);
  crew.x = 1080;
  crew.y = 700;
  updateSimulation(state, 1 / 60);
  assert.ok(
    crew.x > 1000,
    'surviving crew must continue on foot rather than teleporting to the wreck',
  );
});

test('observation continuously resets cooling and losing sight outside the search perimeter eventually clears response', () => {
  const state = free();
  forceWanted(state, 1);
  state.police = [constable(800, 700)];
  state.policeDispatch.nextDeployment = 1000;
  state.wanted.timer = 8;
  updateSimulation(state, 1 / 60);
  assert.equal(state.wanted.timer, 0);
  assert.equal(state.wanted.observed, true);
  state.player.x = 1620;
  state.player.y = 1220;
  tick(state, 13);
  assert.equal(state.wanted.level, 0);
  assert.equal(state.wanted.status, 'clear');
  assert.equal(state.police.length, 0);
});

test('witness delay, crew routes, aircraft and six-star dispatch survive deterministic saves', () => {
  const state = free();
  state.pedestrians = [civilian('witness', 820, 700)];
  reportCrime(state, { type: 'assault' });
  tick(state, 0.2);
  const pending = restoreGame(saveGame(state));
  tick(state, 0.2);
  tick(pending, 0.2);
  assert.deepEqual(pending, state);
  const response = free();
  forceWanted(response, 6);
  updateSimulation(response, 1 / 60);
  quiet(response);
  const restored = restoreGame(saveGame(response));
  tick(response, 0.15);
  tick(restored, 0.15);
  assert.deepEqual(restored, response);
});

test('police migration accepts older saves and rejects corrupted dispatch or unsupported heat', () => {
  const legacy = JSON.parse(saveGame(createSimulation()));
  delete legacy.state.policeVersion;
  delete legacy.state.policeDispatch;
  delete legacy.state.policeAircraft;
  delete legacy.state.player.surrendering;
  delete legacy.state.progress.arrests;
  const restored = restoreGame(legacy);
  assert.equal(restored.policeVersion, 1);
  assert.deepEqual(restored.policeAircraft, []);
  const bad = JSON.parse(saveGame(createSimulation()));
  bad.state.policeDispatch.reports = [
    {
      point: { x: 780, y: 700 },
      witnessId: 'fake',
      type: 'gunfire',
      remaining: Infinity,
      severity: 1,
    },
  ];
  assert.throws(() => restoreGame(bad), /reports/);
  const wrong = JSON.parse(saveGame(createSimulation()));
  wrong.state.wanted.level = 7;
  assert.throws(() => restoreGame(wrong), /police/);
  const observation = JSON.parse(saveGame(createSimulation()));
  observation.state.wanted.lastSeenTime = 999;
  assert.throws(() => restoreGame(observation), /observation/);
});
