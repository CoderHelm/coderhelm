"use client";

import Link from "next/link";
import type { NeedsItem, Task } from "@/lib/api";
import { ExternalLinkIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui";

// What waits on a person, at the top of the plan, each row the exact ask:
// the run's question, the pull request to review or merge, the checks
// Coderhelm could not fix, the task that failed and why, the drafts left.
// A row goes away once it is handled: the list comes from the work itself.

const small = buttonClass("secondary", "sm");
const primarySmall = buttonClass("primary", "sm");

export interface NeedsActions {
  busy: string | null;
  retry: (task: Task) => void;
  drop: (taskId: string) => void;
  approveRest: () => void;
}

export function NeedsStrip({
  items,
  tasks,
  actions,
}: {
  items: NeedsItem[];
  tasks: Task[];
  actions: NeedsActions;
}) {
  if (items.length === 0) return null;
  const number = (id: string) => tasks.findIndex((t) => t.task_id === id) + 1;
  return (
    <section
      id="needs"
      aria-labelledby="needs-heading"
      data-testid="needs-strip"
      className="scroll-mt-8 rounded-lg border border-orange-500/30 bg-orange-500/5"
    >
      <h2 id="needs-heading" className="flex items-center gap-2 px-4 pt-3 text-sm font-semibold text-orange-200">
        Needs you
        <span className="font-normal tabular-nums text-orange-300">{items.length}</span>
      </h2>
      <ul className="divide-y divide-orange-500/10">
        {items.map((n, i) => {
          const task = tasks.find((t) => t.task_id === n.task_id);
          const busy = (a: string) => actions.busy === `${n.task_id}:${a}`;
          return (
            <li key={`${n.task_id}:${n.kind}:${i}`} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between" data-testid="needs-item" data-kind={n.kind}>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-100 [overflow-wrap:anywhere]">
                  {task && <span className="mr-1.5 tabular-nums text-zinc-400">{number(task.task_id)}.</span>}
                  {n.ask}
                </p>
                {n.detail && <p className="mt-0.5 line-clamp-3 text-xs text-zinc-300 [overflow-wrap:anywhere]">{n.detail}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {n.action === "approve" && (
                  <button type="button" onClick={actions.approveRest} disabled={!!actions.busy} className={primarySmall}>
                    Approve the rest
                  </button>
                )}
                {n.action === "answer" && n.run_id && (
                  <Link href={`/runs/detail?id=${encodeURIComponent(n.run_id)}`} className={primarySmall}>
                    Answer
                  </Link>
                )}
                {(n.action === "open_pr" || n.action === "open_link") && n.url && (
                  <a href={n.url} target="_blank" rel="noopener noreferrer" className={`${primarySmall} gap-1.5`}>
                    {prWord(n)}
                    <span aria-hidden="true" className="inline-flex">
                      <ExternalLinkIcon />
                    </span>
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
                {n.action === "retry" && task && (
                  <>
                    <button type="button" onClick={() => actions.retry(task)} disabled={!!actions.busy} className={primarySmall}>
                      {busy("retry") ? "Retrying…" : "Retry"}
                    </button>
                    <button type="button" onClick={() => actions.drop(task.task_id)} disabled={!!actions.busy} className={small}>
                      Drop task
                    </button>
                  </>
                )}
                {n.run_id && n.action !== "answer" && (
                  <Link href={`/runs/detail?id=${encodeURIComponent(n.run_id)}`} className={buttonClass("ghost", "sm")}>
                    Open run
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function prWord(n: NeedsItem): string {
  const num = n.url?.match(/\/pull\/(\d+)/)?.[1];
  const what = n.kind === "merge" ? "Merge" : n.kind === "approval" ? "Approve" : n.kind === "checks" ? "See checks on" : "Review";
  return num ? `${what} #${num}` : `${what} the pull request`;
}
