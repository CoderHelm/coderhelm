import { test } from "@playwright/test";
import path from "node:path";
import { mockDemoApi, REVIEW_SK, RUN_ID } from "./topbar-fixtures";

// Before/after pictures of the pages the top bar and the roles matrix
// changed, at a laptop and a phone width. Off unless E2E_SHOTS_DIR is set.
const DIR = process.env.E2E_SHOTS_DIR;

const PAGES: { name: string; url: string; element?: string }[] = [
  { name: "settings-security", url: "/settings/security" },
  { name: "run-detail", url: `/runs/detail?id=${RUN_ID}` },
  { name: "review-detail", url: `/reviewer/detail?sk=${encodeURIComponent(REVIEW_SK)}` },
  { name: "runs-list", url: "/" },
  { name: "team-roles", url: "/settings/team", element: 'section[aria-labelledby="perms-heading"]' },
];

for (const width of [1280, 390]) {
  for (const p of PAGES) {
    test(`shot ${p.name} @${width}`, async ({ page }) => {
      test.skip(!DIR, "E2E_SHOTS_DIR not set");
      await page.setViewportSize({ width, height: width > 500 ? 800 : 844 });
      await mockDemoApi(page);
      await page.goto(p.url);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(400);
      const file = path.join(DIR as string, `${p.name}-${width}.png`);
      if (p.element) {
        // The sticky bar would sit over an element picture taken mid-page.
        await page.addStyleTag({ content: '[data-testid="topbar"]{position:static!important}' });
        await page.locator(p.element).first().screenshot({ path: file });
      }
      else await page.screenshot({ path: file, fullPage: true });
    });
  }
}
