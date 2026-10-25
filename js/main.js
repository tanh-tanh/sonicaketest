// Điều khiển giao diện: chuyển màn, kết nối thiết bị, lên dây, đo độ trễ, tập và hiện kết quả.

import { AudioEngine, AppAudioError } from './audio-engine.js';
import { Metronome } from './metronome.js';
import { LESSONS, getLesson, lessonLengthBeats } from './lessons.js';
import { gradeRecording, measureLatency } from './grade.js';
import { buildFeedback, formatNumber, BPM_STEP, CLEAN_RUNS_TO_LEVEL_UP } from './feedback.js';
import { readPitch, nearestString, tunerWindowSize } from './tuner.js';
import { loadState, saveState, clearState, lessonState, recordAttempt, setLessonBpm } from './storage.js';
import { renderStaff, highlightNote } from './ui/staff.js';
import { renderTimingChart } from './ui/timing-chart.js';
import { simulateAttempt } from './simulate.js';
import { encodeWav, recordingFileName } from './wav.js';
import { TOLERANCE } from './scoring.js';
import { STRINGS } from './music.js';

const $ = (id) => document.getElementById(id);
const views = Array.from(document.querySelectorAll('.view'));
const engine = new AudioEngine();
const reducedMotion =
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const CAL = { bpm: 80, countIn: 4, clicks: 8 };

let state = loadState();
let metronome = null;
let currentView = 'home';
let currentLesson = null;
let session = null; // phiên đang chạy: đo độ trễ hoặc bài tập
let lastAttempt = null; // lần chơi gần nhất (để nghe lại / tải về)
let lastPerNote = null;
let tuner = null;
let playback = null;
let meterRaf = 0;
let levelPeak = 0;
let recentMaxDb = -120;
let lastClipAt = -Infinity;

// ---------- Tiện ích ----------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(className, text, onClick) {
  const b = el('button', className, text);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

function median(values) {
  const s = values.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

function scrollToTop() {
  try {
    window.scrollTo(0, 0);
  } catch {
    // một số môi trường không hỗ trợ
  }
}

function scrollIntoView(node) {
  if (node && typeof node.scrollIntoView === 'function') {
    node.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
  }
}

function needsInputMessage(target) {
  const link = button('link-button', 'Mở trang Kết nối');
  link.dataset.goto = 'connect';
  target.replaceChildren('Chưa bật đầu vào âm thanh. ', link);
}

function describeError(err) {
  if (err instanceof AppAudioError) {
    const messages = {
      insecure: 'Trang cần mở qua https:// (ví dụ GitHub Pages) hoặc http://localhost thì trình duyệt mới cho thu âm.',
      'no-media': 'Trình duyệt này không cho thu âm. Dùng Chrome, Edge, Firefox hoặc Safari bản mới.',
      'no-worklet': 'Trình duyệt này thiếu AudioWorklet. Cập nhật Chrome, Edge, Firefox hoặc Safari lên bản mới.',
      'no-audio': 'Trình duyệt này không hỗ trợ Web Audio.',
      'no-input': 'Không còn nhận được tín hiệu từ thiết bị. Kiểm tra cáp USB-C rồi bật lại đầu vào ở trang Kết nối.',
    };
    return messages[err.code] ?? err.message;
  }
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Trình duyệt chưa cho phép dùng micro. Bấm biểu tượng ổ khoá cạnh thanh địa chỉ, cho phép Micro, rồi bật lại.';
    case 'NotFoundError':
      return 'Không tìm thấy thiết bị thu nào. Cắm Pocket Master bằng cáp hai đầu USB-C rồi thử lại.';
    case 'NotReadableError':
      return 'Thiết bị đang bận. Đóng các ứng dụng khác đang dùng âm thanh rồi thử lại.';
    case 'OverconstrainedError':
      return 'Thiết bị đã chọn không còn. Chọn lại trong danh sách.';
    default:
      return `Không bật được đầu vào: ${err?.message ?? err}`;
  }
}

// ---------- Chuyển màn ----------

function show(name, { focus = true } = {}) {
  if (session) stopSession();
  if (name !== 'tune') stopTuner();
  currentView = name;
  for (const view of views) view.hidden = view.dataset.view !== name;
  if (name === 'home') renderHome();
  if (name === 'tune') startTuner();
  if (name === 'calibrate') renderCalibrationBeats(-1);
  scrollToTop();
  if (focus) {
    const heading = views.find((v) => v.dataset.view === name)?.querySelector('h1');
    heading?.focus({ preventScroll: true });
  }
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-goto]');
  if (!target) return;
  event.preventDefault();
  show(target.dataset.goto);
});

// ---------- Trang chính ----------

function renderHome() {
  updateSetupSteps();
  const list = $('lesson-list');
  list.replaceChildren();
  for (const week of [...new Set(LESSONS.map((l) => l.week))]) {
    const section = el('section');
    const ul = el('ul', 'lessons');
    for (const lesson of LESSONS.filter((l) => l.week === week)) {
      const ls = state.lessons[lesson.id];
      const day = el('span', 'lesson-day', 'Ngày');
      day.append(el('strong', null, String(lesson.day)));
      const main = el('span');
      main.append(el('span', 'lesson-title', lesson.title), el('span', 'lesson-meta', lessonMeta(lesson, ls)));
      const score = el('span', 'lesson-score');
      if (ls?.best != null) {
        score.textContent = String(ls.best);
        score.classList.add(ls.best >= 85 ? 'is-good' : ls.best >= 60 ? 'is-ok' : 'is-bad');
        score.setAttribute('aria-label', `Điểm cao nhất ${ls.best}`);
      }
      const b = button('lesson', null, () => openLesson(lesson.id));
      b.append(day, main, score);
      const li = el('li');
      li.append(b);
      ul.append(li);
    }
    section.append(el('h2', null, `Tuần ${week}`), ul);
    list.append(section);
  }
}

function lessonMeta(lesson, ls) {
  const parts = [`${ls?.bpm ?? lesson.bpm} BPM`, `${lesson.notes.length} nốt`];
  const count = ls?.attempts?.length ?? 0;
  if (count) parts.push(`đã tập ${count} lần`);
  if (ls?.streak) parts.push(`sạch ${ls.streak}/${CLEAN_RUNS_TO_LEVEL_UP}`);
  return parts.join(', ');
}

function updateSetupSteps() {
  const connected = engine.running;
  setStep('connect', 1, connected, connected ? engine.trackInfo?.label || 'Đã bật' : 'Chưa bật');
  const tuned = state.tunedAt && Date.now() - state.tunedAt < 6 * 3600 * 1000;
  setStep(
    'tune',
    2,
    Boolean(tuned),
    tuned ? (state.tuneSeconds != null ? `Xong trong ${state.tuneSeconds} giây` : 'Đã lên dây') : 'Nên làm mỗi buổi',
  );
  const calibrated = state.latencyMs != null;
  setStep('calibrate', 3, calibrated, calibrated ? `${state.latencyMs} ms` : 'Chưa đo');
  const chip = $('status');
  chip.textContent = connected ? 'Đã kết nối' : 'Chưa kết nối';
  chip.classList.toggle('is-on', connected);
}

function setStep(name, number, done, text) {
  const dot = $(`dot-${name}`);
  dot.classList.toggle('is-done', done);
  dot.textContent = done ? '✓' : String(number);
  $(`state-${name}`).textContent = text;
}

$('btn-clear').addEventListener('click', () => {
  if (!window.confirm('Xoá toàn bộ lịch sử tập, độ trễ đã đo và cài đặt trên thiết bị này?')) return;
  state = clearState();
  syncSettingsControls();
  renderHome();
});

// ---------- Kết nối ----------

$('btn-enable').addEventListener('click', () => enableInput(state.deviceId));
$('device').addEventListener('change', (event) => enableInput(event.target.value));
if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    if (engine.running) populateDevices(engine.trackInfo?.deviceId).catch(() => {});
  });
}

async function enableInput(deviceId) {
  const errorBox = $('connect-error');
  const enable = $('btn-enable');
  errorBox.hidden = true;
  enable.disabled = true;
  try {
    let info;
    try {
      info = await engine.start(deviceId || undefined);
    } catch (err) {
      if (deviceId && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) {
        info = await engine.start(undefined);
      } else {
        throw err;
      }
    }
    state.deviceId = info.deviceId ?? null;
    saveState(state);
    await populateDevices(info.deviceId);
    showDeviceInfo(info);
    $('meter-block').hidden = false;
    enable.textContent = 'Bật lại đầu vào';
    startMeters();
  } catch (err) {
    errorBox.textContent = describeError(err);
    errorBox.hidden = false;
  } finally {
    enable.disabled = false;
    updateSetupSteps();
  }
}

async function populateDevices(selectedId) {
  const select = $('device');
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  select.replaceChildren(
    ...devices.map((d, i) => {
      const option = el('option', null, d.label || `Thiết bị thu ${i + 1}`);
      option.value = d.deviceId;
      return option;
    }),
  );
  if (selectedId && devices.some((d) => d.deviceId === selectedId)) select.value = selectedId;
  select.disabled = devices.length === 0;
}

const voiceProcessingOn = (info) =>
  info.echoCancellation === true || info.noiseSuppression === true || info.autoGainControl === true;
const looksBuiltIn = (label = '') =>
  /built-in|internal|tích hợp|iphone|ipad|macbook/i.test(label) && !/usb|pocket|sonicake/i.test(label);

function showDeviceInfo(info) {
  const dl = $('device-info');
  const rows = [
    ['Thiết bị', info.label || 'Không rõ tên'],
    ['Tần số lấy mẫu', `${formatNumber(info.sampleRate / 1000, 1)} kHz`],
    ['Số kênh', info.channelCount == null ? 'Không rõ' : String(info.channelCount)],
    ['Lọc giọng nói', voiceProcessingOn(info) ? 'Vẫn đang bật' : 'Đã tắt'],
  ];
  dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', null, k), el('dd', null, v)]));
  dl.hidden = false;

  const warnings = [];
  if (looksBuiltIn(info.label)) {
    warnings.push('Thiết bị này có vẻ là micro của máy, không phải Pocket Master. Chọn thiết bị USB trong danh sách.');
  }
  if (voiceProcessingOn(info)) {
    warnings.push('Trình duyệt vẫn đang lọc giọng nói nên tiếng bass có thể bị méo. Thử Chrome hoặc Edge bản mới.');
  }
  const warn = $('connect-warning');
  warn.textContent = warnings.join(' ');
  warn.hidden = warnings.length === 0;
}

function startMeters() {
  if (meterRaf) return;
  engine.onLevel((peak) => {
    if (peak > levelPeak) levelPeak = peak;
    if (peak > 0.98) lastClipAt = performance.now();
  });
  let lastLabelAt = 0;
  const tick = (now) => {
    const db = 20 * Math.log10(levelPeak + 1e-9);
    const pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
    $('meter-fill').style.width = `${pct}%`;
    $('practice-meter').style.width = `${pct}%`;
    recentMaxDb = Math.max(db, recentMaxDb - 0.25);
    if (now - lastLabelAt > 400) {
      lastLabelAt = now;
      updateMeterLabel(now);
    }
    levelPeak *= 0.86;
    meterRaf = requestAnimationFrame(tick);
  };
  meterRaf = requestAnimationFrame(tick);
}

function updateMeterLabel(now) {
  let text;
  if (now - lastClipAt < 1500) text = 'Tín hiệu quá lớn nên bị méo. Giảm volume trên Pocket Master.';
  else if (recentMaxDb < -45) text = 'Chưa nghe thấy tiếng đàn. Gảy thử, kiểm tra cáp và volume trên Pocket Master.';
  else if (recentMaxDb < -30) text = 'Tín hiệu hơi nhỏ. Tăng volume trên Pocket Master một chút.';
  else text = 'Tín hiệu tốt.';
  const label = $('meter-label');
  if (label.textContent !== text) label.textContent = text;
}

// ---------- Lên dây ----------

$('btn-tune-reset').addEventListener('click', () => startTuner());

function startTuner() {
  stopTuner();
  tuner = { timer: 0, history: [], hold: {}, done: new Set(), startedAt: null, miss: 0, finished: false };
  $('tuner-time').textContent = '';
  renderTunerStrings(null);
  setTunerIdle();
  if (!engine.running) {
    needsInputMessage($('tuner-hint'));
    return;
  }
  $('tuner-hint').textContent = 'Đang chờ tiếng đàn.';
  const size = tunerWindowSize(engine.sampleRate);
  tuner.timer = setInterval(() => {
    const samples = engine.latestSamples(size);
    updateTuner(samples ? readPitch(samples, engine.sampleRate) : null);
  }, 100);
}

function stopTuner() {
  if (!tuner) return;
  clearInterval(tuner.timer);
  tuner = null;
}

function setTunerIdle() {
  $('tuner-note').textContent = '–';
  $('tuner-octave').textContent = '';
  const needle = $('tuner-needle');
  needle.className = 'tuner-needle';
  needle.style.left = '50%';
}

function updateTuner(reading) {
  if (!tuner) return;
  if (!reading) {
    tuner.miss += 1;
    for (const s of STRINGS) tuner.hold[s] = 0;
    if (tuner.miss === 6) {
      setTunerIdle();
      $('tuner-hint').textContent = 'Đang chờ tiếng đàn.';
      renderTunerStrings(null);
    }
    return;
  }
  tuner.miss = 0;
  if (tuner.startedAt == null) tuner.startedAt = performance.now();
  tuner.history.push(reading);
  if (tuner.history.length > 5) tuner.history.shift();
  const midi = median(tuner.history.filter((r) => r.nearest === reading.nearest).map((r) => r.midi));

  const octave = /-?\d+$/.exec(reading.name)?.[0] ?? '';
  $('tuner-note').textContent = reading.name.slice(0, reading.name.length - octave.length);
  $('tuner-octave').textContent = octave;

  const target = nearestString(midi);
  const active = Math.abs(target.diffSemitones) <= 2.5 ? target.string : null;
  const cents = active ? target.cents : (midi - Math.round(midi)) * 100;
  const inTune = active != null && Math.abs(cents) <= 5;

  const needle = $('tuner-needle');
  needle.className = `tuner-needle is-live${inTune ? ' is-in-tune' : ''}`;
  needle.style.left = `${50 + Math.max(-50, Math.min(50, cents))}%`;

  let hint;
  if (!active) hint = `Đang nghe ${reading.name}. Gảy một dây buông.`;
  else if (inTune) hint = `Dây ${active}: chuẩn.`;
  else if (cents > 0) hint = `Dây ${active}: cao ${Math.round(cents)} cent, nới dây ra.`;
  else hint = `Dây ${active}: thấp ${Math.round(-cents)} cent, vặn căng lên.`;
  $('tuner-hint').textContent = hint;

  for (const s of STRINGS) if (s !== active) tuner.hold[s] = 0;
  if (active) {
    tuner.hold[active] = inTune ? (tuner.hold[active] ?? 0) + 1 : 0;
    if (tuner.hold[active] >= 6) tuner.done.add(active);
  }
  renderTunerStrings(active);

  if (!tuner.finished && tuner.done.size === STRINGS.length) {
    tuner.finished = true;
    const seconds = Math.max(1, Math.round((performance.now() - tuner.startedAt) / 1000));
    state.tunedAt = Date.now();
    state.tuneSeconds = seconds;
    saveState(state);
    $('tuner-time').textContent = `Xong cả 4 dây trong ${seconds} giây.`;
  }
}

function renderTunerStrings(active) {
  $('tuner-strings').replaceChildren(
    ...STRINGS.map((s) => {
      const done = Boolean(tuner?.done.has(s));
      const li = el('li');
      if (done) li.classList.add('is-done');
      if (s === active) li.classList.add('is-active');
      li.append(el('strong', null, s), el('span', null, done ? 'Xong' : 'Chưa'));
      return li;
    }),
  );
}

// ---------- Phiên đang chạy ----------

function stopSession() {
  if (!session) return;
  const s = session;
  session = null;
  s.cancel();
  cancelAnimationFrame(s.raf);
  s.cleanup?.();
}

function finishSession() {
  if (!session) return;
  const s = session;
  session = null;
  cancelAnimationFrame(s.raf);
  s.cleanup?.();
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden || !session) return;
  const target = session.kind === 'calibrate' ? $('cal-result') : $('session-status');
  stopSession();
  target.textContent = 'Đã dừng vì bạn chuyển sang ứng dụng khác.';
});

// ---------- Đo độ trễ ----------

$('btn-calibrate').addEventListener('click', runCalibration);

function renderCalibrationBeats(activeIndex) {
  const box = $('cal-beats');
  const total = CAL.countIn + CAL.clicks;
  if (box.childElementCount !== total) {
    box.replaceChildren(...Array.from({ length: total }, (_, i) => el('span', i < CAL.countIn ? 'is-countin' : null)));
  }
  Array.from(box.children).forEach((dot, i) => dot.classList.toggle('is-on', activeIndex >= 0 && i <= activeIndex));
}

async function runCalibration() {
  if (session) return;
  const out = $('cal-result');
  if (!engine.running) {
    needsInputMessage(out);
    return;
  }
  let ctx;
  try {
    ctx = await engine.ensureContext();
  } catch (err) {
    out.textContent = describeError(err);
    return;
  }
  metronome ??= new Metronome(ctx);
  metronome.setVolume(state.clickVolume);
  const beat = 60 / CAL.bpm;
  const t0 = ctx.currentTime + 0.3;
  const times = metronome.schedule(t0, CAL.bpm, CAL.countIn + CAL.clicks, 4);
  const playTimes = times.slice(CAL.countIn);
  const rec = engine.record(playTimes[0] - 0.5, playTimes[playTimes.length - 1] + 0.7);
  const start = $('btn-calibrate');
  start.disabled = true;
  out.textContent = 'Nghe 4 tiếng đếm vào, rồi gảy dây E buông theo 8 tiếng click.';
  session = {
    kind: 'calibrate',
    raf: 0,
    cancel: () => {
      rec.cancel();
      metronome.stop();
    },
    cleanup: () => {
      start.disabled = false;
      renderCalibrationBeats(-1);
    },
  };
  const step = () => {
    if (!session || session.kind !== 'calibrate') return;
    renderCalibrationBeats(Math.min(Math.floor((ctx.currentTime - t0) / beat), CAL.countIn + CAL.clicks - 1));
    session.raf = requestAnimationFrame(step);
  };
  session.raf = requestAnimationFrame(step);

  try {
    const recording = await rec.promise;
    finishSession();
    const res = measureLatency(recording, playTimes, { sensitivity: state.sensitivity });
    if (res.ok && res.latencyMs > -40 && res.latencyMs < 500) {
      state.latencyMs = res.latencyMs;
      state.latencySpreadMs = res.spreadMs;
      state.calibratedAt = Date.now();
      saveState(state);
      out.textContent = `Độ trễ: ${res.latencyMs} ms, dao động ±${res.spreadMs} ms. App sẽ trừ con số này khi chấm nhịp.`;
    } else if (res.ok) {
      out.textContent = `Đo được ${res.latencyMs} ms, con số bất thường nên chưa lưu. Kiểm tra cáp rồi đo lại.`;
    } else if (res.reason === 'too-few') {
      out.textContent = `Chỉ nghe được ${res.heard}/${res.needed} tiếng gảy. Kiểm tra mức tín hiệu ở trang Kết nối, gảy chắc tay hơn rồi đo lại.`;
    } else {
      out.textContent = `Các lần gảy chưa đều (lệch nhau khoảng ±${res.spread} ms). Đo lại và gảy đúng lúc nghe click.`;
    }
  } catch (err) {
    finishSession();
    if (err.name !== 'AbortError') out.textContent = describeError(err);
  } finally {
    updateSetupSteps();
  }
}

// ---------- Màn tập ----------

function openLesson(id) {
  const lesson = getLesson(id);
  if (!lesson) return;
  currentLesson = lesson;
  lastAttempt = null;
  lastPerNote = null;
  stopPlayback();
  const ls = lessonState(state, lesson);
  $('lesson-day').textContent = `Tuần ${lesson.week}, ngày ${lesson.day}`;
  $('lesson-title').textContent = lesson.title;
  $('lesson-focus').textContent = lesson.focus;
  $('bpm-value').textContent = String(ls.bpm);
  $('results').hidden = true;
  show('practice');
  setRunning(false);
  setIdleStatus();
  renderStaff($('staff'), lesson);
  renderHistory();
  updateAttemptTools();
}

function setIdleStatus() {
  const box = $('session-status');
  if (!engine.running) {
    needsInputMessage(box);
    return;
  }
  const ls = lessonState(state, currentLesson);
  const parts = ['Bấm Bắt đầu: app đếm vào 4 phách rồi bạn chơi.'];
  if (state.latencyMs == null) parts.push('Chưa đo độ trễ nên điểm nhịp có thể lệch đều.');
  if (ls.streak) parts.push(`Chuỗi sạch ${ls.streak}/${CLEAN_RUNS_TO_LEVEL_UP} ở ${ls.bpm} BPM.`);
  box.textContent = parts.join(' ');
}

function setRunning(on) {
  $('btn-start').hidden = on;
  $('btn-stop').hidden = !on;
  for (const id of ['bpm-down', 'bpm-up', 'btn-demo']) $(id).disabled = on;
  if (!on) for (const cell of $('countin').children) cell.classList.remove('is-on');
}

$('bpm-down').addEventListener('click', () => changeBpm(-BPM_STEP));
$('bpm-up').addEventListener('click', () => changeBpm(BPM_STEP));

function changeBpm(delta) {
  if (!currentLesson) return;
  setBpm(lessonState(state, currentLesson).bpm + delta);
}

function setBpm(value) {
  if (!currentLesson || session) return;
  const bpm = Math.min(currentLesson.maxBpm, Math.max(currentLesson.minBpm, value));
  setLessonBpm(state, currentLesson, bpm);
  saveState(state);
  $('bpm-value').textContent = String(bpm);
  setIdleStatus();
}

$('btn-start').addEventListener('click', runExercise);
$('btn-stop').addEventListener('click', () => {
  stopSession();
  $('session-status').textContent = 'Đã dừng. Lần này không được chấm.';
});

document.addEventListener('keydown', (event) => {
  if (currentView !== 'practice' || event.code !== 'Space' || event.target !== document.body) return;
  event.preventDefault();
  if (session) $('btn-stop').click();
  else $('btn-start').click();
});

async function runExercise() {
  if (!currentLesson || session) return;
  if (!engine.running) {
    needsInputMessage($('session-status'));
    return;
  }
  const lesson = currentLesson;
  const bpm = lessonState(state, lesson).bpm;
  let ctx;
  try {
    ctx = await engine.ensureContext();
  } catch (err) {
    $('session-status').textContent = describeError(err);
    return;
  }
  stopPlayback();
  metronome ??= new Metronome(ctx);
  metronome.setVolume(state.clickVolume);

  const beatSec = 60 / bpm;
  const lengthBeats = lessonLengthBeats(lesson);
  const countIn = lesson.beatsPerBar;
  const latencySec = (state.latencyMs ?? 0) / 1000;
  const t0 = ctx.currentTime + 0.35;
  const exerciseStart = t0 + countIn * beatSec;
  metronome.schedule(t0, bpm, countIn + Math.ceil(lengthBeats), lesson.beatsPerBar);
  const rec = engine.record(
    exerciseStart - Math.min(0.8, beatSec),
    exerciseStart + lengthBeats * beatSec + Math.max(0, latencySec) + 0.6,
  );

  $('results').hidden = true;
  lastPerNote = null;
  renderStaff($('staff'), lesson);
  session = {
    kind: 'exercise',
    raf: 0,
    cancel: () => {
      rec.cancel();
      metronome.stop();
    },
    cleanup: () => {
      setRunning(false);
      highlightNote($('staff'), -1);
    },
  };
  setRunning(true);
  animatePractice(ctx, lesson, t0, exerciseStart, beatSec);

  let recording;
  try {
    recording = await rec.promise;
  } catch (err) {
    finishSession();
    if (err.name !== 'AbortError') $('session-status').textContent = describeError(err);
    return;
  }
  finishSession();
  $('session-status').textContent = 'Đang chấm…';
  await nextFrame();

  const result = gradeRecording({ recording, lesson, bpm, exerciseStart, latencySec, sensitivity: state.sensitivity });
  const ls = recordAttempt(state, lesson, bpm, result);
  saveState(state);
  lastAttempt = {
    recording,
    lesson,
    bpm,
    beatZeroSec: exerciseStart - recording.startFrame / recording.sampleRate,
    latencyMs: state.latencyMs ?? 0,
    demo: false,
  };
  if (currentLesson === lesson) {
    showResults(result, { lesson, bpm, streak: ls.streak, demo: false });
    renderHistory();
  }
}

function animatePractice(ctx, lesson, t0, exerciseStart, beatSec) {
  const cells = Array.from($('countin').children);
  const staff = $('staff');
  let lastBeat = null;
  let lastNote = -2;
  let lastRow = null;
  const step = () => {
    if (!session || session.kind !== 'exercise') return;
    const now = ctx.currentTime - (ctx.outputLatency || 0);
    if (now < exerciseStart) {
      const beat = Math.floor((now - t0) / beatSec);
      if (beat !== lastBeat) {
        lastBeat = beat;
        cells.forEach((cell, i) => cell.classList.toggle('is-on', i === beat));
        $('session-status').textContent = beat >= 0 ? `Đếm vào ${beat + 1}` : 'Chuẩn bị';
      }
    } else {
      if (lastBeat !== 'play') {
        lastBeat = 'play';
        cells.forEach((cell) => cell.classList.remove('is-on'));
        $('session-status').textContent = 'Đang chơi';
      }
      const position = (now - exerciseStart) / beatSec + 0.02;
      let index = -1;
      for (let i = 0; i < lesson.notes.length && lesson.notes[i].beat <= position; i++) index = i;
      if (index !== lastNote) {
        lastNote = index;
        const node = highlightNote(staff, index);
        const row = node ? node.getAttribute('data-row') : null;
        if (node && row !== lastRow) {
          lastRow = row;
          scrollIntoView(node);
        }
      }
    }
    session.raf = requestAnimationFrame(step);
  };
  session.raf = requestAnimationFrame(step);
}

// ---------- Kết quả ----------

function showResults(result, { lesson, bpm, streak, demo }) {
  const fb = buildFeedback(result, { lesson, bpm, streak });
  $('results').hidden = false;
  $('score-value').textContent = String(result.score);
  $('results-headline').textContent = fb.headline;

  const notes = [];
  if (demo) notes.push('Đây là bản mô phỏng có cài sẵn vài lỗi, không lưu vào lịch sử.');
  else if (state.latencyMs == null) notes.push('Chưa đo độ trễ nên điểm nhịp có thể lệch đều. Đo ở bước 3 trên trang chính.');
  if (!demo && result.clickBleed > 0) notes.push('App nghe thấy tiếng click lọt vào đầu vào và đã bỏ qua chúng.');
  const notice = $('results-notice');
  notice.textContent = notes.join(' ');
  notice.hidden = notes.length === 0;

  renderMetrics(result, lesson);
  renderTimingChart($('timing-chart'), result.perNote, TOLERANCE);
  lastPerNote = result.perNote;
  renderStaff($('staff'), lesson, { results: result.perNote });
  $('tips').replaceChildren(...fb.tips.map((tip) => el('li', null, tip)));
  renderActions(fb.suggestion, demo);
  $('session-status').textContent = demo ? 'Kết quả mô phỏng ở bên dưới.' : `Đã chấm xong lần chơi ở ${bpm} BPM.`;
  updateAttemptTools();
  scrollIntoView($('results'));
}

function renderMetrics(result, lesson) {
  const c = result.counts;
  const mean = result.meanErrMs;
  const items = [
    ['Đúng nốt', `${c.pitchOk}/${c.total}${c.pitchUnknown ? `, ${c.pitchUnknown} không rõ` : ''}`],
    ['Đúng nhịp', `${c.good + c.ok}/${c.total} nốt lệch dưới ${TOLERANCE.okMs} ms`],
    [
      'Lệch trung bình',
      mean == null
        ? 'Không đo được'
        : Math.abs(mean) < 5
          ? 'Gần như đúng phách'
          : `${mean < 0 ? 'Sớm' : 'Muộn'} ${formatNumber(Math.abs(mean))} ms`,
    ],
    ['Độ ổn định', result.sdErrMs == null ? 'Không đo được' : `±${formatNumber(result.sdErrMs)} ms`],
    [
      'Đều tay',
      result.evenness
        ? `Chênh ${formatNumber(Math.abs(result.evenness.ampDiffDb), 1)} dB`
        : lesson.evenness
          ? 'Chưa đủ nốt để đo'
          : 'Không đo ở bài này',
    ],
    ['Thiếu và thừa', `${c.missed} thiếu, ${c.extra} thừa`],
  ];
  $('metrics').replaceChildren(
    ...items.map(([label, value]) => {
      const wrap = el('div');
      wrap.append(el('dt', null, label), el('dd', null, value));
      return wrap;
    }),
  );
}

function renderActions(suggestion, demo) {
  const actions = [button('primary', demo ? 'Bắt đầu tập' : 'Tập lại', runExercise)];
  if (!demo && suggestion.type !== 'stay') {
    const label = suggestion.type === 'up' ? `Chuyển lên ${suggestion.bpm} BPM` : `Giảm xuống ${suggestion.bpm} BPM`;
    const change = button('secondary', label, () => {
      setBpm(suggestion.bpm);
      change.remove();
    });
    actions.push(change);
  }
  $('result-actions').replaceChildren(...actions);
}

const timeFormat = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function renderHistory() {
  const attempts = (state.lessons[currentLesson.id]?.attempts ?? []).slice(0, 10);
  $('history-empty').hidden = attempts.length > 0;
  $('history-table').hidden = attempts.length === 0;
  $('history-body').replaceChildren(
    ...attempts.map((a) => {
      const timing =
        a.meanErrMs == null ? '–' : Math.abs(a.meanErrMs) < 5 ? 'đúng phách' : `${a.meanErrMs < 0 ? 'sớm' : 'muộn'} ${Math.abs(a.meanErrMs)} ms`;
      const row = el('tr');
      const badge = el('td');
      if (a.clean) badge.append(el('span', 'clean-badge', 'sạch'));
      row.append(el('td', null, timeFormat.format(a.at)), el('td', null, String(a.bpm)), el('td', null, String(a.score)), el('td', null, timing), badge);
      return row;
    }),
  );
}

// ---------- Chấm thử, nghe lại, tải bản thu ----------

$('btn-demo').addEventListener('click', async () => {
  if (!currentLesson || session) return;
  const lesson = currentLesson;
  const bpm = lessonState(state, lesson).bpm;
  const demoButton = $('btn-demo');
  demoButton.disabled = true;
  $('session-status').textContent = 'Đang tạo bản mô phỏng…';
  await nextFrame();
  try {
    const wrongIndex = Math.min(5, lesson.notes.length - 1);
    const skipIndex = Math.min(9, lesson.notes.length - 2);
    const sim = simulateAttempt(lesson, bpm, {
      seed: (Date.now() % 100000) + 1,
      jitterMs: 18,
      offsetMs: 10,
      wrong: { [wrongIndex]: lesson.notes[wrongIndex].midi + 1 },
      skip: [skipIndex],
      gainDb: (i) => (i % 2 ? -2.5 : 0),
    });
    const result = gradeRecording({
      recording: sim.recording,
      lesson,
      bpm,
      exerciseStart: sim.exerciseStart,
      latencySec: 0,
      sensitivity: state.sensitivity,
    });
    lastAttempt = {
      recording: sim.recording,
      lesson,
      bpm,
      beatZeroSec: sim.exerciseStart - sim.recording.startFrame / sim.recording.sampleRate,
      latencyMs: 0,
      demo: true,
    };
    showResults(result, { lesson, bpm, streak: 0, demo: true });
  } finally {
    demoButton.disabled = false;
  }
});

$('btn-playback').addEventListener('click', async () => {
  if (playback) {
    stopPlayback();
    return;
  }
  if (!lastAttempt) return;
  let ctx;
  try {
    ctx = await engine.ensureContext();
  } catch (err) {
    $('session-status').textContent = describeError(err);
    return;
  }
  const { samples, sampleRate } = lastAttempt.recording;
  const buffer = ctx.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(samples, 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.onended = () => {
    if (playback === source) {
      playback = null;
      $('btn-playback').textContent = 'Nghe lại lần vừa chơi';
    }
  };
  source.start();
  playback = source;
  $('btn-playback').textContent = 'Dừng nghe lại';
});

function stopPlayback() {
  if (playback) {
    const p = playback;
    playback = null;
    try {
      p.stop();
    } catch {
      // đã dừng
    }
  }
  $('btn-playback').textContent = 'Nghe lại lần vừa chơi';
}

$('btn-download').addEventListener('click', () => {
  if (!lastAttempt) return;
  const { recording, lesson, bpm, beatZeroSec, latencyMs } = lastAttempt;
  const blob = new Blob([encodeWav(recording.samples, recording.sampleRate)], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = recordingFileName({ lessonId: lesson.id, bpm, beatZeroMs: beatZeroSec * 1000, latencyMs });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});

function updateAttemptTools() {
  $('btn-playback').disabled = !lastAttempt;
  $('btn-download').disabled = !lastAttempt;
}

// ---------- Tuỳ chọn ----------

const sensitivityInput = $('sensitivity');
const clickVolumeInput = $('click-volume');

function syncSettingsControls() {
  sensitivityInput.value = String(state.sensitivity ?? 0.5);
  clickVolumeInput.value = String(state.clickVolume ?? 0.7);
  updateSensitivityLabel();
}

function updateSensitivityLabel() {
  const v = Number(sensitivityInput.value);
  $('sensitivity-value').textContent = v < 0.35 ? 'thấp' : v > 0.65 ? 'cao' : 'vừa';
}

sensitivityInput.addEventListener('input', () => {
  state.sensitivity = Number(sensitivityInput.value);
  saveState(state);
  updateSensitivityLabel();
});

clickVolumeInput.addEventListener('input', () => {
  state.clickVolume = Number(clickVolumeInput.value);
  saveState(state);
  metronome?.setVolume(state.clickVolume);
});

// ---------- Đổi kích thước ----------

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (currentView !== 'practice' || !currentLesson || session) return;
    renderStaff($('staff'), currentLesson, { results: lastPerNote });
    if (lastPerNote) renderTimingChart($('timing-chart'), lastPerNote, TOLERANCE);
  }, 200);
});

// ---------- Khởi động ----------

if (!window.isSecureContext) $('insecure-banner').hidden = false;
syncSettingsControls();
show('home', { focus: false });
