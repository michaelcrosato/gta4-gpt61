import test from 'node:test';
import assert from 'node:assert/strict';
import '../my-3d2dge.js';
import { RasterCanvas } from './helpers/raster-canvas.mjs';
import { createRoomMap, createRoomMapProjection, exteriorMapPosition } from '../src/room-map.js';
import {
  INTERIOR_LAYOUTS,
  PORTAL_DEFINITIONS,
  enterInterior,
  interiorActors,
  setInteriorDoor,
  damageInteriorProp,
} from '../src/interiors.js';
const E = globalThis.My3D2dge;
const world = {
  width: 2000,
  height: 2000,
  buildings: [],
  obstacles: [],
  roads: [],
  water: [],
  locations: [
    { id: 'felix-office', x: 458, y: 700 },
    { id: 'saira-shop', x: 780, y: 718 },
    { id: 'lantern-darts', x: 723, y: 918 },
    { id: 'blue-hour-lanes', x: 411, y: 654 },
  ],
};
function exterior() {
  return {
    time: 2,
    player: { x: 458, y: 700, z: 0, groundZ: 0, angle: 0, health: 100, vehicleId: null },
    vehicles: [],
    pedestrians: [],
    police: [],
    hostiles: [],
    wanted: { level: 0, observed: false },
    scene: { kind: 'exterior', id: 'harbor-city' },
  };
}
function state(roomId = 'voss-dispatch') {
  const s = exterior(),
    portal = PORTAL_DEFINITIONS.find((portal) => portal.roomId === roomId),
    point = world.locations.find((point) => point.id === portal.locationId);
  Object.assign(s.player, { x: point.x, y: point.y });
  enterInterior(s, portal.id, { world });
  return s;
}
function canvas(width = 228, height = 156) {
  const cv = new RasterCanvas();
  cv.width = width;
  cv.height = height;
  const g = cv.getContext('2d');
  g.polygons = [];
  g.path = [];
  g.beginPath = function () {
    this.path = [];
  };
  g.moveTo = g.lineTo = function (x, y) {
    this.path.push([x, y]);
  };
  g.closePath = function () {};
  g.fill = function () {
    this.polygons.push({ points: structuredClone(this.path), color: this.fillStyle });
    E.px.poly(this, this.path, this.fillStyle);
  };
  g.stroke = function () {
    for (let i = 0; i < this.path.length; i++)
      E.px.line(this, ...this.path[i], ...this.path[(i + 1) % this.path.length], this.strokeStyle);
  };
  return cv;
}
function factory(options = {}) {
  return createRoomMap({ createCanvas: () => canvas(), ...options });
}
function imageFingerprint(cv) {
  let sum = 2166136261;
  for (const value of cv.pixels) sum = Math.imul(sum ^ Math.round(value * 255), 16777619);
  return sum >>> 0;
}

test('room projection fits all actual bounds, retains padding and round-trips local points', () => {
  for (const room of Object.values(INTERIOR_LAYOUTS))
    for (const [width, height] of [
      [228, 156],
      [100, 180],
      [600, 400],
    ]) {
      const p = createRoomMapProjection(room, width, height),
        a = p.project(0, 0),
        b = p.project(room.width, room.height);
      assert.ok(a[0] >= 8 - 1e-8 && a[1] >= 8 - 1e-8);
      assert.ok(b[0] <= width - 8 + 1e-8 && b[1] <= height - 8 + 1e-8);
      const middle = p.unproject(...p.project(room.width * 0.31, room.height * 0.67));
      assert.ok(Math.abs(middle.x - room.width * 0.31) < 1e-8);
      assert.ok(Math.abs(middle.y - room.height * 0.67) < 1e-8);
    }
  assert.throws(() => createRoomMapProjection(INTERIOR_LAYOUTS['voss-dispatch'], 12, 12), /bounds/);
});

test('city map position retains the actual exterior anchor while local player coordinates move independently', () => {
  const outside = exterior();
  assert.equal(exteriorMapPosition(outside), outside.player);
  const inside = state(),
    anchor = exteriorMapPosition(inside);
  assert.equal(anchor, inside.interior.active.exterior);
  inside.player.x = 250;
  inside.player.y = 160;
  inside.player.angle = -1;
  assert.equal(exteriorMapPosition(inside).x, 458);
  assert.equal(exteriorMapPosition(inside).y, 700);
  assert.equal(exteriorMapPosition(inside).angle, 0);
});

test('each room has a differentiated map with actual floor zones, walls, live props and service positions', () => {
  const map = factory(),
    fingerprints = [];
  for (const roomId of Object.keys(INTERIOR_LAYOUTS)) {
    const cv = canvas();
    map.draw(cv.g, state(roomId));
    fingerprints.push(imageFingerprint(cv));
  }
  assert.equal(new Set(fingerprints).size, 4);
  assert.equal(map.stats().cachedRooms, 2);
  map.dispose();
});

test('player and occupants update live without rebuilding the room background', () => {
  const s = state(),
    map = factory(),
    first = canvas();
  map.draw(first.g, s);
  s.player.x = 180;
  s.player.y = 140;
  interiorActors(s)[0].health = 0;
  const second = canvas();
  map.draw(second.g, s);
  assert.equal(map.stats().renders, 1);
  assert.equal(first.g.images[0].source, second.g.images[0].source);
  assert.notEqual(imageFingerprint(first), imageFingerprint(second));
  assert.equal(second.g.polygons.at(-1).color, '#eaf0d0');
  map.dispose();
});

test('opening/locking a door and destroying or damaging furniture refreshes the physical map in place', () => {
  const s = state(),
    map = factory(),
    first = canvas();
  map.draw(first.g, s);
  const source = first.g.images[0].source,
    before = imageFingerprint(source);
  setInteriorDoor(s, 'records-door', { open: true });
  map.draw(canvas().g, s);
  assert.equal(map.stats().renders, 2);
  assert.equal(map.stats().refreshes, 1);
  assert.notEqual(imageFingerprint(source), before);
  setInteriorDoor(s, 'records-door', { open: false, locked: true });
  map.draw(canvas().g, s);
  assert.equal(map.stats().refreshes, 2);
  damageInteriorProp(s, 'dispatch-desk', 40);
  map.draw(canvas().g, s);
  assert.equal(map.stats().refreshes, 3);
  damageInteriorProp(s, 'dispatch-desk', 100);
  const changed = canvas();
  map.draw(changed.g, s);
  assert.equal(map.stats().refreshes, 4);
  assert.equal(changed.g.images[0].source, source);
  const p = createRoomMapProjection(
      INTERIOR_LAYOUTS['voss-dispatch'],
      source.width,
      source.height,
    ).project(150, 72),
    index = (Math.round(p[1]) * source.width + Math.round(p[0])) * 4;
  assert.notEqual(source.pixels[index], E.hex('#7f8c65')[0] / 255);
  map.dispose();
});

test('map body markers exclude exterior vehicles even when they overlap room coordinates', () => {
  const s = state('saira-garage'),
    map = factory();
  s.vehicles = [
    { id: 'exterior', x: 96, y: 232, angle: 0, sceneId: null },
    { id: 'local', x: 112, y: 160, angle: 1, scene: { kind: 'interior', id: 'saira-garage' } },
    { id: 'other-room', x: 140, y: 180, angle: 0, sceneId: 'lantern-bar' },
  ];
  const cv = canvas();
  map.draw(cv.g, s);
  assert.equal(cv.g.polygons.length, 2, 'one local vehicle plus the player');
  map.dispose();
});

test('room map cache bounds release evicted canvases and old viewport sizes', () => {
  const map = factory({ maxRooms: 2, maxPixels: 228 * 156 * 2 }),
    first = canvas();
  map.draw(first.g, state());
  const office = first.g.images[0].source;
  const bar = canvas();
  map.draw(bar.g, state('lantern-bar'));
  const pub = bar.g.images[0].source;
  map.draw(canvas().g, state());
  map.draw(canvas().g, state('saira-garage'));
  assert.equal(pub.width, 0);
  assert.ok(office.width > 0);
  assert.ok(map.stats().pixels <= 228 * 156 * 2);
  const larger = canvas(240, 160);
  map.draw(larger.g, state());
  assert.equal(office.width, 0);
  assert.equal(office.height, 0);
  map.dispose();
  assert.equal(map.stats().pixels, 0);
  assert.equal(map.stats().cachedRooms, 0);
  assert.throws(() => map.draw(canvas().g, state()), /disposed/);
});

test('oversized or unavailable backing stores paint a usable live plan and exterior draws remain untouched', () => {
  const bounded = factory({ maxPixels: 100 }),
    cv = canvas();
  assert.equal(bounded.draw(cv.g, state()), true);
  assert.equal(cv.g.images.length, 0);
  assert.ok(cv.g.fills > 30);
  assert.equal(bounded.stats().pixels, 0);
  bounded.dispose();
  const missing = createRoomMap({ createCanvas: () => null }),
    live = canvas();
  assert.equal(missing.draw(live.g, state()), true);
  assert.ok(live.g.fills > 30);
  missing.dispose();
  const map = factory(),
    outside = canvas();
  assert.equal(map.draw(outside.g, exterior()), false);
  assert.equal(outside.g.fills, 0);
  map.dispose();
  assert.throws(() => createRoomMap({ maxRooms: 0 }), /limits/);
});
