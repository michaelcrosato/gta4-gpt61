/** Support-relative conversion for the two known raised0.6 rail corridors only. */
import { compileRailConstruction } from './rail-construction.js';
import { DISPATCH_RAIL_PROFILE as P, TESS_RAIL_PROFILE } from './dispatch-standing-world.js';
const trackIds = new Set([P.trackId, TESS_RAIL_PROFILE.trackId]);
const EPS = 1e-6;
const exterior = (p) => (p.sceneId ?? (p.scene?.kind === 'interior' ? p.scene.id : null)) === null;
const inSpan = (p) =>
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  ((Math.abs(p.x - P.x) < 40 && p.y >= P.start && p.y <= P.end) ||
    (p.x >= TESS_RAIL_PROFILE.bounds.left &&
      p.x <= TESS_RAIL_PROFILE.bounds.right &&
      p.y >= TESS_RAIL_PROFILE.bounds.top &&
      p.y <= TESS_RAIL_PROFILE.bounds.bottom));
function contains(polygon, x, y) {
  const crosses = polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
  });
  return crosses.every((v) => v >= -EPS) || crosses.every((v) => v <= EPS);
}
const height = (floor, x, y) =>
  floor.floorPlane.a * x + floor.floorPlane.b * y + floor.floorPlane.c;
export function migrateDispatchSupports(state, fromWorld, toWorld, { rider = false } = {}) {
  const actors = [
      ...(!rider ? [state.player] : []),
      ...(state.companions?.actors ?? []),
      ...(state.pedestrians ?? []),
      ...(state.hostiles ?? []),
      ...(state.police ?? []),
      ...Object.values(state.ambient?.dormant ?? {}).flatMap((region) => region.pedestrians ?? []),
    ],
    items = [
      ...(state.pickups ?? []),
      ...(state.fires ?? []),
      ...Object.values(state.campaignRuntime?.sceneProps ?? {}).filter(
        (p) => p.state === 'dropped' && !p.ownerActorId,
      ),
    ],
    candidates = actors.filter(
      (p) =>
        p &&
        !p.vehicleId &&
        !p.inVehicle &&
        exterior(p) &&
        inSpan(p) &&
        Number.isFinite(p.groundZ) &&
        p.groundZ > 10,
    );
  const groundedItems = items.filter(
    (p) => p && exterior(p) && inSpan(p) && Number.isFinite(p.z) && p.z > 10 && p.z < 19,
  );
  if (!candidates.length && !groundedItems.length) return { actors: [], items: [] };
  const old = compileRailConstruction(fromWorld).structures.floors.filter((f) =>
      f.trackIds?.some((id) => trackIds.has(id)),
    ),
    next = compileRailConstruction(toWorld).structures.floors.filter((f) =>
      f.trackIds?.some((id) => trackIds.has(id)),
    );
  const delta = (p, oldZ, offset = 0) => {
    const supports = old.filter(
      (f) => contains(f.points, p.x, p.y) && Math.abs(height(f, p.x, p.y) + offset - oldZ) <= EPS,
    );
    if (!supports.length) return null;
    const target = next.filter((f) => contains(f.points, p.x, p.y)).map((f) => height(f, p.x, p.y));
    if (!target.length) throw Error('The changed native rail support disappeared.');
    return {
      from: oldZ - offset,
      to: Math.min(...target),
      amount: Math.min(...target) - (oldZ - offset),
    };
  };
  const result = { actors: [], items: [] };
  for (const p of candidates) {
    const change = delta(p, p.groundZ);
    if (!change || Math.abs(change.amount) <= EPS) continue;
    const before = p.z;
    p.z += change.amount;
    p.groundZ += change.amount;
    if (p.traversal?.groundZ !== undefined && Math.abs(p.traversal.groundZ - change.from) <= EPS)
      p.traversal.groundZ += change.amount;
    result.actors.push({ id: p.id ?? 'player', fromZ: before, toZ: p.z, ...change });
  }
  for (const p of groundedItems) {
    let change = delta(p, p.z);
    if (!change) change = delta(p, p.z, 0.4);
    if (!change || Math.abs(change.amount) <= EPS) continue;
    const before = p.z;
    p.z += change.amount;
    if (p.groundZ !== undefined && Math.abs(p.groundZ - change.from) <= EPS)
      p.groundZ += change.amount;
    result.items.push({ id: p.id, fromZ: before, toZ: p.z, ...change });
  }
  return result;
}
