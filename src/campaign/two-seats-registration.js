/** Actual M3 room portals/site aliases; no actor is created, moved or healed. */
import { createTwoSeatsScenePlan } from './two-seats-scenes.js';
export const TWO_SEATS_PORTALS = Object.freeze([
  Object.freeze({
    id: 'tess-flat-entry',
    roomId: 'tess-flat',
    locationId: 'tess-flat',
    siteId: 'LL-CITY-LOC174',
    entryRadius: 22,
    vehicleAllowed: false,
    wantedMax: 0,
  }),
  Object.freeze({
    id: 'pier-goods-entry',
    roomId: 'pier-goods',
    locationId: 'pier-goods',
    siteId: 'LL-CITY-LOC034',
    entryRadius: 22,
    vehicleAllowed: false,
    wantedMax: 0,
  }),
]);
export const TWO_SEATS_CLOSED_ACCESS = Object.freeze([
  Object.freeze({
    id: 'boardwalk-lift-closed',
    x: 415.75,
    y: 101,
    w: 0.75,
    h: 10,
    z: 0,
    height: 40,
    type: 'closed-lift-door',
    color: '#79877d',
    render: false,
    traversable: false,
  }),
  Object.freeze({
    id: 'boardwalk-stair-fence',
    x: 415.75,
    y: 119,
    w: 0.75,
    h: 10,
    z: 0,
    height: 34,
    type: 'closed-stair-gate',
    color: '#4e645d',
    render: false,
    traversable: false,
  }),
]);
export function createTwoSeatsRegisteredWorld(source, { verifyGeometry } = {}) {
  const plan = createTwoSeatsScenePlan(source),
    locations = [...source.locations];
  for (const key of ['tess-flat', 'pier-goods']) {
    const b = plan.bindings[key],
      existing = locations.find((l) => l.id === key),
      alias = {
        id: key,
        name: key === 'tess-flat' ? 'Tess’s Flat' : 'Pier Goods',
        type: key === 'tess-flat' ? 'apartment' : 'clothing',
        x: b.entry.x,
        y: b.entry.y,
        z: b.entry.z ?? 0,
        siteId: b.siteId,
        buildingId: b.buildingId,
        radius: 22,
      };
    if (existing) {
      if (
        existing.x !== alias.x ||
        existing.y !== alias.y ||
        (existing.z ?? 0) !== alias.z ||
        existing.siteId !== alias.siteId
      )
        throw Error('M3 site alias conflicts with actual authored anchor.');
    } else locations.push(alias);
    if (
      JSON.stringify(TWO_SEATS_PORTALS.find((p) => p.roomId === key)) !== JSON.stringify(b.portal)
    )
      throw Error('M3 portal registry differs from frozen binding.');
  }
  const footReservation = {
    id: 'tess-standing-access',
    name: 'Kiln Row sidewalk',
    x1: 729,
    y1: 233,
    x2: 729,
    y2: 392,
    z: 0,
    z1: 0,
    z2: 0,
    width: 18,
    access: ['foot'],
    kind: 'sidewalk',
    ambient: false,
  };
  const obstacles = [...(source.obstacles ?? [])];
  for (const gate of TWO_SEATS_CLOSED_ACCESS) {
    if (obstacles.some((o) => o.id === gate.id))
      throw Error('Duplicate closed Metro access geometry.');
    obstacles.push(gate);
  }
  const bindings = {
      ...plan.bindings,
      'boardwalk-station': {
        ...plan.bindings['boardwalk-station'],
        closedAccess: TWO_SEATS_CLOSED_ACCESS,
        blockedAccessSpur: {
          status: 'built-closed',
          preserveOperatingRamp: true,
          obstacleIds: TWO_SEATS_CLOSED_ACCESS.map((g) => g.id),
        },
      },
    },
    report = {
      ...plan.report,
      registrationReady: true,
      geometryReady: false,
      artReady: false,
      gameplayReady: false,
      ready: false,
      runtimeReady: false,
    },
    world = {
      ...plan.world,
      roads: [...plan.world.roads, footReservation],
      locations,
      obstacles,
      campaignSceneBindings: { ...plan.world.campaignSceneBindings, ...bindings },
      campaignSceneReports: { ...plan.world.campaignSceneReports, 'LL-ST-003': report },
      campaignActorDefinitions: { ...source.campaignActorDefinitions, 'LL-ST-003': plan.newActors },
    };
  if (verifyGeometry) {
    const proof = verifyGeometry(world, { ...plan, bindings });
    report.geometry = proof;
    report.geometryReady = proof.ready === true;
    report.ready = report.geometryReady;
    report.boundary =
      'Checked M3 room/site registration and full-body routes with actual open doorway apertures only. Art, shared gameplay integration, sustained performance and source completion remain separate gates.';
  }
  return { world, bindings, rooms: plan.rooms, actorDefinitions: plan.newActors, report };
}
export function drawTwoSeatsClosedAccess(r) {
  const E = globalThis.My3D2dge;
  if (!E?.px) throw Error('Native engine required.');
  for (const gate of TWO_SEATS_CLOSED_ACCESS) {
    const x = 416.6,
      y = gate.y,
      h = gate.h,
      z = gate.height,
      p = (yy, zz) => r.w(x, yy, zz);
    r.queue(
      x,
      y + h / 2,
      z / 2,
      (g) => {
        E.px.poly(g, [p(y, 0), p(y + h, 0), p(y + h, z), p(y, z)], gate.color);
        for (const yy of [y, y + h]) {
          const a = p(yy, 0),
            b = p(yy, z);
          E.px.line(g, ...a, ...b, '#b3b5a0', 1);
        }
        if (gate.type === 'closed-stair-gate') {
          for (let zz = 4; zz < z; zz += 6) {
            const a = p(y, zz),
              b = p(y + h, zz);
            E.px.line(g, ...a, ...b, '#a9b29d', 1);
          }
          const a = p(y, 2),
            b = p(y + h, z - 2);
          E.px.line(g, ...a, ...b, '#bdad78', 2);
        } else {
          const a = p(y + h / 2, 0),
            b = p(y + h / 2, z);
          E.px.line(g, ...a, ...b, '#344d46', 1);
          const c = p(y + 2, z * 0.65),
            d = p(y + h - 2, z * 0.65);
          E.px.line(g, ...c, ...d, '#c8af71', 2);
        }
      },
      { bias: 0.12 },
    );
  }
}
