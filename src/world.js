/** Harbor City's expanded exterior geometry; prologue bindings remain stable. */
import { CITY_BLUEPRINT } from './city-blueprint.js';
export { ROAD_XS, ROAD_YS } from './prologue-world.js';
export const WORLD = Object.freeze({
  ...CITY_BLUEPRINT,
  description:
    'Harbor City exterior world; full interiors, transport and content remain in production.',
  implementation: {
    ...CITY_BLUEPRINT.implementation,
    cityRuntime: 'exterior-core',
    traffic: 'regional-core',
  },
});
