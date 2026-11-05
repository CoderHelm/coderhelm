import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Settings, then System, Version and Install health: every state the page
// can be in, each with one headline, one line of detail and one thing to do.
// Updates and the install's own health are two separate things: "You're up
// to date" never sits next to anything that reads like an update state.
// E2E_SHOTS_DIR saves a desktop and a phone screenshot of each state.

const SHOTS = process.env.E2E_SHOTS_DIR || "";
const NOW = Date.now();
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const unix = (min: number) => Math.floor((NOW - min * 60_000) / 1000);

const pass = (key: string, group: string, label: string) => ({ key, group, label, status: "pass", detail: `${label}: fine.` });
const CHECKS = [
  pass("url", "Install", "Web address answers"),
  pass("github_keys", "GitHub", "GitHub App keys stored"),
  pass("github_app", "GitHub", "GitHub accepts the app's keys"),
  pass("github_permissions", "GitHub", "GitHub App permissions and events"),
  pass("github_webhook", "GitHub", "GitHub webhook reaches this install"),
  pass("email_identity", "Email", "Email sender verified"),
  pass("email_sandbox", "Email", "Email can reach anyone"),
  pass("model", "Claude", "Claude answers a test call"),
  pass("dlq", "Install", "No failed events waiting"),
  { key: "slack", group: "Integrations", label: "Slack", status: "skip", detail: "Not connected (optional)." },
];
const FAILING_EMAIL = {
  key: "email_identity", group: "Email", label: "Email sender verified", status: "fail",
  detail: "acme.example isn't verified yet (DKIM pending).",
  why: "Email without DKIM lands in spam, and SES won't send from an unverified domain.",
  fix: { text: "Add the DNS records SES lists for acme.example; SES checks them within an hour.", url: "https://console.aws.amazon.com/ses/home?region=us-east-1#/identities/acme.example" },
};
const WARN_SANDBOX = {
  key: "email_sandbox", group: "Email", label: "Email can reach anyone", status: "warn",
  detail: "This AWS account is in the SES sandbox: email only reaches verified addresses.",
  why: "Invites won't reach teammates until production access is granted.",
  fix: { text: "Request production access in the SES console.", url: "https://console.aws.amazon.com/ses/home?region=us-east-1#/account" },
};

const NOTES = "## What changed\n\n- Faster reviews on large pull requests (#812)\n- Jira links keep their labels (#815)\n- Fixes a crash on empty repositories (#817)";
const LATEST = { version: "v0.9.0", notes: NOTES, published_at: "2026-11-03T16:00:00Z", url: "https://example.org/releases/v0.9.0", breaking: false };
const SETTINGS = { auto: false, channel: "stable", day: "sun", hour: 3, timezone: "UTC", majors: "ask" };
const OK_HISTORY = [{ id: "UPDATE#1", version: "v0.8.32", from_version: "v0.8.31", actor: "auto", mode: "update", status: "succeeded", started_at: "2026-11-02T03:00:00Z", finished_at: "2026-11-02T03:14:00Z" }];
const CS_LINK = "https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/changesets/changes?stackId=x&changeSetId=y";
const PREPARED = { version: "v0.9.0", status: "review", counts: { add: 2, modify: 5, remove: 0 }, replacements: [], parts: ["Api", "Worker"], role: true, link: CS_LINK, id: "UPDATE#2" };
const RAW = "Stack arn:aws:cloudformation:us-east-1:111122223333:stack/coderhelm-acme/abc is in UPDATE_ROLLBACK_COMPLETE: Resource handler returned message: AWS::Lambda::Function failed";

interface Mock {
  version?: Record<string, unknown>;
  checks?: unknown[];
  blockers?: unknown[];
  preflightFails?: boolean;
  checked?: Record<string, unknown>;
}

async function setup(page: Page, m: Mock) {
  const calls: string[] = [];
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.pathname === "/runtime-config.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: `window.__CODERHELM_CONFIG__ = ${JSON.stringify({ apiUrl: "", streamUrl: "", selfHosted: true, version: "v0.8.32" })};` }),
  );
  await page.route((url) => !["localhost", "127.0.0.1"].includes(url.hostname), (route) => route.abort());
  let checked = false;
  await page.route((url) => ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/(api|auth)\//.test(url.pathname), (route) => {
    const p = new URL(route.request().url()).pathname;
    calls.push(p);
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@acme.example", avatar_url: "", role: "owner", auth_provider: "email", mfa_enabled: true, platform_admin: true });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/system/version" || p === "/api/system/releases/check") {
      if (p.endsWith("/check")) checked = true;
      return json(route, {
        self_hosted: true,
        current: { version: "v0.8.32", commit: "0123456789abcdef0123456789abcdef01234567", released_at: "2026-11-01T00:00:00Z", config_fingerprint: "0a3bb7ad772e" },
        latest: null,
        update_available: false,
        running: false,
        settings: SETTINGS,
        history: OK_HISTORY,
        releases: { fetched_at: unix(2), stale: false, reason: null, error: null, behind: null },
        install: { stage: "acme", region: "us-east-1" },
        ...(m.version ?? {}),
        ...(checked ? (m.checked ?? {}) : {}),
      });
    }
    if (p === "/api/system/preflight") {
      if (m.preflightFails) return json(route, { error: "boom" }, 500);
      return json(route, { checked_at: ago(0.2), ready: true, current: "v0.8.32", latest: null, blockers: m.blockers ?? [], checks: m.checks ?? CHECKS });
    }
    if (p === "/api/system/update") return json(route, { version: "v0.9.0", actor: "admin@acme.example", status: "running" });
    return json(route, {});
  });
  return { calls };
}

async function shoot(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const [w, h] of [[1280, 900], [390, 844]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.locator("#health").scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, 0));
    const top = await page.getByRole("heading", { name: "Version and updates" }).boundingBox();
    const end = await page.locator("#health").boundingBox();
    const y = Math.max(0, (top?.y ?? 0) - 16);
    await page.screenshot({ path: path.join(SHOTS, `${name}-${w === 1280 ? "desktop" : "phone"}.png`), fullPage: true, clip: { x: 0, y, width: w, height: (end!.y + end!.height + 24) - y } });
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, `${name} fits ${w}px`).toBeLessThanOrEqual(w);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

const status = (page: Page) => page.getByTestId("update-status");
const health = (page: Page) => page.getByTestId("install-health");

test.describe("Version and updates: every state", () => {
  test("up to date: one green status; health is its own section with Re-run checks", async ({ page }) => {
    const { calls } = await setup(page, {});
    await page.goto("/settings/system/");
    await expect(status(page)).toHaveAttribute("data-state", "current");
    await expect(status(page)).toContainText("You're up to date");
    await expect(status(page)).toContainText("Coderhelm v0.8.32, released");
    await expect(page.getByTestId("release-check")).toContainText("Checked 2 min ago");
    await expect(page.getByRole("button", { name: "Check for updates" })).toBeVisible();
    // Nothing on the page reads like an update state but the status.
    await expect(page.locator("main")).not.toContainText("Ready to update");
    await expect(page.locator("main")).not.toContainText("readiness");
    await expect(page.getByRole("button", { name: "Check again" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Install health" })).toBeVisible();
    await expect(health(page)).toHaveAttribute("data-state", "healthy");
    await expect(page.getByTestId("health-summary")).toHaveText("All 9 checks pass");
    await expect(health(page)).toContainText("1 optional check not set up");
    await expect(page.getByTestId("release-notes")).toHaveCount(0);
    await shoot(page, "01-up-to-date");
    const before = calls.filter((c) => c === "/api/system/preflight").length;
    await health(page).getByRole("button", { name: "Re-run checks" }).click();
    await expect.poll(() => calls.filter((c) => c === "/api/system/preflight").length).toBe(before + 1);
    expect(calls).not.toContain("/api/system/releases/check");
  });

  test("updated just now", async ({ page }) => {
    await setup(page, { version: { history: [{ ...OK_HISTORY[0], started_at: ago(18), finished_at: ago(4), actor: "admin@acme.example" }] } });
    await page.goto("/settings/system/");
    await expect(status(page)).toHaveAttribute("data-state", "current");
    await expect(status(page)).toContainText("Updated to v0.8.32");
    await expect(status(page)).toContainText("Finished 4 min ago. You're up to date.");
    await shoot(page, "02-updated-just-now");
  });

  test("auto-update on: the window is in the detail", async ({ page }) => {
    await setup(page, { version: { settings: { ...SETTINGS, auto: true, timezone: "Europe/Berlin" } } });
    await page.goto("/settings/system/");
    await expect(status(page)).toContainText("New releases install by themselves Sundays at 03:00 Europe/Berlin.");
    await shoot(page, "03-up-to-date-auto");
  });

  test("update available: Update to v0.9.0, notes below, checked line", async ({ page }) => {
    const { calls } = await setup(page, { version: { latest: LATEST, update_available: true } });
    await page.goto("/settings/system/");
    await expect(status(page)).toHaveAttribute("data-state", "available");
    await expect(status(page)).toContainText("v0.9.0 is available");
    await expect(status(page)).toContainText("You're on v0.8.32. v0.9.0 came out");
    await expect(page.getByTestId("release-notes")).toContainText("What changed in v0.9.0");
    await expect(health(page)).toHaveAttribute("data-state", "healthy");
    await shoot(page, "04-update-available");
    await status(page).getByRole("button", { name: "Update to v0.9.0" }).click();
    await expect.poll(() => calls).toContain("/api/system/update");
  });

  test("update available with auto-update on", async ({ page }) => {
    await setup(page, { version: { latest: LATEST, update_available: true, settings: { ...SETTINGS, auto: true } } });
    await page.goto("/settings/system/");
    await expect(status(page)).toContainText("It installs by itself Sundays at 03:00 UTC, or update now.");
  });

  test("major release: a chip, and its notes come first", async ({ page }) => {
    await setup(page, { version: { latest: { ...LATEST, version: "v1.0.0", breaking: true }, update_available: true, settings: { ...SETTINGS, auto: true } } });
    await page.goto("/settings/system/");
    await expect(status(page)).toContainText("v1.0.0 is available");
    await expect(status(page)).toContainText("Major release");
    await expect(page.getByTestId("update-major")).toContainText("read them below first. Major releases wait for you, even with automatic updates on.");
    await expect(status(page)).not.toContainText("installs by itself");
    await shoot(page, "05-major-release");
  });

  test("beta channel: a chip and why", async ({ page }) => {
    await setup(page, { version: { latest: { ...LATEST, version: "v0.9.0-beta.20261105", prerelease: true }, update_available: true, settings: { ...SETTINGS, channel: "beta" } } });
    await page.goto("/settings/system/");
    await expect(status(page)).toContainText("Beta");
    await expect(status(page)).toContainText("You get these because the channel is Beta (nightly).");
    await expect(page.getByTestId("channel-beta").getByRole("radio")).toBeChecked();
    await shoot(page, "06-beta");
  });

  test("an updater from before calls the beta channel preview: it shows as Beta (nightly)", async ({ page }) => {
    await setup(page, { version: { settings: { ...SETTINGS, channel: "preview" } } });
    await page.goto("/settings/system/");
    await expect(status(page)).toContainText("on the Beta (nightly) channel");
    await expect(page.getByTestId("channel-beta").getByRole("radio")).toBeChecked();
  });

  test("the channel choice: Stable and Beta (nightly), each with a line on what it means", async ({ page }) => {
    await setup(page, { version: {} });
    await page.goto("/settings/system/");
    const group = page.getByRole("radiogroup", { name: "Update channel" });
    await expect(group.getByRole("radio")).toHaveCount(2);
    await expect(page.getByTestId("channel-stable")).toContainText("Releases that ran as a beta for a day with no reported problem.");
    await expect(page.getByTestId("channel-beta")).toContainText("Beta (nightly)");
    await expect(page.getByTestId("channel-beta")).toContainText("A new build of the latest changes each night, a day before Stable gets them.");
    await expect(page.getByTestId("channel-stable").getByRole("radio")).toBeChecked();
    await page.getByTestId("channel-beta").click();
    await expect(page.getByTestId("channel-beta").getByRole("radio")).toBeChecked();
  });

  test("blocked by a failing check: the status says so and points to Install health", async ({ page }) => {
    await setup(page, {
      version: { latest: LATEST, update_available: true },
      checks: CHECKS.map((c) => (c.key === "email_identity" ? FAILING_EMAIL : c.key === "email_sandbox" ? WARN_SANDBOX : c)),
      blockers: [{ key: "email_identity", severity: "block", detail: "acme.example isn't verified yet. The update's health check would fail, so it wouldn't start.", fix: FAILING_EMAIL.fix }],
    });
    await page.goto("/settings/system/");
    await expect(status(page)).toHaveAttribute("data-state", "blocked");
    await expect(status(page)).toContainText("v0.9.0 is available, but can't install yet");
    await expect(page.getByTestId("update-blocked")).toHaveText("You're on v0.8.32. Fix the install check marked Stops updates below, then update.");
    await expect(status(page).getByRole("link", { name: "See what to fix" })).toHaveAttribute("href", "#health");
    await expect(page.getByRole("button", { name: /^Update to/ })).toHaveCount(0);
    await expect(health(page)).toHaveAttribute("data-state", "failing");
    await expect(page.getByTestId("health-summary")).toHaveText("1 check fails");
    await expect(health(page)).toContainText("Updates won't start until it passes.");
    await expect(health(page).locator("#check-email_identity")).toContainText("Stops updates");
    await expect(health(page).locator("#check-email_sandbox")).toHaveAttribute("data-status", "warn");
    await shoot(page, "07-blocked-by-health");
  });

  test("a warning only: nothing fails, and the update isn't held", async ({ page }) => {
    await setup(page, { checks: CHECKS.map((c) => (c.key === "email_sandbox" ? WARN_SANDBOX : c)) });
    await page.goto("/settings/system/");
    await expect(status(page)).toContainText("You're up to date");
    await expect(page.getByTestId("health-summary")).toHaveText("Nothing fails, 1 check needs a look");
    await shoot(page, "08-health-warning");
  });

  test("the checks couldn't run: the doctor command and Re-run checks", async ({ page }) => {
    await setup(page, { preflightFails: true });
    await page.goto("/settings/system/");
    await expect(health(page)).toContainText("Couldn't run the checks");
    await expect(health(page).getByRole("button", { name: "Re-run checks" })).toBeVisible();
    await expect(status(page)).toContainText("You're up to date");
    await shoot(page, "09-health-unavailable");
  });

  test("the release's model check: the status is the model check", async ({ page }) => {
    await setup(page, {
      version: {
        latest: LATEST, update_available: true,
        model_check: { version: "v0.9.0", checked_at: ago(30), ok: false, provider: "bedrock", results: [{ model: "claude-sonnet-5-5", id: "us.anthropic.claude-sonnet-5-5", status: "fail", code: "terms", detail: "The terms for this model haven't been accepted in this AWS account.", fix: "Accept the terms in the Bedrock console.", url: "https://console.aws.amazon.com/bedrock/home#/modelaccess", required: true }] },
      },
    });
    await page.goto("/settings/system/");
    await expect(status(page)).toHaveAttribute("data-state", "needs-action");
    await expect(status(page)).toContainText("Update to v0.9.0 needs your action");
    await expect(status(page).getByRole("button", { name: "Re-run the model check" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Update to/ })).toHaveCount(0);
    await shoot(page, "10-model-check");
  });

  test("preparing (one stack): step 1 of 2, nothing to do", async ({ page }) => {
    await setup(page, { version: { latest: LATEST, update_available: true, native: { stack: "coderhelm-acme", can_apply: true, auto_apply: true, pending: { status: "preparing", version: "v0.9.0", id: "UPDATE#2" } }, history: [{ id: "UPDATE#2", version: "v0.9.0", from_version: "v0.8.32", actor: "admin@acme.example", mode: "update", status: "preparing", started_at: ago(1) }, ...OK_HISTORY] } });
    await page.goto("/settings/system/");
    await expect(status(page)).toHaveAttribute("data-state", "preparing");
    await expect(status(page)).toContainText("Preparing the update to v0.9.0");
    await expect(status(page)).toContainText("Step 1 of 2");
    await expect(page.getByTestId("release-check")).toHaveCount(0);
    await shoot(page, "11-preparing");
  });

  test("updating (one stack): step 2 of 2, no stack name in the text", async ({ page }) => {
    await setup(page, { version: { latest: LATEST, update_available: true, running: true, native: { stack: "coderhelm-acme", can_apply: true, auto_apply: true, pending: { ...PREPARED, status: "running" } }, history: [{ id: "UPDATE#2", version: "v0.9.0", from_version: "v0.8.32", actor: "admin@acme.example", mode: "update", status: "running", started_at: ago(6) }, ...OK_HISTORY] } });
    await page.goto("/settings/system/");
    await expect(status(page)).toHaveAttribute("data-state", "updating");
    await expect(status(page)).toContainText("Updating to v0.9.0");
    await expect(status(page)).toContainText("Started 6 min ago");
    await expect(status(page)).toContainText("It changes 7 resources");
    await expect(status(page)).not.toContainText("coderhelm-acme");
    await shoot(page, "12-updating");
  });

  test("updating (older install): started, how long, keeps running", async ({ page }) => {
    await setup(page, { version: { latest: LATEST, update_available: true, running: true, history: [{ id: "UPDATE#2", version: "v0.9.0", from_version: "v0.8.32", actor: "admin@acme.example", mode: "update", status: "running", started_at: ago(2) }, ...OK_HISTORY] } });
    await page.goto("/settings/system/");
    await expect(status(page)).toContainText("Updating to v0.9.0");
    await expect(status(page)).toContainText("Coderhelm keeps running v0.8.32 until it finishes");
    await expect(status(page).getByRole("progressbar")).toBeVisible();
  });

  test("needs your OK: data and permission changes", async ({ page }) => {
    await setup(page, { version: { latest: LATEST, update_available: true, native: { stack: "coderhelm-acme", can_apply: true, auto_apply: true, pending: { ...PREPARED, can_apply: true, confirm: "c".repeat(64), data_changes: ["Database.Table (AWS::DynamoDB::GlobalTable: Modify, replacement True)"], permission_changes: ["Api.NewRole (AWS::IAM::Role Add)"], admin_changes: [] } } } });
    await page.goto("/settings/system/");
    await expect(status(page)).toHaveAttribute("data-state", "review");
    await expect(status(page)).toContainText("v0.9.0 needs your OK");
    await expect(status(page).getByRole("button", { name: "Review and apply" })).toBeVisible();
    await shoot(page, "13-needs-your-ok");
  });

  test("failed, nothing changed: Try again, health and the release page", async ({ page }) => {
    await setup(page, { version: { latest: LATEST, update_available: true, history: [{ id: "UPDATE#2", version: "v0.9.0", from_version: "v0.8.32", actor: "admin@acme.example", mode: "update", status: "rolled_back", started_at: ago(50), reason: "the health check failed after deploying v0.9.0" }, ...OK_HISTORY] } });
    await page.goto("/settings/system/");
    await expect(status(page)).toHaveAttribute("data-state", "failed");
    await expect(status(page)).toContainText("The update to v0.9.0 didn't finish");
    await expect(status(page)).toContainText("Nothing changed: you're still on v0.8.32, and your data is untouched.");
    await expect(page.getByTestId("update-failed-reason")).toHaveText("The health check failed after deploying v0.9.0.");
    await expect(status(page).getByRole("button", { name: "Try again" })).toBeEnabled();
    await expect(status(page).getByRole("link", { name: "See install health" })).toHaveAttribute("href", "#health");
    await shoot(page, "14-failed-nothing-changed");
  });

  test("failed partway: may not be fully working, roll back is offered; raw AWS text only in Technical details", async ({ page }) => {
    await setup(page, { version: { latest: LATEST, update_available: true, history: [{ id: "UPDATE#2", version: "v0.9.0", from_version: "v0.8.32", actor: "auto", mode: "update", status: "failed", started_at: ago(50), reason: RAW }, ...OK_HISTORY] } });
    await page.goto("/settings/system/");
    await expect(status(page)).toContainText("The update to v0.9.0 stopped partway");
    await expect(status(page)).toContainText("Coderhelm may not be fully working");
    await expect(status(page)).not.toContainText("arn:aws");
    await expect(status(page).getByRole("link", { name: "Roll back" })).toHaveAttribute("href", "#history");
    await page.locator("#version").getByText("Technical details", { exact: true }).click();
    await expect(page.getByTestId("update-failed-raw")).toContainText("UPDATE_ROLLBACK_COMPLETE");
    await page.locator("#version").getByText("Technical details", { exact: true }).click();
    await shoot(page, "15-failed-partway");
  });

  test("couldn't start: nothing changed", async ({ page }) => {
    await setup(page, { version: { latest: LATEST, update_available: true, history: [{ id: "UPDATE#2", version: "v0.9.0", from_version: "v0.8.32", actor: "admin@acme.example", mode: "update", status: "not_started", started_at: ago(5), reason: "AWS refused to prepare the change" }, ...OK_HISTORY] } });
    await page.goto("/settings/system/");
    await expect(status(page)).toContainText("The update to v0.9.0 couldn't start");
    await expect(status(page)).not.toContainText("Automatic updates skip");
  });

  test("newer release published but not listed yet", async ({ page }) => {
    await setup(page, { version: { releases: { fetched_at: unix(1), stale: false, reason: null, error: null, behind: { version: "v0.9.0", reason: "not listed yet" } } } });
    await page.goto("/settings/system/");
    await expect(status(page)).toHaveAttribute("data-state", "behind");
    await expect(status(page)).toContainText("v0.9.0 is out, but can't install yet");
    await expect(page.locator("#version").getByRole("button", { name: /^Update/ })).toHaveCount(0);
    await shoot(page, "16-not-listed-yet");
  });

  test("GitHub unreachable: not 'up to date', and when GitHub last answered", async ({ page }) => {
    await setup(page, { version: { releases: { fetched_at: unix(130), stale: true, reason: null, error: "GitHub is down", behind: null } } });
    await page.goto("/settings/system/");
    await expect(status(page)).toHaveAttribute("data-state", "unreachable");
    await expect(status(page)).toContainText("Couldn't check for updates");
    await expect(status(page)).not.toContainText("up to date");
    await expect(page.getByTestId("release-check")).toContainText("GitHub didn't answer the last check. It last answered 2 h ago.");
    await shoot(page, "17-github-unreachable");
  });

  test("not checked yet: Check for updates reads GitHub now", async ({ page }) => {
    await setup(page, {
      version: { releases: { fetched_at: null, stale: true, reason: null, error: null, behind: null } },
      checked: { latest: LATEST, update_available: true, releases: { fetched_at: unix(0), stale: false, reason: null, error: null, behind: null } },
    });
    await page.goto("/settings/system/");
    await expect(status(page)).toHaveAttribute("data-state", "not-checked");
    await expect(status(page)).toContainText("Not checked for updates yet");
    await shoot(page, "18-not-checked");
    await page.getByRole("button", { name: "Check for updates" }).click();
    await expect(status(page)).toHaveAttribute("data-state", "available");
    await expect(page.getByTestId("release-check")).toContainText("Checked just now");
  });

  test("development build: no version to compare, no check button", async ({ page }) => {
    await setup(page, { version: { current: { version: null, commit: "0123456789abcdef", released_at: null, config_fingerprint: null } } });
    await page.goto("/settings/system/");
    await expect(status(page)).toHaveAttribute("data-state", "development");
    await expect(status(page)).toContainText("Development build");
    await expect(page.getByTestId("release-check")).toHaveCount(0);
    await shoot(page, "19-development");
  });

  test("the updater didn't answer: update from your machine", async ({ page }) => {
    await setup(page, {
      version: { latest: LATEST, update_available: true },
      blockers: [{ key: "updater", severity: "block", detail: "The updater didn't answer, so an update can't start from here.", fix: { text: "Update from your machine instead.", command: "npx -y github:coderhelm/coderhelm-platform update" } }],
    });
    await page.goto("/settings/system/");
    await expect(status(page)).toHaveAttribute("data-state", "updater-down");
    await expect(status(page)).toContainText("v0.9.0 is available, but can't install from here");
    await expect(status(page)).toContainText("coderhelm-platform update");
    await shoot(page, "20-updater-down");
  });
});
