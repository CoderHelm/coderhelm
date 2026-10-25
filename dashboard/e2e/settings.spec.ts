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
  { title: "API keys", href: "/settings/api-keys", view: "admin", edit: "admin", heading: "API keys" },
  { title: "Repositories", href: "/settings/repos", view: "member", edit: "admin", heading: "Repositories" },
  { title: "Workflow", href: "/settings/workflow", view: "admin", edit: "admin", heading: "Workflow" },
  { title: "Guardrails", href: "/settings/guardrails", view: "admin", edit: "admin", heading: "Guardrails" },
  { title: "Team voice", href: "/settings/voice", view: "admin", edit: "admin", heading: "Team voice" },
  { title: "Custom instructions", href: "/settings/instructions", view: "admin", edit: "admin", heading: "Custom instructions" },
  { title: "AI models", href: "/settings/models", view: "admin", edit: "admin", heading: "AI models" },
  { title: "Alert routes", href: "/settings/alerts", view: "member", edit: "admin", heading: "Alert routes" },
  { title: "Data sources", href: "/data-sources", view: "admin", edit: "admin", heading: "Data sources" },
  { title: "Skills", href: "/skills", view: "member", edit: "member", heading: "Skills" },
  { title: "Integrations", href: "/settings/integrations", view: "member", edit: "admin", heading: "Integrations" },
  { title: "Token limit", href: "/settings/budget", view: "member", edit: "admin", heading: "Token limit" },
];

const LEVEL: Record<Role, number> = { viewer: 0, member: 1, billing: 2, admin: 3, owner: 4 };
const atLeast = (role: Role, min: Role) => LEVEL[role] >= LEVEL[min];

interface Backend {
  role: Role;
  /** The three monthly limits, in tokens (0 = no limit). */
  limits: { new_tokens: number; cache_read: number; cache_write: number };
  /** An old single limit that counts every kind (0 = none); replaced on save. */
  legacyAllTokens: number;
  usedTokens: number;
  cacheRead: number;
  cacheWrite: number;
  prefs: Record<string, boolean>;
  calls: { method: string; path: string; body: Record<string, unknown> | null }[];
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { role: "admin", limits: { new_tokens: 5_000_000, cache_read: 0, cache_write: 0 }, legacyAllTokens: 0, usedTokens: 1_200_000, cacheRead: 30_000_000, cacheWrite: 4_000_000, prefs: { email_run_complete: true, email_run_failed: true, email_weekly_summary: true, email_token_warning: true }, calls: [], ...init };
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
    if (p === "/api/usage") {
      // Each set limit with what it counts, the way the gateway lists them.
      const used = { new_tokens: db.usedTokens, cache_read: db.cacheRead, cache_write: db.cacheWrite };
      const total = db.usedTokens + db.cacheRead + db.cacheWrite;
      const limits = db.legacyAllTokens > 0
        ? [{ kind: "all_tokens", max: db.legacyAllTokens, used: total }]
        : (["new_tokens", "cache_read", "cache_write"] as const).filter((k) => db.limits[k] > 0).map((k) => ({ kind: k, max: db.limits[k], used: used[k] }));
      return json(route, {
        month: "2026-01", total_tokens: total, tokens_in: db.usedTokens / 2, tokens_out: db.usedTokens / 2,
        cache_read_tokens: db.cacheRead, cache_write_tokens: db.cacheWrite, new_tokens: db.usedTokens,
        limits, limits_legacy: db.legacyAllTokens > 0, total_runs: 14, max_tokens: db.legacyAllTokens,
      });
    }
    if (p === "/api/settings/budget" && method === "GET") {
      return json(route, { max_new_tokens: db.limits.new_tokens, max_cache_read_tokens: db.limits.cache_read, max_cache_write_tokens: db.limits.cache_write, legacy: db.legacyAllTokens > 0, max_tokens: db.legacyAllTokens, limit_counts_cache: db.legacyAllTokens > 0 });
    }
    if (p === "/api/settings/budget" && method === "PUT") {
      // The gateway lets admins and the owner change the limits.
      if (!admin) return forbidden(route);
      db.limits = { new_tokens: Number(body?.max_new_tokens ?? 0), cache_read: Number(body?.max_cache_read_tokens ?? 0), cache_write: Number(body?.max_cache_write_tokens ?? 0) };
      db.legacyAllTokens = 0;
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
    // Members may read routes and alerts; only admins change them.
    if (p === "/api/alert-routes") return atLeast(db.role, "member") ? json(route, { endpoint_path: "/webhooks/alerts/sns", routes: [] }) : forbidden(route);
    if (p === "/api/alerts") return atLeast(db.role, "member") ? json(route, { alerts: [], next: null }) : forbidden(route);
    if (p === "/api/alert-budget") return admin ? json(route, { daily_tokens: 2_000_000, used_24h_tokens: 0, open_runs: 0, open_run_reserve_tokens: 0, max_runs_per_rule_per_day: 3 }) : forbidden(route);
    if (p === "/api/alert-notify") return admin ? json(route, { enabled: false, webhooks: { teams: { set: false, hint: "" }, slack: { set: false, hint: "" } } }) : forbidden(route);
    if (p === "/api/data-sources") return json(route, { sources: [] });
    if (p === "/api/data-sources/activity") return json(route, { events: [] });
    if (p === "/api/tools") return json(route, { tools: [], pending_asks: 0 });
    if (p === "/api/tools/asks") return json(route, { asks: [] });
    if (p === "/api/integrations") return atLeast(db.role, "member") ? json(route, { can_edit: admin, migrated: 0, items: [{ id: "github", section: "code", name: "GitHub", does: "", status: "connected", reason: "", action: "manage", last_check: "", manage_href: "", detail: {} }, { id: "sentry", section: "monitoring", name: "Sentry", does: "", status: "needs_credentials", reason: "", action: "add_credentials", last_check: "", manage_href: "", detail: { plugin: { id: "sentry", name: "Sentry", description: "", category: "Monitoring", tier: 1, icon: "sentry", credential_fields: [], docs_url: "", repo_url: "", default_prompt: "", recommended_permissions: "" } } }] }) : forbidden(route);
    if (p === "/api/plugins/catalog") return json(route, { plugins: [] });
    if (p === "/api/plugins") return json(route, { plugins: [] });
    if (p === "/api/integrations/jira/check") {
      return admin ? json(route, { ready: false, secret_configured: false, configured_repos: { total: 0, enabled: 0 }, enabled_repos: [], jira_events_seen: false, installation_id: 7, team_id: "t_1" }) : forbidden(route);
    }
    if (p === "/api/integrations/jira/config") return json(route, { default_project: "", trigger_label: "coderhelm", list_projects_url: "", create_ticket_url: "", add_comment_url: "", site_url: "", projects: [] });
    if (p === "/api/integrations/jira/events") return json(route, { events: [], total: 0 });
    if (p === "/api/settings/model-provider") return admin ? json(route, { provider: "anthropic", api_key_masked: null, primary_model: null, heavy_model: null }) : forbidden(route);
    if (p === "/api/settings/workflow") return json(route, { commit_openspec: false, default_destination: "github", allow_plan_log_analyzer: false });
    if (p === "/api/settings/git-conventions") return json(route, { branch: "", commit: "", pr_title: "", defaults: { branch: "coderhelm/{ticket_lower}", commit: "{ticket}: {title}", pr_title: "{ticket}: {title}" }, tokens: ["ticket", "ticket_lower", "slug", "summary", "title"] });
    if (p === "/api/aws-connections") return json(route, { connections: [] });
    if (p === "/api/recommendations") return json(route, { recommendations: [] });
    if (p === "/api/recommendations/notify") return json(route, { notify_mode: "off", webhooks: { teams: { set: false, hint: "" }, slack: { set: false, hint: "" } } });
    if (p === "/api/rules/global") return json(route, { rules: [] });
    if (p === "/api/voice/global" || p === "/api/instructions/global" || p === "/api/agents/global") return json(route, { content: "" });
    if (p === "/api/skills") return json(route, { repos: [], items: [], can_manage: atLeast(db.role, "admin") });
    if (p === "/api/skills/stats") return json(route, { error: "not found" }, 404);
    if (p === "/api/api-keys") return admin ? json(route, { keys: [], scopes: [{ key: "view", label: "See", always: true, allowed: true }], limits: { default_rate_per_minute: 600, min_rate_per_minute: 10, max_rate_per_minute: 3000, max_expiry_days: 365, max_keys: 50 } }) : forbidden(route);
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
  await expect(hubLink(page, "Integrations")).toContainText("1 needs credentials · 1 connected");
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
test(`the ${role} sets and removes each token limit on its own`, async ({ page }) => {
  const db = await mockApi(page, { role });
  await page.goto("/settings/");
  await hubLink(page, "Token limit").click();
  await expect(page.getByRole("heading", { level: 1, name: "Token limit" })).toBeVisible();
  // Only the new tokens limit is set: one bar on the page, one in the sidebar.
  const pageBars = page.getByTestId("usage-limits");
  await expect(pageBars.getByRole("progressbar")).toHaveCount(1);
  await expect(pageBars.getByRole("progressbar", { name: "New tokens limit used" })).toHaveAttribute("aria-valuenow", "24");
  await expect(page.getByTestId("sidebar-token-meter").getByRole("progressbar")).toHaveCount(1);

  const fresh = page.getByLabel("New tokens (input + output)");
  const read = page.getByLabel("Cache read tokens");
  const write = page.getByLabel("Cache write tokens");
  await expect(fresh).toHaveValue("5");
  await expect(read).toHaveValue("");
  await expect(write).toHaveValue("");
  await expect(page.getByText("Input the model reads back from the prompt cache")).toBeVisible();

  await read.fill("-1");
  await expect(page.getByText("Enter a number of 0 or more.")).toBeVisible();
  // One save bar: it counts the change, names what to fix and saves nothing until it is fixed.
  const bar = page.getByRole("region", { name: "Save changes" });
  await expect(bar).toContainText("Fix the limits marked in red first.");
  await bar.getByRole("button", { name: "Save changes" }).click();
  expect(db.calls.filter((c) => c.method === "PUT" && c.path === "/api/settings/budget")).toHaveLength(0);

  await fresh.fill("2.5");
  await read.fill("40");
  await expect(page.getByText("Runs pause after 2.5M in a month.")).toBeVisible();
  await expect(page.getByText("Runs pause after 40M in a month.")).toBeVisible();
  await expect(bar).toContainText("2 unsaved changes");
  await bar.getByRole("button", { name: "Save changes" }).click();
  await expect(bar).toHaveCount(0);
  await expect(page.getByText("Token limits saved: 2 of 3 set")).toBeVisible();
  const puts = db.calls.filter((c) => c.method === "PUT" && c.path === "/api/settings/budget");
  expect(puts.at(-1)?.body).toEqual({ max_new_tokens: 2_500_000, max_cache_read_tokens: 40_000_000, max_cache_write_tokens: null });
  // Two bars now, each against what it counts; the sidebar follows without a reload.
  await expect(pageBars.getByRole("progressbar")).toHaveCount(2);
  const side = page.getByTestId("sidebar-token-meter");
  await expect(side.getByTestId("token-meter-new_tokens")).toContainText("1.2M / 2.5M");
  await expect(side.getByTestId("token-meter-cache_read")).toContainText("30M / 40M");
  await expect(side.getByTestId("token-meter-cache_write")).toHaveCount(0);
  await shot(page, `token-limit-${role}-1280.png`);

  await fresh.fill("");
  await read.fill("");
  await read.press("Enter");
  await expect(page.getByText("Token limits removed")).toBeVisible();
  expect(db.calls.filter((c) => c.method === "PUT" && c.path === "/api/settings/budget").at(-1)?.body).toEqual({ max_new_tokens: null, max_cache_read_tokens: null, max_cache_write_tokens: null });
  expect(db.limits).toEqual({ new_tokens: 0, cache_read: 0, cache_write: 0 });
  await expect(page.getByTestId("sidebar-token-meter")).toHaveCount(0);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(page.getByText("tokens, no limit set")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await shot(page, `token-limit-${role}-375.png`);
});
}

test("all three limits: three bars, and a reached cache write limit is the one named", async ({ page }) => {
  await mockApi(page, { role: "owner", limits: { new_tokens: 20_000_000, cache_read: 100_000_000, cache_write: 4_000_000 } });
  await page.goto("/settings/budget/");
  const side = page.getByTestId("sidebar-token-meter");
  await expect(side.getByRole("progressbar")).toHaveCount(3);
  await expect(side.getByTestId("token-meter-value")).toHaveText(["1.2M / 20M", "30M / 100M", "4M / 4M"]);
  await expect(page.getByRole("alert").filter({ hasText: "Cache write limit reached" })).toContainText("4M of your 4M cache write limit");
  await expect(page.getByRole("region", { name: /Used in/ }).getByText("Limit reached")).toBeVisible();
  await shot(page, "token-limit-three-1280.png");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(page.getByTestId("usage-limits").getByRole("progressbar")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await shot(page, "token-limit-three-375.png");
});

test("an old single limit that counts every kind keeps showing until the new limits are saved", async ({ page }) => {
  const db = await mockApi(page, { role: "admin", limits: { new_tokens: 0, cache_read: 0, cache_write: 0 }, legacyAllTokens: 200_000_000 });
  await page.goto("/settings/budget/");
  await expect(page.getByText("Current limit: 200M tokens of every kind")).toBeVisible();
  await expect(page.getByTestId("sidebar-token-meter").getByTestId("token-meter-all_tokens")).toContainText("35.2M / 200M");
  await expect(page.getByLabel("New tokens (input + output)")).toHaveValue("");
  await page.getByLabel("New tokens (input + output)").fill("20");
  await page.getByRole("region", { name: "Save changes" }).getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Token limits saved: 1 of 3 set")).toBeVisible();
  expect(db.legacyAllTokens).toBe(0);
  await expect(page.getByText("Current limit: 200M tokens of every kind")).toHaveCount(0);
  await expect(page.getByTestId("sidebar-token-meter").getByTestId("token-meter-new_tokens")).toContainText("1.2M / 20M");
});

test("a member sees the token limits without a form", async ({ page }) => {
  const db = await mockApi(page, { role: "member", limits: { new_tokens: 5_000_000, cache_read: 0, cache_write: 8_000_000 } });
  await page.goto("/settings/budget/");
  await expect(page.getByRole("heading", { level: 1, name: "Token limit" })).toBeVisible();
  await expect(page.getByTestId("limit-new_tokens")).toContainText("5M a month");
  await expect(page.getByTestId("limit-cache_read")).toContainText("No limit");
  await expect(page.getByTestId("limit-cache_write")).toContainText("8M a month");
  await expect(page.getByText("Only admins and the owner can change the limits.")).toBeVisible();
  await expect(page.getByLabel("New tokens (input + output)")).toHaveCount(0);
  expect(db.calls.some((c) => c.method === "PUT")).toBe(false);
  await shot(page, "token-limit-member-1280.png");
});

test("each meter counts what its limit counts; the page total is all four parts", async ({ page }) => {
  await mockApi(page, { role: "member" });
  // What the gateway returns: total_tokens is the four parts added up; each
  // limit carries its own count (new tokens = new input + output).
  const usage = {
    month: "2026-10",
    total_tokens: 71_320_000,
    tokens_in: 120_000,
    cache_read_tokens: 61_400_000,
    cache_write_tokens: 8_800_000,
    tokens_out: 1_000_000,
    new_tokens: 1_120_000,
    cache_hit_rate: 61_400_000 / 70_320_000,
    limits: [
      { kind: "new_tokens", max: 20_000_000, used: 1_120_000 },
      { kind: "cache_read", max: 200_000_000, used: 61_400_000 },
    ],
    limits_legacy: false,
    features: [
      { feature: "run", total_tokens: 60_000_000, tokens_in: 100_000, cache_read_tokens: 52_000_000, cache_write_tokens: 7_100_000, tokens_out: 800_000 },
      { feature: "review", total_tokens: 11_320_000, tokens_in: 20_000, cache_read_tokens: 9_400_000, cache_write_tokens: 1_700_000, tokens_out: 200_000 },
    ],
    total_runs: 64,
    max_tokens: 0,
  };
  await page.route((url) => url.pathname === "/api/usage", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(usage) }),
  );

  // Sidebar: one small bar per set limit; the four parts on hover.
  await page.goto("/settings/");
  const side = page.getByTestId("sidebar-token-meter");
  await expect(side.getByTestId("token-meter-value")).toHaveText(["1.1M / 20M", "61.4M / 200M"]);
  await expect(side.getByTestId("token-meter-cache_write")).toHaveCount(0);
  const hover = await side.getAttribute("title");
  expect(hover).toContain("New input 120K");
  expect(hover).toContain("Read from cache 61.4M");
  expect(hover).toContain("Written to cache 8.8M");
  expect(hover).toContain("Output 1M");
  expect(hover).toContain("Cache hit rate 87%");

  // Settings hub row: the limit closest to being reached, named.
  await expect(hubLink(page, "Token limit")).toContainText("Cache read: 61.4M of 200M used this month");

  // Token limit page: the total equals the four parts from the API, plus the
  // hit rate, the split by feature, and no money anywhere.
  await page.goto("/settings/budget/");
  await expect(page.getByRole("region", { name: /Used in/ })).toContainText("71.3M tokens in all");
  const parts = page.getByTestId("usage-part");
  await expect(parts).toHaveCount(4);
  await expect(parts.locator("dt")).toHaveText(["New input", "Read from cache", "Written to cache", "Output"]);
  const values = await parts.locator("dd").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-value"))));
  expect(values).toEqual([120_000, 61_400_000, 8_800_000, 1_000_000]);
  expect(values.reduce((a, b) => a + b, 0)).toBe(usage.total_tokens);
  await expect(page.getByTestId("usage-limits").getByTestId("token-meter-value")).toHaveText(["1.1M / 20M", "61.4M / 200M"]);
  await expect(page.getByTestId("cache-hit-rate")).toContainText("Cache hit rate 87%");
  // The breakdown by kind and by feature sits behind Details.
  await page.getByText("Details", { exact: true }).click();
  await expect(page.getByRole("list", { name: "Tokens by feature" })).toContainText("Ticket runs");
  await expect(page.getByRole("list", { name: "Tokens by feature" })).toContainText("PR reviews");
  await expect(page.locator("main")).not.toContainText("$");
  await shot(page, "token-limit-four-parts-1280.png");

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/settings/budget/");
  await expect(page.getByTestId("usage-part")).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await shot(page, "token-limit-four-parts-375.png");
});

test("the token limit page explains a failed load and retries", async ({ page }) => {
  await mockApi(page, { role: "owner" });
  let fail = true;
  await page.route((url) => url.pathname === "/api/usage", (route) =>
    fail ? route.fulfill({ status: 500, body: "" }) : route.fallback(),
  );
  await page.goto("/settings/budget/");
  await expect(page.getByText("Couldn't load the token limits")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByLabel("New tokens (input + output)")).toHaveValue("5");
});

test("the token usage email switch saves and stays off", async ({ page }) => {
  const db = await mockApi(page, { role: "member" });
  await page.goto("/settings/notifications/");
  await expect(page.getByText("Every Monday: runs, reviews, alerts and usage from the past week.")).toBeVisible();
  const sw = page.getByRole("switch", { name: "Usage warnings" });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("toast").filter({ hasText: "Usage warnings off" })).toBeVisible();
  const put = db.calls.filter((c) => c.method === "PUT" && c.path === "/api/notifications").at(-1);
  expect(put?.body).toMatchObject({ email_token_warning: false, email_weekly_summary: true });
  await page.reload();
  await expect(page.getByRole("switch", { name: "Usage warnings" })).toHaveAttribute("aria-checked", "false");
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

test("repositories: the list toolbar filters on and off repos and searches by name", async ({ page }) => {
  await mockApi(page, { role: "admin" });
  await page.goto("/settings/repos/");
  const list = page.getByRole("list", { name: "Repositories" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("switch", { name: "Let Coderhelm work on your-team/web" })).toHaveAttribute("aria-checked", "true");
  const toggles = page.getByRole("group", { name: "Show repos" });
  await toggles.getByRole("button", { name: /^Off\s*1$/ }).click();
  await expect(page).toHaveURL(/status=off/);
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list.getByText("your-team/api")).toBeVisible();
  await page.goBack();
  await page.getByRole("searchbox", { name: "Search repos" }).fill("web");
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Refresh from GitHub" })).toBeVisible();
});
