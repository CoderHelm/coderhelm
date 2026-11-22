import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// A run whose plan found that no code change is needed reads as its own
// outcome, "No change needed", with the plan's reason in full, what it
// checked, and what it decided about the open pull request it was
// continuing. Never a bare "Done". Every API call is answered here.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

const REASON =
  "The current rule already matches the crawler: 516 requests blocked in the last hour, 93% on the expected fingerprint. The counting rule stayed under its 500 an hour threshold for 72 hours (at most 292).\n\nThe stream behind the open pull request is down to 2 requests.";

const BASE = {
  ticket_source: "alert",
  ticket_id: "ALERT-1F2E3D4C",
  title: "ALARM: edge-signature-drift",
  repo: "your-team/infra",
  cost_usd: 1.2,
  tokens_in: 1000,
  tokens_out: 1000,
  duration_s: 280,
  current_pass: "done",
  created_at: iso(60),
  updated_at: iso(5),
  pass_history: [],
  progress_notes: [
    { message: "This ticket already has CoderHelm's open pull request #31: this run continues it as its update, on its branch, and opens no other.", timestamp: iso(59) },
    { message: `No change needed. ${REASON}`, timestamp: iso(55) },
  ],
};

const RUNS: Record<string, unknown> = {
  "01NOCH": {
    ...BASE,
    run_id: "01NOCH",
    status: "no_change",
    no_change: {
      reason: REASON,
      checks: ["firewall logs, last hour: 516 blocked, 93% on the expected fingerprint", "counting rule, last 72 hours: at most 292 an hour"],
      open_pr: {
        repo: "your-team/infra",
        number: 31,
        url: "https://github.com/your-team/infra/pull/31",
        title: "Block the scraper stream at the edge",
        verdict: "not_needed",
        why: "The stream it blocks is down to 2 requests",
        closed: true,
        line: "Pull request #31 is no longer needed, so CoderHelm closed it: The stream it blocks is down to 2 requests. Its branch `coderhelm/alert-1f2e3d4c` is kept.",
      },
    },
  },
  "01NOKP": {
    ...BASE,
    run_id: "01NOKP",
    status: "no_change",
    no_change: {
      reason: "The limit is already 100 a minute in `config/limits.yml`.",
      checks: [],
      open_pr: {
        repo: "your-team/infra",
        number: 32,
        url: "https://github.com/your-team/infra/pull/32",
        verdict: "keep",
        why: "Its change is not in the code yet",
        closed: false,
        line: "Pull request #32 stays open: Its change is not in the code yet.",
      },
    },
  },
};

async function mockApi(page: Page) {
  const calls: string[] = [];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    calls.push(`${req.method()} ${p}`);
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: "sam", email: "sam@example.com", avatar_url: "", role: "member" });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "your-team/infra", enabled: true, ticket_source: "github" }] });
    if (p === "/api/plugins/catalog") return json(route, { plugins: [] });
    const m = p.match(/^\/api\/runs\/(\w+)(\/.*)?$/);
    if (m && RUNS[m[1]]) {
      const rest = m[2] ?? "";
      if (rest === "") return json(route, RUNS[m[1]]);
      if (rest === "/retry" && req.method() === "POST") return json(route, { status: "queued" });
      if (rest === "/openspec") return json(route, {});
      if (rest === "/traces") return json(route, { traces: [] });
      if (rest === "/agent-log") return json(route, { passes: [], live_events: [] });
      if (rest === "/asks") return json(route, { asks: [] });
    }
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  return calls;
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const [label, width, height] of [
  ["desktop", 1440, 900],
  ["phone", 390, 844],
] as const) {
  test(`a no-change run shows "No change needed" with the reason, the checks and the PR decision (${label})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mockApi(page);
    await page.goto("/runs/detail?id=01NOCH");
    const outcome = page.getByTestId("run-outcome");
    await expect(outcome).toContainText("No change needed");
    await expect(outcome).not.toContainText(/^Done$/);
    const reason = page.getByTestId("no-change-reason");
    await expect(reason).toContainText("The current rule already matches the crawler");
    await expect(reason).toContainText("at most 292");
    await expect(reason).toContainText("down to 2 requests");
    await expect(page.getByTestId("no-change-checks")).toContainText("firewall logs, last hour: 516 blocked");
    const pr = page.getByTestId("no-change-pr");
    await expect(pr).toHaveAttribute("data-verdict", "not_needed");
    await expect(pr).toContainText("Pull request #31 is no longer needed, so CoderHelm closed it");
    await expect(page.getByTestId("no-change-pr-link")).toHaveAttribute("href", "https://github.com/your-team/infra/pull/31");
    await expect(page.getByText("No change needed").first()).toBeVisible();
    await noSidewaysScroll(page);
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS_DIR, `no-change-${width}.png`), fullPage: true });
  });
}

test("a no-change run that keeps the open pull request says why it stays open", async ({ page }) => {
  await mockApi(page);
  await page.goto("/runs/detail?id=01NOKP");
  const pr = page.getByTestId("no-change-pr");
  await expect(pr).toHaveAttribute("data-verdict", "keep");
  await expect(pr).toContainText("Pull request #32 stays open: Its change is not in the code yet.");
  await expect(page.getByTestId("no-change-checks")).toHaveCount(0);
});

test("a no-change run can be retried", async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto("/runs/detail?id=01NOKP");
  await page.getByTestId("run-outcome").getByRole("button", { name: /Retry/ }).click();
  await expect.poll(() => calls).toContain("POST /api/runs/01NOKP/retry");
});
