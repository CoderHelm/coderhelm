"use client";

// The findings, one row per fix: a package at one version with every
// advisory the bump clears. The worst advisory sets the row's tier and due
// date; the row expands to list them all. Searched, filtered and sorted on
// the server (GET /api/security/groups).

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ListEmpty,
  ListError,
  ListSkeleton,
  LoadMore,
  RepoFilter,
  SearchField,
  SortSelect,
  StatusToggles,
  usePagedList,
  useTeamRepos,
  type Tone,
} from "@/components/list";
import { ChevronRightIcon } from "@/components/icons";
import { Select } from "@/components/select";
import { focusRing, linkButton, primaryButton, smallSecondaryButton } from "@/components/ui";
import {
  MAX_PICKED_IDS,
  TIERS,
  cannotFix,
  epssText,
  fixWords,
  isActive,
  isMajor,
  prCount,
  repoName,
  securityApi,
  type FindingGroup,
  type GroupFilter,
  type Bundle,
  type Combine,
  type FixSelect,
  type SecurityOverview,
  type Tier,
} from "@/lib/security";
import { DueDate, TierPill, VerdictPill } from "./parts";
import { FixRequest } from "./fix-request";

export const STATUSES = ["open", "fixed", "dismissed", "all"] as const;
export type StatusFilter = (typeof STATUSES)[number];
export const SORTS = ["tier", "due", "package"] as const;
export type SortKey = (typeof SORTS)[number];
const TIER_TONE: Record<Tier, Tone> = {
  P0: "danger",
  P1: "attention",
  P2: "waiting",
  P3: "muted",
};

export interface GroupListFilter {
  status: StatusFilter;
  tier: Tier | "";
  repo: string;
  q: string;
  sort: SortKey;
}

type Patch = Partial<Record<keyof GroupListFilter, string>>;

/** A request being reviewed: picked findings, or every fix that matches (the server resolves it). */
interface Ask {
  combine: Combine;
  ids: string[];
  select?: FixSelect;
}

export function GroupsList({
  overview,
  filter,
  setParams,
  admin = false,
}: {
  overview: SecurityOverview;
  filter: GroupListFilter;
  setParams: (patch: Patch) => void;
  admin?: boolean;
}) {
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  // "Every fix that matches": then the rows unticked by hand are the exceptions.
  const [everything, setEverything] = useState(false);
  const [unpicked, setUnpicked] = useState<Record<string, boolean>>({});
  const [fixableTotal, setFixableTotal] = useState<number | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepError, setPrepError] = useState<string | null>(null);
  const teamRepos = useTeamRepos();
  const scopedRepos = (overview.repos ?? []).map((r) => r.repo);
  const repos = scopedRepos.length > 0 ? scopedRepos : teamRepos;
  const { status, tier, repo, q, sort } = filter;
  const [shapeError, setShapeError] = useState<string | null>(null);
  const fetchPage = useCallback(
    (cursor?: string) => {
      const f: GroupFilter = { status, tier, repo, q, sort, cursor };
      return securityApi.groups(f).then(
        (r) => {
          setFixableTotal(r.fixable_total);
          return { items: r.groups, next: r.next_cursor };
        },
        (e) => {
          setShapeError(e instanceof Error ? e.message : null);
          throw e;
        },
      );
    },
    [status, tier, repo, q, sort],
  );
  const { items: page, next, loading, loadingMore, error, moreFailed, loadMore, reload } = usePagedList<FindingGroup>(fetchPage, [status, tier, repo, q, sort]);
  // By tier, the ones still being checked sort below the settled ones of the same tier.
  const items = sort === "tier" ? settledFirst(page) : page;
  const isOn = (g: FindingGroup) => !cannotFix(g) && (everything ? !unpicked[g.key] : !!picked[g.key]);
  const chosen = items.filter(isOn);
  const fixable = items.filter((g) => !cannotFix(g));
  // Every fix that matches: the server's count, less the rows unticked here.
  const count = everything ? Math.max(0, (fixableTotal ?? fixable.length) - fixable.filter((g) => unpicked[g.key]).length) : chosen.length;
  const clearAll = () => {
    setPicked({});
    setEverything(false);
    setUnpicked({});
    setPrepError(null);
  };
  // A new filter is a new list: the selection starts over.
  useEffect(() => {
    setPicked({});
    setEverything(false);
    setUnpicked({});
    setPrepError(null);
  }, [status, tier, repo, q]);
  // The row a shift-click selects from, and the row `x` toggles.
  const anchor = useRef<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const toggle = (k: string, range = false) => {
    const start = range ? anchor.current : null;
    const row = items.find((g) => g.key === k);
    const on = !(row && isOn(row));
    const keys = items.map((g) => g.key);
    const from = start ? keys.indexOf(start) : -1;
    const to = keys.indexOf(k);
    const [a, b] = from < to ? [from, to] : [to, from];
    const span = from < 0 || to < 0 ? [k] : items.slice(a, b + 1).filter((g) => !cannotFix(g)).map((g) => g.key);
    setPrepError(null);
    if (everything) setUnpicked((p) => ({ ...p, ...Object.fromEntries(span.map((x) => [x, !on])) }));
    else setPicked((p) => ({ ...p, ...Object.fromEntries(span.map((x) => [x, on])) }));
    anchor.current = k;
  };
  const selectOnly = (rows: FindingGroup[]) => {
    setEverything(false);
    setUnpicked({});
    setPrepError(null);
    setPicked(Object.fromEntries(rows.filter((g) => !cannotFix(g)).map((g) => [g.key, true])));
    anchor.current = null;
  };
  const selectEverything = () => {
    setEverything(true);
    setUnpicked({});
    setPrepError(null);
  };
  const pick = admin
    ? {
        isOn,
        toggle,
        all: (on: boolean) => (on ? selectOnly(items) : clearAll()),
        setActive,
      }
    : null;
  const busy = ask !== null || preparing;
  // x toggles the row under the pointer or with focus; Esc clears.
  useEffect(() => {
    if (!admin || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const typing =
        !!t && (t.isContentEditable || /^(TEXTAREA|SELECT)$/.test(t.tagName) || (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "checkbox"));
      if (typing) return;
      if (e.key === "Escape" && count > 0) {
        clearAll();
        anchor.current = null;
      } else if ((e.key === "x" || e.key === "X") && active) {
        const row = items.find((g) => g.key === active);
        if (row && !cannotFix(row)) {
          e.preventDefault();
          toggle(active, e.shiftKey);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const repoRows = (r: string) => fixable.filter((g) => g.repo === r);
  const fixableRepos = [...new Set(fixable.map((g) => g.repo))];
  const urgent = fixable.filter((g) => g.tier === "P0" || g.tier === "P1");
  const bundle: Bundle = overview.bundle ?? "per_package";
  const closeAsk = () => {
    setAsk(null);
    clearAll();
    reload();
  };
  const filters = { status, tier, repo, q };
  // What the request names: the picked findings while they fit in one list
  // of ids; past that, or for every fix that matches, the list's filters
  // less the fixes not selected (rows on pages not loaded yet are read
  // first, so the server takes exactly the selection).
  const startAsk = async (combine: Combine) => {
    setPrepError(null);
    if (everything) {
      const except = items.filter((g) => !cannotFix(g) && unpicked[g.key]).flatMap((g) => g.finding_ids);
      setAsk({ combine, ids: [], select: { all: true, filters, except_ids: except } });
      return;
    }
    const ids = chosen.flatMap((g) => g.finding_ids);
    if (ids.length <= MAX_PICKED_IDS || fixableTotal === null) {
      setAsk({ combine, ids });
      return;
    }
    setPreparing(true);
    try {
      let rows = page;
      let cursor = next ?? undefined;
      while (cursor) {
        const r = await securityApi.groups({ status, tier, repo, q, sort, cursor });
        rows = [...rows, ...r.groups];
        cursor = r.next_cursor ?? undefined;
      }
      const on = new Set(chosen.map((g) => g.key));
      const except = rows.filter((g) => !on.has(g.key)).flatMap((g) => g.finding_ids);
      setAsk({ combine, ids: [], select: { all: true, filters, except_ids: except } });
    } catch (e) {
      setPrepError(e instanceof Error ? e.message : "The list couldn't be read. Try again.");
    }
    setPreparing(false);
  };
  const unpickFindings = (ids: string[]) => {
    const gone = items.filter((g) => g.finding_ids.every((id) => ids.includes(id))).map((g) => g.key);
    if (everything) setUnpicked((p) => ({ ...p, ...Object.fromEntries(gone.map((k) => [k, true])) }));
    else setPicked((p) => ({ ...p, ...Object.fromEntries(gone.map((k) => [k, false])) }));
  };
  // Gmail's offer: the whole page is selected and more match.
  const pageAllOn = fixable.length > 0 && fixable.every(isOn);
  const offer = !everything && pageAllOn && fixableTotal !== null && fixableTotal > fixable.length ? fixableTotal : null;
  const names = Object.fromEntries(items.flatMap((g) => g.finding_ids.map((id) => [id, g.package])));
  const g = overview.groups;
  const c = overview.counts;
  const filtered = status !== "open" || !!tier || !!repo || !!q;
  const clear = () => setParams({ status: "open", tier: "", repo: "", q: "" });
  // One repo picked, or only one in scope: the column says nothing.
  const showRepo = !repo && repos.length !== 1;

  return (
    <section aria-label="Findings" className="mt-8 min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="list-toolbar">
        <div className="w-full sm:w-64">
          <SearchField value={q} onChange={(v) => setParams({ q: v })} placeholder="Search packages and advisories" label="Search findings" />
        </div>
        <StatusToggles
          label="Show findings"
          value={status}
          onChange={(v) => setParams({ status: v })}
          options={[
            { value: "open", label: "Open", count: g?.open ?? c.open },
            { value: "fixed", label: "Fixed" },
            { value: "dismissed", label: "Dismissed", count: c.dismissed },
            { value: "all", label: "All" },
          ]}
        />
        <StatusToggles
          label="Tier"
          value={tier}
          onChange={(v) => setParams({ tier: v })}
          options={[
            { value: "", label: "Every tier" },
            ...TIERS.map((t) => {
              const key = t.toLowerCase() as "p0" | "p1" | "p2" | "p3";
              return {
                value: t,
                label: t,
                tone: TIER_TONE[t],
                count: status === "open" ? (g ? g[key] : c[key]) : undefined,
              };
            }),
          ]}
        />
        {(repos.length > 1 || !!repo) && <RepoFilter value={repo} onChange={(v) => setParams({ repo: v })} repos={repos} />}
        <div className="sm:ml-auto">
          <SortSelect
            value={sort}
            onChange={(v) => setParams({ sort: v })}
            options={[
              { value: "tier", label: "Sort: tier" },
              { value: "due", label: "Sort: due date" },
              { value: "package", label: "Sort: package" },
            ]}
          />
        </div>
        {filtered && (
          <button type="button" onClick={clear} className={`${linkButton} !text-xs`}>
            Clear filters
          </button>
        )}
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        {g && status === "open" && (
          <p className="text-xs text-zinc-400" data-testid="group-count">
            {g.open} fix{g.open === 1 ? "" : "es"} for {c.open} advisor
            {c.open === 1 ? "y" : "ies"}
          </p>
        )}
        {admin && !loading && fixable.length > 0 && (
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto" role="group" aria-label="Quick select" data-testid="quick-select">
            <button type="button" className={`${smallSecondaryButton} gap-1.5`} onClick={() => selectOnly(fixable)} data-testid="select-fixable">
              Select everything fixable <span className="tabular-nums text-zinc-400">{fixable.length}</span>
            </button>
            <button
              type="button"
              className={`${smallSecondaryButton} gap-1.5`}
              onClick={() => selectOnly(urgent)}
              disabled={urgent.length === 0}
              data-testid="select-urgent"
            >
              Select P0 and P1 <span className="tabular-nums text-zinc-400">{urgent.length}</span>
            </button>
            {repo || fixableRepos.length === 1 ? (
              <button
                type="button"
                className={`${smallSecondaryButton} gap-1.5`}
                onClick={() => selectOnly(repoRows(repo || fixableRepos[0]))}
                data-testid="select-repo"
              >
                Select this repo <span className="tabular-nums text-zinc-400">{repoRows(repo || fixableRepos[0]).length}</span>
              </button>
            ) : (
              <Select
                size="sm"
                value=""
                placeholder="Select a repo…"
                aria-label="Select every fix in a repo"
                onChange={(r) => r && selectOnly(repoRows(r))}
                options={fixableRepos.map((r) => ({
                  value: r,
                  label: `${repoName(r)} (${repoRows(r).length})`,
                }))}
                data-testid="select-repo"
              />
            )}
          </div>
        )}
      </div>

      {admin && (count > 0 || busy) && (
        <BulkBar
          chosen={chosen}
          count={count}
          everything={everything}
          less={everything ? fixable.filter((g) => unpicked[g.key]).length : 0}
          filtered={filtered}
          offer={offer}
          pageCount={fixable.length}
          bundle={bundle}
          ask={ask}
          preparing={preparing}
          error={prepError}
          names={names}
          onAsk={startAsk}
          onSelectEverything={selectEverything}
          onClear={clearAll}
          onClose={closeAsk}
          onRemove={unpickFindings}
        />
      )}
      <div className="mt-4">
        {loading ? (
          <ListSkeleton label="Loading findings" />
        ) : error ? (
          <ListError title="We couldn't load the findings" onRetry={reload}>
            {shapeError ?? "Check your connection and try again."}
          </ListError>
        ) : items.length === 0 ? (
          <ListEmpty title={filtered ? "No findings match" : "Nothing open"} onClear={filtered ? clear : undefined}>
            {filtered ? undefined : "No advisory touches code your repos run right now. New ones show up here as soon as they are published."}
          </ListEmpty>
        ) : (
          <GroupsTable rows={items} showRepo={showRepo} pick={pick} />
        )}
        {!loading && !error && <LoadMore hasMore={!!next} loading={loadingMore} failed={moreFailed} onClick={loadMore} />}
      </div>
    </section>
  );
}

/** Within each tier, settled rows first, then those still being checked; otherwise the server's order. */
export function settledFirst(rows: FindingGroup[]): FindingGroup[] {
  const rank = (g: FindingGroup) => TIERS.indexOf(g.tier) * 2 + (g.tier_provisional ? 1 : 0);
  return rows
    .map((g, i) => ({ g, i }))
    .sort((a, b) => (a.g.tier === b.g.tier ? rank(a.g) - rank(b.g) || a.i - b.i : a.i - b.i))
    .map((x) => x.g);
}

/**
 * The selection in a line: "14 fixes selected in web-app: 1 pull request ·
 * 31 advisories · 2 major upgrades". `how` is how they would combine.
 */
export function bulkWords(chosen: FindingGroup[], how: Combine = "one_pr", bundle: Bundle = "per_package"): string {
  const advisories = chosen.reduce((n, g) => n + g.advisories.length, 0);
  const majors = chosen.filter((g) => isMajor(g.version, g.fixed_version)).length;
  const repos = [...new Set(chosen.map((g) => g.repo))];
  const prs = prCount(chosen, how, bundle);
  const where = repos.length === 1 ? repoName(repos[0]) : `${repos.length} repos`;
  const parts = [`${prs} pull request${prs === 1 ? "" : "s"}`, `${advisories} advisor${advisories === 1 ? "y" : "ies"}`];
  if (majors > 0) parts.push(`${majors} major upgrade${majors === 1 ? "" : "s"}`);
  const checking = chosen.filter((g) => g.tier_provisional).length;
  if (checking > 0) parts.push(`${checking} still being checked`);
  return `${chosen.length} fix${chosen.length === 1 ? "" : "es"} selected in ${where}: ${parts.join(" · ")}`;
}

/**
 * The selection's bar, in the page's flow between the quick selects and
 * the list, never fixed or sticky, so it never covers a row. It turns into
 * the review panel, then the result, in place (scrolled into view below
 * the page's top bar). Every message about the request shows inside it.
 */
function BulkBar({
  chosen,
  count,
  everything,
  less,
  filtered,
  offer,
  pageCount,
  bundle,
  ask,
  preparing,
  error,
  names,
  onAsk,
  onSelectEverything,
  onClear,
  onClose,
  onRemove,
}: {
  chosen: FindingGroup[];
  /** Fixes selected: the rows picked, or every fix that matches less the unticked ones. */
  count: number;
  everything: boolean;
  /** Every fix that matches: how many rows were unticked by hand. */
  less: number;
  filtered: boolean;
  /** How many fixes match when the whole page is picked and more match: Gmail's offer. */
  offer: number | null;
  pageCount: number;
  bundle: Bundle;
  ask: Ask | null;
  preparing: boolean;
  error: string | null;
  names: Record<string, string>;
  onAsk: (c: Combine) => void;
  onSelectEverything: () => void;
  onClear: () => void;
  onClose: () => void;
  onRemove: (ids: string[]) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const close = (e: KeyboardEvent | MouseEvent) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && bar.current?.contains(e.target as Node)) return;
      setMenu(false);
    };
    window.addEventListener("keydown", close, true);
    window.addEventListener("mousedown", close);
    return () => {
      window.removeEventListener("keydown", close, true);
      window.removeEventListener("mousedown", close);
    };
  }, [menu]);
  // The review opens where the bar was: bring it into view.
  const reviewing = ask !== null;
  useEffect(() => {
    if (reviewing) bar.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [reviewing]);
  const go = (c: Combine) => {
    setMenu(false);
    onAsk(c);
  };
  const one = everything ? null : prCount(chosen, "one_pr");
  const perPackage = everything ? null : prCount(chosen, "per_package");
  const fixes = (n: number) => `${n.toLocaleString()} fix${n === 1 ? "" : "es"}`;
  const summary = everything
    ? `${fixes(count)} selected: every fix that matches${filtered ? " the filters" : ""}${less > 0 ? `, less ${less} unticked` : ""} · one pull request per repo`
    : bulkWords(chosen, "one_pr", bundle);
  return (
    <div
      ref={bar}
      className="mt-4 min-w-0 scroll-mt-16"
      data-testid="bulk-bar"
    >
      {ask ? (
        <FixRequest ids={ask.ids} select={ask.select} combine={ask.combine} names={names} onCancel={onClose} onRemove={onRemove} />
      ) : (
        <div className="min-w-0 rounded-xl border border-zinc-700 bg-zinc-900 text-sm shadow-lg">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <div className="min-w-0 flex-1 basis-64">
              <p className="font-medium text-zinc-100 [overflow-wrap:anywhere]" aria-live="polite" data-testid="bulk-summary">
                {summary}
              </p>
              <p className="mt-0.5 hidden text-xs text-zinc-400 md:block">
                <kbd className="font-sans">x</kbd> selects a row · shift-click selects a range · <kbd className="font-sans">Esc</kbd> clears
              </p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-3">
              <button type="button" className={`${linkButton} !text-xs`} onClick={onClear} data-testid="bulk-clear">
                Clear selection
              </button>
              <div className="relative flex">
                <button type="button" className={`${primaryButton} rounded-r-none`} onClick={() => go("one_pr")} disabled={preparing} data-testid="bulk-open">
                  {preparing ? "Reading the list…" : one === null ? "Fix in one PR per repo" : one === 1 ? "Fix in one PR" : `Fix in ${one} PRs, one per repo`}
                </button>
                <button
                  type="button"
                  className={`inline-flex min-h-9 items-center justify-center rounded-r-lg border-l border-zinc-300 bg-white px-2 text-zinc-900 transition-colors hover:bg-zinc-200 disabled:opacity-60 motion-reduce:transition-none ${focusRing}`}
                  onClick={() => setMenu((m) => !m)}
                  disabled={preparing}
                  aria-haspopup="menu"
                  aria-expanded={menu}
                  aria-label="Other ways to open the PRs"
                  data-testid="bulk-more"
                >
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </button>
                {menu && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-2xl"
                    data-testid="bulk-menu"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      autoFocus
                      className={`block w-full px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800 ${focusRing}`}
                      onClick={() => go("per_package")}
                      data-testid="bulk-per-package"
                    >
                      One PR per package
                      <span className="block text-xs text-zinc-400">
                        {perPackage === null ? "A pull request for each package" : `${perPackage} pull request${perPackage === 1 ? "" : "s"}`}, for people who want them split
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          {(offer !== null || (everything && less === 0)) && (
            <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-zinc-800 bg-zinc-800/40 px-4 py-2 text-center text-sm text-zinc-300" data-testid="select-all-matching">
              {everything ? (
                <span>All {fixes(count)} that match{filtered ? " the filters" : ""} are selected.</span>
              ) : (
                <>
                  <span>All {fixes(pageCount)} on this page are selected.</span>
                  <button type="button" className={`${linkButton} !text-sm`} onClick={onSelectEverything} data-testid="select-all-matching-button">
                    Select all {fixes(offer ?? 0)} that match
                  </button>
                </>
              )}
            </div>
          )}
          {error && (
            <div className="border-t border-zinc-800 px-4 py-3">
              <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100 [overflow-wrap:anywhere]" data-testid="bulk-error">
                <span className="font-medium">The selection couldn&apos;t be sent.</span> {error}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function detailHref(id: string) {
  return `/security/detail?id=${encodeURIComponent(id)}`;
}

/** The package and its fix: the row's main label, as a fix is a package bump. One line each, cut with a tooltip. */
function PackageCell({ g }: { g: FindingGroup }) {
  const lead = g.advisories[0];
  const facts = [lead?.primary, g.kev ? "on exploited list" : null, epssText(g.epss)].filter(Boolean).join(" · ");
  const label = `${g.package} ${g.version}, ${fixWords(g)}`;
  return (
    <div className="min-w-0">
      <p className="truncate" title={label}>
        <Link
          href={detailHref(lead?.finding_id ?? g.finding_ids[0])}
          className="font-mono text-sm font-medium text-zinc-100 underline-offset-4 hover:underline"
        >
          {g.package} {g.version}
        </Link>
        <span className="text-sm text-zinc-400" data-testid="fix-words">
          , {fixWords(g)}
        </span>
      </p>
      <p className="mt-0.5 truncate text-sm text-zinc-300" title={lead?.title}>
        {lead?.title || lead?.primary || "Advisory with no title"}
      </p>
      <p className="mt-0.5 truncate font-mono text-xs text-zinc-400" title={facts}>
        {facts}
        {g.malware && <span className="ml-1 text-red-300">· malicious package</span>}
      </p>
    </div>
  );
}

function FixCell({ g }: { g: FindingGroup }) {
  if (g.pr) {
    const state =
      g.pr.state === "merged"
        ? "merged"
        : g.pr.state === "closed"
          ? "closed"
          : g.pr.ci === "passing"
            ? "CI passing"
            : g.pr.ci === "failing"
              ? "fixing CI"
              : g.pr.ci
                ? "CI running"
                : null;
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1.5" data-testid="fix-state">
        <a href={g.pr.url} target="_blank" rel="noreferrer" className={`${linkButton} !text-xs`}>
          PR #{g.pr.number}
        </a>
        {state && <span className="text-xs text-zinc-400">{state}</span>}
      </span>
    );
  }
  if (g.waiting) {
    return (
      <span className="text-xs text-amber-300" data-testid="fix-state" title={g.waiting}>
        {g.waiting}
      </span>
    );
  }
  const lockOnly =
    g.manifests.length > 0 &&
    g.manifests.every((m) => /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|go\.sum|Gemfile\.lock|composer\.lock)$/.test(m));
  const words = g.status === "fixing" ? "Working on the fix" : !g.fixed_version ? "No fix yet" : lockOnly ? "Lockfile update" : `Upgrade to ${g.fixed_version}`;
  return (
    <span className="text-xs text-zinc-400" data-testid="fix-state">
      {words}
    </span>
  );
}

function AdvisoryList({ g }: { g: FindingGroup }) {
  return (
    <ul className="space-y-1.5 text-sm" data-testid="group-advisories">
      {g.advisories.map((a) => (
        <li key={a.finding_id} className="flex min-w-0 items-start gap-2">
          <TierPill tier={a.tier} />
          <div className="min-w-0">
            <Link href={detailHref(a.finding_id)} className="text-zinc-200 underline-offset-4 hover:underline [overflow-wrap:anywhere]">
              {a.title || a.primary}
            </Link>
            <p className="font-mono text-xs text-zinc-400 [overflow-wrap:anywhere]">
              {[...new Set([a.primary, ...a.ids])].join(" · ")}
              {a.fixed_version ? ` · fixed in ${a.fixed_version}` : " · no fix yet"}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Expander({ g, open, onToggle }: { g: FindingGroup; open: boolean; onToggle: () => void }) {
  const n = g.advisories.length;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${open ? "Hide" : "Show"} the ${n} advisor${n === 1 ? "y" : "ies"} for ${g.package} ${g.version}`}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded text-xs text-zinc-400 hover:text-zinc-200 ${focusRing}`}
      data-testid="expand"
    >
      <span aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}>
        <ChevronRightIcon />
      </span>
      {n} advisor{n === 1 ? "y" : "ies"}
    </button>
  );
}

interface Pick {
  isOn: (g: FindingGroup) => boolean;
  /** `range`: shift-click, from the last row picked to this one. */
  toggle: (k: string, range?: boolean) => void;
  all: (on: boolean) => void;
  /** The row `x` toggles: under the pointer, or with focus. */
  setActive: (k: string | null) => void;
}

function PickBox({ g, pick }: { g: FindingGroup; pick: Pick }) {
  const why = cannotFix(g);
  return (
    <span title={why ?? undefined} className="inline-flex">
      <input
        type="checkbox"
        className="h-4 w-4 accent-zinc-200 disabled:opacity-40"
        checked={pick.isOn(g)}
        disabled={!!why}
        onClick={(e) => {
          e.preventDefault();
          pick.toggle(g.key, e.shiftKey);
        }}
        onChange={() => {}}
        aria-label={why ? `${g.package} ${g.version}: ${why}` : `Select ${g.package} ${g.version}`}
        data-testid="pick"
      />
    </span>
  );
}

/** The header checkbox: on, off, or partly on when some rows are picked. */
function AllBox({ all, some, disabled, onChange, label, testId }: { all: boolean; some: boolean; disabled: boolean; onChange: () => void; label?: string; testId: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some;
  }, [some]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="h-4 w-4 shrink-0 accent-zinc-200"
      checked={all}
      disabled={disabled}
      onChange={onChange}
      aria-label={label}
      data-testid={testId}
    />
  );
}

function GroupsTable({ rows, showRepo, pick }: { rows: FindingGroup[]; showRepo: boolean; pick: Pick | null }) {
  const now = Date.now();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const head = ["Tier", "Package and fix", ...(showRepo ? ["Repo"] : []), "Verdict", "Fix", "Due"];
  const selectable = rows.filter((g) => !cannotFix(g));
  const on = pick ? selectable.filter((g) => pick.isOn(g)).length : 0;
  const allOn = selectable.length > 0 && on === selectable.length;
  const someOn = on > 0 && !allOn;
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30" data-testid="findings">
      <div className="hidden lg:block">
        <table aria-label="Findings" className="w-full table-fixed text-sm">
          <colgroup>
            {pick && <col className="w-10" />}
            <col className="w-20" />
            <col />
            {showRepo && <col className="w-28" />}
            <col className="w-40" />
            <col className="w-36" />
            <col className="w-24" />
          </colgroup>
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400">
              {pick && (
                <th scope="col" className="py-2.5 pl-4">
                  <AllBox all={allOn} some={someOn} disabled={selectable.length === 0} onChange={() => pick.all(!allOn)} label="Select every fix on this page" testId="pick-all" />
                </th>
              )}
              {head.map((h) => (
                <th key={h} scope="col" className={`whitespace-nowrap px-3 py-2.5 font-medium ${h === "Due" ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rows.map((g) => (
              <Fragment key={g.key}>
                <tr
                  className={`align-top ${pick?.isOn(g) ? "bg-zinc-800/40" : ""}`}
                  data-testid="finding-row"
                  data-key={g.key}
                  onMouseEnter={pick ? () => pick.setActive(g.key) : undefined}
                  onFocus={pick ? () => pick.setActive(g.key) : undefined}
                >
                  {pick && (
                    <td className="py-3 pl-4">
                      <PickBox g={g} pick={pick} />
                    </td>
                  )}
                  <td className="px-3 py-3">
                    <TierPill tier={g.tier} provisional={g.tier_provisional} />
                  </td>
                  <td className="min-w-0 px-3 py-3">
                    <PackageCell g={g} />
                    <div className="mt-1">
                      <Expander g={g} open={!!open[g.key]} onToggle={() => toggle(g.key)} />
                    </div>
                  </td>
                  {showRepo && (
                    <td className="px-3 py-3 text-zinc-300">
                      <span className="block truncate whitespace-nowrap" title={g.repo} data-testid="repo-cell">
                        {repoName(g.repo)}
                      </span>
                    </td>
                  )}
                  <td className="px-3 py-3">
                    <VerdictPill verdict={g.verdict} scope={g.scope} reason={g.evidence?.summary} lines={g.evidence?.lines.length} />
                  </td>
                  <td className="px-3 py-3">
                    <FixCell g={g} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <DueDate due={g.due_at} active={isActive(g)} now={now} />
                  </td>
                </tr>
                {open[g.key] && (
                  <tr data-testid="group-detail">
                    {pick && <td />}
                    <td />
                    <td colSpan={head.length - 1} className="px-3 pb-4">
                      <AdvisoryList g={g} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {/* Below `lg:` one card per fix, so nothing hides off the right edge; the header checkbox is a row of its own. */}
      {pick && (
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 border-b border-zinc-800 px-4 py-2 text-sm text-zinc-300 lg:hidden">
          <AllBox all={allOn} some={someOn} disabled={selectable.length === 0} onChange={() => pick.all(!allOn)} testId="pick-all-cards" />
          Select all {selectable.length} on this page
        </label>
      )}
      <ul aria-label="Findings" className="divide-y divide-zinc-800 lg:hidden">
        {rows.map((g) => (
          <li
            key={g.key}
            className={`min-w-0 space-y-2 px-4 py-3 ${pick?.isOn(g) ? "bg-zinc-800/40" : ""}`}
            data-testid="finding-card"
            data-key={g.key}
            onMouseEnter={pick ? () => pick.setActive(g.key) : undefined}
            onFocus={pick ? () => pick.setActive(g.key) : undefined}
          >
            <div className="flex min-w-0 items-start gap-2">
              {pick && <PickBox g={g} pick={pick} />}
              <TierPill tier={g.tier} provisional={g.tier_provisional} />
              <div className="min-w-0 flex-1">
                <PackageCell g={g} />
              </div>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <VerdictPill verdict={g.verdict} scope={g.scope} reason={g.evidence?.summary} lines={g.evidence?.lines.length} />
              {showRepo && (
                <span className="max-w-[10rem] truncate text-zinc-400" title={g.repo}>
                  {repoName(g.repo)}
                </span>
              )}
              <span className="ml-auto">
                <DueDate due={g.due_at} active={isActive(g)} now={now} />
              </span>
            </div>
            <div>
              <FixCell g={g} />
            </div>
            <div>
              <Expander g={g} open={!!open[g.key]} onToggle={() => toggle(g.key)} />
            </div>
            {open[g.key] && <AdvisoryList g={g} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
