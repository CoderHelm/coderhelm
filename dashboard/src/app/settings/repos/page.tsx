"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { api, type Repo } from "@/lib/api";
import { RoleGuard } from "@/components/role-guard";
import { Page, PageHeader } from "@/components/page";
import { focusRing, secondaryButton } from "@/components/ui";
import {
  List,
  ListEmpty,
  ListError,
  ListRow,
  ListSkeleton,
  ListToolbar,
  LoadMore,
  useListParams,
  type StatusLook,
} from "@/components/list";

/** Rows shown at first, and added by each "Load more". */
const PAGE_SIZE = 25;

function parseOnboardError(raw: string | undefined): string {
  if (!raw) return "Analysis failed";
  const lower = raw.toLowerCase();
  if (lower.includes("404")) return "Not accessible — configure GitHub App access";
  if (lower.includes("rate limit")) return "Rate limited — will retry automatically";
  if (lower.includes("timeout")) return "Analysis timed out — click to retry";
  return "Analysis failed — click to retry";
}

/** The row's dot: off, being read, ready, or failed. */
function repoLook(repo: Repo): StatusLook {
  if (!repo.enabled) return { label: "Off", tone: "muted" };
  if (repo.onboard_status === "pending") return { label: "Analyzing", tone: "live", live: true };
  if (repo.onboard_status === "failed") return { label: "Analysis failed", tone: "danger" };
  return { label: "On", tone: "success" };
}

export default function ReposPageGuarded() {
  return (
    <RoleGuard minRole="member">
      <Suspense fallback={<Page><PageHeader title="Repositories" /><div className="mt-6"><ListSkeleton /></div></Page>}>
        <ReposPage />
      </Suspense>
    </RoleGuard>
  );
}

function ReposPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const [toggling, setToggling] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [params, setParams] = useListParams({ q: "", status: "all" });
  const q = params.q.trim().toLowerCase();
  const status = params.status === "on" || params.status === "off" ? params.status : "all";

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    api
      .listRepos()
      .then((data) => setRepos(data.repos))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while any repo is pending
  useEffect(() => {
    if (!repos.some((r) => r.onboard_status === "pending")) return;
    const timer = setInterval(() => {
      api.listRepos().then((data) => setRepos(data.repos)).catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [repos]);

  // Back to the first rows when the filters change.
  useEffect(() => setShownCount(PAGE_SIZE), [q, status]);

  const handleToggle = async (repo: Repo) => {
    setToggling(repo.name);
    try {
      await api.toggleRepo(repo.name, !repo.enabled);
      setRepos((prev) => prev.map((r) => r.name === repo.name ? { ...r, enabled: !r.enabled, onboard_status: !repo.enabled ? "pending" : undefined } : r));
    } catch { /* ignore */ }
    setToggling(null);
  };

  const handleRoleChange = async (repo: Repo, role: string) => {
    setSavingRole(repo.name);
    const prevRole = repo.role;
    // Optimistic update; revert on failure (e.g. non-admin gets 403).
    setRepos((prev) => prev.map((r) => r.name === repo.name ? { ...r, role: role || undefined } : r));
    try {
      await api.setRepoRole(repo.name, role);
    } catch {
      setRepos((prev) => prev.map((r) => r.name === repo.name ? { ...r, role: prevRole } : r));
    }
    setSavingRole(null);
  };

  const retry = (repo: Repo) => {
    setToggling(repo.name);
    api.toggleRepo(repo.name, true)
      .then(() => setRepos((prev) => prev.map((r) => r.name === repo.name ? { ...r, onboard_status: "pending", onboard_error: undefined } : r)))
      .catch(() => {})
      .finally(() => setToggling(null));
  };

  const sync = async () => {
    setSyncing(true);
    try {
      await api.syncRepos();
      const data = await api.listRepos();
      setRepos(data.repos);
    } catch { /* ignore */ }
    setSyncing(false);
  };

  const searched = repos.filter((r) => !q || r.name?.toLowerCase().includes(q));
  const onCount = searched.filter((r) => r.enabled).length;
  const filtered = searched.filter((r) => status === "all" || (status === "on") === r.enabled);
  const paged = filtered.slice(0, shownCount);
  const anyFilter = !!(q || status !== "all");
  const clear = () => setParams({ q: "", status: "all" });

  return (
    <Page>
      <PageHeader
        title="Repositories"
        lead="Repos connected via the GitHub App. Enable the ones you want Coderhelm to work on, and set a role (web, backend, …) so Jira tickets route to the right repo."
      />

      {!loading && !error && repos.length > 0 && (
        <ListToolbar
          className="mt-6 mb-4"
          search={{
            value: params.q,
            onChange: (v) => setParams({ q: v }, { replace: true }),
            placeholder: "Search repos",
          }}
          status={{
            label: "Show repos",
            value: status,
            onChange: (v) => setParams({ status: v }),
            options: [
              { value: "all", label: "All", count: searched.length },
              { value: "on", label: "On", count: onCount, tone: "success" },
              { value: "off", label: "Off", count: searched.length - onCount, tone: "muted" },
            ],
          }}
          actions={
            <button type="button" onClick={sync} disabled={syncing} className={secondaryButton} title="Pull latest repos from GitHub">
              {syncing ? "Syncing..." : "Sync repos"}
            </button>
          }
          onClear={anyFilter ? clear : undefined}
          summary={`${filtered.length} repo${filtered.length !== 1 ? "s" : ""}${q ? ` matching "${params.q.trim()}"` : ""}`}
        />
      )}

      <div className={!loading && !error && repos.length > 0 ? "" : "mt-6"}>
        {loading ? (
          <ListSkeleton rows={3} label="Loading repos" />
        ) : error ? (
          <ListError title="Couldn't load your repos" onRetry={load} />
        ) : repos.length === 0 ? (
          <ListEmpty
            title="No repos connected yet."
            action={
              <>
                <a href="https://github.com/apps/coderhelm" className={secondaryButton}>
                  Install the GitHub App
                </a>
                <button type="button" onClick={sync} disabled={syncing} className={secondaryButton}>
                  {syncing ? "Syncing..." : "Sync repos"}
                </button>
              </>
            }
          />
        ) : filtered.length === 0 ? (
          <ListEmpty title="No repos match" onClear={clear} />
        ) : (
          <List label="Repositories">
            {paged.map((repo) => {
              const look = repoLook(repo);
              return (
                <ListRow
                  key={repo.name}
                  testId="repo-row"
                  data={{ enabled: String(repo.enabled) }}
                  leading={
                    <button
                      type="button"
                      role="switch"
                      aria-checked={repo.enabled}
                      aria-label={`Let Coderhelm work on ${repo.name}`}
                      onClick={() => handleToggle(repo)}
                      disabled={toggling === repo.name}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                        repo.enabled ? "bg-green-500" : "bg-zinc-700"
                      } ${toggling === repo.name ? "opacity-50" : "cursor-pointer"} ${focusRing}`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                          repo.enabled ? "translate-x-4.5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  }
                  title={repo.name}
                  titleText={repo.name}
                  quiet={!repo.enabled}
                  summary={
                    repo.enabled && repo.onboard_status === "pending" ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border border-sky-400/60 border-t-sky-300 motion-reduce:animate-none" />
                        Analyzing...
                      </span>
                    ) : repo.enabled && repo.onboard_status === "failed" ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span title={repo.onboard_error}>✕ {parseOnboardError(repo.onboard_error)}</span>
                        <button
                          type="button"
                          onClick={() => retry(repo)}
                          disabled={toggling === repo.name}
                          className={`rounded text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-200 disabled:opacity-50 ${focusRing}`}
                        >
                          Retry
                        </button>
                      </span>
                    ) : repo.enabled && repo.onboard_status === "ready" ? (
                      "✓ Ready"
                    ) : undefined
                  }
                  summaryTone={look.tone}
                  chips={
                    repo.enabled ? (
                      <span className="relative" title="Primary role for this repo — routes matching Jira tickets here">
                        <select
                          aria-label={`Role of ${repo.name}`}
                          value={repo.role || ""}
                          onChange={(e) => handleRoleChange(repo, e.target.value)}
                          disabled={savingRole === repo.name}
                          className={`appearance-none rounded-md border border-zinc-700 bg-zinc-900 py-1 pl-2.5 pr-7 text-xs font-medium text-zinc-300 focus:border-zinc-500 focus:outline-none disabled:opacity-50 ${focusRing}`}
                        >
                          <option value="">No role</option>
                          <option value="web">Web</option>
                          <option value="backend">Backend</option>
                          <option value="mobile">Mobile</option>
                          <option value="cms">CMS</option>
                          <option value="infra">Infra</option>
                          <option value="data">Data</option>
                        </select>
                        <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500"><polyline points="6 9 12 15 18 9" /></svg>
                      </span>
                    ) : undefined
                  }
                />
              );
            })}
          </List>
        )}
        <LoadMore hasMore={!loading && filtered.length > shownCount} loading={false} onClick={() => setShownCount((n) => n + PAGE_SIZE)} />
      </div>
    </Page>
  );
}
