import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Hybrid: a self-hosted install that uses Coderhelm's apps and a
// name.coderhelm.com address (Settings, then System, Hybrid), the app choice
// on the integration pages, and the hosted dashboard's hand-offs for GitHub's
// setup page and OAuth callbacks. Every call is answered here; names are made up.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const SELF = { apiUrl: "", streamUrl: "", selfHosted: true, version: "v1.2.0" };
const ME = { user_id: "u_1", team_id: "t_1", github_login: null, email: "owner@example.org", avatar_url: "", role: "owner", auth_provider: "email", mfa_enabled: false, platform_admin: true };

interface State {
  registered: boolean;
  verified: boolean;
  name: { name: string; hostname: string; code: string } | null;
  mode: "own" | "hosted";
  links: { installation_id: number; account: string; repositories: string[] }[];
  hosted: Set<string>;
  sharing: { enabled: boolean; payloads: boolean };
  /** Whether Coderhelm's own Google Drive app is set up (the hosted side's `offered`). */
  driveOffered?: boolean;
}

interface Call {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

function status(s: State) {
  const checks = [
    { id: "hybrid_registered", status: s.registered ? "pass" : "todo", code: s.registered ? "ok" : "not_registered", title: "Registered with Coderhelm", fix: s.registered ? null : "Press Register with Coderhelm." },
    ...(s.registered ? [{ id: "hybrid_relay", status: s.verified ? "pass" : "fail", code: s.verified ? "ok" : "signature_mismatch", title: "Events from Coderhelm are signed for this install", fix: s.verified ? null : "Register again so this install and Coderhelm share the same signing key." }] : []),
    ...(s.registered ? [{ id: "hybrid_github", status: s.links.length ? "pass" : "todo", code: s.links.length ? "ok" : "no_link", title: "Coderhelm's GitHub App is linked", fix: s.links.length ? null : "Press Install on GitHub, or use your own GitHub App." }] : []),
    ...(s.name ? [{ id: "hybrid_name", status: "wait", code: "cert_pending", title: `Certificate for ${s.name.hostname}`, fix: "Coderhelm is issuing it. This takes a few minutes." }] : []),
  ];
  return {
    available: true,
    hosted_url: "https://app.coderhelm.com",
    registered: s.registered,
    install_id: s.registered ? "ins_abcdefghijklmnopqrstuvwx" : null,
    cloudfront: "d111test.cloudfront.net",
    verified: s.verified,
    name: s.name,
    github: { mode: s.mode, links: s.links, app_slug: "coderhelm" },
    integrations: [
      { id: "github", name: "GitHub", mode: "hosted", through_coderhelm: "Webhook events, on their way to this install.", stays_with_you: "Your code: the install reads it straight from GitHub.", uses_coderhelm: s.mode === "hosted" },
      { id: "jira", name: "Jira (Forge app)", mode: "hosted", through_coderhelm: "Ticket events and the sign-in.", stays_with_you: "Ticket contents Coderhelm reads later.", uses_coderhelm: s.hosted.has("jira") },
      { id: "notion", name: "Notion", mode: "hosted", through_coderhelm: "The sign-in only.", stays_with_you: "Every page Coderhelm reads.", uses_coderhelm: s.hosted.has("notion") },
      { id: "confluence", name: "Confluence (Atlassian)", mode: "hosted", through_coderhelm: "The sign-in only.", stays_with_you: "Every page Coderhelm reads.", uses_coderhelm: s.hosted.has("confluence") },
      { id: "google_drive", name: "Google Drive", mode: "hosted", through_coderhelm: "The sign-in only.", stays_with_you: "Every file Coderhelm reads.", uses_coderhelm: s.hosted.has("google_drive"), offered: s.driveOffered !== false },
      { id: "slack_notifications", name: "Slack and Teams notifications", mode: "direct", through_coderhelm: "", stays_with_you: "", uses_coderhelm: false },
      { id: "mcp_apps", name: "Figma, Linear, Sentry, Sanity and other sign-in apps", mode: "direct", through_coderhelm: "", stays_with_you: "", uses_coderhelm: false },
      { id: "slack_commands", name: "Slack and Teams commands", mode: "unavailable", through_coderhelm: "", stays_with_you: "", reason: "CoderHelm has no shared Slack or Teams app: each team connects its own app's signing secret in Plugins settings, so there is nothing to relay. That keeps working the same way on a hybrid install.", uses_coderhelm: false },
      { id: "github_sign_in", name: "Sign in with GitHub", mode: "unavailable", through_coderhelm: "", stays_with_you: "", reason: "Signing people in to your install with GitHub needs your own GitHub App: a hosted app's sign-in would hand CoderHelm your people's identities. Use email sign-in, or Google with your own domain.", uses_coderhelm: false },
    ],
    sharing: s.sharing,
    checks,
  };
}

const NAMES: Record<string, { available: boolean; code: string; error: string | null }> = {
  "taken-name": { available: false, code: "taken", error: "Someone already uses taken-name.coderhelm.com." },
  coderhelm: { available: false, code: "reserved", error: null },
  ab: { available: false, code: "too_short", error: null },
};

async function setup(page: Page, cfg: Record<string, unknown> | null = SELF, init: Partial<State> = {}) {
  const s: State = { registered: false, verified: false, name: null, mode: "own", links: [], hosted: new Set(["notion"]), sharing: { enabled: false, payloads: false }, ...init };
  const calls: Call[] = [];
  const json = (route: Route, body: unknown, code = 200) => route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.pathname === "/runtime-config.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: `window.__CODERHELM_CONFIG__ = ${JSON.stringify(cfg ?? {})};` }),
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
    calls.push({ method, path: `${p}${u.search}`, body });
    if (p === "/api/me") return json(route, ME);
    if (p === "/api/usage") return json(route, { month: "2026-10", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "example-org", status: "active", current: true }] });
    if (p === "/api/system/version") {
      return json(route, { self_hosted: true, current: { version: "v1.2.0", commit: "abc1234", released_at: "2026-10-01T00:00:00Z", config_fingerprint: null }, latest: null, update_available: false, running: false, settings: { auto: false, channel: "stable", day: "sun", hour: 3, timezone: "UTC", majors: "ask" }, history: [], install: { stage: "acme", region: "eu-west-1" } });
    }
    if (p === "/api/system/preflight") return json(route, { checked_at: "2026-10-25T10:00:00Z", ready: true, current: "v1.2.0", latest: null, blockers: [], checks: [] });
    if (p === "/api/system/domain") {
      return json(route, {
        available: true, status: "skip", code: "none",
        domain: { hostname: null, state: "none", mode: null, current: "d111test.cloudfront.net", target: "d111test.cloudfront.net", records: [] },
        check: { key: "domain", group: "Domain", label: "Your own domain", status: "skip", detail: "Coderhelm uses its AWS address d111test.cloudfront.net.", fix: { text: "Add it in Settings, then System.", href: "/settings/system#domain" } },
      });
    }

    // Hybrid
    if (p === "/api/system/hybrid" && method === "GET") return json(route, status(s));
    if (p === "/api/system/hybrid/register" && method === "POST") {
      s.registered = true;
      return json(route, status(s));
    }
    if (p === "/api/system/hybrid" && method === "DELETE") {
      Object.assign(s, { registered: false, verified: false, name: null, mode: "own", links: [] });
      return json(route, status(s));
    }
    const name = p.match(/^\/api\/system\/hybrid\/names\/(.+)$/);
    if (name) {
      const n = name[1];
      const known = NAMES[n] ?? { available: true, code: "ok", error: null };
      return json(route, { name: n, hostname: `${n}.coderhelm.com`, ...known });
    }
    if (p === "/api/system/hybrid/name" && method === "PUT") {
      const n = String(body?.name ?? "");
      s.name = { name: n, hostname: `${n}.coderhelm.com`, code: "cert_pending" };
      return json(route, status(s));
    }
    if (p === "/api/system/hybrid/name" && method === "DELETE") {
      s.name = null;
      return json(route, status(s));
    }
    if (p === "/api/system/hybrid/github/link" && method === "POST") {
      return json(route, { state: "hyb_abc123", install_url: "https://github.com/apps/coderhelm/installations/new?state=hyb_abc123" });
    }
    const gh = p.match(/^\/api\/system\/hybrid\/github\/(\d+)$/);
    if (gh) {
      const id = Number(gh[1]);
      if (method === "PUT") s.links = s.links.map((l) => (l.installation_id === id ? { ...l, repositories: (body?.repositories as string[]) ?? [] } : l));
      if (method === "DELETE") s.links = s.links.filter((l) => l.installation_id !== id);
      return json(route, status(s));
    }
    if (p === "/api/system/hybrid/settings" && method === "PUT") {
      if (body?.github_mode) s.mode = body.github_mode as State["mode"];
      if (Array.isArray(body?.integrations)) s.hosted = new Set(body!.integrations as string[]);
      if (body?.sharing) s.sharing = body.sharing as State["sharing"];
      return json(route, status(s));
    }

    // The hosted API's hand-offs.
    if (p === "/hybrid/oauth/callback") {
      if (u.searchParams.get("fail") || (body?.state as string)?.startsWith("plain")) return json(route, { error: "not a hybrid sign-in" }, 404);
      return json(route, { redirect: `${u.origin}/settings/?from=hybrid` });
    }
    if (p === "/hybrid/github/setup") return route.fulfill({ status: 200, contentType: "text/html", body: "<p>handed off</p>" });

    // The normal OAuth finish and the integration pages.
    if (p === "/api/mcp-servers/oauth/callback") return json(route, { server: { id: "srv_1", name: "Example docs", catalog_id: "" }, tools_error: null });
    if (p === "/api/integrations") return json(route, { can_edit: true, migrated: 0, items: [{ id: "github", section: "code", name: "GitHub", does: "", status: "connected", reason: "", action: "none", last_check: "", manage_href: "" }] });
    if (p === "/api/repos") return json(route, { repos: [] });
    if (p === "/api/integrations/jira/check") return json(route, { ready: false, secret_configured: false, configured_repos: { total: 0, enabled: 0 }, enabled_repos: [], jira_events_seen: false, last_jira_event_at: null, jira_event_count: 0, installation_id: null, team_id: "t_1", forge_secret: "" });
    if (p === "/api/integrations/jira/config") return json(route, { default_project: "", trigger_label: "coderhelm", list_projects_url: "", create_ticket_url: "", add_comment_url: "", site_url: "https://example-org.atlassian.net", projects: [] });
    if (p === "/api/github/installation-status") return json(route, { status: "connected", github_org: "example-org", installation_id: 1 });
    return json(route, {});
  });
  const puts = () => calls.filter((c) => c.method === "PUT" && c.path === "/api/system/hybrid/settings").map((c) => c.body);
  return { s, calls, puts };
}

test("not registered: the three setups, what Coderhelm sees, then register", async ({ page }) => {
  const { calls } = await setup(page);
  await page.goto("/settings/system/#hybrid");
  const section = page.getByTestId("hybrid-section");
  await expect(section).toHaveAttribute("data-registered", "false");
  await expect(section.getByTestId("hybrid-setups").locator("li[data-setup]")).toHaveCount(3);
  await expect(section.locator('[data-setup="private"]')).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("hybrid-register")).toContainText("It changes nothing in your AWS account");
  await expect(page.getByTestId("hybrid-register")).toContainText("d111test.cloudfront.net");
  // Nothing else to pick until the install is registered.
  await expect(page.getByTestId("hybrid-name")).toHaveCount(0);
  await page.getByTestId("hybrid-register-button").click();
  await expect(section).toHaveAttribute("data-registered", "true");
  expect(calls.some((c) => c.method === "POST" && c.path === "/api/system/hybrid/register")).toBe(true);
  await expect(page.getByTestId("hybrid-registered")).toContainText("ins_abcdefghijklmnopqrstuvwx");
  await expect(page.getByTestId("hybrid-verified")).toContainText("Waiting");
  await expect(section.locator('[data-setup="hybrid"]')).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("hybrid-checks").locator('[data-id="hybrid_relay"]')).toContainText("share the same signing key");
});

test("name: taken, reserved and too short say why; a free one is claimed with its checks; release", async ({ page }) => {
  const { calls } = await setup(page, SELF, { registered: true, verified: true });
  await page.goto("/settings/system/");
  const row = page.getByTestId("hybrid-name");
  const input = row.getByTestId("hybrid-name-input");
  const state = row.getByTestId("hybrid-name-status");

  await input.fill("taken-name");
  await expect(state).toHaveAttribute("data-code", "taken");
  await expect(state).toContainText("Someone already uses taken-name.coderhelm.com.");
  await expect(row.getByTestId("hybrid-claim")).toBeDisabled();

  await input.fill("coderhelm");
  await expect(state).toHaveAttribute("data-code", "reserved");
  await expect(state).toContainText("kept back by Coderhelm");

  await input.fill("ab");
  await expect(state).toContainText("at least 3 characters");

  await input.fill("Example-Org");
  await expect(state).toHaveAttribute("data-code", "ok");
  await expect(state).toContainText("example-org.coderhelm.com is available.");
  await row.getByTestId("hybrid-claim").click();
  await expect(row).toHaveAttribute("data-claimed", "true");
  expect(calls.find((c) => c.method === "PUT" && c.path === "/api/system/hybrid/name")?.body).toEqual({ name: "example-org" });
  await expect(row.getByTestId("hybrid-hostname")).toHaveText("example-org.coderhelm.com");
  await expect(row.getByTestId("hybrid-name-checks")).toContainText("Certificate for example-org.coderhelm.com");
  await expect(row.getByTestId("hybrid-name-checks")).toContainText("Waiting");

  await row.getByTestId("hybrid-release").click();
  await page.getByTestId("confirm-dialog").getByRole("button", { name: "Release the address" }).click();
  await expect(row).toHaveAttribute("data-claimed", "false");
  expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/system/hybrid/name")).toBe(true);
});

test("GitHub: switch to Coderhelm's app, install on GitHub, edit repositories, unlink", async ({ page }) => {
  const { puts, calls, s } = await setup(page, SELF, { registered: true, verified: true });
  await page.goto("/settings/system/");
  const row = page.getByTestId("hybrid-github");
  await expect(row).toHaveAttribute("data-mode", "own");
  await row.getByRole("radio", { name: /Use Coderhelm's GitHub App \(easiest\)/ }).check();
  await expect(row).toHaveAttribute("data-mode", "hosted");
  expect(puts()).toContainEqual({ github_mode: "hosted" });

  // Read before the click: once the browser is on its way to GitHub the
  // page's address can already be the next one.
  const origin = new URL(page.url()).origin;
  const toGithub = page.waitForRequest((r) => r.url().startsWith("https://github.com/apps/coderhelm/installations/new?state=hyb_abc123"));
  await row.getByTestId("hybrid-github-install").click();
  await toGithub;
  const link = calls.find((c) => c.method === "POST" && c.path === "/api/system/hybrid/github/link");
  expect(link?.body).toEqual({ return_url: `${origin}/settings/system/` });
});

test("GitHub links: repositories are edited and saved, and a link is removed", async ({ page }) => {
  const { calls } = await setup(page, SELF, { registered: true, verified: true, mode: "hosted", links: [{ installation_id: 77, account: "example-org", repositories: ["example-org/web"] }] });
  await page.goto("/settings/system/");
  const card = page.getByTestId("hybrid-github-link");
  await expect(card).toContainText("example-org");
  await expect(card).toContainText("1 repository");
  await card.getByRole("textbox", { name: "Add a repository" }).fill("api");
  await card.getByRole("button", { name: "Add" }).click();
  await card.getByRole("button", { name: "Remove example-org/web" }).click();
  await card.getByTestId("hybrid-repos-save").click();
  await expect.poll(() => calls.find((c) => c.method === "PUT" && c.path === "/api/system/hybrid/github/77")?.body).toEqual({ repositories: ["example-org/api"] });
  await card.getByRole("button", { name: "Unlink" }).click();
  await page.getByTestId("confirm-dialog").getByRole("button", { name: "Unlink" }).click();
  await expect(page.getByTestId("hybrid-github-link")).toHaveCount(0);
  expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/system/hybrid/github/77")).toBe(true);
});

for (const [outcome, words, tone] of [
  ["linked", "GitHub is linked.", "success"],
  ["linked_elsewhere", "already linked to another install", "error"],
  ["used_by_hosted_team", "used by a team on Coderhelm's hosted service", "error"],
  ["signin_failed", "didn't confirm who you are", "error"],
  ["no_write_access", "can't push to any repository", "error"],
  ["declined", "you chose Cancel", "error"],
  ["install_off", "verified and active", "error"],
] as const) {
  test(`GitHub sent back ${outcome}: one sentence and the fix, and the address is cleaned`, async ({ page }) => {
    await setup(page, SELF, { registered: true, verified: true, mode: "hosted" });
    await page.goto(`/settings/system/?hybrid_github=${outcome}#hybrid`);
    const box = page.getByTestId("hybrid-github-outcome");
    await expect(box).toHaveAttribute("data-outcome", outcome);
    await expect(box).toContainText(words);
    await expect(box.getByRole(tone === "error" ? "alert" : "status")).toBeVisible();
    await expect(page).not.toHaveURL(/hybrid_github=/);
    await expect(page).toHaveURL(/#hybrid$/);
  });
}

test("other apps: each choice sends the hosted list; direct and unavailable say so", async ({ page }) => {
  const { puts } = await setup(page, SELF, { registered: true, verified: true });
  await page.goto("/settings/system/");
  const jira = page.getByTestId("hybrid-integration-jira");
  await expect(jira).toContainText("Ticket events and the sign-in.");
  await jira.getByRole("button", { name: "Use Coderhelm's app (easiest)" }).click();
  await expect.poll(() => (puts().at(-1)?.integrations as string[] | undefined)?.slice().sort()).toEqual(["jira", "notion"]);
  await expect(jira.getByRole("button", { name: "Use Coderhelm's app (easiest)" })).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("hybrid-integration-notion").getByRole("button", { name: "Use my own app (fully private)" }).click();
  await expect.poll(() => puts().at(-1)?.integrations).toEqual(["jira"]);
  await expect(page.getByTestId("hybrid-integration-confluence")).toHaveAttribute("data-mode", "hosted");
  await expect(page.getByTestId("hybrid-integration-slack_notifications")).toContainText("Works from your install, no app needed");
  await expect(page.getByTestId("hybrid-integration-mcp_apps")).toContainText("Works from your install, no app needed");
  await expect(page.getByTestId("hybrid-integration-slack_commands")).toContainText("Not available");
  await expect(page.getByTestId("hybrid-integration-github_sign_in")).toContainText("needs your own GitHub App");
  // GitHub has its own row above, so it isn't listed again.
  await expect(page.getByTestId("hybrid-integration-github")).toHaveCount(0);
});

test("other apps: Google Drive can't use Coderhelm's app while Coderhelm's Drive app isn't set up", async ({ page }) => {
  await setup(page, SELF, { registered: true, verified: true, driveOffered: false });
  await page.goto("/settings/system/");
  const drive = page.getByTestId("hybrid-integration-google_drive");
  await expect(drive).toContainText("Coderhelm's app isn't set up yet");
  await expect(drive).toContainText("Use your own Google Drive app for now.");
  await expect(drive.getByRole("button", { name: "Use Coderhelm's app (easiest)" })).toHaveCount(0);
  // The others still offer the choice.
  await expect(page.getByTestId("hybrid-integration-notion").getByRole("button", { name: "Use Coderhelm's app (easiest)" })).toBeVisible();
});

test("sharing with support: off by default, exactly what is sent, payloads only when asked", async ({ page }) => {
  const { puts } = await setup(page, SELF, { registered: true, verified: true });
  await page.goto("/settings/system/");
  const row = page.getByTestId("hybrid-sharing");
  await expect(row).toHaveAttribute("data-enabled", "false");
  await expect(row).toContainText("Never headers");
  await expect(row).toContainText("source, event type, status, reason code, attempts and timings");
  await expect(row.getByTestId("hybrid-payloads-switch")).toHaveCount(0);
  await row.getByRole("switch", { name: "Share failed deliveries with Coderhelm support" }).click();
  await expect(row).toHaveAttribute("data-enabled", "true");
  expect(puts().at(-1)).toEqual({ sharing: { enabled: true, payloads: false } });
  await row.getByRole("switch", { name: "Include payload previews" }).click();
  await expect.poll(() => puts().at(-1)).toEqual({ sharing: { enabled: true, payloads: true } });
  await row.getByRole("switch", { name: "Share failed deliveries with Coderhelm support" }).click();
  await expect.poll(() => puts().at(-1)).toEqual({ sharing: { enabled: false, payloads: false } });
});

test("check again asks for the deep checks", async ({ page }) => {
  const { calls } = await setup(page, SELF, { registered: true });
  await page.goto("/settings/system/");
  await expect(page.getByTestId("hybrid-checks")).toContainText("1 needs a fix.");
  await expect(page.getByTestId("hybrid-checks").locator('[data-id="hybrid_relay"]')).toHaveAttribute("data-status", "fail");
  const before = calls.filter((c) => c.path === "/api/system/hybrid?deep=1").length;
  await page.getByTestId("hybrid-recheck").click();
  await expect.poll(() => calls.filter((c) => c.path === "/api/system/hybrid?deep=1").length).toBe(before + 1);
});

test("leave hybrid asks first, then goes back to fully private", async ({ page }) => {
  const { calls } = await setup(page, SELF, { registered: true, verified: true });
  await page.goto("/settings/system/");
  await page.getByTestId("hybrid-leave").click();
  const dialog = page.getByTestId("confirm-dialog");
  await expect(dialog).toContainText("stop working until you set up your own app");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/system/hybrid")).toBe(false);
  await page.getByTestId("hybrid-leave").click();
  await dialog.getByRole("button", { name: "Leave hybrid" }).click();
  await expect(page.getByTestId("hybrid-section")).toHaveAttribute("data-registered", "false");
  expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/system/hybrid")).toBe(true);
});

test("domain: a Coderhelm address is the third choice and leads to the name picker", async ({ page }) => {
  await setup(page, SELF, { registered: true, verified: true });
  await page.goto("/settings/system/");
  const choices = page.getByTestId("address-choices");
  await expect(choices.locator("[data-choice]")).toHaveCount(3);
  await expect(choices.locator('[data-choice="aws"]')).toContainText("d111test.cloudfront.net");
  await choices.getByTestId("address-choose-coderhelm").click();
  await expect(page.getByTestId("hybrid-name-input")).toBeFocused();
  await expect(page).toHaveURL(/#hybrid-name$/);
  // The own-domain form is still there.
  await expect(page.getByTestId("domain-input")).toBeVisible();
});

test("integration pages: the app choice saves the same settings, and links to System before registering", async ({ page }) => {
  const { puts } = await setup(page, SELF, { registered: true, verified: true });
  await page.goto("/settings/integrations/github/");
  const choice = page.getByTestId("hybrid-app-choice");
  await expect(choice).toHaveAttribute("data-state", "own");
  await choice.getByRole("button", { name: "Use Coderhelm's app (easiest)" }).click();
  await expect(choice).toHaveAttribute("data-state", "coderhelm");
  expect(puts().at(-1)).toEqual({ github_mode: "hosted" });

  await page.goto("/settings/integrations/jira/");
  const jira = page.getByTestId("hybrid-app-choice");
  await jira.getByRole("button", { name: "Use Coderhelm's app (easiest)" }).click();
  await expect.poll(() => (puts().at(-1)?.integrations as string[] | undefined)?.slice().sort()).toEqual(["jira", "notion"]);
});

test("integration pages before registering point to Settings, System, Hybrid", async ({ page }) => {
  await setup(page, SELF);
  await page.goto("/settings/integrations/github/");
  const choice = page.getByTestId("hybrid-app-choice");
  await expect(choice).toHaveAttribute("data-state", "unregistered");
  await expect(choice.getByRole("link", { name: /Settings, System, Hybrid/ })).toHaveAttribute("href", /\/settings\/system\/?#hybrid$/);
});

test("the hosted service shows no app choice", async ({ page }) => {
  const { calls } = await setup(page, {});
  await page.goto("/settings/integrations/github/");
  await expect(page.getByRole("heading", { name: "GitHub", level: 1 })).toBeVisible();
  await expect(page.getByTestId("hybrid-app-choice")).toHaveCount(0);
  expect(calls.some((c) => c.path.startsWith("/api/system/hybrid"))).toBe(false);
});

// ── The hosted dashboard's hand-offs ────────────────────────────────

test("hosted: GitHub's setup page with a hyb_ state goes to the hosted API, never the team link", async ({ page }) => {
  const { calls } = await setup(page, {});
  const handed = page.waitForRequest((r) => new URL(r.url()).pathname === "/hybrid/github/setup");
  await page.goto("/settings/github/?installation_id=123&setup_action=install&state=hyb_xyz");
  const req = await handed;
  const q = new URL(req.url()).searchParams;
  expect(Object.fromEntries(q)).toEqual({ installation_id: "123", state: "hyb_xyz", setup_action: "install" });
  expect(calls.some((c) => c.path.startsWith("/api/github/link-installation"))).toBe(false);
});

test("hosted: an OAuth callback that belongs to an install is passed on to it", async ({ page }) => {
  const { calls } = await setup(page, {});
  await page.goto("/settings/integrations/mcp-callback/?code=c1&state=hyb_s1&iss=https%3A%2F%2Fauth.example.com");
  await expect(page).toHaveURL(/\/settings\/\?from=hybrid$/);
  const post = calls.find((c) => c.path === "/hybrid/oauth/callback");
  expect(post?.body).toEqual({ code: "c1", state: "hyb_s1", error: null, iss: "https://auth.example.com" });
  expect(calls.some((c) => c.path === "/api/mcp-servers/oauth/callback")).toBe(false);
});

test("hosted: any other OAuth callback (404 from the hand-off) finishes as before", async ({ page }) => {
  const { calls } = await setup(page, {});
  await page.goto("/settings/integrations/mcp-callback/?code=c2&state=plain_s2");
  await expect.poll(() => calls.some((c) => c.path === "/api/mcp-servers/oauth/callback")).toBe(true);
  expect(calls.find((c) => c.path === "/api/mcp-servers/oauth/callback")?.body).toEqual({ state: "plain_s2", code: "c2" });
  await expect(page).toHaveURL(/\/settings\/integrations\/#integration-mcp:srv_1$/);
  expect(calls.filter((c) => c.path === "/hybrid/oauth/callback")).toHaveLength(1);
});

for (const [label, viewport] of [["1440", { width: 1440, height: 1000 }], ["390", { width: 390, height: 844 }]] as const) {
  test(`linking refusals read plainly and fit at ${label}, and the install step names the Link confirmation`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await setup(page, SELF, { registered: true, verified: true, mode: "hosted" });
    await page.goto("/settings/system/#hybrid");
    await expect(page.getByTestId("hybrid-github")).toContainText("press Link");
    await expect(page.getByTestId("hybrid-github")).toContainText("only the repositories you can push to");
    for (const [outcome, title, fix] of [
      ["no_write_access", "can't push to any repository in that installation", "get write access on GitHub"],
      ["declined", "you chose Cancel on Coderhelm's confirmation page", "choose Link"],
      ["install_off", "verified and active, so nothing was linked", "Press Check again"],
    ] as const) {
      await page.goto(`/settings/system/?hybrid_github=${outcome}#hybrid`);
      const box = page.getByTestId("hybrid-github-outcome");
      await expect(box).toHaveAttribute("data-outcome", outcome);
      await expect(box).toContainText(title);
      await expect(box).toContainText(fix);
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
}

test("on a phone the Hybrid section fits", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, SELF, { registered: true, verified: true, mode: "hosted", links: [{ installation_id: 77, account: "example-org", repositories: ["example-org/web", "example-org/api"] }], name: { name: "example-org", hostname: "example-org.coderhelm.com", code: "ok" } });
  await page.goto("/settings/system/#hybrid");
  await expect(page.getByTestId("hybrid-section")).toBeVisible();
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth)).toBe(true);
});

// Screenshots for review: E2E_SHOTS_DIR=… npx playwright test hybrid -g screenshots
for (const [label, viewport] of [["1440", { width: 1440, height: 1000 }], ["390", { width: 390, height: 844 }]] as const) {
  test.describe(`screenshots at ${label}`, () => {
    test.use({ viewport });
    test(`hybrid screenshots ${label}`, async ({ page }) => {
      await setup(page, SELF, {
        registered: true, verified: true, mode: "hosted",
        links: [{ installation_id: 77, account: "example-org", repositories: ["example-org/web", "example-org/api"] }],
        name: { name: "example-org", hostname: "example-org.coderhelm.com", code: "ok" },
      });
      await page.goto("/settings/system/");
      await expect(page.getByTestId("hybrid-section")).toBeVisible();
      fs.mkdirSync(SHOTS_DIR, { recursive: true });
      // The top bar sticks; let it scroll away so it isn't drawn over the section.
      await page.addStyleTag({ content: ".sticky{position:static!important}" });
      const section = page.locator("#hybrid");
      await section.screenshot({ path: path.join(SHOTS_DIR, `hybrid-registered-${label}.png`) });
      await page.locator("#domain").screenshot({ path: path.join(SHOTS_DIR, `domain-choices-${label}.png`) });
    });
    test(`hybrid unregistered screenshot ${label}`, async ({ page }) => {
      await setup(page, SELF);
      await page.goto("/settings/system/");
      await expect(page.getByTestId("hybrid-register")).toBeVisible();
      await page.addStyleTag({ content: ".sticky{position:static!important}" });
      fs.mkdirSync(SHOTS_DIR, { recursive: true });
      await page.locator("#hybrid").screenshot({ path: path.join(SHOTS_DIR, `hybrid-unregistered-${label}.png`) });
    });
  });
}


// ── Settings, System, Uninstall ─────────────────────────────────────────

test("uninstall: a link to the guided uninstall with this install filled in, never a choice to delete", async ({ page }) => {
  const { calls } = await setup(page);
  await page.goto("/settings/system/");
  const section = page.getByTestId("uninstall-section");
  await expect(section).toContainText("coderhelm-acme in eu-west-1");
  await expect(section).toContainText("7-day minimum");
  await expect(page.getByTestId("uninstall-hybrid")).toHaveCount(0);
  const href = await page.getByTestId("uninstall-link").getAttribute("href");
  expect(href).toBe("https://docs.coderhelm.com/self-host/uninstall/?stage=acme&region=eu-west-1");
  expect(href).not.toMatch(/mode|everything|confirm/);
  expect(await page.getByTestId("uninstall-link").evaluate((e) => getComputedStyle(e).cursor)).toBe("pointer");
  // Opening the guide deletes nothing here.
  expect(calls.some((c) => c.method === "DELETE")).toBe(false);
});

test("uninstall, hybrid: a plain warning that the forwarded GitHub installations and Jira site go back to Coderhelm hosted", async ({ page }) => {
  await setup(page, SELF, { registered: true, verified: true, mode: "hosted", links: [{ installation_id: 1, account: "example-org", repositories: [] }, { installation_id: 2, account: "example-two", repositories: [] }] });
  await page.goto("/settings/system/");
  await expect(page.getByTestId("uninstall-hybrid")).toContainText("2 GitHub installations");
  await expect(page.getByTestId("uninstall-hybrid")).toContainText("back to Coderhelm hosted");
  await expect(page.getByTestId("uninstall-link")).toHaveAttribute("href", "https://docs.coderhelm.com/self-host/uninstall/?stage=acme&region=eu-west-1&hybrid=1&github=2");
  if (process.env.E2E_SHOTS_DIR) await page.getByTestId("uninstall-section").screenshot({ path: path.join(SHOTS_DIR, "system-uninstall.png") });
});
