"use client";

// Analytics' Security view: findings opened and fixed per day, fix pull
// requests opened and merged, the median time to fix by tier, and the model
// tokens Security spent per day and this month (GET /api/security/insights).

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Section } from "@/components/page";
import { StatGrid, StatTile } from "@/components/stat-tile";
import { ChartSkeleton } from "@/components/skeleton";
import { Problem } from "@/components/problem";
import { ChartCard, ChartTip, SERIES, Table, axis, shortDay } from "@/components/charts";
import { TIERS, securityApi, shortTokens, type SecurityInsights } from "@/lib/security";

function hours(h: number | null): string {
  if (h == null) return "—";
  return h < 48 ? `${Math.max(1, Math.round(h))} h` : `${Math.round(h / 24)} d`;
}

export function SecuritySection({ days }: { days: number }) {
  const [data, setData] = useState<SecurityInsights | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setError("");
    securityApi.insights(days).then(
      (d) => live && setData(d),
      (e) => live && setError(e instanceof Error ? e.message : "The request failed."),
    );
    return () => {
      live = false;
    };
  }, [days, attempt]);

  if (error) {
    return (
      <div className="mt-10">
        <Problem title="Couldn't load security insights" onRetry={() => setAttempt((n) => n + 1)} details={error}>
          The rest of Analytics is not affected.
        </Problem>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mt-10" aria-busy="true">
        <ChartSkeleton />
      </div>
    );
  }
  const t = data.totals;
  const rows = data.days.map((d) => ({ ...d, day: d.date }));
  return (
    <Section
      title="Security"
      id="security"
      description={
        <>
          Advisories found and fixed, the fix pull requests, and what Security spent. Each finding is on the{" "}
          <Link href="/security" className="underline underline-offset-4 hover:text-zinc-200">
            Security page
          </Link>
          .
        </>
      }
    >
      {!data.enabled && t.opened === 0 ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400" data-testid="security-insights-off">
          Security fixes are off, so there is nothing to show yet.
        </p>
      ) : (
        <>
          <StatGrid>
            <StatTile testId="sec-opened" label="Findings opened" value={t.opened.toLocaleString()} note={`in the last ${days} days`} />
            <StatTile testId="sec-fixed" label="Findings fixed" value={t.fixed.toLocaleString()} note={`${t.prs_merged} fix PR${t.prs_merged === 1 ? "" : "s"} merged of ${t.prs_opened} opened`} />
            <StatTile
              testId="sec-ttf"
              label="Median time to fix, P0 and P1"
              value={`${hours(data.median_hours_to_fix.P0.median_hours)} · ${hours(data.median_hours_to_fix.P1.median_hours)}`}
              note={TIERS.map((x) => `${x} ${hours(data.median_hours_to_fix[x].median_hours)}`).join(", ")}
            />
            <StatTile
              testId="sec-tokens"
              label="Security tokens this month"
              value={shortTokens(t.tokens_month + data.fix_tokens_month)}
              note={`${shortTokens(t.tokens_month)} checks, ${shortTokens(data.fix_tokens_month)} fix runs`}
            />
          </StatGrid>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Findings opened and fixed per day"
              table={<Table label="Findings per day" head={["Day", "Opened", "Fixed"]} rows={rows.map((r) => [shortDay(r.day), r.opened, r.fixed])} empty="No days." />}
            >
              <div className="h-56" role="img" aria-label="Bar chart of security findings opened and fixed per day">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows} barGap={2} barCategoryGap="20%">
                    <CartesianGrid vertical={false} stroke="#27272a" />
                    <XAxis dataKey="day" tickFormatter={shortDay} {...axis} minTickGap={24} />
                    <YAxis allowDecimals={false} width={32} {...axis} />
                    <Tooltip cursor={{ fill: "#27272a66" }} content={<ChartTip />} />
                    <Legend wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }} iconType="circle" iconSize={8} />
                    <Bar dataKey="opened" name="Opened" fill={SERIES.first} radius={[4, 4, 0, 0]} maxBarSize={18} />
                    <Bar dataKey="fixed" name="Fixed" fill={SERIES.second} radius={[4, 4, 0, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
            <ChartCard
              title="Fix PRs opened and merged per day"
              table={<Table label="Fix PRs per day" head={["Day", "Opened", "Merged"]} rows={rows.map((r) => [shortDay(r.day), r.prs_opened, r.prs_merged])} empty="No days." />}
            >
              <div className="h-56" role="img" aria-label="Bar chart of security fix pull requests opened and merged per day">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows} barGap={2} barCategoryGap="20%">
                    <CartesianGrid vertical={false} stroke="#27272a" />
                    <XAxis dataKey="day" tickFormatter={shortDay} {...axis} minTickGap={24} />
                    <YAxis allowDecimals={false} width={28} {...axis} />
                    <Tooltip cursor={{ fill: "#27272a66" }} content={<ChartTip />} />
                    <Legend wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }} iconType="circle" iconSize={8} />
                    <Bar dataKey="prs_opened" name="Opened" fill={SERIES.first} radius={[4, 4, 0, 0]} maxBarSize={18} />
                    <Bar dataKey="prs_merged" name="Merged" fill={SERIES.second} radius={[4, 4, 0, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
            <ChartCard
              title="Security check tokens per day"
              table={<Table label="Security tokens per day" head={["Day", "Tokens"]} rows={rows.map((r) => [shortDay(r.day), shortTokens(r.tokens)])} empty="No days." />}
            >
              {rows.every((r) => !r.tokens) ? (
                <div className="flex h-56 items-center justify-center text-sm text-zinc-400">No security checks used the model in this period.</div>
              ) : (
                <div className="h-56" role="img" aria-label="Bar chart of security check tokens per day">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rows} barCategoryGap="20%">
                      <CartesianGrid vertical={false} stroke="#27272a" />
                      <XAxis dataKey="day" tickFormatter={shortDay} {...axis} minTickGap={24} />
                      <YAxis width={44} tickFormatter={(v: number) => shortTokens(v)} {...axis} />
                      <Tooltip cursor={{ fill: "#27272a66" }} content={<ChartTip format={(v) => `${shortTokens(v)} tokens`} />} />
                      <Bar dataKey="tokens" name="Tokens" fill={SERIES.first} radius={[4, 4, 0, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
            <ChartCard
              title="Median time to fix by tier"
              table={<Table label="Time to fix by tier" head={["Tier", "Fixed", "Median"]} rows={TIERS.map((x) => [x, data.median_hours_to_fix[x].fixed, hours(data.median_hours_to_fix[x].median_hours)])} empty="Nothing fixed yet." />}
            >
              <div className="h-56" role="img" aria-label="Bar chart of the median hours to fix per tier">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={TIERS.map((x) => ({ tier: x, hours: data.median_hours_to_fix[x].median_hours ?? 0 }))} barCategoryGap="30%">
                    <CartesianGrid vertical={false} stroke="#27272a" />
                    <XAxis dataKey="tier" {...axis} />
                    <YAxis width={36} tickFormatter={(v: number) => hours(v)} {...axis} />
                    <Tooltip cursor={{ fill: "#27272a66" }} content={<ChartTip labelFormat={(l) => l} format={(v) => hours(v)} />} />
                    <Bar dataKey="hours" name="Median" fill={SERIES.first} radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>
        </>
      )}
    </Section>
  );
}
