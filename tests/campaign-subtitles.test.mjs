import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startSubtitleSequence,
  presentSubtitle,
  tickSubtitles,
  subtitleLine,
  subtitleFinished,
  advanceSubtitle,
  validateSubtitles,
} from '../src/campaign/subtitles.js';
test('ambient dialogue cannot complete on a timer until each real line has been presented', () => {
  const s = { time: 0 };
  startSubtitleSequence(s, 'night-crossing-drill-ambient', 'ambient:1', [
    { speaker: 'Felix', text: 'The water is beautiful.' },
    { speaker: 'Mara', text: 'Until it reaches your door.' },
  ]);
  for (let i = 0; i < 100; i++) tickSubtitles(s, 0.5);
  assert.equal(subtitleLine(s).index, 0);
  assert.equal(subtitleFinished(s, 'night-crossing-drill-ambient', 'ambient:1'), false);
  presentSubtitle(s, 'ambient:1', 0);
  for (let i = 0; i < 10; i++) tickSubtitles(s, 0.5);
  assert.equal(subtitleLine(s).index, 1);
  assert.equal(advanceSubtitle(s, { acknowledged: true }), false);
  presentSubtitle(s, 'ambient:1', 1);
  assert.equal(advanceSubtitle(s, { acknowledged: true }), true);
  assert.equal(subtitleFinished(s, 'night-crossing-drill-ambient', 'ambient:1'), true);
  assert.equal(
    startSubtitleSequence(s, 'night-crossing-drill-ambient', 'ambient:1', [
      { speaker: 'Felix', text: 'Repeat' },
    ]).replayed,
    true,
  );
});
test('hidden dialogue waits and a mid-line save preserves its remaining presentation', () => {
  const s = { time: 4 };
  startSubtitleSequence(s, 'ride', 'ride:1', [
    { speaker: 'Felix', text: 'This is a longer line about the route.' },
  ]);
  presentSubtitle(s, 'ride:1', 0);
  tickSubtitles(s, 0.5);
  const before = s.subtitles.active.elapsed;
  tickSubtitles(s, 0.5, { visible: false });
  assert.equal(s.subtitles.active.elapsed, before);
  const continued = JSON.parse(JSON.stringify(s));
  validateSubtitles(continued);
  for (let i = 0; i < 20; i++) {
    tickSubtitles(s, 0.5);
    tickSubtitles(continued, 0.5);
  }
  assert.deepEqual(continued, s);
});
