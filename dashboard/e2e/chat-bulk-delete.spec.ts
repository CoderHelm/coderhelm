import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Deleting several chats at once from the chat list: select mode (the Select
// button, a chat's menu, Shift-click or Cmd-click), Select all within the
// search, one question before deleting, the open chat replaced by a new one,
// a partial failure that keeps the failed chats selected, Escape, and the
// phone layout. Also the shared yes/no dialog: no empty band between its text
// and its buttons. Every API call is answered here; nothing reaches a backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

interface Thread {
  id: string;
  title: string;
  shared: boolean;
  mine: boolean;
  owner_email: string;
  created_at: string;
  updated_at: string;
  messages: number;
  pinned?: boolean;
}

const thread = (id: string, title: string, minsAgo: number, over: Partial<Thread> = {}): Thread => ({
  id,
  title,
  shared: false,
  mine: true,
  owner_email: "admin@example.com",
  created_at: iso(minsAgo),
  updated_at: iso(minsAgo),
  messages: 2,
  ...over,
});

const DAY = 60 * 24;
const THREADS = () => [
  thread("th_a", "Which services call the billing API?", 30),
  thread("th_b", "How do refunds reach the ledger?", 3 * DAY),
  thread("th_c", "Where is the billing retry set?", 4 * DAY),
  thread("th_d", "What does the deploy script check?", 12 * DAY),
  thread("th_shared", "What is the deploy freeze?", 2 * DAY, { shared: true, mine: false, owner_email: "dana@example.com" }),
];

interface Backend {
  calls: string[];
  bulkBodies: string[][];
  threads: Thread[];
  /** Ids the bulk delete refuses. */
  failing: string[];
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { calls: [], bulkBodies: [], threads: THREADS(), failing: [], ...init };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    db.calls.push(`${method} ${p}`);
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/brain/starters") return json(route, { starters: [] });
    if (p === "/api/brain/sources") {
      return json(route, { knowledge: [{ id: "kb_hr", name: "HR handbook", ready: 1, authoritative: true }], connections: [], repos: [], repositories: [], can_ask: true });
    }
    if (p === "/api/brain/threads" && method === "GET") return json(route, { threads: db.threads, can_ask: true });
    if (p === "/api/brain/threads/delete" && method === "POST") {
      const ids: string[] = body.ids;
      db.bulkBodies.push(ids);
      const results = ids.map((id) => {
        const t = db.threads.find((x) => x.id === id);
        if (!t) return { id, ok: false, error: "No such chat." };
        if (!t.mine) return { id, ok: false, error: "Only the person who started a chat can delete it." };
        if (db.failing.includes(id)) return { id, ok: false, error: "Something went wrong. Try again." };
        return { id, ok: true };
      });
      db.threads = db.threads.filter((t) => !results.some((r) => r.ok && r.id === t.id));
      return json(route, { results, deleted: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
    }
    const one = p.match(/^\/api\/brain\/threads\/([^/]+)$/);
    if (one && method === "GET") {
      const t = db.threads.find((x) => x.id === one[1]);
      if (!t) return json(route, { error: "No such thread." }, 404);
      return json(route, {
        thread: t,
        messages: [
          { seq: 0, role: "user", content: t.title, citations: [], grounded: true, attachments: [], used: [], at: t.updated_at },
          { seq: 1, role: "assistant", content: "From the code, it is the billing worker.", citations: [], grounded: false, attachments: [], used: [], at: t.updated_at },
        ],
        can_ask: t.mine,
      });
    }
    if (one && method === "DELETE") {
      db.threads = db.threads.filter((x) => x.id !== one[1]);
      return json(route, { ok: true });
    }
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

const rail = (page: Page) => page.getByTestId("thread-rail");
const check = (scope: Locator, title: RegExp | string) => scope.getByRole("checkbox", { name: title });

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`) });
}

/**
 * The shared yes/no dialog has no empty band: nothing taller than the usual
 * gap between its text and its buttons, and at most one rule across it there.
 */
async function noEmptyBand(dialog: Locator) {
  const m = await dialog.evaluate((el) => {
    const desc = el.querySelector("h2 ~ p")!.getBoundingClientRect();
    const btn = Array.from(el.querySelectorAll("[data-modal-footer] button")).map((b) => b.getBoundingClientRect().top);
    const buttonsTop = Math.min(...btn);
    // Horizontal rules: the top or bottom border of any element in the dialog.
    const rules: number[] = [];
    for (const n of Array.from(el.querySelectorAll<HTMLElement>("*"))) {
      const s = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      if (!r.width || s.display === "none" || n.closest("button")) continue;
      const seen = (w: string, c: string) => parseFloat(w) > 0 && !/rgba\(.*,\s*0\)$|transparent/.test(c);
      if (seen(s.borderTopWidth, s.borderTopColor)) rules.push(r.top);
      if (seen(s.borderBottomWidth, s.borderBottomColor)) rules.push(r.bottom);
    }
    const between = rules.filter((y) => y > desc.bottom - 1 && y < buttonsTop - 1);
    const body = el.querySelector<HTMLElement>("[data-modal-body]");
    return { gap: buttonsTop - desc.bottom, rules: between.length, bodyHeight: body ? body.getBoundingClientRect().height : 0 };
  });
  expect(m.bodyHeight, "an empty body takes no room").toBe(0);
  expect(m.rules, "one rule at most between the text and the buttons").toBeLessThanOrEqual(1);
  expect(m.gap, "no empty band between the text and the buttons").toBeLessThan(48);
}

test.describe("chat: deleting several chats", () => {
  test("Select, pick three, delete them with one question", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/chat");
    const list = rail(page);
    await expect(list.getByTestId("thread-row")).toHaveCount(5);
    await expect(list.getByRole("checkbox")).toHaveCount(0);

    await list.getByRole("button", { name: "Select", exact: true }).click();
    // Every chat of yours has a labelled checkbox; a teammate's shared chat has none.
    await expect(list.getByTestId("thread-check")).toHaveCount(4);
    await expect(check(list, "What is the deploy freeze?")).toHaveCount(0);
    await expect(list.getByTestId("select-all")).toBeFocused();
    await expect(list.getByTestId("delete-selected")).toBeDisabled();

    await check(list, "Which services call the billing API?").check();
    // Keyboard: Tab to the next checkbox and Space picks it.
    await page.keyboard.press("Tab");
    await expect(check(list, "How do refunds reach the ledger?")).toBeFocused();
    await page.keyboard.press("Space");
    await check(list, "What does the deploy script check?").check();
    await expect(list.getByTestId("select-count")).toHaveText("3 selected");
    await shot(page, "bulk-select-1280");

    await list.getByTestId("delete-selected").click();
    const dialog = page.getByTestId("confirm-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Delete 3 chats?" })).toBeVisible();
    await expect(dialog).toContainText("This can't be undone.");
    // The question opens on Cancel, the safe choice.
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await shot(page, "bulk-confirm-1280");
    await noEmptyBand(dialog);
    await dialog.getByRole("button", { name: "Delete 3 chats" }).click();

    await expect(list.getByTestId("thread-row")).toHaveCount(2);
    await expect(list).toContainText("Where is the billing retry set?");
    await expect(list).toContainText("What is the deploy freeze?");
    // One request for all three, never a delete per chat from the browser.
    expect(db.bulkBodies).toEqual([["th_a", "th_b", "th_d"]]);
    expect(db.calls.filter((c) => c.startsWith("DELETE "))).toEqual([]);
    // Done: select mode closes and focus goes back to Select.
    await expect(list.getByRole("checkbox")).toHaveCount(0);
    await expect(list.getByTestId("select-chats")).toBeFocused();
    await expect(page.getByText("3 chats deleted")).toBeVisible();
  });

  test("Cancel in the question deletes nothing and keeps the selection", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/chat");
    const list = rail(page);
    await list.getByTestId("select-chats").click();
    await check(list, "Which services call the billing API?").check();
    await list.getByTestId("delete-selected").click();
    await page.getByTestId("confirm-dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("confirm-dialog")).toBeHidden();
    await expect(check(list, "Which services call the billing API?")).toBeChecked();
    expect(db.bulkBodies).toEqual([]);
  });

  test("Select all takes only what the search shows", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/chat");
    const list = rail(page);
    await page.getByTestId("thread-search").fill("billing");
    await list.getByTestId("select-chats").click();
    await list.getByTestId("select-all").check();
    await expect(list.getByTestId("select-count")).toHaveText("2 selected");
    // Clearing the search keeps the two and shows the rest unpicked.
    await page.getByTestId("thread-search").fill("");
    await expect(check(list, "How do refunds reach the ledger?")).not.toBeChecked();
    await expect(list.getByTestId("select-all")).not.toBeChecked();
    await list.getByTestId("delete-selected").click();
    await expect(page.getByTestId("confirm-dialog").getByRole("heading", { name: "Delete 2 chats?" })).toBeVisible();
    await page.getByTestId("confirm-dialog").getByRole("button", { name: "Delete 2 chats" }).click();
    await expect(list.getByTestId("thread-row")).toHaveCount(3);
    expect(db.bulkBodies).toEqual([["th_a", "th_c"]]);
  });

  test("Shift-click or Cmd-click on a chat, or Select in its menu, starts selecting", async ({ page }) => {
    await mockApi(page);
    await page.goto("/chat");
    const list = rail(page);

    await list.getByRole("link", { name: /refunds reach/ }).click({ modifiers: ["Shift"] });
    await expect(page).not.toHaveURL(/thread=/);
    await expect(check(list, "How do refunds reach the ledger?")).toBeChecked();
    await expect(check(list, "How do refunds reach the ledger?")).toBeFocused();
    // Shift-click on another checkbox takes the run between them.
    await check(list, "What does the deploy script check?").click({ modifiers: ["Shift"] });
    await expect(list.getByTestId("select-count")).toHaveText("3 selected");
    await page.keyboard.press("Escape");
    await expect(list.getByRole("checkbox")).toHaveCount(0);

    await list.getByRole("link", { name: /deploy script/ }).click({ modifiers: ["ControlOrMeta"] });
    await expect(check(list, "What does the deploy script check?")).toBeChecked();
    await expect(list.getByTestId("select-count")).toHaveText("1 selected");
    await list.getByRole("button", { name: "Cancel" }).click();

    const row = list.getByTestId("thread-row").filter({ hasText: "Where is the billing retry set?" });
    await row.hover();
    await row.getByTestId("thread-menu").click();
    await page.getByRole("menuitem", { name: "Select" }).click();
    await expect(check(list, "Where is the billing retry set?")).toBeChecked();
    await expect(list.getByTestId("select-count")).toHaveText("1 selected");
  });

  test("Escape leaves select mode and clears the selection", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/chat");
    const list = rail(page);
    await list.getByTestId("select-chats").click();
    await check(list, "Which services call the billing API?").check();
    await page.keyboard.press("Escape");
    await expect(list.getByRole("checkbox")).toHaveCount(0);
    await expect(list.getByTestId("select-chats")).toBeFocused();
    await list.getByTestId("select-chats").click();
    await expect(list.getByTestId("select-count")).toHaveText("0 selected");
    // Escape in the question closes only the question.
    await check(list, "Which services call the billing API?").check();
    await list.getByTestId("delete-selected").click();
    await expect(page.getByTestId("confirm-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("confirm-dialog")).toBeHidden();
    await expect(check(list, "Which services call the billing API?")).toBeChecked();
    expect(db.bulkBodies).toEqual([]);
  });

  test("deleting the open chat goes to a new chat", async ({ page }) => {
    await mockApi(page);
    await page.goto("/chat?thread=th_b");
    await expect(page.getByText("From the code, it is the billing worker.")).toBeVisible();
    const list = rail(page);
    await list.getByTestId("select-chats").click();
    await check(list, "How do refunds reach the ledger?").check();
    await check(list, "Where is the billing retry set?").check();
    await list.getByTestId("delete-selected").click();
    await page.getByTestId("confirm-dialog").getByRole("button", { name: "Delete 2 chats" }).click();
    await expect(page).not.toHaveURL(/thread=/);
    await expect(page.getByText("From the code, it is the billing worker.")).toBeHidden();
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
    await expect(list.getByTestId("thread-row")).toHaveCount(3);
  });

  test("a partial failure keeps the failed chats selected and says how many", async ({ page }) => {
    const db = await mockApi(page, { failing: ["th_b", "th_d"] });
    await page.goto("/chat");
    const list = rail(page);
    await list.getByTestId("select-chats").click();
    await list.getByTestId("select-all").check();
    await expect(list.getByTestId("select-count")).toHaveText("4 selected");
    await list.getByTestId("delete-selected").click();
    await page.getByTestId("confirm-dialog").getByRole("button", { name: "Delete 4 chats" }).click();

    await expect(page.getByText(/2 chats deleted\. 2 chats couldn't be deleted and are still selected\./)).toBeVisible();
    await expect(list.getByTestId("thread-check")).toHaveCount(2);
    await expect(check(list, "How do refunds reach the ledger?")).toBeChecked();
    await expect(check(list, "What does the deploy script check?")).toBeChecked();
    await expect(list.getByTestId("select-count")).toHaveText("2 selected");
    await shot(page, "bulk-partial-failure-1280");

    // Trying again sends only the two left.
    db.failing = [];
    await list.getByTestId("delete-selected").click();
    await page.getByTestId("confirm-dialog").getByRole("button", { name: "Delete 2 chats" }).click();
    await expect(list.getByTestId("thread-row")).toHaveCount(1);
    expect(db.bulkBodies[1]).toEqual(["th_b", "th_d"]);
  });

  test("the single delete question has no empty band either", async ({ page }) => {
    await mockApi(page);
    await page.goto("/chat");
    const row = rail(page).getByTestId("thread-row").filter({ hasText: "Which services call the billing API?" });
    await row.hover();
    await row.getByTestId("thread-menu").click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const dialog = page.getByTestId("confirm-dialog");
    await expect(dialog.getByRole("heading", { name: "Delete this chat?" })).toBeVisible();
    await shot(page, "single-confirm-1280");
    await noEmptyBand(dialog);
  });
});

test.describe("chat: deleting several chats on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function noSideways(page: Page) {
    const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(scroll, "the page scrolls sideways").toBeLessThanOrEqual(client);
  }

  test("select mode fits, the buttons stay on screen, and Escape keeps the menu open", async ({ page }) => {
    const db = await mockApi(page, {
      threads: [
        ...THREADS(),
        ...Array.from({ length: 24 }, (_, i) =>
          thread(`th_more${i}`, `Why does the reconciliation job for ledger ${i} retry forever on a partial refund?`, 40 * DAY + i),
        ),
      ],
    });
    await page.goto("/chat");
    await page.getByRole("button", { name: "Menu" }).click();
    const sheet = page.getByRole("dialog", { name: "Menu" });
    const list = sheet.getByTestId("thread-rail");
    await list.getByTestId("select-chats").click();
    await check(list, /ledger 23 retry/).check();
    // Back at the top of the list, the buttons are still on screen.
    await check(list, "Which services call the billing API?").check();
    await expect(list.getByTestId("select-count")).toHaveText("2 selected");
    await expect(list.getByTestId("select-count")).toBeInViewport();
    await noSideways(page);
    // Nothing in the list is wider than the screen.
    const widest = await list.evaluate((el) => Math.max(...Array.from(el.querySelectorAll("*")).map((n) => n.getBoundingClientRect().right)));
    expect(widest).toBeLessThanOrEqual(390);
    const del = list.getByTestId("delete-selected");
    await expect(del).toBeInViewport();
    await expect(list.getByRole("button", { name: "Cancel" })).toBeInViewport();
    await shot(page, "bulk-select-390");

    await del.click();
    const dialog = page.getByTestId("confirm-dialog");
    await expect(dialog.getByRole("heading", { name: "Delete 2 chats?" })).toBeVisible();
    await noEmptyBand(dialog);
    await expect(dialog.getByRole("button", { name: "Delete 2 chats" })).toBeInViewport();
    await shot(page, "bulk-confirm-390");
    await dialog.getByRole("button", { name: "Delete 2 chats" }).click();
    await expect(list.getByTestId("thread-check")).toHaveCount(0);
    expect(db.bulkBodies).toEqual([["th_a", "th_more23"]]);

    // Escape leaves select mode but not the menu the list is in.
    await list.getByTestId("select-chats").click();
    await page.keyboard.press("Escape");
    await expect(list.getByRole("checkbox")).toHaveCount(0);
    await expect(sheet).toBeVisible();
    await noSideways(page);
  });
});
