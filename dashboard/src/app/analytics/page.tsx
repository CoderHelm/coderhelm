"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type Analytics, type AnalyticsComparison, type AnalyticsCounts, type AnalyticsPeriod } from "@/lib/api";
import { CardSkeleton, ChartSkeleton } from "@/components/skeleton";
import { Segmented } from "@/components/segmented";
import { Callout } from "@/components/callout";
import { focusRing } from "@/components/ui";
import { Page, PageHeader, Section } from "@/components/page";

// Categorical slots for the dark chart surface, checked for color-vision
// separation and contrast (blue, orange). Text never takes a series color.
const SERIES = { first: "#3987e5", second: "#d95926" };

const PERIODS: { value: `${AnalyticsPeriod}`; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "mtd", label: "This month" },
];

const MINUTES_KEY = "coderhelm.analytics.minutesPerPr";

// ── Formatting ─────────────────────────────────────────────────────────────

const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);
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
/** All four token parts (new input, cache read, cache write, output), the measure of what Coderhelm used. */
const totalTokens = (s: { tokens?: number; tokens_in: number; tokens_out: number }) => s.tokens ?? s.tokens_in + s.tokens_out;
const perPr = (s: { tokens?: number; tokens_in: number; tokens_out: number; prs_merged: number; tokens_per_merged_pr?: number | null }) =>
  s.tokens_per_merged_pr ?? (s.prs_merged ? Math.round(totalTokens(s) / s.prs_merged) : null);

/** "+12% vs previous 30 days", or points for rates. Neutral ink: the reader judges. */
function delta(cur: number | null, prev: number | null, kind: "count" | "rate" | "hours", vs: string): string {
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

/** People's ratings of reviews, as the share rated helpful. */
function RatingsTile({ up, down }: { up: number; down: number }) {
  const rated = up + down;
  if (rated === 0) return <Tile label="Rated helpful" value="—" basis="No ratings yet" />;
  return (
    <Tile
      label="Rated helpful"
      value={pct(up / rated)}
      basis={`${count(up)} of ${plural(rated, "rating")} on the Reviewer page`}
    />
  );
}

function ChartCard({ title, children, table, actions }: { title: string; children: ReactNode; table: ReactNode; actions?: ReactNode }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-zinc-200">{title}</h3>
        {actions && <div className="order-last w-full sm:order-none sm:ml-auto sm:w-auto">{actions}</div>}
        <button type="button" onClick={() => setShowTable((v) => !v)} aria-label={`${showTable ? "Show chart" : "Show table"}: ${title}`} className={`rounded text-xs text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline ${focusRing}`}>
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
/** People first, then CoderHelm's own work, then runs that recorded nobody; most runs first inside each. */
function peopleRows(people: Analytics["people"]) {
  const order = (r: Analytics["people"][number]) => (r.kind === "coderhelm" ? 1 : r.kind === "not_recorded" || !r.person ? 2 : 0);
  return [...people].sort((a, b) => order(a) - order(b) || b.runs - a.runs).map((r) => [r.person || "Not recorded (older runs)", r.runs, r.merged]);
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<AnalyticsPeriod>(30);
  const [repo, setRepo] = useState("");
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [repoNames, setRepoNames] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getAnalytics(period, repo || undefined);
      setData(res);
      // Keep the picker's full list while one repo is shown.
      if (!repo) setRepoNames(res.repo_names);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setLoading(false);
    }
  }, [period, repo]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Page>
      <PageHeader
        title="Analytics"
        lead="What Coderhelm delivered, the tokens it used, and where it struggles. Every number comes from your runs, reviews and lookups; open any row to see the work behind it."
      />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Segmented label="Period" options={PERIODS} value={`${period}` as `${AnalyticsPeriod}`} onChange={(v) => setPeriod(v === "mtd" ? "mtd" : (Number(v) as AnalyticsPeriod))} />
        <label className="flex min-w-0 items-center gap-2 text-sm text-zinc-400">
          <span>Repository</span>
          <select
            aria-label="Repository"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            className={`min-h-8 max-w-[220px] truncate rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 ${focusRing}`}
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
            <button type="button" onClick={() => void load()} className={`mt-2 rounded text-sm font-medium underline ${focusRing}`}>Try again</button>
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
    </Page>
  );
}

function Body({ data, loading }: { data: Analytics; loading: boolean }) {
  const s = data.summary;
  const p = data.previous;
  const d = data.days;
  const mtd = data.basis === "month_to_date";
  /** "the last 30 days", or "this month so far". */
  const span = mtd ? "this month so far" : `the last ${d} days`;
  const vs = mtd ? "vs the same days last month" : `vs previous ${d} days`;
  const nothing = s.runs === 0 && data.reviews.posted === 0 && data.lookups.total === 0;

  if (nothing) {
    return (
      <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 text-sm text-zinc-400">
        <p className="text-zinc-200">Nothing to show for {span} yet.</p>
        <p className="mt-1">Numbers appear here as Coderhelm works on tickets, reviews pull requests and looks things up. Try a longer period, or another repository.</p>
      </div>
    );
  }

  return (
    <div className={loading ? "opacity-60 transition-opacity" : ""}>
      <Section title="Is it worth it" id="worth">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile testId="tile-merged" label="PRs merged" value={count(s.prs_merged)} change={delta(s.prs_merged, p.prs_merged, "count", vs)} basis={`${plural(s.prs_opened, "PR")} opened, ${count(s.prs_open)} still open`} />
          <Tile testId="tile-merge-rate" label="Merge rate" value={pct(s.merge_rate)} change={delta(s.merge_rate, p.merge_rate, "rate", vs)} basis="Merged out of opened" />
          <Tile testId="tile-time-to-merge" label="Median time to merge" value={hours(s.median_hours_to_merge)} change={delta(s.median_hours_to_merge, p.median_hours_to_merge, "hours", vs)} basis={s.time_to_merge_known ? `From ${plural(s.time_to_merge_known, "merged PR")}` : "Recorded for PRs merged from now on"} />
          <Tile testId="tile-tokens-per-pr" label="Tokens per merged PR" value={perPr(s) == null ? "—" : tokens(perPr(s)!)} change={delta(perPr(s), perPr(p), "count", vs)} basis={`${tokens(totalTokens(s))} tokens across ${plural(s.runs, "run")}`} />
          <Tile testId="tile-untouched" label="Merged as written" value={s.edits_known ? pct(s.merged_untouched / s.edits_known) : "—"} basis={s.edits_known ? `${count(s.merged_untouched)} of ${plural(s.edits_known, "merged PR")} had no commits from people` : "Recorded for PRs merged from now on"} />
          <Tile testId="tile-ci" label="Red CI fixed by Coderhelm" value={pct(data.ci.fix_rate)} basis={data.ci.runs_with_red_ci ? `${count(data.ci.fixed_by_coderhelm)} of ${plural(data.ci.runs_with_red_ci, "run")} went green after its fixes` : "No red CI on Coderhelm's PRs"} />
          <Tile testId="tile-findings" label="Review findings acted on" value={pct(data.reviews.acted_on_rate)} basis={data.reviews.outcomes_known_reviews ? `${count(data.reviews.findings_fixed)} fixed in code, ${count(data.reviews.findings_settled_by_person)} settled by a person` : "Counted from re-reviews from now on"} />
          <Tile testId="tile-failed" label="Failed runs" value={count(s.failed_runs)} change={delta(s.failed_runs, p.failed_runs, "count", vs)} basis={s.runs ? `${pct(s.failure_rate)} of runs` : undefined} />
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
          title="Tokens per day"
          table={<Table label="Tokens per day" head={["Day", "Tokens", "Runs"]} rows={data.daily.map((r) => [shortDay(r.day), tokens(r.tokens ?? 0), r.runs])} empty="No days." />}
        >
          <div className="h-56" role="img" aria-label="Bar chart of tokens used per day">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.daily} barCategoryGap="20%">
                <CartesianGrid vertical={false} stroke="#27272a" />
                <XAxis dataKey="day" tickFormatter={shortDay} {...axis} minTickGap={24} />
                <YAxis width={44} tickFormatter={(v: number) => tokens(v)} {...axis} />
                <Tooltip cursor={{ fill: "#27272a66" }} content={<ChartTip format={(v) => `${tokens(v)} tokens`} />} />
                <Bar dataKey="tokens" name="Tokens" fill={SERIES.first} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {data.comparison && <Comparison c={data.comparison} period={data.period} previous={data.previous_period} mtd={mtd} />}

      <TimeSaved merged={s.prs_merged} span={span} />

      <Section title="Where it struggles" id="struggles" description="Failed runs grouped by what went wrong. Open the latest run of a group to see its steps.">
        <Table
          label="Failures by reason"
          head={["Reason", "Runs", "Latest"]}
          rows={data.failures.map((f) => [
            f.reason,
            f.count,
            <Link key={f.last_run_id} href={`/runs/detail?id=${f.last_run_id}`} className="text-zinc-100 underline-offset-2 hover:underline">Open run</Link>,
          ])}
          empty={`No failed runs in ${span}.`}
        />
        {data.ci.runs_with_red_ci > 0 && (
          <p className="mt-3 text-sm text-zinc-400">
            CI went red on {plural(data.ci.runs_with_red_ci, "run")}. Coderhelm tried {plural(data.ci.fix_attempts, "fix", "fixes")}, pushed {plural(data.ci.fix_commits, "change")}, and {count(data.ci.fixed_by_coderhelm)} ended green.
          </p>
        )}
      </Section>

      <Section title="Reviews" id="reviews" description="Pull request reviews Coderhelm posted, and what became of the findings it raised before.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Reviews posted" value={count(data.reviews.posted)} change={delta(s.reviews, p.reviews, "count", vs)} basis={`On ${plural(data.reviews.prs_reviewed, "PR")}`} />
          <Tile label="Approved / changes asked / comments" value={`${count(data.reviews.approve)} / ${count(data.reviews.request_changes)} / ${count(data.reviews.comment)}`} />
          <Tile label="Findings raised" value={count(data.reviews.findings)} basis={data.reviews.questions ? `${plural(data.reviews.questions, "question")} answered too` : undefined} />
          <RatingsTile up={data.reviews.thumbs_up} down={data.reviews.thumbs_down} />
        </div>
      </Section>

      <Section title="By repository" id="repos">
        <Table
          label="By repository"
          head={["Repository", "Runs", "PRs", "Merged", "Merge rate", "Failed", "Reviews", "Tokens"]}
          rows={data.repos.map((r) => [r.repo || "—", r.runs, r.prs, r.merged, pct(r.merge_rate), r.failed, r.reviews, tokens(r.tokens ?? 0)])}
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
        <Section title="Who asks for work" id="people" description="One row per person, however Jira, GitHub or the dashboard named them.">
          <Table
            label="By person"
            head={["Person", "Runs", "Merged"]}
            rows={peopleRows(data.people)}
            empty="No runs in this period."
          />
        </Section>
      </div>

      <div className="grid gap-x-6 lg:grid-cols-2">
        <Section title="Where the work goes" id="steps" description={`Tokens and time by step, over ${d > data.steps_window_days ? `the last ${data.steps_window_days} days` : span} (step details are kept for ${data.steps_window_days} days).`}>
          <Table
            label="By step"
            head={["Step", "Times", "Tokens", "Avg time"]}
            rows={data.steps.map((r) => [stepLabel(r.step), r.count, tokens(r.tokens_in + r.tokens_out), `${Math.round(r.avg_seconds)} s`])}
            empty="No step details in this period."
          />
        </Section>
        <Section title="Data source lookups" id="lookups" description={data.lookups.total ? `${plural(data.lookups.total, "lookup")}: ${count(data.lookups.refused)} refused by the read-only rules, ${count(data.lookups.failed)} failed.` : undefined}>
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
            empty={`No merged PRs in ${span}.`}
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
            empty={`No failed runs in ${span}.`}
          />
        </Section>
      </div>
    </div>
  );
}

// ── Compared with the period before ───────────────────────────────────────

/** Keeps "1–22" together; a narrow column may still put the month above it. */
const JOIN = "\u2060";

/** "Sep 1–22", or "Aug 24 – Sep 22" across months. The end is exclusive. */
function range(start: string, end: string) {
  const a = new Date(start);
  const b = new Date(new Date(end).getTime() - 1);
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) {
    return a.getUTCDate() === b.getUTCDate() ? `${month(a)} ${a.getUTCDate()}` : `${month(a)} ${a.getUTCDate()}${JOIN}–${JOIN}${b.getUTCDate()}`;
  }
  return `${shortDay(a.toISOString().slice(0, 10))} – ${shortDay(b.toISOString().slice(0, 10))}`;
}

/** Changes smaller than this read as flat: a PR either way is noise. */
const FLAT_PCT = 3;

/** How the current number moved from the previous one: ↑ +12%, ↓ −11%, ↑ ×2.1, Flat, or New. */
function change(cur: number, prev: number): { text: string; tone: "up" | "down" | "flat" } {
  if (prev === 0) return cur === 0 ? { text: "Flat", tone: "flat" } : { text: "New", tone: "up" };
  const pctChange = ((cur - prev) / prev) * 100;
  if (Math.abs(pctChange) < FLAT_PCT) return { text: "Flat", tone: "flat" };
  if (cur / prev >= 2) return { text: `↑ ×${(cur / prev).toFixed(1)}`, tone: "up" };
  const rounded = Math.round(Math.abs(pctChange));
  return pctChange > 0 ? { text: `↑ +${rounded}%`, tone: "up" } : { text: `↓ −${rounded}%`, tone: "down" };
}

const TONE = { up: "text-emerald-400", down: "text-rose-400", flat: "text-zinc-400" };

function Change({ cur, prev, comparable = true }: { cur: number; prev: number; comparable?: boolean }) {
  if (!comparable) return <span className="text-zinc-500">Not comparable</span>;
  const c = change(cur, prev);
  return <span className={`font-medium ${TONE[c.tone]}`}>{c.text}</span>;
}

type Metric = { key: keyof AnalyticsCounts; label: string; sub?: boolean; note?: string };

const METRICS: Metric[] = [
  { key: "tickets", label: "Tickets worked on" },
  { key: "runs", label: "Runs (including reruns)" },
  { key: "prs_opened", label: "PRs opened" },
  { key: "prs_merged", label: "PRs merged", note: "merged" },
  { key: "prs_reviewed", label: "PRs reviewed (distinct)" },
  { key: "reviews_posted", label: "Reviews posted" },
  { key: "approvals", label: "Approvals", sub: true },
  { key: "changes_requested", label: "Changes requested", sub: true },
  { key: "comments", label: "Plain comments", sub: true },
  { key: "repos", label: "Repositories covered" },
  { key: "people", label: "People who asked", note: "people" },
];

/** Short toggle labels so the three fit side by side on a phone; the title names the metric in full. */
const CHART_METRICS = [
  { value: "prs_reviewed", label: "Reviewed", title: "PRs reviewed" },
  { value: "prs_opened", label: "Opened", title: "PRs opened" },
  { value: "tickets", label: "Tickets", title: "Tickets" },
] as const;
type ChartMetric = (typeof CHART_METRICS)[number]["value"];

function CompareTip({ active, payload, rows }: { active?: boolean; payload?: { name: string; value: number | null; color: string; payload: AnalyticsComparison["daily"][number] }[]; rows: AnalyticsComparison["daily"] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const day = (d: string | null) => (d ? shortDay(d) : "—");
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/95 px-3 py-2 shadow-xl">
      <p className="mb-1 text-xs text-zinc-400">Day {row.offset + 1} of {rows.length}</p>
      {payload.map((p, i) => (
        <div key={p.name} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden="true" />
          <span className="text-zinc-400">{i === 0 ? day(row.day) : day(row.previous_day)}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums text-zinc-100">{p.value == null ? "—" : count(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** This period against the one before it: each thing counted once, from the records. */
function Comparison({ c, period, previous, mtd }: { c: AnalyticsComparison; period: { start: string; end: string }; previous: { start: string; end: string }; mtd: boolean }) {
  const [metric, setMetric] = useState<ChartMetric>("prs_reviewed");
  const cur = range(period.start, period.end);
  const prev = range(previous.start, previous.end);
  const full = c.previous_full && c.previous_full_period ? c.previous_full : null;
  const fullLabel = c.previous_full_period
    ? `All of ${new Date(c.previous_full_period.start).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" })}`
    : "";
  const label = CHART_METRICS.find((m) => m.value === metric)!.title;
  const prevKey = `previous_${metric}` as const;

  const notes: string[] = [];
  if (c.current.prs_open > 0) {
    notes.push(`PRs merged counts merges so far: ${plural(c.current.prs_open, "PR")} from ${cur} ${c.current.prs_open === 1 ? "is" : "are"} still open, so the latest period catches up as they merge.`);
  }
  const share = (x: AnalyticsCounts) => (x.reviews_posted ? x.comments / x.reviews_posted : 0);
  if (c.previous.reviews_posted > 0 && share(c.previous) - share(c.current) >= 0.2) {
    notes.push(`More reviews in ${prev} were posted as plain comments (${pct(share(c.previous))}, against ${pct(share(c.current))} now), before reviews approved or asked for changes. Compare reviews posted, not the split.`);
  }
  if (!c.people_comparable) {
    const recorded = (x: AnalyticsCounts, when: string) => `${count(x.runs_with_requester)} of ${plural(x.runs, "run")} in ${when}`;
    notes.push(`Who asked was recorded on ${recorded(c.previous, prev)} and ${recorded(c.current, cur)}, so people who asked is not compared: a jump from runs that recorded nobody would not be real.`);
  }

  // Phones keep the change in view; all of last month shows from the sm breakpoint.
  const cell = "px-1.5 py-2.5 text-right tabular-nums sm:px-4";
  const wide = "hidden sm:table-cell";

  return (
    <Section
      title="Compared with the period before"
      id="compare"
      description={`${cur} against ${prev}${mtd ? ", the same time into the month" : ""}. Each thing is counted once: a ticket with three runs is one ticket, a PR reviewed five times is one PR reviewed and five reviews.`}
    >
      <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/50">
        <table className="w-full text-sm" aria-label="Compared with the period before">
          <thead>
            <tr className="border-b border-zinc-800 text-xs text-zinc-400">
              <th scope="col" className="px-3 py-2.5 text-left font-medium sm:px-4">Metric</th>
              <th scope="col" className={`${cell} font-medium`}>{prev}</th>
              <th scope="col" className={`${cell} font-medium`}>{cur}</th>
              <th scope="col" className={`${cell} font-medium`}>Change</th>
              {full && <th scope="col" className={`${cell} ${wide} font-medium`}>{fullLabel}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {METRICS.map((m) => (
              <tr key={m.key}>
                <th scope="row" className={`min-w-0 break-words px-3 py-2.5 text-left font-normal sm:px-4 ${m.sub ? "pl-6 text-zinc-400 sm:pl-8" : "text-zinc-100"}`}>
                  {m.sub ? "·\u00a0" : ""}
                  {m.label}
                </th>
                <td className={`${cell} text-zinc-300`}>{count(c.previous[m.key])}</td>
                <td className={`${cell} text-zinc-300`}>{count(c.current[m.key])}</td>
                <td className={cell}>
                  <Change cur={c.current[m.key]} prev={c.previous[m.key]} comparable={m.note !== "people" || c.people_comparable} />
                </td>
                {full && <td className={`${cell} ${wide} text-zinc-300`}>{count(full[m.key])}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {full && <p className="mt-2 text-xs text-zinc-500 sm:hidden">{fullLabel} shows on a wider screen.</p>}
      {notes.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-zinc-500" data-testid="compare-notes">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <div className="mt-4">
        <ChartCard
          title={`${label} so far, ${cur} against ${prev}`}
          actions={<Segmented label="Chart metric" options={CHART_METRICS.map(({ value, label: l }) => ({ value, label: l }))} value={metric} onChange={(v) => setMetric(v)} />}
          table={
            <Table
              label={`${label} so far by day`}
              head={["Day", prev, cur]}
              rows={c.daily.map((r) => [`Day ${r.offset + 1}`, r[prevKey] == null ? "—" : count(r[prevKey]!), count(r[metric])])}
              empty="No days."
            />
          }
        >
          <div className="h-56" role="img" aria-label={`Line chart of ${label} so far by day, ${cur} against ${prev}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={c.daily}>
                <CartesianGrid vertical={false} stroke="#27272a" />
                <XAxis dataKey="offset" tickFormatter={(o: number) => `Day ${o + 1}`} {...axis} minTickGap={24} />
                <YAxis allowDecimals={false} width={32} {...axis} />
                <Tooltip cursor={{ stroke: "#3f3f46" }} content={<CompareTip rows={c.daily} />} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }} iconType="circle" iconSize={8} />
                <Line type="monotone" dataKey={metric} name={cur} stroke={SERIES.first} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey={prevKey} name={prev} stroke={SERIES.second} strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
    </Section>
  );
}

/** Time saved is an estimate, so it only appears with the reader's own
 *  assumption, and the formula is shown beside the number. */
function TimeSaved({ merged, span }: { merged: number; span: string }) {
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
            className={`w-24 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-100 ${focusRing}`}
          />
          <span>minutes,</span>
        </label>
        {valid ? (
          <p className="mt-2 text-zinc-100" data-testid="time-saved">
            about <span className="font-semibold">{hours(total)}</span> of work in {span}.
            <span className="block text-xs text-zinc-500">{count(merged)} merged PRs × {perPr} minutes ÷ 60. An estimate from your number, not a measurement.</span>
          </p>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">Coderhelm doesn&apos;t guess how long work would have taken you. Enter your own figure to see an estimate.</p>
        )}
      </div>
    </Section>
  );
}
