"use client";

import { CodeBlock, jsonOrText } from "@/components/code-block";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, type AlertEventDetail, errorStatus } from "@/lib/api";
import { Skeleton } from "@/components/skeleton";
import { RoleGuard } from "@/components/role-guard";
import { useToast } from "@/components/toast";
import { Callout } from "@/components/callout";
import { RunStatusBadge } from "@/components/run-status";
import { linkButton, secondaryButton } from "@/components/ui";
import { Page, PageHeader, cardClass } from "@/components/page";
import { KIND_LABEL, OUTCOMES, OutcomeBadge, formatWhen, humanize } from "../outcome";

export default function AlertDetailGuarded() {
  return (
    <RoleGuard minRole="member">
      <Suspense fallback={<Page><Skeleton className="h-40 w-full" /></Page>}>
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
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setData(null);
    setMissing(false);
    setError("");
    if (!id) return;
    api
      .getAlert(id)
      .then(setData)
      .catch((e) => {
        // Only a 404 (or an id that isn't one) means the alert isn't there.
        // Anything else is a failed request the person can retry.
        const msg = e instanceof Error ? e.message : "";
        const status = errorStatus(e);
        if (status === 400 || status === 404) setMissing(true);
        else setError(msg || "The request failed.");
      });
  }, [id, attempt]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("Link copied. Anyone on your team can open it.", "success");
    } catch {
      toast("Couldn't copy the link", "error");
    }
  };

  if (!id || missing) {
    return (
      <Page>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-8 text-center text-zinc-500">
        <p className="text-lg mb-2">{id ? "Alert not found" : "No alert was named"}</p>
        <p className="text-sm">
          {id ? "It may belong to another team, or it is older than 90 days. " : "Pick one from the list. "}
          <Link href="/alerts" className={linkButton}>
            All alerts
          </Link>
        </p>
      </div>
      </Page>
    );
  }
  if (error) {
    return (
      <Page>
        <Callout variant="error" title="We couldn't load this alert">
          <p>{error}</p>
          <p>
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className={linkButton}>
              Try again
            </button>{" "}
            or go back to <Link href="/alerts" className={linkButton}>all alerts</Link>.
          </p>
        </Callout>
      </Page>
    );
  }
  if (!data) return <Page><Skeleton className="h-40 w-full" /></Page>;

  const a = data.alert;
  // This delivery's run: the first one created at or after the alert arrived.
  const received = new Date(a.received_at ?? 0).getTime();
  const own =
    a.outcome === "run_started"
      ? [...data.runs].reverse().find((r) => new Date(r.created_at ?? 0).getTime() >= received - 60_000)
      : undefined;

  return (
    <Page>
      <PageHeader
        detail
        title={a.title || "(untitled alert)"}
        lead={
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <OutcomeBadge outcome={a.outcome} />
            <span>{formatWhen(a.received_at)}</span>
            <span className="font-mono">{a.ticket_id}</span>
          </div>
        }
        actions={
          <button type="button" onClick={copyLink} className={`${secondaryButton} shrink-0`}>
            Copy link
          </button>
        }
      />

      <div className={`mt-6 mb-6 text-sm ${cardClass}`}>
        <p className="text-zinc-300">{OUTCOMES[a.outcome]?.detail ?? a.outcome}</p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <dt className="text-zinc-500">Repo</dt>
          <dd className="font-mono text-zinc-300 break-all">{a.repo || "—"}</dd>
          <dt className="text-zinc-500">Topic</dt>
          <dd className="font-mono text-zinc-300 break-all">{a.topic_arn || "—"}</dd>
          <dt className="text-zinc-500">Source</dt>
          <dd className="text-zinc-300">{a.kind ? KIND_LABEL[a.kind] ?? humanize(a.kind) : "—"}</dd>
        </dl>
      </div>

      <h2 className="text-sm font-semibold text-zinc-200 mb-2">Runs for this alert</h2>
      {data.runs.length === 0 ? (
        <p className="text-sm text-zinc-500 mb-6">No runs.</p>
      ) : (
        <ul className="mb-6 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
          {data.runs.map((r) => (
            <li key={r.run_id} className="px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
              <Link href={`/runs/detail?id=${encodeURIComponent(r.run_id)}`} className="text-zinc-100 hover:underline">
                {formatWhen(r.created_at)}
              </Link>
              <RunStatusBadge status={r.status} />
              {own?.run_id === r.run_id && (
                <span className="text-[10px] text-emerald-400 border border-emerald-500/30 rounded px-1.5 py-0.5">
                  started by this alert
                </span>
              )}
              {r.pr_url && (
                <a href={r.pr_url} target="_blank" rel="noreferrer" className={linkButton}>
                  Pull request<span aria-hidden="true"> ↗</span>
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2 className="text-sm font-semibold text-zinc-200 mb-2">Alert</h2>
      {a.body ? <CodeBlock {...jsonOrText(a.body)} label="Alert" wrap /> : <p className="text-sm text-zinc-500">The alert had no text.</p>}
    </Page>
  );
}
