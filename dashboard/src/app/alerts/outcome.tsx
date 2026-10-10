/** What CoderHelm did with an alert, as a badge. */
export const OUTCOMES: Record<string, { label: string; detail: string; cls: string }> = {
  run_started: {
    label: "Run started",
    detail: "CoderHelm started a run on the mapped repo to act on this alert.",
    cls: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  },
  duplicate: {
    label: "Repeat",
    detail: "The same alert already started a run in the last 6 hours, so this one was folded into it.",
    cls: "bg-zinc-800 border-zinc-700 text-zinc-400",
  },
  in_flight: {
    label: "Already handled",
    detail: "A run for this alert is in progress or already finished.",
    cls: "bg-zinc-800 border-zinc-700 text-zinc-400",
  },
  no_match: {
    label: "No match",
    detail: "The alert didn't contain any of the route's match terms.",
    cls: "bg-zinc-800 border-zinc-700 text-zinc-400",
  },
  not_alarm: {
    label: "Recovery",
    detail: "The alert is a recovery or informational state change, so there was nothing to fix.",
    cls: "bg-zinc-800 border-zinc-700 text-zinc-400",
  },
  route_paused: {
    label: "Route paused",
    detail: "The route for this topic is paused.",
    cls: "bg-amber-500/10 border-amber-500/20 text-amber-400",
  },
  budget: {
    label: "Over token limit",
    detail: "The team's token limit was reached, so no run started.",
    cls: "bg-amber-500/10 border-amber-500/20 text-amber-400",
  },
  daily_cap: {
    label: "Daily cap",
    detail: "The route already started 20 runs in the last day.",
    cls: "bg-amber-500/10 border-amber-500/20 text-amber-400",
  },
  misconfigured: {
    label: "Route misconfigured",
    detail: "The route's repo is invalid. Edit the route in Alert routes.",
    cls: "bg-red-500/10 border-red-500/20 text-red-400",
  },
  error: {
    label: "Error",
    detail: "Starting the run failed. SNS retries the delivery, and this record updates when it does.",
    cls: "bg-red-500/10 border-red-500/20 text-red-400",
  },
};

export function OutcomeBadge({ outcome }: { outcome: string }) {
  const o = OUTCOMES[outcome] ?? { label: outcome, cls: "bg-zinc-800 border-zinc-700 text-zinc-400" };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${o.cls}`}>
      {o.label}
    </span>
  );
}

export function formatWhen(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}
