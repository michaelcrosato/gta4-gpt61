/** Versioned physical-geometry conversion, kept separate from signal policy. */
import {
  createRailDispatcher,
  restoreRailDispatch,
  validateRailDispatch,
} from './rail-dispatcher.js';
const copy = (value) => JSON.parse(JSON.stringify(value));
function resources(world) {
  const map = new Map(world.transit.railResources.map((resource) => [resource.id, resource]));
  for (const station of world.transit.stations)
    for (const platform of station.platforms) map.set(`platform:${platform.id}`, platform);
  return map;
}
export function migrateRailDispatchGeometry(saved, fromWorld, toWorld, oldTrains, newTrains, time) {
  const previous = restoreRailDispatch(saved, fromWorld, oldTrains);
  if (!Number.isFinite(time) || time < 0 || Math.abs(previous.time - time) > 1e-7)
    throw Error('Invalid geometry migration signal clock.');
  const next = createRailDispatcher(toWorld, newTrains).snapshot(),
    oldResources = resources(fromWorld),
    newResources = resources(toWorld),
    oldClaims = new Map(previous.reservations.map((claim) => [claim.resourceId, claim]));
  next.time = time;
  next.waiting = copy(previous.waiting);
  next.nextWaitSequence = previous.nextWaitSequence;
  next.stats = copy(previous.stats);
  next.revision = previous.revision + 1;
  let preservedAcquisitions = 0;
  for (const claim of next.reservations) {
    const old = oldClaims.get(claim.resourceId),
      before = oldResources.get(claim.resourceId),
      after = newResources.get(claim.resourceId);
    if (
      old &&
      old.trainId === claim.trainId &&
      old.kind === claim.kind &&
      old.trackId === claim.trackId &&
      old.visits === claim.visits &&
      old.callIndex === claim.callIndex &&
      before &&
      after &&
      JSON.stringify(before) === JSON.stringify(after)
    ) {
      claim.acquiredAt = old.acquiredAt;
      preservedAcquisitions++;
    } else claim.acquiredAt = time;
  }
  validateRailDispatch(next, toWorld, newTrains);
  return {
    state: next,
    report: {
      fromTopology: previous.topology,
      toTopology: next.topology,
      reservations: next.reservations.length,
      preservedAcquisitions,
      newAcquisitions: next.reservations.length - preservedAcquisitions,
      retainedWaits: next.waiting.length,
      retainedWaitSequence: next.nextWaitSequence,
      boundary:
        'Complete safe leg/rear/station claims are atomically reseeded from actual fleet; prior waits/stats/clock remain. Only identical physical resources retain historical acquisition times.',
    },
  };
}
