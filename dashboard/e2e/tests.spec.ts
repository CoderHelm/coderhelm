import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { mockWideApi } from "./wide-data";
import { pickOption } from "./select";

// The Tests area against a mocked backend. Nothing reaches a real server.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const WEB = "your-team/web";
const MOBILE = "your-team/mobile-app";
const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

type State = "healthy" | "flaky" | "broken" | "quarantined" | "fixed";

interface TestRow {
  id: string; repo: string; framework: string; file: string; title: string; project?: string | null; state: State; flags: string[];
  owner?: string | null; cause?: { label: string; evidence: string; depends_on?: string | null; independent?: string | null; out_of_date?: string | null } | null; runs_30d: number; fail_rate_30d: number; flake_rate_30d: number;
  flips_14d: number; prs_blocked_7d: number; minutes_lost_7d: number; p50_ms: number; p95_ms: number; last_seen: string;
  quarantined_since?: string | null; never_quarantine: boolean; ticket_url?: string | null; fix_pr_url?: string | null; fix_status?: string | null;
  // Sent by servers that say where a quarantined test stands; absent before.
  quarantine?: Standing | null; unstable?: string | null; removed?: boolean;
  release?: { at: string; reason: string; passes: number; sources: number; hours: number } | null;
  removal?: { status: string; by: string; at: string; pr?: { url: string; state: string; by?: string | null } | null; reason?: string | null; approved_by?: string[] } | null;
}

interface Standing {
  state: string; headline: string; link?: { kind: string; label: string; target: string } | null; attempt?: string | null;
  attempt_link?: { kind: string; label: string; target: string } | null; why: string; hold: string; actions: string[];
  progress: { passes: number; needed: number; sources: number; sources_needed: number; minutes: number; minutes_needed: number; last_failure_at?: string | null; not_before?: string | null; ready: boolean; line: string };
}
interface Budget { repo: string; on: boolean; cap: number; used: number; resumes_at: string }

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
// ── Quarantine: where each test stands ────────────────────────────────────

const CAP_REASON = "Each automatic fix is a full coding run, so the limit bounds what they cost. A fix you ask for is never counted.";
const CAP_LINE = "Automatic fixes are at this week's limit of 2 for this repository. They resume on Monday 16 November.";
const RESUMES = "2026-11-16T00:00:00+00:00";

function standing(over: Partial<Standing> = {}): Standing {
  return {
    state: "idle", headline: "Nothing in flight", why: "", hold: "eligible", actions: ["fix", "remove", "release"],
    progress: {
      passes: 0, needed: 20, sources: 0, sources_needed: 2, minutes: 0, minutes_needed: 120, ready: false,
      line: "No pass yet since it last failed on 9 November 2026; 20 in a row are needed",
    },
    ...over,
  };
}

const progress = (passes: number, sources: number, line: string): Standing["progress"] => ({
  passes, needed: 20, sources, sources_needed: 2, minutes: passes * 12, minutes_needed: 120, ready: false, line,
});

function quarantined(id: string, title: string, days: number, over: Partial<TestRow> = {}): TestRow {
  return makeTest({
    id, title, file: `e2e/specs/${id.replace("q_", "")}.spec.ts`, state: "quarantined", flags: ["flaky"], flake_rate_30d: 0.1, flips_14d: 4,
    quarantined_since: ago(days * DAY), ...over,
  });
}

/** One quarantined test in each state a row can be in. */
const Q_IDLE = quarantined("q_idle", "basket: keeps items after sign-in", 24, { quarantine: standing({ why: CAP_LINE }) });
const Q_FIX_PR = quarantined("q_fix_pr", "search: filters by price", 9, {
  fix_status: "opened", fix_pr_url: "https://github.com/your-team/web/pull/131",
  quarantine: standing({
    state: "fix_pr", headline: "Fix pull request open, checks passing", hold: "in_flight", actions: ["release"],
    link: { kind: "pr", label: "Fix PR", target: "https://github.com/your-team/web/pull/131" },
  }),
});
const Q_RUNNING = quarantined("q_running", "profile: uploads an avatar", 3, {
  fix_status: "fixing",
  quarantine: standing({
    state: "fix_running", headline: "Coderhelm is writing a fix", hold: "in_flight", actions: ["release"],
    link: { kind: "run", label: "Open the run", target: "01JQRUNFIX00000000000000" },
  }),
});
const Q_FAILED = quarantined("q_failed", "orders: cancels an order", 21, {
  fix_status: "failed", fix_pr_url: "https://github.com/your-team/web/pull/118",
  quarantine: standing({
    state: "fix_failed", headline: "The last fix did not hold", hold: "cooling_off",
    attempt: "The fix pull request was closed without merging by sam-reviewer on 4 November 2026.",
    attempt_link: { kind: "pr", label: "The fix PR", target: "https://github.com/your-team/web/pull/118" },
    why: "The last fix did not hold. Coderhelm tries again by itself after 15 November 2026.",
  }),
});
const Q_MERGED = quarantined("q_merged", "login: remembers the device", 6, {
  fix_status: "merged", fix_pr_url: "https://github.com/your-team/web/pull/140",
  quarantine: standing({
    state: "fix_merged", headline: "Fix merged, proving itself: 12 of 20 passes needed, across 3 pull requests and branches", hold: "in_flight",
    actions: ["release"], link: { kind: "pr", label: "Fix PR", target: "https://github.com/your-team/web/pull/140" },
    progress: progress(12, 3, "12 of 20 passes needed, across 3 pull requests and branches"),
  }),
});
const Q_PASSING = quarantined("q_passing", "home: opens the menu", 1, {
  cause: {
    label: "environment", evidence: "The failure is deterministic and tied to the preview setup: passed on retry in 0 of the last 30 runs.",
    out_of_date: "Out of date: this was worked out while the test was failing. Since its last failure on 12 November 2026 it has passed 14 runs in a row on 4 pull requests and branches, with no retry. The test's file has not changed since then, so what changed is outside the test: the environment it runs against or the application.",
  },
  quarantine: standing({
    hold: "passing", why: "It is passing again and leaves quarantine by itself: 14 of 20 passes needed, across 4 pull requests and branches.",
    progress: progress(14, 4, "14 of 20 passes needed, across 4 pull requests and branches"),
  }),
});
const Q_REMOVAL = quarantined("q_removal", "reports: exports a spreadsheet", 40, {
  removal: { status: "opened", by: "coderhelm", at: ago(DAY), pr: { url: "https://github.com/your-team/web/pull/152", state: "open" } },
  quarantine: standing({
    state: "removal_pr", headline: "Removal pull request open, checks passing: it is your team's to approve and merge", hold: "removal",
    actions: ["release"], link: { kind: "pr", label: "Removal PR", target: "https://github.com/your-team/web/pull/152" },
  }),
});
const Q_UNSTABLE = quarantined("q_unstable", "cart: applies a voucher", 2, {
  unstable: "Unstable: it left quarantine by itself and was quarantined again 2 times in 30 days. It now also needs 7 days without a failure before it leaves by itself.",
  quarantine: standing({ why: "Next in line for an automatic fix: Coderhelm starts it on its next look at this repository." }),
});
const QUARANTINE_ROWS = [Q_IDLE, Q_FIX_PR, Q_RUNNING, Q_FAILED, Q_MERGED, Q_PASSING, Q_REMOVAL, Q_UNSTABLE];
const SPENT: Budget = { repo: WEB, on: true, cap: 2, used: 2, resumes_at: RESUMES };

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
  settings: { enabled: boolean; auto_quarantine: boolean; fix_prs: boolean; tickets: string; burn_in: boolean; repos: string[]; ticket_after_days: number; report_sources?: { repo: string; location: string; target_url: string }[]; auto_fixes_per_week?: number };
  /** This week's automatic fixes per repository; servers from before send none. */
  autoFixes?: Budget[];
  /** A test's runs, newest first, in place of the generated ones. */
  history?: Record<string, Record<string, unknown>[]>;
  /** What the server refuses a fix or a removal with, by test id. */
  refuse?: Record<string, string>;
  tests: TestRow[];
  runs: Record<string, unknown>[];
  empty: boolean;
  calls: Call[];
  recommendations: Record<string, unknown>[];
  setup: SetupRow[];
}


// ── CI setup ──────────────────────────────────────────────────────────────

const API = "your-team/api";
const DOCS = "your-team/docs";
const WORKFLOW = ".github/workflows/e2e.yml";
type SetupRow = Record<string, unknown> & { repo: string; status: string; pr: Record<string, unknown> | null; polls?: number };

const UPLOAD_YAML = `- name: Upload E2E results for Coderhelm
  if: \${{ !cancelled() }}
  uses: actions/upload-artifact@v4
  with:
    name: coderhelm-e2e-results
    path: |
      playwright-report/
      test-results/`;
const JEST_UPLOAD = UPLOAD_YAML.replace("playwright-report/\n      test-results/", "junit.xml\n      reports/");

function setupRow(repo: string, over: Partial<SetupRow> = {}): SetupRow {
  return {
    repo, default_branch: "main", status: "needs_setup", runner: "playwright",
    runners: ["playwright", "jest", "vitest", "cypress", "junit"],
    workflow: { path: WORKFLOW, job_id: "e2e", job_name: "Browser tests", step_name: "Run E2E tests", test_command: "npx playwright test" },
    steps: {
      upload: { state: "missing", detail: "Not found in the workflow.", paths: [] },
      reporter: { state: "done", detail: "Writes a report Coderhelm reads.", file: "playwright.config.ts" },
      quarantine: { state: "missing", detail: "Not found in the workflow." },
    },
    results: { last_at: null, run_url: null, tests: 0, empty_runs: 0 },
    quarantine_fetch: null, cause: null, pr: null,
    can_auto: { upload: true, quarantine: true, repair: false, why: null },
    snippets: {
      upload: UPLOAD_YAML,
      quarantine: "- name: Get quarantined tests from Coderhelm\n  id: coderhelm_quarantine\n  run: |\n    echo grep",
      reporter: { file: "playwright.config.ts", code: 'reporter: [["html"], ["json", { outputFile: "test-results/results.json" }]],' },
      by_runner: {
        playwright: { upload: UPLOAD_YAML, reporter: { file: "playwright.config.ts", code: 'reporter: [["html"]],' } },
        jest: { upload: JEST_UPLOAD, reporter: { file: "jest.config.js", code: 'reporters: ["default", ["jest-junit", { outputDirectory: "test-results" }]],' } },
      },
    },
    checked_at: ago(60_000), error: null, ...over,
  };
}

const SET_UP = (repo: string) => setupRow(repo, {
  status: "set_up",
  steps: {
    upload: { state: "done", detail: "In the workflow on the default branch.", paths: ["playwright-report/"] },
    reporter: { state: "done", detail: "Writes a report Coderhelm reads.", file: "playwright.config.ts" },
    quarantine: { state: "done", detail: "In the workflow on the default branch." },
  },
  results: { last_at: ago(2 * 3_600_000), run_url: `https://github.com/${repo}/actions/runs/1`, tests: 128, empty_runs: 0 },
  quarantine_fetch: { last_at: ago(2 * 3_600_000), run_url: null },
  can_auto: { upload: false, quarantine: false, repair: false, why: null },
});

const PARTIAL = setupRow(API, {
  status: "waiting",
  steps: {
    upload: { state: "done", detail: "In the workflow on the default branch.", paths: ["test-results/"] },
    reporter: { state: "missing", detail: "No reporter that writes a results file.", file: "playwright.config.ts" },
    quarantine: { state: "missing", detail: "Not found in the workflow." },
  },
  can_auto: { upload: false, quarantine: true, repair: false, why: null },
});

const NOTHING = setupRow(API, {
  status: "nothing_received",
  steps: {
    upload: { state: "partial", detail: "Found, but it uploads other files than the results.", paths: ["coverage/"] },
    reporter: { state: "done", detail: "Writes a report Coderhelm reads.", file: "playwright.config.ts" },
    quarantine: { state: "missing", detail: "Not found in the workflow." },
  },
  results: { last_at: null, run_url: null, tests: 0, empty_runs: 3 },
  cause: { text: "The upload step keeps coverage/ but the results are written elsewhere. The artifact path doesn't match.", fixable: true, last_run_url: `https://github.com/${API}/actions/runs/77` },
  can_auto: { upload: false, quarantine: true, repair: true, why: null },
});

const NO_TESTS = setupRow(DOCS, { status: "no_tests", workflow: null, runner: null });

const DIFF = `--- a/${WORKFLOW}
+++ b/${WORKFLOW}
@@ -20,6 +20,16 @@
       - name: Run E2E tests
         run: npx playwright test
+      - name: Upload E2E results for Coderhelm
+        if: \${{ !cancelled() }}
+        uses: actions/upload-artifact@v4
       # Keep the HTML report for people.`;

/** The setup PR moves along each time the page reads it, like the worker would. */
function advance(row: SetupRow) {
  const pr = row.pr;
  if (!pr) return;
  row.polls = (row.polls ?? 0) + 1;
  const order = ["queued", "reading", "opening", "open"];
  const at = order.indexOf(pr.status as string);
  if (at >= 0 && at < order.length - 1) pr.status = order[at + 1];
  if (pr.status === "open") Object.assign(pr, { number: 512, url: `https://github.com/${row.repo}/pull/512`, ci: "pending" });
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
    setup: [setupRow(WEB), SET_UP(MOBILE), NO_TESTS],
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
    if (p === "/api/tests/setup" && method === "GET") {
      const only = url.searchParams.get("repo");
      for (const r of db.setup) advance(r);
      return json(route, { repos: db.setup.filter((r) => !only || r.repo === only), github: true });
    }
    if (p === "/api/tests/setup/preview" && method === "POST") {
      return json(route, {
        repo: body?.repo, path: WORKFLOW, branch: "coderhelm/e2e-results-setup", base: "main",
        title: body?.repair ? "Fix the E2E results upload for Coderhelm" : "Send E2E results to Coderhelm and skip quarantined tests",
        body: "## Summary", added: ["upload"], notes: ["Uploads playwright-report/, test-results/ after the test step, also when tests fail."], diff: DIFF,
      });
    }
    if (p === "/api/tests/setup/pr" && method === "POST") {
      const row = db.setup.find((r) => r.repo === body?.repo);
      if (!row) return json(route, { error: "No such repo." }, 404);
      row.pr = { status: "queued", kind: body?.repair ? "repair" : "setup", quarantine: !!body?.quarantine, workflow_path: WORKFLOW, actor: "admin@example.com", created_at: ago(0), updated_at: ago(0) };
      row.status = "in_progress";
      return json(route, { pr: row.pr });
    }
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
      return json(route, db.autoFixes ? { tests: list, next: null, auto_fixes: db.autoFixes, auto_fixes_reason: CAP_REASON } : { tests: list, next: null });
    }
    const action = p.match(/^\/api\/tests\/([^/]+)\/(quarantine|pin|fix|remove)$/);
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
      if (db.refuse?.[t.id]) return json(route, { error: db.refuse[t.id] }, 400);
      // Servers that say where a quarantined test stands answer with the row as it now is.
      if (!t.quarantine) return json(route, { queued: true });
      if (action[2] === "fix") {
        t.fix_status = "reproducing";
        t.quarantine = standing({ state: "fix_running", headline: "Reproducing the failure with 20 repeat runs", hold: "in_flight", actions: ["release"] });
      } else {
        t.removal = { status: "running", by: "admin@example.com", at: new Date().toISOString() };
        t.quarantine = standing({ state: "removal_running", headline: "Coderhelm is writing a pull request that removes this test", hold: "removal", actions: ["release"] });
      }
      return json(route, { queued: true, test: t });
    }
    const one = p.match(/^\/api\/tests\/([^/]+)$/);
    if (one && method === "GET") {
      const t = db.tests.find((x) => x.id === decodeURIComponent(one[1]));
      if (!t) return json(route, { error: "No such test." }, 404);
      const history = db.history?.[t.id] ?? Array.from({ length: 24 }, (_, i) => {
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
          ...(t.release ? [{ at: t.release.at, from: "quarantined", to: "healthy", reason: t.release.reason, actor: "coderhelm" }] : []),
          { at: ago(2 * DAY), from: "healthy", to: t.state === "broken" ? "broken" : "flaky", reason: "Passed and failed on the same commit twice in 14 days.", actor: "Coderhelm" },
        ],
        ...(db.autoFixes ? { auto_fixes: db.autoFixes.find((b) => b.repo === t.repo) ?? null, auto_fixes_reason: CAP_REASON } : {}),
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

test("tests: off by default, an admin turns it on and sets up each repo", async ({ page }) => {
  const db = await mockApi(page, { empty: true, settings: { enabled: false, auto_quarantine: false, fix_prs: false, tickets: "off", burn_in: false, repos: [], ticket_after_days: 2 } });
  await page.goto("/tests");
  await expect(page.getByRole("heading", { name: "Turn on E2E tracking" })).toBeVisible();
  // No wall of YAML before anything is on.
  await expect(page.locator("[data-code-block]:visible")).toHaveCount(0);
  await shot(page, "empty-off");
  await page.getByRole("button", { name: "Turn on E2E tracking" }).click();
  await expect(page.getByRole("heading", { name: "Waiting for the first E2E run" })).toBeVisible();
  expect(callsTo(db, "PUT", /\/api\/tests\/settings/)[0].body).toMatchObject({ enabled: true });
  await expect(page.getByRole("heading", { name: "Set up each repository" })).toBeVisible();
  await expect(page.getByTestId("ci-setup-repo").filter({ hasText: WEB }).getByRole("button", { name: "Create setup PR" })).toBeVisible();
  await shot(page, "empty-on");
});

test("tests: a member sees the empty state but can't turn it on, and has no settings tab", async ({ page }) => {
  await mockApi(page, { role: "member", empty: true, settings: { enabled: false, auto_quarantine: false, fix_prs: false, tickets: "off", burn_in: false, repos: [], ticket_after_days: 2 } });
  await page.goto("/tests");
  await expect(page.getByText("Ask an admin on your team to turn it on.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn on E2E tracking" })).toHaveCount(0);
  await expect(page.locator('nav[aria-label="Tests views"]').getByRole("link", { name: "Settings" })).toHaveCount(0);
  await expect(page.getByTestId("tests-settings-link")).toHaveCount(0);
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
  // One line per run, ten at first; errors and links open per row.
  await expect(runs.getByRole("listitem")).toHaveCount(10);
  await expect(runs.getByTestId("test-error")).toHaveCount(0);
  await page.getByRole("button", { name: "Show all 24 runs" }).click();
  await expect(runs.getByRole("listitem")).toHaveCount(24);
  await expect(runs.getByRole("img", { name: "Attempt 1: Failed, Attempt 2: Passed" }).first()).toBeVisible();
  const withLinks = runs.getByTestId("history-row").filter({ has: page.getByRole("img", { name: "Attempt 1: Failed, Attempt 2: Passed" }) }).first();
  await withLinks.getByRole("button", { name: /Error|Details/ }).click();
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
  // Zero counts are left out: a clean run doesn't say "0 failed · 0 passed on retry".
  await expect(list).not.toContainText(/\b0 failed/);
  await expect(list).not.toContainText(/\b0 passed on retry/);
  await expect(list.getByRole("listitem").filter({ hasNotText: /failed|retry/ }).first()).toContainText("40 passed");
  // Eight views: on a phone they are one select, not a row cut off at the edge.
  await page.setViewportSize({ width: 390, height: 800 });
  const views = page.getByRole("navigation", { name: "Tests views" });
  await expect(views.getByRole("combobox", { name: "Tests views" })).toBeVisible();
  await expect(views.getByRole("link", { name: "Runs" })).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(views.getByRole("combobox")).toBeHidden();
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
  await expect(page.getByText(/Setup adds that step for you/)).toBeVisible();
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
  await pickOption(page.getByLabel("Tickets for long quarantines"), "jira");
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
    enabled: true, auto_quarantine: false, fix_prs: true, tickets: "jira", burn_in: true, repos: [WEB], ticket_after_days: 5, report_sources: [],
  });
  await expect(page.getByRole("heading", { name: "CI setup" })).toBeVisible();
});

test("tests: each repository says where its test reports are stored", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/tests?view=settings");
  const reports = page.getByRole("list", { name: "Test report locations" });
  await expect(reports.getByRole("listitem")).toHaveCount(2);
  const web = page.getByTestId(`report-source-${WEB.replace(/[^a-zA-Z0-9]+/g, "-")}`);
  const location = web.getByLabel("Where test reports are stored");
  await location.fill("s3://test-reports/web/latest/");
  await expect(web.getByRole("alert")).toContainText("needs {run_id}");
  const bar = page.getByRole("region", { name: "Save changes" });
  await bar.getByRole("button", { name: "Save changes" }).click();
  await expect(bar).toContainText("needs {run_id}");
  expect(callsTo(db, "PUT", /\/api\/tests\/settings/)).toHaveLength(0);
  await location.fill("s3://test-reports/web/{run_id}/{attempt}/");
  await expect(web.getByRole("alert")).toHaveCount(0);
  await expect(web.getByText("Unsaved")).toBeVisible();
  // The role's read access is shown for the bucket and folder entered.
  await web.getByText("Read access for the AWS role").click();
  const statement = web.getByTestId("report-read-statement");
  await expect(statement).toContainText("arn:aws:s3:::test-reports/web/*");
  await expect(statement).toContainText("s3:GetObject");
  await web.getByLabel("Test address (optional)").fill("staging.example.com");
  await expect(web.getByRole("alert")).toContainText("Enter the address the tests run against");
  await web.getByLabel("Test address (optional)").fill("https://pr-{pr}.preview.example.com");
  await shot(page, "settings-report-sources");
  await bar.getByRole("button", { name: "Save changes" }).click();
  await expect(bar).toHaveCount(0);
  expect(callsTo(db, "PUT", /\/api\/tests\/settings/)[0].body).toMatchObject({
    report_sources: [{ repo: WEB, location: "s3://test-reports/web/{run_id}/{attempt}/", target_url: "https://pr-{pr}.preview.example.com" }],
  });
  // Clearing both fields drops the repository's entry.
  await location.fill("");
  await web.getByLabel("Test address (optional)").fill("");
  await bar.getByRole("button", { name: "Save changes" }).click();
  await expect(bar).toHaveCount(0);
  expect(callsTo(db, "PUT", /\/api\/tests\/settings/)[1].body).toMatchObject({ report_sources: [] });
  // CI artifacts need no path and no AWS access.
  await location.fill("ci");
  await expect(web.getByText("Read access for the AWS role")).toHaveCount(0);
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

// ── CI setup ──────────────────────────────────────────────────────────────

const card = (page: Page, repo: string) => page.getByTestId("ci-setup-repo").filter({ has: page.getByRole("heading", { name: repo, exact: true }) });
const step = (page: Page, repo: string, id: string) => card(page, repo).locator(`[data-testid="setup-step"][data-step="${id}"]`);

test("setup: a checklist per repo shows none, partial and done from real state", async ({ page }) => {
  await mockApi(page, { setup: [setupRow(WEB), PARTIAL, SET_UP(MOBILE), NO_TESTS] });
  await page.goto("/tests?view=setup");
  await expect(page.getByTestId("ci-setup-summary")).toContainText("1 of 3 repositories send results.");
  // Order: what needs doing first, finished last, nothing-to-do apart.
  await expect(page.getByTestId("ci-setup-repo")).toHaveCount(3);
  await expect(page.getByTestId("ci-setup-repo").first()).toHaveAttribute("data-status", "needs_setup");

  // None: one primary action, its steps not found, the manual path collapsed.
  await expect(card(page, WEB).getByRole("button", { name: "Create setup PR" })).toBeVisible();
  await expect(card(page, WEB).getByText("Not set up")).toBeVisible();
  await expect(step(page, WEB, "upload")).toHaveAttribute("data-state", "missing");
  await expect(step(page, WEB, "results")).toContainText("Nothing received yet");
  await expect(card(page, WEB).locator("[data-code-block]:visible")).toHaveCount(0);

  // Partial: the step is in, the reporter isn't, and it waits for a run.
  await expect(card(page, API).getByText("Waiting for a run")).toBeVisible();
  await expect(step(page, API, "upload")).toHaveAttribute("data-state", "done");
  await expect(step(page, API, "reporter")).toHaveAttribute("data-state", "missing");
  await expect(card(page, API).getByRole("button", { name: "Create setup PR" })).toHaveCount(0);

  // Done: green, collapsed to one line each, with what really arrived.
  await expect(card(page, MOBILE).getByTestId("ci-setup-done")).toContainText("last upload 2 h ago, 128 tests read");
  await expect(step(page, MOBILE, "quarantine")).toContainText("the last run fetched the list 2 h ago");
  await expect(card(page, MOBILE).getByText("Do it myself")).toHaveCount(0);
  await expect(card(page, MOBILE).getByRole("button", { name: "Create setup PR" })).toHaveCount(0);

  // Nothing to do.
  await expect(page.getByTestId("ci-setup-no-tests")).toHaveText(DOCS);
  await shot(page, "setup");
});

test("setup: Create setup PR previews the diff, shows progress, then the PR and its checks", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/tests?view=setup");
  const web = card(page, WEB);
  await expect(web.getByLabel("Also skip quarantined tests in this build")).toBeChecked();
  await web.getByRole("button", { name: "Create setup PR" }).click();
  const dialog = page.getByRole("dialog", { name: "Create setup PR" });
  await expect(dialog.getByTestId("ci-setup-preview")).toContainText("Send E2E results to Coderhelm and skip quarantined tests");
  await expect(dialog.getByRole("region", { name: `Change to ${WORKFLOW}` })).toContainText("Upload E2E results for Coderhelm");
  await expect(dialog).toContainText("From coderhelm/e2e-results-setup into main");
  expect(callsTo(db, "POST", /\/api\/tests\/setup\/preview/)[0].body).toEqual({ repo: WEB, quarantine: true });
  await shot(page, "setup-preview");
  // Nothing is opened until confirmed.
  expect(callsTo(db, "POST", /\/api\/tests\/setup\/pr$/)).toHaveLength(0);
  await dialog.getByRole("button", { name: "Create PR" }).click();
  await expect(dialog).toHaveCount(0);
  expect(callsTo(db, "POST", /\/api\/tests\/setup\/pr$/)[0].body).toEqual({ repo: WEB, quarantine: true });
  await expect(web.getByTestId("ci-setup-progress")).toBeVisible();
  // The page reads the state again by itself until the PR is open.
  await expect(web.getByRole("link", { name: /Setup PR #512/ })).toHaveAttribute("href", `https://github.com/${WEB}/pull/512`, { timeout: 20_000 });
  await expect(web.getByTestId("ci-setup-pr")).toContainText("Checks running");
  await expect(web.getByText("Setup PR open")).toBeVisible();
  await shot(page, "setup-pr-open");
});

test("setup: added but nothing received names the cause and offers a fix PR", async ({ page }) => {
  const db = await mockApi(page, { setup: [NOTHING] });
  await page.goto("/tests?view=setup");
  const api = card(page, API);
  await expect(api.getByText("Nothing received", { exact: true })).toBeVisible();
  await expect(api.getByTestId("ci-setup-nothing")).toContainText("the last 3 runs sent no results");
  await expect(api.getByTestId("ci-setup-nothing")).toContainText("The artifact path doesn't match.");
  await expect(api.getByRole("link", { name: "Open the last run" })).toHaveAttribute("href", `https://github.com/${API}/actions/runs/77`);
  await expect(step(page, API, "upload")).toHaveAttribute("data-state", "partial");
  await expect(step(page, API, "results")).toContainText("No results in the last 3 runs.");
  await shot(page, "setup-nothing");
  await api.getByRole("button", { name: "Fix it with a PR" }).click();
  await expect(page.getByRole("dialog", { name: "Fix the results upload" })).toContainText("Fix the E2E results upload for Coderhelm");
  expect(callsTo(db, "POST", /\/api\/tests\/setup\/preview/)[0].body).toEqual({ repo: API, repair: true });
});

test("setup: do it myself shows one step's snippet, runner tabs and Copy", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __copied: string[] };
    w.__copied = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t: string) => void w.__copied.push(t), readText: async () => "" } });
  });
  await mockApi(page);
  await page.goto("/tests?view=setup");
  const upload = step(page, WEB, "upload");
  await upload.getByText("Do it myself").click();
  await expect(upload).toContainText("Add it after the test step in");
  const block = upload.getByRole("region", { name: WORKFLOW });
  await expect(block).toContainText("playwright-report/");
  // The runner found in the repo is picked; another can be chosen.
  await expect(upload.getByRole("button", { name: "Playwright" })).toHaveAttribute("aria-pressed", "true");
  await upload.getByRole("button", { name: "Jest" }).click();
  await expect(block).toContainText("junit.xml");
  await block.getByRole("button", { name: /Copy/ }).click();
  const copied = await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
  expect(copied[copied.length - 1]).toContain("name: Upload E2E results for Coderhelm");
  expect(copied[copied.length - 1]).toContain("junit.xml");
  // Only that step's snippet is shown.
  await expect(card(page, WEB).locator("[data-code-block]:visible")).toHaveCount(1);
  // The caveats are a small note under the quarantine step, collapsed.
  const quarantine = step(page, WEB, "quarantine");
  await quarantine.getByText("Do it myself").click();
  await expect(quarantine.getByText("Pull requests from forks")).toBeHidden();
  await quarantine.getByText("Notes").click();
  await expect(quarantine.getByText("Pull requests from forks")).toBeVisible();
  await shot(page, "setup-manual");
});

test("setup: Check again reads the workflow again, and a member can't open PRs", async ({ page }) => {
  const db = await mockApi(page, { role: "member" });
  await page.goto("/tests?view=setup");
  await expect(card(page, WEB).getByText("Ask an admin on your team to create the setup PR.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create setup PR" })).toHaveCount(0);
  await page.getByRole("button", { name: "Check again" }).click();
  await expect.poll(() => callsTo(db, "GET", /\/api\/tests\/setup\?refresh=1/).length).toBe(1);
});

test("setup: the settings and quarantine views point to setup instead of holding the YAML", async ({ page }) => {
  await mockApi(page);
  await page.goto("/tests?view=settings");
  await expect(page.getByRole("heading", { name: "CI setup" })).toBeVisible();
  await expect(page.locator("[data-code-block]:visible")).toHaveCount(0);
  await page.getByRole("link", { name: "Open setup" }).click();
  await expect(page).toHaveURL(/view=setup/);
  await page.goto("/tests?view=quarantine");
  await expect(page.locator("[data-code-block]:visible")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open setup" })).toBeVisible();
});

test("setup: long names never push the page sideways on a phone", async ({ page }) => {
  const { unanswered } = await mockWideApi(page);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/tests?view=setup");
  await expect(page.getByTestId("ci-setup-repo")).toHaveCount(2);
  for (const d of await page.getByText("Do it myself").all()) await d.click();
  await page.waitForTimeout(250);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the setup view scrolls sideways at 375px").toBeLessThanOrEqual(0);
  expect(unanswered.filter((u) => u.startsWith("/api/tests"))).toEqual([]);
});

// ── Quarantine: every row has a state and a next step ─────────────────────

const quarantineDb = (page: Page, over: Partial<Backend> = {}) =>
  mockApi(page, {
    tests: QUARANTINE_ROWS.map((t) => structuredClone(t)),
    autoFixes: [SPENT],
    settings: { enabled: true, auto_quarantine: true, fix_prs: true, tickets: "github", burn_in: false, repos: [], ticket_after_days: 2, auto_fixes_per_week: 2 },
    ...over,
  });

const rowOf = (page: Page, title: string) => page.getByTestId("test-row").filter({ hasText: title });
const dialogOf = (page: Page) => page.getByRole("alertdialog").or(page.getByRole("dialog"));

test("quarantine: every row says where it stands and what happens next", async ({ page }) => {
  await quarantineDb(page);
  await page.goto("/tests?view=quarantine");
  const list = page.getByRole("list", { name: "Quarantined tests" });
  await expect(list.getByTestId("test-row")).toHaveCount(8);
  // No row is only a Release button: each has a link to the work in flight, or the actions.
  for (const row of await list.getByTestId("test-row").all()) {
    const standingBlock = row.getByTestId("standing");
    await expect(standingBlock).toBeVisible();
    const links = await standingBlock.getByRole("link").count();
    const acts = await row.getByRole("button", { name: /Fix this test|Remove this test/ }).count();
    expect(links + acts, await row.innerText()).toBeGreaterThan(0);
    await expect(row.getByRole("button", { name: "Release from quarantine" })).toBeVisible();
  }

  // A fix pull request: linked, with its state.
  const fixPr = rowOf(page, "search: filters by price");
  await expect(fixPr.getByTestId("standing")).toHaveAttribute("data-state", "fix_pr");
  await expect(fixPr).toContainText("Fix pull request open, checks passing");
  await expect(fixPr.getByRole("link", { name: "Fix PR" })).toHaveAttribute("href", "https://github.com/your-team/web/pull/131");
  await expect(fixPr.getByRole("button", { name: "Fix this test" })).toHaveCount(0);

  // A run that is working: linked to the run.
  const running = rowOf(page, "profile: uploads an avatar");
  await expect(running).toContainText("Coderhelm is writing a fix");
  await expect(running.getByRole("link", { name: "Open the run" })).toHaveAttribute("href", /\/runs\/detail\/?\?id=01JQRUNFIX00000000000000/);

  // Nothing in flight: the two actions, and the one reason nothing happened by itself.
  const idle = rowOf(page, "basket: keeps items after sign-in");
  await expect(idle).toContainText("Nothing in flight");
  await expect(idle.getByTestId("why-not-fixed")).toHaveText(CAP_LINE);
  await expect(idle.getByRole("button", { name: "Fix this test" })).toBeVisible();
  await expect(idle.getByRole("button", { name: "Remove this test" })).toBeVisible();

  // A fix that did not hold: said, with the link and the reason, and the actions again.
  const failed = rowOf(page, "orders: cancels an order");
  await expect(failed).toContainText("The last fix did not hold");
  await expect(failed.getByTestId("last-attempt")).toContainText("closed without merging by sam-reviewer on 4 November 2026");
  await expect(failed.getByRole("link", { name: "The fix PR" })).toHaveAttribute("href", /pull\/118/);
  await expect(failed.getByTestId("why-not-fixed")).toContainText("tries again by itself after 15 November 2026");
  await expect(failed.getByRole("button", { name: "Fix this test" })).toBeVisible();
  await expect(failed.getByRole("button", { name: "Remove this test" })).toBeVisible();

  // A merged fix proves itself, and the row shows how far along it is.
  const merged = rowOf(page, "login: remembers the device");
  await expect(merged).toContainText("Fix merged, proving itself");
  await expect(merged.getByRole("progressbar", { name: "Passes toward leaving quarantine" })).toHaveAttribute("aria-valuenow", "12");
  await expect(merged.getByTestId("release-progress")).toContainText("12 of 20 passes needed, across 3 pull requests and branches");

  // On its way out by itself.
  const passing = rowOf(page, "home: opens the menu");
  await expect(passing.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "14");
  await expect(passing.getByTestId("why-not-fixed")).toContainText("leaves quarantine by itself");

  // A removal waits for the team, and an unstable test is called that.
  const removal = rowOf(page, "reports: exports a spreadsheet");
  await expect(removal).toContainText("it is your team's to approve and merge");
  await expect(removal.getByRole("link", { name: "Removal PR" })).toHaveAttribute("href", /pull\/152/);
  await expect(removal.getByRole("button", { name: "Remove this test" })).toHaveCount(0);
  await expect(rowOf(page, "cart: applies a voucher").getByTestId("unstable")).toContainText("quarantined again 2 times in 30 days");

  // The fix status is said once, by the row's state, not twice.
  await expect(list).not.toContainText("Fix PR open");
  await shot(page, "quarantine-states");
});

test("quarantine: the weekly limit is on the page with why and a link to the setting", async ({ page }) => {
  const db = await quarantineDb(page);
  await page.goto("/tests?view=quarantine");
  const note = page.getByTestId("auto-fix-note");
  await expect(note).toContainText(CAP_LINE);
  await expect(note).toContainText("Tests are worked oldest in quarantine first.");
  await expect(note).toContainText("A fix you ask for is never counted.");
  await note.getByRole("link", { name: "Change the weekly limit" }).click();
  await expect(page).toHaveURL(/view=settings#auto-fixes/);
  const field = page.getByRole("spinbutton", { name: "Automatic fixes per week" });
  await expect(field).toHaveValue("2");
  await field.fill("40");
  await expect(page.getByText("Pick between 1 and 10 automatic fixes per week.")).toBeVisible();
  await field.fill("4");
  await page.getByRole("button", { name: /^Save/ }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  expect(callsTo(db, "PUT", /\/api\/tests\/settings/)[0].body).toMatchObject({ auto_fixes_per_week: 4, fix_prs: true });
});

test("quarantine: the limit reads as used so far, as off, and per repository; a member gets no settings link", async ({ page }) => {
  await quarantineDb(page, {
    role: "member",
    autoFixes: [
      { repo: MOBILE, on: true, cap: 3, used: 1, resumes_at: RESUMES },
      { repo: WEB, on: false, cap: 2, used: 0, resumes_at: RESUMES },
    ],
  });
  await page.goto("/tests?view=quarantine");
  const note = page.getByTestId("auto-fix-note");
  await expect(note).toContainText(`Coderhelm has started 1 of this week's 3 automatic fixes for ${MOBILE}.`);
  await expect(note).toContainText(`Automatic fix pull requests are turned off (${WEB})`);
  await expect(note.getByRole("link")).toHaveCount(0);
  // A member reads the page: no actions and nothing to select.
  await expect(page.getByRole("button", { name: /Fix this test|Remove this test|Release from quarantine/ })).toHaveCount(0);
  await expect(page.getByTestId("quarantine-bulk")).toHaveCount(0);
});

test("quarantine: Fix this test starts a fix now, after saying what happens", async ({ page }) => {
  const db = await quarantineDb(page);
  await page.goto("/tests?view=quarantine");
  const row = rowOf(page, "basket: keeps items after sign-in");
  await row.getByRole("button", { name: "Fix this test" }).click();
  const dialog = dialogOf(page);
  await expect(dialog).toContainText("Ask Coderhelm to fix this test?");
  await expect(dialog).toContainText("It starts a fix run now");
  await expect(dialog).toContainText("not counted against the weekly limit of automatic fixes");
  await page.getByRole("button", { name: "Fix it" }).click();
  await expect(page.getByText("Coderhelm is on it")).toBeVisible();
  // The row now says the run is working, and offers no second fix.
  await expect(row.getByTestId("standing")).toHaveAttribute("data-state", "fix_running");
  await expect(row).toContainText("Reproducing the failure with 20 repeat runs");
  await expect(row.getByRole("button", { name: "Fix this test" })).toHaveCount(0);
  expect(callsTo(db, "POST", /\/api\/tests\/q_idle\/fix/)).toHaveLength(1);
});

test("quarantine: Remove this test opens a removal PR, never a deletion on the spot", async ({ page }) => {
  const db = await quarantineDb(page);
  await page.goto("/tests?view=quarantine");
  const row = rowOf(page, "orders: cancels an order");
  await row.getByRole("button", { name: "Remove this test" }).click();
  const dialog = dialogOf(page);
  await expect(dialog).toContainText("Open a pull request that removes this test?");
  await expect(dialog).toContainText("deletes this one test and what only it used");
  await expect(dialog).toContainText("what still covers the behaviour");
  await expect(dialog).toContainText("Nothing is deleted until your team approves and merges it. Coderhelm never merges it.");
  // Cancelling asks for nothing.
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(callsTo(db, "POST", /\/remove/)).toHaveLength(0);
  await row.getByRole("button", { name: "Remove this test" }).click();
  await page.getByRole("button", { name: "Open removal PR" }).click();
  await expect(page.getByText("Coderhelm is writing the removal PR")).toBeVisible();
  await expect(row.getByTestId("standing")).toHaveAttribute("data-state", "removal_running");
  await expect(row.getByRole("button", { name: /Fix this test|Remove this test/ })).toHaveCount(0);
  // The test stays in the list until the team merges the pull request.
  await expect(page.getByRole("list", { name: "Quarantined tests" }).getByTestId("test-row")).toHaveCount(8);
  expect(callsTo(db, "POST", /\/api\/tests\/q_failed\/remove/)).toHaveLength(1);
});

test("quarantine: a refused request says why and changes nothing", async ({ page }) => {
  await quarantineDb(page, { refuse: { q_idle: "A fix for this test is already in progress." } });
  await page.goto("/tests?view=quarantine");
  const row = rowOf(page, "basket: keeps items after sign-in");
  await row.getByRole("button", { name: "Fix this test" }).click();
  await page.getByRole("button", { name: "Fix it" }).click();
  await expect(page.getByText("A fix for this test is already in progress.")).toBeVisible();
  await expect(row.getByTestId("standing")).toHaveAttribute("data-state", "idle");
});

test("quarantine: fix selected and remove selected say what will happen first", async ({ page }) => {
  const db = await quarantineDb(page);
  await page.goto("/tests?view=quarantine");
  const bulk = page.getByTestId("quarantine-bulk");
  // Only rows something can be asked of have a checkbox.
  const boxes = page.getByRole("list", { name: "Quarantined tests" }).getByRole("checkbox");
  await expect(boxes).toHaveCount(4);
  await expect(rowOf(page, "search: filters by price").getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Select basket: keeps items after sign-in (chromium)" }).click();
  await page.getByRole("checkbox", { name: "Select orders: cancels an order (chromium)" }).click();
  await expect(bulk).toContainText("2 tests selected");
  await bulk.getByRole("button", { name: "Fix selected (2)" }).click();
  const dialog = dialogOf(page);
  await expect(dialog).toContainText("Ask Coderhelm to fix 2 tests?");
  await expect(dialog).toContainText("It starts 2 fix runs now, one per test: basket: keeps items after sign-in (chromium); orders: cancels an order (chromium).");
  await expect(dialog).toContainText("not counted against the weekly limit");
  await page.getByRole("button", { name: "Fix 2 tests" }).click();
  await expect(page.getByText("Coderhelm started 2 fixes")).toBeVisible();
  expect(callsTo(db, "POST", /\/fix$/).map((c) => c.path)).toEqual(["/api/tests/q_idle/fix", "/api/tests/q_failed/fix"]);
  // Both rows are in flight now, so nothing is left selected and they can't be picked again.
  await expect(boxes).toHaveCount(2);
  await expect(bulk).toContainText("Select all");

  // Select all, then remove: one pull request per test.
  await bulk.getByRole("checkbox").click();
  await expect(bulk).toContainText("2 tests selected");
  await bulk.getByRole("button", { name: "Remove selected (2)" }).click();
  await expect(dialog).toContainText("Open 2 pull requests that each remove one test?");
  await expect(dialog).toContainText("Nothing is deleted until your team approves and merges them.");
  await page.getByRole("button", { name: "Open 2 removal PRs" }).click();
  await expect(page.getByText("Coderhelm started 2 removals")).toBeVisible();
  expect(callsTo(db, "POST", /\/remove$/).map((c) => c.path).sort()).toEqual(["/api/tests/q_passing/remove", "/api/tests/q_unstable/remove"]);
  await expect(bulk).toHaveCount(0);
});

test("quarantine: a bulk request that partly fails says how many started and why the rest did not", async ({ page }) => {
  await quarantineDb(page, { refuse: { q_failed: "A fix pull request is already open: https://github.com/your-team/web/pull/118." } });
  await page.goto("/tests?view=quarantine");
  await page.getByTestId("quarantine-bulk").getByRole("checkbox").click();
  await page.getByRole("button", { name: "Fix selected (4)" }).click();
  await page.getByRole("button", { name: "Fix 4 tests" }).click();
  await expect(page.getByText("Started 3 of 4. 1 couldn't start: A fix pull request is already open")).toBeVisible();
  await expect(rowOf(page, "orders: cancels an order").getByTestId("standing")).toHaveAttribute("data-state", "fix_failed");
});

test("quarantine: on a phone every row keeps its state, reason and actions", async ({ page }) => {
  await quarantineDb(page);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/tests?view=quarantine");
  const row = rowOf(page, "orders: cancels an order");
  await expect(row.getByTestId("standing")).toBeVisible();
  await expect(row.getByTestId("why-not-fixed")).toBeVisible();
  for (const name of ["Fix this test", "Remove this test", "Release from quarantine"]) {
    const box = await row.getByRole("button", { name }).boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.x, `${name} starts on the screen`).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, `${name} ends on the screen`).toBeLessThanOrEqual(390);
  }
  await expect(page.getByTestId("quarantine-bulk")).toBeVisible();
  await expect(page.getByTestId("auto-fix-note")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the quarantine view scrolls sideways at 390px").toBeLessThanOrEqual(0);
});

test("quarantine: a server from before sends no standing, and the row is what it was", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/tests?view=quarantine");
  const list = page.getByRole("list", { name: "Quarantined tests" });
  await expect(list.getByTestId("test-row")).toHaveCount(1);
  await expect(list.getByRole("link", { name: "Fix PR" })).toHaveAttribute("href", /pull\/88/);
  await expect(list).toContainText("Proving the fix (20 runs)");
  await expect(list.getByRole("button", { name: "Release from quarantine" })).toBeVisible();
  // Nothing it can't do there is offered: no fix or removal, no selection, no limit note.
  await expect(page.getByRole("button", { name: /Fix this test|Remove this test/ })).toHaveCount(0);
  await expect(page.getByTestId("standing")).toHaveCount(0);
  await expect(page.getByTestId("quarantine-bulk")).toHaveCount(0);
  await expect(page.getByTestId("auto-fix-note")).toHaveCount(0);
  await expect(list.getByRole("checkbox")).toHaveCount(0);
  expect(callsTo(db, "POST", /\/remove/)).toHaveLength(0);
  // The settings page has no weekly number to set either.
  await page.goto("/tests?view=settings");
  await expect(page.getByRole("heading", { name: "CI setup" })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Automatic fixes per week" })).toHaveCount(0);
});

test("quarantine: a test passing its way out shows progress, a withdrawn cause, and release as the override", async ({ page }) => {
  const passes = Array.from({ length: 14 }, (_, i) => ({
    run_key: `p_${i}`, sha: `feed${i}000000`, branch: i % 4 === 0 ? "main" : `feature/${i % 4}`, pr: i % 4 === 0 ? null : 410 + (i % 4),
    at: ago((i + 1) * 1_200_000), outcome: "passed", attempts: [ATTEMPT_PASS],
  }));
  const failures = Array.from({ length: 3 }, (_, i) => ({
    run_key: `f_${i}`, sha: `dead${i}000000`, branch: "feature/9", pr: 409, at: ago(6 * 3_600_000 + i * 600_000), outcome: "failed",
    attempts: [ATTEMPT_FAIL, { ...ATTEMPT_FAIL, retry: 1 }],
  }));
  const db = await quarantineDb(page, { history: { q_passing: [...passes, ...failures] } });
  await page.goto("/tests/test?id=q_passing");
  const where = page.getByTestId("test-standing");
  await expect(where.getByRole("heading", { name: "In quarantine" })).toBeVisible();
  await expect(where.getByRole("progressbar", { name: "Passes toward leaving quarantine" })).toHaveAttribute("aria-valuenow", "14");
  await expect(where.getByTestId("release-progress")).toContainText("14 of 20 passes needed, across 4 pull requests and branches");
  await expect(where.getByTestId("why-not-fixed")).toContainText("It is passing again and leaves quarantine by itself");
  // The cause no longer reads as a fact the history disproves.
  const cause = page.getByTestId("test-cause");
  await expect(cause).toHaveAttribute("data-out-of-date", "true");
  await expect(cause).toContainText("Earlier diagnosis, now out of date: Environment");
  await expect(cause).toContainText("it has passed 14 runs in a row on 4 pull requests and branches");
  await expect(cause).toContainText("what changed is outside the test");
  await expect(page.getByText("Likely cause: Environment")).toHaveCount(0);
  await expect(cause.locator(".line-through")).toContainText("passed on retry in 0 of the last 30 runs");
  await expect(page.getByRole("img", { name: /Last 17 runs, oldest first: 3 failed, 14 passed/ })).toBeVisible();
  await shot(page, "quarantine-on-its-way-out");
  // Release stays, as the manual override.
  await page.getByRole("button", { name: "Release from quarantine" }).click();
  await expect(page.getByText(/It goes back to blocking pull requests when it fails/)).toBeVisible();
  await page.getByRole("button", { name: "Release", exact: true }).click();
  expect(callsTo(db, "POST", /\/api\/tests\/q_passing\/quarantine/)[0].body).toMatchObject({ on: false });
});

test("quarantine: a test's page offers the fix and the removal, with the week's limit", async ({ page }) => {
  const db = await quarantineDb(page);
  await page.goto("/tests/test?id=q_idle");
  const where = page.getByTestId("test-standing");
  await expect(where).toContainText("Nothing in flight");
  await expect(where.getByTestId("why-not-fixed")).toHaveText(CAP_LINE);
  // The way out is stated even before the first pass.
  await expect(where.getByTestId("release-progress")).toContainText("20 in a row are needed");
  await expect(where.getByTestId("auto-fix-budget")).toContainText(CAP_LINE);
  await expect(where.getByRole("link", { name: "Change the weekly limit" })).toHaveAttribute("href", /view=settings#auto-fixes/);
  await shot(page, "quarantine-test-page");
  await page.getByRole("button", { name: "Remove this test" }).click();
  await page.getByRole("button", { name: "Open removal PR" }).click();
  await expect(where.getByTestId("standing")).toHaveAttribute("data-state", "removal_running");
  await expect(page.getByRole("button", { name: /Fix this test|Remove this test/ })).toHaveCount(0);
  expect(callsTo(db, "POST", /\/api\/tests\/q_idle\/remove/)).toHaveLength(1);
});

test("quarantine: a diagnosed environment cause names what the test depends on", async ({ page }) => {
  const t = quarantined("q_env", "billing: shows the invoice total", 5, {
    cause: {
      label: "environment", evidence: "Every failure is a 502 from the preview's rates service.",
      depends_on: "the preview deployment's rates service",
      independent: "Stub the rates response in the test's own setup instead of calling the shared preview.",
    },
    quarantine: standing({ why: "Next in line for an automatic fix: Coderhelm starts it on its next look at this repository." }),
  });
  await quarantineDb(page, { tests: [t] });
  await page.goto("/tests/test?id=q_env");
  const cause = page.getByTestId("test-cause");
  await expect(cause).toHaveAttribute("data-out-of-date", "false");
  await expect(cause).toContainText("Likely cause: Environment");
  await expect(cause).toContainText("Depends on: the preview deployment's rates service");
  await expect(cause).toContainText("Making it independent: Stub the rates response in the test's own setup");
});

test("quarantine: a test that left by itself, and one that was removed, say why on their page", async ({ page }) => {
  const reason = "Left quarantine by itself: 20 passes in a row with no failure and no retry, on 5 pull requests and branches, over 3 hours, since it last failed on 12 November 2026.";
  const released = makeTest({ id: "t_released", title: "home: opens the menu", state: "healthy", quarantine: null, release: { at: ago(3_600_000), reason, passes: 20, sources: 5, hours: 3 } });
  const removed = makeTest({
    id: "t_removed", title: "reports: exports a spreadsheet", state: "healthy", quarantine: null, removed: true,
    removal: { status: "merged", by: "coderhelm", at: ago(2 * DAY), pr: { url: "https://github.com/your-team/web/pull/152", state: "merged", by: "robin-lead" }, approved_by: ["robin-lead", "sam-reviewer"] },
  });
  await quarantineDb(page, { tests: [released, removed] });
  await page.goto("/tests/test?id=t_released");
  await expect(page.getByTestId("test-released")).toContainText("Left quarantine by itself");
  await expect(page.getByTestId("test-released")).toContainText("20 passes in a row with no failure and no retry, on 5 pull requests and branches");
  // The same sentence is in the test's history.
  const changes = page.getByRole("list", { name: "State changes" });
  await expect(changes).toContainText("Changed from Quarantined to Healthy");
  await expect(changes).toContainText(reason);
  await expect(page.getByTestId("test-standing")).toHaveCount(0);

  await page.goto("/tests/test?id=t_removed");
  const gone = page.getByTestId("test-removed");
  await expect(gone).toContainText("This test was removed");
  await expect(gone).toContainText("Approved by robin-lead, sam-reviewer, merged by robin-lead.");
  await expect(gone).toContainText("Coderhelm proposed the removal.");
  await expect(gone.getByRole("link", { name: "Open the removal PR" })).toHaveAttribute("href", /pull\/152/);
});
