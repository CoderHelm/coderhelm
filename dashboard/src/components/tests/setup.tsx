"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  api,
  type TestRepoSetup,
  type TestRunner,
  type TestSetupAsk,
  type TestSetupPr,
  type TestSetupPreview,
  type TestSetupStatus,
  type TestSetupStepState,
} from "@/lib/api";
import { errorMessage } from "@/lib/data-sources";
import { Callout } from "@/components/callout";
import { CodeBlock } from "@/components/code-block";
import { Disclosure } from "@/components/disclosure";
import { CheckIcon, ExternalLinkIcon } from "@/components/icons";
import { SetupChecklist, type SetupItem as Item } from "@/components/setup-checklist";
import { Modal, modalActions } from "@/components/modal";
import { Segmented } from "@/components/segmented";
import { Code } from "@/components/settings/code";
import { StatusPill } from "@/components/status-pill";
import { Time } from "@/components/list/time";
import { useToast } from "@/components/toast";
import { fullWidthOnPhone, linkButton, primaryButton, secondaryButton, smallSecondaryButton } from "@/components/ui";
import { LoadError, Loading } from "./common";

// The Tests setup view. Per repo: one clear action (a pull request Coderhelm
// opens), a short checklist of what is really in place, read from the
// workflow on the default branch and from the results that arrived, and the
// YAML for people who would rather add it themselves, collapsed.

const RUNNER_LABEL: Record<TestRunner, string> = {
  playwright: "Playwright",
  jest: "Jest",
  vitest: "Vitest",
  cypress: "Cypress",
  junit: "JUnit (other)",
};

const STATUS_LOOK: Record<TestSetupStatus, { label: string; tone: "neutral" | "success" | "warning" | "error" }> = {
  set_up: { label: "Set up", tone: "success" },
  waiting: { label: "Waiting for a run", tone: "neutral" },
  in_progress: { label: "Setup PR open", tone: "neutral" },
  nothing_received: { label: "Nothing received", tone: "error" },
  needs_setup: { label: "Not set up", tone: "neutral" },
  no_tests: { label: "No E2E tests", tone: "neutral" },
};

/** Repos that need something first, finished ones last. */
const ORDER: TestSetupStatus[] = ["nothing_received", "needs_setup", "in_progress", "waiting", "set_up", "no_tests"];

const OPENING = ["queued", "reading", "opening"];

function jobName(r: TestRepoSetup): string {
  return r.workflow?.job_name || r.workflow?.job_id || "E2E";
}

/** How often to read the state again: quickly while a PR is being opened, slowly while waiting on CI. */
function pollEvery(repos: TestRepoSetup[]): number | null {
  if (repos.some((r) => r.pr && OPENING.includes(r.pr.status))) return 3_000;
  if (repos.some((r) => r.pr?.status === "open" || r.status === "waiting" || r.status === "nothing_received")) return 30_000;
  return null;
}

export function CiSetup({ canEdit, repo }: { canEdit: boolean; repo?: string }) {
  const [repos, setRepos] = useState<TestRepoSetup[] | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setChecking(true);
      try {
        const r = await api.getTestSetup({ repo: repo || undefined, refresh });
        setRepos(r.repos);
        setError("");
        setCheckedAt(new Date().toISOString());
      } catch (e) {
        setError(errorMessage(e, "The request failed."));
      } finally {
        setChecking(false);
      }
    },
    [repo],
  );

  useEffect(() => {
    setRepos(null);
    load();
  }, [load]);

  // Keep the page current while something is moving, without a click.
  const every = repos ? pollEvery(repos) : null;
  useEffect(() => {
    if (!every) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, every);
    return () => window.clearInterval(id);
  }, [every, load]);

  const changed = (name: string, pr: TestSetupPr) =>
    setRepos((prev) => prev?.map((r) => (r.repo === name ? { ...r, pr, status: "in_progress" } : r)) ?? prev);

  if (error && !repos) return <LoadError what="the setup of your repositories" message={error} onRetry={() => load()} />;
  if (!repos) return <Loading what="the setup of your repositories" />;

  const sorted = [...repos].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.repo.localeCompare(b.repo));
  const withTests = sorted.filter((r) => r.status !== "no_tests");
  const noTests = sorted.filter((r) => r.status === "no_tests");
  const done = withTests.filter((r) => r.status === "set_up").length;

  return (
    <div className="space-y-4" data-testid="ci-setup">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-400" data-testid="ci-setup-summary">
          {withTests.length === 0
            ? "No repository runs E2E tests in a GitHub Actions workflow yet."
            : `${done} of ${withTests.length} ${withTests.length === 1 ? "repository sends" : "repositories send"} results.`}
          {checkedAt && (
            <span className="text-zinc-500">
              {" "}Checked <Time iso={checkedAt} />.
            </span>
          )}
        </p>
        <button type="button" onClick={() => load(true)} disabled={checking} className={smallSecondaryButton}>
          {checking ? "Checking…" : "Check again"}
        </button>
      </div>
      {error && <Callout variant="error">{error}</Callout>}
      {withTests.map((r) => (
        <RepoCard key={r.repo} r={r} canEdit={canEdit} onOpened={(pr) => changed(r.repo, pr)} />
      ))}
      {noTests.length > 0 && (
        <section aria-labelledby="ci-setup-none" className="rounded-xl border border-zinc-800 px-4 py-3">
          <h3 id="ci-setup-none" className="text-sm font-medium text-zinc-300">
            Nothing to do
          </h3>
          <p className="mt-0.5 text-sm text-zinc-500">No workflow in these repositories runs E2E tests.</p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-400">
            {noTests.map((r) => (
              <li key={r.repo} className="min-w-0 break-all" data-testid="ci-setup-no-tests">
                {r.repo}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ── one repo ──────────────────────────────────────────────────────────────

function RepoCard({ r, canEdit, onOpened }: { r: TestRepoSetup; canEdit: boolean; onOpened: (pr: TestSetupPr) => void }) {
  const headingId = useId();
  const look = STATUS_LOOK[r.status];
  const [ask, setAsk] = useState<TestSetupAsk | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const open = (a: TestSetupAsk, el: HTMLButtonElement | null) => {
    opener.current = el;
    setAsk(a);
  };
  return (
    <section
      aria-labelledby={headingId}
      data-testid="ci-setup-repo"
      data-status={r.status}
      className={`rounded-xl border bg-zinc-900/50 p-4 sm:p-5 ${r.status === "set_up" ? "border-emerald-500/30" : "border-zinc-800"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={headingId} className="break-all text-base font-semibold text-zinc-100">
            {r.repo}
          </h3>
          {r.workflow && (
            <p className="mt-0.5 text-sm text-zinc-500">
              <Code>{r.workflow.path}</Code>, job {jobName(r)}
              {r.runner ? ` (${RUNNER_LABEL[r.runner]})` : ""}
            </p>
          )}
        </div>
        <StatusPill tone={look.tone}>{look.label}</StatusPill>
      </div>
      {r.error && (
        <p className="mt-3 text-sm text-amber-200" role="status">
          {r.error}
        </p>
      )}
      <div className="mt-4">
        <Action r={r} canEdit={canEdit} onAsk={open} />
      </div>
      <Checklist r={r} manual={!(r.pr && r.pr.status !== "failed" && (OPENING.includes(r.pr.status) || r.pr.status === "open"))} />
      {ask && (
        <PreviewDialog
          ask={ask}
          returnFocus={opener}
          onClose={() => setAsk(null)}
          onOpened={(pr) => {
            setAsk(null);
            onOpened(pr);
          }}
        />
      )}
    </section>
  );
}

/** The one thing to do for a repo, or what is happening now. */
function Action({ r, canEdit, onAsk }: { r: TestRepoSetup; canEdit: boolean; onAsk: (a: TestSetupAsk, el: HTMLButtonElement | null) => void }) {
  const [quarantine, setQuarantine] = useState(r.can_auto.quarantine);
  const boxId = useId();
  const pr = r.pr;

  if (pr && OPENING.includes(pr.status)) return <PrProgress pr={pr} />;
  if (pr?.status === "open") return <PrOpen pr={pr} />;

  const failed = pr?.status === "failed" ? (
    <Callout variant="error" title="The setup PR couldn't be opened">
      <p>{pr.error || "Something went wrong. Try again."}</p>
    </Callout>
  ) : null;

  if (r.status === "set_up") {
    const addQuarantine = canEdit && r.can_auto.quarantine && r.steps.quarantine.state === "missing";
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3" data-testid="ci-setup-done">
          <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-emerald-950">
            <span className="scale-75"><CheckIcon /></span>
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-emerald-100">Set up</p>
            <p className="text-emerald-200/80">
              Results arrive from {jobName(r)}
              {r.results.last_at && (
                <>
                  : last upload <Time iso={r.results.last_at} />, {r.results.tests} tests read.
                </>
              )}
            </p>
          </div>
        </div>
        {addQuarantine && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button type="button" onClick={(e) => onAsk({ repo: r.repo, quarantine: true }, e.currentTarget)} className={smallSecondaryButton}>
              Add the quarantine step
            </button>
            <span className="text-sm text-zinc-500">Keeps quarantined tests from failing this build.</span>
          </div>
        )}
      </div>
    );
  }

  if (r.status === "nothing_received" && r.cause) {
    return (
      <div className="space-y-3" data-testid="ci-setup-nothing">
        {failed}
        <Callout variant="warning" title="Added, but nothing received">
          <p>
            The upload step is in the workflow, but the last {r.results.empty_runs} runs sent no results. {r.cause.text}
          </p>
          {r.cause.last_run_url && (
            <a href={r.cause.last_run_url} target="_blank" rel="noreferrer" className={linkButton}>
              Open the last run
            </a>
          )}
        </Callout>
        {r.cause.fixable && canEdit && (
          <button type="button" onClick={(e) => onAsk({ repo: r.repo, repair: true }, e.currentTarget)} className={`${primaryButton} ${fullWidthOnPhone}`}>
            Fix it with a PR
          </button>
        )}
      </div>
    );
  }

  if (r.status === "waiting") {
    return (
      <p className="text-sm text-zinc-300" role="status">
        The upload step is on <Code>{r.default_branch}</Code>. Waiting for the next run of {jobName(r)} to send results; this page checks by itself.
      </p>
    );
  }

  // Not set up.
  if (!r.can_auto.upload) {
    return (
      <div className="space-y-3">
        {failed}
        <p className="text-sm text-zinc-300">
          Coderhelm can&apos;t change this workflow by itself{r.can_auto.why ? `: ${r.can_auto.why}` : "."} Add the steps below by hand.
        </p>
      </div>
    );
  }
  if (!canEdit) {
    return <p className="text-sm text-zinc-300">Ask an admin on your team to create the setup PR.</p>;
  }
  return (
    <div className="space-y-3">
      {failed}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={(e) => onAsk({ repo: r.repo, quarantine: quarantine && r.can_auto.quarantine }, e.currentTarget)}
          className={`${primaryButton} ${fullWidthOnPhone}`}
        >
          {failed ? "Try again" : "Create setup PR"}
        </button>
        {r.can_auto.quarantine && (
          <label htmlFor={boxId} className="flex items-center gap-2 text-sm text-zinc-300">
            <input id={boxId} type="checkbox" checked={quarantine} onChange={(e) => setQuarantine(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
            Also skip quarantined tests in this build
          </label>
        )}
      </div>
      <p className="text-sm text-zinc-400">
        Adds an upload step to {jobName(r)} so every run sends its results, failed runs too. You see the exact change before anything is opened.
      </p>
    </div>
  );
}

const PROGRESS = [
  { id: "queued", label: "Queued" },
  { id: "reading", label: "Reading the workflow" },
  { id: "opening", label: "Opening the PR" },
];

function PrProgress({ pr }: { pr: TestSetupPr }) {
  const at = PROGRESS.findIndex((s) => s.id === pr.status);
  return (
    <div role="status" aria-live="polite" data-testid="ci-setup-progress" className="rounded-lg border border-zinc-800 px-4 py-3">
      <p className="text-sm font-medium text-zinc-100">Opening the setup PR…</p>
      <ol aria-label="Progress" className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {PROGRESS.map((s, i) => (
          <li key={s.id} className={`flex items-center gap-2 ${i < at ? "text-zinc-400" : i === at ? "font-medium text-zinc-100" : "text-zinc-500"}`}>
            {i < at ? (
              <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 text-emerald-950">
                <span className="scale-[0.6]"><CheckIcon /></span>
              </span>
            ) : i === at ? (
              <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-100 motion-reduce:animate-none" />
            ) : (
              <span aria-hidden="true" className="h-4 w-4 rounded-full border border-zinc-600" />
            )}
            {s.label}
            <span className="sr-only">{i < at ? " (done)" : i === at ? " (now)" : ""}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const CI_LOOK: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "error" }> = {
  pending: { label: "Checks running", tone: "warning" },
  success: { label: "Checks passed", tone: "success" },
  failure: { label: "Checks failed", tone: "error" },
  none: { label: "No checks yet", tone: "neutral" },
};

function PrOpen({ pr }: { pr: TestSetupPr }) {
  const ci = CI_LOOK[pr.ci ?? "none"] ?? CI_LOOK.none;
  return (
    <div data-testid="ci-setup-pr" className="space-y-2 rounded-lg border border-zinc-800 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {pr.url ? (
          <a href={pr.url} target="_blank" rel="noreferrer" className={`${linkButton} gap-1.5 font-medium`}>
            Setup PR{pr.number ? ` #${pr.number}` : ""}
            <ExternalLinkIcon />
          </a>
        ) : (
          <span className="text-sm font-medium text-zinc-100">Setup PR</span>
        )}
        <StatusPill tone={ci.tone}>{ci.label}</StatusPill>
      </div>
      <p className="text-sm text-zinc-400">
        {pr.ci === "failure"
          ? "A check failed on the setup PR. Open it to see which one."
          : "Review and merge it on GitHub. This page checks the workflow again once it merges."}
      </p>
    </div>
  );
}

// ── the preview ───────────────────────────────────────────────────────────

function PreviewDialog({
  ask,
  returnFocus,
  onClose,
  onOpened,
}: {
  ask: TestSetupAsk;
  returnFocus: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onOpened: (pr: TestSetupPr) => void;
}) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<TestSetupPreview | null>(null);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .previewTestSetup(ask)
      .then((p) => live && setPreview(p))
      .catch((e) => live && setProblem(errorMessage(e, "The change couldn't be prepared.")));
    return () => {
      live = false;
    };
  }, [ask]);

  const create = async () => {
    setBusy(true);
    setProblem("");
    try {
      const r = await api.openTestSetupPr(ask);
      toast("Opening the setup PR");
      onOpened(r.pr);
    } catch (e) {
      setProblem(errorMessage(e, "The PR couldn't be opened."));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      returnFocus={returnFocus}
      onOpenChange={(o) => !o && onClose()}
      title={ask.repair ? "Fix the results upload" : "Create setup PR"}
      description={ask.repo}
      footer={
        <div className={modalActions}>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
          <button type="button" onClick={create} disabled={!preview || busy} className={primaryButton}>
            {busy ? "Creating…" : "Create PR"}
          </button>
        </div>
      }
    >
      {!preview && !problem && <Loading what="the change" />}
      {problem && (
        <div className="mb-4">
          <Callout variant="error">{problem}</Callout>
        </div>
      )}
      {preview && (
        <div className="space-y-4" data-testid="ci-setup-preview">
          <div className="text-sm">
            <p className="font-medium text-zinc-100">{preview.title}</p>
            <p className="mt-0.5 text-zinc-500">
              From <Code>{preview.branch}</Code> into <Code>{preview.base}</Code>
            </p>
          </div>
          {preview.notes.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-300">
              {preview.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <CodeBlock code={preview.diff} lang="diff" filename={preview.path} label={`Change to ${preview.path}`} maxHeightClass="max-h-80" />
          <p className="text-sm text-zinc-500">Only these lines change. Comments, order and every other job stay as they are.</p>
        </div>
      )}
    </Modal>
  );
}

// ── the checklist ─────────────────────────────────────────────────────────

function Checklist({ r, manual }: { r: TestRepoSetup; manual: boolean }) {
  const [runner, setRunner] = useState<TestRunner>(r.runner ?? "playwright");
  const runnerSnips = r.snippets.by_runner?.[runner];
  const upload = runnerSnips?.upload ?? r.snippets.upload;
  const reporter = runnerSnips?.reporter ?? r.snippets.reporter;
  const runnerTabs = (
    <Segmented
      label="Test runner"
      value={runner}
      onChange={setRunner}
      options={(r.runners.length ? r.runners : (Object.keys(RUNNER_LABEL) as TestRunner[])).map((v) => ({ value: v, label: RUNNER_LABEL[v] }))}
    />
  );
  const where = r.workflow ? (
    <>
      in <Code>{r.workflow.path}</Code>, job <Code>{r.workflow.job_id}</Code>
    </>
  ) : (
    "in the workflow that runs your E2E tests"
  );

  const results = r.results;
  const resultsItem: Item = results.last_at
    ? {
        id: "results",
        label: "Results arriving",
        state: r.status === "nothing_received" ? "partial" : "done",
        detail: (
          <>
            Last upload <Time iso={results.last_at} />, {results.tests} tests read.{" "}
            {results.run_url && (
              <a href={results.run_url} target="_blank" rel="noreferrer" className={`${linkButton} !text-xs`}>
                Run
              </a>
            )}
          </>
        ),
      }
    : {
        id: "results",
        label: "Results arriving",
        state: results.empty_runs > 0 ? "partial" : "missing",
        detail:
          results.empty_runs > 0
            ? `No results in the last ${results.empty_runs} ${results.empty_runs === 1 ? "run" : "runs"}.`
            : "Nothing received yet. Results show here a few minutes after a run finishes.",
      };

  const items: Item[] = [
    {
      id: "upload",
      label: "Upload step",
      state: r.steps.upload.state,
      detail: r.steps.upload.detail,
      manual: (
        <>
          <p>
            Add it after the test step {where}. <Code>if: !cancelled()</Code> keeps failed runs, the ones that matter.
          </p>
          {runnerTabs}
          <CodeBlock code={upload} lang="yaml" title="GitHub Actions step" filename={r.workflow?.path} />
        </>
      ),
    },
    {
      id: "reporter",
      label: "Results file",
      state: r.steps.reporter.state,
      detail: r.steps.reporter.file ? (
        <>
          <Code>{r.steps.reporter.file}</Code>: {r.steps.reporter.detail}
        </>
      ) : (
        r.steps.reporter.detail
      ),
      manual: (
        <>
          <p>The runner writes a report Coderhelm reads: Playwright JSON or HTML, Cucumber JSON, or JUnit XML.</p>
          {runnerTabs}
          <CodeBlock code={reporter.code} lang="ts" filename={reporter.file} />
        </>
      ),
    },
    resultsItem,
  ];
  if (r.steps.quarantine.state !== "unsupported") {
    items.push({
      id: "quarantine",
      label: "Quarantine step",
      state: r.steps.quarantine.state === "done" && !r.quarantine_fetch ? "partial" : r.steps.quarantine.state,
      detail:
        r.steps.quarantine.state === "done" ? (
          r.quarantine_fetch ? (
            <>
              Working: the last run fetched the list <Time iso={r.quarantine_fetch.last_at} />.
            </>
          ) : (
            "In the workflow. No run has fetched the list yet."
          )
        ) : (
          r.steps.quarantine.detail
        ),
      manual: (
        <>
          <p>Add it before the test step {where}, and pass the list to the test command. If Coderhelm can&apos;t be reached, every test runs.</p>
          <CodeBlock code={r.snippets.quarantine} lang="yaml" title="GitHub Actions step" filename={r.workflow?.path} />
          <Disclosure summary="Notes">
            <p>Skipped tests aren&apos;t recorded from that run. To keep recording them, run them in a separate job with <Code>continue-on-error: true</Code>.</p>
            <p>Pull requests from forks can&apos;t ask GitHub for a token, so every test runs there.</p>
          </Disclosure>
        </>
      ),
    });
  } else {
    items.push({ id: "quarantine", label: "Quarantine step", state: "unsupported", detail: r.steps.quarantine.detail });
  }

  return <SetupChecklist label={`Setup of ${r.repo}`} items={manual ? items : items.map((it) => ({ ...it, manual: undefined }))} />;
}

/** A one-line pointer to the setup view, for the pages that used to hold the YAML. */
export function SetupPointer({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-zinc-400">
      {children}{" "}
      <Link href="/tests?view=setup" className={linkButton}>
        Open setup
      </Link>
    </p>
  );
}
