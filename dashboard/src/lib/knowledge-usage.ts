// A knowledge base's usage: searches from Chat, agent runs, MCP and its
// own page, the pages they cite, and the questions without a good answer.

import { request } from "./api";

const e = encodeURIComponent;

// ── Usage ───────────────────────────────────────────────────────────────────

export interface Usage {
  week: number;
  last_week: number;
  /** Searches per day, oldest first, today last. */
  by_day: number[];
  /** `chat`, `page`, `mcp`, `run:<agent>`. */
  by_surface: Record<string, number>;
  top_pages: { file_id: string; title: string; found: number; cited: number }[];
  never_found: number;
  never_found_sample: { file_id: string; title: string }[];
  used_in: { surface: string; actor: string; href: string | null; at: string }[];
  /** Question words: managers only. */
  no_answer: { question: string; times: number; last_at: string; why: string }[];
  no_answer_count: number;
  kept_days: number;
}

export const kbUsage = {
  get: (kbId: string) => request<Usage>(`/api/knowledge/${e(kbId)}/usage`),
};

/** "Chat", "Coder runs", "MCP and API keys", "This page". */
export function surfaceWords(s: string, agents: { key: string; label: string }[] = []): string {
  if (s === "chat") return "Chat";
  if (s === "page") return "This page";
  if (s === "mcp") return "MCP and API keys";
  if (s.startsWith("run:")) {
    const key = s.slice(4);
    return `${agents.find((a) => a.key === key)?.label ?? key} runs`;
  }
  return s;
}

export const GAP_WHY: Record<string, string> = {
  no_hits: "Nothing matched",
  no_source: "Nothing supported an answer",
  rated_down: "Rated not helpful",
};
