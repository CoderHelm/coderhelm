"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type EnabledPlugin, type PluginDef } from "@/lib/api";
import { errorMessage } from "@/lib/data-sources";
import { hasRole } from "@/lib/roles";
import { useMe } from "@/hooks/use-me";
import { RoleGuard } from "@/components/role-guard";
import { Page, PageHeader } from "@/components/page";
import { BrandIcon } from "@/components/brand-icons";
import { McpServerPanel } from "@/components/mcp-server-panel";
import { Chip, List, ListError, ListSection, ListSkeleton } from "@/components/list";
import { linkButton, secondaryButton } from "@/components/ui";

// Connections: the MCP servers a team switches on with a key (Sentry, Linear,
// Notion and the rest). This page used to be called Plugins; a plugin is now
// a package a team installs (see /plugins), and a plugin can name the
// connections it needs.

export default function ConnectionsPageGuarded() {
  return (
    <RoleGuard minRole="member">
      <ConnectionsPage />
    </RoleGuard>
  );
}

function ConnectionsPage() {
  const me = useMe();
  const canEdit = hasRole(me?.role, "admin");
  const [catalog, setCatalog] = useState<PluginDef[] | null>(null);
  const [enabled, setEnabled] = useState<EnabledPlugin[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState("");

  const load = useCallback(async () => {
    try {
      const [c, e] = await Promise.all([api.getPluginCatalog(), api.listEnabledPlugins()]);
      setCatalog(c.plugins);
      setEnabled(e.plugins);
      setError("");
    } catch (e) {
      setError(errorMessage(e, "The request failed."));
      setCatalog((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stateOf = (p: PluginDef) => enabled.find((e) => e.plugin_id === p.id);
  const all = catalog ?? [];
  const on = all.filter((p) => stateOf(p)?.enabled);
  const off = all.filter((p) => !stateOf(p)?.enabled);

  const row = (p: PluginDef) => {
    const st = stateOf(p);
    const isOn = !!st?.enabled;
    const ready = isOn && !!st?.has_credentials;
    const panelId = `connection-${p.id}-panel`;
    return (
      <li key={p.id} id={`connection-${p.id}`} className="min-w-0 scroll-mt-4" data-testid={`connection-${p.id}`} data-status={ready ? "connected" : isOn ? "needs_credentials" : "off"}>
        <div className="flex min-w-0 flex-wrap items-center gap-3 px-4 py-3">
          <BrandIcon id={p.id} name={p.name} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-100">{p.name}</p>
            <p className="text-sm text-zinc-500">{p.description}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {ready ? <Chip tone="success">Connected</Chip> : isOn ? <Chip tone="waiting">Needs credentials</Chip> : <Chip tone="muted">Off</Chip>}
            {canEdit && (
              <button
                type="button"
                className={secondaryButton}
                aria-expanded={open === p.id}
                aria-controls={panelId}
                onClick={() => setOpen((v) => (v === p.id ? "" : p.id))}
              >
                {open === p.id ? "Close" : isOn ? "Manage" : "Connect"}
              </button>
            )}
          </div>
        </div>
        {open === p.id && canEdit && (
          <div id={panelId} className="border-t border-zinc-800 bg-zinc-950/40 px-4 pb-4 pt-3 sm:pl-[3.75rem]">
            <McpServerPanel
              server={{ plugin: p, enabled: isOn, has_credentials: !!st?.has_credentials, custom_prompt: st?.custom_prompt ?? "" }}
              onChanged={load}
              onClose={() => setOpen("")}
            />
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
            Tools your agents can reach with a key you save once: issue trackers, error trackers, docs and design tools. Plugins
            name the connections they need, and installing a plugin never connects anything by itself.
            {!canEdit && me && " Only admins can connect or change these."}
          </>
        }
      />
      {error && (
        <div className="mt-6">
          <ListError title="We couldn't load your connections" onRetry={load}>
            {error}
          </ListError>
        </div>
      )}
      {catalog === null ? (
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
          <div className="mt-8">
            <ListSection id="available" title="Available" count={off.length || undefined}>
              {off.length > 0 && <List label="Available">{off.map(row)}</List>}
            </ListSection>
          </div>
        </>
      )}
    </Page>
  );
}
