import test from 'node:test';
import assert from 'node:assert/strict';
import '../my-3d2dge.js';
import { RasterCanvas } from './helpers/raster-canvas.mjs';
import { createWorldRenderer } from '../src/renderer.js';
import { createInteriorRenderer } from '../src/interior-renderer.js';
import { enterInterior, INTERIOR_LAYOUTS } from '../src/interiors.js';
import {
  LATE_METER_APPEARANCES,
  LATE_METER_CLIPBOARD,
  lateMeterPropDescriptors,
} from '../src/campaign/late-meter-scenes.js';

const E = globalThis.My3D2dge;
const specs = { sedan: { length: 29, width: 15 } };
const game = { time: 1, real: 1, lights: { add() {} } };
const world = {
  width: 600,
  height: 600,
  buildings: [],
  obstacles: [],
  roads: [],
  water: [],
  locations: [],
  districts: [],
};
function withCanvas(fn) {
  const original = globalThis.document;
  globalThis.document = { createElement: () => new RasterCanvas() };
  try {
    return fn();
  } finally {
    globalThis.document = original;
  }
}
function fixture() {
  const actor = {
    id: 'LL-ARC-REEVE',
    x: 120,
    y: 120,
    z: 0,
    sceneId: null,
    angle: Math.PI / 3,
    speed: 0,
    health: 100,
    appearance: structuredClone(LATE_METER_APPEARANCES.reeve),
  };
  const state = {
    time: 1,
    player: {
      x: 120,
      y: 120,
      z: 0,
      sceneId: null,
      angle: 0,
      health: 100,
      weapon: 'pistol',
      vehicleId: 'hidden-player-fixture',
    },
    scene: { kind: 'exterior', id: 'harbor-city' },
    wanted: { level: 0, observed: false },
    vehicles: [],
    pedestrians: [],
    hostiles: [],
    police: [],
    policeAircraft: [],
    bullets: [],
    ordnance: [],
    pickups: [],
    fires: [],
    combatEffects: [],
    mission: null,
    companions: { actors: [actor] },
    campaignRuntime: {
      sceneProps: { [LATE_METER_CLIPBOARD.id]: structuredClone(LATE_METER_CLIPBOARD) },
    },
  };
  return { state, actor, prop: state.campaignRuntime.sceneProps[LATE_METER_CLIPBOARD.id] };
}
function renderer({ x = 120, y = 120, screenX = 200, screenY = 180, extraPass = false } = {}) {
  const canvas = new RasterCanvas();
  canvas.width = 400;
  canvas.height = 300;
  const ctx = canvas.getContext('2d'),
    draw = ctx.drawImage.bind(ctx),
    view = new E.View('city', 'City', 35, 55, 2),
    anchor = view.p(x, y, 0);
  ctx.drawImage = (source, ...args) =>
    args.length === 2
      ? draw(source, 0, 0, source.width, source.height, ...args, source.width, source.height)
      : draw(source, ...args);
  const r = {
    ctx,
    view,
    ix: anchor[0] - screenX,
    iy: anchor[1] - screenY,
    bw: canvas.width,
    bh: canvas.height,
    W: canvas.width,
    H: canvas.height,
    queued: [],
    actors: [],
    get tgt() {
      return ctx;
    },
    w(x, y, z = 0) {
      const p = view.p(x, y, z);
      return [p[0] - this.ix, p[1] - this.iy];
    },
    visible(x, y, z = 0, margin = 60, up = 30, down = 90) {
      const p = this.w(x, y, z);
      return p[0] > -margin && p[0] < this.bw + margin && p[1] > -up && p[1] < this.bh + down;
    },
    queue(x, y, z, fn, options) {
      this.queued.push({ x, y, z, fn, options });
    },
    actor(x, y, z, fn, options) {
      this.actors.push({ x, y, z, fn, options });
    },
    sky() {},
    shadow() {},
    overlay() {},
    groundDisc() {},
    groundRing() {},
    glowDisc() {},
    groundPts(...args) {
      return E.Renderer.prototype.groundPts.apply(this, args);
    },
    box(g, ...args) {
      E.Renderer.prototype.box.call(this, g, ...args);
    },
    flush() {
      const queued = [...this.queued];
      for (const actor of this.actors)
        queued.push({
          ...actor,
          fn: (g) => {
            const origin = this.w(actor.x, actor.y, actor.z).map(Math.round);
            if (extraPass) {
              const info = new RasterCanvas();
              info.width = canvas.width;
              info.height = canvas.height;
              actor.fn(info.getContext('2d'), ...origin);
            }
            actor.fn(g, ...origin);
          },
        });
      queued.sort((a, b) => view.order(a.x, a.y, a.z) - view.order(b.x, b.y, b.z));
      for (const item of queued) item.fn(ctx);
    },
  };
  return r;
}
function colorPixels(r, color) {
  const rgb = E.hex(color);
  let count = 0;
  for (let i = 0; i < r.ctx.canvas.pixels.length; i += 4)
    if (rgb.every((value, channel) => Math.abs(r.ctx.canvas.pixels[i + channel] * 255 - value) < 1))
      count++;
  return count;
}

test('canonical saved clothing and one carried clipboard draw once before actual clue proof', () =>
  withCanvas(() => {
    const f = fixture(),
      proofs = [],
      draw = createWorldRenderer(game, world, specs, {
        onRenderedClues: (...args) => proofs.push(args),
      }),
      r = renderer({ extraPass: true });
    f.state.pedestrians.push(f.actor);
    draw.draw(r, f.state, { rain: false });
    assert.equal(r.actors.length, 1, 'the same canonical body in two collections remains one body');
    assert.equal(proofs.length, 0, 'queuing a body does not prove a rendered clue');
    r.flush();
    assert.equal(proofs.length, 1, 'an information-buffer pass cannot duplicate proof');
    assert.equal(proofs[0][0], f.state);
    assert.equal(proofs[0][1], f.actor);
    assert.deepEqual(proofs[0][2], ['grey-tow-jacket', 'co-op-repossession-clipboard']);
    assert.ok(Object.isFrozen(proofs[0][2]));
    assert.ok(colorPixels(r, '#7e8582') > 0, 'the authored grey coat appears in native pixels');
    assert.ok(colorPixels(r, '#d8d1aa') > 0, 'the actual carried form appears in native pixels');
    draw.dispose();
  }));

test('dropped, destroyed and missing props never invent carried clipboard recognition', () =>
  withCanvas(() => {
    for (const mode of ['dropped', 'destroyed', 'missing', 'health-zero', 'hidden']) {
      const f = fixture(),
        proofs = [],
        r = renderer();
      if (mode === 'missing') delete f.state.campaignRuntime.sceneProps[LATE_METER_CLIPBOARD.id];
      else if (mode === 'dropped')
        Object.assign(f.prop, {
          state: 'dropped',
          ownerActorId: null,
          x: 140,
          y: 130,
          z: 0,
          angle: 0,
        });
      else if (mode === 'health-zero') f.prop.health = 0;
      else if (mode === 'hidden') f.prop.visible = false;
      else f.prop.state = 'destroyed';
      const draw = createWorldRenderer(game, world, specs, {
        onRenderedClues: (...args) => proofs.push(args),
      });
      draw.draw(r, f.state, { rain: false });
      r.flush();
      assert.equal(proofs.length, 0, mode);
      assert.equal(colorPixels(r, '#d8d1aa') > 0, mode === 'dropped', mode);
      assert.equal(r.actors.length, 1, 'a prop does not create another actor body');
      draw.dispose();
    }
  }));

test('dead, seated, back-facing, offscreen and other-layer actors cannot earn clue proof', () =>
  withCanvas(() => {
    for (const mode of ['dead', 'seated', 'back', 'clipped', 'other-layer', 'unknown-appearance']) {
      const f = fixture(),
        proofs = [],
        r = renderer(mode === 'clipped' ? { screenX: -7 } : {});
      if (mode === 'dead') f.actor.health = 0;
      if (mode === 'seated') Object.assign(f.actor, { inVehicle: true, vehicleId: 'car', seat: 0 });
      if (mode === 'back') f.actor.angle += Math.PI;
      if (mode === 'other-layer') f.actor.z = -18;
      if (mode === 'unknown-appearance') f.actor.appearance.version = 999;
      const draw = createWorldRenderer(game, world, specs, {
        onRenderedClues: (...args) => proofs.push(args),
      });
      draw.draw(r, f.state, { rain: false });
      r.flush();
      assert.equal(proofs.length, 0, mode);
      draw.dispose();
    }
  }));

test('a real building along the camera ray suppresses clue proof even inside the culling viewport', () =>
  withCanvas(() => {
    const f = fixture(),
      proofs = [],
      occluded = {
        ...world,
        buildings: [
          {
            id: 'camera-wall',
            x: 135,
            y: 137,
            w: 20,
            h: 20,
            height: 100,
            color: '#657b6d',
            type: 'office',
          },
        ],
      },
      draw = createWorldRenderer(game, occluded, specs, {
        onRenderedClues: (...args) => proofs.push(args),
      }),
      r = renderer();
    draw.draw(r, f.state, { rain: false });
    assert.equal(r.actors.length, 1, 'ordinary frustum culling still queues the obscured body');
    r.flush();
    assert.equal(proofs.length, 0, 'drawing a body behind a wall cannot identify its clues');
    draw.dispose();
  }));

test('the rig cache follows a changed saved appearance instead of retaining a hashed palette', () =>
  withCanvas(() => {
    const f = fixture(),
      draw = createWorldRenderer(game, world, specs),
      first = renderer(),
      second = renderer();
    draw.draw(first, f.state, { rain: false });
    first.flush();
    f.actor.appearance = structuredClone(LATE_METER_APPEARANCES.yara);
    draw.draw(second, f.state, { rain: false });
    second.flush();
    assert.ok(colorPixels(first, '#7e8582') > 0);
    assert.equal(colorPixels(second, '#7e8582'), 0);
    assert.ok(colorPixels(second, '#526f69') > 0);
    assert.equal(draw.stats.rigs, 1);
    draw.dispose();
  }));

test('a scripted clipboard review visibly bends the native arm without moving body or prop', () =>
  withCanvas(() => {
    const idle = fixture(),
      reading = fixture(),
      idleRenderer = createWorldRenderer(game, world, specs),
      readingRenderer = createWorldRenderer(game, world, specs);
    reading.actor.sceneAction = 'read-clipboard';
    const before = structuredClone(reading.state),
      propBefore = lateMeterPropDescriptors(reading.state);
    let idlePixels, readingPixels;
    for (let i = 0; i < 10; i++) {
      const a = renderer(),
        b = renderer();
      idleRenderer.draw(a, idle.state, { rain: false });
      readingRenderer.draw(b, reading.state, { rain: false });
      a.flush();
      b.flush();
      idlePixels = a.ctx.canvas.pixels;
      readingPixels = b.ctx.canvas.pixels;
      assert.equal(b.actors.length, 1);
      assert.deepEqual([b.actors[0].x, b.actors[0].y, b.actors[0].z], [120, 120, 0]);
    }
    let changed = 0;
    for (let i = 0; i < idlePixels.length; i += 4)
      if (idlePixels.slice(i, i + 4).some((value, channel) => value !== readingPixels[i + channel]))
        changed++;
    assert.ok(changed > 8, `actual native review pixels must differ from idle: ${changed}`);
    assert.deepEqual(reading.state, before, 'rendering cannot alter saved actor physics');
    assert.deepEqual(lateMeterPropDescriptors(reading.state), propBefore);
    idleRenderer.dispose();
    readingRenderer.dispose();
  }));

test('interior scenery and clue callbacks retain the authoritative state identity', () =>
  withCanvas(() => {
    const f = fixture(),
      details = [],
      proofs = [],
      roomWorld = { ...world, locations: [{ id: 'impound-annex', x: 293, y: 389 }] };
    f.state.player.vehicleId = null;
    Object.assign(f.state.player, { x: 293, y: 389 });
    assert.equal(enterInterior(f.state, 'impound-annex-entry', { world: roomWorld }).ok, true);
    f.state.player.vehicleId = 'hidden-player-fixture';
    Object.assign(f.actor, { sceneId: 'impound-annex', x: 90, y: 144 });
    f.prop.sceneId = 'impound-annex';
    const draw = createInteriorRenderer(game, specs, {
      drawRoomDetails: (...args) => details.push(args),
      onRenderedClues: (...args) => proofs.push(args),
    });
    const r = renderer({ x: 90, y: 144 });
    assert.equal(draw.draw(r, f.state), true);
    assert.equal(details.length, 1);
    assert.equal(details[0][0], r);
    assert.equal(
      details[0][1],
      f.state,
      'the transient filtered render state cannot own mission facts',
    );
    assert.equal(details[0][2], INTERIOR_LAYOUTS['impound-annex']);
    r.flush();
    assert.equal(proofs.length, 1);
    assert.equal(proofs[0][0], f.state);
    draw.dispose();
  }));

test('shelter and evidence hook glyphs keep their authored symbols instead of becoming darts', () =>
  withCanvas(() => {
    const originalText = E.font.text,
      symbols = [];
    E.font.text = (g, text, ...args) => {
      symbols.push(text);
      originalText.call(E.font, g, text, ...args);
    };
    try {
      for (const [roomId, anchor] of [
        ['dockside-rooms', { x: 129, y: 308 }],
        ['impound-annex', { x: 293, y: 389 }],
      ]) {
        const f = fixture();
        f.state.companions.actors = [];
        f.state.player.vehicleId = null;
        Object.assign(f.state.player, anchor);
        assert.equal(
          enterInterior(f.state, `${roomId}-entry`, {
            world: { ...world, locations: [{ id: roomId, ...anchor }] },
          }).ok,
          true,
        );
        f.state.player.vehicleId = 'hidden-player-fixture';
        const draw = createInteriorRenderer(game, specs),
          r = renderer({ x: 90, y: 150 });
        draw.draw(r, f.state);
        r.flush();
        draw.dispose();
      }
      for (const letter of ['F', 'S', 'R', 'W', 'E']) assert.ok(symbols.includes(letter), letter);
    } finally {
      E.font.text = originalText;
    }
  }));
