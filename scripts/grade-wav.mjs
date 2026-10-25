// Chấm lại một bản thu thật (tải từ nút "Tải bản thu (WAV)" trong app).
//   node scripts/grade-wav.mjs recordings/bc30_w1-d2-chromatic-5_60bpm_812ms_95ms.wav
// Tên file chứa id bài, BPM, thời điểm phách đầu tiên trong bản thu và độ trễ đã hiệu chỉnh.
// Có thể ghi đè: --lesson <id> --bpm <số> --start <ms> --latency <ms> --sensitivity <0..1>

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { decodeWav, parseRecordingFileName } from '../js/wav.js';
import { getLesson, LESSONS } from '../js/lessons.js';
import { gradeRecording } from '../js/grade.js';
import { buildFeedback } from '../js/feedback.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (!file) {
  console.error('Cách dùng: node scripts/grade-wav.mjs <file.wav> [--lesson id --bpm 60 --start 812 --latency 95]');
  process.exit(1);
}

const meta = parseRecordingFileName(basename(file)) ?? {};
const lessonId = flag('lesson') ?? meta.lessonId;
const bpm = Number(flag('bpm') ?? meta.bpm);
const startMs = Number(flag('start') ?? meta.beatZeroMs);
const latencyMs = Number(flag('latency') ?? meta.latencyMs ?? 0);
const sensitivity = flag('sensitivity') == null ? undefined : Number(flag('sensitivity'));
const lesson = getLesson(lessonId);
if (!lesson || !Number.isFinite(bpm) || !Number.isFinite(startMs)) {
  console.error('Thiếu thông tin bài/BPM/thời điểm bắt đầu. Đặt tên file theo mẫu bc30_<id>_<bpm>bpm_<start>ms_<latency>ms.wav hoặc dùng --lesson --bpm --start.');
  console.error(`Các id bài: ${LESSONS.map((l) => l.id).join(', ')}`);
  process.exit(1);
}

const buf = await readFile(file);
const { samples, sampleRate, channels } = decodeWav(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const result = gradeRecording({
  recording: { samples, startFrame: 0, sampleRate },
  lesson,
  bpm,
  exerciseStart: startMs / 1000,
  latencySec: latencyMs / 1000,
  sensitivity,
});
const fb = buildFeedback(result, { lesson, bpm, streak: result.clean ? 1 : 0 });

console.log(`${basename(file)}: ${(samples.length / sampleRate).toFixed(1)} s, ${sampleRate} Hz, ${channels} kênh`);
console.log(`Bài ${lesson.id} ở ${bpm} BPM, phách đầu tại ${startMs} ms, độ trễ ${latencyMs} ms\n`);
console.table(
  result.perNote.map((n) => ({
    nốt: n.index + 1,
    cần: `${n.expectedName} (${n.string}${n.fret})`,
    'nghe ra': n.detectedName ?? '',
    cent: n.cents == null ? '' : Math.round(n.cents),
    'lệch ms': n.matched ? Math.round(n.errMs) : '',
    'trạng thái': n.status,
  })),
);
if (result.extras.length) {
  console.log('Tiếng gảy thừa (giây tính từ phách đầu):', result.extras.map((e) => (e.time - startMs / 1000).toFixed(3)).join(', '));
}
console.log(`\nĐiểm ${result.score}, đúng nốt ${result.pitchPct}%, đúng nhịp ${result.timingPct}%, ` +
  `lệch TB ${result.meanErrMs == null ? '–' : Math.round(result.meanErrMs)} ms, ±${result.sdErrMs == null ? '–' : Math.round(result.sdErrMs)} ms, sạch: ${result.clean ? 'có' : 'không'}`);
console.log(`\n${fb.headline}`);
for (const tip of fb.tips) console.log(`- ${tip}`);
