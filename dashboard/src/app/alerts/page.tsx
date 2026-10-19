"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type AlertEvent } from "@/lib/api";
import { TableSkeleton } from "@/components/skeleton";
import { RoleGuard } from "@/components/role-guard";
import { useToast } from "@/components/toast";
import { Callout } from "@/components/callout";
import { linkButton, secondaryButton } from "@/components/ui";
import { Page, PageHeader } from "@/components/page";
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
  const [error, setError] = useState("");

  const load = useCallback(
    (after?: string) => {
      const first = !after;
      if (first) {
        setLoading(true);
        setError("");
      } else setLoadingMore(true);
      api
        .listAlerts(after)
        .then((r) => {
          setAlerts((prev) => (first ? r.alerts : [...prev, ...r.alerts]));
          setNext(r.next ?? null);
        })
        .catch((e) => {
          // A failed first page must not read as "no alerts yet".
          if (first) setError(e instanceof Error && e.message ? e.message : "The request failed.");
          else toast("Couldn't load more alerts. Try again.", "error");
        })
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
    <Page>
      <PageHeader
        title="Alerts"
        lead={
          <>
            Every alert Coderhelm received on your alert routes and what it did with it. Open one to share its link.{" "}
            <Link href="/settings/alerts" className={linkButton}>
              Alert routes
            </Link>
          </>
        }
      />

      <div className="mt-6">
      {loading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : error ? (
        <Callout variant="error" title="We couldn't load your alerts">
          <p>{error}</p>
          <p>
            <button type="button" onClick={() => load()} className={linkButton}>
              Try again
            </button>
          </p>
        </Callout>
      ) : alerts.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-8 text-center text-zinc-500">
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

      {next && !loading && !error && (
        <button type="button" onClick={() => load(next)} disabled={loadingMore} className={`${secondaryButton} mt-4`}>
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
      </div>
    </Page>
  );
}
