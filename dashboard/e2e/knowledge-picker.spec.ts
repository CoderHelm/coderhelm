import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { mockPicker } from "./source-picker-data";

// The Knowledge source picker, shared by every app: rows with the app's own
// icon and a line of what each is, a tree that opens one level at a time
// (with a spinner, and a retry when opening fails), tri-state ticks,
// search results that say where each one is, the selection beside the tree
// (a sheet on a phone), what to do when nothing is shared, and the keyboard.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

async function shot(page: Page, name: string, widths = [1440, 390]) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(SHOTS_DIR, `picker-${name}-${width}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

async function openNotion(page: Page) {
  await page.goto("/knowledge/");
  await page.getByTestId("start-notion").click();
  await expect(page.getByTestId("picker-tree").getByTestId("picker-row").first()).toBeVisible();
}

const row = (page: Page, id: string) => page.getByTestId("picker-tree").locator(`[data-testid="picker-row"][data-id="${id}"]`);

test.describe("the source picker", () => {
  test("rows show the app's icon, what each is, and how much is inside", async ({ page }) => {
    await mockPicker(page);
    await openNotion(page);
    const eng = row(page, "page:eng");
    await expect(eng.getByTestId("node-icon-emoji")).toHaveText("🛠️");
    await expect(eng.getByTestId("picker-meta")).toHaveText("3 subpages · Edited 2h ago");
    await expect(row(page, "database:roadmap").getByTestId("picker-meta")).toContainText("Database · 18 entries");
    // An image icon from the app loads; a page without one gets the kind's own.
    await expect(row(page, "page:design").getByTestId("node-icon-img")).toBeVisible();
    await expect(row(page, "page:gtm").getByTestId("node-icon-emoji")).toHaveCount(0);
    // Nothing inside: no chevron.
    await expect(row(page, "page:gtm").getByTestId("picker-toggle")).toHaveCount(0);
    // A long title stays on one line, cut with an ellipsis, whole on hover.
    const long = row(page, "page:long");
    const title = long.getByTestId("picker-title");
    const box = await title.boundingBox();
    expect(box!.height).toBeLessThan(24);
    await expect(long.locator("label")).toHaveAttribute("title", /every open question from the offsite$/);
    await expect(row(page, "page:gtm").getByTestId("picker-meta")).toHaveText(/^Edited [A-Z][a-z]{2} \d+/);
    await expect(page.getByTestId("flow-continue")).toHaveText("Continue");
    await expect(page.getByTestId("flow-continue")).toBeDisabled();
    await shot(page, "rows");
  });

  test("a deep tree opens level by level; ticks are tri-state and the selection says what it brings in", async ({ page }) => {
    const db = await mockPicker(page, { delay: 400 });
    await openNotion(page);
    await page.getByRole("button", { name: "Open Company handbook" }).click();
    // An inline spinner while a level loads.
    await expect(page.getByTestId("picker-loading")).toContainText("Opening Company handbook");
    await expect(row(page, "page:people")).toBeVisible();
    await page.getByRole("button", { name: "Open People" }).click();
    await page.getByRole("button", { name: "Open Payroll" }).click();
    await expect(row(page, "page:payroll-dates")).toBeVisible();
    await expect(row(page, "page:payroll-dates")).toHaveAttribute("aria-level", "4");

    // Ticking something deep marks every level above it as partly picked.
    await row(page, "page:leave").getByTestId("picker-check").check();
    await expect(row(page, "page:people")).toHaveAttribute("data-state", "partial");
    await expect(row(page, "page:handbook")).toHaveAttribute("data-state", "partial");
    expect(await row(page, "page:handbook").getByTestId("picker-check").evaluate((el) => (el as HTMLInputElement).indeterminate)).toBe(true);
    await expect(row(page, "page:handbook")).toHaveAttribute("aria-selected", "false");

    // Ticking the parent takes in what was picked inside it.
    await row(page, "page:handbook").getByTestId("picker-check").check();
    await expect(row(page, "page:handbook")).toHaveAttribute("data-state", "checked");
    await expect(row(page, "page:leave")).toHaveAttribute("data-state", "covered");
    await expect(row(page, "page:leave").getByTestId("picker-check")).toBeDisabled();
    await expect(row(page, "page:leave")).toContainText("Included with Company handbook");
    const panel = page.getByTestId("picked-summary");
    await expect(panel.getByTestId("picked-item")).toHaveCount(1);
    await expect(panel).toContainText("1 selected");
    await expect(panel.getByTestId("picked-brings")).toHaveText("Includes 8 subpages");

    await row(page, "page:eng").getByTestId("picker-check").check();
    await row(page, "database:roadmap").getByTestId("picker-check").check();
    await expect(panel.getByTestId("picked-item")).toHaveCount(3);
    await expect(panel.locator('[data-id="database:roadmap"]').getByTestId("picked-brings")).toHaveText("Includes 18 entries");
    await expect(page.getByTestId("picked-estimate")).toContainText("About 167 pages in all");
    await expect(page.getByTestId("flow-continue")).toHaveText("Continue with 3 items");
    await shot(page, "deep");

    // Removing from the panel unticks the row.
    await panel.getByRole("button", { name: "Remove Product roadmap" }).click();
    await expect(row(page, "database:roadmap")).toHaveAttribute("data-state", "unchecked");
    await expect(page.getByTestId("flow-continue")).toHaveText("Continue with 2 pages");

    // A big level shows a hundred rows, then more on request.
    await page.getByRole("button", { name: "Open Engineering" }).click();
    await page.getByRole("button", { name: "Open Architecture decision records" }).click();
    await expect(page.getByTestId("picker-more")).toHaveText("Show 36 more of 36");
    const before = await page.getByTestId("picker-row").count();
    await page.getByTestId("picker-more").click();
    await expect(page.getByTestId("picker-row")).toHaveCount(before + 36);
    await expect(page.getByTestId("picker-more")).toHaveCount(0);

    await page.getByTestId("flow-continue").click();
    await page.getByTestId("flow-finish").click();
    const sent = db.bodies.find((b) => b.call === "POST /api/knowledge")!;
    expect((sent.source as { selection: { id: string; path: string[]; include_children: boolean }[] }).selection).toEqual([
      { id: "page:handbook", title: "Company handbook", kind: "page", path: [], include_children: true },
      { id: "page:eng", title: "Engineering", kind: "page", path: [], include_children: true },
    ]);
  });

  test("search shows where each result is, marks the match, and clearing it brings the tree back as it was", async ({ page }) => {
    await mockPicker(page);
    await openNotion(page);
    await page.getByRole("button", { name: "Open Engineering" }).click();
    await page.getByRole("button", { name: "Open Runbooks" }).click();
    await expect(row(page, "page:deploy")).toBeVisible();

    await page.getByTestId("picker-search").fill("roll");
    const rows = page.getByTestId("picker-tree").getByTestId("picker-row");
    await expect(rows).toHaveCount(3);
    await expect(page.getByTestId("picker-status")).toHaveText("3 results");
    const hit = rows.filter({ hasText: "Rolling back a bad release" });
    await expect(hit.getByTestId("picker-meta")).toHaveText("Engineering / Runbooks / Deploy");
    await expect(hit.getByTestId("picker-match")).toHaveText("Roll");
    await expect(rows.filter({ hasText: "Payroll dates" }).getByTestId("picker-meta")).toHaveText("Company handbook / People / Payroll");
    // Results are flat: nothing opens from here.
    await expect(page.getByTestId("picker-toggle")).toHaveCount(0);
    // Picking a result keeps its path.
    await hit.getByTestId("picker-check").check();
    await expect(page.getByTestId("picked-summary").getByTestId("picked-where")).toHaveText("In Engineering / Runbooks / Deploy");
    await shot(page, "search");

    await page.getByTestId("picker-clear").click();
    await expect(page.getByTestId("picker-search")).toHaveValue("");
    // What was open is still open, and the pick shows in the tree.
    await expect(row(page, "page:deploy")).toBeVisible();
    await expect(row(page, "page:runbooks")).toHaveAttribute("aria-expanded", "true");
    await expect(row(page, "page:deploy")).toHaveAttribute("data-state", "partial");

    await page.getByTestId("picker-search").fill("zzz");
    await expect(page.getByTestId("picker-empty")).toContainText('Nothing in Notion matches "zzz"');
  });

  test("a level that fails to open says so on its own line, and Try again opens it", async ({ page }) => {
    const db = await mockPicker(page);
    await openNotion(page);
    await page.getByRole("button", { name: "Open Design reviews" }).click();
    const err = page.getByTestId("picker-node-error");
    await expect(err).toContainText("Couldn’t open Design reviews. Notion didn't answer in time.");
    // The rest of the tree still works.
    await expect(row(page, "page:eng")).toBeVisible();
    await shot(page, "error", [1440]);
    await err.getByTestId("picker-retry").click();
    await expect(row(page, "page:design-1")).toBeVisible();
    await expect(err).toHaveCount(0);
    expect(db.calls.filter((c) => c.includes("parent=page%3Adesign")).length).toBe(2);
  });

  test("with nothing shared, it says how to share a page in Notion", async ({ page }) => {
    const db = await mockPicker(page, { empty: true });
    await page.goto("/knowledge/");
    await page.getByTestId("start-notion").click();
    const empty = page.getByTestId("picker-empty");
    await expect(empty).toContainText("Notion hasn’t shared anything with Coderhelm yet.");
    const steps = empty.getByTestId("share-steps").locator("li");
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(1)).toHaveText("Select ••• at the top right, then Connections.");
    await expect(steps.nth(2)).toContainText("Select Add connection");
    await shot(page, "empty");
    db.empty = false;
    await page.getByTestId("picker-recheck").click();
    await expect(row(page, "page:eng")).toBeVisible();
    // The same steps stay one click away once pages are listed.
    await page.getByTestId("picker-help").click();
    await expect(page.getByTestId("share-steps")).toBeVisible();
  });

  test("the keyboard: one tab stop, arrows move, open and close, Space ticks", async ({ page }) => {
    await mockPicker(page);
    await openNotion(page);
    const grid = page.getByRole("treegrid");
    await expect(grid).toHaveAttribute("aria-multiselectable", "true");
    await expect(row(page, "page:handbook")).toHaveAttribute("aria-level", "1");
    await expect(row(page, "page:handbook")).toHaveAttribute("aria-posinset", "1");
    await expect(row(page, "page:handbook")).toHaveAttribute("aria-setsize", "7");
    await expect(page.locator('[role="row"][tabindex="0"]')).toHaveCount(1);

    await page.getByTestId("picker-search").focus();
    await page.keyboard.press("ArrowDown");
    await expect(row(page, "page:handbook")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(row(page, "page:eng")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(row(page, "page:eng")).toHaveAttribute("aria-expanded", "true");
    await expect(row(page, "page:runbooks")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(row(page, "page:runbooks")).toBeFocused();
    await expect(row(page, "page:runbooks")).toHaveAttribute("aria-level", "2");
    await page.keyboard.press("Space");
    await expect(row(page, "page:runbooks")).toHaveAttribute("aria-selected", "true");
    await expect(row(page, "page:eng")).toHaveAttribute("data-state", "partial");
    await page.keyboard.press("ArrowLeft");
    await expect(row(page, "page:eng")).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(row(page, "page:eng")).toHaveAttribute("aria-expanded", "false");
    await expect(row(page, "page:runbooks")).toHaveCount(0);
    await page.keyboard.press("End");
    await expect(row(page, "page:long")).toBeFocused();
    await page.keyboard.press("Home");
    await expect(row(page, "page:handbook")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(page.getByTestId("picker-search")).toBeFocused();
    // Tab leaves the tree in one step.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("source-picker").getByRole("treegrid")).not.toBeFocused();
    const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="treegrid"]'));
    expect(inside).toBe(false);
  });

  test("on a phone the selection is a bar that opens a sheet", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockPicker(page);
    await openNotion(page);
    await expect(page.getByTestId("picked-summary")).toBeHidden();
    const bar = page.getByTestId("picked-bar");
    await expect(bar).toBeDisabled();
    await expect(bar).toContainText("Tick what to bring in");
    await row(page, "page:eng").getByTestId("picker-check").check();
    await row(page, "page:handbook").getByTestId("picker-check").check();
    await expect(bar).toContainText("2 selected · About 149 pages");
    await expect(page.getByTestId("flow-continue")).toHaveText("Continue with 2 pages");
    // Everything fits: no sideways scroll, the main button on screen.
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
    await expect(page.getByTestId("flow-continue")).toBeInViewport();
    await shot(page, "phone-bar", [390]);

    await page.setViewportSize({ width: 390, height: 844 });
    await bar.click();
    const sheet = page.getByTestId("picked-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("picked-item")).toHaveCount(2);
    await expect(sheet.locator('[data-id="page:eng"]').getByTestId("picked-brings")).toHaveText("Includes 139 subpages");
    await shot(page, "phone-sheet", [390]);
    await page.setViewportSize({ width: 390, height: 844 });
    await sheet.getByRole("button", { name: "Remove Engineering" }).click();
    await expect(sheet.getByTestId("picked-item")).toHaveCount(1);
    // Escape closes the sheet, not the dialog behind it.
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId("add-flow")).toBeVisible();
    await expect(row(page, "page:eng")).toHaveAttribute("data-state", "unchecked");
  });
});
