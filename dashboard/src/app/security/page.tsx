"use client";

// Security: the advisories that touch the team's dependencies, whether the
// code reaches the vulnerable part, and the fix for each one with its
// deadline. The policy (what gets a PR, when, and the deadlines) is at
// /security/policy.

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useCan } from "@/hooks/use-can";
import { useToast } from "@/components/toast";
import { Page, PageHeader } from "@/components/page";
import { Callout } from "@/components/callout";
import { Problem } from "@/components/problem";
import { Skeleton } from "@/components/skeleton";
import { StatGrid, StatTile } from "@/components/stat-tile";
import { EmptyState } from "@/components/empty-state";
import { ShieldIcon } from "@/components/icons";
import { linkButton, primaryButton } from "@/components/ui";
import {
  ListEmpty,
  ListError,
  ListSkeleton,
  LoadMore,
  RepoFilter,
  StatusToggles,
  usePagedList,
  useListParams,
  useTeamRepos,
  type Tone,
} from "@/components/list";
import {
  SECURITY_ADMIN,
  TIERS,
  advisoryIds,
  dueIn,
  epssText,
  repoName,
  securityApi,
  type Finding,
  type FindingFilter,
  type SecurityConfig,
  type SecurityOverview,
  type Tier,
} from "@/lib/security";
import { DueText, FixState, PermissionBanner, TierPill, VerdictPill } from "./parts";

export default function SecurityPage() {
  return (
    <Suspense
      fallback={
        <Page>
          <PageHeader title="Security" />
          <div className="mt-6">
            <ListSkeleton />
          </div>
        </Page>
      }
    >
      <SecurityOverviewPage />
    </Suspense>
  );
}

const STATUSES = ["open", "fixed", "dismissed", "all"] as const;
type StatusFilter = (typeof STATUSES)[number];
const TIER_TONE: Record<Tier, Tone> = { P0: "danger", P1: "attention", P2: "waiting", P3: "muted" };

function SecurityOverviewPage() {
  const { toast } = useToast();
  const { ready, can } = useCan();
  const admin = ready && can(SECURITY_ADMIN);
  const [overview, setOverview] = useState<SecurityOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [config, setConfig] = useState<SecurityConfig | null>(null);
  const [scanning, setScanning] = useState(false);
  const [params, setParams] = useListParams({ status: "open", tier: "", repo: "" });
  const status: StatusFilter = (STATUSES as readonly string[]).includes(params.status) ? (params.status as StatusFilter) : "open";
  const tier = (TIERS as string[]).includes(params.tier) ? (params.tier as Tier) : "";
  const repo = params.repo;

  useEffect(() => {
    let live = true;
    setLoadError(null);
    setOverview(null);
    securityApi.overview().then(
      (o) => live && setOverview(o),
      (e) => live && setLoadError(e instanceof Error ? e.message : "The request failed."),
    );
    // The policy only says what comes next for a finding without a PR; the page works without it.
    securityApi.config().then(
      (c) => live && setConfig(c.config),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  const scan = async () => {
    setScanning(true);
    try {
      await securityApi.scan(repo || null);
      toast(repo ? `Checking ${repoName(repo)} now. New findings show up here in a few minutes.` : "Checking every repo now. New findings show up here in a few minutes.");
    } catch (e) {
      toast(e instanceof Error && /\b403\b/.test(e.message) ? "Only admins can start a check." : "Could not start the check. Try again.", "error");
    }
    setScanning(false);
  };

  const on = !!overview?.enabled;
  return (
    <Page>
      <PageHeader
        title="Security"
        lead="Advisories that touch your dependencies, whether your code reaches the vulnerable part, and the fix for each one."
        actions={
          <>
            {admin && on && (
              <button type="button" className={primaryButton} onClick={scan} disabled={scanning} data-testid="scan-now">
                {scanning ? "Starting…" : repo ? `Check ${repoName(repo)} now` : "Check all repos now"}
              </button>
            )}
          </>
        }
      />

      {loadError ? (
        <div className="mt-6">
          <Problem title="We couldn't load security fixes" onRetry={() => setAttempt((n) => n + 1)} testId="security-error">
            {loadError}
          </Problem>
        </div>
      ) : !overview ? (
        <div className="mt-6 space-y-4" aria-busy="true" aria-label="Loading security fixes">
          <StatGrid>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </StatGrid>
          <ListSkeleton label="Loading findings" />
        </div>
      ) : (
        <>
          {overview.permission_missing && (
            <div className="mt-6">
              <PermissionBanner />
            </div>
          )}
          {!on ? (
            <div className="mt-6">
              <EmptyState
                icon={<ShieldIcon />}
                title="Security fixes are off"
                testId="security-off"
                action={
                  <Link href="/security/policy" className={primaryButton}>
                    {admin ? "Set up the policy" : "See the policy"}
                  </Link>
                }
              >
                When it&apos;s on, Coderhelm checks each advisory against your code, opens fix pull requests for the ones your code reaches, and
                posts the urgent ones to your alerts channel. It starts with a preview that changes nothing.
              </EmptyState>
            </div>
          ) : (
            <>
              {overview.dry_run && (
                <div className="mt-6">
                  <Callout
                    variant="info"
                    title="Preview: nothing is opened or posted"
                    testId="dry-run-note"
                    actions={
                      <Link href="/security/policy#preview" className={linkButton}>
                        See what it would open
                      </Link>
                    }
                  >
                    <p>Coderhelm finds and checks advisories, but opens no pull requests and posts no cards until dry run is turned off in the policy.</p>
                  </Callout>
                </div>
              )}
              <Tiles o={overview} />
              <FindingsList
                overview={overview}
                config={config}
                filter={{ status, tier, repo }}
                setParams={setParams}
              />
            </>
          )}
        </>
      )}
    </Page>
  );
}

function Tiles({ o }: { o: SecurityOverview }) {
  const now = o.counts.p0 + o.counts.p1;
  const next = dueIn(o.next_due_at);
  const median = o.median_hours_to_merge_30d;
  return (
    <StatGrid className="mt-6">
      <StatTile
        label="Needs action now"
        value={now}
        tone={now > 0 ? "danger" : "neutral"}
        note={now > 0 ? `P0 ${o.counts.p0}, P1 ${o.counts.p1}` : "Nothing urgent"}
        testId="tile-now"
      />
      <StatTile
        label="Due this week"
        value={o.counts.due_7d}
        tone={o.counts.due_7d > 0 ? "warning" : "neutral"}
        note={next ? (next.overdue ? `one is ${next.text}` : `next due in ${next.text}`) : "Nothing due"}
        testId="tile-due"
      />
      <StatTile
        label="Fixed, 30 days"
        value={o.counts.fixed_30d}
        note={typeof median === "number" ? `median ${hours(median)} to merge` : "No fixes merged yet"}
        testId="tile-fixed"
      />
      <StatTile label="Noise removed" value={o.counts.noise_removed} note="Not reachable or dev only" testId="tile-noise" />
    </StatGrid>
  );
}

function hours(h: number): string {
  return h < 48 ? `${Math.max(1, Math.round(h))} h` : `${Math.round(h / 24)} d`;
}

function FindingsList({
  overview,
  config,
  filter,
  setParams,
}: {
  overview: SecurityOverview;
  config: SecurityConfig | null;
  filter: { status: StatusFilter; tier: Tier | ""; repo: string };
  setParams: (patch: Partial<Record<"status" | "tier" | "repo", string>>) => void;
}) {
  const teamRepos = useTeamRepos();
  const { status, tier, repo } = filter;
  const [shapeError, setShapeError] = useState<string | null>(null);
  const fetchPage = useCallback(
    (cursor?: string) => {
      const f: FindingFilter = { status, tier, repo, cursor };
      return securityApi.findings(f).then(
        (r) => ({ items: r.findings, next: r.next_cursor }),
        (e) => {
          setShapeError(e instanceof Error ? e.message : null);
          throw e;
        },
      );
    },
    [status, tier, repo],
  );
  const { items, next, loading, loadingMore, error, moreFailed, loadMore, reload } = usePagedList<Finding>(fetchPage, [status, tier, repo]);
  const c = overview.counts;
  const filtered = status !== "open" || !!tier || !!repo;
  const clear = () => setParams({ status: "open", tier: "", repo: "" });

  return (
    <section aria-label="Findings" className="mt-8 min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="list-toolbar">
        <StatusToggles
          label="Show findings"
          value={status}
          onChange={(v) => setParams({ status: v })}
          options={[
            { value: "open", label: "Open", count: c.open },
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
            ...TIERS.map((t) => ({ value: t, label: t, tone: TIER_TONE[t], count: status === "open" ? c[t.toLowerCase() as "p0"] : undefined })),
          ]}
        />
        {(teamRepos.length > 1 || !!repo) && <RepoFilter value={repo} onChange={(v) => setParams({ repo: v })} repos={teamRepos} />}
        {filtered && (
          <button type="button" onClick={clear} className={`${linkButton} !text-xs`}>
            Clear filters
          </button>
        )}
      </div>

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
          <FindingsTable rows={items} config={config} />
        )}
        {!loading && !error && <LoadMore hasMore={!!next} loading={loadingMore} failed={moreFailed} onClick={loadMore} />}
      </div>
    </section>
  );
}

function AdvisoryCell({ f }: { f: Finding }) {
  const ids = advisoryIds(f.advisory);
  const facts = [ids[0], ...ids.slice(1, 2), f.advisory.kev ? "on exploited list" : null, epssText(f.advisory.epss)].filter(Boolean).join(" · ");
  return (
    <div className="min-w-0">
      <Link href={`/security/detail?id=${encodeURIComponent(f.id)}`} className="font-medium text-zinc-100 underline-offset-4 hover:underline [overflow-wrap:anywhere]">
        {f.advisory.title || f.advisory.primary || "Advisory with no title"}
      </Link>
      <p className="mt-0.5 font-mono text-xs text-zinc-400 [overflow-wrap:anywhere]">
        {facts}
        {f.advisory.malware && <span className="ml-1 text-red-300">· malicious package</span>}
      </p>
    </div>
  );
}

function FindingsTable({ rows, config }: { rows: Finding[]; config: SecurityConfig | null }) {
  const now = Date.now();
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30" data-testid="findings">
      <div className="hidden overflow-x-auto lg:block">
        <table aria-label="Findings" className="w-full table-auto text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400">
              {["Tier", "Advisory", "Package", "Repo", "Verdict", "Fix", "Due"].map((h) => (
                <th key={h} scope="col" className={`px-4 py-2.5 font-medium ${h === "Advisory" ? "w-full" : "w-px whitespace-nowrap"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rows.map((f) => (
              <tr key={f.id} className="align-top" data-testid="finding-row" data-id={f.id}>
                <td className="px-4 py-3">
                  <TierPill tier={f.tier} />
                </td>
                <td className="min-w-64 px-4 py-3">
                  <AdvisoryCell f={f} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-200">
                  {f.package} {f.version}
                </td>
                <td className="max-w-48 px-4 py-3 text-zinc-300 [overflow-wrap:anywhere]" title={f.repo}>
                  {repoName(f.repo)}
                </td>
                <td className="px-4 py-3">
                  <VerdictPill verdict={f.verdict} scope={f.scope} />
                </td>
                <td className="min-w-32 px-4 py-3">
                  <FixState f={f} config={config} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <DueText f={f} now={now} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Below `lg:` one card per finding, so nothing hides off the right edge. */}
      <ul aria-label="Findings" className="divide-y divide-zinc-800 lg:hidden">
        {rows.map((f) => (
          <li key={f.id} className="min-w-0 space-y-2 px-4 py-3" data-testid="finding-card" data-id={f.id}>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <TierPill tier={f.tier} />
              <VerdictPill verdict={f.verdict} scope={f.scope} />
              <span className="ml-auto text-xs">
                <DueText f={f} now={now} />
              </span>
            </div>
            <AdvisoryCell f={f} />
            <p className="min-w-0 text-xs text-zinc-400 [overflow-wrap:anywhere]">
              <span className="font-mono text-zinc-200">
                {f.package} {f.version}
              </span>{" "}
              in {repoName(f.repo)}
            </p>
            <FixState f={f} config={config} />
          </li>
        ))}
      </ul>
    </div>
  );
}
