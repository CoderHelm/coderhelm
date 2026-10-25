"use client";

import { useCan } from "@/hooks/use-can";
import { ANY_CHANGE } from "@/lib/capabilities";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, type TestSettings, type TestSummary } from "@/lib/api";
import { errorMessage } from "@/lib/data-sources";
import { readRepo, writeRepo } from "@/lib/tests";
import { RoleGuard } from "@/components/role-guard";
import { useToast } from "@/components/toast";
import { focusRing, primaryButton } from "@/components/ui";
import { Tabs } from "@/components/tabs";
import { Page, PageHeader } from "@/components/page";
import { LoadError, Loading } from "@/components/tests/common";
import { RepoFilter, useListParams } from "@/components/list";
import { FailureGroupsView, NeedsAttention, QuarantineView, RunsView, SlowestView } from "@/components/tests/views";
import { TrendsView } from "@/components/tests/trends";
import { CoverageView } from "@/components/tests/coverage";
import { SettingsView } from "@/components/tests/settings";
import { CiSetup } from "@/components/tests/setup";

export default function TestsPageGuarded() {
  return (
    <RoleGuard need={ANY_CHANGE}>
      <Suspense fallback={<Page><Loading what="your tests" /></Page>}>
        <TestsPage />
      </Suspense>
    </RoleGuard>
  );
}

type View = "attention" | "runs" | "groups" | "trends" | "slowest" | "quarantine" | "coverage" | "setup" | "settings";

const VIEWS: { value: View; label: string; adminOnly?: boolean }[] = [
  { value: "attention", label: "Needs attention" },
  { value: "runs", label: "Runs" },
  { value: "groups", label: "Failure groups" },
  { value: "trends", label: "Trends" },
  { value: "slowest", label: "Slowest" },
  { value: "quarantine", label: "Quarantine" },
  { value: "coverage", label: "Coverage" },
  { value: "setup", label: "Setup" },
  { value: "settings", label: "Settings", adminOnly: true },
];


function TestsPage() {
  const params = useSearchParams();
  const asked = params.get("view") as View | null;
  const { toast } = useToast();

  const { can } = useCan();
  const isAdmin = can("tests");
  const [settings, setSettings] = useState<TestSettings | null>(null);
  const [summary, setSummary] = useState<TestSummary | null>(null);
  // ?repo= leads; without one, the repo picked last time in this browser.
  const [listParams, setListParams] = useListParams({ repo: "" });
  const [stored, setStored] = useState("");
  const repo = listParams.repo || stored;
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [turningOn, setTurningOn] = useState(false);

  const visible = VIEWS.filter((v) => !v.adminOnly || isAdmin);
  const view: View = visible.some((v) => v.value === asked) ? (asked as View) : "attention";

  useEffect(() => {
    setStored(readRepo());
  }, []);

  const load = useCallback(async () => {
    setError("");
    // Settings may be admin-only on some servers; the page still works without them.
    const [s, sum] = await Promise.allSettled([api.getTestSettings(), api.getTestSummary(repo || undefined)]);
    if (s.status === "fulfilled") setSettings(s.value);
    if (sum.status === "fulfilled") setSummary(sum.value);
    else setError(errorMessage(sum.reason, "The request failed."));
    setLoaded(true);
  }, [repo]);

  useEffect(() => { load(); }, [load]);

  const pickRepo = (r: string) => {
    setStored(r);
    writeRepo(r);
    setListParams({ repo: r });
  };

  const turnOn = async () => {
    if (!settings) return;
    setTurningOn(true);
    try {
      const saved = await api.updateTestSettings({ ...settings, enabled: true });
      setSettings(saved);
      toast("E2E tracking is on");
    } catch (e) {
      toast(errorMessage(e, "Couldn't turn it on."), "error");
    } finally {
      setTurningOn(false);
    }
  };

  const noData =
    summary !== null &&
    summary.runs_7d === 0 &&
    summary.trend.every((d) => d.runs === 0) &&
    Object.values(summary.counts).every((n) => n === 0);
  const off = settings !== null && !settings.enabled;
  const showEmpty = loaded && !error && view !== "settings" && (off || (noData && view !== "setup"));

  return (
    <Page>
      <PageHeader
        title="Tests"
        titleClassName="text-balance"
        lead="Every E2E run from your CI: which tests are flaky, which are broken, what they cost your team, and which tests are worth adding."
        actions={
          summary && (summary.repos.length > 1 || repo) ? <RepoFilter value={repo} onChange={pickRepo} repos={summary.repos} /> : undefined
        }
      />

      <Tabs
        label="Tests views"
        value={view}
        items={visible.map((v) => ({ value: v.value, label: v.label, href: v.value === "attention" ? "/tests" : `/tests?view=${v.value}` }))}
      />

      <div className="mt-6">
        {!loaded ? (
          <Loading what="your tests" />
        ) : error && view !== "settings" && view !== "setup" ? (
          <LoadError what="your tests" message={error} onRetry={load} />
        ) : showEmpty ? (
          <EmptyState off={off} isAdmin={isAdmin} turningOn={turningOn} onTurnOn={turnOn} />
        ) : view === "attention" ? (
          <NeedsAttention repo={repo} summary={summary} />
        ) : view === "runs" ? (
          <RunsView repo={repo} />
        ) : view === "groups" ? (
          <FailureGroupsView repo={repo} />
        ) : view === "trends" ? (
          <TrendsView summary={summary} />
        ) : view === "slowest" ? (
          <SlowestView repo={repo} />
        ) : view === "quarantine" ? (
          <QuarantineView repo={repo} canEdit={isAdmin} ticketDays={settings?.ticket_after_days} />
        ) : view === "setup" ? (
          <CiSetup canEdit={isAdmin} repo={repo} />
        ) : view === "coverage" ? (
          <CoverageView repo={repo} canEdit={isAdmin} />
        ) : settings ? (
          <SettingsView settings={settings} onSaved={setSettings} />
        ) : (
          <Loading what="settings" />
        )}
      </div>
    </Page>
  );
}

function EmptyState({ off, isAdmin, turningOn, onTurnOn }: { off: boolean; isAdmin: boolean; turningOn: boolean; onTurnOn: () => void }) {
  return (
    <section aria-labelledby="empty-heading" className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 sm:p-7">
      <h2 id="empty-heading" className="text-lg font-semibold text-zinc-100">
        {off ? "Turn on E2E tracking" : "Waiting for the first E2E run"}
      </h2>
      <p className="mt-2 max-w-prose text-sm text-zinc-400">
        {off
          ? "Coderhelm reads the results of every E2E run your CI finishes. It tells flaky tests from broken ones, keeps flaky tests from blocking pull requests, and opens PRs that fix them."
          : "Tracking is on. Runs show up here a few minutes after a workflow that uploads test results finishes. Coderhelm can add that upload step for you."}
      </p>
      {off && (
        <div className="mt-4">
          {isAdmin ? (
            <button type="button" onClick={onTurnOn} disabled={turningOn} className={primaryButton}>
              {turningOn ? "Turning on…" : "Turn on E2E tracking"}
            </button>
          ) : (
            <p className="text-sm text-zinc-300">Ask an admin on your team to turn it on.</p>
          )}
        </div>
      )}
      {!off && (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold text-zinc-100">Set up each repository</h3>
          <CiSetup canEdit={isAdmin} />
        </div>
      )}
    </section>
  );
}
