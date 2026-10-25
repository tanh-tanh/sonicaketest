// Biểu đồ lệch nhịp từng nốt: trên đường giữa là muộn, dưới là sớm.

const RANGE = 150;

/**
 * @param {HTMLElement} container
 * @param {Array} perNote kết quả từng nốt của scoreAttempt
 * @param {{goodMs:number, okMs:number}} tolerance
 */
export function renderTimingChart(container, perNote, tolerance) {
  const width = Math.max(300, Math.min(720, container.clientWidth || 640));
  const height = 190;
  const padL = 48;
  const padR = 14;
  const padT = 14;
  const padB = 14;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const y = (ms) => padT + ((RANGE - clamp(ms, -RANGE, RANGE)) / (2 * RANGE)) * plotH;
  const n = perNote.length;
  const x = (i) => padL + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1));

  const parts = [];
  parts.push(`<rect class="band-ok" x="${padL}" y="${y(tolerance.okMs)}" width="${plotW}" height="${y(-tolerance.okMs) - y(tolerance.okMs)}"/>`);
  parts.push(`<rect class="band-good" x="${padL}" y="${y(tolerance.goodMs)}" width="${plotW}" height="${y(-tolerance.goodMs) - y(tolerance.goodMs)}"/>`);
  parts.push(`<line class="zero" x1="${padL}" y1="${y(0)}" x2="${width - padR}" y2="${y(0)}"/>`);
  parts.push(`<text class="axis" x="${padL - 8}" y="${y(RANGE) + 4}" text-anchor="end" dominant-baseline="hanging">muộn</text>`);
  parts.push(`<text class="axis" x="${padL - 8}" y="${y(0)}" text-anchor="end" dominant-baseline="central">0 ms</text>`);
  parts.push(`<text class="axis" x="${padL - 8}" y="${y(-RANGE) - 4}" text-anchor="end">sớm</text>`);

  perNote.forEach((note, i) => {
    const cx = x(i);
    if (!note.matched) {
      parts.push(
        `<g class="pt-missed"><title>Nốt ${i + 1}: thiếu nốt</title>` +
          `<path d="M${cx - 4} ${y(0) - 4} L${cx + 4} ${y(0) + 4} M${cx + 4} ${y(0) - 4} L${cx - 4} ${y(0) + 4}"/></g>`,
      );
      return;
    }
    const err = note.errMs;
    const label = `Nốt ${i + 1}: ${err < 0 ? 'sớm' : 'muộn'} ${Math.round(Math.abs(err))} ms${note.pitch === 'wrong' ? ', sai nốt' : ''}`;
    const cls = `pt pt--${note.status}`;
    if (Math.abs(err) > RANGE) {
      const yy = err > 0 ? padT + 2 : padT + plotH - 2;
      const dir = err > 0 ? -1 : 1;
      parts.push(`<path class="${cls}" d="M${cx - 5} ${yy - dir * 7} L${cx + 5} ${yy - dir * 7} L${cx} ${yy} Z"><title>${label}</title></path>`);
    } else {
      parts.push(`<circle class="${cls}" cx="${cx}" cy="${y(err)}" r="4.5"><title>${label}</title></circle>`);
    }
  });

  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Biểu đồ lệch nhịp của ${n} nốt">${parts.join('')}</svg>`;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
