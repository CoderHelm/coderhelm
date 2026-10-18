"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Review, type Repo } from "@/lib/api";
import { TableSkeleton } from "@/components/skeleton";
import { RoleGuard } from "@/components/role-guard";
import { RepoCombobox } from "@/components/repo-combobox";
import { ReReviewButton } from "@/components/re-review-button";
import { usePagedList, LoadMoreButton } from "@/components/load-more";
import { Callout } from "@/components/callout";
import { focusRing, linkButton, secondaryButton } from "@/components/ui";
import { RiskText, VerdictPill, triggerLabel } from "./labels";

export default function ReviewerPageGuarded() {
  return (
    <RoleGuard minRole="member">
      <ReviewerPage />
    </RoleGuard>
  );
}

function formatTimeAgo(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "—";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

interface PrGroup {
  key: string;
  repo: string;
  pr_number: number;
  latest: Review;
  reviews: Review[]; // newest-first
}

// Collapse per-run review records into one group per PR (newest kept as the
// headline; re-reviews expand underneath). `reviews` arrives newest-first, so
// the first record seen for a PR is its latest and group order is newest-first.
function groupByPr(reviews: Review[]): PrGroup[] {
  const map = new Map<string, PrGroup>();
  for (const r of reviews) {
    const key = `${r.repo}#${r.pr_number}`;
    const g = map.get(key);
    if (g) g.reviews.push(r);
    else map.set(key, { key, repo: r.repo, pr_number: r.pr_number, latest: r, reviews: [r] });
  }
  return [...map.values()];
}

function ReviewerPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  // ?repo=owner/name opens the list filtered (the detail page links here). The
  // page only mounts in the browser (behind RoleGuard), so reading the URL in the
  // initializer avoids a first fetch of the unfiltered list.
  const [repoFilter, setRepoFilter] = useState(() => new URLSearchParams(window.location.search).get("repo") || "");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [reviewRepo, setReviewRepo] = useState("");
  const [reviewPr, setReviewPr] = useState("");

  useEffect(() => {
    api.listRepos().then((d) => setRepos(d.repos)).catch(() => {});
  }, []);

  const {
    items: reviews,
    next,
    loading,
    loadingMore,
    error,
    moreFailed,
    loadMore,
    reload,
  } = usePagedList<Review>(
    (cursor) => api.listReviews(repoFilter || undefined, cursor).then((d) => ({ items: d.reviews, next: d.next })),
    [repoFilter],
  );

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const groups = groupByPr(reviews);

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Reviewer</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Reviews the agent posted on your PRs. Add the review label (default{" "}
              <code className="text-zinc-400">ch-review</code>) to a PR to trigger one, or reply{" "}
              <code className="text-zinc-400">@coderhelm re-review</code>.
            </p>
          </div>
          <Link href="/reviewer/config" className={`shrink-0 ${secondaryButton}`}>
            Configure
          </Link>
        </div>
      </div>

      <div className="mb-6 p-4 rounded-lg bg-zinc-900 border border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-200">Review a PR now</h2>
        <p className="text-xs text-zinc-500 mt-1 mb-3">
          Reviews the PR&apos;s latest commit — no label or GitHub comment needed.
        </p>
        <div className="flex flex-wrap items-start gap-2">
          <div className="w-full sm:w-72 [&>div]:mb-0">
            <RepoCombobox repos={repos} selected={reviewRepo} onSelect={setReviewRepo} />
          </div>
          <input
            inputMode="numeric"
            aria-label="Pull request number"
            placeholder="PR #"
            value={reviewPr}
            onChange={(e) => setReviewPr(e.target.value.replace(/\D/g, ""))}
            className={`w-24 px-3 py-2 text-sm rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 placeholder:text-zinc-600 ${focusRing}`}
          />
          <ReReviewButton repo={reviewRepo} pr={Number(reviewPr)} label="Review now" className="min-h-9" />
        </div>
      </div>

      <div className="mb-5 max-w-sm">
        <p className="mb-1 text-xs text-zinc-500">Show reviews for</p>
        <div className="[&>div]:mb-0">
          <RepoCombobox repos={repos} selected={repoFilter} onSelect={setRepoFilter} />
        </div>
        {repoFilter && (
          <button type="button" onClick={() => setRepoFilter("")} className={`mt-2 ${linkButton} text-xs`}>
            Show all repos
          </button>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : error ? (
        <Callout variant="error" title="Could not load reviews">
          <p>Check your connection and try again.</p>
          <button type="button" onClick={reload} className={`mt-2 ${secondaryButton}`}>
            Try again
          </button>
        </Callout>
      ) : reviews.length === 0 ? (
        <div className="text-zinc-500 border border-zinc-800 rounded-lg p-8 text-center">
          <p className="text-lg mb-2">{repoFilter ? `No reviews for ${repoFilter} yet` : "No reviews yet"}</p>
          <p className="text-sm">
            Turn the reviewer on for a repo in{" "}
            <Link href="/reviewer/config" className={linkButton}>Configure</Link>, then use “Review a PR now” above or add
            the review label to a PR.
          </p>
        </div>
      ) : (
        <div className="relative border border-zinc-800 rounded-lg overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Pull request</th>
                <th className="px-4 py-3 font-medium">Verdict</th>
                <th className="px-4 py-3 font-medium">Risk</th>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {groups.map((group) => (
                <PrRow
                  key={group.key}
                  group={group}
                  isExpanded={expanded.has(group.key)}
                  onToggle={() => toggle(group.key)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMoreButton hasMore={!!next} loading={loadingMore} failed={moreFailed} onClick={loadMore} />
    </div>
  );
}

function PrRow({
  group,
  isExpanded,
  onToggle,
}: {
  group: PrGroup;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const r = group.latest;
  const hasMultiple = group.reviews.length > 1;
  return (
    <>
      <tr className="hover:bg-zinc-900/50">
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {hasMultiple && (
              <button
                type="button"
                onClick={onToggle}
                className={`inline-flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:text-zinc-300 transition-colors shrink-0 ${focusRing}`}
                aria-expanded={isExpanded}
                aria-label={`${isExpanded ? "Hide" : "Show"} earlier reviews of ${group.repo} #${group.pr_number}`}
              >
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  aria-hidden="true"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            <div className="min-w-0">
              <Link
                href={`/reviewer/detail?sk=${encodeURIComponent(r.sk)}`}
                className={`rounded text-zinc-100 hover:underline font-medium font-mono text-xs break-all ${focusRing}`}
              >
                {group.repo} <span className="text-zinc-500">#{group.pr_number}</span>
              </Link>
              <div className="flex items-center gap-2 mt-1">
                {hasMultiple && (
                  <span className="text-[10px] text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5">
                    {group.reviews.length} reviews
                  </span>
                )}
                {r.trigger && (
                  <span className="text-[10px] text-zinc-400 bg-zinc-800 rounded px-1.5 py-0.5">{triggerLabel(r.trigger)}</span>
                )}
                {r.thumbs_up > 0 && (
                  <span className="text-[10px] text-emerald-400" title={`${r.thumbs_up} marked helpful`}>
                    <span aria-hidden="true">👍</span> {r.thumbs_up}<span className="sr-only"> marked helpful</span>
                  </span>
                )}
                {r.thumbs_down > 0 && (
                  <span className="text-[10px] text-red-400" title={`${r.thumbs_down} marked not helpful`}>
                    <span aria-hidden="true">👎</span> {r.thumbs_down}<span className="sr-only"> marked not helpful</span>
                  </span>
                )}
              </div>
              {r.action_summary && (
                <p className="mt-1 text-[11px] text-zinc-500 truncate max-w-md">
                  {r.action_summary.replace(/[#*`]/g, "").slice(0, 120)}
                </p>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <VerdictPill verdict={r.verdict} />
        </td>
        <td className="px-4 py-3"><RiskText risk={r.risk} /></td>
        <td className="px-4 py-3">
          <time title={new Date(r.created_at).toLocaleString()} className="text-zinc-400 text-xs">
            {formatTimeAgo(r.created_at)}
          </time>
        </td>
        <td className="px-4 py-3 text-right">
          <ReReviewButton repo={group.repo} pr={group.pr_number} />
        </td>
      </tr>

      {hasMultiple &&
        isExpanded &&
        group.reviews.slice(1).map((rev, i) => (
          <tr key={rev.sk} className="bg-zinc-950/50 hover:bg-zinc-900/30">
            <td className="px-4 py-2 pl-10">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-600 font-mono">#{group.reviews.length - i - 1}</span>
                <Link
                  href={`/reviewer/detail?sk=${encodeURIComponent(rev.sk)}`}
                  className={`rounded text-zinc-400 hover:text-zinc-200 hover:underline text-xs ${focusRing}`}
                >
                  {triggerLabel(rev.trigger) || "Review"}
                </Link>
              </div>
            </td>
            <td className="px-4 py-2">
              <VerdictPill verdict={rev.verdict} />
            </td>
            <td className="px-4 py-2"><RiskText risk={rev.risk} /></td>
            <td className="px-4 py-2">
              <time title={new Date(rev.created_at).toLocaleString()} className="text-zinc-600 text-xs">
                {formatTimeAgo(rev.created_at)}
              </time>
            </td>
            <td />
          </tr>
        ))}
    </>
  );
}
