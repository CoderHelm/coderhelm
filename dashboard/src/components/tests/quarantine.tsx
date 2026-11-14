"use client";

import Link from "next/link";
import { useState } from "react";
import {
  api,
  type AutoFixBudget,
  type QuarantineAction,
  type QuarantineLink,
  type QuarantineProgress,
  type TestCase,
} from "@/lib/api";
import { plural, testName } from "@/lib/tests";
import { errorMessage } from "@/lib/data-sources";
import { useToast } from "@/components/toast";
import { useConfirm } from "@/components/confirm-dialog";
import { focusRing, linkButton, smallSecondaryButton } from "@/components/ui";
import { ExternalLinkIcon } from "@/components/icons";
import { ListSection, ListToolbar, useListParams } from "@/components/list";
import { EmptyBox, LoadError, Loading } from "./common";
import { SetupPointer } from "./setup";
import { TestList, quarantineFacts, testMatches } from "./test-list";
import { useLoad } from "./use-load";

// A quarantined test is never a dead end: its row says where it stands (the
// fix pull request, the run that is working, or nothing in flight), why
// Coderhelm has not fixed it by itself, and what can be done about it now.
// Servers from before this send no `quarantine` on a test; the row then
// shows what it always did (the fix link and Release).

/** Whether the server says this action can be taken on the test now. */
export function canDo(t: TestCase, action: QuarantineAction): boolean {
  return t.quarantine ? t.quarantine.actions.includes(action) : action === "release";
}

/** "Monday 16 November", in UTC like the week it counts. */
function resumesOn(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Monday";
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...o, timeZone: "UTC" }).format(d);
  return `${part({ weekday: "long" })} ${part({ day: "numeric" })} ${part({ month: "long" })}`;
}

/** The week's automatic fixes for one repository, in a sentence. */
export function budgetLine(b: AutoFixBudget, showRepo: boolean): string {
  const where = showRepo ? ` for ${b.repo}` : " for this repository";
  if (!b.on) return `Automatic fix pull requests are turned off${showRepo ? ` (${b.repo})` : ""}, so Coderhelm fixes a test only when someone asks.`;
  if (b.used >= b.cap) {
    return `Automatic fixes are at this week's limit of ${b.cap}${where}. They resume on ${resumesOn(b.resumes_at)}.`;
  }
  return `Coderhelm has started ${b.used} of this week's ${b.cap} automatic fixes${where}.`;
}

const CAP_REASON = "Each automatic fix is a full coding run, so the limit bounds what they cost. A fix you ask for is never counted.";

/** The weekly number of automatic fixes, why there is one, and where to change it. */
export function AutoFixNote({
  budgets,
  reason,
  canEdit,
}: {
  budgets: AutoFixBudget[];
  reason?: string;
  canEdit: boolean;
}) {
  if (budgets.length === 0) return null;
  const off = budgets.every((b) => !b.on);
  return (
    <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm" data-testid="auto-fix-note">
      <ul className="space-y-1 text-zinc-200">
        {budgets.map((b) => (
          <li key={b.repo} className="[overflow-wrap:anywhere]">{budgetLine(b, budgets.length > 1)}</li>
        ))}
      </ul>
      <p className="mt-1.5 text-zinc-400">
        {off ? "Tests are worked oldest in quarantine first once they are on." : `Tests are worked oldest in quarantine first. ${reason || CAP_REASON}`}{" "}
        {canEdit && (
          <Link href="/tests?view=settings#auto-fixes" className={linkButton}>
            {off ? "Turn them on in Settings" : "Change the weekly limit"}
          </Link>
        )}
      </p>
    </div>
  );
}

/** A link to the pull request (GitHub) or to the run (in the dashboard). */
export function StandingLink({ link }: { link: QuarantineLink }) {
  if (link.kind === "run") {
    return (
      <Link href={`/runs/detail?id=${encodeURIComponent(link.target)}`} className={linkButton}>
        {link.label}
      </Link>
    );
  }
  return (
    <a href={link.target} target="_blank" rel="noreferrer" className={`${linkButton} inline-flex items-center gap-1`}>
      {link.label}
      <ExternalLinkIcon />
    </a>
  );
}

/** Passes toward leaving quarantine by itself, as a bar and in words. */
export function ReleaseProgress({ progress }: { progress: QuarantineProgress }) {
  const now = Math.min(progress.passes, progress.needed);
  const pct = progress.needed > 0 ? Math.round((now / progress.needed) * 100) : 0;
  return (
    <div className="min-w-0" data-testid="release-progress">
      <div
        role="progressbar"
        aria-label="Passes toward leaving quarantine"
        aria-valuemin={0}
        aria-valuemax={progress.needed}
        aria-valuenow={now}
        aria-valuetext={progress.line}
        className="h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-zinc-800"
      >
        <div className="h-full rounded-full bg-emerald-500/80" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-zinc-300 [overflow-wrap:anywhere]">{progress.line}</p>
    </div>
  );
}

const STATE_DOT: Record<string, string> = {
  idle: "bg-zinc-500",
  fix_running: "bg-sky-400",
  fix_pr: "bg-sky-400",
  fix_merged: "bg-emerald-400",
  fix_failed: "bg-amber-400",
  removal_running: "bg-sky-400",
  removal_pr: "bg-sky-400",
};

/**
 * Where a quarantined test stands, under its row or on its page: the state
 * with its link, progress toward leaving by itself, an earlier attempt that
 * did not hold, and the one reason Coderhelm has not fixed it by itself.
 */
export function Standing({ test }: { test: TestCase }) {
  const q = test.quarantine;
  if (!q) return null;
  // Progress is the headline itself once a fix has merged; elsewhere it
  // shows as soon as there is a pass to count.
  const showProgress = q.state === "fix_merged" || q.progress.passes > 0;
  return (
    <div className="mt-2 min-w-0 space-y-1.5 text-sm" data-testid="standing" data-state={q.state}>
      <p className="flex min-w-0 items-start gap-2 text-zinc-100">
        <span aria-hidden="true" className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${STATE_DOT[q.state] ?? "bg-zinc-500"}`} />
        <span className="min-w-0 [overflow-wrap:anywhere]">
          {q.state === "fix_merged" ? "Fix merged, proving itself" : q.headline}
          {q.link && <span className="ml-2 inline-block"><StandingLink link={q.link} /></span>}
        </span>
      </p>
      {test.unstable && (
        <p className="text-xs text-amber-200 [overflow-wrap:anywhere]" data-testid="unstable">{test.unstable}</p>
      )}
      {showProgress && <ReleaseProgress progress={q.progress} />}
      {q.attempt && (
        <p className="text-xs text-zinc-300 [overflow-wrap:anywhere]" data-testid="last-attempt">
          {q.attempt}{" "}
          {q.attempt_link && <StandingLink link={q.attempt_link} />}
        </p>
      )}
      {q.why && (
        <p className="text-xs text-zinc-400 [overflow-wrap:anywhere]" data-testid="why-not-fixed">{q.why}</p>
      )}
    </div>
  );
}

const FIX_CONFIRM =
  "It starts a fix run now: it reproduces the failure first, writes a fix, and opens a PR only after the test passes 20 runs in a row. It never skips the test or weakens a check to make it pass. A fix you ask for is not counted against the weekly limit of automatic fixes.";
const REMOVE_CONFIRM =
  "Coderhelm opens a pull request that deletes this one test and what only it used, and says why removal is reasonable: how long it has been quarantined, its history, and what still covers the behaviour. Nothing is deleted until your team approves and merges it. Coderhelm never merges it.";

/** Up to four names, then how many more. */
function names(tests: TestCase[]): string {
  const shown = tests.slice(0, 4).map((t) => testName(t));
  const more = tests.length - shown.length;
  return more > 0 ? `${shown.join("; ")}; and ${more} more` : shown.join("; ");
}

/**
 * Asking Coderhelm to fix or remove tests, one or several, each after a
 * confirmation that says what will happen. `onChanged` gets each test as the
 * server returns it (or as it must now stand, from a server that returns
 * nothing).
 */
export function useQuarantineActions(onChanged: (t: TestCase) => void) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [busy, setBusy] = useState("");

  const run = async (kind: "fix" | "remove", tests: TestCase[]) => {
    const many = tests.length > 1;
    const ok = await confirm(
      kind === "fix"
        ? {
            title: many ? `Ask Coderhelm to fix ${tests.length} tests?` : "Ask Coderhelm to fix this test?",
            message: many
              ? `It starts ${tests.length} fix runs now, one per test: ${names(tests)}. Each opens its own pull request, which must pass 20 repeat runs. They are not counted against the weekly limit of automatic fixes.`
              : FIX_CONFIRM,
            confirmLabel: many ? `Fix ${tests.length} tests` : "Fix it",
          }
        : {
            title: many ? `Open ${tests.length} pull requests that each remove one test?` : "Open a pull request that removes this test?",
            message: many
              ? `One pull request per test: ${names(tests)}. Each deletes that one test and what only it used, and says why removal is reasonable. Nothing is deleted until your team approves and merges them. Coderhelm never merges them.`
              : REMOVE_CONFIRM,
            confirmLabel: many ? `Open ${tests.length} removal PRs` : "Open removal PR",
          },
    );
    if (ok !== "primary") return false;
    setBusy(many ? `bulk-${kind}` : `${kind}:${tests[0].id}`);
    let started = 0;
    let firstError = "";
    for (const t of tests) {
      try {
        const res = kind === "fix" ? await api.fixTest(t.id) : await api.removeTest(t.id);
        started += 1;
        onChanged(res.test ?? (kind === "fix" ? { ...t, fix_status: "reproducing" } : t));
      } catch (e) {
        firstError ||= errorMessage(e, kind === "fix" ? "Couldn't start the fix." : "Couldn't start the removal.");
      }
    }
    setBusy("");
    const what = kind === "fix" ? "fix" : "removal";
    if (started === tests.length) {
      toast(many ? `Coderhelm started ${started} ${what}${kind === "fix" ? "es" : "s"}` : kind === "fix" ? "Coderhelm is on it" : "Coderhelm is writing the removal PR");
    } else {
      toast(
        many
          ? `Started ${started} of ${tests.length}. ${tests.length - started} couldn't start: ${firstError}`
          : firstError,
        "error",
      );
    }
    return started > 0;
  };

  return { busy, fix: (tests: TestCase[]) => run("fix", tests), remove: (tests: TestCase[]) => run("remove", tests) };
}

export function QuarantineView({ repo, canEdit, ticketDays = 2 }: { repo: string; canEdit: boolean; ticketDays?: number }) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { data, setData, error, loading, reload } = useLoad(
    () => api.listTests({ repo, state: "quarantined", limit: 200 }),
    `quarantine:${repo}`,
  );
  const [releasing, setReleasing] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const replace = (t: TestCase) =>
    setData((prev) => (prev ? { ...prev, tests: prev.tests.map((x) => (x.id === t.id ? t : x)) } : prev));
  const actions = useQuarantineActions(replace);

  const release = async (t: TestCase) => {
    const ok = await confirm({
      title: "Let this test fail builds again?",
      message: t.quarantine
        ? `It goes back to blocking pull requests when it fails. Left alone, it leaves quarantine by itself once it has proven healthy (${t.quarantine.progress.line}).`
        : "It goes back to blocking pull requests when it fails. Do this once a fix has landed.",
      confirmLabel: "Release",
    });
    if (ok !== "primary") return;
    setReleasing(t.id);
    try {
      await api.quarantineTest(t.id, false);
      setData((prev) => (prev ? { ...prev, tests: prev.tests.filter((x) => x.id !== t.id) } : prev));
      toast("Released from quarantine");
    } catch (e) {
      toast(errorMessage(e, "Couldn't release it."), "error");
    } finally {
      setReleasing("");
    }
  };

  const [params, setParams] = useListParams({ q: "" });
  const q = params.q.trim();
  const clear = () => setParams({ q: "" });
  const tests = data?.tests ?? [];
  const shown = tests.filter((t) => testMatches(t, q));
  const old = tests.filter((t) => t.quarantined_since && Date.now() - new Date(t.quarantined_since).getTime() > ticketDays * 86_400_000);
  // Only rows something can be asked of can be picked.
  const pickable = (t: TestCase) => canEdit && (canDo(t, "fix") || canDo(t, "remove"));
  const chosen = tests.filter((t) => picked.has(t.id) && pickable(t));
  const toFix = chosen.filter((t) => canDo(t, "fix"));
  const toRemove = chosen.filter((t) => canDo(t, "remove"));
  const anyPickable = shown.some(pickable);
  const allPicked = anyPickable && shown.filter(pickable).every((t) => picked.has(t.id));
  const pick = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const pickAll = (on: boolean) => setPicked(on ? new Set(shown.filter(pickable).map((t) => t.id)) : new Set());
  const bulk = async (kind: "fix" | "remove") => {
    const started = await (kind === "fix" ? actions.fix(toFix) : actions.remove(toRemove));
    if (started) setPicked(new Set());
  };

  return (
    <ListSection
      id="quarantine"
      title="Quarantine"
      count={tests.length || undefined}
      description={
        <>
          Quarantined tests still run and are still recorded. When only quarantined tests fail, Coderhelm treats the run as passing. A test
          leaves quarantine by itself once it passes 20 runs in a row on more than one pull request or branch. When tickets are on, the
          owner gets one after {plural(ticketDays, "day")} without a fix.
        </>
      }
    >
      <div className="mb-4 mt-3">
        <SetupPointer>GitHub still fails the build on a quarantined test until the workflow skips it. Setup adds that step for you.</SetupPointer>
      </div>
      {error ? (
        <LoadError what="the quarantine list" message={error} onRetry={reload} />
      ) : loading && !data ? (
        <Loading what="the quarantine list" />
      ) : tests.length === 0 ? (
        <EmptyBox>No test is quarantined.</EmptyBox>
      ) : (
        <>
          <AutoFixNote budgets={data?.auto_fixes ?? []} reason={data?.auto_fixes_reason} canEdit={canEdit} />
          {tests.length > 3 && (
            <ListToolbar
              className="mb-3"
              search={{
                value: params.q,
                onChange: (v) => setParams({ q: v }, { replace: true }),
                placeholder: "Search by test name, file or owner",
                label: "Search tests",
              }}
              onClear={q ? clear : undefined}
            />
          )}
          {old.length > 0 && (
            <p className="mb-3 text-sm text-amber-200">{plural(old.length, "test has", "tests have")} been quarantined for over {plural(ticketDays, "day")}.</p>
          )}
          {anyPickable && (
            <div
              className="mb-3 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-sm"
              data-testid="quarantine-bulk"
            >
              <label className="flex cursor-pointer items-center gap-2.5 text-zinc-300">
                <input
                  type="checkbox"
                  checked={allPicked}
                  onChange={(e) => pickAll(e.target.checked)}
                  className={`h-4 w-4 cursor-pointer accent-zinc-100 ${focusRing}`}
                />
                {chosen.length > 0 ? `${plural(chosen.length, "test")} selected` : "Select all"}
              </label>
              {chosen.length > 0 && (
                <span className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => bulk("fix")} disabled={toFix.length === 0 || actions.busy !== ""} className={smallSecondaryButton}>
                    {actions.busy === "bulk-fix" ? "Starting…" : `Fix selected (${toFix.length})`}
                  </button>
                  <button type="button" onClick={() => bulk("remove")} disabled={toRemove.length === 0 || actions.busy !== ""} className={smallSecondaryButton}>
                    {actions.busy === "bulk-remove" ? "Starting…" : `Remove selected (${toRemove.length})`}
                  </button>
                  <button type="button" onClick={() => setPicked(new Set())} className={linkButton}>Clear</button>
                </span>
              )}
            </div>
          )}
          {shown.length === 0 && (
            <EmptyBox>No test matches. <button type="button" onClick={clear} className={linkButton}>Clear filters</button></EmptyBox>
          )}
          {shown.length > 0 && (
            <TestList
              label="Quarantined tests"
              tests={shown}
              facts={quarantineFacts}
              select={(t) =>
                pickable(t)
                  ? { checked: picked.has(t.id), onChange: (on) => pick(t.id, on), label: `Select ${testName(t)}` }
                  : undefined
              }
              below={(t) => <Standing test={t} />}
              actions={(t) => (
                <>
                  {t.ticket_url && <a href={t.ticket_url} target="_blank" rel="noreferrer" className={linkButton}>Ticket</a>}
                  {/* The row's own link says more where the server sends one. */}
                  {!t.quarantine && t.fix_pr_url && <a href={t.fix_pr_url} target="_blank" rel="noreferrer" className={linkButton}>Fix PR</a>}
                  {canEdit && canDo(t, "fix") && (
                    <button type="button" onClick={() => actions.fix([t])} disabled={actions.busy !== ""} className={smallSecondaryButton}>
                      {actions.busy === `fix:${t.id}` ? "Starting…" : "Fix this test"}
                    </button>
                  )}
                  {canEdit && canDo(t, "remove") && (
                    <button type="button" onClick={() => actions.remove([t])} disabled={actions.busy !== ""} className={smallSecondaryButton}>
                      {actions.busy === `remove:${t.id}` ? "Starting…" : "Remove this test"}
                    </button>
                  )}
                  {canEdit && (
                    <button type="button" onClick={() => release(t)} disabled={releasing === t.id} className={smallSecondaryButton}>
                      {releasing === t.id ? "Releasing…" : "Release from quarantine"}
                    </button>
                  )}
                </>
              )}
            />
          )}
        </>
      )}
    </ListSection>
  );
}
