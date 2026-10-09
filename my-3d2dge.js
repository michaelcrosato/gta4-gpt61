/*!
 * my-3D2dge v0.11.0  (My "3D" 2D Game Engine)
 * Procedural pixel-puppet engine for every 2D perspective.
 * https://github.com/michaelcrosato/my-3d2dge  (MIT License)
 *
 * READ THIS FIRST (humans and AI models extending a my-3D2dge game)
 * -----------------------------------------------------------------------------
 * 0. EVERY GAME STARTS WITH  const E = My3D2dge;  and then uses E.Game, E.px, ...
 * 1. WORLD SPACE IS 3D. x = east, y = south, z = up. One floor tile = 16 units.
 *    Game logic never thinks about screen pixels.
 * 2. A VIEW turns world points into screen pixels. Swap the view and the whole game
 *    re-renders from another angle: E.VIEWS.iso, .threequarter, .topdown,
 *    .brawler, .side  (or build your own: new E.View(id, label, yaw, pitch, scale, zBoost)).
 * 3. CHARACTERS ARE RIGS, NOT SPRITES. E.Humanoid and E.Blob recompute their
 *    joints from math every step, in 3D, then project them. That is why they move
 *    fluidly and can face any angle in any view without extra art. Small things
 *    (coins, bullets, icons) can be pixel sprites written as strings: E.sprite().
 * 4. PIXEL RULES. Draw with E.px (rect, line, disc, ell, poly, sprite...). Every shape
 *    snaps to whole pixels. Never use ctx.arc / ctx.stroke / ctx.fillText on the game
 *    buffer: they anti-alias and break the look. Translucency and glow go through
 *    px.blend / polyDither / ddisc / r.glowDisc: stepped alpha and blend modes like PS1
 *    hardware (E.style.trans = 'dither' switches to NES / Genesis style dithering).
 * 5. FRAME ORDER (handled by the Renderer):
 *      background (r.sky, map.drawFloor or level.draw) -> decals (ground marks, shadows)
 *      -> sorted queue (walls, props, actors, particles) -> lighting -> overlays -> present
 *    Anything that can be in front of or behind something else goes through
 *    r.queue(x, y, z, fn), r.actor(x, y, z, drawFn, opts) or r.sprite(...).
 * 6. TIME. game.start({ update(dt), draw(r) }) or game.start({ scenes, scene }).
 *    update runs in fixed ~1/120 s substeps, so motion is identical at 60, 120 or
 *    144 Hz. game.freeze(s) = hit-stop, game.shake(n) = screen shake,
 *    game.timeScale = slow motion, game.paused = pause, game.after(s, fn) = timer.
 * 7. LEVELS. Top-down / isometric / brawler floors: E.TileMap (walls on the ground
 *    plane). Side-scrollers: E.PlatformMap + E.Platformer (tiles on the x/z plane,
 *    solid, one-way, ladders, hazards, moving platforms). Both read ASCII rows.
 * 8. SOUND, TEXT, MENUS. game.audio.sfx('jump'), game.audio.music(song);
 *    E.font.text(...) (5x7 proportional font), E.font.title(...), E.ui.box/bar/hearts,
 *    new E.Dialog(game), new E.Menu(game, items).
 * 8b. LOOK. Aim for PS1 / N64 era 2D, not NES: HD rigs (size, outfit, hair, armor),
 *    new E.Backdrop('castle-night') behind levels, textured tiles (stone, brick, wood,
 *    metal), r.prop('torch', ...) set dressing, particles.explosion / smoke / fire,
 *    game.flash, and E.tones(hex) / E.ramp(hex) for hue-shifted shading.
 * 9. GPU LIGHTING is optional: game.enableGPU({ map }). Mark glowing things with
 *    px.glow(g, 1) inside queue callbacks, pass { color, shadow } to lights.add, and
 *    register shadow casters with game.lights.caster(). Falls back to Canvas lighting.
 * Errors in your game are shown on screen and in the console (game.errors).
 * The compact API card is API.md (also embedded in the single-file edition).
 * See AI_GUIDE.md in the repo for the full guide and recipes.
 * MORE, outside this file (github.com/michaelcrosato/my-3d2dge; search it and take only what a game needs, its files
 *    are large): 325 curated motion clips and 2,548 motion-capture takes as readable key poses that play on any
 *    Humanoid (src/mocap/: the catalogs list every clip's tags and description, tools/anim-set.mjs cuts the ones you
 *    want into a small set, src/mocap/mocap.js plays them), and Emberdeep (src/emberdeep/), a whole game of worked
 *    examples: monsters, bosses, heroes with bodies that are not people, skills. AI_GUIDE.md, "Where to find more",
 *    says how to search them and take what you need.
 */
(function (root) {
'use strict';

const TAU = Math.PI * 2, DEG = Math.PI / 180;
/** version: the release (package.json; node tools/version.mjs sets it everywhere). build: the commit this copy was built
 *  from, a placeholder in the repo that tools/stamp.mjs replaces when the site deploys (e.g. 'a1b2c3d 2026-10-07') */
const E = { version: '0.11.0', build: 'dev-build', name: 'my-3D2dge', TAU, DEG, current: null };
/** 'v0.7.0 · a1b2c3d 2026-10-07': the label to show on screens and in reports */
E.versionLabel = () => 'v' + E.version + ' · ' + E.build;
/** one console warning per distinct problem, prefixed so tools (and people) can spot engine advice */
const _warned = new Set();
const warn = (key, msg) => { if (_warned.has(key)) return; _warned.add(key); console.warn('my-3D2dge: ' + msg); };
E.warn = warn;

/* =============================================================================
 * 1. MATH
 * ============================================================================= */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (a, b, s) => a < b ? Math.min(b, a + s) : Math.max(b, a - s);
const ease = {
  outCubic: u => 1 - Math.pow(1 - u, 3),
  outQuad: u => 1 - (1 - u) * (1 - u),
  inQuad: u => u * u,
  inOut: u => u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2,
  outBack: u => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); }
};
const angDiff = (a, b) => ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const lerpAng = (a, b, t) => a + angDiff(a, b) * t;
const approachAng = (a, b, s) => { const d = angDiff(a, b); return Math.abs(d) <= s ? b : a + Math.sign(d) * s; };
function rng(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(x, y) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v);
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
const bayer = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
function smoothDamp(cur, target, vel, st, dt) {
  const om = 2 / st, x = om * dt, ex = 1 / (1 + x + .48 * x * x + .235 * x * x * x), ch = cur - target, tmp = (vel + om * ch) * dt;
  return [target + (ch + tmp) * ex, (vel - om * tmp) * ex];
}
/** '#rrggbb' or '#rgb' (or an [r, g, b] array) -> [r, g, b] */
const hex = h => {
  if (Array.isArray(h)) return h.slice(0, 3);
  let s = String(h).trim(); if (s[0] === '#') s = s.slice(1);
  if (s.length === 3 || s.length === 4) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s.slice(0, 6), 16);
  if (s.length < 6 || isNaN(n)) { warn('hex:' + h, 'color "' + h + '" is not a "#rrggbb" hex color; engine color helpers need hex (drawn magenta)'); return [255, 0, 255]; }
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
};
const toHex = c => '#' + c.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
/** shade('#336699', -0.3) darker, (+0.3) lighter. Hue-shifted like painted pixel art: darker drifts cool, lighter drifts warm */
const _shades = new Map();
const shade = (h, a) => {
  const key = h + '|' + a; let r = _shades.get(key); if (r) return r;
  const c = hex(h), flat = toHex(c.map(v => a < 0 ? v * (1 + a) : v + (255 - v) * a)), [hh, s, l] = toHsl(flat);
  r = s < .08 ? flat : hsl(hueToward(hh, a < 0 ? 250 : 55, Math.abs(a) * 24), s + (a < 0 ? .05 : -.05) * Math.min(1, Math.abs(a) * 3), l);
  if (_shades.size > 2000) _shades.clear(); _shades.set(key, r); return r;
};
const mix = (h1, h2, t) => { const a = hex(h1), b = hex(h2); return toHex(a.map((v, i) => lerp(v, b[i], t))); };
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const ctx2d = c => { const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return g; };
const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)],
  rz: (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; }
};
/** two-bone IK in 3D: returns [joint, end]. hint points the way the joint should bend. */
function ik3(a, b, L1, L2, hint) {
  let d = V3.sub(b, a), dist = V3.len(d);
  const max = L1 + L2 - .01;
  if (dist > max) { d = V3.mul(d, max / dist); b = V3.add(a, d); dist = max; }
  dist = Math.max(dist, .01);
  const n = V3.mul(d, 1 / dist);
  let h = V3.sub(hint, V3.mul(n, V3.dot(hint, n)));
  const hl = V3.len(h);
  h = hl < 1e-4 ? [n[1], -n[0], 0] : V3.mul(h, 1 / hl);
  const x = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist), y = Math.sqrt(Math.max(0, L1 * L1 - x * x));
  return [V3.add(V3.add(a, V3.mul(n, x)), V3.mul(h, y)), b];
}
/* ---- color ramps: hue-shifted shading, the way pixel artists shade (shadows cooler, highlights warmer) ---- */
function toHsl(h) {
  const [r, g, b] = hex(h).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1)); let hh;
  if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4;
  return [(hh * 60 + 360) % 360, s, l];
}
function hsl(hh, s, l) {
  s = clamp(s, 0, 1); l = clamp(l, 0, 1); hh = ((hh % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((hh / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}
const hueToward = (hh, target, amt) => { const d = ((target - hh + 540) % 360) - 180; return hh + clamp(d, -amt, amt); };
const _tones = new Map();
/**
 * five shades of a color for painted-looking pixel art: { deep, sh, base, lt, hi }.
 * Shadows drift toward blue-violet, highlights toward warm yellow (strength 0..2, default 1).
 */
function tones(c, strength = 1) {
  const key = c + ':' + strength; let t = _tones.get(key); if (t) return t;
  const [hh, s, l] = toHsl(c), k = strength, grey = s < .08;
  const f = (dl, dh, target, ds) => grey ? hsl(hh, s, l + dl * k) : hsl(hueToward(hh, target, dh * k), s + ds, l + dl * k);
  const skin = !grey && l > .62 && (hh < 50 || hh > 340);   // skin, sand, cream: shadows go dusky, not orange-red
  t = { deep: skin ? f(-.3, 22, 280, -.22) : f(-.3, 16, 250, .06), sh: skin ? f(-.14, 14, 280, -.16) : f(-.15, 9, 250, .05), base: c, lt: f(.1, 6, 50, -.02), hi: f(.24, 12, 55, -.08) };
  if (_tones.size > 600) _tones.clear();
  _tones.set(key, t); return t;
}
/** a ramp of n colors from dark to light around a base color (hue shifted), for palettes and gradients */
function ramp(c, n = 5, strength = 1) {
  const [hh, s, l] = toHsl(c), out = [];
  for (let i = 0; i < n; i++) { const u = n < 2 ? 0 : i / (n - 1) * 2 - 1; out.push(s < .08 ? hsl(hh, s, l + u * .3 * strength) : hsl(hueToward(hh, u < 0 ? 250 : 55, Math.abs(u) * 14 * strength), s + (u < 0 ? .06 : -.06) * Math.abs(u), l + u * .3 * strength)); }
  return out;
}
Object.assign(E, { toHsl, hsl, tones, ramp });

/* ---- small helpers games write over and over ---- */
/** rand() 0..1, rand(b) 0..b, rand(a, b) a..b */
const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
/** whole number from a to b, both included */
const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = list => list[(Math.random() * list.length) | 0];
const chance = p => Math.random() < p;
/** distance between two objects with x, y (and optional z) */
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
/** ground angle from a to b (radians, 0 = east, PI/2 = south) */
const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
/** circles on the ground plane: { x, y, r } */
const overlap = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y, r = (a.r || 0) + (b.r || 0); return dx * dx + dy * dy < r * r; };
/** side-view boxes: { x (center), z (feet), w, h } (the Platformer / PlatformMap convention) */
const overlapBox = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w && a.z < b.z + b.h && b.z < a.z + a.h;
/** melee cone on the ground: is b (with optional radius r) within range of a and within halfAngle of facing? */
const inArc = (a, facing, b, range, halfAngle) => { const dx = b.x - a.x, dy = b.y - a.y; return Math.hypot(dx, dy) <= range + (b.r || 0) && Math.abs(angDiff(facing, Math.atan2(dy, dx))) <= halfAngle; };
/** remove items in place: prune(bullets, b => b.dead) */
const prune = (list, fn) => { let j = 0; for (let i = 0; i < list.length; i++) if (!fn(list[i])) list[j++] = list[i]; list.length = j; return list; };
/** saved data that survives reloads (localStorage, JSON). Never throws. */
const store = {
  get(key, fallback = null) { try { const v = localStorage.getItem('my3d2dge:' + key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
  set(key, value) { try { localStorage.setItem('my3d2dge:' + key, JSON.stringify(value)); return true; } catch (e) { return false; } },
  remove(key) { try { localStorage.removeItem('my3d2dge:' + key); } catch (e) { /* storage blocked */ } }
};
Object.assign(E, { clamp, lerp, approach, ease, angDiff, lerpAng, approachAng, rng, hash2, noise2, bayer, smoothDamp, hex, toHex, shade, mix, mkCanvas, ctx2d, V3, ik3,
  rand, randInt, pick, chance, dist, angleTo, overlap, overlapBox, inArc, prune, store });

/* =============================================================================
 * 2. PIXEL PRIMITIVES  (all snap to whole pixels, never anti-aliased)
 *    g = CanvasRenderingContext2D, coordinates in buffer pixels.
 * ============================================================================= */
const px = {};
px.col = (g, c) => { const s = g._info ? g._mat : c; if (g._c !== s) { g.fillStyle = s; g._c = s; } };
/** GPU lighting: what follows glows (0..1). No effect in Canvas mode, so call it freely. */
px.glow = (g, e = 1) => { if (g._info && g._r) { g._mat = g._r._infoCol(g._z || 0, 10, e); g._c = null; } };
px.reset = g => { g._c = null; };
px.rect = (g, x, y, w, h, c) => { px.col(g, c); g.fillRect(Math.round(x), Math.round(y), w, h); };
px.dot = (g, x, y, c) => { px.col(g, c); g.fillRect(Math.round(x), Math.round(y), 1, 1); };
px.line = (g, x0, y0, x1, y1, c, w = 1) => {
  px.col(g, c);
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1, o = w >> 1;
  let e = dx + dy;
  for (let i = 0; i < 2000; i++) {
    g.fillRect(x0 - o, y0 - o, w, w);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
};
px.disc = (g, cx, cy, r, c) => {
  px.col(g, c); cx = Math.round(cx); cy = Math.round(cy);
  const R = r + .35, R2 = R * R, n = Math.floor(R);
  for (let dy = -n; dy <= n; dy++) { const hw = Math.floor(Math.sqrt(R2 - dy * dy)); g.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1); }
};
px.ell = (g, cx, cy, rx, ry, c) => {
  px.col(g, c); cx = Math.round(cx); cy = Math.round(cy);
  const Ry = ry + .35, n = Math.floor(Ry);
  for (let dy = -n; dy <= n; dy++) {
    const t = 1 - (dy * dy) / (Ry * Ry); if (t < 0) continue;
    const hw = Math.floor((rx + .35) * Math.sqrt(t)); g.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
  }
};
const _xs = [];
// Integer logical cells intersecting the canvas. Unknown/rotated contexts retain
// the original rasterizer; a cell crossing a fractional edge must still draw.
function scanBounds(g) {
  const cv = g.canvas;
  if (!cv || !Number.isFinite(cv.width) || !Number.isFinite(cv.height) || cv.width < 0 || cv.height < 0 || typeof g.getTransform !== 'function') return null;
  // These operators clear destination pixels outside the source shape. Shadows
  // and filters may also reach back into view from otherwise offscreen geometry.
  if (['copy', 'source-in', 'source-out', 'destination-in', 'destination-atop'].includes(g.globalCompositeOperation)
    || g.shadowBlur > 0 || g.shadowOffsetX || g.shadowOffsetY || (g.filter && g.filter !== 'none')) return null;
  let m; try { m = g.getTransform(); } catch (_) { return null; }
  if (!m || ![m.a, m.b, m.c, m.d, m.e, m.f].every(Number.isFinite) || m.b !== 0 || m.c !== 0 || m.a === 0 || m.d === 0) return null;
  if (cv.width === 0 || cv.height === 0) return [0, 0, -1, -1];
  const x0 = -m.e / m.a, x1 = (cv.width - m.e) / m.a, y0 = -m.f / m.d, y1 = (cv.height - m.f) / m.d;
  if (![x0, x1, y0, y1].every(Number.isFinite)) return null;
  return [Math.floor(Math.min(x0, x1)), Math.floor(Math.min(y0, y1)), Math.ceil(Math.max(x0, x1)) - 1, Math.ceil(Math.max(y0, y1)) - 1];
}
function scan(pts, span, bounds = null) {
  let y0 = 1e9, y1 = -1e9;
  for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  y0 = Math.round(y0); y1 = Math.round(y1);
  if (bounds) { y0 = Math.max(y0, bounds[1]); y1 = Math.min(y1, bounds[3]); }
  const n = pts.length;
  for (let y = y0; y <= y1; y++) {
    _xs.length = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) _xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    _xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < _xs.length; k += 2) {
      let xa = Math.round(_xs[k]), xb = Math.max(xa, Math.round(_xs[k + 1]));
      if (bounds) { xa = Math.max(xa, bounds[0]); xb = Math.min(xb, bounds[2]); }
      if (xa <= xb) span(xa, xb, y);
    }
  }
}
px.poly = (g, pts, c) => { px.col(g, c); scan(pts, (a, b, y) => g.fillRect(a, y, b - a + 1, 1), scanBounds(g)); };
/**
 * Translucency style. 'alpha' (default, PS1 / N64 / SNES color math): real transparency in 1/8 steps, plus blend modes.
 * 'dither' (NES, Game Boy, Genesis look): ordered-dither patterns. Set E.style.trans = 'dither' for the older look.
 */
E.style = { trans: 'alpha' };
const qa = a => Math.round(clamp(a, 0, 1) * 8) / 8;
const useAlpha = g => E.style.trans !== 'dither' && !g._info;
/** draw with translucency and a blend mode: px.blend(g, .5, 'add' | 'normal' | 'multiply' | 'screen' | 'sub', () => {...draws...}) */
const BLEND = { normal: 'source-over', add: 'lighter', multiply: 'multiply', screen: 'screen', sub: 'difference', overlay: 'overlay' };
px.blend = (g, a, mode, fn) => {
  if (g._info) { if (mode === 'normal' || !mode) fn(); return; }
  if (g._cover) { fn(); return; }   // (the renderer's glow cut mask: every pixel a glow touches counts, whatever its blend)
  const ga = g.globalAlpha, gc = g.globalCompositeOperation;
  g.globalAlpha = ga * qa(a); g.globalCompositeOperation = BLEND[mode] || mode || 'source-over';
  try { fn(); } finally { g.globalAlpha = ga; g.globalCompositeOperation = gc; }
};
/** translucent polygon: a = 0..1 opacity (stepped alpha, or a dither pattern in 'dither' style). wx/wy = world pixel offset for the pattern */
px.polyDither = (g, pts, c, a, wx = 0, wy = 0) => {
  if (a <= 0) return; if (a >= 1) return px.poly(g, pts, c);
  if (useAlpha(g)) { const A = qa(a); if (A > 0) px.blend(g, A, 'normal', () => px.poly(g, pts, c)); return; }
  px.col(g, c);
  scan(pts, (xa, xb, y) => { for (let x = xa; x <= xb; x++) if (a > bayer(x + wx, y + wy)) g.fillRect(x, y, 1, 1); }, scanBounds(g));
};
/** soft disc that fades toward its edge (glows, smoke, dust): stepped alpha rings, or dithering in 'dither' style */
px.ddisc = (g, cx, cy, r, c, a, wx = 0, wy = 0) => {
  if (a <= 0) return;
  if (useAlpha(g)) { const ga = g.globalAlpha; for (const [k, f] of [[1, .42], [.7, .42], [.4, .5]]) { const A = qa(a * f); if (A <= 0 || r * k < .4) continue; g.globalAlpha = ga * A; px.disc(g, cx, cy, r * k, c); } g.globalAlpha = ga; return; }
  px.col(g, c); cx = Math.round(cx); cy = Math.round(cy);
  const R = r + .35, R2 = R * R, n = Math.floor(R);
  for (let dy = -n; dy <= n; dy++) {
    const hw = Math.floor(Math.sqrt(R2 - dy * dy));
    for (let dx = -hw; dx <= hw; dx++) if (a * (1 - (dx * dx + dy * dy) / R2 * .6) > bayer(cx + dx + wx, cy + dy + wy)) g.fillRect(cx + dx, cy + dy, 1, 1);
  }
};
/**
 * Pixel sprite written as strings. Each character is one pixel; colors maps a character
 * to a hex color; '.' and ' ' are transparent. scale (whole number) enlarges each pixel.
 *   const COIN = E.sprite(['.yy.', 'yYYy', 'yYYy', '.yy.'], { y: '#f0b020', Y: '#fff0a0' });
 * Draw it with r.sprite(x, y, z, COIN) (depth sorted) or px.sprite(g, COIN, sx, sy).
 */
function sprite(rows, colors = {}, scale = 1) {
  if (typeof rows === 'string') rows = rows.split('\n');
  rows = rows.map(s => String(s));
  const s = Math.max(1, Math.round(scale)), w = Math.max(1, ...rows.map(r => r.length)) * s, h = Math.max(1, rows.length) * s;
  const cv = mkCanvas(w, h), g = ctx2d(cv), fl = mkCanvas(w, h), fg = ctx2d(fl), runs = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') { x++; continue; }
      let n = 1; while (x + n < row.length && row[x + n] === ch) n++;
      const c = colors[ch];
      if (!c) warn('sprite:' + ch, 'sprite character "' + ch + '" has no color in the colors map (drawn magenta)');
      g.fillStyle = c || '#ff00ff'; g.fillRect(x * s, y * s, n * s, s);
      fg.fillStyle = c || '#ff00ff'; fg.fillRect(w - (x + n) * s, y * s, n * s, s);
      runs.push([x * s, y * s, n * s, s]);
      x += n;
    }
  });
  return { w, h, cv, fl, runs, isSprite: true };
}
E.sprite = sprite;
/** draw a sprite with its top-left corner at buffer pixel (x, y). flip mirrors it left-right. */
px.sprite = (g, spr, x, y, flip = false) => {
  x = Math.round(x); y = Math.round(y);
  if (g._info) { px.col(g, '#000'); for (const [rx, ry, rw, rh] of spr.runs) g.fillRect(flip ? x + spr.w - rx - rw : x + rx, y + ry, rw, rh); return; }
  g.drawImage(flip ? spr.fl : spr.cv, x, y);
};
E.px = px;
/** a nearest-neighbour scaled copy of a sprite (cached per factor), used by the camera zoom */
function scaleSprite(spr, z) {
  const c = spr._zc || (spr._zc = {}); if (c[z]) return c[z];
  const w = Math.max(1, Math.round(spr.w * z)), h = Math.max(1, Math.round(spr.h * z)), cv = mkCanvas(w, h), fl = mkCanvas(w, h);
  ctx2d(cv).drawImage(spr.cv, 0, 0, w, h); ctx2d(fl).drawImage(spr.fl || spr.cv, 0, 0, w, h);
  const runs = spr.runs.map(([rx, ry, rw, rh]) => [Math.round(rx * z), Math.round(ry * z), Math.max(1, Math.round(rw * z)), Math.max(1, Math.round(rh * z))]);
  return (c[z] = Object.assign({}, spr, { w, h, cv, fl, runs, _zc: null, mx: (spr.mx || 0) * z, my: (spr.my || 0) * z }));
}
/** GPU surface class for a vertical face normal: 5 +x, 6 -x, 7 +y, 8 -y */
E.faceClass = (nx, ny) => nx > 0 ? 5 : nx < 0 ? 6 : ny > 0 ? 7 : 8;

/* =============================================================================
 * 3. VIEWS (projections)
 *    A view is an orthographic camera: yaw spins around the up axis, pitch tilts
 *    from horizontal (0 = side view) to straight down (90). scale = pixels per world
 *    unit. zBoost exaggerates height (a classic pixel-art cheat for readability).
 *      screen x = ax*x + ay*y
 *      screen y = bx*x + by*y + bz*z
 * ============================================================================= */
class View {
  constructor(id, label, yaw, pitch, scale = 1, zBoost = 1) { this.id = id; this.label = label; this.set(yaw, pitch, scale, zBoost); }
  set(yaw, pitch, scale = 1, zBoost = 1) {
    this.yawDeg = yaw; this.pitchDeg = pitch; this.scale = scale; this.zBoost = zBoost;
    const w = yaw * DEG, p = pitch * DEG, cw = Math.cos(w), sw = Math.sin(w), cp = Math.cos(p), sp = Math.sin(p);
    this.yaw = w; this.pitch = p;
    this.ax = scale * cw; this.ay = -scale * sw;
    this.bx = scale * sp * sw; this.by = scale * sp * cw; this.bz = -scale * cp * zBoost;
    this.dx = sw * cp; this.dy = cw * cp; this.dz = sp;   // true camera depth (bigger = nearer)
    this.fx = sw; this.fy = cw;                           // ground direction that points at the camera
    this.isTop = pitch >= 89; this.isSide = pitch <= 1;
    const det = this.ax * this.by - this.ay * this.bx;
    this.inv = Math.abs(det) > 1e-6 && pitch > 5 ? [this.by / det, -this.ay / det, -this.bx / det, this.ax / det] : null;
    return this;
  }
  /** world -> projected screen pixels (not yet camera-relative) */
  p(x, y, z = 0) { return [this.ax * x + this.ay * y, this.bx * x + this.by * y + this.bz * z]; }
  /** true camera depth: use it to sort parts inside one object */
  depth(x, y, z = 0) { return this.dx * x + this.dy * y + this.dz * z; }
  /** painter's order for whole objects standing on the ground */
  order(x, y, z = 0) { return this.isTop ? z + (this.bx * x + this.by * y) * 1e-3 : this.fx * x + this.fy * y + z * 1e-3; }
  /** projected screen point -> ground point (z = 0). null in side view */
  toGround(sx, sy) { const i = this.inv; return i ? [i[0] * sx + i[1] * sy, i[2] * sx + i[3] * sy] : null; }
  /** a direction the player pushed on screen (x right, y down) -> normalized ground direction */
  screenDirToGround(dx, dy) {
    if (!dx && !dy) return [0, 0];
    let g = this.inv ? [this.inv[0] * dx + this.inv[1] * dy, this.inv[2] * dx + this.inv[3] * dy] : [dx, dy];
    const l = Math.hypot(g[0], g[1]) || 1, m = Math.min(1, Math.hypot(dx, dy));
    return [g[0] / l * m, g[1] / l * m];
  }
}
E.View = View;
E.VIEWS = {
  iso: new View('iso', 'Isometric', 45, 30, Math.SQRT2, 1),                 // Diablo, Bastion (2:1 pixel iso)
  threequarter: new View('threequarter', 'Three-quarter', 0, 55, 1.5, 1.35), // Zelda, Stardew, Enter the Gungeon
  topdown: new View('topdown', 'Top-down', 0, 80, 1.5, 1.3),                 // Hotline Miami, GTA 1
  brawler: new View('brawler', 'Brawler', 0, 25, 1.5, 1),                    // Streets of Rage, Castle Crashers
  side: new View('side', 'Side', 0, 0, 1.5, 1),                              // Mega Man, platformers
  overhead: new View('overhead', 'Overhead', 0, 90, 1, 1)                    // 1942, puzzles: world x/y = screen pixels
};
E.VIEW_ORDER = ['iso', 'threequarter', 'topdown', 'brawler', 'side'];   // 'overhead' is left out: it is for flat games
/**
 * The classic SNES RPG cheat: in steep ground views (pitch 40-70, like threequarter) characters are drawn from a lower,
 * sprite-like angle so their faces show, at the same height on screen. Humanoid and Blob do this by themselves
 * (option charView: false turns it off for one rig, E.style.charPitch = false for all). E.charView(view) gives that view.
 */
const _cviews = new Map();
function charView(view) {
  const P = E.style.charPitch;
  if (P === false || view.pitchDeg < 40 || view.pitchDeg >= 89) return view;
  const cp = P || 30, key = view.yawDeg + ':' + view.pitchDeg + ':' + view.scale + ':' + view.zBoost + ':' + cp;
  let v = _cviews.get(key);
  // height on screen: kept as the view has it up to 70 degrees; steeper (top-down) views draw upright sprites as tall as three-quarter ones
  const h = view.pitchDeg <= 70 ? view.zBoost * Math.cos(view.pitchDeg * DEG) : .78;
  if (!v) { v = new View(view.id, view.label, view.yawDeg, cp, view.scale, h / Math.cos(cp * DEG)); _cviews.set(key, v); }
  return v;
}
E.charView = charView;

/* =============================================================================
 * 4. SCREEN  low-res buffer, whole-number upscale, sub-pixel camera on present
 * ============================================================================= */
/** classic console resolutions for new Game({ res: 'snes' }) (width x height in pixels) */
E.RES = { nes: [256, 240], snes: [256, 224], gb: [160, 144], gbc: [160, 144], gba: [240, 160], genesis: [320, 224], md: [320, 224], pce: [256, 224], n64: [320, 240], ps1: [320, 240], wide: [400, 225] };
class Screen {
  constructor(canvas, o) {
    this.canvas = canvas; this.sctx = canvas.getContext('2d'); this.o = o;
    this.buf = mkCanvas(8, 8); this.ctx = ctx2d(this.buf);
    this.W = 320; this.H = 200; this.S = 3; this.OX = 0; this.OY = 0; this.dpr = 1;
    this.ix = 0; this.iy = 0; this.fx = 0; this.fy = 0; this.listeners = [];
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  /**
   * the sizing options in force: the game's, with o.portrait's over them while the screen is taller than wide (a phone
   * held upright). new Game({ maxH: 330, portrait: { maxH: 1000 } }) lets the picture grow to fill a 9:16 screen
   */
  options(pw, ph) { const o = this.o; return o.portrait && ph > pw ? Object.assign({}, o, o.portrait) : o; }
  /** fixed internal size from o.res ('snes', [256, 224], ...) or null for the adaptive size */
  fixedRes(o = this.o) {
    const r = o.res; if (!r) return null;
    const v = Array.isArray(r) ? r : E.RES[String(r).toLowerCase()];
    if (!v) { warn('res:' + r, 'unknown res "' + r + '". Use one of ' + Object.keys(E.RES).join(', ') + ' or [width, height]'); return null; }
    return [Math.max(16, v[0] | 0), Math.max(16, v[1] | 0)];
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3), rc = this.canvas.getBoundingClientRect();
    const pw = Math.max(1, Math.round(rc.width * dpr)), ph = Math.max(1, Math.round(rc.height * dpr)), o = this.options(pw, ph);
    this.canvas.width = pw; this.canvas.height = ph; this.dpr = dpr; this.portrait = ph > pw;
    const fix = this.fixedRes(o);
    if (fix) {
      // fixed resolution: whole-number scale, letterboxed. HUD pixel positions stay the same on every screen.
      this.W = fix[0]; this.H = fix[1]; this.S = Math.max(1, Math.min(Math.floor(pw / fix[0]), Math.floor(ph / fix[1])));
      this.OX = Math.floor((pw - this.W * this.S) / 2); this.OY = Math.floor((ph - this.H * this.S) / 2);
      this.buf.width = this.W + 2; this.buf.height = this.H + 2;
      this.ctx = ctx2d(this.buf); this.ctx._c = null;
      for (const f of this.listeners) f();
      return;
    }
    const S = Math.max(1, Math.min(Math.floor(ph / o.minH), Math.floor(pw / o.minW)));
    this.S = S; this.W = Math.min(o.maxW, Math.ceil(pw / S)); this.H = Math.min(o.maxH, Math.ceil(ph / S));
    this.OX = Math.floor((pw - this.W * S) / 2); this.OY = Math.floor((ph - this.H * S) / 2);
    this.buf.width = this.W + 2; this.buf.height = this.H + 2;
    this.ctx = ctx2d(this.buf); this.ctx._c = null;
    for (const f of this.listeners) f();
  }
  /** change sizing at runtime, e.g. { minH: 400, maxW: 1080, maxH: 660 } to pull the camera back */
  setOptions(o) { Object.assign(this.o, o); this.resize(); }
  begin(cx, cy, bg) {
    this.ix = Math.floor(cx); this.iy = Math.floor(cy); this.fx = cx - this.ix; this.fy = cy - this.iy;
    const g = this.ctx; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g._c = null;
    g.fillStyle = bg; g.fillRect(0, 0, this.buf.width, this.buf.height);
  }
  present() {
    const s = this.sctx, S = this.S;
    s.imageSmoothingEnabled = false;
    s.fillStyle = '#000'; s.fillRect(0, 0, this.canvas.width, this.canvas.height);
    s.save(); s.beginPath(); s.rect(this.OX, this.OY, this.W * S, this.H * S); s.clip();
    s.drawImage(this.buf, 0, 0, this.W + 1, this.H + 1, this.OX - Math.round(this.fx * S), this.OY - Math.round(this.fy * S), (this.W + 1) * S, (this.H + 1) * S);
    s.restore();
  }
  /** browser client coords -> projected screen pixels (same space as view.p) */
  clientToScreen(cx, cy) {
    const rc = this.canvas.getBoundingClientRect(), dx = (cx - rc.left) * this.dpr, dy = (cy - rc.top) * this.dpr;
    return [(dx - this.OX + Math.round(this.fx * this.S)) / this.S + this.ix, (dy - this.OY + Math.round(this.fy * this.S)) / this.S + this.iy];
  }
}
E.Screen = Screen;

/* =============================================================================
 * 5. INPUT  keyboard, mouse, gamepad, touch stick, on-screen buttons
 *    Actions are names you choose. Codes: KeyboardEvent.code, 'Mouse0'/'Mouse2',
 *    'Pad0'..'Pad15' (standard gamepad buttons). Every action also accepts
 *    'Act:<name>' so DOM buttons with data-act="<name>" work automatically.
 * ============================================================================= */
class Input {
  constructor(screen, map) {
    this.screen = screen;
    this.use(map);
    this.held = new Set(); this.clock = 0; this.pt = {}; this.used = {};
    this.fresh = new Set(); this.now = new Set(); this.freshUp = new Set(); this.nowUp = new Set(); this.rk = {};
    this.suppressed = new Set();
    this.mouse = { cx: 0, cy: 0, active: false, t: -99 };
    this.stick = [0, 0]; this.stickOn = false; this.padMove = [0, 0]; this.padAim = null; this.padPrev = []; this.aimSource = 'move';
    this.deadzone = .18; this.padIndex = null; this.padId = ''; this.lastDevice = 'keyboard';
    this.touchEnabled = true; this.stickSide = 'left'; this.stickRadius = 44; this.padAxes = [];
    const el = screen.canvas;
    const typing = e => {
      const t = e.target; if (!t || !t.tagName) return false;
      if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return true;
      return t.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'submit', 'color'].includes(t.type);
    };
    addEventListener('keydown', e => {
      if (typing(e)) return;
      if (this.codes[e.code]) { e.preventDefault(); if (!e.repeat) this.press(e.code); }
    });
    addEventListener('keyup', e => this.release(e.code));
    addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { this.mouse.cx = e.clientX; this.mouse.cy = e.clientY; this.mouse.active = true; this.mouse.t = this.clock; this.aimSource = 'mouse'; } else this._stickMove(e); });
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') { this.mouse.cx = e.clientX; this.mouse.cy = e.clientY; this.mouse.active = true; this.aimSource = 'mouse'; this.press('Mouse' + e.button); }
      else if (!this.touchFilter || this.touchFilter(e)) this._stickStart(e);
    });
    addEventListener('pointerup', e => { if (e.pointerType === 'mouse') this.release('Mouse' + e.button); else this._stickEnd(e); });
    addEventListener('pointercancel', e => this._stickEnd(e));
    el.addEventListener('lostpointercapture', e => this._stickEnd(e));
  }
  /** switch key layout at runtime: input.use(E.Input.PLATFORMER) or input.use('SHMUP') */
  use(map) {
    if (this.held) this.clear();
    if (typeof map === 'string') map = Input[map.toUpperCase()] || Input.DEFAULT;
    this.map = {}; for (const a in map) this.map[a] = [...map[a], 'Act:' + a];
    this.codes = {}; for (const a in this.map) for (const c of this.map[a]) (this.codes[c] = this.codes[c] || []).push(a);
    this.preset = map;
    return this;
  }
  /**
   * On-screen buttons for phones and tablets (only shown on touch screens unless force is true):
   * input.touchButtons(['jump', 'attack'], { labels: { jump: 'A', attack: 'B' } }). The left half of the screen is a move stick.
   */
  touchButtons(actions, o = {}) {
    const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    if (this._touchEl) this._touchEl.remove();
    if (!coarse && !o.force) return null;
    const host = this.screen.canvas.parentElement || document.body, box = document.createElement('div');
    box.style.cssText = 'position:absolute;right:14px;bottom:14px;display:flex;gap:10px;z-index:4;touch-action:none';
    for (const a of actions) {
      const b = document.createElement('button'); b.dataset.act = a; b.textContent = (o.labels && o.labels[a]) || a.toUpperCase();
      b.style.cssText = 'width:62px;height:62px;border-radius:50%;border:2px solid rgba(255,255,255,.45);background:rgba(20,16,40,.55);color:#fff;font:600 12px system-ui,sans-serif;touch-action:none;user-select:none';
      box.appendChild(b);
    }
    const st = document.createElement('button'); st.dataset.act = 'start'; st.textContent = 'START';
    st.style.cssText = 'position:absolute;right:0;bottom:78px;padding:6px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.4);background:rgba(20,16,40,.55);color:#fff;font:600 11px system-ui,sans-serif';
    box.appendChild(st);
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(box); this.bindButtons(box); this._touchEl = box;
    return box;
  }
  press(code) {
    if (this.held.has(code)) return; this.held.add(code);
    if (code.startsWith('Pad')) { this.lastDevice = 'gamepad'; this.aimSource = 'pad'; }
    else if (code.startsWith('Act:')) this.lastDevice = 'touch';
    else this.lastDevice = code.startsWith('Mouse') ? 'mouse' : 'keyboard';
    for (const a of this.codes[code] || []) { this.pt[a] = this.clock; this.used[a] = false; this.rk[a] = -1; this.fresh.add(a); }
  }
  release(code) {
    if (!this.held.delete(code)) return;
    for (const a of this.codes[code] || []) if (!this.down(a)) this.freshUp.add(a);
  }
  _check(a) { if (!this.map[a]) warn('action:' + a, 'unknown input action "' + a + '". Known actions: ' + Object.keys(this.map).join(', ') + '. Add your own with new E.Game({ input: { ...E.Input.DEFAULT, ' + a + ": ['KeyQ'] } })"); }
  /** is the action held right now? */
  down(a) { const m = this.map[a]; if (!m) { this._check(a); return false; } if (this.suppressed.has(a)) return false; for (const c of m) if (this.held.has(c)) return true; return false; }
  /** true only during the first update step after the press (menus, jumps, one-shot actions) */
  pressed(a) { if (!this.map[a]) this._check(a); return !this.suppressed.has(a) && this.now.has(a); }
  /** true only during the first update step after the action was let go */
  released(a) { return this.nowUp.has(a); }
  /** pressed, then repeats while held (after `delay` s, every `rate` s): menu cursors, puzzle pieces */
  repeat(a, delay = .3, rate = .08) {
    if (this.pressed(a)) return true;
    if (!this.down(a) || this.pt[a] === undefined) return false;
    const t = this.clock - this.pt[a]; if (t < delay) return false;
    const k = Math.floor((t - delay) / rate); if (k !== this.rk[a]) { this.rk[a] = k; return true; }
    return false;
  }
  /** was it pressed within the last `win` seconds and not yet consumed? (input buffering) */
  buffered(a, win = .15) { if (!this.map[a]) this._check(a); const t = this.pt[a]; return !this.suppressed.has(a) && t !== undefined && !this.used[a] && this.clock - t <= win; }
  consume(a) { this.used[a] = true; }
  /** Suppress a held action until the next tick (a HUD widget owns the pointer this step). */
  suppress(a) { this.consume(a); this.suppressed.add(a); }
  /** A widget owns this button; other devices bound to the same action still work. */
  suppressCode(code) {
    for (const a of this.codes[code] || []) if (!this.map[a].some(c => c !== code && this.held.has(c))) this.suppress(a);
  }
  /** forget every pending press (after closing a menu or dialog, so the same press does not also attack) */
  consumeAll() { for (const a in this.map) this.used[a] = true; this.now.clear(); this.fresh.clear(); }
  /** Release all devices and discard buffered input on focus loss or a modal transition. */
  clear() {
    this.held.clear(); this.consumeAll(); this.nowUp.clear(); this.freshUp.clear(); this.pt = {}; this.rk = {};
    this.padMove = [0, 0]; this.padAim = null;
    this._stickEnd({ pointerId: this.stickId });
    for (const b of this._boundButtons || []) { b.classList.remove('on'); b._inputPointers.clear(); }
  }
  /** any action pressed this step (title screens: "press any button") */
  anyPressed() { return this.now.size > 0; }
  /** movement intent in screen directions: x right, y down, length <= 1 */
  move() {
    let x = (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0), y = (this.down('down') ? 1 : 0) - (this.down('up') ? 1 : 0);
    if (this.stickOn) { x = this.stick[0]; y = this.stick[1]; }
    if (Math.hypot(this.padMove[0], this.padMove[1]) > 0) { x = this.padMove[0]; y = this.padMove[1]; }
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return [x, y];
  }
  /** mouse position in projected screen pixels, or null */
  mouseScreen() { return this.mouse.active ? this.screen.clientToScreen(this.mouse.cx, this.mouse.cy) : null; }
  tick(dt) {
    this.suppressed.clear();
    this.clock += dt;
    let pads = [];
    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { /* gamepads blocked */ }
    const p = Array.from(pads || []).find(p => p && p.connected !== false && p.index === this.padIndex)
      || Array.from(pads || []).find(p => p && p.connected !== false);
    if (!p || p.index !== this.padIndex || p.id !== this.padId) {
      this.padPrev.forEach((on, i) => { if (on) this.release('Pad' + i); });
      for (const c of ['PadAxisUp', 'PadAxisDown', 'PadAxisLeft', 'PadAxisRight']) this.release(c);
      this.padPrev = []; this.padMove = [0, 0]; this.padAim = null; this.padAxes = [];
      this.padIndex = p ? p.index : null; this.padId = p ? p.id : '';
      if (this.aimSource === 'pad') this.aimSource = 'move';
    }
    if (p) {
      const dz = (x, y) => { const l = Math.hypot(x, y), d = clamp(this.deadzone, 0, .8); return l <= d ? [0, 0] : [x / l * Math.min(1, (l - d) / (1 - d)), y / l * Math.min(1, (l - d) / (1 - d))]; };
      this.padAxes = Array.from(p.axes);
      this.padMove = dz(p.axes[0] || 0, p.axes[1] || 0);
      const aim = dz(p.axes[2] || 0, p.axes[3] || 0);
      this.padAim = Math.hypot(...aim) > 0 ? [aim[0], aim[1] * (this.invertAimY ? -1 : 1)] : null;
      if (this.padAim || Math.hypot(...this.padMove) > 0) { this.aimSource = 'pad'; this.lastDevice = 'gamepad'; }
      p.buttons.forEach((b, i) => { const on = b.pressed; if (on && !this.padPrev[i]) this.press('Pad' + i); if (!on && this.padPrev[i]) this.release('Pad' + i); this.padPrev[i] = on; });
      const dirs = [this.padMove[1] < -.5, this.padMove[1] > .5, this.padMove[0] < -.5, this.padMove[0] > .5];
      ['PadAxisUp', 'PadAxisDown', 'PadAxisLeft', 'PadAxisRight'].forEach((c, i) => dirs[i] ? this.press(c) : this.release(c));
    }
    // presses since the last step become this step's pressed()/released()
    const n = this.now; n.clear(); this.now = this.fresh; this.fresh = n;
    const u = this.nowUp; u.clear(); this.nowUp = this.freshUp; this.freshUp = u;
  }
  /** wire every element with data-act="<action>" inside root to the action */
  bindButtons(root) {
    this._boundButtons = (this._boundButtons || []).filter(b => b.isConnected);
    root.querySelectorAll('[data-act]').forEach(b => {
      if (b._inputPointers) return;
      const code = 'Act:' + b.dataset.act;
      b._inputPointers = new Set(); this._boundButtons.push(b);
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); b._inputPointers.add(e.pointerId); b.setPointerCapture(e.pointerId); this.press(code); b.classList.add('on'); });
      const off = e => { b._inputPointers.delete(e.pointerId); if (!b._inputPointers.size) { this.release(code); b.classList.remove('on'); } };
      b.addEventListener('pointerup', off); b.addEventListener('lostpointercapture', off); b.addEventListener('pointercancel', off);
    });
  }
  _stickStart(e) {
    if (!this.touchEnabled || this.stickOn) return;
    const rc = this.screen.canvas.getBoundingClientRect();
    if (this.stickSide === 'right' ? e.clientX - rc.left < rc.width * .5 : e.clientX - rc.left > rc.width * .5) return;
    this.screen.canvas.setPointerCapture(e.pointerId); this.aimSource = 'move'; this.lastDevice = 'touch';
    this.stickId = e.pointerId; this.stickOn = true; this.stickO = [e.clientX, e.clientY]; this.stick = [0, 0];
    if (!this.stickEl) {
      const mkEl = (s, css) => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;pointer-events:none;border-radius:50%;z-index:3;' + css; d.style.width = d.style.height = s + 'px'; this.screen.canvas.parentElement.appendChild(d); return d; };
      this.stickEl = mkEl(96, 'border:2px solid rgba(255,255,255,.35);background:rgba(255,255,255,.06)');
      this.knobEl = mkEl(40, 'background:rgba(255,255,255,.4)');
    }
    this._stickDraw();
  }
  _stickMove(e) {
    if (!this.stickOn || e.pointerId !== this.stickId) return;
    let dx = (e.clientX - this.stickO[0]) / this.stickRadius, dy = (e.clientY - this.stickO[1]) / this.stickRadius;
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    this.stick = [dx, dy]; this._stickDraw();
  }
  _stickEnd(e) { if (e.pointerId !== this.stickId) return; this.stickOn = false; this.stick = [0, 0]; if (this.stickEl) this.stickEl.style.display = this.knobEl.style.display = 'none'; }
  _stickDraw() {
    const rc = this.screen.canvas.getBoundingClientRect(), pr = this.screen.canvas.parentElement.getBoundingClientRect();
    const ox = this.stickO[0] - pr.left, oy = this.stickO[1] - pr.top;
    Object.assign(this.stickEl.style, { display: 'block', left: ox - 48 + 'px', top: oy - 48 + 'px' });
    Object.assign(this.knobEl.style, { display: 'block', left: ox - 20 + this.stick[0] * 36 + 'px', top: oy - 20 + this.stick[1] * 36 + 'px' });
    void rc;
  }
}
/* menu actions shared by every preset. Pad9 = Start, Pad0 = A (bottom), Pad1 = B (right) */
const MENU_KEYS = {
  start: ['Enter', 'NumpadEnter', 'Pad9'], pause: ['Escape', 'KeyP', 'Pad9'],
  confirm: ['Enter', 'NumpadEnter', 'Space', 'KeyJ', 'KeyZ', 'Pad0'], cancel: ['Escape', 'Backspace', 'KeyX', 'KeyK', 'Pad1']
};
/** top-down / isometric action (Zelda, Diablo): Space dashes, J or click attacks */
Input.DEFAULT = {
  up: ['KeyW', 'ArrowUp', 'Pad12'], down: ['KeyS', 'ArrowDown', 'Pad13'], left: ['KeyA', 'ArrowLeft', 'Pad14'], right: ['KeyD', 'ArrowRight', 'Pad15'],
  attack: ['KeyJ', 'KeyX', 'Mouse0', 'Pad0', 'Pad7'], dash: ['Space', 'ShiftLeft', 'ShiftRight', 'KeyK', 'Pad1', 'Pad6'],
  skill: ['KeyL', 'KeyE', 'Mouse2', 'Pad2', 'Pad5'], jump: ['KeyZ', 'Pad3'], ...MENU_KEYS
};
/** side-scrollers (Mario, Mega Man): Space / Z / K jump, X / J attack or shoot, Shift / C dash */
Input.PLATFORMER = {
  up: ['KeyW', 'ArrowUp', 'Pad12'], down: ['KeyS', 'ArrowDown', 'Pad13'], left: ['KeyA', 'ArrowLeft', 'Pad14'], right: ['KeyD', 'ArrowRight', 'Pad15'],
  jump: ['Space', 'KeyZ', 'KeyK', 'Pad0'], attack: ['KeyX', 'KeyJ', 'Mouse0', 'Pad2'], dash: ['ShiftLeft', 'ShiftRight', 'KeyC', 'KeyL', 'Pad1', 'Pad5'],
  skill: ['KeyE', 'KeyV', 'Mouse2', 'Pad3'], ...MENU_KEYS
};
/** shoot-'em-ups (1942, Gradius): Space / Z / J fire (hold for autofire), X / K bomb */
Input.SHMUP = {
  up: ['KeyW', 'ArrowUp', 'Pad12'], down: ['KeyS', 'ArrowDown', 'Pad13'], left: ['KeyA', 'ArrowLeft', 'Pad14'], right: ['KeyD', 'ArrowRight', 'Pad15'],
  fire: ['Space', 'KeyZ', 'KeyJ', 'Mouse0', 'Pad0', 'Pad7'], bomb: ['KeyX', 'KeyK', 'Mouse2', 'Pad1', 'Pad6'], ...MENU_KEYS
};
E.Input = Input;

/* =============================================================================
 * 6. PIXEL FONT  3x5 glyphs for in-world numbers and labels
 * ============================================================================= */
const GLYPHS = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', '+': '000010111010000', '-': '000000111000000', '!': '010010010000010',
  '.': '000000000000010', ':': '000010000010000', '/': '001001010100100', ' ': '000000000000000', 'x': '000101010101000',
  '?': '111001010000010', ',': '000000000010100', "'": '010010000000000', '"': '101101000000000', '(': '001010010010001',
  ')': '100010010010100', '%': '101001010100101', '*': '000101010101000', '=': '000111000111000', '<': '001010100010001',
  '>': '100010001010100', '#': '101111101111101', '&': '010101010101011', '_': '000000000000111', ';': '000010000010100',
  '[': '110100100100110', ']': '011001001001011', '$': '011110111011110', '^': '010101000000000', '@': '111101111100011',
  '~': '000011110000000', '♥': '101111111010000', '♡': '101101101010000', '★': '010111010101000', '•': '000010111010000',
  '←': '000010111010000', '→': '000010111010000', '↑': '010111010010010', '↓': '010010010111010', '©': '111101101101111'
};
GLYPHS['←'] = '000100111100000'; GLYPHS['→'] = '000001111001000';
/* 5x7 proportional font with lower case and descenders: the default ('normal'). Rows are 7 above the baseline and up to 2 below */
const G57 = {
  "A": '.###.|#...#|#...#|#####|#...#|#...#|#...#', "B": '####.|#...#|#...#|####.|#...#|#...#|####.', "C": '.###.|#...#|#....|#....|#....|#...#|.###.', "D": '####.|#...#|#...#|#...#|#...#|#...#|####.', "E": '#####|#....|#....|####.|#....|#....|#####', "F": '#####|#....|#....|####.|#....|#....|#....',
  "G": '.###.|#...#|#....|#.###|#...#|#...#|.####', "H": '#...#|#...#|#...#|#####|#...#|#...#|#...#', "I": '###|.#.|.#.|.#.|.#.|.#.|###', "J": '..###|...#.|...#.|...#.|...#.|#..#.|.##..', "K": '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', "L": '#....|#....|#....|#....|#....|#....|#####',
  "M": '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', "N": '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#', "O": '.###.|#...#|#...#|#...#|#...#|#...#|.###.', "P": '####.|#...#|#...#|####.|#....|#....|#....', "Q": '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', "R": '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  "S": '.####|#....|#....|.###.|....#|....#|####.', "T": '#####|..#..|..#..|..#..|..#..|..#..|..#..', "U": '#...#|#...#|#...#|#...#|#...#|#...#|.###.', "V": '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..', "W": '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.', "X": '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  "Y": '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', "Z": '#####|....#|...#.|..#..|.#...|#....|#####', "a": '.....|.....|.###.|....#|.####|#...#|.####', "b": '#....|#....|####.|#...#|#...#|#...#|####.', "c": '.....|.....|.###.|#....|#....|#....|.###.', "d": '....#|....#|.####|#...#|#...#|#...#|.####',
  "e": '.....|.....|.###.|#...#|#####|#....|.###.', "f": '..##|.#..|####|.#..|.#..|.#..|.#..', "g": '.....|.....|.####|#...#|#...#|#...#|.####|....#|.###.', "h": '#....|#....|####.|#...#|#...#|#...#|#...#', "i": '#|.|#|#|#|#|#', "j": '..#|...|..#|..#|..#|..#|..#|#.#|.#.',
  "k": '#...|#...|#..#|#.#.|##..|#.#.|#..#', "l": '#.|#.|#.|#.|#.|#.|.#', "m": '.....|.....|##.#.|#.#.#|#.#.#|#.#.#|#.#.#', "n": '.....|.....|####.|#...#|#...#|#...#|#...#', "o": '.....|.....|.###.|#...#|#...#|#...#|.###.', "p": '.....|.....|####.|#...#|#...#|#...#|####.|#....|#....',
  "q": '.....|.....|.####|#...#|#...#|#...#|.####|....#|....#', "r": '....|....|#.##|##..|#...|#...|#...', "s": '.....|.....|.####|#....|.###.|....#|####.', "t": '.#..|.#..|####|.#..|.#..|.#..|..##', "u": '.....|.....|#...#|#...#|#...#|#...#|.####', "v": '.....|.....|#...#|#...#|#...#|.#.#.|..#..',
  "w": '.....|.....|#...#|#...#|#.#.#|#.#.#|.#.#.', "x": '.....|.....|#...#|.#.#.|..#..|.#.#.|#...#', "y": '.....|.....|#...#|#...#|#...#|#...#|.####|....#|.###.', "z": '.....|.....|#####|...#.|..#..|.#...|#####', "0": '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', "1": '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  "2": '.###.|#...#|....#|...#.|..#..|.#...|#####', "3": '####.|....#|....#|.###.|....#|....#|####.', "4": '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', "5": '#####|#....|####.|....#|....#|#...#|.###.', "6": '.###.|#....|#....|####.|#...#|#...#|.###.', "7": '#####|....#|...#.|..#..|.#...|.#...|.#...',
  "8": '.###.|#...#|#...#|.###.|#...#|#...#|.###.', "9": '.###.|#...#|#...#|.####|....#|....#|.###.', "!": '#|#|#|#|#|.|#', "\"": '#.#|#.#|...|...|...|...|...', "#": '.#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.', "$": '..#..|.####|#.#..|.###.|..#.#|####.|..#..',
  "%": '##..#|##..#|...#.|..#..|.#...|#..##|#..##', "&": '.##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#', "'": '#|#|.|.|.|.|.', "(": '..#|.#.|#..|#..|#..|.#.|..#', ")": '#..|.#.|..#|..#|..#|.#.|#..', "*": '.....|#.#.#|.###.|#####|.###.|#.#.#|.....',
  "+": '.....|..#..|..#..|#####|..#..|..#..|.....', ",": '..|..|..|..|..|.#|.#|#.', "-": '....|....|....|####|....|....|....', ".": '.|.|.|.|.|.|#', "/": '....#|....#|...#.|..#..|.#...|#....|#....', ":": '.|.|#|.|.|#|.',
  ";": '..|..|.#|..|..|.#|.#|#.', "<": '...#|..#.|.#..|#...|.#..|..#.|...#', "=": '.....|.....|#####|.....|#####|.....|.....', ">": '#...|.#..|..#.|...#|..#.|.#..|#...', "?": '.###.|#...#|....#|...#.|..#..|.....|..#..', "@": '.###.|#...#|#.###|#.#.#|#.###|#....|.####',
  "[": '###|#..|#..|#..|#..|#..|###', "\\": '#....|#....|.#...|..#..|...#.|....#|....#', "]": '###|..#|..#|..#|..#|..#|###', "^": '..#..|.#.#.|#...#|.....|.....|.....|.....', "_": '.....|.....|.....|.....|.....|.....|#####', "`": '#.|.#|..|..|..|..|..',
  "{": '..##|.#..|.#..|#...|.#..|.#..|..##', "|": '#|#|#|#|#|#|#', "}": '##..|..#.|..#.|...#|..#.|..#.|##..', "~": '.....|.....|.#...|#.#.#|...#.|.....|.....', "♥": '.....|.#.#.|#####|#####|.###.|..#..|.....', "★": '..#..|..#..|#####|.###.|.#.#.|#...#|.....',
  "←": '.....|..#..|.#...|#####|.#...|..#..|.....', "→": '.....|..#..|...#.|#####|...#.|..#..|.....', "↑": '..#..|.###.|#.#.#|..#..|..#..|..#..|.....', "↓": '.....|..#..|..#..|..#..|#.#.#|.###.|..#..', "•": '...|...|.#.|###|.#.|...|...', "©": '.###.|#...#|#.#.#|#.#..|#.#.#|#...#|.###.',
  "×": '.....|#...#|.#.#.|..#..|.#.#.|#...#|.....', "▸": '#...|##..|###.|####|###.|##..|#...', "♪": '..##.|..#.#|..#..|..#..|.##..|###..|.#...'
};
const parseFont = (src, h) => {
  const out = {};
  for (const ch in src) {
    const rows = typeof src[ch] === 'string' && src[ch].includes('|') ? src[ch].split('|') : null;
    let w, runs = [];
    if (rows) { w = rows[0].length; rows.forEach((r, y) => { for (let x = 0; x < r.length;) { if (r[x] !== '#') { x++; continue; } let n = 1; while (r[x + n] === '#') n++; runs.push([x, y, n]); x += n; } }); }
    else { w = 3; const bits = src[ch]; for (let k = 0; k < bits.length; k++) if (bits[k] === '1') runs.push([k % 3, (k / 3) | 0, 1]); }   // 3x5 bit strings
    out[ch] = { w, runs };
  }
  void h; return out;
};
const FONTS = {
  normal: { glyphs: parseFont(G57), h: 7, desc: 2, gap: 1, space: 3, upper: false },
  tiny: { glyphs: parseFont(GLYPHS), h: 5, desc: 0, gap: 2, space: 3, upper: true, mono: 3 }
};
/**
 * Pixel fonts. 'normal' (default) is a 5x7 proportional font with lower case; 'tiny' is the 3x5 upper-case font.
 * text(g, str, x, y, color, opts) where opts is an outline color, false, or
 *   { font: 'normal' | 'tiny', outline: '#0b0814' | false, shadow: '#000' (1 px drop shadow), gradient: ['#fff', '#8ad'] (top to bottom),
 *     scale: 1, align: 'left' | 'center' | 'right', wrap: maxWidthPx, lineGap }
 * '\n' starts a new line. Returns { w, h } of the drawn block. title(...) draws big logo text.
 */
E.font = {
  default: 'normal',
  _f(o) { const n = (o && typeof o === 'object' && o.font) || this.default; return FONTS[n] || FONTS.normal; },
  _o(o) { return typeof o === 'number' ? { scale: o } : (o || {}); },
  _glyph(f, ch) { return f.glyphs[f.upper ? ch.toUpperCase() : ch] || f.glyphs[ch.toUpperCase()] || f.glyphs['?']; },
  _lineW(f, line) {
    let w = 0;
    for (const ch of line) w += ch === ' ' ? f.space + 1 : (f.mono || this._glyph(f, ch).w) + 1;
    return Math.max(0, w - 1);
  },
  /** width in pixels of the widest line. opts: a scale number or { font, scale } */
  width(s, o) { o = this._o(o); const f = this._f(o), sc = Math.max(1, Math.round(o.scale || 1)); let m = 0; for (const line of String(s).split('\n')) m = Math.max(m, this._lineW(f, line)); return m * sc; },
  /** pixels from one line to the next */
  lineHeight(o) { o = this._o(o); const f = this._f(o), sc = Math.max(1, Math.round(o.scale || 1)); return (f.h + f.desc + (o.lineGap === undefined ? f.gap : o.lineGap)) * sc; },
  height(lines = 1, o, lineGap) { o = this._o(o); if (lineGap !== undefined) o = Object.assign({}, o, { lineGap }); const f = this._f(o), sc = Math.max(1, Math.round(o.scale || 1)); return this.lineHeight(o) * (lines - 1) + (f.h + f.desc) * sc; },
  /** split text into lines no wider than maxW pixels */
  wrap(s, maxW, o) {
    o = this._o(o); const f = this._f(o), sc = Math.max(1, Math.round(o.scale || 1)), lim = maxW / sc, out = [];
    for (const para of String(s).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const t = line ? line + ' ' + word : word;
        if (this._lineW(f, t) <= lim || !line) line = t; else { out.push(line); line = word; }
        while (this._lineW(f, line) > lim && line.length > 1) { let k = line.length - 1; while (k > 1 && this._lineW(f, line.slice(0, k)) > lim) k--; out.push(line.slice(0, k)); line = line.slice(k); }
      }
      out.push(line);
    }
    return out;
  },
  text(g, s, x, y, color = '#ffffff', o = '#0b0814') {
    if (o === null || o === false || typeof o === 'string') o = { outline: o };
    const f = this._f(o), sc = Math.max(1, Math.round(o.scale || 1)), outline = o.outline === undefined ? '#0b0814' : o.outline, lh = this.lineHeight(o);
    const lines = o.wrap ? this.wrap(s, o.wrap, o) : String(s).split('\n');
    const grad = o.gradient && o.gradient.length ? o.gradient : null, rowsH = f.h + f.desc;
    x = Math.round(x); y = Math.round(y);
    let w = 0;
    const draw = (ox, oy, c, useGrad) => {
      lines.forEach((line, li) => {
        const lw = this._lineW(f, line) * sc, lx = x + (o.align === 'center' ? -Math.round(lw / 2) : o.align === 'right' ? -lw : 0), ly = y + li * lh;
        w = Math.max(w, lw);
        let cx = 0;
        for (const ch of line) {
          if (ch === ' ') { cx += f.space + 1; continue; }
          const gl = this._glyph(f, ch), off = f.mono ? Math.floor((f.mono - gl.w) / 2) : 0;
          for (const [rx, ry, rn] of gl.runs) {
            px.col(g, useGrad ? grad[Math.min(grad.length - 1, Math.floor(ry / Math.max(1, f.h) * grad.length))] : c);
            g.fillRect(lx + (cx + off + rx) * sc + ox, ly + ry * sc + oy, rn * sc, sc);
          }
          cx += (f.mono || gl.w) + 1;
        }
      });
    };
    if (o.shadow) draw(sc, sc, o.shadow, false);
    if (outline) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) draw(ox, oy, outline, false);   // 1 px at every scale, so 8 and 0 keep their holes
    draw(0, 0, color, !!grad);
    return { w, h: lh * (lines.length - 1) + rowsH * sc };
  },
  /**
   * Big logo text for title screens: scaled glyphs with a vertical color gradient, an outline and an extruded 3D edge.
   * title(g, 'CASTLE OF NIGHT', x, y, { scale: 3, colors: ['#fff6c8', '#ffd36a', '#e07a2a'], outline: '#1a0c10', depth: 3, depthColor: '#6a2a1a', align: 'center' })
   */
  title(g, s, x, y, o = {}) {
    const sc = Math.max(1, Math.round(o.scale || 3)), colors = o.colors || ['#fff6c8', '#ffe08a', '#ffb347', '#e0662a'], outline = o.outline === undefined ? '#1a0c10' : o.outline;
    const depth = o.depth === undefined ? Math.max(1, sc - 1) : o.depth, dc = o.depthColor || shade(colors[colors.length - 1], -.55), f = this._f(o);
    const base = Object.assign({}, o, { scale: sc, outline: false, shadow: false, gradient: null });
    for (let d = depth; d >= 1; d--) this.text(g, s, x + d, y + d, dc, base);
    if (outline) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) this.text(g, s, x + ox, y + oy, outline, base);
    // smooth gradient: one color band per scaled pixel row
    const rows = f.h * sc, bands = [];
    for (let k = 0; k < rows; k++) { const t = k / Math.max(1, rows - 1) * (colors.length - 1), i = Math.min(colors.length - 2, Math.floor(t)); bands.push(colors.length < 2 ? colors[0] : mix(colors[i], colors[i + 1], t - i)); }
    const lines = String(s).split('\n'), lh = this.lineHeight(base);
    lines.forEach((line, li) => {
      const lw = this._lineW(f, line) * sc, lx = Math.round(x) + (o.align === 'center' ? -Math.round(lw / 2) : o.align === 'right' ? -lw : 0), ly = Math.round(y) + li * lh;
      let cx = 0;
      for (const ch of line) {
        if (ch === ' ') { cx += f.space + 1; continue; }
        const gl = this._glyph(f, ch);
        for (const [rx, ry, rn] of gl.runs) for (let sy = 0; sy < sc; sy++) { px.col(g, bands[Math.min(rows - 1, ry * sc + sy)] || colors[0]); g.fillRect(lx + (cx + rx) * sc, ly + ry * sc + sy, rn * sc, 1); }
        if (o.shine !== false) for (const [rx, ry, rn] of gl.runs) if (ry === 0) { px.col(g, o.shine || '#ffffff'); g.fillRect(lx + (cx + rx) * sc, ly, rn * sc, 1); }
        cx += (f.mono || gl.w) + 1;
      }
    });
    return { w: this.width(s, base), h: this.height(lines.length, base) };
  }
};

/* =============================================================================
 * 7. LIGHTING  per-pixel darkness with dithered bands, lights measured on the ground
 * ============================================================================= */
class Lighting {
  constructor(game) {
    this.game = game; this.enabled = false; this.ambient = .15; this.list = [];
    this.dark = [10, 6, 24]; this.levels = [.9, .7, .48, .26, .08, 0]; this.glow = [255, 200, 140, 0]; this.glowAt = 1.7;
    this.casters = []; this.heats = [];
    this.cv = mkCanvas(8, 8); this.g = this.cv.getContext('2d'); this._build();
  }
  _build() {
    const L = this.levels, d = this.dark;
    this.cols = new Uint32Array(L.length + 1);
    L.forEach((a, i) => { this.cols[i] = ((Math.round(a * 255) << 24) | (d[2] << 16) | (d[1] << 8) | d[0]) >>> 0; });
    const gl = this.glow; this.cols[L.length] = ((gl[3] << 24) | (gl[2] << 16) | (gl[1] << 8) | gl[0]) >>> 0;
  }
  clear() { this.list.length = 0; this.casters.length = 0; this.heats.length = 0; this.screenFrame = false; }
  /** radius in world units; intensity ~0.5..1.5. opts (GPU lighting only): { color: '#ffaa55', shadow: true } */
  add(x, y, z, radius, intensity = 1, o) {
    if (!(isFinite(x) && isFinite(y) && isFinite(z) && radius > 0)) { warn('light:nan', 'lights.add(x, y, z, radius, intensity) got a non-number or zero radius; light skipped'); return; }
    this.list.push({ x, y, z, r: radius, i: intensity, color: o && o.color, shadow: !!(o && o.shadow) });
  }
  /** something that blocks light (GPU shadows): a cylinder of radius r from the floor up to height top */
  caster(x, y, r, top) { this.casters.push({ x, y, r, top }); }
  /** heat shimmer above a point (GPU only). width in world units, strength ~0.5..1.5 */
  heat(x, y, z, width, strength = 1) { this.heats.push({ x, y, z, w: width, s: strength }); }
  render(r) {
    const W = r.bw, H = r.bh, n = W * H, al = E.style.trans !== 'dither';
    if (!this.I || this.I.length !== n) {
      this.I = new Float32Array(n); this.cv.width = W; this.cv.height = H;
      this.img = this.g.createImageData(W, H); this.u32 = new Uint32Array(this.img.data.buffer);
      this.CR = new Float32Array(n); this.CG = new Float32Array(n); this.CB = new Float32Array(n);
      this.cv2 = mkCanvas(W, H); this.g2 = this.cv2.getContext('2d'); this.img2 = this.g2.createImageData(W, H); this.u32b = new Uint32Array(this.img2.data.buffer);
    }
    const CR = this.CR, CG = this.CG, CB = this.CB; if (al) { CR.fill(0); CG.fill(0); CB.fill(0); }
    // screen-space lights when there is no ground plane to measure on (side view, or side-scroller levels)
    const I = this.I, view = r.view, ix = r.ix, iy = r.iy, inv = (this.screen || this.screenFrame) ? null : view.inv;
    I.fill(this.ambient);
    for (const L of this.list) {
      const R = L.r, R2 = R * R, lc = L.color ? hex(L.color) : [255, 236, 200], cr = lc[0] / 255, cg = lc[1] / 255, cb = lc[2] / 255;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * TAU, s = view.p(L.x + Math.cos(a) * R * 1.02, L.y + Math.sin(a) * R * 1.02, 0);
        x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[0]); y0 = Math.min(y0, s[1]); y1 = Math.max(y1, s[1]);
      }
      if (!inv) { const s = view.p(L.x, L.y, L.z), rr = R * view.scale; x0 = s[0] - rr; x1 = s[0] + rr; y0 = s[1] - rr; y1 = s[1] + rr; }
      const X0 = Math.max(0, Math.floor(x0 - ix)), X1 = Math.min(W - 1, Math.ceil(x1 - ix)), Y0 = Math.max(0, Math.floor(y0 - iy)), Y1 = Math.min(H - 1, Math.ceil(y1 - iy));
      if (X0 > X1 || Y0 > Y1) continue;
      if (inv) {
        for (let py = Y0; py <= Y1; py++) {
          const sy = py + iy; let gx = inv[0] * (X0 + ix) + inv[1] * sy - L.x, gy = inv[2] * (X0 + ix) + inv[3] * sy - L.y, k = py * W + X0;
          for (let pxx = X0; pxx <= X1; pxx++, k++, gx += inv[0], gy += inv[2]) { const d2 = gx * gx + gy * gy; if (d2 < R2) { const f = (1 - d2 / R2) * L.i; I[k] += f; if (al) { CR[k] += f * cr; CG[k] += f * cg; CB[k] += f * cb; } } }
        }
      } else {
        const s = view.p(L.x, L.y, L.z), rr = R * view.scale, rr2 = rr * rr;
        for (let py = Y0; py <= Y1; py++) for (let pxx = X0; pxx <= X1; pxx++) { const dx = pxx + ix - s[0], dy = py + iy - s[1], d2 = dx * dx + dy * dy; if (d2 < rr2) { const k = py * W + pxx, f = (1 - d2 / rr2) * L.i; I[k] += f; if (al) { CR[k] += f * cr; CG[k] += f * cg; CB[k] += f * cb; } } }
      }
    }
    const u = this.u32, cols = this.cols, NL = this.levels.length - 1;
    if (al) {
      // PS1-style lighting: a smooth cool darkness where light is weak, then the lights' own colors added on top
      const d = this.dark, maxA = this.darkness === undefined ? .9 : this.darkness, base = (d[2] << 16) | (d[1] << 8) | d[0], u2 = this.u32b, tint = (this.tint === undefined ? .32 : this.tint) * 255;
      let lit = false;
      const q = x => Math.round((1 - Math.exp(-x)) * tint / 8) * 8;   // saturates: overlapping lights warm a surface, they never bleach it white
      for (let k = 0; k < n; k++) {
        const v = I[k];
        const a8 = v >= 1 ? 0 : Math.min(255, Math.round((1 - Math.max(0, v)) * maxA * 16) * 16);
        u[k] = a8 ? ((a8 << 24) | base) >>> 0 : 0;
        const rr = CR[k], gg = CG[k], bb = CB[k];
        if (rr + gg + bb < .03) { u2[k] = 0; continue; }
        lit = true;
        u2[k] = (255 << 24 | q(bb) << 16 | q(gg) << 8 | q(rr)) >>> 0;
      }
      this.g.putImageData(this.img, 0, 0); r.ctx.drawImage(this.cv, 0, 0);
      if (lit) { this.g2.putImageData(this.img2, 0, 0); const c = r.ctx; c.save(); c.globalCompositeOperation = 'lighter'; c.drawImage(this.cv2, 0, 0); c.restore(); }
      return;
    }
    for (let py = 0, k = 0; py < H; py++) for (let pxx = 0; pxx < W; pxx++, k++) {
      const v = I[k];
      if (v >= this.glowAt) { u[k] = cols[NL + 1]; continue; }
      if (v >= 1) { u[k] = cols[NL]; continue; }
      if (v <= 0) { u[k] = cols[0]; continue; }
      const f = v * NL; let lo = f | 0; if (f - lo > bayer(pxx + ix, py + iy)) lo++;
      u[k] = cols[lo];
    }
    this.g.putImageData(this.img, 0, 0);
    r.ctx.drawImage(this.cv, 0, 0);
  }
}
E.Lighting = Lighting;

/* =============================================================================
 * 8. PARTICLES  3D, projected. kinds: dust, spark, bit, ember, ring, text
 *    z gravity: g > 0 pulls down. bounce: 0..1 on the floor.
 * ============================================================================= */
class Particles {
  constructor(game) { this.game = game; this.list = []; this.max = 900; }
  add(p) {
    if (this.list.length >= this.max) return null;
    const q = Object.assign({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: .5, g: 0, drag: 0, bounce: 0, kind: 'dust', color: '#d8c6a8', size: 1 }, p);
    this.list.push(q); return q;
  }
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i]; p.life += dt;
      if (p.life >= p.max) { L[i] = L[L.length - 1]; L.pop(); continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k; p.vz = p.vz * k - p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      let fl = 0;   // particles.ground(x, y, z) -> floor height (side-scroller platforms), looked up again whenever a particle enters a new column
      if (p.floor !== undefined) fl = p.floor;
      else if (this.ground) { const c = Math.floor(p.x / 8); if (p._fc !== c) { p._fc = c; p._fl = this.ground(p.x, p.y, p.z) || 0; } fl = p._fl; }
      if (p.z < fl && p.kind !== 'ring') { p.z = fl; if (p.bounce) { p.vz = -p.vz * p.bounce; p.vx *= .7; p.vy *= .7; } else p.vz = 0; }
    }
  }
  draw(r) {
    const view = r.view, s = view.scale;
    // flat overhead views have no screen height, so rising and bouncing particles lift on screen instead
    if (view.isTop) r = Object.create(r, { w: { value: (x, y, z) => { const q = Renderer.prototype.w.call(r, x, y, 0); q[1] -= z * .5; return q; } } });
    for (const p of this.list) {
      if (p.kind !== 'ring' && !r.visible(p.x, p.y, p.z, 12, 12, 12)) continue;
      const u = p.life / p.max;
      switch (p.kind) {
        case 'dust': r.queue(p.x, p.y, p.z, g => {
          const [x, y] = r.w(p.x, p.y, p.z), rad = p.size * s * (1 + u * 1.4);
          if (!useAlpha(g)) { px.ddisc(g, x, y, rad, p.color, (1 - u) * .9, r.ix, r.iy); return; }
          px.blend(g, (1 - u) * .85, 'normal', () => { px.disc(g, x, y, rad, p.color); if (rad > 1.5) px.disc(g, x - rad * .3, y - rad * .3, rad * .45, shade(p.color, .18)); });
        }); break;
        case 'spark': r.queue(p.x, p.y, p.z, g => {
          px.glow(g, .8);
          const [x, y] = r.w(p.x, p.y, p.z), [x2, y2] = r.w(p.x - p.vx * .025, p.y - p.vy * .025, p.z - p.vz * .025);
          px.line(g, x, y, x2, y2, u < .5 ? (p.hot || '#fff5cf') : p.color, p.size > 1.5 ? 2 : 1);
        }, { emissive: true }); break;
        case 'bit': r.queue(p.x, p.y, p.z, g => { const [x, y] = r.w(p.x, p.y, p.z); px.rect(g, x, y, p.size, p.size, p.color); }); break;
        case 'ember': r.queue(p.x, p.y, p.z, g => { px.glow(g, .4); const [x, y] = r.w(p.x, p.y, p.z); if (useAlpha(g)) px.blend(g, 1 - u * .8, 'add', () => px.dot(g, x, y, u < .4 ? '#fff0b0' : p.color)); else if ((1 - u) > bayer(Math.round(x) + r.ix, Math.round(y) + r.iy) * .7) px.dot(g, x, y, u < .4 ? '#fff0b0' : p.color); }, { emissive: true }); break;
        case 'ring': if (view.pitchDeg < 20) r.queue(p.x, p.y, p.z, g => { const [x, y] = r.w(p.x, p.y, p.z), rad = lerp(p.r0, p.r1, ease.outQuad(u)) * s, n = Math.max(16, Math.round(rad * 3)); px.blend(g, 1 - u, 'add', () => { px.col(g, p.color); for (let i = 0; i < n; i++) { const a = i / n * TAU; g.fillRect(Math.round(x + Math.cos(a) * rad), Math.round(y + Math.sin(a) * rad * .9), 1, 1); } }); }, { emissive: true, bias: .3 });
          else r.decal(g => r.groundRing(p.x, p.y, lerp(p.r0, p.r1, ease.outQuad(u)), p.color, 1 - u, p.z), { emissive: .8 * (1 - u) }); break;
        case 'text': r.overlay(g => { const [x, y] = r.w(p.x, p.y, p.z), sc2 = p.scale || 1; if (u < .75 || Math.floor(p.life * 20) % 2) E.font.text(g, p.text, x, y, p.color, { align: 'center', scale: sc2, outline: '#0b0814' }); }); break;
        case 'fire': r.queue(p.x, p.y, p.z, g => {   // fireball puff: white-hot core, yellow, orange, red rim, then smoke
          const [x, y] = r.w(p.x, p.y, p.z), rad = p.size * s * (u < .3 ? .6 + u * 1.4 : 1.02 - (u - .3) * .5), hot = u < .45;
          if (hot) px.glow(g, 1 - u);
          const c = u < .15 ? '#fffbe0' : u < .3 ? '#ffe070' : u < .5 ? '#ffa030' : u < .7 ? '#e0502a' : '#5a4a4a';
          if (!useAlpha(g)) { px.ddisc(g, x, y, rad, c, u < .7 ? 1 : 1.4 - u, r.ix, r.iy); if (u < .5) px.ddisc(g, x - rad * .2, y - rad * .2, rad * .55, u < .25 ? '#ffffff' : '#fff0a0', .9, r.ix, r.iy); }
          else px.blend(g, u < .7 ? 1 : (1 - u) / .3, 'normal', () => { px.disc(g, x, y, rad, c); if (u < .5) px.disc(g, x - rad * .2, y - rad * .2, rad * .55, u < .25 ? '#ffffff' : '#fff0a0'); else px.disc(g, x - rad * .25, y - rad * .25, rad * .4, shade(c, .2)); });
        }, { bias: .2, emissive: u < .5 }); break;
        case 'smoke': r.queue(p.x, p.y, p.z, g => {   // a hard-edged puff in three flat tones that fades in 1/8 steps
          const [x, y] = r.w(p.x, p.y, p.z), rad = p.size * s * (.6 + u * 1.3), body = u < .3 ? (p.dark || '#3a3438') : (p.color || '#7a7078');
          if (!useAlpha(g)) { px.ddisc(g, x, y, rad, body, (1 - u) * .85, r.ix, r.iy); px.ddisc(g, x - rad * .3, y - rad * .3, rad * .45, p.light || '#9a9098', (1 - u) * .5, r.ix, r.iy); return; }
          px.blend(g, (1 - u) * .8, 'normal', () => { px.disc(g, x, y, rad, shade(body, -.12)); px.disc(g, x - rad * .18, y - rad * .22, rad * .74, body); px.disc(g, x - rad * .34, y - rad * .4, rad * .34, p.light || shade(body, .22)); });
        }, { bias: .1 }); break;
        case 'impact': r.queue(p.x, p.y, p.z, g => {   // hit spark: a star burst that pops and shrinks (two frames of impact)
          const [x, y] = r.w(p.x, p.y, p.z), R = p.size * s * (u < .35 ? 1 : 1.4 - u), c = u < .35 ? '#ffffff' : p.color, n = 8;
          px.glow(g, 1);
          const pts = []; for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU + p.rot, rr = i % 2 ? R * .38 : R; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
          px.poly(g, pts, c); px.disc(g, x, y, Math.max(1, R * .3), '#ffffff');
        }, { bias: .4, emissive: true }); break;
        case 'glint': r.queue(p.x, p.y, p.z, g => { const [x, y] = r.w(p.x, p.y, p.z), k = Math.round((1 - Math.abs(u * 2 - 1)) * p.size * 2.5); px.glow(g, 1); px.rect(g, x - k, y, k * 2 + 1, 1, p.color); px.rect(g, x, y - k, 1, k * 2 + 1, p.color); px.dot(g, x, y, '#ffffff'); }, { bias: .3, emissive: true }); break;
      }
    }
  }
  dust(x, y, z, n, o = {}) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = (o.speed || 30) * (.4 + Math.random()); this.add({ kind: 'dust', x: x + Math.cos(a) * 2, y: y + Math.sin(a) * 2, z: z + Math.random() * 2, vx: Math.cos(a) * sp + (o.vx || 0), vy: Math.sin(a) * sp + (o.vy || 0), vz: 8 + Math.random() * 14, g: -6, drag: 5, max: .35 + Math.random() * .35, size: (o.size || 1.2) * (.7 + Math.random() * .6), color: o.color || '#b9a88f' }); } }
  sparks(x, y, z, n, dir = null, o = {}) { for (let i = 0; i < n; i++) { const a = dir === null ? Math.random() * TAU : dir + (Math.random() - .5) * 1.6, sp = 80 + Math.random() * 170; this.add({ kind: 'spark', x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 20 + Math.random() * 110, g: 360, drag: 3, max: .15 + Math.random() * .2, color: o.color || '#ffb85c', hot: o.hot }); } }
  bits(x, y, z, n, colors) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 30 + Math.random() * 90; this.add({ kind: 'bit', x, y, z: z + Math.random() * 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 60 + Math.random() * 120, g: 420, bounce: .45, drag: .8, max: .7 + Math.random() * .6, size: Math.random() < .35 ? 2 : 1, color: colors[(Math.random() * colors.length) | 0] }); } }
  ring(x, y, r0, r1, color, dur = .35, z = 0) { this.add({ kind: 'ring', x, y, z, r0, r1, color, max: dur }); }
  /** floating number or word: text(x, y, z, '12', color, { scale: 2, bounce: true }) (bounce: lands and holds, Final Fantasy style) */
  text(x, y, z, text, color = '#fff2c4', o = {}) { this.add({ kind: 'text', x, y, z, vz: o.bounce ? 70 : 38, g: o.bounce ? 260 : 40, bounce: o.bounce ? .35 : 0, floor: o.bounce ? z : undefined, text: String(text), color, max: o.bounce ? 1.1 : .8, scale: o.scale || 1 }); }
  /** rising smoke puffs: smoke(x, y, z, n, { size, color, dark, light }) */
  smoke(x, y, z, n = 4, o = {}) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 8 + Math.random() * 14; this.add(Object.assign({ kind: 'smoke', x: x + Math.cos(a) * 3, y: y + Math.sin(a) * 3, z: z + Math.random() * 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 14 + Math.random() * 18, g: -4, drag: 1.5, max: .9 + Math.random() * .7, size: (o.size || 4) * (.7 + Math.random() * .6) }, o, { size: (o.size || 4) * (.7 + Math.random() * .6) })); } }
  /** fireball puffs for explosions and fire breath */
  fire(x, y, z, n = 6, o = {}) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = (o.speed || 40) * Math.random(); this.add({ kind: 'fire', x: x + Math.cos(a) * 2, y: y + Math.sin(a) * 2, z: z + Math.random() * 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 10 + Math.random() * 30, g: -10, drag: 3, max: .35 + Math.random() * .35, size: (o.size || 5) * (.6 + Math.random() * .6) }); } }
  /** a hit star at the point of impact: impact(x, y, z, size = 6, color) */
  impact(x, y, z, size = 6, color = '#ffe070') { this.add({ kind: 'impact', x, y, z, max: .16, size, color, rot: Math.random() * TAU }); }
  /** twinkling star glints for magic, treasure and pickups */
  glints(x, y, z, n = 5, color = '#fff6c0', spread = 10) { for (let i = 0; i < n; i++) this.add({ kind: 'glint', x: x + (Math.random() - .5) * spread, y: y + (Math.random() - .5) * spread, z: z + Math.random() * spread, vz: 6, max: .35 + Math.random() * .4, size: 1 + Math.random(), color }); }
  /**
   * a full explosion in one call: fireball, smoke, sparks, debris, shockwave ring, screen shake and flash, sound.
   * explosion(x, y, z, size = 1, { debris: ['#6a5a4a'], sound: true, flash: true })
   */
  explosion(x, y, z, size = 1, o = {}) {
    const G = this.game;
    this.fire(x, y, z, Math.round(7 * size), { size: 5 * size, speed: 45 * size });
    this.smoke(x, y, z + 4 * size, Math.round(5 * size), { size: 5 * size });
    this.sparks(x, y, z, Math.round(10 * size));
    if (o.debris !== false) this.bits(x, y, z, Math.round(8 * size), o.debris || ['#6a5a4a', '#3a3438', '#ffb040']);
    this.ring(x, y, 3 * size, 26 * size, '#ffe0a0', .4, z);
    if (o.shake !== 0) G.shake(o.shake === undefined ? 2.5 * size : o.shake); if (o.freeze !== false) G.freeze(.03 * Math.min(2, size));
    if (o.flash !== false && size >= 1.5) G.flash('#fff4d0', .12);
    if (o.sound !== false) G.audio.sfx(size >= 1.5 ? 'boom' : 'explode');
  }
}
E.Particles = Particles;

/* =============================================================================
 * 9. RENDERER  per-frame drawing API handed to your draw(r) function
 * ============================================================================= */
const AS = 256, AOX = 128, AOY = 200;  // scratch image per character: room for bosses up to about 250 px, capes, lying bodies
class Renderer {
  constructor(game) {
    this.game = game; this.items = []; this.decals = []; this.overlays = [];
    this.aCv = mkCanvas(AS, AS); this.aG = ctx2d(this.aCv);
    // track what each actor actually draws, so outlines, tints and rim light only touch that rectangle
    const aG = this.aG, bb = this.bb = [AS, AS, 0, 0], fr = aG.fillRect.bind(aG), di = aG.drawImage.bind(aG);
    const grow = (x, y, w, h) => { if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (x + w > bb[2]) bb[2] = x + w; if (y + h > bb[3]) bb[3] = y + h; };
    aG.fillRect = (x, y, w, h) => { grow(x, y, w, h); fr(x, y, w, h); };
    aG.drawImage = (img, ...a) => { if (a.length >= 8) grow(a[4], a[5], a[6], a[7]); else if (a.length >= 4) grow(a[0], a[1], a[2], a[3]); else grow(a[0], a[1], img.width, img.height); di(img, ...a); };
    for (const m of ['fill', 'stroke', 'fillText', 'strokeText', 'putImageData']) { const f = aG[m].bind(aG); aG[m] = (...a) => { grow(0, 0, AS, AS); return f(...a); }; }
    this._R = [0, 0, AS, AS];
    this.mCv = mkCanvas(AS, AS); this.mG = ctx2d(this.mCv);
    this.rCv = mkCanvas(AS, AS); this.rG = ctx2d(this.rCv);
    this.xCv = mkCanvas(8, 8); this.xG = ctx2d(this.xCv); this.xoCv = mkCanvas(8, 8); this.xoG = ctx2d(this.xoCv);   // x-ray silhouettes (checkered fill) and their solid outlines
    this.oCv = mkCanvas(8, 8); this.oG = ctx2d(this.oCv);
    this.eCv = mkCanvas(8, 8); this.eG = ctx2d(this.eCv); this.sCv = mkCanvas(8, 8); this.sG = ctx2d(this.sCv);   // canvas lighting: the glow mask, a scratch layer
    this.ghostPool = Array.from({ length: 10 }, () => { const c = mkCanvas(AS, AS); return { cv: c, g: ctx2d(c) }; });
    this.ghostIdx = 0; this.ghosts = [];
    const ck = mkCanvas(2, 2), cg = ck.getContext('2d'); cg.fillStyle = '#000'; cg.fillRect(0, 0, 1, 1); cg.fillRect(1, 1, 1, 1);
    this.checker = ck;
    this.outline = '#140c1c'; this.rim = '#ffe2b8'; this.rimAlpha = .28; this.xrayColor = '#8fe3ff';
    // GPU mode: a hidden "info" image (height, surface type, glow) and an unlit overlay image
    this.iCv = mkCanvas(8, 8); this.iG = this.iCv.getContext('2d'); this.iG._info = true; this.iG._r = this; this.iG._mat = '#000';
    this.vCv = mkCanvas(8, 8); this.vG = ctx2d(this.vCv); this.gpu = false; this._tg = null;
  }
  /** current draw target for ground helpers (switches during GPU info and overlay passes) */
  get tgt() { return this._tg || this.ctx; }
  get ctx() { return this.game.screen.ctx; }
  get view() { return this.game.view; }
  get W() { return this.game.screen.W; }
  get H() { return this.game.screen.H; }
  get bw() { return this.game.screen.buf.width; }
  get bh() { return this.game.screen.buf.height; }
  begin(cx, cy) {
    const sc = this.game.screen;
    sc.begin(cx, cy, this.game.o.bg);
    this.ix = sc.ix; this.iy = sc.iy; this.items.length = 0; this.decals.length = 0; this.overlays.length = 0; this._map = null; (this.emis || (this.emis = [])).length = 0;
    const st = this.game.stats; st.actors = 0; st.culled = 0;
    if (this.xCv.width !== this.bw || this.xCv.height !== this.bh) { this.xCv.width = this.xoCv.width = this.oCv.width = this.eCv.width = this.sCv.width = this.bw; this.xCv.height = this.xoCv.height = this.oCv.height = this.eCv.height = this.sCv.height = this.bh; }
    this.xrayUsed = false; this.xrayOl = false; this.emOn = false;
    const gpu = this.game.gpu;
    this.gpu = !!(gpu && gpu.active(this.view));
    if (gpu) gpu.show(this.gpu);
    if (this.gpu) {
      if (this.iCv.width !== this.bw || this.iCv.height !== this.bh) { this.iCv.width = this.vCv.width = this.bw; this.iCv.height = this.vCv.height = this.bh; }
      const iG = this.iG; iG.globalCompositeOperation = 'source-over'; iG.globalAlpha = 1; iG.fillStyle = '#000'; iG.fillRect(0, 0, this.bw, this.bh); iG._c = null; iG._mat = '#000';
      this.vG.clearRect(0, 0, this.bw, this.bh); this.vG._c = null;
    }
  }
  /** world -> buffer pixel coords */
  w(x, y, z = 0) { const v = this.game.view; return [v.ax * x + v.ay * y - this.ix, v.bx * x + v.by * y + v.bz * z - this.iy]; }
  /** queue a depth-sorted draw. fn(g) draws into g. opts: {bias, occluder, hides, xray, emissive, solid (hides a glow behind it)}
   *  occluder: a wall (x-ray silhouettes show through it, it sorts as a block). hides: only lets x-ray silhouettes show
   *  through it (props, sprites, bodies), nothing else changes */
  queue(x, y, z, fn, o) {
    let k = this.game.view.order(x, y, z) + (o && o.bias || 0);
    // things standing on top of a TileMap wall block must sort after that block
    if (z > .5 && this._map && !(o && o.occluder)) k = this._map._liftOrder(this.game.view, x, y, z, k);
    const it = { k, fn, occ: o && o.occluder, hides: o && o.hides, box: o && o.box, actor: o && o.actor, xray: o && o.xray, x, y, z, info: o && o.info, noInfo: o && o.noInfo, em: !!(o && o.emissive), solid: !!(o && (o.solid || o.occluder)) };
    this.items.push(it);
    if (it.em) this.emis.push(it);   // glowing things: canvas lighting leaves them out of the darkness (see flush)
  }
  /** draw on the floor before the queue. opts.emissive (0..1) makes it glow under GPU lighting */
  decal(fn, o) { this.decals.push({ fn, e: o && o.emissive || 0 }); }
  overlay(fn) { this.overlays.push(fn); }
  /** ground helpers (all dithered, correct in every view) */
  groundPts(x, y, rad, n = 18, z = 0) { const pts = []; for (let i = 0; i < n; i++) { const a = i / n * TAU; pts.push(this.w(x + Math.cos(a) * rad, y + Math.sin(a) * rad, z)); } return pts; }
  groundDisc(x, y, rad, color, alpha = 1, z = 0) { px.polyDither(this.tgt, this.groundPts(x, y, rad, 18, z), color, alpha, this.ix, this.iy); }
  groundRing(x, y, rad, color, alpha = 1, z = 0) {
    const g = this.tgt, n = Math.max(16, Math.round(rad * this.view.scale * 5)), al = useAlpha(g), ga = g.globalAlpha; px.col(g, color);
    if (al) g.globalAlpha = ga * qa(alpha);
    for (let i = 0; i < n; i++) { const a = i / n * TAU, [sx, sy] = this.w(x + Math.cos(a) * rad, y + Math.sin(a) * rad, z), X = Math.round(sx), Y = Math.round(sy); if (al || alpha > bayer(X + this.ix, Y + this.iy)) g.fillRect(X, Y, 1, 1); }
    g.globalAlpha = ga;
  }
  groundArc(x, y, r0, r1, a0, a1, color, alpha = 1, z = 0, g = this.tgt) {
    const n = Math.max(3, Math.ceil(Math.abs(a1 - a0) / .18)), pts = [];
    for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); pts.push(this.w(x + Math.cos(a) * r1, y + Math.sin(a) * r1, z)); }
    for (let i = n; i >= 0; i--) { const a = lerp(a0, a1, i / n); pts.push(this.w(x + Math.cos(a) * r0, y + Math.sin(a) * r0, z)); }
    px.polyDither(g, pts, color, alpha, this.ix, this.iy);
  }
  _stamp(key, make) {
    const m = this._stamps || (this._stamps = new Map());
    let st = m.get(key); if (st) return st;
    if (m.size > 400) m.clear();
    st = make(); m.set(key, st); return st;
  }
  /** soft contact shadow under a character: a cached dithered ellipse, correct for the current view.
   *  z = height of the surface it falls on (0 = floor; the top of a block or platform otherwise) */
  shadow(x, y, rad, alpha = .5, color = '#0c0818', z = 0) {
    (z > .5 ? f => this.queue(x, y, z - .01, f, { noInfo: true, bias: -.001 }) : f => this.decal(f))(() => {
      const v = this.view, R = Math.round(rad * 2) / 2, A = Math.round(alpha * 20) / 20, st2 = E.style.trans;
      const st = this._stamp('s' + v.id + v.pitchDeg + v.yawDeg + v.scale + ':' + R + ':' + A + color + st2, () => {
        const pts = []; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (let i = 0; i < 18; i++) { const a = i / 18 * TAU, q = v.p(Math.cos(a) * R, Math.sin(a) * R, 0); pts.push(q); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
        const ox = Math.floor(x0) - 1, oy = Math.floor(y0) - 1, c = mkCanvas(Math.ceil(x1) - ox + 2, Math.ceil(y1) - oy + 2), g = ctx2d(c);
        px.polyDither(g, pts.map(q => [q[0] - ox, q[1] - oy]), color, A, 0, 0);
        return { c, ox, oy };
      });
      const [sx, sy] = this.w(x, y, z); (z > .5 ? this.ctx : this.tgt).drawImage(st.c, Math.round(sx) + st.ox, Math.round(sy) + st.oy);
    });
  }
  /**
   * Queue a pixel sprite (from E.sprite) standing at world point (x, y, z). Depth sorted like an actor.
   * opts: { flip, anchor: 'bottom' (feet on the point, default) | 'center' | 'top', glow: 0..1,
   *         bias, flash, outline, alpha, xray, ghost }  (the last five use the actor path)
   */
  sprite(x, y, z, spr, o = {}) {
    if (!spr || !spr.isSprite) { warn('r.sprite', 'r.sprite(x, y, z, spr) needs a sprite made with E.sprite(rows, colors)'); return; }
    if (this.view.zoom && this.view.zoom !== 1) spr = scaleSprite(spr, this.view.zoom);   // camera zoom: whole-pixel nearest-neighbour copy
    const ax = Math.floor(spr.w / 2), ay = o.anchor === 'center' ? Math.floor(spr.h / 2) : o.anchor === 'top' ? 0 : spr.h, flip = !!o.flip, gl = o.glow || 0;
    if (o.flash || o.outline || o.xray || o.ghost || (o.alpha !== undefined && o.alpha < 1)) {
      this.actor(x, y, z, (g, ox, oy) => { if (gl) px.glow(g, gl); px.sprite(g, spr, ox - ax, oy - ay, flip); }, Object.assign({ outline: false, rim: false, emissive: gl }, o));
      return;
    }
    if (!this.visible(x, y, z, spr.w + 8, spr.h + 8, spr.h + 8)) return;
    this.queue(x, y, z, g => { if (gl) px.glow(g, gl); const [sx, sy] = this.w(x, y, z); px.sprite(g, spr, Math.round(sx) - ax, Math.round(sy) - ay, flip); }, { bias: o.bias, emissive: gl > .4, hides: o.hides });
  }
  /**
   * set dressing from E.prop: r.prop('torch', x, y, z, { size, color, flip, light: true, halo: true, bias, hides })
   * feet on the world point; flames animate and glow. light: true also adds a warm light to game.lights.
   * A prop drawn in front of an x-ray actor (a pillar, a statue, a brazier) shows the actor's silhouette through it;
   * hides: false opts a prop out.
   */
  prop(name, x, y, z, o = {}) {
    const zm = this.view.zoom || 1, p = E.prop(name, zm !== 1 ? Object.assign({}, o, { size: (o.size || 1) * zm }) : o); if (!p) return;
    const spr = p.frames[0], ax = Math.floor(spr.w / 2), ay = o.anchor === 'top' ? 0 : spr.h, flip = !!o.flip, t = this.game.real;
    if (!this.visible(x, y, z, spr.w + 20, spr.h + 20, spr.h + 20)) return;
    const gf = p.glow ? p.glow[Math.floor((t * 9 + x * .37) % p.glow.length)] : null;
    const at = () => { const [sx, sy] = this.w(x, y, z); return [Math.round(sx) - ax, Math.round(sy) - ay]; };
    const [bX, bY] = at();
    this.queue(x, y, z, g => { const [X, Y] = at(); if (p.emissive) px.glow(g, .8); px.sprite(g, spr, X, Y, flip); }, { bias: o.bias, hides: o.hides !== false, box: [bX, bY, bX + spr.w, bY + spr.h] });
    if (p.glowAt && o.halo !== false) this.queue(x, y, z, g => {   // lamps, lanterns and crystals glow even with lighting off; cone: true adds a light cone below
      if (g._info) return;
      const [X, Y] = at(), gx = X + spr.w * p.glowAt[0], gy = Y + spr.h * p.glowAt[1], R = o.haloR || Math.max(6, spr.w * .9), c = o.haloColor || p.glowAt[2];
      if (o.cone) px.blend(g, .14, 'add', () => px.poly(g, [[gx - spr.w * .25, gy], [gx + spr.w * .25, gy], [gx + R * 1.3, Y + spr.h], [gx - R * 1.3, Y + spr.h]], c));
      this.glowDisc(g, gx, gy, R, c, .2); this.glowDisc(g, gx, gy, R * .5, c, .3);
    }, { bias: (o.bias || 0) + .001, emissive: true });
    if (gf) this.queue(x, y, z, g => {   // flames: their own item, emissive so lighting never dims them
      const [X, Y] = at(); px.glow(g, 1); px.sprite(g, gf, X, Y, flip);
      if (o.halo !== false && !g._info) this.glowDisc(g, X + (flip ? spr.w - gf.mx : gf.mx), Y + gf.my, o.haloR || Math.max(3, Math.min(10, spr.w * .45)), o.haloColor || '#ffb040', .16);
    }, { bias: (o.bias || 0) + .001, emissive: true });
    if (o.light && p.light) this.game.lights.add(x, y, z + spr.h * .7 / Math.max(.1, this.view.scale), o.lightRadius || 70, o.lightIntensity || 1, { color: o.lightColor || p.light, shadow: !!o.shadow });
  }
  /** background of dithered color bands, top to bottom: r.sky(['#0b1030', '#3b2d6b', '#e0806a']). Call first in draw. */
  sky(colors, o = {}) {
    if (typeof colors === 'string') colors = [colors];
    const W = this.bw, H = this.bh, smooth = (o.style || (E.style.trans === 'dither' ? 'dither' : 'smooth')) === 'smooth', key = 'sky' + colors.join() + W + 'x' + H + (o.bands || 0) + smooth;
    const st = this._stamp(key, () => {
      const c = mkCanvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data, cs = colors.map(hex), n = cs.length, steps = o.bands || 0;
      for (let y = 0; y < H; y++) {
        let f = n < 2 ? 0 : y / Math.max(1, H - 1) * (n - 1); if (steps) f = Math.round(f * steps) / steps;
        const i = Math.min(n - 2, Math.max(0, Math.floor(f))), t = f - i;
        // smooth: a 15-bit color gradient (PS1 style bands of one row); dither: ordered dither between stops
        const sm = n < 2 ? cs[0] : cs[i].map((v, j) => (Math.round(lerp(v, cs[i + 1][j], t) / 8) * 8));
        for (let x = 0; x < W; x++) {
          const col = smooth ? sm : n < 2 ? cs[0] : (t > bayer(x, y) ? cs[i + 1] : cs[i]), k = (y * W + x) * 4;
          d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0); return c;
    });
    this.ctx.drawImage(st, 0, 0);
  }
  /** scrolling star dots for space and night skies. opts: { count: 70, speed: 30 px/s, dir: 'down' | 'up' | 'left' | 'right', colors, layers: 3, seed } */
  starfield(o = {}) {
    const g = this.ctx, W = this.bw, H = this.bh, t = this.game.time, n = o.count || 70, sp = o.speed === undefined ? 30 : o.speed;
    const cols = o.colors || ['#ffffff', '#a9b8ff', '#5d6aa0'], layers = o.layers || 3, seed = o.seed || 7, dir = o.dir || 'down', maxY = o.height ? H * o.height : H;
    for (let i = 0; i < n; i++) {
      const L = i % layers, k = 1 - L / (layers + .5), d = t * sp * k;
      let x = hash2(i, seed) * W, y = hash2(i + 7919, seed) * maxY;
      if (dir === 'down') y += d; else if (dir === 'up') y -= d; else if (dir === 'left') x -= d; else x += d;
      x = ((x % W) + W) % W; y = ((y % maxY) + maxY) % maxY;
      const c = cols[Math.min(cols.length - 1, L)];
      px.dot(g, x, y, c);
      if (L === 0 && hash2(i, seed + 1) > .75) { if (dir === 'down' || dir === 'up') px.dot(g, x, y + (dir === 'down' ? -1 : 1), c); else px.dot(g, x + (dir === 'left' ? 1 : -1), y, c); }
    }
  }
  /** HUD text in screen pixels, drawn on top and never lit: r.text('SCORE 120', 4, 4, '#fff', { align, scale, outline }) */
  text(str, x, y, color = '#ffffff', o) { this.overlay(g => E.font.text(g, str, x, y, color, o)); }
  /** text floating at a world point (names, prompts): r.textAt(x, y, z, 'OPEN', '#ffe08a') */
  textAt(x, y, z, str, color = '#ffffff', o = {}) { this.overlay(g => { const [sx, sy] = this.w(x, y, z); E.font.text(g, str, sx, sy, color, Object.assign({ align: 'center' }, o)); }); }
  /** 4x4 dithered black pattern covering `level` (0..1) of the pixels, for fades */
  _fadePattern(level) {
    const q = Math.round(clamp(level, 0, 1) * 16);
    return this._stamp('fade' + q, () => { const c = mkCanvas(4, 4), g = c.getContext('2d'); g.fillStyle = '#000'; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (bayer(x, y) < q / 16) g.fillRect(x, y, 1, 1); return c; });
  }
  /** glow halo from a cache: additive light rings (alpha style) or a dithered disc (dither style). a = 0..1 strength */
  glowDisc(g, cx, cy, rad, color, a) {
    if (g._info) return px.ddisc(g, cx, cy, rad, color, a, 0, 0);
    if (g._cover) return px.disc(g, cx, cy, rad * .7, '#fff');   // (the glow cut mask: its bright core is in front)
    const R = Math.round(rad * 2) / 2, A = Math.round(a * 20) / 20, n = Math.ceil(R) + 1, al = E.style.trans !== 'dither';
    const st = this._stamp('d' + R + ':' + A + color + al, () => { const c = mkCanvas(n * 2 + 1, n * 2 + 1), cg = ctx2d(c); px.ddisc(cg, n, n, R, color, al ? Math.min(1, A * 1.6) : A, 0, 0); return c; });
    if (al) px.blend(g, 1, 'add', () => g.drawImage(st, Math.round(cx) - n, Math.round(cy) - n));
    else g.drawImage(st, Math.round(cx) - n, Math.round(cy) - n);
  }
  /** extruded box prop (crate, pedestal, table). Call inside a queue fn with its g. */
  box(g, x0, y0, z0, x1, y1, z1, top, side) {
    if (typeof top !== 'string' || typeof side !== 'string') { warn('box:args', 'r.box(g, x0, y0, z0, x1, y1, z1, topColor, sideColor) needs 9 arguments: both corners in x, y, z, then two hex colors'); top = typeof top === 'string' ? top : '#ff00ff'; side = typeof side === 'string' ? side : top; }
    const view = this.view, P = (x, y, z) => this.w(x, y, z), inf = g._info, prev = g._mat;
    if (!view.isTop) {
      for (const [nx, ny, A, B] of [[0, -1, [x1, y0], [x0, y0]], [0, 1, [x0, y1], [x1, y1]], [-1, 0, [x0, y0], [x0, y1]], [1, 0, [x1, y1], [x1, y0]]]) {
        if (nx * view.fx + ny * view.fy <= .02) continue;
        if (inf) { g._mat = this._faceMat(g, A, B, z0, z1, E.faceClass(nx, ny)); g._c = null; }
        const lit = .6 * nx + .8 * ny, col = lit < -.2 ? shade(side, .12) : lit > .5 ? shade(side, -.25) : side;
        px.poly(g, [P(A[0], A[1], z0), P(B[0], B[1], z0), P(B[0], B[1], z1), P(A[0], A[1], z1)], col);
      }
    }
    if (inf) { g._mat = this._infoCol(z1, 4, 0); g._c = null; }
    px.poly(g, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], top);
    if (inf) { g._mat = prev; g._c = null; }
  }
  /* ---- GPU info encoding: R = height * 3, G = surface class * 20, B = glow * 255 ---- */
  _infoCol(z, cls, e) { return 'rgb(' + clamp(Math.round(z * 3), 0, 255) + ',' + cls * 20 + ',' + clamp(Math.round(e * 255), 0, 255) + ')'; }
  _infoVert(g, x, y, z, cls, e, oy) {
    const v = this.view, span = Math.max(1, Math.min(50, 85 - z));
    if (e > 0 || Math.abs(v.bz) < .05) return this._infoCol(z, cls, e);
    const sy = oy !== undefined ? oy : this.w(x, y, z)[1], gr = g.createLinearGradient(0, sy, 0, sy + v.bz * span);
    gr.addColorStop(0, this._infoCol(z, cls, 0)); gr.addColorStop(1, this._infoCol(z + span, cls, 0));
    return gr;
  }
  /** height gradient across a vertical face whose bottom edge runs A -> B (ground points) */
  _faceMat(g, A, B, z0, z1, cls) {
    const P0 = this.w(A[0], A[1], z0), P1 = this.w(B[0], B[1], z0), Ex = P1[0] - P0[0], Ey = P1[1] - P0[1], c = Ex * this.view.bz;
    if (Math.abs(c) < 1e-6) return this._infoCol(z0, cls, 0);
    const nx = -Ey, ny = Ex, k = (z1 - z0) * c / (nx * nx + ny * ny), gr = g.createLinearGradient(P0[0], P0[1], P0[0] + nx * k, P0[1] + ny * k);
    gr.addColorStop(0, this._infoCol(z0, cls, 0)); gr.addColorStop(1, this._infoCol(z1, cls, 0));
    return gr;
  }
  _actorInfo(gI, x, y, z, o) {
    const [sx, sy] = this.w(x, y, z), bx = Math.round(sx) - AOX, by = Math.round(sy) - AOY;
    const R = this._R; if (!R[2]) return;
    this._tint(this.mG, this.aCv, this._infoVert(this.mG, 0, 0, z, 10, o.emissive || 0, AOY), R);
    gI.drawImage(this.mCv, R[0], R[1], R[2], R[3], bx + R[0], by + R[1], R[2], R[3]);
  }
  /**
   * Queue a character. drawFn(g, ox, oy) must draw with (ox, oy) as the projected
   * position of world point (x, y, z). The engine adds outline, rim light, hit flash,
   * afterimages and x-ray silhouettes.
   * opts: {outline=true, rim=true, flash=false, alpha=1, xray=false, ghost:{color, life, alpha, owner}, hides, bias}
   *   xray: true shows a checkered silhouette wherever a wall (or a prop, or anything queued with hides) is drawn in
   *     front of the actor; xray: { color, outline, actors } picks the fill color, adds a solid 1-px outline in that
   *     color around the hidden part (reads through busy pillars and dark walls), and with actors: true other bodies
   *     drawn in front hide it too (a hero lost in a crowd keeps his shape)
   *   hides: true: this actor counts as an x-ray occluder even when no x-ray actor asked for actors
   *   ghost.owner (any {x, y, z}, usually the actor itself) keeps its afterimages sorted behind the live body
   */
  /** is a world point near the visible area? margins in pixels (characters extend upward from their feet) */
  visible(x, y, z = 0, mx = 60, up = 30, down = 90) { const [sx, sy] = this.w(x, y, z); return sx > -mx && sx < this.bw + mx && sy > -up && sy < this.bh + down; }
  actor(x, y, z, drawFn, o = {}) {
    const st = this.game.stats;
    if (!this.visible(x, y, z, o.margin || 60)) { st.culled++; return; }
    st.actors++;
    // fast path: nothing needs the offscreen composite, so draw straight into the frame
    if (o.outline === false && !o.flash && !o.ghost && !o.xray && (o.rim === false || this.gpu) && (o.alpha === undefined || o.alpha >= 1)) {
      const info = o.emissive ? gI => { gI._mat = this._infoCol(z, 10, o.emissive); gI._c = null; const [a, b] = this.w(x, y, z); drawFn(gI, Math.round(a), Math.round(b)); } : undefined;
      this.queue(x, y, z, g => { const [a, b] = this.w(x, y, z); drawFn(g, Math.round(a), Math.round(b)); }, { bias: o.bias, info, solid: true, actor: true, hides: o.hides });
      return;
    }
    this.queue(x, y, z, g => this._composite(g, x, y, z, drawFn, o), { bias: o.bias, xray: o.xray, info: gI => this._actorInfo(gI, x, y, z, o), solid: o.alpha === undefined || o.alpha > .5, actor: !o.xray, hides: o.hides });
  }
  _tint(dst, src, color, R = [0, 0, AS, AS]) {
    const [x0, y0, w, h] = R;
    dst.globalCompositeOperation = 'source-over'; dst.clearRect(x0, y0, w, h); dst.drawImage(src, x0, y0, w, h, x0, y0, w, h);
    dst.globalCompositeOperation = 'source-in'; dst.fillStyle = color; dst._c = null; dst.fillRect(x0, y0, w, h);
    dst.globalCompositeOperation = 'source-over';
  }
  _composite(g, x, y, z, drawFn, o) {
    const aG = this.aG, bb = this.bb, P = this._R;
    aG.clearRect(P[0], P[1], P[2], P[3]); aG._c = null;
    bb[0] = AS; bb[1] = AS; bb[2] = 0; bb[3] = 0;
    drawFn(aG, AOX, AOY);
    const x0 = Math.max(0, Math.floor(bb[0]) - 2), y0 = Math.max(0, Math.floor(bb[1]) - 2), x1 = Math.min(AS, Math.ceil(bb[2]) + 2), y1 = Math.min(AS, Math.ceil(bb[3]) + 2);
    if (x1 <= x0 || y1 <= y0) { this._R = [0, 0, 0, 0]; return; }
    const R = this._R = [x0, y0, x1 - x0, y1 - y0], w = R[2], h = R[3];
    const [sx, sy] = this.w(x, y, z), bx = Math.round(sx) - AOX, by = Math.round(sy) - AOY, al = o.alpha === undefined ? 1 : o.alpha;
    if (g === this.ctx) this._comp = { x0, y0, w, h, bx, by, ol: o.outline !== false };
    const put = (cv, dx, dy) => g.drawImage(cv, x0, y0, w, h, bx + x0 + dx, by + y0 + dy, w, h);
    g.globalAlpha = al;
    if (o.outline !== false) { this._tint(this.mG, this.aCv, o.outlineColor || this.outline, R); for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) put(this.mCv, dx, dy); }
    if (o.flash) {   // palette flash: the tint over the sprite, so its shading still shows (flashMix: 1 = solid)
      const fm = o.flashMix === undefined ? .5 : o.flashMix;
      if (fm < 1) put(this.aCv, 0, 0);
      this._tint(this.mG, this.aCv, typeof o.flash === 'string' ? o.flash : '#fff6ea', R); g.globalAlpha = al * fm; put(this.mCv, 0, 0);
    } else {
      put(this.aCv, 0, 0);
      if (o.rim !== false && !this.gpu) {
        const rG = this.rG; rG.globalCompositeOperation = 'source-over'; rG.clearRect(x0, y0, w, h); rG.drawImage(this.aCv, x0, y0, w, h, x0, y0, w, h);
        rG.globalCompositeOperation = 'destination-out'; rG.drawImage(this.aCv, x0, y0, w, h, x0 - 1, y0, w, h);
        rG.globalCompositeOperation = 'source-in'; rG.fillStyle = o.rimColor || this.rim; rG._c = null; rG.fillRect(x0, y0, w, h); rG.globalCompositeOperation = 'source-over';
        g.globalAlpha = al * this.rimAlpha; put(this.rCv, 0, 0);
      }
    }
    g.globalAlpha = 1;
    if (o.ghost) {
      const gp = this.ghostPool[this.ghostIdx++ % this.ghostPool.length];
      gp.g.clearRect(0, 0, AS, AS); this._tint(gp.g, this.aCv, o.ghost.color || '#62d8ff', R);
      this.ghosts = this.ghosts.filter(q => q.gp !== gp);
      this.ghosts.push({ gp, x, y, z, t: this.game.time, life: o.ghost.life || .22, alpha: o.ghost.alpha === undefined ? .5 : o.ghost.alpha, owner: o.ghost.owner || null });
    }
    if (o.xray) {
      const X = o.xray === true ? null : o.xray;
      this._tint(this.mG, this.aCv, X && X.color || this.xrayColor, R); this.xG.drawImage(this.mCv, x0, y0, w, h, bx + x0, by + y0, w, h); this.xrayUsed = true;
      const B = this._xrB || (this._xrB = [1e9, 1e9, -1e9, -1e9]); B[0] = Math.min(B[0], bx + x0 - 2); B[1] = Math.min(B[1], by + y0 - 2); B[2] = Math.max(B[2], bx + x0 + w + 2); B[3] = Math.max(B[3], by + y0 + h + 2);   // where silhouettes are: occluders elsewhere need not join the mask
      if (X && X.outline) {   // the ring just outside the silhouette: four shifted copies, less the silhouette itself
        const xo = this.xoG; this._tint(this.mG, this.aCv, X.outline, R);
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) xo.drawImage(this.mCv, x0, y0, w, h, bx + x0 + dx, by + y0 + dy, w, h);
        xo.globalCompositeOperation = 'destination-out'; xo.drawImage(this.aCv, x0, y0, w, h, bx + x0, by + y0, w, h); xo.globalCompositeOperation = 'source-over';
        this.xrayOl = true;
      }
    }
  }
  /** add a solid item's shape to the cut mask: a body from its composite (with its outline), a wall by drawing it again */
  _emCut(eG, it) {
    const c = this._comp;
    if (c) { const cut = (dx, dy) => eG.drawImage(this.aCv, c.x0, c.y0, c.w, c.h, c.bx + c.x0 + dx, c.by + c.y0 + dy, c.w, c.h); cut(0, 0); if (c.ol) { cut(-1, 0); cut(1, 0); cut(0, -1); cut(0, 1); } }
    else if (it.occ) { this._tg = eG; try { it.fn(eG); } finally { this._tg = null; } eG.globalAlpha = 1; }
    else {   // anything else solid (a body drawn straight into the frame): drawn again on a scratch layer, in a body-sized box
      const [sx, sy] = this.w(it.x, it.y, it.z), x0 = Math.max(0, Math.round(sx) - AOX), y0 = Math.max(0, Math.round(sy) - AOY), w = Math.min(this.bw, x0 + AS) - x0, h = Math.min(this.bh, y0 + AS) - y0;
      if (w > 0 && h > 0) { const sG = this.sG; sG.globalCompositeOperation = 'source-over'; sG.globalAlpha = 1; sG.clearRect(x0, y0, w, h); sG._c = null; this._tg = sG; try { it.fn(sG); } finally { this._tg = null; } eG.drawImage(this.sCv, x0, y0, w, h, x0, y0, w, h); }
    }
    eG.globalAlpha = 1; eG._c = null;
  }
  /** afterimages sort just behind their own spot; with ghost.owner (any {x, y, z}: the actor itself) a ghost left nearer
   *  the camera than where its owner is now (running or rolling away from the camera) sorts behind the owner instead,
   *  so a trail never covers the live body with a blob of tinted copies */
  _drawGhosts() {
    const t = this.game.time, v = this.game.view;
    this.ghosts = this.ghosts.filter(q => t - q.t < q.life);
    for (const q of this.ghosts) {
      const w = q.owner, ahead = w && v.order(q.x, q.y, q.z) > v.order(w.x, w.y, w.z || 0) - .05, at = ahead ? [w.x, w.y, w.z || 0] : [q.x, q.y, q.z];
      this.queue(at[0], at[1], at[2], g => {
        const [sx, sy] = this.w(q.x, q.y, q.z);
        g.globalAlpha = q.alpha * (1 - (t - q.t) / q.life); g.drawImage(q.gp.cv, Math.round(sx) - AOX, Math.round(sy) - AOY); g.globalAlpha = 1;
      }, { bias: -.05, noInfo: true });
    }
  }
  flush() {
    const g = this.ctx, items = this.items;
    this.game.stats.items = items.length;
    items.sort((a, b) => a.k - b.k);
    const pb = this._xrPrev; if (pb) { this.xG.clearRect(pb[0], pb[1], pb[2] - pb[0], pb[3] - pb[1]); this.xoG.clearRect(pb[0], pb[1], pb[2] - pb[0], pb[3] - pb[1]); this._xrPrev = null; }   // (the x-ray layers only ever hold the silhouettes' box)
    this.oG.clearRect(0, 0, this.bw, this.bh); this.oG._c = null;
    let xr = false, xa = false, xRe = 0;   // an x-ray actor has been drawn (walls and hiding things after it cover it); one asked for bodies too
    this._xrB = null;
    const xOver = (x0, y0, x1, y1) => { const B = this._xrB; return !!B && x1 > B[0] && x0 < B[2] && y1 > B[1] && y0 < B[3]; };
    const gpu = this.gpu, iG = this.iG;
    // canvas lighting draws the glows again after the darkness (so it never dims them). The cut mask K keeps that redraw
    // behind what stands in front: in depth order, a wall or a body drawn after a glow adds its shape to K, and a glow
    // drawn later still (in front of that) takes its whole footprint back out. finish() then restores K's lit pixels
    // (a coarse grid of where glows have been drawn so far lets the walls and bodies nowhere near one skip the mask)
    const em = this.glowMask !== false && !gpu && this.game.lights.enabled && this.emis.length > 0, eG = this.eG;   // (r.glowMask = false: glows over everything, cheaper)
    let eOn = false, kOn = false, eg = null, gw = 0;
    if (em) {
      eG.globalCompositeOperation = 'source-over'; eG.globalAlpha = 1; eG.clearRect(0, 0, this.bw, this.bh); eG._c = null;
      gw = (this.bw >> 5) + 1; const n = gw * ((this.bh >> 5) + 1); eg = this._eGrid && this._eGrid.length === n ? this._eGrid.fill(0) : (this._eGrid = new Uint8Array(n));
    }
    const gh = em ? (this.bh >> 5) + 1 : 0, cell = (x0, y0, x1, y1, mark) => {   // screen box -> grid cells: mark them, or test them
      const a = clamp(x0 >> 5, 0, gw - 1), b = clamp(x1 >> 5, 0, gw - 1), c = clamp(y0 >> 5, 0, gh - 1), d = clamp(y1 >> 5, 0, gh - 1);
      for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) { if (mark) eg[y * gw + x] = 1; else if (eg[y * gw + x]) return true; }
      return false;
    };
    for (const it of items) {
      this._comp = null;
      it.fn(g);
      if (em) {
        if (it.em) {
          eOn = true; const [sx, sy] = this.w(it.x, it.y, it.z); cell(sx - 56 | 0, sy - 96 | 0, sx + 56 | 0, sy + 40 | 0, true);
          if (kOn) { eG._cover = true; eG.globalCompositeOperation = 'destination-out'; this._tg = eG; try { it.fn(eG); } finally { this._tg = null; eG._cover = false; eG.globalCompositeOperation = 'source-over'; eG.globalAlpha = 1; eG._c = null; } }
        } else if (eOn && it.solid) {
          const c = this._comp; let hit;
          if (c) hit = cell(c.bx + c.x0, c.by + c.y0, c.bx + c.x0 + c.w, c.by + c.y0 + c.h, false);
          else { const [sx, sy] = this.w(it.x, it.y, it.z), s = this.view.scale || 1; hit = cell(sx - 24 * s | 0, sy - 72 * s | 0, sx + 24 * s | 0, sy + 16 * s | 0, false); }
          if (hit) { this._emCut(eG, it); kOn = true; }
        }
      }
      if (gpu && !it.noInfo) {
        if (it.info) it.info(iG);
        else { iG._mat = this._infoVert(iG, it.x, it.y, it.z, 10, 0); iG._z = it.z; iG._c = null; it.fn(iG); }
      }
      if (it.xray) { xr = true; if (it.xray.actors) xa = true; }
      else if (xr && (it.occ || it.hides || (xa && it.actor))) {   // x-ray occluders go into the mask: walls and props drawn again, bodies from their composite
        const c = this._comp;   // (props and bodies only where they overlap a silhouette: a crowd redrawn in full cost a third of the frame)
        if (it.actor && !it.occ) {
          if (c) { if (xOver(c.bx + c.x0, c.by + c.y0, c.bx + c.x0 + c.w, c.by + c.y0 + c.h)) this.oG.drawImage(this.aCv, c.x0, c.y0, c.w, c.h, c.bx + c.x0, c.by + c.y0, c.w, c.h); }
          else { const [sx, sy] = this.w(it.x, it.y, it.z), s = this.view.scale || 1; if (xRe < 4 && xOver(sx - 12 * s, sy - 30 * s, sx + 12 * s, sy + 4 * s)) { xRe++; this.oG.globalAlpha = 1; it.fn(this.oG); this.oG.globalAlpha = 1; } }   // a body drawn straight to the frame is drawn again: only the few right in front
        } else if (it.box ? xOver(it.box[0], it.box[1], it.box[2], it.box[3]) : !it.occ || (() => { const [sx, sy] = this.w(it.x, it.y, 0), s = this.view.scale || 1; return xOver(sx - 24 * s, sy - 120 * s, sx + 24 * s, sy + 20 * s); })()) { this.oG.globalAlpha = 1; it.fn(this.oG); this.oG.globalAlpha = 1; }   // (a wall block far from every silhouette is skipped: a generous box, a block is 16 wide and rarely 70 tall)
      }
    }
    this.emOn = kOn;
    if (this.xrayUsed && this._xrB) {   // every x-ray pass works inside the silhouettes' box only (full-frame composites cost more than the rest of it)
      const B = this._xrB, x0 = Math.max(0, Math.floor(B[0])), y0 = Math.max(0, Math.floor(B[1])), x1 = Math.min(this.bw, Math.ceil(B[2])), y1 = Math.min(this.bh, Math.ceil(B[3])), w = x1 - x0, h = y1 - y0;
      if (w > 0 && h > 0) {
        this._xrPrev = [x0, y0, x1, y1];
        const xG = this.xG, dst = gpu ? this.vG : g, mask = G => { G.save(); G.beginPath(); G.rect(x0, y0, w, h); G.clip(); G.globalCompositeOperation = 'destination-in'; G.drawImage(this.oCv, x0, y0, w, h, x0, y0, w, h); };
        mask(xG); xG.fillStyle = xG.createPattern(this.checker, 'repeat'); xG._c = null;
        xG.translate((this.ix + this.iy) & 1, 0); xG.fillRect(x0 - 2, y0, w + 2, h); xG.restore(); xG.globalCompositeOperation = 'source-over';
        dst.drawImage(this.xCv, x0, y0, w, h, x0, y0, w, h);
        if (this.xrayOl) { const xo = this.xoG; mask(xo); xo.restore(); xo.globalCompositeOperation = 'source-over'; dst.drawImage(this.xoCv, x0, y0, w, h, x0, y0, w, h); }
      } else this._xrPrev = [0, 0, this.bw, this.bh];
    }
  }
  finish() {
    const game = this.game, g = this.ctx, gpu = this.gpu, iG = this.iG;
    game.particles.draw(this); this._drawGhosts();
    for (const d of this.decals) {
      this._tg = null; d.fn(g);
      if (gpu && d.e > 0) { iG._mat = this._infoCol(0, 2, d.e); iG._c = null; this._tg = iG; d.fn(iG); }
    }
    this._tg = null;
    this.flush();
    if (gpu) {
      this._tg = this.vG; for (const f of this.overlays) f(this.vG); this._tg = null;
      try { game.gpu.render(this); } catch (e) { game.gpu.fail(e); game.screen.present(); }
    } else {
      if (game.lights.enabled) {
        game.lights.render(this);
        if (this.emis.length) {
          const sG = this.sG, cv = g.canvas;
          if (this.emOn) { sG.globalCompositeOperation = 'source-over'; sG.globalAlpha = 1; sG.clearRect(0, 0, this.bw, this.bh); sG.drawImage(cv, 0, 0); sG.globalCompositeOperation = 'destination-in'; sG.drawImage(this.eCv, 0, 0); sG.globalCompositeOperation = 'source-over'; }
          this.emis.sort((a, b) => a.k - b.k); for (const it of this.emis) it.fn(g);
          if (this.emOn) g.drawImage(this.sCv, 0, 0);   // walls and bodies in front of a glow keep their lit pixels
        }
      }
      for (const f of this.overlays) f(g);
      game.screen.present();
    }
  }
}
E.Renderer = Renderer;

/* =============================================================================
 * 10. GAME  loop, clock, camera, hit-stop, shake, slow motion
 * ============================================================================= */
/** on-screen error box: the fastest way for a person (or model) to see why a game broke */
let _errBox = null;
E.showError = (title, e) => {
  if (typeof document === 'undefined') return;
  if (!document.body) { addEventListener('DOMContentLoaded', () => E.showError(title, e)); return; }
  if (!_errBox) {
    _errBox = document.createElement('div'); _errBox.id = 'my3d2dge-error'; _errBox.setAttribute('role', 'alert');
    _errBox.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;z-index:99999;max-height:45vh;overflow:auto;background:rgba(40,0,8,.95);color:#ffd6d6;border:2px solid #ff5a5a;border-radius:6px;padding:10px 12px;font:12px/1.45 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;cursor:pointer';
    _errBox.addEventListener('click', () => { _errBox.remove(); _errBox = null; });
    document.body.appendChild(_errBox);
  }
  const detail = e && e.stack ? String(e.stack) : String(e && e.message || e);
  _errBox.textContent = 'my-3D2dge: ' + title + '\n' + detail.split('\n').slice(0, 5).join('\n') + '\n(click to hide. Full details are in the browser console.)';
};
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('error', ev => { if (ev && (ev.error || ev.message)) E.showError('script error (the game could not start, or crashed outside update/draw)', ev.error || (ev.message + ' (line ' + ev.lineno + ')')); });
  window.addEventListener('unhandledrejection', ev => E.showError('unhandled promise rejection', ev.reason));
}

class Game {
  constructor(o = {}) {
    o = Object.assign({}, o);
    if (typeof o.canvas === 'string') o.canvas = document.getElementById(o.canvas.replace(/^#/, '')) || document.querySelector(o.canvas);
    if (!o.canvas) o.canvas = document.getElementById('screen') || document.querySelector('canvas') || Game._makeCanvas();
    if (typeof o.input === 'string') o.input = Input[o.input.toUpperCase()] || (warn('input:' + o.input, 'unknown input preset "' + o.input + '" (use DEFAULT, PLATFORMER or SHMUP)'), Input.DEFAULT);
    this.o = Object.assign({ view: 'iso', minH: 190, minW: 300, maxW: 560, maxH: 330, bg: '#07060d', step: 1 / 120, input: Input.DEFAULT }, o);
    this.screen = new Screen(this.o.canvas, this.o);
    this.input = new Input(this.screen, this.o.input);
    this.view = this.baseView = this._view(this.o.view) || E.VIEWS.iso;
    this.zoom = 1; this.yaw = 0;   // camera zoom and turn on top of the chosen view (setZoom, rotateView)
    /** views this game is designed for (view cycling and the checker use it). null = every view */
    this.views = this.o.views || null;
    this.time = 0; this.real = 0; this.hitstop = 0; this.timeScale = 1; this.shakeAmt = 0; this.reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    /** camera. smooth = seconds of lag; bounds(view) = clamp rect; room = [w, h] world units for screen-by-screen rooms; moving = sliding between rooms;
     *  offset = [dx, dy] screen pixels from the screen's centre to where the focus sits (above a phone's touch buttons: [0, -40]) */
    this.cam = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, tz: 0, smooth: .18, bounds: null, snap: true, room: null, moving: false, offset: null };
    this.particles = new Particles(this); this.lights = new Lighting(this); this.r = new Renderer(this);
    this.fps = 60; this.viewListeners = []; this.gpu = null;
    this.paused = false; this.pauseOverlay = true; this.timers = []; this.errors = []; this._errKeys = new Set();
    /** seconds for the dithered fade between scenes (0 = instant cuts) */
    this.fadeTime = .22; this._fade = null;
    this.scenes = null; this.scene = null; this.sceneName = null; this._next = null; this.hooks = null;
    /** chip-sound synthesizer: game.audio.sfx('jump'), game.audio.music(song) */
    this.audio = new E.Audio(this);
    /** per-frame timings (ms) and counts, for profiling overlays */
    this.stats = { updateMs: 0, renderMs: 0, frameMs: 16.7, steps: 0, items: 0, actors: 0, culled: 0 };
    E.current = this;   // handy for tools and tests: My3D2dge.current is the latest game
  }
  static _makeCanvas() {
    const c = document.createElement('canvas'); c.id = 'screen';
    c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;image-rendering:pixelated;background:#000;touch-action:none';   // fixed + inset 0 follows a phone's browser bars (100vh does not)
    document.body.style.margin = '0'; document.body.appendChild(c); return c;
  }
  /** internal buffer size in pixels (HUD layout) */
  get W() { return this.screen.W; }
  get H() { return this.screen.H; }
  /** turn on WebGPU lighting (falls back to Canvas lighting automatically). opts: { map, bands, ambient, ... } */
  enableGPU(o = {}) { this.gpu = new E.GPULighting(this, o); return this.gpu; }
  _view(v) {
    if (v instanceof View) return v;
    const w = E.VIEWS[v];
    if (!w) warn('view:' + v, 'unknown view "' + v + '". Use one of: ' + Object.keys(E.VIEWS).join(', ') + ', or a new E.View(...)');
    return w || null;
  }
  setView(v) {
    const w = this._view(v); if (!w) return;
    this.baseView = w; this._applyView();
  }
  /**
   * camera zoom on top of the view: game.setZoom(1.5) (.5 .. 3). Characters, maps, props, particles and lights are drawn
   * by code, so they re-rasterize crisply at the new size; HUD text and overlays stay the same.
   */
  setZoom(z) { this.zoom = clamp(+z || 1, .5, 3); this._applyView(); }
  /** turn the camera around the vertical axis in ground views: game.rotateView(45) (degrees). Side views never turn */
  rotateView(deg) { this.yaw = (((this.yaw || 0) + deg) % 360 + 360) % 360; this._applyView(); }
  resetCamera() { this.zoom = 1; this.yaw = 0; this._applyView(); }
  /** a short notice at the top of the screen (zoom level, saved, ...): game.note('ZOOM 1.5x', 1) */
  note(text, seconds = 1.2) { this._note = { text: String(text), end: this.real + seconds }; }
  _applyView() {
    const b = this.baseView, z = this.zoom || 1, y = b.pitchDeg < 5 ? 0 : (this.yaw || 0);
    if (z === 1 && !y) this.view = b;
    else {
      const key = b.id + ':' + b.yawDeg + ':' + b.pitchDeg + ':' + b.scale + ':' + b.zBoost + ':' + z + ':' + y, vc = this._vc || (this._vc = new Map());
      let v = vc.get(key);
      if (!v) { v = new View(b.id, b.label, b.yawDeg + y, b.pitchDeg, b.scale * z, b.zBoost); v.zoom = z; vc.set(key, v); }
      this.view = v;
    }
    this.cam.snap = true;
    for (const f of this.viewListeners) f(this.view);
  }
  /** cycle through game.views (or every view): bind it to a key for players who like to switch */
  nextView(dir = 1) { const list = this.views || E.VIEW_ORDER, i = list.indexOf(this.baseView.id); this.setView(list[((i + dir) % list.length + list.length) % list.length]); }
  onView(f) { this.viewListeners.push(f); }
  shake(a) { if (!this.reduceMotion) this.shakeAmt = Math.min(10, this.shakeAmt + a); }
  /**
   * everything a good hit needs in one call: hit-stop, shake, an impact star, sparks along the hit direction, a sound,
   * and a damage number. hitFx(x, y, z, { power: 1, angle, damage, color, sound: 'hit' })
   */
  hitFx(x, y, z, o = {}) {
    const p = o.power === undefined ? 1 : o.power, P = this.particles;
    this.freeze(.035 + .03 * p); this.shake(1.5 + 1.5 * p);
    P.impact(x, y, z, 5 + 3 * p, o.color || '#ffe070');
    P.sparks(x, y, z, Math.round(5 + 5 * p), o.angle === undefined ? null : o.angle, { color: o.color || '#ffb85c' });
    if (o.damage !== undefined) P.text(x + (Math.random() - .5) * 10, y, z + (o.textZ === undefined ? 22 : o.textZ), o.damage, o.textColor || '#fff2c4', { bounce: o.bounce !== false, scale: o.textScale || 1 });
    if (o.sound !== false) this.audio.sfx(o.sound || (p > 1.3 ? 'kick' : 'hit'));
    if (p >= 2) this.flash('#ffffff', .06);
  }
  /** flash the whole screen with a color for `seconds` (dithered fade out): hits, explosions, lightning */
  flash(color = '#ffffff', seconds = .12, strength = 1) { if (this.reduceMotion) seconds *= .4; this._flash = { color, t: 0, dur: seconds, k: strength }; }
  freeze(s) { this.hitstop = Math.max(this.hitstop, s); }
  /** camera follows this world point. Side-scrollers: game.focus(x, 0, z) */
  focus(x, y, z = 0) { this.cam.tx = x; this.cam.ty = y; this.cam.tz = z; }
  /**
   * keep the camera on an object automatically (instead of calling focus every update).
   * opts: { z: extra height to look at (default 16), lead: look ahead in the facing / moving direction }. follow(null) stops.
   */
  follow(target, o = {}) { this._follow = target ? { target, z: o.z === undefined ? 16 : o.z, lead: o.lead || 0 } : null; this.cam.snap = true; }
  /** mouse position on the ground (world units), or null */
  mouseGround() { const m = this.input.mouseScreen(); return m ? this.view.toGround(m[0], m[1]) : null; }
  /** run fn once after `seconds` of game time. Cleared on scene change. Returns { cancel() } */
  after(seconds, fn) { const t = { at: this.time + seconds, fn, every: 0, dead: false }; this.timers.push(t); return { cancel() { t.dead = true; } }; }
  /** run fn every `seconds` of game time. Cleared on scene change. Returns { cancel() } */
  every(seconds, fn) { const t = { at: this.time + seconds, fn, every: Math.max(1e-3, seconds), dead: false }; this.timers.push(t); return { cancel() { t.dead = true; } }; }
  _camStep(dt) {
    const c = this.cam; let fx = c.tx, fy = c.ty, fz = c.tz;
    if (c.room) {
      const rw = Array.isArray(c.room) ? c.room[0] : c.room.w, rh = Array.isArray(c.room) ? c.room[1] : c.room.h;
      fx = (Math.floor(fx / rw) + .5) * rw;
      if (this.view.isSide) fz = (Math.floor(fz / rh) + .5) * rh; else fy = (Math.floor(fy / rh) + .5) * rh;
    }
    const [sx, sy] = this.view.p(fx, fy, fz), off = c.offset;
    let tx = sx - this.screen.W / 2 - (off ? off[0] : 0), ty = sy - this.screen.H / 2 - (off ? off[1] : 0);
    const b = c.bounds && c.bounds(this.view);
    if (b) {
      const W = this.screen.W, H = this.screen.H, bottom = (c.align || (this.view.pitchDeg < 40 ? 'bottom' : 'center')) === 'bottom';
      tx = b.x1 - b.x0 < W ? (b.x0 + b.x1 - W) / 2 : clamp(tx, b.x0, b.x1 - W);
      // a level shorter than the screen sits on the bottom edge in side views (sky above), centered otherwise
      ty = b.y1 - b.y0 < H ? (bottom ? b.y1 - H : (b.y0 + b.y1 - H) / 2) : clamp(ty, b.y0, b.y1 - H);
    }
    if (c.snap) { c.x = tx; c.y = ty; c.vx = c.vy = 0; c.snap = false; c.moving = false; return; }
    if (!(c.smooth > 0)) { c.x = tx; c.y = ty; c.vx = c.vy = 0; c.moving = false; return; }   // smooth 0 = locked camera
    [c.x, c.vx] = smoothDamp(c.x, tx, c.vx, c.smooth, dt);
    [c.y, c.vy] = smoothDamp(c.y, ty, c.vy, c.smooth, dt);
    c.moving = Math.hypot(tx - c.x, ty - c.y) > 1.5;
  }
  /**
   * Start the loop. Either one scene:  game.start({ update(dt), draw(r) })
   * or several:  game.start({ scenes: { title: {...}, play: {...} }, scene: 'title' })
   * A scene is { enter(data), exit(), update(dt), draw(r), pausable, view, views, input, res, touch } (all optional);
   * view / views / input ('PLATFORMER') / res ('snes') / touch (['jump', 'attack']) are applied when it starts.
   */
  start(hooks) {
    if (!hooks || typeof hooks !== 'object') throw new Error('game.start needs { update(dt), draw(r) } or { scenes: { name: { update, draw } }, scene: "name" }');
    this.hooks = hooks;
    if (hooks.scenes) {
      this.scenes = hooks.scenes;
      const first = hooks.scene || Object.keys(hooks.scenes)[0];
      this._enter(first, hooks.data);
    } else {
      if (typeof hooks.update !== 'function' || typeof hooks.draw !== 'function') throw new Error('game.start({ update(dt), draw(r) }) needs both functions (or use { scenes, scene })');
      this.scene = hooks; this.sceneName = 'main';
    }
    if (this._running) return;
    this._running = true;
    let last = performance.now(), acc = 0, n = 0;
    const frame = now => {
      requestAnimationFrame(frame);   // scheduled first, so an error never stops the loop
      const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
      acc += dt; n++; if (acc > .5) { this.fps = Math.round(n / acc); acc = 0; n = 0; }
      const sdt = dt * this.timeScale, steps = Math.max(1, Math.ceil(sdt / this.o.step - 1e-6)), h = sdt / steps;
      const t0 = performance.now();
      try { for (let i = 0; i < steps; i++) this._step(h); } catch (e) { this._fail('update', e); }
      const t1 = performance.now();
      try { this._frame(); } catch (e) { this._fail('draw', e); try { this.screen.present(); } catch (e2) { /* nothing to show */ } }
      const st = this.stats; st.updateMs = t1 - t0; st.renderMs = performance.now() - t1; st.frameMs = dt * 1000; st.steps = steps;
    };
    requestAnimationFrame(frame);
  }
  /** switch scene: game.go('play', { level: 2 }). It fades through black (dithered) unless opts.fade is 0 */
  go(name, data, o = {}) {
    if (!this.scenes) { warn('go:noscenes', 'game.go() needs game.start({ scenes: {...}, scene }) first'); return; }
    if (!this.scenes[name]) { warn('go:' + name, 'game.go("' + name + '"): no such scene. Scenes: ' + Object.keys(this.scenes).join(', ')); return; }
    const fade = o.fade === undefined ? this.fadeTime : o.fade;
    if (fade > 0 && this.scene) this._fade = { t: 0, dur: fade, name, data, out: true };
    else { this._fade = null; this._next = { name, data }; }
  }
  _fadeStep(dt) {
    const f = this._fade; f.t += dt;
    if (f.out && f.t >= f.dur) { f.out = false; f.t = 0; this._enter(f.name, f.data); }
    else if (!f.out && f.t >= f.dur) this._fade = null;
  }
  _fadeLevel() { const f = this._fade; return f ? clamp(f.out ? f.t / f.dur : 1 - f.t / f.dur, 0, 1) : 0; }
  _enter(name, data) {
    const s = this.scenes[name];
    if (!s) throw new Error('scene "' + name + '" does not exist. Scenes: ' + Object.keys(this.scenes).join(', '));
    const old = this.scene;
    if (old && old.exit) old.exit();
    if (old && old._propWas !== undefined) { E.style.propSize = old._propWas; old._propWas = undefined; }
    this.scene = s; this.sceneName = name; this.paused = false; this.timers.length = 0; this.hitstop = 0;
    this.particles.list.length = 0; this.cam.snap = true; this.audio._duck(false); this._follow = null;
    if (s.view) this.setView(s.view);
    if (s.views) this.views = s.views;
    if (s.input) this.input.use(s.input);
    if (s.res) this.screen.setOptions({ res: s.res });
    if (s.touch) this.input.touchButtons(s.touch);
    if (s.propSize !== undefined) { s._propWas = E.style.propSize; E.style.propSize = s.propSize; }   // scene option: prop scale while this scene runs
    if (s.enter) s.enter(data);
  }
  _fail(where, e) {
    const msg = (e && e.message) || String(e), key = where + ':' + msg;
    if (!this._errKeys.has(key)) {
      this._errKeys.add(key); this.errors.push({ where, scene: this.sceneName, message: msg, stack: e && e.stack });
      console.error('my-3D2dge: error in ' + where + (this.sceneName ? ' (scene "' + this.sceneName + '")' : '') + ': ' + ((e && e.stack) || msg));
    }
    E.showError('error in ' + where + '()' + (this.sceneName && this.sceneName !== 'main' ? ' of scene "' + this.sceneName + '"' : ''), e);
    if (this.onError) try { this.onError(e, where); } catch (e2) { /* ignore */ }
  }
  _step(dt) {
    if (this._next) { const nx = this._next; this._next = null; this._enter(nx.name, nx.data); }
    this.real += dt; this.shakeAmt *= Math.exp(-dt * 9); this.input.tick(dt);
    if (this._flash) this._flash.t += dt / Math.max(.05, this.timeScale);   // real time: slow motion does not stretch a flash
    if (this._fade) { const out = this._fade.out; this._fadeStep(dt); if (out) return; }   // the old scene freezes while it fades out
    const s = this.scene;
    if (s && s.pausable && this.input.pressed('pause')) { this.paused = !this.paused; this.audio.sfx('pause'); }
    this.audio._duck(this.paused);
    if (this.paused) return;
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    this.time += dt;
    const T = this.timers;
    if (T.length) {
      for (let i = 0; i < T.length; i++) { const t = T[i]; if (t.dead || this.time < t.at) continue; if (t.every) t.at += t.every; else t.dead = true; t.fn(); }
      prune(T, t => t.dead);
    }
    if (s && s.update) s.update(dt);
    const f = this._follow;
    if (f && f.target) {
      const t = f.target, sp = Math.hypot(t.vx || 0, t.vy || 0), dir = typeof t.facing === 'number' && Math.abs(t.facing) === 1 && !t.vy ? [t.facing, 0] : sp > 1 ? [(t.vx || 0) / sp, (t.vy || 0) / sp] : [0, 0];
      this.focus(t.x + dir[0] * f.lead, (t.y || 0) + dir[1] * f.lead, (t.z || 0) + f.z);
    }
    this.particles.update(dt);
    this._camStep(dt);
  }
  _frame() {
    if (this._next) { const nx = this._next; this._next = null; this._enter(nx.name, nx.data); }
    const c = this.cam, s = this.shakeAmt;
    const shx = s > .05 ? (Math.sin(this.real * 83) + Math.sin(this.real * 57.3)) * .5 * s : 0, shy = s > .05 ? (Math.sin(this.real * 71) + Math.sin(this.real * 49.7)) * .5 * s : 0;
    this.lights.clear();
    this.r.begin(c.x + shx, c.y + shy);
    const sc = this.scene;
    if (sc && sc.draw) sc.draw(this.r);
    if (this._note && this.real < this._note.end) { const n = this._note; this.r.overlay(g => E.font.text(g, n.text, this.r.W / 2, 3, '#ffffff', { align: 'center', shadow: '#000', outline: false, font: 'tiny' })); }
    if (this.paused && this.pauseOverlay) this.r.overlay(g => {
      const r = this.r; g.save(); if (E.style.trans === 'dither') g.fillStyle = g.createPattern(r.checker, 'repeat'); else { g.fillStyle = '#05030c'; g.globalAlpha = .55; } g.fillRect(0, 0, r.bw, r.bh); g.restore(); g._c = null;
      E.font.text(g, 'PAUSED', r.W / 2, r.H / 2 - 8, '#ffffff', { align: 'center', scale: 2 });
      E.font.text(g, 'PRESS ESC OR START', r.W / 2, r.H / 2 + 8, '#c9c0e0', { align: 'center' });
    });
    const fx = this._flash;
    if (fx) { const a = (1 - fx.t / fx.dur) * (fx.k === undefined ? 1 : fx.k); if (a <= 0) this._flash = null; else this.r.overlay(g => { const r = this.r; g.save(); if (E.style.trans === 'dither') { const pat = r._fadePattern(a * .85), c = mkCanvas(4, 4), cg = c.getContext('2d'); cg.drawImage(pat, 0, 0); cg.globalCompositeOperation = 'source-in'; cg.fillStyle = fx.color; cg.fillRect(0, 0, 4, 4); g.fillStyle = g.createPattern(c, 'repeat'); } else { g.fillStyle = fx.color; g.globalAlpha = qa(a * .75); g.globalCompositeOperation = 'lighter'; } g.fillRect(0, 0, r.bw, r.bh); g.restore(); g._c = null; }); }
    const fl = this._fadeLevel();
    if (fl > 0) this.r.overlay(g => { const r = this.r; g.save(); if (E.style.trans === 'dither') g.fillStyle = g.createPattern(r._fadePattern(fl), 'repeat'); else { g.fillStyle = '#000000'; g.globalAlpha = Math.round(fl * 16) / 16; } g.fillRect(0, 0, r.bw, r.bh); g.restore(); g._c = null; });
    this.r.finish();
  }
}
E.Game = Game;

/* =============================================================================
 * 11. HUMANOID RIG
 *    Local frame: f = forward, r = right, z = up. The rig poses itself every step
 *    from movement, attacks and state, then projects through any view.
 *    Attack specs (angles relative to facing, + = toward the right hand):
 *      { a0, a1, z0, z1, reach, blade, spin }   e.g. horizontal slash a0: 1.7 -> a1: -1.9
 *    Drive with rig.update(dt, { x, y, z, vx, vy, facing, dash, hurt, attack:{ spec, phase, u } })
 *    where phase is 'wind' | 'active' | 'recover' and u is 0..1 progress in that phase.
 * ============================================================================= */
const HUMAN_COLORS = {
  skin: '#f1c7a0', hair: '#3b2a2f', cloth: '#2f8f86', pants: '#3b3552', boot: '#6a4128', belt: '#e0a84a',
  cape: '#c8452f', capeIn: '#7a2622', metal: '#dce8f1', metalDk: '#7f93ab', hilt: '#e8b04e', eye: '#1a1320'
};
const JOINT_KEYS = ['hipL', 'hipR', 'kneeL', 'kneeR', 'footL', 'footR', 'hipC', 'shC', 'shL', 'shR', 'head', 'elbowL', 'elbowR', 'handL', 'handR'];
/** body proportions: 'chibi' (default, big head, Secret of Mana), 'heroic' (tall, Symphony of the Night), 'bulky' (brawlers, bosses) */
const BUILDS = {
  chibi: {},
  heroic: { legUpper: 7.4, legLower: 7.4, hipZ: 14.3, torso: 9.6, shoulderHalf: 3.5, headR: 3.05, neck: 1.5, armUpper: 5.5, armLower: 5.4, hipHalf: 1.8, stride: 7.8, speedRef: 80 },
  bulky: { legUpper: 6.4, legLower: 6.2, hipZ: 12.2, torso: 9.4, shoulderHalf: 4.6, headR: 3.2, neck: .9, armUpper: 5.2, armLower: 5.2, hipHalf: 2.4, limbW: 2.6, torsoW: 4.2, footSpread: 2.4, stride: 6.6, speedRef: 60 },
  // bones: rib cage, skull with glowing sockets and a jaw (colors.bone to tint; outfit, cape, hat and weapons still work)
  skeleton: { legUpper: 7, legLower: 7, hipZ: 13.4, torso: 9, shoulderHalf: 3.2, headR: 3.1, neck: 1.6, armUpper: 5.3, armLower: 5.2, hipHalf: 1.5, limbW: .6, torsoW: 2.6, stride: 7, hunch: .2, skeleton: true, hair: 'bald', sleeves: 'none', eyeGlow: '#ff5a40' }
};
class Humanoid {
  constructor(o = {}) {
    if (o.build && !BUILDS[o.build]) warn('build:' + o.build, 'Humanoid build "' + o.build + '" is unknown (chibi, heroic, bulky, skeleton)');
    o = Object.assign({}, BUILDS[o.build] || {}, o);
    this.o = Object.assign({
      legUpper: 6, legLower: 6, hipZ: 11.6, hipHalf: 1.9, footSpread: 1.9, torso: 8, shoulderHalf: 3.3, neck: 1.2, headR: 3.4,
      armUpper: 4.6, armLower: 4.6, limbW: 2, torsoW: 3, lean: 0, hunch: 0, stride: 6.5, lift: 3.4, swing: 4, speedRef: 70,
      weapon: 'sword', bladeLen: 11, cape: null, hood: false, eyeGlow: null, hat: null,
      style: 'hd', size: 1, hair: 'short', outfit: 'shirt', sleeves: 'short', armor: false, cheat: .5
    }, o);
    this._cheat = 0; this.trail = [];
    if (typeof this.o.hair === 'string' || !this.o.hair) this.o.hair = { style: this.o.hair || 'short' };
    this.hairPts = null;
    if (this.o.weapon && !['sword', 'gun', 'staff'].includes(this.o.weapon)) { warn('weapon:' + this.o.weapon, 'Humanoid weapon "' + this.o.weapon + '" is not built in (sword, gun, staff or null); drawing a sword'); this.o.weapon = 'sword'; }
    if (typeof this.o.hat === 'string') this.o.hat = { style: this.o.hat };
    this.C = Object.assign({}, HUMAN_COLORS, o.colors || {});
    const C = this.C;
    if (this.o.skeleton) C.skin = C.pants = C.boot = C.glove = C.bone || '#e6dfc8';
    C.clothDk = C.clothDk || shade(C.cloth, -.3); C.clothLt = C.clothLt || shade(C.cloth, .25);
    C.pantsDk = C.pantsDk || shade(C.pants, -.3); C.bootDk = C.bootDk || shade(C.boot, -.3); C.skinDk = C.skinDk || shade(C.skin, -.2);
    this.t = Math.random() * 10; this.phase = 0; this.spW = 0; this.mv = [1, 0]; this.dashW = 0; this.hurtW = 0; this.atkW = 0;
    this.theta = 1.2; this.atkZ = 10; this.reach = 7; this.twist = 0; this.spin = 0; this.atkLean = 0;
    this.sq = 0; this.sqV = 0; this.blink = 2; this.facing = 0; this.x = 0; this.y = 0; this.z = 0; this.J = {}; this.smear = null;
    this.capeL = null; this.airW = 0; this.pointW = 0; this.kicking = false;
    this._pose();
  }
  kick(v) { this.sqV += v; }
  /** world position of a hand ('R' holds the weapon): spawn bullets, sparks or thrown things here */
  hand(which = 'R') { const w = this._w(this.J['hand' + which] || this.J.handR); return [this.x + w[0], this.y + w[1], this.z + w[2]]; }
  /** world position of the weapon tip (sword tip, gun muzzle, staff orb) */
  tip() { const J = this.J, L = this.o.weapon === 'gun' ? 5 : this.o.weapon === 'staff' ? 10 : this.o.bladeLen, w = this._w(V3.add(J.handR, V3.mul(J.bladeDir, L))); return [this.x + w[0], this.y + w[1], this.z + w[2]]; }
  /** local (f, r, z) -> world offset */
  _w(p) {
    const a = this.facing + this.spin + this._cheat, c = Math.cos(a), s = Math.sin(a), sz = this.o.size, k = (1 - this.sq * .4) * sz;
    return [(p[0] * c - p[1] * s) * k, (p[0] * s + p[1] * c) * k, p[2] * (1 + this.sq) * sz];
  }
  /**
   * s: { x, y, z, vx, vy, facing, dash, hurt, attack, air, point }
   *   air: true while jumping or falling (legs tuck), point: true to hold the weapon hand forward (aiming a gun)
   *   attack: { spec, phase: 'wind' | 'active' | 'recover', u: 0..1 }. spec.kick = true swings the right foot instead of the hand
   */
  update(dt, s = {}) {
    const o = this.o;
    if (this.t > 0 && Math.hypot((s.x || 0) - this.x, (s.y || 0) - this.y, (s.z || 0) - this.z) > 24 * o.size) { this.capeL = null; this.hairPts = null; this.trail.length = 0; }   // teleported: cloth and hair start fresh
    this.t += dt; this.x = s.x; this.y = s.y; this.z = s.z || 0; this.facing = s.facing || 0; this.expr = s.expr || null;
    const speed = s.run ? s.run * o.speedRef : Math.hypot(s.vx || 0, s.vy || 0);   // run: 0..1 runs in place (an RPG 'run away', a treadmill)
    this.spW = approach(this.spW, clamp(speed / o.speedRef, 0, 1.25), dt * 7);
    if (speed > 3 && !s.run) {
      const c = Math.cos(this.facing), sn = Math.sin(this.facing), k = Math.min(1, dt * 10);
      this.mv[0] = lerp(this.mv[0], (s.vx * c + s.vy * sn) / speed, k); this.mv[1] = lerp(this.mv[1], (-s.vx * sn + s.vy * c) / speed, k);
    }
    this.phase += dt * speed / (o.stride * o.size * Math.max(.4, Math.min(1, this.spW)));
    this.dashW = approach(this.dashW, s.dash ? 1 : 0, dt * (s.dash ? 24 : 8));
    this.hurtW = approach(this.hurtW, s.hurt ? 1 : 0, dt * 14);
    this.atkW = approach(this.atkW, s.attack ? 1 : 0, dt * (s.attack ? 30 : 7));
    this.airW = approach(this.airW, s.air ? 1 : 0, dt * (s.air ? 10 : 18));
    // held poses: 'cheer' (item get, victory), 'cast' (both hands forward), 'guard' (fists up), 'kneel', 'crouch', 'wave', 'hips'
    // (hands on hips), and down: 0..1 (knocked flat). stance: 'guard' (fists up while moving) | 'ready' (weapon held forward)
    const pk = this.poseW || (this.poseW = { cheer: 0, cast: 0, guard: 0, kneel: 0, crouch: 0, wave: 0, hips: 0, block: 0 });
    for (const k in pk) pk[k] = approach(pk[k], s.pose === k ? 1 : 0, dt * 9);
    this.stW = approach(this.stW || 0, s.stance === 'guard' ? 1 : 0, dt * 10); this.rdW = approach(this.rdW || 0, s.stance === 'ready' ? 1 : 0, dt * 10);
    this.climbW = approach(this.climbW || 0, s.climb ? 1 : 0, dt * 12); if (s.climb) this.climbP = (this.climbP || 0) + dt * Math.abs(s.vz || 0) / (.4 * (o.armUpper + o.armLower) * o.size) * Math.PI;   // hands keep pace with the climb   // climb: hand over hand on a ladder
    this.dieT = s.pose === 'die' ? (this.dieT || 0) + dt : 0;   // pose 'die': a stagger, the knees give, then the body topples
    const dT = s.down !== undefined ? clamp(+s.down, 0, 1) : s.pose === 'down' || this.dieT > .45 ? 1 : 0;
    this.downW = approach(this.downW || 0, dT, dt * (dT > (this.downW || 0) ? 2.5 + 10 * (this.downW || 0) : 3.2));   // falls faster and faster, gets up steadily
    if (this.dieT > 0) { this.hurtW = approach(this.hurtW, this.dieT < .25 ? 1 : 0, dt * 14); pk.kneel = approach(pk.kneel, this.dieT > .2 && this.dieT < .6 ? 1 : 0, dt * 10); }
    this.pointW = approach(this.pointW, s.point ? 1 : 0, dt * (s.point ? 30 : 8));
    this.aimA = approach(this.aimA || 0, s.aim || 0, dt * 14);   // aim: radians above (+) or below (-) level while pointing
    if (s.attack) this.kicking = !!s.attack.spec.kick;
    this.blink -= dt; if (this.blink < -.12) this.blink = 2 + Math.random() * 3;
    this.sqV += (-260 * this.sq - 15 * this.sqV) * dt; this.sq = clamp(this.sq + this.sqV * dt, -.3, .3);

    const A = s.attack; let tLean = 0, tTwist = 0, tLunge = 0, tHop = 0, tCrouch = 0, armT = A ? 1 : 0;
    this.spin = 0;
    // side views swing weapons in the screen plane (an overhead chop), ground views in the ground plane.
    // spec.plane or the rig option swingPlane ('side' | 'ground') choose it yourself.
    this.sidePlane = !!A && !A.spec.kick && (A.spec.plane ? A.spec.plane === 'side' : o.swingPlane ? o.swingPlane === 'side' : this._pitch !== undefined && this._pitch < 15 && !!o.weapon && A.spec.blade !== 0 && A.spec.hand !== 'L');
    if (A) {
      // wind: anticipation (pull back, crouch). active: the strike, with a lunge, lead-foot step, lean, twist and hop.
      // recover: follow through, hold the end pose, then blend back to the stance by position (never swing backwards)
      const sp = A.spec, side = this.sidePlane, rest = side ? -.9 : 1.1, RS = sp.rel ? (o.armUpper + o.armLower) / 9.2 : 1, R = (sp.reach || 7.5) * RS, r0 = sp.r0 === undefined ? R : sp.r0 * RS, r1 = sp.r1 === undefined ? R : sp.r1 * RS;
      this.atkRel = !!sp.rel; const zRest = sp.rel ? (sp.kick ? .1 : -7) : 9, z0 = sp.z0 === undefined ? zRest : sp.z0, z1 = sp.z1 === undefined ? z0 : sp.z1;   // side-plane moves have no heights
      // lunge / hop / crouch are body motion in local units, clamped so a game's own 'lunge' speed field can't stretch the rig
      const hold = sp.hold === undefined ? .3 : sp.hold, lean = sp.lean === undefined ? (sp.kick ? -.22 : .3) : clamp(sp.lean, -.8, .8), lunge = sp.lunge === undefined ? (sp.kick ? .4 : 1.2) : clamp(sp.lunge, -4, 5);
      if (A.phase === 'wind' && (this._aPh !== 'wind' || this._aSp !== sp)) {   // a chained hit starts where the arm is
        const chain = (this.armW || 0) > .3 && this.theta !== undefined, fists = !o.weapon || sp.hand === 'L' || sp.blade === 0;
        this._th0 = chain ? this.theta : rest; this._z0 = chain && this.atkRel === !!sp.rel && isFinite(this.atkZ) ? this.atkZ : fists ? z0 : zRest; this._r0 = chain ? this.reach : R * .75;
        const J = this.J; if (J.handR) this._from = { R: J.handR.slice(), L: J.handL.slice(), bd: J.bladeDir.slice() };   // the wind blends from the real pose: no snaps
      }
      this._aPh = A.phase; this._aSp = sp; this.atkHand = sp.hand || 'R'; if (A.phase !== 'wind') this._windK = 1;
      if (A.phase === 'wind') {
        const k = ease.outQuad(A.u);
        this.theta = lerp(this._th0, sp.a0, k); this.atkZ = lerp(this._z0, z0, A.u); this.reach = lerp(this._r0, r0, k); this._windK = k;
        tLean = -Math.abs(lean) * .45; tLunge = -lunge * .3 * k; tCrouch = clamp(sp.crouch === undefined ? (sp.kick ? 0 : .15) : sp.crouch, 0, 1) * k;   // coil: lean back, draw back, dip
      } else if (A.phase === 'active') {
        const k = ease.outCubic(A.u);
        this.theta = sp.spin ? sp.a0 : lerp(sp.a0, sp.a1, k); this.atkZ = lerp(z0, z1, k); this.reach = lerp(r0, r1, k);
        tLean = lean; tLunge = lunge * k; tHop = clamp(sp.hop || 0, 0, 12) * Math.sin(k * Math.PI); tCrouch = clamp(sp.crouch === undefined ? (sp.kick ? 0 : .15) : sp.crouch, 0, 1) * (1 - k);
        if (sp.spin) { if (side) this.theta = sp.a0 - TAU * k; else this.spin = -TAU * k; }   // side views: the blade loops a full circle in front (a windmill) instead of a turn the camera sees edge-on
      } else {
        const k = ease.outQuad(clamp(A.u / hold, 0, 1)), span = sp.spin ? 0 : sp.a1 - sp.a0;
        this.theta = (sp.spin ? sp.a0 : sp.a1) + span * .08 * k; this.atkZ = z1; this.reach = r1;
        armT = A.u < hold ? 1 : 1 - ease.inOut((A.u - hold) / (1 - hold));
        tLean = lean * armT; tLunge = lunge * armT;
      }
      tTwist = sp.spin ? 0 : clamp(this.theta * (side ? .08 : .32) * (sp.twist === undefined ? 1 : sp.twist) * (this.atkHand === 'L' ? -1 : 1), -.7, .7);
      // smear arc in absolute ground angles
      if (this.sidePlane) this.smear = null;
      else if (sp.blade !== 0) {
        const base = this.facing, len = ((sp.reach || 7.5) + (sp.blade || o.bladeLen)) * o.size;
        if (A.phase === 'active') this.smear = { a0: base + sp.a0, a1: base + this.spin + this.theta, r0: len * .45, r1: len, z: (this.atkZ + 1) * o.size, fade: 1 };
        else if (A.phase === 'recover' && this.smear) { const u = clamp(A.u / .5, 0, 1); const end = base + (sp.spin ? sp.a0 - TAU : sp.a1); this.smear.a0 = lerp(base + sp.a0, end, ease.inQuad(u)); this.smear.a1 = end; this.smear.fade = 1 - u; if (u >= 1) this.smear = null; }
        else if (A.phase === 'wind') this.smear = null;
      }
    } else { this.smear = null; this._windK = 1; this._aPh = null; }
    this.armW = approach(this.armW || 0, armT, dt * (armT > (this.armW || 0) ? 30 : 12));
    this.lunge = lerp(this.lunge || 0, tLunge, Math.min(1, dt * 22)); this.hop = lerp(this.hop || 0, tHop, Math.min(1, dt * 25)); this.crouchA = lerp(this.crouchA || 0, tCrouch, Math.min(1, dt * 20));
    this.atkLean = lerp(this.atkLean, tLean, Math.min(1, dt * 25));
    this.twist = lerp(this.twist, tTwist, Math.min(1, dt * 25));
    this._pose();
    if (o.cape) this._cape(dt);
    if (o.hair.style === 'long' || o.hair.style === 'ponytail') this._hair(dt);
    // weapon trail: remember where the blade (or fist, or foot) really went, so the smear works in every view
    const T = this.trail;
    for (const p of T) p.age += dt;
    const maxAge = s.attack && s.attack.phase === 'active' ? .14 : .07;   // after the strike the ribbon clears quickly: no ghost slivers
    while (T.length && T[0].age > maxAge) T.shift();
    const atk = s.attack, swinging = atk && (atk.phase === 'active' || (atk.phase === 'recover' && atk.u < .12));
    if (swinging && (atk.spec.blade !== 0 || atk.spec.kick || !o.weapon || atk.spec.hand === 'L')) {
      const J = this.J, kick = atk.spec.kick, left = atk.spec.hand === 'L', sword = o.weapon === 'sword' && !kick && !left;
      const b = kick ? J.kneeR : sword ? V3.add(J.handR, V3.mul(J.bladeDir, 2)) : left ? J.elbowL : J.elbowR, t = kick ? J.footR : sword ? V3.add(J.handR, V3.mul(J.bladeDir, o.bladeLen)) : left ? J.handL : J.handR;
      const wb = this._w(b), wt = this._w(t), last = T[T.length - 1];
      if (last && Math.hypot(this.x + wt[0] - last.t[0], this.y + wt[1] - last.t[1], this.z + wt[2] - last.t[2]) > 14 * o.size) T.length = 0;   // a jump (teleport, respawn): start a new ribbon
      T.push({ b: [this.x + wb[0], this.y + wb[1], this.z + wb[2]], t: [this.x + wt[0], this.y + wt[1], this.z + wt[2]], o: [this.x, this.y, this.z], age: 0, w: sword ? 1 : .6 });
      if (T.length > 12) T.shift();
    }
  }
  /** long hair and ponytails: a verlet strand that trails behind the head */
  _hair(dt) {
    const o = this.o, long = o.hair.style === 'long', N = o.hair.len || (long ? 6 : 4), seg = (long ? 1.9 : 1.6) * o.size;
    const J = this.J, anchor = () => { const w = this._w([J.head[0] - o.headR * .8, 0, J.head[2] + (long ? o.headR * .1 : o.headR * .55)]); return [this.x + w[0], this.y + w[1], this.z + w[2]]; };
    if (!this.hairPts) { const a = anchor(), hx = -Math.cos(this.facing) * .8 * o.size, hy = -Math.sin(this.facing) * .8 * o.size; this.hairPts = Array.from({ length: N }, (_, i) => ({ x: a[0] + hx * i * .3, y: a[1] + hy * i * .3, z: a[2] - i * seg, px: a[0] + hx * i * .3, py: a[1] + hy * i * .3, pz: a[2] - i * seg })); }
    const P = this.hairPts, a = anchor(), damp = Math.pow(.97, dt * 120), fx = Math.cos(this.facing + this.spin), fy = Math.sin(this.facing + this.spin), dt2 = dt * dt;   // trails behind the body's turn
    Object.assign(P[0], { x: a[0], y: a[1], z: a[2], px: a[0], py: a[1], pz: a[2] });
    for (let i = 1; i < P.length; i++) { const n = P[i], vx = (n.x - n.px) * damp, vy = (n.y - n.py) * damp, vz = (n.z - n.pz) * damp; n.px = n.x; n.py = n.y; n.pz = n.z; n.x += vx - fx * 20 * dt2; n.y += vy - fy * 20 * dt2; n.z += vz - 200 * dt2; }
    const shZ = this.z + J.shC[2] * o.size, bodyR = (o.torsoW * .75 + .6) * o.size, headTop = this.z + (J.head[2] + o.headR * .6) * o.size;
    for (let it = 0; it < 3; it++) for (let i = 1; i < P.length; i++) {
      const A = P[i - 1], B = P[i], dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z, d = Math.hypot(dx, dy, dz) || 1e-6, kk = (d - seg) / d;
      if (i === 1) { B.x -= dx * kk; B.y -= dy * kk; B.z -= dz * kk; } else { A.x += dx * kk * .5; A.y += dy * kk * .5; A.z += dz * kk * .5; B.x -= dx * kk * .5; B.y -= dy * kk * .5; B.z -= dz * kk * .5; }
      const rx = B.x - this.x, ry = B.y - this.y, rd = Math.hypot(rx, ry);
      if (B.z < shZ + 2 * o.size && rd < bodyR) { const ux = rd > .01 ? rx / rd : -fx, uy = rd > .01 ? ry / rd : -fy; B.x = this.x + ux * bodyR; B.y = this.y + uy * bodyR; }
      if (B.z < this.z + .5) B.z = this.z + .5;
      if (B.z > headTop) B.z = headTop;   // no plume over the head on attacks and knockbacks
    }
  }
  _pose() {
    const o = this.o, J = this.J, sp = Math.min(1, this.spW), mf = this.mv[0], mr = this.mv[1], ph = this.phase, dash = this.dashW, hurt = this.hurtW, rz = V3.rz, add = V3.add;
    const breathe = Math.sin(this.t * 2.3) * (1 - sp);
    const bob = (.5 - Math.abs(Math.cos(ph)) * 1.3) * sp;
    const PW = this.poseW || { cheer: 0, cast: 0, guard: 0, kneel: 0 }, kn = PW.kneel, lg = this.lunge || 0, cw = this.climbW || 0;
    const cr = Math.max(PW.crouch || 0, this.crouchA || 0, Math.sin(clamp(this.downW || 0, 0, 1) * Math.PI) * .85);   // falling (and getting up) buckles the knees
    const sway = Math.sin(this.t * 1.15) * .3 * (1 - sp) * (1 - this.atkW);   // idle weight shift from foot to foot
    const hipC = [mf * .4 * sp - .4 * hurt + lg * .55, mr * .3 * sp + sway, o.hipZ + bob + breathe * .3 - dash * 2.2 - hurt * .6 - kn * o.hipZ * .42 - PW.guard * .9 - cr * o.hipZ * .32 + (this.hop || 0)];
    J.hipL = add(hipC, rz([0, -o.hipHalf, 0], this.twist * .4)); J.hipR = add(hipC, rz([0, o.hipHalf, 0], this.twist * .4));
    for (const s of [-1, 1]) {
      const p = ph + (s > 0 ? Math.PI : 0), along = Math.sin(p) * o.stride * sp;
      let foot = [mf * along + (s > 0 ? .8 : -.6) * (1 - sp), s * o.footSpread + mr * along, Math.max(0, Math.cos(p)) * o.lift * sp];
      foot = V3.lerp(foot, [s > 0 ? 4 : -5, s * 2.2, s > 0 ? 1.5 : .3], dash);
      if (this.airW > 0) foot = V3.lerp(foot, [s > 0 ? 3.2 : -2.6, s * 1.9, s > 0 ? 6 : 3.6], this.airW);
      if (kn > 0) foot = V3.lerp(foot, [s > 0 ? 3.4 : -4.2, s * 2, s > 0 ? 0 : 0], kn);
      if (PW.guard > 0) foot = V3.lerp(foot, [s > 0 ? 2.6 : -2.8, s * 2.6, 0], PW.guard * (1 - sp));
      if (cr > 0) foot = V3.lerp(foot, [s > 0 ? 1.6 : -1.4, s * (o.footSpread + .7), foot[2] * (1 - cr)], cr * (1 - sp * .5));
      if (lg > 0) foot[0] += (s === (this.atkHand === 'L' ? 1 : -1) ? lg * 1.3 : -lg * .15) * (1 - sp);   // the lead foot steps into the strike
      if (this.hop) foot[2] += this.hop;
      if (cw > 0) foot = V3.lerp(foot, [.6, s * 1.5, Math.max(0, Math.sin(this.climbP + (s > 0 ? Math.PI : 0))) * 3.4], cw);
      if (s > 0 && this.kicking && this.atkW > 0) foot = V3.lerp(foot, [Math.cos(this.theta) * (this.reach + 3), Math.sin(this.theta) * (this.reach + 3), (this.atkRel ? this.atkZ * o.hipZ : this.atkZ) + (this.hop || 0)], this.armW || 0);
      const hip = s > 0 ? J.hipR : J.hipL;
      const [knee, f2] = ik3(hip, foot, o.legUpper, o.legLower, [1, s * .15, .1]);
      J[s > 0 ? 'kneeR' : 'kneeL'] = knee; J[s > 0 ? 'footR' : 'footL'] = f2;
    }
    const leanF = o.lean + .16 * sp * mf + .45 * dash + this.atkLean - .35 * hurt + cr * .22, leanR = .1 * sp * mr;
    const dir = V3.norm([Math.sin(leanF), Math.sin(leanR), Math.cos(leanF)]);
    const shC = add(hipC, V3.mul(dir, o.torso));
    J.hipC = hipC; J.shC = shC;
    J.shL = add(shC, rz([0, -o.shoulderHalf, 0], this.twist)); J.shR = add(shC, rz([0, o.shoulderHalf, 0], this.twist));
    J.head = add(shC, V3.mul(V3.norm([dir[0] + o.hunch * .9, dir[1], dir[2]]), o.neck + o.headR));
    const armLen = o.armUpper + o.armLower, aw = this.armW || 0, sA = this.atkHand === 'L' ? -1 : 1, two = this.atkHand === 'both', fists = !o.weapon || this.stW > .5;
    // where the striking hand goes, and the weapon's direction, for the current attack angle
    const aT = this.sidePlane ? add(shC, [Math.cos(this.theta) * this.reach, sA * .8, Math.sin(this.theta) * this.reach]) : add(shC, [Math.cos(this.theta) * this.reach, Math.sin(this.theta) * this.reach, this.atkRel ? this.atkZ : this.atkZ - shC[2]]);
    const aDir = this.sidePlane ? V3.norm([Math.cos(this.theta), .05, Math.sin(this.theta)]) : V3.norm([Math.cos(this.theta), Math.sin(this.theta), -.12]);
    for (const s of [-1, 1]) {
      const sh = s > 0 ? J.shR : J.shL, q = ph + (s > 0 ? 0 : Math.PI), along = -Math.sin(q) * o.swing * sp;
      let hand = add(sh, [mf * along + .5 * (1 - sp) + o.hunch * 3, s * .9 + mr * along, -armLen * .86 + Math.abs(Math.sin(q)) * 1.2 * sp]);
      hand = V3.lerp(hand, add(sh, [-4.5, s * 1.6, -5]), dash);
      hand = V3.lerp(hand, add(sh, s > 0 ? [1.4, -.6, .6] : [-1.6, s * 2.2, -3.2]), hurt);   // a flinch: one arm up to shield the face, the other flung back
      if (this.airW > 0) hand = V3.lerp(hand, add(sh, [1.2, s * 2.6, -1.2]), this.airW * .7);
      if (s > 0 && this.pointW > 0) { const aa = this.aimA || 0; hand = V3.lerp(hand, add(sh, [armLen * .92 * Math.cos(aa), -.6, armLen * .92 * Math.sin(aa) - .4]), this.pointW); }
      if (PW.cheer > 0) hand = V3.lerp(hand, add(sh, [.6, s * 1.4, armLen * (.74 + .12 * Math.sin(this.t * 9 + (s > 0 ? 0 : .7)))]), PW.cheer);   // fists pump
      if (PW.cast > 0) hand = V3.lerp(hand, add(shC, [armLen * .82, s * 1.3, -1.2]), PW.cast);
      const guardAt = add(shC, s < 0 ? [3.8, -1, .4] : [2.3, 1.5, -.6]);   // boxer's guard: lead fist out at chin height, face stays visible
      if (PW.guard > 0) hand = V3.lerp(hand, guardAt, PW.guard);
      if (this.stW > 0) hand = V3.lerp(hand, guardAt, this.stW * (1 - dash));
      if (this.rdW > 0 && o.weapon) hand = V3.lerp(hand, s > 0 ? add(shC, [2.8, .9, -3]) : add(shC, [2.2, .2, -3.6]), this.rdW * (1 - dash));   // ready: weapon held forward in both hands
      if (PW.wave > 0 && s === (o.weapon ? -1 : (this._camSide || 1))) { const w = Math.sin(this.t * 11); hand = V3.lerp(hand, add(sh, [.8 + w * 1.7, s * (2 + Math.max(0, w) * 1.4), armLen * .8]), PW.wave); }   // the free hand waves (the camera-side one when both are free)
      if (PW.hips > 0) hand = V3.lerp(hand, add(s > 0 ? J.hipR : J.hipL, [-.2, s * 1.5, 1.5]), PW.hips);
      if (PW.block > 0) hand = V3.lerp(hand, add(shC, s > 0 ? [2.6, .6, -2.4] : [2.4, -.2, -3.4]), PW.block);   // block: weapon upright across the body, both hands on it
      if (cw > 0) hand = V3.lerp(hand, add(sh, [1.7, s * .5, armLen * (.08 + .8 * (.5 + .5 * Math.sin(this.climbP + (s > 0 ? 0 : Math.PI))))]), cw);   // hands on the rails, one reaching high above the head while the other pulls down
      const wk = this._from && this._windK < 1 ? this._windK : 1, from = wk < 1 ? this._from[s > 0 ? 'R' : 'L'] : null;
      if (aw > 0 && !this.kicking) {
        if (s === sA) hand = V3.lerp(hand, from ? V3.lerp(from, aT, wk) : aT, aw);                // the striking hand
        else if (two) hand = V3.lerp(hand, add(aT, V3.mul(aDir, -1.7)), aw);                      // two-handed grip below it
        else { const offT = fists ? guardAt : add(shC, [1.6, s * 1.6, -1.6]); hand = V3.lerp(hand, from ? V3.lerp(from, offT, wk) : offT, from ? aw : aw * .85); }   // the other hand guards the chin (fists) or pulls back
      }
      if (this.kicking && aw > 0) hand = V3.lerp(hand, add(shC, [1.8, s * 2.2, .6 - (s > 0 ? 1.5 : 0)]), aw * .85);   // arms up for balance during a kick
      const [elbow, h2] = ik3(sh, hand, o.armUpper, o.armLower, [-1, s * .7, -.2]);
      J[s > 0 ? 'elbowR' : 'elbowL'] = elbow; J[s > 0 ? 'handR' : 'handL'] = h2;
    }
    const wp = o.weapon, rest = V3.norm(wp === 'staff' ? [.3, .15, 1] : wp === 'gun' ? [.8, 0, -.6] : [.55, .35, -.75]), atk = aDir;
    let bd = V3.lerp(rest, atk, this.kicking || sA < 0 ? 0 : aw);
    if (this._from && this._windK < 1 && !this.kicking && sA > 0) bd = V3.lerp(this._from.bd, bd, this._windK);   // the weapon turns from where it was
    if (PW.cheer > 0) bd = V3.lerp(bd, [.15, .05, 1], PW.cheer);   // raised in triumph, point up
    if (PW.block > 0) bd = V3.lerp(bd, [.35, -.3, .9], PW.block);   // held upright across the body
    if (this.rdW > 0) bd = V3.lerp(bd, [.62, .08, .78], this.rdW * (1 - aw));
    if (this.pointW > 0) bd = V3.lerp(bd, [Math.cos(this.aimA || 0), 0, Math.sin(this.aimA || 0)], this.pointW);
    J.bladeDir = V3.norm(bd);
    const dw = this.downW || 0;
    if (dw > 0) J.bladeDir = V3.norm(V3.lerp(J.bladeDir, [0, .9, -.4], dw));   // a dropped weapon lies flat once the body is down
    if (dw > 0) {   // knocked down: rotate the whole skeleton backward so it lies flat, face up, centred on the rig's position
      const a = dw * Math.PI / 2 * .96, ca = Math.cos(a), sa = Math.sin(a), lift = dw * 1.4, shift = dw * (o.hipZ + o.torso) * .5;
      for (const k in J) { if (k === 'bladeDir') continue; const p = J[k]; J[k] = [p[0] * ca - p[2] * sa + shift, p[1], p[0] * sa + p[2] * ca + lift]; }
      const b = J.bladeDir; J.bladeDir = [b[0] * ca - b[2] * sa, b[1], b[0] * sa + b[2] * ca];
    }
  }
  /** world position of the head (for speech bubbles, portraits, halos) */
  head() { const w = this._w(this.J.head); return [this.x + w[0], this.y + w[1], this.z + w[2]]; }
  /**
   * a close-up bust for dialog boxes and menus, drawn live from the rig (blinks, hair and hats included):
   *   rig.drawPortrait(g, x, y, 40, { zoom: 3, turn: .6, bg: '#1a2050', frame: true })   // inside r.overlay(g => ...)
   * zoom: pixels per world unit (3 = face fills the frame), turn: 0 = facing you, .6 = three-quarter.
   * The bust stays upright while the rig kneels or lies down (upright: false shows the real pose); cape: false hides the cape;
   * tint: '#808080' greys it out (a KO'd party member).
   */
  drawPortrait(g, x, y, size = 40, o = {}) {
    const S = Math.round(size), zoom = o.zoom || 3, turn = o.turn === undefined ? .6 : o.turn, pitch = o.pitch || 12;
    const v = this._pv || (this._pv = new View('portrait', 'Portrait', 0, pitch, zoom, 1));
    v.set((Math.PI / 2 - this.facing - this.spin + turn) / DEG, pitch, zoom, 1);
    const cache = this._pcs || (this._pcs = new Map());
    let cvs = cache.get(S); if (!cvs) { cvs = [mkCanvas(S, S), mkCanvas(S, S)]; cache.set(S, cvs); }
    const [cv, c2] = cvs, cg = cv.getContext('2d'), g2 = c2.getContext('2d');
    cg.clearRect(0, 0, S, S); g2.clearRect(0, 0, S, S);
    const PW = this.poseW || {}, keep = { trail: this.trail, cheat: this._cheat, pitch: this._pitch, cape: this.o.cape, weapon: this.o.weapon, down: this.downW, kneel: PW.kneel, cheer: PW.cheer, cast: PW.cast, hurt: this.hurtW };
    const pose = o.upright !== false && (keep.down > 0 || keep.kneel > 0 || keep.cheer > 0 || keep.cast > 0 || keep.hurt > 0);
    if (pose) { this.downW = 0; this.hurtW = 0; if (this.poseW) PW.kneel = PW.cheer = PW.cast = 0; this._pose(); }
    if (o.cape === false) this.o.cape = null;
    if (o.weapon === false) this.o.weapon = null;
    { const st = clamp(1 - v.pitchDeg / 45, 0, 1), camA = Math.atan2(v.fy, v.fx); this._cheat = st > 0 && this.o.cheat ? clamp(angDiff(this.facing, camA), -this.o.cheat, this.o.cheat) * st : 0; }   // frame the head where draw() will put it
    this.trail = [];
    try {
      const hw = this._w(this.J.head), hp = v.p(hw[0], hw[1], hw[2]);
      this.draw(cg, Math.round(S / 2 - hp[0]), Math.round(S * (o.headY || .46) - hp[1]), v);
    } finally {
      this.trail = keep.trail; this._cheat = keep.cheat; this._pitch = keep.pitch; this.o.cape = keep.cape; this.o.weapon = keep.weapon;
      if (pose) { this.downW = keep.down; this.hurtW = keep.hurt; if (this.poseW) { PW.kneel = keep.kneel; PW.cheer = keep.cheer; PW.cast = keep.cast; } this._pose(); }
    }
    if (o.tint) { cg.globalCompositeOperation = 'source-atop'; cg.globalAlpha = .6; cg.fillStyle = o.tint; cg.fillRect(0, 0, S, S); cg.globalAlpha = 1; cg.globalCompositeOperation = 'source-over'; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g2.drawImage(cv, dx, dy);   // outline like the in-game sprite
    g2.globalCompositeOperation = 'source-in'; g2.fillStyle = o.outline || '#0c0818'; g2.fillRect(0, 0, S, S); g2.globalCompositeOperation = 'source-over';
    g2.drawImage(cv, 0, 0);
    if (o.frame !== false) E.ui.box(g, x - 2, y - 2, S + 4, S + 4, { bg: o.bg || '#1a2050', border: o.border, shadow: o.shadow });
    g.drawImage(c2, 1, 1, S - 2, S - 2, Math.round(x) + 1, Math.round(y) + 1, S - 2, S - 2);
  }
  _cape(dt) {
    const c = this.o.cape, sz = this.o.size, N = c.len || 6, seg = (c.seg || 2.4) * sz, W0 = (c.width || 5) * sz;
    const anchor = s => { const J = this.J, sh = s > 0 ? J.shR : J.shL, w = this._w(V3.add(sh, [-1.3, -s * .6, -.6])); return [this.x + w[0], this.y + w[1], this.z + w[2]]; };
    if (!this.capeL) {
      this.capeL = []; this.capeR = [];
      const bx = -Math.cos(this.facing) * (c.body || 3.4) * sz, by = -Math.sin(this.facing) * (c.body || 3.4) * sz;   // start hanging behind the back, not inside the body
      for (const s of [-1, 1]) { const a = anchor(s), ch = s < 0 ? this.capeL : this.capeR; for (let i = 0; i < N; i++) { const k = Math.min(1, i / 2); ch.push({ x: a[0] + bx * k, y: a[1] + by * k, z: a[2] - i * seg, px: a[0] + bx * k, py: a[1] + by * k, pz: a[2] - i * seg }); } }
    }
    const damp = Math.pow(.982, dt * 120), dt2 = dt * dt, fx = Math.cos(this.facing + this.spin), fy = Math.sin(this.facing + this.spin);   // trails behind the body's turn
    for (const [ch, s] of [[this.capeL, -1], [this.capeR, 1]]) {
      const a = anchor(s); Object.assign(ch[0], { x: a[0], y: a[1], z: a[2], px: a[0], py: a[1], pz: a[2] });
      for (let i = 1; i < N; i++) {
        const n = ch[i], vx = (n.x - n.px) * damp, vy = (n.y - n.py) * damp, vz = (n.z - n.pz) * damp;
        n.px = n.x; n.py = n.y; n.pz = n.z;
        const fl = Math.sin(this.t * 11 - i * .8 + s) * 40 * (i / N);
        n.x += vx - fx * 30 * dt2; n.y += vy - fy * 30 * dt2; n.z += vz + (-230 + fl) * dt2;
      }
    }
    const L = this.capeL, R = this.capeR, bodyR = (c.body || 3.4) * sz, shZ = this.z + this.J.shC[2] * sz;
    for (let it = 0; it < 4; it++) {
      for (const ch of [L, R]) for (let i = 1; i < N; i++) {
        const a = ch[i - 1], b = ch[i], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 1e-6, k = (d - seg) / d;
        if (i === 1) { b.x -= dx * k; b.y -= dy * k; b.z -= dz * k; } else { a.x += dx * k * .5; a.y += dy * k * .5; a.z += dz * k * .5; b.x -= dx * k * .5; b.y -= dy * k * .5; b.z -= dz * k * .5; }
      }
      for (let i = 1; i < N; i++) {
        const a = L[i], b = R[i], w = W0 * (1 + .25 * i / N), dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 1e-6, k = (d - w) / d * .5;
        a.x += dx * k; a.y += dy * k; a.z += dz * k; b.x -= dx * k; b.y -= dy * k; b.z -= dz * k;
      }
      for (const ch of [L, R]) for (let i = 1; i < N; i++) {
        const n = ch[i]; if (n.z < this.z + .4) n.z = this.z + .4; if (n.z > shZ + seg * .6) n.z = shZ + seg * .6;   // never whips up over the head
        const rx = n.x - this.x, ry = n.y - this.y, d = Math.hypot(rx, ry), fwd = rx * fx + ry * fy;
        if (n.z < shZ + 1 && fwd > -bodyR * .35) { n.x -= fx * (fwd + bodyR * .35); n.y -= fy * (fwd + bodyR * .35); }   // cloth stays behind the back plane, never across the chest
        else if (n.z < shZ + 1 && d < bodyR) { const ux = d > .01 ? rx / d : -fx, uy = d > .01 ? ry / d : -fy; n.x = this.x + ux * bodyR; n.y = this.y + uy * bodyR; }
      }
    }
  }
  /** draw into g with (ox, oy) = projected position of the rig's root */
  /**
   * Sp(joint, f, r, z): a detail drawn around a joint (the face, hair, belt, toes) at offsets in the body's own frame,
   * projected by S. A knocked-down body turns them backward with it. While a motion clip plays (Mocap.drive sets
   * mocapTilt: the clip's body and head frames, 3x3, columns forward, right, up) they lean, roll and turn upside down with
   * the body, and the face with the head; the weapon hand's offsets (the blade) are already in the rig's frame.
   */
  _offsets(S) {
    const J = this.J, T = this.mocapTilt;
    if (T) return (p, df = 0, dr = 0, dz = 0) => {
      if (p === J.handR) return S(p[0] + df, p[1] + dr, p[2] + dz);
      const m = p === J.head ? T.head : T.body;
      return S(p[0] + m[0] * df + m[1] * dr + m[2] * dz, p[1] + m[3] * df + m[4] * dr + m[5] * dz, p[2] + m[6] * df + m[7] * dr + m[8] * dz);
    };
    const dA = (this.downW || 0) * Math.PI / 2 * .96, dca = Math.cos(dA), dsa = Math.sin(dA);
    return dA ? (p, df = 0, dr = 0, dz = 0) => S(p[0] + df * dca - dz * dsa, p[1] + dr, p[2] + df * dsa + dz * dca) : (p, df = 0, dr = 0, dz = 0) => S(p[0] + df, p[1] + dr, p[2] + dz);
  }
  draw(g, ox, oy, view) {
    this._pitch = view.pitchDeg;
    if (this.o.charView !== false) view = charView(view);
    if (view.id !== 'portrait') this._lastView = view;   // drawSmear projects the trail with the same view
    // cheated 3/4 pose: in side-ish views turn the body partly toward the camera, like hand-drawn sprites
    const st = clamp(1 - view.pitchDeg / 45, 0, 1), camA = Math.atan2(view.fy, view.fx);
    this._camSide = Math.cos(camA - this.facing - Math.PI / 2) >= 0 ? 1 : -1;   // which hand the camera sees
    this._cheat = st > 0 && this.o.cheat ? clamp(angDiff(this.facing, camA), -this.o.cheat, this.o.cheat) * st : 0;
    if (this.o.style === 'classic') this._drawClassic(g, ox, oy, view); else this._drawHD(g, ox, oy, view);
  }
  /** Optional synchronous art only. Projected joints include native depth;
   * enqueue adds an attachment to the same body-part painter order. */
  _drawAttachments(g, joints, scale, parts) {
    if (typeof this.o.drawAttachments !== 'function') return;
    const anchors = Object.freeze(Object.fromEntries(Object.entries(joints).map(([key, p]) => [key, Object.freeze(p.slice())])));
    const result = this.o.drawAttachments(g, Object.freeze({
      joints: anchors, scale, limbWidth: this.o.limbW,
      enqueue(depth, draw) {
        if (!Number.isFinite(depth) || typeof draw !== 'function') throw new Error('Invalid humanoid attachment.');
        parts.push({ d: depth, f: () => draw(g) });
      }
    }));
    if (result && typeof result.then === 'function') throw new Error('Humanoid attachments must be synchronous.');
  }
  /**
   * HD style: volumetric limbs, shaped torso, outfits, hair styles, hands and boots, each shaded with
   * hue-shifted tones and a light from the upper left (the look of hand-drawn PS1 / N64 era sprites).
   */
  _drawHD(g, ox, oy, view) {
    const o = this.o, C = this.C, J = this.J, sz = o.size, sc = view.scale * sz, ops = this._ops || (this._ops = []);
    ops.length = 0;
    const an = this.facing + this.spin + this._cheat, ca = Math.cos(an), sa = Math.sin(an), k = (1 - this.sq * .4) * sz, kz = (1 + this.sq) * sz;
    const vax = view.ax, vay = view.ay, vbx = view.bx, vby = view.by, vbz = view.bz, vdx = view.dx, vdy = view.dy, vdz = view.dz;
    const S = (f, r, z) => { const wx = (f * ca - r * sa) * k, wy = (f * sa + r * ca) * k, wz = z * kz; return [ox + vax * wx + vay * wy, oy + vbx * wx + vby * wy + vbz * wz, vdx * wx + vdy * wy + vdz * wz]; };
    const Sp = this._offsets(S);   // details around a joint (face, hair, belt, toes) turn with the body
    const Q = {};
    for (const key of JOINT_KEYS) Q[key] = Sp(J[key]);
    const lq = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
    const dC = (Q.hipC[2] + Q.shC[2]) * .5, u = sc, lw = o.limbW / 2;   // u: screen pixels per world unit, lw: limb thickness from the build
    // a capsule between projected points A and B with screen radii ra, rb (dx, dy shift it)
    const cap = (A, B, ra, rb, col, dx = 0, dy = 0) => {
      const ax = A[0] + dx, ay = A[1] + dy, bx = B[0] + dx, by = B[1] + dy, vx = bx - ax, vy = by - ay, L = Math.hypot(vx, vy);
      if (ra < .75 && rb < .75) { px.line(g, ax, ay, bx, by, col, 1); return; }
      if (L > .01) { const nx = -vy / L, ny = vx / L; px.poly(g, [[ax + nx * ra, ay + ny * ra], [bx + nx * rb, by + ny * rb], [bx - nx * rb, by - ny * rb], [ax - nx * ra, ay - ny * ra]], col); }
      px.disc(g, ax, ay, Math.max(0, ra - .35), col); px.disc(g, bx, by, Math.max(0, rb - .35), col);
    };
    // shaded capsule: dark silhouette, base shifted toward the light, highlight along the lit edge
    const limb = (A, B, ra, rb, c, far, bias = 0) => {
      const t = tones(c), dk = far ? t.deep : t.sh, base = far ? t.sh : t.base, lt = far ? t.base : t.lt;
      ops.push({ d: (A[2] + B[2]) * .5 + bias, f: () => {
        cap(A, B, ra, rb, dk);
        cap(A, B, Math.max(.45, ra - .7), Math.max(.45, rb - .7), base, -.6, -.6);
        if (ra > 1.5 && !far) { const vx = B[0] - A[0], vy = B[1] - A[1], L = Math.hypot(vx, vy) || 1; let nx = -vy / L, ny = vx / L; if (nx * -.6 + ny * -.8 < 0) { nx = -nx; ny = -ny; } const off = ra - 1.1; px.line(g, A[0] + vx * .2 + nx * off, A[1] + vy * .2 + ny * off, A[0] + vx * .75 + nx * off, A[1] + vy * .75 + ny * off, lt); }
      } });
    };
    // shaded polygon: dark shape, then a slightly inset copy shifted toward the light
    const inset = (pts, d) => { let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length; return pts.map(p => { const vx = p[0] - cx, vy = p[1] - cy, l = Math.hypot(vx, vy) || 1, m = Math.max(0, l - d) / l; return [cx + vx * m - .6, cy + vy * m - .6]; }); };
    const slab = (pts, c, far) => { const t = tones(c); px.poly(g, pts, far ? t.deep : t.sh); px.poly(g, inset(pts, 1.1), far ? t.sh : t.base); };
    const W = s => (s > 0 ? 1 : -1);
    // ---- legs and boots ----
    for (const s of [-1, 1]) {
      const hip = s > 0 ? Q.hipR : Q.hipL, knee = s > 0 ? Q.kneeR : Q.kneeL, foot = s > 0 ? Q.footR : Q.footL, far = knee[2] < dC;
      const ank = lq(knee, foot, .62), toe = Sp(s > 0 ? J.footR : J.footL, 1.9, 0, .3);
      limb(hip, knee, 1.45 * u * lw, 1.2 * u * lw, C.pants, far);
      limb(knee, ank, 1.2 * u * lw, 1.05 * u * lw, C.pants, far, .001);
      limb(ank, foot, 1.15 * u * lw, 1.05 * u * lw, C.boot, far, .002);
      limb(foot, toe, 1.0 * u * lw, .85 * u * lw, C.boot, far, .003);
    }
    // ---- outfit below the belt: tunic / robe / coat ----
    const out = o.outfit, hz = Math.max(J.hipL[2], J.hipR[2]) + .9;
    if (out === 'tunic' || out === 'robe' || out === 'coat') {
      const len = out === 'robe' ? hz - .6 : out === 'coat' ? hz * .62 : hz * .42, fl = out === 'robe' ? 1.55 : 1.3, dep = o.torsoW * .7;
      const tail = out === 'coat' ? -1.2 - 2.2 * Math.min(1, this.spW) : 0, fwd = this.atkW * .3;
      const lat = [Sp([J.hipC[0], -o.hipHalf * 1.25, hz]), Sp([J.hipC[0], o.hipHalf * 1.25, hz]), Sp([J.hipC[0] + tail * .5 + fwd, o.hipHalf * 1.25 * fl, hz - len]), Sp([J.hipC[0] + tail * .5 + fwd, -o.hipHalf * 1.25 * fl, hz - len])];
      const sag = [Sp([J.hipC[0] + dep, 0, hz]), Sp([J.hipC[0] + (out === 'coat' ? dep * .3 : dep * fl) + fwd, 0, hz - len * (out === 'coat' ? .45 : 1)]), Sp([J.hipC[0] - dep * fl + tail, 0, hz - len]), Sp([J.hipC[0] - dep, 0, hz])];
      const cc = out === 'coat' ? (C.coat || C.cloth) : C.cloth, trim = C.trim || (out === 'coat' ? shade(cc, -.35) : C.belt);
      ops.push({ d: Q.hipC[2] + .05, f: () => {
        slab(lat, cc, false); slab(sag, cc, false);
        const t = tones(trim); px.line(g, lat[2][0], lat[2][1], lat[3][0], lat[3][1], t.base, Math.max(1, Math.round(u * .6)));
      } });
    }
    // ---- torso: a shaped front plate plus a core for depth, belt, seam, armor ----
    const shL = Sp(J.shL, 0, -.4, 0), shR = Sp(J.shR, 0, .4, 0), hL = Sp(J.hipL, 0, -.25, .5), hR = Sp(J.hipR, 0, .25, .5);
    const wL = lq(Sp(J.hipL, 0, -.2, 0), shL, .5), wR = lq(Sp(J.hipR, 0, .2, 0), shR, .5), core0 = Sp(J.hipC, 0, 0, .8), core1 = Sp(J.shC, 0, 0, -.4);
    const facingCam = S(2, 0, 6)[2] > S(0, 0, 6)[2];
    if (o.skeleton) ops.push({ d: dC, f: () => {   // rib cage cut by dark gaps (reads in every view), a bare spine, pelvis and collarbones
      const b = tones(C.skin), rib0 = Sp(J.shC, .2, 0, -.7), rib1 = lq(Sp(J.shC, .3, 0, -.7), Sp(J.hipC, .2, 0, 1), .55), gap = '#1a1018';
      cap(core0, rib1, .32 * u, .32 * u, b.sh); px.line(g, core0[0] - .5, core0[1], rib1[0] - .5, rib1[1], b.base);   // spine below the ribs
      const pl = Sp(J.hipL, 0, -.2, .9), pr = Sp(J.hipR, 0, .2, .9); cap(pl, pr, .75 * u, .75 * u, b.sh); cap(pl, pr, Math.max(.4, .75 * u - .8), Math.max(.4, .75 * u - .8), b.base, -.5, -.5);
      const rw = o.torsoW * .8 * u, rb = o.torsoW * .55 * u;
      cap(rib0, rib1, rw, rb, b.sh); cap(rib0, rib1, Math.max(.5, rw - .9), Math.max(.5, rb - .9), b.base, -.5, -.5);
      const len = rib1[1] - rib0[1];
      for (let i = 1; i <= 3; i++) {   // horizontal gaps between the ribs
        const y = Math.round(rib0[1] + len * (i / 4) + rw * .25), half = Math.max(1, (rw - (rw - rb) * i / 4) - 1.2), cx0 = lerp(rib0[0], rib1[0], i / 4);
        px.rect(g, cx0 - half, y, half * 2, 1, gap); px.rect(g, cx0 - half, y - 1, half * 2, 1, b.lt);
      }
      if (facingCam) { const s0 = Sp(J.shC, 1, 0, -.9), s1 = lq(Sp(J.shC, 1, 0, -.9), rib1, .8); px.line(g, s0[0], s0[1], s1[0], s1[1], b.hi); }   // sternum
      px.line(g, shL[0], shL[1], shR[0], shR[1], b.base, Math.max(1, Math.round(u * .5)));
    } });
    else ops.push({ d: dC, f: () => {
      const t = tones(C.cloth), plate = [shL, shR, [wR[0] - .3, wR[1]], hR, hL, [wL[0] + .3, wL[1]]];
      px.poly(g, plate, t.sh); cap(core0, core1, o.torsoW * .62 * u, o.torsoW * .72 * u, t.sh);
      px.poly(g, inset(plate, 1.1), t.base); cap(core0, core1, Math.max(.5, o.torsoW * .62 * u - .9), Math.max(.5, o.torsoW * .72 * u - .9), t.base, -.6, -.6);
      if (facingCam) { const n0 = Sp(J.shC, .9, 0, -.8), n1 = Sp(J.hipC, 1.1, 0, 1.4); px.line(g, n0[0], n0[1], n1[0], n1[1], t.sh); const c0 = Sp(J.shC, .7, -.9, -.2), c1 = Sp(J.shC, 1.1, 0, -1.3), c2 = Sp(J.shC, .7, .9, -.2); px.line(g, c0[0], c0[1], c1[0], c1[1], tones(C.trim || C.clothLt).base); px.line(g, c1[0], c1[1], c2[0], c2[1], tones(C.trim || C.clothLt).base); }
      else { const n0 = Sp(J.shC, .3, 0, -.6), n1 = Sp(J.hipC, .3, 0, 1.6); px.line(g, n0[0], n0[1], n1[0], n1[1], t.lt); }
      const bl = Sp(J.hipL, 0, -.3, .7), br = Sp(J.hipR, 0, .3, .7), bt = tones(C.belt);
      px.line(g, bl[0], bl[1], br[0], br[1], bt.sh, Math.max(1, Math.round(u * .7))); px.line(g, bl[0], bl[1] - 1, br[0], br[1] - 1, bt.base);
      if (facingCam) { const bk = Sp(J.hipC, 1.1, 0, .7); px.rect(g, bk[0] - 1, bk[1] - 1, 2, 2, bt.hi); }
      if (o.armor) { const m = tones(C.plate || C.metal); const p0 = Sp(J.shC, .5, 0, -1), p1 = Sp(J.hipC, .5, 0, 3.2); cap(p0, p1, o.torsoW * .5 * u, o.torsoW * .4 * u, m.sh); cap(p0, p1, o.torsoW * .5 * u - 1, o.torsoW * .4 * u - 1, m.base, -.6, -.6); px.dot(g, p0[0] - 1, p0[1] + 1, m.hi); }
    } });
    // ---- cape: cloth strip with folds ----
    if (this.capeL) {
      const L = this.capeL, R = this.capeR, x0 = this.x, y0 = this.y, z0 = this.z, ct = tones(C.cape), it = tones(C.capeIn), capeAway = Math.cos(an - Math.atan2(view.fy, view.fx)) < -.3;
      const PW = n => { const wx = n.x - x0, wy = n.y - y0, wz = n.z - z0; return [ox + vax * wx + vay * wy, oy + vbx * wx + vby * wy + vbz * wz, vdx * wx + vdy * wy + vdz * wz]; };
      for (let i = 0; i < L.length - 1; i++) {
        const q = [PW(L[i]), PW(R[i]), PW(R[i + 1]), PW(L[i + 1])], last = i === L.length - 2;
        ops.push({ d: capeAway ? (q[0][2] + q[2][2]) / 2 - .6 : Math.min((q[0][2] + q[2][2]) / 2 - .6, dC - .05), f: () => {
          let ar = 0; for (let m = 0; m < 4; m++) { const A = q[m], B = q[(m + 1) % 4]; ar += A[0] * B[1] - B[0] * A[1]; }
          const front = ar > 0, t = front ? ct : it;
          px.poly(g, q, front ? (i % 2 ? t.base : t.lt) : (i % 2 ? t.sh : t.deep));
          px.line(g, q[0][0], q[0][1], q[3][0], q[3][1], front ? t.sh : t.deep);
          if (last) px.line(g, q[2][0], q[2][1], q[3][0], q[3][1], tones(C.trim || C.belt).base);
        } });
      }
    }
    // ---- flowing hair (long / ponytail) ----
    if (this.hairPts) {
      const P = this.hairPts, x0 = this.x, y0 = this.y, z0 = this.z, ht = tones(C.hair), w0 = (this.o.hair.style === 'ponytail' ? .9 : 1.5) * u;
      const PW = n => { const wx = n.x - x0, wy = n.y - y0, wz = n.z - z0; return [ox + vax * wx + vay * wy, oy + vbx * wx + vby * wy + vbz * wz, vdx * wx + vdy * wy + vdz * wz]; };
      const pts = P.map(PW);
      for (let i = 0; i < pts.length - 1; i++) { const r0 = w0 * (1 - i / pts.length * .75), r1 = w0 * (1 - (i + 1) / pts.length * .75); ops.push({ d: (pts[i][2] + pts[i + 1][2]) / 2 - .4, f: () => { cap(pts[i], pts[i + 1], r0, r1, ht.sh); cap(pts[i], pts[i + 1], Math.max(.4, r0 - .8), Math.max(.4, r1 - .8), i % 2 ? ht.base : ht.lt, -.5, -.5); } }); }
    }
    // ---- head: face, hair, eyes, hats ----
    const neck0 = Sp(J.shC, 0, 0, -.2), neck1 = Sp(J.head, 0, 0, -o.headR * .6);
    limb(neck0, neck1, .75 * u, .75 * u, C.skin, false, -.01);
    ops.push({ d: Q.head[2], f: () => {
      // head in layers: hair mass behind, a face set slightly forward, a hair cap with bangs, then eyes, brows and mouth
      const R = o.headR, r = R * u * .93, st = tones(C.skin), ht = tones(C.hair), hs = o.hair.style;
      const H = Sp(J.head, R * .1, 0, -R * .05), back = Sp(J.head, -R * .42, 0, R * .18), cap = Sp(J.head, -R * .2, 0, R * .74);
      const disc2 = (P0, rad, t, far) => { px.disc(g, P0[0], P0[1], rad, far ? t.deep : t.sh); px.disc(g, P0[0] - .6, P0[1] - .6, Math.max(.5, rad - 1), far ? t.sh : t.base); };
      if (o.skeleton) {   // skull: cranium, jaw, dark sockets with glowing eyes, nose hole and teeth
        const bt = tones(C.skin), jaw = Sp(J.head, R * .45, 0, -R * .78), gap = '#1a1018';
        disc2(jaw, r * .5, bt, false); disc2(H, r * .86, bt, false);
        if (r > 2.5) px.dot(g, H[0] - r * .4, H[1] - r * .45, bt.lt);
        const t0 = Sp(J.head, R * .72, -R * .34, -R * .5), t1 = Sp(J.head, R * .72, R * .34, -R * .5);   // tooth row: a dark gap with white teeth
        if ((t0[2] + t1[2]) / 2 > H[2] - .2) { px.line(g, t0[0], t0[1], t1[0], t1[1], gap, Math.max(1, Math.round(u * .6))); if (u > 1.3) for (let k = 0; k <= 4; k += 2) { const q = lq(t0, t1, k / 4); px.dot(g, q[0], q[1], bt.hi); } }
        for (const sd of [-1, 1]) {
          const E2 = Sp(J.head, R * .78, sd * R * .4, -R * .02); if (E2[2] <= H[2] + .1) continue;
          const br = Sp(J.head, R * .82, sd * R * .4, R * .3); px.line(g, br[0] - r * .3, br[1], br[0] + r * .3, br[1], bt.sh);   // brow ridge
          px.disc(g, E2[0], E2[1], Math.max(1, r * .38), gap); if (o.eyeGlow) { px.glow(g, 1); px.dot(g, E2[0], E2[1], o.eyeGlow); }
          const ck = Sp(J.head, R * .7, sd * R * .5, -R * .4); if (u > 1.5) px.dot(g, ck[0], ck[1], bt.sh);   // cheek hollow
        }
        const ns = Sp(J.head, R * .92, 0, -R * .28);
        if (ns[2] > H[2]) px.rect(g, ns[0], ns[1], 1, Math.max(1, Math.round(u * .6)), gap);
        if (o.hat) this._hat(g, Sp, J, r, H);
        return;
      }
      const bald = hs === 'bald', hairBehind = back[2] < H[2];
      if (!bald && hairBehind) disc2(back, r * .98, ht, false);
      disc2(H, r * .9, st, false);
      if (r > 2.5) px.dot(g, H[0] - r * .45, H[1] - r * .4, st.lt);
      // ears on the side that faces the camera
      if (hs !== 'long' && !o.hood && r > 2) for (const sd of [-1, 1]) { const ear = Sp(J.head, -R * .05, sd * R * .92, -R * .1); if (ear[2] > H[2] - R * .2) { px.disc(g, ear[0], ear[1], Math.max(.6, r * .2), st.sh); } }
      if (!bald) {
        if (!hairBehind) disc2(back, r * .98, ht, false);
        disc2(cap, r * .7, ht, false);   // the cap stops above the eyes; the fringe (bangs) covers the forehead
        const bangs = o.face && o.face.bangs !== undefined ? o.face.bangs : .7, fringe = Sp(J.head, R * .6, 0, R * .56);   // bangs over the forehead (face.bangs 0..1), clear of the eyes
        if (bangs > 0 && fringe[2] > H[2]) { const fr = r * .42 * bangs; px.disc(g, fringe[0], fringe[1], fr, ht.sh); px.disc(g, fringe[0] - .5, fringe[1] - .5, Math.max(.4, fr - .8), ht.base); }
        if (hs === 'spiky') for (const [df, dr, dz] of [[-1, 0, .7], [-.6, .7, .75], [-.6, -.7, .75], [-.25, .42, 1.02], [-.25, -.42, 1.02], [-1.1, 0, .05]]) {   // spikes sweep up and back
          const root = Sp(J.head, df * R * .6, dr * R * .6, dz * R * .6), tip = Sp(J.head, df * R * 1.55, dr * R * 1.55, dz * R * 1.55);
          const vx = tip[0] - root[0], vy = tip[1] - root[1], l = Math.hypot(vx, vy) || 1, nx = -vy / l * r * .42, ny = vx / l * r * .42;
          px.poly(g, [[root[0] + nx, root[1] + ny], [tip[0], tip[1]], [root[0] - nx, root[1] - ny]], ht.sh); px.poly(g, [[root[0] + nx * .5 - .5, root[1] + ny * .5 - .5], [tip[0] - .5, tip[1] - .5], [root[0] - nx * .2, root[1] - ny * .2]], ht.base);
        }
        px.dot(g, cap[0] - r * .35, cap[1] - r * .45, ht.hi); px.dot(g, cap[0] - r * .1, cap[1] - r * .55, ht.lt);
      }
      if (o.hood) { const tp = Sp(J.head, -R * 1.1, 0, R * .9); px.disc(g, tp[0], tp[1], r * .45, ht.base); }
      if (o.hat) this._hat(g, Sp, J, r, H);
      // face: eyes (with a catch-light when big enough), brows and a mouth, on the side facing the camera
      const big = o.face && o.face.eyes === 'big', eh = Math.max(1, Math.round(u * (big ? 1.4 : 1.05))), ew = u > 2.6 || (big && u > 1.8) ? 2 : 1;
      for (const sd of [-1, 1]) {
        const E2 = Sp(J.head, R * .9, sd * R * .36, -R * .02);
        if (E2[2] <= H[2] + .15) continue;
        if (o.eyeGlow) { px.glow(g, 1); px.rect(g, E2[0], E2[1], Math.max(1, ew + (u > 1.6 ? 1 : 0)), Math.max(1, eh - 1), o.eyeGlow); continue; }
        if (this.blink > 0 && this.hurtW < .5 && this.expr !== 'wince') {
          const top = E2[1] - eh + 1;
          if (eh >= 2 && u > 1.7) { px.rect(g, E2[0], top, ew, 1, C.eye); px.rect(g, E2[0], top + 1, ew, eh - 1, C.iris || '#3a4a8a'); px.dot(g, E2[0], top + 1, C.eyeWhite || '#ffffff'); }   // lash line, iris, catch-light
          else { px.rect(g, E2[0], top, ew, eh, C.eye); if (u > 1.7) px.dot(g, E2[0] + (ew > 1 ? 1 : 0), top, C.eyeWhite || '#ffffff'); }
        } else px.rect(g, E2[0] - (ew > 1 ? 1 : 0), E2[1], ew + 1, 1, C.eye);
        if (u > 2.2 && !bald) { const b0 = Sp(J.head, R * .9, sd * R * .22, R * .42), b1 = Sp(J.head, R * .86, sd * R * .52, R * .38); px.line(g, b0[0], b0[1] - 2, b1[0], b1[1] - 2, ht.sh); }   // brows on bigger heads, clear of the eyes
      }
      if (u > 1.9) {   // mouth: expr 'smile' | 'shout' | 'angry' | 'wince', and it moves while the rig talks (Dialog portraits)
        const m = Sp(J.head, R * .95, 0, -R * .5), ex = this.expr, open = ex === 'shout' || (this._talk && Math.floor(this.t * 9) % 2 === 0), w = u > 2.6 ? 2 : 1;
        if (m[2] > H[2]) {
          if (open) px.rect(g, m[0] - (w > 1 ? 1 : 0), m[1] - (ex === 'shout' ? 1 : 0), w + (ex === 'shout' ? 1 : 0), ex === 'shout' ? 3 : 2, '#4a1418');
          else if (ex === 'smile') { px.rect(g, m[0] - w, m[1], w * 2 + 1, 1, st.deep); px.dot(g, m[0] - w, m[1] - 1, st.deep); px.dot(g, m[0] + w, m[1] - 1, st.deep); }
          else px.rect(g, m[0] - (w > 1 ? 1 : 0), m[1], w, 1, this.hurtW > .3 || ex === 'wince' ? '#6a1a1a' : st.deep);
        }
        if (ex === 'angry' && u > 1.7) for (const sd of [-1, 1]) { const b0 = Sp(J.head, R * .9, sd * R * .15, R * .3), b1 = Sp(J.head, R * .86, sd * R * .55, R * .45); if (b0[2] > H[2]) px.line(g, b0[0], b0[1] - 1, b1[0], b1[1] - 1, ht.deep); }
      }
    } });
    // ---- arms, hands, shoulder pads ----
    for (const s of [-1, 1]) {
      const sh = s > 0 ? Q.shR : Q.shL, el = s > 0 ? Q.elbowR : Q.elbowL, hd = s > 0 ? Q.handR : Q.handL, far = el[2] < dC;
      const upper = o.sleeves === 'none' ? C.skin : C.cloth, lower = o.sleeves === 'long' ? C.cloth : C.skin;
      limb(sh, el, 1.15 * u * lw, 1.0 * u * lw, upper, far);
      limb(el, hd, 1.0 * u * lw, .9 * u * lw, lower, far, .001);
      const hc = C.glove || C.skin, ht = tones(hc);
      ops.push({ d: hd[2] + .02, f: () => { px.disc(g, hd[0], hd[1], Math.max(.6, .82 * u * lw - .35), far ? ht.deep : ht.sh); px.disc(g, hd[0] - .5, hd[1] - .5, Math.max(.4, .58 * u * lw - .35), far ? ht.sh : ht.base); } });
      if (o.armor) { const pad = Sp(s > 0 ? J.shR : J.shL, -.1, s * .3, .5), m = tones(C.plate || C.metal); ops.push({ d: sh[2] + .03, f: () => { px.disc(g, pad[0], pad[1], 1.55 * u, far ? m.deep : m.sh); px.disc(g, pad[0] - .6, pad[1] - .6, Math.max(.5, 1.55 * u - 1), far ? m.sh : m.base); px.dot(g, pad[0] - u * .8, pad[1] - u * .8, m.hi); } }); }
    }
    // ---- weapons ----
    if (o.weapon === 'gun') {
      const hd = J.handR, bd = J.bladeDir, Hn = Q.handR, mz = Sp(hd, bd[0] * 5.5, bd[1] * 5.5, bd[2] * 5.5), gp = Sp(hd, -bd[0] * .6, -bd[1] * .6, -bd[2] * .6 - 1.4), m = tones(C.metal);
      ops.push({ d: Hn[2] + .03, f: () => { cap(Hn, gp, .8 * u, .7 * u, m.deep); cap(Hn, mz, .95 * u, .75 * u, m.sh); cap(Hn, mz, Math.max(.4, .95 * u - .8), Math.max(.4, .75 * u - .8), m.base, -.5, -.5); px.dot(g, mz[0], mz[1], '#ffffff'); } });
    } else if (o.weapon === 'staff') {
      const hd = J.handR, bd = J.bladeDir, Hn = Q.handR, top = Sp(hd, bd[0] * 10, bd[1] * 10, bd[2] * 10), bot = Sp(hd, -bd[0] * 7, -bd[1] * 7, -bd[2] * 7), wt = tones(C.staff || '#8a5a32'), ot = tones(C.orb || '#7fe3ff');
      ops.push({ d: (Hn[2] + top[2]) / 2, f: () => { cap(bot, top, .6 * u, .6 * u, wt.sh); px.line(g, bot[0] - .5, bot[1] - .5, top[0] - .5, top[1] - .5, wt.lt); px.glow(g, 1); px.disc(g, top[0], top[1], Math.max(1, u * 1.5), ot.sh); px.disc(g, top[0] - .6, top[1] - .6, Math.max(.6, u * 1.5 - 1), ot.base); px.dot(g, top[0] - 1, top[1] - 1, '#ffffff'); } });
    }
    if (o.weapon === 'sword') {
      const hd = J.handR, bd = J.bladeDir, Lb = o.bladeLen, Hn = Q.handR, sl = Math.hypot(bd[0], bd[1]) || 1, gx = -bd[1] / sl * 1.8, gy = bd[0] / sl * 1.8;
      const tip = Sp(hd, bd[0] * Lb, bd[1] * Lb, bd[2] * Lb), b0 = Sp(hd, bd[0] * 1.5, bd[1] * 1.5, bd[2] * 1.5), pom = Sp(hd, -bd[0] * 1.5, -bd[1] * 1.5, -bd[2] * 1.5);
      const g0 = Sp(hd, bd[0] * 1.5 + gx, bd[1] * 1.5 + gy, bd[2] * 1.5), g1 = Sp(hd, bd[0] * 1.5 - gx, bd[1] * 1.5 - gy, bd[2] * 1.5), m = tones(C.metal), h = tones(C.hilt);
      ops.push({ d: (Hn[2] + tip[2]) / 2, f: () => {
        const vx = tip[0] - b0[0], vy = tip[1] - b0[1], l = Math.hypot(vx, vy) || 1, nx = -vy / l * Math.max(.7, .65 * u), ny = vx / l * Math.max(.7, .65 * u);
        px.poly(g, [[b0[0] + nx, b0[1] + ny], [tip[0], tip[1]], [b0[0] - nx, b0[1] - ny]], m.sh);
        px.line(g, b0[0] - nx * .4, b0[1] - ny * .4, tip[0], tip[1], m.hi); px.line(g, b0[0] + nx * .5, b0[1] + ny * .5, tip[0], tip[1], m.base);
        px.line(g, pom[0], pom[1], Hn[0], Hn[1], '#5a3620', Math.max(1, Math.round(u * .7)));
        cap(g0, g1, .55 * u, .55 * u, h.sh); px.line(g, g0[0] - .5, g0[1] - .5, g1[0] - .5, g1[1] - .5, h.lt);
        px.disc(g, pom[0], pom[1], Math.max(.5, .6 * u - .35), h.base); px.dot(g, tip[0], tip[1], '#ffffff');
      } });
    }
    this._drawAttachments(g, Q, sc, ops);
    ops.sort((a, b) => a.d - b.d);
    for (const op of ops) op.f();
  }
  /** classic style: thin stick limbs (cheapest; good for huge crowds) */
  _drawClassic(g, ox, oy, view) {
    const o = this.o, C = this.C, J = this.J, sc = view.scale * o.size, ops = this._ops || (this._ops = []);
    ops.length = 0;
    // local (f, r, z) -> [screen x, screen y, depth], with facing, spin and squash applied
    const an = this.facing + this.spin + this._cheat, ca = Math.cos(an), sa = Math.sin(an), k = (1 - this.sq * .4) * o.size, kz = (1 + this.sq) * o.size;
    const vax = view.ax, vay = view.ay, vbx = view.bx, vby = view.by, vbz = view.bz, vdx = view.dx, vdy = view.dy, vdz = view.dz;
    const S = (f, r, z) => { const wx = (f * ca - r * sa) * k, wy = (f * sa + r * ca) * k, wz = z * kz; return [ox + vax * wx + vay * wy, oy + vbx * wx + vby * wy + vbz * wz, vdx * wx + vdy * wy + vdz * wz]; };
    const Sp = this._offsets(S);   // details around a joint (face, hair, belt, toes) turn with the body
    const Q = {};
    for (const key of JOINT_KEYS) Q[key] = Sp(J[key]);
    const lq = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
    const lw = Math.max(1, Math.round(o.limbW * sc * .75)), tw = Math.max(2, Math.round(o.torsoW * sc * .9));
    const dC = (Q.hipC[2] + Q.shC[2]) * .5;
    const seg = (A, B, c, w) => ops.push({ d: (A[2] + B[2]) * .5, f: () => px.line(g, A[0], A[1], B[0], B[1], c, w) });
    for (const s of [-1, 1]) {
      const hip = s > 0 ? Q.hipR : Q.hipL, knee = s > 0 ? Q.kneeR : Q.kneeL, foot = s > 0 ? Q.footR : Q.footL;
      const far = knee[2] < dC, pc = far ? C.pantsDk : C.pants, bc = far ? C.bootDk : C.boot, ank = lq(knee, foot, .55), toe = Sp(s > 0 ? J.footR : J.footL, .8, 0, 0);
      seg(hip, knee, pc, lw); seg(knee, ank, pc, lw); seg(ank, foot, bc, lw);
      ops.push({ d: foot[2] + .01, f: () => px.rect(g, toe[0] - 1, toe[1] - 1, 2, 2, bc) });
    }
    ops.push({
      d: dC, f: () => {
        const a = Q.shL, b = Q.shR, h = Q.hipC, sh = Q.shC;
        px.poly(g, [a, b, Q.hipR, Q.hipL], C.cloth);
        px.line(g, h[0], h[1], sh[0], sh[1], C.cloth, tw);
        px.line(g, a[0], a[1], b[0], b[1], C.cloth, 2);
        const bl = Sp(J.hipL, 0, 0, .6), br = Sp(J.hipR, 0, 0, .6); px.line(g, bl[0], bl[1], br[0], br[1], C.belt);
        if (S(2, 0, 6)[2] > S(0, 0, 6)[2]) { const n0 = Sp(J.shC, .6, 0, -.3), n1 = Sp(J.hipC, .9, 0, 2); px.line(g, n0[0], n0[1], n1[0], n1[1], C.clothLt); }
      }
    });
    if (this.capeL) {
      const L = this.capeL, R = this.capeR, x0 = this.x, y0 = this.y, z0 = this.z;
      const PW = n => { const wx = n.x - x0, wy = n.y - y0, wz = n.z - z0; return [ox + vax * wx + vay * wy, oy + vbx * wx + vby * wy + vbz * wz, vdx * wx + vdy * wy + vdz * wz]; };
      for (let i = 0; i < L.length - 1; i++) {
        const q = [PW(L[i]), PW(R[i]), PW(R[i + 1]), PW(L[i + 1])];
        ops.push({ d: (q[0][2] + q[2][2]) / 2 - .6, f: () => { let ar = 0; for (let m = 0; m < 4; m++) { const A = q[m], B = q[(m + 1) % 4]; ar += A[0] * B[1] - B[0] * A[1]; } px.poly(g, q, ar > 0 ? C.cape : C.capeIn); } });
      }
    }
    ops.push({
      d: Q.head[2], f: () => {
        const H = Q.head, r = o.headR * sc * .9;
        px.disc(g, H[0], H[1], r, C.skin);
        const hc = Sp(J.head, -.95, 0, .95); px.disc(g, hc[0], hc[1], r * (o.hood ? 1.05 : .95), C.hair);
        if (o.hood) { const tp = Sp(J.head, -o.headR * 1.1, 0, o.headR * .9); px.disc(g, tp[0], tp[1], r * .45, C.hair); }
        if (o.hat) this._hat(g, Sp, J, r, H);
        for (const s of [-1, 1]) {
          const E2 = Sp(J.head, o.headR * .82, s * 1.25, .2);
          if (E2[2] > H[2] + .3) { if (o.eyeGlow) px.rect(g, E2[0], E2[1], 1, 1, o.eyeGlow); else if (this.blink > 0 && this.hurtW < .5) px.rect(g, E2[0], E2[1] - (sc > 1.45 ? 1 : 0), 1, sc > 1.45 ? 2 : 1, C.eye); else px.dot(g, E2[0], E2[1], C.eye); }
        }
      }
    });
    for (const s of [-1, 1]) {
      const sh = s > 0 ? Q.shR : Q.shL, el = s > 0 ? Q.elbowR : Q.elbowL, hd = s > 0 ? Q.handR : Q.handL, far = el[2] < dC;
      seg(sh, el, far ? C.clothDk : C.cloth, lw); seg(el, hd, far ? C.skinDk : C.skin, lw);
      ops.push({ d: hd[2] + .02, f: () => px.rect(g, hd[0] - 1, hd[1] - 1, 2, 2, far ? C.skinDk : C.skin) });
    }
    if (o.weapon === 'gun') {
      const hd = J.handR, bd = J.bladeDir, Hn = Q.handR, mz = Sp(hd, bd[0] * 5, bd[1] * 5, bd[2] * 5), gp = Sp(hd, -bd[0] * .6, -bd[1] * .6, -bd[2] * .6 - 1.2);
      ops.push({ d: Hn[2] + .03, f: () => { px.line(g, Hn[0], Hn[1], gp[0], gp[1], C.metalDk, 2); px.line(g, gp[0], gp[1], mz[0], mz[1], C.metalDk, 2); px.line(g, Hn[0], Hn[1] - 1, mz[0], mz[1] - 1, C.metal); px.dot(g, mz[0], mz[1], '#ffffff'); } });
    } else if (o.weapon === 'staff') {
      const hd = J.handR, bd = J.bladeDir, Hn = Q.handR, top = Sp(hd, bd[0] * 10, bd[1] * 10, bd[2] * 10), bot = Sp(hd, -bd[0] * 7, -bd[1] * 7, -bd[2] * 7);
      ops.push({ d: (Hn[2] + top[2]) / 2, f: () => { px.line(g, bot[0], bot[1], top[0], top[1], C.staff || '#8a5a32', Math.max(1, Math.round(sc * .9))); px.glow(g, 1); px.disc(g, top[0], top[1], Math.max(1, sc * 1.4), C.orb || '#7fe3ff'); px.dot(g, top[0] - 1, top[1] - 1, '#ffffff'); } });
    }
    if (o.weapon === 'sword') {
      const hd = J.handR, bd = J.bladeDir, L = o.bladeLen, Hn = Q.handR, sl = Math.hypot(bd[0], bd[1]) || 1, sx = -bd[1] / sl * 1.6, sy = bd[0] / sl * 1.6;
      const tip = Sp(hd, bd[0] * L, bd[1] * L, bd[2] * L), b0 = Sp(hd, bd[0] * 1.4, bd[1] * 1.4, bd[2] * 1.4), pom = Sp(hd, -bd[0] * 1.2, -bd[1] * 1.2, -bd[2] * 1.2);
      const g0 = Sp(hd, bd[0] * 1.4 + sx, bd[1] * 1.4 + sy, bd[2] * 1.4), g1 = Sp(hd, bd[0] * 1.4 - sx, bd[1] * 1.4 - sy, bd[2] * 1.4);
      ops.push({
        d: (Hn[2] + tip[2]) / 2, f: () => {
          px.line(g, pom[0], pom[1], Hn[0], Hn[1], '#5a3620'); px.line(g, g0[0], g0[1], g1[0], g1[1], C.hilt);
          px.line(g, b0[0] + 1, b0[1], tip[0], tip[1], C.metalDk); px.line(g, b0[0], b0[1], tip[0], tip[1], C.metal); px.dot(g, tip[0], tip[1], '#ffffff');
        }
      });
    }
    this._drawAttachments(g, Q, sc, ops);
    ops.sort((a, b) => a.d - b.d);
    for (const op of ops) op.f();
  }
  _hat(g, Sp, J, r, H) {
    const h = this.o.hat, st = h.style || 'cap', c = h.color || '#d83a2a', R = this.o.headR, dk = shade(c, -.3);
    if (st === 'cap') {            // plumber / baseball cap with a brim facing forward
      const t = Sp(J.head, -.4, 0, R * .55), b = Sp(J.head, R * 1.05, 0, R * .25), b2 = Sp(J.head, R * 1.7, 0, R * .1);
      px.disc(g, t[0], t[1], r * .92, c); px.line(g, b[0], b[1], b2[0], b2[1], dk, 2);
    } else if (st === 'pointed') { // elf / wizard cap flopping backward (two triangles so it reads from the side and the front)
      const a = Sp(J.head, R * .2, -R * .95, R * .45), b = Sp(J.head, R * .2, R * .95, R * .45), f = Sp(J.head, R * .75, 0, R * .5), k = Sp(J.head, -R * .9, 0, R * .25), tip = Sp(J.head, -R * 2.3, 0, R * 1.6);
      px.poly(g, [f, k, tip], c); px.poly(g, [a, b, tip], c); px.line(g, a[0], a[1], b[0], b[1], dk); px.line(g, f[0], f[1], k[0], k[1], dk);
    } else if (st === 'helmet') {  // robot / knight helmet that leaves the face open
      const t = Sp(J.head, -.8, 0, .6), cr = Sp(J.head, 0, 0, R * 1.05);
      px.disc(g, t[0], t[1], r * 1.02, c); px.disc(g, cr[0], cr[1], Math.max(1, r * .28), shade(c, .35));
      const f = Sp(J.head, R * .75, 0, -.2); px.disc(g, f[0], f[1], r * .55, this.C.skin);
    } else if (st === 'band') {    // headband around the forehead with two tails
      const a = Sp(J.head, R * .6, -R * .9, R * .55), b = Sp(J.head, R * .6, R * .9, R * .55), f = Sp(J.head, R * .95, 0, R * .5), k = Sp(J.head, -R * .95, 0, R * .5), t2 = Sp(J.head, -R * 2.2, -.6, -.4), t3 = Sp(J.head, -R * 2, .6, -1.2);
      px.line(g, a[0], a[1], b[0], b[1], c, 2); px.line(g, f[0], f[1], k[0], k[1], c, 2); px.line(g, k[0], k[1], t2[0], t2[1], c); px.line(g, k[0], k[1], t3[0], t3[1], c);
    } else if (st === 'crown') {
      for (const k of [-1, 0, 1]) { const p = Sp(J.head, 0, k * R * .6, R * .9), q = Sp(J.head, 0, k * R * .6, R * 1.6); px.line(g, p[0], p[1], q[0], q[1], c, 2); }
      const a = Sp(J.head, 0, -R * .8, R * .85), b = Sp(J.head, 0, R * .8, R * .85); px.line(g, a[0], a[1], b[0], b[1], c, 2);
    }
    void H;
  }
  /** motion smear for the current swing, queued in front of the rig */
  drawSmear(r, colors = ['#ffffff', '#dff8ff', '#8fe0f2', '#4bb1d4']) {
    const T = this.trail;
    if (T.length >= 2) {   // ribbon along the real blade path: correct in side, top-down and every other view
      r.queue(this.x, this.y, this.z + 1, g => {
        const lv = this._lastView, cv = lv && lv.id === r.view.id ? lv : this.o.charView !== false ? charView(r.view) : r.view;   // the angle the rig was drawn from
        const W = cv === r.view ? (p, w) => r.w(w[0], w[1], w[2]) : (p, w) => { const s = r.w(p.o[0], p.o[1], p.o[2]), q = cv.p(w[0] - p.o[0], w[1] - p.o[1], w[2] - p.o[2]); return [s[0] + q[0], s[1] + q[1]]; };
        px.glow(g, .85);
        const n = T.length - 1, taper = (p, u) => V3.lerp(p.t, p.b, .25 + .75 * u);   // older samples are narrower
        for (let i = 0; i < n; i++) {
          const p0 = T[i], p1 = T[i + 1], f = 1 - p1.age / .14, u0 = i / n, u1 = (i + 1) / n;
          const pts = [W(p0, taper(p0, u0)), W(p0, p0.t), W(p1, p1.t), W(p1, taper(p1, u1))];
          px.polyDither(g, pts, colors[u1 > .85 ? 1 : u1 > .55 ? 2 : 3], (.35 + .65 * u1) * f, r.ix, r.iy);
        }
        // hot core: a bright line along the tip path, strongest at the newest end
        const last = T[n];
        if (last.w >= 1) {   // blades get a hot core line and a glint at the tip while the swing is fresh; fists and feet just the ribbon
          for (let i = Math.max(0, n - 5); i < n; i++) { const [ax, ay] = W(T[i], T[i].t), [bx, by] = W(T[i + 1], T[i + 1].t); px.line(g, ax, ay, bx, by, i >= n - 2 ? colors[0] : colors[1], i >= n - 1 ? 2 : 1); }
          if (last.age < .06) { const [tx, ty] = W(last, last.t); px.dot(g, tx, ty, '#ffffff'); }
        }
      }, { bias: .6, emissive: true });
      return;
    }
    const s = this.smear; if (!s || s.fade <= 0 || r.view.pitchDeg < 30) return;
    const x = this.x, y = this.y, z = this.z + s.z, span = s.a1 - s.a0;
    if (Math.abs(span) < .05) return;
    r.queue(x, y, this.z + 1, g => {
      px.glow(g, .85);
      const n = Math.max(4, Math.ceil(Math.abs(span) / .16));
      for (let i = 0; i < n; i++) {
        const u0 = i / n, u1 = (i + 1) / n, a0 = s.a0 + span * u0, a1 = s.a0 + span * u1;
        const rin0 = s.r1 - (s.r1 - s.r0) * (.2 + .8 * u0), rin1 = s.r1 - (s.r1 - s.r0) * (.2 + .8 * u1);
        const pts = [r.w(x + Math.cos(a0) * s.r1, y + Math.sin(a0) * s.r1, z), r.w(x + Math.cos(a1) * s.r1, y + Math.sin(a1) * s.r1, z), r.w(x + Math.cos(a1) * rin1, y + Math.sin(a1) * rin1, z), r.w(x + Math.cos(a0) * rin0, y + Math.sin(a0) * rin0, z)];
        const c = colors[u1 > .85 ? 0 : u1 > .6 ? 1 : u1 > .3 ? 2 : 3];
        px.polyDither(g, pts, c, (.25 + .75 * u1) * s.fade, r.ix, r.iy);
      }
    }, { bias: .6 });
  }
  /** skeleton overlay for debugging, draws straight into the buffer */
  debug(r) {
    const J = this.J, g = r.tgt, [ox, oy] = r.w(this.x, this.y, this.z);
    const P = p => { const w = this._w(p), s = r.view.p(w[0], w[1], w[2]); return [ox + s[0], oy + s[1]]; };
    const L = (a, b, c) => { const A = P(a), B = P(b); px.line(g, A[0], A[1], B[0], B[1], c); };
    L(J.hipL, J.kneeL, '#2aa6c0'); L(J.kneeL, J.footL, '#2aa6c0'); L(J.hipR, J.kneeR, '#46f0ff'); L(J.kneeR, J.footR, '#46f0ff');
    L(J.shL, J.elbowL, '#b04a98'); L(J.elbowL, J.handL, '#b04a98'); L(J.shR, J.elbowR, '#ff5ad1'); L(J.elbowR, J.handR, '#ff5ad1');
    L(J.hipL, J.hipR, '#ffe45a'); L(J.shL, J.shR, '#ffe45a'); L(J.hipC, J.shC, '#ffe45a'); L(J.shC, J.head, '#ffe45a');
    if (this.o.weapon) L(J.handR, V3.add(J.handR, V3.mul(J.bladeDir, this.o.bladeLen)), '#ffffff');
    for (const k of ['hipL', 'hipR', 'kneeL', 'kneeR', 'footL', 'footR', 'shL', 'shR', 'elbowL', 'elbowR', 'handL', 'handR', 'head']) { const p = P(J[k]); px.dot(g, p[0], p[1], '#ffffff'); }
    if (this.capeL) for (const n of [...this.capeL, ...this.capeR]) { const [x, y] = r.w(n.x, n.y, n.z); px.dot(g, x, y, '#ff8a2a'); }
  }
}
E.Humanoid = Humanoid;

/**
 * Attack: the wind-up / active / recover timer every melee game needs (swords, punches, kicks, claws).
 *   const slash = new E.Attack({ a0: 1.6, a1: -1.7, z0: 12, z1: 9, reach: 7.5, wind: .06, active: .1, recover: .18 });
 *   if (input.buffered('attack') && slash.start()) input.consume('attack');
 *   slash.update(dt);                                     // returns the phase that just began ('active' = play the swing sound)
 *   if (slash.active) slash.hits(enemies, e => E.inArc(hero, facing, e, 22, 1.4), e => { ...damage e once per swing... });
 *   rig.update(dt, { ..., attack: slash.state });        // null when idle
 * spec durations are in seconds; the rest of the spec is the Humanoid attack spec.
 */
class Attack {
  /** new E.Attack(spec) or new E.Attack('slash', { reach: 9 }): a name from E.MOVES plus overrides */
  constructor(spec = {}, over) {
    if (typeof spec === 'string') { const m = E.MOVES[spec]; if (!m) warn('move:' + spec, 'unknown move "' + spec + '". Moves: ' + Object.keys(E.MOVES).join(', ')); spec = Object.assign({ name: spec, hitAt: .35 }, m || E.MOVES.slash, over); }
    else if (over) spec = Object.assign({}, spec, over);
    this.spec = Object.assign({ wind: .06, active: .1, recover: .18 }, spec); this.phase = null; this.t = 0; this.hit = new Set();
  }
  /** begin a swing if idle (or when canCancel and already recovering). Returns true if it started */
  start(canCancel = false) {
    if (this.phase && !(canCancel && this.phase === 'recover')) return false;
    this.phase = 'wind'; this.t = 0; this.hit.clear(); return true;
  }
  get busy() { return !!this.phase; }
  get active() { return this.phase === 'active'; }
  /** 0..1 progress through the current phase */
  get u() { return this.phase ? clamp(this.t / this.spec[this.phase], 0, 1) : 0; }
  /** what Humanoid.update wants as `attack` (null when idle) */
  get state() { return this.phase ? { spec: this.spec, phase: this.phase, u: this.u } : null; }
  update(dt) {
    if (!this.phase) return null;
    this.t += dt; let began = null;
    while (this.phase && this.t >= this.spec[this.phase]) {
      this.t -= this.spec[this.phase];
      this.phase = this.phase === 'wind' ? 'active' : this.phase === 'active' ? 'recover' : null;
      if (this.phase) began = this.phase;
    }
    if (!this.phase) this.t = 0;
    return began;
  }
  /** during 'active', call fn(target) once per swing for each target where test(target) is true. Returns how many were hit */
  hits(targets, test, fn) {
    if (this.phase !== 'active' || this.u < (this.spec.hitAt || 0)) return 0;   // hitAt: share of the swing before it can connect
    let n = 0;
    for (const t of targets) { if (!t || t.dead || this.hit.has(t) || !test(t)) continue; this.hit.add(t); n++; fn(t); }
    return n;
  }
  cancel() { this.phase = null; this.t = 0; }
}
E.Attack = Attack;

/**
 * Combo: a chain of attacks (a 3-hit punch string, a sword combo). Press again during the recover of one
 * hit (or within `window` seconds after it ends) to flow into the next; otherwise it starts over.
 *   const combo = new E.Combo([jab, jab2, uppercut], { window: .3 });   // each item is an Attack spec
 *   if (input.buffered('attack') && combo.press()) input.consume('attack');
 *   combo.update(dt); combo.hits(enemies, test, e => {...}); rig.update(dt, { ..., attack: combo.state });
 *   combo.step = index of the current hit (0, 1, 2), combo.current = its Attack
 */
class Combo {
  constructor(specs, o = {}) { this.moves = specs.map(sp => sp instanceof Attack ? sp : new Attack(sp)); this.window = o.window === undefined ? .3 : o.window; this.step = -1; this.idle = 99; }   // items: specs, Attacks or move names
  get current() { return this.moves[Math.max(0, this.step)]; }
  get busy() { return this.step >= 0 && this.current.busy; }
  get active() { return this.busy && this.current.active; }
  get state() { return this.busy ? this.current.state : null; }
  /** start or continue the chain. Returns true if a hit started */
  press() {
    const cur = this.step >= 0 ? this.current : null;
    if (cur && cur.busy && cur.phase !== 'recover') return false;
    const next = (cur && (cur.busy || this.idle <= this.window) && this.step + 1 < this.moves.length) ? this.step + 1 : 0;
    if (cur && cur.busy) cur.cancel();
    this.step = next; this.idle = 0; return this.moves[next].start();
  }
  update(dt) { if (this.step < 0) return null; const r = this.current.update(dt); if (!this.current.busy) this.idle += dt; return r; }
  hits(targets, test, fn) { return this.step >= 0 ? this.current.hits(targets, test, fn) : 0; }
  cancel() { if (this.step >= 0) this.current.cancel(); this.step = -1; this.idle = 99; }
}
E.Combo = Combo;
/**
 * E.MOVES: a library of named attacks with timing and body motion (anticipation, lunge, step, twist, hop).
 *   new E.Attack('overhead'), new E.Attack('thrust', { reach: 10 }), new E.Combo(['jab', 'cross', 'hook', 'uppercut'])
 *   rig.update(dt, { ..., attack: E.move('roundhouse', .5) })   // any move at any moment, for previews and cutscenes
 * The same move works on every build and in every view: heights are relative to the shoulders (rel: true), reaches scale
 * with arm length, and horizontal swings turn into screen-plane swings in side views. Spec fields: a0 / a1 angles (+ = the
 * right side, or up in the screen plane), z0 / z1 heights, reach or r0 / r1 (an extending thrust), hand: 'R' | 'L' | 'both',
 * plane: 'side' (always vertical), kick, spin, lunge, hop, crouch, lean, twist, hold, blade: 0 (no trail), wind / active / recover.
 */
E.MOVES = {
  // blades, staves and clubs (the right hand)
  slash:      { rel: true, a0: 1.7, a1: -1.7, z0: -6, z1: -9, reach: 7.5, wind: .08, active: .1, recover: .22 },
  backslash:  { rel: true, a0: -1.5, a1: 1.6, z0: -8, z1: -5, reach: 7.5, wind: .07, active: .1, recover: .2, lunge: .8 },
  overhead:   { rel: true, plane: 'side', a0: 2.4, a1: -1.25, reach: 7, wind: .16, active: .09, recover: .26, lunge: 2, crouch: .35, lean: .4 },
  rising:     { rel: true, plane: 'side', a0: -1.35, a1: 2.1, reach: 7, wind: .09, active: .11, recover: .24, hop: 3.5, lunge: .8, crouch: .4 },
  thrust:     { rel: true, a0: .12, a1: 0, z0: -5, z1: -4, r0: 3, r1: 10, wind: .11, active: .07, recover: .22, lunge: 3, lean: .5 },
  spin:       { rel: true, a0: 1.3, a1: 1.3, spin: true, z0: -6, z1: -6, reach: 8, wind: .09, active: .3, recover: .18, lunge: 0, lean: .1 },
  plunge:     { rel: true, plane: 'side', a0: -1.45, a1: -1.5, r0: 5, r1: 9, wind: .06, active: .25, recover: .15, lunge: 0, lean: .1 },
  twohand:    { rel: true, hand: 'both', plane: 'side', a0: 2.5, a1: -1.4, reach: 6.5, wind: .2, active: .1, recover: .3, lunge: 2.4, crouch: .5, lean: .5 },
  // fists (jab leads with the left)
  jab:        { rel: true, hand: 'L', a0: .05, a1: 0, z0: -1, z1: -.5, r0: 3, r1: 8.6, wind: .035, active: .06, recover: .13, lunge: .9, lean: .22, blade: 0 },
  cross:      { rel: true, a0: .25, a1: 0, z0: -1, z1: -.5, r0: 2.5, r1: 8.8, wind: .06, active: .07, recover: .17, lunge: 1.8, lean: .38, twist: 1.8, blade: 0 },
  hook:       { rel: true, a0: 1.45, a1: -.4, z0: -.5, z1: 0, reach: 6.8, wind: .08, active: .09, recover: .2, lunge: 1.3, lean: .3, twist: 1.5, blade: 0 },
  uppercut:   { rel: true, plane: 'side', a0: -1.15, a1: .95, reach: 7.2, wind: .11, active: .09, recover: .26, crouch: .6, hop: 2.5, lunge: 1.2, lean: .2, blade: 0 },
  haymaker:   { rel: true, a0: 2.1, a1: -.5, z0: 1, z1: -1, reach: 7.8, wind: .22, active: .1, recover: .3, lunge: 2.6, lean: .5, twist: 1.6, blade: 0 },
  elbow:      { rel: true, a0: .9, a1: -.3, z0: -.5, z1: 0, reach: 3.5, wind: .05, active: .07, recover: .16, lunge: 1, twist: 1.4, blade: 0 },
  // kicks (the right foot; heights are shares of hip height)
  kick:       { rel: true, kick: true, a0: .1, a1: 0, z0: .35, z1: .8, reach: 6.5, wind: .07, active: .09, recover: .2 },
  roundhouse: { rel: true, kick: true, a0: 1.7, a1: -.45, z0: 1, z1: 1.55, reach: 7, wind: .1, active: .13, recover: .24, twist: 1.3, lean: -.3 },
  sweep:      { rel: true, kick: true, a0: 1.9, a1: -1.7, z0: .08, z1: .08, reach: 7.5, wind: .08, active: .16, recover: .24, crouch: .9, lean: .3 },
  flyingkick: { rel: true, kick: true, a0: .1, a1: 0, z0: .5, z1: .75, reach: 7.5, wind: .1, active: .22, recover: .24, hop: 7, lunge: 3.5, lean: -.35 },
  knee:       { rel: true, kick: true, a0: 0, a1: 0, z0: .45, z1: .85, reach: 2, wind: .06, active: .08, recover: .18, lean: .2, lunge: 1 },
  axekick:    { rel: true, kick: true, a0: .2, a1: 0, z0: 2, z1: .5, reach: 4.8, wind: .14, active: .08, recover: .24, lean: -.2 },
  // magic, throws and shoves
  cast:       { rel: true, hand: 'both', plane: 'side', a0: 1.4, a1: .1, reach: 8, wind: .22, active: .12, recover: .32, lunge: .6, lean: .15, blade: 0 },
  throw:      { rel: true, plane: 'side', a0: 2.5, a1: -.25, reach: 7.5, wind: .16, active: .08, recover: .24, lunge: 1.8, lean: .45, blade: 0 },
  bash:       { rel: true, hand: 'both', plane: 'side', a0: 1, a1: -.35, reach: 5, wind: .12, active: .07, recover: .24, lunge: 3, hop: 1.2, crouch: .45, lean: .55, blade: 0 },   // a short, heavy shove (pommel, shield or shoulder)
  claw:       { rel: true, a0: 1.2, a1: -1, z0: 1, z1: -4, reach: 7, wind: .12, active: .08, recover: .24, lunge: 1.8, lean: .4, blade: 0 }
};
/** the attack state of any move at a moment, for previews: rig.update(dt, { attack: E.move('uppercut', .4, 'active') }) */
const _moveSpecs = {};
E.move = (name, u = .5, phase = 'active') => ({ spec: _moveSpecs[name] || (_moveSpecs[name] = Object.assign({ name, wind: .06, active: .1, recover: .18 }, E.MOVES[name] || E.MOVES.slash)), phase, u });
/** push a target away from a point (attacker): uses target.push (E.Body) or its vx / vy. up = upward speed (knock into the air) */
E.knockback = (from, target, speed = 160, up = 0) => {
  const dx = target.x - from.x, dy = (target.y || 0) - (from.y || 0), d = Math.hypot(dx, dy) || 1, ix = dx / d * speed, iy = dy / d * speed;
  if (typeof target.push === 'function') target.push(ix, iy, up);
  else { target.vx = (target.vx || 0) + ix; target.vy = (target.vy || 0) + iy; if (up) target.vz = (target.vz || 0) + up; }
  return target;
};

/* =============================================================================
 * 12. BLOB RIG  (slimes, jellies) squash-and-stretch sphere that looks at a target
 * ============================================================================= */
class Blob {
  constructor(o = {}) {
    this.o = Object.assign({ R: 6.5 }, o);
    this.C = Object.assign({ dk: '#6d2658', base: '#c95f9a', lt: '#f5a3cc', spec: '#fff2f8', eye: '#ffffff', pupil: '#2a0f24' }, o.colors || {});
    this.sq = 0; this.sqV = 0; this.target = 0; this.look = [1, 0]; this.t = 0; this.squint = false; this.scale = 1;
  }
  kick(v) { this.sqV += v; }
  /** s: {squash target -0.4..0.4, look:[dx,dy] ground dir, squint} */
  update(dt, s = {}) {
    this.t += dt;
    const target = s.squash || 0;
    this.sqV += (-(this.sq - target) * 320 - 14 * this.sqV) * dt; this.sq = clamp(this.sq + this.sqV * dt, -.45, .45);
    if (s.look) { const l = Math.hypot(s.look[0], s.look[1]); if (l > .01) { this.look[0] = lerp(this.look[0], s.look[0] / l, Math.min(1, dt * 8)); this.look[1] = lerp(this.look[1], s.look[1] / l, Math.min(1, dt * 8)); } }
    this.squint = !!s.squint; this.walk = s.walk || 0;
    this.flap = approach(this.flap === undefined ? 1 : this.flap, s.flap === undefined ? 1 : s.flap, dt * 6); this.flapP = (this.flapP || 0) + dt * 14 * this.flap; this.hang = !!s.hang;   // wings: flap speed 0..1 (0 folds them); hang: roost upside down
  }
  /**
   * draw(g, ox, oy, view). Creature features from the constructor options:
   *   ears: 'rabbit' | 'cat', horns: true, wings: true (flapping bat wings), feet: true, tail: true,
   *   mouth: true | 'fangs', face: 'front' (eyes always on the camera side, for Mana-style monsters)
   * update(dt, { flap: 0..1, hang: true }) slows or folds the wings and hangs a bat upside down from its anchor.
   */
  draw(g, ox, oy, view) {
    if (!this.hang) return this._drawBody(g, ox, oy, view);
    const pv = Math.round(oy - this.o.R * this.scale * view.scale);   // flip around the body's middle
    g.save(); g.translate(0, pv * 2); g.scale(1, -1);
    try { this._drawBody(g, ox, oy, view); } finally { g.restore(); }
  }
  _drawBody(g, ox, oy, view) {
    if (this.o.charView !== false) view = charView(view);
    const o = this.o, R = o.R * this.scale, a = 1 - this.sq * .55, b = 1 + this.sq, C = this.C, sc = view.scale, t = this.t;
    const sp = Math.sin(view.pitch), cp = Math.cos(view.pitch) * view.zBoost;
    const rx = R * a * sc, ry = R * sc * Math.sqrt((a * sp) ** 2 + (b * cp) ** 2);
    const [cx0, cy0] = view.p(0, 0, R * b);
    const cx = ox + cx0, cy = oy + cy0, tb = tones(C.base), ext = C.ext || C.dk;
    // behind the body: wings, ears, tail
    if (o.wings) {
      const fold = Math.min(1, (this.flap === undefined ? 1 : this.flap) * 2), f = Math.sin(this.flapP === undefined ? t * 14 : this.flapP) * .5 + .5, wt = tones(C.wing || C.dk);
      for (const sd of [-1, 1]) {
        const x0 = cx + sd * rx * .6, y0 = cy - ry * .2, span = rx * (.7 + (.9 + f * .5) * fold), up = ry * ((1.2 - f * 1.3) * fold - .3 * (1 - fold));
        const pts = [[x0, y0], [x0 + sd * span * .55, y0 - up], [x0 + sd * span, y0 - up * .6 + ry * .2], [x0 + sd * span * .8, y0 + ry * .35], [x0 + sd * span * .5, y0 + ry * .15], [x0 + sd * span * .3, y0 + ry * .4]];
        px.poly(g, pts, wt.sh); px.line(g, x0, y0, x0 + sd * span * .55, y0 - up, wt.lt);
      }
    }
    if (o.ears === 'rabbit') for (const sd of [-1, 1]) {
      const ex = cx + sd * rx * .42, ey = cy - ry * .7, h = R * sc * (1.25 + .1 * Math.sin(t * 3 + sd)), w = Math.max(1.2, rx * .22);
      px.ell(g, ex + sd * h * .15, ey - h * .5, w + .8, h * .55, C.dk); px.ell(g, ex + sd * h * .15, ey - h * .5, w, h * .5 - .6, C.base); px.ell(g, ex + sd * h * .15, ey - h * .45, Math.max(.6, w * .45), h * .32, C.inner || '#f5a3b8');
    } else if (o.ears === 'cat') for (const sd of [-1, 1]) {
      const ex = cx + sd * rx * .55, ey = cy - ry * .55;
      px.poly(g, [[ex - rx * .3, ey + 1], [ex + sd * rx * .15, ey - ry * .75], [ex + rx * .3, ey + 1]], C.dk); px.poly(g, [[ex - rx * .15, ey], [ex + sd * rx * .1, ey - ry * .5], [ex + rx * .15, ey]], C.inner || '#f5a3b8');
    }
    if (o.tail) { const w = Math.sin(t * 5) * rx * .3; px.line(g, cx - rx * .8, cy + ry * .3, cx - rx * 1.35, cy - ry * .2 + w, C.dk, Math.max(1, Math.round(sc))); px.disc(g, cx - rx * 1.38, cy - ry * .25 + w, Math.max(1, rx * .16), C.base); }
    // body with shading
    px.ell(g, cx, cy, rx, ry, C.dk);
    px.ell(g, cx + .5, cy - .8, Math.max(1, rx - 1.2), Math.max(1, ry - 1.3), C.base);
    px.ell(g, cx - rx * .15, cy + ry * .35, Math.max(1, rx * .7), Math.max(.6, ry * .3), tb.sh);
    px.ell(g, cx + rx * .3, cy - ry * .42, Math.max(1, rx * .38), Math.max(.6, ry * .28), C.lt);
    px.rect(g, cx + rx * .45, cy - ry * .6, 2, 1, C.spec);
    if (o.feet) for (const sd of [-1, 1]) { const st = Math.sin(t * 9 + sd) * (this.walk || 0); px.ell(g, cx + sd * rx * .45 + st, cy + ry * .9, Math.max(1.2, rx * .28), Math.max(.8, ry * .16), ext); }
    if (o.horns) for (const sd of [-1, 1]) { const hx = cx + sd * rx * .45, hy = cy - ry * .72; px.poly(g, [[hx - sd * rx * .15, hy + 1], [hx + sd * rx * .3, hy - ry * .7], [hx + sd * rx * .2, hy + 1]], C.horn || '#e8dcc0'); px.dot(g, hx + sd * rx * .26, hy - ry * .6, '#ffffff'); }
    // face
    const la = Math.atan2(this.look[1], this.look[0]), dc = view.depth(0, 0, R * b), front = o.face === 'front';
    const [lx, ly] = view.p(this.look[0], this.look[1], 0), lxs = clamp(lx, -1, 1);
    let shown = 0, eyeY = cy;
    for (const s of [-1, 1]) {
      let X, Y;
      if (front) { X = Math.round(cx + lxs * rx * .25 + s * rx * .36); Y = Math.round(cy - ry * .12); }
      else {
        const ea = la + s * .42, e = [Math.cos(ea) * R * a * .82, Math.sin(ea) * R * a * .82, R * b * 1.25];
        if (view.depth(e[0], e[1], e[2]) < dc && !view.isTop && view.pitchDeg < 70) continue;
        const [ex, ey] = view.p(e[0], e[1], e[2]); X = Math.round(clamp(ox + ex, cx - rx + 2, cx + rx - 3)); Y = Math.round(clamp(oy + ey, cy - ry + 2, cy + ry - 3));
      }
      shown++; eyeY = Y;
      if (this.squint) { px.rect(g, X - 1, Y, 2, 1, C.pupil); continue; }
      const big = rx > 7;
      px.rect(g, X - 1, Y - 1, big ? 3 : 2, big ? 4 : 3, C.eye);
      px.rect(g, X + (lx >= 0 ? (big ? 1 : 0) : -1 + (big ? 1 : 0)), Y + (ly > .4 ? 1 : 0), big ? 2 : 1, 2, C.pupil);
    }
    if (o.mouth && shown) {
      const mx = Math.round(cx + (front ? lxs * rx * .25 : 0)), my = eyeY + Math.max(3, Math.round(ry * .35));
      px.rect(g, mx - 1, my, 3, 1, C.pupil);
      if (o.mouth === 'fangs') { px.dot(g, mx - 1, my + 1, '#ffffff'); px.dot(g, mx + 1, my + 1, '#ffffff'); }
    }
  }
}
E.Blob = Blob;

/* =============================================================================
 * 13. TILE MAP  floor texture baked per view, walls as extruded boxes, collision
 *    cells: array of type ids (0 = floor). types: { id: { h, top, side, line, cut, cutH } }
 *    floorTex(x, y) -> [r, g, b] or null  (called per pixel when a view is first used)
 * ============================================================================= */
/**
 * Parse an ASCII level (top row first; every character is one tile). legend maps a character to
 *   a number  -> tile / wall type id (0 = empty)
 *   a string  -> a spawn tag; the cell stays empty and spawns[] gets { tag, ch, cx, cy }
 *   an object -> any of { tile: id, floor: 'water', spawn: 'hero', block: true }  (block: nobody can walk on this cell)
 * '.' and ' ' are empty unless the legend says otherwise. Unknown characters warn once and become empty.
 */
function parseLevel(rows, legend = {}) {
  if (typeof rows === 'string') rows = rows.replace(/^\n+|\n+$/g, '').split('\n');
  if (!Array.isArray(rows) || !rows.length) throw new Error('level rows must be a non-empty array of strings');
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  if (rows.some(r => r.length !== w)) warn('rows:' + w, 'level rows have different lengths; short rows are padded with empty cells (widest row = ' + w + ')');
  const cells = new Array(w * h).fill(0), floor = new Array(w * h).fill(null), block = new Uint8Array(w * h), spawns = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x] === undefined ? ' ' : rows[y][x], v = legend[ch], i = y * w + x;
    if (v === undefined || v === null) { if (ch !== '.' && ch !== ' ') warn('legend:' + ch, 'level character "' + ch + '" is not in the legend (treated as empty)'); continue; }
    if (typeof v === 'number') cells[i] = v;
    else if (typeof v === 'string') spawns.push({ tag: v, ch, cx: x, cy: y });
    else { if (v.tile) cells[i] = v.tile; if (v.floor) floor[i] = v.floor; if (v.block) block[i] = 1; if (v.spawn) spawns.push({ tag: v.spawn, ch, cx: x, cy: y }); }
  }
  return { w, h, cells, floor, block, spawns };
}
E.parseLevel = parseLevel;
const DEFAULT_WALL = { h: 32, top: '#6a6280', side: '#4a4360' };
class TileMap {
  /**
   * Walls standing on a floor (top-down, isometric, brawler). Either
   *   { rows: [...ASCII...], legend: { '#': 1, '@': 'hero' }, types, floorTex }   (recommended)
   * or { w, h, cells: [ids...], types, floorTex }.
   * types[id] = { h, top, side, line, course, cut, cutH, face, roof }. floorTex(x, y, floorTag, view) -> [r, g, b] or [r, g, b, glow]
   *   face: wall pattern 'brick' (default) | 'stone' | 'rock' | 'plank' | 'timber' | 'plaster' | 'hedge' | 'none'
   *   roof: top pattern 'speckle' (default) | 'plain' | 'tiles' (roof shingles) | 'slab' (paving) | 'leaves' | 'grass'
   * block: ['water', 'lava'] floor tags nobody can walk on (or put block: true in a legend entry).
   */
  constructor(o = {}) {
    this.T = o.tile || 16;
    const L = o.rows ? parseLevel(o.rows, o.legend) : o.level || null;
    if (L) o = Object.assign({}, o, { w: L.w, h: L.h, cells: L.cells });
    if (!o.w || !o.h || !o.cells) throw new Error('TileMap needs { rows, legend } or { w, h, cells }');
    if (o.cells.length !== o.w * o.h) throw new Error('TileMap: cells has ' + o.cells.length + ' entries but w * h = ' + (o.w * o.h));
    this.w = o.w; this.h = o.h; this.cells = o.cells; this.types = Object.assign({}, o.types || {});
    this.floorTags = L ? L.floor : null;
    /** cells nobody can walk on (deep water, lava, pits): legend { floor: 'water', block: true } or TileMap { block: ['water'] } */
    this.blocked = L ? L.block : new Uint8Array(this.w * this.h);
    if (o.block && this.floorTags) { const tags = [].concat(o.block); this.floorTags.forEach((f, i) => { if (f && tags.includes(f)) this.blocked[i] = 1; }); }
    /** spawn points from the ASCII rows: { tag, ch, cx, cy, x, y, z } (x, y = cell center) */
    this.spawns = L ? L.spawns.map(sp => Object.assign(sp, { x: (sp.cx + .5) * this.T, y: (sp.cy + .5) * this.T, z: 0 })) : [];
    for (const id of new Set(this.cells)) if (id > 0 && !this.types[id]) { warn('walltype:' + id, 'TileMap: wall type ' + id + ' is used in the map but missing from types (using a plain grey wall)'); this.types[id] = DEFAULT_WALL; }
    this.floorTex = o.floorTex || (() => [60, 56, 72]); this.cutaway = o.cutaway !== false; this.floors = {};
    /** contact shadow width (world units) along the foot of walls; 0 turns it off */
    this.ao = o.ao === undefined ? 5 : o.ao;
    /** animated sparkle on floor cells tagged 'water' or 'lava' */
    this.shimmer = o.shimmer !== false;
    this.light = V3.norm([-.6, -.8, 0]); this.version = 0;
  }
  /** first spawn with this tag ({ x, y, z, cx, cy }), or null */
  find(tag) { return this.spawns.find(s => s.tag === tag) || null; }
  findAll(tag) { return this.spawns.filter(s => s.tag === tag); }
  cell(cx, cy) { return cx < 0 || cy < 0 || cx >= this.w || cy >= this.h ? -1 : this.cells[cy * this.w + cx]; }
  set(cx, cy, v) { if (cx >= 0 && cy >= 0 && cx < this.w && cy < this.h) { if (v > 0 && !this.types[v]) this.types[v] = DEFAULT_WALL; this.cells[cy * this.w + cx] = v; this.floors = {}; this.version++; } }
  /** world point -> [cx, cy] cell; cell -> world center */
  toCell(x, y) { return [Math.floor(x / this.T), Math.floor(y / this.T)]; }
  center(cx, cy) { return [(cx + .5) * this.T, (cy + .5) * this.T]; }
  solidCell(cx, cy) { const c = this.cell(cx, cy); return c !== 0; }
  /** true where a body can walk: no wall and not a blocked floor (water, lava). Pathfinding uses this. */
  walkable(cx, cy) { return this.cell(cx, cy) === 0 && !this.blocked[cy * this.w + cx]; }
  /** mark a cell blocked or free at runtime (a bridge appears, lava cools) */
  block(cx, cy, on = true) { if (cx >= 0 && cy >= 0 && cx < this.w && cy < this.h) this.blocked[cy * this.w + cx] = on ? 1 : 0; }
  solidAt(x, y) { return this.solidCell(Math.floor(x / this.T), Math.floor(y / this.T)); }
  height(cx, cy) { const c = this.cell(cx, cy); return c > 0 ? this.types[c].h : c < 0 ? 1e9 : 0; }
  /** wall height at a world point (0 on the floor) */
  heightAt(x, y) { return this.height(Math.floor(x / this.T), Math.floor(y / this.T)); }
  /** floor tag from the legend ({ floor: 'water' }) at a world point, or null */
  floorAt(x, y) { if (!this.floorTags) return null; const cx = Math.floor(x / this.T), cy = Math.floor(y / this.T); return cx < 0 || cy < 0 || cx >= this.w || cy >= this.h ? null : this.floorTags[cy * this.w + cx]; }
  /** highest surface under a circle footprint that a body at height z can stand on (floor = 0) */
  groundAt(x, y, r = 0, z = 1e9, step = 2) {
    const T = this.T, rr = r * .6; let g = 0;
    for (let cy = Math.floor((y - rr) / T); cy <= Math.floor((y + rr) / T); cy++) for (let cx = Math.floor((x - rr) / T); cx <= Math.floor((x + rr) / T); cx++) {
      const c = this.cell(cx, cy); if (c <= 0) continue; const h = this.types[c].h; if (h <= z + step && h > g) g = h;
    }
    return g;
  }
  /** push a circle { x, y, r } out of walls. If the body has a number z, walls lower than z + step (default 2) do not block it
   *  (it is standing or jumping above them). Returns true when it touched a wall. */
  collide(b) {
    const T = this.T, zA = typeof b.z === 'number', step = b.step === undefined ? 2 : b.step;
    let hit = false;
    for (let it = 0; it < 2; it++) {
      const c0 = Math.floor((b.x - b.r) / T), c1 = Math.floor((b.x + b.r) / T), r0 = Math.floor((b.y - b.r) / T), r1 = Math.floor((b.y + b.r) / T);
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
        const c = this.cell(cx, cy);
        if (c === 0) { if (!this.blocked[cy * this.w + cx] || (zA && b.z > step)) continue; }   // blocked floor: stops walkers, not jumpers
        else if (zA && c > 0 && this.types[c].h <= b.z + step) continue;
        const nx = clamp(b.x, cx * T, cx * T + T), ny = clamp(b.y, cy * T, cy * T + T);
        let dx = b.x - nx, dy = b.y - ny, d = Math.hypot(dx, dy);
        if (d >= b.r) continue;
        hit = true;
        if (d < 1e-4) {   // center inside the cell: leave toward the nearest open neighbour, or search for open ground
          const open = (x, y) => { const n = this.cell(x, y); return n === 0 ? !this.blocked[y * this.w + x] : zA && n > 0 && this.types[n].h <= b.z + step; };
          const opts = [[b.x - cx * T, -1, 0], [cx * T + T - b.x, 1, 0], [b.y - cy * T, 0, -1], [cy * T + T - b.y, 0, 1]].filter(o2 => open(cx + o2[1], cy + o2[2])).sort((p, q) => p[0] - q[0]);
          if (opts.length) { const [, ox, oy] = opts[0]; if (ox) b.x = ox < 0 ? cx * T - b.r : cx * T + T + b.r; else b.y = oy < 0 ? cy * T - b.r : cy * T + T + b.r; }
          else this._escape(b, zA, step);
          continue;
        }
        b.x = nx + dx / d * b.r; b.y = ny + dy / d * b.r;
      }
    }
    return hit;
  }
  /** move a body buried in walls or blocked floor to the nearest open cell (within 8 cells) */
  _escape(b, zA, step) {
    const T = this.T, cx = Math.floor(b.x / T), cy = Math.floor(b.y / T); let best = null, bd = 1e9;
    for (let y = cy - 8; y <= cy + 8; y++) for (let x = cx - 8; x <= cx + 8; x++) {
      const n = this.cell(x, y); if (n < 0 || (n === 0 && this.blocked[y * this.w + x]) || (n > 0 && !(zA && this.types[n].h <= b.z + step))) continue;
      const px2 = clamp(b.x, x * T + b.r, x * T + T - b.r), py2 = clamp(b.y, y * T + b.r, y * T + T - b.r), dd = Math.hypot(px2 - b.x, py2 - b.y);
      if (dd < bd) { bd = dd; best = [px2, py2]; }
    }
    if (best) { b.x = best[0]; b.y = best[1]; }
  }
  /** renderer hook: something standing on a wall block sorts after that block */
  _liftOrder(view, x, y, z, k) {
    const T = this.T, cx = Math.floor(x / T), cy = Math.floor(y / T), c = this.cell(cx, cy), t = c > 0 ? this.types[c] : null;
    if (!t || z < t.h - 1) return k;
    return Math.max(k, view.order((cx + .5) * T, (cy + .5) * T, 0) + .002 + z * 1e-5);
  }
  /** line of sight across the ground (true if nothing solid in between) */
  los(x0, y0, x1, y1) { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4); for (let i = 1; i < n; i++) if (this.solidAt(lerp(x0, x1, i / n), lerp(y0, y1, i / n))) return false; return true; }
  /** projected pixel bounds of the whole map for this view (camera clamping) */
  bounds(view) {
    const W = this.w * this.T, H = this.h * this.T; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y, z] of [[0, 0, 0], [W, 0, 0], [0, H, 0], [W, H, 0], [0, 0, 48], [W, 0, 48], [0, H, 48], [W, H, 48]]) { const s = view.p(x, y, z); x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[0]); y0 = Math.min(y0, s[1]); y1 = Math.max(y1, s[1]); }
    return { x0: x0 - 8, y0: y0 - 8, x1: x1 + 8, y1: y1 + 8 };
  }
  _floor(view) {
    const key = view.id + ':' + view.yawDeg + ':' + view.pitchDeg + ':' + view.scale;
    if (this.floors[key]) return this.floors[key];
    if (Object.keys(this.floors).length > 6) this.floors = {};
    const T = this.T, W = this.w * T, H = this.h * T;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) { const s = view.p(x, y, 0); x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[0]); y0 = Math.min(y0, s[1]); y1 = Math.max(y1, s[1]); }
    x0 = Math.floor(x0); y0 = Math.floor(y0);
    let cw = Math.ceil(x1) - x0 + 1, ch = Math.ceil(y1) - y0 + 1;
    if (!view.inv) ch = 24;
    const cv = mkCanvas(cw, ch), g = cv.getContext('2d'), img = g.createImageData(cw, ch), d = img.data;
    const icv = view.inv ? mkCanvas(cw, ch) : null, ig = icv && icv.getContext('2d'), iimg = ig && ig.createImageData(cw, ch), id = iimg && iimg.data;
    for (let py = 0; py < ch; py++) for (let pxx = 0; pxx < cw; pxx++) {
      let gx, gy;
      if (view.inv) { const q = view.toGround(pxx + x0 + .5, py + y0 + .5); gx = q[0]; gy = q[1]; }
      else { gx = (pxx + x0 + .5) / view.ax; gy = H * .5 + py * 2; }
      if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
      if (view.inv && this.cell(Math.floor(gx / T), Math.floor(gy / T)) !== 0) continue;
      let c = this.floorTex(gx, gy, this.floorTags ? this.floorTags[Math.floor(gy / T) * this.w + Math.floor(gx / T)] : null, view); if (!c) continue;
      if (this.ao) {   // soft contact shadow where the floor meets a wall
        const fcx = Math.floor(gx / T), fcy = Math.floor(gy / T), lx = gx - fcx * T, ly = gy - fcy * T, R = this.ao;
        let ao = 0;
        const wall = (dx, dy) => this.cell(fcx + dx, fcy + dy) !== 0;
        if (wall(-1, 0)) ao = Math.max(ao, 1 - lx / R); if (wall(1, 0)) ao = Math.max(ao, 1 - (T - lx) / R);
        if (wall(0, -1)) ao = Math.max(ao, 1 - ly / R); if (wall(0, 1)) ao = Math.max(ao, 1 - (T - ly) / R);
        if (wall(-1, -1)) ao = Math.max(ao, 1 - Math.hypot(lx, ly) / R); if (wall(1, -1)) ao = Math.max(ao, 1 - Math.hypot(T - lx, ly) / R);
        if (wall(-1, 1)) ao = Math.max(ao, 1 - Math.hypot(lx, T - ly) / R); if (wall(1, 1)) ao = Math.max(ao, 1 - Math.hypot(T - lx, T - ly) / R);
        if (ao > 0) { const k = 1 - .4 * Math.round(ao * 5) / 5; c = [c[0] * k, c[1] * k * .98, c[2] * k * 1.02, c[3]]; }
      }
      if (!view.inv) c = c.map(v => v * (py < 2 ? 1.1 : .55 - py * .01));
      const k = (py * cw + pxx) * 4; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
      if (id) { id[k] = 0; id[k + 1] = 40; id[k + 2] = Math.round(clamp(c[3] || 0, 0, 1) * 255); id[k + 3] = 255; }
    }
    g.putImageData(img, 0, 0);
    if (ig) ig.putImageData(iimg, 0, 0);
    return (this.floors[key] = { cv, info: icv, x0, y0 });
  }
  drawFloor(r) {
    r._map = this; const f = this._floor(r.view); r.ctx.drawImage(f.cv, f.x0 - r.ix, f.y0 - r.iy); if (r.gpu && f.info) r.iG.drawImage(f.info, f.x0 - r.ix, f.y0 - r.iy);
    if (this.shimmer && this.floorTags && r.view.inv) {
      const T = this.T, t = r.game.real, g = r.ctx;
      for (let cy = 0; cy < this.h; cy++) for (let cx = 0; cx < this.w; cx++) {
        const tag = this.floorTags[cy * this.w + cx]; if (tag !== 'water' && tag !== 'lava') continue;
        for (let k = 0; k < 2; k++) {
          const ph = hash2(cx * 7 + k, cy * 13), u = ((t * (tag === 'lava' ? .12 : .25) + ph) % 1), wx = cx * T + u * T, wy = cy * T + ((ph * 7.3 + k * .5) % 1) * T, [sx, sy] = r.w(wx, wy, 0);
          if (sx < -4 || sx > r.bw + 4 || sy < -4 || sy > r.bh + 4) continue;
          const a = Math.sin(u * Math.PI); if (a < .35) continue;
          px.rect(g, sx, sy, a > .8 ? 3 : 2, 1, tag === 'lava' ? '#ffd070' : '#dff4ff');
        }
      }
    }
  }
  _isFront(cx, cy, view) {
    if (!this.cutaway || view.isTop || view.pitchDeg > 75) return false;
    const t = this.types[this.cell(cx, cy)]; if (!t || !t.cut) return false;
    const bx = -Math.round(view.fx), by = -Math.round(view.fy);
    const behindFloor = (bx && this.cell(cx + bx, cy) === 0) || (by && this.cell(cx, cy + by) === 0);
    return !!behindFloor;
  }
  /** queue every visible wall box. Call once per frame after drawFloor. */
  queueWalls(r) {
    const view = r.view, T = this.T; r._map = this;
    for (let cy = 0; cy < this.h; cy++) for (let cx = 0; cx < this.w; cx++) {
      const id = this.cell(cx, cy); if (id <= 0) continue;
      const t = this.types[id], h = this._isFront(cx, cy, view) ? (t.cutH || 6) : t.h;
      const [sx, sy] = r.w(cx * T + T / 2, cy * T + T / 2, 0);
      if (sx < -40 || sx > r.W + 40 || sy < -20 || sy > r.H + 90) continue;
      r.queue(cx * T + T / 2, cy * T + T / 2, 0, g => this._boxCached(g, r, cx, cy, t, h), { occluder: true });
    }
  }
  /** each wall block is baked once per view into a small image (pixel-identical: camera offsets are whole pixels) */
  _boxCached(g, r, cx, cy, t, h) {
    const view = r.view, key = view.id + ':' + view.yawDeg + ':' + view.pitchDeg + ':' + view.scale + ':' + this.version;
    if (!this._wc || this._wc.key !== key) this._wc = { key, m: new Map() };
    const idx = cy * this.w + cx; let e = this._wc.m.get(idx);
    if (!e || e.h !== h) {
      const T = this.T; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const z of [0, h]) for (const [x, y] of [[cx * T, cy * T], [cx * T + T, cy * T], [cx * T, cy * T + T], [cx * T + T, cy * T + T]]) { const q = view.p(x, y, z); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
      e = { h, x0: Math.floor(x0) - 2, y0: Math.floor(y0) - 2, w: Math.ceil(x1) - Math.floor(x0) + 5, hh: Math.ceil(y1) - Math.floor(y0) + 5, cv: null, info: null };
      this._wc.m.set(idx, e);
    }
    const bake = info => {
      const c = mkCanvas(e.w, e.hh), cg = info ? c.getContext('2d') : ctx2d(c);
      if (info) { cg._info = true; cg._r = r; cg._mat = '#000'; }
      const sx = r.ix, sy = r.iy; r.ix = e.x0; r.iy = e.y0;
      try { this._box(cg, r, cx, cy, t, h); } finally { r.ix = sx; r.iy = sy; }
      return c;
    };
    if (g._info) { if (!e.info) e.info = bake(true); g.drawImage(e.info, e.x0 - r.ix, e.y0 - r.iy); }
    else { if (!e.cv) e.cv = bake(false); g.drawImage(e.cv, e.x0 - r.ix, e.y0 - r.iy); }
  }
  _box(g, r, cx, cy, t, h) {
    const view = r.view, T = this.T, x0 = cx * T, y0 = cy * T, x1 = x0 + T, y1 = y0 + T, P = (x, y, z) => r.w(x, y, z);
    if (!view.isTop) {
      const faces = [[0, -1, [x1, y0], [x0, y0]], [0, 1, [x0, y1], [x1, y1]], [-1, 0, [x0, y0], [x0, y1]], [1, 0, [x1, y1], [x1, y0]]];
      for (const [nx, ny, A, B] of faces) {
        if (nx * view.fx + ny * view.fy <= .02) continue;
        const nh = this.cell(cx + nx, cy + ny) > 0 ? (this._isFront(cx + nx, cy + ny, view) ? (this.types[this.cell(cx + nx, cy + ny)].cutH || 6) : this.height(cx + nx, cy + ny)) : 0;
        if (nh >= h) continue;
        if (g._info) { g._mat = r._faceMat(g, A, B, nh, h, E.faceClass(nx, ny)); g._c = null; }
        const lit = -(nx * this.light[0] + ny * this.light[1]);
        const col = lit > .2 ? t.sideLt || shade(t.side, .12) : lit < -.2 ? t.sideDk || shade(t.side, -.25) : t.side;
        const face = [P(A[0], A[1], nh), P(B[0], B[1], nh), P(B[0], B[1], h), P(A[0], A[1], h)];
        px.poly(g, face, col);
        const pat = t.texture === false ? 'none' : t.face || 'brick';
        if (!g._info && pat !== 'brick' && pat !== 'none') this._facePattern(g, r, face, pat, t, col, cx, cy, nx * 3 + ny, nh, h, A, B);
        if (!g._info && pat === 'brick') {   // per-brick color variation, speckle and lit brick tops, anchored to the wall
          const PA = face[0], ex = face[1][0] - PA[0], ey = face[1][1] - PA[1], bz = view.bz, ct = tones(col), course0 = t.course || 8, fi = nx * 3 + ny;
          if (Math.abs(ex) > .3 && Math.abs(bz) > .05) scan(face, (xa, xb, y) => {
            for (let x = xa; x <= xb; x++) {
              const u = clamp((x + .5 - PA[0]) / ex, 0, 1), z = nh + (y + .5 - PA[1] - u * ey) / bz, ci = Math.floor(z / course0), fz = z / course0 - ci;
              const bi = Math.floor(u * 2 + (ci & 1) * .5), v = hash2(cx * 7 + cy * 13 + fi * 31 + bi * 5, ci + 99);
              let c2 = v < .22 ? ct.sh : v > .86 ? ct.lt : null;
              if (fz > .8) c2 = v > .5 ? ct.lt : c2;
              if (hash2(Math.floor(u * T * 1.4) + cx * 53 + fi * 7, Math.floor(z * 1.4) + cy * 41) < .07) c2 = ct.sh;
              if (c2) { px.col(g, c2); g.fillRect(x, y, 1, 1); }
            }
          });
        }
        const ln = t.line || shade(col, -.3), course = t.course || 8;
        if (pat === 'brick') for (let z = Math.ceil((nh + .01) / course) * course, k = 0; z < h; z += course, k++) {
          const a = P(A[0], A[1], z), b = P(B[0], B[1], z); px.line(g, a[0], a[1], b[0], b[1], ln);
          for (let j = ((z / course) & 1) ? .25 : .75; j < 1; j += .5) { const q = [lerp(A[0], B[0], j), lerp(A[1], B[1], j)], p0 = P(q[0], q[1], z), p1 = P(q[0], q[1], Math.min(h, z + course)); px.line(g, p0[0], p0[1], p1[0], p1[1], ln); }
        }
        const b0 = P(A[0], A[1], nh + .6), b1 = P(B[0], B[1], nh + .6); px.line(g, b0[0], b0[1], b1[0], b1[1], shade(col, -.35));
      }
    }
    const top = [P(x0, y0, h), P(x1, y0, h), P(x1, y1, h), P(x0, y1, h)];
    if (g._info) { g._mat = r._infoCol(h, 4, 0); g._c = null; }
    px.poly(g, top, t.top);
    const roof = t.texture === false ? 'plain' : t.roof || 'speckle';
    if (!g._info && roof === 'speckle') { const tt = tones(t.top); scan(top, (xa, xb, y) => { for (let x = xa; x <= xb; x++) { const v = hash2(x * 3 + cx * 71, y * 5 + cy * 37); if (v < .08 || v > .96) { px.col(g, v < .08 ? tt.sh : tt.lt); g.fillRect(x, y, 1, 1); } } }); }
    else if (!g._info && roof !== 'plain') this._roofPattern(g, top, roof, t, x0, y0);
    const edge = t.edge || shade(t.top, roof === 'leaves' || roof === 'grass' ? .12 : .22);
    for (const [ax, ay, bx, by, nx, ny] of [[x0, y0, x1, y0, 0, -1], [x0, y1, x0, y0, -1, 0]]) {
      const nb = this.cell(cx + nx, cy + ny); if (nb > 0 && this.height(cx + nx, cy + ny) >= h) continue;
      const a = P(ax, ay, h), b = P(bx, by, h); px.line(g, a[0], a[1], b[0], b[1], edge);
    }
  }
}
E.TileMap = TileMap;
/** wall face patterns (types[id].face): per pixel, anchored to the wall so they never swim */
TileMap.prototype._facePattern = function (g, r, face, pat, t, col, cx, cy, fi, nh, h, A, B) {
  const view = r.view, T = this.T, PA = face[0], ex = face[1][0] - PA[0], ey = face[1][1] - PA[1], bz = view.bz, ct = tones(col);
  if (Math.abs(ex) < .3 || Math.abs(bz) < .05) return;
  const beam = tones(t.beam || '#4a3222'), seed = cx * 7 + cy * 13 + fi * 31, course = t.course || (pat === 'stone' ? 10 : 8);
  // walls whose faces run along x or y: continue the pattern across neighbouring blocks
  const along = A[0] === B[0] ? (A[1] < B[1] ? 1 : -1) : (A[0] < B[0] ? 1 : -1), base0 = A[0] === B[0] ? A[1] : A[0];
  scan(face, (xa, xb, y) => {
    for (let x = xa; x <= xb; x++) {
      const u = clamp((x + .5 - PA[0]) / ex, 0, 1), z = nh + (y + .5 - PA[1] - u * ey) / bz, wx = base0 + along * u * T;
      let c2 = null;
      if (pat === 'stone') {           // big ashlar blocks with offset joints, lit top edges and chipped corners
        const ci = Math.floor(z / course), fz = z / course - ci, off = hash2(ci * 3 + cx * 5 + cy * 11, 7) * T, bwid = T * .7, q = (wx + off) / bwid, bi = Math.floor(q), fq = q - bi;
        const v = hash2(bi * 5 + cx, ci + cy * 17);
        c2 = fz < .1 || fq < .06 ? ct.deep : fz > .86 || fq < .14 ? ct.lt : fq > .93 ? ct.sh : v < .3 ? ct.sh : v > .8 ? shade(col, .06) : null;
        if (!c2 && hash2(Math.floor(wx * 1.3), Math.floor(z * 1.3) + seed) < .05) c2 = ct.sh;
      } else if (pat === 'rock') {     // natural cliff: layered blotches and cracks
        const n = noise2(wx / 6 + cx * 3, z / 4 + cy * 5) * .7 + noise2(wx / 2.5, z / 2) * .3, strata = Math.sin(z * .9 + noise2(wx / 5, z / 8) * 4);
        c2 = n < .28 ? ct.deep : n < .42 ? ct.sh : n > .72 ? ct.lt : strata > .92 ? ct.sh : null;
      } else if (pat === 'plank') {    // vertical boards with dark gaps, grain and nail heads
        const bw = T / 4, q = wx / bw, bi = Math.floor(q), fq = q - bi, v = hash2(bi * 13 + cx, cy * 7);
        c2 = fq < .14 ? ct.deep : fq > .86 ? ct.sh : fq < .3 ? ct.lt : hash2(bi, Math.floor(z / 2.5) + seed) < .18 ? ct.sh : v < .3 ? shade(col, -.06) : null;
        if (Math.abs(z - (nh + 2.5)) < .6 || Math.abs(z - (h - 2.5)) < .6) if (fq > .4 && fq < .6) c2 = '#d8d0c0';
      } else if (pat === 'timber') {   // tudor: plaster between dark posts, a mid rail and braces
        const lx = ((wx % T) + T) % T, mid = nh + (h - nh) * .5, post = lx < 1.6 || lx > T - 1.6, rail = Math.abs(z - mid) < 1.1 || z > h - 1.6 || z < nh + 1.4;
        const brace = z < mid && Math.abs(lx - (z - nh) / (mid - nh) * T * ((cx + cy + fi) & 1 ? 1 : -1) - ((cx + cy + fi) & 1 ? 0 : T)) < 1.1;
        if (post || rail || brace) c2 = (post && lx < .8) || (rail && z > mid) ? beam.base : beam.sh;
        else { const n = noise2(wx / 3, z / 3 + seed); c2 = n < .25 ? ct.sh : n > .78 ? ct.lt : null; }
      } else if (pat === 'plaster') {  // smooth render with soft mottling, a skirting band and a cornice line
        const n = noise2(wx / 4 + seed, z / 4);
        c2 = z < nh + 2.5 ? ct.sh : z > h - 1.5 ? ct.lt : n < .22 ? shade(col, -.07) : n > .8 ? shade(col, .06) : null;
        if (!c2 && hash2(Math.floor(wx * 2), Math.floor(z * 2) + seed) < .015) c2 = ct.sh;
      } else if (pat === 'hedge') {    // leafy clumps: dark hollows, lit leaves on the upper side
        const n = noise2(wx / 3.2 + seed, z / 3.2) * .65 + noise2(wx / 1.6, z / 1.6) * .35, m = noise2(wx / 6, z / 6 + 9);
        c2 = n < .3 ? ct.deep : n < .43 ? ct.sh : n > .64 && m > .35 ? ct.lt : null;
      }
      if (c2) { px.col(g, c2); g.fillRect(x, y, 1, 1); }
    }
  });
};
/** wall top patterns (types[id].roof), in world coordinates through the projected top quad */
TileMap.prototype._roofPattern = function (g, top, roof, t, wx0, wy0) {
  const T = this.T, P0 = top[0], ex = top[1][0] - P0[0], ey = top[1][1] - P0[1], fx = top[3][0] - P0[0], fy = top[3][1] - P0[1], det = ex * fy - fx * ey;
  if (Math.abs(det) < .5) return;
  const tt = tones(t.top);
  scan(top, (xa, xb, y) => {
    for (let x = xa; x <= xb; x++) {
      const dx = x + .5 - P0[0], dy = y + .5 - P0[1], wx = wx0 + (dx * fy - fx * dy) / det * T, wy = wy0 + (ex * dy - dx * ey) / det * T;
      let c = null;
      if (roof === 'tiles') {          // overlapping shingles in rows running east-west
        const row = Math.floor(wy / 4), fr = wy / 4 - row, q = (wx + (row & 1) * 3) / 6, col = Math.floor(q), fq = q - col, v = hash2(col * 7 + row, 3);
        c = fr > .72 ? tt.deep : fr < .22 ? tt.lt : fq < .1 ? tt.sh : v < .25 ? tt.sh : v > .85 ? shade(t.top, .08) : null;
      } else if (roof === 'slab') {    // square paving slabs
        const q = wx / 8, s = wy / 8, fq = q - Math.floor(q), fs = s - Math.floor(s), v = hash2(Math.floor(q) * 11, Math.floor(s) * 7);
        c = fq < .08 || fs < .08 ? tt.sh : fq > .92 || fs > .92 ? tt.lt : v < .25 ? shade(t.top, -.06) : v > .8 ? shade(t.top, .05) : null;
      } else if (roof === 'leaves' || roof === 'grass') {
        const sc = roof === 'grass' ? 3.4 : 3, n = noise2(wx / sc, wy / sc) * .65 + noise2(wx / 1.6 + 5, wy / 1.6) * .35, k = hash2(Math.floor(wx), Math.floor(wy));
        c = n < .34 ? tt.sh : n > .66 ? tt.lt : k > .975 ? tt.hi : null;
      }
      if (c) { px.col(g, c); g.fillRect(x, y, 1, 1); }
    }
  });
};

/* =============================================================================
 * 14. FLOW FIELD  BFS distance map toward a target: cheap pathfinding for crowds
 * ============================================================================= */
class FlowField {
  constructor(map) { this.map = map; const n = map.w * map.h; this.d = new Int32Array(n); this.q = new Int32Array(n); this.tx = -1; this.ty = -1; }
  update(x, y) {
    const m = this.map, T = m.T, tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (tx === this.tx && ty === this.ty) return; this.tx = tx; this.ty = ty;
    const d = this.d, q = this.q, W = m.w; d.fill(1e9);
    const solid = m.walkable ? (cx, cy) => !m.walkable(cx, cy) : (cx, cy) => m.solidCell(cx, cy);
    if (solid(tx, ty)) return;
    let h = 0, t = 0; d[ty * W + tx] = 0; q[t++] = ty * W + tx;
    while (h < t) {
      const i = q[h++], cx = i % W, cy = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy; if (solid(nx, ny)) continue;
        const j = ny * W + nx; if (d[j] > d[i] + 1) { d[j] = d[i] + 1; q[t++] = j; }
      }
    }
  }
  /** normalized ground direction to walk from (x, y) toward the target */
  dir(x, y, fx, fy) {
    const m = this.map, T = m.T, W = m.w, cx = Math.floor(x / T), cy = Math.floor(y / T), here = this.d[cy * W + cx];
    if (here === 0 || here >= 1e9) { const dx = fx - x, dy = fy - y, l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; }
    let best = here, bx = 0, by = 0;
    const solid = m.walkable ? (cx, cy) => !m.walkable(cx, cy) : (cx, cy) => m.solidCell(cx, cy);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      if (dx && dy && (solid(cx + dx, cy) || solid(cx, cy + dy))) continue;
      const nx = cx + dx, ny = cy + dy; if (solid(nx, ny)) continue;
      const v = this.d[ny * W + nx] + (dx && dy ? .4 : 0); if (v < best) { best = v; bx = dx; by = dy; }
    }
    const tx = (cx + bx + .5) * T - x, ty = (cy + by + .5) * T - y, l = Math.hypot(tx, ty) || 1;
    return [tx / l, ty / l];
  }
}
E.FlowField = FlowField;

/* =============================================================================
 * 15. TEXTURE HELPERS for floorTex functions
 * ============================================================================= */
E.tex = {
  /** stone flagstones with running-bond rows. pal: {stones:[hex..], mortar, hi, lo, speck} */
  flagstone(x, y, pal, size = 16) {
    const row = Math.floor(y / size), off = (row & 1) * size / 2, col = Math.floor((x + off) / size), lx = x + off - col * size, ly = y - row * size;
    if (lx < 1 || ly < 1) return pal.mortar;
    const h = hash2(col, row); let c = pal.stones[(h * pal.stones.length) | 0];
    if (lx < 2 || ly < 2) c = pal.hi; else if (lx > size - 1.5 || ly > size - 1.5) c = pal.lo;
    const n = hash2(Math.floor(x * 1.3), Math.floor(y * 1.3)); if (n < .05) c = pal.speck;
    if (h > .93 && lx > 3 && lx < size - 3 && Math.abs(lx - ly * .7 - 3) < .6) c = pal.mortar;
    return c;
  },
  /** grass with darker tufts and a few flowers. o: { base, dark, light, flower } hex colors */
  grass(x, y, o = {}) {
    // blotches of light and dark grass at two scales, short blade marks, rare flower clusters (no single-pixel static)
    const n = noise2(x * .07, y * .07) * .65 + noise2(x * .23, y * .23) * .35, blade = noise2(x * .9, y * .35);
    const fl = noise2(x * .12 + 40, y * .12 + 40), fh = hash2(Math.floor(x / 2), Math.floor(y / 2));
    if (fl > .82 && fh > .8) return hex(fh > .93 ? (o.flower || '#f4e27a') : (o.flower2 || '#f2f2f6'));
    if (n > .66 || (blade > .78 && n > .5)) return hex(o.dark || '#3e8a3a');
    if (n < .34 || blade < .16) return hex(o.light || '#6cc25a');
    return hex(o.base || '#55a94a');
  },
  /** dirt, sand or snow: base color with soft noise and specks. o: { base, dark, light } */
  dirt(x, y, o = {}) {
    // soft patches plus small pebbles (2-3 px clusters with a lit edge), no static
    const n = noise2(x * .1, y * .1) * .7 + noise2(x * .3, y * .3) * .3, peb = noise2(x * .45 + 9, y * .45 + 3);
    if (peb > .84) return hex(noise2(x * .45 + 9, (y - 1) * .45 + 3) > .84 ? (o.dark || '#6e4a2e') : (o.light || '#c9a276'));
    return hex(n > .62 ? (o.light || '#b08a5e') : n < .3 ? (o.dark || '#7d5838') : (o.base || '#9a7048'));
  },
  /** water with static ripple lines (baked, so it does not move). o: { base, dark, light } */
  water(x, y, o = {}) {
    const w = Math.sin(x * .35 + Math.sin(y * .18) * 2.2 + y * .05);
    if (w > .93 && ((Math.floor(x) + Math.floor(y)) & 1)) return hex(o.light || '#9fe3ff');
    return hex(noise2(x * .05, y * .05) > .55 ? (o.base || '#2f7fd0') : (o.dark || '#2464b0'));
  },
  /** wooden floor boards running along x. o: { base, dark, line } */
  planks(x, y, o = {}) {
    const row = Math.floor(y / 6), ly = y - row * 6, len = 20 + Math.floor(hash2(row, 3) * 18), joint = (x + row * 13) % len;
    if (ly < 1 || joint < 1) return hex(o.line || '#4a2e1c');
    const g = hash2(Math.floor(x / 3), row); return hex(g > .7 ? (o.dark || '#8a5a34') : (o.base || '#9d6a3f'));
  },
  /** checkerboard tiles (castle floors, bonus rooms). o: { a, b, size } */
  checker(x, y, o = {}) { const s = o.size || 16; return hex(((Math.floor(x / s) + Math.floor(y / s)) & 1) ? (o.a || '#d8d0e8') : (o.b || '#5a5270')); },
  /** plain color with light noise, for roads, carpets and space floors. o: { base, amount } */
  plain(x, y, o = {}) { const c = hex(o.base || '#4a4458'), k = 1 + (Math.round((noise2(x * .15, y * .15) - .5) * 4) / 4) * (o.amount === undefined ? .14 : o.amount); return c.map(v => v * k); }
};

/* =============================================================================
 * 16. PLATFORM MAP  side-scroller levels (Mario, Mega Man, Castlevania, Metroid).
 *    Tiles sit on the x/z plane (x right, z up) and are extruded a little in y, so the
 *    'side' view looks like an NES/SNES game and a tilted view ('brawler', or any
 *    View with yaw 0) looks like a 2.5D N64/PS1 remake. The play plane is y = 0.
 *    types[id] = { kind, style, side, top, line }
 *      kind:  'solid' (default) | 'oneway' (jump up through, stand on top) | 'ladder'
 *             | 'slope' (dir: 1 rises to the right, -1 to the left; or from/to heights 0..1 for gentle slopes)
 *             | 'hazard' (spikes, lava: not solid, test with level.touching(body, 'hazard'))
 *             | 'deco' (drawn in the play plane, not solid) | 'back' (background wall, not solid)
 *      style: 'stone' | 'brick' | 'block' | 'ground' | 'wood' | 'metal' | 'plank' | 'spikes' | 'ladder' | 'pipe' | 'bonus' | 'liquid' | 'plain'
 *      extra: moss: '#4a7a3a' (stone), flower: '#ffe070' (ground), glyph (bonus)
 * ============================================================================= */
const PT_DEFAULT = { kind: 'solid', style: 'block', side: '#8a7a9a' };
const PT_STYLE_FOR_KIND = { oneway: 'plank', ladder: 'ladder', hazard: 'spikes', slope: 'ground' };
class PlatformMap {
  /** { rows: [...ASCII, top row first...], legend: { '#': 1, '@': 'hero' }, types: { 1: {...} }, tile: 16, depth: 16 } */
  constructor(o = {}) {
    this.T = o.tile || 16; this.depth = o.depth === undefined ? this.T : o.depth;
    const L = o.rows ? parseLevel(o.rows, o.legend) : o.level;
    if (!L) throw new Error('PlatformMap needs { rows: [...], legend: {...}, types: {...} }');
    this.w = L.w; this.h = L.h; this.types = {};
    for (const k in (o.types || {})) { const t = Object.assign({ kind: 'solid' }, o.types[k]); t.style = t.style || PT_STYLE_FOR_KIND[t.kind] || 'block'; t.side = t.side || t.color || PT_DEFAULT.side; this.types[k] = t; }
    // stored bottom row first: cz = 0 is the lowest row and z grows upward
    this.cells = new Array(this.w * this.h).fill(0);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.cells[(this.h - 1 - y) * this.w + x] = L.cells[y * this.w + x];
    for (const id of new Set(this.cells)) if (id > 0 && !this.types[id]) { warn('ptype:' + id, 'PlatformMap: tile type ' + id + ' is used but missing from types (using a plain solid block)'); this.types[id] = Object.assign({}, PT_DEFAULT); }
    /** spawn points: { tag, ch, cx, cz, x, y: 0, z } with x = cell center and z = bottom of the cell (feet) */
    this.spawns = L.spawns.map(sp => { const cz = this.h - 1 - sp.cy; return Object.assign(sp, { cz, x: (sp.cx + .5) * this.T, y: 0, z: cz * this.T }); });
    this.version = 0; this._bake = null; this.edges = o.edges || 'solid';
  }
  find(tag) { return this.spawns.find(s => s.tag === tag) || null; }
  findAll(tag) { return this.spawns.filter(s => s.tag === tag); }
  /** tile id at column cx, row cz (cz = 0 is the bottom). Left and right of the level are solid walls unless edges: 'open' */
  cell(cx, cz) { if (cx < 0 || cx >= this.w) return this.edges === 'open' ? 0 : -1; if (cz < 0 || cz >= this.h) return 0; return this.cells[cz * this.w + cx]; }
  kind(cx, cz) { const c = this.cell(cx, cz); return c < 0 ? 'solid' : c === 0 ? null : this.types[c].kind; }
  set(cx, cz, id) {
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return;
    if (id > 0 && !this.types[id]) this.types[id] = Object.assign({}, PT_DEFAULT);
    this.cells[cz * this.w + cx] = id; this.version++;
  }
  toCell(x, z) { return [Math.floor(x / this.T), Math.floor(z / this.T)]; }
  center(cx, cz) { return [(cx + .5) * this.T, (cz + .5) * this.T]; }
  kindAt(x, z) { return this.kind(Math.floor(x / this.T), Math.floor(z / this.T)); }
  solidAt(x, z) { return this.kindAt(x, z) === 'solid'; }
  /** width and height of the level in world units */
  get width() { return this.w * this.T; }
  get height() { return this.h * this.T; }
  /** top of the highest solid or one-way tile at or below height z in this column, or null over a pit */
  groundBelow(x, z) {
    const T = this.T, cx = Math.floor(x / T);
    for (let cz = Math.min(this.h - 1, Math.floor((z + .5) / T)); cz >= 0; cz--) {
      const k = this.kind(cx, cz);
      if (k === 'slope') { const sz = this.slopeZ(cx, cz, x); if (sz <= z + .5) return sz; }
      else if ((k === 'solid' || k === 'oneway') && (cz + 1) * T <= z + .5) return (cz + 1) * T;
    }
    return null;
  }
  /** surface height of a slope tile at world x */
  slopeZ(cx, cz, x) {
    const t = this.types[this.cell(cx, cz)] || {}, T = this.T, u = clamp((x - cx * T) / T, 0, 1);
    const a = t.from !== undefined ? t.from : (t.dir < 0 ? 1 : 0), b = t.to !== undefined ? t.to : (t.dir < 0 ? 0 : 1);
    return cz * T + lerp(a, b, u) * T;
  }
  /** highest surface (tile top or slope) under the body within maxDrop below its feet, or null */
  _surfaceBelow(b, maxDrop) {
    const T = this.T, hw = b.w / 2 - .01, sc = Math.floor(b.x / T); let best = null;
    for (let cz = Math.floor((b.z + .01) / T); cz >= Math.floor((b.z - maxDrop) / T) - 1; cz--) {
      for (let cx = Math.floor((b.x - hw) / T); cx <= Math.floor((b.x + hw) / T); cx++) {
        const k = this.kind(cx, cz), top = (cz + 1) * T;
        let sz = null;
        if (k === 'slope') { if (cx === sc) sz = this.slopeZ(cx, cz, b.x); }
        else if (k === 'solid' || ((k === 'oneway') && !(b.drop > 0))) sz = top;
        if (sz !== null && sz <= b.z + .01 && sz >= b.z - maxDrop && (best === null || sz > best)) best = sz;
      }
    }
    return best;
  }
  /** tiles overlapped by a body box { x, z, w, h }: [{ cx, cz, id, kind }] (optionally only one kind or id) */
  cellsTouching(b, what) {
    const T = this.T, out = [], x0 = Math.floor((b.x - b.w / 2 + .01) / T), x1 = Math.floor((b.x + b.w / 2 - .01) / T), z0 = Math.floor((b.z + .01) / T), z1 = Math.floor((b.z + b.h - .01) / T);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const id = this.cell(cx, cz); if (id <= 0) continue; const k = this.types[id].kind;
      if (what === undefined || what === k || what === id) out.push({ cx, cz, id, kind: k });
    }
    return out;
  }
  /** does the body box overlap a tile of this kind ('hazard', 'ladder', ...) or id? */
  touching(b, what) { return this.cellsTouching(b, what).length > 0; }
  /**
   * Move a body { x, z, vx, vz, w, h } (x = center, z = feet, vz > 0 = up) by its velocity, colliding with the level.
   * Sets b.onGround, b.onOneWay, b.hitWall (-1 left, 1 right, 0), b.hitCeiling, b.bumped ({ cx, cz, id } of a ceiling
   * tile hit from below, for ? blocks and bricks) and b.ground (the moving solid it stands on).
   * One-way tiles hold the body from above unless b.drop > 0. solids: optional array of extra boxes
   * { x, z, w, h, vx, vz, oneway } (moving platforms, elevators, crates) that also carry what stands on them.
   */
  move(b, dt, solids) {
    const gr = b.ground, wasGround = !!b.onGround;
    if (gr && solids && solids.includes(gr)) { b.x += (gr.vx || 0) * dt; b.z += (gr.vz || 0) * dt; }
    b._grounded = wasGround;
    b.hitWall = 0; b.hitCeiling = false; b.bumped = null; b.onGround = false; b.onOneWay = false; b.ground = null;
    let dx = (b.vx || 0) * dt, dz = (b.vz || 0) * dt;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / (this.T * .4)));
    dx /= n; dz /= n;
    for (let i = 0; i < n; i++) { if (dx && this._mx(b, dx, solids)) dx = 0; if (this._mz(b, dz, solids) && dz > 0) dz = 0; }
    if (!b.onGround && (b.vz || 0) <= 0) this._probe(b, solids);
    // stick to the ground when walking down slopes or small steps (never while jumping or climbing)
    if (!b.onGround && wasGround && (b.vz || 0) <= 0 && !b.climbing) { const sz = this._surfaceBelow(b, Math.max(b.w / 2 + 3, Math.abs(b.vx || 0) * dt * 1.5 + 2)); if (sz !== null) { b.z = sz; b.vz = 0; b.onGround = true; } }
    return b;
  }
  _stands(k, cx, cz, prevZ, top, b) {
    if (k === 'solid') return true;
    if (b.drop > 0 || prevZ < top - .01) return false;
    if (k === 'oneway') return true;
    return k === 'ladder' && !b.climbing && this.kind(cx, cz + 1) !== 'ladder';   // stand on the top of a ladder
  }
  _mx(b, dx, solids) {
    const T = this.T, hw = b.w / 2; b.x += dx;
    const cx = Math.floor((dx > 0 ? b.x + hw : b.x - hw) / T);
    const blocked = () => { for (let cz = Math.floor((b.z + .01) / T); cz <= Math.floor((b.z + b.h - .01) / T); cz++) if (this.kind(cx, cz) === 'solid') return cz; return null; };
    let hit = blocked();
    if (hit !== null && b._grounded) {   // step up onto a low ledge (the top of a slope, a small step)
      const top = (hit + 1) * T, up = top - b.z;
      if (up > 0 && up <= (b.stepUp === undefined ? 5 : b.stepUp)) { const oz = b.z; b.z = top; if (blocked() === null) hit = null; else b.z = oz; }
    }
    if (hit !== null) { b.x = dx > 0 ? cx * T - hw - .001 : (cx + 1) * T + hw + .001; b.vx = 0; b.hitWall = dx > 0 ? 1 : -1; return true; }
    if (solids) for (const s of solids) {
      if (s.oneway || s.solid === false || s === b) continue;
      if (Math.abs(b.x - s.x) * 2 < b.w + s.w && b.z < s.z + s.h - .01 && s.z < b.z + b.h - .01) { b.x = dx > 0 ? s.x - (s.w + b.w) / 2 - .001 : s.x + (s.w + b.w) / 2 + .001; b.vx = s.vx || 0; b.hitWall = dx > 0 ? 1 : -1; return true; }
    }
    return false;
  }
  _mz(b, dz, solids) {
    const T = this.T, prev = b.z; b.z += dz;
    const hw = b.w / 2 - .01, c0 = Math.floor((b.x - hw) / T), c1 = Math.floor((b.x + hw) / T);
    if (dz <= 0) {
      const cz = Math.floor(b.z / T), top = (cz + 1) * T, sc = Math.floor(b.x / T);
      // slopes first: they hold the body at their surface under its center (check the row of the feet and the one above)
      for (const rz of [cz + 1, cz]) if (this.kind(sc, rz) === 'slope') {
        const sz = this.slopeZ(sc, rz, b.x);
        if (b.z <= sz && prev >= sz - T * .5) { b.z = sz; if (b.vz < 0) b.vz = 0; b.onGround = true; b.onOneWay = false; return true; }
      }
      let land = false, one = true;
      for (let cx = c0; cx <= c1; cx++) { const k = this.kind(cx, cz); if (k && this._stands(k, cx, cz, prev, top, b)) { land = true; if (k === 'solid') one = false; } }
      if (land) { b.z = top; if (b.vz < 0) b.vz = 0; b.onGround = true; b.onOneWay = one; return true; }
      if (solids) for (const s of solids) {
        if (s.solid === false || s === b) continue; const st = s.z + s.h;
        if (Math.abs(b.x - s.x) * 2 < b.w + s.w && b.z <= st && prev >= st - .01 - Math.max(0, -(s.vz || 0)) * .05 && !(s.oneway && b.drop > 0)) { b.z = st; if (b.vz < 0) b.vz = 0; b.onGround = true; b.onOneWay = !!s.oneway; b.ground = s; return true; }
      }
    } else {
      const head = b.z + b.h, cz = Math.floor(head / T);
      let best = null;
      for (let cx = c0; cx <= c1; cx++) if (this.kind(cx, cz) === 'solid') { const d = Math.abs((cx + .5) * T - b.x); if (!best || d < best.d) best = { cx, cz, id: this.cell(cx, cz), d }; }
      if (best) { b.z = cz * T - b.h - .001; b.vz = 0; b.hitCeiling = true; b.bumped = { cx: best.cx, cz: best.cz, id: best.id }; return true; }
      if (solids) for (const s of solids) {
        if (s.oneway || s.solid === false || s === b) continue;
        if (Math.abs(b.x - s.x) * 2 < b.w + s.w && head > s.z && prev + b.h <= s.z + .01) { b.z = s.z - b.h - .001; b.vz = 0; b.hitCeiling = true; return true; }
      }
    }
    return false;
  }
  /** standing still exactly on a surface: detect it without needing gravity */
  _probe(b, solids) {
    const T = this.T, hw = b.w / 2 - .01, cz = Math.floor((b.z - .25) / T), top = (cz + 1) * T;
    const sc = Math.floor(b.x / T), zc = Math.floor((b.z - .01) / T);
    if (this.kind(sc, zc) === 'slope' && Math.abs(b.z - this.slopeZ(sc, zc, b.x)) < .5) { b.onGround = true; b.onOneWay = false; return; }
    if (Math.abs(b.z - top) < .3) for (let cx = Math.floor((b.x - hw) / T); cx <= Math.floor((b.x + hw) / T); cx++) { const k = this.kind(cx, cz); if (k && this._stands(k, cx, cz, b.z, top, b)) { b.onGround = true; b.onOneWay = k !== 'solid'; return; } }
    if (solids) for (const s of solids) if (s.solid !== false && s !== b && Math.abs(b.x - s.x) * 2 < b.w + s.w && Math.abs(b.z - (s.z + s.h)) < .3) { b.onGround = true; b.ground = s; b.onOneWay = !!s.oneway; return; }
  }
  /** projected pixel bounds of the level for this view (use for game.cam.bounds) */
  bounds(view) {
    const W = this.w * this.T, H = this.h * this.T, d = this.depth / 2; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const x of [0, W]) for (const y of [-d, d]) for (const z of [0, H]) { const s = view.p(x, y, z); x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[0]); y0 = Math.min(y0, s[1]); y1 = Math.max(y1, s[1]); }
    return { x0, y0: y0 - 4, x1, y1: y1 + 4 };
  }
  /** draw the level as the background layer: call right after r.sky() and before anything else */
  draw(r) {
    const view = r.view, g = r.ctx;
    r.game.lights.screenFrame = true;   // side-scroller lighting is measured on screen, not on a ground plane
    if (Math.abs(view.yawDeg % 360) > 1) warn('pmap:yaw', 'PlatformMap is drawn for views with yaw 0 (side, brawler, or a custom tilted side view); other views look wrong');
    const key = view.id + ':' + view.yawDeg + ':' + view.pitchDeg + ':' + view.scale + ':' + view.zBoost + ':' + this.version;
    if (!this._bake || this._bake.key !== key) this._bake = { key, chunks: new Map(), b: this.bounds(view) };
    const b = this._bake.b, CW = 128, x0 = Math.floor(b.x0), y0 = Math.floor(b.y0);
    const first = Math.max(0, Math.floor((r.ix - x0) / CW)), last = Math.floor((r.ix + r.bw - x0) / CW), maxC = Math.ceil((b.x1 - x0) / CW);
    for (let ci = first; ci <= Math.min(last, maxC); ci++) {
      let ch = this._bake.chunks.get(ci);
      if (!ch) { ch = this._bakeChunk(r, view, x0 + ci * CW, y0, CW, Math.ceil(b.y1 - y0) + 2); this._bake.chunks.set(ci, ch); }
      g.drawImage(ch, x0 + ci * CW - r.ix, y0 - r.iy);
    }
  }
  _bakeChunk(r, view, cx0, cy0, CW, CH) {
    const c = mkCanvas(CW, CH), g = ctx2d(c), T = this.T, sx = r.ix, sy = r.iy;
    r.ix = cx0; r.iy = cy0;
    try {
      const ax = Math.abs(view.ax) > .2 ? view.ax : 0;
      let a = 0, bnd = this.w - 1;
      if (ax) { const wa = cx0 / ax, wb = (cx0 + CW) / ax; a = Math.max(0, Math.floor(Math.min(wa, wb) / T) - 2); bnd = Math.min(this.w - 1, Math.ceil(Math.max(wa, wb) / T) + 2); }
      for (const pass of [0, 1]) for (let cz = 0; cz < this.h; cz++) for (let cx = a; cx <= bnd; cx++) {
        const id = this.cell(cx, cz); if (id <= 0) continue; const t = this.types[id];
        if ((t.kind === 'back') !== (pass === 0)) continue;
        this._tile(g, r, view, cx, cz, t);
      }
    } finally { r.ix = sx; r.iy = sy; }
    return c;
  }
  _tile(g, r, view, cx, cz, t) {
    const T = this.T, d = this.depth / 2, x0 = cx * T, x1 = x0 + T, z0 = cz * T, z1 = z0 + T, st = t.style, side = t.side;
    const back = t.kind === 'back', flat = back || t.kind === 'ladder' || t.kind === 'deco' || st === 'spikes';
    const yf = back ? -d : flat ? 0 : d, P = (x, y, z) => r.w(x, y, z);
    const above = this.cell(cx, cz + 1), aboveT = above > 0 ? this.types[above] : null, openTop = !aboveT || (aboveT.kind !== 'solid' && aboveT.kind !== 'back' && aboveT.kind !== 'slope');
    const col = back ? shade(side, -.38) : side, hi = shade(col, .28), lo = shade(col, -.32), line = t.line || shade(col, -.3);
    // front face as a screen rectangle (exact for yaw-0 views)
    const tl = P(x0, yf, z1), br = P(x1, yf, z0), X0 = Math.round(tl[0]), Y0 = Math.round(tl[1]), X1 = Math.round(br[0]), Y1 = Math.round(br[1]), W = X1 - X0, H = Y1 - Y0;
    if (W <= 0 || H <= 0) return;
    const topFace = (zt, c) => { if (view.pitchDeg > 1 && !flat) px.poly(g, [P(x0, -d, zt), P(x1, -d, zt), P(x1, d, zt), P(x0, d, zt)], c); };
    if (t.kind === 'slope') {
      const zl = this.slopeZ(cx, cz, x0), zr = this.slopeZ(cx, cz, x1), grass = t.top || (st === 'ground' ? '#5fbf4a' : hi);
      if (view.pitchDeg > 1) px.poly(g, [P(x0, -d, zl), P(x1, -d, zr), P(x1, d, zr), P(x0, d, zl)], grass);
      const a = P(x0, d, zl), b2 = P(x1, d, zr);
      px.poly(g, [P(x0, d, z0), P(x1, d, z0), b2, a], col);
      if (st === 'ground') { px.line(g, a[0], a[1] + 1, b2[0], b2[1] + 1, grass, 3); px.line(g, a[0], a[1], b2[0], b2[1], shade(grass, .3)); }
      else px.line(g, a[0], a[1], b2[0], b2[1], hi);
      return;
    }
    switch (st) {
      case 'plank': {
        const pz = Math.max(3, Math.round(4 * H / T)); topFace(z1, t.top || hi);
        px.rect(g, X0, Y0, W, pz, col); px.rect(g, X0, Y0, W, 1, hi); px.rect(g, X0, Y0 + pz - 1, W, 1, lo);
        px.rect(g, X0 + 2, Y0 + pz, 1, Math.max(1, Math.round(H * .25)), lo); px.rect(g, X1 - 3, Y0 + pz, 1, Math.max(1, Math.round(H * .25)), lo);
        return;
      }
      case 'spikes': {
        const n = 3, sw = W / n;
        for (let k = 0; k < n; k++) { const a = X0 + k * sw, m = a + sw / 2, e = a + sw; px.poly(g, [[a, Y1], [m, Y0 + H * .2], [e, Y1]], col); px.line(g, a, Y1 - 1, m, Y0 + H * .2, hi); }
        return;
      }
      case 'ladder': {
        const rw = Math.max(1, Math.round(W * .1)); px.rect(g, X0 + Math.round(W * .15), Y0, rw, H, col); px.rect(g, X1 - Math.round(W * .15) - rw, Y0, rw, H, col);
        for (let k = 0; k < 4; k++) px.rect(g, X0 + Math.round(W * .15), Y0 + Math.round((k + .5) * H / 4), W - 2 * Math.round(W * .15), 1, hi);
        return;
      }
      case 'liquid': {
        px.rect(g, X0, Y0, W, H, col);
        if (openTop) { px.rect(g, X0, Y0, W, 1, hi); for (let x = X0; x < X1; x++) if (((x + (cz & 1) * 2) & 3) === 0) px.dot(g, x, Y0 + 1, hi); }
        for (let y = Y0 + 3; y < Y1; y += 4) for (let x = X0 + ((y >> 2) & 1) * 2; x < X1; x += 5) px.dot(g, x, y, lo);
        return;
      }
    }
    topFace(z1, t.top || (st === 'ground' ? '#5fbf4a' : hi));
    px.rect(g, X0, Y0, W, H, col);
    const tt = tones(col), open = k2 => { const c2 = this.cell(k2[0], k2[1]); const t2 = c2 > 0 ? this.types[c2] : null; return !t2 || (t2.kind !== 'solid' && t2.kind !== 'back' && t2.kind !== 'slope') || c2 < 0; };
    const openB = open([cx, cz - 1]) && cz > 0, openL = open([cx - 1, cz]) && cx > 0, openR = open([cx + 1, cz]) && cx < this.w - 1;
    const wx0 = cx * W, wy0 = (this.h - cz) * H;   // world-anchored pixel origin, so textures continue across tiles
    if (st === 'brick') {
      const course = Math.max(3, Math.round((t.course || 8) / T * H)), bw = Math.max(4, Math.round(W / 2));
      for (let y = 0; y < H; y++) {
        const k = Math.floor((wy0 + y) / course), cy2 = (wy0 + y) % course, off = (k & 1) ? Math.round(bw / 2) : 0;
        for (let x = 0; x < W; x++) {
          const bx = Math.floor((wx0 + x + off) / bw), cxb = (wx0 + x + off) % bw, v = hash2(bx * 7 + 3, k * 13 + 1);
          let c = v < .25 ? tt.sh : v > .8 ? tt.lt : col;
          if (cy2 === 0 || cxb === 0) c = t.line || tt.deep; else if (cy2 === 1) c = v > .8 ? tt.hi : tt.lt; else if (cy2 === course - 1 || cxb === bw - 1) c = tt.sh;
          else if (hash2(wx0 + x, wy0 + y) < .05) c = tt.sh;
          if (c !== col) px.dot(g, X0 + x, Y0 + y, c);
        }
      }
    } else if (st === 'stone') {   // castle blocks: two courses per tile, offset joints, chipped edges, cracks
      const course = Math.max(4, Math.round(H / 2)), bw = W;
      for (let y = 0; y < H; y++) {
        const k = Math.floor((wy0 + y) / course), cy2 = (wy0 + y) % course, off = (k & 1) ? Math.round(bw / 2) : 0;
        for (let x = 0; x < W; x++) {
          const bx = Math.floor((wx0 + x + off) / bw), cxb = (wx0 + x + off) % bw, v = hash2(bx * 11 + 5, k * 17 + 3), n = noise2((wx0 + x) * .35, (wy0 + y) * .35);
          let c = v < .3 ? tt.sh : v > .78 ? tt.lt : col;
          if (n > .72) c = c === tt.lt ? col : c === col ? tt.sh : tt.deep;
          if (cy2 === 0 || cxb === 0) c = t.line || tt.deep;
          else if (cy2 === 1 || cxb === 1) c = hash2(wx0 + x, 3) > .15 ? tt.lt : col;
          else if (cy2 === course - 1 || cxb === bw - 1) c = tt.sh;
          else if (v > .9 && Math.abs(cxb - cy2 * 1.3 - bw * .3) < .6) c = tt.deep;   // a crack
          if (t.moss && cy2 < 3 && hash2(wx0 + x, wy0 + y) < .25 + (cy2 === 1 ? .2 : 0)) c = t.moss;
          if (c !== col) px.dot(g, X0 + x, Y0 + y, c);
        }
      }
    } else if (st === 'wood') {    // vertical planks with grain and nails
      const pw = Math.max(3, Math.round(W / 3));
      for (let x = 0; x < W; x++) {
        const pl = Math.floor((wx0 + x) / pw), cxp = (wx0 + x) % pw, v = hash2(pl, 7);
        for (let y = 0; y < H; y++) {
          let c = v < .3 ? tt.sh : v > .75 ? tt.lt : col;
          if (cxp === 0) c = tt.deep; else if (cxp === 1) c = tt.lt;
          else if (noise2((wx0 + x) * .5, (wy0 + y) * .08 + pl * 3) > .66) c = tt.sh;
          if ((y === 2 || y === H - 3) && cxp === Math.floor(pw / 2)) c = tt.hi;
          if (c !== col) px.dot(g, X0 + x, Y0 + y, c);
        }
      }
    } else if (st === 'metal') {   // riveted plate with a diagonal sheen
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let c = col; const d = (x + y) % Math.max(6, W);
        if (d < 2) c = tt.lt; else if (d === 2) c = tt.hi;
        if (x === 0 || y === 0) c = tt.hi; else if (x === W - 1 || y === H - 1) c = tt.deep;
        if ((x === 2 || x === W - 3) && (y === 2 || y === H - 3)) c = tt.hi;
        if (c !== col) px.dot(g, X0 + x, Y0 + y, c);
      }
    } else if (st === 'ground') {
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {   // soil: soft patches and small stones, anchored to the world
        const X = wx0 + x - X0, Y = wy0 + y - Y0, n = noise2(X * .2, Y * .2) * .7 + noise2(X * .5, Y * .5) * .3, st = noise2(X * .42 + 5, Y * .42 + 11);
        if (st > .83) px.dot(g, x, y, noise2(X * .42 + 5, (Y - 1) * .42 + 11) > .83 ? tt.sh : tt.lt); else if (n > .64) px.dot(g, x, y, tt.sh); else if (n < .28) px.dot(g, x, y, tt.lt);
      }
      if (openTop) {
        const grass = t.top || '#5fbf4a', gt = tones(grass);
        for (let x = X0; x < X1; x++) { const L = 3 + (hash2(x, 11) > .6 ? 1 : 0) + (hash2(x, 23) > .9 ? 2 : 0); px.rect(g, x, Y0, 1, L, gt.base); px.dot(g, x, Y0 + L, gt.deep); if (hash2(x, 5) > .7) px.dot(g, x, Y0 + L - 1, gt.sh); if (hash2(x, 31) > .96) { px.dot(g, x, Y0 - 1, gt.lt); px.dot(g, x, Y0 - 2, t.flower || '#ffe070'); } }
        px.rect(g, X0, Y0, W, 1, gt.lt);
      }
    } else if (st === 'pipe') {
      const bw = Math.max(1, Math.round(W * .18)); px.rect(g, X0 + 1, Y0, bw, H, hi); px.rect(g, X1 - bw - 1, Y0, bw, H, lo); px.rect(g, X0, Y0, 1, H, lo); px.rect(g, X1 - 1, Y0, 1, H, lo);
      if (openTop) { px.rect(g, X0, Y0, W, Math.max(2, Math.round(H * .28)), hi); px.rect(g, X0, Y0 + Math.max(2, Math.round(H * .28)), W, 1, lo); }
    } else if (st !== 'plain') {   // block and bonus: bevelled block
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const n = noise2((wx0 + x) * .3, (wy0 + y) * .3); if (n > .7) px.dot(g, X0 + x, Y0 + y, tt.sh); else if (n < .22) px.dot(g, X0 + x, Y0 + y, tt.lt); }
      px.rect(g, X0, Y0, W, 1, hi); px.rect(g, X0, Y0, 1, H, hi); px.rect(g, X0, Y1 - 1, W, 1, lo); px.rect(g, X1 - 1, Y0, 1, H, lo);
      if (st === 'bonus') { const sc = Math.max(1, Math.round(W / 12)); E.font.text(g, t.glyph || '?', X0 + W / 2, Y0 + Math.round(H / 2) - Math.round(3.5 * sc), t.glyphColor || '#fff4c8', { align: 'center', outline: lo, scale: sc }); }
      else { const q = Math.max(1, Math.round(W * .15)); for (const [qx, qy] of [[X0 + q, Y0 + q], [X1 - q - 1, Y0 + q], [X0 + q, Y1 - q - 1], [X1 - q - 1, Y1 - q - 1]]) px.dot(g, qx, qy, lo); }
    }
    // carved edges: light where the tile meets open air above, shadow below and on the sides
    if (st !== 'ground' && st !== 'pipe' && st !== 'plain') {
      if (openTop) px.rect(g, X0, Y0, W, 1, tt.hi);
      if (openB) { px.rect(g, X0, Y1 - 1, W, 1, tt.deep); px.rect(g, X0, Y1 - 2, W, 1, tt.sh); }
      if (openL) px.rect(g, X0, Y0, 1, H, tt.lt);
      if (openR) px.rect(g, X1 - 1, Y0, 1, H, tt.deep);
    } else if (openB) px.rect(g, X0, Y1 - 1, W, 1, tt.deep);
  }
}
E.PlatformMap = PlatformMap;

/**
 * Platformer: a side-scroller character body with modern, forgiving controls (coyote time,
 * jump buffering, variable jump height, optional double jump, wall jump, dash, ladders, knockback).
 *   const hero = new E.Platformer({ x, z, w: 8, h: 22 });
 *   update: hero.update(dt, level, game.input)   (or an intent object for enemies: { x: -1..1, jump, jumpPressed, up, down, dash })
 *   then read hero.onGround, hero.jumped, hero.landed, hero.facing (1 or -1), hero.climbing, hero.air
 *   draw a Humanoid with rig.update(dt, hero.rigState())
 * Units: world units per second. One tile = 16. A 285 jump with gravity 800 clears about 3 tiles.
 */
class Platformer {
  constructor(o = {}) {
    Object.assign(this, {
      x: 0, y: 0, z: 0, vx: 0, vz: 0, w: 8, h: 22,
      run: 95, accel: 900, decel: 1100, airAccel: 650, jump: 285, gravity: 800, fallGravity: 1150, maxFall: 330,
      cut: .45, coyote: .09, buffer: .13, climb: 70, airJumps: 0, wallJump: false, wallSlide: 70, dash: 0, dashTime: .22,
      facing: 1, onGround: false, climbing: false, jumped: false, landed: false, air: false, stun: 0, drop: 0, dashing: 0
    }, o);
    this._coy = 0; this._airJ = 0; this._cut = true; this._dashCD = 0;
  }
  /** push the body (getting hit): dir = -1 / 1 */
  knock(dir, speed = 130, up = 170, stun = .3) { this.vx = dir * speed; this.vz = up; this.stun = stun; this.climbing = false; this.dashing = 0; }
  /** state for Humanoid.update: rig.update(dt, hero.rigState({ attack })) */
  rigState(extra) { return Object.assign({ x: this.x, y: this.y, z: this.z, vx: this.vx, vy: 0, vz: this.vz, facing: this.facing > 0 ? 0 : Math.PI, air: this.air && !this.climbing, climb: !!this.climbing, hurt: this.stun > 0, dash: this.dashing > 0 }, extra); }
  update(dt, level, ctl = {}, solids) {
    let ix, jumpHeld, jumpPressed, up, down, dashPressed, consume = () => {};
    if (ctl && typeof ctl.move === 'function') {   // an E.Input
      ix = ctl.move()[0]; jumpHeld = ctl.down('jump'); jumpPressed = ctl.buffered('jump', this.buffer); up = ctl.down('up'); down = ctl.down('down');
      dashPressed = this.dash > 0 && !!ctl.map.dash && ctl.buffered('dash', .1); consume = a => ctl.consume(a);
    } else { ix = ctl.x || 0; jumpHeld = !!ctl.jump; jumpPressed = !!ctl.jumpPressed; up = !!ctl.up; down = !!ctl.down; dashPressed = !!ctl.dash; }
    if (Math.abs(ix) < .25) ix = 0;
    const wasGround = this.onGround; this.jumped = false; this.landed = false;
    this.stun -= dt; this.drop -= dt; this._dashCD -= dt;
    const ok = this.stun <= 0;
    // ladders: grab with up (or down at the top of one), leave with jump or by climbing off the end
    const feet = { x: this.x, z: this.z - 3, w: 2, h: 3 }, body = { x: this.x, z: this.z, w: 2, h: this.h * .8 };
    const ladHere = level.touching(body, 'ladder'), ladBelow = level.touching(feet, 'ladder');
    if (!this.climbing && ok && ((up && ladHere) || (down && ladBelow && this.onGround))) {
      const lc = level.cellsTouching(up ? body : feet, 'ladder')[0]; this.climbing = true; this.x = (lc.cx + .5) * level.T; this.vx = 0; this.dashing = 0;
      if (down) this.z -= 2;
    }
    if (this.climbing) {
      this.vz = (up ? 1 : down ? -1 : 0) * this.climb; this.vx = 0;
      if (jumpPressed) { consume('jump'); this.climbing = false; if (ix) { this.vz = this.jump * .6; this.vx = ix * this.run; } }
      level.move(this, dt, solids);
      if (!level.touching({ x: this.x, z: this.z, w: 2, h: this.h }, 'ladder') || (this.onGround && down)) this.climbing = false;
    } else {
      // dash (Mega Man X style)
      if (dashPressed && ok && this._dashCD <= 0) { consume('dash'); this.dashing = this.dashTime; this._dashCD = this.dashTime + .15; this.vz = Math.max(0, this.vz); }
      if (this.dashing > 0) { this.dashing -= dt; this.vx = this.facing * this.dash; if (!this.onGround) this.vz = Math.max(this.vz, 0); }
      else {
        const target = ok ? ix * this.run : this.vx, turning = ix && this.vx && Math.sign(ix) !== Math.sign(this.vx);
        const a = this.onGround ? (ix ? (turning ? this.decel * 1.3 : this.accel) : this.decel) : this.airAccel;
        this.vx = ok ? approach(this.vx, target, a * dt) : approach(this.vx, 0, 300 * dt);
      }
      if (ix && ok && this.dashing <= 0) this.facing = ix > 0 ? 1 : -1;
      if (!(this.dashing > 0 && !this.onGround)) this.vz = Math.max(-this.maxFall, this.vz - (this.vz > 0 ? this.gravity : this.fallGravity) * dt);
      if (!jumpHeld && this.vz > 0 && !this._cut) { this.vz *= this.cut; this._cut = true; }   // let go early = lower jump
      if (this.onGround) { this._coy = this.coyote; this._airJ = this.airJumps; } else this._coy -= dt;
      const wall = this.wallJump && !this.onGround && this.hitWall;
      if (wall && this.vz < -this.wallSlide) this.vz = -this.wallSlide;
      if (jumpPressed && ok) {
        if (down && this.onGround && this.onOneWay) { consume('jump'); this.drop = .25; this.onGround = false; this._coy = 0; this._airJ = 0; }
        else if (this.onGround || this._coy > 0) { consume('jump'); this.vz = this.jump; this._coy = 0; this.jumped = true; this._cut = false; }
        else if (wall) { consume('jump'); this.vz = this.jump * .95; this.vx = -this.hitWall * this.run * 1.1; this.facing = -this.hitWall; this.stun = .12; this.jumped = true; this._cut = false; }
        else if (this._airJ > 0) { consume('jump'); this._airJ--; this.vz = this.jump * .9; this.jumped = true; this._cut = false; }
      }
      const pushing = this.hitWall;
      level.move(this, dt, solids);
      if (!this.hitWall && pushing && ix === pushing && !this.onGround) this.hitWall = pushing;   // keep wall contact while holding toward it
    }
    if (this.onGround && !wasGround) this.landed = true;
    this.air = !this.onGround && !this.climbing;
    return this;
  }
}
E.Platformer = Platformer;

/* =============================================================================
 * 17. BODY  ground-plane physics for top-down, isometric and brawler games:
 *    velocity, friction, wall bounce, knockback and real jumping (z) onto blocks.
 *      const b = new E.Body({ x, y, r: 5 });   b.vx = ...; b.update(dt, map);
 *    Walls lower than your feet (plus step) are walkable, so you can jump onto blocks.
 * ============================================================================= */
class Body {
  constructor(o = {}) { Object.assign(this, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 5, gravity: 700, friction: 0, bounce: 0, step: 2, onGround: true, groundZ: 0, hitWall: false, landed: false }, o); }
  /** add an impulse (knockback, explosion): push(vx, vy, vz) */
  push(ix, iy, iz = 0) { this.vx += ix; this.vy += iy; if (iz) { this.vz += iz; this.onGround = false; } return this; }
  /** leave the ground with upward speed v (only when standing). Returns true if it jumped */
  jump(v = 220) { if (!this.onGround) return false; this.vz = v; this.onGround = false; return true; }
  update(dt, map) {
    this.landed = false; this.hitWall = false; this.bounced = false;
    if (this.friction) { const k = Math.exp(-this.friction * dt); this.vx *= k; this.vy *= k; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (map && map.collide) {
      const bx = this.x, by = this.y;
      if (map.collide(this)) {
        this.hitWall = true;
        const nx = this.x - bx, ny = this.y - by, l = Math.hypot(nx, ny);
        if (l > 1e-6) { const ux = nx / l, uy = ny / l, vn = this.vx * ux + this.vy * uy; if (vn < 0) { this.vx -= (1 + this.bounce) * vn * ux; this.vy -= (1 + this.bounce) * vn * uy; } }
      }
    }
    const ground = map && map.groundAt ? map.groundAt(this.x, this.y, this.r, this.z, this.step) : 0;
    if (this.onGround && this.z > ground + .5) this.onGround = false;   // walked off a ledge
    if (this.onGround) { this.z = ground; this.vz = 0; }
    else {
      this.vz -= this.gravity * dt; this.z += this.vz * dt;
      if (this.z <= ground) {
        this.z = ground;
        if (this.bounce > 0 && this.vz < -80) { this.vz = -this.vz * this.bounce; this.bounced = true; }   // bounced: hit the ground and bounced up (dust, thud)
        else { this.landed = true; this.vz = 0; this.onGround = true; }
      }
    }
    this.groundZ = ground;
    return this;
  }
}
E.Body = Body;

/* =============================================================================
 * 18. BULLETS  a pool of projectiles for shooters, boss patterns and magic.
 *    plane 'ground' (top-down: bullets fly over x/y) or 'side' (side-scrollers: x/z).
 *      const shots = new E.Bullets(game, { plane: 'ground' });
 *      shots.fire({ x, y, z, vx, vy, r: 2, dmg: 1, team: 'player', color: '#ffe060', life: 2 });
 *      shots.update(dt, map);  shots.hit(enemies, (b, e) => {...}, 'player');  shots.draw(r);
 * ============================================================================= */
class Bullets {
  constructor(game, o = {}) { this.game = game; this.list = []; this.max = o.max || 800; this.plane = o.plane || 'ground'; this.sparks = o.sparks !== false; }
  /** fire one bullet. Fields: x, y, z, vx, vy, vz, r, dmg, life, team, color, core, sprite, pierce, grav, data */
  fire(b) {
    if (this.list.length >= this.max) return null;
    const q = Object.assign({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 2, dmg: 1, life: 3, t: 0, team: 'player', color: '#ffe066', core: '#ffffff', pierce: false, grav: 0, dead: false }, b);
    this.list.push(q); return q;
  }
  /** fire several at once from a pattern list of [vx, v2] (v2 = vy on the ground plane, vz in side view) */
  burst(base, vels) { const out = []; for (const v of vels) out.push(this.fire(Object.assign({}, base, this.plane === 'side' ? { vx: v[0], vz: v[1] } : { vx: v[0], vy: v[1] }))); return out; }
  update(dt, map) {
    for (const b of this.list) {
      if (b.dead) continue;
      b.t += dt; if (b.t >= b.life) { b.dead = true; continue; }
      b.vz -= b.grav * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (map) {
        const wall = map instanceof PlatformMap ? map.solidAt(b.x, b.z) : (map.heightAt ? map.heightAt(b.x, b.y) > b.z : false);
        if (wall) { b.dead = true; if (this.sparks) this.game.particles.sparks(b.x, b.y, b.z, 3, null, { color: b.color }); if (b.onWall) b.onWall(b); }
      }
    }
    prune(this.list, b => b.dead);
  }
  /** test bullets of `team` against targets (objects with x, y, z and r, or w/h in side view). fn(bullet, target). Returns hits */
  hit(targets, fn, team) {
    let n = 0; const side = this.plane === 'side';
    for (const b of this.list) {
      if (b.dead || (team && b.team !== team)) continue;
      for (const t of targets) {
        if (!t || t.dead || t.alive === false || (b.pierce && b.hitSet && b.hitSet.has(t))) continue;
        const tr = t.r || (t.w ? t.w / 2 : 6), tz = side ? (t.z || 0) + (t.h ? t.h / 2 : 0) : null;
        const dx = b.x - t.x, dd = side ? b.z - tz : b.y - t.y, R = b.r + tr;
        if (dx * dx + dd * dd > R * R) continue;
        n++; fn(b, t);
        if (b.pierce) (b.hitSet || (b.hitSet = new Set())).add(t); else { b.dead = true; break; }
      }
    }
    prune(this.list, b => b.dead);
    return n;
  }
  clear(team) { if (team) prune(this.list, b => b.team === team); else this.list.length = 0; }
  draw(r) {
    const s = r.view.scale;
    for (const b of this.list) {
      if (b.sprite) { r.sprite(b.x, b.y, b.z, b.sprite, { anchor: 'center', glow: 1, flip: b.vx < 0 }); continue; }
      if (!r.visible(b.x, b.y, b.z, 12, 12, 12)) continue;
      r.queue(b.x, b.y, b.z, g => {
        const [x, y] = r.w(b.x, b.y, b.z), [tx, ty] = r.w(b.x - b.vx * .02, b.y - b.vy * .02, b.z - b.vz * .02), rad = Math.max(.6, b.r * s * .7);
        px.glow(g, 1); px.line(g, tx, ty, x, y, b.color, Math.max(1, Math.round(rad))); px.disc(g, x, y, rad, b.color); px.dot(g, x, y, b.core);
      }, { bias: .3, emissive: true });
    }
  }
}
E.Bullets = Bullets;
/** velocity helpers for bullet patterns. Angles in radians (0 = east / right). Each returns [vx, v2] or a list of them */
E.pattern = {
  /** one velocity at an angle */
  dir: (angle, speed) => [Math.cos(angle) * speed, Math.sin(angle) * speed],
  /** aim from a to b on the ground plane (x, y); aimSide uses x, z */
  aim: (a, b, speed) => { const an = Math.atan2(b.y - a.y, b.x - a.x); return [Math.cos(an) * speed, Math.sin(an) * speed]; },
  aimSide: (a, b, speed) => { const an = Math.atan2((b.z || 0) - (a.z || 0), b.x - a.x); return [Math.cos(an) * speed, Math.sin(an) * speed]; },
  /** n bullets fanned across `arc` radians around `angle` */
  spread: (angle, n, arc, speed) => Array.from({ length: n }, (_, i) => { const a = angle + (n < 2 ? 0 : (i / (n - 1) - .5) * arc); return [Math.cos(a) * speed, Math.sin(a) * speed]; }),
  /** n bullets in a full circle, rotated by offset */
  ring: (n, speed, offset = 0) => Array.from({ length: n }, (_, i) => { const a = offset + i / n * TAU; return [Math.cos(a) * speed, Math.sin(a) * speed]; })
};

/* =============================================================================
 * 19. SPATIAL HASH  find nearby things fast (crowds, bullets vs many enemies)
 *      const grid = new E.SpatialHash(32); grid.build(enemies);  grid.near(x, y, 20, e => ...)
 *    Side-scrollers: grid.build(list, 'x', 'z') and query with (x, z).
 * ============================================================================= */
class SpatialHash {
  constructor(cell = 32) { this.cell = cell; this.map = new Map(); }
  _k(cx, cy) { return (cx & 0xffff) * 65536 + (cy & 0xffff); }
  clear() { this.map.clear(); return this; }
  add(o, x = o.x, y = o.y) { const k = this._k(Math.floor(x / this.cell), Math.floor(y / this.cell)); let a = this.map.get(k); if (!a) this.map.set(k, a = []); a.push(o); return this; }
  build(list, xk = 'x', yk = 'y') { this.clear(); for (const o of list) if (o && !o.dead) this.add(o, o[xk], o[yk]); return this; }
  /** call fn(o) for everything in the cells touching the circle (check the exact distance yourself) */
  near(x, y, r, fn) {
    const C = this.cell;
    for (let cy = Math.floor((y - r) / C); cy <= Math.floor((y + r) / C); cy++) for (let cx = Math.floor((x - r) / C); cx <= Math.floor((x + r) / C); cx++) {
      const a = this.map.get(this._k(cx, cy)); if (a) for (const o of a) fn(o);
    }
  }
  query(x, y, r) { const out = []; this.near(x, y, r, o => out.push(o)); return out; }
}
E.SpatialHash = SpatialHash;

/* =============================================================================
 * 20. AUDIO  a tiny chip synthesizer (no sound files): square, pulse, triangle,
 *    saw, sine and noise voices, ready-made sound effects and a step sequencer.
 *    Browsers allow sound only after the first key press or click; the engine
 *    waits for that by itself, so call sfx() and music() whenever you like.
 * ============================================================================= */
const NOTE_RE = /^([A-Ga-g])([#b]?)(-?\d)$/, SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** note name -> frequency: E.note('A4') = 440, E.note('C#5'), E.note('Bb2'). Numbers pass through */
function noteFreq(n) {
  if (typeof n === 'number') return n;
  const m = NOTE_RE.exec(String(n).trim()); if (!m) return 0;
  const s = SEMI[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12;
  return 440 * Math.pow(2, (s - 69) / 12);
}
E.note = noteFreq;
/** built-in sound effects. A voice is { wave, freq, to, dur, vol, arp, step, vib: [rate, depth], filter, delay } */
const SFX = {
  jump: { wave: 'pulse', freq: 280, to: 640, dur: .14, vol: .3 },
  jump2: { wave: 'pulse', freq: 420, to: 900, dur: .12, vol: .26 },
  land: { wave: 'noise', freq: 500, to: 150, dur: .07, vol: .25, filter: 'lowpass' },
  step: { wave: 'noise', freq: 3000, dur: .03, vol: .07, filter: 'highpass' },
  coin: { wave: 'square', freq: 988, arp: [0, 5], step: .07, dur: .32, vol: .26 },
  pickup: { wave: 'triangle', freq: 880, to: 1760, dur: .09, vol: .4 },
  key: { wave: 'square', freq: 1047, arp: [0, 4, 7, 12], step: .045, dur: .22, vol: .24 },
  powerup: { wave: 'square', freq: 523, arp: [0, 4, 7, 12, 16, 19, 24], step: .05, dur: .4, vol: .26 },
  oneup: { wave: 'square', freq: 659, arp: [0, 3, 12, 8, 10, 15], step: .08, dur: .5, vol: .26 },
  heal: { wave: 'triangle', freq: 523, arp: [0, 7, 12, 19], step: .06, dur: .3, vol: .4 },
  hit: [{ wave: 'noise', freq: 1600, to: 500, dur: .12, vol: .45 }, { wave: 'square', freq: 180, to: 60, dur: .1, vol: .25 }],
  hurt: { wave: 'square', freq: 520, to: 120, dur: .28, vol: .3, vib: [30, .05] },
  stomp: { wave: 'square', freq: 400, to: 820, dur: .08, vol: .28 },
  bump: { wave: 'triangle', freq: 150, to: 90, dur: .08, vol: .45 },
  swing: { wave: 'noise', freq: 2400, to: 700, dur: .12, vol: .2 },
  whoosh: { wave: 'noise', freq: 1600, to: 400, dur: .16, vol: .18 },
  punch: [{ wave: 'noise', freq: 900, to: 300, dur: .08, vol: .45, filter: 'lowpass' }, { wave: 'sine', freq: 140, to: 60, dur: .09, vol: .5 }],
  kick: [{ wave: 'noise', freq: 600, to: 200, dur: .11, vol: .45, filter: 'lowpass' }, { wave: 'sine', freq: 110, to: 45, dur: .12, vol: .55 }],
  shoot: { wave: 'pulse12', freq: 900, to: 260, dur: .1, vol: .2 },
  laser: { wave: 'saw', freq: 1500, to: 280, dur: .18, vol: .18 },
  charge: { wave: 'saw', freq: 200, to: 900, dur: .6, vol: .12 },
  explode: { wave: 'noise', freq: 900, to: 60, dur: .6, vol: .55, filter: 'lowpass' },
  boom: [{ wave: 'noise', freq: 600, to: 40, dur: 1.1, vol: .6, filter: 'lowpass' }, { wave: 'sine', freq: 90, to: 30, dur: .8, vol: .55 }],
  door: [{ wave: 'square', freq: 196, to: 98, dur: .22, vol: .22 }, { wave: 'noise', freq: 800, dur: .15, vol: .18 }],
  secret: { wave: 'square', freq: 784, arp: [0, 5, 9, 14, 12, 17, 21, 24], step: .08, dur: .7, vol: .22 },
  warp: { wave: 'sine', freq: 200, to: 1200, dur: .5, vol: .28, vib: [12, .1] },
  die: { wave: 'square', freq: 523, arp: [7, 4, 0, -5, -12], step: .12, dur: .7, vol: .26 },
  select: { wave: 'square', freq: 660, dur: .045, vol: .18 },
  confirm: { wave: 'square', freq: 784, arp: [0, 7, 12], step: .05, dur: .16, vol: .22 },
  cancel: { wave: 'square', freq: 440, to: 220, dur: .12, vol: .2 },
  pause: { wave: 'square', freq: 988, arp: [0, 12, 0, 12], step: .05, dur: .22, vol: .18 },
  text: { wave: 'square', freq: 820, dur: .018, vol: .06 },
  blip: { wave: 'square', freq: 1200, dur: .025, vol: .1 }
};
/* drum kit for music tracks with wave 'drums': k kick, s snare, h hat, o open hat, c crash, t tom */
const DRUMS = {
  k: [{ wave: 'sine', freq: 150, to: 42, dur: .14, vol: .7 }],
  s: [{ wave: 'noise', freq: 1800, dur: .12, vol: .38 }, { wave: 'triangle', freq: 220, to: 130, dur: .06, vol: .3 }],
  h: [{ wave: 'noise', freq: 7500, dur: .035, vol: .14, filter: 'highpass' }],
  o: [{ wave: 'noise', freq: 6500, dur: .2, vol: .13, filter: 'highpass' }],
  c: [{ wave: 'noise', freq: 4500, dur: .7, vol: .18, filter: 'highpass' }],
  t: [{ wave: 'triangle', freq: 180, to: 90, dur: .16, vol: .45 }]
};
class ChipAudio {
  constructor(game) {
    this.game = game; this.ctx = null; this.volume = .7; this.sfxVolume = 1; this.musicVolume = .5; this.muted = false;
    this.presets = Object.assign({}, SFX); this._last = {}; this.song = null; this.failed = null; this._ducked = false; this._waves = {};
  }
  _init() {
    if (this.ctx || this.failed) return this.ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) throw new Error('Web Audio is not available');
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.connect(c.destination);
      this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
      this.musBus = c.createGain(); this.musBus.connect(this.master);
      this._levels();
      const nb = c.createBuffer(1, c.sampleRate, c.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = nb;
      const resume = () => { if (c.state !== 'running') c.resume().catch(() => {}); };
      for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, resume, { capture: true });
      resume();
    } catch (e) { this.failed = e.message || String(e); warn('audio', 'sound is off: ' + this.failed); }
    return this.ctx;
  }
  /** true once the browser lets the game make sound */
  get ready() { return !!this.ctx && this.ctx.state === 'running'; }
  _levels() { if (!this.ctx) return; this.master.gain.value = this.muted ? 0 : this.volume; this.sfxBus.gain.value = this.sfxVolume; this.musBus.gain.value = this.musicVolume * (this._ducked ? .35 : 1); }
  setVolume(v) { this.volume = clamp(v, 0, 1); this._levels(); }
  /** toggle (or set) mute; returns the new state */
  mute(on = !this.muted) { this.muted = on; this._levels(); return on; }
  _duck(on) { if (this._ducked === on) return; this._ducked = on; this._levels(); }
  _pulse(duty) {
    if (this._waves[duty]) return this._waves[duty];
    const N = 40, re = new Float32Array(N), im = new Float32Array(N);
    for (let n = 1; n < N; n++) { const a = 2 / (n * Math.PI) * Math.sin(n * Math.PI * duty); re[n] = a * Math.cos(n * Math.PI * duty); im[n] = a * Math.sin(n * Math.PI * duty); }
    return (this._waves[duty] = this.ctx.createPeriodicWave(re, im));
  }
  _voice(p, bus, t0, mul = 1) {
    const c = this.ctx, wave = p.wave || 'square', dur = Math.max(.012, p.dur || .15), vol = p.vol === undefined ? .3 : p.vol, att = p.attack === undefined ? .004 : p.attack;
    const t = t0 + (p.delay || 0), end = t + dur, f0 = Math.max(20, noteFreq(p.freq || 440) * mul), to = p.to ? Math.max(20, noteFreq(p.to) * mul) : 0;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + att);
    if (p.hold) { g.gain.setValueAtTime(vol, Math.max(t + att, end - .03)); g.gain.linearRampToValueAtTime(0, end); }
    else g.gain.exponentialRampToValueAtTime(.0005, end);
    let src;
    if (wave === 'noise') {
      src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const f = c.createBiquadFilter(); f.type = p.filter || 'bandpass'; f.Q.value = p.q || 1.1; f.frequency.setValueAtTime(f0, t); if (to) f.frequency.exponentialRampToValueAtTime(to, end);
      src.connect(f); f.connect(g); src.start(t, Math.random() * .5);
    } else {
      src = c.createOscillator();
      if (wave === 'pulse' || wave === 'pulse12') src.setPeriodicWave(this._pulse(wave === 'pulse' ? .25 : .125));
      else src.type = wave === 'saw' ? 'sawtooth' : ['square', 'triangle', 'sine', 'sawtooth'].includes(wave) ? wave : 'square';
      src.frequency.setValueAtTime(f0, t);
      if (to) src.frequency.exponentialRampToValueAtTime(to, end);
      if (p.arp) { const st = p.step || .06; for (let k = 0, tt = t; tt < end; tt += st, k++) src.frequency.setValueAtTime(f0 * Math.pow(2, p.arp[p.loop ? k % p.arp.length : Math.min(k, p.arp.length - 1)] / 12), tt); }
      if (p.vib) { const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = p.vib[0]; lg.gain.value = f0 * p.vib[1]; lfo.connect(lg); lg.connect(src.frequency); lfo.start(t); lfo.stop(end + .05); }
      src.connect(g); src.start(t);
    }
    g.connect(bus); src.stop(end + .05);
  }
  /**
   * Play a sound effect: a preset name ('jump', 'coin', 'hit', 'explode', ...), a voice object, or a list of voices.
   * opts: { vol: 0..1, pitch: multiplier, vary: random pitch spread (default 0.03) }
   */
  sfx(what, o = {}) {
    if (!this._init() || this.muted) return;
    const p = typeof what === 'string' ? this.presets[what] : what;
    if (!p) { warn('sfx:' + what, 'unknown sound "' + what + '". Presets: ' + Object.keys(this.presets).join(', ') + ' (or audio.define(name, voice))'); return; }
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (typeof what === 'string') { if (now - (this._last[what] === undefined ? -1 : this._last[what]) < .035) return; this._last[what] = now; }
    const mul = (o.pitch || 1) * (1 + (o.vary === undefined ? .03 : o.vary) * (Math.random() * 2 - 1));
    try { for (const v of Array.isArray(p) ? p : [p]) this._voice(o.vol === undefined ? v : Object.assign({}, v, { vol: (v.vol === undefined ? .3 : v.vol) * o.vol }), this.sfxBus, now + .005, mul); }
    catch (e) { warn('sfx-fail:' + what, 'could not play sound "' + what + '": ' + e.message); }
  }
  /** add or replace a named sound: audio.define('zap', { wave: 'saw', freq: 1200, to: 200, dur: .2 }) */
  define(name, voice) { this.presets[name] = voice; }
  /**
   * Loop a song (or play once with { loop: false }). song = { bpm: 120, steps: 4, tracks: [
   *   { wave: 'square', vol: .2, notes: 'C5 - E5 - G5 - . . | ...' },   one token per step
   *   { wave: 'triangle', notes: 'C3 . C3 . G2 . G2 .' },
   *   { wave: 'drums', notes: 'k . h . s . h . k k h . s . h .' } ] }
   * tokens: C4 F#3 Bb2 = note, '-' holds the previous note, '.' = rest, '|' is ignored (bar lines).
   * steps = steps per beat (4 = sixteenth notes). Each track loops on its own length.
   * E.songs has ready-made loops: title, adventure, dungeon, boss, victory.
   */
  music(song, o = {}) {
    if (typeof song === 'string') { const s = E.songs[song]; if (!s) { warn('song:' + song, 'unknown song "' + song + '". Built in: ' + Object.keys(E.songs).join(', ')); return; } song = s; }
    if (!song) { this.stopMusic(); return; }
    if (!this._init()) return;
    if (this.song && this.song.src === song) return;
    this.stopMusic();
    const tracks = (song.tracks || []).map(t => Object.assign({}, t, { tokens: String(t.notes || '').replace(/\|/g, ' ').trim().split(/\s+/).filter(Boolean) })).filter(t => t.tokens.length);
    if (!tracks.length) { warn('music:empty', 'music(song) needs song.tracks with notes'); return; }
    const bus = this.ctx.createGain(); bus.connect(this.musBus);
    this.song = { src: song, tracks, spb: 60 / (song.bpm || 120) / (song.steps || 4), step: 0, next: 0, len: Math.max(...tracks.map(t => t.tokens.length)), loop: o.loop !== undefined ? o.loop : song.loop !== false, bus };
    this._timer = setInterval(() => { try { this._schedule(); } catch (e) { warn('music-fail', 'music stopped: ' + e.message); this.stopMusic(); } }, 25);
  }
  stopMusic() {
    if (this._timer) clearInterval(this._timer); this._timer = null;
    const S = this.song; this.song = null;
    if (S && this.ctx) { const t = this.ctx.currentTime; S.bus.gain.setValueAtTime(S.bus.gain.value, t); S.bus.gain.linearRampToValueAtTime(0, t + .06); setTimeout(() => { try { S.bus.disconnect(); } catch (e) { /* gone */ } }, 300); }
  }
  _schedule() {
    const S = this.song, c = this.ctx; if (!S || !c) return;
    if (c.state !== 'running') { S.next = 0; return; }
    if (!S.next || S.next < c.currentTime - .2) S.next = c.currentTime + .05;
    while (S.next < c.currentTime + .12) {
      if (S.step >= S.len && !S.loop) { const end = S.next; setTimeout(() => { if (this.song === S) this.stopMusic(); }, Math.max(0, (end - c.currentTime) * 1000 + 400)); S.next = 1e9; return; }
      const pos = S.step % S.len;
      for (const t of S.tracks) this._note(t, pos % t.tokens.length, S.next, S.spb, S.bus);
      S.step++; S.next += S.spb;
    }
  }
  _note(t, i, time, spb, bus) {
    const tok = t.tokens[i]; if (tok === '.' || tok === '-' || tok === '_') return;
    const vol = t.vol === undefined ? .18 : t.vol;
    if (t.wave === 'drums' || t.wave === 'noise') {
      const kit = DRUMS[tok[0].toLowerCase()]; if (!kit) { warn('drum:' + tok, 'music: drum token "' + tok + '" is unknown (k s h o c t or .)'); return; }
      for (const v of kit) this._voice(Object.assign({}, v, { vol: v.vol * vol / .18 }), bus, time);
      return;
    }
    let n = 1; while (i + n < t.tokens.length && t.tokens[i + n] === '-') n++;
    const f = noteFreq(tok); if (!f) { warn('note:' + tok, 'music: "' + tok + '" is not a note (use C4, F#3, Bb2, "." for rest, "-" to hold)'); return; }
    this._voice({ wave: t.wave || 'square', freq: f * Math.pow(2, t.octave || 0), dur: n * spb * (t.gate || .9), vol, hold: true, attack: .006, vib: t.vib }, bus, time);
  }
}
E.Audio = ChipAudio;
/* ready-made chiptune loops (original compositions). Use: game.audio.music('adventure') */
E.songs = {
  title: { bpm: 112, steps: 4, tracks: [
    { wave: 'square', vol: .16, notes: 'C5 - - - G4 - C5 - E5 - - - D5 - C5 - | D5 - - - G4 - B4 - D5 - - - F5 - E5 - | E5 - - - C5 - E5 - G5 - - - A5 - G5 - | F5 - E5 - D5 - B4 - C5 - - - - - . .' },
    { wave: 'triangle', vol: .3, notes: 'C3 - . C3 G2 - . G2 C3 - . C3 G2 - . G2 | G2 - . G2 D3 - . D3 G2 - . G2 D3 - . D3 | A2 - . A2 E3 - . E3 A2 - . A2 E3 - . E3 | F2 - . F2 G2 - . G2 C3 - . C3 G2 - . .' },
    { wave: 'drums', vol: .14, notes: 'k . h . s . h . k . h k s . h .' } ] },
  adventure: { bpm: 138, steps: 4, tracks: [
    { wave: 'pulse', vol: .15, notes: 'E5 - G5 - A5 - - C6 B5 - A5 - G5 - E5 - | D5 - E5 - G5 - - A5 G5 - E5 - D5 - . . | E5 - G5 - A5 - - C6 D6 - C6 - A5 - G5 - | A5 - G5 - E5 - D5 - C5 - - - - - . .' },
    { wave: 'square', vol: .07, notes: 'C5 . E5 . G5 . E5 . C5 . E5 . G5 . E5 . | B4 . D5 . G5 . D5 . B4 . D5 . G5 . D5 . | A4 . C5 . E5 . C5 . A4 . C5 . E5 . C5 . | F4 . A4 . C5 . A4 . G4 . B4 . D5 . B4 .' },
    { wave: 'triangle', vol: .32, notes: 'C3 . C4 . C3 . C4 . C3 . C4 . C3 . C4 . | G2 . G3 . G2 . G3 . G2 . G3 . G2 . G3 . | A2 . A3 . A2 . A3 . A2 . A3 . A2 . A3 . | F2 . F3 . F2 . F3 . G2 . G3 . G2 . G3 .' },
    { wave: 'drums', vol: .15, notes: 'k . h . s . h h k . h . s . h o' } ] },
  dungeon: { bpm: 96, steps: 4, tracks: [
    { wave: 'pulse12', vol: .13, notes: 'A4 - - - C5 - B4 - A4 - - - E4 - - - | F4 - - - A4 - G4 - E4 - - - - - . . | A4 - - - C5 - D5 - E5 - - - D5 - C5 - | B4 - - - G#4 - - - A4 - - - - - . .' },
    { wave: 'triangle', vol: .32, notes: 'A2 - . . A2 . . . E2 - . . A2 . . . | F2 - . . F2 . . . E2 - . . E2 . . . | A2 - . . A2 . . . G2 - . . G2 . . . | E2 - . . E2 . . . A2 - . . A2 . . .' },
    { wave: 'drums', vol: .1, notes: 'k . . . h . . . k . k . h . . .' } ] },
  boss: { bpm: 164, steps: 4, tracks: [
    { wave: 'saw', vol: .09, notes: 'D5 D5 . D5 F5 - D5 . D5 D5 . D5 A5 - F5 . | C5 C5 . C5 E5 - C5 . C5 C5 . C5 G5 - E5 . | Bb4 Bb4 . Bb4 D5 - F5 - Bb4 Bb4 . Bb4 F5 - D5 - | A4 - C#5 - E5 - A5 - G5 - E5 - C#5 - A4 -' },
    { wave: 'square', vol: .09, notes: 'D4 . D4 . D4 . D4 . D4 . D4 . D4 . D4 . | C4 . C4 . C4 . C4 . C4 . C4 . C4 . C4 . | Bb3 . Bb3 . Bb3 . Bb3 . Bb3 . Bb3 . Bb3 . Bb3 . | A3 . A3 . A3 . A3 . A3 . A3 . C#4 . C#4 .' },
    { wave: 'triangle', vol: .32, notes: 'D2 D3 D2 D3 D2 D3 D2 D3 D2 D3 D2 D3 D2 D3 D2 D3 | C2 C3 C2 C3 C2 C3 C2 C3 C2 C3 C2 C3 C2 C3 C2 C3 | Bb1 Bb2 Bb1 Bb2 Bb1 Bb2 Bb1 Bb2 Bb1 Bb2 Bb1 Bb2 Bb1 Bb2 Bb1 Bb2 | A1 A2 A1 A2 A1 A2 A1 A2 A1 A2 A1 A2 C#2 C#3 C#2 C#3' },
    { wave: 'drums', vol: .16, notes: 'k h s h k k s h k h s h k s s s' } ] },
  victory: { bpm: 150, steps: 4, loop: false, tracks: [
    { wave: 'square', vol: .17, notes: 'G4 . C5 . E5 . G5 - - - E5 - G5 - - - A5 - G5 - E5 - F5 - G5 - - - - - . .' },
    { wave: 'triangle', vol: .3, notes: 'C3 . C3 . C3 . C3 - - - C3 - C3 - - - F2 - F2 - C3 - G2 - C3 - - - - - . .' } ] }
};


/* =============================================================================
 * 21b. BACKDROPS  layered parallax scenery behind the level: sky gradient, sun or
 *    moon with a halo, stars, and silhouette layers (mountains, hills, forest, city,
 *    castle, clouds, sea, fog), each shaded with hue-shifted tones and hazed toward
 *    the horizon. Layers are baked once into tiling strips, so they cost little.
 *      const bg = new E.Backdrop('castle-night');            // a preset, or:
 *      const bg = new E.Backdrop({ sky: ['#0b0a24', '#3a2860', '#b0607a'], moon: { x: .75, y: .22 }, stars: 80,
 *        layers: [{ kind: 'mountains', color: '#3a3460', y: .5, height: .3, parallax: .08 },
 *                 { kind: 'castle', color: '#1c1830', y: .62, height: .4, parallax: .18 },
 *                 { kind: 'forest', color: '#101c1c', y: .82, height: .22, parallax: .35 }] });
 *      draw(r) { bg.draw(r); level.draw(r); ... }
 *    y = where the layer's skyline sits (0 top .. 1 bottom of the screen), height = its tallest
 *    point as a share of the screen, parallax = how fast it scrolls with the camera (0..1).
 * ============================================================================= */
const BACKDROPS = {
  'day': { sky: ['#3a78d8', '#78b0ee', '#c8e4f8'], sun: { x: .8, y: .18, r: 10, color: '#fff8d8' },
    layers: [{ kind: 'clouds', color: '#ffffff', y: .28, height: .16, parallax: .05, drift: 4 }, { kind: 'mountains', color: '#7a98c8', y: .56, height: .3, parallax: .06, snow: '#eef4ff' }, { kind: 'hills', color: '#5aa060', y: .74, height: .2, parallax: .2 }, { kind: 'forest', color: '#2f7040', y: .86, height: .16, parallax: .4 }] },
  'dusk': { sky: ['#1a1440', '#6a3a78', '#e0766a', '#f8c080'], sun: { x: .3, y: .62, r: 16, color: '#ffd8a0' },
    layers: [{ kind: 'clouds', color: '#f0a090', y: .3, height: .12, parallax: .04, drift: 3 }, { kind: 'mountains', color: '#5a3a6a', y: .58, height: .32, parallax: .07 }, { kind: 'hills', color: '#3a2448', y: .76, height: .18, parallax: .2 }, { kind: 'forest', color: '#1c1428', y: .88, height: .16, parallax: .38 }] },
  'night': { sky: ['#05061a', '#141a44', '#2a3464'], moon: { x: .76, y: .2, r: 11 }, stars: 90,
    layers: [{ kind: 'mountains', color: '#1e2448', y: .58, height: .3, parallax: .06 }, { kind: 'hills', color: '#141a34', y: .76, height: .18, parallax: .18 }, { kind: 'forest', color: '#0a0e1e', y: .88, height: .16, parallax: .36 }] },
  'castle-night': { sky: ['#07051a', '#1e1648', '#4a2a6a', '#8a4a78'], moon: { x: .74, y: .22, r: 13, color: '#f4ecd8' }, stars: 80,
    layers: [{ kind: 'mountains', color: '#2a2450', y: .54, height: .28, parallax: .05 }, { kind: 'castle', color: '#18142e', y: .66, height: .5, parallax: .14, windows: '#ffcf6a' }, { kind: 'fog', color: '#8a6aa0', y: .8, height: .12, parallax: .25, drift: 6 }, { kind: 'forest', color: '#0c0a18', y: .9, height: .18, parallax: .45 }] },
  'city-night': { sky: ['#07081c', '#1c1a48', '#5a2a5a'], moon: { x: .2, y: .2, r: 9 }, stars: 50,
    layers: [{ kind: 'city', color: '#262048', y: .6, height: .42, parallax: .08, windows: '#ffd87a' }, { kind: 'city', color: '#161230', y: .74, height: .36, parallax: .22, windows: '#ffb85a', seed: 7 }] },
  'desert': { sky: ['#3a88d8', '#8ac0e8', '#f0dca8'], sun: { x: .7, y: .2, r: 12, color: '#fffbe8' },
    layers: [{ kind: 'mountains', color: '#c89a6a', y: .6, height: .22, parallax: .06 }, { kind: 'hills', color: '#e0b070', y: .76, height: .16, parallax: .2 }, { kind: 'hills', color: '#c88a4a', y: .88, height: .12, parallax: .4, seed: 5 }] },
  'forest': { sky: ['#4a88c8', '#9ac8e0', '#d8ecd8'], sun: { x: .82, y: .14, r: 9, color: '#fffbe0' },
    layers: [{ kind: 'forest', color: '#6a9a8a', y: .5, height: .26, parallax: .06 }, { kind: 'forest', color: '#3a7a4a', y: .66, height: .3, parallax: .16, seed: 3 }, { kind: 'forest', color: '#1e4a2a', y: .84, height: .34, parallax: .34, seed: 9 }] },
  'ocean': { sky: ['#2a6ad0', '#7ab8f0', '#d8f0ff'], sun: { x: .25, y: .2, r: 11, color: '#fffbe0' },
    layers: [{ kind: 'clouds', color: '#ffffff', y: .34, height: .14, parallax: .04, drift: 5 }, { kind: 'hills', color: '#6a90b8', y: .6, height: .08, parallax: .05 }, { kind: 'sea', color: '#2a70c0', y: .64, height: .36, parallax: .12 }] },
  'cave': { sky: ['#0a0810', '#1a1424', '#241a2a'],
    layers: [{ kind: 'stalactites', color: '#2a2032', y: 0, height: .3, parallax: .1 }, { kind: 'mountains', color: '#1e1826', y: .64, height: .4, parallax: .12, seed: 4 }, { kind: 'fog', color: '#4a3a5a', y: .84, height: .12, parallax: .2, drift: 3 }] },
  'space': { sky: ['#020208', '#080a1c', '#140c28'], stars: 160,
    layers: [{ kind: 'clouds', color: '#4a2a6a', y: .5, height: .5, parallax: .03, drift: 1, nebula: true }] }
};
class Backdrop {
  constructor(o = {}) {
    if (typeof o === 'string') { const p = BACKDROPS[o]; if (!p) warn('backdrop:' + o, 'unknown backdrop preset "' + o + '". Presets: ' + Object.keys(BACKDROPS).join(', ')); o = p || BACKDROPS.day; }
    this.o = o; this.sky = o.sky || ['#3a78d8', '#c8e4f8']; this.layers = (o.layers || []).map((l, i) => Object.assign({ seed: i * 17 + 3, parallax: .2, y: .7, height: .25 }, l)); this._bake = new Map();
  }
  static get presets() { return Object.keys(BACKDROPS); }
  _strip(l, H) {
    const key = l.kind + ':' + l.seed + ':' + l.color + ':' + H + ':' + l.height + ':' + (l.windows || '') + ':' + (l.snow || '');
    let c = this._bake.get(key); if (c) return c;
    const P = 512, lh = Math.max(4, Math.round(l.height * H)), cv = mkCanvas(P, lh + 2), g = ctx2d(cv), t = tones(l.color), s = l.seed;
    const n1 = x => noise2(x * .012 + s, s * .37), n2 = x => noise2(x * .045 + s * 1.7, s), n3 = x => noise2(x * .17 + s * 3.1, s * .5);
    const wrapN = (f, x) => lerp(f(x), f(x - P), x / P);   // make the strip tile seamlessly
    const col = (x, top, cTop, cBody) => { px.rect(g, x, top, 1, lh + 2 - top, cBody); if (cTop) px.dot(g, x, top, cTop); };
    const k = l.kind;
    // seamless profiles: sums of sines with whole cycles per strip, ridged for mountains, smooth for hills
    const rp = rng(s * 7919 + 11), ph = Array.from({ length: 6 }, () => rp() * TAU);
    const ridge = x => { const u = x / P * TAU; return (.52 * (1 - Math.abs(Math.sin(u * 1.5 + ph[0]))) + .3 * (1 - Math.abs(Math.sin(u * 3.5 + ph[1]))) + .18 * (1 - Math.abs(Math.sin(u * 8.5 + ph[2])))) * .92 + .08 * noise2(x * .2, s); };
    const smooth = x => { const u = x / P * TAU; return .55 + .25 * Math.sin(u * 2 + ph[3]) + .14 * Math.sin(u * 5 + ph[4]) + .06 * Math.sin(u * 11 + ph[5]); };
    const range = (fn, x, lo, hi) => clamp((fn(x) - lo) / (hi - lo), 0, 1);
    const terrain = (fn, lo, hi, snow) => {
      for (let x = 0; x < P; x++) {
        const h = range(fn, x, lo, hi) * lh, top = Math.round(lh - h), slope = range(fn, (x + 2) % P, lo, hi) - range(fn, (x - 2 + P) % P, lo, hi);
        const litK = clamp(.5 + slope * 40, 0, 1), lit = litK > .5, rim = lit ? t.lt : t.base;
        const dith = E.style.trans === 'dither', face = litK > .62 ? t.base : litK < .38 ? t.sh : (dith ? null : mix(t.base, t.sh, .5));
        for (let y = top; y < lh + 2; y++) {
          const d = (y - top) / Math.max(1, lh - top), c = face || (litK > bayer(x, y) ? t.base : t.sh);
          if (dith) px.dot(g, x, y, d > .45 && (d - .45) * 1.6 > bayer(x + 2, y + 1) ? (c === t.base ? t.sh : t.deep) : c);
          else px.dot(g, x, y, d > .45 ? mix(c, c === t.base ? t.sh : t.deep, Math.round(Math.min(1, (d - .45) * 1.6) * 6) / 6) : c);
        }
        px.dot(g, x, top, rim);
        if (snow && h > lh * .62) { const sd = Math.round((h - lh * .62) * .55); px.rect(g, x, top, 1, sd, lit ? snow : shade(snow, -.18)); }
      }
    };
    if (k === 'mountains') terrain(ridge, .12, .95, l.snow);
    else if (k === 'hills') terrain(smooth, .15, 1, null);
    else if (k === 'forest' || k === 'stalactites') {
      const rnd = rng(s * 991 + 7), trees = [];
      for (let x = -12; x < P + 12; x += 2 + rnd() * 4) trees.push({ x, h: (.5 + range(smooth, (Math.floor(x) + P) % P, .2, 1) * .5 - rnd() * .12) * lh, r: 3.5 + rnd() * 5 });
      if (k === 'stalactites') {
        for (const tr of trees) { const w = tr.r * .9; for (const o2 of [0, P, -P]) px.poly(g, [[tr.x + o2 - w, 0], [tr.x + o2 + w, 0], [tr.x + o2 + rnd() * 2 - 1, tr.h]], rnd() < .5 ? t.base : t.sh); }
        this._bake.set(key, cv); return cv;
      }
      const floorY = Math.round(lh * .55);
      px.rect(g, 0, floorY, P, lh + 2 - floorY, t.deep);
      trees.sort((p1, p2) => p2.h - p1.h);
      for (const tr of trees) for (const o2 of [0, P, -P]) {
        const cx = tr.x + o2, cyy = lh - tr.h + tr.r;
        if (cx < -12 || cx > P + 12) continue;
        px.rect(g, cx, cyy, 1, Math.max(0, floorY + 4 - cyy), t.deep);
        px.disc(g, cx, cyy, tr.r, t.sh); px.disc(g, cx - .8, cyy - .8, Math.max(1, tr.r - 1.3), t.base);
        px.disc(g, cx - tr.r * .35, cyy - tr.r * .35, Math.max(.6, tr.r * .38), t.lt);
        px.ddisc(g, cx + tr.r * .3, cyy + tr.r * .45, tr.r * .6, t.sh, .5, 0, 0);
      }
    } else if (k === 'city') {
      const rnd = rng(s * 131 + 1);
      for (let x = 0; x < P;) {
        const w = 10 + Math.floor(rnd() * 22), h = Math.round((.3 + rnd() * .7) * lh), top = lh - h;
        px.rect(g, x, top, w, h + 2, rnd() < .5 ? t.base : t.sh); px.rect(g, x, top, 1, h, t.lt);
        if (rnd() < .3) px.rect(g, x + Math.floor(w / 2), top - 5, 1, 5, t.base);
        if (l.windows) for (let wy = top + 3; wy < lh - 2; wy += 4) for (let wx = x + 2; wx < x + w - 2; wx += 3) if (rnd() < .28) px.dot(g, wx, wy, rnd() < .8 ? l.windows : shade(l.windows, -.35));
        x += w + (rnd() < .2 ? 2 : 0);
      }
    } else if (k === 'castle') {
      const rnd = rng(s * 71 + 5), base = Math.round(lh * .38);
      px.rect(g, 0, lh - base, P, base + 2, t.sh);
      for (let x = 0; x < P; x += 4) if ((x / 4) & 1) px.rect(g, x, lh - base - 3, 3, 3, t.sh);   // battlements on the curtain wall
      for (let y = lh - base + 3; y < lh; y += 4) for (let x = (y & 4) ? 0 : 3; x < P; x += 6) px.rect(g, x, y, 1, 1, t.deep);
      for (let x = 6; x < P - 20;) {
        const w = 12 + Math.floor(rnd() * 16), h = Math.round((.5 + rnd() * .5) * lh), top = lh - h, roofH = Math.round(w * (.8 + rnd() * .5));
        px.rect(g, x, top, w, h + 2, t.base); px.rect(g, x, top, 2, h, t.lt); px.rect(g, x + w - 3, top, 3, h, t.sh);
        for (let y = top + 4; y < lh - base; y += 5) px.rect(g, x + 2, y, w - 5, 1, t.sh);   // stone courses
        if (rnd() < .65) { px.poly(g, [[x - 2, top + 1], [x + w + 2, top + 1], [x + w / 2, top - roofH]], t.deep); px.poly(g, [[x - 2, top + 1], [x + w / 2, top + 1], [x + w / 2, top - roofH]], t.sh); }
        else { for (let bx = x - 1; bx < x + w + 1; bx += 4) px.rect(g, bx, top - 3, 3, 3, t.base); px.rect(g, x - 1, top - 1, w + 2, 2, t.base); }
        if (l.windows) for (let wy = top + 6; wy < lh - base - 5; wy += 9) if (rnd() < .7) { const wx = x + Math.floor(w / 2) - 1; px.rect(g, wx, wy, 3, 4, l.windows); px.rect(g, wx + 1, wy, 1, 4, shade(l.windows, -.3)); px.rect(g, wx, wy - 1, 3, 1, t.deep); }
        x += w + 4 + Math.floor(rnd() * 24);
      }
    } else if (k === 'clouds') {
      const rnd = rng(s * 53 + 9);
      for (let i = 0; i < 14; i++) {
        const cx = rnd() * P, cy = lh * (.3 + rnd() * .5), w = 16 + rnd() * 30;
        for (let j = 0; j < 5; j++) for (const o2 of [0, P, -P]) { const bx = cx + o2 + (j - 2) * w * .22, by = cy - Math.sin(j / 4 * Math.PI) * w * .18, br = w * (.14 + Math.sin(j / 4 * Math.PI) * .12); px.ddisc(g, bx, by, br, l.nebula ? t.base : t.lt, l.nebula ? .5 : .95, 0, 0); if (!l.nebula) px.ddisc(g, bx, by + br * .4, br * .8, t.base, .6, 0, 0); }
      }
    } else if (k === 'sea') {
      px.rect(g, 0, 0, P, lh + 2, t.base);
      for (let y = 0; y < lh; y += 2 + Math.floor(y / 12)) { const w = 6 + (y % 5) * 3; for (let x = (y * 7) % 23; x < P; x += 23 + (y % 7)) px.rect(g, x, y, w, 1, y < lh * .15 ? t.hi : t.lt); }
      px.rect(g, 0, 0, P, 1, t.hi);
    } else if (k === 'fog') {
      if (E.style.trans === 'dither') { for (let y = 0; y < lh; y++) { const a = Math.sin(y / lh * Math.PI) * .55; for (let x = 0; x < P; x++) if (a * (.6 + .4 * wrapN(n2, x)) > bayer(x, y)) px.dot(g, x, y, l.color); } }
      else for (let y = 0; y < lh; y++) for (let x = 0; x < P; x += 8) { const a = Math.sin(y / lh * Math.PI) * .5 * (.55 + .45 * wrapN(n2, x)); g.globalAlpha = qa(a); px.rect(g, x, y, 8, 1, l.color); }
      g.globalAlpha = 1;
    } else warn('bdkind:' + k, 'unknown backdrop layer kind "' + k + '" (mountains, hills, forest, city, castle, clouds, sea, fog, stalactites)');
    this._bake.set(key, cv); return cv;
  }
  draw(r) {
    const o = this.o, g = r.ctx, W = r.bw, H = r.bh, t = this.o.time === undefined ? r.game.real : this.o.time;
    r.sky(this.sky);
    if (o.stars) r.starfield({ count: o.stars, speed: 0, layers: 3, height: o.starsY || .7 });
    const orb = o.sun || o.moon;
    if (orb) {
      const x = Math.round((orb.x === undefined ? .75 : orb.x) * W - r.ix * .02), y = Math.round((orb.y === undefined ? .2 : orb.y) * H), rad = orb.r || 11, c = orb.color || (o.moon ? '#f2ecd8' : '#fff4d0');
      r.glowDisc(g, x, y, rad * 2.6, c, .22); r.glowDisc(g, x, y, rad * 1.7, c, .35);
      const ct = tones(c); px.disc(g, x, y, rad, ct.base); px.disc(g, x - 1, y - 1, rad - 1.5, ct.lt);
      if (o.moon) { px.disc(g, x + rad * .3, y + rad * .15, rad * .25, ct.sh); px.disc(g, x - rad * .35, y + rad * .35, rad * .16, ct.sh); px.disc(g, x - rad * .1, y - rad * .4, rad * .12, ct.sh); }
    }
    for (const l of this.layers) {
      const strip = this._strip(l, H), P = strip.width, drift = (l.drift || 0) * t;
      const off = Math.floor(((r.ix * l.parallax + drift) % P + P) % P), top = Math.round(l.y * H - (l.kind === 'stalactites' ? 0 : strip.height - 2) - r.iy * l.parallax * .35);
      for (let x = -off; x < W; x += P) g.drawImage(strip, x, top);
      if (l.fill !== false && l.kind !== 'stalactites' && l.kind !== 'clouds' && l.kind !== 'fog' && top + strip.height < H) px.rect(g, 0, top + strip.height, W, H, tones(l.color).sh);   // fill: false leaves the sky showing below
    }
  }
}
E.Backdrop = Backdrop;

/* =============================================================================
 * 21c. PROPS  procedural pixel-art set dressing, so rooms never look empty:
 *    torch, candle, candelabra, chandelier, brazier, window (stained glass), banner,
 *    pillar, statue, crate, barrel, chest, pot, sign, fence, lamp, door, tree, pine,
 *    bush, flowers, grass, rock, crystal, bones, skull, vines, cobweb, lantern, streetlamp, awning,
 *    hydrant, trashcan, firedrum, sandbags, cactus, palm, mushroom.
 *    Options: chest / door { open: true }, pillar { broken: true }, vines / cobweb / lantern hang ({ anchor: 'top' }).
 *    E.style.propSize scales every prop (1.3-1.5 suits heroes drawn with size 1.2+).
 *    Props are upright billboards (they work in every view), cached per size and color,
 *    with animated flames that glow under GPU lighting.
 *      r.prop('torch', x, y, z)                                   // depth sorted, feet on (x, y, z)
 *      r.prop('tree', x, y, 0, { size: 1.4, color: '#3a8a4a' })   // size scales it, color tints it
 *      r.prop('window', x, 0, 40, { colors: ['#e04a4a', '#4a8ae0', '#e0c04a'] })
 *    E.prop(name, opts) returns { frames: [sprite...], glow: [sprite...] } if you want to draw it yourself.
 * ============================================================================= */
const PROP_DEFAULTS = {
  torch: { color: '#6a4a3a', w: 7, h: 20 }, candle: { color: '#e8dcc0', w: 5, h: 13 }, candelabra: { color: '#c8a040', w: 15, h: 24 },
  chandelier: { color: '#c8a040', w: 29, h: 20 }, brazier: { color: '#6a6078', w: 14, h: 18 }, window: { color: '#3a3448', w: 18, h: 32 },
  banner: { color: '#9a2a3a', w: 12, h: 30 }, pillar: { color: '#8a8098', w: 14, h: 48 }, statue: { color: '#8a8a9a', w: 16, h: 34 },
  crate: { color: '#9a6a3a', w: 14, h: 13 }, barrel: { color: '#8a5a32', w: 12, h: 15 }, chest: { color: '#8a4a2a', w: 15, h: 12 },
  pot: { color: '#b0603a', w: 10, h: 11 }, sign: { color: '#9a6a3a', w: 14, h: 16 }, fence: { color: '#9a6a3a', w: 16, h: 11 },
  lamp: { color: '#3a3a4a', w: 9, h: 36 }, door: { color: '#7a4a2a', w: 18, h: 28 }, tree: { color: '#3f8a45', w: 30, h: 40 },
  pine: { color: '#2f6a4a', w: 20, h: 38 }, bush: { color: '#4a9a4a', w: 16, h: 11 }, flowers: { color: '#e05a8a', w: 12, h: 7 },
  grass: { color: '#5aa04a', w: 10, h: 6 }, rock: { color: '#8a8490', w: 13, h: 9 }, crystal: { color: '#6ad8f0', w: 11, h: 16 },
  bones: { color: '#e8e0d0', w: 13, h: 5 }, skull: { color: '#e8e0d0', w: 7, h: 7 },
  vines: { color: '#3a8a3a', w: 14, h: 34 }, cobweb: { color: '#c8c8d8', w: 16, h: 16 }, lantern: { color: '#d8402a', w: 9, h: 14 },
  streetlamp: { color: '#2a2a3a', w: 14, h: 52 }, awning: { color: '#c83a3a', w: 32, h: 12 }, hydrant: { color: '#d83a2a', w: 9, h: 14 },
  trashcan: { color: '#7a8a8a', w: 11, h: 14 }, firedrum: { color: '#6a5a50', w: 12, h: 24 }, sandbags: { color: '#b0a070', w: 24, h: 12 },
  cactus: { color: '#4a9a4a', w: 14, h: 28 }, palm: { color: '#3a9a4a', w: 34, h: 44 }, mushroom: { color: '#d83a3a', w: 14, h: 14 }
};
const _props = new Map();
function drawFlame(g, cx, by, w, h, f, hot = '#fff4c0', mid = '#ffc040', out = '#ff6a20') {
  const sway = Math.sin(f * 1.7) * w * .18, tipX = cx + sway, tipY = by - h * (.85 + .15 * Math.sin(f * 2.3));
  px.poly(g, [[cx - w / 2, by], [tipX, tipY], [cx + w / 2, by]], out);
  px.disc(g, cx, by - h * .22, w * .45, out);
  px.poly(g, [[cx - w * .3, by], [tipX * .6 + cx * .4, by - h * .62], [cx + w * .3, by]], mid);
  px.disc(g, cx, by - h * .18, Math.max(.5, w * .22), hot);
}
/** build (and cache) a prop: { frames: [sprite], glow: [sprite] | null, w, h } */
function prop(name, o = {}) {
  const d = PROP_DEFAULTS[name];
  if (!d) { warn('prop:' + name, 'unknown prop "' + name + '". Props: ' + Object.keys(PROP_DEFAULTS).join(', ')); return null; }
  const size = (o.size || 1) * (E.style.propSize || 1), color = o.color || d.color, key = name + ':' + size + ':' + color + ':' + (o.colors || '') + ':' + (o.variant || 0) + ':' + (o.open ? 1 : 0) + (o.broken ? 1 : 0) + ':' + (o.color2 || '') + ':' + (o.blossom || '') + ':' + (o.emblem || '') + ':' + (o.berries || '') + ':' + (o.flame || '') + (o.flameOut || '');
  let p = _props.get(key); if (p) return p;
  const W = Math.max(3, Math.round(d.w * size)), H = Math.max(3, Math.round(d.h * size)), t = tones(color), rnd = rng((o.variant || 0) * 97 + name.length * 13);
  const make = (fn) => { const c = mkCanvas(W, H), g = ctx2d(c); fn(g); return c; };
  const toSprite = c => { const g = c.getContext('2d'), data = g.getImageData(0, 0, W, H).data, runs = [], fl = mkCanvas(W, H), fg = ctx2d(fl); fg.save(); fg.scale(-1, 1); fg.drawImage(c, -W, 0); fg.restore(); for (let y = 0; y < H; y++) for (let x = 0; x < W;) { if (!data[(y * W + x) * 4 + 3]) { x++; continue; } let n = 1; while (x + n < W && data[(y * W + x + n) * 4 + 3]) n++; runs.push([x, y, n, 1]); x += n; } let mx = 0, my = 0; for (const r0 of runs) { mx += r0[0] + r0[2] / 2; my += r0[1]; } return { w: W, h: H, cv: c, fl, runs, isSprite: true, mx: runs.length ? mx / runs.length : W / 2, my: runs.length ? my / runs.length : H / 2 }; };
  const cx = W / 2, s = size, flames = [];
  const base = make(g => {
    switch (name) {
      case 'torch': px.rect(g, cx - 1.5 * s, H * .45, 3 * s, H * .55, t.sh); px.rect(g, cx - 1.5 * s, H * .45, 1 * s, H * .55, t.base); px.rect(g, cx - 3 * s, H * .42, 6 * s, 2 * s, tones('#8a8090').base); flames.push([cx, H * .43, 5 * s, H * .42]); break;
      case 'candle': px.rect(g, cx - 1.5 * s, H * .45, 3 * s, H * .55, t.base); px.rect(g, cx + .5 * s, H * .45, 1 * s, H * .55, t.sh); px.rect(g, cx - 1.5 * s, H * .45, 3 * s, 1, t.hi); px.rect(g, cx - .5, H * .38, 1, H * .08, '#3a2a2a'); flames.push([cx, H * .4, 3 * s, H * .38]); break;
      case 'candelabra': { px.rect(g, cx - 1, H * .35, 2, H * .6, t.base); px.rect(g, cx - 4 * s, H - 2 * s, 8 * s, 2 * s, t.sh); px.rect(g, cx - 6 * s, H * .45, 12 * s, 1.5 * s, t.base); for (const dx of [-6, 0, 6]) { px.rect(g, cx + dx * s - 1, H * .32, 2, H * .14, '#e8dcc0'); flames.push([cx + dx * s, H * .31, 3 * s, H * .3]); } px.dot(g, cx - 1, H * .5, t.hi); break; }
      case 'chandelier': { px.rect(g, cx - .5, 0, 1, H * .35, t.sh); px.ell(g, cx, H * .55, W * .46, 2 * s, t.sh); px.ell(g, cx, H * .52, W * .44, 1.2 * s, t.base); for (const dx of [-11, -5.5, 0, 5.5, 11]) { px.rect(g, cx + dx * s - 1, H * .38, 2, H * .14, '#e8dcc0'); flames.push([cx + dx * s, H * .37, 3 * s, H * .34]); } for (const dx of [-8, 0, 8]) px.dot(g, cx + dx * s, H * .62 + 2, tones('#bfe8ff').lt); break; }
      case 'brazier': { const bt = tones('#6a6078'); px.poly(g, [[cx - W * .45, H * .45], [cx + W * .45, H * .45], [cx + W * .3, H * .65], [cx - W * .3, H * .65]], bt.sh); px.rect(g, cx - W * .45, H * .45, W * .9, 1, bt.lt); px.rect(g, cx - 1.5 * s, H * .65, 3 * s, H * .3, bt.base); px.rect(g, cx - 4 * s, H - 2 * s, 8 * s, 2 * s, bt.sh); flames.push([cx, H * .47, W * .7, H * .46]); break; }
      case 'window': {   // gothic stained glass: a rose of radial panes in the arch, lancets below, dark lead cames, a stone frame
        const cols = o.colors || ['#d8404a', '#4a7ad8', '#e8c04a', '#4ac070', '#9a5ad8'], lead = '#140e1c', ac = Math.max(H * .3, W / 2), ar = (W - 4) / 2;
        px.rect(g, 0, ac, W, H - ac, t.sh); px.disc(g, cx, ac, W / 2 - .35, t.sh); px.rect(g, 0, ac, 1, H - ac, t.lt);
        for (let y = 2; y < H - 3; y++) for (let x = 2; x < W - 2; x++) {
          const dx = x + .5 - cx, dy = y + .5 - ac, d = Math.hypot(dx, dy);
          let c;
          if (d < ar - .6) {   // the rose: 12 sectors in 3 rings, a gold boss in the middle
            const a = (Math.atan2(dy, dx) + TAU) % TAU, sec = a / TAU * 12, ring = d / (ar - .6) * 3;
            if (d < Math.max(1.2, ar * .22)) c = d < ar * .12 ? '#fff6c8' : '#e8b840';
            else if (Math.abs(sec - Math.round(sec)) * d < .55 || Math.abs(ring - Math.round(ring)) * ar / 3 < .45) c = lead;
            else { const pc = cols[(Math.floor(sec) + Math.floor(ring) * 5) % cols.length]; c = ring < 1.6 ? shade(pc, .25) : pc; }
          } else if (y < ac) continue;                  // outside the arch
          else if (y < ac + ar) c = t.base;             // carved stone beside the rose
          else {                                        // three lancets with lead cames
            const lx = (x - 2) / (W - 4) * 3, li = Math.floor(lx), row = Math.floor((y - ac - ar) / 4);
            c = (lx - li) * (W - 4) / 3 < 1 || (y - ac - ar) % 4 === 0 ? lead : cols[(li * 2 + row + 1) % cols.length];
          }
          px.dot(g, x, y, c);
        }
        px.rect(g, 1, H - 3, W - 2, 3, t.base); px.rect(g, 1, H - 3, W - 2, 1, t.lt); break; }
      case 'banner': { const bt = tones(color); px.rect(g, 0, 0, W, 2 * s, tones('#c8a040').base); px.poly(g, [[1, 2 * s], [W - 1, 2 * s], [W - 1, H], [cx, H - 5 * s], [1, H]], bt.base); px.rect(g, 1, 2 * s, 2, H - 4 * s, bt.lt); px.rect(g, W - 3, 2 * s, 2, H - 4 * s, bt.sh); const et = tones(o.emblem || '#e8c04a'); px.disc(g, cx, H * .42, W * .22, et.base); px.disc(g, cx - .5, H * .42 - .5, W * .12, et.lt); break; }
      case 'pillar': if (o.broken) { const top = H * .35; px.poly(g, [[2, top + 4 * s], [cx - 2, top], [cx + 1, top + 3 * s], [W - 2, top - 2 * s], [W - 2, H - 5 * s], [2, H - 5 * s]], t.base); for (let x = 3; x < W - 3; x += 3) px.rect(g, x, top + 4 * s, 1, H - top - 9 * s, t.sh); px.rect(g, 2, top + 4 * s, 2, H - top - 9 * s, t.lt); px.rect(g, W - 4, top, 2, H - top - 5 * s, t.deep); px.rect(g, 0, H - 5 * s, W, 2 * s, t.base); px.rect(g, 1, H - 3 * s, W - 2, 3 * s, t.sh); px.ell(g, W - 2, H - 2, 3 * s, 1.5 * s, t.sh); px.dot(g, 1, H - 2, t.lt); break; }
        { px.rect(g, 1, 0, W - 2, 4 * s, t.lt); px.rect(g, 0, 3 * s, W, 2 * s, t.base); px.rect(g, 2, 5 * s, W - 4, H - 10 * s, t.base); for (let x = 3; x < W - 3; x += 3) px.rect(g, x, 5 * s, 1, H - 10 * s, t.sh); px.rect(g, 2, 5 * s, 2, H - 10 * s, t.lt); px.rect(g, W - 4, 5 * s, 2, H - 10 * s, t.deep); px.rect(g, 0, H - 5 * s, W, 2 * s, t.base); px.rect(g, 1, H - 3 * s, W - 2, 3 * s, t.sh); break; }
      case 'statue': { px.rect(g, 1, H - 7 * s, W - 2, 7 * s, t.sh); px.rect(g, 1, H - 7 * s, W - 2, 1, t.lt); px.disc(g, cx, H * .18, 3.2 * s, t.base); px.poly(g, [[cx - 5 * s, H * .3], [cx + 5 * s, H * .3], [cx + 4 * s, H - 7 * s], [cx - 4 * s, H - 7 * s]], t.base); px.rect(g, cx + 2 * s, H * .3, 2 * s, H * .5, t.sh); px.line(g, cx + 6 * s, H * .05, cx + 5 * s, H - 8 * s, t.lt, Math.max(1, Math.round(s))); px.disc(g, cx - 1, H * .17, 1.4 * s, t.lt); break; }
      case 'crate': { px.rect(g, 0, 0, W, H, t.base); px.rect(g, 0, 0, W, 2, t.lt); px.rect(g, 0, H - 2, W, 2, t.sh); px.rect(g, 0, 0, 2, H, t.lt); px.rect(g, W - 2, 0, 2, H, t.sh); px.line(g, 2, 2, W - 3, H - 3, t.sh, 2); px.line(g, 2, 3, W - 3, H - 2, t.lt); break; }
      case 'barrel': { px.ell(g, cx, H / 2, W / 2 - .3, H / 2 - .3, t.base); px.rect(g, 1, 2, W - 2, H - 4, t.base); px.rect(g, 2, 2, 2, H - 4, t.lt); px.rect(g, W - 4, 2, 2, H - 4, t.sh); const hb = tones('#6a6a78'); for (const y of [2, H / 2, H - 4]) px.rect(g, 1, y, W - 2, 1.5, hb.base); px.ell(g, cx, 2, W / 2 - 1, 1.5, t.sh); break; }
      case 'chest': if (o.open) { px.rect(g, 1, 0, W - 2, H * .42, t.deep); px.rect(g, 2, 1, W - 4, H * .34, t.sh); px.rect(g, 1, 0, W - 2, 1, t.lt); const gt = tones('#e8c04a'); px.ell(g, cx, H * .4, W / 2 - 2, H * .1, gt.base); for (let i = 0; i < 4; i++) px.dot(g, 3 + rnd() * (W - 6), H * (.34 + rnd() * .1), gt.hi); }
        else px.ell(g, cx, H * .35, W / 2 - .3, H * .3, t.lt);
        { px.rect(g, 0, H * .35, W, H * .65, t.base); px.rect(g, 0, H * .35, W, 1, t.sh); const mt = tones('#e8c04a'); px.rect(g, 0, H * .35, 2, H * .65, mt.sh); px.rect(g, W - 2, H * .35, 2, H * .65, mt.sh); px.rect(g, cx - 1.5, H * .4, 3, 3, mt.lt); px.rect(g, 0, H - 2, W, 2, t.sh); break; }
      case 'pot': { px.ell(g, cx, H * .6, W / 2 - .3, H * .4 - .3, t.base); px.rect(g, cx - W * .25, 0, W * .5, H * .25, t.base); px.rect(g, cx - W * .3, 0, W * .6, 1.5, t.lt); px.ell(g, cx - W * .15, H * .5, W * .15, H * .15, t.lt); px.ell(g, cx + W * .2, H * .7, W * .12, H * .15, t.sh); break; }
      case 'sign': { px.rect(g, cx - 1, H * .4, 2, H * .6, t.sh); px.rect(g, 0, 0, W, H * .5, t.base); px.rect(g, 0, 0, W, 1, t.lt); px.rect(g, 0, H * .5 - 1, W, 1, t.sh); for (let y = 3; y < H * .45; y += 2) px.rect(g, 3, y, W - 6 - (y % 3) * 2, 1, t.deep); break; }
      case 'fence': { for (const x of [1, cx - 1, W - 3]) { px.rect(g, x, 0, 2, H, t.base); px.rect(g, x, 0, 1, H, t.lt); } px.rect(g, 0, H * .25, W, 2, t.base); px.rect(g, 0, H * .65, W, 2, t.base); px.rect(g, 0, H * .25 + 1, W, 1, t.sh); break; }
      case 'lamp': { const lt = tones('#3a3a4a'); px.rect(g, cx - 1, H * .25, 2, H * .75, lt.base); px.rect(g, cx - 3, H - 3, 6, 3, lt.sh); px.rect(g, cx - 3, H * .12, 6, H * .16, lt.sh); px.rect(g, cx - 2, H * .14, 4, H * .12, '#ffe8a0'); px.rect(g, cx - 4, H * .1, 8, 2, lt.base); flames.push(null); break; }
      case 'door': if (o.open) { const st = tones('#6a6078'); px.rect(g, 0, H * .3, W, H * .7, st.sh); px.disc(g, cx, H * .32, W / 2 - .35, st.sh); px.rect(g, 2, H * .32, W - 4, H * .68, '#0c0a14'); px.disc(g, cx, H * .33, W / 2 - 2.3, '#0c0a14'); px.rect(g, 3, H - 3, W - 6, 3, '#2a2030'); px.rect(g, 2, H * .3, 3, H * .7, t.base); px.rect(g, 2, H * .3, 1, H * .7, t.lt); break; }
        { px.rect(g, 0, H * .3, W, H * .7, t.deep); px.disc(g, cx, H * .32, W / 2 - .35, t.deep); px.rect(g, 2, H * .32, W - 4, H * .68, t.base); px.disc(g, cx, H * .33, W / 2 - 2.3, t.base); for (let x = 5; x < W - 3; x += 4) px.rect(g, x, H * .15, 1, H * .85, t.sh); const mt = tones('#5a5a6a'); px.rect(g, 2, H * .45, W - 4, 1.5, mt.base); px.rect(g, 2, H * .8, W - 4, 1.5, mt.base); px.disc(g, W - 5, H * .62, 1.2, tones('#e8c04a').lt); break; }
      case 'tree': { const tr = tones('#6a4a2a'); px.rect(g, cx - 2 * s, H * .55, 4 * s, H * .45, tr.base); px.rect(g, cx - 2 * s, H * .55, 1, H * .45, tr.lt); px.rect(g, cx + s, H * .55, 1, H * .45, tr.sh);
        const blobs = [[0, .3, .36], [-.28, .42, .26], [.28, .42, .26], [-.14, .18, .24], [.16, .2, .22]];
        for (const [bx, by, br] of blobs) { px.disc(g, cx + bx * W, H * by, br * W, t.sh); } for (const [bx, by, br] of blobs) { px.disc(g, cx + bx * W - 1, H * by - 1, br * W - 1.5, t.base); px.disc(g, cx + bx * W - br * W * .35, H * by - br * W * .35, br * W * .45, t.lt); }
        for (let i = 0; i < 12; i++) px.dot(g, cx + (rnd() - .5) * W * .7, H * (.12 + rnd() * .45), rnd() < .5 ? t.hi : t.deep); break; }
      case 'pine': { const tr = tones('#5a3a24'); px.rect(g, cx - 1.5 * s, H * .8, 3 * s, H * .2, tr.base); for (let i = 0; i < 4; i++) { const y0 = H * (.05 + i * .2), y1 = y0 + H * .32, w2 = W * (.25 + i * .09); px.poly(g, [[cx, y0], [cx + w2, y1], [cx - w2, y1]], t.sh); px.poly(g, [[cx, y0 + 1], [cx, y1 - 1], [cx - w2 + 2, y1 - 1]], t.base); px.line(g, cx - 1, y0 + 2, cx - w2 * .6, y1 - 2, t.lt); } break; }
      case 'bush': { for (const [bx, by, br] of [[-.25, .6, .32], [.25, .6, .32], [0, .45, .38]]) px.disc(g, cx + bx * W, H * by, br * W, t.sh); for (const [bx, by, br] of [[-.25, .6, .32], [.25, .6, .32], [0, .45, .38]]) { px.disc(g, cx + bx * W - 1, H * by - 1, br * W - 1.4, t.base); px.dot(g, cx + bx * W - br * W * .4, H * by - br * W * .4, t.lt); } if (o.berries) for (let i = 0; i < 4; i++) px.dot(g, cx + (rnd() - .5) * W * .7, H * (.4 + rnd() * .4), o.berries); break; }
      case 'flowers': { const gt = tones('#4a9a4a'); for (let i = 0; i < 5; i++) { const x = 1 + rnd() * (W - 2), y = 1 + rnd() * (H - 3); px.line(g, x, y, x + (rnd() - .5) * 2, H, gt.base); const ft = tones(i % 2 ? color : (o.color2 || '#f0e060')); px.dot(g, x - 1, y, ft.base); px.dot(g, x + 1, y, ft.base); px.dot(g, x, y - 1, ft.base); px.dot(g, x, y + 1, ft.sh); px.dot(g, x, y, ft.hi); } break; }
      case 'grass': { for (let i = 0; i < 7; i++) { const x = 1 + i * (W - 2) / 6, hh = H * (.5 + rnd() * .5); px.line(g, x, H, x + (rnd() - .5) * 3, H - hh, i % 2 ? t.base : t.lt); } break; }
      case 'rock': { px.ell(g, cx, H * .6, W / 2 - .3, H * .45, t.sh); px.ell(g, cx - 1, H * .52, W / 2 - 1.5, H * .38, t.base); px.ell(g, cx - W * .18, H * .38, W * .18, H * .15, t.lt); px.dot(g, cx + W * .2, H * .6, t.deep); break; }
      case 'crystal': { for (const [dx, hh, w2] of [[-3, .7, 2.5], [3, .6, 2.2], [0, 1, 3]]) { px.poly(g, [[cx + dx * s - w2 * s, H], [cx + dx * s, H * (1 - hh)], [cx + dx * s + w2 * s, H]], t.base); px.poly(g, [[cx + dx * s - w2 * s, H], [cx + dx * s, H * (1 - hh)], [cx + dx * s, H]], t.lt); px.dot(g, cx + dx * s - 1, H * (1 - hh) + 2, t.hi); } flames.push(null); break; }
      case 'bones': { px.line(g, 1, H - 2, W - 2, 1, t.base, 2); px.line(g, 1, 1, W - 3, H - 1, t.sh, 2); px.disc(g, 1, H - 2, 1.2, t.lt); px.disc(g, W - 2, 1, 1.2, t.lt); break; }
      case 'vines': { for (let k = 0; k < 3; k++) { const x0 = W * (.2 + k * .3), len = H * (.55 + rnd() * .45); for (let y = 0; y < len; y++) { const x = x0 + Math.sin(y * .3 + k * 2) * 1.5 * s; px.dot(g, x, y, t.deep); if ((y + k * 2) % Math.max(3, Math.round(4 * s)) === 0) { const sd = (y >> 2) & 1 ? 1 : -1; px.ell(g, x + sd * 2 * s, y, 1.8 * s, 1.1 * s, t.base); px.dot(g, x + sd * 2 * s - .5, y - .5, t.lt); } } if (o.blossom) px.disc(g, x0, len - 1, 1.2 * s, o.blossom); } break; }
      case 'cobweb': { for (let k = 0; k <= 4; k++) { const a = k / 4 * Math.PI / 2; px.line(g, 0, 0, Math.cos(a) * (W - 1), Math.sin(a) * (H - 1), t.base); } for (let rr = 4 * s; rr < W; rr += 4 * s) for (let k = 0; k < 4; k++) { const a0 = k / 4 * Math.PI / 2, a1 = (k + 1) / 4 * Math.PI / 2, am = (a0 + a1) / 2, sg = .84; px.line(g, Math.cos(a0) * rr, Math.sin(a0) * rr, Math.cos(am) * rr * sg, Math.sin(am) * rr * sg, t.sh); px.line(g, Math.cos(am) * rr * sg, Math.sin(am) * rr * sg, Math.cos(a1) * rr, Math.sin(a1) * rr, t.sh); } break; }
      case 'lantern': { px.rect(g, cx - .5, 0, 1, 2 * s, '#2a2024'); px.rect(g, cx - 2 * s, 2 * s, 4 * s, 1.5 * s, '#2a2024'); px.ell(g, cx, H * .55, W / 2 - .3, H * .36, t.base); px.ell(g, cx - 1, H * .52, W * .28, H * .28, t.lt); px.ell(g, cx - 1.5, H * .48, W * .12, H * .16, '#fff0c0'); for (const y of [H * .35, H * .55, H * .75]) px.rect(g, cx - W * .38, y, W * .76, 1, t.sh); px.rect(g, cx - 2 * s, H - 2 * s, 4 * s, 1.5 * s, '#2a2024'); flames.push(null); break; }
      case 'streetlamp': { px.rect(g, cx - s, H * .15, 2 * s, H * .85, t.base); px.rect(g, cx - s, H * .15, 1, H * .85, t.lt); px.rect(g, cx - 3 * s, H - 4 * s, 6 * s, 4 * s, t.sh); px.rect(g, cx - 3 * s, H - 4 * s, 6 * s, 1, t.lt); px.rect(g, cx - 2 * s, H * .6, 4 * s, 2, t.sh); px.rect(g, cx - 5 * s, H * .06, 10 * s, 2 * s, t.sh); px.rect(g, cx - 5 * s, H * .06, 10 * s, 1, t.lt); px.poly(g, [[cx - 4 * s, H * .06 + 2 * s], [cx + 4 * s, H * .06 + 2 * s], [cx + 2.5 * s, H * .17], [cx - 2.5 * s, H * .17]], '#ffe8a0'); px.rect(g, cx - 1.5 * s, H * .06 + 2 * s, 3 * s, 2 * s, '#fffbe8'); px.rect(g, cx - .5, 0, 1, H * .06, t.sh); flames.push(null); break; }
      case 'awning': { const c2 = tones(o.color2 || '#f0e8d8'), sw = Math.max(3, Math.round(4 * s)); for (let x = 0, i = 0; x < W; x += sw, i++) { const st = i & 1 ? c2 : t; px.rect(g, x, 2 * s, sw, H - 5 * s, st.base); px.rect(g, x, 2 * s, sw, 1.5, st.lt); px.disc(g, x + sw / 2, H - 3.2 * s, sw / 2, st.base); px.rect(g, x + sw - 1, 2 * s, 1, H - 5 * s, st.sh); } px.rect(g, 0, 0, W, 2 * s, t.deep); px.rect(g, 0, 0, W, 1, tones('#8a8a9a').lt); break; }
      case 'hydrant': { px.rect(g, cx - 3 * s, H * .3, 6 * s, H * .6, t.base); px.rect(g, cx - 3 * s, H * .3, 1.5 * s, H * .6, t.lt); px.rect(g, cx - 2.4 * s, H * .3, .6 * s, H * .6, t.hi); px.rect(g, cx + 1 * s, H * .3, 2 * s, H * .6, t.sh); px.rect(g, cx + 2.2 * s, H * .3, .8 * s, H * .6, t.deep); for (const yy of [H * .62, H * .8]) px.rect(g, cx - 3 * s, yy, 6 * s, Math.max(1, .5 * s), t.sh); px.disc(g, cx, H * .3, 3 * s, t.base); px.dot(g, cx - 1, H * .22, t.hi); px.rect(g, cx - 1, 0, 2, H * .15, t.sh); px.rect(g, 0, H * .45, W, 2.5 * s, t.base); px.rect(g, 0, H * .45 + 2 * s, W, 1, t.sh); px.rect(g, cx - 4 * s, H - 2 * s, 8 * s, 2 * s, t.deep); break; }
      case 'trashcan': { px.poly(g, [[1, H * .2], [W - 1, H * .2], [W - 2, H], [2, H]], t.base); for (let x = 4; x < W - 3; x += 2) px.rect(g, x, H * .28, 1, H * .66, t.sh); px.rect(g, 2, H * .2, 2, H * .8, t.lt); px.rect(g, W - 3, H * .2, 1, H * .8, t.deep); px.rect(g, 0, H * .12, W, 2 * s, t.lt); px.rect(g, 0, H * .12 + 2 * s, W, 1, t.sh); px.rect(g, cx - 1.5, H * .02, 3, H * .1, t.sh); break; }
      case 'firedrum': { const y0 = H * .45, rt = tones('#8a4a2a'); px.rect(g, 1, y0, W - 2, H - y0, t.base); px.rect(g, 1, y0, Math.max(2, W * .22), H - y0, t.lt); px.rect(g, 1 + W * .12, y0, Math.max(1, W * .06), H - y0, t.hi); px.rect(g, W * .66, y0, W * .34 - 1, H - y0, t.sh); px.rect(g, W * .84, y0, W * .16 - 1, H - y0, t.deep); for (let i = 0; i < 6; i++) px.dot(g, 2 + rnd() * (W - 4), y0 + 2 + rnd() * (H - y0 - 3), rnd() < .5 ? rt.base : rt.sh); for (const y of [y0 + 3, H - 4]) px.rect(g, 1, y, W - 2, 1, t.deep); px.ell(g, cx, y0, W / 2 - 1, 1.5, '#1a0c08'); flames.push([cx, y0 + 1, W * .85, H * .5]); break; }
      case 'sandbags': { const bw = 8 * s, bh = 4 * s; for (let row = 0; row < 3; row++) { const y = H - bh * (row + .5) - .5, off = row & 1 ? bw / 2 : 0; for (let x = off + bw / 2; x + bw / 2 <= W - off + .5; x += bw) { px.ell(g, x, y, bw / 2 - .3, bh / 2 + .2, t.sh); px.ell(g, x - .5, y - .5, bw / 2 - 1, bh / 2 - .5, t.base); px.rect(g, x - bw * .25, y - bh * .3, bw * .35, 1, t.lt); } } break; }
      case 'cactus': { const tw = 4 * s, aw = 3 * s, seg = (x0, y0, w, h) => { px.rect(g, x0, y0 + w / 2, w, h - w / 2, t.base); px.disc(g, x0 + w / 2, y0 + w / 2, w / 2, t.base); px.rect(g, x0, y0 + w / 2, 1, h - w / 2, t.lt); px.rect(g, x0 + w - 1, y0 + w / 2, 1, h - w / 2, t.sh); };
        seg(cx - W * .45, H * .3, aw, H * .3); px.rect(g, cx - W * .45, H * .57, W * .45, aw, t.base); px.rect(g, cx - W * .45, H * .57 + aw - 1, W * .45, 1, t.sh);
        seg(cx + W * .45 - aw, H * .18, aw, H * .3); px.rect(g, cx, H * .45, W * .45, aw, t.base); px.rect(g, cx, H * .45 + aw - 1, W * .45, 1, t.sh);
        seg(cx - tw / 2, 0, tw, H); for (let y = 3; y < H - 1; y += 3) px.dot(g, cx + ((y / 3) & 1 ? -1 : 1), y, t.hi); break; }
      case 'palm': { const tr = tones('#8a6a3a'), bend = W * .12, tx = cx + bend * .7, ty = H * .16;
        for (let y = Math.floor(ty); y < H; y++) { const u = (y - ty) / (H - ty), x = cx + bend * (1 - u) * (1 - u) - bend * .3, w2 = (1.4 + u) * s; px.rect(g, x - w2, y, w2 * 2, 1, ((y / (3 * s)) | 0) & 1 ? tr.base : tr.sh); px.dot(g, x - w2, y, tr.lt); }
        for (const [a, l] of [[-2.9, .5], [-2.4, .44], [-1.9, .3], [-1.1, .34], [-.5, .46], [.05, .5]]) { const exx = tx + Math.cos(a) * W * l, eyy = ty + Math.sin(a) * H * .1 + H * .14; for (let k = 0; k <= 9; k++) { const u = k / 9, x = lerp(tx, exx, u), y = lerp(ty, eyy, u) - Math.sin(u * Math.PI) * H * .08; px.disc(g, x, y, Math.max(.6, (2.3 - u * 1.6) * s), u < .45 ? t.base : t.sh); px.dot(g, x, y - 1, t.lt); } }
        px.disc(g, tx - 1, ty + 2 * s, 1.6 * s, tones('#5a3a1a').base); px.disc(g, tx + 1.5 * s, ty + 2.5 * s, 1.4 * s, tones('#5a3a1a').sh); break; }
      case 'mushroom': { const st = tones('#f0e4c8'); px.rect(g, cx - 2 * s, H * .45, 4 * s, H * .55, st.base); px.rect(g, cx + s, H * .45, s, H * .55, st.sh); px.ell(g, cx, H * .42, W / 2 - .3, H * .3, t.sh); px.ell(g, cx, H * .38, W / 2 - 1, H * .28, t.base); px.ell(g, cx - W * .15, H * .28, W * .18, H * .1, t.lt); for (const [dx, dy, rr] of [[-.25, .36, .1], [.2, .25, .08], [.08, .44, .07]]) px.disc(g, cx + dx * W, H * dy, rr * W, '#f8f0e0'); break; }
      case 'skull': { px.disc(g, cx, H * .42, W / 2 - .6, t.base); px.rect(g, cx - W * .3, H * .6, W * .6, H * .38, t.base); px.dot(g, cx - 1.5, H * .45, t.deep); px.dot(g, cx + 1, H * .45, t.deep); px.rect(g, cx - 1, H - 2, 1, 2, t.sh); px.rect(g, cx + 1, H - 2, 1, 2, t.sh); px.dot(g, cx - 1.5, H * .25, t.hi); break; }
    }
  });
  const frames = [toSprite(base)];
  let glow = null;
  if (flames.length && flames.some(Boolean)) {
    glow = [];
    for (let f = 0; f < 4; f++) glow.push(toSprite(make(g => { for (const fl of flames) if (fl) drawFlame(g, fl[0], fl[1], fl[2], fl[3], f * 1.6 + fl[0], '#fff6d0', o.flame || '#ffc040', o.flameOut || '#ff6a20'); })));
  }
  const GLOW_AT = { lamp: [.5, .2, '#ffe8a0'], streetlamp: [.5, .13, '#ffe8a0'], lantern: [.5, .55, t.lt], crystal: [.5, .6, color] };
  p = { glowAt: GLOW_AT[name] || null, frames, glow, w: W, h: H, emissive: name === 'lamp' || name === 'crystal' || name === 'window' || name === 'lantern' || name === 'streetlamp', light: flames.length ? (name === 'crystal' ? color : name === 'lantern' ? t.lt : name === 'streetlamp' ? '#ffe0a0' : name === 'window' ? null : '#ffb060') : null };
  _props.set(key, p);
  return p;
}
E.prop = prop;
E.PROPS = Object.keys(PROP_DEFAULTS);

/* =============================================================================
 * 21. UI  window frames, bars, hearts, dialog boxes and menus (all pixel-drawn,
 *    drawn in the overlay layer so they are never lit or covered)
 * ============================================================================= */
let _hearts = null;
const heartSprites = () => _hearts || (_hearts = {
  full: sprite(['.RR.RR.', 'RWRRRRR', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'], { R: '#e8384a', W: '#ffd0d6' }),
  half: sprite(['.RR.DD.', 'RWRDDDD', 'RRRDDDD', '.RRDDD.', '..RDD..', '...D...'], { R: '#e8384a', W: '#ffd0d6', D: '#3a1826' }),
  empty: sprite(['.DD.DD.', 'DDDDDDD', 'DDDDDDD', '.DDDDD.', '..DDD..', '...D...'], { D: '#3a1826' })
});
E.ui = {
  /**
   * window frame: ui.box(g, x, y, w, h, { bg, border, shadow, gradient })
   * bg: one color (drawn as a soft top-to-bottom gradient, like Final Fantasy windows) or [top, bottom] colors.
   * gradient: false for a flat fill.
   */
  box(g, x, y, w, h, o = {}) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const bg = o.bg || '#141a3a', bd = o.border || '#e8e4ff', sh = o.shadow === undefined ? '#05040a' : o.shadow;
    if (o.alpha !== undefined && o.alpha < 1) {   // see-through window: translucent fill inside an opaque 1 px frame
      const c0 = Array.isArray(bg) ? bg[0] : bg, c1 = Array.isArray(bg) ? bg[bg.length - 1] : shade(bg, -.3);
      px.blend(g, o.alpha, 'normal', () => { for (let i = 1; i < h - 1; i++) px.rect(g, x + 1, y + i, w - 2, 1, mix(c0, c1, Math.round((i - 1) / Math.max(1, h - 3) * 7) / 7)); });
      px.rect(g, x + 1, y, w - 2, 1, bd); px.rect(g, x + 1, y + h - 1, w - 2, 1, bd); px.rect(g, x, y + 1, 1, h - 2, bd); px.rect(g, x + w - 1, y + 1, 1, h - 2, bd);
      return;
    }
    const flat = !Array.isArray(bg) && o.gradient === false, c0 = Array.isArray(bg) ? bg[0] : flat ? bg : shade(bg, .16), c1 = Array.isArray(bg) ? bg[bg.length - 1] : flat ? bg : shade(bg, -.3);
    if (sh) { px.rect(g, x + 2, y + 2, w, h, sh); }
    px.rect(g, x + 1, y, w - 2, h, bd); px.rect(g, x, y + 1, w, h - 2, bd);
    if (flat) { px.rect(g, x + 2, y + 1, w - 4, h - 2, bg); px.rect(g, x + 1, y + 2, w - 2, h - 4, bg); }
    else {
      const bands = []; for (let k = 0; k < 8; k++) bands.push(mix(c0, c1, k / 7));
      for (let i = 1; i < h - 1; i++) { const c = bands[Math.round((i - 1) / Math.max(1, h - 3) * 7)], edge = i === 1 || i === h - 2; px.rect(g, x + (edge ? 2 : 1), y + i, w - (edge ? 4 : 2), 1, c); }
      px.rect(g, x + 2, y + h - 2, w - 4, 1, shade(c1, -.25));
    }
    px.rect(g, x + 2, y + 2, w - 4, 1, shade(c0, .15));
  },
  /** health / magic / boss bar: ui.bar(g, x, y, w, h, 0..1, '#e0463c') */
  bar(g, x, y, w, h, frac, color = '#e0463c', o = {}) {
    const f = Math.round((w - 2) * clamp(frac, 0, 1));
    px.rect(g, x, y, w, h, o.border || '#140b12'); px.rect(g, x + 1, y + 1, w - 2, h - 2, o.bg || '#3a1a26');
    if (f > 0) { px.rect(g, x + 1, y + 1, f, h - 2, color); px.rect(g, x + 1, y + 1, f, 1, shade(color, .35)); }
  },
  /** row of hearts: hp and max in hearts (halves allowed, e.g. 2.5 of 3) */
  hearts(g, x, y, hp, max, o = {}) {
    const H = heartSprites(), per = o.perRow || 10;
    for (let i = 0; i < Math.ceil(max); i++) { const v = hp - i, s = v >= 1 ? H.full : v >= .5 ? H.half : H.empty; px.sprite(g, s, x + (i % per) * 8, y + Math.floor(i / per) * 7); }
  },
  /** label + value, e.g. ui.counter(g, 4, 4, 'RUPEES', 12) */
  counter(g, x, y, label, value, color = '#ffffff', o = {}) { return E.font.text(g, label + ' ' + value, x, y, color, o); }
};

/**
 * Dialog box with a typewriter effect (Zelda, Dragon Quest, Final Fantasy).
 *   const talk = new E.Dialog(game);
 *   talk.say(['Hello, traveler!', 'It is dangerous to go alone.'], { name: 'OLD MAN', onDone() {...} });
 *   talk.say('Buy the shield?', { choices: ['YES', 'NO'], onChoice(i) {...} });
 *   update: if (talk.update(dt)) return;   // true while it is open, so gameplay waits
 *   draw:   talk.draw(r);                  // anywhere in draw (it goes to the overlay)
 * confirm (Enter, Space, J, Z, pad A) finishes the line, then turns the page.
 */
class Dialog {
  constructor(game, o = {}) {
    this.game = game;
    Object.assign(this, { speed: 50, lines: 3, place: 'bottom', color: '#ffffff', nameColor: '#ffd36a', voice: 'text', bg: '#141a3a', border: '#e8e4ff' }, o);
    this.open = false; this.pages = []; this.i = 0; this.shown = 0; this.choice = 0;
  }
  _dims() {
    const W = this.game.W, H = this.game.H, lh = E.font.lineHeight(), w = Math.min(W - 12, 320), P = this.portrait ? this.pSize : 0, h = Math.max(this.lines * lh + 9, P ? P + 8 : 0), tx = P ? P + 12 : 7;
    const pl = this._place || this.place, y = this._y !== undefined ? this._y : pl === 'top' ? 12 : pl === 'middle' ? Math.round((H - h) / 2) : H - h - 6;
    return { x: Math.round((W - w) / 2), y, w, h, lh, tx, P };
  }
  /**
   * open with one string or a list of strings (each starts a new page).
   * opts: { name, onDone, choices, onChoice, portrait: rig (a live close-up of that Humanoid beside the text) or a function (g, x, y, size),
   *         portraitSize: 40, portraitOpts: { zoom, turn, bg } }
   */
  say(text, o = {}) {
    this.portrait = o.portrait || null; this.pSize = o.portraitSize || 40; this.pOpts = o.portraitOpts || {};
    this._place = o.place; this._y = o.y; this._alpha = o.alpha;   // per line: place 'top' | 'middle' | 'bottom', or a pixel y, and a see-through box
    const d = this._dims(), pages = [];
    for (const t of Array.isArray(text) ? text : [text]) { const L = E.font.wrap(String(t), d.w - d.tx - 5); for (let k = 0; k < L.length; k += this.lines) pages.push(L.slice(k, k + this.lines)); }
    this.pages = pages.length ? pages : [['']]; this.i = 0; this.shown = 0; this.open = true; this.choice = 0;
    this.name = o.name || null; this.onDone = o.onDone || null; this.choices = o.choices || null; this.onChoice = o.onChoice || null; this._blip = 0;
    this.auto = o.auto || 0; this.modal = o.modal !== false; this._wait = 0;   // auto: seconds each page stays after typing; modal: false lets play go on (radio chatter)
    return this;
  }
  close() { this.open = false; this.game.input.consumeAll(); }
  get page() { return this.pages[this.i] || []; }
  get pageLen() { return this.page.reduce((a, l) => a + l.length, 0); }
  get typing() { return this.shown < this.pageLen; }
  update(dt) {
    if (!this.open) return false;
    const inp = this.game.input, len = this.pageLen, prev = Math.floor(this.shown);
    this.shown = Math.min(len, this.shown + this.speed * dt);
    if (this.voice && Math.floor(this.shown) > prev && (this._blip++ % 2 === 0)) this.game.audio.sfx(this.voice);
    const last = this.i >= this.pages.length - 1, asking = last && this.choices && !this.typing;
    if (this.auto && !this.choices && !this.typing && (this._wait += dt) >= this.auto) {   // pages turn and the box closes by itself
      this._wait = 0;
      if (last) { this.open = false; if (this.onDone) this.onDone(); } else { this.i++; this.shown = 0; }
      return this.modal && this.open;
    }
    if (!this.modal) return false;
    if (asking) {
      if (inp.repeat('up') || inp.repeat('left')) { this.choice = (this.choice + this.choices.length - 1) % this.choices.length; this.game.audio.sfx('select'); }
      if (inp.repeat('down') || inp.repeat('right')) { this.choice = (this.choice + 1) % this.choices.length; this.game.audio.sfx('select'); }
    }
    if (inp.pressed('confirm')) {
      if (this.typing) this.shown = len;
      else if (!last) { this.i++; this.shown = 0; }
      else { this.close(); this.game.audio.sfx('confirm'); if (this.choices && this.onChoice) this.onChoice(this.choice, this.choices[this.choice]); if (this.onDone) this.onDone(); }
    } else if (asking && inp.pressed('cancel')) { this.choice = this.choices.length - 1; }
    return true;
  }
  draw(r) {
    if (!this.open) return;
    r.overlay(g => {
      const d = this._dims(), ui = E.ui;
      ui.box(g, d.x, d.y, d.w, d.h, { bg: this.bg, border: this.border, alpha: this._alpha });
      if (this.portrait) {
        const px0 = d.x + 5, py0 = d.y + Math.round((d.h - d.P) / 2);
        if (typeof this.portrait === 'function') this.portrait(g, px0, py0, d.P);
        else { this.portrait._talk = this.typing; this.portrait.drawPortrait(g, px0, py0, d.P, Object.assign({ bg: shade(Array.isArray(this.bg) ? this.bg[0] : this.bg, .12), border: this.border, shadow: false }, this.pOpts)); this.portrait._talk = false; }   // the mouth moves while the text types
      }
      if (this.name) { const nw = E.font.width(this.name) + 12, nx = d.x + (this.portrait ? d.tx - 6 : 4); ui.box(g, nx, d.y - 12, nw, 14, { bg: this.bg, border: this.border }); E.font.text(g, this.name, nx + 6, d.y - 9, this.nameColor, { outline: false, shadow: '#05040a' }); }
      let left = Math.floor(this.shown);
      this.page.forEach((line, k) => { const s = line.slice(0, Math.max(0, left)); left -= line.length; if (s) E.font.text(g, s, d.x + d.tx, d.y + 5 + k * d.lh, this.color, { outline: false, shadow: '#05040a' }); });
      const blink = Math.floor(this.game.real * 3) % 2 === 0, last = this.i >= this.pages.length - 1;
      if (!this.typing && !(last && this.choices) && blink) px.poly(g, [[d.x + d.w - 10, d.y + d.h - 6], [d.x + d.w - 5, d.y + d.h - 6], [d.x + d.w - 7.5, d.y + d.h - 3]], this.color);
      if (last && this.choices && !this.typing) {
        const cw = Math.max(...this.choices.map(c => E.font.width(c))) + 20, ch = this.choices.length * d.lh + 7, cx = d.x + d.w - cw - 2, cy = d.y - ch - 2;
        ui.box(g, cx, cy, cw, ch, { bg: this.bg, border: this.border });
        this.choices.forEach((c, k) => { E.font.text(g, c, cx + 13, cy + 4 + k * d.lh, k === this.choice ? this.nameColor : this.color, { outline: false, shadow: '#05040a' }); if (k === this.choice && blink) E.font.text(g, '▸', cx + 5, cy + 4 + k * d.lh, this.nameColor, false); });
      }
    });
  }
}
E.Dialog = Dialog;

/**
 * Menu with a cursor (title screens, pause menus, shops, battle commands).
 *   const menu = new E.Menu(game, ['START', 'OPTIONS', { label: 'CONTINUE', disabled: !save }], { onPick(i, item) {...}, onCancel() {...} });
 *   update: menu.update(dt)      draw: menu.draw(r)
 * opts: { x: 'center' | px, y: 'center' | px, title, box: true, color, pick: '#ffd36a', columns: 1 }
 */
class Menu {
  constructor(game, items, o = {}) {
    this.game = game; this.items = items || []; this.i = 0; this.active = true;
    Object.assign(this, { x: 'center', y: 'center', title: null, box: true, color: '#ffffff', pick: '#ffd36a', dim: '#6a6488', bg: '#141a3a', border: '#e8e4ff', onPick: null, onCancel: null, onMove: null, sound: true }, o);
    this._skip(1);
  }
  _label(it) { return typeof it === 'string' ? it : it.label; }
  _off(it) { return typeof it === 'object' && it.disabled; }
  _skip(dir) { for (let k = 0; k < this.items.length && this._off(this.items[this.i]); k++) this.i = (this.i + dir + this.items.length) % this.items.length; }
  get selected() { return this.items[this.i]; }
  update() {
    if (!this.active || !this.items.length) return false;
    const inp = this.game.input, n = this.items.length, old = this.i;
    if (inp.repeat('up')) { this.i = (this.i + n - 1) % n; this._skip(-1); }
    if (inp.repeat('down')) { this.i = (this.i + 1) % n; this._skip(1); }
    if (this.i !== old) { if (this.sound) this.game.audio.sfx('select'); if (this.onMove) this.onMove(this.i, this.items[this.i]); }
    if (inp.pressed('confirm') && !this._off(this.items[this.i])) { if (this.sound) this.game.audio.sfx('confirm'); inp.consumeAll(); if (this.onPick) this.onPick(this.i, this.items[this.i]); return true; }
    if (inp.pressed('cancel') && this.onCancel) { if (this.sound) this.game.audio.sfx('cancel'); inp.consumeAll(); this.onCancel(); return true; }
    return false;
  }
  draw(r) {
    r.overlay(g => {
      const labels = this.items.map(it => this._label(it)), w = Math.max(E.font.width(this.title || ''), ...labels.map(l => E.font.width(l))) + 22, rowH = E.font.lineHeight() + 2;
      const h = labels.length * rowH + (this.title ? rowH + 3 : 0) + 8;
      const x = this.x === 'center' ? Math.round((r.W - w) / 2) : this.x, y = this.y === 'center' ? Math.round((r.H - h) / 2) : this.y;
      if (this.box) E.ui.box(g, x, y, w, h, { bg: this.bg, border: this.border });
      let yy = y + 5;
      if (this.title) { E.font.text(g, this.title, x + w / 2, yy, this.pick, { align: 'center', outline: false, shadow: '#05040a' }); yy += rowH + 3; }
      const blink = Math.floor(this.game.real * 3) % 2 === 0;
      labels.forEach((l, k) => {
        const sel = k === this.i && this.active, off = this._off(this.items[k]);
        if (sel) px.rect(g, x + 3, yy + k * rowH - 2, w - 6, rowH, shade(Array.isArray(this.bg) ? this.bg[0] : this.bg, .22));
        E.font.text(g, l, x + 14, yy + k * rowH, off ? this.dim : sel ? this.pick : this.color, { outline: false, shadow: '#05040a' });
        if (sel && blink) E.font.text(g, '▸', x + 6, yy + k * rowH, this.pick, false);
      });
    });
  }
}
E.Menu = Menu;

/* =============================================================================
 * 22. GPU LIGHTING (WebGPU)  optional. game.enableGPU({ map }) turns it on.
 *    The Canvas renderer still draws every color. Alongside it, it writes an
 *    "info" image (height, surface type, glow per pixel). The GPU then lights each
 *    pixel: colored point lights, soft shadows marched through a heightmap of the
 *    level, light wrapping around characters (normals from their silhouettes),
 *    glow spilling onto nearby surfaces, dithered light bands, and heat shimmer.
 *    If WebGPU is missing or fails, the game keeps the Canvas lighting.
 * ============================================================================= */
const WGSL_COMMON = /* wgsl */`
struct Params {
  a: vec4f, b: vec4f, c: vec4f, camv: vec4f,
  right: vec4f, up: vec4f, amb: vec4f, fx: vec4f,
  mapd: vec4f, scr: vec4f, scr2: vec4f, bufd: vec4f,
  nheat: vec4f, p0: vec4f, p1: vec4f, p2: vec4f,
  lights: array<vec4f, 64>,
  heat: array<vec4f, 8>,
};
@group(0) @binding(0) var<uniform> U: Params;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[i], 0.0, 1.0);
}
fn bayer(p: vec2i) -> f32 {
  var m = array<f32, 16>(0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  let x = ((p.x % 4) + 4) % 4;
  let y = ((p.y % 4) + 4) % 4;
  return (m[y * 4 + x] + 0.5) / 16.0;
}
`;
const WGSL_LIGHT = /* wgsl */`
@group(0) @binding(1) var albedoT: texture_2d<f32>;
@group(0) @binding(2) var infoT: texture_2d<f32>;
@group(0) @binding(3) var hmT: texture_2d<f32>;
fn clsOf(v: vec4f) -> i32 { return i32(round(v.g * 12.75)); }
fn zOf(v: vec4f) -> f32 { return v.r * 85.0; }
fn hmAt(q: vec2f) -> f32 {
  let d = vec2i(U.mapd.xy);
  let t = clamp(vec2i(floor(q * U.fx.w)), vec2i(0, 0), d - vec2i(1, 1));
  return textureLoad(hmT, t, 0).r * 85.0;
}
fn shadowAt(p: vec3f, l: vec3f) -> f32 {
  let d = l.xy - p.xy;
  let D = length(d);
  if (D < 2.0) { return 1.0; }
  let n = clamp(i32(D * 0.5), 4, 48);
  let t0 = min(0.9, 4.5 / D);
  var s = 1.0;
  for (var k = 0; k < n; k++) {
    let t = mix(t0, 0.97, (f32(k) + 0.5) / f32(n));
    let rz = mix(p.z, l.z, t);
    let h = hmAt(p.xy + d * t);
    let occ = clamp((h - rz) / (0.8 + t * D * 0.05), 0.0, 1.0);
    s = min(s, 1.0 - occ);
    if (s <= 0.0) { break; }
  }
  return s;
}
@fragment fn fsLight(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let pix = vec2i(floor(fc.xy));
  let dims = vec2i(U.bufd.xy);
  let alb = textureLoad(albedoT, pix, 0);
  let inf = textureLoad(infoT, pix, 0);
  let cl = clsOf(inf);
  let wpx = pix + vec2i(i32(U.c.z), i32(U.c.w));
  let dth = bayer(wpx);
  let bands = U.up.w;

  // glow from nearby emissive pixels: lights neighbours and adds a pixel bloom
  var spill = vec3f(0.0);
  var near = vec3f(0.0);
  var rad = array<f32, 5>(3.0, 7.0, 12.0, 19.0, 28.0);
  var wt = array<f32, 5>(0.28, 0.2, 0.14, 0.09, 0.06);
  for (var ri = 0; ri < 5; ri++) {
    for (var k = 0; k < 8; k++) {
      let a = f32(k) * 0.7853982 + f32(ri) * 0.39;
      let q = clamp(pix + vec2i(round(vec2f(cos(a), sin(a)) * rad[ri])), vec2i(0, 0), dims - vec2i(1, 1));
      let e = textureLoad(infoT, q, 0).b;
      if (e > 0.02) { let c = textureLoad(albedoT, q, 0).rgb * e * wt[ri]; spill += c; if (ri < 2) { near += c; } }
    }
  }
  // bloom only from the closest rings, so glows stay tight and pixel-crisp
  let glow = floor(near * U.fx.y * bands + dth) / bands;
  if (cl == 0) { return vec4f(min(alb.rgb + glow, vec3f(1.0)), 1.0); }

  // rebuild the world position of this pixel from its height
  let z = zOf(inf);
  let sx = f32(wpx.x) + 0.5;
  let sy = f32(wpx.y) + 0.5 - U.b.x * z;
  let wp = vec3f(U.b.y * sx + U.b.z * sy, U.b.w * sx + U.c.x * sy, z);

  // surface normal: floors and tops face up, wall faces by class, characters from their silhouette
  var n = vec3f(0.0, 0.0, 1.0);
  if (cl == 5) { n = vec3f(1.0, 0.0, 0.0); }
  else if (cl == 6) { n = vec3f(-1.0, 0.0, 0.0); }
  else if (cl == 7) { n = vec3f(0.0, 1.0, 0.0); }
  else if (cl == 8) { n = vec3f(0.0, -1.0, 0.0); }
  else if (cl == 10) {
    var gs = vec2f(0.0);
    for (var dy = -3; dy <= 3; dy++) {
      for (var dx = -3; dx <= 3; dx++) {
        if (dx == 0 && dy == 0) { continue; }
        let q = clamp(pix + vec2i(dx, dy), vec2i(0, 0), dims - vec2i(1, 1));
        if (clsOf(textureLoad(infoT, q, 0)) != 10) { gs += vec2f(f32(dx), f32(dy)) / f32(dx * dx + dy * dy); }
      }
    }
    let gl = length(gs);
    var ns = vec3f(0.0, 0.0, 1.0);
    if (gl > 0.001) { let e = clamp(gl * 0.5, 0.0, 0.92); let dd = gs / gl; ns = vec3f(dd.x * e, -dd.y * e, sqrt(1.0 - e * e)); }
    n = normalize(U.right.xyz * ns.x + U.up.xyz * ns.y + U.camv.xyz * ns.z);
  }

  // soft sky ambient: up-facing surfaces catch a little more than walls.
  // characters get extra fill and wrap so they stay readable when backlit.
  let actor = cl == 10;
  let wrap = select(U.amb.w, 0.85, actor);
  var light = U.amb.rgb * (0.8 + 0.4 * max(n.z, 0.0)) * select(1.0, 1.7, actor);
  let nl = i32(U.right.w);
  for (var i = 0; i < nl; i++) {
    let lp = U.lights[i * 2];
    let lc = U.lights[i * 2 + 1];
    let d = lp.xyz - wp;
    let dist = length(d);
    if (dist >= lp.w) { continue; }
    let att = 1.0 - dist * dist / (lp.w * lp.w);
    let ndl = dot(n, d / max(dist, 0.001));
    let diff = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
    var sh = 1.0;
    if (lc.w > 0.0 && U.fx.z > 0.5) { sh = shadowAt(wp, lp.xyz); }
    light += lc.rgb * abs(lc.w) * att * diff * sh;
  }
  light += spill * U.fx.x;

  // snap light to dithered bands so it stays pixel art
  let lum = max(light.r, max(light.g, light.b));
  let q = floor(lum * bands + dth) / bands;
  let lq = light * (q / max(lum, 0.0001));
  let col = alb.rgb * max(lq, vec3f(inf.b * 1.15)) + glow;
  return vec4f(min(col, vec3f(1.0)), 1.0);
}
`;
const WGSL_FINAL = /* wgsl */`
@group(0) @binding(1) var litT: texture_2d<f32>;
@group(0) @binding(2) var ovT: texture_2d<f32>;
@fragment fn fsFinal(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = fc.xy;
  if (p.x < U.scr2.x || p.y < U.scr2.y || p.x >= U.scr2.z || p.y >= U.scr2.w) { return vec4f(0.0, 0.0, 0.0, 1.0); }
  let b = floor((p - U.scr.yz) / U.scr.x);
  let dims = vec2i(U.bufd.xy);
  var t = vec2i(b);
  // heat shimmer: whole-pixel sideways offsets above hot things
  var off = 0.0;
  let nh = i32(U.nheat.x);
  for (var i = 0; i < nh; i++) {
    let h = U.heat[i];
    let dy = h.y - b.y;
    let dx = b.x - h.x;
    if (dy > -2.0 && dy < h.z * 1.8 && abs(dx) < h.z) {
      let f = (1.0 - abs(dx) / h.z) * clamp((dy + 2.0) / 5.0, 0.0, 1.0) * (1.0 - dy / (h.z * 1.8));
      off += sin((b.y + U.c.w) * 0.85 + U.camv.w * 10.0 + h.x * 0.37) * h.w * f;
    }
  }
  let wpx = t + vec2i(i32(U.c.z), i32(U.c.w));
  t.x += i32(floor(off + bayer(wpx)));
  t = clamp(t, vec2i(0, 0), dims - vec2i(1, 1));
  let lit = textureLoad(litT, t, 0).rgb;
  let ov = textureLoad(ovT, clamp(vec2i(b), vec2i(0, 0), dims - vec2i(1, 1)), 0);
  return vec4f(mix(lit, ov.rgb, ov.a), 1.0);
}
`;
class GPULighting {
  constructor(game, o = {}) {
    // offscreen: render into a texture instead of the page (automated tests; read it with snapshot())
    Object.assign(this, { enabled: true, ready: false, failed: null, bands: 6, wrap: .45, ambient: [.07, .07, .12], spill: 1.1, glow: .22, shadows: true, map: null, onStatus: null, offscreen: false }, o);
    this.game = game; this.u = new Float32Array(352); this._colors = {};
    this.cv = document.createElement('canvas');
    this.cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:none;pointer-events:none;image-rendering:pixelated';
    game.screen.canvas.insertAdjacentElement('afterend', this.cv);
    this.loading = true;
    this._init();
  }
  static supported() { return typeof navigator !== 'undefined' && !!navigator.gpu; }
  /** 'loading' | 'on' | 'off' | 'unavailable' */
  status() { return this.failed ? 'unavailable' : this.loading ? 'loading' : this.enabled ? 'on' : 'off'; }
  active(view) { return this.ready && this.enabled && !!view.inv; }
  show(on) { const d = on && !this.offscreen ? 'block' : 'none'; if (this.cv.style.display !== d) this.cv.style.display = d; }
  /** offscreen mode only: read the last frame back as a PNG data URL */
  async snapshot() {
    const t = this.outT; if (!t) return null;
    const w = t.width, h = t.height, bpr = Math.ceil(w * 4 / 256) * 256, dev = this.dev;
    const buf = dev.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = dev.createCommandEncoder(); enc.copyTextureToBuffer({ texture: t }, { buffer: buf, bytesPerRow: bpr }, [w, h]); dev.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange()), c = mkCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(src.subarray(y * bpr, y * bpr + w * 4), y * w * 4);
    buf.unmap(); buf.destroy(); g.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }
  fail(e) { this.failed = (e && e.message) || String(e); this.ready = false; this.loading = false; this.show(false); if (this.onStatus) this.onStatus(this); console.warn('my-3D2dge GPU lighting disabled:', this.failed); }
  async _init() {
    try {
      if (!navigator.gpu) throw new Error('WebGPU is not available in this browser');
      const ad = await navigator.gpu.requestAdapter();
      if (!ad) throw new Error('No compatible GPU was found');
      this.adapter = ad; this.adapterInfo = ad.info || null;
      const dev = await ad.requestDevice(); this.dev = dev;
      dev.lost.then(i => { if (!this.failed) this.fail(new Error('GPU device lost: ' + i.message)); });
      dev.addEventListener('uncapturederror', ev => this.fail(ev.error));
      if (this.offscreen) this.fmt = 'rgba8unorm';
      else { this.gctx = this.cv.getContext('webgpu'); this.fmt = navigator.gpu.getPreferredCanvasFormat(); this.gctx.configure({ device: dev, format: this.fmt, alphaMode: 'opaque' }); }
      this.ubuf = dev.createBuffer({ size: this.u.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      dev.pushErrorScope('validation');
      const m1 = dev.createShaderModule({ code: WGSL_COMMON + WGSL_LIGHT }), m2 = dev.createShaderModule({ code: WGSL_COMMON + WGSL_FINAL });
      for (const m of [m1, m2]) { const info = await m.getCompilationInfo(); const err = info.messages.find(x => x.type === 'error'); if (err) throw new Error('Shader: ' + err.message + ' (line ' + err.lineNum + ')'); }
      const pipe = (m, fs, format) => dev.createRenderPipeline({ layout: 'auto', vertex: { module: m, entryPoint: 'vs' }, fragment: { module: m, entryPoint: fs, targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
      this.pLight = pipe(m1, 'fsLight', 'rgba8unorm'); this.pFinal = pipe(m2, 'fsFinal', this.fmt);
      const err = await dev.popErrorScope(); if (err) throw new Error(err.message);
      this.ready = true;
    } catch (e) { this.failed = e.message || String(e); console.warn('my-3D2dge GPU lighting unavailable:', this.failed); }
    this.loading = false;
    if (this.onStatus) this.onStatus(this);
  }
  _tex(w, h, format, usage) { return this.dev.createTexture({ size: [w, h], format, usage }); }
  _ensure(bw, bh, hmW, hmH) {
    const U = GPUTextureUsage;
    if (this.bw !== bw || this.bh !== bh) {
      for (const t of [this.albedoT, this.infoT, this.ovT, this.litT]) if (t) t.destroy();
      const up = U.TEXTURE_BINDING | U.COPY_DST | U.RENDER_ATTACHMENT;
      this.albedoT = this._tex(bw, bh, 'rgba8unorm', up); this.infoT = this._tex(bw, bh, 'rgba8unorm', up); this.ovT = this._tex(bw, bh, 'rgba8unorm', up);
      this.litT = this._tex(bw, bh, 'rgba8unorm', U.TEXTURE_BINDING | U.RENDER_ATTACHMENT);
      this.bw = bw; this.bh = bh; this.bgL = null;
    }
    if (this.hmW !== hmW || this.hmH !== hmH) {
      if (this.hmT) this.hmT.destroy();
      this.hmT = this._tex(hmW, hmH, 'r8unorm', U.TEXTURE_BINDING | U.COPY_DST);
      this.hmData = new Uint8Array(hmW * hmH); this.hmW = hmW; this.hmH = hmH; this.hmKey = null; this.bgL = null;
    }
    if (!this.bgL) {
      const d = this.dev, B = (t) => t.createView();
      this.bgL = d.createBindGroup({ layout: this.pLight.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.ubuf } }, { binding: 1, resource: B(this.albedoT) }, { binding: 2, resource: B(this.infoT) }, { binding: 3, resource: B(this.hmT) }] });
      this.bgF = d.createBindGroup({ layout: this.pFinal.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.ubuf } }, { binding: 1, resource: B(this.litT) }, { binding: 2, resource: B(this.ovT) }] });
    }
  }
  /** heightmap of the level (1 texel per world unit): walls from the map plus this frame's casters */
  _heightmap(view) {
    const m = this.map, W = this.hmW, H = this.hmH, key = view.id + ':' + (m ? m.version : 0);
    if (this.hmKey !== key) {
      this.hmStatic = new Uint8Array(W * H);
      if (m) for (let cy = 0; cy < m.h; cy++) for (let cx = 0; cx < m.w; cx++) {
        const id = m.cell(cx, cy); if (id <= 0) continue;
        const t = m.types[id], h = m._isFront(cx, cy, view) ? (t.cutH || 6) : t.h, v = Math.min(255, Math.round(h * 3));
        for (let y = cy * m.T; y < (cy + 1) * m.T; y++) this.hmStatic.fill(v, y * W + cx * m.T, y * W + (cx + 1) * m.T);
      }
      this.hmKey = key;
    }
    const d = this.hmData; d.set(this.hmStatic);
    for (const c of this.game.lights.casters) {
      const v = Math.min(255, Math.round(c.top * 3)), r2 = c.r * c.r;
      const x0 = Math.max(0, Math.floor(c.x - c.r)), x1 = Math.min(W - 1, Math.ceil(c.x + c.r)), y0 = Math.max(0, Math.floor(c.y - c.r)), y1 = Math.min(H - 1, Math.ceil(c.y + c.r));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const dx = x + .5 - c.x, dy = y + .5 - c.y; if (dx * dx + dy * dy <= r2) { const k = y * W + x; if (d[k] < v) d[k] = v; } }
    }
    this.dev.queue.writeTexture({ texture: this.hmT }, d, { bytesPerRow: W }, [W, H]);
  }
  _color(c) {
    if (!c) return [1, .9, .75];
    if (typeof c !== 'string') return c;
    return this._colors[c] || (this._colors[c] = hex(c).map(v => v / 255));
  }
  render(r) {
    // never queue more than two frames: a slow GPU drops frames instead of building up lag
    if ((this.inflight || 0) >= 2) { this.skipped = (this.skipped || 0) + 1; return; }
    const game = this.game, sc = game.screen, view = r.view, dev = this.dev, bw = r.bw, bh = r.bh, m = this.map;
    if (this.cv.width !== sc.canvas.width || this.cv.height !== sc.canvas.height) { this.cv.width = sc.canvas.width; this.cv.height = sc.canvas.height; }
    this._ensure(bw, bh, m ? m.w * m.T : 1, m ? m.h * m.T : 1);
    this._heightmap(view);
    dev.queue.copyExternalImageToTexture({ source: sc.buf }, { texture: this.albedoT }, [bw, bh]);
    dev.queue.copyExternalImageToTexture({ source: r.iCv }, { texture: this.infoT }, [bw, bh]);
    dev.queue.copyExternalImageToTexture({ source: r.vCv }, { texture: this.ovT, premultipliedAlpha: false }, [bw, bh]);
    const u = this.u, inv = view.inv, S = sc.S, sc_ = view.scale;
    const Rw = [view.ax / sc_, view.ay / sc_, 0], Cw = [view.dx, view.dy, view.dz];
    const Uw = [Rw[1] * Cw[2] - Rw[2] * Cw[1], Rw[2] * Cw[0] - Rw[0] * Cw[2], Rw[0] * Cw[1] - Rw[1] * Cw[0]];
    u.fill(0);
    const L = game.lights.list; let n = 0;
    for (const l of L) {
      if (n >= 32) break; if (!(l.i > 0)) continue;
      const c = this._color(l.color), b = 64 + n * 8;
      u[b] = l.x; u[b + 1] = l.y; u[b + 2] = l.z; u[b + 3] = l.r; u[b + 4] = c[0]; u[b + 5] = c[1]; u[b + 6] = c[2]; u[b + 7] = l.shadow ? l.i : -l.i; n++;
    }
    let nh = 0;
    for (const h of game.lights.heats) { if (nh >= 8) break; const [x, y] = r.w(h.x, h.y, h.z), b = 320 + nh * 4; u[b] = x; u[b + 1] = y; u[b + 2] = h.w * sc_; u[b + 3] = h.s; nh++; }
    u.set([view.ax, view.ay, view.bx, view.by], 0);
    u.set([view.bz, inv[0], inv[1], inv[2]], 4);
    u.set([inv[3], sc_, r.ix, r.iy], 8);
    u.set([Cw[0], Cw[1], Cw[2], game.time], 12);
    u.set([Rw[0], Rw[1], Rw[2], n], 16);
    u.set([Uw[0], Uw[1], Uw[2], this.bands], 20);
    u.set([this.ambient[0], this.ambient[1], this.ambient[2], this.wrap], 24);
    u.set([this.spill, this.glow, this.shadows ? 1 : 0, 1], 28);
    u.set([this.hmW, this.hmH, 0, 0], 32);
    u.set([S, sc.OX - Math.round(sc.fx * S), sc.OY - Math.round(sc.fy * S), 0], 36);
    u.set([sc.OX, sc.OY, sc.OX + sc.W * S, sc.OY + sc.H * S], 40);
    u.set([bw, bh, sc.W, sc.H], 44);
    u.set([nh, 0, 0, 0], 48);
    dev.queue.writeBuffer(this.ubuf, 0, u);
    const enc = dev.createCommandEncoder();
    let pass = enc.beginRenderPass({ colorAttachments: [{ view: this.litT.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    pass.setPipeline(this.pLight); pass.setBindGroup(0, this.bgL); pass.draw(3); pass.end();
    let target;
    if (this.offscreen) {
      const w = this.cv.width, h = this.cv.height;
      if (!this.outT || this.outT.width !== w || this.outT.height !== h) { if (this.outT) this.outT.destroy(); this.outT = this._tex(w, h, 'rgba8unorm', GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC); }
      target = this.outT.createView();
    } else target = this.gctx.getCurrentTexture().createView();
    pass = enc.beginRenderPass({ colorAttachments: [{ view: target, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    pass.setPipeline(this.pFinal); pass.setBindGroup(0, this.bgF); pass.draw(3); pass.end();
    dev.queue.submit([enc.finish()]);
    this.inflight = (this.inflight || 0) + 1; this.frames = (this.frames || 0) + 1;
    dev.queue.onSubmittedWorkDone().then(() => { this.inflight--; });
  }
}
E.GPULighting = GPULighting;

root.My3D2dge = E;
})(typeof window !== 'undefined' ? window : globalThis);
