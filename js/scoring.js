// So các nốt nghe được với bài tập và tính điểm.

import { noteName } from './music.js';

export const TOLERANCE = Object.freeze({
  goodMs: 30, // lệch dưới 30 ms: tốt
  okMs: 60, // lệch dưới 60 ms: ổn
  centsOk: 50, // lệch dưới nửa cung: đúng nốt
  statsMaxMs: 150, // nốt lệch hơn mức này không tính vào trung bình/độ ổn định
});

/**
 * Ghép từng nốt yêu cầu với tiếng gảy gần nhất, giữ đúng thứ tự thời gian.
 * @param {Array<{time:number}>} expected đã sắp theo thời gian
 * @param {Array<{time:number}>} detected đã sắp theo thời gian
 */
export function matchByTime(expected, detected) {
  const pairs = new Array(expected.length).fill(-1);
  const used = new Array(detected.length).fill(false);
  let j = 0;
  for (let i = 0; i < expected.length; i++) {
    const t = expected[i].time;
    const prevGap = i > 0 ? t - expected[i - 1].time : Infinity;
    const nextGap = i + 1 < expected.length ? expected[i + 1].time - t : Infinity;
    const before = Math.min(0.25, prevGap / 2);
    const after = Math.min(0.25, nextGap / 2);

    while (j < detected.length && detected[j].time < t - before) j++;
    let best = -1;
    let bestDist = Infinity;
    for (let k = j; k < detected.length && detected[k].time <= t + after; k++) {
      if (used[k]) continue;
      const dist = Math.abs(detected[k].time - t);
      if (dist < bestDist) {
        bestDist = dist;
        best = k;
      }
    }
    if (best >= 0) {
      pairs[i] = best;
      used[best] = true;
      j = best + 1;
    }
  }
  const extras = [];
  used.forEach((u, k) => {
    if (!u) extras.push(k);
  });
  return { pairs, extras };
}

/**
 * @param {object} p
 * @param {object} p.lesson
 * @param {Array<{time:number, midi:number, string:string, fret:number}>} p.expected
 * @param {Array<{time:number, midi:number|null, ampDb:number}>} p.detected
 */
export function scoreAttempt({ lesson, expected, detected, tolerance = TOLERANCE }) {
  const { pairs, extras } = matchByTime(expected, detected);

  const perNote = expected.map((exp, i) => {
    const base = {
      index: i,
      string: exp.string,
      fret: exp.fret,
      expectedMidi: exp.midi,
      expectedName: noteName(exp.midi),
      time: exp.time,
    };
    const k = pairs[i];
    if (k < 0) {
      return { ...base, matched: false, timing: 'missed', pitch: 'none', status: 'missed' };
    }
    const det = detected[k];
    const errMs = (det.time - exp.time) * 1000;
    const absErr = Math.abs(errMs);
    const timing = absErr <= tolerance.goodMs ? 'good' : absErr <= tolerance.okMs ? 'ok' : 'off';

    let pitch = 'unknown';
    let cents = null;
    let octaveOff = false;
    let detectedName = null;
    if (det.midi != null) {
      const diff = det.midi - exp.midi;
      cents = diff * 100;
      detectedName = noteName(det.midi);
      if (Math.abs(cents) <= tolerance.centsOk) {
        pitch = 'ok';
      } else {
        const rounded = Math.round(diff);
        octaveOff = rounded !== 0 && rounded % 12 === 0;
        pitch = 'wrong';
      }
    }
    const status = pitch === 'wrong' ? 'wrong' : timing;
    return {
      ...base,
      matched: true,
      errMs,
      timing,
      pitch,
      cents,
      octaveOff,
      detectedMidi: det.midi,
      detectedName,
      ampDb: det.ampDb,
      status,
    };
  });

  const total = perNote.length;
  const count = (fn) => perNote.filter(fn).length;
  const counts = {
    total,
    matched: count((n) => n.matched),
    missed: count((n) => !n.matched),
    extra: extras.length,
    pitchOk: count((n) => n.pitch === 'ok'),
    pitchWrong: count((n) => n.pitch === 'wrong'),
    pitchUnknown: count((n) => n.pitch === 'unknown'),
    good: count((n) => n.timing === 'good'),
    ok: count((n) => n.timing === 'ok'),
    off: count((n) => n.timing === 'off'),
  };

  const inStats = perNote.filter((n) => n.matched && Math.abs(n.errMs) <= tolerance.statsMaxMs);
  const errs = inStats.map((n) => n.errMs);
  const meanErrMs = errs.length ? mean(errs) : null;
  const sdErrMs = errs.length > 1 ? stdev(errs) : null;

  const evenness = lesson.evenness ? evennessStats(inStats) : null;

  const timingCredit =
    perNote.reduce((s, n) => s + ({ good: 1, ok: 0.7, off: 0.1, missed: 0 })[n.timing], 0) / Math.max(1, total);
  const pitchCredit = (counts.pitchOk + 0.5 * counts.pitchUnknown) / Math.max(1, total);
  const evenCredit = evenness ? clamp(1 - Math.abs(evenness.ampDiffDb) / 6, 0, 1) : 1;
  let score = 100 * (0.45 * pitchCredit + 0.45 * timingCredit + 0.1 * evenCredit);
  score -= Math.min(10, counts.extra * 2);
  score = Math.round(clamp(score, 0, 100));

  const within60 = counts.good + counts.ok;
  const clean =
    total > 0 &&
    counts.missed === 0 &&
    counts.extra <= 1 &&
    counts.pitchUnknown <= 2 &&
    (counts.pitchOk + counts.pitchUnknown) / total >= 0.95 &&
    within60 / total >= 0.9;

  return {
    perNote,
    extras: extras.map((k) => detected[k]),
    counts,
    pitchPct: pct(counts.pitchOk, total),
    timingPct: pct(within60, total),
    goodPct: pct(counts.good, total),
    meanErrMs,
    sdErrMs,
    evenness,
    score,
    clean,
  };
}

/** So các nốt thứ 1, 3, 5… với các nốt thứ 2, 4, 6… (gảy luân phiên hai ngón). */
function evennessStats(notes) {
  const first = notes.filter((n) => n.index % 2 === 0 && Number.isFinite(n.ampDb));
  const second = notes.filter((n) => n.index % 2 === 1 && Number.isFinite(n.ampDb));
  if (first.length < 4 || second.length < 4) return null;
  return {
    ampDiffDb: mean(first.map((n) => n.ampDb)) - mean(second.map((n) => n.ampDb)),
    timeDiffMs: mean(first.map((n) => n.errMs)) - mean(second.map((n) => n.errMs)),
    n: first.length + second.length,
  };
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
function stdev(a) {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
