"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  api,
  type DeliveriesReply,
  type DeliveryDetailReply,
  type DeliveryRow,
  type DeliveryStatus,
  type DeliveryStatusFilter,
} from "@/lib/api";
import { HYBRID_HREF } from "@/lib/hybrid";
import { endpointHref } from "@/lib/webhooks";
import { Callout } from "./callout";
import { CodeBlock } from "./code-block";
import { CopyButton } from "./copy-button";
import { Drawer } from "./drawer";
import { EmptyState } from "./empty-state";
import { FilterSelect } from "./data-source-activity";
import { AtlassianIcon, BellIcon, ChatIcon, CloudIcon, GitHubIcon, MailIcon, PluginIcon, RepeatIcon, RetryIcon, SendIcon } from "./icons";
import { Chip, ListEmpty, ListError, ListSkeleton, ListToolbar, StatusDot, TONES, formatDate, formatMs, statusWords, timeAgo, type Tone } from "./list";
import { SectionHeading } from "./page";
import { Code } from "./settings/code";
import { Skeleton } from "./skeleton";
import { StatGrid, StatTile } from "./stat-tile";
import { useConfirm } from "./confirm-dialog";
import { useToast } from "./toast";
import { buttonClass, focusRing, linkButton, primaryButton } from "./ui";

// ── Words and looks ─────────────────────────────────────────────────

const SOURCE_NAME: Record<string, string> = {
  github: "GitHub",
  relay: "Relay",
  broker: "Broker",
  jira: "Jira",
  alerts: "Alerts",
  slack: "Slack",
  teams: "Teams",
  email: "Email",
  hybrid: "Hybrid",
  webhook: "Webhook",
};

export function sourceName(source: string): string {
  return SOURCE_NAME[source] ?? statusWords(source);
}

function SourceIcon({ source }: { source: string }) {
  const icon: Record<string, ReactNode> = {
    github: <GitHubIcon />,
    jira: <AtlassianIcon />,
    alerts: <BellIcon />,
    email: <MailIcon />,
    slack: <ChatIcon />,
    teams: <ChatIcon />,
    relay: <RepeatIcon />,
    broker: <CloudIcon />,
    hybrid: <CloudIcon />,
    webhook: <SendIcon />,
  };
  return (
    <span aria-hidden="true" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-300 [&_svg]:h-3.5 [&_svg]:w-3.5">
      {icon[source] ?? <PluginIcon />}
    </span>
  );
}

const STATUS_LOOK: Record<DeliveryStatus, { label: string; tone: Tone }> = {
  handled: { label: "Handled", tone: "success" },
  ignored: { label: "Ignored", tone: "muted" },
  pending: { label: "Retrying", tone: "waiting" },
  failed: { label: "Failed", tone: "danger" },
  received: { label: "Received", tone: "info" },
};

/** "14:32": a retry later today; the date too when it isn't today. */
function clock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : formatDate(iso, { time: true });
}

export function DeliveryStatusChip({ status, nextRetry }: { status: DeliveryStatus; nextRetry?: string | null }) {
  const look = STATUS_LOOK[status] ?? { label: statusWords(status), tone: "neutral" as Tone };
  return (
    <span className="inline-flex min-w-0 flex-col items-start gap-0.5" data-status={status}>
      <Chip tone={look.tone}>{look.label}</Chip>
      {status === "pending" && nextRetry && <span className="whitespace-nowrap text-xs text-amber-300/90">at {clock(nextRetry)}</span>}
    </span>
  );
}

/** "pull_request.opened" stays as GitHub writes it; the direction says which way it went. */
function directionWord(d: DeliveryRow["direction"]): string {
  return d === "outbound" ? "Sent" : "Received";
}

const RANGES = [
  { value: "1h", label: "Last hour", ms: 3_600_000 },
  { value: "24h", label: "Last 24 hours", ms: 86_400_000 },
  { value: "7d", label: "Last 7 days", ms: 7 * 86_400_000 },
  { value: "14d", label: "Last 14 days", ms: 14 * 86_400_000 },
] as const;
export type DeliveryRange = (typeof RANGES)[number]["value"];
export const DEFAULT_RANGE: DeliveryRange = "14d";

/** The `since` a range asks for; none for the default (everything kept). */
export function sinceFor(range: string, now = Date.now()): string | undefined {
  if (range === DEFAULT_RANGE) return undefined;
  const r = RANGES.find((x) => x.value === range);
  return r ? new Date(now - r.ms).toISOString().replace(/\.\d{3}Z$/, "Z") : undefined;
}

const STATUS_OPTIONS: { value: DeliveryStatusFilter; label: string; tone?: Tone }[] = [
  { value: "all", label: "All" },
  { value: "failed", label: "Failed", tone: "danger" },
  { value: "pending", label: "Retrying", tone: "waiting" },
  { value: "handled", label: "Handled", tone: "success" },
  { value: "ignored", label: "Ignored", tone: "muted" },
];

export interface DeliveryFilters {
  source: string;
  status: string;
  range: string;
  q: string;
  /** One hour or day from the overview (RFC 3339, `until` exclusive); replaces `range`. */
  from?: string;
  until?: string;
  /** One webhook endpoint, or one failure reason, from the overview. */
  endpoint?: string;
  reason?: string;
}

/** "Oct 24, 10:00 to 11:00", or "Oct 24" for a whole day. */
export function windowWords(from: string, until: string): string {
  const a = new Date(from);
  const b = new Date(until);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "the chosen time";
  const day = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const hours = (b.getTime() - a.getTime()) / 3_600_000;
  if (hours >= 23.5 && hours <= 24.5 && a.getHours() === 0) return day(a);
  return `${day(a)}, ${time(a)} to ${time(b)}`;
}

// ── The list ────────────────────────────────────────────────────────

/** How often the list refreshes by itself while the tab is visible. */
const REFRESH_MS = 30_000;

export function Deliveries({
  filters,
  onFilters,
  openId,
  onOpen,
}: {
  filters: DeliveryFilters;
  onFilters: (patch: Partial<DeliveryFilters>, opts?: { replace?: boolean }) => void;
  openId: string;
  onOpen: (id: string) => void;
}) {
  const [data, setData] = useState<DeliveriesReply | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const { source, status, range, q } = filters;
  const from = filters.from ?? "";
  const until = filters.until ?? "";
  const endpoint = filters.endpoint ?? "";
  const reason = filters.reason ?? "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.listDeliveries({
        source: source === "all" ? undefined : source,
        status: status === "all" ? undefined : (status as DeliveryStatusFilter),
        since: from || sinceFor(range),
        until: from ? until || undefined : undefined,
        q: q.trim() || undefined,
        endpoint: endpoint || undefined,
        reason: reason || undefined,
        limit: 200,
      });
      setData(r);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setLoading(false);
    }
  }, [source, status, range, q, from, until, endpoint, reason]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    const t = window.setInterval(tick, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [load]);

  const rows = data?.deliveries ?? [];
  const sources = useMemo(() => {
    const all = new Set(data?.sources ?? []);
    if (source !== "all") all.add(source);
    return [...all].sort((a, b) => sourceName(a).localeCompare(sourceName(b)));
  }, [data?.sources, source]);
  const narrowed = !!from || !!endpoint || !!reason;
  const filtering = source !== "all" || status !== "all" || range !== DEFAULT_RANGE || !!q || narrowed;
  const clear = () => onFilters({ source: "all", status: "all", range: DEFAULT_RANGE, q: "", from: "", until: "", endpoint: "", reason: "" });
  const retention = data?.retention_days ?? 14;

  return (
    <div className="min-w-0">
      {data?.sharing?.available && <SharingNote enabled={data.sharing.enabled} payloads={data.sharing.payloads} />}
      {data ? <Health data={data} /> : !error && <HealthSkeleton />}

      <section aria-labelledby="deliveries-heading" className="mt-8 min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SectionHeading id="deliveries-heading" count={data ? rows.length : undefined}>Deliveries</SectionHeading>
          <button type="button" onClick={() => void load()} disabled={loading} className={`${buttonClass("ghost", "sm")} gap-1.5`} data-testid="deliveries-refresh">
            <span aria-hidden="true" className={loading ? "animate-spin motion-reduce:animate-none" : ""}><RetryIcon /></span>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {(rows.length > 0 || filtering || !data) && (
        <>
        <ListToolbar
          search={{
            value: q,
            onChange: (v) => onFilters({ q: v }, { replace: true }),
            placeholder: "Search by id, repository or PR number",
            label: "Search deliveries",
          }}
          status={{
            label: "Show",
            value: status,
            onChange: (v) => onFilters({ status: v }),
            options: STATUS_OPTIONS,
          }}
          onClear={filtering ? clear : undefined}
        />
        <div className="mb-3 mt-2 flex min-w-0 flex-wrap items-center gap-2">
          <FilterSelect label="Source" value={source} onChange={(v) => onFilters({ source: v })}>
            <option value="all">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>{sourceName(s)}</option>
            ))}
          </FilterSelect>
          {!from && (
            <FilterSelect label="Time range" value={range} onChange={(v) => onFilters({ range: v })}>
              {RANGES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </FilterSelect>
          )}
        </div>
        {narrowed && (
          <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2" data-testid="deliveries-narrowed">
            {from && (
              <NarrowChip label={`Time: ${windowWords(from, until)}`} onClear={() => onFilters({ from: "", until: "" })} testId="narrow-time" />
            )}
            {endpoint && <NarrowChip label={`Endpoint: ${endpoint}`} onClear={() => onFilters({ endpoint: "" })} testId="narrow-endpoint" />}
            {reason && <NarrowChip label={`Reason: ${statusWords(reason)}`} onClear={() => onFilters({ reason: "" })} testId="narrow-reason" />}
          </div>
        )}
        </>
        )}

        {error && (
          <div className="mb-3">
            <ListError title="Couldn't load deliveries" onRetry={() => void load()} details={error}>
              Nothing was changed. Check your connection and try again.
            </ListError>
          </div>
        )}

        {!data && !error ? (
          <ListSkeleton rows={6} label="Loading deliveries" />
        ) : !data ? null : rows.length === 0 ? (
          filtering ? (
            <ListEmpty title="No deliveries match these filters." onClear={clear} />
          ) : (
            <EmptyState
              testId="deliveries-empty"
              icon={<RepeatIcon />}
              title="No deliveries yet"
              action={<Link href="/settings/integrations" className={buttonClass("secondary")}>Check your integrations</Link>}
            >
              Every webhook GitHub, Jira and your alerts send to Coderhelm shows up here, and every notice Coderhelm sends to Slack, Teams or email.
              Failed ones say why and how to fix them. Each is kept for {retention} days.
            </EmptyState>
          )
        ) : (
          <>
            <DeliveryTable rows={rows} openId={openId} onOpen={onOpen} />
            <DeliveryCards rows={rows} onOpen={onOpen} />
            <p className="mt-3 text-xs text-zinc-400">Deliveries are kept for {retention} days.</p>
          </>
        )}
      </section>

      <DeliveryDrawer id={openId} onClose={() => onOpen("")} onChanged={() => void load()} />
    </div>
  );
}

/** One narrowing from the overview, with a button that takes it off. */
function NarrowChip({ label, onClear, testId }: { label: string; onClear: () => void; testId: string }) {
  return (
    <span data-testid={testId} className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 py-0.5 pl-3 pr-1 text-xs text-zinc-200">
      <span className="min-w-0 truncate">{label}</span>
      <button type="button" onClick={onClear} aria-label={`Remove ${label}`} className={`rounded-full px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 ${focusRing}`}>
        Remove
      </button>
    </span>
  );
}

// ── Health ──────────────────────────────────────────────────────────

function rateText(rate: number | null): string {
  if (rate === null) return "None yet";
  const pct = rate * 100;
  return `${pct >= 99.95 || pct === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

function Health({ data }: { data: DeliveriesReply }) {
  const s = data.summary ?? { total: 0, ok: 0, failed: 0, pending: 0, success_rate: null, oldest_pending_at: null, last_failure_at: null };
  const rate = s.success_rate;
  const rateTone = rate === null ? "neutral" : rate >= 0.95 ? "success" : rate >= 0.8 ? "warning" : "danger";
  return (
    <section aria-label="Health in the last 24 hours" data-testid="deliveries-health">
      <StatGrid>
        <StatTile label="Success rate" value={rateText(rate)} tone={rateTone} note={s.total ? `${s.ok} of ${s.total} in 24 hours` : "Nothing in 24 hours"} testId="stat-success" />
        <StatTile
          label="Failed"
          value={s.failed}
          tone={s.failed > 0 ? "danger" : "neutral"}
          note={s.last_failure_at ? `Last one ${timeAgo(s.last_failure_at)}` : "None in 24 hours"}
          testId="stat-failed"
        />
        <StatTile
          label="Waiting to retry"
          value={s.pending}
          tone={s.pending > 0 ? "warning" : "neutral"}
          note={s.oldest_pending_at ? `Oldest from ${timeAgo(s.oldest_pending_at)}` : "Nothing waiting"}
          testId="stat-pending"
        />
        <StatTile label="Total" value={s.total} note="In the last 24 hours" testId="stat-total" />
      </StatGrid>
      {data.hybrid && (
        <p className="mt-3 max-w-prose text-xs text-zinc-400" data-testid="relay-note">
          This install is connected to Coderhelm. Events that reach it through Coderhelm&apos;s apps show as source Relay, with the time Coderhelm passed them on.
        </p>
      )}
    </section>
  );
}

function HealthSkeleton() {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <Skeleton className="mb-2 h-3 w-20" />
          <Skeleton className="h-7 w-14" />
          <Skeleton className="mt-2 h-2.5 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Where the sharing switch lives: Settings, System, Hybrid, its own row. */
export const SHARING_HREF = "/settings/system/#hybrid-sharing";

/**
 * One line at the top: whether this install shares its failed deliveries with
 * Coderhelm support, and how much (the hybrid section's sharing row says
 * exactly what is sent). Left out where sharing doesn't apply.
 */
export function sharingWords(enabled: boolean, payloads: boolean): string {
  if (!enabled) return "Not shared with Coderhelm support";
  return payloads
    ? "Failed deliveries are shared with Coderhelm support (details and payload previews)"
    : "Failed deliveries are shared with Coderhelm support (details only)";
}

function SharingNote({ enabled, payloads }: { enabled: boolean; payloads: boolean }) {
  return (
    <p className="mb-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-300" data-testid="sharing-note" data-enabled={String(enabled)} data-payloads={String(payloads)}>
      <span className="flex min-w-0 items-center gap-2">
        <StatusDot tone={enabled ? "success" : "muted"} />
        <span className="min-w-0">{sharingWords(enabled, payloads)}</span>
      </span>
      <Link href={SHARING_HREF} className={`${linkButton} shrink-0`} aria-label="Change what is shared with Coderhelm support">
        Change
      </Link>
    </p>
  );
}

// ── Rows ────────────────────────────────────────────────────────────

function When({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={formatDate(iso, { time: true })} className="whitespace-nowrap">
      {timeAgo(iso)}
    </time>
  );
}

function DeliveryTable({ rows, openId, onOpen }: { rows: DeliveryRow[]; openId: string; onOpen: (id: string) => void }) {
  return (
    <div className="hidden min-w-0 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/30 lg:block">
      <table className="w-full table-auto text-sm" aria-label="Deliveries">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400">
            <th scope="col" className="w-px whitespace-nowrap px-4 py-2.5 font-medium">Status</th>
            <th scope="col" className="w-full px-3 py-2.5 font-medium">Event</th>
            <th scope="col" className="w-px whitespace-nowrap px-3 py-2.5 font-medium">Target</th>
            <th scope="col" className="w-px whitespace-nowrap px-3 py-2.5 text-right font-medium">Attempts</th>
            <th scope="col" className="w-px whitespace-nowrap px-3 py-2.5 text-right font-medium">Took</th>
            <th scope="col" className="w-px whitespace-nowrap px-4 py-2.5 text-right font-medium">When</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {rows.map((r) => (
            <tr
              key={r.id}
              data-testid="delivery-row"
              data-id={r.id}
              onClick={() => onOpen(r.id)}
              className={`cursor-pointer align-top transition-colors hover:bg-zinc-800/40 motion-reduce:transition-none ${openId === r.id ? "bg-zinc-800/50" : ""}`}
            >
              <td className="px-4 py-3">
                <DeliveryStatusChip status={r.status} nextRetry={r.next_retry_at} />
              </td>
              <td className="min-w-0 px-3 py-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <SourceIcon source={r.source} />
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(r.id);
                      }}
                      className={`rounded text-left font-medium text-zinc-100 hover:underline ${focusRing}`}
                    >
                      <span className="wrap-anywhere">{r.event || "Event"}</span>
                    </button>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {sourceName(r.source)} · {directionWord(r.direction)}
                      {r.repo ? <> · <span>{r.repo}{r.pr ? ` #${r.pr}` : ""}</span></> : null}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-3 text-zinc-300">
                <span className="block max-w-[11rem] truncate" title={r.target}>{r.target || "None"}</span>
              </td>
              <td className={`px-3 py-3 text-right tabular-nums ${r.attempts > 1 ? "text-amber-300" : "text-zinc-400"}`}>{r.attempts}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-zinc-400">{r.duration_ms ? formatMs(r.duration_ms) : ""}</td>
              <td className="px-4 py-3 text-right text-zinc-400">
                <When iso={r.created_at} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeliveryCards({ rows, onOpen }: { rows: DeliveryRow[]; onOpen: (id: string) => void }) {
  return (
    <ul aria-label="Deliveries" className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30 lg:hidden">
      {rows.map((r) => (
        <li key={r.id} data-testid="delivery-card" data-id={r.id}>
          <button type="button" onClick={() => onOpen(r.id)} className={`flex w-full min-w-0 items-start gap-3 px-4 py-3 text-left hover:bg-zinc-800/40 ${focusRing} focus-visible:outline-offset-[-2px]`}>
            <SourceIcon source={r.source} />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <span className="min-w-0 text-sm font-medium text-zinc-100"><span className="wrap-anywhere">{r.event || "Event"}</span></span>
                <DeliveryStatusChip status={r.status} nextRetry={r.next_retry_at} />
              </span>
              <span className="mt-1 block text-xs text-zinc-400">
                {sourceName(r.source)} · {directionWord(r.direction)} · <When iso={r.created_at} />
                {r.attempts > 1 ? ` · ${r.attempts} attempts` : ""}
                {r.duration_ms ? ` · ${formatMs(r.duration_ms)}` : ""}
              </span>
              {(r.target || r.repo) && (
                <span className="mt-0.5 block text-xs text-zinc-400">
                  <span className="wrap-anywhere">{r.repo ? `${r.repo}${r.pr ? ` #${r.pr}` : ""}` : r.target}</span>
                </span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── Detail ──────────────────────────────────────────────────────────

function payloadLang(text: string): string | undefined {
  const t = text.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return undefined;
  try {
    JSON.parse(t);
    return "json";
  } catch {
    return undefined;
  }
}

function prettyPayload(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function bytes(n: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function httpTone(code?: number): Tone {
  if (!code) return "danger";
  if (code >= 200 && code < 300) return "success";
  if (code >= 300 && code < 400) return "neutral";
  return "danger";
}

const REDELIVER_WORDS: Record<string, { label: string; confirm: string }> = {
  github: { label: "Redeliver from GitHub", confirm: "GitHub sends this event again, and Coderhelm handles it as if it just arrived. This can start work again." },
  relay: { label: "Redeliver", confirm: "Coderhelm sends this event to your install again. This can start work again." },
  webhook: { label: "Resend", confirm: "Coderhelm sends the same event, with the same id, to your webhook endpoint again, signed now. Your endpoint may act on it again unless it skips event ids it has seen." },
  notify_test: { label: "Send a test notice", confirm: "Coderhelm sends a test notice to the same place, so you can see that it arrives." },
};

function DeliveryDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<DeliveryDetailReply | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState("");
  const { confirm } = useConfirm();
  const { toast } = useToast();

  const load = useCallback(async (which: string) => {
    setError("");
    try {
      setDetail(await api.getDelivery(which));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    }
  }, []);

  useEffect(() => {
    setDetail(null);
    setRefusal("");
    if (id) void load(id);
  }, [id, load]);

  const d = detail?.delivery;
  const words = REDELIVER_WORDS[d?.redeliver ?? "github"] ?? REDELIVER_WORDS.github;

  const redeliver = async () => {
    if (!d) return;
    const ok = await confirm({ title: `${words.label}?`, message: words.confirm, confirmLabel: words.label });
    if (!ok) return;
    setBusy(true);
    setRefusal("");
    const r = await api.redeliver(d.id);
    setBusy(false);
    if (r.ok) {
      toast(r.message || "Sent again");
      onChanged();
      void load(d.id);
    } else {
      setRefusal(r.error);
      toast(r.error, "error");
    }
  };

  return (
    <Drawer
      open={!!id}
      onOpenChange={(v) => !v && onClose()}
      title={d ? d.event || "Delivery" : "Delivery"}
      description={
        d ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <DeliveryStatusChip status={d.status} />
            <span>{sourceName(d.source)} · {directionWord(d.direction)} <When iso={d.created_at} /></span>
          </span>
        ) : undefined
      }
      testId="delivery-drawer"
      actions={d ? <CopyButton text={d.id} label="Copy id" /> : undefined}
      footer={
        detail?.can_redeliver ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-zinc-400">Sending it again can start work again.</p>
            <button type="button" className={primaryButton} disabled={busy} onClick={() => void redeliver()} data-testid="redeliver">
              {busy ? "Sending…" : words.label}
            </button>
          </div>
        ) : undefined
      }
    >
      {error ? (
        <ListError title="Couldn't load this delivery" onRetry={() => void load(id)} details={error}>
          It may be older than the 14 days deliveries are kept.
        </ListError>
      ) : !d ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading the delivery">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <DeliveryDetail detail={detail!} refusal={refusal} />
      )}
    </Drawer>
  );
}

function Block({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="min-w-0" data-testid={testId}>
      <h3 className="mb-2 text-sm font-semibold text-zinc-100">{title}</h3>
      {children}
    </section>
  );
}

function DeliveryDetail({ detail, refusal }: { detail: DeliveryDetailReply; refusal: string }) {
  const d = detail.delivery;
  const reason = detail.reason;
  const attempts = Array.isArray(d.attempts) ? d.attempts : [];
  const headers = Object.entries(d.headers ?? {});
  const preview = d.payload_preview ?? "";
  const kept = preview && !/^\[\d+ bytes, not JSON/.test(preview);
  const facts: [string, ReactNode][] = [
    ["Delivery id", <Code key="id">{d.id}</Code>],
    ...(d.external_id ? ([[d.source === "github" ? "GitHub delivery id" : d.source === "webhook" ? "Event id" : "Their id", <Code key="ext">{d.external_id}</Code>]] as [string, ReactNode][]) : []),
    ...(d.repo
      ? ([[
          "Repository",
          d.pr ? (
            <a key="repo" href={`https://github.com/${d.repo}/pull/${d.pr}`} target="_blank" rel="noopener noreferrer" className={linkButton}>
              <span className="wrap-anywhere">{d.repo} #{d.pr}</span>
            </a>
          ) : (
            <span key="repo" className="wrap-anywhere">{d.repo}</span>
          ),
        ]] as [string, ReactNode][])
      : []),
    ...(d.target ? ([["Target", <span key="t" className="wrap-anywhere">{d.target}</span>]] as [string, ReactNode][]) : []),
    ...(d.source === "webhook" && d.endpoint_id
      ? ([[
          "Endpoint",
          <Link key="ep" href={endpointHref(d.endpoint_id)} className={linkButton} data-testid="delivery-endpoint-link">
            Open the endpoint
          </Link>,
        ]] as [string, ReactNode][])
      : []),
    ...(d.outcome ? ([["Outcome", <span key="o" className="wrap-anywhere">{d.outcome}</span>]] as [string, ReactNode][]) : []),
    ...(d.duration_ms ? ([["Took", formatMs(d.duration_ms)]] as [string, ReactNode][]) : []),
    ["Received", formatDate(d.created_at, { time: true })],
  ];

  return (
    <div className="space-y-7" data-testid="delivery-detail" data-status={d.status}>
      {d.status === "pending" && d.next_retry_at && (
        <p className="text-sm text-amber-300" data-testid="delivery-next-retry">Coderhelm tries again at {clock(d.next_retry_at)}.</p>
      )}

      {reason && (
        <div data-testid="delivery-reason">
          <Callout
            variant={d.status === "failed" ? "error" : d.status === "pending" ? "warning" : "neutral"}
            title={reason.message}
            live={false}
          >
            {reason.fix && (
              <p data-testid="delivery-fix">
                <span className="font-medium text-zinc-100">How to fix: </span>
                {reason.fix}
              </p>
            )}
            <p className="text-xs text-zinc-400">Reason code <Code>{reason.code}</Code></p>
          </Callout>
        </div>
      )}
      {refusal && (
        <Callout variant="error" title="Not sent again" testId="redeliver-refusal">
          <p>{refusal}</p>
        </Callout>
      )}

      <Block title="Details">
        <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-zinc-400">{k}</dt>
              <dd className="mb-1 min-w-0 text-zinc-200 sm:mb-0">{v}</dd>
            </div>
          ))}
        </dl>
      </Block>

      <Block title={attempts.length === 1 ? "1 attempt" : `${attempts.length} attempts`} testId="delivery-attempts">
        {attempts.length === 0 ? (
          <p className="text-sm text-zinc-400">No attempts recorded.</p>
        ) : (
          <ol className="relative min-w-0 space-y-3 border-l border-zinc-800 pl-5">
            {attempts.map((a, i) => (
              <li key={`${a.at}-${i}`} className="relative min-w-0" data-testid="delivery-attempt">
                <span aria-hidden="true" className={`absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-zinc-900 ${TONES[a.error ? "danger" : httpTone(a.code)].dot}`} />
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="text-zinc-200">{formatDate(a.at, { time: true })}</span>
                  {a.code ? <Chip tone={httpTone(a.code)}>{`HTTP ${a.code}`}</Chip> : <Chip tone="danger">No answer</Chip>}
                  {a.duration_ms ? <span className="text-xs tabular-nums text-zinc-400">{formatMs(a.duration_ms)}</span> : null}
                </div>
                {a.error && <p className="mt-1 text-sm text-red-300"><span className="wrap-anywhere">{a.error}</span></p>}
              </li>
            ))}
          </ol>
        )}
      </Block>

      <Block title="Headers" testId="delivery-headers">
        {headers.length === 0 ? (
          <p className="text-sm text-zinc-400">No headers kept.</p>
        ) : (
          <div className="min-w-0 overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm" aria-label="Headers">
              <tbody className="divide-y divide-zinc-800">
                {headers.map(([k, v]) => (
                  <tr key={k} className="align-top">
                    <th scope="row" className="w-px whitespace-nowrap px-3 py-2 text-left font-normal text-zinc-400">{k}</th>
                    <td className="px-3 py-2 text-zinc-200">
                      {v === "[redacted]" ? <Chip tone="muted">Hidden</Chip> : <span className="wrap-anywhere">{v}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-zinc-400">Signatures and tokens are never kept: they show as Hidden.</p>
      </Block>

      <Block title="Payload" testId="delivery-payload">
        {kept ? (
          <CodeBlock code={prettyPayload(preview)} lang={payloadLang(preview)} title={d.payload_bytes ? `Preview of ${bytes(d.payload_bytes)}` : "Preview"} label="Payload preview" maxHeightClass="max-h-96" />
        ) : (
          <p className="text-sm text-zinc-400">
            {preview ? `Not kept: ${bytes(d.payload_bytes) || "the body"} wasn't JSON.` : "No payload kept for this delivery."}
          </p>
        )}
      </Block>
    </div>
  );
}
