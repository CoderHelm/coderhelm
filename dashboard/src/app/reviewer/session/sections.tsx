"use client";

import type { ReactNode } from "react";
import type { ReviewSession, SessionStep } from "@/lib/api";
import { Callout } from "@/components/callout";
import { cardClass } from "@/components/page";
import { formatDate, formatDuration, Time } from "@/components/list";
import { ExternalLinkIcon } from "@/components/icons";
import { focusRing } from "@/components/ui";
import { VerdictPill } from "../labels";
import { findingsLabel, kindLabel, sessionSeconds, statusNote, stepOffset, triggerLabel } from "./session";

// The session page's parts. Each takes the session and draws one card, so a
// new kind of detail is one more section on the page.

/** A card with a heading; the page stacks these. */
export function SessionCard({ id, title, children, testId }: { id: string; title: string; children: ReactNode; testId?: string }) {
  return (
    <section className={cardClass} aria-labelledby={id} data-testid={testId}>
      <h2 id={id} className="text-sm font-medium text-zinc-100">{title}</h2>
      {children}
    </section>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 text-sky-300 hover:text-sky-200 ${focusRing}`}>
      {children}
      <span aria-hidden="true" className="inline-flex"><ExternalLinkIcon /></span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-zinc-200 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/** Why it ended without a review, or what its status means. */
export function SessionNotice({ session }: { session: ReviewSession }) {
  const note = statusNote(session.status);
  if (!session.reason && !note) return null;
  const variant = session.status === "failed" || session.status === "stalled" ? "error" : session.status === "skipped" ? "neutral" : "warning";
  const title =
    session.status === "skipped" ? "No review needed" : session.status === "retrying" ? "Sent again" : session.status === "stalled" ? "The review stalled" : "The review didn't finish";
  return (
    <div data-testid="session-notice">
      <Callout variant={variant} title={title} live={false}>
        {session.reason && <p className="[overflow-wrap:anywhere]">{session.reason}</p>}
        {note && <p>{note}</p>}
      </Callout>
    </div>
  );
}

/** What asked for it, what kind of job it is, and when it ran. */
export function SessionFacts({ session, now }: { session: ReviewSession; now: number }) {
  const seconds = sessionSeconds(session, now);
  const sha = session.head_sha;
  return (
    <SessionCard id="session-facts-title" title="About this review" testId="session-facts">
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Asked for by">{triggerLabel(session.trigger)}</Fact>
        <Fact label="Kind">{kindLabel(session.kind)}{session.attempt > 0 ? `, try ${session.attempt + 1}` : ""}</Fact>
        {sha && (
          <Fact label="Commit">
            <ExternalLink href={`https://github.com/${session.repo}/commit/${sha}`}>{sha.slice(0, 7)}</ExternalLink>
          </Fact>
        )}
        <Fact label="Started">
          {session.started_at ? <Time iso={session.started_at} /> : "Not yet"}
        </Fact>
        <Fact label="Finished">
          {session.finished_at ? <Time iso={session.finished_at} /> : session.in_flight ? "Still running" : "Not recorded"}
        </Fact>
        <Fact label={session.in_flight ? "Running for" : "Took"}>
          <span data-testid="session-duration">{seconds === null ? "Unknown" : formatDuration(seconds)}</span>
        </Fact>
      </dl>
    </SessionCard>
  );
}

/** The verdict, the findings kept, and the review posted on GitHub. */
export function SessionOutcome({ session }: { session: ReviewSession }) {
  if (session.status !== "done") return null;
  const findings = findingsLabel(session.findings);
  return (
    <SessionCard id="session-outcome-title" title="Outcome" testId="session-outcome">
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm text-zinc-300">
        {session.verdict && <VerdictPill verdict={session.verdict} />}
        {findings && <span data-testid="session-findings">{findings}</span>}
        {session.review_url ? (
          <ExternalLink href={session.review_url}>See the review on GitHub</ExternalLink>
        ) : (
          <span className="text-zinc-400">Nothing new was posted on the pull request.</span>
        )}
      </div>
    </SessionCard>
  );
}

function StepRow({ step, startedAt, last, live }: { step: SessionStep; startedAt: string; last: boolean; live: boolean }) {
  const offset = stepOffset(startedAt, step.at);
  return (
    <li className="relative flex min-w-0 gap-3 pb-3 last:pb-0">
      <span aria-hidden="true" className="relative flex w-3 shrink-0 justify-center">
        <span className={`mt-1.5 h-2 w-2 rounded-full ${last && live ? "animate-pulse bg-sky-400 motion-reduce:animate-none" : "bg-zinc-500"}`} />
        {!last && <span className="absolute top-4 bottom-[-0.25rem] w-px bg-zinc-800" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="min-w-0 text-sm text-zinc-200 [overflow-wrap:anywhere]">{step.text}</span>
          <time dateTime={step.at} title={formatDate(step.at, { time: true })} className="whitespace-nowrap text-xs tabular-nums text-zinc-400">
            {offset === null ? "" : `+${formatDuration(offset)}`}
          </time>
        </div>
        {step.detail && (
          <details className="mt-1 text-sm">
            <summary className={`cursor-pointer text-xs text-zinc-400 hover:text-zinc-200 ${focusRing}`}>More</summary>
            <div className="mt-1 whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950/60 p-2 text-xs text-zinc-300 [overflow-wrap:anywhere]">
              {step.detail}
            </div>
          </details>
        )}
      </div>
    </li>
  );
}

/** Every step so far, oldest first; the last one pulses while it runs. */
export function SessionTimeline({ session }: { session: ReviewSession }) {
  const steps = session.steps ?? [];
  return (
    <SessionCard id="session-steps-title" title="Steps">
      {steps.length ? (
        <ol className="mt-3" data-testid="session-steps">
          {steps.map((s, i) => (
            <StepRow key={`${s.at}-${i}`} step={s} startedAt={session.started_at} last={i === steps.length - 1} live={session.in_flight} />
          ))}
        </ol>
      ) : (
        <p className="mt-1 text-sm text-zinc-400">No steps yet.</p>
      )}
    </SessionCard>
  );
}
