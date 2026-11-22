import { TONES, type StatusLook, type Tone } from "@/components/list/status";
import type { Plan, PrChip as PrChipData, Task, TaskCounts, TaskState } from "@/lib/api";
import { focusRing } from "@/components/ui";

// Where a plan and its tasks stand, in plain words and the shared list tones.
// The states come from the API, derived from the runs and pull requests
// (never from a ticket being filed): a plan is Done only when every task
// merged or was dropped.

const PILL = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap";

const PLAN: Record<string, StatusLook> = {
  drafting: { label: "Drafting", tone: "neutral" },
  running: { label: "Running", tone: "live", live: true },
  needs_you: { label: "Needs you", tone: "attention" },
  done: { label: "Done", tone: "success" },
  stalled: { label: "Stalled", tone: "waiting" },
};

/** A plan's state; older answers without one read from the older word. */
export function planState(plan: Pick<Plan, "state" | "status">): string {
  if (plan.state) return plan.state;
  if (plan.status === "draft") return "drafting";
  // An older "done" was written when tickets were filed, not when work merged.
  return "running";
}

/** How a plan's state looks in a list or a header. */
export function planStatusLook(state: string): StatusLook {
  return PLAN[state] ?? PLAN[planState({ status: state })] ?? { label: words(state), tone: "neutral" };
}

export function PlanStatusPill({ state }: { state: string }) {
  const s = planStatusLook(state);
  return <span className={`${PILL} ${TONES[s.tone].chip}`}>{s.label}</span>;
}

/** Task states in the order people act on them (the groups and filters). */
export const TASK_ORDER: TaskState[] = ["needs_you", "failed", "in_review", "working", "queued", "draft", "merged", "dropped"];

const TASK_LOOK: Record<TaskState, StatusLook> = {
  draft: { label: "Draft", tone: "neutral" },
  queued: { label: "Queued", tone: "queued", live: true },
  working: { label: "Working", tone: "live", live: true },
  needs_you: { label: "Needs you", tone: "attention" },
  failed: { label: "Failed", tone: "danger" },
  in_review: { label: "In review", tone: "waiting" },
  merged: { label: "Merged", tone: "merged" },
  dropped: { label: "Dropped", tone: "muted" },
};

/** A task's state; older answers without one read from the row's own word. */
export function taskState(task: Pick<Task, "state" | "status">): TaskState {
  if (task.state && task.state in TASK_LOOK) return task.state as TaskState;
  switch (task.status) {
    case "draft":
      return "draft";
    case "rejected":
      return "dropped";
    case "failed":
      return "failed";
    case "running":
      return "working";
    default:
      return "queued";
  }
}

export function taskStatusLook(state: string): StatusLook {
  return TASK_LOOK[state as TaskState] ?? { label: words(state), tone: "neutral" };
}

/** Finished: nothing more happens on it, so its row is faded. */
export function taskFinished(state: string): boolean {
  return state === "merged" || state === "dropped";
}

function words(status: string): string {
  const s = (status || "unknown").replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "$12.40", "$0.30", or "under $0.01". */
export function money(v: number | null | undefined): string {
  const n = v ?? 0;
  if (n > 0 && n < 0.01) return "under $0.01";
  return `$${n.toFixed(2)}`;
}

/** "$3 to $9" from an estimate's low and high. */
export function moneyRange(low: number, high: number): string {
  const r = (n: number) => `$${n.toFixed(2)}`;
  return Math.abs(high - low) < 0.005 ? r(low) : `${r(low)} to ${r(high)}`;
}

// The colour of a pull request chip: green ready to merge, yellow waiting on
// checks or a review, red failing, purple merged, grey closed or draft.
const CHIP_TONE: Record<string, Tone> = {
  ready: "success",
  waiting: "waiting",
  failing: "danger",
  merged: "merged",
  closed: "muted",
};

/** What the chip's colour means, in words, for its hover text and screen readers. */
export function chipWords(pr: PrChipData): string {
  if (pr.state === "merged") return "merged";
  if (pr.state === "closed") return "closed without merging";
  const parts: string[] = [];
  if (pr.state === "draft") parts.push("draft");
  parts.push(
    pr.checks === "passed"
      ? "checks pass"
      : pr.checks === "failed"
        ? "checks fail"
        : pr.checks === "running"
          ? "checks running"
          : "checks not reported",
  );
  if (pr.review === "approved") parts.push("approved");
  else if (pr.review === "changes_requested") parts.push("changes requested");
  else if (pr.review === "waiting") parts.push("waiting on a review");
  if (pr.tone === "ready") parts.push("ready to merge");
  return parts.join(", ");
}

/** A pull request number coloured by where it stands, with its size. */
export function PrChip({ pr }: { pr: PrChipData }) {
  const tone = TONES[CHIP_TONE[pr.tone] ?? "neutral"];
  const what = chipWords(pr);
  const size = pr.additions != null && pr.deletions != null ? ` +${pr.additions} -${pr.deletions}` : "";
  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Pull request #${pr.number}: ${what}`}
      aria-label={`Pull request #${pr.number}, ${what}${size ? `, ${pr.additions} lines added and ${pr.deletions} removed` : ""} (opens in a new tab)`}
      data-testid="pr-chip"
      data-tone={pr.tone}
      className={`${PILL} gap-1 tabular-nums hover:brightness-125 ${tone.chip} ${focusRing}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />#{pr.number}
      {size && <span className="font-normal opacity-80">{size}</span>}
    </a>
  );
}

const BAR_ORDER: TaskState[] = ["merged", "in_review", "working", "queued", "needs_you", "failed", "draft", "dropped"];

/** The tasks by state as one thin bar: merged first, then the work still open. */
export function StateBar({ counts, className = "" }: { counts: TaskCounts | null | undefined; className?: string }) {
  if (!counts) return null;
  const total = BAR_ORDER.reduce((n, s) => n + (counts[s] ?? 0), 0);
  if (total === 0) return null;
  const said = BAR_ORDER.filter((s) => (counts[s] ?? 0) > 0)
    .map((s) => `${counts[s]} ${taskStatusLook(s).label.toLowerCase()}`)
    .join(", ");
  return (
    <div
      role="img"
      aria-label={`Tasks: ${said}`}
      data-testid="state-bar"
      className={`flex h-1.5 w-full max-w-md overflow-hidden rounded-full bg-zinc-800 ${className}`}
    >
      {BAR_ORDER.map((s) => {
        const n = counts[s] ?? 0;
        if (!n) return null;
        return <span key={s} className={`h-full ${TONES[taskStatusLook(s).tone].dot}`} style={{ width: `${(n / total) * 100}%` }} />;
      })}
    </div>
  );
}
