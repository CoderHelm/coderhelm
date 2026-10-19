"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api, type TestCase, type TestRun, type TestSummary } from "@/lib/api";
import { CAUSE_LABEL, githubPrUrl, minutes, plural, runHref, shortSha, testHref } from "@/lib/tests";
import { errorMessage, formatDuration, timeAgo } from "@/lib/data-sources";
import { StatusPill } from "@/components/status-pill";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { focusRing, linkButton, secondaryButton } from "@/components/ui";
import { EmptyBox, LoadError, Loading, SectionHeading, StatCard } from "./common";
import { QuarantineCiStep } from "./settings";
import { TestList, impactFacts, quarantineFacts, slowFacts } from "./test-list";
import { useLoad } from "./use-load";

// ── Needs attention ───────────────────────────────────────────────

export function NeedsAttention({ repo, summary }: { repo: string; summary: TestSummary | null }) {
  const { data, error, loading, reload } = useLoad(() => api.listTests({ repo, sort: "impact", limit: 100 }), `attention:${repo}`);
  const tests = (data?.tests ?? []).filter((t) => t.state === "flaky" || t.state === "broken" || t.state === "quarantined");

  return (
    <div className="space-y-8">
      {summary && (
        <section aria-label="This week" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="PRs blocked by tests (7 days)" value={summary.prs_blocked_7d} tone={summary.prs_blocked_7d > 0 ? "warning" : undefined} />
          <StatCard label="CI time lost (7 days)" value={minutes(summary.ci_minutes_lost_7d)} />
          <StatCard
            label="Flaky now"
            value={summary.counts.flaky}
            hint={summary.counts.broken > 0 ? `${plural(summary.counts.broken, "broken test")} too` : undefined}
            tone={summary.counts.flaky > 0 ? "warning" : undefined}
          />
          <StatCard label="PRs rescued by quarantine" value={summary.prs_rescued_7d} hint="Would have been blocked by a flaky test" />
        </section>
      )}

      <section aria-labelledby="attention-heading">
        <SectionHeading id="attention-heading">Needs attention</SectionHeading>
        <p className="mb-3 max-w-prose text-sm text-zinc-400">
          Ranked by what each test costs your team right now: pull requests it blocked and CI time lost this week.
        </p>
        {error ? (
          <LoadError what="your tests" message={error} onRetry={reload} />
        ) : loading && !data ? (
          <Loading what="your tests" />
        ) : tests.length === 0 ? (
          <EmptyBox>Nothing needs attention. No test is flaky, broken or quarantined.</EmptyBox>
        ) : (
          <TestList label="Tests that need attention" tests={tests} facts={impactFacts} />
        )}
      </section>
    </div>
  );
}

// ── Runs ──────────────────────────────────────────────────────────

export function RunsView({ repo }: { repo: string }) {
  const [branch, setBranch] = useState("");
  const [older, setOlder] = useState<TestRun[]>([]);
  const [next, setNext] = useState<string | null | undefined>(undefined);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState("");
  const { data, error, loading, reload } = useLoad(async () => {
    const res = await api.listTestRuns({ repo, branch: branch.trim() || undefined, limit: 30 });
    setOlder([]);
    setNext(res.next);
    setMoreError("");
    return res;
  }, `runs:${repo}:${branch}`);

  const runs = [...(data?.runs ?? []), ...older];

  const loadMore = async () => {
    if (!next) return;
    setMoreBusy(true);
    setMoreError("");
    try {
      const res = await api.listTestRuns({ repo, branch: branch.trim() || undefined, before: next, limit: 30 });
      setOlder((prev) => [...prev, ...res.runs]);
      setNext(res.next);
    } catch (e) {
      setMoreError(errorMessage(e, "The request failed."));
    } finally {
      setMoreBusy(false);
    }
  };

  return (
    <section aria-labelledby="runs-heading">
      <SectionHeading id="runs-heading">Runs</SectionHeading>
      <div className="mb-3 max-w-xs">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Branch</span>
          <input
            type="search"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="All branches"
            className={`min-h-9 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 ${focusRing}`}
          />
        </label>
      </div>
      {error ? (
        <LoadError what="runs" message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loading what="runs" />
      ) : runs.length === 0 ? (
        <EmptyBox>No E2E runs yet{branch ? ` on ${branch}` : ""}. They show up here a few minutes after a workflow finishes.</EmptyBox>
      ) : (
        <>
          <ul aria-label="E2E runs" className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900/50">
            {runs.map((r) => <RunRow key={r.run_key} run={r} />)}
          </ul>
          {next && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={loadMore} disabled={moreBusy} className={secondaryButton}>
                {moreBusy ? "Loading…" : "Load older runs"}
              </button>
              {moreError && <span role="alert" className="text-sm text-red-300">{moreError}</span>}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function RunRow({ run }: { run: TestRun }) {
  const tone = run.bad_run ? "warning" : run.status === "passed" ? "success" : "error";
  const word = run.bad_run ? "Bad run" : run.status === "passed" ? "Passed" : "Failed";
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
      <div className="min-w-0 flex-1 basis-64">
        <p className="flex flex-wrap items-center gap-2">
          <StatusPill tone={tone}>{word}</StatusPill>
          <Link href={runHref(run.run_key)} className={`break-words text-sm font-medium text-zinc-100 hover:underline underline-offset-4 rounded ${focusRing}`}>
            {run.workflow}
          </Link>
        </p>
        <p className="mt-1 break-words text-xs text-zinc-500">
          <span className="font-mono text-zinc-400">{run.branch}</span>
          {run.pr ? (
            <>
              <span aria-hidden="true"> · </span>
              <a href={githubPrUrl(run.repo, run.pr)} target="_blank" rel="noreferrer" className="text-zinc-400 underline underline-offset-2 hover:text-zinc-200">
                PR #{run.pr}
              </a>
            </>
          ) : null}
          <span aria-hidden="true"> · </span>
          <span className="font-mono">{shortSha(run.sha)}</span>
          {run.run_attempt > 1 && <span> · re-run {run.run_attempt}</span>}
          <span aria-hidden="true"> · </span>
          <time dateTime={run.started_at} title={new Date(run.started_at).toLocaleString()}>{timeAgo(run.started_at)}</time>
          <span aria-hidden="true"> · </span>
          {formatDuration(run.duration_ms)}
        </p>
        {run.bad_run && (
          <p className="mt-1 text-xs text-amber-200">Most tests failed together, so this run is not counted against any test.</p>
        )}
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums">
        <span className="text-emerald-300">{run.passed} passed</span>
        <span className={run.failed > 0 ? "text-red-300" : "text-zinc-500"}>{run.failed} failed</span>
        <span className={run.flaky > 0 ? "text-amber-300" : "text-zinc-500"}>{run.flaky} passed on retry</span>
        {run.skipped > 0 && <span className="text-zinc-500">{run.skipped} skipped</span>}
      </p>
    </li>
  );
}

// ── Failure groups ────────────────────────────────────────────────

export function FailureGroupsView({ repo }: { repo: string }) {
  const groups = useLoad(() => api.listFailureGroups(repo), `groups:${repo}`);
  // Test names for the links under each group.
  const tests = useLoad(() => api.listTests({ repo, limit: 200 }), `group-tests:${repo}`);
  const names = useMemo(() => new Map((tests.data?.tests ?? []).map((t) => [t.id, t.title])), [tests.data]);

  return (
    <section aria-labelledby="groups-heading">
      <SectionHeading id="groups-heading">Failure groups</SectionHeading>
      <p className="mb-3 max-w-prose text-sm text-zinc-400">
        Failures with the same error, grouped. One cause often breaks many tests, so fixing the top group can clear several at once.
      </p>
      {groups.error ? (
        <LoadError what="failure groups" message={groups.error} onRetry={groups.reload} />
      ) : groups.loading && !groups.data ? (
        <Loading what="failure groups" />
      ) : (groups.data?.groups ?? []).length === 0 ? (
        <EmptyBox>No failures in the last seven days.</EmptyBox>
      ) : (
        <ul aria-label="Failure groups" className="space-y-3">
          {groups.data!.groups.map((g) => (
            <li key={g.signature} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 sm:p-5">
              <p className="break-words font-mono text-sm text-zinc-100">{g.message}</p>
              {(g.selector || g.step) && (
                <p className="mt-1.5 break-words text-xs text-zinc-400">
                  {g.selector && <>Element <code className="text-zinc-300">{g.selector}</code></>}
                  {g.selector && g.step && <span aria-hidden="true"> · </span>}
                  {g.step && <>Step: {g.step}</>}
                </p>
              )}
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                <span className="text-zinc-200">{plural(g.tests, "test")}</span>
                <span>{plural(g.failures_7d, "failure")} this week</span>
                {g.cause && g.cause !== "unknown" && <span>{CAUSE_LABEL[g.cause]}</span>}
                <span>Last seen {timeAgo(g.last_seen)}</span>
              </p>
              {g.test_ids.length > 0 && (
                <ul aria-label="Tests with this failure" className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                  {g.test_ids.map((id) => (
                    <li key={id} className="min-w-0 max-w-full">
                      <Link href={testHref(id)} className={`${linkButton} break-words text-left`}>{names.get(id) ?? "Open test"}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Slowest ───────────────────────────────────────────────────────

export function SlowestView({ repo }: { repo: string }) {
  const { data, error, loading, reload } = useLoad(() => api.listTests({ repo, sort: "slowest", limit: 50 }), `slow:${repo}`);
  return (
    <section aria-labelledby="slow-heading">
      <SectionHeading id="slow-heading">Slowest tests</SectionHeading>
      <p className="mb-3 max-w-prose text-sm text-zinc-400">
        Typical and slow-run durations over the last 30 days. Slow suites get skipped, so these are worth trimming.
      </p>
      {error ? (
        <LoadError what="durations" message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loading what="durations" />
      ) : (data?.tests ?? []).length === 0 ? (
        <EmptyBox>No durations yet.</EmptyBox>
      ) : (
        <TestList label="Slowest tests" tests={data!.tests} facts={slowFacts} />
      )}
    </section>
  );
}

// ── Quarantine ────────────────────────────────────────────────────

export function QuarantineView({ repo, canEdit, ticketDays = 2 }: { repo: string; canEdit: boolean; ticketDays?: number }) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { data, setData, error, loading, reload } = useLoad(
    () => api.listTests({ repo, state: "quarantined", limit: 200 }),
    `quarantine:${repo}`,
  );
  const [busy, setBusy] = useState("");

  const release = async (t: TestCase) => {
    const ok = await confirm({
      title: "Let this test fail builds again?",
      message: "It goes back to blocking pull requests when it fails. Do this once a fix has landed.",
      confirmLabel: "Release",
    });
    if (ok !== "primary") return;
    setBusy(t.id);
    try {
      await api.quarantineTest(t.id, false);
      setData((prev) => (prev ? { ...prev, tests: prev.tests.filter((x) => x.id !== t.id) } : prev));
      toast("Released from quarantine");
    } catch (e) {
      toast(errorMessage(e, "Couldn't release it."), "error");
    } finally {
      setBusy("");
    }
  };

  const tests = data?.tests ?? [];
  const old = tests.filter((t) => t.quarantined_since && Date.now() - new Date(t.quarantined_since).getTime() > ticketDays * 86_400_000);

  return (
    <section aria-labelledby="quarantine-heading">
      <SectionHeading id="quarantine-heading">Quarantine</SectionHeading>
      <p className="mb-3 max-w-prose text-sm text-zinc-400">
        Quarantined tests still run and are still recorded. When only quarantined tests fail, Coderhelm treats the run as passing. When
        tickets are on, the owner gets one after {plural(ticketDays, "day")} without a fix.
      </p>
      <details className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <summary className="cursor-pointer text-sm font-medium text-zinc-100">Make quarantined tests stop failing your build</summary>
        <div className="mt-3">
          <QuarantineCiStep />
        </div>
      </details>
      {error ? (
        <LoadError what="the quarantine list" message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loading what="the quarantine list" />
      ) : tests.length === 0 ? (
        <EmptyBox>No test is quarantined.</EmptyBox>
      ) : (
        <>
          {old.length > 0 && (
            <p className="mb-3 text-sm text-amber-200">{plural(old.length, "test has", "tests have")} been quarantined for over {plural(ticketDays, "day")}.</p>
          )}
          <TestList
            label="Quarantined tests"
            tests={tests}
            facts={quarantineFacts}
            actions={(t) => (
              <>
                {t.ticket_url && <a href={t.ticket_url} target="_blank" rel="noreferrer" className={linkButton}>Ticket</a>}
                {t.fix_pr_url && <a href={t.fix_pr_url} target="_blank" rel="noreferrer" className={linkButton}>Fix PR</a>}
                {canEdit && (
                  <button type="button" onClick={() => release(t)} disabled={busy === t.id} className={`${secondaryButton} !min-h-8 !py-1`}>
                    {busy === t.id ? "Releasing…" : "Release from quarantine"}
                  </button>
                )}
              </>
            )}
          />
        </>
      )}
    </section>
  );
}

