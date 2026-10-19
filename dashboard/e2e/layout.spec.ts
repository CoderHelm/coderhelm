import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Every page sits in the same centered column (components/page.tsx), so left
// edges and widths line up page to page and nothing scrolls sideways on a phone.
// Every API call is answered here. Nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const WIDTH = "max-w-6xl";

/** Pages on the shared layout. Add a page here when it moves onto <Page>. */
const PAGES: { path: string; name: string }[] = [
  { path: "/analytics", name: "analytics" },
  { path: "/releases", name: "releases" },
];

async function mockApi(page: Page) {
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "owner@example.com", avatar_url: "", role: "owner" });
    if (p === "/api/usage") return json(route, { month: "2026-01", tokens_in: 0, tokens_out: 0, total_runs: 0, total_tokens: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    // Every page API fails the way the gateway does (bare status, no body):
    // the page still renders its frame, and the frame is what is checked.
    return route.fulfill({ status: 500, body: "" });
  });
}

for (const { path: route, name } of PAGES) {
  test(`layout: ${route} uses the shared centered column`, async ({ page }) => {
    await mockApi(page);
    await page.goto(route);
    const column = page.locator("main [data-page]").first();
    await expect(column).toBeVisible();
    await expect(column).toHaveClass(new RegExp(`\\bmx-auto\\b.*\\b${WIDTH}\\b|\\b${WIDTH}\\b.*\\bmx-auto\\b`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(200);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS_DIR, `layout-${name}-${width}.png`), fullPage: true });
    }
  });
}

test("layout: the column's left edge is the same on every page", async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  const edges: Record<string, { x: number; width: number }> = {};
  for (const { path: route } of PAGES) {
    await page.goto(route);
    const box = await page.locator("main [data-page]").first().boundingBox();
    expect(box, `${route} has a page column`).not.toBeNull();
    edges[route] = { x: Math.round(box!.x), width: Math.round(box!.width) };
  }
  const first = Object.values(edges)[0];
  for (const [route, e] of Object.entries(edges)) expect(e, `${route} lines up with ${PAGES[0].path}`).toEqual(first);
});
