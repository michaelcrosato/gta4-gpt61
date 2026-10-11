/** Mission-specific physical observation adapter. No simulation import, actor teleport,
 * health edit or timer substitute for a missing engine capability. Scratch/unintegrated. */
import { FIRST_ARC_MISSIONS } from './first-arc.js';
import { worldHours, validateCalendar } from '../calendar.js';
const SOURCE = FIRST_ARC_MISSIONS.find((m) => m.id === 'LL-ST-003');
export const TWO_SEATS_IDS = Object.freeze({
  mission: 'LL-ST-003',
  felix: 'LL-CHAR-002',
  nadia: 'LL-CHAR-008',
  tess: 'LL-CHAR-025',
  dax: 'LL-ARC-DAX',
  pel: 'LL-ARC-PEL',
  bea: 'LL-ARC-BEA',
});
const I = TWO_SEATS_IDS,
  EPS = 1e-6,
  NADIA_WAIT_RADIUS = 4,
  TWO_SEATS_DAMAGE_HISTORY_LIMIT = 2048,
  own = (v, k) => Object.hasOwn(v, k),
  object = (v) => v && typeof v === 'object' && !Array.isArray(v),
  finite = (v) => typeof v === 'number' && Number.isFinite(v),
  id = (v) =>
    typeof v === 'string' &&
    /^[a-z0-9][a-z0-9:._-]{0,255}$/i.test(v) &&
    !['__proto__', 'prototype', 'constructor', 'toJSON'].includes(v),
  point = (p) => object(p) && finite(p.x) && finite(p.y) && finite(p.z ?? 0),
  scene = (a) => a?.sceneId ?? null,
  distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  pose = (a) => ({ x: a.x, y: a.y, z: a.z ?? 0, sceneId: scene(a) }),
  accepted = (r) => r === true || r?.ok === true,
  gate = (reason) => ({ ok: false, unmet: [reason] });
function copy(value) {
  const seen = new Set();
  let count = 0;
  function visit(v, depth = 0) {
    if (++count > 500000 || depth > 100) throw Error('Two Seats JSON exceeds limits.');
    if (v === null || typeof v === 'boolean' || typeof v === 'string' || finite(v)) return v;
    if (
      !v ||
      typeof v !== 'object' ||
      seen.has(v) ||
      ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(v))
    )
      throw Error('Two Seats needs finite plain acyclic JSON.');
    seen.add(v);
    const out = Array.isArray(v) ? [] : {};
    for (const key of Reflect.ownKeys(v)) {
      if (Array.isArray(v) && key === 'length') continue;
      const d = Object.getOwnPropertyDescriptor(v, key);
      if (
        typeof key !== 'string' ||
        ['__proto__', 'prototype', 'constructor', 'toJSON'].includes(key) ||
        !d?.enumerable ||
        !own(d, 'value')
      )
        throw Error('Unsafe Two Seats JSON property.');
      out[key] = visit(d.value, depth + 1);
    }
    if (Array.isArray(v) && Object.keys(out).length !== v.length)
      throw Error('Sparse Two Seats array.');
    seen.delete(v);
    return out;
  }
  return visit(value);
}
function sync(fn, ...args) {
  const r = typeof fn === 'function' ? fn(...args) : undefined;
  if (r && typeof r.then === 'function') throw Error('Two Seats bindings must be synchronous.');
  return r;
}
const funcs = (p, keys) => keys.every((k) => typeof p?.[k] === 'function');
const mission = (p) => p.authoredMission ?? SOURCE;
const binds = (p) => (typeof p.bindings === 'function' ? sync(p.bindings) : p.bindings);
const body = (s, p, actorId) => sync(p.passengers?.getActor, s, actorId) ?? null;
const observation = (s, p, actorId) => sync(p.passengers?.companionObservation, s, actorId) ?? null;
const car = (s, vehicleId = s.twoSeatsRuntime?.run.rideId) =>
  s.vehicles?.find((v) => v.id === vehicleId) ?? null;
const playerScene = (s) => s.interior?.active?.roomId ?? scene(s.player);
const near = (a, b, r = b?.radius ?? 8) =>
  point(a) &&
  point(b) &&
  scene(a) === scene(b) &&
  Math.abs((a.z ?? 0) - (b.z ?? 0)) <= 3 &&
  distance(a, b) <= r + EPS;
const sameStage = (stage, p) =>
  mission(p).stages.some((s) => s.id === stage.id && JSON.stringify(s) === JSON.stringify(stage));
function freshRun() {
  return {
    startedAt: null,
    rideId: null,
    rideHistory: [],
    disarm: null,
    injury: null,
    threat: null,
    retreat: { trigger: null, legs: {}, proofs: {} },
    pickup: { engaged: false, boarded: null, startedAt: null },
    dropoffs: [],
    exitRequests: {},
    exitObservations: {},
    trip: { lastPose: null, distance: 0 },
    voucher: null,
    outfit: null,
    contact: null,
    shopEscort: null,
    abandonment: { [I.felix]: 0, [I.nadia]: 0, [I.tess]: 0 },
    playerDead: false,
    playerArrested: false,
    civilianHarm: null,
    damageEvents: [],
  };
}
export function initializeTwoSeatsRuntime(s) {
  if (!finite(s.time) || s.time < 0) throw Error('Two Seats needs the real simulation clock.');
  s.twoSeatsRuntime ??= {
    version: 1,
    sequence: 0,
    restoreEpoch: 0,
    lastObservedTime: s.time,
    lastRestoreReason: null,
    active: null,
    activations: {},
    transactions: {},
    preparation: { nadia: { leg: 0, index: 0, ready: false, startedAt: null } },
    run: freshRun(),
  };
  if (s.twoSeatsRuntime.version !== 1) throw Error('Unsupported Two Seats runtime.');
  return s.twoSeatsRuntime;
}
const scope = (s) => {
  const a = initializeTwoSeatsRuntime(s).active;
  return a
    ? { missionId: I.mission, stageId: a.stageId, attempt: a.attempt, activationReceipt: a.receipt }
    : null;
};
function observedReceipt(s, name, fields) {
  const m = initializeTwoSeatsRuntime(s);
  return {
    id: `two-seats:${name}:${m.active?.attempt ?? 0}:${m.sequence++}`,
    at: s.time,
    scope: scope(s),
    ...copy(fields),
  };
}
function hasEssentialFailures(p) {
  const f = mission(p).failures;
  return (
    ['dispatch-person-lost', 'required-companion-dead', 'shopkeeper-lost'].every((name) =>
      f.some((x) => x.id === name && x.condition.type === 'required-actor-dead'),
    ) &&
    f.some(
      (x) =>
        x.id === 'required-felix-lost' &&
        x.condition.type === 'passenger-dead-or-abandoned' &&
        JSON.stringify(x.condition.actors) === JSON.stringify([I.felix]) &&
        x.condition.grace === 35,
    )
  );
}
function readiness(s, p) {
  const b = binds(p),
    passengers =
      p.ready?.passengers === true &&
      funcs(p.passengers, [
        'getActor',
        'companionObservation',
        'getSeat',
        'vehicleOccupants',
        'requestBoardSlot',
        'requestExit',
        'requestEscort',
        'ensureNamedActor',
      ]) &&
      object(p.companionContext),
    geometry =
      p.ready?.geometry === true &&
      ['dispatch', 'boardwalk-station', 'tess-flat', 'pier-goods'].every(
        (k) => b?.[k]?.ready === true,
      ) &&
      funcs(p.rooms, ['hasRoom', 'hasPortal']) &&
      ['voss-dispatch', 'tess-flat', 'pier-goods'].every(
        (k) => sync(p.rooms.hasRoom, k) === true,
      ) &&
      JSON.stringify(b?.['boardwalk-station']?.boardingOrder) === JSON.stringify([I.nadia, I.tess]),
    melee =
      p.ready?.melee === true &&
      p.hostiles?.ready === true &&
      funcs(p.hostiles, [
        'activate',
        'engage',
        'beginRetreat',
        'completeRetreat',
        'verifyReceipt',
        'observe',
      ]) &&
      p.injuries?.ready === true &&
      funcs(p.injuries, ['apply', 'verifyReceipt', 'view']) &&
      p.combat?.ready === true &&
      funcs(p.combat, ['validateReceipt']),
    clothing =
      p.ready?.clothing === true &&
      p.clothing?.ready === true &&
      funcs(p.clothing, ['grantVoucher', 'purchaseAndEquip', 'receipt', 'verify']),
    friendship =
      p.ready?.friendship === true &&
      p.friendship?.ready === true &&
      funcs(p.friendship, ['addTess', 'verifyReceipt']),
    director =
      p.ready?.director === true &&
      hasEssentialFailures(p) &&
      funcs(p.snapshots, ['capture', 'validate', 'restore']) &&
      p.damage?.ready === true &&
      funcs(p.damage, ['isCivilian']) &&
      funcs(p.director, ['chooseOption']) &&
      funcs(p.observations, ['playerArrested']) &&
      funcs(p.vehicles, ['availableRide']) &&
      funcs(p.effects, ['apply', 'verifyReceipt']);
  return { passengers, geometry, melee, clothing, friendship, director };
}
export function twoSeatsIntegrationGates(s, p) {
  const r = Object.entries(readiness(s, p))
    .filter(([, v]) => !v)
    .map(([k]) => `two-seats-${k}-unintegrated`);
  if (!hasEssentialFailures(p)) r.push('essential-cast-failures-not-authored-or-migrated');
  return r;
}
function fourSeatRide(s, p, v = car(s)) {
  return !!(
    v &&
    v.health > 0 &&
    scene(v) === null &&
    p.vehicles.specs?.[v.spec]?.seats >= 4 &&
    s.player.vehicleId === v.id &&
    s.player.health > 0
  );
}
function seated(s, p, actorId, seat, vehicle = car(s)) {
  const record = sync(p.passengers.getSeat, s, actorId);
  return !!(
    vehicle?.health > 0 &&
    record?.alive &&
    record.vehicleId === vehicle.id &&
    record.seat === seat &&
    sync(p.passengers.vehicleOccupants, s, vehicle.id)?.some(
      (x) => x.actorId === actorId && x.seat === seat && x.alive,
    )
  );
}
function riding(s, p, ids = [I.felix, I.nadia, I.tess]) {
  const slots = { [I.felix]: 2, [I.nadia]: 1, [I.tess]: 3 };
  return fourSeatRide(s, p) && ids.every((actorId) => seated(s, p, actorId, slots[actorId]));
}
function parked(s, p, v, bay) {
  const spec = p.vehicles.specs?.[v?.spec];
  if (
    !v ||
    v.health <= 0 ||
    scene(v) !== null ||
    !point(bay) ||
    !finite(bay.w) ||
    !finite(bay.h) ||
    !spec ||
    Math.abs(v.speed ?? 0) > (bay.maxSpeed ?? 5) + EPS ||
    Math.abs((v.z ?? 0) - (bay.z ?? 0)) > 3
  )
    return false;
  if (
    finite(bay.angle) &&
    Math.abs(Math.atan2(Math.sin(v.angle - bay.angle), Math.cos(v.angle - bay.angle))) >
      (bay.angleTolerance ?? 0.3) + EPS
  )
    return false;
  const c = Math.cos(v.angle),
    sn = Math.sin(v.angle);
  for (const x of [-spec.length / 2, spec.length / 2])
    for (const y of [-spec.width / 2, spec.width / 2]) {
      const px = v.x + c * x - sn * y,
        py = v.y + sn * x + c * y;
      if (
        px < bay.x - EPS ||
        px > bay.x + bay.w + EPS ||
        py < bay.y - EPS ||
        py > bay.y + bay.h + EPS
      )
        return false;
    }
  return true;
}
function dialogueFinished(s) {
  const d = s.campaign?.active?.dialogue;
  return !!(d && d.index >= d.lines.length);
}
/** Existing Nadia walks through genuine reached portals and saved street legs. */
export function prepareTwoSeatsStart(s, p) {
  const m = initializeTwoSeatsRuntime(s),
    n = m.preparation.nadia,
    b = binds(p)?.['boardwalk-station'],
    a = observation(s, p, I.nadia);
  if (
    !s.campaign?.completed?.['LL-ST-002'] ||
    s.campaign.completed[I.mission] ||
    (s.campaign.active &&
      (s.campaign.active.missionId !== I.mission ||
        !['dispatch-threat', 'pickup'].includes(s.campaign.active.stageId) ||
        s.campaign.active.phase !== 'running')) ||
    s.campaign.suspended?.some((x) => x.missionId === I.mission)
  )
    return { ok: true, idle: true };
  if (p.ready?.geometry !== true || b?.ready !== true)
    return gate('full-height-nadia-route-unintegrated');
  if (!a?.alive || !Array.isArray(b.nadiaFromDocksideStreet) || !point(b.existingNadiaWait))
    return gate('persistent-living-nadia-itinerary-unavailable');
  sync(p.passengers.ensureNamedActor, s, { ...body(s, p, I.nadia) }, p.companionContext);
  // Reaching the wait disk completes preparation. Pickup then owns the same
  // living body; an escort back to that disk would cancel its real seat lease.
  if (n.ready && m.active?.phase === 'running' && m.active.stageId === 'pickup')
    return { ok: true, ready: true, controlledBy: 'pickup' };
  if (near(a, { ...b.existingNadiaWait, sceneId: null, radius: NADIA_WAIT_RADIUS })) {
    n.ready = true;
    n.leg = 2;
    return { ok: true, ready: true };
  }
  n.startedAt ??= s.time;
  if (a.sceneId !== null) {
    sync(
      p.passengers.requestEscort,
      s,
      I.nadia,
      { ...b.nadiaFromDocksideStreet[0], sceneId: null, radius: 6 },
      p.companionContext,
    );
    return { ok: true, ready: false };
  }
  n.leg = 1;
  const points = b.nadiaFromDocksideStreet;
  if (n.index >= points.length) n.index = points.length - 1;
  let target = { ...points[n.index], sceneId: null, radius: NADIA_WAIT_RADIUS };
  if (near(a, target)) {
    n.index = Math.min(points.length - 1, n.index + 1);
    target = { ...points[n.index], sceneId: null, radius: NADIA_WAIT_RADIUS };
  }
  sync(p.passengers.requestEscort, s, I.nadia, target, p.companionContext);
  return { ok: true, ready: false, index: n.index };
}
function ensureCast(s, p) {
  for (const existing of [I.felix, I.nadia]) {
    const a = body(s, p, existing);
    if (!a) return gate(`persistent-cast-missing:${existing}`);
    sync(p.passengers.ensureNamedActor, s, { ...a }, p.companionContext);
  }
  const defs = sync(p.actors?.definitions, s);
  if (!Array.isArray(defs)) return gate('canonical-two-seats-cast-definitions-missing');
  for (const actorId of [I.dax, I.pel, I.tess, I.bea]) {
    const d = defs.find((x) => x.id === actorId);
    if (!d || !point(d)) return gate(`canonical-cast-definition-missing:${actorId}`);
    const a = sync(p.passengers.ensureNamedActor, s, copy(d), p.companionContext);
    if (a?.id !== actorId) return gate(`canonical-cast-not-created:${actorId}`);
  }
  return { ok: true };
}
function activate(s, stage, request, p) {
  if (request.missionId !== I.mission || !sameStage(stage, p))
    return gate('unregistered-two-seats-stage');
  const gates = twoSeatsIntegrationGates(s, p);
  if (gates.length) return { ok: false, unmet: gates };
  const m = initializeTwoSeatsRuntime(s);
  if (own(m.activations, request.receipt)) return { ok: true, replayed: true };
  if (
    stage.id === 'dispatch-threat' &&
    ['start', 'full-mission-restart', 'checkpoint-retry'].includes(request.reason)
  ) {
    const f = observation(s, p, I.felix);
    if (
      !f?.alive ||
      !observation(s, p, I.nadia)?.alive ||
      playerScene(s) !== 'voss-dispatch' ||
      f.sceneId !== 'voss-dispatch' ||
      distance(s.player, f) > 35 ||
      s.mission ||
      s.wanted.level
    )
      return gate('real-dispatch-reunion-not-ready');
    m.run = freshRun();
    m.run.startedAt = s.time;
  }
  m.active = {
    missionId: I.mission,
    stageId: stage.id,
    attempt: request.attempt,
    receipt: request.receipt,
    startedAt:
      request.reason === 'resume-after-interleaving' && m.active?.stageId === stage.id
        ? m.active.startedAt
        : s.time,
    phase: 'running',
    blocked: null,
  };
  const cast = ensureCast(s, p);
  if (!cast.ok) return cast;

  if (stage.id === 'home' && !m.run.pickup.boarded)
    return gate('actual-four-seat-pickup-history-required');
  if (stage.id === 'workwear' && (m.run.dropoffs.length !== 2 || !m.run.contact))
    return gate('actual-ordered-home-contact-history-required');
  m.activations[request.receipt] = { scope: scope(s), at: s.time };
  m.sequence++;
  return { ok: true };
}
function adoptRide(s, p) {
  const m = initializeTwoSeatsRuntime(s),
    v = sync(p.vehicles.availableRide, s);
  if (!fourSeatRide(s, p, v)) return false;
  if (m.run.rideId === v.id) return true;
  const occupants = [I.felix, I.nadia, I.tess].map((id) => observation(s, p, id));
  if (occupants.some((a) => a?.seated && a.vehicleId !== v.id)) {
    for (const a of occupants.filter((a) => a?.seated && a.vehicleId !== v.id))
      sync(p.passengers.requestExit, s, a.id, p.companionContext);
    return false;
  }
  m.run.rideHistory.push(
    observedReceipt(s, 'ride-acquired', {
      vehicleId: v.id,
      vehiclePose: pose(v),
      health: v.health,
    }),
  );
  m.run.rideId = v.id;
  m.run.trip.lastPose = null;
  return true;
}
function requestSlot(s, p, actorId, seat) {
  const a = observation(s, p, actorId),
    v = car(s);
  if (!a?.alive || !v) return false;
  if (a.seated && a.vehicleId !== v.id) {
    sync(p.passengers.requestExit, s, actorId, p.companionContext);
    return false;
  }
  return accepted(sync(p.passengers.requestBoardSlot, s, actorId, v.id, seat, p.companionContext));
}
export function observeTwoSeatsDisarm(s, receipt, p) {
  let m = initializeTwoSeatsRuntime(s);
  if (m.active?.phase !== 'running' || m.active.stageId !== 'dispatch-threat')
    return gate('disarm-outside-owned-threat');
  receipt = copy(receipt);
  if (
    receipt.targetId !== I.dax ||
    receipt.weapon !== 'knife' ||
    receipt.method !== 'guard-disarm' ||
    receipt.hand !== 'right' ||
    receipt.destination !== 'ground' ||
    receipt.owner !== 'player' ||
    !finite(receipt.at) ||
    receipt.at < m.run.startedAt ||
    receipt.at > s.time + EPS ||
    sync(p.combat.validateReceipt, s, receipt) !== true
  )
    return gate('actual-committed-dax-disarm-required');
  const a = body(s, p, I.dax);
  if (
    !a ||
    a.health <= 0 ||
    a.weapon !== 'unarmed' ||
    JSON.stringify(a.disarmReceipt) !== JSON.stringify(receipt) ||
    JSON.stringify(s.player.lastDisarm) !== JSON.stringify(receipt)
  )
    return gate('disarm-does-not-match-current-canonical-body');
  if (m.run.disarm && m.run.disarm.receipt.id !== receipt.id)
    return gate('disarm-receipt-conflict');
  if (m.run.disarm && m.run.injury) return { ok: true, replayed: true };
  m.run.disarm ??= observedReceipt(s, 'dax-disarm', { actorId: I.dax, receipt });
  const injured = sync(p.injuries.apply, s, {
    id: `two-seats:injury:${s.campaign.receiptNamespace || s.campaign.contentFingerprint}:${receipt.id}`,
    scope: scope(s),
    actorId: I.dax,
    disarm: receipt,
    damage: 8,
    durationHours: 48,
    hand: 'right',
  });
  // A failed parent transaction may restore arrays/ledgers in place.
  m = initializeTwoSeatsRuntime(s);
  if (
    !accepted(injured) ||
    !injured.receipt ||
    sync(p.injuries.verifyReceipt, s, injured.receipt) !== true
  ) {
    m.active.blocked = 'actual-wrist-injury-not-committed';
    return gate(m.active.blocked);
  }
  m.run.injury = copy(injured.receipt);
  const staggered = [I.dax, I.pel].find((id) => (body(s, p, id)?.staggerRemaining ?? 0) > 0);
  if (staggered)
    m.run.retreat.trigger = observedReceipt(s, 'retreat-trigger', {
      disarmId: receipt.id,
      injuryId: injured.receipt.id,
      staggeredActorId: staggered,
      staggerRemaining: body(s, p, staggered).staggerRemaining,
    });
  m.sequence++;
  return { ok: true, receipt: copy(m.run.disarm) };
}
function tickRetreat(s, p) {
  const m = initializeTwoSeatsRuntime(s),
    r = m.run;
  if (!r.disarm || !r.injury || !r.retreat.trigger) return;
  const encounter = binds(p).dispatch.encounter;
  for (const actorId of [I.dax, I.pel]) {
    const a = observation(s, p, actorId);
    if (!a?.alive) continue;
    const target = { ...encounter.exteriorRetreat.at(-1), sceneId: null, radius: 6 };
    if (!r.retreat.legs[actorId]) {
      const result = sync(p.hostiles.beginRetreat, s, {
        actorId,
        scope: scope(s),
        disarmId: r.disarm.receipt.id,
        injuryId: r.injury.id,
        target,
        interiorPath: copy(actorId === I.dax ? encounter.daxRetreat : encounter.pelRetreat),
        exteriorPath: copy(encounter.exteriorRetreat),
      });
      if (!accepted(result)) {
        m.active.blocked = 'real-retreat-controller-declined';
        continue;
      }
      r.retreat.legs[actorId] = { startedAt: s.time, target };
    }
    if (!near(a, target)) continue;
    if (!r.retreat.proofs[actorId]) {
      const proof = observedReceipt(s, 'collector-retreated', {
        actorId,
        actorPose: pose(a),
        target,
        alive: true,
      });
      const result = sync(p.hostiles.completeRetreat, s, { actorId, scope: scope(s), proof });
      if (
        !accepted(result) ||
        !result.receipt ||
        sync(p.hostiles.verifyReceipt, s, result.receipt) !== true
      ) {
        m.active.blocked = 'actual-retreat-arrival-not-committed';
        continue;
      }
      r.retreat.proofs[actorId] = { ...proof, parentReceipt: copy(result.receipt) };
    }
  }
}
export function observeTwoSeatsDamage(s, event, p) {
  const m = initializeTwoSeatsRuntime(s);
  if (m.active?.phase !== 'running') return { ok: true, ignored: true };
  event = copy(event);
  // Only player-caused harm can injure Dax or harm civilians in this mission. World damage, such
  // as a fire ticking every frame, must not fill the bounded history and invalidate saves.
  if (event.entityType !== 'actor' || event.owner !== 'player') return { ok: true, ignored: true };
  if (
    !id(event.targetId) ||
    !id(event.owner) ||
    !finite(event.at) ||
    Math.abs(event.at - s.time) > EPS ||
    !point(event) ||
    !['healthBefore', 'healthAfter', 'armourBefore', 'armourAfter'].every(
      (k) => finite(event[k]) && event[k] >= 0,
    ) ||
    event.healthAfter > event.healthBefore ||
    event.armourAfter > event.armourBefore ||
    (event.healthAfter === event.healthBefore && event.armourAfter === event.armourBefore)
  )
    return gate('invalid-committed-two-seats-damage');
  const actual = sync(p.damage.getTarget, s, event.targetId);
  if (
    !actual ||
    Math.abs(actual.health - event.healthAfter) > EPS ||
    Math.abs((actual.armour ?? 0) - event.armourAfter) > EPS ||
    scene(actual) !== event.sceneId ||
    distance(actual, event) > EPS
  )
    return gate('damage-does-not-match-actual-after-body');
  const civilian = sync(p.damage.isCivilian, s, actual, event);
  if (civilian !== true && civilian !== false) {
    m.active.blocked = 'civilian-hostility-classification-unavailable';
    return gate(m.active.blocked);
  }
  const record = {
    ...event,
    id: `two-seats:damage:${m.sequence++}`,
    scope: scope(s),
    civilian,
    worldHours: worldHours(s),
    calendarOffsetHours: s.calendar.offsetHours,
    calendarReceiptIds: Object.keys(s.calendar.receipts),
  };
  if (m.run.damageEvents.length >= TWO_SEATS_DAMAGE_HISTORY_LIMIT) {
    m.active.blocked = 'damage-observation-capacity-reached';
    return gate(m.active.blocked);
  }
  m.run.damageEvents.push(record);
  if (civilian) m.run.civilianHarm ??= copy(record);
  return { ok: true, receipt: record };
}
function legitimateShopTransfer(s, p, actorId, a = observation(s, p, actorId)) {
  const m = initializeTwoSeatsRuntime(s),
    q = m.run.shopEscort;
  if (
    actorId !== I.felix ||
    m.active?.stageId !== 'workwear' ||
    !q ||
    !a?.alive ||
    a.abandoned ||
    playerScene(s) !== scene(q.target)
  )
    return false;
  const record = s.companions?.records.find((r) => r.id === actorId),
    intent = record?.afterExit?.kind === 'escort' ? record.afterExit : record?.order;
  return (
    intent?.kind === 'escort' &&
    near(intent.target, q.target, EPS) &&
    ['waiting-exit', 'exiting', 'following', 'arrived'].includes(a.phase)
  );
}
function tickShopEscort(s, p) {
  const m = initializeTwoSeatsRuntime(s),
    shop = binds(p)?.['pier-goods'],
    a = observation(s, p, I.felix);
  if (
    m.active?.stageId !== 'workwear' ||
    !point(shop?.felixMark) ||
    playerScene(s) !== shop.roomId ||
    !a?.alive ||
    near(a, shop.felixMark)
  )
    return;
  const result = sync(p.passengers.requestEscort, s, I.felix, shop.felixMark, p.companionContext);
  if (accepted(result))
    m.run.shopEscort ??= observedReceipt(s, 'felix-shop-escort', {
      actorId: I.felix,
      target: copy(shop.felixMark),
      fromPose: pose(a),
      vehicleId: a.vehicleId ?? null,
    });
}
function tickPassengers(s, dt, p) {
  const m = initializeTwoSeatsRuntime(s),
    r = m.run,
    b = binds(p);
  adoptRide(s, p);
  const v = car(s);
  if (riding(s, p, [I.felix]) && r.trip.lastPose) r.trip.distance += distance(v, r.trip.lastPose);
  r.trip.lastPose = fourSeatRide(s, p) ? pose(car(s)) : null;
  if (m.active.stageId === 'pickup' && fourSeatRide(s, p)) {
    requestSlot(s, p, I.felix, 2);
    if (
      parked(s, p, car(s), b['boardwalk-station'].bay) &&
      !s.wanted.level &&
      m.preparation.nadia.ready
    ) {
      if (
        JSON.stringify(b['boardwalk-station'].boardingOrder) !== JSON.stringify([I.nadia, I.tess])
      ) {
        m.active.blocked = 'actual-two-seats-boarding-order-unregistered';
        return;
      }
      r.pickup.engaged = true;
      r.pickup.startedAt ??= s.time;
      requestSlot(s, p, I.nadia, 1);
      // A reservation or approaching body is not occupancy. Tess starts only
      // after living Nadia is physically in this same vehicle's first seat.
      if (seated(s, p, I.nadia, 1, car(s))) requestSlot(s, p, I.tess, 3);
    }
    if (r.pickup.engaged && riding(s, p))
      r.pickup.boarded ??= observedReceipt(s, 'three-real-passengers-boarded', {
        vehicleId: r.rideId,
        vehiclePose: pose(car(s)),
        seats: [I.felix, I.nadia, I.tess].map((actorId) =>
          copy(sync(p.passengers.getSeat, s, actorId)),
        ),
      });
  }
  if (['home', 'workwear'].includes(m.active.stageId) && fourSeatRide(s, p)) {
    for (const [actorId, slot] of [
      [I.felix, 2],
      [I.nadia, 1],
      [I.tess, 3],
    ])
      if (!r.dropoffs.some((q) => q.actorId === actorId) && !r.exitRequests[actorId])
        requestSlot(s, p, actorId, slot);
  }
  if (m.active.stageId === 'home' && r.pickup.boarded && dialogueFinished(s)) {
    const leg = r.dropoffs.length;
    if (leg < 2) {
      const actorId = leg === 0 ? I.tess : I.nadia,
        location = leg === 0 ? b['tess-flat'] : b.dispatch,
        bay = leg === 0 ? location.bay : location.stop,
        target = leg === 0 ? location.dropoffTarget : location.felixTarget;
      if (!point(target)) {
        m.active.blocked = 'actual-passenger-dropoff-target-missing';
        return;
      }
      const retained = leg === 0 ? [I.felix, I.nadia] : [I.felix];
      let request = r.exitRequests[actorId];
      if (
        !request &&
        parked(s, p, car(s), bay) &&
        riding(s, p, [...retained, actorId]) &&
        !s.wanted.level
      ) {
        const result = sync(p.passengers.requestEscort, s, actorId, target, p.companionContext);
        if (accepted(result)) {
          request = r.exitRequests[actorId] = observedReceipt(s, 'passenger-exit-request', {
            actorId,
            vehicleId: r.rideId,
            vehiclePose: pose(car(s)),
            vehicleAngle: car(s).angle,
            vehicleSpeed: car(s).speed ?? 0,
            vehicleHealth: car(s).health,
            vehicleSpec: car(s).spec,
            bay: copy(bay),
            target: copy(target),
            retainedSeats: retained.map((id) => copy(sync(p.passengers.getSeat, s, id))),
          });
        }
      }
      if (request) {
        // A committed exit keeps its physical escort intention. Reboarding each tick
        // would cancel the doorway walk and reset the companion's failure grace.
        sync(p.passengers.requestEscort, s, actorId, request.target, p.companionContext);
        const a = observation(s, p, actorId);
        if (a?.alive && !a.seated && !a.vehicleId && !sync(p.passengers.getSeat, s, actorId)) {
          r.exitObservations[actorId] ??= observedReceipt(s, 'passenger-exited', {
            actorId,
            vehicleId: request.vehicleId,
            requestId: request.id,
            actorPose: pose(a),
          });
          if (near(a, request.target)) {
            r.dropoffs.push(
              observedReceipt(s, 'ordered-dropoff', {
                actorId,
                sceneId: scene(request.target),
                vehicleId: request.vehicleId,
                vehiclePose: copy(request.vehiclePose),
                actorPose: pose(a),
                target: copy(request.target),
                exitRequestId: request.id,
                exitObservationId: r.exitObservations[actorId].id,
                exitObservedAt: r.exitObservations[actorId].at,
              }),
            );
          }
        }
      }
    }
  }
  const relevant =
    m.active.stageId === 'home'
      ? [I.felix, ...[I.tess, I.nadia].filter((id) => !r.dropoffs.some((x) => x.actorId === id))]
      : m.active.stageId === 'workwear'
        ? [I.felix]
        : m.active.stageId === 'pickup'
          ? [I.felix, ...(r.pickup.engaged ? [I.nadia, I.tess] : [])]
          : [];
  for (const actorId of [I.felix, I.nadia, I.tess]) {
    const a = observation(s, p, actorId);
    const expectedExit = r.exitRequests[actorId] && !r.dropoffs.some((x) => x.actorId === actorId);
    const separated =
      relevant.includes(actorId) &&
      a?.alive &&
      !expectedExit &&
      !legitimateShopTransfer(s, p, actorId, a) &&
      !riding(s, p, [actorId]) &&
      (a.sceneId !== playerScene(s) ||
        distance(a, s.player) > 150 ||
        a.blockedSeconds > EPS ||
        a.phase === 'abandoned');
    r.abandonment[actorId] = separated ? r.abandonment[actorId] + dt : 0;
  }
}
export function tickTwoSeatsRuntime(s, dt, p) {
  const m = initializeTwoSeatsRuntime(s);
  if (!finite(dt) || dt < 0 || dt > 0.5 || s.time + EPS < m.lastObservedTime)
    throw Error('Invalid real Two Seats timestep.');
  const elapsed = Math.min(dt, Math.max(0, s.time - m.lastObservedTime));
  m.lastObservedTime = s.time;
  if (!m.active || m.active.phase !== 'running') {
    prepareTwoSeatsStart(s, p);
    return m;
  }
  m.active.blocked = null;
  const b = binds(p);
  const physicalBinding = {
    'dispatch-threat': b?.dispatch?.encounter,
    pickup: b?.['boardwalk-station']?.bay,
    home: b?.['tess-flat']?.dropoffTarget && b?.dispatch?.felixTarget,
    workwear: b?.['pier-goods']?.hook && b?.['pier-goods']?.felixMark,
  }[m.active.stageId];
  if (!physicalBinding) {
    m.active.blocked = 'actual-two-seats-stage-binding-unintegrated';
    return m;
  }
  const r = m.run;
  r.playerDead ||= s.player.health <= 0 || (s.respawnTimer ?? 0) > 0;
  r.playerArrested ||= sync(p.observations.playerArrested, s, r.startedAt) === true;
  if (['dispatch-threat', 'pickup'].includes(m.active.stageId)) prepareTwoSeatsStart(s, p);
  if (m.active.stageId === 'dispatch-threat') {
    if (
      s.campaign?.active?.stageId === 'dispatch-threat' &&
      s.campaign.active.attempt === m.active.attempt &&
      s.campaign.receipts?.[m.active.receipt]?.kind === 'stage-activation' &&
      r.threat?.scope?.activationReceipt !== m.active.receipt
    ) {
      const result = sync(p.hostiles.activate, s, {
        scope: scope(s),
        binding: copy(binds(p).dispatch.encounter),
        actors: [I.dax, I.pel],
        protectedActors: [I.felix],
      });
      if (
        !accepted(result) ||
        !result.receipt ||
        sync(p.hostiles.verifyReceipt, s, result.receipt) !== true
      ) {
        m.active.blocked = 'real-hostile-threat-not-activated';
        return m;
      }
      r.threat = copy(result.receipt);
    }
    if (r.threat && dialogueFinished(s) && !r.retreat.trigger) sync(p.hostiles.engage, s, scope(s));
    const receipt = body(s, p, I.dax)?.disarmReceipt;
    if (receipt && !r.injury) observeTwoSeatsDisarm(s, receipt, p);
    tickRetreat(s, p);
  }
  if (m.active.stageId === 'workwear') tickShopEscort(s, p);
  if (['pickup', 'home', 'workwear'].includes(m.active.stageId)) tickPassengers(s, elapsed, p);
  if (
    m.active.stageId === 'workwear' &&
    s.campaign?.active?.stageId === 'workwear' &&
    s.campaign.active.attempt === m.active.attempt
  ) {
    if (!r.voucher) {
      const result = sync(p.clothing.grantVoucher, s, {
        scope: scope(s),
        storeId: 'pier-goods',
        payment: 'cooperative-voucher',
        outfitIds: [...mission(p).stages.find((x) => x.id === 'workwear').stock],
        count: 1,
      });
      if (
        !accepted(result) ||
        !result.receipt ||
        sync(p.clothing.verify, s, result.receipt) !== true
      )
        m.active.blocked = 'real-cooperative-voucher-not-issued';
      else r.voucher = copy(result.receipt);
    }
    sync(p.actors?.prepareShop, s, scope(s));
  }
  return m;
}
const conditionTypes = new Set([
  'disarmed',
  'hostiles-retreated',
  'passengers-boarded',
  'dropoffs-complete',
  'outfit-purchased',
  'outfit-equipped',
  'civilian-damaged-by-player',
  'passenger-dead-or-abandoned',
  'required-actor-dead',
  'player-dead',
  'player-arrested',
  'choice-permitted',
  'actor-alive',
]);
// A director-only component owner is not a physical stage activation. Old run
// fields cannot establish observations until this exact active receipt is owned.
function ownsPhysicalActivation(m, request = {}) {
  const a = m.active,
    proof = a && m.activations[a.receipt]?.scope;
  return !!(
    a &&
    proof &&
    a.missionId === I.mission &&
    proof.missionId === a.missionId &&
    proof.stageId === a.stageId &&
    proof.attempt === a.attempt &&
    proof.activationReceipt === a.receipt &&
    (request.stageId === undefined || request.stageId === a.stageId) &&
    (request.attempt === undefined || request.attempt === a.attempt)
  );
}
function observe(s, c, request, p) {
  const m = initializeTwoSeatsRuntime(s),
    r = m.run;
  if (request.missionId !== I.mission || !conditionTypes.has(c.type))
    return { unmet: `unregistered-two-seats-condition:${c.type}` };
  if (!ownsPhysicalActivation(m, request)) return false;
  if (c.type === 'player-dead') return r.playerDead || s.player.health <= 0;
  if (c.type === 'player-arrested')
    return r.playerArrested || sync(p.observations.playerArrested, s, r.startedAt) === true;
  if (c.type === 'civilian-damaged-by-player') return !!r.civilianHarm;
  if (c.type === 'required-actor-dead') {
    if (!c.stages?.includes(m.active?.stageId)) return false;
    return c.actors.some((id) => observation(s, p, id)?.alive === false);
  }
  if (c.type === 'passenger-dead-or-abandoned')
    return c.actors.every((id) => [I.felix, I.nadia, I.tess].includes(id))
      ? c.actors.some((id) => {
          if (c.stages && !c.stages.includes(m.active.stageId)) return false;
          const a = observation(s, p, id),
            transfer = legitimateShopTransfer(s, p, id, a);
          return (
            a &&
            (!a.alive ||
              r.abandonment[id] + EPS >= c.grace ||
              a.blockedSeconds + EPS >= c.grace ||
              (!transfer && a.separationSeconds + EPS >= c.grace))
          );
        })
      : { unmet: 'unknown-passenger-loss-rule' };
  if (c.type === 'actor-alive')
    return observation(s, p, c.actor)?.alive ?? { unmet: 'required-live-speaker-unavailable' };
  if (c.type === 'disarmed')
    return (
      c.actor === I.dax &&
      !!r.disarm &&
      body(s, p, I.dax)?.health > 0 &&
      body(s, p, I.dax)?.weapon === 'unarmed' &&
      !!r.injury &&
      sync(p.injuries.verifyReceipt, s, r.injury) === true
    );
  if (c.type === 'hostiles-retreated')
    return (
      JSON.stringify(c.actors) === JSON.stringify([I.dax, I.pel]) &&
      c.actors.every(
        (id) =>
          r.retreat.proofs[id] &&
          observation(s, p, id)?.alive &&
          near(observation(s, p, id), r.retreat.proofs[id].target),
      )
    );
  if (c.type === 'passengers-boarded')
    return (
      JSON.stringify(c.actors) === JSON.stringify([I.nadia, I.tess]) &&
      c.seatsRequired === 3 &&
      !!r.pickup.boarded &&
      riding(s, p)
    );
  if (c.type === 'dropoffs-complete')
    return (
      JSON.stringify(c.order) === JSON.stringify([I.tess, I.nadia]) &&
      JSON.stringify(c.scenes) === JSON.stringify(['tess-flat', 'dispatch']) &&
      r.dropoffs.length === 2 &&
      r.dropoffs[0].actorId === I.tess &&
      r.dropoffs[1].actorId === I.nadia
    );
  if (c.type === 'outfit-purchased')
    return (
      c.payment === 'cooperative-voucher' &&
      c.store === 'pier-goods' &&
      !!r.outfit &&
      sync(p.clothing.verify, s, r.outfit) === true
    );
  if (c.type === 'outfit-equipped')
    return (
      !!r.outfit &&
      s.wardrobe?.equipped === r.outfit.outfitId &&
      s.wardrobe.owned.includes(r.outfit.outfitId)
    );
  if (c.type === 'choice-permitted')
    return (
      c.choiceId === 'outfit' &&
      !!r.voucher &&
      s.campaign.active?.dialogue.index >= 3 &&
      sync(p.dialogue?.shopReady, s) === true
    );
  return { unmet: 'unknown-two-seats-observation' };
}
function capture(s, p) {
  const w = copy(sync(p.snapshots.capture, s, { exclude: ['campaign'] }));
  if (!object(w) || own(w, 'campaign'))
    throw Error('Full director-excluded Two Seats snapshot required.');
  validateTwoSeatsRuntime(w);
  if (sync(p.snapshots.validate, w) !== true) throw Error('Parent rejected full Two Seats world.');
  return w;
}
function restore(s, w, p, reason) {
  if (own(w, 'campaign') || sync(p.snapshots.validate, w) !== true)
    return gate('invalid-full-two-seats-snapshot');
  validateTwoSeatsRuntime(w);
  const epoch = initializeTwoSeatsRuntime(s).restoreEpoch,
    d = s.campaign;
  if (
    !accepted(
      sync(p.snapshots.restore, s, copy(w), {
        reason,
        preserve: ['campaign'],
        invalidateRailDispatcher: true,
      }),
    )
  )
    return gate('two-seats-parent-restore-declined');
  s.campaign = d;
  const m = initializeTwoSeatsRuntime(s);
  m.restoreEpoch = Math.max(epoch, m.restoreEpoch) + 1;
  m.lastObservedTime = s.time;
  m.lastRestoreReason = reason;
  return { ok: true };
}
function hash(v) {
  let h = 2166136261;
  for (const c of JSON.stringify(v)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h.toString(16).padStart(8, '0');
}
const actionTypes = new Set([
  'contact-added',
  'equip-outfit',
  'campaign-reward',
  'mission-failed',
  'mission-abandoned',
  'mission-suspended',
  'mission-restarted',
]);
function apply(s, batch, request, p) {
  const m = initializeTwoSeatsRuntime(s);
  if (
    request.missionId !== I.mission ||
    !id(request.receipt) ||
    batch.some((a) => !actionTypes.has(a.type))
  )
    return gate('unregistered-two-seats-effect');
  if (own(m.transactions, request.receipt)) return { ok: true, replayed: true };
  const before = capture(s, p);
  try {
    const receipts = [];
    for (let i = 0; i < batch.length; i++) {
      const result = sync(p.effects.apply, s, copy(batch[i]), {
        id: `two-seats:effect:${hash(request.receipt)}:${i}`,
        directorRequest: copy(request),
        scope: scope(s),
      });
      if (
        !accepted(result) ||
        !result.receipt ||
        sync(p.effects.verifyReceipt, s, result.receipt) !== true
      ) {
        restore(s, before, p, 'rollback:two-seats-effects');
        return gate(`actual-two-seats-effect-not-committed:${batch[i].type}`);
      }
      receipts.push(copy(result.receipt));
      if (batch[i].type === 'contact-added') m.run.contact = copy(result.receipt);
      if (batch[i].type === 'equip-outfit') {
        m.run.outfit = copy(result.purchaseReceipt ?? result.receipt);
        const voucher = sync(p.clothing.receipt, s, m.run.voucher?.id);
        if (
          !voucher ||
          voucher.spentBy !== m.run.outfit.id ||
          sync(p.clothing.verify, s, voucher) !== true
        )
          throw Error('Actual voucher consumption was not committed.');
        m.run.voucher = copy(voucher);
      }
      if (batch[i].type === 'mission-failed') m.active.phase = 'failed';
      if (batch[i].type === 'mission-suspended') m.active.phase = 'suspended';
      if (['mission-abandoned', 'campaign-reward'].includes(batch[i].type))
        m.active.phase = 'finished';
    }
    m.transactions[request.receipt] = { request: copy(request), receipts };
    m.sequence++;
    return { ok: true };
  } catch (e) {
    restore(s, before, p, 'rollback:two-seats-effects');
    throw e;
  }
}
export function createTwoSeatsAdapters(s, p) {
  initializeTwoSeatsRuntime(s);
  return {
    get capabilities() {
      return readiness(s, p);
    },
    supportsMission: (id, definition = mission(p)) =>
      id === I.mission &&
      !twoSeatsIntegrationGates(s, p).length &&
      JSON.stringify(definition) === JSON.stringify(mission(p)),
    supportsStage: (type, stage) => type === stage.type && sameStage(stage, p),
    activateStage: (stage, r) => activate(s, stage, r, p),
    supportsCondition: (type) => conditionTypes.has(type),
    observe: (c, r) => observe(s, c, r, p),
    canCompleteStage: (stage, r) => {
      if (r.missionId !== I.mission || !sameStage(stage, p))
        return { unmet: 'unknown-two-seats-stage' };
      const m = initializeTwoSeatsRuntime(s);
      if (
        !ownsPhysicalActivation(m, r) ||
        m.active.phase !== 'running' ||
        m.active.stageId !== stage.id
      )
        return { unmet: 'two-seats-stage-not-activated' };
      return m.active.blocked ? { unmet: m.active.blocked } : true;
    },
    supportsAction: (type) => actionTypes.has(type),
    applyActions: (b, r) => apply(s, b, r, p),
    captureWorld: () => capture(s, p),
    validateWorld: (w) => {
      try {
        validateTwoSeatsRuntime(w);
        return !own(w, 'campaign') && sync(p.snapshots.validate, w) === true;
      } catch {
        return false;
      }
    },
    restoreWorld: (w, r) => restore(s, w, p, r.reason),
  };
}
export function twoSeatsView(s, p) {
  const m = initializeTwoSeatsRuntime(s),
    a = m.active,
    r = m.run,
    b = binds(p);
  if (!a)
    return {
      active: false,
      preparation: copy(m.preparation),
      integrationGates: twoSeatsIntegrationGates(s, p),
      inputEpoch: m.restoreEpoch,
      cameraEpoch: m.restoreEpoch,
      releaseValidated: false,
    };
  const stage = mission(p).stages.find((x) => x.id === a.stageId);
  let target = null,
    dialogueReady = false;
  if (a.stageId === 'dispatch-threat') {
    target = { ...b.dispatch.felixTarget };
    dialogueReady = sync(p.dialogue?.threatReady, s) === true;
  }
  if (a.stageId === 'pickup') {
    target = fourSeatRide(s, p)
      ? b['boardwalk-station']?.pickupPose
      : sync(p.vehicles.guidanceRide, s);
    dialogueReady = riding(s, p);
  }
  if (a.stageId === 'home') {
    target = r.dropoffs.length === 0 ? b['tess-flat']?.pickupPose : b.dispatch.target;
    dialogueReady = riding(
      s,
      p,
      r.dropoffs.length === 0 ? [I.felix, I.nadia, I.tess] : [I.felix, I.nadia],
    );
  }
  if (a.stageId === 'workwear') {
    target =
      playerScene(s) === b['pier-goods']?.roomId ? b['pier-goods']?.hook : b['pier-goods']?.entry;
    dialogueReady =
      sync(p.dialogue?.shopReady, s) === true &&
      ((s.campaign?.active?.dialogue.index ?? 0) < 3 || !!r.outfit);
  }
  return {
    active: a.phase === 'running',
    missionId: I.mission,
    title: SOURCE.title,
    stageId: a.stageId,
    objective: stage.objective,
    target: target ? copy(target) : null,
    requiredVehicleId: r.rideId,
    dialogueReady: a.phase === 'running' && dialogueReady,
    autoDialogue: ['pickup', 'home'].includes(a.stageId) && dialogueReady,
    choices: stage.id === 'workwear' ? copy(mission(p).choices) : [],
    choiceReady:
      stage.id === 'workwear' &&
      !r.outfit &&
      (s.campaign?.active?.dialogue.index ?? 0) >= 3 &&
      sync(p.dialogue?.shopReady, s) === true,
    choicePending: stage.id === 'workwear' && !r.outfit,
    dropoffs: copy(r.dropoffs),
    seats: { [I.felix]: 2, [I.nadia]: 1, [I.tess]: 3 },
    blocked: a.blocked,
    inputEpoch: m.restoreEpoch,
    cameraEpoch: m.restoreEpoch,
    releaseValidated: false,
  };
}
export function validateTwoSeatsRuntime(s) {
  validateCalendar(s);
  const m = s.twoSeatsRuntime;
  copy(m);
  if (
    !object(m) ||
    m.version !== 1 ||
    !Number.isSafeInteger(m.sequence) ||
    m.sequence < 0 ||
    !Number.isSafeInteger(m.restoreEpoch) ||
    m.restoreEpoch < 0 ||
    !finite(m.lastObservedTime) ||
    m.lastObservedTime > s.time + EPS ||
    !object(m.run) ||
    !object(m.activations) ||
    !object(m.transactions) ||
    !object(m.preparation?.nadia)
  )
    throw Error('Invalid saved Two Seats runtime.');
  const validScope = (x) =>
    object(x) &&
    x.missionId === I.mission &&
    SOURCE.stages.some((y) => y.id === x.stageId) &&
    Number.isSafeInteger(x.attempt) &&
    x.attempt > 0 &&
    id(x.activationReceipt);
  if (
    m.active &&
    (!validScope({ ...m.active, activationReceipt: m.active.receipt }) ||
      !['running', 'failed', 'finished', 'suspended'].includes(m.active.phase) ||
      !finite(m.active.startedAt) ||
      m.active.startedAt > s.time + EPS)
  )
    throw Error('Invalid Two Seats activation.');
  const r = m.run;
  if (
    !(
      r.startedAt === null ||
      (finite(r.startedAt) && r.startedAt >= 0 && r.startedAt <= s.time + EPS)
    ) ||
    !(r.rideId === null || id(r.rideId)) ||
    !Array.isArray(r.rideHistory) ||
    !Array.isArray(r.dropoffs) ||
    r.dropoffs.length > 2 ||
    !Array.isArray(r.damageEvents) ||
    !object(r.pickup) ||
    !object(r.retreat) ||
    !object(r.abandonment) ||
    !object(r.exitRequests) ||
    !object(r.exitObservations) ||
    !object(r.trip) ||
    !finite(r.trip.distance) ||
    r.trip.distance < 0
  )
    throw Error('Invalid Two Seats physical history.');
  if (r.dropoffs.some((q, i) => q.actorId !== [I.tess, I.nadia][i]))
    throw Error('Unproved ordered passenger delivery.');
  const receipts = [
    ...r.rideHistory,
    ...r.dropoffs,
    r.disarm,
    r.retreat.trigger,
    r.pickup.boarded,
    r.shopEscort,
    ...Object.values(r.retreat.proofs),
    ...Object.values(r.exitRequests),
    ...Object.values(r.exitObservations),
  ].filter(Boolean);
  for (const q of receipts)
    if (
      !id(q.id) ||
      !validScope(q.scope) ||
      !finite(q.at) ||
      q.at < r.startedAt ||
      q.at > s.time + EPS ||
      JSON.stringify(m.activations[q.scope.activationReceipt]?.scope) !== JSON.stringify(q.scope)
    )
      throw Error('Invalid Two Seats observed receipt.');
  if (
    r.dropoffs.some(
      (q, i) =>
        q.actorId !== [I.tess, I.nadia][i] ||
        q.sceneId !== ['tess-flat', 'voss-dispatch'][i] ||
        !point(q.actorPose) ||
        q.actorPose.sceneId !== q.sceneId ||
        !point(q.vehiclePose) ||
        !finite(q.exitObservedAt) ||
        q.exitObservedAt > q.at ||
        (i > 0 && q.at < r.dropoffs[i - 1].at),
    )
  )
    throw Error('Unproved ordered passenger delivery.');
  for (const actorId of Object.keys(r.exitRequests)) {
    const q = r.exitRequests[actorId],
      i = [I.tess, I.nadia].indexOf(actorId),
      retained = i === 0 ? [I.felix, I.nadia] : [I.felix];
    if (
      i < 0 ||
      q.actorId !== actorId ||
      q.scope.stageId !== 'home' ||
      !id(q.vehicleId) ||
      !point(q.vehiclePose) ||
      scene(q.vehiclePose) !== null ||
      !finite(q.vehicleAngle) ||
      !finite(q.vehicleSpeed) ||
      !finite(q.vehicleHealth) ||
      q.vehicleHealth <= 0 ||
      !id(q.vehicleSpec) ||
      !point(q.bay) ||
      !finite(q.bay.w) ||
      q.bay.w <= 0 ||
      !finite(q.bay.h) ||
      q.bay.h <= 0 ||
      Math.abs(q.vehicleSpeed) > (q.bay.maxSpeed ?? 5) + EPS ||
      !point(q.target) ||
      scene(q.target) !== ['tess-flat', 'voss-dispatch'][i] ||
      !Array.isArray(q.retainedSeats) ||
      q.retainedSeats.length !== retained.length ||
      retained.some(
        (id, n) =>
          q.retainedSeats[n]?.actorId !== id ||
          q.retainedSeats[n].vehicleId !== q.vehicleId ||
          !q.retainedSeats[n].alive ||
          q.retainedSeats[n].seat !== (id === I.felix ? 2 : 1),
      ) ||
      (i === 1 && (!r.dropoffs[0] || q.at < r.dropoffs[0].at))
    )
      throw Error('Unproved parked passenger exit request.');
  }
  for (const [actorId, q] of Object.entries(r.exitObservations)) {
    const request = r.exitRequests[actorId];
    if (
      !request ||
      q.actorId !== actorId ||
      q.scope.stageId !== 'home' ||
      q.requestId !== request.id ||
      q.vehicleId !== request.vehicleId ||
      !point(q.actorPose) ||
      q.at < request.at
    )
      throw Error('Unproved physical passenger exit.');
  }
  for (const q of r.dropoffs) {
    const request = r.exitRequests[q.actorId],
      exited = r.exitObservations[q.actorId];
    if (
      !request ||
      !exited ||
      q.scope.stageId !== 'home' ||
      q.vehicleId !== request.vehicleId ||
      q.exitRequestId !== request.id ||
      q.exitObservationId !== exited.id ||
      q.exitObservedAt !== exited.at ||
      JSON.stringify(q.vehiclePose) !== JSON.stringify(request.vehiclePose) ||
      JSON.stringify(q.target) !== JSON.stringify(request.target) ||
      !near(q.actorPose, q.target)
    )
      throw Error('Dropoff lacks its actual exit and target observations.');
  }
  if (r.dropoffs.length && !r.pickup.boarded) throw Error('Dropoff lacks actual shared pickup.');
  if (
    r.pickup.boarded &&
    (!Array.isArray(r.pickup.boarded.seats) ||
      r.pickup.boarded.seats.length !== 3 ||
      ![I.felix, I.nadia, I.tess].every(
        (id, i) =>
          r.pickup.boarded.seats[i].actorId === id &&
          r.pickup.boarded.seats[i].seat === [2, 1, 3][i] &&
          r.pickup.boarded.seats[i].alive &&
          r.pickup.boarded.seats[i].vehicleId === r.pickup.boarded.vehicleId,
      ))
  )
    throw Error('Unproved three distinct physical passenger seats.');
  if (
    r.disarm &&
    (r.disarm.receipt?.targetId !== I.dax ||
      r.disarm.receipt.weapon !== 'knife' ||
      r.disarm.receipt.destination !== 'ground' ||
      r.disarm.receipt.method !== 'guard-disarm' ||
      r.disarm.receipt.at < r.startedAt)
  )
    throw Error('Unproved actual Dax disarm.');
  if (
    r.retreat.trigger &&
    (!r.disarm ||
      !r.injury ||
      r.retreat.trigger.disarmId !== r.disarm.receipt.id ||
      r.retreat.trigger.injuryId !== r.injury.id ||
      r.retreat.trigger.staggerRemaining <= 0)
  )
    throw Error('Unproved actual surrender trigger.');
  for (const actorId of [I.dax, I.pel]) {
    const q = r.retreat.proofs[actorId];
    if (
      q &&
      (!r.retreat.trigger ||
        q.actorId !== actorId ||
        q.alive !== true ||
        !near(q.actorPose, q.target))
    )
      throw Error('Unproved physical collector retreat.');
  }
  if (r.damageEvents.length > TWO_SEATS_DAMAGE_HISTORY_LIMIT)
    throw Error('Two Seats damage history exceeds its limit.');
  // Calendar receipts store world hours, so recover their real simulation
  // occurrence from the ordered accumulated sleep offsets. An event may not
  // omit earlier sleep and thereby shorten its 48-hour injury on Continue.
  const restTimeline = Object.entries(s.calendar.receipts).sort(
    (a, b) => a[1].startedAt - b[1].startedAt,
  );
  let restOffset = 0,
    lastRestTime = -EPS;
  const restOccurrences = restTimeline.map(([key, rest]) => {
    const at = (rest.startedAt - s.calendar.startHours - restOffset) * 90;
    if (at < -EPS || at > s.time + EPS || at + EPS < lastRestTime)
      throw Error('Inconsistent real rest occurrence in Two Seats calendar.');
    lastRestTime = at;
    restOffset += rest.hours;
    return { key, at };
  });
  const damageIds = new Set();
  for (const e of r.damageEvents) {
    if (
      !id(e.id) ||
      damageIds.has(e.id) ||
      !validScope(e.scope) ||
      !finite(e.at) ||
      e.at < r.startedAt ||
      e.at > s.time + EPS ||
      !id(e.targetId) ||
      !id(e.owner) ||
      !id(e.kind) ||
      !point(e) ||
      typeof e.civilian !== 'boolean' ||
      !['healthBefore', 'healthAfter', 'armourBefore', 'armourAfter'].every(
        (k) => finite(e[k]) && e[k] >= 0,
      ) ||
      e.healthAfter > e.healthBefore ||
      e.armourAfter > e.armourBefore ||
      (e.healthAfter === e.healthBefore && e.armourAfter === e.armourBefore) ||
      !finite(e.worldHours) ||
      e.worldHours > worldHours(s) + EPS ||
      !finite(e.calendarOffsetHours) ||
      e.calendarOffsetHours < 0 ||
      e.calendarOffsetHours > s.calendar.offsetHours + EPS ||
      !Array.isArray(e.calendarReceiptIds) ||
      new Set(e.calendarReceiptIds).size !== e.calendarReceiptIds.length
    )
      throw Error('Invalid committed Two Seats damage event.');
    const anchors = e.calendarReceiptIds.map((key) => s.calendar.receipts[key]);
    if (
      restOccurrences.some(
        ({ key, at }) =>
          (at + EPS < e.at && !e.calendarReceiptIds.includes(key)) ||
          (at > e.at + EPS && e.calendarReceiptIds.includes(key)),
      ) ||
      e.calendarReceiptIds.some((key, i) => key !== restOccurrences[i]?.key) ||
      anchors.some((a) => !a || !finite(a.hours) || a.endedAt > e.worldHours + EPS) ||
      Math.abs(anchors.reduce((n, a) => n + a.hours, 0) - e.calendarOffsetHours) > EPS ||
      Math.abs(s.calendar.startHours + e.at / 90 + e.calendarOffsetHours - e.worldHours) > EPS
    )
      throw Error('Unproved damage calendar anchor.');
    damageIds.add(e.id);
  }
  for (const t of Object.values(r.abandonment))
    if (!finite(t) || t < 0) throw Error('Invalid actual escort separation time.');
  if (
    r.shopEscort &&
    (r.shopEscort.actorId !== I.felix ||
      r.shopEscort.scope.stageId !== 'workwear' ||
      !point(r.shopEscort.fromPose) ||
      !point(r.shopEscort.target) ||
      !(r.shopEscort.vehicleId === null || id(r.shopEscort.vehicleId)))
  )
    throw Error('Unproved Felix shop transfer request.');
  if (r.contact && r.dropoffs.length !== 2)
    throw Error('Tess contact precedes ordered home delivery.');
  if (
    r.outfit &&
    (!r.voucher ||
      !r.contact ||
      r.outfit.payment !== 'cooperative-voucher' ||
      !SOURCE.stages.find((x) => x.id === 'workwear').stock.includes(r.outfit.outfitId))
  )
    throw Error('Unproved voucher outfit purchase.');
  for (const [key, q] of Object.entries(m.activations))
    if (
      !id(key) ||
      !validScope(q.scope) ||
      q.scope.activationReceipt !== key ||
      !finite(q.at) ||
      q.at > s.time + EPS
    )
      throw Error('Invalid Two Seats activation receipt.');
  return true;
}
