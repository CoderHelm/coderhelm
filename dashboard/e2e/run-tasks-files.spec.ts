import { expect, test, type Page, type Route } from "@playwright/test";
import { planCheckResult, taskPath } from "../src/lib/plan-check";

// A finished run's Tasks card and Files changed never contradict its steps.
//
// The observed run: an end-to-end test fix that opened its pull request. The
// worker's plan check logged 3 of 3 tasks done, but the checklist file read
// "1 of 3" (a fix round after the plan check rewrote it from the unticked
// plan), and the run record had no file list, so the page said "This run
// didn't change any code" beside an open pull request with 3 changed files.
// Every API call is answered here.

const now = Date.now();
const iso = (secsAgo: number) => new Date(now - secsAgo * 1000).toISOString();
const RUN_ID = "01RUNTASKS0000000000000000";

const TASKS = [
  "## acme/web",
  "- [x] `e2e/pages/site-subnav.ts`: add the More menu to the page object",
  "- [ ] `e2e/specs/site.md`: list the new More menu test",
  "- [ ] `e2e/tests/site/site-subnav-more-menu.spec.ts`: new test that opens the More menu",
].join("\n");

const PLAN_CHECK = {
  timestamp: iso(1300),
  message: "Plan check: 3 of 3 planned tasks done\n- [x] e2e/pages/site-subnav.ts\n- [x] e2e/specs/site.md\n- [x] e2e/tests/site/site-subnav-more-menu.spec.ts",
};

type Run = Record<string, unknown>;

function run(over: Run = {}): Run {
  return {
    run_id: RUN_ID,
    status: "completed",
    ticket_source: "github",
    ticket_id: "acme/web#41",
    title: "Test: the subnav More menu opens on a phone",
    repo: "acme/web",
    pr_url: "https://github.com/acme/web/pull/1508",
    pr_number: 1508,
    branch: "coderhelm/gh-41",
    current_pass: "done",
    tokens_in: 120000,
    tokens_out: 30000,
    duration_s: 1500,
    created_at: iso(3600),
    updated_at: iso(600),
    pass_history: [
      { pass: "triage", started_at: iso(3600) },
      { pass: "plan", started_at: iso(3500) },
      { pass: "implement", started_at: iso(3000) },
      { pass: "pr", started_at: iso(1200) },
      { pass: "review", started_at: iso(1000) },
    ],
    progress_notes: [PLAN_CHECK],
    files_modified: [],
    checks: null,
    pr_review: null,
    ...over,
  };
}

async function mockApi(page: Page, r: Run, tasks = TASKS) {
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: "pat", email: "pat@example.com", avatar_url: "", role: "member" });
    if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "acme/web", enabled: true, ticket_source: "github" }] });
    if (p === "/api/plugins/catalog") return json(route, { plugins: [] });
    if (p === `/api/runs/${RUN_ID}`) return json(route, r);
    if (p === `/api/runs/${RUN_ID}/openspec`) return json(route, { proposal: "Add a test for the More menu.", tasks });
    if (p === `/api/runs/${RUN_ID}/traces`) return json(route, { traces: [] });
    if (p === `/api/runs/${RUN_ID}/agent-log`) return json(route, { passes: [], live_events: [] });
    if (p === `/api/runs/${RUN_ID}/asks`) return json(route, { asks: [] });
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
}

async function noSideways(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);
}

test.describe("plan check helpers", () => {
  test("a task's file is read as the worker's plan check reads it", () => {
    expect(taskPath("`e2e/pages/site-subnav.ts`: add the menu")).toBe("e2e/pages/site-subnav.ts");
    expect(taskPath("**src/a.ts**: x")).toBe("src/a.ts");
    expect(taskPath("./src/../lib/b.ts: x")).toBe("lib/b.ts");
    expect(taskPath("Run the whole suite: once")).toBeNull();
    expect(taskPath("No colon here")).toBeNull();
    expect(taskPath("https://example.com/x: y")).toBeNull();
  });

  test("the newest plan check wins, and a run without one has none", () => {
    expect(planCheckResult([])).toBeNull();
    expect(planCheckResult([{ message: "Plan check (format): the plan had no file paths.", timestamp: iso(5) }])).toBeNull();
    const r = planCheckResult([
      { timestamp: iso(5), message: "Plan check: 2 of 2 planned tasks done\n- [x] a.ts\n- [x] b.ts (changed by the branch this one is stacked on)" },
      { timestamp: iso(50), message: "Plan check: 0 of 2 planned tasks done\n- [ ] a.ts\n- [ ] b.ts" },
    ]);
    expect(r && Object.fromEntries(r)).toEqual({ "a.ts": true, "b.ts": true });
  });
});

test("a finished run ticks its tasks from the plan check, not a stale checklist", async ({ page }) => {
  await mockApi(page, run());
  await page.goto(`/runs/detail?id=${RUN_ID}`);
  const card = page.getByTestId("run-tasks");
  await expect(card).toBeVisible();
  await expect(page.getByTestId("run-tasks-count")).toHaveText("3 of 3 done");
  await expect(card.getByTestId("run-task")).toHaveCount(3);
  for (const t of await card.getByTestId("run-task").all()) await expect(t).toHaveAttribute("data-done", "true");
  await expect(card).not.toContainText("`");

  // A plan check that left a task out shows it as not done, whatever the checklist says.
  await mockApi(page, run({ progress_notes: [{ ...PLAN_CHECK, message: "Plan check: 2 of 3 planned tasks done\n- [x] e2e/pages/site-subnav.ts\n- [x] e2e/specs/site.md\n- [ ] e2e/tests/site/site-subnav-more-menu.spec.ts (optional)" }] }));
  await page.goto(`/runs/detail?id=${RUN_ID}`);
  await expect(page.getByTestId("run-tasks-count")).toHaveText("2 of 3 done");
  await expect(page.getByTestId("run-task").nth(2)).toHaveAttribute("data-done", "false");
});

test("a finished run with no plan check says the work is in the pull request, not empty boxes", async ({ page }) => {
  await mockApi(page, run({ progress_notes: [] }));
  await page.goto(`/runs/detail?id=${RUN_ID}`);
  const card = page.getByTestId("run-tasks");
  await expect(page.getByTestId("run-tasks-count")).toHaveText("Done in pull request #1508");
  await expect(card.getByTestId("run-task")).toHaveCount(3);
  await expect(card.getByTestId("run-task").first()).not.toHaveAttribute("data-done", /.*/);
  await expect(card.getByText("To do:")).toHaveCount(0);

  // While the run still works, the checklist's own boxes show progress.
  await mockApi(page, run({ status: "running", current_pass: "implement", progress_notes: [], pr_url: null, pr_number: null }));
  await page.goto(`/runs/detail?id=${RUN_ID}`);
  await expect(page.getByTestId("run-tasks-count")).toHaveText("1 of 3 done");
});

test("an open pull request with no recorded file list never reads as no change", async ({ page }) => {
  await mockApi(page, run());
  await page.goto(`/runs/detail?id=${RUN_ID}`);
  const files = page.getByTestId("run-files");
  await expect(files).toContainText("Coderhelm didn't record which files this run changed. Pull request #1508 has every change.");
  await expect(page.getByText("This run didn't change any code.")).toHaveCount(0);
  await expect(files.getByRole("link", { name: /See the diff on GitHub/ })).toHaveAttribute("href", "https://github.com/acme/web/pull/1508/files");

  await page.goto(`/runs/detail?id=${RUN_ID}&tab=changes`);
  const tab = page.getByTestId("run-tab-changes");
  await expect(tab.getByText("Files not recorded")).toBeVisible();
  await expect(tab.getByTestId("run-files-empty")).toContainText("Pull request #1508 has every change.");
  await expect(tab.getByRole("link", { name: /See the files on GitHub/ })).toHaveAttribute("href", "https://github.com/acme/web/pull/1508/files");
  await expect(page.getByText("This run didn't change any code.")).toHaveCount(0);

  // With the list recorded, it shows each file: the directory muted, the name plain.
  await mockApi(page, run({ files_modified: ["e2e/pages/site-subnav.ts", "e2e/specs/site.md"] }));
  await page.goto(`/runs/detail?id=${RUN_ID}`);
  await expect(page.getByTestId("run-files")).toContainText("site-subnav.ts");
  await expect(page.getByTestId("run-files-empty")).toHaveCount(0);

  // A finished run with no pull request and no files did change nothing.
  await mockApi(page, run({ pr_url: null, pr_number: null }));
  await page.goto(`/runs/detail?id=${RUN_ID}&tab=changes`);
  await expect(page.getByTestId("run-files-empty")).toHaveText("This run didn't change any code.");
});

test("Address PR comments shows only when the pull request has changes asked for", async ({ page }) => {
  await mockApi(page, run());
  await page.goto(`/runs/detail?id=${RUN_ID}`);
  await expect(page.getByTestId("run-outcome")).toBeVisible();
  await expect(page.getByRole("button", { name: "Address PR comments" })).toHaveCount(0);
  await page.goto(`/runs/detail?id=${RUN_ID}&tab=changes`);
  await expect(page.getByTestId("run-tab-changes")).toBeVisible();
  await expect(page.getByRole("button", { name: "Address PR comments" })).toHaveCount(0);

  const asked = { verdict: "REQUEST_CHANGES", review_sk: "REVIEW#acme/web#001508#2026-11-10T06:10:00Z", session_id: null, reviewed_sha: "4e1a2b0c9d8e", at: iso(500) };
  await mockApi(page, run({ pr_review: asked }));
  await page.goto(`/runs/detail?id=${RUN_ID}`);
  await expect(page.getByRole("button", { name: "Address PR comments" })).toBeVisible();

  await mockApi(page, run({ pr_review: { ...asked, verdict: "APPROVE" } }));
  await page.goto(`/runs/detail?id=${RUN_ID}`);
  await expect(page.getByTestId("run-pr-review")).toBeVisible();
  await expect(page.getByRole("button", { name: "Address PR comments" })).toHaveCount(0);
});

test("the tasks and files read on a phone with nothing scrolling sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, run({ progress_notes: [] }));
  await page.goto(`/runs/detail?id=${RUN_ID}`);
  await expect(page.getByTestId("run-tasks-count")).toHaveText("Done in pull request #1508");
  await expect(page.getByTestId("run-files")).toBeVisible();
  await noSideways(page);
});
