"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, type BillingInfo, type Plan, type Task, type Repo, type JiraCheck, type Openspec, type Template } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { Skeleton, TableSkeleton } from "@/components/skeleton";
import { RepoCombobox } from "@/components/repo-combobox";
import { ChatMarkdown } from "@/components/chat-markdown";

const TASK_STATUS_STYLES: Record<string, string> = {
  draft: "bg-zinc-800 text-zinc-400 border-zinc-700",
  approved: "bg-green-500/10 text-green-400 border-green-500/20",
  rejected: "bg-red-500/10 text-red-400 border-red-500/20",
  queued: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  running: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  done: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  waiting: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

const TASK_BORDER_COLORS: Record<string, string> = {
  draft: "border-l-zinc-700",
  approved: "border-l-green-500/50",
  rejected: "border-l-red-500/50",
  queued: "border-l-yellow-500/50",
  running: "border-l-blue-500",
  done: "border-l-emerald-500",
  waiting: "border-l-orange-500/50",
};

const TASK_DOT_COLORS: Record<string, string> = {
  draft: "bg-zinc-700",
  approved: "bg-green-500/60",
  rejected: "bg-red-500/60",
  queued: "bg-yellow-500/60",
  running: "bg-blue-500",
  done: "bg-emerald-500",
  waiting: "bg-orange-500/60",
};

const PLAN_STATUS_STYLES: Record<string, string> = {
  draft: "bg-zinc-800 text-zinc-400 border-zinc-700",
  executing: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  waiting: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  done: "bg-green-500/10 text-green-400 border-green-500/20",
};

export default function PlanDetailPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl"><Skeleton className="h-6 w-64 mb-2" /><Skeleton className="h-4 w-96 mb-6" /><TableSkeleton rows={4} cols={3} /></div>}>
      <PlanDetail />
    </Suspense>
  );
}

function PlanDetail() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const planId = searchParams.get("id") ?? "";
  const [plan, setPlan] = useState<(Plan & { tasks: Task[] }) | null>(null);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Task>>({});
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", description: "", acceptance_criteria: "", repo: "", depends_on: "" });
  const [executing, setExecuting] = useState(false);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [jiraReady, setJiraReady] = useState(false);
  const [updatingDest, setUpdatingDest] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'tasks' | 'openspec'>('tasks');
  const [openspec, setOpenspec] = useState<Openspec | null>(null);
  const [openspecLoading, setOpenspecLoading] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateForm, setTemplateForm] = useState({ title: "", description: "", category: "", tags: "" });
  const [savingTemplate, setSavingTemplate] = useState(false);
  const { toast } = useToast();
  const { confirm } = useConfirm();

  useEffect(() => {
    api.listRepos().then((data) => {
      setRepos(data.repos.filter((r) => r.enabled));
    }).catch(() => {});
    api.getJiraCheck().then((c) => setJiraReady(c.ready)).catch(() => {});
  }, []);

  const refresh = useCallback(() => {
    if (!planId) return;
    setLoading(true);
    Promise.all([api.getPlan(planId), api.getBilling()])
      .then(([p, b]) => {
        setPlan(p);
        setBilling(b);
      })
      .catch(() => toast("Failed to load plan", "error"))
      .finally(() => setLoading(false));
  }, [planId, toast]);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-poll when tasks are queued or running
  useEffect(() => {
    if (!plan) return;
    const hasActive = plan.tasks.some((t) => t.status === "queued" || t.status === "running" || t.status === "waiting");
    if (!hasActive && plan.status !== "executing" && plan.status !== "waiting") return;
    const interval = setInterval(() => {
      api.getPlan(planId).then(setPlan).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [plan, planId]);

  const handleReject = async (taskId: string) => {
    setActionLoading(taskId + ":reject");
    try {
      await api.rejectTask(planId, taskId);
      toast("Task rejected");
      refresh();
    } catch {
      toast("Failed to reject task", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    setActionLoading(taskId + ":delete");
    try {
      await api.deleteTask(planId, taskId);
      toast("Task removed");
      refresh();
    } catch {
      toast("Failed to remove task", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveEdit = async (taskId: string) => {
    setActionLoading(taskId + ":save");
    try {
      await api.updateTask(planId, taskId, editForm);
      toast("Task updated");
      setEditingTask(null);
      refresh();
    } catch {
      toast("Failed to update task", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddTask = async () => {
    if (!newTask.title.trim()) return;
    setActionLoading("add");
    try {
      const order = plan?.tasks.length ?? 0;
      const taskPayload: Record<string, unknown> = { ...newTask, destination: plan?.destination ?? "github", order };
      if (!newTask.depends_on) delete taskPayload.depends_on;
      await api.addTask(planId, taskPayload);
      toast("Task added");
      setNewTask({ title: "", description: "", acceptance_criteria: "", repo: "", depends_on: "" });
      setShowAddTask(false);
      refresh();
    } catch {
      toast("Failed to add task", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleChangeDestination = async (dest: "github" | "jira") => {
    if (!plan || dest === (plan.destination ?? "github")) return;
    setUpdatingDest(true);
    try {
      await api.updatePlan(planId, { destination: dest });
      toast(`Destination changed to ${dest === "github" ? "GitHub Issues" : "Jira Tickets"}`);
      refresh();
    } catch {
      toast("Failed to update destination", "error");
    } finally {
      setUpdatingDest(false);
    }
  };

  const handleExecute = async () => {
    setExecuting(true);
    try {
      const result = await api.approveAllAndExecute(planId);
      toast(`Executing — ${result.tasks_queued} task${result.tasks_queued !== 1 ? "s" : ""} queued`);
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to execute plan", "error");
    } finally {
      setExecuting(false);
    }
  };

  const handleDeletePlan = async () => {
    if (!(await confirm({ title: "Delete Plan", message: "Delete this plan and all its tasks? This cannot be undone.", confirmLabel: "Delete", destructive: true }))) return;
    try {
      await api.deletePlan(planId);
      toast("Plan deleted");
      router.push("/plans");
    } catch {
      toast("Failed to delete plan", "error");
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.title.trim()) return;
    setSavingTemplate(true);
    try {
      const tags = templateForm.tags.trim() ? templateForm.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
      await api.createTemplateFromPlan(planId, {
        title: templateForm.title.trim(),
        description: templateForm.description.trim() || undefined,
        category: templateForm.category.trim() || undefined,
        tags,
      });
      toast("Template saved!");
      setShowTemplateModal(false);
    } catch {
      toast("Failed to save template", "error");
    } finally {
      setSavingTemplate(false);
    }
  };

  const openTemplateModal = () => {
    setTemplateForm({
      title: (plan?.title ?? "") + " Template",
      description: plan?.description ?? "",
      category: "",
      tags: "",
    });
    setShowTemplateModal(true);
  };

  const loadOpenspec = async () => {
    if (openspec || openspecLoading) return;
    setOpenspecLoading(true);
    try {
      const data = await api.getPlanOpenspec(planId);
      setOpenspec(data);
    } catch {
      // Not generated yet — that's fine
    } finally {
      setOpenspecLoading(false);
    }
  };

  const generateOpenspec = async () => {
    setOpenspecLoading(true);
    try {
      await api.generatePlanOpenspec(planId);
      const data = await api.getPlanOpenspec(planId);
      setOpenspec(data);
      toast("Openspec generated!");
    } catch {
      toast("Failed to generate openspec", "error");
    } finally {
      setOpenspecLoading(false);
    }
  };

  const downloadOpenspec = () => {
    if (!openspec) return;
    for (const [name, content] of Object.entries(openspec)) {
      const blob = new Blob([content], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.md`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleApprove = async (taskId: string) => {
    setActionLoading(taskId + ":approve");
    try {
      await api.approveTask(planId, taskId);
      toast("Task approved & queued");
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to approve task", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const approvedCount = plan?.tasks.filter((t) => t.status === "approved").length ?? 0;
  const draftCount = plan?.tasks.filter((t) => t.status === "draft").length ?? 0;
  const plansEnabled = billing?.subscription_status === "active";

  if (!planId) {
    return (
      <div className="max-w-3xl">
        <Link href="/plans" className="text-zinc-500 hover:text-zinc-300 text-sm">← Plans</Link>
        <p className="text-zinc-500 mt-4">No plan selected.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-3xl">
        <Skeleton className="h-6 w-64 mb-2" />
        <Skeleton className="h-4 w-96 mb-6" />
        <TableSkeleton rows={4} cols={3} />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="max-w-3xl">
        <Link href="/plans" className="text-zinc-500 hover:text-zinc-300 text-sm">← Plans</Link>
        <p className="text-zinc-500 mt-4">Plan not found.</p>
      </div>
    );
  }

  if (!plansEnabled) {
    return (
      <div className="max-w-2xl">
        <Link href="/plans" className="text-zinc-500 hover:text-zinc-300 text-sm">
          ← Plans
        </Link>
        <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-6">
          <h1 className="text-lg font-semibold text-yellow-300">Plans is a paid feature</h1>
          <p className="text-sm text-yellow-200/80 mt-2">
            Upgrade to Pro (or add the Plans add-on) to manage and execute plans.
          </p>
          <Link
            href="/billing"
            className="inline-block mt-4 px-4 py-2 bg-white text-zinc-900 rounded-lg text-sm font-semibold hover:bg-zinc-200"
          >
            Go to Billing
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/plans" className="text-zinc-500 hover:text-zinc-300 text-sm">← Plans</Link>
          <h1 className="text-2xl font-bold mt-1">{plan.title}</h1>
          {plan.description && <p className="text-zinc-400 text-sm mt-1">{plan.description}</p>}
          <div className="flex items-center gap-3 mt-2">
            {plan.repo && <span className="text-xs text-zinc-600 font-mono">{plan.repo}</span>}
            <span className={`px-2 py-0.5 rounded-full text-xs border ${PLAN_STATUS_STYLES[plan.status] || PLAN_STATUS_STYLES.draft}`}>{plan.status}</span>
            <span className="text-xs text-zinc-600">{plan.tasks.length} tasks</span>
            {((plan.tokens_in ?? 0) + (plan.tokens_out ?? 0)) > 0 && (
              <span className="text-xs text-zinc-600">{(((plan.tokens_in ?? 0) + (plan.tokens_out ?? 0)) / 1000).toFixed(1)}K tokens</span>
            )}
            {plan.mcp_servers && plan.mcp_servers.length > 0 && (
              <>
                <span className="text-xs text-zinc-600">MCP Servers:</span>
                {plan.mcp_servers.map((id) => (
                    <span key={id} className="px-2 py-0.5 rounded-full text-xs bg-zinc-800 border border-zinc-700 text-zinc-300">
                      {id}
                    </span>
                ))}
              </>
            )}
          </div>
        </div>
        {plan.status === "draft" && draftCount > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={openTemplateModal}
              className="px-3 py-2 text-zinc-500 hover:text-zinc-300 text-sm border border-zinc-700 rounded-lg transition-colors"
            >
              Save as Template
            </button>
            <button
              onClick={handleDeletePlan}
              className="px-3 py-2 text-zinc-600 hover:text-red-400 text-sm transition-colors"
            >
              Delete
            </button>
            <button
              onClick={handleExecute}
              disabled={executing}
              className="px-5 py-2.5 bg-white text-zinc-900 rounded-lg text-sm font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-40"
            >
              {executing ? "Executing..." : "Approve"}
            </button>
          </div>
        )}
        {plan.status !== "draft" && (
          <div className="flex items-center gap-2">
            <button
              onClick={openTemplateModal}
              className="px-3 py-2 text-zinc-500 hover:text-zinc-300 text-sm border border-zinc-700 rounded-lg transition-colors"
            >
              Save as Template
            </button>
            <button
              onClick={handleDeletePlan}
              className="px-3 py-2 text-zinc-600 hover:text-red-400 text-sm transition-colors"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Plan-level destination picker */}
      <div className="mb-6 flex items-center gap-3 p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
        <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium whitespace-nowrap">Destination</span>
        <div className="flex gap-2">
          {(["github", "jira"] as const).map((d) => (
            <button
              key={d}
              disabled={(d === "jira" && !jiraReady) || updatingDest || plan.status !== "draft"}
              onClick={() => handleChangeDestination(d)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                d === "jira" && !jiraReady ? "opacity-40 cursor-not-allowed" :
                plan.status !== "draft" ? "cursor-default" :
                "cursor-pointer"
              } ${
                (plan.destination ?? "github") === d
                  ? d === "github"
                    ? "border-[#238636]/40 bg-[#238636]/10 text-[#238636]"
                    : "border-[#0052CC]/40 bg-[#0052CC]/10 text-[#4C9AFF]"
                  : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
              }`}
            >
              {d === "github" ? (
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84a.84.84 0 00-.84-.84H11.53zM6.77 6.8a4.36 4.36 0 004.34 4.34h1.8v1.72a4.36 4.36 0 004.34 4.34V7.63a.84.84 0 00-.84-.84H6.77zM2 11.6a4.35 4.35 0 004.34 4.34h1.8v1.72A4.35 4.35 0 0012.48 22v-9.57a.84.84 0 00-.84-.84H2z"/></svg>
              )}
              {d === "github" ? "GitHub Issues" : "Jira Tickets"}
            </button>
          ))}
        </div>
        {!jiraReady && <span className="text-xs text-zinc-600">Connect Jira in Settings to enable</span>}
        {plan.status !== "draft" && <span className="text-xs text-zinc-600">Locked after execution starts</span>}
      </div>

      {plan.tasks.length > 0 && (plan.status === "executing" || plan.status === "done") && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-zinc-500">Execution progress</span>
            <span className="text-zinc-400 font-medium">
              {plan.tasks.filter((t) => t.status === "done").length} / {plan.tasks.length} complete
            </span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r from-emerald-500 to-emerald-400"
              style={{
                width: `${(plan.tasks.filter((t) => t.status === "done").length / plan.tasks.length) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {plan.tasks.length > 0 && plan.status === "draft" && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: "Draft", count: draftCount, style: "text-zinc-400" },
            { label: "Approved", count: approvedCount, style: "text-green-400" },
            { label: "Rejected", count: plan.tasks.filter((t) => t.status === "rejected").length, style: "text-red-400" },
            { label: "Total", count: plan.tasks.length, style: "text-zinc-300" },
          ].map(({ label, count, style }) => (
            <div key={label} className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg text-center">
              <p className={`text-xl font-bold ${style}`}>{count}</p>
              <p className="text-xs text-zinc-600 uppercase tracking-wider mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-zinc-800 mb-4">
        <button onClick={() => setActiveTab('tasks')} className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'tasks' ? 'text-zinc-100 border-zinc-100' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}>
          Tasks ({plan.tasks.length})
        </button>
        <button onClick={() => { setActiveTab('openspec'); loadOpenspec(); }} className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'openspec' ? 'text-zinc-100 border-zinc-100' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}>
          Openspec
        </button>
      </div>

      {activeTab === 'openspec' && (
        <div>
          {!openspec ? (
            <div className="text-center py-12">
              <p className="text-sm text-zinc-500 mb-4">Generate an Openspec to document this plan&apos;s proposal, design, tasks, and acceptance criteria.</p>
              <button onClick={generateOpenspec} disabled={openspecLoading} className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-semibold hover:bg-white disabled:opacity-50">
                {openspecLoading ? 'Generating...' : 'Generate Openspec'}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-end">
                <button onClick={downloadOpenspec} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 border border-zinc-700 rounded-lg hover:text-zinc-200 hover:border-zinc-600 transition-colors">
                  Download All
                </button>
              </div>
              {(['proposal', 'design', 'tasks', 'spec'] as const).map(file => (
                <div key={file} className="rounded-lg border border-zinc-800 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/50 border-b border-zinc-800">
                    <span className="text-sm font-medium text-zinc-300">{file}.md</span>
                    <button onClick={() => navigator.clipboard.writeText(openspec[file] ?? '')} className="text-xs text-zinc-500 hover:text-zinc-300">Copy</button>
                  </div>
                  <div className="p-4">
                    <ChatMarkdown>{openspec[file] ?? ''}</ChatMarkdown>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'tasks' && (<>
      {/* Search & status filters */}
      {plan.tasks.length > 3 && (
        <div className="mb-4 space-y-3">
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
          />
          <div className="flex items-center gap-2 flex-wrap">
            {["draft", "approved", "rejected", "queued", "running", "waiting", "done"].map((s) => {
              const count = plan.tasks.filter((t) => t.status === s).length;
              if (count === 0) return null;
              const active = statusFilters.has(s);
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilters((prev) => {
                    const next = new Set(prev);
                    if (next.has(s)) next.delete(s); else next.add(s);
                    return next;
                  })}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors cursor-pointer ${
                    active
                      ? TASK_STATUS_STYLES[s] || TASK_STATUS_STYLES.draft
                      : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"
                  }`}
                >
                  {s} ({count})
                </button>
              );
            })}
            {statusFilters.size > 0 && (
              <button
                onClick={() => setStatusFilters(new Set())}
                className="text-xs text-zinc-600 hover:text-zinc-400 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {(() => {
        const uniqueRepos = [...new Set(plan.tasks.map((t) => t.repo || plan.repo).filter(Boolean))];
        return uniqueRepos.length > 1 ? (
          <div className="flex items-center gap-2 text-xs text-zinc-500 mb-3">
            <span>Multi-repo plan:</span>
            {uniqueRepos.map((r) => (
              <span key={r} className="px-1.5 py-0.5 bg-zinc-800/50 rounded font-mono text-[10px]">{r}</span>
            ))}
          </div>
        ) : null;
      })()}

      <div className="relative">
        {/* Vertical connector line */}
        {plan.tasks.length > 1 && (
          <div className="absolute left-[19px] top-6 bottom-6 w-px bg-zinc-800" />
        )}

        <div className="space-y-0">
          {plan.tasks.filter((task) => {
            if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase()) && !task.description?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            if (statusFilters.size > 0 && !statusFilters.has(task.status)) return false;
            return true;
          }).map((task, idx) => (
            <div key={task.task_id} className="relative">
              {/* Timeline dot */}
              <div className="absolute left-0 top-5 z-10 flex items-center justify-center">
                <div
                  className={`w-[10px] h-[10px] rounded-full ring-2 ring-zinc-950 ${TASK_DOT_COLORS[task.status] || TASK_DOT_COLORS.draft} ${
                    task.status === "running" ? "animate-pulse" : ""
                  }`}
                />
              </div>

              {/* Task card */}
              <div className={`ml-8 mb-3 border border-zinc-800 rounded-lg bg-zinc-900/30 border-l-2 ${TASK_BORDER_COLORS[task.status] || TASK_BORDER_COLORS.draft} ${
                task.status === "running" ? "ring-1 ring-blue-500/20" : ""
              }`}>
                {editingTask === task.task_id ? (
              <div className="p-4 space-y-3">
                <input value={editForm.title ?? task.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-100 focus:outline-none focus:border-zinc-500" />
                <textarea value={editForm.description ?? task.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-100 font-mono focus:outline-none focus:border-zinc-500 resize-y" placeholder="Description" />
                <textarea value={editForm.acceptance_criteria ?? task.acceptance_criteria} onChange={(e) => setEditForm((f) => ({ ...f, acceptance_criteria: e.target.value }))} rows={3} className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-100 font-mono focus:outline-none focus:border-zinc-500 resize-y" placeholder="Acceptance criteria" />
                {repos.length > 0 ? (
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Repo override (blank uses plan default)</label>
                    <RepoCombobox repos={repos} selected={editForm.repo ?? task.repo ?? ""} onSelect={(v) => setEditForm((f) => ({ ...f, repo: v }))} />
                  </div>
                ) : (
                  <input value={editForm.repo ?? task.repo ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, repo: e.target.value }))} className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500" placeholder="Repo override (owner/repo) — blank uses plan default" />
                )}
                {plan.tasks.filter((t) => t.task_id !== task.task_id).length > 0 && (
                  <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Run after (only start after this task&apos;s PR merges)</label>
                    <select
                      value={editForm.depends_on ?? task.depends_on ?? ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, depends_on: e.target.value }))}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                    >
                      <option value="">No dependency</option>
                      {plan.tasks.filter((t) => t.task_id !== task.task_id).map((t, i) => (
                        <option key={t.task_id} value={t.task_id}>
                          {i + 1}. {t.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => handleSaveEdit(task.task_id)} disabled={actionLoading === task.task_id + ":save"} className="px-3 py-1.5 bg-zinc-100 text-zinc-900 rounded text-xs font-medium hover:bg-white disabled:opacity-50">Save</button>
                  <button onClick={() => setEditingTask(null)} className="px-3 py-1.5 text-zinc-500 hover:text-zinc-300 text-xs">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-zinc-600 font-mono w-5 text-right flex-shrink-0">{idx + 1}</span>
                      <h3 className={`text-base font-semibold ${task.status === "done" ? "text-zinc-400" : "text-zinc-100"}`}>{task.title}</h3>
                      <span className={`px-1.5 py-0.5 rounded-full text-xs border ${TASK_STATUS_STYLES[task.status] || TASK_STATUS_STYLES.draft}`}>{task.status}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 ml-7">
                      {task.issue_url && (
                        <a href={task.issue_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><path d="M8 5v3M8 10v1" /></svg>
                          #{task.issue_number}
                        </a>
                      )}
                      {task.jira_ticket_url && (
                        <a href={task.jira_ticket_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="12" height="12" rx="2" /><path d="M6 8h4M8 6v4" /></svg>
                          {task.jira_ticket_key}
                        </a>
                      )}
                      {task.run_id && (
                        <Link href={`/runs/detail?id=${task.run_id}`} className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5"><path d="M6 3l5 5-5 5" /></svg>
                          View run
                        </Link>
                      )}
                      {task.status === "failed" && (
                        <button
                          onClick={async () => {
                            setActionLoading(task.task_id + ":retry");
                            try {
                              await api.forceRunTask(plan.plan_id, task.task_id);
                              toast("Task retried");
                              api.getPlan(plan.plan_id).then(setPlan);
                            } catch {
                              toast("Failed to retry task", "error");
                            }
                            setActionLoading(null);
                          }}
                          disabled={actionLoading === task.task_id + ":retry"}
                          className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5"><path d="M2 8a6 6 0 0111.47-2.5M14 8a6 6 0 01-11.47 2.5" /><path d="M14 2v4h-4M2 14v-4h4" /></svg>
                          {actionLoading === task.task_id + ":retry" ? "Retrying…" : "Retry"}
                        </button>
                      )}
                      {task.repo && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-zinc-800/50 rounded text-[10px] text-zinc-500 font-mono">
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="opacity-40"><path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1h-8a1 1 0 00-1 1v6.708A2.486 2.486 0 014.5 9h8.5V1.5zm-8 11a1 1 0 100-2 1 1 0 000 2z"/></svg>
                          {task.repo}
                        </span>
                      )}
                      {task.approved_by && <span className="text-xs text-zinc-600">approved by {task.approved_by}</span>}
                      {task.status === "running" && <span className="text-xs text-blue-400 animate-pulse">Processing…</span>}
                      {task.depends_on && (() => {
                        const dep = plan.tasks.find((t) => t.task_id === task.depends_on);
                        const depIdx = dep ? plan.tasks.indexOf(dep) + 1 : null;
                        return dep ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700">
                            <span className="text-xs text-zinc-500">↳</span>
                            <span className="text-xs text-zinc-400">after <span className="font-medium">#{depIdx} {dep.title}</span></span>
                          </span>
                        ) : null;
                      })()}
                    </div>
                    {task.status === "waiting" && task.depends_on && (() => {
                      const dep = plan.tasks.find((t) => t.task_id === task.depends_on);
                      return (
                        <div className="flex items-center gap-2 mt-1.5 ml-7">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20">
                            <svg className="w-3 h-3 text-orange-400" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5"><path d="M8 2v4M8 10v4M2 8h4M10 8h4" /></svg>
                            <span className="text-xs text-orange-400">Blocked on &ldquo;{dep?.title || "dependency"}&rdquo;</span>
                          </span>
                          <button
                            onClick={async () => {
                              setActionLoading(task.task_id);
                              // Optimistic: move to queued immediately
                              setPlan((prev) => prev ? { ...prev, tasks: prev.tasks.map((t) => t.task_id === task.task_id ? { ...t, status: "queued" } : t) } : prev);
                              try { await api.forceRunTask(plan.plan_id, task.task_id); } catch { refresh(); }
                              setActionLoading(null);
                            }}
                            disabled={!!actionLoading}
                            className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded text-xs hover:bg-blue-500/20 disabled:opacity-50"
                          >
                            Force run
                          </button>
                        </div>
                      );
                    })()}
                    {task.description && <p className="text-sm text-zinc-400 mt-2 ml-7 leading-relaxed">{task.description}</p>}
                    {task.acceptance_criteria && (
                      <div className="mt-3 ml-7">
                        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Acceptance criteria</p>
                        <pre className="text-sm text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed">{task.acceptance_criteria}</pre>
                      </div>
                    )}
                    {plan.status === "draft" && plan.tasks.filter((t) => t.task_id !== task.task_id).length > 0 && (
                      <div className="mt-3 ml-7">
                        <label className="text-xs text-zinc-500 mb-1 block">Run after</label>
                        <select
                          value={task.depends_on ?? ""}
                          onChange={async (e) => {
                            const val = e.target.value;
                            // Optimistic update to avoid page flash
                            setPlan((prev) => prev ? { ...prev, tasks: prev.tasks.map((t) => t.task_id === task.task_id ? { ...t, depends_on: val || undefined } : t) } : prev);
                            try {
                              await api.updateTask(plan.plan_id, task.task_id, { depends_on: val });
                            } catch { toast("Failed to update dependency", "error"); refresh(); }
                          }}
                          className="w-full max-w-sm px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-300 focus:outline-none focus:border-zinc-600"
                        >
                          <option value="">No dependency</option>
                          {plan.tasks.filter((t) => t.task_id !== task.task_id).map((t, i) => (
                            <option key={t.task_id} value={t.task_id}>
                              {i + 1}. {t.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  {plan.status === "draft" && (
                    <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                      {task.status === "draft" && (
                        <>
                          <button onClick={() => handleApprove(task.task_id)} disabled={!!actionLoading} className="px-2.5 py-1 bg-green-500/10 border border-green-500/20 text-green-400 rounded text-xs hover:bg-green-500/20 disabled:opacity-50">Approve</button>
                          <button onClick={() => handleReject(task.task_id)} disabled={!!actionLoading} className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded text-xs hover:text-red-400 disabled:opacity-50">Skip</button>
                        </>
                      )}
                      {task.status === "approved" && <button onClick={() => handleReject(task.task_id)} disabled={!!actionLoading} className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded text-xs hover:text-zinc-200 disabled:opacity-50">Undo</button>}
                      {task.status === "rejected" && <button onClick={() => handleApprove(task.task_id)} disabled={!!actionLoading} className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded text-xs hover:text-green-400 disabled:opacity-50">Re-approve</button>}
                      <button onClick={() => { setEditingTask(task.task_id); setEditForm({}); }} className="px-2.5 py-1 text-zinc-600 hover:text-zinc-300 text-xs">Edit</button>
                      <button onClick={() => handleDeleteTask(task.task_id)} disabled={!!actionLoading} className="px-2.5 py-1 text-zinc-700 hover:text-red-400 text-xs disabled:opacity-50">✕</button>
                    </div>
                  )}
                </div>
              </div>
            )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {plan.status === "draft" && (
        <div className="relative ml-8">
          {showAddTask ? (
            <div className="border border-zinc-700 border-dashed rounded-lg p-4 space-y-3">
              <input autoFocus value={newTask.title} onChange={(e) => setNewTask((t) => ({ ...t, title: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && handleAddTask()} placeholder="Task title" className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500" />
              <textarea value={newTask.description} onChange={(e) => setNewTask((t) => ({ ...t, description: e.target.value }))} rows={2} placeholder="Description (optional)" className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-100 font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none" />
              <textarea value={newTask.acceptance_criteria} onChange={(e) => setNewTask((t) => ({ ...t, acceptance_criteria: e.target.value }))} rows={2} placeholder="Acceptance criteria (optional)" className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-100 font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none" />
              {repos.length > 0 ? (
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Repo override (blank uses plan default)</label>
                  <RepoCombobox repos={repos} selected={newTask.repo} onSelect={(v) => setNewTask((t) => ({ ...t, repo: v }))} />
                </div>
              ) : (
                <input value={newTask.repo} onChange={(e) => setNewTask((t) => ({ ...t, repo: e.target.value }))} placeholder="Repo override (owner/repo) — blank uses plan default" className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500" />
              )}
              {plan.tasks.length > 0 && (
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Run after (only start after this task&apos;s PR merges)</label>
                  <select
                    value={newTask.depends_on}
                    onChange={(e) => setNewTask((t) => ({ ...t, depends_on: e.target.value }))}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                  >
                    <option value="">No dependency</option>
                    {plan.tasks.map((t, i) => (
                      <option key={t.task_id} value={t.task_id}>
                        {i + 1}. {t.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={handleAddTask} disabled={!newTask.title.trim() || actionLoading === "add"} className="px-3 py-1.5 bg-zinc-100 text-zinc-900 rounded text-xs font-medium hover:bg-white disabled:opacity-50">Add task</button>
                <button onClick={() => setShowAddTask(false)} className="px-3 py-1.5 text-zinc-500 hover:text-zinc-300 text-xs">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddTask(true)} className="w-full py-3 border border-dashed border-zinc-800 rounded-lg text-sm text-zinc-600 hover:text-zinc-400 hover:border-zinc-700 transition-colors">+ Add task</button>
          )}
        </div>
        )}

      {draftCount > 0 && plan.status === "draft" && (
        <p className="text-xs text-zinc-600 mt-6 ml-8">Approve individual tasks or click &ldquo;Approve&rdquo; to start. Approving the last task auto-triggers execution.</p>
      )}
      </>)}

      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6">
            <h2 className="text-lg font-semibold mb-4">Save as Template</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Title</label>
                <input
                  value={templateForm.title}
                  onChange={(e) => setTemplateForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Description</label>
                <textarea
                  value={templateForm.description}
                  onChange={(e) => setTemplateForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-zinc-500 resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Category (optional)</label>
                <input
                  value={templateForm.category}
                  onChange={(e) => setTemplateForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="e.g. backend, frontend, devops"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Tags (optional, comma-separated)</label>
                <input
                  value={templateForm.tags}
                  onChange={(e) => setTemplateForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder="e.g. api, auth, migration"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowTemplateModal(false)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={savingTemplate || !templateForm.title.trim()}
                className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-semibold hover:bg-white transition-colors disabled:opacity-50"
              >
                {savingTemplate ? "Saving..." : "Save Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
