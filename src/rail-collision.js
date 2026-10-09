/** Shared train/gate body tests; rendering and controllers use the same dimensions. */
import { actorSceneId } from './scene-context.js';
import { railPassenger } from './rail-runtime.js';
const clamp = (value, a, b) => Math.max(a, Math.min(b, value));
export function trainContainsBody(train, body, config, radius = 7, height = 18) {
  if (
    (body.z || 0) + height <= train.z + 1e-6 ||
    (body.z || 0) >= train.z + config.trainHeight - 1e-6
  )
    return false;
  const length = config.cars * config.carLength + (config.cars - 1) * config.couplerGap;
  const dx = body.x - train.x,
    dy = body.y - train.y,
    c = Math.cos(train.heading),
    s = Math.sin(train.heading),
    x = dx * c + dy * s,
    y = -dx * s + dy * c;
  return (
    Math.hypot(
      x - clamp(x, -length / 2, length / 2),
      y - clamp(y, -config.trainWidth / 2, config.trainWidth / 2),
    ) < radius
  );
}
function pointBoxDistance(x, y, box) {
  return Math.hypot(x - clamp(x, box.x, box.x + box.w), y - clamp(y, box.y, box.y + box.h));
}
function sweepBoxDistance(from, x, y, box) {
  const dx = x - from.x,
    dy = y - from.y,
    squared = dx * dx + dy * dy;
  let enter = 0,
    leave = 1;
  for (const [origin, delta, low, high] of [
    [from.x, dx, box.x, box.x + box.w],
    [from.y, dy, box.y, box.y + box.h],
  ]) {
    if (!delta) {
      if (origin < low || origin > high) {
        enter = 2;
        break;
      }
    } else {
      const a = (low - origin) / delta,
        b = (high - origin) / delta;
      enter = Math.max(enter, Math.min(a, b));
      leave = Math.min(leave, Math.max(a, b));
    }
  }
  if (enter <= leave) return 0;
  let distance = Math.min(pointBoxDistance(from.x, from.y, box), pointBoxDistance(x, y, box));
  for (const a of [box.x, box.x + box.w])
    for (const b of [box.y, box.y + box.h]) {
      const t = squared ? clamp(((a - from.x) * dx + (b - from.y) * dy) / squared, 0, 1) : 0;
      distance = Math.min(distance, Math.hypot(a - from.x - dx * t, b - from.y - dy * t));
    }
  return distance;
}
export function railGateBlocked(state, world, x, y, radius = 9, z = 0, from = null) {
  const closed = new Set(state.railSignals?.closedGates || []);
  for (const gate of world.transit.railCrossings || []) {
    const levels = gate.points?.map((point) => point.roadZ) ?? [gate.roadZ ?? 0];
    if (!closed.has(gate.id) || !levels.some((level) => Math.abs(level - z) <= 6)) continue;
    const box = gate.bounds;
    // A signal that closes around an existing car must allow it to clear the crossing.
    if (from && pointBoxDistance(from.x, from.y, box) < radius) continue;
    if ((from ? sweepBoxDistance(from, x, y, box) : pointBoxDistance(x, y, box)) < radius)
      return true;
  }
  return false;
}
export function updateRailImpacts(state, dt, { damagePlayer, damageVehicle, notify = () => {} }) {
  if (!state.transit) return;
  const passengers = new Set(state.transit.passengers.map((passenger) => passenger.id));
  const bodies = [...state.pedestrians, ...state.police, ...state.hostiles, ...state.vehicles];
  if (!railPassenger(state)) bodies.push(state.player);
  for (const train of state.transit.trains) {
    if (train.speed < 8) continue;
    for (const body of bodies) {
      if (
        body.health <= 0 ||
        actorSceneId(body) !== null ||
        passengers.has(body.id) ||
        state.time < (body.nextRailImpact || 0)
      )
        continue;
      if (
        !trainContainsBody(
          train,
          body,
          state.transit.config,
          body.spec ? 10 : 7,
          body.spec ? 17 : 18,
        )
      )
        continue;
      body.nextRailImpact = state.time + 0.8;
      const damage = Math.max(8, train.speed * (body.spec ? 2 : 2.4));
      if (body === state.player) {
        damagePlayer(damage);
        notify('Metro impact. Stay clear of moving trains.');
      } else if (body.spec) damageVehicle(body, damage);
      else {
        body.health = Math.max(0, body.health - damage);
        body.panic = 8;
      }
      if (body.spec) body.speed = 0;
    }
  }
}
