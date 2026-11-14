import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The run page's Activity tab: the run's story in time order, from
// GET /api/runs/:id/activity, newest last. It is never blank: a loading
// state, an error with a retry, one line when nothing has happened yet, and
// "What the run used" read again while the run works. Every API call is
// answered here.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

type Run = Record<string, unknown> & { run_id: string; status: string };
type Entry = { id: string; at: string; actor: string; who?: string; kind: string; text: string; link?: string; tone: string };

function entry(minsAgo: number, text: string, over: Partial<Entry> = {}): Entry {
  const at = iso(minsAgo);
  return { id: `${at}#run#${text.length.toString().padStart(4, "0")}`, at, actor: "coderhelm", kind: "note", text, tone: "neutral", ...over };
}

function aRun(over: Partial<Run> = {}): Run {
  return {
    run_id: "01RUNA",
    status: "completed",
    ticket_source: "jira",
    ticket_id: "ABC-9",
    title: "Show the order total on the receipt",
    repo: "your-team/web",
    current_pass: "pr",
    tokens_in: 1200,
    tokens_out: 300,
    cost_usd: 0.4,
    duration_s: 600,
    created_at: iso(40),
    updated_at: iso(20),
    pass_history: [
      { pass: "triage", started_at: iso(40) },
      { pass: "implement", started_at: iso(35) },
    ],
    progress_notes: [{ message: "Tests pass; opening the pull request.", timestamp: iso(25) }],
    questions: [],
    answers: [],
    pr_url: "https://github.com/your-team/web/pull/12",
    ...over,
  };
}

const FINISHED: Entry[] = [
  entry(40, "Run started from Jira ABC-9", { actor: "jira", kind: "started", link: "https://your-team.example.com/browse/ABC-9" }),
  entry(35, "Started build", { kind: "step" }),
  entry(24, "Opened the pull request in 1m 5s", { kind: "step_done", tone: "good", link: "https://github.com/your-team/web/pull/12" }),
  entry(22, "Coderhelm's review of #12 approved", { kind: "review", tone: "good", link: "/reviewer/detail?sk=REVIEW%23x" }),
  entry(21, "Approved: Use deploy on staging", { actor: "person", who: "Pat Doe", kind: "approval_answered", tone: "good" }),
  entry(20, "Finished", { kind: "status", tone: "good" }),
];

interface Backend {
  run: Run;
  /** What a read of the activity answers now; a number is an HTTP error. */
  activity: Entry[] | number;
  activityReads: number;
  /** What a read of what the run used answers now. */
  used: Record<string, unknown>;
  usedReads: number;
}

const NOTHING_USED = { skills: [], agents: [], sources: [], standards: [] };
const ONE_SKILL = {
  skills: [{ name: "debugging", kind: "skill", repo: "your-team/playbook", path: "skills/debugging.md", count: 1 }],
  agents: [],
  sources: [],
  standards: [],
};

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { run: aRun(), activity: FINISHED, activityReads: 0, used: NOTHING_USED, usedReads: 0, ...init };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: "pat", email: "pat@example.com", avatar_url: "", role: "member" });
    if (p === "/api/usage") return json(route, { month: "2026-10", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "your-team/web", enabled: true, ticket_source: "jira" }] });
    if (p === "/api/plugins/catalog") return json(route, { plugins: [] });
    if (p === "/api/agents/approvals") return json(route, { approvals: [], can: { approve: false, always: false } });
    if (p === "/api/skills/asks") return json(route, { asks: [] });
    if (p === "/api/skills/used") {
      db.usedReads += 1;
      return json(route, db.used);
    }
    const m = p.match(/^\/api\/runs\/([^/]+)(?:\/(.+))?$/);
    if (m && decodeURIComponent(m[1]) === db.run.run_id) {
      const action = m[2];
      if (!action) return json(route, db.run);
      if (action === "activity") {
        const a = db.activity;
        db.activityReads += 1;
        if (typeof a === "number") return json(route, { error: "Couldn't read the run. Try again." }, a);
        return json(route, { entries: a, earlier: null, total: a.length });
      }
      if (action === "openspec") return json(route, {});
      if (action === "traces") return json(route, { traces: [] });
      if (action === "agent-log") return json(route, { passes: [], live_events: [] });
      if (action === "outputs") return json(route, { outputs: [] });
    }
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true });
}

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

const open = (page: Page) => page.goto("/runs/detail?id=01RUNA&tab=activity");

test.describe("the run's Activity tab", () => {
  test("a finished run shows its story in time order, with who and links", async ({ page }) => {
    await mockApi(page);
    await open(page);
    const list = page.getByTestId("run-activity-list");
    const rows = list.getByRole("listitem");
    await expect(rows).toHaveCount(FINISHED.length);
    await expect(rows.first()).toContainText("Run started from Jira ABC-9");
    await expect(rows.first()).toContainText("Jira");
    await expect(rows.last()).toContainText("Finished");
    await expect(rows.nth(4)).toContainText("Pat Doe");
    const pr = list.getByRole("link", { name: /Opened the pull request/ });
    await expect(pr).toHaveAttribute("href", "https://github.com/your-team/web/pull/12");
    await expect(pr).toHaveAttribute("target", "_blank");
    await expect(list.getByRole("link", { name: /review of #12 approved/ })).toHaveAttribute("href", /^\/reviewer\/detail\/?\?sk=REVIEW%23x$/);
    await noSideScroll(page);
    await shot(page, "run-activity-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(rows.first()).toBeVisible();
    await noSideScroll(page);
    await shot(page, "run-activity-phone");
  });

  test("an active run gains entries without a reload", async ({ page }) => {
    const first = FINISHED.slice(0, 2);
    const db = await mockApi(page, {
      run: aRun({ status: "running", updated_at: iso(1) }),
      activity: first,
    });
    await open(page);
    const rows = page.getByTestId("run-activity-list").getByRole("listitem");
    await expect(rows).toHaveCount(2);
    // The run moves on: the page's own poll sees the change and the tab reads again.
    db.activity = [...first, entry(0.5, "Started test", { kind: "step" })];
    db.run = { ...db.run, updated_at: new Date().toISOString(), current_pass: "test" };
    await expect(rows).toHaveCount(3, { timeout: 20_000 });
    await expect(rows.last()).toContainText("Started test");
    expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(1);
  });

  test("what the run used shows when its records arrive after the tab opened", async ({ page }) => {
    // The run keeps working ("running" the whole time); its first skill read
    // is recorded after the tab's first look.
    const db = await mockApi(page, {
      run: aRun({ status: "running", updated_at: iso(1) }),
    });
    await open(page);
    await expect(page.getByTestId("run-tab-activity")).toBeAttached();
    await expect.poll(() => db.usedReads).toBeGreaterThan(0);
    await page.waitForTimeout(1000);
    await expect(page.getByTestId("work-used")).toHaveCount(0);
    db.used = ONE_SKILL;
    await expect(page.getByTestId("work-used")).toContainText("1 skill", { timeout: 25_000 });
  });

  test("a failed read shows the problem and a retry that works", async ({ page }) => {
    const db = await mockApi(page, { activity: 500 });
    await open(page);
    const problem = page.getByTestId("run-activity-error");
    await expect(problem).toContainText("Couldn't load this run's activity.");
    db.activity = FINISHED;
    await problem.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByTestId("run-activity-list").getByRole("listitem")).toHaveCount(FINISHED.length);
    await expect(page.getByTestId("run-activity-error")).toHaveCount(0);
  });

  test("a run with nothing yet says what will appear", async ({ page }) => {
    await mockApi(page, { run: aRun({ status: "queued", pass_history: [], progress_notes: [] }), activity: [] });
    await open(page);
    await expect(page.getByTestId("run-activity-empty")).toContainText("Nothing has happened on this run yet.");
  });

  test("an older service without the activity still tells the story from the run", async ({ page }) => {
    await mockApi(page, { activity: 404 });
    await open(page);
    const rows = page.getByTestId("run-activity-list").getByRole("listitem");
    await expect(rows).toHaveCount(4);
    await expect(rows.first()).toContainText("Run started");
    await expect(rows.nth(2)).toContainText("Started build");
    await expect(page.getByTestId("run-activity-partial")).toBeVisible();
  });
});
