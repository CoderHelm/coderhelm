import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// A run that stopped to ask: the run page lists its questions with why each
// matters, links to the comment on the ticket, and takes the answers (one box
// per question). Sending posts them and continues the work in a new run; the
// old run then shows what was answered. Every API call is answered here.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

type Run = Record<string, unknown> & { run_id: string; status: string };

const QUESTIONS = [
  {
    id: "q1",
    question: "Which environments get the new sign-up limit?",
    why: "config/limits.yml holds one value per environment, and the ticket names none.",
    suggestions: ["Production only", "Every environment"],
  },
  {
    id: "q2",
    question: "What should the limit be, in sign-ups per minute?",
    why: null,
    suggestions: [],
  },
];

function asking(over: Partial<Run> = {}): Run {
  return {
    run_id: "01RUNQ",
    status: "needs_input",
    ticket_source: "jira",
    ticket_id: "ABC-7",
    title: "Raise the sign-up rate limit",
    repo: "your-team/web",
    current_pass: "plan",
    tokens_in: 1200,
    tokens_out: 300,
    cost_usd: 0.4,
    duration_s: 95,
    created_at: iso(30),
    updated_at: iso(25),
    pass_history: [
      { pass: "triage", started_at: iso(30) },
      { pass: "plan", started_at: iso(29) },
    ],
    progress_notes: [],
    questions: QUESTIONS,
    questions_url: "https://your-team.example.com/browse/ABC-7?focusedCommentId=10001",
    answers: [],
    answers_url: null,
    continued_run_id: null,
    ...over,
  };
}

interface Backend {
  role: string;
  runs: Record<string, Run>;
  calls: string[];
  /** The answer endpoint refuses with 409, as when the run moved on. */
  movedOn: boolean;
  answerBodies: Record<string, unknown>[];
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = {
    role: "member",
    runs: { "01RUNQ": asking() },
    calls: [],
    movedOn: false,
    answerBodies: [],
    ...init,
  };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    db.calls.push(`${req.method()} ${p}`);
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: "pat", email: "pat@example.com", avatar_url: "", role: db.role });
    if (p === "/api/usage") return json(route, { month: "2026-10", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "your-team/web", enabled: true, ticket_source: "jira" }] });
    if (p === "/api/plugins/catalog") return json(route, { plugins: [] });
    if (p === "/api/search") return json(route, { q: url.searchParams.get("q"), runs: [], reviews: [], releases: [], plans: [] });
    if (p === "/api/runs" && req.method() === "GET") return json(route, { runs: Object.values(db.runs), next: null });
    const m = p.match(/^\/api\/runs\/([^/]+)(?:\/(.+))?$/);
    if (m) {
      const r = db.runs[decodeURIComponent(m[1])];
      if (!r) return json(route, { error: "No run with this id in the team.", code: "not_found" }, 404);
      const action = m[2];
      if (!action) return json(route, r);
      if (action === "answer" && req.method() === "POST") {
        const body = JSON.parse(req.postData() ?? "{}") as { answers: { question_id: string; answer: string }[] };
        db.answerBodies.push(body);
        if (db.movedOn || r.status !== "needs_input") {
          r.status = "retried";
          return json(route, { error: "This run moved on while you were writing (answered, retried or closed). Refresh to see where it is.", code: "conflict" }, 409);
        }
        const asked = r.questions as typeof QUESTIONS;
        Object.assign(r, {
          status: "retried",
          continued_run_id: "01RUNNEXT",
          answers_url: "https://your-team.example.com/browse/ABC-7?focusedCommentId=10042",
          answers: body.answers.map((a) => ({
            question_id: a.question_id,
            question: asked.find((q) => q.id === a.question_id)?.question ?? "",
            answer: a.answer,
            author: "Pat Doe",
            answered_at: new Date().toISOString(),
          })),
        });
        db.runs["01RUNNEXT"] = asking({ run_id: "01RUNNEXT", status: "running", questions: [], questions_url: null, created_at: iso(0) });
        return json(route, { status: "continuing", run_id: "01RUNNEXT", posted: true, comment_url: r.answers_url });
      }
      if (action === "retry") {
        r.status = "retried";
        return json(route, { status: "retrying" });
      }
      if (action === "openspec") return json(route, {});
      if (action === "traces") return json(route, { traces: [] });
      if (action === "agent-log") return json(route, { passes: [], live_events: [] });
      if (action === "asks") return json(route, { asks: [] });
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

test.describe("a run waiting on an answer", () => {
  test("lists each question with why, links to the ticket, and keeps Retry", async ({ page }) => {
    await mockApi(page);
    await page.goto("/runs/detail?id=01RUNQ");
    const card = page.getByTestId("run-outcome");
    await expect(card).toContainText("Coderhelm needs your answer");
    await expect(card).toContainText("It stopped to ask 2 questions.");
    const qs = card.getByTestId("run-question");
    await expect(qs).toHaveCount(2);
    await expect(qs.nth(0)).toContainText("Which environments get the new sign-up limit?");
    await expect(qs.nth(0).getByTestId("run-question-why")).toHaveText(
      "config/limits.yml holds one value per environment, and the ticket names none.",
    );
    // No reason given: nothing under the second question.
    await expect(qs.nth(1).getByTestId("run-question-why")).toHaveCount(0);
    const link = card.getByRole("link", { name: /See it on the ticket/ });
    await expect(link).toHaveAttribute("href", "https://your-team.example.com/browse/ABC-7?focusedCommentId=10001");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(card.getByRole("button", { name: "Retry" })).toBeVisible();
    // The old one-line prompt is gone when the questions are known.
    await expect(card).not.toContainText("Add the missing detail to the ticket");
  });

  test("an empty answer isn't sent; answers are sent, and the run shows what was answered", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/runs/detail?id=01RUNQ");
    const card = page.getByTestId("run-outcome");
    const send = card.getByRole("button", { name: "Send answers and continue" });

    await send.click();
    await expect(card.getByRole("alert")).toHaveText("Write an answer to at least one question.");
    await expect(card.getByRole("textbox", { name: "Your answer to question 1" })).toBeFocused();
    expect(db.answerBodies).toHaveLength(0);

    // A suggestion fills its box; the second box takes free text.
    await card.getByRole("button", { name: "Production only" }).click();
    await expect(card.getByRole("textbox", { name: "Your answer to question 1" })).toHaveValue("Production only");
    await expect(card.getByRole("alert")).toHaveCount(0);
    await card.getByRole("textbox", { name: "Your answer to question 2" }).fill("  120 per minute  ");
    await send.click();

    await expect.poll(() => db.answerBodies.length).toBe(1);
    expect(db.answerBodies[0]).toEqual({
      answers: [
        { question_id: "q1", answer: "Production only" },
        { question_id: "q2", answer: "120 per minute" },
      ],
    });
    await expect(page.getByText("Sent. Your answer is on the Jira ticket and Coderhelm is continuing.")).toBeVisible();

    // The page reads the run again: answered, with where the work went on.
    await expect(card).toContainText("Answered. Coderhelm is continuing in a new run.");
    const answered = card.getByTestId("run-answered");
    await expect(answered).toContainText("Which environments get the new sign-up limit?");
    await expect(answered).toContainText("Production only");
    await expect(answered).toContainText("120 per minute");
    await expect(answered).toContainText("Pat Doe");
    await expect(answered.getByRole("link", { name: "Open the run that continued" })).toHaveAttribute("href", /\/runs\/detail\/?\?id=01RUNNEXT/);
    await expect(answered.getByRole("link", { name: /See the reply on the ticket/ })).toHaveAttribute(
      "href",
      "https://your-team.example.com/browse/ABC-7?focusedCommentId=10042",
    );
    await expect(card.getByRole("button", { name: /Send answer/ })).toHaveCount(0);
  });

  test("one question: one box, and partial answers are allowed with several", async ({ page }) => {
    const db = await mockApi(page, { runs: { "01RUNQ": asking({ questions: [QUESTIONS[1]] }) } });
    await page.goto("/runs/detail?id=01RUNQ");
    const card = page.getByTestId("run-outcome");
    await expect(card).toContainText("It stopped to ask one question.");
    await card.getByRole("button", { name: "Send answer and continue" }).click();
    await expect(card.getByRole("alert")).toHaveText("Write your answer first.");
    await card.getByRole("textbox", { name: "Your answer" }).fill("90");
    await card.getByRole("textbox", { name: "Your answer" }).press("ControlOrMeta+Enter");
    await expect.poll(() => db.answerBodies.length).toBe(1);
    expect(db.answerBodies[0]).toEqual({ answers: [{ question_id: "q2", answer: "90" }] });
  });

  test("a run that moved on meanwhile is refused and the page catches up", async ({ page }) => {
    const db = await mockApi(page, { movedOn: true });
    await page.goto("/runs/detail?id=01RUNQ");
    const card = page.getByTestId("run-outcome");
    await card.getByRole("textbox", { name: "Your answer to question 2" }).fill("120");
    await card.getByRole("button", { name: "Send answers and continue" }).click();
    await expect(page.getByText(/This run moved on while you were writing/)).toBeVisible();
    // Read again: it is no longer waiting, so the form is gone.
    await expect(card.getByTestId("run-questions")).toHaveCount(0);
    await expect(page.getByText("Started again").first()).toBeVisible();
    expect(db.answerBodies).toHaveLength(1);
  });

  test("the open pull request notice offers its two choices, and the choice is sent as is", async ({ page }) => {
    const notice = {
      id: "q1",
      question: "A pull request is already open: work on #12, or open my own?",
      why: '#12 "Fix the sign-up form" in your-team/web already names this ticket, so I didn\'t open another. Opening my own leaves #12 open as it is.',
      suggestions: ["Work on #12", "Open my own"],
      decision: "open_pr:your-team/web#12",
    };
    const db = await mockApi(page, { runs: { "01RUNQ": asking({ questions: [notice] }) } });
    await page.goto("/runs/detail?id=01RUNQ");
    const card = page.getByTestId("run-outcome");
    await expect(card).toContainText("A pull request is already open: work on #12, or open my own?");
    const choices = card.getByRole("group", { name: "Choices" });
    await expect(choices.getByRole("button")).toHaveText(["Work on #12", "Open my own"]);
    await choices.getByRole("button", { name: "Open my own" }).click();
    await expect(choices.getByRole("button", { name: "Open my own" })).toHaveAttribute("aria-pressed", "true");
    for (const [name, width, height] of [["mobile", 390, 844], ["desktop", 1440, 900]] as const) {
      await page.setViewportSize({ width, height });
      await noSideScroll(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, `run-open-pr-choice-${name}`);
    }
    await card.getByRole("button", { name: "Send answer and continue" }).click();
    await expect.poll(() => db.answerBodies.length).toBe(1);
    expect(db.answerBodies[0]).toEqual({ answers: [{ question_id: "q1", answer: "Open my own" }] });
  });

  test("a viewer sees the questions but no answer boxes", async ({ page }) => {
    await mockApi(page, { role: "viewer" });
    await page.goto("/runs/detail?id=01RUNQ");
    const card = page.getByTestId("run-outcome");
    await expect(card.getByTestId("run-question")).toHaveCount(2);
    await expect(card).toContainText("Ask someone with member access to answer here, or reply on the Jira ticket.");
    await expect(card.getByRole("textbox")).toHaveCount(0);
    await expect(card.getByRole("button", { name: /Send answer/ })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Retry" })).toHaveCount(0);
    await expect(card.getByRole("link", { name: /See it on the ticket/ })).toBeVisible();
  });

  test("a run that asked in prose only keeps the old prompt and Retry", async ({ page }) => {
    await mockApi(page, { runs: { "01RUNQ": asking({ questions: [], questions_url: null, error: "The ticket doesn't say which page." }) } });
    await page.goto("/runs/detail?id=01RUNQ");
    const card = page.getByTestId("run-outcome");
    await expect(card).toContainText("Coderhelm needs more detail");
    await expect(card).toContainText("The ticket doesn't say which page.");
    await expect(card.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(card.getByRole("textbox")).toHaveCount(0);
  });
});

for (const [name, width, height] of [
  ["mobile", 390, 844],
  ["desktop", 1440, 900],
] as const) {
  test(`the questions read well at ${width}px (${name})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mockApi(page);
    await page.goto("/runs/detail?id=01RUNQ");
    const card = page.getByTestId("run-outcome");
    await expect(card.getByTestId("run-question")).toHaveCount(2);
    await card.getByRole("button", { name: "Production only" }).click();
    await noSideScroll(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, `run-questions-${name}`);

    await card.getByRole("textbox", { name: "Your answer to question 2" }).fill("120 per minute");
    await card.getByRole("button", { name: "Send answers and continue" }).click();
    await expect(card.getByTestId("run-answered")).toBeVisible();
    await noSideScroll(page);
    // The page as it settles: from the top, after the toast has gone.
    await expect(page.getByText(/^Sent\. Your answer is on the Jira ticket/)).toBeHidden({ timeout: 15_000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, `run-answered-${name}`);
  });
}
