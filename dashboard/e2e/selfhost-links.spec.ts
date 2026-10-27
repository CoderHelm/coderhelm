import { expect, test, type Page, type Route } from "@playwright/test";

// A self-hosted install's dashboard links to the install, never to the hosted
// service: its API calls, the address shown for API keys, and the GitHub App
// buttons (which go through the install's own /auth/github/app, so they open
// the install's app). Public docs on docs.coderhelm.com are the one exception.

const ME = {
  user_id: "u_1",
  team_id: "t_1",
  github_login: null,
  email: "owner@example.org",
  avatar_url: "",
  role: "owner",
  auth_provider: "email",
  mfa_enabled: false,
  platform_admin: true,
};

const KEYS = {
  keys: [],
  scopes: [{ key: "runs:read", label: "Read runs", always: true, allowed: true }],
  limits: { default_rate_per_minute: 60, min_rate_per_minute: 1, max_rate_per_minute: 600, max_expiry_days: 365, max_keys: 20 },
};

const JIRA_CHECK = {
  ready: false, secret_configured: false, configured_repos: { total: 1, enabled: 1 }, enabled_repos: ["your-team/web"], jira_events_seen: false,
  last_jira_event_at: null, jira_event_count: 0, installation_id: 7, team_id: "t_1", forge_secret: "forge-secret-value",
};
const JIRA_CONFIG = { default_project: "", trigger_label: "coderhelm", list_projects_url: "", create_ticket_url: "", add_comment_url: "", site_url: "", projects: [] };

/** Hybrid with CoderHelm's Jira relay on (Settings, System, Hybrid). */
function hybridWithJira(jira: boolean) {
  return {
    available: true, hosted_url: "", registered: true, install_id: "ins_abcdefghijklmnopqrstuvwx", cloudfront: "d111test.cloudfront.net", verified: true, name: null,
    github: { mode: "own", links: [], app_slug: null },
    integrations: [{ id: "jira", name: "Jira (Forge app)", mode: "hosted", through_coderhelm: "Ticket events.", stays_with_you: "Ticket contents.", uses_coderhelm: jira }],
    sharing: { enabled: false, payloads: false }, checks: [],
  };
}

async function selfHosted(page: Page, extra: (p: string) => unknown = () => undefined) {
  const outside: string[] = [];
  const calls: string[] = [];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.pathname === "/runtime-config.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.__CODERHELM_CONFIG__ = ${JSON.stringify({ apiUrl: "", streamUrl: "", selfHosted: true, siteUrl: null, supportEmail: "it@example.org" })};`,
    }),
  );
  await page.route((url) => !["localhost", "127.0.0.1"].includes(url.hostname), (route) => {
    outside.push(route.request().url());
    return route.abort();
  });
  await page.route((url) => ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/(api|auth)\//.test(url.pathname), (route) => {
    const u = new URL(route.request().url());
    calls.push(u.pathname);
    const p = u.pathname;
    const answer = extra(p);
    if (answer !== undefined) return json(route, answer);
    if (p === "/api/me") return json(route, ME);
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/api-keys") return json(route, KEYS);
    if (p === "/api/repos") return json(route, { repos: [] });
    if (p === "/api/github/installation-status") return json(route, { installed: false });
    if (p === "/api/integrations") return json(route, { can_edit: true, migrated: 0, items: [] });
    return json(route, {});
  });
  return { outside, calls };
}

/** Every link on the page that goes to coderhelm.com, other than the public docs. */
async function hostedLinks(page: Page): Promise<string[]> {
  const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
  return hrefs.filter((h) => {
    const host = new URL(h).hostname;
    return (host === "coderhelm.com" || host.endsWith(".coderhelm.com")) && host !== "docs.coderhelm.com";
  });
}

test("API keys: the install's own address, and its own API", async ({ page, baseURL }) => {
  const { outside, calls } = await selfHosted(page);
  await page.goto("/settings/api-keys");
  await expect(page.getByText("How keys work")).toBeVisible();
  const origin = new URL(baseURL!).origin;
  await expect(page.getByText(`Send the key as`).locator("code").nth(1)).toHaveText(origin);
  await expect(page.getByText("api.coderhelm.com")).toHaveCount(0);
  expect(calls).toContain("/api/api-keys");
  expect(await hostedLinks(page)).toEqual([]);
  expect(outside.filter((u) => u.includes("coderhelm.com"))).toEqual([]);
});

test("Repositories: Install the GitHub App opens the install's own app", async ({ page, baseURL }) => {
  const { outside } = await selfHosted(page);
  await page.goto("/settings/repos");
  const install = page.getByRole("link", { name: "Install the GitHub App" });
  await expect(install).toBeVisible();
  await expect(install).toHaveAttribute("href", `${new URL(baseURL!).origin}/auth/github/app`);
  expect(await hostedLinks(page)).toEqual([]);
  expect(outside.filter((u) => u.includes("coderhelm.com"))).toEqual([]);
});

test("GitHub settings: Install goes through the install, with its state", async ({ page, baseURL }) => {
  await selfHosted(page);
  let opened = "";
  await page.route((url) => url.pathname === "/auth/github/app", (route) => {
    opened = route.request().url();
    return route.fulfill({ status: 200, contentType: "text/html", body: "<p>GitHub</p>" });
  });
  await page.goto("/settings/integrations/github");
  const button = page.getByRole("button", { name: /^Install/ }).first();
  await expect(button).toBeVisible();
  expect(await hostedLinks(page)).toEqual([]);
  await button.click();
  await expect.poll(() => opened).toContain(`${new URL(baseURL!).origin}/auth/github/app?state=`);
});

test("Jira: without hybrid, the webhook comes first and the app means the install's own copy", async ({ page }) => {
  const { outside } = await selfHosted(page, (p) =>
    p === "/api/integrations/jira/check" ? JIRA_CHECK : p === "/api/integrations/jira/config" ? JIRA_CONFIG : p === "/api/integrations/jira/events" ? { events: [], total: 0 } : p === "/api/system/hybrid" ? { available: false } : undefined,
  );
  await page.goto("/settings/integrations/jira");
  await expect(page.getByRole("button", { name: "Jira webhook (recommended)" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Your own copy of the Jira app" }).click();
  const own = page.getByTestId("jira-own-app");
  await expect(own).toContainText("sends events to Coderhelm's hosted service, not to this install");
  await expect(own.getByRole("link", { name: /How to deploy your own copy/ })).toHaveAttribute("href", /docs\.coderhelm\.com\/self-host\/integrations/);
  await expect(page.locator('a[href*="developer.atlassian.com"]')).toHaveCount(0);
  expect(await hostedLinks(page)).toEqual([]);
  expect(outside.filter((u) => u.includes("coderhelm.com"))).toEqual([]);
});

test("Jira: with hybrid's Jira relay, Coderhelm's app and the install ID", async ({ page }) => {
  await selfHosted(page, (p) =>
    p === "/api/integrations/jira/check" ? JIRA_CHECK : p === "/api/integrations/jira/config" ? JIRA_CONFIG : p === "/api/integrations/jira/events" ? { events: [], total: 0 } : p === "/api/system/hybrid" ? hybridWithJira(true) : undefined,
  );
  await page.goto("/settings/integrations/jira");
  await expect(page.getByRole("button", { name: "Jira app (recommended)" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("jira-install-id-note")).toBeVisible();
  await expect(page.getByText("ins_abcdefghijklmnopqrstuvwx")).toBeVisible();
  await expect(page.locator('a[href*="developer.atlassian.com"]')).toHaveCount(1);
});
