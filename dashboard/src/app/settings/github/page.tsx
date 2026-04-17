"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { api, type Repo } from "@/lib/api";
import { Skeleton } from "@/components/skeleton";
const GITHUB_APP_INSTALL_URL = "https://github.com/apps/coderhelm/installations/new";
const STATE_STORAGE_KEY = "gh_install_state";

export default function GitHubSettingsPageGuarded() {
  return <GitHubSettingsPage />;
}

type InstallStatus = "not_connected" | "connected" | "linking";

function GitHubSettingsPage() {
  const searchParams = useSearchParams();
  const [login, setLogin] = useState<string | null>(null);
  const [role, setRole] = useState<string>("member");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<InstallStatus>("not_connected");
  const [githubOrg, setGithubOrg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkResult, setLinkResult] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const [me, repoData, installStatus] = await Promise.all([
        api.me(),
        api.listRepos(),
        api.getInstallationStatus(),
      ]);
      setLogin(me.github_login);
      setRole(me.role ?? "member");
      setRepos(repoData.repos);
      if (installStatus.status === "connected") {
        setStatus("connected");
        setGithubOrg(installStatus.github_org ?? null);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // On mount: load status, then check for ?installation_id redirect
  useEffect(() => {
    loadStatus().then(() => {
      const installationId = searchParams.get("installation_id");
      const setupAction = searchParams.get("setup_action");
      const returnedState = searchParams.get("state");

      if (!installationId) return;

      // Validate CSRF state parameter
      const savedState = sessionStorage.getItem(STATE_STORAGE_KEY);
      sessionStorage.removeItem(STATE_STORAGE_KEY);

      if (!savedState || savedState !== returnedState) {
        setError("Invalid state parameter. Please try installing again.");
        // Clean URL
        window.history.replaceState({}, "", "/settings/github");
        return;
      }

      // Clean URL
      window.history.replaceState({}, "", "/settings/github");

      if (setupAction === "request") {
        // Org admin hasn't approved yet — show pending message
        setError(null);
        setLinkResult("Installation request sent. Your GitHub organization admin needs to approve the app. The connection will be established automatically once approved.");
        return;
      }

      // Link the installation
      const id = parseInt(installationId, 10);
      if (isNaN(id)) {
        setError("Invalid installation ID.");
        return;
      }

      setStatus("linking");
      setError(null);
      api.linkGithubInstallation(id).then((result) => {
        if (result.error) {
          setError(result.error);
          setStatus("not_connected");
        } else {
          setStatus("connected");
          setGithubOrg(result.github_org ?? null);
          setLinkResult(`Connected to ${result.github_org}. ${result.repos_synced ?? 0} repositories synced.`);
          // Refresh repos
          api.listRepos().then((r) => setRepos(r.repos)).catch(() => {});
        }
      }).catch((e) => {
        setError(e.message || "Failed to link installation.");
        setStatus("not_connected");
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInstallClick = () => {
    // Generate CSRF state token and store in sessionStorage
    const state = crypto.randomUUID();
    sessionStorage.setItem(STATE_STORAGE_KEY, state);
    window.location.href = `${GITHUB_APP_INSTALL_URL}?state=${state}`;
  };

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
  const isAdmin = role === "admin" || role === "owner";

  return (
    <div className="max-w-2xl">
      <a href="/settings" className="text-zinc-500 hover:text-zinc-300 text-sm">← Settings</a>
      <h1 className="text-2xl font-bold mt-4 mb-6">GitHub</h1>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Success / info banner */}
      {linkResult && !error && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-400">
          {linkResult}
        </div>
      )}

      {/* GitHub connection */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 text-zinc-300">
            <GitHubIcon className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">GitHub App</p>
            {status === "connected" ? (
              <p className="text-lg font-semibold text-zinc-100 mt-0.5">{githubOrg ?? login ?? "Connected"}</p>
            ) : status === "linking" ? (
              <p className="text-sm text-zinc-400 mt-0.5">Linking installation…</p>
            ) : (
              <p className="text-sm text-zinc-400 mt-0.5">Not installed</p>
            )}
          </div>
          {status === "connected" ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-xs font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Connected
            </span>
          ) : status === "linking" ? (
            <svg className="w-5 h-5 animate-spin text-zinc-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : isAdmin ? (
            <button
              onClick={handleInstallClick}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
            >
              Install
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          ) : (
            <span className="text-xs text-zinc-500">Ask an admin to install</span>
          )}
        </div>
        {status !== "connected" && isAdmin && (
          <p className="text-xs text-zinc-500 mt-3 ml-16">
            Install the CoderHelm GitHub App to grant access to your repositories.
          </p>
        )}
        {status === "connected" && login && githubOrg && login !== githubOrg && (
          <p className="text-xs text-zinc-500 mt-3 ml-16">
            Signed in as <span className="font-mono text-zinc-400">{login}</span>
          </p>
        )}
      </div>

      {/* Repositories */}
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

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
