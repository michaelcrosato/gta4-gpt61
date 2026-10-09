/** Original appearance/native body-part art fixtures. No mission or actor-state progress. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import '../my-3d2dge.js';
import { RasterCanvas } from './helpers/raster-canvas.mjs';
import { TWO_SEATS_APPEARANCES } from '../src/campaign/two-seats-scenes.js';
import { twoSeatsAppearance, enqueueTwoSeatsMarks } from '../src/campaign/two-seats-art.js';
import { drawActorWithDressing, RIGHT_WRIST_BANDAGE_ART } from '../src/actor-dressings.js';
const E = globalThis.My3D2dge,
  view = new E.View('city', 'City', 35, 48, 5, 1),
  front = Math.atan2(view.fy, view.fx),
  ids = { tess: 'LL-CHAR-025', dax: 'LL-ARC-DAX', pel: 'LL-ARC-PEL', bea: 'LL-ARC-BEA' },
  poses = {
    idle: {},
    crouch: { pose: 'crouch' },
    down: { pose: 'down' },
    guard: { stance: 'guard' },
    attack: { attack: { spec: E.MOVES.jab, phase: 'active', u: 0.5 } },
  };
function draw(key, { marks = true, angle = front, pose = 'idle', dressing = null } = {}) {
  const appearance = TWO_SEATS_APPEARANCES[key],
    random = Math.random;
  let rig;
  Math.random = () => 0.5;
  try {
    rig = new E.Humanoid({ ...appearance, colors: { ...appearance.colors }, weapon: null });
    for (let n = 0; n < 30; n++)
      rig.update(1 / 60, { x: 0, y: 0, z: 0, facing: angle, vx: 0, vy: 0, ...poses[pose] });
  } finally {
    Math.random = random;
  }
  const canvas = new RasterCanvas();
  canvas.width = 260;
  canvas.height = 260;
  const before = JSON.stringify(appearance);
  drawActorWithDressing(
    canvas.g,
    130,
    220,
    rig,
    view,
    dressing,
    marks ? (g, art) => enqueueTwoSeatsMarks(art, appearance) : null,
  );
  assert.equal(JSON.stringify(appearance), before);
  assert.equal(Object.hasOwn(rig.o, 'drawAttachments'), false);
  return canvas;
}
const rgba = (canvas) => Buffer.from(canvas.pixels.map((v) => Math.round(v * 255))),
  hash = (canvas) => createHash('sha256').update(rgba(canvas)).digest('hex');
function count(canvas, color) {
  const rgb = E.hex(color).map((v) => v / 255);
  let n = 0;
  for (let i = 0; i < canvas.pixels.length; i += 4)
    if (canvas.pixels[i + 3] && rgb.every((v, c) => Math.abs(v - canvas.pixels[i + c]) < 1e-8)) n++;
  return n;
}
test('only exact canonical new-actor appearance identities/versions register original clothing', () => {
  for (const [key, id] of Object.entries(ids)) {
    const appearance = TWO_SEATS_APPEARANCES[key];
    assert.equal(twoSeatsAppearance({ id, appearance: { ...appearance } }), appearance);
    assert.equal(twoSeatsAppearance({ id: 'LL-CHAR-002', appearance }), null);
    assert.equal(twoSeatsAppearance({ id, appearance: { ...appearance, version: 999 } }), null);
    assert.equal(twoSeatsAppearance({ id, appearance: { ...appearance, id: 'unknown' } }), null);
  }
});
test('native source palettes and each defining mark produce distinct actual actor pixels', () => {
  const hashes = [];
  for (const key of Object.keys(ids)) {
    const appearance = TWO_SEATS_APPEARANCES[key],
      bare = draw(key, { marks: false }),
      marked = draw(key);
    assert.notEqual(hash(marked), hash(bare), key);
    for (const mark of appearance.marks)
      if (mark.color) assert(count(marked, mark.color) > count(bare, mark.color), mark.id);
    if (key === 'bea') assert(count(marked, '#d7d0ac') > 0, 'native saved BEA name card');
    hashes.push(hash(marked));
  }
  assert.equal(new Set(hashes).size, 4);
});
test('front-only strap, collar and apron/card never print through the native back-facing torso', () => {
  for (const key of ['tess', 'dax', 'bea'])
    assert.equal(
      hash(draw(key, { angle: front + Math.PI })),
      hash(draw(key, { angle: front + Math.PI, marks: false })),
      key,
    );
  assert.notEqual(
    hash(draw('pel', { angle: front + Math.PI })),
    hash(draw('pel', { angle: front + Math.PI, marks: false })),
    'canvas cuffs wrap the native wrists',
  );
});
test('all four original marks follow native crouch, fall, guard and attack geometry', () => {
  for (const key of Object.keys(ids))
    for (const pose of Object.keys(poses))
      assert.notEqual(
        hash(draw(key, { pose })),
        hash(draw(key, { pose, marks: false })),
        `${key}/${pose}`,
      );
});
test('Dax original collar and persistent right wrist dressing coexist in the native part queue', () => {
  const plain = draw('dax'),
    dressed = draw('dax', { dressing: RIGHT_WRIST_BANDAGE_ART });
  assert(
    count(dressed, RIGHT_WRIST_BANDAGE_ART.color) > count(plain, RIGHT_WRIST_BANDAGE_ART.color),
  );
  assert(count(dressed, TWO_SEATS_APPEARANCES.dax.marks[0].color) > 0);
});
test('a sufficiently magnified native name card renders the actual BEA glyphs inside its projected card', () => {
  const original = E.font.text,
    labels = [];
  E.font.text = (g, text, ...args) => {
    labels.push(text);
    return original.call(E.font, g, text, ...args);
  };
  view.set(35, 48, 8, 1);
  try {
    const canvas = draw('bea');
    assert(labels.includes('BEA'));
    assert(count(canvas, '#354a47') > 0, 'actual native letter ink exists');
  } finally {
    view.set(35, 48, 5, 1);
    E.font.text = original;
  }
});
test('unknown mutable art descriptors and incomplete projected geometry cannot enqueue marks', () => {
  let calls = 0;
  assert.equal(
    enqueueTwoSeatsMarks(
      {
        enqueue() {
          calls++;
        },
      },
      { ...TWO_SEATS_APPEARANCES.tess },
    ),
    false,
  );
  assert.equal(
    enqueueTwoSeatsMarks(
      {
        scale: 1,
        limbWidth: 2,
        joints: {},
        enqueue() {
          calls++;
        },
      },
      TWO_SEATS_APPEARANCES.tess,
    ),
    false,
  );
  assert.equal(calls, 0);
});
export { draw, rgba };
