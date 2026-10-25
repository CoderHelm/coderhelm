"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Approval, ApprovalCan, SignInPrompt } from "@/lib/agent-policy";
import { ApprovalCard } from "@/components/agent-approval";
import { SignInCard } from "@/components/sign-in-card";
import { Callout } from "@/components/callout";
import { SectionHeading } from "@/components/page";
import { linkButton } from "@/components/ui";

// What the run's agents needed from a person: approval cards (answered here,
// in Slack, Teams or email), why a loop stopped (agents paused, a card nobody
// answered), and connections the run could have used.
//
// Two views of the same list. "Waiting on you" sits on the run's overview and
// holds only what someone can still act on: approvals still open (and any
// answered on this page view, so the answer stays in sight) and, while the
// run works, its sign-in prompts and why it stopped. Everything else is
// history, shown on the Activity tab, so a finished run never looks blocked.

export interface RunApprovals {
  approvals: Approval[];
  can: ApprovalCan;
  reload: () => void;
  /** Approvals answered on this page view. */
  answered: Set<string>;
  markAnswered: (id: string) => void;
}

export function useRunApprovals(runId: string, live: boolean): RunApprovals {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [can, setCan] = useState<ApprovalCan>({ approve: false, always: false });
  const [answered, setAnswered] = useState<Set<string>>(new Set());

  const reload = useCallback(() => {
    api
      .listApprovals({ status: "all", run_id: runId })
      .then((r) => {
        // An older gateway, or a proxy that answers anything, sends no list.
        setApprovals(Array.isArray(r?.approvals) ? r.approvals : []);
        if (r?.can) setCan(r.can);
      })
      .catch(() => {});
  }, [runId]);

  useEffect(() => {
    reload();
    if (!live) return;
    const t = setInterval(reload, 10_000);
    return () => clearInterval(t);
  }, [reload, live]);

  const markAnswered = useCallback((id: string) => setAnswered((s) => new Set(s).add(id)), []);
  return { approvals, can, reload, answered, markAnswered };
}

const isOpen = (a: Approval) => a.status === "pending" && Date.parse(a.expires_at) > Date.now();

/** What someone can still act on, for the run's overview. */
export function WaitingOnYou({
  data,
  live,
  note,
  prompts,
}: {
  data: RunApprovals;
  /** The run is still working (or waiting on an answer): its prompts and stop note are current. */
  live: boolean;
  note?: string | null;
  prompts?: SignInPrompt[];
}) {
  const open = data.approvals.filter((a) => isOpen(a) || data.answered.has(a.id));
  const signIns = live && Array.isArray(prompts) ? prompts : [];
  const stopNote = live ? note : null;
  const count = data.approvals.filter(isOpen).length + signIns.length;
  if (open.length === 0 && !stopNote && signIns.length === 0) return null;
  return (
    <section aria-labelledby="agent-asks-heading" className="space-y-3" data-testid="run-agent-asks">
      <SectionHeading id="agent-asks-heading" count={count > 0 ? count : undefined}>
        Waiting on you
      </SectionHeading>
      {stopNote && <StopNote note={stopNote} />}
      {open.map((a) => (
        <ApprovalCard
          key={a.id}
          approval={a}
          can={data.can}
          via="run_page"
          onDecided={() => {
            data.markAnswered(a.id);
            data.reload();
          }}
        />
      ))}
      {signIns.map((p) => (
        <SignInCard key={p.server_id} prompt={p} />
      ))}
    </section>
  );
}

/** Answered and expired approvals, and what was asked of a run that is over: the Activity tab. */
export function AsksHistory({
  data,
  live,
  note,
  prompts,
}: {
  data: RunApprovals;
  live: boolean;
  note?: string | null;
  prompts?: SignInPrompt[];
}) {
  const past = data.approvals.filter((a) => !isOpen(a) && !data.answered.has(a.id));
  const signIns = !live && Array.isArray(prompts) ? prompts : [];
  const oldNote = !live ? note : null;
  if (past.length === 0 && !oldNote && signIns.length === 0) return null;
  return (
    <section aria-labelledby="asks-history-heading" className="space-y-3" data-testid="run-asks-history">
      <SectionHeading id="asks-history-heading" count={past.length || undefined}>
        Approvals and sign-ins
      </SectionHeading>
      {oldNote && <StopNote note={oldNote} past />}
      {past.map((a) => (
        <ApprovalCard key={a.id} approval={a} can={data.can} via="run_page" onDecided={data.reload} />
      ))}
      {signIns.map((p) => (
        <SignInCard key={p.server_id} prompt={p} />
      ))}
    </section>
  );
}

function StopNote({ note, past = false }: { note: string; past?: boolean }) {
  return (
    <Callout variant={past ? "neutral" : "warning"} title={past ? "Coderhelm stopped at one point" : "Coderhelm stopped"}>
      <p>{note}</p>
      <p>
        <Link href="/settings/agents/" className={linkButton}>
          Open agent permissions
        </Link>
      </p>
    </Callout>
  );
}
