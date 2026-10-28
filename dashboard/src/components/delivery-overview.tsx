"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { endpointHref } from "@/lib/webhooks";
import { api, type DeliveryAnalytics, type DeliveryEndpointRow, type DeliveryPeriod, type DeliveryPoint } from "@/lib/api";
import { ChartCard, ChartTip, SERIES, Table, axis } from "./charts";
import { Callout } from "./callout";
import { FilterSelect } from "./data-source-activity";
import { EmptyState } from "./empty-state";
import { RepeatIcon } from "./icons";
import { Chip, formatDate, formatMs, timeAgo, type Tone } from "./list";
import { Section } from "./page";
import { Problem } from "./problem";
import { Segmented } from "./segmented";
import { CardSkeleton, ChartSkeleton } from "./skeleton";
import { StatGrid, StatTile } from "./stat-tile";
import { buttonClass, focusRing } from "./ui";
import { sourceName } from "./deliveries";

// ── Words ───────────────────────────────────────────────────────────

export const PERIODS: { value: DeliveryPeriod; label: string; vs: string }[] = [
  { value: "24h", label: "24 hours", vs: "the previous 24 hours" },
  { value: "7d", label: "7 days", vs: "the previous 7 days" },
  { value: "30d", label: "30 days", vs: "the previous 30 days" },
];

/** The status choices the overview offers: the list's, less Retrying (a retry counts once it finishes). */
const STATUSES = [
  { value: "all", label: "All" },
  { value: "failed", label: "Failed" },
  { value: "handled", label: "Handled" },
  { value: "ignored", label: "Ignored" },
] as const;

const count = (v: number) => v.toLocaleString();

export function rateText(rate: number | null | undefined): string {
  if (rate == null) return "None yet";
  const pct = rate * 100;
  return `${pct >= 99.95 || pct === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

const msText = (ms: number | null | undefined) => (ms == null ? "Not timed" : formatMs(ms));

/** The change against the period before, in words: "12% more than the previous 7 days". */
export function changeWords(cur: number | null, prev: number | null, kind: "count" | "rate" | "latency", vs: string): string {
  if (cur == null || prev == null) return `Nothing to compare with ${vs}`;
  if (kind === "rate") {
    const pts = Math.round((cur - prev) * 1000) / 10;
    if (pts === 0) return `Same as ${vs}`;
    return `${Math.abs(pts)} pts ${pts > 0 ? "higher" : "lower"} than ${vs}`;
  }
  if (prev === 0) return cur === 0 ? `Same as ${vs}` : `None in ${vs}`;
  const change = Math.round(((cur - prev) / prev) * 100);
  if (change === 0) return `Same as ${vs}`;
  if (kind === "latency") return `${Math.abs(change)}% ${change > 0 ? "slower" : "faster"} than ${vs}`;
  return `${Math.abs(change)}% ${change > 0 ? "more" : "fewer"} than ${vs}`;
}

/** A bucket's label on the axis: "14:00" by hour, "Oct 24" by day. */
function bucketLabel(iso: string, hourly: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return hourly
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export interface OverviewFilters {
  period: string;
  source: string;
  status: string;
  endpoint: string;
}

/** The Deliveries list, narrowed: every chart element links to one of these. */
export function listHref(f: { source?: string; status?: string; from?: string; until?: string; endpoint?: string; reason?: string; q?: string }): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v && v !== "all") q.set(k, v);
  const s = q.toString();
  return `/settings/deliveries/${s ? `?${s}` : ""}`;
}

function endpointName(e: DeliveryEndpointRow): string {
  if (e.description) return e.description;
  if (e.url) {
    try {
      return new URL(e.url).host;
    } catch {
      return e.url;
    }
  }
  return e.deleted ? "Deleted endpoint" : e.id;
}

function endpointState(e: DeliveryEndpointRow): { label: string; tone: Tone } {
  if (e.deleted) return { label: "Deleted", tone: "muted" };
  if (!e.enabled) return e.disabled_reason === "failing" ? { label: "Off: kept failing", tone: "danger" } : { label: "Off", tone: "muted" };
  if (e.streak > 0) return { label: `Failing (${e.streak} in a row)`, tone: "danger" };
  return { label: "On", tone: "success" };
}

const textLink = `rounded text-zinc-100 underline-offset-2 hover:underline ${focusRing}`;

// ── The overview ────────────────────────────────────────────────────

/** Settings, then Deliveries, then Overview: how deliveries went over a period, against the one before. */
export function DeliveryOverview({ filters, onFilters }: { filters: OverviewFilters; onFilters: (patch: Partial<OverviewFilters>) => void }) {
  const period = (PERIODS.find((p) => p.value === filters.period)?.value ?? "7d") as DeliveryPeriod;
  const status = (STATUSES.find((s) => s.value === filters.status)?.value ?? "all") as (typeof STATUSES)[number]["value"];
  const { source, endpoint } = filters;
  const [data, setData] = useState<DeliveryAnalytics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.getDeliveryAnalytics({
        period,
        source: source === "all" ? undefined : source,
        status: status === "all" ? undefined : status,
        endpoint: endpoint || undefined,
      });
      setData(r);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setLoading(false);
    }
  }, [period, source, status, endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtering = source !== "all" || status !== "all" || !!endpoint;
  const clear = () => onFilters({ source: "all", status: "all", endpoint: "" });
  const sources = [...new Set([...(data?.seen_sources ?? []), ...(source !== "all" ? [source] : [])])].sort((a, b) => sourceName(a).localeCompare(sourceName(b)));

  return (
    <div className="min-w-0" data-testid="delivery-overview">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Segmented label="Period" options={PERIODS.map((p) => ({ value: p.value, label: p.label }))} value={period} onChange={(v) => onFilters({ period: v })} />
        <Segmented label="Show" options={STATUSES.map((s) => ({ value: s.value, label: s.label }))} value={status} onChange={(v) => onFilters({ status: v })} />
        <FilterSelect
          label="Source"
          value={source}
          onChange={(v) => onFilters({ source: v, endpoint: v === "all" || v === "webhook" ? endpoint : "" })}
          options={[{ value: "all", label: "All sources" }, ...sources.map((s) => ({ value: s, label: sourceName(s) }))]}
        />
        {(data?.endpoints.length ?? 0) > 0 || endpoint ? (
          <FilterSelect
            label="Endpoint"
            value={endpoint}
            onChange={(v) => onFilters({ endpoint: v })}
            options={[
              { value: "", label: "All endpoints" },
              ...(data?.endpoints ?? []).map((e) => ({ value: e.id, label: endpointName(e) })),
              ...(endpoint && !data?.endpoints.some((e) => e.id === endpoint) ? [{ value: endpoint, label: endpoint }] : []),
            ]}
          />
        ) : null}
        {filtering && (
          <button type="button" onClick={clear} className={buttonClass("ghost", "sm")} data-testid="overview-clear">
            Clear filters
          </button>
        )}
      </div>

      {error ? (
        <div className="mt-6">
          <Problem title="Couldn't load the overview" onRetry={() => void load()} details={error}>
            Nothing was changed. Check your connection and try again.
          </Problem>
        </div>
      ) : !data ? (
        <div className="mt-6 space-y-4" aria-busy="true" aria-label="Loading the overview">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <CardSkeleton key={i} />)}
          </div>
          <ChartSkeleton />
        </div>
      ) : (
        <div className={loading ? "opacity-60 transition-opacity motion-reduce:transition-none" : ""}>
          <Body data={data} filters={{ ...filters, period, status }} filtering={filtering} onClear={clear} />
        </div>
      )}
    </div>
  );
}

function Body({ data, filters, filtering, onClear }: { data: DeliveryAnalytics; filters: OverviewFilters; filtering: boolean; onClear: () => void }) {
  const router = useRouter();
  const s = data.summary;
  const p = data.previous;
  const vs = PERIODS.find((x) => x.value === data.period)?.vs ?? "the period before";
  const hourly = data.granularity === "hour";
  const base = {
    source: filters.source,
    status: filters.status,
    endpoint: filters.endpoint,
  };
  const whole = { ...base, from: data.from, until: data.to };
  const bucketHref = (pt: DeliveryPoint, extra: { status?: string } = {}) => listHref({ ...base, ...extra, from: pt.start, until: pt.end });
  const nothing = s.deliveries === 0 && p.deliveries === 0;
  const span = `the last ${PERIODS.find((x) => x.value === data.period)?.label ?? data.period}`;
  const olderThanRecords = data.period === "30d";

  const notes = (
    <>
      {!data.backfill.complete && (
        <div className="mt-4">
          <Callout variant="info" title="Counting older deliveries" testId="overview-backfill">
            Deliveries from before this overview existed are still being added up, so these numbers grow for a few minutes. Reload to see the rest.
          </Callout>
        </div>
      )}
    </>
  );

  if (nothing) {
    return (
      <>
        {notes}
        <div className="mt-6">
          {filtering ? (
            <EmptyState testId="overview-empty" icon={<RepeatIcon />} title="No deliveries match these filters" onClear={onClear}>
              Nothing with these filters finished in {span} or the period before. Try another source or status, or a longer period.
            </EmptyState>
          ) : (
            <EmptyState
              testId="overview-empty"
              icon={<RepeatIcon />}
              title={`No deliveries in ${span}`}
              action={<Link href="/settings/integrations" className={buttonClass("secondary")}>Check your integrations</Link>}
            >
              This overview counts every webhook GitHub, Jira and your alerts send to Coderhelm, every event it relays, and every message it sends to your webhook endpoints, Slack, Teams or email. Counts appear as deliveries finish, and are kept for {data.kept_days} days.
            </EmptyState>
          )}
        </div>
      </>
    );
  }

  const failedTone = s.failed > 0 ? "danger" : "neutral";
  const rateTone = s.success_rate == null ? "neutral" : s.success_rate >= 0.95 ? "success" : s.success_rate >= 0.8 ? "warning" : "danger";
  const series = data.series.map((pt) => ({ ...pt, label: pt.start, rate: pt.success_rate == null ? null : Math.round(pt.success_rate * 1000) / 10 }));
  const maxReason = Math.max(1, ...data.reasons.map((r) => r.count));
  const tipLabel = (iso: string) => (hourly ? `${formatDate(iso, { time: true })}` : bucketLabel(iso, false));
  const open = (pt: DeliveryPoint | undefined, extra: { status?: string } = {}) => {
    if (pt && (pt.deliveries > 0 || pt.previous_deliveries > 0)) router.push(bucketHref(pt, extra));
  };
  type Click = { activePayload?: { payload?: DeliveryPoint }[]; activeIndex?: number | string | null; activeTooltipIndex?: number | string | null };
  const clicked = (e: unknown): DeliveryPoint | undefined => {
    const c = e as Click | null;
    const i = Number(c?.activeTooltipIndex ?? c?.activeIndex);
    return c?.activePayload?.[0]?.payload ?? (Number.isFinite(i) ? data.series[i] : undefined);
  };

  return (
    <>
      {notes}
      <section aria-label={`Compared with ${vs}`} className="mt-5" data-testid="overview-tiles">
        <StatGrid>
          <StatTile
            testId="tile-success"
            label="Success rate"
            value={rateText(s.success_rate)}
            tone={rateTone}
            delta={{ text: changeWords(s.success_rate, p.success_rate, "rate", vs), tone: "flat" }}
            note={s.deliveries ? `${count(s.handled + s.ignored)} of ${count(s.deliveries)} went fine` : undefined}
            href={listHref(whole)}
          />
          <StatTile
            testId="tile-deliveries"
            label="Deliveries"
            value={count(s.deliveries)}
            delta={{ text: changeWords(s.deliveries, p.deliveries, "count", vs), tone: "flat" }}
            note={s.retried ? `${count(s.retried)} needed a retry, ${count(s.retried_ok)} then went fine` : "None needed a retry"}
            href={listHref(whole)}
          />
          <StatTile
            testId="tile-failures"
            label="Failures"
            value={count(s.failed)}
            tone={failedTone}
            delta={{ text: changeWords(s.failed, p.failed, "count", vs), tone: "flat" }}
            note={data.reasons[0] ? `Most often: ${data.reasons[0].message}` : "None in this period"}
            href={listHref({ ...whole, status: "failed" })}
          />
          <StatTile
            testId="tile-latency"
            label="Slowest 5% took"
            value={msText(s.p95_ms)}
            delta={{ text: changeWords(s.p95_ms, p.p95_ms, "latency", vs), tone: "flat" }}
            note={s.p50_ms != null ? `Typical ${formatMs(s.p50_ms)}, slowest 1% ${msText(s.p99_ms)}` : "No timed deliveries"}
          />
        </StatGrid>
        {s.deliveries > 0 && s.deliveries < 20 && (
          <p className="mt-3 text-xs text-zinc-400" data-testid="overview-low-data">
            Only {count(s.deliveries)} {s.deliveries === 1 ? "delivery" : "deliveries"} in this period, so a single failure moves the success rate a lot.
          </p>
        )}
      </section>

      <div className="mt-6 grid min-w-0 gap-4 lg:grid-cols-2">
        <ChartCard
          title={hourly ? "Deliveries per hour" : "Deliveries per day"}
          table={
            <Table
              label="Deliveries over time"
              head={[hourly ? "Hour" : "Day", "Went fine", "Failed", "Previous"]}
              rows={data.series.map((pt) => [
                <Link key={pt.start} href={bucketHref(pt)} className={textLink}>{tipLabel(pt.start)}</Link>,
                count(pt.ok),
                pt.failed ? <Link key="f" href={bucketHref(pt, { status: "failed" })} className={textLink}>{count(pt.failed)}</Link> : "0",
                count(pt.previous_deliveries),
              ])}
              empty="No deliveries."
            />
          }
        >
          <div className="h-56 cursor-pointer" role="img" aria-label={`Bar chart of deliveries per ${hourly ? "hour" : "day"}, fine and failed. Select a bar to list its deliveries; Show table has the same numbers as links.`} data-testid="chart-volume">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} barCategoryGap="20%" onClick={(e: unknown) => open(clicked(e))}>
                <CartesianGrid vertical={false} stroke="#27272a" />
                <XAxis dataKey="label" tickFormatter={(v: string) => bucketLabel(v, hourly)} {...axis} minTickGap={24} />
                <YAxis allowDecimals={false} width={32} {...axis} />
                <Tooltip cursor={{ fill: "#27272a66" }} content={<ChartTip labelFormat={tipLabel} />} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }} iconType="circle" iconSize={8} />
                <Bar dataKey="ok" name="Went fine" stackId="d" fill={SERIES.first} maxBarSize={18} />
                <Bar dataKey="failed" name="Failed" stackId="d" fill={SERIES.second} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard
          title="Success rate"
          table={
            <Table
              label="Success rate over time"
              head={[hourly ? "Hour" : "Day", "Success rate", "Slowest 5%"]}
              rows={data.series.map((pt) => [
                <Link key={pt.start} href={bucketHref(pt)} className={textLink}>{tipLabel(pt.start)}</Link>,
                rateText(pt.success_rate),
                msText(pt.p95_ms),
              ])}
              empty="No deliveries."
            />
          }
        >
          {series.every((x) => x.rate == null) ? (
            <div className="flex h-56 items-center justify-center text-center text-sm text-zinc-400" data-testid="rate-empty">Nothing finished in this period, so there is no rate to show.</div>
          ) : (
            <div className="h-56 cursor-pointer" role="img" aria-label="Line chart of the success rate. Select a point to list its deliveries; Show table has the same numbers as links." data-testid="chart-rate">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} onClick={(e: unknown) => open(clicked(e))}>
                  <CartesianGrid vertical={false} stroke="#27272a" />
                  <XAxis dataKey="label" tickFormatter={(v: string) => bucketLabel(v, hourly)} {...axis} minTickGap={24} />
                  <YAxis width={40} domain={[(min: number) => Math.max(0, Math.floor(Math.min(min, 90) / 10) * 10), 100]} tickFormatter={(v: number) => `${v}%`} {...axis} />
                  <Tooltip cursor={{ stroke: "#3f3f46" }} content={<ChartTip labelFormat={tipLabel} format={(v) => `${v}%`} />} />
                  <Line type="monotone" dataKey="rate" name="Success rate" stroke={SERIES.first} strokeWidth={2} dot={{ r: 2.5, fill: SERIES.first }} activeDot={{ r: 5 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>
      {olderThanRecords && (
        <p className="mt-3 text-xs text-zinc-400" data-testid="overview-records-note">
          Counts are kept {data.kept_days} days; each delivery&apos;s own record is kept {data.records_kept_days}, so a day older than that opens an empty list.
        </p>
      )}

      <Section title="Failures by reason" id="reasons" description={data.reasons.length ? "What went wrong, in plain words, with the fix. Open one to list those deliveries." : undefined}>
        {data.reasons.length === 0 ? (
          <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400" data-testid="reasons-empty">
            No failures in {span}.
          </p>
        ) : (
          <ul className="min-w-0 divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900/30" data-testid="reasons">
            {data.reasons.map((r) => (
              <li key={r.code} className="min-w-0">
                <Link
                  href={listHref({ ...whole, status: "failed", reason: r.code })}
                  data-testid="reason-row"
                  data-code={r.code}
                  className={`block min-w-0 px-4 py-3 transition-colors hover:bg-zinc-800/40 motion-reduce:transition-none ${focusRing}`}
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-medium text-zinc-100">{r.message}</p>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-100">{count(r.count)}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(3, (r.count / maxReason) * 100)}%`, background: SERIES.second }} />
                  </div>
                  <p className="mt-2 text-xs text-zinc-400">{r.fix}</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    {r.sources.map(sourceName).join(", ")} · {r.previous_count ? `${count(r.previous_count)} in ${vs}` : `none in ${vs}`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {data.endpoints.length > 0 && (
        <Section title="Webhook endpoints" id="endpoints" description="Each endpoint your team's events go to. Open one to change it, or list its deliveries.">
          <Table
            label="Webhook endpoints"
            head={["Endpoint", "Success rate", "Slowest 5%", "Last failure"]}
            grow={[3]}
            rows={data.endpoints.map((e) => {
              const st = endpointState(e);
              return [
                <span key={e.id} className="block min-w-0" data-testid="endpoint-row" data-id={e.id}>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    {e.deleted ? (
                      <span className="text-zinc-300">{endpointName(e)}</span>
                    ) : (
                      <Link href={endpointHref(e.id)} className={textLink} data-testid="endpoint-link">{endpointName(e)}</Link>
                    )}
                    <Chip tone={st.tone}>{st.label}</Chip>
                  </span>
                  {e.url && e.description && <span className="mt-0.5 block text-xs text-zinc-400 wrap-anywhere">{e.url}</span>}
                </span>,
                <span key="rate" className="block whitespace-nowrap">
                  {rateText(e.success_rate)}
                  <Link href={listHref({ ...whole, source: "webhook", endpoint: e.id })} className={`${textLink} block text-xs text-zinc-400`} data-testid="endpoint-deliveries" aria-label={`${count(e.deliveries)} deliveries to ${endpointName(e)}`}>
                    {e.deliveries ? `of ${count(e.deliveries)}` : "No deliveries"}
                  </Link>
                </span>,
                msText(e.p95_ms),
                e.last_failure_at ? (
                  <span key="lf" className="block min-w-0 text-xs text-zinc-300" title={`${formatDate(e.last_failure_at, { time: true })}${e.last_failure_message ? `: ${e.last_failure_message}` : ""}`}>
                    {timeAgo(e.last_failure_at)}
                    {e.last_failure_message ? `: ${e.last_failure_message}` : ""}
                  </span>
                ) : (
                  "None"
                ),
              ];
            })}
            empty="No endpoints."
          />
        </Section>
      )}

      <div className="min-w-0">
        <Section title="By source" id="sources">
          <Table
            label="By source"
            head={["Source", "Deliveries", "Success rate"]}
            rows={data.sources.map((r) => [
              <span key={`${r.source}-${r.direction}`} className="block min-w-0">
                <Link href={listHref({ ...whole, source: r.source })} className={textLink} data-testid="source-link">{sourceName(r.source)}</Link>
                <span className="block text-xs text-zinc-400">
                  {r.direction === "inbound" ? "Received" : "Sent"} · slowest 5% {msText(r.p95_ms)} · {changeWords(r.deliveries, r.previous_deliveries, "count", vs)}
                </span>
              </span>,
              count(r.deliveries),
              rateText(r.success_rate),
            ])}
            empty={`No deliveries in ${span}.`}
          />
        </Section>
        <Section title="Failing most" id="events" description={data.events.length ? "The event types that failed most often." : undefined}>
          <Table
            label="Event types that failed most"
            head={["Event", "Failed"]}
            rows={data.events.map((e) => [
              <span key={`${e.source}-${e.event}`} className="block min-w-0">
                <Link href={listHref({ ...whole, source: e.source, status: "failed", q: e.event })} className={`${textLink} wrap-anywhere`} data-testid="event-link">{e.event}</Link>
                <span className="block text-xs text-zinc-400">{sourceName(e.source)}</span>
              </span>,
              count(e.failed),
            ])}
            empty={`No failures in ${span}.`}
          />
        </Section>
      </div>
    </>
  );
}
