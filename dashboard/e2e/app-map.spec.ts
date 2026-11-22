import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The App map page: Floorplan's viewer (vendor/floorplan, MIT) in a sandboxed
// frame, fed the map of a made-up harbor app in two repositories (a web app
// and an API, written by the platform's Floorplan driver test), with
// Coderhelm's Recent work and Health in the map's own fields. Every API call
// is answered here; nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const HARBOR = JSON.parse(fs.readFileSync(path.join(__dirname, "app-map-harbor.json"), "utf8"));

/** A large made-up map: 30 parts, 3,000 files, 6,000 lines between them. */
function largeMap() {
  const nodes = Array.from({ length: 30 }, (_, i) => ({ id: `part${i}`, parent: null, label: `Dock area ${i}`, kind: i % 3 ? "library" : "service", summary: `Looks after berths in area ${i}.`, details: "", tags: [], paths: [`marina/area${i}`], packages: [], hosts: [], stats: { files: 100, loc: 5000, langs: { typescript: 5000 }, repos: ["marina"] } }));
  const files = Array.from({ length: 3000 }, (_, i) => ({ p: `marina/area${i % 30}/f${i}.ts`, n: `part${i % 30}`, r: "marina", l: "typescript", loc: 50, name: `Berth file ${i}`, d: `Keeps berth ${i}.` }));
  const links = Array.from({ length: 6000 }, (_, i) => ({ a: `f:${files[i % 3000].p}`, b: `f:${files[(i * 7 + 13) % 3000].p}`, k: "import", w: 1 }));
  return { ...HARBOR, project: { name: "Marina" }, nodes, files, routes: [], links, flows: [], tour: [], screens: [], health: { summary: { high: 0, medium: 0, low: 0 }, issues: [] }, recent: undefined };
}

async function mockApi(page: Page, opts: { building?: boolean; graph?: unknown } = {}) {
  const calls: string[] = [];
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    calls.push(`${route.request().method()} ${p}${url.search}`);
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "person@example.com", avatar_url: "", role: "admin", auth_provider: "email", mfa_enabled: false });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "harbor", status: "active", current: true }] });
    if (p === "/api/app-map") {
      if (opts.building) return json(route, { status: { state: "building", updating: true, step: "Reading the repositories", note: "", floorplan: "floorplan--v0.11.0" }, graph: null });
      return json(route, { status: { state: "ready", updating: false, step: "", note: "", floorplan: "floorplan--v0.11.0" }, graph: opts.graph ?? HARBOR });
    }
    return json(route, {});
  });
  return calls;
}

const viewer = (page: Page, testId = "app-map-frame") => page.getByTestId(testId).frameLocator("iframe");

test.describe("App map", () => {
  test("shows Floorplan's viewer in a sandboxed frame with Coderhelm's overlays", async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto("/app-map");
    await expect(page.getByRole("heading", { name: "App map" })).toBeVisible();
    const frame = page.getByTestId("app-map-frame").locator("iframe");
    await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    await expect(frame).toHaveAttribute("src", "/app-map/frame.html#ask=host");
    // The viewer drew the harbor map: its parts are on the board.
    await expect(viewer(page).getByText("Harbor website").first()).toBeVisible();
    await expect(viewer(page).getByText("Booking service").first()).toBeVisible();
    await expect(page.getByTestId("app-map-credit")).toContainText("Floorplan");
    await expect(page.getByTestId("app-map-credit")).toContainText("MIT");
    expect(calls).toContain("GET /api/app-map?recent=1&health=1");
    // Drawn dark like the dashboard, given the rest of the screen, with the
    // side panel closed so the map is what shows first.
    await expect(viewer(page).locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(viewer(page).locator("body")).toHaveClass(/no-panel/);
    const box = await frame.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(640);
    await page.screenshot({ path: path.join(SHOTS_DIR, "app-map-whole.png"), fullPage: true });
    // Selecting a part opens its details.
    await viewer(page).getByText("Booking service").first().click();
    await expect(viewer(page).locator("body")).not.toHaveClass(/no-panel/);
    await page.screenshot({ path: path.join(SHOTS_DIR, "app-map-selected.png"), fullPage: true });
  });

  test("the frame has its own origin and reaches no network", async ({ page }) => {
    await mockApi(page);
    await page.goto("/app-map");
    await expect(viewer(page).getByText("Harbor website").first()).toBeVisible();
    const inner = page.frames().find((f) => f !== page.mainFrame() && f.url().includes("/app-map/frame.html"));
    expect(inner).toBeTruthy();
    const facts = await inner!.evaluate(async () => {
      let fetched = "blocked";
      try {
        await fetch("/api/me");
        fetched = "reached";
      } catch {
        fetched = "blocked";
      }
      let storage = "none";
      // The browser's own storage is shut; the viewer's settings live in a
      // store kept in memory for this frame, which is not a real Storage.
      try {
        sessionStorage.getItem("x");
        storage = "open";
      } catch {
        storage = "none";
      }
      if (localStorage instanceof Storage) storage = "open";
      let parent = "hidden";
      try {
        void window.parent.document.title;
        parent = "readable";
      } catch {
        parent = "hidden";
      }
      return { origin: window.origin, fetched, storage, parent };
    });
    expect(facts).toEqual({ origin: "null", fetched: "blocked", storage: "none", parent: "hidden" });
  });

  test("Recent work and Health toggles ask for Coderhelm's overlays", async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto("/app-map");
    await expect(viewer(page).getByText("Harbor website").first()).toBeVisible();
    await page.getByTestId("app-map-recent-toggle").click();
    await expect.poll(() => calls.includes("GET /api/app-map?recent=0&health=1")).toBe(true);
    await page.getByTestId("app-map-health-toggle").click();
    await expect.poll(() => calls.includes("GET /api/app-map?recent=0&health=0")).toBe(true);
    await expect(page.getByTestId("app-map-recent-toggle")).toHaveAttribute("aria-pressed", "false");
  });

  test("shows a clear state while the map builds", async ({ page }) => {
    await mockApi(page, { building: true });
    await page.goto("/app-map");
    await expect(page.getByTestId("app-map-building")).toContainText("Building your app map");
    await expect(page.getByTestId("app-map-building")).toContainText("Reading the repositories");
    await expect(page.getByTestId("app-map-frame")).toHaveCount(0);
    await page.screenshot({ path: path.join(SHOTS_DIR, "app-map-building.png"), fullPage: true });
  });

  test("a large map leaves the page responsive", async ({ page }) => {
    await mockApi(page, { graph: largeMap() });
    // Long tasks on the dashboard's own main thread, from the first paint on.
    await page.addInitScript(() => {
      const w = window as unknown as { __long: number[] };
      w.__long = [];
      new PerformanceObserver((list) => list.getEntries().forEach((e) => w.__long.push(Math.round(e.duration)))).observe({ type: "longtask", buffered: true });
    });
    await page.goto("/app-map");
    await expect(page.getByRole("heading", { name: "App map" })).toBeVisible();
    await page.waitForTimeout(1500);
    const before = await page.evaluate(() => (window as unknown as { __long: number[] }).__long.slice());
    await expect(viewer(page).getByText("Dock area 0").first()).toBeVisible({ timeout: 60_000 });
    const after = await page.evaluate(() => (window as unknown as { __long: number[] }).__long.slice());
    // With the map on screen, the page still answers a click at once.
    const t0 = Date.now();
    await page.getByTestId("app-map-health-toggle").click();
    await expect(page.getByTestId("app-map-health-toggle")).toHaveAttribute("aria-pressed", "false");
    const clickMs = Date.now() - t0;
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const report = { beforeMapLongTasks: before.length, beforeMapMs: sum(before), withMapLongTasks: after.length - before.length, withMapMs: sum(after) - sum(before), longestWithMapMs: Math.max(0, ...after.slice(before.length)), clickMs };
    console.log(`app-map responsiveness: ${JSON.stringify(report)}`);
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(SHOTS_DIR, "app-map-responsiveness.json"), JSON.stringify(report, null, 1));
    expect(clickMs).toBeLessThan(1000);
    await page.screenshot({ path: path.join(SHOTS_DIR, "app-map-large.png"), fullPage: true });
  });

  test("fits a phone in light and dark color schemes", async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/app-map");
      await expect(viewer(page).getByText("Harbor website").first()).toBeVisible();
      await expect(viewer(page).locator("html")).toHaveAttribute("data-theme", "dark");
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(sideways).toBeLessThanOrEqual(1);
      await page.screenshot({ path: path.join(SHOTS_DIR, `app-map-phone-${scheme}.png`), fullPage: true });
    }
  });
});
