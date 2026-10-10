"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, type AlertEventDetail } from "@/lib/api";
import { Skeleton } from "@/components/skeleton";
import { RoleGuard } from "@/components/role-guard";
import { useToast } from "@/components/toast";
import { OUTCOMES, OutcomeBadge, formatWhen } from "../outcome";

export default function AlertDetailGuarded() {
  return (
    <RoleGuard minRole="member">
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <AlertDetail />
      </Suspense>
    </RoleGuard>
  );
}

function AlertDetail() {
  const id = useSearchParams().get("id") ?? "";
  const { toast } = useToast();
  const [data, setData] = useState<AlertEventDetail | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id) {
      setMissing(true);
      return;
    }
    api
      .getAlert(id)
      .then(setData)
      .catch(() => setMissing(true));
  }, [id]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("Link copied. Anyone on your team can open it.", "success");
    } catch {
      toast("Couldn't copy the link", "error");
    }
  };

  if (missing) {
    return (
      <div className="max-w-3xl text-zinc-500 border border-zinc-800 rounded-lg p-8 text-center">
        <p className="text-lg mb-2">Alert not found</p>
        <p className="text-sm">
          It may belong to another team, or it is older than 90 days.{" "}
          <Link href="/alerts" className="underline">
            All alerts
          </Link>
        </p>
      </div>
    );
  }
  if (!data) return <Skeleton className="h-40 w-full max-w-3xl" />;

  const a = data.alert;
  // This delivery's run: the first one created at or after the alert arrived.
  const received = new Date(a.received_at ?? 0).getTime();
  const own =
    a.outcome === "run_started"
      ? [...data.runs].reverse().find((r) => new Date(r.created_at ?? 0).getTime() >= received - 60_000)
      : undefined;

  return (
    <div className="max-w-3xl">
      <Link href="/alerts" className="text-xs text-zinc-500 hover:text-zinc-300">
        ← All alerts
      </Link>
      <div className="mt-3 mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-zinc-100 break-words">{a.title || "(untitled alert)"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <OutcomeBadge outcome={a.outcome} />
            <span>{formatWhen(a.received_at)}</span>
            <span className="font-mono">{a.ticket_id}</span>
          </div>
        </div>
        <button
          onClick={copyLink}
          className="shrink-0 text-sm px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors"
        >
          Copy link
        </button>
      </div>

      <div className="mb-6 p-4 rounded-lg bg-zinc-900 border border-zinc-800 text-sm">
        <p className="text-zinc-300">{OUTCOMES[a.outcome]?.detail ?? a.outcome}</p>
        <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-xs">
          <dt className="text-zinc-500">Repo</dt>
          <dd className="font-mono text-zinc-300 break-all">{a.repo}</dd>
          <dt className="text-zinc-500">Topic</dt>
          <dd className="font-mono text-zinc-300 break-all">{a.topic_arn}</dd>
          <dt className="text-zinc-500">Source</dt>
          <dd className="text-zinc-300">{a.kind}</dd>
        </dl>
      </div>

      <h2 className="text-sm font-semibold text-zinc-200 mb-2">Runs for this alert</h2>
      {data.runs.length === 0 ? (
        <p className="text-sm text-zinc-500 mb-6">No runs.</p>
      ) : (
        <ul className="mb-6 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
          {data.runs.map((r) => (
            <li key={r.run_id} className="px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
              <Link href={`/runs/detail?id=${r.run_id}`} className="text-zinc-100 hover:underline">
                {formatWhen(r.created_at)}
              </Link>
              <span className="text-xs text-zinc-400">{r.status}</span>
              {own?.run_id === r.run_id && (
                <span className="text-[10px] text-emerald-400 border border-emerald-500/30 rounded px-1.5 py-0.5">
                  started by this alert
                </span>
              )}
              {r.pr_url && (
                <a href={r.pr_url} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline">
                  Pull request ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2 className="text-sm font-semibold text-zinc-200 mb-2">Alert</h2>
      <pre className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 whitespace-pre-wrap break-words overflow-x-auto">
        {a.body || "(empty)"}
      </pre>
    </div>
  );
}
