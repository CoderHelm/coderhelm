"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { api, type Plan } from "@/lib/api";
import { primaryButton } from "@/components/ui";
import { Page, PageHeader } from "@/components/page";
import {
  GROUP_LABEL,
  List,
  ListEmpty,
  ListError,
  ListRow,
  ListSkeleton,
  ListToolbar,
  LoadMore,
  StatusText,
  TONES,
  useListParams,
  usePagedList,
  useTeamRepos,
} from "@/components/list";
import { money, planState, planStatusLook, StateBar } from "./status";

// The toggles: each is a set of plan states. A plan is Active while its work
// runs (or sits stalled); Needs you when a task asks a person something,
// failed, or drafts are left once the rest finished; Done only when every
// task merged or was dropped.
const TABS = [
  { value: "all", label: GROUP_LABEL.all, states: [] as string[] },
  { value: "active", label: GROUP_LABEL.active, states: ["running", "stalled"], tone: "live" },
  { value: "needs_you", label: "Needs you", states: ["needs_you"], tone: "attention" },
  { value: "drafting", label: "Drafting", states: ["drafting"], tone: "neutral" },
  { value: "done", label: GROUP_LABEL.done, states: ["done"], tone: "success" },
] as const;

// Needs you first, then running work, then the rest by date.
const RANK: Record<string, number> = { needs_you: 0, running: 1, stalled: 2, drafting: 3, done: 4 };

function planMatches(plan: Plan, q: string): boolean {
  if (!q) return true;
  const hay = [plan.title, plan.description, plan.repo, plan.summary].filter(Boolean).join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

export default function PlansPageWithParams() {
  return (
    <Suspense fallback={<Page><PageHeader title="Plans" /><div className="mt-6"><ListSkeleton /></div></Page>}>
      <PlansPage />
    </Suspense>
  );
}

function PlansPage() {
  const [params, setParams] = useListParams({ q: "", status: "all", repo: "" });
  const inTab = (p: Plan, states: readonly string[]) => states.length === 0 || states.includes(planState(p));
  const q = params.q.trim();
  const tab = TABS.find((t) => t.value === params.status) ?? TABS[0];
  const repo = params.repo;
  const teamRepos = useTeamRepos();
  const { items: plans, next, loading, loadingMore, error, moreFailed, loadMore, reload } = usePagedList<Plan>(
    (cursor) => api.listPlans(cursor).then((d) => ({ items: d.plans, next: d.next_cursor })),
    [],
  );

  // Search and repo first, so the toggle counts say what each would show.
  const matched = useMemo(() => plans.filter((p) => planMatches(p, q) && (!repo || p.repo === repo)), [plans, q, repo]);
  // What needs a person is pinned to the top, then running work.
  const shown = matched
    .filter((p) => inTab(p, tab.states))
    .slice()
    .sort((a, b) => (RANK[planState(a)] ?? 9) - (RANK[planState(b)] ?? 9));
  const filtered = !!(q || repo || tab.value !== "all");
  const clear = () => setParams({ q: "", status: "all", repo: "" });

  return (
    <Page>
      <PageHeader
        title="Plans"
        lead="Describe a bigger change and CoderHelm splits it into tasks. Approve them, and each task's state follows its runs and pull requests until it merges."
        actions={
          <Link href="/plans/new" className={primaryButton}>
            New plan
          </Link>
        }
      />

      {!loading && !error && plans.length > 0 && (
        <ListToolbar
          className="mt-6 mb-4"
          search={{
            value: params.q,
            onChange: (v) => setParams({ q: v }, { replace: true }),
            placeholder: "Search plans by name, description or project",
            label: "Search plans",
          }}
          status={{
            label: "Show plans",
            value: tab.value,
            onChange: (v) => setParams({ status: v }),
            options: TABS.map((t) => ({
              value: t.value,
              label: t.label,
              count: matched.filter((p) => inTab(p, t.states)).length,
              tone: "tone" in t ? t.tone : undefined,
            })),
          }}
          repo={{ value: repo, onChange: (v) => setParams({ repo: v }), repos: teamRepos }}
          onClear={filtered ? clear : undefined}
        />
      )}

      <div className={plans.length > 0 && !loading && !error ? "" : "mt-6"}>
        {loading ? (
          <ListSkeleton rows={4} label="Loading plans" />
        ) : error ? (
          <ListError title="Couldn't load your plans" onRetry={reload} />
        ) : plans.length === 0 ? (
          <ListEmpty
            title="No plans yet"
            action={
              <Link href="/plans/new" className={primaryButton}>
                Write your first plan
              </Link>
            }
          >
            A plan splits a bigger change into tasks. You approve them, CoderHelm builds each one, and the plan is done when every task merged.
          </ListEmpty>
        ) : shown.length === 0 ? (
          <ListEmpty title={q ? `No plans match “${q}”` : "No plans here"} onClear={clear}>
            {next ? "Only the plans loaded so far were searched. Load more to search older ones." : undefined}
          </ListEmpty>
        ) : (
          <List label="Plans">
            {shown.map((plan) => {
              const state = planState(plan);
              const look = planStatusLook(state);
              const needs = plan.needs_count ?? 0;
              return (
                <ListRow
                  key={plan.plan_id}
                  testId="plan-row"
                  data={{ status: state }}
                  status={look}
                  title={plan.title || "Untitled plan"}
                  titleText={plan.title || undefined}
                  href={`/plans/detail?id=${plan.plan_id}`}
                  meta={[
                    plan.summary || (plan.task_count ? `${plan.task_count} task${plan.task_count === 1 ? "" : "s"}` : null),
                    plan.cost_usd ? <span key="c" className="tabular-nums">{money(plan.cost_usd)}</span> : null,
                    !repo ? plan.repo || null : null,
                  ]}
                  chips={
                    <>
                      {needs > 0 && (
                        <span data-testid="needs-count" className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONES.attention.chip}`}>
                          {needs} need{needs === 1 ? "s" : ""} you
                        </span>
                      )}
                      <StatusText look={look} />
                    </>
                  }
                  time={plan.last_activity_at || plan.created_at}
                >
                  {plan.counts && state !== "drafting" && <StateBar counts={plan.counts} className="mt-2" />}
                </ListRow>
              );
            })}
          </List>
        )}
        {!loading && !error && <LoadMore hasMore={!!next} loading={loadingMore} failed={moreFailed} onClick={loadMore} />}
      </div>
    </Page>
  );
}
