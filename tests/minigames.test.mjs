import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMinigame,
  updateMinigame,
  actMinigame,
  bowlingFrames,
  bowlingScore,
  recordBowlingRoll,
  dartBoardHit,
  dartTarget,
  recordDartHit,
  chooseDartsAITarget,
  choosePoolAIShot,
  poolLegalTargets,
  canPlacePoolCue,
  resolvePoolShot,
  arcadePieceCells,
  arcadeClusters,
} from '../src/minigames.js';

const clone = (state) => JSON.parse(JSON.stringify(state));
const human = (kind) =>
  createMinigame(kind, {
    players: kind === 'arcade' ? ['Mara'] : ['Mara', 'Partner'],
    aiPlayers: [],
    assistance: true,
    seed: 61,
  });
function advanceUntil(s, condition, max = 3000) {
  for (let i = 0; i < max && !condition(s); i++) updateMinigame(s, 1 / 120);
  assert.ok(condition(s), `${s.kind} did not reach the expected state: ${s.phase}`);
}
function dart(s, segment, multiplier = 1) {
  const target = dartTarget(segment, multiplier);
  assert.equal(actMinigame(s, { type: 'throw', ...target, steady: true }), true);
  advanceUntil(s, (state) => state.phase !== 'throwing');
}
function poolFixture() {
  const s = human('pool');
  s.breaking = false;
  for (const b of s.balls) b.pocketed = ![0, 1, 8, 9].includes(b.id);
  Object.assign(
    s.balls.find((b) => b.id === 0),
    { x: 1.12, y: 0.75 },
  );
  Object.assign(
    s.balls.find((b) => b.id === 1),
    { x: 1.12, y: 0.3 },
  );
  Object.assign(
    s.balls.find((b) => b.id === 8),
    { x: 1.85, y: 0.83 },
  );
  Object.assign(
    s.balls.find((b) => b.id === 9),
    { x: 0.35, y: 0.35 },
  );
  return s;
}
function shotFixture(s, overrides = {}) {
  s.shot = {
    shooter: 0,
    firstHit: 1,
    pocketed: [],
    offTable: [],
    scratch: false,
    railAfterContact: true,
    elapsed: 1,
    wasBreak: false,
    eligibleEight: false,
    calledPocket: null,
    ...overrides,
  };
  return s.shot;
}
function arcadeWithPair() {
  const s = human('arcade');
  s.current = { x: 5, y: 0, rotation: 0, colors: [2, 2] };
  return s;
}

test('bowling uses full ten-frame scoring, pending bonuses, perfect games and a known mixed scorecard', () => {
  assert.equal(bowlingScore(Array(20).fill(0)), 0);
  assert.equal(bowlingScore(Array(12).fill(10)), 300);
  assert.equal(bowlingScore(Array(21).fill(5)), 150);
  assert.equal(bowlingScore([...Array.from({ length: 10 }, () => [9, 1]).flat(), 9]), 190);
  assert.equal(bowlingScore([10, 7, 3, 9, 0, 10, 0, 8, 8, 2, 0, 6, 10, 10, 10, 8, 1]), 167);
  assert.equal(bowlingFrames([10])[0].complete, true);
  assert.equal(bowlingFrames([10])[0].score, null);
  assert.equal(bowlingScore([10, 9, 0]), 28);
});
test('bowling enforces final-frame rack resets and rejects impossible pinfall/extra rolls', () => {
  assert.equal(bowlingScore([...Array(18).fill(0), 4, 6, 10]), 20);
  assert.equal(bowlingScore([...Array(18).fill(0), 10, 6, 4]), 20);
  assert.throws(() => bowlingScore([8, 5]), /ten pins/);
  assert.throws(() => bowlingScore([...Array(10).fill(10), 6, 5]), /bonus/);
  assert.throws(() => bowlingScore(Array(13).fill(10)), /allotment/);
  assert.throws(() => createMinigame('bowling', { frameCount: 3 }), /ten frames/);
  assert.equal(bowlingScore(Array(7).fill(10), 5), 150);
});
test('actual ball and pin collisions distinguish pocket strikes, central hits and gutters', () => {
  const outcomes = [];
  for (const direction of [0, 0.05, 0.15, 1]) {
    const s = createMinigame('bowling', { players: ['Mara'], aiPlayers: [] });
    assert.equal(actMinigame(s, { type: 'roll', direction, power: 0.85, spin: 0 }), true);
    advanceUntil(s, (state) => state.phase !== 'rolling');
    outcomes.push(s.players[0].rolls[0]);
  }
  assert.deepEqual(outcomes, [8, 10, 3, 0]);
});
test('bowling power, approach and spin change physical trajectories before contact', () => {
  const a = createMinigame('bowling', { players: ['Mara'] }),
    b = clone(a);
  actMinigame(a, { type: 'roll', power: 0.9, position: 0.2, spin: 1 });
  actMinigame(b, { type: 'roll', power: 0.3, position: -0.2, spin: -1 });
  updateMinigame(a, 1.5);
  updateMinigame(b, 1.5);
  assert.ok(a.ball.y > b.ball.y + 3);
  assert.ok(a.ball.x > b.ball.x);
  assert.equal(actMinigame(a, { type: 'steer', direction: 1 }), false);
});
test('a complete physical twelve-strike game scores 300 and preserves the tenth-frame bonuses', () => {
  const s = createMinigame('bowling', { players: ['Mara'], aiPlayers: [] });
  for (let roll = 0; roll < 12; roll++) {
    assert.equal(actMinigame(s, { type: 'roll', direction: 0.05, power: 0.85, spin: 0 }), true);
    advanceUntil(s, (state) => state.phase !== 'rolling');
  }
  assert.equal(s.finished, true);
  assert.equal(s.players[0].score, 300);
  assert.equal(s.players[0].frames.length, 10);
  assert.equal(s.players[0].frames[9].rolls.length, 3);
  assert.equal(s.players[0].maxStrikeRun, 12);
  assert.equal(s.result.frameCount, 10);
});
test('bowling opponents take physical shots and complete full frames rather than receiving random scores', () => {
  const s = createMinigame('bowling', {
    players: ['A', 'B'],
    aiPlayers: [0, 1],
    difficulty: 0.85,
    seed: 23,
  });
  advanceUntil(s, (state) => state.finished, 50000);
  for (const p of s.players) {
    assert.equal(p.frames.length, 10);
    assert.ok(p.frames.every((f) => f.complete));
    assert.equal(p.score, bowlingScore(p.rolls));
    assert.ok(p.rolls.length >= 12);
  }
  assert.ok(s.events.some((e) => e.kind === 'release'));
});
test('bowling alternates completed frames, retains spare attempts, and counts a final-frame spare only once', () => {
  const s = human('bowling');
  recordBowlingRoll(s, 6);
  assert.equal(s.currentPlayer, 0);
  recordBowlingRoll(s, 4);
  assert.equal(s.currentPlayer, 1);
  assert.equal(s.players[0].spares, 1);
  const solo = createMinigame('bowling', { players: ['Mara'] });
  for (let i = 0; i < 18; i++) recordBowlingRoll(solo, 0);
  recordBowlingRoll(solo, 4);
  recordBowlingRoll(solo, 6);
  recordBowlingRoll(solo, 10);
  assert.equal(solo.players[0].spares, 1);
  assert.equal(solo.finished, true);
});

test('dartboard geometry covers singles, triples, doubles, both bulls, sectors and misses', () => {
  assert.equal(dartBoardHit(0, -0.4).score, 20);
  assert.equal(dartBoardHit(0, -103 / 170).score, 60);
  assert.equal(dartBoardHit(0, -166 / 170).score, 40);
  assert.equal(dartBoardHit(0.4, 0).score, 6);
  assert.equal(dartBoardHit(0, 0.07).score, 25);
  assert.equal(dartBoardHit(0, 0).score, 50);
  assert.equal(dartBoardHit(0, 0).double, true);
  assert.equal(dartBoardHit(1.2, 0).score, 0);
  for (let n = 1; n <= 20; n++)
    for (const multiplier of [1, 2, 3]) {
      const p = dartTarget(n, multiplier);
      assert.equal(dartBoardHit(p.x, p.y).score, n * multiplier);
    }
});
test('three genuine dart flights make a 180 turn and hand control to the opponent', () => {
  const s = human('darts');
  dart(s, 20, 3);
  dart(s, 20, 3);
  dart(s, 20, 3);
  assert.equal(s.currentPlayer, 1);
  assert.equal(s.players[0].remaining, 121);
  assert.equal(s.players[0].highestTurn, 180);
  assert.equal(s.players[0].turns[0].darts.length, 3);
});
test('darts bust rolls back every dart in the turn, including a remaining score of one', () => {
  const s = human('darts');
  s.players[0].remaining = 50;
  s.turnStart = 50;
  dart(s, 20);
  assert.equal(s.players[0].remaining, 30);
  dart(s, 20, 3);
  assert.equal(s.players[0].remaining, 50);
  assert.equal(s.players[0].busts, 1);
  assert.equal(s.currentPlayer, 1);
  const one = human('darts');
  one.players[0].remaining = 41;
  one.turnStart = 41;
  dart(one, 20, 2);
  assert.equal(one.players[0].remaining, 41);
  assert.equal(one.currentPlayer, 1);
});
test('darts rejects a single checkout and accepts a double or inner bull', () => {
  const s = human('darts');
  s.players[0].remaining = 20;
  s.turnStart = 20;
  dart(s, 20);
  assert.equal(s.finished, false);
  assert.equal(s.players[0].remaining, 20);
  const double = human('darts');
  double.players[0].remaining = 16;
  double.turnStart = 16;
  dart(double, 8, 2);
  assert.equal(double.finished, true);
  assert.equal(double.result.winner, 0);
  const bull = human('darts');
  bull.players[0].remaining = 50;
  bull.turnStart = 50;
  dart(bull, 25, 2);
  assert.equal(bull.finished, true);
  assert.equal(bull.players[0].remaining, 0);
  const frozen = clone(bull);
  assert.equal(recordDartHit(bull, 0, 0), null);
  assert.deepEqual(bull, frozen);
});
test('the full 301 game can be legally won with six actual board throws', () => {
  const s = human('darts');
  for (let i = 0; i < 3; i++) dart(s, 20, 3);
  for (let i = 0; i < 3; i++) {
    actMinigame(s, { type: 'throw', x: 1.3, y: 0, steady: true });
    advanceUntil(s, (p) => p.phase !== 'throwing');
  }
  dart(s, 20, 3);
  dart(s, 15, 3);
  dart(s, 8, 2);
  assert.equal(s.finished, true);
  assert.equal(s.result.winner, 0);
  assert.equal(s.players[0].dartsThrown, 6);
});
test('darts AI plans a legal checkout but its actual board impacts still decide the result', () => {
  const s = createMinigame('darts', { aiPlayers: [0, 1], difficulty: 1, seed: 12 });
  s.players[0].remaining = 170;
  s.turnStart = 170;
  assert.equal(chooseDartsAITarget(s).intended.score, 60);
  advanceUntil(s, (state) => state.finished, 5000);
  assert.equal(s.result.winner, 0);
  assert.equal(s.players[0].dartsThrown, 3);
  assert.deepEqual(
    s.darts.map((d) => d.score),
    [60, 60, 50],
  );
});

test('pool rack has all sixteen balls, centered eight and mixed rear corners', () => {
  const s = human('pool');
  assert.equal(s.balls.length, 16);
  assert.equal(new Set(s.balls.map((b) => b.id)).size, 16);
  const eight = s.balls.find((b) => b.id === 8);
  assert.equal(eight.y, s.table.height / 2);
  const rear = s.balls.filter((b) => b.x > 1.76).sort((a, b) => a.y - b.y);
  assert.deepEqual([rear[0].group, rear.at(-1).group].sort(), ['solid', 'stripe']);
});
test('a real pool break transfers momentum, collides with cushions, and settles into a rule-resolved turn', () => {
  const s = human('pool'),
    before = s.balls.map((b) => ({ x: b.x, y: b.y }));
  assert.equal(actMinigame(s, { type: 'strike', angle: 0, power: 0.96 }), true);
  advanceUntil(s, (p) => p.phase !== 'rolling');
  assert.equal(s.shotHistory[0].firstHit, 1);
  assert.equal(s.shotHistory[0].foul, null);
  assert.ok(
    s.balls.some((b, i) => i > 0 && Math.hypot(b.x - before[i].x, b.y - before[i].y) > 0.05),
  );
  assert.ok(s.balls.every((b) => Math.hypot(b.vx, b.vy) < 0.008));
});
test('rough cloth changes deterministic ball travel without requiring side spin', () => {
  const smooth = human('pool'),
    rough = clone(smooth);
  rough.table.cloth = 'rough';
  actMinigame(smooth, { type: 'strike', angle: 0, power: 0.4, spin: 0 });
  actMinigame(rough, { type: 'strike', angle: 0, power: 0.4, spin: 0 });
  updateMinigame(smooth, 0.4);
  updateMinigame(rough, 0.4);
  assert.ok(
    Math.hypot(smooth.balls[0].x - rough.balls[0].x, smooth.balls[0].y - rough.balls[0].y) >
      0.00001,
  );
  const restored = clone(rough);
  updateMinigame(rough, 0.2);
  updateMinigame(restored, 0.2);
  assert.deepEqual(rough, restored);
});
test('an actual object-ball pocket assigns groups and retains a legal scoring turn', () => {
  const s = poolFixture();
  actMinigame(s, { type: 'strike', angle: -Math.PI / 2, power: 0.28 });
  advanceUntil(s, (p) => p.phase !== 'rolling');
  assert.equal(s.balls.find((b) => b.id === 1).pocketed, true);
  assert.deepEqual(s.groups, ['solid', 'stripe']);
  assert.equal(s.currentPlayer, 0);
  assert.equal(s.shotHistory[0].foul, null);
});
test('pool AI selects a clear legal ghost-ball path and its physical shot pockets the selected target', () => {
  const s = poolFixture();
  s.groups = ['solid', 'stripe'];
  const shot = choosePoolAIShot(s);
  assert.equal(shot.target, 1);
  assert.equal(shot.reason, 'clear-pot');
  actMinigame(s, shot);
  advanceUntil(s, (p) => p.phase !== 'rolling');
  assert.equal(s.balls.find((b) => b.id === 1).pocketed, true);
  assert.equal(s.shotHistory[0].firstHit, 1);
});
test('a legal eight-ball finish is decided by physical contact and pocketing after the group is clear', () => {
  const s = poolFixture();
  s.groups = ['solid', 'stripe'];
  s.balls.find((b) => b.id === 1).pocketed = true;
  Object.assign(
    s.balls.find((b) => b.id === 8),
    { x: 1.12, y: 0.3 },
  );
  assert.deepEqual(
    poolLegalTargets(s).map((b) => b.id),
    [8],
  );
  actMinigame(s, { type: 'strike', angle: -Math.PI / 2, power: 0.28, calledPocket: 1 });
  advanceUntil(s, (p) => p.finished);
  assert.equal(s.result.winner, 0);
  assert.equal(s.result.outcome, 'win');
});
test('premature eight pocketing loses, while the GTA-IV-style legal break eight wins', () => {
  for (const breaking of [false, true]) {
    const s = poolFixture();
    s.breaking = breaking;
    if (!breaking) s.groups = ['solid', 'stripe'];
    Object.assign(
      s.balls.find((b) => b.id === 1),
      { x: 0.75, y: 0.8 },
    );
    Object.assign(
      s.balls.find((b) => b.id === 8),
      { x: 1.12, y: 0.3 },
    );
    actMinigame(s, { type: 'strike', angle: -Math.PI / 2, power: 0.28 });
    advanceUntil(s, (p) => p.finished);
    assert.equal(s.result.winner, breaking ? 0 : 1);
  }
});
test('cue scratches produce ball-in-hand, reject overlapping placement and forbid shooting until placement', () => {
  const s = poolFixture();
  Object.assign(s.balls[0], { x: 1.12, y: 0.18 });
  actMinigame(s, { type: 'strike', angle: -Math.PI / 2, power: 0.2 });
  advanceUntil(s, (p) => p.phase !== 'rolling');
  assert.equal(s.phase, 'place-cue');
  assert.equal(s.currentPlayer, 1);
  assert.equal(s.ballInHand, true);
  assert.equal(actMinigame(s, { type: 'strike', angle: 0, power: 1 }), false);
  assert.equal(canPlacePoolCue(s, -1, 0), false);
  assert.equal(canPlacePoolCue(s, 1.12, 0.3), false);
  assert.equal(actMinigame(s, { type: 'place-cue', x: 0.65, y: 0.7 }), true);
  assert.equal(s.phase, 'aim');
});
test('pool fouls include wrong-first group, no rail after contact and pocketing an opponent ball', () => {
  for (const overrides of [{ firstHit: 9 }, { railAfterContact: false }, { pocketed: [9] }]) {
    const s = poolFixture();
    s.groups = ['solid', 'stripe'];
    shotFixture(s, overrides);
    resolvePoolShot(s);
    assert.equal(s.currentPlayer, 1);
    assert.equal(s.ballInHand, true);
    assert.equal(s.players[0].fouls, 1);
  }
});
test('off-table eight loses and an eight-ball scratch cannot be declared a victory', () => {
  const outside = poolFixture();
  shotFixture(outside, { offTable: [8] });
  resolvePoolShot(outside);
  assert.equal(outside.result.winner, 1);
  const scratch = poolFixture();
  scratch.groups = ['solid', 'stripe'];
  scratch.balls.find((b) => b.id === 1).pocketed = true;
  shotFixture(scratch, { firstHit: 8, pocketed: [8, 0], scratch: true, eligibleEight: true });
  resolvePoolShot(scratch);
  assert.equal(scratch.result.winner, 1);
});
test('pool AI respects assigned groups and only targets eight when its own group is absent', () => {
  const s = poolFixture();
  s.groups = ['stripe', 'solid'];
  assert.equal(choosePoolAIShot(s).target, 9);
  s.balls.find((b) => b.id === 9).pocketed = true;
  assert.equal(choosePoolAIShot(s).target, 8);
});
test('three complete autonomous pool matches end through real legal eight-ball shots', () => {
  const winners = [];
  for (const seed of [1, 61, 23]) {
    const s = createMinigame('pool', { seed, aiPlayers: [0, 1], difficulty: 0.9 });
    advanceUntil(s, (state) => state.finished, 20000);
    const last = s.shotHistory.at(-1);
    assert.equal(last.firstHit, 8);
    assert.equal(last.eligibleEight, true);
    assert.equal(last.foul, null);
    assert.equal(
      s.balls.filter((b) => !b.pocketed && b.group === s.groups[s.result.winner]).length,
      0,
    );
    assert.ok(s.shotCount > 10);
    winners.push(s.result.winner);
  }
  assert.deepEqual(winners, [1, 0, 1]);
});
test('a real elevated cue shot can leave the table and incurs a scratch rather than bypassing rails', () => {
  const s = poolFixture();
  Object.assign(s.balls[0], { x: 0.65, y: 0.1 });
  actMinigame(s, { type: 'strike', angle: -Math.PI / 2, power: 1, elevation: 1 });
  advanceUntil(s, (state) => state.phase !== 'rolling');
  assert.equal(s.shotHistory[0].offTable.includes(0), true);
  assert.equal(s.ballInHand, true);
  assert.equal(s.currentPlayer, 1);
});

test('STACKLIGHT seeded pairs rotate with wall kicks, fall independently and retain all twelve rows', () => {
  const s = human('arcade');
  assert.equal(s.grid.length, 12);
  assert.equal(s.grid[0].length, 6);
  s.current.x = 0;
  assert.equal(actMinigame(s, { type: 'rotate', direction: -1 }), true);
  assert.ok(arcadePieceCells(s.current).every((c) => c.x >= 0 && c.x < 6));
  assert.equal(actMinigame(s, { type: 'drop' }), true);
  assert.equal(s.stats.pairsPlaced, 1);
  assert.equal(s.grid.flat().filter((c) => c !== null).length, 2);
});
test('arcade clears connected four-plus groups but leaves a three-block group', () => {
  for (const count of [3, 4]) {
    const s = arcadeWithPair();
    for (let x = 0; x < count; x++) s.grid[11][x] = 0;
    actMinigame(s, { type: 'drop' });
    updateMinigame(s, 0.4);
    assert.equal(s.stats.blocksCleared, count === 4 ? 4 : 0);
  }
  assert.equal(
    arcadeClusters([
      [0, null],
      [0, 0],
      [1, 0],
    ])[0].cells.length,
    4,
  );
});
test('square clears charge power without consuming adjacent unmatched blocks', () => {
  const s = arcadeWithPair();
  for (const [x, y] of [
    [0, 10],
    [1, 10],
    [0, 11],
    [1, 11],
    [2, 11],
  ])
    s.grid[y][x] = 0;
  actMinigame(s, { type: 'drop' });
  assert.equal(s.pendingClear.length, 4);
  updateMinigame(s, 0.4);
  assert.equal(s.grid[11][2], 0);
  assert.equal(s.stats.squares, 1);
  assert.equal(s.chargeProgress, 1);
});
test('gravity creates a second-chain clear with increasing score instead of clearing all colors at once', () => {
  const s = arcadeWithPair();
  for (const [x, y] of [
    [0, 11],
    [1, 11],
    [1, 10],
    [2, 10],
  ])
    s.grid[y][x] = 0;
  for (const [x, y] of [
    [0, 10],
    [1, 9],
    [2, 11],
    [3, 11],
  ])
    s.grid[y][x] = 1;
  actMinigame(s, { type: 'drop' });
  assert.equal(s.pendingClear.length, 4);
  updateMinigame(s, 0.7);
  assert.equal(s.stats.blocksCleared, 8);
  assert.equal(s.stats.maxChain, 2);
  assert.equal(s.score, 142);
});
test('four squares earn a special, holdings cap at three, and increased levels add palette colors', () => {
  const s = human('arcade');
  for (let y = 2; y < 12; y++)
    for (let x = 0; x < 6; x++) s.grid[y][x] = (Math.floor(y / 2) + Math.floor(x / 2)) % 3;
  actMinigame(s, { type: 'drop' });
  updateMinigame(s, 0.7);
  assert.equal(s.specialCharges, 3);
  assert.ok(s.stats.squares >= 12);
  const levels = arcadeWithPair();
  levels.score = 3190;
  for (let x = 0; x < 4; x++) levels.grid[11][x] = 0;
  actMinigame(levels, { type: 'drop' });
  updateMinigame(levels, 0.4);
  assert.equal(levels.level, 5);
  assert.equal(levels.availableColors, 4);
});
test('arcade floor, columns and chosen-color specials clear actual selected cells and consume charges', () => {
  for (const special of ['floor', 'columns', 'color']) {
    const s = human('arcade');
    s.specialCharges = 1;
    s.grid[11][0] = 0;
    s.grid[10][2] = 1;
    s.grid[9][3] = 0;
    assert.equal(actMinigame(s, { type: 'special', special, color: 0 }), true);
    const amount = s.pendingClear.length;
    assert.equal(amount, special === 'floor' ? 3 : 2);
    updateMinigame(s, 0.3);
    assert.equal(s.specialCharges, 0);
    assert.equal(s.stats.blocksCleared, amount);
  }
  const selected = human('arcade');
  selected.specialCharges = 1;
  selected.grid[11][0] = 2;
  assert.equal(actMinigame(selected, { type: 'special', special: 'color' }), true);
  assert.equal(selected.specialCharges, 1);
  assert.equal(actMinigame(selected, { type: 'choose-color', color: 2 }), true);
  assert.equal(selected.specialCharges, 0);
});
test('freeze is time-limited, permits manual descent, and overfilling causes a real loss', () => {
  const s = human('arcade');
  s.specialCharges = 1;
  actMinigame(s, { type: 'special', special: 'freeze' });
  updateMinigame(s, 2);
  assert.equal(s.current.y, 0);
  actMinigame(s, { type: 'soft-drop' });
  assert.equal(s.current.y, 1);
  updateMinigame(s, 7);
  assert.equal(s.freezeRemaining, 0);
  assert.ok(s.current.y >= 2);
  const full = human('arcade');
  for (let i = 0; i < 10 && !full.finished; i++) actMinigame(full, { type: 'drop' });
  assert.equal(full.finished, true);
  assert.equal(full.result.outcome, 'loss');
  assert.ok(full.stats.pairsPlaced >= 6);
});

test('every minigame is deterministic and JSON-save resumable during its active physics/clear phase', () => {
  for (const kind of ['bowling', 'darts', 'pool', 'arcade']) {
    const s = human(kind);
    if (kind === 'bowling') actMinigame(s, { type: 'roll', direction: 0.05, power: 0.85 });
    if (kind === 'darts') actMinigame(s, { type: 'throw', ...dartTarget(20, 3), steady: true });
    if (kind === 'pool') actMinigame(s, { type: 'strike', angle: 0, power: 0.9 });
    if (kind === 'arcade') {
      for (let x = 0; x < 4; x++) s.grid[11][x] = 0;
      s.current.x = 5;
      actMinigame(s, { type: 'drop' });
    }
    updateMinigame(s, 0.12);
    const restored = clone(s);
    for (let i = 0; i < 700; i++) {
      updateMinigame(s, 1 / 120);
      updateMinigame(restored, 1 / 120);
    }
    assert.deepEqual(restored, s, kind);
  }
});
test('fixed-step updates preserve elapsed time across partitions, pauses, and resumed play', () => {
  const s = human('pool'),
    other = clone(s);
  actMinigame(s, { type: 'strike', power: 0.9 });
  actMinigame(other, { type: 'strike', power: 0.9 });
  updateMinigame(s, 2);
  for (let i = 0; i < 240; i++) updateMinigame(other, 1 / 120);
  assert.deepEqual(s.balls, other.balls);
  assert.equal(s.time, other.time);
  actMinigame(s, { type: 'pause' });
  const paused = clone(s);
  updateMinigame(s, 5);
  assert.deepEqual(s, paused);
  actMinigame(s, { type: 'resume' });
  updateMinigame(s, 0.1);
  assert.ok(s.time > paused.time);
});
test('invalid actions cannot fabricate victories and quitting remains an interrupted outcome', () => {
  for (const kind of ['bowling', 'darts', 'pool', 'arcade']) {
    const s = human(kind);
    assert.equal(actMinigame(s, { type: 'win', score: 999999 }), false);
    assert.equal(s.finished, false);
    assert.equal(actMinigame(s, { type: 'quit' }), true);
    assert.equal(s.result.outcome, 'abandoned');
    const stopped = clone(s);
    updateMinigame(s, 2);
    assert.deepEqual(s, stopped);
  }
});
