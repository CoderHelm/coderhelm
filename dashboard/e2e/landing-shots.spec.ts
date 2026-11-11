import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { mockKnowledge, newBackend } from "./knowledge-page-data";
import { autoDoneRun, mockSetup } from "./setup-mock";
import { INFRA_FEEDS, INFRA_INSIGHTS, INFRA_RESOURCES, infraOverview } from "./infra-data";

// The screenshots on coderhelm.com's feature pages (public/shots at the repo
// root), taken from the same made up data as the other specs. Only runs with
// LANDING_SHOTS_DIR set; then convert each PNG to WebP at the same size:
//   LANDING_SHOTS_DIR=/tmp/landing npx playwright test e2e/landing-shots.spec.ts
// Text that reads like a real product or person in the shared fixtures is
// made plainer on the page before the picture is taken.

const DIR = process.env.LANDING_SHOTS_DIR;
test.skip(!DIR, "LANDING_SHOTS_DIR not set");

const SIZES = [
  { suffix: "", width: 1440, height: 900 },
  { suffix: "-phone", width: 390, height: 844 },
] as const;

async function plain(page: Page) {
  await page.evaluate(() => {
    const swaps: [RegExp, string][] = [
      [/Ada Lovelace/g, "Ada"],
      [/the dbt jobs/g, "the nightly jobs"],
    ];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      let t = n.nodeValue ?? "";
      for (const [re, to] of swaps) t = t.replace(re, to);
      if (t !== n.nodeValue) n.nodeValue = t;
    }
  });
}

async function shoot(page: Page, name: string, ready: () => Promise<void>) {
  fs.mkdirSync(DIR!, { recursive: true });
  for (const s of SIZES) {
    await page.setViewportSize({ width: s.width, height: s.height });
    await ready();
    await page.addStyleTag({ content: "nextjs-portal,[data-testid=toast]{display:none!important}" });
    await plain(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(350);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(wide, `${name} at ${s.width} scrolls sideways`).toBeLessThanOrEqual(1);
    await page.screenshot({ path: path.join(DIR!, `${name}${s.suffix}.png`) });
  }
}

async function shootSection(page: Page, name: string, testId: string) {
  for (const s of SIZES) {
    await page.setViewportSize({ width: s.width, height: s.height });
    await plain(page);
    await page.waitForTimeout(250);
    await page.getByTestId(testId).screenshot({ path: path.join(DIR!, `${name}${s.suffix}.png`) });
  }
}

test("knowledge base: status, tiles and Ask with passages only", async ({ page }) => {
  await mockKnowledge(page, newBackend("healthy"));
  await shoot(page, "kb-base", async () => {
    await page.goto("/knowledge/base/?id=kb_dw");
    const ask = page.getByTestId("ask");
    await ask.getByTestId("ask-passages-only").check();
    await ask.getByTestId("ask-input").fill("How do we backfill the orders table?");
    await ask.getByTestId("ask-submit").click();
    await expect(ask.getByTestId("ask-passages").getByTestId("ask-passage")).toHaveCount(3);
  });
  await shootSection(page, "kb-usage", "usage");
});

test("setup: a Do it for me run's results", async ({ page }) => {
  await mockSetup(page, { run: autoDoneRun() });
  await shoot(page, "setup-results", async () => {
    await page.goto("/setup/run?id=run_03");
    await expect(page.getByTestId("auto-results")).toBeVisible();
    const web = page.locator('[data-testid="auto-repo"][data-repo="acme/web-app"]');
    await web.getByTestId("group-changed").getByRole("button").first().click();
  });
});

test("security: infrastructure findings grouped by fix", async ({ page }) => {
  const overview = infraOverview();
  const json = (route: Route, body: unknown, code = 200) => route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "acme/infra" }, { name: "acme/web-app" }] });
    if (p === "/api/security/overview")
      return json(route, {
        enabled: true,
        dry_run: false,
        counts: { open: 3, p0: 0, p1: 1, p2: 2, p3: 0, due_7d: 0, fixed_30d: 0, dismissed: 0, noise_removed: 0 },
        median_hours_to_merge_30d: null,
        next_due_at: null,
        sources: { dependabot: "on", osv: { synced_at: null, mode: "api" }, kev_synced_at: null, epss_synced_at: null },
        permission_missing: false,
      });
    if (p === "/api/security/infrastructure") return json(route, overview);
    if (p === "/api/security/infrastructure/sources") return json(route, { feeds: INFRA_FEEDS });
    if (p === "/api/security/infrastructure/resources") return json(route, { accounts: (overview as { accounts?: unknown }).accounts ?? [], resources: INFRA_RESOURCES, count: INFRA_RESOURCES.length });
    if (p === "/api/security/infrastructure/insights") return json(route, INFRA_INSIGHTS);
    if (p.startsWith("/api/infra")) return json(route, { analysis: null });
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  await shoot(page, "infra", async () => {
    await page.goto("/security/infrastructure");
    await expect(page.getByRole("list", { name: "Infrastructure findings" }).getByTestId("infra-row")).toHaveCount(3);
  });
});
