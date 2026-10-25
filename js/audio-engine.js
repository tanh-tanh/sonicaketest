// Quản lý AudioContext, đầu vào từ Pocket Master (qua USB) và việc thu âm theo đúng khung thời gian.

export class AppAudioError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code;
  }
}

class RingBuffer {
  constructor(size) {
    this.data = new Float32Array(size);
    this.write = 0;
    this.filled = 0;
  }

  push(chunk) {
    for (let i = 0; i < chunk.length; i++) {
      this.data[this.write] = chunk[i];
      this.write = (this.write + 1) % this.data.length;
    }
    this.filled = Math.min(this.data.length, this.filled + chunk.length);
  }

  /** n mẫu mới nhất, hoặc null nếu chưa đủ. */
  latest(n) {
    if (n > this.filled) return null;
    const out = new Float32Array(n);
    let idx = (this.write - n + this.data.length) % this.data.length;
    for (let i = 0; i < n; i++) {
      out[i] = this.data[idx];
      idx = (idx + 1) % this.data.length;
    }
    return out;
  }
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.node = null;
    this.sink = null;
    this.ring = null;
    this.workletReady = false;
    this.recordings = new Set();
    this.levelListeners = new Set();
    this.lastChunkAt = 0;
    this.trackInfo = null;
  }

  get running() {
    return Boolean(this.stream && this.ctx && this.node);
  }

  get sampleRate() {
    return this.ctx ? this.ctx.sampleRate : 48000;
  }

  /** Bảo đảm có AudioContext (phải gọi từ một thao tác bấm của người dùng). */
  async ensureContext() {
    if (!window.isSecureContext) {
      throw new AppAudioError('insecure');
    }
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new AppAudioError('no-audio');
      this.ctx = new Ctx({ latencyHint: 'interactive' });
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    return this.ctx;
  }

  async start(deviceId) {
    if (!navigator.mediaDevices?.getUserMedia) throw new AppAudioError('no-media');
    const ctx = await this.ensureContext();
    if (!ctx.audioWorklet) throw new AppAudioError('no-worklet');
    if (!this.workletReady) {
      await ctx.audioWorklet.addModule(new URL('./capture-worklet.js', import.meta.url));
      this.workletReady = true;
    }

    this.stopInput();

    // Tắt mọi xử lý giọng nói của trình duyệt, nếu không tiếng bass sẽ bị "lọc" mất.
    const audio = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 2 },
    };
    if (deviceId) audio.deviceId = { exact: deviceId };

    this.stream = await navigator.mediaDevices.getUserMedia({ audio });
    this.source = ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(ctx, 'capture-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.node.port.onmessage = (event) => this.onChunk(event.data);
    // Nút worklet cần được nối tới đích để luôn chạy; gain = 0 nên không phát tiếng đàn ra loa.
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    this.source.connect(this.node);
    this.node.connect(this.sink);
    this.sink.connect(ctx.destination);
    this.ring = new RingBuffer(Math.round(ctx.sampleRate * 2));

    const track = this.stream.getAudioTracks()[0];
    const settings = track?.getSettings ? track.getSettings() : {};
    this.trackInfo = {
      label: track?.label ?? '',
      deviceId: settings.deviceId ?? deviceId ?? null,
      sampleRate: ctx.sampleRate,
      channelCount: settings.channelCount ?? null,
      echoCancellation: settings.echoCancellation ?? null,
      autoGainControl: settings.autoGainControl ?? null,
      noiseSuppression: settings.noiseSuppression ?? null,
    };
    return this.trackInfo;
  }

  stopInput() {
    for (const rec of this.recordings) rec.cancel();
    if (this.source) this.source.disconnect();
    if (this.node) {
      this.node.port.onmessage = null;
      this.node.disconnect();
    }
    if (this.sink) this.sink.disconnect();
    if (this.stream) for (const t of this.stream.getTracks()) t.stop();
    this.stream = null;
    this.source = null;
    this.node = null;
    this.sink = null;
    this.trackInfo = null;
  }

  onChunk({ frame, data, peak }) {
    this.lastChunkAt = performance.now();
    this.ring.push(data);
    for (const fn of this.levelListeners) fn(peak);
    for (const rec of this.recordings) rec.add(frame, data);
  }

  onLevel(fn) {
    this.levelListeners.add(fn);
    return () => this.levelListeners.delete(fn);
  }

  latestSamples(n) {
    return this.ring ? this.ring.latest(n) : null;
  }

  /**
   * Thu âm từ fromTime tới toTime (giây, theo đồng hồ AudioContext).
   * @returns {{promise: Promise<{samples: Float32Array, startFrame: number, sampleRate: number}>, cancel: () => void}}
   */
  record(fromTime, toTime) {
    const sampleRate = this.ctx.sampleRate;
    const fromFrame = Math.floor(fromTime * sampleRate);
    const toFrame = Math.ceil(toTime * sampleRate);
    const chunks = [];
    let settle;
    let fail;
    const promise = new Promise((resolve, reject) => {
      settle = resolve;
      fail = reject;
    });

    const recordings = this.recordings;
    const watchdog = setInterval(() => {
      if (performance.now() - this.lastChunkAt > 2000) {
        cleanup();
        fail(new AppAudioError('no-input'));
      }
    }, 500);

    const rec = {
      add(frame, data) {
        const end = frame + data.length;
        if (end <= fromFrame) return;
        chunks.push({ frame, data });
        if (end >= toFrame) {
          cleanup();
          settle(assemble(chunks, sampleRate));
        }
      },
      cancel() {
        cleanup();
        const err = new Error('Đã dừng');
        err.name = 'AbortError';
        fail(err);
      },
    };

    function cleanup() {
      clearInterval(watchdog);
      recordings.delete(rec);
    }

    this.recordings.add(rec);
    return { promise, cancel: () => rec.cancel() };
  }

  /** Ước lượng độ trễ của trình duyệt (chỉ để tham khảo, nên hiệu chỉnh thật). */
  browserLatencyMs() {
    if (!this.ctx) return null;
    const out = this.ctx.outputLatency || 0;
    const base = this.ctx.baseLatency || 0;
    return Math.round((out + base) * 1000);
  }
}

function assemble(chunks, sampleRate) {
  const startFrame = chunks[0].frame;
  const last = chunks[chunks.length - 1];
  const length = last.frame + last.data.length - startFrame;
  const samples = new Float32Array(length);
  for (const { frame, data } of chunks) samples.set(data, frame - startFrame);
  return { samples, startFrame, sampleRate };
}
