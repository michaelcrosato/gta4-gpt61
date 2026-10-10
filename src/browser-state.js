export const SAVE_KEY = 'lowlight.save.v1';
export const SETTINGS_KEY = 'lowlight.settings.v1';

/** Read optional preferences without hiding an independently stored game. */
export function readBrowserState(read, { reduceMotion = false } = {}) {
  const settings = { volume: 0.4, rain: true, reduceMotion, camera: 'city' };
  let saved = null;
  try {
    const value = JSON.parse(read(SETTINGS_KEY) || 'null');
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (Number.isFinite(value.volume)) settings.volume = Math.max(0, Math.min(1, value.volume));
      if (typeof value.rain === 'boolean') settings.rain = value.rain;
      if (typeof value.reduceMotion === 'boolean') settings.reduceMotion = value.reduceMotion;
      if (['city', 'topdown'].includes(value.camera)) settings.camera = value.camera;
    }
  } catch {
    // Damaged or unavailable preferences use the defaults.
  }
  try {
    saved = read(SAVE_KEY);
  } catch {
    // Storage can be unavailable; a new game must still work.
  }
  return { settings, saved };
}
