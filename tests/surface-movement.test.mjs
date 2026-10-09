import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain } from '../src/terrain.js';
import { createSurfaceMovement } from '../src/surface-movement.js';
const road = (id, x1, x2, z1, z2, y = 150) => ({
  id,
  x1,
  y1: y,
  x2,
  y2: y,
  width: 60,
  z1,
  z2,
  access: ['car', 'foot'],
});
function fixture() {
  const world = {
    width: 700,
    height: 400,
    bounds: { left: 0, top: 0, right: 700, bottom: 400 },
    buildings: [],
    obstacles: [],
    landforms: [
      {
        polygon: [
          [0, 0],
          [700, 0],
          [700, 400],
          [0, 400],
        ],
      },
    ],
    roads: [
      road('up', 100, 200, 0, 28),
      road('span', 200, 400, 28, 28),
      road('down', 400, 500, 28, 0),
      { ...road('descent', 100, 200, 0, -18, 300), tunnel: true },
      { ...road('bore', 200, 400, -18, -18, 300), tunnel: true },
      { ...road('ascent', 400, 500, -18, 0, 300), tunnel: true },
    ],
    tunnels: [{ id: 'test-bore' }],
    lakes: [],
    water: [],
  };
  const terrain = createTerrain(world);
  return { world, terrain, ...createSurfaceMovement(terrain) };
}
test('cars and people continuously traverse a ramp, span and descent at authored heights', () => {
  for (const spec of ['sedan', null]) {
    const { moveBody } = fixture();
    const body = { x: 90, y: 150, z: 0, groundZ: 0, ...(spec ? { spec } : {}) };
    for (let i = 0; i < 42; i++) {
      assert.equal(moveBody(body, 10, 0, 7), false);
      if (Math.abs(body.x - 300) < 1e-8) assert.equal(body.z, 28);
      assert.equal(body.z, body.groundZ);
    }
    assert.ok(Math.abs(body.x - 510) < 1e-8);
    assert.equal(body.z, 0);
  }
});
test('ground-level traffic crossing underneath a span does not teleport onto it', () => {
  const { moveBody, terrain } = fixture();
  const body = { spec: 'sedan', x: 300, y: 100, z: 0, groundZ: 0 };
  moveBody(body, 0, 100, 7);
  assert.equal(body.z, 0);
  assert.ok(Math.abs(body.y - 200) < 1e-8);
  assert.equal(terrain.overheadDeck(300, 150, 18, 0), 28);
  assert.equal(terrain.overheadDeck(300, 150, 18, 28), null);
});
test('vehicle deck barriers block sideways departure while feet can fall to ground', () => {
  const { moveBody } = fixture();
  const car = { spec: 'sedan', x: 300, y: 150, z: 28, groundZ: 28 };
  assert.equal(moveBody(car, 0, 70, 7), true);
  assert.ok(car.y <= 180);
  assert.equal(car.z, 28);
  const person = { x: 300, y: 150, z: 28, groundZ: 28 };
  moveBody(person, 0, 70, 7);
  assert.equal(person.groundZ, 0);
  assert.equal(person.z, 28);
});
test('a jump keeps its height above the ramp instead of snapping onto a crossing layer', () => {
  const { moveBody } = fixture();
  const person = { x: 170, y: 150, z: 40, groundZ: 19.6, vz: 50 };
  moveBody(person, 20, 0, 7);
  assert.equal(person.z, 40);
  assert.ok(person.groundZ > 19.6);
});
test('tunnel movement follows its descent, flat bore and ascent, with solid side walls', () => {
  const { moveBody, terrain } = fixture();
  const car = { spec: 'sedan', x: 90, y: 300, z: 0, groundZ: 0 };
  for (let i = 0; i < 42; i++) {
    assert.equal(moveBody(car, 10, 0, 7), false);
    if (Math.abs(car.x - 300) < 1e-8) {
      assert.equal(car.z, -18);
      const y = car.y;
      assert.equal(moveBody(car, 0, 70, 7), true);
      assert.ok(car.y <= 323);
      car.y = y;
    }
  }
  assert.equal(car.z, 0);
  assert.ok(Math.abs(car.x - 510) < 1e-8);
  assert.equal(terrain.isBlocked(300, 350, 7, -18), true);
  assert.equal(terrain.hasLineOfSight({ x: 280, y: 300, z: -4 }, { x: 320, y: 300, z: -4 }), true);
  assert.equal(terrain.hasLineOfSight({ x: 300, y: 300, z: -4 }, { x: 300, y: 300, z: 14 }), false);
});
test('water permission is specific to swimmer movement and still enforces solid obstacles', () => {
  const { world } = fixture();
  world.lakes = [{ x: 250, y: 200, w: 100, h: 60 }];
  world.buildings = [{ id: 'pier', x: 300, y: 220, w: 15, h: 20, height: 30 }];
  const { moveBody } = createSurfaceMovement(createTerrain(world));
  const dry = { x: 240, y: 210, z: 0, groundZ: 0 };
  assert.equal(moveBody(dry, 30, 0, 7), true);
  const swimmer = { x: 240, y: 210, z: 0, groundZ: 0 };
  assert.equal(moveBody(swimmer, 30, 0, 7, { allowWater: true }), false);
  const stopped = { x: 270, y: 230, z: 0, groundZ: 0 };
  assert.equal(moveBody(stopped, 40, 0, 7, { allowWater: true }), true);
  assert.ok(stopped.x <= 293);
});
