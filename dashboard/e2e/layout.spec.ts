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
  { path: "/", name: "runs" },
  { path: "/runs/detail?id=01RUN00000000000000000001", name: "run-detail" },
  { path: "/plans", name: "plans" },
  { path: "/plans/detail?id=p1", name: "plan-detail" },
  { path: "/plans/new", name: "plan-new" },
  { path: "/plans/templates", name: "plan-templates" },
  { path: "/reviewer", name: "reviewer" },
  { path: "/reviewer/detail?id=r1", name: "reviewer-detail" },
  { path: "/reviewer/config", name: "reviewer-config" },
  { path: "/releases", name: "releases" },
  { path: "/analytics", name: "analytics" },
  { path: "/alerts", name: "alerts" },
  { path: "/alerts/detail?id=a1", name: "alert-detail" },
  { path: "/tests", name: "tests" },
  { path: "/tests/run?id=t1", name: "tests-run" },
  { path: "/tests/test?id=t1", name: "tests-test" },
  { path: "/memory", name: "memory" },
  { path: "/infrastructure", name: "infrastructure" },
  { path: "/graph", name: "graph" },
  { path: "/health", name: "health" },
  { path: "/admin", name: "admin" },
  { path: "/settings", name: "settings" },
  { path: "/settings/team", name: "settings-team" },
  { path: "/settings/notifications", name: "settings-notifications" },
  { path: "/settings/security", name: "settings-security" },
  { path: "/settings/workflow", name: "settings-workflow" },
  { path: "/settings/guardrails", name: "settings-guardrails" },
  { path: "/settings/voice", name: "settings-voice" },
  { path: "/settings/instructions", name: "settings-instructions" },
  { path: "/settings/models", name: "settings-models" },
  { path: "/settings/integrations", name: "settings-integrations" },
  { path: "/settings/budget", name: "settings-budget" },
  { path: "/settings/integrations/github", name: "settings-github" },
  { path: "/settings/repos", name: "settings-repos" },
  { path: "/no-such-page", name: "not-found" },
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
    if (p === "/api/integrations") return json(route, { can_edit: true, items: [], migrated: 0 });
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
    // A settings page sits beside Settings' own list: the column holding both lines up.
    const box = await page.locator("main [data-settings-layout], main [data-page]").first().boundingBox();
    expect(box, `${route} has a page column`).not.toBeNull();
    edges[route] = { x: Math.round(box!.x), width: Math.round(box!.width) };
  }
  const first = Object.values(edges)[0];
  for (const [route, e] of Object.entries(edges)) expect(e, `${route} lines up with ${PAGES[0].path}`).toEqual(first);
});
