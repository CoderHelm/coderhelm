// Scheduled skill runs: a team's synced skill run on a schedule or with Run now
// (`/api/skill-runs`, the gateway's routes/skill_runs.rs).

import { request } from "./api";

/** One tool the skill calls, by the name the skill uses, and the connected server that offers it. */
export interface ToolGrant {
  name: string;
  server: string;
  /** The server's own name for it; empty means the same as `name`. */
  tool: string;
  /** An admin vouched that it only reads (its name doesn't say so). */
  reads_only: boolean;
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
  aws: AwsGrant | null;
  allow_writes: boolean;
  state_dirs: string[];
  budget: { max_usd: number; max_minutes: number };
  notify: { chat: "off" | "always" | "failure"; issue_on_failure: boolean };
  instructions: string;
  created_by?: string;
  running?: LastRun | null;
  last_run?: LastRun | null;
  next_run?: { at: string; label: string } | null;
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

export type ScheduleDraft = Omit<SkillSchedule, "id" | "created_by" | "running" | "last_run" | "next_run">;

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
    aws: null,
    allow_writes: false,
    state_dirs: [],
    budget: { max_usd: 5, max_minutes: 30 },
    notify: { chat: "off", issue_on_failure: false },
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
    aws: s.aws ?? null,
    allow_writes: s.allow_writes,
    state_dirs: s.state_dirs ?? [],
    budget: s.budget,
    notify: s.notify,
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
