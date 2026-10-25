// Máy đếm nhịp lên lịch chính xác theo đồng hồ AudioContext.
// Tiếng click ở 1,3–1,8 kHz để không lẫn với tiếng bass khi phân tích.

export class Metronome {
  constructor(ctx) {
    this.ctx = ctx;
    this.sources = [];
    this.output = ctx.createGain();
    this.output.gain.value = 0.7;
    this.output.connect(ctx.destination);
    this.accent = makeClick(ctx, 1760);
    this.normal = makeClick(ctx, 1320);
  }

  setVolume(value) {
    this.output.gain.value = value;
  }

  /**
   * Lên lịch `count` tiếng click bắt đầu từ startTime.
   * @returns {number[]} thời điểm của từng tiếng click (giây, đồng hồ AudioContext)
   */
  schedule(startTime, bpm, count, beatsPerBar = 4) {
    const beatSec = 60 / bpm;
    const times = [];
    for (let i = 0; i < count; i++) {
      const t = startTime + i * beatSec;
      const src = this.ctx.createBufferSource();
      src.buffer = i % beatsPerBar === 0 ? this.accent : this.normal;
      src.connect(this.output);
      src.start(t);
      src.onended = () => {
        this.sources = this.sources.filter((s) => s !== src);
      };
      this.sources.push(src);
      times.push(t);
    }
    return times;
  }

  stop() {
    for (const src of this.sources) {
      try {
        src.stop();
      } catch {
        // nguồn đã dừng
      }
    }
    this.sources = [];
  }
}

function makeClick(ctx, freq) {
  const length = Math.round(ctx.sampleRate * 0.03);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const t = i / ctx.sampleRate;
    data[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 90) * 0.9;
  }
  return buffer;
}
