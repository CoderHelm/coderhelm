import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import { mockWideApi } from "./wide-data";
import { v2MapNamed } from "./app-map-v2-data";
import path from "node:path";

// The App map page: Floorplan's viewer (vendor/floorplan, MIT) in a sandboxed
// frame, fed the map of a made-up harbor app in two repositories (a web app
// and an API, written by the platform's Floorplan driver test), with
// Coderhelm's Recent work and Health in the map's own fields. Its System
// cards are named by their repositories, as the platform's copy of a map
// names them. Every API call is answered here; nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const HARBOR = JSON.parse(fs.readFileSync(path.join(__dirname, "app-map-harbor.json"), "utf8"));

/** A large made-up map: 30 parts, 3,000 files, 6,000 lines between them. */
function largeMap() {
  const nodes = Array.from({ length: 30 }, (_, i) => ({ id: `part${i}`, parent: null, label: `Dock area ${i}`, kind: i % 3 ? "library" : "service", summary: `Looks after berths in area ${i}.`, details: "", tags: [], paths: [`marina/area${i}`], packages: [], hosts: [], stats: { files: 100, loc: 5000, langs: { typescript: 5000 }, repos: ["marina"] } }));
  const files = Array.from({ length: 3000 }, (_, i) => ({ p: `marina/area${i % 30}/f${i}.ts`, n: `part${i % 30}`, r: "marina", l: "typescript", loc: 50, name: `Berth file ${i}`, d: `Keeps berth ${i}.` }));
  const links = Array.from({ length: 6000 }, (_, i) => ({ a: `f:${files[i % 3000].p}`, b: `f:${files[(i * 7 + 13) % 3000].p}`, k: "import", w: 1 }));
  return { ...HARBOR, project: { name: "Marina" }, nodes, files, routes: [], links, flows: [], tour: [], screens: [], health: { summary: { high: 0, medium: 0, low: 0 }, issues: [] }, recent: undefined };
}

type Status = Record<string, unknown>;
const NOW = Math.floor(Date.now() / 1000);
const BASE: Status = { updating: false, step: "", stage: "", last_build: "ready", note: "", started_at: 0, repos: 0, estimate: null, built_at: 0, built_repos: 0, now: NOW, floorplan: "floorplan--v0.11.0" };
/** A first build on its second step, started four minutes ago, for 3 repositories. */
const BUILDING: Status = { ...BASE, state: "building", updating: true, step: "Finding the parts and how they connect", stage: "parts", last_build: "building", started_at: NOW - 4 * 60, repos: 3, estimate: { low_secs: 6 * 60, high_secs: 12 * 60 } };
const FAILED: Status = { ...BASE, state: "failed", stage: "parts", last_build: "failed", note: "the sandbox couldn't run Floorplan (exit 1)" };
const EMPTY: Status = { ...BASE, state: "empty", note: "No repositories are turned on for this team." };
const READY: Status = { ...BASE, state: "ready", stage: "done", built_at: NOW - 3 * 60, built_repos: 12 };

async function mockApi(page: Page, opts: { building?: boolean; graph?: unknown; status?: Status; rebuild?: "accept" | "busy"; role?: string } = {}) {
  const calls: string[] = [];
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  let status: Status = opts.status ?? (opts.building ? BUILDING : READY);
  const graph = () => (status.state === "ready" ? (opts.graph ?? HARBOR) : null);
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    calls.push(`${route.request().method()} ${p}${url.search}`);
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "person@example.com", avatar_url: "", role: opts.role ?? "admin", auth_provider: "email", mfa_enabled: false });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "harbor", status: "active", current: true }] });
    if (p === "/api/app-map/rebuild") {
      if (opts.rebuild === "busy") return json(route, { error: "The map is already being built.", code: "already_building", status: { ...BUILDING, state: status.state === "ready" ? "ready" : "building" } }, 409);
      const hasMap = status.state === "ready";
      status = { ...BUILDING, state: hasMap ? "ready" : "building", stage: "reading", step: "Waiting to start", started_at: NOW, built_at: status.built_at, built_repos: status.built_repos };
      return json(route, { status }, 202);
    }
    if (p === "/api/app-map") return json(route, { status, graph: url.searchParams.get("graph") === "0" ? null : graph() });
    return json(route, {});
  });
  return calls;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  // The dev server's overlay button, out of the picture (a static build has none, and its CSP may refuse the tag).
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true });
}

/** The page at desktop size, then on a phone, with no sideways scroll. */
async function bothSizes(page: Page, name: string, ready: () => Promise<void>) {
  await page.goto("/app-map");
  await ready();
  await shot(page, `app-map-${name}-desktop`);
  await page.setViewportSize({ width: 390, height: 844 });
  await ready();
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sideways).toBeLessThanOrEqual(1);
  await shot(page, `app-map-${name}-phone`);
}

const viewer = (page: Page, testId = "app-map-frame") => page.getByTestId(testId).frameLocator("iframe");

test.describe("App map", () => {
  test("shows Floorplan's viewer in a sandboxed frame with Coderhelm's overlays", async ({ page }) => {
    const calls = await mockApi(page);
    await page.goto("/app-map");
    await expect(page.getByRole("heading", { name: "App map" })).toBeVisible();
    const frame = page.getByTestId("app-map-frame").locator("iframe");
    await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    // The App map page's frame: Coderhelm's levels, journeys and screens, no tour.
    await expect(frame).toHaveAttribute("src", "/app-map/frame.html#ask=host&tour=0&full=1");
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

  test("while the map builds: the steps in order, the time, what it will be, and no way to start another", async ({ page }) => {
    const calls = await mockApi(page, { building: true });
    await page.goto("/app-map");
    const card = page.getByTestId("app-map-building");
    await expect(card.getByRole("heading", { name: "Building your app map" })).toBeVisible();
    const steps = page.getByTestId("app-map-steps").getByRole("listitem");
    await expect(steps).toHaveText([/Reading the repositories/, /Finding the parts and how they connect/, /Describing each part in plain words/, /Done/]);
    await expect(steps.nth(0)).toHaveAttribute("data-state", "done");
    await expect(steps.nth(1)).toHaveAttribute("aria-current", "step");
    await expect(steps.nth(1)).toContainText("Now");
    await expect(steps.nth(2)).toHaveAttribute("data-state", "next");
    const startedAt = await page.evaluate((t) => new Date(t * 1000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }), BUILDING.started_at as number);
    await expect(page.getByTestId("app-map-timing")).toHaveText(`Started at ${startedAt}, 4 min so far. A map of 3 repositories usually takes 6 to 12 minutes.`);
    await expect(page.getByTestId("app-map-preview")).toContainText("What you'll get");
    await expect(page.getByTestId("app-map-preview").getByRole("img")).toBeVisible();
    // One build at a time: nothing here starts another.
    await expect(page.getByRole("button", { name: /build/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "More" })).toHaveCount(0);
    await expect(page.getByTestId("app-map-frame")).toHaveCount(0);
    // It watches the status only, not the whole map.
    await expect.poll(() => calls.some((c) => c === "GET /api/app-map?graph=0"), { timeout: 12_000 }).toBe(true);
    await bothSizes(page, "building", async () => {
      await expect(card).toBeVisible();
    });
  });

  test("a failed first build says where it stopped and offers one Try again", async ({ page }) => {
    const calls = await mockApi(page, { status: FAILED, rebuild: "accept" });
    await page.goto("/app-map");
    const failed = page.getByTestId("app-map-failed");
    await expect(failed).toContainText("The map couldn't be built");
    await expect(failed).toContainText("It stopped while finding the parts and how they connect.");
    // The raw reason is folded away, not the headline.
    await expect(failed.getByText("Technical details").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(1);
    await bothSizes(page, "failed", async () => {
      await expect(failed).toBeVisible();
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByTestId("app-map-building")).toBeVisible();
    await expect(page.getByTestId("app-map-steps").getByRole("listitem").nth(0)).toHaveAttribute("aria-current", "step");
    await expect(page.getByTestId("app-map-building")).toContainText("Waiting for a worker");
    expect(calls.filter((c) => c === "POST /api/app-map/rebuild")).toHaveLength(1);
  });

  test("nothing to map yet points to Setup", async ({ page }) => {
    await mockApi(page, { status: EMPTY });
    await page.goto("/app-map");
    const empty = page.getByTestId("app-map-empty");
    await expect(empty).toContainText("Nothing to map yet");
    await expect(empty.getByRole("link", { name: "Turn on repositories" })).toHaveAttribute("href", /^\/setup\/?$/);
    await bothSizes(page, "empty", async () => {
      await expect(empty).toBeVisible();
    });
  });

  test("with a map: the map first, when it was built, a small Build again, and the Chat hint", async ({ page }) => {
    const calls = await mockApi(page, { rebuild: "accept" });
    await page.goto("/app-map");
    await expect(viewer(page).getByText("Harbor website").first()).toBeVisible();
    await expect(page.getByTestId("app-map-built")).toContainText("Built 3 minutes ago from 12 repositories.");
    await expect(page.getByTestId("app-map-hint")).toHaveText("Questions about how it works? Ask below or in Chat; answers come from this map.");
    await expect(page.getByTestId("app-map-hint").getByRole("link", { name: "Chat" })).toHaveAttribute("href", /^\/chat\/?$/);
    // The map comes before the toggles and the Ask box.
    const top = async (id: string) => (await page.getByTestId(id).boundingBox())!.y;
    expect(await top("app-map-frame")).toBeLessThan(await top("app-map-recent-toggle"));
    expect(await top("app-map-frame")).toBeLessThan(await top("app-map-ask"));
    await bothSizes(page, "built", async () => {
      await expect(viewer(page).getByText("Harbor website").first()).toBeVisible();
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    // Building again: the button goes while the update runs, the map stays.
    await page.getByTestId("app-map-rebuild").click();
    await expect(page.getByTestId("app-map-built")).toContainText("Updating since");
    await expect(page.getByTestId("app-map-rebuild")).toHaveCount(0);
    await expect(viewer(page).getByText("Harbor website").first()).toBeVisible();
    expect(calls.filter((c) => c === "POST /api/app-map/rebuild")).toHaveLength(1);
    await shot(page, "app-map-updating-desktop");
  });

  test("a build already running is shown, not started again", async ({ page }) => {
    await mockApi(page, { rebuild: "busy" });
    await page.goto("/app-map");
    await page.getByTestId("app-map-rebuild").click();
    await expect(page.getByText("The map is already being built. That build carries on.")).toBeVisible();
    await expect(page.getByTestId("app-map-built")).toContainText("Updating since");
    await expect(page.getByTestId("app-map-rebuild")).toHaveCount(0);
  });

  test("a map made before this release is rebuilt with its improvements, the old map shown meanwhile", async ({ page }) => {
    const calls = await mockApi(page, { status: { ...READY, updating: true, step: "Reading the repositories", stage: "reading", last_build: "building", started_at: NOW - 60, reason: "release" } });
    await page.goto("/app-map");
    await expect(viewer(page).getByText("Harbor website").first()).toBeVisible();
    await expect(page.getByTestId("app-map-built")).toContainText("Rebuilding with this release's improvements since");
    await expect(page.getByTestId("app-map-built")).toContainText("You're looking at the last map until it's done.");
    await expect(page.getByTestId("app-map-rebuild")).toHaveCount(0);
    expect(calls.filter((c) => c === "POST /api/app-map/rebuild")).toHaveLength(0);
  });

  test("members see when it was built but not the button", async ({ page }) => {
    await mockApi(page, { role: "member" });
    await page.goto("/app-map");
    await expect(page.getByTestId("app-map-built")).toContainText("Built 3 minutes ago");
    await expect(page.getByTestId("app-map-rebuild")).toHaveCount(0);
  });

  test("App map has its own place in the menu and the palette, and no longer hides under Insights", async ({ page }) => {
    // Every page's data, so Insights' own pages draw too.
    await mockWideApi(page);
    // Insights' tabs no longer carry it.
    await page.goto("/analytics/");
    await expect(page.getByTestId("section-tabs")).toBeVisible();
    await expect(page.getByTestId("section-tabs")).not.toContainText("App map");
    // Its own entry, beside Chat and Knowledge, marked current on its page.
    await page.goto("/app-map/");
    await expect(page.getByRole("heading", { name: "App map", level: 1 })).toBeVisible();
    const nav = page.getByTestId("main-nav");
    const link = nav.getByRole("link", { name: "App map", exact: true });
    await expect(link).toHaveAttribute("href", /^\/app-map\/?$/);
    await expect(link).toHaveAttribute("aria-current", "page");
    const names = await nav.getByRole("link").allInnerTexts();
    const i = names.findIndex((n) => n.trim() === "App map");
    expect(names[i - 1]?.trim()).toBe("Knowledge");
    await expect(page.getByTestId("section-tabs")).toHaveCount(0);
    await shot(page, "app-map-menu-desktop");
    // The palette finds it by name.
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Search and commands" });
    await palette.getByRole("combobox").fill("app map");
    await expect(palette.getByRole("option", { name: /App map/ }).first()).toBeVisible();
  });

  for (const role of ["viewer", "member", "admin", "owner"]) {
    test(`every role that can read the map has App map in the menu (${role})`, async ({ page }) => {
      await mockApi(page, { role });
      await page.goto("/app-map");
      await expect(viewer(page).getByText("Harbor website").first()).toBeVisible();
      const link = page.getByTestId("main-nav").getByRole("link", { name: "App map", exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("aria-current", "page");
      // Building it again stays an admin's.
      await expect(page.getByRole("button", { name: "Build the map again" })).toHaveCount(role === "admin" || role === "owner" ? 1 : 0);
    });
  }

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

// The map read from where the API says it is (a signed address of the
// bucket, or the same bytes through the API), Coderhelm's overlays laid over
// it on the page, a read that never answers, and the viewer's full screen.
const VIEW_PATH = "/bucket/app-map/t_1/view.json.gz";
/** The page's copy as the server writes it: the map without Recent work. */
const VIEW = (() => {
  const g = JSON.parse(JSON.stringify(HARBOR));
  delete g.recent;
  return g;
})();
const OVERLAYS = {
  recent: { updatedAt: "2026-11-21T00:00:00Z", source: "coderhelm", tasks: [{ title: "DOCK-42: Stop double bookings", request: "", summary: "Two boaters could book one slip.", status: "completed" }], items: [{ id: "f:harbor-api/src/bookings.js", task: 0, change: "changed", note: "Changed by Coderhelm's run for DOCK-42" }] },
  health: {
    add: [{ id: "coderhelm:security:f1", kind: "coderhelm-security", severity: "high", title: "Coderhelm security: Prototype pollution in a parser", detail: "Found by Coderhelm.", items: ["f:harbor-api/src/bookings.js"], notes: {}, locations: [{ file: "harbor-api/src/bookings.js", line: 5 }], fix: "", source: "coderhelm", link: "/security/detail?id=f1" }],
    drop: ["no-auth:harbor-api"],
    summary: { high: 2, medium: 0, low: 0 },
  },
};

async function mockBucket(page: Page, opts: { bucket?: "ok" | "unreachable"; hang?: () => boolean } = {}) {
  const calls: string[] = [];
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && url.pathname.startsWith("/bucket/"), async (route) => {
    const url = new URL(route.request().url());
    calls.push(`BUCKET ${url.pathname}${url.search}`);
    // The signed address is the credential: no cookies go with it.
    calls.push(`cookie:${route.request().headers()["cookie"] ? "sent" : "none"}`);
    if (opts.bucket === "unreachable") return route.abort("failed");
    return json(route, VIEW);
  });
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    calls.push(`${route.request().method()} ${p}${url.search}`);
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "person@example.com", avatar_url: "", role: "admin", auth_provider: "email", mfa_enabled: false });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "harbor", status: "active", current: true }] });
    if (p === "/api/app-map/graph") return json(route, VIEW);
    if (p === "/api/app-map") {
      if (opts.hang?.()) return; // never answers
      const recent = url.searchParams.get("recent") === "1";
      const health = url.searchParams.get("health") === "1";
      const overlays = { ...(recent ? { recent: OVERLAYS.recent } : {}), ...(health ? { health: OVERLAYS.health } : {}) };
      return json(route, { status: READY, graph: null, graph_url: `${url.origin}${VIEW_PATH}?X-Amz-Expires=900&X-Amz-Signature=abc`, graph_fallback: "/api/app-map/graph", graph_at: NOW - 180, overlays });
    }
    return json(route, {});
  });
  return calls;
}

/** What the viewer was given, read back inside the frame (none while a new frame replaces it). */
async function shownGraph(page: Page) {
  const inner = page.frames().find((f) => f !== page.mainFrame() && !f.isDetached() && f.url().includes("/app-map/frame.html"))!;
  return inner.evaluate(() => {
    const G = (window as unknown as { FLOORPLAN: { recent?: { tasks?: { title: string }[] }; health?: { issues?: { id: string }[]; summary?: unknown } } }).FLOORPLAN;
    return { tasks: (G.recent?.tasks ?? []).map((t) => t.title), issues: (G.health?.issues ?? []).map((i) => i.id), summary: G.health?.summary };
  });
}

test.describe("App map reading", () => {
  test("reads the map from the bucket once and lays Coderhelm's overlays over it", async ({ page }) => {
    const calls = await mockBucket(page);
    await page.goto("/app-map");
    await expect(viewer(page).getByText("Harbor website").first()).toBeVisible();
    expect(calls.filter((c) => c.startsWith("BUCKET"))).toEqual([`BUCKET ${VIEW_PATH}?X-Amz-Expires=900&X-Amz-Signature=abc`]);
    expect(calls).toContain("cookie:none");
    expect(calls).not.toContain("GET /api/app-map/graph");
    const g = await shownGraph(page);
    expect(g.tasks).toEqual(["DOCK-42: Stop double bookings"]);
    expect(g.issues).toContain("coderhelm:security:f1");
    expect(g.issues).not.toContain("no-auth:harbor-api");
    expect(g.summary).toEqual({ high: 2, medium: 0, low: 0 });
    // The toggles ask for the overlays again, never the map.
    await page.getByTestId("app-map-recent-toggle").click();
    await expect.poll(() => calls.includes("GET /api/app-map?recent=0&health=1")).toBe(true);
    await expect(viewer(page).getByText("Harbor website").first()).toBeVisible();
    expect(calls.filter((c) => c.startsWith("BUCKET"))).toHaveLength(1);
    await expect.poll(async () => (await shownGraph(page).catch(() => null))?.tasks).toEqual([]);
  });

  test("when the bucket can't be reached, the same map comes through the API", async ({ page }) => {
    const calls = await mockBucket(page, { bucket: "unreachable" });
    await page.goto("/app-map");
    await expect(viewer(page).getByText("Harbor website").first()).toBeVisible();
    expect(calls).toContain("GET /api/app-map/graph");
  });

  test("a read that never answers ends in Try again, never an endless placeholder", async ({ page }) => {
    let hang = true;
    await mockBucket(page, { hang: () => hang });
    await page.goto("/app-map");
    // While it waits, the page says what it is doing.
    await expect(page.getByTestId("app-map-loading")).toContainText(/Reading where the map is|Loading the map/);
    await shot(page, "app-map-loading");
    const problem = page.getByTestId("problem");
    await expect(problem).toContainText("The map couldn't be loaded", { timeout: 30_000 });
    await expect(page.getByTestId("app-map-loading")).toHaveCount(0);
    await problem.getByText("Technical details").click();
    await expect(problem.getByText("The map took too long to load.")).toBeVisible();
    await shot(page, "app-map-timed-out");
    hang = false;
    await problem.getByRole("button", { name: "Try again" }).click();
    await expect(viewer(page).getByText("Harbor website").first()).toBeVisible();
  });

  // Full screen is the page's own button, above the map and in view without
  // scrolling, called in the click itself; the viewer's button in its zoom
  // bar asks the page when the browser refuses the sandboxed frame. Each
  // test fails if a button goes missing or stops answering its click.
  const fullScreenOf = (page: Page) => page.evaluate(() => document.fullscreenElement?.getAttribute("data-testid") ?? document.fullscreenElement?.tagName ?? "");

  test("the page's Full screen button puts the map on the whole screen and back", async ({ page }) => {
    await mockBucket(page);
    await page.goto("/app-map");
    await expect(viewer(page).getByText("Harbor website").first()).toBeVisible();
    const button = page.getByTestId("app-map-fullscreen");
    await expect(button).toHaveText("Full screen");
    await expect(button).toBeInViewport();
    await button.click();
    await expect.poll(() => fullScreenOf(page)).toBe("app-map-frame");
    await expect(button).toHaveText("Exit full screen");
    await expect(button).toHaveAttribute("aria-pressed", "true");
    // The map fills the screen, below the button.
    const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    const box = (await page.getByTestId("app-map-frame").locator("iframe").boundingBox())!;
    expect(box.width).toBeGreaterThan(size.w - 40);
    expect(box.height).toBeGreaterThan(size.h - 100);
    // The viewer's own button says the same.
    await expect(viewer(page).locator("#ch-fullscreen")).toHaveAttribute("aria-label", "Exit full screen");
    await page.screenshot({ path: path.join(SHOTS_DIR, "app-map-fullscreen.png") });
    await button.click();
    await expect.poll(() => fullScreenOf(page)).toBe("");
    await expect(button).toHaveText("Full screen");
    await expect(viewer(page).locator("#ch-fullscreen")).toHaveAttribute("aria-label", "Full screen");
  });

  test("when the browser refuses full screen, the map covers the window and Esc or the button leaves", async ({ page }) => {
    // A browser may refuse full screen even in a real click (a setting, a
    // policy, an embedding page): the button must still work.
    await page.addInitScript(() => {
      Element.prototype.requestFullscreen = () => Promise.reject(new TypeError("not granted"));
    });
    await mockBucket(page);
    await page.goto("/app-map");
    await expect(viewer(page).getByText("Harbor website").first()).toBeVisible();
    const button = page.getByTestId("app-map-fullscreen");
    const box = page.getByTestId("app-map-frame");
    const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    const covers = async () => {
      const b = (await box.locator("iframe").boundingBox())!;
      return b.width > size.w - 40 && b.height > size.h - 100;
    };
    await button.click();
    await expect(box).toHaveAttribute("data-fullscreen", "window");
    await expect(button).toHaveText("Exit full screen");
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect.poll(covers).toBe(true);
    await expect(viewer(page).locator("#ch-fullscreen")).toHaveAttribute("aria-label", "Exit full screen");
    await page.screenshot({ path: path.join(SHOTS_DIR, "app-map-window-full.png") });
    await page.keyboard.press("Escape");
    await expect(box).toHaveAttribute("data-fullscreen", "off");
    await expect(button).toHaveText("Full screen");
    await button.click();
    await expect(box).toHaveAttribute("data-fullscreen", "window");
    await button.click();
    await expect(box).toHaveAttribute("data-fullscreen", "off");
    await expect.poll(covers).toBe(false);
    // The viewer's own button, refused in the frame and on the page: the
    // window is covered too.
    const inner = page.frames().find((f) => f !== page.mainFrame() && !f.isDetached() && f.url().includes("/app-map/frame.html"))!;
    await inner.evaluate(() => {
      Element.prototype.requestFullscreen = () => Promise.reject(new TypeError("not granted"));
    });
    await box.locator("iframe").evaluate((el) => el.scrollIntoView({ block: "end" }));
    await viewer(page).locator("#ch-fullscreen").click();
    await expect(box).toHaveAttribute("data-fullscreen", "window");
    await viewer(page).locator("#ch-fullscreen").click();
    await expect(box).toHaveAttribute("data-fullscreen", "off");
  });

  test("the viewer's Full screen button works, and asks the page when the browser refuses the frame", async ({ page }) => {
    await mockBucket(page);
    await page.goto("/app-map");
    const frame = page.getByTestId("app-map-frame").locator("iframe");
    await expect(frame).toHaveAttribute("allow", "fullscreen");
    await expect(viewer(page).getByText("Harbor website").first()).toBeVisible();
    // The four-corners button fits the map, and says so.
    await expect(viewer(page).locator("#z-fit")).toHaveAttribute("aria-label", "Fit to screen");
    const button = viewer(page).locator("#ch-fullscreen");
    await expect(button).toHaveAttribute("aria-label", "Full screen");
    // The zoom buttons sit at the bottom of the map; the page scrolls to them (a click can't scroll the sandboxed frame's page for us).
    await frame.evaluate((el) => el.scrollIntoView({ block: "end" }));
    // Granted to the frame: the frame itself fills the screen.
    await button.click();
    await expect.poll(() => fullScreenOf(page)).toBe("IFRAME");
    await expect(button).toHaveAttribute("aria-label", "Exit full screen");
    await button.click();
    await expect.poll(() => fullScreenOf(page)).toBe("");
    await expect(button).toHaveAttribute("aria-label", "Full screen");
    // Refused to the frame, as a browser may: the page puts the map there.
    const inner = page.frames().find((f) => f !== page.mainFrame() && !f.isDetached() && f.url().includes("/app-map/frame.html"))!;
    await inner.evaluate(() => {
      Element.prototype.requestFullscreen = () => Promise.reject(new TypeError("not granted"));
    });
    await frame.evaluate((el) => el.scrollIntoView({ block: "end" }));
    await button.click();
    await expect.poll(() => fullScreenOf(page)).toBe("app-map-frame");
    await expect(button).toHaveAttribute("aria-label", "Exit full screen");
    await expect(page.getByTestId("app-map-fullscreen")).toHaveText("Exit full screen");
    await button.click();
    await expect.poll(() => fullScreenOf(page)).toBe("");
    await expect(button).toHaveAttribute("aria-label", "Full screen");
  });

  test("the map's title and description show above the map and follow the viewer, never over the cards", async ({ page }) => {
    await mockBucket(page);
    await page.goto("/app-map");
    await expect(viewer(page).getByText("Harbor website").first()).toBeVisible();
    const title = page.getByTestId("app-map-title");
    // The map opens on its System level (present.js), named above the map.
    await expect(title).toContainText("System");
    await expect(title.getByRole("heading")).toHaveText(HARBOR.project.name);
    await expect(viewer(page).locator("#context")).toBeHidden();
    // Opening a part: its name and description follow above the map.
    const inner = page.frames().find((f) => f !== page.mainFrame() && f.url().includes("/app-map/frame.html"))!;
    await inner.evaluate(() => {
      document.getElementById("context")!.innerHTML = '<div class="k">Service</div><h1>harbor-api</h1><p class="cd">Takes every booking.</p>';
    });
    await expect(title.getByRole("heading")).toHaveText("harbor-api");
    await expect(title).toContainText("Takes every booking.");
  });

  test("System cards are titled by their repositories, with their roles, and journeys read by repository", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, { graph: v2MapNamed() });
    await page.goto("/app-map");
    const v = viewer(page);
    const card = (name: string) => v.locator("svg .node .card").filter({ has: v.locator(".title", { hasText: new RegExp(`^${name}$`) }) });
    // One repository: its name as the title, the plain role as a small label, the description kept.
    for (const [repo, role] of [["site", "Website"], ["server", "Main server"], ["app", "Fitness mobile app"], ["app-cms", "Mobile app content editor"]]) {
      await expect(card(repo).first()).toBeVisible();
      await expect(card(repo).first().locator(".ch-role")).toHaveText(role);
    }
    await expect(card("server").first()).toContainText("Takes every booking");
    // A cloud setup made from a repository is that repository too.
    await expect(card("cloud").first().locator(".ch-role")).toHaveText("Cloud setup");
    await expect(card("server").first()).toHaveAttribute("title", "server\nMain server");
    // Not a repository: an outside service keeps its own name and has no role label.
    await expect(v.locator("svg .node .card .title", { hasText: /^Main server$/ })).toHaveCount(0);
    await expect(v.locator("svg .node .card", { hasText: "Member system" }).first().locator(".ch-role")).toHaveCount(0);
    // Journeys say which repositories they pass through.
    const row = v.locator("#ch-start [data-flow='web-sign-in']");
    await expect(row).toContainText("then server");
    await expect(row).not.toContainText("Main server");
    await expect(row).not.toContainText("Website,");
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS_DIR, "app-map-system-repo-names.png"), fullPage: true });
    // The side panel names the repository and the role.
    await card("server").first().click();
    await expect(v.locator("[data-ch-repos]")).toContainText("Main server");
    await expect(v.locator("[data-ch-repos]")).toContainText("Repository");
    // A journey's steps name the repository the step is in.
    await row.click();
    await expect(v.locator("#ch-start .js")).toContainText("server");
    await expect(v.locator("#ch-start .js")).not.toContainText("Main server");
  });
});
