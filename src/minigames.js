/**
 * Original LOWLIGHT recreation rules, independent of the renderer and DOM.
 * Coordinates are metres for bowling/pool and unit-radius for darts.
 * All state, including RNG and partial physics, survives JSON serialization.
 * Source rule references: https://gta.fandom.com/wiki/Bowling,
 * https://gta.fandom.com/wiki/Darts, https://gta.fandom.com/wiki/Pool,
 * https://gta.fandom.com/wiki/QUB3D (indexed pages; direct access blocked).
 */
export const MINIGAME_KINDS = Object.freeze(['bowling', 'darts', 'pool', 'arcade']);
export const DART_SECTORS = Object.freeze([
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
]);
const STEP = 1 / 120;
const TAU = Math.PI * 2;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const number = (n, fallback = 0) => (Number.isFinite(n) ? n : fallback);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const copy = (value) => JSON.parse(JSON.stringify(value));

function random(s) {
  s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0;
  return s.rng / 4294967296;
}
function seeded(seed) {
  if (Number.isFinite(seed)) return seed >>> 0 || 61;
  let value = 2166136261;
  for (const ch of String(seed ?? 61)) value = Math.imul(value ^ ch.charCodeAt(0), 16777619) >>> 0;
  return value;
}
function event(s, kind, message, data = {}) {
  s.message = message;
  s.events.push({ id: ++s.eventSequence, kind, message, time: s.time, data });
  if (s.events.length > 80) s.events.shift();
}
function complete(s, winner, reason, extra = {}) {
  s.finished = true;
  s.phase = 'complete';
  s.status = 'finished';
  s.result = {
    winner,
    outcome:
      s.players.length === 1 && winner === 0
        ? 'complete'
        : winner === null
          ? 'draw'
          : winner === 0
            ? 'win'
            : 'loss',
    reason,
    ...extra,
  };
  event(s, 'complete', reason, s.result);
}
function base(kind, options) {
  const names = options.players?.length
    ? options.players.map((p) => (typeof p === 'string' ? p : p.name || 'Player'))
    : ['Mara', 'House'];
  if (kind === 'arcade') names.splice(1);
  const ai =
    kind === 'arcade'
      ? []
      : options.aiPlayers === undefined
        ? names.length > 1
          ? [1]
          : []
        : options.aiPlayers;
  return {
    kind,
    version: 1,
    title: {
      bowling: 'Breakwater Lanes',
      darts: 'Saint Brigid 301',
      pool: 'Anchor Eight',
      arcade: 'STACKLIGHT',
    }[kind],
    rng: seeded(options.seed),
    time: 0,
    accumulator: 0,
    phase: 'aim',
    status: 'playing',
    paused: false,
    finished: false,
    players: names.map((name) => ({ name })),
    currentPlayer: 0,
    aiPlayers: ai.filter((i) => Number.isInteger(i) && i >= 0 && i < names.length),
    aiSkill: clamp(number(options.difficulty ?? options.aiSkill, 0.72), 0, 1),
    aiWait: 0.75,
    assistance: !!options.assistance,
    result: null,
    message: 'Ready.',
    events: [],
    eventSequence: 0,
  };
}
export function isMinigameAITurn(s) {
  return s.aiPlayers.includes(s.currentPlayer);
}

// Ten-pin scoring keeps frame completion separate from pending strike bonuses.
export function bowlingFrames(rolls, frameCount = 10) {
  if (![5, 10].includes(frameCount))
    throw new RangeError('Bowling supports a full ten-frame or optional five-frame session.');
  if (!Array.isArray(rolls) || rolls.some((r) => !Number.isInteger(r) || r < 0 || r > 10))
    throw new RangeError('Pin counts must be integers from zero to ten.');
  const frames = [];
  let cursor = 0,
    cumulative = 0,
    known = true;
  for (let f = 0; f < frameCount; f++) {
    const first = rolls[cursor],
      second = rolls[cursor + 1],
      third = rolls[cursor + 2],
      last = f === frameCount - 1;
    let consumed = 0,
      score = null,
      done = false,
      strike = first === 10,
      spare = false,
      frameRolls = [];
    if (first !== undefined) {
      if (!last && strike) {
        consumed = 1;
        done = true;
        frameRolls = [first];
        if (second !== undefined && third !== undefined) score = 10 + second + third;
      } else if (!last) {
        if (second !== undefined && first + second > 10)
          throw new RangeError('A frame cannot knock down more than ten pins.');
        consumed = second === undefined ? 1 : 2;
        frameRolls = rolls.slice(cursor, cursor + consumed);
        done = consumed === 2;
        spare = done && first + second === 10;
        if (done && (!spare || third !== undefined)) score = first + second + (spare ? third : 0);
      } else {
        if (second !== undefined && first < 10 && first + second > 10)
          throw new RangeError("The final frame's second roll exceeds the remaining rack.");
        spare = first < 10 && second !== undefined && first + second === 10;
        const bonus = strike || spare;
        if (third !== undefined && (!bonus || (strike && second < 10 && second + third > 10)))
          throw new RangeError('Invalid final-frame bonus roll.');
        consumed =
          first === undefined ? 0 : second === undefined ? 1 : bonus && third !== undefined ? 3 : 2;
        frameRolls = rolls.slice(cursor, cursor + consumed);
        done = second !== undefined && (!bonus || third !== undefined);
        if (done) score = frameRolls.reduce((a, b) => a + b, 0);
      }
    }
    cursor += consumed;
    if (score === null) known = false;
    else cumulative += score;
    frames.push({
      index: f,
      rolls: frameRolls,
      score,
      cumulative: known ? cumulative : null,
      complete: done,
      strike,
      spare,
    });
  }
  if (cursor < rolls.length)
    throw new RangeError('The bowling session already has its complete allotment of rolls.');
  return frames;
}
export function bowlingScore(rolls, frameCount = 10) {
  return bowlingFrames(rolls, frameCount).reduce((sum, f) => sum + (f.score ?? 0), 0);
}
function bowlingNext(rolls, frames) {
  const index = frames.findIndex((f) => !f.complete);
  if (index < 0) return { frame: frames.length, maxPins: 0, newRack: true };
  const r = frames[index].rolls,
    last = index === frames.length - 1;
  const maxPins =
    !r.length ||
    (last && ((r.length === 1 && r[0] === 10) || (r.length === 2 && (r[0] < 10 || r[1] === 10))))
      ? 10
      : 10 - r.at(-1);
  return { frame: index, maxPins, newRack: maxPins === 10 };
}
function bowlingRack(s) {
  s.pins = [];
  let id = 1;
  for (let row = 0; row < 4; row++)
    for (let col = 0; col <= row; col++)
      s.pins.push({
        id: id++,
        x: (col - row / 2) * 0.245,
        y: s.lane.pinY + row * 0.212,
        vx: 0,
        vy: 0,
        radius: 0.058,
        standing: true,
        tilt: 0,
      });
}
function newBowling(options) {
  const s = base('bowling', options);
  s.frameCount = options.frameCount ?? 10;
  if (![5, 10].includes(s.frameCount))
    throw new RangeError("Use ten frames, or the source's optional five-frame half game.");
  s.lane = { width: 1.0668, length: 18.29, pinY: 17.25 };
  s.frameIndex = 0;
  s.aim = { position: 0, direction: 0, power: 0.8, spin: 0 };
  s.ball = null;
  s.rollElapsed = 0;
  s.players = s.players.map((p) => ({
    ...p,
    rolls: [],
    frames: bowlingFrames([], s.frameCount),
    score: 0,
    finished: false,
    strikes: 0,
    spares: 0,
    strikeRun: 0,
    maxStrikeRun: 0,
  }));
  bowlingRack(s);
  event(s, 'ready', 'Choose your approach, aim, power and spin.');
  return s;
}
export function recordBowlingRoll(s, pins) {
  const p = s.players[s.currentPlayer],
    previous = p.frames,
    before = bowlingNext(p.rolls, previous);
  if (!Number.isInteger(pins) || pins < 0 || pins > before.maxPins || p.finished)
    throw new RangeError('Pinfall exceeds the live rack.');
  p.rolls.push(pins);
  p.frames = bowlingFrames(p.rolls, s.frameCount);
  p.score = bowlingScore(p.rolls, s.frameCount);
  const after = bowlingNext(p.rolls, p.frames),
    frame = p.frames[before.frame];
  if (before.maxPins === 10 && pins === 10) {
    p.strikes++;
    p.strikeRun++;
    p.maxStrikeRun = Math.max(p.maxStrikeRun, p.strikeRun);
  } else p.strikeRun = 0;
  if (frame.spare && !previous[before.frame].spare) p.spares++;
  p.finished = p.frames.every((f) => f.complete);
  event(s, 'roll', `${p.name}: ${pins} pin${pins === 1 ? '' : 's'}.`, {
    player: s.currentPlayer,
    frame: before.frame,
    pins,
  });
  if (s.players.every((player) => player.finished)) {
    const scores = s.players.map((player) => player.score),
      high = Math.max(...scores),
      leaders = scores.map((n, i) => (n === high ? i : -1)).filter((i) => i >= 0);
    complete(s, leaders.length === 1 ? leaders[0] : null, 'Bowling session complete.', {
      scores,
      frameCount: s.frameCount,
    });
    return;
  }
  const frameFinished = after.frame !== before.frame;
  if (frameFinished)
    for (let i = 1; i <= s.players.length; i++) {
      const next = (s.currentPlayer + i) % s.players.length;
      if (!s.players[next].finished) {
        s.currentPlayer = next;
        break;
      }
    }
  const active = s.players[s.currentPlayer],
    next = bowlingNext(active.rolls, active.frames);
  s.frameIndex = next.frame;
  if (frameFinished || next.newRack) bowlingRack(s);
  else
    s.pins = s.pins.filter((pin) => pin.standing).map((pin) => ({ ...pin, vx: 0, vy: 0, tilt: 0 }));
  s.ball = null;
  s.phase = 'aim';
  s.aiWait = 0.9;
}
function launchBowling(s, action) {
  const a = s.aim;
  for (const key of ['position', 'direction', 'spin'])
    if (action[key] !== undefined) a[key] = clamp(number(action[key]), -1, 1);
  if (action.aim !== undefined) a.direction = clamp(number(action.aim), -1, 1);
  if (action.power !== undefined) a.power = clamp(number(action.power, 0.8), 0, 1);
  const speed = 2.8 + a.power * 5.6,
    angle = a.direction * 0.12;
  s.ball = {
    x: a.position * 0.38,
    y: 0.24,
    vx: Math.sin(angle) * speed,
    vy: Math.cos(angle) * speed,
    radius: 0.1085,
    spin: a.spin,
    mass: 6.5,
    gutter: false,
    active: true,
  };
  s.rollStanding = s.pins.filter((p) => p.standing).length;
  s.rollElapsed = 0;
  s.phase = 'rolling';
  event(s, 'release', `${s.players[s.currentPlayer].name} releases the ball.`);
}
function friction(body, dt, rate) {
  const speed = Math.hypot(body.vx, body.vy),
    next = Math.max(0, speed - rate * dt);
  if (!next) {
    body.vx = 0;
    body.vy = 0;
  } else if (speed) {
    body.vx *= next / speed;
    body.vy *= next / speed;
  }
}
function collideCircle(a, b, massA, massB, restitution, onImpulse) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    d = Math.hypot(dx, dy),
    overlap = a.radius + b.radius - d;
  if (overlap <= 0) return false;
  const nx = d ? dx / d : 1,
    ny = d ? dy / d : 0,
    total = massA + massB;
  a.x -= (nx * overlap * massB) / total;
  a.y -= (ny * overlap * massB) / total;
  b.x += (nx * overlap * massA) / total;
  b.y += (ny * overlap * massA) / total;
  const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (closing > 0) {
    const impulse = (closing * (1 + restitution)) / (1 / massA + 1 / massB);
    a.vx -= (impulse / massA) * nx;
    a.vy -= (impulse / massA) * ny;
    b.vx += (impulse / massB) * nx;
    b.vy += (impulse / massB) * ny;
    onImpulse?.(impulse);
    return true;
  }
  return false;
}
function tickBowling(s, dt) {
  if (s.phase !== 'rolling') return;
  const b = s.ball;
  s.rollElapsed += dt;
  if (b.active) {
    if (!b.gutter) b.vx += b.spin * 0.22 * Math.pow(b.y / s.lane.length, 2) * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (Math.abs(b.x) > s.lane.width / 2 - b.radius * 0.2) {
      b.gutter = true;
      b.x = Math.sign(b.x) * (s.lane.width / 2 + 0.08);
      b.vx = 0;
    }
    if (!b.gutter)
      for (const p of s.pins)
        collideCircle(b, p, b.mass, 1.55, 0.35, (impulse) => {
          if (impulse / 1.55 > 0.55) p.standing = false;
        });
    if (b.y > s.lane.length + 1.6) b.active = false;
  }
  for (const p of s.pins) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    friction(p, dt, 2.8);
    if (!p.standing) p.tilt = Math.min(1, p.tilt + dt * 4);
    if (Math.abs(p.x) > 0.64) {
      p.x = Math.sign(p.x) * 0.64;
      p.vx *= -0.25;
    }
    if (p.y > s.lane.length + 0.7) {
      p.y = s.lane.length + 0.7;
      p.vy *= -0.25;
    }
  }
  for (let i = 0; i < s.pins.length; i++)
    for (let j = i + 1; j < s.pins.length; j++)
      collideCircle(s.pins[i], s.pins[j], 1.55, 1.55, 0.3, (impulse) => {
        if (impulse / 1.55 > 0.42) {
          s.pins[i].standing = false;
          s.pins[j].standing = false;
        }
      });
  const moving = s.pins.some((p) => Math.hypot(p.vx, p.vy) > 0.08);
  if ((!b.active && !moving && s.rollElapsed > 2) || s.rollElapsed > 9)
    recordBowlingRoll(s, s.rollStanding - s.pins.filter((p) => p.standing).length);
}
function chooseBowlingAIShot(s) {
  const standing = s.pins.filter((p) => p.standing),
    position = (random(s) - 0.5) * 0.35;
  let target =
    standing.length === 10
      ? 0.105
      : standing.reduce((sum, p) => sum + p.x, 0) / Math.max(1, standing.length);
  target += (random(s) - random(s)) * (0.015 + (1 - s.aiSkill) * 0.17);
  return {
    type: 'roll',
    position,
    direction: clamp(Math.atan2(target - position * 0.38, s.lane.pinY) / 0.12, -1, 1),
    power: 0.65 + s.aiSkill * 0.23,
    spin: 0,
  };
}

export const DART_RINGS = Object.freeze({
  innerBull: 6.35 / 170,
  outerBull: 15.9 / 170,
  tripleInner: 99 / 170,
  tripleOuter: 107 / 170,
  doubleInner: 162 / 170,
});

export function dartBoardHit(x, y) {
  const radius = Math.hypot(x, y);
  if (!Number.isFinite(radius) || radius > 1)
    return { score: 0, segment: 0, multiplier: 0, ring: 'miss', double: false };
  if (radius <= DART_RINGS.innerBull)
    return { score: 50, segment: 25, multiplier: 2, ring: 'inner-bull', double: true };
  if (radius <= DART_RINGS.outerBull)
    return { score: 25, segment: 25, multiplier: 1, ring: 'outer-bull', double: false };
  const angle = (Math.atan2(x, -y) + TAU + Math.PI / 20) % TAU,
    segment = DART_SECTORS[Math.floor(angle / (Math.PI / 10))];
  const multiplier =
    radius >= DART_RINGS.doubleInner
      ? 2
      : radius >= DART_RINGS.tripleInner && radius <= DART_RINGS.tripleOuter
        ? 3
        : 1;
  return {
    score: segment * multiplier,
    segment,
    multiplier,
    ring: multiplier === 2 ? 'double' : multiplier === 3 ? 'triple' : 'single',
    double: multiplier === 2,
  };
}
export function dartTarget(segment, multiplier = 1) {
  if (segment === 25) return { x: 0, y: multiplier === 2 ? 0 : 0.07 };
  const index = DART_SECTORS.indexOf(segment);
  if (index < 0) throw new RangeError('Unknown dartboard segment.');
  const radius = multiplier === 3 ? 103 / 170 : multiplier === 2 ? 166 / 170 : 0.35,
    angle = (index * Math.PI) / 10;
  return { x: Math.sin(angle) * radius, y: -Math.cos(angle) * radius };
}
function newDarts(options) {
  const s = base('darts', options);
  s.startingScore = options.startingScore ?? 301;
  if (![301, 501].includes(s.startingScore))
    throw new RangeError('Use the full 301 game or optional 501 extension.');
  s.board = { radius: 1, sectorNumbers: [...DART_SECTORS] };
  s.aim = { x: 0, y: -103 / 170, steady: false };
  s.wobblePhase = random(s) * TAU;
  s.turnStart = s.startingScore;
  s.throwsInTurn = 0;
  s.turnDarts = [];
  s.darts = [];
  s.flight = null;
  s.turn = 1;
  s.players = s.players.map((p) => ({
    ...p,
    remaining: s.startingScore,
    dartsThrown: 0,
    busts: 0,
    highestTurn: 0,
    turns: [],
  }));
  event(s, 'ready', 'Start at 301. Three darts per turn; finish on a double or inner bull.');
  return s;
}
export function dartsAimPosition(s, steady = s.aim.steady) {
  const amplitude = s.assistance || steady ? 0 : 0.014;
  return {
    x: s.aim.x + Math.sin(s.time * 3.9 + s.wobblePhase) * amplitude,
    y: s.aim.y + Math.cos(s.time * 4.7 + s.wobblePhase) * amplitude,
  };
}
function dartsTurn(s, bust) {
  const p = s.players[s.currentPlayer],
    points = bust ? 0 : s.turnStart - p.remaining;
  p.highestTurn = Math.max(p.highestTurn, points);
  p.turns.push({ points, darts: copy(s.turnDarts), bust });
  if (p.turns.length > 80) p.turns.shift();
  s.lastTurn = { player: s.currentPlayer, points, bust };
  s.currentPlayer = (s.currentPlayer + 1) % s.players.length;
  s.turnStart = s.players[s.currentPlayer].remaining;
  s.throwsInTurn = 0;
  s.turnDarts = [];
  s.turn++;
  s.aiWait = 0.7;
}
export function recordDartHit(s, x, y) {
  if (s.finished) return null;
  const p = s.players[s.currentPlayer],
    hit = { ...dartBoardHit(x, y), x, y, player: s.currentPlayer, time: s.time };
  s.darts.push(hit);
  if (s.darts.length > 30) s.darts.shift();
  s.turnDarts.push(hit);
  s.throwsInTurn++;
  p.dartsThrown++;
  const remaining = p.remaining - hit.score;
  if (remaining < 0 || remaining === 1 || (remaining === 0 && !hit.double)) {
    p.remaining = s.turnStart;
    p.busts++;
    event(s, 'bust', `${p.name} busts; the turn's score is restored.`, hit);
    dartsTurn(s, true);
  } else if (remaining === 0) {
    p.remaining = 0;
    p.highestTurn = Math.max(p.highestTurn, s.turnStart);
    p.turns.push({ points: s.turnStart, darts: copy(s.turnDarts), bust: false, checkout: true });
    if (p.turns.length > 80) p.turns.shift();
    complete(s, s.currentPlayer, 'A legal double checkout.', {
      dartsThrown: p.dartsThrown,
      highestTurn: p.highestTurn,
    });
  } else {
    p.remaining = remaining;
    event(s, 'dart', `${p.name}: ${hit.score}. ${remaining} remaining.`, hit);
    if (s.throwsInTurn === 3) dartsTurn(s, false);
  }
  s.flight = null;
  if (!s.finished) {
    s.phase = 'aim';
    s.aiWait = 0.6;
  }
  return hit;
}
function throwDart(s, action) {
  if (action.x !== undefined) s.aim.x = clamp(number(action.x), -1.5, 1.5);
  if (action.y !== undefined) s.aim.y = clamp(number(action.y), -1.5, 1.5);
  if (action.steady !== undefined) s.aim.steady = !!action.steady;
  const point = dartsAimPosition(s);
  s.flight = { x: point.x, y: point.y, progress: 0, duration: 0.28 };
  s.phase = 'throwing';
}
function dartCandidates() {
  const candidates = [];
  for (let segment = 1; segment <= 20; segment++)
    for (const multiplier of [3, 2, 1])
      candidates.push({
        segment,
        multiplier,
        score: segment * multiplier,
        double: multiplier === 2,
      });
  candidates.push(
    { segment: 25, multiplier: 2, score: 50, double: true },
    { segment: 25, multiplier: 1, score: 25, double: false },
  );
  return candidates.sort((a, b) => b.score - a.score);
}
export function chooseDartsAITarget(s) {
  const remaining = s.players[s.currentPlayer].remaining,
    available = 3 - s.throwsInTurn,
    candidates = dartCandidates(),
    memo = new Map();
  function checkout(score, darts) {
    const key = `${score}:${darts}`;
    if (memo.has(key)) return memo.get(key);
    for (const c of candidates) if (c.score === score && c.double) return [c];
    if (darts > 1)
      for (const c of candidates) {
        const rest = score - c.score;
        if (rest < 2) continue;
        const tail = checkout(rest, darts - 1);
        if (tail) {
          const result = [c, ...tail];
          memo.set(key, result);
          return result;
        }
      }
    memo.set(key, null);
    return null;
  }
  const plan = checkout(remaining, available);
  const selected =
    plan?.[0] ||
    candidates.find((c) => remaining - c.score >= 2 && remaining - c.score !== 1) ||
    candidates.at(-1);
  const target = dartTarget(selected.segment, selected.multiplier),
    spread = 0.005 + (1 - s.aiSkill) * 0.055;
  return {
    type: 'throw',
    x: target.x + (random(s) - random(s)) * spread,
    y: target.y + (random(s) - random(s)) * spread,
    steady: true,
    intended: selected,
  };
}

const POOL_RADIUS = 0.028575;
const POOL_FRICTION = 0.48;
const ballGroup = (id) => (id === 0 ? 'cue' : id === 8 ? 'eight' : id < 8 ? 'solid' : 'stripe');
function newPool(options) {
  const s = base('pool', options),
    width = 2.24,
    height = 1.12;
  if (s.players.length !== 2) throw new RangeError('Eight-ball requires two players.');
  s.table = {
    width,
    height,
    cloth: options.cloth === 'rough' ? 'rough' : 'smooth',
    pockets: [
      [0, 0],
      [width / 2, 0],
      [width, 0],
      [0, height],
      [width / 2, height],
      [width, height],
    ].map(([x, y], id) => ({ id, x, y, radius: 0.073 })),
  };
  s.rules = {
    eightOnBreakWins: true,
    wrongGroupPocketIsFoul: true,
    ballInHandOnFoul: true,
    offTableEightLoses: true,
  };
  s.balls = [];
  function ball(id, x, y) {
    return {
      id,
      number: id,
      group: ballGroup(id),
      x,
      y,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      spin: 0,
      radius: POOL_RADIUS,
      pocketed: false,
      offTable: false,
      pocket: null,
    };
  }
  s.balls.push(ball(0, width * 0.25, height / 2));
  const order = [1, 9, 2, 3, 8, 10, 11, 4, 12, 5, 6, 13, 14, 7, 15];
  let index = 0;
  for (let row = 0; row < 5; row++)
    for (let col = 0; col <= row; col++)
      s.balls.push(
        ball(
          order[index++],
          width * 0.7 + row * POOL_RADIUS * Math.sqrt(3) * 1.004,
          height / 2 + (col - row / 2) * POOL_RADIUS * 2.008,
        ),
      );
  s.players = s.players.map((p) => ({ ...p, group: null, potted: 0, fouls: 0, shots: 0 }));
  s.groups = [null, null];
  s.aim = { angle: 0, power: 0.8, spin: 0, elevation: 0, calledPocket: null };
  s.shot = null;
  s.shotHistory = [];
  s.ballInHand = false;
  s.breaking = true;
  s.shotCount = 0;
  event(s, 'ready', 'Pocket your group, then the eight. Scratches and fouls grant ball in hand.');
  return s;
}
export function poolLegalTargets(s, player = s.currentPlayer) {
  const group = s.groups[player],
    live = s.balls.filter((b) => !b.pocketed && !b.offTable && b.id !== 0);
  if (!group) return live.filter((b) => b.id !== 8);
  const own = live.filter((b) => b.group === group);
  return own.length ? own : live.filter((b) => b.id === 8);
}
function poolCue(s) {
  return s.balls.find((b) => b.id === 0);
}
function poolOther(s, player = s.currentPlayer) {
  return (player + 1) % s.players.length;
}
export function canPlacePoolCue(s, x, y) {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < POOL_RADIUS ||
    y < POOL_RADIUS ||
    x > s.table.width - POOL_RADIUS ||
    y > s.table.height - POOL_RADIUS
  )
    return false;
  return (
    !s.balls.some(
      (b) =>
        b.id !== 0 &&
        !b.pocketed &&
        !b.offTable &&
        Math.hypot(b.x - x, b.y - y) < POOL_RADIUS * 2.03,
    ) && !s.table.pockets.some((p) => Math.hypot(p.x - x, p.y - y) < p.radius + POOL_RADIUS)
  );
}
function placePoolCue(s, x, y) {
  if (!canPlacePoolCue(s, x, y)) return false;
  Object.assign(poolCue(s), {
    x,
    y,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    spin: 0,
    pocketed: false,
    offTable: false,
    pocket: null,
  });
  s.ballInHand = false;
  s.phase = 'aim';
  s.aiWait = 0.7;
  event(s, 'placement', 'Cue ball placed.');
  return true;
}
function poolFreeSpot(s) {
  for (let col = 0; col < 24; col++)
    for (let row = 0; row < 12; row++) {
      const x = 0.12 + col * 0.085,
        y = 0.1 + row * 0.08;
      if (canPlacePoolCue(s, x, y)) return { x, y };
    }
  return { x: s.table.width / 4, y: s.table.height / 2 };
}
function launchPool(s, action) {
  const aim = s.aim;
  for (const key of ['angle', 'power', 'spin', 'elevation'])
    if (action[key] !== undefined) aim[key] = number(action[key], aim[key]);
  aim.angle = Math.atan2(Math.sin(aim.angle), Math.cos(aim.angle));
  aim.power = clamp(aim.power, 0, 1);
  aim.spin = clamp(aim.spin, -1, 1);
  aim.elevation = clamp(aim.elevation, 0, 1);
  if (action.calledPocket !== undefined)
    aim.calledPocket =
      Number.isInteger(action.calledPocket) && action.calledPocket >= 0 && action.calledPocket < 6
        ? action.calledPocket
        : null;
  const cue = poolCue(s),
    speed = 0.2 + aim.power * 4.6;
  cue.vx = Math.cos(aim.angle) * speed;
  cue.vy = Math.sin(aim.angle) * speed;
  cue.spin = aim.spin;
  cue.vz = aim.elevation * speed * 0.55;
  cue.z = cue.vz > 0 ? 0.001 : 0;
  const targets = poolLegalTargets(s);
  s.shot = {
    shooter: s.currentPlayer,
    firstHit: null,
    pocketed: [],
    offTable: [],
    scratch: false,
    railAfterContact: false,
    elapsed: 0,
    wasBreak: s.breaking,
    eligibleEight: !!s.groups[s.currentPlayer] && targets.length === 1 && targets[0].id === 8,
    calledPocket: aim.calledPocket,
  };
  s.players[s.currentPlayer].shots++;
  s.shotCount++;
  s.phase = 'rolling';
  event(s, 'strike', `${s.players[s.currentPlayer].name} takes the shot.`);
}
function poolPocket(s, b, pocket) {
  b.pocketed = true;
  b.pocket = pocket.id;
  b.vx = b.vy = b.vz = b.z = 0;
  s.shot.pocketed.push(b.id);
  if (b.id === 0) s.shot.scratch = true;
  event(s, 'pocket', b.id === 0 ? 'Cue ball scratch.' : `Ball ${b.id} pocketed.`, {
    ball: b.id,
    pocket: pocket.id,
  });
}
export function resolvePoolShot(s) {
  const shot = s.shot;
  if (!shot) return null;
  const shooter = shot.shooter,
    other = poolOther(s, shooter),
    group = s.groups[shooter];
  const first = s.balls.find((b) => b.id === shot.firstHit),
    eight = s.balls.find((b) => b.id === 8),
    objectPots = shot.pocketed.filter((id) => id !== 0 && id !== 8);
  let reason = null;
  if (shot.scratch || shot.offTable.includes(0)) reason = 'Cue-ball scratch.';
  else if (shot.firstHit === null) reason = 'No object-ball contact.';
  else if (
    !shot.wasBreak &&
    (!group ? first?.id === 8 : shot.eligibleEight ? first?.id !== 8 : first?.group !== group)
  )
    reason = 'Wrong object ball contacted first.';
  else if (!shot.pocketed.length && !shot.railAfterContact)
    reason = 'No rail or pocket after contact.';
  else if (shot.offTable.length) reason = 'A ball left the table.';
  else if (group && objectPots.some((id) => ballGroup(id) !== group))
    reason = "Opponent's group pocketed.";
  if (eight.offTable || shot.offTable.includes(8)) {
    reason = 'Eight ball left the table.';
    complete(s, other, reason);
  } else if (shot.pocketed.includes(8)) {
    const calledLegal = shot.calledPocket === null || shot.calledPocket === eight.pocket;
    const legal = !reason && calledLegal && (shot.wasBreak || shot.eligibleEight);
    complete(
      s,
      legal ? shooter : other,
      legal
        ? shot.wasBreak
          ? 'Eight ball legally pocketed on the break.'
          : 'Legal eight-ball victory.'
        : 'Premature or fouled eight ball.',
    );
  }
  if (!s.finished && !group && !reason && objectPots.length) {
    s.groups[shooter] = ballGroup(objectPots[0]);
    s.groups[other] = s.groups[shooter] === 'solid' ? 'stripe' : 'solid';
    s.players.forEach((p, i) => {
      p.group = s.groups[i];
    });
    event(s, 'groups', `${s.players[shooter].name} takes ${s.groups[shooter]} balls.`);
  }
  const record = { ...copy(shot), foul: reason, result: s.result };
  s.shotHistory.push(record);
  if (s.shotHistory.length > 60) s.shotHistory.shift();
  s.breaking = false;
  if (!s.finished) {
    for (const id of shot.offTable)
      if (id !== 0 && id !== 8) {
        const b = s.balls.find((ball) => ball.id === id);
        b.offTable = false;
        b.pocketed = false;
        const point = poolFreeSpot(s);
        Object.assign(b, point, { z: 0, vx: 0, vy: 0, vz: 0 });
      }
    const assigned = s.groups[shooter],
      ownPots = objectPots.filter((id) => !assigned || ballGroup(id) === assigned).length;
    s.players[shooter].potted += ownPots;
    if (reason) {
      s.players[shooter].fouls++;
      s.currentPlayer = other;
      s.ballInHand = true;
      s.phase = 'place-cue';
      event(s, 'foul', `${reason} ${s.players[other].name} has ball in hand.`);
    } else {
      s.currentPlayer = ownPots ? shooter : other;
      s.phase = 'aim';
      event(s, 'turn', `${s.players[s.currentPlayer].name} to shoot.`);
    }
    s.aiWait = 0.8;
  }
  s.shot = null;
  return record;
}
function tickPool(s, dt) {
  if (s.phase !== 'rolling') return;
  const shot = s.shot;
  shot.elapsed += dt;
  for (let sub = 0; sub < 2; sub++) {
    const step = dt / 2;
    for (const b of s.balls) {
      if (b.pocketed || b.offTable) continue;
      b.x += b.vx * step;
      b.y += b.vy * step;
      if (b.z > 0 || b.vz > 0) {
        b.z += b.vz * step;
        b.vz -= 9.81 * step;
        if (b.z <= 0) {
          b.z = 0;
          b.vz = b.vz < -0.2 ? -b.vz * 0.12 : 0;
        }
      }
      if (!b.z) {
        friction(b, step, POOL_FRICTION);
        if (b.id === 0 && b.spin) {
          const turn = b.spin * 0.065 * step;
          const vx = b.vx;
          b.vx -= b.vy * turn;
          b.vy += vx * turn;
          b.spin *= Math.exp(-step * 1.5);
        }
        if (s.table.cloth === 'rough') {
          const speed = Math.hypot(b.vx, b.vy);
          b.vx += Math.cos(b.x * 29 - b.y * 31) * speed * 0.006 * step;
          b.vy += Math.sin(b.x * 37 + b.y * 19) * speed * 0.009 * step;
        }
      }
      const pocket = b.z < 0.045 && s.table.pockets.find((p) => distance(b, p) < p.radius);
      if (pocket) {
        poolPocket(s, b, pocket);
        continue;
      }
      if (
        b.z > 0.055 &&
        (b.x < -b.radius ||
          b.y < -b.radius ||
          b.x > s.table.width + b.radius ||
          b.y > s.table.height + b.radius)
      ) {
        b.offTable = true;
        b.vx = b.vy = b.vz = b.z = 0;
        shot.offTable.push(b.id);
        if (b.id === 0) shot.scratch = true;
        continue;
      }
      if (b.z <= 0.055) {
        let rail = false;
        if (b.x < b.radius) {
          b.x = b.radius;
          b.vx = Math.abs(b.vx) * 0.82;
          rail = true;
        }
        if (b.x > s.table.width - b.radius) {
          b.x = s.table.width - b.radius;
          b.vx = -Math.abs(b.vx) * 0.82;
          rail = true;
        }
        if (b.y < b.radius) {
          b.y = b.radius;
          b.vy = Math.abs(b.vy) * 0.82;
          rail = true;
        }
        if (b.y > s.table.height - b.radius) {
          b.y = s.table.height - b.radius;
          b.vy = -Math.abs(b.vy) * 0.82;
          rail = true;
        }
        if (rail && shot.firstHit !== null) shot.railAfterContact = true;
      }
    }
    for (let pass = 0; pass < 3; pass++)
      for (let i = 0; i < s.balls.length; i++)
        for (let j = i + 1; j < s.balls.length; j++) {
          const a = s.balls[i],
            b = s.balls[j];
          if (
            a.pocketed ||
            b.pocketed ||
            a.offTable ||
            b.offTable ||
            Math.abs(a.z - b.z) > POOL_RADIUS * 1.5
          )
            continue;
          collideCircle(a, b, 1, 1, 0.94, () => {
            if (shot.firstHit === null && (a.id === 0 || b.id === 0))
              shot.firstHit = a.id === 0 ? b.id : a.id;
          });
        }
  }
  const moving = s.balls.some(
    (b) =>
      !b.pocketed &&
      !b.offTable &&
      (Math.hypot(b.vx, b.vy) > 0.007 || b.z > 0.001 || Math.abs(b.vz) > 0.02),
  );
  if (!moving || shot.elapsed > 20) {
    for (const b of s.balls) b.vx = b.vy = b.vz = b.z = 0;
    resolvePoolShot(s);
  }
}
function segmentDistance(point, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    denominator = dx * dx + dy * dy;
  const t = denominator
    ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator, 0, 1)
    : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}
function clearPoolPath(s, a, b, excluded) {
  return !s.balls.some(
    (ball) =>
      !ball.pocketed &&
      !ball.offTable &&
      !excluded.includes(ball.id) &&
      segmentDistance(ball, a, b) < POOL_RADIUS * 2.04,
  );
}
export function choosePoolAIShot(s, cuePoint = poolCue(s)) {
  const cue = cuePoint,
    legal = poolLegalTargets(s);
  if (s.breaking) {
    const head = s.balls.find((b) => b.id === 1);
    return {
      type: 'strike',
      angle: Math.atan2(head.y - cue.y, head.x - cue.x),
      power: 0.96,
      spin: 0,
      elevation: 0,
      target: 1,
      quality: 0,
      reason: 'break',
    };
  }
  let best = null;
  for (const target of legal)
    for (const pocket of s.table.pockets) {
      const length = distance(target, pocket),
        nx = (pocket.x - target.x) / length,
        ny = (pocket.y - target.y) / length;
      const ghost = { x: target.x - nx * POOL_RADIUS * 2, y: target.y - ny * POOL_RADIUS * 2 },
        cueDistance = distance(cue, ghost);
      if (
        !cueDistance ||
        ghost.x < POOL_RADIUS ||
        ghost.y < POOL_RADIUS ||
        ghost.x > s.table.width - POOL_RADIUS ||
        ghost.y > s.table.height - POOL_RADIUS
      )
        continue;
      const alignment = ((ghost.x - cue.x) * nx + (ghost.y - cue.y) * ny) / cueDistance;
      if (
        alignment < 0.26 ||
        !clearPoolPath(s, cue, ghost, [0, target.id]) ||
        !clearPoolPath(s, target, pocket, [0, target.id])
      )
        continue;
      const quality = alignment * 2.5 - length * 0.5 - cueDistance * 0.28;
      if (!best || quality > best.quality) {
        const desired = Math.sqrt(
          (2 * POOL_FRICTION * (length + 0.12)) / (alignment * alignment) +
            2 * POOL_FRICTION * cueDistance,
        );
        best = {
          type: 'strike',
          angle: Math.atan2(ghost.y - cue.y, ghost.x - cue.x),
          power: clamp((desired - 0.2) / 4.6, 0.13, 0.92),
          spin: 0,
          elevation: 0,
          calledPocket: target.id === 8 ? pocket.id : null,
          target: target.id,
          quality,
          reason: 'clear-pot',
        };
      }
    }
  if (!best) {
    const targets = [...legal].sort((a, b) => distance(a, cue) - distance(b, cue)),
      target = targets.find((b) => clearPoolPath(s, cue, b, [0, b.id])) || targets[0];
    if (!target)
      return {
        type: 'strike',
        angle: 0,
        power: 0.2,
        spin: 0,
        elevation: 0,
        target: null,
        quality: -10,
        reason: 'safety',
      };
    best = {
      type: 'strike',
      angle: Math.atan2(target.y - cue.y, target.x - cue.x),
      power: 0.35,
      spin: 0,
      elevation: 0,
      calledPocket: null,
      target: target.id,
      quality: -1,
      reason: 'safety',
    };
  }
  return best;
}
function poolAIPlacement(s) {
  const cue = poolCue(s),
    original = { x: cue.x, y: cue.y };
  let best = null;
  for (let col = 0; col < 9; col++)
    for (let row = 0; row < 5; row++) {
      const point = { x: 0.18 + col * 0.23, y: 0.16 + row * 0.19 };
      if (!canPlacePoolCue(s, point.x, point.y)) continue;
      const shot = choosePoolAIShot(s, point);
      if (!best || shot.quality > best.quality) best = { ...point, quality: shot.quality };
    }
  Object.assign(cue, original);
  return best || poolFreeSpot(s);
}

const STACKLIGHT_COLORS = Object.freeze([
  '#5fc6cf',
  '#e8816f',
  '#93b878',
  '#e8c56b',
  '#b398d1',
  '#dcdbbf',
]);
const ARCADE_OFFSETS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
export function arcadePieceCells(piece) {
  if (!piece) return [];
  const [dx, dy] = ARCADE_OFFSETS[((piece.rotation % 4) + 4) % 4];
  return [
    { x: piece.x, y: piece.y, color: piece.colors[0] },
    { x: piece.x + dx, y: piece.y + dy, color: piece.colors[1] },
  ];
}
function arcadeColorCount(level) {
  return level >= 15 ? 6 : level >= 10 ? 5 : level >= 5 ? 4 : 3;
}
function arcadePair(s) {
  const count = arcadeColorCount(s.level);
  return { colors: [Math.floor(random(s) * count), Math.floor(random(s) * count)] };
}
function newArcade(options) {
  const s = base('arcade', options);
  s.width = 6;
  s.height = 12;
  s.grid = Array.from({ length: s.height }, () => Array(s.width).fill(null));
  s.colors = [...STACKLIGHT_COLORS];
  s.score = 0;
  s.level = 1;
  s.current = null;
  s.next = [];
  s.pendingClear = [];
  s.chain = 0;
  s.clearTimer = 0;
  s.availableColors = 3;
  s.chargeProgress = 0;
  s.specialCharges = 0;
  s.freezeRemaining = 0;
  s.fallElapsed = 0;
  s.specialSelection = null;
  s.resumePiece = false;
  s.stats = {
    pairsPlaced: 0,
    blocksCleared: 0,
    squares: 0,
    specialsUsed: 0,
    maxChain: 0,
    maxLevel: 1,
  };
  s.phase = 'falling';
  for (let i = 0; i < 3; i++) s.next.push(arcadePair(s));
  arcadeSpawn(s);
  event(s, 'ready', 'Join four matching blocks. Squares charge four distinct special abilities.');
  return s;
}
function arcadeValid(s, piece) {
  return arcadePieceCells(piece).every(
    (c) =>
      c.x >= 0 &&
      c.x < s.width &&
      c.y < s.height &&
      c.y >= -2 &&
      (c.y < 0 || s.grid[c.y][c.x] === null),
  );
}
function arcadeSpawn(s) {
  s.current = { x: Math.floor(s.width / 2) - 1, y: 0, rotation: 0, colors: s.next.shift().colors };
  s.next.push(arcadePair(s));
  s.phase = 'falling';
  s.fallElapsed = 0;
  s.chain = 0;
  if (!arcadeValid(s, s.current)) arcadeLose(s);
}
function arcadeLose(s) {
  complete(s, null, 'The stack reached the entry gate.', {
    score: s.score,
    level: s.level,
    stats: copy(s.stats),
  });
  s.result.outcome = 'loss';
}
function arcadeAward(s, points) {
  s.score += points;
  s.level = 1 + Math.floor(s.score / 800);
  s.availableColors = arcadeColorCount(s.level);
  s.stats.maxLevel = Math.max(s.stats.maxLevel, s.level);
}
export function arcadeClusters(grid, ignored = []) {
  const height = grid.length,
    width = grid[0]?.length || 0,
    visited = new Set(ignored.map((c) => `${c.x},${c.y}`)),
    groups = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const key = `${x},${y}`,
        color = grid[y][x];
      if (color === null || visited.has(key)) continue;
      const queue = [{ x, y }],
        cells = [];
      visited.add(key);
      while (queue.length) {
        const cell = queue.pop();
        cells.push(cell);
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const nx = cell.x + dx,
            ny = cell.y + dy,
            next = `${nx},${ny}`;
          if (
            nx < 0 ||
            ny < 0 ||
            nx >= width ||
            ny >= height ||
            visited.has(next) ||
            grid[ny][nx] !== color
          )
            continue;
          visited.add(next);
          queue.push({ x: nx, y: ny });
        }
      }
      if (cells.length >= 4) groups.push({ color, cells });
    }
  return groups;
}
function arcadeSquares(s) {
  const result = [],
    used = new Set();
  for (let y = s.height - 2; y >= 0; y--)
    for (let x = 0; x < s.width - 1; x++) {
      const color = s.grid[y][x];
      if (color === null) continue;
      const cells = [
        { x, y },
        { x: x + 1, y },
        { x, y: y + 1 },
        { x: x + 1, y: y + 1 },
      ];
      if (cells.every((c) => s.grid[c.y][c.x] === color && !used.has(`${c.x},${c.y}`))) {
        result.push({ color, cells });
        cells.forEach((c) => used.add(`${c.x},${c.y}`));
      }
    }
  return result;
}
function arcadeGravity(s) {
  for (let x = 0; x < s.width; x++) {
    const values = [];
    for (let y = s.height - 1; y >= 0; y--) if (s.grid[y][x] !== null) values.push(s.grid[y][x]);
    for (let y = s.height - 1; y >= 0; y--) s.grid[y][x] = values[s.height - 1 - y] ?? null;
  }
}
function arcadeFindClear(s) {
  const squares = arcadeSquares(s),
    squareCells = squares.flatMap((g) => g.cells),
    groups = arcadeClusters(s.grid, squareCells),
    cells = [...squareCells, ...groups.flatMap((g) => g.cells)];
  if (!cells.length) return false;
  s.chain++;
  s.stats.maxChain = Math.max(s.stats.maxChain, s.chain);
  s.stats.squares += squares.length;
  s.chargeProgress += squares.length;
  while (s.chargeProgress >= 4) {
    s.chargeProgress -= 4;
    s.specialCharges = Math.min(3, s.specialCharges + 1);
  }
  s.pendingClear = cells;
  s.clearTimer = 0.28;
  s.phase = 'clearing';
  event(s, 'combination', `${cells.length} blocks, chain ${s.chain}.`, {
    cells: copy(cells),
    squares: squares.length,
  });
  return true;
}
function arcadeLock(s) {
  const cells = arcadePieceCells(s.current);
  if (cells.some((c) => c.y < 0)) {
    arcadeLose(s);
    return;
  }
  for (const c of cells) s.grid[c.y][c.x] = c.color;
  s.stats.pairsPlaced++;
  s.current = null;
  s.resumePiece = false;
  s.chain = 0;
  arcadeGravity(s);
  if (!arcadeFindClear(s)) arcadeSpawn(s);
}
function arcadeStep(s, score = false) {
  if (!s.current) return false;
  const next = { ...s.current, y: s.current.y + 1 };
  if (arcadeValid(s, next)) {
    s.current = next;
    if (score) arcadeAward(s, 1);
    return true;
  }
  arcadeLock(s);
  return false;
}
function arcadeRotate(s, direction = 1) {
  if (!s.current) return false;
  const rotation = (s.current.rotation + (direction < 0 ? -1 : 1) + 4) % 4;
  for (const [dx, dy] of [
    [0, 0],
    [-1, 0],
    [1, 0],
    [0, -1],
  ]) {
    const next = { ...s.current, rotation, x: s.current.x + dx, y: s.current.y + dy };
    if (arcadeValid(s, next)) {
      s.current = next;
      return true;
    }
  }
  return false;
}
function arcadeSpecial(s, special, color) {
  if (s.specialCharges <= 0 || s.phase !== 'falling') return false;
  if (special === 'color' && !Number.isInteger(color)) {
    s.specialSelection = 'color';
    event(s, 'select', 'Choose a color to remove.');
    return true;
  }
  if (special === 'freeze') {
    s.specialCharges--;
    s.stats.specialsUsed++;
    s.freezeRemaining = 8;
    event(s, 'special', 'Gravity held for eight seconds; manual drops remain available.');
    return true;
  }
  if (!['floor', 'columns', 'color'].includes(special)) return false;
  if (special === 'color' && (color < 0 || color >= s.colors.length)) return false;
  const cells = [];
  for (let y = 0; y < s.height; y++)
    for (let x = 0; x < s.width; x++) {
      if (s.grid[y][x] === null) continue;
      if (
        (special === 'floor' && y >= s.height - 4) ||
        (special === 'columns' && (x === s.width / 2 - 1 || x === s.width / 2)) ||
        (special === 'color' && s.grid[y][x] === color)
      )
        cells.push({ x, y });
    }
  if (!cells.length) return false;
  s.specialCharges--;
  s.stats.specialsUsed++;
  s.specialSelection = null;
  s.pendingClear = cells;
  s.clearTimer = 0.22;
  s.phase = 'clearing';
  s.resumePiece = !!s.current;
  s.chain = 1;
  event(s, 'special', `Special clears ${cells.length} blocks.`, { special, color });
  return true;
}
function tickArcade(s, dt, input) {
  s.freezeRemaining = Math.max(0, s.freezeRemaining - dt);
  if (s.phase === 'clearing') {
    s.clearTimer -= dt;
    if (s.clearTimer <= 0) {
      const amount = s.pendingClear.length;
      for (const cell of s.pendingClear) s.grid[cell.y][cell.x] = null;
      s.stats.blocksCleared += amount;
      arcadeAward(s, amount * 10 * Math.pow(2, Math.min(s.chain - 1, 6)));
      s.pendingClear = [];
      arcadeGravity(s);
      if (!arcadeFindClear(s)) {
        if (s.resumePiece && s.current) {
          s.phase = 'falling';
          s.resumePiece = false;
          s.fallElapsed = 0;
          s.chain = 0;
        } else arcadeSpawn(s);
      }
    }
  } else if (s.phase === 'falling' && (s.freezeRemaining <= 0 || input.softDrop)) {
    s.fallElapsed += dt;
    const interval = input.softDrop ? 0.065 : Math.max(0.09, 0.8 * Math.pow(0.89, s.level - 1));
    if (s.fallElapsed >= interval) {
      s.fallElapsed -= interval;
      arcadeStep(s, !!input.softDrop);
    }
  }
}

export function createMinigame(kind, options = {}) {
  kind = { stacklight: 'arcade', qub3d: 'arcade', '8ball': 'pool', 301: 'darts' }[kind] || kind;
  const create = { bowling: newBowling, darts: newDarts, pool: newPool, arcade: newArcade }[kind];
  if (!create) throw new RangeError(`Unknown minigame ${kind}.`);
  return create(options);
}
export function actMinigame(s, action = {}) {
  if (!s || !MINIGAME_KINDS.includes(s.kind) || !action || typeof action !== 'object') return false;
  if (action.type === 'pause') {
    s.paused = action.value === undefined ? true : !!action.value;
    return true;
  }
  if (action.type === 'resume') {
    s.paused = false;
    return true;
  }
  if (action.type === 'quit' && !s.finished) {
    complete(s, null, 'Session interrupted.');
    s.result.outcome = 'abandoned';
    s.status = 'abandoned';
    return true;
  }
  if (s.finished || s.paused) return false;
  if (s.kind !== 'arcade' && isMinigameAITurn(s)) return false;
  if (action.type === 'aim' && s.phase === 'aim') {
    for (const key of Object.keys(s.aim))
      if (action[key] !== undefined) {
        const value = number(action[key], s.aim[key]);
        if (key === 'steady') s.aim[key] = !!action[key];
        else if (key === 'calledPocket')
          s.aim[key] =
            Number.isInteger(action[key]) && action[key] >= 0 && action[key] < 6
              ? action[key]
              : null;
        else if (key === 'angle') s.aim[key] = Math.atan2(Math.sin(value), Math.cos(value));
        else
          s.aim[key] = clamp(
            value,
            ['power', 'elevation'].includes(key) ? 0 : ['x', 'y'].includes(key) ? -1.5 : -1,
            ['x', 'y'].includes(key) ? 1.5 : 1,
          );
      }
    return true;
  }
  if (s.kind === 'bowling') {
    if (action.type === 'roll' && s.phase === 'aim') {
      launchBowling(s, action);
      return true;
    }
    if (
      action.type === 'steer' &&
      s.phase === 'rolling' &&
      s.ball.y < s.lane.length / 2 &&
      !s.ball.gutter
    ) {
      s.ball.vx += clamp(number(action.direction), -1, 1) * 0.025;
      return true;
    }
  } else if (s.kind === 'darts') {
    if (action.type === 'throw' && s.phase === 'aim') {
      throwDart(s, action);
      return true;
    }
  } else if (s.kind === 'pool') {
    if (action.type === 'strike' && s.phase === 'aim' && !s.ballInHand) {
      launchPool(s, action);
      return true;
    }
    if (action.type === 'place-cue' && s.phase === 'place-cue')
      return placePoolCue(s, action.x, action.y);
  } else if (s.kind === 'arcade') {
    if (action.type === 'choose-color')
      return s.specialSelection === 'color' && arcadeSpecial(s, 'color', action.color);
    if (action.type === 'cancel-color') {
      s.specialSelection = null;
      return true;
    }
    if (action.type === 'special') return arcadeSpecial(s, action.special, action.color);
    if (s.phase !== 'falling') return false;
    if (['left', 'right'].includes(action.type)) {
      const next = { ...s.current, x: s.current.x + (action.type === 'left' ? -1 : 1) };
      if (!arcadeValid(s, next)) return false;
      s.current = next;
      return true;
    }
    if (action.type === 'rotate') return arcadeRotate(s, action.direction);
    if (action.type === 'soft-drop') {
      arcadeStep(s, true);
      return true;
    }
    if (action.type === 'drop') {
      let count = 0;
      while (
        s.current &&
        arcadeValid(s, { ...s.current, y: s.current.y + 1 }) &&
        count++ < s.height + 2
      ) {
        s.current.y++;
        arcadeAward(s, 2);
      }
      arcadeLock(s);
      return true;
    }
  }
  return false;
}
function tickAI(s, dt) {
  if (!isMinigameAITurn(s) || !['aim', 'place-cue'].includes(s.phase)) return;
  s.aiWait -= dt;
  if (s.aiWait > 0) return;
  if (s.kind === 'bowling') launchBowling(s, chooseBowlingAIShot(s));
  else if (s.kind === 'darts') throwDart(s, chooseDartsAITarget(s));
  else if (s.kind === 'pool') {
    if (s.ballInHand) {
      const point = poolAIPlacement(s);
      placePoolCue(s, point.x, point.y);
    } else {
      const shot = choosePoolAIShot(s);
      shot.angle += (random(s) - random(s)) * (1 - s.aiSkill) * 0.025;
      launchPool(s, shot);
    }
  }
}
export function updateMinigame(s, dt, input = {}) {
  if (!s || !MINIGAME_KINDS.includes(s.kind) || !Number.isFinite(dt) || dt < 0) return s;
  if (input.action) actMinigame(s, input.action);
  if (Array.isArray(input.actions)) for (const action of input.actions) actMinigame(s, action);
  for (const [key, action] of [
    ['left', 'left'],
    ['right', 'right'],
    ['rotate', 'rotate'],
    ['drop', 'drop'],
  ])
    if (input[key]) actMinigame(s, { type: action });
  if (s.finished || s.paused) return s;
  s.accumulator += dt;
  let steps = 0;
  while (s.accumulator + 1e-10 >= STEP && steps++ < 3600) {
    s.accumulator = Math.max(0, s.accumulator - STEP);
    s.time += STEP;
    tickAI(s, STEP);
    if (s.kind === 'bowling') tickBowling(s, STEP);
    else if (s.kind === 'darts' && s.flight) {
      s.flight.progress += STEP / s.flight.duration;
      if (s.flight.progress >= 1) recordDartHit(s, s.flight.x, s.flight.y);
    } else if (s.kind === 'pool') tickPool(s, STEP);
    else if (s.kind === 'arcade') tickArcade(s, STEP, input);
    if (s.finished) break;
  }
  return s;
}
