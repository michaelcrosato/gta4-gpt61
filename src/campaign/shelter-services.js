/** Dockside home transactions: physical reach, finite food, interrupted sleep and saved receipts. */
import { INTERIOR_LAYOUTS, hasInteriorLineOfSight } from '../interiors.js';
import { applyRestHours, worldHours } from '../calendar.js';
import { grantOutfit } from '../wardrobe.js';
const ROOM = 'dockside-rooms';
const clone = (v) => JSON.parse(JSON.stringify(v));
const validId = (id) =>
  typeof id === 'string' &&
  /^[a-z0-9][a-z0-9:._-]{0,127}$/i.test(id) &&
  !['constructor', 'prototype', '__proto__'].includes(id);
const services = {
  food: 'shelter-food',
  rest: 'shelter-rest',
  wardrobe: 'wardrobe',
  evidence: 'evidence',
  save: 'shelter-save',
};
export function initializeShelterServices(state) {
  state.shelterServices ??= { version: 1, foodStock: 3, active: null, receipts: {}, cancelled: {} };
  state.storyInventory ??= { version: 1, keys: [], evidence: [], receipts: {} };
  return state.shelterServices;
}
export function shelterHook(state, kind) {
  if (state.interior?.active?.roomId !== ROOM || state.player.health <= 0 || state.player.vehicleId)
    return null;
  const hook = INTERIOR_LAYOUTS[ROOM]?.hooks.find((h) => h.service === services[kind]);
  return hook &&
    Math.hypot(hook.x - state.player.x, hook.y - state.player.y) < hook.radius &&
    hasInteriorLineOfSight(state, state.player, { ...hook, z: 12 })
    ? hook
    : null;
}
function invited(state) {
  return (
    state.storyInventory?.keys.includes('dockside-tenancy') ||
    state.campaign?.active?.missionId === 'LL-ST-001'
  );
}
export function useShelterService(state, kind, request = {}, context = {}) {
  const model = initializeShelterServices(state),
    id = request.id ?? request.receipt?.id;
  if (!validId(id) || !Object.hasOwn(services, kind))
    return { ok: false, reason: 'invalid-service-request' };
  if (Object.hasOwn(model.receipts, id)) {
    const receipt = model.receipts[id];
    return receipt.kind === kind
      ? { ok: true, replayed: true, receipt: clone(receipt) }
      : { ok: false, reason: 'receipt-conflict' };
  }
  if (model.active)
    return model.active.id === id && model.active.kind === kind
      ? { ok: true, pending: true, receipt: { id, kind, status: 'pending' } }
      : { ok: false, reason: 'busy' };
  const hook = shelterHook(state, kind);
  if (!hook || !invited(state)) return { ok: false, reason: 'home-service-unavailable' };
  if (kind === 'save') return { ok: false, reason: 'parent-storage-transaction-required' };
  const record = { id, kind, status: 'committed', hookId: hook.id, roomId: ROOM, time: state.time };
  if (kind === 'food') {
    if (model.foodStock <= 0) return { ok: false, reason: 'kettle-empty' };
    model.foodStock--;
    record.healthBefore = state.player.health;
    state.player.health = Math.min(100, state.player.health + 25);
    state.player.stamina = Math.min(100, state.player.stamina + 20);
    record.healthAfter = state.player.health;
    model.active = { id, kind, roomId: ROOM, hookId: hook.id, elapsed: 0, duration: 1.2 };
  } else if (kind === 'rest') {
    if (state.wanted.level || context.canRest?.(state) !== true)
      return { ok: false, reason: 'rest-unavailable' };
    model.active = {
      id,
      kind,
      roomId: ROOM,
      hookId: hook.id,
      elapsed: 0,
      duration: 2,
      hours: 6,
      startedAt: worldHours(state),
    };
    return { ok: true, pending: true, receipt: { id, kind, status: 'pending' } };
  } else if (kind === 'wardrobe') {
    for (const outfit of ['co-op-workwear', 'shore-knit']) {
      const result = grantOutfit(state, outfit, `${id}:${outfit}`);
      if (!result.ok && result.reason !== 'already-owned')
        throw Error('The shelter clothing grant failed.');
    }
    record.outfits = ['co-op-workwear', 'shore-knit'];
  } else if (kind === 'evidence') {
    if (!state.storyInventory.evidence.includes('co-op-arrears'))
      state.storyInventory.evidence.push('co-op-arrears');
    record.evidenceId = 'co-op-arrears';
  }
  model.receipts[id] = record;
  return { ok: true, type: kind === 'wardrobe' ? 'wardrobe' : 'service', receipt: clone(record) };
}
export function tickShelterServices(state, dt, context = {}) {
  const model = initializeShelterServices(state),
    a = model.active;
  if (!a || !Number.isFinite(dt) || dt <= 0) return;
  if (
    state.interior?.active?.roomId !== a.roomId ||
    state.player.health <= 0 ||
    (a.kind === 'rest' && (state.wanted.level > 0 || context.canRest?.(state) !== true))
  ) {
    model.cancelled[a.id] = { kind: a.kind, time: state.time, reason: 'interrupted' };
    model.active = null;
    return;
  }
  a.elapsed += Math.min(dt, 0.5);
  if (a.elapsed < a.duration) return;
  if (a.kind === 'rest') {
    const result = applyRestHours(state, a.hours, a.id);
    if (!result.ok) throw Error('The physical rest action could not commit its calendar receipt.');
    const receipt = {
      id: a.id,
      kind: 'rest',
      status: 'committed',
      roomId: a.roomId,
      hookId: a.hookId,
      time: state.time,
      hours: a.hours,
      calendar: result,
    };
    state.player.health = 100;
    state.player.stamina = 100;
    model.foodStock = 3;
    model.receipts[a.id] = receipt;
    model.active = null;
    context.onCompleted?.(clone(receipt));
    return;
  }
  model.active = null;
}
export function shelterReceipt(state, receipt) {
  const record =
    state.shelterServices?.receipts?.[typeof receipt === 'string' ? receipt : receipt?.id];
  return record?.status === 'committed' ? clone(record) : null;
}
export function cancelShelterService(state, receipt, reason = 'interrupted') {
  const model = initializeShelterServices(state),
    id = typeof receipt === 'string' ? receipt : receipt?.id;
  if (model.active?.id !== id) return false;
  model.cancelled[id] = { kind: model.active.kind, time: state.time, reason };
  model.active = null;
  return true;
}
export function shelterActionView(state) {
  const active = state.shelterServices?.active;
  if (!active) return null;
  return {
    ...clone(active),
    progress: Math.min(1, active.elapsed / active.duration),
    blocksMovement: true,
  };
}
export function applyStoryInventoryEffect(state, action, receiptId) {
  initializeShelterServices(state);
  const ledger = state.storyInventory.receipts;
  if (
    !validId(receiptId) ||
    !action ||
    !['grant-key', 'evidence-note'].includes(action.type) ||
    !validId(action.id)
  )
    return { ok: false, reason: 'unregistered-inventory-effect' };
  if (Object.hasOwn(ledger, receiptId))
    return ledger[receiptId].kind === action.type && ledger[receiptId].itemId === action.id
      ? { ok: true, replayed: true, receipt: clone(ledger[receiptId]) }
      : { ok: false, reason: 'receipt-conflict' };
  const inventory =
    action.type === 'grant-key' ? state.storyInventory.keys : state.storyInventory.evidence;
  if (!inventory.includes(action.id)) inventory.push(action.id);
  const record = {
    id: receiptId,
    kind: action.type,
    itemId: action.id,
    status: 'committed',
    time: state.time,
  };
  ledger[receiptId] = record;
  return { ok: true, receipt: clone(record) };
}
export function validateShelterServices(state) {
  const m = state.shelterServices,
    i = state.storyInventory;
  if (
    !m ||
    m.version !== 1 ||
    !Number.isInteger(m.foodStock) ||
    m.foodStock < 0 ||
    m.foodStock > 3 ||
    !m.receipts ||
    typeof m.receipts !== 'object' ||
    Array.isArray(m.receipts) ||
    !m.cancelled ||
    typeof m.cancelled !== 'object' ||
    !i ||
    i.version !== 1 ||
    !Array.isArray(i.keys) ||
    !Array.isArray(i.evidence) ||
    [...i.keys, ...i.evidence].some((id) => !validId(id)) ||
    new Set(i.keys).size !== i.keys.length ||
    new Set(i.evidence).size !== i.evidence.length ||
    !i.receipts ||
    typeof i.receipts !== 'object'
  )
    throw Error('The saved shelter inventory is invalid.');
  if (m.active) {
    const a = m.active;
    if (
      !validId(a.id) ||
      !['food', 'rest'].includes(a.kind) ||
      a.roomId !== ROOM ||
      !INTERIOR_LAYOUTS[ROOM]?.hooks.some((h) => h.id === a.hookId) ||
      !Number.isFinite(a.elapsed) ||
      a.elapsed < 0 ||
      a.elapsed >= a.duration ||
      a.duration !== (a.kind === 'rest' ? 2 : 1.2) ||
      (a.kind === 'rest' && a.hours !== 6)
    )
      throw Error('The saved shelter action is invalid.');
  }
  for (const [id, r] of Object.entries(m.receipts))
    if (
      !validId(id) ||
      !r ||
      r.id !== id ||
      r.status !== 'committed' ||
      !Object.hasOwn(services, r.kind) ||
      !Number.isFinite(r.time) ||
      r.time < 0 ||
      (r.kind === 'rest' && state.calendar?.receipts[id]?.hours !== r.hours)
    )
      throw Error('The saved shelter receipt is invalid.');
  for (const [id, r] of Object.entries(i.receipts))
    if (
      !validId(id) ||
      !r ||
      r.id !== id ||
      !['grant-key', 'evidence-note'].includes(r.kind) ||
      !(r.kind === 'grant-key' ? i.keys : i.evidence).includes(r.itemId)
    )
      throw Error('The saved key or evidence receipt is invalid.');
  return true;
}
