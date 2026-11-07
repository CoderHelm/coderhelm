import { expect, test, type Page } from "@playwright/test";
import { mockWideApi } from "./wide-data";
import { SAMPLE_QUERY } from "./wide-data/addresses";

// A row of tabs (components/tabs.tsx) scrolls only when its tabs don't fit.
// On a desktop screen every row here fits, so its scroll box must not scroll
// either way: a box that is even 1px bigger inside than out draws a scrollbar
// under the tabs. On a phone a row may scroll inside itself, but the page
// never scrolls sideways.
//
// Every page that draws the shared tab row is listed; the spec fails if a
// listed page stops drawing one, so the list can't quietly go stale.

const PAGES = [
  "/runs/detail", // Overview, Changes, Activity, Details
  "/analytics",
  "/tests",
  "/admin",
  "/settings/agents",
  "/settings/deliveries",
  "/skills/agent",
  "/reviewer", // the section's pages (Reviewer, Tests, Releases)
  "/logs", // the section's pages (Logs, Alerts)
  "/settings/instructions", // the Instructions pages
];

const DESKTOP = [1280, 1600];
const PHONE = 375;

async function open(page: Page, path: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(path + (SAMPLE_QUERY[path] ?? ""));
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await expect(page.getByTestId("topbar")).toBeVisible();
  await page.waitForTimeout(300);
}

/** Each visible tab row's scroll box: its inside and outside sizes. */
function rows(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("[data-testid=tab-row] > [data-scroll-fade]"))
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => ({
        label: el.closest("nav")?.getAttribute("aria-label") ?? "",
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      })),
  );
}

test.describe.configure({ mode: "parallel" });

for (const path of PAGES) {
  test(`tab row does not scroll when it fits: ${path}`, async ({ page }) => {
    await mockWideApi(page);
    const problems: string[] = [];
    for (const width of DESKTOP) {
      await open(page, path, width);
      const found = await rows(page);
      if (!found.length) problems.push(`${path} at ${width}px draws no tab row`);
      for (const r of found) {
        if (r.scrollWidth > r.clientWidth) problems.push(`${path} at ${width}px: "${r.label}" is ${r.scrollWidth - r.clientWidth}px wider inside than out`);
        if (r.scrollHeight > r.clientHeight) problems.push(`${path} at ${width}px: "${r.label}" is ${r.scrollHeight - r.clientHeight}px taller inside than out`);
      }
    }
    await open(page, path, PHONE);
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (scrollWidth > clientWidth) problems.push(`${path} at ${PHONE}px is ${scrollWidth - clientWidth}px wider than the screen`);
    // On a phone the row may scroll sideways, but never up and down.
    for (const r of await rows(page)) {
      if (r.scrollHeight > r.clientHeight) problems.push(`${path} at ${PHONE}px: "${r.label}" is ${r.scrollHeight - r.clientHeight}px taller inside than out`);
    }
    expect(problems.join("\n"), `${path}: a tab row scrolls though its tabs fit, or the page scrolls sideways`).toBe("");
  });
}
