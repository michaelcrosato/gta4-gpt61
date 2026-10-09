/** Replace unnecessary grade-extension undercuts with real baseline-height deck endcaps.
 * The unchanged flat-bottom train body always has z>=18 in this known corridor;
 * raising only floor portions below17.5 cannot be mistaken for relaxed clearance.
 */
const EPS = 1e-9;
const at = (a, b, p) => {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    L = dx * dx + dy * dy;
  return a.z + (L ? (((p.x - a.x) * dx + (p.y - a.y) * dy) * (b.z - a.z)) / L : 0);
};
function clip(polygon, height, positive) {
  const out = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      u = height(a),
      v = height(b),
      A = positive ? u >= 0 : u <= 0,
      B = positive ? v >= 0 : v <= 0;
    if (A) out.push(a);
    if (A !== B) {
      const t = u / (u - v);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  const area =
    out.reduce((n, a, i) => {
      const b = out[(i + 1) % out.length];
      return n + a.x * b.y - a.y * b.x;
    }, 0) / 2;
  return out.length >= 3 && Math.abs(area) > EPS ? out : [];
}
function piece(source, polygon, suffix, flat) {
  const floorStart = flat ? { ...source.floorStart, z: 17.5 } : source.floorStart,
    floorEnd = flat ? { ...source.floorEnd, z: 17.5 } : source.floorEnd,
    xs = polygon.map((p) => p.x),
    ys = polygon.map((p) => p.y),
    floors = polygon.map((p) => at(floorStart, floorEnd, p));
  return {
    ...source,
    id: source.id + suffix,
    polygon,
    bounds: {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    },
    floorStart,
    floorEnd,
    zMin: Math.min(...floors),
    referenceFloorMin: Math.min(...floors),
    floorAmendment: 'dispatch-baseline-endcap-1',
  };
}
export function amendDispatchDeckFloors(world, profile) {
  const changes = [],
    volumes = world.transit.railClearanceVolumes.flatMap((v) => {
      if (
        v.kind !== 'viaduct' ||
        !v.trackIds?.includes(profile.trackId) ||
        !v.floorStart ||
        !v.floorEnd ||
        (!profile.clampAll && v.bounds.x > profile.x + 40) ||
        (!profile.clampAll && v.bounds.x + v.bounds.w < profile.x - 40) ||
        (!profile.clampAll && v.bounds.y > 1244) ||
        (!profile.clampAll && v.bounds.y + v.bounds.h < 273)
      )
        return [v];
      const h = (p) => at(v.floorStart, v.floorEnd, p) - 17.5,
        values = v.polygon.map(h);
      if (Math.min(...values) >= -EPS) return [v];
      // Original descending approach outside the known flat18 spine is preserved.
      if (
        !profile.clampAll &&
        [v.floorStart, v.floorEnd].some(
          (p) => Math.abs(p.x - profile.x) > 1e-6 || p.y < 273 - 40 || p.y > 1244 + 40,
        )
      )
        return [v];
      const grade = clip(v.polygon, h, true),
        cap = clip(v.polygon, h, false),
        pieces = [];
      if (grade.length) pieces.push(piece(v, grade, ':standing-grade', false));
      if (cap.length) pieces.push(piece(v, cap, ':standing-endcap', true));
      changes.push({
        sourceId: v.id,
        fromFloorMin: Math.min(...values) + 17.5,
        toFloorMin: 17.5,
        pieces: pieces.map((p) => p.id),
      });
      return pieces;
    });
  return {
    world: { ...world, transit: { ...world.transit, railClearanceVolumes: volumes } },
    report: {
      id: 'dispatch-baseline-endcap-1',
      changedVolumes: changes.length,
      changes,
      boundary:
        'Actual floor polygons/planes raised to known baseline17.5 only; tracks, roofs and full train dimensions unchanged. Static predicate must certify all actual service sweeps.',
    },
  };
}
