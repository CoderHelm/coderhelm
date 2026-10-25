"use client";

import { ANY_CHANGE } from "@/lib/capabilities";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError, type LivePr, type OpenPr, type Repo } from "@/lib/api";
import { rememberRepo } from "@/lib/recent-repos";
import { Combobox } from "@/components/combobox";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/components/list/time";
import { RoleGuard } from "@/components/role-guard";
import { RepoCombobox } from "@/components/repo-combobox";
import { ReReviewButton } from "@/components/re-review-button";
import { Modal, modalActions } from "@/components/modal";
import { focusRing, inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { Page, PageHeader } from "@/components/page";
import {
  DetailBlock,
  GROUP_LABEL,
  List,
  ListEmpty,
  ListError,
  ListRow,
  ListSection,
  ListSkeleton,
  ListToolbar,
  LoadMore,
  StatusText,
  Time,
  usePagedList,
  useListParams,
  useTeamRepos,
} from "@/components/list";
import type { Review } from "@/lib/api";
import { RiskText, VerdictPill, riskLabel, triggerLabel } from "./labels";
import { buildRows, gateAction, gateHref, statusLook, summaryLine, type Group, type PrRow } from "./status";
import { GateControlButton } from "./gate-control";
import { Markdown } from "@/components/markdown";

export default function ReviewerPageGuarded() {
  return (
    <RoleGuard need={ANY_CHANGE}>
      <Suspense fallback={<Page><PageHeader title="Reviewer" /><div className="mt-6"><ListSkeleton /></div></Page>}>
        <ReviewerPage />
      </Suspense>
    </RoleGuard>
  );
}

type Tab = "all" | Group;

const SECTIONS: { group: Group; empty: string }[] = [
  { group: "active", empty: "Nothing is being reviewed right now." },
  { group: "waiting", empty: "Nothing is waiting on CI or people." },
  { group: "done", empty: "No finished reviews yet." },
];

/** How often the status refreshes while something is moving. */
const POLL_ACTIVE_MS = 15_000;
const POLL_WAITING_MS = 30_000;

/** The words a row is found by: title, repo, "#123" and its status. */
function rowMatches(row: PrRow, q: string): boolean {
  if (!q) return true;
  const hay = [row.title, row.repo, `#${row.pr_number}`, String(row.pr_number), statusLook(row.status).label, row.reviews[0]?.trigger ?? ""]
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

function ReviewerPage() {
  // ?q= search, ?status= group, ?repo= one repo (the detail page links here with it).
  const [params, setParams] = useListParams({ q: "", status: "all", repo: "", review: "" });
  const repoFilter = params.repo;
  const q = params.q.trim();
  const tab: Tab = params.status === "active" || params.status === "waiting" || params.status === "done" ? params.status : "all";
  const teamRepos = useTeamRepos();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const reviewButton = useRef<HTMLButtonElement>(null);
  const [live, setLive] = useState<LivePr[]>([]);
  // False when the backend has no live status (older deploy): the page is then
  // the plain list of reviews and never polls.
  const [liveOk, setLiveOk] = useState(true);

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
  const matched = useMemo(() => rows.filter((r) => rowMatches(r, q)), [rows, q]);
  const counts = useMemo(() => {
    const c: Record<Group, number> = { active: 0, waiting: 0, done: 0 };
    for (const r of matched) c[r.group] += 1;
    return c;
  }, [matched]);

  // A PR leaving "in review" has a new review record: reload the list.
  const activeKeys = useRef<Set<string>>(new Set());
  useEffect(() => {
    const now = new Set(rows.filter((r) => r.group === "active").map((r) => r.key));
    const finished = [...activeKeys.current].some((k) => !now.has(k));
    activeKeys.current = now;
    if (finished) reload();
  }, [rows, reload]);

  // Light polling while something is moving; paused while the tab is hidden.
  const anyActive = rows.some((r) => r.group === "active");
  const anyWaiting = rows.some((r) => r.group === "waiting");
  const anyLive = rows.some((r) => statusLook(r.status).live);
  const pollMs = !liveOk ? 0 : anyActive || anyLive ? POLL_ACTIVE_MS : anyWaiting ? POLL_WAITING_MS : 0;
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

  const visible = tab === "all" ? matched : matched.filter((r) => r.group === tab);
  const filtered = !!(q || repoFilter || tab !== "all");
  const clear = () => setParams({ q: "", status: "all", repo: "" });

  const renderList = (list: PrRow[]) => (
    <List>
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
    </List>
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
          <>
            <button ref={reviewButton} type="button" onClick={() => setParams({ review: "1" })} className={secondaryButton}>
              Review a PR…
            </button>
            <Link href="/reviewer/config" className={`shrink-0 ${secondaryButton}`}>
              Configure
            </Link>
          </>
        }
      />

      <ReviewPrDialog
        open={params.review === "1"}
        onClose={() => setParams({ review: "" }, { replace: true })}
        onQueued={onQueued}
        returnFocus={reviewButton}
        live={live}
      />

      <ListToolbar
        className="mt-6 mb-4"
        search={{
          value: params.q,
          onChange: (v) => setParams({ q: v }, { replace: true }),
          placeholder: "Search by title, repo or PR number",
          label: "Search pull requests",
        }}
        status={
          liveOk
            ? {
                label: "Show pull requests",
                value: tab,
                onChange: (v) => setParams({ status: v }),
                options: [
                  { value: "all", label: GROUP_LABEL.all, count: matched.length },
                  { value: "active", label: GROUP_LABEL.active, count: counts.active, tone: "live" },
                  { value: "waiting", label: GROUP_LABEL.waiting, count: counts.waiting, tone: "waiting" },
                  { value: "done", label: GROUP_LABEL.done, count: counts.done, tone: "success" },
                ],
              }
            : undefined
        }
        repo={{ value: repoFilter, onChange: (v) => setParams({ repo: v }), repos: teamRepos }}
        onClear={filtered ? clear : undefined}
        summary={q && !loading ? `${matched.length} of ${rows.length} loaded pull requests match` : undefined}
      />

      {loading ? (
        <ListSkeleton label="Loading reviews" />
      ) : error ? (
        <ListError title="Could not load reviews" onRetry={reload} />
      ) : rows.length === 0 ? (
        <ListEmpty title={repoFilter ? `No reviews for ${repoFilter} yet` : "No reviews yet"} onClear={repoFilter ? clear : undefined}>
          Turn the reviewer on for a repo in{" "}
          <Link href="/reviewer/config" className={linkButton}>Configure</Link>, then use “Review a PR…” or add the review label
          to a PR.
        </ListEmpty>
      ) : visible.length === 0 ? (
        <ListEmpty title={q ? `No pull requests match “${q}”` : SECTIONS.find((s) => s.group === tab)?.empty} onClear={filtered ? clear : undefined}>
          {next ? "Only the reviews loaded so far were searched. Load more to search older ones." : undefined}
        </ListEmpty>
      ) : tab === "all" && liveOk ? (
        <div className="flex flex-col gap-8">
          {SECTIONS.filter((s) => counts[s.group] > 0 || (s.group === "active" && !q)).map((s) => {
            const list = visible.filter((r) => r.group === s.group);
            return (
              <ListSection
                key={s.group}
                id={`reviewer-${s.group}`}
                title={GROUP_LABEL[s.group]}
                count={list.length || undefined}
                group={s.group}
                live={s.group === "active" && list.length > 0}
              >
                {list.length ? renderList(list) : <p className="text-sm text-zinc-500">{s.empty}</p>}
              </ListSection>
            );
          })}
        </div>
      ) : (
        renderList(visible)
      )}
      {(tab === "all" || tab === "done") && !loading && !error && (
        <LoadMore hasMore={!!next} loading={loadingMore} failed={moreFailed} onClick={loadMore} />
      )}
    </Page>
  );
}

/**
 * A pasted PR link (`https://github.com/owner/repo/pull/42`, with or without
 * the scheme or a trailing path), `owner/repo#42`, `#42` or `42`. Null when it
 * is none of those.
 */
function parsePrInput(text: string): { repo?: string; pr: number } | null {
  const t = text.trim();
  const url = t.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:[/?#].*)?$/i);
  if (url) return { repo: `${url[1]}/${url[2]}`, pr: Number(url[3]) };
  const short = t.match(/^([\w.-]+\/[\w.-]+)#(\d+)$/);
  if (short) return { repo: short[1], pr: Number(short[2]) };
  const num = t.match(/^#?(\d{1,7})$/);
  if (num && Number(num[1]) > 0) return { pr: Number(num[1]) };
  return null;
}

/** "Review a PR…": any PR's latest commit, without a label or a GitHub comment. */
function ReviewPrDialog({
  open,
  onClose,
  onQueued,
  returnFocus,
  live,
}: {
  open: boolean;
  onClose: () => void;
  onQueued: () => void;
  returnFocus: React.RefObject<HTMLButtonElement | null>;
  /** The reviewer's live rows, for a per-repo note in the picker. */
  live: LivePr[];
}) {
  const { toast } = useToast();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [repo, setRepo] = useState("");
  const [pr, setPr] = useState(0);
  const [paste, setPaste] = useState("");
  const [prs, setPrs] = useState<OpenPr[]>([]);
  // "idle" before a repo is picked; "none" when the backend can't list them.
  const [prsState, setPrsState] = useState<"idle" | "loading" | "ok" | "none">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || repos.length) return;
    setReposLoading(true);
    api
      .listRepos()
      .then((d) => setRepos(d.repos))
      .catch(() => {})
      .finally(() => setReposLoading(false));
  }, [open, repos.length]);

  // The picked repo's open PRs.
  useEffect(() => {
    if (!repo) {
      setPrs([]);
      setPrsState("idle");
      return;
    }
    let live = true;
    setPrsState("loading");
    api
      .listOpenPrs(repo)
      .then((list) => {
        if (!live) return;
        setPrs(list);
        setPrsState("ok");
      })
      .catch(() => {
        if (!live) return;
        setPrs([]);
        setPrsState("none");
      });
    return () => {
      live = false;
    };
  }, [repo]);

  const hints = useMemo(() => {
    const n: Record<string, number> = {};
    for (const p of live) if (p.group !== "done") n[p.repo] = (n[p.repo] ?? 0) + 1;
    return Object.fromEntries(Object.entries(n).map(([r, c]) => [r, `${c} in review`]));
  }, [live]);

  const prGroups = useMemo(
    () => [
      {
        heading: prs.length ? `${prs.length === 100 ? "100+" : prs.length} open` : undefined,
        options: prs.map((p) => ({
          value: String(p.number),
          label: p.title || `Pull request #${p.number}`,
          sub: [p.author, p.draft ? "draft" : ""].filter(Boolean).join(" · ") || undefined,
          hint: (
            <span className="flex items-center gap-2">
              <span className="tabular-nums">#{p.number}</span>
              {p.updated_at && <span className="hidden sm:inline">{timeAgo(p.updated_at)}</span>}
            </span>
          ),
          keywords: [String(p.number), `#${p.number}`, p.author],
          title: `#${p.number} ${p.title}${p.author ? ` · ${p.author}` : ""}`,
        })),
      },
    ],
    [prs],
  );

  const reset = () => {
    setPr(0);
    setPaste("");
    setError("");
  };

  const onPaste = (text: string) => {
    setPaste(text);
    setError("");
    const parsed = parsePrInput(text);
    if (!parsed) {
      setPr(0);
      return;
    }
    if (parsed.repo && parsed.repo !== repo) setRepo(parsed.repo);
    setPr(parsed.pr);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repo) return setError("Pick a repo.");
    if (!pr) return setError(paste.trim() ? "That isn't a pull request link or number." : "Pick a pull request, or paste its link or number.");
    setBusy(true);
    setError("");
    try {
      const res = await api.reReview(repo, pr);
      if (res.status !== "queued") {
        setError(res.reason || "The review was not queued.");
        return;
      }
      rememberRepo(repo);
      toast(`Review queued for ${repo} #${pr}`);
      onQueued();
      reset();
      onClose();
    } catch {
      setError("Could not queue the review. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const picked = prs.find((p) => p.number === pr);

  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      returnFocus={returnFocus}
      title="Review a PR"
      description="Reviews the PR's latest commit now. No label or GitHub comment needed."
      testId="review-pr-dialog"
      onSubmit={submit}
      footer={
        <div className={modalActions}>
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryButton} disabled={busy}>
            {busy ? "Queueing…" : "Review now"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="review-repo" className="text-sm font-medium text-zinc-200">
            Repository
          </label>
          <RepoCombobox
            id="review-repo"
            repos={repos}
            selected={repo}
            loading={reposLoading}
            hints={hints}
            onSelect={(r) => {
              setRepo(r);
              reset();
            }}
            className=""
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="review-pr" className="text-sm font-medium text-zinc-200">
            Pull request
          </label>
          {prsState === "none" ? (
            <p className="text-sm text-zinc-500">Open pull requests can&apos;t be listed for this repo. Paste a link or number below.</p>
          ) : (
            <Combobox
              id="review-pr"
              label="Pull request"
              placeholder={repo ? (prsState === "ok" && !prs.length ? "No open pull requests" : "Pick a pull request") : "Pick a repo first"}
              searchPlaceholder="Search by title, number or author…"
              emptyText={prsState === "ok" && !prs.length ? "No open pull requests" : "No pull requests match"}
              value={picked ? String(picked.number) : ""}
              valueLabel={
                picked ? (
                  <>
                    <span className="tabular-nums text-zinc-500">#{picked.number}</span> {picked.title}
                  </>
                ) : undefined
              }
              onChange={(v) => {
                setPr(Number(v));
                setPaste("");
                setError("");
              }}
              groups={prGroups}
              loading={prsState === "loading"}
              disabled={!repo}
              testId="pr-picker"
            />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="review-paste" className="text-sm text-zinc-400">
            Or paste a PR link or number
          </label>
          <input
            id="review-paste"
            value={paste}
            onChange={(e) => onPaste(e.target.value)}
            placeholder="https://github.com/owner/repo/pull/42"
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
          />
          {paste.trim() && pr > 0 && !picked && (
            <p className="text-xs text-zinc-500" data-testid="review-target">
              Reviews {repo || "the repo you pick"} #{pr}
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
      </div>
    </Modal>
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
  const gateState = row.live?.gate?.state;
  const control = gateAction(gateState, row.status);
  const hasDetails = row.reviews.length > 0 || checklist.length > 0 || !!reason || !!gateState;

  return (
    <ListRow
      testId="reviewer-pr"
      data={{ status: row.status }}
      status={look}
      title={title}
      titleText={title}
      href={latest ? `/reviewer/detail?sk=${encodeURIComponent(latest.sk)}` : undefined}
      externalHref={latest ? undefined : `https://github.com/${row.repo}/pull/${row.pr_number}`}
      meta={[
        <span key="ref">{showRepo ? ref : `#${row.pr_number}`}</span>,
        latest?.trigger ? triggerLabel(latest.trigger) : null,
        row.at ? <Time key="at" iso={row.at} /> : null,
      ]}
      summary={summary || undefined}
      summaryTone={look.tone}
      chips={
        <>
          {row.status !== "reviewed" && <StatusText look={look} />}
          {latest && (
            <span title={row.group === "active" ? "Verdict of the last review" : undefined}>
              <VerdictPill verdict={latest.verdict} />
            </span>
          )}
          {latest && riskLabel(latest.risk) && <RiskText risk={latest.risk} />}
        </>
      }
      // A review already queued or running needs no second one.
      actions={
        row.group !== "active" || control ? (
          <>
            {control && <GateControlButton repo={row.repo} pr={row.pr_number} action={control} onDone={onQueued} />}
            {row.group !== "active" && <ReReviewButton repo={row.repo} pr={row.pr_number} onQueued={onQueued} />}
          </>
        ) : undefined
      }
      details={
        hasDetails ? (
          <>
            {gateState && (
              <p>
                <Link href={gateHref(row.repo, row.pr_number)} className={linkButton}>
                  Auto-merge details and history
                </Link>
              </p>
            )}
            {checklist.length > 0 && (
              <DetailBlock title="Auto-merge">
                <ul className="flex flex-col gap-0.5">
                  {checklist.map((c, i) => {
                    const m = MARKS[c.mark] ?? MARKS.waiting;
                    return (
                      <li key={i} className="flex gap-2 text-zinc-400">
                        <span aria-hidden="true" className={`w-3 shrink-0 text-center ${m.cls}`}>{m.glyph}</span>
                        <span className="sr-only">{m.sr}</span>
                        <span className="min-w-0">{c.text}</span>
                      </li>
                    );
                  })}
                </ul>
              </DetailBlock>
            )}
            {reason && <DetailBlock title="What went wrong">{reason}</DetailBlock>}
            {latest?.action_summary && (
              <DetailBlock title="After the last review">
                <Markdown>{latest.action_summary}</Markdown>
              </DetailBlock>
            )}
            {row.reviews.length > 0 && (
              <DetailBlock title="Reviews">
                <ol className="flex flex-col divide-y divide-zinc-800/60">
                  {row.reviews.map((rev, i) => (
                    <li key={rev.sk} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                      <span className="w-6 shrink-0 tabular-nums text-zinc-600">#{row.reviews.length - i}</span>
                      <Link
                        href={`/reviewer/detail?sk=${encodeURIComponent(rev.sk)}`}
                        className={`min-w-0 rounded text-zinc-300 hover:text-zinc-100 hover:underline ${focusRing}`}
                      >
                        {triggerLabel(rev.trigger) || "Review"}
                      </Link>
                      <VerdictPill verdict={rev.verdict} />
                      <RiskText risk={rev.risk} />
                      <Time iso={rev.created_at} className="text-zinc-500" />
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
              </DetailBlock>
            )}
          </>
        ) : undefined
      }
      detailsLabel={row.reviews.length > 1 ? `${row.reviews.length} reviews` : "Details"}
      detailsFor={`details and earlier reviews of ${ref}`}
      open={isExpanded}
      onOpenChange={onToggle}
    />
  );
}
