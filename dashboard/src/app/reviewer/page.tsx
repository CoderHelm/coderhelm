"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError, type LivePr, type Repo } from "@/lib/api";
import { TableSkeleton } from "@/components/skeleton";
import { RoleGuard } from "@/components/role-guard";
import { RepoCombobox } from "@/components/repo-combobox";
import { ReReviewButton } from "@/components/re-review-button";
import { usePagedList, LoadMoreButton } from "@/components/load-more";
import { Callout } from "@/components/callout";
import { Segmented } from "@/components/segmented";
import { ChevronRightIcon } from "@/components/icons";
import { focusRing, linkButton, secondaryButton } from "@/components/ui";
import { Page, PageHeader, cardClass } from "@/components/page";
import type { Review } from "@/lib/api";
import { RiskText, VerdictPill, riskLabel, triggerLabel } from "./labels";
import { buildRows, statusLook, summaryLine, type Group, type PrRow } from "./status";

export default function ReviewerPageGuarded() {
  return (
    <RoleGuard minRole="member">
      <ReviewerPage />
    </RoleGuard>
  );
}

function formatTimeAgo(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

type Tab = "all" | Group;

const SECTIONS: { group: Group; title: string; empty: string }[] = [
  { group: "active", title: "In review now", empty: "Nothing is being reviewed right now." },
  { group: "waiting", title: "Waiting", empty: "Nothing is waiting on CI or people." },
  { group: "done", title: "Done", empty: "No finished reviews yet." },
];

/** How often the status refreshes while something is moving. */
const POLL_ACTIVE_MS = 15_000;
const POLL_WAITING_MS = 30_000;

function ReviewerPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  // ?repo=owner/name opens the list filtered (the detail page links here). The
  // page only mounts in the browser (behind RoleGuard), so reading the URL in the
  // initializer avoids a first fetch of the unfiltered list.
  const [repoFilter, setRepoFilter] = useState(() => new URLSearchParams(window.location.search).get("repo") || "");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [reviewRepo, setReviewRepo] = useState("");
  const [reviewPr, setReviewPr] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [live, setLive] = useState<LivePr[]>([]);
  // False when the backend has no live status (older deploy): the page is then
  // the plain list of reviews and never polls.
  const [liveOk, setLiveOk] = useState(true);

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

  const liveGen = useRef(0);
  const loadLive = useCallback(() => {
    const gen = ++liveGen.current;
    return api
      .listLivePrs(repoFilter || undefined)
      .then((prs) => {
        if (gen !== liveGen.current) return;
        setLive(prs);
        setLiveOk(true);
      })
      .catch((e) => {
        if (gen !== liveGen.current) return;
        // Not deployed yet: stop asking. A passing error keeps the last status.
        if (e instanceof ApiError && (e.status === 404 || e.status === 405)) {
          setLive([]);
          setLiveOk(false);
        }
      });
  }, [repoFilter]);

  useEffect(() => {
    setLive([]);
    loadLive();
  }, [loadLive]);

  const rows = useMemo(() => buildRows(reviews, live), [reviews, live]);
  const counts = useMemo(() => {
    const c: Record<Group, number> = { active: 0, waiting: 0, done: 0 };
    for (const r of rows) c[r.group] += 1;
    return c;
  }, [rows]);

  // A PR leaving "in review" has a new review record: reload the list.
  const activeKeys = useRef<Set<string>>(new Set());
  useEffect(() => {
    const now = new Set(rows.filter((r) => r.group === "active").map((r) => r.key));
    const finished = [...activeKeys.current].some((k) => !now.has(k));
    activeKeys.current = now;
    if (finished) reload();
  }, [rows, reload]);

  // Light polling while something is moving; paused while the tab is hidden.
  const anyLive = rows.some((r) => statusLook(r.status).live);
  const pollMs = !liveOk ? 0 : counts.active > 0 || anyLive ? POLL_ACTIVE_MS : counts.waiting > 0 ? POLL_WAITING_MS : 0;
  useEffect(() => {
    if (!pollMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") loadLive();
    }, pollMs);
    return () => window.clearInterval(id);
  }, [pollMs, loadLive]);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const onQueued = useCallback(() => {
    loadLive();
  }, [loadLive]);

  const visible = tab === "all" ? rows : rows.filter((r) => r.group === tab);
  const tabOptions = [
    { value: "all" as Tab, label: "All" },
    { value: "active" as Tab, label: `In review${counts.active ? ` ${counts.active}` : ""}` },
    { value: "waiting" as Tab, label: `Waiting${counts.waiting ? ` ${counts.waiting}` : ""}` },
    { value: "done" as Tab, label: "Done" },
  ];

  const renderList = (list: PrRow[]) => (
    <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30">
      {list.map((row) => (
        <PrItem
          key={row.key}
          row={row}
          showRepo={!repoFilter}
          isExpanded={expanded.has(row.key)}
          onToggle={() => toggle(row.key)}
          onQueued={onQueued}
        />
      ))}
    </ul>
  );

  return (
    <Page>
      <PageHeader
        title="Reviewer"
        lead={
          <>
            What the reviewer is working on and the reviews it posted. Add the review label (default{" "}
            <code className="text-zinc-300">ch-review</code>) to a PR to trigger one, or reply{" "}
            <code className="text-zinc-300">@coderhelm re-review</code>.
          </>
        }
        actions={
          <Link href="/reviewer/config" className={`shrink-0 ${secondaryButton}`}>
            Configure
          </Link>
        }
      />

      <div className={`mt-6 ${cardClass}`}>
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
          <ReReviewButton repo={reviewRepo} pr={Number(reviewPr)} label="Review now" className="min-h-9" onQueued={onQueued} />
        </div>
      </div>

      <div className="mt-8 mb-4 flex flex-wrap items-end justify-between gap-3">
        {liveOk ? (
          <div className="max-w-full overflow-x-auto">
            <Segmented label="Show pull requests" options={tabOptions} value={tab} onChange={setTab} />
          </div>
        ) : (
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Reviews</h2>
        )}
        <div className="w-full sm:w-72">
          <p className="mb-1 text-xs text-zinc-500">Repository</p>
          <div className="[&>div]:mb-0">
            <RepoCombobox repos={repos} selected={repoFilter} onSelect={setRepoFilter} />
          </div>
          {repoFilter && (
            <button type="button" onClick={() => setRepoFilter("")} className={`mt-2 ${linkButton} text-xs`}>
              Show all repos
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={3} />
      ) : error ? (
        <Callout variant="error" title="Could not load reviews">
          <p>Check your connection and try again.</p>
          <button type="button" onClick={reload} className={`mt-2 ${secondaryButton}`}>
            Try again
          </button>
        </Callout>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-8 text-center text-zinc-500">
          <p className="text-lg mb-2">{repoFilter ? `No reviews for ${repoFilter} yet` : "No reviews yet"}</p>
          <p className="text-sm">
            Turn the reviewer on for a repo in{" "}
            <Link href="/reviewer/config" className={linkButton}>Configure</Link>, then use “Review a PR now” above or add
            the review label to a PR.
          </p>
        </div>
      ) : tab === "all" ? (
        <div className="flex flex-col gap-8">
          {SECTIONS.filter((s) => counts[s.group] > 0 || s.group === "active").map((s) => {
            const list = rows.filter((r) => r.group === s.group);
            // Without live status there is only one kind of row: no headings.
            if (!liveOk) return list.length ? <div key={s.group}>{renderList(list)}</div> : null;
            return (
              <section key={s.group} aria-labelledby={`reviewer-${s.group}`}>
                <h2
                  id={`reviewer-${s.group}`}
                  className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500"
                >
                  {s.group === "active" && list.length > 0 && (
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse motion-reduce:animate-none" />
                  )}
                  {s.title}
                  {list.length > 0 && <span className="font-normal normal-case tracking-normal text-zinc-600">{list.length}</span>}
                </h2>
                {list.length ? renderList(list) : <p className="text-sm text-zinc-500">{s.empty}</p>}
              </section>
            );
          })}
        </div>
      ) : visible.length ? (
        renderList(visible)
      ) : (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-6 text-center text-sm text-zinc-500">
          {SECTIONS.find((s) => s.group === tab)?.empty}
        </p>
      )}
      {(tab === "all" || tab === "done") && (
        <LoadMoreButton hasMore={!!next} loading={loadingMore} failed={moreFailed} onClick={loadMore} />
      )}
    </Page>
  );
}

function StatusBadge({ status }: { status: string }) {
  const look = statusLook(status);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${look.text}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${look.dot} ${look.live ? "animate-pulse motion-reduce:animate-none" : ""}`} />
      {look.label}
    </span>
  );
}

const MARKS: Record<string, { glyph: string; cls: string; sr: string }> = {
  done: { glyph: "✓", cls: "text-emerald-400", sr: "Done:" },
  waiting: { glyph: "○", cls: "text-amber-400", sr: "Waiting:" },
  blocked: { glyph: "✕", cls: "text-red-400", sr: "Blocked:" },
};

function PrItem({
  row,
  showRepo,
  isExpanded,
  onToggle,
  onQueued,
}: {
  row: PrRow;
  showRepo: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onQueued: () => void;
}) {
  const latest = row.reviews[0];
  const look = statusLook(row.status);
  const summary = summaryLine(row.live);
  const checklist = row.live?.gate?.checklist ?? [];
  const reason = row.live?.review?.reason ?? "";
  const ref = `${row.repo} #${row.pr_number}`;
  const title = row.title || `Pull request #${row.pr_number}`;
  const hasDetails = row.reviews.length > 0 || checklist.length > 0 || !!reason;
  const panelId = `pr-${row.key.replace(/[^a-zA-Z0-9]/g, "-")}`;
  // Two lines on a phone, one (cut with …) where there is room beside the badges.
  const titleClass = `block break-words line-clamp-2 sm:truncate rounded text-sm font-medium text-zinc-100 hover:underline ${focusRing}`;

  return (
    <li className="px-4 py-3" data-testid="reviewer-pr" data-status={row.status}>
      <div className="flex gap-3">
        <span
          aria-hidden="true"
          className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${look.dot} ${look.live ? "animate-pulse motion-reduce:animate-none" : ""}`}
        />
        <div className="min-w-0 flex-1 sm:flex sm:items-start sm:gap-4">
          <div className="min-w-0 flex-1">
            {latest ? (
              <Link href={`/reviewer/detail?sk=${encodeURIComponent(latest.sk)}`} className={titleClass} title={title}>
                {title}
              </Link>
            ) : (
              <a href={`https://github.com/${row.repo}/pull/${row.pr_number}`} target="_blank" rel="noreferrer" className={titleClass} title={title}>
                {title}
              </a>
            )}
            <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-zinc-500">
              <span className="min-w-0 truncate font-mono">{showRepo ? ref : `#${row.pr_number}`}</span>
              {latest?.trigger && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{triggerLabel(latest.trigger)}</span>
                </>
              )}
              {row.at && (
                <>
                  <span aria-hidden="true">·</span>
                  <time dateTime={row.at} title={new Date(row.at).toLocaleString()}>
                    {formatTimeAgo(row.at)}
                  </time>
                </>
              )}
            </p>
            {summary && <p className={`mt-1 line-clamp-2 text-xs ${look.text}`}>{summary}</p>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 sm:mt-0 sm:shrink-0 sm:justify-end">
            {row.status !== "reviewed" && <StatusBadge status={row.status} />}
            {latest && (
              <span title={row.group === "active" ? "Verdict of the last review" : undefined}>
                <VerdictPill verdict={latest.verdict} />
              </span>
            )}
            {latest && riskLabel(latest.risk) && <RiskText risk={latest.risk} />}
            {/* A review already queued or running needs no second one. */}
            {row.group !== "active" && <ReReviewButton repo={row.repo} pr={row.pr_number} onQueued={onQueued} />}
            {hasDetails && (
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={isExpanded}
                aria-controls={panelId}
                aria-label={`${isExpanded ? "Hide" : "Show"} details and earlier reviews of ${ref}`}
                className={`inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 ${focusRing}`}
              >
                {row.reviews.length > 1 ? `${row.reviews.length} reviews` : "Details"}
                <span aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${isExpanded ? "rotate-90" : ""}`}>
                  <ChevronRightIcon />
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {isExpanded && hasDetails && (
        <div id={panelId} className="mt-3 ml-5 flex min-w-0 flex-col gap-3 border-l border-zinc-800 pl-4 text-xs">
          {checklist.length > 0 && (
            <div>
              <p className="mb-1 font-medium text-zinc-300">Auto-merge</p>
              <ul className="flex flex-col gap-0.5">
                {checklist.map((c, i) => {
                  const m = MARKS[c.mark] ?? MARKS.waiting;
                  return (
                    <li key={i} className="flex gap-2 text-zinc-400">
                      <span aria-hidden="true" className={`w-3 shrink-0 text-center ${m.cls}`}>{m.glyph}</span>
                      <span className="sr-only">{m.sr}</span>
                      <span className="min-w-0 break-words">{c.text}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {reason && (
            <div>
              <p className="mb-1 font-medium text-zinc-300">What went wrong</p>
              <p className="break-words text-zinc-400">{reason}</p>
            </div>
          )}
          {latest?.action_summary && (
            <div>
              <p className="mb-1 font-medium text-zinc-300">After the last review</p>
              <p className="whitespace-pre-wrap break-words text-zinc-400">{latest.action_summary.replace(/[#*`]/g, "").trim()}</p>
            </div>
          )}
          {row.reviews.length > 0 && (
            <div>
              <p className="mb-1 font-medium text-zinc-300">Reviews</p>
              <ol className="flex flex-col divide-y divide-zinc-800/60">
                {row.reviews.map((rev, i) => (
                  <li key={rev.sk} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                    <span className="w-6 shrink-0 font-mono text-zinc-600">#{row.reviews.length - i}</span>
                    <Link
                      href={`/reviewer/detail?sk=${encodeURIComponent(rev.sk)}`}
                      className={`min-w-0 rounded text-zinc-300 hover:text-zinc-100 hover:underline ${focusRing}`}
                    >
                      {triggerLabel(rev.trigger) || "Review"}
                    </Link>
                    <VerdictPill verdict={rev.verdict} />
                    <RiskText risk={rev.risk} />
                    <time dateTime={rev.created_at} title={new Date(rev.created_at).toLocaleString()} className="text-zinc-500">
                      {formatTimeAgo(rev.created_at)}
                    </time>
                    {(rev.thumbs_up > 0 || rev.thumbs_down > 0) && (
                      <span className="text-zinc-500">
                        {rev.thumbs_up > 0 && (
                          <span className="text-emerald-400" title={`${rev.thumbs_up} marked helpful`}>
                            <span aria-hidden="true">👍</span> {rev.thumbs_up}<span className="sr-only"> marked helpful</span>
                          </span>
                        )}{" "}
                        {rev.thumbs_down > 0 && (
                          <span className="text-red-400" title={`${rev.thumbs_down} marked not helpful`}>
                            <span aria-hidden="true">👎</span> {rev.thumbs_down}<span className="sr-only"> marked not helpful</span>
                          </span>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
