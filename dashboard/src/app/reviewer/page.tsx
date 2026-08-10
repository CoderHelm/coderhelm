"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Review, type Repo } from "@/lib/api";
import { Skeleton } from "@/components/skeleton";
import { RoleGuard } from "@/components/role-guard";
import { RepoCombobox } from "@/components/repo-combobox";

export default function ReviewerPageGuarded() {
  return (
    <RoleGuard minRole="member">
      <ReviewerPage />
    </RoleGuard>
  );
}

function verdictBadge(v: string) {
  const map: Record<string, string> = {
    APPROVE: "bg-green-500/10 text-green-400 border-green-500/30",
    REQUEST_CHANGES: "bg-red-500/10 text-red-400 border-red-500/30",
    QUESTION: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  };
  const label: Record<string, string> = {
    APPROVE: "Approved",
    REQUEST_CHANGES: "Changes requested",
    QUESTION: "Answered",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${map[v] ?? "bg-zinc-700/30 text-zinc-400 border-zinc-600"}`}>
      {label[v] ?? v}
    </span>
  );
}

// Collapse per-run review records into one entry per PR (newest kept as the
// headline), so re-reviews don't flood the list. `reviews` arrives newest-first.
function groupByPr(reviews: Review[]): { latest: Review; count: number }[] {
  const groups = new Map<string, { latest: Review; count: number }>();
  for (const r of reviews) {
    const key = `${r.repo}#${r.pr_number}`;
    const g = groups.get(key);
    if (g) g.count += 1;
    else groups.set(key, { latest: r, count: 1 });
  }
  return [...groups.values()];
}

function riskBadge(r: string) {
  if (!r || r === "N/A") return null;
  const map: Record<string, string> = {
    LOW: "text-green-400",
    MEDIUM: "text-amber-400",
    HIGH: "text-red-400",
  };
  return <span className={`text-xs font-medium ${map[r] ?? "text-zinc-400"}`}>risk: {r}</span>;
}

function ReviewerPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoFilter, setRepoFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listRepos().then((d) => setRepos(d.repos)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .listReviews(repoFilter || undefined)
      .then((d) => setReviews(d.reviews))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, [repoFilter]);

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between mb-2">
        <h1 className="text-2xl font-bold">Reviewer</h1>
        <Link
          href="/reviewer/config"
          className="text-sm px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors"
        >
          Configure
        </Link>
      </div>
      <p className="text-zinc-400 text-sm mb-5">
        Reviews the agent posted on your PRs. Add the review label to a PR (default{" "}
        <code className="text-zinc-300">ch-review</code>) to trigger one, or reply{" "}
        <code className="text-zinc-300">@coderhelm re-review</code> on a PR.
      </p>

      <div className="mb-5 max-w-sm">
        <RepoCombobox repos={repos} selected={repoFilter} onSelect={setRepoFilter} />
        {repoFilter && (
          <button onClick={() => setRepoFilter("")} className="mt-2 text-xs text-zinc-500 hover:text-zinc-300">
            Clear filter
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-16 text-zinc-500 text-sm border border-dashed border-zinc-800 rounded-lg">
          No reviews yet. Enable the reviewer for a repo and add the review label to a PR.
        </div>
      ) : (
        <div className="space-y-2">
          {groupByPr(reviews).map(({ latest: r, count }) => (
            <Link
              key={`${r.repo}#${r.pr_number}`}
              href={`/reviewer/detail?sk=${encodeURIComponent(r.sk)}`}
              className="block p-4 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {verdictBadge(r.verdict)}
                  {riskBadge(r.risk)}
                  <span className="text-sm text-zinc-300 truncate">
                    {r.repo} <span className="text-zinc-500">#{r.pr_number}</span>
                  </span>
                  {count > 1 && (
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-xs text-zinc-400 shrink-0">
                      {count} reviews
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-500 shrink-0">
                  {r.thumbs_up > 0 && <span className="text-green-400">👍 {r.thumbs_up}</span>}
                  {r.thumbs_down > 0 && <span className="text-red-400">👎 {r.thumbs_down}</span>}
                  {r.trigger && <span className="px-1.5 py-0.5 rounded bg-zinc-800">{r.trigger}</span>}
                  <span>{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              {r.action_summary && (
                <p className="mt-2 text-xs text-zinc-500 truncate">🚀 {r.action_summary.replace(/[#*`]/g, "").slice(0, 120)}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
