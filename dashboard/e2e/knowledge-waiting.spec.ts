import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { mockKnowledge, newBackend } from "./knowledge-page-data";

// A sync the app rate limited: documents refused for a passing reason show
// "Waiting to retry" with their next try, apart from what couldn't be read;
// the content and the sync history sum them up by reason ("162 rate limited
// by Sanity, retrying") instead of a row per identical error; and "Read
// these again" still works on them. Drawn at 1280 and 390.

const SHOTS = process.env.KB_SHOTS_DIR || path.join("test-results", "kb-shots");

async function noSideways(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(wide, "nothing scrolls sideways").toBeLessThanOrEqual(1);
}

async function shot(page: Page, name: string, target?: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(150);
  if (target) await page.getByTestId(target).screenshot({ path: path.join(SHOTS, `${name}.png`) });
  else await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

for (const width of [1280, 390]) {
  test(`waiting to retry, grouped by reason, at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 600 ? 900 : 844 });
    const db = newBackend("waiting");
    await mockKnowledge(page, db);
    await page.goto("/knowledge/base/?id=kb_dw");
    await expect(page.getByRole("heading", { level: 1, name: "Data warehouse docs" })).toBeVisible();

    // The problems banner counts only what couldn't be read; the tile says what waits.
    await expect(page.getByTestId("problems")).toContainText("2 pages couldn't be read");
    await expect(page.getByTestId("tile-waiting")).toHaveText("163 waiting to retry");
    await expect(page.getByTestId("tile-failed")).toHaveText("2 couldn't read");

    // Content: one line per reason, never 162 identical rows.
    const reasons = page.getByTestId("reasons");
    await expect(reasons.getByTestId("reason")).toHaveCount(3);
    const limited = reasons.locator('[data-reason="rate_limited"]');
    await expect(limited).toContainText("162");
    await expect(limited).toContainText("rate limited by Sanity, retrying");
    await expect(limited).toContainText("next try");
    await expect(reasons.locator('[data-reason="forbidden"]')).toContainText("not visible to the Sanity connection");
    await expect(page.getByTestId("filter-waiting")).toContainText("163");
    await expect(page.getByTestId("filter-failed")).toContainText("2");
    await noSideways(page);
    await shot(page, `waiting-content-${width}`, "content");

    // Showing them filters to waiting items, each saying when it is tried again.
    await limited.getByTestId("reason-show").click();
    await expect(page.getByTestId("filter-waiting")).toHaveAttribute("aria-pressed", "true");
    const row = page.getByTestId("item-row").first();
    await expect(row).toHaveAttribute("data-state", "waiting");
    await expect(row.getByText("Waiting to retry", { exact: true })).toBeVisible();
    await expect(row.getByTestId("item-retry")).toContainText(/Rate limited by Sanity, retrying · next try \d/);

    // "Read these again" still works for waiting items.
    await row.getByTestId("item-pick").check();
    await page.getByTestId("retry-picked").click();
    await expect.poll(() => db.calls.some((c) => c === "POST /api/knowledge/kb_dw/sources/src_sanity/retry")).toBe(true);
    await noSideways(page);
    await shot(page, `waiting-items-${width}`, "content");

    // The source's connection says how many wait and when.
    await page.getByTestId("source-card").first().getByTestId("connection-toggle").click();
    await expect(page.getByTestId("conn-waiting")).toContainText("163 documents");
    await expect(page.getByTestId("conn-waiting")).toContainText("read again on their own, next try");

    // Sync history: grouped by reason with counts, a few examples each.
    const history = page.getByTestId("history");
    await history.getByTestId("history-open").first().click();
    const groups = history.getByTestId("history-group");
    await expect(groups).toHaveCount(3);
    await expect(groups.first()).toContainText("162 rate limited by Sanity, retrying");
    await expect(groups.first()).toContainText("Waiting to retry");
    await expect(groups.first().getByTestId("history-problem")).toHaveCount(3);
    await expect(groups.first()).toContainText("And 159 more");
    await expect(history.getByTestId("history-row").first()).toContainText("163 waiting to retry");
    await noSideways(page);
    await shot(page, `waiting-history-${width}`, "history");
    await shot(page, `waiting-page-${width}`);
  });
}
