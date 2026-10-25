# CLAUDE.md

Bass Coach 30 là web app luyện bass cho người mới, chạy hoàn toàn trong trình duyệt. App nghe tiếng bass từ Sonicake Pocket Master (máy cắm qua USB-C và hoạt động như card âm thanh), rồi chấm 8 bài tập Tuần 1–2 của lộ trình 30 ngày: đúng nốt, đúng nhịp, đều tay. Người dùng là người Việt, nên giao diện, thông báo và chú thích trong mã đều bằng tiếng Việt.

## Lệnh

- `npm test`: chạy toàn bộ test bằng `node:test`, không cần cài gì.
- `npm run check`: kiểm tra cú pháp mọi file JavaScript, kể cả file chỉ chạy trong trình duyệt.
- `npm run simulate [id-bài]`: in bảng điểm cho các lần chơi mô phỏng (chuẩn, muộn đều, sai nốt, ngón yếu, gảy mềm).
- `node scripts/grade-wav.mjs <file.wav>`: chấm lại bản thu thật người dùng tải từ app.
- `npm install --no-save jsdom && node scripts/ui-smoke.mjs`: kiểm tra giao diện bằng jsdom. Không commit `node_modules`.
- `npm start`: máy chủ tĩnh ở http://localhost:8080 (chỉ có ích trên máy của người dùng).

## Ràng buộc

- Không có bước build và không thêm thư viện chạy trong app. Dùng ES modules thuần và đường dẫn tương đối, vì app chạy trên GitHub Pages dưới đường dẫn con `/<tên-repo>/`.
- Máy ảo cloud không có micro hay thiết bị USB, nên đừng cố thu âm thật. Kiểm tra bằng test, bằng mô phỏng (`js/simulate.js`) và bằng bản thu WAV người dùng gửi.
- Không bật lại `echoCancellation`, `noiseSuppression`, `autoGainControl` trong `getUserMedia`: chúng làm hỏng tiếng bass.
- Mã xử lý tín hiệu và chấm điểm (`js/dsp/*`, `js/scoring.js`, `js/grade.js`, `js/feedback.js`, `js/lessons.js`, `js/tuner.js`, `js/wav.js`, `js/simulate.js`) phải thuần: không đụng DOM hay Web Audio, để test được trong Node.
- Không đưa tab, bản ghi hay lời bài hát có bản quyền vào repo. Chỉ dùng bài tập tự soạn.
- Chữ trên giao diện: tiếng Việt, câu ngắn, viết hoa đầu câu, nút ghi đúng hành động sẽ xảy ra.
- Trước khi commit: chạy `npm test` và `npm run check`. Mọi thay đổi ở phần chấm điểm cần có test đi kèm.

## Kiến trúc

| File | Vai trò |
|---|---|
| `index.html`, `css/app.css` | Giao diện năm màn: trang chính, kết nối, lên dây, đo độ trễ, tập |
| `js/main.js` | Điều khiển giao diện, phiên tập, lưu kết quả |
| `js/audio-engine.js`, `js/capture-worklet.js` | Bật đầu vào, thu mẫu kèm số frame chính xác, bộ đệm vòng cho tuner |
| `js/metronome.js` | Tiếng click lên lịch theo đồng hồ AudioContext |
| `js/dsp/onsets.js` | Tìm thời điểm gảy |
| `js/dsp/yin.js` | Nhận cao độ (YIN) |
| `js/dsp/analyze.js` | Ghép onset và cao độ thành danh sách nốt, lọc tiếng click lọt vào |
| `js/scoring.js` | Ghép nốt nghe được với bài, tính đúng nốt, lệch nhịp, đều tay, điểm |
| `js/feedback.js` | Nhận xét tiếng Việt và gợi ý BPM (3 lần sạch thì +5 BPM) |
| `js/grade.js` | Nối cả chuỗi chấm; đo độ trễ |
| `js/lessons.js` | Bài tập dưới dạng dữ liệu |
| `js/storage.js` | Lưu cài đặt và lịch sử trong localStorage |
| `js/ui/staff.js`, `js/ui/timing-chart.js` | Vẽ khuông tab và biểu đồ lệch nhịp (SVG) |
| `js/dsp/synth.js`, `js/simulate.js` | Tiếng bass mô phỏng cho test và nút "Chấm thử" |
| `js/wav.js` | Ghi, đọc WAV và quy ước tên file bản thu |

## Mô hình thời gian

- Mọi thời điểm tính bằng giây theo đồng hồ AudioContext.
- `capture-worklet.js` gửi từng khối mẫu kèm `currentFrame`, nên bản thu biết mẫu đầu tiên nằm ở frame nào (`startFrame`).
- `exerciseStart` là thời điểm tiếng click của phách đầu tiên trong bài.
- Độ trễ hệ thống đo ở màn "Đo độ trễ": khoảng cách từ lúc click được lên lịch tới lúc tiếng gảy theo click đó xuất hiện trong bản thu (gồm cả độ trễ đầu ra và đầu vào).
- Khi chấm: thời điểm nốt = `(startFrame + chỉ số mẫu) / sampleRate - độ trễ`, so với `exerciseStart + beat * 60 / bpm`.

## Bộ phát hiện tiếng gảy

`js/dsp/onsets.js` dùng ba nhóm đặc trưng: năng lượng toàn dải và hai dải âm cơ bản (cửa sổ 40 ms để không dao động theo chu kỳ nốt trầm), cùng ba dải tần cao (cửa sổ 10 ms so với 40 ms trước đó) để bắt tiếng gảy kể cả khi nốt trước còn ngân. Khi biết trước thời điểm các nốt, lượt hai tìm lại với ngưỡng thấp hơn quanh những chỗ chưa có tiếng gảy. `sensitivity` (0..1) chỉnh ngưỡng.

Khi chỉnh bộ phát hiện: chạy `npm run simulate` trước và sau để so, giữ mọi test cũ xanh, và thêm test bằng bản thu thật nếu người dùng gửi.

## Thêm bài tập

Thêm một mục vào `LESSONS` trong `js/lessons.js`, dùng hàm `sequence(vị trí, bước phách)`. Các trường: `id` (chữ thường, số, gạch ngang), `week`, `day`, `title`, `focus`, `bpm`, `minBpm`, `maxBpm`, `beatsPerBar`, `subdivision` (1 = nốt đen, 2 = móc đơn), `evenness` (đặt `false` nếu nốt chẵn và lẻ rơi vào các dây khác nhau, vì độ to giữa các dây vốn khác nhau), `notes`. `tests/lessons.test.mjs` và `tests/pipeline.test.mjs` tự kiểm tra mọi bài, kể cả việc chơi chuẩn phải được chấm sạch.

## Bản thu thật từ người dùng

- App tải bản thu với tên `bc30_<id-bài>_<bpm>bpm_<phách đầu, ms>ms_<độ trễ, ms>ms.wav`.
- Đặt file trong `recordings/`, chạy `node scripts/grade-wav.mjs recordings/<file>`, so với điều người dùng mô tả (nốt nào sai, nốt nào thực ra đã chơi), rồi chỉnh và thêm test đọc chính file đó.
- Repo công khai thì bản thu cũng công khai: nhắc người dùng nếu họ ngại.
