import test from 'node:test';
import assert from 'node:assert/strict';
import '../my-3d2dge.js';
import { createWorldRenderer } from '../src/renderer.js';
import { RasterCanvas, canvases } from './helpers/raster-canvas.mjs';
const E = globalThis.My3D2dge;
const originalDocument = globalThis.document;
function withCanvas(fn) {
  globalThis.document = { createElement: () => new RasterCanvas() };
  try {
    return fn();
  } finally {
    globalThis.document = originalDocument;
  }
}
function world({ city = false, buildings = [], roads = [] } = {}) {
  return {
    width: 50000,
    height: 7000,
    buildings,
    roads,
    locations: [],
    districts: [],
    water: [],
    obstacles: [],
    sites: [],
    landforms: city
      ? [
          {
            id: 'mainland',
            polygon: [
              [0, 0],
              [50000, 0],
              [50000, 7000],
              [0, 7000],
            ],
          },
        ]
      : [],
  };
}
function state(changes = {}) {
  return {
    player: { x: 20, y: 20, z: 0, angle: 0, health: 100, vehicleId: 'hidden', weapon: 'pistol' },
    vehicles: [],
    pedestrians: [],
    police: [],
    hostiles: [],
    policeAircraft: [],
    bullets: [],
    ordnance: [],
    fires: [],
    pickups: [],
    mission: null,
    ...changes,
  };
}
function renderer(
  view = new E.View('qa', 'QA', 0, 82, 1),
  { ix = 0, iy = 0, width = 400, height = 180 } = {},
) {
  const cv = new RasterCanvas();
  cv.width = width;
  cv.height = height;
  const g = cv.getContext('2d'),
    draw = g.drawImage.bind(g);
  g.drawImage = function (source, ...args) {
    if (args.length === 2)
      return draw(
        source,
        0,
        0,
        source.width,
        source.height,
        args[0],
        args[1],
        source.width,
        source.height,
      );
    return draw(source, ...args);
  };
  const r = {
    ctx: g,
    view,
    ix,
    iy,
    bw: width,
    bh: height,
    W: width,
    H: height,
    queued: [],
    actors: [],
    shadows: [],
    points: [],
    visibleCalls: [],
    w(x, y, z = 0) {
      this.points.push({ x, y, z });
      const p = view.p(x, y, z);
      return [p[0] - ix, p[1] - iy];
    },
    visible(x, y, z = 0, margin = 60, up = 30, down = 90) {
      this.visibleCalls.push({ x, y, z });
      const p = view.p(x, y, z);
      return (
        p[0] - ix > -margin &&
        p[0] - ix < width + margin &&
        p[1] - iy > -up &&
        p[1] - iy < height + down
      );
    },
    sky() {
      g.fillStyle = '#263f40';
      g.fillRect(0, 0, width, height);
      g._c = null;
    },
    queue(x, y, z, fn, options) {
      this.queued.push({ x, y, z, fn, options });
    },
    actor(x, y, z, fn, options) {
      this.actors.push({ x, y, z, fn, options });
    },
    shadow(...args) {
      this.shadows.push(args);
    },
    groundDisc() {},
    groundRing() {},
    overlay() {},
    glowDisc() {},
    box() {},
    flush() {
      for (const item of this.queued.sort(
        (a, b) => view.order(a.x, a.y, a.z) - view.order(b.x, b.y, b.z),
      ))
        item.fn(g);
      this.queued = [];
    },
  };
  return r;
}
const specs = { sedan: { length: 29, width: 15 } };
const block = (id, x, y, changes = {}) => ({
  id,
  x,
  y,
  w: 42,
  h: 36,
  height: 45,
  color: '#87948a',
  type: 'office',
  ...changes,
});
test('a real seated companion changes car-window pixels without drawing a standing body over the roof', () =>
  withCanvas(() => {
    const game = { time: 0, real: 0 },
      draw = createWorldRenderer(game, world(), specs);
    const car = {
      id: 'taxi',
      spec: 'sedan',
      x: 100,
      y: 100,
      z: 0,
      angle: 0,
      health: 100,
      color: '#dfb447',
    };
    const base = state({
      player: { ...state().player, x: 100, y: 100, vehicleId: 'taxi' },
      vehicles: [car],
    });
    const empty = renderer(),
      occupied = renderer();
    draw.draw(empty, base);
    empty.flush();
    const felix = {
      id: 'LL-CHAR-002',
      x: 103.5,
      y: 103.3,
      z: 5,
      sceneId: null,
      health: 100,
      angle: 0,
      speed: 0,
      vehicleId: 'taxi',
      seat: 1,
      inVehicle: true,
      companionPhase: 'seated',
    };
    draw.draw(occupied, { ...base, companions: { actors: [felix] } });
    occupied.flush();
    assert.equal(occupied.actors.length, 0);
    assert.ok(
      occupied.ctx.canvas.pixels.some((v, i) => v !== empty.ctx.canvas.pixels[i]),
      'the passenger must be visible through the actual glass',
    );
    const exiting = renderer();
    draw.draw(exiting, {
      ...base,
      companions: { actors: [{ ...felix, companionPhase: 'exiting', x: 104, y: 113, z: 0 }] },
    });
    assert.equal(
      exiting.actors.length,
      1,
      'physical egress must remain visible while seat ownership is being released',
    );
    draw.dispose();
  }));

test('large-city landform worlds use cropped ground tiles instead of the legacy whole-city atlas', () =>
  withCanvas(() => {
    const draw = createWorldRenderer({ time: 0, real: 0 }, world({ city: true }), specs),
      r = renderer();
    draw.draw(r, state(), { rain: false });
    assert.ok(draw.stats.ground);
    assert.ok(draw.stats.ground.drawnTiles > 0);
    assert.ok(draw.stats.ground.cachedTiles <= 48);
    assert.ok(r.ctx.images.every((image) => image.sw <= r.bw && image.sh <= r.bh));
    assert.ok(
      canvases
        .slice(-draw.stats.ground.cachedTiles)
        .every((canvas) => canvas.width <= 384 && canvas.height <= 384),
    );
    draw.dispose();
  }));

test('projected full footprint and roof height retain a visible tower whose ground center is outside the old fixed margin', () =>
  withCanvas(() => {
    const tower = block('tower', 20, 300, { w: 50, h: 20, height: 305 }),
      far = Array.from({ length: 500 }, (_, i) => block(`far-${i}`, 5000 + i * 80, 5000));
    const draw = createWorldRenderer(
        { time: 0, real: 0 },
        world({ buildings: [tower, ...far] }),
        specs,
      ),
      view = new E.View('zoomed', 'Zoomed', 0, 48, 2.5),
      r = renderer(view, { width: 160, height: 128 });
    draw.draw(r, state(), { rain: false });
    assert.equal(draw.stats.visibleBuildings, 1);
    assert.equal(draw.stats.queriedBuildings, 1);
    r.flush();
    assert.equal(draw.stats.generatedBuildingTextures, 1);
    assert.ok(r.ctx.images.length > 0);
    draw.dispose();
  }));

test('bounded building textures release evicted canvases while every queued visible facade still draws', () =>
  withCanvas(() => {
    const b = Array.from({ length: 5 }, (_, i) => block(`b-${i}`, 15 + i * 65, 25));
    const draw = createWorldRenderer({ time: 0, real: 0 }, world({ buildings: b }), specs, {
      maxBuildingTextures: 2,
      maxBuildingPixels: 50000,
    });
    const r = renderer(new E.View('flat', 'Flat', 0, 90, 1));
    draw.draw(r, state(), { rain: false });
    assert.equal(draw.stats.visibleBuildings, 5);
    r.flush();
    assert.equal(draw.stats.generatedBuildingTextures, 5);
    assert.equal(draw.stats.buildingTextures, 2);
    assert.ok(draw.stats.buildingPixels <= 50000);
    const textures = r.ctx.images.filter((image) => image.sw < 100 && image.sh < 100);
    assert.equal(textures.length, 5);
    assert.ok(
      textures.slice(0, 3).every((image) => image.source.width === 0 && image.source.height === 0),
    );
    draw.dispose();
    assert.equal(draw.stats.buildingPixels, 0);
  }));

test('an oversized projected facade paints live without allocating beyond its texture pixel budget', () =>
  withCanvas(() => {
    const draw = createWorldRenderer(
        { time: 0, real: 0 },
        world({ buildings: [block('wide', 0, 20, { w: 350, h: 130, height: 300 })] }),
        specs,
        { maxBuildingPixels: 1000 },
      ),
      r = renderer();
    draw.draw(r, state(), { rain: false });
    r.flush();
    assert.equal(draw.stats.buildingTextures, 0);
    assert.equal(draw.stats.buildingPixels, 0);
    assert.ok(r.ctx.fills > 100);
    draw.dispose();
  }));

test('rig caching has a maximum population and retires streamed-out actors after its idle window', () =>
  withCanvas(() => {
    const draw = createWorldRenderer({ time: 0, real: 0 }, world(), specs, {
        maxRigs: 2,
        rigIdleFrames: 1,
      }),
      r = renderer();
    draw.draw(
      r,
      state({
        pedestrians: [
          { id: 'one', x: 25, y: 40, z: 0, angle: 0, speed: 0, health: 100 },
          { id: 'two', x: 55, y: 40, z: 0, angle: 0, speed: 0, health: 100 },
          { id: 'three', x: 85, y: 40, z: 0, angle: 0, speed: 0, health: 100 },
        ],
      }),
      { rain: false },
    );
    assert.equal(draw.stats.rigs, 2);
    draw.draw(renderer(), state(), { rain: false });
    draw.draw(renderer(), state(), { rain: false });
    assert.equal(draw.stats.rigs, 0);
    draw.dispose();
  }));

test('vehicle visibility, shadow, queue and every local body point use the actual deck elevation', () =>
  withCanvas(() => {
    const draw = createWorldRenderer({ time: 0, real: 0 }, world(), specs),
      r = renderer(),
      car = { id: 'car', spec: 'sedan', x: 70, y: 90, z: 28, angle: 0, health: 100, speed: 0 };
    draw.draw(r, state({ vehicles: [car] }), { rain: false });
    assert.ok(r.visibleCalls.some((p) => p.x === car.x && p.y === car.y && p.z === 28));
    assert.equal(r.shadows.at(-1).at(-1), 28);
    assert.ok(r.queued.some((q) => q.x === 70 && q.y === 90 && q.z === 28));
    r.points = [];
    r.flush();
    assert.ok(r.points.every((p) => p.z >= 29));
    draw.dispose();
  }));

test('bodies below an opaque deck are hidden while occupants on its floor remain visible', () =>
  withCanvas(() => {
    const road = {
      id: 'deck',
      x1: 40,
      y1: 70,
      x2: 240,
      y2: 70,
      width: 70,
      z1: 28,
      z2: 28,
      kind: 'bridge',
      bridge: true,
      access: ['car', 'foot'],
    };
    const draw = createWorldRenderer(
        { time: 0, real: 0 },
        world({ city: true, roads: [road] }),
        specs,
      ),
      r = renderer();
    const cars = [
      { id: 'under', spec: 'sedan', x: 100, y: 70, z: 0, angle: 0, health: 100 },
      { id: 'over', spec: 'sedan', x: 100, y: 70, z: 28, angle: 0, health: 100 },
    ];
    draw.draw(r, state({ vehicles: cars }), { rain: false });
    assert.equal(
      r.queued.some((q) => q.x === 100 && q.y === 70 && q.z === 0),
      false,
    );
    assert.equal(
      r.queued.some((q) => q.x === 100 && q.y === 70 && q.z === 28),
      true,
    );
    draw.dispose();
  }));

test('underground cutaway suppresses surface architecture and bodies while keeping bore occupants', () =>
  withCanvas(() => {
    const road = {
      id: 'bore',
      x1: 40,
      y1: 150,
      x2: 240,
      y2: 150,
      width: 70,
      z1: -18,
      z2: -18,
      kind: 'tunnel',
      tunnel: true,
      access: ['car', 'foot'],
    };
    const draw = createWorldRenderer(
        { time: 0, real: 0 },
        world({ city: true, roads: [road], buildings: [block('surface-house', 30, 70)] }),
        specs,
      ),
      r = renderer();
    const cars = [
      { id: 'surface', spec: 'sedan', x: 100, y: 100, z: 0, angle: 0, health: 100 },
      { id: 'bore', spec: 'sedan', x: 100, y: 150, z: -18, angle: 0, health: 100 },
    ];
    const peds = [
      { id: 'surface-person', x: 110, y: 100, z: 0, angle: 0, speed: 0, health: 100 },
      { id: 'bore-person', x: 110, y: 150, z: -18, angle: 0, speed: 0, health: 100 },
    ];
    const s = state({ vehicles: cars, pedestrians: peds });
    s.player.z = -18;
    draw.draw(r, s, { rain: false });
    assert.equal(draw.stats.visibleBuildings, 0);
    assert.equal(draw.stats.generatedBuildingTextures, 0);
    assert.equal(
      r.queued.some((q) => q.x === 100 && q.y === 100),
      false,
    );
    assert.equal(
      r.queued.some((q) => q.x === 100 && q.y === 150 && q.z === -18),
      true,
    );
    assert.ok(r.actors.every((actor) => actor.z < 0));
    assert.equal(r.actors.length, 1);
    draw.dispose();
  }));

test('graded reversed and diagonal lamps are compiled once and queried without rescanning the road catalogue', () =>
  withCanvas(() => {
    const roads = [
      {
        id: 'reverse',
        x1: 400,
        y1: 150,
        x2: 0,
        y2: 150,
        width: 40,
        z1: 0,
        z2: 28,
        access: ['foot', 'car'],
      },
      {
        id: 'diagonal',
        x1: 50,
        y1: 50,
        x2: 250,
        y2: 250,
        width: 40,
        z1: 0,
        z2: 14,
        access: ['foot', 'car'],
      },
      { id: 'closed', x1: 20, y1: 200, x2: 400, y2: 200, width: 40, z1: 18, z2: 18, access: [] },
      {
        id: 'rail',
        x1: 20,
        y1: 250,
        x2: 400,
        y2: 250,
        width: 20,
        z1: 24,
        z2: 24,
        access: ['rail'],
      },
    ];
    const data = world({ city: true, roads }),
      draw = createWorldRenderer({ time: 0, real: 0 }, data, specs),
      r = renderer(new E.View('top', 'Top', 0, 90, 1), { height: 300 });
    assert.equal(draw.stats.lampCount, 5);
    Object.defineProperty(data, 'roads', {
      get() {
        throw new Error('static lamps must not read all roads during a frame');
      },
    });
    draw.draw(r, state(), { rain: false });
    assert.ok(
      r.queued.some(
        (q) =>
          Math.abs(q.x - 295) < 1e-6 && Math.abs(q.y - 128) < 1e-6 && Math.abs(q.z - 7.35) < 1e-6,
      ),
    );
    assert.ok(
      r.queued.some(
        (q) =>
          Math.abs(q.x - (50 + 83 / Math.SQRT2)) < 1e-6 &&
          Math.abs(q.y - (50 + 127 / Math.SQRT2)) < 1e-6 &&
          q.z > 5 &&
          q.z < 6,
      ),
    );
    draw.dispose();
  }));

test('facade and roof profiles produce distinct real pixels while preserving protected prologue appearance', () =>
  withCanvas(() => {
    const signatures = [];
    for (const profile of ['finance', 'warehouse', 'housing', 'coastal']) {
      const draw = createWorldRenderer(
          { time: 0, real: 0 },
          world({
            buildings: [block('same-footprint', 40, 80, { w: 64, h: 48, height: 90, profile })],
          }),
          specs,
        ),
        r = renderer(new E.View('city', 'City', 35, 48, 1));
      draw.draw(r, state(), { rain: false });
      r.flush();
      const image = r.ctx.images.at(-1).source;
      let sum = 2166136261;
      for (const value of image.pixels) sum = Math.imul(sum ^ Math.round(value * 255), 16777619);
      signatures.push(sum);
      draw.dispose();
    }
    assert.equal(new Set(signatures).size, 4);
    const protectedPixels = [];
    for (const profile of ['finance', 'housing']) {
      const draw = createWorldRenderer(
          { time: 0, real: 0 },
          world({
            buildings: [
              block('same-footprint', 40, 80, {
                w: 64,
                h: 48,
                height: 90,
                profile,
                protectedPrologue: true,
              }),
            ],
          }),
          specs,
        ),
        r = renderer(new E.View('city', 'City', 35, 48, 1));
      draw.draw(r, state(), { rain: false });
      r.flush();
      protectedPixels.push([...r.ctx.images.at(-1).source.pixels]);
      draw.dispose();
    }
    assert.deepEqual(protectedPixels[0], protectedPixels[1]);
  }));

test('swimming clips the submerged rig, omits held equipment and leg shadow, and emits visible surface ripples', () =>
  withCanvas(() => {
    const OriginalRig = E.Humanoid,
      updates = [];
    E.Humanoid = class {
      constructor(options) {
        this.o = { ...options };
        this.C = { ...options.colors };
      }
      update(dt, pose) {
        updates.push(pose);
      }
      draw(g, x, y) {
        E.px.rect(g, x - 5, y - 40, 10, 40, '#777777');
      }
    };
    try {
      const draw = createWorldRenderer({ time: 0, real: 0 }, world(), specs),
        r = renderer(new E.View('swim', 'Swim', 0, 48, 1)),
        s = state();
      s.player.vehicleId = null;
      s.player.swimming = true;
      s.player.weapon = 'rpg';
      const ripples = [];
      r.groundRing = (...args) => ripples.push(args);
      draw.draw(r, s, { rain: false });
      assert.equal(r.shadows.length, 0);
      assert.ok(ripples.length > 0);
      const g = r.ctx,
        fill = g.fillRect.bind(g),
        stack = [];
      let clipBottom = Infinity,
        pathBottom = Infinity;
      g.save = () => stack.push({ clipBottom, fillStyle: g.fillStyle });
      g.restore = () => {
        const saved = stack.pop();
        clipBottom = saved.clipBottom;
        g.fillStyle = saved.fillStyle;
      };
      g.beginPath = () => {};
      g.rect = (x, y, w, h) => {
        pathBottom = y + h;
      };
      g.clip = () => {
        clipBottom = Math.min(clipBottom, pathBottom);
      };
      g.fillRect = (x, y, w, h) => {
        const height = Math.min(h, clipBottom - y);
        if (height > 0) fill(x, y, w, height);
      };
      const probe = (100 + 107 * r.bw) * 4,
        before = g.canvas.pixels[probe];
      r.actors[0].fn(g, 100, 100);
      assert.equal(
        g.canvas.pixels[probe],
        before,
        'submerged center legs must not paint over water',
      );
      assert.notEqual(
        g.canvas.pixels[(100 + 85 * r.bw) * 4],
        before,
        'upper torso must remain visible',
      );
      assert.equal(updates.at(-1).pose, 'cast');
      draw.dispose();
    } finally {
      E.Humanoid = OriginalRig;
    }
  }));

test('standing on a raised deck is grounded; airborne animation uses height above the current surface', () =>
  withCanvas(() => {
    const OriginalRig = E.Humanoid,
      updates = [];
    E.Humanoid = class {
      constructor(options) {
        this.o = { ...options };
        this.C = { ...options.colors };
      }
      update(dt, pose) {
        updates.push(pose);
      }
      draw() {}
    };
    try {
      const draw = createWorldRenderer({ time: 0, real: 0 }, world(), specs),
        s = state();
      s.player.vehicleId = null;
      s.player.z = 28;
      s.player.groundZ = 28;
      draw.draw(renderer(), s, { rain: false });
      assert.equal(updates.at(-1).air, false);
      s.player.z = 34;
      draw.draw(renderer(), s, { rain: false });
      assert.equal(updates.at(-1).air, true);
      draw.dispose();
    } finally {
      E.Humanoid = OriginalRig;
    }
  }));

test('bore fire, pickup, projectile shadow and negative-height waypoint remain visible while surface effects stay hidden', () =>
  withCanvas(() => {
    const road = {
        id: 'bore',
        x1: 40,
        y1: 150,
        x2: 240,
        y2: 150,
        width: 70,
        z1: -18,
        z2: -18,
        kind: 'tunnel',
        tunnel: true,
        access: ['foot', 'car'],
      },
      draw = createWorldRenderer({ time: 0, real: 0 }, world({ city: true, roads: [road] }), specs),
      r = renderer(),
      s = state();
    s.player.z = -18;
    s.fires = [
      { id: 'deep-fire', x: 100, y: 150, z: -18, radius: 12 },
      { id: 'surface-fire', x: 200, y: 150, z: 0, radius: 12 },
    ];
    s.pickups = [
      {
        id: 'deep-object',
        weapon: 'street-object',
        type: 'object',
        material: 'metal',
        available: true,
        x: 110,
        y: 150,
        z: -18,
      },
      { id: 'surface-object', weapon: 'street-object', available: true, x: 210, y: 150, z: 0 },
    ];
    s.ordnance = [{ id: 'thrown', kind: 'grenade', x: 120, y: 150, z: -8, groundZ: -18, fuse: 1 }];
    s.waypoint = { x: 130, y: 150, z: -18, radius: 12 };
    const rings = [],
      discs = [];
    r.groundRing = (...args) => rings.push(args);
    r.groundDisc = (...args) => discs.push(args);
    draw.draw(r, s, { rain: false });
    assert.ok(r.queued.some((q) => q.x === 100 && q.y === 150 && q.z === -18));
    assert.ok(r.queued.some((q) => q.x === 110 && q.y === 150 && q.z === -15));
    assert.ok(r.queued.some((q) => q.x === 130 && q.y === 150 && q.z === -18));
    assert.equal(
      r.queued.some((q) => q.x === 200 || q.x === 210),
      false,
    );
    assert.equal(r.shadows.at(-1).at(-1), -18);
    assert.ok(rings.every((args) => args.at(-1) === -18));
    assert.equal(discs[0].at(-1), -18);
    draw.dispose();
  }));
