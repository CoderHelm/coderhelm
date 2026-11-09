"use client";

import type { ReactNode } from "react";
import type { ActivityGroup, OverviewFile, ReviewSession, SessionStep } from "@/lib/api";
import { Callout } from "@/components/callout";
import { cardClass } from "@/components/page";
import { formatDate, formatDuration, Time } from "@/components/list";
import { DataTable } from "@/components/data-table";
import { Code } from "@/components/settings/code";
import { Disclosure } from "@/components/disclosure";
import { ChatIcon, ChevronRightIcon, EyeIcon, ExternalLinkIcon, LayersIcon, PenIcon, SearchIcon, WrenchIcon } from "@/components/icons";
import { focusRing } from "@/components/ui";
import { VerdictPill } from "../labels";
import {
  activityHeading,
  droppedNote,
  findingsLabel,
  kindLabel,
  offsetLabel,
  OVERVIEW_FOLD_AFTER,
  sessionSeconds,
  statusNote,
  timeline,
  triggerLabel,
} from "./session";

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

// ---- What the reviewer did ------------------------------------------------

const GROUP_ICONS: Record<string, () => ReactNode> = {
  search: SearchIcon,
  view: EyeIcon,
  find: LayersIcon,
  lookup: WrenchIcon,
  note: PenIcon,
  comment: ChatIcon,
};

/** The dot on the timeline's line: pulsing while the entry is the one running now. */
function Dot({ running }: { running: boolean }) {
  return (
    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${running ? "animate-pulse bg-sky-400 motion-reduce:animate-none" : "bg-zinc-500"}`} />
  );
}

/** One row of the timeline, with the line down to the next row. */
function Row({ kind, running, last, children }: { kind: string; running: boolean; last: boolean; children: ReactNode }) {
  return (
    <li className="relative flex min-w-0 gap-3 pb-3 last:pb-0" data-testid="timeline-entry" data-kind={kind} data-state={running ? "running" : "done"}>
      <span aria-hidden="true" className="relative flex w-3 shrink-0 justify-center">
        <Dot running={running} />
        {!last && <span className="absolute top-4 bottom-[-0.25rem] w-px bg-zinc-800" />}
      </span>
      <div className="min-w-0 flex-1">
        {children}
        {running && <span className="sr-only"> (running now)</span>}
      </div>
    </li>
  );
}

function Offset({ startedAt, at }: { startedAt: string; at: string }) {
  const label = offsetLabel(startedAt, at, formatDuration);
  if (!label) return null;
  return (
    <time dateTime={at} title={formatDate(at, { time: true })} className="whitespace-nowrap text-xs tabular-nums text-zinc-400">
      {label}
    </time>
  );
}

function StepEntry({ step, startedAt }: { step: SessionStep; startedAt: string }) {
  return (
    <>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span className="min-w-0 text-sm text-zinc-200 [overflow-wrap:anywhere]">{step.text}</span>
        <Offset startedAt={startedAt} at={step.at} />
      </div>
      {step.detail && (
        <details className="mt-1 text-sm">
          <summary className={`cursor-pointer text-xs text-zinc-400 hover:text-zinc-200 ${focusRing}`}>More</summary>
          <div className="mt-1 whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950/60 p-2 text-xs text-zinc-300 [overflow-wrap:anywhere]">
            {step.detail}
          </div>
        </details>
      )}
    </>
  );
}

function NoteEntry({ group, startedAt }: { group: ActivityGroup; startedAt: string }) {
  return (
    <>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span className="min-w-0 text-sm font-medium text-zinc-100 [overflow-wrap:anywhere]">{group.title}</span>
        <Offset startedAt={startedAt} at={group.started_at} />
      </div>
      {group.text && <p className="mt-0.5 text-sm text-zinc-400 [overflow-wrap:anywhere]">{group.text}</p>}
    </>
  );
}

/** A group of steps of one kind: its title, and its queries, files or comments when opened. */
function GroupEntry({ group, startedAt }: { group: ActivityGroup; startedAt: string }) {
  const Icon = GROUP_ICONS[group.kind] ?? WrenchIcon;
  const failed = group.items.filter((i) => i.failed).length;
  return (
    <details className="group/entry text-sm" data-testid="activity-group">
      <summary className={`flex min-w-0 cursor-pointer list-none flex-wrap items-baseline gap-x-2 [&::-webkit-details-marker]:hidden ${focusRing}`}>
        <span aria-hidden="true" className="inline-flex shrink-0 self-center text-zinc-400 transition-transform group-open/entry:rotate-90 motion-reduce:transition-none">
          <ChevronRightIcon />
        </span>
        <span aria-hidden="true" className="inline-flex shrink-0 self-center text-zinc-400">
          <Icon />
        </span>
        <span className="text-zinc-200 hover:text-zinc-100">{group.title}</span>
        {failed > 0 && <span className="text-xs text-red-300">{failed} failed</span>}
        <Offset startedAt={startedAt} at={group.started_at} />
      </summary>
      <ul className="mt-1.5 space-y-1 border-l border-zinc-800 pl-3 ml-1.5" data-testid="activity-items">
        {group.items.map((item, i) => (
          <li key={`${item.at}-${i}`} className="min-w-0 text-xs text-zinc-300">
            {item.detail && group.kind === "lookup" && <span className="text-zinc-400">{item.detail}{item.label ? ": " : ""}</span>}
            {item.label && <Code>{item.label}</Code>}
            {item.detail && group.kind === "comment" && <span className="text-zinc-400"> {item.detail}</span>}
            {item.failed && <span className="text-red-300"> (failed)</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * The review as it happened, like a run log: setup steps, then what the
 * reviewer searched, read and looked up (grouped by kind), the notes it wrote
 * on what it was checking, and the comments it kept. Collapsible; the last
 * entry pulses while the review runs.
 */
export function SessionActivity({ session, now }: { session: ReviewSession; now: number }) {
  const entries = timeline(session.steps ?? [], session.activity ?? []);
  const seconds = sessionSeconds(session, now);
  const live = session.in_flight;
  const dropped = droppedNote(session.activity_dropped);
  return (
    <section className={cardClass} aria-labelledby="session-activity-title" data-testid="session-activity">
      <details open className="group/activity">
        <summary className={`flex min-w-0 cursor-pointer list-none items-center gap-2 rounded [&::-webkit-details-marker]:hidden ${focusRing}`}>
          <span aria-hidden="true" className="inline-flex shrink-0 text-zinc-400 transition-transform group-open/activity:rotate-90 motion-reduce:transition-none">
            <ChevronRightIcon />
          </span>
          <h2 id="session-activity-title" className="text-sm font-medium text-zinc-100">
            {activityHeading(session.status, session.kind)}
          </h2>
          {live && <span aria-hidden="true" className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-400 motion-reduce:animate-none" />}
          <span data-testid="activity-elapsed" className="ml-auto whitespace-nowrap text-xs tabular-nums text-zinc-400">
            {seconds === null ? "" : formatDuration(seconds)}
          </span>
        </summary>
        {entries.length ? (
          <ol className="mt-3" data-testid="session-timeline">
            {entries.map((e, i) => {
              const last = i === entries.length - 1;
              const running = last && live;
              if (e.kind === "step") {
                return (
                  <Row key={`s-${e.at}-${i}`} kind="step" running={running} last={last}>
                    <StepEntry step={e.step} startedAt={session.started_at} />
                  </Row>
                );
              }
              return (
                <Row key={`g-${e.at}-${i}`} kind={e.group.kind} running={running} last={last}>
                  {e.group.kind === "note" ? (
                    <NoteEntry group={e.group} startedAt={session.started_at} />
                  ) : (
                    <GroupEntry group={e.group} startedAt={session.started_at} />
                  )}
                </Row>
              );
            })}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-zinc-400">No steps yet.</p>
        )}
        {dropped && <p className="mt-3 text-xs text-zinc-400" data-testid="activity-dropped">{dropped}</p>}
      </details>
    </section>
  );
}

// ---- The overview the review posted ---------------------------------------

function FilesTable({ files }: { files: OverviewFile[] }) {
  return (
    <DataTable
      label="Reviewed changes"
      testId="overview-files"
      rows={files}
      rowKey={(f) => f.path}
      columns={[
        { key: "file", header: "File", width: "grow", cell: (f) => <Code>{f.path}</Code> },
        { key: "description", header: "Description", width: "grow", cell: (f) => <span className="text-zinc-300">{f.description}</span> },
      ]}
    />
  );
}

/** What the PR does, its changes, and one line per file: the overview the review led with on GitHub. */
export function SessionOverview({ session }: { session: ReviewSession }) {
  const o = session.overview;
  if (!o) return null;
  const files = o.files ?? [];
  const changes = o.changes ?? [];
  const more = Math.max(0, (o.files_total ?? files.length) - files.length);
  const total = o.files_total || files.length;
  return (
    <SessionCard id="session-overview-title" title="PR Overview" testId="session-overview">
      {o.summary && <p className="mt-2 text-sm text-zinc-200 [overflow-wrap:anywhere]">{o.summary}</p>}
      {changes.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-medium text-zinc-400">Changes</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-zinc-300" data-testid="overview-changes">
            {changes.map((c, i) => (
              <li key={i} className="[overflow-wrap:anywhere]">{c}</li>
            ))}
          </ul>
        </>
      )}
      {files.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-medium text-zinc-400">Reviewed Changes</h3>
          <p className="mt-0.5 text-xs text-zinc-400">{total === 1 ? "1 changed file" : `${total} changed files`}</p>
          <div className="mt-2">
            {files.length > OVERVIEW_FOLD_AFTER ? (
              <Disclosure summary="Show a summary per file">
                <FilesTable files={files} />
              </Disclosure>
            ) : (
              <FilesTable files={files} />
            )}
          </div>
          {more > 0 && <p className="mt-2 text-xs text-zinc-400">And {more} more {more === 1 ? "file" : "files"}.</p>}
        </>
      )}
    </SessionCard>
  );
}
