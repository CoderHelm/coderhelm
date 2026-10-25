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
  useListParams,
  usePagedList,
  useTeamRepos,
} from "@/components/list";
import { planStatusLook } from "./status";

// The status toggles: each is one plan status.
const TABS = [
  { value: "all", label: GROUP_LABEL.all, status: "" },
  { value: "active", label: GROUP_LABEL.active, status: "executing", tone: "live" },
  { value: "waiting", label: GROUP_LABEL.waiting, status: "waiting", tone: "waiting" },
  { value: "draft", label: "Draft", status: "draft", tone: "neutral" },
  { value: "done", label: GROUP_LABEL.done, status: "done", tone: "success" },
] as const;

function planMatches(plan: Plan, q: string): boolean {
  if (!q) return true;
  const hay = [plan.title, plan.description, plan.repo].filter(Boolean).join(" ").toLowerCase();
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
  // A running plan is pinned to the top: it is the one people come back to.
  const shown = (tab.status ? matched.filter((p) => p.status === tab.status) : matched)
    .slice()
    .sort((a, b) => Number(b.status === "executing") - Number(a.status === "executing"));
  const filtered = !!(q || repo || tab.value !== "all");
  const clear = () => setParams({ q: "", status: "all", repo: "" });

  return (
    <Page>
      <PageHeader
        title="Plans"
        lead="Describe a bigger change and Coderhelm splits it into small steps. You approve them, and it builds them one at a time."
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
              count: t.status ? matched.filter((p) => p.status === t.status).length : matched.length,
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
            A plan splits a bigger change into small steps. Coderhelm builds them one at a time, and you approve each one.
          </ListEmpty>
        ) : shown.length === 0 ? (
          <ListEmpty title={q ? `No plans match “${q}”` : "No plans here"} onClear={clear}>
            {next ? "Only the plans loaded so far were searched. Load more to search older ones." : undefined}
          </ListEmpty>
        ) : (
          <List label="Plans">
            {shown.map((plan) => {
              const look = planStatusLook(plan.status);
              return (
                <ListRow
                  key={plan.plan_id}
                  testId="plan-row"
                  data={{ status: plan.status }}
                  title={plan.title || "Untitled plan"}
                  titleText={plan.title || undefined}
                  href={`/plans/detail?id=${plan.plan_id}`}
                  meta={[
                    !repo ? plan.repo || null : null,
                    plan.task_count ? `${plan.task_count} task${plan.task_count === 1 ? "" : "s"}` : null,
                  ]}
                  summary={plainSummary(plan.description)}
                  chips={<StatusText look={look} />}
                  time={plan.created_at}
                />
              );
            })}
          </List>
        )}
        {!loading && !error && <LoadMore hasMore={!!next} loading={loadingMore} failed={moreFailed} onClick={loadMore} />}
      </div>
    </Page>
  );
}

/** A plan's description as one plain line: links become "link" so a row never shows a raw URL. */
function plainSummary(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  return text.replace(/https?:\/\/\S+/g, "(link)").replace(/[#*`>]/g, "").replace(/\s+/g, " ").trim() || undefined;
}
