"use client";

// Asking for fix pull requests by hand, from a finding's page or from the
// selected rows of the list. First the review, inside the page: each pull
// request's title, branch and labels, every package bump with its
// advisories and verdict (each one can be taken out), what is left out and
// why, the open PR fixes are added to, and the cost against today's limits.
// Then the progress, then what started, what waits and what was skipped.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Callout } from "@/components/callout";
import { focusRing, linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { VERDICT_LOOK, repoName, securityApi, shortTokens, type Combine, type FixPlan, type FixResult, type PlanUnit } from "@/lib/security";
import { TierPill } from "./parts";

export function FixRequest({
  ids,
  combine = "policy",
  names = {},
  onCancel,
  onDone,
  onRemove,
}: {
  ids: string[];
  /** How the picked fixes combine: one PR per repo, one per package, or as the policy says. */
  combine?: Combine;
  /** Finding id to package name, for the rows left out. */
  names?: Record<string, string>;
  onCancel: () => void;
  onDone?: (r: FixResult) => void;
  /** A bump was taken out of the request: its findings. */
  onRemove?: (ids: string[]) => void;
}) {
  const [removed, setRemoved] = useState<string[]>([]);
  const [plan, setPlan] = useState<FixPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [raise, setRaise] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<FixResult | null>(null);
  const live = ids.filter((id) => !removed.includes(id));
  const key = `${combine}|${live.join(",")}`;
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let on = true;
    setError(null);
    setResult(null);
    const asked = key.split("|")[1];
    if (!asked) {
      setPlan({ units: [], skipped: [], runs_today: 0, runs_limit: 0 });
      return;
    }
    securityApi.fixPlan(asked.split(","), combine).then(
      (p) => on && setPlan(p),
      (e) => on && setError(e instanceof Error ? e.message : "The request failed."),
    );
    return () => {
      on = false;
    };
  }, [key, combine]);

  // Esc backs out, unless the runs are starting.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending) {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [sending, onCancel]);

  useEffect(() => {
    if (plan) heading.current?.focus();
  }, [plan === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const r = await securityApi.fix(live, raise, combine);
      setResult(r);
      onDone?.(r);
    } catch (e) {
      setError(e instanceof Error && /\b403\b/.test(e.message) ? "Only admins can open fix PRs." : "Could not start the fixes. Try again.");
    }
    setSending(false);
  };

  const remove = (gone: string[]) => {
    setRemoved((r) => [...r, ...gone]);
    onRemove?.(gone);
  };

  if (result) return <FixResults r={result} plan={plan} onClose={onCancel} />;
  if (error && !plan) {
    return (
      <Callout variant="warning" title="We couldn't work out the fix PRs" testId="fix-request">
        <p>{error}</p>
        <button type="button" className={`${secondaryButton} mt-3`} onClick={onCancel}>
          Close
        </button>
      </Callout>
    );
  }
  if (!plan) {
    return (
      <Panel>
        <div className="p-4 text-sm text-zinc-400" aria-busy="true">
          Working out the pull requests…
        </div>
      </Panel>
    );
  }

  const units = plan.units;
  const runs = units.length;
  const joined = units.filter((u) => u.joins);
  const newPrs = plan.pr_count ?? runs - joined.length;
  const left = Math.max(0, plan.runs_limit - plan.runs_today);
  const over = Math.max(0, runs - left);
  const majors = units.flatMap((u) => (u.bumps ?? []).filter((b) => b.major));
  const advisories = units.reduce((n, u) => n + (u.advisories ?? u.finding_ids.length), 0);
  const noFix = plan.skipped.filter((s) => /no fixed version/.test(s.reason));
  const inPr = plan.skipped.filter((s) => s.pr_url);
  const otherSkips = plan.skipped.filter((s) => !noFix.includes(s) && !inPr.includes(s));
  const tokensLimit = plan.tokens_limit ?? 0;
  const tokensToday = plan.tokens_today ?? 0;
  const estimate = plan.estimated_tokens ?? 0;
  const tokensOver = tokensLimit > 0 && tokensToday + estimate > tokensLimit;
  const repos = [...new Set(units.map((u) => u.repo))];
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

  return (
    <Panel>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4">
        <h2 ref={heading} tabIndex={-1} className="text-base font-semibold text-zinc-100 outline-none" data-testid="fix-heading">
          {runs === 0
            ? "Nothing to open"
            : `${newPrs > 0 ? `${newPrs} pull request${newPrs === 1 ? "" : "s"}` : ""}${newPrs > 0 && joined.length > 0 ? ", " : ""}${joined.length > 0 ? `added to ${joined.map((u) => `PR #${u.joins?.number}`).join(" and ")}` : ""}`}
        </h2>
        {runs > 0 && (
          <p className="mt-0.5 text-sm text-zinc-400" data-testid="fix-summary">
            {repos.length === 1 ? repoName(repos[0]) : `${repos.length} repos, one PR each`} · {advisories} advisor{advisories === 1 ? "y" : "ies"}
            {majors.length > 0 && ` · ${majors.length} major upgrade${majors.length === 1 ? "" : "s"}`}
          </p>
        )}
        {runs > 0 && (
          <ul className="mt-3 space-y-3" data-testid="fix-units">
            {units.map((u) => (
              <UnitCard key={`${u.repo}|${u.unit}`} u={u} onRemove={remove} disabled={sending} />
            ))}
          </ul>
        )}
        <div className="mt-3 space-y-2 text-sm" data-testid="fix-warnings">
          {majors.length > 0 && (
            <Note tone="amber" testId="warn-major">
              {majors.length === 1
                ? `${majors[0].package} moves to a new major version`
                : `${majors.length} packages move to a new major version (${majors.map((b) => b.package).join(", ")})`}
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
              Left out: {noFix.length} with no fixed version yet ({noFix.map((s) => names[s.finding_id] ?? s.finding_id).join(", ")}). They get a PR once a
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
        </div>
        {runs > 0 && (
          <p className={`mt-3 text-sm ${over > 0 || tokensOver ? "text-amber-300" : "text-zinc-300"}`} data-testid="fix-budget">
            Uses {Math.min(runs, left)} of today&apos;s {plan.runs_limit} fix runs ({plan.runs_today} used so far)
            {tokensLimit > 0 && ` · estimated ${shortTokens(estimate)} of ${shortTokens(tokensLimit)} tokens (${shortTokens(tokensToday)} used today)`}.
            {over > 0 && ` ${over} wait${over === 1 ? "s" : ""} for tomorrow unless you raise today's limit.`}
            {tokensOver && " It may pass today's token limit; a run past it waits for tomorrow."} Runs start now, even in preview mode.
          </p>
        )}
        {runs > 0 && over > 0 && (
          <label className="mt-2 flex items-start gap-2 text-sm text-zinc-200">
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
        {error && (
          <p className="mt-2 text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 bg-zinc-900 px-4 py-3">
        {sending && (
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-zinc-300" role="status" data-testid="fix-progress">
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200 motion-reduce:animate-none"
            />
            Starting {runs === 1 ? "the fix run" : `${runs} fix runs`}…
          </div>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className={secondaryButton} onClick={onCancel} disabled={sending}>
            Cancel
          </button>
          {runs > 0 && (
            <button type="button" className={primaryButton} onClick={send} disabled={sending} data-testid="fix-confirm">
              {sending ? "Starting…" : confirm}
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex max-h-[min(80dvh,46rem)] min-w-0 flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 text-sm shadow-2xl"
      data-testid="fix-request"
      role="region"
      aria-label="Review the fix pull requests"
    >
      {children}
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
    <p className={`rounded-md border px-3 py-2 [overflow-wrap:anywhere] ${NOTE_TONE[tone]}`} data-testid={testId}>
      {children}
    </p>
  );
}

function prNumber(url?: string): string {
  return url?.match(/\/pull\/(\d+)/)?.[1] ?? "";
}

function UnitCard({ u, onRemove, disabled }: { u: PlanUnit; onRemove: (ids: string[]) => void; disabled: boolean }) {
  const bumps = u.bumps ?? [
    {
      package: u.package,
      from: u.from,
      to: u.to,
      major: false,
      manifest: "",
      verdict: "unknown" as const,
      tier: u.tier ?? null,
      finding_ids: u.finding_ids,
      advisories: [],
    },
  ];
  return (
    <li className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950/40" data-testid="fix-unit" data-repo={u.repo}>
      <div className="space-y-1 border-b border-zinc-800 px-3 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${u.joins ? "bg-sky-500/15 text-sky-200" : "bg-emerald-500/15 text-emerald-200"}`}>
            {u.joins ? `Adds to PR #${u.joins.number}` : "New pull request"}
          </span>
          <span className="text-xs text-zinc-400">{repoName(u.repo)}</span>
        </div>
        <p className="font-mono text-[13px] text-zinc-100 [overflow-wrap:anywhere]" data-testid="fix-title">
          {u.title}
        </p>
        {(u.branch || (u.labels?.length ?? 0) > 0) && (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-zinc-400">
            {u.branch && (
              <span className="font-mono [overflow-wrap:anywhere]" data-testid="fix-branch">
                {u.branch}
              </span>
            )}
            {u.labels?.map((l) => (
              <span key={l} className="rounded-full border border-zinc-700 px-1.5 py-px text-xs text-zinc-300" data-testid="fix-label">
                {l}
              </span>
            ))}
          </div>
        )}
      </div>
      <ul className="divide-y divide-zinc-800/80" data-testid="fix-bumps">
        {bumps.map((b) => {
          const look = VERDICT_LOOK[b.verdict] ?? VERDICT_LOOK.unknown;
          const n = b.advisories.length || b.finding_ids.length;
          return (
            <li key={b.package} className="flex min-w-0 items-start gap-2 px-3 py-2" data-testid="fix-bump" data-package={b.package}>
              {b.tier && <TierPill tier={b.tier} provisional={b.verdict === "pending"} />}
              <div className="min-w-0 flex-1">
                <p className="text-zinc-100 [overflow-wrap:anywhere]">
                  <span className="font-mono">{b.package}</span>{" "}
                  <span className="text-zinc-400">
                    {b.from} to {b.to}
                  </span>
                  {b.major && <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-px text-xs font-medium text-amber-200">major</span>}
                </p>
                <p className="mt-0.5 text-xs text-zinc-400 [overflow-wrap:anywhere]">
                  {n} advisor{n === 1 ? "y" : "ies"}
                  {b.advisories.length > 0 &&
                    `: ${b.advisories.slice(0, 3).join(", ")}${b.advisories.length > 3 ? `, +${b.advisories.length - 3}` : ""}`} ·{" "}
                  <span title={look.hover}>{look.label}</span>
                </p>
              </div>
              <button
                type="button"
                className={`-mr-1 shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40 ${focusRing}`}
                onClick={() => onRemove(b.finding_ids)}
                disabled={disabled}
                aria-label={`Remove ${b.package} from this request`}
                title="Remove from this request"
                data-testid="fix-remove"
              >
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

function FixResults({ r, plan, onClose }: { r: FixResult; plan: FixPlan | null; onClose: () => void }) {
  const joinUrl = (s: FixResult["started"][number]) => plan?.units.find((u) => u.unit === s.unit)?.joins?.url;
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-sm shadow-2xl" data-testid="fix-results" role="status">
      <p className="text-base font-semibold text-zinc-100">
        {r.started.length} started{r.queued.length ? `, ${r.queued.length} waiting` : ""}
        {r.skipped.length ? `, ${r.skipped.length} skipped` : ""}
      </p>
      <ul className="mt-2 space-y-2">
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
          <li key={q.ticket} className="text-amber-300 [overflow-wrap:anywhere]" data-testid="fix-queued">
            <span className="font-mono">{q.package}</span> in {repoName(q.repo)}: {q.reason}
          </li>
        ))}
        {r.skipped.map((s) => (
          <li key={s.finding_id} className="text-zinc-400" data-testid="fix-skip">
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
      <p className="mt-2 text-xs text-zinc-400">
        Fix runs used today: {r.runs_today} of {r.runs_limit}.
      </p>
      <button type="button" className={`${secondaryButton} mt-3`} onClick={onClose}>
        Done
      </button>
    </div>
  );
}
