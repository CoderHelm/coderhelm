"use client";

import { useEffect, useState } from "react";
import { api, type JiraEvent, type JiraCheck, type JiraConfig, type JiraProject } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { Skeleton } from "@/components/skeleton";

type Tab = "app" | "webhook" | "events" | "settings";

export default function JiraPage() {
  const [check, setCheck] = useState<JiraCheck | null>(null);
  const [config, setConfig] = useState<JiraConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingSecret, setGeneratingSecret] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("app");
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const { toast } = useToast();
  const { confirm } = useConfirm();

  useEffect(() => {
    Promise.all([api.getJiraCheck(), api.getJiraConfig()])
      .then(([c, cfg]) => { setCheck(c); setConfig(cfg); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const generateSecret = async () => {
    setGeneratingSecret(true);
    try {
      const result = await api.generateJiraSecret();
      const c = await api.getJiraCheck();
      setCheck(c);
      setRevealedSecret(result.webhook_secret);
      toast("Webhook credentials generated — copy the secret now, it won't be shown again");
    } catch {
      toast("Failed to generate webhook URL", "error");
    }
    setGeneratingSecret(false);
  };

  const deleteSecret = async () => {
    if (!(await confirm({ title: "Remove Webhook URL", message: "Remove the webhook URL? Jira webhooks will stop working until you generate a new one.", confirmLabel: "Remove", destructive: true }))) return;
    try {
      await api.deleteJiraSecret();
      setCheck((c) => c ? { ...c, secret_configured: false, webhook_url: undefined } : c);
      setRevealedSecret(null);
      toast("Webhook URL removed");
    } catch {
      toast("Failed to remove webhook URL", "error");
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Jira Integration</h1>
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Jira Integration</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Connect Jira so assigning or transitioning issues triggers Coderhelm automatically.
      </p>

      {/* Status */}
      <div className={`p-4 rounded-lg border mb-6 ${
        check?.ready
          ? "bg-emerald-500/5 border-emerald-500/20"
          : "bg-yellow-500/5 border-yellow-500/20"
      }`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={check?.ready ? "text-emerald-400" : "text-yellow-400"}>
            {check?.ready ? "✓" : "○"}
          </span>
          <span className={`text-sm font-medium ${check?.ready ? "text-emerald-400" : "text-yellow-400"}`}>
            {check?.ready ? "Connected" : "Not connected yet"}
          </span>
        </div>
        <div className="text-xs text-zinc-500 mt-1 space-y-0.5">
          <p>{(check?.configured_repos.enabled ?? 0) > 0 ? "✓" : "○"} {check?.configured_repos.enabled ?? 0} enabled repo(s)</p>
          <p>{check?.jira_events_seen ? "✓" : "○"} Jira events received{check?.last_jira_event_at && (
            <span className="text-zinc-600 ml-1">· last {new Date(check.last_jira_event_at).toLocaleString()}{check.jira_event_count ? ` · ${check.jira_event_count} total` : ""}</span>
          )}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg mb-6 w-fit">
        {(["app", "webhook", "events", "settings"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${tab === t ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}>
            {t === "app" ? "Jira App" : t === "webhook" ? "Webhook" : t === "events" ? "Events" : "Settings"}
          </button>
        ))}
      </div>

      {tab === "app" ? (
        <JiraAppTab check={check} config={config} setConfig={setConfig} toast={toast} />
      ) : tab === "webhook" ? (
        <WebhookTab
          check={check}
          setCheck={setCheck}
          generatingSecret={generatingSecret}
          generateSecret={generateSecret}
          deleteSecret={deleteSecret}
          copy={copy}
          copied={copied}
          revealedSecret={revealedSecret}
        />
      ) : tab === "events" ? (
        <EventsTab />
      ) : (
        <SettingsTab config={config} setConfig={setConfig} toast={toast} />
      )}
    </div>
  );
}

function JiraAppTab({ check, config, setConfig, toast }: {
  check: JiraCheck | null;
  config: JiraConfig | null;
  setConfig: React.Dispatch<React.SetStateAction<JiraConfig | null>>;
  toast: (msg: string, type?: "error" | "success") => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const { confirm } = useConfirm();
  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };
  const installUrl = "https://developer.atlassian.com/console/install/de730821-2955-4d78-836e-55b6e7c23c88?signature=AYABePrR09vSK2DTVLCCzK%2Bt04oAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4IOp8r3eKNYw8z2v%2FEq3%2FfvrZguoGsXpNSaDveR%2FF%2Fo0BXAmH88tVaInK7U6E2MFkZAAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDJMQ6B1ogvNrk2X41AIBEIA7UEnUW%2FGBqNgbzivPOfH9txPwU4gjvklvkmwbZWb%2FmZoMMd5lsRvkJ7OzWCYtJAbfrF2hZZcREGnfeoMAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHijmwVTMt6Oj3F%2B0%2B0cVrojrS8yZ9ktpdfDxqPMSIkvHAEGa2reJg8L%2FrWqEbgFRPADAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMThkIkAaI7FAPWkeTAgEQgDtGtXT7SzNrjUqpB8Pm474FMrk2aPj2FtBDtjW9vNYK3NZ0oNloPH9XPGbn1uS7YTPJZPTB561JZvBdcgAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeLKa7Dfn9BgbXaQmJGrkKztjV4vrreTkqr7wGwhqIYs5AaBDJ8FvKCFfzHTyolwIyC8AAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAyQ9HvoMmjskgnJCTUCARCAO%2FkpeTKd8IIamduK2tZFv2a8kDZoP7FTtAuky6S0LNmrEoIuYnHoMEyydCQLXHgjex%2FsD71J9OlNG%2Bx9AgAAAAAMAAAQAAAAAAAAAAAAAAAAAMx%2BPlN5fhsnaG9wdl169OP%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADLtyR6xQ9Nnc2%2F0GV7Dz3xCvKwGrAD%2BuvAz%2FU5KYYo7ZAgS%2FpCTSkiLEvuK6Ij5gvJQHM4oYSv%2FXgh40M6Ouxvc4a8%3D&product=jira";

  const forgeLinked = !!(config?.list_projects_url && config?.create_ticket_url);

  const unlink = async () => {
    if (!(await confirm({ title: "Disconnect Jira", message: "Disconnect the Jira app? You can reconnect it anytime.", confirmLabel: "Disconnect", destructive: true }))) return;
    setUnlinking(true);
    try {
      await api.updateJiraConfig({ list_projects_url: "", create_ticket_url: "" });
      setConfig((c) => c ? { ...c, list_projects_url: "", create_ticket_url: "" } : c);
      toast("Jira app disconnected");
    } catch {
      toast("Failed to disconnect", "error");
    } finally {
      setUnlinking(false);
    }
  };

  if (forgeLinked) {
    return (
      <div className="space-y-6">
        <div className="p-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-400">Jira app linked</p>
                <p className="text-xs text-zinc-500 mt-0.5">Trigger URLs registered — assigning labeled tickets will start runs.</p>
              </div>
            </div>
            <button
              onClick={unlink}
              disabled={unlinking}
              className="px-3 py-1.5 text-xs text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
            >
              {unlinking ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-zinc-100">How to use</h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-medium text-zinc-400">1</span>
              <p className="text-sm text-zinc-400 pt-0.5">Add a <code className="text-zinc-300 bg-zinc-800 px-1 rounded">coderhelm</code> label to any Jira issue, then assign it.</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-medium text-zinc-400">2</span>
              <p className="text-sm text-zinc-400 pt-0.5">Coderhelm picks the right repo, creates a branch, and opens a PR.</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-medium text-zinc-400">3</span>
              <p className="text-sm text-zinc-400 pt-0.5">Track progress on the <strong className="text-zinc-200">Runs</strong> page.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-zinc-400 text-sm">
        Install the Coderhelm Jira app on your Jira site. When you assign a ticket with a <code className="text-zinc-300 bg-zinc-800 px-1 rounded">coderhelm</code> label, Coderhelm determines the right repo from the ticket context and starts working.
      </p>

      <div className="space-y-6">
        <Step number={1} title="Install the Jira app">
          <p className="text-zinc-400 text-sm mb-3">
            Click the button below to install Coderhelm on your Jira site. You need to be a Jira admin.
          </p>
          <a
            href={installUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white transition-colors cursor-pointer"
          >
            Install on Jira
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          </a>
        </Step>

        <Step number={2} title="Configure the app in Jira">
          <p className="text-zinc-400 text-sm mb-3">
            After installing, go to <strong className="text-zinc-200">Jira → Apps → Manage your apps → Coderhelm</strong> and enter your Installation ID.
          </p>
          {check?.installation_id ? (
            <div className="space-y-3 p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Installation ID</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-sm text-zinc-200 font-mono">
                    {String(check.installation_id)}
                  </code>
                  <button onClick={() => copy(String(check.installation_id), "install-id")} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer">
                    {copied === "install-id" ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
              <p className="text-xs text-zinc-600">Paste this into the <strong className="text-zinc-400">Installation ID</strong> field in the Coderhelm app settings in Jira, then click <strong className="text-zinc-400">Save</strong>. The trigger URLs are registered automatically.</p>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm italic">Loading your configuration…</p>
          )}
        </Step>

        <Step number={3} title="Label and assign">
          <p className="text-zinc-400 text-sm">
            Add a <code className="text-zinc-300 bg-zinc-800 px-1 rounded">coderhelm</code> label to any Jira issue, then assign it. Coderhelm picks the right repo automatically based on the ticket.
          </p>
        </Step>

        <Step number={4} title="Check the Runs page">
          <p className="text-zinc-400 text-sm">
            A new run should appear within a minute. Coderhelm creates a branch, implements the change, and opens a PR.
          </p>
        </Step>
      </div>
    </div>
  );
}

function SettingsTab({ config, setConfig, toast }: {
  config: JiraConfig | null;
  setConfig: React.Dispatch<React.SetStateAction<JiraConfig | null>>;
  toast: (msg: string, type?: "error" | "success") => void;
}) {
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const listProjectsUrl = config?.list_projects_url ?? "";
  const createTicketUrl = config?.create_ticket_url ?? "";
  const triggerLabel = "coderhelm";
  const [defaultProject, setDefaultProject] = useState(config?.default_project ?? "");
  const [projects, setProjects] = useState<JiraProject[]>(config?.projects ?? []);

  // Sync projects when config updates (e.g. after re-fetch)
  useEffect(() => {
    if (config?.projects && config.projects.length > 0) {
      setProjects(config.projects);
    }
  }, [config?.projects]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      await api.updateJiraConfig({
        list_projects_url: listProjectsUrl,
        create_ticket_url: createTicketUrl,
        trigger_label: triggerLabel,
        default_project: defaultProject,
      });
      setConfig((c) => c ? { ...c, list_projects_url: listProjectsUrl, create_ticket_url: createTicketUrl, trigger_label: triggerLabel, default_project: defaultProject } : c);
      toast("Settings saved");
    } catch {
      toast("Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const fetchProjects = async () => {
    if (!listProjectsUrl) {
      toast("List Projects URL not configured — save settings in the Jira app first", "error");
      return;
    }
    setFetching(true);
    try {
      const { projects: fetched } = await api.fetchJiraProjects();
      // Merge with existing enabled state
      const existing = new Map(projects.map((p) => [p.key, p.enabled]));
      const merged = fetched.map((p) => ({
        ...p,
        enabled: existing.get(p.key) ?? false,
      }));
      setProjects(merged);
      toast(`Found ${merged.length} project${merged.length !== 1 ? "s" : ""}`);
    } catch {
      toast("Failed to fetch projects — check the URL", "error");
    } finally {
      setFetching(false);
    }
  };

  const toggleProject = (key: string) => {
    setProjects((prev) => {
      const updated = prev.map((p) => p.key === key ? { ...p, enabled: !p.enabled } : p);
      api.updateJiraProjects(updated).then(() => {
        setConfig((c) => c ? { ...c, projects: updated } : c);
      }).catch(() => toast("Failed to save projects", "error"));
      return updated;
    });
  };

  const enabledProjects = projects.filter((p) => p.enabled);

  return (
    <div className="space-y-8 mb-8">
      {/* Forge trigger URLs */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-100 mb-1">Forge Trigger URLs</h3>
        <p className="text-xs text-zinc-500 mb-3">
          Registered automatically when you save settings in the Jira Forge app.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">List Projects URL</label>
            <input
              value={listProjectsUrl}
              readOnly
              placeholder="Not configured yet — save settings in the Jira Forge app"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-sm text-zinc-100 placeholder-zinc-600 opacity-60 cursor-default"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Create Ticket URL</label>
            <input
              value={createTicketUrl}
              readOnly
              placeholder="Not configured yet — save settings in the Jira Forge app"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-sm text-zinc-100 placeholder-zinc-600 opacity-60 cursor-default"
            />
          </div>
        </div>
      </section>

      {/* Trigger label */}
      <section>
        <h3 className="text-sm font-semibold text-zinc-100 mb-1">Trigger Label</h3>
        <p className="text-xs text-zinc-500 mb-3">
          Only Jira tickets with this label will trigger Coderhelm. The label is always <code className="text-zinc-300 bg-zinc-800 px-1 rounded">coderhelm</code>.
        </p>
        <div className="flex items-center gap-2">
          <code className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-sm text-zinc-100 font-mono">coderhelm</code>
          <span className="text-xs text-zinc-600">Cannot be changed</span>
        </div>
      </section>

      {/* Projects */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-zinc-100">Jira Projects</h3>
          <button
            onClick={fetchProjects}
            disabled={fetching || !listProjectsUrl}
            className="px-3 py-1.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {fetching ? "Fetching..." : "Fetch from Jira"}
          </button>
        </div>
        <p className="text-xs text-zinc-500 mb-3">
          Enable the projects Coderhelm should process. Only tickets from enabled projects will trigger runs.
        </p>
        {projects.length > 0 ? (
          <div className="space-y-1.5">
            {projects.map((p) => (
              <label
                key={p.key}
                className="flex items-center gap-3 px-3 py-2 bg-zinc-900/50 border border-zinc-800 rounded-lg cursor-pointer hover:bg-zinc-900"
              >
                <input
                  type="checkbox"
                  checked={p.enabled}
                  onChange={() => toggleProject(p.key)}
                  className="accent-emerald-500"
                />
                <span className="text-sm text-zinc-200 font-mono">{p.key}</span>
                <span className="text-sm text-zinc-400">{p.name}</span>
                {p.lead && <span className="text-xs text-zinc-600 ml-auto">{p.lead}</span>}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-600 italic">No projects loaded. Click &ldquo;Fetch from Jira&rdquo; to import.</p>
        )}
      </section>

      {/* Default project */}
      {enabledProjects.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-zinc-100 mb-1">Default Project</h3>
          <p className="text-xs text-zinc-500 mb-3">
            When creating Jira tickets from plans, this project is used unless overridden per task.
          </p>
          <select
            value={defaultProject}
            onChange={(e) => setDefaultProject(e.target.value)}
            className="w-64 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-sm text-zinc-100 focus:outline-none focus:border-zinc-600"
          >
            <option value="">None</option>
            {enabledProjects.map((p) => (
              <option key={p.key} value={p.key}>{p.key} — {p.name}</option>
            ))}
          </select>
        </section>
      )}

      {/* Save */}
      <button
        onClick={saveConfig}
        disabled={saving}
        className="px-5 py-2.5 bg-white text-zinc-900 rounded-lg text-sm font-semibold hover:bg-zinc-200 transition-colors disabled:opacity-40 cursor-pointer"
      >
        {saving ? "Saving..." : "Save settings"}
      </button>
    </div>
  );
}

interface WebhookTabProps {
  check: JiraCheck | null;
  setCheck: React.Dispatch<React.SetStateAction<JiraCheck | null>>;
  generatingSecret: boolean;
  generateSecret: () => void;
  deleteSecret: () => void;
  copy: (text: string, label: string) => void;
  copied: string | null;
  revealedSecret: string | null;
}

function WebhookTab({ check, generatingSecret, generateSecret, deleteSecret, copy, copied, revealedSecret }: WebhookTabProps) {
  return (
    <div className="space-y-6 mb-8">
      <p className="text-zinc-400 text-sm">
        Use a native Jira webhook to send events to Coderhelm when issues are updated.
      </p>

      <Step number={1} title="Generate webhook credentials">
        <p className="text-zinc-400 text-sm mb-3">
          Generate a unique webhook URL and signing secret for your account.
        </p>
        {check?.webhook_url ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-emerald-400">✓ Webhook configured</span>
              <button onClick={generateSecret} disabled={generatingSecret} className="text-xs text-zinc-500 hover:text-zinc-300 underline cursor-pointer">
                {generatingSecret ? "Regenerating..." : "Regenerate"}
              </button>
              <button onClick={deleteSecret} className="text-xs text-zinc-600 hover:text-red-400 underline cursor-pointer">
                Remove
              </button>
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Webhook URL</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-sm text-zinc-200 font-mono truncate">
                  {check.webhook_url}
                </code>
                <button onClick={() => copy(check.webhook_url!, "url")} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer">
                  {copied === "url" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
            {revealedSecret ? (
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Webhook Secret</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-sm text-zinc-200 font-mono truncate">
                    {revealedSecret}
                  </code>
                  <button onClick={() => copy(revealedSecret, "secret")} className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer">
                    {copied === "secret" ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className="text-yellow-500/80 text-xs mt-1">⚠ Copy this secret now — it will not be shown again after you leave this page.</p>
              </div>
            ) : check.secret_configured ? (
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Webhook Secret</label>
                <p className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-sm text-zinc-500 font-mono">
                  ••••••••••••••••••••
                </p>
                <p className="text-zinc-600 text-xs mt-1">Secret was shown only at generation time. Regenerate to get a new one.</p>
              </div>
            ) : null}
            <p className="text-zinc-500 text-xs">Keep both values private. Regenerating will invalidate the previous credentials.</p>
          </div>
        ) : (
          <button onClick={generateSecret} disabled={generatingSecret} className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-50 transition-colors cursor-pointer">
            {generatingSecret ? "Generating..." : "Generate webhook credentials"}
          </button>
        )}
      </Step>

      <Step number={2} title="Add the webhook in Jira">
        <p className="text-zinc-400 text-sm">
          Go to <strong className="text-zinc-200">https://&lt;your-site&gt;.atlassian.net/plugins/servlet/webhooks</strong> and create a new webhook.
        </p>
        <p className="text-zinc-500 text-xs mt-2">
          Paste the <strong className="text-zinc-300">Webhook URL</strong> from step 1. Enter the <strong className="text-zinc-300">Webhook Secret</strong> in the secret field. Under events, enable <strong className="text-zinc-300">Issue → updated</strong>.
        </p>
        <p className="text-zinc-500 text-xs mt-1">
          The secret is used to sign each request with an HMAC-SHA256 signature (<code className="text-zinc-400 bg-zinc-800 px-1 rounded text-xs">X-Hub-Signature</code> header) so Coderhelm can verify it came from Jira.
        </p>
      </Step>

      <Step number={3} title="Test">
        <p className="text-zinc-400 text-sm">
          Update a Jira issue with your trigger label and check the Events tab.
        </p>
      </Step>

    </div>
  );
}

function EventsTab() {
  const [events, setEvents] = useState<JiraEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listJiraEvents()
      .then((res) => setEvents(res.events))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const statusColor: Record<string, string> = {
    processed: "text-emerald-400",
    filtered: "text-zinc-500",
    error: "text-red-400",
    signature_rejected: "text-red-400",
  };

  if (loading) {
    return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  if (events.length === 0) {
    return <p className="text-zinc-500 text-sm">No Jira events received yet.</p>;
  }

  return (
    <div className="mb-8">
      <p className="text-zinc-400 text-sm mb-4">Last {events.length} webhook events.</p>
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/50">
              <th className="text-left px-4 py-2 text-zinc-500 font-medium">Ticket</th>
              <th className="text-left px-4 py-2 text-zinc-500 font-medium">Title</th>
              <th className="text-left px-4 py-2 text-zinc-500 font-medium">Status</th>
              <th className="text-left px-4 py-2 text-zinc-500 font-medium">Repo</th>
              <th className="text-left px-4 py-2 text-zinc-500 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.event_id} className="border-b border-zinc-800/50 hover:bg-zinc-900/50">
                <td className="px-4 py-2 text-zinc-300 font-mono text-xs">{e.ticket_key || "—"}</td>
                <td className="px-4 py-2 text-zinc-100 text-sm">{e.title || "—"}</td>
                <td className={`px-4 py-2 text-xs ${statusColor[e.status] ?? "text-zinc-400"}`}>{e.status}</td>
                <td className="px-4 py-2 text-zinc-400 font-mono text-xs">{e.repo || "—"}</td>
                <td className="px-4 py-2 text-zinc-500 text-xs">{new Date(e.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-300">
        {number}
      </div>
      <div className="flex-1 pt-0.5">
        <h3 className="text-sm font-medium text-zinc-100 mb-1">{title}</h3>
        {children}
      </div>
    </div>
  );
}


