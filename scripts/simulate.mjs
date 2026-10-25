// In bảng chấm điểm cho các lần chơi mô phỏng: npm run simulate [id-bài]
// Dùng để xem nhanh thay đổi ở phần phát hiện nốt/chấm điểm có làm lệch kết quả không.

import { LESSONS } from '../js/lessons.js';
import { simulateAttempt } from '../js/simulate.js';
import { gradeRecording } from '../js/grade.js';
import { buildFeedback } from '../js/feedback.js';

const only = process.argv[2];
const lessons = only ? LESSONS.filter((l) => l.id === only) : LESSONS;
if (lessons.length === 0) {
  console.error(`Không có bài "${only}". Các id: ${LESSONS.map((l) => l.id).join(', ')}`);
  process.exit(1);
}

const scenarios = [
  ['chuẩn', () => ({ jitterMs: 8 })],
  ['muộn đều 35 ms', () => ({ offsetMs: 35, jitterMs: 8 })],
  ['1 nốt sai, 1 nốt sót', (lesson) => ({ wrong: { 5: lesson.notes[5].midi + 1 }, skip: [9] })],
  ['ngón 2 yếu 5 dB', () => ({ gainDb: (i) => (i % 2 ? -5 : 0) })],
  ['tiếng gảy mềm', () => ({ brightness: 0, jitterMs: 15 })],
];

const rows = [];
for (const lesson of lessons) {
  for (const [name, make] of scenarios) {
    const sim = simulateAttempt(lesson, lesson.bpm, { seed: 7, ...make(lesson) });
    const r = gradeRecording({ recording: sim.recording, lesson, bpm: lesson.bpm, exerciseStart: sim.exerciseStart });
    const fb = buildFeedback(r, { lesson, bpm: lesson.bpm, streak: r.clean ? 1 : 0 });
    rows.push({
      bài: lesson.id,
      'tình huống': name,
      điểm: r.score,
      'đúng nốt %': r.pitchPct,
      'đúng nhịp %': r.timingPct,
      'lệch TB ms': r.meanErrMs == null ? '' : Math.round(r.meanErrMs),
      'thiếu/thừa': `${r.counts.missed}/${r.counts.extra}`,
      'chênh tay dB': r.evenness ? r.evenness.ampDiffDb.toFixed(1) : '',
      sạch: r.clean ? 'có' : '',
      'nhận xét đầu': fb.tips[0],
    });
  }
}
console.table(rows);
