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
  uses: number;
  last_used_at: string;
  last_used_by: string;
  updated_at: string;
}

export interface SkillWithBody extends Skill {
  body: string;
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

export const skillsApi = {
  list: () => call<{ repos: SkillRepo[]; items: Skill[]; can_manage: boolean }>("/api/skills"),
  connect: (repo: string) =>
    call<{ ok: true; repo: string; syncing: boolean }>("/api/skills/repos", { method: "POST", body: JSON.stringify({ repo }) }),
  disconnect: (repo: string) => call<{ ok: true }>(`/api/skills/repos/${repoPath(repo)}`, { method: "DELETE" }),
  sync: (repo: string) => call<{ ok: true; syncing: true }>(`/api/skills/repos/${repoPath(repo)}/sync`, { method: "POST" }),
  item: (repo: string, path: string) =>
    call<SkillWithBody>(`/api/skills/item?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`),
  setEnabled: (repo: string, path: string, enabled: boolean) =>
    call<{ ok: true; enabled: boolean }>("/api/skills/item", { method: "PUT", body: JSON.stringify({ repo, path, enabled }) }),
};

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
