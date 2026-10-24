"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, type RunOutcome, type TestRunExecution } from "@/lib/api";
import { OUTCOME_LABEL, OUTCOME_TONE, githubPrUrl, plural, shortSha, testHref } from "@/lib/tests";
import { formatDuration, timeAgo } from "@/lib/data-sources";
import { RoleGuard } from "@/components/role-guard";
import { StatusPill } from "@/components/status-pill";
import { Callout } from "@/components/callout";
import { Segmented } from "@/components/segmented";
import { focusRing, linkButton } from "@/components/ui";
import { Page, PageHeader } from "@/components/page";
import {
  ArtifactLinks, AttemptSquares, EmptyBox, LoadError, Loading, SectionHeading, StatCard, firstError, totalDuration,
} from "@/components/tests/common";
import { useLoad } from "@/components/tests/use-load";

export default function RunDetailGuarded() {
  return (
    <RoleGuard minRole="member">
      <Suspense fallback={<Page><Loading what="this run" /></Page>}>
        <RunDetail />
      </Suspense>
    </RoleGuard>
  );
}

type Filter = "problems" | "all";

/** Failures first, then passes on retry, then the rest. */
const ORDER: Record<RunOutcome, number> = { failed: 0, flaky: 1, passed: 2, skipped: 3 };

function RunDetail() {
  const key = useSearchParams().get("key") || "";
  const [filter, setFilter] = useState<Filter>("problems");
  const { data, error, loading, reload } = useLoad(() => (key ? api.getTestRun(key) : Promise.resolve(null)), `run:${key}`);

  const executions = useMemo(() => {
    const list = [...(data?.executions ?? [])].sort((a, b) => ORDER[a.outcome] - ORDER[b.outcome] || a.title.localeCompare(b.title));
    return filter === "problems" ? list.filter((e) => e.outcome === "failed" || e.outcome === "flaky") : list;
  }, [data, filter]);

  if (!key) return <Page><EmptyBox>No run was named. Go back to <Link href="/tests?view=runs" className={linkButton}>Runs</Link>.</EmptyBox></Page>;
  if (error) return <Page><LoadError what="this run" message={error} onRetry={reload} /></Page>;
  if (loading && !data) return <Page><Loading what="this run" /></Page>;
  if (!data) return null;
  const { run } = data;

  return (
    <Page>
      <PageHeader
        detail
        title={run.workflow}
        lead={
          <p>
            {run.repo} · <span className="font-mono">{run.branch}</span>
            {run.pr ? (
              <> · <a href={githubPrUrl(run.repo, run.pr)} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-zinc-300">PR #{run.pr}</a></>
            ) : null}
            {" "}· <span className="font-mono">{shortSha(run.sha)}</span>
            {run.run_attempt > 1 && <> · re-run {run.run_attempt}</>}
            {" "}· <time dateTime={run.started_at} title={new Date(run.started_at).toLocaleString()}>{timeAgo(run.started_at)}</time>
          </p>
        }
        actions={
          <>
            <StatusPill tone={run.bad_run ? "warning" : run.status === "passed" ? "success" : "error"}>
              {run.bad_run ? "Bad run" : run.status === "passed" ? "Passed" : "Failed"}
            </StatusPill>
            {run.url && <a href={run.url} target="_blank" rel="noreferrer" className={linkButton}>Open on GitHub</a>}
          </>
        }
      />

      {run.bad_run && (
        <div className="mt-4">
          <Callout variant="warning" title="This run doesn't count against any test" live={false}>
            <p>Most tests failed together, or the job stopped early. That points at the environment, not the tests, so no test was marked flaky because of it.</p>
          </Callout>
        </div>
      )}

      <section aria-label="Results" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Passed" value={run.passed} tone="success" />
        <StatCard label="Failed" value={run.failed} tone={run.failed > 0 ? "error" : undefined} />
        <StatCard label="Passed on retry" value={run.flaky} tone={run.flaky > 0 ? "warning" : undefined} />
        <StatCard label="Duration" value={formatDuration(run.duration_ms)} hint={run.skipped > 0 ? `${plural(run.skipped, "test")} skipped` : run.framework} />
      </section>

      <section aria-labelledby="tests-heading" className="mt-8">
        <SectionHeading
          id="tests-heading"
          aside={
            <Segmented<Filter>
              label="Which tests to show"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "problems", label: "Failed or retried" },
                { value: "all", label: "All tests" },
              ]}
            />
          }
        >
          Tests in this run
        </SectionHeading>
        {executions.length === 0 ? (
          <EmptyBox>{filter === "problems" ? "Every test passed on the first try." : "No tests were recorded for this run."}</EmptyBox>
        ) : (
          <ul aria-label="Tests in this run" className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900/50">
            {executions.map((e) => <ExecutionRow key={`${e.test_id}-${e.project ?? ""}`} e={e} runUrl={run.url} />)}
          </ul>
        )}
      </section>
    </Page>
  );
}

function ExecutionRow({ e, runUrl }: { e: TestRunExecution; runUrl: string }) {
  const err = firstError(e.attempts);
  return (
    <li className="px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <Link href={testHref(e.test_id)} className={`text-sm font-medium text-zinc-100 hover:underline underline-offset-4 rounded ${focusRing}`}>
            {e.project ? `${e.title} (${e.project})` : e.title}
          </Link>
          <p className="mt-0.5 break-all font-mono text-xs text-zinc-500">{e.file}</p>
        </div>
        <p className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <StatusPill tone={OUTCOME_TONE[e.outcome]}>{OUTCOME_LABEL[e.outcome]}</StatusPill>
          <AttemptSquares attempts={e.attempts} />
          <span className="tabular-nums">{totalDuration(e)}</span>
        </p>
      </div>
      {err && <p className="mt-1.5 max-h-48 overflow-y-auto overscroll-contain whitespace-pre-wrap font-mono text-xs leading-relaxed text-red-200 [scrollbar-width:thin]" tabIndex={0}>{err}</p>}
      {(e.outcome === "failed" || e.outcome === "flaky") && (
        <p className="mt-1.5 text-xs"><ArtifactLinks attempts={e.attempts} runUrl={runUrl} /></p>
      )}
    </li>
  );
}
