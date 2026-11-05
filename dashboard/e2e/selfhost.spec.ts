import { expect, test, type Page, type Route } from "@playwright/test";
import { pickOption, selectLabels } from "./select";

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

const RECORDS = [
  { purpose: "certificate", name: "_a1b2c3.coderhelm.example.com", type: "CNAME", value: "_d4e5f6.xyz.acm-validations.aws" },
  { purpose: "address", name: "coderhelm.example.com", type: "CNAME", value: "d111test.cloudfront.net" },
];

/** GET /api/system/domain for a domain state: the updater's view, the decision and the check. */
function domainAnswer(code: string) {
  if (code === "none") {
    return {
      available: true, status: "skip", code,
      domain: { hostname: null, state: "none", mode: null, current: "d111test.cloudfront.net", target: "d111test.cloudfront.net", records: [] },
      check: { key: "domain", group: "Domain", label: "Your own domain", status: "skip", detail: "CoderHelm uses its AWS address d111test.cloudfront.net (optional: use your own domain).", why: "A domain of your own is easier to remember and share, and Google sign-in needs one.", fix: { text: "Add it in Settings, then System.", href: "/settings/system#domain" } },
    };
  }
  const state = code === "ok" ? "live" : code === "caa_blocked" ? "failed" : "validating";
  const status = code === "ok" ? "pass" : code === "caa_blocked" ? "fail" : "warn";
  return {
    available: true, status: code === "validating" ? "wait" : status, code,
    domain: { hostname: "coderhelm.example.com", state, mode: "external", current: "d111test.cloudfront.net", target: "d111test.cloudfront.net", certificate: { status: code === "caa_blocked" ? "FAILED" : "PENDING_VALIDATION", failure_reason: code === "caa_blocked" ? "CAA_ERROR" : null }, records: RECORDS },
    check: code === "ok"
      ? { key: "domain", group: "Domain", label: "Your own domain", status: "pass", detail: "https://coderhelm.example.com answers with its certificate, and so does the API." }
      : code === "caa_blocked"
        ? { key: "domain", group: "Domain", label: "Your own domain", status: "fail", detail: "Your domain's CAA records don't allow Amazon to issue a certificate for coderhelm.example.com.", why: "Without a certificate CloudFront can't answer on your domain.", fix: { text: "Add this CAA record next to the ones you have, then press Try again in Settings, then System.", command: 'example.com  CAA  0 issue "amazon.com"', href: "/settings/system#domain" } }
        : { key: "domain", group: "Domain", label: "Your own domain", status: "warn", detail: "The certificate for coderhelm.example.com is waiting for its DNS record.", why: "CloudFront needs the certificate before it can answer on your domain.", fix: { text: "Add these DNS records where your domain's DNS is hosted. AWS checks every few minutes; new records can take up to an hour to show up.", command: RECORDS.map((r) => `${r.name}  CNAME  ${r.value}`).join("\n"), href: "/settings/system#domain" } },
  };
}

async function setup(page: Page, cfg: RuntimeConfig | null, opts: { native?: unknown; signedIn?: boolean; provider?: "anthropic" | "bedrock"; blocked?: boolean; domain?: string; history?: unknown[]; version?: Record<string, unknown>; checked?: Record<string, unknown>; blockers?: unknown[]; onlyBlockers?: unknown[] } = {}) {
  const calls: string[] = [];
  const domainState = { code: opts.domain ?? "none" };
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
    if (p === "/api/system/version" || p === "/api/system/releases/check") {
      if (p !== "/api/system/version") systemCalls.push({ path: p, body: JSON.parse(req.postData() || "{}") });
      return json(route, {
        self_hosted: true,
        current: { version: "v1.2.0", commit: "abc1234def", released_at: "2026-10-01T00:00:00Z", config_fingerprint: "0123456789ab" },
        latest: { version: "v2.0.0", notes: "## Changes\n\n- A new thing.", published_at: "2026-10-20T00:00:00Z", url: "https://example.org/r", breaking: true },
        update_available: true,
        running: false,
        ...(opts.native ? { native: opts.native } : {}),
        settings: { auto: false, channel: "stable", day: "sun", hour: 3, timezone: "UTC", majors: "ask" },
        history: opts.history ?? [
          { id: "UPDATE#1", version: "v1.2.0", from_version: "v1.1.0", actor: "auto", mode: "update", status: "succeeded", started_at: "2026-10-05T03:00:00Z", reason: "now on v1.2.0" },
          { id: "UPDATE#0", version: "v1.1.5", from_version: "v1.1.0", actor: "owner@example.org", mode: "update", status: "rolled_back", started_at: "2026-10-02T03:00:00Z", reason: "health check failed after deploying v1.1.5; back on v1.1.0" },
        ],
        ...(opts.version ?? {}),
        ...(p === "/api/system/version" ? {} : (opts.checked ?? {})),
      });
    }
    if (p === "/api/system/auto-update") {
      systemCalls.push({ path: p, body: JSON.parse(req.postData() || "{}") });
      return json(route, { settings: { auto: true, channel: "stable", day: "sat", hour: 22, timezone: "UTC", majors: "ask" } });
    }
    if (p === "/api/system/update/apply") {
      systemCalls.push({ path: p, body: JSON.parse(req.postData() || "{}") });
      return json(route, { version: "v2.0.0", actor: "owner@example.org", status: "running" });
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
        blockers: opts.onlyBlockers ?? (opts.blocked
          ? [
              { key: "email_identity", severity: "block", detail: "example.org isn't verified yet (DKIM pending). The update's health check would fail, so it wouldn't start.", fix: (installChecks(false).checks.find((x) => x.key === "email_identity") as { fix: unknown }).fix },
              { key: "migration", severity: "warn", detail: "v2.0.0 is a major release whose notes ask you to do something before or after updating.", fix: { text: "Read the release notes below and do what they say, then update.", href: "/settings/system#version", url: "https://github.com/CoderHelm/coderhelm-platform/releases" } },
            ]
          : [{ key: "migration", severity: "warn", detail: "v2.0.0 is a major release whose notes ask you to do something before or after updating.", fix: { text: "Read the release notes below and do what they say, then update.", href: "/settings/system#version" } }, ...(opts.blockers ?? [])]),
        checks: c.checks,
      });
    }
    if (p === "/api/system/domain") {
      if (req.method() === "PUT") {
        const body = JSON.parse(req.postData() || "{}");
        systemCalls.push({ path: p, body });
        if (body.hostname === "taken.example.com") return json(route, { error: "the address is being changed right now; wait for it to finish (about 10 minutes)" }, 400);
        domainState.code = "validating";
        return json(route, domainAnswer("validating").domain);
      }
      if (req.method() === "DELETE") {
        systemCalls.push({ path: p, body: { method: "DELETE" } });
        domainState.code = "none";
        return json(route, domainAnswer("none").domain);
      }
      return json(route, domainAnswer(domainState.code));
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
  return { calls, puts, systemCalls, checksState, domainState };
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
  await expect(page.getByTestId("signup-one-org")).toContainText("first admin account");
  await expect(page.getByText("I agree to the")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Terms" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /coderhelm\.com/ })).toHaveCount(0);
  // The form submits without a terms box to tick.
  await page.locator("#signup-email").fill("owner@example.org");
  await page.locator("#signup-password").fill("Password123");
  await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();
});

test("a self-hosted install's sign-in page has no open sign-up", async ({ page }) => {
  await setup(page, { apiUrl: "", streamUrl: "", selfHosted: true, siteUrl: null });
  await page.goto("/");
  await expect(page.locator("#login-email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toHaveCount(0);
  await expect(page.getByTestId("login-invite-only")).toBeVisible();
});

test("the hosted sign-in page still offers Create account", async ({ page }) => {
  await setup(page, null);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
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
  const options = await selectLabels(primary);
  await pickOption(primary, options[options.length > 1 ? 1 : 0]);
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
      const status = page.getByTestId("update-status");
      await expect(status).toHaveAttribute("data-state", "available");
      await expect(status).toContainText("v2.0.0 is available");
      await expect(status).toContainText("You're on v1.2.0.");
      await expect(status).toContainText("Major release");
      await expect(page.getByTestId("version-facts")).toContainText("abc1234def");
      await expect(page.getByTestId("release-notes")).toContainText("A new thing.");
      await expect(page.getByTestId("update-history")).toContainText("health check failed after deploying v1.1.5");
      await expect(page.getByTestId("update-history")).toContainText("auto-update window");

      await page.getByRole("button", { name: "Update to v2.0.0" }).click();
      await expect.poll(() => systemCalls.map((c) => c.path)).toContain("/api/system/update");
      // No version: the updater reads GitHub first and installs the newest release at that moment.
      expect(systemCalls.find((c) => c.path === "/api/system/update")!.body).toEqual({});

      await page.getByRole("switch", { name: "Install updates automatically" }).click();
      await pickOption(page.getByRole("combobox", { name: "Day" }), "sat");
      await pickOption(page.getByRole("combobox", { name: "Hour" }), "22");
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
      await expect(list.locator("li")).toHaveCount(9);
      await expect(list.locator("#emails")).toContainText("Optional");
      await expect(list.locator("#domain")).toContainText("Optional");
      await expect(list.locator("#domain").getByRole("link", { name: "Add a domain" })).toHaveAttribute("href", /\/settings\/system\/?#domain$/);
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
  // Pages only a self-hosted install has send a hosted team back to Settings.
  await page.goto("/settings/system/");
  await expect(page).toHaveURL(/\/settings\/?$/);
  await page.goto("/settings/setup/");
  await expect(page).toHaveURL(/\/settings\/?$/);
  expect(calls.filter((c) => c.includes("/api/system/"))).toEqual([]);
});

const SHOTS = "test-results/selfhost-checks";

for (const [name, viewport] of [["1440", { width: 1440, height: 1000 }], ["390", { width: 390, height: 844 }]] as const) {
  test.describe(`install checks at ${name}px`, () => {
    test.use({ viewport });

    test("Setup: failing checks say what, why and how to fix; Re-run checks after the fix shows them passing", async ({ page }) => {
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
      await checks.getByRole("button", { name: "Re-run checks" }).click();
      await expect(checks.getByTestId("install-checks-summary")).toContainText("0 need a fix");
      await expect(checks).toContainText("Nothing needs a fix");
      await expect(perms).toHaveAttribute("data-status", "pass");
      await expect(perms).not.toContainText("Why it matters");
      expect(checksState.runs).toBe(2);
      await page.screenshot({ path: `${SHOTS}/setup-passing-${name}.png`, fullPage: true });
    });

    test("System: a failing check holds the update, and Install health lists it with its fix", async ({ page }) => {
      await setup(page, SELF, { signedIn: true, blocked: true });
      await page.goto("/settings/system/");
      const status = page.getByTestId("update-status");
      await expect(status).toHaveAttribute("data-state", "blocked");
      await expect(page.getByTestId("update-blocked")).toContainText("Fix the install check marked Stops updates below");
      await expect(page.getByRole("button", { name: /^Update to/ })).toHaveCount(0);
      const h = page.getByTestId("install-health");
      await expect(h).toHaveAttribute("data-state", "failing");
      await expect(page.getByTestId("health-summary")).toHaveText("2 checks fail");
      await expect(h.locator("#check-email_identity")).toContainText("Stops updates");
      await expect(h.locator("#check-email_identity").getByTestId("fix-command")).toContainText("dkim.amazonses.com");
      await expect(page.getByTestId("history-next-step")).toContainText("Back on v1.1.0; your data is untouched");
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({ path: `${SHOTS}/system-preflight-blocked-${name}.png`, fullPage: true });
    });

    test("System: a major release's notes are said in the status, not as a health problem", async ({ page }) => {
      await setup(page, SELF, { signedIn: true });
      await page.goto("/settings/system/");
      await expect(page.getByTestId("update-major")).toContainText("read them below first");
      const h = page.getByTestId("install-health");
      await expect(h).not.toContainText("major release");
      await expect(page.getByRole("button", { name: "Update to v2.0.0" })).toBeEnabled();
      await page.screenshot({ path: `${SHOTS}/system-preflight-ready-${name}.png`, fullPage: true });
    });
  });
}

// Update history reads honestly: who started each update, a refusal before
// anything changed is neutral (no "may be unhealthy"), and the status never
// truncates, on a desktop and a phone.
const LONG_WAIT = "use acme.coderhelm.com · v1.1.0's stack template doesn't match its signed checksum, so it was not proposed, which is a long reason that used to push the badge into Fail…";
const HONEST_HISTORY = [
  { id: "UPDATE#4", version: "v1.2.0", from_version: "v1.1.0", actor: "AWS CLI", mode: "update", status: "succeeded", started_at: "2026-11-03T02:05:00Z", reason: "" },
  { id: "UPDATE#3", version: "v1.1.0", from_version: "v1.0.0", actor: "unknown", mode: "update", status: "succeeded", started_at: "2026-11-02T01:00:00Z", reason: "" },
  { id: "UPDATE#2", version: "v1.0.0", from_version: "v1.0.0", actor: "install guide", mode: "domain", status: "not_started", started_at: "2026-11-01T22:00:00Z", reason: LONG_WAIT },
  { id: "UPDATE#1", version: "v1.0.0", from_version: "v1.0.0", actor: "admin@acme.example", mode: "domain", status: "review", started_at: "2026-11-01T21:00:00Z", reason: "" },
];
for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
  test(`System: update history says who started it, keeps refusals neutral and never truncates the status (${name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await setup(page, SELF, { signedIn: true, history: HONEST_HISTORY });
    await page.goto("/settings/system/");
    const rows = page.getByTestId("update-history").locator("li");
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText("AWS CLI");
    await expect(rows.nth(1).getByTestId("history-line")).not.toContainText("unknown");
    await expect(rows.nth(2)).toContainText("install guide");
    await expect(rows.nth(2).getByTestId("history-status")).toHaveText("Didn't start");
    await expect(rows.nth(3).getByTestId("history-status")).toHaveText("Waiting for review");
    await expect(page.getByTestId("history-next-step")).toHaveCount(0);
    for (let i = 0; i < 4; i++) {
      const chip = rows.nth(i).getByTestId("history-status").locator("span span");
      const cut = await chip.evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(cut, `row ${i} status is cut off`).toBe(false);
    }
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(viewport.width);
  });
}

test("System: use your own domain, see the records to add, fix a CAA refusal with Try again, and go back to the AWS address", async ({ page }) => {
  const { systemCalls, domainState } = await setup(page, SELF, { signedIn: true });
  await page.goto("/settings/system/");
  const sec = page.getByTestId("domain-section");
  await expect(sec).toHaveAttribute("data-code", "none");
  await expect(sec).toContainText("CoderHelm uses its AWS address d111test.cloudfront.net");
  // A bad hostname is refused in plain words, before any call.
  await page.getByTestId("domain-input").fill("coderhelm");
  await page.getByTestId("domain-use").click();
  await expect(page.getByTestId("domain-error")).toHaveText("Enter a hostname such as coderhelm.example.com.");
  expect(systemCalls.filter((c) => c.path === "/api/system/domain")).toEqual([]);
  // The updater's refusal shows as it says it.
  await page.getByTestId("domain-input").fill("taken.example.com");
  await page.getByTestId("domain-use").click();
  await expect(page.getByTestId("domain-error")).toContainText("being changed right now");
  await page.getByTestId("domain-input").fill("https://CoderHelm.example.com/");
  await page.getByTestId("domain-use").click();
  await expect.poll(() => systemCalls.filter((c) => c.path === "/api/system/domain").map((c) => c.body.hostname)).toContain("coderhelm.example.com");
  await expect(sec).toHaveAttribute("data-code", "validating");
  await expect(page.getByTestId("domain-record-certificate")).toContainText("_a1b2c3.coderhelm.example.com");
  await expect(page.getByTestId("domain-record-certificate")).toContainText("_d4e5f6.xyz.acm-validations.aws");
  await expect(page.getByTestId("domain-record-address")).toContainText("d111test.cloudfront.net");
  // CoderHelm never changes DNS: no button that would, and plain steps for Route 53 and others.
  await expect(sec).toContainText("Coderhelm never changes your DNS");
  await expect(sec).not.toContainText("added for you");
  await expect(page.getByTestId("domain-providers")).toContainText("Route 53");
  await expect(page.getByTestId("domain-providers")).toContainText("Anywhere else");
  await expect(sec.getByRole("button", { name: /Route 53|add these/i })).toHaveCount(0);
  expect(systemCalls.some((c) => c.path.includes("route53"))).toBe(false);
  // CAA blocks Amazon: the fix, and Try again requests a new certificate.
  domainState.code = "caa_blocked";
  await page.reload();
  await expect(sec).toContainText("CAA records don't allow Amazon");
  await expect(sec).toContainText('0 issue "amazon.com"');
  await page.getByTestId("domain-retry").click();
  await expect(sec).toHaveAttribute("data-code", "validating");
  // Live, then back to the AWS address after a confirm.
  domainState.code = "ok";
  await page.reload();
  await expect(sec).toContainText("answers with its certificate");
  await expect(page.getByTestId("domain-records")).toHaveCount(0);
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("domain-remove").click();
  await expect.poll(() => systemCalls.some((c) => c.body.method === "DELETE")).toBe(true);
  await expect(sec).toHaveAttribute("data-code", "none");
});

test("System: the domain section at 1440 and 390, no sideways scroll", async ({ page }) => {
  const shots = process.env.E2E_SHOTS;
  await setup(page, SELF, { signedIn: true, domain: "validating" });
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/settings/system/#domain");
    const sec = page.getByTestId("domain-section");
    await expect(sec).toHaveAttribute("data-code", "validating");
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(w);
    if (shots) await sec.screenshot({ path: `${shots}/dashboard-${w}-domain.png` });
  }
});

test("System: an update still being prepared shows that, before the change set has any details", async ({ page }) => {
  // While preparing, the install sends only status and version.
  await setup(page, SELF, {
    signedIn: true,
    native: { stack: "coderhelm-prod", auto_apply: false, pending: { status: "preparing", version: "v2.0.0" } },
  });
  await page.goto("/settings/system/");
  const card = page.getByTestId("native-update");
  await expect(card).toContainText("Preparing the update to v2.0.0");
  await expect(page.getByTestId("update-status")).toHaveAttribute("data-state", "preparing");
  await expect(page.getByTestId("update-steps").locator('[aria-current="step"]')).toHaveAttribute("data-step", "prepare");
  await expect(card).toContainText("Nothing to do yet");
  await expect(page.getByTestId("native-update-summary")).toHaveCount(0);
  await expect(page.getByTestId("native-update-link")).toHaveCount(0);
});

const CS_LINK = "https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/changesets/changes?stackId=x&changeSetId=y";
const PREPARED = { version: "v2.0.0", status: "review", counts: { add: 2, modify: 5, remove: 1 }, replacements: [], parts: ["Api", "Worker"], role: true, link: CS_LINK, id: "UPDATE#2026-11-03T10:00:00Z#abcd1234" };

test("System: a one-stack install's Update applies it, and shows it running", async ({ page }) => {
  const { systemCalls } = await setup(page, SELF, { signedIn: true, native: { stack: "coderhelm-prod", can_apply: true, auto_apply: true, pending: null } });
  await page.goto("/settings/system/");
  await expect(page.getByRole("button", { name: "Prepare the update to v2.0.0" })).toHaveCount(0);
  await page.getByRole("button", { name: "Update to v2.0.0" }).click();
  await expect.poll(() => systemCalls.map((c) => c.path)).toContain("/api/system/update");
  expect(systemCalls.find((c) => c.path === "/api/system/update")!.body).toEqual({});
});

test("System: a running one-stack update says so, with nothing to do and no console step", async ({ page }) => {
  await setup(page, SELF, { signedIn: true, native: { stack: "coderhelm-prod", can_apply: true, auto_apply: true, pending: { ...PREPARED, status: "running" } } });
  await page.goto("/settings/system/");
  const card = page.getByTestId("native-update");
  await expect(card).toContainText("Applying v2.0.0");
  await expect(page.getByTestId("native-update-summary")).toContainText("It changes 8 resources (2 to add, 5 to change, 1 to remove) in Api, Worker");
  await expect(card).not.toContainText("Execute");
  await expect(page.getByTestId("native-update-apply")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Update to v2.0.0" })).toHaveCount(0);
});

test("System: data and permission changes are listed in a dialog and apply only once confirmed", async ({ page }) => {
  const confirm = "c".repeat(64);
  const { systemCalls } = await setup(page, SELF, {
    signedIn: true,
    native: {
      stack: "coderhelm-prod", can_apply: true, auto_apply: true,
      pending: { ...PREPARED, can_apply: true, confirm, hold: "waiting for you to confirm: it would replace or remove Api.Table",
        data_changes: ["Database.Table (AWS::DynamoDB::GlobalTable: Modify, replacement True)"],
        permission_changes: ["Api.NewRole (AWS::IAM::Role Add: an IAM change)"], admin_changes: [] },
    },
  });
  await page.goto("/settings/system/");
  const card = page.getByTestId("native-update");
  await expect(card).toContainText("v2.0.0 needs your OK");
  await expect(page.getByTestId("native-update-hold")).toContainText("replace or remove data and change permissions");
  await expect(card).not.toContainText("choose Execute");
  await page.getByRole("button", { name: "Review and apply" }).click();
  const dialog = page.getByTestId("native-update-confirm");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("native-update-data-changes")).toContainText("Database.Table (AWS::DynamoDB::GlobalTable");
  await expect(page.getByTestId("native-update-permission-changes")).toContainText("Api.NewRole (AWS::IAM::Role Add");
  // Cancel sends nothing.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  expect(systemCalls.filter((c) => c.path === "/api/system/update/apply")).toEqual([]);
  await page.getByRole("button", { name: "Review and apply" }).click();
  await page.getByRole("button", { name: "Confirm and apply" }).click();
  await expect.poll(() => systemCalls.find((c) => c.path === "/api/system/update/apply")?.body).toEqual({ id: PREPARED.id, confirm });
});

test("System: a prepared update with nothing to confirm applies with one press", async ({ page }) => {
  const { systemCalls } = await setup(page, SELF, {
    signedIn: true,
    native: { stack: "coderhelm-prod", can_apply: true, auto_apply: true,
      pending: { ...PREPARED, can_apply: true, confirm: "", hold: "auto-update was turned off before it ran: press Apply to apply it", data_changes: [], permission_changes: [], admin_changes: [] } },
  });
  await page.goto("/settings/system/");
  await expect(page.getByTestId("native-update")).toContainText("v2.0.0 is ready to apply");
  await expect(page.getByTestId("native-update-hold")).toContainText("Auto-update was turned off before it ran");
  await page.getByRole("button", { name: "Apply v2.0.0" }).click();
  await expect.poll(() => systemCalls.find((c) => c.path === "/api/system/update/apply")?.body).toEqual({ id: PREPARED.id });
  await expect(page.getByTestId("native-update-confirm")).toHaveCount(0);
});

test("System: a change to the deploy role or a boundary is the one update that goes to the AWS console", async ({ page }) => {
  await setup(page, SELF, {
    signedIn: true,
    native: { stack: "coderhelm-prod", can_apply: true, auto_apply: true,
      pending: { ...PREPARED, can_apply: false, confirm: "", hold: "it changes the deploy role", data_changes: [], permission_changes: [], admin_changes: ["DeployBoundary (Modify)"] } },
  });
  await page.goto("/settings/system/");
  const card = page.getByTestId("native-update");
  await expect(card).toContainText("v2.0.0 needs an AWS admin");
  await expect(card).toContainText("chooses Execute");
  await expect(page.getByTestId("native-update-apply")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open it in the AWS console" })).toHaveAttribute("href", CS_LINK);
  // The prepared update is the one thing to do: no second Update button, and it never blocks itself.
  await expect(page.getByRole("button", { name: "Update to v2.0.0" })).toHaveCount(0);
  await expect(page.locator("#update-blocked")).toHaveCount(0);
});

test("System: an older stack without the deploy role says its one console step adds it", async ({ page }) => {
  await setup(page, SELF, {
    signedIn: true,
    native: { stack: "coderhelm-prod", auto_apply: false, pending: { ...PREPARED, role: false, data_changes: [] } },
  });
  await page.goto("/settings/system/");
  await expect(page.getByTestId("native-update-hold")).toContainText("doesn't have the deploy role yet");
  await expect(page.getByRole("link", { name: "Open it in the AWS console" })).toHaveAttribute("href", CS_LINK);
});

// The Version section's one status at the top: up to date, an update to
// install, an update on its way, or the last one that didn't work. Release
// notes show only what changed; readiness is one line while nothing blocks.
const NOTES = [
  "Self-host release v2.0.0, cut automatically after the deploy of main at 0123456789abcdef.",
  "",
  "Install: `npx -y github:acme/platform#v2.0.0 init`, then deploy. Update: `npx -y github:acme/platform#v2.0.0 update --to v2.0.0`. Check an install: `npx -y github:acme/platform doctor`. Verify it yourself: docs/self-host/updates-security.md.",
  "",
  "## What changed",
  "",
  ...Array.from({ length: 8 }, (_, i) => `- Change number ${i + 1} (#${100 + i})`),
  "",
  "**Full list of changes:** https://example.org/compare/v1.2.0...v2.0.0",
].join("\n");
const RAW = "Stack arn:aws:cloudformation:us-east-1:111122223333:stack/coderhelm-prod/abc is in UPDATE_ROLLBACK_COMPLETE: Resource handler returned message: AWS::Lambda::Function failed";

for (const [name, viewport] of [["desktop", { width: 1280, height: 800 }], ["phone", { width: 375, height: 740 }]] as const) {
  test.describe(`Version status on a ${name}`, () => {
    test.use({ viewport });

    test("an update is available: version, release notes without the boilerplate, collapsed, and Technical details", async ({ page }) => {
      await setup(page, SELF, {
        signedIn: true,
        native: { stack: "coderhelm-prod", auto_apply: false, pending: null },
        version: {
          current: { version: "v1.2.0", commit: "0123456789abcdef0123456789abcdef01234567", released_at: "2026-10-01T00:00:00Z", config_fingerprint: "0a3bb7ad772e" },
          latest: { version: "v2.0.0", notes: NOTES, published_at: "2026-10-20T00:00:00Z", url: "https://example.org/r", breaking: false },
          install: { stage: "prod", region: "us-east-1" },
        },
      });
      await page.goto("/settings/system/");
      const status = page.getByTestId("update-status");
      await expect(status).toHaveAttribute("data-state", "available");
      await expect(status).toContainText("v2.0.0 is available");
      await expect(status.getByRole("button", { name: "Update to v2.0.0" })).toBeEnabled();

      const notes = page.getByTestId("release-notes");
      await expect(notes).toContainText("What changed in v2.0.0");
      await expect(notes).toContainText("Change number 5");
      await expect(notes).not.toContainText("Change number 6");
      for (const gone of ["cut automatically", "npx", "doctor", "Full list of changes"]) await expect(notes).not.toContainText(gone);
      await notes.getByTestId("release-notes-more").click();
      await expect(notes).toContainText("Change number 8");
      await expect(notes.getByRole("link", { name: "Release page" })).toHaveAttribute("href", "https://example.org/r");

      // No "How it works" anywhere in the section; one Technical details with every fact.
      const version = page.locator("#version");
      await expect(version.getByText("How it works")).toHaveCount(0);
      await version.getByText("Technical details").click();
      const facts = page.getByTestId("version-facts");
      await expect(facts).toContainText("v1.2.0");
      await expect(facts.getByRole("link", { name: "0123456789ab" })).toHaveAttribute("href", "https://github.com/coderhelm/coderhelm-platform/commit/0123456789abcdef0123456789abcdef01234567");
      await expect(facts).toContainText("0a3bb7ad772e");
      await expect(facts).toContainText("coderhelm-prod");
      await expect(facts).toContainText("us-east-1");
      await expect(page.getByTestId("version-details")).toContainText("Automatic updates are off");

      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({ path: `${SHOTS}/system-version-available-${name}.png`, fullPage: true });
    });

    test("the last update didn't work: red, plain, still on the old version, Try again; never also a blocker", async ({ page }) => {
      const { systemCalls } = await setup(page, SELF, {
        signedIn: true,
        history: [
          { id: "UPDATE#2", version: "v2.0.0", from_version: "v1.2.0", actor: "owner@example.org", mode: "update", status: "rolled_back", started_at: "2026-10-21T03:00:00Z", reason: RAW },
          { id: "UPDATE#1", version: "v1.2.0", from_version: "v1.1.0", actor: "auto", mode: "update", status: "succeeded", started_at: "2026-10-05T03:00:00Z" },
        ],
        blockers: [{ key: "failed_before", severity: "warn", detail: `The last try to update to v2.0.0 didn't succeed: ${RAW}.`, fix: { text: "Fix what the history says, then try again.", href: "/settings/system#history" } }],
      });
      await page.goto("/settings/system/");
      const status = page.getByTestId("update-status");
      await expect(status).toHaveAttribute("data-state", "failed");
      await expect(status).toContainText("The update to v2.0.0 didn't finish");
      await expect(status).toContainText("Nothing changed: you're still on v1.2.0");
      await expect(page.getByTestId("update-failed-reason")).not.toContainText("arn:aws");
      // The raw AWS text only under Technical details.
      await expect(status).not.toContainText("UPDATE_ROLLBACK_COMPLETE");
      await expect(page.locator("#version").getByText("Technical details", { exact: true })).toHaveCount(1);
      await page.locator("#version").getByText("Technical details", { exact: true }).click();
      await expect(page.getByTestId("update-failed-raw")).toContainText("UPDATE_ROLLBACK_COMPLETE");
      await expect(page.getByTestId("install-health")).not.toContainText("didn't succeed");
      await status.getByTestId("update-retry").click();
      await expect.poll(() => systemCalls.map((c) => c.path)).toContain("/api/system/update");
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({ path: `${SHOTS}/system-version-failed-${name}.png`, fullPage: true });
    });

    test("a plain reason is shown as the reason", async ({ page }) => {
      await setup(page, SELF, {
        signedIn: true,
        history: [{ id: "UPDATE#2", version: "v2.0.0", from_version: "v1.2.0", actor: "auto", mode: "update", status: "rolled_back", started_at: "2026-10-21T03:00:00Z", reason: "the health check failed after deploying v2.0.0" }],
      });
      await page.goto("/settings/system/");
      await expect(page.getByTestId("update-failed-reason")).toHaveText("The health check failed after deploying v2.0.0.");
    });

    test("updating: the version it goes to, when it started, and a working bar", async ({ page }) => {
      await setup(page, SELF, {
        signedIn: true,
        version: { running: true },
        history: [
          { id: "UPDATE#2", version: "v2.0.0", from_version: "v1.2.0", actor: "owner@example.org", mode: "update", status: "running", started_at: new Date(Date.now() - 120_000).toISOString() },
          { id: "UPDATE#1", version: "v1.2.0", from_version: "v1.1.0", actor: "auto", mode: "update", status: "succeeded", started_at: "2026-10-05T03:00:00Z" },
        ],
      });
      await page.goto("/settings/system/");
      const status = page.getByTestId("update-status");
      await expect(status).toHaveAttribute("data-state", "updating");
      await expect(status).toContainText("Updating to v2.0.0");
      await expect(status).toContainText("Started");
      await expect(status.getByRole("progressbar")).toBeVisible();
      await expect(page.getByTestId("install-health")).not.toContainText("already running");
      await page.screenshot({ path: `${SHOTS}/system-version-updating-${name}.png`, fullPage: true });
    });

    test("Check for updates reads GitHub now and shows the newer release, Checked just now", async ({ page }) => {
      const hourAgo = Math.floor(Date.now() / 1000) - 31 * 60;
      const { systemCalls } = await setup(page, SELF, {
        signedIn: true,
        onlyBlockers: [],
        version: { latest: null, update_available: false, releases: { fetched_at: hourAgo, stale: false, reason: null, error: null, behind: null } },
        checked: {
          latest: { version: "v1.3.0", notes: "## Changes\n\n- Fixes.", published_at: "2026-11-04T17:22:00Z", url: "https://example.org/r", breaking: false },
          update_available: true,
          releases: { fetched_at: Math.floor(Date.now() / 1000), stale: false, reason: null, error: null, behind: null },
        },
      });
      await page.goto("/settings/system/");
      const status = page.getByTestId("update-status");
      await expect(status).toHaveAttribute("data-state", "current");
      const check = page.getByTestId("release-check");
      await expect(check).toContainText("Checked 31 min ago");
      await check.getByRole("button", { name: "Check for updates" }).click();
      await expect(check).toContainText("Checked just now");
      expect(systemCalls.filter((c) => c.path === "/api/system/releases/check")).toHaveLength(1);
      await expect(status).toHaveAttribute("data-state", "available");
      await expect(status.getByRole("button", { name: "Update to v1.3.0" })).toBeEnabled();
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({ path: `${SHOTS}/system-version-checked-${name}.png`, fullPage: true });
    });

    test("a newer release GitHub doesn't list yet: no older Update button, and a failed check says so", async ({ page }) => {
      await setup(page, SELF, {
        signedIn: true,
        onlyBlockers: [],
        version: {
          latest: null,
          update_available: false,
          releases: {
            fetched_at: Math.floor(Date.now() / 1000) - 600, stale: false, reason: null, error: "GitHub is down",
            behind: { version: "v1.3.0", reason: "v1.3.0 is out, but GitHub's release list doesn't show it yet; it shows here once it does" },
          },
        },
      });
      await page.goto("/settings/system/");
      const status = page.getByTestId("update-status");
      await expect(status).toHaveAttribute("data-state", "behind");
      await expect(status).toContainText("v1.3.0 is out, but can't install yet");
      await expect(page.locator("#version").getByRole("button", { name: /^Update/ })).toHaveCount(0);
      await expect(page.getByTestId("release-check")).toContainText("GitHub didn't answer the last check. It last answered 10 min ago.");
    });

    test("up to date: green, with the version", async ({ page }) => {
      await setup(page, SELF, { signedIn: true, version: { latest: null, update_available: false }, onlyBlockers: [] });
      await page.goto("/settings/system/");
      // Health is its own section; nothing near the status reads like an update state.
      const h = page.getByTestId("install-health");
      await expect(h).toHaveAttribute("data-state", "warning");
      await expect(page.locator("main")).not.toContainText("Ready to update");
      const status = page.getByTestId("update-status");
      await expect(status).toHaveAttribute("data-state", "current");
      await expect(status).toContainText("You're up to date");
      await expect(status).toContainText("Coderhelm v1.2.0");
      await expect(page.getByTestId("release-notes")).toHaveCount(0);
      await page.screenshot({ path: `${SHOTS}/system-version-current-${name}.png`, fullPage: true });
    });
  });
}
