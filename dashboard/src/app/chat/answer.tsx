"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChatMarkdown } from "@/components/chat-markdown";
import { CodeBlock } from "@/components/code-block";
import { Modal } from "@/components/modal";
import { Chip } from "@/components/list";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/popover";
import { StreamingCursor } from "@/components/streaming-cursor";
import { copyText } from "@/components/copy-button";
import {
  BookIcon,
  CheckIcon,
  CodeIcon,
  CopyIcon,
  DatabaseIcon,
  ExternalLinkIcon,
  LogsIcon,
  MemoryIcon,
  PaperclipIcon,
  PluginIcon,
  RetryIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "@/components/icons";
import { ChevronDownIcon, LoaderIcon } from "@/components/stream-icons";
import { focusRing, linkButton } from "@/components/ui";
import {
  CITATION_KIND,
  activitySummary,
  citationWhen,
  groupSources,
  linkCitations,
  withoutCitations,
  type Citation,
  type Rating,
  type SourceDoc,
} from "@/lib/brain";

// One answer, the way the best answer pages read:
// - what Chat did, as one quiet line ("Read 4 files in web, searched the
//   code") that opens to the steps;
// - the text, in a calm reading column, with a small number after each
//   claim; hovering or tapping the number shows the source: the real file
//   path and lines (linked on GitHub at that commit) or the page's title;
// - the sources, each listed once with its real name;
// - copy, ask again and a rating.
// An answer nothing supported says so plainly.

export interface ToolStep {
  id: string;
  label: string;
  status: "running" | "success" | "error";
  summary?: string;
  /** The tool (`github__read_file`), for the summary line. */
  name?: string;
  /** The repository it read, short name. */
  repo?: string;
}

/** The icon for a kind of source. */
export function SourceIcon({ kind }: { kind: string }) {
  switch (kind) {
    case "code":
      return <CodeIcon />;
    case "upload":
      return <PaperclipIcon />;
    case "connection":
      return <PluginIcon />;
    case "data_source":
      return <DatabaseIcon />;
    case "memory":
      return <MemoryIcon />;
    case "skill":
      return <BookIcon />;
    default:
      return <LogsIcon />;
  }
}

/** "Lines 12-40" or "Lines 1-17, 30-44" for the parts of a file a source gathers. */
export function linesOf(doc: SourceDoc): string {
  const ranges = doc.parts
    .map((p) => p.code)
    .filter((c): c is NonNullable<Citation["code"]> => !!c && !!c.start_line)
    .map((c) => (c.end_line && c.end_line > c.start_line! ? `${c.start_line}-${c.end_line}` : `${c.start_line}`));
  const unique = [...new Set(ranges)];
  if (!unique.length) return "";
  return `${unique.length === 1 && !unique[0].includes("-") ? "Line" : "Lines"} ${unique.join(", ")}`;
}

/** Where a source sits, in a few words: "harbor-api · Lines 1-17" or "HR handbook · Updated May 1, 2026". */
export function whereOf(doc: SourceDoc): string {
  const c = doc.parts[0];
  if (c.code) {
    const repo = c.code.repo.split("/").pop() ?? c.code.repo;
    return [repo, linesOf(doc)].filter(Boolean).join(" · ");
  }
  return [c.base || CITATION_KIND[c.kind] || c.kind, c.kind === "knowledge" || c.kind === "upload" ? citationWhen(c.as_of) : ""].filter(Boolean).join(" · ");
}

/** Where a source opens: the file on GitHub at its commit, the synced page, or its page in the dashboard. */
function openTarget(doc: SourceDoc): { href: string; external: boolean; label: string } | null {
  const c = doc.parts[0];
  const url = doc.parts.find((p) => p.url)?.url;
  if (url && /^https:\/\//.test(url)) {
    return { href: url, external: true, label: c.code ? "Open on GitHub" : "Open the original" };
  }
  if (c.href && c.href.startsWith("/")) return { href: c.href, external: false, label: c.kind === "knowledge" ? "Open in Knowledge" : "Open in Coderhelm" };
  return null;
}

const isCode = (doc: SourceDoc) => doc.parts[0].kind === "code" && !!doc.parts[0].code?.path;

/** A code fence language for a file, from its extension. */
function langOf(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const known: Record<string, string> = { mjs: "js", cjs: "js", yml: "yaml", md: "markdown", h: "c", hpp: "cpp", kt: "kotlin", rb: "ruby", py: "python", rs: "rust" };
  return known[ext] ?? (ext.length > 0 && ext.length <= 5 ? ext : undefined);
}

/** The text a source card quotes: the first lines of what was read. */
function excerpt(doc: SourceDoc, lines = 8): string {
  const text = doc.parts[0].passage.replace(/\s+$/, "");
  const all = text.split("\n");
  return all.length > lines ? `${all.slice(0, lines).join("\n")}\n…` : text;
}

/** What a source shows when its number is hovered or tapped. */
function SourceCard({ doc }: { doc: SourceDoc }) {
  const c = doc.parts[0];
  const open = openTarget(doc);
  const code = isCode(doc);
  return (
    <div className="w-[min(24rem,calc(100vw-2rem))] p-3" data-testid="source-card">
      <div className="flex min-w-0 items-center gap-2 text-xs text-zinc-500">
        <span aria-hidden="true" className="shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5">
          <SourceIcon kind={c.kind} />
        </span>
        <span className="min-w-0 truncate">{whereOf(doc)}</span>
      </div>
      <p className="mt-1.5 text-sm font-medium leading-snug text-zinc-100 wrap-anywhere">{c.title}</p>
      {c.passage &&
        (code ? (
          <CodeBlock code={excerpt(doc, 6)} lang={langOf(c.title)} maxHeightClass="max-h-36" className="mt-2 text-[0.72rem]" />
        ) : (
          <p className="mt-2 line-clamp-5 whitespace-pre-line border-l-2 border-zinc-700 pl-2.5 text-xs leading-relaxed text-zinc-400">{excerpt(doc, 6)}</p>
        ))}
      {c.authoritative && (
        <p className="mt-2">
          <Chip tone="success">Source of truth</Chip>
        </p>
      )}
      {open &&
        (open.external ? (
          <a href={open.href} target="_blank" rel="noopener noreferrer" className={`mt-2.5 inline-flex items-center gap-1.5 text-xs text-zinc-300 hover:text-zinc-100 [&_svg]:h-3 [&_svg]:w-3 ${focusRing} rounded`} data-testid="source-open">
            {open.label}
            <ExternalLinkIcon />
          </a>
        ) : (
          <Link href={open.href} className={`mt-2.5 inline-flex items-center gap-1.5 text-xs text-zinc-300 hover:text-zinc-100 ${focusRing} rounded`} data-testid="source-open">
            {open.label}
          </Link>
        ))}
    </div>
  );
}

/**
 * A citation in the text: a small number. Hover shows the source card (on a
 * mouse); a tap or click toggles it (everywhere); Escape closes it.
 */
function CiteMarker({ doc }: { doc: SourceDoc }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const hover = (on: boolean) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(on), on ? 120 : 180);
  };
  const fine = () => typeof window !== "undefined" && window.matchMedia?.("(hover: hover)").matches;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          data-testid="cite-marker"
          aria-label={`Source ${doc.n}: ${doc.parts[0].title}`}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          onMouseEnter={() => fine() && hover(true)}
          onMouseLeave={() => fine() && hover(false)}
          className={`relative -top-[0.35em] mx-[0.1em] inline-flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-[0.3rem] px-1 align-baseline text-[0.66rem] font-semibold tabular-nums leading-none transition-colors motion-reduce:transition-none ${open ? "bg-zinc-200 text-zinc-900" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"} ${focusRing}`}
        >
          {doc.n}
        </button>
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={() => fine() && hover(true)}
        onMouseLeave={() => fine() && hover(false)}
      >
        <SourceCard doc={doc} />
      </PopoverContent>
    </Popover>
  );
}

const SHOWN_SOURCES = 5;

/** The sources, each once, under the answer. */
export function SourceList({ docs, onOpen }: { docs: SourceDoc[]; onOpen: (d: SourceDoc) => void }) {
  const [all, setAll] = useState(false);
  if (!docs.length) return null;
  const shown = all ? docs : docs.slice(0, SHOWN_SOURCES);
  return (
    <div className="mt-6" data-testid="source-list">
      <p className="mb-1.5 text-xs font-medium text-zinc-500">Sources</p>
      <ol className="-mx-2 flex flex-col" aria-label="Sources">
        {shown.map((d) => {
          const c = d.parts[0];
          return (
            <li key={d.key} className="min-w-0">
              <button
                type="button"
                onClick={() => onOpen(d)}
                data-testid="source"
                className={`group flex w-full min-w-0 items-baseline gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-900 ${focusRing}`}
              >
                <span className="w-4 shrink-0 text-right text-xs tabular-nums text-zinc-500">{d.n}</span>
                <span aria-hidden="true" className="relative top-[2px] shrink-0 text-zinc-500 [&_svg]:h-3.5 [&_svg]:w-3.5">
                  <SourceIcon kind={c.kind} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-zinc-200 wrap-anywhere group-hover:text-zinc-50">{c.title}</span>
                  <span className="block truncate text-xs text-zinc-500">{whereOf(d)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {docs.length > SHOWN_SOURCES && (
        <button type="button" onClick={() => setAll((a) => !a)} className={`${linkButton} mt-1 text-xs`}>
          {all ? "Show fewer" : `Show ${docs.length - SHOWN_SOURCES} more`}
        </button>
      )}
    </div>
  );
}

/** A source read in full: what was quoted, where it is, and a way to open it. */
export function SourceDialog({ doc, onClose }: { doc: SourceDoc | null; onClose: () => void }) {
  const open = doc ? openTarget(doc) : null;
  const code = doc ? isCode(doc) : false;
  return (
    <Modal open={!!doc} onOpenChange={(o) => !o && onClose()} title={doc?.parts[0].title ?? ""} description={doc ? whereOf(doc) : undefined} wide>
      {doc && (
        <div data-testid="passage" className="space-y-3">
          {doc.parts[0].authoritative && <Chip tone="success">Source of truth</Chip>}
          {doc.parts.map((p) => (
            <div key={p.id}>
              {code && p.code?.start_line ? <p className="mb-1 text-xs text-zinc-500">{p.code.end_line && p.code.end_line > p.code.start_line ? `Lines ${p.code.start_line}-${p.code.end_line}` : `Line ${p.code.start_line}`}</p> : null}
              {code ? (
                <CodeBlock code={p.passage} lang={langOf(p.title)} filename={p.code?.path} maxHeightClass="max-h-[45vh]" />
              ) : (
                <blockquote className="max-h-[45vh] overflow-y-auto whitespace-pre-wrap rounded-lg border-l-2 border-emerald-500/60 bg-zinc-950 px-4 py-3 text-sm leading-relaxed text-zinc-300 wrap-anywhere">{p.passage}</blockquote>
              )}
            </div>
          ))}
          {open &&
            (open.external ? (
              <a href={open.href} target="_blank" rel="noopener noreferrer" className={`${linkButton} gap-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5`}>
                {open.label}
                <ExternalLinkIcon />
              </a>
            ) : (
              <Link href={open.href} className={linkButton}>
                {open.label}
              </Link>
            ))}
        </div>
      )}
    </Modal>
  );
}

/** What Chat did, as one quiet line that opens to the steps. */
export function ActivityLine({ steps, streaming }: { steps: ToolStep[]; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  const running = [...steps].reverse().find((s) => s.status === "running");
  const summary = activitySummary(steps);
  const label = streaming ? (running?.label ?? steps[steps.length - 1]?.label ?? "Looking through your team's work") : summary;
  return (
    <div className="mb-3" data-testid="activity">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="activity-toggle"
        className={`group inline-flex max-w-full min-w-0 items-center gap-2 rounded-md py-0.5 text-[0.8rem] text-zinc-500 hover:text-zinc-300 ${focusRing}`}
      >
        <span aria-hidden="true" className="shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5">
          {streaming ? <LoaderIcon className="animate-spin motion-reduce:animate-none" /> : <CheckIcon />}
        </span>
        <span className={`min-w-0 truncate ${streaming ? "animate-chat-shimmer" : ""}`} data-testid="activity-summary">
          {label}
        </span>
        <ChevronDownIcon className={`h-3 w-3 shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ol className="ml-[0.4rem] mt-1.5 flex flex-col gap-1 border-l border-zinc-800 pl-4 text-[0.8rem] text-zinc-500" aria-label="Steps">
          {steps.map((s) => (
            <li key={s.id} className="flex min-w-0 items-baseline gap-2" data-testid="tool-step">
              <span aria-hidden="true" className={`relative top-[-1px] h-1.5 w-1.5 shrink-0 rounded-full ${s.status === "error" ? "bg-red-400/80" : s.status === "running" ? "bg-zinc-400" : "bg-zinc-600"}`} />
              <span className="min-w-0 wrap-anywhere">
                <span className="text-zinc-400">{s.label}</span>
                {s.summary && s.status !== "running" ? <span className="text-zinc-600"> · {s.summary}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const actionButton = `inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 aria-pressed:text-zinc-100 [&_svg]:h-[15px] [&_svg]:w-[15px] ${focusRing}`;

/** The sources a text cites, in the order it first mentions them. */
function citedSoFar(text: string, known: Citation[]): Citation[] {
  const byId = new Map(known.map((c) => [c.id, c]));
  const out: Citation[] = [];
  for (const id of text.match(/S\d+/g) ?? []) {
    const c = byId.get(id);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/** Keeps a growing box from shrinking while it streams, so the page doesn't jump when a step resets the text. */
function useNoShrink(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [min, setMin] = useState(0);
  useLayoutEffect(() => {
    if (!active) {
      setMin(0);
      return;
    }
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setMin((m) => Math.max(m, el.offsetHeight)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);
  return { ref, style: active && min ? { minHeight: min } : undefined };
}

export function AnswerView({
  text,
  citations,
  grounded,
  streaming,
  steps,
  rating,
  onRate,
  onRetry,
}: {
  text: string;
  citations: Citation[];
  grounded: boolean;
  streaming?: boolean;
  steps?: ToolStep[];
  /** The asker's rating; with `onRate`, the thumbs show. */
  rating?: Rating | null;
  onRate?: (r: Rating | null) => void;
  /** Ask the same question again (the latest answer only). */
  onRetry?: () => void;
}) {
  const [open, setOpen] = useState<SourceDoc | null>(null);
  const [copied, setCopied] = useState(false);
  // Numbered by first mention in the text, while streaming and after, so a number never changes.
  const cited = useMemo(() => citedSoFar(text, citations), [text, citations]);
  const { docs, numberOf } = useMemo(() => groupSources(cited), [cited]);
  const docOf = useMemo(() => new Map(docs.map((d) => [String(d.n), d])), [docs]);
  const body = useMemo(() => linkCitations(text, numberOf), [text, numberOf]);
  const waiting = streaming && !text;
  const box = useNoShrink(!!streaming);
  let content: ReactNode;
  if (waiting) {
    content = steps && steps.length ? null : (
      <p className="text-sm" data-testid="answer-waiting">
        <span className="animate-chat-shimmer">Looking through your team&apos;s work…</span>
      </p>
    );
  } else if (!grounded && !streaming) {
    content = (
      <div className="rounded-xl border border-zinc-800/80 px-4 py-3" data-testid="no-source-answer">
        <p className="text-sm font-medium text-zinc-200">Nothing found</p>
        <p className="mt-1 text-sm leading-relaxed text-zinc-400">{text}</p>
      </div>
    );
  } else {
    content = (
      <div className="chat-answer">
        <ChatMarkdown
          onCite={(n) => setOpen(docOf.get(n) ?? null)}
          renderCite={(n) => {
            const d = docOf.get(n);
            return d ? <CiteMarker key={n} doc={d} /> : null;
          }}
        >
          {body}
        </ChatMarkdown>
        {streaming && <StreamingCursor />}
      </div>
    );
  }
  return (
    <div className="min-w-0" data-testid="answer" ref={box.ref} style={box.style}>
      {steps && steps.length > 0 && <ActivityLine steps={steps} streaming={!!streaming} />}
      {content}
      {!streaming && grounded && <SourceList docs={docs} onOpen={setOpen} />}
      {!streaming && text && (
        <div className="-ml-2 mt-3 flex items-center gap-0.5" data-testid="answer-actions">
          <button
            type="button"
            className={actionButton}
            aria-label={copied ? "Copied" : "Copy answer"}
            title={copied ? "Copied" : "Copy"}
            data-testid="answer-copy"
            onClick={async () => {
              if (await copyText(withoutCitations(text))) {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }
            }}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
          {onRetry && (
            <button type="button" className={actionButton} aria-label="Ask again" title="Ask again" data-testid="answer-retry" onClick={onRetry}>
              <RetryIcon />
            </button>
          )}
          {onRate && (
            <>
              <button
                type="button"
                className={actionButton}
                aria-label="Good answer"
                title="Good answer"
                aria-pressed={rating === "up"}
                data-testid="answer-up"
                onClick={() => onRate(rating === "up" ? null : "up")}
              >
                <ThumbsUpIcon />
              </button>
              <button
                type="button"
                className={actionButton}
                aria-label="Bad answer"
                title="Bad answer"
                aria-pressed={rating === "down"}
                data-testid="answer-down"
                onClick={() => onRate(rating === "down" ? null : "down")}
              >
                <ThumbsDownIcon />
              </button>
            </>
          )}
        </div>
      )}
      <SourceDialog doc={open} onClose={() => setOpen(null)} />
    </div>
  );
}
