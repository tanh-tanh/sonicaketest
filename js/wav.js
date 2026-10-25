// Ghi và đọc file WAV, cùng quy ước đặt tên bản thu để chấm lại bằng scripts/grade-wav.mjs.

/** Mã hoá mono Float32 thành WAV PCM 16-bit. */
export function encodeWav(samples, sampleRate) {
  const n = samples.length;
  const buffer = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buffer);
  writeAscii(v, 0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  writeAscii(v, 8, 'WAVE');
  writeAscii(v, 12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  writeAscii(v, 36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
  }
  return buffer;
}

/**
 * Đọc WAV PCM 8/16/24/32-bit hoặc float 32/64-bit, trộn các kênh thành mono.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{samples: Float32Array, sampleRate: number, channels: number}}
 */
export function decodeWav(arrayBuffer) {
  const v = new DataView(arrayBuffer);
  if (readAscii(v, 0, 4) !== 'RIFF' || readAscii(v, 8, 4) !== 'WAVE') throw new Error('Không phải file WAV');
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= v.byteLength) {
    const id = readAscii(v, offset, 4);
    const size = v.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      let format = v.getUint16(body, true);
      if (format === 0xfffe && size >= 26) format = v.getUint16(body + 24, true); // WAVE_FORMAT_EXTENSIBLE
      fmt = {
        format,
        channels: v.getUint16(body + 2, true),
        sampleRate: v.getUint32(body + 4, true),
        bits: v.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      data = { offset: body, size: Math.min(size, v.byteLength - body) };
    }
    offset = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('File WAV thiếu phần fmt hoặc data');
  if (fmt.format !== 1 && fmt.format !== 3) throw new Error(`Chưa hỗ trợ định dạng WAV ${fmt.format}`);

  const bytes = fmt.bits / 8;
  const frameBytes = bytes * fmt.channels;
  const frames = Math.floor(data.size / frameBytes);
  const out = new Float32Array(frames);
  const read = sampleReader(v, fmt);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) sum += read(data.offset + f * frameBytes + c * bytes);
    out[f] = sum / fmt.channels;
  }
  return { samples: out, sampleRate: fmt.sampleRate, channels: fmt.channels };
}

function sampleReader(v, { format, bits }) {
  if (format === 3 && bits === 32) return (o) => v.getFloat32(o, true);
  if (format === 3 && bits === 64) return (o) => v.getFloat64(o, true);
  if (format === 1 && bits === 8) return (o) => (v.getUint8(o) - 128) / 128;
  if (format === 1 && bits === 16) return (o) => v.getInt16(o, true) / 32768;
  if (format === 1 && bits === 24) {
    return (o) => {
      let x = v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getUint8(o + 2) << 16);
      if (x & 0x800000) x -= 0x1000000;
      return x / 8388608;
    };
  }
  if (format === 1 && bits === 32) return (o) => v.getInt32(o, true) / 2147483648;
  throw new Error(`Chưa hỗ trợ WAV ${bits}-bit`);
}

function writeAscii(v, offset, text) {
  for (let i = 0; i < text.length; i++) v.setUint8(offset + i, text.charCodeAt(i));
}

function readAscii(v, offset, length) {
  let s = '';
  for (let i = 0; i < length && offset + i < v.byteLength; i++) s += String.fromCharCode(v.getUint8(offset + i));
  return s;
}

/**
 * Tên file chứa đủ thông tin để chấm lại:
 * bc30_<id bài>_<bpm>bpm_<thời điểm phách đầu tiên trong bản thu, ms>ms_<độ trễ, ms>ms.wav
 */
export function recordingFileName({ lessonId, bpm, beatZeroMs, latencyMs }) {
  return `bc30_${lessonId}_${Math.round(bpm)}bpm_${Math.round(beatZeroMs)}ms_${Math.round(latencyMs)}ms.wav`;
}

export function parseRecordingFileName(name) {
  const m = /^bc30_([a-z0-9-]+)_(\d+)bpm_(-?\d+)ms_(-?\d+)ms\.wav$/i.exec(name);
  if (!m) return null;
  return { lessonId: m[1], bpm: Number(m[2]), beatZeroMs: Number(m[3]), latencyMs: Number(m[4]) };
}
