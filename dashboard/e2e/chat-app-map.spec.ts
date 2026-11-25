import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Chat and the App map as one: an answer that used the app map carries the
// parts it involves and shows their mini map under it (the App map page's
// own sandboxed frame, loaded only for such an answer), with "Open in App
// map"; the App map page's Ask asks Chat and is kept with the person's chats;
// a part's "Ask about this" opens a new chat about it. The made-up harbor app
// (a website, a booking service and Stripe) is the map. Every API call is
// answered here; nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const HARBOR = JSON.parse(fs.readFileSync(path.join(__dirname, "app-map-harbor.json"), "utf8"));
const PARTS = ["api", "stripe", "web"];
const MAP = { parts: PARTS, graph: { ...HARBOR, recent: undefined, health: undefined, tour: [], flows: [], screens: [] } };
const ANSWER =
  "Booking a slip:\n\n1. The slip page on the Harbor website sends the booking to the booking service [S1].\n2. The booking service saves it and charges the card through Stripe [S1].\n3. The exact lines are in `harbor-api/src/bookings.js` [S2].";
const CITED = [
  { id: "S1", kind: "app_map", title: "Followed the screen /slips/:id on the app map", loc: "App map", as_of: "", passage: "{\"screen\":{\"url\":\"/slips/:id\"}}", href: "/app-map?focus=api,stripe,web", authoritative: false },
  {
    id: "S2",
    kind: "code",
    title: "src/bookings.js",
    loc: "harbor-api · lines 1-12",
    as_of: "",
    passage: "router.post('/slips/:id/bookings', book);",
    url: "https://github.com/harbor/harbor-api/blob/abc/src/bookings.js#L1-L12",
    authoritative: false,
    code: { repo: "harbor/harbor-api", path: "src/bookings.js", commit: "abc", start_line: 1, end_line: 12 },
  },
];
const ev = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
const iso = new Date().toISOString();

interface Db {
  asks: Record<string, unknown>[];
  threads: { id: string; title: string; shared: boolean; mine: boolean; owner_email: string; created_at: string; updated_at: string; messages: number; origin?: string }[];
  /** Whether answers use the map. */
  withMap: boolean;
  /** Journeys (the map's flows) the answer cites. */
  flows: string[];
  scripts: string[];
  frameAssets: string[];
}

async function mockApi(page: Page, init: Partial<Db> = {}): Promise<Db> {
  const db: Db = { asks: [], threads: [], withMap: true, flows: [], scripts: [], frameAssets: [], ...init };
  const map = () => (db.flows.length ? { ...MAP, flows: db.flows } : MAP);
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/app-map/")) db.frameAssets.push(u.pathname);
    if (r.resourceType() === "script" && r.frame() === page.mainFrame()) db.scripts.push(r.url());
  });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "person@example.com", avatar_url: "", role: "admin", auth_provider: "email", mfa_enabled: false });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "harbor", status: "active", current: true }] });
    if (p === "/api/app-map") return json(route, { status: { state: "ready", updating: false, step: "", note: "", floorplan: "floorplan--v0.11.0" }, graph: HARBOR });
    if (p === "/api/brain/token") return json(route, { token: "t" });
    if (p === "/api/brain/starters") return json(route, { starters: [] });
    if (p === "/api/brain/sources") return json(route, { knowledge: [], connections: [], repos: ["harbor/harbor-api", "harbor/harbor-web"], can_ask: true });
    if (p === "/api/brain/threads" && method === "GET") return json(route, { threads: db.threads, can_ask: true });
    const one = p.match(/^\/api\/brain\/threads\/([^/]+)$/);
    if (one && method === "GET") {
      const t = db.threads.find((x) => x.id === one[1]);
      if (!t) return json(route, { error: "No such thread." }, 404);
      const last = db.asks[db.asks.length - 1];
      return json(route, {
        thread: t,
        messages: [
          { seq: 0, role: "user", content: String(last?.question ?? t.title), citations: [], grounded: true, attachments: [], used: [], at: iso },
          {
            seq: 1,
            role: "assistant",
            content: db.withMap ? ANSWER : "The booking service takes the booking [S2].",
            citations: db.withMap ? CITED : [CITED[1]],
            grounded: true,
            attachments: [],
            used: [{ kind: "code", name: "map_screen", label: "Followed the screen /slips/:id on the app map", summary: "Read" }],
            at: iso,
            ...(db.withMap ? { map: map() } : {}),
          },
        ],
        can_ask: true,
      });
    }
    if (p === "/api/brain/stream" && method === "POST") {
      db.asks.push(body);
      const id = body.thread_id || (body.origin === "app_map" ? "th_map" : "th_new");
      if (!db.threads.some((t) => t.id === id)) db.threads.unshift({ id, title: body.question, shared: false, mine: true, owner_email: "person@example.com", created_at: iso, updated_at: iso, messages: 2, origin: body.origin ?? "" });
      const text = db.withMap ? ANSWER : "The booking service takes the booking [S2].";
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body:
          ev("thread", { id, title: body.question }) +
          ev("tool_start", { id: "t1", name: "map_screen", kind: "code" }) +
          ev("tool_result", { id: "t1", name: "map_screen", label: "Followed the screen /slips/:id on the app map", status: "success", summary: "Read", sources: [CITED[0]] }) +
          ev("text_delta", { text }) +
          ev("answer", { text, citations: db.withMap ? CITED : [CITED[1]], grounded: true, map: db.withMap ? map() : null }) +
          ev("done", {}),
      });
    }
    return json(route, {});
  });
  return db;
}

const box = (page: Page) => page.getByRole("textbox", { name: "Message" });
const viewer = (page: Page, testId: string) => page.getByTestId(testId).frameLocator("iframe");

async function ask(page: Page, q: string) {
  await box(page).fill(q);
  await box(page).press("Enter");
}

/** The text of every script the page itself loaded (never the frame's). */
async function pageScripts(page: Page, urls: string[]): Promise<string[]> {
  return Promise.all([...new Set(urls)].map((u) => page.evaluate((x) => fetch(x).then((r) => r.text()), u)));
}

test.describe("Chat and the App map", () => {
  test("an answer that used the map shows its mini map and opens the App map on its parts", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/chat");
    await ask(page, "What happens when someone books a slip?");
    const answer = page.getByTestId("answer").last();
    await expect(answer).toContainText("charges the card through Stripe");
    const mini = answer.getByTestId("answer-map");
    await expect(mini).toContainText("From the app map: 3 parts");
    const frame = mini.getByTestId("answer-map-frame").locator("iframe");
    await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    // The mini map shows the map itself, its details panel closed.
    await expect(frame).toHaveAttribute("src", "/app-map/frame.html#ask=host");
    await expect(viewer(page, "answer-map-frame").locator("body")).toHaveClass(/no-panel/);
    await expect(viewer(page, "answer-map-frame").getByText("Booking service").first()).toBeVisible();
    // The map is cited as a source, like any lookup.
    await expect(answer.getByTestId("answer-actions")).toBeVisible();
    await expect(answer).toContainText("App map");
    const open = mini.getByTestId("answer-map-open");
    await expect(open).toHaveAttribute("href", /^\/app-map\/?\?focus=api,stripe,web$/);
    // The saved chat shows the same mini map.
    await expect.poll(() => db.threads.length).toBe(1);
    await expect(page).toHaveURL(/thread=th_new/);
    await page.reload();
    await expect(page.getByTestId("answer-map")).toHaveCount(1);
    await expect(viewer(page, "answer-map-frame").getByText("Booking service").first()).toBeVisible();

    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByTestId("answer-map").scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS_DIR, "chat-answer-mini-map-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId("answer-map").scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS_DIR, "chat-answer-mini-map-phone.png") });
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sideways).toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 1280, height: 800 });

    // "Open in App map": the page opens on those parts.
    await page.getByTestId("answer-map-open").click();
    await expect(page).toHaveURL(/\/app-map\/?\?focus=api,stripe,web$/);
    await expect(page.getByTestId("app-map-focus")).toContainText("Opened on harbor-api, Stripe, harbor-web");
    await expect(page.getByTestId("app-map-frame").locator("iframe")).toHaveAttribute("src", "/app-map/frame.html#ask=host&tour=0&full=1&s=api");
    // The viewer opened with the part selected: its details panel is open.
    await expect(viewer(page, "app-map-frame").locator("body")).not.toHaveClass(/no-panel/);
  });

  test("an answer that follows a journey opens the App map playing it; its mini map stays the plain map", async ({ page }) => {
    await mockApi(page, { flows: ["book-slip"] });
    await page.goto("/chat");
    await ask(page, "What happens when someone books a slip?");
    const mini = page.getByTestId("answer").last().getByTestId("answer-map");
    const open = mini.getByTestId("answer-map-open");
    await expect(open).toHaveText(/Open the journey in App map/);
    await expect(open).toHaveAttribute("href", /^\/app-map\/?\?flow=book-slip$/);
    // The mini map has none of the App map page's levels, journeys or screens.
    await expect(mini.getByTestId("answer-map-frame").locator("iframe")).toHaveAttribute("src", "/app-map/frame.html#ask=host");
    await expect(viewer(page, "answer-map-frame").getByText("Booking service").first()).toBeVisible();
    await expect(viewer(page, "answer-map-frame").locator("#ch-start")).toHaveCount(0);
  });

  test("an answer without the map loads no map frame, and the chat page's own code holds no Floorplan", async ({ page }) => {
    const db = await mockApi(page, { withMap: false });
    await page.goto("/chat");
    await ask(page, "Where is the booking saved?");
    await expect(page.getByTestId("answer").last()).toContainText("The booking service takes the booking");
    await expect(page).toHaveURL(/thread=th_new/);
    await expect(page.getByTestId("answer-map")).toHaveCount(0);
    await expect(page.locator("iframe")).toHaveCount(0);
    expect(db.frameAssets).toEqual([]);
    // Nothing the page loaded carries Floorplan's viewer or layout engine.
    const texts = await pageScripts(page, db.scripts);
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      expect(t).not.toContain("FLOORPLAN_PARTS");
      expect(t).not.toContain("elkjs");
    }
    // With a map answer, the frame's chunk and the frame itself load, and
    // Floorplan's viewer only ever inside the frame.
    db.withMap = true;
    await page.keyboard.press("Control+/");
    await expect(page).toHaveURL(/\/chat\/?$/);
    await ask(page, "What happens when someone books a slip?");
    await expect(viewer(page, "answer-map-frame").getByText("Booking service").first()).toBeVisible();
    expect(db.frameAssets).toContain("/app-map/viewer.js");
    for (const t of await pageScripts(page, db.scripts)) expect(t).not.toContain("FLOORPLAN_PARTS");
  });

  test("the App map's Ask asks Chat and the question is kept with the person's chats", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/app-map");
    await page.getByLabel("Ask about the map").fill("What happens when someone books a slip?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    const answer = page.getByTestId("app-map-answer");
    await expect(answer).toContainText("charges the card through Stripe");
    await expect(answer.locator(".chat-answer ol li")).toHaveCount(3);
    await expect(viewer(page, "answer-map-frame").getByText("Booking service").first()).toBeVisible();
    expect(db.asks).toEqual([{ question: "What happens when someone books a slip?", mentions: [], attachments: [], origin: "app_map" }]);
    const cont = page.getByTestId("app-map-answer-chat");
    await expect(cont).toHaveAttribute("href", /^\/chat\/?\?thread=th_map$/);
    await page.screenshot({ path: path.join(SHOTS_DIR, "app-map-ask-in-chat.png"), fullPage: true });
    await cont.click();
    await expect(page).toHaveURL(/\/chat\/?\?thread=th_map/);
    await expect(page.getByTestId("answer").last()).toContainText("charges the card through Stripe");
    await expect(page.getByTestId("answer-map")).toHaveCount(1);
    await expect(page.getByText("What happens when someone books a slip?").first()).toBeVisible();
  });

  test("a part's Ask about this starts a chat about it, the question in the box", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/app-map");
    await expect(viewer(page, "app-map-frame").getByText("Booking service").first()).toBeVisible();
    // The viewer's "Ask about this" on the booking service, as the frame sends it.
    const inner = page.frames().find((f) => f !== page.mainFrame() && f.url().includes("/app-map/frame.html"))!;
    await inner.evaluate(() => window.parent.postMessage({ type: "floorplan:ask", items: [{ id: "api", label: "Booking service", kind: "service" }] }, "*"));
    await expect(page).toHaveURL(/\/chat\/?\?from=app_map&ask=/);
    await expect(box(page)).toHaveValue("Tell me about Booking service: what it does, what calls it and what it connects to.");
    expect(db.asks).toEqual([]);
    await box(page).press("Enter");
    await expect(page.getByTestId("answer").last()).toContainText("charges the card through Stripe");
    expect(db.asks[0]).toMatchObject({ question: "Tell me about Booking service: what it does, what calls it and what it connects to.", origin: "app_map" });
    // A follow-up in that chat is an ordinary question.
    await expect(page).toHaveURL(/thread=th_map/);
    await ask(page, "And what does Stripe do here?");
    await expect.poll(() => db.asks.length).toBe(2);
    expect(db.asks[1].origin).toBeUndefined();
  });
});
