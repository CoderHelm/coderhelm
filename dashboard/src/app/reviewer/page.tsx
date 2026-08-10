"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Review, type Repo } from "@/lib/api";
import { TableSkeleton } from "@/components/skeleton";
import { RoleGuard } from "@/components/role-guard";
import { RepoCombobox } from "@/components/repo-combobox";

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

function VerdictBadge({ verdict }: { verdict: string }) {
  const map: Record<string, { dot: string; text: string; bg: string }> = {
    APPROVE: { dot: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
    REQUEST_CHANGES: { dot: "bg-red-400", text: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
    QUESTION: { dot: "bg-blue-400", text: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  };
  const label: Record<string, string> = {
    APPROVE: "Approved",
    REQUEST_CHANGES: "Changes requested",
    QUESTION: "Answered",
  };
  const s = map[verdict] ?? { dot: "bg-zinc-500", text: "text-zinc-400", bg: "bg-zinc-800 border-zinc-700" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {label[verdict] ?? verdict}
    </span>
  );
}

function riskBadge(r: string) {
  if (!r || r === "N/A") return <span className="text-zinc-600 text-xs">—</span>;
  const map: Record<string, string> = {
    LOW: "text-emerald-400",
    MEDIUM: "text-amber-400",
    HIGH: "text-red-400",
  };
  return <span className={`text-xs font-medium ${map[r] ?? "text-zinc-400"}`}>{r}</span>;
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
  const [reviews, setReviews] = useState<Review[]>([]);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoFilter, setRepoFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
            <h1 className="text-xl font-semibold text-zinc-100">Reviewer</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Reviews the agent posted on your PRs. Add the review label (default{" "}
              <code className="text-zinc-400">ch-review</code>) to a PR to trigger one, or reply{" "}
              <code className="text-zinc-400">@coderhelm re-review</code>.
            </p>
          </div>
          <Link
            href="/reviewer/config"
            className="shrink-0 text-sm px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors"
          >
            Configure
          </Link>
        </div>
      </div>

      <div className="mb-5 max-w-sm">
        <RepoCombobox repos={repos} selected={repoFilter} onSelect={setRepoFilter} />
        {repoFilter && (
          <button onClick={() => setRepoFilter("")} className="mt-2 text-xs text-zinc-500 hover:text-zinc-300">
            Clear filter
          </button>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : reviews.length === 0 ? (
        <div className="text-zinc-500 border border-zinc-800 rounded-lg p-8 text-center">
          <p className="text-lg mb-2">No reviews yet</p>
          <p className="text-sm">Enable the reviewer for a repo and add the review label to a PR.</p>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Pull request</th>
                <th className="px-4 py-3 font-medium">Verdict</th>
                <th className="px-4 py-3 font-medium">Risk</th>
                <th className="px-4 py-3 font-medium">Time</th>
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
                onClick={onToggle}
                className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                aria-label={isExpanded ? "Collapse reviews" : "Expand reviews"}
              >
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
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
                className="text-zinc-100 hover:underline font-medium font-mono text-xs"
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
                  <span className="text-[10px] text-zinc-500 bg-zinc-800 rounded px-1.5 py-0.5">{r.trigger}</span>
                )}
                {r.thumbs_up > 0 && <span className="text-[10px] text-emerald-400">👍 {r.thumbs_up}</span>}
                {r.thumbs_down > 0 && <span className="text-[10px] text-red-400">👎 {r.thumbs_down}</span>}
              </div>
              {r.action_summary && (
                <p className="mt-1 text-[11px] text-zinc-500 truncate max-w-md">
                  🚀 {r.action_summary.replace(/[#*`]/g, "").slice(0, 120)}
                </p>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <VerdictBadge verdict={r.verdict} />
        </td>
        <td className="px-4 py-3">{riskBadge(r.risk)}</td>
        <td className="px-4 py-3">
          <time title={new Date(r.created_at).toLocaleString()} className="text-zinc-400 text-xs">
            {formatTimeAgo(r.created_at)}
          </time>
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
                  className="text-zinc-500 hover:text-zinc-300 hover:underline text-xs"
                >
                  {rev.trigger || "review"}
                </Link>
              </div>
            </td>
            <td className="px-4 py-2">
              <VerdictBadge verdict={rev.verdict} />
            </td>
            <td className="px-4 py-2">{riskBadge(rev.risk)}</td>
            <td className="px-4 py-2">
              <time title={new Date(rev.created_at).toLocaleString()} className="text-zinc-600 text-xs">
                {formatTimeAgo(rev.created_at)}
              </time>
            </td>
          </tr>
        ))}
    </>
  );
}
