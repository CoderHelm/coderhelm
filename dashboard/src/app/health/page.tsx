"use client";

import { CodeBlock } from "@/components/code-block";
import { Time } from "@/components/list";
import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import { api, type HealthCheck, type HealthCheckItem, type DlqMessage } from "@/lib/api";
import { ageWords, settle, type Settled } from "@/lib/health";
import { DlqProblem } from "@/components/dlq-problem";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { RoleGuard } from "@/components/role-guard";
import { StatusPill } from "@/components/status-pill";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { ChevronRightIcon } from "@/components/icons";
import { focusRing, secondaryButton } from "@/components/ui";
import { Page, PageHeader } from "@/components/page";

type Tone = "success" | "warning" | "error" | "neutral";

const CHECK_TONE: Record<string, { tone: Tone; word: string }> = {
  ok: { tone: "success", word: "OK" },
  warning: { tone: "warning", word: "Needs a look" },
  critical: { tone: "error", word: "Problem" },
};

const OVERALL: Record<string, { tone: Tone; word: string; box: string }> = {
  healthy: { tone: "success", word: "Healthy", box: "border-emerald-500/20 bg-emerald-500/5" },
  degraded: { tone: "warning", word: "Degraded", box: "border-amber-500/20 bg-amber-500/5" },
  unhealthy: { tone: "error", word: "Unhealthy", box: "border-red-500/20 bg-red-500/5" },
};

// Descriptions match what the gateway's /api/health actually measures.
const CHECK_META: Record<string, { label: string; description: string }> = {
  crashed_runs: { label: "Stuck runs", description: "Running with no update for 20 minutes. They are marked failed automatically." },
  stale_queued: { label: "Waiting runs", description: "Queued for over 30 minutes and never picked up." },
  dlq: { label: "Failed messages", description: "Your team's work that failed 3 times and was set aside." },
  tickets: { label: "Ticket queue", description: "Ticket and plan work waiting to start." },
  ci_fix: { label: "CI fix queue", description: "Jobs waiting to fix red CI." },
  feedback: { label: "Feedback queue", description: "Review comments waiting to be answered." },
  failed_runs_24h: { label: "Failed runs (24 hours)", description: "Runs that ended with an error in the last 24 hours." },
};

const RUN_STATUS: Record<string, string> = {
  failed: "Failed",
  running: "Running",
  queued: "Queued",
  completed: "Completed",
  cancelled: "Cancelled",
  closed: "Closed",
};

export default function HealthPageGuarded() {
  return <RoleGuard minRole="admin"><HealthPage /></RoleGuard>;
}

function HealthPage() {
  const [settled, setSettled] = useState<Settled>({ shown: null, pending: null });
  const health = settled.shown;
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  // `immediate`: the person asked (Check now, or acted on a message), so the
  // answer shows at once. A timed poll that changes the status shows only
  // once the next poll agrees.
  const refresh = useCallback((immediate = true) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    api
      .getHealth()
      .then((h) => {
        setSettled((prev) => settle(prev, h, immediate));
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "The request failed."))
      .finally(() => {
        inFlight.current = false;
        setChecking(false);
      });
  }, []);

  // First check once, then poll: faster while something is wrong.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const unhealthy = !!health && health.status !== "healthy";
  useEffect(() => {
    const interval = setInterval(() => refresh(false), unhealthy ? 5_000 : 30_000);
    return () => clearInterval(interval);
  }, [refresh, unhealthy]);

  const overall = health ? OVERALL[health.status] ?? OVERALL.degraded : null;

  return (
    <Page>
      <PageHeader
        title="System health"
        lead={<>Checks again every {unhealthy ? "5" : "30"} seconds.</>}
        actions={
          <button type="button" onClick={() => refresh()} disabled={checking} className={secondaryButton}>
            {checking ? "Checking..." : "Check now"}
          </button>
        }
      />
      <div className="mt-6">

      {error && (
        <div className="mb-6">
          <Callout variant="error" title="Couldn't run the health check">
            <p>{error}</p>
            <button type="button" onClick={() => refresh()} className={`mt-2 text-sm font-medium underline rounded ${focusRing}`}>
              Try again
            </button>
          </Callout>
        </div>
      )}

      {!health && !error && (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-14 w-full" />
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      )}

      {health && overall && (
        <>
          <div className={`flex flex-wrap items-center gap-3 p-4 mb-8 rounded-lg border ${overall.box}`} data-testid="health-overall">
            <StatusPill tone={overall.tone}>{overall.word}</StatusPill>
            <span className="text-sm text-zinc-500 ml-auto">
              Checked at {new Date(health.checked_at).toLocaleTimeString()}
            </span>
          </div>

          <div className="space-y-3">
            {health.checks.map((check) => (
              <CheckCard key={check.name} check={check} onRefresh={() => refresh()} />
            ))}
          </div>
        </>
      )}
      </div>
    </Page>
  );
}

function CheckCard({ check, onRefresh }: { check: HealthCheckItem; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const meta = CHECK_META[check.name] || { label: check.name.replace(/_/g, " "), description: "" };
  const tone = CHECK_TONE[check.status] ?? { tone: "neutral" as Tone, word: check.status };
  const hasItems = !!check.items && check.items.length > 0;
  const isDlq = check.name === "dlq";
  const unretryable = check.unretryable ?? 0;
  const clickable = hasItems || (isDlq && ((check.count ?? 0) > 0 || unretryable > 0));
  const panelId = `check-${check.name}`;

  const summary = isDlq
    ? dlqSummary(check.count ?? 0, check.oldest_age_secs, unretryable)
    : check.visible !== undefined
    ? `${check.visible} waiting · ${check.in_flight ?? 0} in progress`
    : check.count !== undefined
    ? `${check.count} found`
    : "";

  const header = (
    <>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-zinc-100">{meta.label}</span>
          <StatusPill tone={tone.tone}>{tone.word}</StatusPill>
        </div>
        {meta.description && <p className="text-xs text-zinc-500 mt-1">{meta.description}</p>}
      </div>
      <span className="text-sm text-zinc-400 shrink-0 tabular-nums">{summary}</span>
    </>
  );

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900/30" data-testid={`check-${check.name}`}>
      {clickable ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={panelId}
          className={`w-full flex items-center gap-3 p-4 text-left rounded-lg hover:bg-zinc-800/30 ${focusRing}`}
        >
          {header}
          <span aria-hidden="true" className={`text-zinc-500 transition-transform motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`}>
            <ChevronRightIcon />
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-3 p-4">{header}</div>
      )}

      {expanded && isDlq && (
        <div id={panelId}>
          <DlqPanel onRefresh={onRefresh} />
        </div>
      )}

      {expanded && hasItems && !isDlq && (
        <ul id={panelId} className="border-t border-zinc-800 px-4 py-3 space-y-2">
          {check.items!.map((item, i) => (
            <li
              key={item.run_id || i}
              className="flex items-start gap-3 text-sm bg-zinc-950/50 border border-zinc-800 rounded-lg px-4 py-3"
            >
              {item.status && (
                <StatusPill tone={item.status === "failed" ? "error" : "neutral"}>
                  {RUN_STATUS[item.status] ?? item.status}
                </StatusPill>
              )}
              <div className="flex-1 min-w-0">
                {item.run_id ? (
                  <Link href={`/runs/detail?id=${item.run_id}`} className={`block truncate text-zinc-200 underline-offset-2 hover:underline rounded ${focusRing}`}>
                    {item.title || `Run ${item.run_id}`}
                  </Link>
                ) : (
                  <p className="text-zinc-200 truncate">{item.title || "Untitled run"}</p>
                )}
                {item.error && <p className="mt-1 break-words text-xs text-zinc-400">{item.error}</p>}
                {item.created_at && (
                  <p className="text-zinc-500 text-xs mt-1">Started <Time iso={item.created_at} /></p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "2 messages · oldest 4 days", or what is left that can't be retried. */
function dlqSummary(count: number, oldestAge: number | null | undefined, unretryable: number): string {
  if (count > 0) {
    return `${count} message${count !== 1 ? "s" : ""} · oldest ${ageWords(oldestAge)}`;
  }
  if (unretryable > 0) return `None to retry · ${unretryable} can't be retried`;
  return "None";
}

const smallButton = `inline-flex min-h-8 items-center justify-center rounded-md border px-3 py-1 text-xs font-medium disabled:opacity-50 transition-colors ${focusRing}`;

function DlqPanel({ onRefresh }: { onRefresh: () => void }) {
  const [messages, setMessages] = useState<DlqMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const loadMessages = useCallback(() => {
    setLoading(true);
    setLoadError("");
    api
      .getDlqMessages()
      .then((r) => setMessages(r.messages))
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "The request failed."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleRedrive = async (msg: DlqMessage) => {
    setActing(msg.message_id);
    try {
      await api.redriveDlqMessage(msg.message_id);
      toast("Sent back to its queue to try again", "success");
      loadMessages();
      onRefresh();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Couldn't send it back", "error");
    } finally {
      setActing(null);
    }
  };

  const handleDelete = async (msg: DlqMessage) => {
    const ok = await confirm({
      title: "Delete this message?",
      message: "The work it describes will not be retried. This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setActing(msg.message_id);
    try {
      await api.deleteDlqMessage(msg.message_id);
      toast("Message deleted", "success");
      loadMessages();
      onRefresh();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Delete failed", "error");
    } finally {
      setActing(null);
    }
  };

  const handlePurge = async () => {
    const ok = await confirm({
      title: "Delete all failed messages?",
      message: "Every failed message for your team is deleted and none of that work will be retried. This can't be undone.",
      confirmLabel: "Delete all",
      destructive: true,
    });
    if (!ok) return;
    setActing("purge");
    try {
      await api.purgeDlq();
      toast("Failed messages deleted", "success");
      setMessages([]);
      onRefresh();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Delete failed", "error");
    } finally {
      setActing(null);
    }
  };

  const inferSource = (msg: DlqMessage) => {
    if (msg.type === "resume" || msg.source_queue.endsWith("-ci-fix")) return "CI fix";
    if (msg.type === "feedback" || msg.source_queue.endsWith("-feedback")) return "Feedback";
    return "Ticket";
  };

  if (loading) {
    return (
      <div className="border-t border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500" aria-busy="true">
        Loading failed messages...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="border-t border-zinc-800 p-4">
        <Callout variant="error" title="Couldn't load failed messages">
          <p>{loadError}</p>
          <button type="button" onClick={loadMessages} className={`mt-2 text-sm font-medium underline rounded ${focusRing}`}>
            Try again
          </button>
        </Callout>
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-800">
      {messages.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-zinc-800">
          <span className="text-xs text-zinc-500">
            {messages.length} message{messages.length !== 1 ? "s" : ""} for your team
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={loadMessages} disabled={!!acting} className={`${smallButton} border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700`}>
              Reload
            </button>
            <button type="button" onClick={() => void handlePurge()} disabled={!!acting} className={`${smallButton} border-red-500/30 bg-red-900/30 text-red-400 hover:bg-red-900/50`}>
              {acting === "purge" ? "Deleting..." : "Delete all"}
            </button>
          </div>
        </div>
      )}
      <div className="px-4 py-3 space-y-2 max-h-96 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-3">No failed messages for your team.</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.message_id} data-testid="dlq-message" className="bg-zinc-950/50 border border-zinc-800 rounded-lg px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {msg.retryable ? (
                      <StatusPill>{inferSource(msg)}</StatusPill>
                    ) : (
                      <StatusPill tone="warning">Can&apos;t be retried</StatusPill>
                    )}
                    {msg.sent_at && (
                      <span className="text-xs text-zinc-500" title={new Date(msg.sent_at).toLocaleString()}>
                        Sent {ageWords(msg.age_secs)} ago
                      </span>
                    )}
                  </div>
                  {!msg.retryable && (
                    <p className="text-sm text-amber-300/90 mt-1" data-testid="dlq-problem">
                      Can&apos;t be retried: <DlqProblem problem={msg.problem} />. Delete it; old ones are archived and removed automatically.
                    </p>
                  )}
                  <CodeBlock
                    code={typeof msg.body === "string" ? msg.body : JSON.stringify(msg.body, null, 2)}
                    lang={typeof msg.body === "string" ? "text" : "json"}
                    label="Message"
                    maxHeightClass="max-h-40"
                    className="mt-1"
                  />
                </div>
                <div className="flex gap-2 sm:flex-col shrink-0">
                  {msg.retryable && (
                    <button type="button" onClick={() => void handleRedrive(msg)} disabled={!!acting} className={`${smallButton} border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-zinc-700`}>
                      {acting === msg.message_id ? "Working..." : "Try again"}
                    </button>
                  )}
                  <button type="button" onClick={() => void handleDelete(msg)} disabled={!!acting} className={`${smallButton} border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800`}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

