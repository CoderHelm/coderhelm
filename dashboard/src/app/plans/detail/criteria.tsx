"use client";

import Link from "next/link";
import { useState } from "react";
import type { PlanCriterion, Task } from "@/lib/api";
import { StatusText, type StatusLook } from "@/components/list";
import { focusRing } from "@/components/ui";

// The plan's success criteria above its tasks: what done means, each with
// the tasks that cover it and what the work shows for it (the run's criteria
// trace). A long list folds to its count line once the plan runs.

const FOLD_OVER = 6;

const PROOF: Record<string, StatusLook> = {
  proven: { label: "Proven", tone: "success" },
  not_the_ticket: { label: "Passes without the change", tone: "waiting" },
  failing: { label: "Fails", tone: "danger" },
  missing: { label: "No test", tone: "waiting" },
  unverified: { label: "Unverified", tone: "waiting" },
  not_run: { label: "Not run yet", tone: "neutral" },
};

function look(c: PlanCriterion): StatusLook {
  if (c.met) return PROOF.proven;
  const worst = ["failing", "missing", "not_the_ticket", "unverified", "not_run"].find((s) => c.evidence.some((e) => e.state === s));
  return worst ? PROOF[worst] : { label: "No evidence yet", tone: "muted" };
}

export function CriteriaList({ criteria, tasks, folded }: { criteria: PlanCriterion[]; tasks: Task[]; folded: boolean }) {
  const [open, setOpen] = useState(!folded || criteria.length <= FOLD_OVER);
  if (criteria.length === 0) {
    return <p className="text-sm text-zinc-400">No criteria written. Add &quot;Done when&quot; lines to the tasks, and each one is checked against the work.</p>;
  }
  const met = criteria.filter((c) => c.met).length;
  const number = (id: string) => tasks.findIndex((t) => t.task_id === id) + 1;
  return (
    <div className="space-y-2" data-testid="criteria">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`rounded text-sm text-zinc-300 hover:text-zinc-100 ${focusRing}`}
        data-testid="criteria-count"
      >
        {criteria.length} criteri{criteria.length === 1 ? "on" : "a"}, {met} proven
        <span className="ml-1 text-zinc-400">{open ? "(hide)" : "(show)"}</span>
      </button>
      {open && (
        <ol className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/30">
          {criteria.map((c) => {
            const ev = c.evidence[0];
            return (
              <li key={c.id} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4" data-testid="criterion">
                <div className="min-w-0 text-sm">
                  <span className="mr-2 tabular-nums text-zinc-400">{c.id}</span>
                  <span className={c.met ? "text-zinc-300" : "text-zinc-100"}>{c.text}</span>
                  {c.tasks.length > 0 && (
                    <span className="ml-2 text-xs text-zinc-400">
                      task {c.tasks.map((t) => number(t)).filter((n) => n > 0).join(", ")}
                    </span>
                  )}
                  {ev?.by && <p className="text-xs text-zinc-400">{ev.by}{ev.tests && ev.tests.length > 0 ? `: ${ev.tests.join(", ")}` : ""}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusText look={look(c)} />
                  {ev?.run_id && (
                    <Link href={`/runs/detail?id=${encodeURIComponent(ev.run_id)}`} className={`rounded text-xs text-zinc-400 hover:text-zinc-200 hover:underline ${focusRing}`}>
                      Proof
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
