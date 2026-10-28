import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { pickOption } from "./select";

// Settings, then Deliveries, then Overview: how deliveries went over a
// period, against the one before. Every API call is answered here; nothing
// reaches a real backend. Names are made up.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

const ME = { user_id: "u_1", team_id: "t_1", github_login: "dana", email: "dana@example.org", avatar_url: "", role: "admin", mfa_enabled: false };

const DAY = 86_400_000;
const HOUR = 3_600_000;

function startOfDay(t: number) {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function series(period: string) {
  const hourly = period === "24h";
  const n = period === "24h" ? 24 : period === "30d" ? 30 : 7;
  const step = hourly ? HOUR : DAY;
  const last = hourly ? Math.floor(Date.now() / HOUR) * HOUR : startOfDay(Date.now());
  return Array.from({ length: n }, (_, i) => {
    const start = last - (n - 1 - i) * step;
    const failed = i % 3 === 0 ? 2 + (i % 5) : i === n - 2 ? 9 : 0;
    const ok = 120 + ((i * 37) % 60);
    return {
      start: new Date(start).toISOString().replace(/\.\d{3}Z$/, "Z"),
      end: new Date(start + step).toISOString().replace(/\.\d{3}Z$/, "Z"),
      deliveries: ok + failed,
      ok,
      failed,
      success_rate: ok / (ok + failed),
      p95_ms: 600 + ((i * 113) % 900),
      previous_deliveries: 110 + ((i * 29) % 70),
    };
  });
}

function full(period: string) {
  const s = series(period);
  return {
    period,
    granularity: period === "24h" ? "hour" : "day",
    from: s[0].start,
    to: s[s.length - 1].end,
    previous_from: s[0].start,
    previous_to: s[0].start,
    summary: { deliveries: 1284, handled: 1190, ignored: 61, failed: 33, success_rate: 0.9743, retried: 41, retried_ok: 37, retries: 58, p50_ms: 180, p95_ms: 1240, p99_ms: 4800 },
    previous: { deliveries: 1120, handled: 1040, ignored: 52, failed: 28, success_rate: 0.975, retried: 30, retried_ok: 26, retries: 44, p50_ms: 170, p95_ms: 1100, p99_ms: 4100 },
    series: s,
    sources: [
      { source: "github", direction: "inbound", deliveries: 912, ok: 905, failed: 7, success_rate: 0.9923, p95_ms: 640, previous_deliveries: 870, previous_success_rate: 0.9897 },
      { source: "webhook", direction: "outbound", deliveries: 214, ok: 202, failed: 12, success_rate: 0.9439, p95_ms: 2900, previous_deliveries: 150, previous_success_rate: 0.98 },
      { source: "slack", direction: "outbound", deliveries: 101, ok: 99, failed: 2, success_rate: 0.9802, p95_ms: 420, previous_deliveries: 60, previous_success_rate: 1 },
      { source: "email", direction: "outbound", deliveries: 57, ok: 45, failed: 12, success_rate: 0.7895, p95_ms: 300, previous_deliveries: 40, previous_success_rate: 0.95 },
    ],
    reasons: [
      { code: "webhook_server_error", message: "Your webhook endpoint answered with a server error (5xx).", fix: "Check your endpoint's logs for this event id. CoderHelm retries for about a day.", count: 12, previous_count: 3, sources: ["webhook"] },
      { code: "email_sandbox", message: "Amazon SES only sends to confirmed addresses on this account (the SES sandbox).", fix: "Request production access in Amazon SES, or confirm the recipient.", count: 12, previous_count: 0, sources: ["email"] },
      { code: "handler_error", message: "The event was understood but handling it failed.", fix: "Press Redeliver. If it keeps failing, contact support with the delivery id.", count: 7, previous_count: 9, sources: ["github"] },
      { code: "chat_rejected", message: "Slack or Teams refused the message.", fix: "Check the webhook in Settings, Notifications and send a test.", count: 2, previous_count: 1, sources: ["slack"] },
    ],
    events: [
      { event: "run.failed", source: "webhook", failed: 9 },
      { event: "invite", source: "email", failed: 8 },
      { event: "pull_request.synchronize", source: "github", failed: 5 },
    ],
    endpoints: [
      { id: "ep_off", url: "https://hooks.example.com/old-bot", description: "Old incident bot", deleted: false, enabled: false, disabled_reason: "failing", deliveries: 0, ok: 0, failed: 0, success_rate: null, p50_ms: null, p95_ms: null, streak: 41, last_failure_at: new Date(Date.now() - 3 * DAY).toISOString(), last_failure_reason: "webhook_unreachable", last_failure_message: "Your webhook endpoint couldn't be reached (the connection failed or its name didn't resolve).", failing_since: new Date(Date.now() - 6 * DAY).toISOString(), last_success_at: null },
      { id: "ep_ops", url: "https://ops.example.com/coderhelm/events", description: "", deleted: false, enabled: true, disabled_reason: "", deliveries: 214, ok: 202, failed: 12, success_rate: 0.9439, p50_ms: 320, p95_ms: 2900, streak: 0, last_failure_at: new Date(Date.now() - 2 * HOUR).toISOString(), last_failure_reason: "webhook_server_error", last_failure_message: "Your webhook endpoint answered with a server error (5xx).", failing_since: null, last_success_at: new Date(Date.now() - 5 * 60_000).toISOString() },
    ],
    seen_sources: ["email", "github", "slack", "webhook"],
    backfill: { complete: true },
    kept_days: 120,
    records_kept_days: 14,
  };
}

function empty(period: string) {
  const zero = { deliveries: 0, handled: 0, ignored: 0, failed: 0, success_rate: null, retried: 0, retried_ok: 0, retries: 0, p50_ms: null, p95_ms: null, p99_ms: null };
  const s = series(period).map((p) => ({ ...p, deliveries: 0, ok: 0, failed: 0, success_rate: null, p95_ms: null, previous_deliveries: 0 }));
  return { ...full(period), summary: zero, previous: zero, series: s, sources: [], reasons: [], events: [], endpoints: [], seen_sources: [], backfill: { complete: false } };
}

function few(period: string) {
  const f = full(period);
  const s = f.series.map((p, i) => (i === f.series.length - 1 ? { ...p, deliveries: 6, ok: 5, failed: 1, success_rate: 5 / 6, previous_deliveries: 0 } : { ...p, deliveries: 0, ok: 0, failed: 0, success_rate: null, p95_ms: null, previous_deliveries: 0 }));
  return {
    ...f,
    summary: { deliveries: 6, handled: 5, ignored: 0, failed: 1, success_rate: 0.8333, retried: 1, retried_ok: 0, retries: 2, p50_ms: 210, p95_ms: 900, p99_ms: 980 },
    previous: { deliveries: 0, handled: 0, ignored: 0, failed: 0, success_rate: null, retried: 0, retried_ok: 0, retries: 0, p50_ms: null, p95_ms: null, p99_ms: null },
    series: s,
    sources: [{ source: "slack", direction: "outbound", deliveries: 6, ok: 5, failed: 1, success_rate: 0.8333, p95_ms: 900, previous_deliveries: 0, previous_success_rate: null }],
    reasons: [{ ...f.reasons[3], count: 1, previous_count: 0 }],
    events: [{ event: "run.finished", source: "slack", failed: 1 }],
    endpoints: [],
    seen_sources: ["slack"],
  };
}

interface Backend {
  asks: URLSearchParams[];
  lists: URLSearchParams[];
}

async function setup(page: Page, mode: "full" | "empty" | "few" = "full"): Promise<Backend> {
  const db: Backend = { asks: [], lists: [] };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.pathname === "/runtime-config.js", (route) => route.fulfill({ contentType: "text/javascript", body: "window.__CODERHELM_CONFIG__ = {};" }));
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const u = new URL(route.request().url());
    const p = decodeURIComponent(u.pathname);
    if (p === "/api/me") return json(route, ME);
    if (p === "/api/usage") return json(route, { month: "2026-10", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "example-org", status: "active", current: true }] });
    if (p === "/api/deliveries/analytics") {
      db.asks.push(u.searchParams);
      const period = u.searchParams.get("period") || "7d";
      return json(route, mode === "empty" ? empty(period) : mode === "few" ? few(period) : full(period));
    }
    if (p === "/api/deliveries") {
      db.lists.push(u.searchParams);
      return json(route, {
        deliveries: [],
        summary: { total: 0, ok: 0, failed: 0, pending: 0, success_rate: null, oldest_pending_at: null, last_failure_at: null },
        sources: [],
        retention_days: 14,
        sharing: { available: false, enabled: false, payloads: false },
        hybrid: false,
      });
    }
    return json(route, {});
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true });
}

for (const vp of [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
]) {
  test(`overview at ${vp.name}: tiles, charts, reasons, endpoints, sources and no sideways scroll`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const db = await setup(page);
    await page.goto("/settings/deliveries/?view=overview");
    await expect(page.getByRole("heading", { name: "Deliveries", level: 1 })).toBeVisible();
    await expect(page.getByTestId("deliveries-page").getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("tile-success")).toContainText("97.4%");
    await expect(page.getByTestId("tile-success")).toContainText("0.1 pts lower than the previous 7 days");
    await expect(page.getByTestId("tile-deliveries")).toContainText("1,284");
    await expect(page.getByTestId("tile-deliveries")).toContainText("15% more than the previous 7 days");
    await expect(page.getByTestId("tile-deliveries")).toContainText("41 needed a retry, 37 then went fine");
    await expect(page.getByTestId("tile-failures")).toContainText("33");
    await expect(page.getByTestId("tile-failures")).toContainText("18% more than the previous 7 days");
    await expect(page.getByTestId("tile-latency")).toContainText("13% slower than the previous 7 days");
    await expect(page.getByTestId("chart-volume").locator(".recharts-bar-rectangle").first()).toBeVisible();
    await expect(page.getByTestId("chart-rate").locator(".recharts-line-curve")).toBeVisible();
    await expect(page.getByTestId("reason-row")).toHaveCount(4);
    await expect(page.getByTestId("reason-row").first()).toContainText("server error (5xx)");
    await expect(page.getByTestId("reason-row").first()).toContainText("3 in the previous 7 days");
    await expect(page.getByTestId("endpoint-row").filter({ visible: true })).toHaveCount(2);
    await expect(page.getByText("Off: kept failing").filter({ visible: true }).first()).toBeVisible();
    expect(db.asks.at(-1)?.get("period")).toBe("7d");
    // Nothing is wider than the screen.
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(wide).toBeLessThanOrEqual(1);
    await page.waitForTimeout(400);
    await shot(page, `delivery-overview-${vp.name}`);
  });
}

test("filters: period, status, source and endpoint go to the server and the address", async ({ page }) => {
  const db = await setup(page);
  await page.goto("/settings/deliveries/?view=overview");
  await expect(page.getByTestId("tile-success")).toBeVisible();

  await page.getByRole("group", { name: "Period" }).getByRole("button", { name: "24 hours" }).click();
  await expect.poll(() => db.asks.at(-1)?.get("period")).toBe("24h");
  await expect(page).toHaveURL(/period=24h/);
  await expect(page.getByTestId("tile-success")).toContainText("the previous 24 hours");

  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Failed" }).click();
  await expect.poll(() => db.asks.at(-1)?.get("status")).toBe("failed");

  await pickOption(page.getByRole("combobox", { name: "Source" }), "webhook");
  await expect.poll(() => db.asks.at(-1)?.get("source")).toBe("webhook");

  await pickOption(page.getByRole("combobox", { name: "Endpoint" }), "ep_ops");
  await expect.poll(() => db.asks.at(-1)?.get("endpoint")).toBe("ep_ops");
  await expect(page).toHaveURL(/endpoint=ep_ops/);

  // The list tab keeps the source and status.
  await expect(page.getByTestId("deliveries-page").getByRole("link", { name: "Deliveries", exact: true })).toHaveAttribute("href", /source=webhook/);
  await page.getByTestId("overview-clear").click();
  await expect.poll(() => db.asks.at(-1)?.get("source")).toBeNull();
  await expect(page).not.toHaveURL(/source=|status=|endpoint=/);
});

test("drill in: tiles, a bar, a reason, an endpoint and an event open the filtered list", async ({ page }) => {
  const db = await setup(page);
  await page.goto("/settings/deliveries/?view=overview");
  await expect(page.getByTestId("tile-success")).toBeVisible();

  // A failure reason opens failed deliveries with that reason, for the period.
  const reason = page.getByTestId("reason-row").filter({ hasText: "SES sandbox" });
  await expect(reason).toHaveAttribute("href", /status=failed/);
  await reason.click();
  await expect(page).toHaveURL(/reason=email_sandbox/);
  await expect(page.getByTestId("narrow-reason")).toContainText("Email sandbox");
  await expect(page.getByTestId("narrow-time")).toBeVisible();
  await expect.poll(() => db.lists.at(-1)?.get("reason")).toBe("email_sandbox");
  expect(db.lists.at(-1)?.get("status")).toBe("failed");
  expect(db.lists.at(-1)?.get("since")).toMatch(/^\d{4}-\d\d-\d\dT00:00:00Z$/);
  expect(db.lists.at(-1)?.get("until")).toMatch(/^\d{4}-\d\d-\d\dT00:00:00Z$/);
  await page.getByTestId("narrow-reason").getByRole("button").click();
  await expect.poll(() => db.lists.at(-1)?.get("reason")).toBeNull();
  await page.goBack();
  await page.goBack();

  // A bar opens its own day.
  await expect(page.getByTestId("chart-volume")).toBeVisible();
  const bars = page.getByTestId("chart-volume").locator(".recharts-bar-rectangle");
  await bars.last().click();
  await expect(page).toHaveURL(/from=.*until=/);
  const since = db.lists.at(-1)?.get("since") ?? "";
  const until = db.lists.at(-1)?.get("until") ?? "";
  expect(Date.parse(until) - Date.parse(since)).toBe(DAY);
  await page.goBack();

  // The table view of the chart has the same days as links.
  await page.getByRole("button", { name: "Show table: Deliveries per day" }).click();
  await expect(page.getByRole("table", { name: "Deliveries over time" }).getByRole("link").first()).toHaveAttribute("href", /from=.*until=/);

  // Endpoints: the name opens its settings, the count lists its deliveries.
  const ops = page.locator('[data-testid="endpoint-row"][data-id="ep_ops"]').filter({ visible: true }).first();
  await expect(ops.getByTestId("endpoint-link")).toHaveAttribute("href", "/settings/webhooks/?endpoint=ep_ops");
  await expect(page.getByTestId("endpoint-deliveries").filter({ visible: true }).last()).toHaveAttribute("href", /endpoint=ep_ops/);
  await expect(page.getByTestId("tile-failures")).toHaveAttribute("href", /status=failed/);
  await expect(page.getByTestId("event-link").filter({ visible: true }).first()).toHaveAttribute("href", /q=run\.failed/);
  await page.getByTestId("source-link").filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/source=github/);
  await expect.poll(() => db.lists.at(-1)?.get("source")).toBe("github");
});

for (const vp of [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
]) {
  test(`empty and low-data states read plainly at ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await setup(page, "empty");
    await page.goto("/settings/deliveries/?view=overview");
    await expect(page.getByTestId("overview-empty")).toContainText("No deliveries in the last 7 days");
    await expect(page.getByTestId("overview-backfill")).toBeVisible();
    await shot(page, `delivery-overview-empty-${vp.name}`);

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await setup(page, "few");
    await page.goto("/settings/deliveries/?view=overview");
    await expect(page.getByTestId("overview-low-data")).toContainText("Only 6 deliveries");
    await expect(page.getByTestId("tile-deliveries")).toContainText("None in the previous 7 days");
    await expect(page.getByTestId("tile-success")).toContainText("Nothing to compare with");
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(wide).toBeLessThanOrEqual(1);
    await page.waitForTimeout(400);
    await shot(page, `delivery-overview-few-${vp.name}`);
  });
}
