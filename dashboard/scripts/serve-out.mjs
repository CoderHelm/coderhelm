#!/usr/bin/env node
// Serves the static export (`next build` → out/) the way CloudFront does in
// production: /path and /path/ open /path/index.html, anything else missing
// gets 404.html. CI runs the Playwright suite against this instead of
// `next dev`, so it tests the build that ships and doesn't compile per page.
//
//   node scripts/serve-out.mjs [port]

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "out");
const PORT = Number(process.argv[2] || process.env.PORT || 3111);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

if (!fs.existsSync(OUT)) {
  console.error(`No build at ${OUT}. Run \`npm run build\` first.`);
  process.exit(1);
}

function resolve(urlPath) {
  const clean = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  const target = path.join(OUT, clean);
  if (!target.startsWith(OUT)) return null;
  for (const candidate of [target, path.join(target, "index.html"), `${target}.html`]) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

http
  .createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    const file = resolve(url.pathname);
    const status = file ? 200 : 404;
    const body = file ?? path.join(OUT, "404.html");
    res.writeHead(status, { "content-type": TYPES[path.extname(body)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(body).pipe(res);
  })
  .listen(PORT, () => console.log(`Serving ${OUT} on http://localhost:${PORT}`));
