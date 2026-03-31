"use client";

import { useEffect, useState } from "react";
import { api, type JiraEvent, type JiraCheck, type JiraConfig, type JiraProject } from "@/lib/api";
import { useToast } from "@/components/toast";
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
    if (!confirm("Remove the webhook URL? Jira webhooks will stop working until you generate a new one.")) return;
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
        <JiraAppTab />
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

function JiraAppTab() {
  const installUrl = "https://developer.atlassian.com/console/install/0f707126-f6c4-4cae-9332-d736617d4d53?signature=AYABeK8ie1a%2BTEeiPiM3T34MbZ0AAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4IOp8r3eKNYw8z2v%2FEq3%2FfvrZguoGsXpNSaDveR%2FF%2Fo0BLruyVn8r%2FEOK5h8zi1R8RgAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDOwhe7cajq6Kgf30AgIBEIA7g6njzGaMjLWQyz%2BCDOQNFhkv1Ghs8zFsfBdFyAvBn%2FBzsFg5WiL%2FGR2qcsFcIlAEiiqP02TVMaE7Y2kAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHijmwVTMt6Oj3F%2B0%2B0cVrojrS8yZ9ktpdfDxqPMSIkvHAHG51UcQbI0xcGuuDtvUzJqAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMcjwGpZCf3N2rvLLrAgEQgDsbrPOc%2FNcsNH7s%2F4VR%2FWHVwx3PlPH0N3ECm3npY13Nb%2FdShsRRInN4SIU3UnDNjFHQxozi8SY65YXnjgAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeLKa7Dfn9BgbXaQmJGrkKztjV4vrreTkqr7wGwhqIYs5AUgWk554l4fXM9HqT0ByV70AAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAyhb0F6qjUivcDxj6oCARCAOz9RXk9GwPGp7n3Re50PKAi18EmdnrKe9QXFaBC2XlmEPMU%2FdfyAb43jE3uE2aOzp74GG6mb4q9XZfYrAgAAAAAMAAAQAAAAAAAAAAAAAAAAACsLtWLW%2Fsef6SMqv5DtUiX%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADKjtj7iA2wG62JAY42sMdcdN14Kj4fecUhXoAwxaA0oFCWepgmVkD3w4J4O3Nqtkx9cBmtjrK1gYmQIJpPW9N%2Fd278%3D&product=jira";

  return (
    <div className="space-y-6">
      <p className="text-zinc-400 text-sm">
        Install the Coderhelm Jira app on your Jira site. When you assign a ticket with a <code className="text-zinc-300 bg-zinc-800 px-1 rounded">Coderhelm</code> label, Coderhelm determines the right repo from the ticket context and starts working.
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

        <Step number={2} title="Save settings in the app">
          <p className="text-zinc-400 text-sm">
            After installing, open the Coderhelm app settings in Jira and click <strong className="text-zinc-200">Save</strong>. The trigger URLs are registered automatically.
          </p>
        </Step>

        <Step number={3} title="Label and assign">
          <p className="text-zinc-400 text-sm">
            Add a <code className="text-zinc-300 bg-zinc-800 px-1 rounded">Coderhelm</code> label to any Jira issue, then assign it. Coderhelm picks the right repo automatically based on the ticket.
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
  const [triggerLabel, setTriggerLabel] = useState(config?.trigger_label || "coderhelm");
  const [defaultProject, setDefaultProject] = useState(config?.default_project ?? "");
  const [projects, setProjects] = useState<JiraProject[]>(config?.projects ?? []);

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
    setProjects((prev) => prev.map((p) => p.key === key ? { ...p, enabled: !p.enabled } : p));
  };

  const saveProjects = async () => {
    setSaving(true);
    try {
      await api.updateJiraProjects(projects);
      setConfig((c) => c ? { ...c, projects } : c);
      toast("Projects saved");
    } catch {
      toast("Failed to save projects", "error");
    } finally {
      setSaving(false);
    }
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
          Only Jira tickets with this label will trigger Coderhelm. Leave as &ldquo;coderhelm&rdquo; for the default.
        </p>
        <input
          value={triggerLabel}
          onChange={(e) => setTriggerLabel(e.target.value)}
          placeholder="coderhelm"
          className="w-64 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
        />
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
            <button
              onClick={saveProjects}
              disabled={saving}
              className="mt-2 px-4 py-1.5 bg-zinc-100 text-zinc-900 rounded text-sm font-medium hover:bg-white disabled:opacity-50 transition-colors cursor-pointer"
            >
              {saving ? "Saving..." : "Save projects"}
            </button>
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


