import test from 'node:test';
import assert from 'node:assert/strict';
import { CITY_BLUEPRINT as city } from '../src/city-blueprint.js';
import { createRailWorld } from '../src/rail-geometry.js';
import { createTerrain } from '../src/terrain.js';
import { createSurfaceMovement } from '../src/surface-movement.js';
import { createTransit, updateTransit } from '../src/transit.js';
import { createRoadNetwork } from '../src/road-network.js';

const original = JSON.stringify(city);
const { world, report } = createRailWorld(city);
const terrain = createTerrain(world);
const movement = createSurfaceMovement(terrain);
const platforms = new Map(world.transit.stations.flatMap((s) => s.platforms.map((p) => [p.id, p])));
const tracks = new Map(world.transit.tracks.map((t) => [t.id, t]));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const close = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-6, `${label}: ${a} != ${b}`);

function walk(path) {
  const actor = { ...path.points[0], groundZ: path.points[0].z };
  for (const target of path.points.slice(1)) {
    const start = { ...actor },
      count = Math.max(1, Math.ceil(distance(start, target) / 2));
    const dx = (target.x - start.x) / count,
      dy = (target.y - start.y) / count;
    for (let i = 0; i < count; i++) {
      const beforeZ = actor.z;
      movement.moveBody(actor, dx, dy, 7);
      assert.ok(Math.abs(actor.z - beforeZ) <= 6, `${path.id} jumps elevation`);
      assert.equal(
        terrain.isWater(actor.x, actor.y, { ignoreDeck: true }),
        false,
        `${path.id} crosses raw water`,
      );
      assert.equal(terrain.isBlocked(actor.x, actor.y, 7, actor.z), false, `${path.id} is blocked`);
    }
  }
  const end = path.points.at(-1);
  close(actor.x, end.x, `${path.id} x`);
  close(actor.y, end.y, `${path.id} y`);
  close(actor.z, end.z, `${path.id} z`);
  return actor;
}

test('derivation preserves every existing geometry record and leaves the source blueprint unchanged', () => {
  assert.equal(JSON.stringify(city), original);
  for (const key of [
    'buildings',
    'obstacles',
    'water',
    'waterVolumes',
    'landforms',
    'lakes',
    'sites',
    'bridges',
    'tunnels',
  ])
    assert.equal(world[key], city[key], key);
  for (const key of ['roads', 'decks']) {
    assert.notEqual(world[key], city[key]);
    city[key].forEach((record, index) => assert.equal(world[key][index], record));
  }
  assert.notEqual(world.transit, city.transit);
  assert.equal(city.transit.stations[0].platforms[0].width, 9);
});

test('the retained source audit names its original geometric conflicts independently of implementation statuses', () => {
  const audit = report.sourceAudit;
  assert.equal(audit.centerlineBuildingIntersections.segments, 48);
  assert.equal(audit.centerlineBuildingIntersections.tracks, 9);
  assert.equal(audit.centerlineBuildingIntersections.trackBuildingPairs, 46);
  assert.equal(audit.centerlineBuildingIntersections.buildings, 37);
  assert.deepEqual(
    [...new Set(audit.centerlineBuildingIntersections.records.map((r) => r.trackId))],
    [
      'HC-TRACK-11',
      'HC-TRACK-12',
      'HC-TRACK-13',
      'HC-TRACK-15',
      'HC-TRACK-16',
      'HC-TRACK-17',
      'HC-TRACK-18',
      'HC-TRACK-26',
      'HC-TRACK-28',
    ],
  );
  assert.equal(audit.endpointAxisMismatches.length, 6);
  assert.equal(audit.platformOverlaps.filter((p) => p.sameHeight).length, 2);
  assert.equal(audit.sharedOpposedTracks.length, 28);
});

test('the actual city retains 26 complexes, 28 source roles, all eight labels, and four closed services', () => {
  assert.equal(report.usableStationComplexes, 26);
  assert.equal(report.sourcePlatforms, 28);
  assert.equal(report.directionalFaces, 56);
  assert.equal(report.directionalTracks, 56);
  assert.equal(report.accessPaths, 28);
  assert.deepEqual(
    world.transit.stations.map((s) => s.id),
    city.transit.stations.map((s) => s.id),
  );
  assert.deepEqual(
    world.transit.segments.map((s) => s.id),
    city.transit.segments.map((s) => s.id),
  );
  assert.equal(world.transit.segments.length, 8);
  assert.equal(world.transit.throughServices.length, 4);
  for (const service of world.transit.throughServices) {
    const source = city.transit.throughServices.find((s) => s.id === service.id);
    assert.equal(service.closedLoop, true);
    assert.deepEqual(
      service.calls.map((c) => c.stationId),
      source.calls.map((c) => c.stationId),
    );
    assert.equal(service.legs.length, service.calls.length);
    service.legs.forEach((leg, i) => {
      assert.equal(leg.fromPlatformId, service.calls[i].platformId);
      assert.equal(leg.toPlatformId, service.calls[(i + 1) % service.calls.length].platformId);
      assert.equal(leg.sourceTrackId, source.trackIds[i]);
      assert.ok(tracks.has(leg.trackId));
    });
  }
});

test('all 56 boarding positions fit radius-seven actors and stand physically beside a 20-unit train', () => {
  for (const face of platforms.values()) {
    assert.ok(face.width >= 24);
    assert.ok(face.length >= 68 + 14);
    assert.equal(
      terrain.isBlocked(face.boardingPoint.x, face.boardingPoint.y, 7, face.z),
      false,
      face.id,
    );
    const separation = distance(face.stopPoint, face.boardingPoint);
    assert.ok(separation > 20 / 2 + 7, `${face.id} actor intersects train`);
    assert.ok(separation - 20 / 2 <= 18, `${face.id} cannot reach the door`);
    close(face.stopPoint.z, face.z, `${face.id} stop elevation`);
    close(face.boardingPoint.z, face.z, `${face.id} boarding elevation`);
    assert.ok(
      face.boardingPoint.x - 7 >= face.bounds.x - 1e-6 &&
        face.boardingPoint.x + 7 <= face.bounds.x + face.bounds.w + 1e-6,
    );
    assert.ok(
      face.boardingPoint.y - 7 >= face.bounds.y - 1e-6 &&
        face.boardingPoint.y + 7 <= face.bounds.y + face.bounds.h + 1e-6,
    );
  }
});

test('every actual station approach is traversed naturally in both directions through Terrain and SurfaceMovement', () => {
  for (const path of world.transit.accessPaths) {
    assert.ok(path.width >= 18);
    assert.ok(path.grade <= 0.5);
    assert.ok(path.roadIds.length);
    walk(path);
    walk({ ...path, id: `${path.id}:return`, points: [...path.points].reverse() });
  }
});

test('Brigid Market upper/lower and Glassward Central circuit transfers are physical walking routes', () => {
  assert.deepEqual(
    world.transit.interchanges.map((i) => i.stationId),
    ['LL-CITY-ST04', 'LL-CITY-ST11'],
  );
  for (const interchange of world.transit.interchanges) {
    assert.equal(interchange.pedestrianTransfer, 'graded-walking-path');
    assert.equal(interchange.transferPaths.length, 1);
    const path = interchange.transferPaths[0];
    assert.ok(path.viaStreetEntrance);
    walk(path);
    walk({ ...path, id: `${path.id}:reverse`, points: [...path.points].reverse() });
  }
  const market = world.transit.stations.find((s) => s.id === 'LL-CITY-ST04');
  assert.deepEqual(
    [...new Set(market.platforms.filter((p) => p.role === 'upper').map((p) => p.z))],
    [22],
  );
  assert.deepEqual(
    [...new Set(market.platforms.filter((p) => p.role === 'lower').map((p) => p.z))],
    [12],
  );
  const central = world.transit.stations.find((s) => s.id === 'LL-CITY-ST11');
  assert.equal(new Set(central.platforms.map((p) => p.islandId)).size, 2);
  const [outer, inner] = central.platforms.filter(
    (p) => p.serviceId.endsWith('01') || p.serviceId.endsWith('03'),
  );
  assert.ok(distance(outer, inner) > 104, 'the formerly overlapping circuit decks remain separate');
});

test('all directional rail endpoints match their own stop faces and align with both platform axes', () => {
  for (const track of tracks.values()) {
    const from = platforms.get(track.fromPlatformId),
      to = platforms.get(track.toPlatformId);
    assert.deepEqual(track.points[0], from.stopPoint, track.id);
    assert.deepEqual(track.points.at(-1), to.stopPoint, track.id);
    for (const [a, b, face] of [
      [track.points[0], track.points[1], from],
      [track.points.at(-2), track.points.at(-1), to],
    ]) {
      const dx = b.x - a.x,
        dy = b.y - a.y;
      close(dx * Math.sin(face.heading) - dy * Math.cos(face.heading), 0, `${track.id} tangent`);
    }
  }
});

test('flat running sections meet bounded six-percent grade transitions without vertical teleports', () => {
  let changed = 0;
  for (const track of tracks.values()) {
    assert.ok(track.maxGrade <= 0.06 + 1e-7, track.id);
    if (track.points[0].z !== track.points.at(-1).z) changed++;
    track.points.slice(1).forEach((b, i) => {
      const a = track.points[i],
        length = distance(a, b);
      assert.ok(length > 1e-6, `${track.id} has a vertical/zero-length segment`);
      assert.ok(
        Math.abs((b.z - a.z) / length) <= 0.06 + 1e-7,
        `${track.id} excessive segment grade`,
      );
    });
    assert.ok(track.flatDistance > 0, `${track.id} must have actual flat running sections`);
  }
  assert.ok(changed >= 8, 'real elevated/metro transition legs were checked');
  assert.equal(
    report.unresolved.some((i) => i.kind === 'rail-reversal-needs-turnout'),
    false,
  );
  assert.ok(
    report.metrics.flatDistance > report.metrics.gradedDistance * 3,
    'most travel remains at a running level',
  );
  const main = report.transitionZones.filter((zone) => zone.kind === 'elevated-metro-transition');
  assert.equal(main.length, 8);
  for (const zone of main) {
    close(zone.end - zone.start, 600, `${zone.id} 36-unit transition run`);
    assert.ok(zone.lateralOffset >= 36);
    if (zone.minParallelBodyClearance !== null)
      assert.ok(zone.minParallelBodyClearance >= 2, zone.id);
    assert.ok(zone.sourceRoadWidth >= 80 || zone.reservation === 'new-dedicated-rail-reservation');
    assert.ok(zone.width >= 96);
    assert.equal(zone.points.length, 2);
    close(zone.points[0].z, zone.fromZ, `${zone.id} start`);
    close(zone.points[1].z, zone.toZ, `${zone.id} end`);
    assert.ok(zone.requiredHandler && zone.connectivityEffect);
  }
});

test('opposed services have distinct face IDs, track IDs, and physical stop centerlines', () => {
  for (const station of world.transit.stations) {
    for (const id of station.sourcePlatformIds) {
      const faces = station.platforms.filter((p) => p.sourcePlatformId === id);
      assert.equal(faces.length, 2);
      assert.notEqual(faces[0].id, faces[1].id);
      assert.ok(distance(faces[0].stopPoint, faces[1].stopPoint) >= 48 - 1e-6);
    }
  }
  for (const originalTrack of city.transit.tracks) {
    const derived = [...tracks.values()].filter((t) => t.sourceTrackId === originalTrack.id);
    assert.equal(derived.length, 2);
    assert.notEqual(derived[0].id, derived[1].id);
  }
});

test('rail corridors avoid actual building volumes and use existing supported water spans', () => {
  assert.equal(
    report.unresolved.some((i) => i.kind === 'train-building-clearance'),
    false,
  );
  assert.equal(
    report.unresolved.some((i) => i.kind === 'rail-water-span-unresolved'),
    false,
  );
  assert.ok(report.waterCrossings.length >= 6, 'cross-district water routes were audited');
  assert.ok(report.waterCrossings.every((c) => c.usesExistingCrossing && c.unsupported === 0));
  assert.equal(world.landforms, city.landforms, 'water crossings must not expand the land');
  for (const access of world.transit.accessPaths)
    for (const p of access.points)
      assert.equal(terrain.isWater(p.x, p.y, { ignoreDeck: true }), false);
});

test('actual controller headings carry the full 68-unit body around complete circuits without entering existing buildings', () => {
  // Declared static-volume fixture: car traffic and train-to-train occupancy
  // remain the parent integration's crossing/reservation checks.
  const state = createTransit(world),
    services = new Map(world.transit.throughServices.map((s) => [s.id, s]));
  const sourceTerrain = createTerrain(city),
    seen = new Set(),
    collisions = [];
  function overlaps(train, box) {
    if (train.z + 16 <= 0 || train.z >= (box.height || 40)) return false;
    const c = Math.cos(train.heading),
      s = Math.sin(train.heading);
    const trainCorners = [
      [-34, -10],
      [-34, 10],
      [34, -10],
      [34, 10],
    ].map(([u, v]) => ({ x: train.x + c * u - s * v, y: train.y + s * u + c * v }));
    const boxCorners = [
      { x: box.x, y: box.y },
      { x: box.x + box.w, y: box.y },
      { x: box.x, y: box.y + box.h },
      { x: box.x + box.w, y: box.y + box.h },
    ];
    for (const [x, y] of [
      [1, 0],
      [0, 1],
      [c, s],
      [-s, c],
    ]) {
      const a = trainCorners.map((p) => p.x * x + p.y * y),
        b = boxCorners.map((p) => p.x * x + p.y * y);
      if (Math.max(...a) <= Math.min(...b) + 1e-7 || Math.max(...b) <= Math.min(...a) + 1e-7)
        return false;
    }
    return true;
  }
  const context = {
    onTrainMove({ train }) {
      seen.add(services.get(train.serviceId).legs[train.callIndex].trackId);
      for (const box of sourceTerrain.nearbyBuildings(train.x, train.y, 36))
        if (overlaps(train, box))
          collisions.push({
            trainId: train.id,
            boxId: box.id,
            x: train.x,
            y: train.y,
            z: train.z,
            heading: train.heading,
          });
    },
  };
  for (let i = 0; i < 40000 && state.trains.some((t) => t.circuits < 1); i++)
    updateTransit(state, world, 0.1, context);
  assert.ok(
    state.trains.every((t) => t.circuits >= 1),
    'every service must complete a full circuit',
  );
  assert.equal(seen.size, 56, 'every authored directional leg was observed');
  assert.deepEqual(state.callbackErrors, []);
  assert.deepEqual(collisions, []);
});

test('parallel traffic is separated and only seven local crossings require signals', () => {
  assert.deepEqual(world.transit.trafficReservations, []);
  assert.deepEqual(report.parallelConflicts, []);
  assert.equal(report.roadConnectivity.permanentCarClosures, 0);
  assert.equal(world.transit.railCrossings.length, 7);
  for (const crossing of world.transit.railCrossings) {
    assert.equal(crossing.policy, 'gate-cars');
    assert.ok(crossing.clearance < crossing.required);
    assert.ok(crossing.bounds.w >= 40);
  }
  assert.equal(report.certified, false);
  assert.equal(report.status, 'candidate');
  assert.ok(report.unresolved.every((i) => i.kind === 'vehicle-clearance-gap-required'));
  assert.ok(report.unresolved.every((i) => i.requiredHandler && i.connectivityEffect));
});

test('the original public driving network stays connected without car-road exclusions', () => {
  const before = createRoadNetwork(city, { mode: 'car' }),
    after = createRoadNetwork(world, { mode: 'car' });
  assert.equal(after.components, before.components);
  assert.deepEqual(
    after.segments.map((s) => s.road.id),
    before.segments.map((s) => s.road.id),
  );
  for (const road of city.roads.filter(
    (r) => r.access?.includes('car') || r.access?.includes('foot'),
  ))
    assert.equal(
      world.roads.find((r) => r.id === road.id),
      road,
    );
});

test('dedicated rail viaducts and bores retain public crossing decks and do not create land over water', () => {
  assert.ok(world.transit.dedicatedRailSpans.length >= 10);
  for (const span of world.transit.dedicatedRailSpans) {
    assert.ok(span.id && span.requiredHandler && span.connectivityEffect);
    assert.equal(span.publicDeckPreserved, true);
    assert.ok(span.points.length >= 2, span.id);
    assert.ok(span.width >= 20);
  }
  assert.equal(world.landforms, city.landforms);
  assert.equal(world.water, city.water);
  assert.equal(world.bridges, city.bridges);
});

test('shared physical rails receive cross-service interlocks, including every overlapping-height centerline junction', () => {
  const records = world.transit.railInterlocks;
  assert.equal(records, report.sharedRailConstraints);
  assert.ok(
    records.some(
      (r) => r.kind === 'shared-rail-span' && r.serviceIds.length === 4 && r.length >= 500,
    ),
    'the four-service shared core corridor needs one physical occupancy domain',
  );
  assert.ok(report.sharedRailAudit.rawSegmentPairs >= records.length);
  assert.ok(report.sharedRailAudit.gradeSeparatedSegmentPairs > 0);
  const junctions = new Map();
  for (const record of records) {
    assert.ok(record.id && record.requiredHandler && record.connectivityEffect);
    assert.equal(record.status, 'interlocking-required');
    assert.ok(record.trackIds.length >= 1 && record.serviceIds.length >= 1);
    assert.ok(record.fullTrainBuffer >= 46);
    assert.ok(record.bounds.zMax > record.bounds.zMin);
    for (const id of record.trackIds) assert.ok(tracks.has(id), id);
    if (record.kind === 'rail-junction')
      for (let i = 0; i < record.trackIds.length; i++)
        for (let j = i + 1; j < record.trackIds.length; j++) {
          const key = [record.trackIds[i], record.trackIds[j]].sort().join('|');
          if (!junctions.has(key)) junctions.set(key, []);
          junctions.get(key).push(record.points[0]);
        }
  }
  // Independent brute-force crossing check validates the spatial index audit.
  const segments = [...tracks.values()].flatMap((track) =>
    track.points
      .slice(1)
      .map((b, i) => ({ trackId: track.id, serviceId: track.serviceId, a: track.points[i], b })),
  );
  let checked = 0;
  for (let i = 0; i < segments.length; i++)
    for (let j = i + 1; j < segments.length; j++) {
      const A = segments[i],
        B = segments[j];
      if (A.serviceId === B.serviceId) continue;
      const u = { x: A.b.x - A.a.x, y: A.b.y - A.a.y },
        v = { x: B.b.x - B.a.x, y: B.b.y - B.a.y };
      const determinant = u.x * v.y - u.y * v.x;
      if (Math.abs(determinant) < 1e-7) continue;
      const d = { x: B.a.x - A.a.x, y: B.a.y - A.a.y },
        t = (d.x * v.y - d.y * v.x) / determinant,
        q = (d.x * u.y - d.y * u.x) / determinant;
      if (t < 0 || t > 1 || q < 0 || q > 1) continue;
      const zA = A.a.z + (A.b.z - A.a.z) * t,
        zB = B.a.z + (B.b.z - B.a.z) * q;
      if (Math.abs(zA - zB) >= 16 - 1e-7) continue;
      const p = { x: A.a.x + u.x * t, y: A.a.y + u.y * t },
        key = [A.trackId, B.trackId].sort().join('|');
      assert.ok(
        junctions.get(key)?.some((at) => distance(at, p) < 1e-4),
        `${key} lacks an interlock at ${p.x},${p.y}`,
      );
      checked++;
    }
  assert.ok(checked > 100, 'actual same-height junctions across the city were checked');
  assert.equal(
    records.some((record) => record.flowClasses.includes('opposing-direction')),
    false,
    'opposing running spans require separated geometry',
  );
});

test('canonical physical resources cover all raw conflicts and publish whole-leg/station clearance bundles', () => {
  const resources = world.transit.railResources,
    map = new Map(resources.map((resource) => [resource.id, resource]));
  assert.ok(
    resources.length < world.transit.railInterlocks.length / 2,
    'raw pairs must group into physical resources',
  );
  assert.deepEqual(
    [...new Set(resources.flatMap((r) => r.rawConstraintIds))].sort(),
    world.transit.railInterlocks.map((r) => r.id).sort(),
  );
  for (const resource of resources) {
    assert.ok(['junction', 'shared-block'].includes(resource.type));
    assert.ok(resource.requiredHandler && resource.connectivityEffect);
    assert.ok(resource.entryBuffer >= 34 && resource.releaseBuffer >= 34);
    assert.ok(resource.entryBounds.w >= resource.physicalBounds.w + 68);
    assert.equal(resource.flowClasses.includes('opposing-direction'), false);
  }
  let terminalHolds = 0;
  for (const track of tracks.values()) {
    const length = track.points
      .slice(1)
      .reduce(
        (n, p, i) =>
          n + Math.hypot(p.x - track.points[i].x, p.y - track.points[i].y, p.z - track.points[i].z),
        0,
      );
    for (const bundle of world.transit.legResourceBundles[track.id]) {
      const resource = map.get(bundle.resourceId);
      assert.ok(resource && resource.trackIds.includes(track.id));
      assert.ok(bundle.entryDistance >= 0 && bundle.releaseDistance > bundle.entryDistance);
      if (bundle.releaseDistance > length) terminalHolds++;
    }
  }
  assert.ok(terminalHolds > 0, 'terminal rear-clearance holds must be carried into the next leg');
  for (const platform of platforms.values())
    for (const id of world.transit.stationResourceBundles[platform.id]) assert.ok(map.has(id));
  assert.equal(world.transit.railCrossingRecords.length, 8);
  assert.equal(world.transit.railCrossings.length, 7);
  assert.ok(
    world.transit.railCrossings.some((gate) => gate.trackIds.length > 1),
    'adjacent crossings on one road use one gate resource',
  );
});

test('invalid actor/train dimensions and missing topology fail before producing misleading geometry', () => {
  assert.throws(() => createRailWorld(city, { actorRadius: 0 }), /Invalid rail option/);
  assert.throws(() => createRailWorld(city, { trainHeight: Infinity }), /Invalid rail option/);
  assert.throws(() => createRailWorld(city, { actorRadius: 15 }), /clearance/);
  assert.throws(() => createRailWorld(city, { trainLength: 200 }), /clearance/);
  assert.throws(() => createRailWorld({ roads: [] }), /authored roads and rail topology/);
});
