import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// System health and the platform admin's shared queue. Every API call is
// answered here with invented data; nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const DAY = 86_400;

type Status = "ok" | "critical";

function health(dlq: { status: Status; count: number; unretryable?: number; oldest_age_secs?: number | null }) {
  return {
    status: dlq.status === "ok" ? "healthy" : "degraded",
    checked_at: new Date().toISOString(),
    checks: [
      { name: "crashed_runs", status: "ok", count: 0, items: [] },
      { name: "stale_queued", status: "ok", count: 0, items: [] },
      {
        name: "dlq",
        status: dlq.status,
        count: dlq.count,
        unretryable: dlq.unretryable ?? 0,
        oldest_age_secs: dlq.oldest_age_secs ?? null,
        oldest_sent_at: dlq.oldest_age_secs ? new Date(Date.now() - dlq.oldest_age_secs * 1000).toISOString() : null,
        complete: true,
      },
      { name: "tickets", status: "ok", visible: 0, in_flight: 0 },
      { name: "failed_runs_24h", status: "ok", count: 0, items: [] },
    ],
  };
}

const pascal = (id: string, ageDays: number) => ({
  message_id: id,
  type: "SkillSync",
  sent_at: new Date(Date.now() - ageDays * DAY * 1000).toISOString(),
  age_secs: ageDays * DAY,
  source_queue: "coderhelm-test-tickets",
  retryable: false,
  problem: "unknown message type `SkillSync`",
  body: { type: "SkillSync", team_id: "TEAM#team-a", repo: "acme/skills", recheck: true },
});

const failedTicket = {
  message_id: "m-ticket",
  type: "ticket",
  sent_at: new Date(Date.now() - 4 * DAY * 1000).toISOString(),
  age_secs: 4 * DAY,
  source_queue: "coderhelm-test-tickets",
  retryable: true,
  problem: null,
  body: { type: "ticket", team_id: "TEAM#team-a", ticket_id: "T-1" },
};

interface Backend {
  /** Answers for /api/health, in order; the last one repeats. */
  healths: ReturnType<typeof health>[];
  healthCalls: number;
  dlq: Record<string, unknown>[];
  posts: { path: string; body: unknown }[];
  platformAdmin: boolean;
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { healths: [health({ status: "ok", count: 0 })], healthCalls: 0, dlq: [], posts: [], platformAdmin: false, ...init };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "TEAM#team-a", github_login: null, email: "admin@example.com", avatar_url: "", role: "admin", auth_provider: "email", mfa_enabled: false });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "TEAM#team-a", org: "team-a", status: "active", current: true }] });
    if (p === "/api/health") {
      const h = db.healths[Math.min(db.healthCalls, db.healths.length - 1)];
      db.healthCalls += 1;
      return json(route, { ...h, checked_at: new Date().toISOString() });
    }
    if (p === "/api/dlq") {
      const count = db.dlq.filter((m) => m.retryable).length;
      return json(route, { messages: db.dlq, count, unretryable: db.dlq.length - count, complete: true });
    }
    if ((p === "/api/dlq/delete" || p === "/api/dlq/redrive" || p === "/api/admin/dlq/delete") && method === "POST") {
      const body = JSON.parse(req.postData() || "{}") as { message_id?: string };
      db.posts.push({ path: p, body });
      db.dlq = db.dlq.filter((m) => m.message_id !== body.message_id);
      return route.fulfill({ status: 200, body: "" });
    }
    if (p === "/api/admin/dlq") {
      if (!db.platformAdmin) return json(route, { error: "forbidden" }, 403);
      return json(route, {
        messages: [
          { ...pascal("m1", 4), team_id: "TEAM#team-a", global: false, shared_only: true },
          { ...failedTicket, message_id: "m3", team_id: "TEAM#team-b", global: false, shared_only: false, body: { type: "ticket", team_id: "TEAM#team-b" } },
          { message_id: "m4", type: null, sent_at: new Date().toISOString(), age_secs: 120, source_queue: "", retryable: false, problem: "the message is not JSON", body: "not json", team_id: null, global: false, shared_only: true },
        ],
        count: 3,
        shared: 2,
        unreadable: 2,
        complete: true,
        cleanup_after_days: 7,
        retention_days: 14,
      });
    }
    return json(route, { error: `not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, name), fullPage: true });
}

const dlqCard = (page: Page) => page.getByTestId("check-dlq");

test("messages the worker can't read are not the team's Problem, and can only be deleted", async ({ page }) => {
  const db = await mockApi(page, {
    healths: [health({ status: "ok", count: 0, unretryable: 2 })],
    dlq: [pascal("m1", 4), pascal("m2", 4)],
  });
  await page.goto("/health/");
  await expect(page.getByTestId("health-overall")).toContainText("Healthy");
  const card = dlqCard(page);
  await expect(card).toContainText("OK");
  await expect(card).not.toContainText("Problem");
  await expect(card).toContainText("None to retry · 2 can't be retried");
  await expect(page.getByText("covers the whole shared queue")).toHaveCount(0);

  await card.getByRole("button", { name: /Failed messages/ }).click();
  const rows = page.getByTestId("dlq-message");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Can't be retried");
  await expect(rows.first().getByTestId("dlq-problem")).toContainText("Can't be retried: unknown message type SkillSync");
  await expect(rows.first()).toContainText("Sent 4 days ago");
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await shot(page, "health-unretryable.png");

  await rows.first().getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(rows).toHaveCount(1);
  expect(db.posts).toEqual([{ path: "/api/dlq/delete", body: { message_id: "m1" } }]);
});

test("a team's own failed work is a Problem with its age, and Try again sends only the id", async ({ page }) => {
  const db = await mockApi(page, {
    healths: [health({ status: "critical", count: 1, oldest_age_secs: 4 * DAY })],
    dlq: [failedTicket],
  });
  await page.goto("/health/");
  await expect(page.getByTestId("health-overall")).toContainText("Degraded");
  const card = dlqCard(page);
  await expect(card).toContainText("Problem");
  await expect(card).toContainText("1 message · oldest 4 days");

  await card.getByRole("button", { name: /Failed messages/ }).click();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("No failed messages for your team.")).toBeVisible();
  expect(db.posts).toEqual([{ path: "/api/dlq/redrive", body: { message_id: "m-ticket" } }]);
});

test("one odd poll doesn't flip the status; two in a row do", async ({ page }) => {
  await page.clock.install();
  const ok = health({ status: "ok", count: 0 });
  const bad = health({ status: "critical", count: 1, oldest_age_secs: 600 });
  const db = await mockApi(page, { healths: [ok, bad, ok, bad, bad] });
  await page.goto("/health/");
  const card = dlqCard(page);
  await expect(card).toContainText("OK");

  // Poll 2 says Problem once, poll 3 says OK again: the page never flips.
  for (const calls of [2, 3]) {
    await page.clock.runFor(30_000);
    await expect.poll(() => db.healthCalls).toBe(calls);
    await expect(card).toContainText("OK");
    await expect(card).not.toContainText("Problem");
  }
  // Polls 4 and 5 both say Problem: now it shows.
  await page.clock.runFor(30_000);
  await expect.poll(() => db.healthCalls).toBe(4);
  await expect(card).toContainText("OK");
  await page.clock.runFor(30_000);
  await expect.poll(() => db.healthCalls).toBe(5);
  await expect(card).toContainText("Problem");
  await expect(card).toContainText("1 message · oldest 10 minutes");
});

test("health fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, {
    healths: [health({ status: "critical", count: 1, unretryable: 1, oldest_age_secs: 4 * DAY })],
    dlq: [failedTicket, pascal("m2", 9)],
  });
  await page.goto("/health/");
  await dlqCard(page).getByRole("button", { name: /Failed messages/ }).click();
  await expect(page.getByTestId("dlq-message")).toHaveCount(2);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  for (const b of await page.getByRole("button", { name: /Try again|Delete/ }).all()) {
    const box = await b.boundingBox();
    expect(box && box.x + box.width).toBeLessThanOrEqual(390);
  }
  await shot(page, "health-phone.png");
});

test("the platform admin sees the whole shared queue, with each message's team", async ({ page }) => {
  const db = await mockApi(page, { platformAdmin: true });
  await page.goto("/admin/queue/");
  await expect(page.getByRole("heading", { name: "Shared queue", level: 1 })).toBeVisible();
  const counts = page.getByTestId("queue-counts");
  await expect(counts).toContainText("Messages3");
  await expect(counts).toContainText("For no team2");
  await expect(counts).toContainText("Can't be read2");
  const rows = page.getByTestId("queue-message");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("TEAM#team-a");
  await expect(rows.nth(0)).toContainText("Can't be retried: unknown message type SkillSync");
  await expect(rows.nth(1)).toContainText("TEAM#team-b");
  await expect(rows.nth(2)).toContainText("No team");
  await expect(page.getByText(/archived and removed after 7 days/)).toBeVisible();
  await shot(page, "admin-queue.png");

  await rows.nth(2).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect.poll(() => db.posts).toEqual([{ path: "/api/admin/dlq/delete", body: { message_id: "m4" } }]);
});

test("the shared queue leaves out what an older gateway doesn't send, never printing undefined", async ({ page }) => {
  await mockApi(page, { platformAdmin: true });
  // An older gateway: no retention fields and no counts, only the messages.
  await page.route(
    (url) => url.pathname === "/api/admin/dlq",
    (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ complete: true, messages: [{ message_id: "m9", type: "ticket", sent_at: new Date().toISOString(), age_secs: 60, source_queue: "", retryable: false, problem: "", body: { type: "ticket" }, team_id: null, global: false, shared_only: true }] }),
      }),
  );
  await page.goto("/admin/queue/");
  await expect(page.getByRole("heading", { name: "Shared queue", level: 1 })).toBeVisible();
  await expect(page.getByText("Failed messages from every team.")).toBeVisible();
  await expect(page.getByText(/undefined/)).toHaveCount(0);
  const counts = page.getByTestId("queue-counts");
  await expect(counts).toContainText("Messages1");
  await expect(counts).toContainText("For no team0");
  await expect(counts).toContainText("Can't be read0");
});

test("anyone else is refused the shared queue", async ({ page }) => {
  await mockApi(page, { platformAdmin: false });
  await page.goto("/admin/queue/");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await expect(page.getByTestId("queue-message")).toHaveCount(0);
});
