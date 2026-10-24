"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, type AdminDlqList, type AdminDlqMessage } from "@/lib/api";
import { ageWords } from "@/lib/health";
import { DlqProblem } from "@/components/dlq-problem";
import { CodeBlock } from "@/components/code-block";
import { Page, PageHeader } from "@/components/page";
import { Skeleton } from "@/components/skeleton";
import { StatusPill } from "@/components/status-pill";
import { Callout } from "@/components/callout";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { focusRing, secondaryButton } from "@/components/ui";

const smallButton = `inline-flex min-h-8 items-center justify-center rounded-md border px-3 py-1 text-xs font-medium disabled:opacity-50 transition-colors ${focusRing}`;

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
        lead={
          data
            ? `Failed messages from every team. Messages the worker can't read are archived and removed after ${data.cleanup_after_days} days; the queue drops anything after ${data.retention_days}.`
            : "Failed messages from every team."
        }
        actions={
          <div className="flex gap-2">
            <Link href="/admin" className={secondaryButton}>
              Platform admin
            </Link>
            <button type="button" onClick={load} disabled={loading} className={secondaryButton}>
              {loading ? "Loading..." : "Reload"}
            </button>
          </div>
        }
      />
      <div className="mt-6 space-y-4">
        {error && (
          <Callout variant="error" title="Couldn't read the shared queue">
            <p>{error}</p>
          </Callout>
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
              <Count label="Messages" value={data.count} />
              <Count label="For no team" value={data.shared} hint="Can't be read, global jobs, or no team" />
              <Count label="Can't be read" value={data.unreadable} />
            </dl>
            {!data.complete && (
              <p className="text-xs text-zinc-500">The queue holds more than one listing reads; reload to see the rest.</p>
            )}
            {data.messages.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-500">The shared queue is empty.</p>
            ) : (
              <ul className="space-y-2">
                {data.messages.map((m) => (
                  <li key={m.message_id} data-testid="queue-message" className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          {m.retryable ? (
                            <StatusPill>{m.type}</StatusPill>
                          ) : (
                            <StatusPill tone="warning">Can&apos;t be retried</StatusPill>
                          )}
                          <span className="break-all text-xs text-zinc-400">{m.team_id ?? (m.global ? "Global job" : "No team")}</span>
                          {m.sent_at && <span className="text-xs text-zinc-500">· sent {ageWords(m.age_secs)} ago</span>}
                        </div>
                        {m.problem && (
                          <p className="mt-1 text-sm text-amber-300/90">
                            Can&apos;t be retried: <DlqProblem problem={m.problem} />
                          </p>
                        )}
                        <CodeBlock
                          code={typeof m.body === "string" ? m.body : JSON.stringify(m.body, null, 2)}
                          lang={typeof m.body === "string" ? "text" : "json"}
                          label="Message"
                          maxHeightClass="max-h-40"
                          className="mt-1"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void remove(m)}
                        disabled={!!acting}
                        className={`${smallButton} shrink-0 border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800`}
                      >
                        {acting === m.message_id ? "Deleting..." : "Delete"}
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
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-zinc-100">{value}</dd>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
