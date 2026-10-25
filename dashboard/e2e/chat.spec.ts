import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Chat: the question box, starter questions, the source chips, a streamed
// answer with citations, the chat list, sharing, rating, roles and the phone
// layout. Every API call is answered here, the answer stream included;
// nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();
const NONE = { knowledge: [], connections: false, code: false, memories: false, data_sources: false, skills: false };

// What `/api/brain/sources` names each kind (the gateway's SOURCE_KINDS).
const KINDS = [
  { key: "knowledge", label: "Files and pages", about: "Documents and pages your team added to Knowledge" },
  { key: "connections", label: "Connected apps", about: "Apps such as Notion, Linear or Sentry, read as you ask" },
  { key: "code", label: "Code", about: "Your team's code and how it fits together" },
  { key: "memories", label: "Past work", about: "What Coderhelm learned from earlier work" },
  { key: "data_sources", label: "Logs and data", about: "Logs, databases and metrics you connected, only read" },
  { key: "skills", label: "Team know-how", about: "Your team's written skills and helpers" },
];

const LEAVE = {
  id: "S1",
  kind: "knowledge",
  title: "Leave policy.pdf",
  loc: "Page 4",
  as_of: "2026-05-01",
  passage: "Parental leave is sixteen weeks, fully paid, for every employee.",
  href: "/brain/knowledge/base?id=kb_hr",
  authoritative: true,
  base: "HR handbook",
};
const CODE = { id: "S2", kind: "code", title: "src/policies/leave.ts", loc: "your-team/web", as_of: "2026-10-24 12:00 UTC", passage: "export const PARENTAL_LEAVE_WEEKS = 16;", authoritative: false };

const STARTERS = [
  { question: "What should I know from HR handbook?", why: "From HR handbook", sources: { ...NONE, knowledge: ["kb_hr"] } },
  { question: "What's the latest on “Add rate limiting to login”?", why: "From recent work in web", sources: { ...NONE, code: true, repo: "your-team/web" } },
  { question: "How is web put together?", why: "From the web code", sources: { ...NONE, code: true, repo: "your-team/web" } },
  { question: "What should a new teammate know about web?", why: "From past work in web", sources: { ...NONE, memories: true, repo: "your-team/web" } },
];

interface Thread {
  id: string;
  title: string;
  shared: boolean;
  mine: boolean;
  owner_email: string;
  created_at: string;
  updated_at: string;
  messages: number;
}

interface Backend {
  role: string;
  capabilities?: string[];
  calls: string[];
  bodies: Record<string, unknown>[];
  asks: Record<string, unknown>[];
  threads: Thread[];
  answer: "cited" | "none";
  /** Milliseconds the answer stream waits before it answers. */
  streamDelay: number;
  starters: typeof STARTERS;
  knowledge: { id: string; name: string; ready: number; authoritative: boolean }[];
  uploads: number;
}

const ev = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;

const thread = (over: Partial<Thread>): Thread => ({
  id: "th_x",
  title: "A chat",
  shared: false,
  mine: true,
  owner_email: "admin@example.com",
  created_at: iso(10),
  updated_at: iso(10),
  messages: 2,
  ...over,
});

const ANSWER_TEXT = "Parental leave is **sixteen weeks**, fully paid [S1]. The app reads the same number from code [S2].";

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = {
    role: "admin",
    calls: [],
    bodies: [],
    asks: [],
    threads: [
      thread({ id: "th_old", title: "Which services call the billing API?", updated_at: iso(60 * 24 * 3) }),
      thread({ id: "th_shared", title: "What is the deploy freeze?", shared: true, mine: false, owner_email: "dana@example.com", updated_at: iso(500) }),
    ],
    answer: "cited",
    streamDelay: 0,
    starters: STARTERS,
    knowledge: [
      { id: "kb_hr", name: "HR handbook", ready: 1, authoritative: true },
      { id: "kb_eng", name: "Engineering runbooks", ready: 3, authoritative: false },
    ],
    uploads: 0,
    ...init,
  };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const holds = (cap: string) =>
    db.capabilities ? db.capabilities.includes(cap) : cap === "brain_ask" ? db.role !== "viewer" : cap === "knowledge_manage" ? db.role === "admin" || db.role === "owner" : true;
  const exchange = (question: string) => [
    { seq: 0, role: "user", content: question, citations: [], grounded: true, sources: { ...NONE, knowledge: ["kb_hr"] }, attachments: [], used: [], at: iso(1) },
    db.answer === "none"
      ? { seq: 1, role: "assistant", content: "I couldn't find anything in the selected sources that answers this, so I won't guess.", citations: [], grounded: false, attachments: [], used: [], at: iso(1) }
      : { seq: 1, role: "assistant", content: ANSWER_TEXT, citations: [LEAVE, CODE], grounded: true, attachments: [], used: [{ kind: "knowledge", label: 'Searched knowledge for "parental leave"' }], at: iso(1) },
  ];
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && url.pathname.startsWith("/__upload/"), async (route) => {
    db.uploads += 1;
    return route.fulfill({ status: 200, body: "" });
  });
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    db.calls.push(`${method} ${p}`);
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    if (body) db.bodies.push({ call: `${method} ${p}`, ...body });
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: db.role, ...(db.capabilities ? { capabilities: db.capabilities } : {}) });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/brain/token") return holds("brain_ask") ? json(route, { token: "t" }) : json(route, { error: "Your role can't ask questions." }, 403);
    if (p === "/api/brain/starters") return json(route, { starters: db.starters });
    if (p === "/api/brain/sources") {
      return json(route, { kinds: KINDS, knowledge: db.knowledge, connections: [{ id: "notion" }], repos: ["your-team/web", "your-team/api"], can_ask: holds("brain_ask") });
    }
    if (p === "/api/brain/threads" && method === "GET") {
      const visible = db.threads.filter((t) => t.mine ? db.role !== "viewer" : true);
      return json(route, { threads: visible, can_ask: holds("brain_ask") });
    }
    const fb = p.match(/^\/api\/brain\/threads\/([^/]+)\/messages\/(\d+)\/feedback$/);
    if (fb && method === "PUT") return json(route, { ok: true, feedback: body.rating });
    const one = p.match(/^\/api\/brain\/threads\/([^/]+)$/);
    if (one) {
      const t = db.threads.find((x) => x.id === one[1]);
      if (method === "PUT") {
        if (!t) return json(route, { error: "No such thread." }, 404);
        Object.assign(t, body.title !== undefined ? { title: body.title } : {}, body.shared !== undefined ? { shared: body.shared } : {});
        return json(route, { thread: t });
      }
      if (method === "DELETE") {
        db.threads = db.threads.filter((x) => x.id !== one[1]);
        return json(route, { ok: true });
      }
      if (one[1] === "th_shared") {
        return json(route, {
          thread: db.threads.find((x) => x.id === "th_shared"),
          messages: [
            { seq: 0, role: "user", content: "What is the deploy freeze?", citations: [], grounded: true, attachments: [], used: [], at: iso(500) },
            { seq: 1, role: "assistant", content: "Deploys stop Friday at noon [S1].", citations: [{ ...LEAVE, title: "Release rules.md", passage: "No deploys after Friday noon." }], grounded: true, attachments: [], used: [], at: iso(500) },
          ],
          can_ask: false,
        });
      }
      const last = db.asks[db.asks.length - 1];
      return json(route, {
        thread: t ?? thread({ id: one[1] }),
        messages: exchange(last ? String(last.question) : t?.title ?? "A chat"),
        can_ask: holds("brain_ask"),
      });
    }
    if (p === "/api/brain/attachments" && method === "POST") {
      return json(route, { id: "att_1", name: body.name, upload: { url: `${url.origin}/__upload/att_1`, method: "PUT", headers: { "content-type": "text/plain" } } });
    }
    if (p === "/api/brain/stream" && method === "POST") {
      db.asks.push(body);
      if (db.streamDelay) await new Promise((r) => setTimeout(r, db.streamDelay));
      const id = body.thread_id || "th_new";
      if (!db.threads.some((t) => t.id === id)) db.threads.unshift(thread({ id, title: body.question, updated_at: iso(0) }));
      const stream = (s: string) => route.fulfill({ status: 200, contentType: "text/event-stream", body: s }).catch(() => {});
      if (db.answer === "none") {
        return stream(
          ev("thread", { id, title: body.question }) +
            ev("answer", { text: "I couldn't find anything in the selected sources that answers this, so I won't guess.", citations: [], grounded: false }) +
            ev("done", {}),
        );
      }
      return stream(
        ev("thread", { id, title: body.question }) +
          ev("retrieved", { sources: [LEAVE, CODE] }) +
          ev("tool_start", { id: "tu1", name: "search_knowledge", kind: "knowledge" }) +
          ev("tool_result", { id: "tu1", name: "search_knowledge", label: 'Searched knowledge for "parental leave"', status: "success", summary: "2 passages" }) +
          ev("text_delta", { text: "Parental leave is sixteen weeks [S1]." }) +
          ev("answer", { text: ANSWER_TEXT, citations: [LEAVE, CODE], grounded: true }) +
          ev("done", {}),
      );
    }
    if (p === "/api/knowledge/kb_hr") {
      return json(route, {
        base: { id: "kb_hr", name: "HR handbook", description: "", read_role: "member", attach_team: false, agents: [], authoritative: true, created_at: iso(900), updated_at: iso(60), files: 1, ready: 1, processing: 0, failed: 0 },
        files: [{ id: "f1", name: "Leave policy.pdf", kind: "pdf", size: 1000, status: "ready", error: "", version: 1, searchable: true, as_of: "2026-05-01", uploaded_at: iso(30), uploaded_by: "admin@example.com", chunks: 4, truncated: false }],
        can_manage: holds("knowledge_manage"),
        limits: { max_file_bytes: 25 << 20, max_files: 500, extensions: ["pdf"], agents: [], read_roles: ["viewer", "member", "admin"] },
      });
    }
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

async function shot(page: Page, name: string, widths = [1440, 390]) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 640 ? 844 : 900 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

const box = (page: Page) => page.getByRole("textbox", { name: "Message" });

async function askIt(page: Page, q = "How long is parental leave?") {
  await box(page).fill(q);
  await box(page).press("Enter");
}

test.describe("chat: the empty page", () => {
  test("opens on a focused question box with starter questions from the team's data", async ({ page }) => {
    const db = await mockApi(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/chat");
    await expect(page.getByTestId("chat-empty")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "What would you like to know?" })).toBeVisible();
    await expect(box(page)).toBeFocused();
    const starters = page.getByTestId("starter");
    await expect(starters).toHaveCount(4);
    await expect(starters.first()).toContainText("HR handbook");
    await expect(starters.first()).toContainText("From HR handbook");
    expect(db.calls).toContain("GET /api/brain/starters");
    // The sources start as every knowledge source, shown as chips in the box.
    await expect(page.getByTestId("source-chip")).toHaveText(["HR handbook", "Engineering runbooks"]);
    // The chat list and the way to the knowledge.
    await expect(page.getByTestId("thread-rail")).toContainText("Previous 7 days");
    await expect(page.getByTestId("thread-rail")).toContainText("Shared with you");
    await expect(page.getByTestId("thread-rail").getByRole("link", { name: /Knowledge/ })).toHaveAttribute("href", /\/brain\/knowledge\/?$/);
    await expect(page.getByTestId("knowledge-count")).toHaveText("2");
    // No dashed walls of text.
    expect(await page.locator(".border-dashed").count()).toBe(0);
    await shot(page, "chat-empty");
  });

  test("a starter question asks with the sources it needs", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/chat");
    await page.getByTestId("starter").nth(1).click();
    await expect(page.getByTestId("answer").last()).toContainText("sixteen weeks");
    expect(db.asks[0].question).toBe("What's the latest on “Add rate limiting to login”?");
    expect(db.asks[0].sources).toMatchObject({ code: true, repo: "your-team/web", knowledge: [] });
    await expect(page).toHaveURL(/\/chat\/?\?thread=th_new/);
  });

  test("with nothing to suggest, an admin is pointed at adding knowledge", async ({ page }) => {
    await mockApi(page, { starters: [], knowledge: [] });
    await page.goto("/chat");
    await expect(page.getByTestId("no-knowledge")).toContainText("Add knowledge");
    await expect(page.getByTestId("starter")).toHaveCount(0);
  });
});

test.describe("chat: asking", () => {
  test("Enter sends, the answer streams in with numbered citations, and a citation opens its passage", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/chat");
    // Shift+Enter is a new line, not a send.
    await box(page).fill("How long is");
    await box(page).press("Shift+Enter");
    await box(page).pressSequentially("parental leave?");
    expect(db.asks).toHaveLength(0);
    await expect(box(page)).toHaveValue("How long is\nparental leave?");
    await box(page).press("Enter");
    const answer = page.getByTestId("answer").last();
    await expect(answer).toContainText("sixteen weeks, fully paid");
    expect(db.asks[0].question).toBe("How long is\nparental leave?");
    expect((db.asks[0].sources as { knowledge: string[] }).knowledge).toEqual(["kb_hr", "kb_eng"]);
    // What it looked up is folded once the answer is done.
    await answer.getByRole("button", { name: "How this was found" }).click();
    await expect(answer.getByTestId("tool-step")).toContainText("Searched knowledge");
    // Two sources: a chip with each one's name in the text, and cards under it.
    await expect(answer.getByTestId("cite-marker")).toHaveText(["Leave policy", "leave.ts"]);
    const cards = answer.getByTestId("citation");
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText("Leave policy.pdf");
    await expect(cards.first()).toContainText("Updated May 1, 2026");
    await expect(cards.first()).toContainText("Source of truth");
    await answer.getByTestId("cite-marker").first().click();
    await expect(page.getByTestId("passage")).toContainText("sixteen weeks, fully paid, for every employee");
    await expect(page.getByRole("dialog")).toContainText("HR handbook");
    await page.keyboard.press("Escape");
    await cards.nth(1).click();
    await expect(page.getByTestId("passage")).toContainText("PARENTAL_LEAVE_WEEKS");
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/thread=th_new/);
    await expect(page.getByTestId("topbar")).toContainText("How long is parental leave?");
    await expect(box(page)).toHaveAttribute("placeholder", "Ask a follow-up");
    await shot(page, "chat-conversation");
  });

  test("copy, rate and ask again on an answer", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const db = await mockApi(page);
    await page.goto("/chat");
    await askIt(page);
    const answer = page.getByTestId("answer").last();
    await expect(answer.getByTestId("citation")).toHaveCount(2);
    await answer.getByTestId("answer-copy").click();
    await expect(answer.getByRole("button", { name: "Copied" })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe("Parental leave is **sixteen weeks**, fully paid. The app reads the same number from code.");
    await answer.getByTestId("answer-up").click();
    await expect(answer.getByTestId("answer-up")).toHaveAttribute("aria-pressed", "true");
    expect(db.bodies.find((b) => String(b.call).endsWith("/messages/1/feedback"))).toMatchObject({ rating: "up" });
    await answer.getByTestId("answer-retry").click();
    await expect.poll(() => db.asks.length).toBe(2);
    expect(db.asks[1].question).toBe("How long is parental leave?");
    expect(db.asks[1].thread_id).toBe("th_new");
  });

  test("Stop ends an answer that is still coming in", async ({ page }) => {
    await mockApi(page, { streamDelay: 4000 });
    await page.goto("/chat");
    await askIt(page);
    await expect(page.getByTestId("answer-waiting")).toBeVisible();
    await page.getByTestId("stop-button").click();
    await expect(page.getByTestId("answer-stopped")).toContainText("You stopped this answer");
    await expect(page.getByTestId("send-button")).toBeVisible();
  });

  test("what to search: chips in the box, the picker, and only what is on is sent", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/chat");
    await page.getByTestId("sources-button").click();
    const picker = page.getByTestId("source-picker");
    await picker.getByRole("checkbox", { name: /Engineering runbooks/ }).uncheck();
    await page.getByTestId("source-connections").check();
    await page.getByTestId("source-code").check();
    // Two repositories: pick the one code is read from.
    await picker.getByRole("button", { name: "api" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("source-chip")).toHaveText(["HR handbook", "Connected apps", "Code"]);
    // The × on a chip turns it off.
    await page.getByRole("button", { name: "Turn off Connected apps" }).click();
    await expect(page.getByTestId("source-chip")).toHaveText(["HR handbook", "Code"]);
    await askIt(page, "Where is leave computed?");
    await expect(page.getByTestId("answer").last()).toContainText("sixteen weeks");
    expect(db.asks[0].sources).toMatchObject({ knowledge: ["kb_hr"], connections: false, code: true, memories: false, repo: "your-team/api" });
  });

  test("with nothing to search, sending waits for a choice", async ({ page }) => {
    await mockApi(page);
    await page.goto("/chat");
    await page.getByRole("button", { name: "Turn off HR handbook" }).click();
    await page.getByRole("button", { name: "Turn off Engineering runbooks" }).click();
    await expect(page.getByTestId("sources-button")).toHaveText("Choose what to search");
    await box(page).fill("Anything?");
    await expect(page.getByTestId("send-button")).toBeDisabled();
  });

  test("a file attached to a question is uploaded and sent with it", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/chat");
    await page.getByTestId("attach-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Leave is sixteen weeks.") });
    await expect(page.getByTestId("attachment-chip")).toHaveAttribute("data-status", "ready");
    await askIt(page, "Does my note match the policy?");
    await expect(page.getByTestId("answer").last()).toContainText("sixteen weeks");
    expect(db.uploads).toBe(1);
    expect(db.asks[0].attachments).toEqual([{ id: "att_1", name: "notes.txt" }]);
  });

  test("nothing found: it says so plainly, with no sources", async ({ page }) => {
    await mockApi(page, { answer: "none" });
    await page.goto("/chat");
    await askIt(page, "What is our office wifi password?");
    const none = page.getByTestId("no-source-answer");
    await expect(none).toContainText("Nothing found");
    await expect(none).toContainText("won't guess");
    await shot(page, "chat-nothing-found", [1440]);
    await expect(page.getByTestId("citation")).toHaveCount(0);
  });
});

test.describe("chat: the chat list", () => {
  test("search, rename, share and delete from a chat's menu", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/chat");
    const rail = page.getByTestId("thread-rail");
    await expect(rail.getByTestId("thread-row")).toHaveCount(2);
    await page.getByTestId("thread-search").fill("billing");
    await expect(rail.getByTestId("thread-row")).toHaveCount(1);
    await page.getByTestId("thread-search").fill("");

    const row = rail.getByTestId("thread-row").filter({ hasText: "billing" });
    await row.hover();
    await row.getByTestId("thread-menu").click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const dialog = page.getByTestId("rename-dialog");
    await dialog.getByRole("textbox", { name: "Chat name" }).fill("Billing API callers");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(rail).toContainText("Billing API callers");
    expect(db.bodies.find((b) => b.call === "PUT /api/brain/threads/th_old")).toMatchObject({ title: "Billing API callers" });

    await row.hover();
    await row.getByTestId("thread-menu").click();
    await page.getByRole("menuitem", { name: "Share with team" }).click();
    await expect(row.getByLabel("Shared with the team")).toBeVisible();

    await row.hover();
    await row.getByTestId("thread-menu").click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).last().click();
    await expect(rail.getByTestId("thread-row")).toHaveCount(1);
    expect(db.calls).toContain("DELETE /api/brain/threads/th_old");
  });

  test("the sidebar hides and comes back, and stays as it was left", async ({ page }) => {
    await mockApi(page);
    await page.goto("/chat");
    await page.getByRole("button", { name: "Hide chats" }).click();
    await expect(page.getByTestId("thread-rail")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("show-chats")).toBeVisible();
    await expect(page.getByTestId("thread-rail")).toHaveCount(0);
    await page.getByTestId("show-chats").click();
    await expect(page.getByTestId("thread-rail")).toBeVisible();
  });

  test("⌘/ starts a new chat from an open one, with the box focused", async ({ page }) => {
    await mockApi(page);
    await page.goto("/chat?thread=th_old");
    await expect(page.getByTestId("answer")).toBeVisible();
    await page.keyboard.press("ControlOrMeta+Slash");
    await expect(page).toHaveURL(/\/chat\/?$/);
    await expect(page.getByTestId("chat-empty")).toBeVisible();
    await expect(box(page)).toBeFocused();
  });

  test("old addresses open Chat, with the chat they pointed at", async ({ page }) => {
    await mockApi(page);
    await page.goto("/brain?thread=th_shared");
    await expect(page).toHaveURL(/\/chat\/?\?thread=th_shared$/);
    await expect(page.getByTestId("answer")).toContainText("Deploys stop Friday at noon");
  });
});

test.describe("chat: who can do what", () => {
  test("a viewer reads a shared chat but can't ask", async ({ page }) => {
    await mockApi(page, { role: "viewer" });
    await page.goto("/chat?thread=th_shared");
    await expect(page.getByTestId("answer")).toContainText("Deploys stop Friday at noon");
    await expect(page.getByTestId("citation")).toContainText("Release rules.md");
    await expect(page.getByTestId("read-only-note")).toContainText("Shared by dana@example.com");
    await expect(box(page)).toHaveCount(0);
    await expect(page.getByTestId("share-toggle")).toHaveCount(0);
    await expect(page.getByTestId("answer-up")).toHaveCount(0);
    await expect(page.getByTestId("new-chat")).toHaveCount(0);
  });

  test("a teammate's shared chat is read-only for a member too", async ({ page }) => {
    await mockApi(page, { role: "member" });
    await page.goto("/chat?thread=th_shared");
    await expect(page.getByTestId("read-only-note")).toBeVisible();
    await expect(box(page)).toHaveCount(0);
    await expect(page.getByTestId("answer-retry")).toHaveCount(0);
  });

  test("custom roles: a role that may ask but not manage knowledge", async ({ page }) => {
    const base = ["view", "brain_read", "view_team", "own_account"];
    await mockApi(page, { role: "custom:asker", capabilities: [...base, "brain_ask"] });
    await page.goto("/chat");
    await askIt(page);
    await expect(page.getByTestId("citation")).toHaveCount(2);
    await page.goto("/brain/knowledge/base?id=kb_hr");
    await expect(page.getByTestId("file-row").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload files" })).toHaveCount(0);
  });

  test("custom roles: a role that manages knowledge but can't ask", async ({ page }) => {
    const base = ["view", "brain_read", "view_team", "own_account"];
    await mockApi(page, { role: "custom:librarian", capabilities: [...base, "knowledge_manage"] });
    await page.goto("/chat");
    await expect(page.getByTestId("read-only-note")).toBeVisible();
    await expect(box(page)).toHaveCount(0);
    await expect(page.getByTestId("starters")).toHaveCount(0);
  });
});

test.describe("chat: on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function noSideways(page: Page) {
    const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(scroll, "the page scrolls sideways").toBeLessThanOrEqual(client);
  }

  test("the chat list is a sheet, nothing scrolls sideways, and the box is not autofocused", async ({ page }) => {
    await mockApi(page, {
      threads: [
        thread({ id: "th_long", title: "Why does the reconciliation job for the payments ledger retry forever on a partial refund?", updated_at: iso(5) }),
        thread({ id: "th_shared", title: "What is the deploy freeze?", shared: true, mine: false, owner_email: "dana.with.a.long.address@example.com", updated_at: iso(500) }),
      ],
    });
    await page.goto("/chat");
    await expect(page.getByTestId("starter")).toHaveCount(4);
    await expect(page.getByTestId("thread-rail")).toBeHidden();
    await noSideways(page);
    await page.getByTestId("open-chats").click();
    const sheet = page.getByTestId("chats-sheet");
    await expect(sheet.getByTestId("thread-row")).toHaveCount(2);
    await noSideways(page);
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS_DIR, "chat-list-sheet-390.png") });
    await sheet.getByRole("link", { name: /reconciliation/ }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/thread=th_long/);
    await expect(page.getByTestId("citation")).toHaveCount(2);
    await noSideways(page);
  });

  test("a conversation fits: no sideways scroll and no word cut in half", async ({ page }) => {
    await mockApi(page);
    await page.goto("/chat");
    await askIt(page);
    await expect(page.getByTestId("citation")).toHaveCount(2);
    await noSideways(page);
    const broken = await page.evaluate(() => {
      const out: string[] = [];
      const walker = document.createTreeWalker(document.querySelector("[data-testid=chat-page]")!, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent ?? "";
        if (n.parentElement?.closest("textarea, code, pre, [aria-hidden='true']")) continue;
        for (const m of text.matchAll(/\p{L}{2,20}/gu)) {
          range.setStart(n, m.index!);
          range.setEnd(n, m.index! + m[0].length);
          const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0);
          if (rects.length > 1 && Math.abs(rects[rects.length - 1].top - rects[0].top) > rects[0].height / 2) out.push(m[0]);
        }
      }
      return out;
    });
    expect(broken, "words split across lines").toEqual([]);
  });
});
