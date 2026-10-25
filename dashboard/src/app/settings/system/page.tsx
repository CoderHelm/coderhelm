"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type AutoUpdateSettings, type SystemVersion, type UpdateEntry } from "@/lib/api";
import { useInstallAdmin } from "@/lib/install";
import { useToast } from "@/components/toast";
import { Page, PageHeader } from "@/components/page";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { Chip } from "@/components/list";
import { Markdown } from "@/components/markdown";
import { inputClass, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { SaveBar, SettingsRow, SettingsSection, Switch, useDirtyForm } from "@/components/settings";

const DAYS: [string, string][] = [
  ["daily", "Every day"],
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
];

const STATUS: Record<UpdateEntry["status"], { label: string; tone: "success" | "danger" | "waiting" | "neutral" }> = {
  running: { label: "Running", tone: "waiting" },
  succeeded: { label: "Succeeded", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  rolled_back: { label: "Rolled back", tone: "danger" },
};

const DEFAULTS: AutoUpdateSettings = { auto: false, channel: "stable", day: "sun", hour: 3, timezone: "UTC", majors: "ask" };

/** Settings → System: the install's version, updates and their history (self-hosted, install admins). */
export default function SystemPage() {
  const { ready, allowed } = useInstallAdmin();
  if (!ready) return null;
  if (!allowed) {
    return (
      <Page>
        <div className="max-w-xl" data-testid="system-unavailable">
          <Callout variant="neutral" title="Not available here">
            <p>This page is for the admins of a self-hosted Coderhelm install.</p>
            <p className="pt-1"><Link href="/settings" className={linkButton}>Back to Settings</Link></p>
          </Callout>
        </div>
      </Page>
    );
  }
  return <System />;
}

function System() {
  const { toast } = useToast();
  const [data, setData] = useState<SystemVersion | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<"" | "update" | "rollback">("");
  const form = useDirtyForm<AutoUpdateSettings>(DEFAULTS, { disabled: !data });

  const load = useCallback(async () => {
    try {
      const v = await api.getSystemVersion();
      setData(v);
      setError(false);
      form.reset({ ...DEFAULTS, ...(v.settings ?? {}) });
    } catch {
      setError(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const header = (
    <div className="mb-6">
      <PageHeader title="System" lead="Which version of Coderhelm runs here, how it is updated, and every update so far." />
    </div>
  );

  if (error) {
    return (
      <Page>
        {header}
        <Callout variant="error" title="Could not load this install's version">
          <button type="button" onClick={load} className={`mt-2 ${secondaryButton}`}>Try again</button>
        </Callout>
      </Page>
    );
  }
  if (!data) {
    return (
      <Page>
        {header}
        <div className="space-y-6" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Page>
    );
  }

  const v = form.values;
  const set = <K extends keyof AutoUpdateSettings>(k: K, val: AutoUpdateSettings[K]) => form.set(k, val);
  const latest = data.latest;
  const history = data.history ?? [];
  const canRollBack = history.some((h) => h.status === "succeeded" && h.from_version);

  const save = async () => {
    try {
      const r = await api.setAutoUpdate(form.values);
      form.reset({ ...DEFAULTS, ...r.settings });
      toast("Update settings saved");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save", "error");
    }
  };

  const start = async (kind: "update" | "rollback") => {
    setBusy(kind);
    try {
      const e = kind === "update" ? await api.updateNow(latest?.version) : await api.rollbackInstall();
      toast(kind === "update" ? `Updating to ${e.version}. This takes 10 to 20 minutes.` : `Rolling back to ${e.version}.`);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not start", "error");
    } finally {
      setBusy("");
    }
  };

  return (
    <Page>
      {header}
      <div className="space-y-8">
        <SettingsSection id="version" title="Version">
          <SettingsRow
            label="Running"
            testId="current-version"
            help={[
              data.current.commit && `Commit ${data.current.commit.slice(0, 7)}`,
              data.current.released_at && `released ${data.current.released_at.slice(0, 10)}`,
              data.current.config_fingerprint && `config ${data.current.config_fingerprint}`,
            ].filter(Boolean).join(", ") || undefined}
            control={() => <span className="font-mono text-sm text-zinc-100">{data.current.version ?? "Development build"}</span>}
          />
          <SettingsRow
            label="Latest release"
            testId="latest-version"
            control={() =>
              latest ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-zinc-100">{latest.version}</span>
                  <Chip tone="waiting">Update available</Chip>
                  {latest.breaking && <Chip tone="danger">Major: read the notes</Chip>}
                  {latest.prerelease && <Chip tone="neutral">Preview</Chip>}
                </span>
              ) : (
                <span className="text-sm text-zinc-400">You have the latest release.</span>
              )
            }
          />
          {data.running && (
            <div className="px-4 py-3">
              <Callout variant="neutral" title="An update is running">
                <p>Coderhelm stays available while it runs. This page shows the result when it finishes.</p>
              </Callout>
            </div>
          )}
          {latest && (
            <div className="min-w-0 px-4 py-4" data-testid="release-notes">
              <h3 className="mb-2 text-sm font-medium text-zinc-100">What&apos;s new in {latest.version}</h3>
              <div className="max-h-80 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-300">
                <Markdown>{latest.notes || "No notes for this release."}</Markdown>
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" className={primaryButton} disabled={!!busy || data.running} onClick={() => start("update")}>
                  {busy === "update" ? "Starting…" : `Update now to ${latest.version}`}
                </button>
                {latest.url && <a href={latest.url} target="_blank" rel="noopener noreferrer" className={linkButton}>Release page</a>}
              </div>
            </div>
          )}
        </SettingsSection>

        <SettingsSection id="auto" title="Automatic updates">
          <SettingsRow
            label="Install updates automatically"
            layout="toggle"
            help="In the maintenance window: health check, signature check, deploy, health check, and a roll back if the new release is unhealthy. Admins are emailed either way."
            control={(ids) => <Switch id={ids.inputId} checked={v.auto} onChange={(c) => set("auto", c)} labelledBy={ids.labelId} describedBy={ids.helpId} />}
          />
          <SettingsRow
            label="Maintenance window"
            help="The hour updates may start, in the time zone below."
            control={(ids) => (
              <div className="flex flex-wrap gap-2">
                <select id={ids.inputId} aria-label="Day" className={`${inputClass} w-auto`} value={v.day} onChange={(e) => set("day", e.target.value)}>
                  {DAYS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <select aria-label="Hour" className={`${inputClass} w-auto`} value={v.hour} onChange={(e) => set("hour", Number(e.target.value))}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>)}
                </select>
              </div>
            )}
          />
          <SettingsRow
            label="Time zone"
            help="An IANA name, such as Europe/Berlin or America/New_York."
            control={(ids) => <input id={ids.inputId} className={`${inputClass} sm:w-64`} value={v.timezone} onChange={(e) => set("timezone", e.target.value)} />}
          />
          <SettingsRow
            label="Channel"
            help="Preview also installs release candidates."
            control={(ids) => (
              <select id={ids.inputId} className={`${inputClass} w-auto`} value={v.channel} onChange={(e) => set("channel", e.target.value as AutoUpdateSettings["channel"])}>
                <option value="stable">Stable</option>
                <option value="preview">Preview</option>
              </select>
            )}
          />
          <SettingsRow
            label="Major releases"
            help="A major release can need a step from you; with Ask, it waits for an admin to press Update now."
            control={(ids) => (
              <select id={ids.inputId} className={`${inputClass} w-auto`} value={v.majors} onChange={(e) => set("majors", e.target.value as AutoUpdateSettings["majors"])}>
                <option value="ask">Ask me</option>
                <option value="auto">Install them too</option>
              </select>
            )}
          />
        </SettingsSection>

        <SettingsSection id="history" title="Update history">
          {history.length === 0 ? (
            <p className="px-4 py-4 text-sm text-zinc-400">No updates yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-800" data-testid="update-history">
              {history.map((h) => (
                <li key={h.id ?? `${h.version}-${h.started_at}`} className="flex min-w-0 flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-100">
                      {h.mode === "rollback" ? "Roll back to " : ""}<span className="font-mono">{h.version}</span>
                      {h.from_version && <span className="text-zinc-500"> from {h.from_version}</span>}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {h.started_at?.slice(0, 16).replace("T", " ")} UTC · {h.actor === "auto" ? "automatic" : h.actor}
                      {h.reason ? ` · ${h.reason}` : ""}
                    </p>
                  </div>
                  <Chip tone={STATUS[h.status].tone}>{STATUS[h.status].label}</Chip>
                </li>
              ))}
            </ul>
          )}
          <div className="px-4 py-4">
            <button type="button" className={secondaryButton} disabled={!canRollBack || !!busy || data.running} onClick={() => start("rollback")}>
              {busy === "rollback" ? "Starting…" : "Roll back to the previous version"}
            </button>
          </div>
        </SettingsSection>
      </div>
      <SaveBar count={form.dirtyKeys.length} onSave={save} onDiscard={form.discard} idleText="Nothing to save" />
    </Page>
  );
}
