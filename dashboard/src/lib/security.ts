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
/** How fixes become pull requests: one per repo (the fewest), per repo and ecosystem, or per package. */
export type Bundle = "per_repo" | "per_repo_ecosystem" | "per_package";
/** How a person's picked fixes combine: one PR per repo whatever the policy says, one per package, or as the policy says. */
export type Combine = "one_pr" | "per_package" | "policy";

export const BUNDLE_LABEL: Record<Bundle, string> = {
  per_repo: "One PR per repo (fewest PRs, recommended)",
  per_repo_ecosystem: "One per ecosystem",
  per_package: "One per package",
};

/**
 * The capability that changes the policy, dismisses, reopens and starts a
 * check (admins). Reading the page needs nothing beyond being on the team.
 */
export const SECURITY_ADMIN = "agent_settings";

export interface SecurityOverview {
  enabled: boolean;
  dry_run: boolean;
  /** The policy's pull request choice (older servers: absent, one per package). */
  bundle?: Bundle;
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
  /** The same counts by fix (a package at one version), what the page shows first. */
  groups?: { open: number; p0: number; p1: number; p2: number; p3: number; due_7d: number };
  verdicts?: { settled: number; checking: number };
  sources: {
    dependabot: DependabotAccess;
    dependabot_reason?: string | null;
    osv: { synced_at: string | null; mode: "mirror" | "api" };
    kev_synced_at: string | null;
    epss_synced_at: string | null;
    /** How the repositories' own advisories were last read, with a sentence when the App can't read them (older servers: absent). */
    repository_advisories?: { state: "ok" | "no_permission" | "error" | "unread"; note: string | null };
  };
  /** One row per source, for the Sources panel. */
  source_rows?: SourceRow[];
  /** The dependency inventory per repo. */
  repos?: RepoInventory[];
  spend?: SecuritySpend;
  /** The GitHub App lacks "Dependabot alerts: read", or the organization hasn't accepted it. */
  permission_missing: boolean;
}

export type DependabotAccess = "on" | "off" | "no_permission" | "not_accepted" | "error";

export interface SourceRow {
  id: "dependabot" | "osv" | "github_advisory" | "kev" | "epss";
  name: string;
  gives: string;
  state: "ok" | "error" | "never" | "off" | "needs_permission";
  reason: string;
  synced_at: string | null;
  count: number;
  /** CISA's list: how many vulnerabilities it lists. */
  listed?: number;
  /** The GitHub advisory feed: the hourly poll of GitHub's advisory database. */
  poll?: AdvisoryPoll;
  /** When its last problem cleared (the check passed again), while nothing is wrong now. */
  recovered_at?: string | null;
}

/** The advisory poll's last run, and where it has read to while behind. */
export interface AdvisoryPoll {
  run_at: string | null;
  /** The last read that counted: the last full poll, or the last run while catching up. */
  synced_at: string | null;
  /** The last poll reached the newest advisories. */
  caught_up: boolean;
  /** While behind: the update time of the last advisory read. */
  read_up_to: string | null;
  /** The last run's failure. */
  error: string | null;
}

export interface RepoInventory {
  repo: string;
  packages: number;
  ecosystems: Record<string, number>;
  read_at: string | null;
  /** The branch the list was read from (the default branch). */
  branch?: string | null;
  /** When the list is read again (empty until it was read once). */
  next_read?: string;
  state: "ok" | "graph_off" | "error" | "not_read";
  reason: string;
  /** Packages with a range or partial version, which can't be matched. */
  unpinned: number;
  dependabot: DependabotAccess | null;
  dependabot_reason: string;
  osv_error: string | null;
}

export interface SecuritySpend {
  triage: { packages_today: number; tokens_today: number; tokens_limit: number; tokens_month: number };
  fix: { runs_today: number; runs_limit: number; tokens_today: number; tokens_limit: number; tokens_month: number };
  cards: { today: number; limit: number };
  tokens_month: number;
}

/** One fix: a package at one version, with every advisory the bump clears. */
export interface FindingGroup {
  key: string;
  repo: string;
  ecosystem: string;
  package: string;
  version: string;
  fixed_version: string | null;
  /** Advisories with no fixed version yet. */
  no_fix: number;
  tier: Tier;
  tier_provisional: boolean;
  due_at: string;
  status: FindingStatus;
  verdict: Verdict;
  scope: "runtime" | "dev" | "unknown";
  kev: boolean;
  malware: boolean;
  epss: number | null;
  manifests: string[];
  pr: Finding["pr"];
  /** The fix run working on it, or behind its open pull request (older servers: absent). */
  ticket?: string | null;
  finding_ids: string[];
  advisories: { finding_id: string; primary: string; ids: string[]; title: string; tier: Tier; fixed_version: string | null; status: FindingStatus }[];
  /** Why its fix hasn't started though it's due (a daily limit). */
  waiting: string | null;
  evidence: Finding["evidence"];
}

export interface GroupFilter {
  status: "open" | "fixed" | "dismissed" | "all";
  tier?: Tier | "";
  repo?: string;
  q?: string;
  sort?: "tier" | "due" | "package";
  cursor?: string;
}

export interface SecurityInsights {
  days: { date: string; opened: number; fixed: number; prs_opened: number; prs_merged: number; tokens: number }[];
  totals: { opened: number; fixed: number; prs_opened: number; prs_merged: number; tokens: number; tokens_month: number };
  median_hours_to_fix: Record<Tier, { fixed: number; median_hours: number | null }>;
  fix_tokens_month: number;
  enabled: boolean;
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
  /** Still being checked: the tier may change once the verdict is in. */
  tier_provisional?: boolean;
  waiting?: string | null;
  due_at: string;
  status: FindingStatus;
  pr: {
    number: number;
    url: string;
    ci: "pending" | "passing" | "failing" | null;
    state: "open" | "merged" | "closed";
    adopted: boolean;
    /** Closed without merging: when, and who closed it (a GitHub login, or the person who closed its run). Absent while open, and on older servers. */
    closed_at?: string;
    closed_by?: string;
    /** False when Coderhelm closed it itself. */
    closed_by_person?: boolean;
  } | null;
  dependabot_alert: { number: number; url: string } | null;
  /** A private report against the repository's own code (its advisory is still in triage or draft): never posted or fixed in public (older servers: absent). */
  private_report?: boolean;
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
  /** How fixes become pull requests. */
  bundle: Bundle;
  adopt_bot_prs: boolean;
  repos: "all" | string[];
  ignore: IgnoreRule[];
  /** Model tokens reachability checks may spend a day. */
  triage_tokens_per_day: number;
  /** Fix runs started a day (adopting a bot's PR or opening an issue doesn't count). */
  max_fix_runs_per_day: number;
  /** Model tokens fix runs may spend a day. */
  max_fix_tokens_per_day: number;
  /** Cards posted a day; past it, one digest card. */
  max_cards_per_day: number;
}

/**
 * The defaults the gateway starts a team with: off until turned on, and
 * turned on it opens fix PRs (the recommended choice) within the daily limits.
 */
export const SECURITY_DEFAULTS: SecurityConfig = {
  enabled: false,
  dry_run: false,
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
  bundle: "per_repo",
  adopt_bot_prs: true,
  repos: "all",
  ignore: [],
  triage_tokens_per_day: 400_000,
  max_fix_runs_per_day: 3,
  max_fix_tokens_per_day: 2_000_000,
  max_cards_per_day: 10,
};

/** The most each daily limit may be set to (the gateway refuses more). */
export const LIMIT_MAX = { triage_tokens_per_day: 5_000_000, max_fix_runs_per_day: 20, max_fix_tokens_per_day: 50_000_000, max_cards_per_day: 100 } as const;

export interface PreviewItem {
  finding_id: string;
  repo: string;
  title: string;
  tier: Tier;
  /** Pull requests it would open only. */
  branch?: string;
  labels?: string[];
}

export interface SecurityPreview {
  would_open: PreviewItem[];
  would_post: PreviewItem[];
  /** One entry per pull request (older servers: absent). */
  prs?: PlanUnit[];
  /** New pull requests it would open (fixes that join an open PR don't count). */
  pr_count?: number;
}

/** One package bump in a planned pull request. */
export interface PlanBump {
  package: string;
  from: string;
  to: string;
  major: boolean;
  manifest: string;
  verdict: Verdict;
  tier: Tier | null;
  finding_ids: string[];
  advisories: string[];
}

/** One pull request a request or the policy would open, or the open one it adds to. */
export interface PlanUnit {
  unit: string;
  ticket?: string;
  repo: string;
  title: string;
  branch?: string;
  labels?: string[];
  tier?: Tier | null;
  bundle?: boolean;
  finding_ids: string[];
  advisories?: number;
  majors?: number;
  /** The worst verdict of its bumps: what its reachability label says (older servers: absent). */
  verdict?: Verdict;
  bumps?: PlanBump[];
  /** The open security PR these fixes are added to, instead of a new one. */
  joins?: { number: number; url: string } | null;
  estimated_tokens?: number;
  /** Whether it starts now; when not, `waits` says why (a daily limit: tomorrow). Older servers: absent. */
  starts_now?: boolean;
  waits?: string | null;
  /** One package's name, or "14 packages". */
  package: string;
  from: string;
  to: string;
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

export function checkGroups(r: unknown): { groups: FindingGroup[]; total: number; fixable_total: number | null; next_cursor: string | null } {
  if (!isObj(r) || !Array.isArray(r.groups)) fail();
  const o = r as Record<string, unknown>;
  const groups = (o.groups as unknown[]).map((g) => {
    if (!isObj(g) || typeof g.package !== "string" || typeof g.repo !== "string" || !Array.isArray(g.advisories)) fail();
    return g as unknown as FindingGroup;
  });
  return {
    groups,
    total: typeof o.total === "number" ? o.total : groups.length,
    // Older servers: absent, and "select every fix that matches" isn't offered.
    fixable_total: typeof o.fixable_total === "number" ? o.fixable_total : null,
    next_cursor: typeof o.next_cursor === "string" && o.next_cursor ? o.next_cursor : null,
  };
}

export function checkInsights(r: unknown): SecurityInsights {
  if (!isObj(r) || !Array.isArray(r.days) || !isObj(r.totals) || !isObj(r.median_hours_to_fix)) fail();
  return r as unknown as SecurityInsights;
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

export function groupsQuery(f: GroupFilter): string {
  const q = new URLSearchParams({ status: f.status });
  if (f.tier) q.set("tier", f.tier);
  if (f.repo) q.set("repo", f.repo);
  if (f.q) q.set("q", f.q);
  if (f.sort && f.sort !== "tier") q.set("sort", f.sort);
  if (f.cursor) q.set("cursor", f.cursor);
  return q.toString();
}

/** Finding ids a request names one by one; past it, the request sends the list's filters. */
export const MAX_PICKED_IDS = 200;

/** "Every fix the list's filters match", less the findings in `except_ids`: the server resolves the set. */
export interface FixSelect {
  all: true;
  filters: { status: string; tier: string; repo: string; q: string };
  except_ids: string[];
}

/** What a fix request names: picked findings, or every fix that matches. */
export type FixAsk = { finding_ids: string[] } | { select: FixSelect };

/** A filter selection, as the server resolved it. */
export interface PlanSelection {
  by_filter: boolean;
  fixes: number;
  findings: number;
  matched: number;
  left_fixes: number;
  left_findings: number;
  limit: number;
  /** Set when the request takes only the first part of the selection. */
  note: string | null;
}

export interface FixPlan {
  units: PlanUnit[];
  skipped: { finding_id: string; reason: string; pr_url?: string }[];
  /** Package names of the skipped findings. */
  names?: Record<string, string>;
  /** Units that start now and units that wait (older servers: absent). */
  starting_now?: number;
  waiting?: number;
  selection?: PlanSelection;
  runs_today: number;
  runs_limit: number;
  /** New pull requests (older servers: absent, one per unit). */
  pr_count?: number;
  /** Units added to an open PR. */
  joins?: number;
  tokens_today?: number;
  tokens_limit?: number;
  estimated_tokens?: number;
}

export interface FixResult {
  started: { unit: string; ticket: string; repo: string; package: string; finding_ids: string[]; run_id: string | null; runs_url: string; joins?: number | null }[];
  queued: { unit: string; ticket: string; repo: string; package: string; finding_ids: string[]; reason: string }[];
  skipped: { finding_id: string; reason: string; pr_url?: string }[];
  runs_today: number;
  runs_limit: number;
  selection?: PlanSelection;
}

function checkFixPlan(r: unknown): FixPlan {
  if (!isObj(r) || !Array.isArray(r.units) || !Array.isArray(r.skipped)) fail();
  return r as unknown as FixPlan;
}

function checkFixResult(r: unknown): FixResult {
  if (!isObj(r) || !Array.isArray(r.started) || !Array.isArray(r.queued) || !Array.isArray(r.skipped)) fail();
  return r as unknown as FixResult;
}

/** Why a fix can't be asked for now, in plain words; null when it can. */
export function cannotFix(f: { status: FindingStatus; fixed_version: string | null; pr: Finding["pr"] }): string | null {
  if (f.pr && f.pr.state === "open") return `PR #${f.pr.number} is already open`;
  if (f.status === "fixed") return "Already fixed";
  if (f.status === "dismissed" || f.status === "withdrawn") return "Dismissed";
  if (f.status === "fixing") return "A fix run is already working on it";
  if (!f.fixed_version) return "No fixed version yet";
  return null;
}

/** The runs list, searched for a fix run's ticket. */
export function runsHref(ticket: string): string {
  return `/?q=${encodeURIComponent(ticket)}`;
}

/** "closed by octo on Nov 13": a pull request that closed without merging, with who and when as far as the server knows. */
export function closedWords(pr: NonNullable<Finding["pr"]>): string {
  const who = pr.closed_by_person === false ? "Coderhelm" : pr.closed_by;
  const t = pr.closed_at ? new Date(pr.closed_at).getTime() : NaN;
  const on = Number.isNaN(t) ? "" : ` on ${new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  return `closed${who ? ` by ${who}` : ""}${on}`;
}

/** Why nothing on a page of fixes can be selected, and the next step. */
export interface NoneSelectable {
  /** The reason, a sentence without its full stop: "All 20 are in pull request #412". */
  words: string;
  /** What to do about it. */
  next: string;
  link: { href: string; label: string; external: boolean } | null;
}

/**
 * When no row of `rows` can be selected: why, in plain words, with the next
 * step. Null when the page is empty or at least one row can be selected
 * (the header checkbox then works as usual).
 */
export function whyNoneSelectable(rows: FindingGroup[]): NoneSelectable | null {
  if (rows.length === 0 || rows.some((g) => !cannotFix(g))) return null;
  const n = rows.length;
  const one = n === 1;
  const inPr = rows.filter((g) => g.pr?.state === "open");
  const fixing = rows.filter((g) => g.pr?.state !== "open" && g.status === "fixing");
  const noFix = rows.filter((g) => g.pr?.state !== "open" && g.status !== "fixing" && isActive(g) && !g.fixed_version);
  const done = n - inPr.length - fixing.length - noFix.length;
  const prs = [...new Map(inPr.map((g) => [`${g.repo}#${g.pr!.number}`, g.pr!])).values()];
  const tickets = [...new Set(fixing.map((g) => g.ticket).filter((t): t is string => !!t))];
  const prLink = prs.length === 1 ? { href: prs[0].url, label: `Open pull request #${prs[0].number}`, external: true } : null;
  const runLink = tickets.length === 1 ? { href: runsHref(tickets[0]), label: "See the run", external: false } : null;
  if (inPr.length === n) {
    if (prs.length === 1)
      return {
        words: `${one ? "This fix is" : `All ${n} are`} in pull request #${prs[0].number}`,
        next: `Merge it to fix ${one ? "it" : "them"}, or close it to ask for a new one: ${one ? "it" : "they"} can be selected again once it closes.`,
        link: prLink,
      };
    return {
      words: `All ${n} are in ${prs.length} open pull requests`,
      next: "Each row links to its pull request. A fix can be selected again once its pull request closes.",
      link: null,
    };
  }
  if (fixing.length === n)
    return {
      words: `A fix run is working on ${one ? "this" : "these"}`,
      next: `${one ? "Its" : "Their"} pull request shows here when it opens. Cancel the run to select ${one ? "it" : "them"} again.`,
      link: runLink,
    };
  if (noFix.length === n)
    return {
      words: one ? "This has no fixed version yet" : `None of these ${n} has a fixed version yet`,
      next: "Coderhelm opens the fix when a fixed version is published. There is nothing to select until then.",
      link: null,
    };
  if (done === n)
    return {
      words: one ? "This needs no fix" : `None of these ${n} needs a fix`,
      next: `${one ? "It is" : "They are"} fixed or dismissed already. Show the open findings to select fixes.`,
      link: null,
    };
  const parts = [
    inPr.length > 0 ? `${inPr.length} ${inPr.length === 1 ? "is" : "are"} in ${prs.length === 1 ? `pull request #${prs[0].number}` : "open pull requests"}` : null,
    fixing.length > 0 ? `${fixing.length} ${fixing.length === 1 ? "has" : "have"} a fix run working on ${fixing.length === 1 ? "it" : "them"}` : null,
    noFix.length > 0 ? `${noFix.length} ${noFix.length === 1 ? "has" : "have"} no fixed version yet` : null,
    done > 0 ? `${done} ${done === 1 ? "is" : "are"} fixed or dismissed` : null,
  ].filter(Boolean);
  return {
    words: `None of these ${n} can be selected: ${parts.join(", ")}`,
    next: "Each row says why and links to its pull request or run.",
    link: prLink ?? runLink,
  };
}

export const securityApi = {
  fixPlan: (ask: FixAsk, combine: Combine = "policy") => request<unknown>("/api/security/fix/plan", json("POST", { ...ask, combine })).then(checkFixPlan),
  fix: (ask: FixAsk, raise_limit = false, combine: Combine = "policy") =>
    request<unknown>("/api/security/fix", json("POST", { ...ask, raise_limit, combine })).then(checkFixResult),
  groups: (f: GroupFilter) => request<unknown>(`/api/security/groups?${groupsQuery(f)}`).then(checkGroups),
  insights: (days = 30) => request<unknown>(`/api/security/insights?days=${days}`).then(checkInsights),
  overview: () => request<unknown>("/api/security/overview").then(checkOverview),
  findings: (f: FindingFilter) => request<unknown>(`/api/security/findings?${findingsQuery(f)}`).then(checkFindings),
  finding: (id: string) => request<unknown>(`/api/security/findings/${encodeURIComponent(id)}`).then(checkFindingDetail),
  /** `synced`: the Dependabot alert was dismissed too (the App needs "Dependabot alerts: write"). */
  dismiss: (id: string, body: { reason: string; until: string | null }) =>
    request<{ finding?: Finding; synced?: boolean } | undefined>(`/api/security/findings/${encodeURIComponent(id)}/dismiss`, json("POST", body)),
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
  unknown: { tone: "info", label: "Unknown", hover: "Coderhelm couldn't tell from the code. An unknown verdict is at most P1, and only for a runtime dependency with a high score." },
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

/**
 * How many pull requests picked fixes become: one per repo for one PR (or a
 * policy that bundles per repo), one per repo and ecosystem, or one per
 * package. A pull request lives in one repo, so two repos are two.
 */
export function prCount(chosen: Pick<FindingGroup, "repo" | "ecosystem" | "key">[], how: Combine, bundle: Bundle = "per_package"): number {
  const mode: Bundle = how === "one_pr" ? "per_repo" : how === "per_package" ? "per_package" : bundle;
  const key = (g: Pick<FindingGroup, "repo" | "ecosystem" | "key">) =>
    mode === "per_repo" ? g.repo.toLowerCase() : mode === "per_repo_ecosystem" ? `${g.repo.toLowerCase()}|${g.ecosystem.toLowerCase()}` : `${g.repo.toLowerCase()}|${g.key}`;
  return new Set(chosen.map(key)).size;
}

/** Whether a fix moves to a new major version (its breaking changes may need code changes). */
export function isMajor(from: string, to: string | null): boolean {
  if (!to) return false;
  const major = (v: string) => {
    const parts = v.replace(/^[^0-9]*/, "").split(".").map((p) => parseInt(p, 10) || 0);
    return parts[0] === 0 ? [0, parts[1] ?? 0] : [parts[0], 0];
  };
  const [a, b] = [major(from), major(to)];
  return a[0] !== b[0] || a[1] !== b[1];
}

/** A finding that is still waiting on someone: it counts down to its deadline. */
export function isActive(f: Pick<Finding, "status">): boolean {
  return f.status === "open" || f.status === "fixing" || f.status === "pr_open" || f.status === "no_fix";
}

/** "Nov 14, in 3 days" / "Nov 9, 2 days overdue": the deadline as a date and the time to it. */
export function dueDate(iso: string | null | undefined, now = Date.now()): { date: string; text: string; overdue: boolean; soon: boolean } | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const hours = (t - now) / 3_600_000;
  const date = new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const span = (h: number) => (h < 48 ? `${Math.max(1, Math.round(h))} h` : `${Math.round(h / 24)} days`);
  if (hours < 0) return { date, text: `${span(-hours)} overdue`, overdue: true, soon: false };
  return { date, text: `in ${span(hours)}`, overdue: false, soon: hours < 24 };
}

/** "92k", "2M": tokens in a few characters. */
export function shortTokens(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

/** What the fix is, in a few words: "upgrade to 2.0.8", "no fix yet". */
export function fixWords(g: Pick<FindingGroup, "fixed_version" | "no_fix" | "advisories">): string {
  if (!g.fixed_version) return "no fix yet";
  if (g.no_fix > 0) return `upgrade to ${g.fixed_version} (${g.no_fix} of ${g.advisories.length} have no fix yet)`;
  return `upgrade to ${g.fixed_version}`;
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
  const limit = (v: number, max: number, what: string) => {
    if (!Number.isInteger(v) || v < 0 || v > max) out.push(`${what} must be a whole number from 0 to ${max.toLocaleString()}.`);
  };
  limit(c.max_fix_runs_per_day, LIMIT_MAX.max_fix_runs_per_day, "Fix runs a day");
  limit(c.max_fix_tokens_per_day, LIMIT_MAX.max_fix_tokens_per_day, "Fix run tokens a day");
  limit(c.triage_tokens_per_day, LIMIT_MAX.triage_tokens_per_day, "Reachability check tokens a day");
  limit(c.max_cards_per_day, LIMIT_MAX.max_cards_per_day, "Cards a day");
  c.ignore.forEach((r, i) => {
    const name = r.advisory || `Ignore ${i + 1}`;
    if (!r.advisory.trim()) out.push(`Ignore ${i + 1} needs an advisory ID.`);
    if (!r.reason.trim()) out.push(`${name} needs a reason for ignoring it.`);
    if (!r.until) out.push(`${name} needs an end date.`);
    else if (r.until < today) out.push(`${name} has an end date in the past.`);
  });
  return out;
}
