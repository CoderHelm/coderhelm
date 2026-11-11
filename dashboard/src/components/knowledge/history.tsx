"use client";

import { Fragment, useEffect, useState } from "react";
import { StatusDot, type Tone } from "@/components/list/status";
import { buttonClass, focusRing } from "@/components/ui";
import { errorMessage } from "@/lib/data-sources";
import { KIND_LABEL } from "@/lib/knowledge";
import {
  RESULT_WORDS,
  TRIGGER_WORDS,
  clockWords,
  dayWords,
  historyRows,
  kbHistory,
  missingRoute,
  tookWords,
  type PageSource,
  type SyncRun,
} from "@/lib/knowledge-page";

// Sync history: one row per sync of each source (newest first) with what
// started it, how long it took, how it went and what it added, changed,
// removed, couldn't read or left out. Syncs that changed nothing fold into
// one line; a row with problems opens to each item, its error and its fix.
// A table on wide screens, stacked rows on a phone.

const RESULT_TONE: Record<SyncRun["result"], Tone> = { done: "success", problems: "attention", stopped: "danger" };

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date().toDateString() === d.toDateString();
  return today ? `Today ${clockWords(iso)}` : `${dayWords(iso).replace(/, \d{4}$/, "")} ${clockWords(iso)}`;
}

function Counts({ r }: { r: SyncRun }) {
  const parts: [string, number][] = [
    ["added", r.added],
    ["updated", r.updated],
    ["removed", r.removed],
    ["couldn't read", r.failed],
    ["skipped", r.skipped],
  ];
  const shown = parts.filter(([, n]) => n > 0);
  if (!shown.length) return <span className="text-zinc-400">No changes</span>;
  return <span>{shown.map(([w, n]) => `${n.toLocaleString()} ${w}`).join(" · ")}</span>;
}

export function History({ kbId, sources, version }: { kbId: string; sources: PageSource[]; version: number }) {
  const [source, setSource] = useState("");
  const [runs, setRuns] = useState<SyncRun[] | null>(null);
  const [kept, setKept] = useState(90);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [limit, setLimit] = useState(30);

  useEffect(() => {
    let live = true;
    kbHistory
      .runs(kbId, source, limit)
      .then((r) => {
        if (!live) return;
        setRuns(r.runs);
        setKept(r.kept_days);
        setError(null);
      })
      .catch((e) => {
        if (!live) return;
        if (missingRoute(e)) setMissing(true);
        else setError(errorMessage(e, "Couldn't read the sync history."));
      });
    return () => {
      live = false;
    };
  }, [kbId, source, limit, version]);

  const byId = new Map(sources.map((s) => [s.id, s]));
  const name = (id: string) => byId.get(id)?.name ?? "A removed source";
  if (missing) {
    return <p className="text-sm text-zinc-400">The sync history starts with the next sync.</p>;
  }
  const rows = historyRows(runs ?? []);
  const chip = (on: boolean) =>
    `inline-flex min-w-0 max-w-full items-center rounded-full border px-3 py-1 text-xs ${focusRing} ${on ? "border-zinc-500 bg-zinc-800 text-zinc-100" : "border-zinc-800 text-zinc-400 hover:text-zinc-200"}`;
  return (
    <div className="min-w-0" data-testid="history">
      {sources.length > 1 && (
        <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="Source">
          <button type="button" aria-pressed={!source} className={chip(!source)} onClick={() => setSource("")}>
            All sources
          </button>
          {sources.map((s) => (
            <button key={s.id} type="button" aria-pressed={source === s.id} className={`${chip(source === s.id)} sm:max-w-[16rem]`} onClick={() => setSource(s.id)}>
              <span className="truncate">{s.name}</span>
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="text-sm text-orange-300" role="alert">
          {error}
        </p>
      )}
      {runs === null && !error ? (
        <div className="h-24 animate-pulse rounded-xl bg-zinc-900/60 motion-reduce:animate-none" role="status" aria-label="Loading" />
      ) : runs && runs.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-5 py-6 text-sm text-zinc-400" data-testid="history-empty">
          No syncs yet. Each sync is listed here for {kept} days.
        </p>
      ) : (
        <div className="min-w-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/30">
          <table className="w-full text-sm" data-testid="history-table">
            <thead className="hidden whitespace-nowrap border-b border-zinc-800 text-left text-xs text-zinc-400 sm:table-header-group">
              <tr>
                <th className="px-4 py-2 font-medium">Started</th>
                {sources.length > 1 && !source && <th className="px-2 py-2 font-medium">Source</th>}
                <th className="px-2 py-2 font-medium">Trigger</th>
                <th className="px-2 py-2 font-medium">Took</th>
                <th className="px-2 py-2 font-medium">Result</th>
                <th className="px-2 py-2 font-medium">Changes</th>
                <th className="hidden w-32 px-4 py-2 text-right font-medium xl:table-cell">Passages</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {rows.map((row, i) => {
                if (row.kind === "quiet") {
                  const last = row.runs[0];
                  return (
                    <tr key={`q${i}`} data-testid="history-quiet" className="block sm:table-row">
                      <td colSpan={7} className="block px-4 py-2.5 text-xs text-zinc-400 sm:table-cell">
                        {row.runs.length} checks, nothing changed, last {when(last.started_at)}
                      </td>
                    </tr>
                  );
                }
                const r = row.run;
                const key = `${r.source_id}${r.started_at}`;
                const hasMore = r.problems.length > 0 || !!r.error;
                const isOpen = !!open[key];
                return (
                  <Fragment key={key}>
                    <tr className="block px-4 py-3 sm:table-row sm:p-0" data-testid="history-row" data-result={r.result}>
                      <td className="block text-xs text-zinc-400 sm:table-cell sm:whitespace-nowrap sm:px-4 sm:py-2.5 sm:text-sm sm:text-zinc-300">
                        {when(r.started_at)}
                        <span className="sm:hidden">
                          {" · "}
                          {TRIGGER_WORDS[r.trigger] ?? r.trigger} · {tookWords(r.took_secs)}
                          {sources.length > 1 && !source ? ` · ${name(r.source_id)}` : ""}
                        </span>
                      </td>
                      {sources.length > 1 && !source && (
                        <td className="hidden max-w-[10rem] truncate px-2 py-2.5 text-zinc-300 sm:table-cell" title={name(r.source_id)}>
                          {name(r.source_id)}
                        </td>
                      )}
                      <td className="hidden whitespace-nowrap px-2 py-2.5 text-zinc-300 sm:table-cell">{TRIGGER_WORDS[r.trigger] ?? r.trigger}</td>
                      <td className="hidden px-2 py-2.5 tabular-nums text-zinc-300 sm:table-cell">{tookWords(r.took_secs)}</td>
                      <td className="mt-1 block sm:mt-0 sm:table-cell sm:whitespace-nowrap sm:px-2 sm:py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-zinc-200">
                          <StatusDot tone={RESULT_TONE[r.result]} />
                          {RESULT_WORDS[r.result]}
                        </span>
                      </td>
                      <td className="mt-0.5 block min-w-0 text-zinc-300 sm:mt-0 sm:table-cell sm:px-2 sm:py-2.5">
                        <Counts r={r} />
                        {hasMore && (
                          <button
                            type="button"
                            className={`ml-2 rounded text-xs text-zinc-400 underline underline-offset-4 hover:text-zinc-100 ${focusRing}`}
                            aria-expanded={isOpen}
                            onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))}
                            data-testid="history-open"
                          >
                            {isOpen ? "Hide" : r.error ? "Why" : `${r.problems.length} ${r.problems.length === 1 ? "item" : "items"}`}
                          </button>
                        )}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-zinc-400 xl:table-cell">
                        {r.embedded || r.reused ? `${r.embedded.toLocaleString()} new · ${r.reused.toLocaleString()} kept` : "None"}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="block sm:table-row" data-testid="history-detail">
                        <td colSpan={7} className="block bg-zinc-950/40 px-4 py-3 sm:table-cell">
                          {r.error && (
                            <p className="text-sm text-orange-200">
                              {r.error.message} <span className="text-zinc-300">{r.error.fix}</span>
                            </p>
                          )}
                          {r.problems.length > 0 && (
                            <ul className="space-y-2">
                              {r.problems.map((p, j) => (
                                <li key={j} className="min-w-0 text-sm" data-testid="history-problem">
                                  <span className="font-medium text-zinc-200">
                                    {p.url ? (
                                      <a href={p.url} target="_blank" rel="noopener noreferrer" className={`rounded hover:underline ${focusRing}`}>
                                        {p.name}
                                        <span className="sr-only"> (opens the original)</span>
                                      </a>
                                    ) : (
                                      p.name
                                    )}
                                  </span>
                                  <span className="text-zinc-400"> · {p.kind === "skipped" ? "Skipped" : "Couldn't read"}: </span>
                                  <span className="text-zinc-300 [overflow-wrap:anywhere]">{p.error}</span>
                                  <span className="block text-xs text-zinc-400">{p.fix}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {runs && runs.length >= limit && (
        <button type="button" className={`${buttonClass("secondary", "sm")} mt-3`} onClick={() => setLimit((l) => Math.min(200, l + 50))}>
          Show older syncs
        </button>
      )}
      {runs && runs.length > 0 && (
        <p className="mt-2 text-xs text-zinc-400">
          Kept {kept} days. {sources.some((s) => s.live_updates) ? `${sources.filter((s) => s.live_updates).map((s) => KIND_LABEL[s.kind]).join(", ")} ${sources.filter((s) => s.live_updates).length === 1 ? "sends" : "send"} change events, so most of its syncs start from one.` : ""}
        </p>
      )}
    </div>
  );
}
