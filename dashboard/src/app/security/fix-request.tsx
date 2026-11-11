"use client";

// Asking for fix pull requests by hand, from a finding's page or from the
// selected rows of the list: first what it would open (one PR per package
// version, and today's fix runs against the limit), then the confirmation,
// then what started, what waits for a daily limit and what was skipped.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Callout } from "@/components/callout";
import { linkButton, primaryButton, secondaryButton } from "@/components/ui";
import { securityApi, type FixPlan, type FixResult } from "@/lib/security";

export function FixRequest({ ids, onCancel, onDone }: { ids: string[]; onCancel: () => void; onDone?: (r: FixResult) => void }) {
  const [plan, setPlan] = useState<FixPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [raise, setRaise] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<FixResult | null>(null);
  const key = ids.join(",");

  useEffect(() => {
    let live = true;
    setPlan(null);
    setError(null);
    setResult(null);
    securityApi.fixPlan(key.split(",")).then(
      (p) => live && setPlan(p),
      (e) => live && setError(e instanceof Error ? e.message : "The request failed."),
    );
    return () => {
      live = false;
    };
  }, [key]);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const r = await securityApi.fix(ids, raise);
      setResult(r);
      onDone?.(r);
    } catch (e) {
      setError(e instanceof Error && /\b403\b/.test(e.message) ? "Only admins can open fix PRs." : "Could not open the fix PRs. Try again.");
    }
    setSending(false);
  };

  if (result) return <FixResults r={result} onClose={onCancel} />;
  if (error && !plan) {
    return (
      <Callout variant="warning" title="We couldn't work out the fix PRs" testId="fix-request">
        <p>{error}</p>
      </Callout>
    );
  }
  if (!plan) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400" data-testid="fix-request" aria-busy="true">
        Working out the fix PRs…
      </div>
    );
  }
  const n = plan.units.length;
  const left = Math.max(0, plan.runs_limit - plan.runs_today);
  const over = Math.max(0, n - left);
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-sm shadow-xl" data-testid="fix-request">
      <p className="font-medium text-zinc-100">
        {n === 0 ? "Nothing to open" : `Opens ${n} fix PR${n === 1 ? "" : "s"}`}
      </p>
      {n > 0 && (
        <ul className="mt-2 space-y-1 text-zinc-300" data-testid="fix-units">
          {plan.units.map((u) => (
            <li key={`${u.repo}|${u.unit}`} className="[overflow-wrap:anywhere]">
              <span className="font-mono">
                {u.package} {u.from} to {u.to}
              </span>
              <span className="text-zinc-500">
                {" "}
                · {u.finding_ids.length} advisor{u.finding_ids.length === 1 ? "y" : "ies"} · {u.repo.split("/").pop()}
              </span>
            </li>
          ))}
        </ul>
      )}
      {plan.skipped.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-zinc-400" data-testid="fix-skipped">
          {plan.skipped.map((s) => (
            <li key={s.finding_id}>
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
      )}
      {n > 0 && (
        <p className={`mt-3 ${over > 0 ? "text-amber-300" : "text-zinc-400"}`} data-testid="fix-budget">
          Uses {Math.min(n, left)} of today&apos;s {plan.runs_limit} fix runs ({plan.runs_today} used so far).
          {over > 0 && ` ${over} wait${over === 1 ? "s" : ""} for tomorrow unless you raise today's limit.`} Runs start now even while you preview.
        </p>
      )}
      {n > 0 && over > 0 && (
        <label className="mt-2 flex items-start gap-2 text-zinc-300">
          <input type="checkbox" className="mt-1" checked={raise} onChange={(e) => setRaise(e.target.checked)} data-testid="raise-limit" />
          <span>Raise today&apos;s limit for this request. It is recorded in the audit log.</span>
        </label>
      )}
      {error && <p className="mt-2 text-red-300">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {n > 0 && (
          <button type="button" className={primaryButton} onClick={send} disabled={sending} data-testid="fix-confirm">
            {sending ? "Opening…" : `Open ${n} fix PR${n === 1 ? "" : "s"}`}
          </button>
        )}
        <button type="button" className={secondaryButton} onClick={onCancel} disabled={sending}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function FixResults({ r, onClose }: { r: FixResult; onClose: () => void }) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-sm shadow-xl" data-testid="fix-results" role="status">
      <p className="font-medium text-zinc-100">
        {r.started.length} started{r.queued.length ? `, ${r.queued.length} waiting` : ""}
        {r.skipped.length ? `, ${r.skipped.length} skipped` : ""}
      </p>
      <ul className="mt-2 space-y-1">
        {r.started.map((s) => (
          <li key={s.ticket} className="text-zinc-300 [overflow-wrap:anywhere]" data-testid="fix-started">
            <span className="font-mono">{s.package}</span> in {s.repo.split("/").pop()}: started.{" "}
            <Link href={s.run_id ? `/runs/detail?id=${encodeURIComponent(s.run_id)}` : s.runs_url} className={`${linkButton} !text-xs`}>
              See the run
            </Link>
          </li>
        ))}
        {r.queued.map((q) => (
          <li key={q.ticket} className="text-amber-300 [overflow-wrap:anywhere]" data-testid="fix-queued">
            <span className="font-mono">{q.package}</span> in {q.repo.split("/").pop()}: {q.reason}
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
