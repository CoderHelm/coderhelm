import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Every API call is answered here. Nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

function days(n: number) {
  const out = [];
  const end = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    out.push({ day: d, runs: i % 3, prs_opened: i % 2, merged: i % 4 === 0 ? 1 : 0, failed: i % 7 === 0 ? 1 : 0, cost_usd: (i % 5) * 1.25, reviews: i % 3 });
  }
  return out;
}

const SUMMARY = {
  runs: 42, prs_opened: 30, prs_merged: 21, prs_closed: 3, prs_open: 6, merge_rate: 0.7, failed_runs: 4, failure_rate: 0.095,
  cost_usd: 96.4, run_cost_usd: 41.2, cost_basis: "metered", cost_by_feature: [{ feature: "review", cost_usd: 50 }, { feature: "run", cost_usd: 41.2 }, { feature: "feedback", cost_usd: 5.2 }],
  cost_per_run: 2.3, cost_per_merged_pr: 4.59, tokens_in: 12_000_000, tokens_out: 900_000,
  median_run_minutes: 11.5, median_hours_to_merge: 5.2, time_to_merge_known: 12, merged_untouched: 9, merged_with_edits: 3, edits_known: 12, reviews: 55,
};

// Invented numbers: the previous period recorded nobody as asking for work.
const PREV_COUNTS = {
  tickets: 40, runs: 70, prs_opened: 50, prs_merged: 41, prs_open: 3, prs_reviewed: 100, reviews_posted: 400,
  approvals: 80, changes_requested: 40, comments: 280, repos: 6, people: 0, runs_with_requester: 0,
  deploys: 0, deploys_preview: 0, deploys_staging: 0, deploys_prod: 0, deploys_other: 0,
  deploys_succeeded: 0, deploys_failed: 0, deploys_preview_failed: 0, deploys_staging_failed: 0, deploys_prod_failed: 0, deploys_other_failed: 0,
};
const CUR_COUNTS = {
  tickets: 45, runs: 62, prs_opened: 50, prs_merged: 30, prs_open: 12, prs_reviewed: 210, reviews_posted: 660,
  approvals: 300, changes_requested: 250, comments: 110, repos: 8, people: 5, runs_with_requester: 30,
  deploys: 14, deploys_preview: 2, deploys_staging: 9, deploys_prod: 3, deploys_other: 0,
  deploys_succeeded: 13, deploys_failed: 1, deploys_preview_failed: 0, deploys_staging_failed: 0, deploys_prod_failed: 1, deploys_other_failed: 0,
};
const FULL_COUNTS = { ...PREV_COUNTS, tickets: 52, runs: 90, prs_opened: 63, prs_reviewed: 140, reviews_posted: 520 };

/** Running totals by day: the current period ends today, the previous one is a day shorter. */
function compareDaily(start: Date, prevStart: Date, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const day = (d: Date) => new Date(d.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const last = i === n - 1;
    return {
      offset: i, day: day(start), previous_day: last ? null : day(prevStart),
      tickets: 2 * (i + 1), prs_opened: i + 1, prs_reviewed: 3 * (i + 1), deploys: i + 2,
      previous_tickets: last ? null : i + 1, previous_prs_opened: last ? null : i + 1, previous_prs_reviewed: last ? null : 2 * (i + 1),
      previous_deploys: last ? null : 0,
    };
  });
}

function windows(period: string) {
  const now = new Date();
  if (period === "mtd") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prevEnd = new Date(Math.min(prevStart.getTime() + (now.getTime() - start.getTime()), start.getTime()));
    return { days: Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 86_400_000)), start, end: now, prevStart, prevEnd, full: { start: prevStart, end: start } };
  }
  const n = Number(period);
  const start = new Date(now.getTime() - n * 86_400_000);
  return { days: n, start, end: now, prevStart: new Date(start.getTime() - n * 86_400_000), prevEnd: start, full: null };
}

/** How far earlier deploys were read: known (a real 0 before), still counting, or read only from the start of this period. */
type DeployState = "known" | "counting" | "before_records";

function analytics(period: string, repo: string | null, deployState: DeployState = "known", noAccess: string[] = []) {
  const scale = repo ? 0.5 : 1;
  const w = windows(period);
  const daysN = w.days;
  return {
    days: daysN,
    basis: period === "mtd" ? "month_to_date" : "days",
    period: { start: w.start.toISOString(), end: w.end.toISOString() },
    previous_period: { start: w.prevStart.toISOString(), end: w.prevEnd.toISOString() },
    comparison: {
      current: CUR_COUNTS,
      previous: PREV_COUNTS,
      previous_full: w.full ? FULL_COUNTS : null,
      previous_full_period: w.full ? { start: w.full.start.toISOString(), end: w.full.end.toISOString() } : null,
      people_comparable: false,
      deploys_since: deployState === "counting" ? null : deployState === "known" ? new Date(w.prevStart.getTime() - 86_400_000).toISOString() : w.start.toISOString(),
      deploys_comparable: deployState === "known",
      deploys_previous_state: deployState,
      deploys_backfill: deployState === "counting" ? "running" : "done",
      deploys_no_access: noAccess,
      daily: compareDaily(w.start, w.prevStart, Math.max(2, daysN)).map((d) => (deployState === "counting" ? { ...d, previous_deploys: null } : d)),
    },
    summary: { ...SUMMARY, prs_merged: Math.round(21 * scale), runs: Math.round(42 * scale) },
    previous: { ...SUMMARY, prs_merged: 15, merge_rate: 0.6, cost_per_merged_pr: 5.1, failed_runs: 6, median_hours_to_merge: 7.0, reviews: 40 },
    daily: days(daysN),
    sources: [
      { source: "jira", runs: 30, prs: 22, merged: 16, merge_rate: 0.727 },
      { source: "github", runs: 12, prs: 8, merged: 5, merge_rate: 0.625 },
    ],
    repos: [
      { repo: "your-team/web", runs: 28, prs: 20, merged: 15, failed: 2, cost_usd: 60.1, merge_rate: 0.75, reviews: 40 },
      { repo: "your-team/backend", runs: 14, prs: 10, merged: 6, failed: 2, cost_usd: 36.3, merge_rate: 0.6, reviews: 15 },
    ],
    people: [
      { person: "", kind: "not_recorded", runs: 30, merged: 9 },
      { person: "Ada Lovelace", kind: "person", runs: 25, merged: 14 },
      { person: "Coderhelm (E2E tests)", kind: "coderhelm", runs: 4, merged: 2 },
    ],
    failures: [
      { reason: "Timed out after #s", count: 3, last_run_id: "01RUNFAILED00000000000000A", last_at: new Date().toISOString() },
      { reason: "Branch … already exists", count: 1, last_run_id: "01RUNFAILED00000000000000B", last_at: new Date().toISOString() },
    ],
    ci: {
      runs_with_red_ci: 8, fixed_by_coderhelm: 6, fix_rate: 0.75, fix_attempts: 11, fix_commits: 9, red_on_base_runs: 1,
      outcomes: { green_after_fix: 6, green_without_fix: 0, flaky: 1, red_on_base: 1, gave_up: 1, running: 0 },
      gave_up_reasons: [{ reason: "Fix attempts used up", count: 1 }],
    },
    reviews: {
      posted: 55, approve: 30, request_changes: 5, comment: 20, questions: 4, prs_reviewed: 38, findings: 70,
      findings_fixed: 24, findings_settled_by_person: 8, acted_on_rate: 0.75, outcomes_known_reviews: 20, thumbs_up: 12, thumbs_down: 2,
    },
    lookups: {
      total: 64, refused: 3, failed: 1,
      by_source: [{ source: "orders-db database", total: 40, refused: 3, failed: 0 }, { source: "Service logs", total: 24, refused: 0, failed: 1 }],
      by_actor: [{ actor: "planner", total: 30 }, { actor: "reviewer", total: 20 }, { actor: "people", total: 14 }],
    },
    steps: [
      { step: "implement", count: 40, tokens_in: 8_000_000, tokens_out: 600_000, avg_seconds: 320 },
      { step: "ci_fix", count: 11, tokens_in: 1_500_000, tokens_out: 90_000, avg_seconds: 150 },
    ],
    steps_window_days: 30,
    merged_recent: [
      { run_id: "01RUNMERGED00000000000000A", title: "Show the class schedule on the details page", repo: "your-team/web", pr_number: 101, pr_url: "https://github.com/your-team/web/pull/101", hours_to_merge: 3.5, human_commits: 0 },
      { run_id: "01RUNMERGED00000000000000B", title: "Retry the sync job once", repo: "your-team/backend", pr_number: 55, pr_url: "https://github.com/your-team/backend/pull/55", hours_to_merge: null, human_commits: null },
    ],
    failed_recent: [
      { run_id: "01RUNFAILED00000000000000A", title: "Update the pricing page", repo: "your-team/web", reason: "Timed out after #s", at: new Date().toISOString() },
    ],
    repo_names: ["your-team/backend", "your-team/web"],
  };
}

interface Backend { calls: string[]; fail: boolean; empty: boolean; oldServer: boolean; estimated: number; recovered: number; deliveries?: "ok" | "refused"; deployState?: DeployState; noAccess?: string[]; notRead?: { repo: string; reason: string }[]; progress?: { read: number; total: number; resumes_at?: string | null } | null }

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { calls: [], fail: false, empty: false, oldServer: false, estimated: 0, recovered: 0, ...init };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    db.calls.push(p + url.search);
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/stats") {
      const month = { total_runs: 42, completed: 30, failed: 4, in_progress: 8, total_cost_usd: 96.4, total_tokens_in: 12_000_000, total_tokens_out: 900_000, merge_rate: 0.7, estimated_calls: db.estimated, recovered_calls: db.recovered };
      return json(route, { month, all_time: month });
    }
    if (p === "/api/analytics") {
      if (db.fail) return json(route, { error: "boom" }, 500);
      const period = url.searchParams.get("period") === "mtd" ? "mtd" : url.searchParams.get("days") || "30";
      const { comparison: base, ...older } = analytics(period, url.searchParams.get("repo"), db.deployState, db.noAccess);
      const comparison = { ...base, deploys_not_read: db.notRead ?? [], deploys_backfill_progress: db.progress ?? null };
      const body = db.oldServer ? older : { ...older, comparison };
      if (db.empty) {
        const zero = Object.fromEntries(Object.keys(SUMMARY).map((k) => [k, typeof (SUMMARY as Record<string, unknown>)[k] === "number" ? 0 : null]));
        return json(route, { ...body, summary: zero, previous: zero, reviews: { ...body.reviews, posted: 0 }, lookups: { ...body.lookups, total: 0 } });
      }
      return json(route, body);
    }
    if (p === "/api/analytics/decisions") return json(route, DECISIONS);
    if (p === "/api/analytics/decisions/export") return json(route, { cases: [{ case: "stop_judge" }] });
    if (p === "/api/deliveries/analytics" && db.deliveries) {
      if (db.deliveries === "refused") return json(route, { error: "Admins only" }, 403);
      return json(route, {
        period: "24h",
        summary: { deliveries: 412, handled: 380, ignored: 26, failed: 6, success_rate: 0.9854, retried: 4, retried_ok: 3, retries: 5, p50_ms: 160, p95_ms: 1300, p99_ms: 3900 },
      });
    }
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  return db;
}

// Invented decisions: two of five questions were answered with the default;
// one of two blocks was dismissed.
const DECISIONS = {
  days: 30,
  summary: {
    unnecessary_stops: {
      total: 7, with_outcome: 5, wrong: 2, rate: 0.4, by_category: [["product_choice", 2]],
      examples: [{ sk: "DECISION#RUN#01RUNASKED000000000000000A#2026-11-02T10:00:00.000Z", kind: "ask", step: "plan", category: "product_choice", detail: "Monthly or yearly totals?", outcome: "answered_default", created_at: "2026-11-02T10:00:00.000Z", run_id: "01RUNASKED000000000000000A" }],
    },
    nuisance_blocks: {
      total: 3, with_outcome: 2, wrong: 1, rate: 0.5, by_category: [["correctness", 1]],
      examples: [{ sk: "DECISION#PR#your-team/web#000101#2026-11-03T09:00:00.000Z", kind: "block", step: "review", category: "correctness", detail: "Retry loop never ends", outcome: "dismissed_review", created_at: "2026-11-03T09:00:00.000Z", repo: "your-team/web", pr_number: 101 }],
    },
    decisions: 25,
    proceeded: 15,
  },
};

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

test("the scorecard answers whether it is worth it, against the previous period", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
  await expect(page.getByTestId("tile-merged")).toContainText("21");
  await expect(page.getByTestId("tile-merged")).toContainText("▲ 40% vs previous 30 days");
  await expect(page.getByTestId("tile-merge-rate")).toContainText("70%");
  await expect(page.getByTestId("tile-merge-rate")).toContainText("▲ 10 pts");
  await expect(page.getByTestId("tile-time-to-merge")).toContainText("5.2 h");
  await expect(page.getByTestId("tile-time-to-merge")).toContainText("From 12 merged PRs");
  await expect(page.getByTestId("tile-tokens-per-pr")).toContainText("tokens across");
  await expect(page.getByText("$")).toHaveCount(0);
  await expect(page.getByTestId("tile-untouched")).toContainText("75%");
  await expect(page.getByTestId("tile-ci")).toContainText("6 of 8 runs went green");
  await expect(page.getByTestId("tile-findings")).toContainText("24 fixed in code, 8 settled by a person");
  // The tokens per day are the meter's (every model call), and say so.
  await expect(page.getByText("Tokens per day, every model call")).toBeVisible();
  const views = page.getByRole("navigation", { name: "Analytics views" });
  await views.getByRole("link", { name: "Reliability" }).click();
  await expect(page.getByRole("table", { name: "Failures by reason" })).toContainText("Timed out after #s");
  await expect(page.getByRole("table", { name: "By step" })).toContainText("Writing code");
  await views.getByRole("link", { name: "Lookups" }).click();
  await expect(page.getByRole("table", { name: "Lookups by source" })).toContainText("orders-db database");
  await views.getByRole("link", { name: "Teams and repos" }).click();
  // People first, Coderhelm's own work next, runs that recorded nobody last.
  await expect(page.getByRole("table", { name: "By person" }).locator("tbody tr td:first-child")).toHaveText(["Ada Lovelace", "Coderhelm (E2E tests)", "Not recorded"]);
  // Drill-downs open the run behind a number.
  await expect(page.getByRole("link", { name: "Show the class schedule on the details page" })).toHaveAttribute("href", /^\/runs\/detail\/?\?id=01RUNMERGED00000000000000A$/);
  await expect(page.getByRole("link", { name: "#101" })).toHaveAttribute("href", "https://github.com/your-team/web/pull/101");
  expect(db.calls).toContain("/api/analytics?days=30");
  await shot(page, "analytics");
});

test("stops and blocks show the unnecessary and the nuisance ones, with examples to export as replay cases", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/analytics?tab=reliability");
  await expect(page.getByTestId("tile-unnecessary-stops")).toContainText("40%");
  await expect(page.getByTestId("tile-unnecessary-stops")).toContainText("2 of 5 with an outcome (7 stops in all)");
  await expect(page.getByTestId("tile-nuisance-blocks")).toContainText("50%");
  await expect(page.getByTestId("tile-proceeded")).toContainText("15");
  const table = page.getByRole("table", { name: "Recent unnecessary stops and nuisance blocks" });
  await expect(table.locator("tbody tr td:first-child")).toHaveText(["Retry loop never ends", "Monthly or yearly totals?"]);
  await expect(table).toContainText("Review dismissed");
  await expect(table).toContainText("Answered with the default");
  await expect(table.getByRole("link", { name: "Open run" })).toHaveAttribute("href", /\/runs\/detail\/?\?id=01RUNASKED000000000000000A$/);
  const download = page.waitForEvent("download");
  await page.getByTestId("export-decisions").click();
  expect((await download).suggestedFilename()).toBe("replay-cases-30d.json");
  expect(db.calls).toContain("/api/analytics/decisions?days=30");
  await page.getByTestId("tile-nuisance-blocks").scrollIntoViewIfNeeded();
  await shot(page, "analytics-decisions");
});

test("where it struggles places every red CI run in one outcome, base-branch failures apart", async ({ page }) => {
  await mockApi(page);
  await page.goto("/analytics?tab=reliability");
  await expect(page.getByTestId("ci-line")).toContainText("CI went red on 8 runs, plus 1 run red only on checks that already fail on the base branch");
  await expect(page.getByTestId("ci-line")).toContainText("6 ended green after its fixes");
  const outcomes = page.getByRole("table", { name: "CI outcomes" });
  await expect(outcomes.locator("tbody tr td:first-child")).toHaveText([
    "Green after a Coderhelm fix",
    "Green without a Coderhelm fix",
    "Flaky: green on a re-run",
    "Red only on checks that fail on the base branch",
    "Gave up: Fix attempts used up",
    "Still running",
  ]);
  await expect(outcomes.locator("tbody tr td:nth-child(2)")).toHaveText(["6", "0", "1", "1", "1", "0"]);
  await page.getByRole("table", { name: "CI outcomes" }).scrollIntoViewIfNeeded();
  await shot(page, "analytics-ci-outcomes");
});

test("period and repository filters reload, and a chart can be read as a table", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/analytics");
  await expect(page.getByTestId("tile-merged")).toContainText("21");
  await page.getByRole("group", { name: "Period" }).getByRole("button", { name: "7 days" }).click();
  await expect(page.getByTestId("tile-merged")).toContainText("vs previous 7 days");
  expect(db.calls).toContain("/api/analytics?days=7");
  await page.getByTestId("repo-filter").click();
  await page.getByTestId("combo-popover").getByRole("option", { name: "your-team/web", exact: true }).first().click();
  await expect(page.getByTestId("tile-merged")).toContainText("11");
  expect(db.calls).toContain("/api/analytics?days=7&repo=your-team%2Fweb");
  // The repo list stays complete while one repo is shown.
  await page.getByTestId("repo-filter").click();
  await expect(page.getByTestId("combo-popover").locator('[data-testid="combo-group"] [data-testid="combo-option"]')).toHaveCount(3);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Show table" }).first().click();
  await expect(page.getByRole("table", { name: "PRs per day" })).toBeVisible();
});

test("time saved is shown only from the reader's own figure, with the formula", async ({ page }) => {
  await mockApi(page);
  await page.goto("/analytics");
  await expect(page.getByText("Coderhelm doesn't guess how long work would have taken you")).toBeVisible();
  await page.getByLabel("Minutes a person would spend on one pull request").fill("90");
  await expect(page.getByTestId("time-saved")).toContainText("About 32 h");
  await expect(page.getByTestId("time-saved")).toContainText("21 merged PRs × 90 minutes ÷ 60");
  await page.reload();
  await expect(page.getByTestId("time-saved")).toContainText("About 32 h");
});

test("empty and error states explain themselves", async ({ page }) => {
  const db = await mockApi(page, { empty: true });
  await page.goto("/analytics");
  await expect(page.getByText("Nothing to show for the last 30 days yet.")).toBeVisible();
  db.empty = false;
  db.fail = true;
  await page.getByRole("group", { name: "Period" }).getByRole("button", { name: "90 days" }).click();
  await expect(page.getByText("Couldn't load analytics")).toBeVisible();
  db.fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("tile-merged")).toContainText("21");
});

test("this period is compared with the one before, each thing counted once", async ({ page }) => {
  await mockApi(page);
  await page.goto("/analytics?tab=trends");
  const table = page.getByRole("table", { name: "Compared with the period before" });
  await expect(table).toBeVisible();
  const row = (name: string) => table.locator("tbody tr").filter({ has: page.getByRole("rowheader").filter({ hasText: name }) });
  await expect(row("Tickets worked on")).toContainText("40");
  await expect(row("Tickets worked on")).toContainText("45");
  await expect(row("Tickets worked on").locator("td").nth(2)).toHaveText("↑ +13%");
  await expect(row("Runs (including reruns)").locator("td").nth(2)).toHaveText("↓ −11%");
  await expect(row("PRs opened").locator("td").nth(2)).toHaveText("Flat");
  await expect(row("PRs reviewed (distinct)").locator("td").nth(2)).toHaveText("↑ ×2.1");
  await expect(row("Reviews posted").locator("td").nth(2)).toHaveText("↑ +65%");
  await expect(row("Approvals").locator("td").nth(0)).toHaveText("80");
  await expect(row("Plain comments").locator("td").nth(2)).toHaveText("↓ −61%");
  // Colour follows the direction, and the arrow says it without colour.
  await expect(row("Runs (including reruns)").locator("td").nth(2).locator("span")).toHaveClass(/text-rose-400/);
  await expect(row("Tickets worked on").locator("td").nth(2).locator("span")).toHaveClass(/text-emerald-400/);
  // Who asked was not recorded before: no fake jump from zero.
  await expect(row("People who asked").locator("td").nth(2)).toHaveText("Not comparable");
  const notes = page.getByTestId("compare-notes");
  await expect(notes).toContainText("Who asked was recorded on 0 of 70 runs");
  await expect(notes).toContainText("12 PRs from");
  await expect(notes).toContainText("still open");
  await expect(notes).toContainText("posted as plain comments (70%, against 17% now)");
  // Rolling periods have no full-month column.
  await expect(table.locator("thead th")).toHaveCount(4);

  // The chart switches metric and reads as a table.
  await expect(page.getByRole("img", { name: /Line chart of PRs reviewed so far by day/ })).toBeVisible();
  await page.getByRole("group", { name: "Chart metric" }).getByRole("button", { name: "Tickets", exact: true }).click();
  await expect(page.getByRole("img", { name: /Line chart of Tickets so far by day/ })).toBeVisible();
  await page.getByRole("button", { name: /^Show table: Tickets so far/ }).click();
  const days = page.getByRole("table", { name: "Tickets so far by day" });
  await expect(days.locator("tbody tr").first()).toContainText("Day 1");
  // The previous period was a day shorter: its last value is a gap, not a zero.
  await expect(days.locator("tbody tr").last().locator("td").nth(1)).toHaveText("—");

  // Deploys Coderhelm started: by environment, with failures; a real 0
  // before is a change, not "Not comparable".
  await expect(row("Deploys Coderhelm started").locator("td").nth(0)).toHaveText("0");
  await expect(row("Deploys Coderhelm started").locator("td").nth(1)).toHaveText("14");
  await expect(row("Deploys Coderhelm started").locator("td").nth(2)).toHaveText("↑ +14");
  await expect(row("To staging").locator("td").nth(1)).toHaveText("9");
  await expect(row("To production").locator("td").nth(1)).toHaveText("3 (1 failed)");
  await expect(row("Succeeded").locator("td").nth(1)).toHaveText("13");
  await expect(row("Failed").locator("td").nth(1)).toHaveText("1");
  await expect(notes).toContainText("a merge it made");
  await expect(notes).toContainText("Runs a person starts or re-runs are not counted.");
  await expect(notes).not.toContainText("still being read");
  const deploys = page.getByRole("group", { name: "Chart metric" }).getByRole("button", { name: "Deploys", exact: true });
  await expect(deploys).toHaveClass(/cursor-pointer/);
  // The table stays open from the Tickets check, and follows the metric.
  await deploys.click();
  const deployDays = page.getByRole("table", { name: "Deploys Coderhelm started so far by day" });
  await expect(deployDays.locator("tbody tr").first().locator("td").nth(2)).toHaveText("2");
  await expect(deployDays.locator("tbody tr").last().locator("td").nth(1)).toHaveText("—");
  await shot(page, "analytics-compare");
});

test("deploys still being read from GitHub say so instead of a fake 0", async ({ page }) => {
  await mockApi(page, { deployState: "counting" });
  await page.goto("/analytics?tab=trends");
  const table = page.getByRole("table", { name: "Compared with the period before" });
  const row = (name: string) => table.locator("tbody tr").filter({ has: page.getByRole("rowheader").filter({ hasText: name }) });
  await expect(row("Deploys Coderhelm started").locator("td").nth(0)).toHaveText("Counting…");
  await expect(row("Deploys Coderhelm started").locator("td").nth(1)).toHaveText("14 so far");
  await expect(row("Deploys Coderhelm started").locator("td").nth(2)).toHaveText("Counting earlier deploys…");
  await expect(row("To production").locator("td").nth(0)).toHaveText("Counting…");
  await expect(page.getByTestId("compare-notes")).toContainText("still being read from GitHub's run history");
  // The rest of the table compares as usual.
  await expect(row("Tickets worked on").locator("td").nth(2)).toHaveText("↑ +13%");
});

test("deploys being read say how many repositories are done, and keep this period's number", async ({ page }) => {
  await mockApi(page, { deployState: "counting", progress: { read: 12, total: 40 } });
  await page.goto("/analytics?tab=trends");
  const table = page.getByRole("table", { name: "Compared with the period before" });
  const row = (name: string) => table.locator("tbody tr").filter({ has: page.getByRole("rowheader").filter({ hasText: name }) });
  await expect(row("Deploys Coderhelm started").locator("td").nth(2)).toHaveText("Counting earlier deploys: 12 of 40 repositories");
  await expect(row("Deploys Coderhelm started").locator("td").nth(1)).toHaveText("14 so far");
  await expect(page.getByTestId("compare-notes")).toContainText("(12 of 40 repositories read so far)");
});

test("deploys waiting out GitHub's hourly limit say when counting resumes", async ({ page }) => {
  const at = new Date(Date.now() + 30 * 60_000);
  await mockApi(page, { deployState: "counting", progress: { read: 9, total: 11, resumes_at: at.toISOString() } });
  await page.goto("/analytics?tab=trends");
  const table = page.getByRole("table", { name: "Compared with the period before" });
  const cell = table.locator("tbody tr").filter({ has: page.getByRole("rowheader").filter({ hasText: "Deploys Coderhelm started" }) }).locator("td").nth(2);
  const hhmm = await page.evaluate((iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), at.toISOString());
  await expect(cell).toHaveText(`Counting earlier deploys: 9 of 11 repositories, resumes at ${hhmm} after GitHub's hourly limit`);
});

test("repositories whose earlier deploys could not be read are named with why, not counted forever", async ({ page }) => {
  await mockApi(page, { notRead: [{ repo: "your-team/monorepo", reason: "GitHub answered 502 Bad Gateway" }] });
  await page.goto("/analytics?tab=trends");
  const notes = page.getByTestId("compare-notes");
  await expect(notes).toContainText("could not read earlier deploys in 1 repository (your-team/monorepo: GitHub answered 502 Bad Gateway)");
  const table = page.getByRole("table", { name: "Compared with the period before" });
  const row = (name: string) => table.locator("tbody tr").filter({ has: page.getByRole("rowheader").filter({ hasText: name }) });
  await expect(row("Deploys Coderhelm started").locator("td").nth(2)).toHaveText("↑ +14");
});

test("deploys from before GitHub's history was read are not compared", async ({ page }) => {
  await mockApi(page, { deployState: "before_records" });
  await page.goto("/analytics?tab=trends");
  const table = page.getByRole("table", { name: "Compared with the period before" });
  const row = (name: string) => table.locator("tbody tr").filter({ has: page.getByRole("rowheader").filter({ hasText: name }) });
  await expect(row("Deploys Coderhelm started").locator("td").nth(0)).toHaveText("0");
  await expect(row("Deploys Coderhelm started").locator("td").nth(2)).toHaveText("Not comparable");
  await expect(page.getByTestId("compare-notes")).toContainText("Deploys are known from");
});

test("repositories Coderhelm can't read runs in are named, with the permission to grant", async ({ page }) => {
  await mockApi(page, { noAccess: ["your-team/infra"] });
  await page.goto("/analytics?tab=trends");
  const notes = page.getByTestId("compare-notes");
  await expect(notes).toContainText("can't read workflow runs in 1 repository (your-team/infra)");
  await expect(notes).toContainText("Actions: read");
});

test("month to date compares the same days of last month and shows all of last month", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/analytics");
  await page.getByRole("group", { name: "Period" }).getByRole("button", { name: "This month" }).click();
  await expect(page.getByTestId("tile-merged")).toContainText("vs the same days last month");
  expect(db.calls).toContain("/api/analytics?period=mtd");
  await page.getByRole("navigation", { name: "Analytics views" }).getByRole("link", { name: "Compared" }).click();
  const table = page.getByRole("table", { name: "Compared with the period before" });
  await expect(table.locator("thead th")).toHaveCount(5);
  await expect(table.locator("thead th").last()).toHaveText(/^All of /);
  await expect(table.locator("tbody tr").first().locator("td").last()).toHaveText("52");
  // On a phone the change stays in view and last month moves out of the way.
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(table.locator("thead th").last()).toBeHidden();
  await expect(table.locator("tbody tr").first().locator("td").nth(2)).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator("#compare")).toContainText("the same time into the month");
  await page.getByTestId("repo-filter").click();
  await page.getByTestId("combo-popover").getByRole("option", { name: "your-team/web", exact: true }).first().click();
  expect(db.calls).toContain("/api/analytics?period=mtd&repo=your-team%2Fweb");
  await shot(page, "analytics-compare-mtd");
});

test("the page is split into views: each keeps one subject on screen", async ({ page }) => {
  await mockApi(page);
  await page.goto("/analytics");
  const views = page.getByRole("navigation", { name: "Analytics views" });
  await expect(views.getByRole("link")).toHaveText(["Overview", "Compared", "Reliability", "Teams and repos", "Lookups"]);
  await expect(views.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  // The overview holds the scorecard and the charts, not the long tables.
  await expect(page.getByTestId("tile-merged")).toBeVisible();
  await expect(page.getByRole("table", { name: "By repository" })).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Failures by reason" })).toHaveCount(0);
  await views.getByRole("link", { name: "Teams and repos" }).click();
  await expect(page).toHaveURL(/tab=teams/);
  await expect(page.getByRole("table", { name: "By repository" })).toBeVisible();
  await expect(page.getByTestId("tile-merged")).toHaveCount(0);
  // Recently merged keeps every column inside its card.
  const merged = page.getByRole("table", { name: "Recently merged" });
  const card = await merged.boundingBox();
  const last = await merged.locator("thead th").last().boundingBox();
  expect(card && last && last.x + last.width <= card.x + card.width + 1).toBe(true);
});

test("a server without the comparison still shows the rest of the page", async ({ page }) => {
  await mockApi(page, { oldServer: true });
  await page.goto("/analytics");
  await expect(page.getByTestId("tile-merged")).toContainText("21");
  await expect(page.getByRole("table", { name: "Compared with the period before" })).toHaveCount(0);
});

test("the period picker doesn't move when the selection changes, by click or by keyboard", async ({ page }) => {
  await mockApi(page);
  await page.goto("/analytics");
  const picker = page.getByRole("group", { name: "Period" });
  const segments = picker.getByRole("button");
  await expect(segments).toHaveCount(4);
  await expect(picker.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
  const boxes = async () =>
    segments.evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 10) / 10); }));
  const before = await boxes();

  // Every choice, by click: no segment moves or changes size.
  for (const name of ["7 days", "90 days", "This month", "30 days"]) {
    await picker.getByRole("button", { name }).click();
    await expect(picker.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
    expect(await boxes(), `selecting ${name} moved the row`).toEqual(before);
  }

  // By keyboard: the focus ring shows inside the segment and nothing moves.
  await picker.getByRole("button", { name: "7 days" }).focus();
  await page.keyboard.press("Enter");
  await expect(picker.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
  expect(await boxes()).toEqual(before);
  const focused = picker.getByRole("button", { name: "7 days" });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(focused).toBeFocused();
  // The app's focus ring (a 2px outline), drawn inside the segment, not a thick outer outline.
  const ring = await focused.evaluate((el) => { const s = getComputedStyle(el); return { width: s.outlineWidth, offset: s.outlineOffset, style: s.outlineStyle }; });
  expect(ring).toEqual({ width: "2px", offset: "-3px", style: "solid" });
  expect(await boxes()).toEqual(before);
});

test("token totals note calls that were estimated or recovered late, only when there are any", async ({ page }) => {
  await mockApi(page, { estimated: 3, recovered: 1 });
  await page.goto("/analytics");
  const note = page.getByTestId("usage-note");
  await expect(note).toBeVisible();
  await expect(note.locator("p")).toHaveText("Token totals this month include 3 calls estimated · 1 recovered late.");
  await expect(note.getByText("3 calls estimated", { exact: true })).toHaveAttribute("title", /output tokens were estimated/);
  await expect(note.getByText("1 recovered late", { exact: true })).toHaveAttribute("title", /added later/);
  await shot(page, "analytics-usage-note");
});

test("the usage note shows only the count above zero, and nothing when both are zero", async ({ page }) => {
  const db = await mockApi(page, { recovered: 2 });
  await page.goto("/analytics");
  await expect(page.getByTestId("usage-note").locator("p")).toHaveText("Token totals this month include 2 recovered late.");
  db.recovered = 0;
  await page.reload();
  await expect(page.getByTestId("tile-merged")).toContainText("21");
  expect(db.calls).toContain("/api/stats");
  await expect(page.getByTestId("usage-note")).toHaveCount(0);
});

test("Insights shows the last 24 hours of deliveries to an admin, linking to Deliveries", async ({ page }) => {
  const db = await mockApi(page, { deliveries: "ok" });
  await page.goto("/analytics");
  const card = page.getByTestId("insights-deliveries");
  await expect(card).toBeVisible();
  await expect(page.getByTestId("deliveries-rate")).toContainText("98.5%");
  await expect(page.getByTestId("deliveries-rate")).toContainText("406 of 412 went fine");
  await expect(page.getByTestId("deliveries-failed")).toContainText("6");
  await expect(page.getByTestId("deliveries-p95")).toContainText("1.3s");
  await expect(page.getByTestId("deliveries-p95")).toContainText("Typical 160 ms");
  await expect(page.getByTestId("deliveries-card-link")).toHaveAttribute("href", /\/settings\/deliveries\/?$/);
  expect(db.calls.some((c) => c.startsWith("/api/deliveries/analytics?period=24h"))).toBe(true);
});

test("Insights hides the Deliveries card from anyone who can't open Deliveries", async ({ page }) => {
  await mockApi(page, { deliveries: "refused" });
  await page.goto("/analytics");
  await expect(page.getByTestId("tile-merged")).toBeVisible();
  await expect(page.getByTestId("insights-deliveries")).toHaveCount(0);
});
