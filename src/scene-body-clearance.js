/** Calibrated physical body queries shared by authored route planning and movement.
 * These queries do not move/repair actors. Negative standing clearance is an
 * explicit rejection until the corresponding public-world chambers are rebuilt.
 */
import { createBodyClearance } from './body-clearance.js';
import { INTERIOR_LAYOUTS, interiorCollisionVolumes } from './interiors.js';
const EPS = 1e-9;
const point = (p, options = {}) => {
  const b = {
    x: p?.x,
    y: p?.y,
    z: p?.z ?? 0,
    radius: options.radius ?? p?.radius ?? 7,
    height: options.height ?? p?.height ?? 30,
  };
  if (
    !Object.values(b).every(Number.isFinite) ||
    b.radius < 0 ||
    b.radius > 1000 ||
    b.height <= 0 ||
    b.height > 1000
  )
    throw TypeError('Invalid scene body envelope.');
  return b;
};
const localState = (state, id) =>
  state.interior?.active?.roomId === id
    ? state
    : { ...state, interior: { ...state.interior, active: { roomId: id } } };
const circleRect = (b, s) => {
  const x = Math.max(s.x, Math.min(s.x + s.w, b.x)),
    y = Math.max(s.y, Math.min(s.y + s.h, b.y));
  return b.radius
    ? Math.hypot(b.x - x, b.y - y) < b.radius
    : b.x > s.x && b.x < s.x + s.w && b.y > s.y && b.y < s.y + s.h;
};
export function createSceneBodyClearance(world) {
  const exterior = createBodyClearance(world);
  const resolve = (state, options) =>
    Object.hasOwn(options, 'sceneId') ? options.sceneId : (state?.interior?.active?.roomId ?? null);
  function roomVolumes(state, id) {
    if (!INTERIOR_LAYOUTS[id]) throw TypeError('Unknown full-body room scene.');
    return interiorCollisionVolumes(localState(state, id));
  }
  function inspect(state, input, options = {}) {
    const b = point(input, options),
      id = resolve(state, options);
    if (id === null) return exterior.inspect(b, options);
    const room = INTERIOR_LAYOUTS[id],
      solids = roomVolumes(state, id),
      issues = [];
    if (b.z < room.floorZ - EPS || b.z + b.height > (room.ceilingZ ?? 72) + EPS)
      issues.push({ kind: 'room-floor-or-ceiling', sceneId: id });
    for (const solid of solids)
      if (
        b.z < (solid.z ?? 0) + solid.height &&
        b.z + b.height > (solid.z ?? 0) &&
        circleRect(b, solid)
      )
        issues.push({ kind: 'room-body-volume', id: solid.id, sceneId: id });
    return { clear: !issues.length, issues };
  }
  function sweep(state, from, to, options = {}) {
    const A = point(from, options),
      B = point(to, options),
      id = resolve(state, options);
    if (id === null) return exterior.sweep(A, B, options);
    roomVolumes(state, id);
    const distance = Math.hypot(B.x - A.x, B.y - A.y),
      steps = Math.max(1, Math.ceil(distance / 2));
    if (steps > 50000) throw RangeError('Scene body sweep exceeds query budget.');
    for (let i = 0; i < steps; i++) {
      const lo = i / steps,
        hi = (i + 1) / steps,
        t = (lo + hi) / 2,
        z0 = A.z + (B.z - A.z) * lo,
        z1 = A.z + (B.z - A.z) * hi,
        sample = {
          x: A.x + (B.x - A.x) * t,
          y: A.y + (B.y - A.y) * t,
          z: Math.min(z0, z1),
          radius: Math.max(A.radius, B.radius) + distance / steps / 2,
          height: Math.max(A.height, B.height) + Math.abs(z1 - z0),
        },
        result = inspect(state, sample, { sceneId: id });
      if (!result.clear) return { ...result, segment: i, sample };
    }
    return { clear: true, issues: [] };
  }
  function limitRise(state, input, targetZ, options = {}) {
    const b = point(input, options),
      id = resolve(state, options);
    if (id === null) return exterior.limitRise(b, targetZ);
    if (!Number.isFinite(targetZ) || targetZ < b.z)
      throw TypeError('Expected upward finite body target.');
    const room = INTERIOR_LAYOUTS[id],
      ceilings = [room?.ceilingZ ?? 72];
    for (const solid of roomVolumes(state, id))
      if ((solid.z ?? 0) > b.z && circleRect(b, solid)) ceilings.push(solid.z);
    const ceiling = Math.min(...ceilings),
      z = Math.max(b.z, Math.min(targetZ, ceiling - b.height));
    return { z, hit: z < targetZ, ceiling };
  }
  function canMoveBody(request) {
    const { state, body, from, to, radius, allowWater, sceneId = null } = request;
    const height = body.spec ? 16 : body.inVehicle ? 8 : Math.max(30, body.collisionHeight ?? 30);
    return sweep(state, from, to, { sceneId, radius, height, ignoreWater: allowWater }).clear;
  }
  return {
    inspect,
    sweep,
    limitRise,
    canMoveBody,
    exterior,
    boundary:
      'Actual native standing30 body, current interior solids/ceilings and native exterior rail floors/piers. Negative chambers are rejected; caller must keep any temporary legacy compatibility scope explicit.',
  };
}
