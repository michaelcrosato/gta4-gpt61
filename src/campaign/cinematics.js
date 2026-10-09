/** In-engine scene staging. Actors walk through parent collision; skips never teleport. */
const clone = (v) => JSON.parse(JSON.stringify(v));
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const validReceipt = (v) =>
  typeof v === 'string' &&
  /^[a-z0-9][a-z0-9:._-]{0,127}$/i.test(v) &&
  !['constructor', 'prototype', '__proto__'].includes(v);
const sameScene = (actor, id) => (actor.sceneId ?? null) === (id ?? null);
const hash = (value) => {
  let h = 2166136261;
  for (const c of JSON.stringify(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h.toString(16);
};
function validPoint(p) {
  return p && [p.x, p.y, p.z ?? 0].every(finite);
}
function definition(id, context) {
  const config = context.sequence?.(id);
  if (
    !config ||
    config.id !== id ||
    !Array.isArray(config.phases) ||
    !config.phases.length ||
    config.phases.length > 32
  )
    throw Error('Unknown or unbuilt cinematic scene.');
  for (const phase of config.phases) {
    if (
      !finite(phase.holdSeconds) ||
      phase.holdSeconds < 0 ||
      phase.holdSeconds > 60 ||
      !Array.isArray(phase.tracks)
    )
      throw Error('Invalid cinematic phase.');
    if (new Set(phase.tracks.map((t) => t.actorId)).size !== phase.tracks.length)
      throw Error('A cinematic actor has conflicting simultaneous routes.');
    for (const track of phase.tracks)
      if (
        typeof track.actorId !== 'string' ||
        !Array.isArray(track.points) ||
        !track.points.length ||
        !track.points.every(validPoint) ||
        !finite(track.speed) ||
        track.speed <= 0 ||
        track.speed > 88
      )
        throw Error('Invalid cinematic actor route.');
    if (phase.camera && !validPoint(phase.camera.focus) && typeof phase.camera.actorId !== 'string')
      throw Error('Invalid cinematic camera.');
  }
  return config;
}
export function initializeCinematics(state) {
  state.cinematics ??= { version: 1, active: null, completed: {}, epoch: 0 };
  return state.cinematics;
}
export function startCinematic(state, id, receipt, context) {
  const model = initializeCinematics(state);
  if (!validReceipt(receipt)) return { ok: false, reason: 'invalid-receipt' };
  if (Object.hasOwn(model.completed, receipt))
    return model.completed[receipt].id === id
      ? { ok: true, replayed: true }
      : { ok: false, reason: 'receipt-conflict' };
  if (model.active)
    return model.active.id === id && model.active.receipt === receipt
      ? { ok: true, replayed: true }
      : { ok: false, reason: 'another-scene-active' };
  let config;
  try {
    config = definition(id, context);
  } catch (error) {
    return { ok: false, reason: error.message };
  }
  for (const phase of config.phases)
    for (const track of phase.tracks) {
      const actor = context.actor?.(track.actorId);
      if (!actor || actor.health <= 0 || !sameScene(actor, config.sceneId))
        return { ok: false, reason: 'actor-unavailable' };
    }
  model.active = {
    id,
    receipt,
    configHash: hash(config),
    phase: 0,
    elapsed: 0,
    totalElapsed: 0,
    tracks: {},
    skipRequested: false,
    blocked: null,
  };
  model.epoch++;
  return { ok: true };
}
export function skipCinematic(state) {
  const active = state.cinematics?.active;
  if (!active) return false;
  active.skipRequested = true;
  return true;
}
export function cancelCinematic(state, reason = 'interrupted') {
  const model = initializeCinematics(state);
  if (!model.active) return false;
  model.active = null;
  model.epoch++;
  model.lastCancellation = reason;
  return true;
}
export function cinematicFinished(state, id, receipt) {
  return Object.values(state.cinematics?.completed ?? {}).some(
    (r) => r.id === id && (!receipt || r.receipt === receipt),
  );
}
export function cinematicView(state, context) {
  const active = state.cinematics?.active;
  if (!active) return null;
  const config = definition(active.id, context),
    phase = config.phases[active.phase],
    camera = phase.camera;
  const actor = camera?.actorId ? context.actor?.(camera.actorId) : null;
  const focus = actor
    ? {
        x: actor.x + (camera.offset?.x ?? 0),
        y: actor.y + (camera.offset?.y ?? 0),
        z: (actor.z ?? 0) + (camera.offset?.z ?? 0),
      }
    : camera?.focus;
  return {
    id: active.id,
    phase: phase.id ?? String(active.phase),
    sceneId: config.sceneId ?? null,
    focus: focus ? clone(focus) : null,
    zoom: camera?.zoom ?? 1,
    dialogueReady: phase.dialogueReady === true,
    skipRequested: active.skipRequested,
    blocked: active.blocked,
    epoch: state.cinematics.epoch,
  };
}
export function tickCinematics(state, dt, context) {
  const model = initializeCinematics(state),
    active = model.active;
  if (!active || !finite(dt) || dt <= 0) return;
  const config = definition(active.id, context);
  if (hash(config) !== active.configHash)
    throw Error('The cinematic scene changed during playback.');
  const phase = config.phases[active.phase],
    elapsed = Math.min(dt, 0.5);
  active.elapsed += elapsed;
  active.totalElapsed += elapsed;
  active.blocked = null;
  let reached = true;
  for (let i = 0; i < phase.tracks.length; i++) {
    const track = phase.tracks[i],
      actor = context.actor?.(track.actorId);
    if (!actor || actor.health <= 0 || !sameScene(actor, config.sceneId)) {
      active.blocked = 'actor-unavailable';
      reached = false;
      continue;
    }
    const progress = (active.tracks[i] ??= { index: 0, blockedFor: 0 });
    let remaining = track.speed * elapsed * (active.skipRequested ? 4 : 1);
    while (progress.index < track.points.length && remaining > 1e-7) {
      const target = track.points[progress.index],
        dx = target.x - actor.x,
        dy = target.y - actor.y,
        distance = Math.hypot(dx, dy);
      if (distance <= 0.3 && Math.abs((actor.z ?? 0) - (target.z ?? 0)) <= 2) {
        progress.index++;
        continue;
      }
      const step = Math.min(remaining, distance, 3),
        before = { x: actor.x, y: actor.y };
      if (typeof context.moveActor !== 'function') {
        active.blocked = 'missing-physical-movement';
        break;
      }
      context.moveActor(
        track.actorId,
        distance ? (dx / distance) * step : 0,
        distance ? (dy / distance) * step : 0,
        7,
      );
      const moved = Math.hypot(actor.x - before.x, actor.y - before.y);
      if (moved < 1e-5) {
        progress.blockedFor += elapsed;
        active.blocked = 'physical-route-blocked';
        break;
      }
      actor.angle = Math.atan2(dy, dx);
      actor.speed = track.speed * (active.skipRequested ? 4 : 1);
      remaining -= step;
      progress.blockedFor = 0;
    }
    if (progress.index < track.points.length) reached = false;
    else actor.speed = 0;
  }
  if (!reached || (!active.skipRequested && active.elapsed < phase.holdSeconds)) return;
  if (active.phase + 1 < config.phases.length) {
    active.phase++;
    active.elapsed = 0;
    active.tracks = {};
    return;
  }
  const record = {
    id: active.id,
    receipt: active.receipt,
    elapsed: active.totalElapsed,
    skipped: active.skipRequested,
    time: state.time ?? 0,
    actors: {},
  };
  for (const p of config.phases)
    for (const track of p.tracks) {
      const a = context.actor(track.actorId);
      record.actors[track.actorId] = { x: a.x, y: a.y, z: a.z ?? 0, sceneId: a.sceneId ?? null };
      a.speed = 0;
    }
  model.completed[active.receipt] = record;
  model.active = null;
  model.epoch++;
  context.onComplete?.(clone(record));
}
export function validateCinematics(state, context) {
  const model = state.cinematics;
  if (
    !model ||
    model.version !== 1 ||
    !Number.isSafeInteger(model.epoch) ||
    model.epoch < 0 ||
    !model.completed ||
    Array.isArray(model.completed) ||
    typeof model.completed !== 'object'
  )
    throw Error('The saved cinematic state is invalid.');
  for (const [receipt, r] of Object.entries(model.completed)) {
    if (
      !validReceipt(receipt) ||
      !r ||
      r.receipt !== receipt ||
      !finite(r.elapsed) ||
      r.elapsed < 0 ||
      !finite(r.time) ||
      r.time < 0 ||
      typeof r.skipped !== 'boolean'
    )
      throw Error('The saved cinematic outcome is invalid.');
    definition(r.id, context);
  }
  if (model.active) {
    const a = model.active,
      config = definition(a.id, context);
    if (
      !validReceipt(a.receipt) ||
      a.configHash !== hash(config) ||
      !Number.isInteger(a.phase) ||
      a.phase < 0 ||
      a.phase >= config.phases.length ||
      !finite(a.elapsed) ||
      a.elapsed < 0 ||
      !finite(a.totalElapsed) ||
      a.totalElapsed < a.elapsed ||
      typeof a.skipRequested !== 'boolean' ||
      !a.tracks ||
      typeof a.tracks !== 'object'
    )
      throw Error('The saved cinematic playback is invalid.');
    for (const [i, track] of Object.entries(a.tracks))
      if (
        !/^[0-9]+$/.test(i) ||
        !config.phases[a.phase].tracks[i] ||
        !Number.isInteger(track.index) ||
        track.index < 0 ||
        track.index > config.phases[a.phase].tracks[i].points.length ||
        !finite(track.blockedFor) ||
        track.blockedFor < 0
      )
        throw Error('The saved cinematic route progress is invalid.');
  }
  return true;
}
