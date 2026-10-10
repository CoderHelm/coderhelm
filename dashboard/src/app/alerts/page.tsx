"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type AlertEvent } from "@/lib/api";
import { TableSkeleton } from "@/components/skeleton";
import { RoleGuard } from "@/components/role-guard";
import { useToast } from "@/components/toast";
import { OutcomeBadge, formatWhen } from "./outcome";

export default function AlertsHistoryGuarded() {
  return (
    <RoleGuard minRole="member">
      <AlertsHistory />
    </RoleGuard>
  );
}

function AlertsHistory() {
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(
    (after?: string) => {
      const first = !after;
      if (first) setLoading(true);
      else setLoadingMore(true);
      api
        .listAlerts(after)
        .then((r) => {
          setAlerts((prev) => (first ? r.alerts : [...prev, ...r.alerts]));
          setNext(r.next ?? null);
        })
        .catch(() => toast("Failed to load alerts", "error"))
        .finally(() => {
          setLoading(false);
          setLoadingMore(false);
        });
    },
    [toast],
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Alerts</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Every alert CoderHelm received on your alert routes and what it did with it. Open one to share its link.{" "}
          <Link href="/settings/alerts" className="text-zinc-400 hover:text-zinc-200 underline">
            Alert routes
          </Link>
        </p>
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : alerts.length === 0 ? (
        <div className="text-zinc-500 border border-zinc-800 rounded-lg p-8 text-center">
          <p className="text-lg mb-2">No alerts yet</p>
          <p className="text-sm">Alerts appear here once a topic mapped in Alert routes publishes one.</p>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Alert</th>
                <th className="px-4 py-3 font-medium">Outcome</th>
                <th className="px-4 py-3 font-medium">Repo</th>
                <th className="px-4 py-3 font-medium">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {alerts.map((a) => (
                <tr key={a.id} className="hover:bg-zinc-900/50">
                  <td className="px-4 py-3 max-w-md">
                    <Link href={`/alerts/detail?id=${a.id}`} className="text-zinc-100 hover:underline font-medium">
                      {a.title || "(untitled alert)"}
                    </Link>
                    <div className="text-[11px] text-zinc-500 font-mono mt-0.5">{a.ticket_id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <OutcomeBadge outcome={a.outcome} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">{a.repo}</td>
                  <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{formatWhen(a.received_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {next && !loading && (
        <button
          onClick={() => load(next)}
          disabled={loadingMore}
          className="mt-4 text-sm px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
