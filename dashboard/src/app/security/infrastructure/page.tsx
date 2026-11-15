"use client";

// Security › Infrastructure: what runs in the team's AWS accounts, matched
// against AWS's bulletins and the Amazon Linux and Bottlerocket advisories,
// one row per fix. A fix is a pull request in the code that defines the
// resource, an action Coderhelm applies in AWS after one approval, a runbook
// step, or nothing at all (AWS-managed). A row closes only when Coderhelm
// reads the account again: fixed when the fix runs, removed when the
// resource is gone. Opening the page refreshes a read older than a few
// minutes; the list updates when that read is done.

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCan } from "@/hooks/use-can";
import { useToast } from "@/components/toast";
import { Page, PageHeader, SectionHeading } from "@/components/page";
import { Callout } from "@/components/callout";
import { Problem } from "@/components/problem";
import { Skeleton } from "@/components/skeleton";
import { StatGrid, StatTile } from "@/components/stat-tile";
import { EmptyState } from "@/components/empty-state";
import { Disclosure } from "@/components/disclosure";
import { AwsIcon } from "@/components/icons";
import { Chip, List, ListRow, ListSkeleton, StatusToggles, Time, type Tone } from "@/components/list";
import { linkButton, primaryButton, smallSecondaryButton } from "@/components/ui";
import { SECURITY_ADMIN, TIERS, closedWords, type Tier } from "@/lib/security";
import {
  INFRA_STATUS_LOOK,
  countWords,
  inAws,
  infraApi,
  isClosed,
  type ApplyWhen,
  type InfraFeed,
  type InfraFinding,
  type InfraOverview,
} from "@/lib/infra-security";
import { TierPill } from "../parts";
import { ExposureText, FindingDetails, FixChip, InspectorChips, MissingReads } from "./parts";

export default function SecurityInfrastructurePage() {
  return (
    <Suspense
      fallback={
        <Page>
          <PageHeader title="Infrastructure" />
          <div className="mt-6">
            <ListSkeleton />
          </div>
        </Page>
      }
    >
      <InfrastructureFindings />
    </Suspense>
  );
}

const TIER_TONE: Record<Tier, Tone> = { P0: "danger", P1: "attention", P2: "waiting", P3: "muted" };
type FixFilter = "" | "pr" | "aws_step";
type View = "open" | "closed";
/** While a refresh runs: how often the page asks again, and for how long. */
const REFRESH_POLL_MS = 15_000;
const REFRESH_POLL_FOR_MS = 4 * 60_000;

function InfrastructureFindings() {
  const { toast } = useToast();
  const { ready, can } = useCan();
  const admin = ready && can(SECURITY_ADMIN);
  const focus = useSearchParams().get("finding");
  const [data, setData] = useState<InfraOverview | null>(null);
  const [feeds, setFeeds] = useState<InfraFeed[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [checking, setChecking] = useState(false);
  const [tier, setTier] = useState<Tier | "">("");
  const [fixKind, setFixKind] = useState<FixFilter>("");
  const [view, setView] = useState<View>("open");

  useEffect(() => {
    let live = true;
    setError(null);
    setData(null);
    infraApi.overview().then(
      (o) => live && setData(o),
      (e) => live && setError(e instanceof Error ? e.message : "The request failed."),
    );
    // The Sources panel is extra reading; the page works without it.
    infraApi.sources().then(
      (f) => live && setFeeds(f),
      () => live && setFeeds([]),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  // A refresh the page started: ask again until the read is newer, then
  // show the new list in place.
  const refreshing = !!data?.refreshing;
  const readAt = data?.read_at ?? null;
  useEffect(() => {
    if (!refreshing) return;
    let live = true;
    const started = Date.now();
    const t = window.setInterval(() => {
      if (Date.now() - started > REFRESH_POLL_FOR_MS) {
        window.clearInterval(t);
        setData((d) => (d ? { ...d, refreshing: false } : d));
        return;
      }
      infraApi.overview().then(
        (o) => {
          if (!live) return;
          if (o.read_at !== readAt) {
            window.clearInterval(t);
            setData({ ...o, refreshing: false });
          }
        },
        () => {},
      );
    }, REFRESH_POLL_MS);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, [refreshing, readAt]);

  const check = async () => {
    setChecking(true);
    try {
      await infraApi.check();
      toast("Reading every account now. New findings show up here in a few minutes.");
    } catch (e) {
      toast(e instanceof Error && /\b403\b/.test(e.message) ? "Only admins can start a check." : "Could not start the check. Try again.", "error");
    }
    setChecking(false);
  };

  const anyOn = !!data?.accounts.some((a) => a.on);
  return (
    <Page>
      <PageHeader
        title="Infrastructure"
        lead="What runs in your AWS accounts, checked against AWS's security bulletins and the Amazon Linux and Bottlerocket advisories. One row per fix, and it says when AWS patches it for you."
        actions={
          admin && data && anyOn ? (
            <button type="button" className={primaryButton} onClick={check} disabled={checking} data-testid="infra-check-now">
              {checking ? "Starting…" : "Check accounts now"}
            </button>
          ) : null
        }
      />

      {error ? (
        <div className="mt-6">
          <Problem title="We couldn't load infrastructure findings" onRetry={() => setAttempt((n) => n + 1)} testId="infra-error">
            {error}
          </Problem>
        </div>
      ) : !data ? (
        <div className="mt-6 space-y-4" aria-busy="true" aria-label="Loading infrastructure findings">
          <StatGrid>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </StatGrid>
          <ListSkeleton label="Loading findings" />
        </div>
      ) : !anyOn ? (
        <div className="mt-6">
          <EmptyState
            icon={<AwsIcon />}
            title="No AWS account is being read yet"
            testId="infra-off"
            action={
              <Link href="/settings/integrations/aws" className={primaryButton}>
                {admin ? "Turn it on for an account" : "See AWS accounts"}
              </Link>
            }
          >
            Switch on Infrastructure vulnerabilities for a connected AWS account. Coderhelm then reads, read-only, which AMIs, node groups,
            databases and caches it runs, once a day, and tells you which ones you have to fix and which ones AWS patches for you.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <MissingReads accounts={data.accounts} />
          </div>
          {data.dry_run && (
            <div className="mt-4">
              <Callout
                variant="info"
                title="Preview first is on: no pull requests are opened"
                testId="infra-dry-run"
                actions={
                  admin ? (
                    <Link href="/security/policy#mode" className={linkButton} data-testid="infra-dry-run-turn-on">
                      Open fix PRs (recommended)
                    </Link>
                  ) : undefined
                }
              >
                <p>
                  Findings and runbook steps show here. Fix pull requests open by themselves once the policy is set to Open fix PRs
                  {admin ? ", or when you ask for one on a finding." : "; ask an admin to change it."}
                </p>
              </Callout>
            </div>
          )}
          <Freshness data={data} />
          <Tiles data={data} />
          <FindingsSection
            data={data}
            admin={admin}
            focus={focus}
            tier={tier}
            setTier={setTier}
            fixKind={fixKind}
            setFixKind={setFixKind}
            view={view}
            setView={setView}
          />
          <Sources feeds={feeds} readAt={data.read_at} />
        </>
      )}
    </Page>
  );
}

/** When the list was last read from AWS, and whether a read is running now. */
function Freshness({ data }: { data: InfraOverview }) {
  const at = data.oldest_read_at ?? data.read_at;
  return (
    <p className="mt-4 text-xs text-zinc-400" data-testid="infra-freshness" aria-live="polite">
      {at ? (
        <>
          Checked against AWS <Time iso={at} />.
        </>
      ) : (
        "Not read from AWS yet."
      )}
      {data.refreshing && <span className="ml-1 text-sky-300" data-testid="infra-refreshing">Checking AWS now; the list updates when it is done.</span>}
    </p>
  );
}

function Tiles({ data }: { data: InfraOverview }) {
  const c = data.counts;
  const now = c.p0 + c.p1;
  const steps = c.runbooks + (c.applies ?? 0);
  return (
    <StatGrid className="mt-6">
      <StatTile label="Needs action now" value={now} tone={now > 0 ? "danger" : "neutral"} note={now > 0 ? `P0 ${c.p0}, P1 ${c.p1}` : "Nothing urgent"} testId="infra-tile-now" />
      <StatTile label="Fix pull requests" value={c.prs} note="Changes in the code that defines it" testId="infra-tile-prs" />
      <StatTile
        label="Steps in AWS"
        value={steps}
        tone={steps > 0 ? "warning" : "neutral"}
        note={(c.applies ?? 0) > 0 ? "Coderhelm applies them after your approval" : "Runbook cards"}
        testId="infra-tile-runbooks"
      />
      <StatTile label="AWS-managed" value={c.aws_managed} note="Nothing to do, never counted open" testId="infra-tile-aws" />
    </StatGrid>
  );
}

function FindingsSection({
  data,
  admin,
  focus,
  tier,
  setTier,
  fixKind,
  setFixKind,
  view,
  setView,
}: {
  data: InfraOverview;
  admin: boolean;
  focus: string | null;
  tier: Tier | "";
  setTier: (t: Tier | "") => void;
  fixKind: FixFilter;
  setFixKind: (f: FixFilter) => void;
  view: View;
  setView: (v: View) => void;
}) {
  // Fixed and removed rows are history: never in the open list, never with
  // a Runbook or Fix PR button.
  const open = useMemo(() => data.findings.filter((f) => f.fix.kind !== "aws" && !isClosed(f)), [data.findings]);
  const closed = useMemo(() => data.findings.filter((f) => f.fix.kind !== "aws" && isClosed(f)), [data.findings]);
  const aws = data.findings.filter((f) => f.fix.kind === "aws" && !isClosed(f));
  const pool = view === "open" ? open : closed;
  const shown = useMemo(
    () =>
      pool.filter(
        (f) => (!tier || f.tier === tier) && (!fixKind || (fixKind === "pr" ? f.fix.kind === "pr" : inAws(f))),
      ),
    [pool, tier, fixKind],
  );
  const c = data.counts;
  const focused = focus && closed.some((f) => f.id === focus) && !open.some((f) => f.id === focus);
  useEffect(() => {
    if (focused) setView("closed");
  }, [focused, setView]);
  return (
    <section aria-label="Findings" className="mt-8 min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="infra-toolbar">
        <StatusToggles
          label="Show"
          value={view}
          onChange={(v) => setView(v as View)}
          options={[
            { value: "open", label: "Open", count: open.length },
            { value: "closed", label: "Fixed / Removed", tone: "success", count: closed.length },
          ]}
        />
        <StatusToggles
          label="Tier"
          value={tier}
          onChange={(v) => setTier(v as Tier | "")}
          options={[{ value: "", label: "Every tier", count: c.open }, ...TIERS.map((t) => ({ value: t, label: t, tone: TIER_TONE[t], count: c[t.toLowerCase() as "p0"] }))]}
        />
        <StatusToggles
          label="Fix"
          value={fixKind}
          onChange={(v) => setFixKind(v as FixFilter)}
          options={[
            { value: "", label: "Every fix" },
            { value: "pr", label: "Pull request", count: c.prs },
            { value: "aws_step", label: "In AWS", count: c.runbooks + (c.applies ?? 0) },
          ]}
        />
      </div>
      <div className="mt-4">
        {shown.length === 0 ? (
          <EmptyState
            compact
            title={pool.length === 0 ? (view === "open" ? "Nothing to fix" : "Nothing fixed or removed in 30 days") : "No findings match"}
            onClear={pool.length > 0 ? () => (setTier(""), setFixKind("")) : undefined}
            testId="infra-empty"
          >
            {pool.length === 0 && view === "open" ? "Nothing your accounts run is behind a fix you have to make. AWS-managed rows are below." : undefined}
          </EmptyState>
        ) : (
          <List label={view === "open" ? "Infrastructure findings" : "Fixed or removed findings"}>
            {shown.map((f) => (
              <FindingRow key={f.id} f={f} admin={admin} dryRun={data.dry_run} defaultOpen={f.id === focus} />
            ))}
          </List>
        )}
      </div>
      {aws.length > 0 && (
        <div className="mt-6" data-testid="aws-managed">
          <Disclosure summary={<span>AWS-managed, nothing to do ({aws.length})</span>} defaultOpen={aws.some((f) => f.id === focus)}>
            <p className="text-xs text-zinc-400">AWS patches these itself. They are never counted as open; each says why, in the bulletin&apos;s words.</p>
            <List label="AWS-managed">
              {aws.map((f) => (
                <FindingRow key={f.id} f={f} admin={false} dryRun={false} defaultOpen={f.id === focus} />
              ))}
            </List>
          </Disclosure>
        </div>
      )}
    </section>
  );
}

function FindingRow({ f, admin, dryRun, defaultOpen }: { f: InfraFinding; admin: boolean; dryRun: boolean; defaultOpen: boolean }) {
  const { toast } = useToast();
  const [asking, setAsking] = useState(false);
  const [asked, setAsked] = useState<string | null>(null);
  const status = INFRA_STATUS_LOOK[f.status] ?? INFRA_STATUS_LOOK.open;
  const aws = f.fix.kind === "aws";
  const done = isClosed(f);
  const [approving, setApproving] = useState<ApplyWhen | null>(null);
  const approve = async (when: ApplyWhen) => {
    setApproving(when);
    try {
      const r = await infraApi.apply(f.id, when);
      const words =
        r.status === "queued"
          ? when === "immediate"
            ? "Approved: Coderhelm applies it in AWS now (non-production first) and reads it back."
            : "Approved: Coderhelm applies it in the next maintenance window (non-production first) and reads it back."
          : (r.reason ?? "Nothing to apply.");
      setAsked(words);
      toast(words);
    } catch (e) {
      toast(e instanceof Error && /\b403\b/.test(e.message) ? "Only admins can approve updates in AWS." : "Could not approve it. Try again.", "error");
    }
    setApproving(null);
  };
  const askFix = async () => {
    setAsking(true);
    try {
      const r = await infraApi.fix(f.id);
      const words =
        r.status === "started" ? "Fix run started. The pull request shows here when it opens." : r.status === "queued" ? `Queued: ${r.reason ?? "it starts when today's limits allow."}` : r.reason ?? "Nothing to start.";
      setAsked(words);
      toast(words);
    } catch (e) {
      toast(e instanceof Error && /\b403\b/.test(e.message) ? "Only admins can open fix pull requests." : "Could not start the fix. Try again.", "error");
    }
    setAsking(false);
  };
  const closed = f.pr?.state === "closed";
  const prWords = f.pr ? (f.pr.state === "merged" ? "merged, waiting for the new version to run" : closed ? closedWords(f.pr) : f.pr.state) : null;
  // A pull request closed without merging is history, not a fix on its way: the fix is offered again.
  // (A finding the replacement check moved to its runbook is no longer a "pr" fix, so it gets no button.)
  const canAsk = !done && admin && f.fix.kind === "pr" && f.status === "open" && (!f.pr || closed) && !asked;
  const applied = !!f.apply?.applied_at;
  const canApprove = !done && admin && f.fix.kind === "apply" && f.status === "open" && !applied && !f.apply?.approved_at && !asked;
  return (
    <ListRow
      testId="infra-row"
      data={{ fix: f.fix.kind, id: f.id }}
      status={{ tone: aws ? "muted" : status.tone, live: f.status === "fixing" }}
      leading={f.tier ? <TierPill tier={f.tier} /> : undefined}
      title={f.title}
      titleText={f.title}
      quiet={aws}
      defaultOpen={defaultOpen}
      meta={[
        countWords(f.kind, f.count),
        aws ? null : <ExposureText key="x" exposure={f.exposure} />,
        f.cves[0] ?? f.sources[0]?.id,
        f.kev ? <span className="text-red-300">on exploited list</span> : null,
        f.inspector && (f.inspector.exploit_available || f.inspector.reachable) ? (
          <span key="insp" className="inline-flex flex-wrap gap-1.5">
            <InspectorChips f={f} />
          </span>
        ) : null,
      ]}
      summary={aws ? f.fix.reason : f.fix.summary}
      chips={
        done ? (
          <span data-testid="infra-closed" data-status={f.status}>
            <Chip tone={status.tone}>
              {status.label} <Time iso={f.status === "removed" ? (f.removed_at ?? f.fixed_at) : f.fixed_at} />
            </Chip>
          </span>
        ) : (
        <>
          <FixChip fix={f.fix} />
          {f.pr && (
            <a href={f.pr.url} target="_blank" rel="noreferrer" className={`${linkButton} !text-xs`} data-testid="infra-pr">
              PR #{f.pr.number}
              <span className="ml-1 text-zinc-400">{prWords}</span>
            </a>
          )}
          {!aws && !f.pr && f.status !== "open" && <Chip tone={status.tone}>{status.label}</Chip>}
          {f.fix.kind === "apply" && f.apply?.approved_at && (
            <span data-testid="infra-approved">
              <Chip tone={applied ? "success" : "info"}>{applied ? "Sent to AWS" : "Approved"}</Chip>
            </span>
          )}
        </>
        )
      }
      actions={
        canAsk ? (
          <button type="button" className={smallSecondaryButton} onClick={askFix} disabled={asking} data-testid="infra-fix" title={dryRun ? "Opens one now, even in a dry run" : undefined}>
            {asking ? "Starting…" : "Open fix PR"}
          </button>
        ) : canApprove ? (
          <span className="inline-flex flex-wrap gap-1.5">
            <button
              type="button"
              className={smallSecondaryButton}
              onClick={() => approve("next-maintenance")}
              disabled={!!approving}
              data-testid="infra-apply"
              title="Coderhelm applies it in AWS in the database's next maintenance window, non-production first"
            >
              {approving === "next-maintenance" ? "Approving…" : "Apply in next maintenance window"}
            </button>
            <button
              type="button"
              className={smallSecondaryButton}
              onClick={() => approve("immediate")}
              disabled={!!approving}
              data-testid="infra-apply-now"
              title="Coderhelm applies it in AWS now, non-production first"
            >
              {approving === "immediate" ? "Approving…" : "Apply now"}
            </button>
          </span>
        ) : null
      }
      details={<FindingDetails f={f} />}
      detailsFor={`details of ${f.name}`}
    >
      {closed && f.pr && f.status === "open" && f.fix.kind === "pr" && !asked && (
        <p className="mt-1 text-xs text-zinc-300" data-testid="infra-pr-closed">
          PR #{f.pr.number} was {closedWords(f.pr)} without merging.{" "}
          {admin ? "Open a new one when you want the fix; Coderhelm does not open one by itself for a week after a pull request is closed." : "An admin can open a new one."}
        </p>
      )}
      {asked && <p className="mt-1 text-xs text-sky-300">{asked}</p>}
      {!done && f.apply?.note && (
        <p className={`mt-1 text-xs ${f.apply.missing_permission ? "text-amber-300" : "text-zinc-300"}`} data-testid="infra-apply-note">
          {f.apply.note}
        </p>
      )}
    </ListRow>
  );
}

function Sources({ feeds, readAt }: { feeds: InfraFeed[] | null; readAt: string | null }) {
  return (
    <section className="mt-10 min-w-0" aria-labelledby="infra-sources" data-testid="infra-sources">
      <SectionHeading id="infra-sources">Sources</SectionHeading>
      <p className="mt-1 text-sm text-zinc-400">Public feeds, read once a day for every team. A feed that can&apos;t be read keeps its last good copy.</p>
      <div className="mt-3">
        {feeds === null ? (
          <ListSkeleton rows={3} label="Loading sources" />
        ) : (
          <List label="Infrastructure sources">
            {feeds.map((f) => (
              <ListRow
                key={f.feed}
                testId="infra-source"
                status={{ tone: f.error ? "waiting" : f.fresh ? "success" : "muted" }}
                title={f.name}
                meta={[f.read_at ? `${f.count.toLocaleString()} items` : "Not read yet", f.error ? <span className="text-amber-300">Last read failed: {f.error}</span> : null]}
                time={f.read_at}
              />
            ))}
            <ListRow
              testId="infra-source"
              status={{ tone: readAt ? "success" : "muted" }}
              title="Your AWS accounts"
              meta={[readAt ? "Read once a day, and again when this page opens after a few minutes; read-only" : "Not read yet"]}
              time={readAt}
            />
          </List>
        )}
      </div>
      {readAt && (
        <p className="mt-2 text-xs text-zinc-400">
          Accounts last read <Time iso={readAt} />.
        </p>
      )}
    </section>
  );
}
