import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The Tests area against a mocked backend. Nothing reaches a real server.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const WEB = "your-team/web";
const MOBILE = "your-team/mobile-app";
const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

type State = "healthy" | "flaky" | "broken" | "quarantined" | "fixed";

interface TestRow {
  id: string; repo: string; framework: string; file: string; title: string; project?: string | null; state: State; flags: string[];
  owner?: string | null; cause?: { label: string; evidence: string } | null; runs_30d: number; fail_rate_30d: number; flake_rate_30d: number;
  flips_14d: number; prs_blocked_7d: number; minutes_lost_7d: number; p50_ms: number; p95_ms: number; last_seen: string;
  quarantined_since?: string | null; never_quarantine: boolean; ticket_url?: string | null; fix_pr_url?: string | null; fix_status?: string | null;
}

function makeTest(over: Partial<TestRow> & Pick<TestRow, "id" | "title" | "state">): TestRow {
  return {
    repo: WEB, framework: "playwright", file: "e2e/specs/checkout.spec.ts", project: "chromium", flags: [], owner: "@your-team/web",
    cause: null, runs_30d: 120, fail_rate_30d: 0.01, flake_rate_30d: 0, flips_14d: 0, prs_blocked_7d: 0, minutes_lost_7d: 0,
    p50_ms: 14_000, p95_ms: 22_000, last_seen: ago(3_600_000), quarantined_since: null, never_quarantine: false,
    ticket_url: null, fix_pr_url: null, fix_status: null, ...over,
  };
}

const FLAKY = makeTest({
  id: "t_flaky", title: "checkout: pays with a saved card", state: "flaky", flake_rate_30d: 0.08, fail_rate_30d: 0.08, flips_14d: 6,
  prs_blocked_7d: 4, minutes_lost_7d: 96, cause: { label: "animation_loader", evidence: "The pay button is clicked while the loading overlay is still visible in 5 of 6 failed attempts." },
});
const BROKEN = makeTest({
  id: "t_broken", title: "classes: filters by location", file: "e2e/specs/classes.spec.ts", state: "broken", fail_rate_30d: 0.95,
  prs_blocked_7d: 2, minutes_lost_7d: 40, cause: { label: "selector_changed", evidence: "The filter button lost its label in the last release." },
});
const QUARANTINED = makeTest({
  id: "t_quar", title: "signup: verifies the email code", file: "e2e/specs/signup.spec.ts", state: "quarantined", flags: ["flaky"],
  flake_rate_30d: 0.12, flips_14d: 9, quarantined_since: ago(20 * DAY), ticket_url: "https://github.com/your-team/web/issues/42",
  fix_status: "burn_in", fix_pr_url: "https://github.com/your-team/web/pull/88",
});
const HEALTHY = makeTest({ id: "t_ok", title: "home: shows the hero", file: "e2e/specs/home.spec.ts", state: "healthy", p50_ms: 52_000, p95_ms: 71_000 });

function makeRun(i: number, over: Record<string, unknown> = {}) {
  return {
    run_key: `r_${i}`, repo: WEB, workflow: "E2E (Playwright)", run_id: 9000 + i, run_attempt: 1, branch: i % 2 ? "main" : "feature/cart",
    pr: i % 2 ? null : 300 + i, sha: `abcdef${i}1234567`, event: "pull_request", framework: "playwright", started_at: ago(i * 3_600_000),
    duration_ms: 610_000, passed: 40, failed: i % 3 === 0 ? 1 : 0, flaky: i % 2, skipped: 0, bad_run: false,
    url: `https://github.com/${WEB}/actions/runs/${9000 + i}`, status: i % 3 === 0 ? "failed" : "passed", ...over,
  };
}

const ATTEMPT_FAIL = {
  retry: 0, status: "failed", duration_ms: 15_000,
  error: { message: "locator.click: element is covered by [data-testid=page-loader]", signature: "sig_loader" },
  trace_url: "https://github.com/your-team/web/actions/runs/9001/artifacts", video_url: null, screenshot_url: null,
};
const ATTEMPT_PASS = { retry: 1, status: "passed", duration_ms: 13_000 };

interface Call { method: string; path: string; body: Record<string, unknown> | null }
interface Backend {
  role: string;
  settings: { enabled: boolean; auto_quarantine: boolean; fix_prs: boolean; tickets: string; burn_in: boolean; repos: string[]; ticket_after_days: number };
  tests: TestRow[];
  runs: Record<string, unknown>[];
  empty: boolean;
  calls: Call[];
  recommendations: Record<string, unknown>[];
}

function summary(db: Backend) {
  const counts = { healthy: 0, flaky: 0, broken: 0, quarantined: 0, fixed: 0 } as Record<State, number>;
  if (!db.empty) for (const t of db.tests) counts[t.state] += 1;
  const trend = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * DAY).toISOString().slice(0, 10);
    return db.empty ? { day: d, runs: 0, pass_rate: 0, flake_rate: 0 } : { day: d, runs: 6 + (i % 4), pass_rate: 0.9 + (i % 5) / 100, flake_rate: 0.03 - (i % 3) / 200 };
  });
  return {
    repos: [WEB, MOBILE], counts, prs_blocked_7d: db.empty ? 0 : 6, ci_minutes_lost_7d: db.empty ? 0 : 136, prs_rescued_7d: db.empty ? 0 : 3,
    runs_7d: db.empty ? 0 : 52, pass_rate_7d: db.empty ? 0 : 0.93, flake_rate_7d: db.empty ? 0 : 0.031, trend,
  };
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = {
    role: "admin",
    settings: { enabled: true, auto_quarantine: true, fix_prs: true, tickets: "github", burn_in: false, repos: [], ticket_after_days: 2 },
    tests: [FLAKY, BROKEN, QUARANTINED, HEALTHY].map((t) => ({ ...t })),
    runs: Array.from({ length: 45 }, (_, i) => makeRun(i + 1)),
    empty: false,
    calls: [],
    recommendations: [
      {
        id: "rec_1", repo: WEB, area: "freeze", title: "Freeze a membership for one month", status: "open",
        why: "A bug in this flow was fixed last week with no test, and no E2E test covers the freeze screens.",
        evidence: [
          { kind: "bug_ticket", text: "Freeze shows the wrong end date", url: "https://github.com/your-team/web/issues/51" },
          { kind: "changed_code", text: "src/app/freeze/page.tsx changed in 3 PRs this month" },
        ],
      },
      { id: "rec_2", repo: WEB, area: "account", title: "Update the email preferences", status: "open", why: "A busy page with no test.", evidence: [{ kind: "traffic", text: "About 900 visits a day" }] },
    ],
    ...init,
  };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const p = url.pathname;
    let body: Record<string, unknown> | null = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    db.calls.push({ method, path: p + url.search, body });

    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: db.role });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: WEB, enabled: true, ticket_source: "github" }, { name: MOBILE, enabled: true, ticket_source: "github" }] });

    if (p === "/api/tests/settings") {
      if (method === "PUT") { db.settings = body as Backend["settings"]; }
      return json(route, db.settings);
    }
    if (p === "/api/tests/summary") return json(route, summary(db));
    if (p === "/api/tests/runs") {
      if (db.empty) return json(route, { runs: [], next: null });
      const branch = url.searchParams.get("branch");
      const before = url.searchParams.get("before");
      const limit = Number(url.searchParams.get("limit") || 30);
      const list = db.runs.filter((r) => !branch || r.branch === branch);
      const from = before ? list.findIndex((r) => r.run_key === before) + 1 : 0;
      const pageRuns = list.slice(from, from + limit);
      const next = from + limit < list.length ? (pageRuns[pageRuns.length - 1].run_key as string) : null;
      return json(route, { runs: pageRuns, next });
    }
    const runMatch = p.match(/^\/api\/tests\/runs\/(.+)$/);
    if (runMatch) {
      const run = db.runs.find((r) => r.run_key === decodeURIComponent(runMatch[1])) ?? makeRun(3, { bad_run: false });
      return json(route, {
        run,
        executions: [
          { test_id: FLAKY.id, title: FLAKY.title, file: FLAKY.file, project: "chromium", outcome: "flaky", attempts: [ATTEMPT_FAIL, ATTEMPT_PASS] },
          { test_id: BROKEN.id, title: BROKEN.title, file: BROKEN.file, project: "chromium", outcome: "failed", attempts: [ATTEMPT_FAIL, { ...ATTEMPT_FAIL, retry: 1 }] },
          { test_id: HEALTHY.id, title: HEALTHY.title, file: HEALTHY.file, project: "chromium", outcome: "passed", attempts: [ATTEMPT_PASS] },
        ],
      });
    }
    if (p === "/api/tests/failure-groups") {
      return json(route, { groups: [
        { signature: "sig_loader", message: "locator.click: element is covered by [data-testid=page-loader]", selector: "[data-testid=page-loader]", step: "Pay now", tests: 3, failures_7d: 11, last_seen: ago(3_600_000), test_ids: [FLAKY.id, QUARANTINED.id], cause: "animation_loader" },
        { signature: "sig_filter", message: "expect(locator).toBeVisible() failed: getByRole('button', { name: 'Location' })", tests: 1, failures_7d: 7, last_seen: ago(7_200_000), test_ids: [BROKEN.id], cause: "selector_changed" },
      ] });
    }
    if (p === "/api/tests/coverage") {
      return json(route, {
        areas: [
          { area: "freeze", paths: ["src/app/freeze/**", "src/components/freeze/**"], tests: [], runs_30d: 0, covered: false },
          { area: "checkout", paths: ["src/app/checkout/**"], tests: [{ id: FLAKY.id, title: FLAKY.title }], runs_30d: 120, covered: true },
        ],
        recommendations: db.recommendations,
      });
    }
    const recMatch = p.match(/^\/api\/tests\/recommendations\/([^/]+)\/(accept|dismiss)$/);
    if (recMatch) return json(route, recMatch[2] === "accept" ? { queued: true } : { ok: true });

    if (p === "/api/tests" && method === "GET") {
      if (db.empty) return json(route, { tests: [], next: null });
      const state = url.searchParams.get("state");
      const sort = url.searchParams.get("sort");
      let list = db.tests.filter((t) => !state || t.state === state);
      if (sort === "slowest") list = [...list].sort((a, b) => b.p95_ms - a.p95_ms);
      if (sort === "impact") list = [...list].sort((a, b) => b.prs_blocked_7d - a.prs_blocked_7d);
      return json(route, { tests: list, next: null });
    }
    const action = p.match(/^\/api\/tests\/([^/]+)\/(quarantine|pin|fix)$/);
    if (action && method === "POST") {
      const t = db.tests.find((x) => x.id === decodeURIComponent(action[1]));
      if (!t) return json(route, { error: "No such test." }, 404);
      if (action[2] === "quarantine") {
        if (body?.on && t.state === "broken") return json(route, { error: "Broken tests can't be quarantined." }, 400);
        t.state = body?.on ? "quarantined" : "flaky";
        t.quarantined_since = body?.on ? new Date().toISOString() : null;
        return json(route, { test: t });
      }
      if (action[2] === "pin") { t.never_quarantine = Boolean(body?.never_quarantine); return json(route, { test: t }); }
      return json(route, { queued: true });
    }
    const one = p.match(/^\/api\/tests\/([^/]+)$/);
    if (one && method === "GET") {
      const t = db.tests.find((x) => x.id === decodeURIComponent(one[1]));
      if (!t) return json(route, { error: "No such test." }, 404);
      const history = Array.from({ length: 24 }, (_, i) => {
        const outcome = t.state === "broken" ? (i % 7 === 0 ? "passed" : "failed") : i % 4 === 1 ? "flaky" : i % 9 === 4 ? "failed" : "passed";
        return {
          run_key: `r_${i + 1}`, sha: `abcdef${i}1234567`, branch: i % 2 ? "main" : "feature/cart", pr: i % 2 ? null : 300 + i, at: ago(i * 3_600_000), outcome,
          attempts: outcome === "flaky" ? [ATTEMPT_FAIL, ATTEMPT_PASS] : outcome === "failed" ? [ATTEMPT_FAIL, { ...ATTEMPT_FAIL, retry: 1 }] : [ATTEMPT_PASS],
        };
      });
      return json(route, {
        test: t,
        history,
        events: [
          { at: ago(2 * DAY), from: "healthy", to: t.state === "broken" ? "broken" : "flaky", reason: "Passed and failed on the same commit twice in 14 days.", actor: "Coderhelm" },
        ],
      });
    }
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await expect(page.locator(".animate-toast-in")).toHaveCount(0);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS_DIR, `tests-${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

const callsTo = (db: Backend, method: string, re: RegExp) => db.calls.filter((c) => c.method === method && re.test(c.path));

test("tests: off by default, an admin turns it on and sees the reporter change", async ({ page }) => {
  const db = await mockApi(page, { empty: true, settings: { enabled: false, auto_quarantine: false, fix_prs: false, tickets: "off", burn_in: false, repos: [], ticket_after_days: 2 } });
  await page.goto("/tests");
  await expect(page.getByRole("heading", { name: "Turn on E2E tracking" })).toBeVisible();
  await expect(page.getByRole("region", { name: "playwright.config.ts" })).toContainText('["json", { outputFile: "test-results/results.json" }]');
  await expect(page.getByRole("region", { name: "GitHub Actions step" }).first()).toContainText("if: ${{ !cancelled() }}");
  await shot(page, "empty-off");
  await page.getByRole("button", { name: "Turn on E2E tracking" }).click();
  await expect(page.getByRole("heading", { name: "Waiting for the first E2E run" })).toBeVisible();
  expect(callsTo(db, "PUT", /\/api\/tests\/settings/)[0].body).toMatchObject({ enabled: true });
});

test("tests: a member sees the empty state but can't turn it on, and has no settings tab", async ({ page }) => {
  await mockApi(page, { role: "member", empty: true, settings: { enabled: false, auto_quarantine: false, fix_prs: false, tickets: "off", burn_in: false, repos: [], ticket_after_days: 2 } });
  await page.goto("/tests");
  await expect(page.getByText("Ask an admin on your team to turn it on.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn on E2E tracking" })).toHaveCount(0);
  await expect(page.locator('nav[aria-label="Tests views"]').getByRole("link", { name: "Settings" })).toHaveCount(0);
});

test("tests: needs attention ranks by impact and links to the test", async ({ page }) => {
  await mockApi(page);
  await page.goto("/tests");
  await expect(page.getByRole("link", { name: "Tests", exact: true }).first()).toBeVisible();
  await expect(page.getByText("PRs blocked by tests (7 days)")).toBeVisible();
  await expect(page.getByText("2.3 h")).toBeVisible();
  const list = page.getByRole("list", { name: "Tests that need attention" });
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(list.getByRole("listitem").first()).toContainText("checkout: pays with a saved card");
  await expect(list).toContainText("Animation or loader");
  await expect(list).not.toContainText("home: shows the hero");
  await shot(page, "needs-attention");
  await list.getByRole("link", { name: /checkout: pays with a saved card/ }).click();
  await expect(page).toHaveURL(/\/tests\/test\/?\?id=t_flaky/);
  await expect(page.getByRole("heading", { level: 1, name: /checkout: pays with a saved card/ })).toBeVisible();
});

test("tests: needs attention filters by state and search, kept in the address", async ({ page }) => {
  await mockApi(page);
  await page.goto("/tests");
  const list = page.getByRole("list", { name: "Tests that need attention" });
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await page.getByRole("group", { name: "Show tests" }).getByRole("button", { name: /Broken/ }).click();
  await expect(page).toHaveURL(/state=broken/);
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list).toContainText("classes: filters by location");
  await page.goBack();
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await page.getByRole("searchbox", { name: "Search tests" }).fill("saved card");
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(page).toHaveURL(/q=saved/);
});

test("tests: the repo picker narrows every request", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/tests");
  await expect(page.getByRole("list", { name: "Tests that need attention" })).toBeVisible();
  await page.getByRole("button", { name: /Repository: All repos/ }).click();
  await page.getByRole("option", { name: MOBILE }).click();
  await expect(page).toHaveURL(/repo=your-team%2Fmobile-app/);
  await expect.poll(() => callsTo(db, "GET", /\/api\/tests\/summary\?repo=your-team%2Fmobile-app/).length).toBeGreaterThan(0);
  await expect.poll(() => callsTo(db, "GET", /\/api\/tests\?repo=your-team%2Fmobile-app&sort=impact/).length).toBeGreaterThan(0);
});

test("tests: a flaky test's history, quarantine, never-quarantine and fix", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/tests/test?id=t_flaky");
  await expect(page.getByRole("heading", { level: 1, name: "checkout: pays with a saved card (chromium)" })).toBeVisible();
  await expect(page.getByText("Likely cause: Animation or loader")).toBeVisible();
  await expect(page.getByRole("img", { name: /Last 24 runs, oldest first/ })).toBeVisible();
  const runs = page.getByRole("list", { name: "Recent runs of this test" });
  await expect(runs.getByRole("listitem")).toHaveCount(24);
  await expect(runs.getByRole("img", { name: "Attempt 1: Failed, Attempt 2: Passed" }).first()).toBeVisible();
  await expect(runs.getByRole("link", { name: "Trace" }).first()).toHaveAttribute("href", /actions\/runs\/9001/);
  await expect(page.getByText("Passed and failed on the same commit twice in 14 days.")).toBeVisible();
  await shot(page, "test-history");

  await page.getByRole("button", { name: "Quarantine", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Quarantine this test?" })).toBeVisible();
  await page.getByRole("button", { name: "Quarantine", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Release from quarantine" })).toBeVisible();
  expect(callsTo(db, "POST", /\/api\/tests\/t_flaky\/quarantine/)[0].body).toMatchObject({ on: true });

  await page.getByRole("switch", { name: "Never quarantine this test" }).click();
  await expect(page.getByRole("switch", { name: "Never quarantine this test" })).toHaveAttribute("aria-checked", "true");
  expect(callsTo(db, "POST", /\/api\/tests\/t_flaky\/pin/)[0].body).toEqual({ never_quarantine: true });
});

test("tests: asking for a fix confirms first and shows the fix status", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/tests/test?id=t_flaky");
  await page.getByRole("button", { name: "Fix this test" }).click();
  await expect(page.getByText(/opens a PR only after the test passes 20 runs in a row/)).toBeVisible();
  await page.getByRole("button", { name: "Fix it" }).click();
  await expect(page.getByText("Reproducing the failure")).toBeVisible();
  await expect(page.getByRole("button", { name: "Fix this test" })).toHaveCount(0);
  expect(callsTo(db, "POST", /\/api\/tests\/t_flaky\/fix/)).toHaveLength(1);
});

test("tests: a broken test can't be quarantined", async ({ page }) => {
  await mockApi(page);
  await page.goto("/tests/test?id=t_broken");
  await expect(page.getByRole("heading", { level: 1, name: /classes: filters by location/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Quarantine", exact: true })).toHaveCount(0);
  await expect(page.getByText(/Broken tests can't be quarantined/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Fix this test" })).toHaveCount(0);
});

test("tests: runs, a branch filter, older runs and a run's tests", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/tests?view=runs");
  const list = page.getByRole("list", { name: "E2E runs" });
  await expect(list.getByRole("listitem")).toHaveCount(30);
  await expect(list.getByRole("listitem").first()).toContainText("passed on retry");
  await shot(page, "runs");
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(45);
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  expect(callsTo(db, "GET", /\/api\/tests\/runs\?.*before=r_30/)).toHaveLength(1);

  await page.getByRole("searchbox", { name: "Branch" }).fill("main");
  await expect.poll(() => callsTo(db, "GET", /\/api\/tests\/runs\?.*branch=main/).length).toBeGreaterThan(0);
  await expect(page).toHaveURL(/branch=main/);
  await expect(list.getByRole("listitem").first()).toContainText("main");

  await list.getByRole("link", { name: "E2E (Playwright)" }).first().click();
  await expect(page).toHaveURL(/\/tests\/run\/?\?key=r_/);
  const tests = page.getByRole("list", { name: "Tests in this run" });
  await expect(tests.getByRole("listitem")).toHaveCount(2);
  await expect(tests.getByRole("listitem").first()).toContainText("classes: filters by location");
  await expect(tests).toContainText("element is covered by [data-testid=page-loader]");
  await shot(page, "run-detail");
  await page.getByRole("button", { name: "All tests" }).click();
  await expect(tests.getByRole("listitem")).toHaveCount(3);
});

test("tests: a bad run says it isn't counted against the tests", async ({ page }) => {
  await mockApi(page, { runs: [makeRun(1, { bad_run: true, failed: 38, passed: 2, status: "failed" })] });
  await page.goto("/tests/run?key=r_1");
  await expect(page.getByText("This run doesn't count against any test")).toBeVisible();
});

test("tests: failure groups name the tests they hit", async ({ page }) => {
  await mockApi(page);
  await page.goto("/tests?view=groups");
  const groups = page.getByRole("list", { name: "Failure groups" });
  await expect(groups.getByRole("listitem").filter({ hasText: "page-loader" }).first()).toContainText("11 failures this week");
  await expect(groups.getByRole("link", { name: "checkout: pays with a saved card" })).toBeVisible();
  await expect(groups).toContainText("Step: Pay now");
  await shot(page, "failure-groups");
});

test("tests: trends draw the pass and flaky rates", async ({ page }) => {
  await mockApi(page);
  await page.goto("/tests?view=trends");
  await expect(page.getByRole("heading", { name: "Pass rate and flaky rate" })).toBeVisible();
  await expect(page.locator(".recharts-line")).toHaveCount(2);
  await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
  await expect(page.getByText("93%")).toBeVisible();
  await shot(page, "trends");
});

test("tests: slowest tests come first", async ({ page }) => {
  await mockApi(page);
  await page.goto("/tests?view=slowest");
  const list = page.getByRole("list", { name: "Slowest tests" });
  await expect(list.getByRole("listitem").first()).toContainText("home: shows the hero");
  await expect(list.getByRole("listitem").first()).toContainText("71.0 s");
  await shot(page, "slowest");
});

test("tests: the quarantine ledger and releasing a test", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/tests?view=quarantine");
  const list = page.getByRole("list", { name: "Quarantined tests" });
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByText("1 test has been quarantined for over 2 days.")).toBeVisible();
  await expect(page.getByText(/When only quarantined tests fail, Coderhelm treats the run as passing/)).toBeVisible();
  await page.getByText("Make quarantined tests stop failing your build").click();
  await expect(page.getByText(/--grep-invert "\$QUARANTINED"/)).toBeVisible();
  await expect(page.getByText(/audience=coderhelm/)).toBeVisible();
  await expect(list.getByRole("link", { name: "Ticket" })).toHaveAttribute("href", /issues\/42/);
  await expect(list).toContainText("Proving the fix (20 runs)");
  await shot(page, "quarantine");
  await list.getByRole("button", { name: "Release from quarantine" }).click();
  await page.getByRole("button", { name: "Release", exact: true }).click();
  await expect(page.getByText("No test is quarantined.")).toBeVisible();
  expect(callsTo(db, "POST", /\/api\/tests\/t_quar\/quarantine/)[0].body).toMatchObject({ on: false });
});

test("tests: coverage shows gaps, and a suggestion can be accepted or dismissed", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/tests?view=coverage");
  const recs = page.getByRole("list", { name: "Suggested tests" });
  await expect(recs.getByRole("listitem").filter({ hasText: "Freeze a membership" })).toContainText("Bug ticket:");
  await expect(recs.getByRole("link", { name: "Freeze shows the wrong end date" })).toHaveAttribute("href", /issues\/51/);
  await expect(page.getByRole("list", { name: "Areas without a test" })).toContainText("freeze");
  await expect(page.getByRole("list", { name: "Areas without a test" })).not.toContainText("checkout");
  await page.getByRole("button", { name: "Show 1 covered area" }).click();
  await expect(page.getByRole("list", { name: "Areas without a test" })).toContainText("checkout");
  await shot(page, "coverage");

  const first = recs.getByRole("listitem").filter({ hasText: "Freeze a membership" });
  await first.getByRole("button", { name: "Write this test" }).click();
  await expect(page.getByText(/passes 10 runs in a row/)).toBeVisible();
  await page.getByRole("button", { name: "Write the test" }).click();
  await expect(first).toContainText("Writing the test");
  expect(callsTo(db, "POST", /\/recommendations\/rec_1\/accept/)).toHaveLength(1);

  await recs.getByRole("listitem").filter({ hasText: "email preferences" }).getByRole("button", { name: "Dismiss" }).click();
  await expect(recs.locator(":scope > li")).toHaveCount(1);
  expect(callsTo(db, "POST", /\/recommendations\/rec_2\/dismiss/)).toHaveLength(1);
});

test("tests: settings save every choice", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/tests?view=settings");
  await expect(page.getByRole("switch", { name: "Track E2E tests" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Every repository is tracked.")).toBeVisible();
  await shot(page, "settings");
  await page.getByRole("switch", { name: "Check new tests before merge" }).click();
  await page.getByRole("switch", { name: "Quarantine flaky tests" }).click();
  await page.getByLabel("Tickets for long quarantines").selectOption("jira");
  const days = page.getByRole("spinbutton", { name: "Days before a ticket" });
  await expect(days).toHaveValue("2");
  await expect(page.getByText("File a ticket after a test has been quarantined this many days.", { exact: false })).toBeVisible();
  await days.fill("31");
  await expect(page.getByText("Pick between 1 and 30 days before a ticket.")).toBeVisible();
  await days.fill("5");
  // "Only these" with nothing ticked is never saved as "every repository".
  await expect(page.getByRole("checkbox", { name: WEB })).toHaveCount(0);
  await page.getByRole("radio", { name: "Only the repositories I tick" }).check();
  await expect(page.getByRole("checkbox", { name: WEB })).not.toBeChecked();
  await expect(page.getByTestId("tracked-repos")).toHaveText("Tick at least one repository.");
  const bar = page.getByRole("region", { name: "Save changes" });
  await bar.getByRole("button", { name: "Save changes" }).click();
  await expect(bar).toContainText("Tick at least one repository, or choose every repository.");
  expect(callsTo(db, "PUT", /\/api\/tests\/settings/)).toHaveLength(0);
  await page.getByRole("checkbox", { name: WEB }).check();
  await expect(page.getByTestId("tracked-repos")).toContainText("1 of");
  await bar.getByRole("button", { name: "Save changes" }).click();
  await expect(bar).toHaveCount(0);
  expect(callsTo(db, "PUT", /\/api\/tests\/settings/)[0].body).toEqual({
    enabled: true, auto_quarantine: false, fix_prs: true, tickets: "jira", burn_in: true, repos: [WEB], ticket_after_days: 5,
  });
  await expect(page.getByRole("heading", { name: "Make quarantined tests stop failing your build" })).toBeVisible();
});

test("tests: a failed load says so and retries", async ({ page }) => {
  await mockApi(page);
  let fail = true;
  await page.route((url) => url.pathname === "/api/tests/summary", async (route) => {
    if (fail) return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Something went wrong on our side." }) });
    return route.fallback();
  });
  await page.goto("/tests");
  await expect(page.getByText("We couldn't load your tests")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("list", { name: "Tests that need attention" })).toBeVisible();
});
