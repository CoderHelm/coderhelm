import { recentRecovery } from "@/lib/current-state";

/** "Fixed itself at 14:02": the history line a passing state keeps for a day after a problem cleared. */
export function Recovered({ at, now }: { at: string | null | undefined; now?: number }) {
  const when = recentRecovery(at, now);
  if (!when) return null;
  const d = new Date(when);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const day = new Date().toDateString() === d.toDateString() ? "" : ` ${d.toLocaleDateString([], { month: "short", day: "numeric" })}`;
  return (
    <span className="text-zinc-400" data-testid="recovered" title={d.toLocaleString()}>
      Fixed itself at {time}
      {day}
    </span>
  );
}
