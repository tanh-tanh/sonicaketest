// Tạo tiếng bass mô phỏng (có tính tất định) để test và để chạy chế độ chấm thử.
// Mô hình dây gảy đơn giản: hoạ âm thứ h có biên độ ~ sin(pi*h*beta)/h^p (beta = vị trí gảy),
// hoạ âm càng cao tắt càng nhanh, nên tiếng gảy sáng lúc đầu rồi tối dần như bass thật.

import { midiToFreq } from '../music.js';

/** Bộ sinh số ngẫu nhiên có seed (mulberry32). */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {object} p
 * @param {number} p.sampleRate
 * @param {number} p.duration giây
 * @param {Array<{time:number, midi:number, gainDb?:number, cents?:number, length?:number}>} p.notes
 * @param {number} [p.noiseDb] mức nhiễu nền (dBFS)
 * @param {number} [p.seed]
 * @param {number} [p.brightness] 0..1, độ sáng của tiếng gảy (0 = dây cũ/tone vặn nhỏ, 1 = dây mới)
 * @param {number} [p.attackClick] độ lớn tiếng "tách" của ngón tay (0 = không có)
 * @param {boolean} [p.muteBetween] true: chặn nốt cũ khi gảy nốt mới
 */
export function renderPerformance({
  sampleRate,
  duration,
  notes,
  noiseDb = -72,
  seed = 1,
  brightness = 1,
  attackClick = 0.5,
  muteBetween = true,
}) {
  const out = new Float32Array(Math.ceil(duration * sampleRate));
  const rng = makeRng(seed);
  const noiseAmp = 10 ** (noiseDb / 20);
  for (let i = 0; i < out.length; i++) out[i] = (rng() * 2 - 1) * noiseAmp;

  const sorted = notes.slice().sort((a, b) => a.time - b.time);
  sorted.forEach((note, i) => {
    const next = sorted[i + 1];
    const length = note.length ?? (next && muteBetween ? next.time - note.time + 0.012 : 1.5);
    const freq = midiToFreq(note.midi + (note.cents ?? 0) / 100);
    const amp = 0.45 * 10 ** ((note.gainDb ?? 0) / 20);
    pluck(out, sampleRate, Math.round(note.time * sampleRate), freq, amp, length, rng, brightness, attackClick);
  });
  return out;
}

function pluck(out, sampleRate, start, freq, amp, length, rng, brightness, attackClick) {
  if (start < 0 || start >= out.length) return;
  const n = Math.min(out.length - start, Math.round(length * sampleRate));
  const release = Math.round(0.01 * sampleRate);
  const beta = 0.18 + rng() * 0.08; // vị trí gảy trên dây
  const maxFreq = Math.min(2500, sampleRate / 2.2);
  const count = Math.max(1, Math.floor(maxFreq / freq));
  const slope = 2.1 - 0.6 * brightness;

  // Mỗi hoạ âm là một bộ dao động quay (rẻ hơn gọi Math.sin cho từng mẫu).
  const partials = [];
  let norm = 0;
  for (let h = 1; h <= count; h++) {
    const shape = Math.abs(Math.sin(Math.PI * h * beta)) / h ** slope;
    if (shape < 1e-4) continue;
    const decayPerSec = 1.2 + 0.9 * h * (1.3 - 0.3 * brightness);
    const w = (2 * Math.PI * freq * h) / sampleRate;
    const phase = rng() * Math.PI * 2;
    partials.push({
      a: shape,
      k: Math.exp(-decayPerSec / sampleRate),
      cos: Math.cos(w),
      sin: Math.sin(w),
      s: Math.sin(phase),
      c: Math.cos(phase),
    });
    norm += shape;
  }
  const scale = (2.2 * amp) / Math.max(norm, 1e-9);
  const attackLen = 0.0015 * sampleRate;
  const clickLen = Math.round(0.003 * sampleRate);

  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const p of partials) {
      const s = p.s * p.cos + p.c * p.sin;
      const c = p.c * p.cos - p.s * p.sin;
      p.s = s;
      p.c = c;
      v += p.a * s;
      p.a *= p.k;
    }
    const attack = Math.min(1, i / attackLen);
    const tail = i > n - release ? (n - i) / release : 1;
    const click = i < clickLen ? (rng() * 2 - 1) * 0.25 * attackClick * (1 - i / clickLen) : 0;
    out[start + i] += scale * attack * tail * v + amp * click;
  }
}
