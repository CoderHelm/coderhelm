"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { TestAttempt, TestState, TestRunExecution } from "@/lib/api";
import { StatusPill } from "@/components/status-pill";
import { ListEmpty, ListError, ListSkeleton, type StatusLook } from "@/components/list";
import { ATTEMPT_LABEL, STATE_HELP, STATE_LABEL, STATE_TONE } from "@/lib/tests";
import { formatDuration } from "@/lib/data-sources";
import { focusRing, linkButton } from "@/components/ui";

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
  skipped: "bg-transparent border-zinc-600 border-dashed",
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

export function StatCard({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "warning" | "error" | "success" }) {
  const valueColor =
    tone === "error" ? "text-red-300" : tone === "warning" ? "text-amber-300" : tone === "success" ? "text-emerald-300" : "text-zinc-100";
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${valueColor}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export function SectionHeading({ id, children, aside }: { id: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <h2 id={id} className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{children}</h2>
      {aside}
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

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-100 rounded ${focusRing}`}>
      <span aria-hidden="true">←</span> {children}
    </Link>
  );
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
      <span className={hideLabel ? "sr-only" : "text-xs text-zinc-500"}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={`min-h-9 w-full min-w-0 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 ${focusRing}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
