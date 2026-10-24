"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Integration, type IntegrationStatus, type McpServer } from "@/lib/api";
import { errorMessage } from "@/lib/data-sources";
import { useCan } from "@/hooks/use-can";
import { RoleGuard } from "@/components/role-guard";
import { Page, PageHeader } from "@/components/page";
import { BrandIcon } from "@/components/brand-icons";
import { AddMcpServerDialog, McpServerPanel } from "@/components/mcp-servers";
import { PluginPanel } from "@/components/mcp-server-panel";
import { Chip, List, ListError, ListSection, ListSkeleton, type Tone } from "@/components/list";
import { linkButton, secondaryButton } from "@/components/ui";

// Connections: the MCP servers agents can reach, the catalog ones a team
// switches on (Sentry, Linear, Notion…) and any remote server added by its
// address. This page used to be called Plugins; a plugin is now a package a
// team installs (see /plugins), and a plugin names the connections it needs.

export default function ConnectionsPageGuarded() {
  return (
    <RoleGuard need="view_integrations">
      <ConnectionsPage />
    </RoleGuard>
  );
}

const STATUS: Record<IntegrationStatus, { label: string; tone: Tone }> = {
  connected: { label: "Connected", tone: "success" },
  needs_credentials: { label: "Needs credentials", tone: "waiting" },
  needs_reconnect: { label: "Needs reconnecting", tone: "waiting" },
  error: { label: "Not working", tone: "danger" },
  not_connected: { label: "Off", tone: "muted" },
};

function remoteOf(item: Integration): McpServer | null {
  return ((item.detail as { remote?: McpServer | null }).remote ?? null) as McpServer | null;
}

function isMcp(item: Integration): boolean {
  return item.section === "other" || item.section === "mcp" || item.id.startsWith("mcp:");
}

function ConnectionsPage() {
  const { me, can } = useCan();
  const canEdit = can("integrations");
  const [items, setItems] = useState<Integration[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.getIntegrations();
      setItems(r.items.filter(isMcp));
      setError("");
    } catch (e) {
      setError(errorMessage(e, "The request failed."));
      setItems((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const all = items ?? [];
  const on = all.filter((i) => i.status !== "not_connected");
  const off = all.filter((i) => i.status === "not_connected");

  const row = (item: Integration) => {
    const st = STATUS[item.status] ?? STATUS.not_connected;
    const remote = remoteOf(item);
    const added = item.id.startsWith("mcp:");
    const panelId = `connection-${item.id}-panel`;
    return (
      <li key={item.id} id={`connection-${item.id}`} className="min-w-0 scroll-mt-4" data-testid={`connection-${item.id}`} data-status={item.status}>
        <div className="flex min-w-0 flex-wrap items-center gap-3 px-4 py-3">
          <BrandIcon id={item.id} name={item.name} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-100">{item.name}</p>
            <p className="text-sm text-zinc-500">{added && remote ? remote.url : item.does}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Chip tone={st.tone}>{st.label}</Chip>
            {(canEdit || remote) && (
              <button
                type="button"
                className={secondaryButton}
                aria-expanded={open === item.id}
                aria-controls={panelId}
                onClick={() => setOpen((v) => (v === item.id ? "" : item.id))}
              >
                {open === item.id ? "Close" : item.status === "not_connected" ? "Connect" : "Manage"}
              </button>
            )}
          </div>
        </div>
        {open === item.id && (
          <div id={panelId} className="border-t border-zinc-800 bg-zinc-950/40 px-4 pb-4 pt-3 sm:pl-[3.75rem]">
            {item.reason && <p className="text-sm text-zinc-400">{item.reason}</p>}
            {remote && <McpServerPanel server={remote} canEdit={canEdit} onChanged={load} onRemoved={added ? () => setOpen("") : undefined} />}
            {!added && canEdit && <PluginPanel item={item} onChanged={load} onClose={() => setOpen("")} />}
            <p className="mt-4">
              <button type="button" onClick={() => setOpen("")} className={linkButton}>
                Close
              </button>
            </p>
          </div>
        )}
      </li>
    );
  };

  return (
    <Page>
      <PageHeader
        title="Connections"
        lead={
          <>
            Tools your agents can reach: issue trackers, error trackers, docs and design tools, and any remote MCP server added by its
            address. Plugins name the connections they need, and installing a plugin never connects anything by itself.
            {!canEdit && me && " Only admins can connect or change these."}
          </>
        }
        actions={
          canEdit ? (
            <button type="button" onClick={() => setAdding(true)} className={secondaryButton} data-testid="add-connection-button">
              Add server
            </button>
          ) : undefined
        }
      />
      {error && (
        <div className="mt-6">
          <ListError title="We couldn't load your connections" onRetry={load}>
            {error}
          </ListError>
        </div>
      )}
      {items === null ? (
        <div className="mt-8">
          <ListSkeleton rows={4} label="Loading connections" />
        </div>
      ) : (
        <>
          <div className="mt-8">
            <ListSection id="connected" title="Connected" count={on.length || undefined}>
              {on.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-800 px-4 py-4 text-sm text-zinc-400">Nothing connected yet.</p>
              ) : (
                <List label="Connected">{on.map(row)}</List>
              )}
            </ListSection>
          </div>
          {off.length > 0 && (
            <div className="mt-8">
              <ListSection id="available" title="Available" count={off.length}>
                <List label="Available">{off.map(row)}</List>
              </ListSection>
            </div>
          )}
        </>
      )}
      {canEdit && (
        <AddMcpServerDialog
          open={adding}
          onOpenChange={setAdding}
          onAdded={async (server) => {
            await load();
            setOpen(`mcp:${server.id}`);
          }}
        />
      )}
    </Page>
  );
}
