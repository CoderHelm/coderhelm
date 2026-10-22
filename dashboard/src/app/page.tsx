"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { api, type Run } from "@/lib/api";
import { RUN_GROUP_STATUSES, runStatusLook } from "@/components/run-status";
import { focusRing } from "@/components/ui";
import { Page, PageHeader } from "@/components/page";
import {
  GROUP_LABEL,
  List,
  ListEmpty,
  ListError,
  ListRow,
  ListSkeleton,
  ListToolbar,
  LoadMore,
  StatusText,
  Time,
  formatDuration,
  useListParams,
  usePagedList,
  useTeamRepos,
} from "@/components/list";

// The status toggles. Each sends its group's statuses to the server; "Done"
// covers older runs that finished as "success". Archived and started-again
// runs show under All only.
type StatusTab = "all" | keyof typeof RUN_GROUP_STATUSES;
const TABS: StatusTab[] = ["all", "active", "waiting", "done", "failed"];
const TAB_TONE = { active: "live", waiting: "waiting", done: "success", failed: "danger" } as const;

interface RunGroup {
  ticket_id: string;
  attempts: Run[]; // newest first
}

function runTitle(run: Run): string {
  return run.title || run.ticket_id || "Untitled run";
}

/** One row per ticket: its newest attempt, with older ones inside. */
function groupRunsByTicket(runs: Run[]): RunGroup[] {
  const map = new Map<string, Run[]>();
  for (const run of runs) {
    const key = run.ticket_id || run.run_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(run);
  }
  const groups: RunGroup[] = [];
  for (const [ticket_id, attempts] of map) {
    attempts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    groups.push({ ticket_id, attempts });
  }
  groups.sort((a, b) => new Date(b.attempts[0].created_at).getTime() - new Date(a.attempts[0].created_at).getTime());
  return groups;
}

export default function RunsPageWithParams() {
  return (
    <Suspense fallback={<Page><PageHeader title="Runs" lead="All agent runs across your repositories." /><div className="mt-6"><ListSkeleton /></div></Page>}>
      <RunsPage />
    </Suspense>
  );
}

function RunsPage() {
  // The address holds the search, so a search can be shared or reloaded.
  const [params, setParams] = useListParams({ q: "", status: "all", repo: "" });
  const { q, repo } = params;
  // Older links carry exact statuses (`?status=failed`); those still filter.
  const tab: StatusTab = (TABS as string[]).includes(params.status) ? (params.status as StatusTab) : "all";
  const status = tab === "all" ? (params.status === "all" ? "" : params.status) : RUN_GROUP_STATUSES[tab];
  const teamRepos = useTeamRepos();
  const filtered = !!(q || status || repo);
  const clear = () => setParams({ q: "", status: "all", repo: "" });

  const { items: runs, next, loading, loadingMore, error, moreFailed, loadMore, reload } = usePagedList<Run>(
    (cursor) => api.listRuns(cursor, { q, status, repo }).then((d) => ({ items: d.runs, next: d.next })),
    [q, status, repo],
  );

  const groups = groupRunsByTicket(runs);

  return (
    <Page>
      <PageHeader title="Runs" lead="All agent runs across your repositories." />
      <ListToolbar
        className="mt-6 mb-4"
        search={{
          value: q,
          onChange: (v) => setParams({ q: v }, { replace: true }),
          placeholder: "Search by ticket, title, repo or PR number",
          label: "Search runs",
        }}
        status={{
          label: "Show runs",
          value: tab === "all" && status ? "" : tab,
          onChange: (v) => setParams({ status: v }),
          options: TABS.map((t) => ({ value: t, label: GROUP_LABEL[t], tone: t === "all" ? undefined : TAB_TONE[t] })),
        }}
        repo={{ value: repo, onChange: (v) => setParams({ repo: v }), repos: teamRepos }}
        onClear={filtered ? clear : undefined}
      />
      {loading ? (
        <ListSkeleton label="Loading runs" />
      ) : error ? (
        <ListError title="Runs could not be loaded" onRetry={reload}>
          The server did not answer. Try again in a moment.
        </ListError>
      ) : runs.length === 0 && filtered ? (
        <ListEmpty title="No runs match" onClear={clear}>
          {/* Each request reads a bounded number of runs; older ones may still match. */}
          {next ? "None of the most recent runs match. Load more to search older runs." : "Try a ticket number, part of a title, or a repo."}
        </ListEmpty>
      ) : runs.length === 0 ? (
        <ListEmpty title="No runs yet">
          Assign a GitHub issue to the Coderhelm bot, add the <code className="text-zinc-300">coderhelm</code> label to it, or send a
          Jira ticket to start a run. Or{" "}
          <Link href="/plans/new" className={`text-zinc-300 underline underline-offset-4 hover:text-zinc-100 rounded ${focusRing}`}>
            write a plan
          </Link>{" "}
          and let Coderhelm do the tasks.
        </ListEmpty>
      ) : (
        <List label="Runs">
          {groups.map((group) => (
            <RunItem key={group.ticket_id} group={group} showRepo={!repo} />
          ))}
        </List>
      )}
      <LoadMore hasMore={!!next} loading={loadingMore} onClick={loadMore} failed={moreFailed} />
    </Page>
  );
}

function RunItem({ group, showRepo }: { group: RunGroup; showRepo: boolean }) {
  const [latest, ...earlier] = group.attempts;
  const look = runStatusLook(latest.status);
  const title = runTitle(latest);
  return (
    <ListRow
      testId="run-row"
      data={{ status: latest.status }}
      status={look}
      title={title}
      titleText={title}
      href={`/runs/detail?id=${encodeURIComponent(latest.run_id)}`}
      meta={[
        latest.ticket_id && latest.ticket_id !== title ? latest.ticket_id : null,
        showRepo ? latest.repo : null,
        latest.duration_s ? `took ${formatDuration(latest.duration_s)}` : null,
      ]}
      chips={
        <>
          <StatusText look={look} />
          {earlier.length > 0 && <span className="text-xs text-zinc-500">{group.attempts.length} attempts</span>}
        </>
      }
      time={latest.created_at}
      details={
        earlier.length > 0 ? (
          <ol className="flex flex-col divide-y divide-zinc-800/60">
            {earlier.map((run, i) => (
              <li key={run.run_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                <span className="w-6 shrink-0 tabular-nums text-zinc-600">#{earlier.length - i}</span>
                <Link
                  href={`/runs/detail?id=${encodeURIComponent(run.run_id)}`}
                  className={`min-w-0 rounded text-zinc-300 hover:text-zinc-100 hover:underline ${focusRing}`}
                >
                  {runTitle(run)}
                </Link>
                <StatusText look={runStatusLook(run.status)} />
                <Time iso={run.created_at} className="text-zinc-500" />
                {run.duration_s ? <span className="text-zinc-600">took {formatDuration(run.duration_s)}</span> : null}
              </li>
            ))}
          </ol>
        ) : undefined
      }
      detailsLabel="Earlier attempts"
      detailsFor={`${earlier.length} earlier attempt${earlier.length === 1 ? "" : "s"} of ${title}`}
    />
  );
}
