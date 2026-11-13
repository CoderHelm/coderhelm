import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Every API call is answered here. Nothing reaches a real backend, and every
// number is invented.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

const parts = (tokens_in: number, tokens_out: number, cache_read_tokens: number, cache_write_tokens: number, cost_usd: number) => ({
  tokens: tokens_in + tokens_out + cache_read_tokens + cache_write_tokens,
  tokens_in, tokens_out, cache_read_tokens, cache_write_tokens, cost_usd,
});

function lastDays(n: number) {
  const end = Date.now();
  return Array.from({ length: n }, (_, i) => new Date(end - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

const SUMMARY = {
  runs: 20, prs_opened: 12, prs_merged: 4, prs_closed: 1, prs_open: 7, merge_rate: 0.33, failed_runs: 3, failure_rate: 0.15, failed_then_retried: 0,
  cost_usd: 80, run_cost_usd: 40, cost_basis: "metered", cost_by_feature: [], cost_per_run: 2, cost_per_merged_pr: 10,
  tokens: 46_800_000, tokens_per_merged_pr: 11_700_000, tokens_in: 1_000_000, tokens_out: 800_000,
  median_run_minutes: 10, median_hours_to_merge: 4, time_to_merge_known: 4, merged_untouched: 3, merged_with_edits: 1, edits_known: 4, reviews: 9,
};

function tokenUse(days: number) {
  const total = parts(2_000_000, 1_500_000, 60_000_000, 6_500_000, 84.5);
  return {
    basis: "metered",
    counted_since: "2026-01-04",
    metered_from: "2026-01-05",
    run_records_from: "2026-01-12",
    total: { ...total, calls: 5200, cache_hit_share: 0.876 },
    previous: parts(1_800_000, 1_200_000, 50_000_000, 3_000_000, 70),
    comparable: true,
    not_comparable: null,
    daily: lastDays(days).map((day, i) => ({ day, ...parts(10_000 * (i % 4), 8_000 * (i % 3), 400_000 * (i % 5), 30_000 * (i % 2), 0.4 * (i % 5)) })),
    by_kind: [
      { kind: "ticket_runs", calls: 2000, previous_tokens: 30_000_000, previous_cost_usd: 30, ...parts(900_000, 800_000, 25_000_000, 3_300_000, 38), features: [{ feature: "run", calls: 1900, ...parts(850_000, 780_000, 24_000_000, 3_200_000, 36) }, { feature: "plan", calls: 100, ...parts(50_000, 20_000, 1_000_000, 100_000, 2) }] },
      { kind: "security", calls: 600, previous_tokens: 1_000_000, previous_cost_usd: 1, ...parts(300_000, 200_000, 12_000_000, 1_500_000, 14), features: [{ feature: "security_fix", calls: 500, ...parts(280_000, 190_000, 11_500_000, 1_450_000, 13.5) }, { feature: "security", calls: 100, ...parts(20_000, 10_000, 500_000, 50_000, 0.5) }] },
      { kind: "follow_ups", calls: 700, previous_tokens: 7_000_000, previous_cost_usd: 9, ...parts(250_000, 150_000, 8_000_000, 600_000, 10), features: [{ feature: "feedback", calls: 700, ...parts(250_000, 150_000, 8_000_000, 600_000, 10) }] },
      { kind: "reviews", calls: 1500, previous_tokens: 16_000_000, previous_cost_usd: 25, ...parts(450_000, 300_000, 14_000_000, 1_000_000, 20), features: [{ feature: "review", calls: 1500, ...parts(450_000, 300_000, 14_000_000, 1_000_000, 20) }] },
      { kind: "chat", calls: 150, previous_tokens: 900_000, previous_cost_usd: 2, ...parts(50_000, 30_000, 700_000, 60_000, 1.5), features: [{ feature: "chat", calls: 150, ...parts(50_000, 30_000, 700_000, 60_000, 1.5) }] },
      { kind: "logs", calls: 200, previous_tokens: 800_000, previous_cost_usd: 2, ...parts(40_000, 15_000, 250_000, 30_000, 0.8), features: [{ feature: "log_analysis", calls: 200, ...parts(40_000, 15_000, 250_000, 30_000, 0.8) }] },
      { kind: "other", calls: 50, previous_tokens: 300_000, previous_cost_usd: 1, ...parts(10_000, 5_000, 50_000, 10_000, 0.2), features: [{ feature: "memory", calls: 50, ...parts(10_000, 5_000, 50_000, 10_000, 0.2) }] },
    ],
    by_model: [
      { model: "model-large", calls: 3000, previous_tokens: 40_000_000, previous_cost_usd: 60, cache_hit_share: 0.9, price_known: true, ...parts(1_200_000, 1_000_000, 45_000_000, 3_800_000, 70) },
      { model: "model-small", calls: 2200, previous_tokens: 16_000_000, previous_cost_usd: 10, cache_hit_share: 0.82, price_known: true, ...parts(800_000, 500_000, 15_000_000, 2_700_000, 14.5) },
    ],
    per_merged_pr: {
      ...parts(300_000, 250_000, 6_000_000, 450_000, 9.2), prs: 4, runs: 5, tokens_per_pr: 1_750_000, cost_per_pr: 2.3,
      comparable: true, not_comparable: null,
      previous: { ...parts(250_000, 200_000, 5_000_000, 550_000, 8), prs: 4, runs: 4, tokens_per_pr: 1_500_000, cost_per_pr: 2 },
      by_kind: [
        { kind: "ticket_runs", prs: 3, runs: 4, tokens_per_pr: 2_000_000, cost_per_pr: 2.8, ...parts(260_000, 220_000, 5_100_000, 420_000, 8.4) },
        { kind: "security", prs: 1, runs: 1, tokens_per_pr: 1_000_000, cost_per_pr: 0.8, ...parts(40_000, 30_000, 900_000, 30_000, 0.8) },
      ],
    },
    runs: {
      ...parts(1_500_000, 1_100_000, 40_000_000, 4_200_000, 52), runs: 20,
      by_outcome: [
        { outcome: "merged", runs: 5, ...parts(300_000, 250_000, 6_000_000, 450_000, 9.2) },
        { outcome: "open", runs: 8, ...parts(700_000, 500_000, 20_000_000, 2_300_000, 25) },
        { outcome: "closed", runs: 1, ...parts(50_000, 50_000, 1_800_000, 100_000, 2.3) },
        { outcome: "failed", runs: 3, ...parts(300_000, 200_000, 9_000_000, 1_000_000, 11.5) },
        { outcome: "no_pr", runs: 3, ...parts(150_000, 100_000, 3_200_000, 350_000, 4) },
      ],
    },
    heaviest_runs: [
      { run_id: "01RUNHEAVY000000000000000A", title: "Move the checkout form to the new layout", repo: "your-team/web", pr_number: 140, pr_url: "https://github.com/your-team/web/pull/140", kind: "ticket_runs", outcome: "open", ...parts(200_000, 150_000, 9_000_000, 900_000, 9.9) },
      { run_id: "01RUNHEAVY000000000000000B", title: "Update the image library", repo: "your-team/backend", pr_number: 0, pr_url: "", kind: "security", outcome: "failed", ...parts(100_000, 80_000, 5_000_000, 500_000, 5.5) },
    ],
    heaviest_prs: [
      { repo: "your-team/web", pr_number: 140, pr_url: "https://github.com/your-team/web/pull/140", title: "Move the checkout form to the new layout", run_id: "01RUNHEAVY000000000000000C", runs: 3, kind: "ticket_runs", outcome: "open", ...parts(400_000, 300_000, 15_000_000, 1_500_000, 17) },
    ],
  };
}
type TokenUse = ReturnType<typeof tokenUse>;

function analytics(days: number, tu: unknown) {
  const now = Date.now();
  return {
    days, basis: "days",
    period: { start: new Date(now - days * 86_400_000).toISOString(), end: new Date(now).toISOString() },
    previous_period: { start: new Date(now - 2 * days * 86_400_000).toISOString(), end: new Date(now - days * 86_400_000).toISOString() },
    summary: SUMMARY,
    previous: { ...SUMMARY, prs_merged: 9, tokens: 16_000_000, tokens_per_merged_pr: 1_783_000 },
    daily: lastDays(days).map((day, i) => ({ day, runs: i % 3, prs_opened: i % 2, merged: 0, failed: 0, cost_usd: 1, tokens: 1000 * i, reviews: 0 })),
    sources: [], repos: [], people: [], failures: [],
    ci: { runs_with_red_ci: 0, fixed_by_coderhelm: 0, fix_rate: null, fix_attempts: 0, fix_commits: 0 },
    reviews: { posted: 9, approve: 5, request_changes: 1, comment: 3, questions: 0, prs_reviewed: 7, findings: 4, findings_fixed: 0, findings_settled_by_person: 0, acted_on_rate: null, outcomes_known_reviews: 0, thumbs_up: 0, thumbs_down: 0 },
    lookups: { total: 0, refused: 0, failed: 0, by_source: [], by_actor: [] },
    steps: [], steps_window_days: 30, merged_recent: [], failed_recent: [],
    repo_names: ["your-team/backend", "your-team/web"],
    ...(tu ? { token_use: tu } : {}),
  };
}

interface Backend { calls: string[]; change?: (tu: TokenUse, repo: string | null) => unknown }

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { calls: [], ...init };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
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
      const month = { total_runs: 20, completed: 12, failed: 3, in_progress: 5, total_cost_usd: 80, total_tokens_in: 1_000_000, total_tokens_out: 800_000, merge_rate: 0.33, estimated_calls: 0, recovered_calls: 0 };
      return json(route, { month, all_time: month });
    }
    if (p === "/api/analytics") {
      const days = Number(url.searchParams.get("days") || "30");
      const repo = url.searchParams.get("repo");
      const base = tokenUse(days);
      return json(route, analytics(days, db.change ? db.change(base, repo) : base));
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

test("tokens per merged PR counts only the runs behind merged PRs, and says so", async ({ page }) => {
  await mockApi(page);
  await page.goto("/analytics");
  const tile = page.getByTestId("tile-tokens-per-pr");
  // Not every run's tokens over the merged PRs (that would read 11.7M here).
  await expect(tile).toContainText("1.8M");
  await expect(tile).not.toContainText("11.7M");
  await expect(tile).toContainText("Only runs started in the last 30 days whose pull request merged: 7.0M tokens from 5 runs on 4 PRs");
  await expect(tile).toContainText("▲ 17% vs previous 30 days");
  const total = page.getByTestId("tile-tokens-total");
  await expect(total).toContainText("70.0M");
  await expect(total).toContainText("Every model call: runs, reviews, chat and the rest · 86% were cache reads");
  await expect(total).toContainText("▲ 25% vs previous 30 days");
  // The overview stays in tokens: money is on the Token use view only.
  await expect(page.getByText("$")).toHaveCount(0);
});

test("the Token use view splits tokens by part, kind of work and model, with cost", async ({ page }) => {
  await mockApi(page);
  await page.goto("/analytics?tab=tokens");
  const view = page.getByTestId("token-use");
  await expect(view.getByTestId("tile-cache-share")).toContainText("86%");
  await expect(view.getByTestId("tile-cache-share")).toContainText("60.0M of 70.0M tokens");
  await expect(view.getByTestId("tile-token-cost")).toContainText("$84.50");
  await expect(view.getByTestId("tile-token-cost")).toContainText("Each call at its model's list price");
  await expect(view.getByTestId("token-use-not-compared")).toHaveCount(0);

  // Each chart reads as a table with all four parts.
  await page.getByRole("button", { name: "Show table: Tokens by kind of work" }).click();
  const kinds = page.getByRole("table", { name: "Tokens by kind of work" });
  await expect(kinds.locator("thead th")).toHaveText(["Kind of work", "New input", "Output", "Cache read", "Cache write", "All tokens", "Share", "Est. cost", "Change"]);
  await expect(kinds.locator("tbody tr td:first-child")).toHaveText(["Ticket runs", "Security fixes", "Review and CI fixes on open PRs", "PR reviews", "Chat and questions", "Logs and alerts", "Other"]);
  await expect(kinds.locator("tbody tr").nth(1)).toContainText("12.0M");
  await expect(kinds.locator("tbody tr").nth(1)).toContainText("20%");
  await expect(kinds.locator("tbody tr").nth(1)).toContainText("$14.00");
  await expect(kinds.locator("tbody tr").nth(1)).toContainText("▲ 1300%");
  // What is lumped together is said.
  const lumped = page.getByTestId("token-use-lumped");
  await expect(lumped).toContainText("the meter does not tell them apart");
  await expect(lumped).toContainText("Ticket runs is ticket runs (28.8M), tasks of approved plans (1.2M).");
  await expect(lumped).toContainText("Other is learning from finished work (75K).");

  await page.getByRole("button", { name: "Show table: Tokens by model" }).click();
  const models = page.getByRole("table", { name: "Tokens by model" });
  await expect(models.locator("tbody tr").first()).toContainText("model-large");
  await expect(models.locator("tbody tr").first()).toContainText("90%");
  await expect(models.locator("tbody tr").first()).toContainText("$70.00");

  await page.getByRole("button", { name: "Show table: Tokens per day, by part" }).click();
  await expect(page.getByRole("table", { name: "Tokens per day by part" }).locator("tbody tr")).toHaveCount(30);

  // What a merged PR took, by kind of run, and where every run's tokens went.
  const perPr = page.getByRole("table", { name: "Tokens per merged PR by kind of run" });
  await expect(perPr.locator("tbody tr").first()).toContainText("2.0M");
  await expect(perPr.locator("tbody tr").nth(1)).toContainText("Security fixes");
  const ended = page.getByRole("table", { name: "Run tokens by how the work ended" });
  await expect(ended.locator("tbody tr td:first-child")).toHaveText(["Pull request merged", "Pull request still open", "Pull request closed without merging", "Run failed", "No pull request (running, waiting or nothing to change)"]);
  await expect(ended.locator("tbody tr").nth(1)).toContainText("50%");

  // The heaviest runs and pull requests open the run and the pull request.
  const prs = page.getByRole("table", { name: "Heaviest pull requests" });
  await expect(prs.getByRole("link", { name: "Move the checkout form to the new layout" })).toHaveAttribute("href", /^\/runs\/detail\/?\?id=01RUNHEAVY000000000000000C$/);
  await expect(prs.getByRole("link", { name: "#140" })).toHaveAttribute("href", "https://github.com/your-team/web/pull/140");
  await expect(prs).toContainText("17.2M");
  const runs = page.getByRole("table", { name: "Heaviest runs" });
  await expect(runs.getByRole("link", { name: "Update the image library" })).toHaveAttribute("href", /id=01RUNHEAVY000000000000000B$/);
  await expect(runs).toContainText("Security fixes · Run failed");
  await shot(page, "analytics-token-use");
});

test("periods counted differently are not compared, and the page says why", async ({ page }) => {
  await mockApi(page, {
    change: (tu) => ({
      ...tu,
      comparable: false, not_comparable: "counting_started_later", previous: null,
      by_kind: tu.by_kind.map((k) => ({ ...k, previous_tokens: null, previous_cost_usd: null })),
      by_model: tu.by_model.map((m) => ({ ...m, previous_tokens: null, previous_cost_usd: null })),
      per_merged_pr: { ...tu.per_merged_pr, comparable: false, not_comparable: "run_records_were_partial", previous: null },
    }),
  });
  await page.goto("/analytics");
  const tile = page.getByTestId("tile-tokens-per-pr");
  await expect(tile).toContainText("1.8M");
  await expect(tile).toContainText("Not compared: counted differently before Jan 12");
  await expect(tile).not.toContainText("%");
  await expect(page.getByTestId("tile-tokens-total")).toContainText("Not compared: counted differently before Jan 5");
  await expect(page.getByTestId("tile-tokens-total")).not.toContainText("vs previous");

  await page.getByRole("navigation", { name: "Analytics views" }).getByRole("link", { name: "Token use" }).click();
  await expect(page).toHaveURL(/tab=tokens/);
  const why = page.getByTestId("token-use-not-compared");
  await expect(why).toContainText("Coderhelm has counted every model call one by one since Jan 5.");
  await expect(why).toContainText("Until Jan 12 a run that continued later (a CI fix, a resume) kept only its last step's tokens");
  await expect(page.getByTestId("tile-token-cost")).not.toContainText("vs previous");
  await page.getByRole("button", { name: "Show table: Tokens by kind of work" }).click();
  await expect(page.getByRole("table", { name: "Tokens by kind of work" }).locator("tbody tr").first().locator("td").last()).toHaveText("—");
});

test("one repository reads the run records: no models, and it says what is left out", async ({ page }) => {
  const db = await mockApi(page, {
    change: (tu, repo) => (repo ? { ...tu, basis: "runs", by_model: [], by_kind: tu.by_kind.slice(0, 2).map((k) => ({ ...k, features: [] })) } : tu),
  });
  await page.goto("/analytics?tab=tokens");
  await expect(page.getByRole("button", { name: "Show table: Tokens by model" })).toBeVisible();
  await page.getByTestId("repo-filter").click();
  await page.getByTestId("combo-popover").getByRole("option", { name: "your-team/web", exact: true }).first().click();
  await expect(page.getByText("With one repository picked, reviews, chat and log analysis are left out")).toBeVisible();
  expect(db.calls).toContain("/api/analytics?days=30&repo=your-team%2Fweb");
  await expect(page.getByRole("button", { name: "Show table: Tokens by model" })).toHaveCount(0);
  await expect(page.getByTestId("token-use-lumped")).toContainText("pick All repositories to see it");
  await expect(page.getByTestId("tile-tokens-total")).toContainText("Runs started in the period only");
  await expect(page.getByRole("button", { name: "Show table: Tokens per day, by part (runs, on the day each started)" })).toBeVisible();
});

test("a model with no list price shows its cost as an upper bound", async ({ page }) => {
  await mockApi(page, { change: (tu) => ({ ...tu, by_model: [{ ...tu.by_model[0], model: "model-new", price_known: false }] }) });
  await page.goto("/analytics?tab=tokens");
  await expect(page.getByText("No list price is known for model-new: its cost is shown at the highest known price, so it is an upper bound.")).toBeVisible();
  await page.getByRole("button", { name: "Show table: Tokens by model" }).click();
  await expect(page.getByRole("table", { name: "Tokens by model" })).toContainText("$70.00 at most");
});

test("no model calls and no merged PRs read as that, not as zeros to compare", async ({ page }) => {
  const zero = parts(0, 0, 0, 0, 0);
  await mockApi(page, {
    change: (tu) => ({
      ...tu, total: { ...zero, calls: 0, cache_hit_share: null }, previous: zero, by_kind: [], by_model: [], daily: tu.daily.map((d) => ({ day: d.day, ...zero })),
      per_merged_pr: { ...zero, prs: 0, runs: 0, tokens_per_pr: null, cost_per_pr: null, comparable: true, not_comparable: null, previous: { ...zero, prs: 0, runs: 0, tokens_per_pr: null, cost_per_pr: null }, by_kind: [] },
      runs: { ...zero, runs: 0, by_outcome: [] }, heaviest_runs: [], heaviest_prs: [],
    }),
  });
  await page.goto("/analytics?tab=tokens");
  await expect(page.getByTestId("tile-tokens-per-pr")).toContainText("—");
  await expect(page.getByTestId("tile-tokens-per-pr")).toContainText("No run started in the last 30 days has a merged pull request yet");
  await expect(page.getByTestId("tile-cache-share")).toContainText("—");
  await expect(page.getByTestId("token-use-empty")).toHaveText("No model calls recorded in the last 30 days.");
  await expect(page.getByRole("table", { name: "Heaviest runs" })).toHaveCount(0);
});

test("an older server keeps its own tile and says the breakdown needs an update", async ({ page }) => {
  await mockApi(page, { change: () => undefined });
  await page.goto("/analytics");
  const tile = page.getByTestId("tile-tokens-per-pr");
  await expect(tile).toContainText("11.7M");
  await expect(tile).toContainText("46.8M tokens across 20 runs, failed and unmerged ones included");
  await expect(page.getByTestId("tile-tokens-total")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Analytics views" }).getByRole("link", { name: "Token use" }).click();
  await expect(page.getByTestId("token-use-unavailable")).toContainText("This server doesn't report token use by kind of work yet");
});
