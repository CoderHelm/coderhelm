// Security fixes: advisories that touch the team's dependencies, whether the
// code reaches the vulnerable part, the fix pull request and its deadline. The
// gateway keeps the rules (coderhelm-platform, /api/security/*); this file is
// the dashboard's half of that contract.

import type { Tone } from "@/components/list/status";
import { request } from "./api";

export type Tier = "P0" | "P1" | "P2" | "P3";
export const TIERS: Tier[] = ["P0", "P1", "P2", "P3"];

export type Verdict = "reachable" | "not_reachable" | "not_loaded" | "unknown" | "pending";
export type FindingStatus = "open" | "fixing" | "pr_open" | "fixed" | "dismissed" | "withdrawn" | "no_fix";
export type OpenPrs = "now" | "hour" | "daily" | "weekly" | "off";

/**
 * The capability that changes the policy, dismisses, reopens and starts a
 * check (admins). Reading the page needs nothing beyond being on the team.
 */
export const SECURITY_ADMIN = "agent_settings";

export interface SecurityOverview {
  enabled: boolean;
  dry_run: boolean;
  counts: {
    open: number;
    p0: number;
    p1: number;
    p2: number;
    p3: number;
    due_7d: number;
    fixed_30d: number;
    dismissed: number;
    noise_removed: number;
  };
  median_hours_to_merge_30d: number | null;
  next_due_at: string | null;
  sources: {
    dependabot: "on" | "off" | "no_permission";
    osv: { synced_at: string | null; mode: "mirror" | "api" };
    kev_synced_at: string | null;
    epss_synced_at: string | null;
  };
  /** The GitHub App lacks "Dependabot alerts: read". */
  permission_missing: boolean;
}

export interface Advisory {
  ids: string[];
  primary: string;
  title: string;
  summary: string;
  cvss: number | null;
  cvss_vector: string | null;
  epss: number | null;
  epss_percentile: number | null;
  /** On CISA's list of known exploited vulnerabilities. */
  kev: boolean;
  kev_due: string | null;
  malware: boolean;
  cwe: string[];
  published_at: string | null;
  urls: string[];
  source: "dependabot" | "osv" | "github_advisory";
}

export interface Finding {
  id: string;
  repo: string;
  manifest: string;
  ecosystem: string;
  package: string;
  version: string;
  fixed_version: string | null;
  advisory: Advisory;
  scope: "runtime" | "dev" | "unknown";
  relation: "direct" | "transitive" | "unknown";
  path: string[];
  verdict: Verdict;
  evidence: {
    summary: string;
    lines: { file: string; line: number; text: string }[];
    checked: string;
    confidence: "high" | "medium" | "low";
  } | null;
  tier: Tier;
  due_at: string;
  status: FindingStatus;
  pr: { number: number; url: string; ci: "pending" | "passing" | "failing" | null; state: "open" | "merged" | "closed"; adopted: boolean } | null;
  dependabot_alert: { number: number; url: string } | null;
  dismissed: { by: string; reason: string; until: string | null; at: string } | null;
  first_seen_at: string;
  updated_at: string;
}

export interface TimelineEvent {
  at: string;
  text: string;
  link: string | null;
}

export interface IgnoreRule {
  advisory: string;
  repo: string | null;
  reason: string;
  until: string;
  by: string;
}

export interface SecurityConfig {
  enabled: boolean;
  dry_run: boolean;
  open_prs: Record<Tier, OpenPrs>;
  post_alerts: Record<Tier, boolean>;
  escalate_half: boolean;
  due_days: Record<Tier, number>;
  use_kev_due: boolean;
  labels: string[];
  severity_labels: boolean;
  reachability_labels: boolean;
  ecosystem_labels: boolean;
  major_bumps: "fix_in_pr" | "issue_only";
  adopt_bot_prs: boolean;
  repos: "all" | string[];
  ignore: IgnoreRule[];
}

/** The defaults the gateway starts a team with: off, with dry run on. */
export const SECURITY_DEFAULTS: SecurityConfig = {
  enabled: false,
  dry_run: true,
  open_prs: { P0: "now", P1: "hour", P2: "daily", P3: "weekly" },
  post_alerts: { P0: true, P1: true, P2: false, P3: false },
  escalate_half: true,
  due_days: { P0: 3, P1: 7, P2: 30, P3: 90 },
  use_kev_due: true,
  labels: ["security", "dependencies"],
  severity_labels: true,
  reachability_labels: true,
  ecosystem_labels: true,
  major_bumps: "fix_in_pr",
  adopt_bot_prs: true,
  repos: "all",
  ignore: [],
};

export interface PreviewItem {
  finding_id: string;
  repo: string;
  title: string;
  tier: Tier;
}

export interface SecurityPreview {
  would_open: PreviewItem[];
  would_post: PreviewItem[];
}

export interface FindingFilter {
  status: "open" | "fixed" | "dismissed" | "all";
  tier?: Tier | "";
  repo?: string;
  cursor?: string;
}

// ── Reply checks ────────────────────────────────────────────────────────
// A reply missing the parts a page reads (an older server, a proxy's error
// page) is an error the page can show, never a crash.

export const SHAPE_ERROR = "Coderhelm's server answered in a form this page can't read. Update the install, then reload.";
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const fail = (): never => {
  throw new Error(SHAPE_ERROR);
};

export function checkOverview(r: unknown): SecurityOverview {
  if (!isObj(r) || typeof r.enabled !== "boolean" || !isObj(r.counts) || typeof r.counts.open !== "number") fail();
  const o = r as Record<string, unknown>;
  return {
    ...(o as unknown as SecurityOverview),
    sources: isObj(o.sources) ? (o.sources as unknown as SecurityOverview["sources"]) : { dependabot: "off", osv: { synced_at: null, mode: "api" }, kev_synced_at: null, epss_synced_at: null },
    permission_missing: o.permission_missing === true,
  };
}

function checkOneFinding(f: unknown): Finding {
  if (!isObj(f) || typeof f.id !== "string" || typeof f.repo !== "string" || typeof f.package !== "string" || !isObj(f.advisory) || !Array.isArray(f.advisory.ids)) fail();
  return f as unknown as Finding;
}

export function checkFindings(r: unknown): { findings: Finding[]; next_cursor: string | null } {
  if (!isObj(r) || !Array.isArray(r.findings)) fail();
  const o = r as Record<string, unknown>;
  return { findings: (o.findings as unknown[]).map(checkOneFinding), next_cursor: typeof o.next_cursor === "string" && o.next_cursor ? o.next_cursor : null };
}

export function checkFindingDetail(r: unknown): { finding: Finding; timeline: TimelineEvent[] } {
  if (!isObj(r) || !Array.isArray(r.timeline)) fail();
  const o = r as Record<string, unknown>;
  return { finding: checkOneFinding(o.finding), timeline: o.timeline as TimelineEvent[] };
}

function checkConfigShape(c: unknown): SecurityConfig {
  if (!isObj(c) || typeof c.enabled !== "boolean" || !isObj(c.open_prs) || !isObj(c.due_days) || !isObj(c.post_alerts) || !Array.isArray(c.labels) || !Array.isArray(c.ignore)) fail();
  const o = c as Record<string, unknown>;
  if (o.repos !== "all" && !Array.isArray(o.repos)) fail();
  return { ...SECURITY_DEFAULTS, ...(o as unknown as SecurityConfig) };
}

export function checkConfig(r: unknown): { config: SecurityConfig; defaults: SecurityConfig } {
  if (!isObj(r)) fail();
  const o = r as Record<string, unknown>;
  return { config: checkConfigShape(o.config), defaults: o.defaults === undefined ? SECURITY_DEFAULTS : checkConfigShape(o.defaults) };
}

export function checkPreview(r: unknown): SecurityPreview {
  if (!isObj(r) || !Array.isArray(r.would_open) || !Array.isArray(r.would_post)) fail();
  return r as unknown as SecurityPreview;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export function findingsQuery(f: FindingFilter): string {
  const q = new URLSearchParams({ status: f.status });
  if (f.tier) q.set("tier", f.tier);
  if (f.repo) q.set("repo", f.repo);
  if (f.cursor) q.set("cursor", f.cursor);
  return q.toString();
}

export const securityApi = {
  overview: () => request<unknown>("/api/security/overview").then(checkOverview),
  findings: (f: FindingFilter) => request<unknown>(`/api/security/findings?${findingsQuery(f)}`).then(checkFindings),
  finding: (id: string) => request<unknown>(`/api/security/findings/${encodeURIComponent(id)}`).then(checkFindingDetail),
  dismiss: (id: string, body: { reason: string; until: string | null }) =>
    request<unknown>(`/api/security/findings/${encodeURIComponent(id)}/dismiss`, json("POST", body)),
  reopen: (id: string) => request<unknown>(`/api/security/findings/${encodeURIComponent(id)}/reopen`, json("POST")),
  scan: (repo: string | null) => request<{ status: string }>("/api/security/scan", json("POST", { repo })),
  config: () => request<unknown>("/api/security/config").then(checkConfig),
  saveConfig: (config: SecurityConfig) => request<unknown>("/api/security/config", json("PUT", config)),
  preview: () => request<unknown>("/api/security/preview").then(checkPreview),
};

// ── Words and colours ───────────────────────────────────────────────────
// Severity uses the list tones, so P0 is the same red as a critical log
// finding and a failed alert.

export const TIER_LOOK: Record<Tier, { tone: Tone; words: string }> = {
  P0: { tone: "danger", words: "Fix now" },
  P1: { tone: "attention", words: "Fix this week" },
  P2: { tone: "waiting", words: "Fix this month" },
  P3: { tone: "muted", words: "Low" },
};

export const VERDICT_LOOK: Record<Verdict, { tone: Tone; label: string; hover: string }> = {
  reachable: { tone: "danger", label: "Reachable", hover: "Your code calls the vulnerable part of the package." },
  not_reachable: { tone: "waiting", label: "Present, not reachable", hover: "The package is loaded, but nothing calls the vulnerable part." },
  not_loaded: { tone: "muted", label: "Not loaded", hover: "Only used in development or tests, never loaded in production." },
  unknown: { tone: "info", label: "Unknown", hover: "Coderhelm couldn't tell. It treats this as reachable when the service faces the internet." },
  pending: { tone: "queued", label: "Checking", hover: "Coderhelm is reading the code to decide." },
};

export const STATUS_LOOK: Record<FindingStatus, { tone: Tone; label: string }> = {
  open: { tone: "attention", label: "Open" },
  fixing: { tone: "live", label: "Fixing" },
  pr_open: { tone: "waiting", label: "PR open" },
  fixed: { tone: "merged", label: "Fixed" },
  dismissed: { tone: "muted", label: "Dismissed" },
  withdrawn: { tone: "muted", label: "Withdrawn" },
  no_fix: { tone: "neutral", label: "No fix yet" },
};

export const OPEN_PRS_LABEL: Record<OpenPrs, string> = {
  now: "At once",
  hour: "Within the hour",
  daily: "Once a day, grouped",
  weekly: "Once a week, grouped",
  off: "Never",
};

/** A finding that is still waiting on someone: it counts down to its deadline. */
export function isActive(f: Pick<Finding, "status">): boolean {
  return f.status === "open" || f.status === "fixing" || f.status === "pr_open" || f.status === "no_fix";
}

/** "31 h", "5 d", "2 d overdue": the time left before the deadline. */
export function dueIn(iso: string | null | undefined, now = Date.now()): { text: string; overdue: boolean } | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const hours = (t - now) / 3_600_000;
  const span = (h: number) => (h < 48 ? `${Math.max(1, Math.round(h))} h` : `${Math.round(h / 24)} d`);
  return hours < 0 ? { text: `${span(-hours)} overdue`, overdue: true } : { text: span(hours), overdue: false };
}

/** EPSS 0.71 at the 99th percentile: "EPSS 0.71 (99th)". */
export function epssText(epss: number | null | undefined, pct?: number | null): string | null {
  if (typeof epss !== "number") return null;
  const p = typeof pct === "number" ? Math.floor(pct * 100) : null;
  return `EPSS ${epss.toFixed(2)}${p !== null ? ` (${ordinal(p)})` : ""}`;
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

/** The repo's own name, without the owner: "web-app". */
export function repoName(repo: string): string {
  return repo.split("/").pop() || repo;
}

/** Each advisory ID once, the primary first. */
export function advisoryIds(a: Pick<Advisory, "ids" | "primary">): string[] {
  return [...new Set([a.primary, ...a.ids].filter(Boolean))];
}

/** Why a label can't be added, in plain words; null when it can. */
export function labelProblem(label: string, labels: string[]): string | null {
  const l = label.trim();
  if (!l) return "Type a label first.";
  if (l.length > 50) return "A label can be at most 50 characters.";
  if (labels.includes(l)) return `"${l}" is already on the list.`;
  if (labels.length >= 20) return "There can be at most 20 labels.";
  return null;
}

/** Everything wrong with a policy before it is saved, in plain words. */
export function configProblems(c: SecurityConfig, today = new Date().toISOString().slice(0, 10)): string[] {
  const out: string[] = [];
  for (const t of TIERS) {
    const d = c.due_days[t];
    if (!Number.isInteger(d) || d < 1 || d > 365) out.push(`The ${t} deadline must be a whole number of days from 1 to 365.`);
  }
  if (c.labels.length > 20) out.push("There can be at most 20 labels.");
  if (c.labels.some((l) => !l.trim() || l.length > 50)) out.push("Each label must be 1 to 50 characters.");
  if (Array.isArray(c.repos) && c.repos.length === 0) out.push("Pick at least one repo, or choose every repo.");
  c.ignore.forEach((r, i) => {
    const name = r.advisory || `Ignore ${i + 1}`;
    if (!r.advisory.trim()) out.push(`Ignore ${i + 1} needs an advisory ID.`);
    if (!r.reason.trim()) out.push(`${name} needs a reason for ignoring it.`);
    if (!r.until) out.push(`${name} needs an end date.`);
    else if (r.until < today) out.push(`${name} has an end date in the past.`);
  });
  return out;
}
