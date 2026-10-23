// The team page: who is on the team, what each role can do, and the people
// actions (invite, role change, remove, link a GitHub sign-in to a member).

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.coderhelm.com";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const text = await res.text().catch(() => "");
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {}
  if (!res.ok) {
    const msg = typeof body.error === "string" && body.error ? body.error : `The request failed (${res.status}).`;
    throw new Error(msg);
  }
  return body as T;
}

export type SignIn = "email" | "github" | "email_and_github";

export interface Member {
  user_id: string;
  email: string | null;
  name: string | null;
  github_login: string | null;
  github_id: string | null;
  avatar_url: string | null;
  role: string;
  status: "active" | "invited";
  sign_in: SignIn;
  invited_by: string | null;
  last_active_at: string | null;
  updated_at: string | null;
  /** Pending invites only: when it was last sent, when it stops working. */
  invited_at?: string | null;
  invite_expires_at?: string | null;
  invite_expired?: boolean;
  is_self: boolean;
}

export interface RoleInfo {
  key: string;
  label: string;
  level: number;
  summary: string;
  assignable: boolean;
}

export interface Capability {
  key: string;
  label: string;
  min_role: string;
}

/** Served by the gateway from the same table it enforces (permissions.rs). */
export interface Permissions {
  roles: RoleInfo[];
  capabilities: Capability[];
  your_role: string;
  grantable_roles: string[];
  manageable_roles: string[];
  /** Resend or revoke any pending invite, whatever role it offers. */
  can_manage_invites?: boolean;
}

export const teamApi = {
  members: () => request<{ users: Member[] }>("/api/users"),
  permissions: () => request<Permissions>("/api/users/permissions"),
  invite: (email: string, role: string) =>
    request<{ status: "invited" | "active"; user_id: string }>("/api/users/invite", {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),
  setRole: (userId: string, role: string) =>
    request<{ status: string; role: string }>(`/api/users/${encodeURIComponent(userId)}/role`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    }),
  remove: (userId: string) => request<{ status: string }>(`/api/users/${encodeURIComponent(userId)}`, { method: "DELETE" }),
  resend: (userId: string) =>
    request<{ status: string; invited_at?: string; invite_expires_at?: string }>(`/api/users/${encodeURIComponent(userId)}/resend`, {
      method: "POST",
    }),
  linkGithub: (userId: string, githubUserId: string) =>
    request<{ status: string; user_id: string; github_login: string; role: string }>(
      `/api/users/${encodeURIComponent(userId)}/link-github`,
      { method: "POST", body: JSON.stringify({ github_user_id: githubUserId }) },
    ),
};

/**
 * May you resend and revoke pending invites? Admins and owners may, for every
 * invite: an invite is not a seat, so the role it offers doesn't limit who can
 * withdraw it. Falls back to your role when the server doesn't say.
 */
export function canManageInvites(p: Permissions | null): boolean {
  if (!p) return false;
  if (typeof p.can_manage_invites === "boolean") return p.can_manage_invites;
  return (p.roles.find((r) => r.key === p.your_role)?.level ?? 0) >= 3;
}

/** Whether a pending invite has run out, from the server's flag or its expiry date. */
export function isInviteExpired(m: Pick<Member, "status" | "invite_expired" | "invite_expires_at">, now: Date = new Date()): boolean {
  if (m.status !== "invited") return false;
  if (typeof m.invite_expired === "boolean") return m.invite_expired;
  if (!m.invite_expires_at) return false;
  const t = new Date(m.invite_expires_at).getTime();
  return !Number.isNaN(t) && t <= now.getTime();
}

/** A calendar date, like "Jan 31, 2026". */
export function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** The best single label for a person. */
export function displayName(m: Pick<Member, "name" | "email" | "github_login" | "user_id">): string {
  return m.name || m.email || (m.github_login ? `@${m.github_login}` : m.user_id);
}

export function isGithubOnly(m: Member): boolean {
  return m.status === "active" && m.sign_in === "github";
}

/** Email members a GitHub sign-in could be linked into. */
export function isLinkTarget(m: Member): boolean {
  return m.status === "active" && !!m.email && !m.github_id && !m.github_login;
}

/** Roles a capability list is cumulative over, lowest first (assignable ones). */
export function roleLadder(p: Permissions): RoleInfo[] {
  return p.roles.filter((r) => r.assignable).sort((a, b) => a.level - b.level);
}

// ── Duplicate suggestions ──────────────────────────────────────────

export interface LinkSuggestion {
  github: Member;
  person: Member;
  reason: string;
  score: number;
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);

/** How alike a GitHub-only record and an email member look, 0..1, with why. */
export function matchScore(github: Member, person: Member): { score: number; reason: string } {
  const login = squash(github.github_login ?? "");
  if (!login || !person.email) return { score: 0, reason: "" };
  const localRaw = person.email.split("@")[0].split("+")[0];
  const local = squash(localRaw);
  if (local && login === local) return { score: 1, reason: "GitHub username matches their email name" };
  if (github.name && person.name && squash(github.name) === squash(person.name)) {
    return { score: 0.95, reason: "Same name on both" };
  }
  const nameWords = words(person.name || localRaw);
  if (nameWords.length >= 2 && nameWords.every((w) => login.includes(w))) {
    return { score: 0.85, reason: "GitHub username contains their name" };
  }
  if (local.length >= 4 && login.length >= 4 && (login.includes(local) || local.includes(login))) {
    return { score: 0.75, reason: "GitHub username is close to their email name" };
  }
  const long = nameWords.filter((w) => w.length >= 4);
  if (long.some((w) => login.includes(w))) return { score: 0.5, reason: "GitHub username shares part of their name" };
  return { score: 0, reason: "" };
}

/**
 * For each GitHub-sign-in-only record, the email member it most likely is.
 * Suggestions only: an admin confirms every link.
 */
export function linkSuggestions(members: Member[]): LinkSuggestion[] {
  const targets = members.filter(isLinkTarget);
  const out: LinkSuggestion[] = [];
  for (const github of members.filter(isGithubOnly)) {
    let best: LinkSuggestion | null = null;
    for (const person of targets) {
      const { score, reason } = matchScore(github, person);
      if (score >= 0.5 && (!best || score > best.score)) best = { github, person, reason, score };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.score - a.score);
}

/** "3 days ago" style, or a date for anything older than a month. */
export function relativeTime(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const secs = Math.max(0, (now.getTime() - t.getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? "yesterday" : `${days} days ago`;
  return t.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@.]+$/.test(email.trim()) && email.trim().length <= 254;
}
