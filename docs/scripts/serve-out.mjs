#!/usr/bin/env node
// Serves out/ the way CloudFront does (infra/lib/docs-stack.ts): /a/ and /a
// open /a/index.html, `Accept: text/markdown` gets the page's .md twin, and
// an unknown page gets the 404 page with a 404 status. Every answer carries
// the Content-Security-Policy CloudFront sends (infra/lib/docs-csp.json), so
// the e2e tests run the install guide under the production policy and a
// blocked call fails them. For the e2e tests.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'out');
const CSP = JSON.parse(fs.readFileSync(path.resolve(HERE, '..', '..', 'infra', 'lib', 'docs-csp.json'), 'utf8'));
// CloudFront path patterns: `*` matches anything, everything else literally.
const INSTALL_GUIDE = new RegExp(`^${CSP.installGuidePath.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);

/** The policy CloudFront sends for a path, chosen on the path as requested. */
export function cspFor(url) {
  return INSTALL_GUIDE.test(url) ? CSP.installGuide : CSP.docs;
}
const PORT = Number(process.env.PORT ?? process.argv[2] ?? 3460);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

function send(res, status, file, url) {
  res.writeHead(status, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': cspFor(url) });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url.includes('..')) return send(res, 404, path.join(OUT, '404.html'), url);
  const isPage = url.endsWith('/') || !path.extname(url);
  if (isPage && (req.headers.accept ?? '').includes('text/markdown')) {
    const trimmed = url.replace(/\/+$/, '');
    const md = path.join(OUT, trimmed === '' ? 'index.md' : `${trimmed}.md`);
    if (fs.existsSync(md)) return send(res, 200, md, url);
  }
  const file = isPage ? path.join(OUT, url, 'index.html') : path.join(OUT, url);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return send(res, 200, file, url);
  send(res, 404, path.join(OUT, '404.html'), url);
}).listen(PORT, () => console.log(`serving out/ on http://localhost:${PORT}`));
