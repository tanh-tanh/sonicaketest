import test from 'node:test';
import assert from 'node:assert/strict';
import { yin, downsample2 } from '../js/dsp/yin.js';
import { renderPerformance } from '../js/dsp/synth.js';
import { midiToFreq, centsFrom } from '../js/music.js';
import { readPitch } from '../js/tuner.js';

const NOTES = [28, 29, 33, 38, 43, 45, 50, 55]; // E1, F1, A1, D2, G2, A2, D3, G3

for (const sampleRate of [44100, 48000]) {
  test(`YIN nhận đúng cao độ các nốt bass ở ${sampleRate} Hz`, () => {
    for (const midi of NOTES) {
      const x = renderPerformance({ sampleRate, duration: 0.5, notes: [{ time: 0.01, midi }] });
      const win = x.subarray(Math.round(0.05 * sampleRate), Math.round(0.05 * sampleRate) + Math.round(0.064 * sampleRate));
      const r = yin(win, sampleRate);
      assert.ok(r, `không nhận được nốt ${midi}`);
      const cents = centsFrom(r.freq, midi);
      assert.ok(Math.abs(cents) < 5, `nốt ${midi}: lệch ${cents.toFixed(1)} cent`);
    }
  });
}

test('YIN vẫn chính xác sau khi giảm tần số lấy mẫu 2 lần', () => {
  const sampleRate = 48000;
  for (const midi of NOTES) {
    const x = renderPerformance({ sampleRate, duration: 0.5, notes: [{ time: 0.01, midi }] });
    const half = downsample2(x.subarray(Math.round(0.05 * sampleRate), Math.round(0.05 * sampleRate) + Math.round(0.064 * sampleRate)));
    const r = yin(half, sampleRate / 2);
    assert.ok(r);
    assert.ok(Math.abs(centsFrom(r.freq, midi)) < 5);
  }
});

test('YIN trả về null khi im lặng', () => {
  assert.equal(yin(new Float32Array(4096), 48000), null);
});

test('Tuner đọc được độ lệch cent khi dây hơi chùng', () => {
  const sampleRate = 48000;
  const x = renderPerformance({ sampleRate, duration: 0.6, notes: [{ time: 0.01, midi: 33, cents: -20 }] });
  const n = Math.round(0.085 * sampleRate);
  const reading = readPitch(x.subarray(Math.round(0.1 * sampleRate), Math.round(0.1 * sampleRate) + n), sampleRate);
  assert.ok(reading);
  assert.equal(reading.name, 'A1');
  assert.ok(Math.abs(reading.cents + 20) < 3, `cents = ${reading.cents}`);
  assert.ok(Math.abs(reading.freq - midiToFreq(33 - 0.2)) < 0.3);
});
