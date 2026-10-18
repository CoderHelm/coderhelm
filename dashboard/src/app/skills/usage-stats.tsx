"use client";

import Link from "next/link";
import { focusRing } from "@/components/ui";
import { agentHref, type SkillStats, type SkillUse } from "@/lib/skills";

const READER_LABEL = { planner: "Planner", coder: "Coder", reviewer: "Reviewer" } as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

function seconds(ms: number | null): string {
  if (ms === null) return "–";
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`;
}

function shortDate(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-100">{value}</p>
      {note && <p className="mt-0.5 text-xs text-zinc-500">{note}</p>}
    </div>
  );
}

function ItemName({ s }: { s: SkillUse }) {
  const label = `${s.kind}:${s.name}`;
  if (s.kind !== "agent") return <span className="font-mono text-zinc-200 [overflow-wrap:anywhere]">{label}</span>;
  return (
    <Link href={agentHref(s)} className={`font-mono text-zinc-200 underline-offset-4 hover:underline rounded [overflow-wrap:anywhere] ${focusRing}`}>
      {label}
    </Link>
  );
}

/** Thirty days of reads and asks, one column per day. */
function DayChart({ days }: { days: SkillStats["days"] }) {
  const peak = Math.max(1, ...days.map((d) => d.reads + d.asks));
  const busiest = days.reduce((a, d) => (d.reads + d.asks > a.reads + a.asks ? d : a), days[0]);
  const summary =
    busiest && busiest.reads + busiest.asks > 0
      ? `Busiest day ${shortDate(busiest.date)}: ${plural(busiest.reads, "read")}, ${plural(busiest.asks, "ask")}.`
      : "No reads or asks in this period.";
  return (
    <figure className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
        <span>Per day</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2 w-2 rounded-sm bg-zinc-500" /> Reads
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2 w-2 rounded-sm bg-emerald-400" /> Asks
          </span>
        </span>
      </figcaption>
      <div role="img" aria-label={summary} className="mt-3 flex h-24 items-end gap-[2px]">
        {days.map((d) => {
          const total = d.reads + d.asks;
          return (
            <div
              key={d.date}
              title={`${shortDate(d.date)}: ${plural(d.reads, "read")}, ${plural(d.asks, "ask")}`}
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
            >
              {total === 0 ? (
                <div className="h-px bg-zinc-800" />
              ) : (
                <div className="flex flex-col overflow-hidden rounded-sm" style={{ height: `${Math.max(4, (total / peak) * 100)}%` }}>
                  <div className="bg-emerald-400" style={{ flexGrow: d.asks }} />
                  <div className="bg-zinc-500" style={{ flexGrow: d.reads }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-zinc-600">
        <span>{days[0] && shortDate(days[0].date)}</span>
        <span>Today</span>
      </div>
      <p className="mt-2 text-xs text-zinc-500">{summary}</p>
    </figure>
  );
}

export function UsageStats({ stats }: { stats: SkillStats }) {
  const nothing = stats.reads === 0 && stats.asks === 0;
  const readerPeak = Math.max(1, ...stats.by_reader.map((r) => r.reads + r.asks));
  return (
    <section aria-labelledby="usage-heading" className="mt-8">
      <h2 id="usage-heading" className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Use in the last {stats.days_covered} days
      </h2>
      {nothing ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-400">
          Coderhelm hasn&apos;t read a skill or asked an agent yet. Its planner, coder and reviewer pick the ones whose description
          fits the work, so a clear description is what gets an item used.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Reads" value={stats.reads.toLocaleString()} note="skills, briefs, commands" />
            <Tile
              label="Agent asks"
              value={stats.asks.toLocaleString()}
              note={stats.asks ? `${stats.answered} answered${stats.no_answer ? `, ${stats.no_answer} not` : ""}` : "none yet"}
            />
            <Tile label="Typical answer" value={seconds(stats.median_answer_ms)} note="median time" />
            <Tile label="Not used" value={stats.unused_count.toLocaleString()} note={`switched on, idle ${stats.days_covered} days`} />
          </div>

          <DayChart days={stats.days} />

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <h3 className="text-sm font-medium text-zinc-200">Who used them</h3>
              <ul className="mt-3 space-y-3">
                {stats.by_reader.map((r) => (
                  <li key={r.reader}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="text-zinc-300">{READER_LABEL[r.reader]}</span>
                      <span className="text-xs tabular-nums text-zinc-500">
                        {plural(r.reads, "read")} · {plural(r.asks, "ask")}
                      </span>
                    </div>
                    <div aria-hidden className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-zinc-800">
                      <div className="bg-zinc-500" style={{ width: `${(r.reads / readerPeak) * 100}%` }} />
                      <div className="bg-emerald-400" style={{ width: `${(r.asks / readerPeak) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <h3 className="text-sm font-medium text-zinc-200">Most used</h3>
              {stats.top.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">Nothing yet.</p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {stats.top.map((s) => (
                    <li key={`${s.repo}#${s.path}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                      <ItemName s={s} />
                      <span className="text-xs tabular-nums text-zinc-500">
                        {[
                          s.reads ? plural(s.reads, "read") : "",
                          s.asks ? `${plural(s.asks, "ask")}${s.answered !== s.asks ? `, ${s.answered} answered` : ""}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          {stats.unused_count > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <h3 className="text-sm font-medium text-zinc-200">Switched on but not used</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Nothing read or asked these in {stats.days_covered} days. A sharper description helps the agents pick them;
                otherwise switch them off.
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {stats.unused.map((s) => (
                  <li key={`${s.repo}#${s.path}`} className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs">
                    <ItemName s={s} />
                  </li>
                ))}
                {stats.unused_count > stats.unused.length && (
                  <li className="px-2 py-1 text-xs text-zinc-500">and {stats.unused_count - stats.unused.length} more</li>
                )}
              </ul>
            </div>
          )}

          <p className="text-xs text-zinc-500">
            {stats.asks > 0 && <>Asks used {(stats.input_tokens + stats.output_tokens).toLocaleString()} tokens. </>}
            {stats.tries > 0 && <>Tries from agent pages ({stats.tries}) aren&apos;t counted here.</>}
          </p>
        </div>
      )}
    </section>
  );
}
