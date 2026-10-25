"use client";

import { ListSkeleton, Time } from "@/components/list";
import { Problem, TechnicalDetails } from "@/components/problem";
import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import { api, type HealthCheck, type HealthCheckItem, type DlqMessage } from "@/lib/api";
import { ageWords, settle, type Settled } from "@/lib/health";
import { DlqProblem } from "@/components/dlq-problem";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { RoleGuard } from "@/components/role-guard";
import { StatusPill } from "@/components/status-pill";
import { Skeleton } from "@/components/skeleton";
import { ChevronRightIcon } from "@/components/icons";
import { buttonClass, focusRing, secondaryButton, smallDangerButton, smallSecondaryButton } from "@/components/ui";
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
  return <RoleGuard need="system"><HealthPage /></RoleGuard>;
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
        lead="Whether Coderhelm's work for your team is flowing normally: runs, queues and failed messages."
        actions={
          <button type="button" onClick={() => refresh()} disabled={checking} className={secondaryButton}>
            {checking ? "Checking..." : "Check now"}
          </button>
        }
      />
      <div className="mt-6">

      {error && (
        <div className="mb-6">
          <Problem title="Couldn't run the health check" onRetry={() => refresh()} details={error}>
            Check your connection and try again. Nothing about your runs changed.
          </Problem>
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
          <div className={`mb-8 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border p-4 ${overall.box}`} data-testid="health-overall">
            <StatusPill tone={overall.tone}>{overall.word}</StatusPill>
            <p className="min-w-0 flex-1 basis-60 text-sm text-zinc-200">{overallSentence(health.checks)}</p>
            <span className="text-xs text-zinc-400">
              Checked at {new Date(health.checked_at).toLocaleTimeString()} · again every {unhealthy ? "5" : "30"} seconds
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

/** One sentence that names what needs a look, so the banner says what to do. */
function overallSentence(checks: HealthCheckItem[]): string {
  const bad = checks.filter((c) => c.status === "warning" || c.status === "critical");
  if (bad.length === 0) return "Everything is running normally.";
  const names = bad.map((c) => (CHECK_META[c.name]?.label ?? c.name.replace(/_/g, " ")).toLowerCase());
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${bad.length === 1 ? "1 thing needs" : `${bad.length} things need`} a look: ${list}. Open ${bad.length === 1 ? "it" : "them"} below to review.`;
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
  const needsLook = clickable && (check.status === "warning" || check.status === "critical");

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
        {meta.description && <p className="text-xs text-zinc-400 mt-1">{meta.description}</p>}
      </div>
      {/* Under the description on a phone; beside it, in up to 45% of the row, from sm: up. */}
      <span className="min-w-0 basis-full text-sm tabular-nums text-zinc-400 sm:max-w-[45%] sm:basis-auto sm:text-right">{summary}</span>
      {needsLook && (
        <span aria-hidden="true" className="text-sm font-medium text-zinc-100 underline underline-offset-4">
          Review
        </span>
      )}
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
          className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg p-4 text-left hover:bg-zinc-800/30 sm:flex-nowrap ${focusRing}`}
        >
          {header}
          <span aria-hidden="true" className={`text-zinc-500 transition-transform motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`}>
            <ChevronRightIcon />
          </span>
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4 sm:flex-nowrap">{header}</div>
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
                {item.error && <p className="mt-1 text-xs text-zinc-400">{item.error}</p>}
                {item.created_at && (
                  <p className="text-zinc-400 text-xs mt-1">Started <Time iso={item.created_at} /></p>
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
      toast("Sent back to try again", "success");
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

  /** What the work was, in a line: "Ticket WEB-123 for web". */
  const messageSummary = (msg: DlqMessage): string => {
    const body = typeof msg.body === "object" && msg.body ? (msg.body as Record<string, unknown>) : null;
    const str = (k: string) => (body && typeof body[k] === "string" ? (body[k] as string) : "");
    const kind = inferSource(msg);
    const ticket = str("ticket_id") || str("ticket") || str("issue_key");
    const repo = str("repo") || str("repository");
    const title = str("title");
    const parts = [kind, ticket, title && `“${title}”`, repo && `for ${repo}`].filter(Boolean);
    return parts.length > 1 ? parts.join(" ") : `${kind} work${msg.type ? ` (${msg.type})` : ""}`;
  };

  const inferSource = (msg: DlqMessage) => {
    if (msg.type === "resume" || msg.source_queue.endsWith("-ci-fix")) return "CI fix";
    if (msg.type === "feedback" || msg.source_queue.endsWith("-feedback")) return "Feedback";
    return "Ticket";
  };

  if (loading) {
    return (
      <div className="border-t border-zinc-800 p-4">
        <ListSkeleton rows={2} label="Loading failed messages" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="border-t border-zinc-800 p-4">
        <Problem title="Couldn't load failed messages" onRetry={loadMessages} details={loadError}>
          Check your connection and try again.
        </Problem>
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-800">
      {messages.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-zinc-800">
          <span className="text-xs text-zinc-400">
            {messages.length} message{messages.length !== 1 ? "s" : ""} for your team
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={loadMessages} disabled={!!acting} className={smallSecondaryButton}>
              Reload
            </button>
            <button type="button" onClick={() => void handlePurge()} disabled={!!acting} className={smallDangerButton}>
              {acting === "purge" ? "Deleting..." : "Delete all"}
            </button>
          </div>
        </div>
      )}
      <div className="px-4 py-3 space-y-2 max-h-96 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="py-3 text-center text-sm text-zinc-400">No failed messages for your team.</p>
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
                      <span className="text-xs text-zinc-400" title={new Date(msg.sent_at).toLocaleString()}>
                        Sent {ageWords(msg.age_secs)} ago
                      </span>
                    )}
                  </div>
                  {!msg.retryable && (
                    <p className="text-sm text-amber-300/90 mt-1" data-testid="dlq-problem">
                      Can&apos;t be retried: <DlqProblem problem={msg.problem} />. Delete it; old ones are archived and removed automatically.
                    </p>
                  )}
                  <p className="mt-1 text-sm text-zinc-200 [overflow-wrap:anywhere]" data-testid="dlq-summary">
                    {messageSummary(msg)}
                  </p>
                  <TechnicalDetails
                    summary="Message body"
                    text={typeof msg.body === "string" ? msg.body : JSON.stringify(msg.body, null, 2)}
                    lang={typeof msg.body === "string" ? "text" : "json"}
                  />
                </div>
                <div className="flex gap-2 sm:flex-col shrink-0">
                  {msg.retryable && (
                    <button type="button" onClick={() => void handleRedrive(msg)} disabled={!!acting} className={smallSecondaryButton}>
                      {acting === msg.message_id ? "Working..." : "Try again"}
                    </button>
                  )}
                  <button type="button" onClick={() => void handleDelete(msg)} disabled={!!acting} className={buttonClass("ghost", "sm")}>
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

