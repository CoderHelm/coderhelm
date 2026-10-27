import { expect, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { permissionsView } from "./aws-permissions-data";

// One mocked backend for the settings pages in settings-pages.spec.ts. Every
// API call is answered here; nothing reaches a real backend. All names,
// accounts and addresses are made up.

export const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

export type Role = "viewer" | "member" | "admin" | "owner";
const LEVEL: Record<Role, number> = { viewer: 0, member: 1, admin: 3, owner: 4 };

export const ACCOUNT = "123456789012";
export const ROLE_ARN = `arn:aws:iam::${ACCOUNT}:role/CoderHelmLogReader`;
export const TOPIC = `arn:aws:sns:us-east-1:${ACCOUNT}:prod-alarms`;
export const TEAMS_HINT = "example.environment.api.powerplatform.com …ab12";
export const SLACK_HOOK = "https://hooks.slack.com/services/T0EXAMPLE/B0EXAMPLE/abcdefghijklmnop";
export const WEB = "your-team/web";
export const API = "your-team/api";
const NO_HOOKS = { teams: { set: false, hint: "" }, slack: { set: false, hint: "" } };
const GIT_DEFAULTS = { branch: "coderhelm/{ticket_lower}", commit: "{ticket}: {title}", pr_title: "{ticket}: {title}" };

const MIN = 60_000;
export const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

export interface Call {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

export interface Backend {
  role: Role;
  authProvider: string;
  mfa: boolean;
  fail: Set<string>;
  workflow: { commit_openspec: boolean; default_destination: "github" | "jira"; allow_plan_log_analyzer: boolean };
  git: { branch: string; commit: string; pr_title: string };
  jiraReady: boolean;
  awsActive: boolean;
  rules: Record<string, string[]>;
  voice: Record<string, string>;
  instructions: Record<string, string>;
  agents: Record<string, string>;
  repos: { name: string; enabled: boolean; onboard_status?: string; onboard_error?: string }[];
  connections: Record<string, unknown>[];
  routes: Record<string, unknown>[];
  jiraConfig: Record<string, unknown>;
  calls: Call[];
}

function abilities() {
  return {
    account: ACCOUNT, region: "us-east-1", role: "CoderHelmLogReader", status: "active", checked_at: ago(3 * MIN), check_error: "",
    logs: { available: true, on: true },
    metrics: { available: true, on: true, switched_off: false },
    airflow: { available: true, on: true, switched_off: false, found: ["prod-airflow", "staging-airflow"], skipped: [], environments: ["prod-airflow", "staging-airflow"] },
    missing: [], update_url: null, stack_name: "CoderHelmLogReaderOps",
  };
}

export function connection(over: Record<string, unknown> = {}) {
  return {
    connection_id: ACCOUNT, role_arn: ROLE_ARN, external_id: "1b4e28ba-2fa1-11d2-883f-0016d3cca427", region: "us-east-1", status: "active",
    log_groups: ["/ecs/api"], last_analyzed_at: ago(40 * MIN), created_at: ago(9 * 86_400_000), updated_at: ago(2 * 86_400_000),
    abilities: abilities(), ...over,
  };
}

export function alertRoute(over: Record<string, unknown> = {}) {
  return {
    topic_arn: TOPIC, enabled: true, notify_mode: "team", post_recoveries: true,
    rules: [
      { id: "r1", alarms: ["prod-api-5xx"], terms: [], repo: "your-team/api", instructions: "Roll back the last deploy." },
      { id: "r2", alarms: [], terms: ["disk full"], repo: "your-team/infra", instructions: "" },
    ],
    ...over,
  };
}

const ALERTS = [
  { id: "01JA0000000000000000000003", received_at: ago(50 * MIN), topic_arn: TOPIC, repo: "your-team/api", kind: "cloudwatch_alarm", title: "ALARM: prod-api-5xx", outcome: "run_started", ticket_id: "ALERT-API5XX" },
  { id: "01JA0000000000000000000002", received_at: ago(70 * MIN), topic_arn: TOPIC, repo: "", kind: "message", title: "nightly load failed", outcome: "notified", ticket_id: "ALERT-NIGHTLY" },
];

export async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = {
    role: "admin",
    authProvider: "email",
    mfa: false,
    fail: new Set(),
    workflow: { commit_openspec: false, default_destination: "github", allow_plan_log_analyzer: false },
    git: { branch: "", commit: "", pr_title: "" },
    jiraReady: true,
    awsActive: true,
    rules: { global: ["Never edit generated files under src/gen"], [WEB]: ["Keep bundle size under 300 KB"] },
    voice: { global: "Short sentences. No emoji.", [WEB]: "Explain UI changes with before and after." },
    instructions: { global: "Prefer named exports.", [WEB]: "" },
    agents: { global: "", [WEB]: "A Next.js app with Playwright tests." },
    repos: [
      { name: WEB, enabled: true, onboard_status: "done" },
      { name: API, enabled: true, onboard_status: "done" },
    ],
    connections: [connection()],
    routes: [alertRoute()],
    jiraConfig: {
      default_project: "WEB", trigger_label: "coderhelm", list_projects_url: "https://forge.example/list", create_ticket_url: "https://forge.example/create",
      add_comment_url: "https://forge.example/comment", site_url: "https://your-team.atlassian.net",
      projects: [
        { key: "WEB", name: "Website", enabled: true, repo: "" },
        { key: "OPS", name: "Operations", enabled: false, repo: "" },
      ],
    },
    calls: [],
    ...init,
  };
  const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const ok = (r: Route) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  const at = (min: Role) => LEVEL[db.role] >= LEVEL[min];
  await page.route((url) => url.hostname !== "localhost", (r) => r.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (r) => {
    const req = r.request();
    const url = new URL(req.url());
    const p = decodeURIComponent(url.pathname);
    const method = req.method();
    let body: Record<string, unknown> | null = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    db.calls.push({ method, path: p + url.search, body });
    if (db.fail.has(p)) return json(r, { error: "Server error" }, 500);

    if (p === "/api/me") return json(r, { user_id: "u_1", team_id: "t_1", github_login: null, email: "person@example.com", avatar_url: "", role: db.role, auth_provider: db.authProvider, mfa_enabled: db.mfa });
    if (p === "/api/usage") return json(r, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(r, { banners: [] });
    if (p === "/api/integrations") return json(r, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/teams") return json(r, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(r, { repos: db.repos });

    // Workflow
    if (p === "/api/settings/workflow" && method === "GET") return json(r, db.workflow);
    if (p === "/api/settings/workflow" && method === "PUT") { db.workflow = body as Backend["workflow"]; return ok(r); }
    if (p === "/api/settings/git-conventions" && method === "GET") return json(r, { ...db.git, defaults: GIT_DEFAULTS, tokens: ["ticket", "ticket_lower", "slug", "summary", "title"] });
    if (p === "/api/settings/git-conventions" && method === "PUT") {
      const next = body as Backend["git"];
      if (next.branch.includes("@{")) return json(r, { error: "That isn't a valid git branch name.", field: "branch" }, 400);
      db.git = next;
      return json(r, { ...db.git, defaults: GIT_DEFAULTS, tokens: [] });
    }

    // Guardrails, voice, instructions
    const scoped = p.match(/^\/api\/(rules|voice|instructions|agents)\/(global|repo\/(.+))$/);
    if (scoped) {
      const [, kind, , repo] = scoped;
      const key = repo ?? "global";
      if (kind === "rules") {
        if (method === "PUT") db.rules[key] = (body as { rules: string[] }).rules;
        return method === "PUT" ? ok(r) : json(r, { rules: db.rules[key] ?? [] });
      }
      const store = db[kind as "voice" | "instructions" | "agents"];
      if (method === "PUT") store[key] = (body as { content: string }).content;
      return method === "PUT" ? ok(r) : json(r, { content: store[key] ?? "" });
    }
    if (/^\/api\/repos\/.+\/regenerate$/.test(p)) return json(r, { status: "started" });

    // Security
    if (p === "/api/users/password") return json(r, { status: "ok" });
    if (p === "/api/users/mfa/setup") return json(r, { secret: "JBSWY3DPEHPK3PXP", qr_uri: "otpauth://totp/Coderhelm:person@example.com?secret=JBSWY3DPEHPK3PXP", session: "sess_1" });
    if (p === "/api/users/mfa/verify") { db.mfa = true; return json(r, { status: "ok" }); }
    if (p === "/api/users/mfa" && method === "DELETE") { db.mfa = false; return json(r, { status: "ok" }); }

    // AWS
    if (p === "/api/aws-connections" && method === "GET") {
      return json(r, { connections: db.awsActive ? db.connections : db.connections.map((c) => ({ ...c, status: "error" })) });
    }
    if (p === "/api/aws-connections/cfn-url") return json(r, { cfn_url: "https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate?stackName=CoderHelmLogReader", external_id: "1b4e28ba-2fa1-11d2-883f-0016d3cca427" });
    if (p === `/api/aws-connections/${ACCOUNT}/test`) return json(r, { status: "connected", message: "Successfully assumed role" });
    if (p === `/api/aws-connections/${ACCOUNT}/log-groups`) return json(r, { log_groups: [
      { name: "/ecs/api", stored_bytes: 5_000_000, retention_days: 30 },
      { name: "/ecs/worker", stored_bytes: 1_000_000, retention_days: 14 },
    ] });
    if (p === `/api/aws-connections/${ACCOUNT}` && method === "PUT") {
      db.connections = db.connections.map((c) => ({ ...c, ...body }));
      return json(r, { status: "updated" });
    }
    if (p === `/api/aws-connections/${ACCOUNT}` && method === "DELETE") { db.connections = []; return json(r, { status: "deleted" }); }
    if (p === `/api/aws-connections/${ACCOUNT}/abilities` && method === "PUT") {
      const a = abilities();
      const b = body as { metrics?: boolean; airflow?: boolean; airflow_environments?: string[] };
      if (b.metrics !== undefined) a.metrics.on = b.metrics;
      if (b.airflow !== undefined) a.airflow.on = b.airflow;
      if (b.airflow_environments) a.airflow.skipped = a.airflow.found.filter((e) => !b.airflow_environments!.includes(e)) as never[];
      return json(r, { account: a, status: "connected", reason: "", last_check: ago(0) });
    }
    if (p === `/api/aws-connections/${ACCOUNT}/permissions/check`) {
      return json(r, { account: abilities(), status: "connected", reason: "", last_check: ago(0), permissions: permissionsView(ACCOUNT) });
    }
    if (p === `/api/aws-connections/${ACCOUNT}/abilities/check`) return json(r, { account: abilities(), status: "connected", reason: "", last_check: ago(0) });
    if (p === "/api/recommendations") return json(r, { recommendations: [
      { rec_id: "rec_1", status: "pending", severity: "critical", title: "Orders worker times out talking to the database", summary: "1,204 timeouts since yesterday.", suggested_action: "Raise the pool size to 20.", source_log_group: "/ecs/api", error_count: 1204, created_at: ago(3 * 3600_000) },
    ] });
    if (p === "/api/recommendations/notify" && method === "GET") return json(r, { notify_mode: "off", webhooks: NO_HOOKS });
    if (p === "/api/recommendations/notify" && method === "PUT") return json(r, { ok: true });

    // Alerts
    if (p === "/api/alert-routes" && method === "GET") return json(r, { endpoint_path: "/webhooks/alerts/sns", routes: db.routes });
    if (p === "/api/alert-routes" && method === "PUT") {
      const next = body as Record<string, unknown>;
      db.routes = [...db.routes.filter((x) => x.topic_arn !== next.topic_arn), next];
      return json(r, { ok: true });
    }
    if (p === "/api/alert-routes" && method === "DELETE") {
      db.routes = db.routes.filter((x) => x.topic_arn !== url.searchParams.get("topic_arn"));
      return r.fulfill({ status: 204, body: "" });
    }
    if (p === "/api/alert-routes/alarms") return json(r, { alarms: [{ name: "prod-api-5xx", state: "OK" }, { name: "prod-db-cpu", state: "ALARM" }], messages: [] });
    if (p === "/api/alerts") return json(r, { alerts: ALERTS, next: null });
    if (p === "/api/alert-notify" && method === "GET") {
      return at("admin") ? json(r, { enabled: true, webhooks: { teams: { set: true, hint: TEAMS_HINT }, slack: { set: false, hint: "" } } }) : json(r, { error: "Forbidden" }, 403);
    }
    if (p === "/api/alert-notify" && method === "PUT") return json(r, { ok: true });
    if (p === "/api/notify/test") return json(r, { ok: true });
    if (p === "/api/alert-budget" && method === "GET") {
      return at("admin") ? json(r, { daily_tokens: 2_000_000, used_24h_tokens: 600_000, open_runs: 1, open_run_reserve_tokens: 50_000, max_runs_per_rule_per_day: 5 }) : json(r, { error: "Forbidden" }, 403);
    }
    if (p === "/api/alert-budget" && method === "PUT") return json(r, { ok: true });

    // Jira
    if (p === "/api/integrations/jira/check" && method === "GET") {
      return json(r, { ready: db.jiraReady, secret_configured: false, configured_repos: { total: 2, enabled: 2 }, enabled_repos: [WEB, API], jira_events_seen: true, last_jira_event_at: ago(2 * 3600_000), jira_event_count: 41, installation_id: 7, team_id: "t_1", forge_secret: "forge-secret-value" });
    }
    if (p === "/api/integrations/jira/config" && method === "GET") return json(r, db.jiraConfig);
    if (p === "/api/integrations/jira/config" && method === "PUT") { db.jiraConfig = { ...db.jiraConfig, ...body }; return r.fulfill({ status: 200, body: "" }); }
    if (p === "/api/integrations/jira/projects/fetch") return json(r, { projects: [
      { key: "WEB", name: "Website", enabled: false },
      { key: "OPS", name: "Operations", enabled: false },
      { key: "DATA", name: "Data", enabled: false },
    ] });
    if (p === "/api/integrations/jira/projects" && method === "PUT") { db.jiraConfig = { ...db.jiraConfig, projects: body?.projects }; return r.fulfill({ status: 200, body: "" }); }
    if (p === "/api/integrations/jira/events") return json(r, { events: [
      { event_id: "e1", event_type: "issue_updated", ticket_key: "WEB-12", title: "Fix the checkout total", status: "processed", repo: WEB, created_at: ago(2 * 3600_000) },
    ], total: 1 });

    return json(r, { error: `not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

export const callsTo = (db: Backend, method: string, re: RegExp) => db.calls.filter((c) => c.method === method && re.test(c.path));

/** Full-page screenshots at 1280 and 390, and a check that nothing scrolls sideways. */
export async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}
