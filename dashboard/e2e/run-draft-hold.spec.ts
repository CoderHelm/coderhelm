import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// A run whose pull request is still a draft (`draft_hold`) says so at the
// top, never "Finished": the pull request, how many things hold it, and each
// reason with what to do. A run waiting out GitHub's hourly limit (`github_wait`) says when it
// goes on, and that nothing is needed. Every API call is answered here.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

type Run = Record<string, unknown> & { run_id: string; status: string };

const SECURITY = {
  what: "Security items are open under Open items",
  todo: "Fix them on this branch (Coderhelm checks again on the next push), or delete each security line once a person has checked it.",
};
const SANDBOX = {
  what: "The sandbox could not run the end-to-end tests",
  todo: "Add the missing BASE_URL to the repository's test settings, then push to the branch.",
};

function run(over: Partial<Run> = {}): Run {
  return {
    run_id: "01RUNHOLD",
    status: "needs_input",
    ticket_source: "jira",
    ticket_id: "ABC-9",
    title: "Add rate limits to the sign-up form",
    repo: "your-team/web",
    pr_url: "https://github.com/your-team/web/pull/318",
    pr_number: 318,
    current_pass: "review",
    tokens_in: 1200,
    tokens_out: 300,
    duration_s: 900,
    created_at: iso(60),
    updated_at: iso(5),
    pass_history: [
      { pass: "triage", started_at: iso(60) },
      { pass: "implement", started_at: iso(50) },
      { pass: "pr", started_at: iso(20) },
      { pass: "review", started_at: iso(10) },
    ],
    progress_notes: [],
    checks: null,
    pr_review: null,
    waiting_on: { action: "Review pull request #318", detail: "It stays a draft until the items below are dealt with.", url: "https://github.com/your-team/web/pull/318", since: iso(5) },
    draft_hold: {
      kind: "held",
      summary: `Finished, but pull request #318 stays a draft: ${SECURITY.what}. ${SECURITY.todo}`,
      reasons: [SECURITY, SANDBOX],
      pr_number: 318,
      since: iso(5),
    },
    ...over,
  };
}

async function mockApi(page: Page, r: Run) {
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: "pat", email: "pat@example.com", avatar_url: "", role: "member" });
    if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "your-team/web", enabled: true, ticket_source: "jira" }] });
    if (p === "/api/plugins/catalog") return json(route, { plugins: [] });
    const m = p.match(/^\/api\/runs\/([^/]+)(?:\/(.+))?$/);
    if (m) {
      if (decodeURIComponent(m[1]) !== r.run_id) return json(route, { error: "No run with this id in the team.", code: "not_found" }, 404);
      const action = m[2];
      if (!action) return json(route, r);
      if (action === "openspec") return json(route, {});
      if (action === "traces") return json(route, { traces: [] });
      if (action === "agent-log") return json(route, { passes: [], live_events: [] });
      if (action === "asks") return json(route, { asks: [] });
    }
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
}

async function noSideways(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true });
}

test("a held run says its pull request is a draft, with each reason and what to do", async ({ page }) => {
  await mockApi(page, run());
  await page.goto("/runs/detail?id=01RUNHOLD");

  const outcome = page.getByTestId("run-outcome");
  await expect(outcome).toBeVisible();
  await expect(outcome).toHaveAttribute("data-tone", "waiting");
  await expect(outcome).toContainText("Pull request #318 is a draft: 2 things to deal with");
  await expect(page.getByText(/Finished/)).toHaveCount(0);
  await expect(page.getByTestId("run-who")).toHaveText("Needs a person");
  // The status beside the title says the same, not "Needs your answer".
  await expect(page.getByTestId("page-header").getByText("PR held", { exact: true })).toBeVisible();
  await expect(page.getByText("Needs your answer")).toHaveCount(0);
  // The summary repeats the first reason word for word: the reasons say it once.
  await expect(page.getByTestId("draft-hold-summary")).toHaveCount(0);
  // Retry is there, but the pull request is the one primary action.
  await expect(outcome.getByRole("button", { name: "Retry" })).toBeVisible();
  // The steps end on the hold, waiting on a person.
  await expect(page.getByRole("list", { name: "Steps" }).getByTestId("run-step").last()).toHaveAttribute("data-state", "needs_you");
  const reasons = page.getByTestId("draft-hold-reasons");
  await expect(reasons.getByRole("listitem").filter({ hasText: SECURITY.what })).toContainText(`What to do: ${SECURITY.todo}`);
  await expect(reasons.getByRole("listitem").filter({ hasText: SANDBOX.what })).toContainText(`What to do: ${SANDBOX.todo}`);
  await expect(reasons).toContainText("Held since");
  await expect(outcome.getByRole("link", { name: /Open pull request #318/ })).toHaveAttribute("href", "https://github.com/your-team/web/pull/318");
  // The named wait under it is the same pull request; the hold says it once.
  await expect(page.getByText("Review pull request #318")).toHaveCount(0);
  await shot(page, "run-draft-hold");
});

test("a pull request GitHub refused to mark ready reads as needing attention", async ({ page }) => {
  await mockApi(page, run({
    status: "completed",
    waiting_on: null,
    draft_hold: { kind: "failed", summary: "Finished, but GitHub refused every try to mark pull request #318 ready.", reasons: [{ what: "GitHub refused to mark it ready (403)", todo: "Mark it ready on GitHub, or check the GitHub App's permissions on the repository." }], pr_number: 318, since: null },
  }));
  await page.goto("/runs/detail?id=01RUNHOLD");
  const outcome = page.getByTestId("run-outcome");
  await expect(outcome).toHaveAttribute("data-tone", "attention");
  await expect(outcome).toContainText("Pull request #318 couldn't be marked ready");
  await expect(outcome).toContainText("What to do: Mark it ready on GitHub");
  await expect(outcome).not.toContainText("Held since");
  // Not "Done. The change is ready for review."
  await expect(page.getByText("Pull request #318 is ready for review")).toHaveCount(0);
});

test("a held run that also asked something shows its questions, not only the hold", async ({ page }) => {
  await mockApi(page, run({ questions: [{ id: "q1", question: "Should the limit apply to signed-in people too?", why: "It changes who gets locked out.", suggestions: [] }] }));
  await page.goto("/runs/detail?id=01RUNHOLD");
  const outcome = page.getByTestId("run-outcome");
  await expect(outcome).toContainText("Pull request #318 is a draft");
  await expect(outcome.getByTestId("run-question")).toContainText("Should the limit apply to signed-in people too?");
});

test("a run whose pull request's CI fails reads CI failing, with the check and the error, never Done", async ({ page }) => {
  const ci = {
    what: "CI is failing on this head: `Deploy Preview`",
    todo: "Fix the failing checks on this branch (Coderhelm decides again on the push), or re-run them if the failure isn't the change's; the pull request leaves draft once CI is green.",
  };
  await mockApi(page, run({
    waiting_on: {
      action: "Review pull request #318",
      detail: "CI is failing: Deploy Preview: Error: expect(received).toBeLessThanOrEqual(expected). Coderhelm made 3 fix attempt(s) without getting it green. The pull request stays a draft until CI passes",
      url: "https://github.com/your-team/web/pull/318",
      since: iso(5),
    },
    draft_hold: { kind: "held", summary: `Finished, but pull request #318 stays a draft: ${ci.what}.`, reasons: [ci], pr_number: 318, since: iso(5) },
  }));
  await page.goto("/runs/detail?id=01RUNHOLD");
  await expect(page.getByTestId("page-header").getByText("CI failing", { exact: true })).toBeVisible();
  await expect(page.getByTestId("page-header").getByText("Done", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("draft-hold-reasons")).toContainText("CI is failing on this head: Deploy Preview");
  await expect(page.getByTestId("run-outcome")).toHaveAttribute("data-tone", "waiting");
  await noSideways(page);
  await shot(page, "run-ci-failing");
});

test("a run stopped with planned work left reads Stopped, not finished", async ({ page }) => {
  await mockApi(page, run({
    waiting_on: {
      action: "Review pull request #318",
      detail: "Stopped: steps 2 and 3 made no progress. The branch stayed at a8c8814 and the run was stuck at the implement work (planned tasks) while working on task 8 of 8.",
      url: "https://github.com/your-team/web/pull/318",
      since: iso(5),
    },
    draft_hold: null,
  }));
  await page.goto("/runs/detail?id=01RUNHOLD");
  await expect(page.getByTestId("page-header").getByText("Stopped, not finished", { exact: true })).toBeVisible();
});

test("a run with no hold still reads as before", async ({ page }) => {
  await mockApi(page, run({ status: "completed", waiting_on: null, draft_hold: null }));
  await page.goto("/runs/detail?id=01RUNHOLD");
  await expect(page.getByTestId("run-outcome")).toContainText("Pull request #318 is ready for review");
  await expect(page.getByText("PR held")).toHaveCount(0);
});

test("a run waiting for GitHub's hourly limit says when it goes on", async ({ page }) => {
  await mockApi(page, run({
    status: "running",
    current_pass: "implement",
    waiting_on: null,
    draft_hold: null,
    github_wait: "Waiting for GitHub's hourly limit to reset at 21:05 UTC; continues by itself",
  }));
  await page.goto("/runs/detail?id=01RUNHOLD");
  const outcome = page.getByTestId("run-outcome");
  await expect(outcome).toHaveAttribute("data-tone", "waiting");
  await expect(outcome).toContainText("Waiting for GitHub");
  await expect(page.getByTestId("github-wait")).toHaveText("Waiting for GitHub's hourly limit to reset at 21:05 UTC; continues by itself. Nothing is needed from you.");
  await expect(page.getByText("Coderhelm is working on this")).toHaveCount(0);
});

test("a finished run ignores a stale GitHub wait", async ({ page }) => {
  await mockApi(page, run({ status: "completed", waiting_on: null, draft_hold: null, github_wait: "Waiting for GitHub's hourly limit to reset at 21:05 UTC; continues by itself" }));
  await page.goto("/runs/detail?id=01RUNHOLD");
  await expect(page.getByTestId("run-outcome")).toContainText("Pull request #318 is ready for review");
  await expect(page.getByTestId("github-wait")).toHaveCount(0);
});

test("the hold and the GitHub wait fit a phone at 375 wide", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  const long = "packages/payments-reconciliation-ledger/src/adapters/stripe/webhooks/handlers/charge-refunded-partially.ts";
  await mockApi(page, run({ draft_hold: { kind: "held", summary: `Finished, but pull request #318 stays a draft: ${long}`, reasons: [{ what: long, todo: `Fix ${long} on branch coderhelm/abc-9-add-rate-limits-to-the-sign-up-form-and-the-password-reset-form` }], pr_number: 318, since: iso(5) } }));
  await page.goto("/runs/detail?id=01RUNHOLD");
  await expect(page.getByTestId("draft-hold-reasons")).toBeVisible();
  await noSideways(page);
  await shot(page, "run-draft-hold-phone");

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await mockApi(page, run({ run_id: "01RUNWAIT", status: "running", waiting_on: null, draft_hold: null, github_wait: `Waiting for GitHub's hourly limit to reset at 21:05 UTC; continues by itself ${long}` }));
  await page.goto("/runs/detail?id=01RUNWAIT");
  await expect(page.getByTestId("github-wait")).toBeVisible();
  await noSideways(page);
});
