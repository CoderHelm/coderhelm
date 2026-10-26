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

async function selfHosted(page: Page) {
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
