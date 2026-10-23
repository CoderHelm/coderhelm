import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Attaching items to tickets, the team's support access setting, and the
// platform admin's read-only support view with its banner. Every API call is
// answered by a small in-memory backend here; nothing reaches a real server.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const ADMIN_EMAIL = "admin@coderhelm.com";
const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();
const later = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

const RUN = { run_id: "01RUNAAAA0000000000000000", title: "Add a retry to the payment client", ticket_id: "your-team/web#77", repo: "your-team/web", status: "failed", created_at: iso(30) };
const ALERT = { id: "01J00000000000000000000ALR", title: "Checkout latency high", repo: "your-team/web", kind: "cloudwatch", outcome: "pr_opened", received_at: iso(90) };
const SOURCE = { id: "src_orders", kind: "api", name: "Orders API", url: "https://orders.example.com/graphql", status: "ready" };

interface Item {
  kind: string;
  id: string;
  label: string;
  repo: string;
  status: string;
}

interface Db {
  email: string;
  role: string;
  /** The session is a support view of this team. */
  supportView: null | { team_id: string; team_name: string; until: string };
  grant: null | Record<string, unknown>;
  log: Record<string, unknown>[];
  posts: { method: string; path: string; body: Record<string, unknown> }[];
  tickets: Record<string, unknown>[];
  threads: Record<string, Record<string, unknown>[]>;
}

/** What the gateway keeps of an attachment: the team's own record of it. */
function resolve(ref: { kind: string; id: string }): Item | null {
  if (ref.kind === "run" && ref.id === RUN.run_id) return { kind: "run", id: RUN.run_id, label: RUN.title, repo: RUN.repo, status: RUN.status };
  if (ref.kind === "alert" && ref.id === ALERT.id) return { kind: "alert", id: ALERT.id, label: ALERT.title, repo: ALERT.repo, status: ALERT.outcome };
  if (ref.kind === "data_source" && ref.id === SOURCE.id) return { kind: "data_source", id: SOURCE.id, label: SOURCE.name, repo: "", status: SOURCE.status };
  return null;
}

function ticket(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    team_id: "TEAM#t_1",
    team_name: "your-team",
    subject: "The run stopped at the tests",
    status: "open",
    priority: "normal",
    opened_by_id: "USER#u_1",
    opened_by_email: "person@example.com",
    opened_by_name: "a-person",
    role: "owner",
    context: { page: "/", item: null, items: [], user_agent: "Test browser" },
    created_at: iso(60),
    updated_at: iso(10),
    last_actor: "customer",
    message_count: 1,
    ...over,
  };
}

async function mockApi(page: Page, init: Partial<Db> = {}): Promise<Db> {
  const db: Db = {
    email: "person@example.com",
    role: "owner",
    supportView: null,
    grant: null,
    log: [],
    posts: [],
    tickets: [ticket("01TICKET0001")],
    threads: { "01TICKET0001": [{ id: "m1", kind: "message", author: "customer", author_email: "person@example.com", author_name: "a-person", body: "It failed.", created_at: iso(60) }] },
    ...init,
  };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const team = () => (db.supportView ? db.supportView.team_id : "TEAM#t_1");

  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    const body = method === "POST" ? (req.postDataJSON() as Record<string, unknown>) : {};
    if (method !== "GET") db.posts.push({ method, path: p, body });

    // The gateway's rule for a support view: reads only.
    if (db.supportView && method !== "GET" && !(method === "DELETE" && p === "/api/support/view")) {
      return json(route, { error: "read-only support view", support_view: true, support_view_ended: false }, 403);
    }

    if (p === "/api/me")
      return json(route, {
        user_id: db.supportView ? "SUPPORT#g1" : "u_1",
        team_id: team(),
        github_login: db.supportView ? null : "a-person",
        email: db.email,
        avatar_url: "",
        role: db.supportView ? "admin" : db.role,
        support_view: db.supportView ? { team_id: db.supportView.team_id, until: 0 } : null,
      });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "TEAM#t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "your-team/web", enabled: true, ticket_source: "github" }] });
    if (p === "/api/runs") return json(route, { runs: [], next: null });
    if (p === "/api/support/badge") return json(route, { waiting: 0, queue_open: db.email === ADMIN_EMAIL ? 1 : null });

    if (p === "/api/search") {
      const q = (url.searchParams.get("q") || "").toLowerCase();
      return json(route, {
        q,
        runs: RUN.title.toLowerCase().includes(q) || q.includes("pay") ? [RUN] : [],
        reviews: [],
        releases: [],
        plans: [],
      });
    }
    if (p === "/api/alerts") return json(route, { alerts: [ALERT], next: null });
    if (p === "/api/data-sources") return json(route, { sources: [SOURCE] });

    // Support view status and exit.
    if (p === "/api/support/view" && method === "GET") return json(route, db.supportView ? { active: true, read_only: true, ...db.supportView } : { active: false });
    if (p === "/api/support/view" && method === "DELETE") {
      db.supportView = null;
      return json(route, { active: false });
    }

    // Support access.
    if (p === "/api/support/access") {
      if (method === "GET") return json(route, { grant: db.grant, windows: [24, 72, 168], log: db.log });
      if (method === "POST") {
        db.grant = { id: "g1", granted_by_email: db.email, granted_at: new Date().toISOString(), until: later(Number(body.hours)), note: body.note ?? "", ticket_id: body.ticket_id ?? "", revoked_at: "", revoked_by_email: "", active: true };
        db.log.unshift({ id: `l${db.log.length}`, at: new Date().toISOString(), kind: "granted", actor_email: db.email, method: "", route: "", ticket_id: "", detail: `for ${body.hours} hours` });
        return json(route, { grant: db.grant });
      }
      if (method === "DELETE") {
        if (db.grant) db.grant = { ...db.grant, active: false, revoked_at: new Date().toISOString() };
        db.log.unshift({ id: `l${db.log.length}`, at: new Date().toISOString(), kind: "revoked", actor_email: db.email, method: "", route: "", ticket_id: "", detail: "" });
        return json(route, { grant: db.grant });
      }
    }
    if (p === "/api/admin/support/view") {
      if (!db.grant || !(db.grant as { active: boolean }).active) return json(route, { error: "This team has not let support in, or its access has ended." }, 403);
      db.supportView = { team_id: "TEAM#t_1", team_name: "your-team", until: later(2) };
      return json(route, { team_id: "TEAM#t_1", team_name: "your-team", until: db.supportView.until, grant_until: (db.grant as { until: string }).until });
    }

    // Tickets.
    if (p === "/api/support/tickets" && method === "GET") return json(route, { tickets: db.tickets });
    if (p === "/api/support/tickets" && method === "POST") {
      const items = ((body.items as { kind: string; id: string }[]) ?? []).map(resolve);
      if (items.some((i) => !i)) return json(route, { error: "That item is not one of your team's." }, 400);
      const t = ticket("01TICKET0002", { subject: body.subject, context: { page: body.page ?? "", item: items[0] ?? null, items, user_agent: "" } });
      db.tickets.unshift(t);
      db.threads[t.id] = [{ id: "m2", kind: "message", author: "customer", author_email: db.email, author_name: "a-person", body: body.body, created_at: new Date().toISOString(), attachments: items }];
      return json(route, { ticket: t, messages: db.threads[t.id] });
    }
    const one = /^\/api\/(admin\/)?support\/tickets\/([^/]+)(\/reply)?$/.exec(p);
    if (one) {
      const t = db.tickets.find((x) => x.id === decodeURIComponent(one[2])) as ReturnType<typeof ticket> | undefined;
      if (!t) return json(route, { error: "Ticket not found." }, 404);
      if (one[3]) {
        const items = ((body.items as { kind: string; id: string }[]) ?? []).map(resolve) as Item[];
        db.threads[t.id].push({ id: `m${Date.now()}`, kind: "message", author: "customer", author_email: db.email, author_name: "a-person", body: body.body, created_at: new Date().toISOString(), attachments: items });
        (t.context.items as Item[]).push(...items);
      }
      const extra = one[1] ? { support_access: { until: db.grant && (db.grant as { active: boolean }).active ? (db.grant as { until: string }).until : null } } : {};
      return json(route, { ticket: t, messages: db.threads[t.id], ...extra });
    }
    if (p === "/api/admin/support/tickets")
      return json(route, { tickets: db.tickets, support_access: db.grant && (db.grant as { active: boolean }).active ? { "TEAM#t_1": (db.grant as { until: string }).until } : {} });
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

test.describe("attaching items to a ticket", () => {
  test("the new-ticket form finds runs, alerts and data sources, keeps the page's item, and sends ids only", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto(`/support/?new=1&from=/runs/detail&kind=run&item=${RUN.run_id}&label=${encodeURIComponent(RUN.title)}`);
    const attached = page.getByTestId("ticket-attached");
    // Prefilled from the page.
    await expect(attached.getByTestId("attachment-chip")).toHaveCount(1);
    await expect(attached.getByTestId("attachment-chip").first()).toContainText(`Run: ${RUN.title}`);

    await page.getByTestId("ticket-attach").click();
    const picker = page.getByTestId("attach-picker");
    await picker.getByLabel("Find something to attach").fill("checkout");
    await expect(picker.getByTestId("attach-result")).toHaveCount(1);
    await picker.getByTestId("attach-result").filter({ hasText: ALERT.title }).click();
    await picker.getByLabel("Find something to attach").fill("orders");
    await picker.getByTestId("attach-result").filter({ hasText: SOURCE.name }).click();
    // The page's run shows as already attached.
    await picker.getByLabel("Find something to attach").fill("payment");
    await expect(picker.getByTestId("attach-result").filter({ hasText: RUN.title })).toContainText("Attached");
    await expect(picker.getByTestId("attach-result").filter({ hasText: RUN.title })).toBeDisabled();
    await picker.getByRole("button", { name: "Done" }).click();
    await expect(attached.getByTestId("attachment-chip")).toHaveCount(3);
    await attached.getByRole("button", { name: `Remove Data source: ${SOURCE.name}` }).click();
    await expect(attached.getByTestId("attachment-chip")).toHaveCount(2);
    await shot(page, "support-attach-new");

    await page.getByLabel("Subject").fill("Checkout broke after the retry");
    await page.getByLabel("What happened?").fill("The alert fired after the run.");
    await page.getByRole("button", { name: "Send to support" }).click();
    await expect(page).toHaveURL(/\/support\/ticket\/?\?id=/);
    const sent = db.posts.find((x) => x.path === "/api/support/tickets")!;
    expect((sent.body.items as { kind: string; id: string }[]).map((i) => `${i.kind}:${i.id}`)).toEqual([`run:${RUN.run_id}`, `alert:${ALERT.id}`]);
    expect(JSON.stringify(sent.body)).not.toContain(SOURCE.url);

    // Chips on the ticket link to each item.
    const ctx = page.getByTestId("ticket-context");
    await expect(ctx.getByRole("link", { name: new RegExp(`Run: ${RUN.title}`) })).toHaveAttribute("href", new RegExp(`/runs/detail/?\\?id=${RUN.run_id}`));
    await expect(ctx.getByRole("link", { name: new RegExp(`Alert: ${ALERT.title}`) })).toHaveAttribute("href", new RegExp(`/alerts/detail/?\\?id=${ALERT.id}`));
  });

  test("a reply can attach more items, even with no text", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/support/ticket/?id=01TICKET0001");
    await page.getByTestId("reply-attach").click();
    const picker = page.getByTestId("attach-picker");
    await picker.getByLabel("Find something to attach").fill("orders");
    await picker.getByTestId("attach-result").filter({ hasText: SOURCE.name }).click();
    await picker.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "Reply", exact: true }).click();
    await expect(page.getByTestId("support-message")).toHaveCount(2);
    const reply = db.posts.find((x) => x.path.endsWith("/reply"))!;
    expect(reply.body).toEqual({ body: "", items: [{ kind: "data_source", id: SOURCE.id, label: SOURCE.name }] });
    await expect(page.getByTestId("support-message").last().getByTestId("attachment-chip")).toContainText(`Data source: ${SOURCE.name}`);
    await expect(page.getByTestId("ticket-context").getByTestId("attachment-chip")).toHaveCount(1);
  });
});

test.describe("support access", () => {
  test("a team owner turns it on for a window, sees the log, and ends it", async ({ page }) => {
    const db = await mockApi(page, {
      log: [{ id: "old", at: iso(300), kind: "read", actor_email: "helper@example.com", method: "GET", route: "/runs?status=failed", ticket_id: "", detail: "" }],
    });
    await page.goto("/settings/");
    await page.getByRole("link", { name: /Support access/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Support access" })).toBeVisible();
    const control = page.getByTestId("support-access-control");
    await expect(control).toHaveAttribute("data-active", "false");
    await expect(control).toContainText("Off.");
    await expect(page.getByTestId("support-access-log")).toContainText("GET /runs?status=failed");

    await page.getByLabel("For how long").selectOption("24");
    await page.getByLabel(/Note for support/).fill("Look at the failed run");
    await page.getByTestId("support-access-grant").click();
    await expect(control).toHaveAttribute("data-active", "true");
    await expect(control).toContainText("Coderhelm support can see your workspace, read only, until");
    expect(db.posts.find((x) => x.path === "/api/support/access" && x.method === "POST")!.body).toEqual({ hours: 24, note: "Look at the failed run" });
    await expect(page.getByTestId("support-access-log").locator('[data-kind="granted"]')).toHaveCount(1);
    await shot(page, "support-access-on");

    await page.getByTestId("support-access-revoke").click();
    await expect(control).toHaveAttribute("data-active", "false");
    expect(db.posts.some((x) => x.path === "/api/support/access" && x.method === "DELETE")).toBe(true);
    await expect(page.getByTestId("support-access-log").locator('[data-kind="revoked"]')).toHaveCount(1);
  });

  test("a member is not offered the setting", async ({ page }) => {
    await mockApi(page, { role: "member" });
    await page.goto("/settings/support-access/");
    await expect(page.getByText("This page needs a different role")).toBeVisible();
    await page.goto("/support/ticket/?id=01TICKET0001");
    await expect(page.getByTestId("support-thread")).toBeVisible();
    await expect(page.getByTestId("ticket-support-access")).toHaveCount(0);
  });

  test("an owner lets support look at one ticket from the ticket page", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/support/ticket/?id=01TICKET0001");
    const box = page.getByTestId("ticket-support-access");
    await box.getByLabel("For how long").selectOption("168");
    await box.getByRole("button", { name: "Let support look at this" }).click();
    await expect(box.getByTestId("support-access-control")).toHaveAttribute("data-active", "true");
    expect(db.posts.find((x) => x.path === "/api/support/access")!.body).toEqual({ hours: 168, ticket_id: "01TICKET0001" });
  });

  test("the setting works at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, { log: [{ id: "x", at: iso(5), kind: "read", actor_email: "helper@example.com", method: "GET", route: "/reviewer/review?sk=REVIEW%23your-team%2Fweb%23000042%23a-very-long-review-key", ticket_id: "", detail: "" }] });
    await page.goto("/settings/support-access/");
    await expect(page.getByTestId("support-access-log")).toBeVisible();
    await noSideScroll(page);
    await shot(page, "support-access-phone");
  });
});

test.describe("support view", () => {
  test("a platform admin opens a read-only view from the ticket; a banner shows the team, time left and Exit", async ({ page }) => {
    const db = await mockApi(page, {
      email: ADMIN_EMAIL,
      grant: { id: "g1", granted_by_email: "person@example.com", granted_at: iso(10), until: later(70), note: "", ticket_id: "01TICKET0001", revoked_at: "", revoked_by_email: "", active: true },
    });
    db.tickets[0] = ticket("01TICKET0001", { context: { page: "/", item: null, items: [{ kind: "run", id: RUN.run_id, label: RUN.title, repo: RUN.repo, status: "failed" }], user_agent: "" } });
    await page.goto("/admin/tickets/");
    await expect(page.getByTestId("queue-row").first()).toContainText("Access on");
    await page.goto("/admin/tickets/?id=01TICKET0001");
    await expect(page.getByTestId("admin-support-view")).toContainText("The team lets support look");
    // No banner outside a support view.
    await expect(page.getByTestId("support-view-banner")).toHaveCount(0);

    // A chip opens the item inside the support view.
    await page.getByTestId("ticket-context").getByRole("button", { name: new RegExp(`Run: ${RUN.title}`) }).click();
    await expect(page).toHaveURL(new RegExp(`/runs/detail/?\\?id=${RUN.run_id}`));
    expect(db.posts.find((x) => x.path === "/api/admin/support/view")!.body).toEqual({ team_id: "TEAM#t_1", ticket_id: "01TICKET0001" });

    const banner = page.getByTestId("support-view-banner");
    await expect(banner).toHaveAttribute("data-state", "active");
    await expect(banner).toContainText("Support view");
    await expect(banner).toContainText("your-team");
    await expect(banner).toContainText(/read only/i);
    await expect(banner).toContainText(/h \d+ min left|min left/);

    // On every page.
    await page.goto("/support/");
    await expect(banner).toBeVisible();
    await shot(page, "support-view-banner");

    // Writes are refused: the gateway answers 403 read-only support view.
    await page.goto("/support/?new=1");
    await page.getByLabel("Subject").fill("x");
    await page.getByLabel("What happened?").fill("y");
    await page.getByRole("button", { name: "Send to support" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "read-only support view" })).toBeVisible();

    await banner.getByRole("button", { name: "Exit" }).click();
    await expect(page).toHaveURL(/\/admin\/tickets/);
    await expect(page.getByTestId("support-view-banner")).toHaveCount(0);
    expect(db.posts.some((x) => x.method === "DELETE" && x.path === "/api/support/view")).toBe(true);
  });

  test("without the team's access there is no view, and chips are text", async ({ page }) => {
    const db = await mockApi(page, { email: ADMIN_EMAIL });
    db.tickets[0] = ticket("01TICKET0001", { context: { page: "/", item: null, items: [{ kind: "run", id: RUN.run_id, label: RUN.title, repo: RUN.repo, status: "failed" }], user_agent: "" } });
    await page.goto("/admin/tickets/?id=01TICKET0001");
    await expect(page.getByTestId("admin-support-view")).toContainText("Off.");
    await expect(page.getByTestId("view-as-support")).toHaveCount(0);
    await expect(page.getByTestId("ticket-context").getByRole("button", { name: new RegExp(RUN.title) })).toHaveCount(0);
  });

  test("the banner fits at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, { email: ADMIN_EMAIL, supportView: { team_id: "TEAM#t_1", team_name: "a-team-with-a-rather-long-organisation-name", until: later(1.5) } });
    await page.goto("/support/");
    const banner = page.getByTestId("support-view-banner");
    await expect(banner).toBeVisible();
    await expect(banner.getByRole("button", { name: "Exit" })).toBeVisible();
    await noSideScroll(page);
    await shot(page, "support-view-banner-phone");
  });
});
