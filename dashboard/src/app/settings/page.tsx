"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";

export default function SettingsPage() {
  const [resetting, setResetting] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const { toast } = useToast();
  const sections = [
    { href: "/settings/guardrails", title: "Guardrails", description: "Must-rules Coderhelm always follows. Never pushes to main." },
    { href: "/settings/voice", title: "Team Voice", description: "Control how Coderhelm writes — tone, commit style, PR format." },
    { href: "/settings/instructions", title: "Custom Instructions", description: "Global conventions and preferences for all repos." },
    { href: "/settings/repos", title: "Repositories", description: "Connected repos and their status." },
    { href: "/settings/budget", title: "Budget", description: "Set a monthly spending cap to control overage costs." },
    { href: "/settings/workflow", title: "Workflow", description: "Openspec output, commit behavior, and pipeline preferences." },
    { href: "/settings/notifications", title: "Notifications", description: "Choose which emails Coderhelm sends you." },
    { href: "/settings/team", title: "Team", description: "Invite members, assign roles, and manage who has access." },
    { href: "/settings/security", title: "Security", description: "Change your password and enable two-factor authentication." },
  ];

  const integrations = [
    { href: "/settings/github", title: "GitHub", description: "Connected GitHub account and installed repositories." },
    { href: "/settings/aws", title: "AWS", description: "Connect AWS accounts to analyze CloudWatch Logs and get recommendations." },
    { href: "/settings/jira", title: "Jira", description: "Connect Jira to create tickets from plans and sync issue status." },
    { href: "/settings/plugins", title: "Plugins", description: "Connect third-party tools like Figma, Sentry, and Linear." },
  ];

  const handleReset = async () => {
    if (confirmText !== "DELETE") return;
    setResetting(true);
    try {
      await api.resetAccount();
      setShowResetModal(false);
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

      <h2 className="text-lg font-semibold mt-10 mb-3">Integrations</h2>
      <div className="space-y-3">
        {integrations.map((s) => (
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
          onClick={() => { setShowResetModal(true); setConfirmText(""); }}
          disabled={resetting}
          className="px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/20 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {resetting ? "Resetting..." : "Reset all data"}
        </button>
      </div>

      {/* Reset confirmation modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowResetModal(false)} />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-semibold text-red-400 mb-2">Reset all data</h3>
            <p className="text-sm text-zinc-400 mb-4">
              This will permanently delete all your data including runs, plans, repos, settings, and Jira config. This action cannot be undone.
            </p>
            <label className="text-xs text-zinc-500 mb-1.5 block">
              Type <span className="text-red-400 font-mono font-semibold">DELETE</span> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              autoFocus
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-red-500/50 mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={confirmText !== "DELETE" || resetting}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {resetting ? "Resetting..." : "Delete everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
