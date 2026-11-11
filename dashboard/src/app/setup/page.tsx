"use client";

// Setup: every repo with whether Coderhelm's recommended settings are on it,
// what's new since the last run, the runs so far, and the team's choice for
// newly connected repos. A run itself (pick, analyze, review, apply) is at
// /setup/run.

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useCan } from "@/hooks/use-can";
import { useToast } from "@/components/toast";
import { Page, PageHeader, Section } from "@/components/page";
import { Callout } from "@/components/callout";
import { Problem } from "@/components/problem";
import { Skeleton } from "@/components/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ChevronRightIcon, GitBranchIcon, XIcon } from "@/components/icons";
import { SettingsRow, SettingsSection, Switch } from "@/components/settings";
import { StatusToggles, Time, type Tone } from "@/components/list";
import { buttonClass, focusRing, linkButton, primaryButton } from "@/components/ui";
import {
  REPO_STATE_LOOK,
  SETUP_ADMIN,
  SETUP_CHANGED,
  dismissKey,
  featureLabel,
  plural,
  setupApi,
  shortRepo,
  type NewRecommendation,
  type RepoState,
  type RunSummary,
  type SetupHome,
  type SetupRepo,
} from "@/lib/setup";
import { RepoStatePill, RunStatePill } from "./parts";
import { RowStart, StartCards } from "./chooser";
import { CountsLine, RepoFeatures } from "./repo-features";

export default function SetupPage() {
  const { toast } = useToast();
  const { ready, can } = useCan();
  const admin = ready && can(SETUP_ADMIN);
  const [home, setHome] = useState<SetupHome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [runsError, setRunsError] = useState(false);
  const [dismissProblem, setDismissProblem] = useState<string | null>(null);
  const [savingAuto, setSavingAuto] = useState(false);


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

  // Dismissed for the whole team: it leaves this list and the menu count for everyone.
  const dismiss = async (n: NewRecommendation) => {
    if (!home) return;
    const before = home;
    setDismissProblem(null);
    setHome({ ...home, new_recommendations: home.new_recommendations.filter((x) => x.setting_id !== n.setting_id) });
    try {
      const still = await setupApi.seen([n.setting_id]);
      if (still) setHome((h) => (h ? { ...h, new_recommendations: before.new_recommendations.filter((x) => still.includes(x.setting_id)) } : h));
      window.dispatchEvent(new Event(SETUP_CHANGED));
    } catch {
      setHome(before);
      setDismissProblem(`"${n.title}" wasn't dismissed. Try again.`);
    }
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

  const fresh = home?.new_recommendations ?? [];
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
          {dismissProblem && (
            <p role="alert" className="mt-2 text-sm text-red-300" data-testid="dismiss-problem">
              {dismissProblem}
            </p>
          )}
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
            {admin && (
            <button
              type="button"
              onClick={() => onDismiss(n)}
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 ${focusRing}`}
              aria-label={`Dismiss ${n.title}`}
              title="Dismiss for the whole team."
              data-testid="dismiss-rec"
            >
              <span className="scale-90">
                <XIcon />
              </span>
            </button>
            )}
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

/** The count, and why in one line: "5 on · 2 previews · 4 off", then "Auto-merge (no required checks), …". */
function FeaturesCell({ r, compact = false }: { r: SetupRepo; compact?: boolean }) {
  const why = r.summary?.includes(": ") ? r.summary.slice(r.summary.indexOf(": ") + 2) : "";
  return (
    <span className={`block min-w-0 text-zinc-300 ${compact ? "max-w-[11rem]" : ""}`} title={r.summary} data-testid="features-cell">
      {r.counts ? <CountsLine counts={r.counts} compact={compact} /> : <span className="tabular-nums">{r.features_total ? `${r.features_on} of ${r.features_total}` : r.features_on}</span>}
      {r.custom_count > 0 && <span className="text-zinc-400"> · {plural(r.custom_count, "changed by hand", "changed by hand")}</span>}
      {why && (
        <span className="mt-0.5 block truncate text-xs text-zinc-400" data-testid="features-why">
          {why}
        </span>
      )}
    </span>
  );
}

/** The row's disclosure: shows or hides the repo's features under it. */
function ExpandButton({ r, open, controls, onToggle }: { r: SetupRepo; open: boolean; controls: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className={`-ml-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 ${focusRing}`}
      data-testid="repo-expand"
    >
      <span aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}>
        <ChevronRightIcon />
      </span>
      <span className="sr-only">{open ? `Hide the features of ${r.repo}` : `Show the features of ${r.repo}`}</span>
    </button>
  );
}

/** True from Tailwind's `lg:` up, where the repos are a table; below it they are cards. */
function useWide(): boolean | null {
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    const q = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return wide;
}

const featuresId = (prefix: string, repo: string) => `${prefix}-features-${repo.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

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
  // An open row's features load in the layout on screen only (the table or the cards), never in both.
  const wide = useWide();
  // Which rows are open; kept only while the page is open.
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = useCallback((repo: string) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(repo)) n.delete(repo);
    else n.add(repo);
    return n;
  }), []);

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
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Features</th>
                {/* Below `2xl:` the date sits under the repo's name: the columns then fit the box in the widest common UI font. */}
                <th scope="col" className="hidden whitespace-nowrap px-4 py-2.5 font-medium 2xl:table-cell">Last setup</th>
                <th scope="col" className="px-4 py-2.5 font-medium"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {rows.map((r) => {
                const isOpen = open.has(r.repo);
                const fid = featuresId("t", r.repo);
                return (
                  <Fragment key={r.repo}>
                  <tr className={`align-middle ${isOpen ? "bg-zinc-900/60" : ""}`} data-testid="setup-repo-row" data-repo={r.repo}>
                    <td className="min-w-36 max-w-0 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <ExpandButton r={r} open={isOpen} controls={fid} onToggle={() => toggle(r.repo)} />
                        <div className="min-w-0">
                          <span className="block truncate font-medium text-zinc-100" title={r.repo}>{shortRepo(r.repo)}</span>
                          <span className="block truncate text-xs text-zinc-400" title={r.repo}>{r.repo}</span>
                          <span className="block truncate text-xs text-zinc-400 2xl:hidden" data-testid="repo-last-setup">
                            {r.last_run_at ? <>Set up <Time iso={r.last_run_at} mode="date" /></> : "Never set up"}
                          </span>
                        </div>
                      </div>
                      {r.state === "failed" && r.error && <span className="mt-1 block whitespace-normal pl-8 text-xs text-red-300" data-testid="repo-error">{r.error}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <RepoStatePill state={r.state} />
                    </td>
                    <td className="px-4 py-3">
                      <FeaturesCell r={r} compact />
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-zinc-400 2xl:table-cell">{r.last_run_at ? <Time iso={r.last_run_at} mode="date" /> : "Never"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {admin && <RowAction r={r} />}
                    </td>
                  </tr>
                  {isOpen && wide === true && (
                    <tr>
                      <td colSpan={5} className="p-0">
                        {/* Zero intrinsic width: the features wrap to the table's width and never widen it. */}
                        <div className="w-0 min-w-full">
                          <RepoFeatures repo={r.repo} admin={admin} id={fid} />
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Below `lg:` one card per repo, so nothing hides off the right edge. */}
        <ul aria-label="Repos" className="divide-y divide-zinc-800 lg:hidden">
          {rows.map((r) => {
            const isOpen = open.has(r.repo);
            const fid = featuresId("c", r.repo);
            return (
              <li key={r.repo} className="min-w-0" data-testid="setup-repo-card" data-repo={r.repo}>
                <div className="min-w-0 space-y-2 px-4 py-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                  <ExpandButton r={r} open={isOpen} controls={fid} onToggle={() => toggle(r.repo)} />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-100" title={r.repo}>{shortRepo(r.repo)}</p>
                    <p className="truncate text-xs text-zinc-400">{r.repo}</p>
                    {r.state === "failed" && r.error && <p className="mt-1 text-xs text-red-300" data-testid="repo-error">{r.error}</p>}
                  </div>
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
                </div>
                {isOpen && wide === false && <RepoFeatures repo={r.repo} admin={admin} id={fid} />}
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
