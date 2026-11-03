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
