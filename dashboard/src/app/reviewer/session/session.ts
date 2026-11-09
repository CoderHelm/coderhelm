import type { StatusLook } from "@/components/list/status";

// Plain words for a review session (`/api/reviewer/session`): its status, what
// asked for it, and how long it took. Pure, so the e2e suite checks them
// directly.

/** How often an open session page refreshes while the review runs. */
export const SESSION_POLL_MS = 4_000;

/** A job id the worker makes (a UUID). Anything else never reaches the API. */
export function isSessionId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

const LOOKS: Record<string, StatusLook> = {
  reviewing: { label: "Reviewing", tone: "live", live: true },
  done: { label: "Done", tone: "success" },
  skipped: { label: "Skipped", tone: "muted" },
  retrying: { label: "Sent again", tone: "waiting" },
  failed: { label: "Failed", tone: "danger" },
  stalled: { label: "Stalled", tone: "danger" },
};

/** The session's status as a dot and a word. Unknown codes still read as words. */
export function sessionLook(status: string, kind = "review"): StatusLook {
  if (status === "reviewing" && kind === "question") return { label: "Answering", tone: "live", live: true };
  const look = LOOKS[status];
  if (look) return look;
  const words = (status || "unknown").replace(/_/g, " ").toLowerCase();
  return { label: words.charAt(0).toUpperCase() + words.slice(1), tone: "muted" };
}

/** What a status means, in one sentence, when the status word alone doesn't say. */
export function statusNote(status: string): string | null {
  switch (status) {
    case "retrying":
      return "This try didn't finish, so Coderhelm sent the review again. The new try has its own session.";
    case "stalled":
      return "The review stopped without saying how it ended. Ask for a review again on the pull request to start a new one.";
    case "failed":
      return "The review didn't finish. Nothing new was posted on the pull request.";
    default:
      return null;
  }
}

const TRIGGERS: Record<string, string> = {
  label: "The review label",
  labeled: "The review label",
  push: "New commits",
  synchronize: "New commits",
  opened: "The pull request was opened",
  reopened: "The pull request was reopened",
  ready_for_review: "The pull request was marked ready",
  rerequest: "Asked for again",
  reply: "A reply to the reviewer",
  sweep: "The reviewer's catch-up check",
  reconcile: "The reviewer's catch-up check",
};

/** What asked for the review, in words. */
export function triggerLabel(trigger: string): string {
  if (!trigger) return "Unknown";
  const known = TRIGGERS[trigger];
  if (known) return known;
  const words = trigger.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "Review" or "Answer to a comment". */
export function kindLabel(kind: string): string {
  return kind === "question" ? "Answer to a comment" : "Review";
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Seconds from start to finish, or to `now` while it still runs. `null` when
 * there is no start, or no finish for a session that is over.
 */
export function sessionSeconds(
  s: { started_at: string; finished_at: string; in_flight: boolean },
  now = Date.now(),
): number | null {
  const start = ms(s.started_at);
  if (start === null) return null;
  const end = ms(s.finished_at) ?? (s.in_flight ? now : null);
  if (end === null) return null;
  return Math.max(0, Math.round((end - start) / 1000));
}

/** Seconds from the session's start to one step: "+12s" on the timeline. */
export function stepOffset(startedAt: string, at: string): number | null {
  const start = ms(startedAt);
  const t = ms(at);
  if (start === null || t === null) return null;
  return Math.max(0, Math.round((t - start) / 1000));
}

/** "No findings", "1 finding", "3 findings"; `null` before there is a count. */
export function findingsLabel(n: number | null | undefined): string | null {
  if (n === null || n === undefined) return null;
  if (n === 0) return "No findings";
  return `${n} finding${n === 1 ? "" : "s"}`;
}

/** The session page's address for a job id. */
export function sessionHref(id: string): string {
  return `/reviewer/session?${new URLSearchParams({ id })}`;
}

/** One row of the activity timeline: a session step, or a group of what the reviewer did. */
export type TimelineEntry<S, G> = { kind: "step"; at: string; step: S } | { kind: "group"; at: string; group: G };

/**
 * The session's steps (setup, posting) and the reviewer's activity groups in
 * one list, oldest first. A step and a group at the same moment keep the
 * step first; entries without a readable time keep their place after the
 * ones before them.
 */
export function timeline<S extends { at: string }, G extends { started_at: string }>(
  steps: S[],
  groups: G[],
): TimelineEntry<S, G>[] {
  const keyed: { entry: TimelineEntry<S, G>; order: number; t: number }[] = [];
  let last = -Infinity;
  steps.forEach((step, i) => {
    const t = ms(step.at) ?? last;
    last = t;
    keyed.push({ entry: { kind: "step", at: step.at, step }, order: i, t });
  });
  last = -Infinity;
  groups.forEach((group, i) => {
    const t = ms(group.started_at) ?? last;
    last = t;
    keyed.push({ entry: { kind: "group", at: group.started_at, group }, order: i, t });
  });
  keyed.sort(
    (a, b) =>
      a.t - b.t || (a.entry.kind === b.entry.kind ? a.order - b.order : a.entry.kind === "step" ? -1 : 1),
  );
  return keyed.map((k) => k.entry);
}

/** The activity card's heading, by how the review stands. */
export function activityHeading(status: string, kind = "review"): string {
  const answering = kind === "question";
  if (status === "reviewing") return answering ? "Reading the comment" : "Reviewing pull request";
  if (status === "done") return answering ? "Read the comment" : "Reviewed pull request";
  if (status === "skipped") return "Looked at the pull request";
  return answering ? "Reading the comment" : "Reviewing pull request";
}

/** "+1m 4s" from the session's start; empty without a time. */
export function offsetLabel(startedAt: string, at: string, format: (s: number) => string): string {
  const s = stepOffset(startedAt, at);
  return s === null ? "" : `+${format(s)}`;
}

/** "3 more steps weren't recorded" past the review's cap; null when none were left out. */
export function droppedNote(n: number | null | undefined): string | null {
  if (!n || n <= 0) return null;
  return n === 1 ? "1 more step wasn't recorded." : `${n} more steps weren't recorded.`;
}

/** Above this many files the overview's table starts folded, as on GitHub. */
export const OVERVIEW_FOLD_AFTER = 15;
