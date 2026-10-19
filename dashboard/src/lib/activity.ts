// The access log: every time Coderhelm's agents (or a person trying an agent)
// read a skill, a file kept with it, an agent brief or a command, or asked a
// team agent a question. Names, reasons and outcomes only; never what was
// read or answered.

import type { SkillKind } from "./skills";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.coderhelm.com";

/** "apply": given in full by its "Always apply" setting. "agent_tool": one
 * read-only tool call a team agent made while answering an ask (`file` is the
 * tool, `why` its input). */
export type AccessAction = "read" | "read_file" | "ask" | "apply" | "agent_tool";

export interface SkillAccessEvent {
  id: string;
  at: string;
  repo: string;
  path: string;
  kind: SkillKind;
  name: string;
  action: AccessAction;
  /** For a file read: which file. */
  file: string;
  /** "planner", "coder", "reviewer", or "<email> (try)". */
  by: string;
  /** The work it happened during, e.g. "owner/name#12" or "owner/name · ABC-1". */
  origin: string;
  /** The run it happened during. Empty for a review or a try. */
  run_id: string;
  /** Why, in the reader's words, its question, or the task's title. */
  why: string;
  /** Reads: ok, off, limit, failed. Asks: answered, failed, timed_out, limit, off, pending. */
  outcome: string;
  ask_id: string;
  ms: number;
  cursor: string;
}

export interface ActivitySummary {
  days: number;
  since: string;
  skills: { reads: number; asks: number; read_problems: number; ask_problems: number; applies?: number };
  /** Null for someone who isn't an admin. */
  lookups: { total: number; ok: number; refused: number; failed: number } | null;
}

export interface SkillActivityFilter {
  repo?: string;
  path?: string;
  /** An agent, or "people". */
  by?: string;
  action?: "read" | "ask" | "apply" | "";
  /** An outcome, or "problems". */
  outcome?: string;
  q?: string;
  since?: string;
  until?: string;
}

async function call<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include", cache: "no-store" });
  const text = await res.text().catch(() => "");
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {}
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : `API ${res.status}`);
  return body as T;
}

/** A query string from the set values only. */
export function query(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const activityApi = {
  skills: async (f: SkillActivityFilter, before?: string, limit = 50) => {
    const r = await call<{ events?: SkillAccessEvent[]; next?: string | null }>(
      `/api/skills/activity${query({ ...f, before, limit })}`,
    );
    return { events: Array.isArray(r.events) ? r.events : [], next: r.next ?? null };
  },
  summary: async (days = 7): Promise<ActivitySummary | null> => {
    const r = await call<Partial<ActivitySummary>>(`/api/activity/summary${query({ days })}`);
    return r && r.skills ? (r as ActivitySummary) : null;
  },
};

// ─── Words ─────────────────────────────────────────────────

const AGENTS: Record<string, string> = { planner: "Planner", coder: "Coder", reviewer: "Reviewer", writer: "Writer" };

/** Who did it, in words: "Planner", or a person's email. */
export function readerLabel(by: string): string {
  if (AGENTS[by]) return AGENTS[by];
  return by.endsWith(" (try)") ? by.slice(0, -6) : by;
}

export const isPerson = (by: string) => !AGENTS[by];

type Tone = "neutral" | "success" | "warning" | "error";

/** An outcome as a pill and a plain sentence on what it means. */
export function outcomeOf(e: Pick<SkillAccessEvent, "action" | "outcome">): { tone: Tone; label: string; means: string } {
  const ask = e.action === "ask";
  if (e.action === "agent_tool") {
    switch (e.outcome) {
      case "ok":
        return { tone: "success", label: "Read", means: "The agent read this with one of the tools its own file lists." };
      case "refused":
        return { tone: "warning", label: "Refused", means: "Not one of the tools its file lists, so it didn't run." };
      case "limit":
        return { tone: "warning", label: "Over the limit", means: "The ask had already made its 12 tool calls, so this one didn't run." };
      default:
        return { tone: "error", label: "Failed", means: "The read failed, so the agent answered without it." };
    }
  }
  switch (e.outcome) {
    case "ok":
      return e.action === "apply"
        ? { tone: "success", label: "Applied", means: "Its whole text was in the agent's instructions, set to always apply." }
        : { tone: "success", label: "Read", means: "The agent got the text and used it as guidance." };
    case "answered":
      return { tone: "success", label: "Answered", means: "The agent answered within its limits." };
    case "pending":
      return { tone: "neutral", label: "Waiting", means: "Waiting for the agent's answer." };
    case "off":
      return {
        tone: "warning",
        label: "Switched off",
        means: `It was switched off or removed, so the ${ask ? "question wasn't sent" : "agent didn't get it"}.`,
      };
    case "limit":
      return {
        tone: "warning",
        label: "Over the limit",
        means: ask
          ? "The pass had already asked 3 team agents, so this one wasn't asked."
          : "The pass had already made its 20 reads, so this one was refused.",
      };
    case "timed_out":
      return { tone: "error", label: "Took too long", means: "No answer within 3 minutes, so the asking agent went on without it." };
    default:
      return {
        tone: "error",
        label: ask ? "No answer" : "Failed",
        means: ask
          ? "The model call failed, so the asking agent went on without it."
          : "Coderhelm couldn't read it right then, so the agent went on without it.",
      };
  }
}

/** What happened, as a verb phrase after the reader's name. */
export function actionPhrase(e: Pick<SkillAccessEvent, "action" | "by">): string {
  if (e.action === "ask") return e.by.endsWith(" (try)") ? "tried" : "asked";
  if (e.action === "read_file") return "read a file of";
  if (e.action === "apply") return "was given";
  if (e.action === "agent_tool") return "asked, and a tool ran for";
  return "read";
}

/** Where the work lives: a GitHub link for "owner/name#12", else plain text. */
export function originHref(origin: string): string {
  const m = /^([\w.-]+\/[\w.-]+)#(\d+)$/.exec(origin);
  return m ? `https://github.com/${m[1]}/issues/${m[2]}` : "";
}

export type Range = "24h" | "7d" | "30d" | "all";

export const RANGES: { value: Range; label: string }[] = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "Any time" },
];

/** The start of a range, as RFC 3339, or undefined for any time. */
export function rangeSince(range: Range, now = Date.now()): string | undefined {
  const hours = range === "24h" ? 24 : range === "7d" ? 24 * 7 : range === "30d" ? 24 * 30 : 0;
  return hours ? new Date(now - hours * 3_600_000).toISOString() : undefined;
}

/** "Today", "Yesterday", or a date, for grouping a timeline by day. */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Earlier";
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

/** A clock time for a row, e.g. "14:05". */
export function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
