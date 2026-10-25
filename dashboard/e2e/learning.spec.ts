import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { learningFixture } from "./wide-data/learning";

// The Learning page: what Coderhelm learned from outcomes, the behavior it
// changed and why, and the admin controls (pin, turn off, turn back on).
// Every API call is answered here. Nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const REPO = "acme/web";
const REPO_2 = "acme/api";

interface Backend {
  role: string;
  canManage: boolean;
  empty: boolean;
  /** Status every write answers with (403 for a refusal). */
  writeStatus: number;
  reverted: Set<string>;
  pinned: string;
  weights: Record<string, number>;
  calls: { method: string; path: string; body: unknown }[];
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { role: "admin", canManage: true, empty: false, writeStatus: 200, reverted: new Set(), pinned: "", weights: {}, calls: [], ...init };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    const body = req.postData() ? JSON.parse(req.postData() as string) : null;
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: "a-person", email: "person@example.com", avatar_url: "", role: db.role });
    if (p === "/api/usage") return json(route, { month: "2026-01", tokens_in: 0, tokens_out: 0, total_runs: 0, total_tokens: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/learning" && method === "GET") {
      db.calls.push({ method, path: `${p}${url.search}`, body });
      const data = learningFixture({ repo: REPO, repo2: REPO_2, text: "Ask for a test of the retry path in the payments client.", file: "src/payments/client.ts", canManage: db.canManage, empty: db.empty, reverted: db.reverted, pinned: db.pinned, weights: db.weights });
      return json(route, { ...data, days: Number(url.searchParams.get("days") || 30), repo: url.searchParams.get("repo") || "" });
    }
    if (p.startsWith("/api/learning/")) {
      db.calls.push({ method, path: p, body });
      if (db.writeStatus !== 200) return json(route, {}, db.writeStatus);
      if (p === "/api/learning/pin") {
        db.pinned = body.arm ?? "";
        return json(route, { ok: true });
      }
      if (p === "/api/learning/revert") {
        const ids = body.id ? [body.id] : body.repo === REPO ? ["chg_style", "chg_tests"] : ["chg_naming"];
        ids.forEach((id: string) => db.reverted.add(id));
        return json(route, { reverted: ids.length });
      }
      if (p === "/api/learning/restore") {
        db.reverted.delete(body.id);
        return json(route, { ok: true });
      }
      if (p === "/api/learning/weights") {
        db.weights = body.weights;
        return json(route, { weights: learningFixture({ repo: REPO, repo2: REPO_2, text: "", file: "", canManage: true, weights: db.weights }).weights });
      }
    }
    return json(route, { error: "Not mocked" }, 404);
  });
  return db;
}

async function noSideways(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);
}

test("shows rewards, categories, changes with evidence, examples and variants", async ({ page }) => {
  await mockApi(page);
  await page.goto("/learning");
  await expect(page.getByRole("heading", { level: 1, name: "Learning" })).toBeVisible();
  await expect(page.getByTestId("tile-events")).toContainText("312");
  await expect(page.getByTestId("tile-reward")).toContainText("+0.31");
  await expect(page.getByTestId("reward-chart")).toBeVisible();
  // By repository, then the table view of the same numbers.
  await page.getByRole("button", { name: "By repository" }).click();
  await page.getByRole("button", { name: "Show table: Average reward per day" }).click();
  await expect(page.getByRole("table", { name: "Average reward per day" })).toContainText(REPO);

  const dismissed = page.getByRole("table", { name: "Most dismissed categories" });
  await expect(dismissed).toContainText("style");
  await expect(dismissed).toContainText("Held back");
  // Security is dismissed often but marked as always kept, never held back.
  const security = dismissed.getByRole("row").filter({ hasText: "security" });
  await expect(security).toContainText("Always kept");
  await expect(security).toContainText("No change");
  await expect(page.getByRole("table", { name: "Most acted on categories" })).toContainText("Looked for more");

  const style = page.getByTestId("change-chg_style");
  await expect(style).toContainText("style: none");
  await expect(style).toContainText("Dismissed 9 of 14");
  await style.getByText("Evidence (3 outcomes)").click();
  await expect(style).toContainText("Review comment dismissed or argued");
  await expect(style).toContainText("PR #12345");

  await expect(page.locator("#exemplars")).toContainText("To follow");
  await expect(page.locator("#exemplars")).toContainText("Ask for a test of the retry path");
  await expect(page.getByTestId("bandit-reviewer")).toContainText("Gathering outcomes");
  await expect(page.getByRole("table", { name: "Signal weights" })).toContainText("Merged change reverted");
});

test("an admin pins and unpins a variant", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/learning");
  const card = page.getByTestId("bandit-reviewer");
  await card.getByRole("button", { name: "Pin Evidence first for Reviewer" }).click();
  await expect(page.getByText("Pinned Evidence first for Reviewer.")).toBeVisible();
  await expect(card).toContainText("Pinned to Evidence first");
  expect(db.calls.find((c) => c.path === "/api/learning/pin")?.body).toEqual({ agent: "reviewer", arm: "evidence_first" });
  await card.getByRole("button", { name: "Unpin" }).click();
  await expect(page.getByText("Reviewer chooses by results again.")).toBeVisible();
  await expect(card.getByRole("button", { name: "Unpin" })).toHaveCount(0);
  expect(db.calls.filter((c) => c.path === "/api/learning/pin").at(-1)?.body).toEqual({ agent: "reviewer", arm: null });
});

test("an admin turns a change off and back on", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/learning");
  const style = page.getByTestId("change-chg_style");
  await style.getByRole("button", { name: "Turn off" }).click();
  await expect(style).toContainText("Turned off by an-admin");
  expect(db.calls.find((c) => c.path === "/api/learning/revert")?.body).toEqual({ id: "chg_style" });
  await style.getByRole("button", { name: "Turn back on" }).click();
  await expect(style.getByRole("button", { name: "Turn off" })).toBeVisible();
  expect(db.calls.find((c) => c.path === "/api/learning/restore")?.body).toEqual({ id: "chg_style" });
});

test("turning off everything for a repository asks first", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/learning");
  await expect(page.getByRole("button", { name: "Turn off all for this repository" })).toHaveCount(0);
  await page.getByTestId("repo-filter").click();
  await page.getByTestId("combo-popover").getByRole("option", { name: REPO, exact: true }).first().click();
  await expect(page.getByText("Pick a repository above")).toHaveCount(0);
  await page.getByRole("button", { name: "Turn off all for this repository" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(`Turn off every change for ${REPO}?`);
  // Cancel sends nothing.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(db.calls.filter((c) => c.path === "/api/learning/revert")).toHaveLength(0);
  await page.getByRole("button", { name: "Turn off all for this repository" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Turn off all" }).click();
  await expect(page.getByText(`Turned off every change for ${REPO}.`)).toBeVisible();
  expect(db.calls.find((c) => c.path === "/api/learning/revert")?.body).toEqual({ repo: REPO });
  expect(db.calls.some((c) => c.path.includes(`repo=${encodeURIComponent(REPO)}`))).toBe(true);
  await expect(page.getByTestId("change-chg_tests")).toContainText("Turned off");
});

test("an admin changes a weight and goes back to the defaults", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/learning");
  const input = page.getByRole("spinbutton", { name: "Weight for Merged change reverted" });
  await input.fill("-3");
  await expect(page.getByTestId("weights-save-bar")).toContainText("1 unsaved change");
  await page.getByTestId("weights-save-bar").getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("weights-save-bar")).toHaveCount(0);
  expect((db.calls.find((c) => c.path === "/api/learning/weights")?.body as { weights: Record<string, number> }).weights.pr_reverted).toBe(-3);
  await input.fill("9");
  await expect(page.getByText("Each weight must be a number between −3 and 3.")).toBeVisible();
  await expect(page.getByTestId("weights-save-bar").getByRole("button", { name: "Save changes" })).toBeDisabled();
  await page.getByTestId("weights-save-bar").getByRole("button", { name: "Discard" }).click();
  await page.getByRole("button", { name: "Back to defaults" }).click();
  await expect.poll(() => (db.calls.filter((c) => c.path === "/api/learning/weights").at(-1)?.body as { weights: object }).weights).toEqual({});
});

test("a member sees everything but cannot change it, and is told why", async ({ page }) => {
  const db = await mockApi(page, { role: "member", canManage: false });
  await page.goto("/learning");
  await expect(page.getByText("You can see everything here")).toBeVisible();
  await expect(page.getByText(/Only an admin or the owner can pin a variant/)).toBeVisible();
  const off = page.getByTestId("change-chg_style").getByRole("button", { name: "Turn off" });
  await expect(off).toBeDisabled();
  await expect(off).toHaveAttribute("title", /Only an admin or the owner/);
  await expect(page.getByRole("button", { name: "Pin Evidence first for Reviewer" })).toBeDisabled();
  // Weights are shown, not editable.
  await expect(page.getByRole("spinbutton")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back to defaults" })).toHaveCount(0);
  await page.getByTestId("repo-filter").click();
  await page.getByTestId("combo-popover").getByRole("option", { name: REPO, exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Turn off all for this repository" })).toBeDisabled();
  expect(db.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
});

test("a custom role is gated by its capabilities, not its name", async ({ page }) => {
  // A custom role that holds "learning" may change things; an admin whose
  // capability list leaves it out may not, whatever the API's flag says.
  await mockApi(page, { role: "release-captain", canManage: true });
  await page.route("**/api/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user_id: "u_2", team_id: "t_1", github_login: "a-captain", email: "captain@example.com", avatar_url: "", role: "release-captain", capabilities: ["view", "view_team", "own_account", "learning"] }) }),
  );
  await page.goto("/learning");
  await expect(page.getByTestId("change-chg_style").getByRole("button", { name: "Turn off" })).toBeEnabled();
  await expect(page.getByText("You can see everything here")).toHaveCount(0);
});

test("an admin without the learning capability cannot change anything", async ({ page }) => {
  await mockApi(page, { role: "admin", canManage: true });
  await page.route("**/api/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user_id: "u_3", team_id: "t_1", github_login: "an-admin", email: "admin@example.com", avatar_url: "", role: "admin", capabilities: ["view", "view_team", "own_account", "repos"] }) }),
  );
  await page.goto("/learning");
  await expect(page.getByText("You can see everything here")).toBeVisible();
  await expect(page.getByTestId("change-chg_style").getByRole("button", { name: "Turn off" })).toBeDisabled();
});

test("a refused action is said in words and changes nothing", async ({ page }) => {
  await mockApi(page, { writeStatus: 403 });
  await page.goto("/learning");
  await page.getByTestId("change-chg_style").getByRole("button", { name: "Turn off" }).click();
  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toContainText("That was not changed");
  await expect(alert).toContainText("Only an admin or the owner can change what Coderhelm learned (error 403)");
  await expect(page.getByTestId("change-chg_style")).toContainText("In use");
});

test("with no outcomes yet it says what it needs", async ({ page }) => {
  await mockApi(page, { empty: true });
  await page.goto("/learning");
  await expect(page.getByText("Nothing learned yet")).toBeVisible();
  await expect(page.getByText(/needs 8 outcomes in a repository before anything changes/)).toBeVisible();
  await expect(page.getByText(/No changes yet/)).toBeVisible();
  await expect(page.getByTestId("reward-chart")).toHaveCount(0);
});

test("a failed load offers a retry", async ({ page }) => {
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  let fail = true;
  await mockApi(page);
  await page.route("**/api/learning?*", (route) =>
    fail ? route.fulfill({ status: 500, contentType: "application/json", body: "{}" }) : route.fallback(),
  );
  await page.goto("/learning");
  await expect(page.getByText("We couldn't load what Coderhelm learned")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("tile-events")).toBeVisible();
});

test("fits a phone without sideways scroll, and pictures at both widths", async ({ page }) => {
  await mockApi(page);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    await page.goto("/learning");
    await expect(page.getByTestId("tile-events")).toBeVisible();
    await page.getByTestId("change-chg_style").getByText("Evidence (3 outcomes)").click();
    await page.waitForTimeout(300);
    await noSideways(page);
    await page.screenshot({ path: path.join(SHOTS_DIR, `learning-${width > 500 ? "desktop" : "phone"}.png`), fullPage: true });
  }
});
