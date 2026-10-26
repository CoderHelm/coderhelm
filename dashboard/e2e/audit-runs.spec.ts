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

// The run's asks to the team's own agents. Review steps send the same
// framing question every time (worker `review_question`).
const REVIEW_Q = (subject: string) =>
  `Review this ${subject}, given in the context below, with your rubric. Apply only the parts of your rubric that fit a change of this size. Return the concrete gaps, one per line, each naming what is missing or wrong and where; or answer exactly 'none' when there are none. No praise, no summary, no rewrite.`;

type Ask = Record<string, unknown> & { id: string };

function ask(id: string, over: Record<string, unknown>): Ask {
  return {
    id, repo: "your-team/playbook", path: "agents/requirements-reviewer.md", by: "planner", origin: "your-team/web#1234",
    run_id: "01RUNDONE000000000000000A", sha: "abc1234", question: REVIEW_Q("draft plan"), context_chars: 5200,
    outcome: "answered", answer: "none", model: "claude-sonnet-4-6", input_tokens: 4200, output_tokens: 380, ms: 14200, at: iso(27), ...over,
  };
}

const PLAN_GAPS = [
  "- proposal.md: the goal never says which page the schedule replaces, so the scope can't be checked.",
  "- spec.md: no rule for a class with no times; say whether the table is hidden or shows `No classes`.",
  "- tasks.md: nothing verifies the table on a phone width.",
].join("\n");

const ONE_ASK = [ask("a1", { answer: PLAN_GAPS })];

const MANY_ASKS = [
  ...ONE_ASK,
  ask("a2", { path: "agents/accessibility-checker.md", answer: "- design.md: the table has no caption or header cells for screen readers." }),
  ask("a3", { path: "agents/security-reviewer.md", answer: "None, fine for its size.", ms: 8100 }),
  ask("a4", { by: "writer", path: "agents/copy-editor.md", question: REVIEW_Q("pull request description"), answer: "- The summary says \"fixes\" twice; say what changed instead.", at: iso(13) }),
  ask("a5", { by: "writer", path: "agents/release-notes-checker.md", question: REVIEW_Q("pull request description"), answer: "none", at: iso(13) }),
  ask("a6", { by: "writer", path: "agents/link-checker.md", question: REVIEW_Q("pull request description"), outcome: "timed_out", answer: "", input_tokens: 0, output_tokens: 0, ms: 120000, at: iso(13) }),
  ask("a7", { by: "planner", path: "agents/domain-expert.md", question: "Does a class with a waitlist count as full on the details page?", answer: "Yes. A class is **full** when its waitlist is open; show `Waitlist` instead of the time.", at: iso(28) }),
  ask("a8", { by: "coder", path: "agents/domain-expert.md", question: "Which time zone are class times stored in?", outcome: "failed", answer: "", input_tokens: 0, output_tokens: 0, ms: 900, at: iso(22) }),
];

const reviewTrace = (pass: string, step: string, revised: boolean, reviews: { path: string; cost_usd: number }[], minsAgo: number) => ({
  pass, duration_ms: 20000, input_tokens: 9000, output_tokens: 900, timestamp: iso(minsAgo),
  detail: { step, revised, cost_usd: reviews.reduce((n, r) => n + r.cost_usd, 0), reviews: reviews.map((r) => ({ agent: r.path, repo: "your-team/playbook", path: r.path, outcome: "answered", cost_usd: r.cost_usd })) },
});

const ASK_TRACES = [
  reviewTrace("plan_review", "plan", true, [
    { path: "agents/requirements-reviewer.md", cost_usd: 0.0184 },
    { path: "agents/accessibility-checker.md", cost_usd: 0.0061 },
    { path: "agents/security-reviewer.md", cost_usd: 0.0043 },
  ], 26),
  reviewTrace("pr_review", "prose", false, [
    { path: "agents/copy-editor.md", cost_usd: 0.0032 },
    { path: "agents/release-notes-checker.md", cost_usd: 0.0029 },
  ], 12),
];

interface Backend {
  asks: Ask[];
  traces: unknown[];
  calls: string[];
  posts: string[];
  run: Record<string, unknown> | null;
  runStatus: number;
  role: string;
  actionStatus: number;
  agentLogFail: boolean;
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { asks: [], traces: TRACES, calls: [], posts: [], run: baseRun(), runStatus: 200, role: "admin", actionStatus: 200, agentLogFail: false, ...init };
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
    if (p === "/api/skills/asks") return json(route, { asks: db.asks });
    if (p === "/api/skills/used") return json(route, { skills: [], agents: [], sources: [], standards: [] });
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
      if (sub === "/traces") return json(route, { traces: db.traces });
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

/** Opens one of the run page's tabs. */
async function openTab(page: Page, name: "Overview" | "Changes" | "Activity" | "Details") {
  await page.getByRole("navigation", { name: "Run views" }).getByRole("link", { name }).click();
  await expect(page.getByRole("navigation", { name: "Run views" }).getByRole("link", { name })).toHaveAttribute("aria-current", "page");
}

/** Opens the page's More menu and picks an item. */
async function fromMore(page: Page, item: string | RegExp) {
  await page.getByTestId("page-actions").getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: item }).click();
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
  // The outcome leads, with the one next step: open the pull request.
  const outcome = page.getByTestId("run-outcome");
  await expect(outcome).toContainText("Done. The change is ready for review.");
  await expect(outcome.getByRole("link", { name: /Open pull request #101/ })).toHaveAttribute("href", "https://github.com/your-team/web/pull/101");
  // Step names are words, not the worker's ids.
  await expect(page.getByRole("list", { name: "Steps" })).toContainText("Pull request");
  await expect(page.getByText("Tasks", { exact: true })).toBeVisible();
  await expect(page.getByTestId("stat-time")).toContainText("12m 34s");
  // Token parts are technical detail: not on the overview.
  await expect(page.getByText("Read from cache")).toHaveCount(0);
  await shot(page, "runs-detail-completed");

  await openTab(page, "Changes");
  await expect(page).toHaveURL(/tab=changes/);
  await expect(page.getByText("Linear")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Files changed/ })).toBeVisible();
  await openTab(page, "Activity");
  await expect(page.getByText("Build started")).toBeVisible();
  await openTab(page, "Details");
  // Trace names read as words too ("CI fix #2", not "ci_fix:2").
  await expect(page.getByText("CI fix #2")).toBeVisible();
  await expect(page.getByText("Read from cache")).toBeVisible();
  await expect(page.getByText("01RUNDONE000000000000000A")).toBeVisible();
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

/** The Details tab's "Run ID" value (the row after its label). */
function runIdRow(page: Page) {
  return page.getByRole("region", { name: "Run" }).getByText("Run ID", { exact: true }).locator("xpath=following-sibling::dd[1]");
}

test("the details show the run's id from the server, with a copy button", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page, { run: baseRun({ run_id: "01RUNFROMSERVER0000000000A" }) });
  await page.goto("/runs/detail/?id=01RUNDONE000000000000000A&tab=details");
  await expect(runIdRow(page)).toContainText("01RUNFROMSERVER0000000000A");
  await expect(runIdRow(page).getByRole("button", { name: "Copy run ID" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the details show the run's id from the link when the answer leaves it out", async ({ page }) => {
  const errors = watchConsole(page);
  const bare: Record<string, unknown> = baseRun();
  delete bare.run_id;
  await mockApi(page, { run: bare });
  await page.goto("/runs/detail/?id=01RUNDONE000000000000000A&tab=details");
  await expect(page.getByRole("heading", { name: "Show the class schedule on the details page" })).toBeVisible();
  await expect(runIdRow(page)).toContainText("01RUNDONE000000000000000A");
  await expect(runIdRow(page).getByRole("button", { name: "Copy run ID" })).toBeVisible();
  expect(errors).toEqual([]);
});

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
  await expect(page.getByRole("link", { name: /pull request #/i })).toHaveCount(0);
  // Triage and plan are done; nothing after them ran, on purpose.
  await expect(page.getByRole("list", { name: "Steps" }).locator("svg")).toHaveCount(2);
  await shot(page, "runs-detail-outside-code");
  await page.getByTestId("page-actions").getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("menuitem", { name: /Start over from scratch/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await openTab(page, "Activity");
  await expect(page.getByText("Reported the change to make outside the code")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a run that learned the fix was elsewhere shows the lesson it saved", async ({ page }) => {
  await mockApi(page, {
    run: baseRun({ lesson: "Classes missing from the site are often because their semester is not available on web in the booking system; check that setting first." }),
  });
  await page.goto("/runs/detail/?id=01RUNDONE000000000000000A");
  await expect(page.getByText("Coderhelm learned")).toBeVisible();
  await expect(page.getByText(/semester is not available on web in the booking system/)).toBeVisible();
});

test("the spec documents open on a document that exists, never an empty tab", async ({ page }) => {
  await mockApi(page);
  await page.goto("/runs/detail/?id=01RUNDONE000000000000000A&tab=changes");
  await expect(page.getByRole("heading", { name: "Plan", exact: true })).toBeVisible();
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
  await expect(page.getByTestId("run-outcome")).toContainText("The change was merged");
  await expect(page.getByRole("button", { name: "More" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review again" })).toHaveCount(0);
  await openTab(page, "Activity");
  await expect(page.getByText("Pull request merged")).toBeVisible();
});

test("start over asks in the app's own dialog, then calls reset", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/runs/detail/?id=01RUNDONE000000000000000A");
  await fromMore(page, /Start over from scratch/);
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
  await expect(page.getByTestId("run-outcome")).toContainText("Coderhelm is working on this");
  await expect(page.getByTestId("run-outcome")).toContainText("build step");
  await expect(page.getByRole("menuitem", { name: /Start over/ })).toHaveCount(0);
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
  // A plain headline and the next step; the raw error waits behind Technical details.
  const outcome = page.getByTestId("run-outcome");
  await expect(outcome).toContainText("Coderhelm stopped before it finished");
  await expect(outcome).toContainText("test step");
  await expect(outcome.getByText(/ci\.example\.com/)).toBeHidden();
  await outcome.getByText("Technical details").click();
  await expect(outcome.getByText(/ci\.example\.com/)).toBeVisible();
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
  await expect(page.getByRole("link", { name: /Open pull request #101/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Start over/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review again" })).toHaveCount(0);
});

test("a link without a run id explains itself", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/runs/detail/");
  await expect(page.getByText("No run picked")).toBeVisible();
  await expect(page.getByTestId("breadcrumb").getByRole("link", { name: "Runs" })).toBeVisible();
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
  await page.goto("/runs/detail/?id=01RUNDONE000000000000000A&tab=details");
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

// ── Team agents asked ────────────────────────────────────────────────

/** The section alone at both widths, plus the whole page. */
async function asksShot(page: Page, name: string) {
  await shot(page, name);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(200);
    await page.getByTestId("team-asks").screenshot({ path: path.join(SHOTS_DIR, `${name}-section-${width}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

test("one ask to a team agent is one row: who asked, which agent, its gaps, and what the planner did", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page, { asks: ONE_ASK, traces: [...TRACES, ...ASK_TRACES.slice(0, 1)] });
  await page.goto("/runs/detail/?id=01RUNDONE000000000000000A&tab=activity");
  const section = page.getByTestId("team-asks");
  await expect(section.getByRole("heading", { name: /Team agents asked/ })).toContainText("(1)");
  await expect(page.getByTestId("asks-summary")).toHaveText("1 team agent reviewed the plan · 3 gaps · plan revised once");
  const row = section.getByTestId("ask-row");
  await expect(row.getByRole("link", { name: "requirements-reviewer" })).toHaveAttribute("href", /\/skills\/agent\/?\?repo=your-team%2Fplaybook&path=agents%2Frequirements-reviewer\.md/);
  await expect(row).toContainText("Asked by the Planner");
  await expect(row).toContainText("14s");
  await expect(row).toContainText("$0.02");
  await expect(row).toContainText("3 gaps");
  // The framing question is never on the row; it is behind one disclosure.
  await expect(section.getByText("Apply only the parts of your rubric")).toBeHidden();
  await expect(section.getByText("What the reviewing agents were asked")).toBeVisible();
  await expect(page.getByTestId("asks-next-plan")).toHaveText("Planner revised the plan on these notes.");
  // Collapsed until asked.
  await expect(section.getByTestId("gap")).toHaveCount(0);
  await row.getByRole("button", { name: "Show requirements-reviewer's answer" }).click();
  await expect(section.getByTestId("gap")).toHaveCount(3);
  await expect(section.getByTestId("gap-file")).toHaveText(["proposal.md", "spec.md", "tasks.md"]);
  // The chip names the file; the line doesn't say it again.
  await expect(section.getByTestId("gap").first()).toContainText("The goal never says which page");
  await expect(section.getByTestId("gap").first()).not.toContainText("proposal.md:");
  await expect(section.getByTestId("gap").nth(1).locator("code")).toHaveText("No classes");
  await asksShot(page, "run-asks-one");
  expect(errors).toEqual([]);
});

test("eight asks group by step, open one at a time, and say what each step did", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page, { asks: MANY_ASKS, traces: [...TRACES, ...ASK_TRACES] });
  await page.goto("/runs/detail/?id=01RUNDONE000000000000000A&tab=activity");
  const section = page.getByTestId("team-asks");
  await expect(page.getByTestId("asks-summary")).toHaveText(
    "8 asks to 7 team agents · 5 gaps · plan revised · 2 without an answer",
  );
  await expect(section.getByRole("heading", { level: 3 })).toHaveText([/Plan review\s*3/, /PR description review\s*3/, /Questions\s*2/]);
  await expect(section.getByTestId("ask-row")).toHaveCount(8);
  await expect(page.getByTestId("asks-next-plan")).toHaveText("Planner revised the plan on these notes.");
  await expect(page.getByTestId("asks-next-prose")).toHaveText("Writer kept the draft: the revision didn't hold.");
  const rows = section.getByTestId("ask-row");
  await expect(rows.filter({ hasText: "security-reviewer" })).toContainText("No gaps");
  await expect(rows.filter({ hasText: "link-checker" })).toContainText("Timed out");
  await expect(rows.filter({ hasText: "link-checker" })).toContainText("2m");
  await expect(rows.filter({ hasText: "Asked by the Coder" })).toContainText("Failed");
  // One open at a time.
  await rows.filter({ hasText: "accessibility-checker" }).getByRole("button", { name: /Show accessibility-checker/ }).click();
  await expect(section.getByTestId("gap")).toHaveCount(1);
  await rows.filter({ hasText: "Asked by the Planner" }).filter({ hasText: "domain-expert" }).getByRole("button", { name: /Show domain-expert/ }).click();
  await expect(section.getByTestId("gap")).toHaveCount(0);
  await expect(section.getByText("Does a class with a waitlist count as full on the details page?")).toBeVisible();
  await expect(section.locator("strong", { hasText: "full" })).toBeVisible();
  await asksShot(page, "run-asks-many");
  expect(errors).toEqual([]);
});

test("a finished run with an old error says it's done; the old error waits in Activity", async ({ page }) => {
  await mockApi(page, { run: baseRun({ status: "completed", error: "TypeError: Cannot read properties of undefined (reading 'times')" }) });
  await page.goto("/runs/detail/?id=01RUNDONE000000000000000A");
  await expect(page.getByTestId("run-outcome")).toContainText("Done");
  await expect(page.getByText(/TypeError/)).toHaveCount(0);
  await expect(page.getByText("Coderhelm stopped before it finished")).toHaveCount(0);
  await openTab(page, "Activity");
  await expect(page.getByText("A problem earlier in this run")).toBeVisible();
});

test("the run tabs fit a phone, and the tasks sit right under the progress", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto("/runs/detail/?id=01RUNDONE000000000000000A");
  const steps = await page.getByRole("list", { name: "Steps" }).boundingBox();
  const tasks = await page.getByText("Tasks", { exact: true }).boundingBox();
  const time = await page.getByTestId("stat-time").boundingBox();
  expect(tasks!.y).toBeGreaterThan(steps!.y);
  expect(tasks!.y).toBeLessThan(time!.y);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
