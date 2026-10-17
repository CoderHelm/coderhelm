"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type Analytics, type AnalyticsDays, type AnalyticsSummary } from "@/lib/api";
import { CardSkeleton, ChartSkeleton } from "@/components/skeleton";
import { Segmented } from "@/components/segmented";
import { Callout } from "@/components/callout";

// Categorical slots for the dark chart surface, checked for color-vision
// separation and contrast (blue, orange). Text never takes a series color.
const SERIES = { first: "#3987e5", second: "#d95926" };

const PERIODS: { value: `${AnalyticsDays}`; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

const MINUTES_KEY = "coderhelm.analytics.minutesPerPr";

// ── Formatting ─────────────────────────────────────────────────────────────

const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const money = (v: number | null | undefined) =>
  v == null ? "—" : v >= 100 ? `$${Math.round(v).toLocaleString()}` : `$${v.toFixed(2)}`;
const count = (v: number) => v.toLocaleString();
function hours(v: number | null | undefined) {
  if (v == null) return "—";
  if (v < 1) return `${Math.max(1, Math.round(v * 60))} min`;
  if (v < 48) return `${v.toFixed(v < 10 ? 1 : 0)} h`;
  return `${(v / 24).toFixed(1)} days`;
}
function tokens(v: number) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(Math.round(v));
}
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;

/** "+12% vs previous 30 days", or points for rates. Neutral ink: the reader judges. */
function delta(cur: number | null, prev: number | null, kind: "count" | "rate" | "money" | "hours", days: number): string {
  const vs = `vs previous ${days} days`;
  if (cur == null || prev == null) return `— ${vs}`;
  if (kind === "rate") {
    const pts = Math.round((cur - prev) * 100);
    return `${pts > 0 ? "▲ " : pts < 0 ? "▼ " : ""}${pts === 0 ? "No change" : `${Math.abs(pts)} pts`} ${vs}`;
  }
  if (prev === 0) return cur === 0 ? `No change ${vs}` : `New ${vs}`;
  const change = Math.round(((cur - prev) / prev) * 100);
  if (change === 0) return `No change ${vs}`;
  return `${change > 0 ? "▲" : "▼"} ${Math.abs(change)}% ${vs}`;
}

const shortDay = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
};

// ── Pieces ─────────────────────────────────────────────────────────────────

function Tile({ label, value, change, basis, testId }: { label: string; value: string; change?: string; basis?: string; testId?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4" data-testid={testId}>
      <p className="text-xs font-medium text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-100">{value}</p>
      {change && <p className="mt-1 text-xs text-zinc-400">{change}</p>}
      {basis && <p className="mt-1 text-xs text-zinc-500">{basis}</p>}
    </div>
  );
}

function Section({ title, lead, children, id }: { title: string; lead?: string; children: ReactNode; id?: string }) {
  return (
    <section className="mt-10 min-w-0" aria-labelledby={id}>
      <h2 id={id} className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{title}</h2>
      {lead && <p className="mt-1 max-w-prose text-sm text-zinc-400">{lead}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ChartCard({ title, children, table }: { title: string; children: ReactNode; table: ReactNode }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-zinc-200">{title}</h3>
        <button type="button" onClick={() => setShowTable((v) => !v)} className="text-xs text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline">
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>
      {showTable ? <div className="max-h-64 overflow-auto">{table}</div> : children}
    </div>
  );
}

function ChartTip({ active, payload, label, format }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; format?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/95 px-3 py-2 shadow-xl">
      <p className="mb-1 text-xs text-zinc-400">{label ? shortDay(label) : ""}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden="true" />
          <span className="text-zinc-400">{p.name}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums text-zinc-100">{format ? format(p.value) : count(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

const axis = { stroke: "transparent", tick: { fill: "#71717a", fontSize: 11 }, tickLine: false, axisLine: false };

/** A plain table; wide ones scroll inside their box, never the page. */
function Table({ head, rows, empty, label }: { head: string[]; rows: ReactNode[][]; empty: string; label: string }) {
  if (rows.length === 0) {
    return <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/50">
      {/* Only wide tables keep a minimum width (and scroll inside their box on a phone). */}
      <table className={`w-full text-sm ${head.length >= 6 ? "min-w-[640px]" : ""}`} aria-label={label}>
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400">
            {head.map((h, i) => (
              <th key={h} scope="col" className={`px-3 py-2.5 font-medium sm:px-4 ${i > 0 ? "text-right" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={`px-3 py-2.5 sm:px-4 ${j > 0 ? "text-right tabular-nums text-zinc-300" : "min-w-0 break-words text-zinc-100"}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function actorLabel(a: string) {
  return ({ reviewer: "Reviewer", planner: "Planner", coder: "Coding agent", people: "People in the dashboard" } as Record<string, string>)[a] ?? a;
}
function stepLabel(s: string) {
  return ({ triage: "Triage", plan: "Planning", implement: "Writing code", ci_fix: "Fixing CI", review: "Self-review", feedback: "Answering feedback", pr: "Opening the PR", security: "Security check" } as Record<string, string>)[s] ?? s.replace(/_/g, " ");
}
function sourceLabel(s: string) {
  return ({ github: "GitHub issues", jira: "Jira", alert: "Alerts", other: "Other" } as Record<string, string>)[s] ?? s;
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [days, setDays] = useState<AnalyticsDays>(30);
  const [repo, setRepo] = useState("");
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [repoNames, setRepoNames] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getAnalytics(days, repo || undefined);
      setData(res);
      // Keep the picker's full list while one repo is shown.
      if (!repo) setRepoNames(res.repo_names);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setLoading(false);
    }
  }, [days, repo]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="mt-1 max-w-prose text-sm text-zinc-400">
            What Coderhelm delivered, what it cost, and where it struggles. Every number comes from your runs, reviews and lookups; open any row to see the work behind it.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Segmented label="Period" options={PERIODS} value={`${days}` as `${AnalyticsDays}`} onChange={(v) => setDays(Number(v) as AnalyticsDays)} />
        <label className="flex min-w-0 items-center gap-2 text-sm text-zinc-400">
          <span>Repository</span>
          <select
            aria-label="Repository"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            className="min-h-8 max-w-[220px] truncate rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
          >
            <option value="">All repositories</option>
            {repoNames.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <div className="mt-6">
          <Callout variant="error" title="We couldn't load analytics">
            <p>{error} Your data is not affected.</p>
            <button type="button" onClick={() => void load()} className="mt-2 text-sm font-medium underline">Try again</button>
          </Callout>
        </div>
      ) : loading && !data ? (
        <div className="mt-6 space-y-4" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
          <ChartSkeleton />
        </div>
      ) : data ? (
        <Body data={data} loading={loading} />
      ) : null}
    </div>
  );
}

function Body({ data, loading }: { data: Analytics; loading: boolean }) {
  const s = data.summary;
  const p = data.previous;
  const d = data.days;
  const nothing = s.runs === 0 && data.reviews.posted === 0 && data.lookups.total === 0;

  if (nothing) {
    return (
      <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 text-sm text-zinc-400">
        <p className="text-zinc-200">Nothing to show for the last {d} days yet.</p>
        <p className="mt-1">Numbers appear here as Coderhelm works on tickets, reviews pull requests and looks things up. Try a longer period, or another repository.</p>
      </div>
    );
  }

  return (
    <div className={loading ? "opacity-60 transition-opacity" : ""}>
      <Section title="Is it worth it" id="worth">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile testId="tile-merged" label="PRs merged" value={count(s.prs_merged)} change={delta(s.prs_merged, p.prs_merged, "count", d)} basis={`${plural(s.prs_opened, "PR")} opened, ${count(s.prs_open)} still open`} />
          <Tile testId="tile-merge-rate" label="Merge rate" value={pct(s.merge_rate)} change={delta(s.merge_rate, p.merge_rate, "rate", d)} basis="Merged out of opened" />
          <Tile testId="tile-time-to-merge" label="Median time to merge" value={hours(s.median_hours_to_merge)} change={delta(s.median_hours_to_merge, p.median_hours_to_merge, "hours", d)} basis={s.time_to_merge_known ? `From ${plural(s.time_to_merge_known, "merged PR")}` : "Recorded for PRs merged from now on"} />
          <Tile testId="tile-cost-per-pr" label="Cost per merged PR" value={money(s.cost_per_merged_pr)} change={delta(s.cost_per_merged_pr, p.cost_per_merged_pr, "money", d)} basis={`${money(s.cost_usd)} across ${plural(s.runs, "run")}`} />
          <Tile testId="tile-untouched" label="Merged as written" value={s.edits_known ? pct(s.merged_untouched / s.edits_known) : "—"} basis={s.edits_known ? `${count(s.merged_untouched)} of ${plural(s.edits_known, "merged PR")} had no commits from people` : "Recorded for PRs merged from now on"} />
          <Tile testId="tile-ci" label="Red CI fixed by Coderhelm" value={pct(data.ci.fix_rate)} basis={data.ci.runs_with_red_ci ? `${count(data.ci.fixed_by_coderhelm)} of ${plural(data.ci.runs_with_red_ci, "run")} went green after its fixes` : "No red CI on Coderhelm's PRs"} />
          <Tile testId="tile-findings" label="Review findings acted on" value={pct(data.reviews.acted_on_rate)} basis={data.reviews.outcomes_known_reviews ? `${count(data.reviews.findings_fixed)} fixed in code, ${count(data.reviews.findings_settled_by_person)} settled by a person` : "Counted from re-reviews from now on"} />
          <Tile testId="tile-failed" label="Failed runs" value={count(s.failed_runs)} change={delta(s.failed_runs, p.failed_runs, "count", d)} basis={s.runs ? `${pct(s.failure_rate)} of runs` : undefined} />
        </div>
      </Section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="PRs opened and merged per day"
          table={<Table label="PRs per day" head={["Day", "Opened", "Merged"]} rows={data.daily.map((r) => [shortDay(r.day), r.prs_opened, r.merged])} empty="No days." />}
        >
          <div className="h-56" role="img" aria-label="Bar chart of pull requests opened and merged per day">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.daily} barGap={2} barCategoryGap="20%">
                <CartesianGrid vertical={false} stroke="#27272a" />
                <XAxis dataKey="day" tickFormatter={shortDay} {...axis} minTickGap={24} />
                <YAxis allowDecimals={false} width={28} {...axis} />
                <Tooltip cursor={{ fill: "#27272a66" }} content={<ChartTip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }} iconType="circle" iconSize={8} />
                <Bar dataKey="prs_opened" name="Opened" fill={SERIES.first} radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar dataKey="merged" name="Merged" fill={SERIES.second} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard
          title="Spend per day"
          table={<Table label="Spend per day" head={["Day", "Spend", "Runs"]} rows={data.daily.map((r) => [shortDay(r.day), money(r.cost_usd), r.runs])} empty="No days." />}
        >
          <div className="h-56" role="img" aria-label="Bar chart of model spend per day">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.daily} barCategoryGap="20%">
                <CartesianGrid vertical={false} stroke="#27272a" />
                <XAxis dataKey="day" tickFormatter={shortDay} {...axis} minTickGap={24} />
                <YAxis width={40} tickFormatter={(v: number) => `$${v}`} {...axis} />
                <Tooltip cursor={{ fill: "#27272a66" }} content={<ChartTip format={(v) => money(v)} />} />
                <Bar dataKey="cost_usd" name="Spend" fill={SERIES.first} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <TimeSaved merged={s.prs_merged} days={d} />

      <Section title="Where it struggles" id="struggles" lead="Failed runs grouped by what went wrong. Open the latest run of a group to see its steps.">
        <Table
          label="Failures by reason"
          head={["Reason", "Runs", "Latest"]}
          rows={data.failures.map((f) => [
            f.reason,
            f.count,
            <Link key={f.last_run_id} href={`/runs/detail?id=${f.last_run_id}`} className="text-zinc-100 underline-offset-2 hover:underline">Open run</Link>,
          ])}
          empty={`No failed runs in the last ${d} days.`}
        />
        {data.ci.runs_with_red_ci > 0 && (
          <p className="mt-3 text-sm text-zinc-400">
            CI went red on {plural(data.ci.runs_with_red_ci, "run")}. Coderhelm tried {plural(data.ci.fix_attempts, "fix", "fixes")}, pushed {plural(data.ci.fix_commits, "change")}, and {count(data.ci.fixed_by_coderhelm)} ended green.
          </p>
        )}
      </Section>

      <Section title="Reviews" id="reviews" lead="Pull request reviews Coderhelm posted, and what became of the findings it raised before.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Reviews posted" value={count(data.reviews.posted)} change={delta(s.reviews, p.reviews, "count", d)} basis={`On ${plural(data.reviews.prs_reviewed, "PR")}`} />
          <Tile label="Approved / changes asked / comments" value={`${count(data.reviews.approve)} / ${count(data.reviews.request_changes)} / ${count(data.reviews.comment)}`} />
          <Tile label="Findings raised" value={count(data.reviews.findings)} basis={data.reviews.questions ? `${plural(data.reviews.questions, "question")} answered too` : undefined} />
          <Tile label="Ratings" value={`👍 ${count(data.reviews.thumbs_up)}  👎 ${count(data.reviews.thumbs_down)}`} basis="From the Reviewer page" />
        </div>
      </Section>

      <Section title="By repository" id="repos">
        <Table
          label="By repository"
          head={["Repository", "Runs", "PRs", "Merged", "Merge rate", "Failed", "Reviews", "Spend"]}
          rows={data.repos.map((r) => [r.repo || "—", r.runs, r.prs, r.merged, pct(r.merge_rate), r.failed, r.reviews, money(r.cost_usd)])}
          empty="No repositories in this period."
        />
      </Section>

      <div className="grid gap-x-6 lg:grid-cols-2">
        <Section title="Where tickets come from" id="sources">
          <Table
            label="By ticket source"
            head={["Source", "Runs", "PRs", "Merged", "Merge rate"]}
            rows={data.sources.map((r) => [sourceLabel(r.source), r.runs, r.prs, r.merged, pct(r.merge_rate)])}
            empty="No runs in this period."
          />
        </Section>
        <Section title="Who asks for work" id="people">
          <Table
            label="By person"
            head={["Person", "Runs", "Merged"]}
            rows={data.people.map((r) => [r.person || "Not recorded (older runs)", r.runs, r.merged])}
            empty="No runs in this period."
          />
        </Section>
      </div>

      <div className="grid gap-x-6 lg:grid-cols-2">
        <Section title="Where the work goes" id="steps" lead={`Tokens and time by step, over the last ${Math.min(d, data.steps_window_days)} days (step details are kept for ${data.steps_window_days}).`}>
          <Table
            label="By step"
            head={["Step", "Times", "Tokens", "Avg time"]}
            rows={data.steps.map((r) => [stepLabel(r.step), r.count, tokens(r.tokens_in + r.tokens_out), `${Math.round(r.avg_seconds)} s`])}
            empty="No step details in this period."
          />
        </Section>
        <Section title="Data source lookups" id="lookups" lead={data.lookups.total ? `${plural(data.lookups.total, "lookup")}: ${count(data.lookups.refused)} refused by the read-only rules, ${count(data.lookups.failed)} failed.` : undefined}>
          <Table
            label="Lookups by source"
            head={["Source", "Lookups", "Refused", "Failed"]}
            rows={data.lookups.by_source.map((r) => [r.source, r.total, r.refused, r.failed])}
            empty="No lookups in this period."
          />
          {data.lookups.by_actor.length > 0 && (
            <p className="mt-3 text-sm text-zinc-400">
              {data.lookups.by_actor.map((a) => `${actorLabel(a.actor)} ${count(a.total)}`).join(" · ")}
            </p>
          )}
        </Section>
      </div>

      <div className="grid gap-x-6 lg:grid-cols-2">
        <Section title="Recently merged" id="merged">
          <Table
            label="Recently merged"
            head={["Pull request", "Time to merge", "People's commits"]}
            rows={data.merged_recent.map((r) => [
              <span key={r.run_id} className="block min-w-0">
                <Link href={`/runs/detail?id=${r.run_id}`} className="text-zinc-100 underline-offset-2 hover:underline">{r.title || `Run ${r.run_id}`}</Link>
                <span className="block text-xs text-zinc-500">
                  {r.repo}
                  {r.pr_url && (
                    <>
                      {" · "}
                      <a href={r.pr_url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">#{r.pr_number}</a>
                    </>
                  )}
                </span>
              </span>,
              hours(r.hours_to_merge),
              r.human_commits == null ? "—" : r.human_commits,
            ])}
            empty={`No merged PRs in the last ${d} days.`}
          />
        </Section>
        <Section title="Recently failed" id="failed">
          <Table
            label="Recently failed"
            head={["Run", "Reason"]}
            rows={data.failed_recent.map((r) => [
              <span key={r.run_id} className="block min-w-0">
                <Link href={`/runs/detail?id=${r.run_id}`} className="text-zinc-100 underline-offset-2 hover:underline">{r.title || `Run ${r.run_id}`}</Link>
                <span className="block text-xs text-zinc-500">{r.repo}</span>
              </span>,
              <span key="reason" className="block text-left text-xs text-zinc-400">{r.reason}</span>,
            ])}
            empty={`No failed runs in the last ${d} days.`}
          />
        </Section>
      </div>
    </div>
  );
}

/** Time saved is an estimate, so it only appears with the reader's own
 *  assumption, and the formula is shown beside the number. */
function TimeSaved({ merged, days }: { merged: number; days: number }) {
  const [minutes, setMinutes] = useState<string>("");
  useEffect(() => {
    try {
      setMinutes(window.localStorage.getItem(MINUTES_KEY) ?? "");
    } catch {
      /* storage unavailable: start empty */
    }
  }, []);
  const save = (v: string) => {
    setMinutes(v);
    try {
      window.localStorage.setItem(MINUTES_KEY, v);
    } catch {
      /* not remembered, still shown */
    }
  };
  const perPr = Number(minutes);
  const valid = minutes !== "" && Number.isFinite(perPr) && perPr > 0 && perPr <= 10_000;
  const total = useMemo(() => (valid ? (merged * perPr) / 60 : 0), [merged, perPr, valid]);
  return (
    <Section title="Time saved (your estimate)" id="saved">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm">
        <label className="flex flex-wrap items-center gap-2 text-zinc-300">
          <span>If one of these PRs would take a person</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={minutes}
            onChange={(e) => save(e.target.value)}
            placeholder="minutes"
            aria-label="Minutes a person would spend on one PR"
            className="w-24 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-100"
          />
          <span>minutes,</span>
        </label>
        {valid ? (
          <p className="mt-2 text-zinc-100" data-testid="time-saved">
            about <span className="font-semibold">{hours(total)}</span> of work in the last {days} days.
            <span className="block text-xs text-zinc-500">{count(merged)} merged PRs × {perPr} minutes ÷ 60. An estimate from your number, not a measurement.</span>
          </p>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">Coderhelm doesn&apos;t guess how long work would have taken you. Enter your own figure to see an estimate.</p>
        )}
      </div>
    </Section>
  );
}
