/** Harbor City's expanded exterior geometry; prologue bindings remain stable. */
import { CITY_BLUEPRINT } from './city-blueprint.js';
import { createRailWorld } from './rail-geometry.js';
import { createRailClearanceWorld } from './rail-clearance.js';
import { createNightCrossingWorld } from './campaign/scenes.js';
import { createLateMeterWorld } from './campaign/late-meter-scenes.js';
import { createDispatchStandingWorld } from './dispatch-standing-world.js';
import { createTwoSeatsRegisteredWorld } from './campaign/two-seats-registration.js';
import { proveTwoSeatsGeometry } from './campaign/two-seats-geometry-checks.js';
const arrivalCity = createNightCrossingWorld(CITY_BLUEPRINT);
export const NIGHT_CROSSING_BINDINGS = arrivalCity.bindings;
export const NIGHT_CROSSING_SCENE_REPORT = arrivalCity.report;
if (!arrivalCity.report.ready)
  throw new Error('The campaign arrival has unresolved physical scene geometry.');
const railCity = createRailWorld(arrivalCity.world);
const physicalRail = createRailClearanceWorld(railCity.world);
if (physicalRail.report.unresolved.length)
  throw new Error('Harbor Metro has unresolved physical construction conflicts.');
export const RAIL_GEOMETRY_REPORT = railCity.report;
export const RAIL_CLEARANCE_REPORT = {
  ...physicalRail.report,
  status: 'constructed-core',
  requiresConstruction: false,
  boundary:
    'Shared terrain and native rail rendering construct these chambers. Full source acceptance and gameplay release remain unverified.',
};
export { ROAD_XS, ROAD_YS } from './prologue-world.js';
const BASE_WORLD = Object.freeze({
  ...physicalRail.world,
  transit: {
    ...physicalRail.world.transit,
    railClearanceVolumes: physicalRail.world.transit.railClearanceVolumes.map((volume) => ({
      ...volume,
      construction: 'built',
      access: ['rail', 'foot'],
    })),
    railClearanceGeometry: {
      ...physicalRail.world.transit.railClearanceGeometry,
      status: 'constructed-core',
      requiresConstruction: false,
    },
    runtimeStatus: 'operating-core',
  },
  description:
    'Harbor City exterior world; full interiors, transport and content remain in production.',
  implementation: {
    ...CITY_BLUEPRINT.implementation,
    cityRuntime: 'exterior-core',
    traffic: 'regional-core',
    interiors: 'four-room-core',
    transit: 'operating-core',
  },
});

const impoundCity = createLateMeterWorld(BASE_WORLD);
export const LATE_METER_BINDINGS = impoundCity.bindings;
export const LATE_METER_SCENE_REPORT = impoundCity.report;
if (!impoundCity.report.ready)
  throw new Error('The impound annex has unresolved physical staging.');
export const LEGACY_WORLD = Object.freeze(impoundCity.world);
const standingCity = createDispatchStandingWorld(LEGACY_WORLD);
export const DISPATCH_STANDING_REPORT = standingCity.report;
const registeredTwoSeats = createTwoSeatsRegisteredWorld(standingCity.world, {
  verifyGeometry: proveTwoSeatsGeometry,
});
export const TWO_SEATS_GEOMETRY_REPORT = registeredTwoSeats.report;
// The composed app includes native wrist attachments, the canonical held blade,
// exact actor appearances, and the public renderer dressing callback. This
// enables that specific integration gate; gameplay/source acceptance is separate.
export const WORLD = Object.freeze({
  ...registeredTwoSeats.world,
  campaignSceneReports: {
    ...registeredTwoSeats.world.campaignSceneReports,
    'LL-ST-003': { ...registeredTwoSeats.report, injuryArt: true },
  },
});
