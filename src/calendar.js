/** Continuous world hours plus explicit sleep, shared by appointments and the clock HUD. */
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
export function initializeCalendar(state) {
  state.calendar ??= { version: 1, startHours: 20.25, offsetHours: 0, sleptHours: 0, receipts: {} };
  return state.calendar;
}
export function worldHours(state) {
  const calendar = initializeCalendar(state);
  return calendar.startHours + (state.time ?? 0) / 90 + calendar.offsetHours;
}
export function clockHour(state) {
  return ((worldHours(state) % 24) + 24) % 24;
}
export function applyRestHours(state, hours, receipt) {
  const calendar = initializeCalendar(state);
  if (
    !finite(hours) ||
    hours <= 0 ||
    hours > 24 ||
    typeof receipt !== 'string' ||
    !/^[a-z0-9][a-z0-9:._-]{0,127}$/i.test(receipt) ||
    ['constructor', 'prototype', '__proto__'].includes(receipt)
  )
    return { ok: false, reason: 'invalid-rest' };
  if (Object.hasOwn(calendar.receipts, receipt))
    return calendar.receipts[receipt].hours === hours
      ? { ok: true, replayed: true, ...calendar.receipts[receipt] }
      : { ok: false, reason: 'receipt-conflict' };
  const record = { hours, startedAt: worldHours(state), endedAt: worldHours(state) + hours };
  calendar.offsetHours += hours;
  calendar.sleptHours += hours;
  calendar.receipts[receipt] = record;
  state.clock = clockHour(state);
  return { ok: true, ...record };
}
export function validateCalendar(state) {
  const c = state.calendar;
  if (
    !c ||
    c.version !== 1 ||
    !finite(c.startHours) ||
    c.startHours < 0 ||
    c.startHours >= 24 ||
    !finite(c.offsetHours) ||
    c.offsetHours < 0 ||
    c.offsetHours > 1e9 ||
    !finite(c.sleptHours) ||
    c.sleptHours !== c.offsetHours ||
    !c.receipts ||
    typeof c.receipts !== 'object' ||
    Array.isArray(c.receipts)
  )
    throw new Error('The saved world calendar is invalid.');
  let total = 0;
  for (const [id, r] of Object.entries(c.receipts)) {
    if (
      !/^[a-z0-9][a-z0-9:._-]{0,127}$/i.test(id) ||
      ['constructor', 'prototype', '__proto__'].includes(id) ||
      !r ||
      !finite(r.hours) ||
      r.hours <= 0 ||
      r.hours > 24 ||
      !finite(r.startedAt) ||
      !finite(r.endedAt) ||
      Math.abs(r.endedAt - r.startedAt - r.hours) > 1e-7
    )
      throw new Error('The saved rest receipt is invalid.');
    total += r.hours;
  }
  if (Math.abs(total - c.sleptHours) > 1e-7)
    throw new Error('The saved rest ledger differs from its calendar.');
  return true;
}
