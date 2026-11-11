"use client";

// Security: the advisories that touch the team's dependencies, whether the
// code reaches the vulnerable part, and the fix for each one with its
// deadline, one row per fix. The sources it reads and the day's spend are
// here too. The policy (what gets a PR, when, the deadlines and the daily
// limits) is at /security/policy.

import { Suspense, useEffect, useState } from "react";
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
import { ListSkeleton, useListParams } from "@/components/list";
import { SECURITY_ADMIN, TIERS, dueIn, repoName, securityApi, shortTokens, type SecurityOverview, type SecuritySpend, type Tier } from "@/lib/security";
import { PermissionBanner } from "./parts";
import { SourcesPanel } from "./sources";
import { GroupsList, SORTS, STATUSES, type SortKey, type StatusFilter } from "./groups";

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

function SecurityOverviewPage() {
  const { toast } = useToast();
  const { ready, can } = useCan();
  const admin = ready && can(SECURITY_ADMIN);
  const [overview, setOverview] = useState<SecurityOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [params, setParams] = useListParams({ status: "open", tier: "", repo: "", q: "", sort: "tier" });
  const status: StatusFilter = (STATUSES as readonly string[]).includes(params.status) ? (params.status as StatusFilter) : "open";
  const tier = (TIERS as string[]).includes(params.tier) ? (params.tier as Tier) : "";
  const sort: SortKey = (SORTS as readonly string[]).includes(params.sort) ? (params.sort as SortKey) : "tier";
  const repo = params.repo;

  useEffect(() => {
    let live = true;
    setLoadError(null);
    setOverview(null);
    securityApi.overview().then(
      (o) => live && setOverview(o),
      (e) => live && setLoadError(e instanceof Error ? e.message : "The request failed."),
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
              <PermissionBanner reason={overview.sources.dependabot_reason} />
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
                    {admin ? "Turn it on" : "See the policy"}
                  </Link>
                }
              >
                When it&apos;s on, Coderhelm checks each advisory against your code, opens fix pull requests for the ones your code reaches, and
                posts the urgent ones to your alerts channel, within daily limits on runs and tokens. You can preview first instead.
              </EmptyState>
            </div>
          ) : (
            <>
              {overview.dry_run && (
                <div className="mt-6">
                  <Callout
                    variant="info"
                    title="You chose to preview first"
                    testId="dry-run-note"
                    actions={
                      <>
                        <Link href="/security/policy#mode" className={linkButton}>
                          Open fix PRs (recommended)
                        </Link>
                        <Link href="/security/policy#preview" className={linkButton}>
                          See what it would open
                        </Link>
                      </>
                    }
                  >
                    <p>Findings are checked and ranked, but no pull requests open and no cards post until you switch to opening fix PRs.</p>
                  </Callout>
                </div>
              )}
              {overview.spend && <SpendLine s={overview.spend} />}
              <Tiles o={overview} />
              <GroupsList overview={overview} filter={{ status, tier, repo, q: params.q, sort }} setParams={setParams} admin={admin} />
              <SourcesPanel o={overview} />
            </>
          )}
        </>
      )}
    </Page>
  );
}

/** "Checked 38 packages today, 92k of 400k tokens · Fix runs 1 of 3 today · This month 1.2M tokens". */
function SpendLine({ s }: { s: SecuritySpend }) {
  const t = s.triage;
  const f = s.fix;
  const full = t.tokens_today >= t.tokens_limit;
  const runsFull = f.runs_today >= f.runs_limit || f.tokens_today >= f.tokens_limit;
  return (
    <p className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-400" data-testid="spend">
      <span className={full ? "text-amber-300" : undefined}>
        Checked {t.packages_today} package{t.packages_today === 1 ? "" : "s"} today, {shortTokens(t.tokens_today)} of {shortTokens(t.tokens_limit)} tokens
        {full ? ": the rest wait for tomorrow's check" : ""}
      </span>
      <span className={runsFull ? "text-amber-300" : undefined}>
        Fix runs {f.runs_today} of {f.runs_limit} today, {shortTokens(f.tokens_today)} of {shortTokens(f.tokens_limit)} tokens
      </span>
      <span>This month {shortTokens(s.tokens_month)} tokens on security</span>
    </p>
  );
}

function Tiles({ o }: { o: SecurityOverview }) {
  // Fixes first (a package at one version), advisories second.
  const g = o.groups ?? { open: o.counts.open, p0: o.counts.p0, p1: o.counts.p1, p2: o.counts.p2, p3: o.counts.p3, due_7d: o.counts.due_7d };
  const now = g.p0 + g.p1;
  const next = dueIn(o.next_due_at);
  const median = o.median_hours_to_merge_30d;
  const checking = o.verdicts?.checking ?? 0;
  return (
    <StatGrid className="mt-6">
      <StatTile
        label="Needs action now"
        value={now}
        tone={now > 0 ? "danger" : "neutral"}
        note={now > 0 ? `P0 ${g.p0}, P1 ${g.p1} · ${o.counts.p0 + o.counts.p1} advisories` : checking > 0 ? `${checking} advisories still being checked` : "Nothing urgent"}
        testId="tile-now"
      />
      <StatTile
        label="Due this week"
        value={g.due_7d}
        tone={g.due_7d > 0 ? "warning" : "neutral"}
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
