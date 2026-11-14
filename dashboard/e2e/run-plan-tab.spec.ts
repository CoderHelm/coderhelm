import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The run page's Plan tab: the plan's documents (design, proposal, spec) on
// their own tab, the full width, with the chosen document in the link
// (`&doc=spec`). Changes points to it; a run with no plan has no Plan tab
// and a link to it lands on the Overview. Every API call is answered here.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

const PLAN = {
  design: "## Design\n\nA total row under the line items.",
  proposal: "## Proposal\n\n### Problem\n\nThe receipt has no order total.\n\n### What we build\n\nA total row.",
  spec: "## Spec\n\nThe total is the sum of the line items, in the order's currency.",
  tasks: "## Implementation\n- [ ] Add the row in `receipt.tsx`",
};

function aRun(over: Record<string, unknown> = {}) {
  return {
    run_id: "01RUNP",
    status: "completed",
    ticket_source: "jira",
    ticket_id: "ABC-9",
    title: "Show the order total on the receipt",
    repo: "your-team/web",
    current_pass: "pr",
    created_at: iso(40),
    updated_at: iso(20),
    pass_history: [{ pass: "triage", started_at: iso(40) }, { pass: "plan", started_at: iso(38) }],
    progress_notes: [],
    questions: [],
    answers: [],
    files_modified: ["src/receipt.tsx"],
    pr_url: "https://github.com/your-team/web/pull/12",
    ...over,
  };
}

async function mockApi(page: Page, openspec: Record<string, string> | null, run: Record<string, unknown> = aRun()) {
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: "pat", email: "pat@example.com", avatar_url: "", role: "member" });
    if (p === "/api/usage") return json(route, { month: "2026-10", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/plugins/catalog") return json(route, { plugins: [] });
    if (p === "/api/agents/approvals") return json(route, { approvals: [], can: { approve: false, always: false } });
    if (p === "/api/skills/asks") return json(route, { asks: [] });
    if (p === "/api/runs/01RUNP") return json(route, run);
    if (p === "/api/runs/01RUNP/openspec") return openspec ? json(route, openspec) : json(route, { error: "No plan." }, 404);
    if (p === "/api/runs/01RUNP/traces") return json(route, { traces: [] });
    if (p === "/api/runs/01RUNP/agent-log") return json(route, { passes: [], live_events: [] });
    if (p === "/api/runs/01RUNP/outputs") return json(route, { outputs: [] });
    if (p === "/api/runs/01RUNP/activity") return json(route, { entries: [], earlier: null, total: 0 });
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
}

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true });
}

test.describe("the run's Plan tab", () => {
  test("sits after Overview, shows the plan, and the chosen document stays in the link", async ({ page }) => {
    await mockApi(page, PLAN);
    await page.goto("/runs/detail?id=01RUNP");
    const planTab = page.getByRole("link", { name: "Plan", exact: true });
    await expect(planTab).toBeVisible();
    const order = await page.getByRole("link", { name: /^(Overview|Plan|Changes|Activity|Agent log|Details)$/ }).allTextContents();
    expect(order).toEqual(["Overview", "Plan", "Changes", "Activity", "Agent log", "Details"]);
    await planTab.click();
    await expect(page).toHaveURL(/tab=plan/);
    const plan = page.getByTestId("run-tab-plan");
    await expect(plan.getByRole("button", { name: "proposal" })).toHaveAttribute("aria-pressed", "true");
    await expect(plan).toContainText("The receipt has no order total.");
    await plan.getByRole("button", { name: "spec" }).click();
    await expect(page).toHaveURL(/tab=plan&doc=spec/);
    await expect(plan).toContainText("sum of the line items");
    // The link opens the same document.
    await page.goto("/runs/detail?id=01RUNP&tab=plan&doc=design");
    await expect(page.getByTestId("run-tab-plan").getByRole("button", { name: "design" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("run-tab-plan")).toContainText("A total row under the line items.");
    await noSideScroll(page);
    await shot(page, "run-plan-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("run-tab-plan")).toContainText("A total row under the line items.");
    await noSideScroll(page);
    await shot(page, "run-plan-phone");
  });

  test("Changes no longer holds the plan; it links to the Plan tab", async ({ page }) => {
    await mockApi(page, PLAN);
    await page.goto("/runs/detail?id=01RUNP&tab=changes");
    await expect(page.getByTestId("run-tab-changes")).toBeVisible();
    await expect(page.getByRole("group", { name: "Plan documents" })).toHaveCount(0);
    await page.getByTestId("changes-plan-link").getByRole("link", { name: "See the plan" }).click();
    await expect(page).toHaveURL(/tab=plan/);
    await expect(page.getByTestId("run-tab-plan")).toContainText("The receipt has no order total.");
  });

  test("a run that is still planning opens on its plan; a link to another tab still wins", async ({ page }) => {
    await mockApi(page, PLAN, aRun({ status: "running", current_pass: "plan", pr_url: null, files_modified: [] }));
    await page.goto("/runs/detail?id=01RUNP");
    await expect(page.getByTestId("run-tab-plan")).toContainText("The receipt has no order total.");
    await page.goto("/runs/detail?id=01RUNP&tab=overview");
    await expect(page.getByTestId("run-tab-overview")).toBeVisible();
  });

  test("a run with no plan has no Plan tab, and a link to it shows the Overview", async ({ page }) => {
    await mockApi(page, null);
    await page.goto("/runs/detail?id=01RUNP&tab=plan");
    await expect(page.getByTestId("run-tab-overview")).toBeVisible();
    await expect(page.getByTestId("run-tab-plan")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Plan", exact: true })).toHaveCount(0);
    await page.goto("/runs/detail?id=01RUNP&tab=changes");
    await expect(page.getByTestId("changes-plan-link")).toHaveCount(0);
  });
});
