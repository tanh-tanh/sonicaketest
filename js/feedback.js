// Biến số liệu chấm điểm thành lời khuyên tiếng Việt và gợi ý tốc độ.
// Quy tắc theo lộ trình: chơi sạch 3 lần liên tiếp mới tăng 5 BPM.

import { pitchClassName } from './music.js';

export const CLEAN_RUNS_TO_LEVEL_UP = 3;
export const BPM_STEP = 5;

export function formatNumber(value, digits = 0) {
  return value.toLocaleString('vi-VN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/**
 * @param {ReturnType<import('./scoring.js').scoreAttempt>} result
 * @param {{lesson: object, bpm: number, streak: number}} ctx streak đã tính cả lần này
 */
export function buildFeedback(result, { lesson, bpm, streak }) {
  const tips = [];
  const c = result.counts;

  if (c.missed) {
    tips.push(`Thiếu ${c.missed} nốt. Có thể bạn gảy nhẹ quá hoặc chưa kịp: gảy chắc tay hơn, hoặc giảm ${BPM_STEP} BPM.`);
  }
  if (c.extra) {
    tips.push(`Có ${c.extra} tiếng gảy thừa: một dây khác bị chạm, dây không chơi vẫn còn ngân, hoặc một nốt bị gảy hai lần.`);
  }

  const wrong = result.perNote.filter((n) => n.pitch === 'wrong');
  for (const n of wrong.slice(0, 3)) {
    tips.push(
      n.octaveOff
        ? `Nốt ${n.index + 1} đúng tên ${pitchClassName(n.expectedMidi)} nhưng lệch quãng tám (cần ${n.expectedName}, app nghe ra ${n.detectedName}).`
        : `Nốt ${n.index + 1} cần ${n.expectedName} (dây ${n.string}, phím ${n.fret}), app nghe ra ${n.detectedName}.`,
    );
  }
  if (wrong.length > 3) {
    tips.push(`Còn ${wrong.length - 3} nốt sai cao độ khác: kiểm tra ngón bấm có sát phím và đúng phím không.`);
  }
  if (c.pitchUnknown >= 2) {
    tips.push(`${c.pitchUnknown} nốt app không nghe rõ cao độ: gảy chắc tay hơn và dùng preset bass sạch, tắt hiệu ứng.`);
  }

  if (result.meanErrMs != null && Math.abs(result.meanErrMs) >= 15) {
    tips.push(
      result.meanErrMs < 0
        ? `Bạn hay chơi sớm khoảng ${formatNumber(-result.meanErrMs)} ms (vội). Nghe trọn tiếng click rồi mới gảy, đừng đoán trước.`
        : `Bạn hay chơi muộn khoảng ${formatNumber(result.meanErrMs)} ms (kéo). Đặt sẵn ngón lên dây trước khi tới phách.`,
    );
  }
  if (result.sdErrMs != null && result.sdErrMs >= 30) {
    tips.push(`Nhịp chưa đều: các nốt dao động khoảng ±${formatNumber(result.sdErrMs)} ms. Giảm ${BPM_STEP} BPM và đếm to theo click.`);
  }

  if (result.evenness) {
    const { ampDiffDb, timeDiffMs } = result.evenness;
    if (Math.abs(ampDiffDb) >= 3) {
      const louder = ampDiffDb > 0 ? 'các nốt 1, 3, 5…' : 'các nốt 2, 4, 6…';
      tips.push(
        `${capitalize(louder)} to hơn nhóm còn lại khoảng ${formatNumber(Math.abs(ampDiffDb), 1)} dB: một ngón gảy yếu hơn. Tập riêng gảy luân phiên thật chậm, nghe cho hai ngón to bằng nhau.`,
      );
    }
    if (Math.abs(timeDiffMs) >= 20) {
      const later = timeDiffMs > 0 ? 'các nốt 1, 3, 5…' : 'các nốt 2, 4, 6…';
      tips.push(`${capitalize(later)} thường muộn hơn khoảng ${formatNumber(Math.abs(timeDiffMs))} ms: nhịp gảy luân phiên đang bị khập khiễng.`);
    }
  }

  let suggestion = { type: 'stay', bpm };
  if (result.clean && streak >= CLEAN_RUNS_TO_LEVEL_UP && bpm + BPM_STEP <= lesson.maxBpm) {
    suggestion = { type: 'up', bpm: bpm + BPM_STEP };
  } else if (!result.clean && result.score < 50 && bpm - BPM_STEP >= lesson.minBpm) {
    suggestion = { type: 'down', bpm: bpm - BPM_STEP };
  }

  let headline;
  if (result.clean) {
    headline = streak >= CLEAN_RUNS_TO_LEVEL_UP ? `Sạch ${streak} lần liên tiếp` : `Lần chơi sạch ${streak}/${CLEAN_RUNS_TO_LEVEL_UP}`;
  } else if (result.score >= 75) {
    headline = 'Gần đạt, sửa vài chỗ dưới đây';
  } else if (result.score >= 50) {
    headline = 'Đang tiến bộ, tập chậm và chắc hơn';
  } else {
    headline = 'Giảm tốc độ, tập từng đoạn ngắn';
  }

  if (tips.length === 0) tips.push('Không có lỗi đáng kể. Giữ cảm giác này ở lần sau.');
  return { headline, tips, suggestion };
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
