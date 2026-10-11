/** Original clothing inventory. Appearance is cosmetic; purchases use the actual wallet. */
const freeze = (value) => {
  Object.values(value).forEach((v) => {
    if (v && typeof v === 'object') freeze(v);
  });
  return Object.freeze(value);
};
const base = { skin: '#bc927b', hair: '#201d1b', boot: '#1c2221' };
export const OUTFITS = freeze({
  'relief-coat': {
    id: 'relief-coat',
    name: 'Relief coat',
    description: 'The weathered coat Mara wore on the crossing.',
    price: 0,
    style: 'coat',
    sleeves: 'long',
    colors: { ...base, coat: '#665d49', cloth: '#ddd7c4', pants: '#273435', trim: '#ad9162' },
  },
  'co-op-workwear': {
    id: 'co-op-workwear',
    name: 'Co-op workwear',
    description: 'A blue dispatch shirt, durable trousers and work boots.',
    price: 45,
    style: 'shirt',
    sleeves: 'long',
    colors: { ...base, coat: '#435b64', cloth: '#547984', pants: '#46463d', trim: '#b3aa79' },
  },
  'shore-knit': {
    id: 'shore-knit',
    name: 'Shore knit',
    description: 'A warm rust-colored sweater kept in the shelter wardrobe.',
    price: 35,
    style: 'shirt',
    sleeves: 'long',
    colors: { ...base, coat: '#8b5f4c', cloth: '#a47157', pants: '#3b484c', trim: '#bda87c' },
  },
  'slate-work-jacket': {
    id: 'slate-work-jacket',
    name: 'Slate work jacket',
    description: 'A short slate jacket with reinforced shoulders and charcoal work trousers.',
    price: 80,
    style: 'tunic',
    sleeves: 'long',
    colors: { ...base, coat: '#596972', cloth: '#71838a', pants: '#343f43', trim: '#c0ae81' },
  },
  'ochre-rain-shell': {
    id: 'ochre-rain-shell',
    name: 'Ochre rain shell',
    description: 'A long ochre shell over dark waterproof trousers.',
    price: 90,
    style: 'coat',
    sleeves: 'long',
    colors: { ...base, coat: '#ad8541', cloth: '#c69b50', pants: '#364a4b', trim: '#e0c58c' },
  },
  'navy-coveralls': {
    id: 'navy-coveralls',
    name: 'Navy coveralls',
    description: 'Matching navy work clothes with a pale undershirt and heavy boots.',
    price: 75,
    style: 'shirt',
    sleeves: 'long',
    colors: { ...base, coat: '#314d60', cloth: '#35576c', pants: '#35576c', trim: '#b6c4bf' },
  },
});
const own = (v, k) => Object.hasOwn(v, k);
const receiptId = (value) =>
  typeof value === 'string' &&
  /^[a-z0-9][a-z0-9:._-]{0,127}$/i.test(value) &&
  !['constructor', 'prototype', '__proto__'].includes(value);
const copy = (value) => JSON.parse(JSON.stringify(value));
export function initializeWardrobe(state) {
  state.wardrobe ??= { version: 1, owned: ['relief-coat'], equipped: 'relief-coat', receipts: {} };
  return state.wardrobe;
}
function equippedOutfit(state) {
  return own(OUTFITS, state.wardrobe?.equipped)
    ? OUTFITS[state.wardrobe.equipped]
    : OUTFITS['relief-coat'];
}
export function outfitAppearance(state) {
  const outfit = equippedOutfit(state);
  return { id: outfit.id, outfit: outfit.style, sleeves: outfit.sleeves, colors: outfit.colors };
}
export function equipOutfit(state, id) {
  const wardrobe = initializeWardrobe(state);
  if (!own(OUTFITS, id) || !wardrobe.owned.includes(id)) return { ok: false, reason: 'not-owned' };
  wardrobe.equipped = id;
  return { ok: true, id };
}
function transaction(state, id, receipt, kind, price) {
  const wardrobe = initializeWardrobe(state);
  if (!receiptId(receipt) || !own(OUTFITS, id) || !Number.isFinite(price) || price < 0)
    return { ok: false, reason: 'invalid-transaction' };
  if (own(wardrobe.receipts, receipt)) {
    const prior = wardrobe.receipts[receipt];
    return prior.id === id && prior.kind === kind && prior.price === price
      ? { ...copy(prior), ok: true, replayed: true }
      : { ok: false, reason: 'receipt-conflict' };
  }
  if (wardrobe.owned.includes(id)) return { ok: false, reason: 'already-owned' };
  if (!Number.isFinite(state.player?.money) || state.player.money < price)
    return { ok: false, reason: 'insufficient-money' };
  const record = { id, receipt, kind, price, time: state.time ?? 0 };
  state.player.money -= price;
  wardrobe.owned.push(id);
  wardrobe.receipts[receipt] = record;
  return { ...copy(record), ok: true };
}
export function purchaseOutfit(state, id, receipt) {
  return transaction(state, id, receipt, 'purchase', OUTFITS[id]?.price);
}
/** Parent must verify the physical reward/service before granting an item. */
export function grantOutfit(state, id, receipt) {
  return transaction(state, id, receipt, 'grant', 0);
}
export function validateWardrobe(state) {
  const wardrobe = state.wardrobe;
  if (
    !wardrobe ||
    wardrobe.version !== 1 ||
    !Array.isArray(wardrobe.owned) ||
    wardrobe.owned.length > Object.keys(OUTFITS).length ||
    new Set(wardrobe.owned).size !== wardrobe.owned.length ||
    wardrobe.owned.some((id) => !own(OUTFITS, id)) ||
    !wardrobe.owned.includes(wardrobe.equipped) ||
    !wardrobe.receipts ||
    typeof wardrobe.receipts !== 'object' ||
    Array.isArray(wardrobe.receipts)
  )
    throw new Error('The saved wardrobe is invalid.');
  const records = Object.entries(wardrobe.receipts);
  if (records.length > 1000) throw new Error('The saved wardrobe ledger is too large.');
  for (const [key, r] of records)
    if (
      !receiptId(key) ||
      !r ||
      r.receipt !== key ||
      !wardrobe.owned.includes(r.id) ||
      !['purchase', 'grant'].includes(r.kind) ||
      !Number.isFinite(r.price) ||
      r.price < 0 ||
      r.price !== (r.kind === 'grant' ? 0 : OUTFITS[r.id].price) ||
      !Number.isFinite(r.time) ||
      r.time < 0
    )
      throw new Error('The saved wardrobe transaction is invalid.');
  return true;
}
