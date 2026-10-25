// Tiện ích âm nhạc dùng chung (chạy được cả trong trình duyệt lẫn Node).

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Dây bass 4 dây, từ trầm đến cao. */
export const STRINGS = ['E', 'A', 'D', 'G'];

/** Cao độ MIDI của dây buông: E1 = 28 (41,2 Hz), A1 = 33, D2 = 38, G2 = 43. */
export const OPEN_MIDI = Object.freeze({ E: 28, A: 33, D: 38, G: 43 });

export function midiToFreq(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

/** Tên nốt kèm quãng tám, ví dụ 28 -> "E1". Nhận cả số lẻ (làm tròn). */
export function noteName(midi) {
  const m = Math.round(midi);
  return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

/** Tên nốt không kèm quãng tám, ví dụ 28 -> "E". */
export function pitchClassName(midi) {
  const m = Math.round(midi);
  return NOTE_NAMES[((m % 12) + 12) % 12];
}

export function positionToMidi(string, fret) {
  if (!(string in OPEN_MIDI)) throw new Error(`Dây không hợp lệ: ${string}`);
  if (!Number.isInteger(fret) || fret < 0 || fret > 24) throw new Error(`Phím không hợp lệ: ${fret}`);
  return OPEN_MIDI[string] + fret;
}

/** Độ lệch (cent) của tần số so với một nốt MIDI. */
export function centsFrom(freq, midi) {
  return 1200 * Math.log2(freq / midiToFreq(midi));
}
