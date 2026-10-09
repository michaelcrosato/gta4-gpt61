/** Actual native support columns participate in the static train predicate. */
import { createRailClearance } from './rail-clearance.js';
import { compileRailConstruction } from './rail-construction.js';
const predicates = new WeakMap();
export function createConstructedRailClearance(world) {
  let predicate = predicates.get(world);
  if (!predicate) {
    const supportSolids = compileRailConstruction(world).supportSolids,
      existing = new Set((world.obstacles ?? []).map((s) => s.id)),
      obstacles = [...(world.obstacles ?? []), ...supportSolids.filter((s) => !existing.has(s.id))];
    predicate = createRailClearance({ ...world, obstacles });
    predicate.supportSolids = supportSolids;
    predicates.set(world, predicate);
  }
  return predicate;
}
