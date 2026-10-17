"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, type TestSettings, type TestSummary } from "@/lib/api";
import { errorMessage } from "@/lib/data-sources";
import { readRepo, writeRepo } from "@/lib/tests";
import { RoleGuard } from "@/components/role-guard";
import { useToast } from "@/components/toast";
import { focusRing, primaryButton } from "@/components/ui";
import { LoadError, Loading, Select } from "@/components/tests/common";
import { FailureGroupsView, NeedsAttention, QuarantineView, RunsView, SlowestView } from "@/components/tests/views";
import { TrendsView } from "@/components/tests/trends";
import { CoverageView } from "@/components/tests/coverage";
import { SettingsView, SetupSteps } from "@/components/tests/settings";

export default function TestsPageGuarded() {
  return (
    <RoleGuard minRole="member">
      <Suspense fallback={<Loading what="your tests" />}>
        <TestsPage />
      </Suspense>
    </RoleGuard>
  );
}

type View = "attention" | "runs" | "groups" | "trends" | "slowest" | "quarantine" | "coverage" | "settings";

const VIEWS: { value: View; label: string; adminOnly?: boolean }[] = [
  { value: "attention", label: "Needs attention" },
  { value: "runs", label: "Runs" },
  { value: "groups", label: "Failure groups" },
  { value: "trends", label: "Trends" },
  { value: "slowest", label: "Slowest" },
  { value: "quarantine", label: "Quarantine" },
  { value: "coverage", label: "Coverage" },
  { value: "settings", label: "Settings", adminOnly: true },
];

const ADMIN_ROLES = new Set(["admin", "owner"]);

function TestsPage() {
  const params = useSearchParams();
  const asked = params.get("view") as View | null;
  const { toast } = useToast();

  const [isAdmin, setIsAdmin] = useState(false);
  const [settings, setSettings] = useState<TestSettings | null>(null);
  const [summary, setSummary] = useState<TestSummary | null>(null);
  const [repo, setRepo] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [turningOn, setTurningOn] = useState(false);

  const visible = VIEWS.filter((v) => !v.adminOnly || isAdmin);
  const view: View = visible.some((v) => v.value === asked) ? (asked as View) : "attention";

  useEffect(() => {
    setRepo(readRepo());
    api.me().then((u) => setIsAdmin(ADMIN_ROLES.has(u.role))).catch(() => setIsAdmin(false));
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
    setRepo(r);
    writeRepo(r);
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
  const showEmpty = loaded && !error && (off || noData) && view !== "settings";

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-zinc-100 text-balance">Tests</h1>
          <p className="mt-2 max-w-prose text-sm text-zinc-400">
            Every E2E run from your CI: which tests are flaky, which are broken, what they cost your team, and which tests are worth adding.
          </p>
        </div>
        {summary && summary.repos.length > 1 && (
          <div className="w-full sm:w-64">
            <Select
              label="Repository"
              value={repo}
              onChange={pickRepo}
              options={[{ value: "", label: "All repositories" }, ...summary.repos.map((r) => ({ value: r, label: r }))]}
            />
          </div>
        )}
      </div>

      <nav aria-label="Tests views" className="mt-6 border-b border-zinc-800">
        <ul className="-mb-px flex flex-wrap gap-x-1">
          {visible.map((v) => {
            const current = v.value === view;
            return (
              <li key={v.value}>
                <Link
                  href={v.value === "attention" ? "/tests" : `/tests?view=${v.value}`}
                  aria-current={current ? "page" : undefined}
                  className={`inline-flex min-h-10 items-center border-b-2 px-3 text-sm rounded-t ${
                    current ? "border-zinc-100 font-medium text-zinc-100" : "border-transparent text-zinc-400 hover:text-zinc-100"
                  } ${focusRing}`}
                >
                  {v.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-6">
        {!loaded ? (
          <Loading what="your tests" />
        ) : error && view !== "settings" ? (
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
          <QuarantineView repo={repo} canEdit={isAdmin} />
        ) : view === "coverage" ? (
          <CoverageView repo={repo} canEdit={isAdmin} />
        ) : settings ? (
          <SettingsView settings={settings} onSaved={setSettings} />
        ) : (
          <Loading what="settings" />
        )}
      </div>
    </div>
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
          : "Tracking is on. Runs show up here a few minutes after a workflow that uploads test results finishes."}
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
      <h3 className="mt-7 text-sm font-semibold text-zinc-100">Two small changes to each repo</h3>
      <p className="mb-4 mt-1 max-w-prose text-sm text-zinc-400">
        Coderhelm reads results from your workflow&apos;s uploaded files. If your tests already upload a JSON or JUnit report, you can skip this.
      </p>
      <SetupSteps />
    </section>
  );
}
