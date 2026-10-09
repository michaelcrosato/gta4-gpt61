/** Native art/component fixtures only. These do not activate or complete M3. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import '../my-3d2dge.js';
import { RasterCanvas } from './helpers/raster-canvas.mjs';
import {
  RIGHT_WRIST_BANDAGE_ART,
  actorDressing,
  enqueueRightWristBandage,
  drawActorWithDressing,
} from '../src/actor-dressings.js';

const E = globalThis.My3D2dge,
  DAX = 'LL-ARC-DAX',
  baseline = JSON.parse(
    readFileSync(new URL('./fixtures/actor-dressings-undressed-pixels.json', import.meta.url)),
  ),
  colors = baseline.colors,
  poses = {
    idle: {},
    crouch: { pose: 'crouch' },
    down: { pose: 'down' },
    guard: { stance: 'guard' },
    counter: { attack: { spec: E.MOVES.cross, phase: 'active', u: 0.5 } },
  },
  view = new E.View('city', 'City', 35, 48, 4, 1);
const copy = (v) => JSON.parse(JSON.stringify(v));
function parentView(changes = {}) {
  return {
    actorId: DAX,
    hand: 'right',
    active: true,
    bandageVisible: true,
    bandage: { ...RIGHT_WRIST_BANDAGE_ART },
    ...changes,
  };
}
function makeRig({ pose = 'idle', angle = 0, style = 'hd', extra = {} } = {}) {
  const original = Math.random;
  Math.random = () => 0.5; // Deterministic render-only blink/idle phase fixture.
  try {
    const rig = new E.Humanoid({
      build: 'heroic',
      size: 0.78,
      weapon: null,
      outfit: 'shirt',
      sleeves: 'long',
      colors: { ...colors },
      style,
      ...extra,
    });
    for (let frame = 0; frame < 30; frame++)
      rig.update(1 / 60, { x: 0, y: 0, z: 0, facing: angle, vx: 0, vy: 0, ...poses[pose] });
    return rig;
  } finally {
    Math.random = original;
  }
}
function draw({ dressing = null, rig = makeRig() } = {}) {
  const canvas = new RasterCanvas();
  canvas.width = baseline.width;
  canvas.height = baseline.height;
  drawActorWithDressing(canvas.g, 110, 170, rig, view, dressing);
  return { canvas, rig };
}
const rgba = (canvas) => Buffer.from(canvas.pixels.map((v) => Math.round(v * 255)));
const hash = (canvas) => createHash('sha256').update(rgba(canvas)).digest('hex');
const ink = [
  RIGHT_WRIST_BANDAGE_ART.color,
  E.shade(RIGHT_WRIST_BANDAGE_ART.color, -0.27),
  E.shade(RIGHT_WRIST_BANDAGE_ART.color, 0.18),
].map((color) => E.hex(color).map((v) => v / 255));
function bandagePixels(canvas) {
  const found = [];
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++) {
      const at = (y * canvas.width + x) * 4;
      if (
        canvas.pixels[at + 3] &&
        ink.some((rgb) => rgb.every((v, c) => Math.abs(v - canvas.pixels[at + c]) < 1e-8))
      )
        found.push([x, y]);
    }
  return found;
}

test('absent dressing keeps twenty native published appearance/pose/direction pixel baselines', () => {
  for (const row of baseline.rows) {
    const { canvas } = draw({ rig: makeRig(row) });
    assert.equal(hash(canvas), row.sha256, `${row.pose}/${row.angle}`);
  }
});
test('native attachment hook exposes immutable actual projected joints and preserves near/far part order', () => {
  for (const style of ['hd', 'classic']) {
    let seen = null;
    const rig = makeRig({
      style,
      extra: {
        drawAttachments(g, art) {
          seen = art;
          assert(Object.isFrozen(art));
          assert(Object.isFrozen(art.joints));
          assert(Object.isFrozen(art.joints.handR));
          assert.equal(art.scale, view.scale * rig.o.size);
          assert.equal(art.limbWidth, rig.o.limbW);
          art.enqueue(-1000, (ctx) => E.px.rect(ctx, 108, 129, 5, 5, '#ff00ff'));
          art.enqueue(1000, (ctx) => E.px.rect(ctx, 20, 20, 3, 3, '#00ff00'));
        },
      },
    });
    const { canvas } = draw({ rig });
    assert(seen);
    const green = (20 * canvas.width + 20) * 4;
    assert.deepEqual([...canvas.pixels.slice(green, green + 4)], [0, 1, 0, 1]);
    const mid = (131 * canvas.width + 110) * 4;
    assert.notDeepEqual(
      [...canvas.pixels.slice(mid, mid + 3)],
      [1, 0, 1],
      'the nearer native torso must cover a far attachment',
    );
  }
});
test('right wrist cuff uses actual native right elbow/hand projection in each animated pose', () => {
  for (const pose of Object.keys(poses)) {
    const rig = makeRig({ pose }),
      queued = [];
    let art = null;
    rig.o.drawAttachments = (g, value) => {
      art = value;
      enqueueRightWristBandage(
        {
          ...value,
          enqueue: (...args) => {
            queued.push(args[0]);
            value.enqueue(...args);
          },
        },
        RIGHT_WRIST_BANDAGE_ART,
      );
    };
    const { canvas } = draw({ rig }),
      pixels = bandagePixels(canvas);
    assert.equal(queued.length, 1);
    assert.equal(queued[0], (art.joints.elbowR[2] + art.joints.handR[2]) / 2 + 0.003);
    assert(pixels.length > 0, `${pose} has actual native cuff pixels`);
    const hand = art.joints.handR;
    for (const [x, y] of pixels)
      assert(Math.hypot(x - hand[0], y - hand[1]) < 15, `${pose} ink stays at actual right wrist`);
  }
});
test('near torso occludes the right wrist cuff when the real guard pose puts it behind the body', () => {
  const counts = [];
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const { canvas } = draw({
      dressing: RIGHT_WRIST_BANDAGE_ART,
      rig: makeRig({ angle, pose: 'guard' }),
    });
    counts.push(bandagePixels(canvas).length);
  }
  assert(Math.max(...counts) > 0);
  assert(Math.min(...counts) < Math.max(...counts), 'native occlusion changes visible cuff area');
});
test('invalid ownership, hidden dressing, other hand and altered descriptor preserve undressed pixels', () => {
  const plain = hash(draw().canvas);
  for (const fixture of [
    null,
    parentView({ actorId: 'someone-else' }),
    parentView({ hand: 'left' }),
    parentView({ bandageVisible: false }),
    parentView({ bandage: { ...RIGHT_WRIST_BANDAGE_ART, color: '#ffffff' } }),
    parentView({ bandage: { ...RIGHT_WRIST_BANDAGE_ART, width: 1000 } }),
  ]) {
    const { canvas } = draw({ dressing: actorDressing(fixture, DAX) });
    assert.equal(hash(canvas), plain);
  }
  let reads = 0;
  const accessor = parentView();
  Object.defineProperty(accessor, 'bandageVisible', {
    get() {
      reads++;
      return true;
    },
  });
  assert.equal(actorDressing(accessor, DAX), null);
  assert.equal(reads, 0);
});
test('expiry does not remove saved dressing and per-draw callback cannot leak into the cached rig', () => {
  const active = actorDressing(parentView(), DAX),
    expired = actorDressing(parentView({ active: false, remainingHours: 0 }), DAX),
    rig = makeRig();
  const dressed = draw({ rig, dressing: active });
  assert.equal(Object.hasOwn(rig.o, 'drawAttachments'), false);
  const same = draw({ rig: makeRig(), dressing: expired });
  assert.equal(hash(dressed.canvas), hash(same.canvas));
  assert(bandagePixels(same.canvas).length > 0);
  assert.equal(hash(draw({ rig }).canvas), hash(draw().canvas));
});
test('invalid native queue entries fail clearly and temporary dressing callback is restored after failure', () => {
  for (const depth of [NaN, Infinity]) {
    const rig = makeRig({
      extra: {
        drawAttachments(g, art) {
          art.enqueue(depth, () => {});
        },
      },
    });
    assert.throws(() => draw({ rig }), /Invalid humanoid attachment/);
  }
  const prior = () => {
      throw Error('declared attachment draw failure');
    },
    rig = makeRig({ extra: { drawAttachments: prior } });
  assert.throws(() => draw({ rig, dressing: RIGHT_WRIST_BANDAGE_ART }), /declared attachment/);
  assert.equal(rig.o.drawAttachments, prior);
});

export { makeRig, draw, rgba, bandagePixels, parentView, copy };
