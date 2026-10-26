"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import {
  AGENT_LABELS, RISK_LABELS, approvalHeadline, decidedByText, decisionLine, relativeTime,
  type Approval, type ApprovalCan, type Choice, type Via,
} from "@/lib/agent-policy";
import { CodeBlock } from "./code-block";
import { StatusPill } from "./status-pill";
import { buttonClass, inputClass } from "./ui";

// One approval card: what an agent wants to do, why, the exact arguments and
// the risk, with the answers the person may give. The same card shows on the
// run page, in the plan chat, in the approvals queue and on the page Slack,
// Teams and email buttons open.

const RISK_TONE = { read: "neutral", write: "warning", consequential: "error" } as const;

/** "create_reconciliation_adjustment" -> "create reconciliation adjustment". */
function words(id: string): string {
  return id.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/** "payments-ledger-mcp-server" -> "Payments ledger". */
function serverName(id: string): string {
  const w = words(id).replace(/\b(mcp server|mcp|server)\b/g, "").replace(/\s+/g, " ").trim();
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : id;
}

/**
 * The card's headline in plain words: "Coderhelm wants to create an issue
 * in Linear". The exact tool and connection names stay under Show details.
 */
export function plainHeadline(a: Pick<Approval, "kind" | "tool" | "server" | "command">): { lead: string; action: string; where?: string } {
  if (a.kind === "command") return { lead: "Coderhelm wants to run a command", action: a.command ?? "" };
  const bare = a.tool.includes("__") ? a.tool.split("__").slice(1).join("__") : a.tool;
  if (a.kind === "mcp") return { lead: "Coderhelm wants to", action: words(bare), where: a.server ? serverName(a.server) : "a connected tool" };
  return { lead: "Coderhelm wants to use", action: words(bare) };
}

export function ApprovalCard({
  approval,
  can,
  via,
  onDecided,
  focus = false,
}: {
  approval: Approval;
  can: ApprovalCan;
  /** Where the answer is given, for the record. */
  via: Via;
  onDecided?: (a: Approval) => void;
  /** Opened from a link: the card is outlined. */
  focus?: boolean;
}) {
  const [a, setA] = useState(approval);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [denying, setDenying] = useState(false);
  const [error, setError] = useState("");
  const pending = a.status === "pending" && Date.parse(a.expires_at) > Date.now();
  const headline = plainHeadline(a);
  const noteId = `approval-note-${a.id}`;

  const answer = async (approve: boolean, choice: Choice = "once") => {
    setBusy(approve ? choice : "deny");
    setError("");
    try {
      const r = await api.decideApproval(a.id, { approve, choice, via, note: note.trim() || undefined });
      setA(r.approval);
      onDecided?.(r.approval);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The answer wasn't saved. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const args = (() => {
    try {
      return JSON.stringify(a.args, null, 2);
    } catch {
      return String(a.args);
    }
  })();

  return (
    <section
      aria-label={`Approval: ${headline.lead} ${headline.action}${headline.where ? ` in ${headline.where}` : ""}`}
      data-testid="approval-card"
      data-approval-id={a.id}
      data-status={pending ? "pending" : a.status}
      className={`min-w-0 rounded-lg border bg-zinc-900/60 p-4 ${focus ? "border-amber-500/50" : "border-zinc-800"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={pending ? "warning" : a.status === "approved" ? "success" : a.status === "denied" ? "error" : "neutral"}>
          {pending ? "Waiting for approval" : a.status === "pending" ? "Expired" : a.status[0].toUpperCase() + a.status.slice(1)}
        </StatusPill>
        {a.risk && <StatusPill tone={RISK_TONE[a.risk]}>{RISK_LABELS[a.risk]}</StatusPill>}
        <span className="text-xs text-zinc-400">
          {AGENT_LABELS[a.agent]}
          {a.repo ? ` in ${a.repo}` : ""}
        </span>
      </div>
      <p className="mt-2 text-sm text-zinc-200 [overflow-wrap:anywhere]" data-testid="approval-headline">
        {headline.lead}{" "}
        {a.kind === "command" ? <code className="rounded bg-zinc-800 px-1 py-px text-zinc-100">{headline.action}</code> : <strong className="font-semibold text-zinc-50">{headline.action}</strong>}
        {headline.where ? (
          <>
            {" "}in <strong className="font-semibold text-zinc-50">{headline.where}</strong>
          </>
        ) : null}
      </p>
      {a.why && <p className="mt-1 text-sm text-zinc-300">Why: {a.why}</p>}
      <details className="mt-2">
        <summary className="cursor-pointer text-sm text-zinc-400 hover:text-zinc-200">Show details</summary>
        <div className="mt-2 space-y-2">
          <p className="text-sm text-zinc-400 [overflow-wrap:anywhere]">
            {approvalHeadline(a)}. Coderhelm asked because {decidedByText(a.asked_because).replace(/^./, (c) => c.toLowerCase())}
          </p>
          <CodeBlock code={args} lang="json" label="Arguments" wrap maxHeightClass="max-h-64" />
        </div>
      </details>

      {pending ? (
        can.approve ? (
          <div className="mt-3 space-y-2">
            {denying && (
              <div>
                <label htmlFor={noteId} className="block text-sm text-zinc-300">
                  Tell the agent why (optional)
                </label>
                <textarea id={noteId} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass} mt-1`} />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!!busy} onClick={() => answer(true, "once")} className={buttonClass("primary", "sm")}>
                {busy === "once" ? "Allowing…" : "Allow once"}
              </button>
              {can.always && a.repo && (
                <button type="button" disabled={!!busy} onClick={() => answer(true, "always_repo")} className={buttonClass("secondary", "sm")}>
                  Always allow in this project
                </button>
              )}
              {can.always && (
                <button type="button" disabled={!!busy} onClick={() => answer(true, "always_tool")} className={buttonClass("secondary", "sm")}>
                  Always allow this action
                </button>
              )}
              {denying ? (
                <button type="button" disabled={!!busy} onClick={() => answer(false)} className={buttonClass("danger", "sm")}>
                  {busy === "deny" ? "Denying…" : "Deny"}
                </button>
              ) : (
                <button type="button" disabled={!!busy} onClick={() => setDenying(true)} className={buttonClass("ghost", "sm")}>
                  Deny…
                </button>
              )}
            </div>
            <p className="text-xs text-zinc-400">
              Answer {relativeTime(a.expires_at)}, or Coderhelm stops without doing it.
              {can.always ? " “Always allow” adds a rule you can see and remove on the Agent permissions page." : ""}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-zinc-400">Someone who can approve agent actions needs to answer this.</p>
        )
      ) : (
        <p className="mt-3 text-xs text-zinc-400" data-testid="approval-decision">
          {a.status === "pending" ? "Nobody answered in time. Nothing was done." : decisionLine(a)}
          {a.note ? ` “${a.note}”` : ""}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
