"use client";

import { Suspense, useEffect, useState, useCallback, type ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { WorkUsedLine } from "@/components/work-used";
import { api, type Plan, type Task, type Repo, type Openspec, errorStatus } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { Skeleton } from "@/components/skeleton";
import { Markdown } from "@/components/markdown";
import { Callout } from "@/components/callout";
import { Page } from "@/components/page";
import { SectionNav, type NavSection } from "@/components/section-nav";
import { ExternalLinkIcon } from "@/components/icons";
import { List, ListRow, MoreMenu, StatusText, Time, TONES } from "@/components/list";
import { focusRing, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { planStatusLook, taskStatusLook } from "../status";
import { TaskChecklist, type NewTask, type TaskActions } from "./tasks";
import { SpecDocument, downloadOpenspec } from "./spec";
import { PlanDetails, destinationWords } from "./details";
import { SaveTemplateDialog } from "./template-dialog";

// A plan reads as a document: its title and one summary line, the one thing
// to do next, then the plan itself (what and why, the tasks as a checklist,
// the written spec) with a section list beside it on wide screens. Runs and
// PRs it opened are list rows; everything rarely needed sits in Details.

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

const backLink = (
  <Link href="/plans" className={`rounded text-sm text-zinc-500 hover:text-zinc-300 ${focusRing}`}>
    ← Plans
  </Link>
);

type FullPlan = Plan & { tasks: Task[] };

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

  const actions: TaskActions = {
    busy,
    approve: (id) =>
      void taskAction(`${id}:approve`, () => api.approveTask(planId, id), "Task approved & queued", (e) =>
        e instanceof Error ? e.message : "Failed to approve task",
      ),
    reject: (id) => void taskAction(`${id}:reject`, () => api.rejectTask(planId, id), "Task rejected", "Failed to reject task"),
    remove: (id) => void taskAction(`${id}:delete`, () => api.deleteTask(planId, id), "Task removed", "Failed to remove task"),
    retry: (id) => void taskAction(`${id}:retry`, () => api.forceRunTask(planId, id), "Task retried", "Failed to retry task"),
    forceRun: async (id) => {
      setBusy(id);
      // Optimistic: move to queued immediately
      setPlan((prev) => (prev ? { ...prev, tasks: prev.tasks.map((t) => (t.task_id === id ? { ...t, status: "queued" } : t)) } : prev));
      try {
        await api.forceRunTask(planId, id);
      } catch {
        refresh();
      }
      setBusy(null);
    },
    setDependency: async (id, val) => {
      // Optimistic update to avoid page flash
      setPlan((prev) =>
        prev ? { ...prev, tasks: prev.tasks.map((t) => (t.task_id === id ? { ...t, depends_on: val || undefined } : t)) } : prev,
      );
      try {
        await api.updateTask(planId, id, { depends_on: val });
      } catch {
        toast("Failed to update dependency", "error");
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
      toast("Failed to update destination", "error");
    } finally {
      setUpdatingDest(false);
    }
  };

  const handleExecute = async () => {
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
      toast("Openspec written");
    } catch {
      toast("Failed to generate openspec", "error");
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
        {backLink}
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
        {backLink}
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
  const isDraft = plan.status === "draft";
  const draftCount = tasks.filter((t) => t.status === "draft").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const worked = tasks.filter((t) => t.run_id || t.pr_url);
  const prs = tasks.filter((t) => t.pr_url);
  const repoNames = [...new Set([plan.repo, ...tasks.map((t) => t.repo)].filter((r): r is string => !!r))];

  const sections: NavSection[] = [
    ...(plan.description ? [{ id: "overview", label: "Overview" }] : []),
    { id: "tasks", label: "Tasks", count: tasks.length },
    ...(worked.length > 0 ? [{ id: "work", label: "Runs and PRs", count: worked.length }] : []),
    { id: "spec", label: "Spec" },
    { id: "details", label: "Details" },
  ];

  // The one thing to do next.
  let primary: ReactNode = null;
  if (isDraft && draftCount > 0) {
    primary = (
      <button type="button" onClick={handleExecute} disabled={executing} className={`${primaryButton} font-semibold`}>
        {executing ? "Starting…" : "Approve all and start"}
      </button>
    );
  } else if (prs.length === 1) {
    primary = (
      <a href={prs[0].pr_url} target="_blank" rel="noopener noreferrer" className={`${primaryButton} gap-1.5`}>
        Open PR
        <span aria-hidden="true" className="inline-flex">
          <ExternalLinkIcon />
        </span>
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  } else if (prs.length > 1) {
    primary = (
      <a href="#work" className={secondaryButton}>
        See {prs.length} PRs
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
        <div className="mb-1">{backLink}</div>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <h1 className="min-w-0 flex-1 basis-80 break-words text-2xl font-bold text-zinc-100">{plan.title || "Untitled plan"}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {primary}
            <MoreMenu items={more} />
          </div>
        </div>
        <ul className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500" aria-label="About this plan" data-testid="plan-summary">
          <li>
            <StatusText look={planStatusLook(plan.status)} />
          </li>
          {repoNames.length > 0 && (
            <li title={repoNames.join(", ")}>
              {repoNames.length === 1 ? repoNames[0] : `${repoNames.length} repos`}
            </li>
          )}
          <li>
            {tasks.length === 0
              ? "No tasks"
              : isDraft
                ? `${tasks.length} task${tasks.length === 1 ? "" : "s"}${draftCount > 0 && draftCount < tasks.length ? `, ${draftCount} to review` : ""}`
                : `${doneCount} of ${tasks.length} done`}
          </li>
          <li>
            {isDraft ? (
              <button type="button" onClick={openDetails} className={`rounded underline decoration-zinc-700 underline-offset-2 hover:text-zinc-300 ${focusRing}`}>
                {destinationWords(plan.destination)}
              </button>
            ) : (
              destinationWords(plan.destination)
            )}
          </li>
          {plan.created_at && (
            <li>
              Created <Time iso={plan.created_at} />
            </li>
          )}
        </ul>
        {!isDraft && tasks.length > 0 && (
          <div
            className="mt-3 h-1 max-w-md overflow-hidden rounded-full bg-zinc-800"
            role="progressbar"
            aria-label="Tasks done"
            aria-valuemin={0}
            aria-valuemax={tasks.length}
            aria-valuenow={doneCount}
          >
            <div className="h-full rounded-full bg-emerald-400 transition-all motion-reduce:transition-none" style={{ width: `${(doneCount / tasks.length) * 100}%` }} />
          </div>
        )}
      </header>

      <div className="mt-8 min-w-0 lg:grid lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-10">
        <SectionNav sections={sections} />
        <article className="min-w-0 max-w-3xl space-y-10">
          {plan.description && (
            <DocSection id="overview" title="Overview">
              <div className="text-sm [&_p]:text-zinc-300">
                <Markdown>{plan.description}</Markdown>
              </div>
            </DocSection>
          )}

          <DocSection
            id="tasks"
            title="Tasks"
            note={
              isDraft && draftCount > 0
                ? "Approve tasks one at a time, or approve them all and start. Approving the last one starts the plan."
                : undefined
            }
          >
            <TaskChecklist tasks={tasks} planRepo={plan.repo} draft={isDraft} repos={repos} actions={actions} />
          </DocSection>

          {worked.length > 0 && (
            <DocSection id="work" title="Runs and PRs">
              <List label="Runs and PRs">
                {worked.map((t) => (
                  <ListRow
                    key={t.task_id}
                    status={taskStatusLook(t.status)}
                    title={t.title}
                    href={t.run_id ? `/runs/detail?id=${t.run_id}` : undefined}
                    externalHref={!t.run_id ? t.pr_url : undefined}
                    meta={[
                      taskStatusLook(t.status).label,
                      t.repo || plan.repo,
                      t.run_id && t.pr_url && (
                        <a key="pr" href={t.pr_url} target="_blank" rel="noopener noreferrer" className={`rounded text-zinc-400 hover:text-zinc-200 hover:underline ${focusRing}`}>
                          {prLabel(t.pr_url)}
                        </a>
                      ),
                    ]}
                  />
                ))}
              </List>
            </DocSection>
          )}

          <DocSection id="spec" title="Spec">
            <SpecDocument openspec={openspec} writing={writingSpec} onWrite={writeSpec} />
          </DocSection>

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

/** "https://github.com/o/r/pull/12" → "PR #12". */
function prLabel(url: string): string {
  const n = url.match(/\/pull\/(\d+)/)?.[1];
  return n ? `PR #${n}` : "PR";
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
      {note && <p className="mb-3 max-w-prose text-xs text-zinc-500">{note}</p>}
      {children}
    </section>
  );
}
