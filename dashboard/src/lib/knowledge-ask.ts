// "Ask this knowledge base" on its page: passages only (one embedding, no
// AI answer) or a cited answer through Chat, suggested questions, and how
// a passage and a citation are matched.

import { request } from "./api";
import type { Citation } from "./brain";

/** One passage a search found, ranked, scored against the best (0 to 100). */
export interface Passage {
  rank: number;
  score_pct: number;
  score: number;
  file_id: string;
  title: string;
  loc: string;
  as_of: string;
  text: string;
  url: string;
  source_kind: string;
  authoritative: boolean;
}

export interface SearchResult {
  passages: Passage[];
  /** Pages being indexed again for a new model, not searched this time. */
  reindexing: number;
  /** Connected bases that didn't answer, with why. */
  unreached: string[];
  asks_per_hour: number;
}

const e = encodeURIComponent;

export const kbAsk = {
  search: (kbId: string, query: string, k = 6) =>
    request<SearchResult>(`/api/knowledge/${e(kbId)}/search`, { method: "POST", body: JSON.stringify({ query, k }) }),
  suggestions: (kbId: string) => request<{ questions: string[]; from: "model" | "titles"; built_at: number }>(`/api/knowledge/${e(kbId)}/suggestions`),
};

/** What matches a passage to a citation: its title and its place in the page. */
export function passageKey(p: { title: string; loc: string }): string {
  return `${p.title.trim().toLowerCase()}|${(p.loc ?? "").trim().toLowerCase()}`;
}

/** Each cited passage's label ("S2"), by [`passageKey`], from an answer's citations and their numbers. */
export function citedLabels(citations: Citation[], numberOf: Map<string, number>): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of citations) {
    const n = numberOf.get(c.id);
    if (n !== undefined) out.set(passageKey(c), `S${n}`);
  }
  return out;
}

/** The answer's markers, written as the labels the passages show ("[S2]"). */
export function labelMarkers(markdown: string): string {
  return markdown.replace(/\[(\d+)\]\(#cite-(\d+)\)/g, "[S$1](#cite-$2)");
}

