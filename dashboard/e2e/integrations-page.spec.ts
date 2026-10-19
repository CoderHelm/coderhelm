import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Settings → Integrations. Every API call is answered here; nothing reaches a
// real backend. The backend works out each card's status; these tests check
// the page shows it, offers one action, and that admins act while members
// only read.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

type Role = "viewer" | "member" | "admin" | "owner";
const LEVEL: Record<Role, number> = { viewer: 0, member: 1, admin: 3, owner: 4 };

const ACCOUNT = "123456789012";
const MIN = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

function plugin(id: string, name: string, category: string) {
  return {
    id, name, description: `${name} for agents.`, category, tier: 1, icon: id,
    credential_fields: [{ key: "api_token", label: "API token", placeholder: "tok_...", secret: true }],
    docs_url: "https://example.com/docs", repo_url: "https://github.com/example/mcp", default_prompt: "Read only.", recommended_permissions: "Read-only access",
  };
}

function card(id: string, section: string, name: string, status: string, action: string, over: Record<string, unknown> = {}) {
  return { id, section, name, does: `What Coderhelm does with ${name}.`, status, reason: "", action, last_check: "", manage_href: "", detail: {}, ...over };
}

function awsDetail(over: Record<string, unknown> = {}) {
  return {
    account: ACCOUNT, region: "us-east-1", role: "CoderHelmLogReader", status: "active", checked_at: ago(2 * MIN), check_error: "",
    logs: { available: true, on: true },
    metrics: { available: true, on: true, switched_off: false },
    airflow: { available: true, on: true, switched_off: false, found: ["prod-airflow", "staging-airflow"], skipped: [], environments: ["prod-airflow", "staging-airflow"] },
    missing: [], update_url: null, stack_name: "CoderHelmLogReaderOps", ...over,
  };
}

function pluginCard(id: string, name: string, section: string, enabled: boolean, creds: boolean) {
  const status = !enabled ? "not_connected" : creds ? "connected" : "needs_credentials";
  const action = !enabled ? "connect" : creds ? "manage" : "add_credentials";
  return card(id, section, name, status, action, {
    reason: status === "needs_credentials" ? "Switched on, but no credentials are saved, so agents don't get it." : "",
    detail: { plugin: plugin(id, name, section), enabled, has_credentials: creds, custom_prompt: "", last_test_ok: null, last_test_message: "" },
  });
}

function items() {
  return [
    card("github", "code", "GitHub", "connected", "manage", { reason: "Installed on your-team.", manage_href: "/settings/integrations/github" }),
    card("jira", "code", "Jira", "not_connected", "connect", { manage_href: "/settings/integrations/jira" }),
    card(`aws-${ACCOUNT}`, "cloud", `AWS account ${ACCOUNT}`, "connected", "manage", { last_check: ago(2 * MIN), manage_href: "/settings/integrations/aws", detail: awsDetail() }),
    card("newrelic", "monitoring", "New Relic", "connected", "manage", { last_check: ago(60 * MIN), detail: { kind: "newrelic", label: "New Relic", connected: true, enabled: true, status: "ready", key_hint: "1234", region: "us", account_ids: [] } }),
    card("confluence", "docs", "Confluence", "not_connected", "connect", { detail: { kind: "confluence", connected: false } }),
    card("teams", "chat", "Microsoft Teams", "not_connected", "connect", { detail: { enabled: false, has_webhook: false } }),
    pluginCard("sentry", "Sentry", "monitoring", true, false),
    pluginCard("figma", "Figma", "docs", true, false),
    pluginCard("sanity", "Sanity", "docs", true, false),
    pluginCard("notion", "Notion", "docs", false, false),
    pluginCard("linear", "Linear", "other", true, true),
    pluginCard("stripe", "Stripe", "other", false, false),
  ];
}

interface Backend {
  role: Role;
  items: ReturnType<typeof items>;
  fail: boolean;
  calls: { method: string; path: string; body: Record<string, unknown> | null }[];
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { role: "admin", items: items(), fail: false, calls: [], ...init };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const at = (min: Role) => LEVEL[db.role] >= LEVEL[min];
  const forbidden = (r: Route) => json(r, { error: "Forbidden" }, 403);
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (r) => {
    const req = r.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    const body = req.postData() ? (JSON.parse(req.postData() as string) as Record<string, unknown>) : null;
    db.calls.push({ method, path: p, body });
    if (p === "/api/me") return json(r, { user_id: "u_1", team_id: "t_1", github_login: null, email: "person@example.com", avatar_url: "", role: db.role, auth_provider: "email" });
    if (p === "/api/usage") return json(r, { month: "2026-01", tokens_in: 0, tokens_out: 0, total_runs: 0, total_tokens: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(r, { banners: [] });
    if (p === "/api/teams") return json(r, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/integrations") {
      if (!at("member")) return forbidden(r);
      if (db.fail) return json(r, { error: "Something went wrong on our side. Try again." }, 500);
      return json(r, { can_edit: at("admin"), items: db.items, migrated: 0 });
    }
    const ab = p.match(/^\/api\/aws-connections\/(\d{12})\/abilities(\/check)?$/);
    if (ab) {
      if (!at("admin")) return forbidden(r);
      const item = db.items.find((i) => i.id === `aws-${ab[1]}`)!;
      const d = item.detail as ReturnType<typeof awsDetail>;
      if (!ab[2] && body) {
        if (typeof body.metrics === "boolean") d.metrics = { ...d.metrics, on: body.metrics, switched_off: !body.metrics };
        if (Array.isArray(body.airflow_environments)) {
          const keep = body.airflow_environments as string[];
          d.airflow = { ...d.airflow, skipped: d.airflow.found.filter((e) => !keep.includes(e)), environments: keep };
        }
      }
      item.last_check = ab[2] ? new Date().toISOString() : item.last_check;
      return json(r, { account: d, status: item.status, reason: item.reason, last_check: item.last_check });
    }
    const en = p.match(/^\/api\/plugins\/([a-z]+)\/enable$/);
    if (en) {
      if (!at("admin")) return forbidden(r);
      db.items = db.items.map((i) => (i.id === en[1] ? pluginCard(i.id, i.name, i.section, true, false) : i));
      return json(r, { status: "enabled", plugin_id: en[1] });
    }
    const cr = p.match(/^\/api\/plugins\/([a-z]+)\/credentials$/);
    if (cr) {
      if (!at("admin")) return forbidden(r);
      db.items = db.items.map((i) => (i.id === cr[1] ? pluginCard(i.id, i.name, i.section, true, true) : i));
      return json(r, { status: "saved" });
    }
    if (/^\/api\/plugins\/[a-z]+\/test$/.test(p)) return json(r, { status: "ok", tool_count: 4 });
    if (p === "/api/alert-notify" && method === "GET") return at("admin") ? json(r, { teams_webhook_url: "", enabled: false }) : forbidden(r);
    if (p === "/api/alert-notify" && method === "PUT") {
      db.items = db.items.map((i) => (i.id === "teams" ? card("teams", "chat", "Microsoft Teams", "connected", "manage") : i));
      return json(r, { ok: true });
    }
    return json(r, { error: `not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `no sideways scroll at ${width}px`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

test("sections in order, each card with its status, what it does and one action", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/integrations");
  await expect(page.getByRole("heading", { name: "Integrations", level: 1 })).toBeVisible();
  const headings = page.getByRole("main").getByRole("heading", { level: 2 });
  await expect(headings).toHaveText(["Code and tickets", "Cloud", "Monitoring", "Docs and design", "Chat", "Other tools", "Data sources"]);
  await expect(page.getByTestId("integrations-summary")).toContainText("4 connected · 3 need credentials");

  const gh = page.getByTestId("integration-github");
  await expect(gh.getByText("Connected", { exact: true })).toBeVisible();
  await expect(gh.getByRole("link", { name: "Manage" })).toHaveAttribute("href", /\/settings\/integrations\/github\/?$/);
  const jira = page.getByTestId("integration-jira");
  await expect(jira.getByText("Not connected", { exact: true })).toBeVisible();
  await expect(jira.getByRole("link", { name: "Connect" })).toBeVisible();
  await expect(page.getByTestId("integration-newrelic").getByText("Connected", { exact: true })).toBeVisible();
  await expect(page.getByTestId("integration-newrelic").getByText(/Checked 1 h(ou)?r? ago|Checked 60 min ago/)).toBeVisible();

  // Switched on without credentials: said plainly, with the action to fix it.
  for (const id of ["sentry", "figma", "sanity"]) {
    const c = page.getByTestId(`integration-${id}`);
    await expect(c).toHaveAttribute("data-status", "needs_credentials");
    await expect(c.getByText("Needs credentials", { exact: true })).toBeVisible();
    await expect(c.getByText("Switched on, but no credentials are saved, so agents don't get it.")).toBeVisible();
    await expect(c.getByRole("button", { name: "Add credentials" })).toBeVisible();
  }
  await expect(page.getByRole("main").getByRole("link", { name: "Data sources" }).first()).toHaveAttribute("href", /\/data-sources\/?$/);
  await shot(page, "integrations");
});

test("an AWS account shows its abilities; an admin switches one off and deselects an environment", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/integrations");
  const aws = page.getByTestId(`integration-aws-${ACCOUNT}`);
  const summary = aws.getByTestId(`aws-abilities-${ACCOUNT}`);
  await expect(summary.getByText("Logs")).toBeVisible();
  await expect(summary.getByText("CloudWatch, us-east-1")).toBeVisible();
  await expect(summary.getByText("prod-airflow, staging-airflow")).toBeVisible();

  await aws.getByRole("button", { name: "Manage" }).click();
  const panel = aws.getByTestId(`aws-panel-${ACCOUNT}`);
  await expect(panel.getByRole("checkbox", { name: "prod-airflow" })).toBeChecked();
  await panel.getByRole("checkbox", { name: "staging-airflow" }).click();
  await expect(panel.getByRole("checkbox", { name: "staging-airflow" })).not.toBeChecked();
  await expect.poll(() => db.calls.find((c) => c.method === "PUT" && c.path.endsWith("/abilities"))?.body).toEqual({ airflow_environments: ["prod-airflow"] });
  await panel.getByRole("switch", { name: "Let agents read Metrics" }).click();
  await expect.poll(() => db.calls.filter((c) => c.method === "PUT").at(-1)?.body).toEqual({ metrics: false });
  await expect(summary.getByText("Off")).toBeVisible();

  await panel.getByRole("button", { name: "Check again" }).click();
  await expect.poll(() => db.calls.some((c) => c.method === "POST" && c.path === `/api/aws-connections/${ACCOUNT}/abilities/check`)).toBe(true);
  await shot(page, "integrations-aws-open");
});

test("an AWS role without the permissions offers the one-click stack", async ({ page }) => {
  const list = items().map((i) =>
    i.id === `aws-${ACCOUNT}`
      ? {
          ...i,
          detail: awsDetail({
            metrics: { available: false, on: false, switched_off: false },
            airflow: { available: false, on: false, switched_off: false, found: [], skipped: [], environments: [] },
            missing: ["metrics", "airflow"],
            update_url: "https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate?stackName=CoderHelmLogReaderOps",
          }),
        }
      : i,
  );
  await mockApi(page, { items: list });
  await page.goto("/settings/integrations");
  const aws = page.getByTestId(`integration-aws-${ACCOUNT}`);
  await expect(aws.getByTestId(`aws-abilities-${ACCOUNT}`).getByText("No access yet")).toHaveCount(2);
  await aws.getByRole("button", { name: "Manage" }).click();
  await expect(aws.getByRole("link", { name: "Add access in AWS" })).toHaveAttribute("href", /stackName=CoderHelmLogReaderOps/);
  await expect(aws.getByRole("switch", { name: "Let agents read Airflow" })).toBeDisabled();
});

test("adding credentials to a switched-on server makes it connected", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/integrations");
  const sentry = page.getByTestId("integration-sentry");
  await sentry.getByRole("button", { name: "Add credentials" }).click();
  await sentry.getByLabel("API token").fill("sntrys_example");
  await sentry.getByRole("button", { name: "Save and test" }).click();
  await expect(sentry).toHaveAttribute("data-status", "connected");
  expect(db.calls.find((c) => c.path === "/api/plugins/sentry/credentials")?.body).toEqual({ credentials: { api_token: "sntrys_example" } });
  expect(db.calls.some((c) => c.path === "/api/plugins/sentry/test")).toBe(true);
});

test("connecting a server that is off switches it on and asks for its credentials", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/integrations");
  const notion = page.getByTestId("integration-notion");
  await expect(notion.getByText("Not connected", { exact: true })).toBeVisible();
  await notion.getByRole("button", { name: "Connect" }).click();
  await expect(notion).toHaveAttribute("data-status", "needs_credentials");
  await expect(notion.getByLabel("API token")).toBeVisible();
});

test("a link to a card opens it (from a skill check)", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/integrations#integration-figma");
  await expect(page.getByTestId("integration-figma").getByLabel("API token")).toBeVisible();
  await page.goto("/settings/integrations#integration-aws");
  await expect(page.getByTestId(`aws-panel-${ACCOUNT}`)).toBeVisible();
});

test("members see every status but no actions", async ({ page }) => {
  await mockApi(page, { role: "member" });
  await page.goto("/settings/integrations");
  await expect(page.getByTestId("integrations-summary")).toContainText("Only admins can connect or change integrations.");
  const sentry = page.getByTestId("integration-sentry");
  await expect(sentry.getByText("Needs credentials", { exact: true })).toBeVisible();
  await expect(sentry.getByText("Ask an admin to set this up.")).toBeVisible();
  await expect(page.getByRole("main").getByRole("button", { name: /^(Connect|Add credentials|Manage|Check again)$/ })).toHaveCount(0);
  await shot(page, "integrations-member");
});

test("viewers are told who can open the page", async ({ page }) => {
  await mockApi(page, { role: "viewer" });
  await page.goto("/settings/integrations");
  await expect(page.getByTestId("integration-github")).toHaveCount(0);
});

test("a failed load offers a retry", async ({ page }) => {
  const db = await mockApi(page, { fail: true });
  await page.goto("/settings/integrations");
  await expect(page.getByText("We couldn't load your integrations")).toBeVisible();
  db.fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("integration-github")).toBeVisible();
});

test("old addresses lead to Integrations", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/plugins");
  await expect(page).toHaveURL(/\/settings\/integrations\/?#other-tools$/);
  await expect(page.getByTestId("integration-linear")).toBeVisible();
});
