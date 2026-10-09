/** Saved ambient conversations advance only after the game UI presents each line. */
const copy = (v) => JSON.parse(JSON.stringify(v));
const validId = (id) =>
  typeof id === 'string' &&
  /^[a-z0-9][a-z0-9:._-]{0,127}$/i.test(id) &&
  !['constructor', 'prototype', '__proto__'].includes(id);
export function initializeSubtitles(state) {
  return (state.subtitles ??= { version: 1, active: null, queue: [], completed: {} });
}
export function startSubtitleSequence(state, id, receipt, lines) {
  const m = initializeSubtitles(state);
  if (
    !validId(id) ||
    !validId(receipt) ||
    !Array.isArray(lines) ||
    !lines.length ||
    lines.length > 100 ||
    lines.some(
      (l) =>
        typeof l.speaker !== 'string' ||
        typeof l.text !== 'string' ||
        !l.text.length ||
        l.text.length > 2000,
    )
  )
    return { ok: false, reason: 'invalid-subtitles' };
  const old = m.completed[receipt] || [m.active, ...m.queue].find((s) => s?.receipt === receipt);
  if (old)
    return old.id === id ? { ok: true, replayed: true } : { ok: false, reason: 'receipt-conflict' };
  const sequence = {
    id,
    receipt,
    lines: copy(lines),
    index: 0,
    elapsed: 0,
    presented: false,
    history: [],
  };
  if (m.active) m.queue.push(sequence);
  else m.active = sequence;
  return { ok: true };
}
export function subtitleLine(state) {
  const a = state.subtitles?.active;
  if (!a) return null;
  return { ...a.lines[a.index], sequenceId: a.id, receipt: a.receipt, index: a.index, auto: true };
}
export function presentSubtitle(state, receipt, index) {
  const a = state.subtitles?.active;
  if (!a || a.receipt !== receipt || a.index !== index) return false;
  a.presented = true;
  return true;
}
export function advanceSubtitle(state, { acknowledged = false } = {}) {
  const m = initializeSubtitles(state),
    a = m.active;
  if (!a?.presented) return false;
  a.history.push({ index: a.index, visibleSeconds: a.elapsed, acknowledged });
  a.index++;
  a.elapsed = 0;
  a.presented = false;
  if (a.index === a.lines.length) {
    m.completed[a.receipt] = { id: a.id, receipt: a.receipt, time: state.time, history: a.history };
    m.active = m.queue.shift() || null;
  }
  return true;
}
export function tickSubtitles(state, dt, { visible = true } = {}) {
  const a = state.subtitles?.active;
  if (!a?.presented || !visible || !Number.isFinite(dt) || dt <= 0) return;
  a.elapsed += Math.min(dt, 0.5);
  const duration = Math.max(2, Math.min(7, 1 + a.lines[a.index].text.length / 16));
  if (a.elapsed >= duration) advanceSubtitle(state);
}
export function subtitleFinished(state, id, receipt) {
  return state.subtitles?.completed?.[receipt]?.id === id;
}
export function validateSubtitles(state) {
  const m = state.subtitles;
  if (
    !m ||
    m.version !== 1 ||
    !Array.isArray(m.queue) ||
    m.queue.length > 100 ||
    !m.completed ||
    typeof m.completed !== 'object' ||
    Array.isArray(m.completed)
  )
    throw Error('The saved subtitles are invalid.');
  for (const a of [m.active, ...m.queue].filter(Boolean))
    if (
      !validId(a.id) ||
      !validId(a.receipt) ||
      !Array.isArray(a.lines) ||
      !a.lines.length ||
      a.lines.some(
        (l) => typeof l.speaker !== 'string' || typeof l.text !== 'string' || !l.text.length,
      ) ||
      !Number.isInteger(a.index) ||
      a.index < 0 ||
      a.index >= a.lines.length ||
      !Number.isFinite(a.elapsed) ||
      a.elapsed < 0 ||
      a.elapsed > 10 ||
      typeof a.presented !== 'boolean' ||
      !Array.isArray(a.history) ||
      a.history.length !== a.index
    )
      throw Error('The saved subtitle sequence is invalid.');
  for (const [id, a] of Object.entries(m.completed))
    if (
      !validId(id) ||
      a.receipt !== id ||
      !validId(a.id) ||
      !Array.isArray(a.history) ||
      !Number.isFinite(a.time) ||
      a.time < 0
    )
      throw Error('The saved subtitle outcome is invalid.');
  return true;
}
