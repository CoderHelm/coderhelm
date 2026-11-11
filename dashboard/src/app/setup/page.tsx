"use client";

// Setup: every repo with whether Coderhelm's recommended settings are on it,
// what's new since the last run, the runs so far, and the team's choice for
// newly connected repos. A run itself (pick, analyze, review, apply) is at
// /setup/run.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCan } from "@/hooks/use-can";
import { useToast } from "@/components/toast";
import { Page, PageHeader, Section } from "@/components/page";
import { Callout } from "@/components/callout";
import { Problem } from "@/components/problem";
import { Skeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { GitBranchIcon, XIcon } from "@/components/icons";
import { SettingsRow, SettingsSection, Switch } from "@/components/settings";
import { StatusToggles, Time, type Tone } from "@/components/list";
import { buttonClass, focusRing, linkButton, primaryButton } from "@/components/ui";
import {
  REPO_STATE_LOOK,
  SETUP_ADMIN,
  dismissKey,
  featureLabel,
  plural,
  readDismissed,
  setupApi,
  shortRepo,
  writeDismissed,
  type NewRecommendation,
  type RepoState,
  type RunSummary,
  type SetupHome,
  type SetupRepo,
} from "@/lib/setup";
import { RepoStatePill, RunStatePill } from "./parts";
import { RowStart, StartCards } from "./chooser";

export default function SetupPage() {
  const { toast } = useToast();
  const { ready, can } = useCan();
  const admin = ready && can(SETUP_ADMIN);
  const [home, setHome] = useState<SetupHome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [runsError, setRunsError] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [savingAuto, setSavingAuto] = useState(false);

  useEffect(() => setDismissed(readDismissed()), []);

  useEffect(() => {
    let live = true;
    setError(null);
    setupApi.home().then(
      (h) => live && setHome(h),
      (e) => live && setError(e instanceof Error ? e.message : "The request failed."),
    );
    setupApi.runs().then(
      (r) => live && setRuns(r),
      () => live && setRunsError(true),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  // A repo still being read: look again until it's done, without redrawing what's there.
  const analyzing = !!home?.repos.some((r) => r.state === "analyzing");
  useEffect(() => {
    if (!analyzing) return;
    const t = window.setInterval(() => {
      setupApi.home().then(setHome, () => {});
    }, 4000);
    return () => window.clearInterval(t);
  }, [analyzing]);

  const dismiss = (n: NewRecommendation) => {
    const next = new Set(dismissed).add(dismissKey(n));
    setDismissed(next);
    writeDismissed(next);
  };

  const setAuto = async (on: boolean) => {
    if (!home) return;
    setSavingAuto(true);
    setHome({ ...home, auto_setup_new_repos: on });
    try {
      await setupApi.saveSettings({ auto_setup_new_repos: on });
      toast(on ? "New repos will be set up with your last reviewed choices" : "New repos will wait for you");
    } catch {
      setHome((h) => (h ? { ...h, auto_setup_new_repos: !on } : h));
      toast("Couldn't save that. Try again.", "error");
    }
    setSavingAuto(false);
  };

  const fresh = home?.new_recommendations.filter((n) => !dismissed.has(dismissKey(n))) ?? [];
  const open = home?.last_run && ["analyzing", "ready", "applying"].includes(home.last_run.state) ? home.last_run : null;
  const notSetUp = home?.repos.filter((r) => r.state === "not_set_up").length ?? 0;

  return (
    <Page testId="setup-home">
      <PageHeader
        title="Setup"
        lead="Coderhelm reads each repo and recommends a value for every setting, with the reason next to it. Let it turn them on for you, or review each one first. Either way, any change can be undone."
      />

      {error ? (
        <div className="mt-6">
          <Problem title="We couldn't load Setup" onRetry={() => setAttempt((n) => n + 1)} testId="setup-error">
            {error}
          </Problem>
        </div>
      ) : !home ? (
        <HomeSkeleton />
      ) : home.repos.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<GitBranchIcon />}
            title="Connect a repo to set it up"
            testId="setup-empty"
            action={
              <Link href="/settings/repos" className={primaryButton}>
                Connect repos
              </Link>
            }
          >
            Coderhelm reads each repo you connect and turns on the reviewer, tests, labels and the rest the way that repo already works, and shows you why
            before anything changes.
          </EmptyState>
        </div>
      ) : (
        <>
          {open && <OpenRun run={open} />}
          {admin && !open && (
            <div className="mt-6">
              <StartCards
                query={notSetUp > 0 ? "repos=not_set_up" : "repos=all"}
                title={notSetUp > 0 ? `${plural(notSetUp, "repo isn't", "repos aren't")} set up yet` : "Run Setup again on every repo"}
              />
            </div>
          )}
          {fresh.length > 0 && <NewPanel items={fresh} admin={admin} onDismiss={dismiss} />}
          <ReposSection repos={home.repos} admin={admin} />
          <HistorySection runs={runs} failed={runsError} />
          <div className="mt-10">
            <SettingsSection id="new-repos" title="Newly connected repos">
              <SettingsRow
                layout="toggle"
                label="Set up new repos on their own"
                help="When a repo is connected, apply the choices from your last reviewed run to it, then list what changed here. Off: new repos wait as Not set up."
                testId="auto-setup-row"
                control={(ids) => (
                  <Switch
                    id={ids.inputId}
                    labelledBy={ids.labelId}
                    describedBy={ids.helpId}
                    checked={home.auto_setup_new_repos}
                    onChange={setAuto}
                    disabled={!admin || savingAuto}
                    testId="auto-setup"
                  />
                )}
              />
            </SettingsSection>
          </div>
        </>
      )}
    </Page>
  );
}

function HomeSkeleton() {
  return (
    <div className="mt-8 space-y-3" aria-busy="true">
      <p role="status" className="sr-only">
        Loading Setup…
      </p>
      <Skeleton className="h-4 w-40" />
      <div aria-hidden="true" className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30">
        {[64, 48, 56, 40].map((w, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="h-3.5" style={{ width: `${w * 2}px` }} />
            <Skeleton className="ml-auto h-5 w-20 rounded-full" />
            <Skeleton className="hidden h-3 w-16 sm:block" />
            <Skeleton className="hidden h-3 w-14 sm:block" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

function OpenRun({ run }: { run: RunSummary }) {
  const words =
    run.state === "analyzing"
      ? "Coderhelm is still reading the repos. You can watch it, or come back later."
      : run.state === "applying"
        ? "Your last run is applying now."
        : "Coderhelm has finished reading the repos. Your review is waiting.";
  return (
    <div className="mt-6">
      <Callout
        variant="info"
        title={run.state === "ready" ? "A run is ready to review" : "A run is in progress"}
        testId="open-run"
        actions={
          <Link href={`/setup/run?id=${encodeURIComponent(run.run_id)}`} className={buttonClass("primary", "sm")}>
            {run.state === "ready" ? "Review it" : "Open it"}
          </Link>
        }
      >
        <p>
          {words} Started <Time iso={run.created_at} />
          {run.by ? ` by ${run.by}` : ""}.
        </p>
      </Callout>
    </div>
  );
}

/** What a Coderhelm release added: small, one line each, dismissible one by one. */
function NewPanel({ items, admin, onDismiss }: { items: NewRecommendation[]; admin: boolean; onDismiss: (n: NewRecommendation) => void }) {
  const shown = items.slice(0, 5);
  return (
    <section aria-labelledby="new-recs-heading" className="mt-6 min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/40" data-testid="new-recommendations">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-zinc-800 px-4 py-2.5">
        <h2 id="new-recs-heading" className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-violet-400" />
          New recommendations
          <span className="font-normal tabular-nums text-zinc-400">{items.length}</span>
        </h2>
        {admin && (
          <Link href="/setup/run?repos=all&only_new=1" className={`${linkButton} !text-sm`} data-testid="review-new">
            Review on every repo
          </Link>
        )}
      </div>
      <ul className="divide-y divide-zinc-800/70">
        {shown.map((n) => (
          <li key={dismissKey(n)} className="flex min-w-0 items-center gap-3 py-1.5 pl-4 pr-1.5" data-testid="new-rec" data-id={n.setting_id}>
            <p className="min-w-0 flex-1 text-sm">
              <span className="text-zinc-100">{n.title}</span>
              <span className="text-zinc-400">
                {" "}
                · {featureLabel(n.feature)}
                {n.since ? <span className="whitespace-nowrap"> · new in {n.since}</span> : null}
              </span>
            </p>
            <button
              type="button"
              onClick={() => onDismiss(n)}
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 ${focusRing}`}
              aria-label={`Dismiss ${n.title}`}
              title="Dismiss. It won't show again until a release changes it."
              data-testid="dismiss-rec"
            >
              <span className="scale-90">
                <XIcon />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {items.length > shown.length && <p className="border-t border-zinc-800/70 px-4 py-2 text-xs text-zinc-400">and {items.length - shown.length} more</p>}
    </section>
  );
}

const FILTERS: { value: "" | RepoState; label: string; tone?: Tone }[] = [
  { value: "", label: "All" },
  { value: "not_set_up", label: "Not set up", tone: "waiting" },
  { value: "update_available", label: "Update available", tone: "merged" },
  { value: "custom", label: "Custom", tone: "info" },
  { value: "failed", label: "Failed", tone: "danger" },
  { value: "set_up", label: "Set up", tone: "success" },
  { value: "analyzing", label: "Analyzing", tone: "live" },
];

/** A repo row's action: the two ways to start where a run is due, one link otherwise. */
function RowAction({ r }: { r: SetupRepo }) {
  const one = `/setup/run?repos=${encodeURIComponent(r.repo)}&mode=guided`;
  if (r.state === "not_set_up") return <RowStart repo={r.repo} />;
  if (r.state === "update_available") return <RowStart repo={r.repo} onlyNew label={r.new_count ? `Turn on ${r.new_count} new` : "Turn on new"} />;
  if (r.state === "failed") return <RowStart repo={r.repo} label="Try again" />;
  if (r.state === "analyzing")
    return (
      <Link href="/setup#runs" className={buttonClass("secondary", "sm")}>
        Open
      </Link>
    );
  const label = r.state === "custom" ? "Review" : "Run again";
  return (
    <Link href={one} className={buttonClass("secondary", "sm")} aria-label={`${label}: ${r.repo}`}>
      {label}
    </Link>
  );
}

function FeaturesCell({ r }: { r: SetupRepo }) {
  return (
    <span className="text-zinc-300">
      <span className="tabular-nums">{r.features_total ? `${r.features_on} of ${r.features_total}` : r.features_on}</span>
      {r.custom_count > 0 && <span className="text-zinc-400"> · {plural(r.custom_count, "changed by hand", "changed by hand")}</span>}
    </span>
  );
}

function ReposSection({ repos, admin }: { repos: SetupRepo[]; admin: boolean }) {
  const [filter, setFilter] = useState<"" | RepoState>("");
  const counts = useMemo(() => {
    const c: Partial<Record<RepoState, number>> = {};
    for (const r of repos) c[r.state] = (c[r.state] ?? 0) + 1;
    return c;
  }, [repos]);
  const order: RepoState[] = ["failed", "not_set_up", "update_available", "analyzing", "custom", "set_up"];
  const rows = repos.filter((r) => !filter || r.state === filter).sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || a.repo.localeCompare(b.repo));
  const options = FILTERS.filter((f) => !f.value || counts[f.value]).map((f) => ({ ...f, count: f.value ? counts[f.value] : repos.length }));
  const onChange = useCallback((v: string) => setFilter(v as "" | RepoState), []);

  return (
    <Section title="Repos" id="repos" description={`${plural(repos.length, "repo")} connected. Each one keeps its own settings.`}>
      {options.length > 2 && (
        <div className="mb-3">
          <StatusToggles label="Show repos" value={filter} onChange={onChange} options={options} />
        </div>
      )}
      <div className="min-w-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30" data-testid="setup-repos">
        <div className="hidden overflow-x-auto lg:block">
          <table aria-label="Repos" className="w-full table-auto text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400">
                <th scope="col" className="w-full px-4 py-2.5 font-medium">Repo</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">State</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Features on</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Last setup</th>
                <th scope="col" className="px-4 py-2.5 font-medium"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {rows.map((r) => {
                return (
                  <tr key={r.repo} className="align-middle" data-testid="setup-repo-row" data-repo={r.repo}>
                    <td className="min-w-48 max-w-0 px-4 py-3">
                      <span className="block truncate font-medium text-zinc-100" title={r.repo}>{shortRepo(r.repo)}</span>
                      <span className="block truncate text-xs text-zinc-400" title={r.repo}>{r.repo}</span>
                      {r.state === "failed" && r.error && <span className="mt-1 block whitespace-normal text-xs text-red-300" data-testid="repo-error">{r.error}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <RepoStatePill state={r.state} />
                    </td>
                    <td className="min-w-40 max-w-72 px-4 py-3">
                      <FeaturesCell r={r} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-400">{r.last_run_at ? <Time iso={r.last_run_at} mode="date" /> : "Never"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {admin && <RowAction r={r} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Below `lg:` one card per repo, so nothing hides off the right edge. */}
        <ul aria-label="Repos" className="divide-y divide-zinc-800 lg:hidden">
          {rows.map((r) => {
            return (
              <li key={r.repo} className="min-w-0 space-y-2 px-4 py-3" data-testid="setup-repo-card" data-repo={r.repo}>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-100" title={r.repo}>{shortRepo(r.repo)}</p>
                    <p className="truncate text-xs text-zinc-400">{r.repo}</p>
                    {r.state === "failed" && r.error && <p className="mt-1 text-xs text-red-300" data-testid="repo-error">{r.error}</p>}
                  </div>
                  <RepoStatePill state={r.state} />
                </div>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm">
                  <span className="min-w-0">
                    <FeaturesCell r={r} />
                    <span className="text-zinc-400"> · {r.last_run_at ? <Time iso={r.last_run_at} mode="date" /> : "never set up"}</span>
                  </span>
                  {admin && <RowAction r={r} />}
                </div>
              </li>
            );
          })}
        </ul>
        {rows.length === 0 && <p className="px-4 py-6 text-center text-sm text-zinc-400">No repo is {REPO_STATE_LOOK[filter as RepoState]?.label.toLowerCase()} right now.</p>}
      </div>
    </Section>
  );
}

function HistorySection({ runs, failed }: { runs: RunSummary[] | null; failed: boolean }) {
  return (
    <Section title="Runs" id="runs" description="Each run is saved to the audit log, and each can be undone from its page.">
      {failed ? (
        <p className="text-sm text-zinc-400">The run history couldn&apos;t be loaded. Reload the page to try again.</p>
      ) : !runs ? (
        <div aria-hidden="true" className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : runs.length === 0 ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-4 text-sm text-zinc-400" data-testid="runs-empty">
          No runs yet. Your first one shows here with what it changed.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30" data-testid="setup-runs">
          {runs.slice(0, 10).map((r) => (
            <li key={r.run_id}>
              <Link
                href={`/setup/run?id=${encodeURIComponent(r.run_id)}`}
                className={`flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-zinc-900 ${focusRing} focus-visible:outline-offset-[-2px]`}
                data-testid="setup-run"
              >
                <span className="min-w-0 flex-1 text-zinc-100">
                  <Time iso={r.created_at} mode="date" />
                  <span className="text-zinc-400">
                    {r.by ? ` by ${r.by}` : ""}
                    {typeof r.repo_count === "number" ? ` · ${plural(r.repo_count, "repo")}` : ""}
                    {typeof r.changed === "number" ? ` · ${plural(r.changed, "setting")} changed` : ""}
                  </span>
                </span>
                <RunStatePill state={r.state} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
