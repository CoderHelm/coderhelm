#!/usr/bin/env node
// No hardcoded hosted addresses in the dashboard. The same build serves the
// hosted service and every self-hosted install, so the API, the stream and
// the GitHub App come from lib/runtime-config.ts (apiBase, apiOrigin,
// githubAppUrl), never from a literal. Runs with `npm run lint`.
//
// Flags app., api., stream., auth. and status.coderhelm.com, the marketing
// site, CoderHelm's mail addresses, github.com/apps/coderhelm (the hosted
// GitHub App) and the hosted Jira (Forge) app's id anywhere in src/ outside
// the files below. Comments are not checked. docs.coderhelm.com is always fine.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Files that may name a hosted address, and why. */
const ALLOWED = {
  "src/lib/runtime-config.ts": "the hosted defaults, used only when no runtime config says otherwise",
  "src/components/google-analytics.tsx": "a hostname check that keeps the hosted dashboard's analytics off every other host; not a link",
  "src/components/client-shell.tsx": "the hosted service's own admin account, checked only when not self-hosted; not a link",
  "src/app/settings/integrations/jira/page.tsx": "CoderHelm's published Jira app: shown on the hosted service, and on a self-hosted install only when hybrid's Jira relay is on (otherwise the page offers the webhook and the install's own copy)",
};

/** The hosted Jira (Forge) app's id. */
const FORGE_APP_ID = "de730821-2955-4d78-836e-55b6e7c23c88";
const PATTERN = new RegExp(
  [
    String.raw`\b(?:app|api|stream|auth|status)\.coderhelm\.com`,
    String.raw`:\/\/(?:www\.)?coderhelm\.com`,
    String.raw`\b(?:notifications|support|admin)@coderhelm\.com`,
    String.raw`github\.com\/apps\/coderhelm\b`,
    FORGE_APP_ID,
  ].join("|"),
  "i",
);

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
