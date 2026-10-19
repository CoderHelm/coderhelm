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
  cost_usd: 96.4, cost_per_run: 2.3, cost_per_merged_pr: 4.59, tokens_in: 12_000_000, tokens_out: 900_000,
  median_run_minutes: 11.5, median_hours_to_merge: 5.2, time_to_merge_known: 12, merged_untouched: 9, merged_with_edits: 3, edits_known: 12, reviews: 55,
};

function analytics(daysN: number, repo: string | null) {
  const scale = repo ? 0.5 : 1;
  return {
    days: daysN,
    period: { start: new Date(Date.now() - daysN * 86_400_000).toISOString(), end: new Date().toISOString() },
    previous_period: { start: new Date(Date.now() - 2 * daysN * 86_400_000).toISOString(), end: new Date(Date.now() - daysN * 86_400_000).toISOString() },
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
      { person: "a-person", runs: 25, merged: 14 },
      { person: "", runs: 17, merged: 7 },
    ],
    failures: [
      { reason: "Timed out after #s", count: 3, last_run_id: "01RUNFAILED00000000000000A", last_at: new Date().toISOString() },
      { reason: "Branch … already exists", count: 1, last_run_id: "01RUNFAILED00000000000000B", last_at: new Date().toISOString() },
    ],
    ci: { runs_with_red_ci: 8, fixed_by_coderhelm: 6, fix_rate: 0.75, fix_attempts: 11, fix_commits: 9 },
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

interface Backend { calls: string[]; fail: boolean; empty: boolean }

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { calls: [], fail: false, empty: false, ...init };
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
    if (p === "/api/analytics") {
      if (db.fail) return json(route, { error: "boom" }, 500);
      const d = Number(url.searchParams.get("days") || 30);
      const body = analytics(d, url.searchParams.get("repo"));
      if (db.empty) {
        const zero = Object.fromEntries(Object.keys(SUMMARY).map((k) => [k, typeof (SUMMARY as Record<string, unknown>)[k] === "number" ? 0 : null]));
        return json(route, { ...body, summary: zero, previous: zero, reviews: { ...body.reviews, posted: 0 }, lookups: { ...body.lookups, total: 0 } });
      }
      return json(route, body);
    }
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  return db;
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
  await expect(page.getByRole("table", { name: "Failures by reason" })).toContainText("Timed out after #s");
  await expect(page.getByRole("table", { name: "By person" })).toContainText("Not recorded (older runs)");
  await expect(page.getByRole("table", { name: "Lookups by source" })).toContainText("orders-db database");
  await expect(page.getByRole("table", { name: "By step" })).toContainText("Writing code");
  // Drill-downs open the run behind a number.
  await expect(page.getByRole("link", { name: "Show the class schedule on the details page" })).toHaveAttribute("href", /^\/runs\/detail\/?\?id=01RUNMERGED00000000000000A$/);
  await expect(page.getByRole("link", { name: "#101" })).toHaveAttribute("href", "https://github.com/your-team/web/pull/101");
  expect(db.calls).toContain("/api/analytics?days=30");
  await shot(page, "analytics");
});

test("period and repository filters reload, and a chart can be read as a table", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/analytics");
  await expect(page.getByTestId("tile-merged")).toContainText("21");
  await page.getByRole("group", { name: "Period" }).getByRole("button", { name: "7 days" }).click();
  await expect(page.getByTestId("tile-merged")).toContainText("vs previous 7 days");
  expect(db.calls).toContain("/api/analytics?days=7");
  await page.getByRole("combobox", { name: "Repository" }).selectOption("your-team/web");
  await expect(page.getByTestId("tile-merged")).toContainText("11");
  expect(db.calls).toContain("/api/analytics?days=7&repo=your-team%2Fweb");
  // The repo list stays complete while one repo is shown.
  await expect(page.getByRole("combobox", { name: "Repository" }).locator("option")).toHaveCount(3);
  await page.getByRole("button", { name: "Show table" }).first().click();
  await expect(page.getByRole("table", { name: "PRs per day" })).toBeVisible();
});

test("time saved is shown only from the reader's own figure, with the formula", async ({ page }) => {
  await mockApi(page);
  await page.goto("/analytics");
  await expect(page.getByText("Coderhelm doesn't guess how long work would have taken you")).toBeVisible();
  await page.getByLabel("Minutes a person would spend on one PR").fill("90");
  await expect(page.getByTestId("time-saved")).toContainText("about 32 h");
  await expect(page.getByTestId("time-saved")).toContainText("21 merged PRs × 90 minutes ÷ 60");
  await page.reload();
  await expect(page.getByTestId("time-saved")).toContainText("about 32 h");
});

test("empty and error states explain themselves", async ({ page }) => {
  const db = await mockApi(page, { empty: true });
  await page.goto("/analytics");
  await expect(page.getByText("Nothing to show for the last 30 days yet.")).toBeVisible();
  db.empty = false;
  db.fail = true;
  await page.getByRole("group", { name: "Period" }).getByRole("button", { name: "90 days" }).click();
  await expect(page.getByText("We couldn't load analytics")).toBeVisible();
  db.fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("tile-merged")).toContainText("21");
});
