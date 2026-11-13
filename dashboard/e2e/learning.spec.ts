import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { learningFixture, learningHealthFixture, outcomeLessonsFixture, reviewerAsksFixture, scorecardFixture } from "./wide-data/learning";
import { pickOption } from "./select";

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
  /** The health check's answer, or its error status; left out, a gateway without it (404). */
  health?: unknown;
  /** The scorecard, lessons and reviewer asks: "full", "empty", an error status, or left out for a gateway without them (404). */
  outcomes?: "full" | "empty" | number;
  /** Reviewers and asks forgotten so far. */
  forgotten: Set<string>;
  /** The guide pull request setting as saved (on unless turned off). */
  guide: { enabled: boolean; repos: Record<string, boolean> };
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { role: "admin", canManage: true, empty: false, writeStatus: 200, reverted: new Set(), pinned: "", weights: {}, calls: [], forgotten: new Set(), guide: { enabled: true, repos: {} }, ...init };
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
    if (p === "/api/learning/health" && method === "GET") {
      db.calls.push({ method, path: p, body });
      if (db.health === undefined) return json(route, { error: "Not found" }, 404);
      if (typeof db.health === "number") return json(route, { error: "Internal error" }, db.health);
      return json(route, db.health);
    }
    if (p === "/api/settings/guide-prs") {
      db.calls.push({ method, path: p, body });
      if (db.outcomes === undefined) return json(route, { error: "Not found" }, 404);
      if (method === "PUT") {
        if (db.writeStatus !== 200) return json(route, { error: "Only admins can change this." }, db.writeStatus);
        db.guide = { enabled: body.enabled, repos: body.repos };
      }
      return json(route, { ...db.guide, can_manage: db.canManage });
    }
    if (["/api/learning/scorecard", "/api/learning/lessons", "/api/learning/reviewers"].includes(p) && method === "GET") {
      db.calls.push({ method, path: `${p}${url.search}`, body });
      if (db.outcomes === undefined) return json(route, { error: "Not found" }, 404);
      if (typeof db.outcomes === "number") return json(route, { error: "Internal error" }, db.outcomes);
      const empty = db.outcomes === "empty";
      const only = url.searchParams.get("repo") || undefined;
      if (p === "/api/learning/scorecard") return json(route, scorecardFixture({ repo: REPO, repo2: REPO_2, months: Number(url.searchParams.get("months") ?? 3), only, empty }));
      if (p === "/api/learning/lessons") return json(route, outcomeLessonsFixture({ repo: only ?? REPO, text: "", file: "apps/web/src", empty }));
      return json(route, reviewerAsksFixture({ repo: REPO, text: "", canManage: db.canManage, forgotten: db.forgotten, empty }));
    }
    if (p.startsWith("/api/learning/")) {
      db.calls.push({ method, path: p, body });
      if (db.writeStatus !== 200) return json(route, {}, db.writeStatus);
      if (p === "/api/learning/reviewers/forget") {
        db.forgotten.add(body.id ?? body.login);
        return json(route, { forgotten: 1 });
      }
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
  await pickOption(section.getByLabel("Filter examples by kind"), "fix");
  const rows = section.getByRole("list", { name: "Examples to follow" }).getByRole("listitem");
  await expect(rows).toHaveCount(5);
  for (const t of await rows.allTextContents()) expect(t).toContain("Code change");

  await pickOption(section.getByLabel("Filter examples by repository"), REPO);
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

// ── Learning health: is each loop still learning? ─────────────────────────

test("a quiet loop turns the health check red and says what to check", async ({ page }) => {
  await mockApi(page, { health: learningHealthFixture({ repo: REPO, text: "", quiet: ["pr_outcomes"], idle: ["coder_lessons", "stop_outcomes"] }) });
  await page.goto("/learning");
  const health = page.getByTestId("learning-health");
  await expect(health).toHaveAttribute("data-state", "red");
  await expect(health.getByText("1 loop stopped learning")).toBeVisible();

  // The red loop comes first, in plain words: what it learns from, when it last learned, what to check.
  const red = page.getByTestId("loop-pr_outcomes");
  await expect(health.locator("li[data-state]").first()).toHaveAttribute("data-testid", "loop-pr_outcomes");
  await expect(red).toHaveAttribute("data-state", "quiet");
  await expect(red).toContainText("Not learning");
  await expect(red).toContainText("Learns from: Whether Coderhelm's pull requests were merged as written");
  await expect(red).toContainText(/Last learned: .*ago/);
  await expect(red).toContainText("3 of 5 this week");
  await expect(red).toContainText(`2 closed pull request(s) were never scored: ${REPO}#12345`);
  await expect(page.getByTestId("loop-pr_outcomes-check")).toContainText("What to check: Pull requests closed this week were never scored.");

  // An idle loop had nothing to learn from: no red, never learned.
  const idle = page.getByTestId("loop-coder_lessons");
  await expect(idle).toHaveAttribute("data-state", "idle");
  await expect(idle).toContainText("Nothing to learn from yet");
  await expect(idle).toContainText("Last learned: never");
  await expect(idle).toContainText("0 this week");
  await expect(idle).toContainText("Learns from: Repeated setbacks in one area of the code");
  await expect(page.getByTestId("loop-coder_lessons-check")).toHaveCount(0);

  // Titles are the dashboard's own words, never the API's names.
  await expect(red.getByRole("heading")).toHaveText("What happens to Coderhelm's pull requests");
  await expect(health.getByText("Outcomes of CoderHelm's pull requests")).toHaveCount(0);
  await expect(health.getByText(/CoderHelm/)).toHaveCount(0);
  await expect(page.getByTestId("loop-review_outcomes")).toContainText("4 of 6 this week");
  await expect(page.getByTestId("loop-review_outcomes").getByRole("heading")).toHaveText("What people do with review comments");

  // A working loop with no expected count shows its count alone.
  const ok = page.getByTestId("loop-calibration");
  await expect(ok).toContainText("Learning");
  await expect(ok).toContainText("4 this week");
  await expect(health.locator("li[data-state]")).toHaveCount(9);
  await noSideways(page);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.locator("#health").screenshot({ path: path.join(SHOTS_DIR, "learning-health-desktop.png") });
});

test("every loop learning reads as fine, with no red", async ({ page }) => {
  await mockApi(page, { health: learningHealthFixture({ repo: REPO, text: "", quiet: [], idle: ["stop_outcomes"] }) });
  await page.goto("/learning");
  const health = page.getByTestId("learning-health");
  await expect(health).toHaveAttribute("data-state", "ok");
  await expect(health).toContainText("Every loop that had something to learn from learned from it.");
  await expect(health.getByText(/stopped learning/)).toHaveCount(0);
  await expect(page.getByTestId("loop-stop_outcomes")).toContainText("Nothing to learn from yet");
  await expect(health.getByText("What to check:")).toHaveCount(0);
});

test("a health check that fails says so and retries, and the rest of the page still loads", async ({ page }) => {
  const db = await mockApi(page, { health: 500 });
  await page.goto("/learning");
  await expect(page.getByText("Couldn't check the learning loops")).toBeVisible();
  await expect(page.getByTestId("tile-events")).toBeVisible();
  db.health = learningHealthFixture({ repo: REPO, text: "" });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("learning-health")).toHaveAttribute("data-state", "red");
});

test("a gateway without the health check shows no health section", async ({ page }) => {
  await mockApi(page);
  await page.goto("/learning");
  await expect(page.getByTestId("tile-events")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Is it still learning?" })).toHaveCount(0);
});

test("the health check fits a phone at 375 wide", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await mockApi(page, { health: learningHealthFixture({ repo: "your-team/payments-reconciliation-ledger-service", text: "packages/payments-reconciliation-ledger/src/adapters/stripe/webhooks/handlers/charge-refunded-partially.ts" }) });
  await page.goto("/learning");
  await expect(page.getByTestId("loop-pr_outcomes-check")).toBeVisible();
  await noSideways(page);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.locator("#health").screenshot({ path: path.join(SHOTS_DIR, "learning-health-phone.png") });
});

test("a loop this dashboard has no title for reads as its id in words", async ({ page }) => {
  await mockApi(page, { health: learningHealthFixture({ repo: REPO, text: "", quiet: [], extra: true }) });
  await page.goto("/learning");
  const extra = page.getByTestId("loop-planner_lessons");
  await expect(extra.getByRole("heading")).toHaveText("Planner lessons");
  await expect(page.getByText("Planner lessons (API name)")).toHaveCount(0);
  await expect(extra).toContainText("1 of 2 this week");
});

// ── The scorecard, lessons from pull requests, and what reviewers ask for ──

test("the scorecard says what became of Coderhelm's pull requests, for the team and each repository", async ({ page }) => {
  const db = await mockApi(page, { outcomes: "full" });
  await page.goto("/learning");
  const card = page.getByTestId("scorecard");
  await expect(card).toBeVisible();
  await expect(page.getByTestId("score-opened")).toContainText("24");
  await expect(page.getByTestId("score-opened")).toContainText("4 still open");
  await expect(page.getByTestId("score-merged")).toContainText("16");
  await expect(page.getByTestId("score-merged")).toContainText("80% of the 20 that finished");
  await expect(page.getByTestId("score-closed")).toContainText("4");
  await expect(page.getByTestId("score-reverted")).toContainText("2");
  await expect(page.getByTestId("score-edited")).toContainText("25% of merged; 12 merged as written");
  await expect(page.getByTestId("score-open-items")).toContainText("3");
  await expect(page.getByTestId("score-rounds")).toContainText("0.6");
  await expect(page.getByTestId("score-rounds")).toContainText("11 of 16 passed with no changes asked");
  await expect(page.getByTestId("score-time")).toContainText("9.5 h");
  await expect(page.getByTestId("score-time")).toContainText("Half merged within 8 h");
  await expect(page.locator("#scorecard")).toContainText("Counting began in January 2026");
  // Each repository, and a rate with nothing behind it is said so, never a zero.
  const repos = page.getByRole("table", { name: "Scorecard by repository" });
  await expect(repos.getByRole("row").filter({ hasText: REPO })).toContainText("12 (80%)");
  await expect(repos.getByRole("row").filter({ hasText: REPO_2 })).toContainText("No data yet");
  // Another period asks the gateway again.
  await page.getByRole("group", { name: "Scorecard period" }).getByRole("button", { name: "All time" }).click();
  await expect.poll(() => db.calls.some((c) => c.path === "/api/learning/scorecard?months=0")).toBe(true);
  // The page's repository filter narrows it, and the per-repository table goes.
  await page.getByTestId("repo-filter").click();
  await page.getByTestId("combo-popover").getByRole("option", { name: REPO, exact: true }).first().click();
  await expect.poll(() => db.calls.some((c) => c.path.startsWith("/api/learning/scorecard") && c.path.includes(`repo=${encodeURIComponent(REPO)}`))).toBe(true);
  await expect(page.getByTestId("score-opened")).toContainText("18");
  await expect(page.getByRole("table", { name: "Scorecard by repository" })).toHaveCount(0);
});

test("lessons say how they are checked, show their evidence, and name the guide pull request", async ({ page }) => {
  await mockApi(page, { outcomes: "full" });
  await page.goto("/learning");
  const ready = page.getByTestId("lesson-les_ready");
  await expect(ready).toContainText("Build image addresses with the shared `imageUrl` helper");
  await expect(ready).toContainText("How it is checked: Search the diff under apps/web/src");
  await expect(ready).toContainText("seen on 2 pull requests (#12345, #12399)");
  await expect(ready).toContainText("In use");
  await expect(ready).toContainText("Seen often enough to be proposed for the guide file.");
  await ready.getByText("Evidence (3 lines): people edited the pull request before merging").click();
  await expect(ready).toContainText('PR #12345 in people\'s words: "Use the shared image builder"');
  await expect(ready).toContainText("+  const src = imageUrl(p.image)");
  await expect(page.getByTestId("lesson-les_guide")).toContainText("In the guide file");
  const against = page.getByTestId("lesson-les_against");
  await expect(against).toContainText("Contradicted");
  await expect(against).toContainText("contradicted 2 times");
  await expect(against).toContainText("The team declined it for the guide file.");
  // A lesson that only records what happened has no check and no evidence list.
  await expect(page.getByTestId("lesson-les_area")).not.toContainText("How it is checked");
  const guide = page.getByTestId("guide-prs");
  await expect(guide).toContainText("proposes 1 lesson for AGENTS.md");
  await expect(guide).toContainText("Waiting for review");
  await expect(guide.getByRole("link", { name: `${REPO} #12400` })).toHaveAttribute("href", `https://github.com/${REPO}/pull/12400`);
});

test("an admin forgets one ask, then everything kept about a reviewer", async ({ page }) => {
  const db = await mockApi(page, { outcomes: "full" });
  await page.goto("/learning");
  const reviewer = page.getByTestId("reviewer-a-reviewer");
  await expect(reviewer.getByTestId("ask-ask_tests")).toContainText("Add a test for the empty state of every new block.");
  await expect(reviewer.getByTestId("ask-ask_tests")).toContainText("Tests · on 3 pull requests");
  await expect(reviewer.getByTestId("ask-ask_tests")).toContainText("In use");
  await expect(reviewer.getByTestId("ask-ask_errors")).toContainText("Error handling · on 1 pull request");
  await expect(reviewer.getByTestId("ask-ask_errors")).toContainText("Seen once");
  await expect(page.locator("#reviewers")).toContainText("nothing about the person");

  await reviewer.getByRole("button", { name: /Forget this ask of a-reviewer: Return typed errors/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Forget" }).click();
  await expect(page.getByTestId("ask-ask_errors")).toHaveCount(0);
  expect(db.calls.find((c) => c.path === "/api/learning/reviewers/forget")?.body).toEqual({ login: "a-reviewer", id: "ask_errors" });

  await reviewer.getByRole("button", { name: "Forget a-reviewer" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Every ask kept for a-reviewer is removed");
  await page.getByRole("alertdialog").getByRole("button", { name: "Forget" }).click();
  await expect(page.getByTestId("reviewer-a-reviewer")).toHaveCount(0);
  await expect(page.getByTestId("reviewer-another-reviewer")).toBeVisible();
  expect(db.calls.filter((c) => c.path === "/api/learning/reviewers/forget").at(-1)?.body).toEqual({ login: "a-reviewer" });
});

test("a member sees what reviewers ask for and cannot forget it", async ({ page }) => {
  const db = await mockApi(page, { role: "member", canManage: false, outcomes: "full" });
  await page.goto("/learning");
  await expect(page.getByTestId("reviewer-a-reviewer")).toContainText("Add a test for the empty state");
  await expect(page.locator("#reviewers").getByRole("button", { name: /Forget/ })).toHaveCount(0);
  expect(db.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
});

test("a refused forget is said in words and nothing goes", async ({ page }) => {
  await mockApi(page, { outcomes: "full", writeStatus: 403 });
  await page.goto("/learning");
  await page.getByTestId("reviewer-a-reviewer").getByRole("button", { name: "Forget a-reviewer" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Forget" }).click();
  await expect(page.locator("#reviewers").getByRole("alert")).toContainText("Only an admin or the owner can forget what was learned (error 403)");
  await expect(page.getByTestId("reviewer-a-reviewer")).toBeVisible();
});

test("before anything is counted or learned, each section says what fills it", async ({ page }) => {
  await mockApi(page, { outcomes: "empty" });
  await page.goto("/learning");
  await expect(page.getByTestId("scorecard-empty")).toContainText("The scorecard fills in as pull requests open, merge and close from now on.");
  await expect(page.getByTestId("lessons-empty")).toContainText("No lessons yet");
  await expect(page.getByTestId("reviewers-empty")).toContainText("Nothing kept yet");
  await expect(page.getByTestId("guide-prs")).toHaveCount(0);
});

test("a gateway without the scorecard shows none of the three sections, and one that fails says so", async ({ page }) => {
  await mockApi(page);
  await page.goto("/learning");
  await expect(page.getByTestId("tile-events")).toBeVisible();
  for (const name of ["Pull request scorecard", "Lessons from pull requests", "What reviewers ask for"]) {
    await expect(page.getByRole("heading", { name })).toHaveCount(0);
  }
  await mockApi(page, { outcomes: 500 });
  await page.goto("/learning");
  await expect(page.getByText("Couldn't load the scorecard")).toBeVisible();
  await expect(page.getByText("Couldn't load the lessons")).toBeVisible();
  await expect(page.getByText("Couldn't load what reviewers ask for")).toBeVisible();
  // The rest of the page still loads.
  await expect(page.getByTestId("tile-events")).toBeVisible();
});

test("the scorecard, lessons and reviewer asks fit a phone at 375 wide", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await mockApi(page, { outcomes: "full" });
  await page.goto("/learning");
  await expect(page.getByTestId("scorecard")).toBeVisible();
  await page.getByTestId("lesson-les_ready").getByText(/Evidence \(3 lines\)/).click();
  await expect(page.getByTestId("reviewer-a-reviewer")).toBeVisible();
  await noSideways(page);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  for (const id of ["scorecard", "lessons", "reviewers"]) {
    await page.locator(`#${id}`).screenshot({ path: path.join(SHOTS_DIR, `learning-${id}-phone.png`) });
  }
});

// ── The switch for guide pull requests ─────────────────────────────────────

const guideSaves = (db: Backend) => db.calls.filter((c) => c.path === "/api/settings/guide-prs" && c.method === "PUT").map((c) => c.body);

test("an admin turns guide pull requests off for the team, then on for one repository", async ({ page }) => {
  const db = await mockApi(page, { outcomes: "full" });
  await page.goto("/learning");
  const team = page.getByTestId("guide-setting-team");
  const toggle = page.getByRole("switch", { name: "Open guide pull requests" });
  // On unless a team turns it off.
  await expect(toggle).toBeChecked();
  await expect(team).toContainText("its lessons still go to every run");
  await expect(page.getByTestId("guide-setting-apart")).toContainText("Every repository follows this.");
  await expect(team).not.toContainText("Not default");

  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(team).toContainText("Not default");
  expect(guideSaves(db).at(-1)).toEqual({ enabled: false, repos: {} });

  // One repository set apart: picked in the page's filter.
  await page.getByTestId("repo-filter").click();
  await page.getByTestId("combo-popover").getByRole("option", { name: REPO, exact: true }).first().click();
  const row = page.getByTestId("guide-setting-repo");
  await expect(row).toContainText(`In ${REPO}`);
  await expect(row).toContainText("Follows the team's setting: off.");
  const choices = page.getByRole("group", { name: `Guide pull requests in ${REPO}` });
  await choices.getByRole("button", { name: "On", exact: true }).click();
  await expect(row).toContainText("guide pull requests are opened here");
  await expect(choices.getByRole("button", { name: "On", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(guideSaves(db).at(-1)).toEqual({ enabled: false, repos: { [REPO]: true } });
  // Back to the team's setting removes the override.
  await choices.getByRole("button", { name: "Follow the team" }).click();
  await expect(row).toContainText("Follows the team's setting: off.");
  expect(guideSaves(db).at(-1)).toEqual({ enabled: false, repos: {} });
});

test("repositories set apart are named, and the setting survives a reload", async ({ page }) => {
  await mockApi(page, { outcomes: "full", guide: { enabled: true, repos: { [REPO_2]: false } } });
  await page.goto("/learning");
  await expect(page.getByRole("switch", { name: "Open guide pull requests" })).toBeChecked();
  await expect(page.getByTestId("guide-setting-apart")).toContainText(`Set apart from the team: ${REPO_2} (off).`);
});

test("a member sees how guide pull requests are set and cannot change it", async ({ page }) => {
  const db = await mockApi(page, { role: "member", canManage: false, outcomes: "full" });
  await page.goto("/learning");
  const toggle = page.getByRole("switch", { name: "Open guide pull requests" });
  await expect(toggle).toBeChecked();
  await expect(toggle).toBeDisabled();
  await expect(page.getByTestId("guide-setting-team")).toContainText("Only an admin or the owner can change this.");
  await page.getByTestId("repo-filter").click();
  await page.getByTestId("combo-popover").getByRole("option", { name: REPO, exact: true }).first().click();
  await expect(page.getByRole("group", { name: `Guide pull requests in ${REPO}` }).getByRole("button", { name: "Off", exact: true })).toBeDisabled();
  expect(guideSaves(db)).toHaveLength(0);
});

test("a refused save of the guide setting is said in words and the switch stays", async ({ page }) => {
  const db = await mockApi(page, { outcomes: "full", writeStatus: 403 });
  await page.goto("/learning");
  const toggle = page.getByRole("switch", { name: "Open guide pull requests" });
  await toggle.click();
  await expect(page.getByTestId("guide-setting").getByRole("alert")).toContainText("Only an admin or the owner can change it (error 403)");
  await expect(toggle).toBeChecked();
  expect(db.guide.enabled).toBe(true);
});

test("a gateway without the guide setting shows no switch, and the switch fits a phone", async ({ page }) => {
  await mockApi(page, { outcomes: "full" });
  await page.route("**/api/settings/guide-prs", (route) => route.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
  await page.goto("/learning");
  await expect(page.getByTestId("lesson-les_ready")).toBeVisible();
  await expect(page.getByTestId("guide-setting")).toHaveCount(0);

  // The repository is picked at desktop width (the filter is the page's own,
  // tested elsewhere), then the rows are looked at on a phone.
  await page.unroute("**/api/settings/guide-prs");
  await page.goto("/learning");
  await page.getByTestId("repo-filter").click();
  await page.getByTestId("combo-popover").getByRole("option", { name: REPO, exact: true }).first().click();
  await expect(page.getByTestId("guide-setting-repo")).toBeVisible();
  await page.setViewportSize({ width: 375, height: 844 });
  await expect(page.getByTestId("guide-setting-repo")).toBeVisible();
  await noSideways(page);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.getByTestId("guide-setting").screenshot({ path: path.join(SHOTS_DIR, "learning-guide-setting-phone.png") });
});
