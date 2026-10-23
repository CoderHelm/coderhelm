import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The AWS, Alert routes and Jira settings pages. Every API call is answered
// here; nothing reaches a real backend. Role checks mirror the gateway's
// permissions table: members read routes, alerts, connections and findings;
// admins change them; only the owner removes the Jira integration.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

type Role = "viewer" | "member" | "admin" | "owner";
const LEVEL: Record<Role, number> = { viewer: 0, member: 1, admin: 3, owner: 4 };

const ACCOUNT = "123456789012";
const ROLE_ARN = `arn:aws:iam::${ACCOUNT}:role/CoderHelmLogReader`;
const TOPIC = `arn:aws:sns:us-east-1:${ACCOUNT}:prod-alarms`;
const OTHER_TOPIC = "arn:aws:sns:us-east-1:999999999999:other-team";
const EXTERNAL_ID = "1b4e28ba-2fa1-11d2-883f-0016d3cca427";
const WEBHOOK = "https://example.environment.api.powerplatform.com/workflows/abc";
const TEAMS_HINT = "example.environment.api.powerplatform.com …ab12";
const SLACK_HOOK = "https://hooks.slack.com/services/T0EXAMPLE/B0EXAMPLE/abcdefghijklmnop";
const NO_HOOKS = { teams: { set: false, hint: "" }, slack: { set: false, hint: "" } };

const MIN = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

interface Backend {
  role: Role;
  fail: Set<string>;
  connections: Record<string, unknown>[];
  recommendations: Record<string, unknown>[];
  routes: Record<string, unknown>[];
  alerts: Record<string, unknown>[];
  jiraConfig: Record<string, unknown>;
  jiraCheck: Record<string, unknown>;
  jiraEvents: Record<string, unknown>[];
  assumeFails: boolean;
  calls: { method: string; path: string; body: Record<string, unknown> | null }[];
  /** What the Coderhelm role can't read yet (metrics, airflow). */
  roleMissing?: string[];
}

function abilities(missing: string[] = []) {
  const metrics = !missing.includes("metrics");
  const airflow = !missing.includes("airflow");
  return {
    account: ACCOUNT, region: "us-east-1", role: "CoderHelmLogReader", status: "active", checked_at: ago(3 * MIN), check_error: "",
    logs: { available: true, on: true },
    metrics: { available: metrics, on: metrics, switched_off: false },
    airflow: { available: airflow, on: airflow, switched_off: false, found: airflow ? ["prod-airflow"] : [], skipped: [], environments: airflow ? ["prod-airflow"] : [] },
    missing,
    update_url: missing.length ? "https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate?stackName=CoderHelmLogReaderOps" : null,
    stack_name: "CoderHelmLogReaderOps",
  };
}

function connection(over: Record<string, unknown> = {}, missing: string[] = []) {
  return {
    connection_id: ACCOUNT, role_arn: ROLE_ARN, external_id: EXTERNAL_ID, region: "us-east-1", status: "active",
    log_groups: ["/ecs/api"], last_analyzed_at: ago(40 * MIN), created_at: ago(9 * 86_400_000), updated_at: ago(2 * 86_400_000),
    abilities: abilities(missing), ...over,
  };
}

function route(over: Record<string, unknown> = {}) {
  return {
    topic_arn: TOPIC, enabled: true, notify_mode: "team", post_recoveries: true,
    rules: [
      { id: "r1", alarms: ["prod-api-5xx"], terms: [], repo: "your-team/backend", instructions: "Roll back the last deploy." },
      { id: "r2", alarms: [], terms: ["disk full"], repo: "your-team/infra", instructions: "" },
    ],
    ...over,
  };
}

const ALERTS = [
  { id: "01JA0000000000000000000005", received_at: ago(5 * MIN), topic_arn: TOPIC, repo: "", kind: "message", title: "All clear", outcome: "recovered", ticket_id: "ALERT-RECOVERY", recovers_ticket: "ALERT-NIGHTLY" },
  { id: "01JA0000000000000000000004", received_at: ago(20 * MIN), topic_arn: TOPIC, repo: "", kind: "cloudwatch_alarm", title: "OK: prod-api-5xx", outcome: "recovered", ticket_id: "ALERT-API5XX" },
  { id: "01JA0000000000000000000003", received_at: ago(50 * MIN), topic_arn: TOPIC, repo: "your-team/backend", kind: "cloudwatch_alarm", title: "ALARM: prod-api-5xx", outcome: "run_started", ticket_id: "ALERT-API5XX" },
  { id: "01JA0000000000000000000002", received_at: ago(70 * MIN), topic_arn: TOPIC, repo: "", kind: "message", title: "nightly load failed", outcome: "notified", ticket_id: "ALERT-NIGHTLY" },
  { id: "01JA0000000000000000000001", received_at: ago(90 * MIN), topic_arn: TOPIC, repo: "", kind: "message", title: "Disk full on build host", outcome: "alert_budget", ticket_id: "ALERT-DISK" },
];

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = {
    role: "admin", fail: new Set(), connections: [connection()], assumeFails: false,
    recommendations: [
      { rec_id: "rec_1", status: "pending", severity: "critical", title: "Orders worker times out talking to the database", summary: "1,204 timeouts since yesterday.", suggested_action: "Raise the pool size to 20.", source_log_group: "/ecs/api", error_count: 1204, created_at: ago(3 * 3600_000) },
    ],
    routes: [route()],
    alerts: ALERTS,
    jiraConfig: { default_project: "WEB", trigger_label: "coderhelm", list_projects_url: "https://forge.example/list", create_ticket_url: "https://forge.example/create", add_comment_url: "https://forge.example/comment", site_url: "https://your-team.atlassian.net", projects: [
      { key: "WEB", name: "Website", enabled: true, repo: "" },
      { key: "OPS", name: "Operations", enabled: false, repo: "" },
    ] },
    jiraCheck: { ready: true, secret_configured: false, configured_repos: { total: 3, enabled: 2 }, enabled_repos: ["your-team/backend", "your-team/web"], jira_events_seen: true, last_jira_event_at: ago(2 * 3600_000), jira_event_count: 41, installation_id: 7, team_id: "t_1", forge_secret: "forge-secret-value" },
    jiraEvents: [
      { event_id: "e1", event_type: "issue_updated", ticket_key: "WEB-12", title: "Fix the checkout total", status: "processed", repo: "your-team/web", created_at: ago(2 * 3600_000) },
      { event_id: "e2", event_type: "issue_updated", ticket_key: "OPS-3", title: "Rotate keys", status: "filtered", repo: "", created_at: ago(5 * 3600_000) },
    ],
    calls: [],
    ...init,
  };
  const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const at = (min: Role) => LEVEL[db.role] >= LEVEL[min];
  await page.route((url) => url.hostname !== "localhost", (r) => r.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (r) => {
    const req = r.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    let body: Record<string, unknown> | null = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    db.calls.push({ method, path: p + url.search, body });
    const forbidden = () => json(r, { error: "Forbidden" }, 403);
    if (db.fail.has(p)) return json(r, { error: "Server error" }, 500);

    if (p === "/api/me") return json(r, { user_id: "u_1", team_id: "t_1", github_login: null, email: "person@example.com", avatar_url: "", role: db.role });
    if (p === "/api/usage") return json(r, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(r, { banners: [] });
    if (p === "/api/integrations") return json(r, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/teams") return json(r, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(r, { repos: [
      { name: "your-team/backend", enabled: true, ticket_source: "github" },
      { name: "your-team/infra", enabled: true, ticket_source: "github" },
      { name: "your-team/web", enabled: true, ticket_source: "github" },
    ] });

    // AWS
    if (p === "/api/aws-connections" && method === "GET") return json(r, { connections: db.connections.map((c) => ({ ...c, external_id: at("admin") ? c.external_id : null })) });
    if (p === "/api/aws-connections" && method === "POST") {
      if (!at("admin")) return forbidden();
      if (db.assumeFails) return json(r, { error: "unable_to_assume_role", message: "Could not assume the provided role.", external_id: EXTERNAL_ID });
      db.connections.push(connection({ role_arn: body?.role_arn, region: body?.region, log_groups: [], last_analyzed_at: undefined }));
      return json(r, { connection_id: ACCOUNT, external_id: EXTERNAL_ID, status: "active" });
    }
    if (p === "/api/aws-connections/cfn-url") return at("admin") ? json(r, { cfn_url: "https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate?stackName=CoderHelmLogReader", external_id: EXTERNAL_ID }) : forbidden();
    if (p === `/api/aws-connections/${ACCOUNT}/test`) {
      if (!at("admin")) return forbidden();
      return json(r, db.assumeFails ? { status: "error", message: "Could not assume role: AccessDenied" } : { status: "connected", message: "Successfully assumed role" });
    }
    if (p === `/api/aws-connections/${ACCOUNT}/log-groups`) return json(r, { log_groups: [
      { name: "/ecs/api", stored_bytes: 5_000_000, retention_days: 30 },
      { name: "/ecs/worker", stored_bytes: 1_000_000, retention_days: 14 },
    ] });
    if (p === `/api/aws-connections/${ACCOUNT}` && method === "PUT") {
      if (!at("admin")) return forbidden();
      db.connections = db.connections.map((c) => ({ ...c, ...body }));
      return json(r, { status: "updated" });
    }
    if (p === `/api/aws-connections/${ACCOUNT}` && method === "DELETE") {
      if (!at("admin")) return forbidden();
      db.connections = [];
      return json(r, { status: "deleted" });
    }
    if (p === "/api/recommendations") return json(r, { recommendations: db.recommendations });
    if (p === "/api/recommendations/notify" && method === "GET") return at("admin") ? json(r, { notify_mode: "off", webhooks: NO_HOOKS }) : forbidden();
    if (p === "/api/recommendations/notify" && method === "PUT") return at("admin") ? json(r, { ok: true }) : forbidden();
    if (/^\/api\/recommendations\/[^/]+\/dismiss$/.test(p)) {
      if (!at("member")) return forbidden();
      db.recommendations = [];
      return json(r, { status: "dismissed" });
    }

    // Alerts
    if (p === "/api/alert-routes" && method === "GET") return at("member") ? json(r, { endpoint_path: "/webhooks/alerts/sns", routes: db.routes }) : forbidden();
    if (p === "/api/alert-routes" && method === "PUT") {
      if (!at("admin")) return forbidden();
      const next = body as Record<string, unknown>;
      db.routes = [...db.routes.filter((x) => x.topic_arn !== next.topic_arn), next];
      return json(r, { ok: true });
    }
    if (p === "/api/alert-routes" && method === "DELETE") {
      if (!at("admin")) return forbidden();
      db.routes = db.routes.filter((x) => x.topic_arn !== url.searchParams.get("topic_arn"));
      return r.fulfill({ status: 204, body: "" });
    }
    if (p === "/api/alert-routes/alarms") return at("member") ? json(r, { alarms: [
      { name: "prod-api-5xx", state: "OK" },
      { name: "prod-db-cpu", state: "ALARM" },
    ], messages: ["Disk full on build host"] }) : forbidden();
    if (p === "/api/alerts") return at("member") ? json(r, { alerts: db.alerts, next: null }) : forbidden();
    if (p === "/api/alert-notify" && method === "GET") return at("admin") ? json(r, { enabled: true, webhooks: { teams: { set: true, hint: TEAMS_HINT }, slack: { set: false, hint: "" } } }) : forbidden();
    if (p === "/api/alert-notify" && method === "PUT") return at("admin") ? json(r, { ok: true }) : forbidden();
    if (p === "/api/notify/test") return at("admin") ? json(r, { ok: true }) : forbidden();
    if (p === "/api/alert-budget" && method === "GET") return at("admin") ? json(r, { daily_tokens: 2_000_000, used_24h_tokens: 600_000, open_runs: 1, open_run_reserve_tokens: 50_000, max_runs_per_rule_per_day: 5 }) : forbidden();
    if (p === "/api/alert-budget" && method === "PUT") return at("admin") ? json(r, { ok: true }) : forbidden();

    // Jira
    if (p === "/api/integrations/jira/check" && method === "GET") return at("admin") ? json(r, db.jiraCheck) : forbidden();
    if (p === "/api/integrations/jira/check" && method === "DELETE") {
      if (!at("owner")) return forbidden();
      db.jiraConfig = { default_project: "", trigger_label: "", list_projects_url: "", create_ticket_url: "", add_comment_url: "", site_url: "", projects: [] };
      db.jiraCheck = { ...db.jiraCheck, ready: false, jira_events_seen: false, last_jira_event_at: undefined, jira_event_count: 0 };
      return r.fulfill({ status: 200, body: "" });
    }
    if (p === "/api/integrations/jira/config" && method === "GET") return json(r, db.jiraConfig);
    if (p === "/api/integrations/jira/config" && method === "PUT") {
      if (!at("admin")) return forbidden();
      db.jiraConfig = { ...db.jiraConfig, ...body };
      return r.fulfill({ status: 200, body: "" });
    }
    if (p === "/api/integrations/jira/projects/fetch") return json(r, { projects: [
      { key: "WEB", name: "Website", enabled: false },
      { key: "OPS", name: "Operations", enabled: false },
      { key: "DATA", name: "Data", enabled: false },
    ] });
    if (p === "/api/integrations/jira/projects" && method === "PUT") {
      if (!at("admin")) return forbidden();
      db.jiraConfig = { ...db.jiraConfig, projects: body?.projects };
      return r.fulfill({ status: 200, body: "" });
    }
    if (p === "/api/integrations/jira/events") return json(r, { events: db.jiraEvents, total: db.jiraEvents.length });
    if (p === "/api/integrations/jira/secret" && method === "POST") {
      if (!at("admin")) return forbidden();
      db.jiraCheck = { ...db.jiraCheck, secret_configured: true, webhook_url: "https://api.example.com/webhooks/jira/tok" };
      return json(r, { token: "tok", webhook_secret: "whsec_new_value" });
    }
    return json(r, { error: `not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

/** Full-page screenshots at desktop and phone widths, and a check that nothing scrolls sideways. */
async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) {
      const wide = await page.evaluate(() => {
        const w = document.documentElement.clientWidth;
        return Array.from(document.querySelectorAll("body *"))
          .filter((el) => el.getBoundingClientRect().right > w + 1 || el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === "visible" && el.clientWidth > 0)
          .slice(-6)
          .map((el) => `${el.tagName}.${(el as HTMLElement).className}`.slice(0, 160) + " | " + (el.textContent ?? "").slice(0, 60));
      });
      console.log(name, wide.join("\n"));
    }
    expect(overflow, `${name} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

const callsTo = (db: Backend, method: string, re: RegExp) => db.calls.filter((c) => c.method === method && re.test(c.path));

// ── AWS ──────────────────────────────────────────────────────────────

test.describe("AWS", () => {
  test("connected: status, scopes, test result, findings, log groups and disconnect", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/settings/integrations/aws/");
    await expect(page.getByRole("heading", { level: 1, name: "AWS" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Settings");

    const card = page.getByRole("article", { name: `AWS account ${ACCOUNT}` });
    await expect(card.getByText("Connected", { exact: true })).toBeVisible();
    await expect(card.getByLabel("Role")).toHaveValue(ROLE_ARN);
    await expect(card.getByText("1 chosen")).toBeVisible();
    await expect(card.getByText("40 minutes ago")).toBeVisible();
    await expect(page.getByRole("heading", { name: "What Coderhelm can do with it" })).toBeVisible();
    await expect(page.getByText("Change, delete or write anything in your account")).toBeVisible();
    await expect(page.getByText("Orders worker times out talking to the database")).toBeVisible();
    await expect(page.getByText("1,204 times")).toBeVisible();
    await shot(page, "aws-connected");

    await card.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Test connection" }).click();
    await expect(card.getByText("The connection works")).toBeVisible();

    await card.getByRole("button", { name: "Choose log groups" }).click();
    await expect(card.getByLabel("/ecs/api")).toBeChecked();
    await card.getByLabel("/ecs/worker").check();
    await page.getByRole("region", { name: "Save changes" }).getByRole("button", { name: "Save changes" }).click();
    await expect.poll(() => callsTo(db, "PUT", new RegExp(`/api/aws-connections/${ACCOUNT}$`)).at(-1)?.body).toEqual({ log_groups: ["/ecs/api", "/ecs/worker"] });

    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByText("No open findings.")).toBeVisible();

    await card.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Disconnect" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(`Disconnect AWS account ${ACCOUNT}?`);
    await dialog.getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByRole("heading", { name: "Connect your AWS account" })).toBeVisible();
    expect(callsTo(db, "DELETE", new RegExp(`/api/aws-connections/${ACCOUNT}$`))).toHaveLength(1);
  });

  test("a failed test says so next to the account", async ({ page }) => {
    await mockApi(page, { assumeFails: true });
    await page.goto("/settings/integrations/aws/");
    const card = page.getByRole("article", { name: `AWS account ${ACCOUNT}` });
    await card.getByRole("button", { name: "Actions" }).click();
    await page.getByRole("menuitem", { name: "Test connection" }).click();
    await expect(card.getByText("The test failed")).toBeVisible();
    await expect(card.getByText("Could not assume role: AccessDenied")).toBeVisible();
  });

  test("not connected: the guided steps check the ARN and region, and a refused role explains why", async ({ page }) => {
    const db = await mockApi(page, { connections: [], assumeFails: true });
    await page.goto("/settings/integrations/aws/");
    const steps = page.getByRole("list", { name: "Connection steps" });
    await expect(steps.locator('[aria-current="step"]')).toContainText("Create the read-only role");
    await expect(page.getByText(EXTERNAL_ID)).toBeVisible();
    await shot(page, "aws-empty");

    const connect = page.getByRole("button", { name: "Check and connect" });
    await expect(connect).toBeDisabled();
    await page.getByLabel("Role ARN").fill(`arn:aws:iam::${ACCOUNT}:role/SomethingElse`);
    await expect(page.getByText(/The role must be named CoderHelmLogReader/)).toBeVisible();
    await page.getByLabel("Role ARN").fill(ROLE_ARN);
    await page.getByLabel("Region of your logs").fill("eu-west-1");
    await expect(steps.locator('[aria-current="step"]')).toContainText("Check and connect");
    await connect.click();
    await expect(page.getByText("Coderhelm could not use the role")).toBeVisible();
    expect(callsTo(db, "POST", /\/api\/aws-connections$/)[0].body).toEqual({ role_arn: ROLE_ARN, region: "eu-west-1" });

    db.assumeFails = false;
    await connect.click();
    await expect(page.getByRole("article", { name: `AWS account ${ACCOUNT}` })).toBeVisible();
  });

  test("members see accounts and findings but no admin controls", async ({ page }) => {
    const db = await mockApi(page, { role: "member" });
    await page.goto("/settings/integrations/aws/");
    await expect(page.getByText("Only an admin or the owner can connect, test or remove an account.")).toBeVisible();
    const card = page.getByRole("article", { name: `AWS account ${ACCOUNT}` });
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: "Test connection" })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Disconnect" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Connect another account" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Post new findings to chat" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create a plan" })).toBeVisible();
    expect(callsTo(db, "GET", /cfn-url|recommendations\/notify/)).toHaveLength(0);
    await shot(page, "aws-member");
  });

  test("a failed load offers a retry", async ({ page }) => {
    const db = await mockApi(page);
    db.fail.add("/api/aws-connections");
    await page.goto("/settings/integrations/aws/");
    await expect(page.getByText("Could not load your AWS accounts")).toBeVisible();
    db.fail.clear();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("article", { name: `AWS account ${ACCOUNT}` })).toBeVisible();
  });
});

// ── Alert routes ─────────────────────────────────────────────────────

test.describe("AWS role access", () => {
  test("a role that can't read metrics or Airflow shows the one-click stack link", async ({ page }) => {
    await mockApi(page, { connections: [connection({}, ["metrics", "airflow"])] });
    await page.goto("/settings/integrations/aws/");
    const box = page.getByRole("article", { name: `AWS account ${ACCOUNT}` });
    await expect(box.getByText("Add CloudWatch metrics and Airflow to your Coderhelm role")).toBeVisible();
    const link = box.getByRole("link", { name: "Add access in AWS" });
    await expect(link).toHaveAttribute("href", /stacks\/quickcreate\?stackName=CoderHelmLogReaderOps/);
    await expect(box.getByRole("switch", { name: "Metrics" })).toBeDisabled();
  });

  test("a role that can read everything shows each ability on", async ({ page }) => {
    await mockApi(page);
    await page.goto("/settings/integrations/aws/");
    const box = page.getByRole("article", { name: `AWS account ${ACCOUNT}` });
    await expect(box.getByRole("switch", { name: "Metrics" })).toHaveAttribute("aria-checked", "true");
    await expect(box.getByRole("switch", { name: "Airflow" })).toHaveAttribute("aria-checked", "true");
    await expect(box.getByRole("checkbox", { name: "prod-airflow" })).toBeChecked();
    await expect(box.getByRole("link", { name: "Add access in AWS" })).toHaveCount(0);
  });
});

test.describe("Alert routes", () => {
  test("route cards, recent alerts with outcomes and recoveries paired to their alerts", async ({ page }) => {
    await mockApi(page);
    await page.goto("/settings/alerts");
    await expect(page.getByRole("heading", { level: 1, name: "Alert routes" })).toBeVisible();

    const card = page.getByTestId("route-prod-alarms");
    await expect(card.getByText("On", { exact: true }).first()).toBeVisible();
    await expect(card.getByText("Chat: Team channel")).toBeVisible();
    await expect(card.getByText("Posts recoveries")).toBeVisible();
    await expect(card.getByText("2 rules")).toBeVisible();
    await card.getByRole("button", { name: "Show rules of prod-alarms" }).click();
    await expect(card.getByRole("list", { name: "Rules, first match wins" })).toContainText("prod-api-5xx");
    await expect(card.getByRole("list", { name: "Rules, first match wins" })).toContainText("Everything else");
    await expect(card.getByText(/Last alert 5 minutes ago/)).toBeVisible();

    const timeline = page.getByRole("list", { name: "Recent alerts" });
    await expect(timeline.getByRole("listitem")).toHaveCount(5);
    // A plain recovery names its alert through recovers_ticket; a CloudWatch OK through its own ticket.
    const plain = timeline.getByRole("listitem").filter({ hasText: "All clear" });
    await expect(plain).toContainText("Resolves nightly load failed after");
    const ok = timeline.getByRole("listitem").filter({ hasText: "OK: prod-api-5xx" });
    await expect(ok).toContainText("Resolves ALARM: prod-api-5xx after 30 min");
    const row = (title: string) =>
      timeline.getByRole("listitem").filter({ has: page.getByRole("link", { name: title, exact: true }) }).filter({ hasNotText: "Resolves" });
    await expect(row("ALARM: prod-api-5xx")).toContainText("Opened a PR run");
    await expect(row("ALARM: prod-api-5xx")).toContainText("Recovered 30 min later");
    await expect(row("nightly load failed")).toContainText("Notified");

    await page.getByRole("button", { name: "Recoveries", exact: true }).click();
    await expect(timeline.getByRole("listitem")).toHaveCount(2);
    await page.getByRole("button", { name: "Problems" }).click();
    await expect(timeline.getByRole("listitem")).toHaveCount(1);
    await expect(timeline).toContainText("Daily budget reached");
    await page.getByRole("button", { name: "All", exact: true }).click();

    await card.getByRole("button", { name: "Show the alarms on this topic" }).click();
    await expect(card.getByText("Rule 1: PR in backend")).toBeVisible();
    await shot(page, "alerts-routes");
  });

  test("the rule builder previews which recent alerts each rule takes, and saves the route", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/settings/alerts");
    await page.getByTestId("route-prod-alarms").getByRole("button", { name: "Edit rules" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Edit the route for prod-alarms" })).toBeFocused();

    const preview = page.getByRole("complementary", { name: "Live preview" });
    await expect(preview.getByRole("listitem").filter({ hasText: "ALARM: prod-api-5xx" })).toContainText("Rule 1: PR in your-team/backend");
    await expect(preview.getByRole("listitem").filter({ hasText: "Disk full on build host" })).toContainText("Rule 2: PR in your-team/infra");
    await expect(preview.getByRole("listitem").filter({ hasText: "nightly load failed" })).toContainText(/chat only/i);
    await expect(preview.getByRole("listitem").filter({ hasText: "All clear" })).toContainText("Recovery or state change: no run");
    await shot(page, "alerts-editor");

    // Moving rule 2 first changes nothing for these alerts, but the order is sent.
    await page.getByRole("button", { name: "Move rule 2 up" }).click();
    await expect(page.getByRole("group", { name: "Rule 1", exact: true }).getByLabel("Phrases")).toHaveValue("disk full");
    await expect(preview.getByRole("listitem").filter({ hasText: "Disk full on build host" })).toContainText("Rule 1: PR in your-team/infra");

    // Narrowing a rule to text that matches nothing moves its alert to chat only.
    await page.getByLabel("Phrases").fill("never seen");
    await expect(preview.getByRole("listitem").filter({ hasText: "Disk full on build host" })).toContainText(/chat only/i);

    await page.getByRole("button", { name: "Save route" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Alert routes" })).toBeVisible();
    const saved = callsTo(db, "PUT", /\/api\/alert-routes$/).at(-1)!.body as { rules: { terms: string[]; repo: string }[]; post_recoveries: boolean };
    expect(saved.rules.map((r) => r.repo)).toEqual(["your-team/infra", "your-team/backend"]);
    expect(saved.rules[0].terms).toEqual(["never seen"]);
    expect(saved.post_recoveries).toBe(true);
  });

  test("adding a route refuses a topic in an account that isn't connected", async ({ page }) => {
    await mockApi(page);
    await page.goto("/settings/alerts");
    await page.getByRole("button", { name: "Add route" }).click();
    await page.getByLabel("SNS topic ARN").fill(OTHER_TOPIC);
    await expect(page.getByText("Connect AWS account 999999999999 under Settings, AWS first.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add route" })).toBeDisabled();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Alert routes" })).toBeVisible();
  });

  test("pause and remove a route", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/settings/alerts");
    const card = page.getByTestId("route-prod-alarms");
    await card.getByRole("switch", { name: "prod-alarms" }).click();
    await expect(card.getByText("Paused", { exact: true }).first()).toBeVisible();
    expect(callsTo(db, "PUT", /\/api\/alert-routes$/).at(-1)!.body).toMatchObject({ enabled: false });

    await card.getByRole("button", { name: "Remove the route for prod-alarms" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove route" }).click();
    await expect(page.getByText("No alert routes yet")).toBeVisible();
  });

  test("members read routes and alerts without the admin cards or controls", async ({ page }) => {
    const db = await mockApi(page, { role: "member" });
    await page.goto("/settings/alerts");
    await expect(page.getByText("Only an admin or the owner can change them.")).toBeVisible();
    const card = page.getByTestId("route-prod-alarms");
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: "Edit rules" })).toHaveCount(0);
    await expect(card.getByRole("switch")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add route" })).toHaveCount(0);
    await expect(page.getByText("Daily token budget for alert runs")).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Recent alerts" }).getByRole("listitem")).toHaveCount(5);
    expect(callsTo(db, "GET", /alert-notify|alert-budget/)).toHaveLength(0);
    await shot(page, "alerts-member");
  });

  test("empty and failed states", async ({ page }) => {
    const db = await mockApi(page, { routes: [], alerts: [] });
    await page.goto("/settings/alerts");
    await expect(page.getByText("No alert routes yet")).toBeVisible();
    await expect(page.getByText("No alerts received yet.")).toBeVisible();
    await shot(page, "alerts-empty");

    db.fail.add("/api/alert-routes");
    await page.reload();
    await expect(page.getByText("Could not load the alert routes")).toBeVisible();
  });
});

// ── Slack and Teams ──────────────────────────────────────────────────

test.describe("Where alerts post", () => {
  test("the team channel posts to Teams, Slack or both, and saved webhooks are never sent back", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/settings/alerts");
    const picker = page.getByTestId("team-channels");
    // The saved Teams webhook shows as a hint only.
    await expect(picker.getByText(TEAMS_HINT)).toBeVisible();
    await expect(picker.getByRole("checkbox", { name: "Microsoft Teams" })).toBeChecked();
    await picker.getByRole("checkbox", { name: "Slack" }).check();
    const slack = picker.getByRole("textbox", { name: "Slack webhook address" });
    await slack.fill("https://hooks.slack.com/triggers/T0/1/abc");
    await expect(picker.getByText("Paste the Incoming Webhook URL Slack shows")).toBeVisible();
    const bar = page.getByRole("region", { name: "Save changes" });
    await bar.getByRole("button", { name: "Save changes" }).click();
    await expect(bar).toContainText("Check the webhook addresses.");
    expect(callsTo(db, "PUT", /\/api\/alert-notify$/)).toHaveLength(0);
    await slack.fill(SLACK_HOOK);
    await bar.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Alert settings saved")).toBeVisible();
    // Teams is kept as saved (no URL sent); Slack is the new one.
    expect(callsTo(db, "PUT", /\/api\/alert-notify$/).at(-1)!.body).toEqual({ enabled: true, slack_webhook: { url: SLACK_HOOK } });
    await shot(page, "alerts-team-channel-both");
  });

  test("a route can post to its own Slack channel and test it", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/settings/alerts");
    await page.getByTestId("route-prod-alarms").getByRole("button", { name: "Edit rules" }).click();
    await page.getByRole("group", { name: "Where this route posts" }).getByRole("button", { name: "Own channel" }).click();
    const picker = page.getByTestId("route-channels");
    await expect(page.getByRole("button", { name: "Save route" })).toBeDisabled();
    await picker.getByRole("checkbox", { name: "Slack" }).check();
    await picker.getByRole("textbox", { name: "Slack webhook address" }).fill(SLACK_HOOK);
    await picker.getByRole("button", { name: "Send test message" }).click();
    await expect(picker.getByText("Test message sent. Check the channel.")).toBeVisible();
    expect(callsTo(db, "POST", /\/api\/notify\/test$/).at(-1)!.body).toEqual({ destination: "route", topic_arn: TOPIC, channel: "slack", url: SLACK_HOOK });
    await page.getByRole("button", { name: "Save route" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Alert routes" })).toBeVisible();
    const saved = callsTo(db, "PUT", /\/api\/alert-routes$/).at(-1)!.body as Record<string, unknown>;
    expect(saved.notify_mode).toBe("custom");
    expect(saved.slack_webhook).toEqual({ url: SLACK_HOOK });
    expect(saved).not.toHaveProperty("teams_webhook");
    expect(saved).not.toHaveProperty("webhooks");
  });

  test("new log findings can post to Slack", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/settings/integrations/aws/");
    const box = page.getByRole("complementary", { name: "Post new findings to chat" });
    await box.getByRole("group", { name: "Where to post new findings" }).getByRole("button", { name: "Own channel" }).click();
    await box.getByRole("checkbox", { name: "Slack" }).check();
    await box.getByRole("textbox", { name: "Slack webhook address" }).fill(SLACK_HOOK);
    await box.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved where new findings are posted")).toBeVisible();
    expect(callsTo(db, "PUT", /\/api\/recommendations\/notify$/).at(-1)!.body).toEqual({ notify_mode: "custom", slack_webhook: { url: SLACK_HOOK } });
  });
});

// ── Jira ─────────────────────────────────────────────────────────────

test.describe("Jira", () => {
  test("connected: status, connection check, projects with repositories, events", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/settings/integrations/jira/");
    await expect(page.getByRole("heading", { level: 1, name: "Jira" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "your-team.atlassian.net" })).toBeVisible();
    await expect(page.getByText("Connected", { exact: true })).toBeVisible();
    await expect(page.getByText("2 of 3 repositories turned on")).toBeVisible();

    await page.getByRole("button", { name: "Check the connection" }).click();
    await expect(page.getByText("Coderhelm reached your-team.atlassian.net and can see 3 projects.")).toBeVisible();

    await page.getByRole("switch", { name: "Operations (OPS)" }).click();
    await page.getByTestId("project-WEB").getByLabel("Repository").selectOption("your-team/web");
    await page.getByRole("region", { name: "Save changes" }).getByRole("button", { name: "Save changes" }).click();
    await expect.poll(() => (callsTo(db, "PUT", /jira\/projects$/).at(-1)?.body as { projects: { key: string; enabled: boolean }[] })?.projects.find((p) => p.key === "OPS")?.enabled).toBe(true);
    await expect.poll(() => (callsTo(db, "PUT", /jira\/projects$/).at(-1)?.body as { projects: { key: string; repo: string }[] })?.projects.find((p) => p.key === "WEB")?.repo).toBe("your-team/web");

    const events = page.locator("#events");
    await expect(events.getByText("WEB-12")).toBeVisible();
    await expect(events.getByText("Handled")).toBeVisible();
    await expect(events.getByText("Skipped")).toBeVisible();
    // Only the owner can remove the integration; an admin is told so.
    await expect(page.getByText("Only the team owner can do this.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove integration" })).toHaveCount(0);
    await shot(page, "jira-connected");
  });

  test("disconnecting the app clears every trigger address", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/settings/integrations/jira/");
    await page.getByRole("button", { name: "Disconnect the app" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByRole("heading", { name: "Jira is not connected" })).toBeVisible();
    expect(callsTo(db, "PUT", /jira\/config$/).at(-1)!.body).toEqual({ list_projects_url: "", create_ticket_url: "", add_comment_url: "" });
  });

  test("not connected: guided app setup with Team ID and secret, or a webhook", async ({ page }) => {
    await mockApi(page, {
      jiraConfig: { default_project: "", trigger_label: "", list_projects_url: "", create_ticket_url: "", add_comment_url: "", site_url: "", projects: [] },
      jiraCheck: { ready: false, secret_configured: false, configured_repos: { total: 3, enabled: 2 }, enabled_repos: [], jira_events_seen: false, installation_id: 7, team_id: "t_1", forge_secret: "forge-secret-value" },
      jiraEvents: [],
    });
    await page.goto("/settings/integrations/jira/");
    await expect(page.getByRole("heading", { name: "Jira is not connected" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Jira app steps" }).locator('[aria-current="step"]')).toContainText("Install the Jira app");
    await expect(page.getByText("t_1", { exact: true })).toBeVisible();
    await expect(page.getByText("forge-secret-value")).toHaveCount(0);
    await page.getByRole("button", { name: "Show" }).click();
    await expect(page.getByText("forge-secret-value")).toBeVisible();
    await expect(page.getByText("No Jira events yet.")).toBeVisible();
    await shot(page, "jira-setup");

    await page.getByRole("button", { name: "Jira webhook" }).click();
    await page.getByRole("button", { name: "Make webhook credentials" }).click();
    await expect(page.getByText("whsec_new_value")).toBeVisible();
    await expect(page.getByText("It is not shown again after you leave this page.", { exact: false })).toBeVisible();
  });

  test("the owner can remove the integration", async ({ page }) => {
    const db = await mockApi(page, { role: "owner" });
    await page.goto("/settings/integrations/jira/");
    await page.getByRole("button", { name: "Remove integration" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove integration" }).click();
    await expect(page.getByRole("heading", { name: "Jira is not connected" })).toBeVisible();
    expect(callsTo(db, "DELETE", /jira\/check$/)).toHaveLength(1);
  });

  test("members are told who can open the page", async ({ page }) => {
    await mockApi(page, { role: "member" });
    await page.goto("/settings/integrations/jira/");
    await expect(page.getByText("This page needs a different role")).toBeVisible();
  });

  test("a failed load offers a retry", async ({ page }) => {
    const db = await mockApi(page);
    db.fail.add("/api/integrations/jira/check");
    await page.goto("/settings/integrations/jira/");
    await expect(page.getByText("Could not load the Jira settings")).toBeVisible();
    db.fail.clear();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "your-team.atlassian.net" })).toBeVisible();
  });
});
