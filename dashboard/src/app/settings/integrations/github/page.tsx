"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCan } from "@/hooks/use-can";
import { api, type Integration, type Repo } from "@/lib/api";
import { findCard, INTEGRATION_STATUS } from "@/lib/integration-status";
import { Skeleton } from "@/components/skeleton";
import { RoleGuard } from "@/components/role-guard";
import { Page, PageHeader } from "@/components/page";
import { Callout } from "@/components/callout";
import { StatusPill } from "@/components/status-pill";
import { StatusText } from "@/components/list";
import { SettingsSection } from "@/components/settings";
import { EmptyState } from "@/components/empty-state";
import { Problem } from "@/components/problem";
import { ExternalLinkIcon, GitHubIcon } from "@/components/icons";
import { buttonClass, linkButton } from "@/components/ui";

const GITHUB_APP_INSTALL_URL = "https://github.com/apps/coderhelm/installations/new";
const STATE_STORAGE_KEY = "gh_install_state";

export default function GitHubSettingsPageGuarded() {
  return (
    <RoleGuard need="view_integrations">
      <GitHubSettingsPage />
    </RoleGuard>
  );
}

type InstallStatus = "not_connected" | "connected" | "linking";

const REPO_STATUS: Record<string, { label: string; tone: "success" | "waiting" | "danger" }> = {
  ready: { label: "Ready", tone: "success" },
  pending: { label: "Reading the code…", tone: "waiting" },
  failed: { label: "Couldn't read it", tone: "danger" },
};

/**
 * Whether the app is installed. The Integrations overview card decides, so
 * this page and the overview always agree; the older installation-status
 * answer and the team's active repos are the fallbacks. A team with active
 * repos is never shown as "Not installed".
 */
function installedFrom(card: Integration | undefined, installStatus: string | undefined, activeRepos: number): boolean {
  if (card) return card.status === "connected" || activeRepos > 0;
  return installStatus === "connected" || installStatus === "active" || activeRepos > 0;
}

function GitHubSettingsPage() {
  const searchParams = useSearchParams();
  const { can } = useCan();
  const [login, setLogin] = useState<string | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [card, setCard] = useState<Integration | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState<string | null>(null);
  const [status, setStatus] = useState<InstallStatus>("not_connected");
  const [githubOrg, setGithubOrg] = useState<string | null>(null);
  const [installationId, setInstallationId] = useState<number | null>(null);
  const [error, setError] = useState<{ title: string; body: string; details?: string } | null>(null);
  const [linkResult, setLinkResult] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoadFailed(null);
    try {
      const [me, repoData, installStatus, integrations] = await Promise.all([
        api.me(),
        api.listRepos(),
        api.getInstallationStatus().catch(() => undefined),
        api.getIntegrations().catch(() => undefined),
      ]);
      setLogin(me.github_login);
      setRepos(repoData.repos);
      const c = findCard(integrations?.items, "github");
      setCard(c);
      const active = repoData.repos.filter((r) => r.enabled).length;
      if (installedFrom(c, installStatus?.status, active)) {
        setStatus("connected");
        const cardOrg = typeof c?.detail?.org === "string" && c.detail.org ? (c.detail.org as string) : null;
        setGithubOrg(installStatus?.github_org ?? cardOrg);
        setInstallationId(installStatus?.installation_id ?? null);
      } else {
        setStatus("not_connected");
      }
    } catch (e) {
      setLoadFailed(e instanceof Error ? e.message : "");
    } finally {
      setLoading(false);
    }
  }, []);

  // On mount: load the status, then finish an install GitHub sent us back from.
  useEffect(() => {
    loadStatus().then(() => {
      const installationParam = searchParams.get("installation_id");
      const setupAction = searchParams.get("setup_action");
      const returnedState = searchParams.get("state");
      if (!installationParam) return;

      // The state we stored before sending the person to GitHub must come back unchanged.
      const savedState = sessionStorage.getItem(STATE_STORAGE_KEY);
      sessionStorage.removeItem(STATE_STORAGE_KEY);
      window.history.replaceState({}, "", "/settings/integrations/github/");

      if (!savedState || savedState !== returnedState) {
        setError({ title: "The GitHub connection didn't finish", body: "Start again with Install. If it keeps happening, open the install from this page rather than from GitHub." });
        return;
      }

      if (setupAction === "request") {
        setError(null);
        setLinkResult("Request sent. Someone with admin rights on your GitHub organization needs to approve the Coderhelm app; it connects by itself once they do.");
        return;
      }

      const id = parseInt(installationParam, 10);
      if (isNaN(id)) {
        setError({ title: "The GitHub connection didn't finish", body: "Start again with Install." });
        return;
      }

      setStatus("linking");
      setError(null);
      api
        .linkGithubInstallation(id)
        .then((result) => {
          if (result.error) {
            setError({ title: "Couldn't connect to GitHub", body: "Start again with Install. If it keeps failing, contact support.", details: result.error });
            setStatus("not_connected");
          } else {
            setStatus("connected");
            setGithubOrg(result.github_org ?? null);
            setLinkResult(`Connected to ${result.github_org}. ${result.repos_synced ?? 0} repositories found.`);
            api.listRepos().then((r) => setRepos(r.repos)).catch(() => {});
          }
        })
        .catch((e) => {
          setError({ title: "Couldn't connect to GitHub", body: "Start again with Install. If it keeps failing, contact support.", details: e instanceof Error ? e.message : undefined });
          setStatus("not_connected");
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInstallClick = () => {
    const state = crypto.randomUUID();
    sessionStorage.setItem(STATE_STORAGE_KEY, state);
    window.location.href = `${GITHUB_APP_INSTALL_URL}?state=${state}`;
  };

  const header = (
    <PageHeader title="GitHub" lead="Coderhelm reads your code, opens pull requests and follows CI through the Coderhelm GitHub App." />
  );

  if (loading) {
    return (
      <Page>
        <div className="mb-6">{header}</div>
        <Skeleton className="h-24 w-full" />
      </Page>
    );
  }

  if (loadFailed !== null) {
    return (
      <Page>
        <div className="mb-6">{header}</div>
        <Problem title="Couldn't load the GitHub connection" onRetry={loadStatus} details={loadFailed || undefined}>
          Nothing has changed. Check your connection and try again.
        </Problem>
      </Page>
    );
  }

  const enabledRepos = repos.filter((r) => r.enabled);
  const canConnect = can("integrations");
  // The overview's words for a problem it found (needs reconnecting, not working).
  const cardProblem = card && card.status !== "connected" && card.status !== "not_connected" ? card : undefined;

  return (
    <Page>
      <div className="mb-6">{header}</div>

      <div className="space-y-4">
        {error && (
          <Problem title={error.title} details={error.details}>
            {error.body}
          </Problem>
        )}
        {linkResult && !error && <Callout variant="success">{linkResult}</Callout>}
        {cardProblem && (
          <Callout variant={INTEGRATION_STATUS[cardProblem.status].tone === "error" ? "error" : "warning"} title={INTEGRATION_STATUS[cardProblem.status].label}>
            {cardProblem.reason ? <p className="[overflow-wrap:anywhere]">{cardProblem.reason}</p> : null}
          </Callout>
        )}

        {/* The app */}
        <section aria-labelledby="gh-app-heading" className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5" data-testid="github-app">
          <div className="flex min-w-0 flex-wrap items-center gap-4">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-200">
              <GitHubIcon />
            </span>
            <div className="min-w-0 flex-1 basis-48">
              <h2 id="gh-app-heading" className="text-sm text-zinc-400">
                GitHub App
              </h2>
              <p className="mt-0.5 text-base font-semibold text-zinc-100 [overflow-wrap:anywhere]">
                {status === "connected" ? githubOrg ?? login ?? "Installed" : status === "linking" ? "Connecting to GitHub…" : "Not installed"}
              </p>
              {status === "connected" && login && githubOrg && login !== githubOrg && (
                <p className="mt-0.5 text-sm text-zinc-400">
                  You&apos;re signed in as <span className="[overflow-wrap:anywhere]">{login}</span>
                </p>
              )}
              {status === "not_connected" && (
                <p className="mt-0.5 text-sm text-zinc-400">
                  {canConnect ? "Install the app to give Coderhelm access to the repositories you choose." : "Ask an admin on your team to install the app."}
                </p>
              )}
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {status === "connected" ? (
                <>
                  <StatusPill tone="success">Connected</StatusPill>
                  {installationId && (
                    <a
                      href={`https://github.com/apps/coderhelm/installations/${installationId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${buttonClass("secondary", "sm")} gap-1.5`}
                    >
                      Choose repositories on GitHub
                      <ExternalLinkIcon />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  )}
                </>
              ) : status === "linking" ? (
                <StatusPill>Connecting…</StatusPill>
              ) : canConnect ? (
                <button type="button" onClick={handleInstallClick} className={`${buttonClass("primary")} gap-1.5`}>
                  Install on GitHub
                  <ExternalLinkIcon />
                </button>
              ) : (
                <StatusPill>Not installed</StatusPill>
              )}
            </div>
          </div>
        </section>

        <SettingsSection
          id="github-repos"
          title={`Repositories (${enabledRepos.length} active)`}
          description={
            <>
              Turn repositories on or off in{" "}
              <Link href="/settings/repos" className={linkButton}>
                Repositories
              </Link>
              .
            </>
          }
        >
          {enabledRepos.length === 0 ? (
            <EmptyState compact title="No repositories turned on yet">
              {status === "connected" ? "Turn one on in Repositories and Coderhelm starts reading its code." : "Install the app first, then turn repositories on."}
            </EmptyState>
          ) : (
            <ul aria-label="Active repositories" className="divide-y divide-zinc-800">
              {enabledRepos.map((repo) => {
                const st = repo.onboard_status ? REPO_STATUS[repo.onboard_status] : undefined;
                return (
                  <li key={repo.name} className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                    <span className="min-w-0 text-sm text-zinc-100 [overflow-wrap:anywhere]">{repo.name}</span>
                    {st && <StatusText look={{ label: st.label, tone: st.tone, live: repo.onboard_status === "pending" }} />}
                    {repo.onboard_status === "failed" && (
                      <p className="basis-full text-sm text-zinc-400">
                        Coderhelm couldn&apos;t read this repository. Check the app has access to it on GitHub, then try again from{" "}
                        <Link href="/settings/repos" className={linkButton}>
                          Repositories
                        </Link>
                        .
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </SettingsSection>
      </div>
    </Page>
  );
}
