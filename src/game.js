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
  getEquipmentStore,
  equipmentPrice,
  selectMetroStop,
  jumpOrVault,
  toggleCover,
  storyView,
  storyActorDressing,
  storyPhoneView,
  presentStoryPhoneLine,
  actStoryPhone,
  hideStoryPhone,
  dialStoryWarning,
  recognizeStoryActor,
  recordStoryRenderedClues,
  presentStoryDialogue,
  acknowledgeStory,
  selectStoryChoice,
  retryStory,
  leaveStory,
  skipStoryCinematic,
  prepareStorySave,
  commitStorySave,
  rollbackStorySave,
  setCampaignStorageVerifier,
  setStoryPresentationVisibility,
  chooseWardrobeOutfit,
  WORLD,
  MISSIONS,
  WEAPONS,
  VEHICLE_SPECS,
} from './simulation.js';
import { createWorldRenderer } from './renderer.js';
import { createRailRenderer } from './rail-renderer.js';
import { railPassenger } from './rail-runtime.js';
import { quoteTransitFare } from './transit.js';
import { createInteriorRenderer } from './interior-renderer.js';
import { interiorScene } from './interiors.js';
import { currentSceneId, scenePeople, inScene } from './scene-context.js';
import { createRoomMap, createRoomMapProjection, exteriorMapPosition } from './room-map.js';
import { findRoute, snapToRoad } from './navigation.js';
import { weaponSound } from './weapon-art.js';
import { createMinigameView } from './minigame-view.js';
import { restoreActivity } from './activity-save.js';
import { createMapBackground, createMapProjection } from './map-background.js';
import { createNightCrossingRenderer } from './campaign/scenes.js';
import { createLateMeterRenderer } from './campaign/late-meter-scenes.js';
import { getActor } from './companions.js';
import { isNamedHostile } from './named-hostility.js';
import { OUTFITS } from './wardrobe.js';
import { FIRST_ARC_MISSIONS } from './campaign/first-arc.js';
import { storyChoicePresentation, storyChoiceMarkup } from './campaign/choice-presentation.js';
import { drawTwoSeatsClosedAccess } from './campaign/two-seats-registration.js';

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
const storyRenderer = createNightCrossingRenderer(game, WORLD);
const lateMeterRenderer = createLateMeterRenderer(game, WORLD, {
  getActor: (id) => getActor(state, id),
});
const renderer = createWorldRenderer(game, WORLD, VEHICLE_SPECS, {
  getActorDressing: storyActorDressing,
  afterGround: (r, renderedState) => {
    storyRenderer.drawGround(r, renderedState);
    lateMeterRenderer.drawGround(r, renderedState);
  },
  afterScenery: (r, renderedState) => {
    storyRenderer.draw(r, renderedState);
    lateMeterRenderer.draw(r, renderedState);
    if (renderedState.campaign?.completed?.['LL-ST-002']) drawTwoSeatsClosedAccess(r);
  },
  onRenderedClues: recordStoryRenderedClues,
});
const metroRenderer = createRailRenderer(game, WORLD);
const roomRenderer = createInteriorRenderer(game, VEHICLE_SPECS, {
  getActorDressing: storyActorDressing,
  drawRoomDetails: (r, renderedState) => lateMeterRenderer.drawRoomDetails(r, renderedState),
  onRenderedClues: recordStoryRenderedClues,
});
const roomMap = createRoomMap();
const mapBackground = createMapBackground(WORLD);
const dialogs = [$('pause-dialog'), $('info-dialog'), $('map-dialog')];
$('info-dialog').setAttribute('aria-labelledby', 'info-title');
const touch = { x: 0, y: 0, id: null };
const noticeHistory = new Set();
let mapCursor = null;
let lastAttackSerial = 0;
const combatEffectsSeen = new Set();
const touchCombat = { crouch: false, aim: false, block: false };
let displayedSceneId = null,
  displayedRestoreEpoch = null,
  displayedCameraEpoch = null,
  sceneMovementBlocked = false;
let renderedStoryLine = null,
  promptedStoryChoice = null,
  promptedStoryFailure = null;
let storyPhoneExpanded = false,
  storyPhoneOwner = null,
  renderedPhoneToken = null,
  storyPhoneContactsKey = null,
  storyInputSerial = 0;
setCampaignStorageVerifier((bytes) => localStorage.getItem(SAVE_KEY) === bytes);

const storyContinue = document.createElement('button');
$('dialogue-panel').setAttribute('role', 'status');
$('dialogue-panel').setAttribute('aria-live', 'polite');
$('dialogue-panel').setAttribute('aria-atomic', 'true');
storyContinue.id = 'story-continue';
storyContinue.className = 'story-caption-action';
storyContinue.textContent = 'CONTINUE';
storyContinue.hidden = true;
$('dialogue-panel').append(storyContinue);
const storySkip = document.createElement('button');
storySkip.id = 'story-skip';
storySkip.className = 'story-skip';
storySkip.textContent = 'SKIP SCENE';
storySkip.hidden = true;
$('game-hud').append(storySkip);
const storyRestFade = document.createElement('div');
storyRestFade.className = 'story-rest-fade';
storyRestFade.setAttribute('aria-hidden', 'true');
storyRestFade.hidden = true;
$('screen').after(storyRestFade);
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
function syncScene(force = false) {
  const id = currentSceneId(state),
    epoch = storyView(state)?.inputEpoch ?? 0;
  if (!force && id === displayedSceneId && epoch === displayedRestoreEpoch) return false;
  if (displayedRestoreEpoch !== null && epoch !== displayedRestoreEpoch) lastSave = state.time;
  displayedSceneId = id;
  displayedRestoreEpoch = epoch;
  renderedStoryLine = null;
  renderedPhoneToken = null;
  hideStoryPhone(state);
  const axes = game.input.padAxes || [0, 0];
  sceneMovementBlocked = Math.hypot(axes[0] || 0, axes[1] || 0) > (game.input.deadzone ?? 0.18);
  game.input.clear();
  if (touch.id !== null && $('joystick').hasPointerCapture?.(touch.id))
    $('joystick').releasePointerCapture(touch.id);
  touch.id = null;
  touch.x = touch.y = 0;
  $('joystick-knob').style.transform = '';
  touchCombat.crouch = touchCombat.aim = touchCombat.block = false;
  state.lastInput = {};
  state.player.firing = false;
  state.player.aimTarget = null;
  game.particles.list.length = 0;
  game.r.ghosts.length = 0;
  game.cam.snap = true;
  game.focus(state.player.x, state.player.y, state.player.z || 0);
  game.lights.enabled = Boolean(id);
  game.lights.ambient = id ? 0.4 : 0.15;
  lastAttackSerial = state.player.attackSerial || 0;
  lastHealth = state.player.health;
  lastHud = state.time - 1;
  return true;
}

function processInteraction(result) {
  const changed = syncScene();
  if (result?.type === 'story-save') storeShelterProgress();
  else if (result?.type === 'wardrobe') showWardrobe();
  else if (result?.type === 'save') storeProgress(true);
  else if (result?.type === 'activity') openActivity(result.activity);
  else if (result?.type === 'workshop') showWeaponShop();
  else if (result?.type === 'journal') showJournal();
  else if (result?.type === 'story-recognize' && !result.ok)
    announce('Look toward the grey tow jacket and clipboard first.', true);
  else if (result?.type === 'story-mission' && !result.ok)
    announce('Bring a working taxi to the marked Dispatch stop, then speak to Felix.', true);
  updateHud();
  return changed || dialogs.some((dialog) => dialog.open);
}
function storeProgress(manual = false) {
  if (storyView(state)?.failed) {
    if (manual) announce('Retry the journey before saving. Your last save is kept.', true);
    return false;
  }
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
function storeShelterProgress() {
  const prepared = prepareStorySave(state);
  if (!prepared.ok) {
    announce('Share the meal, then use the room’s save point.', true);
    return false;
  }
  let previous;
  try {
    previous = localStorage.getItem(SAVE_KEY);
    const bytes = saveGame(prepared.candidate);
    localStorage.setItem(SAVE_KEY, bytes);
    if (localStorage.getItem(SAVE_KEY) !== bytes) throw Error('Save readback failed.');
    if (!commitStorySave(state, prepared, { bytes }).ok) throw Error('Save confirmation failed.');
    saved = bytes;
    lastSave = state.time;
  } catch {
    rollbackStorySave(state, prepared);
    try {
      if (previous === null) localStorage.removeItem(SAVE_KEY);
      else if (previous !== undefined) localStorage.setItem(SAVE_KEY, previous);
    } catch {
      /* A browser that denies storage cannot repair it; retain the in-memory save. */
    }
    announce('This browser could not save progress. Your last confirmed save is kept.', true);
    return false;
  }
  announce('Progress saved at Dockside Rooms.');
  updateHud();
  return true;
}
function storyTarget(view = storyView(state)) {
  if (!view?.active || !view.target)
    return view?.availableAssignment?.target
      ? { ...view.availableAssignment.target, name: view.availableAssignment.title }
      : null;
  const names = {
    berth: 'Felix at Pier Eight',
    taxi: 'Felix’s co-op taxi',
    drill: view.route?.index <= 1 ? 'Promenade muster sign' : 'Voss Dispatch',
    shelter: 'Dockside Rooms',
    rest: view.target.prompt || 'Shared room',
    counter: view.target.id === view.requiredVehicleId ? 'Your taxi' : 'Impound annex',
    lookout: 'Impound lookout bay',
    warn: 'Call Felix',
    extract: 'Your taxi',
    return: 'Voss Dispatch pickup bay',
  };
  return { ...view.target, name: names[view.stageId] || view.title };
}
function exteriorStoryTarget() {
  const target = storyTarget();
  if (!target || inScene(target, null)) return target;
  const binding = Object.values(WORLD.campaignSceneBindings || {}).find(
    (entry) => entry.roomId === target.sceneId && entry.entry,
  );
  return binding
    ? { ...binding.entry, sceneId: null, name: `${target.name || 'Destination'} entrance` }
    : null;
}
function setStoryPhoneText(id, text) {
  if ($(id).textContent !== text) $(id).textContent = text;
}
function isWarningPhone(view = storyView(state)) {
  return view?.active && !view.failed && view.missionId === 'LL-ST-002' && view.stageId === 'warn';
}
function storyInputReceipt(kind) {
  return `ui:${kind}:${++storyInputSerial}`;
}
function hideWarningPanel() {
  storyPhoneExpanded = false;
  renderedPhoneToken = null;
  hideStoryPhone(state);
  renderStoryPhone();
  $('screen').focus({ preventScroll: true });
}
function dialWarningContact(contact, method = 'phone') {
  const result = dialStoryWarning(state, contact, method, storyInputReceipt('call'));
  storyPhoneExpanded = true;
  renderStoryPhone();
  $('story-phone-status').textContent = result.ok
    ? 'Calling Felix…'
    : result.reason === 'wrong-contact'
      ? 'That is another line. Choose Felix’s own number; the clock is still running.'
      : 'The call could not connect. Choose Felix and try again before he reaches the door.';
  $('screen').focus({ preventScroll: true });
  return result;
}
function acknowledgeVisiblePhone() {
  const view = storyPhoneView(state),
    token = renderedPhoneToken;
  if (
    !token ||
    $('story-phone-panel').hidden ||
    !view?.line ||
    view.id !== token.callId ||
    view.line.index !== token.index ||
    view.line.dialCount !== token.dialCount
  )
    return false;
  const result = actStoryPhone(state, {
    type: 'acknowledge',
    id: token.callId,
    index: token.index,
    dialCount: token.dialCount,
  });
  if (!result.acknowledged && !result.ok)
    $('story-phone-status').textContent = 'Let the current line appear, then continue.';
  renderedPhoneToken = null;
  renderStoryPhone();
  updateHud();
  return result.ok || result.acknowledged;
}
function interactWithStoryPhone() {
  if (!storyPhoneExpanded) {
    storyPhoneExpanded = true;
    renderStoryPhone();
    return;
  }
  const call = storyPhoneView(state);
  if (call?.line) acknowledgeVisiblePhone();
  else if (!call?.active) dialWarningContact('LL-CHAR-002', 'accessibility-hotkey');
}
function renderStoryPhone(view = storyView(state)) {
  const visible = mode === 'play' && !document.hidden && !dialogs.some((dialog) => dialog.open);
  const warning = isWarningPhone(view);
  if (warning) $('context-prompt').hidden = true;
  $('story-recognize').hidden = !visible || !view?.recognitionReady || !!view.dialogue;
  $('story-phone-toggle').hidden = !visible || !warning;
  if (!warning) {
    storyPhoneOwner = null;
    storyPhoneExpanded = false;
  } else {
    const owner = `${view.missionId}:${view.attempt}:${view.inputEpoch}`;
    if (owner !== storyPhoneOwner) {
      storyPhoneOwner = owner;
      storyPhoneExpanded = true;
      $('story-phone-status').textContent = 'Choose a contact. E or A calls Felix directly.';
    }
  }
  const panel = $('story-phone-panel');
  panel.hidden = !visible || !warning || !storyPhoneExpanded;
  document.body.classList.toggle('warning-phone-open', !panel.hidden);
  $('story-phone-toggle').setAttribute('aria-expanded', String(!panel.hidden));
  const remaining = Math.max(0, Math.ceil(view?.warningSecondsRemaining || 0));
  setStoryPhoneText('story-phone-toggle', `CALL FELIX · ${remaining}s · T`);
  setStoryPhoneText('story-phone-clock', `${remaining}s`);
  $('story-phone-clock').setAttribute('aria-label', `${remaining} seconds remaining to warn Felix`);
  if (panel.hidden) {
    renderedPhoneToken = null;
    hideStoryPhone(state);
    return;
  }
  const call = storyPhoneView(state);
  const contacts = Object.values(state.phoneCalls?.contacts || {});
  const contactsKey = JSON.stringify(contacts.map((contact) => [contact.id, contact.name]));
  if (contactsKey !== storyPhoneContactsKey) {
    storyPhoneContactsKey = contactsKey;
    $('story-phone-contacts').replaceChildren(
      ...contacts.map((contact) => {
        const button = document.createElement('button');
        button.textContent = contact.name;
        button.dataset.storyContact = contact.id;
        button.addEventListener('click', () => dialWarningContact(contact.id));
        return button;
      }),
    );
  }
  $('story-phone-contacts').hidden = !!call?.active;
  const line = call?.line;
  $('story-phone-caption').hidden = !line;
  $('story-phone-continue').hidden = !line;
  if (call?.phase === 'ringing') setStoryPhoneText('story-phone-status', 'Calling Felix…');
  if (line) {
    setStoryPhoneText('story-phone-status', 'Connected · Felix Voss');
    setStoryPhoneText('story-phone-speaker', line.speaker);
    setStoryPhoneText('story-phone-text', line.text);
    const token = { callId: call.id, index: line.index, dialCount: line.dialCount };
    // Only the actual mounted, visible caption receives presentation credit.
    const captionRect = $('story-phone-caption').getBoundingClientRect(),
      panelRect = panel.getBoundingClientRect();
    const fullyVisible =
      captionRect.width > 0 &&
      captionRect.top >= Math.max(0, panelRect.top) &&
      captionRect.bottom <= Math.min(innerHeight, panelRect.bottom) + 0.5 &&
      captionRect.left >= 0 &&
      captionRect.right <= innerWidth;
    if (fullyVisible && presentStoryPhoneLine(state, token)) renderedPhoneToken = token;
    else {
      renderedPhoneToken = null;
      hideStoryPhone(state);
    }
  } else {
    renderedPhoneToken = null;
    hideStoryPhone(state);
    if (call?.waitingForDelivery)
      setStoryPhoneText('story-phone-status', 'Waiting for Felix to finish the warning.');
  }
}
$('story-phone-toggle').addEventListener('click', () => {
  storyPhoneExpanded = !storyPhoneExpanded;
  renderStoryPhone();
  $('screen').focus({ preventScroll: true });
});
$('story-phone-hide').addEventListener('click', hideWarningPanel);
$('story-phone-continue').addEventListener('click', () => {
  acknowledgeVisiblePhone();
  $('screen').focus({ preventScroll: true });
});
$('story-recognize').addEventListener('click', () => {
  const result = recognizeStoryActor(state, 'LL-ARC-REEVE', storyInputReceipt('recognize'));
  if (!result.ok) announce('Look toward the grey tow jacket and clipboard first.', true);
  updateHud();
  $('screen').focus({ preventScroll: true });
});
function storyLineKey(view) {
  if (view?.dialogue)
    return `${view.missionId}:${view.stageId}:${view.attempt}:${view.dialogueIndex}`;
  return view?.ambient ? `${view.ambient.receipt}:${view.ambient.index}` : null;
}
function renderCaptions(view = storyView(state)) {
  const line = view?.dialogue || view?.ambient || state.dialogue,
    panel = $('dialogue-panel'),
    visible = mode === 'play' && !document.hidden && !dialogs.some((dialog) => dialog.open);
  setStoryPresentationVisibility(state, visible);
  panel.dataset.intervention = String(!!isTwoSeatsIntervention(view));
  panel.hidden = !line || !visible;
  if (line || view?.cinematic) $('context-prompt').hidden = true;
  document.body.classList.toggle('in-conversation', !!line && visible);
  document.body.classList.toggle('story-scene', visible && !!view?.cinematic);
  $('touch-more').hidden = !!line && !isTwoSeatsIntervention(view);
  storyContinue.hidden = !line || !(view?.dialogue || view?.ambient);
  const combatControls = isTwoSeatsIntervention(view)
    ? matchMedia('(pointer: coarse)').matches
      ? ' · MORE: GUARD / DISARM'
      : ' · RIGHT MOUSE: GUARD · Z: DISARM'
    : '';
  panel.querySelector('span').innerHTML =
    `<kbd>${matchMedia('(pointer: coarse)').matches ? 'USE' : 'E'}</kbd> ${view?.autoDialogue || view?.ambient ? 'CONTINUE · AUTO CAPTIONS' : 'CONTINUE'}${combatControls}`;
  if (line) {
    if ($('dialogue-speaker').textContent !== line.speaker)
      $('dialogue-speaker').textContent = line.speaker;
    if ($('dialogue-text').textContent !== line.text) $('dialogue-text').textContent = line.text;
  }
  renderedStoryLine = visible && !panel.hidden ? storyLineKey(view) : null;
  if (renderedStoryLine) presentStoryDialogue(state);
  storySkip.hidden = !visible || !view?.cinematic || !!line;
  storySkip.disabled = !!view?.cinematic?.skipRequested;
  storySkip.textContent = view?.cinematic?.skipRequested ? 'SCENE CONTINUING…' : 'SKIP SCENE';
  storyRestFade.hidden = !visible || view?.shelterAction?.kind !== 'rest';
  if (!storyRestFade.hidden)
    storyRestFade.style.opacity = String(Math.sin(Math.PI * view.shelterAction.progress) * 0.9);
}
function acknowledgeVisibleStory(view = storyView(state)) {
  const key = storyLineKey(view);
  if (!key || key !== renderedStoryLine || $('dialogue-panel').hidden) return false;
  acknowledgeStory(state);
  updateHud();
  return true;
}
storyContinue.addEventListener('click', () => {
  acknowledgeVisibleStory();
  $('screen').focus({ preventScroll: true });
});
storySkip.addEventListener('click', () => {
  skipStoryCinematic(state);
  $('screen').focus({ preventScroll: true });
});
function showStoryChoice(view = storyView(state)) {
  const choice = storyChoicePresentation(view);
  if (!choice) return false;
  promptedStoryChoice = `${view.missionId}:${view.stageId}:${view.attempt}`;
  info(choice.title, storyChoiceMarkup(choice), choice.eyebrow);
  $('info-dialog').dataset.storyPanel = 'choice';
  if (choice.id === 'outfit') $('info-dialog').dataset.storyChoice = 'outfit';
  for (const button of $('info-content').querySelectorAll('[data-story-option]'))
    button.addEventListener('click', () => {
      const result = selectStoryChoice(state, choice.id, button.dataset.storyOption);
      if (!result.ok) {
        announce(choice.error, true);
        return;
      }
      closeAllDialogs();
      updateHud();
    });
  $('info-content').querySelector('[data-story-option]')?.focus({ preventScroll: true });
  return true;
}
function isTwoSeatsIntervention(view) {
  return view?.active && view.missionId === 'LL-ST-003' && view.stageId === 'dispatch-threat';
}
function interventionObjective(view) {
  if (!isTwoSeatsIntervention(view)) return view?.objective;
  if (state.twoSeatsRuntime?.run?.disarm)
    return 'Keep the doorway clear and let both collectors leave. Stay with Felix.';
  const touch = matchMedia('(pointer: coarse)').matches,
    opening = state.player.counterWindow;
  if (opening?.attackerId === 'LL-ARC-DAX' && opening.expiresAt > state.time)
    return touch
      ? 'Face Dax. MORE → DISARM while he is exposed.'
      : 'Face Dax. Press Z to disarm while he is exposed.';
  if (WEAPONS[state.player.weapon]?.mode !== 'melee')
    return touch
      ? 'MORE → SWITCH WEAPON to Unarmed. Guard and disarm; keep the workers safe.'
      : 'Q: select Unarmed. Hold right mouse to guard, then Z after a block.';
  return touch
    ? 'Face Dax. MORE → GUARD ON; after a block, MORE → DISARM. Keep the workers safe.'
    : 'Face Dax. Hold right mouse to guard, then press Z after a block. Keep the workers safe.';
}
function showStoryFailure(view = storyView(state)) {
  if (!view?.failed) return false;
  promptedStoryFailure = `${view.missionId}:${view.attempt}:${view.failure?.sequence}`;
  const line = view.dialogue;
  info(
    `${view.title || 'The story'} isn’t over.`,
    `${line ? `<p class="story-failure-line"><b>${escapeHTML(line.speaker)}</b> ${escapeHTML(line.text)}</p>` : '<p>The journey was interrupted. Return to your last checkpoint or restart the assignment.</p>'}<div class="story-options"><button id="story-retry" class="primary-button">RETRY CHECKPOINT</button><button id="story-restart">RESTART ${escapeHTML(view.title?.toUpperCase() || 'ASSIGNMENT')}</button><button id="story-leave">RETURN TO THE CITY</button></div><p>Your last saved game is kept.</p>`,
    `${view.title?.toUpperCase() || 'STORY'} / JOURNEY INTERRUPTED`,
  );
  $('info-dialog').dataset.storyPanel = 'failure';
  $('story-retry').addEventListener('click', () => retryStoryFromUi('retry-last-checkpoint'));
  $('story-restart').addEventListener('click', () => retryStoryFromUi('restart-mission'));
  $('story-leave').addEventListener('click', () => {
    if (!leaveStory(state).ok) return;
    closeAllDialogs();
    syncScene(true);
    updateHud();
    announce(
      `${view.title || 'The assignment'} is unfinished. Retry it from your phone or journal.`,
    );
  });
  $('story-retry').focus({ preventScroll: true });
  return true;
}
function retryStoryFromUi(mode) {
  const result = retryStory(state, mode);
  if (!result.ok) {
    announce('The checkpoint could not be restored. Your saved game is kept.', true);
    return;
  }
  closeAllDialogs();
  syncScene(true);
  updateHud();
}
function storyRecoveryControls(view, prefix) {
  return view?.interrupted
    ? `<p>${escapeHTML(view.title || 'The assignment')} is unfinished. Retry its saved checkpoint, or restart from the beginning.</p><div class="story-options"><button id="${prefix}-story-retry" class="primary-button">RETRY LAST CHECKPOINT</button><button id="${prefix}-story-restart">RESTART ${escapeHTML(view.title?.toUpperCase() || 'ASSIGNMENT')}</button></div>`
    : '';
}
function bindStoryRecovery(prefix) {
  $(`${prefix}-story-retry`)?.addEventListener('click', () =>
    retryStoryFromUi('retry-last-checkpoint'),
  );
  $(`${prefix}-story-restart`)?.addEventListener('click', () =>
    retryStoryFromUi('restart-mission'),
  );
}
function updateStoryMenus(view) {
  if (mode !== 'play' || dialogs.some((dialog) => dialog.open)) return;
  if (
    view?.failed &&
    promptedStoryFailure !== `${view.missionId}:${view.attempt}:${view.failure?.sequence}`
  )
    showStoryFailure(view);
  else if (
    storyChoicePresentation(view) &&
    promptedStoryChoice !== `${view.missionId}:${view.stageId}:${view.attempt}`
  )
    showStoryChoice(view);
}
function showWardrobe(message = '') {
  info(
    'Something dry for tomorrow.',
    `${message ? `<p role="status">${escapeHTML(message)}</p>` : ''}<div class="story-options">${(state.wardrobe?.owned || []).map((id) => (OUTFITS[id] ? `<button data-outfit="${id}" aria-pressed="${state.wardrobe.equipped === id}"><b>${escapeHTML(OUTFITS[id].name)}</b><span>${escapeHTML(OUTFITS[id].description)}</span>${state.wardrobe.equipped === id ? '<small>WEARING</small>' : ''}</button>` : '')).join('')}</div>`,
    'DOCKSIDE ROOMS / WARDROBE',
  );
  $('info-dialog').dataset.storyPanel = 'wardrobe';
  for (const button of $('info-content').querySelectorAll('[data-outfit]'))
    button.addEventListener('click', () => {
      const result = chooseWardrobeOutfit(state, button.dataset.outfit);
      if (result.ok) {
        showWardrobe(`${OUTFITS[button.dataset.outfit].name} equipped.`);
        storeProgress();
      } else announce('Use the wardrobe inside Dockside Rooms to change.', true);
    });
  $('info-content')
    .querySelector(`[data-outfit="${state.wardrobe?.equipped}"]`)
    ?.focus({ preventScroll: true });
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
  game.paused = mode === 'play' && (document.hidden || dialogs.some((d) => d.open));
  setStoryPresentationVisibility(state, mode === 'play' && !game.paused && !document.hidden);
  renderCaptions();
  renderStoryPhone();
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
  const phoneFocused = $('story-phone-panel').contains(event.target);
  if (!open && isWarningPhone()) {
    if (event.code === 'KeyT' || (event.key === 'Escape' && storyPhoneExpanded)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') hideWarningPanel();
      else showPhone();
      return;
    }
    if (phoneFocused && event.code === 'KeyE') {
      event.preventDefault();
      event.stopPropagation();
      if (event.target.closest('button')) event.target.closest('button').click();
      else interactWithStoryPhone();
      return;
    }
    if (phoneFocused && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      const buttons = [...$('story-phone-panel').querySelectorAll('button')].filter(
        (b) => b.getClientRects().length && !b.closest('[hidden]'),
      );
      const direction = ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1;
      buttons[
        (buttons.indexOf(document.activeElement) + direction + buttons.length) % buttons.length
      ]?.focus({ preventScroll: true });
      return;
    }
    if (
      phoneFocused &&
      ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)
    )
      return;
  }
  const interactive = event.target?.closest?.('button,a,input,select');
  if (open || (interactive && interactive.getClientRects().length)) event.stopPropagation();
});
function pause() {
  if (mode === 'play') openDialog($('pause-dialog'));
}
function info(title, content, eyebrow = 'LOWLIGHT / FIELD NOTES') {
  delete $('info-dialog').dataset.storyPanel;
  delete $('info-dialog').dataset.storyChoice;
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
  } else state = createSimulation({ seed: 61, campaign: true });
  mode = 'play';
  document.body.dataset.mode = mode;
  $('title-screen').hidden = true;
  $('game-hud').hidden = false;
  $('screen').focus({ preventScroll: true });
  game.paused = false;
  game.cam.snap = true;
  game.focus(state.player.x, state.player.y, state.player.z || 0);
  game.cam.offset = matchMedia('(pointer: coarse)').matches ? [0, -25] : [0, 10];
  game.input.clear();
  lastHud = state.time - 1;
  lastSave = state.time;
  lastHealth = state.player.health;
  lastAttackSerial = state.player.attackSerial || 0;
  combatEffectsSeen.clear();
  touchCombat.crouch = touchCombat.aim = touchCombat.block = false;
  noticeHistory.clear();
  promptedStoryChoice = promptedStoryFailure = null;
  storyPhoneOwner = null;
  storyPhoneExpanded = false;
  renderedPhoneToken = null;
  displayedCameraEpoch = null;
  syncScene(true);
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
  game.lights.enabled = false;
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
  const story = storyView(state),
    arrival = FIRST_ARC_MISSIONS[0],
    finishedArrival = !!state.campaign?.completed?.[arrival.id],
    arrivalCard = state.campaign
      ? `<article class="journal-card"><span class="journal-status">${finishedArrival ? 'COMPLETED' : story?.failed ? 'INTERRUPTED' : story?.active ? 'ACTIVE' : 'UNFINISHED'} / FELIX VOSS</span><h3>${escapeHTML(arrival.title)}</h3><p>${escapeHTML(story?.active && story.missionId === arrival.id ? story.objective : arrival.premise)}</p></article>`
      : '',
    shelterNotes = state.storyInventory?.evidence.includes('co-op-arrears')
      ? '<article class="journal-card"><span class="journal-status">RECORDED / DOCKSIDE ROOMS</span><h3>Co-op arrears</h3><p>The ledger records unpaid reconstruction dispatch work. Nadia kept it at the shared room.</p></article>'
      : '',
    shelterKey = state.storyInventory?.keys.includes('dockside-tenancy')
      ? '<article class="journal-card"><span class="journal-status">KEY / DOCKSIDE ROOMS</span><h3>A place to return</h3><p>Nadia’s spare key opens the shared room. The kettle table, wardrobe and bed are here when you need them.</p></article>'
      : '';
  info(
    'Nothing comes free.',
    arrivalCard +
      storyRecoveryControls(story, 'journal') +
      (story?.missionId === 'LL-ST-002' || state.campaign?.completed?.['LL-ST-002']
        ? `<article class="journal-card"><span class="journal-status">${state.campaign.completed['LL-ST-002'] ? 'COMPLETED' : story.failed || story.interrupted ? 'INTERRUPTED' : 'ACTIVE'} / FELIX VOSS</span><h3>Late Meter</h3><p>${escapeHTML(story.missionId === 'LL-ST-002' && !state.campaign.completed['LL-ST-002'] ? story.objective : FIRST_ARC_MISSIONS[1].premise)}</p></article>`
        : '') +
      (story?.availableAssignment
        ? `<article class="journal-card"><span class="journal-status">FELIX VOSS / DISPATCH</span><h3>${escapeHTML(story.availableAssignment.title)}</h3><p>${escapeHTML(story.availableAssignment.objective)}</p></article>`
        : '') +
      shelterNotes +
      shelterKey +
      MISSIONS.map(
        (m) =>
          `<article class="journal-card"><span class="journal-status">${state.progress.completed.includes(m.id) ? 'COMPLETED' : state.mission?.id === m.id ? 'ACTIVE' : story?.active || story?.failed || story?.interrupted || (m.prerequisite && !state.progress.completed.includes(m.prerequisite)) ? 'LOCKED' : 'AVAILABLE'} / ${escapeHTML(m.contact)}</span><h3>${escapeHTML(m.title)}</h3><p>${escapeHTML(m.summary)}</p></article>`,
      ).join(''),
    'LOWLIGHT / JOURNAL',
  );
  if (story?.interrupted) $('info-dialog').dataset.storyPanel = 'recovery';
  bindStoryRecovery('journal');
}
$('pause-journal').addEventListener('click', showJournal);
function showPhone() {
  const story = storyView(state);
  if (isWarningPhone(story)) {
    const fromMenu = dialogs.some((dialog) => dialog.open);
    closeAllDialogs();
    storyPhoneExpanded = fromMenu || !storyPhoneExpanded;
    renderStoryPhone(story);
    $('screen').focus({ preventScroll: true });
    return;
  }
  const contact = state.mission
    ? MISSIONS.find((m) => m.id === state.mission.id)?.contact
    : 'Felix Voss';
  info(
    'One missed call.',
    `<p class="credit-title">${escapeHTML(contact || 'VOSS DISPATCH')}</p>${story?.interrupted ? storyRecoveryControls(story, 'phone') : `<p>${escapeHTML(story?.active ? story.objective : story?.availableAssignment?.objective || state.mission?.objective || 'The taxi rank has work if you need cash. Keep in touch with the people who helped you get here.')}</p>`}<button id="phone-journal" class="primary-button">OPEN JOURNAL <span>↗</span></button>${railPassenger(state) ? '<button id="phone-metro" class="primary-button">CHOOSE A METRO STOP</button>' : ''}<p>Voss Dispatch · Saira’s Garage · Southbank Clinic · Signal House</p>`,
    'LOWLIGHT / PHONE',
  );
  if (story?.interrupted) $('info-dialog').dataset.storyPanel = 'recovery';
  bindStoryRecovery('phone');
  $('phone-journal').addEventListener('click', showJournal);
  $('phone-metro')?.addEventListener('click', showMetroStops);
}
function showMetroStops() {
  const rider = railPassenger(state);
  if (!rider) return;
  const train = state.transit.trains.find((train) => train.id === rider.trainId),
    service = WORLD.transit.throughServices.find((service) => service.id === train.serviceId);
  info(
    service.name,
    `<p>Choose a served stop. The train keeps its normal route; leave through open doors when you arrive. Current fare: $${quoteTransitFare(state.transit, rider.id)?.amount || 0}.</p><div class="action-shelf">${service.calls
      .map((call) => {
        const station = WORLD.transit.stations.find((station) => station.id === call.stationId);
        const platform = station.platforms.find((platform) => platform.id === call.platformId);
        const repeated = service.calls.some(
          (other) => other !== call && other.stationId === call.stationId,
        );
        const level =
          platform.role === 'upper'
            ? 'Upper platform'
            : platform.role === 'lower'
              ? 'Lower platform'
              : platform.z < 0
                ? 'Subway platform'
                : 'Elevated platform';
        const name = repeated ? `${station.name} · ${level}` : station.name;
        return `<button data-metro-stop="${call.stationId}" data-metro-platform="${call.platformId}">${escapeHTML(name)}</button>`;
      })
      .join('')}</div>`,
    'HARBOR METRO',
  );
  for (const button of $('info-content').querySelectorAll('[data-metro-stop]'))
    button.addEventListener('click', () => {
      const result = selectMetroStop(state, button.dataset.metroStop, button.dataset.metroPlatform);
      if (result.ok) {
        closeAllDialogs();
        announce('Metro stop selected.');
      }
    });
}
function showWeaponShop(message = '') {
  updateHud();
  const store = getEquipmentStore(state);
  if (!store) {
    info('No counter within reach.', '<p>Visit an equipment counter to buy supplies.</p>');
    return;
  }
  const available = store.weaponIds.map((id) => [id, WEAPONS[id]]).filter(([, weapon]) => weapon);
  info(
    'Tools of the trade.',
    `${message ? `<p role="status" class="shop-message">${escapeHTML(message)}</p>` : ''}<p>Available cash: $${state.player.money.toLocaleString()}. One weapon per class can be carried; owned equipment can be re-equipped here.</p><div class="weapon-catalogue">${available
      .map(([id, w]) => {
        const repeat = store.repeatPurchase.includes(id),
          owned = state.player.ownedWeapons.includes(id);
        return `<article class="weapon-card"><div><h3>${escapeHTML(w.name)}</h3><p>${escapeHTML(w.class.toUpperCase())} · ${w.mode === 'melee' ? (w.windup > 0.2 ? 'HEAVY SWING' : 'QUICK STRIKE') : `CAPACITY ${w.clipSize}`} · ${owned && !repeat ? 'OWNED' : `$${equipmentPrice(state, id)}${repeat ? ' / EACH' : ''}`}</p></div><button data-buy-weapon="${id}">${owned && !repeat ? 'EQUIP' : 'BUY'}</button>${store.ammoIds.includes(id) && owned ? `<button class="ammo-purchase" data-buy-ammo="${id}">AMMUNITION / $${w.ammoCost}</button>` : ''}</article>`;
      })
      .join('')}</div>`,
    store.name,
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
  if (!full && currentSceneId(state)) {
    roomMap.draw(g, state, { width, height });
    const target = storyTarget();
    if (target && inScene(target, currentSceneId(state))) {
      const point = createRoomMapProjection(interiorScene(state).room, width, height).project(
        target.x,
        target.y,
      );
      g.strokeStyle = '#e7c875';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(...point, 6, 0, Math.PI * 2);
      g.stroke();
    }
    return;
  }
  const origin = exteriorMapPosition(state);
  const projection = createMapProjection(WORLD, width, height, { full, center: origin });
  const { scale, project: pt } = projection;
  mapBackground.draw(g, projection);
  const campaignDestination = exteriorStoryTarget();
  const destination = [state.waypoint, campaignDestination, state.mission?.target].find(
    (target) => target && inScene(target, null),
  );
  if (destination) {
    const route = findRoute(
        WORLD,
        { x: origin.x, y: origin.y, z: origin.groundZ ?? origin.z ?? 0 },
        destination,
        {
          mode: state.player.vehicleId ? 'car' : 'foot',
          includeZ: true,
        },
      ),
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
  if (
    campaignDestination &&
    campaignDestination !== destination &&
    inScene(campaignDestination, null)
  ) {
    const point = pt(campaignDestination.x, campaignDestination.y);
    g.strokeStyle = '#e7c875';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(...point, full ? 8 : 5, 0, Math.PI * 2);
    g.stroke();
  }
  if (state.wanted.level) {
    g.strokeStyle = '#d2876477';
    g.lineWidth = 1;
    g.beginPath();
    const searchPoint =
      !inScene(state.wanted.lastSeen, null) && state.interior?.active
        ? origin
        : state.wanted.lastSeen;
    g.arc(...pt(searchPoint.x, searchPoint.y), state.wanted.searchRadius * scale, 0, Math.PI * 2);
    g.stroke();
    for (const officer of state.police) {
      if (officer.health <= 0 || officer.inVehicle || !inScene(officer, null)) continue;
      const q = pt(officer.x, officer.y);
      g.fillStyle = '#ce8a70';
      g.fillRect(q[0] - 2, q[1] - 2, 4, 4);
    }
    for (const vehicle of state.vehicles) {
      if (!vehicle.policeControlled || vehicle.health <= 0 || !inScene(vehicle, null)) continue;
      const q = pt(vehicle.x, vehicle.y);
      g.fillStyle = '#91b7c4';
      g.fillRect(q[0] - 3, q[1] - 3, 6, 6);
    }
    for (const craft of state.policeAircraft || []) {
      if (craft.health <= 0 || !inScene(craft, null)) continue;
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
  const p = pt(origin.x, origin.y);
  g.save();
  g.translate(...p);
  g.rotate(origin.angle + Math.PI / 2);
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
  mapCursor = {
    ...([state.waypoint, exteriorStoryTarget(), state.mission?.target].find(
      (target) => target && inScene(target, null),
    ) || exteriorMapPosition(state)),
  };
  $('map-dialog').querySelector('.map-instruction').textContent =
    `${currentSceneId(state) ? `You are inside ${interiorScene(state).room.name}. Routes begin at the entrance. ` : ''}${mapInstructions}`;
  openDialog($('map-dialog'));
  drawMap($('city-map'), true);
}
$('pause-map').addEventListener('click', showMap);
const mapInstructions =
  'Select a street, or use arrow keys and Enter, to set a waypoint. Paths are green; rail is gray; elevated roads are pale gold; tunnels are dashed blue; closed crossings are dashed red.';
$('map-dialog').querySelector('.map-instruction').textContent = mapInstructions;
$('city-map').addEventListener('click', (event) => {
  const cv = event.currentTarget,
    rect = cv.getBoundingClientRect();
  const { x, y } = createMapProjection(WORLD, cv.width, cv.height, {
    full: true,
    center: exteriorMapPosition(state),
  }).unproject(
    ((event.clientX - rect.left) * cv.width) / rect.width,
    ((event.clientY - rect.top) * cv.height) / rect.height,
  );
  if (x >= 0 && x <= WORLD.width && y >= 0 && y <= WORLD.height) {
    const snapped = snapToRoad(
      WORLD,
      { x, y, z: exteriorMapPosition(state).groundZ ?? exteriorMapPosition(state).z ?? 0 },
      { mode: state.player.vehicleId ? 'car' : 'foot', includeZ: true },
    );
    if (snapped)
      state.waypoint = {
        x: snapped.x,
        y: snapped.y,
        z: snapped.z,
        name: 'Your waypoint',
        radius: 15,
      };
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
    mapCursor = { x: exteriorMapPosition(state).x, y: exteriorMapPosition(state).y };
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const snapped = snapToRoad(
      WORLD,
      { ...mapCursor, z: exteriorMapPosition(state).groundZ ?? exteriorMapPosition(state).z ?? 0 },
      { mode: state.player.vehicleId ? 'car' : 'foot', includeZ: true },
    );
    if (snapped)
      state.waypoint = {
        x: snapped.x,
        y: snapped.y,
        z: snapped.z,
        name: 'Your waypoint',
        radius: 15,
      };
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
    definition = WEAPONS[p.weapon],
    room = interiorScene(state)?.room,
    story = storyView(state),
    storyActive = story?.active || story?.failed || story?.interrupted,
    arrivalTaxi =
      story?.active && story.requiredVehicleId === p.vehicleId ? currentVehicle(state) : null;
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
  const metro = railPassenger(state);
  $('weapon-name').textContent = metro
    ? 'HARBOR METRO'
    : p.swimming
      ? p.stamina < 30
        ? 'SWIMMING / FLOAT TO REST'
        : 'SWIMMING'
      : p.vehicleId
        ? VEHICLE_SPECS[currentVehicle(state)?.spec]?.name || 'VEHICLE'
        : definition.name;
  $('ammo').innerHTML = metro
    ? `$${quoteTransitFare(state.transit, metro.id)?.amount || 0} <small>FARE</small>`
    : p.swimming
      ? `${Math.max(0, Math.round(p.stamina))}% <small>STAMINA</small>`
      : arrivalTaxi && definition.mode === 'melee'
        ? `${Math.max(0, Math.round((arrivalTaxi.health / (arrivalTaxi.maxHealth || VEHICLE_SPECS[arrivalTaxi.spec].health)) * 100))}% <small>VEHICLE</small>`
        : definition.mode === 'melee'
          ? '<small>READY</small>'
          : `${ammo.clip} <small>/ ${ammo.reserve}</small>`;
  $('ammo').style.whiteSpace = p.swimming ? 'nowrap' : '';
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
  $('mission-name').textContent =
    (storyActive && story.title) ||
    story?.availableAssignment?.title ||
    state.mission?.title ||
    room?.name ||
    'The city is yours.';
  $('mission-objective').textContent =
    (story?.interrupted
      ? `${story.title || 'The assignment'} is unfinished. Open the phone or journal to retry or restart.`
      : story?.failed
        ? 'The journey was interrupted. Press USE or E for your checkpoint options.'
        : story?.active
          ? interventionObjective(story)
          : story?.availableAssignment?.objective) ||
    state.mission?.objective ||
    (room
      ? 'Choose a service or open the door to leave.'
      : 'Find a job, take a fare, or explore Harbor City.');
  const missionLabel = $('mission-name').parentElement.querySelector('.mission-label');
  const labelMode = storyActive
    ? 'story'
    : story?.availableAssignment
      ? 'assignment'
      : room && !state.mission
        ? 'place'
        : 'job';
  if (missionLabel.dataset.mode !== labelMode) {
    for (const node of missionLabel.childNodes)
      if (node.nodeType === Node.TEXT_NODE)
        node.textContent =
          labelMode === 'story'
            ? ' CURRENT STORY'
            : labelMode === 'assignment'
              ? ' NEXT ASSIGNMENT'
              : labelMode === 'place'
                ? ' CURRENT PLACE'
                : ' CURRENT JOB';
    missionLabel.dataset.mode = labelMode;
  }
  const rawStoryTarget = storyTarget(story),
    campaignTarget =
      rawStoryTarget?.sceneId && !inScene(rawStoryTarget, currentSceneId(state))
        ? exteriorStoryTarget()
        : rawStoryTarget,
    target = campaignTarget || state.waypoint || state.mission?.target;
  const targetOrigin =
    target && !inScene(target, currentSceneId(state)) ? exteriorMapPosition(state) : p;
  $('mission-distance').textContent = target
    ? `${Math.round(Math.hypot(targetOrigin.x - target.x, targetOrigin.y - target.y))} m / ${target.name || 'Destination'}${currentSceneId(state) && targetOrigin !== p ? ' / FROM ENTRANCE' : ''}`
    : state.wanted.level
      ? state.wanted.status.toUpperCase()
      : '';
  if (arrivalTaxi && story.stageId === 'taxi')
    $('mission-distance').textContent = matchMedia('(pointer: coarse)').matches
      ? 'STICK TO DRIVE / RUN TO BRAKE'
      : 'WASD OR LEFT STICK / SHIFT OR LT TO BRAKE';
  if (
    arrivalTaxi &&
    story.stageId === 'drill' &&
    story.route?.index === 1 &&
    target &&
    Math.hypot(p.x - target.x, p.y - target.y) <= target.radius
  ) {
    const stop = FIRST_ARC_MISSIONS[0].stages.find((stage) => stage.id === 'drill').route.stops[0];
    $('mission-distance').textContent =
      `MUSTER STOP / ${Math.min(stop.seconds, story.route.dwell).toFixed(1)} OF ${stop.seconds} s / ${matchMedia('(pointer: coarse)').matches ? 'RUN' : 'SHIFT OR LT'} TO BRAKE`;
  }
  const { areaName, districtName } = mapBackground.place(state);
  const placeName = room?.name || state.place?.name || areaName || districtName;
  const travelMode = metro
    ? 'METRO'
    : p.swimming
      ? 'SWIMMING'
      : p.vehicleId
        ? 'DRIVING'
        : 'ON FOOT';
  $('district-name').textContent = placeName.toUpperCase();
  $('district-announcement').querySelector('span').textContent = room
    ? 'INDOORS'
    : districtName.toUpperCase();
  $('street-name').textContent = `${placeName.toUpperCase()} / ${travelMode}`;
  Object.assign($('street-name').style, {
    minWidth: '0',
    maxWidth: 'calc(100% - 34px)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  });
  const swimHint = p.swimming
    ? ` Stamina ${Math.round(p.stamina)} percent. Hold RUN to swim faster. Float without moving to rest and regain stamina.`
    : '';
  $('street-name').title =
    `${placeName}, ${districtName} / ${travelMode}.${room ? ' The city map shows your entrance.' : ''}${swimHint}`;
  $('minimap').setAttribute(
    'aria-label',
    room
      ? `Room plan: ${room.name}. Walls, furniture, doors, services and occupants.`
      : `Local street map: ${placeName}, ${districtName}. ${travelMode}.${swimHint}`,
  );
  const legend = $('minimap').parentElement.querySelector('.map-legend');
  const legendMode = room ? 'room' : 'city';
  if (legend.dataset.scene !== legendMode) {
    for (const node of [...legend.childNodes]) if (node.nodeType === Node.TEXT_NODE) node.remove();
    legend.append(document.createTextNode(room ? ' EXITS AND SERVICES' : ' YOUR DESTINATION'));
    legend.dataset.scene = legendMode;
  }
  const hour = Math.floor(state.clock),
    minute = Math.floor((state.clock - hour) * 60);
  $('game-clock').textContent =
    `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const candidate = nearestInteractable(state);
  const choice = storyChoicePresentation(story),
    choiceReady = !!choice;
  $('context-prompt').hidden =
    (!candidate && !story?.failed && !choiceReady) ||
    !!(state.dialogue || story?.dialogue || story?.ambient || story?.cinematic);
  if (story?.failed) $('context-text').textContent = 'Checkpoint options';
  else if (choiceReady) $('context-text').textContent = choice.prompt;
  else if (candidate) $('context-text').textContent = candidate.prompt || candidate.name;
  renderCaptions(story);
  renderStoryPhone(story);
  if (story?.missionId === 'LL-ST-002' && story.stageId === 'extract')
    $('mission-distance').textContent = story.pursuit?.escape
      ? 'SIGHT BROKEN'
      : story.pursuit?.lastSeen
        ? `BREAK SIGHT / ${Math.min(10, story.pursuit.unseenSeconds).toFixed(1)} OF 10 s UNSEEN`
        : 'LET FELIX BOARD / WATCH THE COLLECTORS';
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
  const warningPanel = !$('story-phone-panel').hidden ? $('story-phone-panel') : null;
  const menu = open || (mode === 'title' ? $('title-screen') : warningPanel);
  if (menu) {
    const items = Array.from(
      menu.querySelectorAll('button:not(:disabled),a,input,select,canvas[tabindex]'),
    ).filter((item) => item.getClientRects().length && !item.closest('[hidden]'));
    const focused = document.activeElement;
    const direction =
      pad.buttons[13]?.pressed || (!warningPanel && pad.axes[1] > 0.5)
        ? 1
        : pad.buttons[12]?.pressed || (!warningPanel && pad.axes[1] < -0.5)
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
      if (pressed(0) && items.length && (!warningPanel || warningPanel.contains(focused))) {
        const selected = items.includes(document.activeElement) ? document.activeElement : items[0];
        selected.focus();
        if (selected.tagName === 'BUTTON' || selected.tagName === 'A') selected.click();
      }
    }
    padDirection = direction;
    if (pressed(1) && open) closeDialog(open);
    else if (pressed(1) && warningPanel) hideWarningPanel();
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
    if (syncScene()) {
      updateHud();
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
      const story = storyView(state);
      if (isWarningPhone(story)) {
        if (!$('story-phone-panel').contains(document.activeElement)) interactWithStoryPhone();
      } else {
        if (story?.failed) {
          showStoryFailure(story);
          return;
        }
        if (showStoryChoice(story)) return;
        if (story?.dialogue || story?.ambient) {
          acknowledgeVisibleStory(story);
          renderCaptions();
        } else {
          const candidate = nearestInteractable(state);
          if (candidate?.type === 'weapons') {
            showWeaponShop();
            return;
          }
          const result = interact(state);
          game.audio.sfx('select');
          if (processInteraction(result)) return;
        }
      }
    }
    const phonePadNavigation =
      !$('story-phone-panel').hidden &&
      ['Pad12', 'Pad13', 'Pad14', 'Pad15'].some((code) => input.held.has(code));
    const requestedMovement =
      touch.id !== null ? [touch.x, touch.y] : phonePadNavigation ? input.padMove : input.move();
    if (sceneMovementBlocked && Math.hypot(...(input.padMove || [0, 0])) < 0.15)
      sceneMovementBlocked = false;
    const movement = sceneMovementBlocked ? [0, 0] : requestedMovement;
    const ground = game.view.screenDirToGround(...movement);
    let aimAngle, aimTarget;
    const sceneId = currentSceneId(state);
    const people = scenePeople(state);
    const targetable = [
      ...people.filter(
        (actor) =>
          sceneId ||
          state.hostiles.includes(actor) ||
          state.police.includes(actor) ||
          state.companions?.actors.includes(actor),
      ),
      ...(state.policeAircraft || []).filter((actor) => inScene(actor, sceneId)),
    ].filter(
      (actor) =>
        actor.health > 0 && !actor.inVehicle && (actor.z || 0) < 0 === (state.player.z || 0) < 0,
    );
    const padAim = input.padAim;
    if (padAim) {
      const worldAim = game.view.screenDirToGround(...padAim);
      aimAngle = Math.atan2(worldAim[1], worldAim[0]);
    } else if (input.mouse.active && input.aimSource === 'mouse') {
      const pointer = input.mouseScreen(),
        heightOffset = game.view.p(0, 0, state.player.z || 0),
        mouse = pointer
          ? game.view.toGround(pointer[0] - heightOffset[0], pointer[1] - heightOffset[1])
          : null;
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
        if (hovered) {
          aimAngle = Math.atan2(hovered.actor.y - state.player.y, hovered.actor.x - state.player.x);
          aimTarget = { x: hovered.actor.x, y: hovered.actor.y, z: hovered.z };
        }
      }
    } else if (input.down('fire') || input.pressed('fire')) {
      const enemies = targetable
        .filter(
          (e) =>
            e.kind === 'hostile' ||
            state.hostiles.includes(e) ||
            isNamedHostile(state, e.id) ||
            ((['police', 'air-search'].includes(e.kind) || e.role === 'air-search') &&
              state.wanted.level >= 2),
        )
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
      cover: input.pressed('cover') && $('story-phone-panel').hidden,
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
    if (syncScene()) {
      updateHud();
      return;
    }
    const story = storyView(state),
      sceneCamera = story?.cinematic,
      cameraEpoch = `${story?.cameraEpoch ?? 0}:${sceneCamera?.epoch ?? 0}`;
    state.player.firing =
      !sceneCamera && !story?.shelterAction && (input.down('fire') || input.pressed('fire'));
    if (displayedCameraEpoch !== cameraEpoch) {
      displayedCameraEpoch = cameraEpoch;
      game.cam.snap = true;
    }
    const zoom =
      sceneCamera?.zoom || (state.player.scoped ? WEAPONS[state.player.weapon].scopeZoom || 1 : 1);
    if (game.zoom !== zoom) game.setZoom(zoom);
    const vehicle = currentVehicle(state);
    const sceneFocus = sceneCamera?.focus;
    game.focus(
      sceneFocus?.x ??
        state.player.x + (vehicle ? Math.cos(vehicle.angle) * vehicle.speed * 0.14 : 0),
      sceneFocus?.y ??
        state.player.y + (vehicle ? Math.sin(vehicle.angle) * vehicle.speed * 0.14 : 0),
      sceneFocus?.z ?? state.player.z ?? 0,
    );
    if (state.player.health < lastHealth) {
      game.hitFx(state.player.x, state.player.y, (state.player.z || 0) + 15, {
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
          inScene(car, currentSceneId(state)) &&
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
      if (!inScene(effect, currentSceneId(state))) continue;
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
      inScene(state.waypoint, currentSceneId(state)) &&
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
    const story = storyView(state);
    renderCaptions(story);
    renderStoryPhone(story);
    updateStoryMenus(story);
    if (mode === 'play' && currentSceneId(state)) roomRenderer.draw(r, state);
    else {
      renderer.draw(r, metroRenderer.renderPlayer(state), {
        title: mode === 'title',
        rain: settings.rain && !settings.reduceMotion,
      });
      metroRenderer.draw(r, state);
    }
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
    storyView: () => storyView(state),
    start,
    interact: () => {
      const result = interact(state);
      processInteraction(result);
      return result;
    },
    update: (dt) => updateSimulation(state, dt),
    save: () => saveGame(state),
    restore: (value) => {
      state = restoreGame(value);
      syncScene(true);
      updateHud();
    },
    refresh: updateHud,
    mapStats: () => mapBackground.stats(),
    roomMapStats: () => roomMap.stats(),
    roomRendererStats: () => ({ ...roomRenderer.stats }),
    railRendererStats: () => ({ ...metroRenderer.stats }),
  };
}
