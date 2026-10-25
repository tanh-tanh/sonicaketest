// Vẽ khuông tab 4 dây: G ở trên, E ở dưới như tab bass. Dây càng trầm vẽ càng dày.

import { lessonLengthBeats } from '../lessons.js';
import { noteName } from '../music.js';

const ORDER = ['G', 'D', 'A', 'E'];
const GAUGE = { G: 1.1, D: 1.6, A: 2.2, E: 2.9 };
const STATUS_TEXT = {
  good: 'đúng phách',
  ok: 'hơi lệch phách',
  off: 'lệch phách nhiều',
  wrong: 'sai nốt',
  missed: 'thiếu nốt',
};

const BEAT_W = 64;
const LEFT = 34;
const RIGHT = 14;
const TOP = 24;
const SPACING = 18;
const ROW_H = TOP + SPACING * 3 + 30;

/**
 * @param {HTMLElement} container
 * @param {object} lesson
 * @param {{results?: Array|null}} [opts] perNote từ scoreAttempt để tô màu
 */
export function renderStaff(container, lesson, { results = null } = {}) {
  const available = container.clientWidth || 640;
  const beatsPerRow = available < 560 ? lesson.beatsPerBar : lesson.beatsPerBar * 2;
  const totalBeats = Math.ceil(lessonLengthBeats(lesson) / lesson.beatsPerBar) * lesson.beatsPerBar;
  const rows = Math.max(1, Math.ceil(totalBeats / beatsPerRow));
  const width = LEFT + beatsPerRow * BEAT_W + RIGHT;
  const height = rows * ROW_H;

  const parts = [];
  for (let r = 0; r < rows; r++) {
    const y0 = r * ROW_H + TOP;
    ORDER.forEach((s, k) => {
      const y = y0 + k * SPACING;
      parts.push(`<line class="str" x1="${LEFT}" y1="${y}" x2="${width - RIGHT}" y2="${y}" stroke-width="${GAUGE[s]}"/>`);
      parts.push(`<text class="lbl" x="${LEFT - 14}" y="${y}" dominant-baseline="central" text-anchor="middle">${s}</text>`);
    });
    for (let b = 0; b <= beatsPerRow; b += lesson.beatsPerBar) {
      const x = LEFT + b * BEAT_W;
      parts.push(`<line class="bar" x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + 3 * SPACING}"/>`);
    }
  }

  lesson.notes.forEach((n, i) => {
    const row = Math.floor(n.beat / beatsPerRow);
    const x = LEFT + (n.beat - row * beatsPerRow) * BEAT_W + 18;
    const y = row * ROW_H + TOP + ORDER.indexOf(n.string) * SPACING;
    const res = results ? results[i] : null;
    const cls = res ? ` nh--${res.status}` : '';
    const w = n.fret >= 10 ? 26 : 22;
    parts.push(
      `<g class="nh${cls}" data-i="${i}" data-row="${row}"><title>${escapeXml(noteTitle(n, i, res))}</title>` +
        `<rect x="${x - w / 2}" y="${y - 9}" width="${w}" height="18" rx="6"/>` +
        `<text x="${x}" y="${y}" dominant-baseline="central" text-anchor="middle">${n.fret}</text></g>`,
    );
  });

  const label = `Tab ${lesson.notes.length} nốt${results ? ', tô màu theo kết quả chấm' : ''}`;
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(label)}">${parts.join('')}</svg>`;
}

/** Tô sáng nốt đang chơi (index < 0 để bỏ tô). Trả về phần tử nốt, nếu có. */
export function highlightNote(container, index) {
  const prev = container.querySelector('.nh--current');
  if (prev) prev.classList.remove('nh--current');
  if (index < 0) return null;
  const el = container.querySelector(`[data-i="${index}"]`);
  if (el) el.classList.add('nh--current');
  return el;
}

function noteTitle(n, i, res) {
  let text = `Nốt ${i + 1}: dây ${n.string}, phím ${n.fret} (${noteName(n.midi)})`;
  if (!res) return text;
  text += `. ${STATUS_TEXT[res.status] ?? ''}`;
  if (res.matched) text += `, ${res.errMs < 0 ? 'sớm' : 'muộn'} ${Math.round(Math.abs(res.errMs))} ms`;
  if (res.pitch === 'wrong' && res.detectedName) text += `, app nghe ra ${res.detectedName}`;
  return text;
}

function escapeXml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
