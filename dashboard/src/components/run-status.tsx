// The status of a run, in words people use. One place, so the runs list and
// the run page never disagree about what a status is called or how it looks.

type Look = { label: string; dot: string; text: string; bg: string; live?: boolean };

const LOOKS: Record<string, Look> = {
  pending: { label: "Waiting to start", dot: "bg-yellow-400", text: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
  queued: { label: "Queued", dot: "bg-yellow-400", text: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
  running: { label: "Running", dot: "bg-blue-400", text: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", live: true },
  awaiting_ci: { label: "Waiting on CI", dot: "bg-cyan-400", text: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20", live: true },
  needs_input: { label: "Needs your answer", dot: "bg-amber-400", text: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  // The code works as designed; the fix is a change in another system's data or settings.
  needs_outside_change: { label: "Needs a change outside the code", dot: "bg-orange-400", text: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
  completed: { label: "Done", dot: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  merged: { label: "Merged", dot: "bg-violet-400", text: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  failed: { label: "Failed", dot: "bg-red-400", text: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  cancelled: { label: "Cancelled", dot: "bg-zinc-400", text: "text-zinc-400", bg: "bg-zinc-800 border-zinc-700" },
  // Set on the old run when it is retried or started over; the new run carries on.
  retried: { label: "Started again", dot: "bg-zinc-400", text: "text-zinc-400", bg: "bg-zinc-800 border-zinc-700" },
  // Older runs finished with this word before "completed".
  success: { label: "Done", dot: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  archived: { label: "Archived", dot: "bg-zinc-500", text: "text-zinc-500", bg: "bg-zinc-800 border-zinc-700" },
};

const FALLBACK: Look = { label: "", dot: "bg-zinc-500", text: "text-zinc-400", bg: "bg-zinc-800 border-zinc-700" };

/** The words for a run status; unknown statuses read as plain words. */
export function runStatusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  const look = LOOKS[status];
  if (look) return look.label;
  const words = status.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** True while the run is still working, so a page should keep refreshing it. */
export function runIsLive(status: string | null | undefined): boolean {
  return !!status && !!LOOKS[status]?.live;
}

export function RunStatusBadge({ status }: { status: string | null | undefined }) {
  const look: Look = (status && LOOKS[status]) || FALLBACK;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${look.bg} ${look.text}`}>
      <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${look.dot} ${look.live ? "animate-pulse motion-reduce:animate-none" : ""}`} />
      {runStatusLabel(status)}
    </span>
  );
}
