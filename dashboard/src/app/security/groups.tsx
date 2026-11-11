"use client";

// The findings, one row per fix: a package at one version with every
// advisory the bump clears. The worst advisory sets the row's tier and due
// date; the row expands to list them all. Searched, filtered and sorted on
// the server (GET /api/security/groups).

import { Fragment, useCallback, useState } from "react";
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
import { focusRing, linkButton, primaryButton } from "@/components/ui";
import {
  TIERS,
  cannotFix,
  epssText,
  fixWords,
  isActive,
  repoName,
  securityApi,
  type FindingGroup,
  type GroupFilter,
  type SecurityOverview,
  type Tier,
} from "@/lib/security";
import { DueDate, TierPill, VerdictPill } from "./parts";
import { FixRequest } from "./fix-request";

export const STATUSES = ["open", "fixed", "dismissed", "all"] as const;
export type StatusFilter = (typeof STATUSES)[number];
export const SORTS = ["tier", "due", "package"] as const;
export type SortKey = (typeof SORTS)[number];
const TIER_TONE: Record<Tier, Tone> = { P0: "danger", P1: "attention", P2: "waiting", P3: "muted" };

export interface GroupListFilter {
  status: StatusFilter;
  tier: Tier | "";
  repo: string;
  q: string;
  sort: SortKey;
}

type Patch = Partial<Record<keyof GroupListFilter, string>>;

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
  const [asking, setAsking] = useState(false);
  const teamRepos = useTeamRepos();
  const scopedRepos = (overview.repos ?? []).map((r) => r.repo);
  const repos = scopedRepos.length > 0 ? scopedRepos : teamRepos;
  const { status, tier, repo, q, sort } = filter;
  const [shapeError, setShapeError] = useState<string | null>(null);
  const fetchPage = useCallback(
    (cursor?: string) => {
      const f: GroupFilter = { status, tier, repo, q, sort, cursor };
      return securityApi.groups(f).then(
        (r) => ({ items: r.groups, next: r.next_cursor }),
        (e) => {
          setShapeError(e instanceof Error ? e.message : null);
          throw e;
        },
      );
    },
    [status, tier, repo, q, sort],
  );
  const { items, next, loading, loadingMore, error, moreFailed, loadMore, reload } = usePagedList<FindingGroup>(fetchPage, [status, tier, repo, q, sort]);
  const chosen = items.filter((g) => picked[g.key] && !cannotFix(g));
  const pick = admin
    ? {
        picked,
        toggle: (k: string) => setPicked((p) => ({ ...p, [k]: !p[k] })),
        all: (on: boolean) => setPicked(on ? Object.fromEntries(items.filter((g) => !cannotFix(g)).map((g) => [g.key, true])) : {}),
      }
    : null;
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
              return { value: t, label: t, tone: TIER_TONE[t], count: status === "open" ? (g ? g[key] : c[key]) : undefined };
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
      {g && status === "open" && (
        <p className="mt-2 text-xs text-zinc-400" data-testid="group-count">
          {g.open} fix{g.open === 1 ? "" : "es"} for {c.open} advisor{c.open === 1 ? "y" : "ies"}
        </p>
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
      {admin && chosen.length > 0 && (
        <div className="sticky bottom-3 z-20 mt-4" data-testid="bulk-bar">
          {asking ? (
            <FixRequest
              ids={chosen.flatMap((g) => g.finding_ids)}
              onCancel={() => {
                setAsking(false);
                setPicked({});
                reload();
              }}
            />
          ) : (
            <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900/95 px-4 py-3 text-sm shadow-xl backdrop-blur">
              <p className="min-w-0 flex-1 text-zinc-200 [overflow-wrap:anywhere]" data-testid="bulk-summary">
                {bulkWords(chosen)}
              </p>
              <button type="button" className={`${linkButton} !text-xs`} onClick={() => setPicked({})}>
                Clear
              </button>
              <button type="button" className={primaryButton} onClick={() => setAsking(true)} data-testid="bulk-open">
                Open fix PRs
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** "3 selected (7 advisories): these become 3 PRs (tar, protobufjs, qs)". */
export function bulkWords(chosen: FindingGroup[]): string {
  const advisories = chosen.reduce((n, g) => n + g.advisories.length, 0);
  const names = [...new Set(chosen.map((g) => g.package))];
  const shown = names.slice(0, 4).join(", ") + (names.length > 4 ? `, and ${names.length - 4} more` : "");
  return `${chosen.length} selected (${advisories} advisor${advisories === 1 ? "y" : "ies"}): these become ${chosen.length} PR${chosen.length === 1 ? "" : "s"} (${shown})`;
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
        <Link href={detailHref(lead?.finding_id ?? g.finding_ids[0])} className="font-mono text-sm font-medium text-zinc-100 underline-offset-4 hover:underline">
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
    const state = g.pr.state === "merged" ? "merged" : g.pr.state === "closed" ? "closed" : g.pr.ci === "passing" ? "CI passing" : g.pr.ci === "failing" ? "fixing CI" : g.pr.ci ? "CI running" : null;
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
  const lockOnly = g.manifests.length > 0 && g.manifests.every((m) => /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|go\.sum|Gemfile\.lock|composer\.lock)$/.test(m));
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
  picked: Record<string, boolean>;
  toggle: (k: string) => void;
  all: (on: boolean) => void;
}

function PickBox({ g, pick }: { g: FindingGroup; pick: Pick }) {
  const why = cannotFix(g);
  return (
    <span title={why ?? undefined} className="inline-flex">
      <input
        type="checkbox"
        className="h-4 w-4 accent-zinc-200 disabled:opacity-40"
        checked={!why && !!pick.picked[g.key]}
        disabled={!!why}
        onChange={() => pick.toggle(g.key)}
        aria-label={why ? `${g.package} ${g.version}: ${why}` : `Select ${g.package} ${g.version}`}
        data-testid="pick"
      />
    </span>
  );
}

function GroupsTable({ rows, showRepo, pick }: { rows: FindingGroup[]; showRepo: boolean; pick: Pick | null }) {
  const now = Date.now();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const head = ["Tier", "Package and fix", ...(showRepo ? ["Repo"] : []), "Verdict", "Fix", "Due"];
  const selectable = rows.filter((g) => !cannotFix(g));
  const allOn = !!pick && selectable.length > 0 && selectable.every((g) => pick.picked[g.key]);
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
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-zinc-200"
                    checked={allOn}
                    disabled={selectable.length === 0}
                    onChange={() => pick.all(!allOn)}
                    aria-label="Select every fix shown"
                    data-testid="pick-all"
                  />
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
                <tr className="align-top" data-testid="finding-row" data-key={g.key}>
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
      {/* Below `lg:` one card per fix, so nothing hides off the right edge. */}
      <ul aria-label="Findings" className="divide-y divide-zinc-800 lg:hidden">
        {rows.map((g) => (
          <li key={g.key} className="min-w-0 space-y-2 px-4 py-3" data-testid="finding-card" data-key={g.key}>
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
