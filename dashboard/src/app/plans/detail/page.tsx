"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, type BillingInfo, type Plan, type Task, type Repo, type JiraCheck } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Skeleton, TableSkeleton } from "@/components/skeleton";
import { RepoCombobox } from "@/components/repo-combobox";

const TASK_STATUS_STYLES: Record<string, string> = {
  draft: "bg-zinc-800 text-zinc-400 border-zinc-700",
  approved: "bg-green-500/10 text-green-400 border-green-500/20",
  rejected: "bg-red-500/10 text-red-400 border-red-500/20",
  queued: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  running: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  done: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const TASK_BORDER_COLORS: Record<string, string> = {
  draft: "border-l-zinc-700",
  approved: "border-l-green-500/50",
  rejected: "border-l-red-500/50",
  queued: "border-l-yellow-500/50",
  running: "border-l-blue-500",
  done: "border-l-emerald-500",
};

const TASK_DOT_COLORS: Record<string, string> = {
  draft: "bg-zinc-700",
  approved: "bg-green-500/60",
  rejected: "bg-red-500/60",
  queued: "bg-yellow-500/60",
  running: "bg-blue-500",
  done: "bg-emerald-500",
};

const PLAN_STATUS_STYLES: Record<string, string> = {
  draft: "bg-zinc-800 text-zinc-400 border-zinc-700",
  executing: "bg-blue-500/10 text-blue-400 border-blue-500/20",
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
  const [newTask, setNewTask] = useState({ title: "", description: "", acceptance_criteria: "", repo: "", destination: "github", jira_project: "" });
  const [executing, setExecuting] = useState(false);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [jiraReady, setJiraReady] = useState(false);
  const { toast } = useToast();

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
    const hasActive = plan.tasks.some((t) => t.status === "queued" || t.status === "running");
    if (!hasActive && plan.status !== "executing") return;
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
      await api.addTask(planId, { ...newTask, order });
      toast("Task added");
      setNewTask({ title: "", description: "", acceptance_criteria: "", repo: "", destination: "github", jira_project: "" });
      setShowAddTask(false);
      refresh();
    } catch {
      toast("Failed to add task", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleExecute = async () => {
    setExecuting(true);
    try {
      const result = await api.approveAllAndExecute(planId);
      toast(`Executing — ${result.tasks_queued} task${result.tasks_queued !== 1 ? "s" : ""} queued`);
      refresh();
    } catch {
      toast("Failed to execute plan", "error");
    } finally {
      setExecuting(false);
    }
  };

  const handleDeletePlan = async () => {
    if (!confirm("Delete this plan and all its tasks? This cannot be undone.")) return;
    try {
      await api.deletePlan(planId);
      toast("Plan deleted");
      router.push("/plans");
    } catch {
      toast("Failed to delete plan", "error");
    }
  };

  const handleApprove = async (taskId: string) => {
    setActionLoading(taskId + ":approve");
    try {
      await api.approveTask(planId, taskId);
      toast("Task approved");
      const updated = await api.getPlan(planId);
      setPlan(updated);
      // Auto-execute if all tasks are now approved (no drafts left)
      const remaining = updated.tasks.filter((t) => t.status === "draft").length;
      if (remaining === 0 && updated.status === "draft") {
        setExecuting(true);
        try {
          const result = await api.executePlan(planId);
          toast(`All approved — ${result.tasks_queued} task${result.tasks_queued !== 1 ? "s" : ""} queued`);
          refresh();
        } catch {
          toast("Failed to auto-execute", "error");
        } finally {
          setExecuting(false);
        }
      }
    } catch {
      toast("Failed to approve task", "error");
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
          </div>
        </div>
        {plan.status === "draft" && draftCount > 0 && (
          <div className="flex items-center gap-2">
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
              {executing ? "Executing..." : "Approve all"}
            </button>
          </div>
        )}
        {plan.status !== "draft" && (
          <button
            onClick={handleDeletePlan}
            className="px-3 py-2 text-zinc-600 hover:text-red-400 text-sm transition-colors"
          >
            Delete
          </button>
        )}
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

      <div className="relative">
        {/* Vertical connector line */}
        {plan.tasks.length > 1 && (
          <div className="absolute left-[19px] top-6 bottom-6 w-px bg-zinc-800" />
        )}

        <div className="space-y-0">
          {plan.tasks.map((task, idx) => (
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
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Destination</label>
                  <div className="flex gap-2">
                    {(["github", "jira"] as const).map((d) => (
                      <button key={d} disabled={d === "jira" && !jiraReady} onClick={() => setEditForm((f) => ({ ...f, destination: d }))} className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${d === "jira" && !jiraReady ? "opacity-40 cursor-not-allowed" : "cursor-pointer"} ${(editForm.destination ?? task.destination ?? "github") === d ? "bg-zinc-700 text-zinc-100 border-zinc-600" : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"}`}>
                        {d === "github" ? "GitHub Issue" : "Jira Ticket"}
                      </button>
                    ))}
                  </div>
                  {!jiraReady && <p className="text-xs text-zinc-600 mt-1">Configure Jira integration in Settings to enable Jira tickets.</p>}
                </div>
                {(editForm.destination ?? task.destination) === "jira" && (
                  <input value={editForm.jira_project ?? task.jira_project ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, jira_project: e.target.value }))} className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500" placeholder="Jira project key (e.g. PROJ) — blank uses default" />
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
                      {task.destination === "jira" && (
                        <span className="px-1.5 py-0.5 rounded-full text-xs border bg-blue-500/10 text-blue-300 border-blue-500/20">Jira{task.jira_project ? ` · ${task.jira_project}` : ""}</span>
                      )}
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
                      {task.repo && <span className="text-xs text-zinc-600 font-mono">{task.repo}</span>}
                      {task.approved_by && <span className="text-xs text-zinc-600">approved by {task.approved_by}</span>}
                      {task.status === "running" && <span className="text-xs text-blue-400 animate-pulse">Processing…</span>}
                    </div>
                    {task.description && <p className="text-sm text-zinc-400 mt-2 ml-7 leading-relaxed">{task.description}</p>}
                    {task.acceptance_criteria && (
                      <div className="mt-3 ml-7">
                        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Acceptance criteria</p>
                        <pre className="text-sm text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed">{task.acceptance_criteria}</pre>
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
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Destination</label>
                <div className="flex gap-2">
                  {(["github", "jira"] as const).map((d) => (
                    <button key={d} disabled={d === "jira" && !jiraReady} onClick={() => setNewTask((t) => ({ ...t, destination: d }))} className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${d === "jira" && !jiraReady ? "opacity-40 cursor-not-allowed" : "cursor-pointer"} ${newTask.destination === d ? "bg-zinc-700 text-zinc-100 border-zinc-600" : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"}`}>
                      {d === "github" ? "GitHub Issue" : "Jira Ticket"}
                    </button>
                  ))}
                </div>
                {!jiraReady && <p className="text-xs text-zinc-600 mt-1">Configure Jira integration in Settings to enable Jira tickets.</p>}
              </div>
              {newTask.destination === "jira" && (
                <input value={newTask.jira_project} onChange={(e) => setNewTask((t) => ({ ...t, jira_project: e.target.value }))} placeholder="Jira project key (e.g. PROJ) — blank uses default" className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500" />
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
        <p className="text-xs text-zinc-600 mt-6 ml-8">Approve individual tasks or click &ldquo;Approve all&rdquo; to start. Approving the last task auto-triggers execution.</p>
      )}
    </div>
  );
}
