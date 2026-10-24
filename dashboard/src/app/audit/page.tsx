"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { pluginsApi, PluginError, type AuditEvent, type InstalledPlugin } from "@/lib/plugins";
import { AuditList, PluginsGate } from "@/components/plugins";
import { RoleGuard } from "@/components/role-guard";
import { Page, PageHeader } from "@/components/page";
import { ListEmpty, ListError, ListSkeleton, LoadMore, useListParams } from "@/components/list";
import { inputClass } from "@/components/ui";

// The audit log: one stream of who or what triggered each plugin run, the
// plugin version, every tool and its risk, approvals and results.

const ACTIONS: { value: string; label: string }[] = [
  { value: "", label: "Everything" },
  { value: "plugin.installed", label: "Installs" },
  { value: "plugin.updated", label: "Updates" },
  { value: "plugin.rolled_back", label: "Rollbacks" },
  { value: "run.started", label: "Runs started" },
  { value: "run.refused", label: "Runs refused" },
  { value: "tool.called", label: "Tool calls" },
  { value: "draft.approved", label: "Approvals" },
  { value: "draft.stopped", label: "Stops" },
  { value: "draft.published", label: "Publishes" },
  { value: "schedule.cancelled", label: "Cancelled publishes" },
];

export default function AuditPageGated() {
  return (
    <PluginsGate title="Audit log">
      <RoleGuard need="plugins.audit">
        <Suspense fallback={<Page><PageHeader title="Audit log" /><div className="mt-8"><ListSkeleton rows={4} label="Loading the audit log" /></div></Page>}>
          <AuditPage />
        </Suspense>
      </RoleGuard>
    </PluginsGate>
  );
}

function AuditPage() {
  const [params, setParams] = useListParams({ plugin: "", action: "" });
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);

  useEffect(() => {
    pluginsApi.installed().then((r) => setPlugins(r.plugins)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await pluginsApi.audit({ plugin: params.plugin || undefined, action: params.action || undefined });
      setEvents(r.events);
      setNext(r.next);
      setError("");
    } catch (e) {
      setError(e instanceof PluginError || e instanceof Error ? e.message : "The request failed.");
      setEvents((prev) => prev ?? []);
    }
  }, [params.plugin, params.action]);

  useEffect(() => {
    setEvents(null);
    load();
  }, [load]);

  const loadMore = async () => {
    if (!next) return;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const r = await pluginsApi.audit({ plugin: params.plugin || undefined, action: params.action || undefined, cursor: next });
      setEvents((prev) => [...(prev ?? []), ...r.events]);
      setNext(r.next);
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const filtered = !!params.plugin || !!params.action;
  return (
    <Page>
      <PageHeader title="Audit log" lead="Every plugin step in one place: who or what started it, which version ran, each tool and how much it could do, who approved, and what happened." />
      <div className="mt-8 flex flex-wrap items-end gap-3" data-testid="audit-filters">
        <div className="min-w-0">
          <label htmlFor="audit-plugin" className="mb-1.5 block text-sm font-semibold text-zinc-100">
            Plugin
          </label>
          <select id="audit-plugin" className={`${inputClass} max-w-xs`} value={params.plugin} onChange={(e) => setParams({ plugin: e.target.value })}>
            <option value="">All plugins</option>
            {plugins.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor="audit-action" className="mb-1.5 block text-sm font-semibold text-zinc-100">
            What happened
          </label>
          <select id="audit-action" className={`${inputClass} max-w-xs`} value={params.action} onChange={(e) => setParams({ action: e.target.value })}>
            {ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <div className="mt-6">
          <ListError title="We couldn't load the audit log" onRetry={load}>
            {error}
          </ListError>
        </div>
      )}
      <div className="mt-6">
        {events === null ? (
          <ListSkeleton rows={4} label="Loading the audit log" />
        ) : events.length === 0 ? (
          <ListEmpty title={filtered ? "Nothing matches" : "Nothing logged yet"} onClear={filtered ? () => setParams({ plugin: "", action: "" }) : undefined} />
        ) : (
          <AuditList events={events} />
        )}
      </div>
      <LoadMore hasMore={!!next} loading={loadingMore} onClick={loadMore} failed={moreFailed} />
    </Page>
  );
}
