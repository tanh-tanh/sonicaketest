// Máy chủ tĩnh tối giản để chạy app trên máy tính: node scripts/serve.mjs  (hoặc npm start)
// Trình duyệt chỉ cho thu âm qua https hoặc http://localhost, nên mở đúng địa chỉ in ra bên dưới.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const port = Number(process.env.PORT ?? 8080);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
  '.wav': 'audio/wav',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const relative = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
    let file = join(root, relative);
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end('Không được phép');
      return;
    }
    let info = await stat(file).catch(() => null);
    if (info?.isDirectory()) {
      file = join(file, 'index.html');
      info = await stat(file).catch(() => null);
    }
    if (!info) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Không tìm thấy');
      return;
    }
    res.writeHead(200, {
      'content-type': types[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(await readFile(file));
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(String(err));
  }
});

server.listen(port, () => {
  console.log(`Bass Coach 30 đang chạy tại http://localhost:${port}`);
  console.log('Nhấn Ctrl+C để dừng.');
});
