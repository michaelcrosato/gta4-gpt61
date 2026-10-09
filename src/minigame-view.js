import {
  createMinigame,
  updateMinigame,
  actMinigame,
  isMinigameAITurn,
  arcadePieceCells,
  dartsAimPosition,
  DART_RINGS,
} from './minigames.js';

const E = globalThis.My3D2dge;
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const TITLES = {
  bowling: 'Blue Hour Lanes',
  darts: 'The Lantern',
  pool: 'Saltworks Billiards',
  arcade: 'Night Owl Arcade',
};
const RULES = {
  bowling:
    'Ten frames. Strikes and spares earn bonus rolls. Aim at the pocket, manage your spin, and stay out of the gutter.',
  darts:
    'Start at 301. Three darts per turn. Reach exactly zero with a double. A bust restores your score at the start of the turn.',
  pool: 'Eight-ball. Clear your group, then pocket the eight. Scratches and illegal first contacts give your opponent the cue ball.',
  arcade:
    'STACKLIGHT. Match four or more connected colors. Squares charge special moves. New colors arrive as the stack gets faster.',
};

export function createMinigameView({ onClose, onSnapshot, onResult, audio } = {}) {
  const dialog = document.createElement('dialog');
  dialog.id = 'activity-dialog';
  dialog.className = 'game-dialog activity-dialog';
  dialog.innerHTML = `<div class="dialog-header"><p class="eyebrow" id="activity-eyebrow">HARBOR CITY / AFTER HOURS</p><button class="icon-button close-dialog" aria-label="Leave activity">×</button></div><h2 id="activity-title"></h2><div class="activity-score" id="activity-score"></div><canvas id="activity-board" width="640" height="380" tabindex="0" autofocus aria-label="Interactive activity board"></canvas><div class="activity-status" role="status" id="activity-status"></div><div id="activity-controls" class="activity-controls"></div><p class="activity-rules" id="activity-rules"></p><div id="activity-result" class="activity-result" hidden></div>`;
  document.getElementById('game-shell').append(dialog);
  const $ = (id) => dialog.querySelector(`#${id}`),
    canvas = $('activity-board'),
    g = canvas.getContext('2d');
  let session = null,
    lastFrame = 0,
    lastSnapshot = 0,
    lastUi = 0,
    resultSent = false,
    padAt = 0;
  let lastSoundEvent = 0;
  const aim = { x: 0, y: -0.606 },
    poolAim = { x: 1.6, y: 0.56 },
    keys = new Set();

  function range(id, label, value, min, max, step = 1) {
    return `<label class="activity-range" for="${id}"><span>${label}</span><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><output></output></label>`;
  }
  function value(id) {
    return Number($(id)?.value || 0);
  }
  function setOutput(id) {
    const input = $(id);
    if (input) input.nextElementSibling.textContent = `${Math.round(Number(input.value))}`;
  }
  function action(type, extras = {}) {
    if (!session || session.finished || isMinigameAITurn(session)) return false;
    let data = { type, ...extras };
    if (session.kind === 'bowling')
      data = {
        ...data,
        position: value('lane-position') / 100,
        direction: value('lane-aim') / 100,
        power: value('shot-power') / 100,
        spin: value('shot-spin') / 100,
      };
    if (session.kind === 'darts')
      data = { ...data, x: aim.x, y: aim.y, steady: !!$('dart-steady')?.checked };
    if (session.kind === 'pool') {
      const cue = session.balls.find((ball) => ball.number === 0);
      data = {
        ...data,
        angle: Math.atan2(poolAim.y - cue.y, poolAim.x - cue.x),
        power: value('shot-power') / 100,
        spin: value('shot-spin') / 100,
        elevation: value('cue-elevation') / 100,
      };
    }
    const accepted = actMinigame(session, data);
    if (accepted && (type !== 'aim' || performance.now() - lastSnapshot > 1000)) {
      onSnapshot?.(session);
      lastSnapshot = performance.now();
    }
    refresh();
    return accepted;
  }
  function controls() {
    let html = '';
    if (session.kind === 'bowling')
      html = `${range('lane-position', 'STANCE', Math.round(session.aim.position * 100), -100, 100)}${range('lane-aim', 'AIM', Math.round(session.aim.direction * 100), -100, 100)}${range('shot-power', 'POWER', Math.round(session.aim.power * 100), 20, 100)}${range('shot-spin', 'SPIN', Math.round(session.aim.spin * 100), -100, 100)}<button class="primary-button activity-launch" id="activity-launch">ROLL THE BALL <span>↗</span></button>`;
    if (session.kind === 'darts')
      html = `<p class="activity-hint">Move or touch the board to aim. Arrows adjust your aim. Hold steady to reduce sway.</p><label class="activity-check"><input id="dart-steady" type="checkbox"> HOLD STEADY</label><button class="primary-button activity-launch" id="activity-launch">THROW A DART <span>↗</span></button>`;
    if (session.kind === 'pool')
      html = `<p class="activity-hint">Select a point on the table to aim. With ball in hand, select an empty spot to place the cue ball.</p>${range('shot-power', 'POWER', Math.round(session.aim.power * 100), 5, 100)}${range('shot-spin', 'SPIN', Math.round(session.aim.spin * 100), -100, 100)}${range('cue-elevation', 'ELEVATION', Math.round(session.aim.elevation * 100), 0, 100)}<button class="primary-button activity-launch" id="activity-launch">PLAY YOUR SHOT <span>↗</span></button>`;
    if (session.kind === 'arcade')
      html = `<div class="arcade-buttons"><button data-action="left" aria-label="Move blocks left">←</button><button data-action="rotate" aria-label="Rotate blocks">↻</button><button data-action="right" aria-label="Move blocks right">→</button><button data-action="drop" aria-label="Drop blocks">DROP</button></div><div class="arcade-specials"><button data-special="floor">CLEAR FLOOR</button><button data-special="columns">CLEAR COLUMNS</button><button data-special="color">CLEAR COLOR</button><button data-special="freeze">FREEZE</button></div>`;
    $('activity-controls').innerHTML = html;
    dialog.querySelectorAll('.activity-range input').forEach((input) => {
      setOutput(input.id);
      input.addEventListener('input', () => {
        setOutput(input.id);
        action('aim');
      });
    });
    $('dart-steady')?.addEventListener('change', () => action('aim'));
    $('activity-launch')?.addEventListener('click', () =>
      action(session.kind === 'bowling' ? 'roll' : session.kind === 'darts' ? 'throw' : 'strike'),
    );
    dialog
      .querySelectorAll('[data-action]')
      .forEach((button) => button.addEventListener('click', () => action(button.dataset.action)));
    dialog.querySelectorAll('[data-special]').forEach((button) =>
      button.addEventListener('click', () =>
        action('special', {
          special: button.dataset.special,
          color: session.current?.colors[0] || 0,
        }),
      ),
    );
  }
  function refresh() {
    if (!session) return;
    const ai = isMinigameAITurn(session);
    $('activity-title').textContent = TITLES[session.kind];
    $('activity-rules').textContent = RULES[session.kind];
    $('activity-status').textContent = session.finished
      ? session.result.reason
      : session.message ||
        (ai ? `${session.players[session.currentPlayer].name}'s turn.` : 'Your turn.');
    if (session.kind === 'bowling') {
      $('activity-score').innerHTML =
        `<div class="bowling-scorecard"><div class="scorecard-heading"><b>PLAYER</b>${Array.from({ length: 10 }, (_, i) => `<span>${i + 1}</span>`).join('')}<b>TOTAL</b></div>${session.players.map((player, index) => `<div class="scorecard-player ${index === session.currentPlayer ? 'active' : ''}"><b>${escape(player.name)}</b>${player.frames.map((frame) => `<span><small>${frame.strike ? 'X' : frame.spare ? `${frame.rolls[0]} /` : frame.rolls.join(' ')}</small><strong>${frame.cumulative ?? '—'}</strong></span>`).join('')}<b>${player.score}</b></div>`).join('')}</div>`;
    } else if (session.kind === 'darts')
      $('activity-score').innerHTML = session.players
        .map(
          (player, index) =>
            `<div class="activity-player ${index === session.currentPlayer ? 'active' : ''}"><span>${escape(player.name)}</span><b>${player.remaining}</b><small>${index === session.currentPlayer ? `${3 - session.throwsInTurn} DARTS LEFT` : 'WAITING'}</small></div>`,
        )
        .join('');
    else if (session.kind === 'pool')
      $('activity-score').innerHTML = session.players
        .map(
          (player, index) =>
            `<div class="activity-player ${index === session.currentPlayer ? 'active' : ''}"><span>${escape(player.name)}</span><b>${session.groups[index]?.toUpperCase() || 'OPEN TABLE'}</b><small>${session.ballInHand && index === session.currentPlayer ? 'BALL IN HAND' : 'EIGHT-BALL'}</small></div>`,
        )
        .join('');
    else
      $('activity-score').innerHTML =
        `<div class="activity-player active"><span>SCORE</span><b>${session.score.toLocaleString()}</b></div><div class="activity-player"><span>LEVEL</span><b>${session.level}</b></div><div class="activity-player"><span>SPECIALS</span><b>${session.specialCharges}</b></div>`;
    const ready =
      session.kind === 'arcade' || session.phase === 'aim' || session.phase === 'place-cue';
    $('activity-launch')?.toggleAttribute(
      'disabled',
      ai || !ready || session.finished || session.phase === 'place-cue',
    );
    for (const button of dialog.querySelectorAll('[data-special]'))
      button.disabled = session.specialCharges <= 0 || session.finished;
    const showResult = session.finished && $('activity-result').hidden;
    $('activity-result').hidden = !session.finished;
    if (showResult) {
      $('activity-result').innerHTML =
        `<b>${session.result.outcome === 'win' ? 'A NIGHT TO REMEMBER.' : session.result.outcome === 'loss' ? 'THE HOUSE HAS ITS DAY.' : 'GOOD GAME.'}</b><p>${escape(session.result.reason)}</p><button id="activity-done" class="primary-button">BACK TO THE CITY <span>↗</span></button>`;
      $('activity-done').addEventListener('click', () => dialog.close());
    }
    if (session.finished && !resultSent) {
      resultSent = true;
      onResult?.(session.result, session);
    }
  }
  function text(text, x, y, color = '#d7dbbe', size = 1) {
    E.font.text(g, String(text), x, y, color, { scale: size, outline: false });
  }
  function disc(x, y, r, color) {
    E.px.disc(g, x, y, r, color);
  }
  function polygon(points, color) {
    E.px.poly(g, points, color);
  }

  function bowling() {
    E.px.rect(g, 0, 0, 640, 380, '#1b3028');
    const project = (x, y) => {
      const depth = E.clamp(y / session.lane.length, 0, 1),
        half = 105 - depth * 69;
      return [320 + (x / session.lane.width) * half * 2, 346 - depth * 280];
    };
    polygon(
      [
        [207, 355],
        [433, 355],
        [359, 60],
        [281, 60],
      ],
      '#a58e61',
    );
    polygon(
      [
        [192, 355],
        [207, 355],
        [281, 60],
        [273, 60],
      ],
      '#304f3e',
    );
    polygon(
      [
        [433, 355],
        [448, 355],
        [367, 60],
        [359, 60],
      ],
      '#304f3e',
    );
    for (let x = -0.5; x < 0.51; x += 0.13)
      E.px.line(g, ...project(x, 0), ...project(x, session.lane.length), '#c0a271');
    for (let x = -0.4; x <= 0.4; x += 0.13) {
      const q = project(x, 4);
      polygon(
        [
          [q[0] - 2, q[1] + 3],
          [q[0], q[1] - 4],
          [q[0] + 2, q[1] + 3],
        ],
        '#6b674d',
      );
    }
    for (const pin of session.pins) {
      const q = project(pin.x, pin.y),
        scale = 1 - E.clamp(pin.y / session.lane.length, 0, 1) * 0.5;
      if (pin.standing) {
        E.px.ell(g, q[0], q[1], 4 * scale, 6 * scale, '#e7e6ce');
        E.px.rect(g, q[0] - 1, q[1] - 9 * scale, 2, 6 * scale, '#e7e6ce');
        E.px.rect(g, q[0] - 1, q[1] - 7 * scale, 2, 1, '#b57760');
      } else {
        E.px.line(g, q[0] - 4, q[1], q[0] + 4, q[1] - 2, '#c5c8ac', 2);
      }
    }
    if (session.ball?.active) {
      const q = project(session.ball.x, session.ball.y),
        r = 8 * (1 - E.clamp(session.ball.y / session.lane.length, 0, 1) * 0.55);
      disc(...q, r, '#4d6371');
      disc(q[0] - r * 0.3, q[1] - r * 0.3, r * 0.23, '#829bab');
    }
    if (session.phase === 'aim' && !isMinigameAITurn(session)) {
      const x = (value('lane-position') / 100) * 0.37,
        start = project(x, 0),
        end = project(
          x + Math.tan((value('lane-aim') / 100) * 0.12) * session.lane.length,
          session.lane.length,
        );
      E.px.line(g, ...start, ...end, '#e1c47e');
      disc(...start, 8, '#465d6d');
    }
    text('BLUE HOUR / LANES', 18, 19, '#b1bda5');
    text(`FRAME ${Math.min(10, session.frameIndex + 1)} / 10`, 18, 35, '#e7c875');
  }
  function darts() {
    E.px.rect(g, 0, 0, 640, 380, '#1d342b');
    const cx = 320,
      cy = 187,
      radius = 143;
    disc(cx, cy, radius + 17, '#101f1a');
    for (let i = 0; i < 20; i++) {
      const middle = -Math.PI / 2 + (i * Math.PI) / 10,
        a0 = middle - Math.PI / 20,
        a1 = middle + Math.PI / 20;
      const wedge = (r0, r1, color) => {
        const points = [];
        for (let k = 0; k <= 5; k++) {
          const a = a0 + ((a1 - a0) * k) / 5;
          points.push([cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]);
        }
        for (let k = 5; k >= 0; k--) {
          const a = a0 + ((a1 - a0) * k) / 5;
          points.push([cx + Math.cos(a) * r0, cy + Math.sin(a) * r0]);
        }
        polygon(points, color);
      };
      wedge(0, radius, i % 2 ? '#d0c5a0' : '#344739');
      wedge(radius * DART_RINGS.doubleInner, radius, i % 2 ? '#b57a5d' : '#668977');
      wedge(
        radius * DART_RINGS.tripleInner,
        radius * DART_RINGS.tripleOuter,
        i % 2 ? '#b57a5d' : '#668977',
      );
      const q = [cx + Math.cos(middle) * (radius + 12), cy + Math.sin(middle) * (radius + 12)];
      E.font.text(g, String(session.board.sectorNumbers[i]), q[0], q[1] - 3, '#e2ddc0', {
        align: 'center',
        outline: false,
      });
    }
    disc(cx, cy, radius * DART_RINGS.outerBull, '#658b76');
    disc(cx, cy, radius * DART_RINGS.innerBull, '#bd8463');
    for (const dart of session.darts) {
      const x = cx + dart.x * radius,
        y = cy + dart.y * radius;
      E.px.line(g, x, y, x + 5, y - 10, '#e1cba0');
      polygon(
        [
          [x + 2, y - 7],
          [x + 6, y - 13],
          [x + 10, y - 7],
        ],
        '#c49572',
      );
    }
    if (session.phase === 'aim' && !isMinigameAITurn(session)) {
      const position = dartsAimPosition(session);
      const x = cx + position.x * radius,
        y = cy + position.y * radius;
      E.px.line(g, x - 5, y, x + 5, y, '#e5d998');
      E.px.line(g, x, y - 5, x, y + 5, '#e5d998');
    }
    text('THE LANTERN / 301', 18, 18, '#c0c6ad');
    text(`TURN ${session.currentPlayer === 0 ? 'MARA' : 'HOUSE'}`, 18, 35, '#e7c875');
  }
  const POOL_COLORS = [
    '#e5e6d6',
    '#d4b962',
    '#5f8aaf',
    '#b26b62',
    '#8f79a6',
    '#ce9770',
    '#7b9b76',
    '#8a6c5c',
    '#222f25',
  ];
  function pool() {
    E.px.rect(g, 0, 0, 640, 380, '#213629');
    const x0 = 45,
      y0 = 58,
      width = 550,
      height = 275;
    E.px.rect(g, x0 - 17, y0 - 17, width + 34, height + 34, '#85704f');
    E.px.rect(g, x0 - 8, y0 - 8, width + 16, height + 16, '#425d42');
    E.px.rect(g, x0, y0, width, height, '#52775b');
    const point = (x, y) => [
      x0 + (x / session.table.width) * width,
      y0 + (y / session.table.height) * height,
    ];
    for (const pocket of session.table.pockets) {
      const q = point(pocket.x, pocket.y);
      disc(...q, 10, '#162a1f');
    }
    for (const ball of session.balls) {
      if (ball.pocketed || ball.offTable) continue;
      const q = point(ball.x, ball.y),
        radius = (ball.radius / session.table.width) * width;
      disc(q[0] + 2, q[1] + 2, radius + 1, '#314d37');
      const color = POOL_COLORS[ball.number % 8 || 8];
      disc(
        q[0],
        q[1] - ball.z * 90,
        radius,
        ball.group === 'cue' ? '#e5e6d6' : ball.group === 'stripe' ? '#dddcc9' : color,
      );
      if (ball.group === 'stripe')
        E.px.rect(g, q[0] - radius, q[1] - ball.z * 90 - 2, radius * 2, 4, color);
      if (ball.number) disc(q[0], q[1] - ball.z * 90, radius * 0.65, '#dfdfc7');
      if (ball.number)
        E.font.text(g, String(ball.number), q[0], q[1] - ball.z * 90 - 2, '#172c20', {
          align: 'center',
          outline: false,
        });
    }
    const cue = session.balls.find((ball) => ball.number === 0);
    if (cue && !cue.pocketed && !isMinigameAITurn(session) && session.phase === 'aim') {
      const q = point(cue.x, cue.y),
        target = point(poolAim.x, poolAim.y),
        angle = Math.atan2(target[1] - q[1], target[0] - q[0]);
      E.px.line(g, ...q, ...target, '#c4cd91');
      E.px.line(
        g,
        q[0] - Math.cos(angle) * 15,
        q[1] - Math.sin(angle) * 15,
        q[0] - Math.cos(angle) * 78,
        q[1] - Math.sin(angle) * 78,
        '#c9ac6f',
        3,
      );
    }
    text('SALTWORKS / EIGHT-BALL', 19, 15, '#c3cbb0');
  }
  function arcade() {
    E.px.rect(g, 0, 0, 640, 380, '#152a26');
    const cell = 25,
      x0 = 230,
      y0 = 37;
    E.px.rect(g, x0 - 6, y0 - 6, session.width * cell + 12, session.height * cell + 12, '#849077');
    E.px.rect(g, x0, y0, session.width * cell, session.height * cell, '#203b34');
    const cube = (x, y, index, ghost = false) => {
      if (y < 0) return;
      const px = x0 + x * cell,
        py = y0 + y * cell,
        color = session.colors[index];
      g.globalAlpha = ghost ? 0.3 : 1;
      E.px.rect(g, px + 1, py + 1, cell - 2, cell - 2, color);
      polygon(
        [
          [px + 1, py + 1],
          [px + cell - 1, py + 1],
          [px + cell - 5, py + 5],
          [px + 5, py + 5],
        ],
        E.shade(color, 0.24),
      );
      polygon(
        [
          [px + cell - 1, py + 1],
          [px + cell - 1, py + cell - 1],
          [px + cell - 5, py + cell - 5],
          [px + cell - 5, py + 5],
        ],
        E.shade(color, -0.22),
      );
      g.globalAlpha = 1;
    };
    for (let y = 0; y < session.height; y++)
      for (let x = 0; x < session.width; x++)
        if (session.grid[y][x] !== null) cube(x, y, session.grid[y][x]);
    for (const tile of arcadePieceCells(session.current))
      cube(tile.x, Math.floor(tile.y), tile.color);
    text('STACKLIGHT', 21, 30, '#e7c875', 2);
    text('NEXT', 438, 60, '#c6ceaf');
    session.next.slice(0, 3).forEach((pair, i) => {
      pair.colors.forEach((color, j) => {
        E.px.rect(g, 442 + j * 23, 83 + i * 38, 20, 20, session.colors[color]);
      });
    });
    text(`LEVEL ${session.level}`, 438, 226, '#c6ceaf');
    text(`CHARGES ${session.specialCharges}`, 438, 247, '#e7c875');
    text('4+ COLORS', 21, 81, '#bbc9b0');
    text('BUILD SQUARES', 21, 101, '#bbc9b0');
    text('CHARGE POWER', 21, 121, '#bbc9b0');
  }
  function draw() {
    if (!session) return;
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g._c = null;
    ({ bowling, darts, pool, arcade })[session.kind]();
  }
  function pointer(event) {
    if (!session || isMinigameAITurn(session)) return;
    const rect = canvas.getBoundingClientRect(),
      x = ((event.clientX - rect.left) * canvas.width) / rect.width,
      y = ((event.clientY - rect.top) * canvas.height) / rect.height;
    if (session.kind === 'darts') {
      aim.x = E.clamp((x - 320) / 143, -1.3, 1.3);
      aim.y = E.clamp((y - 187) / 143, -1.3, 1.3);
      action('aim');
    }
    if (session.kind === 'pool') {
      poolAim.x = E.clamp(((x - 45) / 550) * session.table.width, 0, session.table.width);
      poolAim.y = E.clamp(((y - 58) / 275) * session.table.height, 0, session.table.height);
      if (event.type === 'pointerdown' && session.phase === 'place-cue')
        actMinigame(session, { type: 'place-cue', x: poolAim.x, y: poolAim.y });
      else action('aim');
    }
    if (event.type === 'pointerdown') canvas.focus({ preventScroll: true });
  }
  canvas.addEventListener('pointermove', pointer);
  canvas.addEventListener('pointerdown', pointer);
  dialog.addEventListener('keydown', (event) => {
    if (!session || isMinigameAITurn(session) || event.target.matches('input,select,button'))
      return;
    if (event.repeat && (event.key === ' ' || event.key === 'Enter')) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(event.key))
      event.preventDefault();
    if (session.kind === 'arcade') {
      const map = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'rotate',
        ArrowDown: 'soft-drop',
        ' ': 'drop',
        Enter: 'drop',
      };
      if (map[event.key]) action(map[event.key]);
    } else if (event.key === ' ' || event.key === 'Enter')
      action(session.kind === 'bowling' ? 'roll' : session.kind === 'darts' ? 'throw' : 'strike');
    else if (session.kind === 'darts') {
      const offsets = {
        ArrowLeft: [-0.025, 0],
        ArrowRight: [0.025, 0],
        ArrowUp: [0, -0.025],
        ArrowDown: [0, 0.025],
      };
      if (offsets[event.key]) {
        aim.x = E.clamp(aim.x + offsets[event.key][0], -1.3, 1.3);
        aim.y = E.clamp(aim.y + offsets[event.key][1], -1.3, 1.3);
        action('aim');
      }
    } else if (
      session.kind === 'bowling' &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      const input = $('lane-aim');
      input.value = E.clamp(Number(input.value) + (event.key === 'ArrowRight' ? 2 : -2), -100, 100);
      setOutput('lane-aim');
      action('aim');
    } else if (session.kind === 'pool' && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      const cue = session.balls.find((ball) => ball.number === 0),
        a =
          Math.atan2(poolAim.y - cue.y, poolAim.x - cue.x) +
          (event.key === 'ArrowRight' ? 0.025 : -0.025);
      poolAim.x = cue.x + Math.cos(a) * 2;
      poolAim.y = cue.y + Math.sin(a) * 2;
      action('aim');
    }
  });
  dialog.addEventListener('close', () => {
    if (session && !session.finished) actMinigame(session, { type: 'quit' });
    const completed = session;
    session = null;
    keys.clear();
    onClose?.(completed);
  });
  return {
    dialog,
    get state() {
      return session;
    },
    open(kind, { restored, seed = 61, entryFee = 0 } = {}) {
      session =
        restored ||
        createMinigame(kind, {
          seed,
          players: kind === 'arcade' ? ['Mara'] : ['Mara', 'The House'],
          aiPlayers: kind === 'arcade' ? [] : [1],
          frameCount: 10,
          difficulty: 0.72,
        });
      $('activity-eyebrow').textContent =
        `HARBOR CITY / AFTER HOURS · ${entryFee ? '$' + entryFee + ' ENTRY' : 'FREE ENTRY'}`;
      lastFrame = performance.now();
      lastSnapshot = lastUi = 0;
      resultSent = false;
      lastSoundEvent = session.eventSequence || 0;
      $('activity-result').hidden = true;
      if (kind === 'darts') Object.assign(aim, session.aim);
      if (kind === 'pool') {
        const cue = session.balls.find((ball) => ball.number === 0);
        poolAim.x = cue.x + Math.cos(session.aim.angle) * 2;
        poolAim.y = cue.y + Math.sin(session.aim.angle) * 2;
      }
      controls();
      refresh();
      draw();
      onSnapshot?.(session);
      return dialog;
    },
    tick() {
      if (!session || !dialog.open) return;
      const now = performance.now(),
        dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
      lastFrame = now;
      updateMinigame(session, dt, {});
      for (const event of session.events) {
        if (event.id <= lastSoundEvent) continue;
        if (event.kind === 'release')
          audio?.sfx({ wave: 'noise', freq: 80, to: 35, dur: 0.2, vol: 0.08 });
        else if (event.kind === 'roll') audio?.sfx('bump', { vol: 0.18, pitch: 1.2 });
        else if (event.kind === 'dart' || event.kind === 'bust')
          audio?.sfx('step', { vol: 0.14, pitch: event.kind === 'bust' ? 0.6 : 1.4 });
        else if (event.kind === 'strike') audio?.sfx('bump', { vol: 0.1, pitch: 1.4 });
        else if (event.kind === 'pocket') audio?.sfx('coin', { vol: 0.1, pitch: 0.7 });
        else if (event.kind === 'combination' || event.kind === 'special')
          audio?.sfx('powerup', { vol: 0.15, pitch: 0.85 });
        else if (event.kind === 'complete')
          audio?.sfx(event.data.outcome === 'loss' ? 'die' : 'confirm', { vol: 0.2 });
        lastSoundEvent = event.id;
      }
      draw();
      if (now - lastUi > 140) {
        refresh();
        lastUi = now;
      }
      if (now - lastSnapshot > 5000) {
        onSnapshot?.(session);
        lastSnapshot = now;
      }
    },
    pause() {
      if (session) {
        actMinigame(session, { type: 'pause' });
        onSnapshot?.(session);
      }
    },
    resume() {
      if (session) {
        actMinigame(session, { type: 'resume' });
        lastFrame = performance.now();
      }
    },
    handleGamepad(pad, pressed) {
      if (!session || document.activeElement !== canvas || isMinigameAITurn(session)) return false;
      const now = performance.now(),
        x =
          pad.buttons[15]?.pressed || pad.axes[0] > 0.45
            ? 1
            : pad.buttons[14]?.pressed || pad.axes[0] < -0.45
              ? -1
              : 0,
        y =
          pad.buttons[13]?.pressed || pad.axes[1] > 0.45
            ? 1
            : pad.buttons[12]?.pressed || pad.axes[1] < -0.45
              ? -1
              : 0;
      if ((x || y) && now - padAt > 100) {
        const key = x ? (x > 0 ? 'ArrowRight' : 'ArrowLeft') : y > 0 ? 'ArrowDown' : 'ArrowUp';
        canvas.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        padAt = now;
      }
      if (pressed(0))
        canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      if (pressed(1)) dialog.close();
      return true;
    },
  };
}
