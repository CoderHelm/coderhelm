"use client";

import { Switch } from "@/components/settings/switch";

import { Callout } from "@/components/callout";
import { useCan } from "@/hooks/use-can";
import { ANY_CHANGE } from "@/lib/capabilities";
import { Suspense, useCallback, useEffect, useState } from "react";
import { api, type Repo } from "@/lib/api";
import { githubAppUrl } from "@/lib/runtime-config";
import { RoleGuard } from "@/components/role-guard";
import { useToast } from "@/components/toast";
import { Page, PageHeader } from "@/components/page";
import { buttonClass, secondaryButton } from "@/components/ui";
import { Select } from "@/components/select";
import { StatusText } from "@/components/list";
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

/** Why Coderhelm couldn't read a repository, in a sentence, and whether Try again can help. */
function readProblem(raw: string | undefined): { text: string; fixInGitHub: boolean } {
  const lower = (raw ?? "").toLowerCase();
  if (lower.includes("404")) return { text: "Coderhelm can't see this repository in GitHub.", fixInGitHub: true };
  if (lower.includes("rate limit")) return { text: "GitHub is limiting how fast Coderhelm can read. It tries again by itself.", fixInGitHub: false };
  if (lower.includes("timeout")) return { text: "Reading this repository took too long.", fixInGitHub: false };
  return { text: "Couldn't read this repository.", fixInGitHub: false };
}

/** The row's dot: off, being read, ready, or failed. */
function repoLook(repo: Repo): StatusLook {
  if (!repo.enabled) return { label: "Off", tone: "muted" };
  if (repo.onboard_status === "pending") return { label: "Reading…", tone: "live", live: true };
  if (repo.onboard_status === "failed") return { label: "Couldn't read", tone: "danger" };
  if (repo.onboard_status === "ready") return { label: "Ready", tone: "success" };
  return { label: "On", tone: "success" };
}

export default function ReposPageGuarded() {
  return (
    <RoleGuard need={ANY_CHANGE}>
      <Suspense fallback={<Page><PageHeader title="Repositories" /><div className="mt-6"><ListSkeleton /></div></Page>}>
        <ReposPage />
      </Suspense>
    </RoleGuard>
  );
}

/** What each repository type is called; the type decides which tickets go to it. */
const ROLE_NAMES: Record<string, string> = {
  web: "Website",
  backend: "Server",
  mobile: "Mobile app",
  cms: "Content site",
  infra: "Infrastructure",
  data: "Data",
};

function ReposPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const [toggling, setToggling] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [savingRole, setSavingRole] = useState<string | null>(null);
  // Turning repos on or off, syncing and routing roles need `repos`.
  const { ready, can } = useCan();
  const canManage = can("repos");
  const { toast } = useToast();
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

  const handleToggle = async (repo: Repo, undo = true) => {
    const on = !repo.enabled;
    setToggling(repo.name);
    try {
      await api.toggleRepo(repo.name, on);
      setRepos((prev) => prev.map((r) => r.name === repo.name ? { ...r, enabled: on, onboard_status: on ? "pending" : undefined } : r));
      toast(
        on ? `Coderhelm can work on ${repo.name}` : `${repo.name} turned off`,
        "success",
        undo ? { action: { label: "Undo", onClick: () => void handleToggle({ ...repo, enabled: on }, false) } } : undefined,
      );
    } catch {
      toast(`Couldn't turn ${repo.name} ${on ? "on" : "off"}. Try again.`, "error");
    }
    setToggling(null);
  };

  const handleRoleChange = async (repo: Repo, role: string) => {
    setSavingRole(repo.name);
    const prevRole = repo.role;
    // Optimistic update; revert on failure (e.g. non-admin gets 403).
    setRepos((prev) => prev.map((r) => r.name === repo.name ? { ...r, role: role || undefined } : r));
    try {
      await api.setRepoRole(repo.name, role);
      toast("Saved");
    } catch {
      setRepos((prev) => prev.map((r) => r.name === repo.name ? { ...r, role: prevRole } : r));
      toast("Couldn't change the type. Try again.", "error");
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
        lead="Turn on the code projects Coderhelm should work in. Give each one a type (website, server, mobile app…) so new tickets go to the right place; with no type, Coderhelm picks."
      />
      {ready && !canManage && (
        <div className="mt-6" data-testid="repos-read-only">
          <Callout live={false}>
            <p>Your role can see these repos but not change them. Ask an admin or owner to turn a repo on or off.</p>
          </Callout>
        </div>
      )}

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
            canManage ? (
              <button type="button" onClick={sync} disabled={syncing} className={secondaryButton} title="Added a repository in GitHub? Refresh to see it here.">
                {syncing ? "Refreshing…" : "Refresh from GitHub"}
              </button>
            ) : undefined
          }
          onClear={anyFilter ? clear : undefined}
          summary={q ? `${filtered.length} repo${filtered.length !== 1 ? "s" : ""} matching "${params.q.trim()}"` : undefined}
        />
      )}

      <div className={!loading && !error && repos.length > 0 ? "" : "mt-6"}>
        {loading ? (
          <ListSkeleton rows={3} label="Loading repos" />
        ) : error ? (
          <ListError title="Couldn't load your repositories" onRetry={load}>
            Nothing has changed. Check your connection and try again.
          </ListError>
        ) : repos.length === 0 ? (
          <ListEmpty
            title="No repositories connected yet"
            action={
              <>
                <a href={githubAppUrl()} className={secondaryButton}>
                  Install the GitHub App
                </a>
                {canManage && (
                  <button type="button" onClick={sync} disabled={syncing} className={secondaryButton}>
                    {syncing ? "Refreshing…" : "Refresh from GitHub"}
                  </button>
                )}
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
                    <Switch
                      checked={repo.enabled}
                      label={`Let Coderhelm work on ${repo.name}`}
                      onChange={() => handleToggle(repo)}
                      disabled={!canManage || toggling === repo.name}
                    />
                  }
                  title={repo.name}
                  titleText={repo.name}
                  quiet={!repo.enabled}
                  summary={
                    repo.enabled && repo.onboard_status === "failed" ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span>{readProblem(repo.onboard_error).text}</span>
                        {canManage &&
                          (readProblem(repo.onboard_error).fixInGitHub ? (
                            <a href={githubAppUrl()} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
                              Fix access in GitHub
                            </a>
                          ) : (
                            <button type="button" onClick={() => retry(repo)} disabled={toggling === repo.name} className={buttonClass("secondary", "sm")}>
                              Try again
                            </button>
                          ))}
                      </span>
                    ) : undefined
                  }
                  summaryTone={look.tone}
                  chips={
                    <>
                      {repo.enabled && <StatusText look={look} />}
                      {repo.enabled && canManage && (
                        <a
                          href={`/settings/repos/codegen?repo=${encodeURIComponent(repo.name)}`}
                          className={buttonClass("secondary", "sm")}
                          title="Public values its code generators need in the sandbox"
                        >
                          Codegen environment
                        </a>
                      )}
                      {repo.enabled && !canManage ? (
                        repo.role ? <span className="text-xs text-zinc-400">{ROLE_NAMES[repo.role] ?? repo.role}</span> : undefined
                      ) : repo.enabled ? (
                        <Select
                          size="sm"
                          aria-label={`Role of ${repo.name}`}
                          title="Which tickets go to this repository"
                          value={repo.role || ""}
                          onChange={(e) => handleRoleChange(repo, e.target.value)}
                          disabled={savingRole === repo.name}
                        >
                          <option value="">No type (Coderhelm picks)</option>
                          {Object.entries(ROLE_NAMES).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </Select>
                      ) : undefined}
                    </>
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
