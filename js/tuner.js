// Logic lên dây (không đụng tới giao diện, nên test được trong Node).

import { yin, downsample2 } from './dsp/yin.js';
import { freqToMidi, noteName, OPEN_MIDI, STRINGS } from './music.js';

/** Số mẫu cần cho một lần đọc cao độ (đủ cho dây E trầm). */
export function tunerWindowSize(sampleRate) {
  return Math.round(0.085 * sampleRate);
}

/**
 * @returns {{freq:number, midi:number, nearest:number, name:string, cents:number, confidence:number} | null}
 */
export function readPitch(samples, sampleRate) {
  const half = sampleRate > 30000;
  const data = half ? downsample2(samples) : samples;
  const rate = half ? sampleRate / 2 : sampleRate;
  const r = yin(data, rate, { minFreq: 35, maxFreq: 450, threshold: 0.12 });
  if (!r || r.confidence < 0.6) return null;
  const midi = freqToMidi(r.freq);
  const nearest = Math.round(midi);
  return {
    freq: r.freq,
    midi,
    nearest,
    name: noteName(nearest),
    cents: (midi - nearest) * 100,
    confidence: r.confidence,
  };
}

/** Dây buông gần nhất với cao độ đang nghe, kèm độ lệch (cent) so với dây đó. */
export function nearestString(midi) {
  let best = null;
  for (const string of STRINGS) {
    const diff = midi - OPEN_MIDI[string];
    if (!best || Math.abs(diff) < Math.abs(best.diffSemitones)) {
      best = { string, diffSemitones: diff, cents: diff * 100 };
    }
  }
  return best;
}
