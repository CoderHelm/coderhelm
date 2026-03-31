"use client";

import { useEffect, useState } from "react";
import { api, type WorkflowSettings, type JiraCheck } from "@/lib/api";
import { useToast } from "@/components/toast";

const TOGGLES: { key: keyof WorkflowSettings; label: string; description: string }[] = [
  {
    key: "commit_openspec",
    label: "Commit openspec to repo",
    description: "Include proposal, design, tasks, and acceptance criteria files in the PR branch under openspec/specs/.",
  },
];

export default function WorkflowPage() {
  const [settings, setSettings] = useState<WorkflowSettings | null>(null);
  const [jira, setJira] = useState<JiraCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([api.getWorkflowSettings(), api.getJiraCheck().catch(() => null)])
      .then(([data, j]) => {
        setSettings(data);
        setJira(j);
      })
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (key: keyof WorkflowSettings) => {
    if (!settings) return;
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    setSaving(true);
    try {
      await api.updateWorkflowSettings(updated);
    } catch {
      setSettings(settings);
      toast("Failed to save preference", "error");
    } finally {
      setSaving(false);
    }
  };

  const setDestination = async (dest: "github" | "jira") => {
    if (!settings || settings.default_destination === dest) return;
    const prev = settings;
    const updated = { ...settings, default_destination: dest };
    setSettings(updated);
    setSaving(true);
    try {
      await api.updateWorkflowSettings(updated);
    } catch {
      setSettings(prev);
      toast("Failed to save preference", "error");
    } finally {
      setSaving(false);
    }
  };

  const jiraConnected = jira?.ready || jira?.secret_configured;

  if (loading) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold mb-6">Workflow</h1>
        <div className="h-48 bg-zinc-900/50 border border-zinc-800 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-2">Workflow</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Control how Coderhelm structures and commits its work.
      </p>

      <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
        {TOGGLES.map((t) => (
          <div key={t.key} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
            <div>
              <p className="text-sm font-medium text-zinc-100">{t.label}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{t.description}</p>
            </div>
            <button
              onClick={() => toggle(t.key)}
              disabled={saving}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                settings?.[t.key] ? "bg-emerald-500" : "bg-zinc-700"
              } disabled:opacity-50`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
                  settings?.[t.key] ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      {/* Default task destination */}
      <div className="mt-6 p-5 bg-zinc-900/50 border border-zinc-800 rounded-lg">
        <p className="text-sm font-medium text-zinc-100">Default task destination</p>
        <p className="text-xs text-zinc-500 mt-0.5 mb-4">
          Where new plan tasks create tickets by default. You can override per task.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setDestination("github")}
            disabled={saving}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 ${
              settings?.default_destination !== "jira"
                ? "border-zinc-600 bg-zinc-800 text-zinc-100"
                : "border-zinc-800 bg-transparent text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            GitHub Issues
          </button>
          {jiraConnected && (
            <button
              onClick={() => setDestination("jira")}
              disabled={saving}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                settings?.default_destination === "jira"
                  ? "border-zinc-600 bg-zinc-800 text-zinc-100"
                  : "border-zinc-800 bg-transparent text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#0052CC">
                <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84a.84.84 0 00-.84-.84H11.53zM6.77 6.8a4.36 4.36 0 004.34 4.34h1.8v1.72a4.36 4.36 0 004.34 4.34V7.63a.84.84 0 00-.83-.83H6.77zM2 11.6a4.35 4.35 0 004.35 4.35h1.78v1.71c0 2.4 1.94 4.35 4.34 4.34v-9.56a.84.84 0 00-.84-.84H2z"/>
              </svg>
              Jira Tickets
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
