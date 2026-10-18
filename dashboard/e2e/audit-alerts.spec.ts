import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Alerts, plus the memory and tests fixes from the same audit. Every API call
// is answered here. Nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const REPO = "your-team/web";
const ALERT_ID = "01J9ZZ00000000000000000001";
const OTHER_ID = "01J9ZZ00000000000000000002";
const NEXT_ID = "01J9ZZ00000000000000000003";
const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

const ALERTS = [
  { id: ALERT_ID, received_at: iso(30), topic_arn: "arn:aws:sns:us-east-1:000000000000:prod-alerts", repo: REPO, kind: "cloudwatch_alarm", title: "ALARM: web-5xx-rate", outcome: "run_started", ticket_id: "ALERT-web-5xx" },
  { id: OTHER_ID, received_at: iso(90), topic_arn: "arn:aws:sns:us-east-1:000000000000:prod-alerts", repo: REPO, kind: "eventbridge", title: "", outcome: "some_new_outcome", ticket_id: "ALERT-other" },
];

interface Backend {
  calls: string[];
  /** Status to answer GET /api/alerts with; flips back to 200 after one use when `once`. */
  listStatus: number;
  listOnce: boolean;
  empty: boolean;
  more: boolean;
  eventStatus: number;
  eventOnce: boolean;
  reposStatus: number;
  reposOnce: boolean;
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = {
    calls: [], listStatus: 200, listOnce: false, empty: false, more: false,
    eventStatus: 200, eventOnce: false, reposStatus: 200, reposOnce: false, ...init,
  };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    db.calls.push(`${req.method()} ${p}${url.search}`);
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });

    if (p === "/api/alerts") {
      if (db.listStatus !== 200) {
        const status = db.listStatus;
        if (db.listOnce) db.listStatus = 200;
        // The gateway answers errors with a bare status and no body.
        return route.fulfill({ status, body: "" });
      }
      if (db.empty) return json(route, { alerts: [], next: null });
      if (url.searchParams.get("after")) {
        return json(route, { alerts: [{ ...ALERTS[0], id: NEXT_ID, title: "ALARM: older-alarm", outcome: "duplicate" }], next: null });
      }
      return json(route, { alerts: ALERTS, next: db.more ? OTHER_ID : null });
    }
    if (p === "/api/alerts/event") {
      if (db.eventStatus !== 200) {
        const status = db.eventStatus;
        if (db.eventOnce) db.eventStatus = 200;
        return route.fulfill({ status, body: "" });
      }
      return json(route, {
        alert: { ...ALERTS[0], body: "Threshold crossed: 1 datapoint [73.0] was greater than the threshold (50.0)." },
        runs: [
          { run_id: "01RUN0000000000000000000B", status: "awaiting_ci", title: "Fix the 5xx rate", pr_url: "https://github.com/your-team/web/pull/12", created_at: iso(29) },
          { run_id: "01RUN0000000000000000000A", status: "completed", title: "Fix the 5xx rate", pr_url: null, created_at: iso(600) },
        ],
      });
    }

    if (p === "/api/repos") {
      if (db.reposStatus !== 200) {
        const status = db.reposStatus;
        if (db.reposOnce) db.reposStatus = 200;
        return route.fulfill({ status, body: "" });
      }
      return json(route, { repos: [{ name: REPO, enabled: true, ticket_source: "jira" }] });
    }
    if (p === "/api/memories/agents") return json(route, { repo: REPO, profiles: [] });
    if (p === "/api/memories") return json(route, { memories: [], total: 0, page: 1, page_size: 100 });

    return json(route, { error: `Not mocked: ${req.method()} ${p}` }, 404);
  });
  return db;
}

/**
 * Collects console errors and page errors. Tests that mock a failing response
 * on purpose pass `allowFailedLoads`, since the browser logs each non-2xx
 * response; aborted requests to other hosts are always ignored.
 */
function watchConsole(page: Page, allowFailedLoads = false) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (text.includes("net::ERR_ABORTED") || text.includes("net::ERR_FAILED")) return;
    if (allowFailedLoads && text.startsWith("Failed to load resource")) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

test("the alerts list shows each alert with its outcome in words", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/alerts");
  await expect(page.getByRole("heading", { level: 1, name: "Alerts" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ALARM: web-5xx-rate" })).toHaveAttribute("href", new RegExp(`^/alerts/detail/?\\?id=${ALERT_ID}$`));
  await expect(page.getByText("Run started")).toBeVisible();
  // An outcome this page doesn't know yet reads as words, not a raw value.
  await expect(page.getByText("Some new outcome")).toBeVisible();
  await expect(page.getByText("some_new_outcome")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "(untitled alert)" })).toBeVisible();
  await shot(page, "audit-alerts-list");
  expect(errors).toEqual([]);
});

test("an empty alerts list says how alerts arrive", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page, { empty: true });
  await page.goto("/alerts");
  await expect(page.getByText("No alerts yet")).toBeVisible();
  await shot(page, "audit-alerts-empty");
  expect(errors).toEqual([]);
});

test("a failed alerts load says so and retries, instead of claiming there are none", async ({ page }) => {
  const errors = watchConsole(page, true);
  const db = await mockApi(page, { listStatus: 500, listOnce: true });
  await page.goto("/alerts");
  await expect(page.getByText("We couldn't load your alerts")).toBeVisible();
  await expect(page.getByText("No alerts yet")).toHaveCount(0);
  await shot(page, "audit-alerts-error");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("link", { name: "ALARM: web-5xx-rate" })).toBeVisible();
  // Dev mode mounts twice, so count "at least one more" rather than an exact number.
  expect(db.calls.filter((c) => c === "GET /api/alerts").length).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test("load more asks for the next page after the last alert", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page, { more: true });
  await page.goto("/alerts");
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("link", { name: "ALARM: older-alarm" })).toBeVisible();
  expect(db.calls).toContain(`GET /api/alerts?after=${OTHER_ID}`);
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("an alert's page shows its source, runs and text in words", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto(`/alerts/detail?id=${ALERT_ID}`);
  await expect(page.getByRole("heading", { level: 1, name: "ALARM: web-5xx-rate" })).toBeVisible();
  await expect(page.getByText("CloudWatch alarm")).toBeVisible();
  await expect(page.getByText("cloudwatch_alarm")).toHaveCount(0);
  await expect(page.getByText("Waiting on CI")).toBeVisible();
  await expect(page.getByText("awaiting_ci")).toHaveCount(0);
  await expect(page.getByText("started by this alert")).toBeVisible();
  await expect(page.getByRole("link", { name: "Pull request" })).toHaveAttribute("href", "https://github.com/your-team/web/pull/12");
  // The facts list is two columns: each label sits beside its value.
  const label = await page.locator("dt", { hasText: "Source" }).boundingBox();
  const value = await page.locator("dd", { hasText: "CloudWatch alarm" }).boundingBox();
  expect(label && value && Math.abs(label.y - value.y) < 4 && value.x > label.x).toBeTruthy();
  await shot(page, "audit-alert-detail");
  expect(errors).toEqual([]);
});

test("an alert that isn't there says so", async ({ page }) => {
  const errors = watchConsole(page, true);
  await mockApi(page, { eventStatus: 404 });
  await page.goto(`/alerts/detail?id=${ALERT_ID}`);
  await expect(page.getByText("Alert not found")).toBeVisible();
  await expect(page.getByRole("link", { name: "All alerts" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a failed alert load offers a retry instead of saying it doesn't exist", async ({ page }) => {
  const errors = watchConsole(page, true);
  await mockApi(page, { eventStatus: 500, eventOnce: true });
  await page.goto(`/alerts/detail?id=${ALERT_ID}`);
  await expect(page.getByText("We couldn't load this alert")).toBeVisible();
  await expect(page.getByText("Alert not found")).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "ALARM: web-5xx-rate" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the alert page without an id asks for one and makes no request", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/alerts/detail");
  await expect(page.getByText("No alert was named")).toBeVisible();
  await shot(page, "audit-alert-no-id");
  expect(db.calls.some((c) => c.includes("/api/alerts/event"))).toBe(false);
  expect(errors).toEqual([]);
});

test("memory: a failed repository load says so and retries, instead of 'No repositories yet'", async ({ page }) => {
  const errors = watchConsole(page, true);
  const db = await mockApi(page, { reposStatus: 500, reposOnce: true });
  await page.goto("/memory");
  await expect(page.getByText("We couldn't load your repositories")).toBeVisible();
  await expect(page.getByText("No repositories yet")).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByLabel("Repository", { exact: true })).toHaveValue(REPO);
  // Dev mode mounts twice, so count "at least one more" rather than an exact number.
  expect(db.calls.filter((c) => c === "GET /api/repos").length).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test("tests: a run or test page without its key makes no request to a path that doesn't exist", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/tests/run");
  await expect(page.getByText("No run was named.")).toBeVisible();
  await page.goto("/tests/test");
  await expect(page.getByText("No test was named.")).toBeVisible();
  expect(db.calls.filter((c) => c.startsWith("GET /api/tests"))).toEqual([]);
  expect(errors).toEqual([]);
});
