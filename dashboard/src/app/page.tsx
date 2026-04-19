"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Run } from "@/lib/api";
import { TableSkeleton } from "@/components/skeleton";

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
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.listRuns()
      .then((data) => setRuns(data.runs))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

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
           <h1 className="text-xl font-semibold text-zinc-100">Runs</h1>
           <p className="text-sm text-zinc-500 mt-1">
             All agent runs across your repositories.
           </p>
         </div>
      {loading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : error ? (
        <div className="text-red-400 border border-red-500/20 bg-red-500/5 rounded-lg p-8 text-center">
          <p className="text-sm">Failed to load runs. Please refresh.</p>
        </div>
      ) : runs.length === 0 ? (
        <div className="text-zinc-500 border border-zinc-800 rounded-lg p-8 text-center">
          <p className="text-lg mb-2">No runs yet</p>
          <p className="text-sm">Assign an issue to the Coderhelm bot to start a run.</p>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Repo</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">PR</th>
                <th className="px-4 py-3 font-medium">Time</th>
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
      <tr className="hover:bg-zinc-900/50 cursor-pointer">
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {hasMultiple && (
              <button
                onClick={onToggle}
                className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
              >
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            <div>
              <Link href={`/runs/detail?id=${latest.run_id}`} className="text-zinc-100 hover:underline font-medium">
                {latest.title}
              </Link>
              {hasMultiple && (
                <span className="ml-2 text-[10px] text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5">
                  {group.attempts.length} attempts
                </span>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{latest.repo}</td>
        <td className="px-4 py-3">
          <StatusBadge status={latest.status} />
        </td>
        <td className="px-4 py-3">
          {latest.pr_number ? (
            <Link
              href={`https://github.com/${latest.repo}/pull/${latest.pr_number}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 hover:underline text-xs"
            >
              #{latest.pr_number}
            </Link>
          ) : (
            <span className="text-zinc-600 text-xs">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          <time title={new Date(latest.created_at).toLocaleString()} className="text-zinc-400 text-xs">
            {formatTimeAgo(latest.created_at)}
          </time>
          {latest.duration_s && (
            <span className="block text-zinc-600 text-xs">{latest.duration_s}s</span>
          )}
        </td>
      </tr>

      {/* Previous attempts (collapsed by default) */}
      {hasMultiple && isExpanded &&
        group.attempts.slice(1).map((run, i) => (
          <tr key={run.run_id} className="bg-zinc-950/50 hover:bg-zinc-900/30">
            <td className="px-4 py-2 pl-10">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-600 font-mono">#{group.attempts.length - i - 1}</span>
                <Link href={`/runs/detail?id=${run.run_id}`} className="text-zinc-500 hover:text-zinc-300 hover:underline text-xs">
                  {run.title}
                </Link>
              </div>
            </td>
            <td className="px-4 py-2 text-zinc-600 font-mono text-xs">{run.repo}</td>
            <td className="px-4 py-2">
              <StatusBadge status={run.status} />
            </td>
            <td className="px-4 py-2">
              <time title={new Date(run.created_at).toLocaleString()} className="text-zinc-600 text-xs">
                {formatTimeAgo(run.created_at)}
              </time>
              {run.duration_s && (
                <span className="block text-zinc-600 text-xs">{run.duration_s}s</span>
              )}
            </td>
          </tr>
        ))}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
   const map: Record<string, { dot: string; text: string; bg: string }> = {
     running: { dot: "bg-blue-400", text: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
     awaiting_ci: { dot: "bg-cyan-400", text: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
     completed: { dot: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
     failed: { dot: "bg-red-400", text: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
     pending: { dot: "bg-yellow-400", text: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
     cancelled: { dot: "bg-amber-400", text: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
   };
   const s = map[status] ?? { dot: "bg-zinc-500", text: "text-zinc-400", bg: "bg-zinc-800 border-zinc-700" };
   return (
     <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${s.bg} ${s.text}`}>
       <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${status === "running" || status === "awaiting_ci" ? "animate-pulse" : ""}`} />
       {status === "awaiting_ci" ? "Awaiting CI" : status}
     </span>
   );
}
