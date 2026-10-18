// Token counts and how close a team is to its monthly limit, shared by the
// sidebar meter, the Settings hub and the Token limit page so all three agree.

/** Fired after the limit changes so the sidebar meter and banner re-read usage. */
export const USAGE_CHANGED = "coderhelm:usage-changed";

export function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

/** "success" under 80% of the limit, "warning" from 80%, "error" at or over it. */
export function usageTone(used: number, limit: number): "success" | "warning" | "error" | "neutral" {
  if (limit <= 0) return "neutral";
  if (used >= limit) return "error";
  if (used >= limit * 0.8) return "warning";
  return "success";
}
