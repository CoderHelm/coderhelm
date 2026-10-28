import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// How a run that stopped by the stop rules reads on the run page: a tooling
// failure names the exact command and error (never "needs your answer"), a
// run covered by someone's open pull request links it, and a question shows
// the evidence it cites. Every API call is answered here.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

const BASE = {
  ticket_source: "jira",
  ticket_id: "ABC-12",
  title: "Cards list spec fails on every run",
  repo: "your-team/web",
  cost_usd: 1.2,
  tokens_in: 1000,
  tokens_out: 1000,
  duration_s: 600,
  current_pass: "done",
  created_at: iso(60),
  updated_at: iso(5),
  pass_history: [],
  progress_notes: [],
};

const RUNS: Record<string, unknown> = {
  "01TOOL": {
    ...BASE,
    run_id: "01TOOL",
    status: "failed",
    error: "Tooling failure: `cd 'e2e' && pnpm exec tsc --noEmit -p tsconfig.json` failed: sh: 1: tsc: not found",
    stop_kind: "tooling",
    tooling_failure: {
      command: "cd 'e2e' && pnpm exec tsc --noEmit -p tsconfig.json",
      error: "sh: 1: tsc: not found",
      tried: [
        "`cd 'e2e' && (pnpm install --ignore-workspace --frozen-lockfile || pnpm install --ignore-workspace)` failed (exit 1)",
        "`cd 'e2e' && pnpm exec tsc --noEmit -p tsconfig.json` failed (exit 127)",
      ],
    },
  },
  "01COVR": {
    ...BASE,
    run_id: "01COVR",
    status: "covered_by_pr",
    error: "Already being fixed in #41",
    covered_by: {
      repo: "your-team/web",
      number: 41,
      url: "https://github.com/your-team/web/pull/41",
      title: "Fix the cards list spec: select the card by its name",
      author: "dev-b",
      reason: "It selects the card by its name, which is the ticket's fix.",
    },
  },
  "01ASKD": {
    ...BASE,
    run_id: "01ASKD",
    status: "needs_input",
    questions: [
      {
        id: "q1",
        question: "The spec already selects the card by its name, so the ticket's cause doesn't hold here. Is there another cause?",
        why: "The ticket says the spec reads the first card.",
        suggestions: [],
        decision: null,
        evidence: ["e2e/tests/cards.spec.ts:42", "L2"],
      },
    ],
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

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true });
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const [label, width, height] of [
  ["desktop", 1440, 900],
  ["phone", 390, 844],
] as const) {
  test(`a tooling failure names the command and error, not a question (${label})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mockApi(page);
    await page.goto("/runs/detail?id=01TOOL");
    const outcome = page.getByTestId("run-outcome");
    await expect(outcome).toContainText("Tooling failure: Coderhelm's own environment failed");
    await expect(outcome).toContainText("This is not a question for the ticket.");
    await expect(page.getByTestId("tooling-command").locator("pre")).toContainText("cd 'e2e' && pnpm exec tsc --noEmit -p tsconfig.json");
    await expect(page.getByTestId("tooling-error").locator("pre")).toContainText("sh: 1: tsc: not found");
    await expect(page.getByTestId("tooling-failure")).toContainText("failed (exit 127)");
    await expect(outcome).not.toContainText(/needs your answer|more detail/i);
    await noSidewaysScroll(page);
    await shot(page, `stop-rules-tooling-${width}`);
  });

  test(`a run covered by an open pull request links it (${label})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mockApi(page);
    await page.goto("/runs/detail?id=01COVR");
    const outcome = page.getByTestId("run-outcome");
    await expect(outcome).toContainText("Already being fixed in #41");
    await expect(page.getByTestId("covered-by")).toContainText("Fix the cards list spec: select the card by its name by dev-b");
    await expect(page.getByTestId("covered-by")).toContainText("It selects the card by its name, which is the ticket's fix.");
    await expect(page.getByTestId("covered-by-link")).toHaveAttribute("href", "https://github.com/your-team/web/pull/41");
    await expect(page.getByText("Covered by an open PR").first()).toBeVisible();
    await noSidewaysScroll(page);
    await shot(page, `stop-rules-covered-${width}`);
  });
}

test("a question shows the evidence it cites", async ({ page }) => {
  await mockApi(page);
  await page.goto("/runs/detail?id=01ASKD");
  const ev = page.getByTestId("run-question-evidence");
  await expect(ev).toContainText("Evidence:");
  await expect(ev.locator("code")).toHaveText(["e2e/tests/cards.spec.ts:42", "L2"]);
});

test("a covered run can be retried when the ticket needs its own change", async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto("/runs/detail?id=01COVR");
  await page.getByTestId("run-outcome").getByRole("button", { name: /Retry/ }).click();
  await expect.poll(() => calls).toContain("POST /api/runs/01COVR/retry");
});
