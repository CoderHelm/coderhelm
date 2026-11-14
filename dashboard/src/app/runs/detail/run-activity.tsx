"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorStatus, type RunActivityEntry, type RunDetail } from "@/lib/api";
import { Problem } from "@/components/problem";
import { SectionHeading } from "@/components/page";
import { Skeleton } from "@/components/skeleton";
import { Time } from "@/components/list";
import { JumpToLatest, useFollowScroll } from "@/components/follow-scroll";
import { ExternalLinkIcon } from "@/components/icons";
import { focusRing, smallSecondaryButton } from "@/components/ui";

// The run's story in time order, newest last: every step it began and
// finished, its notes, questions and answers, approvals, asks to the team's
// agents, reviews, pushes, waits and where it stands now, read from
// `GET /api/runs/:id/activity`. While the run works the list refreshes by
// itself and follows the newest entry only while the reader is at the end.

/** How often a working run's story is read again, besides each change to the run. */
const LIVE_MS = 10_000;

const ACTOR_WORD: Record<RunActivityEntry["actor"], string> = {
  coderhelm: "Coderhelm",
  person: "A person",
  github: "GitHub",
  jira: "Jira",
};

const TONE_DOT: Record<RunActivityEntry["tone"], string> = {
  neutral: "bg-zinc-500",
  good: "bg-emerald-400",
  problem: "bg-red-400",
};

const STEP_WORD: Record<string, string> = {
  triage: "triage",
  plan: "plan",
  implement: "build",
  test: "test",
  security: "security",
  pr: "pull request",
  review: "checks",
  feedback: "feedback",
  ci_fix: "CI fix",
};

function stepWord(raw: string): string {
  const [base, n] = raw.split(":");
  const word = STEP_WORD[base] ?? base.replace(/_/g, " ");
  return n && n !== "1" ? `${word} #${n}` : word;
}

/**
 * The story from the run record alone, for a gateway that doesn't serve the
 * activity yet: when it started, each step it began, its notes and the
 * answers people gave. Same shape and order as the gateway's.
 */
export function activityFromRun(run: RunDetail): RunActivityEntry[] {
  const out: RunActivityEntry[] = [];
  const add = (at: string | null | undefined, e: Omit<RunActivityEntry, "id" | "at">) => {
    const t = at ? Date.parse(at) : NaN;
    if (Number.isNaN(t) || !e.text) return;
    const iso = new Date(t).toISOString();
    out.push({ ...e, at: iso, id: `${iso}#run#${String(out.length).padStart(4, "0")}` });
  };
  add(run.created_at, { actor: "coderhelm", kind: "started", text: "Run started", tone: "neutral" });
  for (const p of run.pass_history ?? []) {
    if (p.pass) add(p.started_at, { actor: "coderhelm", kind: "step", text: `Started ${stepWord(p.pass)}`, tone: "neutral" });
  }
  for (const n of run.progress_notes ?? []) {
    add(n.timestamp, { actor: "coderhelm", kind: "note", text: (n.message ?? "").split("\n")[0].trim(), tone: "neutral" });
  }
  for (const a of run.answers ?? []) {
    add(a.answered_at, { actor: "person", who: a.author, kind: "answered", text: `Answered "${a.question}": ${a.answer}`, tone: "neutral", link: run.answers_url ?? undefined });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Older entries kept from earlier pages, then the newest page; one of each id. */
function mergePages(kept: RunActivityEntry[], page: RunActivityEntry[]): RunActivityEntry[] {
  const first = page[0]?.id;
  const older = first ? kept.filter((e) => e.id < first) : kept;
  return [...older, ...page];
}

function EntryLink({ href, children }: { href: string; children: React.ReactNode }) {
  const cls = `underline decoration-zinc-600 underline-offset-4 hover:text-zinc-100 hover:decoration-zinc-400 rounded ${focusRing}`;
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${cls} inline-flex items-baseline gap-1`}>
      {children}
      <ExternalLinkIcon />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export function RunActivity({
  runId,
  run,
  live,
}: {
  runId: string;
  run: RunDetail;
  /** The run is still working or waiting: read again as it changes. */
  live: boolean;
}) {
  const [entries, setEntries] = useState<RunActivityEntry[] | null>(null);
  const [earlier, setEarlier] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [fromRecord, setFromRecord] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const runRef = useRef(run);
  runRef.current = run;
  const follow = useFollowScroll(live);

  const load = useCallback(() => {
    api
      .getRunActivity(runId)
      .then((r) => {
        // An older gateway, or a proxy that answers anything, sends no list.
        if (!r || !Array.isArray(r.entries)) {
          setFromRecord(true);
          setEntries(activityFromRun(runRef.current));
          setEarlier(null);
        } else {
          setFromRecord(false);
          setEntries((kept) => mergePages(kept ?? [], r.entries));
          setEarlier((was) => (was === null ? r.earlier : was));
        }
        setFailed(false);
      })
      .catch((e: unknown) => {
        if (errorStatus(e) === 404 || errorStatus(e) === 405) {
          setFromRecord(true);
          setEntries(activityFromRun(runRef.current));
          setFailed(false);
          return;
        }
        // A failed refresh keeps what is already on screen.
        setFailed(true);
      });
  }, [runId]);

  // Read on open and again each time the run changes (the page's own poll).
  const changed = `${run.status}|${run.updated_at ?? ""}`;
  useEffect(() => {
    load();
  }, [load, changed]);

  // Approvals, asks and reviews don't touch the run record: read on a timer too while it works.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(load, LIVE_MS);
    return () => clearInterval(t);
  }, [live, load]);

  const showEarlier = () => {
    if (!earlier) return;
    setLoadingEarlier(true);
    api
      .getRunActivity(runId, { before: earlier })
      .then((r) => {
        setEntries((now) => [...r.entries, ...(now ?? [])]);
        setEarlier(r.earlier);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoadingEarlier(false));
  };

  const retry = () => {
    setFailed(false);
    load();
  };

  return (
    <section aria-labelledby="run-activity-heading" className="min-w-0 space-y-3" data-testid="run-activity">
      <SectionHeading id="run-activity-heading">What happened</SectionHeading>
      {entries === null ? (
        failed ? (
          <div className="rounded-lg border border-zinc-800 p-4">
            <Problem title="Couldn't load this run's activity." compact onRetry={retry} testId="run-activity-error">
              Check your connection and try again.
            </Problem>
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border border-zinc-800 p-4" role="status" aria-label="Loading the run's activity" data-testid="run-activity-loading">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-4 w-16 shrink-0" />
                <Skeleton className="h-4 w-full max-w-md" />
              </div>
            ))}
          </div>
        )
      ) : entries.length === 0 ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-sm text-zinc-400" data-testid="run-activity-empty">
          Nothing has happened on this run yet. Each step it starts and finishes, its notes, questions, approvals, reviews and pushes will show here as they happen.
        </p>
      ) : (
        <div className="relative">
          <div ref={follow.scrollRef} className="max-h-[32rem] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/30" data-testid="run-activity-scroll">
            <div ref={follow.contentRef}>
              {earlier && (
                <div className="border-b border-zinc-800 px-4 py-2">
                  <button type="button" onClick={showEarlier} disabled={loadingEarlier} className={smallSecondaryButton} data-testid="run-activity-earlier">
                    {loadingEarlier ? "Loading…" : "Show earlier"}
                  </button>
                </div>
              )}
              <ol className="divide-y divide-zinc-800/70" aria-label="Run activity, oldest first" data-testid="run-activity-list">
                {entries.map((e) => (
                  <li key={e.id} data-scroll-anchor={e.id} data-kind={e.kind} className="flex min-w-0 gap-3 px-4 py-2.5 text-sm">
                    <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[e.tone]}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-zinc-200 [overflow-wrap:anywhere]">
                        {e.link ? <EntryLink href={e.link}>{e.text}</EntryLink> : e.text}
                        {e.tone === "problem" && <span className="sr-only"> (a problem)</span>}
                      </p>
                      <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-zinc-400">
                        <span>{e.who || ACTOR_WORD[e.actor]}</span>
                        <span aria-hidden="true">·</span>
                        <Time iso={e.at} />
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <JumpToLatest visible={follow.behind} onClick={follow.toLatest} className="bottom-3" />
          {failed && (
            <div className="mt-2">
              <Problem title="Couldn't refresh this run's activity." compact tone="warning" onRetry={retry} testId="run-activity-error">
                What is shown may be out of date.
              </Problem>
            </div>
          )}
          {fromRecord && (
            <p className="mt-2 text-xs text-zinc-400" data-testid="run-activity-partial">
              Read from the run itself; approvals, reviews and pushes show once the service is updated.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
