// Kiểm tra cú pháp mọi file JavaScript (kể cả file chỉ chạy trong trình duyệt).

import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, extname } from 'node:path';

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else if (['.js', '.mjs'].includes(extname(entry.name))) out.push(path);
  }
  return out;
}

const files = (await Promise.all(['js', 'scripts', 'tests'].map(walk))).flat();
let failed = 0;
for (const file of files) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    failed++;
    console.error(`✗ ${file}\n${r.stderr}`);
  }
}
console.log(failed ? `${failed}/${files.length} file lỗi cú pháp` : `Cả ${files.length} file đều đúng cú pháp`);
process.exit(failed ? 1 : 0);
