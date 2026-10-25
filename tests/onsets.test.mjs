import test from 'node:test';
import assert from 'node:assert/strict';
import { detectOnsets } from '../js/dsp/onsets.js';
import { renderPerformance, makeRng } from '../js/dsp/synth.js';

function check({ sampleRate, bpm, subdivision, count, midiAt, jitterMs = 0, seed = 3 }) {
  const rng = makeRng(seed);
  const step = 60 / bpm / subdivision;
  const notes = Array.from({ length: count }, (_, i) => ({
    time: 0.5 + i * step + ((rng() * 2 - 1) * jitterMs) / 1000,
    midi: midiAt(i),
    gainDb: -rng() * 6,
  }));
  const x = renderPerformance({ sampleRate, duration: notes[count - 1].time + 0.8, notes, seed });
  const onsets = detectOnsets(x, sampleRate, { prerollSec: 0.4 });
  assert.equal(onsets.length, count, `cần ${count} onset, tìm được ${onsets.length}`);
  const errors = onsets.map((s, i) => (s / sampleRate - notes[i].time) * 1000);
  const worst = Math.max(...errors.map(Math.abs));
  assert.ok(worst < 4, `sai số lớn nhất ${worst.toFixed(2)} ms`);
}

test('Bắt đủ và đúng thời điểm khi gảy lặp lại một dây buông (nốt đen 60 BPM)', () => {
  check({ sampleRate: 48000, bpm: 60, subdivision: 1, count: 12, midiAt: () => 28 });
});

test('Bắt đủ nốt móc đơn 100 BPM có lệch nhịp ngẫu nhiên', () => {
  check({ sampleRate: 44100, bpm: 100, subdivision: 2, count: 24, midiAt: (i) => [33, 35, 36, 38][i % 4], jitterMs: 40 });
});

test('Bắt đủ khi chuyển dây liên tục (chromatic)', () => {
  check({ sampleRate: 48000, bpm: 80, subdivision: 2, count: 32, midiAt: (i) => 28 + 5 + (i % 16), jitterMs: 20, seed: 9 });
});

test('Không báo onset khi chỉ có nhiễu nền', () => {
  const x = renderPerformance({ sampleRate: 48000, duration: 2, notes: [] });
  assert.deepEqual(detectOnsets(x, 48000), []);
});
