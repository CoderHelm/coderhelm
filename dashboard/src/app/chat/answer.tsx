"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
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
  GraphIcon,
  ExternalLinkIcon,
  LogsIcon,
  ClipboardIcon,
  GitBranchIcon,
  LayersIcon,
  MemoryIcon,
  PaperclipIcon,
  PlayIcon,
  ShieldAlertIcon,
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
  appMapFlowLink,
  appMapLink,
  citationWhen,
  stepSource,
  unavailableNote,
  groupSources,
  isWorkKind,
  linkCitations,
  withoutCitations,
  type ChatMap,
  type Citation,
  type Rating,
  type SourceDoc,
} from "@/lib/brain";

// The mini map's frame, loaded only when an answer has a map.
const AnswerMapFrame = dynamic(() => import("./answer-map"), {
  ssr: false,
  loading: () => <div className="h-[min(360px,55dvh)] w-full rounded-lg border border-zinc-800 bg-zinc-950" />,
});

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
    case "ticket":
      return <ClipboardIcon />;
    case "pull_request":
      return <GitBranchIcon />;
    case "run":
    case "work":
      return <PlayIcon />;
    case "finding":
      return <ShieldAlertIcon />;
    case "record":
      return <LayersIcon />;
    case "app_map":
      return <GraphIcon />;
    default:
      return <LogsIcon />;
  }
}

/** The parts an answer's app map lookups touched: their mini map, and the App map page focused on them. */
export function AnswerMap({ map }: { map: ChatMap }) {
  const flow = (map.flows ?? []).find((f) => typeof f === "string" && f);
  // An answer that cites a journey opens the App map playing it.
  const href = flow ? appMapFlowLink(flow) : appMapLink(map.parts);
  return (
    <section className="mt-4 space-y-2" aria-label="The parts this answer involves" data-testid="answer-map">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-400">
          From the app map: {map.parts.length === 1 ? "1 part" : `${map.parts.length} parts`}
        </p>
        <Link href={href} className={`${linkButton} inline-flex items-center gap-1 text-sm`} data-testid="answer-map-open">
          {flow ? "Open the journey in App map" : "Open in App map"}
          <ExternalLinkIcon />
        </Link>
      </div>
      {map.graph && <AnswerMapFrame graph={map.graph} />}
    </section>
  );
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
  const dated = c.kind === "knowledge" || c.kind === "upload" || isWorkKind(c.kind);
  return [c.base || CITATION_KIND[c.kind] || c.kind, dated ? citationWhen(c.as_of) : ""].filter(Boolean).join(" · ");
}

/** What the link to a source outside CoderHelm says. */
function originalLabel(c: Citation): string {
  if (c.code || c.kind === "pull_request") return "Open on GitHub";
  if (c.kind === "ticket") return "Open the ticket";
  return "Open the original";
}

/** Where a source opens: the file on GitHub at its commit, the synced page, or its page in the dashboard. A run, finding or record opens its page in CoderHelm first. */
function openTarget(doc: SourceDoc): { href: string; external: boolean; label: string } | null {
  const c = doc.parts[0];
  const url = doc.parts.find((p) => p.url)?.url;
  if ((c.kind === "run" || c.kind === "finding" || c.kind === "record") && c.href && c.href.startsWith("/")) {
    return { href: c.href, external: false, label: "Open in CoderHelm" };
  }
  if (url && /^https:\/\//.test(url)) {
    return { href: url, external: true, label: originalLabel(c) };
  }
  if (c.href && c.href.startsWith("/")) return { href: c.href, external: false, label: c.kind === "knowledge" ? "Open in Knowledge" : "Open in CoderHelm" };
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

/** Seconds since `start`, ticking while `on`. `start` comes from the answer, so a remount keeps the count. */
function useElapsed(on: boolean, start?: number): number {
  const [own] = useState(() => Date.now());
  const from = start ?? own;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [on]);
  return Math.max(0, Math.floor((now - from) / 1000));
}

/** The first step, shown the moment a question is sent, before Chat reports its own. */
const FIRST_STEP: ToolStep = { id: "first", label: "Working out where to look", status: "running" };

/** Steps listed while Chat works; earlier ones fold into a count, so the list never pushes the answer far down. */
const LIVE_STEPS = 4;

/** One row for a step said the same way several times in a row ("Looked up runs" twice). */
interface StepRow extends ToolStep {
  times: number;
}

function rowsOf(steps: ToolStep[]): StepRow[] {
  const out: StepRow[] = [];
  for (const s of steps) {
    const last = out[out.length - 1];
    if (last && last.status !== "running" && last.label === s.label && last.status === s.status && last.summary === s.summary) last.times += 1;
    else out.push({ ...s, times: 1 });
  }
  return out;
}

/** What a step's outcome says: its result, or quietly that it couldn't be read. */
function outcomeOf(s: ToolStep): string {
  if (s.status === "running") return "";
  if (s.status === "error") {
    const said = (s.summary ?? "").trim();
    return !said || /^couldn.t read$/i.test(said) ? "couldn't be read" : said.charAt(0).toLowerCase() + said.slice(1);
  }
  return s.summary ?? "";
}

function StepItem({ s }: { s: StepRow }) {
  const failed = s.status === "error";
  const outcome = outcomeOf(s);
  return (
    <li className="flex min-w-0 items-baseline gap-2" data-testid="tool-step" data-status={s.status}>
      <span
        aria-hidden="true"
        className={`relative top-[-1px] h-1.5 w-1.5 shrink-0 rounded-full ${
          failed ? "border border-zinc-600" : s.status === "running" ? "animate-pulse bg-sky-400 motion-reduce:animate-none" : "bg-zinc-600"
        }`}
      />
      <span className="min-w-0 wrap-anywhere">
        <span className={s.status === "running" ? "text-zinc-200" : failed ? "text-zinc-500" : "text-zinc-400"}>{s.label}</span>
        {s.times > 1 ? <span className="tabular-nums text-zinc-600"> ×{s.times}</span> : null}
        {outcome ? <span className="text-zinc-600"> · {outcome}</span> : null}
      </span>
    </li>
  );
}

/**
 * What Chat did, the way the best answer pages show it (ChatGPT's "Thought
 * for 5s", Cursor's "Explored N tools", AI Elements' reasoning block):
 * - while Chat looks things up the steps are open, the running one marked,
 *   with the time so far, and only the latest few listed;
 * - once the answer starts they fold into one line that names the running
 *   step, so the text never moves under the reader;
 * - when done, one quiet line ("Looked up tickets, pull requests and runs")
 *   that opens to the steps grouped by where they looked;
 * - a lookup that failed is a muted row, not a red one: Chat carried on. Only
 *   a source that couldn't be read at all is named on the line.
 */
export function ActivityLine({ steps, streaming, hasText = false, startedAt }: { steps: ToolStep[]; streaming: boolean; hasText?: boolean; startedAt?: number }) {
  // The reader's choice, else open while Chat works and nothing is written yet.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [wrote, setWrote] = useState(hasText);
  const [all, setAll] = useState(false);
  useEffect(() => {
    if (hasText) setWrote(true);
  }, [hasText]);
  useEffect(() => {
    if (!streaming) {
      setChosen(null);
      setAll(false);
    }
  }, [streaming]);
  const open = chosen ?? (streaming && !wrote);
  const elapsed = useElapsed(streaming, startedAt);
  const shown = streaming && steps.length === 0 ? [FIRST_STEP] : steps;
  const running = [...shown].reverse().find((s) => s.status === "running");
  const summary = activitySummary(steps);
  const gone = streaming ? "" : unavailableNote(steps);
  const label = streaming ? (open ? "Working" : running?.label ?? shown[shown.length - 1]?.label ?? FIRST_STEP.label) : summary;
  const rows = rowsOf(shown);
  const hidden = streaming && !all ? Math.max(0, rows.length - LIVE_STEPS) : 0;
  // Done: grouped by where they looked, in the order each source was first used.
  const groups = useMemo(() => {
    if (streaming) return [];
    const by = new Map<string, { label: string; steps: ToolStep[] }>();
    for (const s of steps) {
      const src = stepSource(s.name);
      const g = by.get(src.key) ?? { label: src.label, steps: [] };
      g.steps.push(s);
      by.set(src.key, g);
    }
    return [...by.values()];
  }, [steps, streaming]);
  const grouped = groups.length > 1;
  return (
    <div className="mb-3 min-w-0" data-testid="activity">
      <button
        type="button"
        onClick={() => setChosen(!open)}
        aria-expanded={open}
        data-testid="activity-toggle"
        className={`group inline-flex max-w-full min-w-0 items-center gap-2 rounded-md py-0.5 text-left text-[0.8rem] text-zinc-500 hover:text-zinc-300 ${focusRing}`}
      >
        <span aria-hidden="true" className="shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5">
          {streaming ? <LoaderIcon className="animate-spin motion-reduce:animate-none" /> : <CheckIcon />}
        </span>
        <span className={`min-w-0 truncate ${streaming ? "animate-chat-shimmer" : ""}`} data-testid="activity-summary">
          {label}
        </span>
        {gone && (
          <span className="min-w-0 shrink truncate text-zinc-600" data-testid="activity-unavailable">
            · {gone}
          </span>
        )}
        {streaming && elapsed > 0 && (
          <span className="shrink-0 tabular-nums text-zinc-600" data-testid="activity-elapsed">
            {elapsed}s
          </span>
        )}
        <ChevronDownIcon className={`h-3 w-3 shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="ml-[0.4rem] mt-1.5 border-l border-zinc-800 pl-4 text-[0.8rem] text-zinc-500" data-testid="activity-steps">
          {hidden > 0 && (
            <button type="button" onClick={() => setAll(true)} className={`mb-1 rounded text-zinc-600 hover:text-zinc-300 ${focusRing}`} data-testid="earlier-steps">
              {hidden} earlier {hidden === 1 ? "step" : "steps"}
            </button>
          )}
          {grouped ? (
            <div className="flex flex-col gap-2">
              {groups.map((g) => (
                <div key={g.label} className="min-w-0" data-testid="step-group">
                  <p className="mb-0.5 text-[0.7rem] font-medium uppercase tracking-wide text-zinc-600">{g.label}</p>
                  <ol className="flex flex-col gap-1" aria-label={g.label}>
                    {rowsOf(g.steps).map((s) => (
                      <StepItem key={s.id} s={s} />
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          ) : (
            <ol className="flex flex-col gap-1" aria-label="Steps">
              {rows.slice(hidden).map((s) => (
                <StepItem key={s.id} s={s} />
              ))}
            </ol>
          )}
        </div>
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
  anchor,
  startedAt,
  after,
  map,
}: {
  text: string;
  citations: Citation[];
  grounded: boolean;
  streaming?: boolean;
  /** Its place in the conversation, for keeping the reader's place (components/follow-scroll.tsx). */
  anchor?: string;
  steps?: ToolStep[];
  /** The asker's rating; with `onRate`, the thumbs show. */
  rating?: Rating | null;
  onRate?: (r: Rating | null) => void;
  /** Ask the same question again (the latest answer only). */
  onRetry?: () => void;
  /** When the question was sent (ms), for the time so far. */
  startedAt?: number;
  /** What follows a cut-short answer: that it was stopped, or what broke. */
  after?: ReactNode;
  /** The parts its app map lookups touched, when it used the map. */
  map?: ChatMap | null;
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
    // The live steps (with a first step from the start) say what is happening.
    content = null;
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
    <div className="min-w-0" data-testid="answer" data-scroll-anchor={anchor} ref={box.ref} style={box.style}>
      {/* An answer with no lookups drops the line once it is written; the time so far comes from the answer, so a line that comes back keeps counting. */}
      {((steps && steps.length > 0) || waiting) && <ActivityLine steps={steps ?? []} streaming={!!streaming} hasText={!!text} startedAt={startedAt} />}
      {content}
      {after}
      {!streaming && map && map.parts.length > 0 && <AnswerMap map={map} />}
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
