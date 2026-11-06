import type { AlertEvent, AlertRepeat } from "@/lib/api";

/** The repeat settings in the order the editor offers them, in plain words. */
export const REPEAT_OPTIONS: { value: AlertRepeat; label: string; help: string }[] = [
  {
    value: "every_time",
    label: "Every time it fires",
    help: "Each alarm posts a message. This is how routes worked before this setting.",
  },
  {
    value: "until_clear",
    label: "Once, until it clears",
    help: "The first alarm posts. While it keeps firing, even when it flips to OK and back, nothing more posts and no second fix starts. Once it has stayed OK for 30 minutes (longer for alarms that check less often), the next alarm posts again.",
  },
  {
    value: "daily",
    label: "Once, then a daily reminder",
    help: "Like once until it clears, plus one message a day while it is still firing, saying since when and how many times it fired.",
  },
];

export const REPEAT_LABEL: Record<AlertRepeat, string> = Object.fromEntries(REPEAT_OPTIONS.map((o) => [o.value, o.label])) as Record<
  AlertRepeat,
  string
>;

/** The setting a route uses; routes saved before it existed post every time. */
export function routeRepeat(r: { repeat?: AlertRepeat | null }): AlertRepeat {
  return r.repeat && r.repeat in REPEAT_LABEL ? r.repeat : "every_time";
}

/** Outcomes of a delivery that is the alert recovering, not firing. */
const RECOVERY_OUTCOMES = new Set(["clearing", "recovered", "no_open_alert"]);

function isFire(e: AlertEvent): boolean {
  return !RECOVERY_OUTCOMES.has(e.outcome) && e.kind !== "recovery" && !/^OK: /.test(e.title ?? "");
}

/** One row of history: an alert, or a firing alarm's episode with its repeats. */
export interface EpisodeGroup {
  /** The alert the row shows: the one that opened the episode when it is loaded. */
  head: AlertEvent;
  /** Every delivery in the group, newest first (just `head` for a lone alert). */
  members: AlertEvent[];
  /** Deliveries held back (recorded, not posted) and reminders posted. */
  held: number;
  reminders: number;
  /** The newest delivery: where the row sits in the list. */
  latest: AlertEvent;
}

/**
 * Pure: alerts (newest first) with each episode's firings folded into one
 * row, placed where its newest firing is. Recoveries stay rows of their own,
 * as do alerts on routes that post every time (they carry no episode).
 */
export function groupEpisodes(events: AlertEvent[]): EpisodeGroup[] {
  const groups: EpisodeGroup[] = [];
  const byEpisode = new Map<string, EpisodeGroup>();
  for (const e of events) {
    const key = e.episode && isFire(e) ? e.episode : null;
    const known = key ? byEpisode.get(key) : undefined;
    if (known) {
      known.members.push(e);
      continue;
    }
    const g: EpisodeGroup = { head: e, members: [e], held: 0, reminders: 0, latest: e };
    groups.push(g);
    if (key) byEpisode.set(key, g);
  }
  for (const g of groups) {
    const key = g.head.episode;
    g.head = g.members.find((m) => m.id === key) ?? g.members[g.members.length - 1];
    g.held = g.members.filter((m) => m.suppressed || m.outcome === "suppressed").length;
    g.reminders = g.members.filter((m) => m.outcome === "reminded").length;
  }
  return groups;
}

/** "Fired 7 times: 1 posted, 1 reminder, 5 held back", for a group with repeats. */
export function groupSummary(g: EpisodeGroup): string | null {
  if (g.members.length < 2) return null;
  const fires = Math.max(g.members.length, ...g.members.map((m) => m.episode_fires ?? 0));
  const posted = g.members.length - g.held - g.reminders;
  const parts = [
    posted > 0 ? `${posted} posted` : null,
    g.reminders ? `${g.reminders} reminder${g.reminders === 1 ? "" : "s"}` : null,
    g.held ? `${g.held} held back` : null,
  ].filter(Boolean);
  return `Fired ${fires} times: ${parts.join(", ")}`;
}
