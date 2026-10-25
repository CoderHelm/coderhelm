#!/usr/bin/env node
// Serves the static export (`next build` → out/) the way CloudFront does in
// production: /path and /path/ open /path/index.html, anything else missing
// gets 404.html. CI runs the Playwright suite against this instead of
// `next dev`, so it tests the build that ships and doesn't compile per page.
//
//   node scripts/serve-out.mjs [port]
//
// One difference from production: every page gets one fixed font (DejaVu Sans
// and DejaVu Sans Mono, from @fontsource) in place of the system font stack.
// The system font differs by machine (San Francisco on a Mac, DejaVu on the
// Linux CI runner), and the layout specs measure where text wraps, so without
// this a spec can pass on a laptop and fail in CI. DejaVu is one of the widest
// common UI fonts, so a layout that holds in it holds in narrower ones too.

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

const MODULES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "node_modules", "@fontsource");
const FONT_FILES = {
  "sans-400.woff2": "dejavu-sans/files/dejavu-sans-latin-400-normal.woff2",
  "sans-700.woff2": "dejavu-sans/files/dejavu-sans-latin-700-normal.woff2",
  "sans-400-italic.woff2": "dejavu-sans/files/dejavu-sans-latin-400-italic.woff2",
  "mono-400.woff2": "dejavu-mono/files/dejavu-mono-latin-400-normal.woff2",
  "mono-700.woff2": "dejavu-mono/files/dejavu-mono-latin-700-normal.woff2",
};
const face = (family, file, weight, style = "normal") =>
  `@font-face{font-family:"${family}";src:url(/__e2e/fonts/${file}) format("woff2");font-weight:${weight};font-style:${style};font-display:block}`;
// Unlayered, so it beats the theme's font variables.
const FONT_CSS = [
  face("E2E Sans", "sans-400.woff2", "100 549"),
  face("E2E Sans", "sans-700.woff2", "550 900"),
  face("E2E Sans", "sans-400-italic.woff2", "100 900", "italic"),
  face("E2E Mono", "mono-400.woff2", "100 549"),
  face("E2E Mono", "mono-700.woff2", "550 900"),
  ':root{--font-sans:"E2E Sans",sans-serif;--font-mono:"E2E Mono",monospace;--default-font-family:var(--font-sans);--default-mono-font-family:var(--font-mono)}',
].join("\n");
const FONT_LINK = '<link rel="stylesheet" href="/__e2e/fonts.css">';

http
  .createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname === "/__e2e/fonts.css") {
      res.writeHead(200, { "content-type": TYPES[".css"], "cache-control": "no-store" });
      return res.end(FONT_CSS);
    }
    if (url.pathname.startsWith("/__e2e/fonts/")) {
      const rel = FONT_FILES[url.pathname.slice("/__e2e/fonts/".length)];
      if (!rel) return res.writeHead(404).end();
      res.writeHead(200, { "content-type": "font/woff2", "cache-control": "max-age=3600" });
      return fs.createReadStream(path.join(MODULES, rel)).pipe(res);
    }
    const file = resolve(url.pathname);
    const status = file ? 200 : 404;
    const body = file ?? path.join(OUT, "404.html");
    const type = TYPES[path.extname(body)] || "application/octet-stream";
    res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
    if (body.endsWith(".html")) return res.end(fs.readFileSync(body, "utf8").replace("</head>", `${FONT_LINK}</head>`));
    fs.createReadStream(body).pipe(res);
  })
  .listen(PORT, () => console.log(`Serving ${OUT} on http://localhost:${PORT}`));
