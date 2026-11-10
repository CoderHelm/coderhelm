"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AgentLog, PassTrace } from "@/lib/api";
import { buildLog, checkLines, checkOutput, filterPass, isProblem, searchHits, stepMatches, type LogFilter, type LogGroup, type LogItem, type LogModel, type LogPass, type LogSection, type LogStep } from "@/lib/agent-log";
import { langFromPath } from "@/lib/highlight";
import { CodeBlock } from "@/components/code-block";
import { FilePath } from "@/components/file-path";
import { Drawer } from "@/components/drawer";
import { Segmented } from "@/components/segmented";
import { Select } from "@/components/select";
import { CopyButton } from "@/components/copy-button";
import { formatDate, formatMs } from "@/components/list";
import { CheckIcon, ChevronRightIcon, CodeIcon, EyeIcon, ExternalLinkIcon, GitBranchIcon, InfoIcon, LockIcon, PenIcon, SearchIcon, WarningIcon, XIcon } from "@/components/icons";
import { buttonClass, focusRing, inputClass } from "@/components/ui";
import { usePhone } from "@/hooks/use-phone";

// The run's agent log in the review session's language: each part of the
// run (Plan, Build, CI fix round 2) is a section with its time and cost; the
// agent's own words head the work under them; each tool call is a sentence
// with its outcome, paired with its result; repeated reads fold into one line
// that still names the files; problems come first and are never folded away.
// The model is lib/agent-log.ts; this file only draws it.

type View = "plain" | "structured" | "raw";

const VIEWS: { value: View; label: string }[] = [
  { value: "plain", label: "Plain" },
  { value: "structured", label: "Structured" },
  { value: "raw", label: "Raw" },
];

/** Rows a pass draws before "Show more"; the rest wait until asked for. */
const ROW_BUDGET = 120;

const clock = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

function tokenWords(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M tokens`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k tokens`;
  return `${n} tokens`;
}

/** URL state: filter, file, search, view, timeline and the linked step all survive a reload or a pasted link. */
function useLogParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, router, pathname],
  );
  const filter = (["changes", "checks", "problems"].includes(params.get("log_filter") ?? "") ? params.get("log_filter") : "all") as LogFilter;
  const view = (["structured", "raw"].includes(params.get("log_view") ?? "") ? params.get("log_view") : "plain") as View;
  return { filter, file: params.get("log_file") ?? "", q: params.get("log_q") ?? "", view, timeline: params.get("log_time") === "1", step: params.get("step") ?? "", set };
}

// ── Icons and words for a step ───────────────────────────────────────

function StepIcon({ step }: { step: LogStep }) {
  const box = "inline-flex h-5 w-4 shrink-0 items-center justify-center scale-90";
  if (step.status === "error" || (step.tool === "run_checks" && step.status === "soft_fail")) return <span aria-hidden="true" className={`${box} text-red-300`}><XIcon /></span>;
  if (step.status === "soft_fail") return <span aria-hidden="true" className={`${box} text-amber-300`}><WarningIcon /></span>;
  if (step.status === "refused") return <span aria-hidden="true" className={`${box} text-amber-300`}><LockIcon /></span>;
  if (step.tool === "run_checks") return <span aria-hidden="true" className={`${box} text-emerald-400`}><CheckIcon /></span>;
  if (step.category === "change") return <span aria-hidden="true" className={`${box} text-sky-300`}><PenIcon /></span>;
  if (step.tool === "github_history") return <span aria-hidden="true" className={`${box} text-zinc-400`}><GitBranchIcon /></span>;
  if (step.tool.startsWith("search") || step.tool === "check_url") return <span aria-hidden="true" className={`${box} text-zinc-400`}><SearchIcon /></span>;
  if (step.category === "read") return <span aria-hidden="true" className={`${box} text-zinc-400`}><EyeIcon /></span>;
  return <span aria-hidden="true" className={`${box} text-zinc-400`}><CodeIcon /></span>;
}

const STATUS_WORD: Record<LogStep["status"], string> = {
  ok: "done",
  soft_fail: "didn't work",
  refused: "not allowed",
  error: "failed",
  unknown: "no result recorded",
};

/** The step as a sentence: verb, target (a path drawn as one), outcome, retry. */
function Sentence({ step, q }: { step: LogStep; q: string }) {
  const tone = step.status === "error" || (step.tool === "run_checks" && step.status === "soft_fail") ? "text-red-200" : isProblem(step) ? "text-amber-100" : "text-zinc-200";
  const lead = step.status === "refused" ? "Not allowed: " : step.status === "soft_fail" && step.category === "change" ? "Didn't apply: " : "";
  return (
    <span className={`min-w-0 text-sm leading-5 ${tone}`}>
      {lead && <span className="font-medium">{lead}</span>}
      <Mark text={step.verb} q={q} />{" "}
      {step.targetIsPath ? <PathTarget target={step.target} /> : <span className="[overflow-wrap:anywhere]"><Mark text={step.target} q={q} /></span>}
      {step.attempt && step.attempt > 1 && <span className="ml-1.5 whitespace-nowrap rounded-full border border-zinc-700 px-1.5 text-xs text-zinc-300">{step.attempt === 2 ? "2nd try" : step.attempt === 3 ? "3rd try" : `${step.attempt}th try`}</span>}
      {step.summary && (
        <span className={isProblem(step) ? "text-zinc-300" : "text-zinc-400"}>
          {" · "}
          <Mark text={step.summary} q={q} />
        </span>
      )}
      <span className="sr-only"> ({STATUS_WORD[step.status]})</span>
    </span>
  );
}

/** "src/lib/schedule.ts lines 1–80": the path as a path, the range as words. */
function PathTarget({ target }: { target: string }) {
  const m = target.match(/^(.*?)( lines \d+–\d+| from .+)?$/);
  return (
    <>
      <FilePath path={m?.[1] ?? target} className="text-sm" />
      {m?.[2] && <span className="text-zinc-400">{m[2]}</span>}
    </>
  );
}

/** Text with the search term marked. */
function Mark({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-amber-400/30 text-inherit">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

// ── Step details: plain, structured, raw ─────────────────────────────

const SHOW_CHARS = 20_000;

/** Long text cut for the first look, with the rest one click away; never cut silently. */
function LongText({ text, lang, filename, wrap = false, diff = false }: { text: string; lang?: string; filename?: string; wrap?: boolean; diff?: boolean }) {
  const [all, setAll] = useState(false);
  const cut = !all && text.length > SHOW_CHARS;
  return (
    <div className="min-w-0 space-y-1">
      <CodeBlock code={cut ? text.slice(0, SHOW_CHARS) : text} lang={lang} filename={filename} wrap={wrap} diff={diff} maxHeightClass="max-h-96" />
      {cut && (
        <button type="button" onClick={() => setAll(true)} className={buttonClass("ghost", "sm")}>
          Show all {Math.round(text.length / 1024)} KB
        </button>
      )}
    </div>
  );
}

function valueWords(v: unknown): string {
  if (v === null || v === undefined) return "none";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.every((x) => typeof x === "string" || typeof x === "number") ? v.join(", ") : `${v.length} items`;
  return `${Object.keys(v as object).length} fields`;
}

/** Fields as a list of words: never JSON in the plain view. */
function Fields({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value);
  if (!entries.length) return null;
  return (
    <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-zinc-400">{k.replace(/_/g, " ")}</dt>
          <dd className="min-w-0 whitespace-pre-wrap text-zinc-200 [overflow-wrap:anywhere]">{valueWords(v).slice(0, 600)}</dd>
        </div>
      ))}
    </dl>
  );
}

function PlainDetail({ step }: { step: LogStep }) {
  const text = step.result ?? "";
  const path = step.files[0];
  if (isProblem(step) && step.tool !== "run_checks") {
    return (
      <div className="space-y-2">
        <p className="whitespace-pre-wrap text-sm text-zinc-300 [overflow-wrap:anywhere]">{text || "No message was recorded."}</p>
        {step.tool === "edit_file" && <EditDiff step={step} />}
      </div>
    );
  }
  switch (step.tool) {
    case "read_file":
    case "read_file_lines":
      return text ? <LongText text={text} lang={langFromPath(path)} filename={path} /> : <NoResult />;
    case "search_code": {
      const hits = searchHits(text);
      if (!hits.length) return <p className="text-sm text-zinc-400">No matches.</p>;
      return (
        <ul className="space-y-2">
          {hits.slice(0, 20).map((h) => (
            <li key={h.path} className="min-w-0">
              <FilePath path={h.path} />
              {h.lines.length > 0 && <CodeBlock code={h.lines.map((l) => l.trim()).join("\n")} lang={langFromPath(h.path)} className="mt-1" />}
            </li>
          ))}
          {hits.length > 20 && <li className="text-xs text-zinc-400">And {hits.length - 20} more files. The structured view has them all.</li>}
        </ul>
      );
    }
    case "edit_file":
      return <EditDiff step={step} />;
    case "write_file":
      return <LongText text={String(step.input.content ?? "")} lang={langFromPath(path)} filename={path} />;
    case "run_checks": {
      const lines = checkLines(text);
      const out = checkOutput(text);
      return (
        <div className="space-y-2">
          {lines.length > 0 ? (
            <ul className="space-y-0.5 text-sm" aria-label="Checks">
              {lines.map((l) => (
                <li key={l.label} className="flex items-center gap-2">
                  <span aria-hidden="true" className={`inline-flex scale-90 ${l.passed ? "text-emerald-400" : l.passed === false ? "text-red-300" : "text-zinc-400"}`}>{l.passed ? <CheckIcon /> : l.passed === false ? <XIcon /> : <InfoIcon />}</span>
                  <span className="text-zinc-200">{l.label}</span>
                  <span className="text-xs text-zinc-400">{l.passed ? "passed" : l.passed === false ? `failed${l.detail ? ` ${l.detail}` : ""}` : "no result"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="whitespace-pre-wrap text-sm text-zinc-300 [overflow-wrap:anywhere]">{text || "No result was recorded."}</p>
          )}
          {out && <LongText text={out} wrap />}
        </div>
      );
    }
    case "get_diff":
      return text ? <LongText text={text} lang="diff" /> : <NoResult />;
    default:
      return (
        <div className="space-y-2">
          <Fields value={step.input} />
          {step.resultValue && typeof step.resultValue === "object" && !Array.isArray(step.resultValue) ? (
            <Fields value={step.resultValue as Record<string, unknown>} />
          ) : text ? (
            <LongText text={text} wrap />
          ) : (
            <NoResult />
          )}
        </div>
      );
  }
}

const NoResult = () => <p className="text-sm text-zinc-400">No result was recorded for this step.</p>;

/** An edit's changes as a small diff, from its own input. */
function EditDiff({ step }: { step: LogStep }) {
  const edits = Array.isArray(step.input.edits) ? (step.input.edits as { old_text?: string; new_text?: string }[]) : [];
  if (!edits.length) return null;
  const path = step.files[0];
  const code = edits
    .map((e) => [...String(e.old_text ?? "").split("\n").filter((l, i, a) => l || a.length > 1).map((l) => `-${l}`), ...String(e.new_text ?? "").split("\n").filter((l, i, a) => l || a.length > 1).map((l) => `+${l}`)].join("\n"))
    .join("\n");
  return <CodeBlock code={code} lang={langFromPath(path)} diff filename={path} maxHeightClass="max-h-96" />;
}

function StructuredDetail({ step }: { step: LogStep }) {
  return (
    <div className="space-y-3">
      <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        <dt className="text-zinc-400">Tool</dt>
        <dd className="min-w-0 text-zinc-200 [overflow-wrap:anywhere]">{step.tool}</dd>
        <dt className="text-zinc-400">Outcome</dt>
        <dd className="text-zinc-200">
          {STATUS_WORD[step.status]}
          {step.summary ? `: ${step.summary}` : ""}
        </dd>
        {step.startedAt && (
          <>
            <dt className="text-zinc-400">Started</dt>
            <dd className="text-zinc-200">{formatDate(step.startedAt, { time: true })}</dd>
          </>
        )}
        {step.durationMs !== undefined && (
          <>
            <dt className="text-zinc-400">Took</dt>
            <dd className="text-zinc-200">{formatMs(step.durationMs)}</dd>
          </>
        )}
        <dt className="text-zinc-400">Step id</dt>
        <dd className="min-w-0 text-zinc-200 [overflow-wrap:anywhere]">{step.id}</dd>
      </dl>
      {Object.keys(step.input).length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-300">Input</p>
          <Fields value={step.input} />
        </div>
      )}
      <div className="space-y-1">
        <p className="text-xs font-medium text-zinc-300">Result{step.truncated ? " (cut at 100 KB when it was stored)" : ""}</p>
        {step.result !== null ? <LongText text={step.result} wrap /> : <NoResult />}
      </div>
    </div>
  );
}

function RawDetail({ step }: { step: LogStep }) {
  return <LongText text={JSON.stringify(step.raw, null, 2)} lang="json" />;
}

function StepDetail({ step, view, diffUrl }: { step: LogStep; view: View; diffUrl?: string }) {
  return (
    <div className="min-w-0 space-y-2" data-testid="log-step-detail">
      {view === "plain" ? <PlainDetail step={step} /> : view === "structured" ? <StructuredDetail step={step} /> : <RawDetail step={step} />}
      <StepLinks step={step} diffUrl={diffUrl} />
    </div>
  );
}

function stepUrl(id: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", "details");
  url.searchParams.set("step", id);
  return url.toString();
}

function StepLinks({ step, diffUrl }: { step: LogStep; diffUrl?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <CopyButton text={() => stepUrl(step.id)} label="Copy link to this step" variant="link" className="text-xs" />
      {diffUrl && step.category === "change" && step.status === "ok" && (
        <a href={diffUrl} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 rounded text-xs text-sky-300 hover:text-sky-200 ${focusRing}`}>
          View in diff
          <span aria-hidden="true" className="inline-flex scale-75"><ExternalLinkIcon /></span>
          <span className="sr-only"> (the pull request&apos;s files, opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}

// ── Rows ─────────────────────────────────────────────────────────────

interface RowCtx {
  view: View;
  q: string;
  phone: boolean;
  timeline: boolean;
  span: { start: number; end: number } | null;
  diffUrl?: string;
  open: Set<string>;
  toggle: (id: string, on?: boolean) => void;
  focus: string;
  openSheet: (step: LogStep, from: HTMLElement) => void;
}

/** Where a step sits in its pass's span, as a bar. */
function Bar({ step, span }: { step: LogStep; span: { start: number; end: number } }) {
  const s = step.startedAt ? Date.parse(step.startedAt) : NaN;
  if (Number.isNaN(s) || step.durationMs === undefined) return <span className="hidden w-32 shrink-0 sm:block" aria-hidden="true" />;
  const total = Math.max(1, span.end - span.start);
  const left = ((s - span.start) / total) * 100;
  const width = Math.max(0.8, (step.durationMs / total) * 100);
  return (
    <span className="relative hidden h-2 w-32 shrink-0 self-center overflow-hidden rounded-sm bg-zinc-800/70 sm:block" aria-hidden="true" title={`${clock(step.startedAt)} · ${formatMs(step.durationMs)}`}>
      <span className={`absolute inset-y-0 rounded-sm ${isProblem(step) ? "bg-amber-400/80" : step.category === "check" ? "bg-emerald-400/70" : "bg-sky-400/60"}`} style={{ left: `${Math.min(99, left)}%`, width: `${Math.min(100 - Math.min(99, left), width)}%` }} />
    </span>
  );
}

function Duration({ step, phone }: { step: LogStep; phone: boolean }) {
  if (step.durationMs === undefined || step.durationMs < 1000) return null;
  const long = step.durationMs >= 10_000;
  if (phone && !long) return null;
  return (
    <span className={`shrink-0 whitespace-nowrap text-xs tabular-nums ${long ? "text-zinc-200" : "text-zinc-400"}`} title={step.startedAt ? `Started ${formatDate(step.startedAt, { time: true })}` : undefined}>
      {formatMs(step.durationMs)}
    </span>
  );
}

function StepRow({ step, ctx, nested = false }: { step: LogStep; ctx: RowCtx; nested?: boolean }) {
  const open = ctx.open.has(step.id);
  const focused = ctx.focus === step.id;
  const btn = useRef<HTMLButtonElement | null>(null);
  return (
    <li
      id={`step-${step.id}`}
      data-testid="log-step"
      data-status={step.status}
      data-tool={step.tool}
      className={`min-w-0 scroll-mt-24 rounded-md ${nested ? "" : "-mx-2 px-2"} ${focused ? "bg-sky-500/10 ring-1 ring-sky-500/40" : ""}`}
    >
      <div className="flex min-w-0 items-start gap-2 py-0.5">
        <button
          ref={btn}
          type="button"
          aria-expanded={ctx.phone ? undefined : open}
          aria-haspopup={ctx.phone ? "dialog" : undefined}
          onClick={(e) => (ctx.phone ? ctx.openSheet(step, e.currentTarget) : ctx.toggle(step.id))}
          className={`flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded text-left hover:bg-zinc-800/40 ${focusRing}`}
        >
          <StepIcon step={step} />
          <Sentence step={step} q={ctx.q} />
        </button>
        {ctx.timeline && ctx.span ? <Bar step={step} span={ctx.span} /> : null}
        <Duration step={step} phone={ctx.phone} />
      </div>
      {open && !ctx.phone && (
        <div className="mb-2 ml-6 mt-1 min-w-0 rounded-md border border-zinc-800 bg-zinc-950/40 p-3">
          <StepDetail step={step} view={ctx.view} diffUrl={ctx.diffUrl} />
        </div>
      )}
    </li>
  );
}

function GroupRow({ group, ctx }: { group: LogGroup; ctx: RowCtx }) {
  const open = ctx.open.has(group.id);
  const total = group.steps.reduce((n, s) => n + (s.durationMs ?? 0), 0);
  return (
    <li className="-mx-2 min-w-0 px-2" data-testid="log-group">
      <div className="flex min-w-0 items-start gap-2 py-0.5">
        <button type="button" aria-expanded={open} onClick={() => ctx.toggle(group.id)} className={`flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded text-left hover:bg-zinc-800/40 ${focusRing}`}>
          <span aria-hidden="true" className={`inline-flex h-5 w-4 shrink-0 items-center justify-center text-zinc-400 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}>
            <ChevronRightIcon />
          </span>
          <span className="min-w-0 text-sm leading-5 text-zinc-200">
            {group.title}
            <span className="text-zinc-400 [overflow-wrap:anywhere]"> · {group.names}</span>
          </span>
        </button>
        {/* Calls in one group ran one after another, so their times add up. */}
        {total >= 1000 && !ctx.phone && <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-zinc-400">{formatMs(total)} in all</span>}
      </div>
      {open && (
        <ul className="mb-1 ml-2 border-l border-zinc-800 pl-4" aria-label={group.title}>
          {group.steps.map((s) => (
            <StepRow key={s.id} step={s} ctx={ctx} nested />
          ))}
        </ul>
      )}
    </li>
  );
}

function NoteRow({ text, raw, at }: { text: string; raw: string; at?: string }) {
  return (
    <li className="flex min-w-0 items-start gap-2 py-0.5 text-xs leading-5 text-zinc-400" data-testid="log-note" title={raw}>
      <span aria-hidden="true" className="inline-flex h-5 w-4 shrink-0 scale-75 items-center justify-center"><InfoIcon /></span>
      <span className="min-w-0 italic [overflow-wrap:anywhere]">{text}</span>
      {at && <span className="ml-auto shrink-0 whitespace-nowrap">{clock(at)}</span>}
    </li>
  );
}

function Prose({ text }: { text: string }) {
  const [more, setMore] = useState(false);
  const long = text.length > 220 || text.split("\n").length > 2;
  return (
    <div className="min-w-0">
      <p className={`whitespace-pre-wrap text-sm leading-6 text-zinc-300 [overflow-wrap:anywhere] ${long && !more ? "line-clamp-2" : ""}`}>{text}</p>
      {long && (
        <button type="button" onClick={() => setMore((m) => !m)} className={`rounded text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-200 ${focusRing}`}>
          {more ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}

function Thinking({ parts }: { parts: string[] }) {
  return (
    <details className="group/think">
      <summary className={`flex w-fit cursor-pointer list-none items-center gap-1 rounded text-xs text-zinc-400 hover:text-zinc-200 [&::-webkit-details-marker]:hidden ${focusRing}`}>
        <span aria-hidden="true" className="inline-flex scale-75 transition-transform group-open/think:rotate-90 motion-reduce:transition-none"><ChevronRightIcon /></span>
        Thought it through
      </summary>
      <div className="mt-1 space-y-2 border-l border-zinc-800 pl-3 text-xs leading-5 text-zinc-400">
        {parts.map((p, i) => (
          <p key={i} className="whitespace-pre-wrap [overflow-wrap:anywhere]">{p}</p>
        ))}
      </div>
    </details>
  );
}

function SectionView({ section, ctx, limit, long }: { section: LogSection; ctx: RowCtx; limit: number; long: boolean }) {
  const items = section.items.slice(0, limit);
  return (
    <section
      id={section.id}
      aria-label={section.heading ?? undefined}
      className="min-w-0 scroll-mt-24 space-y-1"
      // In a long part, sections off screen skip layout and paint until scrolled to; find-in-page still reaches them.
      data-lazy={long ? "" : undefined}
      style={long ? { contentVisibility: "auto", containIntrinsicSize: "auto 160px" } : undefined}
    >
      {section.divider && (
        <div className="flex items-center gap-3 pt-2 text-xs font-medium text-zinc-400" role="separator" aria-label={section.divider}>
          <span className="h-px flex-1 bg-zinc-800" />
          {section.divider}
          <span className="h-px flex-1 bg-zinc-800" />
        </div>
      )}
      {section.heading && <h4 className="pt-2 text-sm font-semibold text-zinc-100 [overflow-wrap:anywhere]"><Mark text={section.heading} q={ctx.q} /></h4>}
      {section.prose && <Prose text={section.prose} />}
      {section.thinking.length > 0 && <Thinking parts={section.thinking} />}
      {items.length > 0 && (
        <ul className="min-w-0 pl-1">
          {items.map((it: LogItem) =>
            it.kind === "step" ? <StepRow key={it.step.id} step={it.step} ctx={ctx} /> : it.kind === "group" ? <GroupRow key={it.id} group={it} ctx={ctx} /> : <NoteRow key={it.id} text={it.text} raw={it.raw} at={it.at} />,
          )}
        </ul>
      )}
    </section>
  );
}

// ── A pass ───────────────────────────────────────────────────────────

function passSpan(p: LogPass): { start: number; end: number } | null {
  let start = Infinity;
  let end = -Infinity;
  for (const s of p.steps) {
    if (!s.startedAt || s.durationMs === undefined) continue;
    const t = Date.parse(s.startedAt);
    if (Number.isNaN(t)) continue;
    start = Math.min(start, t);
    end = Math.max(end, t + s.durationMs);
  }
  const ps = p.startedAt ? Date.parse(p.startedAt) : NaN;
  if (!Number.isNaN(ps)) start = Math.min(start, ps);
  const pe = p.endedAt ? Date.parse(p.endedAt) : NaN;
  if (!Number.isNaN(pe)) end = Math.max(end, pe);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

function PassView({ pass, shown, open, onToggle, ctx, onProblem, limit, onMore, filtered }: {
  pass: LogPass;
  shown: LogPass;
  open: boolean;
  onToggle: () => void;
  ctx: RowCtx;
  onProblem: () => void;
  limit: number;
  onMore: () => void;
  filtered: boolean;
}) {
  const span = useMemo(() => passSpan(pass), [pass]);
  const headingId = `pass-${pass.id}`;
  const meta = [
    pass.startedAt ? clock(pass.startedAt) : "",
    pass.live ? "running" : pass.durationMs ? `took ${formatMs(pass.durationMs)}` : "",
    pass.costUsd !== undefined ? `$${pass.costUsd.toFixed(2)}` : "",
    pass.tokens.total ? tokenWords(pass.tokens.total) : "",
  ].filter(Boolean);
  // Draw sections until the row budget is spent.
  let budget = limit;
  const sections: { s: LogSection; n: number }[] = [];
  let hidden = 0;
  for (const s of shown.sections) {
    if (budget <= 0) {
      hidden += s.items.reduce((n, it) => n + (it.kind === "group" ? it.steps.length : 1), 0);
      continue;
    }
    sections.push({ s, n: budget });
    budget -= Math.max(1, s.items.length);
  }
  const problems = pass.problems.map((id) => pass.steps.find((s) => s.id === id)!).filter(Boolean);
  const ctxHere = { ...ctx, span };
  return (
    <section className="min-w-0 border-t border-zinc-800 first:border-t-0" aria-labelledby={headingId} data-testid="log-pass" data-pass={pass.pass}>
      <div className="flex min-w-0 items-start gap-3 px-4 py-3">
        <h3 id={headingId} className="min-w-0 flex-1">
          <button type="button" aria-expanded={open} onClick={onToggle} className={`flex w-full min-w-0 items-start gap-2 rounded text-left ${focusRing}`}>
            <span aria-hidden="true" className={`inline-flex h-5 shrink-0 items-center text-zinc-400 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}><ChevronRightIcon /></span>
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="text-sm font-semibold text-zinc-100">{pass.label}</span>
              {pass.live && <span aria-hidden="true" className="h-2 w-2 shrink-0 animate-pulse self-center rounded-full bg-sky-400 motion-reduce:animate-none" />}
              <span className="whitespace-nowrap text-xs text-zinc-400">{plural(pass.steps.length, "step")}</span>
              {meta.length > 0 && <span className="text-xs tabular-nums text-zinc-400" data-testid="log-pass-meta">{meta.join(" · ")}</span>}
            </span>
          </button>
        </h3>
        {problems.length > 0 && (
          <button type="button" onClick={onProblem} className={`shrink-0 whitespace-nowrap rounded-full border border-amber-500/40 px-2 text-xs leading-5 text-amber-200 hover:bg-amber-500/10 ${focusRing}`} title="Go to the next problem">
            {plural(problems.length, "problem")}
          </button>
        )}
      </div>
      {open && (
        <div className="min-w-0 space-y-3 px-4 pb-4">
          {problems.length > 0 && !filtered && (
            <div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2" data-testid="log-problems">
              <p className="text-xs font-medium text-amber-200">{problems.length === 1 ? "1 thing didn't work" : `${problems.length} things didn't work`}</p>
              <ul className="mt-1 space-y-0.5">
                {problems.map((s) => (
                  <li key={s.id} className="flex min-w-0 items-start gap-2">
                    <StepIcon step={s} />
                    <a href={`#step-${s.id}`} onClick={(e) => { e.preventDefault(); ctx.toggle(s.id, true); document.getElementById(`step-${s.id}`)?.scrollIntoView({ block: "center" }); }} className={`min-w-0 rounded text-sm text-zinc-200 underline-offset-2 hover:underline [overflow-wrap:anywhere] ${focusRing}`}>
                      {s.status === "refused" ? "Not allowed: " : ""}
                      {s.verb} {s.target}
                      {s.summary ? <span className="text-zinc-400"> · {s.summary}</span> : null}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {sections.length === 0 && <p className="text-sm text-zinc-400">{filtered ? "Nothing here matches." : "No steps were recorded."}</p>}
          {sections.map(({ s, n }) => (
            <SectionView key={s.id} section={s} ctx={ctxHere} limit={n} long={pass.steps.length > ROW_BUDGET} />
          ))}
          {hidden > 0 && (
            <button type="button" onClick={onMore} className={buttonClass("secondary", "sm")}>
              Show {plural(hidden, "more step")}
            </button>
          )}
          {!filtered && pass.final && (
            <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm" data-testid="log-final">
              <p className="whitespace-pre-wrap text-zinc-200 [overflow-wrap:anywhere]">
                <span className="font-medium text-zinc-100">Finished: </span>
                {pass.final.text.split(/\n\s*\n/)[0] || "No closing words."}
              </p>
              {pass.final.cutOff && <p className="mt-1 text-xs text-amber-200">The answer was cut off at the length limit.</p>}
            </div>
          )}
          {!filtered && pass.endNote && <p className="text-xs text-amber-200">{pass.endNote}</p>}
        </div>
      )}
    </section>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ── The panel ────────────────────────────────────────────────────────

/** Where the step lives: its pass, and the group that folds it. */
function locate(model: LogModel, id: string): { pass: LogPass; group?: string } | null {
  for (const p of model.passes) {
    for (const s of p.sections) {
      for (const it of s.items) {
        if (it.kind === "step" && it.step.id === id) return { pass: p };
        if (it.kind === "group" && it.steps.some((x) => x.id === id)) return { pass: p, group: it.id };
      }
    }
  }
  return null;
}

export function AgentLogPanel({ log, traces, runId, diffUrl, live }: { log: AgentLog; traces: PassTrace[]; runId: string; diffUrl?: string; live: boolean }) {
  const model = useMemo(() => buildLog(log, traces), [log, traces]);
  const { filter, file, q, view, timeline, step: linked, set } = useLogParams();
  const phone = usePhone();
  const [draft, setDraft] = useState(q);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [passOpen, setPassOpen] = useState<Record<string, boolean>>({});
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [focus, setFocus] = useState("");
  const [hit, setHit] = useState(0);
  const [sheet, setSheet] = useState<LogStep | null>(null);
  const sheetFrom = useRef<HTMLElement | null>(null);
  const search = useRef<HTMLInputElement | null>(null);
  const filtered = filter !== "all" || !!file || !!q;

  useEffect(() => setDraft(q), [q]);
  // Type to search; the URL follows a moment later.
  useEffect(() => {
    if (draft === q) return;
    const t = setTimeout(() => set({ log_q: draft || null }), 250);
    return () => clearTimeout(t);
  }, [draft, q, set]);

  // "/" focuses the search, as in most log viewers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = useCallback((id: string, on?: boolean) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (on ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Problems open by default, so the reason is on screen without a click.
  const seeded = useRef(new Set<string>());
  useEffect(() => {
    const fresh = model.passes.flatMap((p) => p.problems).filter((id) => !seeded.current.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => seeded.current.add(id));
    setOpen((prev) => new Set([...prev, ...fresh]));
  }, [model]);

  const last = model.passes[model.passes.length - 1];
  const isPassOpen = (p: LogPass) => passOpen[p.id] ?? (filtered || p === last || p.live || p.steps.some((s) => s.status === "error"));

  /** Opens everything on the way to a step and scrolls to it. */
  const reveal = useCallback(
    (id: string) => {
      const where = locate(model, id);
      if (!where) return false;
      setPassOpen((m) => ({ ...m, [where.pass.id]: true }));
      setLimits((m) => ({ ...m, [where.pass.id]: Infinity }));
      if (where.group) toggle(where.group, true);
      setFocus(id);
      requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`step-${id}`)?.scrollIntoView({ block: "center" })));
      return true;
    },
    [model, toggle],
  );

  // A pasted step link opens that step.
  const linkedDone = useRef("");
  useEffect(() => {
    if (!linked || linkedDone.current === linked) return;
    if (reveal(linked)) {
      linkedDone.current = linked;
      toggle(linked, true);
    }
  }, [linked, reveal, toggle]);

  const shown = useMemo(() => model.passes.map((p) => ({ pass: p, view: filterPass(p, filter, file, q) })), [model, filter, file, q]);
  const matches = useMemo(() => model.passes.flatMap((p) => p.steps).filter((s) => stepMatches(s, filter, file, q)), [model, filter, file, q]);
  useEffect(() => setHit(0), [q, filter, file]);

  const goTo = (i: number) => {
    if (!matches.length) return;
    const k = (i + matches.length) % matches.length;
    setHit(k);
    reveal(matches[k].id);
  };

  const nextProblem = (p: LogPass) => {
    const ids = p.problems;
    const at = ids.indexOf(focus);
    const id = ids[(at + 1) % ids.length];
    toggle(id, true);
    reveal(id);
  };

  // Live: say how many steps arrived while the reader is elsewhere; never yank the scroll.
  const end = useRef<HTMLDivElement | null>(null);
  const [atEnd, setAtEnd] = useState(true);
  const seen = useRef(model.stepCount);
  const [fresh, setFresh] = useState(0);
  useEffect(() => {
    const el = end.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setAtEnd(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (model.stepCount > seen.current && !atEnd) setFresh((n) => n + model.stepCount - seen.current);
    seen.current = model.stepCount;
  }, [model.stepCount, atEnd]);
  useEffect(() => {
    if (atEnd) setFresh(0);
  }, [atEnd]);

  const download = () => {
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `agent-log-${runId}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const ctx: RowCtx = {
    view,
    q,
    phone,
    timeline: timeline && !phone,
    span: null,
    diffUrl,
    open,
    toggle,
    focus,
    openSheet: (s, from) => {
      sheetFrom.current = from;
      setSheet(s);
    },
  };

  const chips: { value: LogFilter; label: string; n?: number }[] = [
    { value: "all", label: "All", n: model.stepCount },
    { value: "changes", label: "Changes", n: model.counts.changes },
    { value: "checks", label: "Checks", n: model.counts.checks },
    { value: "problems", label: "Problems", n: model.counts.problems },
  ];

  if (model.passes.length === 0) {
    return <p className="p-4 text-sm text-zinc-400">No agent log yet. It starts once Coderhelm runs its first tool.</p>;
  }

  return (
    <div className="min-w-0" data-testid="agent-log-panel">
      <div className="space-y-2 border-b border-zinc-800 bg-zinc-900/60 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div role="group" aria-label="Show steps" className="-mx-1 flex min-w-0 max-w-full gap-1 overflow-x-auto px-1 sm:flex-wrap">
            {chips.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-pressed={filter === c.value}
                onClick={() => set({ log_filter: c.value === "all" ? null : c.value })}
                className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors motion-reduce:transition-none ${focusRing} ${
                  filter === c.value ? "border-zinc-200 bg-zinc-100 text-zinc-900" : c.value === "problems" && (c.n ?? 0) > 0 ? "border-amber-500/40 text-amber-200 hover:bg-amber-500/10" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {c.label}
                <span className="tabular-nums opacity-80">{c.n}</span>
              </button>
            ))}
          </div>
          {model.files.length > 0 && (
            <Select
              aria-label="Steps that touched a file"
              size="sm"
              value={file || "any"}
              onChange={(v) => set({ log_file: v === "any" ? null : v })}
              options={[{ value: "any", label: "Any file" }, ...model.files.map((f) => ({ value: f, label: f.split("/").pop() ?? f, description: f }))]}
              className="max-w-[16rem]"
            />
          )}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <span aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 inline-flex -translate-y-1/2 scale-90 text-zinc-400"><SearchIcon /></span>
            <input
              ref={search}
              type="search"
              aria-label="Search the agent log"
              placeholder="Search the log"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (draft !== q) set({ log_q: draft || null });
                  else goTo(e.shiftKey ? hit - 1 : hit + 1);
                }
                if (e.key === "Escape" && draft) setDraft("");
              }}
              className={`${inputClass} min-h-8 py-1 pl-8`}
            />
          </div>
          {q && (
            <div className="flex items-center gap-1 text-xs text-zinc-400">
              <span aria-live="polite" className="whitespace-nowrap tabular-nums" data-testid="log-search-count">
                {matches.length ? `${hit + 1} of ${matches.length}` : "No matches"}
              </span>
              <button type="button" onClick={() => goTo(hit - 1)} disabled={!matches.length} className={buttonClass("ghost", "sm")} aria-label="Previous match">
                <span aria-hidden="true" className="inline-flex rotate-180"><ChevronRightIcon /></span>
              </button>
              <button type="button" onClick={() => goTo(hit + 1)} disabled={!matches.length} className={buttonClass("ghost", "sm")} aria-label="Next match">
                <span aria-hidden="true" className="inline-flex"><ChevronRightIcon /></span>
              </button>
            </div>
          )}
          <Segmented label="How much detail" options={VIEWS} value={view} onChange={(v) => set({ log_view: v === "plain" ? null : v })} />
          {!phone && (
            <button type="button" aria-pressed={timeline} onClick={() => set({ log_time: timeline ? null : "1" })} className={buttonClass(timeline ? "primary" : "secondary", "sm")}>
              Timeline
            </button>
          )}
          <button type="button" onClick={download} className={buttonClass("ghost", "sm")}>
            Download JSON
          </button>
        </div>
        {filtered && (
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-zinc-400" data-testid="log-filter-count">
            {matches.length} of {plural(model.stepCount, "step")}
            <button type="button" onClick={() => { setDraft(""); set({ log_filter: null, log_file: null, log_q: null }); }} className={`rounded text-zinc-300 underline underline-offset-2 hover:text-zinc-100 ${focusRing}`}>
              Clear
            </button>
          </p>
        )}
        {model.truncated && <p className="text-xs text-amber-200">This run reported more live steps than the page could read. The stored log below has every step of each finished part.</p>}
      </div>
      <div>
        {shown.map(({ pass, view: v }) =>
          filtered && v.sections.length === 0 ? null : (
            <PassView
              key={pass.id}
              pass={pass}
              shown={v}
              open={isPassOpen(pass)}
              onToggle={() => setPassOpen((m) => ({ ...m, [pass.id]: !isPassOpen(pass) }))}
              ctx={ctx}
              onProblem={() => nextProblem(pass)}
              limit={limits[pass.id] ?? ROW_BUDGET}
              onMore={() => setLimits((m) => ({ ...m, [pass.id]: Infinity }))}
              filtered={filtered}
            />
          ),
        )}
        {filtered && matches.length === 0 && <p className="px-4 py-6 text-sm text-zinc-400">No step matches. Clear the filters to see every step.</p>}
      </div>
      <div ref={end} aria-hidden="true" />
      {live && fresh > 0 && (
        <div className="pointer-events-none sticky bottom-4 flex justify-center">
          <button type="button" onClick={() => end.current?.scrollIntoView({ block: "end" })} className={`pointer-events-auto ${buttonClass("primary", "sm")} shadow-lg`}>
            {plural(fresh, "new step")}
          </button>
        </div>
      )}
      <Drawer
        open={!!sheet}
        onOpenChange={(o) => !o && setSheet(null)}
        title={sheet ? `${sheet.status === "refused" ? "Not allowed: " : ""}${sheet.verb} ${sheet.target}` : ""}
        description={sheet ? [sheet.summary, sheet.durationMs !== undefined && sheet.durationMs >= 1000 ? formatMs(sheet.durationMs) : ""].filter(Boolean).join(" · ") || undefined : undefined}
        returnFocusTo={sheetFrom}
        testId="log-step-sheet"
      >
        {sheet && <StepDetail step={sheet} view={view} diffUrl={diffUrl} />}
      </Drawer>
    </div>
  );
}

/** The Overview's three lines about the build, with a link into the log. */
export function BuildDigest({ log, traces, href, live }: { log: AgentLog; traces: PassTrace[]; href: (anchor: string | null) => string; live: boolean }): ReactNode {
  const model = useMemo(() => buildLog(log, traces), [log, traces]);
  const d = model.digest;
  const lines = [d.headings.length ? d.headings.join(" · ") : null, d.changed, d.checks].filter(Boolean) as string[];
  if (!lines.length && !(live && d.now)) return null;
  return (
    <div className="min-w-0 space-y-0.5 border-l border-zinc-800 pl-4 text-xs leading-5 text-zinc-400" data-testid="build-digest">
      {live && d.now && (
        <p className="text-zinc-200 [overflow-wrap:anywhere]">
          <span className="text-zinc-400">Now: </span>
          {d.now}
        </p>
      )}
      {lines.map((l) => (
        <p key={l} className="[overflow-wrap:anywhere]">{l}</p>
      ))}
      <a href={href(d.anchor)} className={`inline-flex items-center gap-0.5 rounded text-sky-300 hover:text-sky-200 ${focusRing}`}>
        Open the agent log
        <span aria-hidden="true" className="inline-flex scale-75"><ChevronRightIcon /></span>
      </a>
    </div>
  );
}
