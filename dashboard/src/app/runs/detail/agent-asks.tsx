"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Approval, ApprovalCan, SignInPrompt } from "@/lib/agent-policy";
import { ApprovalCard } from "@/components/agent-approval";
import { SignInCard } from "@/components/sign-in-card";
import { Callout } from "@/components/callout";
import { linkButton } from "@/components/ui";

// What the run's agents needed from a person: approval cards (answered here,
// in Slack, Teams or email), why a loop stopped (agents paused, a card nobody
// answered), and connections the run could have used.

export function AgentAsks({
  runId,
  live,
  note,
  prompts,
}: {
  runId: string;
  /** The run is still working: pending cards are checked again. */
  live: boolean;
  note?: string | null;
  prompts?: SignInPrompt[];
}) {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [can, setCan] = useState<ApprovalCan>({ approve: false, always: false });

  const load = useCallback(() => {
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
    load();
    if (!live) return;
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load, live]);

  const signIns = Array.isArray(prompts) ? prompts : [];
  if (approvals.length === 0 && !note && signIns.length === 0) return null;

  return (
    <section aria-labelledby="agent-asks-heading" className="mb-6 space-y-3" data-testid="run-agent-asks">
      <h2 id="agent-asks-heading" className="text-sm font-semibold text-zinc-200">
        Agent permissions
      </h2>
      {note && (
        <Callout variant="warning" title="The agent stopped">
          <p>{note}</p>
          <p>
            <Link href="/settings/agents/" className={linkButton}>
              Open agent permissions
            </Link>
          </p>
        </Callout>
      )}
      {approvals.map((a) => (
        <ApprovalCard key={a.id} approval={a} can={can} via="run_page" onDecided={load} />
      ))}
      {signIns.map((p) => (
        <SignInCard key={p.server_id} prompt={p} />
      ))}
    </section>
  );
}
