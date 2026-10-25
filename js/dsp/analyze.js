// Phân tích một bản thu: tìm các nốt (thời điểm gảy, cao độ, độ lớn).

import { detectOnsets } from './onsets.js';
import { yin, downsample2 } from './yin.js';
import { freqToMidi } from '../music.js';

/**
 * @param {Float32Array} x bản thu mono
 * @param {number} sampleRate
 * @param {{prerollSec?: number, expectedSec?: number[], sensitivity?: number, onsets?: object, pitch?: object}} [opts]
 *   expectedSec: thời điểm dự kiến của các nốt (giây, tính từ đầu bản thu) để tìm lại tiếng gảy yếu
 * @returns {{notes: Array<{sample:number, time:number, freq:number|null, midi:number|null,
 *            confidence:number, ampDb:number, zcr:number, likelyClick:boolean}>}}
 */
export function analyzeRecording(x, sampleRate, opts = {}) {
  const onsets = detectOnsets(x, sampleRate, {
    prerollSec: opts.prerollSec,
    expectedSec: opts.expectedSec,
    sensitivity: opts.sensitivity,
    ...opts.onsets,
  });

  // Đo cao độ ở tần số lấy mẫu giảm một nửa cho nhanh.
  const half = sampleRate > 30000;
  const px = half ? downsample2(x) : x;
  const prate = half ? sampleRate / 2 : sampleRate;
  const toP = (sample) => (half ? Math.floor(sample / 2) : sample);

  const winLen = Math.round(0.064 * prate); // đủ 2 chu kỳ của nốt E1 (41 Hz)
  const skip = Math.round(0.025 * prate); // bỏ qua phần tiếng gảy
  const step = Math.round(0.02 * prate);
  const guard = Math.round(0.003 * prate);

  const notes = onsets.map((start, i) => {
    const end = i + 1 < onsets.length ? onsets[i + 1] : x.length;

    const ampDb = peakRmsDb(x, start, Math.min(end, start + Math.round(0.08 * sampleRate)), Math.round(0.005 * sampleRate));
    const zcr = zeroCrossingRate(x, start, Math.min(end, start + Math.round(0.02 * sampleRate)), sampleRate);

    const estimates = [];
    const pStart = toP(start);
    const pEnd = toP(end);
    for (let w = 0; w < 3; w++) {
      const s = pStart + skip + w * step;
      const len = Math.min(winLen, pEnd - s - guard);
      if (len < winLen * 0.6) break;
      const r = yin(px.subarray(s, s + len), prate, opts.pitch);
      if (r && r.confidence > 0.5) estimates.push(r);
    }
    const pick = pickEstimate(estimates);
    const freq = pick ? pick.freq : null;

    return {
      sample: start,
      time: start / sampleRate,
      freq,
      midi: freq ? freqToMidi(freq) : null,
      confidence: pick ? pick.confidence : 0,
      ampDb,
      zcr,
      // Tiếng click metronome lọt vào đầu vào (nếu có) có tần số cao, không phải nốt bass.
      likelyClick: zcr > 1500 && (freq === null || freq > 400),
    };
  });

  return { notes };
}

function pickEstimate(estimates) {
  if (estimates.length === 0) return null;
  if (estimates.length === 1) return estimates[0];
  if (estimates.length === 2) return estimates[0].confidence >= estimates[1].confidence ? estimates[0] : estimates[1];
  const sorted = estimates.slice().sort((a, b) => a.freq - b.freq);
  return sorted[1];
}

/** Độ lớn đỉnh (dBFS) đo bằng RMS trên các khối ngắn. */
export function peakRmsDb(x, start, end, block) {
  let best = 0;
  for (let b = start; b < end; b += block) {
    const e = Math.min(end, b + block);
    let s = 0;
    for (let i = b; i < e; i++) s += x[i] * x[i];
    const rms = Math.sqrt(s / Math.max(1, e - b));
    if (rms > best) best = rms;
  }
  return 20 * Math.log10(best + 1e-9);
}

/** Số lần đổi dấu mỗi giây: tiếng bass thấp, tiếng click cao. */
export function zeroCrossingRate(x, start, end, sampleRate) {
  let count = 0;
  for (let i = start + 1; i < end; i++) {
    if ((x[i - 1] >= 0 && x[i] < 0) || (x[i - 1] < 0 && x[i] >= 0)) count++;
  }
  const dur = (end - start) / sampleRate;
  return dur > 0 ? count / dur : 0;
}
