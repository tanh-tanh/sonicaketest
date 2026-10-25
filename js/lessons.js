// Bài tập Tuần 1–2 của lộ trình 30 ngày, mô tả bằng dữ liệu.
// Mỗi nốt: beat (tính từ phách đầu tiên của bài, đơn vị phách), dây, phím, midi.
// Chỉ dùng bài tập tự soạn, không đưa tab bài hát có bản quyền vào đây.

import { positionToMidi } from './music.js';

function sequence(positions, stepBeats) {
  return positions.map(([string, fret], i) => ({
    beat: i * stepBeats,
    string,
    fret,
    midi: positionToMidi(string, fret),
  }));
}

const repeat = (position, count) => Array.from({ length: count }, () => position);

/** Chromatic 1-2-3-4: lên hết 4 dây từ phím startFret, rồi đi ngược lại. */
function chromatic(startFret) {
  const up = [];
  for (const string of ['E', 'A', 'D', 'G']) {
    for (let f = 0; f < 4; f++) up.push([string, startFret + f]);
  }
  return [...up, ...up.slice().reverse()];
}

const OPEN_CROSSING = ['E', 'A', 'D', 'G', 'D', 'A'].flatMap((s) => [[s, 0], [s, 0]]);

const ROOTS_A_D_E = [
  ...repeat(['A', 0], 8),
  ...repeat(['A', 5], 8),
  ...repeat(['E', 0], 8),
  ...repeat(['A', 0], 8),
];

const R585_A_D_E = [
  ['A', 0], ['D', 2], ['G', 2], ['D', 2],
  ['A', 5], ['D', 7], ['G', 7], ['D', 7],
  ['E', 0], ['A', 2], ['D', 2], ['A', 2],
  ['A', 0], ['D', 2], ['G', 2], ['D', 2],
];

const COMMON = { beatsPerBar: 4, minBpm: 40, maxBpm: 140 };

export const LESSONS = [
  {
    ...COMMON,
    id: 'w1-d1-e-buong',
    week: 1,
    day: 1,
    title: 'Dây E buông, nốt đen',
    focus: 'Gảy luân phiên ngón trỏ và ngón giữa, mỗi tiếng click một nốt. Đếm to 1-2-3-4.',
    bpm: 60,
    subdivision: 1,
    evenness: true,
    notes: sequence(repeat(['E', 0], 16), 1),
  },
  {
    ...COMMON,
    id: 'w1-d2-chromatic-5',
    week: 1,
    day: 2,
    title: 'Chromatic 1-2-3-4 ở phím 5',
    focus: 'Mỗi ngón một phím: ngón trỏ phím 5, ngón út phím 8. Lên hết 4 dây rồi đi ngược lại.',
    bpm: 60,
    subdivision: 1,
    evenness: true,
    notes: sequence(chromatic(5), 1),
  },
  {
    ...COMMON,
    id: 'w1-d3-chuyen-day',
    week: 1,
    day: 3,
    title: 'Chuyển dây buông E-A-D-G-D-A',
    focus: 'Mỗi dây hai nốt móc đơn. Gảy xong để ngón tựa lên dây kế bên cho dây cũ im tiếng.',
    bpm: 60,
    subdivision: 2,
    evenness: true,
    notes: sequence([...OPEN_CROSSING, ...OPEN_CROSSING], 0.5),
  },
  {
    ...COMMON,
    id: 'w1-d4-chromatic-1',
    week: 1,
    day: 4,
    title: 'Chromatic 1-2-3-4 ở phím 1',
    focus: 'Vùng phím rộng hơn: dịch cả bàn tay, đừng cố kéo giãn ngón. Tay nhỏ có thể tạm dùng thế 1-2-4.',
    bpm: 60,
    subdivision: 1,
    evenness: true,
    notes: sequence(chromatic(1), 1),
  },
  {
    ...COMMON,
    id: 'w2-d8-buong-moc-don',
    week: 2,
    day: 8,
    title: 'Dây buông, nốt móc đơn',
    focus: 'Hai nốt mỗi tiếng click, đếm "1 và 2 và". 16 nốt dây E rồi 16 nốt dây A.',
    bpm: 60,
    subdivision: 2,
    evenness: true,
    notes: sequence([...repeat(['E', 0], 16), ...repeat(['A', 0], 16)], 0.5),
  },
  {
    ...COMMON,
    id: 'w2-d8-chromatic-5-moc-don',
    week: 2,
    day: 8,
    title: 'Chromatic ở phím 5, nốt móc đơn',
    focus: 'Tay trái thả lỏng. Đều tay quan trọng hơn gảy mạnh.',
    bpm: 60,
    subdivision: 2,
    evenness: true,
    notes: sequence(chromatic(5), 0.5),
  },
  {
    ...COMMON,
    id: 'w2-d10-not-goc-a-d-e',
    week: 2,
    day: 10,
    title: 'Nốt gốc vòng A–D–E, nốt móc đơn',
    focus: 'Mỗi hợp âm một ô nhịp: A (dây A buông), D (dây A phím 5), E (dây E buông), rồi về A.',
    bpm: 60,
    subdivision: 2,
    evenness: true,
    notes: sequence(ROOTS_A_D_E, 0.5),
  },
  {
    ...COMMON,
    id: 'w2-d12-r585-a-d-e',
    week: 2,
    day: 12,
    title: 'Gốc, quãng 5, quãng 8 trên A–D–E',
    focus: 'Mẫu gốc–5–8–5 cho từng hợp âm. Quãng 5: lên một dây, tiến 2 phím. Quãng 8: lên hai dây, tiến 2 phím.',
    bpm: 60,
    subdivision: 1,
    // Các nốt chẵn/lẻ rơi vào những dây khác nhau nên không so độ đều tay ở bài này.
    evenness: false,
    notes: sequence(R585_A_D_E, 1),
  },
];

export function getLesson(id) {
  return LESSONS.find((lesson) => lesson.id === id) ?? null;
}

/** Độ dài bài tính bằng phách (đến hết nốt cuối). */
export function lessonLengthBeats(lesson) {
  const last = lesson.notes[lesson.notes.length - 1];
  return last.beat + 1 / lesson.subdivision;
}
