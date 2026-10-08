/*!
my-3D2dge AGENT EDITION v0.11.0: the essential engine in one file, for AI coding agents
https://github.com/michaelcrosato/my-3d2dge (MIT License)

Retro-modern 2D games drawn entirely by code: no image or sound files, no dependencies, no network.
This is a curated subset of the full engine (dist/my-3d2dge.js). A game written against this file runs
unchanged on the full engine, which adds lighting, props, parallax backdrops, touch controls, camera
zoom and turn, dialog portraits, x-ray silhouettes and more.

AGENTS: this header is the whole manual. Build games from it; you do not need to read the code below.
Read a section only to debug: each starts with "// ---- N. NAME" (grep "// ---- 10." for the Humanoid).

## Host it
<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}
#screen{width:100%;height:100%;display:block;image-rendering:pixelated}</style></head>
<body><canvas id="screen"></canvas><script src="my-3d2dge-agent.js"></script><script src="game.js"></script></body></html>
For a single-file game, paste both scripts inline. Start every game with: const E = My3D2dge;

## Mental model
- The world is 3D: x east, y south, z up; one tile = 16 units. Game logic uses world units and dt, never pixels.
- A view projects the world to the screen. 'iso' (Diablo), 'threequarter' (Zelda), 'topdown', 'brawler' (Final
  Fight), 'side' (Mario: x right, z up, y = 0), 'overhead' (shmups, puzzles: world x/y = screen pixels once you call
  game.focus(W / 2, H / 2)). The same game runs in every view. In ground views, turn the stick or keys into a world
  direction with game.view.screenDirToGround(mx, my).
- update(dt) runs in fixed steps of about 1/120 s. Read input only there.
- draw(r) order: backgrounds first (r.sky, map.drawFloor + map.queueWalls, level.draw), then everything that can
  overlap through r.actor / r.sprite / r.queue (depth sorted), then the HUD through r.text / r.overlay (screen pixels).
- Characters are procedural rigs posed every step (E.Humanoid, E.Blob) or string sprites (E.sprite).
- Draw only with E.px, E.font, E.ui and r.*: they snap to whole pixels. ctx.arc / stroke / fillText and canvas
  gradients blur the pixel look.
- Errors show in a red box on screen and in the console; warnings start with "my-3D2dge:". Fix the first one first.

## Quick start: a complete game (title, play, win or lose)
```js quickstart
(() => {
const E = My3D2dge;
const game = new E.Game({ canvas: 'screen', res: 'ps1', view: 'threequarter', views: ['threequarter', 'iso', 'topdown'] });
const map = new E.TileMap({
  rows: ['################',
         '#@.....#.......#',
         '#......#...s...#',
         '#..s.......##..#',
         '#......~~.....s#',
         '################'],
  legend: { '#': 1, '@': 'hero', s: 'slime', '~': { floor: 'water', block: true } },   // number = wall type, string = spawn tag
  types: { 1: { h: 28, top: '#7a7090', side: '#4a4560', cut: true } },   // cut: walls in front of the floor drop low
  floorTex: (x, y, tag) => tag === 'water' ? E.tex.water(x, y) : E.tex.grass(x, y)
});
const flow = new E.FlowField(map);
let hero, rig, sword, slimes, hp, msg = '';
const title = {
  update() { if (game.input.pressed('start')) game.go('play'); },
  draw(r) {
    r.sky(['#101848', '#5a3a80']);
    r.overlay(g => E.font.title(g, 'SLIME FIELD', r.W / 2, 70, { scale: 3, align: 'center' }));
    r.text('PRESS ENTER', r.W / 2, 150, '#ffffff', { align: 'center', shadow: '#000', outline: false });
  }
};
const play = {
  pausable: true,
  enter() {
    const s = map.find('hero');
    hero = new E.Body({ x: s.x, y: s.y, r: 5 }); hero.facing = 0; hero.hurt = 0; hp = 3;
    rig = new E.Humanoid({ size: 1.3, outfit: 'tunic', hat: 'cap', colors: { cloth: '#3a8a4a', hair: '#e0b040' } });
    sword = new E.Attack('slash');
    slimes = map.findAll('slime').map(p => ({ body: new E.Body({ x: p.x, y: p.y, r: 6 }), rig: new E.Blob(), hp: 3, hit: 0 }));
    game.cam.bounds = v => map.bounds(v); game.follow(hero);
    game.audio.music('adventure');
  },
  update(dt) {
    const inp = game.input, m = inp.move(), d = game.view.screenDirToGround(m[0], m[1]);   // screen push -> ground direction
    hero.vx = d[0] * 85; hero.vy = d[1] * 85; hero.update(dt, map);
    if (Math.hypot(d[0], d[1]) > .1) hero.facing = Math.atan2(d[1], d[0]);
    if (inp.buffered('attack') && sword.start()) { inp.consume('attack'); game.audio.sfx('swing'); }
    sword.update(dt);
    sword.hits(slimes, s => E.inArc(hero, hero.facing, s.body, 24, 1.3), s => {
      s.hp--; s.hit = .15; E.knockback(hero, s.body, 200, 80);
      game.hitFx(s.body.x, s.body.y, 8, { damage: 1, angle: hero.facing });
    });
    flow.update(hero.x, hero.y); hero.hurt -= dt;
    for (const s of slimes) {
      const dir = flow.dir(s.body.x, s.body.y, hero.x, hero.y);
      s.body.vx = E.approach(s.body.vx, dir[0] * 30, 300 * dt); s.body.vy = E.approach(s.body.vy, dir[1] * 30, 300 * dt);
      s.body.update(dt, map); s.hit -= dt;
      s.rig.update(dt, { look: dir, squash: Math.sin(game.time * 9 + s.body.x) * .15 });
      if (E.overlap(hero, s.body) && hero.hurt <= 0) { hp--; hero.hurt = 1; E.knockback(s.body, hero, 220); game.audio.sfx('hurt'); game.shake(3); }
      if (s.hp <= 0) game.particles.explosion(s.body.x, s.body.y, 6, .7);
    }
    E.prune(slimes, s => s.hp <= 0);
    rig.update(dt, { x: hero.x, y: hero.y, z: hero.z, vx: hero.vx, vy: hero.vy, facing: hero.facing, attack: sword.state, hurt: hero.hurt > .7 });
    if (hp <= 0) game.go('end', 'GAME OVER'); else if (!slimes.length) game.go('end', 'YOU WIN');
  },
  draw(r) {
    map.drawFloor(r); map.queueWalls(r);                                   // background first, then depth-sorted things
    r.shadow(hero.x, hero.y, 6);
    r.actor(hero.x, hero.y, hero.z, (g, ox, oy) => rig.draw(g, ox, oy, r.view), { alpha: hero.hurt > 0 ? .6 : 1 });
    for (const s of slimes) {
      r.shadow(s.body.x, s.body.y, 6);
      r.actor(s.body.x, s.body.y, s.body.z, (g, ox, oy) => s.rig.draw(g, ox, oy, r.view), { flash: s.hit > 0 && '#ffffff' });
    }
    r.overlay(g => E.ui.hearts(g, 6, 6, hp, 3));                        // HUD in screen pixels
  }
};
const end = {
  enter(text) { msg = text; game.audio.music(null); game.audio.sfx(text === 'YOU WIN' ? 'powerup' : 'die'); },
  update() { if (game.input.pressed('start')) game.go('title'); },
  draw(r) { r.sky(['#000000', '#301830']); r.text(msg, r.W / 2, 100, '#ffe08a', { align: 'center', scale: 2 }); }
};
game.start({ scene: 'title', scenes: { title, play, end } });
})();
```

## API
Game: new E.Game({ canvas: 'screen', res, view, views, input, bg })
  res: 'nes' 256x240 | 'snes' 256x224 | 'genesis' 320x224 | 'gb' 160x144 | 'gba' 240x160 | 'ps1' 320x240 | 'wide' 400x225 | [w, h]
  input: 'DEFAULT' | 'PLATFORMER' | 'SHMUP' | your own { action: ['KeyQ', 'Pad0', 'Mouse0'] }
  start({ update(dt), draw(r) }) or start({ scene: 'title', scenes: { title: {...}, play: {...} } })
  scene: { enter(data), exit(), update(dt), draw(r), pausable, view, views, input, res }; go(name, data, { fade: .22 })
  camera: follow(obj, { z: 16, lead }) once, or focus(x, y, z) every update; cam.bounds = v => map.bounds(v);
    cam.room = [w, h] for screen-by-screen rooms (cam.moving is true while it slides); cam.smooth = .18 (0 = locked)
  juice: hitFx(x, y, z, { power: 1, damage, angle, color, sound }), freeze(s), shake(n), flash(color, s), timeScale = .25
  timers in game time: after(s, fn), every(s, fn) -> { cancel() }, cleared on scene change
  also: setView(id), nextView() (cycles views), note(text, s), mouseGround() -> [x, y] or null
  fields: W, H, time, real, paused, input, audio, particles, view, cam, errors
Input (game.input): down(a) held, pressed(a) this step only, released(a), repeat(a, delay .3, rate .08) for menus,
  buffered(a, window .15) + consume(a) for combat, consumeAll(), anyPressed(), move() -> [x, y] on screen (length <= 1)
  every preset: up down left right (WASD, arrows, d-pad), start (Enter), pause (Esc, P), confirm (Enter, Space, J, Z),
    cancel (Esc, Backspace, X, K); the gamepad d-pad, A, B and Start work too, and its left stick moves
  DEFAULT: attack (J, X, click), dash (Space, Shift, K), skill (L, E, right click), jump (Z)
  PLATFORMER: jump (Space, Z, K), attack (X, J, click), dash (Shift, C, L), skill (E, V)
  SHMUP: fire (Space, Z, J, click), bomb (X, K, right click)
Drawing (r in draw(r); r.W, r.H = screen size in pixels)
  r.sky(['#top', '#mid', '#bottom']); r.starfield({ count: 70, speed: 30, dir: 'down' | 'up' | 'left' | 'right', height: 0..1 })
  r.actor(x, y, z, (g, ox, oy) => rig.draw(g, ox, oy, r.view), { outline: true, flash: '#ffffff', flashMix: .5, alpha, bias })
  r.sprite(x, y, z, spr, { anchor: 'bottom' | 'center' | 'top', flip, flash, outline, alpha })
  r.queue(x, y, z, g => {...}, { bias }) for any depth-sorted drawing; inside it r.box(g, x0, y0, z0, x1, y1, z1, top, side)
  r.shadow(x, y, radius, alpha .5, color, surfaceZ); floor marks: r.decal(() => r.groundDisc(x, y, rad, color, alpha)),
    r.groundRing(x, y, rad, color, alpha), r.groundArc(x, y, r0, r1, a0, a1, color, alpha)
  r.text(str, x, y, color, opts); r.textAt(x, y, z, str, color); r.overlay(g => {...}); r.glowDisc(g, x, y, rad, color, 0..1)
  r.w(x, y, z) -> [px, py] where a world point lands; r.visible(x, y, z); r.view
Pixels (g is a canvas context from r.queue, r.overlay or r.actor): E.px.rect(g, x, y, w, h, c), dot(g, x, y, c),
  line(g, x0, y0, x1, y1, c, width), disc(g, x, y, r, c), ell(g, x, y, rx, ry, c), poly(g, [[x, y], ...], c),
  polyDither(g, pts, c, alpha), ddisc(g, x, y, r, c, alpha), blend(g, alpha, 'add' | 'multiply' | 'screen' | 'normal', () => {...}),
  sprite(g, spr, x, y, flip). Colors are '#rrggbb' or '#rgb'.
Sprites: const COIN = E.sprite(['.yy.', 'yYYy', '.yy.'], { y: '#f0b020', Y: '#fff0a0' }, scale); '.' and ' ' are clear
Text: E.font.text(g, str, x, y, color, { outline: '#0b0814' | false, shadow, gradient: [top, bottom], scale, align, wrap: px })
  -> { w, h }; E.font.title(g, str, x, y, { scale: 3, colors: [top, ..., bottom], depth, align }); E.font.width(str, opts),
  lineHeight(opts), wrap(str, px). A 5x7 font with lower case and ♥ ★ ← → ↑ ↓ • × ♪ ▸ ©
UI (draw inside r.overlay): E.ui.box(g, x, y, w, h, { bg, border, alpha }), E.ui.bar(g, x, y, w, h, 0..1, color),
  E.ui.hearts(g, x, y, hp, max) (halves allowed)
  const talk = new E.Dialog(game); talk.say(['Page one.', 'Page two.'], { name: 'ELDER', choices: ['YES', 'NO'],
    onChoice(i), onDone, place: 'top' | 'bottom', auto: 2.5, modal: false (chatter that plays on) });
    in update: if (talk.update(dt)) return;   in draw: talk.draw(r)
  const menu = new E.Menu(game, ['START', { label: 'LOAD', disabled: true }], { title, x, y, onPick(i, item), onCancel });
    menu.update(); menu.draw(r)
Sound (game.audio; it starts after the first key press): sfx(name, { vol, pitch }) with presets jump jump2 land step coin
  pickup key powerup oneup heal hit hurt stomp bump swing whoosh punch kick shoot laser charge explode boom door secret
  warp die select confirm cancel pause text blip; or sfx({ wave: 'square' | 'pulse' | 'triangle' | 'saw' | 'sine' | 'noise',
  freq: 440 | 'A4', to, dur, vol, arp: [0, 4, 7], step }); define(name, voice)
  music('title' | 'adventure' | 'dungeon' | 'boss' | 'victory') or your own { bpm: 120, steps: 4, tracks: [{ wave: 'square',
  vol: .15, notes: 'C5 - E5 . G5 . | ...' }, { wave: 'drums', notes: 'k . h . s . h .' }] } ('-' holds, '.' rests; drums
  k s h o c t); music(null) stops; mute(); setVolume(0..1)
TileMap (iso, threequarter, topdown and brawler levels):
  new E.TileMap({ rows, legend, types, floorTex }); legend: a number = wall type, a string = spawn tag,
  { tile, floor: 'water', spawn, block: true }; types[id] = { h, top, side, cut: true (drops walls in front of the
  floor), face: 'brick' | 'none', roof: 'speckle' | 'plain' }; floorTex(x, y, floorTag) -> [r, g, b]
  find(tag) / findAll(tag) -> { x, y, cx, cy }; drawFloor(r) and queueWalls(r) in draw; bounds(view);
  set(cx, cy, 0) opens a door; cell(cx, cy), walkable(cx, cy), block(cx, cy, on), toCell(x, y), center(cx, cy),
  heightAt(x, y), floorAt(x, y), los(x0, y0, x1, y1). Walls lower than a body's feet are walkable (jump onto blocks).
  floors: E.tex.grass(x, y, { base, dark, light }), dirt, water, planks, checker(x, y, { a, b, size }), plain(x, y, { base })
  new E.FlowField(map): update(tx, ty) every step, dir(x, y, tx, ty) -> [dx, dy] around walls (pathfinding)
Body (ground physics): new E.Body({ x, y, r: 5, gravity: 700, friction: 0, bounce: 0 }); set vx, vy, then
  update(dt, map); push(ix, iy, iz) knockback; jump(v); reads z, onGround, landed, hitWall, bounced
PlatformMap (side-scrollers, 2.5D in 'brawler'): new E.PlatformMap({ rows, legend, types }); types[id] = { kind:
  'solid' | 'oneway' | 'ladder' | 'slope' (dir: 1 rises right, -1 left) | 'hazard' | 'deco' | 'back', style: 'block' |
  'bonus' | 'brick' | 'ground' | 'plank' | 'spikes' | 'ladder' | 'liquid' | 'plain', side: '#hex', top: '#hex' }
  find(tag) -> { x, z } (z = feet); cell(cx, cz) and set(cx, cz, id) count rows from the BOTTOM; groundBelow(x, z) ->
  surface height, or null over a pit; touching(box, 'hazard'); solidAt(x, z); types[id]; bounds(view); draw(r) right
  after r.sky; move(box, dt, solids) moves enemy boxes { x, z, w, h, vx, vz } (sets onGround, hitWall -1 | 0 | 1,
  hitCeiling, bumped)
Platformer: new E.Platformer({ x, z, w: 8, h: 22, run: 95, jump: 285, gravity: 800, airJumps: 0, wallJump: false, dash: 0 })
  update(dt, level, game.input or { x: -1..1, jump, jumpPressed, up, down, dash }, movingPlatforms); coyote time,
  jump buffering, variable jump height, ladders, down + jump through one-ways. Reads onGround, jumped, landed, facing
  (1 | -1), air, climbing, hitWall, bumped { cx, cz, id }; knock(dir); rigState(extra) feeds rig.update.
  Moving platforms are { x, z, w, h, vx, vz } boxes you move yourself and pass in; riders are carried.
Bullets: const shots = new E.Bullets(game, { plane: 'ground' | 'side' }); shots.fire({ x, y, z, vx, vy, vz, r: 2, team,
  color, life: 3, dmg, pierce, sprite }); burst(base, velocities); update(dt, map) (bullets die on walls);
  hit(targets, (b, t) => {...}, team) -> hits (targets: x, y, r, or x, z, w, h in side); draw(r); clear(team)
  velocities: E.pattern.dir(angle, speed), aim(from, to, speed), aimSide(from, to, speed), spread(angle, n, arc, speed),
  ring(n, speed, offset); on the side plane a velocity is [vx, vz]
Humanoid: new E.Humanoid({ size: 1.3, build: 'chibi' | 'heroic' | 'bulky', weapon: 'sword' | 'gun' | 'staff' | null,
  outfit: 'shirt' | 'tunic' | 'robe' | 'coat', hair: 'short' | 'bald', hat: 'cap' | 'pointed' | 'helmet' | 'crown'
  (or { style, color }), cape: { len: 6 }, hood: true, sleeves: 'short' | 'long' | 'none', eyeGlow: '#ff4030', hunch,
  colors: { skin, hair, cloth, coat, pants, boot, belt, trim, glove, cape, capeIn, metal, hilt } })
  rig.update(dt, { x, y, z, vx, vy, facing, attack, hurt, dash, air, point, aim, climb, vz, pose, stance, run })
    facing in radians (side view: 0 right, Math.PI left); air tucks the legs; point holds a gun out, aim tilts it
    (+ = up); pose: 'cheer' | 'cast' | 'guard' | 'kneel' | 'crouch' | 'wave' | 'hips' | 'block' | 'die' | 'down';
    stance: 'guard' (fists up) | 'ready' (weapon forward); run: 0..1 runs in place
  rig.draw(g, ox, oy, r.view) inside r.actor; rig.hand(), rig.tip() -> world points to spawn bullets; rig.kick(v) squash
Attack: const slash = new E.Attack('slash' | spec, overrides); if (input.buffered('attack') && slash.start()) input.consume('attack');
  slash.update(dt) -> phase that began ('active' = play the swing sound); slash.hits(targets, t => E.inArc(hero, facing, t,
  22, 1.4), t => {...}) hits each target once per swing; rig.update(dt, { ..., attack: slash.state }); busy, active, cancel()
  new E.Combo(['jab', 'cross', 'uppercut'], { window: .3 }): press() starts or chains; update, hits, state like an Attack
  E.MOVES: slash backslash overhead rising thrust spin plunge twohand | jab cross hook uppercut haymaker elbow |
    kick roundhouse sweep flyingkick knee axekick | cast throw bash claw. Give each character its own moves.
  E.knockback(from, target, speed, up) pushes a Body (or anything with vx, vy)
Blob (slimes, bats, imps): new E.Blob({ R: 6.5, colors: { dk, base, lt }, wings, horns, ears: 'rabbit' | 'cat', feet,
  tail, mouth: true | 'fangs' }); update(dt, { look: [dx, dy], squash: -0.4..0.4, walk: 0..1, flap: 0..1, hang });
  draw(g, ox, oy, r.view) inside r.actor
Particles (game.particles): explosion(x, y, z, size) (fire, smoke, debris, ring, shake, sound), fire(x, y, z, n),
  smoke(x, y, z, n), sparks(x, y, z, n, angle), dust(x, y, z, n), bits(x, y, z, n, colors), glints(x, y, z, n, color),
  ring(x, y, r0, r1, color), impact(x, y, z, size), text(x, y, z, '12', color, { bounce: true, scale })
  side views: game.particles.ground = (x, y, z) => level.groundBelow(x, z) so debris lands on platforms
Helpers: E.clamp lerp approach approachAng angDiff ease.outCubic | outQuad | inOut | outBack, rand(a, b), randInt(a, b),
  pick(list), chance(p), rng(seed), noise2(x, y), dist(a, b), angleTo(a, b), overlap(a, b) (circles x, y, r),
  overlapBox(a, b) (side boxes x, z, w, h), inArc(a, facing, b, range, halfAngle), prune(list, fn) removes in place,
  tones(hex) -> { deep, sh, base, lt, hi } hue-shifted shades, ramp(hex, n), shade(hex, -1..1), mix(a, b, t),
  hex(str) -> [r, g, b], store.get(key, fallback) / store.set(key, value) save data, E.VIEWS, new E.View(id, label,
  yawDeg, pitchDeg, scale, zBoost)

## Recipes
Side-scroller (Mario, Mega Man): PlatformMap + Platformer + Humanoid, view 'side'.
```js platformer
(() => {
const E = My3D2dge;
const game = new E.Game({ canvas: 'screen', res: 'snes', view: 'side', views: ['side', 'brawler'], input: 'PLATFORMER' });
const level = new E.PlatformMap({
  rows: ['                                  ',
         '               ?                  ',
         '        ===             ==        ',
         '  @           g     ^^       g  F ',
         '#################  ###############'],
  legend: { '#': 1, '=': 2, '?': 3, '^': 4, '@': 'hero', g: 'walker', F: 'flag' },
  types: { 1: { style: 'ground', side: '#8a5a32' }, 2: { kind: 'oneway' }, 3: { style: 'bonus', side: '#e8a830' }, 4: { kind: 'hazard' } }
});
const start = level.find('hero'), flag = level.find('flag');
const hero = new E.Platformer({ x: start.x, z: start.z });
const rig = new E.Humanoid({ hat: 'cap', weapon: null, colors: { cloth: '#d83a2a', pants: '#3050c0' } });
const foes = level.findAll('walker').map(p => ({ x: p.x, z: p.z, w: 12, h: 12, vx: 0, vz: 0, dir: -1, rig: new E.Blob({ feet: true, colors: { base: '#a06030', dk: '#5a3018', lt: '#d09060' } }) }));
game.cam.bounds = v => level.bounds(v);
game.particles.ground = (x, y, z) => level.groundBelow(x, z);           // sparks and debris land on platforms
game.start({
  update(dt) {
    hero.update(dt, level, game.input);
    if (hero.jumped) game.audio.sfx('jump');
    if (hero.bumped && level.types[hero.bumped.id].style === 'bonus') { level.set(hero.bumped.cx, hero.bumped.cz, 1); game.audio.sfx('coin'); game.particles.glints(hero.x, 0, hero.z + 30, 6); }
    if (level.touching(hero, 'hazard') || hero.z < -40) { Object.assign(hero, { x: start.x, z: start.z, vx: 0, vz: 0 }); game.audio.sfx('hurt'); }
    for (const f of foes) {
      f.vz -= 800 * dt; f.vx = f.dir * 25; level.move(f, dt);
      const ahead = level.groundBelow(f.x + f.dir * 8, f.z);
      if (f.hitWall || ahead === null || ahead < f.z - 4) f.dir = -f.dir;   // turn at walls and ledges
      f.rig.update(dt, { look: [f.dir, 0], walk: 1 });
      if (!f.dead && E.overlapBox(hero, f)) {
        if (hero.vz < 0 && hero.z > f.z + f.h / 2) { f.dead = true; hero.vz = 220; game.audio.sfx('stomp'); game.particles.dust(f.x, 0, f.z, 8); }
        else { hero.knock(hero.x < f.x ? -1 : 1); game.audio.sfx('hurt'); }
      }
    }
    E.prune(foes, f => f.dead);
    if (Math.abs(hero.x - flag.x) < 8) { game.audio.sfx('powerup'); Object.assign(hero, { x: start.x, z: start.z }); }
    rig.update(dt, hero.rigState());
    game.focus(hero.x, 0, hero.z + 24);                                   // side view: y = 0, z is up
  },
  draw(r) {
    r.sky(['#5c94fc', '#a8c8ff']);
    level.draw(r);
    r.queue(flag.x, 0, flag.z, g => { const [x, y] = r.w(flag.x, 0, flag.z); E.px.rect(g, x, y - 40, 2, 40, '#e8e8e8'); E.px.poly(g, [[x + 2, y - 40], [x + 14, y - 35], [x + 2, y - 30]], '#40c040'); });
    for (const f of foes) r.actor(f.x, 0, f.z, (g, ox, oy) => f.rig.draw(g, ox, oy, r.view));
    r.actor(hero.x, 0, hero.z, (g, ox, oy) => rig.draw(g, ox, oy, r.view));
  }
});
})();
```
Shoot-'em-up (1942): view 'overhead', sprites, Bullets, a starfield.
```js shmup
(() => {
const E = My3D2dge, W = 224, H = 256;
const game = new E.Game({ canvas: 'screen', res: [W, H], view: 'overhead', views: ['overhead'], input: 'SHMUP' });
const SHIP = E.sprite(['...w...', '..wbw..', '.wwbww.', 'wwrwrww', 'w..r..w'], { w: '#e8f0ff', b: '#3a7aff', r: '#ff5030' }, 2);
const FOE = E.sprite(['r.....r', '.rrrrr.', 'rryyyrr', '.r.r.r.'], { r: '#d03040', y: '#ffd040' }, 2);
const shots = new E.Bullets(game), ship = { x: W / 2, y: H - 30, r: 4 }, foes = [];
let score = 0, cool = 0, spawn = 0;
game.start({
  update(dt) {
    game.focus(W / 2, H / 2);                                            // overhead: world x/y = screen pixels
    const m = game.input.move();
    ship.x = E.clamp(ship.x + m[0] * 120 * dt, 8, W - 8); ship.y = E.clamp(ship.y + m[1] * 120 * dt, 8, H - 8);
    if ((cool -= dt) <= 0 && game.input.down('fire')) { cool = .12; shots.fire({ x: ship.x, y: ship.y - 10, vy: -300, team: 'player' }); game.audio.sfx('shoot'); }
    if ((spawn -= dt) <= 0) { spawn = .9; foes.push({ x: E.rand(20, W - 20), y: -10, r: 7, hp: 3, t: 0 }); }
    for (const f of foes) {
      f.t += dt; f.y += 40 * dt; f.x += Math.sin(f.t * 3) * 40 * dt;
      if (E.chance(dt * .6)) shots.burst({ x: f.x, y: f.y, team: 'foe', color: '#ff6080' }, [E.pattern.aim(f, ship, 90)]);
    }
    shots.update(dt);
    shots.hit(foes, (b, f) => { f.hp--; game.particles.sparks(b.x, b.y, 0, 4); }, 'player');
    for (const f of foes) if (f.hp <= 0) { score += 100; game.particles.explosion(f.x, f.y, 0, .8); }
    E.prune(foes, f => f.hp <= 0 || f.y > H + 20);
    if (shots.hit([ship], () => {}, 'foe')) { game.flash('#ff4040', .2); game.audio.sfx('hurt'); score = 0; }
  },
  draw(r) {
    r.sky(['#000010', '#101040']); r.starfield({ dir: 'down', speed: 40 });
    for (const f of foes) r.sprite(f.x, f.y, 0, FOE, { anchor: 'center' });
    r.sprite(ship.x, ship.y, 0, SHIP, { anchor: 'center' });
    shots.draw(r);
    r.text('SCORE ' + score, 4, 4, '#ffffff', { shadow: '#000', outline: false });
  }
});
})();
```
- Beat-'em-up (Final Fight): view 'brawler', a long TileMap street, Body + Humanoid({ weapon: null, build: 'bulky' })
  with stance: 'guard', new E.Combo(['jab', 'cross', 'uppercut']); a hit needs E.inArc and |dy| < 8 (same lane);
  launch with E.knockback(hero, foe, 160, 120); lock the camera with cam.bounds while a wave is alive.
- Zelda-like: TileMap rooms with game.cam.room = [roomW, roomH]; freeze play while game.cam.moving; Dialog for NPCs.
- RPG battle: view 'brawler' with rigs in two rows and an E.Menu of commands; an action steps forward, plays an
  E.Attack, shows the damage with game.hitFx, and steps back; pose: 'down' for the fallen, 'cheer' to win.
- Puzzle (Tetris): view 'overhead', res 'nes', a 2D array drawn with E.px.rect in r.overlay,
  input.repeat('left', .17, .05) for auto-shift, game.every(speed, fall) for gravity.

## Rules
1. World units and dt everywhere. Feel numbers (units per second, tile = 16): walk 70-90, run 95-140, jump 250-320
   with gravity 800, dash 200-260, player bullets 250-320, enemy bullets 70-120, enemies 25-45.
2. At 320x240, heroes are 40-60 px tall (Humanoid size 1.2-1.4), bosses size 1.8-2.4; hitboxes smaller than the art.
3. Every hit gets game.hitFx; deaths get particles.explosion; sounds on jump, hit, pickup and death; music per scene.
4. A title scene, play scenes with pausable: true, and a game-over or win path back to the title.
5. Dress every character (outfit, hat, colors) and give each its own moves; enemies wind up slower than the hero.
6. Nothing on screen? The camera looks elsewhere: game.follow(hero) or game.focus(...) every update (side: y = 0).

## More, outside this file: animation and examples to take from
In the repo (github.com/michaelcrosato/my-3d2dge; every clip is free to use). Its files are large: search them and take
only what the game needs; never read one whole. All of it runs at https://my-3d2dge.vercel.app/labs.
- Motion clips: 325 curated (idles, walks, runs, jumps, fights, hits, deaths, chores, dances) and 2,548 motion-capture
  takes, as readable key poses that play on any Humanoid (either engine; the full one also turns the face and hair).
    find  src/mocap/catalogs/quaternius.json, mesh2motion.json, cmu.json: each clip's name, tags and description;
          node tools/cmu.mjs ledger kick (or grep src/mocap/catalogs/cmu-takes.tsv): the takes, one a line
    take  node tools/anim-set.mjs src/mocap/sets/quaternius.js examples/cmu-lib/CMU_10.js --clips Idle_Loop,10_01
          --name MINE --out mine.js     (take NN_xx is in examples/cmu-lib/CMU_NN.js; curated sets: src/mocap/sets/)
    play  load src/mocap/readable.js, src/mocap/mocap.js and mine.js after the engine, then
          const lib = Mocap.load(MOCAP.MINE); Mocap.drive(rig, lib);
          and each step rig.mocap = lib.sample(lib.clip(name), t) (rig.mocapW 0..1 fades it over the rig's own motion;
          rig.mocapMask = 'upper' keeps the rig's own legs)
    docs/MOCAP.md: the format, retargeting, and where every clip came from.
- Worked examples: Emberdeep (src/emberdeep/), a whole game on the full engine, one line per part:
  grep -nE "def\(['\"](archetypes|characters|skills)" src/emberdeep/*.js   (28 monster, boss and dummy bodies with
  tags, 3 heroes, 30 skills: Codex's six come from one helper); bodies that are not people: grep -n "^class "
  src/emberdeep/*.js (a spider, a serpent, a floating eye, a living book, a scythed beast). They lean on the game's
  helpers: adapt them, do not paste them (the recipe for a new body is docs/CHARACTERS.md).
- A starter game per genre: dist/kits/my-3d2dge-<adventure|platformer|brawler|shooter|rpg|animlab>.html.
*/
(function (root) {
'use strict';
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const E = { version: '0.11.0', build: 'dev-build', edition: 'agent', name: 'my-3D2dge', TAU, DEG, current: null };   // build: the commit, stamped at deploy
E.versionLabel = () => 'v' + E.version + ' · ' + E.build;
const _warned = new Set();   // one console warning per distinct problem, prefixed 'my-3D2dge:'
const warn = (key, msg) => { if (_warned.has(key)) return; _warned.add(key); console.warn('my-3D2dge: ' + msg); };
E.warn = warn;

// ---- 1. MATH, COLOR, HELPERS ----
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
function smoothDamp(cur, target, vel, st, dt) {
  const om = 2 / st, x = om * dt, ex = 1 / (1 + x + .48 * x * x + .235 * x * x * x), ch = cur - target, tmp = (vel + om * ch) * dt;
  return [target + (ch + tmp) * ex, (vel - om * tmp) * ex];
}
const hex = h => {
  if (Array.isArray(h)) return h.slice(0, 3);
  let s = String(h).trim(); if (s[0] === '#') s = s.slice(1);
  if (s.length === 3 || s.length === 4) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s.slice(0, 6), 16);
  if (s.length < 6 || isNaN(n)) { warn('hex:' + h, 'color "' + h + '" is not a "#rrggbb" hex color (drawn magenta)'); return [255, 0, 255]; }
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
};
const toHex = c => '#' + c.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
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
// shading leans cool in shadow and warm in light, the way pixel artists shade
const _shades = new Map();
const shade = (h, a) => {
  const key = h + '|' + a; let r = _shades.get(key); if (r) return r;
  const c = hex(h), flat = toHex(c.map(v => a < 0 ? v * (1 + a) : v + (255 - v) * a)), [hh, s, l] = toHsl(flat);
  r = s < .08 ? flat : hsl(hueToward(hh, a < 0 ? 250 : 55, Math.abs(a) * 24), s + (a < 0 ? .05 : -.05) * Math.min(1, Math.abs(a) * 3), l);
  if (_shades.size > 2000) _shades.clear(); _shades.set(key, r); return r;
};
const mix = (h1, h2, t) => { const a = hex(h1), b = hex(h2); return toHex(a.map((v, i) => lerp(v, b[i], t))); };
const _tones = new Map();
function tones(c, strength = 1) {
  const key = c + ':' + strength; let t = _tones.get(key); if (t) return t;
  const [hh, s, l] = toHsl(c), k = strength, grey = s < .08;
  const f = (dl, dh, target, ds) => grey ? hsl(hh, s, l + dl * k) : hsl(hueToward(hh, target, dh * k), s + ds, l + dl * k);
  const skin = !grey && l > .62 && (hh < 50 || hh > 340);
  t = { deep: skin ? f(-.3, 22, 280, -.22) : f(-.3, 16, 250, .06), sh: skin ? f(-.14, 14, 280, -.16) : f(-.15, 9, 250, .05), base: c, lt: f(.1, 6, 50, -.02), hi: f(.24, 12, 55, -.08) };
  if (_tones.size > 600) _tones.clear();
  _tones.set(key, t); return t;
}
function ramp(c, n = 5, strength = 1) {
  const [hh, s, l] = toHsl(c), out = [];
  for (let i = 0; i < n; i++) { const u = n < 2 ? 0 : i / (n - 1) * 2 - 1; out.push(s < .08 ? hsl(hh, s, l + u * .3 * strength) : hsl(hueToward(hh, u < 0 ? 250 : 55, Math.abs(u) * 14 * strength), s + (u < 0 ? .06 : -.06) * Math.abs(u), l + u * .3 * strength)); }
  return out;
}
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
// two-bone IK in 3D: returns [joint, end]; hint points the way the joint bends
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
const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = list => list[(Math.random() * list.length) | 0];
const chance = p => Math.random() < p;
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const overlap = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y, r = (a.r || 0) + (b.r || 0); return dx * dx + dy * dy < r * r; };
const overlapBox = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w && a.z < b.z + b.h && b.z < a.z + a.h;
const inArc = (a, facing, b, range, halfAngle) => { const dx = b.x - a.x, dy = b.y - a.y; return Math.hypot(dx, dy) <= range + (b.r || 0) && Math.abs(angDiff(facing, Math.atan2(dy, dx))) <= halfAngle; };
const prune = (list, fn) => { let j = 0; for (let i = 0; i < list.length; i++) if (!fn(list[i])) list[j++] = list[i]; list.length = j; return list; };
const store = {
  get(key, fallback = null) { try { const v = localStorage.getItem('my3d2dge:' + key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
  set(key, value) { try { localStorage.setItem('my3d2dge:' + key, JSON.stringify(value)); return true; } catch (e) { return false; } },
  remove(key) { try { localStorage.removeItem('my3d2dge:' + key); } catch (e) { /* storage blocked */ } }
};
Object.assign(E, { clamp, lerp, approach, ease, angDiff, lerpAng, approachAng, rng, hash2, noise2, smoothDamp, hex, toHex, toHsl, hsl, shade, mix, tones, ramp,
  mkCanvas, ctx2d, V3, ik3, rand, randInt, pick, chance, dist, angleTo, overlap, overlapBox, inArc, prune, store });

// ---- 2. PIXELS: every shape snaps to whole pixels (never anti-aliased); g is a CanvasRenderingContext2D ----
const px = {};
px.col = (g, c) => { if (g._c !== c) { g.fillStyle = c; g._c = c; } };
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
function scan(pts, span) {
  let y0 = 1e9, y1 = -1e9;
  for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  y0 = Math.round(y0); y1 = Math.round(y1);
  const n = pts.length;
  for (let y = y0; y <= y1; y++) {
    _xs.length = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) _xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    _xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < _xs.length; k += 2) { const xa = Math.round(_xs[k]), xb = Math.round(_xs[k + 1]); span(xa, Math.max(xa, xb), y); }
  }
}
px.poly = (g, pts, c) => { px.col(g, c); scan(pts, (a, b, y) => g.fillRect(a, y, b - a + 1, 1)); };
// translucency in 1/8 steps with blend modes, like PS1 / SNES color math
const qa = a => Math.round(clamp(a, 0, 1) * 8) / 8;
const BLEND = { normal: 'source-over', add: 'lighter', multiply: 'multiply', screen: 'screen', sub: 'difference', overlay: 'overlay' };
px.blend = (g, a, mode, fn) => {
  const ga = g.globalAlpha, gc = g.globalCompositeOperation;
  g.globalAlpha = ga * qa(a); g.globalCompositeOperation = BLEND[mode] || mode || 'source-over';
  try { fn(); } finally { g.globalAlpha = ga; g.globalCompositeOperation = gc; }
};
px.polyDither = (g, pts, c, a) => {
  if (a <= 0) return; if (a >= 1) return px.poly(g, pts, c);
  const A = qa(a); if (A > 0) px.blend(g, A, 'normal', () => px.poly(g, pts, c));
};
px.ddisc = (g, cx, cy, r, c, a) => {
  if (a <= 0) return;
  const ga = g.globalAlpha;
  for (const [k, f] of [[1, .42], [.7, .42], [.4, .5]]) { const A = qa(a * f); if (A <= 0 || r * k < .4) continue; g.globalAlpha = ga * A; px.disc(g, cx, cy, r * k, c); }
  g.globalAlpha = ga;
};
// string sprites: one character per pixel, '.' and ' ' transparent, colors maps characters to hex
function sprite(rows, colors = {}, scale = 1) {
  if (typeof rows === 'string') rows = rows.split('\n');
  rows = rows.map(s => String(s));
  const s = Math.max(1, Math.round(scale)), w = Math.max(1, ...rows.map(r => r.length)) * s, h = Math.max(1, rows.length) * s;
  const cv = mkCanvas(w, h), g = ctx2d(cv), fl = mkCanvas(w, h), fg = ctx2d(fl);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') { x++; continue; }
      let n = 1; while (x + n < row.length && row[x + n] === ch) n++;
      const c = colors[ch];
      if (!c) warn('sprite:' + ch, 'sprite character "' + ch + '" has no color in the colors map (drawn magenta)');
      g.fillStyle = fg.fillStyle = c || '#ff00ff'; g.fillRect(x * s, y * s, n * s, s); fg.fillRect(w - (x + n) * s, y * s, n * s, s);
      x += n;
    }
  });
  return { w, h, cv, fl, isSprite: true };
}
E.sprite = sprite;
px.sprite = (g, spr, x, y, flip = false) => g.drawImage(flip ? spr.fl : spr.cv, Math.round(x), Math.round(y));
E.px = px;

// ---- 3. VIEWS: orthographic cameras. yaw spins around up, pitch tilts from side (0) to straight down (90), scale = px per unit ----
//   screen x = ax*x + ay*y;  screen y = bx*x + by*y + bz*z
class View {
  constructor(id, label, yaw, pitch, scale = 1, zBoost = 1) { this.id = id; this.label = label; this.set(yaw, pitch, scale, zBoost); }
  set(yaw, pitch, scale = 1, zBoost = 1) {
    this.yawDeg = yaw; this.pitchDeg = pitch; this.scale = scale; this.zBoost = zBoost;
    const w = yaw * DEG, p = pitch * DEG, cw = Math.cos(w), sw = Math.sin(w), cp = Math.cos(p), sp = Math.sin(p);
    this.yaw = w; this.pitch = p;
    this.ax = scale * cw; this.ay = -scale * sw;
    this.bx = scale * sp * sw; this.by = scale * sp * cw; this.bz = -scale * cp * zBoost;
    this.dx = sw * cp; this.dy = cw * cp; this.dz = sp;   // camera depth direction (bigger = nearer)
    this.fx = sw; this.fy = cw;                           // ground direction toward the camera
    this.isTop = pitch >= 89; this.isSide = pitch <= 1;
    const det = this.ax * this.by - this.ay * this.bx;
    this.inv = Math.abs(det) > 1e-6 && pitch > 5 ? [this.by / det, -this.ay / det, -this.bx / det, this.ax / det] : null;
    return this;
  }
  p(x, y, z = 0) { return [this.ax * x + this.ay * y, this.bx * x + this.by * y + this.bz * z]; }
  depth(x, y, z = 0) { return this.dx * x + this.dy * y + this.dz * z; }
  order(x, y, z = 0) { return this.isTop ? z + (this.bx * x + this.by * y) * 1e-3 : this.fx * x + this.fy * y + z * 1e-3; }
  toGround(sx, sy) { const i = this.inv; return i ? [i[0] * sx + i[1] * sy, i[2] * sx + i[3] * sy] : null; }
  screenDirToGround(dx, dy) {
    if (!dx && !dy) return [0, 0];
    let g = this.inv ? [this.inv[0] * dx + this.inv[1] * dy, this.inv[2] * dx + this.inv[3] * dy] : [dx, dy];
    const l = Math.hypot(g[0], g[1]) || 1, m = Math.min(1, Math.hypot(dx, dy));
    return [g[0] / l * m, g[1] / l * m];
  }
}
E.View = View;
E.VIEWS = {
  iso: new View('iso', 'Isometric', 45, 30, Math.SQRT2, 1),
  threequarter: new View('threequarter', 'Three-quarter', 0, 55, 1.5, 1.35),
  topdown: new View('topdown', 'Top-down', 0, 80, 1.5, 1.3),
  brawler: new View('brawler', 'Brawler', 0, 25, 1.5, 1),
  side: new View('side', 'Side', 0, 0, 1.5, 1),
  overhead: new View('overhead', 'Overhead', 0, 90, 1, 1)
};
E.VIEW_ORDER = ['iso', 'threequarter', 'topdown', 'brawler', 'side'];
E.style = {};
// steep ground views draw rigs from a lower, sprite-like angle so faces show (E.style.charPitch = false turns it off)
const _cviews = new Map();
function charView(view) {
  const P = E.style.charPitch;
  if (P === false || view.pitchDeg < 40 || view.pitchDeg >= 89) return view;
  const cp = P || 30, key = view.yawDeg + ':' + view.pitchDeg + ':' + view.scale + ':' + view.zBoost + ':' + cp;
  let v = _cviews.get(key);
  const h = view.pitchDeg <= 70 ? view.zBoost * Math.cos(view.pitchDeg * DEG) : .78;
  if (!v) { v = new View(view.id, view.label, view.yawDeg, cp, view.scale, h / Math.cos(cp * DEG)); _cviews.set(key, v); }
  return v;
}
E.charView = charView;

// ---- 4. SCREEN: low-res buffer, whole-number upscale, sub-pixel camera on present ----
E.RES = { nes: [256, 240], snes: [256, 224], gb: [160, 144], gba: [240, 160], genesis: [320, 224], n64: [320, 240], ps1: [320, 240], wide: [400, 225] };
class Screen {
  constructor(canvas, o) {
    this.canvas = canvas; this.sctx = canvas.getContext('2d'); this.o = o;
    this.buf = mkCanvas(8, 8); this.ctx = ctx2d(this.buf);
    this.W = 320; this.H = 200; this.S = 3; this.OX = 0; this.OY = 0; this.dpr = 1;
    this.ix = 0; this.iy = 0; this.fx = 0; this.fy = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  /** the sizing options in force: o.portrait's fields over the game's while the screen is taller than wide */
  options(pw, ph) { const o = this.o; return o.portrait && ph > pw ? Object.assign({}, o, o.portrait) : o; }
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
    if (fix) { this.W = fix[0]; this.H = fix[1]; this.S = Math.max(1, Math.min(Math.floor(pw / fix[0]), Math.floor(ph / fix[1]))); }
    else { this.S = Math.max(1, Math.min(Math.floor(ph / o.minH), Math.floor(pw / o.minW))); this.W = Math.min(o.maxW, Math.ceil(pw / this.S)); this.H = Math.min(o.maxH, Math.ceil(ph / this.S)); }
    this.OX = Math.floor((pw - this.W * this.S) / 2); this.OY = Math.floor((ph - this.H * this.S) / 2);
    this.buf.width = this.W + 2; this.buf.height = this.H + 2;
    this.ctx = ctx2d(this.buf); this.ctx._c = null;
  }
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
  clientToScreen(cx, cy) {
    const rc = this.canvas.getBoundingClientRect(), dx = (cx - rc.left) * this.dpr, dy = (cy - rc.top) * this.dpr;
    return [(dx - this.OX + Math.round(this.fx * this.S)) / this.S + this.ix, (dy - this.OY + Math.round(this.fy * this.S)) / this.S + this.iy];
  }
}

// ---- 5. INPUT: actions are names bound to codes (KeyboardEvent.code, 'Mouse0'/'Mouse2', 'Pad0'..'Pad15' standard gamepad buttons) ----
class Input {
  constructor(screen, map) {
    this.screen = screen; this.use(map);
    this.held = new Set(); this.clock = 0; this.pt = {}; this.used = {}; this.rk = {};
    this.fresh = new Set(); this.now = new Set(); this.freshUp = new Set(); this.nowUp = new Set();
    this.mouse = { cx: 0, cy: 0, active: false }; this.padMove = [0, 0]; this.padPrev = []; this.padIndex = null; this.deadzone = .18;
    const el = screen.canvas, typing = e => { const t = e.target; return !!t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || (t.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'submit', 'color'].includes(t.type))); };
    const at = e => { this.mouse.cx = e.clientX; this.mouse.cy = e.clientY; this.mouse.active = true; };
    addEventListener('keydown', e => { if (!typing(e) && this.codes[e.code]) { e.preventDefault(); if (!e.repeat) this.press(e.code); } });
    addEventListener('keyup', e => this.release(e.code));
    addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('pointermove', at);
    el.addEventListener('pointerdown', e => { at(e); this.press('Mouse' + e.button); });
    addEventListener('pointerup', e => this.release('Mouse' + e.button));
  }
  use(map) {
    if (this.held) this.clear();
    if (typeof map === 'string') map = Input[map.toUpperCase()] || Input.DEFAULT;
    this.map = {}; for (const a in map) this.map[a] = [...map[a]];
    this.codes = {}; for (const a in this.map) for (const c of this.map[a]) (this.codes[c] = this.codes[c] || []).push(a);
    return this;
  }
  press(code) {
    if (this.held.has(code)) return; this.held.add(code);
    for (const a of this.codes[code] || []) { this.pt[a] = this.clock; this.used[a] = false; this.rk[a] = -1; this.fresh.add(a); }
  }
  release(code) {
    if (!this.held.delete(code)) return;
    for (const a of this.codes[code] || []) if (!this.down(a)) this.freshUp.add(a);
  }
  _check(a) { if (!this.map[a]) warn('action:' + a, 'unknown input action "' + a + '". Known actions: ' + Object.keys(this.map).join(', ') + ". Add your own with new E.Game({ input: { ...E.Input.DEFAULT, " + a + ": ['KeyQ'] } })"); }
  down(a) { const m = this.map[a]; if (!m) { this._check(a); return false; } for (const c of m) if (this.held.has(c)) return true; return false; }
  pressed(a) { if (!this.map[a]) this._check(a); return this.now.has(a); }
  released(a) { return this.nowUp.has(a); }
  repeat(a, delay = .3, rate = .08) {
    if (this.pressed(a)) return true;
    if (!this.down(a) || this.pt[a] === undefined) return false;
    const t = this.clock - this.pt[a]; if (t < delay) return false;
    const k = Math.floor((t - delay) / rate); if (k !== this.rk[a]) { this.rk[a] = k; return true; }
    return false;
  }
  buffered(a, win = .15) { if (!this.map[a]) this._check(a); const t = this.pt[a]; return t !== undefined && !this.used[a] && this.clock - t <= win; }
  consume(a) { this.used[a] = true; }
  consumeAll() { for (const a in this.map) this.used[a] = true; this.now.clear(); this.fresh.clear(); }
  clear() { this.held.clear(); this.consumeAll(); this.nowUp.clear(); this.freshUp.clear(); this.pt = {}; this.rk = {}; this.padMove = [0, 0]; }
  anyPressed() { return this.now.size > 0; }
  move() {
    let x = (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0), y = (this.down('down') ? 1 : 0) - (this.down('up') ? 1 : 0);
    if (Math.hypot(this.padMove[0], this.padMove[1]) > 0) { x = this.padMove[0]; y = this.padMove[1]; }
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return [x, y];
  }
  mouseScreen() { return this.mouse.active ? this.screen.clientToScreen(this.mouse.cx, this.mouse.cy) : null; }
  tick(dt) {
    this.clock += dt;
    let p = null;
    try { p = Array.from(navigator.getGamepads ? navigator.getGamepads() : []).find(q => q && q.connected !== false) || null; } catch (e) { /* gamepads blocked */ }
    if ((p ? p.index : null) !== this.padIndex) { this.padPrev.forEach((on, i) => { if (on) this.release('Pad' + i); }); this.padPrev = []; this.padMove = [0, 0]; this.padIndex = p ? p.index : null; }
    if (p) {
      const x = p.axes[0] || 0, y = p.axes[1] || 0, l = Math.hypot(x, y), d = clamp(this.deadzone, 0, .8), k = l <= d ? 0 : Math.min(1, (l - d) / (1 - d)) / l;
      this.padMove = [x * k, y * k];
      p.buttons.forEach((b, i) => { if (b.pressed && !this.padPrev[i]) this.press('Pad' + i); if (!b.pressed && this.padPrev[i]) this.release('Pad' + i); this.padPrev[i] = b.pressed; });
    }
    // presses since the last step become this step's pressed() / released()
    const n = this.now; n.clear(); this.now = this.fresh; this.fresh = n;
    const u = this.nowUp; u.clear(); this.nowUp = this.freshUp; this.freshUp = u;
  }
}
// menu actions in every preset. Pad9 = Start, Pad0 = A (bottom), Pad1 = B (right), Pad12-15 = d-pad
const MENU_KEYS = { start: ['Enter', 'NumpadEnter', 'Pad9'], pause: ['Escape', 'KeyP', 'Pad9'], confirm: ['Enter', 'NumpadEnter', 'Space', 'KeyJ', 'KeyZ', 'Pad0'], cancel: ['Escape', 'Backspace', 'KeyX', 'KeyK', 'Pad1'] };
const DIRS = { up: ['KeyW', 'ArrowUp', 'Pad12'], down: ['KeyS', 'ArrowDown', 'Pad13'], left: ['KeyA', 'ArrowLeft', 'Pad14'], right: ['KeyD', 'ArrowRight', 'Pad15'] };
Input.DEFAULT = { ...DIRS, attack: ['KeyJ', 'KeyX', 'Mouse0', 'Pad0', 'Pad7'], dash: ['Space', 'ShiftLeft', 'ShiftRight', 'KeyK', 'Pad1', 'Pad6'], skill: ['KeyL', 'KeyE', 'Mouse2', 'Pad2', 'Pad5'], jump: ['KeyZ', 'Pad3'], ...MENU_KEYS };
Input.PLATFORMER = { ...DIRS, jump: ['Space', 'KeyZ', 'KeyK', 'Pad0'], attack: ['KeyX', 'KeyJ', 'Mouse0', 'Pad2'], dash: ['ShiftLeft', 'ShiftRight', 'KeyC', 'KeyL', 'Pad1', 'Pad5'], skill: ['KeyE', 'KeyV', 'Mouse2', 'Pad3'], ...MENU_KEYS };
Input.SHMUP = { ...DIRS, fire: ['Space', 'KeyZ', 'KeyJ', 'Mouse0', 'Pad0', 'Pad7'], bomb: ['KeyX', 'KeyK', 'Mouse2', 'Pad1', 'Pad6'], ...MENU_KEYS };
E.Input = Input;

// ---- 6. FONT: 5x7 proportional pixel font with lower case. Glyph data: char, width, then one base-32 digit per row (bit 1 << (w - 1 - x) = pixel x) ----
const F = { g: {}, h: 7, desc: 2, gap: 1, space: 3 };
for (const e of "05ehjlphe 154c4444e 25eh1248v 35u11e11u 4526aiv22 55vgu11he 65egguhhe 75v124888 85ehhehhe 95ehhf11e A5ehhvhhh B5uhhuhhu C5ehggghe D5uhhhhhu E5vgguggv F5vgguggg G5ehgnhhf H5hhhvhhh I37222227 J572222ic K5hikokih L5ggggggv M5hrllhhh N5hhpljhh O5ehhhhhe P5uhhuggg Q5ehhhlid R5uhhukih S5fgge11u T5v444444 U5hhhhhhe V5hhhhha4 W5hhhllla X5hha4ahh Y5hha4444 Z5v1248gv a500e1fhf b5gguhhhu c500eggge d511fhhhf e500ehvge f434f4444 g500fhhhf1e h5gguhhhh i11011111 j3101111152 k4889aca9 l22222221 m500qllll n500uhhhh o500ehhhe p500uhhhugg q500fhhhf11 r400bc888 s500fge1u t444f4443 u500hhhhf v500hhha4 w500hhlla x500ha4ah y500hhhhf1e z500v248v !11111101 \"35500000 #5aavavaa $54fke5u4 %5pp248jj &5cik8lid '11100000 (31244421 )34211124 *50level0 +5044v440 ,200000112 -4000f000 .10000001 /511248gg :10010010 ;200100112 <41248421 =500v0v00 >48421248 ?5eh12404 @5ehnlngf [37444447 \\5gg84211 ]37111117 ^54ah0000 _5000000v `22100000 {43448443 |11111111 }4c22122c ~5008l200 ♥50avve40 ★544veah0 ←5048v840 →5042v240 ↑54el4440 ↓50444le4 •30027200 ©5ehlklhe ×50ha4ah0 ▸48cefec8 ♪56544cs8".split(" ")) {
  const w = +e[1], runs = [];
  for (let y = 0; y < e.length - 2; y++) { const v = parseInt(e[y + 2], 32); for (let x = 0; x < w;) { if (!(v >> (w - 1 - x) & 1)) { x++; continue; } let n = 1; while (x + n < w && v >> (w - 1 - x - n) & 1) n++; runs.push([x, y, n]); x += n; } }
  F.g[e[0]] = { w, runs };
}
const glyph = ch => F.g[ch] || F.g[ch.toUpperCase()] || F.g['?'];
const lineW = line => { let w = 0; for (const ch of line) w += ch === ' ' ? F.space + 1 : glyph(ch).w + 1; return Math.max(0, w - 1); };
const fo = o => typeof o === 'number' ? { scale: o } : (o || {}), fsc = o => Math.max(1, Math.round(o.scale || 1));
E.font = {
  width(s, o) { o = fo(o); let m = 0; for (const line of String(s).split('\n')) m = Math.max(m, lineW(line)); return m * fsc(o); },
  lineHeight(o) { o = fo(o); return (F.h + F.desc + (o.lineGap === undefined ? F.gap : o.lineGap)) * fsc(o); },
  height(lines = 1, o) { o = fo(o); return this.lineHeight(o) * (lines - 1) + (F.h + F.desc) * fsc(o); },
  wrap(s, maxW, o) {
    const lim = maxW / fsc(fo(o)), out = [];
    for (const para of String(s).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const t = line ? line + ' ' + word : word;
        if (lineW(t) <= lim || !line) line = t; else { out.push(line); line = word; }
        while (lineW(line) > lim && line.length > 1) { let k = line.length - 1; while (k > 1 && lineW(line.slice(0, k)) > lim) k--; out.push(line.slice(0, k)); line = line.slice(k); }
      }
      out.push(line);
    }
    return out;
  },
  // opts: an outline color, false, or { outline, shadow, gradient: [top, bottom], scale, align: 'left' | 'center' | 'right', wrap: maxWidthPx, lineGap }
  text(g, s, x, y, color = '#ffffff', o = '#0b0814') {
    if (o === null || o === false || typeof o === 'string') o = { outline: o };
    const sc = fsc(o), outline = o.outline === undefined ? '#0b0814' : o.outline, lh = this.lineHeight(o), grad = o.gradient && o.gradient.length ? o.gradient : null;
    const lines = o.wrap ? this.wrap(s, o.wrap, o) : String(s).split('\n');
    x = Math.round(x); y = Math.round(y);
    let w = 0;
    const draw = (ox, oy, c, useGrad) => lines.forEach((line, li) => {
      const lw = lineW(line) * sc, lx = x + (o.align === 'center' ? -Math.round(lw / 2) : o.align === 'right' ? -lw : 0), ly = y + li * lh;
      w = Math.max(w, lw);
      let cx = 0;
      for (const ch of line) {
        if (ch === ' ') { cx += F.space + 1; continue; }
        const gl = glyph(ch);
        for (const [rx, ry, rn] of gl.runs) { px.col(g, useGrad ? grad[Math.min(grad.length - 1, Math.floor(ry / F.h * grad.length))] : c); g.fillRect(lx + (cx + rx) * sc + ox, ly + ry * sc + oy, rn * sc, sc); }
        cx += gl.w + 1;
      }
    });
    if (o.shadow) draw(sc, sc, o.shadow, false);
    if (outline) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) draw(ox, oy, outline, false);
    draw(0, 0, color, !!grad);
    return { w, h: lh * (lines.length - 1) + (F.h + F.desc) * sc };
  },
  // big logo text: title(g, 'NAME', x, y, { scale: 3, colors: [top .. bottom], outline, depth, depthColor, align, shine })
  title(g, s, x, y, o = {}) {
    const sc = Math.max(1, Math.round(o.scale || 3)), colors = o.colors || ['#fff6c8', '#ffe08a', '#ffb347', '#e0662a'], outline = o.outline === undefined ? '#1a0c10' : o.outline;
    const depth = o.depth === undefined ? Math.max(1, sc - 1) : o.depth, dc = o.depthColor || shade(colors[colors.length - 1], -.55);
    const base = Object.assign({}, o, { scale: sc, outline: false, shadow: false, gradient: null });
    for (let d = depth; d >= 1; d--) this.text(g, s, x + d, y + d, dc, base);
    if (outline) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) this.text(g, s, x + ox, y + oy, outline, base);
    const rows = F.h * sc, bands = [];
    for (let k = 0; k < rows; k++) { const t = k / Math.max(1, rows - 1) * (colors.length - 1), i = Math.min(colors.length - 2, Math.floor(t)); bands.push(colors.length < 2 ? colors[0] : mix(colors[i], colors[i + 1], t - i)); }
    const lines = String(s).split('\n'), lh = this.lineHeight(base);
    lines.forEach((line, li) => {
      const lw = lineW(line) * sc, lx = Math.round(x) + (o.align === 'center' ? -Math.round(lw / 2) : o.align === 'right' ? -lw : 0), ly = Math.round(y) + li * lh;
      let cx = 0;
      for (const ch of line) {
        if (ch === ' ') { cx += F.space + 1; continue; }
        const gl = glyph(ch);
        for (const [rx, ry, rn] of gl.runs) for (let sy = 0; sy < sc; sy++) { px.col(g, bands[Math.min(rows - 1, ry * sc + sy)] || colors[0]); g.fillRect(lx + (cx + rx) * sc, ly + ry * sc + sy, rn * sc, 1); }
        if (o.shine !== false) for (const [rx, ry, rn] of gl.runs) if (ry === 0) { px.col(g, o.shine || '#ffffff'); g.fillRect(lx + (cx + rx) * sc, ly, rn * sc, 1); }
        cx += gl.w + 1;
      }
    });
    return { w: this.width(s, base), h: this.height(lines.length, base) };
  }
};

// ---- 7. PARTICLES: 3D, projected. kinds: dust spark bit ember ring text fire smoke impact glint. g > 0 pulls down, bounce 0..1 ----
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
      let fl = 0;   // particles.ground(x, y, z) -> floor height (side-scroller platforms), looked up per 8-unit column
      if (p.floor !== undefined) fl = p.floor;
      else if (this.ground) { const c = Math.floor(p.x / 8); if (p._fc !== c) { p._fc = c; p._fl = this.ground(p.x, p.y, p.z) || 0; } fl = p._fl; }
      if (p.z < fl && p.kind !== 'ring') { p.z = fl; if (p.bounce) { p.vz = -p.vz * p.bounce; p.vx *= .7; p.vy *= .7; } else p.vz = 0; }
    }
  }
  draw(r) {
    const view = r.view, s = view.scale;
    // flat overhead views have no screen height, so rising particles lift on screen instead
    if (view.isTop) r = Object.create(r, { w: { value: (x, y, z) => { const q = Renderer.prototype.w.call(r, x, y, 0); q[1] -= z * .5; return q; } } });
    for (const p of this.list) {
      if (p.kind !== 'ring' && !r.visible(p.x, p.y, p.z, 12, 12, 12)) continue;
      const u = p.life / p.max, at = () => r.w(p.x, p.y, p.z);
      switch (p.kind) {
        case 'dust': r.queue(p.x, p.y, p.z, g => { const [x, y] = at(), rad = p.size * s * (1 + u * 1.4); px.blend(g, (1 - u) * .85, 'normal', () => { px.disc(g, x, y, rad, p.color); if (rad > 1.5) px.disc(g, x - rad * .3, y - rad * .3, rad * .45, shade(p.color, .18)); }); }); break;
        case 'spark': r.queue(p.x, p.y, p.z, g => { const [x, y] = at(), [x2, y2] = r.w(p.x - p.vx * .025, p.y - p.vy * .025, p.z - p.vz * .025); px.line(g, x, y, x2, y2, u < .5 ? (p.hot || '#fff5cf') : p.color, p.size > 1.5 ? 2 : 1); }); break;
        case 'bit': r.queue(p.x, p.y, p.z, g => { const [x, y] = at(); px.rect(g, x, y, p.size, p.size, p.color); }); break;
        case 'ember': r.queue(p.x, p.y, p.z, g => { const [x, y] = at(); px.blend(g, 1 - u * .8, 'add', () => px.dot(g, x, y, u < .4 ? '#fff0b0' : p.color)); }); break;
        case 'ring': if (view.pitchDeg < 20) r.queue(p.x, p.y, p.z, g => { const [x, y] = at(), rad = lerp(p.r0, p.r1, ease.outQuad(u)) * s, n = Math.max(16, Math.round(rad * 3)); px.blend(g, 1 - u, 'add', () => { px.col(g, p.color); for (let i = 0; i < n; i++) { const a = i / n * TAU; g.fillRect(Math.round(x + Math.cos(a) * rad), Math.round(y + Math.sin(a) * rad * .9), 1, 1); } }); }, { bias: .3 });
          else r.decal(() => r.groundRing(p.x, p.y, lerp(p.r0, p.r1, ease.outQuad(u)), p.color, 1 - u, p.z)); break;
        case 'text': r.overlay(g => { const [x, y] = at(); if (u < .75 || Math.floor(p.life * 20) % 2) E.font.text(g, p.text, x, y, p.color, { align: 'center', scale: p.scale || 1, outline: '#0b0814' }); }); break;
        case 'fire': r.queue(p.x, p.y, p.z, g => {   // white-hot core, yellow, orange, red rim, then smoke
          const [x, y] = at(), rad = p.size * s * (u < .3 ? .6 + u * 1.4 : 1.02 - (u - .3) * .5), c = u < .15 ? '#fffbe0' : u < .3 ? '#ffe070' : u < .5 ? '#ffa030' : u < .7 ? '#e0502a' : '#5a4a4a';
          px.blend(g, u < .7 ? 1 : (1 - u) / .3, 'normal', () => { px.disc(g, x, y, rad, c); if (u < .5) px.disc(g, x - rad * .2, y - rad * .2, rad * .55, u < .25 ? '#ffffff' : '#fff0a0'); else px.disc(g, x - rad * .25, y - rad * .25, rad * .4, shade(c, .2)); });
        }, { bias: .2 }); break;
        case 'smoke': r.queue(p.x, p.y, p.z, g => {   // hard-edged puff in three flat tones
          const [x, y] = at(), rad = p.size * s * (.6 + u * 1.3), body = u < .3 ? (p.dark || '#3a3438') : (p.color || '#7a7078');
          px.blend(g, (1 - u) * .8, 'normal', () => { px.disc(g, x, y, rad, shade(body, -.12)); px.disc(g, x - rad * .18, y - rad * .22, rad * .74, body); px.disc(g, x - rad * .34, y - rad * .4, rad * .34, p.light || shade(body, .22)); });
        }, { bias: .1 }); break;
        case 'impact': r.queue(p.x, p.y, p.z, g => {   // hit star that pops and shrinks
          const [x, y] = at(), R = p.size * s * (u < .35 ? 1 : 1.4 - u), pts = [];
          for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + p.rot, rr = i % 2 ? R * .38 : R; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
          px.poly(g, pts, u < .35 ? '#ffffff' : p.color); px.disc(g, x, y, Math.max(1, R * .3), '#ffffff');
        }, { bias: .4 }); break;
        case 'glint': r.queue(p.x, p.y, p.z, g => { const [x, y] = at(), k = Math.round((1 - Math.abs(u * 2 - 1)) * p.size * 2.5); px.rect(g, x - k, y, k * 2 + 1, 1, p.color); px.rect(g, x, y - k, 1, k * 2 + 1, p.color); px.dot(g, x, y, '#ffffff'); }, { bias: .3 }); break;
      }
    }
  }
  dust(x, y, z, n, o = {}) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = (o.speed || 30) * (.4 + Math.random()); this.add({ kind: 'dust', x: x + Math.cos(a) * 2, y: y + Math.sin(a) * 2, z: z + Math.random() * 2, vx: Math.cos(a) * sp + (o.vx || 0), vy: Math.sin(a) * sp + (o.vy || 0), vz: 8 + Math.random() * 14, g: -6, drag: 5, max: .35 + Math.random() * .35, size: (o.size || 1.2) * (.7 + Math.random() * .6), color: o.color || '#b9a88f' }); } }
  sparks(x, y, z, n, dir = null, o = {}) { for (let i = 0; i < n; i++) { const a = dir === null ? Math.random() * TAU : dir + (Math.random() - .5) * 1.6, sp = 80 + Math.random() * 170; this.add({ kind: 'spark', x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 20 + Math.random() * 110, g: 360, drag: 3, max: .15 + Math.random() * .2, color: o.color || '#ffb85c', hot: o.hot }); } }
  bits(x, y, z, n, colors) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 30 + Math.random() * 90; this.add({ kind: 'bit', x, y, z: z + Math.random() * 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 60 + Math.random() * 120, g: 420, bounce: .45, drag: .8, max: .7 + Math.random() * .6, size: Math.random() < .35 ? 2 : 1, color: colors[(Math.random() * colors.length) | 0] }); } }
  ring(x, y, r0, r1, color, dur = .35, z = 0) { this.add({ kind: 'ring', x, y, z, r0, r1, color, max: dur }); }
  text(x, y, z, text, color = '#fff2c4', o = {}) { this.add({ kind: 'text', x, y, z, vz: o.bounce ? 70 : 38, g: o.bounce ? 260 : 40, bounce: o.bounce ? .35 : 0, floor: o.bounce ? z : undefined, text: String(text), color, max: o.bounce ? 1.1 : .8, scale: o.scale || 1 }); }
  smoke(x, y, z, n = 4, o = {}) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 8 + Math.random() * 14; this.add(Object.assign({ kind: 'smoke', x: x + Math.cos(a) * 3, y: y + Math.sin(a) * 3, z: z + Math.random() * 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 14 + Math.random() * 18, g: -4, drag: 1.5, max: .9 + Math.random() * .7 }, o, { size: (o.size || 4) * (.7 + Math.random() * .6) })); } }
  fire(x, y, z, n = 6, o = {}) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = (o.speed || 40) * Math.random(); this.add({ kind: 'fire', x: x + Math.cos(a) * 2, y: y + Math.sin(a) * 2, z: z + Math.random() * 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 10 + Math.random() * 30, g: -10, drag: 3, max: .35 + Math.random() * .35, size: (o.size || 5) * (.6 + Math.random() * .6) }); } }
  impact(x, y, z, size = 6, color = '#ffe070') { this.add({ kind: 'impact', x, y, z, max: .16, size, color, rot: Math.random() * TAU }); }
  glints(x, y, z, n = 5, color = '#fff6c0', spread = 10) { for (let i = 0; i < n; i++) this.add({ kind: 'glint', x: x + (Math.random() - .5) * spread, y: y + (Math.random() - .5) * spread, z: z + Math.random() * spread, vz: 6, max: .35 + Math.random() * .4, size: 1 + Math.random(), color }); }
  // fireball, smoke, sparks, debris, shockwave ring, shake, hit-stop, flash and sound in one call. o: { debris: [colors] | false, sound, flash, shake, freeze }
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

// ---- 8. RENDERER: the r handed to draw(r). Frame order: background, decals, depth-sorted queue, overlays, present ----
const AS = 256, AOX = 128, AOY = 200;   // scratch image per actor: room for figures up to about 250 px tall
class Renderer {
  constructor(game) {
    this.game = game; this.items = []; this.decals = []; this.overlays = []; this.outline = '#140c1c';
    this.aCv = mkCanvas(AS, AS); this.aG = ctx2d(this.aCv); this.mCv = mkCanvas(AS, AS); this.mG = ctx2d(this.mCv);
    // track what each actor draws, so outline and flash only touch that rectangle
    const aG = this.aG, bb = this.bb = [AS, AS, 0, 0], fr = aG.fillRect.bind(aG), di = aG.drawImage.bind(aG);
    const grow = (x, y, w, h) => { if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (x + w > bb[2]) bb[2] = x + w; if (y + h > bb[3]) bb[3] = y + h; };
    aG.fillRect = (x, y, w, h) => { grow(x, y, w, h); fr(x, y, w, h); };
    aG.drawImage = (img, ...a) => { if (a.length >= 8) grow(a[4], a[5], a[6], a[7]); else if (a.length >= 4) grow(a[0], a[1], a[2], a[3]); else grow(a[0], a[1], img.width, img.height); di(img, ...a); };
    for (const m of ['fill', 'stroke', 'fillText', 'strokeText', 'putImageData']) { const f = aG[m].bind(aG); aG[m] = (...a) => { grow(0, 0, AS, AS); return f(...a); }; }
    this._R = [0, 0, AS, AS];
  }
  get ctx() { return this.game.screen.ctx; }
  get view() { return this.game.view; }
  get W() { return this.game.screen.W; }
  get H() { return this.game.screen.H; }
  get bw() { return this.game.screen.buf.width; }
  get bh() { return this.game.screen.buf.height; }
  begin(cx, cy) {
    const sc = this.game.screen, st = this.game.stats;
    sc.begin(cx, cy, this.game.o.bg);
    this.ix = sc.ix; this.iy = sc.iy; this.items.length = 0; this.decals.length = 0; this.overlays.length = 0; this._map = null; st.actors = 0; st.culled = 0;
  }
  // world -> buffer pixel
  w(x, y, z = 0) { const v = this.game.view; return [v.ax * x + v.ay * y - this.ix, v.bx * x + v.by * y + v.bz * z - this.iy]; }
  queue(x, y, z, fn, o) {
    let k = this.game.view.order(x, y, z) + (o && o.bias || 0);
    if (z > .5 && this._map && !(o && o.occluder)) k = this._map._liftOrder(this.game.view, x, y, z, k);   // standing on a TileMap block: sort after it
    this.items.push({ k, fn });
  }
  decal(fn) { this.decals.push(fn); }
  overlay(fn) { this.overlays.push(fn); }
  groundPts(x, y, rad, n = 18, z = 0) { const pts = []; for (let i = 0; i < n; i++) { const a = i / n * TAU; pts.push(this.w(x + Math.cos(a) * rad, y + Math.sin(a) * rad, z)); } return pts; }
  groundDisc(x, y, rad, color, alpha = 1, z = 0) { px.polyDither(this.ctx, this.groundPts(x, y, rad, 18, z), color, alpha); }
  groundRing(x, y, rad, color, alpha = 1, z = 0) {
    const g = this.ctx, n = Math.max(16, Math.round(rad * this.view.scale * 5)), ga = g.globalAlpha;
    px.col(g, color); g.globalAlpha = ga * qa(alpha);
    for (let i = 0; i < n; i++) { const a = i / n * TAU, [sx, sy] = this.w(x + Math.cos(a) * rad, y + Math.sin(a) * rad, z); g.fillRect(Math.round(sx), Math.round(sy), 1, 1); }
    g.globalAlpha = ga;
  }
  groundArc(x, y, r0, r1, a0, a1, color, alpha = 1, z = 0, g = this.ctx) {
    const n = Math.max(3, Math.ceil(Math.abs(a1 - a0) / .18)), pts = [];
    for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); pts.push(this.w(x + Math.cos(a) * r1, y + Math.sin(a) * r1, z)); }
    for (let i = n; i >= 0; i--) { const a = lerp(a0, a1, i / n); pts.push(this.w(x + Math.cos(a) * r0, y + Math.sin(a) * r0, z)); }
    px.polyDither(g, pts, color, alpha);
  }
  _stamp(key, make) {
    const m = this._stamps || (this._stamps = new Map());
    let st = m.get(key); if (st) return st;
    if (m.size > 400) m.clear();
    st = make(); m.set(key, st); return st;
  }
  // contact shadow: a cached translucent ellipse, correct for the view. z = height of the surface it falls on
  shadow(x, y, rad, alpha = .5, color = '#0c0818', z = 0) {
    const draw = () => {
      const v = this.view, R = Math.round(rad * 2) / 2, A = Math.round(alpha * 20) / 20;
      const st = this._stamp('s' + v.id + v.pitchDeg + v.yawDeg + v.scale + ':' + R + ':' + A + color, () => {
        const pts = []; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (let i = 0; i < 18; i++) { const a = i / 18 * TAU, q = v.p(Math.cos(a) * R, Math.sin(a) * R, 0); pts.push(q); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
        const ox = Math.floor(x0) - 1, oy = Math.floor(y0) - 1, c = mkCanvas(Math.ceil(x1) - ox + 2, Math.ceil(y1) - oy + 2);
        px.polyDither(ctx2d(c), pts.map(q => [q[0] - ox, q[1] - oy]), color, A);
        return { c, ox, oy };
      });
      const [sx, sy] = this.w(x, y, z); this.ctx.drawImage(st.c, Math.round(sx) + st.ox, Math.round(sy) + st.oy);
    };
    if (z > .5) this.queue(x, y, z - .01, draw, { bias: -.001 }); else this.decal(draw);
  }
  // pixel sprite (E.sprite) standing at a world point. o: { flip, anchor: 'bottom' | 'center' | 'top', bias, flash, outline, alpha }
  sprite(x, y, z, spr, o = {}) {
    if (!spr || !spr.isSprite) { warn('r.sprite', 'r.sprite(x, y, z, spr) needs a sprite made with E.sprite(rows, colors)'); return; }
    const ax = Math.floor(spr.w / 2), ay = o.anchor === 'center' ? Math.floor(spr.h / 2) : o.anchor === 'top' ? 0 : spr.h, flip = !!o.flip;
    if (o.flash || o.outline || (o.alpha !== undefined && o.alpha < 1)) { this.actor(x, y, z, (g, ox, oy) => px.sprite(g, spr, ox - ax, oy - ay, flip), Object.assign({ outline: false }, o)); return; }
    if (!this.visible(x, y, z, spr.w + 8, spr.h + 8, spr.h + 8)) return;
    this.queue(x, y, z, g => { const [sx, sy] = this.w(x, y, z); px.sprite(g, spr, Math.round(sx) - ax, Math.round(sy) - ay, flip); }, { bias: o.bias });
  }
  // background gradient bands, top to bottom (call first in draw): r.sky(['#0b1030', '#3b2d6b', '#e0806a'], { bands })
  sky(colors, o = {}) {
    if (typeof colors === 'string') colors = [colors];
    const W = this.bw, H = this.bh;
    this.ctx.drawImage(this._stamp('sky' + colors.join() + W + 'x' + H + (o.bands || 0), () => {
      const c = mkCanvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data, cs = colors.map(hex), n = cs.length, steps = o.bands || 0;
      for (let y = 0; y < H; y++) {
        let f = n < 2 ? 0 : y / Math.max(1, H - 1) * (n - 1); if (steps) f = Math.round(f * steps) / steps;
        const i = Math.min(n - 2, Math.max(0, Math.floor(f))), t = f - i, col = n < 2 ? cs[0] : cs[i].map((v, j) => Math.round(lerp(v, cs[i + 1][j], t) / 8) * 8);
        for (let x = 0; x < W; x++) { const k = (y * W + x) * 4; d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255; }
      }
      g.putImageData(img, 0, 0); return c;
    }), 0, 0);
  }
  // scrolling stars: { count: 70, speed: 30, dir: 'down' | 'up' | 'left' | 'right', colors, layers: 3, seed, height: 0..1 }
  starfield(o = {}) {
    const g = this.ctx, W = this.bw, H = this.bh, t = this.game.time, n = o.count || 70, sp = o.speed === undefined ? 30 : o.speed;
    const cols = o.colors || ['#ffffff', '#a9b8ff', '#5d6aa0'], layers = o.layers || 3, seed = o.seed || 7, dir = o.dir || 'down', maxY = o.height ? H * o.height : H;
    for (let i = 0; i < n; i++) {
      const L = i % layers, d = t * sp * (1 - L / (layers + .5));
      let x = hash2(i, seed) * W, y = hash2(i + 7919, seed) * maxY;
      if (dir === 'down') y += d; else if (dir === 'up') y -= d; else if (dir === 'left') x -= d; else x += d;
      x = ((x % W) + W) % W; y = ((y % maxY) + maxY) % maxY;
      const c = cols[Math.min(cols.length - 1, L)];
      px.dot(g, x, y, c);
      if (L === 0 && hash2(i, seed + 1) > .75) { if (dir === 'down' || dir === 'up') px.dot(g, x, y + (dir === 'down' ? -1 : 1), c); else px.dot(g, x + (dir === 'left' ? 1 : -1), y, c); }
    }
  }
  text(str, x, y, color = '#ffffff', o) { this.overlay(g => E.font.text(g, str, x, y, color, o)); }
  textAt(x, y, z, str, color = '#ffffff', o = {}) { this.overlay(g => { const [sx, sy] = this.w(x, y, z); E.font.text(g, str, sx, sy, color, Object.assign({ align: 'center' }, o)); }); }
  // additive glow halo (cached): glowDisc(g, x, y, radius, color, 0..1)
  glowDisc(g, cx, cy, rad, color, a) {
    const R = Math.round(rad * 2) / 2, A = Math.round(a * 20) / 20, n = Math.ceil(R) + 1;
    const st = this._stamp('d' + R + ':' + A + color, () => { const c = mkCanvas(n * 2 + 1, n * 2 + 1); px.ddisc(ctx2d(c), n, n, R, color, Math.min(1, A * 1.6)); return c; });
    px.blend(g, 1, 'add', () => g.drawImage(st, Math.round(cx) - n, Math.round(cy) - n));
  }
  // extruded box (crate, pedestal, table) inside a queue fn: r.box(g, x0, y0, z0, x1, y1, z1, topColor, sideColor)
  box(g, x0, y0, z0, x1, y1, z1, top, side) {
    if (typeof top !== 'string' || typeof side !== 'string') { warn('box:args', 'r.box(g, x0, y0, z0, x1, y1, z1, topColor, sideColor) needs 9 arguments'); top = typeof top === 'string' ? top : '#ff00ff'; side = typeof side === 'string' ? side : top; }
    const view = this.view, P = (x, y, z) => this.w(x, y, z);
    if (!view.isTop) for (const [nx, ny, A, B] of [[0, -1, [x1, y0], [x0, y0]], [0, 1, [x0, y1], [x1, y1]], [-1, 0, [x0, y0], [x0, y1]], [1, 0, [x1, y1], [x1, y0]]]) {
      if (nx * view.fx + ny * view.fy <= .02) continue;
      const lit = .6 * nx + .8 * ny;
      px.poly(g, [P(A[0], A[1], z0), P(B[0], B[1], z0), P(B[0], B[1], z1), P(A[0], A[1], z1)], lit < -.2 ? shade(side, .12) : lit > .5 ? shade(side, -.25) : side);
    }
    px.poly(g, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], top);
  }
  visible(x, y, z = 0, mx = 60, up = 30, down = 90) { const [sx, sy] = this.w(x, y, z); return sx > -mx && sx < this.bw + mx && sy > -up && sy < this.bh + down; }
  // a character: drawFn(g, ox, oy) draws around (ox, oy) = where world point (x, y, z) lands. o: { outline = true, outlineColor, flash: '#fff' | true, flashMix: .5, alpha, bias, margin }
  actor(x, y, z, drawFn, o = {}) {
    const st = this.game.stats;
    if (!this.visible(x, y, z, o.margin || 60)) { st.culled++; return; }
    st.actors++;
    if (o.outline === false && !o.flash && (o.alpha === undefined || o.alpha >= 1)) { this.queue(x, y, z, g => { const [a, b] = this.w(x, y, z); drawFn(g, Math.round(a), Math.round(b)); }, { bias: o.bias }); return; }
    this.queue(x, y, z, g => this._composite(g, x, y, z, drawFn, o), { bias: o.bias });
  }
  _tint(dst, src, color, R) {
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
    const put = cv => g.drawImage(cv, x0, y0, w, h, bx + x0, by + y0, w, h);
    g.globalAlpha = al;
    if (o.outline !== false) { this._tint(this.mG, this.aCv, o.outlineColor || this.outline, R); for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.drawImage(this.mCv, x0, y0, w, h, bx + x0 + dx, by + y0 + dy, w, h); }
    if (o.flash) {   // the flash tints over the sprite so its shading still shows (flashMix: 1 = solid)
      const fm = o.flashMix === undefined ? .5 : o.flashMix;
      if (fm < 1) put(this.aCv);
      this._tint(this.mG, this.aCv, typeof o.flash === 'string' ? o.flash : '#fff6ea', R); g.globalAlpha = al * fm; put(this.mCv);
    } else put(this.aCv);
    g.globalAlpha = 1;
  }
  finish() {
    const g = this.ctx, items = this.items;
    this.game.particles.draw(this);
    for (const d of this.decals) d(g);
    items.sort((a, b) => a.k - b.k);
    for (const it of items) it.fn(g);
    for (const f of this.overlays) f(g);
    this.game.stats.items = items.length;
    this.game.screen.present();
  }
}

// ---- 9. GAME: loop, fixed-step clock, scenes, camera, hit-stop, shake, flash, timers, on-screen errors ----
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
    this.view = this._view(this.o.view) || E.VIEWS.iso;
    this.views = this.o.views || null;   // views the game supports: nextView() cycles them
    this.time = 0; this.real = 0; this.hitstop = 0; this.timeScale = 1; this.shakeAmt = 0; this.reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    // smooth = seconds of lag (0 = locked), bounds(view) = clamp rect, room = [w, h] screen-by-screen rooms, moving = sliding between rooms
    this.cam = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, tz: 0, smooth: .18, bounds: null, snap: true, room: null, moving: false };
    this.particles = new Particles(this); this.r = new Renderer(this); this.audio = new ChipAudio(this);
    this.fps = 60; this.paused = false; this.pauseOverlay = true; this.timers = []; this.errors = []; this._errKeys = new Set();
    this.fadeTime = .22; this._fade = null; this.scenes = null; this.scene = null; this.sceneName = null; this._next = null;
    this.stats = { updateMs: 0, renderMs: 0, frameMs: 16.7, steps: 0, items: 0, actors: 0, culled: 0 };
    E.current = this;
  }
  static _makeCanvas() {
    const c = document.createElement('canvas'); c.id = 'screen';
    c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;image-rendering:pixelated;background:#000;touch-action:none';
    document.body.style.margin = '0'; document.body.appendChild(c); return c;
  }
  get W() { return this.screen.W; }
  get H() { return this.screen.H; }
  _view(v) {
    if (v instanceof View) return v;
    const w = E.VIEWS[v];
    if (!w) warn('view:' + v, 'unknown view "' + v + '". Use one of: ' + Object.keys(E.VIEWS).join(', ') + ', or a new E.View(...)');
    return w || null;
  }
  setView(v) { const w = this._view(v); if (w) { this.view = w; this.cam.snap = true; } }
  nextView(dir = 1) { const list = this.views || E.VIEW_ORDER, i = list.indexOf(this.view.id); this.setView(list[((i + dir) % list.length + list.length) % list.length]); }
  note(text, seconds = 1.2) { this._note = { text: String(text), end: this.real + seconds }; }
  shake(a) { if (!this.reduceMotion) this.shakeAmt = Math.min(10, this.shakeAmt + a); }
  // a good hit in one call: hit-stop, shake, impact star, sparks, damage number, sound. o: { power: 1, angle, damage, color, textColor, textScale, textZ: 22, bounce, sound }
  hitFx(x, y, z, o = {}) {
    const p = o.power === undefined ? 1 : o.power, P = this.particles;
    this.freeze(.035 + .03 * p); this.shake(1.5 + 1.5 * p);
    P.impact(x, y, z, 5 + 3 * p, o.color || '#ffe070');
    P.sparks(x, y, z, Math.round(5 + 5 * p), o.angle === undefined ? null : o.angle, { color: o.color || '#ffb85c' });
    if (o.damage !== undefined) P.text(x + (Math.random() - .5) * 10, y, z + (o.textZ === undefined ? 22 : o.textZ), o.damage, o.textColor || '#fff2c4', { bounce: o.bounce !== false, scale: o.textScale || 1 });
    if (o.sound !== false) this.audio.sfx(o.sound || (p > 1.3 ? 'kick' : 'hit'));
    if (p >= 2) this.flash('#ffffff', .06);
  }
  flash(color = '#ffffff', seconds = .12, strength = 1) { if (this.reduceMotion) seconds *= .4; this._flash = { color, t: 0, dur: seconds, k: strength }; }
  freeze(s) { this.hitstop = Math.max(this.hitstop, s); }
  focus(x, y, z = 0) { this.cam.tx = x; this.cam.ty = y; this.cam.tz = z; }
  // keep the camera on an object: follow(hero, { z: 16, lead: 0 }); follow(null) stops
  follow(target, o = {}) { this._follow = target ? { target, z: o.z === undefined ? 16 : o.z, lead: o.lead || 0 } : null; this.cam.snap = true; }
  mouseGround() { const m = this.input.mouseScreen(); return m ? this.view.toGround(m[0], m[1]) : null; }
  after(seconds, fn) { const t = { at: this.time + seconds, fn, every: 0, dead: false }; this.timers.push(t); return { cancel() { t.dead = true; } }; }
  every(seconds, fn) { const t = { at: this.time + seconds, fn, every: Math.max(1e-3, seconds), dead: false }; this.timers.push(t); return { cancel() { t.dead = true; } }; }
  _camStep(dt) {
    const c = this.cam; let fx = c.tx, fy = c.ty, fz = c.tz;
    if (c.room) {
      const rw = Array.isArray(c.room) ? c.room[0] : c.room.w, rh = Array.isArray(c.room) ? c.room[1] : c.room.h;
      fx = (Math.floor(fx / rw) + .5) * rw;
      if (this.view.isSide) fz = (Math.floor(fz / rh) + .5) * rh; else fy = (Math.floor(fy / rh) + .5) * rh;
    }
    const [sx, sy] = this.view.p(fx, fy, fz);
    let tx = sx - this.screen.W / 2, ty = sy - this.screen.H / 2;
    const b = c.bounds && c.bounds(this.view);
    if (b) {
      const W = this.screen.W, H = this.screen.H, bottom = (c.align || (this.view.pitchDeg < 40 ? 'bottom' : 'center')) === 'bottom';
      tx = b.x1 - b.x0 < W ? (b.x0 + b.x1 - W) / 2 : clamp(tx, b.x0, b.x1 - W);
      ty = b.y1 - b.y0 < H ? (bottom ? b.y1 - H : (b.y0 + b.y1 - H) / 2) : clamp(ty, b.y0, b.y1 - H);   // a short side-view level sits on the bottom edge
    }
    if (c.snap || !(c.smooth > 0)) { c.x = tx; c.y = ty; c.vx = c.vy = 0; c.snap = false; c.moving = false; return; }
    [c.x, c.vx] = smoothDamp(c.x, tx, c.vx, c.smooth, dt);
    [c.y, c.vy] = smoothDamp(c.y, ty, c.vy, c.smooth, dt);
    c.moving = Math.hypot(tx - c.x, ty - c.y) > 1.5;
  }
  // game.start({ update(dt), draw(r) }) or game.start({ scenes: { title: {...}, play: {...} }, scene: 'title' })
  start(hooks) {
    if (!hooks || typeof hooks !== 'object') throw new Error('game.start needs { update(dt), draw(r) } or { scenes: { name: { update, draw } }, scene: "name" }');
    if (hooks.scenes) { this.scenes = hooks.scenes; this._enter(hooks.scene || Object.keys(hooks.scenes)[0], hooks.data); }
    else {
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
      const sdt = dt * this.timeScale, steps = Math.max(1, Math.ceil(sdt / this.o.step - 1e-6)), h = sdt / steps, t0 = performance.now();
      try { for (let i = 0; i < steps; i++) this._step(h); } catch (e) { this._fail('update', e); }
      const t1 = performance.now();
      try { this._frame(); } catch (e) { this._fail('draw', e); try { this.screen.present(); } catch (e2) { /* nothing to show */ } }
      const st = this.stats; st.updateMs = t1 - t0; st.renderMs = performance.now() - t1; st.frameMs = dt * 1000; st.steps = steps;
    };
    requestAnimationFrame(frame);
  }
  // switch scene (fades through black unless o.fade is 0): game.go('play', { level: 2 })
  go(name, data, o = {}) {
    if (!this.scenes) { warn('go:noscenes', 'game.go() needs game.start({ scenes: {...}, scene }) first'); return; }
    if (!this.scenes[name]) { warn('go:' + name, 'game.go("' + name + '"): no such scene. Scenes: ' + Object.keys(this.scenes).join(', ')); return; }
    const fade = o.fade === undefined ? this.fadeTime : o.fade;
    if (fade > 0 && this.scene) this._fade = { t: 0, dur: fade, name, data, out: true };
    else { this._fade = null; this._next = { name, data }; }
  }
  _enter(name, data) {
    const s = this.scenes[name];
    if (!s) throw new Error('scene "' + name + '" does not exist. Scenes: ' + Object.keys(this.scenes).join(', '));
    if (this.scene && this.scene.exit) this.scene.exit();
    this.scene = s; this.sceneName = name; this.paused = false; this.timers.length = 0; this.hitstop = 0;
    this.particles.list.length = 0; this.cam.snap = true; this.audio._duck(false); this._follow = null;
    if (s.view) this.setView(s.view);
    if (s.views) this.views = s.views;
    if (s.input) this.input.use(s.input);
    if (s.res) this.screen.setOptions({ res: s.res });
    if (s.enter) s.enter(data);
  }
  _fail(where, e) {
    const msg = (e && e.message) || String(e), key = where + ':' + msg;
    if (!this._errKeys.has(key)) {
      this._errKeys.add(key); this.errors.push({ where, scene: this.sceneName, message: msg, stack: e && e.stack });
      console.error('my-3D2dge: error in ' + where + (this.sceneName ? ' (scene "' + this.sceneName + '")' : '') + ': ' + ((e && e.stack) || msg));
    }
    E.showError('error in ' + where + '()' + (this.sceneName && this.sceneName !== 'main' ? ' of scene "' + this.sceneName + '"' : ''), e);
  }
  _step(dt) {
    if (this._next) { const nx = this._next; this._next = null; this._enter(nx.name, nx.data); }
    this.real += dt; this.shakeAmt *= Math.exp(-dt * 9); this.input.tick(dt);
    if (this._flash) this._flash.t += dt / Math.max(.05, this.timeScale);   // real time: slow motion does not stretch a flash
    const f = this._fade;
    if (f) {   // the old scene freezes while it fades out
      f.t += dt;
      if (f.out) { if (f.t >= f.dur) { f.out = false; f.t = 0; this._enter(f.name, f.data); } return; }
      if (f.t >= f.dur) this._fade = null;
    }
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
    const fo = this._follow;
    if (fo && fo.target) {
      const t = fo.target, sp = Math.hypot(t.vx || 0, t.vy || 0), dir = typeof t.facing === 'number' && Math.abs(t.facing) === 1 && !t.vy ? [t.facing, 0] : sp > 1 ? [(t.vx || 0) / sp, (t.vy || 0) / sp] : [0, 0];
      this.focus(t.x + dir[0] * fo.lead, (t.y || 0) + dir[1] * fo.lead, (t.z || 0) + fo.z);
    }
    this.particles.update(dt);
    this._camStep(dt);
  }
  _frame() {
    if (this._next) { const nx = this._next; this._next = null; this._enter(nx.name, nx.data); }
    const c = this.cam, s = this.shakeAmt, r = this.r;
    const shx = s > .05 ? (Math.sin(this.real * 83) + Math.sin(this.real * 57.3)) * .5 * s : 0, shy = s > .05 ? (Math.sin(this.real * 71) + Math.sin(this.real * 49.7)) * .5 * s : 0;
    r.begin(c.x + shx, c.y + shy);
    if (this.scene && this.scene.draw) this.scene.draw(r);
    const fill = (g, color, alpha, mode) => { g.save(); g.fillStyle = color; g.globalAlpha = alpha; if (mode) g.globalCompositeOperation = mode; g.fillRect(0, 0, r.bw, r.bh); g.restore(); g._c = null; };
    if (this._note && this.real < this._note.end) { const n = this._note; r.overlay(g => E.font.text(g, n.text, r.W / 2, 3, '#ffffff', { align: 'center', shadow: '#000', outline: false })); }
    if (this.paused && this.pauseOverlay) r.overlay(g => {
      fill(g, '#05030c', .55);
      E.font.text(g, 'PAUSED', r.W / 2, r.H / 2 - 8, '#ffffff', { align: 'center', scale: 2 });
      E.font.text(g, 'PRESS ESC OR START', r.W / 2, r.H / 2 + 8, '#c9c0e0', { align: 'center' });
    });
    const fx = this._flash;
    if (fx) { const a = (1 - fx.t / fx.dur) * (fx.k === undefined ? 1 : fx.k); if (a <= 0) this._flash = null; else r.overlay(g => fill(g, fx.color, qa(a * .75), 'lighter')); }
    const fd = this._fade, fl = fd ? clamp(fd.out ? fd.t / fd.dur : 1 - fd.t / fd.dur, 0, 1) : 0;
    if (fl > 0) r.overlay(g => fill(g, '#000000', Math.round(fl * 16) / 16));
    r.finish();
  }
}
E.Game = Game;

// ---- 10. HUMANOID: a 3D skeleton posed by math every step (IK legs and arms, gait, poses, attacks, cape cloth), drawn as shaded pixel art ----
//   local frame: f = forward, r = right, z = up. update(dt, state) then draw(g, ox, oy, view) inside r.actor
const HUMAN_COLORS = {
  skin: '#f1c7a0', hair: '#3b2a2f', cloth: '#2f8f86', pants: '#3b3552', boot: '#6a4128', belt: '#e0a84a',
  cape: '#c8452f', capeIn: '#7a2622', metal: '#dce8f1', hilt: '#e8b04e', eye: '#1a1320'
};
const JOINT_KEYS = ['hipL', 'hipR', 'kneeL', 'kneeR', 'footL', 'footR', 'hipC', 'shC', 'shL', 'shR', 'head', 'elbowL', 'elbowR', 'handL', 'handR'];
const BUILDS = {
  chibi: {},
  heroic: { legUpper: 7.4, legLower: 7.4, hipZ: 14.3, torso: 9.6, shoulderHalf: 3.5, headR: 3.05, neck: 1.5, armUpper: 5.5, armLower: 5.4, hipHalf: 1.8, stride: 7.8, speedRef: 80 },
  bulky: { legUpper: 6.4, legLower: 6.2, hipZ: 12.2, torso: 9.4, shoulderHalf: 4.6, headR: 3.2, neck: .9, armUpper: 5.2, armLower: 5.2, hipHalf: 2.4, limbW: 2.6, torsoW: 4.2, footSpread: 2.4, stride: 6.6, speedRef: 60 }
};
class Humanoid {
  constructor(o = {}) {
    if (o.build && !BUILDS[o.build]) warn('build:' + o.build, 'Humanoid build "' + o.build + '" is unknown (chibi, heroic, bulky)');
    o = Object.assign({}, BUILDS[o.build] || {}, o);
    this.o = Object.assign({
      legUpper: 6, legLower: 6, hipZ: 11.6, hipHalf: 1.9, footSpread: 1.9, torso: 8, shoulderHalf: 3.3, neck: 1.2, headR: 3.4,
      armUpper: 4.6, armLower: 4.6, limbW: 2, torsoW: 3, lean: 0, hunch: 0, stride: 6.5, lift: 3.4, swing: 4, speedRef: 70,
      weapon: 'sword', bladeLen: 11, cape: null, hood: false, eyeGlow: null, hat: null,
      size: 1, hair: 'short', outfit: 'shirt', sleeves: 'short', cheat: .5
    }, o);
    this._cheat = 0;
    if (typeof this.o.hair === 'string' || !this.o.hair) this.o.hair = { style: this.o.hair || 'short' };
    if (this.o.weapon && !['sword', 'gun', 'staff'].includes(this.o.weapon)) { warn('weapon:' + this.o.weapon, 'Humanoid weapon "' + this.o.weapon + '" is not built in (sword, gun, staff or null); drawing a sword'); this.o.weapon = 'sword'; }
    if (typeof this.o.hat === 'string') this.o.hat = { style: this.o.hat };
    this.C = Object.assign({}, HUMAN_COLORS, o.colors || {});
    const C = this.C;
    C.clothLt = C.clothLt || shade(C.cloth, .25);
    this.t = Math.random() * 10; this.phase = 0; this.spW = 0; this.mv = [1, 0]; this.dashW = 0; this.hurtW = 0; this.atkW = 0;
    this.theta = 1.2; this.atkZ = 10; this.reach = 7; this.twist = 0; this.spin = 0; this.atkLean = 0;
    this.sq = 0; this.sqV = 0; this.blink = 2; this.facing = 0; this.x = 0; this.y = 0; this.z = 0; this.J = {};
    this.capeL = null; this.airW = 0; this.pointW = 0; this.kicking = false;
    this._pose();
  }
  kick(v) { this.sqV += v; }
  hand(which = 'R') { const w = this._w(this.J['hand' + which] || this.J.handR); return [this.x + w[0], this.y + w[1], this.z + w[2]]; }
  tip() { const J = this.J, L = this.o.weapon === 'gun' ? 5 : this.o.weapon === 'staff' ? 10 : this.o.bladeLen, w = this._w(V3.add(J.handR, V3.mul(J.bladeDir, L))); return [this.x + w[0], this.y + w[1], this.z + w[2]]; }
  _w(p) {
    const a = this.facing + this.spin + this._cheat, c = Math.cos(a), s = Math.sin(a), sz = this.o.size, k = (1 - this.sq * .4) * sz;
    return [(p[0] * c - p[1] * s) * k, (p[0] * s + p[1] * c) * k, p[2] * (1 + this.sq) * sz];
  }
  update(dt, s = {}) {
    const o = this.o;
    if (this.t > 0 && Math.hypot((s.x || 0) - this.x, (s.y || 0) - this.y, (s.z || 0) - this.z) > 24 * o.size) this.capeL = null;
    this.t += dt; this.x = s.x; this.y = s.y; this.z = s.z || 0; this.facing = s.facing || 0;
    const speed = s.run ? s.run * o.speedRef : Math.hypot(s.vx || 0, s.vy || 0);
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
    const pk = this.poseW || (this.poseW = { cheer: 0, cast: 0, guard: 0, kneel: 0, crouch: 0, wave: 0, hips: 0, block: 0 });
    for (const k in pk) pk[k] = approach(pk[k], s.pose === k ? 1 : 0, dt * 9);
    this.stW = approach(this.stW || 0, s.stance === 'guard' ? 1 : 0, dt * 10); this.rdW = approach(this.rdW || 0, s.stance === 'ready' ? 1 : 0, dt * 10);
    this.climbW = approach(this.climbW || 0, s.climb ? 1 : 0, dt * 12); if (s.climb) this.climbP = (this.climbP || 0) + dt * Math.abs(s.vz || 0) / (.4 * (o.armUpper + o.armLower) * o.size) * Math.PI;
    this.dieT = s.pose === 'die' ? (this.dieT || 0) + dt : 0;
    const dT = s.down !== undefined ? clamp(+s.down, 0, 1) : s.pose === 'down' || this.dieT > .45 ? 1 : 0;
    this.downW = approach(this.downW || 0, dT, dt * (dT > (this.downW || 0) ? 2.5 + 10 * (this.downW || 0) : 3.2));
    if (this.dieT > 0) { this.hurtW = approach(this.hurtW, this.dieT < .25 ? 1 : 0, dt * 14); pk.kneel = approach(pk.kneel, this.dieT > .2 && this.dieT < .6 ? 1 : 0, dt * 10); }
    this.pointW = approach(this.pointW, s.point ? 1 : 0, dt * (s.point ? 30 : 8));
    this.aimA = approach(this.aimA || 0, s.aim || 0, dt * 14);
    if (s.attack) this.kicking = !!s.attack.spec.kick;
    this.blink -= dt; if (this.blink < -.12) this.blink = 2 + Math.random() * 3;
    this.sqV += (-260 * this.sq - 15 * this.sqV) * dt; this.sq = clamp(this.sq + this.sqV * dt, -.3, .3);
    const A = s.attack; let tLean = 0, tTwist = 0, tLunge = 0, tHop = 0, tCrouch = 0, armT = A ? 1 : 0;
    this.spin = 0;
    this.sidePlane = !!A && !A.spec.kick && (A.spec.plane ? A.spec.plane === 'side' : o.swingPlane ? o.swingPlane === 'side' : this._pitch !== undefined && this._pitch < 15 && !!o.weapon && A.spec.blade !== 0 && A.spec.hand !== 'L');
    if (A) {
      const sp = A.spec, side = this.sidePlane, rest = side ? -.9 : 1.1, RS = sp.rel ? (o.armUpper + o.armLower) / 9.2 : 1, R = (sp.reach || 7.5) * RS, r0 = sp.r0 === undefined ? R : sp.r0 * RS, r1 = sp.r1 === undefined ? R : sp.r1 * RS;
      this.atkRel = !!sp.rel; const zRest = sp.rel ? (sp.kick ? .1 : -7) : 9, z0 = sp.z0 === undefined ? zRest : sp.z0, z1 = sp.z1 === undefined ? z0 : sp.z1;
      const hold = sp.hold === undefined ? .3 : sp.hold, lean = sp.lean === undefined ? (sp.kick ? -.22 : .3) : clamp(sp.lean, -.8, .8), lunge = sp.lunge === undefined ? (sp.kick ? .4 : 1.2) : clamp(sp.lunge, -4, 5);
      if (A.phase === 'wind' && (this._aPh !== 'wind' || this._aSp !== sp)) {
        const chain = (this.armW || 0) > .3 && this.theta !== undefined, fists = !o.weapon || sp.hand === 'L' || sp.blade === 0;
        this._th0 = chain ? this.theta : rest; this._z0 = chain && this.atkRel === !!sp.rel && isFinite(this.atkZ) ? this.atkZ : fists ? z0 : zRest; this._r0 = chain ? this.reach : R * .75;
        const J = this.J; if (J.handR) this._from = { R: J.handR.slice(), L: J.handL.slice(), bd: J.bladeDir.slice() };
      }
      this._aPh = A.phase; this._aSp = sp; this.atkHand = sp.hand || 'R'; if (A.phase !== 'wind') this._windK = 1;
      if (A.phase === 'wind') {
        const k = ease.outQuad(A.u);
        this.theta = lerp(this._th0, sp.a0, k); this.atkZ = lerp(this._z0, z0, A.u); this.reach = lerp(this._r0, r0, k); this._windK = k;
        tLean = -Math.abs(lean) * .45; tLunge = -lunge * .3 * k; tCrouch = clamp(sp.crouch === undefined ? (sp.kick ? 0 : .15) : sp.crouch, 0, 1) * k;
      } else if (A.phase === 'active') {
        const k = ease.outCubic(A.u);
        this.theta = sp.spin ? sp.a0 : lerp(sp.a0, sp.a1, k); this.atkZ = lerp(z0, z1, k); this.reach = lerp(r0, r1, k);
        tLean = lean; tLunge = lunge * k; tHop = clamp(sp.hop || 0, 0, 12) * Math.sin(k * Math.PI); tCrouch = clamp(sp.crouch === undefined ? (sp.kick ? 0 : .15) : sp.crouch, 0, 1) * (1 - k);
        if (sp.spin) { if (side) this.theta = sp.a0 - TAU * k; else this.spin = -TAU * k; }
      } else {
        const k = ease.outQuad(clamp(A.u / hold, 0, 1)), span = sp.spin ? 0 : sp.a1 - sp.a0;
        this.theta = (sp.spin ? sp.a0 : sp.a1) + span * .08 * k; this.atkZ = z1; this.reach = r1;
        armT = A.u < hold ? 1 : 1 - ease.inOut((A.u - hold) / (1 - hold));
        tLean = lean * armT; tLunge = lunge * armT;
      }
      tTwist = sp.spin ? 0 : clamp(this.theta * (side ? .08 : .32) * (sp.twist === undefined ? 1 : sp.twist) * (this.atkHand === 'L' ? -1 : 1), -.7, .7);
    } else { this._windK = 1; this._aPh = null; }
    this.armW = approach(this.armW || 0, armT, dt * (armT > (this.armW || 0) ? 30 : 12));
    this.lunge = lerp(this.lunge || 0, tLunge, Math.min(1, dt * 22)); this.hop = lerp(this.hop || 0, tHop, Math.min(1, dt * 25)); this.crouchA = lerp(this.crouchA || 0, tCrouch, Math.min(1, dt * 20));
    this.atkLean = lerp(this.atkLean, tLean, Math.min(1, dt * 25));
    this.twist = lerp(this.twist, tTwist, Math.min(1, dt * 25));
    this._pose();
    if (o.cape) this._cape(dt);
  }
  _pose() {
    const o = this.o, J = this.J, sp = Math.min(1, this.spW), mf = this.mv[0], mr = this.mv[1], ph = this.phase, dash = this.dashW, hurt = this.hurtW, rz = V3.rz, add = V3.add;
    const breathe = Math.sin(this.t * 2.3) * (1 - sp);
    const bob = (.5 - Math.abs(Math.cos(ph)) * 1.3) * sp;
    const PW = this.poseW || { cheer: 0, cast: 0, guard: 0, kneel: 0 }, kn = PW.kneel, lg = this.lunge || 0, cw = this.climbW || 0;
    const cr = Math.max(PW.crouch || 0, this.crouchA || 0, Math.sin(clamp(this.downW || 0, 0, 1) * Math.PI) * .85);
    const sway = Math.sin(this.t * 1.15) * .3 * (1 - sp) * (1 - this.atkW);
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
      if (lg > 0) foot[0] += (s === (this.atkHand === 'L' ? 1 : -1) ? lg * 1.3 : -lg * .15) * (1 - sp);
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
    const aT = this.sidePlane ? add(shC, [Math.cos(this.theta) * this.reach, sA * .8, Math.sin(this.theta) * this.reach]) : add(shC, [Math.cos(this.theta) * this.reach, Math.sin(this.theta) * this.reach, this.atkRel ? this.atkZ : this.atkZ - shC[2]]);
    const aDir = this.sidePlane ? V3.norm([Math.cos(this.theta), .05, Math.sin(this.theta)]) : V3.norm([Math.cos(this.theta), Math.sin(this.theta), -.12]);
    for (const s of [-1, 1]) {
      const sh = s > 0 ? J.shR : J.shL, q = ph + (s > 0 ? 0 : Math.PI), along = -Math.sin(q) * o.swing * sp;
      let hand = add(sh, [mf * along + .5 * (1 - sp) + o.hunch * 3, s * .9 + mr * along, -armLen * .86 + Math.abs(Math.sin(q)) * 1.2 * sp]);
      hand = V3.lerp(hand, add(sh, [-4.5, s * 1.6, -5]), dash);
      hand = V3.lerp(hand, add(sh, s > 0 ? [1.4, -.6, .6] : [-1.6, s * 2.2, -3.2]), hurt);
      if (this.airW > 0) hand = V3.lerp(hand, add(sh, [1.2, s * 2.6, -1.2]), this.airW * .7);
      if (s > 0 && this.pointW > 0) { const aa = this.aimA || 0; hand = V3.lerp(hand, add(sh, [armLen * .92 * Math.cos(aa), -.6, armLen * .92 * Math.sin(aa) - .4]), this.pointW); }
      if (PW.cheer > 0) hand = V3.lerp(hand, add(sh, [.6, s * 1.4, armLen * (.74 + .12 * Math.sin(this.t * 9 + (s > 0 ? 0 : .7)))]), PW.cheer);
      if (PW.cast > 0) hand = V3.lerp(hand, add(shC, [armLen * .82, s * 1.3, -1.2]), PW.cast);
      const guardAt = add(shC, s < 0 ? [3.8, -1, .4] : [2.3, 1.5, -.6]);
      if (PW.guard > 0) hand = V3.lerp(hand, guardAt, PW.guard);
      if (this.stW > 0) hand = V3.lerp(hand, guardAt, this.stW * (1 - dash));
      if (this.rdW > 0 && o.weapon) hand = V3.lerp(hand, s > 0 ? add(shC, [2.8, .9, -3]) : add(shC, [2.2, .2, -3.6]), this.rdW * (1 - dash));
      if (PW.wave > 0 && s === (o.weapon ? -1 : (this._camSide || 1))) { const w = Math.sin(this.t * 11); hand = V3.lerp(hand, add(sh, [.8 + w * 1.7, s * (2 + Math.max(0, w) * 1.4), armLen * .8]), PW.wave); }
      if (PW.hips > 0) hand = V3.lerp(hand, add(s > 0 ? J.hipR : J.hipL, [-.2, s * 1.5, 1.5]), PW.hips);
      if (PW.block > 0) hand = V3.lerp(hand, add(shC, s > 0 ? [2.6, .6, -2.4] : [2.4, -.2, -3.4]), PW.block);
      if (cw > 0) hand = V3.lerp(hand, add(sh, [1.7, s * .5, armLen * (.08 + .8 * (.5 + .5 * Math.sin(this.climbP + (s > 0 ? 0 : Math.PI))))]), cw);
      const wk = this._from && this._windK < 1 ? this._windK : 1, from = wk < 1 ? this._from[s > 0 ? 'R' : 'L'] : null;
      if (aw > 0 && !this.kicking) {
        if (s === sA) hand = V3.lerp(hand, from ? V3.lerp(from, aT, wk) : aT, aw);
        else if (two) hand = V3.lerp(hand, add(aT, V3.mul(aDir, -1.7)), aw);
        else { const offT = fists ? guardAt : add(shC, [1.6, s * 1.6, -1.6]); hand = V3.lerp(hand, from ? V3.lerp(from, offT, wk) : offT, from ? aw : aw * .85); }
      }
      if (this.kicking && aw > 0) hand = V3.lerp(hand, add(shC, [1.8, s * 2.2, .6 - (s > 0 ? 1.5 : 0)]), aw * .85);
      const [elbow, h2] = ik3(sh, hand, o.armUpper, o.armLower, [-1, s * .7, -.2]);
      J[s > 0 ? 'elbowR' : 'elbowL'] = elbow; J[s > 0 ? 'handR' : 'handL'] = h2;
    }
    const wp = o.weapon, rest = V3.norm(wp === 'staff' ? [.3, .15, 1] : wp === 'gun' ? [.8, 0, -.6] : [.55, .35, -.75]), atk = aDir;
    let bd = V3.lerp(rest, atk, this.kicking || sA < 0 ? 0 : aw);
    if (this._from && this._windK < 1 && !this.kicking && sA > 0) bd = V3.lerp(this._from.bd, bd, this._windK);
    if (PW.cheer > 0) bd = V3.lerp(bd, [.15, .05, 1], PW.cheer);
    if (PW.block > 0) bd = V3.lerp(bd, [.35, -.3, .9], PW.block);
    if (this.rdW > 0) bd = V3.lerp(bd, [.62, .08, .78], this.rdW * (1 - aw));
    if (this.pointW > 0) bd = V3.lerp(bd, [Math.cos(this.aimA || 0), 0, Math.sin(this.aimA || 0)], this.pointW);
    J.bladeDir = V3.norm(bd);
    const dw = this.downW || 0;
    if (dw > 0) J.bladeDir = V3.norm(V3.lerp(J.bladeDir, [0, .9, -.4], dw));
    if (dw > 0) {
      const a = dw * Math.PI / 2 * .96, ca = Math.cos(a), sa = Math.sin(a), lift = dw * 1.4, shift = dw * (o.hipZ + o.torso) * .5;
      for (const k in J) { if (k === 'bladeDir') continue; const p = J[k]; J[k] = [p[0] * ca - p[2] * sa + shift, p[1], p[0] * sa + p[2] * ca + lift]; }
      const b = J.bladeDir; J.bladeDir = [b[0] * ca - b[2] * sa, b[1], b[0] * sa + b[2] * ca];
    }
  }
  head() { const w = this._w(this.J.head); return [this.x + w[0], this.y + w[1], this.z + w[2]]; }
  _cape(dt) {
    const c = this.o.cape, sz = this.o.size, N = c.len || 6, seg = (c.seg || 2.4) * sz, W0 = (c.width || 5) * sz;
    const anchor = s => { const J = this.J, sh = s > 0 ? J.shR : J.shL, w = this._w(V3.add(sh, [-1.3, -s * .6, -.6])); return [this.x + w[0], this.y + w[1], this.z + w[2]]; };
    if (!this.capeL) {
      this.capeL = []; this.capeR = [];
      const bx = -Math.cos(this.facing) * (c.body || 3.4) * sz, by = -Math.sin(this.facing) * (c.body || 3.4) * sz;
      for (const s of [-1, 1]) { const a = anchor(s), ch = s < 0 ? this.capeL : this.capeR; for (let i = 0; i < N; i++) { const k = Math.min(1, i / 2); ch.push({ x: a[0] + bx * k, y: a[1] + by * k, z: a[2] - i * seg, px: a[0] + bx * k, py: a[1] + by * k, pz: a[2] - i * seg }); } }
    }
    const damp = Math.pow(.982, dt * 120), dt2 = dt * dt, fx = Math.cos(this.facing), fy = Math.sin(this.facing);
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
        const n = ch[i]; if (n.z < this.z + .4) n.z = this.z + .4; if (n.z > shZ + seg * .6) n.z = shZ + seg * .6;
        const rx = n.x - this.x, ry = n.y - this.y, d = Math.hypot(rx, ry), fwd = rx * fx + ry * fy;
        if (n.z < shZ + 1 && fwd > -bodyR * .35) { n.x -= fx * (fwd + bodyR * .35); n.y -= fy * (fwd + bodyR * .35); }
        else if (n.z < shZ + 1 && d < bodyR) { const ux = d > .01 ? rx / d : -fx, uy = d > .01 ? ry / d : -fy; n.x = this.x + ux * bodyR; n.y = this.y + uy * bodyR; }
      }
    }
  }
  draw(g, ox, oy, view) {
    this._pitch = view.pitchDeg;
    if (this.o.charView !== false) view = charView(view);
    const st = clamp(1 - view.pitchDeg / 45, 0, 1), camA = Math.atan2(view.fy, view.fx);
    this._camSide = Math.cos(camA - this.facing - Math.PI / 2) >= 0 ? 1 : -1;
    this._cheat = st > 0 && this.o.cheat ? clamp(angDiff(this.facing, camA), -this.o.cheat, this.o.cheat) * st : 0;
    this._drawHD(g, ox, oy, view);
  }
  _drawHD(g, ox, oy, view) {
    const o = this.o, C = this.C, J = this.J, sz = o.size, sc = view.scale * sz, ops = this._ops || (this._ops = []);
    ops.length = 0;
    const an = this.facing + this.spin + this._cheat, ca = Math.cos(an), sa = Math.sin(an), k = (1 - this.sq * .4) * sz, kz = (1 + this.sq) * sz;
    const vax = view.ax, vay = view.ay, vbx = view.bx, vby = view.by, vbz = view.bz, vdx = view.dx, vdy = view.dy, vdz = view.dz;
    const S = (f, r, z) => { const wx = (f * ca - r * sa) * k, wy = (f * sa + r * ca) * k, wz = z * kz; return [ox + vax * wx + vay * wy, oy + vbx * wx + vby * wy + vbz * wz, vdx * wx + vdy * wy + vdz * wz]; };
    const dA = (this.downW || 0) * Math.PI / 2 * .96, dca = Math.cos(dA), dsa = Math.sin(dA);
    const Sp = dA ? (p, df = 0, dr = 0, dz = 0) => S(p[0] + df * dca - dz * dsa, p[1] + dr, p[2] + df * dsa + dz * dca) : (p, df = 0, dr = 0, dz = 0) => S(p[0] + df, p[1] + dr, p[2] + dz);
    const Q = {};
    for (const key of JOINT_KEYS) Q[key] = Sp(J[key]);
    const lq = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
    const dC = (Q.hipC[2] + Q.shC[2]) * .5, u = sc, lw = o.limbW / 2;
    const cap = (A, B, ra, rb, col, dx = 0, dy = 0) => {
      const ax = A[0] + dx, ay = A[1] + dy, bx = B[0] + dx, by = B[1] + dy, vx = bx - ax, vy = by - ay, L = Math.hypot(vx, vy);
      if (ra < .75 && rb < .75) { px.line(g, ax, ay, bx, by, col, 1); return; }
      if (L > .01) { const nx = -vy / L, ny = vx / L; px.poly(g, [[ax + nx * ra, ay + ny * ra], [bx + nx * rb, by + ny * rb], [bx - nx * rb, by - ny * rb], [ax - nx * ra, ay - ny * ra]], col); }
      px.disc(g, ax, ay, Math.max(0, ra - .35), col); px.disc(g, bx, by, Math.max(0, rb - .35), col);
    };
    const limb = (A, B, ra, rb, c, far, bias = 0) => {
      const t = tones(c), dk = far ? t.deep : t.sh, base = far ? t.sh : t.base, lt = far ? t.base : t.lt;
      ops.push({ d: (A[2] + B[2]) * .5 + bias, f: () => {
        cap(A, B, ra, rb, dk);
        cap(A, B, Math.max(.45, ra - .7), Math.max(.45, rb - .7), base, -.6, -.6);
        if (ra > 1.5 && !far) { const vx = B[0] - A[0], vy = B[1] - A[1], L = Math.hypot(vx, vy) || 1; let nx = -vy / L, ny = vx / L; if (nx * -.6 + ny * -.8 < 0) { nx = -nx; ny = -ny; } const off = ra - 1.1; px.line(g, A[0] + vx * .2 + nx * off, A[1] + vy * .2 + ny * off, A[0] + vx * .75 + nx * off, A[1] + vy * .75 + ny * off, lt); }
      } });
    };
    const inset = (pts, d) => { let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length; return pts.map(p => { const vx = p[0] - cx, vy = p[1] - cy, l = Math.hypot(vx, vy) || 1, m = Math.max(0, l - d) / l; return [cx + vx * m - .6, cy + vy * m - .6]; }); };
    const slab = (pts, c, far) => { const t = tones(c); px.poly(g, pts, far ? t.deep : t.sh); px.poly(g, inset(pts, 1.1), far ? t.sh : t.base); };
    for (const s of [-1, 1]) {
      const hip = s > 0 ? Q.hipR : Q.hipL, knee = s > 0 ? Q.kneeR : Q.kneeL, foot = s > 0 ? Q.footR : Q.footL, far = knee[2] < dC;
      const ank = lq(knee, foot, .62), toe = Sp(s > 0 ? J.footR : J.footL, 1.9, 0, .3);
      limb(hip, knee, 1.45 * u * lw, 1.2 * u * lw, C.pants, far);
      limb(knee, ank, 1.2 * u * lw, 1.05 * u * lw, C.pants, far, .001);
      limb(ank, foot, 1.15 * u * lw, 1.05 * u * lw, C.boot, far, .002);
      limb(foot, toe, 1.0 * u * lw, .85 * u * lw, C.boot, far, .003);
    }
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
    const shL = Sp(J.shL, 0, -.4, 0), shR = Sp(J.shR, 0, .4, 0), hL = Sp(J.hipL, 0, -.25, .5), hR = Sp(J.hipR, 0, .25, .5);
    const wL = lq(Sp(J.hipL, 0, -.2, 0), shL, .5), wR = lq(Sp(J.hipR, 0, .2, 0), shR, .5), core0 = Sp(J.hipC, 0, 0, .8), core1 = Sp(J.shC, 0, 0, -.4);
    const facingCam = S(2, 0, 6)[2] > S(0, 0, 6)[2];
    ops.push({ d: dC, f: () => {
      const t = tones(C.cloth), plate = [shL, shR, [wR[0] - .3, wR[1]], hR, hL, [wL[0] + .3, wL[1]]];
      px.poly(g, plate, t.sh); cap(core0, core1, o.torsoW * .62 * u, o.torsoW * .72 * u, t.sh);
      px.poly(g, inset(plate, 1.1), t.base); cap(core0, core1, Math.max(.5, o.torsoW * .62 * u - .9), Math.max(.5, o.torsoW * .72 * u - .9), t.base, -.6, -.6);
      if (facingCam) { const n0 = Sp(J.shC, .9, 0, -.8), n1 = Sp(J.hipC, 1.1, 0, 1.4); px.line(g, n0[0], n0[1], n1[0], n1[1], t.sh); const c0 = Sp(J.shC, .7, -.9, -.2), c1 = Sp(J.shC, 1.1, 0, -1.3), c2 = Sp(J.shC, .7, .9, -.2); px.line(g, c0[0], c0[1], c1[0], c1[1], tones(C.trim || C.clothLt).base); px.line(g, c1[0], c1[1], c2[0], c2[1], tones(C.trim || C.clothLt).base); }
      else { const n0 = Sp(J.shC, .3, 0, -.6), n1 = Sp(J.hipC, .3, 0, 1.6); px.line(g, n0[0], n0[1], n1[0], n1[1], t.lt); }
      const bl = Sp(J.hipL, 0, -.3, .7), br = Sp(J.hipR, 0, .3, .7), bt = tones(C.belt);
      px.line(g, bl[0], bl[1], br[0], br[1], bt.sh, Math.max(1, Math.round(u * .7))); px.line(g, bl[0], bl[1] - 1, br[0], br[1] - 1, bt.base);
      if (facingCam) { const bk = Sp(J.hipC, 1.1, 0, .7); px.rect(g, bk[0] - 1, bk[1] - 1, 2, 2, bt.hi); }
    } });
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
    const neck0 = Sp(J.shC, 0, 0, -.2), neck1 = Sp(J.head, 0, 0, -o.headR * .6);
    limb(neck0, neck1, .75 * u, .75 * u, C.skin, false, -.01);
    ops.push({ d: Q.head[2], f: () => {
      const R = o.headR, r = R * u * .93, st = tones(C.skin), ht = tones(C.hair), hs = o.hair.style;
      const H = Sp(J.head, R * .1, 0, -R * .05), back = Sp(J.head, -R * .42, 0, R * .18), cap = Sp(J.head, -R * .2, 0, R * .74);
      const disc2 = (P0, rad, t, far) => { px.disc(g, P0[0], P0[1], rad, far ? t.deep : t.sh); px.disc(g, P0[0] - .6, P0[1] - .6, Math.max(.5, rad - 1), far ? t.sh : t.base); };
      const bald = hs === 'bald', hairBehind = back[2] < H[2];
      if (!bald && hairBehind) disc2(back, r * .98, ht, false);
      disc2(H, r * .9, st, false);
      if (r > 2.5) px.dot(g, H[0] - r * .45, H[1] - r * .4, st.lt);
      if (hs !== 'long' && !o.hood && r > 2) for (const sd of [-1, 1]) { const ear = Sp(J.head, -R * .05, sd * R * .92, -R * .1); if (ear[2] > H[2] - R * .2) { px.disc(g, ear[0], ear[1], Math.max(.6, r * .2), st.sh); } }
      if (!bald) {
        if (!hairBehind) disc2(back, r * .98, ht, false);
        disc2(cap, r * .7, ht, false);
        const bangs = o.face && o.face.bangs !== undefined ? o.face.bangs : .7, fringe = Sp(J.head, R * .6, 0, R * .56);
        if (bangs > 0 && fringe[2] > H[2]) { const fr = r * .42 * bangs; px.disc(g, fringe[0], fringe[1], fr, ht.sh); px.disc(g, fringe[0] - .5, fringe[1] - .5, Math.max(.4, fr - .8), ht.base); }
        px.dot(g, cap[0] - r * .35, cap[1] - r * .45, ht.hi); px.dot(g, cap[0] - r * .1, cap[1] - r * .55, ht.lt);
      }
      if (o.hood) { const tp = Sp(J.head, -R * 1.1, 0, R * .9); px.disc(g, tp[0], tp[1], r * .45, ht.base); }
      if (o.hat) this._hat(g, Sp, J, r, H);
      const big = o.face && o.face.eyes === 'big', eh = Math.max(1, Math.round(u * (big ? 1.4 : 1.05))), ew = u > 2.6 || (big && u > 1.8) ? 2 : 1;
      for (const sd of [-1, 1]) {
        const E2 = Sp(J.head, R * .9, sd * R * .36, -R * .02);
        if (E2[2] <= H[2] + .15) continue;
        if (o.eyeGlow) { px.rect(g, E2[0], E2[1], Math.max(1, ew + (u > 1.6 ? 1 : 0)), Math.max(1, eh - 1), o.eyeGlow); continue; }
        if (this.blink > 0 && this.hurtW < .5) {
          const top = E2[1] - eh + 1;
          if (eh >= 2 && u > 1.7) { px.rect(g, E2[0], top, ew, 1, C.eye); px.rect(g, E2[0], top + 1, ew, eh - 1, C.iris || '#3a4a8a'); px.dot(g, E2[0], top + 1, C.eyeWhite || '#ffffff'); }
          else { px.rect(g, E2[0], top, ew, eh, C.eye); if (u > 1.7) px.dot(g, E2[0] + (ew > 1 ? 1 : 0), top, C.eyeWhite || '#ffffff'); }
        } else px.rect(g, E2[0] - (ew > 1 ? 1 : 0), E2[1], ew + 1, 1, C.eye);
      }
      if (u > 1.9) { const m = Sp(J.head, R * .95, 0, -R * .5); if (m[2] > H[2]) px.rect(g, m[0] - (u > 2.6 ? 1 : 0), m[1], u > 2.6 ? 2 : 1, 1, this.hurtW > .3 ? '#6a1a1a' : st.deep); }
    } });
    for (const s of [-1, 1]) {
      const sh = s > 0 ? Q.shR : Q.shL, el = s > 0 ? Q.elbowR : Q.elbowL, hd = s > 0 ? Q.handR : Q.handL, far = el[2] < dC;
      const upper = o.sleeves === 'none' ? C.skin : C.cloth, lower = o.sleeves === 'long' ? C.cloth : C.skin;
      limb(sh, el, 1.15 * u * lw, 1.0 * u * lw, upper, far);
      limb(el, hd, 1.0 * u * lw, .9 * u * lw, lower, far, .001);
      const hc = C.glove || C.skin, ht = tones(hc);
      ops.push({ d: hd[2] + .02, f: () => { px.disc(g, hd[0], hd[1], Math.max(.6, .82 * u * lw - .35), far ? ht.deep : ht.sh); px.disc(g, hd[0] - .5, hd[1] - .5, Math.max(.4, .58 * u * lw - .35), far ? ht.sh : ht.base); } });
    }
    if (o.weapon === 'gun') {
      const hd = J.handR, bd = J.bladeDir, Hn = Q.handR, mz = Sp(hd, bd[0] * 5.5, bd[1] * 5.5, bd[2] * 5.5), gp = Sp(hd, -bd[0] * .6, -bd[1] * .6, -bd[2] * .6 - 1.4), m = tones(C.metal);
      ops.push({ d: Hn[2] + .03, f: () => { cap(Hn, gp, .8 * u, .7 * u, m.deep); cap(Hn, mz, .95 * u, .75 * u, m.sh); cap(Hn, mz, Math.max(.4, .95 * u - .8), Math.max(.4, .75 * u - .8), m.base, -.5, -.5); px.dot(g, mz[0], mz[1], '#ffffff'); } });
    } else if (o.weapon === 'staff') {
      const hd = J.handR, bd = J.bladeDir, Hn = Q.handR, top = Sp(hd, bd[0] * 10, bd[1] * 10, bd[2] * 10), bot = Sp(hd, -bd[0] * 7, -bd[1] * 7, -bd[2] * 7), wt = tones(C.staff || '#8a5a32'), ot = tones(C.orb || '#7fe3ff');
      ops.push({ d: (Hn[2] + top[2]) / 2, f: () => { cap(bot, top, .6 * u, .6 * u, wt.sh); px.line(g, bot[0] - .5, bot[1] - .5, top[0] - .5, top[1] - .5, wt.lt); px.disc(g, top[0], top[1], Math.max(1, u * 1.5), ot.sh); px.disc(g, top[0] - .6, top[1] - .6, Math.max(.6, u * 1.5 - 1), ot.base); px.dot(g, top[0] - 1, top[1] - 1, '#ffffff'); } });
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
    ops.sort((a, b) => a.d - b.d);
    for (const op of ops) op.f();
  }
  _hat(g, Sp, J, r, H) {
    const h = this.o.hat, st = h.style || 'cap', c = h.color || '#d83a2a', R = this.o.headR, dk = shade(c, -.3);
    if (st === 'cap') {
      const t = Sp(J.head, -.4, 0, R * .55), b = Sp(J.head, R * 1.05, 0, R * .25), b2 = Sp(J.head, R * 1.7, 0, R * .1);
      px.disc(g, t[0], t[1], r * .92, c); px.line(g, b[0], b[1], b2[0], b2[1], dk, 2);
    } else if (st === 'pointed') {
      const a = Sp(J.head, R * .2, -R * .95, R * .45), b = Sp(J.head, R * .2, R * .95, R * .45), f = Sp(J.head, R * .75, 0, R * .5), k = Sp(J.head, -R * .9, 0, R * .25), tip = Sp(J.head, -R * 2.3, 0, R * 1.6);
      px.poly(g, [f, k, tip], c); px.poly(g, [a, b, tip], c); px.line(g, a[0], a[1], b[0], b[1], dk); px.line(g, f[0], f[1], k[0], k[1], dk);
    } else if (st === 'helmet') {
      const t = Sp(J.head, -.8, 0, .6), cr = Sp(J.head, 0, 0, R * 1.05);
      px.disc(g, t[0], t[1], r * 1.02, c); px.disc(g, cr[0], cr[1], Math.max(1, r * .28), shade(c, .35));
      const f = Sp(J.head, R * .75, 0, -.2); px.disc(g, f[0], f[1], r * .55, this.C.skin);
    } else if (st === 'crown') {
      for (const k of [-1, 0, 1]) { const p = Sp(J.head, 0, k * R * .6, R * .9), q = Sp(J.head, 0, k * R * .6, R * 1.6); px.line(g, p[0], p[1], q[0], q[1], c, 2); }
      const a = Sp(J.head, 0, -R * .8, R * .85), b = Sp(J.head, 0, R * .8, R * .85); px.line(g, a[0], a[1], b[0], b[1], c, 2);
    }
  }
}
E.Humanoid = Humanoid;
class Attack {
  constructor(spec = {}, over) {
    if (typeof spec === 'string') { const m = E.MOVES[spec]; if (!m) warn('move:' + spec, 'unknown move "' + spec + '". Moves: ' + Object.keys(E.MOVES).join(', ')); spec = Object.assign({ name: spec, hitAt: .35 }, m || E.MOVES.slash, over); }
    else if (over) spec = Object.assign({}, spec, over);
    this.spec = Object.assign({ wind: .06, active: .1, recover: .18 }, spec); this.phase = null; this.t = 0; this.hit = new Set();
  }
  start(canCancel = false) {
    if (this.phase && !(canCancel && this.phase === 'recover')) return false;
    this.phase = 'wind'; this.t = 0; this.hit.clear(); return true;
  }
  get busy() { return !!this.phase; }
  get active() { return this.phase === 'active'; }
  get u() { return this.phase ? clamp(this.t / this.spec[this.phase], 0, 1) : 0; }
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
  hits(targets, test, fn) {
    if (this.phase !== 'active' || this.u < (this.spec.hitAt || 0)) return 0;
    let n = 0;
    for (const t of targets) { if (!t || t.dead || this.hit.has(t) || !test(t)) continue; this.hit.add(t); n++; fn(t); }
    return n;
  }
  cancel() { this.phase = null; this.t = 0; }
}
E.Attack = Attack;
class Combo {
  constructor(specs, o = {}) { this.moves = specs.map(sp => sp instanceof Attack ? sp : new Attack(sp)); this.window = o.window === undefined ? .3 : o.window; this.step = -1; this.idle = 99; }
  get current() { return this.moves[Math.max(0, this.step)]; }
  get busy() { return this.step >= 0 && this.current.busy; }
  get active() { return this.busy && this.current.active; }
  get state() { return this.busy ? this.current.state : null; }
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
E.MOVES = {
  slash:      { rel: true, a0: 1.7, a1: -1.7, z0: -6, z1: -9, reach: 7.5, wind: .08, active: .1, recover: .22 },
  backslash:  { rel: true, a0: -1.5, a1: 1.6, z0: -8, z1: -5, reach: 7.5, wind: .07, active: .1, recover: .2, lunge: .8 },
  overhead:   { rel: true, plane: 'side', a0: 2.4, a1: -1.25, reach: 7, wind: .16, active: .09, recover: .26, lunge: 2, crouch: .35, lean: .4 },
  rising:     { rel: true, plane: 'side', a0: -1.35, a1: 2.1, reach: 7, wind: .09, active: .11, recover: .24, hop: 3.5, lunge: .8, crouch: .4 },
  thrust:     { rel: true, a0: .12, a1: 0, z0: -5, z1: -4, r0: 3, r1: 10, wind: .11, active: .07, recover: .22, lunge: 3, lean: .5 },
  spin:       { rel: true, a0: 1.3, a1: 1.3, spin: true, z0: -6, z1: -6, reach: 8, wind: .09, active: .3, recover: .18, lunge: 0, lean: .1 },
  plunge:     { rel: true, plane: 'side', a0: -1.45, a1: -1.5, r0: 5, r1: 9, wind: .06, active: .25, recover: .15, lunge: 0, lean: .1 },
  twohand:    { rel: true, hand: 'both', plane: 'side', a0: 2.5, a1: -1.4, reach: 6.5, wind: .2, active: .1, recover: .3, lunge: 2.4, crouch: .5, lean: .5 },
  jab:        { rel: true, hand: 'L', a0: .05, a1: 0, z0: -1, z1: -.5, r0: 3, r1: 8.6, wind: .035, active: .06, recover: .13, lunge: .9, lean: .22, blade: 0 },
  cross:      { rel: true, a0: .25, a1: 0, z0: -1, z1: -.5, r0: 2.5, r1: 8.8, wind: .06, active: .07, recover: .17, lunge: 1.8, lean: .38, twist: 1.8, blade: 0 },
  hook:       { rel: true, a0: 1.45, a1: -.4, z0: -.5, z1: 0, reach: 6.8, wind: .08, active: .09, recover: .2, lunge: 1.3, lean: .3, twist: 1.5, blade: 0 },
  uppercut:   { rel: true, plane: 'side', a0: -1.15, a1: .95, reach: 7.2, wind: .11, active: .09, recover: .26, crouch: .6, hop: 2.5, lunge: 1.2, lean: .2, blade: 0 },
  haymaker:   { rel: true, a0: 2.1, a1: -.5, z0: 1, z1: -1, reach: 7.8, wind: .22, active: .1, recover: .3, lunge: 2.6, lean: .5, twist: 1.6, blade: 0 },
  elbow:      { rel: true, a0: .9, a1: -.3, z0: -.5, z1: 0, reach: 3.5, wind: .05, active: .07, recover: .16, lunge: 1, twist: 1.4, blade: 0 },
  kick:       { rel: true, kick: true, a0: .1, a1: 0, z0: .35, z1: .8, reach: 6.5, wind: .07, active: .09, recover: .2 },
  roundhouse: { rel: true, kick: true, a0: 1.7, a1: -.45, z0: 1, z1: 1.55, reach: 7, wind: .1, active: .13, recover: .24, twist: 1.3, lean: -.3 },
  sweep:      { rel: true, kick: true, a0: 1.9, a1: -1.7, z0: .08, z1: .08, reach: 7.5, wind: .08, active: .16, recover: .24, crouch: .9, lean: .3 },
  flyingkick: { rel: true, kick: true, a0: .1, a1: 0, z0: .5, z1: .75, reach: 7.5, wind: .1, active: .22, recover: .24, hop: 7, lunge: 3.5, lean: -.35 },
  knee:       { rel: true, kick: true, a0: 0, a1: 0, z0: .45, z1: .85, reach: 2, wind: .06, active: .08, recover: .18, lean: .2, lunge: 1 },
  axekick:    { rel: true, kick: true, a0: .2, a1: 0, z0: 2, z1: .5, reach: 4.8, wind: .14, active: .08, recover: .24, lean: -.2 },
  cast:       { rel: true, hand: 'both', plane: 'side', a0: 1.4, a1: .1, reach: 8, wind: .22, active: .12, recover: .32, lunge: .6, lean: .15, blade: 0 },
  throw:      { rel: true, plane: 'side', a0: 2.5, a1: -.25, reach: 7.5, wind: .16, active: .08, recover: .24, lunge: 1.8, lean: .45, blade: 0 },
  bash:       { rel: true, hand: 'both', plane: 'side', a0: 1, a1: -.35, reach: 5, wind: .12, active: .07, recover: .24, lunge: 3, hop: 1.2, crouch: .45, lean: .55, blade: 0 },
  claw:       { rel: true, a0: 1.2, a1: -1, z0: 1, z1: -4, reach: 7, wind: .12, active: .08, recover: .24, lunge: 1.8, lean: .4, blade: 0 }
};
const _moveSpecs = {};
E.move = (name, u = .5, phase = 'active') => ({ spec: _moveSpecs[name] || (_moveSpecs[name] = Object.assign({ name, wind: .06, active: .1, recover: .18 }, E.MOVES[name] || E.MOVES.slash)), phase, u });
E.knockback = (from, target, speed = 160, up = 0) => {
  const dx = target.x - from.x, dy = (target.y || 0) - (from.y || 0), d = Math.hypot(dx, dy) || 1, ix = dx / d * speed, iy = dy / d * speed;
  if (typeof target.push === 'function') target.push(ix, iy, up);
  else { target.vx = (target.vx || 0) + ix; target.vy = (target.vy || 0) + iy; if (up) target.vz = (target.vz || 0) + up; }
  return target;
};

// ---- 11. BLOB: squash-and-stretch sphere that looks at a target (slimes, bats, rabbites, imps) ----
class Blob {
  constructor(o = {}) {
    this.o = Object.assign({ R: 6.5 }, o);
    this.C = Object.assign({ dk: '#6d2658', base: '#c95f9a', lt: '#f5a3cc', spec: '#fff2f8', eye: '#ffffff', pupil: '#2a0f24' }, o.colors || {});
    this.sq = 0; this.sqV = 0; this.target = 0; this.look = [1, 0]; this.t = 0; this.squint = false; this.scale = 1;
  }
  kick(v) { this.sqV += v; }
  update(dt, s = {}) {
    this.t += dt;
    const target = s.squash || 0;
    this.sqV += (-(this.sq - target) * 320 - 14 * this.sqV) * dt; this.sq = clamp(this.sq + this.sqV * dt, -.45, .45);
    if (s.look) { const l = Math.hypot(s.look[0], s.look[1]); if (l > .01) { this.look[0] = lerp(this.look[0], s.look[0] / l, Math.min(1, dt * 8)); this.look[1] = lerp(this.look[1], s.look[1] / l, Math.min(1, dt * 8)); } }
    this.squint = !!s.squint; this.walk = s.walk || 0;
    this.flap = approach(this.flap === undefined ? 1 : this.flap, s.flap === undefined ? 1 : s.flap, dt * 6); this.flapP = (this.flapP || 0) + dt * 14 * this.flap; this.hang = !!s.hang;
  }
  draw(g, ox, oy, view) {
    if (!this.hang) return this._drawBody(g, ox, oy, view);
    const pv = Math.round(oy - this.o.R * this.scale * view.scale);
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
    px.ell(g, cx, cy, rx, ry, C.dk);
    px.ell(g, cx + .5, cy - .8, Math.max(1, rx - 1.2), Math.max(1, ry - 1.3), C.base);
    px.ell(g, cx - rx * .15, cy + ry * .35, Math.max(1, rx * .7), Math.max(.6, ry * .3), tb.sh);
    px.ell(g, cx + rx * .3, cy - ry * .42, Math.max(1, rx * .38), Math.max(.6, ry * .28), C.lt);
    px.rect(g, cx + rx * .45, cy - ry * .6, 2, 1, C.spec);
    if (o.feet) for (const sd of [-1, 1]) { const st = Math.sin(t * 9 + sd) * (this.walk || 0); px.ell(g, cx + sd * rx * .45 + st, cy + ry * .9, Math.max(1.2, rx * .28), Math.max(.8, ry * .16), ext); }
    if (o.horns) for (const sd of [-1, 1]) { const hx = cx + sd * rx * .45, hy = cy - ry * .72; px.poly(g, [[hx - sd * rx * .15, hy + 1], [hx + sd * rx * .3, hy - ry * .7], [hx + sd * rx * .2, hy + 1]], C.horn || '#e8dcc0'); px.dot(g, hx + sd * rx * .26, hy - ry * .6, '#ffffff'); }
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

// ---- 12. TILEMAP: ground-plane levels from ASCII rows (top-down, iso, three-quarter, brawler). Walls are extruded boxes baked per view ----
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
  constructor(o = {}) {
    this.T = o.tile || 16;
    const L = o.rows ? parseLevel(o.rows, o.legend) : o.level || null;
    if (L) o = Object.assign({}, o, { w: L.w, h: L.h, cells: L.cells });
    if (!o.w || !o.h || !o.cells) throw new Error('TileMap needs { rows, legend } or { w, h, cells }');
    if (o.cells.length !== o.w * o.h) throw new Error('TileMap: cells has ' + o.cells.length + ' entries but w * h = ' + (o.w * o.h));
    this.w = o.w; this.h = o.h; this.cells = o.cells; this.types = Object.assign({}, o.types || {});
    this.floorTags = L ? L.floor : null;
    this.blocked = L ? L.block : new Uint8Array(this.w * this.h);
    if (o.block && this.floorTags) { const tags = [].concat(o.block); this.floorTags.forEach((f, i) => { if (f && tags.includes(f)) this.blocked[i] = 1; }); }
    this.spawns = L ? L.spawns.map(sp => Object.assign(sp, { x: (sp.cx + .5) * this.T, y: (sp.cy + .5) * this.T, z: 0 })) : [];
    for (const id of new Set(this.cells)) if (id > 0 && !this.types[id]) { warn('walltype:' + id, 'TileMap: wall type ' + id + ' is used in the map but missing from types (using a plain grey wall)'); this.types[id] = DEFAULT_WALL; }
    this.floorTex = o.floorTex || (() => [60, 56, 72]); this.cutaway = o.cutaway !== false; this.floors = {};
    this.ao = o.ao === undefined ? 5 : o.ao;
    this.light = V3.norm([-.6, -.8, 0]); this.version = 0;
  }
  find(tag) { return this.spawns.find(s => s.tag === tag) || null; }
  findAll(tag) { return this.spawns.filter(s => s.tag === tag); }
  cell(cx, cy) { return cx < 0 || cy < 0 || cx >= this.w || cy >= this.h ? -1 : this.cells[cy * this.w + cx]; }
  set(cx, cy, v) { if (cx >= 0 && cy >= 0 && cx < this.w && cy < this.h) { if (v > 0 && !this.types[v]) this.types[v] = DEFAULT_WALL; this.cells[cy * this.w + cx] = v; this.floors = {}; this.version++; } }
  toCell(x, y) { return [Math.floor(x / this.T), Math.floor(y / this.T)]; }
  center(cx, cy) { return [(cx + .5) * this.T, (cy + .5) * this.T]; }
  solidCell(cx, cy) { const c = this.cell(cx, cy); return c !== 0; }
  walkable(cx, cy) { return this.cell(cx, cy) === 0 && !this.blocked[cy * this.w + cx]; }
  block(cx, cy, on = true) { if (cx >= 0 && cy >= 0 && cx < this.w && cy < this.h) this.blocked[cy * this.w + cx] = on ? 1 : 0; }
  solidAt(x, y) { return this.solidCell(Math.floor(x / this.T), Math.floor(y / this.T)); }
  height(cx, cy) { const c = this.cell(cx, cy); return c > 0 ? this.types[c].h : c < 0 ? 1e9 : 0; }
  heightAt(x, y) { return this.height(Math.floor(x / this.T), Math.floor(y / this.T)); }
  floorAt(x, y) { if (!this.floorTags) return null; const cx = Math.floor(x / this.T), cy = Math.floor(y / this.T); return cx < 0 || cy < 0 || cx >= this.w || cy >= this.h ? null : this.floorTags[cy * this.w + cx]; }
  groundAt(x, y, r = 0, z = 1e9, step = 2) {
    const T = this.T, rr = r * .6; let g = 0;
    for (let cy = Math.floor((y - rr) / T); cy <= Math.floor((y + rr) / T); cy++) for (let cx = Math.floor((x - rr) / T); cx <= Math.floor((x + rr) / T); cx++) {
      const c = this.cell(cx, cy); if (c <= 0) continue; const h = this.types[c].h; if (h <= z + step && h > g) g = h;
    }
    return g;
  }
  collide(b) {
    const T = this.T, zA = typeof b.z === 'number', step = b.step === undefined ? 2 : b.step;
    let hit = false;
    for (let it = 0; it < 2; it++) {
      const c0 = Math.floor((b.x - b.r) / T), c1 = Math.floor((b.x + b.r) / T), r0 = Math.floor((b.y - b.r) / T), r1 = Math.floor((b.y + b.r) / T);
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
        const c = this.cell(cx, cy);
        if (c === 0) { if (!this.blocked[cy * this.w + cx] || (zA && b.z > step)) continue; }
        else if (zA && c > 0 && this.types[c].h <= b.z + step) continue;
        const nx = clamp(b.x, cx * T, cx * T + T), ny = clamp(b.y, cy * T, cy * T + T);
        let dx = b.x - nx, dy = b.y - ny, d = Math.hypot(dx, dy);
        if (d >= b.r) continue;
        hit = true;
        if (d < 1e-4) {
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
  _escape(b, zA, step) {
    const T = this.T, cx = Math.floor(b.x / T), cy = Math.floor(b.y / T); let best = null, bd = 1e9;
    for (let y = cy - 8; y <= cy + 8; y++) for (let x = cx - 8; x <= cx + 8; x++) {
      const n = this.cell(x, y); if (n < 0 || (n === 0 && this.blocked[y * this.w + x]) || (n > 0 && !(zA && this.types[n].h <= b.z + step))) continue;
      const px2 = clamp(b.x, x * T + b.r, x * T + T - b.r), py2 = clamp(b.y, y * T + b.r, y * T + T - b.r), dd = Math.hypot(px2 - b.x, py2 - b.y);
      if (dd < bd) { bd = dd; best = [px2, py2]; }
    }
    if (best) { b.x = best[0]; b.y = best[1]; }
  }
  _liftOrder(view, x, y, z, k) {
    const T = this.T, cx = Math.floor(x / T), cy = Math.floor(y / T), c = this.cell(cx, cy), t = c > 0 ? this.types[c] : null;
    if (!t || z < t.h - 1) return k;
    return Math.max(k, view.order((cx + .5) * T, (cy + .5) * T, 0) + .002 + z * 1e-5);
  }
  los(x0, y0, x1, y1) { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4); for (let i = 1; i < n; i++) if (this.solidAt(lerp(x0, x1, i / n), lerp(y0, y1, i / n))) return false; return true; }
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
    for (let py = 0; py < ch; py++) for (let pxx = 0; pxx < cw; pxx++) {
      let gx, gy;
      if (view.inv) { const q = view.toGround(pxx + x0 + .5, py + y0 + .5); gx = q[0]; gy = q[1]; }
      else { gx = (pxx + x0 + .5) / view.ax; gy = H * .5 + py * 2; }
      if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
      if (view.inv && this.cell(Math.floor(gx / T), Math.floor(gy / T)) !== 0) continue;
      let c = this.floorTex(gx, gy, this.floorTags ? this.floorTags[Math.floor(gy / T) * this.w + Math.floor(gx / T)] : null, view); if (!c) continue;
      if (this.ao) {
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
    }
    g.putImageData(img, 0, 0);
    return (this.floors[key] = { cv, x0, y0 });
  }
  drawFloor(r) { r._map = this; const f = this._floor(r.view); r.ctx.drawImage(f.cv, f.x0 - r.ix, f.y0 - r.iy); }
  _isFront(cx, cy, view) {
    if (!this.cutaway || view.isTop || view.pitchDeg > 75) return false;
    const t = this.types[this.cell(cx, cy)]; if (!t || !t.cut) return false;
    const bx = -Math.round(view.fx), by = -Math.round(view.fy);
    const behindFloor = (bx && this.cell(cx + bx, cy) === 0) || (by && this.cell(cx, cy + by) === 0);
    return !!behindFloor;
  }
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
  _boxCached(g, r, cx, cy, t, h) {
    const view = r.view, key = view.id + ':' + view.yawDeg + ':' + view.pitchDeg + ':' + view.scale + ':' + this.version;
    if (!this._wc || this._wc.key !== key) this._wc = { key, m: new Map() };
    const idx = cy * this.w + cx; let e = this._wc.m.get(idx);
    if (!e || e.h !== h) {
      const T = this.T; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const z of [0, h]) for (const [x, y] of [[cx * T, cy * T], [cx * T + T, cy * T], [cx * T, cy * T + T], [cx * T + T, cy * T + T]]) { const q = view.p(x, y, z); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
      e = { h, x0: Math.floor(x0) - 2, y0: Math.floor(y0) - 2, w: Math.ceil(x1) - Math.floor(x0) + 5, hh: Math.ceil(y1) - Math.floor(y0) + 5, cv: null };
      this._wc.m.set(idx, e);
    }
    if (!e.cv) {
      const c = e.cv = mkCanvas(e.w, e.hh), sx = r.ix, sy = r.iy; r.ix = e.x0; r.iy = e.y0;
      try { this._box(ctx2d(c), r, cx, cy, t, h); } finally { r.ix = sx; r.iy = sy; }
    }
    g.drawImage(e.cv, e.x0 - r.ix, e.y0 - r.iy);
  }
  _box(g, r, cx, cy, t, h) {
    const view = r.view, T = this.T, x0 = cx * T, y0 = cy * T, x1 = x0 + T, y1 = y0 + T, P = (x, y, z) => r.w(x, y, z);
    if (!view.isTop) {
      const faces = [[0, -1, [x1, y0], [x0, y0]], [0, 1, [x0, y1], [x1, y1]], [-1, 0, [x0, y0], [x0, y1]], [1, 0, [x1, y1], [x1, y0]]];
      for (const [nx, ny, A, B] of faces) {
        if (nx * view.fx + ny * view.fy <= .02) continue;
        const nh = this.cell(cx + nx, cy + ny) > 0 ? (this._isFront(cx + nx, cy + ny, view) ? (this.types[this.cell(cx + nx, cy + ny)].cutH || 6) : this.height(cx + nx, cy + ny)) : 0;
        if (nh >= h) continue;
        const lit = -(nx * this.light[0] + ny * this.light[1]);
        const col = lit > .2 ? t.sideLt || shade(t.side, .12) : lit < -.2 ? t.sideDk || shade(t.side, -.25) : t.side;
        const face = [P(A[0], A[1], nh), P(B[0], B[1], nh), P(B[0], B[1], h), P(A[0], A[1], h)];
        px.poly(g, face, col);
        const pat = t.texture === false || t.face === 'none' ? 'none' : 'brick';
        if (pat === 'brick') {
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
    px.poly(g, top, t.top);
    if (t.texture !== false && t.roof !== 'plain') { const tt = tones(t.top); scan(top, (xa, xb, y) => { for (let x = xa; x <= xb; x++) { const v = hash2(x * 3 + cx * 71, y * 5 + cy * 37); if (v < .08 || v > .96) { px.col(g, v < .08 ? tt.sh : tt.lt); g.fillRect(x, y, 1, 1); } } }); }
    const edge = t.edge || shade(t.top, .22);
    for (const [ax, ay, bx, by, nx, ny] of [[x0, y0, x1, y0, 0, -1], [x0, y1, x0, y0, -1, 0]]) {
      const nb = this.cell(cx + nx, cy + ny); if (nb > 0 && this.height(cx + nx, cy + ny) >= h) continue;
      const a = P(ax, ay, h), b = P(bx, by, h); px.line(g, a[0], a[1], b[0], b[1], edge);
    }
  }
}
E.TileMap = TileMap;
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
E.tex = {
  flagstone(x, y, pal, size = 16) {
    const row = Math.floor(y / size), off = (row & 1) * size / 2, col = Math.floor((x + off) / size), lx = x + off - col * size, ly = y - row * size;
    if (lx < 1 || ly < 1) return pal.mortar;
    const h = hash2(col, row); let c = pal.stones[(h * pal.stones.length) | 0];
    if (lx < 2 || ly < 2) c = pal.hi; else if (lx > size - 1.5 || ly > size - 1.5) c = pal.lo;
    const n = hash2(Math.floor(x * 1.3), Math.floor(y * 1.3)); if (n < .05) c = pal.speck;
    if (h > .93 && lx > 3 && lx < size - 3 && Math.abs(lx - ly * .7 - 3) < .6) c = pal.mortar;
    return c;
  },
  grass(x, y, o = {}) {
    const n = noise2(x * .07, y * .07) * .65 + noise2(x * .23, y * .23) * .35, blade = noise2(x * .9, y * .35);
    const fl = noise2(x * .12 + 40, y * .12 + 40), fh = hash2(Math.floor(x / 2), Math.floor(y / 2));
    if (fl > .82 && fh > .8) return hex(fh > .93 ? (o.flower || '#f4e27a') : (o.flower2 || '#f2f2f6'));
    if (n > .66 || (blade > .78 && n > .5)) return hex(o.dark || '#3e8a3a');
    if (n < .34 || blade < .16) return hex(o.light || '#6cc25a');
    return hex(o.base || '#55a94a');
  },
  dirt(x, y, o = {}) {
    const n = noise2(x * .1, y * .1) * .7 + noise2(x * .3, y * .3) * .3, peb = noise2(x * .45 + 9, y * .45 + 3);
    if (peb > .84) return hex(noise2(x * .45 + 9, (y - 1) * .45 + 3) > .84 ? (o.dark || '#6e4a2e') : (o.light || '#c9a276'));
    return hex(n > .62 ? (o.light || '#b08a5e') : n < .3 ? (o.dark || '#7d5838') : (o.base || '#9a7048'));
  },
  water(x, y, o = {}) {
    const w = Math.sin(x * .35 + Math.sin(y * .18) * 2.2 + y * .05);
    if (w > .93 && ((Math.floor(x) + Math.floor(y)) & 1)) return hex(o.light || '#9fe3ff');
    return hex(noise2(x * .05, y * .05) > .55 ? (o.base || '#2f7fd0') : (o.dark || '#2464b0'));
  },
  planks(x, y, o = {}) {
    const row = Math.floor(y / 6), ly = y - row * 6, len = 20 + Math.floor(hash2(row, 3) * 18), joint = (x + row * 13) % len;
    if (ly < 1 || joint < 1) return hex(o.line || '#4a2e1c');
    const g = hash2(Math.floor(x / 3), row); return hex(g > .7 ? (o.dark || '#8a5a34') : (o.base || '#9d6a3f'));
  },
  checker(x, y, o = {}) { const s = o.size || 16; return hex(((Math.floor(x / s) + Math.floor(y / s)) & 1) ? (o.a || '#d8d0e8') : (o.b || '#5a5270')); },
  plain(x, y, o = {}) { const c = hex(o.base || '#4a4458'), k = 1 + (Math.round((noise2(x * .15, y * .15) - .5) * 4) / 4) * (o.amount === undefined ? .14 : o.amount); return c.map(v => v * k); }
};

// ---- 13. PLATFORMMAP + PLATFORMER: side-scroller levels on the x/z plane (x right, z up, play plane y = 0) ----
//   kinds: solid oneway ladder slope hazard deco back. styles: block bonus brick ground plank spikes ladder liquid plain. A tilted yaw-0 view shows it as 2.5D
const PT_DEFAULT = { kind: 'solid', style: 'block', side: '#8a7a9a' };
const PT_STYLE_FOR_KIND = { oneway: 'plank', ladder: 'ladder', hazard: 'spikes', slope: 'ground' };
class PlatformMap {
  constructor(o = {}) {
    this.T = o.tile || 16; this.depth = o.depth === undefined ? this.T : o.depth;
    const L = o.rows ? parseLevel(o.rows, o.legend) : o.level;
    if (!L) throw new Error('PlatformMap needs { rows: [...], legend: {...}, types: {...} }');
    this.w = L.w; this.h = L.h; this.types = {};
    for (const k in (o.types || {})) { const t = Object.assign({ kind: 'solid' }, o.types[k]); t.style = t.style || PT_STYLE_FOR_KIND[t.kind] || 'block'; t.side = t.side || t.color || PT_DEFAULT.side; this.types[k] = t; }
    this.cells = new Array(this.w * this.h).fill(0);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.cells[(this.h - 1 - y) * this.w + x] = L.cells[y * this.w + x];
    for (const id of new Set(this.cells)) if (id > 0 && !this.types[id]) { warn('ptype:' + id, 'PlatformMap: tile type ' + id + ' is used but missing from types (using a plain solid block)'); this.types[id] = Object.assign({}, PT_DEFAULT); }
    this.spawns = L.spawns.map(sp => { const cz = this.h - 1 - sp.cy; return Object.assign(sp, { cz, x: (sp.cx + .5) * this.T, y: 0, z: cz * this.T }); });
    this.version = 0; this._bake = null; this.edges = o.edges || 'solid';
  }
  find(tag) { return this.spawns.find(s => s.tag === tag) || null; }
  findAll(tag) { return this.spawns.filter(s => s.tag === tag); }
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
  get width() { return this.w * this.T; }
  get height() { return this.h * this.T; }
  groundBelow(x, z) {
    const T = this.T, cx = Math.floor(x / T);
    for (let cz = Math.min(this.h - 1, Math.floor((z + .5) / T)); cz >= 0; cz--) {
      const k = this.kind(cx, cz);
      if (k === 'slope') { const sz = this.slopeZ(cx, cz, x); if (sz <= z + .5) return sz; }
      else if ((k === 'solid' || k === 'oneway') && (cz + 1) * T <= z + .5) return (cz + 1) * T;
    }
    return null;
  }
  slopeZ(cx, cz, x) {
    const t = this.types[this.cell(cx, cz)] || {}, T = this.T, u = clamp((x - cx * T) / T, 0, 1);
    const a = t.from !== undefined ? t.from : (t.dir < 0 ? 1 : 0), b = t.to !== undefined ? t.to : (t.dir < 0 ? 0 : 1);
    return cz * T + lerp(a, b, u) * T;
  }
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
  cellsTouching(b, what) {
    const T = this.T, out = [], x0 = Math.floor((b.x - b.w / 2 + .01) / T), x1 = Math.floor((b.x + b.w / 2 - .01) / T), z0 = Math.floor((b.z + .01) / T), z1 = Math.floor((b.z + b.h - .01) / T);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const id = this.cell(cx, cz); if (id <= 0) continue; const k = this.types[id].kind;
      if (what === undefined || what === k || what === id) out.push({ cx, cz, id, kind: k });
    }
    return out;
  }
  touching(b, what) { return this.cellsTouching(b, what).length > 0; }
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
    if (!b.onGround && wasGround && (b.vz || 0) <= 0 && !b.climbing) { const sz = this._surfaceBelow(b, Math.max(b.w / 2 + 3, Math.abs(b.vx || 0) * dt * 1.5 + 2)); if (sz !== null) { b.z = sz; b.vz = 0; b.onGround = true; } }
    return b;
  }
  _stands(k, cx, cz, prevZ, top, b) {
    if (k === 'solid') return true;
    if (b.drop > 0 || prevZ < top - .01) return false;
    if (k === 'oneway') return true;
    return k === 'ladder' && !b.climbing && this.kind(cx, cz + 1) !== 'ladder';
  }
  _mx(b, dx, solids) {
    const T = this.T, hw = b.w / 2; b.x += dx;
    const cx = Math.floor((dx > 0 ? b.x + hw : b.x - hw) / T);
    const blocked = () => { for (let cz = Math.floor((b.z + .01) / T); cz <= Math.floor((b.z + b.h - .01) / T); cz++) if (this.kind(cx, cz) === 'solid') return cz; return null; };
    let hit = blocked();
    if (hit !== null && b._grounded) {
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
  _probe(b, solids) {
    const T = this.T, hw = b.w / 2 - .01, cz = Math.floor((b.z - .25) / T), top = (cz + 1) * T;
    const sc = Math.floor(b.x / T), zc = Math.floor((b.z - .01) / T);
    if (this.kind(sc, zc) === 'slope' && Math.abs(b.z - this.slopeZ(sc, zc, b.x)) < .5) { b.onGround = true; b.onOneWay = false; return; }
    if (Math.abs(b.z - top) < .3) for (let cx = Math.floor((b.x - hw) / T); cx <= Math.floor((b.x + hw) / T); cx++) { const k = this.kind(cx, cz); if (k && this._stands(k, cx, cz, b.z, top, b)) { b.onGround = true; b.onOneWay = k !== 'solid'; return; } }
    if (solids) for (const s of solids) if (s.solid !== false && s !== b && Math.abs(b.x - s.x) * 2 < b.w + s.w && Math.abs(b.z - (s.z + s.h)) < .3) { b.onGround = true; b.ground = s; b.onOneWay = !!s.oneway; return; }
  }
  bounds(view) {
    const W = this.w * this.T, H = this.h * this.T, d = this.depth / 2; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const x of [0, W]) for (const y of [-d, d]) for (const z of [0, H]) { const s = view.p(x, y, z); x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[0]); y0 = Math.min(y0, s[1]); y1 = Math.max(y1, s[1]); }
    return { x0, y0: y0 - 4, x1, y1: y1 + 4 };
  }
  draw(r) {
    const view = r.view, g = r.ctx;
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
    const col = back ? shade(side, -.38) : side, hi = shade(col, .28), lo = shade(col, -.32);
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
    const wx0 = cx * W, wy0 = (this.h - cz) * H;
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
    } else if (st === 'ground') {
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
        const X = wx0 + x - X0, Y = wy0 + y - Y0, n = noise2(X * .2, Y * .2) * .7 + noise2(X * .5, Y * .5) * .3, st = noise2(X * .42 + 5, Y * .42 + 11);
        if (st > .83) px.dot(g, x, y, noise2(X * .42 + 5, (Y - 1) * .42 + 11) > .83 ? tt.sh : tt.lt); else if (n > .64) px.dot(g, x, y, tt.sh); else if (n < .28) px.dot(g, x, y, tt.lt);
      }
      if (openTop) {
        const grass = t.top || '#5fbf4a', gt = tones(grass);
        for (let x = X0; x < X1; x++) { const L = 3 + (hash2(x, 11) > .6 ? 1 : 0) + (hash2(x, 23) > .9 ? 2 : 0); px.rect(g, x, Y0, 1, L, gt.base); px.dot(g, x, Y0 + L, gt.deep); if (hash2(x, 5) > .7) px.dot(g, x, Y0 + L - 1, gt.sh); if (hash2(x, 31) > .96) { px.dot(g, x, Y0 - 1, gt.lt); px.dot(g, x, Y0 - 2, t.flower || '#ffe070'); } }
        px.rect(g, X0, Y0, W, 1, gt.lt);
      }
    } else if (st !== 'plain') {
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const n = noise2((wx0 + x) * .3, (wy0 + y) * .3); if (n > .7) px.dot(g, X0 + x, Y0 + y, tt.sh); else if (n < .22) px.dot(g, X0 + x, Y0 + y, tt.lt); }
      px.rect(g, X0, Y0, W, 1, hi); px.rect(g, X0, Y0, 1, H, hi); px.rect(g, X0, Y1 - 1, W, 1, lo); px.rect(g, X1 - 1, Y0, 1, H, lo);
      if (st === 'bonus') { const sc = Math.max(1, Math.round(W / 12)); E.font.text(g, t.glyph || '?', X0 + W / 2, Y0 + Math.round(H / 2) - Math.round(3.5 * sc), t.glyphColor || '#fff4c8', { align: 'center', outline: lo, scale: sc }); }
      else { const q = Math.max(1, Math.round(W * .15)); for (const [qx, qy] of [[X0 + q, Y0 + q], [X1 - q - 1, Y0 + q], [X0 + q, Y1 - q - 1], [X1 - q - 1, Y1 - q - 1]]) px.dot(g, qx, qy, lo); }
    }
    if (st !== 'ground' && st !== 'plain') {
      if (openTop) px.rect(g, X0, Y0, W, 1, tt.hi);
      if (openB) { px.rect(g, X0, Y1 - 1, W, 1, tt.deep); px.rect(g, X0, Y1 - 2, W, 1, tt.sh); }
      if (openL) px.rect(g, X0, Y0, 1, H, tt.lt);
      if (openR) px.rect(g, X1 - 1, Y0, 1, H, tt.deep);
    } else if (openB) px.rect(g, X0, Y1 - 1, W, 1, tt.deep);
  }
}
E.PlatformMap = PlatformMap;
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
  knock(dir, speed = 130, up = 170, stun = .3) { this.vx = dir * speed; this.vz = up; this.stun = stun; this.climbing = false; this.dashing = 0; }
  rigState(extra) { return Object.assign({ x: this.x, y: this.y, z: this.z, vx: this.vx, vy: 0, vz: this.vz, facing: this.facing > 0 ? 0 : Math.PI, air: this.air && !this.climbing, climb: !!this.climbing, hurt: this.stun > 0, dash: this.dashing > 0 }, extra); }
  update(dt, level, ctl = {}, solids) {
    let ix, jumpHeld, jumpPressed, up, down, dashPressed, consume = () => {};
    if (ctl && typeof ctl.move === 'function') {
      ix = ctl.move()[0]; jumpHeld = ctl.down('jump'); jumpPressed = ctl.buffered('jump', this.buffer); up = ctl.down('up'); down = ctl.down('down');
      dashPressed = this.dash > 0 && !!ctl.map.dash && ctl.buffered('dash', .1); consume = a => ctl.consume(a);
    } else { ix = ctl.x || 0; jumpHeld = !!ctl.jump; jumpPressed = !!ctl.jumpPressed; up = !!ctl.up; down = !!ctl.down; dashPressed = !!ctl.dash; }
    if (Math.abs(ix) < .25) ix = 0;
    const wasGround = this.onGround; this.jumped = false; this.landed = false;
    this.stun -= dt; this.drop -= dt; this._dashCD -= dt;
    const ok = this.stun <= 0;
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
      if (dashPressed && ok && this._dashCD <= 0) { consume('dash'); this.dashing = this.dashTime; this._dashCD = this.dashTime + .15; this.vz = Math.max(0, this.vz); }
      if (this.dashing > 0) { this.dashing -= dt; this.vx = this.facing * this.dash; if (!this.onGround) this.vz = Math.max(this.vz, 0); }
      else {
        const target = ok ? ix * this.run : this.vx, turning = ix && this.vx && Math.sign(ix) !== Math.sign(this.vx);
        const a = this.onGround ? (ix ? (turning ? this.decel * 1.3 : this.accel) : this.decel) : this.airAccel;
        this.vx = ok ? approach(this.vx, target, a * dt) : approach(this.vx, 0, 300 * dt);
      }
      if (ix && ok && this.dashing <= 0) this.facing = ix > 0 ? 1 : -1;
      if (!(this.dashing > 0 && !this.onGround)) this.vz = Math.max(-this.maxFall, this.vz - (this.vz > 0 ? this.gravity : this.fallGravity) * dt);
      if (!jumpHeld && this.vz > 0 && !this._cut) { this.vz *= this.cut; this._cut = true; }
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
      if (!this.hitWall && pushing && ix === pushing && !this.onGround) this.hitWall = pushing;
    }
    if (this.onGround && !wasGround) this.landed = true;
    this.air = !this.onGround && !this.climbing;
    return this;
  }
}
E.Platformer = Platformer;

// ---- 14. BODY, BULLETS, SPATIAL HASH ----
// Body: ground-plane physics (top-down, iso, brawler): velocity, friction, wall bounce, knockback, real jumps (z) onto lower blocks
class Body {
  constructor(o = {}) { Object.assign(this, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 5, gravity: 700, friction: 0, bounce: 0, step: 2, onGround: true, groundZ: 0, hitWall: false, landed: false }, o); }
  push(ix, iy, iz = 0) { this.vx += ix; this.vy += iy; if (iz) { this.vz += iz; this.onGround = false; } return this; }
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
    if (this.onGround && this.z > ground + .5) this.onGround = false;
    if (this.onGround) { this.z = ground; this.vz = 0; }
    else {
      this.vz -= this.gravity * dt; this.z += this.vz * dt;
      if (this.z <= ground) {
        this.z = ground;
        if (this.bounce > 0 && this.vz < -80) { this.vz = -this.vz * this.bounce; this.bounced = true; }
        else { this.landed = true; this.vz = 0; this.onGround = true; }
      }
    }
    this.groundZ = ground;
    return this;
  }
}
E.Body = Body;
class Bullets {
  constructor(game, o = {}) { this.game = game; this.list = []; this.max = o.max || 800; this.plane = o.plane || 'ground'; this.sparks = o.sparks !== false; }
  fire(b) {
    if (this.list.length >= this.max) return null;
    const q = Object.assign({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 2, dmg: 1, life: 3, t: 0, team: 'player', color: '#ffe066', core: '#ffffff', pierce: false, grav: 0, dead: false }, b);
    this.list.push(q); return q;
  }
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
      if (b.sprite) { r.sprite(b.x, b.y, b.z, b.sprite, { anchor: 'center', flip: b.vx < 0 }); continue; }
      if (!r.visible(b.x, b.y, b.z, 12, 12, 12)) continue;
      r.queue(b.x, b.y, b.z, g => {
        const [x, y] = r.w(b.x, b.y, b.z), [tx, ty] = r.w(b.x - b.vx * .02, b.y - b.vy * .02, b.z - b.vz * .02), rad = Math.max(.6, b.r * s * .7);
        px.line(g, tx, ty, x, y, b.color, Math.max(1, Math.round(rad))); px.disc(g, x, y, rad, b.color); px.dot(g, x, y, b.core);
      }, { bias: .3 });
    }
  }
}
E.Bullets = Bullets;
E.pattern = {
  dir: (angle, speed) => [Math.cos(angle) * speed, Math.sin(angle) * speed],
  aim: (a, b, speed) => { const an = Math.atan2(b.y - a.y, b.x - a.x); return [Math.cos(an) * speed, Math.sin(an) * speed]; },
  aimSide: (a, b, speed) => { const an = Math.atan2((b.z || 0) - (a.z || 0), b.x - a.x); return [Math.cos(an) * speed, Math.sin(an) * speed]; },
  spread: (angle, n, arc, speed) => Array.from({ length: n }, (_, i) => { const a = angle + (n < 2 ? 0 : (i / (n - 1) - .5) * arc); return [Math.cos(a) * speed, Math.sin(a) * speed]; }),
  ring: (n, speed, offset = 0) => Array.from({ length: n }, (_, i) => { const a = offset + i / n * TAU; return [Math.cos(a) * speed, Math.sin(a) * speed]; })
};
class SpatialHash {
  constructor(cell = 32) { this.cell = cell; this.map = new Map(); }
  _k(cx, cy) { return (cx & 0xffff) * 65536 + (cy & 0xffff); }
  clear() { this.map.clear(); return this; }
  add(o, x = o.x, y = o.y) { const k = this._k(Math.floor(x / this.cell), Math.floor(y / this.cell)); let a = this.map.get(k); if (!a) this.map.set(k, a = []); a.push(o); return this; }
  build(list, xk = 'x', yk = 'y') { this.clear(); for (const o of list) if (o && !o.dead) this.add(o, o[xk], o[yk]); return this; }
  near(x, y, r, fn) {
    const C = this.cell;
    for (let cy = Math.floor((y - r) / C); cy <= Math.floor((y + r) / C); cy++) for (let cx = Math.floor((x - r) / C); cx <= Math.floor((x + r) / C); cx++) {
      const a = this.map.get(this._k(cx, cy)); if (a) for (const o of a) fn(o);
    }
  }
  query(x, y, r) { const out = []; this.near(x, y, r, o => out.push(o)); return out; }
}
E.SpatialHash = SpatialHash;

// ---- 15. AUDIO: chip synth (no sound files). Voice: { wave: square|pulse|pulse12|triangle|saw|sine|noise, freq, to, dur, vol, arp, step, vib: [rate, depth], filter, delay }
//   music tracks: one token per step: C4 F#3 Bb2 = note, '-' holds, '.' rests, '|' ignored; drums k s h o c t
const NOTE_RE = /^([A-Ga-g])([#b]?)(-?\d)$/, SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteFreq(n) {
  if (typeof n === 'number') return n;
  const m = NOTE_RE.exec(String(n).trim()); if (!m) return 0;
  const s = SEMI[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12;
  return 440 * Math.pow(2, (s - 69) / 12);
}
E.note = noteFreq;
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
  get ready() { return !!this.ctx && this.ctx.state === 'running'; }
  _levels() { if (!this.ctx) return; this.master.gain.value = this.muted ? 0 : this.volume; this.sfxBus.gain.value = this.sfxVolume; this.musBus.gain.value = this.musicVolume * (this._ducked ? .35 : 1); }
  setVolume(v) { this.volume = clamp(v, 0, 1); this._levels(); }
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
  define(name, voice) { this.presets[name] = voice; }
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
    if (S && this.ctx) { const t = this.ctx.currentTime; S.bus.gain.setValueAtTime(S.bus.gain.value, t); S.bus.gain.linearRampToValueAtTime(0, t + .06); setTimeout(() => { try { S.bus.disconnect(); } catch (e) {  } }, 300); }
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

// ---- 16. UI: window boxes, bars, hearts, typewriter Dialog, Menu (draw them in r.overlay: screen pixels, on top) ----
let _hearts = null;
const heartSprites = () => _hearts || (_hearts = {
  full: sprite(['.RR.RR.', 'RWRRRRR', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'], { R: '#e8384a', W: '#ffd0d6' }),
  half: sprite(['.RR.DD.', 'RWRDDDD', 'RRRDDDD', '.RRDDD.', '..RDD..', '...D...'], { R: '#e8384a', W: '#ffd0d6', D: '#3a1826' }),
  empty: sprite(['.DD.DD.', 'DDDDDDD', 'DDDDDDD', '.DDDDD.', '..DDD..', '...D...'], { D: '#3a1826' })
});
E.ui = {
  box(g, x, y, w, h, o = {}) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const bg = o.bg || '#141a3a', bd = o.border || '#e8e4ff', sh = o.shadow === undefined ? '#05040a' : o.shadow;
    if (o.alpha !== undefined && o.alpha < 1) {
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
  bar(g, x, y, w, h, frac, color = '#e0463c', o = {}) {
    const f = Math.round((w - 2) * clamp(frac, 0, 1));
    px.rect(g, x, y, w, h, o.border || '#140b12'); px.rect(g, x + 1, y + 1, w - 2, h - 2, o.bg || '#3a1a26');
    if (f > 0) { px.rect(g, x + 1, y + 1, f, h - 2, color); px.rect(g, x + 1, y + 1, f, 1, shade(color, .35)); }
  },
  hearts(g, x, y, hp, max, o = {}) {
    const H = heartSprites(), per = o.perRow || 10;
    for (let i = 0; i < Math.ceil(max); i++) { const v = hp - i, s = v >= 1 ? H.full : v >= .5 ? H.half : H.empty; px.sprite(g, s, x + (i % per) * 8, y + Math.floor(i / per) * 7); }
  },
  counter(g, x, y, label, value, color = '#ffffff', o = {}) { return E.font.text(g, label + ' ' + value, x, y, color, o); }
};
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
  say(text, o = {}) {
    this.portrait = typeof o.portrait === 'function' ? o.portrait : null; this.pSize = o.portraitSize || 40;
    this._place = o.place; this._y = o.y; this._alpha = o.alpha;
    const d = this._dims(), pages = [];
    for (const t of Array.isArray(text) ? text : [text]) { const L = E.font.wrap(String(t), d.w - d.tx - 5); for (let k = 0; k < L.length; k += this.lines) pages.push(L.slice(k, k + this.lines)); }
    this.pages = pages.length ? pages : [['']]; this.i = 0; this.shown = 0; this.open = true; this.choice = 0;
    this.name = o.name || null; this.onDone = o.onDone || null; this.choices = o.choices || null; this.onChoice = o.onChoice || null; this._blip = 0;
    this.auto = o.auto || 0; this.modal = o.modal !== false; this._wait = 0;
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
    if (this.auto && !this.choices && !this.typing && (this._wait += dt) >= this.auto) {
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
      if (this.portrait) this.portrait(g, d.x + 5, d.y + Math.round((d.h - d.P) / 2), d.P);
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

// ---- 17. FULL-ENGINE-ONLY CALLS: no-ops here (each warns once), so a game written for dist/my-3d2dge.js still runs ----
const fullOnly = name => function () { warn('full:' + name, name + ' is only in the full engine (dist/my-3d2dge.js); the agent edition ignores it'); return null; };
px.glow = () => {};
E.prop = fullOnly('E.prop');
Renderer.prototype.prop = fullOnly('r.prop');
E.Backdrop = class { constructor() { fullOnly('E.Backdrop')(); } draw() {} };
for (const m of ['enableGPU', 'setZoom', 'rotateView', 'resetCamera']) Game.prototype[m] = fullOnly('game.' + m);
for (const m of ['drawPortrait', 'drawSmear', 'debug']) Humanoid.prototype[m] = fullOnly('rig.' + m);
Input.prototype.touchButtons = fullOnly('input.touchButtons');
Object.defineProperty(Game.prototype, 'lights', { get() { return this._lights || (this._lights = { enabled: false, ambient: 1, add: fullOnly('game.lights'), caster() {}, heat() {} }); } });

root.My3D2dge = E;
})(typeof window !== 'undefined' ? window : globalThis);
