"use client";

import { useEffect, useState } from "react";
import { api, type Stats, type MonthStats } from "@/lib/api";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CardSkeleton, ChartSkeleton } from "@/components/skeleton";

const COLORS = {
  green: { stroke: "#22c55e", fill: "url(#greenGrad)" },
  red: { stroke: "#ef4444", fill: "url(#redGrad)" },
  purple: { stroke: "#a78bfa", fill: "url(#purpleGrad)" },
  blue: { stroke: "#60a5fa", fill: "url(#blueGrad)" },
  cyan: { stroke: "#22d3ee", fill: "url(#cyanGrad)" },
};

function GradientDefs() {
  return (
    <defs>
      {[
        ["greenGrad", "#22c55e"],
        ["redGrad", "#ef4444"],
        ["purpleGrad", "#a78bfa"],
        ["blueGrad", "#60a5fa"],
        ["cyanGrad", "#22d3ee"],
      ].map(([id, color]) => (
        <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      ))}
    </defs>
  );
}

// eslint-disable-next-line
function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/90 backdrop-blur-sm px-3 py-2 shadow-xl">
      <p className="text-[11px] text-zinc-500 mb-1">{label}</p>
      {payload.map((entry: { name: string; value: number; color: string }) => (
        <div key={entry.name} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-zinc-400">{entry.name}</span>
          <span className="ml-auto font-medium text-zinc-200">
            {formatter ? formatter(entry.value as number, entry.name as string) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

const axisProps = {
  stroke: "transparent",
  tick: { fill: "#52525b", fontSize: 11 },
  tickLine: false,
  axisLine: false,
};

export default function AnalyticsPage() {
  const [stats, setStats] = useState<{ month: Stats; all_time: Stats } | null>(null);
  const [history, setHistory] = useState<MonthStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getStats(), api.getStatsHistory()])
      .then(([s, h]) => {
        setStats(s);
        setHistory(h.months);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Analytics</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton />
          <CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartSkeleton /><ChartSkeleton /><ChartSkeleton /><ChartSkeleton />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Analytics</h1>
        <p className="text-zinc-500">Unable to load analytics.</p>
      </div>
    );
  }

  const { month, all_time } = stats;

  const chartData = history.map((m) => ({
    ...m,
    label: new Date(m.period + "-01").toLocaleDateString("en", { month: "short" }),
    tokens: m.total_tokens_in + m.total_tokens_out,
    merge_rate: m.total_runs > 0 ? (m.completed / m.total_runs) * 100 : 0,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Analytics</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Runs this month" value={month.total_runs} />
        <KpiCard label="Merge rate" value={`${(month.merge_rate * 100).toFixed(0)}%`} />
        <KpiCard label="Cost this month" value={`$${month.total_cost_usd.toFixed(2)}`} />
        <KpiCard label="Tokens this month" value={formatNumber(month.total_tokens_in + month.total_tokens_out)} />
        <KpiCard label="All-time runs" value={all_time.total_runs} />
        <KpiCard label="All-time merge rate" value={`${(all_time.merge_rate * 100).toFixed(0)}%`} />
        <KpiCard label="All-time cost" value={`$${all_time.total_cost_usd.toFixed(2)}`} />
        <KpiCard label="All-time tokens" value={formatNumber(all_time.total_tokens_in + all_time.total_tokens_out)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Runs per month">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} barGap={2}>
              <GradientDefs />
              <CartesianGrid vertical={false} stroke="#27272a" strokeDasharray="3 3" />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} allowDecimals={false} width={32} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar dataKey="completed" name="Completed" fill={COLORS.green.stroke} radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="failed" name="Failed" fill={COLORS.red.stroke} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
          <Legend items={[{ label: "Completed", color: COLORS.green.stroke }, { label: "Failed", color: COLORS.red.stroke }]} />
        </ChartCard>

        <ChartCard title="Cost per month">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData}>
              <GradientDefs />
              <CartesianGrid vertical={false} stroke="#27272a" strokeDasharray="3 3" />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} width={40} tickFormatter={(v: number) => `$${v}`} />
              <Tooltip content={<ChartTooltip formatter={(v: number) => `$${v.toFixed(2)}`} />} cursor={{ stroke: "#3f3f46" }} />
              <Area type="monotone" dataKey="total_cost_usd" name="Cost" stroke={COLORS.purple.stroke} fill={COLORS.purple.fill} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Tokens per month">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData}>
              <GradientDefs />
              <CartesianGrid vertical={false} stroke="#27272a" strokeDasharray="3 3" />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} width={40} tickFormatter={formatNumber} />
              <Tooltip content={<ChartTooltip formatter={(v: number) => formatNumber(v)} />} cursor={{ stroke: "#3f3f46" }} />
              <Area type="monotone" dataKey="total_tokens_in" name="Input" stroke={COLORS.blue.stroke} fill={COLORS.blue.fill} strokeWidth={2} stackId="tokens" />
              <Area type="monotone" dataKey="total_tokens_out" name="Output" stroke={COLORS.cyan.stroke} fill={COLORS.cyan.fill} strokeWidth={2} stackId="tokens" />
            </AreaChart>
          </ResponsiveContainer>
          <Legend items={[{ label: "Input", color: COLORS.blue.stroke }, { label: "Output", color: COLORS.cyan.stroke }]} />
        </ChartCard>

        <ChartCard title="Merge rate trend">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData}>
              <GradientDefs />
              <CartesianGrid vertical={false} stroke="#27272a" strokeDasharray="3 3" />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} width={36} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip content={<ChartTooltip formatter={(v: number) => `${v.toFixed(0)}%`} />} cursor={{ stroke: "#3f3f46" }} />
              <Area type="monotone" dataKey="merge_rate" name="Merge rate" stroke={COLORS.green.stroke} fill={COLORS.green.fill} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg">
      <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-lg">
      <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex items-center gap-4 mt-3 ml-1">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
          {item.label}
        </div>
      ))}
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
