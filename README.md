# Bass Coach 30

Web app luyện bass cho người mới, đi kèm lộ trình 30 ngày. App nghe tiếng bass từ **Sonicake Pocket Master** qua cáp USB-C, đếm nhịp cho bạn chơi, rồi chấm từng nốt.

- **Kết nối:** chọn Pocket Master làm đầu vào, xem mức tín hiệu.
- **Lên dây:** tuner cho 4 dây E, A, D, G, ghi lại bạn lên dây mất bao lâu.
- **Đo độ trễ:** gảy theo 8 tiếng click để app biết độ trễ của cáp, máy và trình duyệt.
- **Tập và chấm:** 8 bài Tuần 1–2. App chấm đúng nốt, đúng nhịp (sớm hay muộn bao nhiêu ms), độ ổn định và độ đều tay giữa hai ngón. Chơi sạch 3 lần liên tiếp thì app gợi ý tăng 5 BPM.
- **Lịch sử:** lưu ngay trên thiết bị của bạn.

Âm thanh được xử lý trong trình duyệt, không gửi đi đâu. App không cần cài thư viện nào.

## Cần chuẩn bị

- Sonicake Pocket Master và cáp **hai đầu USB-C**. Một số người dùng báo máy chỉ được nhận khi dùng cáp C–C.
- Điện thoại hoặc máy tính có Chrome, Edge, Firefox hoặc Safari bản mới.
- Tài khoản GitHub (miễn phí).
- Để dùng Claude Code trên cloud: gói Claude Pro, Max, Team, hoặc Enterprise có quyền dùng Claude Code.

Trình duyệt chỉ cho thu âm khi trang mở qua `https://` hoặc `http://localhost`, nên app cần được đưa lên GitHub Pages (https) hoặc chạy trên máy tính.

## Đưa app lên mạng bằng Claude Code trên cloud

Claude Code trên cloud chạy trên một máy ảo của Anthropic: nó sửa mã, chạy test và đẩy thay đổi lên GitHub. Nó không nghe được Pocket Master của bạn. App thật sự chạy trong trình duyệt trên máy đang cắm Pocket Master.

1. **Tạo repo.** Vào https://github.com/new, đặt tên ví dụ `bass-coach-30`, chọn **Public** (GitHub Pages miễn phí chỉ dùng được với repo công khai), tick "Add a README file", bấm **Create repository**.
2. **Tải mã nguồn lên.** Trong repo, bấm **Add file → Upload files**, kéo file `bass-coach-30.zip` vào, bấm **Commit changes**. Trên máy tính, bạn cũng có thể giải nén rồi kéo cả các file và thư mục bên trong vào thay vì file zip.
3. **Kết nối Claude Code với GitHub.** Mở https://claude.ai/code, đăng nhập, làm theo hướng dẫn để kết nối GitHub. Nếu repo để riêng tư, cần cài thêm Claude GitHub App cho repo đó. Môi trường "Default" được tạo sẵn và dùng được luôn, vì máy ảo đã có Node.js.
4. **Giao việc đầu tiên.** Chọn repo vừa tạo, chọn chế độ **Accept edits**, rồi dán yêu cầu dưới đây và gửi.

   Nếu bạn tải file zip lên:

   ```text
   Trong repo có file bass-coach-30.zip chứa mã nguồn một web app luyện bass.
   1. Giải nén vào thư mục gốc của repo, ghi đè README.md nếu trùng (dùng `unzip -o bass-coach-30.zip`; nếu không có unzip thì `python3 -m zipfile -e bass-coach-30.zip .`), rồi xoá file zip.
   2. Đọc CLAUDE.md.
   3. Chạy `npm test` và `npm run check`, sửa nếu có lỗi.
   4. Commit với lời nhắn "Thêm Bass Coach 30".
   ```

   Nếu bạn đã tải các file đã giải nén lên, chỉ cần gửi: `Đọc CLAUDE.md, chạy npm test và npm run check, sửa nếu có lỗi.`

5. **Gộp thay đổi.** Khi Claude làm xong, mở phần xem thay đổi, bấm **Create PR**, rồi vào GitHub bấm **Merge pull request**.
6. **Bật GitHub Pages.** Trong repo: **Settings → Pages → Build and deployment**, mục Source chọn **Deploy from a branch**, Branch chọn `main` và thư mục `/ (root)`, bấm **Save**. Sau 1–2 phút, trang hiện link dạng `https://<tên-github>.github.io/bass-coach-30/`.
7. **Mở app.** Mở link đó bằng Chrome (Android, máy tính) hoặc Safari (iPhone), cắm Pocket Master, làm 3 bước chuẩn bị trên trang chính rồi chọn bài.

M��i lần muốn sửa hay thêm tính năng: vào claude.ai/code, chọn repo, mô tả yêu cầu, tạo PR rồi merge. GitHub Pages tự cập nhật sau 1–2 phút.

Ai có link GitHub Pages cũng mở được trang (tiếng đàn và lịch sử vẫn chỉ nằm trên máy bạn). Nếu muốn hoàn toàn riêng tư, chạy trên máy tính như phần dưới.

## Chạy trên máy tính

Cần Node.js 20 trở lên. Trong thư mục đã giải nén:

```bash
npm start
```

M�� http://localhost:8080. Cách này chỉ dùng được trên chính máy tính đó; điện thoại cần bản trên GitHub Pages.

## Cách dùng

1. **Kết nối.** Cắm Pocket Master, chọn preset bass sạch (tắt méo tiếng, chorus, delay, reverb), tắt trống và nhạc Bluetooth trên máy. Bấm "Bật đầu vào âm thanh", cho phép micro, chọn thiết bị Pocket Master, gảy thử xem thanh mức tín hiệu.
2. **Lên dây.** Gảy từng dây buông cho tới khi cả 4 dây hiện "Xong". Pocket Master cũng có tuner riêng nếu bạn thích dùng.
3. **Đo độ trễ.** Nghe 4 tiếng đếm vào, rồi gảy dây E buông theo 8 tiếng click. Đo lại khi đổi máy, đổi tai nghe hoặc đổi trình duyệt.
4. **Tập.** Chọn bài, chỉnh BPM, bấm Bắt đầu. App đếm vào 4 phách; nốt đang chơi sáng lên trên khuông tab. Phím cách (Space) trên máy tính cũng bắt đầu và dừng được.
5. **Đọc kết quả.** Điểm, số nốt đúng, lệch nhịp trung bình, độ ổn định, độ đều tay, biểu đồ lệch nhịp từng nốt và nhận xét. Các nốt trên khuông được tô màu: xanh là đúng phách, vàng là hơi lệch, đỏ là lệch nhiều hoặc sai nốt, viền đứt là thiếu nốt.

Nút "Chấm thử bằng bản mô phỏng" trong phần Tuỳ chọn cho bạn xem màn kết quả mà không cần đàn.

### App không chấm được gì

- Tư thế, vị trí ngón cái, ngón nào đang gảy: âm thanh không cho biết những điều này.
- Dây nào đang bấm: cùng một nốt trên hai dây (ví dụ C ở phím 3 dây A và phím 8 dây E) nghe giống hệt nhau, nên app chấm cao độ chứ không chấm vị trí.
- Bài hát: app chỉ có bài tập tự soạn, không chứa tab bài hát có bản quyền.

## Khi app chấm sai: gửi bản thu cho Claude Code

Cách chấm được thử bằng tiếng bass mô phỏng, chưa thử trên Pocket Master thật. Nếu app báo sai (ví dụ báo thiếu nốt dù bạn đã gảy), gửi bản thu để Claude Code chỉnh:

1. Ngay sau lần chơi đó, mở **Tuỳ chọn** và bấm **Tải bản thu (WAV)**. Tên file đã chứa bài, BPM và độ trễ, đừng đổi tên.
2. Tải file lên repo (**Add file → Upload files**).
3. Gửi Claude Code một yêu cầu như sau, sửa phần mô tả cho đúng điều bạn đã chơi:

   ```text
   File bc30_....wav vừa tải lên là bản thu thật của tôi. Thực tế tôi chơi đủ và đúng mọi nốt,
   nhưng app báo thiếu nốt 7 và nốt 12. Chuyển file vào thư mục recordings/, chạy
   `node scripts/grade-wav.mjs` với file đó, tìm vì sao chấm sai, sửa mà không làm hỏng test cũ,
   và thêm một test dùng chính file này.
   ```

Repo công khai thì bản thu tải lên cũng công khai.

## Mẫu yêu cầu cho Claude Code

- `Thêm 4 bài tập Tuần 3 vào js/lessons.js theo lộ trình: âm giai C trưởng, A thứ, ngũ cung A thứ, vòng C–G–Am–F nốt gốc móc đơn. Chạy test.`
- `Thêm màn hình thống kê: biểu đồ điểm cao nhất theo ngày cho từng bài.`
- `Cho phép đổi số phách đếm vào (4 hoặc 8) trong phần Tuỳ chọn.`
- `Thêm chấm "sạch tiếng": phát hiện dây buông còn ngân khi đã chuyển sang dây khác. Viết test bằng js/simulate.js.`

## Xử lý sự cố

- **Không thấy Pocket Master trong danh sách:** cắm lại bằng cáp hai đầu USB-C, rồi bấm "Bật lại đầu vào". Đóng các ứng dụng khác đang dùng âm thanh.
- **Trình duyệt chặn micro:** bấm biểu tượng ổ khoá cạnh thanh địa chỉ, cho phép Micro, tải lại trang.
- **Trang báo "không bảo mật":** mở qua link `https://` của GitHub Pages hoặc `http://localhost`.
- **Không nghe tiếng click:** tăng âm lượng máy và thanh "Âm lượng tiếng click" trong Tuỳ chọn; trên iPhone, tắt chế độ im lặng.
- **Nốt nào cũng bị báo sớm hoặc muộn gần như cùng một con số:** đo lại độ trễ. Đừng dùng loa hay tai nghe Bluetooth khi tập, vì độ trễ của chúng lớn và thay đổi liên tục.
- **App báo thiếu nốt dù bạn đã gảy:** tăng "Độ nhạy bắt tiếng gảy", gảy chắc tay hơn, kiểm tra mức tín hiệu.
- **App báo nốt thừa:** giảm độ nhạy, và chặn các dây không chơi (dây buông còn ngân cũng bị tính là tiếng thừa).
- **Sai cao độ hàng loạt:** kiểm tra preset đã tắt hiệu ứng chưa và dây đã lên chuẩn chưa.

## Kiểm tra mã

```bash
npm test          # test tự động
npm run check     # cú pháp
npm run simulate  # bảng điểm các lần chơi mô phỏng
```

Chi tiết kiến trúc dành cho Claude Code nằm trong `CLAUDE.md`.
