/* Original articulated equipment silhouettes; all geometry uses my-3d2dge pixels. */
const E = globalThis.My3D2dge;

const MODELS = {
  club: { kind: 'club', length: 20, color: '#8c6e43' },
  knife: { kind: 'knife', length: 8, color: '#c8c7b7' },
  pistol: { kind: 'gun', length: 7, receiver: 5, width: 1.7, color: '#505b57', grip: '#322f29' },
  'combat-pistol': {
    kind: 'gun',
    length: 9,
    receiver: 7,
    width: 2,
    color: '#999e91',
    grip: '#41332b',
  },
  shotgun: {
    kind: 'gun',
    length: 19,
    receiver: 7,
    width: 1.9,
    stock: 6,
    color: '#52635b',
    wood: '#8c6842',
    pump: true,
  },
  'combat-shotgun': {
    kind: 'gun',
    length: 17,
    receiver: 8,
    width: 2.4,
    stock: 5,
    color: '#54645b',
    wood: '#414a40',
    magazine: 3,
  },
  smg: {
    kind: 'gun',
    length: 9,
    receiver: 6,
    width: 2.4,
    color: '#647466',
    grip: '#394638',
    magazine: 5,
  },
  'full-smg': {
    kind: 'gun',
    length: 13,
    receiver: 8,
    width: 2.1,
    stock: 4,
    color: '#48574d',
    grip: '#323d35',
    magazine: 4,
  },
  'assault-rifle': {
    kind: 'gun',
    length: 19,
    receiver: 8,
    width: 2,
    stock: 6,
    color: '#4f6054',
    wood: '#8d6842',
    magazine: 5,
  },
  carbine: {
    kind: 'gun',
    length: 16,
    receiver: 8,
    width: 1.8,
    stock: 5,
    color: '#536562',
    wood: '#384842',
    magazine: 4,
    rail: true,
  },
  sniper: {
    kind: 'gun',
    length: 23,
    receiver: 8,
    width: 1.7,
    stock: 7,
    color: '#536550',
    wood: '#967348',
    scope: 6,
  },
  'combat-sniper': {
    kind: 'gun',
    length: 21,
    receiver: 9,
    width: 2.1,
    stock: 6,
    color: '#475c51',
    wood: '#36473b',
    scope: 7,
    magazine: 3,
  },
  rpg: { kind: 'launcher', length: 24, color: '#71805a' },
  grenade: { kind: 'grenade', length: 4, color: '#7f895d' },
  molotov: { kind: 'bottle', length: 7, color: '#6e987e' },
  'street-object': { kind: 'object', length: 5, color: '#a19d83' },
};

function drawModel(g, point, view, model, material) {
  const prism = (x0, x1, width, z0, z1, color) => {
    const corners = [
      [x0, -width],
      [x1, -width],
      [x1, width],
      [x0, width],
    ];
    for (let i = 0; i < 4; i++) {
      const a = corners[i],
        b = corners[(i + 1) % 4];
      E.px.poly(
        g,
        [point(...a, z0), point(...b, z0), point(...b, z1), point(...a, z1)],
        E.shade(color, i % 2 ? -0.26 : -0.1),
      );
    }
    E.px.poly(
      g,
      corners.map((q) => point(...q, z1)),
      E.shade(color, 0.18),
    );
  };
  const m = model;
  if (m.kind === 'club') {
    prism(-3, 3, 1, -1, 1, '#483c2c');
    prism(3, m.length, 1.7, -1.7, 1.7, m.color);
    for (let x = 8; x < m.length; x += 4)
      E.px.line(g, ...point(x, -1.8, 1.8), ...point(x, 1.8, 1.8), '#715334');
  } else if (m.kind === 'knife') {
    prism(-3, 1, 1.1, -0.7, 0.7, '#573f2c');
    E.px.poly(g, [point(1, -0.8, 0.3), point(m.length, 0, 0.3), point(1, 0.8, 0.3)], m.color);
    E.px.line(g, ...point(1, 0, 0.5), ...point(m.length, 0, 0.5), '#f2edde');
  } else if (m.kind === 'gun') {
    if (m.stock) prism(-m.stock, 0, 1.6, -1.2, 1.3, m.wood || m.color);
    prism(0, m.receiver, m.width, -1.2, 1.2, m.color);
    prism(m.receiver, m.length, 0.7, -0.6, 0.6, '#263a30');
    prism(1, 3, 1, -4, -0.8, m.grip || '#344235');
    if (m.magazine) prism(4, 6, 0.8, -m.magazine, -1, '#273d30');
    if (m.pump) prism(8, 12, 1.4, -1.4, 0.5, m.wood);
    if (m.scope) prism(1, 1 + m.scope, 0.8, 2.3, 3.8, '#243e32');
    if (m.rail) prism(1, 6, 0.6, 1.5, 2.6, '#788b77');
    const muzzle = point(m.length, 0, 0);
    E.px.dot(g, muzzle[0], muzzle[1], '#111f17');
  } else if (m.kind === 'launcher') {
    prism(-8, m.length, 2.5, -2.5, 2.5, m.color);
    prism(-10, -8, 3, -3, 3, '#43543a');
    prism(7, 13, 3, -3, 3, '#617645');
    prism(2, 4, 1, -5, -2, '#34462f');
    prism(3, 7, 0.6, 3, 4, '#c3c79b');
    E.px.line(g, ...point(m.length, -2.5, 2.5), ...point(m.length, 2.5, 2.5), '#d0cb9b');
  } else if (m.kind === 'grenade') {
    prism(-1, 3, 1.8, -2, 2, m.color);
    prism(0, 2, 0.7, 2, 3.5, '#c6c4a0');
    const p = point(2, 0, 4);
    E.px.rect(g, p[0], p[1], 2, 2, '#999c7f');
  } else if (m.kind === 'bottle' || material === 'glass') {
    prism(-1, 2, 1.3, -2, 3, m.color);
    prism(0, 1, 0.5, 3, 6, '#c6bc86');
    E.px.line(g, ...point(1, 0, 6), ...point(4, 0, 6), '#d9c593');
  } else if (material === 'stone') {
    E.px.poly(
      g,
      [point(-2, -2, 0), point(1, -2, 2), point(3, 1, 0), point(0, 2, -1), point(-2, 1, -1)],
      '#a5aa91',
    );
  } else {
    prism(-2, 4, 1, -1, 1, '#adb6a1');
    E.px.poly(
      g,
      [point(2, -2, 0), point(5, -2, 0), point(4, 0, 0), point(5, 2, 0), point(2, 2, 0)],
      '#c4c8af',
    );
  }
}

export function drawHeldWeapon(g, rig, view, weapon, material = 'metal') {
  const model = MODELS[weapon];
  if (!model || typeof rig.hand !== 'function' || !rig.J) return;
  const cv = E.charView(view),
    hand = rig.hand(),
    base = cv.p(hand[0] - rig.x, hand[1] - rig.y, hand[2] - rig.z);
  const angle = rig.facing + (rig._cheat || 0),
    c = Math.cos(angle),
    s = Math.sin(angle),
    direction = rig.J.bladeDir || [1, 0, 0],
    forward = [
      c * direction[0] - s * direction[1],
      s * direction[0] + c * direction[1],
      direction[2],
    ],
    horizontal = Math.hypot(forward[0], forward[1]) || 1,
    right = [-forward[1] / horizontal, forward[0] / horizontal, 0],
    up = [-forward[2] * right[1], forward[2] * right[0], horizontal],
    size = rig.o.size || 1;
  const point = (x, y, z) => {
    const p = cv.p(
      size * (forward[0] * x + right[0] * y + up[0] * z),
      size * (forward[1] * x + right[1] * y + up[1] * z),
      size * (forward[2] * x + right[2] * y + up[2] * z),
    );
    return [base[0] + p[0], base[1] + p[1]];
  };
  // The rig's actor origin is added by a lightweight context local projector.
  return { model, point, view: cv, material };
}

export function drawActorEquipment(g, ox, oy, rig, view, weapon, material = 'metal') {
  const prepared = drawHeldWeapon(g, rig, view, weapon, material);
  if (!prepared) return;
  const point = (x, y, z) => {
    const p = prepared.point(x, y, z);
    return [p[0] + ox, p[1] + oy];
  };
  drawModel(g, point, prepared.view, prepared.model, material);
}

export function drawStreetEquipment(g, r, pickup) {
  const model = MODELS[pickup.weapon];
  if (!model) return;
  const point = (x, y, z) => r.w(pickup.x + x, pickup.y + y, (pickup.z || 0) + 3 + z);
  drawModel(g, point, r.view, model, pickup.material || 'metal');
}

export function meleeAnimation(action) {
  if (!action) return null;
  const move =
    action.weapon === 'club'
      ? 'twohand'
      : action.weapon === 'knife'
        ? 'thrust'
        : action.kind === 'counter'
          ? 'cross'
          : action.kind === 'heavy'
            ? 'haymaker'
            : 'jab';
  const active = 0.13,
    elapsed = action.elapsed,
    phase =
      elapsed < action.windup ? 'windup' : elapsed < action.windup + active ? 'active' : 'recover';
  const duration =
    phase === 'windup'
      ? action.windup
      : phase === 'active'
        ? active
        : Math.max(0.08, action.duration - action.windup - active);
  const u =
    phase === 'windup'
      ? elapsed / duration
      : phase === 'active'
        ? (elapsed - action.windup) / duration
        : (elapsed - action.windup - active) / duration;
  return { phase, u: E.clamp(u, 0, 1), spec: E.MOVES[move] };
}

export function weaponSound(game, id, kind) {
  const spec = { wave: 'noise', freq: 130, to: 40, dur: 0.11, vol: 0.22 };
  if (kind === 'melee' || ['unarmed', 'club', 'knife'].includes(id)) {
    game.audio.sfx('swing', { vol: 0.25, pitch: id === 'club' ? 0.7 : 1.25 });
    return;
  }
  if (['grenade', 'molotov', 'street-object'].includes(id)) {
    game.audio.sfx('whoosh', { vol: 0.18, pitch: 0.8 });
    return;
  }
  if (id === 'rpg') {
    game.audio.sfx('laser', { vol: 0.2, pitch: 0.3 });
    game.audio.sfx('boom', { vol: 0.12 });
    return;
  }
  if (id.includes('shotgun')) {
    spec.freq = 75;
    spec.dur = 0.2;
    spec.vol = 0.3;
  } else if (id === 'sniper' || id === 'combat-sniper') {
    spec.freq = 110;
    spec.dur = 0.19;
    spec.vol = 0.32;
  } else if (id === 'smg' || id === 'full-smg') {
    spec.freq = 270;
    spec.dur = 0.075;
    spec.vol = 0.16;
  } else if (id === 'assault-rifle' || id === 'carbine') {
    spec.freq = 185;
    spec.dur = 0.1;
    spec.vol = 0.2;
  } else if (id === 'combat-pistol') {
    spec.freq = 100;
    spec.dur = 0.15;
    spec.vol = 0.28;
  }
  game.audio.sfx(spec);
}
