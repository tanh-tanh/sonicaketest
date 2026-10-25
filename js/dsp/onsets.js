// Phát hiện thời điểm gảy (onset) trong bản thu mono.
//
// Vì sao không dùng cửa sổ ngắn trên toàn dải: nốt E1 có chu kỳ 24 ms, nên năng lượng đo trên
// cửa sổ 5 ms dao động mạnh trong từng chu kỳ và sinh ra "tiếng gảy" giả. Ở đây dùng ba nhóm đặc trưng:
//   - toàn dải và hai dải âm cơ bản (35–75 Hz, 75–160 Hz): so năng lượng hai cửa sổ 40 ms liền nhau
//     (dài hơn một chu kỳ nốt trầm nhất), bắt nốt sau khoảng lặng, nốt to hơn, hoặc nốt chuyển hẳn sang
//     vùng cao độ khác (ví dụ từ dây G xuống dây E buông);
//   - ba dải tần cao (250–700 Hz, 700–2000 Hz, 2–6 kHz): hoạ âm cao của dây bass sáng lên ngay lúc gảy
//     rồi tắt nhanh, nên so 10 ms hiện tại với 40 ms trước đó sẽ thấy rõ tiếng gảy kể cả khi nốt trước
//     còn ngân hay hai nốt to bằng nhau.
// Nếu biết trước thời điểm các nốt (bài tập có nhịp), lượt thứ hai tìm lại với ngưỡng thấp hơn quanh
// những chỗ chưa thấy tiếng gảy nào. Cuối cùng vị trí được tinh chỉnh tới từng mẫu.

const PITCH_BANDS = [
  [35, 75],
  [75, 160],
];
const ATTACK_BANDS = [
  [250, 700],
  [700, 2000],
  [2000, 6000],
];

/**
 * @param {Float32Array} x
 * @param {number} sampleRate
 * @param {object} [opts]
 * @param {number} [opts.prerollSec] đoạn đầu bản thu được coi là im lặng để đo nhiễu nền
 * @param {number} [opts.sensitivity] 0..1, mặc định 0,5 (cao hơn = nhạy hơn)
 * @param {number[]} [opts.expectedSec] thời điểm dự kiến của các nốt (giây, tính từ đầu bản thu)
 * @returns {number[]} chỉ số mẫu của từng onset, đã sắp xếp
 */
export function detectOnsets(x, sampleRate, opts = {}) {
  const ctx = prepare(x, sampleRate, opts);
  if (!ctx) return [];
  const onsets = pick(ctx, 0);
  if (opts.expectedSec && opts.expectedSec.length) addGuided(ctx, onsets, opts.expectedSec);
  return onsets.sort((a, b) => a - b);
}

function prepare(x, sampleRate, opts) {
  const hop = opts.hop ?? Math.max(16, Math.round(sampleRate * 0.005));
  const W = Math.round(sampleRate * 0.04);
  const S = Math.round(sampleRate * 0.01);
  const n = x.length;
  if (n < 3 * W) return null;

  const sensitivity = clamp(opts.sensitivity ?? 0.5, 0, 1);
  const nyquist = sampleRate / 2;
  const pitchBands = PITCH_BANDS.map(([lo, hi]) => bandPass(x, sampleRate, lo, hi));
  const attackBands = ATTACK_BANDS.filter(([lo]) => lo < nyquist * 0.8).map(([lo, hi]) =>
    bandPass(x, sampleRate, lo, Math.min(hi, nyquist * 0.9)),
  );
  const cx = prefixEnergy(x);
  const cps = pitchBands.map(prefixEnergy);
  const cas = attackBands.map(prefixEnergy);

  const frames = [];
  for (let s = W; s + W <= n; s += hop) {
    const level = db((cx[s + W] - cx[s]) / W);
    const nov = level - db((cx[s] - cx[s - W]) / W);
    const pLevel = [];
    const pNov = [];
    for (const c of cps) {
      const cur = db((c[s + W] - c[s]) / W);
      pLevel.push(cur);
      pNov.push(cur - db((c[s] - c[s - W]) / W));
    }
    const aLevel = [];
    const aNov = [];
    for (const c of cas) {
      const cur = db((c[s + S] - c[s]) / S);
      aLevel.push(cur);
      aNov.push(cur - db((c[s] - c[s - W]) / W));
    }
    frames.push({ s, level, nov, pLevel, pNov, aLevel, aNov });
  }
  if (frames.length === 0) return null;

  // Một tiếng gảy thật luôn làm các dải cao sáng lên ít nhiều; dao động (beat) giữa hai dây
  // đang ngân thì không. aPeak[i] = độ tăng lớn nhất của dải cao quanh khung i (±20 ms).
  const aMax = frames.map((f) => Math.max(...f.aNov));
  const span = 4;
  const aPeak = aMax.map((_, i) => {
    let m = -Infinity;
    for (let j = Math.max(0, i - span); j <= Math.min(aMax.length - 1, i + span); j++) m = Math.max(m, aMax[j]);
    return m;
  });

  const prerollSamples = Math.round((opts.prerollSec ?? 0) * sampleRate);
  const quiet = frames.filter((f) => f.s + W <= prerollSamples);
  const gateFor = (get, aboveFloor, belowPeak) => {
    const values = frames.map(get).sort((a, b) => a - b);
    let floor = values[Math.floor(values.length * 0.1)];
    if (quiet.length >= 5) floor = Math.min(floor, median(quiet.map(get)));
    return Math.max(floor + aboveFloor, values[values.length - 1] - belowPeak);
  };

  return {
    x,
    sampleRate,
    n,
    W,
    S,
    frames,
    aPeak,
    confirmDb: opts.confirmDb ?? 3,
    attackBands,
    minGap: Math.round((opts.minGapSec ?? 0.08) * sampleRate),
    riseDb: opts.riseDb ?? 8 - 4 * sensitivity, // 6 dB ở mức mặc định
    bandRiseDb: opts.bandRiseDb ?? 12 - 6 * sensitivity, // 9 dB ở mức mặc định
    gate: gateFor((f) => f.level, 15, 35),
    pGates: pitchBands.map((_, k) => gateFor((f) => f.pLevel[k], 15, 35)),
    aGates: attackBands.map((_, k) => gateFor((f) => f.aLevel[k], 10, 45)),
  };
}

/** Mức "vượt ngưỡng" của một khung (dB); > 0 nghĩa là có dấu hiệu tiếng gảy. relax: hạ ngưỡng bao nhiêu dB. */
function frameScore(ctx, i, relax) {
  const f = ctx.frames[i];
  if (f.level < ctx.gate - relax) return { score: -Infinity, band: -1, long: false };
  let score = -Infinity;
  let long = false;
  // Đặc trưng cửa sổ dài chỉ được tính khi dải cao xác nhận có tiếng gảy.
  if (ctx.aPeak[i] >= ctx.confirmDb - relax / 2) {
    score = f.nov - (ctx.riseDb - relax);
    for (let k = 0; k < f.pNov.length; k++) {
      if (f.pLevel[k] >= ctx.pGates[k] - relax) {
        const v = f.pNov[k] - (ctx.riseDb - relax);
        if (v > score) score = v;
      }
    }
    long = score > 0;
  }
  let band = -1;
  let bandScore = -Infinity;
  for (let k = 0; k < f.aNov.length; k++) {
    if (f.aLevel[k] >= ctx.aGates[k] - relax) {
      const v = f.aNov[k] - (ctx.bandRiseDb - relax);
      if (v > bandScore) {
        bandScore = v;
        band = k;
      }
    }
  }
  if (bandScore > score) score = bandScore;
  return { score, band: bandScore > 0 ? band : -1, long };
}

function pick(ctx, relax, fromFrame = 0, toFrame = ctx.frames.length) {
  const onsets = [];
  let group = null;
  const flush = () => {
    if (!group) return;
    const sample = refine(ctx, group);
    if (onsets.length === 0 || sample - onsets[onsets.length - 1] >= ctx.minGap) onsets.push(sample);
    group = null;
  };
  for (let i = fromFrame; i < toFrame; i++) {
    const f = ctx.frames[i];
    const { score, band, long } = frameScore(ctx, i, relax);
    if (score > 0) {
      const reach = long ? ctx.W : ctx.S;
      if (group) {
        group.end = f.s;
        group.reach = Math.max(group.reach, reach);
        if (band >= 0 && score > group.bestScore) {
          group.bestScore = score;
          group.band = band;
        }
      } else {
        group = { start: f.s, end: f.s, reach, band, bestScore: band >= 0 ? score : -Infinity };
      }
    } else {
      flush();
    }
  }
  flush();
  return onsets;
}

/** Lượt hai: tìm tiếng gảy yếu quanh những nốt dự kiến chưa có onset nào. */
function addGuided(ctx, onsets, expectedSec) {
  const { sampleRate, frames } = ctx;
  const hop = frames.length > 1 ? frames[1].s - frames[0].s : 1;
  const sorted = expectedSec.slice().sort((a, b) => a - b);
  sorted.forEach((t, i) => {
    const prevGap = i > 0 ? t - sorted[i - 1] : Infinity;
    const nextGap = i + 1 < sorted.length ? sorted[i + 1] - t : Infinity;
    const before = Math.min(0.2, prevGap / 2);
    const after = Math.min(0.2, nextGap / 2);
    const lo = (t - before) * sampleRate;
    const hi = (t + after) * sampleRate;
    if (onsets.some((o) => o >= lo && o <= hi)) return;

    const first = Math.max(0, Math.floor((lo - ctx.W - frames[0].s) / hop));
    const last = Math.min(frames.length, Math.ceil((hi - frames[0].s) / hop) + 1);
    const found = pick(ctx, 4, first, last).filter((o) => o >= lo && o <= hi);
    if (found.length === 0) return;
    const best = found.reduce((a, b) => (Math.abs(b - t * sampleRate) < Math.abs(a - t * sampleRate) ? b : a));
    if (onsets.every((o) => Math.abs(o - best) >= ctx.minGap)) onsets.push(best);
  });
}

/** Lọc dải: hai tầng thông cao bậc một ở lo và hai tầng thông thấp bậc một ở hi. */
export function bandPass(x, sampleRate, lo, hi) {
  const dt = 1 / sampleRate;
  const rcH = 1 / (2 * Math.PI * lo);
  const a = rcH / (rcH + dt);
  const rcL = 1 / (2 * Math.PI * hi);
  const b = dt / (rcL + dt);
  const y = new Float32Array(x.length);
  let h1 = 0;
  let h2 = 0;
  let l1 = 0;
  let l2 = 0;
  let px = 0;
  let ph = 0;
  for (let i = 0; i < x.length; i++) {
    h1 = a * (h1 + x[i] - px);
    px = x[i];
    h2 = a * (h2 + h1 - ph);
    ph = h1;
    l1 += b * (h2 - l1);
    l2 += b * (l1 - l2);
    y[i] = l2;
  }
  return y;
}

function prefixEnergy(x) {
  const c = new Float64Array(x.length + 1);
  for (let i = 0; i < x.length; i++) c[i + 1] = c[i] + x[i] * x[i];
  return c;
}

const db = (power) => 10 * Math.log10(power + 1e-12);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function median(values) {
  const s = values.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Tìm mẫu bắt đầu tiếng gảy trong vùng của nhóm khung. */
function refine(ctx, group) {
  const { x, attackBands, sampleRate } = ctx;
  const start = group.start;
  const end = Math.min(ctx.n, group.end + group.reach);
  const back = Math.round(0.02 * sampleRate);
  // Ưu tiên dải có tiếng gảy rõ nhất, rồi tới các dải cao hơn.
  const order = [];
  if (group.band >= 0) order.push(group.band);
  for (let k = attackBands.length - 1; k >= 0; k--) if (k !== group.band) order.push(k);

  for (const k of order) {
    const sig = attackBands[k];
    let peak = 0;
    let peakIdx = start;
    for (let i = start; i < end; i++) {
      const a = Math.abs(sig[i]);
      if (a > peak) {
        peak = a;
        peakIdx = i;
      }
    }
    const base = rms(sig, Math.max(0, start - back), start);
    if (peak > 1e-6 && peak >= 6 * base) {
      const threshold = Math.max(0.25 * peak, 3 * base);
      for (let i = Math.max(start, peakIdx - Math.round(0.015 * sampleRate)); i <= peakIdx; i++) {
        if (Math.abs(sig[i]) >= threshold) return i;
      }
      return peakIdx;
    }
  }

  // Không dải nào rõ: dựa vào biên độ toàn dải (đã nhấn nhẹ tần số cao).
  let pMax = 0;
  let pIdx = start;
  for (let i = Math.max(1, start); i < end; i++) {
    const a = Math.abs(x[i] - 0.97 * x[i - 1]);
    if (a > pMax) {
      pMax = a;
      pIdx = i;
    }
  }
  let sum = 0;
  let count = 0;
  for (let i = Math.max(1, start - back); i < start; i++) {
    const v = x[i] - 0.97 * x[i - 1];
    sum += v * v;
    count++;
  }
  const pBase = count ? Math.sqrt(sum / count) : 0;
  const threshold = Math.min(0.8 * pMax, Math.max(0.3 * pMax, 3 * pBase));
  for (let i = Math.max(1, pIdx - Math.round(0.025 * sampleRate)); i <= pIdx; i++) {
    if (Math.abs(x[i] - 0.97 * x[i - 1]) >= threshold) return i;
  }
  return pIdx;
}

function rms(x, start, end) {
  let s = 0;
  for (let i = start; i < end; i++) s += x[i] * x[i];
  return end > start ? Math.sqrt(s / (end - start)) : 0;
}
