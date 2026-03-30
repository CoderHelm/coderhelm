"use client";

import { useEffect, useState } from "react";
import { api, type WorkflowSettings } from "@/lib/api";
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    api.getWorkflowSettings().then((data) => {
      setSettings(data);
      setLoading(false);
    });
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
    </div>
  );
}
