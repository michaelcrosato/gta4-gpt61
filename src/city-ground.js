/** Visible-tile rasterization for Harbor City's authored land, streets and public spaces. */
import { createSpatialIndex } from './spatial-index.js';
const E = globalThis.My3D2dge;
const EPSILON = 1e-8;
const hash = (text) => {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
};
const rectPoints = (r, z = 0) => [
  [r.x, r.y, z],
  [r.x + r.w, r.y, z],
  [r.x + r.w, r.y + r.h, z],
  [r.x, r.y + r.h, z],
];

function clipRect(points, rect) {
  let output = points.map((p) => [...p]);
  for (const [axis, bound, sign] of [
    [0, rect.x, 1],
    [0, rect.x + rect.w, -1],
    [1, rect.y, 1],
    [1, rect.y + rect.h, -1],
  ]) {
    const input = output;
    output = [];
    if (!input.length) break;
    for (let i = 0; i < input.length; i++) {
      const a = input[i],
        b = input[(i + 1) % input.length],
        insideA = (a[axis] - bound) * sign >= 0,
        insideB = (b[axis] - bound) * sign >= 0;
      if (insideA) output.push(a);
      if (insideA !== insideB) {
        const t = (bound - a[axis]) / (b[axis] - a[axis]);
        output.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0]);
      }
    }
  }
  return output;
}
function roadPolygon(road, width = road.width || 80, start = 0, end = 1) {
  const dx = road.x2 - road.x1,
    dy = road.y2 - road.y1,
    length = Math.hypot(dx, dy) || 1,
    nx = ((-dy / length) * width) / 2,
    ny = ((dx / length) * width) / 2;
  const a = [road.x1 + dx * start, road.y1 + dy * start],
    b = [road.x1 + dx * end, road.y1 + dy * end];
  const z0 = road.z1 ?? road.z ?? 0,
    z1 = road.z2 ?? road.z ?? 0,
    az = z0 + (z1 - z0) * start,
    bz = z0 + (z1 - z0) * end;
  return [
    [a[0] - nx, a[1] - ny, az],
    [b[0] - nx, b[1] - ny, bz],
    [b[0] + nx, b[1] + ny, bz],
    [a[0] + nx, a[1] + ny, az],
  ];
}
function primitive(points, color, alpha = 1) {
  return { points, color, alpha };
}

/** No roads or sites are created here; this draws the authored geometry supplied by the world. */
export function buildGroundPrimitives(world) {
  const primitives = [
    primitive(rectPoints({ x: 0, y: 0, w: world.width, h: world.height }), '#203e42'),
  ];
  const landforms = world.landforms || [];
  if (landforms.length) {
    for (const form of landforms)
      primitives.push(
        primitive(
          form.polygon.map((p) => [p[0], p[1], 0]),
          '#536650',
        ),
      );
    const palettes = {
      finance: '#53655d',
      industrial: '#665f50',
      warehouse: '#686855',
      housing: '#616b51',
      historic: '#6e6b51',
      market: '#6d7056',
      park: '#48634c',
      university: '#687457',
      airport: '#657366',
      island: '#69755b',
      hillside: '#63704e',
      waterfront: '#626b54',
    };
    for (const area of world.neighbourhoods || []) {
      const bounds = area.bounds || area;
      if (![bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isFinite)) continue;
      for (const form of landforms) {
        const clipped = clipRect(
          form.polygon.map((p) => [...p, 0]),
          bounds,
        );
        if (clipped.length >= 3)
          primitives.push(primitive(clipped, palettes[area.profile] || '#5d6c54'));
      }
    }
    for (const lake of world.lakes || []) primitives.push(primitive(rectPoints(lake), '#2b4c49'));
  } else {
    primitives.push(
      primitive(rectPoints({ x: 0, y: 0, w: world.width, h: world.height }), '#556153'),
    );
    for (const district of world.districts || [])
      primitives.push(
        primitive(rectPoints(district), E.mix(district.color || '#536256', '#3b5548', 0.7)),
      );
    for (const water of world.water || []) primitives.push(primitive(rectPoints(water), '#203e42'));
  }
  for (const road of world.roads || []) {
    if (
      (road.z1 ?? road.z ?? 0) > EPSILON ||
      (road.z2 ?? road.z ?? 0) > EPSILON ||
      road.kind === 'closed-crossing'
    )
      continue;
    // Bore roads are represented inside the tunnel scene, not painted through the city floor.
    if ((road.z1 ?? road.z ?? 0) < -EPSILON || (road.z2 ?? road.z ?? 0) < -EPSILON) continue;
    const width = road.width || 80,
      length = Math.hypot(road.x2 - road.x1, road.y2 - road.y1);
    if (!length) continue;
    primitives.push(primitive(roadPolygon(road, width + 14), '#798070'));
    primitives.push(
      primitive(
        roadPolygon(road, width),
        road.access?.includes('car') === false ? '#5c7058' : '#354542',
      ),
    );
    if (road.access?.includes('car') === false) continue;
    for (let q = 5; q < length; q += 34)
      primitives.push(
        primitive(roadPolygon(road, 2, q / length, Math.min(1, (q + 12) / length)), '#a19f76'),
      );
    // Curb paint remains physically aligned on reversed and diagonal roads.
    const dx = (road.x2 - road.x1) / length,
      dy = (road.y2 - road.y1) / length;
    for (let q = 16; q < length; q += 72)
      for (const side of [-1, 1]) {
        const offset = width / 2 - 5,
          x = road.x1 + dx * q - dy * offset * side,
          y = road.y1 + dy * q + dx * offset * side;
        const marker = { x1: x, y1: y, x2: x + dx * 10, y2: y + dy * 10, width: 1 };
        primitives.push(primitive(roadPolygon(marker, 1), '#a8ad92'));
      }
  }
  // Authored airport reservations are visible even before a drivable flight model exists.
  for (const runway of world.airport?.runways || []) {
    primitives.push(primitive(rectPoints(runway), '#37433c'));
    const vertical = runway.h > runway.w;
    for (let distance = 20; distance < (vertical ? runway.h : runway.w) - 10; distance += 70) {
      const r = vertical
        ? { x: runway.x + runway.w / 2 - 3, y: runway.y + distance, w: 6, h: 30 }
        : { x: runway.x + distance, y: runway.y + runway.h / 2 - 3, w: 30, h: 6 };
      primitives.push(primitive(rectPoints(r), '#c5c6ad'));
    }
  }
  for (const site of world.sites || []) {
    const lot = site.geometry?.forecourt || site.lot;
    if (lot && [lot.x, lot.y, lot.w, lot.h].every(Number.isFinite))
      primitives.push(
        primitive(rectPoints(lot), site.kind?.includes('park') ? '#4f7252' : '#7a806a'),
      );
    const entrance = site.entrance;
    if (entrance && Number.isFinite(entrance.x) && Number.isFinite(entrance.y))
      primitives.push(
        primitive(rectPoints({ x: entrance.x - 7, y: entrance.y - 7, w: 14, h: 14 }), '#9eaa80'),
      );
  }
  return primitives;
}

export function createCityGroundRenderer(world, { tileSize = 384, maxTiles = 48 } = {}) {
  if (
    !Number.isInteger(tileSize) ||
    tileSize < 16 ||
    tileSize > 1024 ||
    !Number.isInteger(maxTiles) ||
    maxTiles < 1
  )
    throw new Error('Invalid city ground cache bounds.');
  const primitives = buildGroundPrimitives(world),
    elevated = (world.roads || []).filter(
      (road) => Math.max(road.z1 ?? road.z ?? 0, road.z2 ?? road.z ?? 0) > 0,
    );
  const tiles = new Map(),
    projections = new Map(),
    stats = { generatedTiles: 0, cachedTiles: 0, drawnTiles: 0, primitiveCount: primitives.length };
  function release(tile) {
    tile.cv.width = 0;
    tile.cv.height = 0;
  }
  const keyFor = (view) => [view.ax, view.ay, view.bx, view.by, view.bz, E.style.trans].join(':');
  function projection(view) {
    const key = keyFor(view);
    if (projections.has(key)) {
      const value = projections.get(key);
      projections.delete(key);
      projections.set(key, value);
      return { key, index: value };
    }
    if (projections.size >= 2) {
      const retired = projections.keys().next().value;
      projections.delete(retired);
      for (const [id, tile] of tiles)
        if (tile.projection === retired) {
          release(tile);
          tiles.delete(id);
        }
    }
    const index = createSpatialIndex(primitives, {
      cellSize: tileSize,
      getBounds: (item) => {
        const p = item.points.map((point) => view.p(...point));
        const x = Math.floor(Math.min(...p.map((v) => v[0]))) - 2,
          y = Math.floor(Math.min(...p.map((v) => v[1]))) - 2;
        return {
          x,
          y,
          w: Math.ceil(Math.max(...p.map((v) => v[0]))) + 3 - x,
          h: Math.ceil(Math.max(...p.map((v) => v[1]))) + 3 - y,
        };
      },
    });
    projections.set(key, index);
    return { key, index };
  }
  function drawPrimitives(g, view, items, x0, y0) {
    for (const item of items) {
      const points = item.points.map((point) => {
        const p = view.p(...point);
        return [p[0] - x0, p[1] - y0];
      });
      E.px.polyDither(g, points, item.color, item.alpha, x0, y0);
    }
  }
  function tile(view, projected, x, y) {
    const key = `${projected.key}:${x}:${y}`;
    if (tiles.has(key)) {
      const value = tiles.get(key);
      tiles.delete(key);
      tiles.set(key, value);
      return value;
    }
    while (tiles.size >= maxTiles) {
      const first = tiles.keys().next().value;
      release(tiles.get(first));
      tiles.delete(first);
    }
    const cv = E.mkCanvas(tileSize, tileSize),
      g = E.ctx2d(cv),
      x0 = x * tileSize,
      y0 = y * tileSize;
    drawPrimitives(
      g,
      view,
      projected.index.queryRect({ x: x0, y: y0, w: tileSize, h: tileSize }),
      x0,
      y0,
    );
    const value = { cv, projection: projected.key };
    tiles.set(key, value);
    stats.generatedTiles++;
    stats.cachedTiles = tiles.size;
    return value;
  }
  function draw(r) {
    r.sky(['#263f40', '#243b38']);
    const projected = projection(r.view),
      g = r.ctx;
    let transform;
    try {
      transform = g.getTransform?.();
    } catch {
      /* unfamiliar contexts use live pixels */
    }
    const compatible =
      transform &&
      transform.a === 1 &&
      transform.b === 0 &&
      transform.c === 0 &&
      transform.d === 1 &&
      transform.e === 0 &&
      transform.f === 0 &&
      g.globalAlpha === 1 &&
      g.globalCompositeOperation === 'source-over' &&
      !g._info &&
      !g._cover &&
      !g.shadowBlur &&
      !g.shadowOffsetX &&
      !g.shadowOffsetY &&
      (!g.filter || g.filter === 'none') &&
      Number.isInteger(r.ix) &&
      Number.isInteger(r.iy);
    if (!compatible) {
      drawPrimitives(
        g,
        r.view,
        projected.index.queryRect({ x: r.ix, y: r.iy, w: r.bw, h: r.bh }),
        r.ix,
        r.iy,
      );
      return;
    }
    stats.drawnTiles = 0;
    for (let y = Math.floor(r.iy / tileSize); y <= Math.floor((r.iy + r.bh - 1) / tileSize); y++)
      for (
        let x = Math.floor(r.ix / tileSize);
        x <= Math.floor((r.ix + r.bw - 1) / tileSize);
        x++
      ) {
        const cached = tile(r.view, projected, x, y),
          left = Math.max(r.ix, x * tileSize),
          top = Math.max(r.iy, y * tileSize),
          right = Math.min(r.ix + r.bw, (x + 1) * tileSize),
          bottom = Math.min(r.iy + r.bh, (y + 1) * tileSize);
        g.drawImage(
          cached.cv,
          left - x * tileSize,
          top - y * tileSize,
          right - left,
          bottom - top,
          left - r.ix,
          top - r.iy,
          right - left,
          bottom - top,
        );
        stats.drawnTiles++;
      }
  }
  function visiblePolygon(r, points) {
    const p = points.map((point) => r.w(...point));
    return (
      Math.max(...p.map((v) => v[0])) >= 0 &&
      Math.min(...p.map((v) => v[0])) <= r.bw &&
      Math.max(...p.map((v) => v[1])) >= 0 &&
      Math.min(...p.map((v) => v[1])) <= r.bh
    );
  }
  function drawRoadSurface(r, road, start, end, underground = false) {
    const points = roadPolygon(road, (road.width || 80) + 14, start, end);
    if (!visiblePolygon(r, points)) return;
    E.px.poly(
      r.ctx,
      points.map((point) => r.w(...point)),
      underground ? '#677362' : '#818674',
    );
    E.px.poly(
      r.ctx,
      roadPolygon(road, road.width || 80, start, end).map((point) => r.w(...point)),
      '#3b4c43',
    );
    const center = roadPolygon(road, 2, start, end);
    E.px.poly(
      r.ctx,
      center.map((point) => r.w(...point)),
      '#aba779',
    );
    for (const [a, b] of [
      [points[0], points[1]],
      [points[3], points[2]],
    ]) {
      const height = underground ? 18 : 5;
      const side = [a, b, [b[0], b[1], b[2] + height], [a[0], a[1], a[2] + height]];
      r.queue(
        (a[0] + b[0]) / 2,
        (a[1] + b[1]) / 2,
        (a[2] + b[2]) / 2,
        (g) => {
          E.px.poly(
            g,
            side.map((point) => r.w(...point)),
            underground ? '#52645b' : '#768579',
          );
          const topA = r.w(a[0], a[1], a[2] + height),
            topB = r.w(b[0], b[1], b[2] + height);
          E.px.line(g, ...topA, ...topB, underground ? '#b5b586' : '#a2ac91');
          if (underground) {
            const lamp = r.w((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2 + 12);
            E.px.rect(g, lamp[0] - 3, lamp[1] - 1, 6, 2, '#d4c991');
          }
        },
        { occluder: true },
      );
    }
  }
  function roadPieces(r, roads, underground = false) {
    for (const road of roads) {
      const whole = roadPolygon(road, (road.width || 80) + 14);
      if (!visiblePolygon(r, whole)) continue;
      const count = Math.max(1, Math.ceil(Math.hypot(road.x2 - road.x1, road.y2 - road.y1) / 80));
      for (let i = 0; i < count; i++)
        drawRoadSurface(r, road, i / count, (i + 1) / count, underground);
    }
  }
  function drawElevated(r) {
    // Floors paint before bodies standing on them; only the narrow side barriers
    // enter the painter's queue, avoiding center-sorted decks covering their own cars.
    roadPieces(r, elevated);
  }
  function drawUnderground(r) {
    r.sky(['#172b28', '#1d302b']);
    roadPieces(
      r,
      (world.roads || []).filter(
        (road) => road.tunnel || Math.min(road.z1 ?? road.z ?? 0, road.z2 ?? road.z ?? 0) < 0,
      ),
      true,
    );
  }
  return {
    draw,
    drawElevated,
    drawUnderground,
    stats,
    dispose() {
      for (const value of tiles.values()) release(value);
      tiles.clear();
      projections.clear();
      stats.cachedTiles = 0;
    },
    drawLive(r) {
      r.sky(['#263f40', '#243b38']);
      const projected = projection(r.view);
      drawPrimitives(
        r.ctx,
        r.view,
        projected.index.queryRect({ x: r.ix, y: r.iy, w: r.bw, h: r.bh }),
        r.ix,
        r.iy,
      );
    },
  };
}
