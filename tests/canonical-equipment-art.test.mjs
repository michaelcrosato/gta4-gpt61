/** Render-only actor pass plus an actual shared combat guard/disarm component.
 * Initial sparse native duel setup is explicit; ground pickup queue is separate.
 * No M3 director/injury/retreat/source-completion claim is made here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import '../my-3d2dge.js';
import { createWorldRenderer } from '../src/renderer.js';
import { RasterCanvas } from './helpers/raster-canvas.mjs';
import {
  createSimulation,
  updateSimulation,
  scenePeople,
  WORLD,
  VEHICLE_SPECS,
} from '../src/simulation.js';
import { ensureNamedActor } from '../src/companions.js';
import { startActorMelee } from '../src/combat.js';
import { createSceneContext } from '../src/scene-context.js';
import { TWO_SEATS_APPEARANCES } from '../src/campaign/two-seats-scenes.js';
const E = globalThis.My3D2dge,
  DAX = 'LL-ARC-DAX',
  world = {
    width: 1200,
    height: 1200,
    buildings: [],
    roads: [],
    locations: [],
    districts: [],
    water: [],
    obstacles: [],
  },
  game = { time: 0, real: 0 };
function fixture() {
  const state = createSimulation(2026);
  Object.assign(state, {
    mission: null,
    dialogue: null,
    vehicles: [],
    pedestrians: [],
    hostiles: [],
    police: [],
    bullets: [],
  });
  Object.assign(state.player, { x: 780, y: 700, z: 0, groundZ: 0, angle: 0, vehicleId: null });
  const actor = ensureNamedActor(state, {
    id: DAX,
    name: 'Dax',
    x: 798,
    y: 700,
    z: 0,
    sceneId: null,
    health: 100,
    weapon: 'knife',
    angle: Math.PI,
    appearance: TWO_SEATS_APPEARANCES.dax,
  });
  return { state, actor };
}
function actorPass(draw, state, actor) {
  const canvas = new RasterCanvas();
  canvas.width = 300;
  canvas.height = 260;
  const view = new E.View('city', 'City', 35, 48, 5, 1),
    anchor = view.p(actor.x, actor.y, 0),
    actors = [],
    queued = [];
  const r = {
    ctx: canvas.g,
    view,
    ix: anchor[0] - 150,
    iy: anchor[1] - 220,
    bw: 300,
    bh: 260,
    W: 300,
    H: 260,
    w(x, y, z = 0) {
      const p = view.p(x, y, z);
      return [p[0] - this.ix, p[1] - this.iy];
    },
    visible: () => true,
    actor(x, y, z, fn) {
      actors.push({ x, y, z, fn });
    },
    queue(x, y, z, fn) {
      queued.push({ x, y, z, fn });
    },
    sky() {},
    shadow() {},
    overlay() {},
    groundDisc() {},
    groundRing() {},
    glowDisc() {},
  };
  const before = JSON.stringify(state);
  draw.draw(r, state, { rain: false });
  const body = actors.find((a) => a.x === actor.x && a.y === actor.y);
  assert(body, 'one canonical actual actor draw exists');
  body.fn(canvas.g, ...r.w(body.x, body.y, body.z).map(Math.round));
  assert.equal(JSON.stringify(state), before);
  return { canvas, queued, actors };
}
function knifePixels(canvas) {
  const colors = ['#c8c7b7', '#f2edde'].map((c) => E.hex(c).map((v) => v / 255));
  let n = 0;
  for (let i = 0; i < canvas.pixels.length; i += 4)
    if (
      canvas.pixels[i + 3] &&
      colors.some((c) => c.every((v, k) => Math.abs(v - canvas.pixels[i + k]) < 1e-8))
    )
      n++;
  return n;
}
test('actual guarded canonical knife is held in native pixels then real disarm removes it while preserving physical drop', () => {
  const { state, actor } = fixture(),
    draw = createWorldRenderer(game, world, VEHICLE_SPECS);
  try {
    assert(
      knifePixels(actorPass(draw, state, actor).canvas) > 0,
      'actual body weapon must be readable',
    );
    const scenes = createSceneContext(WORLD),
      ctx = {
        sceneId: null,
        combatants: () => scenePeople(state, null),
        hasLineOfSight: (a, b) => scenes.sight(state, a, b, null),
        id: (p) => `${p}-${++state.sequence}`,
        notify() {},
      };
    assert.equal(startActorMelee(state, actor, 'knife', ctx), true);
    for (let n = 0; n < 90 && !state.player.counterWindow; n++)
      updateSimulation(state, 1 / 60, { block: true });
    assert(state.player.counterWindow, 'real guarded strike supplies the counter proof');
    updateSimulation(state, 1 / 60, { block: true, disarm: true });
    assert.equal(actor.weapon, 'unarmed');
    assert.equal(
      knifePixels(actorPass(draw, state, actor).canvas),
      0,
      'unarmed native body cannot retain stale blade pixels',
    );
    const pickup = state.pickups.find((p) => p.id === actor.disarmReceipt.dropId);
    assert.equal(pickup.weapon, 'knife');
    assert.equal(pickup.available, true);
    assert.equal(state.pickups.filter((p) => p.id === pickup.id).length, 1);
    assert.equal(actor.health, 100, 'this shared disarm test does not fabricate authored injury');
  } finally {
    draw.dispose();
  }
});
test('ordinary pedestrians and unarmed or invalid canonical records retain no invented held blade', () => {
  for (const variant of ['ordinary', 'unarmed', 'unknown', 'wrong-owner', 'unregistered-tag']) {
    const { state, actor } = fixture();
    if (variant === 'ordinary') {
      state.companions.actors = [];
      state.companions.records = [];
      actor.kind = 'pedestrian';
      delete actor.companionId;
      state.pedestrians = [actor];
    }
    if (variant === 'unarmed') actor.weapon = 'unarmed';
    if (variant === 'unknown') actor.weapon = 'utility-blade';
    if (variant === 'wrong-owner') actor.companionId = 'other';
    if (variant === 'unregistered-tag') {
      state.companions.actors = [];
      state.companions.records = [];
      state.pedestrians = [actor];
    }
    const draw = createWorldRenderer(game, world, VEHICLE_SPECS);
    try {
      assert.equal(knifePixels(actorPass(draw, state, actor).canvas), 0, variant);
    } finally {
      draw.dispose();
    }
  }
});
test('legacy interact placeholder also supplies its actual complete state to read-only dressing callback', () => {
  const { state, actor } = fixture(),
    seen = [];
  state.mission = {
    id: 'declared-legacy-contact',
    stage: 0,
    stageType: 'interact',
    target: { x: 790, y: 680, z: 0 },
  };
  const draw = createWorldRenderer(game, world, VEHICLE_SPECS, {
    getActorDressing(actual, id) {
      assert.equal(actual, state);
      seen.push(id);
      return null;
    },
  });
  try {
    actorPass(draw, state, actor);
    assert(seen.includes('contact:declared-legacy-contact:0'));
  } finally {
    draw.dispose();
  }
});
