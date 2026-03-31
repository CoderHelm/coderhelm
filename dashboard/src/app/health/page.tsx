"use client";

import { useEffect, useState, useCallback } from "react";
import { api, type HealthCheck, type HealthCheckItem } from "@/lib/api";

const STATUS_COLOR: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  ok: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", dot: "bg-emerald-400" },
  warning: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-500/20", dot: "bg-yellow-400" },
  critical: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20", dot: "bg-red-400" },
  healthy: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", dot: "bg-emerald-400" },
  degraded: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-500/20", dot: "bg-yellow-400" },
  unhealthy: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20", dot: "bg-red-400" },
};

const CHECK_META: Record<string, { label: string; description: string }> = {
  crashed_runs: { label: "Crashed Runs", description: "Running for >10 min — worker likely died" },
  stale_queued: { label: "Stale Queued", description: "Queued for >30 min — never picked up" },
  dlq: { label: "Dead Letter Queue", description: "Messages that failed processing 3 times" },
  tickets: { label: "Ticket Queue", description: "Pending ticket/plan work items" },
  ci_fix: { label: "CI Fix Queue", description: "Pending CI self-healing jobs" },
  feedback: { label: "Feedback Queue", description: "Pending user feedback processing" },
  failed_runs_24h: { label: "Failed Runs (24h)", description: "Runs that errored in the last 24 hours" },
};

export default function HealthPage() {
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getHealth()
      .then(setHealth)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    // Poll faster (5s) when unhealthy/degraded, normal (30s) otherwise
    const ms = health && health.status !== "healthy" ? 5_000 : 30_000;
    const interval = setInterval(refresh, ms);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, health?.status]);

  const s = health ? STATUS_COLOR[health.status] || STATUS_COLOR.ok : STATUS_COLOR.ok;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">System Health</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Auto-refreshes every {health && health.status !== "healthy" ? "5" : "30"} seconds
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-4 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Checking..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="p-4 mb-6 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {health && (
        <>
          {/* Overall status banner */}
          <div className={`flex items-center gap-3 p-4 mb-8 rounded-lg border ${s.bg} ${s.border}`}>
            <span className={`h-3 w-3 rounded-full ${s.dot} ${health.status !== "healthy" ? "animate-pulse" : ""}`} />
            <span className={`text-base font-semibold capitalize ${s.text}`}>
              {health.status}
            </span>
            <span className="text-sm text-zinc-500 ml-auto">
              {new Date(health.checked_at).toLocaleTimeString()}
            </span>
          </div>

          <div className="space-y-3">
            {health.checks.map((check) => (
              <CheckCard key={check.name} check={check} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CheckCard({ check }: { check: HealthCheckItem }) {
  const [expanded, setExpanded] = useState(false);
  const meta = CHECK_META[check.name] || { label: check.name, description: "" };
  const sc = STATUS_COLOR[check.status] || STATUS_COLOR.ok;
  const hasItems = check.items && check.items.length > 0;
  const clickable = hasItems || (check.depth !== undefined && check.depth > 0);

  const summary = check.depth !== undefined
    ? `${check.depth} message${check.depth !== 1 ? "s" : ""}`
    : check.visible !== undefined
    ? `${check.visible} visible · ${check.in_flight ?? 0} in-flight`
    : check.count !== undefined
    ? `${check.count} found`
    : "";

  return (
    <div className={`border rounded-lg bg-zinc-900/30 transition-colors ${sc.border}`}>
      <button
        type="button"
        onClick={() => clickable && setExpanded(!expanded)}
        className={`w-full flex items-center gap-4 p-4 text-left ${clickable ? "cursor-pointer hover:bg-zinc-800/30" : "cursor-default"}`}
      >
        {/* Status dot */}
        <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${sc.dot}`} />

        {/* Label + description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-zinc-100">{meta.label}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${sc.bg} ${sc.text}`}>
              {check.status}
            </span>
          </div>
          {meta.description && (
            <p className="text-xs text-zinc-500 mt-0.5">{meta.description}</p>
          )}
        </div>

        {/* Count */}
        <span className="text-sm text-zinc-400 flex-shrink-0">{summary}</span>

        {/* Expand arrow */}
        {clickable && (
          <span className={`text-zinc-600 transition-transform ${expanded ? "rotate-180" : ""}`}>
            ▾
          </span>
        )}
      </button>

      {expanded && hasItems && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-2">
          {check.items!.map((item, i) => (
            <div
              key={item.run_id || i}
              className="flex items-start gap-3 text-sm bg-zinc-950/50 border border-zinc-800 rounded-lg px-4 py-3"
            >
              {item.status && (
                <span className={`px-2 py-0.5 rounded text-xs flex-shrink-0 ${
                  item.status === "failed"
                    ? "bg-red-500/10 text-red-400"
                    : item.status === "running"
                    ? "bg-blue-500/10 text-blue-400"
                    : "bg-zinc-800 text-zinc-400"
                }`}>
                  {item.status}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-zinc-200 truncate">{item.title || item.run_id}</p>
                {item.error && (
                  <p className="text-red-400/80 text-xs mt-1 font-mono truncate">{item.error}</p>
                )}
                {item.created_at && (
                  <p className="text-zinc-600 text-xs mt-1">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
