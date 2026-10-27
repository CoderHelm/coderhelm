"use client";

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
import { buttonClass, dangerButton, focusRing, fullWidthOnPhone, primaryButton, secondaryButton } from "@/components/ui";
import { Page, PageHeader, SectionHeading } from "@/components/page";
import { RunStatusBadge, runCanClose, runCloseIsLikely, runIsLive, runStatusLabel } from "@/components/run-status";
import { CloseRunDialog } from "@/components/close-run-dialog";
import { Chip, Time, formatDuration as sharedDuration, formatMs } from "@/components/list";
import { usePaletteActions, type PageAction } from "@/components/command-palette";
import type { CloseRunRequest } from "@/lib/api";
import { TeamAgentAsks } from "./team-asks";
import { RunAnswered, RunQuestions } from "./run-questions";
import { AsksHistory, WaitingOnYou, useRunApprovals } from "./agent-asks";
import { WorkUsedLine } from "@/components/work-used";
import { HelpLink } from "@/components/support";
import { Tabs } from "@/components/tabs";
import { StatTile } from "@/components/stat-tile";
import { EmptyState } from "@/components/empty-state";
import { Problem, TechnicalDetails } from "@/components/problem";
import { CopyButton } from "@/components/copy-button";
import { Code } from "@/components/settings/code";
import { ChevronRightIcon, ExternalLinkIcon } from "@/components/icons";

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
                      : "text-zinc-400"
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
        <span aria-hidden="true" className={`inline-flex transition-transform ${open ? "rotate-90" : ""}`}><ChevronRightIcon /></span>
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
        <span aria-hidden="true" className={`inline-flex scale-75 transition-transform ${open ? "rotate-90" : ""}`}><ChevronRightIcon /></span>
        <span className={`font-medium ${roleColors[turn.role] ?? "text-zinc-400"}`}>
          {turn.role === "tool_results" ? "Tool results" : turn.role === "assistant" ? "Agent" : turn.role}
        </span>
        <span className="text-zinc-400">Turn {turn.turn}</span>
        {contentSummary.tools.length > 0 && turn.role === "assistant" && (
          <span className="min-w-0 text-zinc-400 [overflow-wrap:anywhere]">{contentSummary.tools.join(", ")}</span>
        )}
        {turn.usage && (
          <span className="text-zinc-400 ml-auto">
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
              {contentSummary.tools.map((t, i) => <div key={i}>Calls {t}</div>)}
            </div>
          )}
          {turn.role === "tool_results" && (turn.content as Record<string, unknown>[]).map((r, i) => {
            const content = typeof r.content === "string" ? r.content : JSON.stringify(r.content);
            return (
              <details key={i} className="mb-1">
                <summary className={`cursor-pointer rounded ${focusRing} ${r.is_error ? "text-red-400" : "text-zinc-400"}`}>
                  {r.is_error ? "Error " : "Result "}{i + 1} ({content.length > 1000 ? `${(content.length / 1024).toFixed(1)}KB` : `${content.length}B`})
                </summary>
                <pre className="mt-1 max-w-full text-xs leading-relaxed overflow-x-auto">{content.slice(0, 5000)}{content.length > 5000 ? "\n… (truncated)" : ""}</pre>
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

  // Approvals and sign-ins the run's agents asked for: open ones on the overview, the rest in Activity.
  const asks = useRunApprovals(runId, !!run && (isActive(run.status) || run.status === "needs_input"));

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

  // ── What happened, in one sentence, and the one thing to do next ──
  const prLinks: { url: string; label: string }[] =
    run.pr_urls && run.pr_urls.length > 1
      ? run.pr_urls.map((url, i) => ({ url, label: `Open pull request #${run.pr_numbers?.[i] ?? i + 1}` }))
      : run.pr_url
        ? [{ url: run.pr_url, label: run.pr_number ? `Open pull request #${run.pr_number}` : "Open pull request" }]
        : [];
  const done = ["completed", "merged", "success"].includes(run.status);
  const live = runIsLive(run.status) || run.status === "queued" || run.status === "pending";
  // Asks and stop notes are current while the run works or waits on an answer.
  const asksAreCurrent = live || run.status === "needs_input";
  const currentStep = PASS_LABEL[run.current_pass ?? ""] ?? null;
  const tab: RunTab = (RUN_TABS as readonly string[]).includes(searchParams.get("tab") ?? "") ? (searchParams.get("tab") as RunTab) : "overview";
  const tabHref = (t: RunTab) => `/runs/detail?id=${encodeURIComponent(runId)}${t === "overview" ? "" : `&tab=${t}`}`;
  const sourceWord = run.ticket_source === "jira" ? "Jira ticket" : run.ticket_source === "alert" ? "Alert" : "Issue";
  // "your-team/web#1234" in "your-team/web" says the repo twice: show "Issue #1234".
  const ticketShort = run.ticket_id && run.repo && run.ticket_id.startsWith(`${run.repo}#`) ? `#${run.ticket_id.slice(run.repo.length + 1)}` : run.ticket_id;
  const totalTokens = usageTotal(usageOf(run));
  const openPrButtons = (variant: "primary" | "secondary") =>
    prLinks.map((l) => (
      <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className={`${buttonClass(variant)} gap-1.5`}>
        {l.label}
        <ExternalLinkIcon />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    ));
  const retryButton = canAct && canRetry && (
    <button type="button" onClick={retry} disabled={busy !== null || tokensExceeded} title={limitTitle} className={primaryButton}>
      {busy === "retry" ? "Starting…" : "Retry"}
    </button>
  );
  const reviewButton = canAct && canReview && (
    <button
      type="button"
      onClick={review}
      disabled={busy !== null || tokensExceeded}
      title={limitTitle ?? "Read the pull request comments again and push fixes"}
      className={secondaryButton}
    >
      {busy === "review" ? "Starting review…" : "Review again"}
    </button>
  );
  const helpLink = (
    <HelpLink item={{ kind: "run", id: runId, label: run.title || undefined, repo: run.repo || undefined }}>Get help with this run</HelpLink>
  );

  let outcome: React.ReactNode;
  if (run.status === "failed") {
    outcome = (
      <Problem
        testId="run-outcome"
        title="Coderhelm stopped before it finished"
        details={run.error ? sanitizeError(run.error) : undefined}
        action={
          <>
            {retryButton}
            {helpLink}
          </>
        }
      >
        {currentStep ? `It hit a problem during the ${currentStep.toLowerCase()} step. ` : ""}
        {canAct && canRetry ? "Retry to run it again, or get help if it keeps happening." : "Ask someone with member access to retry it, or get help."}
      </Problem>
    );
  } else if (run.status === "closed") {
    outcome = (
      <OutcomeCard tone="neutral" title="This run was closed" testId="run-outcome">
        <div className="space-y-1" data-testid="closed-note">
        <p className="[overflow-wrap:anywhere]">
          Closed{run.closed_by ? <> by <span className="font-medium text-zinc-100">{run.closed_by}</span></> : null}
          {run.close_reason ? <> · {run.close_reason}</> : null}
          {run.closed_at ? <> · <Time iso={run.closed_at} /></> : null}
        </p>
        <p className="text-zinc-400">Nothing restarts it by itself. A reopened or edited ticket starts a new run.</p>
        {canAct && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={reopen} disabled={busy !== null} className={secondaryButton}>
              {busy === "reopen" ? "Reopening…" : "Reopen"}
            </button>
          </div>
        )}
        </div>
      </OutcomeCard>
    );
  } else {
    // `body` is one sentence; `content` is a block of its own (a form, a list).
    const look: { tone: OutcomeTone; title: string; body: React.ReactNode; content?: React.ReactNode; actions?: React.ReactNode } =
      run.status === "merged"
        ? { tone: "success", title: "Done. The change was merged.", body: "The pull request is merged, so the change is in.", actions: openPrButtons("secondary") }
        : done
          ? {
              tone: "success",
              title: prLinks.length ? "Done. The change is ready for review." : "Done.",
              body: prLinks.length ? "Coderhelm opened a pull request. Someone on your team reviews and merges it." : "Coderhelm finished this work.",
              actions: (
                <>
                  {openPrButtons("primary")}
                  {reviewButton}
                </>
              ),
            }
          : run.status === "awaiting_ci"
            ? { tone: "waiting", title: "Waiting for the automated checks", body: "The change is ready. Coderhelm fixes the checks if they fail, then hands it over for review.", actions: openPrButtons("secondary") }
            : run.status === "needs_input" && run.questions?.length
              ? {
                  tone: "waiting",
                  title: "Coderhelm needs your answer",
                  body: null,
                  content: (
                    <RunQuestions
                      run={run}
                      canAnswer={canAct}
                      limitTitle={limitTitle}
                      retry={
                        canAct && canRetry ? (
                          <button type="button" onClick={retry} disabled={busy !== null || tokensExceeded} title={limitTitle} className={`${secondaryButton} ${fullWidthOnPhone}`}>
                            {busy === "retry" ? "Starting…" : "Retry"}
                          </button>
                        ) : undefined
                      }
                      onAnswered={fetchRun}
                    />
                  ),
                  actions: undefined,
                }
              : run.status === "needs_input"
              ? {
                  tone: "waiting",
                  title: "Coderhelm needs more detail",
                  body: run.error ? <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{sanitizeError(run.error)}</span> : "Add the missing detail to the ticket, then retry.",
                  actions: retryButton,
                }
              : run.status === "retried" && run.answers?.length
              ? {
                  tone: "neutral",
                  title: "Answered. Coderhelm is continuing in a new run.",
                  body: null,
                  content: <RunAnswered run={run} />,
                  actions: undefined,
                }
              : run.status === "needs_outside_change"
                ? { tone: "attention", title: "The fix is a change outside the code", body: "The code works as designed. What to change, and where, is below.", actions: undefined }
                : run.status === "cancelled"
                  ? { tone: "neutral", title: "This run was cancelled", body: "Nothing more happens unless you retry it.", actions: retryButton }
                  : live
                    ? {
                        tone: "live",
                        title: run.status === "running" ? "Coderhelm is working on this" : "About to start",
                        body: run.status === "running" && currentStep ? `Now on the ${currentStep.toLowerCase()} step. This page updates by itself.` : "This page updates by itself.",
                        actions:
                          canAct && run.status === "running" ? (
                            <button type="button" onClick={cancel} disabled={busy !== null} className={dangerButton}>
                              {busy === "cancel" ? "Cancelling…" : "Cancel run"}
                            </button>
                          ) : undefined,
                      }
                    : { tone: "neutral", title: runStatusLabel(run.status), body: null, actions: undefined };
    outcome = (
      <OutcomeCard tone={look.tone} title={look.title} testId="run-outcome" actions={look.actions}>
        {look.body && <p>{look.body}</p>}
        {look.content}
      </OutcomeCard>
    );
  }

  const more = canAct
    ? [
        closeInMenu ? { label: "Close run…", onSelect: () => setCloseOpen(true) } : null,
        canReset ? { label: "Start over from scratch…", onSelect: reset } : null,
      ].filter((x): x is { label: string; onSelect: () => void } => !!x)
    : [];

  const tasksCard = showTaskSidebar ? (
    <TasksCard items={taskItems} done={(t) => isTaskDone(t, filesModified, run.status, maxPassIdx)} doneCount={doneCount} />
  ) : null;

  return (
    <Page>
      {loadError === "failed" && (
        <p role="status" className="mb-3 text-sm text-amber-300">Couldn&apos;t refresh this run. What you see may be out of date.</p>
      )}

      <PageHeader
        detail
        title={run.title || "Untitled run"}
        status={<RunStatusBadge status={run.status} />}
        lead={
          <span className="[overflow-wrap:anywhere]">
            {run.repo || "Choosing a repository…"}
            {ticketShort ? ` · ${sourceWord} ${ticketShort}` : ""}
            {run.created_at ? <> · started <Time iso={run.created_at} /></> : null}
          </span>
        }
        actions={
          canAct && closeAsButton ? (
            <button type="button" onClick={() => setCloseOpen(true)} disabled={busy !== null} className={secondaryButton}>
              Close run
            </button>
          ) : undefined
        }
        more={more.length ? more : undefined}
      />

      <div className="mt-6 space-y-4">
        {outcome}
        <PassProgress currentPass={run.current_pass} status={run.status} passHistory={run.pass_history} />
      </div>

      <Tabs
        label="Run views"
        selectAbove={3}
        value={tab}
        items={RUN_TABS.map((t) => ({ value: t, label: RUN_TAB_LABEL[t], href: tabHref(t) }))}
      />

      <CloseRunDialog open={closeOpen} onOpenChange={setCloseOpen} count={1} prNumbers={openPrs} tickets={[{ source: run.ticket_source, id: run.ticket_id }]} busy={busy === "close"} onConfirm={closeRun} />

      {tab === "overview" && (
        <div className={`mt-6 ${tasksCard ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]" : ""}`} data-testid="run-tab-overview">
          {/* On a phone the tasks come first, right under the progress; beside the overview from lg up. */}
          {tasksCard && <div className="min-w-0 lg:order-last">{tasksCard}</div>}
          <div className="min-w-0 space-y-6">
            <div className="grid grid-cols-2 gap-3" title={usageBreakdown(usageOf(run))}>
              <StatTile label="Time taken" value={formatDuration(run.duration_s)} testId="stat-time" />
              <StatTile
                label="AI usage"
                value={totalTokens > 0 ? `${formatTokens(totalTokens)} tokens` : "None yet"}
                note={
                  totalTokens > 0 ? (
                    <Link href={tabHref("details")} className="underline underline-offset-4 hover:text-zinc-200">
                      See the breakdown
                    </Link>
                  ) : undefined
                }
                testId="stat-usage"
              />
            </div>
            <WaitingOnYou data={asks} live={asksAreCurrent} note={run.policy_note} prompts={run.sign_in_prompts} />

            {run.outside_change_report && (
              <section aria-labelledby="outside-change-heading" className="min-w-0 rounded-lg border border-orange-500/25 bg-orange-500/5 p-4 [overflow-wrap:anywhere]">
                <h2 id="outside-change-heading" className="mb-2 text-sm font-semibold text-orange-200">
                  {outsideHeading(run.status, run.fix_location)}
                </h2>
                <div className="min-w-0 overflow-x-auto">
                  <Markdown>{reportBody(run.outside_change_report)}</Markdown>
                </div>
              </section>
            )}

            {run.lesson && (
              <Callout variant="info" title="Coderhelm learned" live={false}>
                <p className="line-clamp-3 [overflow-wrap:anywhere]" title={run.lesson}>
                  {run.lesson}
                </p>
              </Callout>
            )}


            {prLinks.length > 0 && !done && run.status !== "awaiting_ci" && (
              <div className="flex flex-wrap gap-2">{openPrButtons("secondary")}</div>
            )}
          </div>
        </div>
      )}

      {tab === "changes" && (
        <div className="mt-6 space-y-8" data-testid="run-tab-changes">
          {(prLinks.length > 0 || reviewButton) && (
            <section aria-labelledby="pr-heading" className="space-y-3">
              <SectionHeading id="pr-heading">Pull request</SectionHeading>
              <div className="flex flex-wrap gap-2">
                {openPrButtons("secondary")}
                {reviewButton}
              </div>
            </section>
          )}

          <section aria-labelledby="files-heading" className="space-y-3">
            <SectionHeading id="files-heading" count={filesModified.length || undefined}>
              Files changed
            </SectionHeading>
            {filesModified.length > 0 ? (
              <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900/30">
                {filesModified.map((file) => (
                  <li key={file} className="px-4 py-2 text-sm text-zinc-300 [overflow-wrap:anywhere]">
                    <Code>{file}</Code>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No files changed yet">
                {live ? "Files show here as Coderhelm changes them." : "This run didn't change any code."}
              </EmptyState>
            )}
          </section>

          {specTabs.length > 0 && (
            <section aria-labelledby="plan-heading" className="space-y-3">
              <SectionHeading id="plan-heading">Plan</SectionHeading>
              <div className="overflow-hidden rounded-lg border border-zinc-800">
                <div role="group" aria-label="Plan documents" className="flex flex-wrap gap-1 border-b border-zinc-800 bg-zinc-900 p-1">
                  {specTabs.map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={activeSpecTab === t}
                      onClick={() => setSpecTab(t)}
                      className={`min-h-8 rounded-md px-3 text-sm capitalize transition-colors ${focusRing} ${
                        activeSpecTab === t ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="max-h-96 overflow-y-auto p-4">
                  <Markdown>{String(openspec?.[activeSpecTab] ?? "")}</Markdown>
                </div>
              </div>
            </section>
          )}

          {run.mcp_servers && run.mcp_servers.length > 0 && (
            <section aria-labelledby="tools-heading" className="space-y-3">
              <SectionHeading id="tools-heading">Connected tools used</SectionHeading>
              <div className="flex flex-wrap gap-2">
                {run.mcp_servers.map((id) => (
                  <Chip key={id}>{catalog.find((c) => c.id === id)?.name ?? id}</Chip>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {tab === "activity" && (
        <div className="mt-6 space-y-8" data-testid="run-tab-activity">
          {done && run.error && (
            <Callout variant="neutral" title="A problem earlier in this run" live={false}>
              <p>Coderhelm got past it and finished. The details are kept here for reference.</p>
              <TechnicalDetails text={sanitizeError(run.error)} />
            </Callout>
          )}
          <AsksHistory data={asks} live={asksAreCurrent} note={run.policy_note} prompts={run.sign_in_prompts} />
          <ActivityTrail run={run} />
          <TeamAgentAsks runId={runId} status={run.status} traces={traces} />
          <WorkUsedLine
            query={run.created_at ? { run_id: run.run_id || runId, since: run.created_at } : null}
            refreshKey={run.status}
            standardNames={run.applied_standards}
            title="What the run used"
          />
        </div>
      )}

      {tab === "details" && (
        <div className="mt-6 space-y-8" data-testid="run-tab-details">
          <section aria-labelledby="tokens-heading" className="space-y-3">
            <SectionHeading id="tokens-heading">Tokens</SectionHeading>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" title={usageBreakdown(usageOf(run))}>
              <StatTile label="Total tokens" value={formatTokens(totalTokens)} />
              <StatTile label="New input" value={formatTokens(run.tokens_in)} />
              <StatTile label="Read from cache" value={formatTokens(run.cache_read_tokens)} />
              <StatTile label="Written to cache" value={formatTokens(run.cache_write_tokens)} />
              <StatTile label="Output" value={formatTokens(run.tokens_out)} />
            </div>
          </section>

          {traces.length > 0 && (
            <section aria-labelledby="steps-heading" className="space-y-3">
              <SectionHeading id="steps-heading">Time per step</SectionHeading>
              <PassPipeline traces={traces} open={pipelineOpen} onToggle={() => setPipelineOpen((o) => !o)} />
            </section>
          )}

          <section aria-labelledby="agent-log-heading" className="space-y-3">
            <h2 id="agent-log-heading" className="sr-only">Agent log</h2>
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
              className={`flex items-center gap-1.5 rounded text-sm font-semibold text-zinc-100 hover:text-white ${focusRing}`}
            >
              <span aria-hidden="true" className={`inline-flex text-zinc-400 transition-transform motion-reduce:transition-none ${agentLogOpen ? "rotate-90" : ""}`}>
                <ChevronRightIcon />
              </span>
              Agent log
            </button>
            {agentLogOpen && (
              <div className="overflow-hidden rounded-lg border border-zinc-800">
                {agentLogFailed && !agentLog ? (
                  <div className="p-4">
                    <Problem title="Couldn't load the agent log." compact onRetry={() => { agentLogLoaded.current = true; loadAgentLog(); }}>
                      Check your connection and try again.
                    </Problem>
                  </div>
                ) : !agentLog ? (
                  <div className="p-4 text-sm text-zinc-400">Loading…</div>
                ) : (
                  <div className="divide-y divide-zinc-800">
                    {agentLog.live_events.length > 0 && (
                      <div className="p-3">
                        <h3 className="mb-2 text-xs font-medium text-zinc-400">Tool calls ({agentLog.live_events.length})</h3>
                        <div className="max-h-64 space-y-1 overflow-y-auto" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
                          {agentLog.live_events.map((evt, i) => (
                            <div key={i} className={`flex min-w-0 items-start gap-2 font-mono text-xs ${evt.is_error ? "text-red-300" : "text-zinc-400"}`}>
                              <span className="shrink-0 text-zinc-400">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                              <span className="text-zinc-200">{evt.tool}</span>
                              {evt.input_summary && <span className="min-w-0 truncate text-zinc-400">{evt.input_summary}</span>}
                              <span className="ml-auto shrink-0 text-zinc-400">{formatMs(evt.duration_ms)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {agentLog.passes.length > 0 ? (
                      agentLog.passes.map((p) => <AgentLogPassView key={p.pass} pass={p} />)
                    ) : agentLog.live_events.length === 0 ? (
                      <div className="p-4 text-sm text-zinc-400">No agent log yet. The log starts once the build step begins.</div>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </section>

          <section aria-labelledby="meta-heading" className="space-y-3">
            <SectionHeading id="meta-heading">Run</SectionHeading>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-zinc-400">Run ID</dt>
              <dd className="flex min-w-0 flex-wrap items-center gap-2">
                <Code>{run.run_id || runId}</Code>
                <CopyButton text={run.run_id || runId} label="Copy run ID" variant="link" />
              </dd>
              {run.branch && (
                <>
                  <dt className="text-zinc-400">Branch</dt>
                  <dd className="min-w-0">
                    <Code>{run.branch}</Code>
                  </dd>
                </>
              )}
              {run.ticket_id && (
                <>
                  <dt className="text-zinc-400">Ticket</dt>
                  <dd className="min-w-0 [overflow-wrap:anywhere] text-zinc-200">{run.ticket_id}</dd>
                </>
              )}
              <dt className="text-zinc-400">Started</dt>
              <dd className="text-zinc-200">
                <Time iso={run.created_at} mode="date" /> (<Time iso={run.created_at} />)
              </dd>
              {run.updated_at && (
                <>
                  <dt className="text-zinc-400">Last update</dt>
                  <dd className="text-zinc-200">
                    <Time iso={run.updated_at} />
                  </dd>
                </>
              )}
            </dl>
            <div>{helpLink}</div>
          </section>
        </div>
      )}
    </Page>
  );
}

const RUN_TABS = ["overview", "changes", "activity", "details"] as const;
type RunTab = (typeof RUN_TABS)[number];
const RUN_TAB_LABEL: Record<RunTab, string> = { overview: "Overview", changes: "Changes", activity: "Activity", details: "Details" };

type OutcomeTone = "success" | "waiting" | "attention" | "live" | "neutral";

const OUTCOME_LOOK: Record<OutcomeTone, { box: string; dot: string }> = {
  success: { box: "border-emerald-500/30 bg-emerald-500/5", dot: "bg-emerald-400" },
  waiting: { box: "border-amber-500/30 bg-amber-500/5", dot: "bg-amber-400" },
  attention: { box: "border-orange-500/30 bg-orange-500/5", dot: "bg-orange-400" },
  live: { box: "border-sky-500/30 bg-sky-500/5", dot: "bg-sky-400 animate-pulse motion-reduce:animate-none" },
  neutral: { box: "border-zinc-800 bg-zinc-900/50", dot: "bg-zinc-400" },
};

/** The run's outcome in one sentence, with the one thing to do next. */
function OutcomeCard({
  tone,
  title,
  children,
  actions,
  testId,
}: {
  tone: OutcomeTone;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  testId?: string;
}) {
  const look = OUTCOME_LOOK[tone];
  return (
    <section aria-label="Outcome" data-testid={testId} data-tone={tone} className={`min-w-0 rounded-lg border px-4 py-4 sm:px-5 ${look.box}`}>
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${look.dot}`} />
        <div className="min-w-0 flex-1 space-y-1 text-sm text-zinc-300">
          <p className="text-base font-semibold text-zinc-50">{title}</p>
          {children}
          {actions && <div className="flex flex-wrap items-center gap-2 pt-2">{actions}</div>}
        </div>
      </div>
    </section>
  );
}

function TasksCard({ items, done, doneCount }: { items: TaskItem[]; done: (t: TaskItem) => boolean; doneCount: number }) {
  let lastSection = "";
  return (
    <details open className="group overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/50 lg:sticky lg:top-16">
      <summary className={`flex cursor-pointer list-none items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3 [&::-webkit-details-marker]:hidden ${focusRing}`}>
        <h2 className="text-sm font-semibold text-zinc-100">Tasks</h2>
        <span className="text-sm tabular-nums text-zinc-400">
          {doneCount} of {items.length}
        </span>
      </summary>
      <div className="h-1 bg-zinc-800" aria-hidden="true">
        <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${items.length > 0 ? (doneCount / items.length) * 100 : 0}%` }} />
      </div>
      <div className="max-h-96 space-y-1 overflow-y-auto p-3 lg:max-h-[calc(100vh-14rem)]">
        {items.map((task, i) => {
          const isDone = done(task);
          const header = task.section !== lastSection ? task.section : null;
          lastSection = task.section;
          return (
            <div key={i}>
              {header && <p className="mb-1.5 mt-3 text-xs font-medium text-zinc-400 first:mt-0">{header}</p>}
              <div className="flex items-start gap-2 py-1">
                <div
                  aria-hidden="true"
                  className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                    isDone ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-400" : "border-zinc-700 text-transparent"
                  }`}
                >
                  {isDone && (
                    <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className={`line-clamp-3 min-w-0 text-sm leading-relaxed [overflow-wrap:anywhere] ${isDone ? "text-zinc-400" : "text-zinc-200"}`} title={task.text}>
                  <span className="sr-only">{isDone ? "Done: " : "To do: "}</span>
                  <InlineMarkdown>{task.text}</InlineMarkdown>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}

const PASS_COLORS: Record<string, string> = {
  triage: "from-violet-500/80 to-violet-600/40",
  plan: "from-blue-500/80 to-blue-600/40",
  implement: "from-emerald-500/80 to-emerald-600/40",
  test: "from-amber-500/80 to-amber-600/40",
  review: "from-cyan-500/80 to-cyan-600/40",
  security: "from-rose-500/80 to-rose-600/40",
  pr: "from-fuchsia-500/80 to-fuchsia-600/40",
};
const PASS_DOTS: Record<string, string> = {
  triage: "bg-violet-400",
  plan: "bg-blue-400",
  implement: "bg-emerald-400",
  test: "bg-amber-400",
  review: "bg-cyan-400",
  security: "bg-rose-400",
  pr: "bg-fuchsia-400",
};

/** Time and tokens per step: a stacked bar and chips, with a row per step behind one toggle. */
function PassPipeline({ traces, open, onToggle }: { traces: PassTrace[]; open: boolean; onToggle: () => void }) {
  const maxDuration = Math.max(...traces.map((t) => t.duration_ms), 1);
  const totalDuration = traces.reduce((s, t) => s + t.duration_ms, 0) || 1;
  const traceTokens = (t: PassTrace) => (t.input_tokens || 0) + (t.cache_read_tokens || 0) + (t.cache_write_tokens || 0) + (t.output_tokens || 0);
  const totalTokens = traces.reduce((s, t) => s + traceTokens(t), 0);
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Time per step${open ? "" : ", show details"}`}
        onClick={onToggle}
        className={`w-full cursor-pointer rounded-t-lg text-left ${focusRing}`}
      >
        <div className="flex h-1.5">
          {traces.map((trace) => (
            <div
              key={trace.pass}
              className={`h-full bg-gradient-to-r ${PASS_COLORS[trace.pass.split(":")[0]] || "from-zinc-500/80 to-zinc-600/40"}`}
              style={{ width: `${Math.max((trace.duration_ms / totalDuration) * 100, 1)}%` }}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
          {traces.map((trace) => (
            <span key={trace.pass} className="flex items-center gap-1.5 text-xs text-zinc-300">
              <span className={`h-1.5 w-1.5 rounded-full ${PASS_DOTS[trace.pass.split(":")[0]] || "bg-zinc-400"}`} />
              {passLabel(trace.pass)}
              <span className="tabular-nums text-zinc-400">{formatMs(trace.duration_ms)}</span>
            </span>
          ))}
          <span aria-hidden="true" className={`ml-auto inline-flex text-zinc-400 transition-transform motion-reduce:transition-none ${open ? "-rotate-90" : "rotate-90"}`}>
            <ChevronRightIcon />
          </span>
        </div>
      </button>
      {open && (
        <div className="divide-y divide-zinc-800/50 border-t border-zinc-800/50">
          {traces.map((trace) => {
            const baseName = trace.pass.split(":")[0];
            const passTokens = traceTokens(trace);
            const tokenPct = totalTokens > 0 ? (passTokens / totalTokens) * 100 : 0;
            const cached = trace.cache_read_tokens || 0;
            return (
              <div key={trace.pass} className="px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${PASS_DOTS[baseName] || "bg-zinc-400"}`} />
                    <span className="text-sm font-medium text-zinc-200">{passLabel(trace.pass)}</span>
                    {trace.error && <Chip tone="danger">Error</Chip>}
                  </div>
                  <span className="text-sm tabular-nums text-zinc-400">{formatMs(trace.duration_ms)}</span>
                </div>
                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-zinc-900">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${PASS_COLORS[baseName] || "from-zinc-500/80 to-zinc-600/40"}`}
                    style={{ width: `${Math.max((trace.duration_ms / maxDuration) * 100, 2)}%` }}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                  {passTokens > 0 ? (
                    <>
                      <span className="text-zinc-300">{formatTokens(passTokens)} tokens</span>
                      <span>{formatTokens(trace.input_tokens)} new input</span>
                      {cached > 0 && <span>{formatTokens(cached)} read from cache</span>}
                      {(trace.cache_write_tokens || 0) > 0 && <span>{formatTokens(trace.cache_write_tokens || 0)} written to cache</span>}
                      <span>{formatTokens(trace.output_tokens)} output</span>
                      <span className="ml-auto tabular-nums">{tokenPct.toFixed(0)}% of tokens</span>
                    </>
                  ) : (
                    <span className="italic">No model calls</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** When each step started, with the tool calls under it, ending on how the run ended. */
function ActivityTrail({ run }: { run: RunDetail }) {
  if (!run.pass_history?.length && !run.created_at) return null;
  const passEvents: { label: string; time: string; idx: number; tools: { label: string; time: string }[] }[] = [];
  run.pass_history?.forEach((entry, i) => passEvents.push({ label: `${passLabel(entry.pass)} started`, time: entry.started_at, idx: i, tools: [] }));
  const notes = [...(run.progress_notes || [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  for (const note of notes) {
    let target = passEvents.length - 1;
    for (let j = passEvents.length - 1; j >= 0; j--) {
      if (passEvents[j].time <= note.timestamp) {
        target = j;
        break;
      }
    }
    if (target >= 0) passEvents[target].tools.push({ label: note.message, time: note.timestamp });
  }
  const lastPassIdx = (run.pass_history?.length ?? 0) - 1;
  const end: { label: string; status: "done" | "failed"; time?: string } | null =
    run.status === "merged"
      ? { label: "Pull request merged", status: "done", time: run.updated_at }
      : run.status === "completed"
        ? { label: "Run completed", status: "done", time: run.updated_at }
        : run.status === "needs_outside_change"
          ? { label: "Reported the change to make outside the code", status: "done", time: run.updated_at }
          : run.status === "failed"
            ? { label: "Run failed", status: "failed", time: run.updated_at }
            : run.status === "cancelled"
              ? { label: "Run cancelled", status: "failed", time: run.updated_at }
              : run.status === "closed"
                ? { label: run.closed_by ? `Closed by ${run.closed_by}` : "Closed", status: "done", time: run.closed_at ?? run.updated_at }
                : null;
  return (
    <section aria-labelledby="activity-heading" className="space-y-3">
      <SectionHeading id="activity-heading">Activity</SectionHeading>
      <div className="rounded-lg border border-zinc-800 p-4">
        <div className="relative">
          <div className="absolute bottom-2 left-[5px] top-2 w-px bg-zinc-800" />
          <div className="space-y-3">
            <TrailEntry label="Run started" time={run.created_at} status="done" />
            {passEvents.map((ev, i) => {
              let status: "done" | "active" | "failed" = "done";
              if (run.status === "failed" && ev.idx === lastPassIdx) status = "failed";
              else if (run.status === "running" && ev.idx === lastPassIdx) status = "active";
              return <TrailEntry key={i} label={ev.label} time={ev.time} status={status} tools={ev.tools} />;
            })}
            {end && <TrailEntry label={end.label} time={end.time} status={end.status} />}
          </div>
        </div>
      </div>
    </section>
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
        <span className={`min-w-0 text-sm ${status === "failed" ? "text-red-300" : status === "active" ? "text-blue-300" : "text-zinc-300"}`}>
          {label}
        </span>
        {hasTools && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className={`text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-2 transition-colors ml-1 rounded ${focusRing}`}
          >
            {expanded ? "Hide tool calls" : `${tools.length} tool call${tools.length > 1 ? "s" : ""}`}
          </button>
        )}
        {time && (
          <span className="text-xs text-zinc-400 ml-auto whitespace-nowrap">
            {new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        )}
      </div>
      {expanded && hasTools && (
        <div className="ml-6 mt-1 mb-1 space-y-0.5 border-l border-zinc-800 pl-3">
          {tools.map((t, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-zinc-400">
              <span className="min-w-0 [overflow-wrap:anywhere]">{t.label}</span>
              <span className="text-zinc-400 ml-auto whitespace-nowrap">
                {new Date(t.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
