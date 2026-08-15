// 鸭妈妈回家（小鸭快跑）—— 极简静态服务器（生产模式，服务 dist/）
//
// 由「一键启动.cmd」调用：构建完成后用本文件把 dist/ 作为静态站点服务出去。
// 无第三方依赖，仅用 Node 内置模块。缓存策略：入口 HTML no-store，哈希资源 immutable。

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = resolve(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const port = Number(process.env.GAME_PORT || process.argv[2] || 5175);
const host = process.env.GAME_HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
};

/** 把 URL 安全解析为 dist/ 内的文件路径，越界返回 null */
function resolveSafe(urlPath) {
  const cleaned = decodeURIComponent(String(urlPath).split('?')[0]).replace(/^\/+/, '');
  const rel = cleaned || 'index.html';
  const abs = resolve(distDir, rel);
  if (abs !== distDir && !abs.startsWith(distDir + sep)) return null;
  return abs;
}

const server = createServer((req, res) => {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405);
    res.end();
    return;
  }

  let file = resolveSafe(req.url || '/');
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    // 单页回退：未知路径一律返回 index.html
    file = join(distDir, 'index.html');
  }

  let stat;
  try {
    stat = statSync(file);
  } catch {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = extname(file).toLowerCase();
  const isIndex = file.endsWith(`${sep}index.html`) || file === join(distDir, 'index.html');

  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'X-Content-Type-Options': 'nosniff',
    // 入口 HTML 必须 no-store；带内容哈希的资源才可 immutable
    'Cache-Control': isIndex
      ? 'no-store'
      : /[.-][a-f0-9]{8,}\./.test(file)
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
  });

  if (method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
});

server.listen(port, host, () => {
  console.log(`Duck Mom Goes Home: http://${host}:${port}/`);
});
