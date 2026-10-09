import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain } from '../src/terrain.js';
import { createRailTerrain } from '../src/rail-terrain.js';

function room(id, x, y, w, h, extra = {}) {
  return chamber({
    id,
    polygon: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    bounds: { x, y, w, h },
    floorStart: { x, y, z: -20 },
    floorEnd: { x: x + w, y, z: -20 },
    ...extra,
  });
}

function chamber(extra = {}) {
  return {
    id: 'bore',
    kind: 'sealed-bore',
    polygon: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 40 },
      { x: 0, y: 40 },
    ],
    bounds: { x: 0, y: 0, w: 100, h: 40 },
    zMin: -20.5,
    zMax: -2,
    referenceFloorMin: -20,
    referenceFloorMax: -20,
    floorStart: { x: 0, y: 20, z: -20 },
    floorEnd: { x: 100, y: 20, z: -20 },
    ...extra,
  };
}
function world(volumes) {
  return {
    bounds: { left: -100, top: -100, right: 1000, bottom: 1000 },
    buildings: [],
    obstacles: [],
    roads: [],
    tunnels: [],
    transit: { railClearanceVolumes: volumes },
  };
}
test('built bore space contains whole circle bodies and enforces its floor, roof and walls', () => {
  const terrain = createTerrain(world([chamber()]));
  assert.equal(terrain.isBlocked(50, 20, 7, -20), false);
  assert.equal(terrain.isBlocked(50, 6.99, 7, -20), true);
  assert.equal(terrain.isBlocked(50, 7, 7, -20), false);
  assert.equal(terrain.isBlocked(50, 20, 7, -21), true);
  assert.equal(terrain.isBlocked(50, 20, 7, -1), true);
  assert.equal(terrain.hasLineOfSight({ x: 10, y: 20, z: -10 }, { x: 90, y: 20, z: -10 }), true);
  assert.equal(terrain.hasLineOfSight({ x: 10, y: 20, z: -10 }, { x: 110, y: 20, z: -10 }), false);
});
test('walkable Metro chamber floors follow grades without granting cars rail access or ground-to-deck teleportation', () => {
  const terrain = createTerrain(
    world([
      chamber({
        kind: 'viaduct',
        zMin: 19.5,
        zMax: 42,
        referenceFloorMin: 20,
        referenceFloorMax: 26,
        floorStart: { x: 0, y: 20, z: 20 },
        floorEnd: { x: 100, y: 20, z: 26 },
      }),
    ]),
  );
  assert.equal(terrain.surfaceHeight(50, 20, 23), 23);
  assert.equal(terrain.surfaceHeight(50, 20, 23, { mode: 'car' }), 0);
  assert.equal(terrain.surfaceHeight(50, 20, 0), 0);
});
test('cuttings are physical roof openings while sealed bores block rays through the city floor', () => {
  const sealed = createTerrain(world([chamber()]));
  assert.equal(sealed.hasLineOfSight({ x: 50, y: 20, z: -10 }, { x: 50, y: 20, z: 10 }), false);
  const cutting = createTerrain(world([chamber({ kind: 'cutting', zMax: 18 })]));
  assert.equal(cutting.hasLineOfSight({ x: 50, y: 20, z: -10 }, { x: 50, y: 20, z: 10 }), true);
});
test('rail support over water preserves the raw water query beneath the physical deck', () => {
  const terrain = createTerrain({
    ...world([
      chamber({
        kind: 'viaduct',
        zMin: 19.5,
        zMax: 38,
        referenceFloorMin: 20,
        referenceFloorMax: 20,
        floorStart: { x: 0, y: 20, z: 20 },
        floorEnd: { x: 100, y: 20, z: 20 },
      }),
    ]),
    landforms: [
      {
        polygon: [
          [200, 200],
          [300, 200],
          [300, 300],
          [200, 300],
        ],
      },
    ],
  });
  assert.equal(terrain.isWater(50, 20), false);
  assert.equal(terrain.isWater(50, 20, { ignoreDeck: true }), true);
  assert.equal(terrain.surfaceHeight(50, 20, 20), 20);
});
test('invalid chamber coordinates and grades fail before an index can authorize terrain space', () => {
  assert.throws(
    () => createRailTerrain(world([chamber({ floorEnd: { x: 100, y: 20, z: NaN } })])),
    /floor grade/,
  );
  assert.throws(() => createRailTerrain(world([chamber({ zMax: -22 })])), /chamber/);
});

test('a whole circle crosses a shared chamber seam and still detects a real narrow earth gap', () => {
  const connected = world([room('left', -10, -20, 10, 40), room('right', 0, -20, 10, 40)]),
    terrain = createTerrain(connected),
    rail = createRailTerrain(connected);
  assert.equal(rail.space(0, 0, -4, 2), true);
  assert.equal(terrain.isBlocked(0, 0, 2, -4), false);
  assert.ok(rail.surfaces(0, 0, 2).some((surface) => surface.height === -20));
  const separated = createRailTerrain(
    world([room('left', -10, -20, 9.999, 40), room('right', 0.001, -20, 9.999, 40)]),
  );
  assert.equal(separated.space(0, 0, -4, 2), false);
});

test('triangle room seams and grazing circle tangencies use the exact physical union', () => {
  const a = chamber({
      polygon: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 40 },
      ],
    }),
    b = chamber({
      id: 'other-half',
      polygon: [
        { x: 0, y: 0 },
        { x: 100, y: 40 },
        { x: 0, y: 40 },
      ],
    });
  const rail = createRailTerrain(world([a, b]));
  assert.equal(rail.space(50, 20, -4, 20), true);
  assert.equal(rail.space(50, 20, -4, 20.001), false);
  assert.equal(rail.space(50, 7, -4, 7), true);
  assert.equal(rail.space(50, 6.999, -4, 7), false);
});

test('a hole inside the body is blocked even when the circle circumference and center lie in rooms', () => {
  const volumes = [
    room('bottom', -10, -10, 20, 10),
    room('top', -10, 2, 20, 8),
    room('left', -10, 0, 10, 2),
    room('right', 2, 0, 8, 2),
  ];
  const rail = createRailTerrain(world(volumes));
  assert.equal(rail.space(0, 0, -4, 0), true);
  assert.equal(rail.space(0, 0, -4, 7), false);
});

test('continuous visibility catches a one-unit earth wall between valid endpoint rooms', () => {
  const terrain = createTerrain(
    world([room('left', -10, -20, 13, 40), room('right', 4, -20, 16, 40)]),
  );
  assert.equal(terrain.isBlocked(3.5, 0, 0, -4), true);
  assert.equal(terrain.hasLineOfSight({ x: 0, y: 0, z: -4 }, { x: 7, y: 0, z: -4 }), false);
  const connected = createTerrain(
    world([room('left', -10, -20, 14, 40), room('right', 4, -20, 16, 40)]),
  );
  assert.equal(connected.hasLineOfSight({ x: 0, y: 0, z: -4 }, { x: 7, y: 0, z: -4 }), true);
  const long = world([room('left', -10, -20, 5010, 40), room('right', 5000.000001, -20, 6000, 40)]);
  long.bounds.right = 12000;
  assert.equal(
    createTerrain(long).hasLineOfSight({ x: 0, y: 0, z: -4 }, { x: 10000, y: 0, z: -4 }),
    false,
    'interval tolerance does not grow with ray length',
  );
});

test('legacy tunnel roads participate in continuous coverage and cannot hide a sub-sample earth gap', () => {
  const road = (id, x1, x2) => ({
    id,
    x1,
    y1: 0,
    x2,
    y2: 0,
    z: -20,
    width: 40,
    tunnel: true,
    access: ['foot', 'car'],
    rampStart: 0,
    rampEnd: 0,
  });
  const base = { ...world([]), tunnels: [{}], roads: [road('left', -10, 3), road('right', 4, 20)] };
  const terrain = createTerrain(base);
  assert.equal(terrain.hasLineOfSight({ x: 0, y: 0, z: -4 }, { x: 7, y: 0, z: -4 }), false);
  const bridge = room('connecting-chamber', 3, -20, 1, 40);
  const joined = createTerrain({ ...base, transit: { railClearanceVolumes: [bridge] } });
  assert.equal(joined.hasLineOfSight({ x: 0, y: 0, z: -4 }, { x: 7, y: 0, z: -4 }), true);
});

test('height-sliced circle and segment unions retain grade, floor, roof and separate-level constraints', () => {
  const inclined = room('grade', 0, 0, 100, 40, {
    floorStart: { x: 0, y: 20, z: -20 },
    floorEnd: { x: 100, y: 20, z: -14 },
    roofStart: { x: 0, y: 20, z: -4 },
    roofEnd: { x: 100, y: 20, z: 2 },
    zMin: -21,
    zMax: 3,
  });
  const rail = createRailTerrain(world([inclined])),
    terrain = createTerrain(world([inclined]));
  assert.equal(rail.space(50, 20, -17, 7), true);
  assert.equal(rail.space(50, 20, -17.2, 7), false, 'uphill side penetrates the graded floor');
  assert.equal(rail.space(50, 20, -1, 7), false, 'uphill/downhill sides exceed the graded roof');
  assert.equal(
    terrain.hasLineOfSight({ x: 10, y: 20, z: -19.4 }, { x: 90, y: 20, z: -14.6 }),
    true,
  );
  assert.equal(
    terrain.hasLineOfSight({ x: 10, y: 20, z: -19.4 }, { x: 90, y: 20, z: -19.4 }),
    false,
  );
  const separated = createRailTerrain(
    world([
      room('low', 0, 0, 100, 40, { zMax: -10 }),
      room('high', 0, 0, 100, 40, {
        referenceFloorMin: -5,
        floorStart: { x: 0, y: 20, z: -5 },
        floorEnd: { x: 100, y: 20, z: -5 },
        zMin: -5.5,
        zMax: 10,
      }),
    ]),
  );
  assert.equal(separated.space(50, 20, -7, 2), false);
});

test('portal openings follow their actual roof plane instead of a distant chamber height bound', () => {
  const volume = room('opening', 0, 0, 100, 40, {
    kind: 'cutting',
    roofStart: { x: 0, y: 20, z: -4 },
    roofEnd: { x: 100, y: 20, z: 4 },
    zMax: 4,
  });
  const rail = createRailTerrain(world([volume])),
    terrain = createTerrain(world([volume]));
  assert.equal(rail.openPortal(25, 20), false);
  assert.equal(rail.openPortal(75, 20), true);
  assert.equal(terrain.hasLineOfSight({ x: 25, y: 20, z: -5 }, { x: 25, y: 20, z: 5 }), false);
  assert.equal(terrain.hasLineOfSight({ x: 75, y: 20, z: -5 }, { x: 75, y: 20, z: 5 }), true);
});

test('circle coverage joins a constructed chamber to a legacy tunnel across a shared side wall', () => {
  const geometry = world([room('upper', -10, 0, 20, 10)]);
  geometry.roads = [
    {
      id: 'lower-tunnel',
      x1: -10,
      y1: -5,
      x2: 10,
      y2: -5,
      z: -20,
      width: 10,
      tunnel: true,
      rampStart: 0,
      rampEnd: 0,
      access: ['foot', 'car'],
    },
  ];
  const terrain = createTerrain(geometry);
  assert.equal(createRailTerrain(geometry).space(0, 0, -4, 2), false);
  assert.equal(terrain.isBlocked(0, 0, 2, -4), false);
  assert.equal(terrain.isBlocked(0, 0, 10.001, -4), true);
});

test('legacy graded bores retain the existing floor and piecewise roof rules in continuous sight', () => {
  const geometry = {
    ...world([]),
    tunnels: [{}],
    roads: [
      {
        id: 'grade',
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 0,
        z1: -25,
        z2: -5,
        width: 40,
        tunnel: true,
        access: ['foot', 'car'],
      },
    ],
  };
  const terrain = createTerrain(geometry);
  assert.equal(terrain.hasLineOfSight({ x: 0, y: 0, z: -24 }, { x: 100, y: 0, z: -4 }), true);
  assert.equal(
    terrain.hasLineOfSight({ x: 0, y: 0, z: -15 }, { x: 100, y: 0, z: 5 }),
    false,
    'ray crosses the closed deep-bore roof before the actual portal',
  );
  const flat = createTerrain({ ...geometry, roads: [{ ...geometry.roads[0], z1: -20, z2: -20 }] });
  assert.equal(flat.hasLineOfSight({ x: 10, y: 0, z: -2 }, { x: 90, y: 0, z: -2 }), true);
  assert.equal(flat.hasLineOfSight({ x: 10, y: 0, z: -1.999 }, { x: 90, y: 0, z: -1.999 }), false);
});

test('many differently tiled convex rooms agree with an independent complete-rectangle disk bound', () => {
  for (let layout = 0; layout < 12; layout++) {
    const seams = [-20, -13 + layout / 4, -4 + layout / 7, 5 + layout / 5, 20],
      volumes = seams.slice(1).map((end, i) => room(`tile${i}`, seams[i], -15, end - seams[i], 30));
    const rail = createRailTerrain(world(volumes));
    for (const x of [-19, -13, -4, 0, 5, 13, 19])
      for (const y of [-14, -5, 0, 5, 14])
        for (const radius of [0, 1, 3, 7]) {
          const expected =
            x - radius >= -20 && x + radius <= 20 && y - radius >= -15 && y + radius <= 15;
          assert.equal(
            rail.space(x, y, -4, radius),
            expected,
            JSON.stringify({ layout, x, y, radius }),
          );
        }
  }
  const fractional = -4 + 1 / 7;
  const narrow = createRailTerrain(
    world([
      room('left', -20, -15, fractional + 20 - 0.000001, 30),
      room('right', fractional, -15, 20 - fractional, 30),
    ]),
  );
  assert.equal(
    narrow.space(fractional, 0, -4, 2),
    false,
    'a real microunit gap is retained at a fractional shared boundary',
  );
});
