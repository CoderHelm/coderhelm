"use client";

import { Suspense, useEffect, useState, useCallback, type ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { WorkUsedLine } from "@/components/work-used";
import { api, type FullPlan, type Task, type Repo, type Openspec, type PlanEstimate, errorStatus } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { Skeleton } from "@/components/skeleton";
import { Markdown } from "@/components/markdown";
import { Callout } from "@/components/callout";
import { Page, PageHeader } from "@/components/page";
import { SectionNav, type NavSection } from "@/components/section-nav";
import { ChevronRightIcon, ExternalLinkIcon } from "@/components/icons";
import { StatusText, Time, TONES } from "@/components/list";
import { focusRing, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { money, moneyRange, planState, planStatusLook, StateBar, taskState } from "../status";
import { TaskChecklist, type NewTask, type TaskActions } from "./tasks";
import { NeedsStrip } from "./needs";
import { CriteriaList } from "./criteria";
import { SpecDocument, downloadOpenspec } from "./spec";
import { PlanDetails, destinationWords } from "./details";
import { SaveTemplateDialog } from "./template-dialog";

// A plan page in the order a person needs it: the goal and one status line
// with the main action; what needs them, each the exact ask; what done means
// with the evidence so far; the tasks, each with its state, pull requests,
// attempts and cost; then the written spec, folded. Every state comes from
// the runs and pull requests, so the page never says Done before the work
// merged.

export default function PlanDetailPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <PlanDetail />
    </Suspense>
  );
}

function DetailSkeleton() {
  return (
    <Page>
      <SkeletonBody />
    </Page>
  );
}

function SkeletonBody() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading the plan">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-7 w-full max-w-md" />
      <Skeleton className="h-4 w-full max-w-sm" />
      <div className="space-y-2 pt-6">
        <Skeleton className="h-4 w-full max-w-2xl" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <Skeleton className="h-40 w-full max-w-3xl" />
      </div>
    </div>
  );
}

/** "about 3 to 4 runs, $6 to $14, from your last 40 runs", or what is known. */
function estimateWords(e: PlanEstimate | null | undefined, tasks: number): string {
  const runs = !e || e.runs_low === e.runs_high ? `${tasks} run${tasks === 1 ? "" : "s"}` : `${e.runs_low} to ${e.runs_high} runs`;
  if (!e || e.sample === 0) return `${runs}; there is no run history yet to estimate the cost from`;
  return `${runs}, about ${moneyRange(e.cost_low, e.cost_high)} from your team's last ${e.sample} runs`;
}

/** One run's cost, for Retry and Start now. */
function perRunWords(e: PlanEstimate | null | undefined): string {
  if (!e || e.sample === 0) return "It starts a new run.";
  return `It starts a new run. Runs like it cost about ${moneyRange(e.per_run_low, e.per_run_high)}.`;
}

function PlanDetail() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const planId = searchParams.get("id") ?? "";
  const [plan, setPlan] = useState<FullPlan | null>(null);
  const [loading, setLoading] = useState(true);
  // "missing" = the API answered 404; "failed" = anything else (offline, 500).
  const [loadError, setLoadError] = useState<"missing" | "failed" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [jiraReady, setJiraReady] = useState(false);
  const [updatingDest, setUpdatingDest] = useState(false);
  // undefined = not asked yet; null = none written.
  const [openspec, setOpenspec] = useState<Openspec | null | undefined>(undefined);
  const [writingSpec, setWritingSpec] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // The spec is read while the plan is a draft, then folds below the work.
  const [specOpen, setSpecOpen] = useState<boolean | null>(null);
  const { toast } = useToast();
  const { confirm } = useConfirm();

  useEffect(() => {
    api.listRepos().then((data) => setRepos(data.repos.filter((r) => r.enabled))).catch(() => {});
    api.getJiraCheck().then((c) => setJiraReady(c.ready)).catch(() => {});
  }, []);

  // Reload in place: the skeleton shows only on the first load, so approving or
  // editing a task does not blank the page and lose the scroll position.
  const refresh = useCallback(() => {
    if (!planId) return;
    api
      .getPlan(planId)
      .then((p) => {
        setPlan(p);
        setLoadError(null);
      })
      .catch((e: unknown) => {
        setLoadError(errorStatus(e) === 400 || errorStatus(e) === 404 ? "missing" : "failed");
      })
      .finally(() => setLoading(false));
  }, [planId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // The written spec is part of the document, so it is read with the plan.
  const loaded = !!plan;
  useEffect(() => {
    if (!planId || !loaded) return;
    let live = true;
    api
      .getPlanOpenspec(planId)
      .then((d) => live && setOpenspec(d))
      .catch(() => live && setOpenspec(null));
    return () => {
      live = false;
    };
  }, [planId, loaded]);

  // Keep reading while work is open: each read derives the states again.
  const open = !!plan && ["running", "needs_you", "stalled"].includes(planState(plan));
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      api.getPlan(planId).then(setPlan).catch(() => {});
    }, 10_000);
    return () => clearInterval(interval);
  }, [open, planId]);

  /** Runs one task action with its busy mark, a toast, and a reload. */
  const taskAction = async (key: string, run: () => Promise<unknown>, ok: string, fail: string | ((e: unknown) => string)) => {
    setBusy(key);
    try {
      await run();
      toast(ok);
      refresh();
      return true;
    } catch (e) {
      toast(typeof fail === "function" ? fail(e) : fail, "error");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const estimate = plan?.estimate;
  const started = !!plan && planState(plan) !== "drafting";

  const actions: TaskActions = {
    busy,
    approve: async (id) => {
      // Approving a task starts its run now: say what that costs first.
      const ok = await confirm({
        title: "Approve and start this task?",
        message: `${perRunWords(estimate)} The plan stays open for its other tasks.`,
        confirmLabel: "Approve and start",
      });
      if (!ok) return;
      void taskAction(`${id}:approve`, () => api.approveTask(planId, id), "Approved. Its run starts now.", (e) =>
        e instanceof Error ? e.message : "Couldn't approve the task. Try again.",
      );
    },
    drop: (id) => void taskAction(`${id}:drop`, () => api.rejectTask(planId, id), "Task dropped", "Couldn't drop the task. Try again."),
    remove: (id) => void taskAction(`${id}:delete`, () => api.deleteTask(planId, id), "Task removed", "Couldn't remove the task. Try again."),
    retry: async (task: Task) => {
      const ok = await confirm({ title: `Retry "${task.title}"?`, message: perRunWords(estimate), confirmLabel: "Retry" });
      if (!ok) return;
      const last = task.runs?.[task.runs.length - 1]?.run_id ?? task.run_id;
      // A task whose ticket was filed retries its run; one that never filed
      // its ticket files it again.
      const run = last && task.ticket_filed ? () => api.retryRun(last) : () => api.forceRunTask(planId, task.task_id);
      void taskAction(`${task.task_id}:retry`, run, "Trying the task again", "Couldn't retry the task. Try again.");
    },
    forceRun: async (id) => {
      const ok = await confirm({
        title: "Start this task now?",
        message: `It runs before the task it waits on has merged. ${perRunWords(estimate)}`,
        confirmLabel: "Start now",
      });
      if (!ok) return;
      void taskAction(`${id}:force`, () => api.forceRunTask(planId, id), "Starting the task", "Couldn't start the task. Try again.");
    },
    setDependency: async (id, val) => {
      // Optimistic update to avoid page flash
      setPlan((prev) =>
        prev ? { ...prev, tasks: prev.tasks.map((t) => (t.task_id === id ? { ...t, depends_on: val || undefined } : t)) } : prev,
      );
      try {
        await api.updateTask(planId, id, { depends_on: val });
      } catch {
        toast("Couldn't change the order. Try again.", "error");
        refresh();
      }
    },
    save: (id, edit) => taskAction(`${id}:save`, () => api.updateTask(planId, id, edit), "Task updated", "Failed to update task"),
    add: (t: NewTask) => {
      if (!t.title.trim()) return Promise.resolve(false);
      const order = plan?.tasks.length ?? 0;
      const payload: Record<string, unknown> = { ...t, destination: plan?.destination ?? "github", order };
      if (!t.depends_on) delete payload.depends_on;
      return taskAction("add", () => api.addTask(planId, payload), "Task added", "Failed to add task");
    },
  };

  const handleChangeDestination = async (dest: "github" | "jira") => {
    if (!plan || dest === (plan.destination ?? "github")) return;
    setUpdatingDest(true);
    try {
      await api.updatePlan(planId, { destination: dest });
      toast(`Destination changed to ${dest === "github" ? "GitHub Issues" : "Jira Tickets"}`);
      refresh();
    } catch {
      toast("Couldn't change where the tasks go. Try again.", "error");
    } finally {
      setUpdatingDest(false);
    }
  };

  const handleExecute = async () => {
    const drafts = plan?.tasks.filter((x) => taskState(x) === "draft").length ?? 0;
    const ok = await confirm({
      title: `Approve and start ${drafts} task${drafts === 1 ? "" : "s"}?`,
      message: `This starts ${estimateWords(estimate, drafts)}. Each task's state follows its run and pull request until it merges.`,
      confirmLabel: "Approve and start",
    });
    if (!ok) return;
    setExecuting(true);
    try {
      const result = await api.approveAllAndExecute(planId);
      toast(`Started: ${result.tasks_queued} task${result.tasks_queued !== 1 ? "s" : ""} queued`);
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't start the plan", "error");
    } finally {
      setExecuting(false);
    }
  };

  const handleDeletePlan = async () => {
    if (!(await confirm({ title: "Delete plan", message: "Delete this plan and all its tasks? This cannot be undone.", confirmLabel: "Delete", destructive: true }))) return;
    try {
      await api.deletePlan(planId);
      toast("Plan deleted");
      router.push("/plans");
    } catch (e) {
      // Deleting a plan needs an admin; say so instead of a bare failure.
      toast(e instanceof Error && e.message.includes("403") ? "Only admins can delete plans" : "Couldn't delete the plan", "error");
    }
  };

  const writeSpec = async () => {
    setWritingSpec(true);
    try {
      await api.generatePlanOpenspec(planId);
      const data = await api.getPlanOpenspec(planId);
      setOpenspec(data);
      toast("Spec written");
    } catch {
      toast("Couldn't write the spec", "error");
    } finally {
      setWritingSpec(false);
    }
  };

  const openDetails = () => {
    setDetailsOpen(true);
    requestAnimationFrame(() => document.getElementById("details")?.scrollIntoView({ block: "start" }));
  };

  if (!planId) {
    return (
      <Page>
        <p className="mt-4 text-zinc-500">No plan selected. Pick one from the plans list.</p>
      </Page>
    );
  }

  // The same <Page> as the loaded states, so the column is not remounted.
  if (loading && !plan) {
    return (
      <Page>
        <SkeletonBody />
      </Page>
    );
  }

  if (!plan) {
    return (
      <Page className="space-y-4">
        {loadError === "missing" ? (
          <Callout variant="warning" title="Plan not found">
            <p>It may have been deleted, or it belongs to another team.</p>
          </Callout>
        ) : (
          <Callout variant="error" title="Couldn't load this plan">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                refresh();
              }}
              className={linkButton}
            >
              Try again
            </button>
          </Callout>
        )}
      </Page>
    );
  }

  const tasks = plan.tasks;
  const state = planState(plan);
  const isDraft = state === "drafting";
  const draftCount = tasks.filter((t) => taskState(t) === "draft").length;
  const needs = plan.needs ?? [];
  const criteria = plan.criteria ?? [];
  const readyPrs = tasks.flatMap((t) => (t.prs ?? []).filter((p) => p.tone === "ready"));
  const repoNames = [...new Set([plan.repo, ...tasks.map((t) => t.repo)].filter((r): r is string => !!r))];

  const sections: NavSection[] = [
    ...(needs.length > 0 ? [{ id: "needs", label: "Needs you", count: needs.length }] : []),
    { id: "criteria", label: "What done means", count: criteria.length || undefined },
    { id: "tasks", label: "Tasks", count: tasks.length },
    { id: "spec", label: "Spec" },
    { id: "details", label: "Details" },
  ];

  // The one thing to do next.
  let primary: ReactNode = null;
  if (isDraft && draftCount > 0) {
    primary = (
      <button type="button" onClick={handleExecute} disabled={executing} className={`${primaryButton} font-semibold`}>
        {executing ? "Starting…" : "Approve and start"}
      </button>
    );
  } else if (needs.length > 0) {
    primary = (
      <a href="#needs" className={`${primaryButton} font-semibold`}>
        {needs.length} need{needs.length === 1 ? "s" : ""} you
      </a>
    );
  } else if (readyPrs.length > 0) {
    primary = (
      <a href={readyPrs[0].url} target="_blank" rel="noopener noreferrer" className={`${primaryButton} gap-1.5`}>
        Merge PR #{readyPrs[0].number}
        <span aria-hidden="true" className="inline-flex">
          <ExternalLinkIcon />
        </span>
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }

  const more = [
    { label: "Save as template", onSelect: () => setTemplateOpen(true) },
    ...(openspec ? [{ label: "Download the spec", onSelect: () => downloadOpenspec(openspec) }] : []),
    { label: "Delete plan", onSelect: handleDeletePlan },
  ];

  return (
    <Page>
      <header className="min-w-0" data-testid="plan-header">
        <PageHeader detail title={plan.title || "Untitled plan"} actions={primary} more={more} />
        <ul className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400" aria-label="About this plan" data-testid="plan-summary">
          <li>
            <StatusText look={planStatusLook(state)} />
          </li>
          <li data-testid="plan-count-line">{plan.summary || `${tasks.length} task${tasks.length === 1 ? "" : "s"}`}</li>
          {(plan.cost_usd ?? 0) > 0 && (
            <li className="tabular-nums" title="What its runs cost so far, every attempt counted">
              {money(plan.cost_usd)} over {plan.attempts ?? 0} run{plan.attempts === 1 ? "" : "s"}
            </li>
          )}
          {repoNames.length > 0 && (
            <li title={repoNames.join(", ")}>{repoNames.length === 1 ? repoNames[0] : `${repoNames.length} repos`}</li>
          )}
          <li>
            {isDraft ? (
              <button type="button" onClick={openDetails} className={`rounded underline decoration-zinc-700 underline-offset-2 hover:text-zinc-300 ${focusRing}`}>
                {destinationWords(plan.destination)}
              </button>
            ) : (
              destinationWords(plan.destination)
            )}
          </li>
          {plan.last_activity_at ? (
            <li>
              Last activity <Time iso={plan.last_activity_at} />
            </li>
          ) : plan.created_at ? (
            <li>
              Created <Time iso={plan.created_at} />
            </li>
          ) : null}
        </ul>
        {!isDraft && <StateBar counts={plan.counts} className="mt-3" />}
        {isDraft && draftCount > 0 && (
          <p className="mt-3 max-w-prose text-xs text-zinc-300" data-testid="plan-estimate">
            Approving all {draftCount} task{draftCount === 1 ? "" : "s"} starts {estimateWords(estimate, draftCount)}.
          </p>
        )}
        {state === "stalled" && (
          <p className={`mt-3 text-xs ${TONES.waiting.text}`}>Nothing has moved on this plan for 3 days. Its open tasks are below.</p>
        )}
      </header>

      <div className="mt-8 min-w-0 lg:grid lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-10">
        <SectionNav sections={sections} />
        <article className="min-w-0 max-w-3xl space-y-10">
          <NeedsStrip
            items={needs}
            tasks={tasks}
            actions={{
              busy,
              retry: actions.retry,
              drop: actions.drop,
              approveRest: () => void handleExecute(),
            }}
          />

          <DocSection id="criteria" title="What done means">
            <CriteriaList criteria={criteria} tasks={tasks} folded={!isDraft} />
          </DocSection>

          <DocSection
            id="tasks"
            title="Tasks"
            note={
              isDraft && draftCount > 0
                ? "Approve them all and start, or approve one at a time: the plan stays open for the rest either way."
                : state === "running" || state === "stalled"
                  ? "To steer a task while it works, comment on its pull request or answer on its run page."
                  : undefined
            }
          >
            <TaskChecklist planId={planId} tasks={tasks} planRepo={plan.repo} started={started} repos={repos} actions={actions} />
          </DocSection>

          <section id="spec" aria-labelledby="spec-heading" className="min-w-0 scroll-mt-8">
            <details
              className="group"
              data-testid="plan-spec"
              open={specOpen ?? isDraft}
              onToggle={(e) => {
                const o = (e.currentTarget as HTMLDetailsElement).open;
                if (o !== (specOpen ?? isDraft)) setSpecOpen(o);
              }}
            >
              <summary className={`flex cursor-pointer list-none items-center gap-2 border-b border-zinc-800 pb-2 [&::-webkit-details-marker]:hidden ${focusRing}`}>
                <span aria-hidden="true" className="inline-flex text-zinc-400 transition-transform group-open:rotate-90 motion-reduce:transition-none">
                  <ChevronRightIcon />
                </span>
                <h2 id="spec-heading" className="text-base font-semibold text-zinc-100">
                  Spec
                </h2>
                <span className="text-xs text-zinc-400">what and why, as written</span>
              </summary>
              <div className="mt-4 space-y-6">
                {plan.description && (
                  <div className="text-sm [&_p]:text-zinc-300" data-testid="plan-overview">
                    <Markdown>{plan.description}</Markdown>
                  </div>
                )}
                <SpecDocument openspec={openspec} writing={writingSpec} onWrite={writeSpec} />
              </div>
            </details>
          </section>

          <section id="details" aria-label="Details" className="min-w-0 scroll-mt-8 space-y-3">
            <PlanDetails
              plan={plan}
              open={detailsOpen}
              onOpenChange={setDetailsOpen}
              jiraReady={jiraReady}
              updatingDest={updatingDest}
              onDestination={handleChangeDestination}
            />
            <WorkUsedLine
              query={
                plan.chat_id && plan.created_at
                  ? {
                      origin: `plan chat ${plan.chat_id}`,
                      // The chat came before the plan was saved.
                      since: new Date(new Date(plan.created_at).getTime() - 24 * 3600_000).toISOString(),
                    }
                  : null
              }
              title="What the chat used"
            />
          </section>
        </article>
      </div>

      <SaveTemplateDialog planId={planId} plan={plan} open={templateOpen} onOpenChange={setTemplateOpen} />
    </Page>
  );
}

/** One part of the plan document: a readable heading and its body. */
function DocSection({
  id,
  title,
  aside,
  note,
  children,
}: {
  id: string;
  title: string;
  aside?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="min-w-0 scroll-mt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-zinc-800 pb-2">
        <h2 id={`${id}-heading`} className="text-base font-semibold text-zinc-100">
          {title}
        </h2>
        {aside && <span className={`text-xs ${TONES.neutral.text}`}>{aside}</span>}
      </div>
      {note && <p className="mb-3 max-w-prose text-xs text-zinc-400">{note}</p>}
      {children}
    </section>
  );
}
