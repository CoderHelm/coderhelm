"use client";

import { Code } from "@/components/settings";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api, type TestCase, type TestRun, type TestSummary } from "@/lib/api";
import { CAUSE_LABEL, githubPrUrl, minutes, plural, runHref, shortSha, testHref } from "@/lib/tests";
import { errorMessage, formatDuration } from "@/lib/data-sources";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { linkButton, secondaryButton, smallSecondaryButton } from "@/components/ui";
import {
  DetailBlock,
  GROUP_LABEL,
  List,
  ListRow,
  ListSection,
  ListToolbar,
  LoadMore,
  usePagedList,
  useListParams,
  type StatusLook,
} from "@/components/list";
import { EmptyBox, LoadError, Loading, StatCard } from "./common";
import { SetupPointer } from "./setup";
import { TestList, impactFacts, quarantineFacts, slowFacts, testMatches } from "./test-list";
import { useLoad } from "./use-load";

/** A search box over a loaded list of tests, kept in the address as `?q=`. */
function useTestSearch() {
  const [params, setParams] = useListParams({ q: "" });
  const q = params.q.trim();
  return {
    q,
    search: {
      value: params.q,
      onChange: (v: string) => setParams({ q: v }, { replace: true }),
      placeholder: "Search by test name, file or owner",
      label: "Search tests",
    },
    clear: () => setParams({ q: "" }),
  };
}

// ── Needs attention ───────────────────────────────────────────────

type AttentionState = "all" | "flaky" | "broken" | "quarantined";

export function NeedsAttention({ repo, summary }: { repo: string; summary: TestSummary | null }) {
  const { data, error, loading, reload } = useLoad(() => api.listTests({ repo, sort: "impact", limit: 100 }), `attention:${repo}`);
  const [params, setParams] = useListParams({ q: "", state: "all" });
  const q = params.q.trim();
  const state: AttentionState = (["flaky", "broken", "quarantined"] as const).includes(params.state as never)
    ? (params.state as AttentionState)
    : "all";
  const needing = (data?.tests ?? []).filter((t) => t.state === "flaky" || t.state === "broken" || t.state === "quarantined");
  const matched = needing.filter((t) => testMatches(t, q));
  const count = (s: TestCase["state"]) => matched.filter((t) => t.state === s).length;
  const tests = state === "all" ? matched : matched.filter((t) => t.state === state);
  const filtered = !!q || state !== "all";
  const clear = () => setParams({ q: "", state: "all" });

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

      <ListSection
        id="attention"
        title="Needs attention"
        description="Ranked by what each test costs your team right now: pull requests it blocked and CI time lost this week."
      >
        {needing.length > 0 && (
          <ListToolbar
            className="mb-3"
            search={{
              value: params.q,
              onChange: (v) => setParams({ q: v }, { replace: true }),
              placeholder: "Search by test name, file or owner",
              label: "Search tests",
            }}
            status={{
              label: "Show tests",
              value: state,
              onChange: (v) => setParams({ state: v }),
              options: [
                { value: "all", label: GROUP_LABEL.all, count: matched.length },
                { value: "flaky", label: "Flaky", count: count("flaky"), tone: "waiting" },
                { value: "broken", label: "Broken", count: count("broken"), tone: "danger" },
                { value: "quarantined", label: "Quarantined", count: count("quarantined"), tone: "muted" },
              ],
            }}
            onClear={filtered ? clear : undefined}
          />
        )}
        {error ? (
          <LoadError what="your tests" message={error} onRetry={reload} />
        ) : loading && !data ? (
          <Loading what="your tests" />
        ) : needing.length === 0 ? (
          <EmptyBox>Nothing needs attention. No test is flaky, broken or quarantined.</EmptyBox>
        ) : tests.length === 0 ? (
          <EmptyBox>No test matches. <button type="button" onClick={clear} className={linkButton}>Clear filters</button></EmptyBox>
        ) : (
          <TestList label="Tests that need attention" tests={tests} facts={impactFacts} />
        )}
      </ListSection>
    </div>
  );
}

// ── Runs ──────────────────────────────────────────────────────────

export function RunsView({ repo }: { repo: string }) {
  // ?branch= keeps the filter in the address.
  const [params, setParams] = useListParams({ branch: "" });
  const branch = params.branch.trim();
  const { items: runs, next, loading, loadingMore, error, moreFailed, loadMore, reload } = usePagedList<TestRun>(
    (cursor) =>
      api
        .listTestRuns({ repo: repo || undefined, branch: branch || undefined, before: cursor, limit: 30 })
        .then((r) => ({ items: r.runs, next: r.next })),
    [repo, branch],
  );

  return (
    <ListSection id="runs" title="Runs">
      <ListToolbar
        className="mb-3"
        search={{ value: params.branch, onChange: (v) => setParams({ branch: v }, { replace: true }), placeholder: "Filter by branch", label: "Branch" }}
        onClear={branch ? () => setParams({ branch: "" }) : undefined}
      />
      {error ? (
        <LoadError what="runs" message="The request failed." onRetry={reload} />
      ) : loading ? (
        <Loading what="runs" />
      ) : runs.length === 0 ? (
        <EmptyBox>No E2E runs yet{branch ? ` on ${branch}` : ""}. They show up here a few minutes after a workflow finishes.</EmptyBox>
      ) : (
        <List label="E2E runs">
          {runs.map((r) => <RunRow key={r.run_key} run={r} />)}
        </List>
      )}
      <LoadMore hasMore={!!next && !loading} loading={loadingMore} failed={moreFailed} onClick={loadMore} />
    </ListSection>
  );
}

function RunRow({ run }: { run: TestRun }) {
  const look: StatusLook = run.bad_run
    ? { label: "Bad run", tone: "waiting" }
    : run.status === "passed"
      ? { label: "Passed", tone: "success" }
      : { label: "Failed", tone: "danger" };
  return (
    <ListRow
      testId="test-run-row"
      data={{ status: run.bad_run ? "bad_run" : run.status }}
      status={look}
      title={run.workflow}
      href={runHref(run.run_key)}
      meta={[
        look.label,
        <Code key="branch">{run.branch}</Code>,
        run.pr ? (
          <a key="pr" href={githubPrUrl(run.repo, run.pr)} target="_blank" rel="noreferrer" className="text-zinc-400 underline underline-offset-2 hover:text-zinc-200">
            PR #{run.pr}
          </a>
        ) : null,
        <span key="sha" title={run.sha}>{shortSha(run.sha)}</span>,
        run.run_attempt > 1 ? `re-run ${run.run_attempt}` : null,
        formatDuration(run.duration_ms),
      ]}
      summary={run.bad_run ? "Most tests failed together, so this run is not counted against any test." : undefined}
      summaryTone="waiting"
      chips={
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums">
          <span className="text-emerald-300">{run.passed} passed</span>
          {/* Zero counts say nothing; only what happened is shown. */}
          {run.failed > 0 && <span className="text-red-300">{run.failed} failed</span>}
          {run.flaky > 0 && <span className="text-amber-300">{run.flaky} passed on retry</span>}
          {run.skipped > 0 && <span className="text-zinc-500">{run.skipped} skipped</span>}
        </span>
      }
      time={run.started_at}
    />
  );
}

// ── Failure groups ────────────────────────────────────────────────

export function FailureGroupsView({ repo }: { repo: string }) {
  const groups = useLoad(() => api.listFailureGroups(repo), `groups:${repo}`);
  // Test names for the links under each group.
  const tests = useLoad(() => api.listTests({ repo, limit: 200 }), `group-tests:${repo}`);
  const names = useMemo(() => new Map((tests.data?.tests ?? []).map((t) => [t.id, t.title])), [tests.data]);
  const { q, search, clear } = useTestSearch();
  const all = groups.data?.groups ?? [];
  const shown = all.filter((g) => {
    if (!q) return true;
    const hay = [g.message, g.selector ?? "", g.step ?? "", ...g.test_ids.map((id) => names.get(id) ?? "")].join(" ").toLowerCase();
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  });

  return (
    <ListSection
      id="groups"
      title="Failure groups"
      count={all.length || undefined}
      description="Failures with the same error, grouped. One cause often breaks many tests, so fixing the top group can clear several at once."
    >
      {all.length > 0 && (
        <ListToolbar
          className="mb-3"
          search={{ ...search, placeholder: "Search by error, element, step or test", label: "Search failure groups" }}
          onClear={q ? clear : undefined}
        />
      )}
      {groups.error ? (
        <LoadError what="failure groups" message={groups.error} onRetry={groups.reload} />
      ) : groups.loading && !groups.data ? (
        <Loading what="failure groups" />
      ) : all.length === 0 ? (
        <EmptyBox>No failures in the last seven days.</EmptyBox>
      ) : shown.length === 0 ? (
        <EmptyBox>No failure group matches. <button type="button" onClick={clear} className={linkButton}>Clear filters</button></EmptyBox>
      ) : (
        <List label="Failure groups">
          {shown.map((g) => (
            <ListRow
              key={g.signature}
              testId="failure-group"
              status={{ tone: "danger" }}
              title={<span className="font-mono">{g.message}</span>}
              titleText={g.message}
              meta={[
                g.selector ? <span key="sel">Element <code className="text-zinc-300">{g.selector}</code></span> : null,
                g.step ? `Step: ${g.step}` : null,
                <span key="tests" className="text-zinc-200">{plural(g.tests, "test")}</span>,
                `${plural(g.failures_7d, "failure")} this week`,
                g.cause && g.cause !== "unknown" ? CAUSE_LABEL[g.cause] : null,
              ]}
              time={g.last_seen}
              details={<DetailBlock title="Error"><p className="whitespace-pre-wrap font-mono">{g.message}</p></DetailBlock>}
              detailsLabel="Full error"
              detailsFor={`the full error of this failure group`}
            >
              {g.test_ids.length > 0 && (
                <ul aria-label="Tests with this failure" className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {g.test_ids.map((id) => (
                    <li key={id} className="min-w-0 max-w-full">
                      <Link href={testHref(id)} className={`${linkButton} !text-xs text-left`}>{names.get(id) ?? "Open test"}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </ListRow>
          ))}
        </List>
      )}
    </ListSection>
  );
}

// ── Slowest ───────────────────────────────────────────────────────

export function SlowestView({ repo }: { repo: string }) {
  const { data, error, loading, reload } = useLoad(() => api.listTests({ repo, sort: "slowest", limit: 50 }), `slow:${repo}`);
  const { q, search, clear } = useTestSearch();
  const all = data?.tests ?? [];
  const shown = all.filter((t) => testMatches(t, q));
  return (
    <ListSection
      id="slow"
      title="Slowest tests"
      description="Typical and slow-run durations over the last 30 days. Slow suites get skipped, so these are worth trimming."
    >
      {all.length > 0 && <ListToolbar className="mb-3" search={search} onClear={q ? clear : undefined} />}
      {error ? (
        <LoadError what="durations" message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loading what="durations" />
      ) : all.length === 0 ? (
        <EmptyBox>No durations yet.</EmptyBox>
      ) : shown.length === 0 ? (
        <EmptyBox>No test matches. <button type="button" onClick={clear} className={linkButton}>Clear filters</button></EmptyBox>
      ) : (
        <TestList label="Slowest tests" tests={shown} facts={slowFacts} />
      )}
    </ListSection>
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

  const { q, search, clear } = useTestSearch();
  const tests = data?.tests ?? [];
  const shown = tests.filter((t) => testMatches(t, q));
  const old = tests.filter((t) => t.quarantined_since && Date.now() - new Date(t.quarantined_since).getTime() > ticketDays * 86_400_000);

  return (
    <ListSection
      id="quarantine"
      title="Quarantine"
      count={tests.length || undefined}
      description={
        <>
          Quarantined tests still run and are still recorded. When only quarantined tests fail, Coderhelm treats the run as passing. When
          tickets are on, the owner gets one after {plural(ticketDays, "day")} without a fix.
        </>
      }
    >
      <div className="mb-4 mt-3">
        <SetupPointer>GitHub still fails the build on a quarantined test until the workflow skips it. Setup adds that step for you.</SetupPointer>
      </div>
      {error ? (
        <LoadError what="the quarantine list" message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loading what="the quarantine list" />
      ) : tests.length === 0 ? (
        <EmptyBox>No test is quarantined.</EmptyBox>
      ) : (
        <>
          {tests.length > 3 && <ListToolbar className="mb-3" search={search} onClear={q ? clear : undefined} />}
          {old.length > 0 && (
            <p className="mb-3 text-sm text-amber-200">{plural(old.length, "test has", "tests have")} been quarantined for over {plural(ticketDays, "day")}.</p>
          )}
          {shown.length === 0 && (
            <EmptyBox>No test matches. <button type="button" onClick={clear} className={linkButton}>Clear filters</button></EmptyBox>
          )}
          {shown.length > 0 && <TestList
            label="Quarantined tests"
            tests={shown}
            facts={quarantineFacts}
            actions={(t) => (
              <>
                {t.ticket_url && <a href={t.ticket_url} target="_blank" rel="noreferrer" className={linkButton}>Ticket</a>}
                {t.fix_pr_url && <a href={t.fix_pr_url} target="_blank" rel="noreferrer" className={linkButton}>Fix PR</a>}
                {canEdit && (
                  <button type="button" onClick={() => release(t)} disabled={busy === t.id} className={`${smallSecondaryButton}`}>
                    {busy === t.id ? "Releasing…" : "Release from quarantine"}
                  </button>
                )}
              </>
            )}
          />}
        </>
      )}
    </ListSection>
  );
}

