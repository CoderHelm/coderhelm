"use client";

import { useState } from "react";
import Link from "next/link";
import { api, type Run } from "@/lib/api";
import { TableSkeleton } from "@/components/skeleton";
import { usePagedList, LoadMoreButton } from "@/components/load-more";
import { Callout } from "@/components/callout";
import { RunStatusBadge } from "@/components/run-status";
import { focusRing, secondaryButton } from "@/components/ui";

interface RunGroup {
  ticket_id: string;
  attempts: Run[]; // oldest first
}

function formatTimeAgo(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "—";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** 754 → "12m 34s"; the list showed raw seconds before. */
function formatDuration(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function runTitle(run: Run): string {
  return run.title || run.ticket_id || "Untitled run";
}

function groupRunsByTicket(runs: Run[]): RunGroup[] {
  const map = new Map<string, Run[]>();
  for (const run of runs) {
    const key = run.ticket_id || run.run_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(run);
  }
  // Sort attempts newest-first within each group
  const groups: RunGroup[] = [];
  for (const [ticket_id, attempts] of map) {
    attempts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    groups.push({ ticket_id, attempts });
  }
  // Sort groups by latest attempt descending
  groups.sort((a, b) => {
    const aLatest = new Date(a.attempts[0].created_at).getTime();
    const bLatest = new Date(b.attempts[0].created_at).getTime();
    return bLatest - aLatest;
  });
  return groups;
}

export default function RunsPage() {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const {
    items: runs,
    next,
    loading,
    loadingMore,
    error,
    moreFailed,
    loadMore,
    reload,
  } = usePagedList<Run>((cursor) => api.listRuns(cursor).then((d) => ({ items: d.runs, next: d.next })), []);

  const groups = groupRunsByTicket(runs);

  const toggleGroup = (ticketId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  };

  return (
    <div>
         <div className="mb-8">
           <h1 className="text-2xl font-bold text-zinc-100">Runs</h1>
           <p className="text-sm text-zinc-500 mt-1">
             All agent runs across your repositories.
           </p>
         </div>
      {loading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : error ? (
        <Callout variant="error" title="Runs could not be loaded">
          <p>The server did not answer. Try again in a moment.</p>
          <button type="button" onClick={reload} className={`${secondaryButton} mt-2`}>
            Try again
          </button>
        </Callout>
      ) : runs.length === 0 ? (
        <div className="text-zinc-500 border border-zinc-800 rounded-lg p-8 text-center">
          <p className="text-lg text-zinc-300 mb-2">No runs yet</p>
          <p className="text-sm">
            Assign a GitHub issue to the Coderhelm bot, add the <code className="text-zinc-300">coderhelm</code> label to it, or
            send a Jira ticket to start a run.
          </p>
          <p className="text-sm mt-2">
            Or{" "}
            <Link href="/plans/new" className={`text-zinc-300 underline underline-offset-4 hover:text-zinc-100 rounded ${focusRing}`}>
              write a plan
            </Link>{" "}
            and let Coderhelm do the tasks.
          </p>
        </div>
      ) : (
        <div className="relative border border-zinc-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-left">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Title</th>
                <th scope="col" className="hidden sm:table-cell px-4 py-3 font-medium">Repo</th>
                <th scope="col" className="hidden sm:table-cell px-4 py-3 font-medium">Status</th>
                <th scope="col" className="hidden sm:table-cell px-4 py-3 font-medium">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {groups.map((group) => {
                const latest = group.attempts[0];
                const hasMultiple = group.attempts.length > 1;
                const isExpanded = expandedGroups.has(group.ticket_id);

                return (
                  <TicketGroup
                    key={group.ticket_id}
                    group={group}
                    latest={latest}
                    hasMultiple={hasMultiple}
                    isExpanded={isExpanded}
                    onToggle={() => toggleGroup(group.ticket_id)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <LoadMoreButton hasMore={!!next} loading={loadingMore} onClick={loadMore} failed={moreFailed} />
    </div>
  );
}

function TicketGroup({
  group,
  latest,
  hasMultiple,
  isExpanded,
  onToggle,
}: {
  group: RunGroup;
  latest: Run;
  hasMultiple: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      {/* Latest attempt row */}
      <tr className="hover:bg-zinc-900/50">
        <td className="px-4 py-3">
          <div className="flex items-start gap-2">
            {hasMultiple && (
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={isExpanded}
                aria-label={`${isExpanded ? "Hide" : "Show"} ${group.attempts.length - 1} earlier attempt${group.attempts.length === 2 ? "" : "s"}`}
                className={`mt-0.5 rounded text-zinc-500 hover:text-zinc-300 transition-colors shrink-0 ${focusRing}`}
              >
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            <div className="min-w-0">
              <Link
                href={`/runs/detail?id=${encodeURIComponent(latest.run_id)}`}
                className={`text-zinc-100 hover:underline font-medium break-words rounded ${focusRing}`}
              >
                {runTitle(latest)}
              </Link>
              {hasMultiple && (
                <span className="ml-2 text-[10px] text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5 whitespace-nowrap">
                  {group.attempts.length} attempts
                </span>
              )}
              {/* On a phone the status, repo and time columns are hidden; show them here. */}
              <div className="sm:hidden mt-1.5 space-y-1.5 text-xs text-zinc-500">
                <RunStatusBadge status={latest.status} />
                <p>
                  <span className="font-mono break-all">{latest.repo}</span>
                  {" · "}
                  <span className="whitespace-nowrap">{formatTimeAgo(latest.created_at)}</span>
                </p>
              </div>
            </div>
          </div>
        </td>
        <td className="hidden sm:table-cell px-4 py-3 text-zinc-400 font-mono text-xs break-all">{latest.repo}</td>
        <td className="hidden sm:table-cell px-4 py-3">
          <RunStatusBadge status={latest.status} />
        </td>
        <td className="hidden sm:table-cell px-4 py-3 whitespace-nowrap">
          <time dateTime={latest.created_at} title={new Date(latest.created_at).toLocaleString()} className="text-zinc-400 text-xs">
            {formatTimeAgo(latest.created_at)}
          </time>
          {latest.duration_s != null && latest.duration_s > 0 && (
            <span className="block text-zinc-600 text-xs">took {formatDuration(latest.duration_s)}</span>
          )}
        </td>
      </tr>

      {/* Previous attempts (collapsed by default) */}
      {hasMultiple && isExpanded &&
        group.attempts.slice(1).map((run, i) => (
          <tr key={run.run_id} className="bg-zinc-950/50 hover:bg-zinc-900/30">
            <td className="px-4 py-2 pl-10">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-zinc-600 font-mono">#{group.attempts.length - i - 1}</span>
                <Link
                  href={`/runs/detail?id=${encodeURIComponent(run.run_id)}`}
                  className={`text-zinc-500 hover:text-zinc-300 hover:underline text-xs break-words rounded ${focusRing}`}
                >
                  {runTitle(run)}
                </Link>
                <span className="sm:hidden"><RunStatusBadge status={run.status} /></span>
              </div>
            </td>
            <td className="hidden sm:table-cell px-4 py-2 text-zinc-600 font-mono text-xs break-all">{run.repo}</td>
            <td className="hidden sm:table-cell px-4 py-2">
              <RunStatusBadge status={run.status} />
            </td>
            <td className="hidden sm:table-cell px-4 py-2 whitespace-nowrap">
              <time dateTime={run.created_at} title={new Date(run.created_at).toLocaleString()} className="text-zinc-600 text-xs">
                {formatTimeAgo(run.created_at)}
              </time>
              {run.duration_s != null && run.duration_s > 0 && (
                <span className="block text-zinc-600 text-xs">took {formatDuration(run.duration_s)}</span>
              )}
            </td>
          </tr>
        ))}
    </>
  );
}
