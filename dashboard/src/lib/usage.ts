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

type UsageParts = {
  tokens_in: number;
  tokens_out: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  total_tokens?: number;
};

/** The four parts, in the order they are shown everywhere. */
export function usageParts(u: UsageParts): { label: string; value: number }[] {
  return [
    { label: "New input", value: u.tokens_in },
    { label: "Read from cache", value: u.cache_read_tokens ?? 0 },
    { label: "Written to cache", value: u.cache_write_tokens ?? 0 },
    { label: "Output", value: u.tokens_out },
  ];
}

/**
 * All four parts added up: the total every meter shows. A response without
 * the cache parts (an older gateway) falls back to its own total.
 */
export function usageTotal(u: UsageParts): number {
  if (u.cache_read_tokens == null && u.cache_write_tokens == null && u.total_tokens != null) {
    return u.total_tokens;
  }
  return usageParts(u).reduce((sum, p) => sum + p.value, 0);
}

/** Read from cache ÷ (read from cache + written to cache + new input). */
export function cacheHitRate(u: UsageParts): number {
  const read = u.cache_read_tokens ?? 0;
  const denom = read + (u.cache_write_tokens ?? 0) + u.tokens_in;
  return denom > 0 ? read / denom : 0;
}

/** "71.3M tokens: New input 124K · Read from cache 61.4M · ..." for hovers. */
export function usageBreakdown(u: UsageParts): string {
  const parts = usageParts(u)
    .map((p) => `${p.label} ${formatTokens(p.value)}`)
    .join(" · ");
  return `${formatTokens(usageTotal(u))} tokens: ${parts} · Cache hit rate ${Math.round(cacheHitRate(u) * 100)}%`;
}

/** Plain names for the features usage is split by. */
export const FEATURE_LABELS: Record<string, string> = {
  run: "Ticket runs",
  feedback: "PR follow-ups",
  review: "PR reviews",
  agent_ask: "Team agent questions",
  skill_sync: "Team agent sync",
  alert: "Alerts",
  onboard: "Onboarding",
  infra: "Infrastructure analysis",
  chat: "Plan chat",
  plan: "Plan tasks",
  log_analysis: "Log analysis",
  release_notes: "Release notes",
  tests: "Test results",
  live_sources: "Live sources",
  memory: "Memory",
  other: "Other",
};

/** "success" under 80% of the limit, "warning" from 80%, "error" at or over it. */
export function usageTone(used: number, limit: number): "success" | "warning" | "error" | "neutral" {
  if (limit <= 0) return "neutral";
  if (used >= limit) return "error";
  if (used >= limit * 0.8) return "warning";
  return "success";
}
