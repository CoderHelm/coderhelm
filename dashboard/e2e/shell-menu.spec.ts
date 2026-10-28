import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { mockWideApi } from "./wide-data";
import { SAMPLE_QUERY } from "./wide-data/addresses";
import { pickOption } from "./select";

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`) });
}

// The shell after the UX audit: a short main menu with one Settings entry,
// Settings' own list of pages, tabs for destinations with several pages, the
// three token meters with their names, and one banner at a time.

test("the main menu is a handful of destinations with one Settings entry, Chat and Knowledge", async ({ page }) => {
  await mockWideApi(page);
  await page.goto("/");
  const main = page.getByTestId("main-nav");
  // Plugins shows only while the team's plugins flag is on (the wide data turns it on).
  // toHaveText waits for the menu to render; a one-time read can run before it does.
  await expect(main.getByRole("link")).toHaveText(["Runs", "Plans", "Code review", "Logs", "Chat", "Knowledge", "Plugins", "Insights", "Settings"]);
  await expect(main.getByRole("link", { name: "Runs" })).toHaveAttribute("aria-current", "page");
  // "Brain" is never a word people see in the menu.
  await expect(page.getByRole("navigation", { name: "Main" })).not.toContainText("Brain");
  // Help is one menu.
  await page.getByTestId("nav-help").click();
  const menu = page.getByRole("menu", { name: "Help" });
  await expect(menu.getByRole("menuitem")).toHaveText([/Get help/, /Report an issue/, /Contact us/]);
});

test("the sidebar keeps the three token meters, named, with when they reset", async ({ page }) => {
  await mockWideApi(page);
  await page.goto("/");
  const meter = page.getByTestId("sidebar-token-meter");
  await expect(meter).toContainText("Usage this month");
  await expect(meter).toContainText(/[A-Z][a-z]{2} 1(?!\d)/);
  await expect(meter.getByTestId("token-meter-new_tokens")).toContainText("New tokens");
  await expect(meter.getByTestId("token-meter-cache_read")).toContainText("Cache read");
  await expect(meter.getByTestId("token-meter-cache_write")).toContainText("Cache write");
  await expect(meter).toHaveAttribute("href", /\/settings\/budget\/?$/);
});

test("one banner at a time: the reached limit first, said plainly, with the rest waiting", async ({ page }) => {
  await mockWideApi(page);
  await page.goto("/");
  const limit = page.getByTestId("token-limit-banner");
  await expect(limit).toContainText("Cache write limit reached, so new runs are paused");
  await expect(limit).toContainText("1 more");
  await expect(limit.getByRole("link", { name: "Raise the limit" })).toBeVisible();
  // The site banner waits its turn instead of stacking above the page.
  await expect(page.getByTestId("site-banner")).toHaveCount(0);
  // On the Token limit page the banner doesn't send you to where you already are.
  await page.goto("/settings/budget");
  await expect(page.getByTestId("token-limit-banner").getByRole("link", { name: "Raise the limit" })).toHaveCount(0);
});

test("settings pages show Settings' own list, and destinations with several pages show tabs", async ({ page }) => {
  await mockWideApi(page);
  await page.goto("/settings/security");
  const nav = page.getByRole("navigation", { name: "Settings" });
  await expect(nav.getByRole("link", { name: "Security" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Integrations" })).toBeVisible();
  await expect(page.getByTestId("main-nav").getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
  // Data sources lives under Settings too.
  await page.goto("/data-sources");
  await expect(page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Data sources" })).toHaveAttribute("aria-current", "page");

  await page.goto("/tests");
  const tabs = page.getByRole("navigation", { name: "Code review pages" });
  await expect(tabs.getByRole("link")).toHaveText(["Reviewer", "Tests", "Releases"]);
  await expect(tabs.getByRole("link", { name: "Tests" })).toHaveAttribute("aria-current", "page");
  // An item's page underneath shows no tabs.
  await page.goto(`/runs/detail${SAMPLE_QUERY["/runs/detail"]}`);
  await expect(page.getByTestId("section-tabs")).toHaveCount(0);

  // On a phone, Settings' list is one select.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/security");
  const select = page.getByTestId("settings-nav-select");
  await expect(select).toBeVisible();
  await pickOption(select, "/settings/team");
  await expect(page).toHaveURL(/\/settings\/team\/?$/);
});

test("Logs is its own destination: the log analyzer and alerts as its two tabs, both found by the palette", async ({ page }) => {
  await mockWideApi(page);
  for (const [width, height] of [[1440, 900], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/logs");
    const tabs = page.getByRole("navigation", { name: "Logs pages" });
    await expect(tabs.getByRole("link")).toHaveText(["Logs", "Alerts"]);
    await expect(tabs.getByRole("link", { name: "Logs" })).toHaveAttribute("aria-current", "page");
    if (width === 1440) {
      const main = page.getByTestId("main-nav");
      await expect(main.getByRole("link", { name: "Logs", exact: true })).toHaveAttribute("aria-current", "page");
      await expect(main.getByRole("link", { name: "Logs", exact: true })).toHaveAttribute("href", /\/logs\/?$/);
    }
    await shot(page, `logs-tabs-${width}`);
  }

  // Alerts sits beside Logs now, not under Insights.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/alerts");
  await expect(page.getByRole("navigation", { name: "Logs pages" }).getByRole("link", { name: "Alerts" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("main-nav").getByRole("link", { name: "Logs", exact: true })).toHaveAttribute("aria-current", "page");
  await page.goto("/analytics");
  await expect(page.getByRole("navigation", { name: "Insights pages" }).getByRole("link", { name: "Alerts" })).toHaveCount(0);

  // The palette lists both pages under Logs.
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Search and commands" });
  await expect(palette).toBeVisible();
  for (const [query, href] of [["logs", /\/logs\/?$/], ["alerts", /\/alerts\/?$/]] as const) {
    await palette.getByRole("combobox").fill(query);
    const hit = palette.getByRole("group", { name: "Pages" }).getByRole("option", { name: new RegExp(`^${query}`, "i") }).first();
    await expect(hit).toBeVisible();
    await expect(hit).toContainText("Logs");
  }
  await palette.getByRole("group", { name: "Pages" }).getByRole("option", { name: /^Alerts/ }).first().click();
  await expect(page).toHaveURL(/\/alerts\/?$/);
});

test("the sidebar at 1440 and on a phone, with Logs after Code review", async ({ page }) => {
  await mockWideApi(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/logs");
  await expect(page.getByTestId("main-nav").getByRole("link", { name: "Logs", exact: true })).toBeVisible();
  await shot(page, "sidebar-logs-1440");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/logs");
  await page.getByRole("button", { name: "Menu" }).click();
  const drawer = page.getByRole("dialog", { name: "Menu" });
  await expect(drawer.getByRole("link", { name: "Logs", exact: true })).toBeVisible();
  await shot(page, "sidebar-logs-390");
});
