// Lưu cài đặt và lịch sử tập ngay trong trình duyệt (localStorage).
// Mọi thao tác đều bọc try/catch: chế độ ẩn danh hoặc bộ nhớ đầy vẫn không làm hỏng app.

const KEY = 'bass-coach-30:v1';
const MAX_ATTEMPTS = 30;

export function defaultState() {
  return {
    version: 1,
    deviceId: null,
    latencyMs: null,
    latencySpreadMs: null,
    calibratedAt: null,
    tunedAt: null,
    tuneSeconds: null,
    sensitivity: 0.5,
    clickVolume: 0.7,
    lessons: {},
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed, lessons: parsed.lessons ?? {} };
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearState() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // bỏ qua
  }
  return defaultState();
}

/** Trạng thái riêng của một bài: BPM đang tập, chuỗi lần sạch, lịch sử. */
export function lessonState(state, lesson) {
  const existing = state.lessons[lesson.id];
  if (existing) return existing;
  const fresh = { bpm: lesson.bpm, streak: 0, best: null, attempts: [] };
  state.lessons[lesson.id] = fresh;
  return fresh;
}

export function recordAttempt(state, lesson, bpm, result) {
  const ls = lessonState(state, lesson);
  ls.streak = result.clean ? ls.streak + 1 : 0;
  ls.best = ls.best == null ? result.score : Math.max(ls.best, result.score);
  ls.attempts.unshift({
    at: Date.now(),
    bpm,
    score: result.score,
    pitchPct: result.pitchPct,
    timingPct: result.timingPct,
    meanErrMs: result.meanErrMs == null ? null : Math.round(result.meanErrMs),
    sdErrMs: result.sdErrMs == null ? null : Math.round(result.sdErrMs),
    clean: result.clean,
  });
  ls.attempts.length = Math.min(ls.attempts.length, MAX_ATTEMPTS);
  return ls;
}

export function setLessonBpm(state, lesson, bpm) {
  const ls = lessonState(state, lesson);
  if (ls.bpm !== bpm) {
    ls.bpm = bpm;
    ls.streak = 0; // đổi tốc độ thì đếm lại từ đầu
  }
  return ls;
}
