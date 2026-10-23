// Syntax highlighting for <CodeBlock>, with Shiki loaded only when a page
// shows code.
//
// Nothing here is in a page's first load: the Shiki core, its JavaScript regex
// engine (no WebAssembly download) and each language grammar are separate
// chunks fetched the first time a block in that language appears. The dashboard
// is a static export and the code it shows (plan specs, findings, support
// messages) arrives from the API at run time, so highlighting happens in the
// browser; a block shows plain text until its tokens arrive, laid out the same,
// so nothing moves.

import type { HighlighterCore, ThemeRegistration } from "shiki/core";

/** One highlighted run of text. */
export type Token = { content: string; color?: string; italic?: boolean; bold?: boolean };

type Grammar = () => Promise<{ default: unknown }>;

// Each entry is a lazy chunk; listing a language costs a few bytes until used.
// Ruby and PHP are left out on purpose: their grammars embed a dozen others
// (C++, HTML, SQL…), several hundred kB for one block.
const GRAMMARS: Record<string, Grammar> = {
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  jsonc: () => import("shiki/langs/jsonc.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  shellscript: () => import("shiki/langs/shellscript.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  hcl: () => import("shiki/langs/hcl.mjs"),
  terraform: () => import("shiki/langs/terraform.mjs"),
  diff: () => import("shiki/langs/diff.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  graphql: () => import("shiki/langs/graphql.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  kotlin: () => import("shiki/langs/kotlin.mjs"),
  swift: () => import("shiki/langs/swift.mjs"),
  csharp: () => import("shiki/langs/csharp.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  dockerfile: () => import("shiki/langs/dockerfile.mjs"),
  toml: () => import("shiki/langs/toml.mjs"),
  xml: () => import("shiki/langs/xml.mjs"),
};

const ALIASES: Record<string, string> = {
  ts: "typescript", mts: "typescript", cts: "typescript",
  js: "javascript", mjs: "javascript", cjs: "javascript",
  json5: "jsonc",
  yml: "yaml",
  bash: "shellscript", sh: "shellscript", shell: "shellscript", zsh: "shellscript", console: "shellscript", terminal: "shellscript", "shell-session": "shellscript", shellsession: "shellscript",
  py: "python",
  rs: "rust",
  postgres: "sql", postgresql: "sql", psql: "sql", mysql: "sql",
  tf: "terraform", tfvars: "terraform",
  patch: "diff",
  md: "markdown", mdx: "markdown",
  gql: "graphql",
  golang: "go",
  kt: "kotlin",
  cs: "csharp", "c#": "csharp",
  htm: "html",
  docker: "dockerfile",
  svg: "xml",
};

const LABELS: Record<string, string> = {
  typescript: "TypeScript", tsx: "TSX", javascript: "JavaScript", jsx: "JSX", json: "JSON", jsonc: "JSON", yaml: "YAML",
  shellscript: "Terminal", python: "Python", rust: "Rust", sql: "SQL", hcl: "HCL", terraform: "Terraform", diff: "Diff",
  markdown: "Markdown", graphql: "GraphQL", go: "Go", java: "Java", kotlin: "Kotlin", swift: "Swift",
  csharp: "C#", html: "HTML", css: "CSS", dockerfile: "Dockerfile", toml: "TOML", xml: "XML",
};

/** The grammar id for a fence or prop language, or null when there is none to load. */
export function resolveLang(lang?: string): string | null {
  if (!lang) return null;
  const l = lang.trim().toLowerCase();
  const id = ALIASES[l] ?? l;
  return id in GRAMMARS ? id : null;
}

/** The language a file's extension implies (src/api.ts → "ts"), for fences in a finding about that file. */
export function langFromPath(file?: string): string | undefined {
  if (!file) return undefined;
  const base = file.split("/").pop() ?? "";
  if (/^dockerfile$/i.test(base)) return "dockerfile";
  const ext = /\.([A-Za-z0-9]+)$/.exec(base)?.[1]?.toLowerCase();
  return ext && resolveLang(ext) ? ext : undefined;
}

/** What the header calls a language: "YAML", "Terminal". Unknown languages keep their own name. */
export function langLabel(lang?: string): string | null {
  if (!lang) return null;
  const l = lang.trim();
  if (!l || /^(text|plain|plaintext|txt|none)$/i.test(l)) return null;
  const id = resolveLang(l);
  return id ? LABELS[id] : l;
}

/** Shell languages show a prompt that is never copied. */
export function isShell(lang?: string): boolean {
  return resolveLang(lang) === "shellscript";
}

// The app's own palette (Tailwind zinc + the 300 shades), on the zinc-950 block
// background. Every color here is at least 5.5:1 against #09090b; comments are
// the dimmest and still read at 6:1.
const THEME: ThemeRegistration = {
  name: "coderhelm-dark",
  type: "dark",
  colors: { "editor.background": "#09090b", "editor.foreground": "#d4d4d8" },
  tokenColors: [
    { settings: { foreground: "#d4d4d8" } },
    { scope: ["comment", "punctuation.definition.comment", "string.comment"], settings: { foreground: "#8e8e99", fontStyle: "italic" } },
    { scope: ["keyword", "storage", "storage.type", "storage.modifier", "keyword.control", "keyword.operator.new", "keyword.operator.expression", "keyword.other", "variable.language"], settings: { foreground: "#c4b5fd" } },
    { scope: ["keyword.operator", "punctuation", "meta.brace", "punctuation.separator", "punctuation.terminator"], settings: { foreground: "#a1a1aa" } },
    { scope: ["string", "string.quoted", "string.template", "punctuation.definition.string", "string.unquoted.plain", "markup.inline.raw"], settings: { foreground: "#86efac" } },
    { scope: ["constant.numeric", "constant.language", "constant.character", "constant.other", "support.constant", "keyword.other.unit"], settings: { foreground: "#fdba74" } },
    { scope: ["entity.name.function", "support.function", "meta.function-call entity.name.function", "entity.name.command", "support.function.builtin", "entity.name.label"], settings: { foreground: "#7dd3fc" } },
    { scope: ["entity.name.type", "entity.name.class", "support.type", "support.class", "entity.other.inherited-class", "storage.type.primitive", "entity.name.namespace"], settings: { foreground: "#5eead4" } },
    { scope: ["entity.name.tag", "punctuation.definition.tag"], settings: { foreground: "#f9a8d4" } },
    { scope: ["entity.other.attribute-name", "support.type.property-name", "meta.object-literal.key", "variable.other.property", "variable.other.object.property", "entity.name.tag.yaml", "support.type.property-name.json", "variable.other.normal.shell", "variable.other.readwrite.shell", "punctuation.definition.variable.shell", "variable.other.member"], settings: { foreground: "#93c5fd" } },
    { scope: ["variable.parameter", "meta.parameter"], settings: { foreground: "#e4e4e7" } },
    { scope: ["string.regexp", "constant.character.escape"], settings: { foreground: "#fca5a5" } },
    { scope: ["markup.heading", "entity.name.section"], settings: { foreground: "#f4f4f5", fontStyle: "bold" } },
    { scope: ["markup.bold"], settings: { fontStyle: "bold" } },
    { scope: ["markup.italic"], settings: { fontStyle: "italic" } },
    { scope: ["markup.underline.link", "string.other.link"], settings: { foreground: "#93c5fd" } },
    { scope: ["markup.inserted", "punctuation.definition.inserted"], settings: { foreground: "#86efac" } },
    { scope: ["markup.deleted", "punctuation.definition.deleted"], settings: { foreground: "#fca5a5" } },
    { scope: ["meta.diff.range", "meta.diff.header", "meta.diff.index"], settings: { foreground: "#8e8e99" } },
    { scope: ["invalid"], settings: { foreground: "#fca5a5" } },
  ],
};

let core: Promise<HighlighterCore> | null = null;
const loading = new Map<string, Promise<void>>();

function highlighter(): Promise<HighlighterCore> {
  core ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
      import("shiki/core"),
      import("shiki/engine/javascript"),
    ]);
    return createHighlighterCore({ themes: [THEME], langs: [], engine: createJavaScriptRegexEngine({ forgiving: true }) });
  })();
  core.catch(() => {
    core = null;
  });
  return core;
}

async function ensureLang(hl: HighlighterCore, id: string) {
  let p = loading.get(id);
  if (!p) {
    p = GRAMMARS[id]().then((m) => hl.loadLanguage(m.default as Parameters<HighlighterCore["loadLanguage"]>[0]));
    loading.set(id, p);
    p.catch(() => loading.delete(id));
  }
  await p;
}

const MAX_CHARS = 100_000;
const cache = new Map<string, Token[][]>();

/** Tokens for a block already highlighted in this page view (so a remount doesn't flash plain text). */
export function cachedTokens(code: string, lang?: string): Token[][] | null {
  const id = resolveLang(lang);
  return id ? cache.get(`${id}\0${code}`) ?? null : null;
}

/** Highlighted lines, or null when the language has no grammar or loading failed (the block stays plain). */
export async function tokenize(code: string, lang?: string): Promise<Token[][] | null> {
  const id = resolveLang(lang);
  if (!id || code.length > MAX_CHARS) return null;
  const key = `${id}\0${code}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const hl = await highlighter();
    await ensureLang(hl, id);
    const { tokens } = hl.codeToTokens(code, { lang: id, theme: THEME.name!, tokenizeMaxLineLength: 2000 });
    const lines = tokens.map((line) =>
      line.map((t) => ({
        content: t.content,
        color: t.color,
        italic: !!(t.fontStyle && t.fontStyle & 1),
        bold: !!(t.fontStyle && t.fontStyle & 2),
      })),
    );
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    cache.set(key, lines);
    return lines;
  } catch {
    return null;
  }
}
