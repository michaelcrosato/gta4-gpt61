/** Known0.6->standingDispatch migration. Detached, atomic and explicitly bounded. */
import { migrateTransitGeometry, validateTransit, getTransitPassengerPose } from './transit.js';
import {
  validateRailDispatch,
  railDispatchTopology,
  restoreRailDispatch,
} from './rail-dispatcher.js';
import { migrateRailDispatchGeometry } from './rail-dispatch-migration.js';
import { validateRailRuntime } from './rail-runtime.js';
import { migrateDispatchSupports } from './dispatch-support-migration.js';
export const DISPATCH_WORLD_MIGRATION = Object.freeze({
  id: 'lowlight-06-standing-2',
  fromTransit: 'e508a6f5',
  fromSignals: '5f85a86e',
  toTransit: '20092e8a',
  toSignals: '5e39032e',
});
const copy = (value) => JSON.parse(JSON.stringify(value));
export function migrateDispatchSave(serializedOrObject, { fromWorld, toWorld } = {}) {
  const payload =
    typeof serializedOrObject === 'string'
      ? JSON.parse(serializedOrObject)
      : copy(serializedOrObject);
  if (payload?.format !== 'lowlight-save' || payload.version !== 1 || !payload.state)
    throw Error('Unsupported standingDispatch save envelope.');
  const M = DISPATCH_WORLD_MIGRATION,
    reports = [];
  if (
    railDispatchTopology(fromWorld).topology !== M.fromSignals ||
    railDispatchTopology(toWorld).topology !== M.toSignals
  )
    throw Error('Unregistered standingDispatch source/target world.');
  const migrate = (state, path) => {
    if (state.worldGeometryVersion && state.worldGeometryVersion !== M.id)
      throw Error('Unsupported physical geometry migration marker.');
    if (!state.transit || !state.railSignals)
      throw Error('Known0.6 physical checkpoint has no checked fleet/signals.');
    if (
      state.worldGeometryVersion === M.id &&
      (state.transit.topology !== M.toTransit ||
        state.railSignals.topology !== M.toSignals ||
        state.railSignals.topologyEncoding !== 2)
    )
      throw Error('The current physical geometry marker contradicts the saved fleet/signals.');
    if (state.transit.topology === M.toTransit) {
      validateRailRuntime(state, toWorld);
      validateRailDispatch(state.railSignals, toWorld, state.transit.trains);
    } else {
      if (
        state.transit.topology === M.fromTransit &&
        state.railSignals.topologyEncoding === undefined
      )
        state.railSignals = restoreRailDispatch(state.railSignals, fromWorld, state.transit.trains);
      if (
        state.transit.topology !== M.fromTransit ||
        state.railSignals.topology !== M.fromSignals ||
        state.railSignals.topologyEncoding !== 2
      )
        throw Error('Unsupported physical geometry; old claims are not blindly relabeled.');
      validateRailRuntime(state, fromWorld);
      validateTransit(state.transit, fromWorld);
      validateRailDispatch(state.railSignals, fromWorld, state.transit.trains);
      const fleet = migrateTransitGeometry(state.transit, fromWorld, toWorld),
        signals = migrateRailDispatchGeometry(
          state.railSignals,
          fromWorld,
          toWorld,
          state.transit.trains,
          fleet.state.trains,
          fleet.state.time,
        );
      const oldRider = state.transit.passengers.find((p) => p.id === 'mara-voss');
      const supports = migrateDispatchSupports(state, fromWorld, toWorld, { rider: !!oldRider });
      state.transit = fleet.state;
      state.railSignals = signals.state;
      if (oldRider) {
        const pose = getTransitPassengerPose(state.transit, 'mara-voss');
        if (!pose) throw Error('Migrated rider lost its actual train.');
        state.player.x = pose.x;
        state.player.y = pose.y;
        state.player.z = pose.z;
        state.player.groundZ = pose.groundZ;
        state.player.angle = pose.heading;
      }
      validateRailRuntime(state, toWorld);
      validateRailDispatch(state.railSignals, toWorld, state.transit.trains);
      reports.push({
        path,
        fleet: fleet.report,
        signals: signals.report,
        riderRecoupled: !!oldRider,
        supports,
      });
    }
    state.worldGeometryVersion = M.id;
    const runs = [state.campaign?.active, ...(state.campaign?.suspended ?? [])].filter(Boolean);
    for (const [runIndex, run] of runs.entries())
      for (const [index, checkpoint] of (run.checkpoints ?? []).entries())
        migrate(
          checkpoint.world,
          `${path}.campaign.run${runIndex}.checkpoint${index}:${checkpoint.id}`,
        );
  };
  migrate(payload.state, 'state');
  return {
    save: payload,
    report: {
      migrationId: M.id,
      physicalWorlds: reports.length,
      worlds: reports,
      boundary:
        'Known geometry conversion only. No actor health/identity/mission receipts/clock/fare/events advance; aboard Mara alone follows her actual migrated train support. All checkpoint.world records are replaced explicitly.',
    },
  };
}
