"use client";

import { useCan } from "@/hooks/use-can";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type AwsAccountAbilities,
  type Connector,
  type Integration,
  type ConnectorId,
  type KeyConnectorKind,
  type IntegrationSection,
  type IntegrationStatus,
  type McpServer,
  type PluginDef,
} from "@/lib/api";
import { errorMessage, timeAgo } from "@/lib/data-sources";
import { RoleGuard } from "@/components/role-guard";
import { Page, PageHeader, Section } from "@/components/page";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { Field, SecretInput } from "@/components/field";
import { AwsAbilitiesPanel, AwsAbilitySummary, ConnectorForm, JIRA_APP } from "@/components/connections";
import { Switch } from "@/components/teams-webhook";
import { ChannelPicker, channelsPayload, draftDirty, draftFrom, draftValid, NO_WEBHOOKS, type ChannelsDraft } from "@/components/chat-channels";
import type { AlertNotifySettings, ChatChannel } from "@/lib/api";
import { Disclosure } from "@/components/disclosure";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { focusRing, inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { ChevronRightIcon } from "@/components/icons";
import { BrandIcon } from "@/components/brand-icons";
import { AddMcpServerDialog, McpServerPanel, connectCatalogServer } from "@/components/mcp-servers";

// Settings → Integrations: every outside system Coderhelm connects to, as one
// list per kind of tool. One row per integration with the same columns in the
// same places (mark, name and a short line, status, one action), so the eye
// runs down a column instead of zigzagging across cards. A row opens its
// settings: in place, or on its own page for GitHub, Jira and AWS. Why
// something isn't working is said inside, not on the row.

export default function IntegrationsPageGuarded() {
  return (
    <RoleGuard need="view_integrations">
      <IntegrationsPage />
    </RoleGuard>
  );
}

const SECTIONS: { id: IntegrationSection; anchor: string; title: string }[] = [
  { id: "code", anchor: "code-and-tickets", title: "Code and tickets" },
  { id: "cloud", anchor: "cloud", title: "Cloud" },
  { id: "monitoring", anchor: "monitoring", title: "Monitoring" },
  { id: "docs", anchor: "docs-and-design", title: "Docs and design" },
  { id: "chat", anchor: "chat", title: "Chat" },
  { id: "other", anchor: "other-tools", title: "Other tools" },
  { id: "mcp", anchor: "mcp-servers", title: "MCP servers" },
];

const STATUS: Record<IntegrationStatus, { label: string; dot: string; text: string }> = {
  connected: { label: "Connected", dot: "bg-emerald-400", text: "text-zinc-200" },
  needs_credentials: { label: "Needs credentials", dot: "bg-amber-400", text: "text-amber-300" },
  needs_reconnect: { label: "Needs reconnect", dot: "bg-amber-400", text: "text-amber-300" },
  not_connected: { label: "Not connected", dot: "bg-zinc-600", text: "text-zinc-500" },
  error: { label: "Not working", dot: "bg-red-400", text: "text-red-300" },
};

/** Problems first, then what works, then what could be added. */
const ORDER: Record<IntegrationStatus, number> = { needs_credentials: 0, needs_reconnect: 0, error: 1, connected: 2, not_connected: 3 };

/** What each one is for, short enough for one line of a list. The full sentence is inside. */
const SHORT: Record<string, string> = {
  github: "Reads code, opens and reviews pull requests",
  jira: "Starts work from tickets and keeps them in step",
  aws: "Logs, metrics and Airflow through a read-only role",
  newrelic: "Queries, deploy markers and error rates",
  confluence: "Reads pages for context",
  opensearch: "Searches the indexes your app reads",
  rest: "Reads records from an API you use",
  teams: "Posts alerts and pull request links to a Teams channel",
  slack: "Posts alerts and pull request links to a Slack channel",
  sentry: "Error events, issues and incidents",
  figma: "Design tokens, components and assets",
  sanity: "Documents, schemas and content",
  notion: "Pages, databases and docs",
  linear: "Issues, projects and status",
  stripe: "Charges, subscriptions and customers",
  gitlab: "Repositories, merge requests and pipelines",
  grafana: "Dashboards, metrics and alerts",
  posthog: "Product analytics and feature flags",
  vercel: "Deployments, domains and build logs",
  snyk: "Vulnerabilities in code and dependencies",
  mongodb: "Collections and queries",
  redis: "Keys and values",
  upstash: "Redis and queues",
  turso: "Databases and queries",
  neon: "Postgres databases and branches",
  launchdarkly: "Feature flags and targeting",
  atlassian: "Jira issues and Confluence pages, through Atlassian's own server",
};

function shortLine(item: Integration): string {
  if (item.id.startsWith("mcp:")) return remoteOf(item)?.url ?? item.does;
  return SHORT[item.id.startsWith("aws") ? "aws" : item.id.split(":")[0]] ?? item.does;
}

/** The remote server behind a row: one added by address, or a catalog server connected by OAuth. */
function remoteOf(item: Integration): McpServer | null {
  return ((item.detail as { remote?: McpServer | null }).remote ?? null) as McpServer | null;
}

/** The anchor a row answers to (`#integration-aws` for the first AWS account). */
function anchorOf(item: Integration, firstAws: boolean): string {
  if (item.id.startsWith("aws")) return firstAws ? "integration-aws" : `integration-${item.id}`;
  return `integration-${item.id}`;
}

function IntegrationsPage() {
  const [items, setItems] = useState<Integration[] | null>(null);
  // Whether you may connect or change integrations: your role, not the
  // answer's `can_edit` (which a custom role's request reads as its floor).
  const { can } = useCan();
  const data = items ? { items, canEdit: can("integrations") } : null;
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const r = await api.getIntegrations();
      setItems(r.items);
    } catch (e) {
      setError(errorMessage(e, "The request failed."));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Open the row a link points at (#integration-sentry from a skill check).
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
    const c = { connected: 0, needs_credentials: 0, needs_reconnect: 0, error: 0, not_connected: 0 };
    for (const i of data?.items ?? []) c[i.status]++;
    return c;
  }, [data]);

  const replace = (next: Integration) =>
    setItems((d) => (d ? d.map((i) => (i.id === next.id ? next : i)) : d));
  const [adding, setAdding] = useState(false);

  return (
    <Page testId="integrations-page">
      <PageHeader
        title="Integrations"
        lead={
          <>
            What Coderhelm is connected to and whether each one works. Databases, APIs and log searches are in{" "}
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
          {counts.needs_reconnect > 0 && <span className="text-amber-300"> · {counts.needs_reconnect} need reconnecting</span>}
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
          {[3, 2].map((n, i) => (
            <div key={i}>
              <Skeleton className="mb-3 h-3 w-32" />
              <div className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
                {Array.from({ length: n }, (_, j) => (
                  <div key={j} className="flex items-center gap-3 px-4 py-3">
                    <Skeleton className="h-8 w-8 rounded-md" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {data &&
        SECTIONS.map((sec) => {
          const items = data.items.filter((i) => i.section === sec.id);
          const mcp = sec.id === "mcp";
          if (items.length === 0 && !(mcp && data.canEdit)) return null;
          const sorted = [...items].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
          let awsSeen = false;
          return (
            <Section
              key={sec.id}
              id={sec.anchor}
              title={sec.title}
              className="!mt-8"
              description={
                mcp
                  ? "Any remote MCP server, by its address. Coderhelm finds how it signs in (OAuth, a key, or nothing), and agents get only the tools you allow."
                  : undefined
              }
              actions={
                mcp && data.canEdit ? (
                  <button type="button" onClick={() => setAdding(true)} className={secondaryButton} data-testid="add-mcp-server-button">
                    Add server
                  </button>
                ) : undefined
              }
            >
              {mcp && items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-800 px-4 py-3 text-sm text-zinc-500">
                  None yet. Servers from the list above that offer OAuth connect from their own row.
                </p>
              ) : (
              <ul
                aria-labelledby={`${sec.anchor}-heading`}
                className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40"
              >
                {sorted.map((item) => {
                  const firstAws = item.id.startsWith("aws") && !awsSeen;
                  if (item.id.startsWith("aws")) awsSeen = true;
                  const anchor = anchorOf(item, firstAws);
                  return (
                    <IntegrationRow
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
              </ul>
              )}
            </Section>
          );
        })}
      {data?.canEdit && (
        <AddMcpServerDialog
          open={adding}
          onOpenChange={setAdding}
          onAdded={async (server) => {
            await load();
            window.location.hash = `integration-mcp:${server.id}`;
          }}
        />
      )}
      {data && (
        <Section
          id="websites"
          title="Your websites"
          description="Coderhelm can check that links and redirects on these sites work (status and page title only). Each domain covers its subdomains."
        >
          <WebsitesCard canEdit={data.canEdit} />
        </Section>
      )}
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

/** The one thing a row offers, by status. Opening the row is how it's done. */
function actionLabel(item: Integration, canEdit: boolean, hasPage: boolean): string {
  if (!canEdit) return hasPage ? "View" : "";
  if (item.status === "connected") return "Manage";
  if (item.status === "needs_credentials") return "Add credentials";
  if (item.status === "needs_reconnect") return "Reconnect";
  if (item.status === "error") return "See why";
  return "Connect";
}

function IntegrationRow({
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
  const remote = remoteOf(item);
  // Anyone who may connect their own account opens a server each person signs in to.
  const { can } = useCan();
  const personal = remote?.auth === "oauth" && remote.sharing === "personal" && can("mcp_connect");
  useEffect(() => {
    if (startOpen && (canEdit || personal)) setOpen(true);
  }, [startOpen, canEdit, personal]);

  const st = STATUS[item.status];
  const kind = kindOf(item);
  const aws = kind === "aws_account" ? (item.detail as unknown as AwsAccountAbilities) : null;
  const lineId = `${anchor}-line`;
  const panelId = `${anchor}-panel`;

  // GitHub, Jira and the first AWS connection have their own page; the rest open in place.
  const pageHref = kind === "github" || kind === "jira" || kind === "aws_connect" ? item.manage_href : "";
  // Members can open the pages they're allowed to read; everything else is admin only.
  const memberHref = kind === "github" || kind === "aws_connect" || kind === "aws_account" ? item.manage_href : "";
  const href = canEdit ? pageHref : memberHref;
  const opens = Boolean(href) || canEdit || personal;
  const action = actionLabel(item, canEdit || personal, Boolean(href) || personal);
  const checked = item.last_check ? timeAgo(item.last_check) : "";

  const checkAgain = async () => {
    setBusy(true);
    try {
      if (kind === "aws_account" && aws) {
        const r = await api.checkAwsAbilities(aws.account);
        onChange({ ...item, status: r.status, reason: r.reason, last_check: r.last_check, detail: r.account as unknown as Record<string, unknown> });
      } else if (kind === "connector") {
        const r = await api.testConnector(item.id as ConnectorId);
        toast(r.connector.status === "ready" ? `${item.name} works` : `${item.name} needs attention`, r.connector.status === "ready" ? "success" : "error");
        await onReload();
      } else if (remote) {
        const r = await api.checkMcpServer(remote.id);
        toast(r.error ? r.error : `${item.name} works`, r.error ? "error" : "success");
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

  // Same columns on every row: mark · name and line · status · action.
  // Below 640px the status moves under the name and the action becomes a chevron.
  const grid = "grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2.5 text-left sm:grid-cols-[2rem_minmax(0,1fr)_10.5rem_8.5rem]";
  const statusText = (
    <span className={`inline-flex items-center gap-1.5 ${st.text}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.dot}`} />
      {st.label}
    </span>
  );
  const face = (
    <>
      <BrandIcon id={item.id} name={item.name} />
      <span className="min-w-0">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="min-w-0 font-medium text-zinc-100 sm:truncate">{item.name}</span>
          <span className="shrink-0 text-xs sm:hidden">{statusText}</span>
        </span>
        <span id={lineId} data-testid="integration-does" title={item.does} className="block text-sm text-zinc-500 sm:truncate">
          {shortLine(item)}
        </span>
      </span>
      <span data-testid="integration-status" className="hidden text-sm sm:block">
        {statusText}
        {checked && <span className="block pl-3 text-xs text-zinc-500">Checked {checked}</span>}
      </span>
      <span className="flex items-center justify-end gap-1 text-sm">
        {action && !open && (
          <span
            data-testid="integration-action"
            className={`hidden sm:inline ${
              item.status === "connected" || !canEdit
                ? "text-zinc-400 group-hover:text-zinc-100"
                : "rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-100 group-hover:border-zinc-500"
            }`}
          >
            {action}
          </span>
        )}
        {opens && (
          <span
            aria-hidden="true"
            className={`text-zinc-500 transition-transform motion-reduce:transition-none group-hover:text-zinc-200 ${open ? "rotate-90" : ""} ${
              item.status === "connected" || !canEdit || open ? "" : "sm:hidden"
            }`}
          >
            <ChevronRightIcon />
          </span>
        )}
      </span>
    </>
  );

  // The row is one control; its name says what it is and how it's doing.
  const label = `${item.name}, ${st.label}${action ? `. ${action}` : ""}`;
  const control = `group ${grid} outline-none transition-colors motion-reduce:transition-none hover:bg-zinc-800/40 focus-visible:bg-zinc-800/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-300`;

  return (
    <li id={anchor} tabIndex={-1} className="min-w-0 scroll-mt-4 outline-none" data-testid={`integration-${item.id}`} data-status={item.status}>
      {href ? (
        <Link href={href} className={control} aria-label={label} aria-describedby={lineId}>
          {face}
        </Link>
      ) : opens ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={label}
          aria-describedby={lineId}
          className={control}
        >
          {face}
        </button>
      ) : (
        <div className={grid} aria-label={`${item.name}, ${st.label}`} role="group">
          {face}
        </div>
      )}

      {open && (canEdit || personal) && (
        <div id={panelId} data-testid="integration-panel" className="border-t border-zinc-800 bg-zinc-950/40 px-4 pb-4 pt-3 sm:pl-[3.75rem]">
          <p className="text-sm text-zinc-400">{item.does}</p>
          {item.reason && !remote && (
            <p className={`mt-2 text-sm ${item.status === "error" ? "text-red-300" : item.status === "needs_credentials" ? "text-amber-300" : "text-zinc-400"}`}>
              {item.reason}
            </p>
          )}
          {aws && <AwsAbilitySummary a={aws} />}
          {item.status === "error" && kind !== "chat" && !remote && (
            <p className="mt-3">
              <button type="button" onClick={checkAgain} disabled={busy} className={secondaryButton}>
                {busy ? "Checking…" : "Check again"}
              </button>
            </p>
          )}
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
          {kind === "remote" && remote && <McpServerPanel server={remote} canEdit={canEdit} onChanged={onReload} onRemoved={() => setOpen(false)} />}
          {kind === "plugin" && remote && <McpServerPanel server={remote} canEdit={canEdit} onChanged={onReload} />}
          {kind === "plugin" && canEdit && <PluginPanel item={item} onChanged={onReload} onClose={() => setOpen(false)} />}
          {kind === "chat" && <ChatPanel channel={item.id as ChatChannel} onSaved={onReload} />}
          <p className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            <button type="button" onClick={() => setOpen(false)} className={linkButton}>
              Close
            </button>
            {kind === "aws_account" && (
              <Link href={item.manage_href} className={linkButton}>
                Log groups, findings and more accounts
              </Link>
            )}
          </p>
        </div>
      )}
    </li>
  );
}

type Kind = "github" | "jira" | "aws_connect" | "aws_account" | "connector" | "chat" | "remote" | "plugin";

function kindOf(item: Integration): Kind {
  if (item.id === "github") return "github";
  if (item.id === "jira") return "jira";
  if (item.id === "aws") return "aws_connect";
  if (item.id.startsWith("aws-")) return "aws_account";
  if (["newrelic", "confluence", "opensearch", "rest"].includes(item.id.split(":")[0])) return "connector";
  if (item.id === "teams" || item.id === "slack") return "chat";
  if (item.id.startsWith("mcp:")) return "remote";
  return "plugin";
}

function ConnectorPanel({ item, onSaved }: { item: Integration; onSaved: () => Promise<void> }) {
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const c = item.detail as unknown as Connector;
  // Confluence through the Jira app: removing only resets its settings (the
  // app keeps connecting it, reading only).
  const viaApp = c.via === JIRA_APP;
  const remove = async () => {
    const ok = await confirm({
      title: viaApp ? `Reset ${item.name}?` : `Remove ${item.name}?`,
      message: viaApp
        ? "Writes turn off and the page list and spaces are cleared. Agents keep reading through the Jira app."
        : "Agents stop using it right away and the saved key is deleted.",
      confirmLabel: viaApp ? "Reset" : "Remove",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.removeConnector(item.id as ConnectorId);
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
        item={{ ...c, kind: item.id.split(":")[0] as KeyConnectorKind, id: item.id, label: item.name, connected: Boolean(c.connected) }}
        onSaved={() => {
          onSaved();
        }}
      />
      {c.connected && (!viaApp || Boolean(c.updated_at)) && (
        <p className="mt-3">
          <button type="button" onClick={remove} className={linkButton}>
            {viaApp ? `Reset ${item.name} settings` : `Remove ${item.name}`}
          </button>
        </p>
      )}
    </>
  );
}

/** An MCP server: credentials (entered here, never shown again), its test, its instructions, and turning it off. */
function PluginPanel({ item, onChanged, onClose }: { item: Integration; onChanged: () => Promise<void>; onClose: () => void }) {
  const d = item.detail as { plugin: PluginDef; enabled: boolean; has_credentials: boolean; custom_prompt: string; remote?: McpServer | null };
  const p = d.plugin;
  const keyForm = <PluginKeyPanel item={item} onChanged={onChanged} onClose={onClose} />;
  if (!p.remote_url) return keyForm;
  const hasKeys = p.credential_fields.length > 0;
  return (
    <div className="mt-4 flex flex-col gap-4">
      {!d.remote && <OAuthOffer plugin={p} />}
      {hasKeys && (
        <Disclosure summary={d.remote ? "Or use a key instead" : "Use a key instead"} defaultOpen={d.has_credentials && !d.remote}>
          {keyForm}
        </Disclosure>
      )}
    </div>
  );
}

/** Signing in through the vendor's own remote server: no key to paste, and tools allowed one by one. */
function OAuthOffer({ plugin }: { plugin: PluginDef }) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3" data-testid="oauth-offer">
      <p className="text-sm text-zinc-300">
        Sign in with {plugin.name}: nobody pastes a key, Coderhelm renews the sign-in on its own, and you pick which of its tools agents may use.
      </p>
      <div>
        <button
          type="button"
          disabled={busy}
          className={primaryButton}
          onClick={async () => {
            setBusy(true);
            try {
              await connectCatalogServer(plugin.id);
            } catch (e) {
              toast(errorMessage(e, "Couldn't start the sign-in."), "error");
              setBusy(false);
            }
          }}
        >
          {busy ? "Opening sign-in…" : `Connect with ${plugin.name}`}
        </button>
      </div>
    </div>
  );
}

/** An MCP server run with a key: credentials (entered here, never shown again), its test, its instructions, and turning it off. */
function PluginKeyPanel({ item, onChanged, onClose }: { item: Integration; onChanged: () => Promise<void>; onClose: () => void }) {
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
      // Connecting a server that is off: switch it on only once there are credentials to save.
      if (!d.enabled) await api.enablePlugin(p.id);
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
    <div className="mt-4 flex flex-col gap-4">
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
      {d.enabled && (
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
      )}
      {d.enabled && (
        <p>
          <button type="button" onClick={turnOff} className={linkButton}>
            Turn off {p.name}
          </button>
        </p>
      )}
    </div>
  );
}

/** The team's channel in Teams or Slack (the same one Alert routes post to). */
function ChatPanel({ channel, onSaved }: { channel: ChatChannel; onSaved: () => Promise<void> }) {
  const [saved, setSaved] = useState<AlertNotifySettings | null>(null);
  const [draft, setDraft] = useState<ChannelsDraft>(draftFrom(NO_WEBHOOKS));
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();
  useEffect(() => {
    api
      .getAlertNotify()
      .then((s) => {
        setSaved(s);
        // A first channel turns posting on; a saved one shows what is set.
        const first = !s.webhooks.teams.set && !s.webhooks.slack.set;
        setEnabled(s.enabled || first);
        const d = draftFrom(s.webhooks);
        setDraft({ ...d, [channel]: { on: true, url: "" } });
      })
      .catch(() => setError("Couldn't load the channel."));
  }, [channel]);
  const loaded = !!saved;
  const ok = draftValid(draft, saved?.webhooks, enabled);
  const dirty = !!saved && (saved.enabled !== enabled || draftDirty(draft, saved.webhooks));
  const label = channel === "slack" ? "Slack" : "Teams";
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await api.saveAlertNotify({ enabled, ...channelsPayload(draft, saved?.webhooks) });
      toast(`${label} channel saved`);
      await onSaved();
    } catch (e) {
      setError(errorMessage(e, "Couldn't save. Check the webhook address."));
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      className="mt-4 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <ChannelPicker
        idPrefix={`integrations-${channel}`}
        legend={`${label} channel for alerts`}
        draft={draft}
        saved={saved?.webhooks}
        onChange={setDraft}
        disabled={!loaded}
        destination={{ destination: "alerts" }}
        only={[channel]}
      />
      <Switch checked={enabled} onChange={setEnabled} disabled={!loaded} label="Post alerts to the team channel" />
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <div>
        <button type="submit" disabled={saving || !loaded || !ok || !dirty} className={primaryButton}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

/** The team's own public domains the reviewer may open pages on to check links. */
function WebsitesCard({ canEdit }: { canEdit: boolean }) {
  const [domains, setDomains] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoadError("");
    try {
      setDomains(await api.getWebDomains());
    } catch (e) {
      setLoadError(errorMessage(e, "Couldn't load your websites."));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const save = async (next: string[], done: string) => {
    setSaving(true);
    setError("");
    try {
      setDomains(await api.setWebDomains(next));
      toast(done);
      return true;
    } catch (e) {
      setError(errorMessage(e, "Couldn't save the websites."));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const add = async () => {
    const entries = draft
      .split(/[\s,]+/)
      .map((d) => d.trim())
      .filter(Boolean);
    if (!domains || entries.length === 0) return;
    if (await save([...domains, ...entries], entries.length === 1 ? `${entries[0]} added` : "Websites added")) setDraft("");
  };

  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4" data-testid="websites-card">
      {loadError ? (
        <p role="alert" className="text-sm text-red-400">
          {loadError}{" "}
          <button type="button" onClick={load} className={linkButton}>
            Try again
          </button>
        </p>
      ) : !domains ? (
        <Skeleton className="h-8 w-full" />
      ) : (
        <>
          {domains.length === 0 ? (
            <p className="text-sm text-zinc-400">No websites yet, so Coderhelm doesn&apos;t open any pages.</p>
          ) : (
            <ul aria-label="Your websites" className="flex flex-wrap gap-2">
              {domains.map((d) => (
                <li key={d} className="inline-flex min-w-0 items-center gap-1 rounded-full border border-zinc-700 bg-zinc-950 py-1 pl-3 pr-1 text-sm text-zinc-200">
                  <span data-testid="website-name" className="min-w-0 break-all font-mono text-xs">{d}</span>
                  {canEdit ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => save(domains.filter((x) => x !== d), `${d} removed`)}
                      aria-label={`Remove ${d}`}
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50 ${focusRing}`}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  ) : (
                    <span className="pr-2" />
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit ? (
            <form
              className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <div className="min-w-0 flex-1">
                <Field id="websites-add" label="Add a domain" helper="A bare domain like example.com. Separate several with commas.">
                  {(props) => (
                    <input
                      {...props}
                      className={inputClass}
                      placeholder="example.com"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      inputMode="url"
                    />
                  )}
                </Field>
              </div>
              <button type="submit" disabled={saving || !draft.trim()} className={`${secondaryButton} sm:mb-6`}>
                {saving ? "Saving…" : "Add"}
              </button>
            </form>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">Only admins can change this list.</p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-400">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
