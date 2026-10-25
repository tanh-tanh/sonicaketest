import test from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS, getLesson } from '../js/lessons.js';
import { gradeRecording, measureLatency } from '../js/grade.js';
import { simulateAttempt } from '../js/simulate.js';
import { buildFeedback } from '../js/feedback.js';
import { renderPerformance } from '../js/dsp/synth.js';

const chromatic = getLesson('w1-d2-chromatic-5');
const openE = getLesson('w1-d1-e-buong');

function grade(lesson, bpm, opts = {}, latencySec = 0) {
  const sim = simulateAttempt(lesson, bpm, opts);
  return gradeRecording({ recording: sim.recording, lesson, bpm, exerciseStart: sim.exerciseStart, latencySec });
}

test('Mọi bài tập: chơi chuẩn thì được chấm sạch', () => {
  for (const lesson of LESSONS) {
    const r = grade(lesson, lesson.bpm, { seed: 11, jitterMs: 8 });
    assert.equal(r.counts.missed, 0, `${lesson.id}: thiếu ${r.counts.missed} nốt`);
    assert.equal(r.counts.extra, 0, `${lesson.id}: thừa ${r.counts.extra} nốt`);
    assert.equal(r.counts.pitchWrong, 0, `${lesson.id}: sai ${r.counts.pitchWrong} nốt`);
    assert.ok(r.clean, `${lesson.id}: chưa sạch (điểm ${r.score})`);
    assert.ok(r.score >= 90, `${lesson.id}: điểm ${r.score}`);
  }
});

test('Đo đúng xu hướng chơi muộn đều', () => {
  const r = grade(chromatic, 60, { offsetMs: 25, seed: 2 });
  assert.ok(Math.abs(r.meanErrMs - 25) < 4, `trung bình ${r.meanErrMs}`);
  const fb = buildFeedback(r, { lesson: chromatic, bpm: 60, streak: 0 });
  assert.ok(fb.tips.some((t) => t.includes('muộn')), fb.tips.join('\n'));
});

test('Đo đúng xu hướng chơi sớm', () => {
  const r = grade(chromatic, 70, { offsetMs: -45, seed: 3 });
  assert.ok(Math.abs(r.meanErrMs + 45) < 5, `trung bình ${r.meanErrMs}`);
  assert.equal(r.counts.good, 0);
  assert.ok(r.timingPct >= 90);
});

test('Bắt được nốt sai và nốt bị bỏ sót', () => {
  const lesson = chromatic;
  const r = grade(lesson, 60, { wrong: { 5: lesson.notes[5].midi + 1 }, skip: [9], seed: 4 });
  assert.equal(r.counts.pitchWrong, 1);
  assert.equal(r.perNote[5].status, 'wrong');
  assert.equal(r.counts.missed, 1);
  assert.equal(r.perNote[9].status, 'missed');
  assert.equal(r.clean, false);
  const fb = buildFeedback(r, { lesson, bpm: 60, streak: 0 });
  assert.ok(fb.tips.some((t) => t.startsWith('Nốt 6 cần')), fb.tips.join('\n'));
  assert.ok(fb.tips.some((t) => t.startsWith('Thiếu 1 nốt')), fb.tips.join('\n'));
});

test('Nhận ra nốt lệch quãng tám', () => {
  const lesson = openE;
  const r = grade(lesson, 60, { wrong: { 3: lesson.notes[3].midi + 12 }, seed: 5 });
  assert.equal(r.perNote[3].pitch, 'wrong');
  assert.equal(r.perNote[3].octaveOff, true);
});

test('Trừ đúng độ trễ hệ thống sau khi hiệu chỉnh', () => {
  const r = grade(chromatic, 60, { latencyMs: 120, seed: 6 }, 0.12);
  assert.ok(Math.abs(r.meanErrMs) < 4, `trung bình ${r.meanErrMs}`);
  assert.ok(r.clean);
});

test('Phát hiện gảy luân phiên không đều tay', () => {
  const r = grade(openE, 60, { gainDb: (i) => (i % 2 === 0 ? 0 : -5), seed: 7 });
  assert.ok(r.evenness, 'thiếu số liệu đều tay');
  assert.ok(Math.abs(r.evenness.ampDiffDb - 5) < 1.5, `chênh ${r.evenness.ampDiffDb}`);
  const fb = buildFeedback(r, { lesson: openE, bpm: 60, streak: 0 });
  assert.ok(fb.tips.some((t) => t.startsWith('Các nốt 1, 3, 5…')), fb.tips.join('\n'));
});

test('Tiếng click lọt vào đầu vào không bị tính là nốt thừa', () => {
  const r = grade(chromatic, 60, { clickBleed: true, seed: 8 });
  assert.equal(r.counts.extra, 0, `thừa ${r.counts.extra}`);
  assert.equal(r.counts.missed, 0);
});

test('Gợi ý tăng BPM sau 3 lần sạch, giảm BPM khi điểm thấp', () => {
  const good = grade(chromatic, 60, { seed: 9 });
  assert.ok(good.clean);
  assert.equal(buildFeedback(good, { lesson: chromatic, bpm: 60, streak: 3 }).suggestion.type, 'up');
  assert.equal(buildFeedback(good, { lesson: chromatic, bpm: 60, streak: 2 }).suggestion.type, 'stay');
  const wrong = { 1: 40, 2: 41, 3: 42, 6: 30, 12: 50, 13: 51, 20: 30, 21: 31 };
  const bad = grade(chromatic, 60, { offsetMs: 110, jitterMs: 70, wrong, skip: [4, 10, 16, 27], seed: 10 });
  assert.ok(bad.score < 50, `điểm ${bad.score}`);
  assert.equal(buildFeedback(bad, { lesson: chromatic, bpm: 60, streak: 0 }).suggestion.type, 'down');
});

test('Hiệu chỉnh độ trễ: đo được độ trễ từ 8 lần gảy theo click', () => {
  const sampleRate = 48000;
  const beat = 60 / 80;
  const recStart = 3;
  const clicks = Array.from({ length: 8 }, (_, i) => recStart + 0.8 + i * beat);
  const notes = clicks.map((t, i) => ({ time: t - recStart + 0.085 + (i % 2 ? 0.004 : -0.004), midi: 28 }));
  const samples = renderPerformance({ sampleRate, duration: 0.8 + 8 * beat + 0.8, notes, seed: 12 });
  const res = measureLatency({ samples, startFrame: recStart * sampleRate, sampleRate }, clicks);
  assert.ok(res.ok, JSON.stringify(res));
  assert.ok(Math.abs(res.latencyMs - 85) <= 6, `đo được ${res.latencyMs} ms`);
});
