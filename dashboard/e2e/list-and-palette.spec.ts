import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The shared list toolbar (search, status toggles, repo filter, all in the
// address) and the ⌘K command palette. Every API call is answered here;
// nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

function run(over: Record<string, unknown> = {}) {
  return {
    run_id: "01RUNA",
    status: "completed",
    ticket_source: "github",
    ticket_id: "your-team/web#12",
    title: "Fix the login page",
    repo: "your-team/web",
    pr_url: null,
    pr_number: null,
    cost_usd: 1,
    tokens_in: 10,
    tokens_out: 10,
    duration_s: 120,
    current_pass: "done",
    created_at: iso(10),
    ...over,
  };
}

const RUNS = [
  run(),
  run({ run_id: "01RUNB", status: "awaiting_ci", ticket_id: "ABC-7", title: "Retry the payment client", repo: "your-team/api", created_at: iso(5) }),
  run({ run_id: "01RUNC", status: "running", ticket_id: "ABC-9", title: "Move nightly jobs", created_at: iso(1) }),
];

const SEARCH = {
  q: "login",
  runs: [{ run_id: "01RUNA", title: "Fix the login page", ticket_id: "your-team/web#12", repo: "your-team/web", status: "completed", created_at: iso(10) }],
  reviews: [{ sk: "REVIEW#your-team/web#000042#x", repo: "your-team/web", pr_number: 42, title: "Login retries", verdict: "APPROVE", created_at: iso(20) }],
  releases: [{ repo: "your-team/web", tag: "v1.2.0", headline: "Faster login", updated_at: iso(60) }],
  plans: [{ plan_id: "p1", title: "Login overhaul", repo: "your-team/web", status: "draft", created_at: iso(90) }],
};

interface Backend {
  calls: string[];
  role: string;
  searchStatus: number;
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { calls: [], role: "admin", searchStatus: 200, ...init };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    db.calls.push(`${route.request().method()} ${p}${url.search}`);
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "person@example.com", avatar_url: "", role: db.role });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") {
      return json(route, {
        repos: [
          { name: "your-team/web", enabled: true, ticket_source: "github" },
          { name: "your-team/api", enabled: true, ticket_source: "github" },
        ],
      });
    }
    if (p === "/api/runs") {
      const status = url.searchParams.get("status");
      const repo = url.searchParams.get("repo");
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const runs = RUNS.filter(
        (r) =>
          (!status || status.split(",").includes(r.status)) &&
          (!repo || r.repo === repo) &&
          (!q || `${r.title} ${r.ticket_id} ${r.repo}`.toLowerCase().includes(q)),
      );
      return json(route, { runs, next: null });
    }
    if (p === "/api/search") {
      if (db.searchStatus !== 200) return route.fulfill({ status: db.searchStatus, body: "" });
      return json(route, { ...SEARCH, q: url.searchParams.get("q") });
    }
    if (p === "/api/reviewer/reviews") return json(route, { reviews: [], next: null });
    if (p === "/api/reviewer/live") return json(route, { prs: [] });
    if (p === "/api/data-sources") return json(route, { sources: [] });
    if (p === "/api/skills") return json(route, { repos: [], items: [], can_manage: true });
    if (p === "/api/users") {
      return json(route, {
        users: [{ user_id: "u_2", email: "teammate@example.com", github_login: "a-teammate", avatar_url: null, role: "member", name: "A Teammate", updated_at: null }],
      });
    }
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true });
}

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("the list toolbar", () => {
  test("search, status toggles and the repo filter live in the address and reach the server", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/");
    const toolbar = page.getByTestId("list-toolbar");
    await expect(toolbar).toBeVisible();
    await expect(page.getByTestId("run-row")).toHaveCount(3);

    // Waiting = the group's statuses, sent as one status filter.
    await toolbar.getByRole("button", { name: /^Waiting/ }).click();
    await expect(page).toHaveURL(/status=waiting/);
    await expect(page.getByTestId("run-row")).toHaveCount(1);
    expect(db.calls.some((c) => c.includes("status=awaiting_ci%2Cneeds_input%2Cneeds_outside_change"))).toBe(true);
    await expect(toolbar.getByRole("button", { name: /^Waiting/ })).toHaveAttribute("aria-pressed", "true");

    // Back undoes the toggle.
    await page.goBack();
    await expect(page.getByTestId("run-row")).toHaveCount(3);

    // "/" focuses the search; typing filters after a short pause.
    await page.locator("body").click();
    await page.keyboard.press("/");
    await expect(toolbar.getByRole("searchbox", { name: "Search runs" })).toBeFocused();
    await page.keyboard.type("login");
    await expect(page).toHaveURL(/q=login/);
    await expect(page.getByTestId("run-row")).toHaveCount(1);
    await toolbar.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByTestId("run-row")).toHaveCount(3);

    // Two repos: the repo filter shows, in the app font.
    const repoButton = toolbar.getByRole("button", { name: /Repository: All repos/ });
    await expect(repoButton).toBeVisible();
    const font = await repoButton.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(font).not.toMatch(/mono/i);
    await repoButton.click();
    await page.getByRole("option", { name: "your-team/api" }).click();
    await expect(page).toHaveURL(/repo=your-team%2Fapi/);
    await expect(page.getByTestId("run-row")).toHaveCount(1);
    expect(db.calls.some((c) => c.includes("repo=your-team%2Fapi"))).toBe(true);
  });

  test("an address with filters opens the list filtered", async ({ page }) => {
    await mockApi(page);
    await page.goto("/?status=active&q=nightly");
    await expect(page.getByTestId("run-row")).toHaveCount(1);
    await expect(page.getByRole("searchbox", { name: "Search runs" })).toHaveValue("nightly");
    await expect(page.getByRole("button", { name: /^Active/ })).toHaveAttribute("aria-pressed", "true");
  });

  test("the toolbar and rows fit a phone without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 760 });
    await mockApi(page);
    await page.goto("/");
    await expect(page.getByTestId("run-row")).toHaveCount(3);
    await noSideScroll(page);
    await shot(page, "runs-toolbar-phone");
  });

  test("Review a PR is a small dialog, not a card on the page", async ({ page }) => {
    await mockApi(page);
    await page.goto("/reviewer");
    await expect(page.getByRole("heading", { level: 1, name: "Reviewer" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Pull request number" })).toHaveCount(0);
    await page.getByRole("button", { name: "Review a PR…" }).click();
    const dialog = page.getByRole("dialog", { name: "Review a PR" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Pull request number" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Review a PR…" })).toBeFocused();
  });
});

test.describe("the command palette", () => {
  test("Ctrl+K opens it; typing searches every kind; Enter opens the hit and it becomes recent", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/");
    await expect(page.getByTestId("run-row")).toHaveCount(3);

    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Search and commands" });
    await expect(palette).toBeVisible();
    const input = palette.getByRole("combobox");
    await expect(input).toBeFocused();
    // Empty: actions, scopes and pages.
    await expect(palette.getByRole("group", { name: "Pages" })).toBeVisible();
    await expect(palette.getByRole("option", { name: /Review a PR/ })).toBeVisible();

    await input.fill("login");
    await expect(palette.getByRole("group", { name: "Runs" }).getByRole("option", { name: /Fix the login page/ })).toBeVisible();
    await expect(palette.getByRole("group", { name: "Pull requests" }).getByRole("option", { name: /Login retries/ })).toBeVisible();
    await expect(palette.getByRole("group", { name: "Releases" }).getByRole("option", { name: /v1\.2\.0/ })).toBeVisible();
    await expect(palette.getByRole("group", { name: "Plans" }).getByRole("option", { name: /Login overhaul/ })).toBeVisible();
    // Debounced: one search for the whole word, not one per letter.
    expect(db.calls.filter((c) => c.startsWith("GET /api/search")).length).toBe(1);

    await palette.getByRole("option", { name: /Fix the login page/ }).click();
    await expect(page).toHaveURL(/\/runs\/detail\/?\?id=01RUNA/);

    await page.keyboard.press("Control+k");
    await expect(palette.getByRole("group", { name: "Recent" }).getByRole("option", { name: /Fix the login page/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
  });

  test("> shows only actions, and a scope narrows the search", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/");
    await page.getByTestId("open-command-palette").click();
    const palette = page.getByRole("dialog", { name: "Search and commands" });
    const input = palette.getByRole("combobox");
    await input.fill(">review");
    await expect(palette.getByRole("group", { name: "Actions" }).getByRole("option", { name: /Review a PR/ })).toBeVisible();
    await expect(palette.getByRole("group", { name: "Pages" })).toHaveCount(0);

    await input.fill("");
    await palette.getByRole("option", { name: "Search runs" }).click();
    await expect(palette.getByRole("button", { name: /Searching Runs/ })).toBeVisible();
    await input.fill("login");
    await expect(palette.getByRole("group", { name: "Runs" }).getByRole("option", { name: /Fix the login page/ })).toBeVisible();
    await expect(palette.getByRole("group", { name: "Pull requests" })).toHaveCount(0);
    expect(db.calls.some((c) => c.startsWith("GET /api/search") && c.includes("types=runs"))).toBe(true);
    // Backspace in the empty box leaves the scope.
    await input.fill("");
    await page.keyboard.press("Backspace");
    await expect(palette.getByRole("button", { name: /Searching Runs/ })).toHaveCount(0);
  });

  test("Review a PR from the palette opens the dialog on the Reviewer page", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await expect(page.getByTestId("run-row")).toHaveCount(3);
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Search and commands" });
    await palette.getByRole("combobox").fill(">review a pr");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/reviewer\/?\?review=1/);
    await expect(page.getByRole("dialog", { name: "Review a PR" })).toBeVisible();
  });

  test("members are found for admins; an older backend still finds runs", async ({ page }) => {
    const db = await mockApi(page, { searchStatus: 404 });
    await page.goto("/");
    await expect(page.getByTestId("run-row")).toHaveCount(3);
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Search and commands" });
    await palette.getByRole("combobox").fill("teammate");
    await expect(palette.getByRole("group", { name: "Members" }).getByRole("option", { name: /A Teammate/ })).toBeVisible();
    await palette.getByRole("combobox").fill("login");
    await expect(palette.getByRole("group", { name: "Runs" }).getByRole("option", { name: /Fix the login page/ })).toBeVisible();
    expect(db.calls.some((c) => c.startsWith("GET /api/runs?q=login"))).toBe(true);
  });

  test("viewers see no members, pull requests or releases", async ({ page }) => {
    const db = await mockApi(page, { role: "viewer" });
    await page.goto("/");
    await expect(page.getByTestId("run-row")).toHaveCount(3);
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Search and commands" });
    await palette.getByRole("combobox").fill("login");
    await expect(palette.getByRole("group", { name: "Runs" })).toBeVisible();
    await expect(palette.getByRole("group", { name: "Pull requests" })).toHaveCount(0);
    await expect(palette.getByRole("group", { name: "Releases" })).toHaveCount(0);
    expect(db.calls.some((c) => c.startsWith("GET /api/users"))).toBe(false);
  });

  test("on a phone it fills the width, and the header has a search button", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 760 });
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const palette = page.getByRole("dialog", { name: "Search and commands" });
    await expect(palette).toBeVisible();
    await palette.getByRole("combobox").fill("login");
    await expect(palette.getByRole("option", { name: /Fix the login page/ })).toBeVisible();
    const box = await palette.boundingBox();
    expect(box && box.width).toBeLessThanOrEqual(375);
    await noSideScroll(page);
    await shot(page, "palette-phone");
  });
});
