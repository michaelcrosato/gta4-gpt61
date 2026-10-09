import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import '../my-3d2dge.js';
import { RasterCanvas } from './helpers/raster-canvas.mjs';
import { createTerrain } from '../src/terrain.js';
import { ensureNamedActor, getActor } from '../src/companions.js';
import { initializeWardrobe, OUTFITS, outfitAppearance, purchaseOutfit } from '../src/wardrobe.js';
import {
  createClothingService,
  PIER_GOODS_STOCK,
  starterOutfitVoucherId,
  validateClothingServices,
} from '../src/clothing-service.js';
const copy = structuredClone;
// Declared physical shop/director-proof fixtures; real wallet/inventory/native art,
// not a registered production room or a full M3/source completion claim.
function fixture({ walls = [] } = {}) {
  const room = 'pier-goods',
    scope = {
      missionId: 'LL-ST-003',
      stageId: 'workwear',
      attempt: 1,
      activationReceipt: 'campaign:38b480d9:LL-ST-003:attempt:1:activate:workwear:1',
    };
  const s = {
    time: 10,
    player: { x: 90, y: 100, z: 0, sceneId: room, health: 100, money: 200, vehicleId: null },
    wanted: { level: 0 },
    vehicles: [],
    interior: { rooms: {} },
    campaign: {
      contentFingerprint: '38b480d9',
      active: { ...scope, phase: 'running' },
      receipts: { [scope.activationReceipt]: { kind: 'stage-activation', ...scope } },
    },
  };
  initializeWardrobe(s);
  ensureNamedActor(s, {
    id: 'LL-ARC-BEA',
    name: 'Bea',
    x: 120,
    y: 100,
    z: 0,
    sceneId: room,
    health: 100,
  });
  const geometry = createTerrain({
    width: 260,
    height: 220,
    bounds: { left: 0, top: 0, right: 260, bottom: 220 },
    buildings: walls,
    roads: [],
    water: [],
    obstacles: [],
  });
  const proof = {
    dropoffs: [
      { actorId: 'LL-CHAR-025', receiptId: 'dropoff:tess' },
      { actorId: 'LL-CHAR-008', receiptId: 'dropoff:nadia' },
    ],
    contactReceiptId: 'phone:tess:actual-contact',
  };
  const engine = {
    hasRoom: (id) => id === room,
    verifyGrant: () => ({ ok: true, proof: copy(proof) }),
    storeObservation: () => ({
      storeId: room,
      sceneId: room,
      clerkId: 'LL-ARC-BEA',
      open: true,
      stock: [...PIER_GOODS_STOCK],
      hook: { id: 'pier-starter-stock', x: 100, y: 100, z: 0, radius: 30 },
    }),
    hasLineOfSight: (_s, a, b) => geometry.hasLineOfSight(a, b),
  };
  const api = createClothingService(s, engine),
    grant = {
      id: starterOutfitVoucherId(s),
      scope,
      payment: 'cooperative-voucher',
      storeId: room,
      outfitIds: [...PIER_GOODS_STOCK],
      count: 1,
    };
  const buy = (outfitId, id = 'choice:outfit:1', voucherId = grant.id) => ({
    id,
    scope,
    storeId: room,
    outfitId,
    voucherId,
  });
  return { s, api, scope, grant, buy, engine, proof };
}
test('old wardrobes and constructor state remain byte-identical until a real service commits', () => {
  const f = fixture(),
    before = JSON.stringify(f.s);
  createClothingService(f.s, f.engine);
  assert.equal(JSON.stringify(f.s), before);
  assert.equal(f.s.clothingServices, undefined);
  assert(validateClothingServices(f.s));
});
test('one voucher buys/equips one actual listed outfit without changing cash, and exact replay cannot multiply it', () => {
  const f = fixture(),
    cash = f.s.player.money;
  assert(f.api.grantVoucher(f.s, f.grant).ok);
  assert(f.api.grantVoucher(f.s, f.grant).replayed);
  const r = f.api.purchaseAndEquip(f.s, f.buy('ochre-rain-shell'));
  assert(r.ok);
  assert.equal(r.receipt.payment, 'cooperative-voucher');
  assert.equal(f.s.player.money, cash);
  assert.equal(f.s.wardrobe.equipped, 'ochre-rain-shell');
  assert(f.api.purchaseAndEquip(f.s, f.buy('ochre-rain-shell')).replayed);
  assert.equal(
    f.api.purchaseAndEquip(f.s, f.buy('navy-coveralls', 'choice:2')).reason,
    'starter-voucher-unavailable',
  );
  assert.equal(f.s.wardrobe.owned.filter((id) => id === 'ochre-rain-shell').length, 1);
  assert(f.api.verify(f.s, r.receipt));
  assert(validateClothingServices(f.s));
});
test('wrong stock, duplicate issue, missing ordered proofs and unrelated activation cannot grant currency', () => {
  for (const mutate of [
    (f) => f.grant.outfitIds.reverse(),
    (f) => (f.grant.count = 2),
    (f) => (f.grant.id = 'different-voucher'),
    (f) => (f.engine.verifyGrant = () => true),
    (f) => f.proof.dropoffs.reverse(),
    (f) => (f.s.campaign.receipts[f.scope.activationReceipt].missionId = 'LL-ST-001'),
  ]) {
    const f = fixture();
    mutate(f);
    const before = JSON.stringify(f.s);
    assert.equal(f.api.grantVoucher(f.s, f.grant).ok, false);
    assert.equal(JSON.stringify(f.s), before);
  }
});
test('real reach, scene, road safety, visible live clerk and registered room all gate purchases', () => {
  const changes = [
    (f) => (f.s.player.x = 20),
    (f) => (f.s.player.sceneId = null),
    (f) => (f.s.player.vehicleId = 'taxi'),
    (f) => (f.s.wanted.level = 1),
    (f) => (getActor(f.s, 'LL-ARC-BEA').health = 0),
    (f) => (f.engine.hasRoom = () => false),
    (f) => (f.engine.storeObservation = () => null),
  ];
  for (const change of changes) {
    const f = fixture();
    assert(f.api.grantVoucher(f.s, f.grant).ok);
    change(f);
    const before = JSON.stringify(f.s);
    assert.equal(f.api.purchaseAndEquip(f.s, f.buy('slate-work-jacket')).ok, false);
    assert.equal(JSON.stringify(f.s), before);
  }
  const f = fixture({ walls: [{ id: 'wall', x: 105, y: 80, w: 6, h: 40, height: 40 }] });
  assert(f.api.grantVoucher(f.s, f.grant).ok);
  assert.equal(f.api.purchaseAndEquip(f.s, f.buy('navy-coveralls')).ok, false);
});
test('later cash stock uses the actual displayed price once and cannot reuse the voucher', () => {
  const f = fixture();
  f.api.grantVoucher(f.s, f.grant);
  f.api.purchaseAndEquip(f.s, f.buy('slate-work-jacket'));
  const cash = f.s.player.money,
    r = f.api.purchaseAndEquip(f.s, f.buy('navy-coveralls', 'cash:1', null));
  assert(r.ok);
  assert.equal(cash - f.s.player.money, OUTFITS['navy-coveralls'].price);
  assert(f.api.purchaseAndEquip(f.s, f.buy('navy-coveralls', 'cash:1', null)).replayed);
  assert.equal(cash - f.s.player.money, 75);
  f.s.player.money = 0;
  const before = JSON.stringify(f.s);
  assert.equal(f.api.purchaseAndEquip(f.s, f.buy('ochre-rain-shell', 'cash:2', null)).ok, false);
  assert.equal(JSON.stringify(f.s), before);
});
test('already-owned stock can receive a paid-for replacement with the one voucher, without duplicate ownership', () => {
  const f = fixture();
  for (const id of PIER_GOODS_STOCK) {
    f.s.player.money = 300;
    assert(purchaseOutfit(f.s, id, 'prior:' + id).ok);
  }
  const owned = copy(f.s.wardrobe.owned),
    money = f.s.player.money;
  f.api.grantVoucher(f.s, f.grant);
  const r = f.api.purchaseAndEquip(f.s, f.buy('slate-work-jacket'));
  assert(r.ok);
  assert(r.receipt.replacement);
  assert.equal(r.receipt.inventoryReceiptId, null);
  assert.deepEqual(f.s.wardrobe.owned, owned);
  assert.equal(f.s.player.money, money);
  assert(validateClothingServices(f.s));
});
test('complete physical snapshots retain voucher origin without needing a director inside them', () => {
  const f = fixture();
  f.api.grantVoucher(f.s, f.grant);
  f.api.purchaseAndEquip(f.s, f.buy('navy-coveralls'));
  const saved = copy(f.s);
  delete saved.campaign;
  assert(validateClothingServices(saved));
  assert.equal(starterOutfitVoucherId(saved), f.grant.id);
  assert.equal(saved.wardrobe.equipped, 'navy-coveralls');
});
test('corrupt stock, spend links, namespace, inventory and charged cash are rejected on restore', () => {
  const f = fixture();
  f.api.grantVoucher(f.s, f.grant);
  f.api.purchaseAndEquip(f.s, f.buy('slate-work-jacket'));
  for (const mutate of [
    (s) => (s.clothingServices.grants[f.grant.id].spentBy = null),
    (s) => (s.clothingServices.namespace = 'deadbeef'),
    (s) => s.clothingServices.grants[f.grant.id].outfitIds.push('relief-coat'),
    (s) => s.clothingServices.purchases['choice:outfit:1'].moneyAfter++,
    (s) => delete s.wardrobe.receipts['choice:outfit:1:inventory'],
    (s) => (s.clothingServices.purchases['choice:outfit:1'].outfitId = 'navy-coveralls'),
  ]) {
    const s = copy(f.s);
    mutate(s);
    assert.throws(() => validateClothingServices(s));
  }
});
test('unsafe request objects cannot execute a getter or manufacture a trusted receipt', () => {
  const f = fixture();
  let calls = 0;
  const bad = {
    get id() {
      calls++;
      return f.grant.id;
    },
  };
  assert.throws(() => f.api.grantVoucher(f.s, bad));
  assert.equal(calls, 0);
  assert.equal(f.api.receipt(f.s, 'constructor'), null);
  assert.equal(f.api.verify(f.s, null), false);
});
test('all three exact choices render distinct native silhouettes/palettes after real service equip', () => {
  const hashes = [];
  const E = globalThis.My3D2dge;
  for (const outfitId of PIER_GOODS_STOCK) {
    const f = fixture();
    f.api.grantVoucher(f.s, f.grant);
    assert(f.api.purchaseAndEquip(f.s, f.buy(outfitId)).ok);
    const a = outfitAppearance(f.s),
      rig = new E.Humanoid({
        build: 'heroic',
        size: 0.86,
        weapon: null,
        outfit: a.outfit,
        sleeves: a.sleeves,
        colors: a.colors,
      }),
      cv = new RasterCanvas();
    cv.width = 300;
    cv.height = 300;
    const g = cv.getContext('2d'),
      view = new E.View('city', 'City', 35, 55, 3);
    for (let i = 0; i < 120; i++)
      rig.update(1 / 60, { x: 0, y: 0, z: 0, facing: Math.PI / 3, vx: 0, vy: 0 });
    rig.draw(g, 150, 240, view);
    assert(cv.pixels.some((v) => v !== 0));
    hashes.push(createHash('sha256').update(Buffer.from(cv.pixels.buffer)).digest('hex'));
  }
  assert.equal(new Set(hashes).size, 3);
});
