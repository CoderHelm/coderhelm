import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Settings, Webhooks: the endpoints Coderhelm sends the team's events to.
// List, add (the secret is shown once), an address the gateway refuses, a
// test that fails with its reason, reveal and rotate the secret, resend a
// delivery and replay a range. Every API call is answered here.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const SECRET = "whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD7vS8nSUIQ2c=";
const ROTATED = "whsec_k0q8vX2mZp5Rr3t1YbN6cH9dLwE4fJ7aS1uG0iT2oQs=";
const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString();

const LONG_URL = "https://hooks.internal-tools.example.com/coderhelm/webhooks/receive-every-event-for-the-deploy-bot-and-the-release-dashboard";

interface Endpoint {
  id: string;
  url: string;
  description: string;
  events: string[];
  enabled: boolean;
  disabled_reason: string;
  secret_hint: string;
  previous_secret_expires_at?: string | null;
  failing_since?: string | null;
  last_success_at?: string | null;
  last_failure_at?: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
}

function endpoint(id: string, over: Partial<Endpoint> = {}): Endpoint {
  return {
    id, url: LONG_URL, description: "Deploy bot", events: ["run.completed", "run.failed"], enabled: true, disabled_reason: "",
    secret_hint: "whsec_…Q2c=", last_success_at: iso(15), created_at: iso(60 * 24 * 4), created_by: "admin@example.com", updated_at: iso(60),
    ...over,
  };
}

const TYPES = [
  ["run.created", "Runs", "A run started"], ["run.completed", "Runs", "A run finished"], ["run.failed", "Runs", "A run failed"],
  ["run.needs_input", "Runs", "A run is waiting for a person"], ["pull_request.opened", "Pull requests", "Coderhelm opened a pull request"],
  ["review.completed", "Reviews", "A review was posted"], ["ci_fix.started", "CI fixes", "A CI fix started"], ["ci_fix.completed", "CI fixes", "A CI fix finished"],
  ["alert.received", "Alerts", "An alert arrived"], ["log_finding.created", "Logs", "A new log finding"], ["log_finding.resolved", "Logs", "A log finding went away"],
  ["release_notes.published", "Releases", "Release notes went out"], ["plan.approved", "Plans", "A plan was approved"],
  ["plugin.run.completed", "Plugins", "A plugin run finished"], ["webhook.test", "Testing", "A test event"],
].map(([type, group, summary]) => ({ type, group, summary, description: summary, subscribable: type !== "webhook.test", example: {} }));

const delivery = (id: string, over: Record<string, unknown> = {}) => ({
  id, event_id: `evt_${id}`, event: "run.completed", status: "handled", outcome: "Delivered (200)", reason: "", reason_message: "", reason_fix: "",
  attempts: [{ at: iso(10), code: 200, duration_ms: 87, error: "" }], next_retry_at: null, created_at: iso(10),
  payload_preview: JSON.stringify({ id: `evt_${id}`, type: "run.completed", data: { run_id: "01JBRUN" } }, null, 2),
  headers: { "content-type": "application/json", "webhook-id": `evt_${id}`, "webhook-timestamp": "1792420307", "webhook-signature": "[redacted]" },
  ...over,
});

const REFUSED = {
  status: "failed", outcome: "Refused (401)", reason: "webhook_refused",
  reason_message: "Your webhook endpoint refused the event (a 4xx answer), so it isn't retried.",
  reason_fix: "Check that the endpoint verifies signatures with the right secret and accepts JSON, then press Resend.",
  attempts: [{ at: iso(1), code: 401, duration_ms: 112, error: "Answered 401: bad signature" }],
};

interface Db {
  endpoints: Endpoint[];
  deliveries: ReturnType<typeof delivery>[];
  calls: { method: string; path: string; body: Record<string, unknown> | null }[];
}

async function mockApi(page: Page, me: Record<string, unknown> = { role: "admin" }): Promise<Db> {
  const db: Db = {
    endpoints: [
      endpoint("ep_one"),
      endpoint("ep_two", { url: "https://status.example.com/hooks/coderhelm", description: "", events: ["*"], enabled: false, disabled_reason: "failing", failing_since: iso(60 * 24 * 6), last_success_at: null }),
    ],
    deliveries: [delivery("d1"), delivery("d2", { ...REFUSED, event: "run.failed", attempts: [{ at: iso(40), code: 500, duration_ms: 300, error: "Answered 500" }, { at: iso(35), code: 401, duration_ms: 112, error: "Answered 401: bad signature" }] })],
    calls: [],
  };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    let body: Record<string, unknown> | null = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    db.calls.push({ method, path: p, body });
    if (p === "/api/me") return json(route, { user_id: "u1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", ...me });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/webhooks/event-types") return json(route, { api_version: "2026-10-26", event_types: TYPES });
    if (p === "/api/webhooks/endpoints" && method === "GET") return json(route, { endpoints: db.endpoints, max: 20, disable_after_days: 5, retention_days: 14 });
    if (p === "/api/webhooks/endpoints" && method === "POST") {
      if (String(body?.url).includes("10.0.0.5")) {
        return json(route, { error: "That address is inside a private network, so we can't reach it from here.", code: "bad_request", field: "url" }, 400);
      }
      const made = endpoint("ep_new", { url: String(body?.url), description: String(body?.description ?? ""), events: body?.events as string[], last_success_at: null });
      db.endpoints.push(made);
      return json(route, { endpoint: made, secret: SECRET }, 201);
    }
    const m = p.match(/^\/api\/webhooks\/endpoints\/([^/]+)(\/.*)?$/);
    if (m) {
      const ep = db.endpoints.find((e) => e.id === m[1]);
      const rest = m[2] ?? "";
      if (!ep) return json(route, { error: "No such webhook endpoint." }, 404);
      if (!rest && method === "GET") return json(route, ep);
      if (!rest && method === "PUT") { Object.assign(ep, body); if (body?.enabled === true) { ep.disabled_reason = ""; ep.failing_since = null; } return json(route, ep); }
      if (!rest && method === "DELETE") { db.endpoints = db.endpoints.filter((e) => e !== ep); return json(route, { deleted: true }); }
      if (rest === "/secret") return json(route, { secret: SECRET, previous_secret_expires_at: null });
      if (rest === "/secret/rotate") {
        const until = Number(body?.overlap_hours) > 0 ? iso(-60 * Number(body?.overlap_hours)) : null;
        ep.previous_secret_expires_at = until;
        ep.secret_hint = "whsec_…oQs=";
        return json(route, { secret: ROTATED, previous_secret_expires_at: until });
      }
      if (rest === "/test") {
        const d = delivery("dtest", { ...REFUSED, event: "webhook.test", event_id: "evt_test" });
        db.deliveries.unshift(d);
        return json(route, d);
      }
      if (rest === "/deliveries") return json(route, { deliveries: db.deliveries });
      const r = rest.match(/^\/deliveries\/([^/]+)\/resend$/);
      if (r) {
        const d = db.deliveries.find((x) => x.id === r[1])!;
        Object.assign(d, { status: "handled", outcome: "Delivered (200)", reason: "", reason_message: "", reason_fix: "", attempts: [...(d.attempts as unknown[]), { at: iso(0), code: 200, duration_ms: 64, error: "" }] });
        return json(route, d);
      }
      if (rest === "/replay") return json(route, { queued: 3, found: 7, capped: false }, 202);
    }
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

/** Full-page screenshots at 1440 and 390, failing if the page scrolls sideways. */
async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("an admin sees each endpoint with its events and health", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/webhooks/");
  await expect(page.getByRole("heading", { level: 1, name: "Webhooks" })).toBeVisible();
  const list = page.getByRole("list", { name: "Webhook endpoints" });
  await expect(list.getByTestId("webhook-endpoint")).toHaveCount(2);
  const one = list.locator('[data-id="ep_one"]');
  await expect(one).toContainText("run.completed, run.failed");
  await expect(one).toContainText("Deploy bot");
  const two = list.locator('[data-id="ep_two"]');
  await expect(two).toContainText("All events");
  await expect(two).toContainText("Turned off: kept failing");
  await expect(page.getByRole("link", { name: "Read the webhooks guide" })).toHaveAttribute("href", "https://docs.coderhelm.com/api/webhooks/");
  await shot(page, "webhooks-list");
});

test("adding an endpoint shows the address error the gateway names, then the secret once", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/webhooks/");
  await page.getByRole("button", { name: "Add endpoint" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add a webhook endpoint" });
  await dialog.getByLabel("Address").fill("https://10.0.0.5/hook");
  await dialog.getByRole("button", { name: "Add endpoint" }).click();
  await expect(dialog.getByText("That address is inside a private network")).toBeVisible();
  await expect(dialog.getByLabel("Address")).toHaveAttribute("aria-invalid", "true");

  await dialog.getByLabel("Address").fill(LONG_URL);
  await dialog.getByLabel("Description").fill("Release dashboard");
  await dialog.getByRole("checkbox", { name: /All events/ }).uncheck();
  await dialog.getByRole("checkbox", { name: /review\.completed/ }).check();
  await dialog.getByRole("checkbox", { name: /run\.failed/ }).check();
  await dialog.getByRole("button", { name: "Add endpoint" }).click();
  const post = db.calls.filter((c) => c.method === "POST" && c.path === "/api/webhooks/endpoints").pop();
  expect(post?.body).toEqual({ url: LONG_URL, description: "Release dashboard", events: ["review.completed", "run.failed"], enabled: true });

  const made = page.getByRole("dialog", { name: "Endpoint added" });
  await expect(made.getByTestId("new-webhook-secret")).toHaveText(SECRET);
  await expect(made).toContainText("You won't see it again here");
  await shot(page, "webhooks-created");
  await made.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText(SECRET)).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Webhook endpoints" }).getByTestId("webhook-endpoint")).toHaveCount(3);
});

test("an endpoint's page: test, reveal and rotate, resend and replay", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/webhooks/?endpoint=ep_one");
  await expect(page.getByTestId("webhook-endpoint-page")).toBeVisible();

  // A test event that the endpoint refuses shows the reason and the fix.
  await page.getByRole("button", { name: "Send test event" }).click();
  const result = page.getByTestId("test-result");
  await expect(result).toHaveAttribute("data-status", "failed");
  await expect(result).toContainText("refused the event");
  await expect(result).toContainText("HTTP 401");
  await expect(result).toContainText("How to fix");

  // Reveal, then rotate with the default 24 hour overlap.
  await page.getByRole("button", { name: "Reveal" }).click();
  await expect(page.getByTestId("webhook-secret")).toHaveText(SECRET);
  await page.getByRole("button", { name: "Rotate secret" }).click();
  await page.getByTestId("confirm-dialog").getByRole("button", { name: "Make a new secret" }).click();
  await expect(page.getByTestId("rotated-secret")).toContainText(ROTATED);
  await expect(page.getByTestId("rotated-secret")).toContainText("keeps signing too until");
  expect(db.calls.find((c) => c.path.endsWith("/secret/rotate"))?.body).toEqual({ overlap_hours: 24 });

  // Resend the failed delivery.
  const failed = page.getByTestId("webhook-delivery").filter({ hasText: "run.failed" });
  await failed.getByRole("button", { name: "Attempts" }).click();
  await expect(failed).toContainText("Answered 401: bad signature");
  await shot(page, "webhooks-endpoint");
  await failed.getByRole("button", { name: "Resend" }).click();
  await expect(failed).toHaveAttribute("data-status", "handled");
  expect(db.calls.some((c) => c.method === "POST" && c.path === "/api/webhooks/endpoints/ep_one/deliveries/d2/resend")).toBe(true);

  // Replay the last day's missed events.
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  await expect(page.getByTestId("replay-result")).toContainText("3 events queued");
  const replay = db.calls.find((c) => c.path.endsWith("/replay"));
  expect(replay?.body?.only_failed).toBe(true);
  expect(typeof replay?.body?.since).toBe("string");
});

test("turning a failing endpoint back on, and deleting one", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/webhooks/?endpoint=ep_two");
  await expect(page.getByTestId("endpoint-health")).toContainText("5 days");
  await page.getByTestId("toggle-endpoint").click();
  await expect(page.getByTestId("endpoint-health")).toHaveCount(0);
  expect(db.calls.find((c) => c.method === "PUT")?.body).toEqual({ enabled: true });
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Delete endpoint" }).click();
  await page.getByTestId("confirm-dialog").getByRole("button", { name: "Delete endpoint" }).click();
  await expect(page).toHaveURL(/\/settings\/webhooks\/?$/);
  expect(db.calls.some((c) => c.method === "DELETE" && c.path === "/api/webhooks/endpoints/ep_two")).toBe(true);
});

test("members can't open the page", async ({ page }) => {
  await mockApi(page, { role: "member" });
  await page.goto("/settings/webhooks/");
  await expect(page.getByText("This page needs a different role")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add endpoint" })).toHaveCount(0);
});
