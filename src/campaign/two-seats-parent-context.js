/** Production-boundary M3 factory. No simulation import. The engine owns physical
 * movement, hostile AI/law, health commits, portals, full save validation and art. */
import * as Companions from '../companions.js';
import * as Phone from '../phone-calls.js';
import {
  createClothingService,
  starterOutfitVoucherId,
  validateClothingServices,
} from '../clothing-service.js';
import { worldHours } from '../calendar.js';
import {
  TWO_SEATS_APPEARANCES,
  TWO_SEATS_WRIST_BANDAGE as WRIST_BANDAGE,
} from './two-seats-scenes.js';
import { validateCombatSave } from '../combat.js';
import { FIRST_ARC_MISSIONS, FIRST_ARC_SUPPORTING_CAST } from './first-arc.js';
import {
  TWO_SEATS_IDS as I,
  initializeTwoSeatsRuntime,
  validateTwoSeatsRuntime,
} from './two-seats-runtime.js';
export const TWO_SEATS_WRIST_IMPAIRMENT = Object.freeze({
  affectedHand: 'right',
  damageScale: 0.5,
  recoveryScale: 1.5,
  hours: 48,
});
const SOURCE = FIRST_ARC_MISSIONS.find((m) => m.id === I.mission),
  EPS = 1e-6;
const object = (v) => v && typeof v === 'object' && !Array.isArray(v),
  finite = (v) => typeof v === 'number' && Number.isFinite(v),
  id = (v) =>
    typeof v === 'string' &&
    /^[a-z0-9][a-z0-9:._-]{0,159}$/i.test(v) &&
    !['__proto__', 'prototype', 'constructor', 'toJSON'].includes(v),
  point = (v) => object(v) && [v.x, v.y, v.z ?? 0].every(finite),
  scene = (v) => v?.sceneId ?? null,
  pose = (v) => ({ x: v.x, y: v.y, z: v.z ?? 0, sceneId: scene(v) }),
  distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  same = (a, b) => JSON.stringify(a) === JSON.stringify(b),
  accepted = (v) => v === true || v?.ok === true,
  gate = (reason) => ({ ok: false, unmet: [reason] }),
  funcs = (p, keys) => keys.every((k) => typeof p?.[k] === 'function');
function copy(v) {
  let n = 0;
  const seen = new Set();
  function visit(x, d = 0) {
    if (++n > 500000 || d > 100) throw Error('Two Seats parent JSON limit.');
    if (x === null || typeof x === 'string' || typeof x === 'boolean' || finite(x)) return x;
    if (
      !x ||
      typeof x !== 'object' ||
      seen.has(x) ||
      ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(x))
    )
      throw Error('Unsafe Two Seats parent JSON.');
    seen.add(x);
    const o = Array.isArray(x) ? [] : {};
    for (const k of Reflect.ownKeys(x)) {
      if (k === 'length' && Array.isArray(x)) continue;
      const p = Object.getOwnPropertyDescriptor(x, k);
      if (
        typeof k !== 'string' ||
        ['__proto__', 'prototype', 'constructor', 'toJSON'].includes(k) ||
        !p?.enumerable ||
        !Object.hasOwn(p, 'value')
      )
        throw Error('Unsafe Two Seats property.');
      o[k] = visit(p.value, d + 1);
    }
    if (Array.isArray(x) && Object.keys(o).length !== x.length)
      throw Error('Sparse Two Seats array.');
    seen.delete(x);
    return o;
  }
  return visit(v);
}
function sync(fn, ...args) {
  const r = typeof fn === 'function' ? fn(...args) : undefined;
  if (r && typeof r.then === 'function') throw Error('Two Seats engine must be synchronous.');
  return r;
}
const scope = (s) => {
  const a = s.twoSeatsRuntime?.active;
  return a
    ? { missionId: I.mission, stageId: a.stageId, attempt: a.attempt, activationReceipt: a.receipt }
    : null;
};
const scopeValid = (q) =>
  object(q) &&
  q.missionId === I.mission &&
  SOURCE.stages.some((x) => x.id === q.stageId) &&
  Number.isSafeInteger(q.attempt) &&
  q.attempt > 0 &&
  id(q.activationReceipt);
function committedScope(s, q, phase = 'running') {
  const a = s.campaign?.active,
    r = s.campaign?.receipts?.[q?.activationReceipt];
  return (
    scopeValid(q) &&
    same(q, scope(s)) &&
    a?.missionId === I.mission &&
    a.stageId === q.stageId &&
    a.attempt === q.attempt &&
    a.phase === phase &&
    s.twoSeatsRuntime.active.phase === phase &&
    r?.kind === 'stage-activation' &&
    r.missionId === I.mission &&
    r.stageId === q.stageId &&
    r.attempt === q.attempt
  );
}
const near = (a, b, r = b?.radius ?? 8) =>
  point(a) &&
  point(b) &&
  scene(a) === scene(b) &&
  Math.abs((a.z ?? 0) - (b.z ?? 0)) <= 3 &&
  distance(a, b) <= r + EPS;
export function initializeTwoSeatsParentState(s) {
  initializeTwoSeatsRuntime(s);
  Companions.initializeCompanions(s);
  Phone.initializePhoneCalls(s);
  s.twoSeatsEffects ??= {
    version: 1,
    receipts: {},
    injuries: {},
    dressings: {},
    shop: { clerkIndex: 0 },
  };
  if (s.twoSeatsEffects.version !== 1) throw Error('Unsupported Two Seats parent ledger.');
  return s.twoSeatsEffects;
}
export function twoSeatsWristView(s, actorId = I.dax) {
  const m = s.twoSeatsEffects,
    record = Object.values(m?.injuries ?? {}).find((r) => r.actorId === actorId);
  if (!record) return null;
  const dressing = m.dressings[record.id],
    active = worldHours(s) + EPS < record.expiresAtHours;
  return {
    id: record.id,
    actorId,
    hand: 'right',
    affectedHand: 'right',
    active,
    expiresAt: record.expiresAtHours,
    damageScale: active ? TWO_SEATS_WRIST_IMPAIRMENT.damageScale : 1,
    recoveryScale: active ? TWO_SEATS_WRIST_IMPAIRMENT.recoveryScale : 1,
    remainingHours: Math.max(0, record.expiresAtHours - worldHours(s)),
    bandageVisible: !!dressing && dressing.removedBy === null,
    bandage: copy(record.bandage),
    receipt: copy(record),
  };
}
export function createTwoSeatsParentContext(state, engine = {}) {
  initializeTwoSeatsParentState(state);
  const authored = copy(engine.authoredMission ?? SOURCE),
    supplied =
      typeof engine.bindings === 'function'
        ? sync(engine.bindings)
        : (engine.bindings ?? engine.world?.campaignSceneBindings ?? {}),
    b = copy(supplied),
    d = b.dispatch,
    station = b['boardwalk-station'],
    flat = b['tess-flat'],
    shop = b['pier-goods'];
  const geometry = () =>
    engine.ready?.geometry === true &&
    engine.sceneReport?.ready === true &&
    Array.isArray(engine.actorDefinitions) &&
    [
      [I.tess, TWO_SEATS_APPEARANCES.tess],
      [I.dax, TWO_SEATS_APPEARANCES.dax],
      [I.pel, TWO_SEATS_APPEARANCES.pel],
      [I.bea, TWO_SEATS_APPEARANCES.bea],
    ].every(([id, appearance]) =>
      engine.actorDefinitions.some((a) => a.id === id && same(a.appearance, appearance)),
    ) &&
    engine.actorDefinitions.every((a) => ![I.felix, I.nadia].includes(a.id)) &&
    funcs(engine.rooms, ['hasRoom', 'hasPortal', 'layout']) &&
    ['voss-dispatch', 'tess-flat', 'pier-goods'].every(
      (id) => sync(engine.rooms.hasRoom, id) === true,
    ) &&
    ['voss-dispatch-entry', 'dockside-rooms-entry', 'tess-flat-entry', 'pier-goods-entry'].every(
      (id) => sync(engine.rooms.hasPortal, id) === true,
    ) &&
    funcs(engine.companionContext, [
      'moveBody',
      'isBlocked',
      'hasLineOfSight',
      'surfaceHeight',
      'findRoute',
      'transitionScene',
    ]);
  if (d && engine.rooms?.layout) {
    const layout = sync(engine.rooms.layout, 'voss-dispatch'),
      mark = layout?.actors.find((a) => a.castId === 'felix-voss');
    if (mark) d.felixTarget = { ...mark, z: layout.floorZ, sceneId: layout.id, radius: 10 };
  }
  if (flat && !flat.dropoffTarget && flat.interiorWalk?.length)
    flat.dropoffTarget = { ...flat.interiorWalk.at(-1), sceneId: flat.roomId, radius: 10 };
  if (shop) {
    const layout = sync(engine.rooms?.layout, shop.roomId);
    shop.hook ??= layout?.hooks.find((h) => h.service === 'pier-goods-selector');
    shop.felixMark ??=
      (shop.felixDialogueMark ?? shop.felixServiceMark)
        ? { ...(shop.felixDialogueMark ?? shop.felixServiceMark), sceneId: shop.roomId, radius: 8 }
        : null;
    shop.clerkServiceMark ??= shop.beaServiceMark;
    shop.clerkWalk ??= shop.beaToService;
  }
  for (const key of ['dispatch', 'boardwalk-station', 'tess-flat', 'pier-goods'])
    if (b[key]) b[key].ready = geometry();
  const actor = (s, id) => Companions.getActor(s, id);
  const definitions = () =>
    Array.isArray(engine.actorDefinitions) ? copy(engine.actorDefinitions) : [];
  const sight = (s, a, c, sceneId = scene(a)) => {
    // Only an unscoped geometric query point inherits the query scene. Actual
    // actors keep their saved room/layer; this never borrows an exterior body.
    const plainPoint =
        object(c) && !['sceneId', 'scene', 'id', 'health', 'kind'].some((k) => Object.hasOwn(c, k)),
      target = plainPoint ? { ...c, sceneId } : c;
    return (
      geometry() &&
      point(a) &&
      point(target) &&
      scene(a) === sceneId &&
      scene(target) === sceneId &&
      sync(engine.companionContext.hasLineOfSight, a, target, sceneId) === true
    );
  };
  const enemyReady = () =>
    engine.enemies?.ready === true &&
    funcs(engine.enemies, ['register', 'engage', 'retreat', 'release', 'observe']) &&
    engine.ready?.hostility === true;
  const combatReady = () =>
    engine.ready?.disarm === true &&
    engine.disarmObserverBound === true &&
    typeof engine.damageActor === 'function';
  const injuryReady = () =>
    combatReady() && engine.ready?.injuryArt === true && engine.ready?.handImpairment === true;
  const observedEnemy = (s, id, q) => {
    const observed = sync(engine.enemies?.observe, s, id),
      a = actor(s, id);
    return a &&
      observed?.actorId === id &&
      same(observed.scope, q) &&
      observed.alive === a.health > 0 &&
      observed.weapon === a.weapon &&
      same(observed.pose, pose(a))
      ? observed
      : null;
  };
  function parentReceipt(s, id, kind, q, proof) {
    const m = initializeTwoSeatsParentState(s),
      r = { id, kind, status: 'committed', at: s.time, scope: copy(q), proof: copy(proof) };
    if (m.receipts[id]) return same(m.receipts[id], r) ? m.receipts[id] : null;
    m.receipts[id] = r;
    return r;
  }
  const verifyReceipt = (s, r) => !!r && same(s.twoSeatsEffects?.receipts?.[r.id], r);
  const validateDisarm = (s, r) => {
    try {
      validateCombatSave(s, engine.world);
      const dax = actor(s, I.dax),
        drop = s.pickups.find((x) => x.id === r.dropId);
      return (
        r.targetId === I.dax &&
        r.weapon === 'knife' &&
        r.method === 'guard-disarm' &&
        r.owner === 'player' &&
        r.destination === 'ground' &&
        r.hand === 'right' &&
        dax?.health > 0 &&
        dax.weapon === 'unarmed' &&
        same(s.player.lastDisarm, r) &&
        same(dax.disarmReceipt, r) &&
        ((drop?.type === 'weapon' &&
          drop.weapon === 'knife' &&
          drop.ammo === 0 &&
          near(drop, r.targetPose, EPS)) ||
          (!drop && same(s.twoSeatsRuntime.run.disarm?.receipt, r)))
      );
    } catch {
      return false;
    }
  };
  const injuries = {
    get ready() {
      return injuryReady();
    },
    apply(s, request) {
      request = copy(request);
      const old = s.twoSeatsEffects.injuries[request.id];
      if (old)
        return old.disarmId === request.disarm.id && old.actorId === request.actorId
          ? { ok: true, replayed: true, receipt: copy(old) }
          : gate('wrist-injury-receipt-conflict');
      if (
        !combatReady() ||
        !committedScope(s, request.scope) ||
        request.actorId !== I.dax ||
        request.damage !== 8 ||
        request.durationHours !== 48 ||
        request.hand !== 'right' ||
        !validateDisarm(s, request.disarm) ||
        !same(d?.encounter?.injury?.bandage, WRIST_BANDAGE)
      )
        return gate('actual-guarded-wrist-injury-unavailable');
      const originalDirector = s.campaign,
        oldEpoch = s.twoSeatsRuntime.restoreEpoch;
      const beforeWorld = snapshots.capture(s, { exclude: ['campaign'] });
      const rollback = () => {
        const restored = sync(engine.snapshots.restore, s, copy(beforeWorld), {
          reason: 'rollback:wrist-injury',
          preserve: ['campaign'],
          invalidateRailDispatcher: true,
        });
        if (!accepted(restored)) throw Error('Wrist injury rollback failed.');
        s.campaign = originalDirector;
        const current = initializeTwoSeatsRuntime(s);
        current.restoreEpoch = Math.max(oldEpoch, current.restoreEpoch) + 1;
        current.lastObservedTime = s.time;
        current.lastRestoreReason = 'rollback:wrist-injury';
      };
      try {
        const a = actor(s, I.dax),
          before = { health: a.health, armour: a.armour ?? 0 },
          result = sync(engine.damageActor, s, a.id, 8, {
            owner: 'player',
            kind: 'guard-disarm-wrist',
            sceneId: scene(a),
            disarmId: request.disarm.id,
            hand: 'right',
          });
        const applied = before.health - a.health + before.armour - (a.armour ?? 0),
          event = s.twoSeatsRuntime.run.damageEvents.find(
            (e) =>
              e.targetId === I.dax &&
              e.owner === 'player' &&
              e.kind === 'guard-disarm-wrist' &&
              e.at === s.time &&
              e.healthBefore === before.health &&
              e.healthAfter === a.health &&
              e.armourBefore === before.armour &&
              e.armourAfter === (a.armour ?? 0),
          );
        if (
          !accepted(result) ||
          Math.abs(applied - Math.min(8, before.health + before.armour)) > EPS ||
          !event
        ) {
          rollback();
          return gate('actual-eight-damage-wrist-commit-not-observed');
        }
        const startedAtHours = event.worldHours,
          record = {
            id: request.id,
            kind: 'right-wrist-injury',
            status: 'committed',
            actorId: I.dax,
            hand: 'right',
            disarmId: request.disarm.id,
            scope: copy(request.scope),
            at: s.time,
            startedAtHours,
            expiresAtHours: startedAtHours + TWO_SEATS_WRIST_IMPAIRMENT.hours,
            impairment: copy(TWO_SEATS_WRIST_IMPAIRMENT),
            healthBefore: before.health,
            healthAfter: a.health,
            armourBefore: before.armour,
            armourAfter: a.armour ?? 0,
            damageRequested: 8,
            damageApplied: applied,
            damageReceiptId: event.id,
            fatal: a.health <= 0,
            bandage: copy(d.encounter.injury.bandage),
          };
        s.twoSeatsEffects.injuries[record.id] = record;
        s.twoSeatsEffects.dressings[record.id] = { injuryId: record.id, removedBy: null };
        a.storyInjuryIds ??= [];
        if (!a.storyInjuryIds.includes(record.id)) a.storyInjuryIds.push(record.id);
        return { ok: true, receipt: copy(record) };
      } catch (error) {
        rollback();
        throw error;
      }
    },
    verifyReceipt(s, r) {
      return (
        !!r &&
        same(s.twoSeatsEffects?.injuries?.[r.id], r) &&
        actor(s, r.actorId)?.storyInjuryIds?.includes(r.id)
      );
    },
    view: twoSeatsWristView,
  };
  const hostiles = {
    get ready() {
      return enemyReady();
    },
    activate(s, request) {
      if (
        !enemyReady() ||
        !committedScope(s, request.scope) ||
        request.scope.stageId !== 'dispatch-threat' ||
        !same(request.actors, [I.dax, I.pel])
      )
        return gate('actual-named-hostility-unavailable');
      const proofs = [];
      for (const id of request.actors) {
        const result = sync(engine.enemies.register, s, { actorId: id, scope: request.scope });
        if (!accepted(result)) return gate('named-hostile-registration-declined');
        const observed = observedEnemy(s, id, request.scope);
        if (!observed || !['threat', 'combat', 'retreat', 'retreated'].includes(observed.mode))
          return gate('named-hostile-registration-not-observed');
        proofs.push(copy(observed));
      }
      const receipt = parentReceipt(
        s,
        `two-seats:threat:${request.scope.attempt}:${request.scope.activationReceipt}`,
        'named-threat',
        request.scope,
        proofs,
      );
      return receipt ? { ok: true, receipt } : gate('named-threat-receipt-conflict');
    },
    engage(s, q) {
      if (!enemyReady() || !committedScope(s, q)) return gate('unowned-hostile-engagement');
      for (const id of [I.dax, I.pel])
        if (!accepted(sync(engine.enemies.engage, s, id, q)))
          return gate('actual-hostile-engagement-declined');
      return { ok: true };
    },
    beginRetreat(s, request) {
      if (
        !enemyReady() ||
        !committedScope(s, request.scope) ||
        !s.twoSeatsRuntime.run.retreat.trigger ||
        ![I.dax, I.pel].includes(request.actorId)
      )
        return gate('actual-surrender-trigger-required');
      return sync(engine.enemies.retreat, s, request.actorId, request.target, request.scope);
    },
    completeRetreat(s, request) {
      const a = actor(s, request.actorId),
        observed = observedEnemy(s, request.actorId, request.scope);
      if (
        !enemyReady() ||
        !committedScope(s, request.scope) ||
        !a ||
        a.health <= 0 ||
        !near(a, request.proof.target) ||
        !observed ||
        !['retreat', 'retreated'].includes(observed.mode)
      )
        return gate('real-collector-exit-arrival-required');
      if (!accepted(sync(engine.enemies.release, s, a.id, request.scope)))
        return gate('real-retreat-release-declined');
      const receipt = parentReceipt(
        s,
        request.proof.id + ':parent',
        'retreat-arrival',
        request.scope,
        { actorId: a.id, actorPose: pose(a), target: request.proof.target, observed },
      );
      return receipt ? { ok: true, receipt } : gate('retreat-receipt-conflict');
    },
    verifyReceipt,
    observe: (s, id) => sync(engine.enemies?.observe, s, id),
  };
  function orderedHome(s) {
    const r = s.twoSeatsRuntime.run;
    return (
      r.dropoffs.length === 2 &&
      [I.tess, I.nadia].every(
        (id, i) =>
          r.dropoffs[i].actorId === id &&
          actor(s, id)?.health > 0 &&
          near(actor(s, id), i === 0 ? flat.dropoffTarget : d.felixTarget),
      ) &&
      r.pickup.boarded &&
      s.campaign?.active?.missionId === I.mission
    );
  }
  const contactOwner = (q) => ({
    missionId: q.missionId,
    stageId: q.stageId,
    attempt: q.attempt,
    receipt: q.activationReceipt,
  });
  const friendContext = {
    ownerStatus: (s, o) =>
      committedScope(s, {
        missionId: o.missionId,
        stageId: o.stageId,
        attempt: o.attempt,
        activationReceipt: o.receipt,
      })
        ? 'active'
        : 'unknown',
    observe: (s, c) =>
      c.type === 'dropoffs-complete' && same(c, Phone.tessContactRequirement(authored))
        ? orderedHome(s)
        : { unmet: 'unknown-real-contact-condition' },
  };
  const friendship = {
    get ready() {
      return engine.ready?.friendship === true;
    },
    addTess(s, request) {
      if (!committedScope(s, request.scope) || request.scope.stageId !== 'home' || !orderedHome(s))
        return gate('actual-ordered-tess-contact-proof-required');
      const result = Phone.addPhoneContact(
        s,
        { id: I.tess, name: actor(s, I.tess).name },
        contactOwner(request.scope),
        Phone.tessContactRequirement(authored),
        request.id,
        friendContext,
      );
      return result.ok
        ? { ok: true, receipt: copy(s.phoneCalls.contactReceipts[request.id]) }
        : result;
    },
    verifyReceipt(s, r) {
      try {
        Phone.validatePhoneCalls(s);
        return same(s.phoneCalls.contactReceipts?.[r?.id ?? r?.receipt], r);
      } catch {
        return false;
      }
    },
  };
  const clothingService = createClothingService(state, {
    hasRoom: (id) => geometry() && sync(engine.rooms.hasRoom, id) === true,
    hasLineOfSight: sight,
    verifyGrant(s, request) {
      const r = s.twoSeatsRuntime.run;
      if (
        !committedScope(s, request.scope) ||
        request.scope.stageId !== 'workwear' ||
        !orderedHome(s) ||
        !r.contact ||
        !s.phoneCalls.contacts[I.tess]
      )
        return gate('actual-home-and-tess-contact-required');
      const expected = r.contact.proof?.phoneReceipt,
        contact = expected && s.phoneCalls.contactReceipts[expected.id];
      if (!same(s.twoSeatsEffects.receipts[r.contact.id], r.contact) || !same(contact, expected))
        return gate('actual-contact-ledger-reference-mismatch');
      if (!contact) return gate('actual-tess-contact-receipt-missing');
      return {
        ok: true,
        proof: {
          dropoffs: r.dropoffs.map((q) => ({ actorId: q.actorId, receiptId: q.id })),
          contactReceiptId: contact.id,
        },
      };
    },
    storeObservation(s) {
      if (!geometry() || !shop?.hook) return null;
      return {
        storeId: 'pier-goods',
        sceneId: shop.roomId,
        hook: { ...shop.hook, z: shop.hook.z ?? 0 },
        clerkId: I.bea,
        stock: copy(shop.stock),
        open: true,
      };
    },
  });
  const clothing = {
    get ready() {
      return engine.ready?.clothing === true && clothingService.ready;
    },
    grantVoucher: (s, r) =>
      clothingService.grantVoucher(s, { ...r, id: starterOutfitVoucherId(s) }),
    purchaseAndEquip: clothingService.purchaseAndEquip,
    receipt: clothingService.receipt,
    verify: clothingService.verify,
  };
  function restartScope(s, action, request) {
    const q = request.directorRequest,
      c = s.campaign,
      run =
        c?.active ??
        c?.suspended?.find(
          (x) => x.missionId === I.mission && x.resumeInfo?.reason === 'return-to-free-roam',
        ),
      attempt = (c?.attempts?.[I.mission] ?? 0) + 1,
      token = `campaign:${c?.receiptNamespace ?? c?.contentFingerprint}:${I.mission}:attempt:${attempt}:restart`;
    return action.type === 'mission-restarted' &&
      action.missionId === I.mission &&
      q?.kind === 'restart' &&
      q.receipt === token &&
      q.attempt === attempt &&
      q.stageId === run?.stageId &&
      s.twoSeatsRuntime.lastRestoreReason === 'retry:start' &&
      run.checkpoints.some((x) => x.id === 'start')
      ? { missionId: I.mission, stageId: q.stageId, attempt, activationReceipt: token }
      : null;
  }
  function lifecycleScope(s, action, request) {
    const q = request.scope,
      call = request.directorRequest,
      c = s.campaign,
      prefix = `campaign:${c?.receiptNamespace ?? c?.contentFingerprint}:${I.mission}:attempt:${q?.attempt}`;
    if (
      !scopeValid(q) ||
      call?.missionId !== q.missionId ||
      call.stageId !== q.stageId ||
      call.attempt !== q.attempt ||
      call.sequence !== c?.sequence ||
      action.missionId !== I.mission
    )
      return false;
    if (action.type === 'mission-suspended')
      return (
        committedScope(s, q) &&
        call.kind === 'suspend' &&
        call.receipt === `${prefix}:suspend:${call.sequence}`
      );
    if (
      action.type !== 'mission-abandoned' ||
      call.kind !== 'abandon' ||
      call.receipt !== `${prefix}:abandon`
    )
      return false;
    if (committedScope(s, q)) return true;
    if (!committedScope(s, q, 'failed')) return false;
    const run = c.active,
      failure = run.failure,
      token = `${prefix}:failure:${failure?.sequence - 1}`,
      receipt = c.receipts[token],
      history = c.history.find((h) => h.sequence === failure?.sequence),
      definition =
        authored.failures.find((f) => f.id === failure?.id) ??
        (authored.commonFailures.includes(failure?.id)
          ? { condition: { type: failure.id }, resumeCheckpoint: 'start' }
          : null);
    return !!(
      definition &&
      failure.stageId === q.stageId &&
      failure.resumeCheckpoint === definition.resumeCheckpoint &&
      receipt?.kind === 'failure' &&
      receipt.missionId === I.mission &&
      receipt.stageId === q.stageId &&
      receipt.attempt === q.attempt &&
      history?.event === 'mission-failed' &&
      history.missionId === I.mission &&
      history.stageId === q.stageId &&
      history.attempt === q.attempt &&
      history.failureId === failure.id &&
      Object.values(s.twoSeatsEffects.receipts).some(
        (r) =>
          r.kind === 'mission-failed' &&
          r.status === 'committed' &&
          same(r.scope, q) &&
          r.directorReceipt === token &&
          r.action?.failureId === failure.id &&
          same(r.action.condition, definition.condition) &&
          r.action.resumeCheckpoint === failure.resumeCheckpoint,
      )
    );
  }
  const effects = {
    apply(s, action, request) {
      action = copy(action);
      request = copy(request);
      const q =
        action.type === 'mission-restarted' ? restartScope(s, action, request) : request.scope;
      const lifecycle = ['mission-abandoned', 'mission-suspended'].includes(action.type);
      if (
        !scopeValid(q) ||
        (lifecycle
          ? !lifecycleScope(s, action, request)
          : action.type !== 'mission-restarted' && !committedScope(s, q))
      )
        return gate('unowned-two-seats-effect');
      const ledger = s.twoSeatsEffects.receipts,
        old = ledger[request.id];
      if (old)
        return same(old.action, action) && same(old.scope, q)
          ? {
              ok: true,
              replayed: true,
              receipt: copy(old),
              purchaseReceipt: old.proof?.purchaseReceipt,
            }
          : gate('two-seats-effect-conflict');
      let proof = null,
        purchaseReceipt = null;
      if (action.type === 'contact-added') {
        if (action.actor !== I.tess) return gate('unknown-social-contact');
        const result = friendship.addTess(s, { id: request.id + ':contact', scope: q });
        if (!result.ok) return result;
        proof = { phoneReceipt: result.receipt };
      } else if (action.type === 'equip-outfit') {
        if (
          q.stageId !== 'workwear' ||
          !authored.stages.find((x) => x.id === 'workwear').stock.includes(action.id) ||
          s.campaign.active.dialogue.index < 3 ||
          !s.twoSeatsRuntime.run.voucher
        )
          return gate('actual-workwear-choice-not-ready');
        const result = clothing.purchaseAndEquip(s, {
          id: request.id + ':purchase',
          scope: q,
          voucherId: s.twoSeatsRuntime.run.voucher.id,
          storeId: 'pier-goods',
          outfitId: action.id,
        });
        if (!result.ok) return result;
        purchaseReceipt = result.receipt;
        proof = { purchaseReceipt };
      } else if (action.type === 'campaign-reward') {
        const r = s.twoSeatsRuntime.run;
        if (
          !same(action.rewards, authored.rewards) ||
          q.stageId !== 'workwear' ||
          !r.outfit ||
          !clothing.verify(s, r.outfit) ||
          s.wardrobe.equipped !== r.outfit.outfitId ||
          !r.contact ||
          s.campaign.active.dialogue.index !==
            authored.stages.find((x) => x.id === 'workwear').dialogue.length ||
          !shopReady(s)
        )
          return gate('actual-complete-outfit-story-required');
        proof = {
          purchaseId: r.outfit.id,
          contactId: r.contact.id,
          dropoffIds: r.dropoffs.map((x) => x.id),
          cash: 0,
        };
      } else if (
        ['mission-failed', 'mission-abandoned', 'mission-suspended', 'mission-restarted'].includes(
          action.type,
        )
      ) {
        if (action.type !== 'mission-failed' && action.missionId !== I.mission)
          return gate('unknown-lifecycle-owner');
        if (action.type === 'mission-failed') {
          const f =
            authored.failures.find((x) => x.id === action.failureId) ??
            (authored.commonFailures.includes(action.failureId)
              ? { condition: { type: action.failureId }, resumeCheckpoint: 'start' }
              : null);
          if (
            !f ||
            !same(f.condition, action.condition) ||
            f.resumeCheckpoint !== action.resumeCheckpoint
          )
            return gate('unknown-authored-failure');
        }
        for (const id of [I.dax, I.pel]) if (enemyReady()) sync(engine.enemies.release, s, id, q);
        proof = { lifecycle: action.type };
      } else return gate('unregistered-two-seats-effect');
      const receipt = {
        id: request.id,
        kind: action.type,
        status: 'committed',
        at: s.time,
        scope: q,
        directorReceipt: request.directorRequest.receipt,
        action,
        proof,
      };
      ledger[receipt.id] = copy(receipt);
      return { ok: true, receipt, purchaseReceipt };
    },
    verifyReceipt,
  };
  function shopReady(s) {
    const f = actor(s, I.felix),
      bea = actor(s, I.bea),
      h = shop?.hook;
    return (
      geometry() &&
      h &&
      s.player.health > 0 &&
      !s.player.vehicleId &&
      scene(s.player) === shop.roomId &&
      f?.health > 0 &&
      bea?.health > 0 &&
      near(f, shop.felixMark) &&
      near(
        bea,
        shop.clerkServiceMark ?? shop.clerkMark ?? { ...shop.beaSpawn, sceneId: shop.roomId },
        8,
      ) &&
      distance(s.player, h) <= h.radius + EPS &&
      sight(s, s.player, f) &&
      sight(s, s.player, bea)
    );
  }
  const snapshots = {
    capture(s, request) {
      const w = copy(sync(engine.snapshots?.capture, s, request));
      if (!object(w) || Object.hasOwn(w, 'campaign'))
        throw Error('Complete director-excluded Two Seats world required.');
      validateTwoSeatsRuntime(w);
      validateTwoSeatsParentState(w);
      if (sync(engine.snapshots?.validate, w) !== true)
        throw Error('Parent rejected complete Two Seats world.');
      return w;
    },
    validate(w) {
      try {
        copy(w);
        validateTwoSeatsRuntime(w);
        validateTwoSeatsParentState(w);
        return !Object.hasOwn(w, 'campaign') && sync(engine.snapshots?.validate, w) === true;
      } catch {
        return false;
      }
    },
    restore(s, w, r) {
      if (!snapshots.validate(w)) return gate('invalid-two-seats-full-world');
      return sync(engine.snapshots.restore, s, copy(w), r);
    },
  };
  return {
    authoredMission: authored,
    world: engine.world,
    bindings: b,
    companionContext: engine.companionContext,
    passengers: Companions,
    get ready() {
      return {
        passengers: engine.ready?.passengers === true && geometry(),
        geometry: geometry(),
        melee: enemyReady() && injuryReady(),
        clothing: clothing.ready,
        friendship: friendship.ready,
        director:
          engine.ready?.director === true &&
          funcs(engine.snapshots, ['capture', 'validate', 'restore']) &&
          engine.damageObserverBound === true,
      };
    },
    actors: {
      definitions,
      prepareShop(s, q) {
        if (
          !geometry() ||
          !committedScope(s, q) ||
          q.stageId !== 'workwear' ||
          !Array.isArray(shop.clerkWalk)
        )
          return gate('real-clerk-service-walk-unintegrated');
        const a = actor(s, I.bea),
          m = s.twoSeatsEffects.shop;
        if (!a || a.health <= 0) return gate('actual-bea-unavailable');
        if (m.clerkIndex >= shop.clerkWalk.length) return { ok: true };
        let target = { ...shop.clerkWalk[m.clerkIndex], sceneId: shop.roomId, radius: 4 };
        if (near(a, target)) {
          m.clerkIndex++;
          if (m.clerkIndex >= shop.clerkWalk.length) return { ok: true };
          target = { ...shop.clerkWalk[m.clerkIndex], sceneId: shop.roomId, radius: 4 };
        }
        return Companions.requestEscort(s, I.bea, target, engine.companionContext);
      },
    },
    hostiles,
    combat: {
      get ready() {
        return combatReady();
      },
      validateReceipt: validateDisarm,
    },
    injuries,
    clothing,
    friendship,
    effects,
    snapshots,
    director: { chooseOption: (s, c, o) => sync(engine.chooseCampaignOption, s, c, o) },
    damage: {
      get ready() {
        return engine.damageObserverBound === true && typeof engine.isCivilian === 'function';
      },
      getTarget: (s, id) =>
        id === 'player' || id === 'LL-CHAR-001'
          ? s.player
          : [
              ...(s.companions?.actors ?? []),
              ...(s.police ?? []),
              ...(s.hostiles ?? []),
              ...(s.pedestrians ?? []),
              ...Object.values(s.interior?.rooms ?? {}).flatMap((r) => r.actors ?? []),
            ].find((a) => a.id === id),
      isCivilian: (s, a, event) => sync(engine.isCivilian, s, a, event),
    },
    observations: {
      playerArrested: (s, since) =>
        finite(s.policeDispatch?.lastArrest?.time) && s.policeDispatch.lastArrest.time >= since,
    },
    rooms: {
      hasRoom: (id) => geometry() && sync(engine.rooms.hasRoom, id) === true,
      hasPortal: (id) => geometry() && sync(engine.rooms.hasPortal, id) === true,
    },
    vehicles: {
      specs: engine.specs,
      availableRide: (s) => {
        const v = s.vehicles.find((v) => v.id === s.player.vehicleId);
        return v?.health > 0 &&
          engine.specs?.[v.spec]?.seats >= 4 &&
          scene(v) === null &&
          !v.policeControlled
          ? v
          : null;
      },
      guidanceRide: (s) =>
        s.vehicles.find(
          (v) =>
            v.health > 0 &&
            engine.specs?.[v.spec]?.seats >= 4 &&
            scene(v) === null &&
            (v.owned || v.stolen),
        ) ?? null,
    },
    dialogue: {
      threatReady: (s) =>
        committedScope(s, scope(s)) &&
        playerScene(s) === 'voss-dispatch' &&
        [I.felix, I.dax, I.pel].every((id) => actor(s, id)?.health > 0) &&
        sight(s, s.player, actor(s, I.dax)),
      shopReady,
    },
    validateState: validateTwoSeatsParentState,
  };
}
function playerScene(s) {
  return s.interior?.active?.roomId ?? scene(s.player);
}
export function validateTwoSeatsParentState(s) {
  validateTwoSeatsRuntime(s);
  const m = copy(s.twoSeatsEffects);
  if (
    !object(m) ||
    m.version !== 1 ||
    !object(m.receipts) ||
    !object(m.injuries) ||
    !object(m.dressings) ||
    !object(m.shop) ||
    Object.keys(m.receipts).length > 4096
  )
    throw Error('Invalid Two Seats parent ledger.');
  if (Object.keys(m.dressings).length !== Object.keys(m.injuries).length)
    throw Error('Orphaned Two Seats dressing.');
  if (
    s.twoSeatsRuntime.run.injury &&
    !same(m.injuries[s.twoSeatsRuntime.run.injury.id], s.twoSeatsRuntime.run.injury)
  )
    throw Error('Runtime wrist injury differs from its physical parent ledger.');
  const run = s.twoSeatsRuntime.run;
  if (
    (run.voucher && !same(s.clothingServices?.grants?.[run.voucher.id], run.voucher)) ||
    (run.outfit &&
      (!same(s.clothingServices?.purchases?.[run.outfit.id], run.outfit) ||
        run.voucher?.spentBy !== run.outfit.id)) ||
    (run.contact && !same(m.receipts[run.contact.id], run.contact))
  )
    throw Error('Two Seats runtime effect mirror differs from its actual parent ledger.');
  const usedDamage = new Set(),
    usedDisarms = new Set();
  for (const [id, r] of Object.entries(m.injuries)) {
    const event = s.twoSeatsRuntime.run.damageEvents.find((e) => e.id === r.damageReceiptId);
    if (
      r.id !== id ||
      r.kind !== 'right-wrist-injury' ||
      r.status !== 'committed' ||
      r.actorId !== I.dax ||
      usedDamage.has(r.damageReceiptId) ||
      usedDisarms.has(r.disarmId) ||
      r.hand !== 'right' ||
      !id.startsWith('two-seats:injury:') ||
      !scopeValid(r.scope) ||
      !finite(r.at) ||
      r.at > s.time + EPS ||
      !finite(r.startedAtHours) ||
      !finite(r.expiresAtHours) ||
      Math.abs(r.expiresAtHours - r.startedAtHours - TWO_SEATS_WRIST_IMPAIRMENT.hours) > EPS ||
      !same(r.impairment, TWO_SEATS_WRIST_IMPAIRMENT) ||
      !['healthBefore', 'healthAfter', 'armourBefore', 'armourAfter'].every(
        (k) => finite(r[k]) && r[k] >= 0,
      ) ||
      Math.abs(r.healthBefore - r.healthAfter + r.armourBefore - r.armourAfter - r.damageApplied) >
        EPS ||
      r.damageRequested !== 8 ||
      r.damageApplied !== Math.min(8, r.healthBefore + r.armourBefore) ||
      !(typeof r.damageReceiptId === 'string' && /^[a-z0-9:._-]+$/i.test(r.damageReceiptId)) ||
      !s.twoSeatsRuntime.run.damageEvents.some((e) => e.id === r.damageReceiptId) ||
      !same(r.bandage, WRIST_BANDAGE) ||
      !event ||
      event.targetId !== r.actorId ||
      event.owner !== 'player' ||
      event.kind !== 'guard-disarm-wrist' ||
      event.at !== r.at ||
      !same(event.scope, r.scope) ||
      !['healthBefore', 'healthAfter', 'armourBefore', 'armourAfter'].every(
        (k) => event[k] === r[k],
      ) ||
      Math.abs(event.worldHours - r.startedAtHours) > EPS ||
      r.fatal !== r.healthAfter <= 0 ||
      r.disarmId !== s.twoSeatsRuntime.run.disarm?.receipt.id ||
      !s.companions?.actors.find((a) => a.id === I.dax)?.storyInjuryIds?.includes(id) ||
      m.dressings[id]?.injuryId !== id ||
      m.dressings[id].removedBy !== null
    )
      throw Error('Unproved finite wrist injury/dressing.');
    usedDamage.add(r.damageReceiptId);
    usedDisarms.add(r.disarmId);
  }
  const allowedKinds = new Set([
    'named-threat',
    'retreat-arrival',
    'contact-added',
    'equip-outfit',
    'campaign-reward',
    'mission-failed',
    'mission-abandoned',
    'mission-suspended',
    'mission-restarted',
  ]);
  for (const [key, r] of Object.entries(m.receipts))
    if (
      !id(key) ||
      r.id !== key ||
      !allowedKinds.has(r.kind) ||
      r.status !== 'committed' ||
      !scopeValid(r.scope) ||
      !finite(r.at) ||
      r.at > s.time + EPS
    )
      throw Error('Invalid Two Seats effect receipt.');
  if (s.clothingServices)
    validateClothingServices(s, {
      expectedNamespace:
        s.campaign?.receiptNamespace ??
        s.campaign?.contentFingerprint ??
        s.clothingServices.namespace,
    });
  Phone.validatePhoneCalls(s);
  return true;
}
