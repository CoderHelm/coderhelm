import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The ticket thread and the people on a ticket: long threads fold their
// middle, status and people changes are one-line events, one person's
// messages share a header, the two-column page folds its details on narrow
// screens, and people are added, removed, and follow. Every API call is
// answered by the in-memory backend below.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

interface Participant {
  user_id: string;
  email: string;
  name: string;
  outside: boolean;
  added_by: string;
  added_at: string;
}

interface Ticket {
  id: string;
  team_id: string;
  team_name: string;
  subject: string;
  status: "open" | "waiting" | "resolved";
  priority: string;
  opened_by_id: string;
  opened_by_email: string;
  opened_by_name: string;
  role: string;
  context: { page: string; item: Record<string, string> | null; items?: Record<string, string>[]; user_agent: string };
  created_at: string;
  updated_at: string;
  last_actor: string;
  message_count: number;
  participants: Participant[];
  last_snippet: string;
  last_author_name: string;
}

interface Msg {
  id: string;
  kind: "message" | "event";
  author: "customer" | "support";
  author_email: string;
  author_name: string;
  body: string;
  created_at: string;
}

const TEAM = [
  { user_id: "u_1", email: "pat.lee@example.com", name: "Pat Lee", github_login: "patlee", avatar_url: null, role: "member", status: "active", updated_at: null },
  { user_id: "u_2", email: "sam.ortiz@example.com", name: "Sam Ortiz", github_login: "sortiz", avatar_url: null, role: "member", status: "active", updated_at: null },
  { user_id: "u_3", email: "robin.diaz@example.com", name: null, github_login: "rdiaz", avatar_url: null, role: "admin", status: "active", updated_at: null },
  { user_id: "u_4", email: "invited@example.com", name: null, github_login: null, avatar_url: null, role: "member", status: "invited", updated_at: null },
];

const RUN_ITEM = { kind: "run", id: "01RUNMERGED000000000000000", label: "Add a retry to the payment client so checkout survives a slow bank", repo: "acme/web", status: "merged" };

let seq = 0;
const nextId = () => `01MSG${String(++seq).padStart(6, "0")}`;

function msg(over: Partial<Msg>): Msg {
  return { id: nextId(), kind: "message", author: "customer", author_email: "pat.lee@example.com", author_name: "", body: "Hello", created_at: iso(60), ...over };
}

/** A thread of `n` messages (support and the team taking turns), with a few events between. */
function longThread(n: number): Msg[] {
  const out: Msg[] = [];
  for (let i = 0; i < n; i++) {
    const mins = (n - i) * 30;
    const support = i % 2 === 1;
    out.push(
      msg({
        author: support ? "support" : "customer",
        author_email: support ? "" : i % 4 === 0 ? "pat.lee@example.com" : "sam.ortiz@example.com",
        author_name: support ? "Coderhelm support" : "",
        body: support ? `Support answer number ${i + 1}. Try **again** now.` : `Team message number ${i + 1}.`,
        created_at: iso(mins),
      }),
    );
    if (i === 5) out.push(msg({ kind: "event", author: "support", author_name: "Coderhelm support", author_email: "", body: "status:waiting", created_at: iso(mins - 1) }));
    if (i === 9) out.push(msg({ kind: "event", author: "customer", body: "added:Sam Ortiz", created_at: iso(mins - 1) }));
  }
  return out;
}

function ticket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: "01TICKETTHREAD0000000001",
    team_id: "TEAM#t_1",
    team_name: "acme",
    subject: "Checkout runs keep failing on the bank step",
    status: "open",
    priority: "high",
    opened_by_id: "USER#u_1",
    opened_by_email: "pat.lee@example.com",
    opened_by_name: "",
    role: "member",
    context: { page: "/runs/detail", item: RUN_ITEM, items: [RUN_ITEM], user_agent: "" },
    created_at: iso(3000),
    updated_at: iso(10),
    last_actor: "customer",
    message_count: 3,
    participants: [],
    last_snippet: "",
    last_author_name: "",
    ...over,
  };
}

interface Backend {
  me: (typeof TEAM)[number];
  ticket: Ticket;
  thread: Msg[];
  posts: { path: string; body: Record<string, unknown> }[];
}

async function mockApi(page: Page, init: { me?: string; ticket?: Partial<Ticket>; thread?: Msg[] } = {}): Promise<Backend> {
  const db: Backend = {
    me: TEAM.find((u) => u.user_id === (init.me ?? "u_1"))!,
    ticket: ticket(init.ticket),
    thread: init.thread ?? [
      msg({ body: "The run stops at the bank step.", created_at: iso(120) }),
      msg({ body: "It started after the last deploy.", created_at: iso(118) }),
      msg({ author: "support", author_email: "", author_name: "Coderhelm support", body: "Which run? Attach it if you can.", created_at: iso(60) }),
    ],
    posts: [],
  };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const label = (p: Participant) => p.name || p.email;
  // The gateway fills names in from the team's member list.
  const named = (m: Msg) => (m.author === "customer" && !m.author_name ? { ...m, author_name: TEAM.find((u) => u.email === m.author_email)?.name || TEAM.find((u) => u.email === m.author_email)?.github_login || "" } : m);
  const detail = () => ({
    ticket: { ...db.ticket, opened_by_name: db.ticket.opened_by_name || "Pat Lee" },
    messages: db.thread.map(named),
    avatars: {},
  });
  const event = (body: string) => db.thread.push(msg({ kind: "event", author_email: db.me.email, author_name: db.me.name ?? db.me.github_login ?? "", body, created_at: new Date().toISOString() }));

  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    const body = method === "POST" ? ((req.postDataJSON() as Record<string, unknown>) ?? {}) : {};
    if (method === "POST") db.posts.push({ path: p, body });

    if (p === "/api/me") return json(route, { user_id: `USER#${db.me.user_id}`, team_id: "TEAM#t_1", github_login: db.me.github_login, email: db.me.email, avatar_url: "", role: db.me.role });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "TEAM#t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "acme/web", enabled: true, ticket_source: "github" }] });
    if (p === "/api/users") return json(route, { users: TEAM });
    if (p === "/api/search") return json(route, { q: "", runs: [], reviews: [], releases: [], plans: [] });
    if (p === "/api/support/badge") return json(route, { waiting: 0, queue_open: null });
    if (p === "/api/support/access") return json(route, { grant: null, windows: [24, 72, 168], log: [] });
    if (p === "/api/support/tickets") return json(route, { tickets: [db.ticket] });

    const m = /^\/api\/support\/tickets\/([^/]+)(\/reply|\/resolve|\/participants|\/participants\/remove)?$/.exec(p);
    if (m) {
      if (decodeURIComponent(m[1]) !== db.ticket.id) return json(route, { error: "Ticket not found." }, 404);
      const t = db.ticket;
      if (m[2] === "/reply") {
        db.thread.push(msg({ author_email: db.me.email, body: String(body.body), created_at: new Date().toISOString() }));
        t.status = "open";
        t.message_count += 1;
      }
      if (m[2] === "/resolve") {
        event("resolved");
        t.status = "resolved";
      }
      if (m[2] === "/participants") {
        const member = TEAM.find((u) => `USER#${u.user_id}` === body.user_id || u.user_id === body.user_id || u.email === body.email);
        const p2: Participant = member
          ? { user_id: `USER#${member.user_id}`, email: member.email, name: member.name || member.github_login || "", outside: false, added_by: db.me.email, added_at: new Date().toISOString() }
          : { user_id: "", email: String(body.email), name: "", outside: true, added_by: db.me.email, added_at: new Date().toISOString() };
        t.participants.push(p2);
        event(member?.user_id === db.me.user_id ? "followed" : `added:${label(p2)}`);
      }
      if (m[2] === "/participants/remove") {
        const at = t.participants.findIndex((x) => (body.user_id ? x.user_id === body.user_id || x.user_id === `USER#${body.user_id}` : x.email === body.email));
        const gone = t.participants.splice(at, 1)[0];
        event(gone.user_id === `USER#${db.me.user_id}` ? "left" : `removed:${label(gone)}`);
      }
      return json(route, detail());
    }
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true });
}

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

const open = (page: Page, db: Backend) => page.goto(`/support/ticket/?id=${db.ticket.id}`);

test.describe("the ticket thread", () => {
  test("a long thread folds its middle and keeps the first message and the last few open", async ({ page }) => {
    const db = await mockApi(page, { thread: longThread(30) });
    await open(page, db);
    const messages = page.getByTestId("support-message");
    // The first message and the last three.
    await expect(messages).toHaveCount(4);
    await expect(messages.first()).toContainText("Team message number 1.");
    await expect(messages.last()).toContainText("Support answer number 30.");
    const more = page.getByTestId("thread-show-earlier");
    await expect(more).toHaveText(/Show 26 earlier messages\s*and 2 updates/);
    await more.click();
    await expect(messages).toHaveCount(30);
    await expect(page.getByTestId("thread-show-earlier")).toHaveCount(0);
  });

  test("status and people changes are one-line events, not messages", async ({ page }) => {
    const db = await mockApi(page, { thread: longThread(12) });
    await open(page, db);
    await page.getByTestId("thread-show-earlier").click();
    const events = page.getByTestId("support-event");
    await expect(events).toHaveCount(2);
    await expect(events.nth(0)).toContainText("Coderhelm support marked this waiting on the team");
    await expect(events.nth(1)).toContainText("Pat Lee added Sam Ortiz");
    await expect(events.nth(1)).toHaveAttribute("data-event", "people");
  });

  test("one person's messages share a header, names replace addresses, and bodies are markdown", async ({ page }) => {
    const db = await mockApi(page, {
      thread: [
        msg({ body: "First, with **bold** and `code`.", created_at: iso(30) }),
        msg({ body: "Second, a minute later.", created_at: iso(29) }),
        msg({ author: "support", author_email: "", author_name: "Coderhelm support", body: "On it.", created_at: iso(10) }),
      ],
    });
    await open(page, db);
    const messages = page.getByTestId("support-message");
    await expect(messages).toHaveCount(3);
    await expect(messages.nth(0).getByTestId("message-author")).toHaveText("Pat Lee");
    await expect(messages.nth(0).getByTestId("message-author")).toHaveAttribute("title", "pat.lee@example.com");
    await expect(messages.nth(1)).toHaveAttribute("data-continued", "");
    await expect(messages.nth(1).getByTestId("message-author")).toHaveCount(0);
    await expect(messages.nth(0).locator("strong")).toHaveText("bold");
    await expect(messages.nth(0).locator("code")).toHaveText("code");
    // The raw address never shows as a name.
    await expect(page.getByTestId("support-thread")).not.toContainText("pat.lee@example.com");
    await expect(messages.nth(2)).toContainText("Coderhelm support");
  });

  test("long messages clamp behind Show more and email-style quotes fold", async ({ page }) => {
    const long = Array.from({ length: 30 }, (_, i) => `Line ${i + 1} of the stack trace.`).join("\n\n");
    const db = await mockApi(page, {
      thread: [msg({ body: long, created_at: iso(30) }), msg({ author: "support", author_email: "", author_name: "Coderhelm support", body: "Fixed.\n\nOn Mon, Pat Lee wrote:\n> the run fails\n> every time", created_at: iso(5) })],
    });
    await open(page, db);
    const first = page.getByTestId("support-message").first();
    await expect(first.getByRole("button", { name: "Show more" })).toBeVisible();
    await first.getByRole("button", { name: "Show more" }).click();
    await expect(first.getByRole("button", { name: "Show less" })).toBeVisible();
    const answer = page.getByTestId("support-message").last();
    await expect(answer).not.toContainText("every time");
    await answer.getByTestId("quoted-toggle").click();
    await expect(answer).toContainText("every time");
  });

  test("an unread divider marks what came in since the last visit, and Jump to latest goes to the end", async ({ page }) => {
    const thread = longThread(30);
    const db = await mockApi(page, { thread });
    // Last seen before the last four messages.
    const seen = thread.filter((m) => m.kind === "message")[25].created_at;
    await page.addInitScript(([id, at]) => window.localStorage.setItem(`coderhelm.support.seen.${id}`, at), [db.ticket.id, seen]);
    await open(page, db);
    const divider = page.getByTestId("unread-divider");
    await expect(divider).toHaveCount(1);
    // Nothing unread is folded away: the messages after the divider are all open.
    await expect(page.getByTestId("support-message").filter({ hasText: "number 27." })).toBeVisible();
    // The whole thread is taller than the window: scrolled up, Jump to latest shows.
    await page.getByTestId("thread-show-earlier").click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByTestId("jump-to-latest")).toBeVisible();
    // The reply box sticks to the bottom of the window too; the button sits above it, never under it.
    const covered = await page.getByTestId("jump-to-latest").evaluate((b) => {
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !(hit && b.contains(hit));
    });
    expect(covered).toBe(false);
    await page.getByTestId("jump-to-latest").click();
    await expect(page.getByTestId("thread-end")).toBeInViewport();
  });

  test("a reply sends the same body as before, and quoting fills the composer", async ({ page }) => {
    const db = await mockApi(page);
    await open(page, db);
    const send = page.getByTestId("composer-send");
    await expect(send).toBeDisabled();
    await page.getByTestId("support-message").last().hover();
    await page.getByTestId("support-message").last().getByTestId("quote-message").click();
    await expect(page.getByLabel("Reply", { exact: true })).toHaveValue(/^> Which run\? Attach it if you can\.\n> — Coderhelm support\n\n$/);
    await page.getByLabel("Reply", { exact: true }).fill("Run 42, attached.");
    await expect(send).toBeEnabled();
    await send.click();
    await expect(page.getByTestId("support-message")).toHaveCount(4);
    const reply = db.posts.find((x) => x.path.endsWith("/reply"))!;
    expect(reply.body).toEqual({ body: "Run 42, attached.", items: [] });
  });

  test("the filer marks the ticket resolved from the composer", async ({ page }) => {
    const db = await mockApi(page);
    await open(page, db);
    await page.getByTestId("composer-resolve").click();
    await expect.poll(() => db.posts.filter((x) => x.path.endsWith("/resolve")).length).toBe(1);
    await expect(page.getByTestId("support-event").last()).toContainText("marked this resolved");
    await expect(page.getByTestId("composer-resolve")).toHaveCount(0);
  });

  test("attached items are compact chips that link to the item", async ({ page }) => {
    const db = await mockApi(page);
    await open(page, db);
    const chip = page.getByTestId("ticket-context").getByTestId("attachment-chip");
    await expect(chip).toHaveCount(1);
    const link = chip.getByRole("link");
    await expect(link).toHaveAttribute("href", /\/runs\/detail\/?\?id=01RUNMERGED/);
    await expect(link).toHaveAccessibleName(/^Run: Add a retry to the payment client so checkout survives a slow bank \(acme\/web\) · merged$/);
    // One line, not the page's width.
    const box = (await link.boundingBox())!;
    expect(box.height).toBeLessThan(40);
    expect(box.width).toBeLessThanOrEqual(330);
  });
});

test.describe("people on a ticket", () => {
  test("the filer adds a teammate and an outside address, and removes them", async ({ page }) => {
    const db = await mockApi(page);
    await open(page, db);
    await page.getByTestId("header-add-people").click();
    const form = page.getByTestId("add-people-form");
    const input = form.getByRole("combobox");
    await input.fill("sam");
    // Invites and people already on the ticket are not offered.
    await expect(form.getByTestId("add-person-option")).toHaveCount(1);
    await form.getByTestId("add-person-option").first().click();
    await expect.poll(() => db.posts.filter((x) => x.path.endsWith("/participants")).length).toBe(1);
    expect(db.posts.find((x) => x.path.endsWith("/participants"))!.body).toEqual({ user_id: "u_2" });
    await expect(page.getByTestId("ticket-person")).toHaveCount(2);
    await expect(page.getByTestId("support-event").last()).toContainText("Pat Lee added Sam Ortiz");

    // A bad address is refused before anything is sent.
    await input.fill("not-an-address@");
    await expect(form.getByRole("status")).toHaveText("Enter a valid email address.");
    await expect(form.getByTestId("add-person-option")).toHaveCount(0);
    await input.fill("Alex.Guest@Example.org");
    await expect(form.getByTestId("add-person-option")).toContainText("Copy alex.guest@example.org by email");
    await input.press("Enter");
    await expect(page.getByTestId("ticket-person")).toHaveCount(3);
    expect(db.posts.filter((x) => x.path.endsWith("/participants")).at(-1)!.body).toEqual({ email: "alex.guest@example.org" });
    await expect(page.getByTestId("ticket-person").last()).toContainText("Copied");
    await expect(page.getByTestId("avatar-stack")).toContainText("3 people on this ticket");

    await page.getByRole("button", { name: "Remove alex.guest@example.org from this ticket" }).click();
    await expect(page.getByTestId("ticket-person")).toHaveCount(2);
    expect(db.posts.find((x) => x.path.endsWith("/participants/remove"))!.body).toEqual({ email: "alex.guest@example.org" });
    await expect(page.getByTestId("support-event").last()).toContainText("removed alex.guest@example.org");
  });

  test("a member who did not file follows and unfollows, and cannot add others", async ({ page }) => {
    const db = await mockApi(page, { me: "u_2" });
    await open(page, db);
    await expect(page.getByTestId("header-add-people")).toHaveCount(0);
    await expect(page.getByTestId("add-people")).toHaveCount(0);
    const follow = page.getByTestId("header-follow");
    await expect(follow).toHaveText("Follow");
    await follow.click();
    await expect(follow).toHaveText("Unfollow");
    expect(db.posts.at(-1)).toEqual({ path: `/api/support/tickets/${db.ticket.id}/participants`, body: { user_id: "USER#u_2" } });
    await expect(page.getByTestId("support-event").last()).toContainText("Sam Ortiz followed this ticket");
    await follow.click();
    await expect(follow).toHaveText("Follow");
    expect(db.posts.at(-1)).toEqual({ path: `/api/support/tickets/${db.ticket.id}/participants/remove`, body: { user_id: "USER#u_2" } });
    await expect(page.getByTestId("support-event").last()).toContainText("Sam Ortiz left this ticket");
  });

  test("the lists show how many people are on a ticket and the latest line", async ({ page }) => {
    await mockApi(page, {
      ticket: {
        participants: [{ user_id: "USER#u_2", email: "sam.ortiz@example.com", name: "Sam Ortiz", outside: false, added_by: "Pat Lee", added_at: iso(5) }],
        last_snippet: "Which run? Attach it if you can.",
        last_author_name: "Coderhelm support",
      },
    });
    await page.goto("/support/");
    const row = page.getByTestId("support-ticket-row");
    await expect(row).toContainText("2 people");
    await expect(row).toContainText("Coderhelm support: Which run? Attach it if you can.");
  });
});

test.describe("the ticket page's layout", () => {
  for (const width of [1024, 1280]) {
    test(`at ${width}px with the sidebar open nothing scrolls sideways`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const db = await mockApi(page, { thread: longThread(8) });
      await open(page, db);
      await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
      await expect(page.getByTestId("support-thread")).toBeVisible();
      await noSideScroll(page);
      const toggle = page.getByTestId("details-toggle");
      const details = page.getByTestId("ticket-details");
      if (width === 1024) {
        // Too narrow for two columns beside the sidebar: the details fold under the header.
        await expect(toggle).toBeVisible();
        await expect(details).toBeHidden();
        await toggle.click();
        await expect(details).toBeVisible();
        const d = (await details.boundingBox())!;
        const t = (await page.getByTestId("support-thread").boundingBox())!;
        expect(d.y).toBeLessThan(t.y);
      } else {
        await expect(toggle).toBeHidden();
        await expect(details).toBeVisible();
        const d = (await details.boundingBox())!;
        const t = (await page.getByTestId("support-thread").boundingBox())!;
        expect(d.x).toBeGreaterThan(t.x + t.width);
        expect(d.x + d.width).toBeLessThanOrEqual(width);
      }
      await noSideScroll(page);
    });
  }

  test("on a phone the details fold, older messages are one line each, and nothing scrolls sideways", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const db = await mockApi(page, { thread: longThread(6) });
    await open(page, db);
    await expect(page.getByTestId("ticket-details")).toBeHidden();
    await noSideScroll(page);
    const compact = page.locator('[data-testid="support-message"][data-compact]');
    await expect(compact).toHaveCount(4);
    await compact.first().getByRole("button").click();
    await expect(compact).toHaveCount(3);
    await page.getByTestId("details-toggle").click();
    await expect(page.getByTestId("ticket-people")).toBeVisible();
    await noSideScroll(page);
  });
});

test.describe("screenshots", () => {
  for (const [n, width] of [
    [3, 1280],
    [30, 1280],
    [3, 390],
    [30, 390],
  ] as const) {
    test(`${n} messages at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      const db = await mockApi(page, {
        thread: n === 3 ? undefined : longThread(n),
        ticket: { participants: [{ user_id: "USER#u_2", email: "sam.ortiz@example.com", name: "Sam Ortiz", outside: false, added_by: "Pat Lee", added_at: iso(5) }] },
      });
      await open(page, db);
      await expect(page.getByTestId("support-thread")).toBeVisible();
      await noSideScroll(page);
      await shot(page, `ticket-${n}-messages-${width}`);
    });
  }
});
