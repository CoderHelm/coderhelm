"use client";

import { useEffect, useState, useCallback } from "react";
import { api, type HealthCheck, type HealthCheckItem } from "@/lib/api";

const STATUS_STYLES: Record<string, string> = {
  ok: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  warning: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  healthy: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  degraded: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  unhealthy: "bg-red-500/10 text-red-400 border-red-500/20",
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
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">System Health</h1>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-3 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
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
          <div className="flex items-center gap-3 mb-6">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium border ${STATUS_STYLES[health.status]}`}
            >
              {health.status}
            </span>
            <span className="text-xs text-zinc-600">
              Checked {new Date(health.checked_at).toLocaleTimeString()}
            </span>
          </div>

          <div className="space-y-4">
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
  const label: Record<string, string> = {
    crashed_runs: "Crashed Runs",
    stale_queued: "Stale Queued",
    dlq: "Dead Letter Queue",
    tickets: "Ticket Queue",
    ci_fix: "CI Fix Queue",
    feedback: "Feedback Queue",
    failed_runs_24h: "Failed Runs (24h)",
  };

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900/30 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-zinc-100">
          {label[check.name] || check.name}
        </h3>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] border ${STATUS_STYLES[check.status]}`}
        >
          {check.status}
        </span>
      </div>

      {check.depth !== undefined && (
        <p className="text-xs text-zinc-400">
          {check.depth} message{check.depth !== 1 ? "s" : ""}
        </p>
      )}

      {check.visible !== undefined && (
        <p className="text-xs text-zinc-400">
          {check.visible} visible · {check.in_flight ?? 0} in-flight
        </p>
      )}

      {check.count !== undefined && (
        <p className="text-xs text-zinc-400">{check.count} found</p>
      )}

      {check.items && check.items.length > 0 && (
        <div className="mt-3 space-y-2">
          {check.items.map((item, i) => (
            <div
              key={item.run_id || i}
              className="text-xs bg-zinc-900 border border-zinc-800 rounded px-3 py-2"
            >
              <div className="flex items-center gap-2">
                {item.status && (
                  <span className="text-zinc-500">[{item.status}]</span>
                )}
                <span className="text-zinc-300 truncate">
                  {item.title || item.run_id}
                </span>
              </div>
              {item.error && (
                <p className="text-red-400/80 mt-1 font-mono">{item.error}</p>
              )}
              {item.created_at && (
                <p className="text-zinc-600 mt-0.5">
                  {new Date(item.created_at).toLocaleString()}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
