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

  // One table, sorted by most acted on or most dismissed.
  const categories = page.getByRole("table", { name: "Review comment categories" });
  await expect(categories).toContainText("Looked for more");
  await page.getByRole("group", { name: "Sort categories" }).getByRole("button", { name: "Most dismissed" }).click();
  const dismissed = categories;
  await expect(dismissed.locator("tbody tr").first()).toContainText(/style|security/);
  await expect(dismissed).toContainText("style");
  await expect(dismissed).toContainText("Held back");
  // Security is dismissed often but marked as always kept, never held back.
  const security = dismissed.getByRole("row").filter({ hasText: "security" });
  await expect(security).toContainText("Always kept");
  await expect(security).toContainText("No change");

  const style = page.getByTestId("change-chg_style");
  // A change reads as sentences, never as "key: from → to".
  await expect(style).toContainText("Style comments: only raised when it blocks the merge.");
  await expect(style).toContainText("Before: raised as usual.");
  await expect(style).toContainText("Dismissed 9 of 14");
  await style.getByText("Evidence (3 outcomes)").click();
  await expect(style).toContainText("Review comment dismissed or argued");
  await expect(style).toContainText("PR #12345");

  await expect(page.locator("#exemplars")).toContainText("To follow");
  await expect(page.getByTestId("example-ex1")).toContainText("Ask for a test of the retry path");
  await expect(page.getByTestId("bandit-reviewer")).toContainText("Gathering outcomes");
  // Scoring rules fold away under Advanced.
  await expect(page.getByRole("table", { name: "Signal weights" })).toBeHidden();
  await page.getByText("Advanced: scoring rules").click();
  await expect(page.getByRole("table", { name: "Signal weights" })).toContainText("Merged change reverted");
});

test("the category table sorts by most acted on or most dismissed", async ({ page }) => {
  await mockApi(page);
  await page.goto("/learning");
  const sort = page.getByRole("group", { name: "Sort categories" });
  const table = page.getByRole("table", { name: "Review comment categories" });
  await expect(sort.getByRole("button", { name: "Most acted on" })).toHaveAttribute("aria-pressed", "true");
  const firstActed = await table.locator("tbody tr").first().textContent();
  await sort.getByRole("button", { name: "Most dismissed" }).click();
  await expect(sort.getByRole("button", { name: "Most dismissed" })).toHaveAttribute("aria-pressed", "true");
  const firstDismissed = await table.locator("tbody tr").first().textContent();
  expect(firstDismissed).not.toEqual(firstActed);
  // Only one categories table: the two old ones repeated the same rows.
  await expect(page.getByRole("table", { name: /categories/ })).toHaveCount(1);
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
  // Undo asks first; red only inside the dialog.
  await style.getByRole("button", { name: "Undo this change" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Undo change" }).click();
  await expect(style).toContainText("Turned off by an-admin");
  expect(db.calls.find((c) => c.path === "/api/learning/revert")?.body).toEqual({ id: "chg_style" });
  await style.getByRole("button", { name: "Turn back on" }).click();
  await expect(style.getByRole("button", { name: "Undo this change" })).toBeVisible();
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
  await page.getByText("Advanced: scoring rules").click();
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
  const off = page.getByTestId("change-chg_style").getByRole("button", { name: "Undo this change" });
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
  await expect(page.getByTestId("change-chg_style").getByRole("button", { name: "Undo this change" })).toBeEnabled();
  await expect(page.getByText("You can see everything here")).toHaveCount(0);
});

test("an admin without the learning capability cannot change anything", async ({ page }) => {
  await mockApi(page, { role: "admin", canManage: true });
  await page.route("**/api/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user_id: "u_3", team_id: "t_1", github_login: "an-admin", email: "admin@example.com", avatar_url: "", role: "admin", capabilities: ["view", "view_team", "own_account", "repos"] }) }),
  );
  await page.goto("/learning");
  await expect(page.getByText("You can see everything here")).toBeVisible();
  await expect(page.getByTestId("change-chg_style").getByRole("button", { name: "Undo this change" })).toBeDisabled();
});

test("a refused action is said in words and changes nothing", async ({ page }) => {
  await mockApi(page, { writeStatus: 403 });
  await page.goto("/learning");
  await page.getByTestId("change-chg_style").getByRole("button", { name: "Undo this change" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Undo change" }).click();
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
  await expect(page.locator("#exemplars").getByText("No examples yet")).toBeVisible();
  await expect(page.getByRole("group", { name: "Show examples" })).toHaveCount(0);
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
  await expect(page.getByText("Couldn't load what Coderhelm learned")).toBeVisible();
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

// ── Examples in use ──────────────────────────────────────────────────────

test("examples are one compact row each, most used first, ten at a time", async ({ page }) => {
  await mockApi(page);
  await page.goto("/learning");
  const section = page.locator("#exemplars");
  const toggles = section.getByRole("group", { name: "Show examples" });
  await expect(toggles.getByRole("button", { name: /To follow/ })).toHaveAttribute("aria-pressed", "true");
  await expect(toggles.getByRole("button", { name: /To follow/ })).toContainText("13");
  await expect(toggles.getByRole("button", { name: /To avoid/ })).toContainText("2");

  const list = section.getByRole("list", { name: "Examples to follow" });
  const rows = list.getByRole("listitem");
  await expect(rows).toHaveCount(10);
  // Most used first: 6 uses, then 4, then the rest by reward.
  await expect(rows.nth(0)).toHaveAttribute("data-testid", "example-ex2");
  await expect(rows.nth(1)).toHaveAttribute("data-testid", "example-ex1");
  await expect(rows.nth(2)).toContainText("step 11");

  // A row: title, reason, kind and path tags, repo with the PR link, reward and uses.
  const ex2 = page.getByTestId("example-ex2");
  await expect(ex2).toContainText("Retry the import once with the same key");
  await expect(ex2.getByTestId("example-reason")).toHaveText("CI passed on the first try, merged without changes");
  await expect(ex2).toContainText("Code change");
  await expect(ex2).toContainText("services/payments");
  await expect(ex2.getByRole("link", { name: /#12340/ })).toHaveAttribute("href", `https://github.com/${REPO_2}/pull/12340`);
  await expect(ex2).toContainText("+1.50");
  await expect(ex2).toContainText("6×");
  // The summary waits for the panel: no long text in the list.
  await expect(ex2).not.toContainText("idempotency key");
  await expect(section).toContainText("Showing 10 of 13, most used first");

  await section.getByRole("button", { name: "Show 3 more" }).click();
  await expect(rows).toHaveCount(13);
  await expect(section.getByRole("button", { name: /Show \d+ more/ })).toHaveCount(0);
  await noSideways(page);
});

test("examples to avoid read clean, even ones kept with GitHub markup", async ({ page }) => {
  await mockApi(page);
  await page.goto("/learning");
  const section = page.locator("#exemplars");
  await section.getByRole("group", { name: "Show examples" }).getByRole("button", { name: /To avoid/ }).click();
  const list = section.getByRole("list", { name: "Examples to avoid" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  const legacy = page.getByTestId("example-ex_legacy");
  await expect(legacy.getByRole("button")).toHaveText("fix(checkout): cache the cart");
  await expect(legacy.getByTestId("example-reason")).toHaveText("Closed, rewritten or reverted");
  for (const raw of ["<!--", "Source ticket", "[!WARNING]", "**", "##"]) await expect(section).not.toContainText(raw);
  await legacy.getByRole("button").click();
  const panel = page.getByTestId("example-panel");
  await expect(panel.getByTestId("example-summary")).toContainText("Cache the cart for five minutes.");
  for (const raw of ["<!--", "Source ticket", "[!WARNING]", "**"]) await expect(panel).not.toContainText(raw);
});

test("search, repository and kind narrow the examples and can be cleared", async ({ page }) => {
  await mockApi(page);
  await page.goto("/learning");
  const section = page.locator("#exemplars");
  const toggles = section.getByRole("group", { name: "Show examples" });
  await section.getByRole("searchbox", { name: "Search examples" }).fill("idempotency");
  await expect(section.getByRole("list", { name: "Examples to follow" }).getByRole("listitem")).toHaveCount(2);
  await expect(toggles.getByRole("button", { name: /To avoid/ })).toContainText("0");

  await section.getByRole("button", { name: "Clear filters" }).first().click();
  await section.getByLabel("Filter examples by kind").selectOption("fix");
  const rows = section.getByRole("list", { name: "Examples to follow" }).getByRole("listitem");
  await expect(rows).toHaveCount(5);
  for (const t of await rows.allTextContents()) expect(t).toContain("Code change");

  await section.getByLabel("Filter examples by repository").selectOption(REPO);
  await expect(rows).toHaveCount(2);
  await section.getByRole("searchbox", { name: "Search examples" }).fill("nothing like this");
  await expect(section.getByTestId("list-empty")).toContainText("No examples match");
  await section.getByTestId("list-empty").getByRole("button", { name: "Clear filters" }).click();
  await expect(rows).toHaveCount(10);
});

test("a row opens the whole example beside the list", async ({ page }) => {
  await mockApi(page);
  await page.goto("/learning");
  await page.getByTestId("example-ex1").getByRole("button").click();
  const panel = page.getByTestId("example-panel");
  await expect(panel.getByRole("heading", { name: "Ask for a test of the retry path in the payments client." })).toBeVisible();
  await expect(panel).toContainText("The author changed the code it pointed at");
  // Markdown is drawn, not shown as marks.
  await expect(panel.getByTestId("example-summary").locator("strong")).toHaveText("no test");
  await expect(panel.getByTestId("example-summary").locator("li")).toHaveCount(2);
  await expect(panel.getByRole("link", { name: /#12345 on GitHub/ })).toHaveAttribute("href", `https://github.com/${REPO}/pull/12345`);
  await expect(panel).toContainText("from 2 outcomes");
  await expect(panel).toContainText("Used 4 times");
  const uses = panel.getByTestId("example-uses").getByRole("listitem");
  await expect(uses).toHaveCount(2);
  // Latest first.
  await expect(uses.first()).toContainText("Review of #12361");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  // Focus goes back to the row that opened it.
  await expect(page.getByTestId("example-ex1").getByRole("button")).toBeFocused();

  // A code change links its run and the runs that used it.
  await page.getByTestId("example-ex2").getByRole("button").click();
  await expect(panel.getByRole("link", { name: "The run that wrote it" })).toHaveAttribute("href", /^\/runs\/detail\/?\?id=01JRUNEXAMPLE0000000000042$/);
  await expect(panel.getByRole("link", { name: /Coding run/ })).toHaveAttribute("href", /^\/runs\/detail\/?\?id=01JRUNUSEDBY00000000000007$/);
  await expect(panel.locator("pre")).toContainText("await importOnce(key);");
});

test("examples at 1440 and 390, list and panel", async ({ page }) => {
  await mockApi(page);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  for (const width of [1440, 390]) {
    const name = width > 500 ? "desktop" : "phone";
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    await page.goto("/learning");
    const section = page.locator("#exemplars");
    await expect(page.getByTestId("example-ex2")).toBeVisible();
    await noSideways(page);
    // Tall enough that the section needs no scrolling, so the sticky top bar stays out of the picture.
    await page.setViewportSize({ width, height: 6000 });
    await section.screenshot({ path: path.join(SHOTS_DIR, `learning-examples-${name}.png`) });
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    await page.getByTestId("example-ex1").getByRole("button").click();
    const panel = page.getByTestId("example-panel");
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    // A side panel on a wide screen, the whole screen on a phone.
    if (width > 500) expect(box!.width).toBeLessThanOrEqual(width / 2);
    else expect(Math.round(box!.width)).toBe(width);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOTS_DIR, `learning-example-panel-${name}.png`) });
    await page.keyboard.press("Escape");
  }
});

test("examples show a skeleton while another repository loads", async ({ page }) => {
  await mockApi(page);
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.goto("/learning");
  await expect(page.getByTestId("example-ex2")).toBeVisible();
  await page.route("**/api/learning?*", async (route) => {
    if (route.request().url().includes("repo=")) await held;
    await route.fallback();
  });
  await page.getByTestId("repo-filter").click();
  await page.getByTestId("combo-popover").getByRole("option", { name: REPO, exact: true }).first().click();
  await expect(page.locator("#exemplars").getByTestId("list-skeleton")).toBeVisible();
  release();
  await expect(page.locator("#exemplars").getByTestId("list-skeleton")).toHaveCount(0);
});
