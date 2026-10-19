import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The app shell (menu, sign in, banners, page titles, 404), the runs list,
// and a sweep that opens every page outside settings with the server failing.
// Every API call is answered here. Nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

const RUNS = [
  { run_id: "01RUN00000000000000000003", status: "needs_input", ticket_id: "WEB-12", title: "Show the class schedule on the details page", repo: "your-team/web", created_at: iso(5), duration_s: 754 },
  { run_id: "01RUN00000000000000000004", status: "needs_outside_change", ticket_id: "OPS-3", title: "Saturday class missing from the site", repo: "your-team/data-sync", created_at: iso(30), duration_s: 95 },
  { run_id: "01RUN00000000000000000002", status: "failed", ticket_id: "WEB-12", title: "Show the class schedule on the details page", repo: "your-team/web", created_at: iso(60), duration_s: 42 },
  { run_id: "01RUN00000000000000000001", status: "merged", ticket_id: "API-7", title: "Retry the sync job once when the upstream times out and log the second failure", repo: "your-team/a-backend-service-with-a-long-name", created_at: iso(600), duration_s: 4000 },
  { run_id: "01RUN00000000000000000000", status: "awaiting_ci", ticket_id: "", title: "", repo: "your-team/web", created_at: iso(3000) },
];

interface Backend {
  calls: string[];
  role: string;
  email: string;
  me: number;
  status?: string;
  runs: number;
  runsOnce: boolean;
  empty: boolean;
  more: number;
  /** Answer every page API (not the shell) with this status; 0 = normal. */
  allFail: number;
  usage: { total_tokens: number; max_tokens: number };
  banners: unknown[];
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = {
    calls: [], role: "admin", email: "admin@example.com", me: 200, runs: 200, runsOnce: false, empty: false, more: 0, allFail: 0,
    usage: { total_tokens: 0, max_tokens: 0 }, banners: [], ...init,
  };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    db.calls.push(`${req.method()} ${p}${url.search}`);
    if (p === "/api/me") {
      if (db.me !== 200) return route.fulfill({ status: db.me, body: "" });
      return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: db.email, avatar_url: "", role: db.role, status: db.status });
    }
    if (p === "/api/usage") return json(route, { month: "2026-01", tokens_in: 0, tokens_out: 0, total_runs: 0, ...db.usage });
    if (p === "/api/banners") return json(route, { banners: db.banners });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }, { team_id: "t_2", org: "other-team", status: "active", current: false }] });
    // The gateway answers errors with a bare status and no body.
    if (db.allFail) return route.fulfill({ status: db.allFail, body: "" });
    if (p === "/api/runs") {
      if (db.runs !== 200) {
        const status = db.runs;
        if (db.runsOnce) db.runs = 200;
        return route.fulfill({ status, body: "" });
      }
      if (db.empty) return json(route, { runs: [], next: null });
      if (url.searchParams.get("cursor")) {
        if (db.more === 2) return route.fulfill({ status: 500, body: "" });
        return json(route, { runs: [{ ...RUNS[2], run_id: "01RUN0000000000000000000Z", ticket_id: "OLD-1", title: "An older run" }], next: null });
      }
      return json(route, { runs: RUNS, next: db.more ? "01RUN00000000000000000000" : null });
    }
    if (p === "/api/integrations/jira/events") return json(route, { events: [] });
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  return db;
}

/** Fails the test on any console error or uncaught page error. */
function watchConsole(page: Page, { allowFailedLoads = false } = {}) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (t.includes("net::ERR_ABORTED") || t.includes("net::ERR_FAILED")) return;
    // A mocked 4xx/5xx makes the browser log this line; the page itself is fine.
    if (allowFailedLoads && t.startsWith("Failed to load resource")) return;
    errors.push(t);
  });
  return errors;
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

test("runs list: plain status words, readable times, grouped attempts with a named toggle", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Runs" })).toBeVisible();
  const table = page.getByRole("table");
  await expect(table.getByText("Needs your answer").filter({ visible: true })).toBeVisible();
  await expect(table.getByText("Merged").filter({ visible: true })).toBeVisible();
  await expect(table.getByText("Waiting on CI").filter({ visible: true })).toBeVisible();
  await expect(table.getByText("needs_input")).toHaveCount(0);
  // A run whose fix is a setting in another system says so in words.
  await expect(table.getByText("Needs a change outside the code").filter({ visible: true })).toBeVisible();
  await expect(table.getByText("needs_outside_change")).toHaveCount(0);
  // 754 s reads as minutes, not raw seconds.
  await expect(table.getByText("took 12m 34s")).toBeVisible();
  await expect(table.getByText("took 1h 6m")).toBeVisible();
  // A run with no title still has a link to open it.
  await expect(table.getByRole("link", { name: "Untitled run" })).toHaveAttribute("href", /\/runs\/detail\/?\?id=01RUN00000000000000000000/);

  const toggle = page.getByRole("button", { name: "Show 1 earlier attempt" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(page.getByRole("button", { name: "Hide 1 earlier attempt" })).toHaveAttribute("aria-expanded", "true");
  await expect(table.getByText("Failed").filter({ visible: true })).toBeVisible();
  await expect(page).toHaveTitle("Runs · Coderhelm");
  await shot(page, "shell-runs");
  expect(errors).toEqual([]);
});

test("runs list: a failed load says so and Try again reloads", async ({ page }) => {
  const errors = watchConsole(page, { allowFailedLoads: true });
  const db = await mockApi(page, { runs: 500 });
  await page.goto("/");
  await expect(page.getByRole("alert").filter({ hasText: "Runs could not be loaded" })).toBeVisible();
  await expect(page.getByText("No runs yet")).toHaveCount(0);
  await shot(page, "shell-runs-error");
  db.runs = 200;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("table").getByText("Needs your answer").filter({ visible: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("runs list: empty state says how to start a run", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page, { empty: true });
  await page.goto("/");
  await expect(page.getByText("No runs yet")).toBeVisible();
  await expect(page.getByText(/Assign a GitHub issue to the Coderhelm bot/)).toBeVisible();
  await expect(page.getByRole("link", { name: "write a plan" })).toHaveAttribute("href", /\/plans\/new/);
  await shot(page, "shell-runs-empty");
  expect(errors).toEqual([]);
});

test("runs list: a failed Load more is reported and can be tried again", async ({ page }) => {
  const errors = watchConsole(page, { allowFailedLoads: true });
  const db = await mockApi(page, { more: 2 });
  await page.goto("/");
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "The next page did not load." })).toBeVisible();
  db.more = 1;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("link", { name: "An older run" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Load more|Try again/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("menu: current page is marked, icon buttons have names, tab titles follow the page", async ({ page }) => {
  const errors = watchConsole(page, { allowFailedLoads: true });
  await mockApi(page, { allFail: 500 });
  await page.goto("/plans/templates");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Templates" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Plans", exact: true })).not.toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await expect(page).toHaveTitle("Templates · Coderhelm");
  await page.goto("/runs/detail?id=01RUN00000000000000000003");
  await expect(page).toHaveTitle("Run · Coderhelm");

  const switcher = page.getByRole("button", { name: /Team: your-team\. Switch team/ });
  await expect(switcher).toHaveAttribute("aria-expanded", "false");
  await switcher.click();
  await expect(page.getByRole("button", { name: "other-team" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "other-team" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("banners are announced and the dismiss button has a name", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page, {
    banners: [{ id: "b1", message: "Scheduled maintenance tonight.", type: "warning", dismissible: true }],
    usage: { total_tokens: 2_000_000, max_tokens: 1_000_000 },
  });
  await page.goto("/");
  await expect(page.getByRole("status").filter({ hasText: "Scheduled maintenance tonight." })).toBeVisible();
  const limit = page.getByRole("alert").filter({ hasText: "Token limit reached" });
  await expect(limit.getByRole("link", { name: "See usage" })).toHaveAttribute("href", /\/settings\/budget/);
  await shot(page, "shell-banners");
  await page.getByRole("button", { name: "Dismiss this message" }).click();
  await expect(page.getByText("Scheduled maintenance tonight.")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("token limit banner: only the owner is told to raise it; others are told who can", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page, { role: "member", usage: { total_tokens: 2_000_000, max_tokens: 1_000_000 } });
  await page.goto("/");
  const limit = page.getByRole("alert").filter({ hasText: "Token limit reached" });
  await expect(limit.getByText(/Ask the team owner to raise the limit/)).toBeVisible();
  await expect(limit.getByRole("link", { name: "See usage" })).toBeVisible();
  db.role = "owner";
  await page.reload();
  await expect(limit.getByRole("link", { name: "Raise the limit" })).toHaveAttribute("href", /\/settings\/budget/);
  expect(errors).toEqual([]);
});

test("sign in screen: every field has a name", async ({ page }) => {
  const errors = watchConsole(page, { allowFailedLoads: true });
  await mockApi(page, { me: 401 });
  await page.goto("/");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue with GitHub" })).toHaveAttribute("href", /\/auth\/github$/);
  await shot(page, "shell-sign-in");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.getByLabel("Email")).toBeVisible();
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await page.getByRole("button", { name: "Join waitlist" }).click();
  await expect(page.getByLabel("Email")).toBeVisible();
  expect(errors).toEqual([]);
});

test("removed GitHub app: the sign in link goes to a route that exists", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page, { status: "deactivated" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "The GitHub app was removed" })).toBeVisible();
  // GET /auth/login does not exist (405); GitHub sign in does.
  await expect(page.getByRole("link", { name: "Then sign in with GitHub again" })).toHaveAttribute("href", /\/auth\/github$/);
  await shot(page, "shell-deactivated");
  expect(errors).toEqual([]);
});

test("a role guarded page tells a viewer why it is closed and links back to runs", async ({ page }) => {
  const errors = watchConsole(page, { allowFailedLoads: true });
  await mockApi(page, { role: "viewer" });
  await page.goto("/reviewer");
  await expect(page.getByText("This page needs a different role")).toBeVisible();
  await page.getByRole("link", { name: "Back to Runs" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Runs" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a link to a page that does not exist shows a 404 with a way back", async ({ page }) => {
  const errors = watchConsole(page, { allowFailedLoads: true });
  await mockApi(page);
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to runs" })).toBeVisible();
  await shot(page, "shell-404");
  await page.getByRole("link", { name: "Go to runs" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Runs" })).toBeVisible();
  expect(errors.filter((e) => !e.includes("404"))).toEqual([]);
});

// Every page outside settings, opened while the server fails every call. Each
// must show its heading (or, for a detail page with nothing to name, an error
// box), no crash, and no sideways scroll on a phone.
const PAGES: { path: string; heading: RegExp }[] = [
  { path: "/", heading: /Runs/ },
  { path: "/runs/detail?id=01RUN00000000000000000003", heading: /run/i },
  { path: "/plans", heading: /Plans/ },
  { path: "/plans/detail?id=01PLAN0000000000000000000", heading: /plan/i },
  { path: "/plans/new", heading: /plan/i },
  { path: "/plans/templates", heading: /templates/i },
  { path: "/reviewer", heading: /Reviewer/ },
  { path: "/reviewer/config", heading: /Reviewer settings/ },
  { path: "/reviewer/detail?sk=REVIEW%23x", heading: /review/i },
  { path: "/releases", heading: /Releases/ },
  { path: "/tests", heading: /Tests/ },
  { path: "/tests/run?key=r_1", heading: /./ },
  { path: "/tests/test?id=t_1", heading: /./ },
  { path: "/graph", heading: /Code graph/i },
  { path: "/analytics", heading: /Analytics/ },
  { path: "/infrastructure", heading: /Infrastructure/ },
  { path: "/alerts", heading: /Alerts/ },
  { path: "/alerts/detail?id=01ALERT000000000000000000", heading: /alert/i },
  { path: "/health", heading: /health/i },
  { path: "/memory", heading: /Memory/ },
  { path: "/admin", heading: /admin/i },
];

for (const { path: route, heading } of PAGES) {
  test(`sweep: ${route} handles a failing server without crashing`, async ({ page }) => {
    const errors = watchConsole(page, { allowFailedLoads: true });
    await mockApi(page, { allFail: 500, email: "admin@coderhelm.com", role: "owner" });
    await page.goto(route);
    const named = page.getByRole("heading", { level: 1 }).filter({ hasText: heading }).first();
    const failed = page.getByRole("main").getByRole("alert").first();
    await expect(named.or(failed).first()).toBeVisible();
    // Give late requests time to fail and render.
    await page.waitForTimeout(800);
    await expect(page.getByText("Application error")).toHaveCount(0);
    // Errors are said in words, never as a bare status line.
    await expect(page.getByText(/API \d{3}:/)).toHaveCount(0);
    const name = `sweep${route.split("?")[0].replace(/\//g, "-") || "-home"}`.replace(/-$/, "-home");
    await shot(page, name);
    expect(errors).toEqual([]);
  });
}
