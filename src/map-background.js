import { createSpatialIndex } from './spatial-index.js';

const WATER = '#1b3d43';
const LAND = '#243b31';
const BLEED = 2;
const finite = (n) => typeof n === 'number' && Number.isFinite(n);

function invalid(reason) {
  throw new Error(`Invalid city map ${reason}.`);
}
function mix(a, b, amount) {
  if (!/^#[0-9a-f]{6}$/i.test(a ?? '')) return LAND;
  const color = [1, 3, 5].map((i) =>
    Math.round(
      parseInt(a.slice(i, i + 2), 16) * (1 - amount) + parseInt(b.slice(i, i + 2), 16) * amount,
    )
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${color.join('')}`;
}
function box(item) {
  const { x, y, w, h } = item.bounds ?? item;
  return { x, y, w, h };
}
function polygon(item) {
  const points = item.polygon.map((p) => ({
    x: Array.isArray(p) ? p[0] : p.x,
    y: Array.isArray(p) ? p[1] : p.y,
  }));
  if (points.length < 3 || points.some((p) => !finite(p.x) || !finite(p.y))) invalid('landform');
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  // All rings share winding so overlaps form a union when used as a native clip.
  if (area < 0) points.reverse();
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y),
    x = Math.min(...xs),
    y = Math.min(...ys);
  return { item, points, bounds: { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y } };
}

/** Shared world/screen projection for background, overlays, cursor and hit testing. */
export function createMapProjection(
  world,
  width,
  height,
  { full = false, center = world.spawn, scale = 0.37 } = {},
) {
  if (
    !world ||
    !finite(world.width) ||
    !finite(world.height) ||
    world.width <= 0 ||
    world.height <= 0 ||
    !finite(width) ||
    !finite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 4096 ||
    height > 4096
  )
    invalid('dimensions');
  if (full) scale = Math.min(width / world.width, height / world.height);
  if (!finite(scale) || scale <= 0 || (!full && (!finite(center?.x) || !finite(center?.y))))
    invalid('projection');
  const originX = full ? (width - world.width * scale) / 2 : width / 2 - center.x * scale;
  const originY = full ? (height - world.height * scale) / 2 : height / 2 - center.y * scale;
  return {
    width,
    height,
    full,
    scale,
    originX,
    originY,
    project: (x, y) => [originX + x * scale, originY + y * scale],
    unproject: (x, y) => ({ x: (x - originX) / scale, y: (y - originY) / scale }),
  };
}

/**
 * Static native-canvas map. Small views use indexed, bounded LRU world tiles;
 * the full map keeps one canvas at its actual output size. Dynamic overlays stay
 * caller-owned. Landforms/lakes are authoritative in polygon worlds: coarse
 * ocean rectangles never overwrite coasts or create dry strips beneath roads.
 */
export function createMapBackground(
  world,
  { canvasFactory = () => document.createElement('canvas'), tilePixels = 256, maxTiles = 24 } = {},
) {
  if (
    !world ||
    typeof world !== 'object' ||
    typeof canvasFactory !== 'function' ||
    !Number.isInteger(tilePixels) ||
    tilePixels < 64 ||
    tilePixels > 512 ||
    !Number.isInteger(maxTiles) ||
    maxTiles < 4 ||
    maxTiles > 64
  )
    invalid('options');
  const districts = new Map((world.districts ?? []).map((d) => [d.id, { ...d }]));
  const neighbourhoods = new Map(
    (world.neighbourhoods ?? []).map((area) => [area.id, { ...area }]),
  );
  const forms = (world.landforms ?? []).map(polygon);
  const districtBoxes = forms.length
    ? []
    : (world.districts ?? []).map((item) => ({ item, bounds: box(item) }));
  const waters = (
    forms.length ? (world.lakes ?? []) : [...(world.water ?? []), ...(world.lakes ?? [])]
  ).map((item) => ({ item, bounds: box(item) }));
  const buildings = (world.buildings ?? []).map((item) => ({ bounds: box(item) }));
  const roads = (world.roads ?? []).map((item) => ({
    ...item,
    access: item.access ? [...item.access] : ['foot', 'car'],
    bounds: {
      x: Math.min(item.x1, item.x2) - item.width / 2,
      y: Math.min(item.y1, item.y2) - item.width / 2,
      w: Math.abs(item.x2 - item.x1) + item.width,
      h: Math.abs(item.y2 - item.y1) + item.width,
    },
  }));
  const index = (items) => createSpatialIndex(items, { getBounds: (item) => item.bounds });
  const formIndex = index(forms),
    districtIndex = index(districtBoxes),
    waterIndex = index(waters),
    buildingIndex = index(buildings),
    roadIndex = index(roads);
  const tiles = new Map();
  let fullCache = null,
    tileRenders = 0,
    fullRenders = 0;
  function release(canvas) {
    canvas.width = 0;
    canvas.height = 0;
  }
  function makeCanvas(width, height) {
    const canvas = canvasFactory();
    canvas.width = width;
    canvas.height = height;
    if (!canvas.getContext('2d')) invalid('canvas context');
    return canvas;
  }
  function trace(g, points, projection) {
    points.forEach((p, i) => {
      const q = projection.project(p.x, p.y);
      if (!i) g.moveTo(...q);
      else g.lineTo(...q);
    });
    g.closePath();
  }
  function drawRect(g, record, p) {
    g.fillRect(
      ...p.project(record.bounds.x, record.bounds.y),
      record.bounds.w * p.scale,
      record.bounds.h * p.scale,
    );
  }
  function strokeRoad(g, road, p, ground) {
    const closed = !road.access.length || road.kind === 'closed-crossing';
    const rail =
      road.access.includes('rail') && !road.access.includes('car') && !road.access.includes('foot');
    const tunnel =
      road.tunnel ||
      road.kind === 'tunnel' ||
      (road.z1 ?? road.z ?? 0) < 0 ||
      (road.z2 ?? road.z ?? 0) < 0;
    const elevated = road.bridge || (road.z1 ?? road.z ?? 0) > 0 || (road.z2 ?? road.z ?? 0) > 0;
    const foot = road.access.includes('foot') && !road.access.includes('car');
    if (ground !== (!closed && !rail && !tunnel && !elevated)) return;
    g.setLineDash(closed ? [6, 4] : tunnel ? [5, 4] : rail ? [3, 2] : foot ? [3, 3] : []);
    g.strokeStyle = closed
      ? '#ab7669'
      : tunnel
        ? '#718d9e'
        : rail
          ? '#8f9fa7'
          : foot
            ? '#8a9d75'
            : elevated
              ? '#87886d'
              : '#304236';
    g.lineWidth =
      closed || tunnel || rail || foot
        ? Math.max(1.2, Math.min(3, road.width * p.scale * 0.35))
        : Math.max(1.2, road.width * p.scale);
    g.beginPath();
    g.moveTo(...p.project(road.x1, road.y1));
    g.lineTo(...p.project(road.x2, road.y2));
    g.stroke();
    if (!closed && !tunnel && !rail && !foot) {
      g.strokeStyle = elevated ? '#b6b48f' : '#667c58';
      g.lineWidth = 0.8;
      g.stroke();
    }
  }
  function paint(g, p) {
    const padding = BLEED / p.scale;
    const query = {
      x: -p.originX / p.scale - padding,
      y: -p.originY / p.scale - padding,
      w: p.width / p.scale + padding * 2,
      h: p.height / p.scale + padding * 2,
    };
    const visibleForms = formIndex.queryRect(query),
      visibleWater = waterIndex.queryRect(query),
      visibleRoads = roadIndex.queryRect(query);
    g.fillStyle = forms.length ? WATER : LAND;
    g.fillRect(0, 0, p.width, p.height);
    for (const record of districtIndex.queryRect(query)) {
      g.fillStyle = mix(record.item.color, '#203d31', 0.78);
      drawRect(g, record, p);
    }
    for (const form of visibleForms) {
      g.fillStyle = mix(districts.get(form.item.districtId)?.color, '#203d31', 0.78);
      g.beginPath();
      trace(g, form.points, p);
      g.fill();
    }
    g.fillStyle = WATER;
    for (const record of visibleWater) drawRect(g, record, p);
    g.fillStyle = '#526654';
    for (const record of buildingIndex.queryRect(query)) drawRect(g, record, p);
    g.lineCap = 'butt';
    g.lineJoin = 'round';
    g.save();
    if (forms.length) {
      g.beginPath();
      for (const form of visibleForms) trace(g, form.points, p);
      g.clip();
      for (const record of visibleWater) {
        g.beginPath();
        g.rect(0, 0, p.width, p.height);
        g.rect(
          ...p.project(record.bounds.x, record.bounds.y),
          record.bounds.w * p.scale,
          record.bounds.h * p.scale,
        );
        g.clip('evenodd');
      }
    }
    for (const road of visibleRoads) strokeRoad(g, road, p, true);
    g.restore();
    for (const road of visibleRoads) strokeRoad(g, road, p, false);
    g.setLineDash([]);
    if (p.full) {
      g.font = 'bold 11px monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#c0cbaa';
      for (const district of districts.values()) {
        const territory = forms
          .filter((form) => form.item.districtId === district.id)
          .sort((a, b) => b.bounds.w * b.bounds.h - a.bounds.w * a.bounds.h)[0];
        const label = territory
          ? {
              x: territory.bounds.x + territory.bounds.w / 2,
              y: territory.bounds.y + territory.bounds.h / 2,
            }
          : { x: district.x + district.w / 2, y: district.y + 55 };
        if (district.name && finite(label.x) && finite(label.y))
          g.fillText(district.name.toUpperCase(), ...p.project(label.x, label.y));
      }
    }
  }
  function tile(x, y, scale) {
    const key = `${scale}:${x}:${y}`;
    let canvas = tiles.get(key);
    if (canvas) {
      tiles.delete(key);
      tiles.set(key, canvas);
      return canvas;
    }
    canvas = makeCanvas(tilePixels + BLEED * 2, tilePixels + BLEED * 2);
    const originX = BLEED - x * tilePixels,
      originY = BLEED - y * tilePixels;
    paint(canvas.getContext('2d'), {
      width: canvas.width,
      height: canvas.height,
      originX,
      originY,
      scale,
      full: false,
      project: (wx, wy) => [originX + wx * scale, originY + wy * scale],
    });
    tileRenders++;
    tiles.set(key, canvas);
    while (tiles.size > maxTiles) {
      const oldest = tiles.keys().next().value;
      release(tiles.get(oldest));
      tiles.delete(oldest);
    }
    return canvas;
  }
  return {
    draw(g, p) {
      if (
        !g ||
        !p ||
        !finite(p.scale) ||
        p.scale <= 0 ||
        !finite(p.originX) ||
        !finite(p.originY) ||
        !finite(p.width) ||
        !finite(p.height) ||
        p.width <= 0 ||
        p.height <= 0 ||
        p.width > 4096 ||
        p.height > 4096
      )
        invalid('viewport');
      g.save();
      try {
        g.imageSmoothingEnabled = false;
        if (p.full) {
          const key = [p.width, p.height, p.scale, p.originX, p.originY].join(':');
          if (fullCache?.key !== key) {
            if (fullCache) release(fullCache.canvas);
            const canvas = makeCanvas(p.width, p.height);
            paint(canvas.getContext('2d'), p);
            fullCache = { key, canvas };
            fullRenders++;
          }
          g.drawImage(fullCache.canvas, 0, 0, p.width, p.height, 0, 0, p.width, p.height);
        } else {
          const left = Math.floor(-p.originX / tilePixels),
            right = Math.ceil((p.width - p.originX) / tilePixels) - 1;
          const top = Math.floor(-p.originY / tilePixels),
            bottom = Math.ceil((p.height - p.originY) / tilePixels) - 1;
          if (![left, right, top, bottom].every(Number.isSafeInteger)) invalid('tile coordinates');
          for (let y = top; y <= bottom; y++)
            for (let x = left; x <= right; x++) {
              const source = tile(x, y, p.scale),
                dx = p.originX + x * tilePixels,
                dy = p.originY + y * tilePixels;
              const x0 = Math.max(0, dx),
                y0 = Math.max(0, dy),
                x1 = Math.min(p.width, dx + tilePixels),
                y1 = Math.min(p.height, dy + tilePixels);
              g.drawImage(
                source,
                BLEED + x0 - dx,
                BLEED + y0 - dy,
                x1 - x0,
                y1 - y0,
                x0,
                y0,
                x1 - x0,
                y1 - y0,
              );
            }
        }
      } finally {
        g.restore();
      }
    },
    place(state) {
      const area = neighbourhoods.get(state.neighbourhood),
        district = districts.get(area?.districtId ?? state.district);
      return { areaName: area?.name ?? null, districtName: district?.name ?? 'Harbor City' };
    },
    stats() {
      return {
        tiles: tiles.size,
        tileRenders,
        fullRenders,
        cachedPixels:
          [...tiles.values()].reduce((total, canvas) => total + canvas.width * canvas.height, 0) +
          (fullCache ? fullCache.canvas.width * fullCache.canvas.height : 0),
      };
    },
    clear() {
      for (const canvas of tiles.values()) release(canvas);
      tiles.clear();
      if (fullCache) release(fullCache.canvas);
      fullCache = null;
    },
  };
}
