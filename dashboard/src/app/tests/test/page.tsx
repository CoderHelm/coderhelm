"use client";

import { useCan } from "@/hooks/use-can";
import { ANY_CHANGE } from "@/lib/capabilities";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, type TestCase, type TestHistoryRun } from "@/lib/api";
import {
  CAUSE_LABEL, FIX_LABEL, OUTCOME_LABEL, OUTCOME_TONE, STATE_HELP, STATE_LABEL, githubPrUrl, pct, plural, runHref, shortSha, testName,
} from "@/lib/tests";
import { errorMessage, formatDuration } from "@/lib/data-sources";
import { Time, formatDate } from "@/components/list/time";
import { ChevronRightIcon, ExternalLinkIcon } from "@/components/icons";
import { RoleGuard } from "@/components/role-guard";
import { StatusPill } from "@/components/status-pill";
import { Callout } from "@/components/callout";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { buttonClass, focusRing, linkButton, primaryButton, secondaryButton } from "@/components/ui";

function capitalize(s?: string): string | undefined {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
import { Page, PageHeader } from "@/components/page";
import {
  ArtifactLinks, AttemptSquares, EmptyBox, ErrorSummary, LoadError, Loading, SectionHeading, StatCard, StatePill, firstError,
} from "@/components/tests/common";
import { Switch } from "@/components/tests/settings";
import { useLoad } from "@/components/tests/use-load";

export default function TestDetailGuarded() {
  return (
    <RoleGuard need={ANY_CHANGE}>
      <Suspense fallback={<Page><Loading what="this test" /></Page>}>
        <TestDetail />
      </Suspense>
    </RoleGuard>
  );
}


function TestDetail() {
  const id = useSearchParams().get("id") || "";
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { can } = useCan();
  const isAdmin = can("tests");
  const [busy, setBusy] = useState("");
  const { data, setData, error, loading, reload } = useLoad(() => (id ? api.getTest(id) : Promise.resolve(null)), `test:${id}`);

  if (!id) return <Page><EmptyBox>No test was named. Go back to <Link href="/tests" className={linkButton}>Tests</Link>.</EmptyBox></Page>;
  if (error) return <Page><LoadError what="this test" message={error} onRetry={reload} /></Page>;
  if (loading && !data) return <Page><Loading what="this test" /></Page>;
  if (!data) return null;
  const { test, history, events } = data;

  const replace = (t: TestCase) => setData((prev) => (prev ? { ...prev, test: t } : prev));

  const quarantine = async (on: boolean) => {
    const ok = await confirm(
      on
        ? {
            title: "Quarantine this test?",
            message: "It keeps running and is still recorded, but its failures stop blocking pull requests until you release it.",
            confirmLabel: "Quarantine",
          }
        : {
            title: "Let this test fail builds again?",
            message: "It goes back to blocking pull requests when it fails. Do this once a fix has landed.",
            confirmLabel: "Release",
          },
    );
    if (ok !== "primary") return;
    setBusy("quarantine");
    try {
      const res = await api.quarantineTest(test.id, on);
      replace(res.test);
      toast(on ? "Quarantined" : "Released from quarantine");
    } catch (e) {
      toast(errorMessage(e, "That didn't work."), "error");
    } finally {
      setBusy("");
    }
  };

  const pin = async (never: boolean) => {
    setBusy("pin");
    try {
      const res = await api.pinTest(test.id, never);
      replace(res.test);
      toast(never ? "This test will never be quarantined" : "This test can be quarantined again");
    } catch (e) {
      toast(errorMessage(e, "That didn't work."), "error");
    } finally {
      setBusy("");
    }
  };

  const fix = async () => {
    const ok = await confirm({
      title: "Ask Coderhelm to fix this test?",
      message:
        "It reproduces the failure first, writes a fix, and opens a PR only after the test passes 20 runs in a row. It never skips the test or weakens a check to make it pass.",
      confirmLabel: "Fix it",
    });
    if (ok !== "primary") return;
    setBusy("fix");
    try {
      await api.fixTest(test.id);
      replace({ ...test, fix_status: "reproducing" });
      toast("Coderhelm is on it");
    } catch (e) {
      toast(errorMessage(e, "Couldn't start the fix."), "error");
    } finally {
      setBusy("");
    }
  };

  const quarantined = test.state === "quarantined" || test.flags.includes("quarantined");
  const fixRunning = test.fix_status && ["reproducing", "fixing", "burn_in"].includes(test.fix_status);

  return (
    <Page>
      <PageHeader
        detail
        title={testName(test)}
        status={
          <>
            <StatePill state={test.state} />
            {test.flags.filter((f) => f !== test.state).map((f) => (
              <StatusPill key={f}>{STATE_LABEL[f as keyof typeof STATE_LABEL] ?? f}</StatusPill>
            ))}
          </>
        }
        lead={STATE_HELP[test.state]}
      />
      <dl className="mt-4 grid max-w-3xl grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm" data-testid="test-facts">
        <dt className="text-zinc-400">File</dt>
        <dd className="min-w-0 text-zinc-200 [overflow-wrap:anywhere]">{test.file}</dd>
        <dt className="text-zinc-400">Repository</dt>
        <dd className="min-w-0 text-zinc-200 [overflow-wrap:anywhere]">
          {test.repo}
          {test.framework && <span className="text-zinc-400"> · {capitalize(test.framework)}</span>}
        </dd>
        {test.owner && (
          <>
            <dt className="text-zinc-400">Owner</dt>
            <dd className="min-w-0 text-zinc-200">{test.owner}</dd>
          </>
        )}
        {test.last_seen && (
          <>
            <dt className="text-zinc-400">Last run</dt>
            <dd className="text-zinc-200"><Time iso={test.last_seen} /></dd>
          </>
        )}
      </dl>

      <section aria-label="Numbers" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Fails (30 days)" value={pct(test.fail_rate_30d)} hint={plural(test.runs_30d, "run")} tone={test.state === "broken" ? "error" : undefined} />
        <StatCard label="Flaky (30 days)" value={pct(test.flake_rate_30d)} hint={`${plural(test.flips_14d, "flip")} in 14 days`} tone={test.state === "flaky" ? "warning" : undefined} />
        <StatCard label="PRs blocked (7 days)" value={test.prs_blocked_7d} hint={`${Math.round(test.minutes_lost_7d)} min of CI lost`} />
        <StatCard label="Duration" value={formatDuration(test.p50_ms)} hint={`Slow runs ${formatDuration(test.p95_ms)}`} />
      </section>

      {test.cause && (
        <div className="mt-6">
          <Callout variant="neutral" title={`Likely cause: ${CAUSE_LABEL[test.cause.label]}`} live={false}>
            <p className="whitespace-pre-wrap">{test.cause.evidence}</p>
          </Callout>
        </div>
      )}

      {(test.fix_status || test.ticket_url) && (
        <section aria-label="Fix" className="mt-6" data-testid="test-fix">
          <Callout
            variant={test.fix_status === "merged" ? "success" : test.fix_status === "failed" ? "error" : "info"}
            title={test.fix_status ? FIX_LABEL[test.fix_status] : "A ticket is open for this test"}
            live={false}
            actions={
              test.fix_pr_url || test.ticket_url ? (
                <>
                  {test.fix_pr_url && (
                    <a href={test.fix_pr_url} target="_blank" rel="noreferrer" className={`${buttonClass("secondary", "sm")} gap-1.5`}>
                      Open the fix PR
                      <ExternalLinkIcon />
                    </a>
                  )}
                  {test.ticket_url && (
                    <a href={test.ticket_url} target="_blank" rel="noreferrer" className={`${buttonClass("secondary", "sm")} gap-1.5`}>
                      Open the ticket
                      <ExternalLinkIcon />
                    </a>
                  )}
                </>
              ) : undefined
            }
          />
        </section>
      )}

      {isAdmin && (
        <section aria-labelledby="actions-heading" className="mt-6">
          <SectionHeading id="actions-heading">Actions</SectionHeading>
          <div className="flex flex-wrap items-center gap-3">
            {test.state === "flaky" && !fixRunning && (
              <button type="button" onClick={fix} disabled={busy !== ""} className={primaryButton}>
                {busy === "fix" ? "Starting…" : "Fix this test"}
              </button>
            )}
            {quarantined ? (
              <button type="button" onClick={() => quarantine(false)} disabled={busy !== ""} className={secondaryButton}>
                {busy === "quarantine" ? "Releasing…" : "Release from quarantine"}
              </button>
            ) : test.state !== "broken" && !test.never_quarantine ? (
              <button type="button" onClick={() => quarantine(true)} disabled={busy !== ""} className={secondaryButton}>
                {busy === "quarantine" ? "Quarantining…" : "Quarantine"}
              </button>
            ) : null}
            <label className="flex items-center gap-2.5 text-sm text-zinc-300">
              <Switch label="Never quarantine this test" checked={test.never_quarantine} onChange={pin} disabled={busy !== ""} />
              Never quarantine
            </label>
          </div>
          <p className="mt-2 max-w-prose text-sm text-zinc-400">
            A quarantined test keeps running and is still recorded, but its failures don&apos;t block pull requests.
          </p>
          {test.state === "broken" && (
            <p className="mt-2 max-w-prose text-sm text-zinc-400">
              Broken tests can&apos;t be quarantined: they fail because something is really wrong, and hiding that would let it ship.
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="history-heading" className="mt-8">
        <SectionHeading id="history-heading">History</SectionHeading>
        {history.length === 0 ? (
          <EmptyBox>No runs recorded yet.</EmptyBox>
        ) : (
          <>
            <HistoryStrip history={history} />
            <HistoryList history={history} repo={test.repo} />
          </>
        )}
      </section>

      <section aria-labelledby="events-heading" className="mt-8">
        <SectionHeading id="events-heading">What changed</SectionHeading>
        {events.length === 0 ? (
          <EmptyBox>No changes of state yet.</EmptyBox>
        ) : (
          <ol aria-label="State changes" className="space-y-2">
            {events.map((ev, i) => (
              <li key={`${ev.at}-${i}`} className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm">
                <p className="text-zinc-100">
                  Changed from {STATE_LABEL[ev.from]} to {STATE_LABEL[ev.to]}
                </p>
                <p className="mt-0.5 text-zinc-400">{ev.reason}</p>
                <p className="mt-1 text-xs text-zinc-400">
                  {ev.actor} · <Time iso={ev.at} />
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </Page>
  );
}

/** Up to the last 50 runs, oldest on the left, one square per run, so a pattern of flips shows at a glance. */
function HistoryStrip({ history }: { history: TestHistoryRun[] }) {
  const runs = [...history].reverse();
  const color: Record<TestHistoryRun["outcome"], string> = {
    passed: "bg-emerald-500/80",
    failed: "bg-red-500/80",
    flaky: "bg-amber-400/90",
    skipped: "bg-zinc-700",
  };
  const counts = runs.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.outcome]: (acc[r.outcome] ?? 0) + 1 }), {});
  const label = `Last ${runs.length} runs, oldest first: ${Object.entries(counts).map(([k, n]) => `${n} ${OUTCOME_LABEL[k as TestHistoryRun["outcome"]].toLowerCase()}`).join(", ")}`;
  return (
    <div>
      <div role="img" aria-label={label} className="flex flex-wrap gap-1">
        {runs.map((r) => (
          <span key={r.run_key} title={`${OUTCOME_LABEL[r.outcome]} · ${r.branch} · ${formatDate(r.at, { time: true })}`} className={`h-5 w-2.5 rounded-sm ${color[r.outcome]}`} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400" aria-hidden="true">
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/80" />Passed</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400/90" />Passed on retry</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-500/80" />Failed</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-zinc-700" />Skipped</li>
      </ul>
    </div>
  );
}

/** Ten runs at first; the rest one click away. */
function HistoryList({ history, repo }: { history: TestHistoryRun[]; repo: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? history : history.slice(0, 10);
  return (
    <>
      <ul aria-label="Recent runs of this test" className="mt-3 divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900/50">
        {shown.map((h) => (
          <HistoryRow key={h.run_key} run={h} repo={repo} />
        ))}
      </ul>
      {history.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} className={`mt-3 ${secondaryButton}`}>
          Show all {history.length} runs
        </button>
      )}
    </>
  );
}

/** One line per run; the error and its links open under it. */
function HistoryRow({ run, repo }: { run: TestHistoryRun; repo: string }) {
  const [open, setOpen] = useState(false);
  const err = firstError(run.attempts);
  const hasMore = !!err || run.attempts.some((a) => a.trace_url || a.video_url || a.screenshot_url);
  return (
    <li className="px-4 py-2.5 sm:px-5" data-testid="history-row">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400">
          <StatusPill tone={OUTCOME_TONE[run.outcome]}>{OUTCOME_LABEL[run.outcome]}</StatusPill>
          <AttemptSquares attempts={run.attempts} />
          <Link href={runHref(run.run_key)} className={`text-zinc-300 underline underline-offset-2 hover:text-zinc-100 rounded [overflow-wrap:anywhere] ${focusRing}`}>
            {run.branch}
          </Link>
          {run.pr ? (
            <a href={githubPrUrl(repo, run.pr)} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-zinc-200">PR #{run.pr}</a>
          ) : null}
          <span className="sr-only">commit {shortSha(run.sha)}</span>
          <Time iso={run.at} />
        </p>
        {hasMore && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className={`inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 ${focusRing}`}
          >
            {err ? "Error" : "Details"}
            <span aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}>
              <ChevronRightIcon />
            </span>
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 border-l border-zinc-800 pl-3">
          {err && <ErrorSummary message={err} />}
          <p className="mt-2 text-xs">
            <ArtifactLinks attempts={run.attempts} />
          </p>
        </div>
      )}
    </li>
  );
}
