"use client";

// Asking for fix pull requests by hand, from a finding's page or from the
// selected rows of the list. The review opens in the side panel the other
// detail views use, with the list still beside it: one section per pull
// request (its title, branch, labels and when it starts), its package bumps
// grouped by tier with their advisories and verdict (each one can be taken
// out, and put back), what is left out and why, and the cost against today's
// limits. Cancel and the button that opens the PRs stay in view at the
// bottom. Then the progress, then what started, what waits and what was
// skipped, in the same panel.

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Drawer } from "@/components/drawer";
import { Chip } from "@/components/list";
import { focusRing, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { AlertCircleIcon, CheckIcon, ChevronRightIcon } from "@/components/icons";
import {
  VERDICT_LOOK,
  repoName,
  securityApi,
  shortTokens,
  type Combine,
  type FixAsk,
  type FixPlan,
  type FixResult,
  type FixSelect,
  type PlanBump,
  type PlanUnit,
  type Tier,
  type Verdict,
} from "@/lib/security";
import { TierPill, VerdictPill } from "./parts";

/** How long the undo for a removed package stays up. */
const UNDO_MS = 8000;

export function FixRequest({
  ids,
  select,
  combine = "policy",
  names: known = {},
  onCancel,
  onDone,
  onRemove,
  onRestore,
}: {
  ids: string[];
  /** Instead of `ids`: every fix the list's filters match; the server resolves the set. */
  select?: FixSelect;
  /** How the picked fixes combine: one PR per repo, one per package, or as the policy says. */
  combine?: Combine;
  /** Finding id to package name, for the rows left out. */
  names?: Record<string, string>;
  /** The panel closed: cancelled, or done after the results. */
  onCancel: () => void;
  onDone?: (r: FixResult) => void;
  /** A bump was taken out of the request: its findings. */
  onRemove?: (ids: string[]) => void;
  /** A removed bump was put back (Undo): its findings. */
  onRestore?: (ids: string[]) => void;
}) {
  const [removed, setRemoved] = useState<string[]>([]);
  const [plan, setPlan] = useState<FixPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [raise, setRaise] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<FixResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [undo, setUndo] = useState<{ ids: string[]; label: string } | null>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  const live = ids.filter((id) => !removed.includes(id));
  const ask: FixAsk = select ? { select: { ...select, except_ids: [...select.except_ids, ...removed] } } : { finding_ids: live };
  const key = JSON.stringify([combine, ask]);
  const names = { ...known, ...(plan?.names ?? {}) };

  useEffect(() => {
    let on = true;
    setError(null);
    setResult(null);
    const [how, asked] = JSON.parse(key) as [Combine, FixAsk];
    if ("finding_ids" in asked && asked.finding_ids.length === 0) {
      setPlan({ units: [], skipped: [], runs_today: 0, runs_limit: 0 });
      return;
    }
    securityApi.fixPlan(asked, how).then(
      (p) => on && setPlan(p),
      (e) => on && setError(e instanceof Error ? e.message : "The request failed."),
    );
    return () => {
      on = false;
    };
  }, [key, attempt]);

  // The undo goes after a while; while it is up, focus waits on it (the row
  // whose button had focus is gone).
  useEffect(() => {
    if (!undo) return;
    undoButton.current?.focus();
    const t = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo]);

  const send = async () => {
    setSending(true);
    setError(null);
    setUndo(null);
    try {
      const r = await securityApi.fix(ask, raise, combine);
      setResult(r);
      onDone?.(r);
    } catch (e) {
      setError(e instanceof Error && /\b403\b/.test(e.message) ? "Only admins can open fix PRs." : "Could not start the fixes. Try again.");
    }
    setSending(false);
  };

  const remove = (b: PlanBump) => {
    setRemoved((r) => [...r, ...b.finding_ids]);
    setUndo({ ids: b.finding_ids, label: b.package });
    onRemove?.(b.finding_ids);
  };
  const restore = () => {
    if (!undo) return;
    const back = undo.ids;
    setRemoved((r) => r.filter((id) => !back.includes(id)));
    setUndo(null);
    onRestore?.(back);
  };

  // Closing: never while the runs are starting. The panel closes first, so
  // focus goes back to the button that opened it, then the caller hears.
  const [shown, setShown] = useState(true);
  const [opener] = useState(() => ({ current: typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null) }));
  const dismiss = () => {
    if (!sending) setShown(false);
  };
  const close = (open: boolean) => {
    if (!open) dismiss();
  };
  useEffect(() => {
    if (!shown) onCancel();
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps

  if (result) {
    return (
      <Drawer
        open={shown}
        onOpenChange={close}
        returnFocusTo={opener}
        title={resultTitle(result)}
        description={`Fix runs used today: ${result.runs_today} of ${result.runs_limit}.`}
        testId="fix-request"
        footer={
          <div className="flex justify-end">
            <button type="button" className={primaryButton} onClick={dismiss}>
              Done
            </button>
          </div>
        }
      >
        <FixResults r={result} plan={plan} />
      </Drawer>
    );
  }

  if (!plan) {
    return (
      <Drawer
        open={shown}
        onOpenChange={close}
        returnFocusTo={opener}
        title="Fix pull requests"
        testId="fix-request"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className={secondaryButton} onClick={dismiss}>
              {error ? "Close" : "Cancel"}
            </button>
            {error && (
              <button type="button" className={primaryButton} onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </button>
            )}
          </div>
        }
      >
        {error ? (
          <InlineAlert title="We couldn't work out the fix PRs" testId="fix-error">
            {error}
          </InlineAlert>
        ) : (
          <PlanSkeleton />
        )}
      </Drawer>
    );
  }

  const units = plan.units;
  const runs = units.length;
  const joined = units.filter((u) => u.joins);
  const newPrs = plan.pr_count ?? runs - joined.length;
  const left = Math.max(0, plan.runs_limit - plan.runs_today);
  // The server says which units wait and why; older servers: from the counts.
  const waiting = units.filter((u) => u.starts_now === false);
  const over = plan.waiting !== undefined ? waiting.filter((u) => /tomorrow/.test(u.waits ?? "")).length : Math.max(0, runs - left);
  const startingNow = plan.starting_now ?? Math.min(runs, left);
  const repoWaits = waiting.filter((u) => !/tomorrow/.test(u.waits ?? "")).length;
  const majors = units.flatMap((u) => bumpsOf(u).filter((b) => b.major));
  const advisories = units.reduce((n, u) => n + (u.advisories ?? u.finding_ids.length), 0);
  const noFix = plan.skipped.filter((s) => /no fixed version/.test(s.reason));
  const inPr = plan.skipped.filter((s) => s.pr_url);
  const otherSkips = plan.skipped.filter((s) => !noFix.includes(s) && !inPr.includes(s));
  const tokensLimit = plan.tokens_limit ?? 0;
  const tokensToday = plan.tokens_today ?? 0;
  const estimate = plan.estimated_tokens ?? 0;
  const tokensOver = tokensLimit > 0 && tokensToday + estimate > tokensLimit;
  const repos = [...new Set(units.map((u) => u.repo))];
  const unitKey = (u: PlanUnit) => `${u.repo}|${u.unit}`;
  // One pull request opens expanded; several start collapsed, so the panel reads as a list of PRs.
  const isOpen = (u: PlanUnit) => expanded[unitKey(u)] ?? runs === 1;
  const allOpen = units.every(isOpen);
  const setAll = (on: boolean) => setExpanded(Object.fromEntries(units.map((u) => [unitKey(u), on])));
  const confirm =
    runs === 0
      ? ""
      : runs === 1 && units[0].joins
        ? `Add to PR #${units[0].joins.number}`
        : combine === "one_pr" && newPrs === 1 && runs === 1
          ? "Fix in one PR"
          : joined.length > 0
            ? `Start ${runs} fix${runs === 1 ? "" : "es"}`
            : `Open ${runs} fix PR${runs === 1 ? "" : "s"}`;
  const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
  const title =
    runs === 0
      ? "Nothing to open"
      : [
          newPrs > 0 ? `Open ${newPrs === 1 ? "a fix pull request" : `${newPrs} fix pull requests`}` : "",
          joined.length > 0 ? `${newPrs > 0 ? "add" : "Add"} to ${joined.map((u) => `PR #${u.joins?.number}`).join(" and ")}` : "",
        ]
          .filter(Boolean)
          .join(", ");
  const summary =
    runs === 0
      ? undefined
      : [
          repos.length === 1 ? repoName(repos[0]) : `${repos.length} repos, one PR each`,
          plural(advisories, "advisory", "advisories"),
          majors.length > 0 ? plural(majors.length, "major upgrade") : "",
        ]
          .filter(Boolean)
          .join(" · ");

  const footer = (
    <div className="space-y-3">
      {undo && (
        <div
          role="status"
          className="flex min-w-0 items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 shadow-lg"
          data-testid="fix-undo"
        >
          <span aria-hidden="true" className="shrink-0 text-emerald-400">
            <CheckIcon />
          </span>
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            Removed <span className="font-mono">{undo.label}</span> from the request.
          </span>
          <button
            ref={undoButton}
            type="button"
            onClick={restore}
            className={`-my-1 shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-zinc-100 underline underline-offset-4 hover:bg-zinc-700 ${focusRing}`}
            data-testid="fix-undo-button"
          >
            Undo
          </button>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {sending ? (
          <div className="flex min-w-0 items-center gap-2 text-sm text-zinc-300" role="status" data-testid="fix-progress">
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200 motion-reduce:animate-none"
            />
            Starting {runs === 1 ? "the fix run" : `${runs} fix runs`}…
          </div>
        ) : runs > 0 ? (
          <p className={`min-w-0 text-xs ${over > 0 || tokensOver ? "text-amber-300" : "text-zinc-400"}`} data-testid="fix-limit-line">
            Uses {startingNow} of the {plural(left, "fix run")} left today
            {over > 0 && (raise ? " · the limit is raised for this request" : ` · ${over} wait${over === 1 ? "s" : ""} for tomorrow`)}
          </p>
        ) : (
          <span />
        )}
        <div className="flex shrink-0 justify-end gap-2">
          <button type="button" className={secondaryButton} onClick={dismiss} disabled={sending} data-testid="fix-cancel">
            Cancel
          </button>
          {runs > 0 && (
            <button type="button" className={primaryButton} onClick={send} disabled={sending} data-testid="fix-confirm">
              {sending ? "Starting…" : confirm}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <Drawer
      open={shown}
      onOpenChange={close}
      returnFocusTo={opener}
      title={<span data-testid="fix-heading">{title}</span>}
      description={summary && <span data-testid="fix-summary">{summary}</span>}
      testId="fix-request"
      footer={footer}
    >
      <div className="space-y-5 text-sm">
        {runs === 0 && (
          <p className="text-zinc-400" data-testid="fix-empty">
            Nothing selected can get a pull request now. The notes below say why.
          </p>
        )}
        {runs > 0 && (
          <section aria-label="Pull requests">
            {runs > 1 && (
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">{plural(runs, "pull request")}</h3>
                <button type="button" className={`${linkButton} !text-xs`} onClick={() => setAll(!allOpen)} data-testid="fix-expand-all">
                  {allOpen ? "Collapse all" : "Expand all"}
                </button>
              </div>
            )}
            <ul className="space-y-2" data-testid="fix-units">
              {units.map((u) => (
                <UnitSection
                  key={unitKey(u)}
                  u={u}
                  open={isOpen(u)}
                  onToggle={() => setExpanded((e) => ({ ...e, [unitKey(u)]: !isOpen(u) }))}
                  onRemove={remove}
                  disabled={sending}
                />
              ))}
            </ul>
          </section>
        )}
        {plan.selection?.note && (
          <Note tone="amber" testId="fix-selection-note">
            {plan.selection.note}
          </Note>
        )}
        {(majors.length > 0 || joined.length > 0 || noFix.length > 0 || inPr.length > 0 || otherSkips.length > 0) && (
          <section aria-label="Notes" className="space-y-2" data-testid="fix-warnings">
            {majors.length > 0 && (
              <Note tone="amber" testId="warn-major">
                {majors.length === 1
                  ? `${majors[0].package} moves to a new major version`
                  : `${majors.length} packages move to a new major version (${listSome(majors.map((b) => b.package))})`}
                . It may need code changes; Coderhelm fixes CI in the same PR, and moves a major upgrade to its own PR only if CI can&apos;t pass with it.
              </Note>
            )}
            {joined.map((u) => (
              <Note key={u.unit} tone="sky" testId="warn-join">
                Added to{" "}
                <a href={u.joins?.url} target="_blank" rel="noreferrer" className={`${linkButton} !text-sm`}>
                  PR #{u.joins?.number}
                </a>
                , the open security PR for {repoName(u.repo)}, instead of a second one.
              </Note>
            ))}
            {noFix.length > 0 && (
              <Note tone="zinc" testId="warn-nofix">
                Left out: {noFix.length} with no fixed version yet ({listSome(noFix.map((s) => names[s.finding_id] ?? s.finding_id))}). They get a PR once a
                fixed version is published.
              </Note>
            )}
            {inPr.map((s) => (
              <Note key={s.finding_id} tone="zinc" testId="warn-in-pr">
                {names[s.finding_id] ?? s.finding_id} is already in{" "}
                <a href={s.pr_url} target="_blank" rel="noreferrer" className={`${linkButton} !text-sm`}>
                  PR #{prNumber(s.pr_url)}
                </a>
                .
              </Note>
            ))}
            {otherSkips.length > 0 && (
              <Note tone="zinc" testId="fix-skipped">
                Left out: {otherSkips.map((s) => `${names[s.finding_id] ?? s.finding_id} (${s.reason})`).join(", ")}.
              </Note>
            )}
          </section>
        )}
        {runs > 0 && (
          <section aria-labelledby="fix-limits-heading" className="rounded-lg border border-zinc-800 px-3 py-3">
            <h3 id="fix-limits-heading" className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Today&apos;s limits
            </h3>
            <p className={`mt-1.5 ${over > 0 || tokensOver ? "text-amber-300" : "text-zinc-300"}`} data-testid="fix-budget">
              Uses {startingNow} of today&apos;s {plan.runs_limit} fix runs ({plan.runs_today} used so far)
              {tokensLimit > 0 && ` · estimated ${shortTokens(estimate)} of ${shortTokens(tokensLimit)} tokens (${shortTokens(tokensToday)} used today)`}.
              {over > 0 && ` ${over} wait${over === 1 ? "s" : ""} for tomorrow unless you raise today's limit.`}
              {repoWaits > 0 && ` ${repoWaits} wait${repoWaits === 1 ? "s" : ""} for a fix run already working in ${repoWaits === 1 ? "its repo" : "their repos"}.`}
              {tokensOver && " It may pass today's token limit; a run past it waits for tomorrow."} Runs start now, even in preview mode.
            </p>
            {over > 0 && (
              <label className="mt-2 flex items-start gap-2 text-zinc-200">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-zinc-200"
                  checked={raise}
                  onChange={(e) => setRaise(e.target.checked)}
                  data-testid="raise-limit"
                />
                <span>Raise today&apos;s limit for this request. It is recorded in the audit log.</span>
              </label>
            )}
          </section>
        )}
        {error && (
          <InlineAlert title="The fixes didn't start" testId="fix-error">
            {error}
          </InlineAlert>
        )}
      </div>
    </Drawer>
  );
}

function resultTitle(r: FixResult): string {
  return `${r.started.length} started${r.queued.length ? `, ${r.queued.length} waiting` : ""}${r.skipped.length ? `, ${r.skipped.length} skipped` : ""}`;
}

/** The first few names, then how many more. */
function listSome(names: string[], n = 4): string {
  return names.length <= n ? names.join(", ") : `${names.slice(0, n).join(", ")} and ${names.length - n} more`;
}

function PlanSkeleton() {
  return (
    <div aria-busy="true" className="space-y-3" data-testid="fix-loading">
      <p className="text-sm text-zinc-400">Working out the pull requests…</p>
      {[0, 1].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-lg border border-zinc-800 bg-zinc-800/30 motion-reduce:animate-none" />
      ))}
    </div>
  );
}

/** An error in the review, in the flow of the panel: never laid over anything. */
function InlineAlert({ title, testId, children }: { title: string; testId: string; children: React.ReactNode }) {
  return (
    <div role="alert" className="flex min-w-0 gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm" data-testid={testId}>
      <span aria-hidden="true" className="mt-0.5 shrink-0 text-red-300">
        <AlertCircleIcon />
      </span>
      <div className="min-w-0">
        <p className="font-medium text-red-100">{title}</p>
        <p className="mt-0.5 text-zinc-200 [overflow-wrap:anywhere]">{children}</p>
      </div>
    </div>
  );
}

const NOTE_TONE = {
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-100",
  zinc: "border-zinc-700 bg-zinc-800/50 text-zinc-300",
} as const;

function Note({ tone, testId, children }: { tone: keyof typeof NOTE_TONE; testId: string; children: React.ReactNode }) {
  return (
    <p className={`rounded-md border px-3 py-2 text-sm [overflow-wrap:anywhere] ${NOTE_TONE[tone]}`} data-testid={testId}>
      {children}
    </p>
  );
}

function prNumber(url?: string): string {
  return url?.match(/\/pull\/(\d+)/)?.[1] ?? "";
}

/** A unit's bumps; older servers send only the first package. */
function bumpsOf(u: PlanUnit): PlanBump[] {
  return (
    u.bumps ?? [
      {
        package: u.package,
        from: u.from,
        to: u.to,
        major: false,
        manifest: "",
        verdict: "unknown",
        tier: u.tier ?? null,
        finding_ids: u.finding_ids,
        advisories: [],
      },
    ]
  );
}

const TIER_ORDER: (Tier | null)[] = ["P0", "P1", "P2", "P3", null];
// Most urgent first: reachable, still being checked, unknown, then the settled safe ones.
const VERDICT_ORDER: Verdict[] = ["reachable", "pending", "unknown", "not_reachable", "not_loaded"];

/** Each advisory id once, in the order given. */
export function uniqueAdvisories(ids: string[]): string[] {
  const seen = new Set<string>();
  return ids.filter((id) => {
    const k = id.toUpperCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The bumps by tier, most urgent first; inside a tier, by verdict, majors first, then by name. */
function byTier(bumps: PlanBump[]): { tier: Tier | null; bumps: PlanBump[] }[] {
  const rank = (b: PlanBump) => VERDICT_ORDER.indexOf(b.verdict);
  return TIER_ORDER.map((tier) => ({
    tier,
    bumps: bumps
      .filter((b) => (b.tier ?? null) === tier)
      .sort((a, b) => rank(a) - rank(b) || Number(b.major) - Number(a.major) || a.package.localeCompare(b.package)),
  })).filter((g) => g.bumps.length > 0);
}

const VERDICT_WORDS: Record<Verdict, string> = {
  reachable: "reachable",
  pending: "still being checked",
  unknown: "unknown",
  not_reachable: "not reachable",
  not_loaded: "not loaded",
};

/** What the bumps' verdicts add up to, worst first: "1 unknown, 39 not reachable". */
function reachabilityWords(bumps: PlanBump[]): string {
  const counts = VERDICT_ORDER.map((v) => [v, bumps.filter((b) => b.verdict === v).length] as const).filter(([, n]) => n > 0);
  if (counts.length === 1) return bumps.length === 1 ? VERDICT_LOOK[counts[0][0]].label : `All ${VERDICT_WORDS[counts[0][0]]}`;
  return counts.map(([v, n]) => `${n} ${VERDICT_WORDS[v]}`).join(", ");
}

const WHEN_TONE = { now: "success", tomorrow: "waiting", repo: "queued" } as const;

function UnitSection({
  u,
  open,
  onToggle,
  onRemove,
  disabled,
}: {
  u: PlanUnit;
  open: boolean;
  onToggle: () => void;
  onRemove: (b: PlanBump) => void;
  disabled: boolean;
}) {
  const bodyId = useId();
  const bumps = bumpsOf(u);
  const advisories = u.advisories ?? u.finding_ids.length;
  const majors = u.majors ?? bumps.filter((b) => b.major).length;
  const when = u.starts_now === undefined ? null : u.starts_now ? "now" : /tomorrow/.test(u.waits ?? "") ? "tomorrow" : "repo";
  const whenWords = when === "now" ? "Starts now" : when === "tomorrow" ? "Waits for tomorrow's limit" : "Waits for the repo's run";
  const facts = [
    u.joins ? `Adds to PR #${u.joins.number}` : "New pull request",
    `${bumps.length} package${bumps.length === 1 ? "" : "s"}`,
    `${advisories} advisor${advisories === 1 ? "y" : "ies"}`,
    majors > 0 ? `${majors} major` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950/40" data-testid="fix-unit" data-repo={u.repo} data-open={open}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className={`flex w-full min-w-0 items-start gap-2.5 rounded-lg px-3 py-2.5 text-left hover:bg-zinc-800/40 ${focusRing}`}
        data-testid="fix-unit-toggle"
      >
        <span aria-hidden="true" className={`mt-0.5 shrink-0 text-zinc-400 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}>
          <ChevronRightIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 font-medium text-zinc-100 [overflow-wrap:anywhere]" data-testid="fix-repo">
              {repoName(u.repo)}
            </span>
            {when && (
              <span className="ml-auto" title={u.waits ?? undefined} data-testid="fix-when">
                <Chip tone={WHEN_TONE[when]}>{whenWords}</Chip>
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-xs text-zinc-400" data-testid="fix-unit-facts">
            {facts}
          </span>
        </span>
      </button>
      {open && (
        <div id={bodyId} className="border-t border-zinc-800">
          <div className="space-y-2 px-3 py-3">
            {u.waits && (
              <p className="text-xs text-amber-200/90 [overflow-wrap:anywhere]" data-testid="fix-waits">
                {u.waits}
              </p>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium leading-snug text-zinc-100 [overflow-wrap:anywhere]" data-testid="fix-title">
                {u.title}
              </p>
              {u.branch && (
                <p className="mt-0.5 text-xs text-zinc-400 [overflow-wrap:anywhere]">
                  Branch <span className="font-mono text-zinc-300" data-testid="fix-branch">{u.branch}</span>
                </p>
              )}
            </div>
            {(u.labels?.length ?? 0) > 0 && (
              <ul className="flex min-w-0 flex-wrap gap-1" aria-label="Labels">
                {u.labels?.map((l) => (
                  <li key={l} className="rounded-full border border-zinc-700 bg-zinc-800/40 px-1.5 py-px text-xs text-zinc-300" data-testid="fix-label">
                    {l}
                  </li>
                ))}
              </ul>
            )}
            {bumps.length > 0 && (
              <p className="text-xs text-zinc-400" data-testid="fix-reachability">
                Reachability: {reachabilityWords(bumps)}
              </p>
            )}
          </div>
          {byTier(bumps).map((g) => (
            <div key={g.tier ?? "none"} className="border-t border-zinc-800/80" data-testid="fix-tier" data-tier={g.tier ?? ""}>
              <p className="flex items-center gap-2 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-400">
                {g.tier ? <TierPill tier={g.tier} /> : <span className="font-medium text-zinc-300">No tier</span>}
                <span data-testid="fix-tier-count">
                  {g.bumps.length} package{g.bumps.length === 1 ? "" : "s"}
                </span>
              </p>
              <ul className="divide-y divide-zinc-800/80" data-testid="fix-bumps">
                {g.bumps.map((b) => (
                  <BumpRow key={b.package} b={b} onRemove={onRemove} disabled={disabled} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

function BumpRow({ b, onRemove, disabled }: { b: PlanBump; onRemove: (b: PlanBump) => void; disabled: boolean }) {
  const ids = uniqueAdvisories(b.advisories);
  const n = ids.length || b.finding_ids.length;
  const shown = ids.slice(0, 3);
  return (
    <li className="flex min-w-0 items-start gap-3 px-3 py-2.5" data-testid="fix-bump" data-package={b.package}>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-zinc-100">
          <span className="font-mono font-medium [overflow-wrap:anywhere]">{b.package}</span>
          <span className="text-zinc-400">
            {b.from} to {b.to}
          </span>
          {b.major && (
            <span data-testid="fix-major" title="A new major version: it may need code changes, which Coderhelm makes in the same PR.">
              <Chip tone="attention">Major</Chip>
            </span>
          )}
        </p>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <VerdictPill verdict={b.verdict} />
          <span className="min-w-0 text-xs text-zinc-400 [overflow-wrap:anywhere]" data-testid="fix-advisories" title={ids.join(", ")}>
            {n} advisor{n === 1 ? "y" : "ies"}
            {shown.length > 0 && `: ${shown.join(", ")}`}
            {ids.length > shown.length && ` +${ids.length - shown.length}`}
          </span>
        </div>
      </div>
      <button
        type="button"
        className={`-mr-1 inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40 ${focusRing}`}
        onClick={() => onRemove(b)}
        disabled={disabled}
        aria-label={`Remove ${b.package} from this request`}
        data-testid="fix-remove"
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
        Remove
      </button>
    </li>
  );
}

function FixResults({ r, plan }: { r: FixResult; plan: FixPlan | null }) {
  const joinUrl = (s: FixResult["started"][number]) => plan?.units.find((u) => u.unit === s.unit)?.joins?.url;
  return (
    <div className="text-sm" data-testid="fix-results" role="status">
      <p className="sr-only">{resultTitle(r)}</p>
      <ul className="space-y-2">
        {r.started.map((s) => (
          <li
            key={s.ticket}
            className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-zinc-200 [overflow-wrap:anywhere]"
            data-testid="fix-started"
          >
            <span className="font-mono">{s.package}</span> in {repoName(s.repo)}:{" "}
            {s.joins ? (
              <>
                added to{" "}
                <a href={joinUrl(s) ?? "#"} target="_blank" rel="noreferrer" className={`${linkButton} !text-sm`}>
                  PR #{s.joins}
                </a>
                .
              </>
            ) : (
              "started. The PR shows on each fix once the run opens it."
            )}{" "}
            <Link href={s.run_id ? `/runs/detail?id=${encodeURIComponent(s.run_id)}` : s.runs_url} className={`${linkButton} !text-sm`}>
              See the run
            </Link>
          </li>
        ))}
        {r.queued.map((q) => (
          <li key={q.ticket} className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-amber-200 [overflow-wrap:anywhere]" data-testid="fix-queued">
            <span className="font-mono">{q.package}</span> in {repoName(q.repo)}: {q.reason}
          </li>
        ))}
        {r.skipped.map((s) => (
          <li key={s.finding_id} className="px-1 text-zinc-400" data-testid="fix-skip">
            Skipped: {s.reason}
            {s.pr_url && (
              <>
                {" "}
                <a href={s.pr_url} target="_blank" rel="noreferrer" className={`${linkButton} !text-xs`}>
                  see the PR
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
