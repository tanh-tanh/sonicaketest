import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, decodeWav, recordingFileName, parseRecordingFileName } from '../js/wav.js';
import { simulateAttempt } from '../js/simulate.js';
import { gradeRecording } from '../js/grade.js';
import { getLesson } from '../js/lessons.js';

test('Ghi rồi đọc lại WAV 16-bit giữ nguyên tín hiệu', () => {
  const x = Float32Array.from({ length: 4800 }, (_, i) => 0.6 * Math.sin((2 * Math.PI * 55 * i) / 48000));
  const { samples, sampleRate } = decodeWav(encodeWav(x, 48000));
  assert.equal(sampleRate, 48000);
  assert.equal(samples.length, x.length);
  let worst = 0;
  for (let i = 0; i < x.length; i++) worst = Math.max(worst, Math.abs(samples[i] - x[i]));
  assert.ok(worst < 1e-4, `sai lệch ${worst}`);
});

test('Tên file bản thu mang đủ thông tin để chấm lại', () => {
  const name = recordingFileName({ lessonId: 'w1-d2-chromatic-5', bpm: 65, beatZeroMs: 1234.4, latencyMs: -12 });
  assert.equal(name, 'bc30_w1-d2-chromatic-5_65bpm_1234ms_-12ms.wav');
  assert.deepEqual(parseRecordingFileName(name), { lessonId: 'w1-d2-chromatic-5', bpm: 65, beatZeroMs: 1234, latencyMs: -12 });
  assert.equal(parseRecordingFileName('ghi-am.wav'), null);
});

test('Chấm lại từ file WAV cho kết quả như chấm trực tiếp', () => {
  const lesson = getLesson('w2-d10-not-goc-a-d-e');
  const bpm = 60;
  const sim = simulateAttempt(lesson, bpm, { latencyMs: 70, seed: 21 });
  const recStart = sim.recording.startFrame / sim.recording.sampleRate;
  const name = recordingFileName({ lessonId: lesson.id, bpm, beatZeroMs: (sim.exerciseStart - recStart) * 1000, latencyMs: 70 });
  const meta = parseRecordingFileName(name);
  const { samples, sampleRate } = decodeWav(encodeWav(sim.recording.samples, sim.recording.sampleRate));
  const result = gradeRecording({
    recording: { samples, startFrame: 0, sampleRate },
    lesson,
    bpm: meta.bpm,
    exerciseStart: meta.beatZeroMs / 1000,
    latencySec: meta.latencyMs / 1000,
  });
  assert.ok(result.clean, `điểm ${result.score}`);
  assert.ok(Math.abs(result.meanErrMs) < 4);
});
