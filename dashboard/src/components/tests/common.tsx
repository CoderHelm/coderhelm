"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { TestAttempt, TestState, TestRunExecution } from "@/lib/api";
import { StatusPill } from "@/components/status-pill";
import { ListEmpty, ListError, ListSkeleton, type StatusLook } from "@/components/list";
import { ATTEMPT_LABEL, STATE_HELP, STATE_LABEL, STATE_TONE } from "@/lib/tests";
import { formatDuration } from "@/lib/data-sources";
import { linkButton } from "@/components/ui";
import { StatTile } from "@/components/stat-tile";
import { SectionHeading as SharedHeading } from "@/components/page";
import { TechnicalDetails, firstLine } from "@/components/problem";
import { selectClass } from "@/components/select";

/** A test state in the shared list vocabulary (dot colour and words). */
export function stateLook(state: TestState): StatusLook {
  const tone = { healthy: "success", flaky: "waiting", broken: "danger", quarantined: "muted", fixed: "success" } as const;
  return { label: STATE_LABEL[state], tone: tone[state] ?? "neutral" };
}

export function StatePill({ state }: { state: TestState }) {
  return (
    <span title={STATE_HELP[state]}>
      <StatusPill tone={STATE_TONE[state]}>{STATE_LABEL[state]}</StatusPill>
    </span>
  );
}

const ATTEMPT_STYLE: Record<TestAttempt["status"], string> = {
  passed: "bg-emerald-500/80 border-emerald-400/40",
  failed: "bg-red-500/80 border-red-400/40",
  timedOut: "bg-red-500/80 border-red-400/40",
  interrupted: "bg-zinc-600 border-zinc-500",
  skipped: "bg-transparent border-zinc-500",
};

/**
 * Each attempt of one test in one run as a small square, left to right: a red
 * square then a green one is a pass on retry. The status is also in the label,
 * so color is never the only signal.
 */
export function AttemptSquares({ attempts, size = "md" }: { attempts: TestAttempt[]; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-2.5 w-2.5" : "h-3.5 w-3.5";
  const label = attempts.map((a, i) => `Attempt ${i + 1}: ${ATTEMPT_LABEL[a.status]}`).join(", ");
  return (
    <span role="img" aria-label={label || "No attempts"} title={label} className="inline-flex items-center gap-0.5">
      {attempts.map((a, i) => (
        <span key={i} className={`${box} rounded-[3px] border ${ATTEMPT_STYLE[a.status]}`} />
      ))}
    </span>
  );
}

/** A legend for AttemptSquares, so the colours never have to be guessed. */
export function AttemptLegend() {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400" data-testid="attempt-legend">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-[3px] border ${ATTEMPT_STYLE.passed}`} />
        Passed
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-[3px] border ${ATTEMPT_STYLE.failed}`} />
        Failed
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-[3px] border ${ATTEMPT_STYLE.skipped}`} />
        Skipped
      </span>
    </span>
  );
}

/** The shared stat tile, under the name the Tests pages use. */
export function StatCard({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "warning" | "error" | "success" }) {
  return <StatTile label={label} value={value} note={hint} tone={tone === "error" ? "danger" : tone ?? "neutral"} />;
}

/** A sentence-case section heading with an optional control on the right. */
export function SectionHeading({ id, children, aside }: { id: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <SharedHeading id={id}>{children}</SharedHeading>
      {aside}
    </div>
  );
}

/**
 * A test's error, the way people read it: the first line in plain text, the
 * whole message (stack trace and all) folded under "Full error".
 */
export function ErrorSummary({ message }: { message: string }) {
  const head = firstLine(message, 200);
  const more = message.trim() !== head;
  return (
    <div className="mt-1.5 min-w-0" data-testid="test-error">
      <p className="text-sm text-red-200 [overflow-wrap:anywhere]">{head}</p>
      {more && <TechnicalDetails text={message} summary="Full error" />}
    </div>
  );
}

/** Nothing to list: the shared empty state. */
export function EmptyBox({ children }: { children: ReactNode }) {
  return <ListEmpty title={children} />;
}

/** The view could not be read: the shared error state, with Try again. */
export function LoadError({ what, message, onRetry }: { what: string; message: string; onRetry: () => void }) {
  return (
    <ListError title={`We couldn't load ${what}`} onRetry={onRetry}>
      {message}
    </ListError>
  );
}

/** The shared skeleton rows while a view loads. */
export function Loading({ what }: { what: string }) {
  return <ListSkeleton rows={4} label={`Loading ${what}`} />;
}

/** The first failing attempt's error, the line most people need. */
export function firstError(attempts: TestAttempt[]): string {
  return attempts.find((a) => a.error?.message)?.error?.message ?? "";
}

/** Links to the trace, video and screenshot of the first attempt that has them. */
export function ArtifactLinks({ attempts, runUrl }: { attempts: TestAttempt[]; runUrl?: string }) {
  const withTrace = attempts.find((a) => a.trace_url);
  const withVideo = attempts.find((a) => a.video_url);
  const withShot = attempts.find((a) => a.screenshot_url);
  const links: { href: string; label: string }[] = [];
  if (withTrace?.trace_url) links.push({ href: withTrace.trace_url, label: "Trace" });
  if (withVideo?.video_url) links.push({ href: withVideo.video_url, label: "Video" });
  if (withShot?.screenshot_url) links.push({ href: withShot.screenshot_url, label: "Screenshot" });
  if (runUrl) links.push({ href: runUrl, label: "GitHub run" });
  if (links.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
      {links.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className={linkButton}>
          {l.label}
        </a>
      ))}
    </span>
  );
}

export function totalDuration(e: TestRunExecution): string {
  return formatDuration(e.attempts.reduce((sum, a) => sum + (a.duration_ms || 0), 0));
}

/** A select styled like the rest of the dashboard's inputs. */
export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  hideLabel,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  hideLabel?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className={hideLabel ? "sr-only" : "text-xs text-zinc-400"}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={`${selectClass("md")} w-full min-w-0`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
