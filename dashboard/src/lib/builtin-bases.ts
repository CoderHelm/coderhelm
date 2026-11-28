// The six built-in knowledge bases every team has with nothing to set up:
// Code and docs, Work, Infrastructure, Logs and operations, Security and
// Team knowledge. The gateway keeps the rules (services/gateway/src/bases.rs):
// each base has its own audience, and one decision says who reads what, the
// same for Chat, this page and the AI tools connected to CoderHelm.

import { request } from "./api";

export type BuiltinKey = "code" | "work" | "infra" | "logs" | "security" | "team";

/** The order the bases are shown in. */
export const BUILTIN_ORDER: readonly BuiltinKey[] = ["code", "work", "infra", "logs", "security", "team"];

export interface BuiltinAudience {
  /** Roles that read it; empty: everyone whose role opens what it holds. */
  roles: string[];
  /** People who read it by email, whatever their role. */
  people: string[];
  /** People who connected an AI tool as readers (no account, not a seat) read it. */
  readers: boolean;
  /** Paused: nobody reads it until an admin turns it back on. */
  paused: boolean;
}

export interface BuiltinBase {
  key: BuiltinKey;
  name: string;
  about: string;
  /** The scope a connected AI tool needs to read it ("infra:read"). */
  scope: string;
  builtin: true;
  counts: { label: string; count: number }[];
  /** Everything it holds, counted together. */
  total?: number;
  /** Read live where it lives (GitHub, Jira) rather than from a copy. */
  live?: boolean;
  /** When what it holds last changed; null: not read yet. */
  updated_at: string | null;
  /** When a sync that stopped did (its last sync stopped); null or absent:
   *  none did. `updated_at` still says what it holds. */
  stopped_at?: string | null;
  /** Whether the person looking may read it, and why not. */
  access: { open: boolean; why: string | null };
  audience: BuiltinAudience;
  /** Who reads it, in a few words. */
  audience_label: string;
  /** How access follows GitHub or Jira for this base, when it does. */
  mirroring: string | null;
}

export interface BuiltinList {
  bases: BuiltinBase[];
  readers: { enabled: boolean };
  can_manage: boolean;
}

export interface BaseResult {
  id: string;
  title: string;
  url: string;
  base: string;
  kind: string;
  snippet: string;
  updated_at: string;
}

export interface Withheld {
  count: number;
  by_base: Record<string, number>;
  kinds_not_open_to_you: string[];
  reason: string;
}

export interface BaseSearch {
  results: BaseResult[];
  withheld: Withheld;
  not_read?: { base: string; kind: string; reason: string }[];
  note: string;
}

export interface ShareLink {
  id: string;
  path: string;
  expires_at: string;
}

export interface SharedView {
  id: string;
  base: string;
  base_name: string;
  query: string;
  created_by: string;
  expires_at: string;
  open: boolean;
  why: string | null;
  results: BaseResult[];
  withheld: Withheld | null;
}

/** How long a share link works, in days. */
export const SHARE_DAYS = [1, 7, 30] as const;
export type ShareDays = (typeof SHARE_DAYS)[number];

/** The roles an admin may pick for a base's audience. */
export const AUDIENCE_ROLES: readonly { key: string; label: string }[] = [
  { key: "owner", label: "Owners" },
  { key: "admin", label: "Admins" },
  { key: "member", label: "Members" },
  { key: "viewer", label: "Viewers" },
  { key: "reader", label: "Readers" },
];

const e = encodeURIComponent;
const put = (body: unknown): RequestInit => ({ method: "PUT", body: JSON.stringify(body) });

export const builtinBases = {
  list: () => request<BuiltinList>("/api/knowledge/builtin"),
  update: (key: BuiltinKey, patch: Partial<BuiltinAudience>) => request<BuiltinBase>(`/api/knowledge/builtin/${e(key)}`, put(patch)),
  setReaders: (enabled: boolean) => request<{ enabled: boolean }>("/api/knowledge/readers", put({ enabled })),
  search: (key: BuiltinKey, q: string) => request<BaseSearch>(`/api/knowledge/builtin/${e(key)}/search?q=${e(q)}`),
  share: (base: BuiltinKey, query: string, days: ShareDays) =>
    request<ShareLink>("/api/share", { method: "POST", body: JSON.stringify({ base, query, days }) }),
  shared: (id: string) => request<SharedView>(`/api/share/${e(id)}`),
  unshare: (id: string) => request<{ ok: boolean }>(`/api/share/${e(id)}`, { method: "DELETE" }),
};

/**
 * A count's label for one thing. The gateway sends plural labels ("AWS
 * accounts read", "repositories"); for a count of 1 the noun, the last word
 * that ends in s and isn't all capitals, becomes singular: "1 AWS account read".
 */
export function countLabel(label: string, count: number): string {
  if (count !== 1) return label;
  const words = label.split(" ");
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    if (w.length < 3 || !/s$/.test(w) || /ss$/.test(w) || w === w.toUpperCase()) continue;
    words[i] = /ies$/.test(w) ? `${w.slice(0, -3)}y` : /(ch|sh|x)es$/.test(w) ? w.slice(0, -2) : w.slice(0, -1);
    return words.join(" ");
  }
  return label;
}

/** "412 files, 3 repositories", the largest first as the gateway sends them. */
export function countsLine(counts: BuiltinBase["counts"]): string {
  const shown = counts.filter((c) => c.count > 0);
  if (shown.length === 0) return "Nothing in it yet";
  return shown.map((c) => `${c.count.toLocaleString()} ${countLabel(c.label, c.count)}`).join(", ");
}

/** A count short enough for a stat: 940, 18.3k, 1.3M. */
export function shortCount(n: number): string {
  if (n < 10_000) return n.toLocaleString();
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n).toLowerCase().replace("m", "M").replace("b", "B");
}

/** "1 result", "2 results". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** People typed in a box: one address per line or comma, trimmed, no repeats. */
export function parsePeople(raw: string): string[] {
  const out: string[] = [];
  for (const p of raw.split(/[\s,;]+/)) {
    const v = p.trim().toLowerCase();
    if (v && v.includes("@") && !out.includes(v)) out.push(v);
  }
  return out;
}
