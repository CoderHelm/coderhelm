// The status of a run, in words people use. One place, so the runs list, the
// run page and the ⌘K palette never disagree about what a status is called,
// which colour it is (the shared tones in ./list/status) or which group it
// belongs to.

import { StatusDot, TONES, statusWords, type StatusGroup, type StatusLook } from "./list/status";

type RunLook = StatusLook & { group?: StatusGroup };

const LOOKS: Record<string, RunLook> = {
  pending: { label: "Waiting to start", tone: "queued", group: "active" },
  queued: { label: "Queued", tone: "queued", group: "active" },
  running: { label: "Running", tone: "live", live: true, group: "active" },
  awaiting_ci: { label: "Waiting on CI", tone: "waiting", live: true, group: "waiting" },
  needs_input: { label: "Needs your answer", tone: "waiting", group: "waiting" },
  // The code works as designed; the fix is a change in another system's data or settings.
  needs_outside_change: { label: "Needs a change outside the code", tone: "attention", group: "waiting" },
  completed: { label: "Done", tone: "success", group: "done" },
  merged: { label: "Merged", tone: "merged", group: "done" },
  failed: { label: "Failed", tone: "danger", group: "failed" },
  cancelled: { label: "Cancelled", tone: "neutral", group: "failed" },
  // Set on the old run when it is retried or started over; the new run carries on.
  retried: { label: "Started again", tone: "muted" },
  // Older runs finished with this word before "completed".
  success: { label: "Done", tone: "success", group: "done" },
  archived: { label: "Archived", tone: "muted" },
};

/** The status codes behind each toggle on the runs list (sent to the server as `status=`). */
export const RUN_GROUP_STATUSES: Record<"active" | "waiting" | "done" | "failed", string> = {
  active: "pending,queued,running",
  waiting: "awaiting_ci,needs_input,needs_outside_change",
  done: "completed,success,merged",
  failed: "failed,cancelled",
};

/** How a run status looks in a list; unknown statuses read as plain words. */
export function runStatusLook(status: string | null | undefined): RunLook {
  return (status && LOOKS[status]) || { label: statusWords(status), tone: "neutral" };
}

/** The words for a run status. */
export function runStatusLabel(status: string | null | undefined): string {
  return runStatusLook(status).label;
}

/** True while the run is still working, so a page should keep refreshing it. */
export function runIsLive(status: string | null | undefined): boolean {
  return !!status && !!LOOKS[status]?.live;
}

export function RunStatusBadge({ status }: { status: string | null | undefined }) {
  const look = runStatusLook(status);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${TONES[look.tone].chip}`}>
      <StatusDot tone={look.tone} live={look.live} className="!h-1.5 !w-1.5" />
      {look.label}
    </span>
  );
}
