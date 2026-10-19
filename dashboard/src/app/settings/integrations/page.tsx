"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type AwsAccountAbilities,
  type Connector,
  type Integration,
  type IntegrationSection,
  type IntegrationStatus,
  type PluginDef,
} from "@/lib/api";
import { errorMessage, timeAgo } from "@/lib/data-sources";
import { RoleGuard } from "@/components/role-guard";
import { Page, PageHeader, Section, cardClass } from "@/components/page";
import { Callout } from "@/components/callout";
import { StatusPill } from "@/components/status-pill";
import { Skeleton } from "@/components/skeleton";
import { Field, SecretInput } from "@/components/field";
import { AwsAbilitiesPanel, AwsAbilitySummary, ConnectorForm } from "@/components/connections";
import { Switch, TeamsHowTo, TeamsWebhookField, validTeamsUrl } from "@/components/teams-webhook";
import { Disclosure } from "@/components/disclosure";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";

// Settings → Integrations: every outside system Coderhelm connects to, in one
// place. Grouped by what it's for (like Vercel's and Sentry's integration
// pages), each card carries its status, what Coderhelm does with it, when it
// was last checked and one primary action (like Linear's). What a connected
// AWS account can do is detected from its role, the way Datadog detects
// what an integration can read, instead of asking for it again.

export default function IntegrationsPageGuarded() {
  return (
    <RoleGuard minRole="member">
      <IntegrationsPage />
    </RoleGuard>
  );
}

const SECTIONS: { id: IntegrationSection; anchor: string; title: string; description: string }[] = [
  { id: "code", anchor: "code-and-tickets", title: "Code and tickets", description: "Where the work comes from and where it lands." },
  { id: "cloud", anchor: "cloud", title: "Cloud", description: "AWS accounts, through a read-only role in each. One account covers logs, metrics and Airflow." },
  { id: "monitoring", anchor: "monitoring", title: "Monitoring", description: "Errors, deploys and performance that agents check facts against." },
  { id: "docs", anchor: "docs-and-design", title: "Docs and design", description: "Pages and designs agents read for context." },
  { id: "chat", anchor: "chat", title: "Chat", description: "Where Coderhelm posts alerts and pull request links." },
  { id: "other", anchor: "other-tools", title: "Other tools", description: "More MCP servers agents can use once they're on and have credentials." },
];

const STATUS: Record<IntegrationStatus, { label: string; tone: "success" | "warning" | "error" | "neutral" }> = {
  connected: { label: "Connected", tone: "success" },
  needs_credentials: { label: "Needs credentials", tone: "warning" },
  not_connected: { label: "Not connected", tone: "neutral" },
  error: { label: "Not working", tone: "error" },
};

/** Problems first, then what works, then what could be added. */
const ORDER: Record<IntegrationStatus, number> = { needs_credentials: 0, error: 1, connected: 2, not_connected: 3 };

/** The anchor a card answers to (`#integration-aws` for the first AWS account). */
function anchorOf(item: Integration, firstAws: boolean): string {
  if (item.id.startsWith("aws")) return firstAws ? "integration-aws" : `integration-${item.id}`;
  return `integration-${item.id}`;
}

function IntegrationsPage() {
  const [data, setData] = useState<{ items: Integration[]; canEdit: boolean } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const r = await api.getIntegrations();
      setData({ items: r.items, canEdit: r.can_edit });
    } catch (e) {
      setError(errorMessage(e, "The request failed."));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Open the card a link points at (#integration-sentry from a skill check).
  const [target, setTarget] = useState("");
  useEffect(() => {
    const read = () => setTarget(window.location.hash.replace(/^#/, ""));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  useEffect(() => {
    if (!target || !data) return;
    const el = document.getElementById(target);
    el?.scrollIntoView({ block: "start" });
    el?.focus({ preventScroll: true });
  }, [target, data]);

  const counts = useMemo(() => {
    const c = { connected: 0, needs_credentials: 0, error: 0, not_connected: 0 };
    for (const i of data?.items ?? []) c[i.status]++;
    return c;
  }, [data]);

  const replace = (next: Integration) =>
    setData((d) => (d ? { ...d, items: d.items.map((i) => (i.id === next.id ? next : i)) } : d));

  return (
    <Page testId="integrations-page">
      <PageHeader
        title="Integrations"
        lead={
          <>
            Everything Coderhelm connects to, what it does with each, and whether it works. Keys you enter here are encrypted for your team and
            never shown again. Databases, APIs and log searches agents query live in{" "}
            <Link href="/data-sources" className={linkButton}>
              Data sources
            </Link>
            .
          </>
        }
      />
      {data && (
        <p className="mt-4 text-sm text-zinc-400" data-testid="integrations-summary">
          {counts.connected} connected
          {counts.needs_credentials > 0 && <span className="text-amber-300"> · {counts.needs_credentials} need credentials</span>}
          {counts.error > 0 && <span className="text-red-400"> · {counts.error} not working</span>}
          {!data.canEdit && <span> · Only admins can connect or change integrations.</span>}
        </p>
      )}
      {error && (
        <div className="mt-6">
          <Callout variant="error" title="We couldn't load your integrations">
            <p>{error}</p>
            <p>
              <button type="button" onClick={load} className={linkButton}>
                Try again
              </button>
            </p>
          </Callout>
        </div>
      )}
      {!data && !error && (
        <div className="mt-10 space-y-8" aria-busy="true" aria-label="Loading integrations">
          {[0, 1].map((i) => (
            <div key={i}>
              <Skeleton className="mb-3 h-3 w-32" />
              <div className="grid gap-3 lg:grid-cols-2">
                <Skeleton className="h-32 w-full rounded-lg" />
                <Skeleton className="h-32 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      )}
      {data &&
        SECTIONS.map((sec) => {
          const items = data.items.filter((i) => i.section === sec.id);
          if (items.length === 0) return null;
          const sorted = sec.id === "other" ? [...items].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name)) : items;
          let awsSeen = false;
          return (
            <Section key={sec.id} id={sec.anchor} title={sec.title} description={sec.description}>
              <div className="grid gap-3 lg:grid-cols-2">
                {sorted.map((item) => {
                  const firstAws = item.id.startsWith("aws") && !awsSeen;
                  if (item.id.startsWith("aws")) awsSeen = true;
                  const anchor = anchorOf(item, firstAws);
                  return (
                    <IntegrationCard
                      key={item.id}
                      item={item}
                      anchor={anchor}
                      canEdit={data.canEdit}
                      startOpen={target === anchor}
                      onChange={replace}
                      onReload={load}
                    />
                  );
                })}
              </div>
            </Section>
          );
        })}
      {data && (
        <Section id="data-sources" title="Data sources">
          <p className="text-sm text-zinc-400">
            APIs, databases and log searches agents can query, with hidden fields and an activity log, are on{" "}
            <Link href="/data-sources" className={linkButton}>
              Data sources
            </Link>
            .
          </p>
        </Section>
      )}
    </Page>
  );
}

const ACTION_LABEL = {
  connect: "Connect",
  add_credentials: "Add credentials",
  check_again: "Check again",
  manage: "Manage",
} as const;

function IntegrationCard({
  item,
  anchor,
  canEdit,
  startOpen,
  onChange,
  onReload,
}: {
  item: Integration;
  anchor: string;
  canEdit: boolean;
  startOpen: boolean;
  onChange: (i: Integration) => void;
  onReload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  useEffect(() => {
    if (startOpen && canEdit) setOpen(true);
  }, [startOpen, canEdit]);

  const st = STATUS[item.status];
  const kind = kindOf(item);
  const aws = kind === "aws_account" ? (item.detail as unknown as AwsAccountAbilities) : null;
  const headingId = `${anchor}-name`;

  // The page link (GitHub, Jira, AWS without an account) or the inline panel.
  const pageHref = kind === "github" || kind === "jira" || kind === "aws_connect" ? item.manage_href : "";

  const checkAgain = async () => {
    setBusy(true);
    try {
      if (kind === "aws_account" && aws) {
        const r = await api.checkAwsAbilities(aws.account);
        onChange({ ...item, status: r.status, reason: r.reason, last_check: r.last_check, detail: r.account as unknown as Record<string, unknown> });
      } else if (kind === "connector") {
        const r = await api.testConnector(item.id as "newrelic" | "confluence");
        toast(r.connector.status === "ready" ? `${item.name} works` : `${item.name} needs attention`, r.connector.status === "ready" ? "success" : "error");
        await onReload();
      } else if (kind === "plugin") {
        const r = await api.testPluginConnection(item.id);
        toast(r.status === "ok" ? `${item.name} works` : r.message || "The test failed", r.status === "ok" ? "success" : "error");
        await onReload();
      }
    } catch (e) {
      toast(errorMessage(e, "The check failed."), "error");
    } finally {
      setBusy(false);
    }
  };

  const primary = async () => {
    if (item.action === "check_again" && kind !== "teams") return checkAgain();
    if (kind === "plugin" && item.action === "connect") {
      setBusy(true);
      try {
        await api.enablePlugin(item.id);
        await onReload();
        setOpen(true);
      } catch (e) {
        toast(errorMessage(e, "Couldn't switch it on."), "error");
      } finally {
        setBusy(false);
      }
      return;
    }
    setOpen((v) => !v);
  };

  const last = item.last_check ? `Checked ${timeAgo(item.last_check)}` : kind === "aws_account" || kind === "plugin" || kind === "connector" ? (item.status === "not_connected" ? "" : "Not checked yet") : "";

  return (
    <article
      id={anchor}
      tabIndex={-1}
      aria-labelledby={headingId}
      className={`${cardClass} p-5 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${item.status === "needs_credentials" ? "border-amber-500/40" : item.status === "error" ? "border-red-500/40" : ""}`}
      data-testid={`integration-${item.id}`}
      data-status={item.status}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={headingId} className="min-w-0 break-words font-semibold text-zinc-100">
          {item.name}
        </h3>
        <StatusPill tone={st.tone}>{st.label}</StatusPill>
      </div>
      <p className="mt-1 text-sm text-zinc-400">{item.does}</p>
      {item.reason && (
        <p className={`mt-2 text-sm ${item.status === "error" ? "text-red-300" : item.status === "needs_credentials" ? "font-medium text-amber-300" : "text-zinc-400"}`}>
          {item.reason}
        </p>
      )}
      {aws && <AwsAbilitySummary a={aws} />}
      {last && <p className="mt-2 text-xs text-zinc-500">{last}</p>}

      {canEdit ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {pageHref ? (
            <Link href={pageHref} className={item.status === "connected" ? secondaryButton : primaryButton}>
              {ACTION_LABEL[item.action]}
            </Link>
          ) : (
            <button
              type="button"
              onClick={primary}
              disabled={busy}
              aria-expanded={item.action === "check_again" || (kind === "plugin" && item.action === "connect") ? undefined : open}
              className={item.status === "connected" ? secondaryButton : primaryButton}
            >
              {busy ? "Working…" : ACTION_LABEL[item.action]}
            </button>
          )}
          {item.action === "check_again" && kind !== "teams" && (
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={linkButton}>
              {open ? "Close" : "Settings"}
            </button>
          )}
          {kind === "aws_account" && (
            <Link href={item.manage_href} className={linkButton}>
              Log groups and findings
            </Link>
          )}
        </div>
      ) : (
        item.status !== "connected" && <p className="mt-4 text-sm text-zinc-500">Ask an admin to set this up.</p>
      )}

      {open && canEdit && (
        <>
          {kind === "aws_account" && aws && (
            <AwsAbilitiesPanel
              a={aws}
              canEdit={canEdit}
              onChange={(r) => onChange({ ...item, status: r.status, reason: r.reason, last_check: r.last_check, detail: r.account as unknown as Record<string, unknown> })}
            />
          )}
          {kind === "connector" && (
            <ConnectorPanel
              item={item}
              onSaved={async () => {
                await onReload();
              }}
            />
          )}
          {kind === "plugin" && <PluginPanel item={item} onChanged={onReload} onClose={() => setOpen(false)} />}
          {kind === "teams" && <TeamsPanel onSaved={onReload} />}
        </>
      )}
    </article>
  );
}

type Kind = "github" | "jira" | "aws_connect" | "aws_account" | "connector" | "teams" | "plugin";

function kindOf(item: Integration): Kind {
  if (item.id === "github") return "github";
  if (item.id === "jira") return "jira";
  if (item.id === "aws") return "aws_connect";
  if (item.id.startsWith("aws-")) return "aws_account";
  if (item.id === "newrelic" || item.id === "confluence") return "connector";
  if (item.id === "teams") return "teams";
  return "plugin";
}

function ConnectorPanel({ item, onSaved }: { item: Integration; onSaved: () => Promise<void> }) {
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const c = item.detail as unknown as Connector;
  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${item.name}?`,
      message: "Agents stop using it right away and the saved key is deleted.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.removeConnector(item.id as "newrelic" | "confluence");
      await onSaved();
    } catch (e) {
      toast(errorMessage(e, "Couldn't remove it."), "error");
    }
  };
  return (
    <>
      {c.kind === "confluence" && c.write_enabled && (c.write_pages?.length ?? 0) > 0 && (
        <p className="mt-3 text-sm text-amber-300">Writes on: may add text to pages {c.write_pages?.join(", ")}.</p>
      )}
      <ConnectorForm
        item={{ ...c, kind: item.id as "newrelic" | "confluence", label: item.name, connected: Boolean(c.connected) }}
        onSaved={() => {
          onSaved();
        }}
      />
      {c.connected && (
        <p className="mt-3">
          <button type="button" onClick={remove} className={linkButton}>
            Remove {item.name}
          </button>
        </p>
      )}
    </>
  );
}

/** An MCP server: credentials (entered here, never shown again), its test, its instructions, and turning it off. */
function PluginPanel({ item, onChanged, onClose }: { item: Integration; onChanged: () => Promise<void>; onClose: () => void }) {
  const d = item.detail as { plugin: PluginDef; enabled: boolean; has_credentials: boolean; custom_prompt: string };
  const p = d.plugin;
  const [creds, setCreds] = useState<Record<string, string>>(() => Object.fromEntries(p.credential_fields.map((f) => [f.key, ""])));
  const [prompt, setPrompt] = useState(d.custom_prompt || p.default_prompt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const saveCreds = async () => {
    setSaving(true);
    setError("");
    try {
      const r = await api.updatePluginCredentials(p.id, creds);
      if (r.error) {
        setError(r.error);
        return;
      }
      toast("Credentials saved");
      const t = await api.testPluginConnection(p.id).catch(() => null);
      if (t && t.status !== "ok") toast(t.message || "The test failed", "error");
      await onChanged();
    } catch (e) {
      setError(errorMessage(e, "Couldn't save the credentials."));
    } finally {
      setSaving(false);
    }
  };
  const savePrompt = async () => {
    try {
      await api.updatePluginPrompt(p.id, prompt);
      toast("Instructions saved");
    } catch (e) {
      toast(errorMessage(e, "Couldn't save the instructions."), "error");
    }
  };
  const turnOff = async () => {
    const ok = await confirm({
      title: `Turn off ${p.name}?`,
      message: "Agents stop using it and its saved credentials are deleted.",
      confirmLabel: "Turn off",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.disablePlugin(p.id);
      onClose();
      await onChanged();
    } catch (e) {
      toast(errorMessage(e, "Couldn't turn it off."), "error");
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-zinc-800 pt-4">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          saveCreds();
        }}
      >
        <p className="text-sm text-zinc-400">
          {d.has_credentials ? "Credentials are saved. Enter new ones to replace them." : "Agents get this server once its credentials are saved."}{" "}
          {p.recommended_permissions && <>Use the least access that works: {p.recommended_permissions.toLowerCase()}.</>}{" "}
          <a href={p.docs_url} target="_blank" rel="noreferrer" className={linkButton}>
            Where to get them
          </a>
        </p>
        {p.credential_fields.map((f) => (
          <Field key={f.key} id={`${p.id}-${f.key}`} label={f.label}>
            {(props) =>
              f.secret ? (
                <SecretInput
                  {...props}
                  className={inputClass}
                  placeholder={f.placeholder}
                  value={creds[f.key] ?? ""}
                  onChange={(e) => setCreds((c) => ({ ...c, [f.key]: e.target.value }))}
                  autoComplete="off"
                />
              ) : (
                <input
                  {...props}
                  className={inputClass}
                  placeholder={f.placeholder}
                  value={creds[f.key] ?? ""}
                  onChange={(e) => setCreds((c) => ({ ...c, [f.key]: e.target.value }))}
                  autoComplete="off"
                />
              )
            }
          </Field>
        ))}
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div>
          <button type="submit" disabled={saving || p.credential_fields.some((f) => !(creds[f.key] ?? "").trim())} className={primaryButton}>
            {saving ? "Saving and testing…" : "Save and test"}
          </button>
        </div>
      </form>
      <Disclosure summary="Instructions agents follow with this server">
        <Field id={`${p.id}-prompt`} label="Instructions">
          {(props) => <textarea {...props} rows={4} maxLength={4000} className={`${inputClass} font-mono`} value={prompt} onChange={(e) => setPrompt(e.target.value)} />}
        </Field>
        <p className="mt-2">
          <button type="button" onClick={savePrompt} className={secondaryButton}>
            Save instructions
          </button>
        </p>
      </Disclosure>
      <p>
        <button type="button" onClick={turnOff} className={linkButton}>
          Turn off {p.name}
        </button>
      </p>
    </div>
  );
}

/** The team's Teams channel (the same one Alert routes post to). */
function TeamsPanel({ onSaved }: { onSaved: () => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();
  useEffect(() => {
    api
      .getAlertNotify()
      .then((s) => {
        setUrl(s.teams_webhook_url);
        setEnabled(s.enabled || !s.teams_webhook_url);
      })
      .catch(() => setError("Couldn't load the channel."))
      .finally(() => setLoaded(true));
  }, []);
  const ok = validTeamsUrl(url);
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await api.saveAlertNotify({ teams_webhook_url: url.trim(), enabled });
      toast("Teams channel saved");
      await onSaved();
    } catch (e) {
      setError(errorMessage(e, "Couldn't save. Check the webhook address."));
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      className="mt-4 flex flex-col gap-4 border-t border-zinc-800 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <TeamsWebhookField id="integrations-teams-webhook" value={url} onChange={setUrl} disabled={!loaded} />
      <Disclosure summary="How to get a webhook address">
        <TeamsHowTo />
      </Disclosure>
      <Switch checked={enabled} onChange={setEnabled} disabled={!loaded} label="Post alerts to this channel" />
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <div>
        <button type="submit" disabled={saving || !loaded || (enabled && !ok) || (!!url.trim() && !ok)} className={primaryButton}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
