"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusPill } from "@/components/status-pill";
import { focusRing, linkButton } from "@/components/ui";
import { agentHref, asker, skillsApi, type AgentAsk } from "@/lib/skills";

const OUTCOME: Record<AgentAsk["outcome"], { tone: "success" | "warning" | "error"; label: string }> = {
  answered: { tone: "success", label: "Answered" },
  pending: { tone: "warning", label: "Thinking…" },
  failed: { tone: "error", label: "No answer" },
  timed_out: { tone: "error", label: "Took too long" },
};

/** The run's questions to the team's own agents, each linked to the agent. */
export function TeamAgentAsks({ runId, status }: { runId: string; status: string }) {
  const [asks, setAsks] = useState<AgentAsk[]>([]);

  useEffect(() => {
    if (!runId) return;
    skillsApi
      .runAsks(runId)
      .then((r) => setAsks(r.asks))
      .catch(() => {});
  }, [runId, status]);

  if (asks.length === 0) return null;
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-sm font-medium text-zinc-300">Team agents asked ({asks.length})</h2>
      <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
        {asks.map((a) => (
          <AskRow key={a.id} ask={a} />
        ))}
      </ul>
    </div>
  );
}

function AskRow({ ask }: { ask: AgentAsk }) {
  const [open, setOpen] = useState(false);
  const o = OUTCOME[ask.outcome] ?? OUTCOME.failed;
  const name = ask.path.split("/").pop()?.replace(/\.md$/, "") ?? ask.path;
  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm text-zinc-300">
          {asker(ask.by)} asked{" "}
          <Link href={agentHref(ask)} className={`font-mono text-zinc-100 underline underline-offset-2 rounded ${focusRing}`}>
            {name}
          </Link>
        </p>
        <StatusPill tone={o.tone}>{o.label}</StatusPill>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-400 [overflow-wrap:anywhere]">{ask.question}</p>
      {ask.answer && (
        <>
          <div className={`mt-2 whitespace-pre-wrap break-words rounded bg-zinc-950 px-3 py-2 text-sm text-zinc-300 ${open ? "" : "line-clamp-3"}`}>{ask.answer}</div>
          <button type="button" className={`${linkButton} mt-1 text-xs`} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? "Show less" : "Show the whole answer"}
          </button>
        </>
      )}
    </li>
  );
}
