/** Persistent physical companions. Parent owns geometry, portals, driver and combat. */
const EPS = 1e-6;
const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const scene = (actor) =>
  actor.sceneId ?? (actor.scene?.kind === 'interior' ? actor.scene.id : null);
const resolvingDamage = new WeakSet();
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function invalid(reason) {
  throw Error(`Invalid companion state: ${reason}.`);
}
function number(v, label, min = 0, max = 1e12) {
  if (!Number.isFinite(v) || v < min || v > max) invalid(label);
  return v;
}
function text(v, label) {
  if (typeof v !== 'string' || !v.length || v.length > 160) invalid(label);
  return v;
}
function point(p, label = 'position') {
  if (!p || typeof p !== 'object') invalid(label);
  number(p.x, label, -1e9, 1e9);
  number(p.y, label, -1e9, 1e9);
  number(p.z ?? 0, label, -1e6, 1e6);
  if (!(scene(p) === null || typeof scene(p) === 'string')) invalid('scene');
  return { x: p.x, y: p.y, z: p.z ?? 0, sceneId: scene(p) };
}
function safeJSON(value) {
  let count = 0;
  const ancestors = new Set();
  const visit = (v, depth) => {
    if (++count > 100000 || depth > 24) invalid('JSON size');
    if (v === null || typeof v === 'boolean') return;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) invalid('nonfinite JSON');
      return;
    }
    if (typeof v === 'string') {
      if (v.length > 10000) invalid('JSON text');
      return;
    }
    if (!v || typeof v !== 'object' || ancestors.has(v)) invalid('unsafe JSON');
    if (Object.getPrototypeOf(v) !== Object.prototype && !Array.isArray(v))
      invalid('JSON prototype');
    ancestors.add(v);
    const keys = Reflect.ownKeys(v);
    for (const key of keys) {
      if (key === 'length' && Array.isArray(v)) continue;
      if (
        typeof key !== 'string' ||
        ['__proto__', 'prototype', 'constructor', 'toJSON'].includes(key)
      )
        invalid('JSON key');
      const d = Object.getOwnPropertyDescriptor(v, key);
      if (!d || !Object.hasOwn(d, 'value') || !d.enumerable) invalid('JSON accessor');
      visit(d.value, depth + 1);
    }
    if (Array.isArray(v) && (v.length > 2048 || keys.length !== v.length + 1))
      invalid('JSON array');
    ancestors.delete(v);
  };
  visit(value, 0);
}
export function initializeCompanions(state) {
  state.companions ??= {
    version: 1,
    time: Number.isFinite(state.time) ? state.time : 0,
    actors: [],
    records: [],
    events: [],
    sequence: 0,
  };
  if (state.companions.version !== 1) invalid('version');
  return state.companions;
}
export function getActor(state, id) {
  return state.companions?.actors.find((actor) => actor.id === id) ?? null;
}
function recordFor(state, id) {
  return state.companions?.records.find((record) => record.id === id) ?? null;
}
function vehicleFor(state, id) {
  return state.vehicles?.find((vehicle) => vehicle.id === id) ?? null;
}
function emit(state, kind, actorId, data = {}, context = {}) {
  const model = initializeCompanions(state),
    event = { id: ++model.sequence, time: model.time, kind, actorId, data: clone(data) };
  model.events.push(event);
  model.events = model.events.slice(-128);
  try {
    context.onEvent?.(clone(event));
  } catch {
    /* Observers cannot change physical ownership. */
  }
  return event;
}
function fail(state, record, kind, context) {
  if (record.failure?.kind === kind) return;
  record.failure = { kind, at: state.companions.time };
  if (kind === 'abandoned') record.abandonmentCount++;
  emit(state, kind, record.id, {}, context);
}
function proxyCandidates(state, actor) {
  const aliases = new Set([
    actor.id,
    actor.castId,
    ...(actor.id === 'LL-CHAR-002' ? ['felix-voss'] : []),
  ]);
  return Object.entries(state.interior?.rooms ?? {}).flatMap(([roomId, room]) =>
    (room.actors ?? [])
      .filter((proxy) => aliases.has(proxy.castId) || proxy.companionId === actor.id)
      .map((proxy) => ({ roomId, proxy })),
  );
}
function bindProxies(state, actor) {
  actor.proxyBindings ??= [];
  for (const { roomId, proxy } of proxyCandidates(state, actor)) {
    let binding = actor.proxyBindings.find((b) => b.roomId === roomId && b.proxyId === proxy.id);
    if (!binding) {
      binding = { roomId, proxyId: proxy.id, lastHealth: actor.health };
      actor.proxyBindings.push(binding);
    } else if (proxy.health < binding.lastHealth)
      actor.health = Math.max(0, actor.health - (binding.lastHealth - proxy.health));
    proxy.companionId = actor.id;
    proxy.health = actor.health;
    binding.lastHealth = actor.health;
  }
}
export function ensureNamedActor(state, definition, context = {}) {
  const model = initializeCompanions(state),
    id = text(definition?.id, 'actor id');
  const existing = getActor(state, id);
  if (existing) {
    bindProxies(state, existing);
    return existing;
  }
  if (model.actors.length >= 64) invalid('too many companions');
  safeJSON(definition);
  point(definition);
  const candidate = { ...definition, id, castId: definition.castId ?? id },
    proxy = proxyCandidates(state, candidate)[0]?.proxy;
  const physical = proxy ?? definition,
    health = number(physical.health ?? definition.health ?? 100, 'health', 0, 1000),
    maxHealth = number(
      definition.maxHealth ?? Math.max(100, health),
      'maximum health',
      health,
      1000,
    );
  const actor = {
    weapon: 'unarmed',
    ammo: { clip: 0, reserve: 0 },
    fireCooldown: 0,
    reloadRemaining: 0,
    panic: 0,
    reporting: false,
    ...clone(proxy ?? {}),
    ...clone(definition),
    ...point(physical),
    id,
    name: definition.name ?? id,
    castId: definition.castId ?? proxy?.castId ?? id,
    kind: 'companion',
    companionId: id,
    health,
    maxHealth,
    armour: number(physical.armour ?? definition.armour ?? 0, 'armour', 0, 1000),
    angle: number(physical.angle ?? definition.angle ?? 0, 'angle', -Math.PI * 4, Math.PI * 4),
    groundZ: physical.groundZ ?? physical.z ?? 0,
    speed: 0,
    radius: 7,
    inVehicle: false,
    collisionHeight: 30,
    eyeHeight: 14,
    companionPhase: health ? 'idle' : 'dead',
    vehicleId: null,
    seat: null,
    proxyBindings: [],
  };
  delete actor.scene;
  model.actors.push(actor);
  model.records.push({
    id,
    phase: health ? 'idle' : 'dead',
    order: { kind: 'idle' },
    afterExit: null,
    route: [],
    routeIndex: 0,
    routeRefresh: 0,
    routeTarget: null,
    reservedVehicleId: null,
    reservedSeat: null,
    transition: null,
    blockedSeconds: 0,
    separationSeconds: 0,
    graceSeconds: 18,
    abandonDistance: 180,
    abandonmentCount: 0,
    failure: health ? null : { kind: 'dead', at: model.time },
    lastVehicleHealth: null,
    lastVehiclePose: null,
    pursuitLevel: 0,
    scriptControlled: false,
  });
  bindProxies(state, actor);
  emit(state, 'registered', id, { sceneId: actor.sceneId, health }, context);
  return actor;
}
function specFor(vehicle, context) {
  const spec = context.specs?.[vehicle.spec];
  if (!spec) invalid('unknown vehicle specification');
  number(spec.length, 'vehicle length', 12, 100);
  number(spec.width, 'vehicle width', 8, 40);
  const capacity = number(spec.seats ?? 2, 'vehicle seats', 2, 8);
  if (!Number.isSafeInteger(capacity)) invalid('fractional vehicle seats');
  const rearRows = Math.ceil((capacity - 2) / 2);
  if (spec.width * 0.44 < 6 - EPS || (rearRows && (spec.length * 0.33) / rearRows < 6 - EPS))
    invalid('vehicle cannot physically contain its stated seats');
  return { ...spec, seats: capacity };
}
export function vehicleCapacity(vehicle, context) {
  return specFor(vehicle, context).seats;
}
function transform(vehicle, x, y, z) {
  const c = Math.cos(vehicle.angle),
    s = Math.sin(vehicle.angle);
  return {
    x: vehicle.x + x * c - y * s,
    y: vehicle.y + x * s + y * c,
    z: (vehicle.z ?? 0) + z,
    groundZ: vehicle.groundZ ?? vehicle.z ?? 0,
    angle: vehicle.angle,
    sceneId: scene(vehicle),
  };
}
export function companionSeatPose(vehicle, seat, context) {
  const spec = specFor(vehicle, context);
  if (!Number.isSafeInteger(seat) || seat < 1 || seat >= spec.seats) invalid('passenger seat');
  const row = seat === 1 ? 0 : 1 + Math.floor((seat - 2) / 2),
    side = seat === 1 ? 1 : seat % 2 === 0 ? -1 : 1,
    x =
      spec.length * 0.12 - (row ? (row * spec.length * 0.33) / Math.ceil((spec.seats - 2) / 2) : 0);
  return {
    ...transform(vehicle, x, side * spec.width * 0.22, 5),
    eyeHeight: 6,
    collisionHeight: 8,
  };
}
function doorPose(vehicle, seat, context, otherSide = false) {
  const spec = specFor(vehicle, context),
    row = seat === 1 ? 0 : 1 + Math.floor((seat - 2) / 2),
    side = (seat === 1 ? 1 : seat % 2 === 0 ? -1 : 1) * (otherSide ? -1 : 1),
    x =
      spec.length * 0.12 - (row ? (row * spec.length * 0.33) / Math.ceil((spec.seats - 2) / 2) : 0);
  return {
    ...transform(vehicle, x, side * (spec.width / 2 + 9), 0),
    eyeHeight: 14,
    collisionHeight: 30,
  };
}
export function getSeat(state, id) {
  const actor = getActor(state, id);
  const vehicle = actor?.vehicleId ? vehicleFor(state, actor.vehicleId) : null;
  if (
    !actor?.vehicleId ||
    !vehicle ||
    actor.seat === null ||
    recordFor(state, id)?.phase === 'exiting' ||
    scene(actor) !== scene(vehicle)
  )
    return null;
  return {
    actorId: id,
    vehicleId: actor.vehicleId,
    seat: actor.seat,
    pose: { ...point(actor), groundZ: actor.groundZ, angle: actor.angle },
    alive: actor.health > 0,
  };
}
export function vehicleOccupants(state, vehicleId) {
  return (state.companions?.actors ?? [])
    .filter((actor) => actor.vehicleId === vehicleId)
    .map((actor) => getSeat(state, actor.id))
    .filter(Boolean)
    .sort((a, b) => a.seat - b.seat);
}
function syncSeats(state) {
  for (const actor of state.companions?.actors ?? [])
    actor.companionPhase = recordFor(state, actor.id).phase;
  for (const vehicle of state.vehicles ?? []) {
    vehicle.companionSeats = (state.companions?.records ?? [])
      .flatMap((record) => {
        const actor = getActor(state, record.id);
        if (actor.vehicleId === vehicle.id)
          return [{ actorId: actor.id, seat: actor.seat, status: 'occupied' }];
        return record.reservedVehicleId === vehicle.id
          ? [{ actorId: actor.id, seat: record.reservedSeat, status: 'reserved' }]
          : [];
      })
      .sort((a, b) => a.seat - b.seat);
    vehicle.companionOccupied = vehicle.companionSeats.length > 0;
  }
}
function sameIntent(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function setOrder(state, record, order, context, { preserveFailure = false } = {}) {
  if (sameIntent(record.order, order)) return false;
  record.order = clone(order);
  record.route = [];
  record.routeIndex = 0;
  record.routeRefresh = 0;
  record.routeTarget = null;
  record.blockedSeconds = 0;
  record.separationSeconds = 0;
  if (!preserveFailure) record.failure = null;
  emit(state, 'ordered', record.id, { kind: order.kind }, context);
  return true;
}
function releaseReservation(record) {
  record.reservedVehicleId = null;
  record.reservedSeat = null;
}
export function requestBoard(state, id, vehicleId, context = {}) {
  initializeCompanions(state);
  const actor = getActor(state, id),
    record = recordFor(state, id),
    vehicle = vehicleFor(state, vehicleId);
  if (!actor || !record) return { ok: false, reason: 'missing-actor' };
  if (actor.health <= 0) return { ok: false, reason: 'dead' };
  if (!vehicle || vehicle.health <= 0) return { ok: false, reason: 'vehicle-unavailable' };
  if (vehicle.policeControlled) return { ok: false, reason: 'police-owned' };
  if (actor.vehicleId === vehicleId) return { ok: true, seated: true, seat: actor.seat };
  if (actor.vehicleId) return { ok: false, reason: 'already-seated' };
  if (record.transition) return { ok: false, reason: 'boarding-in-progress' };
  if (record.reservedVehicleId === vehicleId && record.order.kind === 'board')
    return { ok: true, seated: false, seat: record.reservedSeat };
  const spec = specFor(vehicle, context),
    owned = new Set(
      (vehicle.companionSeats ?? []).filter((s) => s.actorId !== id).map((s) => s.seat),
    );
  for (const external of context.externalSeatOwners?.(vehicle, state) ?? [])
    owned.add(external.seat);
  const seat = Array.from({ length: spec.seats - 1 }, (_, i) => i + 1).find((i) => !owned.has(i));
  if (!seat) return { ok: false, reason: 'full' };
  releaseReservation(record);
  record.reservedVehicleId = vehicleId;
  record.reservedSeat = seat;
  record.transition = null;
  record.phase = 'approaching';
  setOrder(state, record, { kind: 'board', vehicleId }, context);
  syncSeats(state);
  return { ok: true, seated: false, seat };
}
export function requestExit(state, id, context = {}) {
  const actor = getActor(state, id),
    record = recordFor(state, id);
  if (!actor || !record) return { ok: false, reason: 'missing-actor' };
  if (actor.health <= 0) return { ok: false, reason: 'dead' };
  if (record.order.kind === 'exit' && record.transition) return { ok: true, seated: false };
  if (!actor.vehicleId && record.transition && record.reservedVehicleId) {
    record.transition = null;
    setOrder(state, record, { kind: 'exit' }, context, { preserveFailure: true });
    record.phase = 'waiting-exit';
    syncSeats(state);
    return { ok: true, seated: false };
  }
  if (!actor.vehicleId) {
    releaseReservation(record);
    record.transition = null;
    record.phase = 'idle';
    setOrder(state, record, { kind: 'idle' }, context);
    syncSeats(state);
    return { ok: true, seated: false };
  }
  setOrder(state, record, { kind: 'exit' }, context, { preserveFailure: true });
  record.phase = 'waiting-exit';
  syncSeats(state);
  return { ok: true, seated: true };
}
export function requestEscort(state, id, target, context = {}) {
  const actor = getActor(state, id),
    record = recordFor(state, id);
  if (!actor || !record) return { ok: false, reason: 'missing-actor' };
  if (actor.health <= 0) return { ok: false, reason: 'dead' };
  point(target, 'escort target');
  const order = {
    kind: 'escort',
    target: { ...point(target), radius: number(target.radius ?? 8, 'arrival radius', 1, 40) },
  };
  if (actor.vehicleId || (record.transition && record.reservedVehicleId)) {
    if (!sameIntent(record.afterExit, order)) {
      record.afterExit = order;
      requestExit(state, id, context);
    }
    return { ok: true, seated: true };
  }
  releaseReservation(record);
  record.transition = null;
  if (setOrder(state, record, order, context)) record.phase = 'following';
  syncSeats(state);
  return { ok: true, seated: false };
}
export function followCompanion(state, id, targetId = 'player', context = {}) {
  const actor = getActor(state, id),
    record = recordFor(state, id);
  if (!actor || !record) return { ok: false, reason: 'missing-actor' };
  if (actor.health <= 0) return { ok: false, reason: 'dead' };
  const order = { kind: 'follow', targetId: text(targetId, 'follow target') };
  if (actor.vehicleId || (record.transition && record.reservedVehicleId)) {
    record.afterExit = order;
    if (!actor.vehicleId) requestExit(state, id, context);
    return { ok: true, seated: true };
  }
  releaseReservation(record);
  record.transition = null;
  if (setOrder(state, record, order, context)) record.phase = 'following';
  syncSeats(state);
  return { ok: true, seated: false };
}
/** Explicit rejoin clears a failed order only after the leader physically returns. */
export function rejoinCompanion(state, id, context = {}) {
  const actor = getActor(state, id),
    record = recordFor(state, id);
  if (!actor || !record) return { ok: false, reason: 'missing-actor' };
  if (actor.health <= 0) return { ok: false, reason: 'dead' };
  const leader = state.player;
  if (
    !leader ||
    scene(actor) !== scene(leader) ||
    distance(actor, leader) > 100 ||
    !context.hasLineOfSight(actor, leader, scene(actor))
  )
    return { ok: false, reason: 'leader-out-of-reach' };
  const order = clone(record.order);
  record.failure = null;
  record.blockedSeconds = 0;
  record.separationSeconds = 0;
  record.transition = null;
  record.route = [];
  record.routeIndex = 0;
  record.routeRefresh = 0;
  record.phase = 'idle';
  record.order = { kind: 'idle' };
  emit(state, 'rejoined', id, {}, context);
  if (order.kind === 'board') return requestBoard(state, id, order.vehicleId, context);
  setOrder(state, record, order, context);
  record.phase = order.kind === 'idle' ? 'idle' : 'following';
  syncSeats(state);
  return { ok: true, seated: Boolean(getSeat(state, id)) };
}
function resolveTarget(state, id, context) {
  return id === 'player'
    ? state.player
    : (getActor(state, id) ?? context.resolveActor?.(id, state));
}
function checks(context) {
  if (
    ['moveBody', 'isBlocked', 'hasLineOfSight', 'surfaceHeight'].some(
      (key) => typeof context[key] !== 'function',
    )
  )
    invalid('physical movement context');
}
function clear(context, actor, target, vehicleId = null, radius = 7) {
  return (
    !context.isBlocked(target.x, target.y, radius, target.z, scene(target), {
      ignoreVehicleId: vehicleId,
      ignoreActorId: actor.id,
    }) &&
    context.hasLineOfSight(
      actor,
      { ...target, health: actor.health, eyeHeight: target.eyeHeight ?? actor.eyeHeight ?? 14 },
      scene(actor),
      {
        ignoreVehicleId: vehicleId,
        ignoreActorId: actor.id,
      },
    )
  );
}
function move(state, actor, dx, dy, context, options = {}) {
  const before = { ...point(actor), groundZ: actor.groundZ, angle: actor.angle },
    amount = Math.hypot(dx, dy);
  try {
    context.moveBody(actor, dx, dy, options.radius ?? 7, options);
    point(actor);
    if (
      scene(actor) !== before.sceneId ||
      distance(actor, before) > amount + EPS ||
      Math.abs((actor.z ?? 0) - before.z) > 6 + EPS
    )
      invalid('movement callback teleported actor');
  } catch (error) {
    Object.assign(actor, before);
    delete actor.scene;
    throw error;
  }
  if (distance(actor, before) > EPS)
    actor.angle = Math.atan2(actor.y - before.y, actor.x - before.x);
  actor.speed = distance(actor, before) / (options.dt ?? 0.05);
  return distance(actor, before);
}
function routeTo(
  state,
  actor,
  record,
  target,
  context,
  dt,
  { radius = 8, vehicleId = null, speed = 52 } = {},
) {
  const sameScene = scene(actor) === scene(target);
  record.routeRefresh = Math.max(0, record.routeRefresh - dt);
  const changed =
    !record.routeTarget ||
    scene(record.routeTarget) !== scene(target) ||
    distance(record.routeTarget, target) > 8 ||
    Math.abs(record.routeTarget.z - target.z) > 3;
  if (
    !record.route.length ||
    record.routeIndex >= record.route.length ||
    (record.routeRefresh <= 0 && (changed || record.blockedSeconds > 0.5))
  ) {
    let route = context.findRoute?.(actor, clone(target), state);
    if (
      route === undefined &&
      sameScene &&
      context.hasLineOfSight(actor, { ...target, health: actor.health }, scene(actor), {
        ignoreVehicleId: vehicleId,
      })
    )
      route = [target];
    if (Array.isArray(route) && route.length <= 1024) {
      record.route = clone(route);
      record.route.forEach((node) => point(node, 'route node'));
      record.routeIndex = 0;
    } else record.route = [];
    record.routeTarget = point(target);
    record.routeRefresh = 0.75;
  }
  if (sameScene && distance(actor, target) <= radius + EPS && Math.abs(actor.z - target.z) <= 3)
    return { arrived: true, moved: 0 };
  const node = record.route[record.routeIndex];
  if (!node || scene(node) !== scene(actor)) return { arrived: false, moved: 0 };
  const reach = node.portal
    ? number(node.portal.radius ?? 12, 'portal radius', 1, 28)
    : record.routeIndex === record.route.length - 1
      ? radius
      : 2;
  if (distance(actor, node) <= reach + EPS && Math.abs(actor.z - node.z) <= 6) {
    if (node.portal) {
      const before = { ...point(actor), groundZ: actor.groundZ, angle: actor.angle };
      if (typeof context.transitionScene !== 'function') return { arrived: false, moved: 0 };
      let approved;
      try {
        approved = context.transitionScene(actor, clone(node.portal), state);
      } catch (error) {
        Object.assign(actor, before);
        delete actor.scene;
        throw error;
      }
      if (approved !== true) {
        Object.assign(actor, before);
        delete actor.scene;
        return { arrived: false, moved: 0 };
      }
      const to = point(node.portal.to, 'portal destination');
      if (
        scene(actor) !== to.sceneId ||
        distance(actor, to) > EPS ||
        Math.abs(actor.z - to.z) > EPS
      ) {
        Object.assign(actor, before);
        delete actor.scene;
        invalid('unauthorized portal transform');
      }
      actor.sceneId = to.sceneId;
      delete actor.scene;
      emit(
        state,
        'scene-entered',
        actor.id,
        { portalId: node.portal.id, from: before.sceneId, to: to.sceneId },
        context,
      );
    }
    record.routeIndex++;
    if (node.portal) record.routeRefresh = 0;
    return { arrived: false, moved: 0 };
  }
  const amount = Math.min(speed * dt, Math.max(0, distance(actor, node) - reach)),
    dx = ((node.x - actor.x) / distance(actor, node)) * amount,
    dy = ((node.y - actor.y) / distance(actor, node)) * amount;
  return {
    arrived: false,
    moved: move(state, actor, dx, dy, context, {
      ignoreVehicleId: vehicleId,
      phase: record.phase,
      dt,
    }),
  };
}
function seatedSync(state, actor, record, vehicle, context) {
  const pose = companionSeatPose(vehicle, actor.seat, context);
  if (
    scene(actor) !== pose.sceneId &&
    context.canRideSceneTransition?.(actor, vehicle, record.lastVehiclePose, state) !== true
  ) {
    fail(state, record, 'scene-transition-denied', context);
    return false;
  }
  Object.assign(actor, pose, {
    radius: 3,
    inVehicle: true,
    collisionHeight: 8,
    eyeHeight: 6,
    speed: Math.abs(vehicle.speed ?? 0),
  });
  record.lastVehiclePose = { ...point(vehicle), angle: vehicle.angle };
  return true;
}
function transition(state, actor, record, vehicle, context, dt, exiting) {
  const seat = actor.seat ?? record.reservedSeat,
    target = exiting ? record.transition.to : companionSeatPose(vehicle, seat, context);
  if (Math.abs(vehicle.speed ?? 0) > 8) {
    record.blockedSeconds += dt;
    return false;
  }
  const t = record.transition,
    used = Math.min(dt, 0.8 - t.elapsed),
    ratio = clamp((t.elapsed + used) / 0.8, 0, 1),
    next = {
      x: t.from.x + (target.x - t.from.x) * ratio,
      y: t.from.y + (target.y - t.from.y) * ratio,
      z: t.from.z + (target.z - t.from.z) * ratio,
      sceneId: scene(actor),
    };
  t.to = { ...point(target) };
  const fromRadius = t.fromRadius ?? (exiting ? 3 : 7),
    fromHeight = t.fromHeight ?? (exiting ? 8 : 30),
    fromEye = t.fromEye ?? (exiting ? 6 : 14);
  const radius = fromRadius + ((exiting ? 7 : 3) - fromRadius) * ratio;
  if (!clear(context, actor, next, vehicle.id, radius)) {
    record.blockedSeconds += dt;
    return false;
  }
  const amount = Math.hypot(next.x - actor.x, next.y - actor.y);
  if (amount > 52 * used + EPS) {
    record.blockedSeconds += dt;
    return false;
  }
  const moved = move(state, actor, next.x - actor.x, next.y - actor.y, context, {
    ignoreVehicleId: vehicle.id,
    phase: exiting ? 'exiting' : 'boarding',
    radius,
    dt: used,
  });
  if (moved + EPS < amount) {
    record.blockedSeconds += dt;
    return false;
  }
  actor.z = next.z;
  actor.groundZ = vehicle.groundZ ?? vehicle.z ?? 0;
  actor.radius = radius;
  actor.collisionHeight = fromHeight + ((exiting ? 30 : 8) - fromHeight) * ratio;
  actor.eyeHeight = fromEye + ((exiting ? 14 : 6) - fromEye) * ratio;
  t.elapsed += used;
  if (t.elapsed < 0.8 - EPS) return false;
  record.transition = null;
  record.blockedSeconds = 0;
  if (exiting) {
    actor.vehicleId = null;
    actor.seat = null;
    actor.radius = 7;
    actor.inVehicle = false;
    actor.collisionHeight = 30;
    actor.eyeHeight = 14;
    actor.groundZ = target.z;
    actor.z = target.z;
    record.phase = 'idle';
    record.lastVehicleHealth = null;
    record.lastVehiclePose = null;
    releaseReservation(record);
    emit(state, 'exited', actor.id, { vehicleId: vehicle.id, seat }, context);
    const after = record.afterExit;
    record.afterExit = null;
    setOrder(state, record, after ?? { kind: 'idle' }, context, { preserveFailure: true });
    if (after) record.phase = 'following';
  } else {
    actor.vehicleId = vehicle.id;
    actor.seat = record.reservedSeat;
    releaseReservation(record);
    record.phase = 'seated';
    record.lastVehicleHealth = vehicle.health;
    if (record.phase !== 'exiting') seatedSync(state, actor, record, vehicle, context);
    emit(state, 'boarded', actor.id, { vehicleId: vehicle.id, seat: actor.seat }, context);
  }
  syncSeats(state);
  return true;
}
/** Optional damageActor(draft, amount, {cause,actorId}) resolves health/armour
 * synchronously. World effects belong in onEvent after the life change commits. */
export function damageCompanion(state, id, amount, cause = 'damage', context = {}) {
  const actor = getActor(state, id),
    record = recordFor(state, id);
  if (!actor || actor.health <= 0) return 0;
  number(amount, 'damage', 0, 10000);
  const before = actor.health;
  if (typeof context.damageActor === 'function') {
    if (resolvingDamage.has(actor)) invalid('recursive damage resolver');
    const armour = actor.armour;
    const draft = clone(actor);
    resolvingDamage.add(actor);
    try {
      const result = context.damageActor(draft, amount, { cause, actorId: actor.id });
      if (result && typeof result.then === 'function') invalid('async damage resolver');
      number(draft.health, 'resolved health', 0, before);
      number(draft.armour, 'resolved armour', 0, 1000);
      actor.health = draft.health;
      actor.armour = draft.armour;
    } catch (error) {
      actor.health = before;
      actor.armour = armour;
      throw error;
    } finally {
      resolvingDamage.delete(actor);
    }
  } else {
    const absorbed = Math.min(actor.armour ?? 0, amount * 0.55);
    actor.armour -= absorbed;
    actor.health = Math.max(0, actor.health - (amount - absorbed));
  }
  bindProxies(state, actor);
  emit(state, 'damaged', id, { amount: before - actor.health, cause }, context);
  if (!actor.health) {
    record.phase = 'dead';
    record.transition = null;
    if (!actor.vehicleId) releaseReservation(record);
    fail(state, record, 'dead', context);
    syncSeats(state);
  }
  return before - actor.health;
}
export function applyVehicleImpact(state, vehicleId, amount, context = {}, cause = 'collision') {
  number(amount, 'vehicle impact', 0, 10000);
  const vehicle = vehicleFor(state, vehicleId);
  if (!vehicle) return 0;
  let damaged = 0;
  for (const record of state.companions?.records ?? []) {
    const actor = getActor(state, record.id);
    if (
      actor.vehicleId === vehicleId ||
      (record.reservedVehicleId === vehicleId && record.phase === 'boarding')
    ) {
      damaged += damageCompanion(state, actor.id, amount * 0.55, cause, context);
      record.lastVehicleHealth = vehicle.health;
    }
  }
  return damaged;
}
function tickActor(state, actor, record, dt, context) {
  bindProxies(state, actor);
  if (actor.health <= 0) {
    if (record.phase !== 'dead') {
      record.phase = 'dead';
      record.transition = null;
      if (!actor.vehicleId) releaseReservation(record);
      fail(state, record, 'dead', context);
    }
    if (actor.vehicleId) {
      const v = vehicleFor(state, actor.vehicleId);
      if (v) seatedSync(state, actor, record, v, context);
    }
    return;
  }
  if (record.phase === 'dead') invalid('dead actor revived');
  record.scriptControlled = Boolean(
    actor.scriptControlled || context.isScriptControlled?.(actor, state),
  );
  if (!actor.vehicleId && !record.transition && !record.scriptControlled) actor.speed = 0;
  const wanted = clamp(state.wanted?.level ?? 0, 0, 6);
  if (wanted !== record.pursuitLevel) {
    record.pursuitLevel = wanted;
    if (wanted) emit(state, 'pursuit', actor.id, { level: wanted }, context);
  }
  if (record.scriptControlled && !actor.vehicleId) return;
  if (actor.vehicleId) {
    const vehicle = vehicleFor(state, actor.vehicleId);
    if (!vehicle) {
      fail(state, record, 'vehicle-missing', context);
      return;
    }
    if (record.lastVehicleHealth !== null && vehicle.health < record.lastVehicleHealth)
      applyVehicleImpact(state, vehicle.id, record.lastVehicleHealth - vehicle.health, context);
    record.lastVehicleHealth = vehicle.health;
    if (actor.health <= 0) return;
    if (record.phase !== 'exiting') seatedSync(state, actor, record, vehicle, context);
    if (vehicle.health <= 0) {
      fail(state, record, 'vehicle-destroyed', context);
      if (record.order.kind !== 'exit') requestExit(state, actor.id, context);
    }
    const follow =
      record.order.kind === 'follow'
        ? record.order
        : record.afterExit?.kind === 'follow'
          ? record.afterExit
          : null;
    if (follow) {
      const target = resolveTarget(state, follow.targetId, context);
      if (target && !target.vehicleId) requestExit(state, actor.id, context);
    }
    if (record.order.kind !== 'exit') return;
    if (record.transition) {
      record.phase = 'exiting';
      transition(state, actor, record, vehicle, context, dt, true);
      return;
    }
    if (Math.abs(vehicle.speed ?? 0) > 8) {
      record.blockedSeconds += dt;
      return;
    }
    let door = null;
    for (const otherSide of [false, true]) {
      const candidate = doorPose(vehicle, actor.seat, context, otherSide);
      const floor = context.surfaceHeight(
        candidate.x,
        candidate.y,
        vehicle.groundZ ?? vehicle.z ?? 0,
        candidate.sceneId,
      );
      if (Math.abs(floor - (vehicle.groundZ ?? vehicle.z ?? 0)) > 6) continue;
      candidate.z = floor;
      if (clear(context, actor, candidate, vehicle.id)) {
        door = candidate;
        break;
      }
    }
    if (!door) {
      record.blockedSeconds += dt;
      return;
    }
    record.transition = {
      from: { ...point(actor) },
      to: { ...point(door) },
      elapsed: 0,
      vehicleId: vehicle.id,
      seat: actor.seat,
      vehiclePose: { ...point(vehicle), angle: vehicle.angle },
      fromRadius: actor.radius,
      fromHeight: actor.collisionHeight,
      fromEye: actor.eyeHeight,
    };
    record.phase = 'exiting';
    transition(state, actor, record, vehicle, context, dt, true);
    return;
  }
  if (record.order.kind === 'idle') return;
  if (record.phase === 'abandoned') return;
  if (record.order.kind === 'exit' && record.reservedVehicleId) {
    const vehicle = vehicleFor(state, record.reservedVehicleId);
    if (!vehicle) {
      record.blockedSeconds += dt;
      return;
    }
    if (record.transition) {
      record.phase = 'exiting';
      transition(state, actor, record, vehicle, context, dt, true);
      return;
    }
    if (Math.abs(vehicle.speed ?? 0) > 8) {
      record.blockedSeconds += dt;
      return;
    }
    let door = null;
    for (const otherSide of [false, true]) {
      const candidate = doorPose(vehicle, record.reservedSeat, context, otherSide),
        floor = context.surfaceHeight(
          candidate.x,
          candidate.y,
          vehicle.groundZ ?? vehicle.z ?? 0,
          candidate.sceneId,
        );
      if (Math.abs(floor - (vehicle.groundZ ?? vehicle.z ?? 0)) > 6) continue;
      candidate.z = floor;
      if (clear(context, actor, candidate, vehicle.id)) {
        door = candidate;
        break;
      }
    }
    if (!door) {
      record.blockedSeconds += dt;
      return;
    }
    record.transition = {
      from: point(actor),
      to: point(door),
      elapsed: 0,
      vehicleId: vehicle.id,
      seat: record.reservedSeat,
      vehiclePose: { ...point(vehicle), angle: vehicle.angle },
      fromRadius: actor.radius,
      fromHeight: actor.collisionHeight,
      fromEye: actor.eyeHeight,
    };
    record.phase = 'exiting';
    transition(state, actor, record, vehicle, context, dt, true);
    return;
  }
  let target,
    vehicle = null,
    radius = 8;
  if (record.order.kind === 'board') {
    vehicle = vehicleFor(state, record.order.vehicleId);
    if (!vehicle || vehicle.health <= 0) {
      record.blockedSeconds += dt;
      return;
    }
    target = doorPose(vehicle, record.reservedSeat, context);
    radius = 1;
    if (record.transition) {
      transition(state, actor, record, vehicle, context, dt, false);
      return;
    }
  } else if (record.order.kind === 'escort') {
    target = record.order.target;
    radius = target.radius;
  } else if (record.order.kind === 'follow') {
    const followed = resolveTarget(state, record.order.targetId, context);
    if (!followed || followed.health <= 0) {
      record.blockedSeconds += dt;
      return;
    }
    if (followed.vehicleId) {
      const followTarget = record.order.targetId;
      const result = requestBoard(state, actor.id, followed.vehicleId, context);
      if (result.ok) {
        record.afterExit = { kind: 'follow', targetId: followTarget };
        return;
      }
    }
    target = { ...point(followed) };
    radius = 25;
  } else return;
  if (scene(actor) !== scene(target) || distance(actor, target) > record.abandonDistance)
    record.separationSeconds += dt;
  else record.separationSeconds = 0;
  const progress = routeTo(state, actor, record, target, context, dt, {
    radius,
    vehicleId: vehicle?.id,
  });
  if (progress.moved > EPS) record.blockedSeconds = 0;
  else if (!progress.arrived) record.blockedSeconds += dt;
  if (progress.arrived) {
    if (vehicle) {
      if (Math.abs(vehicle.speed ?? 0) > 8) {
        record.blockedSeconds += dt;
        return;
      }
      const to = companionSeatPose(vehicle, record.reservedSeat, context);
      if (!clear(context, actor, to, vehicle.id)) {
        record.blockedSeconds += dt;
        return;
      }
      record.phase = 'boarding';
      record.blockedSeconds = 0;
      record.transition = {
        from: { ...point(actor) },
        to: { ...point(to) },
        elapsed: 0,
        vehicleId: vehicle.id,
        seat: record.reservedSeat,
        vehiclePose: { ...point(vehicle), angle: vehicle.angle },
        fromRadius: actor.radius,
        fromHeight: actor.collisionHeight,
        fromEye: actor.eyeHeight,
      };
    } else if (record.order.kind === 'escort' && record.phase !== 'arrived') {
      record.blockedSeconds = 0;
      record.phase = 'arrived';
      emit(state, 'arrived', actor.id, { target: record.order.target }, context);
    }
  }
}
export function updateCompanions(state, dt, context = {}) {
  number(dt, 'elapsed time', 0, 10);
  const model = initializeCompanions(state);
  checks(context);
  const steps = Math.max(1, Math.ceil(dt / 0.05)),
    step = dt / steps;
  for (let i = 0; i < steps; i++) {
    model.time += step;
    for (const actor of [...model.actors].sort((a, b) => a.id.localeCompare(b.id))) {
      const record = recordFor(state, actor.id);
      tickActor(state, actor, record, step, context);
      if (
        actor.health > 0 &&
        (record.blockedSeconds >= record.graceSeconds ||
          record.separationSeconds >= record.graceSeconds)
      ) {
        fail(state, record, 'abandoned', context);
        if (!actor.vehicleId) {
          record.phase = 'abandoned';
          record.transition = null;
          releaseReservation(record);
        }
      }
    }
    syncSeats(state);
  }
  return model;
}
export function companionObservation(state, id) {
  const actor = getActor(state, id),
    record = recordFor(state, id);
  if (!actor || !record) return null;
  return {
    id,
    alive: actor.health > 0,
    health: actor.health,
    phase: actor.health > 0 ? record.phase : 'dead',
    ...point(actor),
    seated: Boolean(getSeat(state, id)),
    vehicleId: actor.vehicleId,
    seat: actor.seat,
    reservedVehicleId: record.reservedVehicleId,
    reservedSeat: record.reservedSeat,
    arrived: record.phase === 'arrived',
    blockedSeconds: record.blockedSeconds,
    separationSeconds: record.separationSeconds,
    abandoned: record.failure?.kind === 'abandoned',
    failure: clone(record.failure),
    pursuitLevel: record.pursuitLevel,
    scriptControlled: record.scriptControlled,
  };
}
export function visibleCompanions(state, sceneId = null) {
  return (state.companions?.actors ?? [])
    .filter((actor) => scene(actor) === sceneId)
    .map((actor) => ({
      ...actor,
      seated: Boolean(getSeat(state, actor.id)),
      alive: actor.health > 0,
      phase: companionObservation(state, actor.id).phase,
      collisionRadius: actor.vehicleId ? 3 : 7,
    }));
}

function validateOrder(order, context, after = false) {
  if (
    !order ||
    typeof order !== 'object' ||
    !['idle', 'board', 'exit', 'follow', 'escort'].includes(order.kind)
  )
    invalid('order');
  if (after && !['idle', 'follow', 'escort'].includes(order.kind)) invalid('exit continuation');
  if (order.kind === 'board') text(order.vehicleId, 'boarding vehicle');
  if (order.kind === 'follow') text(order.targetId, 'follow target');
  if (order.kind === 'escort') {
    point(order.target, 'escort target');
    number(order.target.radius, 'arrival radius', 1, 40);
    if (context.sceneExists && context.sceneExists(scene(order.target)) !== true)
      invalid('unknown target scene');
  }
}

export function validateCompanions(state, context = {}) {
  const model = state.companions;
  if (!model) return true;
  safeJSON(model);
  if (
    model.version !== 1 ||
    !Array.isArray(model.actors) ||
    !Array.isArray(model.records) ||
    model.actors.length > 64 ||
    model.records.length !== model.actors.length
  )
    invalid('registry');
  number(model.time, 'clock');
  number(model.sequence, 'event sequence');
  if (!Number.isSafeInteger(model.sequence)) invalid('event sequence');
  const ids = new Set(),
    owners = new Set();
  const vehicleIDs = new Set();
  for (const vehicle of state.vehicles ?? []) {
    text(vehicle.id, 'vehicle id');
    if (vehicleIDs.has(vehicle.id)) invalid('duplicate vehicle');
    vehicleIDs.add(vehicle.id);
  }
  for (const actor of model.actors) {
    text(actor.id, 'actor id');
    if (ids.has(actor.id)) invalid('duplicate actor');
    ids.add(actor.id);
    point(actor);
    text(actor.name, 'actor name');
    number(actor.maxHealth, 'maximum health', 1, 1000);
    number(actor.health, 'health', 0, actor.maxHealth);
    number(actor.armour, 'armour', 0, 1000);
    number(actor.angle, 'angle', -Math.PI * 4, Math.PI * 4);
    number(actor.groundZ, 'ground height', -1e6, 1e6);
    number(actor.radius, 'body radius', 3, 7);
    number(actor.collisionHeight, 'body height', 8, 30);
    number(actor.eyeHeight, 'eye height', 6, 14);
    number(actor.speed, 'body speed', 0, 1000);
    if (typeof actor.inVehicle !== 'boolean' || actor.companionId !== actor.id)
      invalid('body ownership');
    text(actor.weapon, 'weapon');
    if (!actor.ammo || typeof actor.ammo !== 'object') invalid('ammunition');
    number(actor.ammo.clip, 'clip', 0, 1e6);
    number(actor.ammo.reserve, 'reserve', 0, 1e6);
    if (!Array.isArray(actor.proxyBindings) || actor.proxyBindings.length > 64)
      invalid('proxy bindings');
    const proxyIDs = new Set();
    for (const binding of actor.proxyBindings) {
      text(binding.roomId, 'proxy room');
      text(binding.proxyId, 'proxy id');
      const key = `${binding.roomId}:${binding.proxyId}`;
      if (proxyIDs.has(key)) invalid('duplicate proxy');
      proxyIDs.add(key);
      number(binding.lastHealth, 'proxy health', 0, actor.maxHealth);
      const proxy = state.interior?.rooms?.[binding.roomId]?.actors?.find(
        (p) => p.id === binding.proxyId,
      );
      if (!proxy || proxy.companionId !== actor.id) invalid('proxy ownership');
      number(proxy.health, 'proxy life', 0, 1000);
      if (proxy.health > binding.lastHealth + EPS || actor.health > binding.lastHealth + EPS)
        invalid('proxy life reference');
    }
    if (context.sceneExists && context.sceneExists(scene(actor)) !== true) invalid('unknown scene');
    const record = recordFor(state, actor.id);
    if (!record) invalid('missing order');
    if (
      ![
        'idle',
        'approaching',
        'boarding',
        'seated',
        'waiting-exit',
        'exiting',
        'following',
        'arrived',
        'abandoned',
        'dead',
      ].includes(record.phase)
    )
      invalid('phase');
    validateOrder(record.order, context);
    if (record.afterExit !== null) validateOrder(record.afterExit, context, true);
    if (actor.companionPhase !== record.phase) invalid('body phase');
    number(record.blockedSeconds, 'blocked timer', 0, 1e9);
    number(record.separationSeconds, 'separation timer', 0, 1e9);
    number(record.graceSeconds, 'failure grace', 1, 300);
    number(record.abandonDistance, 'abandon distance', 30, 10000);
    number(record.abandonmentCount, 'abandonment count', 0, 1e9);
    if (!Number.isSafeInteger(record.abandonmentCount)) invalid('abandonment count');
    number(record.routeRefresh, 'route refresh', -1, 1);
    number(record.pursuitLevel, 'pursuit', 0, 6);
    if (typeof record.scriptControlled !== 'boolean') invalid('script control');
    if (record.failure) {
      if (
        ![
          'dead',
          'abandoned',
          'vehicle-missing',
          'vehicle-destroyed',
          'scene-transition-denied',
        ].includes(record.failure.kind)
      )
        invalid('failure kind');
      number(record.failure.at, 'failure time', 0, model.time);
    }
    if ((record.phase === 'dead' || record.failure?.kind === 'dead') && actor.health > 0)
      invalid('revived dead actor');
    if (
      !Array.isArray(record.route) ||
      record.route.length > 1024 ||
      !Number.isSafeInteger(record.routeIndex) ||
      record.routeIndex < 0 ||
      record.routeIndex > record.route.length
    )
      invalid('route');
    if (record.routeTarget !== null) point(record.routeTarget, 'route target');
    for (const node of record.route) {
      point(node, 'route');
      if (context.sceneExists && context.sceneExists(scene(node)) !== true)
        invalid('unknown route scene');
      if (node.portal) {
        text(node.portal.id, 'portal id');
        point(node.portal.to, 'portal target');
        number(node.portal.radius ?? 12, 'portal radius', 1, 28);
        if (scene(node.portal.to) === scene(node)) invalid('portal scene');
        if (context.sceneExists && context.sceneExists(scene(node.portal.to)) !== true)
          invalid('unknown portal scene');
      }
    }
    if (actor.vehicleId) {
      const vehicle = vehicleFor(state, actor.vehicleId);
      if (!vehicle) invalid('missing occupied vehicle');
      const pose = companionSeatPose(vehicle, actor.seat, context);
      const key = `${vehicle.id}:${actor.seat}`;
      if (owners.has(key)) invalid('duplicate seat');
      owners.add(key);
      if (scene(actor) !== scene(vehicle)) invalid('occupied scene');
      if (!actor.inVehicle) invalid('occupied body');
      if (
        record.phase !== 'exiting' &&
        (distance(actor, pose) > EPS || Math.abs(actor.z - pose.z) > EPS)
      )
        invalid('seat pose');
      if (
        record.phase !== 'exiting' &&
        (Math.abs(actor.groundZ - pose.groundZ) > EPS ||
          Math.abs(actor.radius - 3) > EPS ||
          Math.abs(actor.collisionHeight - 8) > EPS ||
          Math.abs(actor.eyeHeight - 6) > EPS ||
          Math.abs(
            Math.atan2(Math.sin(actor.angle - pose.angle), Math.cos(actor.angle - pose.angle)),
          ) > EPS)
      )
        invalid('seated body');
      if (record.reservedVehicleId !== null || record.reservedSeat !== null)
        invalid('occupied reservation');
      number(record.lastVehicleHealth, 'vehicle health reference', 0, 1e6);
      point(record.lastVehiclePose, 'last vehicle pose');
      number(record.lastVehiclePose.angle, 'last vehicle heading', -Math.PI * 4, Math.PI * 4);
      if (record.order.kind === 'board' && record.order.vehicleId !== vehicle.id)
        invalid('occupied order');
    } else if (actor.seat !== null || actor.inVehicle) invalid('seat without vehicle');
    if (record.reservedVehicleId !== null) {
      const vehicle = vehicleFor(state, record.reservedVehicleId);
      if (!vehicle || actor.vehicleId || !['board', 'exit'].includes(record.order.kind))
        invalid('reservation');
      if (record.order.kind === 'board' && record.order.vehicleId !== vehicle.id)
        invalid('reserved order');
      companionSeatPose(vehicle, record.reservedSeat, context);
      const key = `${vehicle.id}:${record.reservedSeat}`;
      if (owners.has(key)) invalid('duplicate reserved seat');
      owners.add(key);
    } else if (record.reservedSeat !== null) invalid('seat reservation');
    if (record.transition) {
      point(record.transition.from, 'transition');
      point(record.transition.to, 'transition');
      number(record.transition.elapsed, 'transition time', 0, 0.8);
      if (!['boarding', 'exiting'].includes(record.phase)) invalid('transition phase');
      const transition = record.transition,
        vehicle = vehicleFor(state, transition.vehicleId);
      if (
        !vehicle ||
        transition.vehicleId !== (actor.vehicleId ?? record.reservedVehicleId) ||
        transition.seat !== (actor.seat ?? record.reservedSeat)
      )
        invalid('transition ownership');
      point(transition.vehiclePose, 'transition vehicle');
      number(transition.vehiclePose.angle, 'transition heading', -Math.PI * 4, Math.PI * 4);
      number(transition.fromRadius, 'starting radius', 3, 7);
      number(transition.fromHeight, 'starting height', 8, 30);
      number(transition.fromEye, 'starting eye', 6, 14);
      if (
        scene(transition.from) !== scene(actor) ||
        scene(transition.to) !== scene(actor) ||
        scene(transition.vehiclePose) !== scene(actor)
      )
        invalid('transition scene');
      const t = transition.elapsed / 0.8,
        expected = {
          x: transition.from.x + (transition.to.x - transition.from.x) * t,
          y: transition.from.y + (transition.to.y - transition.from.y) * t,
          z: transition.from.z + (transition.to.z - transition.from.z) * t,
        };
      if (distance(actor, expected) > EPS || Math.abs(actor.z - expected.z) > EPS)
        invalid('transition pose');
      if (
        distance(transition.from, transition.to) > 40 ||
        Math.abs(transition.from.z - transition.to.z) > 11
      )
        invalid('transition distance');
      const snapshot = { ...vehicle, ...transition.vehiclePose },
        seatPose = companionSeatPose(snapshot, transition.seat, context);
      if (record.phase === 'boarding') {
        const door = doorPose(snapshot, transition.seat, context);
        if (distance(transition.from, door) > 1 + EPS || Math.abs(transition.from.z - door.z) > 3)
          invalid('boarding origin');
        if (distance(transition.to, seatPose) > 8 || Math.abs(transition.to.z - seatPose.z) > 6)
          invalid('boarding destination');
      } else {
        if (distance(transition.from, seatPose) > 40) invalid('exit origin');
        const doors = [
          doorPose(snapshot, transition.seat, context),
          doorPose(snapshot, transition.seat, context, true),
        ];
        if (
          !doors.some(
            (door) =>
              distance(transition.to, door) <= EPS && Math.abs(transition.to.z - door.z) <= 6,
          )
        )
          invalid('exit destination');
      }
      const targetRadius = record.phase === 'exiting' ? 7 : 3,
        targetHeight = record.phase === 'exiting' ? 30 : 8,
        targetEye = record.phase === 'exiting' ? 14 : 6;
      if (
        Math.abs(
          actor.radius - (transition.fromRadius + (targetRadius - transition.fromRadius) * t),
        ) > EPS ||
        Math.abs(
          actor.collisionHeight -
            (transition.fromHeight + (targetHeight - transition.fromHeight) * t),
        ) > EPS ||
        Math.abs(actor.eyeHeight - (transition.fromEye + (targetEye - transition.fromEye) * t)) >
          EPS
      )
        invalid('transition body');
    }
  }
  for (const vehicle of state.vehicles ?? []) {
    const expected = model.records
      .flatMap((record) => {
        const actor = getActor(state, record.id);
        if (actor.vehicleId === vehicle.id)
          return [{ actorId: actor.id, seat: actor.seat, status: 'occupied' }];
        return record.reservedVehicleId === vehicle.id
          ? [{ actorId: actor.id, seat: record.reservedSeat, status: 'reserved' }]
          : [];
      })
      .sort((a, b) => a.seat - b.seat);
    const actual = vehicle.companionSeats ?? [];
    if (
      !Array.isArray(actual) ||
      actual.length !== expected.length ||
      expected.some(
        (seat, i) =>
          actual[i]?.actorId !== seat.actorId ||
          actual[i]?.seat !== seat.seat ||
          actual[i]?.status !== seat.status,
      ) ||
      Boolean(vehicle.companionOccupied) !== Boolean(expected.length)
    )
      invalid('vehicle seat ownership');
    for (const external of context.externalSeatOwners?.(vehicle, state) ?? [])
      if (owners.has(`${vehicle.id}:${external.seat}`)) invalid('external seat collision');
  }
  if (!Array.isArray(model.events) || model.events.length > 128) invalid('events');
  let last = 0;
  for (const event of model.events) {
    number(event.id, 'event id', last + 1, model.sequence);
    if (!Number.isSafeInteger(event.id)) invalid('event id');
    last = event.id;
    number(event.time, 'event time', 0, model.time);
    if (!ids.has(event.actorId)) invalid('event actor');
    text(event.kind, 'event kind');
  }
  if (last !== model.sequence) invalid('event tail');
  return true;
}
export function restoreCompanions(serializedOrObject, state, context = {}) {
  let model = serializedOrObject;
  if (typeof model === 'string') {
    if (model.length > 4000000) invalid('save size');
    try {
      model = JSON.parse(model);
    } catch {
      invalid('save JSON');
    }
  }
  if (!model || typeof model !== 'object' || Array.isArray(model)) invalid('registry');
  const candidate = { ...state, companions: model };
  validateCompanions(candidate, context);
  return clone(model);
}
