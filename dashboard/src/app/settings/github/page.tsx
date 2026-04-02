"use client";

import { useEffect, useState } from "react";
import { api, type Repo } from "@/lib/api";
import { Skeleton } from "@/components/skeleton";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.coderhelm.com";

export default function GitHubSettingsPage() {
  const [login, setLogin] = useState<string | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.me(), api.listRepos()])
      .then(([me, r]) => {
        setLogin(me.github_login);
        setRepos(r.repos);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-2xl">
        <a href="/settings" className="text-zinc-500 hover:text-zinc-300 text-sm">← Settings</a>
        <h1 className="text-2xl font-bold mt-4 mb-6">GitHub</h1>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const enabledRepos = repos.filter((r) => r.enabled);

  return (
    <div className="max-w-2xl">
      <a href="/settings" className="text-zinc-500 hover:text-zinc-300 text-sm">← Settings</a>
      <h1 className="text-2xl font-bold mt-4 mb-6">GitHub</h1>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 text-zinc-300">
            <svg className="w-6 h-6" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Connected account</p>
            <p className="text-lg font-semibold text-zinc-100 mt-0.5">{login ?? "Not connected"}</p>
          </div>
          {login ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-xs font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Connected
            </span>
          ) : (
            <a
              href={`${API_BASE}/auth/github`}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              Connect GitHub
            </a>
          )}
        </div>
      </div>

      {login && (
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
          <h3 className="text-sm font-medium text-zinc-300 mb-2">GitHub App</h3>
          <p className="text-xs text-zinc-500 mb-3">Install the Coderhelm GitHub App to grant access to your repositories.</p>
          <a
            href="https://github.com/apps/coderhelm/installations/new"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
          >
            Install GitHub App
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          </a>
        </div>
      )}

      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Repositories ({enabledRepos.length} active)</h3>
        {enabledRepos.length === 0 ? (
          <p className="text-sm text-zinc-500">No repositories connected yet.</p>
        ) : (
          <div className="space-y-2">
            {enabledRepos.map((repo) => (
              <div key={repo.name} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900">
                <svg className="w-4 h-4 text-zinc-500 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1h-8a1 1 0 00-1 1v6.708A2.486 2.486 0 014.5 9h8.5V1.5zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z" />
                </svg>
                <span className="text-sm text-zinc-200 font-mono">{repo.name}</span>
                {repo.onboard_status === "ready" && (
                  <span className="ml-auto text-xs text-emerald-400">Ready</span>
                )}
                {repo.onboard_status === "pending" && (
                  <span className="ml-auto text-xs text-yellow-400">Onboarding</span>
                )}
                {repo.onboard_status === "failed" && (
                  <span className="ml-auto text-xs text-red-400">Failed</span>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-zinc-500 mt-3">
          Manage repos in <a href="/settings/repos" className="text-zinc-400 underline hover:text-zinc-300">Repositories settings</a>.
        </p>
      </div>
    </div>
  );
}
