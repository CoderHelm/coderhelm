import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Support tickets: filing from the menu, from ⌘K and from a run, the team's
// list and thread, and the platform admin's queue. Every API call is
// answered here by a small in-memory backend; nothing reaches a real server.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

const ADMIN_EMAIL = "admin@coderhelm.com";

const RUN = {
  run_id: "01RUNFAILED00000000000000",
  status: "failed",
  ticket_source: "github",
  ticket_id: "your-team/web#77",
  title: "Add a retry to the payment client",
  repo: "your-team/web",
  branch: "coderhelm/retry",
  pr_url: null,
  pr_number: null,
  current_pass: "test",
  tokens_in: 1000,
  tokens_out: 100,
  cost_usd: 0.5,
  files_modified: [],
  duration_s: 60,
  error: "Tests failed",
  created_at: iso(40),
  updated_at: iso(30),
  pass_history: [{ pass: "triage", started_at: iso(40) }],
};

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
  context: { page: string; item: Record<string, string> | null; user_agent: string };
  created_at: string;
  updated_at: string;
  last_actor: string;
  message_count: number;
}

interface Msg {
  id: string;
  kind: string;
  author: string;
  author_email: string;
  author_name: string;
  body: string;
  created_at: string;
}

interface Backend {
  calls: string[];
  posts: { path: string; body: Record<string, unknown> }[];
  email: string;
  role: string;
  /** The session's team; the mock answers 404 for any other team's ticket, as the gateway does. */
  team: string;
  tickets: Ticket[];
  threads: Record<string, Msg[]>;
}

let seq = 0;
const nextId = () => `01TICKET${String(++seq).padStart(4, "0")}`;

function ticket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: nextId(),
    team_id: "TEAM#t_1",
    team_name: "your-team",
    subject: "Release notes did not post",
    status: "open",
    priority: "normal",
    opened_by_id: "USER#u_1",
    opened_by_email: "person@example.com",
    opened_by_name: "a-person",
    role: "member",
    context: { page: "/releases", item: { kind: "release", id: "your-team/web@v1.2.0", label: "your-team/web v1.2.0", repo: "your-team/web", status: "" }, user_agent: "Test browser" },
    created_at: iso(120),
    updated_at: iso(60),
    last_actor: "customer",
    message_count: 1,
    ...over,
  };
}

function msg(over: Partial<Msg> = {}): Msg {
  return { id: nextId(), kind: "message", author: "customer", author_email: "person@example.com", author_name: "a-person", body: "It did not post.", created_at: iso(120), ...over };
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const waiting = ticket({ subject: "Review never finished", status: "waiting", last_actor: "support", message_count: 2, updated_at: iso(5) });
  const other = ticket({ team_id: "TEAM#t_2", team_name: "another-team", subject: "Jira link broken", opened_by_email: "someone@example.org", opened_by_name: "", priority: "urgent", context: { page: "/settings/integrations/jira", item: null, user_agent: "Other browser" } });
  const mine = ticket();
  const db: Backend = {
    calls: [],
    posts: [],
    email: "person@example.com",
    role: "member",
    team: "TEAM#t_1",
    tickets: [mine, waiting, other],
    threads: {
      [mine.id]: [msg()],
      [waiting.id]: [msg({ body: "The review stopped.", created_at: iso(30) }), msg({ author: "support", author_email: "", author_name: "Coderhelm support", body: "Which pull request?", created_at: iso(5) })],
      [other.id]: [msg({ body: "The Jira link says unauthorized.", author_email: "someone@example.org", author_name: "" })],
    },
    ...init,
  };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const isAdmin = () => db.email === ADMIN_EMAIL;
  const customerView = (m: Msg) => (m.author === "support" ? { ...m, author_email: "", author_name: "Coderhelm support" } : m);
  const detail = (t: Ticket, admin: boolean) => ({
    ticket: admin ? t : { ...t, context: { ...t.context, user_agent: "" } },
    messages: (db.threads[t.id] ?? []).map((m) => (admin ? m : customerView(m))),
  });

  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    db.calls.push(`${method} ${p}${url.search}`);
    const body = method === "POST" ? (req.postDataJSON() as Record<string, unknown>) : {};
    if (method === "POST") db.posts.push({ path: p, body });

    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: db.team, github_login: "a-person", email: db.email, avatar_url: "", role: db.role });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: db.team, org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "your-team/web", enabled: true, ticket_source: "github" }] });
    if (p === "/api/runs") return json(route, { runs: [RUN], next: null });
    if (p === `/api/runs/${RUN.run_id}`) return json(route, RUN);
    if (p.startsWith("/api/runs/")) return json(route, { error: "Not found" }, 404);
    if (p === "/api/search") return json(route, { q: "", runs: [], reviews: [], releases: [], plans: [] });

    // Customer routes: only the session's team.
    const team = db.tickets.filter((t) => t.team_id === db.team);
    if (p === "/api/support/badge") {
      return json(route, { waiting: team.filter((t) => t.status === "waiting").length, queue_open: isAdmin() ? db.tickets.filter((t) => t.status === "open").length : null });
    }
    if (p === "/api/support/tickets" && method === "GET") return json(route, { tickets: team });
    if (p === "/api/support/tickets" && method === "POST") {
      const t = ticket({
        subject: String(body.subject),
        priority: String(body.priority ?? "normal"),
        context: {
          page: String(body.page ?? ""),
          item: ((body.items as Record<string, string>[] | undefined)?.[0] ?? (body.item as Record<string, string>)) || null,
          user_agent: "Test browser",
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      db.tickets.unshift(t);
      db.threads[t.id] = [msg({ body: String(body.body), created_at: t.created_at })];
      return json(route, detail(t, false));
    }
    const one = /^\/api\/support\/tickets\/([^/]+)(\/reply)?$/.exec(p);
    if (one) {
      const t = team.find((x) => x.id === decodeURIComponent(one[1]));
      if (!t) return json(route, { error: "Ticket not found." }, 404);
      if (one[2]) {
        db.threads[t.id].push(msg({ body: String(body.body), created_at: new Date().toISOString() }));
        t.status = "open";
        t.message_count += 1;
      }
      return json(route, detail(t, false));
    }

    // Platform admin routes.
    if (p.startsWith("/api/admin/support/")) {
      if (!isAdmin()) return json(route, { error: "Only Coderhelm platform admins can do this." }, 403);
      if (p === "/api/admin/support/tickets") return json(route, { tickets: db.tickets });
      const a = /^\/api\/admin\/support\/tickets\/([^/]+)(\/reply|\/status)?$/.exec(p);
      const t = a && db.tickets.find((x) => x.id === decodeURIComponent(a[1]));
      if (!a || !t) return json(route, { error: "Ticket not found." }, 404);
      if (a[2] === "/reply") {
        db.threads[t.id].push(msg({ author: "support", author_email: ADMIN_EMAIL, author_name: "helper", body: String(body.body), created_at: new Date().toISOString() }));
        t.status = body.status === "resolved" ? "resolved" : "waiting";
        t.message_count += 1;
      }
      if (a[2] === "/status") {
        if (body.status) t.status = body.status as Ticket["status"];
        if (body.priority) t.priority = String(body.priority);
      }
      return json(route, detail(t, true));
    }
    if (p === "/api/admin/teams") return isAdmin() ? json(route, { teams: [], month: "2026-01" }) : json(route, { error: "no" }, 403);
    if (p === "/api/allowlist") return json(route, { emails: [] });
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

test.describe("support tickets for a team", () => {
  test("the menu's Help, then Get help, shows the team's tickets with their status and a count of the ones waiting", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    const help = page.getByTestId("nav-help");
    await expect(help).toBeVisible();
    await expect(help.getByTestId("count-badge")).toHaveText(/1/);
    await help.click();
    await page.getByRole("menu", { name: "Help" }).getByRole("menuitem", { name: /Get help/ }).click();
    await expect(page).toHaveURL(/\/support\/?$/);
    await expect(page.getByRole("heading", { level: 1, name: "Support" })).toBeVisible();

    const rows = page.getByTestId("support-ticket-row");
    await expect(rows).toHaveCount(2);
    // Another team's ticket never shows.
    await expect(page.getByText("Jira link broken")).toHaveCount(0);
    await expect(rows.filter({ hasText: "Review never finished" })).toContainText("Waiting on you");
    await expect(rows.filter({ hasText: "Release notes did not post" })).toContainText("Open");

    await page.getByRole("button", { name: /Waiting on you/ }).click();
    await expect(page).toHaveURL(/status=waiting/);
    await expect(rows).toHaveCount(1);
    await shot(page, "support-list");
  });

  test("a run page files a ticket with the run attached, and the thread takes replies", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto(`/runs/detail/?id=${RUN.run_id}`);
    const link = page.getByTestId("help-link");
    await expect(link).toHaveText("Get help with this run");
    await link.click();

    await expect(page.getByRole("heading", { level: 1, name: "Get help" })).toBeVisible();
    const attached = page.getByTestId("ticket-attached");
    await expect(attached).toContainText(`Run: ${RUN.title} (your-team/web)`);
    await expect(attached).toContainText("Page: A run");
    await expect(attached).toContainText("Never your code");

    await page.getByLabel("Subject").fill("The run stopped at the tests");
    await page.getByLabel("What happened?").fill("It failed on a test that passes locally.");
    await page.getByRole("group", { name: "How urgent is it?" }).getByRole("button", { name: "High" }).click();
    await shot(page, "support-new");
    await page.getByRole("button", { name: "Send to support" }).click();

    await expect(page).toHaveURL(/\/support\/ticket\/?\?id=/);
    const sent = db.posts.find((x) => x.path === "/api/support/tickets")!;
    expect(sent.body).toMatchObject({
      subject: "The run stopped at the tests",
      priority: "high",
      items: [{ kind: "run", id: RUN.run_id, label: RUN.title, repo: "your-team/web" }],
    });
    expect(String(sent.body.page)).toMatch(/^\/runs\/detail\/?$/);
    // Only ids and names travel: no run contents, no error text, no files.
    expect(JSON.stringify(sent.body)).not.toContain("Tests failed");

    await expect(page.getByRole("status").filter({ hasText: "Sent." })).toBeVisible();
    await expect(page.getByTestId("support-message")).toHaveCount(1);
    await expect(page.getByTestId("ticket-context")).toContainText(RUN.title);

    await page.getByLabel("Reply").fill("It also fails on the second try.");
    await page.getByRole("button", { name: "Reply", exact: true }).click();
    await expect(page.getByTestId("support-message")).toHaveCount(2);
    await expect(page.getByLabel("Reply")).toHaveValue("");
  });

  test("the thread shows support as Coderhelm support, never a staff address", async ({ page }) => {
    const db = await mockApi(page);
    const waiting = db.tickets.find((t) => t.status === "waiting")!;
    await page.goto(`/support/ticket/?id=${waiting.id}`);
    const answer = page.locator('[data-testid="support-message"][data-author="support"]');
    await expect(answer).toContainText("Coderhelm support");
    await expect(answer).toContainText("Which pull request?");
    await expect(page.getByText("Waiting on you").first()).toBeVisible();
  });

  test("another team's ticket id is not found", async ({ page }) => {
    const db = await mockApi(page);
    const other = db.tickets.find((t) => t.team_id !== db.team)!;
    await page.goto(`/support/ticket/?id=${other.id}`);
    await expect(page.getByText("Ticket not found")).toBeVisible();
    await expect(page.getByText("Jira link broken")).toHaveCount(0);
  });

  test("⌘K has Get help, which opens the form with the page it was opened on", async ({ page }) => {
    await mockApi(page);
    await page.goto(`/runs/detail/?id=${RUN.run_id}`);
    await expect(page.getByTestId("help-link")).toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByTestId("command-palette");
    await expect(palette).toBeVisible();
    await page.keyboard.type("get help");
    await palette.getByRole("option", { name: /Get help/ }).first().click();
    await expect(page).toHaveURL(/\/support\/?\?new=1/);
    await expect(page).toHaveURL(/kind=run/);
    await expect(page.getByTestId("ticket-attached")).toContainText(RUN.run_id);
  });

  test("support works at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const db = await mockApi(page);
    await page.goto("/support/");
    await expect(page.getByTestId("support-ticket-row")).toHaveCount(2);
    await noSideScroll(page);
    await page.goto("/support/?new=1&from=/releases&kind=release&item=your-team/web@v1.2.0&label=your-team/web%20v1.2.0");
    await expect(page.getByTestId("ticket-attached")).toBeVisible();
    await noSideScroll(page);
    await page.goto(`/support/ticket/?id=${db.tickets[0].id}`);
    await expect(page.getByTestId("support-thread")).toBeVisible();
    await noSideScroll(page);
    await shot(page, "support-ticket-phone");
  });
});

test.describe("the platform admin's support queue", () => {
  test("someone who is not a platform admin is refused, and sees no queue in the menu", async ({ page }) => {
    await mockApi(page, { role: "owner" });
    await page.goto("/admin/tickets/");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Support queue/ })).toHaveCount(0);
  });

  test("the queue lists every team's tickets; an admin answers, resolves and sees the context with links", async ({ page }) => {
    const db = await mockApi(page, { email: ADMIN_EMAIL, role: "owner" });
    await page.goto("/admin/");
    await page.getByTestId("page-actions").getByRole("link", { name: "Support queue" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Support queue" })).toBeVisible();

    // Needs reply by default: both open tickets, from both teams, urgent first.
    const rows = page.getByTestId("queue-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("Jira link broken");
    await expect(rows.first()).toContainText("another-team");
    await expect(rows.first()).toContainText("Urgent");
    await page.getByRole("button", { name: /^All/ }).click();
    await expect(rows).toHaveCount(3);
    await shot(page, "support-queue");

    await rows.filter({ hasText: "Release notes did not post" }).getByRole("link").first().click();
    await expect(page).toHaveURL(/\/admin\/tickets\/?\?id=/);
    const ctx = page.getByTestId("ticket-context");
    await expect(ctx).toContainText("person@example.com");
    await expect(ctx).toContainText("your-team");
    await expect(ctx).toContainText("member");
    await expect(ctx).toContainText("Test browser");
    // The item lives in the team's workspace: without the team's support access it is text, not a link.
    await expect(ctx.getByTestId("attachment-chip")).toContainText("Release: your-team/web v1.2.0");
    await expect(ctx.getByRole("link", { name: /Release: your-team\/web/ })).toHaveCount(0);
    await expect(page.getByTestId("admin-support-view")).toContainText("Off.");
    await expect(ctx.getByRole("link", { name: "Releases" })).toHaveAttribute("href", /\/releases/);

    await page.getByLabel("Reply").fill("We posted the notes again.");
    await page.getByRole("button", { name: "Reply & resolve" }).click();
    await expect(page.getByTestId("support-message")).toHaveCount(2);
    const reply = db.posts.find((x) => x.path.endsWith("/reply"))!;
    expect(reply.body).toEqual({ body: "We posted the notes again.", status: "resolved" });
    await expect(page.getByTestId("ticket-status")).toHaveValue("resolved");

    await page.getByTestId("ticket-status").selectOption("open");
    await expect.poll(() => db.posts.filter((x) => x.path.endsWith("/status")).length).toBe(1);
    expect(db.posts.find((x) => x.path.endsWith("/status"))!.body).toEqual({ status: "open" });
  });

  test("the queue works at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const db = await mockApi(page, { email: ADMIN_EMAIL, role: "owner" });
    await page.goto("/admin/tickets/");
    await expect(page.getByTestId("queue-row")).toHaveCount(2);
    await noSideScroll(page);
    await page.goto(`/admin/tickets/?id=${db.tickets[2].id}`);
    // On a phone the details fold under the header.
    await expect(page.getByTestId("ticket-context")).toBeHidden();
    await page.getByTestId("details-toggle").click();
    await expect(page.getByTestId("ticket-context")).toBeVisible();
    await noSideScroll(page);
    await shot(page, "support-queue-phone");
  });
});

// Settings, hosted only: "Move to your own AWS account" opens Contact us with
// the move preset and files a normal ticket. A person helps with the move.
test.describe("moving to your own AWS account", () => {
  for (const vp of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    test(`the Settings card files a "Move to self-host" ticket with the answers (${vp.name})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const db = await mockApi(page);
      await page.goto("/settings/");
      const card = page.getByTestId("move-to-selfhost");
      await expect(card).toContainText("Move to your own AWS account");
      await expect(card).toContainText("We'll help you plan the move and bring your settings and data over.");
      await card.scrollIntoViewIfNeeded();
      await noSideScroll(page);
      await card.screenshot({ path: path.join(SHOTS_DIR, `move-card-${vp.width}.png`) });
      await shot(page, `move-settings-${vp.width}`);

      await card.getByRole("link", { name: "Talk to us about moving" }).click();
      await expect(page).toHaveURL(/\/support\/?\?new=1&type=selfhost/);
      await expect(page.getByRole("heading", { level: 1, name: "Move to your own AWS account" })).toBeVisible();
      await expect(page.getByLabel("Subject")).toHaveValue("Move to self-host");
      await page.getByLabel("Team size").selectOption("11 to 50 people");
      await page.getByLabel("AWS region").selectOption("eu-west-1");
      await page.getByLabel("Settings and instructions").check();
      await page.getByLabel("Knowledge and data sources").check();
      await noSideScroll(page);
      await shot(page, `move-form-${vp.width}`);

      // Notes are optional for a move: the answers are the ticket.
      await page.getByRole("button", { name: "Send to support" }).click();
      await expect(page).toHaveURL(/\/support\/ticket\/?\?id=/);
      const post = db.posts.find((p) => p.path === "/api/support/tickets");
      expect(post?.body.subject).toBe("Move to self-host");
      expect(post?.body.body).toBe(
        "**Topic:** Move to self-host\n**Team size:** 11 to 50 people\n**AWS region:** eu-west-1\n**What to bring over:** Settings and instructions, Knowledge and data sources",
      );
    });
  }

  test("a self-hosted install never shows the card, and the move link is plain help there", async ({ page }) => {
    await page.route((url) => url.pathname === "/runtime-config.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: `window.__CODERHELM_CONFIG__ = ${JSON.stringify({ selfHosted: true })};` }),
    );
    await mockApi(page);
    await page.goto("/settings/");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Notifications/ }).first()).toBeVisible();
    await expect(page.getByTestId("move-to-selfhost")).toHaveCount(0);
    await expect(page.getByText("Move to your own AWS account")).toHaveCount(0);

    await page.goto("/support/?new=1&type=selfhost");
    await expect(page.getByRole("heading", { level: 1, name: "Get help" })).toBeVisible();
    await expect(page.getByTestId("move-form")).toHaveCount(0);
  });
});
