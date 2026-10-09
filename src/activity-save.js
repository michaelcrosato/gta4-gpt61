/** Validate the version-one activity contracts before their UI or physics sees a save. */
import {
  MINIGAME_KINDS,
  DART_SECTORS,
  bowlingFrames,
  arcadePieceCells,
  dartBoardHit,
} from './minigames.js';

const MAX_INTEGER = Number.MAX_SAFE_INTEGER;
const MAX_SERIALIZED_CHARS = 1024 * 1024;
const MAX_PLAYERS = 16;
const POSITION_LIMIT = 1024; // Activity metres/board coordinates, never city coordinates.
const STEP = 1 / 120;
const EPSILON = 1e-8;

function invalid(path, reason) {
  throw new Error(`Invalid activity save at ${path}: ${reason}.`);
}
function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid(path, 'expected an object');
}
function array(value, path, minimum, maximum = minimum) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum)
    invalid(path, `expected ${minimum === maximum ? minimum : `${minimum}–${maximum}`} entries`);
}
function numeric(value, path, minimum = 0, maximum = MAX_INTEGER, integer = false) {
  if (
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isSafeInteger(value))
  )
    invalid(path, 'number is outside the activity contract');
}
function integer(value, path, minimum = 0, maximum = MAX_INTEGER) {
  numeric(value, path, minimum, maximum, true);
}
function bool(value, path) {
  if (typeof value !== 'boolean') invalid(path, 'expected a boolean');
}
function text(value, path, maximum = 1024, minimum = 0) {
  if (typeof value !== 'string' || value.length > maximum || value.length < minimum)
    invalid(path, 'expected bounded text');
}
function oneOf(value, choices, path) {
  if (!choices.includes(value)) invalid(path, 'unsupported value');
}
function exact(value, expected, path) {
  if (value !== expected) invalid(path, 'does not match the version-one rules');
}
function playerIndex(value, state, path) {
  integer(value, path, 0, state.players.length - 1);
}
function nullableIndex(value, maximum, path, minimum = 0) {
  if (value !== null) integer(value, path, minimum, maximum);
}
function uniqueIds(items, path) {
  items.forEach((item, i) => object(item, `${path}[${i}]`));
  if (new Set(items.map((item) => item.id)).size !== items.length) invalid(path, 'duplicate IDs');
}
function sameJSON(a, b) {
  if (a === b) return true;
  if (
    !a ||
    !b ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && sameJSON(a[key], b[key]))
  );
}

// Do not call user-supplied getters/toJSON or silently turn NaN into null. Shared
// event/result references are legitimate; only ancestor cycles are rejected.
function jsonClone(value) {
  const ancestors = new Set();
  let nodes = 0;
  let characters = 0;
  function copy(item, path, depth) {
    if (++nodes > 60000 || depth > 24) invalid(path, 'save is too large or deeply nested');
    characters += 4;
    if (typeof item === 'string') characters += item.length;
    if (characters > MAX_SERIALIZED_CHARS) invalid(path, 'save text is too large');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      numeric(item, path, -MAX_INTEGER, MAX_INTEGER);
      return item;
    }
    if (typeof item === 'string') {
      text(item, path, 4096);
      return item;
    }
    if (!item || typeof item !== 'object') invalid(path, 'value is not JSON-safe');
    if (ancestors.has(item)) invalid(path, 'cyclic data');
    const prototype = Object.getPrototypeOf(item);
    if (
      Array.isArray(item)
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null
    )
      invalid(path, 'expected plain JSON data');
    ancestors.add(item);
    const descriptors = Object.getOwnPropertyDescriptors(item);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== 'string'))
      invalid(path, 'symbol properties are not JSON-safe');
    let result;
    if (Array.isArray(item)) {
      array(item, path, 0, 4096);
      if (
        keys.some(
          (key) => key !== 'length' && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length),
        )
      )
        invalid(path, 'unexpected array properties');
      result = [];
      for (let i = 0; i < item.length; i++) {
        const descriptor = descriptors[i];
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.value === undefined)
          invalid(`${path}[${i}]`, 'sparse or accessor array entry');
        result.push(copy(descriptor.value, `${path}[${i}]`, depth + 1));
      }
    } else {
      result = {};
      if (keys.length > 128) invalid(path, 'too many object fields');
      for (const key of keys) {
        if (key.length > 128 || ['__proto__', 'constructor', 'prototype'].includes(key))
          invalid(path, 'unsafe object key');
        const descriptor = descriptors[key];
        characters += key.length;
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))
          invalid(`${path}.${key}`, 'expected a plain data property');
        // Core special-event metadata sometimes has color: undefined. JSON
        // omits optional object properties; required schema fields still fail.
        if (descriptor.value !== undefined)
          result[key] = copy(descriptor.value, `${path}.${key}`, depth + 1);
      }
    }
    ancestors.delete(item);
    return result;
  }
  return copy(value, '$', 0);
}

function checkResult(result, state, path) {
  object(result, path);
  nullableIndex(result.winner, state.players.length - 1, `${path}.winner`);
  oneOf(result.outcome, ['win', 'loss', 'draw', 'complete', 'abandoned'], `${path}.outcome`);
  text(result.reason, `${path}.reason`, 1024, 1);
  if (result.outcome === 'abandoned') exact(result.winner, null, `${path}.winner`);
  else if (state.kind === 'arcade') {
    exact(result.winner, null, `${path}.winner`);
    exact(result.outcome, 'loss', `${path}.outcome`);
  } else {
    const expected =
      result.winner === null
        ? 'draw'
        : result.winner === 0
          ? state.players.length === 1
            ? 'complete'
            : 'win'
          : 'loss';
    exact(result.outcome, expected, `${path}.outcome`);
  }
  for (const key of ['score', 'level', 'dartsThrown', 'highestTurn'])
    if (Object.hasOwn(result, key)) integer(result[key], `${path}.${key}`, key === 'level' ? 1 : 0);
  if (Object.hasOwn(result, 'scores')) {
    array(result.scores, `${path}.scores`, state.players.length);
    result.scores.forEach((score, i) => integer(score, `${path}.scores[${i}]`, 0, 300));
  }
}
function checkBase(state) {
  object(state, '$');
  oneOf(state.kind, MINIGAME_KINDS, '$.kind');
  exact(state.version, 1, '$.version');
  array(state.players, '$.players', 1, MAX_PLAYERS);
  state.players.forEach((player, i) => {
    object(player, `$.players[${i}]`);
    text(player.name, `$.players[${i}].name`, 200);
  });
  playerIndex(state.currentPlayer, state, '$.currentPlayer');
  array(state.aiPlayers, '$.aiPlayers', 0, 64);
  state.aiPlayers.forEach((index, i) => playerIndex(index, state, `$.aiPlayers[${i}]`));
  integer(state.rng, '$.rng', 0, 0xffffffff);
  numeric(state.time, '$.time');
  numeric(state.accumulator, '$.accumulator');
  numeric(state.aiSkill, '$.aiSkill', 0, 1);
  numeric(state.aiWait, '$.aiWait', -1, 4);
  text(state.title, '$.title', 120, 1);
  text(state.message, '$.message');
  for (const key of ['paused', 'finished', 'assistance']) bool(state[key], `$.${key}`);
  oneOf(state.status, ['playing', 'finished', 'abandoned'], '$.status');
  const phases = {
    bowling: ['aim', 'rolling', 'complete'],
    darts: ['aim', 'throwing', 'complete'],
    pool: ['aim', 'rolling', 'place-cue', 'complete'],
    arcade: ['falling', 'clearing', 'complete'],
  };
  oneOf(state.phase, phases[state.kind], '$.phase');
  if (state.finished) {
    exact(state.phase, 'complete', '$.phase');
    checkResult(state.result, state, '$.result');
    exact(
      state.status,
      state.result.outcome === 'abandoned' ? 'abandoned' : 'finished',
      '$.status',
    );
  } else {
    if (state.phase === 'complete') invalid('$.phase', 'unfinished session has a terminal phase');
    exact(state.status, 'playing', '$.status');
    exact(state.result, null, '$.result');
  }
  integer(state.eventSequence, '$.eventSequence');
  array(state.events, '$.events', 0, 80);
  let lastId = 0;
  for (const [i, event] of state.events.entries()) {
    const path = `$.events[${i}]`;
    object(event, path);
    integer(event.id, `${path}.id`, 1, state.eventSequence);
    if (event.id <= lastId) invalid(`${path}.id`, 'event sequence is not increasing');
    lastId = event.id;
    text(event.kind, `${path}.kind`, 64, 1);
    text(event.message, `${path}.message`);
    numeric(event.time, `${path}.time`, 0, state.time + EPSILON);
    object(event.data, `${path}.data`);
  }
  exact(lastId, state.eventSequence, '$.eventSequence');
  if (state.kind !== 'arcade') object(state.aim, '$.aim');
}

function nextRack(frames) {
  const frame = frames.find((f) => !f.complete);
  if (!frame) return { frame: frames.length, pins: 0 };
  const rolls = frame.rolls;
  const last = frame.index === frames.length - 1;
  const reset =
    !rolls.length ||
    (last &&
      ((rolls.length === 1 && rolls[0] === 10) ||
        (rolls.length === 2 && (rolls[0] < 10 || rolls[1] === 10))));
  return { frame: frame.index, pins: reset ? 10 : 10 - rolls.at(-1) };
}
function checkBowling(state) {
  oneOf(state.frameCount, [5, 10], '$.frameCount');
  object(state.lane, '$.lane');
  for (const [key, value] of Object.entries({ width: 1.0668, length: 18.29, pinY: 17.25 }))
    exact(state.lane[key], value, `$.lane.${key}`);
  integer(state.frameIndex, '$.frameIndex', 0, state.frameCount - 1);
  for (const key of ['position', 'direction', 'spin'])
    numeric(state.aim[key], `$.aim.${key}`, -1, 1);
  numeric(state.aim.power, '$.aim.power', 0, 1);
  numeric(state.rollElapsed, '$.rollElapsed', 0, 10);
  if (Object.hasOwn(state, 'rollStanding')) integer(state.rollStanding, '$.rollStanding', 1, 10);
  for (const [i, player] of state.players.entries()) {
    const path = `$.players[${i}]`;
    array(player.rolls, `${path}.rolls`, 0, state.frameCount * 2 + 1);
    player.rolls.forEach((roll, n) => integer(roll, `${path}.rolls[${n}]`, 0, 10));
    let expected;
    try {
      expected = bowlingFrames(player.rolls, state.frameCount);
    } catch {
      invalid(`${path}.rolls`, 'illegal frame or bonus delivery');
    }
    array(player.frames, `${path}.frames`, state.frameCount);
    for (const [n, frame] of player.frames.entries()) {
      object(frame, `${path}.frames[${n}]`);
      const wanted = expected[n];
      array(frame.rolls, `${path}.frames[${n}].rolls`, wanted.rolls.length);
      frame.rolls.forEach((roll, j) =>
        exact(roll, wanted.rolls[j], `${path}.frames[${n}].rolls[${j}]`),
      );
      for (const key of ['index', 'score', 'cumulative', 'complete', 'strike', 'spare'])
        exact(frame[key], wanted[key], `${path}.frames[${n}].${key}`);
    }
    exact(
      player.score,
      expected.reduce((total, frame) => total + (frame.score ?? 0), 0),
      `${path}.score`,
    );
    exact(
      player.finished,
      expected.every((frame) => frame.complete),
      `${path}.finished`,
    );
    exact(player.strikes, player.rolls.filter((roll) => roll === 10).length, `${path}.strikes`);
    exact(player.spares, expected.filter((frame) => frame.spare).length, `${path}.spares`);
    let run = 0,
      high = 0;
    for (const roll of player.rolls) {
      run = roll === 10 ? run + 1 : 0;
      high = Math.max(high, run);
    }
    exact(player.strikeRun, run, `${path}.strikeRun`);
    exact(player.maxStrikeRun, high, `${path}.maxStrikeRun`);
  }
  array(state.pins, '$.pins', 1, 10);
  uniqueIds(state.pins, '$.pins');
  for (const [i, pin] of state.pins.entries()) {
    const path = `$.pins[${i}]`;
    object(pin, path);
    integer(pin.id, `${path}.id`, 1, 10);
    for (const key of ['x', 'y', 'vx', 'vy'])
      numeric(pin[key], `${path}.${key}`, -POSITION_LIMIT, POSITION_LIMIT);
    exact(pin.radius, 0.058, `${path}.radius`);
    bool(pin.standing, `${path}.standing`);
    numeric(pin.tilt, `${path}.tilt`, 0, 1);
  }
  if (state.ball !== null) {
    object(state.ball, '$.ball');
    for (const key of ['x', 'y', 'vx', 'vy'])
      numeric(state.ball[key], `$.ball.${key}`, -POSITION_LIMIT, POSITION_LIMIT);
    exact(state.ball.radius, 0.1085, '$.ball.radius');
    exact(state.ball.mass, 6.5, '$.ball.mass');
    numeric(state.ball.spin, '$.ball.spin', -1, 1);
    bool(state.ball.gutter, '$.ball.gutter');
    bool(state.ball.active, '$.ball.active');
  }
  if (!state.finished) {
    const active = state.players[state.currentPlayer],
      rack = nextRack(active.frames);
    exact(active.finished, false, '$.currentPlayer');
    exact(state.frameIndex, rack.frame, '$.frameIndex');
    if (state.phase === 'rolling') {
      if (!state.ball) invalid('$.ball', 'rolling requires a ball');
      exact(state.rollStanding, rack.pins, '$.rollStanding');
      exact(state.pins.length, state.rollStanding, '$.pins');
    } else {
      exact(state.ball, null, '$.ball');
      exact(state.pins.filter((pin) => pin.standing).length, rack.pins, '$.pins');
    }
  } else if (state.status !== 'abandoned') {
    if (!state.players.every((player) => player.finished))
      invalid('$.players', 'unfinished scorecard at completion');
    array(state.result.scores, '$.result.scores', state.players.length);
    state.result.scores.forEach((score, i) =>
      exact(score, state.players[i].score, `$.result.scores[${i}]`),
    );
    exact(state.result.frameCount, state.frameCount, '$.result.frameCount');
    const high = Math.max(...state.result.scores);
    const leaders = state.result.scores
      .map((score, i) => (score === high ? i : -1))
      .filter((i) => i >= 0);
    exact(state.result.winner, leaders.length === 1 ? leaders[0] : null, '$.result.winner');
  }
}

function checkDart(hit, state, path, owner = null) {
  object(hit, path);
  numeric(hit.x, `${path}.x`, -POSITION_LIMIT, POSITION_LIMIT);
  numeric(hit.y, `${path}.y`, -POSITION_LIMIT, POSITION_LIMIT);
  playerIndex(hit.player, state, `${path}.player`);
  if (owner !== null) exact(hit.player, owner, `${path}.player`);
  numeric(hit.time, `${path}.time`, 0, state.time + EPSILON);
  const expected = dartBoardHit(hit.x, hit.y);
  for (const key of ['score', 'segment', 'multiplier', 'ring', 'double'])
    exact(hit[key], expected[key], `${path}.${key}`);
}
function checkDarts(state) {
  oneOf(state.startingScore, [301, 501], '$.startingScore');
  object(state.board, '$.board');
  exact(state.board.radius, 1, '$.board.radius');
  array(state.board.sectorNumbers, '$.board.sectorNumbers', 20);
  state.board.sectorNumbers.forEach((n, i) =>
    exact(n, DART_SECTORS[i], `$.board.sectorNumbers[${i}]`),
  );
  numeric(state.aim.x, '$.aim.x', -1.5, 1.5);
  numeric(state.aim.y, '$.aim.y', -1.5, 1.5);
  bool(state.aim.steady, '$.aim.steady');
  numeric(state.wobblePhase, '$.wobblePhase', 0, Math.PI * 2);
  integer(state.turn, '$.turn', 1);
  integer(state.turnStart, '$.turnStart', 2, state.startingScore);
  integer(
    state.throwsInTurn,
    '$.throwsInTurn',
    0,
    state.finished && state.status !== 'abandoned' ? 3 : 2,
  );
  array(state.turnDarts, '$.turnDarts', state.throwsInTurn);
  state.turnDarts.forEach((hit, i) =>
    checkDart(hit, state, `$.turnDarts[${i}]`, state.currentPlayer),
  );
  array(state.darts, '$.darts', 0, 30);
  state.darts.forEach((hit, i) => checkDart(hit, state, `$.darts[${i}]`));
  for (const [i, player] of state.players.entries()) {
    const path = `$.players[${i}]`;
    integer(player.remaining, `${path}.remaining`, 0, state.startingScore);
    if (player.remaining === 1) invalid(`${path}.remaining`, 'one must bust rather than persist');
    integer(player.dartsThrown, `${path}.dartsThrown`);
    integer(player.busts, `${path}.busts`, 0, player.dartsThrown);
    integer(player.highestTurn, `${path}.highestTurn`, 0, 180);
    array(player.turns, `${path}.turns`, 0, 80);
    for (const [j, turn] of player.turns.entries()) {
      const prefix = `${path}.turns[${j}]`;
      object(turn, prefix);
      integer(turn.points, `${prefix}.points`, 0, 180);
      bool(turn.bust, `${prefix}.bust`);
      if (Object.hasOwn(turn, 'checkout')) bool(turn.checkout, `${prefix}.checkout`);
      array(turn.darts, `${prefix}.darts`, 1, 3);
      turn.darts.forEach((hit, k) => checkDart(hit, state, `${prefix}.darts[${k}]`, i));
      exact(
        turn.points,
        turn.bust ? 0 : turn.darts.reduce((total, hit) => total + hit.score, 0),
        `${prefix}.points`,
      );
      if (
        turn.checkout &&
        (!state.finished ||
          state.status === 'abandoned' ||
          i !== state.result.winner ||
          !turn.darts.at(-1).double ||
          turn.bust)
      )
        invalid(prefix, 'invalid checkout history');
    }
    const retainedThrows = player.turns.reduce((count, turn) => count + turn.darts.length, 0);
    const pendingThrows =
      i === state.currentPlayer && (!state.finished || state.status === 'abandoned')
        ? state.turnDarts.length
        : 0;
    if (
      player.dartsThrown < retainedThrows + pendingThrows ||
      player.dartsThrown < state.darts.filter((hit) => hit.player === i).length
    )
      invalid(`${path}.dartsThrown`, 'counter omits retained throws');
    if (player.busts < player.turns.filter((turn) => turn.bust).length)
      invalid(`${path}.busts`, 'counter omits retained busts');
    if (player.turns.some((turn) => turn.points > player.highestTurn))
      invalid(`${path}.highestTurn`, 'counter omits a retained high turn');
  }
  exact(
    state.players[state.currentPlayer].remaining,
    state.turnStart - state.turnDarts.reduce((total, hit) => total + hit.score, 0),
    '$.turnStart',
  );
  if (state.lastTurn !== undefined) {
    object(state.lastTurn, '$.lastTurn');
    playerIndex(state.lastTurn.player, state, '$.lastTurn.player');
    integer(state.lastTurn.points, '$.lastTurn.points', 0, 180);
    bool(state.lastTurn.bust, '$.lastTurn.bust');
    if (state.lastTurn.bust) exact(state.lastTurn.points, 0, '$.lastTurn.points');
  }
  if (state.flight !== null) {
    object(state.flight, '$.flight');
    numeric(state.flight.x, '$.flight.x', -POSITION_LIMIT, POSITION_LIMIT);
    numeric(state.flight.y, '$.flight.y', -POSITION_LIMIT, POSITION_LIMIT);
    numeric(state.flight.progress, '$.flight.progress', 0, 1);
    exact(state.flight.duration, 0.28, '$.flight.duration');
  }
  if (!state.finished) {
    if (state.players.some((player) => player.remaining === 0))
      invalid('$.players', 'zero requires a completed checkout');
    if (state.phase === 'throwing' && !state.flight)
      invalid('$.flight', 'throwing requires a flight');
    if (state.phase === 'aim') exact(state.flight, null, '$.flight');
  } else if (state.status !== 'abandoned') {
    exact(state.flight, null, '$.flight');
    exact(state.result.winner, state.currentPlayer, '$.result.winner');
    exact(state.players[state.currentPlayer].remaining, 0, '$.players.remaining');
    if (!state.turnDarts.length || !state.turnDarts.at(-1).double)
      invalid('$.turnDarts', 'checkout must finish on a double');
    exact(
      state.result.dartsThrown,
      state.players[state.currentPlayer].dartsThrown,
      '$.result.dartsThrown',
    );
    exact(
      state.result.highestTurn,
      state.players[state.currentPlayer].highestTurn,
      '$.result.highestTurn',
    );
    if (state.players.some((player, i) => i !== state.currentPlayer && player.remaining === 0))
      invalid('$.players', 'only the winner can have a completed checkout');
  }
}

const groupFor = (id) => (id === 0 ? 'cue' : id === 8 ? 'eight' : id < 8 ? 'solid' : 'stripe');
function checkShot(shot, state, path, history = false) {
  object(shot, path);
  playerIndex(shot.shooter, state, `${path}.shooter`);
  nullableIndex(shot.firstHit, 15, `${path}.firstHit`, 1);
  for (const key of ['pocketed', 'offTable']) {
    array(shot[key], `${path}.${key}`, 0, 16);
    if (new Set(shot[key]).size !== shot[key].length)
      invalid(`${path}.${key}`, 'duplicate ball references');
    shot[key].forEach((id, i) => integer(id, `${path}.${key}[${i}]`, 0, 15));
  }
  if (shot.pocketed.some((id) => shot.offTable.includes(id)))
    invalid(path, 'a shot cannot pocket and lose the same ball');
  for (const key of ['scratch', 'railAfterContact', 'wasBreak', 'eligibleEight'])
    bool(shot[key], `${path}.${key}`);
  exact(shot.scratch, shot.pocketed.includes(0) || shot.offTable.includes(0), `${path}.scratch`);
  if (shot.railAfterContact && shot.firstHit === null)
    invalid(path, 'rail-after-contact requires an object-ball contact');
  numeric(shot.elapsed, `${path}.elapsed`, 0, 21);
  nullableIndex(shot.calledPocket, 5, `${path}.calledPocket`);
  if (history) {
    if (shot.foul !== null) text(shot.foul, `${path}.foul`, 1024, 1);
    if (shot.result !== null) checkResult(shot.result, state, `${path}.result`);
  }
}
function checkPool(state) {
  exact(state.players.length, 2, '$.players');
  object(state.table, '$.table');
  exact(state.table.width, 2.24, '$.table.width');
  exact(state.table.height, 1.12, '$.table.height');
  oneOf(state.table.cloth, ['smooth', 'rough'], '$.table.cloth');
  array(state.table.pockets, '$.table.pockets', 6);
  uniqueIds(state.table.pockets, '$.table.pockets');
  for (const [i, pocket] of state.table.pockets.entries()) {
    const path = `$.table.pockets[${i}]`;
    object(pocket, path);
    integer(pocket.id, `${path}.id`, 0, 5);
    exact(pocket.x, [0, 1.12, 2.24][pocket.id % 3], `${path}.x`);
    exact(pocket.y, pocket.id < 3 ? 0 : 1.12, `${path}.y`);
    exact(pocket.radius, 0.073, `${path}.radius`);
  }
  object(state.rules, '$.rules');
  for (const key of [
    'eightOnBreakWins',
    'wrongGroupPocketIsFoul',
    'ballInHandOnFoul',
    'offTableEightLoses',
  ])
    exact(state.rules[key], true, `$.rules.${key}`);
  array(state.balls, '$.balls', 16);
  uniqueIds(state.balls, '$.balls');
  for (const [i, ball] of state.balls.entries()) {
    const path = `$.balls[${i}]`;
    object(ball, path);
    integer(ball.id, `${path}.id`, 0, 15);
    exact(ball.number, ball.id, `${path}.number`);
    exact(ball.group, groupFor(ball.id), `${path}.group`);
    for (const key of ['x', 'y', 'vx', 'vy', 'vz'])
      numeric(ball[key], `${path}.${key}`, -POSITION_LIMIT, POSITION_LIMIT);
    numeric(ball.z, `${path}.z`, 0, 16);
    numeric(ball.spin, `${path}.spin`, -1, 1);
    exact(ball.radius, 0.028575, `${path}.radius`);
    bool(ball.pocketed, `${path}.pocketed`);
    bool(ball.offTable, `${path}.offTable`);
    nullableIndex(ball.pocket, 5, `${path}.pocket`);
    if (ball.pocketed && ball.offTable) invalid(path, 'ball has contradictory removal states');
    if (ball.pocketed ? ball.pocket === null : ball.pocket !== null)
      invalid(`${path}.pocket`, 'pocket reference disagrees with ball state');
    if (ball.pocketed || ball.offTable)
      for (const key of ['z', 'vx', 'vy', 'vz']) exact(ball[key], 0, `${path}.${key}`);
  }
  array(state.groups, '$.groups', 2);
  const validGroups =
    (state.groups[0] === null && state.groups[1] === null) ||
    (state.groups[0] === 'solid' && state.groups[1] === 'stripe') ||
    (state.groups[0] === 'stripe' && state.groups[1] === 'solid');
  if (!validGroups) invalid('$.groups', 'groups must be open or complementary');
  for (const [i, player] of state.players.entries()) {
    exact(player.group, state.groups[i], `$.players[${i}].group`);
    integer(player.potted, `$.players[${i}].potted`, 0, 15);
    integer(player.shots, `$.players[${i}].shots`);
    integer(player.fouls, `$.players[${i}].fouls`, 0, player.shots);
  }
  integer(state.shotCount, '$.shotCount');
  exact(
    state.shotCount,
    state.players.reduce((total, player) => total + player.shots, 0),
    '$.shotCount',
  );
  numeric(state.aim.angle, '$.aim.angle', -Math.PI, Math.PI);
  numeric(state.aim.power, '$.aim.power', 0, 1);
  numeric(state.aim.spin, '$.aim.spin', -1, 1);
  numeric(state.aim.elevation, '$.aim.elevation', 0, 1);
  nullableIndex(state.aim.calledPocket, 5, '$.aim.calledPocket');
  bool(state.ballInHand, '$.ballInHand');
  bool(state.breaking, '$.breaking');
  if (state.breaking && state.groups[0] !== null)
    invalid('$.groups', 'break cannot have assigned groups');
  array(state.shotHistory, '$.shotHistory', 0, 60);
  state.shotHistory.forEach((shot, i) => checkShot(shot, state, `$.shotHistory[${i}]`, true));
  state.shotHistory.forEach((shot, i) => {
    if (
      shot.result !== null &&
      (!state.finished ||
        state.status === 'abandoned' ||
        i !== state.shotHistory.length - 1 ||
        !sameJSON(shot.result, state.result))
    )
      invalid(`$.shotHistory[${i}].result`, 'result must belong to the decisive final shot');
  });
  if (state.shotHistory.length + (state.shot === null ? 0 : 1) > state.shotCount)
    invalid('$.shotHistory', 'shot history exceeds the shot counter');
  if (state.shot !== null) {
    checkShot(state.shot, state, '$.shot');
    exact(state.shot.shooter, state.currentPlayer, '$.shot.shooter');
    exact(state.shot.wasBreak, state.breaking, '$.shot.wasBreak');
    for (const key of ['pocketed', 'offTable'])
      for (const id of state.shot[key])
        exact(state.balls.find((ball) => ball.id === id)[key], true, `$.shot.${key}`);
  }
  if (!state.finished) {
    if (state.phase === 'rolling') {
      if (!state.shot) invalid('$.shot', 'rolling requires a shot');
      exact(state.ballInHand, false, '$.ballInHand');
    } else {
      exact(state.shot, null, '$.shot');
      exact(state.ballInHand, state.phase === 'place-cue', '$.ballInHand');
    }
  } else if (state.status !== 'abandoned') {
    exact(state.shot, null, '$.shot');
    if (state.result.winner === null)
      invalid('$.result.winner', 'eight-ball completion requires a winner');
    const eight = state.balls.find((ball) => ball.id === 8);
    if (!eight.pocketed && !eight.offTable)
      invalid('$.balls', 'eight-ball result requires the decisive ball state');
    if (!state.shotHistory.length || state.shotHistory.at(-1).result === null)
      invalid('$.shotHistory', 'completion requires its decisive shot');
  }
}

function checkArcade(state) {
  exact(state.players.length, 1, '$.players');
  exact(state.currentPlayer, 0, '$.currentPlayer');
  exact(state.aiPlayers.length, 0, '$.aiPlayers');
  exact(state.width, 6, '$.width');
  exact(state.height, 12, '$.height');
  integer(state.score, '$.score');
  exact(state.level, 1 + Math.floor(state.score / 800), '$.level');
  const colorCount = state.level >= 15 ? 6 : state.level >= 10 ? 5 : state.level >= 5 ? 4 : 3;
  exact(state.availableColors, colorCount, '$.availableColors');
  array(state.colors, '$.colors', 6);
  state.colors.forEach((color, i) => {
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))
      invalid(`$.colors[${i}]`, 'invalid color');
  });
  array(state.grid, '$.grid', 12);
  state.grid.forEach((row, y) => {
    array(row, `$.grid[${y}]`, 6);
    row.forEach((cell, x) => {
      if (cell !== null) integer(cell, `$.grid[${y}][${x}]`, 0, colorCount - 1);
    });
  });
  const colors = (pair, path) => {
    object(pair, path);
    array(pair.colors, `${path}.colors`, 2);
    pair.colors.forEach((color, i) => integer(color, `${path}.colors[${i}]`, 0, colorCount - 1));
  };
  array(state.next, '$.next', 3);
  state.next.forEach((pair, i) => colors(pair, `$.next[${i}]`));
  if (state.current !== null) {
    colors(state.current, '$.current');
    integer(state.current.x, '$.current.x', 0, 5);
    integer(state.current.y, '$.current.y', -2, 11);
    integer(state.current.rotation, '$.current.rotation', 0, 3);
    for (const cell of arcadePieceCells(state.current)) {
      integer(cell.x, '$.current.cells.x', 0, 5);
      integer(cell.y, '$.current.cells.y', -2, 11);
      if (
        !state.finished &&
        state.phase === 'falling' &&
        cell.y >= 0 &&
        state.grid[cell.y][cell.x] !== null
      )
        invalid('$.current', 'falling piece overlaps the stack');
    }
  }
  array(state.pendingClear, '$.pendingClear', 0, 72);
  const clearing = new Set();
  for (const [i, cell] of state.pendingClear.entries()) {
    const path = `$.pendingClear[${i}]`;
    object(cell, path);
    integer(cell.x, `${path}.x`, 0, 5);
    integer(cell.y, `${path}.y`, 0, 11);
    const key = `${cell.x},${cell.y}`;
    if (clearing.has(key) || state.grid[cell.y][cell.x] === null)
      invalid(path, 'duplicate or empty clear cell');
    clearing.add(key);
  }
  integer(state.chain, '$.chain');
  numeric(state.clearTimer, '$.clearTimer', -STEP - EPSILON, 0.28 + EPSILON);
  integer(state.chargeProgress, '$.chargeProgress', 0, 3);
  integer(state.specialCharges, '$.specialCharges', 0, 3);
  numeric(state.freezeRemaining, '$.freezeRemaining', 0, 8);
  numeric(state.fallElapsed, '$.fallElapsed', 0, 2);
  oneOf(state.specialSelection, [null, 'color'], '$.specialSelection');
  bool(state.resumePiece, '$.resumePiece');
  object(state.stats, '$.stats');
  for (const key of [
    'pairsPlaced',
    'blocksCleared',
    'squares',
    'specialsUsed',
    'maxChain',
    'maxLevel',
  ])
    integer(state.stats[key], `$.stats.${key}`, key === 'maxLevel' ? 1 : 0);
  exact(state.stats.maxLevel, state.level, '$.stats.maxLevel');
  // A special starts chain one without increasing the combination-chain stat.
  if (state.stats.maxChain < state.chain && !(state.chain === 1 && state.resumePiece))
    invalid('$.stats.maxChain', 'chain exceeds recorded maximum');
  if (!state.finished) {
    if (state.phase === 'falling') {
      if (!state.current) invalid('$.current', 'falling requires a piece');
      exact(state.pendingClear.length, 0, '$.pendingClear');
      exact(state.resumePiece, false, '$.resumePiece');
    } else {
      if (!state.pendingClear.length || state.clearTimer <= 0 || state.chain < 1)
        invalid('$.pendingClear', 'clearing requires timed occupied cells');
      exact(state.resumePiece, state.current !== null, '$.resumePiece');
    }
  } else if (state.status !== 'abandoned') {
    if (!state.current) invalid('$.current', 'entry-gate loss requires the final piece');
    const lost = arcadePieceCells(state.current).some(
      (cell) => cell.y < 0 || state.grid[cell.y][cell.x] !== null,
    );
    if (!lost) invalid('$.current', 'terminal loss requires a blocked or above-grid piece');
    exact(state.result.score, state.score, '$.result.score');
    exact(state.result.level, state.level, '$.result.level');
    object(state.result.stats, '$.result.stats');
    for (const key of [
      'pairsPlaced',
      'blocksCleared',
      'squares',
      'specialsUsed',
      'maxChain',
      'maxLevel',
    ])
      exact(state.result.stats[key], state.stats[key], `$.result.stats.${key}`);
  }
}

function checkState(state) {
  checkBase(state);
  ({ bowling: checkBowling, darts: checkDarts, pool: checkPool, arcade: checkArcade })[state.kind](
    state,
  );
}

/** Return true for a valid state; throw Error on corruption without mutating it. */
export function validateActivity(state) {
  validatedClone(state);
  return true;
}

function validatedClone(state) {
  const restored = jsonClone(state);
  checkState(restored);
  if (JSON.stringify(restored).length > MAX_SERIALIZED_CHARS) invalid('$', 'save is too large');
  return restored;
}

/** Restore a detached plain-data clone suitable for the existing activity core. */
export function restoreActivity(serializedOrObject) {
  let value = serializedOrObject;
  if (typeof value === 'string') {
    if (value.length > MAX_SERIALIZED_CHARS) invalid('$', 'serialized save is too large');
    try {
      value = JSON.parse(value);
    } catch {
      invalid('$', 'malformed JSON');
    }
  }
  return validatedClone(value);
}
