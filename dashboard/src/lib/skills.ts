// A team's skills, read from a connected repository: written guidance the
// agents can read. Text only; nothing from the repository is ever run.

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.coderhelm.com";

export type SkillKind = "skill" | "agent" | "command";

export interface SkillRepo {
  repo: string;
  added_by: string;
  added_at: string;
  /** The commit last read. Empty before the first sync. */
  sha: string;
  synced_at: string;
  /** Why the last sync failed, or empty. */
  error: string;
  items: number;
  /** What the last sync left out and why. */
  skipped: string[];
}

export interface Skill {
  repo: string;
  path: string;
  kind: SkillKind;
  name: string;
  description: string;
  sha: string;
  hash: string;
  enabled: boolean;
  /** Text files kept next to a skill. */
  files: string[];
  /** Tools its front matter asks for that it won't get. For an agent that's
   * every tool it lists, since team agents answer without tools. */
  missing_tools?: string[];
  uses: number;
  last_used_at: string;
  last_used_by: string;
  updated_at: string;
  /** Questions Coderhelm's agents put to it; an admin's tries not counted. */
  asks: number;
  last_asked_at: string;
  /** Who last flipped its switch, and when. Empty if never. */
  switched_by: string;
  switched_at: string;
  /** How Coderhelm runs it, from its last check. Null before the first. */
  compat?: CompatShort | null;
  /** An admin chose to give agents the translated version. */
  use_translated?: boolean;
  translated_by?: string;
  translated_at?: string;
}

export type CompatStatus = "ready" | "translated" | "needs_tools" | "partial";
/** What a gap offers: a link to connect it, to add credentials, or nothing
 * (the integration is already there, or it can't run in Coderhelm). */
export type CompatAction = "connect" | "credentials" | "none";
export type RequirementStatus = "available" | "translated" | "missing" | "blocked";

/** The short form of an item's last check, as lists get it. */
export interface CompatShort {
  status: CompatStatus | "";
  /** "7 of 10 steps run as written · 2 translated · 1 needs New Relic". */
  summary: string;
  /** What it needs that the team hasn't connected, by name. */
  needs: string[];
  at: string;
  /** Why the last check failed, or empty. */
  error: string;
  /** Whether it was checked against its current text. */
  current: boolean;
}

/** One thing a step relies on, and how Coderhelm covers it. */
export interface Requirement {
  /** What the item asks for, in its words. */
  asks: string;
  kind: "tool" | "command" | "data" | "path" | "other";
  status: RequirementStatus;
  /** Coderhelm tools that do it. */
  uses: string[];
  write: "none" | "repo" | "outside";
  needs: string;
  fix: string;
  connect: "plugins" | "data_sources" | "github" | "none";
  action?: CompatAction;
}

export interface CompatStep {
  title: string;
  does: string;
  requirements: Requirement[];
  /** Left out of the translated version. */
  dropped: boolean;
  status: RequirementStatus;
}

export interface CompatNeed {
  name: string;
  fix: string;
  connect: Requirement["connect"];
  action?: CompatAction;
  status: "missing" | "blocked";
  steps: number;
}

/** An item's full check, as its page gets it. */
export interface Compat extends CompatShort {
  steps?: CompatStep[];
  counts?: { steps: number; as_written: number; translated: number; missing: number; blocked: number };
  needs_detail?: CompatNeed[];
  /** What was fixed up in the model's answer, in plain words. */
  notes?: string[];
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  ms?: number;
}

export interface SkillWithBody extends Skill {
  body: string;
  /** For an agent: the exact instructions it answers under. */
  prompt?: string;
  compat?: Compat | null;
  /** The version rewritten for Coderhelm's tools. Empty before a check. */
  translated?: string;
}

/** One question put to a team agent, and its answer. */
export interface AgentAsk {
  id: string;
  repo: string;
  path: string;
  /** "planner", "coder", "reviewer", or "<email> (try)". */
  by: string;
  /** The work it was asked during, e.g. "owner/name#12". Empty for a try. */
  origin: string;
  /** The run it was asked during. Empty for a try or a review. */
  run_id: string;
  /** The commit of the agent's file that answered. */
  sha: string;
  question: string;
  context_chars: number;
  outcome: "pending" | "answered" | "failed" | "timed_out";
  answer: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  ms: number;
  at: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const text = await res.text().catch(() => "");
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {}
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : `API ${res.status}`);
  return body as T;
}

const repoPath = (repo: string) => repo.split("/").map(encodeURIComponent).join("/");

/** One item in the usage stats. */
export interface SkillUse extends Pick<Skill, "repo" | "path" | "name" | "kind"> {
  reads?: number;
  asks?: number;
  answered?: number;
}

/** How a team's skills and agents were used over the last 30 days. */
export interface SkillStats {
  days_covered: number;
  since: string;
  /** Reads by Coderhelm's agents of a skill, agent brief or command. */
  reads: number;
  /** Questions Coderhelm's agents put to a team agent. Tries not counted. */
  asks: number;
  answered: number;
  no_answer: number;
  /** An admin's tries from an agent's page. */
  tries: number;
  input_tokens: number;
  output_tokens: number;
  median_answer_ms: number | null;
  days: { date: string; reads: number; asks: number; answered: number }[];
  by_reader: { reader: "planner" | "coder" | "reviewer"; reads: number; asks: number }[];
  top: SkillUse[];
  /** Switched on, yet neither read nor asked in the period. */
  unused_count: number;
  unused: SkillUse[];
}

export const skillsApi = {
  list: () => call<{ repos: SkillRepo[]; items: Skill[]; can_manage: boolean }>("/api/skills"),
  stats: () => call<SkillStats>("/api/skills/stats"),
  connect: (repo: string) =>
    call<{ ok: true; repo: string; syncing: boolean }>("/api/skills/repos", { method: "POST", body: JSON.stringify({ repo }) }),
  disconnect: (repo: string) => call<{ ok: true }>(`/api/skills/repos/${repoPath(repo)}`, { method: "DELETE" }),
  sync: (repo: string) => call<{ ok: true; syncing: true }>(`/api/skills/repos/${repoPath(repo)}/sync`, { method: "POST" }),
  item: (repo: string, path: string) =>
    call<SkillWithBody>(`/api/skills/item?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`),
  setEnabled: (repo: string, path: string, enabled: boolean) =>
    call<{ ok: true; enabled: boolean }>("/api/skills/item", { method: "PUT", body: JSON.stringify({ repo, path, enabled }) }),
  asks: (repo: string, path: string) =>
    call<{ asks: AgentAsk[]; tries_per_day: number; tries_left: number }>(`/api/skills/asks?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`),
  ask: (repo: string, path: string, id: string) =>
    call<AgentAsk>(`/api/skills/asks?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}&id=${encodeURIComponent(id)}`),
  runAsks: (runId: string) => call<{ asks: AgentAsk[] }>(`/api/skills/asks?run_id=${encodeURIComponent(runId)}`),
  recheck: (repo: string, path?: string) =>
    call<{ ok: true; checking: true }>("/api/skills/recheck", { method: "POST", body: JSON.stringify({ repo, path: path ?? "" }) }),
  setUseTranslated: (repo: string, path: string, enabled: boolean) =>
    call<{ ok: true; use_translated: boolean }>("/api/skills/translated", { method: "PUT", body: JSON.stringify({ repo, path, enabled }) }),
  tryAgent: (repo: string, path: string, question: string, context: string) =>
    call<{ id: string }>("/api/skills/asks", { method: "POST", body: JSON.stringify({ repo, path, question, context }) }),
};

/** Where an agent's page lives. */
export const agentHref = (s: Pick<Skill, "repo" | "path">) =>
  `/skills/agent?repo=${encodeURIComponent(s.repo)}&path=${encodeURIComponent(s.path)}`;

/** Where a skill's or command's page lives. */
export const itemHref = (s: Pick<Skill, "repo" | "path">) =>
  `/skills/item?repo=${encodeURIComponent(s.repo)}&path=${encodeURIComponent(s.path)}`;

/** Any item's page: agents have their own. */
export const pageHref = (s: Pick<Skill, "repo" | "path" | "kind">) => (s.kind === "agent" ? agentHref(s) : itemHref(s));

/**
 * The settings an agent's brief asks for in its front matter. Coderhelm
 * reads `model` (as a hint for which of the team's models to use) and shows
 * `tools`, which it never gives.
 */
export function briefSettings(body: string): { model: string; tools: string[]; toolsSet: boolean } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body);
  const out = { model: "", tools: [] as string[], toolsSet: false };
  if (!m) return out;
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z_-]+)\s*:\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    const [, key, raw] = kv;
    const value = raw.trim().replace(/^["']|["']$/g, "");
    if (key === "model") out.model = value;
    if (key !== "tools") continue;
    out.toolsSet = true;
    if (value) {
      out.tools = value.replace(/^\[|\]$/g, "").split(",").map((t) => t.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else {
      // A YAML list on the lines below.
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
        out.tools.push(lines[++i].replace(/^\s*-\s+/, "").trim().replace(/^["']|["']$/g, ""));
      }
    }
  }
  return out;
}

/** Which of the team's models an agent runs on, from its brief's hint. */
export const modelFor = (hint: string) => (hint.toLowerCase().includes("opus") ? "heavy" : "primary");

export const KIND_LABEL: Record<SkillKind, string> = {
  skill: "Skills",
  agent: "Agents",
  command: "Commands",
};

/** The name agents ask for, as they see it in their list. */
export function handle(s: Skill, all: Skill[]): string {
  const base = `${s.kind}:${s.name}`;
  const clash = all.filter((o) => o.kind === s.kind && o.name === s.name).length > 1;
  return clash ? `${base}@${s.repo}` : base;
}

/** "3 minutes ago" style, for sync and use times. */
export function ago(iso: string): string {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** A file's text without its front matter, and the front matter alone. */
export function splitFrontMatter(body: string): { front: string; text: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(body);
  return m ? { front: m[1], text: body.slice(m[0].length) } : { front: "", text: body };
}

/** Who asked, in words: "Reviewer", or "admin@x.co (try)". */
export function asker(by: string): string {
  if (by.endsWith(" (try)")) return by.slice(0, -6);
  return by.charAt(0).toUpperCase() + by.slice(1);
}

export const isTry = (a: Pick<AgentAsk, "by">) => a.by.endsWith(" (try)");

/** Where a file is on GitHub at the commit Coderhelm read. */
export const fileUrl = (repo: string, sha: string, path: string) =>
  `https://github.com/${repo}/blob/${sha || "HEAD"}/${path.split("/").map(encodeURIComponent).join("/")}`;

/** A description too thin for Coderhelm's agents to know when to ask. */
export const thinDescription = (d: string) => d.trim().length < 40;
