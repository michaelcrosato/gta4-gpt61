/** Real clothing stock and finite co-op payment. Parent owns mission/scene proofs. */
import {
  OUTFITS,
  initializeWardrobe,
  validateWardrobe,
  purchaseOutfit,
  grantOutfit,
  equipOutfit,
} from './wardrobe.js';
import { getActor } from './companions.js';
import { actorSceneId } from './scene-context.js';
import { campaignReceiptNamespace } from './campaign/director.js';

export const PIER_GOODS_STOCK = Object.freeze([
  'slate-work-jacket',
  'ochre-rain-shell',
  'navy-coveralls',
]);
const STORE = 'pier-goods',
  MISSION = 'LL-ST-003',
  CLERK = 'LL-ARC-BEA';
const own = (v, k) => !!v && Object.hasOwn(v, k);
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const finite = Number.isFinite;
const id = (v) =>
  typeof v === 'string' &&
  /^[a-z0-9][a-z0-9:._-]{0,127}$/i.test(v) &&
  !['constructor', 'prototype', '__proto__', 'toJSON'].includes(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = (reason) => ({ ok: false, reason });
function copy(value) {
  const seen = new Set();
  function visit(v, depth = 0) {
    if (depth > 60) throw Error('Clothing data exceeds its depth limit.');
    if (
      v === null ||
      typeof v === 'boolean' ||
      typeof v === 'string' ||
      (typeof v === 'number' && finite(v))
    )
      return v;
    if (
      !v ||
      typeof v !== 'object' ||
      seen.has(v) ||
      ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(v))
    )
      throw Error('Clothing data must be finite plain JSON.');
    seen.add(v);
    const out = Array.isArray(v) ? [] : {};
    for (const key of Reflect.ownKeys(v)) {
      if (Array.isArray(v) && key === 'length') continue;
      const d = Object.getOwnPropertyDescriptor(v, key);
      if (
        typeof key !== 'string' ||
        ['constructor', 'prototype', '__proto__', 'toJSON'].includes(key) ||
        !own(d, 'value') ||
        !d.enumerable
      )
        throw Error('Unsafe clothing data field.');
      out[key] = visit(d.value, depth + 1);
    }
    if (Array.isArray(v) && Object.keys(out).length !== v.length)
      throw Error('Sparse clothing data.');
    seen.delete(v);
    return out;
  }
  return visit(value);
}
function sync(fn, ...args) {
  const result = typeof fn === 'function' ? fn(...args) : undefined;
  if (result && typeof result.then === 'function')
    throw Error('Clothing bindings must be synchronous.');
  return result;
}
function scopeValid(scope) {
  return (
    object(scope) &&
    Object.keys(scope).length === 4 &&
    scope.missionId === MISSION &&
    scope.stageId === 'workwear' &&
    Number.isSafeInteger(scope.attempt) &&
    scope.attempt > 0 &&
    id(scope.activationReceipt)
  );
}
function liveScope(state, scope) {
  const run = state.campaign?.active,
    receipt = state.campaign?.receipts?.[scope?.activationReceipt];
  return (
    scopeValid(scope) &&
    run?.missionId === scope.missionId &&
    run.stageId === scope.stageId &&
    run.attempt === scope.attempt &&
    run.phase === 'running' &&
    receipt?.kind === 'stage-activation' &&
    receipt.missionId === scope.missionId &&
    receipt.stageId === scope.stageId &&
    receipt.attempt === scope.attempt
  );
}
function grantProofValid(proof) {
  return (
    object(proof) &&
    id(proof.contactReceiptId) &&
    Array.isArray(proof.dropoffs) &&
    proof.dropoffs.length === 2 &&
    ['LL-CHAR-025', 'LL-CHAR-008'].every(
      (actorId, i) => proof.dropoffs[i]?.actorId === actorId && id(proof.dropoffs[i].receiptId),
    ) &&
    proof.dropoffs[0].receiptId !== proof.dropoffs[1].receiptId
  );
}
export function starterOutfitVoucherId(state) {
  const namespace = state.campaign
    ? campaignReceiptNamespace(state.campaign)
    : state.clothingServices?.namespace;
  return typeof namespace === 'string' && /^[a-f0-9]{8}$/.test(namespace)
    ? 'clothing:' + namespace + ':' + MISSION + ':starter'
    : null;
}
function model(state) {
  return (state.clothingServices ??= {
    version: 1,
    namespace: state.campaign ? campaignReceiptNamespace(state.campaign) : 'retail',
    grants: {},
    purchases: {},
  });
}
export function validateClothingServices(state, { expectedNamespace } = {}) {
  if (!state.clothingServices) return true;
  const m = copy(state.clothingServices);
  if (
    m.version !== 1 ||
    Object.keys(m).length !== 4 ||
    !(
      m.namespace === 'retail' ||
      (typeof m.namespace === 'string' && /^[a-f0-9]{8}$/.test(m.namespace))
    ) ||
    (state.campaign && m.namespace !== campaignReceiptNamespace(state.campaign)) ||
    (expectedNamespace !== undefined && m.namespace !== expectedNamespace) ||
    (m.namespace === 'retail' && Object.keys(m.grants ?? {}).length > 0) ||
    !object(m.grants) ||
    !object(m.purchases) ||
    Object.keys(m.grants).length > 1 ||
    Object.keys(m.purchases).length > 1000
  )
    throw Error('Invalid saved clothing ledger.');
  validateWardrobe(state);
  for (const [key, g] of Object.entries(m.grants)) {
    if (
      key !== starterOutfitVoucherId(state) ||
      g.id !== key ||
      g.kind !== 'cooperative-voucher' ||
      g.status !== 'committed' ||
      g.storeId !== STORE ||
      g.payment !== 'cooperative-voucher' ||
      !same(g.outfitIds, PIER_GOODS_STOCK) ||
      g.count !== 1 ||
      !scopeValid(g.scope) ||
      !finite(g.time) ||
      g.time < 0 ||
      g.time > state.time ||
      !grantProofValid(g.proof) ||
      !(g.spentBy === null || id(g.spentBy))
    )
      throw Error('Invalid saved starter outfit voucher.');
    if (
      g.spentBy !== null &&
      (!own(m.purchases, g.spentBy) || m.purchases[g.spentBy].voucherId !== key)
    )
      throw Error('The saved voucher spend has no purchase.');
  }
  for (const [key, p] of Object.entries(m.purchases)) {
    const voucher = p.voucherId && m.grants[p.voucherId],
      inventory = p.inventoryReceiptId && state.wardrobe.receipts[p.inventoryReceiptId];
    if (
      !id(key) ||
      p.id !== key ||
      p.status !== 'committed' ||
      p.kind !== 'clothing-purchase' ||
      p.storeId !== STORE ||
      !PIER_GOODS_STOCK.includes(p.outfitId) ||
      p.listedPrice !== OUTFITS[p.outfitId].price ||
      !['cash', 'cooperative-voucher'].includes(p.payment) ||
      !(p.scope === null || scopeValid(p.scope)) ||
      !finite(p.time) ||
      p.time < 0 ||
      p.time > state.time ||
      !finite(p.moneyBefore) ||
      !finite(p.moneyAfter) ||
      p.moneyBefore < 0 ||
      p.moneyAfter < 0 ||
      typeof p.replacement !== 'boolean' ||
      !state.wardrobe.owned.includes(p.outfitId)
    )
      throw Error('Invalid saved clothing purchase.');
    if (p.payment === 'cooperative-voucher') {
      if (
        !voucher ||
        voucher.spentBy !== key ||
        p.charged !== 0 ||
        p.moneyBefore !== p.moneyAfter ||
        !scopeValid(p.scope)
      )
        throw Error('The saved voucher purchase is not backed by its one-time spend.');
    } else if (
      p.voucherId !== null ||
      p.charged !== p.listedPrice ||
      p.moneyBefore - p.moneyAfter !== p.charged ||
      p.replacement
    )
      throw Error('Invalid saved cash clothing payment.');
    if (p.replacement) {
      if (p.inventoryReceiptId !== null || p.payment !== 'cooperative-voucher')
        throw Error('Invalid saved clothing replacement.');
    } else if (
      !inventory ||
      inventory.id !== p.outfitId ||
      inventory.kind !== (p.payment === 'cash' ? 'purchase' : 'grant') ||
      inventory.price !== p.charged ||
      inventory.time !== p.time
    )
      throw Error('Clothing purchase lacks its real inventory transaction.');
  }
  return true;
}
export function createClothingService(state, engine = {}) {
  function ready() {
    return (
      ['verifyGrant', 'storeObservation', 'hasLineOfSight', 'hasRoom'].every(
        (k) => typeof engine[k] === 'function',
      ) && sync(engine.hasRoom, STORE) === true
    );
  }
  function receipt(s, key) {
    const m = s.clothingServices,
      value = own(m?.grants, key)
        ? m.grants[key]
        : own(m?.purchases, key)
          ? m.purchases[key]
          : null;
    return value ? copy(value) : null;
  }
  function shop(s) {
    const observed = sync(engine.storeObservation, s, STORE);
    if (!observed) return false;
    const o = copy(observed),
      actor = getActor(s, CLERK),
      p = s.player,
      h = o.hook;
    return (
      o.storeId === STORE &&
      o.sceneId === STORE &&
      o.open === true &&
      o.clerkId === CLERK &&
      same(o.stock, PIER_GOODS_STOCK) &&
      typeof o.sceneId === 'string' &&
      id(h?.id) &&
      [h?.x, h?.y, h?.z, h?.radius].every(finite) &&
      h.radius > 0 &&
      h.radius <= 40 &&
      p.health > 0 &&
      !p.vehicleId &&
      !s.wanted?.level &&
      actorSceneId(p) === o.sceneId &&
      actor?.health > 0 &&
      actorSceneId(actor) === o.sceneId &&
      Math.hypot(p.x - h.x, p.y - h.y) < h.radius &&
      Math.abs((p.z ?? 0) - h.z) <= 3 &&
      sync(engine.hasLineOfSight, s, p, { x: h.x, y: h.y, z: h.z + 12 }, o.sceneId) === true &&
      sync(engine.hasLineOfSight, s, p, actor, o.sceneId) === true
    );
  }
  return {
    get ready() {
      return ready();
    },
    grantVoucher(s, request) {
      request = copy(request);
      if (
        !ready() ||
        !liveScope(s, request.scope) ||
        request.id !== starterOutfitVoucherId(s) ||
        request.storeId !== STORE ||
        request.payment !== 'cooperative-voucher' ||
        request.count !== 1 ||
        !same(request.outfitIds, PIER_GOODS_STOCK)
      )
        return fail('actual-workwear-voucher-grant-unavailable');
      validateClothingServices(s);
      const proved = sync(engine.verifyGrant, s, copy(request));
      if (proved?.ok !== true || !grantProofValid(proved.proof))
        return fail('actual-ordered-dropoffs-and-contact-required');
      const existing = receipt(s, request.id);
      if (existing)
        return same(existing.scope, request.scope) && same(existing.proof, proved.proof)
          ? { ok: true, replayed: true, receipt: existing }
          : fail('voucher-receipt-conflict');
      const g = {
        id: request.id,
        kind: 'cooperative-voucher',
        status: 'committed',
        scope: copy(request.scope),
        storeId: STORE,
        payment: 'cooperative-voucher',
        outfitIds: [...PIER_GOODS_STOCK],
        count: 1,
        time: s.time,
        proof: copy(proved.proof),
        spentBy: null,
      };
      model(s).grants[g.id] = g;
      return { ok: true, receipt: copy(g), voucherId: g.id };
    },
    purchaseAndEquip(s, request) {
      request = copy(request);
      if (
        !id(request.id) ||
        request.id.length > 110 ||
        !PIER_GOODS_STOCK.includes(request.outfitId) ||
        request.storeId !== STORE
      )
        return fail('invalid-clothing-purchase');
      const payment = request.voucherId ? 'cooperative-voucher' : 'cash',
        scope = request.scope ?? null,
        prior = receipt(s, request.id);
      if (prior)
        return prior.kind === 'clothing-purchase' &&
          prior.storeId === request.storeId &&
          prior.outfitId === request.outfitId &&
          prior.voucherId === (request.voucherId ?? null) &&
          same(prior.scope, scope)
          ? { ok: true, replayed: true, receipt: prior }
          : fail('purchase-receipt-conflict');
      if (
        !ready() ||
        !shop(s) ||
        (scope !== null && !liveScope(s, scope)) ||
        (payment === 'cooperative-voucher' && !liveScope(s, scope))
      )
        return fail('actual-clothing-counter-unavailable');
      validateClothingServices(s);
      initializeWardrobe(s);
      const voucher = request.voucherId && s.clothingServices?.grants?.[request.voucherId],
        replacement = s.wardrobe.owned.includes(request.outfitId);
      if (
        payment === 'cooperative-voucher' &&
        (!voucher || voucher.spentBy !== null || voucher.storeId !== STORE)
      )
        return fail('starter-voucher-unavailable');
      if (payment === 'cash' && replacement) return fail('already-owned');
      const before = {
          wardrobe: copy(s.wardrobe),
          clothing: s.clothingServices ? copy(s.clothingServices) : null,
          money: s.player.money,
        },
        inventoryReceiptId = replacement ? null : request.id + ':inventory';
      try {
        const bought = replacement
          ? { ok: true }
          : payment === 'cash'
            ? purchaseOutfit(s, request.outfitId, inventoryReceiptId)
            : grantOutfit(s, request.outfitId, inventoryReceiptId);
        if (!bought.ok) return bought;
        const equipped = equipOutfit(s, request.outfitId);
        if (!equipped.ok) throw Error('The purchased outfit could not be equipped.');
        const p = {
          id: request.id,
          kind: 'clothing-purchase',
          status: 'committed',
          scope: copy(scope),
          storeId: STORE,
          outfitId: request.outfitId,
          payment,
          voucherId: request.voucherId ?? null,
          listedPrice: OUTFITS[request.outfitId].price,
          charged: payment === 'cash' ? OUTFITS[request.outfitId].price : 0,
          moneyBefore: before.money,
          moneyAfter: s.player.money,
          time: s.time,
          replacement,
          inventoryReceiptId,
        };
        model(s).purchases[p.id] = p;
        if (voucher) voucher.spentBy = p.id;
        validateClothingServices(s);
        return { ok: true, receipt: copy(p) };
      } catch (error) {
        s.wardrobe = before.wardrobe;
        s.player.money = before.money;
        if (before.clothing === null) delete s.clothingServices;
        else s.clothingServices = before.clothing;
        throw error;
      }
    },
    receipt,
    verify(s, value) {
      try {
        validateClothingServices(s);
        return same(receipt(s, value.id), copy(value));
      } catch {
        return false;
      }
    },
  };
}
