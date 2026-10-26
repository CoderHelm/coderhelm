#!/usr/bin/env node
// No hardcoded hosted addresses in the dashboard. The same build serves the
// hosted service and every self-hosted install, so the API, the stream and
// the GitHub App come from lib/runtime-config.ts (apiBase, apiOrigin,
// githubAppUrl), never from a literal. Runs with `npm run lint`.
//
// Flags app., api., stream. and auth.coderhelm.com, the marketing site, and
// github.com/apps/coderhelm (the hosted GitHub App) anywhere in src/ outside
// the files below. Comments are not checked. docs.coderhelm.com is always fine.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Files that may name a hosted address, and why. */
const ALLOWED = {
  "src/lib/runtime-config.ts": "the hosted defaults, used only when no runtime config says otherwise",
  "src/components/google-analytics.tsx": "a hostname check that keeps the hosted dashboard's analytics off every other host; not a link",
};

const PATTERN = /\b(?:app|api|stream|auth)\.coderhelm\.com|:\/\/(?:www\.)?coderhelm\.com|github\.com\/apps\/coderhelm\b/i;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|mjs|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

const found = [];
for (const file of walk(path.join(ROOT, "src"))) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  if (ALLOWED[rel]) continue;
  fs.readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
      const m = line.match(PATTERN);
      if (m) found.push(`${rel}:${i + 1}: ${m[0]}: ${t.slice(0, 160)}`);
    });
}

if (found.length) {
  console.error(
    "Hardcoded hosted addresses. Use apiBase(), apiOrigin() or githubAppUrl() from lib/runtime-config.ts, or add the file to ALLOWED with the reason:\n" +
      found.join("\n"),
  );
  process.exit(1);
}
console.log("No hardcoded hosted addresses.");
