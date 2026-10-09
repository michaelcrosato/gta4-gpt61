/** Parent-owned player/wallet integration for Harbor City's physical rail services. */
import {
  createTransit,
  updateTransit,
  boardTransit,
  alightTransit,
  getTransitDoors,
  getTransitPassengerPose,
  quoteTransitFare,
  requestTransitStop,
  recoverTransitPassenger,
  validateTransit,
} from './transit.js';
import { currentSceneId } from './scene-context.js';
import { createRailDispatcher, validateRailDispatch } from './rail-dispatcher.js';
import { createRailClearance } from './rail-clearance.js';
const dispatchers = new WeakMap();
const clearances = new WeakMap();

export const RAIL_PLAYER_ID = 'mara-voss';
export function railPassenger(state) {
  return state.transit?.passengers.find((passenger) => passenger.id === RAIL_PLAYER_ID) ?? null;
}
export function initializeRail(state, world) {
  state.transit ??= createTransit(world);
  return state.transit;
}
function dispatcherFor(state, world) {
  let dispatcher = dispatchers.get(state);
  if (!dispatcher) {
    dispatcher = createRailDispatcher(world, state.transit.trains, state.railSignals || null);
    dispatchers.set(state, dispatcher);
  }
  return dispatcher;
}
function clearanceFor(world) {
  let clearance = clearances.get(world);
  if (!clearance) {
    clearance = createRailClearance(world);
    clearances.set(world, clearance);
  }
  return clearance;
}
function applyPose(state, pose) {
  if (!pose) return false;
  Object.assign(state.player, {
    x: pose.x,
    y: pose.y,
    z: pose.z,
    groundZ: pose.groundZ,
    angle: pose.heading,
    vehicleId: null,
    sceneId: null,
    vz: 0,
    cover: null,
    traversal: null,
    swimming: false,
    crouching: false,
    scoped: false,
    aiming: false,
    defending: false,
    speed: 0,
  });
  state.scene = { kind: 'exterior', id: 'harbor-city' };
  return true;
}
export function createRailContext(state, world, options) {
  const { terrain, notify = () => {}, canMoveTrain, canDepart } = options;
  const context = {
    canBoard: () =>
      state.player.health > 0 &&
      !state.player.vehicleId &&
      !currentSceneId(state) &&
      state.wanted.level < 3,
    canAlight: (request) =>
      !terrain.isBlocked(
        request.position.x,
        request.position.y,
        request.radius,
        request.position.z,
      ),
    canRecover: (request) => request.reason === 'death' && state.player.health <= 0,
    canMoveTrain: (request) => typeof canMoveTrain === 'function' && canMoveTrain(request),
    canDepart: (request) => typeof canDepart !== 'function' || canDepart(request),
    onBoard: (request) => request.passengerId !== RAIL_PLAYER_ID || applyPose(state, request.pose),
    onRide: (request) => {
      if (request.passengerId === RAIL_PLAYER_ID) applyPose(state, request.pose);
    },
    onAlight: (request) =>
      request.passengerId !== RAIL_PLAYER_ID ||
      applyPose(state, {
        ...request.position,
        groundZ: request.position.z,
        heading: state.player.angle,
      }),
    onRecover: (request) => {
      if (request.passengerId === RAIL_PLAYER_ID) {
        state.player.speed = 0;
        state.player.vz = 0;
      }
      return true;
    },
    transact(request, apply) {
      if (request.passengerId !== RAIL_PLAYER_ID) return false;
      const before = JSON.parse(JSON.stringify(state.player)),
        scene = state.scene;
      const paid = Math.min(state.player.money, request.amount),
        owed = request.amount - paid;
      try {
        if (!apply()) {
          Object.assign(state.player, before);
          state.scene = scene;
          return false;
        }
        state.player.money -= paid;
        if (request.amount)
          notify(
            owed ? `Metro fare $${paid} paid; $${owed} remains due.` : `Metro fare $${paid} paid.`,
          );
        return { approved: true, paid, owed, waived: 0 };
      } catch (error) {
        Object.assign(state.player, before);
        state.scene = scene;
        throw error;
      }
    },
    onEvent: (record) => {
      const event = { ...record.data, type: record.kind };
      if (event.type === 'arrival' && railPassenger(state)?.trainId === event.trainId) {
        const station = world.transit.stations.find((station) => station.id === event.stationId);
        notify(`Metro stop: ${station?.name || 'Station'}. Doors are opening.`);
      }
      if (event.type === 'missed-stop' && event.passengerId === RAIL_PLAYER_ID)
        notify('You stayed aboard. Choose another stop or leave at the next open platform.');
    },
  };
  return context;
}
export function updateRail(state, world, dt, options) {
  initializeRail(state, world);
  if (options.canMoveTrain) {
    updateTransit(state.transit, world, dt, createRailContext(state, world, options));
    return;
  }
  const dispatcher = dispatcherFor(state, world);
  const clearance = clearanceFor(world);
  dispatcher.beginStep(state.transit.trains, state.transit.time);
  updateTransit(
    state.transit,
    world,
    dt,
    createRailContext(state, world, {
      ...options,
      canDepart: (request) => dispatcher.canDepart(request),
      canMoveTrain: (request) => clearance(request) && dispatcher.canMoveTrain(request),
    }),
  );
  dispatcher.endStep(state.transit.trains, state.transit.time);
  state.railSignals = dispatcher.snapshot();
}
export function railInteraction(state, world) {
  if (!state.transit || currentSceneId(state) || state.player.health <= 0) return null;
  const passenger = railPassenger(state);
  if (passenger) {
    const train = state.transit.trains.find((train) => train.id === passenger.trainId);
    const fare = quoteTransitFare(state.transit, RAIL_PLAYER_ID)?.amount ?? 0;
    const open = ['dwelling', 'held'].includes(train.phase) && train.doorProgress >= 1 - 1e-7;
    return {
      id: train.id,
      trainId: train.id,
      type: 'rail-alight',
      available: true,
      distance: 0,
      name: 'Metro',
      prompt: open
        ? `Leave the metro · $${fare} fare`
        : 'Remain aboard until a platform door opens',
    };
  }
  if (state.player.vehicleId) return null;
  const door = getTransitDoors(state.transit, world, { position: state.player })[0];
  return door
    ? {
        ...door,
        id: door.trainId,
        type: 'rail-board',
        available: true,
        name: door.serviceName,
        prompt: `Board ${door.serviceName} · fares from $${state.transit.config.baseFare}`,
      }
    : null;
}
export function interactRail(state, world, item, options) {
  const context = createRailContext(state, world, options);
  const result =
    item.type === 'rail-board'
      ? boardTransit(
          state.transit,
          world,
          { passengerId: RAIL_PLAYER_ID, trainId: item.trainId, position: state.player },
          context,
        )
      : alightTransit(state.transit, world, { passengerId: RAIL_PLAYER_ID }, context);
  if (!result.ok)
    options.notify?.(
      result.reason === 'boarding-policy'
        ? 'Lose high wanted attention before boarding the metro.'
        : result.reason === 'doors-not-open'
          ? 'Wait for the next open platform.'
          : 'The metro doorway is unavailable.',
    );
  return result;
}
export function chooseRailStop(state, world, stationId, platformId) {
  return requestTransitStop(state.transit, world, {
    passengerId: RAIL_PLAYER_ID,
    stationId,
    platformId,
  });
}
export function recoverRail(state, world, options) {
  if (!railPassenger(state)) return { ok: true };
  return recoverTransitPassenger(
    state.transit,
    world,
    { passengerId: RAIL_PLAYER_ID, reason: 'death' },
    createRailContext(state, world, options),
  );
}
export function validateRailRuntime(state, world) {
  if (!state.transit) return true;
  validateTransit(state.transit, world);
  const config = state.transit.config,
    geometry = world.transit.railGeometry.settings;
  if (
    config.cars * config.carLength + (config.cars - 1) * config.couplerGap !==
      geometry.trainLength ||
    config.trainWidth !== geometry.trainWidth ||
    config.trainHeight !== geometry.trainHeight
  )
    throw new Error('The saved metro consist differs from its physical corridors.');
  if (state.railSignals) {
    validateRailDispatch(state.railSignals, world, state.transit.trains);
    if (Math.abs(state.railSignals.time - state.transit.time) > 1e-7)
      throw new Error('The saved Metro signals and fleet clocks differ.');
    const config = state.transit.config,
      dimensions = state.railSignals.dimensions;
    if (
      config.cars * config.carLength + (config.cars - 1) * config.couplerGap !==
        dimensions.length ||
      config.trainWidth !== dimensions.width ||
      config.trainHeight !== dimensions.height
    )
      throw new Error('The saved metro consist differs from its physical corridors.');
  }
  const passenger = railPassenger(state);
  if (passenger) {
    if (state.player.health <= 0)
      throw new Error('An incapacitated Metro passenger must have entered recovery.');
    const pose = getTransitPassengerPose(state.transit, RAIL_PLAYER_ID);
    if (
      currentSceneId(state) ||
      state.player.vehicleId ||
      state.player.sceneId !== null ||
      Math.hypot(state.player.x - pose.x, state.player.y - pose.y, state.player.z - pose.z) > 1e-5
    )
      throw new Error('The saved metro passenger body is invalid.');
  }
  return true;
}
