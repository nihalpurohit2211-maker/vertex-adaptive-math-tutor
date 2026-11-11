/**
 * serve.mjs — tiny zero-dep static file server for local dev (port 8766, override with PORT).
 * Usage: node scripts/serve.mjs
 * Serves the repo root with correct MIME types; no caching, no build step.
 */
import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8766;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function lookup(p) {
  return MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('bad request');
    return;
  }

  let filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('forbidden');
    return;
  }

  fsp.stat(filePath).then(async (st) => {
    if (st.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    const buf = await fsp.readFile(filePath);
    res.writeHead(200, {
      'content-type': lookup(filePath),
      'cache-control': 'no-cache',
      'content-length': buf.length,
    });
    res.end(buf);
  }).catch(() => {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found: ' + pathname);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Vertex dev server: http://localhost:${PORT}/  (root: ${ROOT})`);
});
