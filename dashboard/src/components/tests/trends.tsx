"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TestSummary } from "@/lib/api";
import { minutes, pct } from "@/lib/tests";
import { EmptyBox, SectionHeading, StatCard } from "./common";

const PASS = "#22c55e";
const FLAKY = "#f59e0b";
const RUNS = "#60a5fa";

const axis = { stroke: "transparent", tick: { fill: "#71717a", fontSize: 11 }, tickLine: false, axisLine: false };

function shortDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

interface TipEntry { name: string; value: number; color: string }

function Tip({ active, payload, label, percent }: { active?: boolean; payload?: TipEntry[]; label?: string; percent?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/95 px-3 py-2 shadow-xl">
      <p className="mb-1 text-xs text-zinc-500">{label}</p>
      {payload.map((e) => (
        <p key={e.name} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full" style={{ background: e.color }} />
          <span className="text-zinc-400">{e.name}</span>
          <span className="ml-auto font-medium text-zinc-200">{percent ? `${e.value.toFixed(1)}%` : e.value}</span>
        </p>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Pass rate and flaky rate over the last 30 days, and runs per day. */
export function TrendsView({ summary }: { summary: TestSummary | null }) {
  if (!summary) return null;
  const data = summary.trend.map((d) => ({
    label: shortDay(d.day),
    pass: Math.round(d.pass_rate * 1000) / 10,
    flaky: Math.round(d.flake_rate * 1000) / 10,
    runs: d.runs,
  }));
  const hasData = data.some((d) => d.runs > 0);
  const passRange = data.filter((d) => d.runs > 0).map((d) => d.pass);
  const latest = data.length ? data[data.length - 1] : null;
  // Pass rates live near the top: start the axis at the ten below the lowest
  // day, so a drop is visible instead of a flat line pinned to the top.
  const floor = passRange.length ? Math.max(0, Math.min(90, Math.floor((Math.min(...passRange) - 5) / 10) * 10)) : 0;

  return (
    <div className="space-y-8">
      <section aria-label="Last seven days" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Runs (7 days)" value={summary.runs_7d} />
        <StatCard label="Pass rate (7 days)" value={pct(summary.pass_rate_7d)} />
        <StatCard
          label="Flaky rate (7 days)"
          value={pct(summary.flake_rate_7d)}
          hint="Share of test results that passed only on retry"
          tone={summary.flake_rate_7d > 0.02 ? "warning" : undefined}
        />
        <StatCard label="CI time lost (7 days)" value={minutes(summary.ci_minutes_lost_7d)} />
      </section>

      {!hasData ? (
        <EmptyBox>No runs in the last 30 days, so there&apos;s no trend yet.</EmptyBox>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section aria-labelledby="rates-heading" className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <SectionHeading id="rates-heading">Pass rate and flaky rate</SectionHeading>
            <p className="sr-only">
              Over 30 days. Latest day: pass rate {latest?.pass}%, flaky rate {latest?.flaky}%.
            </p>
            <div aria-hidden="true">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#27272a" strokeDasharray="3 3" />
                  <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis yAxisId="pass" {...axis} width={40} domain={[floor, 100]} tickFormatter={(v: number) => `${v}%`} />
                  <YAxis yAxisId="flaky" orientation="right" {...axis} width={40} domain={[0, "auto"]} tickFormatter={(v: number) => `${v}%`} />
                  <Tooltip content={<Tip percent />} cursor={{ stroke: "#3f3f46" }} />
                  <Line yAxisId="pass" type="monotone" dataKey="pass" name="Pass rate" stroke={PASS} strokeWidth={2} dot={false} connectNulls />
                  <Line yAxisId="flaky" type="monotone" dataKey="flaky" name="Flaky rate" stroke={FLAKY} strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <Legend items={[{ label: "Pass rate (left axis)", color: PASS }, { label: "Flaky rate (right axis)", color: FLAKY }]} />
          </section>

          <section aria-labelledby="runs-day-heading" className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <SectionHeading id="runs-day-heading">Runs per day</SectionHeading>
            <div aria-hidden="true">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#27272a" strokeDasharray="3 3" />
                  <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis {...axis} width={32} allowDecimals={false} />
                  <Tooltip content={<Tip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <Bar dataKey="runs" name="Runs" fill={RUNS} radius={[3, 3, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
