"use client";

import type { ReactNode } from "react";
import type { ActivityGroup, OverviewFile, ReviewSession, SessionStep } from "@/lib/api";
import { Callout } from "@/components/callout";
import { cardClass } from "@/components/page";
import { formatDate, formatDuration, Time } from "@/components/list";
import { FilePath } from "@/components/file-path";
import { Disclosure } from "@/components/disclosure";
import { ChatIcon, CheckIcon, ChevronRightIcon, EyeIcon, ExternalLinkIcon, LayersIcon, PenIcon, SearchIcon, WrenchIcon, XIcon } from "@/components/icons";
import { InlineMarkdown } from "@/components/markdown";
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
        {session.reason && <p className="[overflow-wrap:anywhere]"><InlineMarkdown>{session.reason}</InlineMarkdown></p>}
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

function Offset({ startedAt, at }: { startedAt: string; at: string }) {
  const label = offsetLabel(startedAt, at, formatDuration);
  if (!label) return null;
  return (
    <time dateTime={at} title={formatDate(at, { time: true })} className="ml-auto shrink-0 whitespace-nowrap pl-2 text-xs tabular-nums text-zinc-400">
      {label}
    </time>
  );
}

/** The icon at the start of a row: the kind's icon, or a pulsing dot while it is the one running now. */
function RowMark({ running, children }: { running: boolean; children: ReactNode }) {
  return (
    <span aria-hidden="true" className="inline-flex h-5 w-4 shrink-0 items-center justify-center text-zinc-400">
      {running ? <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400 motion-reduce:animate-none" /> : children}
    </span>
  );
}

/** A setup or posting step: one line, its detail behind "More". */
function StepRow({ step, startedAt, running }: { step: SessionStep; startedAt: string; running: boolean }) {
  return (
    <li className="min-w-0" data-testid="timeline-entry" data-kind="step" data-state={running ? "running" : "done"}>
      <div className="flex min-w-0 items-start gap-2 text-sm">
        <RowMark running={running}>
          <CheckIcon />
        </RowMark>
        <span className="min-w-0 text-zinc-300 [overflow-wrap:anywhere]">
          <InlineMarkdown>{step.text}</InlineMarkdown>
          {running && <span className="sr-only"> (running now)</span>}
        </span>
        <Offset startedAt={startedAt} at={step.at} />
      </div>
      {step.detail && (
        <details className="mt-0.5 pl-6 text-sm">
          <summary className={`w-fit cursor-pointer rounded text-xs text-zinc-400 hover:text-zinc-200 ${focusRing}`}>More</summary>
          <div className="mt-1 whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950/60 p-2 font-mono text-xs text-zinc-300 [overflow-wrap:anywhere]">
            {step.detail}
          </div>
        </details>
      )}
    </li>
  );
}

/**
 * Steps of one kind in a row ("Search 3 times", "View 4 files"): one line
 * that opens to the queries, `path:lines` or comments, in small monospace.
 */
function ToolRow({ group, startedAt, running }: { group: ActivityGroup; startedAt: string; running: boolean }) {
  const Icon = GROUP_ICONS[group.kind] ?? WrenchIcon;
  const failed = group.items.filter((i) => i.failed).length;
  return (
    <li className="min-w-0" data-testid="timeline-entry" data-kind={group.kind} data-state={running ? "running" : "done"}>
      <details className="group/entry text-sm" data-testid="activity-group">
        <summary className={`flex min-w-0 cursor-pointer list-none items-start gap-2 rounded [&::-webkit-details-marker]:hidden ${focusRing}`}>
          <RowMark running={running}>
            <Icon />
          </RowMark>
          <span className="min-w-0 text-zinc-300 group-hover/entry:text-zinc-100">{group.title}</span>
          <span aria-hidden="true" className="inline-flex h-5 shrink-0 items-center text-zinc-500 transition-transform group-open/entry:rotate-90 motion-reduce:transition-none">
            <ChevronRightIcon />
          </span>
          {failed > 0 && <span className="whitespace-nowrap text-xs leading-5 text-red-300">{failed} failed</span>}
          {running && <span className="sr-only"> (running now)</span>}
          <Offset startedAt={startedAt} at={group.started_at} />
        </summary>
        <ul className="mt-1 mb-1 ml-2 space-y-0.5 border-l border-zinc-800 pl-4" data-testid="activity-items">
          {group.items.map((item, i) => (
            <li key={`${item.at}-${i}`} className="min-w-0 text-xs leading-5 text-zinc-400 [overflow-wrap:anywhere]">
              {item.detail && group.kind === "lookup" && <span>{item.detail}{item.label ? ": " : ""}</span>}
              {item.label && <span className="font-mono text-zinc-300">{item.label}</span>}
              {item.detail && group.kind === "comment" && <span> <InlineMarkdown>{item.detail}</InlineMarkdown></span>}
              {item.failed && <span className="text-red-300"> (failed)</span>}
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

/** What the timeline draws: a note heads the tool rows that follow it, as Copilot's session log does. */
type Block =
  | { kind: "step"; step: SessionStep; index: number }
  | { kind: "tool"; group: ActivityGroup; index: number }
  | { kind: "section"; note: ActivityGroup; index: number; tools: { group: ActivityGroup; index: number }[] };

function blocks(session: ReviewSession): { list: Block[]; count: number } {
  const list: Block[] = [];
  let open: Extract<Block, { kind: "section" }> | null = null;
  let index = 0;
  for (const e of timeline(session.steps ?? [], session.activity ?? [])) {
    if (e.kind === "step") {
      open = null;
      list.push({ kind: "step", step: e.step, index: index++ });
    } else if (e.group.kind === "note") {
      open = { kind: "section", note: e.group, index: index++, tools: [] };
      list.push(open);
    } else if (open) {
      open.tools.push({ group: e.group, index: index++ });
    } else {
      list.push({ kind: "tool", group: e.group, index: index++ });
    }
  }
  return { list, count: index };
}

/**
 * The review as it happened, in the order it happened: setup steps, then
 * each thing the reviewer set out to check (a bold heading and its reasoning)
 * with what it searched, read and looked up for it as one-line rows, then the
 * comments it kept and the posting. The newest row pulses while it runs.
 */
export function SessionActivity({ session, now, defaultOpen = true }: { session: ReviewSession; now: number; defaultOpen?: boolean }) {
  const { list, count } = blocks(session);
  const seconds = sessionSeconds(session, now);
  const live = session.in_flight;
  const runningIndex = live ? count - 1 : -1;
  const dropped = droppedNote(session.activity_dropped);
  const start = session.started_at;
  const failed = session.status === "failed" || session.status === "stalled";
  return (
    <section className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50" aria-labelledby="session-activity-title" data-testid="session-activity">
      <details open={defaultOpen} className="group/activity">
        <summary
          className={`flex min-w-0 cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-3 group-open/activity:rounded-b-none group-open/activity:border-b group-open/activity:border-zinc-800 group-open/activity:bg-zinc-900 [&::-webkit-details-marker]:hidden ${focusRing}`}
        >
          <span aria-hidden="true" className="inline-flex shrink-0 text-zinc-400 transition-transform group-open/activity:rotate-90 motion-reduce:transition-none">
            <ChevronRightIcon />
          </span>
          <h2 id="session-activity-title" className="min-w-0 text-sm font-semibold text-zinc-100">
            {activityHeading(session.status, session.kind)}
          </h2>
          {live ? (
            <span aria-hidden="true" className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-400 motion-reduce:animate-none" />
          ) : (
            <span aria-hidden="true" className={`inline-flex shrink-0 ${failed ? "text-red-300" : "text-emerald-400"}`}>
              {failed ? <XIcon /> : <CheckIcon />}
            </span>
          )}
          <span data-testid="activity-elapsed" className="ml-auto whitespace-nowrap font-mono text-xs tabular-nums text-zinc-400">
            {seconds === null ? "" : formatDuration(seconds)}
          </span>
        </summary>
        <div className="px-4 pb-4 pt-3">
          {list.length ? (
            <ol className="space-y-1.5" data-testid="session-timeline">
              {list.map((b) => {
                if (b.kind === "step") return <StepRow key={`s-${b.index}`} step={b.step} startedAt={start} running={b.index === runningIndex} />;
                if (b.kind === "tool") return <ToolRow key={`t-${b.index}`} group={b.group} startedAt={start} running={b.index === runningIndex} />;
                const running = b.index === runningIndex;
                return (
                  <li
                    key={`n-${b.index}`}
                    className="min-w-0 pt-2.5 first:pt-0"
                    data-testid="timeline-entry"
                    data-kind="note"
                    data-state={running ? "running" : "done"}
                  >
                    <div className="flex min-w-0 items-baseline gap-2">
                      <h3 className="min-w-0 text-sm font-semibold text-zinc-100 [overflow-wrap:anywhere]"><InlineMarkdown>{b.note.title}</InlineMarkdown></h3>
                      {running && <span className="sr-only"> (running now)</span>}
                      <Offset startedAt={start} at={b.note.started_at} />
                    </div>
                    {b.note.text && <p className="mt-0.5 text-sm leading-relaxed text-zinc-300 [overflow-wrap:anywhere]"><InlineMarkdown>{b.note.text}</InlineMarkdown></p>}
                    {b.tools.length > 0 && (
                      <ul className="mt-1.5 space-y-1" aria-label={`What it did for: ${b.note.title}`}>
                        {b.tools.map((t) => (
                          <ToolRow key={`t-${t.index}`} group={t.group} startedAt={start} running={t.index === runningIndex} />
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-zinc-400">No steps yet.</p>
          )}
          {dropped && <p className="mt-3 text-xs text-zinc-400" data-testid="activity-dropped">{dropped}</p>}
        </div>
      </details>
    </section>
  );
}

// ---- The overview the review posted ---------------------------------------

/**
 * One row per file: the path as wide as it needs (at most two fifths of the
 * card, then it wraps), the description in the rest, its `code` as code. A
 * grid, not a table layout, so the path column fits its content; on a phone
 * each row stacks the path over its description.
 */
function FilesTable({ files }: { files: OverviewFile[] }) {
  return (
    <div
      role="table"
      aria-label="Reviewed changes"
      data-testid="overview-files"
      className="grid min-w-0 grid-cols-1 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30 text-sm sm:grid-cols-[fit-content(40%)_minmax(0,1fr)]"
    >
      <div role="row" className="col-span-full hidden grid-cols-subgrid border-b border-zinc-800 text-left text-xs text-zinc-400 sm:grid">
        <span role="columnheader" className="px-4 py-2.5 font-medium">File</span>
        <span role="columnheader" className="px-4 py-2.5 font-medium">Description</span>
      </div>
      {files.map((f, i) => (
        <div
          role="row"
          key={f.path}
          className={`col-span-full grid grid-cols-subgrid gap-y-1 px-4 py-2.5 sm:gap-y-0 sm:px-0 ${i > 0 ? "border-t border-zinc-800" : ""}`}
        >
          <span role="cell" className="min-w-0 sm:px-4">
            <FilePath path={f.path} />
          </span>
          <span role="cell" className="min-w-0 leading-relaxed text-zinc-300 [overflow-wrap:anywhere] sm:px-4">
            <InlineMarkdown>{f.description}</InlineMarkdown>
          </span>
        </div>
      ))}
    </div>
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
    <SessionCard id="session-overview-title" title="PR overview" testId="session-overview">
      {o.summary && <p className="mt-2 text-sm text-zinc-200 [overflow-wrap:anywhere]"><InlineMarkdown>{o.summary}</InlineMarkdown></p>}
      {changes.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-medium text-zinc-400">Changes</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-zinc-300" data-testid="overview-changes">
            {changes.map((c, i) => (
              <li key={i} className="[overflow-wrap:anywhere]"><InlineMarkdown>{c}</InlineMarkdown></li>
            ))}
          </ul>
        </>
      )}
      {files.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-medium text-zinc-400">Reviewed changes</h3>
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
