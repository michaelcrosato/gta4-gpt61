/** A real, graded Dispatch viaduct. All prior planar rail corridors are retained. */
import { CITY_BLUEPRINT } from './city-blueprint.js';
import { createNightCrossingWorld } from './campaign/scenes.js';
import { createLateMeterWorld } from './campaign/late-meter-scenes.js';
import { createRailWorld } from './rail-geometry.js';
import { createRailClearanceWorld } from './rail-clearance.js';
import { amendDispatchDeckFloors } from './dispatch-floor-amendment.js';
import { TESS_RAIL_PROFILE, upgradeTessTrack } from './tess-standing-profile.js';
export { TESS_RAIL_PROFILE } from './tess-standing-profile.js';
export const DISPATCH_RAIL_PROFILE = Object.freeze({
  trackId: 'HC-TRACK-17@LL-CITY-SERVICE-01',
  x: 456,
  start: 350,
  riseEnd: 350 + 20 / 0.06,
  fallStart: 860,
  end: 860 + 20 / 0.06,
  fromZ: 18,
  toZ: 38,
  maxGrade: 0.06,
  requiredBodyHeight: 30,
  fascia: 1,
});
function upgradedPoints(track) {
  const P = DISPATCH_RAIL_PROFILE,
    controls = [P.start, P.riseEnd, P.fallStart, P.end];
  const lift = (y) =>
    Math.max(0, Math.min(20, (y - P.start) * P.maxGrade, (P.end - y) * P.maxGrade));
  const result = [];
  for (let i = 1; i < track.points.length; i++) {
    const a = track.points[i - 1],
      b = track.points[i],
      selected = Math.abs(a.x - P.x) < 1e-7 && Math.abs(b.x - P.x) < 1e-7;
    const ts = [0, 1];
    if (selected)
      for (const y of controls) {
        const t = (y - a.y) / (b.y - a.y);
        if (t > 0 && t < 1) ts.push(t);
      }
    ts.sort((a, b) => a - b);
    for (const t of ts) {
      if (result.length && t === 0) continue;
      const p = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
      };
      if (selected && p.y >= P.start - 1e-7 && p.y <= P.end + 1e-7) {
        if (Math.abs(p.z - 18) > 1e-7)
          throw Error('The known Dispatch rail profile is not a flat18 baseline.');
        p.z += lift(p.y);
      }
      result.push(p);
    }
  }
  return result;
}
export function createDispatchStandingWorld(referenceWorld) {
  if (!referenceWorld?.transit?.tracks.some((t) => t.id === DISPATCH_RAIL_PROFILE.trackId))
    throw Error('The known prior-world Dispatch track is required.');
  const arrival = createNightCrossingWorld(CITY_BLUEPRINT);
  const baseline = createRailWorld(arrival.world);
  const tracks = referenceWorld.transit.tracks.map((track) => ({
    trackId: track.id,
    points:
      track.id === DISPATCH_RAIL_PROFILE.trackId
        ? upgradedPoints(track)
        : track.id === TESS_RAIL_PROFILE.trackId
          ? upgradeTessTrack(track)
          : track.points,
  }));
  const rail = createRailWorld(arrival.world, {
    trackGeometryOverrides: tracks,
    initialLaneCorrections: baseline.report.directionalLaneCorrections,
  });
  const physical = createRailClearanceWorld(rail.world);
  const dispatchFloors = amendDispatchDeckFloors(physical.world, DISPATCH_RAIL_PROFILE);
  const floors = amendDispatchDeckFloors(dispatchFloors.world, TESS_RAIL_PROFILE);
  const built = {
    ...floors.world,
    transit: {
      ...floors.world.transit,
      railClearanceVolumes: floors.world.transit.railClearanceVolumes.map((v) => ({
        ...v,
        construction: 'built',
        access: ['rail', 'foot'],
      })),
      railClearanceGeometry: {
        ...physical.world.transit.railClearanceGeometry,
        status: 'constructed-core',
        requiresConstruction: false,
      },
      runtimeStatus: 'operating-core',
    },
    geometryRevision: {
      id: 'm3-standing-candidate-2',
      profile: DISPATCH_RAIL_PROFILE,
      tessProfile: TESS_RAIL_PROFILE,
      boundary:
        'Local standing corridor only; existing other low viaducts/bores remain unverified for full-height actors.',
    },
  };
  const impound = createLateMeterWorld(built);
  return {
    world: impound.world,
    report: {
      ready: false,
      profile: DISPATCH_RAIL_PROFILE,
      tessProfile: TESS_RAIL_PROFILE,
      geometry: rail.report,
      construction: physical.report,
      deckEndcaps: [dispatchFloors.report, floors.report],
      impound: impound.report,
      pending: [
        'checked oldsave/fleet/signal/checkpoint migration',
        'fullbody entry/exit/native proof',
        'actual four-service liveness',
      ],
    },
  };
}
