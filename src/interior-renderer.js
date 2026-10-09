/** Original cutaway rooms rendered with the same rigs and combat art as Harbor City. */
import { createWorldRenderer } from './renderer.js';
import { drawNightCrossingProps } from './campaign/scenes.js';
import {
  INTERIOR_LAYOUTS,
  interiorScene,
  interiorActors,
  nearestInteriorInteractable,
} from './interiors.js';

const E = globalThis.My3D2dge;
const sceneMatches = (item, roomId) =>
  item?.sceneId === roomId || (item?.scene?.kind === 'interior' && item.scene.id === roomId);
const unique = (items) => {
  const seen = new Set();
  return items.filter((item) => !seen.has(item.id) && seen.add(item.id));
};

/** Keep persisted entity references; exterior entities cannot appear merely because coordinates overlap. */
export function sceneRenderState(state) {
  const scene = interiorScene(state);
  if (!scene) return null;
  const roomId = scene.room.id;
  const canonicalIds = new Set((state.companions?.actors || []).map((actor) => actor.id));
  const matching = (items) => (items || []).filter((item) => sceneMatches(item, roomId));
  const people = unique([
    ...interiorActors(state).filter((actor) => !canonicalIds.has(actor.companionId)),
    ...matching(state.pedestrians),
    ...matching(state.police),
    ...matching(state.hostiles),
    ...matching(state.companions?.actors),
  ]);
  const mission = sceneMatches(state.mission?.target, roomId)
    ? {
        ...state.mission,
        // Room occupants are real persisted actors, never the exterior contact placeholder.
        stageType: state.mission.stageType === 'interact' ? 'room-target' : state.mission.stageType,
      }
    : null;
  return {
    ...state,
    vehicles: matching(state.vehicles).filter(
      (vehicle) => vehicle.id === state.interior.active.vehicleId,
    ),
    pedestrians: people.filter((person) => !['hostile', 'police'].includes(person.kind)),
    police: people.filter((person) => person.kind === 'police'),
    hostiles: people.filter((person) => person.kind === 'hostile'),
    policeAircraft: matching(state.policeAircraft),
    bullets: matching(state.bullets),
    ordnance: matching(state.ordnance),
    fires: matching(state.fires),
    pickups: matching(state.pickups),
    combatEffects: matching(state.combatEffects),
    mission,
    waypoint: sceneMatches(state.waypoint, roomId) ? state.waypoint : null,
  };
}

function rect(r, g, x, y, w, h, color, z = 0) {
  E.px.poly(g, [r.w(x, y, z), r.w(x + w, y, z), r.w(x + w, y + h, z), r.w(x, y + h, z)], color);
}
function line(r, g, a, b, color, thickness = 1) {
  E.px.line(g, ...r.w(...a), ...r.w(...b), color, thickness);
}
function bounds(r, item, z = 0) {
  const points = [];
  for (const x of [item.x, item.x + item.w])
    for (const y of [item.y, item.y + item.h])
      for (const height of [z, z + item.height]) points.push(r.w(x, y, height));
  return {
    left: Math.min(...points.map((point) => point[0])) - 2,
    right: Math.max(...points.map((point) => point[0])) + 2,
    top: Math.min(...points.map((point) => point[1])) - 2,
    bottom: Math.max(...points.map((point) => point[1])) + 2,
  };
}
function onScreen(r, box) {
  return box.right >= 0 && box.left < r.bw && box.bottom >= 0 && box.top < r.bh;
}
function pieces(volume, size = 32) {
  const horizontal = volume.w >= volume.h;
  const length = horizontal ? volume.w : volume.h;
  const count = Math.ceil(length / size);
  return Array.from({ length: count }, (_, index) => {
    const start = index * size;
    return {
      ...volume,
      x: volume.x + (horizontal ? start : 0),
      y: volume.y + (horizontal ? 0 : start),
      w: horizontal ? Math.min(size, length - start) : volume.w,
      h: horizontal ? volume.h : Math.min(size, length - start),
    };
  });
}
function nearWall(volume, view) {
  const normal = {
    'wall-west': [-1, 0],
    'wall-east': [1, 0],
    'wall-north': [0, -1],
    'wall-south-west': [0, 1],
    'wall-south-east': [0, 1],
  }[volume.id];
  return normal && normal[0] * view.fx + normal[1] * view.fy > 0.05;
}
function overlapsPlayer(r, box, player) {
  const foot = r.w(player.x, player.y, player.z || 0);
  const head = r.w(player.x, player.y, (player.z || 0) + 33);
  return (
    box.right > foot[0] - 11 &&
    box.left < foot[0] + 11 &&
    box.bottom > Math.min(foot[1], head[1]) &&
    box.top < Math.max(foot[1], head[1]) + 3
  );
}

function floorRegion(r, room, region) {
  const g = r.ctx;
  const timber = region.material.includes('timber');
  const lane = region.id.startsWith('lane-');
  const color = lane ? '#bca577' : timber ? '#857653' : E.shade(room.palette.floor, 0.07);
  rect(r, g, region.x, region.y, region.w, region.h, color, room.floorZ);
  if (timber) {
    for (let x = region.x + 10; x < region.x + region.w; x += 12)
      line(
        r,
        g,
        [x, region.y, room.floorZ],
        [x, region.y + region.h, room.floorZ],
        E.shade(color, -0.13),
      );
    for (let y = region.y + 38; y < region.y + region.h; y += 44)
      for (let x = region.x; x < region.x + region.w; x += 24)
        line(
          r,
          g,
          [x, y + (Math.round(x) % 2) * 10, room.floorZ],
          [Math.min(x + 12, region.x + region.w), y + (Math.round(x) % 2) * 10, room.floorZ],
          E.shade(color, -0.09),
        );
  } else if (region.material === 'oche-marking') {
    rect(r, g, region.x, region.y, region.w, region.h, '#c4b486', room.floorZ);
  } else {
    const step = region.material.includes('concrete') ? 40 : 24;
    for (let x = region.x + step; x < region.x + region.w; x += step)
      line(
        r,
        g,
        [x, region.y, room.floorZ],
        [x, region.y + region.h, room.floorZ],
        E.shade(color, -0.09),
      );
    for (let y = region.y + step; y < region.y + region.h; y += step)
      line(
        r,
        g,
        [region.x, y, room.floorZ],
        [region.x + region.w, y, room.floorZ],
        E.shade(color, -0.09),
      );
  }
  if (lane) {
    const center = region.x + region.w / 2;
    for (let offset = -2; offset <= 2; offset++) {
      const x = center + offset * 10;
      E.px.poly(
        g,
        [
          r.w(x - 2, region.y + region.h - 45, room.floorZ),
          r.w(x + 2, region.y + region.h - 45, room.floorZ),
          r.w(x, region.y + region.h - 49, room.floorZ),
        ],
        '#6b7855',
      );
    }
    // Rack spots identify the bowling lane; actual match pins belong to the activity state.
    for (let row = 0; row < 4; row++)
      for (let index = 0; index <= row; index++) {
        const x = center + (index - row / 2) * 10;
        const point = r.w(x, region.y + 26 + row * 9, room.floorZ);
        E.px.disc(g, point[0], point[1], 1.5, '#e6ddba');
      }
  }
}
function staticFloor(r, room) {
  rect(r, r.ctx, 0, 0, room.width, room.height, room.palette.floor, room.floorZ);
  for (const region of room.floorRegions) floorRegion(r, room, region);
  if (room.id === 'saira-garage') {
    for (const x of [60, 156])
      line(r, r.ctx, [x, 40, room.floorZ], [x, 264, room.floorZ], '#b7ba7f', 2);
    for (let y = 70; y < 250; y += 36)
      line(r, r.ctx, [64, y, room.floorZ], [74, y + 7, room.floorZ], '#99a278', 2);
    rect(r, r.ctx, 86, 145, 43, 55, '#61705b', room.floorZ);
  } else if (room.id === 'voss-dispatch') {
    rect(r, r.ctx, 128, 180, 70, 36, '#7a7858', room.floorZ);
    for (let x = 131; x < 194; x += 8)
      line(r, r.ctx, [x, 183, room.floorZ], [x, 213, room.floorZ], '#8f8c66');
  } else if (room.id === 'lantern-bar') {
    rect(r, r.ctx, 35, 199, 63, 27, '#776b4d', room.floorZ);
  }
}
function compatible(r) {
  let transform;
  try {
    transform = r.ctx.getTransform?.();
  } catch {
    return false;
  }
  return (
    Number.isInteger(r.ix) &&
    Number.isInteger(r.iy) &&
    transform &&
    transform.a === 1 &&
    transform.b === 0 &&
    transform.c === 0 &&
    transform.d === 1 &&
    transform.e === 0 &&
    transform.f === 0 &&
    r.ctx.globalAlpha === 1 &&
    r.ctx.globalCompositeOperation === 'source-over' &&
    !r.ctx._info &&
    !r.ctx._cover &&
    !r.ctx.shadowBlur &&
    !r.ctx.shadowOffsetX &&
    !r.ctx.shadowOffsetY &&
    (!r.ctx.filter || r.ctx.filter === 'none')
  );
}
const viewKey = (view) => [view.ax, view.ay, view.bx, view.by, view.bz].join(':');

function propDetails(r, g, room, item, health) {
  const z = room.floorZ + item.height;
  const side = item.y + item.h;
  const pale = E.shade(item.color, 0.2);
  if (item.type === 'bed') {
    rect(r, g, item.x + 3, item.y + 3, item.w - 6, item.h - 6, '#c0bca0', z + 0.1);
    rect(r, g, item.x + 6, item.y + 5, item.w - 12, 17, '#d4d1b3', z + 0.2);
    rect(
      r,
      g,
      item.x + 3,
      item.y + 27,
      item.w - 6,
      item.h - 30,
      item.id.startsWith('spare') ? '#7d9279' : '#8b9a7b',
      z + 0.2,
    );
    for (let y = item.y + 34; y < side - 5; y += 11)
      line(r, g, [item.x + 4, y, z + 0.3], [item.x + item.w - 4, y, z + 0.3], '#b0b78d');
    line(
      r,
      g,
      [item.x, item.y, room.floorZ + 16],
      [item.x + item.w, item.y, room.floorZ + 16],
      '#5a6954',
      3,
    );
  } else if (item.type === 'kettle-table') {
    rect(r, g, item.x + 5, item.y + 4, 21, 15, '#d7cca1', z + 0.1);
    r.box(g, item.x + 33, item.y + 5, z, item.x + 43, item.y + 15, z + 7, '#b5bfa3', '#677f72');
    line(r, g, [item.x + 43, item.y + 8, z + 3], [item.x + 48, item.y + 6, z + 3], '#afbea2', 2);
    line(r, g, [item.x + 33, item.y + 8, z + 4], [item.x + 29, item.y + 9, z + 4], '#4b6150', 2);
    for (const x of [item.x + 10, item.x + 20]) {
      const p = r.w(x, item.y + 12, z + 1);
      E.px.disc(g, p[0], p[1], 3, '#b5a269');
      E.px.disc(g, p[0], p[1], 1, '#69673f');
    }
  } else if (item.type === 'wardrobe') {
    line(
      r,
      g,
      [item.x + item.w / 2, side, z - 2],
      [item.x + item.w / 2, side, room.floorZ + 3],
      '#4d604b',
    );
    for (const x of [item.x + item.w / 2 - 3, item.x + item.w / 2 + 3])
      line(r, g, [x, side, room.floorZ + 22], [x, side, room.floorZ + 27], '#c6bb87', 2);
    rect(r, g, item.x + 3, item.y + 3, item.w - 6, item.h - 6, '#949b7c', z + 0.1);
  } else if (item.type === 'ledger-desk') {
    rect(r, g, item.x + 6, item.y + 4, 27, 16, '#486653', z + 0.1);
    rect(r, g, item.x + 8, item.y + 5, 23, 13, '#d6c69b', z + 0.2);
    line(r, g, [item.x + 19, item.y + 5, z + 0.3], [item.x + 19, item.y + 18, z + 0.3], '#9c8c63');
    for (let y = item.y + 8; y < item.y + 17; y += 3)
      line(r, g, [item.x + 10, y, z + 0.3], [item.x + 16, y, z + 0.3], '#777a56');
    line(
      r,
      g,
      [item.x + 35, item.y + 5, z + 0.3],
      [item.x + 30, item.y + 18, z + 0.3],
      '#324b3d',
      2,
    );
  } else if (item.type === 'shelter-desk') {
    rect(r, g, item.x + 4, item.y + 3, 22, 12, '#b8c5a5', z + 0.1);
    for (let y = item.y + 6; y < item.y + 14; y += 3)
      line(r, g, [item.x + 7, y, z + 0.2], [item.x + 21, y, z + 0.2], '#607860');
    rect(r, g, item.x + 19, item.y + 2, 5, 5, '#bdab76', z + 0.3);
  } else if (item.type === 'key-rack') {
    for (const x of [item.x + 4, item.x + 12]) {
      const p = r.w(x, side, z - 12);
      E.px.disc(g, p[0], p[1], 2, '#d8c184');
      line(r, g, [x, side, z - 12], [x, side, z - 18], '#d8c184', 2);
    }
  } else if (item.type === 'wash-basin') {
    rect(r, g, item.x + 4, item.y + 2, item.w - 8, item.h - 4, '#cad1b4', z + 0.1);
    rect(r, g, item.x + 8, item.y + 3, item.w - 16, item.h - 6, '#6d8d81', z + 0.2);
    line(
      r,
      g,
      [item.x + item.w / 2, item.y, z],
      [item.x + item.w / 2, item.y + 4, z + 5],
      '#bdc8aa',
      2,
    );
  } else if (['desk', 'workbench', 'table', 'counter', 'bar-counter'].includes(item.type)) {
    line(r, g, [item.x + 2, side, z - 4], [item.x + item.w - 2, side, z - 4], '#495747');
    if (room.id === 'voss-dispatch' && item.type === 'desk') {
      rect(r, g, item.x + 8, item.y + 5, 19, 12, '#d1caa1', z + 0.1);
      rect(r, g, item.x + 35, item.y + 4, 13, 9, '#a5ad89', z + 0.1);
      for (let y = 8; y < 16; y += 3)
        line(
          r,
          g,
          [item.x + 11, item.y + y, z + 0.2],
          [item.x + 23, item.y + y, z + 0.2],
          '#7c8669',
        );
    } else {
      for (let x = item.x + 8; x < item.x + item.w - 7; x += 18)
        rect(
          r,
          g,
          x,
          item.y + 5,
          7,
          Math.min(8, item.h - 7),
          room.id === 'lantern-bar' ? '#a5a174' : pale,
          z + 0.1,
        );
    }
  } else if (['shelf', 'cabinet', 'tool-cart'].includes(item.type)) {
    for (let shelf = 9; shelf < item.height; shelf += 12) {
      line(
        r,
        g,
        [item.x + 2, side, room.floorZ + shelf],
        [item.x + item.w - 2, side, room.floorZ + shelf],
        pale,
      );
      for (let x = item.x + 5; x < item.x + item.w - 2; x += 8)
        line(
          r,
          g,
          [x, side, room.floorZ + shelf + 1],
          [x, side, Math.min(z - 2, room.floorZ + shelf + 7)],
          x % 3 ? '#9b9c73' : '#566e63',
          2,
        );
    }
  } else if (item.type === 'lift-post') {
    for (let height = 8; height < item.height - 2; height += 12)
      E.px.poly(
        g,
        [
          r.w(item.x, side, room.floorZ + height),
          r.w(item.x + item.w, side, room.floorZ + height),
          r.w(item.x + item.w, side, room.floorZ + height + 4),
          r.w(item.x, side, room.floorZ + height + 4),
        ],
        '#d1bd6a',
      );
  } else if (['bench', 'sofa', 'booth'].includes(item.type)) {
    rect(r, g, item.x + 3, item.y + 3, item.w - 6, item.h - 6, pale, z + 0.1);
    for (let x = item.x + item.w / 3; x < item.x + item.w - 4; x += item.w / 3)
      line(r, g, [x, item.y + 3, z + 0.2], [x, side - 3, z + 0.2], '#53634a');
  } else if (item.type === 'lane-divider') {
    line(r, g, [item.x + item.w / 2, item.y, z], [item.x + item.w / 2, side, z], '#c8c49b', 2);
  }
  if (health < item.health)
    line(
      r,
      g,
      [item.x + 3, item.y + 2, z + 0.2],
      [item.x + Math.min(item.w - 3, 17), item.y + Math.min(item.h - 2, 9), z + 0.2],
      '#3b4a37',
    );
}

function wallArt(r, g, room, piece) {
  if (
    room.id === 'lantern-bar' &&
    piece.id === 'wall-east' &&
    piece.y <= 130 &&
    piece.y + piece.h > 130
  ) {
    for (const [radius, color] of [
      [13, '#dbceb0'],
      [11, '#354e42'],
      [8, '#9c674d'],
      [4, '#c9bc82'],
    ]) {
      const points = [];
      for (let index = 0; index < 24; index++) {
        const angle = (index * Math.PI) / 12;
        points.push(
          r.w(room.width - 10, 130 + Math.cos(angle) * radius, 39 + Math.sin(angle) * radius),
        );
      }
      E.px.poly(g, points, color);
    }
  }
}

function drawScenery(r, state, room, game, stats) {
  const saved = state.interior.rooms[room.id];
  stats.wallPieces = 0;
  stats.props = 0;
  stats.doors = 0;
  stats.lights = 0;
  stats.markers = 0;
  for (const wall of room.walls) {
    for (const piece of pieces(wall)) {
      const box = bounds(r, piece, room.floorZ);
      if (!onScreen(r, box)) continue;
      const ghost = nearWall(wall, r.view) || overlapsPlayer(r, box, state.player);
      r.queue(
        piece.x + piece.w / 2,
        piece.y + piece.h / 2,
        room.floorZ,
        (g) => {
          const alpha = g.globalAlpha;
          if (!g._info && !g._cover && ghost) g.globalAlpha *= 0.25;
          r.box(
            g,
            piece.x,
            piece.y,
            room.floorZ,
            piece.x + piece.w,
            piece.y + piece.h,
            room.floorZ + piece.height,
            E.shade(room.palette.wall, 0.13),
            room.palette.wall,
          );
          line(
            r,
            g,
            [piece.x, piece.y + piece.h, room.floorZ + 20],
            [piece.x + piece.w, piece.y + piece.h, room.floorZ + 20],
            '#a4a58a',
          );
          g.globalAlpha = alpha;
          wallArt(r, g, room, piece);
        },
        { occluder: true, box: [box.left, box.top, box.right, box.bottom] },
      );
      stats.wallPieces++;
    }
  }
  const sign = {
    'voss-dispatch': 'VOSS DISPATCH',
    'saira-garage': 'SAIRA SERVICE',
    'lantern-bar': 'THE LANTERN',
    'blue-hour-lanes': 'BLUE HOUR LANES',
    'dockside-rooms': 'DOCKSIDE ROOMS',
  }[room.id];
  const signX = room.width / 2,
    signY = 11,
    signZ = room.floorZ + 46;
  if (r.visible(signX, signY, signZ, 90, 50, 50))
    r.queue(
      signX,
      signY,
      signZ,
      (g) => {
        const point = r.w(signX, signY, signZ);
        E.font.text(g, sign, point[0], point[1], '#e4d3a4', {
          align: 'center',
          font: 'tiny',
          outline: '#344b3b',
        });
      },
      {
        // A single plaque spans several wall pieces; neighboring pieces must finish before it.
        bias:
          20 +
          ((E.font.width(sign, { font: 'tiny' }) / Math.max(0.2, r.view.scale)) *
            Math.abs(r.view.fx)) /
            2,
        noInfo: true,
      },
    );
  for (const door of room.doors) {
    const box = bounds(r, door, room.floorZ);
    if (!onScreen(r, box)) continue;
    const current = saved.doors[door.id];
    const ghost = overlapsPlayer(r, box, state.player);
    r.queue(
      door.x + door.w / 2,
      door.y + door.h / 2,
      room.floorZ,
      (g) => {
        const alpha = g.globalAlpha;
        if (!current.open) {
          if (!g._info && !g._cover && ghost) g.globalAlpha *= 0.25;
          r.box(
            g,
            door.x,
            door.y,
            room.floorZ,
            door.x + door.w,
            door.y + door.h,
            room.floorZ + door.height,
            current.locked ? '#876d51' : '#8e8760',
            '#615f48',
          );
          if (door.w >= door.h)
            for (let x = door.x + 7; x < door.x + door.w; x += 12)
              line(
                r,
                g,
                [x, door.y + door.h, room.floorZ + 4],
                [x, door.y + door.h, room.floorZ + door.height - 4],
                '#afa779',
              );
          else
            for (let y = door.y + 7; y < door.y + door.h; y += 12)
              line(
                r,
                g,
                [door.x + door.w, y, room.floorZ + 4],
                [door.x + door.w, y, room.floorZ + door.height - 4],
                '#afa779',
              );
        }
        g.globalAlpha = alpha;
        // Doorway frame stays on the authored opening boundary; an open slab adds no fake collision.
        const horizontal = door.w >= door.h;
        const a = [door.x, door.y, room.floorZ],
          b = [door.x + (horizontal ? door.w : 0), door.y + (horizontal ? 0 : door.h), room.floorZ];
        line(r, g, a, [a[0], a[1], room.floorZ + door.height], '#c0b990', 2);
        line(r, g, b, [b[0], b[1], room.floorZ + door.height], '#c0b990', 2);
        line(
          r,
          g,
          [a[0], a[1], room.floorZ + door.height],
          [b[0], b[1], room.floorZ + door.height],
          '#c0b990',
          2,
        );
      },
      { occluder: !current.open, box: [box.left, box.top, box.right, box.bottom] },
    );
    stats.doors++;
  }
  for (const item of room.props) {
    const health = saved.props[item.id].health;
    const box = bounds(r, item, room.floorZ);
    if (health <= 0 || !onScreen(r, box)) continue;
    r.queue(
      item.x + item.w / 2,
      item.y + item.h / 2,
      room.floorZ,
      (g) => {
        const alpha = g.globalAlpha;
        if (!g._info && !g._cover && item.height >= 30 && overlapsPlayer(r, box, state.player))
          g.globalAlpha *= 0.4;
        r.box(
          g,
          item.x,
          item.y,
          room.floorZ,
          item.x + item.w,
          item.y + item.h,
          room.floorZ + item.height,
          E.shade(item.color, 0.12),
          E.shade(item.color, -0.08),
        );
        propDetails(r, g, room, item, health);
        g.globalAlpha = alpha;
      },
      { occluder: true, box: [box.left, box.top, box.right, box.bottom] },
    );
    stats.props++;
  }
  for (const light of room.lights) {
    if (!r.visible(light.x, light.y, light.z, 100, 100, 100)) continue;
    game.lights?.add(light.x, light.y, light.z, room.id === 'blue-hour-lanes' ? 125 : 100, 0.85, {
      color: light.color,
      shadow: true,
    });
    r.groundDisc(light.x, light.y, 43, light.color, 0.08, room.floorZ);
    r.queue(
      light.x,
      light.y,
      light.z,
      (g) => {
        line(r, g, [light.x, light.y, light.z], [light.x, light.y, room.floorZ + 72], '#70806c');
        const point = r.w(light.x, light.y, light.z);
        E.px.rect(g, point[0] - 5, point[1] - 2, 11, 3, '#596a58');
        E.px.rect(g, point[0] - 4, point[1], 9, 2, light.color);
        r.glowDisc(g, point[0], point[1] + 1, 7, light.color, 0.2);
      },
      { emissive: true },
    );
    stats.lights++;
  }
  const nearest = nearestInteriorInteractable(state);
  for (const hook of room.hooks) {
    if (!r.visible(hook.x, hook.y, room.floorZ, 30, 55, 35)) continue;
    const selected = nearest?.id === hook.id;
    const color =
      hook.type === 'activity' ? '#e6bd7d' : hook.type === 'home' ? '#9bcab0' : '#90c5ba';
    r.groundRing(hook.x, hook.y, selected ? 10 : 6, color, selected ? 0.65 : 0.28, room.floorZ);
    r.queue(
      hook.x,
      hook.y,
      room.floorZ + 2,
      (g) => {
        const point = r.w(hook.x, hook.y, room.floorZ + 20);
        const symbol =
          ({
            'shelter-food': 'F',
            'shelter-save': 'S',
            'shelter-rest': 'R',
            wardrobe: 'W',
            evidence: 'E',
          }[hook.type] ?? hook.type === 'activity')
            ? hook.activity === 'bowling'
              ? 'B'
              : 'D'
            : hook.type === 'home'
              ? 'H'
              : hook.type === 'job'
                ? 'T'
                : 'S';
        E.px.poly(
          g,
          [
            [point[0], point[1] - 6],
            [point[0] + 5, point[1] - 1],
            [point[0], point[1] + 4],
            [point[0] - 5, point[1] - 1],
          ],
          '#344b3d',
        );
        E.font.text(g, symbol, point[0], point[1] - 4, color, {
          align: 'center',
          font: 'tiny',
          outline: false,
        });
      },
      { emissive: selected },
    );
    stats.markers++;
  }
  for (const door of room.doors.filter((door) => door.exit)) {
    const x = door.x + door.w / 2,
      y = door.y - 13;
    if (!r.visible(x, y, room.floorZ, 30, 55, 35)) continue;
    const open = saved.doors[door.id].open;
    const color = open ? '#a8d2a6' : '#d4bd77';
    r.groundRing(x, y, 7, color, 0.42, room.floorZ);
    r.queue(x, y, room.floorZ + 1, (g) => {
      const point = r.w(x, y, room.floorZ + 17);
      E.font.text(g, open ? 'EXIT' : 'DOOR', point[0], point[1] - 4, color, {
        align: 'center',
        font: 'tiny',
        outline: '#243e32',
      });
    });
    stats.markers++;
  }
  drawNightCrossingProps(r, state, room.id);
}

export function createInteriorRenderer(game, specs, options = {}) {
  const limits = {
    maxRooms: 2,
    maxFloorPixels: 1_600_000,
    maxFloorDimension: 2048,
    maxRoomRigs: 24,
    ...options,
  };
  for (const key of ['maxRooms', 'maxFloorPixels', 'maxFloorDimension', 'maxRoomRigs'])
    if (!Number.isInteger(limits[key]) || limits[key] < 1)
      throw new Error('Invalid interior renderer cache bounds.');
  const rooms = new Map(),
    floors = new Map();
  let disposed = false;
  const stats = {
    frames: 0,
    roomId: null,
    cachedRooms: 0,
    createdRooms: 0,
    retiredRooms: 0,
    floorAtlases: 0,
    floorPixels: 0,
    builtFloors: 0,
    rigs: 0,
    wallPieces: 0,
    props: 0,
    doors: 0,
    lights: 0,
    markers: 0,
    actors: 0,
    vehicles: 0,
  };
  function releaseFloor(key) {
    const floor = floors.get(key);
    if (!floor) return;
    floor.canvas.width = 0;
    floor.canvas.height = 0;
    stats.floorPixels -= floor.pixels;
    floors.delete(key);
    stats.floorAtlases = floors.size;
  }
  function releaseRoom(roomId) {
    rooms.get(roomId)?.dispose();
    rooms.delete(roomId);
    for (const [key, floor] of floors) if (floor.roomId === roomId) releaseFloor(key);
    stats.cachedRooms = rooms.size;
    stats.retiredRooms++;
  }
  function floorAtlas(room, view) {
    const key = `${room.id}:${viewKey(view)}`;
    let floor = floors.get(key);
    if (floor) {
      floors.delete(key);
      floors.set(key, floor);
      return floor;
    }
    const corners = [
      [0, 0],
      [room.width, 0],
      [room.width, room.height],
      [0, room.height],
    ].map(([x, y]) => view.p(x, y, room.floorZ));
    const x0 = Math.floor(Math.min(...corners.map((point) => point[0]))) - 2,
      y0 = Math.floor(Math.min(...corners.map((point) => point[1]))) - 2;
    const width = Math.ceil(Math.max(...corners.map((point) => point[0]))) + 3 - x0,
      height = Math.ceil(Math.max(...corners.map((point) => point[1]))) + 3 - y0;
    const pixels = width * height;
    if (
      width > limits.maxFloorDimension ||
      height > limits.maxFloorDimension ||
      pixels > limits.maxFloorPixels
    )
      return null;
    const roomFloors = [...floors.entries()].filter(([, value]) => value.roomId === room.id);
    if (roomFloors.length >= 2) releaseFloor(roomFloors[0][0]);
    while (floors.size && stats.floorPixels + pixels > limits.maxFloorPixels)
      releaseFloor(floors.keys().next().value);
    let canvas;
    try {
      canvas = E.mkCanvas(width, height);
      const ctx = E.ctx2d(canvas);
      staticFloor(
        {
          ctx,
          view,
          ix: x0,
          iy: y0,
          w(x, y, z = 0) {
            const point = view.p(x, y, z);
            return [point[0] - x0, point[1] - y0];
          },
        },
        room,
      );
    } catch {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      return null;
    }
    floor = { roomId: room.id, canvas, x0, y0, pixels };
    floors.set(key, floor);
    stats.floorAtlases = floors.size;
    stats.floorPixels += pixels;
    stats.builtFloors++;
    return floor;
  }
  function drawGround(r, room) {
    E.px.rect(r.ctx, 0, 0, r.bw, r.bh, '#15251e');
    const floor = compatible(r) ? floorAtlas(room, r.view) : null;
    if (!floor) {
      staticFloor(r, room);
      return;
    }
    const vx = r.ix - floor.x0,
      vy = r.iy - floor.y0;
    const sx = Math.max(0, vx),
      sy = Math.max(0, vy);
    const width = Math.min(floor.canvas.width, vx + r.bw) - sx,
      height = Math.min(floor.canvas.height, vy + r.bh) - sy;
    if (width > 0 && height > 0)
      r.ctx.drawImage(floor.canvas, sx, sy, width, height, sx - vx, sy - vy, width, height);
  }
  function roomRenderer(room) {
    let renderer = rooms.get(room.id);
    if (renderer) {
      rooms.delete(room.id);
      rooms.set(room.id, renderer);
      return renderer;
    }
    if (rooms.size >= limits.maxRooms) releaseRoom(rooms.keys().next().value);
    const world = {
      width: room.width,
      height: room.height,
      buildings: [],
      roads: [],
      locations: [],
      districts: [],
      water: [],
      obstacles: [],
    };
    renderer = createWorldRenderer(game, world, specs, {
      maxRigs: limits.maxRoomRigs,
      rigIdleFrames: 120,
      maxBuildingTextures: 1,
      maxBuildingPixels: 1,
      drawGround: (r) => drawGround(r, room),
      drawScenery: (r, state) => drawScenery(r, state, room, game, stats),
    });
    rooms.set(room.id, renderer);
    stats.cachedRooms = rooms.size;
    stats.createdRooms++;
    return renderer;
  }
  return {
    stats,
    draw(r, state, drawOptions = {}) {
      if (disposed) throw new Error('The interior renderer has been disposed.');
      const filtered = sceneRenderState(state);
      if (!filtered) return false;
      const room = INTERIOR_LAYOUTS[state.interior.active.roomId];
      stats.roomId = room.id;
      stats.frames++;
      stats.actors =
        filtered.pedestrians.length + filtered.hostiles.length + filtered.police.length;
      stats.vehicles = filtered.vehicles.length;
      roomRenderer(room).draw(r, filtered, { ...drawOptions, rain: false });
      stats.rigs = [...rooms.values()].reduce((total, renderer) => total + renderer.stats.rigs, 0);
      return true;
    },
    dispose() {
      for (const roomId of [...rooms.keys()]) releaseRoom(roomId);
      for (const key of [...floors.keys()]) releaseFloor(key);
      disposed = true;
      stats.rigs = 0;
      stats.roomId = null;
    },
  };
}
