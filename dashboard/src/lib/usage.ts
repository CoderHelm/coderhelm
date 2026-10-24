// Token counts and how close a team is to its monthly limits, shared by the
// sidebar meters, the Settings hub and the Token limit page so all three agree.

import type { TokenLimitKind, TokenLimitUse, UsageInfo } from "./api";

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

/** Short names for each limit, as the meters and the form show them. */
export const LIMIT_LABELS: Record<TokenLimitKind, string> = {
  new_tokens: "New tokens",
  cache_read: "Cache read",
  cache_write: "Cache write",
  all_tokens: "All tokens",
};

/** What each limit counts, in plain words (hovers and the form's help). */
export const LIMIT_HELP: Record<TokenLimitKind, string> = {
  new_tokens: "New input plus output: what is sent to the model fresh and what it writes back.",
  cache_read: "Input the model reads back from the prompt cache instead of being sent again.",
  cache_write: "Input written to the prompt cache so later calls can read it back.",
  all_tokens: "All four kinds together: new input, cache reads, cache writes and output.",
};

/** The limit's name inside a sentence: "the cache read limit". */
export function limitName(kind: TokenLimitKind): string {
  return kind === "all_tokens" ? "token" : LIMIT_LABELS[kind].toLowerCase();
}

const KIND_ORDER: TokenLimitKind[] = ["new_tokens", "cache_read", "cache_write", "all_tokens"];

/**
 * Each set limit with what it counts this month, in display order. A response
 * without `limits` (an older gateway) falls back to its single `max_tokens`.
 */
export function usageLimits(u: UsageInfo): TokenLimitUse[] {
  if (u.limits) {
    return u.limits
      .filter((l) => l.max > 0)
      .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  }
  if (u.max_tokens > 0) {
    return [{ kind: u.limit_counts_cache ? "all_tokens" : "new_tokens", max: u.max_tokens, used: u.counted_tokens ?? u.total_tokens }];
  }
  return [];
}

/** The first limit the team has reached this month, if any. */
export function reachedLimit(u: UsageInfo): TokenLimitUse | undefined {
  return usageLimits(u).find((l) => l.used >= l.max);
}

/** The most urgent tone across the set limits. */
export function limitsTone(limits: TokenLimitUse[]): "success" | "warning" | "error" | "neutral" {
  const tones = limits.map((l) => usageTone(l.used, l.max));
  if (tones.includes("error")) return "error";
  if (tones.includes("warning")) return "warning";
  return tones.length > 0 ? "success" : "neutral";
}

/** Share of a limit used, 0 to 100. */
export function limitPct(l: TokenLimitUse): number {
  return l.max > 0 ? Math.min(100, Math.round((l.used / l.max) * 100)) : 0;
}

/** Bar color class for a limit's tone. */
export function limitBarClass(l: TokenLimitUse): string {
  const tone = usageTone(l.used, l.max);
  return tone === "error" ? "bg-red-500" : tone === "warning" ? "bg-amber-500" : "bg-emerald-500";
}
