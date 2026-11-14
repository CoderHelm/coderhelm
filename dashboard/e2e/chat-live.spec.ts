import { expect, test, type Page, type Route } from "@playwright/test";

// Chat while an answer streams in token by token: the reader keeps the place
// they scrolled to, the page follows only while they sit at the bottom, a
// "Jump to latest" button brings them back, and the page never reloads on its
// own (a new build, a new chat, an id in another case, a stream that breaks).
// The stream is fed by the spec one piece at a time through a stand-in for
// fetch; every other API call is answered here. Nothing reaches a backend.

const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString();
const ev = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
const NONE = { knowledge: [], connections: false, code: false, memories: false, data_sources: false, skills: false };

const PARA = "Deploys go out through the release pipeline, which builds every package, runs the checks and then rolls the new version out one region at a time while watching the error rate.";
const longAnswer = (n: number) => Array.from({ length: 6 }, (_, i) => `Part ${n}.${i + 1}. ${PARA}`).join("\n\n");

interface Backend {
  /** Thread ids the API knows, as the API spells them. */
  threads: { id: string; title: string }[];
  /** Exchanges per thread (canonical id). */
  turns: Record<string, number>;
  /** Exchanges saved by asks in this test, after the ones above. */
  added: Record<string, { question: string; answer: string }[]>;
}

const thread = (id: string, title: string) => ({
  id,
  title,
  shared: false,
  mine: true,
  owner_email: "admin@example.com",
  created_at: iso(60),
  updated_at: iso(60),
  messages: 2,
});

function exchange(turns: number, added: { question: string; answer: string }[] = []) {
  const all = [
    ...Array.from({ length: turns }, (_, i) => ({ question: `Question ${i + 1}: how do deploys work?`, answer: longAnswer(i + 1) })),
    ...added,
  ];
  return all.flatMap((t, i) => [
    { seq: i * 2, role: "user", content: t.question, citations: [], grounded: true, sources: NONE, mentions: [], attachments: [], used: [], at: iso(30) },
    { seq: i * 2 + 1, role: "assistant", content: t.answer, citations: [], grounded: true, attachments: [], used: [], at: iso(30) },
  ]);
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = {
    threads: [
      { id: "th_long", title: "How do deploys work?" },
      { id: "th_old", title: "Which services call the billing API?" },
      { id: "TH_CASE", title: "An id the API spells in capitals" },
    ],
    turns: { th_long: 8, th_old: 1, TH_CASE: 1 },
    added: {},
    ...init,
  };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const p = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/brain/token") return json(route, { token: "t" });
    if (p === "/api/brain/starters") return json(route, { starters: [] });
    if (p === "/api/brain/sources") return json(route, { knowledge: [], connections: [], repos: [], repositories: [], can_ask: true });
    if (p === "/api/brain/threads" && method === "GET") return json(route, { threads: db.threads.map((t) => thread(t.id, t.title)), can_ask: true });
    const one = p.match(/^\/api\/brain\/threads\/([^/]+)$/);
    if (one) {
      // The API finds a thread whatever the case of its id, and answers with its own spelling.
      const t = db.threads.find((x) => x.id.toLowerCase() === decodeURIComponent(one[1]).toLowerCase());
      if (!t) return json(route, { error: "No such thread." }, 404);
      return json(route, { thread: thread(t.id, t.title), messages: exchange(db.turns[t.id] ?? 0, db.added[t.id]), can_ask: true });
    }
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  // The answer stream: the spec pushes each piece, ends it or breaks it.
  await page.addInitScript(() => {
    type Feed = { push: (s: string) => void; end: () => void; fail: () => void };
    const w = window as unknown as { __feeds: Feed[]; __asks: unknown[] };
    w.__feeds = [];
    w.__asks = [];
    const real = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith("/api/brain/stream")) return real(input, init);
      w.__asks.push(JSON.parse(String(init?.body ?? "{}")));
      const enc = new TextEncoder();
      let ctl!: ReadableStreamDefaultController<Uint8Array>;
      let open = true;
      const body = new ReadableStream<Uint8Array>({ start: (c) => void (ctl = c) });
      const close = (fn: () => void) => {
        if (!open) return;
        open = false;
        fn();
      };
      w.__feeds.push({
        push: (s) => open && ctl.enqueue(enc.encode(s)),
        end: () => close(() => ctl.close()),
        fail: () => close(() => ctl.error(new TypeError("network error"))),
      });
      init?.signal?.addEventListener("abort", () => close(() => ctl.error(new DOMException("Aborted", "AbortError"))));
      return Promise.resolve(new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }));
    };
  });
  return db;
}

/** Waits for the next answer stream to open, then returns how to feed it. */
async function feed(page: Page, n: number) {
  await expect.poll(() => page.evaluate(() => (window as unknown as { __feeds: unknown[] }).__feeds.length)).toBeGreaterThanOrEqual(n);
  const call = (fn: "push" | "end" | "fail", s = "") =>
    page.evaluate(([i, f, x]) => (window as unknown as { __feeds: Record<string, (s: string) => void>[] }).__feeds[i as number][f as string](x as string), [n - 1, fn, s]);
  return {
    push: (type: string, data: unknown) => call("push", ev(type, data)),
    text: (t: string) => call("push", ev("text_delta", { text: t })),
    end: () => call("end"),
    fail: () => call("fail"),
  };
}

/** Counts loads of the page itself and marks the window, so any reload shows. */
async function watchReloads(page: Page) {
  const loads = { n: 0 };
  page.on("request", (req) => {
    if (req.resourceType() === "document") loads.n += 1;
  });
  return {
    mark: () => page.evaluate(() => ((window as unknown as { __same: boolean }).__same = true)),
    expectNone: async () => {
      expect(loads.n, "the page loaded again").toBe(1);
      expect(await page.evaluate(() => (window as unknown as { __same?: boolean }).__same === true), "the window was replaced").toBe(true);
    },
  };
}

/** A release went out: every file of the build this tab runs is gone. */
async function newBuildDeployed(page: Page) {
  await page.route(/\/_next\/static\//, (route) => route.fulfill({ status: 404, contentType: "text/html", body: "<!DOCTYPE html><title>Not Found</title>" }));
  await page.route(/\.txt(\?|$)|[?&]_rsc=/, (route) => route.fulfill({ status: 404, contentType: "text/html", body: "<!DOCTYPE html><title>Not Found</title>" }));
}

const box = (page: Page) => page.getByRole("textbox", { name: "Message" });
const scroller = (page: Page) => page.getByTestId("chat-scroll");
const metrics = (page: Page) =>
  scroller(page).evaluate((el) => ({ top: el.scrollTop, gap: el.scrollHeight - el.clientHeight - el.scrollTop }));

/** Waits until the scroll position stops moving (a keyboard scroll animates). */
async function settled(page: Page) {
  let last = -1;
  await expect
    .poll(async () => {
      const now = (await metrics(page)).top;
      const same = now === last;
      last = now;
      return same;
    }, { intervals: [100] })
    .toBe(true);
  return (await metrics(page)).top;
}

async function openLong(page: Page) {
  await page.goto("/chat?thread=th_long");
  await expect(page.getByTestId("answer")).toHaveCount(8);
  await expect.poll(async () => (await metrics(page)).gap).toBeLessThanOrEqual(2);
}

async function ask(page: Page, q: string, n: number) {
  await box(page).fill(q);
  await box(page).press("Enter");
  const f = await feed(page, n);
  await f.push("thread", { id: "th_long", title: "How do deploys work?" });
  return f;
}

/** Streams `count` paragraphs a few words at a time. */
async function streamParagraphs(f: Awaited<ReturnType<typeof feed>>, from: number, count: number) {
  let all = "";
  for (let i = from; i < from + count; i++) {
    const words = `Streamed ${i}. ${PARA}`.split(" ");
    for (let w = 0; w < words.length; w += 8) {
      const piece = `${words.slice(w, w + 8).join(" ")} `;
      all += piece;
      await f.text(piece);
    }
    all += "\n\n";
    await f.text("\n\n");
  }
  return all;
}

for (const size of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "phone", width: 390, height: 844 },
]) {
  test.describe(`chat scroll while streaming (${size.name})`, () => {
    let db: Backend;
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      db = await mockApi(page);
    });

    test("at the bottom the answer is followed to its end", async ({ page }) => {
      await openLong(page);
      const f = await ask(page, "And rollbacks?", 1);
      await streamParagraphs(f, 1, 8);
      await expect.poll(async () => (await metrics(page)).gap).toBeLessThanOrEqual(2);
      await expect(page.getByRole("button", { name: "Jump to latest" })).toHaveCount(0);
      await f.end();
    });

    test("scrolled up, the reader keeps their place; Jump to latest brings them back and following resumes", async ({ page }) => {
      await openLong(page);
      const f = await ask(page, "And rollbacks?", 1);
      await streamParagraphs(f, 1, 3);
      await scroller(page).hover();
      await page.mouse.wheel(0, -700);
      await expect.poll(async () => (await metrics(page)).gap).toBeGreaterThan(600);
      const before = (await metrics(page)).top;
      await streamParagraphs(f, 4, 6);
      expect(Math.abs((await metrics(page)).top - before)).toBeLessThanOrEqual(1);
      const jump = page.getByRole("button", { name: "Jump to latest" });
      await expect(jump).toBeVisible();
      await jump.click();
      await expect.poll(async () => (await metrics(page)).gap).toBeLessThanOrEqual(2);
      await expect(jump).toHaveCount(0);
      await streamParagraphs(f, 10, 3);
      await expect.poll(async () => (await metrics(page)).gap).toBeLessThanOrEqual(2);
      await f.end();
    });

    test("a small scroll up near the bottom also stops following", async ({ page }) => {
      await openLong(page);
      const f = await ask(page, "And rollbacks?", 1);
      await streamParagraphs(f, 1, 3);
      await scroller(page).hover();
      await page.mouse.wheel(0, -30);
      await expect.poll(async () => (await metrics(page)).gap).toBeGreaterThan(10);
      const before = (await metrics(page)).top;
      await streamParagraphs(f, 4, 4);
      expect(Math.abs((await metrics(page)).top - before)).toBeLessThanOrEqual(1);
      // Scrolling back down to the end resumes following.
      await page.mouse.wheel(0, 5000);
      await expect.poll(async () => (await metrics(page)).gap).toBeLessThanOrEqual(2);
      await streamParagraphs(f, 8, 3);
      await expect.poll(async () => (await metrics(page)).gap).toBeLessThanOrEqual(2);
      await f.end();
    });

    test("a keyboard scroll counts as the reader's own", async ({ page }) => {
      await openLong(page);
      const f = await ask(page, "And rollbacks?", 1);
      await streamParagraphs(f, 1, 3);
      await scroller(page).focus();
      await page.keyboard.press("PageUp");
      await expect.poll(async () => (await metrics(page)).gap).toBeGreaterThan(200);
      const before = await settled(page);
      await streamParagraphs(f, 4, 4);
      expect(Math.abs((await metrics(page)).top - before)).toBeLessThanOrEqual(1);
      await expect(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
      await f.end();
    });

    test("the end of the answer doesn't move a reader who scrolled up", async ({ page }) => {
      await openLong(page);
      const f = await ask(page, "And rollbacks?", 1);
      await f.push("tool_start", { id: "tu1", name: "search_knowledge", kind: "knowledge" });
      await f.push("tool_result", { id: "tu1", name: "search_knowledge", label: "Searched knowledge", kind: "knowledge", status: "success", summary: "1 passage", sources: [] });
      const text = await streamParagraphs(f, 1, 8);
      await scroller(page).hover();
      await page.mouse.wheel(0, -500);
      await expect.poll(async () => (await metrics(page)).gap).toBeGreaterThan(400);
      // The paragraph at the top of the reader's view, and where it sits.
      const spot = () =>
        scroller(page).evaluate((el) => {
          const top = el.getBoundingClientRect().top;
          const ps = [...el.querySelectorAll("[data-testid=answer] p")];
          const p = ps.find((x) => x.getBoundingClientRect().bottom > top + 40)!;
          return { text: p.textContent?.slice(0, 40), y: Math.round(p.getBoundingClientRect().top - top) };
        });
      const before = await spot();
      db.added.th_long = [{ question: "And rollbacks?", answer: text.trim() }];
      await f.push("answer", { text: text.trim(), citations: [], grounded: true });
      await f.push("done", {});
      await f.end();
      await expect(page.getByTestId("answer").last().getByTestId("answer-actions")).toBeVisible();
      await page.waitForTimeout(300);
      const after = await spot();
      expect(after.text).toBe(before.text);
      expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2);
    });

    test("sending a message scrolls to the bottom once", async ({ page }) => {
      await openLong(page);
      await scroller(page).evaluate((el) => (el.scrollTop = 0));
      await expect.poll(async () => (await metrics(page)).top).toBe(0);
      await box(page).fill("And rollbacks?");
      await box(page).press("Enter");
      await expect.poll(async () => (await metrics(page)).gap).toBeLessThanOrEqual(2);
      const f = await feed(page, 1);
      await streamParagraphs(f, 1, 4);
      await expect.poll(async () => (await metrics(page)).gap).toBeLessThanOrEqual(2);
      await f.end();
    });
  });
}

test.describe("chat never reloads on its own", () => {
  let db: Backend;
  test.beforeEach(async ({ page }) => {
    db = await mockApi(page);
  });

  test("a full stream, first token to done, in an open chat after a new build went out", async ({ page }) => {
    const reloads = await watchReloads(page);
    await page.goto("/chat?thread=th_old");
    await expect(page.getByTestId("answer")).toHaveCount(1);
    await reloads.mark();
    await newBuildDeployed(page);
    await box(page).fill("Show me the deploy script");
    await box(page).press("Enter");
    const f = await feed(page, 1);
    await f.push("thread", { id: "th_old", title: "Which services call the billing API?" });
    await f.text("Here it is:\n\n```python\n");
    await f.text("def deploy(region):\n    rollout(region)\n");
    await f.text("```\n\nAnd as YAML:\n\n```yaml\nregions: [us, eu]\n```\n");
    db.added.th_old = [{ question: "Show me the deploy script", answer: "Here it is:\n\n```python\ndef deploy(region):\n    rollout(region)\n```\n\nAnd as YAML:\n\n```yaml\nregions: [us, eu]\n```" }];
    await f.push("done", {});
    await f.end();
    await expect(page.getByTestId("answer-actions")).toHaveCount(2);
    await page.waitForTimeout(1500);
    await reloads.expectNone();
    // The new version is offered, not forced.
    await expect(page.getByTestId("update-ready")).toBeVisible();
    await expect(page.getByTestId("update-ready").getByRole("button", { name: "Reload" })).toBeVisible();
  });

  test("a new chat gets its address without reloading, even after a new build went out", async ({ page }) => {
    const reloads = await watchReloads(page);
    await page.goto("/chat");
    await expect(box(page)).toBeVisible();
    await reloads.mark();
    await newBuildDeployed(page);
    await box(page).fill("How do deploys work?");
    await box(page).press("Enter");
    const f = await feed(page, 1);
    await f.push("thread", { id: "th_long", title: "How do deploys work?" });
    await f.text("They roll out region by region.");
    db.added.th_long = [{ question: "How do deploys work?", answer: "They roll out region by region." }];
    await f.push("done", {});
    await f.end();
    await expect(page).toHaveURL(/[?&]thread=th_long\b/);
    await expect(page.getByTestId("answer").first()).toBeVisible();
    await page.waitForTimeout(1000);
    await reloads.expectNone();
  });

  test("an id in the address in another case is settled without reloading, and a stream in it too", async ({ page }) => {
    const reloads = await watchReloads(page);
    await page.goto("/chat?thread=th_case");
    await expect(page.getByTestId("answer")).toHaveCount(1);
    await expect(page).toHaveURL(/[?&]thread=TH_CASE\b/);
    await reloads.mark();
    await newBuildDeployed(page);
    await box(page).fill("And again?");
    await box(page).press("Enter");
    const f = await feed(page, 1);
    const asked = await page.evaluate(() => (window as unknown as { __asks: { thread_id?: string }[] }).__asks[0]);
    expect(asked.thread_id).toBe("TH_CASE");
    await f.push("thread", { id: "TH_CASE", title: "An id the API spells in capitals" });
    await f.text("Same answer.");
    db.added.TH_CASE = [{ question: "And again?", answer: "Same answer." }];
    await f.push("done", {});
    await f.end();
    await expect(page.getByTestId("answer-actions").first()).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/[?&]thread=TH_CASE\b/);
    await reloads.expectNone();
  });

  test("a stream that breaks part way shows an error and keeps the page", async ({ page }) => {
    const reloads = await watchReloads(page);
    await page.goto("/chat?thread=th_old");
    await expect(page.getByTestId("answer")).toHaveCount(1);
    await reloads.mark();
    await box(page).fill("Half an answer?");
    await box(page).press("Enter");
    const f = await feed(page, 1);
    await f.push("thread", { id: "th_old", title: "Which services call the billing API?" });
    await f.text("The first half of the answer arrives, then ");
    await f.fail();
    await expect(page.getByRole("alert").or(page.locator("[data-variant=error]")).or(page.getByText(/No answer came back|network error/i)).first()).toBeVisible();
    await page.waitForTimeout(1000);
    await reloads.expectNone();
    // The box works again.
    await box(page).fill("Try again");
    await expect(box(page)).toHaveValue("Try again");
  });

  test("an unsent draft is kept per chat, across chats and a reload", async ({ page }) => {
    await page.goto("/chat?thread=th_long");
    await expect(page.getByTestId("answer")).toHaveCount(8);
    await box(page).fill("A half-written question about rollbacks");
    await page.getByRole("link", { name: "Which services call the billing API?" }).first().click();
    await expect(page).toHaveURL(/thread=th_old/);
    await expect(page.getByTestId("answer")).toHaveCount(1);
    await expect(box(page)).toHaveValue("");
    await box(page).fill("Another draft");
    await page.getByRole("link", { name: "How do deploys work?" }).first().click();
    await expect(page.getByTestId("answer")).toHaveCount(8);
    await expect(box(page)).toHaveValue("A half-written question about rollbacks");
    await page.reload();
    await expect(page.getByTestId("answer")).toHaveCount(8);
    await expect(box(page)).toHaveValue("A half-written question about rollbacks");
  });
});
