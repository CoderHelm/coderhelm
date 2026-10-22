import { TONES, type StatusLook } from "@/components/list/status";

// Plain-word status pills for plans and their tasks. The API sends status
// words like "rejected" or "waiting"; people see what they mean.

const PILL = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap";

// Plans use the shared list tones (components/list/status), so "Running" is
// the same colour here as on Runs.
const PLAN: Record<string, StatusLook> = {
  draft: { label: "Draft", tone: "neutral" },
  executing: { label: "Running", tone: "live", live: true },
  waiting: { label: "Waiting on a merge", tone: "waiting" },
  done: { label: "Done", tone: "success" },
};

/** How a plan's status looks in a list; unknown statuses read as plain words. */
export function planStatusLook(status: string): StatusLook {
  return PLAN[status] ?? { label: words(status), tone: "neutral" };
}

export const TASK: Record<string, { label: string; style: string; dot: string; border: string }> = {
  draft: { label: "Draft", style: "bg-zinc-800 text-zinc-400 border-zinc-700", dot: "bg-zinc-700", border: "border-l-zinc-700" },
  approved: { label: "Approved", style: "bg-green-500/10 text-green-400 border-green-500/20", dot: "bg-green-500/60", border: "border-l-green-500/50" },
  rejected: { label: "Skipped", style: "bg-zinc-800 text-zinc-500 border-zinc-700", dot: "bg-zinc-600", border: "border-l-zinc-600" },
  queued: { label: "Queued", style: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", dot: "bg-yellow-500/60", border: "border-l-yellow-500/50" },
  running: { label: "Running", style: "bg-blue-500/10 text-blue-400 border-blue-500/20", dot: "bg-blue-500", border: "border-l-blue-500" },
  waiting: { label: "Waiting", style: "bg-orange-500/10 text-orange-400 border-orange-500/20", dot: "bg-orange-500/60", border: "border-l-orange-500/50" },
  failed: { label: "Failed", style: "bg-red-500/10 text-red-400 border-red-500/20", dot: "bg-red-500/70", border: "border-l-red-500/60" },
  issue_created: { label: "Issue opened", style: "bg-blue-500/10 text-blue-300 border-blue-500/20", dot: "bg-blue-400/60", border: "border-l-blue-400/50" },
  done: { label: "Done", style: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-500", border: "border-l-emerald-500" },
};

/** Task statuses in the order the filter chips show them. */
export const TASK_ORDER = ["draft", "approved", "rejected", "queued", "running", "waiting", "failed", "issue_created", "done"];

function words(status: string): string {
  const s = (status || "unknown").replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function taskInfo(status: string) {
  return TASK[status] ?? { ...TASK.draft, label: words(status) };
}

export function PlanStatusPill({ status }: { status: string }) {
  const s = planStatusLook(status);
  return <span className={`${PILL} ${TONES[s.tone].chip}`}>{s.label}</span>;
}

export function TaskStatusPill({ status }: { status: string }) {
  const s = taskInfo(status);
  return <span className={`${PILL} ${s.style}`}>{s.label}</span>;
}
