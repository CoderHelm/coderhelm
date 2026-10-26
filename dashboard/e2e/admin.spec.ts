import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Every API call is answered here. Nothing reaches a real backend. All names,
// emails and ids are invented.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const ADMIN_EMAIL = "admin@coderhelm.com";
const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

type Link = "main" | "github" | "jira" | "member" | "domain";

function team(p: { team_id: string; name?: string; link?: Link; personal?: boolean; active?: boolean; runs?: number; reviews?: number; repos?: number; members?: number }) {
  return {
    team_id: p.team_id,
    name: p.name ?? "",
    status: "active",
    plan: "",
    created_at: ago(90 * DAY),
    members: p.members ?? 1,
    invites: 0,
    repos: p.repos ?? 0,
    runs_total: p.runs ?? 0,
    runs_month: Math.floor((p.runs ?? 0) / 4),
    reviews_total: p.reviews ?? 0,
    reviews_month: 0,
    cost_month_usd: p.runs ? 12.5 : 0,
    tokens_month: 0,
    last_active_at: p.active === false ? "" : ago(DAY),
    github_org: p.name ?? "",
    has_installation: p.link === "github" || p.link === "main",
    jira_site: "",
    personal: p.personal ?? false,
    active: p.active ?? true,
    link: p.link ?? "main",
  };
}

type Team = ReturnType<typeof team>;

function org(key: string, label: string, teams: Team[], extra: Record<string, unknown> = {}) {
  const sum = (k: "runs_total" | "runs_month" | "reviews_total" | "reviews_month" | "repos") => teams.reduce((n, t) => n + t[k], 0);
  return {
    key,
    label,
    label_from: "github",
    domain: "",
    active: teams.some((t) => t.active),
    team_count: teams.length,
    personal_count: teams.filter((t) => t.personal).length,
    members: teams[0].members,
    repos: teams[0].repos,
    runs_total: sum("runs_total"),
    runs_month: sum("runs_month"),
    reviews_total: sum("reviews_total"),
    reviews_month: sum("reviews_month"),
    cost_month_usd: 12.5,
    last_active_at: ago(DAY),
    created_at: ago(200 * DAY),
    plan: "",
    teams,
    ...extra,
  };
}

// One company that shows up as eight teams (its main team, per-person GitHub
// teams and personal email workspaces), a second small company, and someone
// who signed up and never did anything.
function orgs() {
  return [
    org("TEAM#acme", "acme-labs", [
      team({ team_id: "TEAM#acme", name: "acme-labs", runs: 412, reviews: 37, repos: 9, members: 12 }),
      team({ team_id: "TEAM#acme-ci", name: "acme-ci-bot", link: "github", repos: 3 }),
      ...[1, 2, 3].map((n) => team({ team_id: `TEAM#gh-${n}`, link: "github", personal: true, active: false, repos: 9 })),
      ...[1, 2, 3].map((n) => team({ team_id: `TEAM#p-${n}`, link: n === 3 ? "domain" : "member", personal: true, active: false })),
    ]),
    org("TEAM#globex", "globex", [
      team({ team_id: "TEAM#globex", name: "globex", runs: 18, repos: 2, members: 3 }),
      team({ team_id: "TEAM#globex-p", link: "member", personal: true, active: false }),
    ]),
    org("TEAM#lone", "initech.test", [team({ team_id: "TEAM#lone", active: false })], { active: false, label_from: "domain", domain: "initech.test" }),
  ];
}

interface Signup {
  email: string;
  original_email: string;
  company: string;
  domain: string;
  reason: string;
  created_at: string;
  status: "new" | "invited" | "joined";
  invited_at: string;
}

function signups(): Signup[] {
  const s = (email: string, status: Signup["status"], daysAgo: number, company = "", reason = ""): Signup => ({
    email,
    original_email: email,
    company,
    domain: email.endsWith("@gmail.com") ? "" : email.split("@")[1],
    reason,
    created_at: ago(daysAgo * DAY),
    status,
    invited_at: status === "invited" ? ago(DAY) : "",
  });
  return [
    s("dana@umbrella.test", "new", 1, "Umbrella", "We review 40 PRs a day and want help with the boring ones."),
    s("eli.park@gmail.com", "new", 3, "", "Side project"),
    s("fay@hooli.test", "invited", 6, "Hooli"),
    s("gus@acme.test", "joined", 20, "Acme Labs"),
  ];
}

/** The usage check's last run, as GET /api/admin/usage-check returns it: all clear. */
const USAGE_OK = { state: "ran", checked_at: ago(2 * 3_600_000), secret: null, day: "2026-10-22", teams: 3, flagged_models: 0, failed_teams: 0 };

interface Backend {
  signups: Signup[];
  allowlist: string[];
  usageCheck: Record<string, unknown>;
  calls: { method: string; path: string; body: Record<string, unknown> | null }[];
}

async function mockApi(page: Page, email = ADMIN_EMAIL, usageCheck: Record<string, unknown> = USAGE_OK): Promise<Backend> {
  const db: Backend = { signups: signups(), allowlist: ["fay@hooli.test", "*@acme.test"], usageCheck, calls: [] };
  const admin = email === ADMIN_EMAIL;
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    const body = req.postData() ? (JSON.parse(req.postData() as string) as Record<string, unknown>) : null;
    db.calls.push({ method, path: p, body });
    if (p === "/api/me") return json(route, { user_id: "u-1", team_id: "TEAM#acme", github_login: null, email, avatar_url: "", role: "owner" });
    if (p === "/api/usage") return json(route, { month: "2026-10", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "TEAM#acme", org: "acme-labs", status: "active", current: true }] });
    if (p.startsWith("/api/admin/") || p === "/api/allowlist") {
      if (!admin) return json(route, { error: "Forbidden" }, 403);
    }
    if (p === "/api/admin/teams") {
      const o = orgs();
      return json(route, {
        month: "2026-10",
        orgs: o,
        teams: o.flatMap((x) => x.teams),
        counts: { teams: o.reduce((n, x) => n + x.teams.length, 0), orgs: o.length, active_orgs: 2, inactive_orgs: 1 },
      });
    }
    if (p === "/api/admin/beta-signups") {
      const count = (s: string) => db.signups.filter((x) => x.status === s).length;
      return json(route, { signups: db.signups, counts: { new: count("new"), invited: count("invited"), joined: count("joined"), total: db.signups.length } });
    }
    if (p === "/api/admin/beta-signups/invite" && method === "POST") {
      const target = db.signups.find((x) => x.email === body?.email);
      if (!target) return json(route, { error: "Not found" }, 404);
      target.status = "invited";
      target.invited_at = new Date().toISOString();
      if (!db.allowlist.includes(target.email)) db.allowlist.push(target.email);
      return json(route, { status: "invited", email: target.email, invited_at: target.invited_at });
    }
    if (p === "/api/admin/usage-check") return json(route, db.usageCheck);
    if (p === "/api/admin/sign-in-apps") {
      const redirect = "https://app.coderhelm.com/settings/integrations/mcp-callback/";
      return json(route, {
        secret_name: "coderhelm/prod/secrets",
        apps: [
          { kind: "notion", name: "Notion", app: "Notion public connection (OAuth)", configured: false, source: "", id_key: "notion_client_id", secret_key: "notion_client_secret", console: "https://www.notion.so/profile/integrations", scopes: [], redirect_uri: redirect },
          { kind: "confluence", name: "Atlassian (Confluence)", app: "Atlassian OAuth 2.0 (3LO) app", configured: true, source: "atlassian_client_id", id_key: "atlassian_client_id", secret_key: "atlassian_client_secret", console: "https://developer.atlassian.com/console/myapps/", scopes: ["read:page:confluence", "offline_access"], redirect_uri: redirect },
          { kind: "google_drive", name: "Google Drive", app: "Google OAuth client (Web application)", configured: false, source: "", id_key: "google_drive_client_id", secret_key: "google_drive_client_secret", console: "https://console.cloud.google.com/apis/credentials", scopes: ["https://www.googleapis.com/auth/drive.readonly"], redirect_uri: redirect },
        ],
      });
    }
    if (p === "/api/allowlist" && method === "GET") return json(route, { emails: db.allowlist });
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

const orgRows = (page: Page) => page.getByTestId("admin-org");
const orgRow = (page: Page, name: string) => orgRows(page).filter({ hasText: name });

test("teams read as one row per organization, active teams first, empty ones behind a filter", async ({ page }) => {
  await mockApi(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Platform admin" })).toBeVisible();
  await expect(page.getByText("3 organizations with 11 teams")).toBeVisible();

  // Active by default: two organizations, the busy one first, empty teams counted, not listed.
  await expect(orgRows(page)).toHaveCount(2);
  await expect(orgRows(page).first()).toContainText("acme-labs");
  const acme = orgRow(page, "acme-labs");
  await expect(acme).toContainText("37 reviews");
  await expect(acme).toContainText("6 more teams with no activity");
  await expect(page.getByRole("button", { name: /No activity/ })).toContainText("8");

  // Open the organization: its active teams, with why each one is there.
  await acme.getByRole("button", { name: "Show teams of acme-labs" }).click();
  const teams = acme.getByTestId("admin-team");
  await expect(teams).toHaveCount(2);
  await expect(teams.nth(1)).toContainText("Same GitHub installation");
  await shot(page, "admin-teams");

  // No activity: the personal workspaces and the abandoned sign-up.
  await page.getByRole("button", { name: /No activity/ }).click();
  await expect(page).toHaveURL(/status=inactive/);
  await expect(orgRows(page)).toHaveCount(3);
  // The organization stays open across the filter change.
  await expect(orgRow(page, "acme-labs").getByRole("button", { name: "Hide teams of acme-labs" })).toBeVisible();
  await expect(orgRow(page, "acme-labs").getByTestId("admin-team")).toHaveCount(6);
  await expect(orgRow(page, "acme-labs").getByText("Personal", { exact: true }).first()).toBeVisible();
  await expect(orgRow(page, "acme-labs").getByText("Shares a member").first()).toBeVisible();
  await expect(orgRow(page, "acme-labs").getByText("Same email domain")).toBeVisible();

  // Search reaches team ids and keeps the filter.
  await page.getByRole("searchbox", { name: "Search teams" }).fill("globex");
  await expect(orgRows(page)).toHaveCount(1);
  await expect(orgRows(page).first()).toContainText("globex");
  await shot(page, "admin-teams-inactive");
});

test("beta sign-ups: counts in the menu and the tab, search, copy and mark invited", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const db = await mockApi(page);
  await page.goto("/admin?tab=beta");

  // Two new sign-ups wait: the menu and the tab both say so.
  const nav = page.getByRole("link", { name: /^Admin/ });
  await expect(nav.getByTestId("count-badge")).toHaveText(/^2/);
  await expect(page.getByRole("link", { name: /Beta sign-ups/ })).toContainText("2");

  const rows = page.getByTestId("beta-signup");
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toContainText("dana@umbrella.test");
  await expect(rows.first()).toContainText("Umbrella");
  await expect(rows.first()).toContainText("We review 40 PRs a day");
  await expect(rows.filter({ hasText: "gus@acme.test" })).toContainText("Joined");
  await expect(rows.filter({ hasText: "eli.park@gmail.com" })).toContainText("No company given");
  await shot(page, "admin-beta");

  // Filter and search through the shared toolbar.
  await page.getByRole("button", { name: /^New/ }).click();
  await expect(rows).toHaveCount(2);
  await page.getByRole("searchbox", { name: "Search beta sign-ups" }).fill("umbrella");
  await expect(rows).toHaveCount(1);

  const dana = rows.filter({ hasText: "dana@umbrella.test" });
  await dana.getByRole("button", { name: "Copy email" }).click();
  await expect(dana.getByText("Copied")).toBeVisible();

  // Mark invited: confirm, the row moves to Invited and the menu count drops.
  await dana.getByRole("button", { name: "Mark dana@umbrella.test invited" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("added to the sign-up allowlist");
  await page.getByRole("alertdialog").getByRole("button", { name: "Mark invited" }).click();
  await expect(page.getByText("Marked dana@umbrella.test invited")).toBeVisible();
  expect(db.calls.find((c) => c.path === "/api/admin/beta-signups/invite")?.body).toEqual({ email: "dana@umbrella.test" });
  await expect(rows).toHaveCount(0);
  await page.getByRole("button", { name: /^Invited/ }).click();
  await expect(rows.filter({ hasText: "dana@umbrella.test" })).toContainText("Invited");
  await expect(nav.getByTestId("count-badge")).toHaveText(/^1/);

  // The allowlist tab shows the address it was given.
  await page.getByRole("link", { name: /Allowlist/ }).click();
  await expect(page.getByRole("list", { name: "Allowed emails" })).toContainText("dana@umbrella.test");
});

test("anyone but the platform admin is refused and sees no Admin menu item", async ({ page }) => {
  await mockApi(page, "owner@acme.test");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Admin/ })).toHaveCount(0);
});

test("sign-in apps: which are set up, and what to register for the rest, never a secret", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/admin");
  const panel = page.getByTestId("sign-in-apps");
  await expect(panel).toHaveAttribute("data-state", "ready");
  await expect(page.getByRole("region", { name: "Sign-in apps" })).toContainText("2 not set up");
  const rows = panel.getByTestId("sign-in-app");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAttribute("data-configured", "no");
  await expect(rows.nth(0)).toContainText("Not set up. App to register: Notion public connection (OAuth)");
  await expect(rows.nth(1)).toContainText("Set up, from atlassian_client_id");
  // Google Drive with only the Google sign-in client in the secret: not set up.
  await expect(rows.nth(2)).toHaveAttribute("data-configured", "no");
  await expect(rows.nth(2)).toContainText("Not set up. App to register: Google OAuth client (Web application)");
  await rows.nth(2).getByRole("button", { name: /Details/ }).click();
  await expect(rows.nth(2)).toContainText("google_drive_client_id and google_drive_client_secret in coderhelm/prod/secrets");
  await expect(rows.nth(2).getByTestId("sign-in-app-steps")).toHaveAttribute("href", "https://docs.coderhelm.com/self-host/knowledge-sources/#google-drive");
  await rows.nth(0).getByRole("button", { name: /Details/ }).click();
  await expect(rows.nth(0)).toContainText("https://app.coderhelm.com/settings/integrations/mcp-callback/");
  await expect(rows.nth(0)).toContainText("notion_client_secret in coderhelm/prod/secrets");
  expect(db.calls.filter((c) => c.path === "/api/admin/sign-in-apps").every((c) => c.method === "GET")).toBe(true);
  await shot(page, "admin-sign-in-apps");
});

test("the usage check reads OK when recorded usage matches the report", async ({ page }) => {
  await mockApi(page);
  await page.goto("/admin");
  const panel = page.getByTestId("usage-check");
  await expect(panel).toHaveAttribute("data-state", "ok");
  await expect(page.getByRole("region", { name: "Usage check" })).toContainText("OK");
  await expect(panel).toContainText("Recorded usage matches Anthropic's report: 3 teams compared for 2026-10-22, checked 2 h ago.");
  await expect(page.getByTestId("usage-problem")).toHaveCount(0);
  await shot(page, "admin-usage-ok");
});

test("the usage check lists each problem it found", async ({ page }) => {
  const db = await mockApi(page, ADMIN_EMAIL, { ...USAGE_OK, flagged_models: 2, failed_teams: 1 });
  await page.goto("/admin");
  const panel = page.getByTestId("usage-check");
  await expect(panel).toHaveAttribute("data-state", "problems");
  await expect(page.getByRole("region", { name: "Usage check" })).toContainText("2 problems");
  await expect(panel).not.toContainText("matches");
  const problems = page.getByRole("list", { name: "Usage check problems" }).getByTestId("usage-problem");
  await expect(problems).toHaveCount(2);
  await expect(problems.nth(0)).toContainText("2 models off from Anthropic's report");
  await expect(problems.nth(1)).toContainText("1 team not checked");
  expect(db.calls.some((c) => c.path === "/api/admin/usage-check")).toBe(true);
  await shot(page, "admin-usage-problems");
});

test("the usage check says when it is off or hasn't run", async ({ page }) => {
  const db = await mockApi(page, ADMIN_EMAIL, { state: "off", checked_at: ago(3_600_000), secret: "example/anthropic-admin-keys", day: null, teams: 0, flagged_models: 0, failed_teams: 0 });
  await page.goto("/admin");
  const panel = page.getByTestId("usage-check");
  await expect(panel).toHaveAttribute("data-state", "off");
  await expect(page.getByTestId("usage-problem")).toContainText("Add the key to example/anthropic-admin-keys.");

  db.usageCheck = { state: "never" };
  await page.reload();
  await expect(panel).toHaveAttribute("data-state", "never");
  await expect(page.getByTestId("usage-problem")).toContainText("Not run yet");
});
