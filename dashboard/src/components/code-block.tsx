"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cachedTokens, isShell, langLabel, resolveLang, tokenize, type Token } from "@/lib/highlight";
import { copyText } from "./copy-button";
import { CheckIcon, CopyIcon } from "./icons";
import { focusRing } from "./ui";

/**
 * A block of code: a config file, a CI step, a script, a fenced block in
 * markdown. Inline code (a label, a path, one value) is `<Code>`.
 *
 * - Header: the filename, or the language ("YAML", "Terminal"), on the left and
 *   Copy on the right. Plain text with neither gets no header bar; Copy sits
 *   in the corner instead.
 * - Copy copies exactly what someone would paste: shell prompts (`$ `) and
 *   command output are left out, diff markers are left out when `diff` marks
 *   changes in a real language, and a patch (`lang="diff"`) is copied as is.
 * - Long lines scroll sideways inside the block, never the page. `wrap` wraps
 *   instead, for prose-like text such as instructions.
 */
export function CodeBlock({
  code,
  lang,
  filename,
  title: caption,
  label,
  lineNumbers = false,
  highlight,
  diff = false,
  wrap = false,
  maxHeightClass = "",
  className = "",
  testId,
}: {
  code: string;
  /** A fence language or alias: ts, tsx, yaml, bash, sql, diff… Unknown ones show their name, unhighlighted. */
  lang?: string;
  /** Shown in the header, in monospace, in place of the language. */
  filename?: string;
  /** A plain-words header when there is no file ("GitHub Actions step"); the language follows it. */
  title?: string;
  /** What the block is, for screen readers ("Setup script"). Defaults to the filename or the language. */
  label?: string;
  lineNumbers?: boolean;
  /** Lines to mark, 1-based: [2, 4] or "2,4-6". */
  highlight?: number[] | string;
  /** Read leading +/- as added and removed lines, highlighting the rest in `lang`. Implied by lang="diff". */
  diff?: boolean;
  wrap?: boolean;
  /** A Tailwind max-height for long output, e.g. "max-h-96"; the block scrolls inside it. */
  maxHeightClass?: string;
  className?: string;
  testId?: string;
}) {
  const patch = resolveLang(lang) === "diff";
  const lines = useMemo(() => parse(code, { diff: diff || patch, patch, shell: isShell(lang) }), [code, diff, patch, lang]);
  const tokenLang = patch ? undefined : lang;
  const source = useMemo(() => lines.map((l) => (l.kind === "meta" || l.kind === "output" ? "" : l.text)).join("\n"), [lines]);
  const copyValue = useMemo(() => (patch ? normalize(code) : textToCopy(lines)), [patch, code, lines]);
  const marked = useMemo(() => parseRanges(highlight), [highlight]);

  const [tokens, setTokens] = useState<Token[][] | null>(() => cachedTokens(source, tokenLang));
  useEffect(() => {
    let live = true;
    setTokens(cachedTokens(source, tokenLang));
    tokenize(source, tokenLang).then((t) => {
      if (live) setTokens(t);
    });
    return () => {
      live = false;
    };
  }, [source, tokenLang]);

  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    const ok = await copyText(copyValue);
    setCopied(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied("idle"), ok ? 2000 : 4000);
  };
  // Ctrl/Cmd+C on the focused block with nothing selected copies all of it.
  const onKeyDown = (e: KeyboardEvent<HTMLPreElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c" && !window.getSelection()?.toString()) {
      e.preventDefault();
      void copy();
    }
  };

  const language = langLabel(lang);
  const title = filename || caption || language;
  const name = label || filename || caption || (language ? `${language} code` : "Code");
  let number = 0;

  const button = (
    <button
      type="button"
      onClick={copy}
      data-testid="code-copy"
      className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs transition-colors motion-reduce:transition-none ${
        copied === "copied" ? "text-emerald-300" : copied === "failed" ? "text-red-300" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
      } ${focusRing}`}
    >
      <span aria-hidden="true" className="scale-[0.8]">{copied === "copied" ? <CheckIcon /> : <CopyIcon />}</span>
      <span aria-live="polite">
        {copied === "copied" ? "Copied" : copied === "failed" ? "Couldn't copy" : "Copy"}
        {copied === "idle" && <span className="sr-only"> {name}</span>}
      </span>
    </button>
  );

  return (
    <figure
      role="region"
      aria-label={name}
      data-testid={testId}
      data-code-block=""
      data-lang={resolveLang(lang) ?? lang ?? "text"}
      className={`group/code relative min-w-0 max-w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 ${className}`}
    >
      {title && (
        <figcaption className="flex h-9 min-w-0 items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/60 pl-3 pr-1">
          <span className="flex min-w-0 items-center gap-2 text-xs">
            {isShell(lang) && !filename ? <TerminalGlyph /> : null}
            <span className={`truncate ${filename ? "font-mono text-zinc-200" : caption ? "text-zinc-300" : "text-zinc-400"}`}>{title}</span>
            {!filename && caption && language && <span className="shrink-0 text-zinc-400">{language}</span>}
          </span>
          {button}
        </figcaption>
      )}
      {!title && (
        <div className="absolute right-1 top-1 z-10 rounded-md bg-zinc-950/90 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/code:opacity-100 [@media(hover:hover)]:has-[:focus-visible]:opacity-100">
          {button}
        </div>
      )}
      <pre
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={`min-w-0 overflow-auto py-3 font-mono text-[0.78rem] leading-relaxed text-zinc-300 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-500 ${maxHeightClass}`}
      >
        <code className={`block ${wrap ? "w-full" : "w-max min-w-full"}`}>
          {lines.map((line, i) => {
            const n = line.kind === "meta" ? null : ++number;
            const mark = n !== null && marked.has(n);
            return (
              <span
                key={i}
                data-line={n ?? undefined}
                data-kind={line.kind}
                data-marked={mark || undefined}
                className={`flex ${!title && i === 0 ? "pr-24" : ""} ${
                  line.kind === "add"
                    ? "bg-emerald-500/10"
                    : line.kind === "del"
                      ? "bg-red-500/10"
                      : mark
                        ? "bg-sky-400/10 shadow-[inset_2px_0_0_var(--color-sky-400)]"
                        : ""
                }`}
              >
                {lineNumbers && (
                  <span aria-hidden="true" className="w-10 shrink-0 select-none pr-3 text-right tabular-nums text-zinc-400">
                    {n ?? ""}
                  </span>
                )}
                {line.diffable && (
                  <span
                    aria-hidden="true"
                    className={`w-6 shrink-0 select-none text-center ${line.kind === "add" ? "text-emerald-400" : line.kind === "del" ? "text-red-400" : ""}`}
                  >
                    {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
                  </span>
                )}
                <span className={`min-w-0 flex-1 ${lineNumbers || line.diffable ? "pr-4" : "px-4"} ${wrap ? "whitespace-pre-wrap [overflow-wrap:anywhere]" : "whitespace-pre"}`}>
                  {line.kind === "add" && <span className="sr-only">Added: </span>}
                  {line.kind === "del" && <span className="sr-only">Removed: </span>}
                  {line.prompt && (
                    <span aria-hidden="true" data-prompt="" className="select-none text-zinc-500">
                      {line.prompt}
                    </span>
                  )}
                  <LineText line={line} tokens={tokens?.[i]} patch={patch} />
                  {"\n"}
                </span>
              </span>
            );
          })}
        </code>
      </pre>
    </figure>
  );
}

function LineText({ line, tokens, patch }: { line: Line; tokens?: Token[]; patch: boolean }) {
  if (line.kind === "meta") return <span className="text-zinc-500">{line.text}</span>;
  if (line.kind === "output") return <span className="text-zinc-400">{line.text}</span>;
  if (patch || !tokens || tokens.length === 0) {
    return <>{line.text}</>;
  }
  return (
    <>
      {tokens.map((t, j) => (
        <span key={j} style={{ color: t.color, fontStyle: t.italic ? "italic" : undefined, fontWeight: t.bold ? 600 : undefined }}>
          {t.content}
        </span>
      ))}
    </>
  );
}

function TerminalGlyph() {
  return (
    <svg aria-hidden="true" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-500">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

// ── Parsing ─────────────────────────────────────────────────────────

type Line = {
  /** The code on the line, without its prompt or diff marker. */
  text: string;
  prompt?: string;
  kind?: "add" | "del" | "meta" | "output";
  /** Shows a +/- gutter. */
  diffable?: boolean;
};

const PROMPT = /^(\$|❯|%) /;
const PATCH_META = /^(\+\+\+ |--- |@@|diff --git|index [0-9a-f]+\.\.)/;

function normalize(code: string): string {
  return code.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
}

function parse(code: string, opts: { diff: boolean; patch: boolean; shell: boolean }): Line[] {
  const raw = normalize(code).split("\n");
  const hasPrompt = opts.shell && raw.some((l) => PROMPT.test(l));
  let continued = false;
  return raw.map((text): Line => {
    if (opts.diff) {
      if (opts.patch && PATCH_META.test(text)) return { text, kind: "meta" };
      if (text.startsWith("+")) return { text: text.slice(1), kind: "add", diffable: true };
      if (text.startsWith("-")) return { text: text.slice(1), kind: "del", diffable: true };
      return { text: text.startsWith(" ") ? text.slice(1) : text, diffable: true };
    }
    if (hasPrompt) {
      const m = PROMPT.exec(text);
      if (m) {
        continued = text.trimEnd().endsWith("\\");
        return { text: text.slice(m[0].length), prompt: `${m[1]} ` };
      }
      if (continued) {
        continued = text.trimEnd().endsWith("\\");
        return { text };
      }
      // In a session with prompts, a line without one is the command's output.
      return { text, kind: "output" };
    }
    return { text };
  });
}

/** What Copy puts on the clipboard: commands without prompts or output, the new side of a change. */
function textToCopy(lines: Line[]): string {
  return lines
    .filter((l) => l.kind !== "del" && l.kind !== "meta" && l.kind !== "output")
    .map((l) => l.text)
    .join("\n");
}

function parseRanges(spec?: number[] | string): Set<number> {
  if (!spec) return new Set();
  if (Array.isArray(spec)) return new Set(spec);
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const m = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(part);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let n = Math.min(a, b); n <= Math.max(a, b) && n - a < 10_000; n++) out.add(n);
  }
  return out;
}

/** Text that may be JSON: pretty-printed as JSON when it parses, as is otherwise. */
export function jsonOrText(text: string): { code: string; lang?: string } {
  const t = text.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      return { code: JSON.stringify(JSON.parse(t), null, 2), lang: "json" };
    } catch {
      // Not JSON after all.
    }
  }
  return { code: text };
}
