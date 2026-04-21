"use client";

import { useEffect, useState, useCallback } from "react";
import { api, type HealthCheck, type HealthCheckItem, type DlqMessage } from "@/lib/api";
import { useToast } from "@/components/toast";

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
  const { toast } = useToast();

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
              <CheckCard key={check.name} check={check} onRefresh={refresh} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CheckCard({ check, onRefresh }: { check: HealthCheckItem; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const meta = CHECK_META[check.name] || { label: check.name, description: "" };
  const sc = STATUS_COLOR[check.status] || STATUS_COLOR.ok;
  const hasItems = check.items && check.items.length > 0;
  const isDlq = check.name === "dlq";
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
        <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${sc.dot}`} />
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
        <span className="text-sm text-zinc-400 flex-shrink-0">{summary}</span>
        {clickable && (
          <span className={`text-zinc-600 transition-transform ${expanded ? "rotate-180" : ""}`}>
            ▾
          </span>
        )}
      </button>

      {expanded && isDlq && check.depth !== undefined && check.depth > 0 && (
        <DlqPanel onRefresh={onRefresh} />
      )}

      {expanded && hasItems && !isDlq && (
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

function DlqPanel({ onRefresh }: { onRefresh: () => void }) {
  const [messages, setMessages] = useState<DlqMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const { toast } = useToast();

  const loadMessages = useCallback(() => {
    setLoading(true);
    api
      .getDlqMessages()
      .then((r) => setMessages(r.messages))
      .catch((e: Error) => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleRedrive = async (msg: DlqMessage) => {
    setActing(msg.message_id);
    try {
      await api.redriveDlqMessage(msg.receipt_handle, msg.body);
      toast("Message redriven to source queue", "success");
      loadMessages();
      onRefresh();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Redrive failed", "error");
    } finally {
      setActing(null);
    }
  };

  const handleDelete = async (msg: DlqMessage) => {
    setActing(msg.message_id);
    try {
      await api.deleteDlqMessage(msg.receipt_handle);
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
    if (!confirm("Permanently delete ALL messages from the dead letter queue?")) return;
    setActing("purge");
    try {
      await api.purgeDlq();
      toast("DLQ purged", "success");
      setMessages([]);
      onRefresh();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Purge failed", "error");
    } finally {
      setActing(null);
    }
  };

  const inferSource = (body: Record<string, unknown>) => {
    const type = body.type as string | undefined;
    if (type === "ci_fix" || type === "resume") return "ci-fix";
    if (type === "feedback") return "feedback";
    return "tickets";
  };

  if (loading) {
    return (
      <div className="border-t border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500">
        Loading DLQ messages...
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-800">
      {messages.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
          <span className="text-xs text-zinc-500">{messages.length} message{messages.length !== 1 ? "s" : ""} loaded (max 10)</span>
          <div className="flex gap-2">
            <button
              onClick={loadMessages}
              disabled={!!acting}
              className="px-3 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
            >
              Reload
            </button>
            <button
              onClick={handlePurge}
              disabled={!!acting}
              className="px-3 py-1 text-xs bg-red-900/30 border border-red-500/30 rounded text-red-400 hover:bg-red-900/50 disabled:opacity-50"
            >
              {acting === "purge" ? "Purging..." : "Purge All"}
            </button>
          </div>
        </div>
      )}
      <div className="px-4 py-3 space-y-2 max-h-96 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-3">No messages in DLQ</p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.message_id}
              className="bg-zinc-950/50 border border-zinc-800 rounded-lg px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-xs bg-zinc-800 text-zinc-400">
                      {inferSource(msg.body)}
                    </span>
                    <span className="text-xs text-zinc-600">
                      {msg.receive_count} attempts
                    </span>
                    {msg.sent_at && (
                      <span className="text-xs text-zinc-600">
                        · {new Date(msg.sent_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-mono text-zinc-400 bg-zinc-900 rounded p-2 mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(msg.body, null, 2)}
                  </div>
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleRedrive(msg)}
                    disabled={!!acting}
                    className="px-3 py-1 text-xs bg-blue-900/30 border border-blue-500/30 rounded text-blue-400 hover:bg-blue-900/50 disabled:opacity-50"
                  >
                    {acting === msg.message_id ? "..." : "Replay"}
                  </button>
                  <button
                    onClick={() => handleDelete(msg)}
                    disabled={!!acting}
                    className="px-3 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-400 hover:bg-zinc-700 disabled:opacity-50"
                  >
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
