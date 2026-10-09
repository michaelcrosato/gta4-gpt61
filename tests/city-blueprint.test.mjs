import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CITY_BLUEPRINT as city, containsLand, roadReservation } from '../src/city-blueprint.js';
import { WORLD as prologue } from '../src/prologue-world.js';
import { createTerrain } from '../src/terrain.js';

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const pointInRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const key = (p) =>
  `${Math.round(p.x * 1e6)},${Math.round(p.y * 1e6)},${Math.round((p.z || 0) * 1e6)}`;
const idOf = (items) => items.map((item) => item.id).sort();

// Independently split the authored road network at every physical intersection.
// Counts or proximity alone cannot prove an area's actual route reaches the city.
function network(mode = 'foot', { boats = false } = {}) {
  const roads = city.roads.filter((road) => road.access.includes(mode)),
    nodes = new Map(),
    splits = roads.map(() => new Map());
  const height = (road, p) => {
    const dx = road.x2 - road.x1,
      dy = road.y2 - road.y1,
      t = ((p.x - road.x1) * dx + (p.y - road.y1) * dy) / (dx * dx + dy * dy);
    return road.z1 + (road.z2 - road.z1) * t;
  };
  function add(index, p) {
    p = { ...p, z: height(roads[index], p) };
    const id = key(p);
    if (!nodes.has(id)) nodes.set(id, { p, neighbors: new Set() });
    splits[index].set(id, p);
    return id;
  }
  roads.forEach((road, index) => {
    add(index, { x: road.x1, y: road.y1 });
    add(index, { x: road.x2, y: road.y2 });
  });
  const on = (p, road) =>
    p.x >= Math.min(road.x1, road.x2) - 1e-6 &&
    p.x <= Math.max(road.x1, road.x2) + 1e-6 &&
    p.y >= Math.min(road.y1, road.y2) - 1e-6 &&
    p.y <= Math.max(road.y1, road.y2) + 1e-6;
  for (let i = 0; i < roads.length; i++)
    for (let j = i + 1; j < roads.length; j++) {
      const a = roads[i],
        b = roads[j],
        av = a.x1 === a.x2,
        bv = b.x1 === b.x2;
      if (av !== bv) {
        const p = { x: av ? a.x1 : b.x1, y: av ? b.y1 : a.y1 };
        if (on(p, a) && on(p, b) && Math.abs(height(a, p) - height(b, p)) < 1e-6) {
          add(i, p);
          add(j, p);
        }
      } else if (av ? a.x1 === b.x1 : a.y1 === b.y1) {
        for (const p of [
          { x: a.x1, y: a.y1 },
          { x: a.x2, y: a.y2 },
          { x: b.x1, y: b.y1 },
          { x: b.x2, y: b.y2 },
        ])
          if (on(p, a) && on(p, b) && Math.abs(height(a, p) - height(b, p)) < 1e-6) {
            add(i, p);
            add(j, p);
          }
      }
    }
  for (const area of city.neighbourhoods) {
    const index = roads.findIndex((road) => road.id === area.gateway.roadId);
    if (index >= 0) add(index, area.gateway);
  }
  for (const split of splits) {
    const entries = [...split].sort((a, b) => a[1].x - b[1].x || a[1].y - b[1].y);
    for (let i = 1; i < entries.length; i++) {
      nodes.get(entries[i - 1][0]).neighbors.add(entries[i][0]);
      nodes.get(entries[i][0]).neighbors.add(entries[i - 1][0]);
    }
  }
  if (boats)
    for (const link of city.connections.filter((connection) => connection.mode === 'boat')) {
      const a = nodes.get(key(link.from)),
        b = nodes.get(key(link.to));
      assert.ok(a && b, 'boat endpoints must have actual landing paths');
      a.neighbors.add(key(link.to));
      b.neighbors.add(key(link.from));
    }
  const spawn = key(city.spawn);
  assert.ok(nodes.has(spawn));
  const reached = new Set([spawn]),
    queue = [spawn];
  for (let i = 0; i < queue.length; i++)
    for (const next of nodes.get(queue[i]).neighbors)
      if (!reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
  return {
    roads,
    nodes,
    reached,
    roadConnected: (id) => {
      const index = roads.findIndex((road) => road.id === id);
      return index >= 0 && [...splits[index].keys()].some((id) => reached.has(id));
    },
  };
}
const walking = network('foot', { boats: true });
const driving = network('car');

test('all65 authored areas and194 physical location roles exactly cover the catalogue IDs', async () => {
  const catalogue = JSON.parse(
    await readFile(new URL('../docs/research/city-source-map.json', import.meta.url), 'utf8'),
  ).inventories;
  assert.deepEqual(idOf(city.neighbourhoods), idOf(catalogue.neighbourhoods));
  assert.deepEqual(idOf(city.sites), idOf(catalogue.locations));
  assert.equal(new Set(city.sites.map((site) => site.id)).size, 194);
  assert.equal(city.width, 12000);
  assert.equal(city.height, 10000);
  assert.ok(city.buildings.length > 1000, 'the expanded city needs actual street architecture');
});

test('every area has real themed street geometry, landmarks, a landform and a reachable gateway', () => {
  for (const area of city.neighbourhoods) {
    assert.ok(area.w > 300 && area.h > 300, area.id);
    assert.ok(area.architecture.length > 5);
    assert.ok(area.morphology.length > 5);
    assert.ok(area.landmarkIds.length >= 2);
    assert.ok(city.landforms.some((form) => form.id === area.landformId));
    assert.ok(area.roadIds.length > 0);
    assert.ok(
      walking.reached.has(key(area.gateway)),
      `${area.name} gateway is physically disconnected`,
    );
    assert.ok(
      area.roadIds.every((id) => city.roads.some((road) => road.id === id)),
      `${area.name} references a missing road`,
    );
  }
});

test('all public site approaches and station entrances reach the physical pedestrian network', () => {
  for (const site of city.sites) {
    assert.ok(site.address.length > 5);
    assert.ok(site.entrance && city.roads.some((road) => road.id === site.entrance.roadId));
    assert.ok(
      walking.roadConnected(site.entrance.roadId),
      `${site.id} ${site.name} has an unreachable street approach`,
    );
    assert.ok(
      pointInRect(
        site,
        city.neighbourhoods.find((area) => area.id === site.neighbourhoodId).bounds,
      ),
    );
    assert.equal(
      site.interior.status,
      'unimplemented',
      'planned scenes cannot be advertised as working interiors',
    );
    if (site.buildingId)
      assert.ok(city.buildings.some((building) => building.id === site.buildingId));
    else assert.ok(site.geometry?.kind === 'reserved-landscape');
  }
  for (const station of city.transit.stations)
    for (const entrance of station.entrances)
      assert.ok(walking.roadConnected(entrance.roadId), station.id);
});

test('all mainland districts have continuous car routes while the boat-only monument island retains its actual access policy', () => {
  for (const area of city.neighbourhoods) {
    if (area.access.includes('car'))
      assert.ok(
        driving.roadConnected(area.gateway.roadId),
        `${area.name} has no drivable mainland connection`,
      );
  }
  const island = city.neighbourhoods.find((area) => area.id === 'LL-CITY-N053');
  assert.deepEqual(island.access, ['foot', 'boat']);
  const footOnly = network('foot');
  assert.equal(footOnly.reached.has(key(island.gateway)), false);
  assert.ok(
    city.connections.some(
      (connection) => connection.neighbourhoodIds.includes(island.id) && connection.mode === 'boat',
    ),
  );
});

test('reserved road corridors contain no building or planar water collision boxes', () => {
  for (const road of city.roads) {
    const corridor = roadReservation(road);
    assert.equal(
      city.buildings.some((building) => overlap(corridor, building)),
      false,
      `${road.id} clips a building`,
    );
    if (!road.tunnel)
      assert.equal(
        city.water.some((water) => overlap(corridor, water)),
        false,
        `${road.id} crosses planar water without a dry reservation`,
      );
  }
});

test('exterior entrance lots stay dry and free of buildings; nested arcade sites belong to their parent physical structure', () => {
  for (const site of city.sites) {
    if (site.parentSiteId) {
      const parent = city.sites.find((item) => item.id === site.parentSiteId);
      assert.ok(parent);
      assert.equal(site.buildingId, parent.buildingId);
      assert.equal(site.entrance.roadId, parent.entrance.roadId);
      continue;
    }
    assert.ok(containsLand(site), `${site.id} is in a water volume`);
    assert.equal(
      city.buildings.some((building) => overlap(site.lot, building)),
      false,
      `${site.id} entrance is inside a collision volume`,
    );
    assert.equal(
      city.water.some((water) => overlap(site.lot, water)),
      false,
      `${site.id} entrance is flooded`,
    );
  }
});

test('prologue services, pickups, roads, spawn and collision silhouettes keep their coordinates', () => {
  assert.deepEqual(city.spawn, prologue.spawn);
  assert.deepEqual(city.locations, prologue.locations);
  assert.deepEqual(city.pickups, prologue.pickups);
  assert.deepEqual(city.obstacles, prologue.obstacles);
  for (const road of prologue.roads) {
    const preserved = city.roads.find((item) => item.id === road.id);
    assert.ok(preserved);
    for (const field of ['x1', 'y1', 'x2', 'y2', 'width'])
      assert.equal(preserved[field], road[field]);
    assert.ok(driving.roadConnected(road.id));
  }
  for (const building of prologue.buildings) {
    const preserved = city.buildings.find((item) => item.id === building.id);
    assert.ok(preserved);
    for (const field of ['x', 'y', 'w', 'h', 'height'])
      assert.equal(preserved[field], building[field]);
  }
  for (const point of [...city.locations, ...city.pickups]) {
    assert.ok(containsLand(point));
    assert.equal(
      city.buildings.some((building) => pointInRect(point, building)),
      false,
      `${point.id} lost its usable ground position`,
    );
  }
});

test('every preserved live supply is genuinely dry and circle/LOS-clear in the terrain, including the loading-yard shotgun', () => {
  const terrain = createTerrain(city);
  for (const pickup of city.pickups) {
    assert.equal(terrain.isWater(pickup.x, pickup.y), false, pickup.id);
    assert.equal(terrain.isBlocked(pickup.x, pickup.y, 7, 0), false, pickup.id);
    assert.equal(
      terrain.hasLineOfSight(
        { x: pickup.x, y: pickup.y, z: 14 },
        { x: pickup.x, y: pickup.y, z: 0 },
      ),
      true,
      `${pickup.id} cannot begin inside a blocking volume`,
    );
  }
  const shotgun = city.pickups.find((pickup) => pickup.id === 'port-combat-shotgun');
  assert.deepEqual({ x: shotgun.x, y: shotgun.y }, { x: 1645, y: 1049 });
});

test('district morphology is spatially distinct rather than five color variations of one neighborhood grid', () => {
  assert.equal(new Set(city.districts.map((district) => district.morphology)).size, 5);
  const finance = city.buildings.filter((building) => building.neighbourhoodId === 'LL-CITY-N050'),
    industrial = city.buildings.filter((building) => building.neighbourhoodId === 'LL-CITY-N064');
  assert.ok(finance.some((building) => building.height >= 180));
  assert.ok(industrial.some((building) => building.w > 90));
  assert.ok(city.roads.some((road) => road.kind === 'switchback'));
  assert.ok(city.roads.some((road) => road.kind === 'promenade'));
  assert.ok(city.roads.some((road) => road.kind === 'skyway'));
  assert.ok(city.landforms.filter((form) => form.districtId === 'glassward').length >= 3);
  assert.ok(city.lakes.length >= 3);
});

test('the airport reserves actual runway and apron footprints outside public road and building geometry', () => {
  for (const runway of city.airport.runways) {
    assert.ok(runway.w * runway.h > 100000);
    assert.equal(
      city.buildings.some((building) => overlap(runway, building)),
      false,
    );
    assert.equal(
      city.roads.some((road) => overlap(runway, roadReservation(road))),
      false,
    );
  }
  const airport = city.neighbourhoods.find((area) => area.id === city.airport.neighbourhoodId);
  assert.ok(driving.roadConnected(airport.gateway.roadId));
});

test('all26 stations and eight service segments preserve the four paired through-route call sequences and levels', async () => {
  const catalogue = JSON.parse(
    await readFile(new URL('../docs/research/city-source-map.json', import.meta.url), 'utf8'),
  ).inventories;
  assert.deepEqual(idOf(city.transit.stations), idOf(catalogue.stations));
  assert.deepEqual(idOf(city.transit.segments), idOf(catalogue.route_segments));
  assert.deepEqual(idOf(city.transit.throughServices), idOf(catalogue.through_services));
  for (const service of city.transit.throughServices) {
    const reference = catalogue.through_services.find((item) => item.id === service.id);
    assert.deepEqual(
      service.calls.map((call) => call.stationId),
      reference.source_loop_calls.map((call) => call.station_id),
    );
    assert.equal(service.trackIds.length, service.calls.length);
    for (const call of service.calls) {
      const station = city.transit.stations.find((item) => item.id === call.stationId);
      assert.ok(station.platforms.some((platform) => platform.id === call.platformId));
      assert.ok(station.serviceIds.includes(service.id));
    }
  }
  const interchange = city.transit.stations.find((station) => station.id === 'LL-CITY-ST04');
  assert.equal(interchange.platforms.length, 2);
  assert.notEqual(interchange.platforms[0].z, interchange.platforms[1].z);
  const outer = city.transit.throughServices
    .find((service) => service.id === 'LL-CITY-SERVICE-01')
    .calls.filter((call) => call.stationId === 'LL-CITY-ST04');
  assert.equal(outer.length, 2);
  assert.notEqual(outer[0].platformId, outer[1].platformId);
});

test('crossing and tunnel roles have authored paths, real road references and explicit clearance/access limits', async () => {
  const catalogue = JSON.parse(
    await readFile(new URL('../docs/research/city-source-map.json', import.meta.url), 'utf8'),
  ).inventories;
  assert.deepEqual(idOf(city.bridges), idOf(catalogue.crossings));
  for (const crossing of city.bridges) {
    assert.ok(crossing.path.length >= 2);
    assert.ok(crossing.roadIds.length);
    assert.ok(crossing.roadIds.every((id) => city.roads.some((road) => road.id === id)));
    if (crossing.open) assert.ok(crossing.clearance > 10);
    else assert.deepEqual(crossing.access, []);
  }
  assert.equal(city.tunnels.length, 3);
  for (const tunnel of city.tunnels) {
    assert.equal(tunnel.portals.length, 2);
    assert.equal(tunnel.interiorStatus, 'unimplemented');
    assert.ok(tunnel.roadIds.every((id) => city.roads.some((road) => road.id === id)));
  }
  for (const arterial of city.arterials)
    assert.ok(arterial.roadIds.length, `${arterial.id} cannot be only a name`);
});

test('each bridge and bore has actual nonzero interior height, graded ground portals, and layer-aware road connections', () => {
  for (const crossing of [...city.bridges.filter((bridge) => bridge.open), ...city.tunnels]) {
    const roads = crossing.roadIds.map((id) => city.roads.find((road) => road.id === id));
    assert.equal(roads[0].z1, 0, crossing.id);
    assert.equal(roads.at(-1).z2, 0, crossing.id);
    assert.ok(
      roads.some((road) => road.z1 !== 0 || road.z2 !== 0),
      `${crossing.id} cannot remain a flat surface`,
    );
    for (let i = 1; i < roads.length; i++)
      assert.equal(roads[i - 1].z2, roads[i].z1, `${crossing.id} has an altitude teleport`);
    assert.ok(
      roads.some((road) => road.z1 !== 0 && road.z1 === road.z2),
      `${crossing.id} needs a genuine constant-height deck/bore segment`,
    );
    for (const road of roads) {
      assert.ok(Number.isFinite(road.grade));
      const reservation = city.decks.find((deck) => deck.roadId === road.id);
      assert.equal(reservation.z1, road.z1);
      assert.equal(reservation.z2, road.z2);
    }
  }
  const waterAboveBore = city.water.some((water) =>
    city.tunnels.some((tunnel) =>
      tunnel.roadIds.some((id) => {
        const road = city.roads.find((road) => road.id === id);
        return overlap(water, roadReservation(road));
      }),
    ),
  );
  assert.ok(waterAboveBore, 'sea water must remain above the underwater bore');
});

test('every public walking or driving road belongs to its actual connected height-aware component', () => {
  for (const [mode, graph] of [
    ['foot', walking],
    ['car', driving],
  ])
    for (const road of graph.roads) {
      assert.ok(
        graph.roadConnected(road.id),
        `${mode} road ${road.id} is isolated or only crosses another road at a different height`,
      );
    }
});

test('every authored car road is collision-clear at21 actual-radius samples through its true elevation', () => {
  const terrain = createTerrain(city);
  for (const road of city.roads.filter((road) => road.access.includes('car')))
    for (let i = 0; i <= 20; i++) {
      const t = i / 20,
        x = road.x1 + (road.x2 - road.x1) * t,
        y = road.y1 + (road.y2 - road.y1) * t,
        z = road.z1 + (road.z2 - road.z1) * t;
      assert.equal(
        terrain.isBlocked(x, y, 10, z),
        false,
        `${road.id} blocks a vehicle at ${x},${y},${z}`,
      );
    }
});

test('rail-only geometry and the two physical station networks remain distinct from car/foot access', () => {
  const railBridge = city.bridges.find((bridge) => bridge.id === 'LL-CITY-CROSS08');
  assert.deepEqual(railBridge.access, ['rail']);
  assert.ok(
    railBridge.roadIds.every(
      (id) =>
        !walking.roads.some((road) => road.id === id) &&
        !driving.roads.some((road) => road.id === id),
    ),
  );
  for (const service of city.transit.throughServices)
    for (const leg of service.legs) {
      const track = city.transit.tracks.find((track) => track.id === leg.trackId);
      assert.deepEqual(track.access, ['rail']);
      assert.ok(
        track.platformIds.includes(leg.fromPlatformId) &&
          track.platformIds.includes(leg.toPlatformId),
      );
      const point = leg.reverse ? track.points.at(-1) : track.points[0],
        station = city.transit.stations.find((station) =>
          station.platforms.some((platform) => platform.id === leg.fromPlatformId),
        ),
        platform = station.platforms.find((platform) => platform.id === leg.fromPlatformId);
      assert.deepEqual(point, { x: platform.x, y: platform.y, z: platform.z });
    }
  for (const segment of city.transit.segments) {
    const service = city.transit.throughServices.find((service) =>
      service.segmentIds.includes(segment.id),
    );
    for (const call of segment.calls)
      assert.ok(
        service.calls.some(
          (through) =>
            through.stationId === call.stationId && through.platformId === call.platformId,
        ),
      );
  }
  const union = city.transit.stations.find((station) => station.id === 'LL-CITY-ST11');
  assert.equal(union.hostSiteId, 'LL-CITY-LOC092');
  assert.equal(
    union.buildingId,
    city.sites.find((site) => site.id === union.hostSiteId).buildingId,
  );
});

test('runtime blueprint exports original place names and makes unfinished scene systems explicit', () => {
  const serialized = JSON.stringify(city);
  for (const sourceName of ['Liberty City', 'Hove Beach', 'Algonquin', 'Burger Shot', 'Cluckin'])
    assert.equal(serialized.includes(sourceName), false, sourceName);
  assert.equal(city.implementation.interiors, 'unimplemented');
  assert.equal(city.implementation.trains, 'unimplemented');
  assert.equal(city.implementation.boats, 'unimplemented');
  assert.equal(city.transit.gondola.runtimeStatus, 'unimplemented');
});
