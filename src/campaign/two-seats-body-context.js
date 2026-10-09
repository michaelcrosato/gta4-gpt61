/** Temporary authored-body scope while the remaining public city's native
 * headroom is rebuilt. This is not global standing acceptance. All admission
 * and ceiling results come from the shared native geometry query.
 */
import { createSceneBodyClearance } from '../scene-body-clearance.js';
const CAST = new Set([
  'LL-CHAR-002',
  'LL-CHAR-008',
  'LL-CHAR-025',
  'LL-ARC-DAX',
  'LL-ARC-PEL',
  'LL-ARC-BEA',
  'dispatch-worker-a',
  'dispatch-worker-b',
]);
export function twoSeatsBodyScope(state) {
  const active = state?.campaign?.active;
  return Boolean(
    (active?.missionId === 'LL-ST-003' && active.phase === 'running') ||
    (state?.campaignMode === 'story' &&
      state.campaign?.completed?.['LL-ST-002'] &&
      !state.campaign.completed['LL-ST-003']),
  );
}
export function createTwoSeatsBodyContext(world) {
  const native = createSceneBodyClearance(world);
  const participant = (state, body) =>
    body === state.player ||
    CAST.has(body.id) ||
    (body.spec && [state.player.vehicleId, state.twoSeatsRuntime?.run?.rideId].includes(body.id));
  return {
    native,
    enabled: twoSeatsBodyScope,
    canMoveBody(request) {
      return (
        !twoSeatsBodyScope(request.state) ||
        !participant(request.state, request.body) ||
        native.canMoveBody(request)
      );
    },
    isBodyBlocked(state, x, y, radius, z, sceneId) {
      return (
        twoSeatsBodyScope(state) &&
        !native.inspect(state, { x, y, radius, z, height: 30 }, { sceneId }).clear
      );
    },
    segmentBlocked(state, from, to, radius, sceneId) {
      return (
        twoSeatsBodyScope(state) &&
        !native.sweep(state, from, to, { sceneId, radius, height: 30 }).clear
      );
    },
    limitRise(state, body, targetZ, sceneId) {
      return twoSeatsBodyScope(state) && participant(state, body)
        ? native.limitRise(state, { ...body, radius: 7, height: 30 }, targetZ, { sceneId })
        : { z: targetZ, hit: false };
    },
  };
}
