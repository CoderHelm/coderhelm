import { expect, test, type ConsoleMessage, type Frame, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { v2Map } from "./app-map-v2-data";

// The App map's presentation (public/app-map/present.js) on a made-up map
// shaped like a large team's real one (e2e/app-map-v2-data.ts): about 4,000
// files, about 140 phone app screens, about 15 cloud resources and outside
// services, and four journeys. It checks what a person sees: the System
// board first and small, a journey found by typing and played on one board
// that doesn't move, the signed-out screens, inferred links dashed with a
// key, the image resizer connected, the biggest part opening quickly, and no
// errors in the frame. Every API call is answered here.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const MAP = v2Map();
const ARROWS = /[←-⇿⟰-⟿⤀-⥿⬀-⯿]/;

async function mockApi(page: Page, graph: unknown = MAP) {
  const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "person@example.com", avatar_url: "", role: "admin", auth_provider: "email", mfa_enabled: false });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "riverside", status: "active", current: true }] });
    if (p === "/api/app-map") return json(route, { status: { state: "ready", updating: false, step: "", note: "", floorplan: "floorplan--v0.11.0", built_at: Math.floor(Date.now() / 1000) - 600, built_repos: 10 }, graph });
    return json(route, {});
  });
}

/** Errors from the page and the map's frame (and its layout worker), as they happen. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // The dev server's own noise, never the map's.
    if (/Download the React DevTools|webpack-hmr|Fast Refresh|favicon/i.test(t)) return;
    errors.push(`${m.location().url || "page"}: ${t}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("worker", (w) => w.on("console", (m) => { if (m.type() === "error") errors.push(`worker: ${m.text()}`); }));
  return errors;
}

async function frameOf(page: Page): Promise<Frame> {
  await expect.poll(() => page.frames().some((f) => f.url().includes("/app-map/frame.html")), { timeout: 60_000 }).toBe(true);
  return page.frames().find((f) => f.url().includes("/app-map/frame.html"))!;
}

/** The viewer's state, read in the frame. */
const viewerState = (frame: Frame) =>
  frame.evaluate(() => {
    const F = (window as unknown as { Floorplan: { state: { container: string; t: { k: number }; layout: unknown; answer?: { title?: string } } } }).Floorplan;
    const CM = (window as unknown as { CoderhelmMap?: { level: () => string; journey: () => { id: string; step: number; steps: number } | null } }).CoderhelmMap;
    return { container: F.state.container, k: F.state.t.k, board: F.state.answer?.title ?? "", level: CM?.level() ?? "", journey: CM?.journey() ?? null, cards: document.querySelectorAll("#viewport g.node").length };
  });

async function open(page: Page, url = "/app-map"): Promise<{ frame: Frame; firstBoardMs: number }> {
  await mockApi(page);
  const t0 = Date.now();
  await page.goto(url);
  const frame = await frameOf(page);
  await expect(frame.locator("#viewport g.node").first()).toBeVisible({ timeout: 60_000 });
  const firstBoardMs = Date.now() - t0;
  await page.waitForTimeout(600); // the cards finish rising in
  return { frame, firstBoardMs };
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  await page.waitForTimeout(400);
  await page.getByTestId("app-map-frame").screenshot({ path: path.join(SHOTS_DIR, `${name}.png`) });
}

const timings: Record<string, number> = {};
test.afterAll(() => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(SHOTS_DIR, "app-map-present-timings.json"), JSON.stringify(timings, null, 1));
  console.log(`app-map present timings: ${JSON.stringify(timings)}`);
});

test.describe("App map presentation", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("opens on the System board: 30 cards or fewer, no tour, Journeys and Screens beside it", async ({ page }) => {
    const errors = watchErrors(page);
    const { frame, firstBoardMs } = await open(page);
    timings.firstBoardMs = firstBoardMs;
    await expect(page.getByTestId("app-map-frame").locator("iframe")).toHaveAttribute("src", "/app-map/frame.html#ask=host&tour=0&full=1");
    const st = await viewerState(frame);
    expect(st.container).toBe("q:answer");
    expect(st.level).toBe("system");
    expect(st.cards).toBeGreaterThanOrEqual(12);
    expect(st.cards).toBeLessThanOrEqual(30);
    await expect(frame.locator('#ch-start [data-lv="system"]')).toHaveAttribute("aria-pressed", "true");
    // What people use, what runs behind it, where it runs, and outside services, on one board.
    for (const name of ["Website", "Fitness mobile app", "Main server", "Main database", "Image CDN", "Member system"]) await expect(frame.locator("#viewport g.node", { hasText: name }).first()).toBeVisible();
    // Developer tools and the cloud setup's own folder stay a level down.
    await expect(frame.locator("#viewport g.node", { hasText: "Developer tools" })).toHaveCount(0);
    await expect(frame.locator("#tour")).toBeHidden();
    await expect(frame.locator("#ch-start")).toBeVisible();
    await expect(frame.locator("#ch-start h4", { hasText: "Journeys" })).toBeVisible();
    await expect(frame.locator("#ch-start h4", { hasText: "Screens" })).toBeVisible();
    // The page's title follows the board.
    await expect(page.getByTestId("app-map-title")).toContainText("System");
    await shot(page, "app-map-present-system");
    expect(errors).toEqual([]);
  });

  test("typing sign in finds the journey, which plays on one board with a numbered step list", async ({ page }) => {
    const errors = watchErrors(page);
    await page.addInitScript(() => {
      const w = window as unknown as { __opened: string[] };
      w.__opened = [];
      window.open = ((url?: string | URL) => { w.__opened.push(String(url)); return null; }) as typeof window.open;
    });
    const { frame } = await open(page);
    await frame.locator("#ch-q").fill("sign in");
    const list = frame.locator("#ch-start [data-flow]");
    await expect(list).toHaveCount(2);
    await expect(list.nth(0)).toContainText("Sign in on mobile");
    await expect(list.nth(1)).toContainText("Sign in on the website");
    // The journey's summary is in words.
    await expect(list.nth(0)).toContainText("then");
    expect(await frame.locator("#ch-start").innerText()).not.toMatch(ARROWS);
    await shot(page, "app-map-present-find-sign-in");

    const t0 = Date.now();
    await list.nth(0).click();
    await expect.poll(async () => (await viewerState(frame)).board).toBe("Sign in on mobile");
    await expect(frame.locator(".ch-step").first()).toBeAttached();
    timings.openJourneyMs = Date.now() - t0;
    const steps = frame.locator("#ch-start [data-step]");
    await expect(steps).toHaveCount(10);
    await expect(steps.nth(0)).toHaveAttribute("aria-current", "step");
    await expect(steps.nth(0)).toContainText("1");
    await page.waitForTimeout(700);
    const first = await viewerState(frame);
    expect(first.cards).toBe(10);
    // Readable at the first fit: the viewer shows cards whole from 0.65 (below it the
    // descriptions shrink to one line, and below 0.42 they go).
    expect(first.k).toBeGreaterThanOrEqual(0.65);
    timings.journeyZoom = Number(first.k.toFixed(2));
    // The board uses its space: the cards cover most of the free area in one direction or the other.
    const use = await frame.evaluate(() => {
      const F = (window as unknown as { Floorplan: { freeArea: () => { x: number; y: number; w: number; h: number } } }).Floorplan;
      const a = F.freeArea();
      const rs = Array.from(document.querySelectorAll("#viewport .node .card")).map((c) => c.getBoundingClientRect());
      const w = Math.max(...rs.map((r) => r.right)) - Math.min(...rs.map((r) => r.left));
      const h = Math.max(...rs.map((r) => r.bottom)) - Math.min(...rs.map((r) => r.top));
      return { w: w / a.w, h: h / a.h };
    });
    expect(Math.max(use.w, use.h)).toBeGreaterThan(0.7);
    timings.journeyAreaUsed = Number(Math.max(use.w, use.h).toFixed(2));
    // Each step says where it is in the code, and opens it on GitHub.
    await expect(frame.locator("#ch-start button.ev").first()).toContainText(/app\/src\/screens\/auth\/SignInLanding\.tsx:12/);
    await shot(page, "app-map-present-journey-step1");

    // Next and Back light the steps on the same board: nothing is laid out again.
    const layoutBefore = await frame.evaluate(() => { const w = window as unknown as { Floorplan: { state: { layout: unknown } }; __layout?: unknown }; w.__layout = w.Floorplan.state.layout; return true; });
    expect(layoutBefore).toBe(true);
    const nav = frame.locator("#ch-start .nav");
    for (let i = 0; i < 4; i++) {
      const s0 = Date.now();
      await nav.getByRole("button", { name: "Next" }).click();
      await expect(frame.locator("#ch-start [data-step]").nth(i + 1)).toHaveAttribute("aria-current", "step");
      timings.stepMs = Math.max(timings.stepMs ?? 0, Date.now() - s0);
    }
    expect(await frame.evaluate(() => { const w = window as unknown as { Floorplan: { state: { layout: unknown } }; __layout?: unknown }; return w.Floorplan.state.layout === w.__layout; })).toBe(true);
    expect((await viewerState(frame)).journey).toEqual({ id: "mobile-sign-in", step: 4, steps: 10 });
    await expect(frame.locator("#viewport g.node.ch-now")).toHaveCount(1);
    await expect(frame.locator("#viewport g.node.ch-seen")).toHaveCount(5);
    await expect(frame.locator(".ch-step.seen")).toHaveCount(3);
    await expect(frame.locator(".ch-step.now")).toHaveCount(1);
    // The member system's sign-in API was joined by an env var: that step's line is dashed.
    await expect(frame.locator(".ch-step.inferred")).not.toHaveCount(0);
    await shot(page, "app-map-present-journey-step5");
    await nav.getByRole("button", { name: "Back" }).click();
    await expect(frame.locator("#ch-start [data-step]").nth(3)).toHaveAttribute("aria-current", "step");
    await frame.locator("#ch-start button.ev").nth(3).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened)).toEqual([
      "https://github.com/riverside-example/server/blob/5555555555555555555555555555555555555555/src/member-signin/signin-proxy.module.ts#L31",
    ]);
    expect(await frame.locator("#ch-start").innerText()).not.toMatch(ARROWS);
    // All journeys: back to the list and the System board.
    await frame.locator("#ch-start [data-back]").click();
    await expect.poll(async () => (await viewerState(frame)).level).toBe("system");
    await expect(frame.locator(".ch-step")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("screens by app: signed out first, then signed in, by group", async ({ page }) => {
    const { frame } = await open(page);
    const mobile = frame.locator('#ch-start details[data-app="mobile"]');
    await mobile.locator("summary").first().click();
    await expect(mobile.locator("summary").first()).toContainText("141");
    const gates = mobile.locator(".gate");
    await expect(gates.nth(0)).toHaveText("Signed out (4)");
    await expect(gates.nth(1)).toHaveText("Signed in (137)");
    const out = mobile.locator('details[data-group="signed_out|Signing in"]');
    await out.locator("summary").click();
    await expect(out.locator("[data-sc]")).toHaveCount(4);
    await expect(out.locator("[data-sc]").nth(1)).toContainText("Sign In Landing");
    await shot(page, "app-map-present-screens-signed-out");
    // Search reaches inside the groups.
    await frame.locator("#ch-q").fill("forgot");
    await expect(frame.locator("#ch-start [data-sc]")).toHaveCount(1);
    await frame.locator("#ch-start [data-sc]").click();
    await expect.poll(async () => (await viewerState(frame)).board).toBe("Forgot Password");
  });

  test("inferred links are dashed, with a key; found in code stays solid", async ({ page }) => {
    const { frame } = await open(page);
    await expect(frame.locator("#ch-key")).toContainText("Found in code");
    await expect(frame.locator("#ch-key")).toContainText("Inferred");
    const dashes = await frame.evaluate(() => Array.from(document.querySelectorAll("#viewport .edges .edge")).filter((g) => g.querySelector(".trace")).map((g) => ({ inferred: g.classList.contains("ch-inferred"), dash: getComputedStyle(g.querySelector(".trace")!).strokeDasharray })));
    const inferred = dashes.filter((d) => d.inferred);
    expect(inferred.length).toBeGreaterThan(0);
    expect(inferred.every((d) => d.dash !== "none")).toBe(true);
    expect(dashes.some((d) => !d.inferred && d.dash === "none")).toBe(true);
  });

  test("the image resizer is connected on the System board", async ({ page }) => {
    const { frame } = await open(page);
    const pairs = await frame.evaluate(() => {
      const F = (window as unknown as { Floorplan: { state: { edgeEls: Map<string, { e: { a: string; b: string; k: string } }> } } }).Floorplan;
      return Array.from(F.state.edgeEls.values()).map((x) => `${x.e.a} ${x.e.k} ${x.e.b}`);
    });
    expect(pairs).toContain("n:web http n:cdn-images");
    expect(pairs).toContain("n:cdn-images trigger n:fn-resizer");
    expect(pairs).toContain("n:fn-resizer trigger n:lambdas");
    expect(pairs).toContain("n:lambdas deploy n:fn-resizer");
    await frame.locator("#viewport g.node", { hasText: "Image resizer function" }).first().click();
    await shot(page, "app-map-present-system-resizer");
  });

  test("Parts and Code: the viewer's parts, then the biggest part opened in under 2 seconds", async ({ page }) => {
    const errors = watchErrors(page);
    const { frame } = await open(page);
    await frame.locator('#ch-start [data-lv="parts"]').click();
    await expect.poll(async () => (await viewerState(frame)).container).toBe("root");
    await expect(frame.locator('#ch-start [data-lv="parts"]')).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(500);
    const ms = await frame.evaluate(
      () =>
        new Promise<number>((done) => {
          const w = window as unknown as { Floorplan: { on: (e: string, f: (d: { container: string }) => void) => void }; CoderhelmMap: { setLevel: (l: string) => void } };
          const t0 = performance.now();
          w.Floorplan.on("render", (d) => { if (d.container === "n:web") requestAnimationFrame(() => requestAnimationFrame(() => done(performance.now() - t0))); });
          w.CoderhelmMap.setLevel("code");
        }),
    );
    timings.biggestPartMs = Math.round(ms);
    expect(ms).toBeLessThan(2000);
    await expect(frame.locator('#ch-start [data-lv="code"]')).toHaveAttribute("aria-pressed", "true");
    // The layouts ran in the frame's worker, not on its main thread.
    expect(await frame.evaluate(() => (window as unknown as { __coderhelmElkRan?: string }).__coderhelmElkRan)).toBe("worker");
    await shot(page, "app-map-present-code");
    expect(errors).toEqual([]);
  });

  test("?flow= opens that journey; an unknown one says so and shows the System board", async ({ page }) => {
    const { frame } = await open(page, "/app-map?flow=image-resize");
    await expect(page.getByTestId("app-map-flow")).toContainText("Opened on the journey Show a resized image");
    await expect(page.getByTestId("app-map-frame").locator("iframe")).toHaveAttribute("src", "/app-map/frame.html#ask=host&tour=0&full=1&flow=image-resize");
    await expect.poll(async () => (await viewerState(frame)).journey).toEqual({ id: "image-resize", step: 0, steps: 5 });
    await shot(page, "app-map-present-flow-link");
    // A hidden journey never shows, and an unknown id falls back to the System board.
    const p2 = await page.context().newPage();
    const r2 = await open(p2, "/app-map?flow=draft-checkout");
    await expect(p2.getByTestId("app-map-flow")).toContainText("not on this map any more");
    await expect.poll(async () => (await viewerState(r2.frame)).level).toBe("system");
    await expect(r2.frame.locator("#ch-start [data-flow]")).toHaveCount(4);
  });

  test("on a phone the panel waits behind its button and nothing scrolls sideways", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { frame } = await open(page);
    await expect(frame.locator("#ch-start")).toBeHidden();
    await frame.locator("#ch-browse").click();
    await expect(frame.locator("#ch-start")).toBeVisible();
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sideways).toBeLessThanOrEqual(1);
    await shot(page, "app-map-present-phone");
  });
});
