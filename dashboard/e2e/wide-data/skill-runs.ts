import type { Handler } from "./index";
import { EMAIL, iso, REPO, SENTENCE, TOKEN } from "./long";

// Scheduled skill runs: a schedule whose every field is as long as it gets.

const SKILL = "weekly-traffic-report-for-every-site-with-week-over-week-comparison";
const TOOL = "count_requests_by_user_agent_and_bot_label_over_the_last_seven_days";
const SERVER = "observability-server-connected-with-a-very-long-identifier";

const schedule = {
  id: "01JSCHEDWIDE",
  skill_repo: REPO,
  skill_path: `skills/${SKILL}/SKILL.md`,
  skill_name: SKILL,
  cron: "23 7 * * MON,TUE,WED,THU,FRI",
  timezone: "America/Argentina/ComodRivadavia",
  paused: false,
  tools: [{ name: TOOL, server: `sandbox:${SERVER}`, tool: TOKEN }],
  auto_tools: true,
  stdio: [{ id: SERVER, source: { kind: "git", repo: REPO, commit: "4f1c2a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39" }, command: ["node", "bin/server-mcp.js"], aws_account: "123456789012", env: {} }],
  resolution: {
    at: iso(60),
    tools: [{ name: TOOL, source: `sandbox:${SERVER}`, tool: TOKEN, risk: "read", basis: "model", why: SENTENCE }],
    missing: ["execute_a_query_against_a_service_nobody_connected_with_a_long_name"],
    servers: [],
    problems: [SENTENCE],
  },
  aws: { account: "123456789012", region: "ap-southeast-2", workgroup: TOKEN, max_gb: 30 },
  allow_writes: false,
  state_dirs: ["snapshots-of-every-week-kept-between-runs", TOKEN],
  budget: { max_usd: 5, max_minutes: 30 },
  notify: { chat: "failure", issue_on_failure: true },
  instructions: SENTENCE,
  last_run: { run_id: "01JRUNWIDE", status: "needs_access", at: iso(60) },
  next_run: { at: iso(-600), label: "Mon 30 Nov 07:23 ART" },
};

export const skillRunsData: Handler = ({ method, path }) => {
  if (method !== "GET") return undefined;
  if (path === "/api/skill-runs") return { schedules: [schedule], can_edit: true };
  if (path === "/api/skill-runs/options")
    return {
      skills: [{ repo: REPO, path: schedule.skill_path, name: SKILL, description: SENTENCE, enabled: true }],
      servers: [{ id: SERVER, name: SERVER, kind: "remote" }],
      aws_accounts: ["123456789012"],
    };
  if (path === "/api/skill-runs/01JSCHEDWIDE/runs")
    return {
      runs: [
        { run_id: "01JRUNWIDE", schedule_id: schedule.id, trigger: "manual", requested_by: EMAIL, status: "needs_access", started_at: iso(62), finished_at: iso(60), summary: SENTENCE, outputs: ["needs-access.md"], report: "", needs_access: [`${TOOL}: ${TOKEN}`], cost_usd: 0, tokens: 0 },
      ],
    };
  return undefined;
};
