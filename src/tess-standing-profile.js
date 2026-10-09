/** Real six-percent raised running section beside the unchanged Tess site. */
export const TESS_RAIL_PROFILE = Object.freeze({
  trackId: 'HC-TRACK-16@LL-CITY-SERVICE-02',
  fromZ: 18,
  toZ: 38,
  maxGrade: 0.06,
  start: 0,
  riseEnd: 20 / 0.06,
  fallStart: 1200,
  end: 1200 + 20 / 0.06,
  bounds: Object.freeze({ left: 464, top: 154, right: 796, bottom: 1460 }),
  clampAll: true,
  requiredBodyHeight: 30,
});
export function upgradeTessTrack(track) {
  const P = TESS_RAIL_PROFILE,
    points = [],
    controls = [P.start, P.riseEnd, P.fallStart, P.end];
  let done = 0;
  for (let i = 1; i < track.points.length; i++) {
    const a = track.points[i - 1],
      b = track.points[i],
      length = Math.hypot(b.x - a.x, b.y - a.y),
      ts = [0, 1];
    for (const d of controls) {
      const t = (d - done) / length;
      if (t > 0 && t < 1) ts.push(t);
    }
    ts.sort((a, b) => a - b);
    for (const t of ts) {
      if (points.length && t === 0) continue;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t },
        d = done + length * t;
      if (d >= P.start - 1e-7 && d <= P.end + 1e-7) {
        if (Math.abs(p.z - 18) > 1e-7) throw Error('Tess known early rail baseline changed.');
        p.z += Math.max(0, Math.min(20, (d - P.start) * P.maxGrade, (P.end - d) * P.maxGrade));
      }
      points.push(p);
    }
    done += length;
  }
  return points;
}
