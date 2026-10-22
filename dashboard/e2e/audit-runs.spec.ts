import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The run page. Every API call is answered here; nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

const LONG_BRANCH = "coderhelm/your-team-web-1234-show-the-class-schedule-on-the-details-page-with-a-very-long-name";

function baseRun(over: Record<string, unknown> = {}) {
  return {
    run_id: "01RUNDONE000000000000000A",
    status: "completed",
    ticket_source: "github",
    ticket_id: "your-team/web#1234",
    title: "Show the class schedule on the details page",
    repo: "your-team/web",
    branch: LONG_BRANCH,
    pr_url: "https://github.com/your-team/web/pull/101",
    pr_number: 101,
    pr_urls: null,
    pr_numbers: null,
    branches: null,
    current_pass: "review",
    tokens_in: 1_250_000,
    tokens_out: 42_000,
    cache_read_tokens: 800_000,
    cache_write_tokens: 12_000,
    cost_usd: 4.2,
    files_modified: [
      "src/app/classes/details/schedule/components/really-long-folder-name/class-schedule-table.tsx",
      "src/lib/schedule.ts",
    ],
    mcp_servers: ["linear"],
    duration_s: 754,
    error: null,
    created_at: iso(30),
    updated_at: iso(10),
    pass_history: [
      { pass: "triage", started_at: iso(30) },
      { pass: "plan", started_at: iso(28) },
      { pass: "implement", started_at: iso(25) },
      { pass: "test", started_at: iso(18) },
      { pass: "pr", started_at: iso(14) },
      { pass: "review", started_at: iso(12) },
    ],
    progress_notes: [
      { message: "Read src/lib/schedule.ts", timestamp: iso(24) },
      { message: "Ran npm test -- --run src/lib/schedule.test.ts and every test passed after the change", timestamp: iso(17) },
    ],
    ...over,
  };
}

const OPENSPEC = {
  // No proposal on purpose: the first tab must still show a document.
  design: "## Design\n\nAdd a schedule table to the details page.",
  spec: "## Spec\n\nThe table lists each class time.",
  tasks: "## Implementation\n- [ ] Add the table in `class-schedule-table.tsx`\n- [ ] Load times in `schedule.ts`\n## Verification\n- [ ] Run the tests",
};

const TRACES = [
  { pass: "triage", duration_ms: 4000, input_tokens: 2000, output_tokens: 300, timestamp: iso(30) },
  { pass: "implement", duration_ms: 400000, input_tokens: 1_000_000, output_tokens: 30000, cache_read_tokens: 600000, timestamp: iso(25) },
  { pass: "ci_fix:2", duration_ms: 90000, input_tokens: 0, output_tokens: 0, timestamp: iso(15) },
];

interface Backend {
  calls: string[];
  posts: string[];
  run: Record<string, unknown> | null;
  runStatus: number;
  role: string;
  actionStatus: number;
  agentLogFail: boolean;
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { calls: [], posts: [], run: baseRun(), runStatus: 200, role: "admin", actionStatus: 200, agentLogFail: false, ...init };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const method = route.request().method();
    db.calls.push(`${method} ${p}${url.search}`);
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "person@example.com", avatar_url: "", role: db.role });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/support/badge") return json(route, { waiting: 0, queue_open: null });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/plugins/catalog") return json(route, { plugins: [{ id: "linear", name: "Linear" }] });
    if (p === "/api/skills/asks") return json(route, { asks: [] });
    const m = p.match(/^\/api\/runs\/([^/]+)(\/.*)?$/);
    if (m) {
      const sub = m[2] ?? "";
      if (method === "POST") {
        db.posts.push(sub);
        if (db.actionStatus !== 200) return route.fulfill({ status: db.actionStatus, body: "" });
        return json(route, { status: "ok" });
      }
      if (sub === "") {
        if (db.runStatus !== 200) return route.fulfill({ status: db.runStatus, body: "" });
        return json(route, db.run);
      }
      if (sub === "/openspec") return json(route, OPENSPEC);
      if (sub === "/traces") return json(route, { traces: TRACES });
      if (sub === "/agent-log") {
        if (db.agentLogFail) return route.fulfill({ status: 500, body: "" });
        return json(route, {
          passes: [{ pass: "implement", conversation: [{ turn: 1, role: "assistant", content: [{ type: "text", text: "Adding the table." }, { type: "tool_use", name: "write_file" }], usage: { input_tokens: 1200, output_tokens: 300, cache_read: 0, cache_write: 0 } }] }],
          live_events: [{ tool: "read_file", input_summary: "src/lib/schedule.ts and a very long summary that keeps going past the edge of a phone", duration_ms: 12, is_error: false, timestamp: iso(24) }],
        });
      }
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
    if (/favicon|net::ERR_ABORTED|net::ERR_FAILED/.test(text)) return;
    // The page's own mocked failures (404/500) are logged by the browser as failed loads.
    if (/Failed to load resource/.test(text)) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(String(err)));
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

test("a finished run shows its pull request, steps, documents and tasks without errors", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/runs/detail/?id=01RUNDONE000000000000000A");

  await expect(page.getByRole("heading", { name: "Show the class schedule on the details page" })).toBeVisible();
  await expect(page.getByText("Done", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Pull request #101/ })).toHaveAttribute("href", "https://github.com/your-team/web/pull/101");
  // Step names are words, not the worker's ids.
  await expect(page.getByRole("list", { name: "Steps" })).toContainText("Pull request");
  await expect(page.getByText("Build started")).toBeVisible();
  await expect(page.getByText("Linear")).toBeVisible();
  await expect(page.getByText("Tasks", { exact: true })).toBeVisible();

  // Trace names read as words too ("CI fix #2", not "ci_fix:2").
  await expect(page.getByText("CI fix #2")).toBeVisible();

  await shot(page, "runs-detail-completed");
  expect(errors).toEqual([]);
});

// The report a run posts when the code works as designed and the fix is a
// setting in the source system (the worker's outside-the-code fixture).
const OUTSIDE_REPORT = [
  "**Needs a change outside the code**",
  "",
  "**Cause:** The class's term is set to not be available on the web in the booking system, so the sync job marks the class inactive, as it is designed to.",
  "",
  "**What I checked**",
  "- programs where external id = 12345: one row, term id 678, active = false",
  "- terms where id = 678: available_on_web = false",
  "",
  "**What the code is meant to do:** The sync job marks a program inactive when its term is not available on the web.",
  "",
  "**What the data shows:** Term 678 has available_on_web = false in the booking system, so program 12345 is correctly inactive.",
  "",
  "**The change to make**",
  "- **Where:** the booking system (the term's settings page in the booking system's admin)",
  "- **What to change:** Set term 678 (the term of program 12345) to available on web.",
  "- **How to confirm:** After the next sync runs, program 12345 is active and the Saturday class shows on the site.",
  "",
  "No code was changed and no pull request was opened: the code works as designed, and changing it would override the data in the source system. Once the change above is made, nothing else is needed here.",
].join("\n");

test("a run whose fix is outside the code shows what to change there and opens no pull request", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page, {
    run: baseRun({
      status: "needs_outside_change",
      title: "Saturday class missing from the site",
      current_pass: "done",
      branch: null,
      pr_url: null,
      pr_number: null,
      files_modified: [],
      fix_location: "outside_code",
      outside_change_report: OUTSIDE_REPORT,
      pass_history: [{ pass: "triage", started_at: iso(6) }, { pass: "plan", started_at: iso(5) }],
    }),
  });
  await page.goto("/runs/detail/?id=01RUNDONE000000000000000A");
  await expect(page.getByText("Needs a change outside the code", { exact: true }).first()).toBeVisible();
  const report = page.getByRole("region", { name: "The fix is a change outside the code" });
  await expect(report).toBeVisible();
  await expect(report).toContainText("Set term 678 (the term of program 12345) to available on web.");
  await expect(report).toContainText("After the next sync runs");
  await expect(report).toContainText("terms where id = 678: available_on_web = false");
  // The box has its own heading; the report's first line is not repeated as text.
  await expect(report.getByText("Needs a change outside the code")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Pull request #/ })).toHaveCount(0);
  await expect(page.getByText("Reported the change to make outside the code")).toBeVisible();
  // Triage and plan are done; nothing after them ran, on purpose.
  await expect(page.getByRole("list", { name: "Steps" }).locator("svg")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Start over from scratch" })).toBeVisible();
  await shot(page, "runs-detail-outside-code");
  expect(errors).toEqual([]);
});

test("a run that learned the fix was elsewhere shows the lesson it saved", async ({ page }) => {
  await mockApi(page, {
    run: baseRun({ lesson: "Classes missing from the site are often because their semester is not available on web in the booking system; check that setting first." }),
  });
  await page.goto("/runs/detail/?id=01RUNDONE000000000000000A");
  await expect(page.getByText("Lesson saved for this repository:")).toBeVisible();
  await expect(page.getByText(/semester is not available on web in the booking system/)).toBeVisible();
});

test("the spec documents open on a document that exists, never an empty tab", async ({ page }) => {
  await mockApi(page);
  await page.goto("/runs/detail/?id=01RUNDONE000000000000000A");
  await expect(page.getByRole("heading", { name: "Spec documents" })).toBeVisible();
  await expect(page.getByRole("button", { name: "design" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Add a schedule table to the details page.")).toBeVisible();
  await expect(page.getByText("undefined")).toHaveCount(0);
  await page.getByRole("button", { name: "spec" }).click();
  await expect(page.getByText("The table lists each class time.")).toBeVisible();
});

test("a merged run offers no start over, since that would close a merged pull request", async ({ page }) => {
  await mockApi(page, { run: baseRun({ status: "merged" }) });
  await page.goto("/runs/detail/?id=01RUNDONE000000000000000A");
  await expect(page.getByText("Merged", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Pull request merged")).toBeVisible();
  await expect(page.getByRole("button", { name: /Start over/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review again" })).toHaveCount(0);
});

test("start over asks in the app's own dialog, then calls reset", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/runs/detail/?id=01RUNDONE000000000000000A");
  await page.getByRole("button", { name: "Start over from scratch" }).click();
  await expect(page.getByText("Start this run over?")).toBeVisible();
  await page.getByRole("button", { name: "Start over", exact: true }).click();
  await expect.poll(() => db.posts).toContain("/reset");
  await expect(page).toHaveURL(/\/$/);
});

test("a running run can be cancelled and the step list wraps on a phone", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page, {
    run: baseRun({ status: "running", current_pass: "implement", pr_url: null, pr_number: null, files_modified: [], pass_history: [{ pass: "triage", started_at: iso(5) }, { pass: "plan", started_at: iso(4) }, { pass: "implement", started_at: iso(2) }] }),
  });
  await page.goto("/runs/detail/?id=01RUNDONE000000000000000A");
  await expect(page.getByText("Running", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Start over from scratch" })).toHaveCount(0);
  await shot(page, "runs-detail-running");
  await page.getByRole("button", { name: "Cancel run" }).click();
  await expect.poll(() => db.posts).toContain("/cancel");
  await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("a queued run keeps refreshing until it starts", async ({ page }) => {
  const db = await mockApi(page, { run: baseRun({ status: "queued", current_pass: null, pass_history: [], pr_url: null }) });
  await page.goto("/runs/detail/?id=01RUNDONE000000000000000A");
  await expect(page.getByText("Queued", { exact: true }).first()).toBeVisible();
  db.run = baseRun({ status: "running", current_pass: "triage", pr_url: null });
  await expect(page.getByText("Running", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
});

test("a failed run shows what went wrong with one retry, and a refused retry says why", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page, {
    run: baseRun({ status: "failed", current_pass: "test", pr_url: null, pr_number: null, error: "Tests failed: https://ci.example.com/your-team/web/runs/123456789/jobs/987654321/a-very-long-log-link-that-would-push-the-page-wide" }),
    actionStatus: 429,
  });
  await page.goto("/runs/detail/?id=01RUNDONE000000000000000A");
  await expect(page.getByText("What went wrong")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(1);
  await shot(page, "runs-detail-failed");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("The monthly token limit is reached, so no new work can start.")).toBeVisible();
  expect(db.posts).toContain("/retry");
  expect(errors).toEqual([]);
});

test("a viewer sees the run but no buttons the server would refuse", async ({ page }) => {
  await mockApi(page, { role: "viewer", run: baseRun({ status: "failed", current_pass: "test" }) });
  await page.goto("/runs/detail/?id=01RUNDONE000000000000000A");
  await expect(page.getByRole("heading", { name: "Show the class schedule on the details page" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Pull request #101/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Start over/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review again" })).toHaveCount(0);
});

test("a link without a run id explains itself", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/runs/detail/");
  await expect(page.getByText("No run picked")).toBeVisible();
  await expect(page.getByRole("link", { name: "← Runs" })).toBeVisible();
  await shot(page, "runs-detail-no-id");
  expect(errors).toEqual([]);
});

test("a run that doesn't exist says so, and a server error offers a retry", async ({ page }) => {
  const db = await mockApi(page, { runStatus: 404 });
  await page.goto("/runs/detail/?id=01RUNMISSING0000000000000");
  await expect(page.getByText("Run not found")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);

  db.runStatus = 500;
  await page.reload();
  await expect(page.getByText("Couldn't load this run")).toBeVisible();
  await shot(page, "runs-detail-error");
  db.runStatus = 200;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Show the class schedule on the details page" })).toBeVisible();
});

test("the agent log opens with the keyboard state announced, and a failed load can be retried", async ({ page }) => {
  const db = await mockApi(page, { agentLogFail: true });
  await page.goto("/runs/detail/?id=01RUNDONE000000000000000A");
  const toggle = page.getByRole("button", { name: "Agent log" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Couldn't load the agent log.")).toBeVisible();
  db.agentLogFail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Tool calls (1)")).toBeVisible();
  await page.getByRole("button", { name: /Build \(1 turn\)/ }).click();
  await expect(page.getByText("Agent", { exact: true })).toBeVisible();
  await shot(page, "runs-detail-agent-log");
});
