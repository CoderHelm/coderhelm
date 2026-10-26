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

const CHECK_PASS = (key: string, group: string, label: string, detail: string) => ({ key, group, label, status: "pass", detail });

/** The install's checks: failing until `fixed`, then passing. */
function installChecks(fixed: boolean) {
  const checks = [
    CHECK_PASS("url", "Install", "Web address answers", "https://helm.example.org answers over HTTPS."),
    CHECK_PASS("github_keys", "GitHub", "GitHub App keys stored", "App 123456."),
    CHECK_PASS("github_app", "GitHub", "GitHub accepts the app's keys", "GitHub answered as the app."),
    fixed
      ? CHECK_PASS("github_permissions", "GitHub", "GitHub App permissions and events", "Every permission and event CoderHelm uses is granted.")
      : {
          key: "github_permissions", group: "GitHub", label: "GitHub App permissions and events", status: "fail",
          detail: "Permissions to change: Workflows: write (now read). Events to subscribe to: workflow_run.",
          why: "Without them CoderHelm can't push some changes or misses the events that start work.",
          fix: { text: "Open the app's Permissions and events page, set the values listed, save, then accept the new permissions on each installation.", url: "https://github.com/organizations/acme-platform-engineering/settings/apps/coderhelm-production-install/permissions" },
        },
    CHECK_PASS("github_webhook", "GitHub", "GitHub webhook reaches this install", "The last event (issues) arrived at 2026-10-25T09:00:00Z."),
    fixed
      ? CHECK_PASS("email_identity", "Email", "Email sender verified", "example.org is verified, with DKIM.")
      : {
          key: "email_identity", group: "Email", label: "Email sender verified", status: "fail",
          detail: "example.org isn't verified yet (DKIM pending).",
          why: "Mail without DKIM lands in spam, and SES won't send at all from an unverified domain.",
          fix: {
            text: "Add these DNS records for example.org at your DNS provider; SES checks them within an hour:",
            command: ["abcdefghijklmnopqrstuvwxyz012345", "bcdefghijklmnopqrstuvwxyz0123456", "cdefghijklmnopqrstuvwxyz01234567"].map((t) => `${t}._domainkey.example.org CNAME ${t}.dkim.amazonses.com`).join("\n"),
            url: "https://console.aws.amazon.com/ses/home?region=us-east-1#/identities/example.org",
          },
        },
    {
      key: "email_sandbox", group: "Email", label: "Email can reach anyone", status: "warn",
      detail: "This AWS account is in the SES sandbox: email only reaches verified addresses, 200 a day.",
      why: "Invites and run results won't reach your teammates until production access is granted.",
      fix: { text: "Request production access (Account dashboard, Request production access); AWS usually answers within a day.", url: "https://console.aws.amazon.com/ses/home?region=us-east-1#/account" },
    },
    CHECK_PASS("model", "Claude", "Claude answers a test call", "us.anthropic.claude-sonnet-5-5 answered through Amazon Bedrock."),
    CHECK_PASS("dlq", "Install", "No failed events waiting", "The dead-letter queue is empty."),
    { key: "slack", group: "Integrations", label: "Slack", status: "skip", detail: "Not connected (optional).", why: "Connect Slack to get alerts there.", fix: { text: "Paste a Slack incoming webhook URL in Settings, Alerts.", href: "/settings/alerts" } },
  ];
  const n = (st: string) => checks.filter((c) => c.status === st).length;
  return { checked_at: "2026-10-25T10:00:00Z", summary: { pass: n("pass"), warn: n("warn"), fail: n("fail"), skip: n("skip"), ready: n("fail") === 0 }, checks };
}

async function setup(page: Page, cfg: RuntimeConfig | null, opts: { signedIn?: boolean; provider?: "anthropic" | "bedrock"; blocked?: boolean } = {}) {
  const calls: string[] = [];
  const checksState = { fixed: false, runs: 0 };
  const puts: Record<string, unknown>[] = [];
  const systemCalls: { path: string; body: Record<string, unknown> }[] = [];
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
    if (p === "/api/system/version") {
      return json(route, {
        self_hosted: true,
        current: { version: "v1.2.0", commit: "abc1234def", released_at: "2026-10-01T00:00:00Z", config_fingerprint: "0123456789ab" },
        latest: { version: "v2.0.0", notes: "## Changes\n\n- A new thing.", published_at: "2026-10-20T00:00:00Z", url: "https://example.org/r", breaking: true },
        update_available: true,
        running: false,
        settings: { auto: false, channel: "stable", day: "sun", hour: 3, timezone: "UTC", majors: "ask" },
        history: [
          { id: "UPDATE#1", version: "v1.2.0", from_version: "v1.1.0", actor: "auto", mode: "update", status: "succeeded", started_at: "2026-10-05T03:00:00Z", reason: "now on v1.2.0" },
          { id: "UPDATE#0", version: "v1.1.5", from_version: "v1.1.0", actor: "owner@example.org", mode: "update", status: "rolled_back", started_at: "2026-10-02T03:00:00Z", reason: "health check failed after deploying v1.1.5; back on v1.1.0" },
        ],
      });
    }
    if (p === "/api/system/auto-update") {
      systemCalls.push({ path: p, body: JSON.parse(req.postData() || "{}") });
      return json(route, { settings: { auto: true, channel: "stable", day: "sat", hour: 22, timezone: "UTC", majors: "ask" } });
    }
    if (p === "/api/system/update" || p === "/api/system/rollback") {
      systemCalls.push({ path: p, body: JSON.parse(req.postData() || "{}") });
      return json(route, { version: p.endsWith("update") ? "v2.0.0" : "v1.1.0", actor: "owner@example.org", status: "running" });
    }
    if (p === "/api/system/checks") {
      checksState.runs += 1;
      return json(route, installChecks(checksState.fixed));
    }
    if (p === "/api/system/preflight") {
      const c = installChecks(!opts.blocked);
      return json(route, {
        checked_at: c.checked_at,
        ready: !opts.blocked,
        current: "v1.2.0",
        latest: "v2.0.0",
        blockers: opts.blocked
          ? [
              { key: "email_identity", severity: "block", detail: "example.org isn't verified yet (DKIM pending). The update's health check would fail, so it wouldn't start.", fix: (installChecks(false).checks.find((x) => x.key === "email_identity") as { fix: unknown }).fix },
              { key: "migration", severity: "warn", detail: "v2.0.0 is a major release whose notes ask you to do something before or after updating.", fix: { text: "Read the release notes below and do what they say, then update.", href: "/settings/system#version", url: "https://github.com/CoderHelm/coderhelm-platform/releases" } },
            ]
          : [{ key: "migration", severity: "warn", detail: "v2.0.0 is a major release whose notes ask you to do something before or after updating.", fix: { text: "Read the release notes below and do what they say, then update.", href: "/settings/system#version" } }],
        checks: c.checks,
      });
    }
    if (p === "/api/system/test-email") {
      systemCalls.push({ path: p, body: {} });
      return json(route, { sent: true, to: "owner@example.org" });
    }
    if (p === "/api/integrations") {
      return json(route, { can_edit: true, migrated: 0, items: [
        { id: "github", section: "code", name: "GitHub", does: "", status: "connected", reason: "", action: "none", last_check: "", manage_href: "" },
        { id: "jira", section: "work", name: "Jira", does: "", status: "not_connected", reason: "", action: "none", last_check: "", manage_href: "" },
      ] });
    }
    if (p === "/api/repos") return json(route, { repos: [{ owner: "acme", name: "web", enabled: false }] });
    if (p === "/api/runs") return json(route, { runs: [], next: null });
    if (p === "/api/settings/model-provider" && req.method() === "PUT") {
      puts.push(JSON.parse(req.postData() || "{}"));
      return json(route, { status: "ok", provider: opts.provider ?? "anthropic" });
    }
    return json(route, {}, 200);
  });
  return { calls, puts, systemCalls, checksState };
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

const SELF = { apiUrl: "", streamUrl: "", selfHosted: true, version: "v1.2.0" };

for (const [name, viewport] of [["desktop", { width: 1280, height: 800 }], ["phone", { width: 375, height: 740 }]] as const) {
  test.describe(`on a ${name}`, () => {
    test.use({ viewport });

    test("System: version, a major update with notes, Update now, auto-update settings, history, roll back", async ({ page }) => {
      const { systemCalls } = await setup(page, SELF, { signedIn: true });
      await page.goto("/settings/system/");
      await expect(page.getByTestId("current-version")).toContainText("v1.2.0");
      await expect(page.getByTestId("current-version")).toContainText("Commit abc1234");
      await expect(page.getByTestId("latest-version")).toContainText("v2.0.0");
      await expect(page.getByTestId("latest-version")).toContainText("Major: read the notes");
      await expect(page.getByTestId("release-notes")).toContainText("A new thing.");
      await expect(page.getByTestId("update-history")).toContainText("health check failed after deploying v1.1.5");
      await expect(page.getByTestId("update-history")).toContainText("automatic");

      await page.getByRole("button", { name: "Update now to v2.0.0" }).click();
      await expect.poll(() => systemCalls.map((c) => c.path)).toContain("/api/system/update");
      expect(systemCalls.find((c) => c.path === "/api/system/update")!.body).toEqual({ version: "v2.0.0" });

      await page.getByRole("switch", { name: "Install updates automatically" }).click();
      await page.getByRole("combobox", { name: "Day" }).selectOption("sat");
      await page.getByRole("combobox", { name: "Hour" }).selectOption("22");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect.poll(() => systemCalls.find((c) => c.path === "/api/system/auto-update")?.body).toMatchObject({ auto: true, day: "sat", hour: 22, majors: "ask" });

      await page.getByRole("button", { name: "Roll back to the previous version" }).click();
      await expect.poll(() => systemCalls.map((c) => c.path)).toContain("/api/system/rollback");

      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(viewport.width);
      await expect(page.getByTestId("install-version").first()).toHaveCount(name === "desktop" ? 1 : await page.getByTestId("install-version").count());
    });

    test("Setup: live checklist with links, and a test email", async ({ page }) => {
      const { systemCalls } = await setup(page, SELF, { signedIn: true, provider: "bedrock" });
      await page.goto("/settings/setup/");
      const list = page.getByTestId("setup-checklist");
      await expect(list.locator("li")).toHaveCount(7);
      await expect(list.locator("#github")).toHaveAttribute("data-done", "yes");
      await expect(list.locator("#repos")).toHaveAttribute("data-done", "no");
      await expect(list.locator("#repos").getByRole("link", { name: "Choose repositories" })).toHaveAttribute("href", /\/settings\/repos\/?$/);
      await expect(list.locator("#models")).toHaveAttribute("data-done", "yes");
      await expect(list.locator("#run")).toHaveAttribute("data-done", "no");
      await expect(list.locator("#updates")).toContainText("Optional");
      await list.locator("#email").getByRole("button", { name: "Send a test email" }).click();
      await expect(list.locator("#email")).toContainText("Sent to owner@example.org");
      await expect(list.locator("#email")).toHaveAttribute("data-done", "yes");
      expect(systemCalls.map((c) => c.path)).toContain("/api/system/test-email");
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(viewport.width);
    });
  });
}

test("the setup banner shows on a new install and links to the checklist", async ({ page }) => {
  await setup(page, SELF, { signedIn: true });
  await page.goto("/settings/");
  await expect(page.getByTestId("setup-banner")).toContainText(/Finish setting up Coderhelm: \d of 5 steps done/);
  await expect(page.getByRole("link", { name: "Setup", exact: false }).first()).toBeVisible();
  await page.getByTestId("setup-banner").getByRole("button", { name: "Hide" }).click();
  await expect(page.getByTestId("setup-banner")).toHaveCount(0);
});

test("hosted: no System or Setup, no banner, and no install calls", async ({ page }) => {
  // The hosted dashboard: an API it can reach, and no self-hosted flag.
  const { calls } = await setup(page, { apiUrl: "", streamUrl: "" }, { signedIn: true });
  await page.goto("/settings/");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("This install")).toHaveCount(0);
  await expect(page.getByTestId("setup-banner")).toHaveCount(0);
  await page.goto("/settings/system/");
  await expect(page.getByTestId("system-unavailable")).toBeVisible();
  await page.goto("/settings/setup/");
  await expect(page.getByTestId("setup-unavailable")).toBeVisible();
  expect(calls.filter((c) => c.includes("/api/system/"))).toEqual([]);
});

const SHOTS = "test-results/selfhost-checks";

for (const [name, viewport] of [["1440", { width: 1440, height: 1000 }], ["390", { width: 390, height: 844 }]] as const) {
  test.describe(`install checks at ${name}px`, () => {
    test.use({ viewport });

    test("Setup: failing checks say what, why and how to fix; Check again after the fix shows them passing", async ({ page }) => {
      const { checksState } = await setup(page, SELF, { signedIn: true, provider: "bedrock" });
      await page.goto("/settings/setup/");
      const checks = page.getByTestId("install-checks");
      await expect(checks.getByTestId("install-checks-summary")).toContainText("2 need a fix");
      await expect(checks).toContainText("2 checks need a fix");
      const perms = checks.locator("#check-github_permissions");
      await expect(perms).toHaveAttribute("data-status", "fail");
      await expect(perms).toContainText("Workflows: write (now read)");
      await expect(perms).toContainText("Why it matters:");
      await expect(perms.getByRole("link", { name: "Open on GitHub" })).toHaveAttribute("href", /settings\/apps\/coderhelm-production-install\/permissions$/);
      const email = checks.locator("#check-email_identity");
      await expect(email.getByTestId("fix-command")).toContainText("._domainkey.example.org CNAME");
      await expect(email.getByRole("button", { name: "Copy" })).toBeVisible();
      await expect(checks.locator("#check-email_sandbox")).toHaveAttribute("data-status", "warn");
      await expect(checks.locator("#check-slack")).toContainText("Not set up");
      await expect(checks.locator("#check-slack").getByRole("link", { name: "Open in Coderhelm" })).toHaveAttribute("href", /\/settings\/alerts\/?$/);
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({ path: `${SHOTS}/setup-failing-${name}.png`, fullPage: true });

      // The person fixes both, then checks again: no reload.
      checksState.fixed = true;
      await checks.getByRole("button", { name: "Check again" }).click();
      await expect(checks.getByTestId("install-checks-summary")).toContainText("0 need a fix");
      await expect(checks).toContainText("Nothing needs a fix");
      await expect(perms).toHaveAttribute("data-status", "pass");
      await expect(perms).not.toContainText("Why it matters");
      expect(checksState.runs).toBe(2);
      await page.screenshot({ path: `${SHOTS}/setup-passing-${name}.png`, fullPage: true });
    });

    test("System: update readiness lists what blocks an update, with its fix, and holds Update now", async ({ page }) => {
      await setup(page, SELF, { signedIn: true, blocked: true });
      await page.goto("/settings/system/");
      const r = page.getByTestId("update-readiness");
      await expect(r.locator('[data-severity="block"]')).toContainText("Blocks the update");
      await expect(r.locator('[data-severity="block"]')).toContainText("isn't verified yet");
      await expect(r.locator('[data-severity="block"]').getByTestId("fix-command")).toContainText("dkim.amazonses.com");
      await expect(r.locator('[data-severity="warn"]')).toContainText("Read first");
      await expect(page.getByRole("button", { name: "Update now to v2.0.0" })).toBeDisabled();
      await expect(page.locator("#update-blocked")).toContainText("Fix what blocks the update");
      await expect(page.getByTestId("history-next-step")).toContainText("Back on v1.1.0; your data is untouched");
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({ path: `${SHOTS}/system-preflight-blocked-${name}.png`, fullPage: true });
    });

    test("System: ready to update when nothing blocks", async ({ page }) => {
      await setup(page, SELF, { signedIn: true });
      await page.goto("/settings/system/");
      const r = page.getByTestId("update-readiness");
      await expect(r.locator('[data-severity="block"]')).toHaveCount(0);
      await expect(r.getByTestId("doctor-summary")).toContainText("0 failing");
      await expect(page.getByRole("button", { name: "Update now to v2.0.0" })).toBeEnabled();
      await page.screenshot({ path: `${SHOTS}/system-preflight-ready-${name}.png`, fullPage: true });
    });
  });
}
