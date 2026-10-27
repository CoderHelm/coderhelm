import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// A run whose pull request is open while its last fix round didn't finish:
// the run page says so plainly (never "failed") and offers Resume, which calls
// the run's retry path. Every API call is answered here.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

const RUN = {
  run_id: "01RUNR",
  status: "completed",
  ticket_source: "jira",
  ticket_id: "ABC-7",
  title: "Add the gallery block",
  repo: "your-team/web",
  branch: "abc-7-gallery-block",
  pr_url: "https://github.com/your-team/web/pull/41",
  pr_number: 41,
  cost_usd: 4.2,
  tokens_in: 1000,
  tokens_out: 1000,
  duration_s: 2400,
  current_pass: "done",
  created_at: iso(120),
  updated_at: iso(5),
  pass_history: [],
  progress_notes: [],
  round_incomplete: {
    kind: "review_fix",
    number: 3,
    reason: "the review fix round ran out of its time budget 3 times in a row",
    summary: "Pull request open; the last fix round didn't finish: the review fix round ran out of its time budget 3 times in a row.",
    pushed: [
      { sha: "4f2a9c1e7b3d", message: "ABC-7: Add the gallery tabs" },
      { sha: "9b0c4d2a1e6f", message: "ABC-7: Add the tab tests" },
    ],
    files: ["src/blocks/gallery/tabs.tsx", "src/blocks/gallery/tabs.test.tsx"],
    wip_branch: "coderhelm-wip/abc-7-gallery-block",
    at: iso(5),
    can_resume: true,
  },
};

async function mockApi(page: Page, role = "member") {
  const calls: string[] = [];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    calls.push(`${req.method()} ${p}`);
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: "sam", email: "sam@example.com", avatar_url: "", role });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "your-team/web", enabled: true, ticket_source: "jira" }] });
    if (p === "/api/plugins/catalog") return json(route, { plugins: [] });
    if (p === "/api/runs/01RUNR") return json(route, RUN);
    if (p === "/api/runs/01RUNR/retry" && req.method() === "POST") return json(route, { status: "resuming" });
    if (p === "/api/runs/01RUNR/openspec") return json(route, {});
    if (p === "/api/runs/01RUNR/traces") return json(route, { traces: [] });
    if (p === "/api/runs/01RUNR/agent-log") return json(route, { passes: [], live_events: [] });
    if (p === "/api/runs/01RUNR/asks") return json(route, { asks: [] });
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  return calls;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true });
}

for (const [label, width, height] of [
  ["desktop", 1440, 900],
  ["phone", 390, 844],
] as const) {
  test(`an open PR whose last fix round stopped reads plainly and resumes (${label})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const calls = await mockApi(page);
    await page.goto("/runs/detail?id=01RUNR");
    const outcome = page.getByTestId("run-outcome");
    await expect(outcome).toContainText("Pull request open; the last fix round didn't finish");
    await expect(outcome).toContainText("The review fix round ran out of its time budget 3 times in a row.");
    await expect(page.getByTestId("round-incomplete")).toContainText("The pull request is unchanged. Its work so far (2 checkpoint commits) is saved on branch coderhelm-wip/abc-7-gallery-block.");
    await expect(outcome).not.toContainText(/failed/i);
    await expect(page.getByText("PR open, fix unfinished")).toBeVisible();
    await expect(outcome.getByRole("link", { name: /Open pull request #41/ })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, `round-incomplete-${width}`);

    await page.getByTestId("resume-round").click();
    await expect(page.getByText("Resuming the fix round on the same pull request")).toBeVisible();
    expect(calls).toContain("POST /api/runs/01RUNR/retry");
    await expect(page.getByTestId("round-incomplete")).toHaveCount(0);
  });
}

test("a viewer sees the state but no Resume", async ({ page }) => {
  await mockApi(page, "viewer");
  await page.goto("/runs/detail?id=01RUNR");
  await expect(page.getByTestId("round-incomplete")).toContainText("Ask someone with member access to resume it.");
  await expect(page.getByTestId("resume-round")).toHaveCount(0);
});
