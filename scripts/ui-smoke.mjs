// Kiểm tra nhanh giao diện không cần trình duyệt thật (dùng jsdom).
// jsdom không phải phụ thuộc của dự án: cài tạm bằng `npm install --no-save jsdom` rồi chạy
//   node scripts/ui-smoke.mjs
// Script mở trang, vào một bài, bấm "Chấm thử bằng bản mô phỏng" và kiểm tra kết quả hiện ra.

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

let JSDOM;
let VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = await import('jsdom'));
} catch {
  console.error('Chưa có jsdom. Chạy: npm install --no-save jsdom');
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(root, 'index.html'), 'utf8');
const virtualConsole = new VirtualConsole();
const problems = [];
virtualConsole.on('jsdomError', (e) => {
  if (!/Not implemented/.test(e.message)) problems.push(e.message);
});
virtualConsole.on('error', (e) => problems.push(String(e)));
const dom = new JSDOM(html, { url: 'https://example.test/bass-coach-30/', pretendToBeVisual: true, virtualConsole });
const w = dom.window;
for (const key of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Node', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  Object.defineProperty(globalThis, key, { value: key === 'window' ? w : w[key], configurable: true, writable: true });
}
w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.matchMedia = w.matchMedia;
w.confirm = () => true;

const check = (cond, message) => {
  if (!cond) {
    console.error(`✗ ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
};
const $ = (id) => w.document.getElementById(id);
const visible = (view) => !w.document.querySelector(`[data-view="${view}"]`).hidden;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await import(pathToFileURL(join(root, 'js/main.js')).href);

check(visible('home'), 'Trang chính hiện khi mở app');
const lessonButtons = w.document.querySelectorAll('#lesson-list .lesson');
check(lessonButtons.length === 8, `Có 8 bài tập trong danh sách (thấy ${lessonButtons.length})`);

lessonButtons[1].click();
check(visible('practice'), 'Bấm một bài thì vào màn tập');
check($('lesson-title').textContent.length > 0, 'Màn tập có tiêu đề bài');
check(w.document.querySelectorAll('#staff .nh').length === 32, 'Khuông tab vẽ đủ 32 nốt');
check($('session-status').textContent.includes('Chưa bật đầu vào'), 'Nhắc bật đầu vào khi chưa kết nối');

$('bpm-up').click();
check($('bpm-value').textContent === '65', 'Nút tăng BPM đổi 60 thành 65');
$('bpm-down').click();

$('btn-demo').click();
for (let i = 0; i < 100 && $('results').hidden; i++) await wait(50);
check(!$('results').hidden, 'Chấm thử bằng bản mô phỏng hiện kết quả');
const score = Number($('score-value').textContent);
check(score > 0 && score < 100, `Điểm mô phỏng hợp lý (${score})`);
check($('tips').children.length > 0, `Có nhận xét (${$('tips').children.length} dòng)`);
check(w.document.querySelectorAll('#timing-chart circle, #timing-chart .pt-missed').length >= 30, 'Biểu đồ lệch nhịp có điểm cho từng nốt');
check(w.document.querySelectorAll('#staff .nh--wrong').length === 1, 'Khuông tab tô đỏ đúng 1 nốt sai');
check(w.document.querySelectorAll('#staff .nh--missed').length === 1, 'Khuông tab đánh dấu đúng 1 nốt thiếu');
check(!$('btn-download').disabled, 'Có thể tải bản thu sau khi chấm');

w.document.querySelector('[data-view="practice"] .back').click();
check(visible('home'), 'Nút quay lại về trang chính');
$('status').click();
check(visible('connect'), 'Bấm trạng thái kết nối thì mở trang Kết nối');
w.document.querySelector('.setup-step[data-goto="tune"]') || null;

if (problems.length) {
  console.error('Lỗi trong lúc chạy:\n' + problems.join('\n'));
  process.exitCode = 1;
}
console.log(process.exitCode ? 'Có lỗi giao diện.' : 'Giao diện chạy ổn.');
w.close();
