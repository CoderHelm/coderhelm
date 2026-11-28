// Scheduled skill runs: a team's synced skill run on a schedule or with Run now
// (`/api/skill-runs`, the gateway's routes/skill_runs.rs).

import { request } from "./api";

/** One tool the skill calls, by the name the skill uses, and where it comes from: a connected
 *  server's id, `sandbox:<id>` (a stdio server the run starts in its sandbox) or `coderhelm:<name>`. */
export interface ToolGrant {
  name: string;
  server: string;
  /** The server's own name for it; empty means the same as `name`. */
  tool: string;
  /** An admin's word on its risk, over the server's annotations and the model's reading. */
  risk?: "read" | "write";
  reads_only?: boolean;
  /** Added by hand, not found in the skill. */
  manual?: boolean;
}

/** A stdio MCP server a schedule runs in its sandbox, pinned. */
export interface StdioServer {
  id: string;
  source: { kind: "git"; repo: string; commit: string } | { kind: "npm"; package: string; version: string };
  command: string[];
  aws_account: string;
  env: Record<string, string>;
}

export type RiskBasis = "name" | "annotation" | "model" | "admin" | "unknown";

/** One tool as reading the skill found it. */
export interface ResolvedTool {
  name: string;
  source: string;
  tool: string;
  risk: "read" | "write" | "consequential";
  basis: RiskBasis;
  why: string;
}

/** What reading a skill's tools found. */
export interface Resolution {
  at: string;
  tools: ResolvedTool[];
  missing: string[];
  servers: StdioServer[];
  problems: string[];
  /** The skill's memory folders, read from its text. */
  memory: string[];
}

export interface Draft {
  id: string;
  skill_repo: string;
  skill_path: string;
  skill_name: string;
  resolution: Resolution | null;
  done: boolean;
}

export interface AwsGrant {
  account: string;
  region: string;
  workgroup: string;
  max_gb: number;
}

export interface LastRun {
  run_id: string;
  status: string;
  at: string;
}

export interface SkillSchedule {
  id: string;
  skill_repo: string;
  skill_path: string;
  skill_name: string;
  cron: string;
  timezone: string;
  paused: boolean;
  tools: ToolGrant[];
  auto_tools: boolean;
  stdio: StdioServer[];
  resolution?: Resolution | null;
  aws: AwsGrant | null;
  allow_writes: boolean;
  state_dirs: string[];
  budget: { max_usd: number; max_minutes: number };
  notify: Destinations;
  instructions: string;
  created_by?: string;
  running?: LastRun | null;
  last_run?: LastRun | null;
  next_run?: { at: string; label: string } | null;
}

export type When = "off" | "always" | "failure";

export interface Destinations {
  chat: When;
  issue_on_failure: boolean;
  emails: string[];
  email_on: When;
  jira_ticket: string;
  jira_comment_on: When;
  jira_project: string;
}

export interface SkillRunEntry {
  run_id: string;
  schedule_id: string;
  trigger: "manual" | "schedule";
  requested_by: string;
  status: "queued" | "running" | "completed" | "failed" | "needs_access";
  started_at: string;
  finished_at: string;
  summary: string;
  outputs: string[];
  report: string;
  needs_access: string[];
  cost_usd: number;
  tokens: number;
}

export interface ScheduleOptions {
  skills: { repo: string; path: string; name: string; description: string; enabled: boolean }[];
  servers: { id: string; name: string; kind: string }[];
  aws_accounts: string[];
}

export type ScheduleDraft = Omit<SkillSchedule, "id" | "created_by" | "running" | "last_run" | "next_run" | "resolution">;

export const skillRunsApi = {
  list: () => request<{ schedules: SkillSchedule[]; can_edit: boolean }>("/api/skill-runs"),
  options: () => request<ScheduleOptions>("/api/skill-runs/options"),
  create: (s: ScheduleDraft) =>
    request<{ schedule: SkillSchedule }>("/api/skill-runs", { method: "POST", body: JSON.stringify(s) }),
  update: (id: string, s: ScheduleDraft) =>
    request<{ schedule: SkillSchedule }>(`/api/skill-runs/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(s) }),
  remove: (id: string) => request<{ ok: boolean }>(`/api/skill-runs/${encodeURIComponent(id)}`, { method: "DELETE" }),
  runNow: (id: string) => request<{ run_id: string }>(`/api/skill-runs/${encodeURIComponent(id)}/run`, { method: "POST" }),
  runs: (id: string) => request<{ runs: SkillRunEntry[] }>(`/api/skill-runs/${encodeURIComponent(id)}/runs`),
  /** Reads a skill's tools (the worker answers on the draft). */
  resolve: (skill: { skill_repo: string; skill_path: string; skill_name: string }) =>
    request<{ id: string }>("/api/skill-runs/resolve", { method: "POST", body: JSON.stringify(skill) }),
  resolved: (id: string) => request<{ draft: Draft }>(`/api/skill-runs/resolve/${encodeURIComponent(id)}`),
};

/** The draft of a new schedule: weekly, read-only, in the viewer's time zone. */
export function newDraft(): ScheduleDraft {
  let tz = "UTC";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {}
  return {
    skill_repo: "",
    skill_path: "",
    skill_name: "",
    cron: "0 7 * * MON",
    timezone: tz,
    paused: false,
    tools: [],
    auto_tools: true,
    stdio: [],
    aws: null,
    allow_writes: false,
    state_dirs: [],
    budget: { max_usd: 5, max_minutes: 30 },
    notify: { chat: "off", issue_on_failure: false, emails: [], email_on: "off", jira_ticket: "", jira_comment_on: "off", jira_project: "" },
    instructions: "",
  };
}

export function draftOf(s: SkillSchedule): ScheduleDraft {
  return {
    skill_repo: s.skill_repo,
    skill_path: s.skill_path,
    skill_name: s.skill_name,
    cron: s.cron,
    timezone: s.timezone,
    paused: s.paused,
    tools: s.tools ?? [],
    auto_tools: s.auto_tools ?? true,
    stdio: s.stdio ?? [],
    aws: s.aws ?? null,
    allow_writes: s.allow_writes,
    state_dirs: s.state_dirs ?? [],
    budget: s.budget,
    notify: { ...newDraft().notify, ...s.notify },
    instructions: s.instructions ?? "",
  };
}

export const RUN_STATUS_LABEL: Record<SkillRunEntry["status"], string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  needs_access: "Needs access",
};

/** Where a tool comes from, in a few words. */
export function sourceLabel(source: string, servers: StdioServer[]): string {
  if (source.startsWith("sandbox:")) {
    const id = source.slice("sandbox:".length);
    const s = servers.find((x) => x.id === id);
    if (s?.source.kind === "git") return `${s.source.repo} at ${s.source.commit.slice(0, 7)}, in the run's sandbox`;
    if (s?.source.kind === "npm") return `${s.source.package}@${s.source.version}, in the run's sandbox`;
    return `${id}, in the run's sandbox`;
  }
  if (source.startsWith("coderhelm:")) return `CoderHelm's ${source.slice("coderhelm:".length)} connection`;
  return source;
}

/** How a tool's risk was decided, in a few words. */
export function basisLabel(t: ResolvedTool): string {
  switch (t.basis) {
    case "name":
      return "its name says it sends or deletes";
    case "annotation":
      return "its server says so";
    case "model":
      return t.why ? `read from its description: ${t.why}` : "read from its description";
    case "admin":
      return "an admin said so";
    default:
      return "nothing says it only reads";
  }
}
