"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, api, type AdminDlqList, type AdminDlqMessage } from "@/lib/api";
import { ageWords } from "@/lib/health";
import { DlqProblem } from "@/components/dlq-problem";
import { Page, PageHeader } from "@/components/page";
import { Skeleton } from "@/components/skeleton";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { buttonClass, secondaryButton } from "@/components/ui";
import { Problem, TechnicalDetails } from "@/components/problem";
import { EmptyState } from "@/components/empty-state";

/** "TEAM#team-a" -> "team-a": the database key's readable part. */
function teamName(id: string): string {
  return id.replace(/^TEAM#/, "");
}

/** "SkillSync" or "ci_fix" -> "Skill sync" / "Ci fix". */
function typeWords(t: string | null | undefined): string {
  if (!t) return "Unknown";
  const words = t.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The shared dead-letter queue, for the platform admin: every team's failed
 * messages, the global jobs', and the ones nobody can read. Teams see only
 * their own on the health page; what counts for no team is shown here only.
 */
export default function SharedQueuePage() {
  const [data, setData] = useState<AdminDlqList | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api
      .adminDlq()
      .then(setData)
      .catch((e: unknown) => {
        // The server decides who is a platform admin: anyone else gets a 403.
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setDenied(true);
        else setError(e instanceof Error ? e.message : "The request failed.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (m: AdminDlqMessage) => {
    const ok = await confirm({
      title: "Delete this message?",
      message: "It is removed from the shared queue and its work is not retried. This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setActing(m.message_id);
    try {
      await api.adminDlqDelete(m.message_id);
      toast("Message deleted", "success");
      load();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Delete failed", "error");
    } finally {
      setActing(null);
    }
  };

  if (denied) {
    return (
      <Page>
        <PageHeader detail crumb={false} title="Access denied" lead="This page is only for Coderhelm platform administrators." />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Shared queue"
        lead={queueLead(data)}
        actions={
          <button type="button" onClick={load} disabled={loading} className={secondaryButton}>
            {loading ? "Loading…" : "Reload"}
          </button>
        }
      />
      <div className="mt-6 space-y-4">
        {error && (
          <Problem title="Couldn't read the shared queue" onRetry={load} details={error}>
            Check your connection and try again.
          </Problem>
        )}

        {!data && loading && (
          <div className="space-y-3" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        )}

        {data && (
          <>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="queue-counts">
              <Count label="Messages" value={data.count ?? data.messages.length} />
              <Count label="For no team" value={data.shared ?? 0} hint="Can't be read, global jobs, or no team" />
              <Count label="Can't be read" value={data.unreadable ?? 0} />
            </dl>
            {!data.complete && (
              <p className="text-xs text-zinc-400">The queue holds more than one listing reads; reload to see the rest.</p>
            )}
            {data.messages.length === 0 ? (
              <EmptyState title="The shared queue is empty">No team has failed work waiting here.</EmptyState>
            ) : (
              <ul className="space-y-2">
                {data.messages.map((m) => (
                  <li key={m.message_id} data-testid="queue-message" className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          {m.retryable ? (
                            <StatusPill>{typeWords(m.type)}</StatusPill>
                          ) : (
                            <StatusPill tone="warning">Can&apos;t be retried</StatusPill>
                          )}
                          <span className="wrap-anywhere text-sm font-medium text-zinc-200" title={m.team_id ?? undefined}>
                            {m.team_id ? teamName(m.team_id) : m.global ? "Global job" : "No team"}
                          </span>
                          {m.sent_at && <span className="text-xs text-zinc-400">· sent {ageWords(m.age_secs)} ago</span>}
                        </div>
                        {m.problem && (
                          <p className="mt-1 text-sm text-amber-300/90">
                            Can&apos;t be retried: <DlqProblem problem={m.problem} />
                          </p>
                        )}
                        <TechnicalDetails
                          summary="Message body"
                          text={typeof m.body === "string" ? m.body : JSON.stringify(m.body, null, 2)}
                          lang={typeof m.body === "string" ? "text" : "json"}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void remove(m)}
                        disabled={!!acting}
                        className={`${buttonClass("ghost", "sm")} shrink-0 self-start`}
                      >
                        {acting === m.message_id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Page>
  );
}

function Count({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-zinc-100">{value}</dd>
      {hint && <p className="mt-1 text-xs text-zinc-400">{hint}</p>}
    </div>
  );
}

/**
 * The lead, with only the clauses the server answered: an older gateway
 * leaves the retention fields out, and a missing number must never print as
 * "undefined".
 */
function queueLead(data: { cleanup_after_days?: number | null; retention_days?: number | string | null } | null | undefined): string {
  const parts = ["Failed messages from every team."];
  const days = typeof data?.cleanup_after_days === "number" ? data.cleanup_after_days : null;
  const kept = data?.retention_days;
  if (days !== null) parts.push(`Messages the worker can't read are archived and removed after ${days} day${days === 1 ? "" : "s"}.`);
  if (typeof kept === "number") parts.push(`The queue drops anything after ${kept} day${kept === 1 ? "" : "s"}.`);
  else if (typeof kept === "string" && kept.trim()) parts.push(`The queue drops anything after ${kept}.`);
  return parts.join(" ");
}
