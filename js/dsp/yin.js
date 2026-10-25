// Nhận cao độ bằng thuật toán YIN (de Cheveigné & Kawahara, 2002).
// Hàm thuần: chạy được trong trình duyệt và trong Node (để test).

/**
 * @param {Float32Array} buf tín hiệu mono
 * @param {number} sampleRate
 * @param {{minFreq?: number, maxFreq?: number, threshold?: number}} [opts]
 * @returns {{freq: number, confidence: number} | null}
 */
export function yin(buf, sampleRate, opts = {}) {
  const minFreq = opts.minFreq ?? 35;
  const maxFreq = opts.maxFreq ?? 450;
  const threshold = opts.threshold ?? 0.15;
  const n = buf.length;

  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  const tauMax = Math.min(Math.ceil(sampleRate / minFreq), Math.floor(n / 2));
  if (tauMax <= tauMin + 2) return null;
  const W = n - tauMax;

  let energy = 0;
  for (let i = 0; i < n; i++) energy += buf[i] * buf[i];
  if (energy / n < 1e-8) return null; // khoảng -80 dBFS: coi như im lặng

  // Hàm sai phân d(tau)
  const d = new Float64Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < W; j++) {
      const diff = buf[j] - buf[j + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // Sai phân chuẩn hoá theo trung bình tích luỹ
  const cmnd = new Float64Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }

  // Ngưỡng tuyệt đối: lấy điểm trũng đầu tiên dưới ngưỡng
  let tauEst = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauEst = tau;
      break;
    }
  }
  if (tauEst === -1) {
    let best = tauMin;
    for (let tau = tauMin + 1; tau <= tauMax; tau++) {
      if (cmnd[tau] < cmnd[best]) best = tau;
    }
    if (cmnd[best] > 0.35) return null;
    tauEst = best;
  }

  // Nội suy parabol để có độ chính xác dưới một mẫu
  let refined = tauEst;
  if (tauEst > 1 && tauEst < tauMax) {
    const s0 = cmnd[tauEst - 1];
    const s1 = cmnd[tauEst];
    const s2 = cmnd[tauEst + 1];
    const denom = s0 + s2 - 2 * s1;
    if (denom !== 0) {
      const shift = (s0 - s2) / (2 * denom);
      if (Math.abs(shift) < 1) refined = tauEst + shift;
    }
  }

  return {
    freq: sampleRate / refined,
    confidence: Math.max(0, Math.min(1, 1 - cmnd[tauEst])),
  };
}

/**
 * Giảm tần số lấy mẫu đi 2 lần, có lọc thông thấp đơn giản [1/4, 1/2, 1/4].
 * Đủ tốt cho bass (năng lượng chính nằm dưới vài kHz) và giúp YIN nhanh gấp ~4 lần.
 */
export function downsample2(x) {
  const m = Math.floor(x.length / 2);
  const y = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    const c = 2 * i;
    const prev = c > 0 ? x[c - 1] : x[c];
    const next = c + 1 < x.length ? x[c + 1] : x[c];
    y[i] = 0.25 * prev + 0.5 * x[c] + 0.25 * next;
  }
  return y;
}
