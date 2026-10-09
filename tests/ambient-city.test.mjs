import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeAmbient, updateAmbient, validateAmbient } from '../src/ambient-city.js';
import { createTerrain } from '../src/terrain.js';
import { CITY_BLUEPRINT as city, containsLand } from '../src/city-blueprint.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const profiles = ['industrial', 'finance', 'park', 'island'];
const specs = {
  sedan: { health: 115 },
  taxi: { health: 120 },
  van: { health: 190 },
  sports: { health: 90 },
};
function fixture() {
  const neighbourhoods = profiles.map((profile, i) => ({
    id: `area-${i}`,
    name: `Place ${i}`,
    profile,
    districtId: `district-${i}`,
    x: i * 4000,
    y: 0,
    w: 1000,
    h: 1000,
    access: profile === 'island' ? ['foot', 'boat'] : ['foot', 'car'],
  }));
  const roads = neighbourhoods.flatMap((area) => [
    {
      id: `${area.id}-horizontal`,
      x1: area.x + 100,
      y1: 500,
      x2: area.x + 900,
      y2: 500,
      width: 80,
      z: 0,
      access: area.access.filter((a) => ['foot', 'car'].includes(a)),
    },
    {
      id: `${area.id}-vertical`,
      x1: area.x + 500,
      y1: 100,
      x2: area.x + 500,
      y2: 900,
      width: 80,
      z: 0,
      access: area.access.filter((a) => ['foot', 'car'].includes(a)),
    },
  ]);
  return {
    width: 14000,
    height: 1400,
    bounds: { left: 0, top: 0, right: 13900, bottom: 1300 },
    neighbourhoods,
    roads,
    buildings: [],
    obstacles: [],
    landforms: [
      {
        polygon: [
          [0, 0],
          [13900, 0],
          [13900, 1300],
          [0, 1300],
        ],
      },
    ],
  };
}
function state() {
  return {
    rng: 61,
    sequence: 17,
    player: { x: 500, y: 500, vehicleId: null },
    vehicles: [],
    pedestrians: [],
    progress: {},
    policeDispatch: { reports: [] },
  };
}
function context(world) {
  const terrain = createTerrain(world);
  return {
    specs,
    isBlocked: terrain.isBlocked,
    createVehicle: (definition) => ({
      ...definition,
      health: specs[definition.spec].health,
      occupied: false,
      stolen: false,
      blockedTime: 0,
      factoryField: 'preserve',
    }),
  };
}
function visit(s, world, area, ctx) {
  s.player.x = area.x + area.w / 2;
  s.player.y = area.y + area.h / 2;
  updateAmbient(s, world, 1, ctx);
}
function regionActors(s, id, key) {
  return [
    ...s[key].filter((actor) => actor.ambientRegion === id),
    ...s.ambient.dormant[id][key],
  ].sort((a, b) => a.id.localeCompare(b.id));
}

test('initialization creates honest unvisited region metadata without mutating prologue actors or RNG', () => {
  const world = fixture(),
    s = state();
  const car = Object.freeze({ id: 'starter-taxi', x: 510, y: 500, health: 120 });
  const person = Object.freeze({ id: 'original-person', x: 550, y: 500, health: 100 });
  s.vehicles.push(car);
  s.pedestrians.push(person);
  const before = clone(s);
  initializeAmbient(s, world);
  assert.deepEqual(s.ambient.activeRegions, []);
  assert.equal(Object.keys(s.ambient.regions).length, 4);
  assert.ok(
    Object.values(s.ambient.regions).every(
      (record) => !record.generated && record.status === 'unvisited',
    ),
  );
  assert.equal(s.vehicles[0], car);
  assert.equal(s.pedestrians[0], person);
  assert.deepEqual(s.vehicles, before.vehicles);
  assert.deepEqual(s.pedestrians, before.pedestrians);
  assert.equal(s.rng, 61);
  assert.equal(s.sequence, 17);
  assert.equal(validateAmbient(s, world), true);
});

test('activation creates actual moving traffic and sidewalk routes with compatible factory/body fields', () => {
  const world = fixture(),
    s = state(),
    ctx = context(world);
  updateAmbient(s, world, 0, ctx);
  assert.ok(s.vehicles.length >= 5);
  assert.ok(s.pedestrians.length >= 5);
  assert.equal(s.ambient.regions['area-0'].status, 'populated');
  for (const car of s.vehicles) {
    assert.equal(car.kind, 'traffic');
    assert.equal(car.factoryField, 'preserve');
    assert.equal(car.health, specs[car.spec].health);
    assert.equal(car.occupied, false);
    assert.equal(car.route.length, 4);
    assert.equal(car.routeIndex, 1);
    assert.ok(car.speed > 0);
    assert.ok(Number.isInteger(Number(car.id.split('-').at(-1))));
  }
  for (const person of s.pedestrians) {
    assert.equal(person.health, 100);
    assert.equal(person.route.length, 2);
    assert.equal(person.routeIndex, 1);
    assert.ok(person.speed >= 12 && person.speed < 20);
    assert.ok(person.homeX >= 0);
    assert.ok(person.minY <= person.maxY);
  }
  assert.equal(validateAmbient(s, world), true);
});

test('distant actors become dormant without losing health, position, route progress or object identity on revisit', () => {
  const world = fixture(),
    s = state(),
    ctx = context(world);
  visit(s, world, world.neighbourhoods[0], ctx);
  const car = s.vehicles[0],
    person = s.pedestrians[0];
  Object.assign(car, { health: 33, speed: 19, routeIndex: 2, color: '#123456' });
  Object.assign(person, { health: 42, routeIndex: 0, speed: 15, color: '#654321' });
  const carBefore = clone(car),
    personBefore = clone(person);
  visit(s, world, world.neighbourhoods[1], ctx);
  assert.ok(!s.vehicles.includes(car));
  assert.ok(!s.pedestrians.includes(person));
  assert.ok(s.ambient.dormant['area-0'].vehicles.includes(car));
  assert.ok(s.ambient.dormant['area-0'].pedestrians.includes(person));
  updateAmbient(s, world, 500, ctx);
  assert.deepEqual(car, carBefore);
  assert.deepEqual(person, personBefore);
  visit(s, world, world.neighbourhoods[0], ctx);
  assert.ok(s.vehicles.includes(car));
  assert.ok(s.pedestrians.includes(person));
  assert.deepEqual(car, carBefore);
  assert.deepEqual(person, personBefore);
  assert.equal(validateAmbient(s, world), true);
});

test('visitation order and source road/area order do not change regional identities or local variation', () => {
  const world = fixture(),
    reversed = clone(world);
  reversed.roads.reverse();
  reversed.neighbourhoods.reverse();
  const a = state(),
    b = state(),
    ca = context(world),
    cb = context(reversed);
  for (const index of [0, 1, 2, 3]) visit(a, world, world.neighbourhoods[index], ca);
  for (const index of [3, 2, 1, 0]) visit(b, reversed, world.neighbourhoods[index], cb);
  for (const area of world.neighbourhoods)
    for (const key of ['vehicles', 'pedestrians'])
      assert.deepEqual(
        regionActors(a, area.id, key),
        regionActors(b, area.id, key),
        `${area.id} ${key}`,
      );
  assert.equal(a.rng, 61);
  assert.equal(b.rng, 61);
});

test('different initial seeds vary physical positions without changing stable region actor IDs', () => {
  const world = fixture(),
    a = state(),
    b = state(),
    ctx = context(world);
  b.rng = 62;
  visit(a, world, world.neighbourhoods[0], ctx);
  visit(b, world, world.neighbourhoods[0], ctx);
  const firstA = regionActors(a, 'area-0', 'vehicles')[0],
    firstB = regionActors(b, 'area-0', 'vehicles')[0];
  assert.equal(firstA.id, firstB.id);
  assert.ok(firstA.x !== firstB.x || firstA.y !== firstB.y);
  assert.notEqual(a.ambient.regions['area-0'].seed, b.ambient.regions['area-0'].seed);
});

test('JSON save restoration resumes dormant and active bodies rather than duplicating or regenerating regions', () => {
  const world = fixture(),
    s = state(),
    ctx = context(world);
  visit(s, world, world.neighbourhoods[0], ctx);
  s.vehicles[0].health = 27;
  visit(s, world, world.neighbourhoods[1], ctx);
  const restored = clone(s);
  assert.equal(validateAmbient(restored, world), true);
  const originalMetadata = clone(restored.ambient);
  initializeAmbient(restored, world);
  assert.deepEqual(restored.ambient, originalMetadata);
  for (const index of [0, 1, 0, 1, 0]) visit(restored, world, world.neighbourhoods[index], ctx);
  assert.deepEqual(
    regionActors(restored, 'area-0', 'vehicles'),
    regionActors(s, 'area-0', 'vehicles'),
  );
  const all = [
    ...restored.vehicles,
    ...restored.pedestrians,
    ...Object.values(restored.ambient.dormant).flatMap((bucket) => [
      ...bucket.vehicles,
      ...bucket.pedestrians,
    ]),
  ];
  assert.equal(new Set(all.map((actor) => actor.id)).size, all.length);
  assert.equal(validateAmbient(restored, world), true);
});

test('death, theft, ownership, mission/police use, pending witnesses and nearby actors prevent unloading', () => {
  const world = fixture(),
    s = state(),
    ctx = context(world);
  visit(s, world, world.neighbourhoods[1], ctx);
  assert.ok(s.vehicles.length >= 8);
  const cars = s.vehicles.slice(0, 8),
    people = s.pedestrians.slice(0, 4);
  cars[0].occupied = true;
  s.player.vehicleId = cars[0].id;
  cars[1].stolen = true;
  cars[2].owned = true;
  cars[3].missionVehicle = true;
  cars[4].policeControlled = true;
  cars[5].health = 0;
  cars[6].reporting = true;
  cars[7].x = 8500;
  cars[7].y = 500;
  people[0].health = 0;
  people[1].reporting = true;
  people[2].panic = 3;
  s.policeDispatch.reports.push({ witnessId: people[3].id, remaining: 2 });
  const protectedIds = [...cars, ...people].map((actor) => actor.id);
  visit(s, world, world.neighbourhoods[2], ctx);
  for (const id of protectedIds)
    assert.ok(
      [...s.vehicles, ...s.pedestrians].some((actor) => actor.id === id),
      id,
    );
  assert.equal(cars[5].health, 0);
  assert.equal(people[0].health, 0);
  assert.ok(
    s.ambient.dormant['area-1'].vehicles.every((actor) => !protectedIds.includes(actor.id)),
  );
  assert.equal(validateAmbient(s, world), true);
});

test('explicit context/mission references preserve an actor until its gameplay role ends', () => {
  const world = fixture(),
    s = state(),
    ctx = context(world);
  visit(s, world, world.neighbourhoods[0], ctx);
  const car = s.vehicles[0],
    person = s.pedestrians[0];
  s.mission = { vehicleId: car.id };
  visit(s, world, world.neighbourhoods[1], { ...ctx, protectedActorIds: [person.id] });
  assert.ok(s.vehicles.includes(car));
  assert.ok(s.pedestrians.includes(person));
  s.mission = null;
  updateAmbient(s, world, 1, ctx);
  assert.ok(!s.vehicles.includes(car));
  assert.ok(!s.pedestrians.includes(person));
  assert.ok(s.ambient.dormant['area-0'].vehicles.includes(car));
});

test('externally removed actors are not revived or minted again on revisits', () => {
  const world = fixture(),
    s = state(),
    ctx = context(world);
  visit(s, world, world.neighbourhoods[0], ctx);
  const removed = s.vehicles.shift().id;
  const generated = s.ambient.regions['area-0'].vehiclesGenerated;
  for (const index of [1, 0, 1, 0]) visit(s, world, world.neighbourhoods[index], ctx);
  assert.ok(!regionActors(s, 'area-0', 'vehicles').some((actor) => actor.id === removed));
  assert.equal(s.ambient.regions['area-0'].vehiclesGenerated, generated);
  assert.equal(validateAmbient(s, world), true);
});

test('population budgets include prologue actors, with preservation taking precedence over already-full arrays', () => {
  const world = fixture(),
    s = state(),
    ctx = context(world);
  s.vehicles = Array.from({ length: 79 }, (_, i) => ({
    id: `original-car-${i}`,
    x: 500,
    y: 500,
    health: 100,
  }));
  s.pedestrians = Array.from({ length: 139 }, (_, i) => ({
    id: `original-person-${i}`,
    x: 500,
    y: 500,
    health: 100,
  }));
  visit(s, world, world.neighbourhoods[1], ctx);
  assert.equal(s.vehicles.length, 80);
  assert.equal(s.pedestrians.length, 140);
  assert.ok(s.ambient.dormant['area-1'].vehicles.length > 0);
  s.vehicles.find((actor) => actor.ambientRegion).stolen = true;
  s.vehicles.push({ id: 'mission-extra', mission: true, x: 100, y: 100 });
  visit(s, world, world.neighbourhoods[0], ctx);
  assert.equal(s.vehicles.length, 81);
  assert.ok(s.vehicles.some((actor) => actor.id === 'mission-extra'));
});

test('empty/inaccessible and protected prologue regions do not claim a generated population', () => {
  const world = fixture();
  world.roads = [];
  const s = state();
  visit(s, world, world.neighbourhoods[0], context(world));
  assert.equal(s.ambient.regions['area-0'].status, 'empty');
  assert.equal(s.ambient.regions['area-0'].vehiclesGenerated, 0);
  assert.equal(s.ambient.regions['area-0'].pedestriansGenerated, 0);
  assert.deepEqual(s.ambient.activeRegions, []);
  const protectedWorld = fixture();
  protectedWorld.legacy = { protectedBounds: { x: 0, y: 0, w: 1000, h: 1000 } };
  const p = state();
  visit(p, protectedWorld, protectedWorld.neighbourhoods[0], context(protectedWorld));
  assert.equal(p.ambient.regions['area-0'].status, 'empty');
  assert.equal(p.vehicles.length + p.pedestrians.length, 0);
});

test('district morphology changes actual counts, palettes and traffic mix; foot-only islands have no cars', () => {
  const world = fixture(),
    s = state(),
    ctx = context(world);
  for (const area of world.neighbourhoods) visit(s, world, area, ctx);
  const industrial = regionActors(s, 'area-0', 'vehicles'),
    finance = regionActors(s, 'area-1', 'vehicles');
  assert.ok(industrial.some((car) => car.spec === 'van'));
  assert.ok(industrial.every((car) => car.spec !== 'sports'));
  assert.ok(finance.some((car) => car.spec === 'taxi'));
  assert.ok(
    regionActors(s, 'area-1', 'pedestrians').length >
      regionActors(s, 'area-0', 'pedestrians').length,
  );
  assert.ok(regionActors(s, 'area-2', 'vehicles').length < industrial.length);
  assert.equal(regionActors(s, 'area-3', 'vehicles').length, 0);
  assert.ok(regionActors(s, 'area-3', 'pedestrians').length > 0);
  assert.ok(industrial.every((car) => ['#6e7c78', '#838579', '#b2916e'].includes(car.color)));
  assert.ok(finance.every((car) => ['#798a99', '#aaaead', '#566977'].includes(car.color)));
});

test('road access and terrain exclusions prevent spawn routes through closed roads, buildings and narrow water', () => {
  const world = fixture();
  world.roads.push({ id: 'closed', x1: 100, y1: 200, x2: 900, y2: 200, width: 80, access: [] });
  world.buildings = [{ x: 400, y: 490, w: 100, h: 100, height: 50 }];
  world.lakes = [{ x: 490, y: 250, w: 20, h: 100 }];
  const s = state(),
    terrain = createTerrain(world),
    ctx = { ...context(world), isBlocked: terrain.isBlocked };
  visit(s, world, world.neighbourhoods[0], ctx);
  assert.ok(s.vehicles.length + s.pedestrians.length > 0);
  for (const [key, radius, mode] of [
    ['vehicles', 10, 'car'],
    ['pedestrians', 6, 'foot'],
  ])
    for (const actor of regionActors(s, 'area-0', key))
      for (let i = 0; i < actor.route.length; i++) {
        const a = actor.route[i],
          b = actor.route[(i + 1) % actor.route.length];
        assert.ok(world.roads.find((road) => road.id === a.roadId).access.includes(mode));
        const length = Math.hypot(b.x - a.x, b.y - a.y),
          steps = Math.ceil(length / 2);
        for (let j = 0; j <= steps; j++)
          assert.equal(
            terrain.isBlocked(
              a.x + ((b.x - a.x) * j) / steps,
              a.y + ((b.y - a.y) * j) / steps,
              radius,
            ),
            false,
          );
      }
});

test('actual 65-area city streaming uses real public geometry, preserves prologue, and stays bounded across all visits', () => {
  const s = state(),
    terrain = createTerrain(city),
    ctx = { specs, isBlocked: terrain.isBlocked };
  const car = Object.freeze({ id: 'starter-taxi', x: 504, y: 700, health: 120 });
  const person = Object.freeze({ id: 'original-person', x: 527, y: 700, health: 100 });
  s.vehicles.push(car);
  s.pedestrians.push(person);
  let generatedBodies = 0;
  for (const area of city.neighbourhoods) {
    visit(s, city, area, ctx);
    assert.ok(s.vehicles.length <= 80);
    assert.ok(s.pedestrians.length <= 140);
    assert.ok(s.vehicles.includes(car));
    assert.ok(s.pedestrians.includes(person));
  }
  assert.equal(Object.keys(s.ambient.regions).length, 65);
  for (const area of city.neighbourhoods) {
    for (const key of ['vehicles', 'pedestrians'])
      for (const actor of regionActors(s, area.id, key)) {
        generatedBodies++;
        assert.equal(containsLand(actor), true, actor.id);
        assert.equal(
          terrain.isBlocked(actor.x, actor.y, key === 'vehicles' ? 10 : 6),
          false,
          actor.id,
        );
        assert.ok(
          !city.legacy ||
            !(
              actor.x >= city.legacy.protectedBounds.x &&
              actor.x <= city.legacy.protectedBounds.x + city.legacy.protectedBounds.w &&
              actor.y >= city.legacy.protectedBounds.y &&
              actor.y <= city.legacy.protectedBounds.y + city.legacy.protectedBounds.h
            ),
        );
        for (const p of actor.route)
          assert.ok(
            city.roads
              .find((road) => road.id === p.roadId)
              .access.includes(key === 'vehicles' ? 'car' : 'foot'),
          );
      }
  }
  assert.ok(
    generatedBodies > 500,
    'actual source-sized city should hold a substantial persistent civilian population',
  );
  assert.equal(validateAmbient(s, city), true);
  const saved = clone(s);
  assert.equal(validateAmbient(saved, city), true);
});

test('stream checks have hysteresis, respond immediately to relocation and never advance dormant physics', () => {
  const world = fixture(),
    s = state(),
    ctx = context(world);
  updateAmbient(s, world, 0, ctx);
  const before = clone(s.ambient);
  updateAmbient(s, world, 0.1, ctx);
  assert.deepEqual(s.ambient.dormant, before.dormant);
  assert.ok(s.ambient.scanRemaining < before.scanRemaining);
  s.player.x = 4500;
  updateAmbient(s, world, 0.01, ctx);
  assert.ok(s.ambient.regions['area-1'].generated);
  const car = s.ambient.dormant['area-0'].vehicles[0],
    snapshot = clone(car);
  updateAmbient(s, world, 100, ctx);
  assert.deepEqual(car, snapshot);
});

test('failed vehicle creation cannot leave a partially generated region that duplicates bodies on retry', () => {
  const world = fixture(),
    s = state(),
    ctx = context(world);
  let count = 0;
  assert.throws(
    () =>
      updateAmbient(s, world, 0, {
        ...ctx,
        createVehicle: (definition) => {
          if (++count === 2) throw new Error('factory failure');
          return ctx.createVehicle(definition);
        },
      }),
    /factory failure/,
  );
  assert.equal(s.ambient.regions['area-0'].generated, false);
  assert.equal(s.ambient.dormant['area-0'].vehicles.length, 0);
  updateAmbient(s, world, 1, ctx);
  assert.equal(validateAmbient(s, world), true);
});

test('restore validation rejects corrupt regions, duplicate identities, positions and routes', () => {
  const world = fixture(),
    original = state(),
    ctx = context(world);
  visit(original, world, world.neighbourhoods[0], ctx);
  visit(original, world, world.neighbourhoods[1], ctx);
  for (const [name, mutate] of [
    [
      'version',
      (s) => {
        s.ambient.version = 2;
      },
    ],
    [
      'seed',
      (s) => {
        s.ambient.seed = -1;
      },
    ],
    [
      'region coverage',
      (s) => {
        delete s.ambient.regions['area-0'];
      },
    ],
    [
      'dormant coverage',
      (s) => {
        delete s.ambient.dormant['area-0'];
      },
    ],
    [
      'region local seed',
      (s) => {
        s.ambient.regions['area-0'].seed++;
      },
    ],
    [
      'fake generation',
      (s) => {
        s.ambient.regions['area-0'].generated = false;
      },
    ],
    [
      'fake count',
      (s) => {
        s.ambient.regions['area-0'].vehiclesGenerated = 0;
      },
    ],
    [
      'fake active region',
      (s) => {
        s.ambient.activeRegions = ['area-0'];
      },
    ],
    [
      'duplicate dormant ID',
      (s) => {
        s.ambient.dormant['area-0'].vehicles.push(s.ambient.dormant['area-0'].vehicles[0]);
      },
    ],
    [
      'invalid dormant position',
      (s) => {
        s.ambient.dormant['area-0'].vehicles[0].x = -1000;
      },
    ],
    [
      'invalid dormant health',
      (s) => {
        s.ambient.dormant['area-0'].vehicles[0].health = NaN;
      },
    ],
    [
      'invalid route',
      (s) => {
        s.ambient.dormant['area-0'].vehicles[0].route = [];
      },
    ],
    [
      'invalid route index',
      (s) => {
        s.vehicles[0].routeIndex = 99;
      },
    ],
    [
      'identity prefix',
      (s) => {
        s.vehicles[0].id = 'ordinary-car';
      },
    ],
    [
      'invalid pedestrian bounds',
      (s) => {
        s.pedestrians[0].minY = Infinity;
      },
    ],
    [
      'invalid panic',
      (s) => {
        s.pedestrians[0].panic = -1;
      },
    ],
  ]) {
    const s = clone(original);
    mutate(s);
    assert.throws(() => validateAmbient(s, world), /Invalid ambient/, name);
  }
});

test('legacy worlds without neighbourhoods stay unchanged and invalid elapsed/context inputs fail safely', () => {
  const world = fixture();
  delete world.neighbourhoods;
  const s = state();
  s.vehicles.push({ id: 'legacy', x: 500, y: 500 });
  updateAmbient(s, world, 0, context(world));
  assert.deepEqual(s.ambient.regions, {});
  assert.equal(s.vehicles.length, 1);
  assert.equal(validateAmbient(s, world), true);
  for (const dt of [-1, NaN, Infinity])
    assert.throws(() => updateAmbient(s, world, dt), /Invalid ambient/);
  assert.throws(() => updateAmbient(s, world, 0, { isBlocked: true }), /Invalid ambient/);
  assert.throws(() => initializeAmbient({}, world), /Invalid ambient/);
});
