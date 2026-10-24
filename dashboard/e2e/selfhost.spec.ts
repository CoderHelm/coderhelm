import { expect, test, type Page, type Route } from "@playwright/test";

// A self-hosted install: the dashboard reads where its API is from
// /runtime-config.js (written by the platform's web stack), not from the
// build. Each test serves its own runtime config, so this runs against any
// build, including one made with no API URL at all (the release build).

interface RuntimeConfig {
  apiUrl?: string;
  streamUrl?: string;
  selfHosted?: boolean;
  supportEmail?: string;
  siteUrl?: string | null;
}

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

async function setup(page: Page, cfg: RuntimeConfig | null, opts: { signedIn?: boolean; provider?: "anthropic" | "bedrock" } = {}) {
  const calls: string[] = [];
  const puts: Record<string, unknown>[] = [];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.pathname === "/runtime-config.js", (route) =>
    cfg === null
      ? route.fallback()
      : route.fulfill({ contentType: "text/javascript", body: `window.__CODERHELM_CONFIG__ = ${JSON.stringify(cfg)};` }),
  );
  await page.route((url) => !["localhost", "127.0.0.1"].includes(url.hostname), (route) => route.abort());
  await page.route((url) => ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    calls.push(`${u.host}${u.pathname}`);
    const p = u.pathname;
    if (p === "/api/me") return opts.signedIn ? json(route, ME) : json(route, { error: "unauthorized" }, 401);
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/settings/model-provider" && req.method() === "GET") {
      return json(route, {
        provider: "anthropic",
        api_key_masked: null,
        primary_model: "claude-sonnet-5-5",
        heavy_model: "claude-opus-5-5",
        deployment_provider: opts.provider ?? "anthropic",
      });
    }
    if (p === "/api/settings/model-provider" && req.method() === "PUT") {
      puts.push(JSON.parse(req.postData() || "{}"));
      return json(route, { status: "ok", provider: opts.provider ?? "anthropic" });
    }
    return json(route, {}, 200);
  });
  return { calls, puts };
}

test("API calls go where the runtime config says, not where the build said", async ({ page, baseURL }) => {
  const port = new URL(baseURL!).port;
  const { calls } = await setup(page, { apiUrl: `http://127.0.0.1:${port}`, streamUrl: `http://127.0.0.1:${port}`, selfHosted: true });
  await page.goto("/");
  await expect.poll(() => calls.some((c) => c === `127.0.0.1:${port}/api/me`)).toBe(true);
  expect(calls.filter((c) => c.startsWith("localhost"))).toEqual([]);
});

test("same origin: an empty apiUrl calls /api on the dashboard's own host", async ({ page, baseURL }) => {
  const host = new URL(baseURL!).host;
  const { calls } = await setup(page, { apiUrl: "", streamUrl: "", selfHosted: true });
  await page.goto("/");
  await expect.poll(() => calls.includes(`${host}/api/me`)).toBe(true);
});

test("the first-admin link opens sign-up, with no hosted terms on a self-hosted install", async ({ page }) => {
  await setup(page, { apiUrl: "", streamUrl: "", selfHosted: true, siteUrl: null });
  await page.goto("/?signup=1");
  await expect(page.locator("#signup-email")).toBeVisible();
  await expect(page.getByText("I agree to the")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Terms" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /coderhelm\.com/ })).toHaveCount(0);
  // The form submits without a terms box to tick.
  await page.locator("#signup-email").fill("owner@example.org");
  await page.locator("#signup-password").fill("Password123");
  await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();
});

test("the hosted build keeps its terms", async ({ page }) => {
  await setup(page, null);
  await page.goto("/?signup=1");
  await expect(page.getByText("I agree to the")).toBeVisible();
});

test("on Bedrock the AI models page needs no key and saves the models alone", async ({ page }) => {
  const { puts } = await setup(page, { apiUrl: "", streamUrl: "", selfHosted: true }, { signedIn: true, provider: "bedrock" });
  await page.goto("/settings/models/");
  await expect(page.getByTestId("bedrock-note")).toContainText("Amazon Bedrock");
  await expect(page.getByTestId("key-row")).toHaveCount(0);
  const primary = page.getByRole("combobox").first();
  const options = await primary.locator("option").allTextContents();
  await primary.selectOption({ index: options.length > 1 ? 1 : 0 });
  const save = page.getByRole("button", { name: /^Save/ });
  if (await save.isEnabled()) {
    await save.click();
    await expect.poll(() => puts.length).toBeGreaterThan(0);
    expect(puts[0]).not.toHaveProperty("api_key");
  }
});
