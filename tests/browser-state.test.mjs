import test from 'node:test';
import assert from 'node:assert/strict';
import { readBrowserState, SAVE_KEY, SETTINGS_KEY } from '../src/browser-state.js';

const savedGame = '{"version":1,"state":{"progress":"previous story"}}';
const defaults = { volume: 0.4, rain: true, reduceMotion: false, camera: 'city' };
const reader = (preferences) => (key) => (key === SAVE_KEY ? savedGame : preferences);

test('damaged preferences do not hide or change the existing save', () => {
  const result = readBrowserState(reader('{broken'));
  assert.equal(result.saved, savedGame);
  assert.deepEqual(result.settings, defaults);
});

test('preferences and game reads fail independently, including denied browser storage', () => {
  for (const denied of [[SETTINGS_KEY], [SAVE_KEY], [SETTINGS_KEY, SAVE_KEY]]) {
    const result = readBrowserState((key) => {
      if (denied.includes(key)) throw new Error('Storage unavailable');
      return reader('{"volume":0.7}')(key);
    });
    assert.equal(result.saved, denied.includes(SAVE_KEY) ? null : savedGame);
    assert.equal(result.settings.volume, denied.includes(SETTINGS_KEY) ? 0.4 : 0.7);
  }
});

test('valid zero and false preferences remain valid and override system motion preference', () => {
  const settings = { volume: 0, rain: false, reduceMotion: false, camera: 'topdown' };
  const result = readBrowserState(reader(JSON.stringify(settings)), { reduceMotion: true });
  assert.deepEqual(result.settings, settings);
  assert.equal(result.saved, savedGame);
});

test('non-object preferences use defaults and preserve the system motion preference', () => {
  for (const preferences of [null, '', 'null', '[]', '42', 'true', '"settings"']) {
    const result = readBrowserState(reader(preferences), { reduceMotion: true });
    assert.deepEqual(result.settings, { ...defaults, reduceMotion: true });
    assert.equal(result.saved, savedGame);
  }
});

test('invalid preference types and unknown keys cannot reach the audio or camera controls', () => {
  for (const volume of ['null', '"loud"', '{}', '1e309']) {
    const result = readBrowserState(
      reader(
        `{"volume":${volume},"rain":"false","reduceMotion":0,"camera":"unknown","extra":true,"__proto__":{"volume":1}}`,
      ),
    );
    assert.deepEqual(result.settings, defaults);
    assert.equal(Object.getPrototypeOf(result.settings), Object.prototype);
    assert.equal(result.saved, savedGame);
  }
});

test('finite volume values stay within the supported audio range', () => {
  for (const [volume, expected] of [
    [-1, 0],
    [0.17, 0.17],
    [2, 1],
  ]) {
    assert.equal(readBrowserState(reader(JSON.stringify({ volume }))).settings.volume, expected);
  }
});
