"use client";

import type { ReactNode } from "react";
import type { RunCheck, RunChecks } from "@/lib/api";
import { formatDate, formatDuration, Time } from "@/components/list";
import { CheckIcon, ChevronRightIcon, ExternalLinkIcon, XIcon } from "@/components/icons";
import { focusRing } from "@/components/ui";
import { FilePath } from "@/components/file-path";
import { checkGroup, checksHeadline, checksSentence, sortedChecks, spanSeconds, type StepState, type TimelineStep } from "@/lib/run-timeline";

// The run page's timeline in the review session's visual language: one
// line per step in plain words with how long it took, its notes folded
// behind a count, the running step pulsing, the step that needs a person or
// failed open by default. Colour sits only on the small mark at the start of
// a row, always beside a word.

const STATE_WORD: Record<StepState, string> = {
  done: "done",
  running: "running now",
  waiting: "waiting",
  needs_you: "needs you",
  failed: "failed",
  stopped: "stopped",
};

/** "14:05": a note's time of day; the full date is the hover text. */
function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Mark({ state }: { state: StepState }) {
  const box = "inline-flex h-5 w-4 shrink-0 items-center justify-center";
  if (state === "running") return <span aria-hidden="true" className={box}><span className="h-2 w-2 animate-pulse rounded-full bg-sky-400 motion-reduce:animate-none" /></span>;
  if (state === "waiting") return <span aria-hidden="true" className={box}><span className="h-2 w-2 rounded-full bg-amber-400" /></span>;
  if (state === "needs_you") return <span aria-hidden="true" className={box}><span className="h-2.5 w-2.5 rounded-full border-2 border-amber-400" /></span>;
  if (state === "failed") return <span aria-hidden="true" className={`${box} text-red-300`}><XIcon /></span>;
  if (state === "stopped") return <span aria-hidden="true" className={box}><span className="h-2 w-2 rounded-sm bg-zinc-500" /></span>;
  return <span aria-hidden="true" className={`${box} text-emerald-400`}><CheckIcon /></span>;
}

/** A short word beside the title for the states a person should notice. */
function StateTag({ state }: { state: StepState }) {
  if (state === "needs_you") return <span className="whitespace-nowrap rounded-full border border-amber-500/40 px-1.5 text-xs leading-5 text-amber-200">Needs you</span>;
  if (state === "waiting") return <span className="whitespace-nowrap text-xs leading-5 text-amber-200">Waiting</span>;
  if (state === "failed") return <span className="whitespace-nowrap text-xs leading-5 text-red-300">Failed here</span>;
  return null;
}

function Duration({ step, now }: { step: TimelineStep; now: number }) {
  const live = step.state === "running" || step.state === "waiting" || step.state === "needs_you";
  if (step.pass === "end" && !live) {
    return step.started_at ? (
      <span className="ml-auto shrink-0 whitespace-nowrap pl-2 text-xs text-zinc-400">
        <Time iso={step.started_at} />
      </span>
    ) : null;
  }
  const secs = spanSeconds(step.started_at, live ? null : step.ended_at, now);
  if (secs === null || (!live && !step.ended_at)) return null;
  return (
    <span
      className="ml-auto shrink-0 whitespace-nowrap pl-2 font-mono text-xs tabular-nums text-zinc-400"
      title={step.started_at ? `Started ${formatDate(step.started_at, { time: true })}` : undefined}
    >
      {live ? `${formatDuration(secs)} so far` : formatDuration(secs)}
    </span>
  );
}

/** One step: a line, its notes folded behind a count, and anything the step carries (the checks, say). */
function StepRow({ step, now, children }: { step: TimelineStep; now: number; children?: ReactNode }) {
  const open = step.state !== "done" && step.state !== "stopped";
  const head = (
    <>
      <Mark state={step.state} />
      <span className={`min-w-0 flex-1 basis-[11rem] text-sm [overflow-wrap:anywhere] ${step.state === "failed" ? "text-red-200" : step.state === "done" ? "text-zinc-200" : "font-medium text-zinc-50"}`}>
        {step.title}
        <span className="sr-only"> ({STATE_WORD[step.state]})</span>
      </span>
      <StateTag state={step.state} />
    </>
  );
  return (
    <li className="min-w-0 py-1" data-testid="run-step" data-pass={step.pass} data-state={step.state}>
      {step.notes.length > 0 ? (
        <details open={open} className="group/step">
          <summary className={`flex min-w-0 cursor-pointer list-none flex-wrap items-start gap-x-2 rounded [&::-webkit-details-marker]:hidden ${focusRing}`}>
            {head}
            <span className="inline-flex h-5 shrink-0 items-center gap-0.5 whitespace-nowrap text-xs text-zinc-400">
              {step.notes.length === 1 ? "1 note" : `${step.notes.length} notes`}
              <span aria-hidden="true" className="inline-flex text-zinc-500 transition-transform group-open/step:rotate-90 motion-reduce:transition-none">
                <ChevronRightIcon />
              </span>
            </span>
            <Duration step={step} now={now} />
          </summary>
          <ul className="mt-1 mb-1 ml-2 space-y-0.5 border-l border-zinc-800 pl-4" data-testid="step-notes">
            {step.notes.map((n, i) => (
              <li key={`${n.timestamp}-${i}`} className="flex min-w-0 gap-3 text-xs leading-5 text-zinc-400">
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{n.message}</span>
                {n.timestamp && (
                  <time dateTime={n.timestamp} title={formatDate(n.timestamp, { time: true })} className="shrink-0 whitespace-nowrap tabular-nums">
                    {clock(n.timestamp)}
                  </time>
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <div className="flex min-w-0 flex-wrap items-start gap-x-2">
          {head}
          <Duration step={step} now={now} />
        </div>
      )}
      {children && <div className="mt-2 mb-1 ml-6 min-w-0">{children}</div>}
    </li>
  );
}

/**
 * The run's steps, oldest first, ending on where it is now. `end` is drawn
 * under the last entry (the checks, a hold's reasons). `upcoming` names what
 * the run still has ahead while it works.
 */
export function RunTimeline({
  steps,
  now,
  elapsed,
  heading,
  live,
  end,
  upcoming,
  build,
}: {
  steps: TimelineStep[];
  now: number;
  /** The whole run's time so far or in all. */
  elapsed: string;
  heading: string;
  live: boolean;
  end?: ReactNode;
  upcoming: string[];
  /** Drawn under the last build step: the agent log's digest of what it did. */
  build?: ReactNode;
}) {
  const buildAt = build ? steps.map((s) => s.pass.split(":")[0]).lastIndexOf("implement") : -1;
  return (
    <section className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50" aria-labelledby="run-steps-title" data-testid="run-timeline">
      <div className="flex min-w-0 items-center gap-2 rounded-t-lg border-b border-zinc-800 bg-zinc-900 px-4 py-3">
        <h2 id="run-steps-title" className="min-w-0 text-sm font-semibold text-zinc-100">{heading}</h2>
        {live && <span aria-hidden="true" className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-400 motion-reduce:animate-none" />}
        {elapsed && <span className="ml-auto whitespace-nowrap font-mono text-xs tabular-nums text-zinc-400" data-testid="run-elapsed">{elapsed}</span>}
      </div>
      <div className="px-4 py-3">
        {steps.length > 0 ? (
          <ol aria-label="Steps" className="space-y-0.5">
            {steps.map((s, i) => (
              <StepRow key={s.key} step={s} now={now}>
                {i === buildAt ? build : null}
                {i === steps.length - 1 ? end : null}
              </StepRow>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-zinc-400">{live ? "Starting. The first step shows here in a moment." : "No steps were recorded."}</p>
        )}
        {upcoming.length > 0 && (
          <p className="mt-2 border-t border-zinc-800 pt-2 text-xs text-zinc-400" data-testid="run-upcoming">
            Still to come: {upcoming.join(", ")}
          </p>
        )}
      </div>
    </section>
  );
}

// ---- Checks ---------------------------------------------------------------

const GROUP_WORD = { failed: "Failed", running: "Running", queued: "Queued", passed: "Passed", skipped: "Skipped" } as const;

function CheckMark({ c }: { c: RunCheck }) {
  const g = checkGroup(c);
  const box = "inline-flex h-5 w-4 shrink-0 items-center justify-center";
  if (g === "failed") return <span aria-hidden="true" className={`${box} text-red-300`}><XIcon /></span>;
  if (g === "passed") return <span aria-hidden="true" className={`${box} text-emerald-400`}><CheckIcon /></span>;
  if (g === "running") return <span aria-hidden="true" className={box}><span className="h-2 w-2 animate-pulse rounded-full bg-amber-400 motion-reduce:animate-none" /></span>;
  if (g === "queued") return <span aria-hidden="true" className={box}><span className="h-2 w-2 rounded-full border border-amber-400" /></span>;
  return <span aria-hidden="true" className={box}><span className="h-2 w-2 rounded-sm bg-zinc-500" /></span>;
}

function CheckRow({ c, now }: { c: RunCheck; now: number }) {
  const g = checkGroup(c);
  const secs = g === "running" ? spanSeconds(c.started_at, null, now) : c.completed_at ? spanSeconds(c.started_at, c.completed_at, now) : null;
  const when = g === "running" ? (secs !== null ? `running for ${formatDuration(secs)}` : "running") : g === "queued" ? "waiting to start" : secs !== null ? formatDuration(secs) : "";
  return (
    <li className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-0.5 py-1 text-sm" data-testid="check" data-group={g}>
      <CheckMark c={c} />
      <span className="min-w-0 font-mono text-xs leading-5 text-zinc-200 [overflow-wrap:anywhere]">
        {c.name}
        <span className="sr-only"> ({GROUP_WORD[g].toLowerCase()})</span>
      </span>
      {c.required && <span className="whitespace-nowrap rounded-full border border-zinc-700 px-1.5 text-xs leading-5 text-zinc-300">Required</span>}
      <span className="ml-auto flex shrink-0 items-center gap-3 text-xs leading-5 text-zinc-400">
        {when && <span className="whitespace-nowrap tabular-nums">{when}</span>}
        {c.url && (
          <a href={c.url} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 rounded text-sky-300 hover:text-sky-200 ${focusRing}`}>
            Details
            <span aria-hidden="true" className="inline-flex"><ExternalLinkIcon /></span>
            <span className="sr-only"> for {c.name} (opens in a new tab)</span>
          </a>
        )}
      </span>
    </li>
  );
}

/**
 * The pull request's checks the way GitHub's merge box says them: a
 * headline, the counts in one sentence and the commit, then failures first
 * and passed checks folded under their count.
 */
export function ChecksPanel({ checks, now }: { checks: RunChecks; now: number }) {
  const items = sortedChecks(checks.items ?? []);
  const open = items.filter((c) => !["passed", "skipped"].includes(checkGroup(c)));
  const settled = items.filter((c) => ["passed", "skipped"].includes(checkGroup(c)));
  return (
    <div className="min-w-0 rounded-md border border-zinc-800 bg-zinc-950/40 px-3 py-2" data-testid="run-checks">
      <p className="text-sm font-medium text-zinc-100">{checksHeadline(checks)}</p>
      <p className="text-xs text-zinc-400" data-testid="checks-sentence">
        {checksSentence(checks)}
        {checks.sha ? <> on <span className="font-mono">{checks.sha.slice(0, 7)}</span></> : null}
      </p>
      {open.length > 0 && (
        <ul className="mt-1.5" aria-label="Checks not passed yet">
          {open.map((c) => (
            <CheckRow key={c.name} c={c} now={now} />
          ))}
        </ul>
      )}
      {settled.length > 0 && (
        <details className="group/checks mt-1" open={open.length === 0 && settled.length <= 6}>
          <summary className={`flex w-fit cursor-pointer list-none items-center gap-1 rounded text-xs text-zinc-400 hover:text-zinc-200 [&::-webkit-details-marker]:hidden ${focusRing}`}>
            <span aria-hidden="true" className="inline-flex transition-transform group-open/checks:rotate-90 motion-reduce:transition-none"><ChevronRightIcon /></span>
            {settled.length === 1 ? "1 passed or skipped check" : `${settled.length} passed or skipped checks`}
          </summary>
          <ul className="mt-1" aria-label="Passed or skipped checks">
            {settled.map((c) => (
              <CheckRow key={c.name} c={c} now={now} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ---- Files ----------------------------------------------------------------

const FILES_SHOWN = 8;

function FileLine({ path }: { path: string }) {
  return (
    <li className="min-w-0 py-1">
      <FilePath path={path} />
    </li>
  );
}

/**
 * What the Files changed card says with no file list: still working, a pull
 * request whose list wasn't recorded (never "didn't change any code" beside
 * an open pull request), or truly no change.
 */
export function noFilesNote({ live, prNumber, hasPr }: { live: boolean; prNumber?: number | null; hasPr: boolean }): string {
  if (live) return "Files show here as Coderhelm changes them.";
  if (hasPr) return `Coderhelm didn't record which files this run changed. ${prNumber ? `Pull request #${prNumber}` : "The pull request"} has every change.`;
  return "This run didn't change any code.";
}

/** The files the run changed: the first few, the rest folded, and the diff on GitHub. */
export function FilesChanged({
  files,
  diffUrl,
  live,
  hasPr = false,
  prNumber = null,
}: {
  files: string[];
  diffUrl?: string;
  live: boolean;
  hasPr?: boolean;
  prNumber?: number | null;
}) {
  const first = files.slice(0, FILES_SHOWN);
  const rest = files.slice(FILES_SHOWN);
  return (
    <section className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3" aria-labelledby="run-files-title" data-testid="run-files">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        <h2 id="run-files-title" className="text-sm font-semibold text-zinc-100">
          Files changed {files.length > 0 && <span className="font-normal tabular-nums text-zinc-400">{files.length}</span>}
        </h2>
        {diffUrl && (
          <a href={diffUrl} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 rounded text-sm text-sky-300 hover:text-sky-200 ${focusRing}`}>
            See the diff on GitHub
            <span aria-hidden="true" className="inline-flex"><ExternalLinkIcon /></span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </div>
      {files.length === 0 ? (
        <p className="mt-1 text-sm text-zinc-400" data-testid="run-files-empty">{noFilesNote({ live, prNumber, hasPr })}</p>
      ) : (
        <>
          <ul className="mt-1 divide-y divide-zinc-800/60">
            {first.map((f) => (
              <FileLine key={f} path={f} />
            ))}
          </ul>
          {rest.length > 0 && (
            <details className="group/files">
              <summary className={`mt-1 flex w-fit cursor-pointer list-none items-center gap-1 rounded text-xs text-zinc-400 hover:text-zinc-200 [&::-webkit-details-marker]:hidden ${focusRing}`}>
                <span aria-hidden="true" className="inline-flex transition-transform group-open/files:rotate-90 motion-reduce:transition-none"><ChevronRightIcon /></span>
                {rest.length === 1 ? "1 more file" : `${rest.length} more files`}
              </summary>
              <ul className="divide-y divide-zinc-800/60">
                {rest.map((f) => (
                  <FileLine key={f} path={f} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
