// One current state per surface: the dashboard's rule for every status,
// warning and problem it shows.
//
// A status producer on the platform keeps one problem state per check
// (services/common/src/problems.rs): the problem true now, or none, set by
// the check and cleared by the same check passing, with when it recovered.
// A page shows exactly one of:
//
//   - the problem true now (its words, and what to do), or
//   - the passing state, with "Fixed itself at …" for a day after it recovered.
//
// Never a stored reason or error beside a pass: a surface that has a passing
// state hides every older failure text, and keeps it only as history.

/** A problem state as the platform sends it (`problems::ProblemState::view`). */
export interface ProblemView {
  current: { kind: string; message: string; since: string; seen_at: string } | null;
  passed_at?: string | null;
  history?: { kind: string; message: string; since: string; recovered_at: string }[];
}

/** How long a recovery is worth saying beside the passing state. */
export const RECOVERED_FOR_MS = 24 * 3_600_000;

/** A recovery recent enough to say ("Fixed itself at 14:02"), or null. */
export function recentRecovery(at: string | null | undefined, now = Date.now()): string | null {
  if (!at) return null;
  const t = Date.parse(at);
  if (Number.isNaN(t) || now - t > RECOVERED_FOR_MS || t > now + 60_000) return null;
  return at;
}

/**
 * The one message a surface shows: the problem's words while one is true,
 * nothing once its state passes (whatever older text is stored beside it).
 */
export function currentMessage(passing: boolean, message: string | null | undefined): string | null {
  if (passing) return null;
  const m = message?.trim();
  return m ? m : null;
}
