/** Art registration/completion contract fixtures at sourced wall/portal poses.
 * These are not physical approach, mission completion or clearance evidence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import '../my-3d2dge.js';
import { RasterCanvas } from './helpers/raster-canvas.mjs';
import { createTwoSeatsFrontageArt } from '../src/campaign/two-seats-frontages.js';
const E = globalThis.My3D2dge,
  copy = (v) => JSON.parse(JSON.stringify(v));
function fixture() {
  const buildings = [
      {
        id: 'block-0-1-1',
        x: 639,
        y: 244,
        w: 77,
        h: 132,
        height: 53.2,
        siteIds: ['LL-CITY-LOC174'],
      },
      {
        id: 'block-0-0-0',
        x: 244,
        y: 244,
        w: 77,
        h: 132,
        height: 53.2,
        siteIds: ['LL-CITY-LOC034', 'LL-CITY-LOC059'],
      },
    ],
    entries = { 'tess-flat': { x: 729, y: 308, z: 0 }, 'pier-goods': { x: 231, y: 308, z: 0 } },
    ids = { 'tess-flat': 'LL-CITY-LOC174', 'pier-goods': 'LL-CITY-LOC034' },
    bindings = Object.fromEntries(
      Object.keys(entries).map((key, i) => [
        key,
        {
          siteId: ids[key],
          buildingId: buildings[i].id,
          entry: entries[key],
          roomId: key,
          portal: { id: key + '-entry' },
        },
      ]),
    ),
    world = {
      buildings,
      locations: Object.keys(entries).map((key, i) => ({
        id: key,
        ...entries[key],
        radius: 22,
        siteId: ids[key],
        buildingId: buildings[i].id,
      })),
      campaignSceneBindings: bindings,
      campaignSceneReports: { 'LL-ST-003': { registrationReady: true } },
    },
    state = {
      player: { ...entries['pier-goods'] },
      campaign: { completed: { 'LL-ST-002': { declaredContract: true } } },
    };
  return { world, state };
}
function canvas(entry, yaw = 35) {
  const cv = new RasterCanvas();
  cv.width = 600;
  cv.height = 300;
  const view = new E.View('city', 'City', yaw, 48, 1.1, 1),
    origin = view.p(entry.x, entry.y, 0),
    points = [];
  const r = {
    view,
    w(x, y, z = 0) {
      points.push({ x, y, z });
      const p = view.p(x, y, z);
      return [p[0] - origin[0] + 300, p[1] - origin[1] + 220];
    },
  };
  return { cv, r, points };
}
const hash = (cv) =>
  createHash('sha256')
    .update(Buffer.from(cv.pixels.map((v) => Math.round(v * 255))))
    .digest('hex');
test('new door art requires both registered actual aliases and declared prior M2 completion', () => {
  for (const variant of [
    'no-completion',
    'no-registration',
    'missing-alias',
    'moved-alias',
    'wrong-site',
  ]) {
    const { world, state } = fixture();
    if (variant === 'no-completion') state.campaign.completed = {};
    if (variant === 'no-registration')
      world.campaignSceneReports['LL-ST-003'].registrationReady = false;
    if (variant === 'missing-alias') world.locations.pop();
    if (variant === 'moved-alias') world.locations[0].x++;
    if (variant === 'wrong-site') world.locations[0].siteId = 'LL-CITY-LOC059';
    const art = createTwoSeatsFrontageArt(world),
      { cv, r } = canvas(state.player),
      before = hash(cv);
    assert.equal(art.enabled(state), false, variant);
    assert.equal(art.draw(r, cv.g, world.buildings[1], state, { cutaway: true }), false, variant);
    assert.equal(hash(cv), before);
    assert.equal(art.locationGlyph(world.locations[0], state), null);
  }
});
test('Tess east-facing wall uses the actual sourced wall716 and approach anchor729 without state/world changes', () => {
  const { world, state } = fixture(),
    entry = world.campaignSceneBindings['tess-flat'].entry;
  state.player = { ...entry };
  const art = createTwoSeatsFrontageArt(world),
    { cv, r, points } = canvas(entry),
    before = JSON.stringify({ world, state });
  assert.equal(art.draw(r, cv.g, world.buildings[0], state), true);
  assert(points.every((p) => Math.abs(p.x - 716.15) < 1e-8));
  assert(cv.pixels.some((v) => v > 0));
  assert.equal(art.locationGlyph(world.locations[0], state), 'H');
  assert.equal(JSON.stringify({ world, state }), before);
});
test('Pier Goods west door only appears from the back during the existing close-player cutaway', () => {
  const { world, state } = fixture(),
    art = createTwoSeatsFrontageArt(world),
    { cv, r, points } = canvas(state.player);
  assert.equal(art.draw(r, cv.g, world.buildings[1], state), false);
  assert.equal(art.draw(r, cv.g, world.buildings[1], state, { cutaway: true }), true);
  assert(points.every((p) => Math.abs(p.x - 243.85) < 1e-8));
  assert(
    points.every((p) => p.y >= 274 && p.y <= 342),
    'west graphics cannot move into Annex SOUTH window376.75',
  );
  assert.equal(art.locationGlyph(world.locations[1], state), 'C');
  state.player.x -= 100;
  assert.equal(art.draw(r, cv.g, world.buildings[1], state, { cutaway: true }), false);
  const reverse = canvas(state.player, 215);
  assert.equal(
    art.draw(reverse.r, reverse.cv.g, world.buildings[1], state),
    true,
    'west-facing camera sees real exterior wall',
  );
});
test('saved open/closed/locked doorway state changes native door pixels without changing the saved record', () => {
  const { world, state } = fixture(),
    art = createTwoSeatsFrontageArt(world),
    hashes = [];
  for (const door of [
    { open: true, locked: false },
    { open: false, locked: false },
    { open: false, locked: true },
  ]) {
    const current = copy(state);
    current.interior = { rooms: { 'pier-goods': { doors: { 'front-door': door } } } };
    const before = JSON.stringify(current),
      { r, cv } = canvas(current.player);
    assert.equal(art.draw(r, cv.g, world.buildings[1], current, { cutaway: true }), true);
    hashes.push(hash(cv));
    assert.equal(JSON.stringify(current), before);
  }
  assert.equal(new Set(hashes).size, 3);
});
test('near Annex south window does not reveal the unrelated back-facing Pier Goods doorway', () => {
  const { world, state } = fixture();
  state.player = { x: 258, y: 376.75, z: 0 };
  const art = createTwoSeatsFrontageArt(world),
    { r, cv } = canvas(state.player);
  assert.equal(art.draw(r, cv.g, world.buildings[1], state, { cutaway: true }), false);
});
