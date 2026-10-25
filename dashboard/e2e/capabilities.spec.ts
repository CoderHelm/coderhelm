import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Controls follow the capabilities /api/me sends, so a custom role sees
// exactly what the gateway lets it do. Every API call is answered here.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

const BASELINE = ["view", "view_team", "own_account"];
const MEMBER = [...BASELINE, "plans", "runs", "reviews", "recommendations", "view_alerts", "view_integrations"];

interface Me {
  role: string;
  capabilities?: string[];
  custom_role?: { id: string; name: string } | null;
}

const REPOS = [
  { name: "acme/web", enabled: true, onboard_status: "ready", role: "web" },
  { name: "acme/api", enabled: false },
];

async function mockApi(page: Page, me: Me) {
  const calls: { method: string; path: string }[] = [];
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const p = new URL(route.request().url()).pathname;
    const method = route.request().method();
    calls.push({ method, path: p });
    if (p === "/api/me") return json(route, { user_id: "u1", team_id: "t_1", github_login: null, email: "sam@example.com", avatar_url: "", ...me });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme-labs", status: "active", current: true }] });
    if (p === "/api/repos" && method === "GET") return json(route, { repos: REPOS });
    if (p.startsWith("/api/repos/")) return json(route, {});
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  return calls;
}

const nav = (page: Page) => page.getByRole("navigation").first();

test("a member-plus-repos custom role sees the repo settings controls and can use them", async ({ page }) => {
  const calls = await mockApi(page, { role: "member", capabilities: [...MEMBER, "repos"], custom_role: { id: "r1", name: "Repo keeper" } });
  await page.goto("/settings/repos");
  await expect(page.getByRole("heading", { name: "Repositories" })).toBeVisible();
  await expect(page.getByTestId("repos-read-only")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh from GitHub" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Role of acme/web" })).toBeVisible();
  const toggle = page.getByRole("switch", { name: "Let Coderhelm work on acme/api" });
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect.poll(() => calls.some((c) => c.path === "/api/repos/acme/api" && c.method !== "GET")).toBe(true);
  // What it doesn't hold stays hidden: admin-only pages aren't in the menu.
  await expect(nav(page).getByRole("link", { name: "Repos" })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "AI Models" })).toHaveCount(0);
  await expect(nav(page).getByRole("link", { name: "Data sources" })).toHaveCount(0);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.screenshot({ path: path.join(SHOTS_DIR, `capability-repos-custom-${width}.png`), fullPage: true });
  }
});

test("a custom role without repos sees the repos read-only", async ({ page }) => {
  const calls = await mockApi(page, { role: "member", capabilities: MEMBER, custom_role: { id: "r2", name: "Planner" } });
  await page.goto("/settings/repos");
  await expect(page.getByTestId("repos-read-only")).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh from GitHub" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Role of acme/web" })).toHaveCount(0);
  await expect(page.getByText("Website", { exact: true })).toBeVisible();
  const toggle = page.getByRole("switch", { name: "Let Coderhelm work on acme/api" });
  await expect(toggle).toBeDisabled();
  expect(calls.some((c) => c.path.startsWith("/api/repos/"))).toBe(false);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.screenshot({ path: path.join(SHOTS_DIR, `capability-repos-readonly-${width}.png`), fullPage: true });
  }
});

test("a built-in member is unchanged: repos read-only, member pages open", async ({ page }) => {
  // No `capabilities` in the answer: an older gateway; the built-in role decides.
  await mockApi(page, { role: "member" });
  await page.goto("/settings/repos");
  await expect(page.getByTestId("repos-read-only")).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Repos" })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Health" })).toHaveCount(0);
});

test("viewers are unchanged: member pages stay closed and out of the menu", async ({ page }) => {
  for (const me of [{ role: "viewer" }, { role: "viewer", capabilities: BASELINE }]) {
    await mockApi(page, me);
    await page.goto("/settings/repos");
    await expect(page.getByText("This page needs a different role")).toBeVisible();
    await expect(page.getByText(/Only a team member can open this page/)).toBeVisible();
    await expect(nav(page).getByRole("link", { name: "Runs" })).toBeVisible();
    for (const name of ["Repos", "Reviewer", "Tests", "Logs", "Skills", "Integrations"]) {
      await expect(nav(page).getByRole("link", { name, exact: true })).toHaveCount(0);
    }
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});

test("an admin with the built-in role still sees every admin control", async ({ page }) => {
  await mockApi(page, { role: "admin" });
  await page.goto("/settings/repos");
  await expect(page.getByRole("button", { name: "Refresh from GitHub" })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "AI Models" })).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Health" })).toBeVisible();
});
