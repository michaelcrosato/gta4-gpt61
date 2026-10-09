const limits = new WeakMap();

/** Save/aim bounds follow authored geometry, including subsurface streets. */
export function worldElevation(world) {
  if (limits.has(world)) return limits.get(world);
  let lowest = 0,
    highest = 150;
  for (const road of world.roads || []) {
    lowest = Math.min(lowest, road.z1 ?? road.z ?? 0, road.z2 ?? road.z ?? 0);
    highest = Math.max(highest, road.z1 ?? road.z ?? 0, road.z2 ?? road.z ?? 0);
  }
  for (const building of world.buildings || []) highest = Math.max(highest, building.height || 0);
  const result = Object.freeze({ min: lowest < 0 ? lowest - 30 : 0, max: highest + 100 });
  limits.set(world, result);
  return result;
}
