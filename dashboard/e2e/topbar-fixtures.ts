import type { Page, Route } from "@playwright/test";

// A small invented backend for the top bar specs and the before/after
// screenshots: a team called "your-team", a few runs, two reviews and a team
// of five. Anything not listed answers 404, which every page handles.

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

export const RUN_ID = "01RUNDONE000000000000000A";
export const REVIEW_SK = "REVIEW#your-team/web#000130#2026-01-03T10:00:00Z";

const RUN = {
  run_id: RUN_ID,
  status: "completed",
  ticket_source: "github",
  ticket_id: "your-team/web#1234",
  title: "Show the class schedule on the details page",
  repo: "your-team/web",
  branch: "coderhelm/web-1234-class-schedule",
  pr_url: "https://github.com/your-team/web/pull/101",
  pr_number: 101,
  pr_urls: null,
  pr_numbers: null,
  branches: null,
  current_pass: "review",
  tokens_in: 1_250_000,
  tokens_out: 42_000,
  cache_read_tokens: 800_000,
  cache_write_tokens: 12_000,
  cost_usd: 4.2,
  files_modified: ["src/app/classes/schedule-table.tsx", "src/lib/schedule.ts"],
  mcp_servers: [],
  duration_s: 754,
  error: null,
  created_at: iso(30),
  updated_at: iso(10),
  pass_history: [
    { pass: "triage", started_at: iso(30) },
    { pass: "plan", started_at: iso(28) },
    { pass: "implement", started_at: iso(25) },
    { pass: "test", started_at: iso(18) },
    { pass: "pr", started_at: iso(14) },
    { pass: "review", started_at: iso(12) },
  ],
  progress_notes: [{ message: "Read src/lib/schedule.ts", timestamp: iso(24) }],
};

const RUNS = [
  { run_id: RUN_ID, status: "completed", ticket_id: "WEB-1234", title: RUN.title, repo: "your-team/web", created_at: iso(30), duration_s: 754 },
  { run_id: "01RUN00000000000000000003", status: "needs_input", ticket_id: "WEB-12", title: "Add a waitlist badge to full classes", repo: "your-team/web", created_at: iso(65), duration_s: 300 },
  { run_id: "01RUN00000000000000000002", status: "failed", ticket_id: "API-7", title: "Retry the sync job once when the upstream times out", repo: "your-team/api", created_at: iso(200), duration_s: 42 },
  { run_id: "01RUN00000000000000000001", status: "merged", ticket_id: "API-6", title: "Log the second failure of the nightly import", repo: "your-team/api", created_at: iso(900), duration_s: 4000 },
];

const REVIEW = {
  sk: REVIEW_SK,
  repo: "your-team/web",
  pr_number: 130,
  pr_title: "Retry a checkout once when the payment service is slow",
  head_sha: "1c9bba5d00d1e2f3",
  verdict: "REQUEST_CHANGES",
  risk: "MEDIUM",
  posted_as: "COMMENT",
  trigger: "synchronize",
  action_summary: "",
  thumbs_up: 0,
  thumbs_down: 0,
  rating_comments: [],
  created_at: iso(5),
  body: "The retry change is close, but one call can now run twice.",
  findings: [
    { severity: "high", kind: "concern", blocks: true, file: "src/app/checkout/page.tsx", line: 84, title: "Payment can be sent twice", body: "`submitOrder` runs again when the retry fires after a slow first answer." },
    { severity: "low", kind: "concern", blocks: false, file: "src/lib/retry.ts", line: 12, title: "The backoff never grows", body: "`delay` is set once, outside the loop." },
  ],
};

export const ROLES = [
  { key: "viewer", label: "Viewer", level: 0, summary: "Read-only: sees runs, plans, reviews and settings, changes nothing.", assignable: true },
  { key: "member", label: "Member", level: 1, summary: "Works with Coderhelm: plans, runs, reviews and recommendations.", assignable: true },
  { key: "billing", label: "Billing", level: 2, summary: "Older role with the same access as Member.", assignable: false },
  { key: "admin", label: "Admin", level: 3, summary: "Runs the workspace: repos, integrations, agent settings, the token limit and people.", assignable: true },
  { key: "owner", label: "Owner", level: 4, summary: "Everything, plus account-level changes and managing admins.", assignable: true },
];

/** The gateway's capability table as it reads today (labels shortened nowhere). */
export const CAPABILITIES = [
  { key: "view", label: "See and search runs, plans, reviews, analytics, repos, tests and settings", min_role: "viewer" },
  { key: "view_team", label: "See who is on the team", min_role: "viewer" },
  { key: "own_account", label: "Manage your own password, two-factor and notifications", min_role: "viewer" },
  { key: "plans", label: "Create, edit, approve and run plans and templates", min_role: "member" },
  { key: "runs", label: "Retry, re-run, re-review or cancel runs", min_role: "member" },
  { key: "reviews", label: "Ask for a re-review, rate reviews, send release notes and release now", min_role: "member" },
  { key: "recommendations", label: "Turn recommendations into plans or dismiss them", min_role: "member" },
  { key: "view_alerts", label: "See alerts and where they are routed", min_role: "member" },
  { key: "view_integrations", label: "See integrations, what each can do and whether it works", min_role: "member" },
  { key: "people", label: "Invite people, resend or revoke any pending invite, link GitHub accounts, and change or remove members and viewers", min_role: "admin" },
  { key: "delete_plans", label: "Delete plans", min_role: "admin" },
  { key: "repos", label: "Manage repositories: sync, turn on, roles, code graph and infrastructure scans", min_role: "admin" },
  { key: "agent_settings", label: "Edit instructions, rules, voice, agent context, workflow, git conventions and reviewer settings, and remove what the reviewer learned", min_role: "admin" },
  { key: "memory", label: "Add, edit and delete team memory", min_role: "admin" },
  { key: "integrations", label: "Connect GitHub, Jira, AWS accounts, monitoring and docs tools, Teams and MCP servers, and choose what each may do", min_role: "admin" },
  { key: "data_sources", label: "Manage data sources, team tools and skills", min_role: "admin" },
  { key: "tests", label: "Change test settings; quarantine, pin and fix tests", min_role: "admin" },
  { key: "alerts", label: "Configure alert routes, the alert budget and alert notifications", min_role: "admin" },
  { key: "model_provider", label: "See and change the model provider key", min_role: "admin" },
  { key: "system", label: "See system health and retry or clear failed events", min_role: "admin" },
  { key: "budget", label: "Set the monthly token limit", min_role: "admin" },
  { key: "manage_admins", label: "Make someone an admin or owner, and change or remove admins and owners", min_role: "owner" },
  { key: "team_name", label: "Rename the team", min_role: "owner" },
  { key: "disconnect", label: "Remove the Jira integration or the model provider key", min_role: "owner" },
  { key: "reset", label: "Reset account data", min_role: "owner" },
];

const LEVEL: Record<string, number> = { viewer: 0, member: 1, billing: 2, admin: 3, owner: 4 };

function person(id: string, name: string, email: string, role: string, self = false) {
  return {
    user_id: id, email, name, github_login: null, github_id: null, avatar_url: null, role, status: "active",
    sign_in: "email", invited_by: null, last_active_at: iso(60 * 24), updated_at: iso(60 * 24 * 3), is_self: self,
  };
}

export interface DemoOptions {
  role?: string;
  capabilities?: { key: string; label: string; min_role: string }[];
}

export async function mockDemoApi(page: Page, opts: DemoOptions = {}) {
  const role = opts.role ?? "admin";
  const caps = opts.capabilities ?? CAPABILITIES;
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    if (p === "/api/me") return json(route, { user_id: "u_self", team_id: "t_1", github_login: "dana-dev", email: "dana@example.com", avatar_url: "", role, mfa_enabled: false });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 1_200_000, tokens_in: 0, tokens_out: 0, total_runs: 4, max_tokens: 10_000_000 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/support/badge") return json(route, { waiting: 0, queue_open: null });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "your-team/web", enabled: true, ticket_source: "github" }, { name: "your-team/api", enabled: true, ticket_source: "github" }] });
    if (p === "/api/runs") return json(route, { runs: RUNS, next: null });
    const run = p.match(/^\/api\/runs\/([^/]+)(\/.*)?$/);
    if (run) {
      const sub = run[2] ?? "";
      if (sub === "") return json(route, RUN);
      if (sub === "/traces") return json(route, { traces: [] });
      if (sub === "/openspec") return json(route, { design: "", spec: "", tasks: "" });
      if (sub === "/agent-log") return json(route, { passes: [], live_events: [] });
    }
    if (p === "/api/skills/asks") return json(route, { asks: [] });
    if (p === "/api/skills/used") return json(route, { skills: [], agents: [], sources: [], standards: [] });
    if (p === "/api/reviewer/review") return json(route, REVIEW);
    if (p === "/api/reviewer/reviews") return json(route, { reviews: [REVIEW], next: null });
    if (p === "/api/reviewer/live") return json(route, { prs: [] });
    if (p === "/api/users") {
      return json(route, {
        users: [
          person("u_owner", "Olivia Owner", "olivia@example.com", "owner"),
          person("u_self", "Dana Dev", "dana@example.com", role, true),
          person("u_sam", "Sam Rivera", "sam@example.com", "member"),
          person("u_mia", "Mia Member", "mia@example.com", "member"),
          person("u_jo", "Jo Viewer", "jo@example.com", "viewer"),
        ],
      });
    }
    if (p === "/api/users/permissions") {
      const can = (target: string) => LEVEL[role] >= 4 || (LEVEL[role] >= 3 && LEVEL[target] <= 2);
      return json(route, {
        roles: ROLES,
        capabilities: caps,
        your_role: role,
        grantable_roles: ROLES.filter((r) => r.assignable && can(r.key)).map((r) => r.key),
        manageable_roles: ROLES.filter((r) => can(r.key)).map((r) => r.key),
        can_manage_invites: LEVEL[role] >= 3,
      });
    }
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
}
