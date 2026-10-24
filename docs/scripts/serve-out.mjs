#!/usr/bin/env node
// Serves out/ the way CloudFront does (infra/lib/docs-stack.ts): /a/ and /a
// open /a/index.html, `Accept: text/markdown` gets the page's .md twin, and
// an unknown page gets the 404 page with a 404 status. For the e2e tests.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'out');
const PORT = Number(process.env.PORT ?? process.argv[2] ?? 3460);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

function send(res, status, file) {
  res.writeHead(status, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url.includes('..')) return send(res, 404, path.join(OUT, '404.html'));
  const isPage = url.endsWith('/') || !path.extname(url);
  if (isPage && (req.headers.accept ?? '').includes('text/markdown')) {
    const trimmed = url.replace(/\/+$/, '');
    const md = path.join(OUT, trimmed === '' ? 'index.md' : `${trimmed}.md`);
    if (fs.existsSync(md)) return send(res, 200, md);
  }
  const file = isPage ? path.join(OUT, url, 'index.html') : path.join(OUT, url);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return send(res, 200, file);
  send(res, 404, path.join(OUT, '404.html'));
}).listen(PORT, () => console.log(`serving out/ on http://localhost:${PORT}`));
