// Nối các bước: phân tích bản thu -> đổi sang thời gian AudioContext -> so với bài -> tính điểm.
// Dùng chung cho app, test và scripts/simulate.mjs.

import { analyzeRecording } from './dsp/analyze.js';
import { scoreAttempt } from './scoring.js';

/**
 * @param {object} p
 * @param {{samples: Float32Array, startFrame: number, sampleRate: number}} p.recording
 * @param {object} p.lesson
 * @param {number} p.bpm
 * @param {number} p.exerciseStart thời điểm phách đầu tiên của bài (giây, đồng hồ AudioContext)
 * @param {number} p.latencySec độ trễ hệ thống đo được khi hiệu chỉnh
 * @param {number} [p.sensitivity] độ nhạy bắt tiếng gảy 0..1
 */
export function gradeRecording({ recording, lesson, bpm, exerciseStart, latencySec = 0, sensitivity }) {
  const { samples, startFrame, sampleRate } = recording;
  const recStart = startFrame / sampleRate;
  const beatSec = 60 / bpm;
  const prerollSec = Math.max(0, exerciseStart - recStart - 0.3);
  // Thời điểm dự kiến trong bản thu: cộng độ trễ vì tiếng đàn tới muộn hơn tiếng click.
  const expectedSec = lesson.notes.map((n) => exerciseStart + n.beat * beatSec + latencySec - recStart);
  const { notes } = analyzeRecording(samples, sampleRate, { prerollSec, expectedSec, sensitivity });

  const detected = notes
    .filter((n) => !n.likelyClick)
    .map((n) => ({ time: recStart + n.time - latencySec, midi: n.midi, ampDb: n.ampDb }));

  const expected = lesson.notes.map((n) => ({ ...n, time: exerciseStart + n.beat * beatSec }));

  const result = scoreAttempt({ lesson, expected, detected });
  result.detectedCount = detected.length;
  result.clickBleed = notes.length - detected.length;
  return result;
}

/**
 * Đo độ trễ từ lần hiệu chỉnh: người chơi gảy theo từng tiếng click.
 * @param {{samples: Float32Array, startFrame: number, sampleRate: number}} recording
 * @param {number[]} clickTimes thời điểm click cần gảy theo
 */
export function measureLatency(recording, clickTimes, { sensitivity } = {}) {
  const { samples, startFrame, sampleRate } = recording;
  const recStart = startFrame / sampleRate;
  const prerollSec = Math.max(0, clickTimes[0] - recStart - 0.3);
  const { notes } = analyzeRecording(samples, sampleRate, { prerollSec, sensitivity });
  const onsets = notes.filter((n) => !n.likelyClick).map((n) => recStart + n.time);

  const offsets = [];
  for (const t of clickTimes) {
    let best = null;
    for (const o of onsets) {
      const d = o - t;
      if (d > -0.15 && d < 0.4 && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
    if (best !== null) offsets.push(best * 1000);
  }
  if (offsets.length < 6) {
    return { ok: false, reason: 'too-few', heard: offsets.length, needed: clickTimes.length };
  }
  const sorted = offsets.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const spread = Math.sqrt(offsets.reduce((s, v) => s + (v - median) ** 2, 0) / offsets.length);
  if (spread > 25) {
    return { ok: false, reason: 'uneven', spread: Math.round(spread), heard: offsets.length, needed: clickTimes.length };
  }
  return { ok: true, latencyMs: Math.round(median), spreadMs: Math.round(spread), heard: offsets.length, needed: clickTimes.length };
}
