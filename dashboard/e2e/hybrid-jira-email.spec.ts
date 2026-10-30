import { expect, test, type Page, type Route } from "@playwright/test";

// Jira through Coderhelm (a hybrid install links a hosted team's Jira site,
// and the hosted team's admin confirms it), the Relay and Email panels on the
// Deliveries overview, and no Google sign-in on a self-hosted install. Every
// API call is answered here; names and addresses are made up.

const SELF = { apiUrl: "", streamUrl: "", selfHosted: true, version: "v1.2.0" };
const ME = { user_id: "u_1", team_id: "t_1", github_login: null, email: "owner@example.org", avatar_url: "", role: "owner", auth_provider: "email", mfa_enabled: false, platform_admin: true };

interface Jira {
  enabled: boolean;
  link: { team_id: string; site_url: string; linked_by: string; linked_at: string } | null;
  synced: boolean;
}

interface Call {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

function hybrid(j: Jira) {
  return {
    available: true,
    hosted_url: "https://app.coderhelm.com",
    registered: true,
    install_id: "ins_abcdefghijklmnopqrstuvwx",
    cloudfront: "d111test.cloudfront.net",
    verified: true,
    name: null,
    github: { mode: "own", links: [], app_slug: "coderhelm" },
    integrations: [],
    sharing: { enabled: false, payloads: false },
    jira: j,
    checks: j.enabled
      ? [
          j.link
            ? { id: "hybrid_jira", status: "pass", code: "ok", title: `${j.link.site_url} is linked through CoderHelm`, fix: null }
            : { id: "hybrid_jira", status: "todo", code: "no_link", title: "Link your Jira site through CoderHelm", fix: "Open Settings, Integrations, Jira and press Link: sign in to CoderHelm as an admin of the team that connected the site, and confirm." },
        ]
      : [],
  };
}

async function setup(page: Page, cfg: Record<string, unknown>, opts: { jira?: Partial<Jira>; linkRequest?: Record<string, unknown>; signedIn?: boolean; teamLinked?: boolean } = {}) {
  const jira: Jira = { enabled: false, link: null, synced: false, ...opts.jira };
  const calls: Call[] = [];
  const json = (route: Route, body: unknown, code = 200) => route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.pathname === "/runtime-config.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: `window.__CODERHELM_CONFIG__ = ${JSON.stringify(cfg)};` }),
  );
  await page.route((url) => !["localhost", "127.0.0.1"].includes(url.hostname), (route) => route.abort());
  await page.route((url) => ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/(api|auth|hybrid)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const p = decodeURIComponent(u.pathname);
    const method = req.method();
    let body: Record<string, unknown> | null = null;
    try {
      body = req.postData() ? JSON.parse(req.postData()!) : null;
    } catch {
      body = null;
    }
    calls.push({ method, path: p, body });
    if (p === "/api/me") return opts.signedIn === false ? json(route, { error: "unauthorized" }, 401) : json(route, ME);
    if (p === "/api/usage") return json(route, { month: "2026-10", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "example-org", status: "active", current: true }] });
    if (p === "/api/integrations") return json(route, { can_edit: true, migrated: 0, items: [{ id: "github", section: "code", name: "GitHub", does: "", status: "connected", reason: "", action: "none", last_check: "", manage_href: "" }] });
    if (p === "/api/integrations/jira/check") return json(route, { ready: false, secret_configured: false, configured_repos: { total: 0, enabled: 0 }, enabled_repos: [], jira_events_seen: false, last_jira_event_at: null, jira_event_count: 0, installation_id: null, team_id: "t_1", forge_secret: "" });
    if (p === "/api/integrations/jira/config") return json(route, { default_project: "", trigger_label: "coderhelm", list_projects_url: "", create_ticket_url: "", add_comment_url: "", site_url: "https://example.atlassian.net", projects: [] });
    if (p === "/api/integrations/jira/events") return json(route, { events: [] });
    if (p === "/api/repos") return json(route, { repos: [] });
    if (p === "/api/system/hybrid" && method === "GET") return cfg.selfHosted ? json(route, hybrid(jira)) : json(route, { error: "not here" }, 404);
    if (p === "/api/system/hybrid/settings" && method === "PUT") {
      if (typeof body?.jira_link === "boolean") {
        jira.enabled = body.jira_link;
        if (!jira.enabled) Object.assign(jira, { link: null, synced: false });
      }
      return json(route, hybrid(jira));
    }
    if (p === "/api/system/hybrid/jira/link" && method === "POST") {
      return json(route, { state: "hyj_test", code: "ABCD2345", link_url: `${u.origin}/settings/?hosted-link-page=1` });
    }
    if (p === "/api/system/hybrid/jira/link" && method === "DELETE") {
      Object.assign(jira, { link: null, synced: false });
      return json(route, hybrid(jira));
    }
    if (p === "/api/hybrid/jira-link" && method === "GET") return json(route, opts.teamLinked ? { linked: true, install_address: "helm.example.org", linked_at: "2026-10-30T00:00:00Z" } : { linked: false });
    if (p === "/api/hybrid/jira-link" && method === "DELETE") return json(route, { linked: false });
    if (p === "/api/hybrid/jira-link/hyj_test" && method === "GET") {
      return json(route, opts.linkRequest ?? { install_address: "helm.example.org", install_registered_at: "2026-10-01T00:00:00Z", site_url: "https://example.atlassian.net", forge: true, blocked: null, message: null });
    }
    if (p === "/api/hybrid/jira-link/hyj_test" && method === "POST") {
      const outcome = body?.choice === "link" ? "linked" : "declined";
      return json(route, { outcome, return_url: `${u.origin}/settings/?hybrid_jira=${outcome}` });
    }
    if (p === "/api/deliveries/analytics") return json(route, analytics());
    if (p === "/api/deliveries") {
      return json(route, { deliveries: [], summary: { total: 0, ok: 0, failed: 0, pending: 0, success_rate: null, oldest_pending_at: null, last_failure_at: null }, sources: [], retention_days: 14, sharing: { available: false, enabled: false, payloads: false }, hybrid: true });
    }
    return json(route, {});
  });
  return { calls, jira };
}

function analytics() {
  const zero = { deliveries: 0, handled: 0, ignored: 0, failed: 0, success_rate: null, retried: 0, retried_ok: 0, retries: 0, p50_ms: null, p95_ms: null, p99_ms: null };
  const kind = (k: string, label: string, n: number) => ({ kind: k, label, sends: n, deliveries: n, bounces: k === "notices" ? 1 : 0, complaints: 0, rejections: 0 });
  return {
    period: "7d", granularity: "day", from: "2026-10-24T00:00:00Z", to: "2026-10-31T00:00:00Z", previous_from: "2026-10-17T00:00:00Z", previous_to: "2026-10-24T00:00:00Z",
    summary: { ...zero, deliveries: 130, handled: 128, failed: 2, success_rate: 0.9846 }, previous: zero, series: [],
    sources: [], reasons: [], events: [], endpoints: [], seen_sources: ["relay", "relay_jira"], backfill: { complete: true },
    relay: [
      { provider: "github", deliveries: 120, ok: 119, failed: 1, success_rate: 0.9917, p95_ms: 420, last_delivered_at: new Date(Date.now() - 60_000).toISOString(), last_failed_at: null },
      { provider: "jira", deliveries: 10, ok: 9, failed: 1, success_rate: 0.9, p95_ms: 610, last_delivered_at: new Date(Date.now() - 5 * 60_000).toISOString(), last_failed_at: new Date(Date.now() - 3_600_000).toISOString() },
    ],
    email: {
      sender: "relay", from: "2026-10-24", to: "2026-10-30",
      kinds: [kind("sign_in", "Sign-in and invites", 4), kind("password_reset", "Password resets", 0), kind("notices", "Run and review notices", 12), kind("weekly_summary", "Weekly summary", 3), kind("alerts", "Alerts", 1), kind("other", "Other", 0)],
      totals: { kind: "all", label: "All email", sends: 20, deliveries: 20, bounces: 1, complaints: 0, rejections: 0 },
      last_send_at: new Date(Date.now() - 120_000).toISOString(), last_delivery_at: new Date(Date.now() - 118_000).toISOString(), last_bounce_at: null, last_complaint_at: null,
      cognito_sender: "cognito_default", cognito_daily_limit: 50,
    },
    kept_days: 120, records_kept_days: 14,
  };
}

test("an install turns on Link through Coderhelm, starts the link, sees the linked site and unlinks", async ({ page }) => {
  const { calls, jira } = await setup(page, SELF);
  await page.goto("/settings/integrations/jira/");
  const card = page.getByTestId("hybrid-jira-link");
  await expect(card).toHaveAttribute("data-state", "off");
  await page.getByTestId("hybrid-jira-switch").click();
  await expect(card).toHaveAttribute("data-state", "on");
  expect(calls.some((c) => c.method === "PUT" && c.path === "/api/system/hybrid/settings" && c.body?.jira_link === true)).toBe(true);
  await expect(card).toContainText("admin of the team that connected the site");

  // The site is required: Link waits for it.
  await expect(page.getByTestId("hybrid-jira-start")).toBeDisabled();
  await page.getByTestId("hybrid-jira-site-input").fill("example.atlassian.net");
  await page.getByTestId("hybrid-jira-start").click();
  await expect.poll(() => calls.some((c) => c.method === "POST" && c.path === "/api/system/hybrid/jira/link")).toBe(true);
  const start = calls.find((c) => c.method === "POST" && c.path === "/api/system/hybrid/jira/link");
  expect(String(start?.body?.return_url)).toMatch(/\/settings\/integrations\/jira\/$/);
  expect(start?.body?.site_url).toBe("example.atlassian.net");
  // The install shows the code to type on Coderhelm, and opens its page.
  await expect(page.getByTestId("hybrid-jira-code")).toHaveText("ABCD2345");
  await expect(page.getByTestId("hybrid-jira-open")).toHaveAttribute("href", /hosted-link-page=1/);

  // Back from Coderhelm, linked.
  jira.link = { team_id: "TEAM#1", site_url: "https://example.atlassian.net", linked_by: "USER#1", linked_at: "2026-10-30T00:00:00Z" };
  jira.synced = true;
  await page.goto("/settings/integrations/jira/?hybrid_jira=linked");
  await expect(page.getByTestId("hybrid-jira-outcome")).toContainText("linked through Coderhelm");
  await expect(page.getByTestId("hybrid-jira-site")).toContainText("example.atlassian.net");
  expect(page.url()).not.toContain("hybrid_jira=");
  await page.getByTestId("hybrid-jira-unlink").click();
  await expect(card).toHaveAttribute("data-state", "on");
  expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/system/hybrid/jira/link")).toBe(true);
});

test("the hosted team admin sees which install and site, and only Link links", async ({ page }) => {
  const { calls } = await setup(page, {});
  await page.goto("/settings/integrations/jira/?hybrid_link=hyj_test");
  const box = page.getByTestId("hosted-jira-link");
  await expect(box).toContainText("helm.example.org");
  await expect(box).toContainText("example.atlassian.net");
  await expect(box).toContainText("If someone sent you this link, choose Cancel.");
  expect(calls.some((c) => c.method === "POST" && c.path.startsWith("/api/hybrid/jira-link/"))).toBe(false);
  // Link waits for the code the install shows.
  await expect(page.getByTestId("hosted-jira-link-confirm")).toBeDisabled();
  await page.getByTestId("hosted-jira-link-code").fill("abcd-2345");
  await page.getByTestId("hosted-jira-link-confirm").click();
  await expect.poll(() => calls.find((c) => c.method === "POST" && c.path === "/api/hybrid/jira-link/hyj_test")?.body?.choice).toBe("link");
  expect(calls.find((c) => c.method === "POST" && c.path === "/api/hybrid/jira-link/hyj_test")?.body?.code).toBe("abcd-2345");
  await page.waitForURL(/\/settings\/\?hybrid_jira=linked/);
});

test("the hosted team sees where its site is linked and can unlink it there", async ({ page }) => {
  const { calls } = await setup(page, {}, { teamLinked: true });
  await page.goto("/settings/integrations/jira/");
  const box = page.getByTestId("hosted-jira-linked");
  await expect(box).toContainText("helm.example.org");
  await box.getByRole("button", { name: "Unlink" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Unlink" }).click();
  await expect.poll(() => calls.some((c) => c.method === "DELETE" && c.path === "/api/hybrid/jira-link")).toBe(true);
  await expect(box).toHaveCount(0);
});

test("a site that can't be linked says why, and offers no Link button", async ({ page }) => {
  await setup(page, {}, {
    linkRequest: { install_address: "helm.example.org", install_registered_at: "2026-10-01T00:00:00Z", site_url: "", forge: false, blocked: "jira_not_connected", message: "This team doesn't run CoderHelm's Jira app on a Jira site yet. Set the app up from this page first, then start again from the install." },
  });
  await page.goto("/settings/integrations/jira/?hybrid_link=hyj_test");
  await expect(page.getByTestId("hosted-jira-link-blocked")).toContainText("doesn't run CoderHelm's Jira app");
  await expect(page.getByTestId("hosted-jira-link-confirm")).toHaveCount(0);
});

test("the hosted page ignores a malformed link and the install shows no hosted confirmation", async ({ page }) => {
  const { calls } = await setup(page, {});
  await page.goto("/settings/integrations/jira/?hybrid_link=not-a-link");
  await expect(page.getByRole("heading", { name: "Jira" })).toBeVisible();
  await expect(page.getByTestId("hosted-jira-link")).toHaveCount(0);
  expect(calls.some((c) => c.path.startsWith("/api/hybrid/jira-link/"))).toBe(false);
});

test("Deliveries shows GitHub and Jira relay rows and email by kind, with Cognito's cap", async ({ page }) => {
  await setup(page, SELF);
  await page.goto("/settings/deliveries/?view=overview");
  const relay = page.getByTestId("overview-relay");
  await expect(relay).toContainText("GitHub");
  await expect(relay).toContainText("Jira");
  await expect(relay).toContainText("Last failed");
  const email = page.getByTestId("overview-email");
  await expect(email).toContainText("Run and review notices");
  await expect(email).toContainText("Password resets");
  await expect(page.getByTestId("overview-email-cognito")).toContainText("about 50 a day");
});

test("a self-hosted install's sign-in has no Google button; the hosted service keeps it", async ({ page }) => {
  await setup(page, SELF, { signedIn: false });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Continue with GitHub" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveCount(0);
});
