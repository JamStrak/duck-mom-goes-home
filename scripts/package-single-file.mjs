// 单文件打包：把 dist/ 的 JS + CSS 内联进一个 .html，产出可离线分享的单文件版本。
// 用法：npm run package:single  （或 npm run build 后 node scripts/package-single-file.mjs）

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');

let html = readFileSync(join(distDir, 'index.html'), 'utf8');

function readAsset(p) {
  const rel = p.replace(/^\.\//, '').replace(/^\//, '');
  return readFileSync(join(distDir, rel), 'utf8');
}

// 内联 CSS
html = html.replace(
  /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*\/?>/g,
  (m, href) => `<style>\n${readAsset(href)}\n</style>`,
);

// 内联 JS（Vite 产物已打包为单文件、无 import/export）
html = html.replace(
  /<script[^>]+type="module"[^>]+src="([^"]+)"[^>]*><\/script>/g,
  (m, src) => `<script type="module">\n${readAsset(src)}\n</script>`,
);

// 内联普通 script（若有）
html = html.replace(/<script[^>]+src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
  return `<script>\n${readAsset(src)}\n</script>`;
});

const outDir = join(root, 'release');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, '鸭妈妈回家-单文件版.html');
writeFileSync(outFile, html, 'utf8');

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(`单文件打包完成：${outFile}`);
console.log(`文件大小：${kb} KB`);
