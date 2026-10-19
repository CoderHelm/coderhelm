"use client";

import Link from "next/link";
import { api, type Plan } from "@/lib/api";
import { TableSkeleton } from "@/components/skeleton";
import { Callout } from "@/components/callout";
import { usePagedList, LoadMoreButton } from "@/components/load-more";
import { focusRing, primaryButton, secondaryButton, linkButton } from "@/components/ui";
import { Page, PageHeader } from "@/components/page";
import { PlanStatusPill } from "./status";

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!iso || Number.isNaN(t)) return "—";
  const seconds = Math.floor((Date.now() - t) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function PlansPage() {
  const { items: plans, next, loading, loadingMore, error, loadMore, reload } = usePagedList<Plan>(
    (cursor) => api.listPlans(cursor).then((d) => ({ items: d.plans, next: d.next_cursor })),
    [],
  );

  const executingPlan = plans.find((p) => p.status === "executing");

  return (
    <Page>
      <PageHeader
        title="Plans"
        lead="Chat with Coderhelm to break work into ordered tasks, then approve them and let it build each one."
        actions={
          <>
            {executingPlan && (
              <Link href={`/plans/detail?id=${executingPlan.plan_id}`} className={secondaryButton}>
                Continue running plan
              </Link>
            )}
            <Link href="/plans/new" className={primaryButton}>
              New plan
            </Link>
          </>
        }
      />

      <div className="mt-6">
      {loading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : error ? (
        <Callout variant="error" title="Couldn't load your plans">
          <button type="button" onClick={reload} className={linkButton}>
            Try again
          </button>
        </Callout>
      ) : plans.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-8 sm:p-12 text-center text-zinc-500">
          <p className="text-lg mb-2 text-zinc-300">No plans yet</p>
          <p className="text-sm mb-4">
            A plan breaks a feature into ordered GitHub issues or Jira tickets that Coderhelm builds one by one.
          </p>
          <Link href="/plans/new" className={linkButton}>
            Create your first plan
          </Link>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-left">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Title</th>
                <th scope="col" className="px-4 py-3 font-medium hidden md:table-cell">Repo</th>
                <th scope="col" className="px-4 py-3 font-medium hidden sm:table-cell">Tasks</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium hidden sm:table-cell">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {plans.map((plan) => (
                <tr key={plan.plan_id} className="hover:bg-zinc-900/50">
                  <td className="px-4 py-3 min-w-0">
                    <Link
                      href={`/plans/detail?id=${plan.plan_id}`}
                      className={`text-zinc-100 hover:underline font-medium rounded break-words ${focusRing}`}
                    >
                      {plan.title || "Untitled plan"}
                    </Link>
                    {plan.description && (
                      <p className="text-zinc-500 text-xs mt-0.5 line-clamp-2 max-w-md">{plan.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-zinc-400 font-mono text-xs">{plan.repo || "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 hidden sm:table-cell">{plan.task_count || "—"}</td>
                  <td className="px-4 py-3">
                    <PlanStatusPill status={plan.status} />
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap hidden sm:table-cell">
                    {timeAgo(plan.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMoreButton hasMore={!!next} loading={loadingMore} onClick={loadMore} />
      </div>
    </Page>
  );
}
