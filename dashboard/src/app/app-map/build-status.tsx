"use client";

// The App map's build, said plainly: the steps in order with the one it is
// on, how long it has run and usually takes, and what the map will be; why a
// build stopped, with one "Try again"; and, with a map there, when it was
// built. Only one build runs at a time, so there is never a button to start
// another while one runs.

import type { ReactNode } from "react";
import type { AppMapStatus } from "@/lib/api";
import { BUILD_STEPS, builtLine, clockTime, duration, estimateLine, stepIndex } from "@/lib/app-map-build";
import { cardClass } from "@/components/page";
import { Problem } from "@/components/problem";
import { CheckIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui";

/** The steps, the one it is on marked "Now". */
function Steps({ current }: { current: number }) {
  return (
    <ol className="space-y-3" aria-label="Steps" data-testid="app-map-steps">
      {BUILD_STEPS.map((s, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li key={s.key} className="flex gap-3" aria-current={now ? "step" : undefined} data-state={done ? "done" : now ? "now" : "next"}>
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                done ? "bg-emerald-500/15 text-emerald-300" : now ? "bg-blue-500/20 text-blue-200 ring-1 ring-blue-400/60" : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {done ? <CheckIcon /> : i + 1}
            </span>
            <div className="min-w-0">
              <p className={`text-sm ${now ? "font-semibold text-zinc-50" : done ? "text-zinc-300" : "text-zinc-400"}`}>
                {s.label}
                {now && <span className="ml-2 rounded bg-blue-500/15 px-1.5 py-0.5 text-xs font-medium text-blue-200">Now</span>}
                <span className="sr-only">{done ? " (done)" : now ? " (in progress)" : " (next)"}</span>
              </p>
              {now && <p className="mt-0.5 text-sm text-zinc-400">{s.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** A sketch of what a map looks like: parts as boxes, calls as lines. Not the team's map. */
export function MapSketch() {
  const box = "fill-zinc-800 stroke-zinc-600";
  const text = "fill-zinc-300";
  const line = "stroke-zinc-500";
  return (
    <svg viewBox="0 0 320 150" className="h-auto w-full max-w-sm" role="img" aria-label="A sketch of an app map: a website, an API and a database as boxes, with lines for what calls what">
      <line x1="95" y1="40" x2="160" y2="75" className={line} strokeWidth="1.5" />
      <line x1="95" y1="110" x2="160" y2="80" className={line} strokeWidth="1.5" />
      <line x1="235" y1="78" x2="262" y2="78" className={line} strokeWidth="1.5" />
      <rect x="10" y="22" width="85" height="36" rx="6" className={box} />
      <text x="52" y="44" textAnchor="middle" fontSize="11" className={text}>Website</text>
      <rect x="10" y="92" width="85" height="36" rx="6" className={box} />
      <text x="52" y="114" textAnchor="middle" fontSize="11" className={text}>Mobile app</text>
      <rect x="160" y="58" width="75" height="40" rx="6" className={box} />
      <text x="197" y="82" textAnchor="middle" fontSize="11" className={text}>API</text>
      <rect x="262" y="60" width="50" height="36" rx="6" className={box} />
      <text x="287" y="82" textAnchor="middle" fontSize="11" className={text}>Data</text>
    </svg>
  );
}

/** Seconds on the server's clock now, from when the status was read. */
export function serverNow(status: AppMapStatus, readAt: number, nowMs: number): number {
  const base = status.now ?? Math.floor(readAt / 1000);
  return base + Math.max(0, (nowMs - readAt) / 1000);
}

/** The first map building: its steps, its time, and what it will be. */
export function Building({ status, now }: { status: AppMapStatus; now: number }) {
  const started = status.started_at ?? 0;
  const elapsed = started > 0 ? now - started : 0;
  const late = !!status.estimate && elapsed > status.estimate.high_secs;
  const waiting = status.step === "Waiting to start";
  return (
    <section className={`${cardClass} space-y-5`} data-testid="app-map-building" aria-live="polite">
      <div>
        <h2 className="text-base font-semibold text-zinc-50">Building your app map</h2>
        <p className="mt-1 text-sm text-zinc-300" data-testid="app-map-timing">
          {started > 0 ? `Started at ${clockTime(started)}, ${duration(elapsed)} so far. ` : ""}
          {late ? "This is taking longer than usual; it carries on." : estimateLine(status)}
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <Steps current={stepIndex(status.stage)} />
          {waiting && <p className="mt-3 text-sm text-zinc-400">Waiting for a worker to pick it up; that usually takes under a minute.</p>}
        </div>
        <div className="space-y-2" data-testid="app-map-preview">
          <p className="text-sm font-medium text-zinc-200">What you&apos;ll get</p>
          <p className="text-sm text-zinc-400">
            Your app drawn as a map: each part described in plain words, what calls what across your repositories, and the outside services it uses.
          </p>
          <MapSketch />
        </div>
      </div>
      <p className="text-sm text-zinc-400">This page updates by itself. You can leave it; the build carries on.</p>
    </section>
  );
}

/** The first map didn't build: where it stopped, and one way on. */
export function Failed({ status, onRetry, canRetry, busy }: { status: AppMapStatus; onRetry: () => void; canRetry: boolean; busy: boolean }) {
  const where = BUILD_STEPS[Math.min(stepIndex(status.stage), 2)].label.toLowerCase();
  return (
    <Problem
      title="The map couldn't be built"
      onRetry={canRetry && !busy ? onRetry : undefined}
      details={status.note || null}
      testId="app-map-failed"
    >
      It stopped while {where}. Nothing else was changed.{" "}
      {canRetry ? "Try again; if it stops at the same step again, the technical details below say why." : "Ask an admin of your team to try again."}
    </Problem>
  );
}

/** With a map there: when it was built, and building it again (or the update running). */
export function BuiltBar({
  status,
  now,
  canRebuild,
  busy,
  onRebuild,
  hint,
}: {
  status: AppMapStatus;
  now: number;
  canRebuild: boolean;
  busy: boolean;
  onRebuild: () => void;
  hint: ReactNode;
}) {
  const updating = status.updating;
  const updateFailed = !updating && status.last_build === "failed";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2" data-testid="app-map-built">
        <p className="text-sm text-zinc-300">
          {updating ? (
            <>
              {builtLine(status, now)}. <span className="text-zinc-100">Updating since {clockTime(status.started_at || now)}</span>
              {status.step ? `: ${status.step.toLowerCase()}` : ""}. You&apos;re looking at the last map until it&apos;s done.
            </>
          ) : (
            `${builtLine(status, now)}.`
          )}
        </p>
        {canRebuild && !updating && (
          <button type="button" onClick={onRebuild} disabled={busy} className={buttonClass("secondary", "sm")} data-testid="app-map-rebuild">
            {busy ? "Starting" : "Build the map again"}
          </button>
        )}
      </div>
      {updateFailed && (
        <Problem title="The last update didn't finish" tone="warning" compact details={status.note || null} testId="app-map-update-failed">
          This is the map from before it. {canRebuild ? "Build the map again to try once more." : ""}
        </Problem>
      )}
      <p className="text-sm text-zinc-400" data-testid="app-map-hint">
        {hint}
      </p>
    </div>
  );
}
