"use client";

import { formatDuration as sharedDuration } from "@/components/list/time";

import { useCan } from "@/hooks/use-can";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, type RunDetail, type Openspec, type UsageInfo, type PluginDef, type PassTrace, type AgentLogPass, errorStatus } from "@/lib/api";
import { Skeleton } from "@/components/skeleton";
import { limitName, reachedLimit, usageBreakdown, usageTotal } from "@/lib/usage";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { Callout } from "@/components/callout";
import { InlineMarkdown, Markdown } from "@/components/markdown";
import { focusRing, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { Page, PageHeader } from "@/components/page";
import { RunStatusBadge, runCanClose, runCloseIsLikely, runIsLive } from "@/components/run-status";
import { CloseRunDialog } from "@/components/close-run-dialog";
import { Time } from "@/components/list";
import { usePaletteActions, type PageAction } from "@/components/command-palette";
import type { CloseRunRequest } from "@/lib/api";
import { TeamAgentAsks } from "./team-asks";
import { AgentAsks } from "./agent-asks";
import { WorkUsedLine } from "@/components/work-used";
import { HelpLink } from "@/components/support";

const PASSES = ["triage", "plan", "implement", "test", "security", "pr", "review"];

/** Words people read for each step name the worker records. */
const PASS_LABEL: Record<string, string> = {
  triage: "Triage",
  plan: "Plan",
  implement: "Build",
  test: "Test",
  security: "Security",
  pr: "Pull request",
  review: "Review",
  feedback: "Feedback",
  ci_fix: "CI fix",
};

function passLabel(raw: string): string {
  const [base, n] = raw.split(":");
  const word = PASS_LABEL[base] ?? (base.charAt(0).toUpperCase() + base.slice(1)).replace(/_/g, " ");
  return n ? `${word} #${n}` : word;
}

/** The report without its first bold line: the box carries its own heading. */
function reportBody(report: string): string {
  return report.replace(/^\s*\*\*[^*\n]+\*\*\s*\n+/, "");
}

/** The heading over the outside-the-code report, by what the run decided. */
function outsideHeading(status: string, fixLocation?: string | null): string {
  if (status === "needs_outside_change") return "The fix is a change outside the code";
  if (fixLocation === "both") return "Also needed outside the code";
  return "Not sure yet where the fix belongs";
}

/** Still working: keep refreshing. Queued runs are about to start, so they refresh too. */
const isActive = (status: string) => runIsLive(status) || status === "queued";


/** Plain words for a failed run action. The gateway answers with a bare status code. */
function actionError(e: unknown, what: string): string {
  const msg = e instanceof Error ? e.message : "";
  if (msg.includes("403")) return `Only members can ${what}. Ask an admin for member access.`;
  if (msg.includes("429")) return "The monthly token limit is reached, so no new work can start.";
  if (msg.includes("409")) return "The pull request is already merged.";
  if (msg.includes("400")) return `This run can't ${what} in its current state. Refresh the page to see where it is now.`;
  return `Couldn't ${what}. Try again in a moment.`;
}

function PassProgress({ currentPass, status, passHistory }: { currentPass?: string; status: string; passHistory?: { pass: string }[] }) {
  // Use the highest pass ever reached so CI fix cycles don't regress the bar
  let maxIdx = PASSES.indexOf(currentPass ?? "");
  passHistory?.forEach((entry) => {
    const idx = PASSES.indexOf(entry.pass);
    if (idx > maxIdx) maxIdx = idx;
  });
  // A run whose fix is outside the code finished its plan and stopped there on purpose.
  const doneIdx = ["completed", "merged", "success"].includes(status)
    ? PASSES.length
    : status === "needs_outside_change"
      ? Math.max(maxIdx, PASSES.indexOf("plan")) + 1
      : maxIdx;
  const awaiting = status === "awaiting_ci";
  return (
    <ol aria-label="Steps" className="flex flex-wrap items-center gap-y-2">
      {PASSES.map((pass, i) => {
        const done = i < doneIdx;
        const active = i === doneIdx && (status === "running" || awaiting);
        const failed = status === "failed" && i === doneIdx;
        return (
          <li key={pass} className="flex items-center" aria-current={active ? "step" : undefined}>
            {i > 0 && (
              <div aria-hidden="true" className={`w-3 sm:w-6 h-px ${done ? "bg-emerald-500/50" : active ? (awaiting ? "bg-cyan-500/30" : "bg-blue-500/30") : "bg-zinc-700/60"}`} />
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
                <svg aria-hidden="true" className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
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
              {PASS_LABEL[pass]}
              {(done || failed) && <span className="sr-only">{done ? " (done)" : " (failed)"}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** A run's four token parts (missing ones count as 0). */
function usageOf(r: RunDetail) {
  return {
    tokens_in: r.tokens_in ?? 0,
    tokens_out: r.tokens_out ?? 0,
    cache_read_tokens: r.cache_read_tokens ?? 0,
    cache_write_tokens: r.cache_write_tokens ?? 0,
  };
}

function formatTokens(n?: number): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function formatDuration(seconds?: number): string {
  return seconds ? sharedDuration(seconds) : "—";
}

export default function RunDetailPage() {
  return (
    <Suspense fallback={<Page><Skeleton className="h-6 w-64 mb-2" /><Skeleton className="h-4 w-96 mb-6" /></Page>}>
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
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`text-xs font-medium text-zinc-300 flex items-center gap-1 hover:text-zinc-100 cursor-pointer rounded ${focusRing}`}>
        <span aria-hidden="true" className={`transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        {passLabel(pass.pass)} ({pass.conversation.length} {pass.conversation.length === 1 ? "turn" : "turns"})
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
          return `${isErr ? "Error: " : ""}${content.slice(0, 150)}${content.length > 150 ? "…" : ""}`;
        }),
      };
    }
    return { texts: [], tools: [] };
  }, [turn]);

  return (
    <div className="border border-zinc-800 rounded text-xs">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`w-full flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1.5 text-left hover:bg-zinc-800/50 cursor-pointer ${focusRing}`}>
        <span aria-hidden="true" className={`transition-transform text-[10px] ${open ? "rotate-90" : ""}`}>▶</span>
        <span className={`font-medium ${roleColors[turn.role] ?? "text-zinc-400"}`}>
          {turn.role === "tool_results" ? "Tool results" : turn.role === "assistant" ? "Agent" : turn.role}
        </span>
        <span className="text-zinc-600">Turn {turn.turn}</span>
        {contentSummary.tools.length > 0 && turn.role === "assistant" && (
          <span className="min-w-0 text-zinc-500 [overflow-wrap:anywhere]">{contentSummary.tools.join(", ")}</span>
        )}
        {turn.usage && (
          <span className="text-zinc-600 ml-auto">
            {((turn.usage.input_tokens + (turn.usage.cache_read ?? 0) + (turn.usage.cache_write ?? 0) + turn.usage.output_tokens) / 1000).toFixed(1)}k tokens
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 py-2 border-t border-zinc-800 bg-zinc-900/50 font-mono whitespace-pre-wrap [overflow-wrap:anywhere] text-zinc-400 max-h-80 overflow-y-auto">
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
                <summary className={`cursor-pointer rounded ${focusRing} ${r.is_error ? "text-red-400" : "text-zinc-400"}`}>
                  {r.is_error ? "Error " : "Result "}{i + 1} ({content.length > 1000 ? `${(content.length / 1024).toFixed(1)}KB` : `${content.length}B`})
                </summary>
                <pre className="mt-1 max-w-full text-[11px] leading-relaxed overflow-x-auto">{content.slice(0, 5000)}{content.length > 5000 ? "\n… (truncated)" : ""}</pre>
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
  // "missing" when the gateway says there is no such run, "failed" for anything else.
  const [loadError, setLoadError] = useState<"missing" | "failed" | null>(null);
  const [busy, setBusy] = useState<"retry" | "review" | "reset" | "cancel" | "close" | "reopen" | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [specTab, setSpecTab] = useState<keyof Openspec>("proposal");
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const { can } = useCan();
  const [catalog, setCatalog] = useState<PluginDef[]>([]);
  const [traces, setTraces] = useState<PassTrace[]>([]);
  const tracesLoaded = useRef(false);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [agentLog, setAgentLog] = useState<{ passes: AgentLogPass[]; live_events: { tool: string; input_summary: string; duration_ms: number; is_error: boolean; timestamp: string }[] } | null>(null);
  const [agentLogOpen, setAgentLogOpen] = useState(false);
  const [agentLogFailed, setAgentLogFailed] = useState(false);
  const agentLogLoaded = useRef(false);
  const { toast } = useToast();
  const { confirm } = useConfirm();

  useEffect(() => { api.getUsage().then(setUsage).catch(() => {}); }, []);
  // Only the catalog is needed: it turns the run's server ids into names.
  useEffect(() => { api.getPluginCatalog().then((c) => setCatalog(c.plugins)).catch(() => {}); }, []);
  // Any one monthly limit reached stops new work.
  const limitHit = usage ? reachedLimit(usage) : undefined;
  const tokensExceeded = limitHit !== undefined;
  // Retry, review, start over and cancel are member-only on the gateway; a viewer
  // would only ever see them fail. Unknown role (still loading) hides them too.
  const canAct = can("runs");

  const fetchRun = useCallback(() => {
    if (!runId) return;
    api.getRun(runId)
      .then((r) => {
        setRun(r);
        setLoadError(null);
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
      .catch((e: unknown) => {
        // A failed refresh keeps the run already on screen.
        setLoadError(errorStatus(e) === 404 ? "missing" : "failed");
      })
      .finally(() => setLoading(false));
  }, [runId]);

  useEffect(() => { fetchRun(); }, [fetchRun]);

  // Keep refreshing while the run is still working.
  useEffect(() => {
    if (!run || !isActive(run.status)) return;
    const interval = setInterval(fetchRun, run.status === "awaiting_ci" ? 15000 : 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.status, fetchRun]);

  const loadAgentLog = useCallback(() => {
    setAgentLogFailed(false);
    api.getAgentLog(runId).then(setAgentLog).catch(() => { agentLogLoaded.current = false; setAgentLogFailed(true); });
  }, [runId]);

  // Refresh the agent log every 10s while the panel is open and the run is working.
  useEffect(() => {
    if (!agentLogOpen || !run || !isActive(run.status)) return;
    const interval = setInterval(() => {
      api.getAgentLog(runId).then(setAgentLog).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentLogOpen, run?.status, runId]);

  // ⌘K "Close this run" while the run can be closed and the person may.
  const closable = !!run && canAct && runCanClose(run.status);
  const paletteActions = useMemo<PageAction[] | null>(
    () =>
      closable
        ? [{ id: "close-run", label: "Close this run", sub: "Stop it and free its ticket", keywords: ["close", "stop", "done", "duplicate", "not needed"], run: () => setCloseOpen(true) }]
        : null,
    [closable],
  );
  usePaletteActions(paletteActions);

  const taskItems = useMemo(() => parseTaskItems(openspec?.tasks), [openspec?.tasks]);

  // Compute the highest pass index ever reached (not just current_pass, which regresses during CI fix cycles)
  const maxPassIdx = useMemo(() => {
    if (!run) return -1;
    let max = PASSES.indexOf(run.current_pass ?? "");
    run.pass_history?.forEach((entry) => {
      const idx = PASSES.indexOf(entry.pass);
      if (idx > max) max = idx;
    });
    return max;
  }, [run?.current_pass, run?.pass_history]);

  if (!runId) {
    return (
      <Page className="space-y-4">
        <Callout variant="neutral" title="No run picked">
          <p>This link has no run in it. Open a run from the runs list.</p>
        </Callout>
      </Page>
    );
  }

  if (loading) {
    return (
      <Page>
        <div aria-busy="true">
        <Skeleton className="h-4 w-16 mb-4" />
        <Skeleton className="h-6 w-64 max-w-full mb-2" />
        <Skeleton className="h-4 w-96 max-w-full mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        </div>
      </Page>
    );
  }

  if (!run) {
    return (
      <Page className="space-y-4">
        {loadError === "missing" ? (
          <Callout variant="neutral" title="Run not found">
            <p>No run with this id exists for your team. It may belong to another team you are in.</p>
          </Callout>
        ) : (
          <Callout variant="error" title="Couldn't load this run">
            <p>The server didn&apos;t answer. Check your connection and try again.</p>
            <button
              type="button"
              className={`${secondaryButton} mt-2`}
              onClick={() => { setLoading(true); fetchRun(); }}
            >
              Try again
            </button>
          </Callout>
        )}
      </Page>
    );
  }

  const specTabs = openspec
    ? (Object.keys(openspec) as (keyof Openspec)[]).filter((k) => openspec[k] && k !== "tasks")
    : [];
  // The first spec document may not be the proposal; never show an empty tab.
  const activeSpecTab = specTabs.includes(specTab) ? specTab : specTabs[0];

  const implementStarted = maxPassIdx >= 2 || ["completed", "merged", "failed", "archived", "cancelled", "closed"].includes(run.status);
  const showTaskSidebar = taskItems.length > 0 && implementStarted;
  const filesModified = run.files_modified ?? [];

  const doneCount = taskItems.filter((t) => isTaskDone(t, filesModified, run.status, maxPassIdx)).length;

  // What each action is allowed for, matching the gateway's own checks.
  const canRetry = ["failed", "needs_input", "needs_outside_change", "cancelled", "closed"].includes(run.status) && run.current_pass !== "feedback";
  // A closed run is reopened first; the gateway refuses a re-review of it.
  const canReview = !!run.pr_url && !["running", "queued", "merged", "closed"].includes(run.status);
  // Starting over closes the pull request: never offered once it is merged.
  const canReset = ["completed", "failed", "needs_input", "needs_outside_change", "cancelled", "closed", "success"].includes(run.status);
  // Close is a button while the run works or waits on an answer; otherwise it sits in More.
  const closeAsButton = closable && runCloseIsLikely(run.status);
  const closeInMenu = closable && !closeAsButton;
  // The PR the dialog offers to close as well: open, so not merged or closed already.
  const openPrs = run.pr_number && run.status !== "merged" ? [...new Set([run.pr_number, ...(run.pr_numbers ?? [])])] : [];
  const limitTitle = limitHit ? `The monthly ${limitName(limitHit.kind)} limit is reached` : undefined;

  const retry = async () => {
    setBusy("retry");
    try {
      await api.retryRun(runId);
      toast("Run started again. It shows at the top of the runs list.");
      router.push("/");
    } catch (e) {
      toast(actionError(e, "start this run again"), "error");
      setBusy(null);
    }
  };
  const review = async () => {
    setBusy("review");
    try {
      await api.reReviewRun(runId);
      setRun((r) => r ? { ...r, status: "running", current_pass: "feedback", error: undefined } : r);
      toast("Reading the pull request comments again");
    } catch (e) {
      toast(actionError(e, "review this pull request again"), "error");
    } finally {
      setBusy(null);
    }
  };
  const reset = async () => {
    const ok = await confirm({
      title: "Start this run over?",
      message: "This closes the pull request, deletes the working branch and starts a new run from scratch. Work on the branch that isn't merged is lost.",
      confirmLabel: "Start over",
      destructive: true,
    });
    if (ok !== "primary") return;
    setBusy("reset");
    try {
      await api.resetRun(runId);
      toast("Branch removed. A new run is starting.");
      router.push("/");
    } catch (e) {
      toast(actionError(e, "start this run over"), "error");
      setBusy(null);
    }
  };
  const closeRun = async (req: CloseRunRequest) => {
    setBusy("close");
    try {
      const r = await api.closeRun(runId, req);
      if (!r.ok) {
        toast(r.message || actionError(new Error(r.error), "close this run"), "error");
        return;
      }
      setCloseOpen(false);
      toast(r.prs_not_closed?.length ? r.message : r.outcome === "already_closed" ? "It was closed already" : "Run closed");
      fetchRun();
    } catch (e) {
      toast(actionError(e, "close this run"), "error");
    } finally {
      setBusy(null);
    }
  };
  const reopen = async () => {
    setBusy("reopen");
    try {
      const r = await api.reopenRun(runId);
      if (!r.ok) {
        toast(r.message || actionError(new Error(r.error), "reopen this run"), "error");
      } else {
        toast("Reopened. Nothing restarted; use Retry to run it again.");
      }
      fetchRun();
    } catch (e) {
      toast(actionError(e, "reopen this run"), "error");
    } finally {
      setBusy(null);
    }
  };
  const cancel = async () => {
    setBusy("cancel");
    try {
      await api.cancelRun(runId);
      setRun((r) => r ? { ...r, status: "cancelled" } : r);
      toast("Run cancelled");
    } catch (e) {
      toast(actionError(e, "cancel this run"), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page className={showTaskSidebar ? "flex flex-col lg:flex-row gap-6" : ""}>
    <div className={showTaskSidebar ? "flex-1 min-w-0" : ""}>
      {loadError === "failed" && (
        <p role="status" className="mt-3 text-xs text-amber-400">Couldn&apos;t refresh this run. What you see may be out of date.</p>
      )}

      {/* Header */}
      <div className="mb-6">
        <PageHeader
          detail
          title={run.title || "Untitled run"}
          status={<RunStatusBadge status={run.status} />}
          actions={
            canAct && closeAsButton ? (
              <button type="button" onClick={() => setCloseOpen(true)} disabled={busy !== null} className={secondaryButton}>
                Close run
              </button>
            ) : undefined
          }
          more={canAct && closeInMenu ? [{ label: "Close run…", onSelect: () => setCloseOpen(true) }] : undefined}
        />
        <p className="text-sm text-zinc-500 font-mono [overflow-wrap:anywhere]">{run.repo || "Choosing a repo…"}</p>
        {run.ticket_id && (
          <p className="text-xs text-zinc-600 mt-1 [overflow-wrap:anywhere]">
            {run.ticket_source === "jira" ? "Jira" : run.ticket_source === "alert" ? "Alert" : "Issue"}: {run.ticket_id}
          </p>
        )}
        <HelpLink className="mt-2" item={{ kind: "run", id: runId, label: run.title || undefined, repo: run.repo || undefined }}>
          Something wrong with this run?
        </HelpLink>
      </div>

      {/* Pass progress */}
      <div className="mb-6">
        <PassProgress currentPass={run.current_pass} status={run.status} passHistory={run.pass_history} />
      </div>

      {/* What the agents needed from a person: approvals, a stop, sign-ins */}
      <AgentAsks runId={runId} live={runIsLive(run.status)} note={run.policy_note} prompts={run.sign_in_prompts} />

      {/* Error / clarification */}
      {run.error && (
        <div className={`mb-6 rounded-lg border p-4 ${
          run.status === "needs_input"
            ? "border-amber-500/20 bg-amber-500/5"
            : "border-red-500/20 bg-red-500/5"
        }`}>
          <p className={`text-sm font-medium mb-1 ${
            run.status === "needs_input" ? "text-amber-400" : "text-red-400"
          }`}>
            {run.status === "needs_input" ? "Needs more detail" : "What went wrong"}
          </p>
          <pre className={`text-sm whitespace-pre-wrap [overflow-wrap:anywhere] font-mono leading-relaxed ${
            run.status === "needs_input" ? "text-amber-300/80" : "text-red-300/80"
          }`}>{sanitizeError(run.error)}</pre>
        </div>
      )}

      {/* The fix (or part of it) is a change in another system: what was found and what to change */}
      {run.outside_change_report && (
        <section
          aria-labelledby="outside-change-heading"
          className="mb-6 rounded-lg border border-orange-500/20 bg-orange-500/5 p-4 min-w-0 [overflow-wrap:anywhere]"
        >
          <h2 id="outside-change-heading" className="text-sm font-medium text-orange-400 mb-2">
            {outsideHeading(run.status, run.fix_location)}
          </h2>
          <Markdown>{reportBody(run.outside_change_report)}</Markdown>
        </section>
      )}
      {run.lesson && (
        <p className="mb-6 text-sm text-zinc-400 [overflow-wrap:anywhere]">
          <span className="text-zinc-300 font-medium">Lesson saved for this repository: </span>
          {run.lesson}
        </p>
      )}

      {/* Closed on purpose: who, why, when, and the way back */}
      {run.status === "closed" && (
        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4" data-testid="closed-note">
          <p className="text-sm text-zinc-300 [overflow-wrap:anywhere]">
            Closed{run.closed_by ? <> by <span className="font-medium text-zinc-100">{run.closed_by}</span></> : null}
            {run.close_reason ? <> · {run.close_reason}</> : null}
            {run.closed_at ? <> · <Time iso={run.closed_at} /></> : null}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Nothing restarts it by itself. A reopened or edited ticket starts a new run.
          </p>
          {canAct && (
            <button type="button" onClick={reopen} disabled={busy !== null} className={`${linkButton} mt-2`}>
              {busy === "reopen" ? "Reopening…" : "Reopen"}
            </button>
          )}
        </div>
      )}

      {/* Actions, each shown only when the gateway would accept it */}
      {canAct && (run.status === "running" || canRetry || canReset) && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          {run.status === "running" && (
            <button
              type="button"
              onClick={cancel}
              disabled={busy !== null}
              className={`inline-flex min-h-9 items-center px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 cursor-pointer ${focusRing}`}
            >
              {busy === "cancel" ? "Cancelling…" : "Cancel run"}
            </button>
          )}
          {canRetry && (
            <button
              type="button"
              onClick={retry}
              disabled={busy !== null || tokensExceeded}
              title={limitTitle}
              className={primaryButton}
            >
              {busy === "retry" ? "Starting…" : "Retry"}
            </button>
          )}
          {canReset && (
            <button
              type="button"
              onClick={reset}
              disabled={busy !== null || tokensExceeded}
              title={limitTitle ?? "Close the pull request, delete the branch and run again from scratch"}
              className={`inline-flex min-h-9 items-center px-4 py-2 border border-red-500/40 text-red-400 rounded-lg text-sm font-semibold hover:bg-red-500/10 disabled:opacity-50 cursor-pointer ${focusRing}`}
            >
              {busy === "reset" ? "Starting over…" : "Start over from scratch"}
            </button>
          )}
        </div>
      )}
      <CloseRunDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        count={1}
        prNumbers={openPrs}
        busy={busy === "close"}
        onConfirm={closeRun}
      />

      {/* Stats cards. As many 8rem columns as the box fits, not a count per
          screen width: the side panel takes a different share at each width. */}
      {/* Tokens: the total of all four parts, then each part. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,8rem),1fr))] gap-3 mb-6" title={usageBreakdown(usageOf(run))}>
        <StatCard label="Duration" value={formatDuration(run.duration_s)} />
        <StatCard label="Total tokens" value={formatTokens(usageTotal(usageOf(run)))} />
        <StatCard label="New input" value={formatTokens(run.tokens_in)} />
        <StatCard label="Read from cache" value={formatTokens(run.cache_read_tokens)} />
        <StatCard label="Written to cache" value={formatTokens(run.cache_write_tokens)} />
        <StatCard label="Output" value={formatTokens(run.tokens_out)} />
      </div>

      {/* Pass pipeline (collapsed by default) */}
      {traces.length > 0 && (() => {
        const maxDuration = Math.max(...traces.map((t) => t.duration_ms), 1);
        const totalDuration = traces.reduce((s, t) => s + t.duration_ms, 0);
        const traceTokens = (t: (typeof traces)[number]) =>
          (t.input_tokens || 0) + (t.cache_read_tokens || 0) + (t.cache_write_tokens || 0) + (t.output_tokens || 0);
        const totalTokens = traces.reduce((s, t) => s + traceTokens(t), 0);
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
              type="button"
              aria-expanded={pipelineOpen}
              aria-label={`Time per step${pipelineOpen ? "" : ", show details"}`}
              onClick={() => setPipelineOpen((o) => !o)}
              className={`w-full text-left cursor-pointer rounded-t-lg ${focusRing}`}
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
                  const label = passLabel(trace.pass);
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
                <span aria-hidden="true" className="ml-auto text-[11px] text-zinc-600">
                  {pipelineOpen ? "▲" : "▼"}
                </span>
              </div>
            </button>

            {/* Expanded detail rows */}
            {pipelineOpen && (
              <div className="divide-y divide-zinc-800/50 border-t border-zinc-800/50">
                {traces.map((trace) => {
                  const baseName = trace.pass.split(":")[0];
                  const stepLabel = passLabel(trace.pass);
                  const pct = (trace.duration_ms / maxDuration) * 100;
                  const passTokens = traceTokens(trace);
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
                          <span className="text-sm font-medium text-zinc-200">{stepLabel}</span>
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
                            <span className="text-zinc-400">{formatTokens(passTokens)} tokens</span>
                            <span className="text-zinc-500">{formatTokens(trace.input_tokens)} new input</span>
                            {cached > 0 && (
                              <span className="text-zinc-600">{formatTokens(cached)} read from cache</span>
                            )}
                            {(trace.cache_write_tokens || 0) > 0 && (
                              <span className="text-zinc-600">{formatTokens(trace.cache_write_tokens || 0)} written to cache</span>
                            )}
                            <span className="text-zinc-500">{formatTokens(trace.output_tokens)} output</span>
                            <span className="ml-auto text-zinc-600 tabular-nums">{tokenPct.toFixed(0)}% of tokens</span>
                          </>
                        ) : (
                          <span className="text-zinc-600 italic">No model calls</span>
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
          <span className="text-xs text-zinc-500">MCP servers</span>
          {run.mcp_servers.map((id) => {
            const def = catalog.find((c) => c.id === id);
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
              <a key={url} href={url} target="_blank" rel="noopener noreferrer" className={`text-sm text-blue-400 hover:text-blue-300 rounded ${focusRing}`}>
                Pull request #{run.pr_numbers?.[i] ?? i + 1} →
              </a>
            ))
          ) : run.pr_url ? (
            <a href={run.pr_url} target="_blank" rel="noopener noreferrer" className={`text-sm text-blue-400 hover:text-blue-300 rounded ${focusRing}`}>
              {run.pr_number ? `Pull request #${run.pr_number}` : "View pull request"} →
            </a>
          ) : null}
          {canAct && canReview && (
            <button
              type="button"
              onClick={review}
              disabled={busy !== null || tokensExceeded}
              title={limitTitle ?? "Read the pull request comments again and push fixes"}
              className={`${secondaryButton} min-h-8 py-1 px-3`}
            >
              {busy === "review" ? "Starting review…" : "Review again"}
            </button>
          )}
          {run.branch && (
            <span className="min-w-0 text-sm text-zinc-500">
              Branch: <code className="text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded text-xs [overflow-wrap:anywhere]">{run.branch}</code>
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
              <div key={file} className="px-3 py-2 text-sm text-zinc-400 font-mono [overflow-wrap:anywhere]">{file}</div>
            ))}
          </div>
        </div>
      )}

      {/* Openspec tabs (excluding tasks — those go in sidebar) */}
      {specTabs.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-zinc-300 mb-2">Spec documents</h2>
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="flex overflow-x-auto border-b border-zinc-800 bg-zinc-900">
              {specTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  aria-pressed={activeSpecTab === tab}
                  onClick={() => setSpecTab(tab)}
                  className={`px-4 py-2 text-sm capitalize transition-colors cursor-pointer ${focusRing} ${
                    activeSpecTab === tab
                      ? "text-zinc-100 border-b-2 border-zinc-100"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="p-4 max-h-96 overflow-y-auto">
              <Markdown>{String(openspec?.[activeSpecTab] ?? "")}</Markdown>
            </div>
          </div>
        </div>
      )}

      {/* Agent Log */}
      <div className="mb-6">
        <button
          type="button"
          aria-expanded={agentLogOpen}
          onClick={() => {
            setAgentLogOpen((o) => !o);
            if (!agentLogLoaded.current) {
              agentLogLoaded.current = true;
              loadAgentLog();
            }
          }}
          className={`text-sm font-medium text-zinc-300 mb-2 flex items-center gap-1 hover:text-zinc-100 transition-colors cursor-pointer rounded ${focusRing}`}
        >
          <span aria-hidden="true" className={`transition-transform ${agentLogOpen ? "rotate-90" : ""}`}>▶</span>
          Agent log
        </button>
        {agentLogOpen && (
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            {agentLogFailed && !agentLog ? (
              <div className="p-4 text-sm text-zinc-400">
                Couldn&apos;t load the agent log.{" "}
                <button
                  type="button"
                  className={`text-zinc-200 underline underline-offset-4 rounded ${focusRing}`}
                  onClick={() => { agentLogLoaded.current = true; loadAgentLog(); }}
                >
                  Try again
                </button>
              </div>
            ) : !agentLog ? (
              <div className="p-4 text-zinc-500 text-sm">Loading…</div>
            ) : (
              <div className="divide-y divide-zinc-800">
                {/* Live tool events (shown during/after run) */}
                {agentLog.live_events.length > 0 && (
                  <div className="p-3">
                    <h3 className="text-xs font-medium text-zinc-400 mb-2">Tool calls ({agentLog.live_events.length})</h3>
                    <div className="space-y-1 max-h-64 overflow-y-auto" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
                      {agentLog.live_events.map((evt, i) => (
                        <div key={i} className={`min-w-0 text-xs font-mono flex items-start gap-2 ${evt.is_error ? "text-red-400" : "text-zinc-400"}`}>
                          <span className="text-zinc-600 shrink-0">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                          <span className="text-zinc-200">{evt.tool}</span>
                          {evt.input_summary && <span className="min-w-0 truncate text-zinc-500">{evt.input_summary}</span>}
                          <span className="ml-auto text-zinc-600 shrink-0">{evt.duration_ms}ms</span>
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
                  <div className="p-4 text-zinc-500 text-sm">No agent log yet. The log starts once the build step begins.</div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>

      <WorkUsedLine
        query={run.created_at ? { run_id: run.run_id || runId, since: run.created_at } : null}
        refreshKey={run.status}
        standardNames={run.applied_standards}
        title="What the run used"
        className="mb-6"
      />

      <TeamAgentAsks runId={runId} status={run.status} traces={traces} />

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
                      label: `${passLabel(entry.pass)} started`,
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
                {run.status === "merged" && (
                  <TrailEntry
                    label="Pull request merged"
                    time={run.updated_at}
                    status="done"
                  />
                )}
                {run.status === "completed" && (
                  <TrailEntry
                    label="Run completed"
                    time={run.updated_at}
                    status="done"
                  />
                )}
                {run.status === "needs_outside_change" && (
                  <TrailEntry
                    label="Reported the change to make outside the code"
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
                {run.status === "closed" && (
                  <TrailEntry
                    label={run.closed_by ? `Closed by ${run.closed_by}` : "Closed"}
                    time={run.closed_at ?? run.updated_at}
                    status="done"
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
      <div className="w-full lg:w-80 flex-shrink-0">
        <div className="lg:sticky lg:top-4">
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
            <div className="p-3 max-h-96 lg:max-h-[calc(100vh-12rem)] overflow-y-auto space-y-1">
              {(() => {
                let lastSection = "";
                return taskItems.map((task, i) => {
                  const done = isTaskDone(task, filesModified, run.status, maxPassIdx);
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
                        <div aria-hidden="true" className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border transition-colors ${
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
                        <span className={`min-w-0 line-clamp-3 text-xs leading-relaxed [overflow-wrap:anywhere] ${
                          done ? "text-zinc-400" : "text-zinc-300"
                        }`} title={task.text}>
                          <span className="sr-only">{done ? "Done: " : "To do: "}</span>
                          <InlineMarkdown>{task.text}</InlineMarkdown>
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
    </Page>
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
    status === "active" ? "bg-blue-400 animate-pulse motion-reduce:animate-none" :
    "bg-emerald-400";
  const dotSize = "w-[11px] h-[11px]";
  const hasTools = tools && tools.length > 0;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 relative pl-0">
        <div aria-hidden="true" className={`${dotSize} rounded-full ${dotColor} z-10 flex-shrink-0`} />
        <span className={`min-w-0 text-sm ${status === "failed" ? "text-red-400" : status === "active" ? "text-blue-400" : "text-zinc-300"}`}>
          {label}
        </span>
        {hasTools && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className={`text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors ml-1 rounded ${focusRing}`}
          >
            {expanded ? "Hide tool calls" : `${tools.length} tool call${tools.length > 1 ? "s" : ""}`}
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
            <div key={i} className="flex items-start gap-2 text-xs text-zinc-500">
              <span className="min-w-0 [overflow-wrap:anywhere]">{t.label}</span>
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
