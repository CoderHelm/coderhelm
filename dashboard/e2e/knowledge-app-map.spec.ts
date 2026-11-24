import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The App map as a source on the Knowledge page: where its build stands,
// when it was built, what it covers (screens per app, outside services,
// cloud links, repositories), a link to the map, and for admins "Build
// again" through the one-at-a-time rebuild. The card says the map is looked
// up directly rather than split into passages. Every API call is answered
// here; nothing reaches a real backend.

const SHOTS = process.env.KB_APP_MAP_SHOTS_DIR || path.join("test-results", "kb-app-map-shots");
const nowSecs = Math.floor(Date.now() / 1000);
const EXPLAIN = "Not split into passages like a knowledge base: runs and Chat look things up in the map directly.";

type Card = Record<string, unknown>;

const built = (over: Card = {}): Card => ({
  state: "built",
  built_at: nowSecs - 3 * 3600,
  last_failed: false,
  note: "",
  repos: 4,
  coverage: { screens: { "harbor-mobile": 3, web: 1 }, outside_services: 4, cloud_links: 2, repos: 4, journeys: 1 },
  href: "/app-map",
  can_rebuild: true,
  embedded: false,
  explain: EXPLAIN,
  ...over,
});

interface Db {
  calls: string[];
  card: Card;
  rebuilds: number;
}

async function mock(page: Page, admin: boolean, card: Card): Promise<Db> {
  const db: Db = { calls: [], card, rebuilds: 0 };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    db.calls.push(`${method} ${p}${url.search}`);
    if (p === "/api/me")
      return json(route, { user_id: "u_1", team_id: "t_1", github_login: "ada", email: admin ? "admin@example.com" : "dev@example.com", avatar_url: "", role: admin ? "admin" : "member" });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/knowledge" && method === "GET")
      return json(route, {
        bases: [],
        can_manage: admin,
        limits: { max_file_bytes: 1, max_files: 1, extensions: [], agents: [], read_roles: ["viewer", "member", "admin"] },
        app_map: { ...db.card, can_rebuild: admin && db.card.can_rebuild !== false },
      });
    if (p === "/api/knowledge/builtin") return json(route, { bases: [], readers: { enabled: false }, can_manage: admin });
    if (p === "/api/app-map/rebuild" && method === "POST") {
      db.rebuilds += 1;
      if (db.rebuilds > 1) return json(route, { error: "The map is already being built.", code: "already_building", status: { state: "ready", updating: true } }, 409);
      return json(route, { status: { state: "ready", updating: true } }, 202);
    }
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(200);
  await page.getByTestId("app-map-source").screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

async function noSideways(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(wide, "nothing scrolls sideways").toBeLessThanOrEqual(1);
}

test("the App map card shows its state, coverage and link, and admins build it again once", async ({ page }) => {
  const db = await mock(page, true, built());
  await page.goto("/knowledge/");
  const card = page.getByTestId("app-map-source");
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-state", "built");
  await expect(page.getByTestId("app-map-source-state")).toHaveText("Built 3 h ago");
  await expect(page.getByTestId("app-map-source-built")).toHaveCount(0);
  await expect(page.getByTestId("app-map-source-explain")).toHaveText(EXPLAIN);
  const cov = page.getByTestId("app-map-source-coverage");
  await expect(cov).toContainText("3 screens in harbor-mobile, 1 screen in web");
  await expect(cov).toContainText("Outside services4");
  await expect(cov).toContainText("Cloud links2");
  await expect(cov).toContainText("Repositories4");
  await expect(page.getByTestId("app-map-source-open")).toHaveAttribute("href", /\/app-map\/?$/);
  await shot(page, "built-admin");

  // Build again: one build, then the card says it is building.
  await page.getByTestId("app-map-source-rebuild").click();
  await expect(card).toHaveAttribute("data-state", "rebuilding");
  await expect(page.getByTestId("app-map-source-state")).toHaveText("Building again");
  await expect(page.getByTestId("app-map-source-built")).toHaveText("Last built 3 h ago");
  await expect(page.getByTestId("app-map-source-rebuild")).toBeDisabled();
  expect(db.calls.filter((c) => c === "POST /api/app-map/rebuild")).toHaveLength(1);
  await shot(page, "rebuilding");

  // At phone width nothing scrolls sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  await noSideways(page);
});

test("a member sees the card without Build again; a build that is already running carries on", async ({ page }) => {
  await mock(page, false, built());
  await page.goto("/knowledge/");
  await expect(page.getByTestId("app-map-source")).toBeVisible();
  await expect(page.getByTestId("app-map-source-rebuild")).toHaveCount(0);
  await expect(page.getByTestId("app-map-source-open")).toBeVisible();
});

test("the card says when the build failed, and when a map is being built for the first time", async ({ page }) => {
  const db = await mock(page, true, built({ state: "failed", built_at: 0, coverage: null, note: "The build couldn't be started. Try again in a moment." }));
  await page.goto("/knowledge/");
  const card = page.getByTestId("app-map-source");
  await expect(card).toHaveAttribute("data-state", "failed");
  await expect(page.getByTestId("app-map-source-state")).toHaveText("The build failed");
  await expect(page.getByTestId("app-map-source-note")).toHaveText("The build couldn't be started. Try again in a moment.");
  await expect(page.getByTestId("app-map-source-coverage")).toHaveCount(0);
  await expect(page.getByTestId("app-map-source-built")).toHaveCount(0);
  await shot(page, "failed");

  // Another build already running: the rebuild answers 409 and the card
  // shows the build that carries on.
  db.rebuilds = 1;
  await page.getByTestId("app-map-source-rebuild").click();
  await expect(card).toHaveAttribute("data-state", "building");
  await expect(page.getByTestId("app-map-source-state")).toHaveText("Building");
});
