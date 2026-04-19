"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, type RunDetail, type Openspec, type UsageInfo, type EnabledPlugin, type PluginDef, type PassTrace, type AgentLogPass } from "@/lib/api";
import { Skeleton } from "@/components/skeleton";
import { useToast } from "@/components/toast";
import { Markdown } from "@/components/markdown";

const PASSES = ["triage", "plan", "implement", "security", "pr", "test", "review"];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { dot: string; text: string; bg: string }> = {
    running: { dot: "bg-blue-400", text: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
    awaiting_ci: { dot: "bg-cyan-400", text: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
    completed: { dot: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
    failed: { dot: "bg-red-400", text: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
    pending: { dot: "bg-yellow-400", text: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
    archived: { dot: "bg-zinc-500", text: "text-zinc-500", bg: "bg-zinc-800/50 border-zinc-700/50" },
    cancelled: { dot: "bg-amber-400", text: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
    retried: { dot: "bg-zinc-400", text: "text-zinc-400", bg: "bg-zinc-500/10 border-zinc-500/20" },
  };
  const s = map[status] ?? { dot: "bg-zinc-500", text: "text-zinc-400", bg: "bg-zinc-800 border-zinc-700" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${status === "running" || status === "awaiting_ci" ? "animate-pulse" : ""}`} />
      {status === "awaiting_ci" ? "Awaiting CI" : status}
    </span>
  );
}

function PassProgress({ currentPass, status, passHistory }: { currentPass?: string; status: string; passHistory?: { pass: string }[] }) {
  // Use the highest pass ever reached so CI fix cycles don't regress the bar
  let maxIdx = PASSES.indexOf(currentPass ?? "");
  passHistory?.forEach((entry) => {
    const idx = PASSES.indexOf(entry.pass);
    if (idx > maxIdx) maxIdx = idx;
  });
  const doneIdx = status === "completed" ? PASSES.length : maxIdx;
  const awaiting = status === "awaiting_ci";
  return (
    <div className="flex items-center gap-1">
      {PASSES.map((pass, i) => {
        const done = i < doneIdx;
        const active = i === doneIdx && (status === "running" || awaiting);
        const failed = status === "failed" && i === doneIdx;
        return (
          <div key={pass} className="flex items-center">
            {i > 0 && (
              <div className={`w-6 h-px ${done ? "bg-emerald-500/50" : active ? (awaiting ? "bg-cyan-500/30" : "bg-blue-500/30") : "bg-zinc-700/60"}`} />
            )}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                done
                  ? "text-emerald-400"
                  : active
                    ? awaiting ? "bg-cyan-500/10 text-cyan-400" : "bg-blue-500/10 text-blue-400"
                    : failed
                      ? "bg-red-500/10 text-red-400"
                      : "text-zinc-600"
              }`}
            >
              {done ? (
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : active ? (
                awaiting ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                )
              ) : failed ? (
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
              )}
              {pass}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatTokens(n?: number): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function RunDetailPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl"><Skeleton className="h-6 w-64 mb-2" /><Skeleton className="h-4 w-96 mb-6" /></div>}>
      <RunDetailInner />
    </Suspense>
  );
}

interface TaskItem {
  text: string;
  section: string;
  checked: boolean;
  filePaths: string[];
}

/** Parse openspec tasks markdown into structured checklist items. */
function parseTaskItems(tasks?: string): TaskItem[] {
  if (!tasks) return [];
  const items: TaskItem[] = [];
  let currentSection = "";
  for (const line of tasks.split("\n")) {
    const sectionMatch = line.match(/^#+\s+(.+)/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      continue;
    }
    const taskMatch = line.match(/^\s*-\s+\[([ x])\]\s+(.+)/);
    if (taskMatch) {
      const checked = taskMatch[1] === "x";
      const text = taskMatch[2].trim();
      // Extract file paths mentioned with backticks
      const paths = Array.from(text.matchAll(/`([^`]+\.[a-z]{1,4}[x]?)`/gi)).map((m) => m[1]);
      items.push({ text, section: currentSection, checked, filePaths: paths });
    }
  }
  return items;
}

/** Check if a task item is done based on run state and file matching. */
function isTaskDone(
  task: TaskItem,
  filesModified: string[],
  runStatus: string,
  maxPassIdx: number,
): boolean {
  const section = task.section.toLowerCase();
  const isPostDeploy = section.includes("post-deploy");
  const isVerification = section.includes("verification") && !isPostDeploy;
  const isPrereq = section.includes("prerequisit");

  // If the openspec itself marks it checked, it's done
  if (task.checked) return true;

  // For completed runs: all non-post-deploy tasks are done
  if (runStatus === "completed" && !isPostDeploy) return true;

  // Prerequisites done once we're past plan
  if (isPrereq && maxPassIdx >= 2) return true;

  // Verification done once review pass completed
  if (isVerification && (maxPassIdx >= 4 || runStatus === "completed")) return true;

  // File-path matching for real-time progress during implement
  if (task.filePaths.length > 0) {
    return task.filePaths.some((tp) =>
      filesModified.some((fm) => fm.endsWith(tp) || tp.endsWith(fm) || fm.includes(tp.replace(/^.*\//, "")))
    );
  }

  // Implementation tasks without file paths: done if we're past implement
  if (maxPassIdx >= 3) return true;

  return false;
}

function AgentLogPassView({ pass }: { pass: AgentLogPass }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-3">
      <button onClick={() => setOpen((o) => !o)} className="text-xs font-medium text-zinc-300 uppercase flex items-center gap-1 hover:text-zinc-100 cursor-pointer">
        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        {pass.pass} ({pass.conversation.length} turns)
      </button>
      {open && (
        <div className="mt-2 space-y-2 max-h-[600px] overflow-y-auto">
          {pass.conversation.map((turn, i) => (
            <AgentLogTurnView key={i} turn={turn} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentLogTurnView({ turn }: { turn: AgentLogPass["conversation"][number] }) {
  const [open, setOpen] = useState(false);
  const roleColors: Record<string, string> = {
    assistant: "text-blue-400",
    tool_results: "text-amber-400",
  };

  const contentSummary = useMemo(() => {
    if (turn.role === "assistant") {
      // Show text blocks and list tool_use names
      const texts: string[] = [];
      const tools: string[] = [];
      for (const block of turn.content as Record<string, unknown>[]) {
        if (block.type === "text" && typeof block.text === "string") {
          texts.push(block.text.slice(0, 200));
        } else if (block.type === "tool_use" && typeof block.name === "string") {
          tools.push(block.name as string);
        }
      }
      return { texts, tools };
    }
    if (turn.role === "tool_results") {
      return {
        texts: [],
        tools: (turn.content as Record<string, unknown>[]).map((r) => {
          const content = typeof r.content === "string" ? r.content : "";
          const isErr = !!r.is_error;
          return `${isErr ? "❌ " : ""}${content.slice(0, 150)}${content.length > 150 ? "…" : ""}`;
        }),
      };
    }
    return { texts: [], tools: [] };
  }, [turn]);

  return (
    <div className="border border-zinc-800 rounded text-xs">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-800/50 cursor-pointer">
        <span className={`transition-transform text-[10px] ${open ? "rotate-90" : ""}`}>▶</span>
        <span className={`font-medium uppercase ${roleColors[turn.role] ?? "text-zinc-400"}`}>
          {turn.role === "tool_results" ? "Tools" : turn.role}
        </span>
        <span className="text-zinc-600">Turn {turn.turn}</span>
        {turn.usage && (
          <span className="text-zinc-600 ml-auto">
            {((turn.usage.input_tokens + turn.usage.output_tokens) / 1000).toFixed(1)}k tokens
          </span>
        )}
        {contentSummary.tools.length > 0 && turn.role === "assistant" && (
          <span className="text-zinc-500 ml-1">{contentSummary.tools.join(", ")}</span>
        )}
      </button>
      {open && (
        <div className="px-3 py-2 border-t border-zinc-800 bg-zinc-900/50 font-mono whitespace-pre-wrap text-zinc-400 max-h-80 overflow-y-auto">
          {turn.role === "assistant" && contentSummary.texts.map((t, i) => (
            <div key={i} className="mb-2">{t}</div>
          ))}
          {turn.role === "assistant" && contentSummary.tools.length > 0 && (
            <div className="text-blue-400/70">
              {contentSummary.tools.map((t, i) => <div key={i}>→ {t}</div>)}
            </div>
          )}
          {turn.role === "tool_results" && (turn.content as Record<string, unknown>[]).map((r, i) => {
            const content = typeof r.content === "string" ? r.content : JSON.stringify(r.content);
            return (
              <details key={i} className="mb-1">
                <summary className={`cursor-pointer ${r.is_error ? "text-red-400" : "text-zinc-400"}`}>
                  Result {i + 1} ({content.length > 1000 ? `${(content.length / 1024).toFixed(1)}KB` : `${content.length}B`})
                </summary>
                <pre className="mt-1 text-[11px] leading-relaxed overflow-x-auto">{content.slice(0, 5000)}{content.length > 5000 ? "\n… (truncated)" : ""}</pre>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RunDetailInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const runId = searchParams.get("id") ?? "";
  const [run, setRun] = useState<RunDetail | null>(null);
  const [openspec, setOpenspec] = useState<Openspec | null>(null);
  const openspecLoaded = useRef(false);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [reReviewing, setReReviewing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [specTab, setSpecTab] = useState<keyof Openspec>("proposal");
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [plugins, setPlugins] = useState<{ catalog: PluginDef[]; enabled: EnabledPlugin[] }>({ catalog: [], enabled: [] });
  const [traces, setTraces] = useState<PassTrace[]>([]);
  const tracesLoaded = useRef(false);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [agentLog, setAgentLog] = useState<{ passes: AgentLogPass[]; live_events: { tool: string; input_summary: string; duration_ms: number; is_error: boolean; timestamp: string }[] } | null>(null);
  const [agentLogOpen, setAgentLogOpen] = useState(false);
  const agentLogLoaded = useRef(false);
  const { toast } = useToast();

  useEffect(() => { api.getUsage().then(setUsage).catch(() => {}); }, []);
  useEffect(() => {
    Promise.all([api.getPluginCatalog(), api.listEnabledPlugins()])
      .then(([c, e]) => setPlugins({ catalog: c.plugins, enabled: e.plugins }))
      .catch(() => {});
  }, []);
  const tokensExceeded = usage ? (
    usage.max_tokens > 0 && usage.total_tokens >= usage.max_tokens
  ) : false;

  const fetchRun = useCallback(() => {
    if (!runId) return;
    api.getRun(runId)
      .then((r) => {
        setRun(r);
        if (r.status !== "running" || PASSES.indexOf(r.current_pass ?? "") >= 1) {
          if (!openspecLoaded.current) {
            openspecLoaded.current = true;
            api.getRunOpenspec(runId).then(setOpenspec).catch(() => { openspecLoaded.current = false; });
          }
        }
        if (r.status !== "running" && r.status !== "queued") {
          if (!tracesLoaded.current) {
            tracesLoaded.current = true;
            api.getRunTraces(runId).then((t) => setTraces(t.traces)).catch(() => { tracesLoaded.current = false; });
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [runId]);

  useEffect(() => { fetchRun(); }, [fetchRun]);

  // Auto-poll running runs every 5s
  useEffect(() => {
    if (!run || (run.status !== "running" && run.status !== "awaiting_ci")) return;
    const interval = setInterval(fetchRun, run.status === "awaiting_ci" ? 15000 : 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.status, fetchRun]);

  const taskItems = useMemo(() => parseTaskItems(openspec?.tasks), [openspec?.tasks]);

  if (!runId) {
    return (
      <div className="max-w-3xl">
        <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">← Runs</Link>
        <p className="text-zinc-500 mt-4">No run selected.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-3xl">
        <Skeleton className="h-4 w-16 mb-4" />
        <Skeleton className="h-6 w-64 mb-2" />
        <Skeleton className="h-4 w-96 mb-6" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="max-w-3xl">
        <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">← Runs</Link>
        <p className="text-zinc-500 mt-4">Run not found.</p>
      </div>
    );
  }

  const specTabs = openspec
    ? (Object.keys(openspec) as (keyof Openspec)[]).filter((k) => openspec[k] && k !== "tasks")
    : [];

  // Compute the highest pass index ever reached (not just current_pass, which regresses during CI fix cycles)
  const maxPassIdx = useMemo(() => {
    let max = PASSES.indexOf(run.current_pass ?? "");
    run.pass_history?.forEach((entry) => {
      const idx = PASSES.indexOf(entry.pass);
      if (idx > max) max = idx;
    });
    return max;
  }, [run.current_pass, run.pass_history]);

  const implementStarted = maxPassIdx >= 2 || run.status === "completed" || run.status === "failed" || run.status === "archived" || run.status === "cancelled";
  const showTaskSidebar = taskItems.length > 0 && implementStarted;
  const filesModified = run.files_modified ?? [];

  const doneCount = taskItems.filter((t) => isTaskDone(t, filesModified, run.status, maxPassIdx)).length;

  return (
    <div className={showTaskSidebar ? "max-w-6xl flex gap-6" : "max-w-3xl"}>
    <div className={showTaskSidebar ? "flex-1 min-w-0" : ""}>
      <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm">← Runs</Link>

      {/* Header */}
      <div className="mt-4 mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-xl font-bold text-zinc-100">{run.title}</h1>
          <StatusBadge status={run.status} />
        </div>
        <p className="text-sm text-zinc-500 font-mono">{run.repo || "Determining repo…"}</p>
        {run.ticket_id && (
          <p className="text-xs text-zinc-600 mt-1">
            {run.ticket_source === "jira" ? "Jira" : "Issue"}: {run.ticket_id}
          </p>
        )}
      </div>

      {/* Pass progress */}
      <div className="mb-6">
        <PassProgress currentPass={run.current_pass} status={run.status} passHistory={run.pass_history} />
      </div>

      {/* Cancel button for running jobs */}
      {run.status === "running" && (
        <div className="mb-6">
          <button
            onClick={async () => {
              setCancelling(true);
              try {
                await api.cancelRun(runId);
                setRun((r) => r ? { ...r, status: "cancelled" } : r);
                toast("Run cancelled");
              } catch {
                toast("Failed to cancel run", "error");
                setCancelling(false);
              }
            }}
            disabled={cancelling}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 cursor-pointer"
          >
            {cancelling ? "Cancelling..." : "Cancel Run"}
          </button>
        </div>
      )}

      {/* Error / clarification banner */}
      {run.error && (
        <div className={`mb-6 rounded-lg border p-4 ${
          run.status === "needs_input"
            ? "border-amber-500/20 bg-amber-500/5"
            : "border-red-500/20 bg-red-500/5"
        }`}>
          <div className="flex items-start justify-between">
            <div>
              <p className={`text-sm font-medium mb-1 ${
                run.status === "needs_input" ? "text-amber-400" : "text-red-400"
              }`}>
                {run.status === "needs_input" ? "Needs more detail" : "Error"}
              </p>
              <pre className={`text-sm whitespace-pre-wrap font-mono leading-relaxed ${
                run.status === "needs_input" ? "text-amber-300/80" : "text-red-300/80"
              }`}>{sanitizeError(run.error)}</pre>
            </div>
            {run.status === "failed" && run.current_pass === "feedback" && run.pr_url && (
              <button
                onClick={async () => {
                  setReReviewing(true);
                  try {
                    await api.reReviewRun(runId);
                    setRun((r) => r ? { ...r, status: "running", current_pass: "feedback", error: undefined } : r);
                    toast("Re-review started");
                  } catch {
                    toast("Failed to re-review", "error");
                    setReReviewing(false);
                  }
                }}
                disabled={reReviewing || tokensExceeded}
                title={tokensExceeded ? "Token limit reached" : undefined}
                className="flex-shrink-0 ml-4 px-3 py-1.5 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-50 cursor-pointer"
              >
                {reReviewing ? "Re-reviewing…" : "Re-review"}
              </button>
            )}
            {(run.status === "failed" || run.status === "needs_input") && run.current_pass !== "feedback" && (
              <button
                onClick={async () => {
                  setRetrying(true);
                  try {
                    await api.retryRun(runId);
                    toast("Run retried — redirecting to runs list");
                    router.push("/");
                  } catch {
                    toast("Failed to retry run", "error");
                    setRetrying(false);
                  }
                }}
                disabled={retrying || tokensExceeded}
                title={tokensExceeded ? "Token limit reached" : undefined}
                className="flex-shrink-0 ml-4 px-3 py-1.5 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-50 cursor-pointer"
              >
                {retrying ? "Retrying..." : "Retry"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Retry for runs that failed/needs_input without an error message (not feedback) */}
      {(run.status === "failed" || run.status === "needs_input") && !run.error && run.current_pass !== "feedback" && (
        <div className="mb-6">
          <button
            onClick={async () => {
              setRetrying(true);
              try {
                await api.retryRun(runId);
                toast("Run retried — redirecting to runs list");
                router.push("/");
              } catch {
                toast("Failed to retry run", "error");
                setRetrying(false);
              }
            }}
            disabled={retrying || tokensExceeded}
            title={tokensExceeded ? "Token limit reached" : undefined}
            className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-semibold hover:bg-white disabled:opacity-50 cursor-pointer"
          >
            {retrying ? "Retrying..." : "Retry this run"}
          </button>
        </div>
      )}

      {/* Retry for cancelled runs */}
      {run.status === "cancelled" && (
        <div className="mb-6">
          <button
            onClick={async () => {
              setRetrying(true);
              try {
                await api.retryRun(runId);
                toast("Run retried — redirecting to runs list");
                router.push("/");
              } catch {
                toast("Failed to retry run", "error");
                setRetrying(false);
              }
            }}
            disabled={retrying || tokensExceeded}
            title={tokensExceeded ? "Token limit reached" : undefined}
            className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-semibold hover:bg-white disabled:opacity-50 cursor-pointer"
          >
            {retrying ? "Retrying..." : "Retry this run"}
          </button>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <StatCard label="Duration" value={formatDuration(run.duration_s)} />
        <StatCard label="Tokens In" value={formatTokens(run.tokens_in)} />
        <StatCard label="Tokens Out" value={formatTokens(run.tokens_out)} />
        <StatCard label="Cache Read" value={formatTokens(run.cache_read_tokens)} />
        <StatCard label="Cache Write" value={formatTokens(run.cache_write_tokens)} />
      </div>

      {/* Pass pipeline (collapsed by default) */}
      {traces.length > 0 && (() => {
        const maxDuration = Math.max(...traces.map((t) => t.duration_ms), 1);
        const totalDuration = traces.reduce((s, t) => s + t.duration_ms, 0);
        const totalTokens = traces.reduce((s, t) => s + (t.input_tokens || 0) + (t.output_tokens || 0), 0);
        const passColors: Record<string, string> = {
          triage: "from-violet-500/80 to-violet-600/40",
          plan: "from-blue-500/80 to-blue-600/40",
          implement: "from-emerald-500/80 to-emerald-600/40",
          test: "from-amber-500/80 to-amber-600/40",
          review: "from-cyan-500/80 to-cyan-600/40",
          security: "from-rose-500/80 to-rose-600/40",
          pr: "from-fuchsia-500/80 to-fuchsia-600/40",
        };
        const dotColors: Record<string, string> = {
          triage: "bg-violet-400",
          plan: "bg-blue-400",
          implement: "bg-emerald-400",
          test: "bg-amber-400",
          review: "bg-cyan-400",
          security: "bg-rose-400",
          pr: "bg-fuchsia-400",
        };
        return (
          <div className="mb-6 border border-zinc-800 rounded-lg overflow-hidden">
            {/* Clickable summary header */}
            <button
              onClick={() => setPipelineOpen((o) => !o)}
              className="w-full text-left cursor-pointer"
            >
              {/* Stacked proportional bar */}
              <div className="flex h-1.5">
                {traces.map((trace) => {
                  const baseName = trace.pass.split(":")[0];
                  return (
                    <div
                      key={trace.pass}
                      className={`h-full bg-gradient-to-r ${passColors[baseName] || "from-zinc-500/80 to-zinc-600/40"}`}
                      style={{ width: `${Math.max((trace.duration_ms / totalDuration) * 100, 1)}%` }}
                    />
                  );
                })}
              </div>

              {/* Compact pass chips */}
              <div className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
                {traces.map((trace) => {
                  const baseName = trace.pass.split(":")[0];
                  const label = trace.pass.includes(":") ? trace.pass.replace(":", " #") : trace.pass;
                  const dur = trace.duration_ms >= 60000
                    ? `${(trace.duration_ms / 60000).toFixed(1)}m`
                    : `${(trace.duration_ms / 1000).toFixed(1)}s`;
                  return (
                    <span key={trace.pass} className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <span className={`w-1.5 h-1.5 rounded-full ${dotColors[baseName] || "bg-zinc-400"}`} />
                      {label}
                      <span className="text-zinc-600 font-mono">{dur}</span>
                    </span>
                  );
                })}
                <span className="ml-auto text-[11px] text-zinc-600">
                  {pipelineOpen ? "▲" : "▼"}
                </span>
              </div>
            </button>

            {/* Expanded detail rows */}
            {pipelineOpen && (
              <div className="divide-y divide-zinc-800/50 border-t border-zinc-800/50">
                {traces.map((trace) => {
                  const baseName = trace.pass.split(":")[0];
                  const passLabel = trace.pass.includes(":") ? trace.pass.replace(":", " #") : trace.pass;
                  const pct = (trace.duration_ms / maxDuration) * 100;
                  const passTokens = (trace.input_tokens || 0) + (trace.output_tokens || 0);
                  const tokenPct = totalTokens > 0 ? (passTokens / totalTokens) * 100 : 0;
                  const cached = trace.cache_read_tokens || 0;
                  const duration = trace.duration_ms >= 60000
                    ? `${(trace.duration_ms / 60000).toFixed(1)}m`
                    : `${(trace.duration_ms / 1000).toFixed(1)}s`;

                  return (
                    <div key={trace.pass} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${dotColors[baseName] || "bg-zinc-400"}`} />
                          <span className="text-sm font-medium text-zinc-200">{passLabel}</span>
                          {trace.error && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">error</span>
                          )}
                        </div>
                        <span className="text-sm font-mono text-zinc-400">{duration}</span>
                      </div>

                      <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden mb-2">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${passColors[baseName] || "from-zinc-500/80 to-zinc-600/40"}`}
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>

                      <div className="flex items-center gap-3 text-[11px]">
                        {passTokens > 0 ? (
                          <>
                            <span className="text-zinc-500">{formatTokens(trace.input_tokens)} in</span>
                            <span className="text-zinc-500">{formatTokens(trace.output_tokens)} out</span>
                            {cached > 0 && (
                              <span className="text-zinc-600">{formatTokens(cached)} cached</span>
                            )}
                            <span className="ml-auto text-zinc-600 tabular-nums">{tokenPct.toFixed(0)}% of tokens</span>
                          </>
                        ) : (
                          <span className="text-zinc-600 italic">no LLM calls</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* MCP servers used in this run */}
      {run.mcp_servers && run.mcp_servers.length > 0 && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="text-xs text-zinc-500">MCP Servers</span>
          {run.mcp_servers.map((id) => {
            const def = plugins.catalog.find((c) => c.id === id);
            return (
              <span key={id} className="px-2 py-0.5 rounded-full text-xs bg-zinc-800 border border-zinc-700 text-zinc-300">
                {def?.name ?? id}
              </span>
            );
          })}
        </div>
      )}

      {/* Links */}
      {(run.pr_url || run.pr_urls?.length || run.branch) && (
        <div className="flex flex-wrap items-center gap-4 mb-6">
          {/* Multi-repo PRs */}
          {run.pr_urls && run.pr_urls.length > 1 ? (
            run.pr_urls.map((url, i) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300">
                PR #{run.pr_numbers?.[i] ?? i + 1} →
              </a>
            ))
          ) : run.pr_url ? (
            <a href={run.pr_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300">
              View Pull Request →
            </a>
          ) : null}
          {run.pr_url && run.status !== "running" && run.status !== "merged" && (
            <button
              onClick={async () => {
                setReReviewing(true);
                try {
                  await api.reReviewRun(runId);
                  setRun((r) => r ? { ...r, status: "running", current_pass: "feedback", error: undefined } : r);
                  toast("Re-review started");
                } catch {
                  toast("Failed to re-review", "error");
                  setReReviewing(false);
                }
              }}
              disabled={reReviewing}
              className="px-3 py-1 text-sm font-medium text-zinc-300 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 disabled:opacity-50 cursor-pointer"
            >
              {reReviewing ? "Re-reviewing…" : "Re-review"}
            </button>
          )}
          {run.branch && (
            <span className="text-sm text-zinc-500">
              Branch: <code className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">{run.branch}</code>
            </span>
          )}
        </div>
      )}

      {/* Files modified */}
      {run.files_modified && run.files_modified.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-zinc-300 mb-2">Files modified ({run.files_modified.length})</h2>
          <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800">
            {run.files_modified.map((file) => (
              <div key={file} className="px-3 py-2 text-sm text-zinc-400 font-mono">{file}</div>
            ))}
          </div>
        </div>
      )}

      {/* Openspec tabs (excluding tasks — those go in sidebar) */}
      {specTabs.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-zinc-300 mb-2">OpenSpec</h2>
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="flex border-b border-zinc-800 bg-zinc-900">
              {specTabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSpecTab(tab)}
                  className={`px-4 py-2 text-sm capitalize transition-colors cursor-pointer ${
                    specTab === tab
                      ? "text-zinc-100 border-b-2 border-zinc-100"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="p-4 max-h-96 overflow-y-auto">
              <Markdown>{String(openspec![specTab])}</Markdown>
            </div>
          </div>
        </div>
      )}

      {/* Agent Log */}
      <div className="mb-6">
        <button
          onClick={() => {
            setAgentLogOpen((o) => !o);
            if (!agentLogLoaded.current) {
              agentLogLoaded.current = true;
              api.getAgentLog(runId).then(setAgentLog).catch(() => { agentLogLoaded.current = false; });
            }
          }}
          className="text-sm font-medium text-zinc-300 mb-2 flex items-center gap-1 hover:text-zinc-100 transition-colors cursor-pointer"
        >
          <span className={`transition-transform ${agentLogOpen ? "rotate-90" : ""}`}>▶</span>
          Agent Log
        </button>
        {agentLogOpen && (
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            {!agentLog ? (
              <div className="p-4 text-zinc-500 text-sm">Loading…</div>
            ) : (
              <div className="divide-y divide-zinc-800">
                {/* Live tool events (shown during/after run) */}
                {agentLog.live_events.length > 0 && (
                  <div className="p-3">
                    <h3 className="text-xs font-medium text-zinc-400 uppercase mb-2">Live Tool Calls ({agentLog.live_events.length})</h3>
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {agentLog.live_events.map((evt, i) => (
                        <div key={i} className={`text-xs font-mono flex items-start gap-2 ${evt.is_error ? "text-red-400" : "text-zinc-400"}`}>
                          <span className="text-zinc-600 shrink-0">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                          <span className="text-zinc-200">{evt.tool}</span>
                          {evt.input_summary && <span className="truncate text-zinc-500">{evt.input_summary}</span>}
                          <span className="text-zinc-600 shrink-0">{evt.duration_ms}ms</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full conversation logs per pass (from S3) */}
                {agentLog.passes.length > 0 ? (
                  agentLog.passes.map((p) => (
                    <AgentLogPassView key={p.pass} pass={p} />
                  ))
                ) : agentLog.live_events.length === 0 ? (
                  <div className="p-4 text-zinc-500 text-sm">No agent logs available yet. Logs are captured during the implement pass.</div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Activity trail */}
      {(run.pass_history?.length || run.created_at) && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-zinc-300 mb-2">Activity</h2>
          <div className="border border-zinc-800 rounded-lg p-4">
            <div className="relative">
              <div className="absolute left-[5px] top-2 bottom-2 w-px bg-zinc-800" />
              <div className="space-y-3">
                <TrailEntry
                  label="Run started"
                  time={run.created_at}
                  status="done"
                />
                {(() => {
                  // Merge pass_history and progress_notes into a unified timeline
                  // Group tool-call notes under their preceding pass entry
                  const passEvents: { label: string; time: string; kind: "pass" | "terminal"; idx: number; tools: { label: string; time: string }[] }[] = [];
                  run.pass_history?.forEach((entry, i) => {
                    passEvents.push({
                      label: `${entry.pass.charAt(0).toUpperCase()}${entry.pass.slice(1)} started`,
                      time: entry.started_at,
                      kind: "pass",
                      idx: i,
                      tools: [],
                    });
                  });

                  // Sort progress notes by time and attach each to the most recent pass
                  const notes = [...(run.progress_notes || [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
                  for (const note of notes) {
                    // Find the last pass that started before this note
                    let target = passEvents.length - 1;
                    for (let j = passEvents.length - 1; j >= 0; j--) {
                      if (passEvents[j].time <= note.timestamp) { target = j; break; }
                    }
                    if (target >= 0) {
                      passEvents[target].tools.push({ label: note.message, time: note.timestamp });
                    }
                  }

                  const lastPassIdx = (run.pass_history?.length ?? 0) - 1;
                  return passEvents.map((ev, i) => {
                    let status: "done" | "active" | "failed" = "done";
                    if (ev.kind === "pass") {
                      if (run.status === "failed" && ev.idx === lastPassIdx) status = "failed";
                      else if (run.status === "running" && ev.idx === lastPassIdx) status = "active";
                    }
                    return (
                      <TrailEntry
                        key={`${ev.kind}-${i}`}
                        label={ev.label}
                        time={ev.time}
                        status={status}
                        tools={ev.tools}
                      />
                    );
                  });
                })()}
                {run.status === "completed" && (
                  <TrailEntry
                    label="Run completed"
                    time={run.updated_at}
                    status="done"
                  />
                )}
                {run.status === "failed" && (
                  <TrailEntry
                    label="Run failed"
                    time={run.updated_at}
                    status="failed"
                  />
                )}
                {run.status === "cancelled" && (
                  <TrailEntry
                    label="Run cancelled"
                    time={run.updated_at}
                    status="failed"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="text-xs text-zinc-600 space-y-1">
        <p>Run ID: {run.run_id}</p>
        <p>Created: {new Date(run.created_at).toLocaleString()}</p>
        {run.updated_at && <p>Updated: {new Date(run.updated_at).toLocaleString()}</p>}
      </div>
    </div>

    {/* Task checklist sidebar */}
    {showTaskSidebar && (
      <div className="w-80 flex-shrink-0">
        <div className="sticky top-4">
          <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-300">Tasks</h3>
              <span className="text-xs text-zinc-500">
                {doneCount}/{taskItems.length}
              </span>
            </div>
            {/* Progress bar */}
            <div className="h-1 bg-zinc-800">
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${taskItems.length > 0 ? (doneCount / taskItems.length) * 100 : 0}%` }}
              />
            </div>
            <div className="p-3 max-h-[calc(100vh-12rem)] overflow-y-auto space-y-1">
              {(() => {
                let lastSection = "";
                return taskItems.map((task, i) => {
                  const done = isTaskDone(task, filesModified, run.status, run.current_pass);
                  const sectionHeader = task.section !== lastSection ? task.section : null;
                  lastSection = task.section;
                  return (
                    <div key={i}>
                      {sectionHeader && (
                        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mt-3 mb-1.5 first:mt-0">
                          {sectionHeader}
                        </p>
                      )}
                      <div className="flex items-start gap-2 py-1 group">
                        <div className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border transition-colors ${
                          done
                            ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                            : "border-zinc-700 text-transparent"
                        }`}>
                          {done && (
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className={`text-xs leading-relaxed ${
                          done ? "text-zinc-500" : "text-zinc-400"
                        }`}>
                          {task.text.length > 120 ? task.text.slice(0, 120) + "…" : task.text}
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-800 rounded-lg p-3">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className="text-lg font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

function sanitizeError(msg: string): string {
  // Strip model IDs and internal service names
  return msg
    .replace(/\(model=[^)]+\)/gi, "")
    .replace(/us\.anthropic\.[\w.-]+/gi, "")
    .replace(/anthropic\.claude[\w.-]*/gi, "")
    .replace(/(?:Bedrock converse error|API call error)/gi, "An error occurred during processing")
    .replace(/service error/gi, "service temporarily unavailable")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function TrailEntry({ label, time, status, tools }: { label: string; time?: string; status: "done" | "active" | "failed"; tools?: { label: string; time: string }[] }) {
  const [expanded, setExpanded] = useState(false);
  const dotColor =
    status === "failed" ? "bg-red-400" :
    status === "active" ? "bg-blue-400 animate-pulse" :
    "bg-emerald-400";
  const dotSize = "w-[11px] h-[11px]";
  const hasTools = tools && tools.length > 0;
  return (
    <div>
      <div className="flex items-center gap-3 relative pl-0">
        <div className={`${dotSize} rounded-full ${dotColor} z-10 flex-shrink-0`} />
        <span className={`text-sm ${status === "failed" ? "text-red-400" : status === "active" ? "text-blue-400" : "text-zinc-300"}`}>
          {label}
        </span>
        {hasTools && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-zinc-500 hover:text-zinc-400 transition-colors ml-1"
          >
            {expanded ? "hide" : `${tools.length} tool call${tools.length > 1 ? "s" : ""}`}
          </button>
        )}
        {time && (
          <span className="text-xs text-zinc-600 ml-auto whitespace-nowrap">
            {new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        )}
      </div>
      {expanded && hasTools && (
        <div className="ml-6 mt-1 mb-1 space-y-0.5 border-l border-zinc-800 pl-3">
          {tools.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-zinc-500">
              <span>{t.label}</span>
              <span className="text-zinc-700 ml-auto whitespace-nowrap">
                {new Date(t.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
