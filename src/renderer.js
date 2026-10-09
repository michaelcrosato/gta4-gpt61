/* Original Harbor City architecture, vehicles and atmosphere, drawn by my-3d2dge. */
import { drawActorEquipment, drawStreetEquipment, meleeAnimation } from './weapon-art.js';
import { WEAPONS } from './combat.js';
import { createCityGroundRenderer } from './city-ground.js';
import { createSpatialIndex } from './spatial-index.js';
import { createTerrain } from './terrain.js';
import { outfitAppearance } from './wardrobe.js';
import { actorDressing, drawActorWithDressing } from './actor-dressings.js';
import { twoSeatsAppearance, enqueueTwoSeatsMarks } from './campaign/two-seats-art.js';
import { createTwoSeatsFrontageArt } from './campaign/two-seats-frontages.js';
import {
  LATE_METER_APPEARANCES,
  drawLateMeterClothingMarks,
  drawLateMeterClipboard,
  lateMeterPropDescriptors,
} from './campaign/late-meter-scenes.js';
const E = globalThis.My3D2dge;
const hash = (value) => {
  let h = 2166136261;
  for (const character of String(value)) h = Math.imul(h ^ character.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
};

export function createWorldRenderer(game, world, specs, options = {}) {
  if (options.getActorDressing !== undefined && typeof options.getActorDressing !== 'function')
    throw new Error('Actor dressing requires a synchronous view callback.');
  const limits = {
    maxBuildingTextures: 96,
    maxBuildingPixels: 6_000_000,
    maxRigs: 256,
    rigIdleFrames: 240,
    ...options,
  };
  for (const key of ['maxBuildingTextures', 'maxBuildingPixels', 'maxRigs', 'rigIdleFrames'])
    if (!Number.isInteger(limits[key]) || limits[key] < 1)
      throw new Error('Invalid renderer cache bounds.');
  const cityGround = world.landforms?.length ? createCityGroundRenderer(world) : null;
  const twoSeatsFrontages = createTwoSeatsFrontageArt(world);
  const terrain = createTerrain(world);
  const clueRoof = Math.max(
    32,
    ...(world.buildings || []).map((b) => (b.z || 0) + (b.height || 70)),
    ...(world.obstacles || []).map((b) => (b.z || 0) + (b.height || 0)),
  );
  const buildingViews = new Map();
  const stats = {
    visibleBuildings: 0,
    queriedBuildings: 0,
    buildingTextures: 0,
    buildingPixels: 0,
    generatedBuildingTextures: 0,
    rigs: 0,
    frame: 0,
    ground: cityGround?.stats || null,
  };
  let frame = 0,
    underground = false;
  function shouldDrawActor(actor) {
    const z = actor.z || 0;
    return underground
      ? z < 0
      : z >= -1 && (!terrain || terrain.overheadDeck(actor.x, actor.y, 18, z) === null);
  }
  function authoredAppearance(person) {
    return (
      twoSeatsAppearance(person) ||
      Object.values(LATE_METER_APPEARANCES).find(
        (appearance) =>
          person.appearance?.id === appearance.id &&
          person.appearance?.version === appearance.version,
      )
    );
  }
  // Test the exact camera ray through the drawn clue, rather than the much
  // larger actor culling margin. Raw points have no body eye-height offset.
  function clueVisible(r, point) {
    const screen = r.w(point.x, point.y, point.z);
    if (screen[0] < 1 || screen[0] >= r.bw - 1 || screen[1] < 1 || screen[1] >= r.bh - 1)
      return false;
    const dx = r.view.dx,
      dy = r.view.dy,
      dz = r.view.dz / (r.view.zBoost || 1);
    if (![dx, dy, dz].every(Number.isFinite)) return false;
    let length =
      dz > 0.000001
        ? Math.max(1, (clueRoof + 32 - point.z) / dz)
        : Math.max(world.width, world.height);
    for (const [position, direction, limit] of [
      [point.x, dx, world.width],
      [point.y, dy, world.height],
    ]) {
      if (direction > 0) length = Math.min(length, Math.max(0, (limit - position) / direction));
      else if (direction < 0) length = Math.min(length, Math.max(0, -position / direction));
    }
    return terrain.hasLineOfSight(point, {
      x: point.x + dx * length,
      y: point.y + dy * length,
      z: point.z + dz * length,
    });
  }
  function releaseTexture(texture) {
    texture.cv.width = 0;
    texture.cv.height = 0;
    stats.buildingPixels -= texture.pixels;
  }
  function trimTextures(required = 0) {
    while (
      buildings.size &&
      (buildings.size >= limits.maxBuildingTextures ||
        stats.buildingPixels + required > limits.maxBuildingPixels)
    ) {
      const key = buildings.keys().next().value;
      releaseTexture(buildings.get(key));
      buildings.delete(key);
    }
    stats.buildingTextures = buildings.size;
  }
  const viewKey = (view) => [view.ax, view.ay, view.bx, view.by, view.bz].join(':');
  function projectedBounds(building, view, local = false) {
    const x = local ? 0 : building.x,
      y = local ? 0 : building.y,
      z = local ? 0 : building.z || 0,
      height = (building.height || 70) + 24;
    const points = [];
    for (const X of [x, x + building.w])
      for (const Y of [y, y + building.h])
        for (const Z of [z, z + height]) points.push(view.p(X, Y, Z));
    const left = Math.floor(Math.min(...points.map((p) => p[0]))) - 6,
      top = Math.floor(Math.min(...points.map((p) => p[1]))) - 6;
    return {
      x: left,
      y: top,
      w: Math.ceil(Math.max(...points.map((p) => p[0]))) + 7 - left,
      h: Math.ceil(Math.max(...points.map((p) => p[1]))) + 7 - top,
    };
  }
  function visibleBuildings(r) {
    const key = viewKey(r.view);
    let index = buildingViews.get(key);
    if (!index) {
      if (buildingViews.size >= 2) buildingViews.delete(buildingViews.keys().next().value);
      index = createSpatialIndex(world.buildings, {
        cellSize: 256,
        getBounds: (b) => projectedBounds(b, r.view),
      });
      buildingViews.set(key, index);
    } else {
      buildingViews.delete(key);
      buildingViews.set(key, index);
    }
    const found = index.queryRect({ x: r.ix, y: r.iy, w: r.bw, h: r.bh });
    stats.queriedBuildings = found.length;
    return found;
  }
  const lampPoints = [],
    lampViews = new Map();
  for (const road of world.roads) {
    if (
      road.access &&
      (!road.access.length || (!road.access.includes('foot') && !road.access.includes('car')))
    )
      continue;
    if (road.tunnel || Math.min(road.z1 ?? road.z ?? 0, road.z2 ?? road.z ?? 0) < 0) continue;
    const dx = road.x2 - road.x1,
      dy = road.y2 - road.y1,
      length = Math.hypot(dx, dy);
    if (!length) continue;
    const ux = dx / length,
      uy = dy / length,
      nx = Math.abs(uy) > Math.abs(ux) ? uy : -uy,
      ny = Math.abs(uy) > Math.abs(ux) ? -ux : ux;
    for (let along = 105; along < length; along += 140)
      lampPoints.push({
        x: road.x1 + ux * along + nx * (road.width || 80) * 0.55,
        y: road.y1 + uy * along + ny * (road.width || 80) * 0.55,
        z:
          (road.z1 ?? road.z ?? 0) +
          (((road.z2 ?? road.z ?? 0) - (road.z1 ?? road.z ?? 0)) * along) / length,
        nx,
        ny,
      });
  }
  stats.lampCount = lampPoints.length;
  stats.queriedLamps = 0;
  function visibleLamps(r) {
    const key = viewKey(r.view);
    let index = lampViews.get(key);
    if (!index) {
      if (lampViews.size >= 2) lampViews.delete(lampViews.keys().next().value);
      index = createSpatialIndex(lampPoints, {
        cellSize: 256,
        getBounds: (lamp) => {
          const points = [
            [lamp.x, lamp.y, lamp.z],
            [lamp.x, lamp.y, lamp.z + 34],
            [lamp.x - lamp.nx * 8, lamp.y - lamp.ny * 8, lamp.z + 34],
          ].map((p) => r.view.p(...p));
          const x = Math.floor(Math.min(...points.map((p) => p[0]))) - 12,
            y = Math.floor(Math.min(...points.map((p) => p[1]))) - 12;
          return {
            x,
            y,
            w: Math.ceil(Math.max(...points.map((p) => p[0]))) + 13 - x,
            h: Math.ceil(Math.max(...points.map((p) => p[1]))) + 13 - y,
          };
        },
      });
      lampViews.set(key, index);
    } else {
      lampViews.delete(key);
      lampViews.set(key, index);
    }
    const lamps = index.queryRect({ x: r.ix, y: r.iy, w: r.bw, h: r.bh });
    stats.queriedLamps = lamps.length;
    return lamps;
  }
  function retireRigs() {
    for (const [id, entry] of rigs)
      if (frame - entry.lastFrame > limits.rigIdleFrames) rigs.delete(id);
    stats.rigs = rigs.size;
  }

  const buildings = new Map();
  const rigs = new Map();
  const floors = new Map();
  const hero = new E.Humanoid({
    build: 'heroic',
    size: 0.86,
    weapon: null,
    outfit: 'coat',
    sleeves: 'long',
    colors: {
      skin: '#bc927b',
      hair: '#201d1b',
      coat: '#665d49',
      cloth: '#ddd7c4',
      pants: '#273435',
      boot: '#1c2221',
      trim: '#ad9162',
    },
  });

  function rectangle(r, x, y, w, h, color, z = 0) {
    E.px.poly(
      r.ctx,
      [r.w(x, y, z), r.w(x + w, y, z), r.w(x + w, y + h, z), r.w(x, y + h, z)],
      color,
    );
  }

  function paintBuilding(g, building, view, p) {
    const w = building.w,
      d = building.h,
      height = building.height || 70;
    const base = building.color || '#666556';
    const profile = building.protectedPrologue
      ? 'legacy'
      : building.profile || building.type || 'legacy';
    const industrial = ['industrial', 'warehouse', 'airport'].includes(profile),
      finance = profile === 'finance';
    const floorStep = industrial ? 24 : finance ? 18 : 15,
      windowStep = industrial ? 24 : finance ? 10 : 12,
      windowWidth = finance ? 6 : industrial ? 7 : 4,
      windowHeight = finance ? 11 : industrial ? 5 : 7;
    const side = E.shade(base, -0.18),
      dark = E.shade(base, -0.34);
    for (const face of [
      { nx: 0, ny: 1, a: [0, d], b: [w, d], size: w, color: side },
      { nx: 1, ny: 0, a: [w, d], b: [w, 0], size: d, color: dark },
      { nx: 0, ny: -1, a: [w, 0], b: [0, 0], size: w, color: side },
      { nx: -1, ny: 0, a: [0, 0], b: [0, d], size: d, color: dark },
    ]) {
      if (face.nx * view.fx + face.ny * view.fy <= 0.02) continue;
      const [ax, ay] = face.a,
        [bx, by] = face.b;
      E.px.poly(g, [p(ax, ay, 0), p(bx, by, 0), p(bx, by, height), p(ax, ay, height)], face.color);
      for (let z = 14; z < height - 9; z += floorStep) {
        E.px.line(g, ...p(ax, ay, z - 4), ...p(bx, by, z - 4), E.shade(face.color, -0.12));
        for (let t = 7; t < face.size - 5; t += windowStep) {
          const u = t / face.size,
            u1 = Math.min(1, (t + windowWidth) / face.size);
          const xa = ax + (bx - ax) * u,
            ya = ay + (by - ay) * u;
          const xb = ax + (bx - ax) * u1,
            yb = ay + (by - ay) * u1;
          const lit = hash(`${building.id}:${z}:${t}`) > 0.57;
          E.px.poly(
            g,
            [p(xa, ya, z), p(xb, yb, z), p(xb, yb, z + windowHeight), p(xa, ya, z + windowHeight)],
            lit ? (finance ? '#a5c2bb' : '#c4ae76') : finance ? '#3c5654' : '#2b3a39',
          );
          E.px.line(g, ...p(xa, ya, z + 3), ...p(xb, yb, z + 3), lit ? '#8b845c' : '#44504a');
        }
      }
      const middle = face.size * 0.5;
      const ax1 = ax + ((bx - ax) * (middle - 4)) / face.size,
        ay1 = ay + ((by - ay) * (middle - 4)) / face.size;
      const bx1 = ax + ((bx - ax) * (middle + 4)) / face.size,
        by1 = ay + ((by - ay) * (middle + 4)) / face.size;
      E.px.poly(g, [p(ax1, ay1, 0), p(bx1, by1, 0), p(bx1, by1, 12), p(ax1, ay1, 12)], '#162322');
      if (hash(building.id) > 0.45)
        E.px.poly(g, [p(ax, ay, 12), p(bx, by, 12), p(bx, by, 15), p(ax, ay, 15)], '#456963');
      if (industrial) {
        const start = 0.28,
          end = 0.72,
          point = (u, z) => p(ax + (bx - ax) * u, ay + (by - ay) * u, z);
        E.px.poly(g, [point(start, 0), point(end, 0), point(end, 18), point(start, 18)], '#56625b');
        for (let z = 3; z < 18; z += 3)
          E.px.line(g, ...point(start, z), ...point(end, z), '#818b79');
      } else if (finance) {
        for (let t = 3; t < face.size; t += 22) {
          const u = t / face.size,
            x = ax + (bx - ax) * u,
            y = ay + (by - ay) * u;
          E.px.line(g, ...p(x, y, 0), ...p(x, y, height), '#929f97');
        }
      } else if (['housing', 'historic', 'coastal', 'hillside', 'university'].includes(profile)) {
        for (let z = 24; z < height - 10; z += 30) {
          const a = 0.42,
            b = 0.62;
          E.px.line(
            g,
            ...p(ax + (bx - ax) * a, ay + (by - ay) * a, z),
            ...p(ax + (bx - ax) * b, ay + (by - ay) * b, z),
            '#afad96',
            2,
          );
        }
      }
    }
    E.px.poly(
      g,
      [p(0, 0, height), p(w, 0, height), p(w, d, height), p(0, d, height)],
      E.shade(base, 0.1),
    );
    E.px.poly(
      g,
      [
        p(4, 4, height + 1),
        p(w - 4, 4, height + 1),
        p(w - 4, d - 4, height + 1),
        p(4, d - 4, height + 1),
      ],
      '#686d5e',
    );
    E.px.line(g, ...p(0, 0, height + 2), ...p(w, 0, height + 2), '#adb095');
    const ventX = w * 0.4,
      ventY = d * 0.35;
    E.px.poly(
      g,
      [
        p(ventX, ventY, height),
        p(ventX + 12, ventY, height),
        p(ventX + 12, ventY + 10, height + 7),
        p(ventX, ventY + 10, height + 7),
      ],
      '#414d48',
    );
    E.px.poly(
      g,
      [
        p(ventX, ventY, height + 7),
        p(ventX + 12, ventY, height + 7),
        p(ventX + 12, ventY + 10, height + 7),
        p(ventX, ventY + 10, height + 7),
      ],
      '#81877b',
    );
    if (hash(building.id) > 0.67) {
      const q = p(w * 0.75, d * 0.7, height),
        top = p(w * 0.75, d * 0.7, height + 13);
      E.px.line(g, ...q, ...top, '#2b3936');
      E.px.line(g, top[0] - 5, top[1] + 3, top[0] + 5, top[1] + 3, '#2b3936');
    }
    if (finance) {
      E.px.poly(
        g,
        [
          p(w * 0.25, d * 0.25, height + 3),
          p(w * 0.75, d * 0.25, height + 3),
          p(w * 0.75, d * 0.75, height + 14),
          p(w * 0.25, d * 0.75, height + 14),
        ],
        '#607873',
      );
      E.px.line(
        g,
        ...p(w * 0.5, d * 0.5, height + 14),
        ...p(w * 0.5, d * 0.5, height + 22),
        '#b1b6a1',
        2,
      );
    } else if (industrial) {
      E.px.poly(
        g,
        [
          p(w * 0.6, d * 0.15, height + 2),
          p(w * 0.84, d * 0.15, height + 2),
          p(w * 0.84, d * 0.65, height + 2),
          p(w * 0.6, d * 0.65, height + 2),
        ],
        '#a3b4a1',
      );
      E.px.line(
        g,
        ...p(w * 0.6, d * 0.4, height + 3),
        ...p(w * 0.84, d * 0.4, height + 3),
        '#3d554e',
      );
    } else if (['coastal', 'hillside'].includes(profile)) {
      E.px.poly(
        g,
        [p(0, 0, height), p(w, 0, height), p(w, d * 0.5, height + 10), p(0, d * 0.5, height + 10)],
        '#9b8264',
      );
      E.px.poly(
        g,
        [p(0, d * 0.5, height + 10), p(w, d * 0.5, height + 10), p(w, d, height), p(0, d, height)],
        '#715f4e',
      );
    } else if (['park', 'university', 'civic'].includes(profile)) {
      E.px.poly(
        g,
        [
          p(w * 0.1, d * 0.1, height + 2),
          p(w * 0.9, d * 0.1, height + 2),
          p(w * 0.9, d * 0.23, height + 2),
          p(w * 0.1, d * 0.23, height + 2),
        ],
        '#829674',
      );
    }
  }
  function cachedBuilding(building, view) {
    const key = building.id + ':' + viewKey(view);
    if (buildings.has(key)) {
      const cached = buildings.get(key);
      buildings.delete(key);
      buildings.set(key, cached);
      return cached;
    }
    const bounds = projectedBounds(building, view, true),
      pixels = bounds.w * bounds.h;
    if (bounds.w > 2048 || bounds.h > 2048 || pixels > limits.maxBuildingPixels) return null;
    trimTextures(pixels);
    const cv = E.mkCanvas(bounds.w, bounds.h),
      g = E.ctx2d(cv);
    paintBuilding(g, building, view, (x, y, z) => {
      const p = view.p(x, y, z);
      return [p[0] - bounds.x, p[1] - bounds.y];
    });
    const texture = { cv, x0: bounds.x, y0: bounds.y, pixels };
    buildings.set(key, texture);
    stats.buildingPixels += pixels;
    stats.generatedBuildingTextures++;
    stats.buildingTextures = buildings.size;
    return texture;
  }

  function drawBuilding(r, b, state) {
    const center = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    r.queue(
      center.x,
      center.y,
      0,
      (g) => {
        const cache = g._info ? null : cachedBuilding(b, r.view);
        const q = r.w(b.x, b.y, b.z || 0);
        const player = state.player;
        const screenPlayer = r.w(player.x, player.y, (player.z || 0) + 12),
          screenBuilding = r.w(center.x, center.y, 0);
        const occluding =
          (player.z || 0) < (b.z || 0) + (b.height || 70) &&
          screenBuilding[1] > screenPlayer[1] &&
          Math.abs(screenPlayer[0] - screenBuilding[0]) < b.w * 0.75 &&
          Math.hypot(center.x - player.x, center.y - player.y) < 170;
        g.globalAlpha = occluding ? 0.36 : 1;
        if (cache && !g._info) {
          const dx = Math.round(q[0] + cache.x0),
            dy = Math.round(q[1] + cache.y0),
            sx = Math.max(0, -dx),
            sy = Math.max(0, -dy);
          const width = Math.min(cache.cv.width, r.bw - dx) - sx,
            height = Math.min(cache.cv.height, r.bh - dy) - sy;
          if (width > 0 && height > 0)
            g.drawImage(cache.cv, sx, sy, width, height, dx + sx, dy + sy, width, height);
        } else paintBuilding(g, b, r.view, (x, y, z) => r.w(b.x + x, b.y + y, (b.z || 0) + z));
        twoSeatsFrontages.draw(r, g, b, state, { cutaway: occluding });
        g.globalAlpha = 1;
      },
      { occluder: true },
    );
  }

  function drawVehicle(r, car, state) {
    if (!shouldDrawActor(car) || !r.visible(car.x, car.y, car.z || 0, 60, 70, 70)) return;
    const spec = specs[car.spec] || specs.sedan;
    const occupants = (state.companions?.actors || []).filter(
      (actor) => actor.vehicleId === car.id && actor.companionPhase !== 'exiting',
    );
    if (state.player.vehicleId === car.id)
      occupants.push({ ...state.player, id: 'mara-voss', seat: 0 });
    const L = (spec.length || 28) / 2,
      W = (spec.width || 14) / 2;
    const c = Math.cos(car.angle),
      s = Math.sin(car.angle);
    const point = (x, y, z) => r.w(car.x + x * c - y * s, car.y + x * s + y * c, (car.z || 0) + z);
    const prism = (g, l, w, z0, z1, color, roof) => {
      const corners = [
        [-l, -w],
        [l, -w],
        [l, w],
        [-l, w],
      ];
      for (let i = 0; i < 4; i++) {
        const a = corners[i],
          b = corners[(i + 1) % 4];
        const nx = (b[1] - a[1]) * c + (b[0] - a[0]) * s;
        const ny = (b[1] - a[1]) * s - (b[0] - a[0]) * c;
        if (nx * r.view.fx + ny * r.view.fy > 0)
          E.px.poly(
            g,
            [point(...a, z0), point(...b, z0), point(...b, z1), point(...a, z1)],
            E.shade(color, -0.21),
          );
      }
      E.px.poly(
        g,
        corners.map((p) => point(...p, z1)),
        roof || color,
      );
    };
    r.shadow(car.x, car.y, L, 0.3, '#0b1716', car.z || 0);
    r.queue(car.x, car.y, car.z || 0, (g) => {
      prism(g, L, W, 1, 3, '#17211e');
      for (const axle of [-L * 0.6, L * 0.6])
        for (const side of [-W, W]) {
          const q = point(axle, side, 2);
          E.px.rect(g, q[0] - 3, q[1] - 2, 6, 5, '#101915');
        }
      const color = car.color || '#9e9471';
      prism(g, L, W, 3, 7, color);
      prism(g, L * 0.46, W * 0.8, 7, 12, color, E.shade(color, 0.16));
      for (const x of [-L * 0.47, L * 0.47]) {
        const glass = [
          point(x, -W * 0.77, 8),
          point(x, W * 0.77, 8),
          point(x * 0.7, W * 0.7, 11),
          point(x * 0.7, -W * 0.7, 11),
        ];
        E.px.poly(g, glass, '#46676a');
        const windowPixels = (x, y, w, h, color) => {
          for (let row = Math.round(y); row < Math.round(y) + h; row++)
            for (let col = Math.round(x); col < Math.round(x) + w; col++) {
              const signs = glass.map((a, i) => {
                const b = glass[(i + 1) % glass.length];
                return (b[0] - a[0]) * (row + 0.5 - a[1]) - (b[1] - a[1]) * (col + 0.5 - a[0]);
              });
              if (signs.every((v) => v >= -1e-7) || signs.every((v) => v <= 1e-7))
                E.px.rect(g, col, row, 1, 1, color);
            }
        };
        for (const person of occupants) {
          const front = (person.seat ?? 1) < 2;
          if (front !== x > 0) continue;
          const side = (person.seat ?? 1) === 0 || (person.seat ?? 1) === 2 ? -1 : 1;
          const head = point((front ? 1 : -1) * L * 0.39, side * W * 0.44, 9.6);
          const skin =
            person.id === 'mara-voss'
              ? outfitAppearance(state).colors.skin
              : authoredAppearance(person)?.colors.skin ||
                person.colors?.skin ||
                (hash(person.id) > 0.5 ? '#c69b7c' : '#916f58');
          windowPixels(
            head[0] - 1,
            head[1] + 1,
            3,
            2,
            authoredAppearance(person)?.colors.cloth || '#344b50',
          );
          windowPixels(head[0] - 1, head[1] - 1, 3, 2, skin);
          windowPixels(head[0] - 1, head[1] - 2, 3, 1, '#35312a');
        }
      }
      if (car.spec === 'taxi') prism(g, 3, 2, 12, 15, '#ded492');
      if (car.kind === 'police' || car.spec === 'police') {
        const q1 = point(1, -3, 13),
          q2 = point(1, 3, 13),
          blink = Math.floor(game.time * 6) % 2;
        E.px.rect(g, q1[0] - 2, q1[1] - 1, 4, 2, blink ? '#dd8a74' : '#576857');
        E.px.rect(g, q2[0] - 2, q2[1] - 1, 4, 2, blink ? '#637e82' : '#73a9b5');
      }
      for (const side of [-W * 0.65, W * 0.65]) {
        const front = point(L + 0.1, side, 6),
          back = point(-L - 0.1, side, 6);
        E.px.rect(g, front[0] - 1, front[1] - 1, 3, 2, '#d5cf96');
        E.px.rect(g, back[0] - 1, back[1] - 1, 3, 2, '#a96550');
      }
      if (car.id === state.player.vehicleId) {
        const q = point(0, 0, 17);
        E.px.poly(
          g,
          [
            [q[0] - 3, q[1] - 3],
            [q[0] + 3, q[1] - 3],
            [q[0], q[1]],
          ],
          '#e7c875',
        );
      }
    });
  }

  function rigFor(person, type) {
    const appearance = authoredAppearance(person),
      appearanceKey = appearance?.id || type;
    if (rigs.get(person.id)?.appearanceKey === appearanceKey) {
      const entry = rigs.get(person.id);
      entry.lastFrame = frame;
      rigs.delete(person.id);
      rigs.set(person.id, entry);
      return entry.rig;
    }
    rigs.delete(person.id);
    while (rigs.size >= limits.maxRigs) rigs.delete(rigs.keys().next().value);
    const palette = ['#4b6059', '#71634d', '#556573', '#8a6c55', '#514d4b'];
    const rig = new E.Humanoid({
      build: appearance?.build || 'heroic',
      size: appearance?.size || 0.78,
      weapon: null,
      outfit: appearance?.outfit || (type === 'pedestrian' ? 'coat' : 'shirt'),
      sleeves: appearance?.sleeves || 'long',
      hat: appearance ? appearance.hat : type === 'police' ? 'cap' : null,
      colors: appearance?.colors || {
        skin: hash(person.id) > 0.5 ? '#c69b7c' : '#916f58',
        cloth:
          type === 'police' ? '#34474d' : palette[Math.floor(hash(person.id) * palette.length)],
        coat: palette[Math.floor(hash(person.id) * palette.length)],
        pants: '#323c38',
        boot: '#202b25',
        hair: '#35312a',
      },
    });
    rigs.set(person.id, { rig, lastFrame: frame, appearanceKey });
    stats.rigs = rigs.size;
    return rig;
  }

  function drawPerson(r, person, type, dt, state, prop = null) {
    if ((person.inVehicle || person.vehicleId) && person.companionPhase !== 'exiting') return;
    if (!shouldDrawActor(person) || !r.visible(person.x, person.y, person.z || 0, 35, 50, 50))
      return;
    const rig = rigFor(person, type);
    const dressing = actorDressing(options.getActorDressing?.(state, person.id), person.id);
    const appearance = twoSeatsAppearance(person);
    const canonicalWeapon =
      person.kind === 'companion' &&
      person.companionId === person.id &&
      Array.isArray(state?.companions?.actors) &&
      state.companions.actors.includes(person) &&
      typeof person.weapon === 'string' &&
      person.weapon !== 'unarmed' &&
      Object.hasOwn(WEAPONS, person.weapon);
    const reading = Boolean(
      prop && person.sceneAction === 'read-clipboard' && person.health > 0 && !person.meleeAction,
    );
    rig.update(dt, {
      x: person.x,
      y: person.y,
      z: person.z || 0,
      facing: person.angle || 0,
      vx: person.health > 0 ? person.vx || Math.cos(person.angle || 0) * (person.speed || 0) : 0,
      vy: person.health > 0 ? person.vy || Math.sin(person.angle || 0) * (person.speed || 0) : 0,
      pose:
        person.health <= 0
          ? 'down'
          : person.crouching || ['boarding', 'exiting'].includes(person.companionPhase)
            ? 'crouch'
            : undefined,
      point:
        reading ||
        ((type !== 'pedestrian' || canonicalWeapon) &&
          person.health > 0 &&
          WEAPONS[person.weapon]?.mode !== 'melee' &&
          !person.meleeAction),
      aim: reading ? -0.7 : 0,
      attack: meleeAnimation(person.meleeAction),
      stance:
        person.weapon === 'unarmed' && (person.defending || person.meleeAction)
          ? 'guard'
          : undefined,
    });
    if (!person.z) r.shadow(person.x, person.y, 7, 0.3, '#14231e');
    let reported = false;
    r.actor(
      person.x,
      person.y,
      person.z || 0,
      (g, ox, oy) => {
        drawActorWithDressing(
          g,
          ox,
          oy,
          rig,
          r.view,
          dressing,
          appearance ? (g, art) => enqueueTwoSeatsMarks(art, appearance) : null,
        );
        if (person.health > 0 && (type !== 'pedestrian' || canonicalWeapon))
          drawActorEquipment(g, ox, oy, rig, r.view, person.weapon || 'pistol');
        const marks = authoredAppearance(person)
          ? drawLateMeterClothingMarks(r, g, person, { origin: [ox, oy] })
          : 0;
        const clipboard =
          prop && drawLateMeterClipboard(r, g, prop, prop, { actor: person, origin: [ox, oy] });
        if (
          !reported &&
          g === r.ctx &&
          marks > 0 &&
          clipboard &&
          typeof options.onRenderedClues === 'function' &&
          clueVisible(r, { x: person.x, y: person.y, z: (person.z || 0) + 16 }) &&
          clueVisible(r, { x: prop.x, y: prop.y, z: prop.z + prop.height * 0.45 })
        ) {
          reported = true;
          options.onRenderedClues(
            state,
            person,
            Object.freeze(['grey-tow-jacket', 'co-op-repossession-clipboard']),
          );
        }
      },
      {
        outline: false,
        rim: false,
      },
    );
  }

  function drawPoliceAircraft(r, craft) {
    if (!shouldDrawActor(craft) || !r.visible(craft.x, craft.y, craft.z, 95, 100, 100)) return;
    const c = Math.cos(craft.angle),
      s = Math.sin(craft.angle),
      p = (x, y, z = 0) => r.w(craft.x + x * c - y * s, craft.y + x * s + y * c, craft.z + z);
    r.shadow(craft.x, craft.y, 30, 0.15, '#152f26');
    if (craft.searchlight && craft.health > 0) {
      r.groundDisc(
        craft.searchlight.x,
        craft.searchlight.y,
        craft.searchlight.radius,
        '#d2cba0',
        0.15,
      );
      r.groundRing(
        craft.searchlight.x,
        craft.searchlight.y,
        craft.searchlight.radius,
        '#ddce9e',
        0.15,
      );
    }
    r.queue(craft.x, craft.y, craft.z, (g) => {
      E.px.poly(g, [p(-16, -8), p(15, -8), p(22, 0), p(14, 8), p(-16, 8)], '#556967');
      E.px.poly(
        g,
        [p(-16, -8, 1), p(11, -8, 6), p(18, 0, 7), p(10, 8, 6), p(-16, 8, 1)],
        '#7c9087',
      );
      E.px.poly(g, [p(10, -6, 7), p(20, 0, 7), p(10, 6, 7), p(3, 6, 9), p(3, -6, 9)], '#a1b8ad');
      E.px.line(g, ...p(-16, 0, 3), ...p(-49, 0, 9), '#637b70', 4);
      E.px.line(g, ...p(-49, -8, 9), ...p(-49, 8, 9), '#a3ad92', 2);
      E.px.line(g, ...p(-12, -11, -6), ...p(17, -11, -6), '#303f38', 2);
      E.px.line(g, ...p(-12, 11, -6), ...p(17, 11, -6), '#303f38', 2);
      const a = game.real * 32;
      const rotor = (offset) => {
        const dx = Math.cos(a + offset) * 39,
          dy = Math.sin(a + offset) * 39;
        E.px.line(g, ...p(-dx, -dy, 13), ...p(dx, dy, 13), '#c5c9aa', 2);
      };
      rotor(0);
      rotor(Math.PI / 2);
      const light = p(18, 0, -2);
      E.px.rect(g, light[0] - 2, light[1] - 1, 4, 2, '#e0d391');
    });
  }

  function streetFurniture(r, state) {
    for (const lamp of visibleLamps(r)) {
      const { x, y, z, nx, ny } = lamp;
      r.queue(x, y, z, (g) => {
        const base = r.w(x, y, z),
          top = r.w(x, y, z + 34),
          light = r.w(x - nx * 8, y - ny * 8, z + 34);
        E.px.line(g, ...base, ...top, '#364e41', 2);
        E.px.line(g, ...top, ...light, '#364e41', 2);
        E.px.rect(g, light[0] - 2, light[1] - 1, 5, 2, '#dac68f');
        r.glowDisc(g, light[0], light[1], 6, '#c3a56d', 0.14);
      });
    }
    for (const location of world.locations) {
      if (!r.visible(location.x, location.y, 0, 70, 80, 70)) continue;
      const target = state.mission?.target;
      const active = target && Math.hypot(location.x - target.x, location.y - target.y) < 30;
      if (active) continue;
      r.queue(location.x, location.y, 1, (g) => {
        const p = r.w(location.x, location.y, 23);
        E.px.rect(g, p[0] - 5, p[1] - 5, 11, 11, location.color || '#5d766a');
        E.font.text(
          g,
          twoSeatsFrontages.locationGlyph(location, state) ||
            {
              home: 'H',
              garage: 'G',
              clinic: '+',
              weapons: 'W',
              armour: 'A',
              food: 'F',
              taxi: 'T',
              radio: 'R',
              depot: 'D',
              activity:
                { bowling: 'B', darts: 'D', pool: 'P', arcade: 'S' }[location.activity] || 'S',
            }[location.type] ||
            '$',
          p[0],
          p[1] - 3,
          '#f1e7bb',
          { align: 'center', outline: false },
        );
      });
    }
  }

  function drawStaticFloor(r) {
    rectangle(r, 0, 0, world.width, world.height, '#556153');
    for (const district of world.districts)
      rectangle(
        r,
        district.x,
        district.y,
        district.w,
        district.h,
        E.mix(district.color || '#536256', '#3b5548', 0.7),
      );
    for (const water of world.water || [])
      rectangle(r, water.x, water.y, water.w, water.h, '#203e42');
    for (const road of world.roads) {
      const v = road.x1 === road.x2,
        w = road.width || 80;
      const x = v ? road.x1 - w / 2 : road.x1,
        y = v ? road.y1 : road.y1 - w / 2;
      const rw = v ? w : road.x2 - road.x1,
        rh = v ? road.y2 - road.y1 : w;
      rectangle(r, x - 7, y - 7, rw + 14, rh + 14, '#798070');
      rectangle(r, x, y, rw, rh, '#354542');
      const length = v ? rh : rw;
      for (let q = 5; q < length; q += 22) {
        rectangle(
          r,
          v ? road.x1 - 1 : x + q,
          v ? y + q : road.y1 - 1,
          v ? 2 : 10,
          v ? 10 : 2,
          '#9c9d75',
        );
      }
      for (let q = 15; q < length; q += 44) {
        rectangle(r, v ? x + 5 : x + q, v ? y + q : y + 5, v ? 1 : 10, v ? 10 : 1, '#778575');
        rectangle(
          r,
          v ? x + rw - 6 : x + q,
          v ? y + q : y + rh - 6,
          v ? 1 : 10,
          v ? 10 : 1,
          '#778575',
        );
      }
    }
    const vertical = world.roads.filter((q) => q.x1 === q.x2),
      horizontal = world.roads.filter((q) => q.y1 === q.y2);
    for (const a of vertical)
      for (const b of horizontal) {
        if (b.y1 < a.y1 || b.y1 > a.y2 || a.x1 < b.x1 || a.x1 > b.x2) continue;
        rectangle(r, a.x1 - 40, b.y1 - 40, 80, 80, '#3a4944');
        for (let p = -29; p < 30; p += 9) {
          rectangle(r, a.x1 + p, b.y1 - 44, 5, 11, '#a6ab92');
          rectangle(r, a.x1 + p, b.y1 + 33, 5, 11, '#a6ab92');
          rectangle(r, a.x1 - 44, b.y1 + p, 11, 5, '#a6ab92');
          rectangle(r, a.x1 + 33, b.y1 + p, 11, 5, '#a6ab92');
        }
      }
    for (let i = 0; i < 110; i++) {
      const x = hash(`puddle-x${i}`) * world.width,
        y = hash(`puddle-y${i}`) * world.height;
      if (!r.visible(x, y, 0, 40, 50, 50)) continue;
      r.groundDisc(x, y, 3 + hash(i) * 9, '#60796c', 0.27);
    }
  }

  function floorAtlas(view) {
    const key = [view.ax, view.ay, view.bx, view.by, view.bz, E.style.trans].join(':');
    if (floors.has(key)) {
      const cached = floors.get(key);
      floors.delete(key);
      floors.set(key, cached);
      return cached;
    }
    // Two camera views fit comfortably; release the old backing store before
    // allocating its replacement, rather than retaining a third atlas briefly.
    if (floors.size >= 2) {
      const oldest = floors.keys().next().value,
        retired = floors.get(oldest);
      if (retired) {
        retired.cv.width = 0;
        retired.cv.height = 0;
      }
      floors.delete(oldest);
    }
    let atlas = null;
    let left = 0,
      top = 0,
      right = world.width,
      bottom = world.height;
    for (const area of [...world.districts, ...(world.water || [])]) {
      left = Math.min(left, area.x);
      top = Math.min(top, area.y);
      right = Math.max(right, area.x + area.w);
      bottom = Math.max(bottom, area.y + area.h);
    }
    for (const road of world.roads) {
      const margin = (road.width || 80) / 2 + 16;
      left = Math.min(left, road.x1 - margin, road.x2 - margin);
      top = Math.min(top, road.y1 - margin, road.y2 - margin);
      right = Math.max(right, road.x1 + margin, road.x2 + margin);
      bottom = Math.max(bottom, road.y1 + margin, road.y2 + margin);
    }
    const projected = [
      [left - 16, top - 16],
      [right + 16, top - 16],
      [right + 16, bottom + 16],
      [left - 16, bottom + 16],
    ].map((p) => view.p(...p, 0));
    const x0 = Math.floor(Math.min(...projected.map((p) => p[0]))) - 2,
      y0 = Math.floor(Math.min(...projected.map((p) => p[1]))) - 2;
    const width = Math.ceil(Math.max(...projected.map((p) => p[0]))) + 3 - x0,
      height = Math.ceil(Math.max(...projected.map((p) => p[1]))) + 3 - y0;
    // Avoid oversized textures on phones or if a future view zooms far inward.
    if (
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0 &&
      width <= 4096 &&
      height <= 4096 &&
      width * height <= 6_000_000
    ) {
      try {
        const cv = E.mkCanvas(width, height),
          g = E.ctx2d(cv);
        const projectedRenderer = {
          ctx: g,
          view,
          ix: x0,
          iy: y0,
          visible: () => true,
          w(x, y, z = 0) {
            const p = view.p(x, y, z);
            return [p[0] - x0, p[1] - y0];
          },
          groundDisc(x, y, radius, color, alpha = 1, z = 0) {
            const points = [];
            for (let i = 0; i < 18; i++) {
              const angle = (i / 18) * Math.PI * 2;
              points.push(this.w(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, z));
            }
            E.px.polyDither(g, points, color, alpha, x0, y0);
          },
        };
        drawStaticFloor(projectedRenderer);
        atlas = { cv, x0, y0 };
      } catch (_) {
        /* An unavailable backing store uses the live primitives. */
      }
    }
    floors.set(key, atlas);
    return atlas;
  }

  function drawFloor(r) {
    r.sky(['#263f40', '#243b38']);
    const g = r.ctx;
    let transform;
    try {
      transform = g.getTransform?.();
    } catch (_) {
      /* Keep unfamiliar contexts live. */
    }
    const compatible =
      Number.isInteger(r.ix) &&
      Number.isInteger(r.iy) &&
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
      (!g.filter || g.filter === 'none');
    if (!compatible) {
      drawStaticFloor(r);
      return;
    }
    const atlas = floorAtlas(r.view);
    if (!atlas) {
      drawStaticFloor(r);
      return;
    }
    const viewportX = r.ix - atlas.x0,
      viewportY = r.iy - atlas.y0;
    const sourceX = Math.max(0, viewportX),
      sourceY = Math.max(0, viewportY);
    const width = Math.min(atlas.cv.width, viewportX + r.bw) - sourceX,
      height = Math.min(atlas.cv.height, viewportY + r.bh) - sourceY;
    if (width > 0 && height > 0)
      g.drawImage(
        atlas.cv,
        sourceX,
        sourceY,
        width,
        height,
        sourceX - viewportX,
        sourceY - viewportY,
        width,
        height,
      );
  }

  return {
    stats,
    dispose() {
      for (const value of buildings.values()) releaseTexture(value);
      buildings.clear();
      for (const value of floors.values())
        if (value) {
          value.cv.width = 0;
          value.cv.height = 0;
        }
      floors.clear();
      buildingViews.clear();
      lampViews.clear();
      rigs.clear();
      cityGround?.dispose();
      stats.buildingTextures = 0;
      stats.rigs = 0;
    },
    draw(r, state, { title = false, rain = true } = {}) {
      frame++;
      stats.frame = frame;
      underground = (state.player.z || 0) < -1;
      if (options.drawGround) options.drawGround(r, state);
      else if (cityGround) {
        if (underground) cityGround.drawUnderground(r, state.player);
        else {
          cityGround.draw(r);
          cityGround.drawElevated(r);
        }
      } else drawFloor(r);
      options.afterGround?.(r, state);
      const visible = underground ? [] : visibleBuildings(r);
      stats.visibleBuildings = visible.length;
      for (const b of visible) drawBuilding(r, b, state);
      if (options.drawScenery) options.drawScenery(r, state);
      else if (!underground) streetFurniture(r, state);
      options.afterScenery?.(r, state);
      retireRigs();
      const sceneId = state.interior?.active?.roomId ?? null;
      const props = lateMeterPropDescriptors(state).filter(
        (prop) => (prop.sceneId ?? null) === sceneId && !(prop.health <= 0),
      );
      const carried = new Map(
        props.filter((prop) => prop.state === 'carried').map((prop) => [prop.ownerActorId, prop]),
      );
      for (const car of state.vehicles) drawVehicle(r, car, state);
      const drawnActors = new Set();
      const drawNamed = (person, type) => {
        if (drawnActors.has(person.id)) return;
        drawnActors.add(person.id);
        drawPerson(r, person, type, 1 / 60, state, carried.get(person.id));
      };
      for (const person of state.pedestrians) drawNamed(person, 'pedestrian');
      for (const person of state.police) drawNamed(person, 'police');
      for (const person of state.hostiles) drawNamed(person, 'hostile');
      const renderedIds = new Set(
        [...state.pedestrians, ...state.police, ...state.hostiles].map((person) => person.id),
      );
      for (const person of state.companions?.actors || [])
        if (
          !renderedIds.has(person.id) &&
          (person.sceneId ?? null) === (state.interior?.active?.roomId ?? null)
        )
          drawNamed(person, 'pedestrian');
      for (const prop of props)
        if (
          prop.state === 'dropped' &&
          shouldDrawActor(prop) &&
          r.visible(prop.x, prop.y, prop.z || 0, 12, 12, 12)
        )
          r.queue(prop.x, prop.y, prop.z || 0, (g) => drawLateMeterClipboard(r, g, prop, prop));
      for (const craft of state.policeAircraft || []) drawPoliceAircraft(r, craft);
      if (state.mission?.stageType === 'interact' && state.mission.target) {
        const t = state.mission.target;
        drawPerson(
          r,
          {
            id: `contact:${state.mission.id}:${state.mission.stage}`,
            x: t.x,
            y: t.y,
            z: t.z || 0,
            angle: Math.PI / 2,
            health: 100,
          },
          'pedestrian',
          1 / 60,
          state,
        );
      }
      const p = state.player;
      if (!p.vehicleId && shouldDrawActor(p)) {
        const appearance = outfitAppearance(state);
        if (hero._lowlightOutfit !== appearance.id) {
          hero._lowlightOutfit = appearance.id;
          hero.o.outfit = appearance.outfit;
          hero.o.sleeves = appearance.sleeves;
          Object.assign(hero.C, appearance.colors);
          hero.C.clothDk = E.shade(hero.C.cloth, -0.3);
          hero.C.clothLt = E.shade(hero.C.cloth, 0.25);
          hero.C.pantsDk = E.shade(hero.C.pants, -0.3);
          hero.C.bootDk = E.shade(hero.C.boot, -0.3);
        }
        hero.update(1 / 60, {
          x: p.x,
          y: p.y,
          z: p.z || 0,
          vz: p.vz || 0,
          facing: p.angle,
          vx: p.vx || Math.cos(p.angle) * (p.speed || 0),
          vy: p.vy || Math.sin(p.angle) * (p.speed || 0),
          point:
            !p.swimming && p.weapon !== 'unarmed' && !p.meleeAction && (!!p.firing || !!p.aiming),
          aim: p.aimTarget
            ? Math.atan2(
                p.aimTarget.z - ((p.z || 0) + 13),
                Math.max(1, Math.hypot(p.aimTarget.x - p.x, p.aimTarget.y - p.y)),
              )
            : 0,
          attack: p.swimming ? undefined : meleeAnimation(p.meleeAction),
          air: (p.z || 0) - (p.groundZ || 0) > 3 && !p.traversal,
          climb: p.traversal?.kind === 'climb',
          stance:
            !p.swimming && p.weapon === 'unarmed' && (p.defending || p.meleeAction)
              ? 'guard'
              : undefined,
          pose: p.swimming
            ? 'cast'
            : p.health <= 0
              ? 'down'
              : p.surrendering
                ? 'cheer'
                : p.defending
                  ? 'block'
                  : p.crouching
                    ? 'crouch'
                    : undefined,
        });
        if (p.swimming) {
          r.groundDisc(p.x, p.y, 8, '#536f67', 0.25);
          r.groundRing(p.x, p.y, 11 + Math.sin(game.real * 4) * 1.5, '#adc6b5', 0.4);
        } else r.shadow(p.x, p.y, 8, 0.35, '#142820', p.groundZ || 0);
        r.actor(
          p.x,
          p.y,
          p.z || 0,
          (g, ox, oy) => {
            if (p.swimming) {
              // Sink the waist below a hard pixel waterline; arm strokes remain above it.
              g.save();
              g.beginPath();
              g.rect(0, 0, g.canvas.width, Math.max(0, Math.round(oy + 1)));
              g.clip();
              hero.draw(g, ox, oy - r.view.bz * 18, r.view);
              g.restore();
              E.px.reset(g);
              const c = Math.cos(p.angle),
                s = Math.sin(p.angle),
                project = (x, y, z) => {
                  const q = r.view.p(x * c - y * s, x * s + y * c, z);
                  return [ox + q[0], oy + q[1]];
                };
              for (const side of [-1, 1]) {
                const stroke = Math.sin(game.real * 5 + (side * Math.PI) / 2),
                  shoulder = project(0, side * 5, 3),
                  elbow = project(4 + stroke * 6, side * 10, 2),
                  hand = project(8 + stroke * 7, side * (12 - stroke * 3), 1);
                E.px.line(g, ...shoulder, ...elbow, '#bc927b', 3);
                E.px.line(g, ...elbow, ...hand, '#c5a28a', 2);
              }
            } else hero.draw(g, ox, oy, r.view);
            if (!p.swimming && !p.surrendering && p.health > 0)
              drawActorEquipment(
                g,
                ox,
                oy,
                hero,
                r.view,
                p.weapon,
                p.heldObject?.material || 'metal',
              );
          },
          {
            outlineColor: '#15291f',
          },
        );
      }
      for (const bullet of state.bullets.filter(shouldDrawActor))
        r.queue(bullet.x, bullet.y, bullet.z || 12, (g) => {
          E.px.line(
            g,
            ...r.w(bullet.x, bullet.y, bullet.z || 12),
            ...r.w(bullet.x - bullet.vx * 0.015, bullet.y - bullet.vy * 0.015, bullet.z || 12),
            '#e8d398',
            2,
          );
        });
      for (const obstacle of underground ? [] : world.obstacles || []) {
        const z = obstacle.z ?? 0;
        if (obstacle.render === false || !r.visible(obstacle.x, obstacle.y, z, 60, 90, 90))
          continue;
        r.queue(obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2, z, (g) => {
          r.box(
            g,
            obstacle.x,
            obstacle.y,
            z,
            obstacle.x + obstacle.w,
            obstacle.y + obstacle.h,
            z + obstacle.height,
            obstacle.color || '#7e8b75',
            '#596b5d',
          );
          E.px.line(
            g,
            ...r.w(obstacle.x, obstacle.y, z + obstacle.height + 1),
            ...r.w(obstacle.x + obstacle.w, obstacle.y, z + obstacle.height + 1),
            '#c4c7a2',
          );
        });
      }
      for (const pickup of state.pickups || []) {
        if (
          !pickup.available ||
          !shouldDrawActor(pickup) ||
          !r.visible(pickup.x, pickup.y, pickup.z || 0, 35, 55, 55)
        )
          continue;
        r.groundRing(pickup.x, pickup.y, 9, '#b5c59b', 0.45, pickup.z || 0);
        r.queue(pickup.x, pickup.y, (pickup.z || 0) + 3, (g) => drawStreetEquipment(g, r, pickup));
      }
      for (const item of state.ordnance || []) {
        if (!shouldDrawActor(item) || !r.visible(item.x, item.y, item.z || 0, 35, 55, 55)) continue;
        r.shadow(
          item.x,
          item.y,
          item.kind === 'rocket' ? 5 : 3,
          0.22,
          '#18251a',
          item.groundZ || 0,
        );
        r.queue(item.x, item.y, item.z || 0, (g) => {
          const q = r.w(item.x, item.y, item.z || 0);
          if (item.kind === 'rocket') {
            const back = r.w(item.x - item.vx * 0.023, item.y - item.vy * 0.023, item.z || 0);
            E.px.line(g, ...q, ...back, '#e8c68e', 3);
            r.glowDisc(g, back[0], back[1], 5, '#da8158', 0.25);
          } else {
            E.px.ell(
              g,
              q[0],
              q[1],
              3,
              item.kind === 'molotov' ? 5 : 3,
              item.kind === 'molotov' ? '#7b9a68' : '#a0ad7d',
            );
            if (item.fuse !== null) E.px.dot(g, q[0] + 2, q[1] - 3, '#e3c36d');
          }
        });
      }
      for (const fire of state.fires || []) {
        if (!shouldDrawActor(fire) || !r.visible(fire.x, fire.y, fire.z || 0, 80, 100, 100))
          continue;
        r.groundDisc(fire.x, fire.y, fire.radius, '#a67435', 0.3, fire.z || 0);
        r.queue(fire.x, fire.y, fire.z || 0, (g) => {
          for (let i = 0; i < 18; i++) {
            const angle = i * 2.4,
              radius = fire.radius * hash(`${fire.id}:${i}`),
              x = fire.x + Math.cos(angle) * radius,
              y = fire.y + Math.sin(angle) * radius;
            const q = r.w(x, y, (fire.z || 0) + 1),
              height = 7 + Math.sin(game.real * 8 + i) * 4;
            E.px.poly(
              g,
              [
                [q[0] - 3, q[1]],
                [q[0], q[1] - height],
                [q[0] + 3, q[1]],
              ],
              i % 3 ? '#c99042' : '#e3c279',
            );
          }
        });
      }
      const target = state.waypoint || state.mission?.target;
      if (target && !title && shouldDrawActor(target)) {
        r.groundRing(target.x, target.y, target.radius || 22, '#e7c875', 0.7, target.z || 0);
        r.groundRing(
          target.x,
          target.y,
          (target.radius || 22) + 3 + Math.sin(game.time * 3) * 2,
          '#e7c875',
          0.35,
          target.z || 0,
        );
        if (r.visible(target.x, target.y, target.z || 0, 30, 80, 50))
          r.queue(target.x, target.y, target.z || 0, (g) => {
            const p = r.w(target.x, target.y, (target.z || 0) + 28 + Math.sin(game.time * 3) * 2);
            E.px.poly(
              g,
              [
                [p[0] - 5, p[1] - 6],
                [p[0] + 5, p[1] - 6],
                [p[0], p[1]],
              ],
              '#f1d786',
            );
          });
      }
      if (rain && !underground)
        r.overlay((g) => {
          g.globalAlpha = 0.23;
          for (let i = 0; i < 95; i++) {
            const x = (hash(i) * r.W + game.real * 16) % r.W,
              y = (hash(i + 191) * r.H + game.real * (180 + hash(i) * 100)) % r.H;
            E.px.line(g, x, y, x - 2, y + 6, '#b1c8bf');
          }
          g.globalAlpha = 1;
        });
    },
  };
}
