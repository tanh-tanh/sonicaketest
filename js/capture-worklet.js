// Chạy trong luồng âm thanh (AudioWorkletGlobalScope).
// Gom mẫu đầu vào thành từng khối 1024 mẫu, gửi kèm chỉ số khung (frame) của mẫu đầu tiên
// để luồng chính biết chính xác mỗi mẫu thuộc thời điểm nào trên đồng hồ AudioContext.

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 1024;
    this.buffer = new Float32Array(this.size);
    this.fill = 0;
    this.startFrame = 0;
    this.peak = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const left = input[0];
      const right = input.length > 1 ? input[1] : null;
      for (let i = 0; i < left.length; i++) {
        if (this.fill === 0) this.startFrame = currentFrame + i;
        const v = right ? 0.5 * (left[i] + right[i]) : left[i];
        this.buffer[this.fill++] = v;
        const a = v < 0 ? -v : v;
        if (a > this.peak) this.peak = a;
        if (this.fill === this.size) {
          this.port.postMessage({ frame: this.startFrame, data: this.buffer, peak: this.peak }, [this.buffer.buffer]);
          this.buffer = new Float32Array(this.size);
          this.fill = 0;
          this.peak = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('capture-processor', CaptureProcessor);
