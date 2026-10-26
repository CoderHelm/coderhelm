"use client";

import { ANY_CHANGE } from "@/lib/capabilities";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError, type GateAction, type GateControlResult, type GateDetail } from "@/lib/api";
import { RoleGuard } from "@/components/role-guard";
import { Callout } from "@/components/callout";
import { Skeleton } from "@/components/skeleton";
import { StatusText, Time } from "@/components/list";
import { primaryButton, secondaryButton } from "@/components/ui";
import { ExternalLinkIcon } from "@/components/icons";
import { Problem } from "@/components/problem";
import { Page, PageHeader, cardClass } from "@/components/page";
import { statusLook, stopperName } from "../status";
import { GATE_ACTION_LABEL } from "../gate-control";

// One PR's auto-merge: what it waits on, who stopped it, every stop and
// re-arm, and one button to stop or re-arm it. The PR's status comment links
// here (`?repo=…&pr=…&do=stop|rearm`): the link carries no secret and changes
// nothing until a signed-in team member confirms.

export default function GatePageGuarded() {
  return (
    <RoleGuard need={ANY_CHANGE}>
      <Suspense fallback={<GateSkeleton />}>
        <GatePage />
      </Suspense>
    </RoleGuard>
  );
}

function GateSkeleton() {
  return (
    <Page>
      <div className="space-y-3" aria-busy="true" aria-label="Loading auto-merge">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-32 w-full" />
      </div>
    </Page>
  );
}

const MARKS: Record<string, { glyph: string; cls: string; sr: string }> = {
  done: { glyph: "✓", cls: "text-emerald-400", sr: "Done:" },
  waiting: { glyph: "○", cls: "text-amber-400", sr: "Waiting:" },
  blocked: { glyph: "✕", cls: "text-red-400", sr: "Blocked:" },
};

/** Gate states that are over: nothing to stop or re-arm. */
const FINISHED = new Set(["merged", "closed"]);

type LoadState = "loading" | "ready" | "missing" | "error";

function via(v: string): string {
  return v === "comment" ? "from a PR comment" : v === "dashboard" ? "in Coderhelm" : "";
}

function GatePage() {
  const params = useSearchParams();
  const repo = params.get("repo") || "";
  const pr = Number(params.get("pr") || 0);
  const asked = params.get("do");
  const valid = /^[\w.-]+\/[\w.-]+$/.test(repo) && Number.isInteger(pr) && pr > 0;
  const [gate, setGate] = useState<GateDetail | null>(null);
  const [state, setState] = useState<LoadState>(valid ? "loading" : "missing");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GateControlResult | null>(null);
  const [failed, setFailed] = useState("");

  const load = useCallback(() => {
    if (!valid) return;
    api
      .getGate(repo, pr)
      .then((g) => {
        setGate(g);
        setState("ready");
      })
      .catch((e: unknown) => {
        const code = e instanceof ApiError ? e.status : 0;
        setState(code === 400 || code === 404 ? "missing" : "error");
      });
  }, [repo, pr, valid]);

  useEffect(() => {
    load();
  }, [load]);

  if (state === "loading") return <GateSkeleton />;
  if (state === "missing" || !gate) {
    return (
      <Page className="space-y-4">
        <Callout variant={state === "error" ? "error" : "warning"} title={state === "error" ? "Could not load auto-merge" : "Pull request not found"}>
          <p>
            {state === "error"
              ? "Check your connection and try again."
              : "This link does not point to a pull request in a repo your team set up in Coderhelm."}
          </p>
          {state === "error" ? (
            <button type="button" onClick={() => { setState("loading"); load(); }} className={`mt-2 ${secondaryButton}`}>
              Try again
            </button>
          ) : (
            <Link href="/reviewer" className={`mt-2 ${secondaryButton}`}>See the Reviewer</Link>
          )}
        </Callout>
      </Page>
    );
  }

  const g = gate.gate;
  const gateState = g?.state ?? "";
  const stopped = gateState === "stopped" || !!g?.stopped;
  const finished = FINISHED.has(gateState);
  // What the button does now: what the link asked for when it still applies,
  // otherwise what the gate's state allows.
  const action: GateAction | null =
    !gate.auto_merge || finished || gate.can_control === false
      ? null
      : stopped
        ? "rearm"
        : "stop";
  const askedOther = asked === "stop" || asked === "rearm" ? asked !== action && !result : false;
  const look = statusLook(gate.status || (stopped ? "stopped" : ""));
  const checklist = g?.checklist ?? [];
  const controls = g?.controls ?? [];
  const prUrl = `https://github.com/${gate.repo}/pull/${gate.pr_number}`;

  const confirm = async () => {
    if (!action || busy) return;
    setBusy(true);
    setFailed("");
    try {
      const res = await api.controlGate(gate.repo, gate.pr_number, action);
      setResult(res);
      load();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page className="space-y-6">
      <PageHeader
        detail
        crumb={`${gate.repo.split("/").pop()} #${gate.pr_number}`}
        title={gate.pr_title || `${gate.repo} #${gate.pr_number}`}
        eyebrow="Pull request"
        // A stopped gate says so once, in the callout below.
        status={!stopped && (gateState || gate.status) ? <StatusText look={look} /> : undefined}
        lead={<span className="[overflow-wrap:anywhere]">{gate.repo} #{gate.pr_number}</span>}
        actions={
          <a href={prUrl} target="_blank" rel="noreferrer" className={`${secondaryButton} gap-1.5`}>
            Open on GitHub
            <span aria-hidden="true" className="inline-flex"><ExternalLinkIcon /></span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        }
      />

      {!gate.auto_merge && (
        <Callout variant="neutral" title="Auto-merge is off for this repo">
          <p>There is nothing to stop or re-arm. Turn it on in the repo&apos;s Reviewer settings.</p>
        </Callout>
      )}

      {stopped && g?.stopped && (
        <div data-testid="gate-stopped">
        <Callout variant="warning" title="Auto-merge is stopped" live={false}>
          <p>
            Stopped by {stopperName(g.stopped)} {via(g.stopped.via)} <Time iso={g.stopped.at} />. It won&apos;t merge until
            someone re-arms it, and a new commit doesn&apos;t re-arm it.
          </p>
        </Callout>
        </div>
      )}

      {(action || result || failed) && (
        <section className={cardClass} aria-labelledby="gate-action-title">
          <h2 id="gate-action-title" className="text-sm font-medium text-zinc-100">
            {action ? GATE_ACTION_LABEL[action] : "Auto-merge"}
          </h2>
          {askedOther && (
            <p className="mt-1 text-sm text-zinc-400">
              {asked === "rearm" ? "Auto-merge isn't stopped on this pull request." : "Auto-merge is already stopped."}
            </p>
          )}
          {action === "stop" && (
            <p className="mt-1 text-sm text-zinc-400">
              Coderhelm won&apos;t merge this pull request until someone re-arms it, here or with a{" "}
              <code className="text-zinc-300">@coderhelm resume auto-merge</code> comment. New commits don&apos;t re-arm it.
            </p>
          )}
          {action === "rearm" && (
            <p className="mt-1 text-sm text-zinc-400">
              Nothing is skipped: before merging, Coderhelm checks its approval of the current commit, the required
              approvals and CI again. If the commit is new since its review, it reviews it first.
            </p>
          )}
          {action && (
            <button type="button" onClick={confirm} disabled={busy} className={`mt-3 ${primaryButton}`}>
              {busy ? (action === "stop" ? "Stopping…" : "Re-arming…") : GATE_ACTION_LABEL[action]}
            </button>
          )}
          <div role="status" aria-live="polite" className="mt-3 empty:hidden">
            {result && (
              <p className={`text-sm ${result.ok ? "text-emerald-300" : "text-amber-300"}`} data-testid="gate-result">
                {result.message}
              </p>
            )}
          </div>
          {failed && (
            <div className="mt-3">
              <Problem title={`Couldn't ${action === "rearm" ? "re-arm" : "stop"} auto-merge`} details={failed} onRetry={confirm}>
                Nothing changed on the PR. Try again; if it keeps failing, use a PR comment instead.
              </Problem>
            </div>
          )}
        </section>
      )}

      <section className={cardClass} aria-labelledby="gate-checklist-title">
        <h2 id="gate-checklist-title" className="text-sm font-medium text-zinc-100">What it waits on</h2>
        {checklist.length ? (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {checklist.map((c, i) => {
              const m = MARKS[c.mark] ?? MARKS.waiting;
              return (
                <li key={i} className="flex gap-2 text-zinc-400">
                  <span aria-hidden="true" className={`w-3 shrink-0 text-center ${m.cls}`}>{m.glyph}</span>
                  <span className="sr-only">{m.sr}</span>
                  <span className="min-w-0 [overflow-wrap:anywhere]">{shortShas(c.text)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-zinc-400">
            {g ? "Nothing to show yet for this commit." : "Auto-merge hasn't started on this pull request yet."}
          </p>
        )}
      </section>

      <section className={cardClass} aria-labelledby="gate-history-title">
        <h2 id="gate-history-title" className="text-sm font-medium text-zinc-100">Stops and re-arms</h2>
        {controls.length ? (
          <ol className="mt-2 flex flex-col divide-y divide-zinc-800/60 text-sm" data-testid="gate-history">
            {controls.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-zinc-400">
                <span className="min-w-0 wrap-anywhere">
                  <span className="text-zinc-200">
                    {c.action === "stop" ? "Stopped" : c.outcome === "recheck" ? "Checked again" : "Re-armed"}
                  </span>
                  {` by ${stopperName(c)}${via(c.via) ? ` ${via(c.via)}` : ""}`}
                </span>
                <Time iso={c.at} className="text-zinc-400" />
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1 text-sm text-zinc-400">No one has stopped or re-armed it.</p>
        )}
      </section>
    </Page>
  );
}

/** "commit 4f1c2a9e8b7d…" (a full 40-character sha) becomes "commit 4f1c2a9": the short form people read. */
function shortShas(text: string): string {
  return text.replace(/\b([0-9a-f]{7})[0-9a-f]{33}\b/g, "$1");
}
