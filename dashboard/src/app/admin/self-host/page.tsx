"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type SelfHostDetail, type SelfHostRow, type SelfHostSummary, type SelfHostTrendDay } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { Page, PageHeader, Section, cardClass } from "@/components/page";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { StatusPill } from "@/components/status-pill";
import { secondaryButton, smallSecondaryButton } from "@/components/ui";
import { formatDate } from "@/components/list";

const n = (v: number) => v.toLocaleString();
const pct = (v: number) => `${(v * 100).toFixed(v > 0 && v < 0.01 ? 2 : 1)}%`;

const PART_LABEL: Record<string, string> = {
  address: "Address",
  github: "GitHub relay",
  jira: "Jira",
  notion: "Notion",
  confluence: "Confluence",
  google_drive: "Drive",
  broker: "Token broker",
  email: "Email",
  sharing: "Sharing",
};

const STATUS_TONE = { active: "success", paused: "warning", revoked: "error" } as const;

/**
 * Admin, then Self-host (Coderhelm's platform admins, hosted deployment):
 * every self-hosted install registered for hybrid, which hosted parts each
 * uses, and the event relay and email relay numbers. Metadata only: no
 * payloads, no email contents, recipients only as counts.
 */
export default function SelfHostAdminPage() {
  const [data, setData] = useState<SelfHostSummary | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    setFailed(null);
    api
      .adminSelfHostSummary()
      .then(setData)
      .catch((e: unknown) => setFailed(e instanceof Error ? e.message : "Couldn't load."));
  }, []);
  useEffect(load, [load]);

  const header = (
    <div className="mb-6">
      <PageHeader
        title="Self-host"
        lead="Self-hosted installs that use Coderhelm's hosted parts: addresses, the GitHub relay, the integration apps, the token broker and email. Counts and metadata only."
      />
    </div>
  );

  if (failed) {
    return (
      <Page>
        {header}
        <Callout variant="error" title="Couldn't load the self-hosted installs">
          <p>{failed}</p>
          <button type="button" onClick={load} className={`mt-2 ${secondaryButton}`}>Try again</button>
        </Callout>
      </Page>
    );
  }
  if (!data) {
    return (
      <Page>
        {header}
        <div className="space-y-4" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Page>
    );
  }

  const tiles: { label: string; value: string; note: string }[] = [
    { label: "Installs", value: n(data.installs.total), note: `${n(data.installs.active_7d)} active in 7 days, ${n(data.installs.revoked)} revoked` },
    { label: "Coderhelm address", value: n(data.address.claimed), note: `${n(data.address.live)} live` },
    {
      label: "GitHub relay",
      value: n(data.github.installs),
      note: `${n(data.github.linked_installations)} linked, ${n(data.github.relayed_24h)} events today, ${n(data.github.relayed_7d)} in 7 days, ${pct(data.github.failure_rate_7d)} failed`,
    },
    { label: "Token broker", value: n(data.broker.installs), note: `${n(data.broker.tokens_7d)} tokens in 7 days, ${data.broker.tokens_per_day.toFixed(1)} a day` },
    {
      label: "Email relay",
      value: n(data.email.opted_in),
      note: `${n(data.email.sent_24h)} sent today, ${n(data.email.sent_7d)} in 7 days, ${pct(data.email.bounce_rate_7d)} bounced, ${pct(data.email.complaint_rate_7d)} complaints, ${n(data.email.paused)} paused, ${n(data.email.recipients)} recipients`,
    },
    {
      label: "Integration apps",
      value: n(Object.values(data.integrations).reduce((a, b) => a + b, 0)),
      note: `Jira ${n(data.integrations.jira ?? 0)}, Notion ${n(data.integrations.notion ?? 0)}, Confluence ${n(data.integrations.confluence ?? 0)}, Drive ${n(data.integrations.google_drive ?? 0)}`,
    },
    { label: "Sharing with support", value: n(data.sharing), note: "Installs that share failed-delivery data" },
  ];

  return (
    <Page>
      {header}
      <ul className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="selfhost-tiles">
        {tiles.map((t) => (
          <li key={t.label} className={`${cardClass} p-4`}>
            <p className="text-xs font-medium text-zinc-400">{t.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{t.value}</p>
            <p className="mt-1 text-xs text-zinc-400">{t.note}</p>
          </li>
        ))}
      </ul>

      <Section title="Last 7 days" description="Events relayed to installs and emails sent through Coderhelm, per day (UTC).">
        <Trend days={data.trend} />
      </Section>

      <Section title="Installs" description="Open one for its numbers and audit log.">
        {data.rows.length === 0 ? (
          <p className="text-sm text-zinc-400">No self-hosted install has registered yet.</p>
        ) : (
          <ul className="min-w-0 divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800" data-testid="selfhost-rows">
            {data.rows.map((r) => (
              <InstallRow key={r.install_id} row={r} open={open === r.install_id} onToggle={() => setOpen(open === r.install_id ? null : r.install_id)} onChanged={load} />
            ))}
          </ul>
        )}
      </Section>
    </Page>
  );
}

/** Two bars a day: relay events and emails, each scaled to its own week. */
function Trend({ days }: { days: SelfHostTrendDay[] }) {
  const maxE = Math.max(1, ...days.map((d) => d.events));
  const maxM = Math.max(1, ...days.map((d) => d.emails));
  return (
    <div className={`${cardClass} p-4`} data-testid="selfhost-trend">
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-zinc-400">
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-500" />Relay events</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />Emails</span>
      </div>
      <ol className="grid grid-cols-7 items-end gap-2" aria-label="Relay events and emails per day">
        {days.map((d) => (
          <li key={d.day} className="min-w-0 text-center" aria-label={`${d.day}: ${d.events} events, ${d.emails} emails`}>
            <div className="flex h-24 items-end justify-center gap-1" aria-hidden="true">
              <div className="w-2.5 rounded-t bg-sky-500 sm:w-4" style={{ height: `${Math.max(2, (d.events / maxE) * 96)}px` }} />
              <div className="w-2.5 rounded-t bg-emerald-500 sm:w-4" style={{ height: `${Math.max(2, (d.emails / maxM) * 96)}px` }} />
            </div>
            <p className="mt-1 text-xs tabular-nums text-zinc-400">
              <span className="sm:hidden">{d.day.slice(8)}</span>
              <span className="hidden sm:inline">{d.day.slice(5)}</span>
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function InstallRow({ row, open, onToggle, onChanged }: { row: SelfHostRow; open: boolean; onToggle: () => void; onChanged: () => void }) {
  const address = row.hostname ?? row.cloudfront;
  return (
    <li className="min-w-0" data-testid={`selfhost-row-${row.install_id}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full min-w-0 flex-col gap-2 px-4 py-3 text-left hover:bg-zinc-900/60 sm:flex-row sm:items-center sm:justify-between">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-zinc-100">{row.name ?? "Unnamed install"}</span>
          <span className="block truncate text-xs text-zinc-400">{address}</span>
          <span className="mt-1 flex flex-wrap gap-1">
            {row.parts.length === 0 ? (
              <span className="text-xs text-zinc-400">No hosted parts on</span>
            ) : (
              row.parts.map((p) => (
                <span key={p} className="rounded border border-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300">{PART_LABEL[p] ?? p}</span>
              ))
            )}
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
          <span>{row.version || "version unknown"}</span>
          <span>Registered {formatDate(row.registered_at)}</span>
          <span>Seen {row.last_seen ? formatDate(row.last_seen) : "never"}</span>
          <span className="tabular-nums">{n(row.relay_7d)} events, {n(row.emails_7d)} emails in 7 days</span>
          <StatusPill tone={STATUS_TONE[row.status]}>{row.status === "active" ? "Active" : row.status === "paused" ? "Email paused" : "Revoked"}</StatusPill>
        </span>
      </button>
      {open && <InstallDetail row={row} onChanged={onChanged} />}
    </li>
  );
}

function InstallDetail({ row, onChanged }: { row: SelfHostRow; onChanged: () => void }) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [detail, setDetail] = useState<SelfHostDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.adminSelfHostInstall(row.install_id).then(setDetail).catch(() => setFailed(true));
  }, [row.install_id]);

  const act = async (what: "pause" | "resume" | "revoke") => {
    const ok = await confirm({
      title: what === "revoke" ? "Revoke this install?" : what === "pause" ? "Pause its email?" : "Resume its email?",
      message:
        what === "revoke"
          ? "Its Coderhelm address, GitHub relay, integration apps, token broker and email stop working until it registers again."
          : what === "pause"
            ? "Coderhelm stops sending email for this install until you resume it. The install shows the pause in Setup."
            : "Coderhelm sends this install's email again.",
      confirmLabel: what === "revoke" ? "Revoke" : what === "pause" ? "Pause email" : "Resume email",
      destructive: what !== "resume",
    });
    if (!ok) return;
    setBusy(true);
    try {
      if (what === "revoke") await api.adminRevokeInstall(row.install_id, "platform admin");
      else await api.adminPauseInstallEmail(row.install_id, what === "pause", "platform admin");
      toast(what === "revoke" ? "Revoked" : what === "pause" ? "Email paused" : "Email resumed", "success");
      onChanged();
    } catch {
      toast("Couldn't do that. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const stats: [string, string][] = [
    ["GitHub installations linked", n(row.github_links)],
    ["Events relayed, today and 7 days", `${n(row.relay_24h)} and ${n(row.relay_7d)}`],
    ["Relay failures in 7 days", n(row.relay_failed_7d)],
    ["Tokens minted in 7 days", n(row.broker_7d)],
    ["Emails, today and 7 days", `${n(row.emails_24h)} and ${n(row.emails_7d)}`],
    ["Bounces and complaints in 7 days", `${n(row.bounced_7d)} and ${n(row.complained_7d)}`],
    ["Email recipients listed", n(row.listed_recipients)],
    ["Shares delivery data", row.sharing ? "Yes" : "No"],
  ];

  return (
    <div className="min-w-0 space-y-4 border-t border-zinc-800 bg-zinc-950/40 px-4 py-4" data-testid="selfhost-detail">
      <dl className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {stats.map(([k, v]) => (
          <div key={k} className="flex min-w-0 justify-between gap-3 text-sm">
            <dt className="text-zinc-400">{k}</dt>
            <dd className="shrink-0 tabular-nums text-zinc-100">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        {row.status !== "revoked" && row.email_opted_in && (
          <button type="button" disabled={busy} className={smallSecondaryButton} onClick={() => act(row.email_paused ? "resume" : "pause")}>
            {row.email_paused ? "Resume email" : "Pause email"}
          </button>
        )}
        {row.status !== "revoked" && (
          <button type="button" disabled={busy} className={smallSecondaryButton} onClick={() => act("revoke")}>Revoke</button>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-zinc-100">Audit log</h3>
        {failed && <p className="mt-2 text-sm text-zinc-400">Couldn&apos;t load the audit log.</p>}
        {!detail && !failed && <Skeleton className="mt-2 h-16 w-full" />}
        {detail && detail.audit.length === 0 && <p className="mt-2 text-sm text-zinc-400">Nothing recorded yet.</p>}
        {detail && detail.audit.length > 0 && (
          <ol className="mt-2 min-w-0 space-y-1" data-testid="selfhost-audit">
            {detail.audit.map((a, i) => (
              <li key={`${a.at}-${i}`} className="flex min-w-0 flex-col gap-0.5 text-xs sm:flex-row sm:gap-3">
                <span className="shrink-0 tabular-nums text-zinc-500">{formatDate(a.at)}</span>
                <span className="shrink-0 font-medium text-zinc-200">{a.action.replace(/_/g, " ")}</span>
                <span className="min-w-0 wrap-anywhere text-zinc-400">{a.detail}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
