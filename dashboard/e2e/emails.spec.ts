import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Settings, Emails on a self-hosted install, and Admin, Self-host for the
// platform admins. Every API call is answered here; all names, emails and
// ids are invented.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const PLATFORM_ADMIN = "admin@coderhelm.com";

const ESSENTIAL = [
  { id: "sign_in", label: "Sign-up codes and password resets", why: "People can't verify their address or get back into their account without them." },
  { id: "team_invite", label: "Team invites", why: "The only way an invited person learns how to join." },
  { id: "plugin_approval", label: "Plugin approval requests", why: "A named approver must approve a plugin draft before it publishes." },
];

const TRUST =
  "CoderHelm sees each recipient's address, the template id and its parameters (names, PR titles and run links in the weekly summary), and keeps only delivery metadata after sending.";

function emails(state: { weekly: boolean; welcome: boolean; transport: "ses" | "coderhelm"; registered: boolean }) {
  return {
    self_hosted: true,
    optional: [
      { id: "weekly_summary", label: "Weekly summary", description: "A Monday email to each person with their team's week.", on: state.weekly },
      { id: "welcome", label: "Welcome email", description: "A short hello with a link to get started, sent once when someone signs up.", on: state.welcome },
    ],
    essential: ESSENTIAL,
    transport: state.transport,
    ses: { from: "helm@example.org", check: "email", note: "Sending uses this install's own Amazon SES, which needs SES production access." },
    relay: {
      available: state.registered,
      registered: state.registered,
      turned_off: false,
      trust: TRUST,
      status: state.transport === "coderhelm" ? { paused: null, sent_today: 12, quota: 500, display_name: "acme-example.coderhelm.com via CoderHelm", from: "notifications@notify.coderhelm.com" } : null,
    },
  };
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function selfHostInstall(page: Page, opts: { registered?: boolean; platformAdmin?: boolean } = {}) {
  const state = { weekly: false, welcome: false, transport: "ses" as "ses" | "coderhelm", registered: opts.registered ?? true };
  const puts: Record<string, unknown>[] = [];
  await page.route((url) => url.pathname === "/runtime-config.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: `window.__CODERHELM_CONFIG__ = ${JSON.stringify({ selfHosted: true })};` }),
  );
  await page.route((url) => !["localhost", "127.0.0.1"].includes(url.hostname), (route) => route.abort());
  await page.route((url) => ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (p === "/api/me") {
      return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "owner@example.org", avatar_url: "", role: "owner", auth_provider: "email", mfa_enabled: false, platform_admin: opts.platformAdmin ?? true });
    }
    if (p === "/api/usage") return json(route, { month: "2026-10", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme-example", status: "active", current: true }] });
    if (p === "/api/system/emails") {
      if (req.method() === "PUT") {
        const body = JSON.parse(req.postData() || "{}");
        puts.push(body);
        if (body.optional?.weekly_summary !== undefined) state.weekly = body.optional.weekly_summary;
        if (body.optional?.welcome !== undefined) state.welcome = body.optional.welcome;
        if (body.transport) state.transport = body.transport;
      }
      return json(route, emails(state));
    }
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  return { state, puts };
}

test("Settings, Emails: optional emails start off, essential ones are listed, the admin turns one on", async ({ page }) => {
  const { puts } = await selfHostInstall(page);
  await page.goto("/settings/emails");
  await expect(page.getByRole("heading", { name: "Emails", level: 1 })).toBeVisible();

  const weekly = page.getByTestId("optional-weekly_summary").getByRole("switch");
  const welcome = page.getByTestId("optional-welcome").getByRole("switch");
  await expect(weekly).toHaveAttribute("aria-checked", "false");
  await expect(welcome).toHaveAttribute("aria-checked", "false");
  for (const e of ESSENTIAL) {
    await expect(page.getByTestId(`essential-${e.id}`)).toContainText(e.label);
    await expect(page.getByTestId(`essential-${e.id}`)).toContainText("Always on");
    await expect(page.getByTestId(`essential-${e.id}`).getByRole("switch")).toHaveCount(0);
  }
  // Own SES by default, with the setup check linked; the CoderHelm option says what it sees.
  await expect(page.getByTestId("transport-ses").getByRole("radio")).toBeChecked();
  await expect(page.getByTestId("transport-ses").getByRole("link", { name: "Check email setup" })).toHaveAttribute("href", /\/settings\/setup\/?#email/);
  await expect(page.getByTestId("transport-ses")).toContainText("SES production access");
  await expect(page.getByTestId("relay-trust")).toContainText("template id");
  await shot(page, "settings-emails");

  await weekly.click();
  await expect(weekly).toHaveAttribute("aria-checked", "true");
  expect(puts).toEqual([{ optional: { weekly_summary: true } }]);
});

test("Settings, Emails: choosing Coderhelm's mail service, and the status it shows", async ({ page }) => {
  const { puts } = await selfHostInstall(page);
  await page.goto("/settings/emails");
  await page.getByTestId("transport-coderhelm").getByRole("radio").check();
  await expect(page.getByTestId("relay-status")).toContainText("acme-example.coderhelm.com via CoderHelm");
  await expect(page.getByTestId("relay-status")).toContainText("12 of 500 sent today");
  expect(puts).toEqual([{ transport: "coderhelm" }]);
  await shot(page, "settings-emails-relay");
});

test("Settings, Emails: Coderhelm's mail service needs the install registered first", async ({ page }) => {
  await selfHostInstall(page, { registered: false });
  await page.goto("/settings/emails");
  await expect(page.getByTestId("transport-coderhelm").getByRole("radio")).toBeDisabled();
  await expect(page.getByTestId("relay-trust").getByRole("link", { name: "System, Hybrid" })).toBeVisible();
});

test("Settings, Emails is only for install admins", async ({ page }) => {
  await selfHostInstall(page, { platformAdmin: false });
  await page.goto("/settings/emails");
  // Anyone else is sent back to Settings, and nothing is read.
  await expect(page).toHaveURL(/\/settings\/?$/);
  await expect(page.getByTestId("emails-page")).toHaveCount(0);
});

// ── Admin, Self-host ───────────────────────────────────────────────────────

const ROWS = [
  {
    install_id: "ins_aaaaaaaaaaaaaaaaaaaaaaaa", name: "acme-example", hostname: "acme-example.coderhelm.com", cloudfront: "d1example.cloudfront.net",
    version: "v0.7.1", registered_at: "2026-10-01T00:00:00Z", last_seen: "2026-10-26T09:00:00Z", status: "active", verified: true, name_live: true,
    sharing: true, integrations: ["notion"], github_links: 2, relay_24h: 41, relay_7d: 310, relay_failed_7d: 3, broker_7d: 120,
    email_opted_in: true, email_paused: false, emails_24h: 9, emails_7d: 64, bounced_7d: 1, complained_7d: 0, listed_recipients: 18,
    parts: ["address", "github", "notion", "broker", "email", "sharing"],
  },
  {
    install_id: "ins_bbbbbbbbbbbbbbbbbbbbbbbb", name: null, hostname: null, cloudfront: "d2example.cloudfront.net",
    version: "", registered_at: "2026-10-12T00:00:00Z", last_seen: "2026-10-20T00:00:00Z", status: "paused", verified: true, name_live: false,
    sharing: false, integrations: [], github_links: 0, relay_24h: 0, relay_7d: 0, relay_failed_7d: 0, broker_7d: 0,
    email_opted_in: true, email_paused: true, emails_24h: 0, emails_7d: 40, bounced_7d: 6, complained_7d: 1, listed_recipients: 7,
    parts: ["email"],
  },
];

const SUMMARY = {
  installs: { total: 2, active_7d: 2, revoked: 0 },
  address: { claimed: 1, live: 1 },
  github: { installs: 1, linked_installations: 2, relayed_24h: 41, relayed_7d: 310, failure_rate_7d: 0.0097 },
  integrations: { jira: 0, notion: 1, confluence: 0, google_drive: 0 },
  broker: { installs: 1, tokens_7d: 120, tokens_per_day: 17.1429 },
  email: { opted_in: 2, sent_24h: 9, sent_7d: 104, bounce_rate_7d: 0.0673, complaint_rate_7d: 0.0096, paused: 1, recipients: 25 },
  sharing: 1,
  trend: ["20", "21", "22", "23", "24", "25", "26"].map((d, i) => ({ day: `2026-10-${d}`, events: 30 + i * 4, emails: 10 + i })),
  rows: ROWS,
  generated_at: "2026-10-26T10:00:00Z",
};

async function hostedAdmin(page: Page, email = PLATFORM_ADMIN) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    calls.push({ method: req.method(), path: p, body: req.postData() ? JSON.parse(req.postData() as string) : null });
    if (p === "/api/me") return json(route, { user_id: "u-1", team_id: "TEAM#ops", github_login: null, email, avatar_url: "", role: "owner" });
    if (p === "/api/usage") return json(route, { month: "2026-10", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "TEAM#ops", org: "ops", status: "active", current: true }] });
    if (p.startsWith("/api/admin/") && email !== PLATFORM_ADMIN) return json(route, { error: "Forbidden" }, 403);
    if (p === "/api/admin/hybrid/summary") return json(route, SUMMARY);
    if (p === "/api/admin/hybrid/ins_aaaaaaaaaaaaaaaaaaaaaaaa") {
      return json(route, {
        install: ROWS[0],
        trend: SUMMARY.trend,
        audit: [
          { action: "email_recipients", at: "2026-10-25T08:00:00Z", detail: '{"added":3,"by":"5f2c1a9e0b7d4c33","removed":0}' },
          { action: "verify", at: "2026-10-01T00:10:00Z", detail: "{}" },
        ],
      });
    }
    if (p.endsWith("/email/pause")) return json(route, { ok: true, paused: true });
    if (p === "/api/admin/beta-signups") return json(route, { signups: [], counts: { new: 0, invited: 0, joined: 0, total: 0 } });
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  return calls;
}

test("Admin, Self-host: totals, each hosted part, a trend, and installs with their audit log", async ({ page }) => {
  const calls = await hostedAdmin(page);
  await page.goto("/admin/self-host");
  await expect(page.getByRole("heading", { name: "Self-host", level: 1 })).toBeVisible();
  const tiles = page.getByTestId("selfhost-tiles");
  await expect(tiles).toContainText("2 active in 7 days, 0 revoked");
  await expect(tiles).toContainText("310 in 7 days, 0.97% failed");
  await expect(tiles).toContainText("104 in 7 days, 6.7% bounced");
  await expect(tiles).toContainText("1 paused, 25 recipients");
  await expect(page.getByTestId("selfhost-trend").getByRole("listitem")).toHaveCount(7);
  const rows = page.getByTestId("selfhost-rows").locator(":scope > li");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("acme-example.coderhelm.com");
  await expect(rows.nth(1)).toContainText("Email paused");
  // Counts only: no recipient address anywhere on the page.
  for (const part of ["selfhost-tiles", "selfhost-rows", "selfhost-trend"]) {
    expect(await page.getByTestId(part).innerText()).not.toMatch(/[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  }
  await shot(page, "admin-self-host");

  await rows.first().getByRole("button").first().click();
  await expect(page.getByTestId("selfhost-audit")).toContainText("email recipients");
  await shot(page, "admin-self-host-detail");
  await page.getByRole("button", { name: "Pause email" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Pause email" }).click();
  await expect.poll(() => calls.some((c) => c.path.endsWith("/email/pause") && (c.body as { paused: boolean }).paused === true)).toBe(true);
});

test("Admin, Self-host is refused to anyone but a platform admin", async ({ page }) => {
  await hostedAdmin(page, "someone@acme.test");
  await page.goto("/admin/self-host");
  await expect(page.getByText("Couldn't load the self-hosted installs")).toBeVisible();
});
