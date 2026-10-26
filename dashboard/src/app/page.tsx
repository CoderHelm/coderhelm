"use client";

import { useCan } from "@/hooks/use-can";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, type CloseResult, type CloseRunRequest, type Run } from "@/lib/api";
import { RUN_GROUP_STATUSES, runCanClose, runStatusLook } from "@/components/run-status";
import { runHref } from "@/lib/plugins";
import { CloseRunDialog } from "@/components/close-run-dialog";
import { useToast } from "@/components/toast";
import { focusRing, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { Page, PageHeader } from "@/components/page";
import { EmptyState } from "@/components/empty-state";
import { Code } from "@/components/settings/code";
import { PlayIcon } from "@/components/icons";
import {
  GROUP_LABEL,
  List,
  ListEmpty,
  ListError,
  ListRow,
  ListSkeleton,
  ListToolbar,
  LoadMore,
  type RowSelect,
  StatusDot,
  StatusText,
  Time,
  formatDuration,
  useListParams,
  usePagedList,
  useTeamRepos,
} from "@/components/list";

// The status toggles. Each sends its group's statuses to the server; "Done"
// covers older runs that finished as "success". Closed runs show under Closed
// and All, never under Active. Archived and started-again runs show under All
// only.
type StatusTab = "all" | keyof typeof RUN_GROUP_STATUSES;
const TABS: StatusTab[] = ["all", "active", "waiting", "done", "failed", "closed"];
const TAB_TONE = { active: "live", waiting: "waiting", done: "success", failed: "danger", closed: "muted" } as const;


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
    // Each plugin run is its own row (they share a ticket id per plugin).
    const key = run.ticket_source === "plugin" ? run.run_id : run.ticket_id || run.run_id;
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
    <Suspense fallback={<Page><PageHeader title="Runs" lead="Everything Coderhelm is working on or has finished, across your projects." /><div className="mt-6"><ListSkeleton /></div></Page>}>
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

  // Selecting runs to close: members and up (the gateway refuses viewers).
  const { toast } = useToast();
  const { can } = useCan();
  const canClose = can("runs");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastClicked = useRef<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [problems, setProblems] = useState<{ result: CloseResult; title: string }[]>([]);
  // Each row's newest attempt is what closes.
  const rowRuns = groups.map((g) => g.attempts[0]);
  const closableIds = rowRuns.filter((r) => runCanClose(r.status)).map((r) => r.run_id);
  // A new filter or page of runs keeps only the picks still on screen.
  const shownKey = rowRuns.map((r) => `${r.run_id}:${r.status}`).join(",");
  useEffect(() => {
    setSelected((prev) => {
      const keep = new Set([...prev].filter((id) => closableIds.includes(id)));
      return keep.size === prev.size ? prev : keep;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);

  const pick = (index: number, checked: boolean, range: boolean) => {
    // Read the anchor now: the state update runs after it moves to this row.
    const anchor = range ? lastClicked.current : null;
    const from = anchor != null ? Math.min(anchor, index) : index;
    const to = anchor != null ? Math.max(anchor, index) : index;
    setSelected((prev) => {
      const next = new Set(prev);
      for (let i = from; i <= to; i++) {
        const r = rowRuns[i];
        if (!r || !runCanClose(r.status)) continue;
        if (checked) next.add(r.run_id);
        else next.delete(r.run_id);
      }
      return next;
    });
    lastClicked.current = index;
  };
  const allPicked = closableIds.length > 0 && closableIds.every((id) => selected.has(id));
  const somePicked = closableIds.some((id) => selected.has(id));
  const pickAll = (checked: boolean) => setSelected(checked ? new Set(closableIds) : new Set());
  const clearPicks = () => {
    setSelected(new Set());
    lastClicked.current = null;
  };
  const pickedRuns = rowRuns.filter((r) => selected.has(r.run_id));
  const pickedPrs = pickedRuns.filter((r) => r.pr_number && r.status !== "merged").map((r) => r.pr_number!);

  const closePicked = async (req: CloseRunRequest) => {
    const ids = pickedRuns.map((r) => r.run_id);
    setClosing(true);
    try {
      const answer = await api.closeRuns(ids, req);
      const titleOf = (id: string) => runTitle(rowRuns.find((r) => r.run_id === id) ?? ({ run_id: id } as Run));
      const failed = answer.results.filter((r) => r.outcome !== "closed" && r.outcome !== "already_closed");
      setProblems(failed.map((result) => ({ result, title: titleOf(result.run_id) })));
      // The ones that closed leave the selection; the ones that didn't stay picked.
      setSelected(new Set(failed.map((r) => r.run_id).filter((id) => closableIds.includes(id))));
      setDialogOpen(false);
      const done = answer.closed + answer.already_closed;
      toast(
        failed.length ? `${done} closed, ${failed.length} not closed` : `${done} run${done === 1 ? "" : "s"} closed`,
        failed.length ? "error" : "success",
      );
      reload();
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : "The runs could not be closed. Try again.", "error");
    } finally {
      setClosing(false);
    }
  };

  return (
    <Page>
      <PageHeader
        title="Runs"
        lead="Everything Coderhelm is working on or has finished, across your projects."
        actions={
          <Link href="/plans/new" className={primaryButton} data-testid="start-task">
            Start a task
          </Link>
        }
      />
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
        <EmptyState
          icon={<PlayIcon />}
          title="Nothing here yet"
          testId="list-empty"
          action={
            <Link href="/plans/new" className={primaryButton}>
              Write a plan
            </Link>
          }
        >
          <p>Ask Coderhelm to do something. Work arrives here three ways:</p>
          <ul className="mx-auto mt-3 max-w-md space-y-1.5 text-left" data-testid="ways-in">
            <li>
              <span className="font-medium text-zinc-200">Write a plan</span> and Coderhelm works through it step by step.
            </li>
            <li>
              <span className="font-medium text-zinc-200">Tag a GitHub issue</span> with the <Code>coderhelm</Code> label.
            </li>
            <li>
              <span className="font-medium text-zinc-200">Send a Jira ticket</span> with the same label.
            </li>
          </ul>
        </EmptyState>
      ) : (
        <>
          {problems.length > 0 && (
            <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3" data-testid="close-problems">
              <p className="text-sm font-semibold text-zinc-100">
                {problems.length === 1 ? "1 run was not closed" : `${problems.length} runs were not closed`}
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {problems.map(({ result, title }) => (
                  <li key={result.run_id} className="min-w-0 [overflow-wrap:anywhere]">
                    <Link href={`/runs/detail?id=${encodeURIComponent(result.run_id)}`} className={`text-zinc-200 underline underline-offset-4 rounded ${focusRing}`}>
                      {title}
                    </Link>
                    <span className="text-zinc-400"> · {result.message}</span>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setProblems([])} className={`${linkButton} mt-2`}>
                Dismiss
              </button>
            </div>
          )}
          {/* Bulk tools stay out of the way until a row is picked. */}
          {canClose && closableIds.length > 0 && somePicked && (
            <label className="mb-2 inline-flex cursor-pointer items-center gap-2 px-4 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={allPicked}
                ref={(el) => {
                  if (el) el.indeterminate = somePicked && !allPicked;
                }}
                onChange={(e) => pickAll(e.target.checked)}
                aria-label={`Select all ${closableIds.length} that can be closed on this page`}
                className={`h-4 w-4 cursor-pointer accent-zinc-100 ${focusRing}`}
              />
              Select all {closableIds.length}
            </label>
          )}
          <List label="Runs">
            {groups.map((group, i) => (
              <RunItem
                key={group.ticket_id}
                group={group}
                showRepo={!repo}
                // Rows that are over have nothing to close: no checkbox, just room for one so the dots line up.
                spacer={canClose && !runCanClose(group.attempts[0].status)}
                select={
                  canClose && runCanClose(group.attempts[0].status)
                    ? {
                        checked: selected.has(group.attempts[0].run_id),
                        onChange: (checked, range) => pick(i, checked, range),
                        label: `Select ${runTitle(group.attempts[0])}`,
                      }
                    : undefined
                }
              />
            ))}
          </List>
        </>
      )}
      <LoadMore hasMore={!!next} loading={loadingMore} onClick={loadMore} failed={moreFailed} />
      {/* The bar for the picked runs: stays in view while scrolling, read out as it changes. */}
      {canClose && selected.size > 0 && (
        <div
          role="region"
          aria-label="Selected runs"
          data-testid="bulk-bar"
          className="sticky bottom-4 z-30 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900/95 px-4 py-3 shadow-2xl backdrop-blur"
        >
          <p role="status" aria-live="polite" className="text-sm font-medium text-zinc-100">
            {selected.size} selected
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={clearPicks} className={secondaryButton}>
              Clear
            </button>
            <button type="button" onClick={() => setDialogOpen(true)} className={primaryButton}>
              Close
            </button>
          </div>
        </div>
      )}
      <CloseRunDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        count={pickedRuns.length}
        prNumbers={pickedPrs}
        busy={closing}
        onConfirm={closePicked}
      />
    </Page>
  );
}

/** Where a run opens: a plugin run has its own page. */
function runPage(run: Run): string {
  return run.ticket_source === "plugin" ? runHref(run.run_id) : `/runs/detail?id=${encodeURIComponent(run.run_id)}`;
}

/** "your-team/web#1234" on a row that already names "your-team/web": just "Issue #1234". */
function ticketWords(run: Run, showRepo: boolean): string | null {
  const id = run.ticket_id;
  if (!id) return null;
  if (run.repo && id.startsWith(`${run.repo}#`)) return `Issue #${id.slice(run.repo.length + 1)}`;
  if (!showRepo && id.includes("#")) return `Issue #${id.split("#").pop()}`;
  return id;
}

function RunItem({ group, showRepo, select, spacer }: { group: RunGroup; showRepo: boolean; select?: RowSelect; spacer?: boolean }) {
  const [latest, ...earlier] = group.attempts;
  const look = runStatusLook(latest.status);
  const title = runTitle(latest);
  const ticket = ticketWords(latest, showRepo);
  const isPlugin = latest.ticket_source === "plugin";
  return (
    <ListRow
      select={select}
      leading={
        spacer ? (
          <span className="flex items-start gap-3">
            <span aria-hidden="true" className="h-4 w-4 shrink-0" />
            <StatusDot tone={look.tone} live={look.live} className="mt-[5px]" />
          </span>
        ) : undefined
      }
      testId="run-row"
      data={{ status: latest.status }}
      status={look}
      title={title}
      titleText={title}
      href={runPage(latest)}
      meta={[
        isPlugin ? `Plugin ${latest.ticket_id?.replace(/^plugin:/, "") ?? ""}` : ticket && ticket !== title ? ticket : null,
        showRepo ? latest.repo : null,
        latest.duration_s ? `took ${formatDuration(latest.duration_s)}` : null,
      ]}
      chips={
        <>
          <StatusText look={look} />
          {earlier.length > 0 && <span className="text-xs text-zinc-400">Tried {group.attempts.length} times</span>}
        </>
      }
      time={latest.created_at}
      details={
        earlier.length > 0 ? (
          <ol className="flex flex-col divide-y divide-zinc-800/60">
            {earlier.map((run, i) => (
              <li key={run.run_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                <span className="w-6 shrink-0 tabular-nums text-zinc-400">#{earlier.length - i}</span>
                <Link
                  href={`/runs/detail?id=${encodeURIComponent(run.run_id)}`}
                  className={`min-w-0 rounded text-zinc-300 hover:text-zinc-100 hover:underline ${focusRing}`}
                >
                  {runTitle(run)}
                </Link>
                <StatusText look={runStatusLook(run.status)} />
                <Time iso={run.created_at} className="text-zinc-400" />
                {run.duration_s ? <span className="text-zinc-400">took {formatDuration(run.duration_s)}</span> : null}
              </li>
            ))}
          </ol>
        ) : undefined
      }
      detailsLabel="Earlier tries"
      detailsFor={`${earlier.length} earlier ${earlier.length === 1 ? "try" : "tries"} of ${title}`}
    />
  );
}
