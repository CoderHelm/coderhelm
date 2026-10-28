import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { expectSelectValue, pickOption, selectLabels } from "./select";

// How each run was started, on the runs list and the run page: one run of
// every kind the gateway sends (`trigger` on a run), the "Started by" filter
// and its place in the address, and a backend too old to send `trigger`.
// Every API call is answered here.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

type Trigger = { kind: string; label: string; ref?: string | null; ref_url?: string | null; by?: string | null };
type Run = Record<string, unknown> & { run_id: string; trigger?: Trigger };

const run = (id: string, minsAgo: number, over: Partial<Run>): Run => ({
  run_id: id,
  status: "completed",
  ticket_source: "github",
  ticket_id: "GH-1",
  title: "A run",
  repo: "your-team/web",
  duration_s: 420,
  created_at: iso(minsAgo),
  ...over,
});

const RUNS: Run[] = [
  run("01JIRA", 1, {
    ticket_source: "jira",
    ticket_id: "ABC-123",
    title: "Add rate limiting to the login form",
    trigger: { kind: "jira", label: "Jira", ref: "ABC-123", ref_url: "https://your-team.atlassian.net/browse/ABC-123", by: "Dana Reyes" },
  }),
  run("01GITHUB", 2, {
    ticket_id: "GH-42",
    title: "Fix the broken footer link",
    trigger: { kind: "github", label: "GitHub issue", ref: "#42", ref_url: "https://github.com/your-team/web/issues/42", by: "octocat" },
  }),
  run("01FLAKY", 3, {
    status: "running",
    ticket_source: "alert",
    ticket_id: "E2E-FIX-a7f51433483adf820849",
    title: "Fix flaky test: checkout keeps the cart after sign in",
    trigger: { kind: "coderhelm", label: "Started by Coderhelm · flaky test", ref: null, ref_url: "/tests/test?id=a7f51433483adf820849", by: null },
  }),
  run("01LOGAUTO", 4, {
    ticket_source: "alert",
    ticket_id: "LOG-1A2B3C4D",
    title: "Null user id in the session refresh handler",
    trigger: { kind: "coderhelm", label: "Started by Coderhelm · log finding", ref: "/aws/lambda/api", ref_url: "/logs?finding=rec-9", by: null },
  }),
  run("01ALERT", 5, {
    status: "failed",
    ticket_source: "alert",
    ticket_id: "ALERT-3f9c2a71",
    title: "api-5xx above 2% for 5 minutes",
    trigger: { kind: "alert", label: "Alert", ref: "api-5xx above 2% for 5 minutes", ref_url: "/alerts/detail?id=ev-1", by: null },
  }),
  run("01PLAN", 6, {
    ticket_id: "GH-9",
    title: "Store request counts per user",
    trigger: { kind: "plan", label: "Plan", ref: "Rate limits for every public form", ref_url: "/plans/detail?id=p1", by: "Dana Reyes" },
  }),
  run("01DASH", 7, {
    ticket_source: "alert",
    ticket_id: "LOG-9F8E7D6C",
    title: "Timeout reading the price list",
    trigger: { kind: "dashboard", label: "Dashboard · log finding", ref: "/aws/lambda/prices", ref_url: "/logs?finding=rec-4", by: "sam@example.com" },
  }),
  run("01CHAT", 8, {
    title: "Rename the billing settings tab",
    trigger: { kind: "chat", label: "Slack", ref: null, ref_url: null, by: "Ana Diaz" },
  }),
];

interface Backend {
  runs: Run[];
  calls: string[];
}

async function mockApi(page: Page, runs: Run[] = RUNS): Promise<Backend> {
  const db: Backend = { runs, calls: [] };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    db.calls.push(`${req.method()} ${p}${url.search}`);
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: "sam", email: "sam@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/support/badge") return json(route, { waiting: 0, queue_open: null });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "your-team/web", enabled: true }] });
    if (p === "/api/plugins/catalog") return json(route, { plugins: [] });
    if (p === "/api/skills/asks") return json(route, { asks: [] });
    if (p === "/api/skills/used") return json(route, { skills: [], agents: [], sources: [], standards: [] });
    if (p === "/api/search") return json(route, { q: url.searchParams.get("q"), runs: [], reviews: [], releases: [], plans: [] });
    if (p === "/api/runs" && req.method() === "GET") {
      // The gateway filters on `started_by`; so does this stand-in.
      const kinds = (url.searchParams.get("started_by") ?? "").split(",").filter(Boolean);
      const shown = db.runs.filter((r) => !kinds.length || (r.trigger && kinds.includes(r.trigger.kind)));
      return json(route, { runs: shown, next: null, scanned: db.runs.length });
    }
    const m = p.match(/^\/api\/runs\/([^/]+)(\/.*)?$/);
    if (m) {
      const r = db.runs.find((x) => x.run_id === decodeURIComponent(m[1]));
      if (!r) return json(route, { error: "not found" }, 404);
      const sub = m[2] ?? "";
      if (sub === "") return json(route, { ...r, pass_history: [], progress_notes: [], questions: [], answers: [] });
      if (sub === "/openspec") return json(route, {});
      if (sub === "/traces") return json(route, { traces: [] });
      if (sub === "/agent-log") return json(route, { passes: [], live_events: [] });
    }
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  return db;
}

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/favicon|net::ERR_ABORTED|net::ERR_FAILED|Failed to load resource/.test(text)) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

/** A dashboard path as a link has it: the static export adds a slash before the query. */
const local = (p: string) => new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("\\?", "/?\\?")}$`);

const rowOf = (page: Page, title: string) => page.getByTestId("run-row").filter({ hasText: title });

test("each row says how its run was started, by whom, and links to what started it", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByTestId("run-row")).toHaveCount(RUNS.length);

  const jira = rowOf(page, "Add rate limiting").getByTestId("run-trigger");
  await expect(jira).toHaveAttribute("data-kind", "jira");
  await expect(jira).toHaveText("Jira·ABC-123 (opens in a new tab)·by Dana Reyes");
  await expect(jira.getByRole("link", { name: /ABC-123/ })).toHaveAttribute("href", "https://your-team.atlassian.net/browse/ABC-123");

  const gh = rowOf(page, "broken footer").getByTestId("run-trigger");
  await expect(gh).toHaveText("GitHub issue·#42 (opens in a new tab)·by octocat");
  await expect(gh.getByRole("link", { name: /#42/ })).toHaveAttribute("href", "https://github.com/your-team/web/issues/42");

  // Coderhelm's own work: the label, linked to the test; never the internal id.
  const flaky = rowOf(page, "Fix flaky test");
  await expect(flaky.getByTestId("run-trigger")).toHaveText("Started by Coderhelm · flaky test");
  await expect(flaky.getByRole("link", { name: "Started by Coderhelm · flaky test" })).toHaveAttribute("href", local("/tests/test?id=a7f51433483adf820849"));
  await expect(flaky).not.toContainText("E2E-FIX");

  const log = rowOf(page, "Null user id").getByTestId("run-trigger");
  await expect(log).toHaveText("Started by Coderhelm · log finding·/aws/lambda/api");
  await expect(log.getByRole("link", { name: "/aws/lambda/api" })).toHaveAttribute("href", local("/logs?finding=rec-9"));
  await expect(rowOf(page, "Null user id")).not.toContainText("LOG-1A2B3C4D");

  // The alarm's name is the row's title already: the label carries the link.
  const alert = rowOf(page, "api-5xx").getByTestId("run-trigger");
  await expect(alert).toHaveText("Alert");
  await expect(alert.getByRole("link", { name: "Alert" })).toHaveAttribute("href", local("/alerts/detail?id=ev-1"));
  await expect(rowOf(page, "api-5xx")).not.toContainText("ALERT-3f9c2a71");

  const plan = rowOf(page, "Store request counts").getByTestId("run-trigger");
  await expect(plan).toHaveText("Plan·Rate limits for every public form·by Dana Reyes");
  await expect(plan.getByRole("link", { name: "Rate limits for every public form" })).toHaveAttribute("href", local("/plans/detail?id=p1"));

  await expect(rowOf(page, "Timeout reading").getByTestId("run-trigger")).toHaveText("Dashboard · log finding·/aws/lambda/prices·by sam@example.com");
  const chat = rowOf(page, "Rename the billing").getByTestId("run-trigger");
  await expect(chat).toHaveText("Slack·by Ana Diaz");
  await expect(chat.getByRole("link")).toHaveCount(0);

  // The repo and the time taken still follow.
  await expect(rowOf(page, "Add rate limiting")).toContainText("your-team/web");
  await expect(rowOf(page, "Add rate limiting")).toContainText("took 7m");

  await shot(page, "runs-started-by");
  expect(errors).toEqual([]);
});

test("Started by filters on the server and stays in the address", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/");
  await expect(page.getByTestId("run-row")).toHaveCount(RUNS.length);

  const filter = page.getByRole("combobox", { name: "Started by" });
  await expectSelectValue(filter, "");
  const options = await selectLabels(filter);
  expect(options).toEqual([
    "Started by anyone",
    "Started by Jira",
    "Started by GitHub",
    "Started by Coderhelm",
    "Started by Alerts",
    "Started by Plans",
    "Started by Dashboard",
    "Started by Chat",
  ]);

  await pickOption(filter, "coderhelm");
  await expect(filter).toHaveText("Started by Coderhelm");
  await expect(page).toHaveURL(/[?&]started_by=coderhelm/);
  await expect(page.getByTestId("run-row")).toHaveCount(2);
  expect(db.calls.some((c) => c.startsWith("GET /api/runs?") && c.includes("started_by=coderhelm"))).toBe(true);
  await shot(page, "runs-started-by-coderhelm");

  // A reload keeps it; with the status filter it narrows further.
  await page.reload();
  await expectSelectValue(page.getByRole("combobox", { name: "Started by" }), "coderhelm");
  await expect(page.getByTestId("run-row")).toHaveCount(2);
  await page.getByRole("group", { name: "Show runs" }).getByRole("button", { name: "Active" }).click();
  await expect(page).toHaveURL(/status=active/);
  await expect(page).toHaveURL(/started_by=coderhelm/);

  // Clear filters drops it.
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/started_by/);
  await expect(page.getByTestId("run-row")).toHaveCount(RUNS.length);

  // An address from a link opens filtered; an unknown word is ignored.
  await page.goto("/?started_by=plan");
  await expect(page.getByTestId("run-row")).toHaveCount(1);
  await expect(page.getByTestId("run-row")).toContainText("Store request counts");
  await page.goto("/?started_by=nope");
  await expectSelectValue(page.getByRole("combobox", { name: "Started by" }), "");
  await expect(page.getByTestId("run-row")).toHaveCount(RUNS.length);

  // Nothing started that way: the empty state says so.
  db.runs = RUNS.filter((r) => r.trigger?.kind !== "chat");
  await page.goto("/");
  await pickOption(page.getByRole("combobox", { name: "Started by" }), "chat");
  await expect(page.getByTestId("run-row")).toHaveCount(0);
  await expect(page.getByText("No runs were started that way.", { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the run page's header says how the run was started", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);

  await page.goto("/runs/detail/?id=01FLAKY");
  await expect(page.getByRole("heading", { name: /Fix flaky test/ })).toBeVisible();
  const header = page.getByTestId("run-trigger");
  await expect(header).toHaveAttribute("data-kind", "coderhelm");
  await expect(header).toHaveText("Started by Coderhelm · flaky test");
  await expect(header.getByRole("link")).toHaveAttribute("href", local("/tests/test?id=a7f51433483adf820849"));
  // The internal id is only in the technical details, named as such.
  await expect(page.getByText("E2E-FIX-a7f51433483adf820849")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Run views" }).getByRole("link", { name: "Details" }).click();
  await expect(page.getByText("Internal ID")).toBeVisible();
  await page.getByRole("navigation", { name: "Run views" }).getByRole("link", { name: "Overview" }).click();
  await shot(page, "run-detail-started-by-coderhelm");

  await page.goto("/runs/detail/?id=01JIRA");
  await expect(page.getByTestId("run-trigger")).toHaveText("Jira·ABC-123 (opens in a new tab)·by Dana Reyes");
  await expect(page.getByTestId("run-trigger").getByRole("link")).toHaveAttribute("href", "https://your-team.atlassian.net/browse/ABC-123");
  await shot(page, "run-detail-started-by-jira");
  expect(errors).toEqual([]);
});

test("a backend that sends no trigger still shows the ticket", async ({ page }) => {
  const errors = watchConsole(page);
  const old = RUNS.slice(0, 2).map(({ trigger: _t, ...r }) => r as Run);
  await mockApi(page, old);
  await page.goto("/");
  await expect(page.getByTestId("run-row")).toHaveCount(2);
  await expect(page.getByTestId("run-trigger")).toHaveCount(0);
  await expect(rowOf(page, "Add rate limiting")).toContainText("ABC-123");
  await page.goto("/runs/detail/?id=01JIRA");
  await expect(page.getByText(/Jira ticket ABC-123/)).toBeVisible();
  expect(errors).toEqual([]);
});
