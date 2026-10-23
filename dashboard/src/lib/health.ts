import type { HealthCheck } from "@/lib/api";

/** "4 days", "3 hours", "12 minutes", "under a minute". */
export function ageWords(secs: number | null | undefined): string {
  if (secs == null || secs < 60) return "under a minute";
  const unit = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  if (secs < 3600) return unit(Math.floor(secs / 60), "minute");
  if (secs < 86_400) return unit(Math.floor(secs / 3600), "hour");
  return unit(Math.floor(secs / 86_400), "day");
}

/** What a health result says, without its counts and times: the overall status and each check's. */
export function healthKey(h: HealthCheck): string {
  return [h.status, ...h.checks.map((c) => `${c.name}:${c.status}`)].join("|");
}

export interface Settled {
  /** The result on screen. */
  shown: HealthCheck | null;
  /** A polled result that says something different, waiting for the next poll to agree. */
  pending: HealthCheck | null;
}

/**
 * Debounce for polled health results. A poll that says the same as the screen
 * replaces it at once (fresh counts and times). A poll that says something
 * different is shown only when the next poll agrees, so one odd answer can't
 * flip the page between OK and Problem. The first result, and one the person
 * asked for with "Check now" or by acting on a message, is shown at once.
 */
export function settle(prev: Settled, next: HealthCheck, immediate: boolean): Settled {
  if (immediate || !prev.shown || healthKey(next) === healthKey(prev.shown)) {
    return { shown: next, pending: null };
  }
  if (prev.pending && healthKey(prev.pending) === healthKey(next)) {
    return { shown: next, pending: null };
  }
  return { shown: prev.shown, pending: next };
}
