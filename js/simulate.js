// Tạo một lần chơi mô phỏng cho một bài tập (dùng cho test, scripts/simulate.mjs và nút "Chấm thử").

import { renderPerformance, makeRng } from './dsp/synth.js';
import { lessonLengthBeats } from './lessons.js';

/**
 * @param {object} lesson
 * @param {number} bpm
 * @param {object} [o]
 * @param {number} [o.sampleRate]
 * @param {number} [o.offsetMs] chơi sớm (âm) hay muộn (dương) đều mọi nốt
 * @param {number} [o.jitterMs] lệch ngẫu nhiên tối đa mỗi nốt
 * @param {Object<number, number>} [o.wrong] { chỉ số nốt: midi chơi nhầm }
 * @param {number[]} [o.skip] chỉ số các nốt bỏ sót
 * @param {(i:number) => number} [o.gainDb] độ lớn từng nốt
 * @param {number} [o.latencyMs] độ trễ hệ thống giả lập (tiếng đàn tới muộn hơn click)
 * @param {boolean} [o.clickBleed] cho tiếng click lọt vào bản thu
 * @param {number} [o.seed]
 * @param {number} [o.brightness]
 */
export function simulateAttempt(lesson, bpm, o = {}) {
  const sampleRate = o.sampleRate ?? 48000;
  const beatSec = 60 / bpm;
  const rng = makeRng(o.seed ?? 1);
  const contextStart = 5; // bản thu bắt đầu ở giây thứ 5 của AudioContext (tuỳ ý)
  const lead = Math.max(0.6, beatSec); // khoảng trước phách đầu tiên
  const latency = (o.latencyMs ?? 0) / 1000;
  const skip = new Set(o.skip ?? []);
  const wrong = o.wrong ?? {};

  const notes = [];
  lesson.notes.forEach((n, i) => {
    if (skip.has(i)) return;
    const jitter = o.jitterMs ? ((rng() * 2 - 1) * o.jitterMs) / 1000 : 0;
    notes.push({
      time: lead + n.beat * beatSec + (o.offsetMs ?? 0) / 1000 + jitter + latency,
      midi: wrong[i] ?? n.midi,
      gainDb: o.gainDb ? o.gainDb(i) : -rng() * 3,
    });
  });

  const duration = lead + lessonLengthBeats(lesson) * beatSec + latency + 0.8;
  const samples = renderPerformance({ sampleRate, duration, notes, seed: o.seed ?? 1, brightness: o.brightness ?? 0.8 });

  if (o.clickBleed) {
    const totalBeats = Math.ceil(lessonLengthBeats(lesson));
    for (let b = 0; b < totalBeats; b++) {
      const start = Math.round((lead + b * beatSec + latency) * sampleRate);
      const len = Math.round(0.03 * sampleRate);
      for (let i = 0; i < len && start + i < samples.length; i++) {
        const t = i / sampleRate;
        samples[start + i] += 0.05 * Math.sin(2 * Math.PI * 1320 * t) * Math.exp(-t * 90);
      }
    }
  }

  return {
    recording: { samples, startFrame: Math.round(contextStart * sampleRate), sampleRate },
    exerciseStart: contextStart + lead,
    performed: notes,
  };
}
