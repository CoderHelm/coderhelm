import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Every API call is answered here. Nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

type Role = "viewer" | "member" | "billing" | "admin" | "owner";

// Every item the Settings hub lists, the lowest role that can open it, the
// lowest role that can change it, and the page heading it leads to. This is
// the spec for the hub: an item added to the hub without a row here fails.
const ITEMS: { title: string; href: string; view: Role; edit: Role; heading: string | RegExp }[] = [
  { title: "Notifications", href: "/settings/notifications", view: "viewer", edit: "viewer", heading: "Notifications" },
  { title: "Security", href: "/settings/security", view: "viewer", edit: "viewer", heading: "Security" },
  { title: "Team", href: "/settings/team", view: "viewer", edit: "admin", heading: "Team" },
  { title: "Repositories", href: "/settings/repos", view: "member", edit: "admin", heading: "Repositories" },
  { title: "GitHub", href: "/settings/github", view: "member", edit: "admin", heading: "GitHub" },
  { title: "Workflow", href: "/settings/workflow", view: "admin", edit: "admin", heading: "Workflow" },
  { title: "Guardrails", href: "/settings/guardrails", view: "admin", edit: "admin", heading: "Guardrails" },
  { title: "Team voice", href: "/settings/voice", view: "admin", edit: "admin", heading: "Team voice" },
  { title: "Custom instructions", href: "/settings/instructions", view: "admin", edit: "admin", heading: "Custom instructions" },
  { title: "AI models", href: "/settings/models", view: "admin", edit: "admin", heading: "AI models" },
  { title: "Alert routes", href: "/settings/alerts", view: "admin", edit: "admin", heading: "Alert routes" },
  { title: "Data sources", href: "/data-sources", view: "admin", edit: "admin", heading: /check facts against your real systems/ },
  { title: "AWS", href: "/settings/aws", view: "admin", edit: "admin", heading: "AWS" },
  { title: "Skills", href: "/skills", view: "member", edit: "member", heading: "Skills" },
  { title: "Jira", href: "/settings/jira", view: "admin", edit: "admin", heading: "Jira" },
  { title: "MCP servers", href: "/settings/plugins", view: "admin", edit: "admin", heading: "MCP servers" },
  { title: "Token limit", href: "/settings/budget", view: "member", edit: "admin", heading: "Token limit" },
];

const LEVEL: Record<Role, number> = { viewer: 0, member: 1, billing: 2, admin: 3, owner: 4 };
const atLeast = (role: Role, min: Role) => LEVEL[role] >= LEVEL[min];

interface Backend {
  role: Role;
  maxTokens: number;
  usedTokens: number;
  prefs: Record<string, boolean>;
  calls: { method: string; path: string; body: Record<string, unknown> | null }[];
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { role: "admin", maxTokens: 5_000_000, usedTokens: 1_200_000, prefs: { email_run_complete: true, email_run_failed: true, email_weekly_summary: true, email_token_warning: true }, calls: [], ...init };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const forbidden = (route: Route) => json(route, { error: "Forbidden" }, 403);
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    const body = req.postData() ? (JSON.parse(req.postData() as string) as Record<string, unknown>) : null;
    db.calls.push({ method, path: p, body });
    const admin = atLeast(db.role, "admin");

    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "person@example.com", avatar_url: "", role: db.role, auth_provider: "email", mfa_enabled: false });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: db.usedTokens, tokens_in: db.usedTokens / 2, tokens_out: db.usedTokens / 2, total_runs: 14, max_tokens: db.maxTokens });
    if (p === "/api/settings/budget" && method === "GET") return json(route, { max_tokens: db.maxTokens });
    if (p === "/api/settings/budget" && method === "PUT") {
      // The gateway lets admins and the owner change the limit.
      if (!admin) return forbidden(route);
      db.maxTokens = Number(body?.max_tokens ?? 0);
      return route.fulfill({ status: 200, body: "" });
    }
    if (p === "/api/notifications" && method === "GET") return json(route, db.prefs);
    if (p === "/api/notifications" && method === "PUT") {
      db.prefs = { ...db.prefs, ...(body as Record<string, boolean>) };
      return route.fulfill({ status: 200, body: "" });
    }
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "your-team/web", enabled: true, ticket_source: "github", onboard_status: "ready" }, { name: "your-team/api", enabled: false, ticket_source: "github" }] });
    if (p === "/api/github/installation-status") return json(route, { status: "connected", github_org: "your-team", installation_id: 7 });
    if (p === "/api/users") return admin ? json(route, { users: [{ user_id: "u_1", email: "person@example.com", role: db.role, status: "active" }] }) : forbidden(route);
    if (p === "/api/alert-routes") return admin ? json(route, { endpoint_path: "/webhooks/alerts/sns", routes: [] }) : forbidden(route);
    if (p === "/api/alert-budget") return admin ? json(route, { daily_tokens: 2_000_000, used_24h_tokens: 0, open_runs: 0, open_run_reserve_tokens: 0, max_runs_per_rule_per_day: 3 }) : forbidden(route);
    if (p === "/api/alert-notify") return admin ? json(route, { teams_webhook_url: "", enabled: false }) : forbidden(route);
    if (p === "/api/data-sources") return json(route, { sources: [] });
    if (p === "/api/data-sources/activity") return json(route, { events: [] });
    if (p === "/api/tools") return json(route, { tools: [], pending_asks: 0 });
    if (p === "/api/tools/asks") return json(route, { asks: [] });
    if (p === "/api/plugins/catalog") return json(route, { plugins: [] });
    if (p === "/api/plugins") return json(route, { plugins: [] });
    if (p === "/api/integrations/jira/check") {
      return admin ? json(route, { ready: false, secret_configured: false, configured_repos: { total: 0, enabled: 0 }, enabled_repos: [], jira_events_seen: false, installation_id: 7, team_id: "t_1" }) : forbidden(route);
    }
    if (p === "/api/integrations/jira/config") return json(route, { default_project: "", trigger_label: "coderhelm", list_projects_url: "", create_ticket_url: "", add_comment_url: "", site_url: "", projects: [] });
    if (p === "/api/integrations/jira/events") return json(route, { events: [], total: 0 });
    if (p === "/api/settings/model-provider") return admin ? json(route, { provider: "anthropic", api_key_masked: null, primary_model: null, heavy_model: null }) : forbidden(route);
    if (p === "/api/settings/workflow") return json(route, { commit_openspec: false, default_destination: "github", allow_plan_log_analyzer: false });
    if (p === "/api/aws-connections") return json(route, { connections: [] });
    if (p === "/api/recommendations") return json(route, { recommendations: [] });
    if (p === "/api/recommendations/notify") return json(route, { notify_mode: "off", teams_webhook_url: "" });
    if (p === "/api/rules/global") return json(route, { rules: [] });
    if (p === "/api/voice/global" || p === "/api/instructions/global" || p === "/api/agents/global") return json(route, { content: "" });
    if (p === "/api/skills") return json(route, { repos: [], items: [], can_manage: atLeast(db.role, "admin") });
    if (p === "/api/skills/stats") return json(route, { error: "not found" }, 404);
    return json(route, { error: `not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

// A hub row, found by where it leads (titles such as "Team" and "Team voice"
// overlap, links do not).
const hubLink = (page: Page, title: string) => {
  const item = ITEMS.find((i) => i.title === title);
  if (!item) throw new Error(`no hub item ${title}`);
  return page.getByRole("main").locator(`a[href="${item.href}"], a[href="${item.href}/"]`);
};

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.screenshot({ path: path.join(SHOTS_DIR, name), fullPage: true });
}

for (const role of ["owner", "admin", "member"] as Role[]) {
  test(`every Settings item a ${role} sees opens its page`, async ({ page }) => {
    // The dev server compiles each page on its first visit; a cold run opens all of them.
    test.setTimeout(300_000);
    await mockApi(page, { role });
    await page.goto("/settings/");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

    const visible = ITEMS.filter((i) => atLeast(role, i.view));
    const hidden = ITEMS.filter((i) => !atLeast(role, i.view));
    await expect(hubLink(page, visible[visible.length - 1].title)).toBeVisible();
    for (const item of hidden) await expect(hubLink(page, item.title)).toHaveCount(0);

    for (const item of visible) {
      const link = hubLink(page, item.title);
      await expect(link, item.title).toHaveAttribute("href", new RegExp(`^${item.href}/?$`));
      // Items the person can open but not change say so before the click.
      await expect(link.getByText("View only"), item.title).toHaveCount(atLeast(role, item.edit) ? 0 : 1);

      await link.click();
      await expect(page, item.title).toHaveURL(new RegExp(`${item.href}/?$`));
      await expect(page.getByRole("heading", { level: 1, name: item.heading }), item.title).toBeVisible();
      await expect(page.getByText("This page needs a different role")).toHaveCount(0);
      if (item.href.startsWith("/settings/")) {
        const crumb = page.getByRole("navigation", { name: "Breadcrumb" });
        await expect(crumb.getByRole("link", { name: "Settings" })).toHaveAttribute("href", /^\/settings\/?$/);
        await expect(crumb.getByText(item.title, { exact: true })).toHaveAttribute("aria-current", "page");
      }
      await page.goto("/settings/");
      await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    }

    await expect(page.getByRole("heading", { name: "Danger zone" })).toHaveCount(role === "owner" ? 1 : 0);
  });
}

test("hub shows current values at a glance", async ({ page }) => {
  await mockApi(page, { role: "admin" });
  await page.goto("/settings/");
  await expect(hubLink(page, "Token limit")).toContainText("1.2M of 5M used this month");
  await expect(hubLink(page, "Repositories")).toContainText("1 of 2 repositories on");
  await expect(hubLink(page, "GitHub")).toContainText("Connected to your-team");
  await expect(hubLink(page, "Team")).toContainText("1 person");
  await expect(hubLink(page, "Alert routes")).toContainText("No routes yet");
  await expect(hubLink(page, "Security")).toContainText("Two step sign in off");
  await shot(page, "settings-hub-admin-1280.png");

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/settings/");
  await expect(hubLink(page, "Token limit")).toContainText("1.2M of 5M");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await shot(page, "settings-hub-admin-375.png");
});

test("a member sees the hub with view only items", async ({ page }) => {
  await mockApi(page, { role: "member" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/settings/");
  await expect(hubLink(page, "Token limit")).toContainText("View only");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await shot(page, "settings-hub-member-375.png");
});

for (const role of ["owner", "admin"] as Role[]) {
test(`the ${role} sets and removes the token limit`, async ({ page }) => {
  const db = await mockApi(page, { role });
  await page.goto("/settings/");
  await hubLink(page, "Token limit").click();
  await expect(page.getByRole("heading", { level: 1, name: "Token limit" })).toBeVisible();
  await expect(page.getByText("of 5M tokens")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Share of the monthly limit used" })).toHaveAttribute("aria-valuenow", "24");

  const input = page.getByLabel("Millions of tokens a month");
  await expect(input).toHaveValue("5");
  await input.fill("-1");
  await expect(page.getByText("Enter a number of 0 or more.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();

  await input.fill("2.5");
  await expect(page.getByText("Runs pause after 2.5M tokens in a month.")).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Token limit set to 2.5M a month")).toBeVisible();
  const puts = db.calls.filter((c) => c.method === "PUT" && c.path === "/api/settings/budget");
  expect(puts.at(-1)?.body).toEqual({ max_tokens: 2_500_000 });
  await expect(page.getByText("of 2.5M tokens")).toBeVisible();
  // The sidebar meter picks up the new limit without a reload.
  await expect(page.getByText("1.2M / 2.5M")).toBeVisible();
  await shot(page, `token-limit-${role}-1280.png`);

  await input.fill("");
  await input.press("Enter");
  await expect(page.getByText("Token limit removed")).toBeVisible();
  expect(db.calls.filter((c) => c.method === "PUT" && c.path === "/api/settings/budget").at(-1)?.body).toEqual({ max_tokens: 0 });
  expect(db.maxTokens).toBe(0);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(page.getByText("tokens, no limit set")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await shot(page, `token-limit-${role}-375.png`);
});
}

test("a member sees the token limit without a form", async ({ page }) => {
  const db = await mockApi(page, { role: "member" });
  await page.goto("/settings/budget/");
  await expect(page.getByRole("heading", { level: 1, name: "Token limit" })).toBeVisible();
  await expect(page.getByText("5M tokens a month")).toBeVisible();
  await expect(page.getByText("Only admins and the owner can change the limit.")).toBeVisible();
  await expect(page.getByLabel("Millions of tokens a month")).toHaveCount(0);
  expect(db.calls.some((c) => c.method === "PUT")).toBe(false);
  await shot(page, "token-limit-member-1280.png");
});

test("the token limit page explains a failed load and retries", async ({ page }) => {
  await mockApi(page, { role: "owner" });
  let fail = true;
  await page.route((url) => url.pathname === "/api/usage", (route) =>
    fail ? route.fulfill({ status: 500, body: "" }) : route.fallback(),
  );
  await page.goto("/settings/budget/");
  await expect(page.getByText("Could not load the token limit")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByLabel("Millions of tokens a month")).toHaveValue("5");
});

test("the token usage email switch saves and stays off", async ({ page }) => {
  const db = await mockApi(page, { role: "member" });
  await page.goto("/settings/notifications/");
  await expect(page.getByText("Every Monday: runs, reviews, alerts and usage from the past week.")).toBeVisible();
  const sw = page.getByRole("switch", { name: "Token usage warnings" });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  const put = db.calls.filter((c) => c.method === "PUT" && c.path === "/api/notifications").at(-1);
  expect(put?.body).toMatchObject({ email_token_warning: false, email_weekly_summary: true });
  await page.reload();
  await expect(page.getByRole("switch", { name: "Token usage warnings" })).toHaveAttribute("aria-checked", "false");
});

test("a page above your role says why instead of bouncing you", async ({ page }) => {
  await mockApi(page, { role: "member" });
  await page.goto("/settings/models/");
  await expect(page.getByText("This page needs a different role")).toBeVisible();
  await expect(page.getByText("Only an admin or the owner can open this page.", { exact: false })).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/models\/?$/);
  await page.getByRole("link", { name: "Back to Settings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
});
