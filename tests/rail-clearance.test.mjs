import test from 'node:test';
import assert from 'node:assert/strict';
import { createRailClearance, createRailClearanceWorld } from '../src/rail-clearance.js';
import { createTransit, updateTransit } from '../src/transit.js';
import { createRailDispatcher } from '../src/rail-dispatcher.js';
import { WORLD } from '../src/world.js';

function fixture(z = -18) {
  const A = { x: -200, y: 0, z },
    B = { x: 200, y: 200, z };
  const tracks = [
    { id: 'out', fromPlatformId: 'a', toPlatformId: 'b', points: [A, { x: 200, y: 0, z }, B] },
    { id: 'back', fromPlatformId: 'b', toPlatformId: 'a', points: [B, { x: 200, y: 0, z }, A] },
  ];
  const roads = tracks.flatMap((t) =>
    t.points.slice(1).map((b, i) => {
      const a = t.points[i];
      return {
        id: `${t.id}:${i}`,
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        z1: a.z,
        z2: b.z,
        width: 20,
        access: ['rail'],
        tunnel: z < 0,
      };
    }),
  );
  const platform = (id, p, heading) => ({
    id,
    ...p,
    heading,
    length: 104,
    width: 24,
    stopPoint: p,
    boardingPoint: { ...p, y: p.y - 20 },
  });
  return {
    bounds: { left: -1000, top: -1000, right: 1000, bottom: 1000 },
    buildings: [],
    obstacles: [],
    water: [],
    waterVolumes: [],
    lakes: [],
    landforms: [
      {
        polygon: [
          [-1000, -1000],
          [1000, -1000],
          [1000, 1000],
          [-1000, 1000],
        ],
      },
    ],
    roads,
    decks: [],
    tunnels: [],
    transit: {
      stations: [
        { id: 'sa', name: 'A', platforms: [platform('a', A, 0)] },
        { id: 'sb', name: 'B', platforms: [platform('b', B, -Math.PI / 2)] },
      ],
      tracks,
      throughServices: [
        {
          id: 'svc',
          name: 'Service',
          closedLoop: true,
          calls: [
            { stationId: 'sa', platformId: 'a' },
            { stationId: 'sb', platformId: 'b' },
          ],
          legs: [
            { trackId: 'out', fromPlatformId: 'a', toPlatformId: 'b', reverse: false },
            { trackId: 'back', fromPlatformId: 'b', toPlatformId: 'a', reverse: false },
          ],
        },
      ],
      segments: [],
      dedicatedRailSpans: [],
      railGeometry: { settings: { trainLength: 68, trainWidth: 20, trainHeight: 16 } },
    },
  };
}
function request(start, end, z = -18) {
  const pose = (d) =>
    d <= 400
      ? { x: -200 + d, y: 0, z, heading: 0 }
      : { x: 200, y: d - 400, z, heading: Math.PI / 2 };
  // Requested examples stay outside the controller's smoothed turn window.
  const a = pose(start),
    b = pose(end),
    path = [{ x: a.x, y: a.y, z }];
  if (start < 400 && end > 400) path.push({ x: 200, y: 0, z });
  path.push({ x: b.x, y: b.y, z });
  return {
    train: { id: 'train', serviceId: 'svc', callIndex: 0, distance: start, ...a },
    path,
    endPose: b,
    length: 68,
    width: 20,
    height: 16,
  };
}
const body = (x = 0, y = 0, z = -18, heading = 0) => ({ x, y, z, heading });

test('finite twenty-unit bores fail full train ends and turns; the explicit candidate creates bounded chambers', () => {
  const source = fixture(),
    raw = createRailClearance(source),
    { world, report } = createRailClearanceWorld(source),
    check = createRailClearance(world);
  assert.equal(raw.inspectBody(body(-200, 0), 'out').clear, false);
  assert.equal(raw.inspectBody(body(200, 0, -18, Math.PI / 4), 'out').clear, false);
  assert.equal(check.inspectBody(body(-200, 0), 'out').clear, true);
  assert.equal(check.inspectBody(body(200, 0, -18, Math.PI / 4), 'out').clear, true);
  assert.equal(report.requiresConstruction, true);
  assert.equal(report.certified, false);
  assert.ok(report.volumes > 20);
});

test('candidate amendments preserve every existing city geometry record and are detached metadata', () => {
  const source = fixture(),
    before = JSON.stringify(source),
    { world } = createRailClearanceWorld(source);
  assert.equal(JSON.stringify(source), before);
  for (const key of [
    'roads',
    'decks',
    'buildings',
    'obstacles',
    'water',
    'waterVolumes',
    'landforms',
    'lakes',
    'tunnels',
  ])
    assert.equal(world[key], source[key]);
  assert.notEqual(world.transit, source.transit);
  assert.equal(world.transit.tracks, source.transit.tracks);
  assert.ok(
    world.transit.railClearanceVolumes.every(
      (v) => v.access.length === 1 && v.access[0] === 'rail',
    ),
  );
});

test('a one-unit blocker crossed between two clear endpoints rejects the entire swept movement', () => {
  const source = fixture();
  source.obstacles = [{ id: 'thin-wall', x: 0, y: -30, w: 1, h: 60, z: -20, height: 30 }];
  const { world, report } = createRailClearanceWorld(source),
    check = createRailClearance(world),
    r = request(50, 350);
  assert.equal(check.inspectBody(body(-150, 0), 'out').clear, true);
  assert.equal(check.inspectBody(body(150, 0), 'out').clear, true);
  const result = check.inspect(r);
  assert.equal(result.clear, false);
  assert.ok(report.unresolved.some((i) => i.solidIds.includes('thin-wall')));
  assert.equal(
    check
      .inspectBody(body(0, 0), 'out')
      .issues.some((i) => i.kind === 'solid-body' && i.solidId === 'thin-wall'),
    true,
  );
});

test('buildings retain their actual vertical solid volumes above and below the train', () => {
  const source = fixture();
  source.buildings = [{ id: 'tower', x: -20, y: -20, w: 40, h: 40, height: 12 }];
  const check = createRailClearance(createRailClearanceWorld(source).world);
  assert.equal(
    check.inspectBody(body(0, 0, -18), 'out').clear,
    true,
    'train is completely below the foundation',
  );
  assert.equal(
    check.inspectBody(body(0, 0, -10), 'out').issues.some((i) => i.kind === 'solid-body'),
    true,
    'the roof enters the foundation',
  );
  assert.equal(check.inspectBody(body(0, 0, 20), 'out').clear, true, 'train is above a low roof');
});

test('a rotated train can cross the world edge during a bend while both endpoint bodies remain inside', () => {
  const source = fixture();
  source.bounds.right = 225;
  const { world } = createRailClearanceWorld(source),
    check = createRailClearance(world),
    r = request(380, 420);
  assert.equal(check.inspectBody(body(180, 0), 'out').clear, true);
  assert.equal(check.inspectBody(body(200, 20, -18, Math.PI / 2), 'out').clear, true);
  assert.equal(
    check.inspect(r).issues.some((i) => i.kind === 'world-bounds'),
    true,
  );
});

test('partial corner patches and a narrow gap fail complete bore coverage even when all four corners are covered', () => {
  const source = fixture();
  source.transit.railClearanceVolumes = [
    [-34, -10],
    [34, -10],
    [34, 10],
    [-34, 10],
  ].map(([x, y], i) => ({
    id: `patch${i}`,
    kind: 'sealed-bore',
    trackIds: ['out'],
    zMin: -19,
    zMax: 0,
    polygon: [
      { x: x - 2, y: y - 2 },
      { x: x + 2, y: y - 2 },
      { x: x + 2, y: y + 2 },
      { x: x - 2, y: y + 2 },
    ],
  }));
  assert.equal(createRailClearance(source).inspectBody(body(), 'out').clear, false);
  source.transit.railClearanceVolumes = [
    [-100, 99.999],
    [0.001, 99.999],
  ].map(([x, w], i) => ({
    id: `half${i}`,
    kind: 'sealed-bore',
    trackIds: ['out'],
    zMin: -19,
    zMax: 0,
    polygon: [
      { x, y: -100 },
      { x: x + w, y: -100 },
      { x: x + w, y: 100 },
      { x, y: 100 },
    ],
  }));
  assert.equal(createRailClearance(source).inspectBody(body(), 'out').clear, false);
});

test('a bore floor or roof that excludes part of the full sixteen-unit train is rejected', () => {
  for (const [zMin, zMax] of [
    [-17, 0],
    [-19, -3],
  ]) {
    const source = fixture();
    source.transit.railClearanceVolumes = [
      {
        id: 'wrong-height',
        kind: 'sealed-bore',
        trackIds: ['out'],
        zMin,
        zMax,
        polygon: [
          { x: -500, y: -500 },
          { x: 500, y: -500 },
          { x: 500, y: 500 },
          { x: -500, y: 500 },
        ],
      },
    ];
    assert.equal(
      createRailClearance(source)
        .inspectBody(body(), 'out')
        .issues.some((i) => i.kind === 'bore-containment'),
      true,
    );
  }
});

test('raw water and lakes need actual bounded raised support; a ground-level rail strip cannot create a causeway', () => {
  const elevated = fixture(18);
  elevated.water = [{ x: -30, y: -30, w: 60, h: 60 }];
  assert.equal(createRailClearance(elevated).inspectBody(body(0, 0, 18), 'out').clear, false);
  const { world } = createRailClearanceWorld(elevated);
  assert.equal(createRailClearance(world).inspectBody(body(0, 0, 18), 'out').clear, true);
  assert.equal(world.water, elevated.water);
  assert.ok(world.transit.railClearanceVolumes.some((v) => v.kind === 'viaduct'));
  const ground = fixture(0);
  ground.lakes = [{ bounds: { x: -2, y: -2, w: 4, h: 4 } }];
  assert.equal(
    createRailClearance(createRailClearanceWorld(ground).world)
      .inspectBody(body(0, 0, 0), 'out')
      .issues.some((i) => i.kind === 'water-support'),
    true,
    'lake lies inside the body although its corners are on land',
  );
});

test('a sloping portal receives the full flat consist floor and headroom instead of a generic underground roof cap', () => {
  const source = fixture();
  const a = { x: -200, y: 0, z: -18 },
    b = { x: 400, y: 0, z: 18 };
  source.transit.tracks[0].points = [a, b];
  source.transit.tracks[1].points = [b, a];
  Object.assign(source.transit.stations[0].platforms[0], a, { stopPoint: a });
  Object.assign(source.transit.stations[1].platforms[0], b, { stopPoint: b });
  source.roads = [
    {
      id: 'grade',
      x1: -200,
      y1: 0,
      x2: 400,
      y2: 0,
      z1: -18,
      z2: 18,
      width: 20,
      access: ['rail'],
      tunnel: true,
    },
  ];
  const check = createRailClearance(createRailClearanceWorld(source).world);
  for (const t of [0, 0.2, 0.45, 0.5, 0.8, 1])
    assert.equal(check.inspectBody(body(-200 + 600 * t, 0, -18 + 36 * t), 'out').clear, true);
});

test('malformed dimensions, invented poses and diagonal shortcut sweeps fail before returning permission', () => {
  const check = createRailClearance(createRailClearanceWorld(fixture()).world),
    r = request(50, 350);
  assert.equal(check(r), true);
  assert.throws(() => check({ ...r, width: 19 }), /dimensions/);
  assert.throws(() => check({ ...r, train: { ...r.train, x: Infinity } }), /clearance/);
  assert.throws(
    () => check({ ...r, path: [r.path[0], { x: 150, y: 10, z: -18 }] }),
    /authored sweep/,
  );
  assert.throws(() => check({ ...r, train: { ...r.train, heading: Math.PI / 2 } }), /start pose/);
  assert.throws(
    () =>
      createRailClearance({
        ...fixture(),
        transit: {
          ...fixture().transit,
          railGeometry: { settings: { trainLength: 60, trainWidth: 20, trainHeight: 16 } },
        },
      }),
    /authored/,
  );
});

test('every actual derived WORLD service completes its controller circuit with checked rotated swept bodies and dispatch', () => {
  const before = JSON.stringify(WORLD),
    { world, report } = createRailClearanceWorld(WORLD),
    check = createRailClearance(world),
    model = createTransit(world),
    dispatcher = createRailDispatcher(world, model.trains),
    seen = new Set(),
    bendTracks = new Set();
  let movements = 0;
  const context = {
    canDepart: dispatcher.canDepart,
    canMoveTrain(request) {
      movements++;
      const service = world.transit.throughServices.find((s) => s.id === request.train.serviceId),
        trackId = service.legs[request.train.callIndex].trackId;
      seen.add(trackId);
      if (request.path.length > 2) bendTracks.add(trackId);
      const result = check.inspect(request);
      assert.equal(result.clear, true, JSON.stringify(result.issues));
      return dispatcher.canMoveTrain(request);
    },
  };
  for (let i = 0; i < 2500 && !model.trains.every((train) => train.circuits >= 1); i++) {
    dispatcher.beginStep(model.trains, model.time);
    updateTransit(model, world, 1, context);
    dispatcher.endStep(model.trains, model.time);
  }
  assert.ok(model.trains.every((train) => train.circuits >= 1));
  assert.equal(seen.size, 56);
  assert.equal(
    bendTracks.size,
    world.transit.tracks.filter((track) => track.points.length > 2).length,
  );
  assert.ok(movements > 5000);
  assert.equal(JSON.stringify(WORLD), before);
  assert.equal(report.clippedRooms.length, 0);
  assert.equal(report.unresolved.length, 0);
  assert.ok(report.refinedRooms.length > 0);
  assert.equal(
    report.certified,
    false,
    'pure clearance does not certify constructed/visible gameplay',
  );
});
