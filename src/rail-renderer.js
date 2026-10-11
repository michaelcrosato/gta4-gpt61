/** Native Metro construction, shared rails, platforms and rolling stock. */
import { createSpatialIndex } from './spatial-index.js';
import { railPassenger } from './rail-runtime.js';

import { compileRailConstruction, EPS, palette, round, overlaps, at } from './rail-construction.js';

const E = globalThis.My3D2dge;
function projectBounds(points, view, pad = 1) {
  const p = points.map((v) => view.p(v.x, v.y, v.z)),
    xs = p.map((v) => v[0]),
    ys = p.map((v) => v[1]);
  return {
    x: Math.min(...xs) - pad,
    y: Math.min(...ys) - pad,
    w: Math.max(...xs) - Math.min(...xs) + pad * 2,
    h: Math.max(...ys) - Math.min(...ys) + pad * 2,
  };
}
function screenPoints(r, points) {
  return points.map((p) => r.w(p.x, p.y, p.z));
}
const viewKey = (view) => [view.ax, view.ay, view.bx, view.by, view.bz].join(':');
function drawPoly(r, g, points, color) {
  E.px.poly(g, screenPoints(r, points), color);
}
function stroke(r, g, points, color, width = 1) {
  const [a, b] = screenPoints(r, points),
    dx = b[0] - a[0],
    dy = b[1] - a[1];
  let lo = 0,
    hi = 1;
  for (const [start, delta, min, max] of [
    [a[0], dx, -width, r.bw + width],
    [a[1], dy, -width, r.bh + width],
  ]) {
    if (Math.abs(delta) < EPS) {
      if (start < min || start > max) return;
    } else {
      const p = (min - start) / delta,
        q = (max - start) / delta;
      lo = Math.max(lo, Math.min(p, q));
      hi = Math.min(hi, Math.max(p, q));
    }
    if (hi < lo) return;
  }
  E.px.line(g, a[0] + dx * lo, a[1] + dy * lo, a[0] + dx * hi, a[1] + dy * hi, color, width);
}
function queuePoly(r, item, points, color, options = {}) {
  if (points.length < 3) return;
  const center = points.reduce(
    (p, a) => ({
      x: p.x + a.x / points.length,
      y: p.y + a.y / points.length,
      z: p.z + a.z / points.length,
    }),
    { x: 0, y: 0, z: 0 },
  );
  r.queue(center.x, center.y, center.z, (g) => drawPoly(r, g, points, color), options);
}
function clippedWall(item, view, structures) {
  let polygon = item.points;
  const near = item.normal ? item.normal.x * view.fx + item.normal.y * view.fy > 0.03 : false;
  if (item.category === 'wall' && (near || item.kind === 'cutting')) {
    const componentFloor = (p) => {
      const start = at(item.floor, p.x, p.y),
        roof = at(item.roof, p.x, p.y),
        key = `${round(p.x)},${round(p.y)},${round(start)},${round(roof)}`;
      if (structures.cutFloors.has(key)) return structures.cutFloors.get(key);
      const candidates = structures.index.queryRadius(p.x, p.y, 0.001).filter((v) =>
        v.polygon.every((a, i) => {
          const b = v.polygon[(i + 1) % v.polygon.length];
          return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= -EPS;
        }),
      );
      let lo = start,
        hi = roof,
        changed = true;
      while (changed) {
        changed = false;
        for (const v of candidates) {
          const f = at(v.floor, p.x, p.y),
            r = at(v.roof, p.x, p.y);
          if (f <= hi + EPS && r >= lo - EPS && (f < lo - EPS || r > hi + EPS)) {
            lo = Math.min(lo, f);
            hi = Math.max(hi, r);
            changed = true;
          }
        }
      }
      structures.cutFloors.set(key, lo);
      return lo;
    };
    const limit = (p) => {
      const base = componentFloor(p),
        top = item.kind === 'cutting' ? Math.max(0, at(item.floor, p.x, p.y) + 2) : Infinity;
      return near ? Math.min(top, base + 3) : top;
    };
    const out = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length],
        limitA = limit(a),
        limitB = limit(b),
        A = a.z <= limitA + EPS,
        B = b.z <= limitB + EPS;
      if (A) out.push(a);
      if (A !== B) {
        const t = (limitA - a.z) / (b.z - a.z - (limitB - limitA));
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
      }
    }
    polygon = out;
  }
  // Authored boarding faces open the platform-facing wall, including its end.
  if (item.category === 'wall' && polygon.length) {
    const mid = polygon.reduce(
      (p, q) => ({ x: p.x + q.x / polygon.length, y: p.y + q.y / polygon.length }),
      { x: 0, y: 0 },
    );
    if (
      structures.platforms.some(
        (p) =>
          Math.abs(p.z - at(item.floor, mid.x, mid.y)) < 6 &&
          mid.x >= p.bounds.x - 12 &&
          mid.x <= p.bounds.x + p.bounds.w + 12 &&
          mid.y >= p.bounds.y - 12 &&
          mid.y <= p.bounds.y + p.bounds.h + 12 &&
          (p.x - mid.x) * item.normal.x + (p.y - mid.y) * item.normal.y > 0,
      )
    )
      return [];
  }
  return polygon;
}

export function createRailRenderer(game, world, { cacheProjection = true } = {}) {
  const stats = {
    rawVolumes: 0,
    uniqueVolumes: 0,
    duplicateVolumes: 0,
    floorPieces: 0,
    outerWallPieces: 0,
    outerEdges: 0,
    rawRailSegments: 0,
    canonicalRailSegments: 0,
    duplicateRailSegments: 0,
    sleepers: 0,
    queriedRails: 0,
    visibleFloors: 0,
    visibleWalls: 0,
    drawnTrains: 0,
    drawnPlatforms: 0,
    drawnGates: 0,
    drawnGatePoints: 0,
    projectionIndexes: 0,
  };
  const model = compileRailConstruction(world),
    { structures, rails, supports } = model,
    views = new Map();
  Object.assign(stats, model.metrics);
  const staticItems = [
    ...structures.floors,
    ...structures.walls,
    ...structures.rims,
    ...supports,
    ...rails.lines,
  ];
  function visible(r) {
    if (!cacheProjection)
      return staticItems.filter((item) =>
        overlaps(projectBounds(item.points, r.view, item.width ?? 1), {
          x: r.ix,
          y: r.iy,
          w: r.bw,
          h: r.bh,
        }),
      );
    const key = viewKey(r.view);
    let cached = views.get(key);
    if (!cached) {
      const projected = staticItems.map((item) => ({
        item,
        bounds: projectBounds(item.points, r.view, item.width ?? 1),
      }));
      cached = { index: createSpatialIndex(projected, { getBounds: (p) => p.bounds }) };
      if (views.size >= 2) views.delete(views.keys().next().value);
      views.set(key, cached);
    } else {
      views.delete(key);
      views.set(key, cached);
    }
    stats.projectionIndexes = views.size;
    return cached.index.queryRect({ x: r.ix, y: r.iy, w: r.bw, h: r.bh }).map((p) => p.item);
  }
  function modeVisible(item, underground) {
    if (item.kind === 'cutting') return true;
    const below = Math.max(...item.points.map((p) => p.z)) < -1;
    return below === underground;
  }
  function drawTrain(r, train, config) {
    const total = config.cars * config.carLength + (config.cars - 1) * config.couplerGap,
      c = Math.cos(train.heading),
      s = Math.sin(train.heading),
      half = config.trainWidth / 2;
    const p = (x, y, z) => ({
      x: train.x + x * c - y * s,
      y: train.y + x * s + y * c,
      z: train.z + z,
    });
    const box = projectBounds(
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].flatMap(([a, b]) => [
        p((a * total) / 2, b * half, 0),
        p((a * total) / 2, b * half, config.trainHeight),
      ]),
      r.view,
      2,
    );
    if (!overlaps(box, { x: r.ix, y: r.iy, w: r.bw, h: r.bh })) return;
    stats.drawnTrains++;
    r.shadow?.(train.x, train.y, total / 2, 0.22, '#1d302b', train.z);
    r.queue(
      train.x,
      train.y,
      train.z,
      (g) => {
        for (let car = 0; car < config.cars - 1; car++) {
          const x = -total / 2 + (car + 1) * config.carLength + car * config.couplerGap;
          drawPoly(
            r,
            g,
            [
              p(x, -2, 4),
              p(x + config.couplerGap, -2, 4),
              p(x + config.couplerGap, 2, 4),
              p(x, 2, 4),
            ],
            '#263d38',
          );
        }
        for (let car = 0; car < config.cars; car++) {
          const center =
              -total / 2 + config.carLength / 2 + car * (config.carLength + config.couplerGap),
            a = center - config.carLength / 2,
            b = center + config.carLength / 2,
            h = config.trainHeight;
          const faces = [];
          for (const side of [-1, 1])
            faces.push({
              points: [
                p(a, side * half, 1),
                p(b, side * half, 1),
                p(b, side * half, h),
                p(a, side * half, h),
              ],
              side,
            });
          for (const x of [a, b])
            faces.push({
              points: [p(x, -half, 1), p(x, half, 1), p(x, half, h), p(x, -half, h)],
              end: x,
            });
          faces.push({
            points: [p(a, -half, h), p(b, -half, h), p(b, half, h), p(a, half, h)],
            roof: true,
          });
          faces.sort(
            (A, B) =>
              A.points.reduce((n, q) => n + r.view.depth(q.x, q.y, q.z), 0) -
              B.points.reduce((n, q) => n + r.view.depth(q.x, q.y, q.z), 0),
          );
          for (const face of faces) {
            drawPoly(
              r,
              g,
              face.points,
              face.roof
                ? '#a7b6a9'
                : face.side === 1
                  ? '#748e86'
                  : face.side === -1
                    ? '#4c6861'
                    : '#58786e',
            );
            if (face.side) {
              const side = face.side;
              stroke(r, g, [p(a, side * half, 5), p(b, side * half, 5)], '#d3c17e', 2);
              for (const x of [a + 4, b - 8])
                drawPoly(
                  r,
                  g,
                  [
                    p(x, side * half, 8),
                    p(x + 4, side * half, 8),
                    p(x + 4, side * half, 13),
                    p(x, side * half, 13),
                  ],
                  '#213d3b',
                );
              const opening = Math.max(0, Math.min(1, train.doorProgress ?? 0)) * 3;
              drawPoly(
                r,
                g,
                [
                  p(center - 3, side * half, 2),
                  p(center + 3, side * half, 2),
                  p(center + 3, side * half, 13),
                  p(center - 3, side * half, 13),
                ],
                '#172c2b',
              );
              for (const [lo, hi] of [
                [center - 3, center - opening],
                [center + opening, center + 3],
              ])
                if (hi > lo + EPS)
                  drawPoly(
                    r,
                    g,
                    [
                      p(lo, side * half, 2),
                      p(hi, side * half, 2),
                      p(hi, side * half, 13),
                      p(lo, side * half, 13),
                    ],
                    '#a8b6a0',
                  );
              for (const axle of [a + 5, b - 5])
                drawPoly(
                  r,
                  g,
                  [
                    p(axle - 2, side * (half - 0.1), 0.5),
                    p(axle + 2, side * (half - 0.1), 0.5),
                    p(axle + 2, side * (half - 0.1), 3),
                    p(axle - 2, side * (half - 0.1), 3),
                  ],
                  '#18302c',
                );
            } else if (face.roof) stroke(r, g, [p(a + 3, 0, h), p(b - 3, 0, h)], '#778f82', 2);
          }
        }
        for (const side of [-1, 1]) {
          const q = p(total / 2, side * 6, 9),
            [x, y] = r.w(q.x, q.y, q.z);
          E.px.rect(g, x - 1, y - 1, 3, 3, '#eddb9c');
        }
      },
      { solid: true },
    );
    game.lights?.add(train.x, train.y, train.z + 12, 42, 0.3, { color: '#c9d3a5' });
  }
  function drawSigns(r, underground) {
    for (const platform of structures.platforms) {
      if (platform.z < -1 !== underground) continue;
      const x = platform.x,
        y = platform.y,
        z = platform.z,
        points = [
          { x, y, z },
          { x, y, z: z + 25 },
        ];
      if (!overlaps(projectBounds(points, r.view, 12), { x: r.ix, y: r.iy, w: r.bw, h: r.bh }))
        continue;
      r.queue(x, y, z, (g) => {
        stroke(r, g, points, '#4a645a', 2);
        const [sx, sy] = r.w(x, y, z + 25);
        E.px.rect(g, sx - 8, sy - 7, 16, 10, '#426c5d');
        E.font.text(g, 'M', sx, sy - 5, '#e2dfba', { align: 'center', outline: false });
      });
    }
  }
  function drawGates(r, state, underground) {
    const closed = new Set(state.railSignals?.closedGates ?? []),
      seen = new Set(),
      visibleGates = new Set();
    for (const gate of world.transit?.railCrossings ?? [])
      for (const source of gate.points ?? []) {
        const key = `${gate.roadId}:${round(source.x)}:${round(source.y)}`;
        if (seen.has(key) || source.roadZ < -1 !== underground) continue;
        seen.add(key);
        const road = world.roads.find((p) => p.id === gate.roadId);
        if (!road) continue;
        const dx = road.x2 - road.x1,
          dy = road.y2 - road.y1,
          L = Math.hypot(dx, dy),
          nx = -dy / L,
          ny = dx / L;
        const height = (x, y) => {
          const t = ((x - road.x1) * dx + (y - road.y1) * dy) / (L * L);
          return (
            (road.z1 ?? road.z ?? source.roadZ) +
            ((road.z2 ?? road.z ?? source.roadZ) - (road.z1 ?? road.z ?? source.roadZ)) * t
          );
        };
        const A = { x: source.x - (nx * road.width) / 2, y: source.y - (ny * road.width) / 2 },
          B = { x: source.x + (nx * road.width) / 2, y: source.y + (ny * road.width) / 2 };
        A.z = height(A.x, A.y);
        B.z = height(B.x, B.y);
        if (
          !overlaps(
            projectBounds([A, B, { ...A, z: A.z + 14 }, { ...B, z: B.z + 14 }], r.view, 3),
            { x: r.ix, y: r.iy, w: r.bw, h: r.bh },
          )
        )
          continue;
        visibleGates.add(gate.id);
        stats.drawnGatePoints++;
        const active = closed.has(gate.id);
        r.queue(
          source.x,
          source.y,
          source.roadZ,
          (g) => {
            for (const p of [A, B]) {
              stroke(r, g, [p, { ...p, z: p.z + 14 }], palette.steel, 2);
              const [x, y] = r.w(p.x, p.y, p.z + 14);
              E.px.rect(g, x - 2, y - 2, 4, 4, active ? '#df8369' : '#9ab47b');
            }
            if (active) {
              stroke(
                r,
                g,
                [
                  { ...A, z: A.z + 8 },
                  { ...B, z: B.z + 8 },
                ],
                '#d7c078',
                3,
              );
              for (let t = 0.1; t < 1; t += 0.2) {
                const p = {
                    x: A.x + (B.x - A.x) * t,
                    y: A.y + (B.y - A.y) * t,
                    z: A.z + (B.z - A.z) * t + 8,
                  },
                  [x, y] = r.w(p.x, p.y, p.z);
                E.px.rect(g, x - 2, y - 1, 4, 3, '#344f45');
              }
            }
          },
          { solid: true },
        );
      }
    stats.drawnGates = visibleGates.size;
  }
  return {
    stats,
    draw(r, state) {
      if (state.interior?.active || !state.transit) return false;
      const underground = (state.player.z ?? 0) < -1,
        items = visible(r);
      stats.visibleFloors =
        stats.visibleWalls =
        stats.queriedRails =
        stats.drawnTrains =
        stats.drawnPlatforms =
        stats.drawnGates =
        stats.drawnGatePoints =
          0;
      const floors = items.filter(
        (item) =>
          (item.category === 'floor' || item.category === 'platform') &&
          modeVisible(item, underground),
      );
      floors.sort(
        (a, b) =>
          a.points.reduce((n, p) => n + r.view.depth(p.x, p.y, p.z), 0) / a.points.length -
          b.points.reduce((n, p) => n + r.view.depth(p.x, p.y, p.z), 0) / b.points.length,
      );
      for (const item of floors) {
        drawPoly(r, r.ctx, item.points, item.color);
        stats.visibleFloors++;
        if (item.category === 'platform') {
          stats.drawnPlatforms++;
          for (let i = 0; i < item.points.length; i++)
            stroke(
              r,
              r.ctx,
              [item.points[i], item.points[(i + 1) % item.points.length]],
              '#d5c58a',
              2,
            );
        }
      }
      for (const item of items) {
        if (!modeVisible(item, underground)) continue;
        if (item.category === 'rail' || item.category === 'sleeper') {
          stroke(r, r.ctx, item.points, item.color, item.width);
          stats.queriedRails++;
        } else if (item.category === 'brace') {
          const [a, b] = item.points;
          r.queue(
            (a.x + b.x) / 2,
            (a.y + b.y) / 2,
            (a.z + b.z) / 2,
            (g) => stroke(r, g, item.points, item.color, item.width),
            { solid: true },
          );
        } else if (['wall', 'fascia', 'roof-rim', 'support'].includes(item.category)) {
          if (
            item.category === 'roof-rim' &&
            item.normal.x * r.view.fx + item.normal.y * r.view.fy > 0.03
          )
            continue;
          const points = clippedWall(item, r.view, structures);
          if (points.length < 3) continue;
          stats.visibleWalls++;
          queuePoly(r, item, points, item.color, {
            occluder: item.category === 'wall',
            solid: true,
          });
        }
      }
      drawSigns(r, underground);
      for (const train of state.transit.trains ?? []) {
        const portal = structures.index
          .queryRadius(train.x, train.y, 0)
          .some((v) => v.kind === 'cutting');
        if (
          train.z < -1 === underground ||
          (portal && (underground ? train.z < 10 : train.z + state.transit.config.trainHeight > 0))
        )
          drawTrain(r, train, state.transit.config);
      }
      drawGates(r, state, underground);
      return true;
    },
    dispose() {
      views.clear();
      structures.cutFloors.clear();
      stats.projectionIndexes = 0;
    },
    renderPlayer(state) {
      return railPassenger(state)
        ? { ...state, player: { ...state.player, vehicleId: 'metro-passenger' } }
        : state;
    },
  };
}
