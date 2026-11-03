// The platform admin page's list logic, kept out of the page so it reads
// plainly: which organisations and teams a filter shows, and how they sort.

import type { AdminOrg, AdminTeam, AdminTeamLink, BetaSignup, BetaSignupStatus } from "./api";

/** One day of new teams, oldest first: the open beta's sign-ups at a glance. */
export interface DayCount {
  day: string;
  count: number;
}

/** New teams per UTC day for the last `days` days (today included), from every team's `created_at`. */
export function teamsPerDay(orgs: AdminOrg[], days: number, now: Date = new Date()): DayCount[] {
  const out: DayCount[] = [];
  const index = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const day = d.toISOString().slice(0, 10);
    index.set(day, out.length);
    out.push({ day, count: 0 });
  }
  for (const o of orgs) {
    for (const t of o.teams) {
      const at = index.get((t.created_at || "").slice(0, 10));
      if (at !== undefined) out[at].count += 1;
    }
  }
  return out;
}

export type TeamFilter = "active" | "inactive" | "all";

export const TEAM_SORTS = [
  { value: "busy", label: "Busiest this month" },
  { value: "total", label: "Most runs all time" },
  { value: "recent", label: "Last active" },
  { value: "new", label: "Newest" },
  { value: "name", label: "Name" },
];

/** Why a team sits under its organisation, in words. */
export const LINK_WORDS: Record<AdminTeamLink, string> = {
  main: "Main team",
  github: "Same GitHub installation",
  jira: "Same Jira site",
  member: "Shares a member",
  domain: "Same email domain",
};

export function words(q: string): string[] {
  return q.toLowerCase().split(/\s+/).filter(Boolean);
}

function teamText(t: AdminTeam): string {
  return `${t.name} ${t.team_id} ${t.github_org} ${t.jira_site}`.toLowerCase();
}

export function orgName(o: AdminOrg): string {
  return o.label || o.teams[0]?.name || o.domain || "(no name)";
}

export function teamName(t: AdminTeam): string {
  return t.name || (t.personal ? "Personal workspace" : "(no name)");
}

/**
 * The organisations a search and filter show, each with only the teams that
 * match. An organisation whose own name matches keeps all its teams that
 * pass the filter.
 */
export function filterOrgs(orgs: AdminOrg[], q: string, filter: TeamFilter): AdminOrg[] {
  const w = words(q);
  const passes = (t: AdminTeam) => filter === "all" || (filter === "active") === t.active;
  const out: AdminOrg[] = [];
  for (const o of orgs) {
    const orgHit = w.length > 0 && w.every((x) => `${o.label} ${o.domain}`.toLowerCase().includes(x));
    const teams = o.teams.filter((t) => passes(t) && (orgHit || w.every((x) => teamText(t).includes(x))));
    if (teams.length > 0) out.push({ ...o, teams });
  }
  return out;
}

/** Teams counted per filter, for the toolbar, after the search. */
export function teamCounts(orgs: AdminOrg[], q: string): Record<TeamFilter, number> {
  const count = (f: TeamFilter) => filterOrgs(orgs, q, f).reduce((n, o) => n + o.teams.length, 0);
  return { active: count("active"), inactive: count("inactive"), all: count("all") };
}

export function sortOrgs(orgs: AdminOrg[], sort: string): AdminOrg[] {
  const out = [...orgs];
  const busy = (o: AdminOrg) => o.runs_month + o.reviews_month;
  if (sort === "total") out.sort((a, b) => b.runs_total + b.reviews_total - (a.runs_total + a.reviews_total));
  else if (sort === "recent") out.sort((a, b) => (b.last_active_at || "").localeCompare(a.last_active_at || ""));
  else if (sort === "new") out.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  else if (sort === "name") out.sort((a, b) => orgName(a).localeCompare(orgName(b)));
  else out.sort((a, b) => busy(b) - busy(a) || b.runs_total - a.runs_total);
  return out;
}

export type SignupFilter = BetaSignupStatus | "all";

export function filterSignups(signups: BetaSignup[], q: string, status: SignupFilter, sort: string): BetaSignup[] {
  const w = words(q);
  const out = signups.filter(
    (s) =>
      (status === "all" || s.status === status) &&
      w.every((x) => `${s.email} ${s.company} ${s.domain} ${s.reason}`.toLowerCase().includes(x)),
  );
  out.sort((a, b) =>
    sort === "old" ? (a.created_at || "").localeCompare(b.created_at || "") : (b.created_at || "").localeCompare(a.created_at || ""),
  );
  return out;
}
