import test from 'node:test';
import assert from 'node:assert/strict';
import { createMinigame, actMinigame, updateMinigame, dartTarget } from '../src/minigames.js';
import { restoreActivity, validateActivity } from '../src/activity-save.js';

const kinds = ['bowling', 'darts', 'pool', 'arcade'];
const clone = (state) => JSON.parse(JSON.stringify(state));
const human = (kind, options = {}) =>
  createMinigame(kind, { players: ['Mara'], aiPlayers: [], seed: 61, ...options });

function advanceUntil(state, predicate, limit = 3000) {
  for (let i = 0; i < limit && !predicate(state); i++) updateMinigame(state, 1 / 120);
  assert.ok(predicate(state), `${state.kind} stayed in ${state.phase}`);
}

function throwDart(state, segment, multiplier = 1) {
  assert.equal(
    actMinigame(state, { type: 'throw', ...dartTarget(segment, multiplier), steady: true }),
    true,
  );
  advanceUntil(state, (s) => s.phase !== 'throwing');
}

function roundTrip(state) {
  assert.equal(validateActivity(state), true);
  const fromObject = restoreActivity(state);
  const fromJSON = restoreActivity(JSON.stringify(state));
  assert.deepEqual(fromObject, clone(state));
  assert.deepEqual(fromJSON, fromObject);
  assert.notEqual(fromObject, state);
  assert.notEqual(fromObject.players, state.players);
  assert.notEqual(fromObject.players[0], state.players[0]);
  return fromJSON;
}

function rejectMutations(state, cases) {
  for (const [label, mutate] of cases) {
    const corrupt = clone(state);
    mutate(corrupt);
    assert.throws(() => restoreActivity(corrupt), /Invalid activity save/, label);
    assert.throws(() => validateActivity(corrupt), /Invalid activity save/, label);
  }
}

function rollingPool() {
  const state = human('pool', { players: ['Mara', 'Partner'] });
  assert.equal(
    actMinigame(state, { type: 'strike', angle: -Math.PI / 2, power: 1, elevation: 1 }),
    true,
  );
  updateMinigame(state, 0.075);
  return state;
}

function clearingArcade() {
  // A four-block horizontal group with the falling pair in the distant column.
  const state = human('arcade');
  state.grid[11].fill(0, 0, 4);
  state.current.x = 5;
  assert.equal(actMinigame(state, { type: 'drop' }), true);
  assert.equal(state.phase, 'clearing');
  updateMinigame(state, 0.12);
  return state;
}

for (const kind of kinds) {
  test(`${kind} initial state restores as detached JSON data`, () => {
    const state = human(kind, kind === 'pool' ? { players: ['Mara', 'Partner'] } : {});
    const restored = roundTrip(state);
    restored.players[0].name = 'Restored player';
    assert.equal(state.players[0].name, 'Mara');
  });
}

test('rolling bowling preserves a negative gutter coordinate and resumes physical pinfall', () => {
  const state = human('bowling');
  assert.equal(actMinigame(state, { type: 'roll', position: -1, direction: -1, power: 1 }), true);
  updateMinigame(state, 0.4);
  assert.ok(state.ball.x < -0.5);
  assert.equal(state.ball.gutter, true);
  const restored = roundTrip(state);
  advanceUntil(restored, (s) => s.phase !== 'rolling');
  assert.equal(restored.players[0].rolls[0], 0);
  assert.equal(restored.phase, 'aim');
  assert.equal(state.players[0].rolls.length, 0);
});

test('full physical perfect bowling game restores final-frame bonuses and retained final ball', () => {
  let state = human('bowling');
  for (let roll = 0; roll < 12; roll++) {
    assert.equal(actMinigame(state, { type: 'roll', direction: 0.05, power: 0.85, spin: 0 }), true);
    updateMinigame(state, 0.5);
    state = roundTrip(state);
    advanceUntil(state, (s) => s.phase !== 'rolling');
    if (!state.finished) state = roundTrip(state);
  }
  const restored = roundTrip(state);
  assert.equal(restored.finished, true);
  assert.equal(restored.result.outcome, 'complete');
  assert.equal(restored.result.scores[0], 300);
  assert.deepEqual(restored.players[0].frames[9].rolls, [10, 10, 10]);
  assert.equal(restored.players[0].maxStrikeRun, 12);
  assert.ok(restored.ball);
  updateMinigame(restored, 1);
  assert.equal(restored.players[0].score, 300);
});

test('two-player five-frame AI bowling restores turn switches and a complete match', () => {
  let state = createMinigame('bowling', {
    players: ['Mara', 'Partner'],
    aiPlayers: [0, 1],
    frameCount: 5,
    seed: 61,
    difficulty: 0.9,
  });
  const playersSeen = new Set();
  for (let i = 0; i < 15000 && !state.finished; i++) {
    updateMinigame(state, 1 / 120);
    playersSeen.add(state.currentPlayer);
    if (i % 173 === 0) state = roundTrip(state);
  }
  const restored = roundTrip(state);
  assert.equal(restored.finished, true);
  assert.deepEqual([...playersSeen].sort(), [0, 1]);
  assert.deepEqual(restored.result.scores, [93, 73]);
  assert.equal(restored.result.winner, 0);
});

test('a negative dart flight resumes as a miss without changing the turn score', () => {
  const state = human('darts');
  actMinigame(state, { type: 'throw', x: -1.4, y: -1.4, steady: true });
  updateMinigame(state, 0.1);
  assert.equal(state.phase, 'throwing');
  assert.ok(state.flight.progress > 0 && state.flight.progress < 1);
  const restored = roundTrip(state);
  advanceUntil(restored, (s) => s.phase === 'aim');
  assert.equal(restored.darts[0].ring, 'miss');
  assert.equal(restored.darts[0].x, -1.4);
  assert.equal(restored.players[0].remaining, 301);
  assert.equal(restored.throwsInTurn, 1);
});

test('dart turn history, shared hit references and a real six-dart checkout restore', () => {
  let state = human('darts');
  for (const [segment, multiplier] of [
    [20, 3],
    [20, 3],
    [20, 3],
    [20, 3],
    [11, 1],
    [25, 2],
  ]) {
    throwDart(state, segment, multiplier);
    state = roundTrip(state);
  }
  assert.equal(state.finished, true);
  assert.equal(state.players[0].remaining, 0);
  assert.equal(state.result.dartsThrown, 6);
  assert.equal(state.result.highestTurn, 180);
  assert.equal(state.turnDarts.at(-1).ring, 'inner-bull');
  assert.equal(state.players[0].turns.at(-1).checkout, true);
});

test('a genuine darts bust restores the previous score and advances the turn', () => {
  const state = human('darts');
  for (let i = 0; i < 5; i++) throwDart(state, 20, 3);
  const restored = roundTrip(state);
  assert.equal(restored.players[0].remaining, 121);
  assert.equal(restored.players[0].busts, 1);
  assert.equal(restored.players[0].turns[1].points, 0);
  assert.equal(restored.players[0].turns[1].bust, true);
  assert.equal(restored.turn, 3);
  assert.equal(restored.throwsInTurn, 0);
});

test('an airborne pool shot restores height and resolves an off-table scratch at negative y', () => {
  const state = rollingPool();
  const cue = state.balls.find((ball) => ball.id === 0);
  assert.ok(cue.z > 0.15 && cue.vz > 0);
  const restored = roundTrip(state);
  advanceUntil(restored, (s) => s.phase !== 'rolling');
  const offTableCue = restored.balls.find((ball) => ball.id === 0);
  assert.ok(offTableCue.y < 0);
  assert.equal(offTableCue.offTable, true);
  assert.equal(restored.phase, 'place-cue');
  assert.equal(restored.currentPlayer, 1);
  assert.equal(restored.shotHistory[0].foul, 'Cue-ball scratch.');
  const placed = roundTrip(restored);
  assert.equal(actMinigame(placed, { type: 'place-cue', x: 0.4, y: 0.5 }), true);
  assert.equal(placed.phase, 'aim');
  assert.equal(placed.balls.find((ball) => ball.id === 0).offTable, false);
  roundTrip(placed);
});

test('a complete physical pool match restores group assignment, pockets, foul history and winner', () => {
  let state = createMinigame('pool', { seed: 61, aiPlayers: [0, 1], difficulty: 0.9 });
  let assigned = false,
    ballInHand = false;
  for (let i = 0; i < 12000 && !state.finished; i++) {
    updateMinigame(state, 1 / 120);
    assigned ||= state.groups[0] !== null;
    ballInHand ||= state.ballInHand;
    if (i % 173 === 0) state = roundTrip(state);
  }
  const restored = roundTrip(state);
  assert.equal(restored.finished, true);
  assert.equal(assigned, true);
  assert.equal(ballInHand, true);
  assert.equal(restored.result.winner, 0);
  assert.equal(restored.result.reason, 'Legal eight-ball victory.');
  assert.equal(restored.balls.find((ball) => ball.id === 8).pocketed, true);
  assert.ok(restored.shotHistory.some((shot) => shot.foul));
});

test('a timed arcade combination restores pending cells and resolves the actual score', () => {
  const state = clearingArcade();
  assert.equal(state.pendingClear.length, 4);
  const restored = roundTrip(state);
  updateMinigame(restored, 0.3);
  assert.equal(restored.phase, 'falling');
  assert.equal(restored.pendingClear.length, 0);
  assert.equal(restored.stats.blocksCleared, 4);
  assert.equal(restored.score, 62);
  assert.ok(restored.clearTimer < 0);
  roundTrip(restored);
});

test('arcade special clearing preserves the live piece and omits optional undefined event metadata', () => {
  const state = human('arcade');
  state.grid[11][0] = 0;
  state.specialCharges = 2;
  assert.equal(actMinigame(state, { type: 'special', special: 'color' }), true);
  roundTrip(state);
  assert.equal(actMinigame(state, { type: 'special', special: 'freeze' }), true);
  assert.equal(state.specialSelection, 'color');
  roundTrip(state);
  assert.equal(actMinigame(state, { type: 'special', special: 'floor' }), true);
  assert.equal(state.events.at(-1).data.color, undefined);
  const restored = roundTrip(state);
  assert.equal(Object.hasOwn(restored.events.at(-1).data, 'color'), false);
  assert.equal(restored.resumePiece, true);
  assert.equal(restored.current.x, 2);
  updateMinigame(restored, 0.3);
  assert.equal(restored.phase, 'falling');
  assert.equal(restored.current.x, 2);
  assert.equal(restored.stats.blocksCleared, 1);
  assert.equal(restored.stats.specialsUsed, 2);
  roundTrip(restored);
});

test('arcade terminal loss accepts the current piece colliding with the filled entry gate', () => {
  const state = human('arcade');
  for (let i = 0; i < 12 && !state.finished; i++) actMinigame(state, { type: 'drop' });
  const restored = roundTrip(state);
  assert.equal(restored.finished, true);
  assert.equal(restored.result.outcome, 'loss');
  assert.equal(restored.stats.pairsPlaced, 6);
  assert.equal(restored.score, 72);
  assert.notEqual(restored.grid[0][restored.current.x], null);
});

test('abandonment retains partial physics in all four activities and terminal pause remains legal', () => {
  const states = [human('bowling'), human('darts'), rollingPool(), clearingArcade()];
  actMinigame(states[0], { type: 'roll', position: -0.5 });
  actMinigame(states[1], { type: 'throw', x: -0.5, y: -0.5 });
  for (const state of states) {
    assert.equal(actMinigame(state, { type: 'quit' }), true);
    assert.equal(actMinigame(state, { type: 'pause' }), true);
    const restored = roundTrip(state);
    assert.equal(restored.phase, 'complete');
    assert.equal(restored.status, 'abandoned');
    assert.equal(restored.paused, true);
    const before = clone(restored);
    updateMinigame(restored, 10);
    assert.deepEqual(restored, before);
  }
  assert.ok(states[0].ball);
  assert.ok(states[1].flight);
  assert.ok(states[2].shot);
  assert.equal(states[3].pendingClear.length, 4);
});

test('restore rejects malformed JSON, non-JSON values, cycles, accessors and prototype keys', () => {
  for (const value of ['{', 'null', '[]', '17', null, undefined, 42])
    assert.throws(() => restoreActivity(value), /Invalid activity save/);
  rejectMutations(human('bowling'), [
    [
      'NaN',
      (s) => {
        s.ball = NaN;
      },
    ],
    [
      'Infinity',
      (s) => {
        s.time = Infinity;
      },
    ],
    [
      'unsafe integer',
      (s) => {
        s.eventSequence = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      'function',
      (s) => {
        s.extra = () => 1;
      },
    ],
    [
      'BigInt',
      (s) => {
        s.extra = 1n;
      },
    ],
    [
      'Date',
      (s) => {
        s.extra = new Date();
      },
    ],
    [
      'cycle',
      (s) => {
        s.extra = s;
      },
    ],
    [
      'symbol',
      (s) => {
        s.extra = Symbol('save');
      },
    ],
    [
      'symbol key',
      (s) => {
        s[Symbol('save')] = 1;
      },
    ],
    [
      'sparse array',
      (s) => {
        delete s.pins[0];
      },
    ],
    [
      'array field',
      (s) => {
        s.pins.extra = 1;
      },
    ],
    [
      'prototype pollution',
      (s) => {
        Object.defineProperty(s, '__proto__', { value: {}, enumerable: true });
      },
    ],
  ]);
  const state = human('darts');
  let invoked = false;
  Object.defineProperty(state, 'time', {
    enumerable: true,
    get() {
      invoked = true;
      return 0;
    },
  });
  assert.throws(() => restoreActivity(state), /plain data property/);
  assert.equal(invoked, false);
  const toJSON = human('arcade');
  toJSON.toJSON = () => {
    invoked = true;
    return null;
  };
  assert.throws(() => restoreActivity(toJSON), /JSON-safe/);
  assert.equal(invoked, false);
  assert.throws(() => restoreActivity('{"__proto__":{}}'), /unsafe object key/);
});

test('restore rejects excessive sizes and deep nesting before resuming a session', () => {
  const state = human('arcade');
  rejectMutations(state, [
    [
      'oversized event text',
      (s) => {
        s.message = 'x'.repeat(4097);
      },
    ],
    [
      'oversized array',
      (s) => {
        s.extra = Array(4097).fill(0);
      },
    ],
    [
      'too many keys',
      (s) => {
        s.extra = Object.fromEntries(Array.from({ length: 129 }, (_, i) => [i, 0]));
      },
    ],
    [
      'deep object',
      (s) => {
        let tail = s;
        for (let i = 0; i < 25; i++) tail = tail.extra = {};
      },
    ],
  ]);
  assert.throws(() => restoreActivity(' '.repeat(1024 * 1024 + 1)), /too large/);
});

test('common metadata rejects unknown versions, invalid participants, event order and terminal contradictions', () => {
  const state = human('darts');
  rejectMutations(state, [
    [
      'kind',
      (s) => {
        s.kind = 'qub3d';
      },
    ],
    [
      'version',
      (s) => {
        s.version = 2;
      },
    ],
    [
      'phase',
      (s) => {
        s.phase = 'rolling';
      },
    ],
    [
      'missing player',
      (s) => {
        s.players = [];
      },
    ],
    [
      'unsafe player count',
      (s) => {
        s.players = Array(17).fill(s.players[0]);
      },
    ],
    [
      'participant object',
      (s) => {
        s.players[0] = null;
      },
    ],
    [
      'player index',
      (s) => {
        s.currentPlayer = 1;
      },
    ],
    [
      'AI reference',
      (s) => {
        s.aiPlayers = [1];
      },
    ],
    [
      'AI skill',
      (s) => {
        s.aiSkill = 2;
      },
    ],
    [
      'negative time',
      (s) => {
        s.time = -0.1;
      },
    ],
    [
      'negative accumulator',
      (s) => {
        s.accumulator = -1;
      },
    ],
    [
      'boolean',
      (s) => {
        s.paused = 1;
      },
    ],
    [
      'status',
      (s) => {
        s.status = 'finished';
      },
    ],
    [
      'result while playing',
      (s) => {
        s.result = { winner: 0, outcome: 'complete', reason: 'done' };
      },
    ],
    [
      'complete while playing',
      (s) => {
        s.phase = 'complete';
      },
    ],
    [
      'finished without result',
      (s) => {
        s.finished = true;
        s.phase = 'complete';
      },
    ],
    [
      'invalid event object',
      (s) => {
        s.events[0] = null;
      },
    ],
    [
      'event sequence',
      (s) => {
        s.eventSequence = 0;
      },
    ],
    [
      'duplicate event',
      (s) => {
        s.events.push(s.events[0]);
      },
    ],
    [
      'future event',
      (s) => {
        s.events[0].time = 1;
      },
    ],
    [
      'event data',
      (s) => {
        s.events[0].data = [];
      },
    ],
    [
      'event bound',
      (s) => {
        s.events = Array(81).fill(s.events[0]);
      },
    ],
  ]);
  actMinigame(state, { type: 'quit' });
  rejectMutations(state, [
    [
      'winner reference',
      (s) => {
        s.result.winner = 9;
      },
    ],
    [
      'abandoned winner',
      (s) => {
        s.result.winner = 0;
      },
    ],
    [
      'terminal phase',
      (s) => {
        s.phase = 'aim';
      },
    ],
    [
      'terminal status',
      (s) => {
        s.status = 'finished';
      },
    ],
    [
      'outcome',
      (s) => {
        s.result.outcome = 'victory';
      },
    ],
  ]);
});

test('bowling rejects corrupt scorecards, rack geometry, IDs and impossible rolling states', () => {
  const state = human('bowling');
  rejectMutations(state, [
    [
      'frame rule',
      (s) => {
        s.frameCount = 9;
      },
    ],
    [
      'lane',
      (s) => {
        s.lane.length = 0;
      },
    ],
    [
      'frame index',
      (s) => {
        s.frameIndex = 1;
      },
    ],
    [
      'aim power',
      (s) => {
        s.aim.power = 2;
      },
    ],
    [
      'score',
      (s) => {
        s.players[0].score = 1;
      },
    ],
    [
      'frame count',
      (s) => {
        s.players[0].frames.pop();
      },
    ],
    [
      'cached frame',
      (s) => {
        s.players[0].frames[0].cumulative = 50;
      },
    ],
    [
      'illegal rolls',
      (s) => {
        s.players[0].rolls = [8, 5];
      },
    ],
    [
      'stat',
      (s) => {
        s.players[0].strikes = 1;
      },
    ],
    [
      'duplicate pin',
      (s) => {
        s.pins[1].id = s.pins[0].id;
      },
    ],
    [
      'missing pin',
      (s) => {
        s.pins.pop();
      },
    ],
    [
      'null pin',
      (s) => {
        s.pins[0] = null;
      },
    ],
    [
      'pin radius',
      (s) => {
        s.pins[0].radius = 0;
      },
    ],
    [
      'pin coordinate',
      (s) => {
        s.pins[0].x = 1e10;
      },
    ],
    [
      'pin tilt',
      (s) => {
        s.pins[0].tilt = -1;
      },
    ],
    [
      'rolling without ball',
      (s) => {
        s.phase = 'rolling';
      },
    ],
  ]);
  actMinigame(state, { type: 'roll' });
  rejectMutations(state, [
    [
      'standing count',
      (s) => {
        s.rollStanding = 9;
      },
    ],
    [
      'ball shape',
      (s) => {
        s.ball = {};
      },
    ],
    [
      'mass',
      (s) => {
        s.ball.mass = 0;
      },
    ],
    [
      'velocity',
      (s) => {
        s.ball.vx = null;
      },
    ],
    [
      'elapsed',
      (s) => {
        s.rollElapsed = -1;
      },
    ],
    [
      'ball in aiming phase',
      (s) => {
        s.phase = 'aim';
      },
    ],
  ]);
});

test('darts rejects invalid board, hit scoring, turn history and flight state', () => {
  const state = human('darts');
  throwDart(state, 20, 3);
  rejectMutations(state, [
    [
      'starting rule',
      (s) => {
        s.startingScore = 100;
      },
    ],
    [
      'board sector',
      (s) => {
        s.board.sectorNumbers[0] = 19;
      },
    ],
    [
      'board size',
      (s) => {
        s.board.sectorNumbers.pop();
      },
    ],
    [
      'aim',
      (s) => {
        s.aim.x = -2;
      },
    ],
    [
      'remaining one',
      (s) => {
        s.players[0].remaining = 1;
      },
    ],
    [
      'zero while active',
      (s) => {
        s.players[0].remaining = 0;
      },
    ],
    [
      'turn count',
      (s) => {
        s.throwsInTurn = 2;
      },
    ],
    [
      'turn score',
      (s) => {
        s.turnStart = 300;
      },
    ],
    [
      'dart score',
      (s) => {
        s.darts[0].score = 180;
      },
    ],
    [
      'dart segment',
      (s) => {
        s.turnDarts[0].segment = 19;
      },
    ],
    [
      'dart owner',
      (s) => {
        s.turnDarts[0].player = 1;
      },
    ],
    [
      'dart shape',
      (s) => {
        s.darts[0] = null;
      },
    ],
    [
      'too many darts',
      (s) => {
        s.darts = Array(31).fill(s.darts[0]);
      },
    ],
    [
      'throw without flight',
      (s) => {
        s.phase = 'throwing';
      },
    ],
  ]);
  throwDart(state, 20, 3);
  throwDart(state, 20, 3);
  rejectMutations(state, [
    [
      'history points',
      (s) => {
        s.players[0].turns[0].points = 179;
      },
    ],
    [
      'false checkout',
      (s) => {
        s.players[0].turns[0].checkout = true;
      },
    ],
    [
      'empty history darts',
      (s) => {
        s.players[0].turns[0].darts = [];
      },
    ],
    [
      'highest turn',
      (s) => {
        s.players[0].highestTurn = 181;
      },
    ],
  ]);
  actMinigame(state, { type: 'throw', x: -0.2, y: -0.3 });
  rejectMutations(state, [
    [
      'flight progress',
      (s) => {
        s.flight.progress = 1.1;
      },
    ],
    [
      'flight duration',
      (s) => {
        s.flight.duration = 0;
      },
    ],
    [
      'flight coordinate',
      (s) => {
        s.flight.x = '0';
      },
    ],
    [
      'aim with flight',
      (s) => {
        s.phase = 'aim';
      },
    ],
  ]);
});

test('pool rejects malformed balls, pockets, groups, rules and inconsistent shot references', () => {
  const state = rollingPool();
  rejectMutations(state, [
    [
      'player count',
      (s) => {
        s.players.pop();
      },
    ],
    [
      'table width',
      (s) => {
        s.table.width = 0;
      },
    ],
    [
      'pocket count',
      (s) => {
        s.table.pockets.pop();
      },
    ],
    [
      'duplicate pocket',
      (s) => {
        s.table.pockets[1].id = 0;
      },
    ],
    [
      'pocket geometry',
      (s) => {
        s.table.pockets[0].x = 1;
      },
    ],
    [
      'rule',
      (s) => {
        s.rules.offTableEightLoses = false;
      },
    ],
    [
      'ball count',
      (s) => {
        s.balls.pop();
      },
    ],
    [
      'ball shape',
      (s) => {
        s.balls[0] = null;
      },
    ],
    [
      'duplicate ball',
      (s) => {
        s.balls[1].id = 0;
      },
    ],
    [
      'ball group',
      (s) => {
        s.balls[0].group = 'solid';
      },
    ],
    [
      'ball number',
      (s) => {
        s.balls[0].number = 1;
      },
    ],
    [
      'ball radius',
      (s) => {
        s.balls[0].radius = 0;
      },
    ],
    [
      'negative height',
      (s) => {
        s.balls[0].z = -1;
      },
    ],
    [
      'pocket reference',
      (s) => {
        s.balls[0].pocket = 7;
      },
    ],
    [
      'unremoved pocket reference',
      (s) => {
        s.balls[0].pocket = 0;
      },
    ],
    [
      'pocketed without pocket',
      (s) => {
        s.balls[0].pocketed = true;
      },
    ],
    [
      'contradictory removal',
      (s) => {
        s.balls[0].pocketed = s.balls[0].offTable = true;
      },
    ],
    [
      'moving off-table ball',
      (s) => {
        s.balls[0].offTable = true;
      },
    ],
    [
      'groups',
      (s) => {
        s.groups = ['solid', 'solid'];
      },
    ],
    [
      'player group cache',
      (s) => {
        s.players[0].group = 'solid';
      },
    ],
    [
      'shot counter',
      (s) => {
        s.shotCount = 0;
      },
    ],
    [
      'called pocket',
      (s) => {
        s.aim.calledPocket = 6;
      },
    ],
    [
      'rolling ball in hand',
      (s) => {
        s.ballInHand = true;
      },
    ],
    [
      'missing shot',
      (s) => {
        s.shot = null;
      },
    ],
    [
      'shooter',
      (s) => {
        s.shot.shooter = 1;
      },
    ],
    [
      'first-hit reference',
      (s) => {
        s.shot.firstHit = 16;
      },
    ],
    [
      'cue as first object hit',
      (s) => {
        s.shot.firstHit = 0;
      },
    ],
    [
      'duplicate pot',
      (s) => {
        s.shot.pocketed = [1, 1];
      },
    ],
    [
      'false pot reference',
      (s) => {
        s.shot.pocketed = [1];
      },
    ],
    [
      'scratch',
      (s) => {
        s.shot.scratch = true;
      },
    ],
    [
      'rail without contact',
      (s) => {
        s.shot.railAfterContact = true;
      },
    ],
    [
      'break',
      (s) => {
        s.shot.wasBreak = false;
      },
    ],
    [
      'aim while shooting',
      (s) => {
        s.phase = 'aim';
      },
    ],
  ]);
  advanceUntil(state, (s) => s.phase === 'place-cue');
  rejectMutations(state, [
    [
      'missing ball-in-hand',
      (s) => {
        s.ballInHand = false;
      },
    ],
    [
      'history shooter',
      (s) => {
        s.shotHistory[0].shooter = 2;
      },
    ],
    [
      'history reference',
      (s) => {
        s.shotHistory[0].offTable = [16];
      },
    ],
    [
      'history foul',
      (s) => {
        s.shotHistory[0].foul = false;
      },
    ],
    [
      'history overflow',
      (s) => {
        s.shotHistory = Array(61).fill(s.shotHistory[0]);
      },
    ],
  ]);
});

test('arcade rejects grid dimensions, cell values, live-piece collisions and invalid clears', () => {
  const state = human('arcade');
  rejectMutations(state, [
    [
      'width',
      (s) => {
        s.width = 7;
      },
    ],
    [
      'grid row count',
      (s) => {
        s.grid.pop();
      },
    ],
    [
      'grid column count',
      (s) => {
        s.grid[0].pop();
      },
    ],
    [
      'grid cell',
      (s) => {
        s.grid[11][0] = 6;
      },
    ],
    [
      'unavailable color',
      (s) => {
        s.grid[11][0] = 3;
      },
    ],
    [
      'palette shape',
      (s) => {
        s.colors[0] = 'red';
      },
    ],
    [
      'queue count',
      (s) => {
        s.next.pop();
      },
    ],
    [
      'pair size',
      (s) => {
        s.next[0].colors = [0];
      },
    ],
    [
      'pair color',
      (s) => {
        s.current.colors[0] = 6;
      },
    ],
    [
      'rotation',
      (s) => {
        s.current.rotation = 4;
      },
    ],
    [
      'piece column',
      (s) => {
        s.current.x = -1;
      },
    ],
    [
      'piece cells beyond board',
      (s) => {
        s.current.x = 5;
        s.current.rotation = 1;
      },
    ],
    [
      'piece overlap',
      (s) => {
        s.grid[0][s.current.x] = 0;
      },
    ],
    [
      'missing falling piece',
      (s) => {
        s.current = null;
      },
    ],
    [
      'level cache',
      (s) => {
        s.level = 2;
      },
    ],
    [
      'score fractional',
      (s) => {
        s.score = 0.5;
      },
    ],
    [
      'charges',
      (s) => {
        s.specialCharges = 4;
      },
    ],
    [
      'charge progress',
      (s) => {
        s.chargeProgress = 4;
      },
    ],
    [
      'freeze',
      (s) => {
        s.freezeRemaining = 9;
      },
    ],
    [
      'special selection',
      (s) => {
        s.specialSelection = 'floor';
      },
    ],
    [
      'resume while falling',
      (s) => {
        s.resumePiece = true;
      },
    ],
    [
      'stat',
      (s) => {
        s.stats.pairsPlaced = -1;
      },
    ],
  ]);
  const clearing = clearingArcade();
  rejectMutations(clearing, [
    [
      'no pending cells',
      (s) => {
        s.pendingClear = [];
      },
    ],
    [
      'duplicate pending',
      (s) => {
        s.pendingClear.push(s.pendingClear[0]);
      },
    ],
    [
      'clear off grid',
      (s) => {
        s.pendingClear[0].y = 12;
      },
    ],
    [
      'clear empty cell',
      (s) => {
        s.pendingClear[0] = { x: 4, y: 11 };
      },
    ],
    [
      'expired active clear',
      (s) => {
        s.clearTimer = 0;
      },
    ],
    [
      'no chain',
      (s) => {
        s.chain = 0;
      },
    ],
    [
      'resume without piece',
      (s) => {
        s.resumePiece = true;
      },
    ],
  ]);
});

test('valid zero RNG and a buffered timestep backlog survive restoration', () => {
  const state = human('bowling');
  state.rng = 0;
  updateMinigame(state, 31);
  assert.ok(state.accumulator > 0.99);
  const restored = roundTrip(state);
  updateMinigame(restored, 0);
  assert.ok(restored.accumulator < 1 / 120);
  assert.ok(restored.time > 30.99);
});

test('finished games reject forged results while pool result key order remains irrelevant', () => {
  const bowling = human('bowling');
  for (let i = 0; i < 12; i++) {
    actMinigame(bowling, { type: 'roll', direction: 0.05, power: 0.85, spin: 0 });
    advanceUntil(bowling, (s) => s.phase !== 'rolling');
  }
  rejectMutations(bowling, [
    [
      'forged score',
      (s) => {
        s.result.scores[0] = 299;
      },
    ],
    [
      'forged frame rule',
      (s) => {
        s.result.frameCount = 5;
      },
    ],
    [
      'forged draw',
      (s) => {
        s.result.winner = null;
        s.result.outcome = 'draw';
      },
    ],
    [
      'unfinished scorecard',
      (s) => {
        s.players[0].finished = false;
      },
    ],
  ]);
  const darts = human('darts');
  for (const [segment, multiplier] of [
    [20, 3],
    [20, 3],
    [20, 3],
    [20, 3],
    [11, 1],
    [25, 2],
  ])
    throwDart(darts, segment, multiplier);
  rejectMutations(darts, [
    [
      'forged winner',
      (s) => {
        s.result.winner = null;
        s.result.outcome = 'draw';
      },
    ],
    [
      'forged final dart count',
      (s) => {
        s.result.dartsThrown = 5;
      },
    ],
    [
      'forged final high turn',
      (s) => {
        s.result.highestTurn = 179;
      },
    ],
    [
      'retained flight at completion',
      (s) => {
        s.flight = { x: 0, y: 0, progress: 0, duration: 0.28 };
      },
    ],
  ]);
  const pool = createMinigame('pool', { seed: 61, aiPlayers: [0, 1], difficulty: 0.9 });
  advanceUntil(pool, (s) => s.finished, 12000);
  rejectMutations(pool, [
    [
      'missing decisive shot',
      (s) => {
        s.shotHistory = [];
      },
    ],
    [
      'missing shot result',
      (s) => {
        s.shotHistory.at(-1).result = null;
      },
    ],
    [
      'conflicting shot result',
      (s) => {
        s.shotHistory.at(-1).result.reason = 'Unrelated';
      },
    ],
    [
      'missing eight-ball outcome',
      (s) => {
        const eight = s.balls.find((ball) => ball.id === 8);
        eight.pocketed = eight.offTable = false;
        eight.pocket = null;
      },
    ],
  ]);
  pool.shotHistory.at(-1).result = {
    reason: pool.result.reason,
    outcome: pool.result.outcome,
    winner: pool.result.winner,
  };
  roundTrip(pool);
  const arcade = human('arcade');
  for (let i = 0; i < 12 && !arcade.finished; i++) actMinigame(arcade, { type: 'drop' });
  rejectMutations(arcade, [
    [
      'missing final piece',
      (s) => {
        s.current = null;
      },
    ],
    [
      'unblocked final piece',
      (s) => {
        s.current.x = 5;
        s.current.y = 2;
      },
    ],
    [
      'forged final score',
      (s) => {
        s.result.score++;
      },
    ],
    [
      'forged final stats',
      (s) => {
        s.result.stats.pairsPlaced++;
      },
    ],
  ]);
});
