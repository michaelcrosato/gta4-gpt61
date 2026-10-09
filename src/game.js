import {
  createSimulation,
  updateSimulation,
  interact,
  saveGame,
  restoreGame,
  nearestInteractable,
  currentVehicle,
  selectWeapon,
  buyWeapon,
  buyAmmo,
  jumpOrVault,
  toggleCover,
  WORLD,
  MISSIONS,
  WEAPONS,
  VEHICLE_SPECS,
} from './simulation.js';
import { createWorldRenderer } from './renderer.js';
import { findRoute, snapToRoad } from './navigation.js';
import { weaponSound } from './weapon-art.js';
import { createMinigameView } from './minigame-view.js';
import { restoreActivity } from './activity-save.js';

const E = globalThis.My3D2dge;
const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'lowlight.save.v1',
  SETTINGS_KEY = 'lowlight.settings.v1';
let state = createSimulation(61),
  mode = 'title',
  lastHud = 0,
  lastSave = 0,
  lastHealth = 100;
let saved = null;
const settings = {
  volume: 0.4,
  rain: true,
  reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  camera: 'city',
};
try {
  Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
  saved = localStorage.getItem(SAVE_KEY);
} catch {
  /* Storage can be unavailable in private browsers; playing still works. */
}
const game = new E.Game({
  canvas: 'screen',
  view: new E.View('city', 'City', 35, 48, 1.1, 1),
  minW: 480,
  minH: 300,
  maxW: 1000,
  maxH: 670,
  portrait: { minW: 240, minH: 420, maxW: 480, maxH: 860 },
  bg: '#233d34',
  input: {
    up: ['KeyW', 'ArrowUp', 'Pad12', 'PadAxisUp'],
    down: ['KeyS', 'ArrowDown', 'Pad13', 'PadAxisDown'],
    left: ['KeyA', 'ArrowLeft', 'Pad14', 'PadAxisLeft'],
    right: ['KeyD', 'ArrowRight', 'Pad15', 'PadAxisRight'],
    fire: ['Space', 'Mouse0', 'Pad7', 'Act:fire'],
    interact: ['KeyE', 'Pad0', 'Act:interact'],
    sprint: ['ShiftLeft', 'ShiftRight', 'Pad6', 'Act:sprint'],
    reload: ['KeyR', 'Pad2', 'Act:reload'],
    pause: ['Escape', 'KeyP', 'Pad9'],
    map: ['KeyM', 'Pad8'],
    phone: ['KeyT'],
    camera: ['KeyV'],
    weapon: ['KeyQ', 'Pad5'],
    aim: ['Mouse2', 'Pad4', 'Act:aim'],
    crouch: ['ControlLeft', 'ControlRight', 'Pad10', 'Act:crouch'],
    cover: ['KeyC', 'Pad1', 'Act:cover'],
    jump: ['KeyJ', 'Pad3', 'Act:jump'],
    dodge: ['KeyX', 'Act:dodge'],
    counter: ['KeyF', 'Act:counter'],
    disarm: ['KeyZ', 'Act:disarm'],
    heavy: ['AltLeft', 'Act:heavy'],
    surrender: ['KeyG', 'Act:surrender'],
    start: ['Enter'],
    confirm: ['Enter', 'Pad0'],
    cancel: ['Escape', 'Pad1'],
  },
});
game.input.touchEnabled = false;
game.pauseOverlay = false;
game.reduceMotion = settings.reduceMotion;
game.audio.setVolume(settings.volume);
game.cam.smooth = 0.18;
const renderer = createWorldRenderer(game, WORLD, VEHICLE_SPECS);
const dialogs = [$('pause-dialog'), $('info-dialog'), $('map-dialog')];
const touch = { x: 0, y: 0, id: null };
const noticeHistory = new Set();
let mapCursor = null;
let lastAttackSerial = 0;
const combatEffectsSeen = new Set();
const touchCombat = { crouch: false, aim: false, block: false };
const activityUI = createMinigameView({
  audio: game.audio,
  onSnapshot(session) {
    if (state.activitySession?.session === session) storeProgress();
  },
  onResult(result, session) {
    recordActivity(result, session);
  },
  onClose(session) {
    if (state.activitySession?.session === session) {
      recordActivity(session.result, session);
      state.activitySession = null;
      storeProgress();
    }
    refreshPaused();
  },
});
dialogs.push(activityUI.dialog);

function recordActivity(result, session) {
  const active = state.activitySession;
  if (!result || !active || active.session !== session || active.recorded) return;
  active.recorded = true;
  state.progress.activityResults ||= [];
  const score =
    session.kind === 'arcade'
      ? session.score
      : session.kind === 'bowling'
        ? session.players[0].score
        : session.kind === 'darts'
          ? session.startingScore - session.players[0].remaining
          : session.players[0].shots;
  state.progress.activityResults.push({
    id: active.id,
    kind: session.kind,
    outcome: result.outcome,
    score,
    winner: result.winner,
    time: state.time,
  });
  state.progress.activityResults = state.progress.activityResults.slice(-150);
  if (session.kind === 'arcade')
    state.progress.arcadeBest = Math.max(state.progress.arcadeBest || 0, score);
  if (session.kind === 'pool' && result.outcome === 'win' && result.winner === 0) {
    state.player.money += 40;
    state.progress.cashEarned += 40;
    announce('You took the table. Pool winnings: $40.');
  }
  updateHud();
  storeProgress();
}
function openActivity(kind, restored = null) {
  if (
    !restored &&
    (state.mission || state.taxiJob || state.wanted.level || state.player.vehicleId)
  ) {
    announce('Finish your job, lose police attention, and come inside on foot first.');
    return;
  }
  const fee = kind === 'pool' ? 20 : kind === 'bowling' ? 10 : kind === 'arcade' ? 2 : 0;
  if (!restored && state.player.money < fee) {
    announce(`You need $${fee} for this activity.`, true);
    return;
  }
  closeAllDialogs();
  if (!restored) state.player.money -= fee;
  updateHud();
  state.progress.activitySerial = (state.progress.activitySerial || 0) + (restored ? 0 : 1);
  const savedSession = restored ? restoreActivity(restored.session) : null;
  if (savedSession && savedSession.kind !== kind)
    throw new Error('The saved activity does not match its venue.');
  activityUI.open(kind, {
    restored: savedSession,
    seed: 61 + state.progress.activitySerial,
    entryFee: fee,
  });
  state.activitySession = restored
    ? { ...restored, session: activityUI.state }
    : {
        id: `activity-${state.progress.activitySerial}`,
        kind,
        session: activityUI.state,
        fee,
        recorded: false,
      };
  activityUI.resume();
  openDialog(activityUI.dialog);
  storeProgress();
}

function escapeHTML(text) {
  return String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}
function announce(text, error = false) {
  const item = document.createElement('div');
  item.className = `toast${error ? ' error' : ''}`;
  item.textContent = text;
  $('notifications').append(item);
  setTimeout(() => item.remove(), 5000);
}
function storeProgress(manual = false) {
  try {
    localStorage.setItem(SAVE_KEY, saveGame(state));
    saved = localStorage.getItem(SAVE_KEY);
    if (manual) announce('Progress saved. The city will be waiting.');
  } catch {
    if (manual)
      announce('This browser could not save progress. Check available local storage.', true);
  }
  lastSave = state.time;
}
function closeDialog(dialog) {
  if (dialog.open) dialog.close();
  refreshPaused();
}
function closeAllDialogs() {
  for (const dialog of dialogs) if (dialog.open) dialog.close();
  refreshPaused();
}
function refreshPaused() {
  const wasPaused = game.paused;
  game.paused = mode === 'play' && dialogs.some((d) => d.open);
  if (wasPaused && !game.paused) {
    game.input.clear();
    $('screen').focus({ preventScroll: true });
  }
}
for (const dialog of dialogs) {
  dialog.addEventListener('close', refreshPaused);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeDialog(dialog);
  });
  dialog.querySelector('.close-dialog').addEventListener('click', () => closeDialog(dialog));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        closeDialog(dialog);
    }
  });
}
function openDialog(dialog) {
  closeAllDialogs();
  dialog.showModal();
  refreshPaused();
  try {
    padPrevious = (
      Array.from(navigator.getGamepads?.() || []).find((p) => p && p.connected !== false)
        ?.buttons || []
    ).map((button) => button.pressed);
  } catch {
    /* optional controllers */
  }
}
document.addEventListener('keydown', (event) => {
  const open = dialogs.find((dialog) => dialog.open);
  if (open && event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeDialog(open);
    return;
  }
  const interactive = event.target?.closest?.('button,a,input,select');
  if (open || (interactive && interactive.getClientRects().length)) event.stopPropagation();
});
function pause() {
  if (mode === 'play') openDialog($('pause-dialog'));
}
function info(title, content, eyebrow = 'LOWLIGHT / FIELD NOTES') {
  $('info-title').textContent = title;
  $('info-content').innerHTML = content;
  $('info-eyebrow').textContent = eyebrow;
  openDialog($('info-dialog'));
}
function start(continuing = false) {
  closeAllDialogs();
  if (continuing && saved) {
    try {
      state = restoreGame(saved);
    } catch (error) {
      info(
        'A damaged save.',
        `<p>${escapeHTML(error.message)}</p><p>Your existing save has been kept. You can begin a new story from the menu.</p>`,
      );
      return;
    }
  } else state = createSimulation(61);
  mode = 'play';
  document.body.dataset.mode = mode;
  $('title-screen').hidden = true;
  $('game-hud').hidden = false;
  $('screen').focus({ preventScroll: true });
  game.paused = false;
  game.cam.snap = true;
  game.focus(state.player.x, state.player.y, 0);
  game.cam.offset = matchMedia('(pointer: coarse)').matches ? [0, -25] : [0, 10];
  game.input.clear();
  lastHud = state.time - 1;
  lastSave = state.time;
  lastHealth = state.player.health;
  lastAttackSerial = state.player.attackSerial || 0;
  combatEffectsSeen.clear();
  touchCombat.crouch = touchCombat.aim = touchCombat.block = false;
  noticeHistory.clear();
  if (continuing) for (const notice of state.notifications) noticeHistory.add(notice.id);
  $('notifications').replaceChildren();
  game.audio.music({
    bpm: 76,
    tracks: [
      { wave: 'sine', vol: 0.1, notes: 'D3 - - - A2 - - - C3 - - - G2 - - -' },
      { wave: 'triangle', vol: 0.07, notes: 'D4 - F4 - A4 - E4 - C4 - E4 - G4 - D4 -' },
    ],
  });
  updateHud();
  if (continuing && state.activitySession?.session) {
    const pending = state.activitySession;
    try {
      openActivity(pending.kind, pending);
    } catch {
      state.activitySession = null;
      announce('Your saved activity could not be restored. City progress is intact.', true);
    }
  }
}
function title() {
  if (mode === 'play') storeProgress();
  closeAllDialogs();
  mode = 'title';
  document.body.dataset.mode = mode;
  $('title-screen').hidden = false;
  $('game-hud').hidden = true;
  $('continue-game').hidden = !saved;
  game.paused = false;
  game.cam.snap = true;
  game.cam.offset = null;
  game.input.clear();
  game.audio.music(null);
}
function confirmNewGame() {
  if (!saved) {
    start();
    return;
  }
  info(
    'Start a new story?',
    '<p>Your current saved story will be replaced the next time progress is saved.</p><button class="primary-button" id="confirm-new-game">START A NEW STORY <span>↗</span></button>',
  );
  $('confirm-new-game').addEventListener('click', () => start());
}
$('new-game').addEventListener('click', confirmNewGame);
$('continue-game').addEventListener('click', () => start(true));
$('continue-game').hidden = !saved;
$('menu-button').addEventListener('click', pause);
$('brand-home').addEventListener('click', (event) => {
  event.preventDefault();
  if (mode === 'play') pause();
});
$('resume-game').addEventListener('click', () => closeAllDialogs());
$('quit-game').addEventListener('click', title);
$('save-game').addEventListener('click', () => {
  storeProgress(true);
  closeAllDialogs();
});
$('controls-button').addEventListener('click', showControls);
$('settings-button').addEventListener('click', showSettings);
$('pause-settings').addEventListener('click', showSettings);
$('credits-button').addEventListener('click', () =>
  info(
    'The city behind the story.',
    '<p class="credit-title">LOWLIGHT</p><p>An original urban crime drama. Mara Voss arrives in Harbor City to rebuild her life, and finds a city selling its future one debt at a time.</p><p class="credit-title">BUILT WITH MY-3D2DGE</p><p>Michael Crosato’s procedural pixel engine powers the city, articulated characters, cameras, effects, and synthesized sound. Engine used under the MIT license.</p><p>City art, characters, dialogue, and music are original to LOWLIGHT. Inspired by the open-world urban drama of Grand Theft Auto IV. No Rockstar characters, maps, music, or art assets are used.</p>',
    'LOWLIGHT / CREDITS',
  ),
);
function showControls() {
  const controls = [
    ['Move / steer', 'W A S D'],
    ['Interact / enter or exit vehicle', 'E'],
    ['Sprint / brake', 'SHIFT'],
    ['Aim', 'MOUSE'],
    ['Fire', 'CLICK / SPACE'],
    ['Reload', 'R'],
    ['Aim / guard', 'RIGHT MOUSE / LB'],
    ['Jump / vault / climb', 'J / Y'],
    ['Crouch', 'CTRL / L3'],
    ['Cover', 'C / B'],
    ['Dodge', 'X'],
    ['Counter', 'F / GUARD + RT'],
    ['Disarm', 'Z / GUARD + RB'],
    ['Heavy strike', 'ALT + FIRE'],
    ['Surrender', 'HOLD G'],
    ['Switch weapon', 'Q'],
    ['City map / waypoint', 'M'],
    ['Phone / contacts', 'T'],
    ['Camera', 'V'],
    ['Pause', 'ESC'],
  ];
  info(
    'Own the streets.',
    `<div class="controls-grid">${controls.map(([name, key]) => `<div class="control-row"><span>${name}</span><kbd>${key}</kbd></div>`).join('')}</div><p>On foot, movement follows the screen. In a vehicle, forward accelerates, backward reverses, and left/right steer. Hold sprint to run on foot or brake in a vehicle.</p><p>On touch screens, use the stick, USE, FIRE, RUN, and LOAD. MORE ACTIONS adds aiming, guard, crouch, cover, jumping, and surrender. The pause menu opens your phone and changes weapons.</p><p>Use cover near walls. Guard before a melee hit, then counter while your opponent is exposed. Jump toward low barriers or parked cars to vault, and toward a low ledge to climb.</p><p>Police react to witnesses and their last sighting. Break line of sight and leave the search circle to lose heat. At one star, hold G to surrender; resisting raises the response. Save at Voss Dispatch or from the pause menu.</p>`,
  );
}
function showSettings() {
  info(
    'Make yourself at home.',
    `<div class="setting-row"><label for="volume">Sound volume</label><input id="volume" type="range" min="0" max="100" value="${Math.round(settings.volume * 100)}"></div><div class="setting-row"><label for="weather-setting">Rain atmosphere</label><select id="weather-setting"><option value="on" ${settings.rain ? 'selected' : ''}>On</option><option value="off" ${!settings.rain ? 'selected' : ''}>Off</option></select></div><div class="setting-row"><label for="motion-setting">Reduce motion</label><select id="motion-setting"><option value="off" ${!settings.reduceMotion ? 'selected' : ''}>Off</option><option value="on" ${settings.reduceMotion ? 'selected' : ''}>On</option></select></div><div class="setting-row"><label for="camera-setting">Camera</label><select id="camera-setting"><option value="city">City perspective</option><option value="topdown">Overhead streets</option></select></div><p>Settings stay on this device. Sound begins after your first interaction.</p>`,
    'LOWLIGHT / SETTINGS',
  );
  $('camera-setting').value = settings.camera;
  const persist = () => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* optional preference storage */
    }
  };
  $('volume').addEventListener('input', (event) => {
    settings.volume = Number(event.target.value) / 100;
    game.audio.setVolume(settings.volume);
    persist();
  });
  $('weather-setting').addEventListener('change', (event) => {
    settings.rain = event.target.value === 'on';
    persist();
  });
  $('motion-setting').addEventListener('change', (event) => {
    settings.reduceMotion = event.target.value === 'on';
    game.reduceMotion = settings.reduceMotion;
    persist();
  });
  $('camera-setting').addEventListener('change', (event) => {
    settings.camera = event.target.value;
    applyCamera();
    persist();
  });
}
function applyCamera() {
  game.setView(
    settings.camera === 'topdown'
      ? new E.View('overhead-city', 'Overhead', 0, 82, 1.1, 1)
      : new E.View('city', 'City', 35, 48, 1.1, 1),
  );
}
applyCamera();
function showJournal() {
  info(
    'Nothing comes free.',
    MISSIONS.map(
      (m) =>
        `<article class="journal-card"><span class="journal-status">${state.progress.completed.includes(m.id) ? 'COMPLETED' : state.mission?.id === m.id ? 'ACTIVE' : m.prerequisite && !state.progress.completed.includes(m.prerequisite) ? 'LOCKED' : 'AVAILABLE'} / ${escapeHTML(m.contact)}</span><h3>${escapeHTML(m.title)}</h3><p>${escapeHTML(m.summary)}</p></article>`,
    ).join(''),
    'LOWLIGHT / JOURNAL',
  );
}
$('pause-journal').addEventListener('click', showJournal);
function showPhone() {
  const contact = state.mission
    ? MISSIONS.find((m) => m.id === state.mission.id)?.contact
    : 'Felix Voss';
  info(
    'One missed call.',
    `<p class="credit-title">${escapeHTML(contact || 'VOSS DISPATCH')}</p><p>${escapeHTML(state.mission?.objective || 'The taxi rank has work if you need cash. Keep in touch with the people who helped you get here.')}</p><button id="phone-journal" class="primary-button">OPEN JOURNAL <span>↗</span></button><p>Voss Dispatch · Saira’s Garage · Southbank Clinic · Signal House</p>`,
    'LOWLIGHT / PHONE',
  );
  $('phone-journal').addEventListener('click', showJournal);
}
function showWeaponShop(message = '') {
  const available = Object.entries(WEAPONS).filter(
    ([id]) => !['unarmed', 'street-object'].includes(id),
  );
  info(
    'Tools of the trade.',
    `${message ? `<p role="status" class="shop-message">${escapeHTML(message)}</p>` : ''}<p>Available cash: $${state.player.money.toLocaleString()}. One weapon per class can be carried; owned equipment can be re-equipped here.</p><div class="weapon-catalogue">${available.map(([id, w]) => `<article class="weapon-card"><div><h3>${escapeHTML(w.name)}</h3><p>${escapeHTML(w.class.toUpperCase())} · ${w.mode === 'melee' ? (w.windup > 0.2 ? 'HEAVY SWING' : 'QUICK STRIKE') : `CAPACITY ${w.clipSize}`} · ${state.player.ownedWeapons.includes(id) ? 'OWNED' : `$${w.cost}`}</p></div><button data-buy-weapon="${id}">${state.player.ownedWeapons.includes(id) ? 'EQUIP' : 'BUY'}</button>${w.mode !== 'melee' && state.player.ownedWeapons.includes(id) ? `<button class="ammo-purchase" data-buy-ammo="${id}">AMMUNITION / $${w.ammoCost}</button>` : ''}</article>`).join('')}</div>`,
    'ROOK’S SPORTING GOODS',
  );
  for (const button of $('info-content').querySelectorAll('[data-buy-weapon]'))
    button.addEventListener('click', () => {
      const purchased = buyWeapon(state, button.dataset.buyWeapon);
      showWeaponShop(
        purchased
          ? `${WEAPONS[button.dataset.buyWeapon].name} equipped.`
          : state.notifications.at(-1)?.text || 'The purchase could not be completed.',
      );
      storeProgress();
    });
  for (const button of $('info-content').querySelectorAll('[data-buy-ammo]'))
    button.addEventListener('click', () => {
      const purchased = buyAmmo(state, button.dataset.buyAmmo);
      showWeaponShop(
        purchased
          ? `Ammunition purchased for ${WEAPONS[button.dataset.buyAmmo].name}.`
          : state.notifications.at(-1)?.text || 'The purchase could not be completed.',
      );
      storeProgress();
    });
}
function showActionShelf() {
  info(
    'Your next move.',
    `<div class="action-shelf"><button id="action-jump">JUMP / VAULT / CLIMB</button><button id="action-cover">ENTER / LEAVE COVER</button><button id="action-crouch" class="${touchCombat.crouch ? 'selected' : ''}">CROUCH ${touchCombat.crouch ? 'ON' : 'OFF'}</button><button id="action-aim" class="${touchCombat.aim ? 'selected' : ''}">AIM ${touchCombat.aim ? 'ON' : 'OFF'}</button><button id="action-block" class="${touchCombat.block ? 'selected' : ''}">GUARD ${touchCombat.block ? 'ON' : 'OFF'}</button><button id="action-weapon">SWITCH WEAPON</button><button id="action-heavy">HEAVY STRIKE</button><button id="action-counter">COUNTER</button><button id="action-disarm">DISARM</button><button id="action-surrender">SURRENDER</button></div><p>Use cover near a wall. Jump toward low barriers, ledges, or a parked vehicle to traverse it. Guard before a melee hit, then counter while your opponent is exposed.</p>`,
  );
  const bind = (id, callback) =>
    $(id).addEventListener('click', () => {
      closeAllDialogs();
      callback();
    });
  bind('action-jump', () => jumpOrVault(state));
  bind('action-cover', () => toggleCover(state));
  bind('action-crouch', () => {
    touchCombat.crouch = !touchCombat.crouch;
  });
  bind('action-aim', () => {
    touchCombat.aim = !touchCombat.aim;
  });
  bind('action-block', () => {
    touchCombat.block = !touchCombat.block;
  });
  bind('action-weapon', () => {
    const list = state.player.weapons;
    selectWeapon(state, list[(list.indexOf(state.player.weapon) + 1) % list.length]);
  });
  bind('action-heavy', () => {
    game.input.press('Act:heavy');
    game.input.press('Act:fire');
    setTimeout(() => {
      game.input.release('Act:heavy');
      game.input.release('Act:fire');
    }, 70);
  });
  bind('action-counter', () => {
    game.input.press('Act:counter');
    setTimeout(() => game.input.release('Act:counter'), 70);
  });
  bind('action-disarm', () => {
    game.input.press('Act:disarm');
    setTimeout(() => game.input.release('Act:disarm'), 70);
  });
  bind('action-surrender', () => {
    game.input.press('Act:surrender');
    setTimeout(() => game.input.release('Act:surrender'), 5000);
  });
}
$('touch-more').addEventListener('click', showActionShelf);
$('pause-actions').addEventListener('click', showActionShelf);
$('pause-phone').addEventListener('click', showPhone);
$('pause-weapon').addEventListener('click', () => {
  const list = state.player.weapons;
  selectWeapon(state, list[(list.indexOf(state.player.weapon) + 1) % list.length]);
  closeAllDialogs();
  announce(`Equipped ${WEAPONS[state.player.weapon].name}.`);
});
function drawMap(canvas, full = false) {
  const g = canvas.getContext('2d'),
    width = canvas.width,
    height = canvas.height;
  const scale = full ? Math.min(width / WORLD.width, height / WORLD.height) : 0.37;
  const originX = full ? (width - WORLD.width * scale) / 2 : width / 2 - state.player.x * scale;
  const originY = full ? (height - WORLD.height * scale) / 2 : height / 2 - state.player.y * scale;
  const pt = (x, y) => [originX + x * scale, originY + y * scale];
  g.clearRect(0, 0, width, height);
  g.fillStyle = '#182e28';
  g.fillRect(0, 0, width, height);
  for (const d of WORLD.districts) {
    g.fillStyle = E.mix(d.color, '#203d31', 0.78);
    const q = pt(d.x, d.y);
    g.fillRect(...q, d.w * scale, d.h * scale);
  }
  for (const w of WORLD.water) {
    g.fillStyle = '#1b3d43';
    g.fillRect(...pt(w.x, w.y), w.w * scale, w.h * scale);
  }
  for (const b of WORLD.buildings) {
    g.fillStyle = '#526654';
    g.fillRect(...pt(b.x, b.y), b.w * scale, b.h * scale);
  }
  g.lineCap = 'butt';
  for (const road of WORLD.roads) {
    g.strokeStyle = '#263d31';
    g.lineWidth = road.width * scale;
    g.beginPath();
    g.moveTo(...pt(road.x1, road.y1));
    g.lineTo(...pt(road.x2, road.y2));
    g.stroke();
    g.strokeStyle = '#667c58';
    g.lineWidth = 1;
    g.stroke();
  }
  const destination = state.waypoint || state.mission?.target;
  if (destination) {
    const route = findRoute(WORLD, state.player, destination),
      b = pt(destination.x, destination.y);
    g.strokeStyle = '#c5b46a';
    g.lineWidth = full ? 3 : 2;
    g.beginPath();
    for (let i = 0; i < route.length; i++) {
      const q = pt(route[i].x, route[i].y);
      if (i === 0) g.moveTo(...q);
      else g.lineTo(...q);
    }
    g.stroke();
    g.fillStyle = '#e7c875';
    g.beginPath();
    g.arc(...b, full ? 6 : 4, 0, Math.PI * 2);
    g.fill();
  }
  if (state.wanted.level) {
    g.strokeStyle = '#d2876477';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(
      ...pt(state.wanted.lastSeen.x, state.wanted.lastSeen.y),
      state.wanted.searchRadius * scale,
      0,
      Math.PI * 2,
    );
    g.stroke();
    for (const officer of state.police) {
      if (officer.health <= 0 || officer.inVehicle) continue;
      const q = pt(officer.x, officer.y);
      g.fillStyle = '#ce8a70';
      g.fillRect(q[0] - 2, q[1] - 2, 4, 4);
    }
    for (const vehicle of state.vehicles) {
      if (!vehicle.policeControlled || vehicle.health <= 0) continue;
      const q = pt(vehicle.x, vehicle.y);
      g.fillStyle = '#91b7c4';
      g.fillRect(q[0] - 3, q[1] - 3, 6, 6);
    }
    for (const craft of state.policeAircraft || []) {
      if (craft.health <= 0) continue;
      const q = pt(craft.x, craft.y);
      g.strokeStyle = '#d4b88b';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(q[0] - 4, q[1]);
      g.lineTo(q[0] + 4, q[1]);
      g.moveTo(q[0], q[1] - 4);
      g.lineTo(q[0], q[1] + 4);
      g.stroke();
    }
  }
  if (full) {
    for (const l of WORLD.locations) {
      g.fillStyle = l.color;
      g.beginPath();
      g.arc(...pt(l.x, l.y), 4, 0, Math.PI * 2);
      g.fill();
    }
    g.font = 'bold 12px monospace';
    g.textAlign = 'center';
    for (const d of WORLD.districts) {
      g.fillStyle = '#c0cbaa';
      g.fillText(d.name.toUpperCase(), ...pt(d.x + d.w / 2, d.y + 55));
    }
    if (mapCursor) {
      const q = pt(mapCursor.x, mapCursor.y);
      g.strokeStyle = '#eaf0d0';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(q[0] - 9, q[1]);
      g.lineTo(q[0] + 9, q[1]);
      g.moveTo(q[0], q[1] - 9);
      g.lineTo(q[0], q[1] + 9);
      g.stroke();
    }
  }
  const p = pt(state.player.x, state.player.y);
  g.save();
  g.translate(...p);
  g.rotate(state.player.angle + Math.PI / 2);
  g.fillStyle = '#eaf0d0';
  g.strokeStyle = '#233c27';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, -7);
  g.lineTo(5, 6);
  g.lineTo(0, 3);
  g.lineTo(-5, 6);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}
function showMap() {
  mapCursor = { ...(state.waypoint || state.mission?.target || state.player) };
  openDialog($('map-dialog'));
  drawMap($('city-map'), true);
}
$('pause-map').addEventListener('click', showMap);
$('city-map').addEventListener('click', (event) => {
  const cv = event.currentTarget,
    rect = cv.getBoundingClientRect(),
    scale = Math.min(cv.width / WORLD.width, cv.height / WORLD.height);
  const x =
    (((event.clientX - rect.left) * cv.width) / rect.width - (cv.width - WORLD.width * scale) / 2) /
    scale;
  const y =
    (((event.clientY - rect.top) * cv.height) / rect.height -
      (cv.height - WORLD.height * scale) / 2) /
    scale;
  if (x >= 0 && x <= WORLD.width && y >= 0 && y <= WORLD.height) {
    const snapped = snapToRoad(WORLD, { x, y });
    if (snapped) state.waypoint = { x: snapped.x, y: snapped.y, name: 'Your waypoint', radius: 15 };
    drawMap(cv, true);
  }
});
$('city-map').addEventListener('keydown', (event) => {
  if (!mapCursor) return;
  const step = event.shiftKey ? 150 : 50;
  const keys = {
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
  };
  if (keys[event.key]) {
    event.preventDefault();
    mapCursor.x = E.clamp(mapCursor.x + keys[event.key][0], 0, WORLD.width);
    mapCursor.y = E.clamp(mapCursor.y + keys[event.key][1], 0, WORLD.height);
  } else if (event.key === 'Home') {
    event.preventDefault();
    mapCursor = { x: state.player.x, y: state.player.y };
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const snapped = snapToRoad(WORLD, mapCursor);
    if (snapped) state.waypoint = { x: snapped.x, y: snapped.y, name: 'Your waypoint', radius: 15 };
  } else return;
  drawMap(event.currentTarget, true);
});
$('clear-waypoint').addEventListener('click', () => {
  state.waypoint = null;
  drawMap($('city-map'), true);
});
for (const [id, action] of [
  ['touch-fire', 'fire'],
  ['touch-interact', 'interact'],
  ['touch-sprint', 'sprint'],
  ['touch-reload', 'reload'],
]) {
  const button = $(id);
  button.dataset.act = action;
}
game.input.bindButtons($('touch-controls'));
const stick = $('joystick');
function moveStick(event) {
  if (event.pointerId !== touch.id) return;
  const rect = stick.getBoundingClientRect(),
    x = event.clientX - rect.left - rect.width / 2,
    y = event.clientY - rect.top - rect.height / 2;
  const length = Math.hypot(x, y),
    radius = rect.width * 0.32,
    k = Math.min(1, length / radius);
  touch.x = length ? (x / length) * k : 0;
  touch.y = length ? (y / length) * k : 0;
  $('joystick-knob').style.transform = `translate(${touch.x * radius}px,${touch.y * radius}px)`;
}
stick.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  touch.id = event.pointerId;
  stick.setPointerCapture(event.pointerId);
  moveStick(event);
});
stick.addEventListener('pointermove', moveStick);
const releaseStick = (event) => {
  if (event.pointerId === touch.id) {
    touch.id = null;
    touch.x = touch.y = 0;
    $('joystick-knob').style.transform = '';
  }
};
stick.addEventListener('pointerup', releaseStick);
stick.addEventListener('pointercancel', releaseStick);
stick.addEventListener('lostpointercapture', releaseStick);
addEventListener('blur', () => {
  touch.id = null;
  touch.x = touch.y = 0;
  $('joystick-knob').style.transform = '';
  if (activityUI.dialog.open) {
    activityUI.pause();
    storeProgress();
  } else if (mode === 'play') pause();
});
addEventListener('focus', () => activityUI.resume());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'play') {
    storeProgress();
    if (activityUI.dialog.open) activityUI.pause();
    else pause();
  }
});
addEventListener('resize', () => {
  game.cam.offset = mode === 'play' && matchMedia('(pointer: coarse)').matches ? [0, -25] : null;
});

function updateHud() {
  const p = state.player,
    ammo = p.ammo[p.weapon],
    definition = WEAPONS[p.weapon];
  $('cash').textContent = `$${Math.round(p.money).toLocaleString('en-US')}`;
  $('health-bar').style.width = `${Math.max(0, p.health)}%`;
  $('armour-bar').style.width = `${Math.max(0, p.armour)}%`;
  $('health-bar').parentElement.setAttribute(
    'aria-label',
    `Health ${Math.round(p.health)} percent`,
  );
  $('armour-bar').parentElement.setAttribute(
    'aria-label',
    `Armour ${Math.round(p.armour)} percent`,
  );
  $('weapon-name').textContent = p.vehicleId
    ? VEHICLE_SPECS[currentVehicle(state)?.spec]?.name || 'VEHICLE'
    : definition.name;
  $('ammo').innerHTML =
    definition.mode === 'melee'
      ? '<small>READY</small>'
      : `${ammo.clip} <small>/ ${ammo.reserve}</small>`;
  $('wanted-stars').textContent = '★'.repeat(state.wanted.level);
  $('wanted-stars').style.color = ['search', 'cooling'].includes(state.wanted.status)
    ? '#9daf9f'
    : '#e6c281';
  $('wanted-stars').setAttribute(
    'aria-label',
    state.wanted.level
      ? `Wanted level ${state.wanted.level}: ${state.wanted.status}`
      : 'Not wanted',
  );
  $('mission-name').textContent = state.mission?.title || 'The city is yours.';
  $('mission-objective').textContent =
    state.mission?.objective || 'Find a job, take a fare, or explore Harbor City.';
  const target = state.waypoint || state.mission?.target;
  $('mission-distance').textContent = target
    ? `${Math.round(Math.hypot(p.x - target.x, p.y - target.y))} m / ${target.name}`
    : state.wanted.level
      ? state.wanted.status.toUpperCase()
      : '';
  const district =
    WORLD.districts.find((d) => p.x >= d.x && p.x < d.x + d.w && p.y >= d.y && p.y < d.y + d.h) ||
    WORLD.districts[1];
  $('district-name').textContent = district.name.toUpperCase();
  $('street-name').textContent =
    `${district.name.toUpperCase()} / ${p.vehicleId ? 'DRIVING' : 'ON FOOT'}`;
  const hour = Math.floor(state.clock),
    minute = Math.floor((state.clock - hour) * 60);
  $('game-clock').textContent =
    `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const candidate = nearestInteractable(state);
  $('context-prompt').hidden = !candidate || !!state.dialogue;
  if (candidate) $('context-text').textContent = candidate.prompt || candidate.name;
  $('dialogue-panel').hidden = !state.dialogue;
  $('touch-more').hidden = !!state.dialogue;
  if (state.dialogue) {
    $('dialogue-speaker').textContent = state.dialogue.speaker;
    $('dialogue-text').textContent = state.dialogue.text;
  }
  $('dialogue-panel').lastElementChild.innerHTML =
    `<kbd>${matchMedia('(pointer: coarse)').matches ? 'USE' : 'E'}</kbd> CONTINUE`;
  for (const notice of state.notifications) {
    if (!noticeHistory.has(notice.id)) {
      noticeHistory.add(notice.id);
      announce(notice.text, notice.kind === 'error' || notice.kind === 'danger');
    }
  }
  drawMap($('minimap'));
}

let padPrevious = [],
  padMoveTime = 0,
  padDirection = 0;
function updateControllerMenus() {
  let pad;
  try {
    pad = Array.from(navigator.getGamepads?.() || []).find((p) => p && p.connected !== false);
  } catch {
    return;
  }
  if (!pad) {
    padPrevious = [];
    padDirection = 0;
    return;
  }
  const pressed = (index) => !!pad.buttons[index]?.pressed && !padPrevious[index];
  if (activityUI.dialog.open && activityUI.handleGamepad(pad, pressed)) {
    padPrevious = pad.buttons.map((button) => button.pressed);
    return;
  }
  const open = dialogs.find((dialog) => dialog.open);
  const menu = open || (mode === 'title' ? $('title-screen') : null);
  if (menu) {
    const items = Array.from(
      menu.querySelectorAll('button:not(:disabled),a,input,select,canvas[tabindex]'),
    ).filter((item) => item.getClientRects().length && !item.closest('[hidden]'));
    const focused = document.activeElement;
    const direction =
      pad.buttons[13]?.pressed || pad.axes[1] > 0.5
        ? 1
        : pad.buttons[12]?.pressed || pad.axes[1] < -0.5
          ? -1
          : 0;
    const now = performance.now();
    const horizontal =
      pad.buttons[15]?.pressed || pad.axes[0] > 0.5
        ? 1
        : pad.buttons[14]?.pressed || pad.axes[0] < -0.5
          ? -1
          : 0;
    if (focused?.id === 'city-map') {
      if ((direction || horizontal) && (direction !== padDirection || now - padMoveTime > 260)) {
        const key = horizontal
          ? horizontal > 0
            ? 'ArrowRight'
            : 'ArrowLeft'
          : direction > 0
            ? 'ArrowDown'
            : 'ArrowUp';
        focused.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        padMoveTime = now;
      }
      if (pressed(0))
        focused.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    } else {
      if (direction && (direction !== padDirection || now - padMoveTime > 260) && items.length) {
        const index = items.indexOf(focused);
        items[(index + direction + items.length) % items.length].focus();
        padMoveTime = now;
      }
      if (pressed(0) && items.length) {
        const selected = items.includes(document.activeElement) ? document.activeElement : items[0];
        selected.focus();
        if (selected.tagName === 'BUTTON' || selected.tagName === 'A') selected.click();
      }
    }
    padDirection = direction;
    if (pressed(1) && open) closeDialog(open);
    if (focused?.tagName === 'INPUT' && focused.type === 'range' && (pressed(14) || pressed(15))) {
      focused.value = E.clamp(
        Number(focused.value) + (pressed(15) ? 5 : -5),
        Number(focused.min),
        Number(focused.max),
      );
      focused.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (focused?.tagName === 'SELECT' && (pressed(14) || pressed(15))) {
      focused.selectedIndex =
        (focused.selectedIndex + (pressed(15) ? 1 : -1) + focused.options.length) %
        focused.options.length;
      focused.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  padPrevious = pad.buttons.map((button) => button.pressed);
}

game.start({
  update(dt) {
    if (mode === 'title') {
      game.focus(770 + Math.sin(game.real * 0.055) * 65, 700 + Math.cos(game.real * 0.07) * 30, 0);
      if (game.input.pressed('start') && !dialogs.some((d) => d.open)) confirmNewGame();
      return;
    }
    const input = game.input;
    if (input.pressed('pause')) {
      pause();
      return;
    }
    if (input.pressed('map')) {
      showMap();
      return;
    }
    if (input.pressed('phone')) {
      showPhone();
      return;
    }
    if (input.pressed('camera')) {
      settings.camera = settings.camera === 'city' ? 'topdown' : 'city';
      applyCamera();
    }
    const guardChord = input.down('aim') && WEAPONS[state.player.weapon].mode === 'melee';
    const counterPressed = input.pressed('counter') || (guardChord && input.pressed('fire'));
    const disarmPressed = input.pressed('disarm') || (guardChord && input.pressed('weapon'));
    if (input.pressed('weapon') && !guardChord) {
      const list = state.player.weapons;
      selectWeapon(state, list[(list.indexOf(state.player.weapon) + 1) % list.length]);
    }
    if (input.pressed('interact')) {
      const candidate = nearestInteractable(state);
      if (candidate?.type === 'weapons') {
        showWeaponShop();
        return;
      }
      const result = interact(state);
      game.audio.sfx('select');
      if (result?.type === 'save') storeProgress(true);
      if (result?.type === 'activity') {
        openActivity(result.activity);
        return;
      }
    }
    const movement = touch.id !== null ? [touch.x, touch.y] : input.move();
    const ground = game.view.screenDirToGround(...movement);
    let aimAngle, aimTarget;
    const targetable = [...state.hostiles, ...state.police, ...(state.policeAircraft || [])].filter(
      (actor) => actor.health > 0 && !actor.inVehicle,
    );
    const padAim = input.padAim;
    if (padAim) {
      const worldAim = game.view.screenDirToGround(...padAim);
      aimAngle = Math.atan2(worldAim[1], worldAim[0]);
    } else if (input.mouse.active && input.aimSource === 'mouse') {
      const mouse = game.mouseGround();
      if (mouse) aimAngle = Math.atan2(mouse[1] - state.player.y, mouse[0] - state.player.x);
      const projectedPointer = input.mouseScreen();
      if (projectedPointer) {
        const hovered = targetable
          .map((actor) => {
            const z = (actor.z || 0) + (actor.role === 'air-search' ? 0 : 13),
              point = game.view.p(actor.x, actor.y, z);
            return {
              actor,
              z,
              distance: Math.hypot(projectedPointer[0] - point[0], projectedPointer[1] - point[1]),
            };
          })
          .filter((target) => target.distance < 24)
          .sort((a, b) => a.distance - b.distance)[0];
        if (hovered) aimTarget = { x: hovered.actor.x, y: hovered.actor.y, z: hovered.z };
      }
    } else if (input.down('fire') || input.pressed('fire')) {
      const enemies = targetable
        .filter((e) => state.hostiles.includes(e) || state.wanted.level >= 2)
        .sort(
          (a, b) =>
            Math.hypot(a.x - state.player.x, a.y - state.player.y) -
            Math.hypot(b.x - state.player.x, b.y - state.player.y),
        );
      if (
        enemies[0] &&
        Math.hypot(enemies[0].x - state.player.x, enemies[0].y - state.player.y) < 350
      ) {
        aimAngle = Math.atan2(enemies[0].y - state.player.y, enemies[0].x - state.player.x);
        aimTarget = {
          x: enemies[0].x,
          y: enemies[0].y,
          z: (enemies[0].z || 0) + (enemies[0].role === 'air-search' ? 0 : 13),
        };
      }
    }
    updateSimulation(state, dt, {
      moveX: ground[0],
      moveY: ground[1],
      up: movement[1] < -0.15,
      down: movement[1] > 0.15,
      left: movement[0] < -0.15,
      right: movement[0] > 0.15,
      sprint: input.down('sprint'),
      brake: input.down('sprint'),
      fire: (input.down('fire') || input.pressed('fire')) && !counterPressed && !disarmPressed,
      reload: input.pressed('reload'),
      aim: input.down('aim') || touchCombat.aim,
      crouch: input.down('crouch') || touchCombat.crouch,
      cover: input.pressed('cover'),
      jump: input.pressed('jump'),
      block:
        (input.down('aim') && WEAPONS[state.player.weapon].mode === 'melee') || touchCombat.block,
      dodge: input.pressed('dodge'),
      counter: counterPressed,
      disarm: disarmPressed,
      heavyAttack: input.down('heavy'),
      surrender: input.down('surrender'),
      aimAngle,
      aimTarget,
    });
    state.player.firing = input.down('fire') || input.pressed('fire');
    const zoom = state.player.scoped ? WEAPONS[state.player.weapon].scopeZoom || 1 : 1;
    if (game.zoom !== zoom) game.setZoom(zoom);
    const vehicle = currentVehicle(state);
    game.focus(
      state.player.x + (vehicle ? Math.cos(vehicle.angle) * vehicle.speed * 0.14 : 0),
      state.player.y + (vehicle ? Math.sin(vehicle.angle) * vehicle.speed * 0.14 : 0),
      0,
    );
    if (state.player.health < lastHealth) {
      game.hitFx(state.player.x, state.player.y, 15, {
        power: 0.3,
        color: '#d89172',
        sound: 'hurt',
      });
    }
    if (
      state.wanted.level >= 2 &&
      Math.floor(game.real * 2) !== Math.floor((game.real - dt) * 2) &&
      state.vehicles.some(
        (car) =>
          car.policeControlled &&
          car.health > 0 &&
          Math.hypot(car.x - state.player.x, car.y - state.player.y) < 220,
      )
    ) {
      game.audio.sfx({
        wave: 'sine',
        freq: Math.floor(game.real) % 2 ? 580 : 760,
        to: Math.floor(game.real) % 2 ? 760 : 580,
        dur: 0.38,
        vol: 0.055,
      });
    }
    if (state.player.attackSerial > lastAttackSerial) {
      const attack = state.player.lastAttack;
      weaponSound(game, attack.weapon, attack.kind);
      if (WEAPONS[attack.weapon].mode === 'ballistic')
        game.particles.sparks(
          state.player.x + Math.cos(state.player.angle) * 15,
          state.player.y + Math.sin(state.player.angle) * 15,
          (state.player.z || 0) + 14,
          3,
          state.player.angle,
          {
            color: '#e8d398',
          },
        );
      lastAttackSerial = state.player.attackSerial;
    }
    for (const effect of state.combatEffects || []) {
      if (combatEffectsSeen.has(effect.id)) continue;
      combatEffectsSeen.add(effect.id);
      if (effect.type === 'explosion')
        game.particles.explosion(
          effect.x,
          effect.y,
          effect.z || 0,
          Math.min(1.5, (effect.radius || 30) / 40),
        );
      else if (effect.type === 'glass-break') {
        game.particles.bits(effect.x, effect.y, 6, 9, ['#afc6b4', '#d4e0c5']);
        game.audio.sfx('bump', { vol: 0.15, pitch: 1.8 });
      } else if (effect.type === 'parry' || effect.type === 'block') {
        game.particles.sparks(effect.x, effect.y, (effect.z || 0) + 12, 6);
        game.audio.sfx('bump', { vol: 0.15 });
      } else if (effect.type === 'impact' || effect.type === 'object-impact')
        game.particles.impact(effect.x, effect.y, (effect.z || 0) + 12, 4, '#c8a878');
    }
    if (combatEffectsSeen.size > 1500) {
      combatEffectsSeen.clear();
      for (const effect of state.combatEffects || []) combatEffectsSeen.add(effect.id);
    }
    lastHealth = state.player.health;
    if (
      state.waypoint &&
      Math.hypot(state.player.x - state.waypoint.x, state.player.y - state.waypoint.y) < 18
    )
      state.waypoint = null;
    if (state.time - lastHud > 0.12) {
      updateHud();
      lastHud = state.time;
    }
    if (state.time - lastSave > 30) storeProgress();
  },
  draw(r) {
    updateControllerMenus();
    activityUI.tick();
    renderer.draw(r, state, {
      title: mode === 'title',
      rain: settings.rain && !settings.reduceMotion,
    });
  },
});
game.focus(780, 700, 0);
if (new URLSearchParams(location.search).has('play')) start(!!saved);
if (new URLSearchParams(location.search).has('debug')) {
  globalThis.lowlight = {
    game,
    get state() {
      return state;
    },
    start,
    interact: () => interact(state),
    update: (dt) => updateSimulation(state, dt),
    save: () => saveGame(state),
    restore: (value) => {
      state = restoreGame(value);
      updateHud();
    },
    refresh: updateHud,
  };
}
