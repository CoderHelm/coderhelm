#!/usr/bin/env node
// UI lint for the dashboard: the rules a type check can't see and a reviewer
// keeps missing. Run with `npm run lint` in dashboard/ (CI runs it too).
//
//   node scripts/ui-lint.mjs                    check
//   node scripts/ui-lint.mjs --update-baseline  write today's counts as the baseline
//
// Errors (fail the run):
//   model-name       a Claude model named in page text; names come from lib/models.ts
//   brand            "CoderHelm" anywhere in src; the product is "Coderhelm"
//   jargon           openspec, "<something> pass", TOTP, HMAC, "Log Analyzer" in UI copy
//   unlabeled-input  an <input>, <textarea> or <select> with no label, beyond the baseline
//   page-route       a page (src/app/**/page.tsx) with no entry in lib/routes.ts, so the top bar can't name it
//   page-header      a page drawing its own header: a raw <h1>, a "←" back link or its own breadcrumb.
//                    The shell's one top bar holds the trail and the back arrow; pages describe
//                    themselves with <PageHeader> (components/page.tsx)
//   break-all        the `break-all` class. It cuts every word that reaches the line's end,
//                    even one that would fit whole on the next line. Long strings (shas,
//                    URLs, emails, paths) take `wrap-anywhere`, which breaks a word only
//                    when it is wider than the whole line
//   anywhere-on-control  `wrap-anywhere` or `[overflow-wrap:anywhere]` on a <button>, <label>,
//                    <th>, tab or shared button class. It lets a crowded row squeeze the
//                    control's words to a letter a line ("Rout" over "e"); controls keep
//                    their words whole (globals.css) and the row wraps instead
// Reports (never fail, counted against the baseline so they can be tightened):
//   font-mono        `font-mono` outside <Code>, <CodeBlock> and the shared mono input
//   pre              a hand-rolled <pre> outside <CodeBlock> (a block of code gets its header, Copy and highlighting there)
//   wide-button      a button that stays full width from `sm:` up
//
// A legitimate hit goes in scripts/ui-lint-allow.json with the reason.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SRC = path.join(ROOT, "src");
const ALLOW_FILE = path.join(HERE, "ui-lint-allow.json");
const BASELINE_FILE = path.join(HERE, "ui-lint-baseline.json");
const UPDATE = process.argv.includes("--update-baseline");
const GITHUB = !!process.env.GITHUB_ACTIONS;
// Paths in annotations are from the repository root.
const REPO_PREFIX = path.relative(path.resolve(ROOT, ".."), ROOT);

const MODEL_NAME = /\b(?:Claude\s+)?(?:Opus|Sonnet|Haiku|Fable)\s+\d+(?:\.\d+)?\b|\bClaude\s+\d+(?:\.\d+)?\b/;
const BRAND = /\bCoderHelm\b/g;
const JARGON = [
  { re: /\bopen\s?spec\b/i, say: "openspec: say \"spec\" or what the files are" },
  {
    re: /\b(?:PR\s+)?(?:description|review|feedback|planning|plan|coding|code|fix|polish|cleanup|lint|first|second|third|final|extra|another|verification)\s+pass(?:es)?\b/i,
    say: "\"pass\" as a step of a run: say what it does (\"when it writes the PR description\")",
  },
  { re: /\bTOTP\b/, say: "TOTP: say \"authenticator app\"" },
  { re: /\bHMAC\b/, say: "HMAC: say \"signed\" or \"signature\"" },
  { re: /\bLog\s+Analy[sz]er\b/i, say: "Log Analyzer: say what it reads (\"your AWS logs\")" },
];
/** Strings in these attributes are not copy. */
const NOT_COPY_ATTRS = new Set(["className", "href", "src", "id", "key", "htmlFor", "data-testid", "testId", "type", "name", "role", "rel", "target", "autoComplete", "inputMode", "d", "viewBox"]);
/** Files allowed to use font-mono: the Code component and the shared mono input. */
const MONO_HOMES = new Set(["src/components/settings/code.tsx", "src/components/code-block.tsx", "src/components/ui.ts"]);
/** The one file that may render a <pre>. */
const PRE_HOMES = new Set(["src/components/code-block.tsx"]);

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".d.ts")) out.push(p);
  }
  return out.sort();
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

const allow = readJson(ALLOW_FILE, []);
const baseline = readJson(BASELINE_FILE, { fontMono: 0, pre: 0, wideButtons: 0, unlabeledInputs: {} });

const errors = [];
const reports = { fontMono: [], pre: [], wideButtons: [], unlabeledInputs: [] };

function allowed(rule, rel, text) {
  return allow.some((a) => a.rule === rule && a.file === rel && text.includes(a.text));
}

function hit(list, rule, rel, sf, pos, message, text) {
  if (allowed(rule, rel, text)) return;
  const { line, character } = sf.getLineAndCharacterOfPosition(pos);
  list.push({ rule, file: rel, line: line + 1, col: character + 1, message });
}

/** The JSX attribute a node sits in, if any. */
function attrName(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isJsxAttribute(n)) return n.name.getText();
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isBlock(n)) return null;
  }
  return null;
}

function inImport(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || ts.isExternalModuleReference(n)) return true;
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
  }
  return false;
}

/** Text a person reads: JSX text, and strings with a space in them that are not class names, URLs or imports. */
function copyOf(node) {
  if (ts.isJsxText(node)) return node.getText().trim() || null;
  const literal =
    ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);
  if (!literal) return null;
  const text = node.text;
  if (!/\s/.test(text.trim())) return null;
  if (inImport(node)) return null;
  const attr = attrName(node);
  if (attr && NOT_COPY_ATTRS.has(attr)) return null;
  return text;
}

function jsxTag(node) {
  const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
  return opening ? { opening, tag: opening.tagName.getText() } : null;
}

function attrs(opening) {
  const map = new Map();
  let spread = false;
  for (const p of opening.attributes.properties) {
    if (ts.isJsxSpreadAttribute(p)) spread = true;
    else map.set(p.name.getText(), p.initializer);
  }
  return { map, spread };
}

function staticText(init) {
  if (!init) return "";
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression) {
    const e = init.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
    if (ts.isTemplateExpression(e)) return [e.head.text, ...e.templateSpans.map((s) => s.literal.text)].join(" ");
  }
  return "";
}

function insideLabel(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isJsxElement(n) && n.openingElement.tagName.getText() === "label") return true;
  }
  return false;
}

/** A class list that leaves the element full width from `sm:` up. */
function wideFromSm(cls) {
  const tokens = cls.split(/\s+/);
  if (tokens.some((t) => /^(sm|md|lg|xl):w-full$/.test(t))) return true;
  if (!tokens.includes("w-full")) return false;
  return !tokens.some((t) => /^sm:(w-|max-w-|inline-flex|inline-block|flex-none|self-)/.test(t));
}

for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  const source = fs.readFileSync(file, "utf8");
  const tsx = file.endsWith(".tsx");

  // brand: the whole file, comments included.
  for (const m of source.matchAll(BRAND)) {
    const lineText = source.slice(source.lastIndexOf("\n", m.index) + 1, source.indexOf("\n", m.index));
    if (allowed("brand", rel, lineText)) continue;
    const before = source.slice(0, m.index);
    const line = before.split("\n").length;
    errors.push({ rule: "brand", file: rel, line, col: m.index - before.lastIndexOf("\n"), message: "\"CoderHelm\": the product is spelled \"Coderhelm\"" });
  }

  // break-all: cuts words that would fit on the next line.
  for (const m of source.matchAll(/\bbreak-all\b/g)) {
    const lineText = source.slice(source.lastIndexOf("\n", m.index) + 1, source.indexOf("\n", m.index));
    if (allowed("break-all", rel, lineText)) continue;
    const before = source.slice(0, m.index);
    errors.push({
      rule: "break-all",
      file: rel,
      line: before.split("\n").length,
      col: m.index - before.lastIndexOf("\n"),
      message: "`break-all` cuts any word at the line's end, even one that fits on the next line; use `wrap-anywhere` on the element that holds the long string",
    });
  }

  // font-mono: counted, outside its homes.
  if (!MONO_HOMES.has(rel)) {
    for (const m of source.matchAll(/\bfont-mono\b/g)) {
      const before = source.slice(0, m.index);
      reports.fontMono.push({ rule: "font-mono", file: rel, line: before.split("\n").length, col: 1, message: "font-mono outside <Code>" });
    }
  }

  if (!tsx) continue;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const htmlFor = new Set();
  let htmlForExpr = false;
  sf.forEachChild(function scan(node) {
    if (ts.isJsxAttribute(node) && node.name.getText() === "htmlFor") {
      const t = staticText(node.initializer);
      if (t) htmlFor.add(t);
      else htmlForExpr = true;
    }
    node.forEachChild(scan);
  });

  sf.forEachChild(function visit(node) {
    const copy = copyOf(node);
    if (copy) {
      if (MODEL_NAME.test(copy)) {
        hit(errors, "model-name", rel, sf, node.getStart(), `model name in page text ("${copy.match(MODEL_NAME)[0]}"): read it from lib/models.ts`, copy);
      }
      for (const j of JARGON) {
        if (j.re.test(copy)) hit(errors, "jargon", rel, sf, node.getStart(), `"${copy.match(j.re)[0]}" in UI copy. ${j.say}`, copy);
      }
    }

    const el = jsxTag(node);
    if (el) {
      const { map, spread } = attrs(el.opening);
      if (el.tag === "input" || el.tag === "textarea" || el.tag === "select") {
        const type = staticText(map.get("type"));
        const id = map.has("id") ? staticText(map.get("id")) : null;
        const labelled =
          spread ||
          type === "hidden" ||
          map.has("aria-label") ||
          map.has("aria-labelledby") ||
          insideLabel(node) ||
          (map.has("id") && (id === "" || htmlFor.has(id) || htmlForExpr));
        if (!labelled) {
          hit(reports.unlabeledInputs, "unlabeled-input", rel, sf, node.getStart(), `<${el.tag}> has no label (a <label htmlFor>, aria-label or aria-labelledby)`, el.opening.getText());
        }
      }
      {
        const raw = map.get("className")?.getText() ?? "";
        const role = staticText(map.get("role"));
        const control =
          el.tag === "button" || el.tag === "label" || el.tag === "th" || role === "tab" || role === "button" ||
          /\b(primaryButton|secondaryButton|dangerButton|ghostButton|smallPrimaryButton|smallSecondaryButton|smallDangerButton|buttonClass|linkButton)\b/.test(raw);
        if (control && /(\bwrap-anywhere\b|overflow-wrap:anywhere)/.test(raw)) {
          hit(errors, "anywhere-on-control", rel, sf, node.getStart(), `wrap-anywhere on a <${el.tag}>: a squeezed row would cut its words mid-word. Put it on the inner element that holds the long string, keep the words whole`, el.opening.getText());
        }
      }
      if (el.tag === "pre" && !PRE_HOMES.has(rel)) {
        hit(reports.pre, "pre", rel, sf, node.getStart(), "a hand-rolled <pre>: use <CodeBlock> (components/code-block.tsx)", el.opening.getText());
      }
      if (el.tag === "button" || el.tag === "Link" || el.tag === "a") {
        const init = map.get("className");
        const cls = staticText(init);
        const raw = init ? init.getText() : "";
        // An action button: one of the shared button classes, or a hand-rolled
        // pill (rounded-lg, px-4). Full-width rows, list items and pickers
        // (text-left, justify-between) are not buttons in this sense.
        const action = /\b(primaryButton|secondaryButton|dangerButton|ghostButton|buttonClass)\b/.test(raw) || (/\brounded-lg\b/.test(cls) && /\bpx-4\b/.test(cls));
        const row = /\b(text-left|justify-between)\b/.test(cls);
        if (action && !row && wideFromSm(cls)) {
          hit(reports.wideButtons, "wide-button", rel, sf, node.getStart(), "full-width button from sm: up; use fullWidthOnPhone (w-full sm:w-auto)", cls);
        }
      }
    }
    node.forEachChild(visit);
  });
}

// ── One top bar per page ───────────────────────────────────────────
//
// The shell draws exactly one top bar (components/top-bar.tsx). Every page
// must be named in the route map, and no page draws a heading, a back link or
// a breadcrumb of its own: <PageHeader> does that through the bar.

const ROUTES_FILE = path.join(SRC, "lib", "routes.ts");
const routeKeys = new Set([...fs.readFileSync(ROUTES_FILE, "utf8").matchAll(/^\s*"(\/[^"]*)":\s*\{/gm)].map((m) => m[1]));
/** Files that may draw an <h1>: the bar, PageHeader, Markdown renderers, the screens shown before the shell. */
const H1_HOMES = new Set([
  "src/components/top-bar.tsx",
  "src/components/page.tsx",
  "src/components/markdown.tsx",
  "src/components/chat-markdown.tsx",
  "src/components/client-shell.tsx",
]);

function textHit(rule, rel, text, index, message, match) {
  if (allowed(rule, rel, match)) return;
  const before = text.slice(0, index);
  const line = before.split("\n").length;
  const col = index - before.lastIndexOf("\n");
  errors.push({ rule, file: rel, line, col, message });
}

for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  const text = fs.readFileSync(file, "utf8");
  const page = rel.match(/^src\/app\/(.*)page\.tsx$/);
  if (page) {
    const route = "/" + page[1].replace(/\/$/, "");
    if (!routeKeys.has(route)) textHit("page-route", rel, text, 0, `${route} has no entry in src/lib/routes.ts; add its label and parent`, route);
  }
  if (!rel.endsWith(".tsx")) continue;
  if (!H1_HOMES.has(rel)) {
    for (const m of text.matchAll(/<h1[\s>]/g)) {
      textHit("page-header", rel, text, m.index, "raw <h1>: use <PageHeader> (an item's page: <PageHeader detail>)", text.slice(m.index, text.indexOf("\n", m.index)));
    }
  }
  if (rel.startsWith("src/app/")) {
    for (const m of text.matchAll(/←/g)) {
      textHit("page-header", rel, text, m.index, "a back link: the top bar's trail (and its back arrow on a phone) goes up a level", text.slice(text.lastIndexOf("\n", m.index) + 1, text.indexOf("\n", m.index)).trim());
    }
  }
  if (rel !== "src/components/top-bar.tsx") {
    for (const m of text.matchAll(/aria-label="Breadcrumb"/g)) {
      textHit("page-header", rel, text, m.index, "a breadcrumb of its own: the top bar draws the trail from src/lib/routes.ts", m[0]);
    }
  }
}

// ── Baselines ──────────────────────────────────────────────────────

const unlabeledByFile = {};
for (const h of reports.unlabeledInputs) unlabeledByFile[h.file] = (unlabeledByFile[h.file] || 0) + 1;

if (UPDATE) {
  const next = {
    "//": "Counts the UI lint tolerates today. Lower them as pages are fixed; `node scripts/ui-lint.mjs --update-baseline` rewrites this file.",
    fontMono: reports.fontMono.length,
    pre: reports.pre.length,
    wideButtons: reports.wideButtons.length,
    unlabeledInputs: Object.fromEntries(Object.entries(unlabeledByFile).sort()),
  };
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(next, null, 2) + "\n");
  console.log(`Baseline written: font-mono ${next.fontMono}, wide buttons ${next.wideButtons}, unlabeled inputs ${reports.unlabeledInputs.length}`);
}

const known = baseline.unlabeledInputs || {};
for (const [file, n] of Object.entries(unlabeledByFile)) {
  const allowedCount = known[file] || 0;
  if (n > allowedCount) {
    for (const h of reports.unlabeledInputs.filter((x) => x.file === file)) {
      errors.push({ ...h, message: `${h.message} (${file} has ${n}, baseline ${allowedCount})` });
    }
  }
}

function print(h, level) {
  const where = `${h.file}:${h.line}:${h.col}`;
  console.log(`${level === "error" ? "error" : "warn "}  ${where}  ${h.rule}  ${h.message}`);
  if (GITHUB) console.log(`::${level} file=${REPO_PREFIX}/${h.file},line=${h.line},col=${h.col},title=${h.rule}::${h.message}`);
}

for (const e of errors) print(e, "error");

const monoBase = baseline.fontMono ?? 0;
const wideBase = baseline.wideButtons ?? 0;
const preBase = baseline.pre ?? 0;
const unlabeledBase = Object.values(known).reduce((a, b) => a + b, 0);
if (reports.fontMono.length > monoBase) for (const h of reports.fontMono) print(h, "warning");
if (reports.pre.length > preBase) for (const h of reports.pre) print(h, "warning");
if (reports.wideButtons.length > wideBase) for (const h of reports.wideButtons) print(h, "warning");
else for (const h of reports.wideButtons) console.log(`warn   ${h.file}:${h.line}:${h.col}  wide-button  ${h.message}`);

console.log("");
console.log(`font-mono outside <Code>:   ${reports.fontMono.length} (baseline ${monoBase})${reports.fontMono.length < monoBase ? "  lower than the baseline: run --update-baseline" : ""}`);
console.log(`<pre> outside <CodeBlock>:   ${reports.pre.length} (baseline ${preBase})${reports.pre.length < preBase ? "  lower than the baseline: run --update-baseline" : ""}`);
console.log(`wide buttons from sm: up:   ${reports.wideButtons.length} (baseline ${wideBase})`);
console.log(`inputs without a label:     ${reports.unlabeledInputs.length} (baseline ${unlabeledBase})${reports.unlabeledInputs.length < unlabeledBase ? "  lower than the baseline: run --update-baseline" : ""}`);
console.log(errors.length ? `\n${errors.length} UI lint error${errors.length === 1 ? "" : "s"}.` : "\nUI lint passed.");
process.exit(errors.length ? 1 : 0);
