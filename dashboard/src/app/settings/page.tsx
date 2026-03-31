"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";

export default function SettingsPage() {
  const [resetting, setResetting] = useState(false);
  const { toast } = useToast();
  const sections = [
    { href: "/settings/guardrails", title: "Guardrails", description: "Must-rules Coderhelm always follows. Never pushes to main." },
    { href: "/settings/voice", title: "Team Voice", description: "Control how Coderhelm writes — tone, commit style, PR format." },
    { href: "/settings/instructions", title: "Custom Instructions", description: "Global conventions and preferences for all repos." },
    { href: "/settings/repos", title: "Repositories", description: "Connected repos and their status." },
    { href: "/settings/budget", title: "Budget", description: "Set a monthly spending cap to control overage costs." },
    { href: "/settings/workflow", title: "Workflow", description: "Openspec output, commit behavior, and pipeline preferences." },
    { href: "/settings/notifications", title: "Notifications", description: "Choose which emails Coderhelm sends you." },
  ];

  const handleReset = async () => {
    const answer = prompt("This will permanently delete all your data (runs, plans, repos, settings, Jira config). Type DELETE to confirm.");
    if (answer !== "DELETE") return;
    setResetting(true);
    try {
      await api.resetAccount();
      toast("All data has been cleared. Refreshing...");
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      toast("Failed to reset account", "error");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <div className="space-y-3">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="block px-4 py-4 bg-zinc-900/50 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors"
          >
            <h3 className="text-sm font-medium text-zinc-100">{s.title}</h3>
            <p className="text-xs text-zinc-500 mt-1">{s.description}</p>
          </Link>
        ))}
      </div>

      {/* Danger zone */}
      <div className="mt-12 border border-red-500/20 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-red-400 mb-1">Danger Zone</h2>
        <p className="text-xs text-zinc-500 mb-4">
          Permanently delete all data — runs, plans, repos, settings, Jira config. Your account will remain but all content will be wiped.
        </p>
        <button
          onClick={handleReset}
          disabled={resetting}
          className="px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/20 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {resetting ? "Resetting..." : "Reset all data"}
        </button>
      </div>
    </div>
  );
}
