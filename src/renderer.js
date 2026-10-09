/* Original Harbor City architecture, vehicles and atmosphere, drawn by my-3d2dge. */
import { drawActorEquipment, drawStreetEquipment, meleeAnimation } from './weapon-art.js';
import { WEAPONS } from './combat.js';
const E = globalThis.My3D2dge;
const hash = (value) => {
  let h = 2166136261;
  for (const character of String(value)) h = Math.imul(h ^ character.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
};

export function createWorldRenderer(game, world, specs) {
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

  function cachedBuilding(building, view) {
    const key = `${building.id}:${view.yawDeg}:${view.pitchDeg}:${view.scale}`;
    if (buildings.has(key)) return buildings.get(key);
    const w = building.w,
      d = building.h,
      height = building.height || 70;
    const points = [
      [0, 0, 0],
      [w, 0, 0],
      [0, d, 0],
      [w, d, 0],
      [0, 0, height],
      [w, 0, height],
      [0, d, height],
      [w, d, height],
    ];
    const projected = points.map((p) => view.p(...p));
    const x0 = Math.floor(Math.min(...projected.map((p) => p[0]))) - 5;
    const y0 = Math.floor(Math.min(...projected.map((p) => p[1]))) - 12;
    const cv = E.mkCanvas(
      Math.ceil(Math.max(...projected.map((p) => p[0]))) - x0 + 6,
      Math.ceil(Math.max(...projected.map((p) => p[1]))) - y0 + 6,
    );
    const g = E.ctx2d(cv);
    const p = (x, y, z) => {
      const q = view.p(x, y, z);
      return [q[0] - x0, q[1] - y0];
    };
    const base = building.color || '#666556';
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
      for (let z = 14; z < height - 9; z += 15) {
        E.px.line(g, ...p(ax, ay, z - 4), ...p(bx, by, z - 4), E.shade(face.color, -0.12));
        for (let t = 7; t < face.size - 5; t += 12) {
          const u = t / face.size,
            u1 = Math.min(1, (t + 4) / face.size);
          const xa = ax + (bx - ax) * u,
            ya = ay + (by - ay) * u;
          const xb = ax + (bx - ax) * u1,
            yb = ay + (by - ay) * u1;
          const lit = hash(`${building.id}:${z}:${t}`) > 0.57;
          E.px.poly(
            g,
            [p(xa, ya, z), p(xb, yb, z), p(xb, yb, z + 7), p(xa, ya, z + 7)],
            lit ? '#c4ae76' : '#2b3a39',
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
    const result = { cv, x0, y0 };
    buildings.set(key, result);
    return result;
  }

  function drawBuilding(r, b, state) {
    const center = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    if (!r.visible(center.x, center.y, 0, 220, 250, 240)) return;
    const cache = cachedBuilding(b, r.view);
    r.queue(
      center.x,
      center.y,
      0,
      (g) => {
        const q = r.w(b.x, b.y, 0);
        const player = state.player;
        const screenPlayer = r.w(player.x, player.y, 12),
          screenBuilding = r.w(center.x, center.y, 0);
        const occluding =
          screenBuilding[1] > screenPlayer[1] &&
          Math.abs(screenPlayer[0] - screenBuilding[0]) < b.w * 0.75 &&
          Math.hypot(center.x - player.x, center.y - player.y) < 170;
        g.globalAlpha = occluding ? 0.36 : 1;
        g.drawImage(cache.cv, Math.round(q[0] + cache.x0), Math.round(q[1] + cache.y0));
        g.globalAlpha = 1;
      },
      { occluder: true },
    );
  }

  function drawVehicle(r, car, state) {
    if (!r.visible(car.x, car.y, 0, 60, 70, 70)) return;
    const spec = specs[car.spec] || specs.sedan;
    const L = (spec.length || 28) / 2,
      W = (spec.width || 14) / 2;
    const c = Math.cos(car.angle),
      s = Math.sin(car.angle);
    const point = (x, y, z) => r.w(car.x + x * c - y * s, car.y + x * s + y * c, z);
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
    r.shadow(car.x, car.y, L, 0.3, '#0b1716');
    r.queue(car.x, car.y, 0, (g) => {
      prism(g, L, W, 1, 3, '#17211e');
      for (const axle of [-L * 0.6, L * 0.6])
        for (const side of [-W, W]) {
          const q = point(axle, side, 2);
          E.px.rect(g, q[0] - 3, q[1] - 2, 6, 5, '#101915');
        }
      const color = car.color || '#9e9471';
      prism(g, L, W, 3, 7, color);
      prism(g, L * 0.46, W * 0.8, 7, 12, color, E.shade(color, 0.16));
      for (const x of [-L * 0.47, L * 0.47])
        E.px.poly(
          g,
          [
            point(x, -W * 0.77, 8),
            point(x, W * 0.77, 8),
            point(x * 0.7, W * 0.7, 11),
            point(x * 0.7, -W * 0.7, 11),
          ],
          '#46676a',
        );
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
    if (rigs.has(person.id)) return rigs.get(person.id);
    const palette = ['#4b6059', '#71634d', '#556573', '#8a6c55', '#514d4b'];
    const rig = new E.Humanoid({
      build: 'heroic',
      size: 0.78,
      weapon: null,
      outfit: type === 'pedestrian' ? 'coat' : 'shirt',
      sleeves: 'long',
      hat: type === 'police' ? 'cap' : null,
      colors: {
        skin: hash(person.id) > 0.5 ? '#c69b7c' : '#916f58',
        cloth:
          type === 'police' ? '#34474d' : palette[Math.floor(hash(person.id) * palette.length)],
        coat: palette[Math.floor(hash(person.id) * palette.length)],
        pants: '#323c38',
        boot: '#202b25',
        hair: '#35312a',
      },
    });
    rigs.set(person.id, rig);
    return rig;
  }

  function drawPerson(r, person, type, dt) {
    if (person.inVehicle) return;
    if (!r.visible(person.x, person.y, 0, 35, 50, 50)) return;
    const rig = rigFor(person, type);
    rig.update(dt, {
      x: person.x,
      y: person.y,
      z: person.z || 0,
      facing: person.angle || 0,
      vx: person.health > 0 ? person.vx || Math.cos(person.angle || 0) * (person.speed || 0) : 0,
      vy: person.health > 0 ? person.vy || Math.sin(person.angle || 0) * (person.speed || 0) : 0,
      pose: person.health <= 0 ? 'down' : person.crouching ? 'crouch' : undefined,
      point:
        type !== 'pedestrian' &&
        person.health > 0 &&
        WEAPONS[person.weapon]?.mode !== 'melee' &&
        !person.meleeAction,
      attack: meleeAnimation(person.meleeAction),
      stance: person.weapon === 'unarmed' ? 'guard' : undefined,
    });
    if (!person.z) r.shadow(person.x, person.y, 7, 0.3, '#14231e');
    r.actor(
      person.x,
      person.y,
      person.z || 0,
      (g, ox, oy) => {
        rig.draw(g, ox, oy, r.view);
        if (person.health > 0 && type !== 'pedestrian')
          drawActorEquipment(g, ox, oy, rig, r.view, person.weapon || 'pistol');
      },
      {
        outline: false,
        rim: false,
      },
    );
  }

  function drawPoliceAircraft(r, craft) {
    if (!r.visible(craft.x, craft.y, craft.z, 95, 100, 100)) return;
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
    for (const road of world.roads) {
      const vertical = road.x1 === road.x2;
      const length = Math.hypot(road.x2 - road.x1, road.y2 - road.y1);
      for (let distance = 105; distance < length; distance += 140) {
        const x = vertical ? road.x1 + road.width * 0.55 : road.x1 + distance;
        const y = vertical ? road.y1 + distance : road.y1 + road.width * 0.55;
        if (!r.visible(x, y, 0, 40, 100, 70)) continue;
        r.queue(x, y, 0, (g) => {
          const base = r.w(x, y, 0),
            top = r.w(x, y, 34),
            light = r.w(x - 8, y, 34);
          E.px.line(g, ...base, ...top, '#364e41', 2);
          E.px.line(g, ...top, ...light, '#364e41', 2);
          E.px.rect(g, light[0] - 2, light[1] - 1, 5, 2, '#dac68f');
          r.glowDisc(g, light[0], light[1], 6, '#c3a56d', 0.14);
        });
      }
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
          }[location.type] || '$',
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
    draw(r, state, { title = false, rain = true } = {}) {
      drawFloor(r);
      for (const b of world.buildings) drawBuilding(r, b, state);
      streetFurniture(r, state);
      for (const car of state.vehicles) drawVehicle(r, car, state);
      for (const person of state.pedestrians) drawPerson(r, person, 'pedestrian', 1 / 60);
      for (const person of state.police) drawPerson(r, person, 'police', 1 / 60);
      for (const person of state.hostiles) drawPerson(r, person, 'hostile', 1 / 60);
      for (const craft of state.policeAircraft || []) drawPoliceAircraft(r, craft);
      if (state.mission?.stageType === 'interact' && state.mission.target) {
        const t = state.mission.target;
        drawPerson(
          r,
          {
            id: `contact:${state.mission.id}:${state.mission.stage}`,
            x: t.x,
            y: t.y,
            angle: Math.PI / 2,
            health: 100,
          },
          'pedestrian',
          1 / 60,
        );
      }
      const p = state.player;
      if (!p.vehicleId) {
        hero.update(1 / 60, {
          x: p.x,
          y: p.y,
          z: p.z || 0,
          vz: p.vz || 0,
          facing: p.angle,
          vx: p.vx || Math.cos(p.angle) * (p.speed || 0),
          vy: p.vy || Math.sin(p.angle) * (p.speed || 0),
          point: p.weapon !== 'unarmed' && !p.meleeAction && (!!p.firing || !!p.aiming),
          aim: p.aimTarget
            ? Math.atan2(
                p.aimTarget.z - ((p.z || 0) + 13),
                Math.max(1, Math.hypot(p.aimTarget.x - p.x, p.aimTarget.y - p.y)),
              )
            : 0,
          attack: meleeAnimation(p.meleeAction),
          air: (p.z || 0) > 3 && !p.traversal,
          climb: p.traversal?.kind === 'climb',
          stance: p.weapon === 'unarmed' ? 'guard' : undefined,
          pose:
            p.health <= 0
              ? 'down'
              : p.surrendering
                ? 'cheer'
                : p.defending
                  ? 'block'
                  : p.crouching
                    ? 'crouch'
                    : undefined,
        });
        r.shadow(p.x, p.y, 8, 0.35, '#142820');
        r.actor(
          p.x,
          p.y,
          p.z || 0,
          (g, ox, oy) => {
            hero.draw(g, ox, oy, r.view);
            if (!p.surrendering && p.health > 0)
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
      for (const bullet of state.bullets)
        r.queue(bullet.x, bullet.y, bullet.z || 12, (g) => {
          E.px.line(
            g,
            ...r.w(bullet.x, bullet.y, bullet.z || 12),
            ...r.w(bullet.x - bullet.vx * 0.015, bullet.y - bullet.vy * 0.015, bullet.z || 12),
            '#e8d398',
            2,
          );
        });
      for (const obstacle of world.obstacles || []) {
        if (!r.visible(obstacle.x, obstacle.y, 0, 60, 90, 90)) continue;
        r.queue(obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2, 0, (g) => {
          r.box(
            g,
            obstacle.x,
            obstacle.y,
            0,
            obstacle.x + obstacle.w,
            obstacle.y + obstacle.h,
            obstacle.height,
            obstacle.color || '#7e8b75',
            '#596b5d',
          );
          E.px.line(
            g,
            ...r.w(obstacle.x, obstacle.y, obstacle.height + 1),
            ...r.w(obstacle.x + obstacle.w, obstacle.y, obstacle.height + 1),
            '#c4c7a2',
          );
        });
      }
      for (const pickup of state.pickups || []) {
        if (!pickup.available || !r.visible(pickup.x, pickup.y, 0, 35, 55, 55)) continue;
        r.groundRing(pickup.x, pickup.y, 9, '#b5c59b', 0.45);
        r.queue(pickup.x, pickup.y, 3, (g) => drawStreetEquipment(g, r, pickup));
      }
      for (const item of state.ordnance || []) {
        if (!r.visible(item.x, item.y, item.z || 0, 35, 55, 55)) continue;
        r.shadow(item.x, item.y, item.kind === 'rocket' ? 5 : 3, 0.22, '#18251a');
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
        if (!r.visible(fire.x, fire.y, 0, 80, 100, 100)) continue;
        r.groundDisc(fire.x, fire.y, fire.radius, '#a67435', 0.3);
        r.queue(fire.x, fire.y, 0, (g) => {
          for (let i = 0; i < 18; i++) {
            const angle = i * 2.4,
              radius = fire.radius * hash(`${fire.id}:${i}`),
              x = fire.x + Math.cos(angle) * radius,
              y = fire.y + Math.sin(angle) * radius;
            const q = r.w(x, y, 1),
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
      if (target && !title) {
        r.groundRing(target.x, target.y, target.radius || 22, '#e7c875', 0.7);
        r.groundRing(
          target.x,
          target.y,
          (target.radius || 22) + 3 + Math.sin(game.time * 3) * 2,
          '#e7c875',
          0.35,
        );
        if (r.visible(target.x, target.y, 0, 30, 80, 50))
          r.queue(target.x, target.y, 0, (g) => {
            const p = r.w(target.x, target.y, 28 + Math.sin(game.time * 3) * 2);
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
      if (rain)
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
