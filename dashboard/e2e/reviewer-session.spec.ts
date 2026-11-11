import { expect, test, type Page, type Route } from "@playwright/test";
import {
  activityHeading,
  droppedNote,
  findingsLabel,
  isSessionId,
  kindLabel,
  reviewHref,
  sessionForReview,
  sessionHref,
  sessionLook,
  sessionSeconds,
  statusNote,
  stepOffset,
  timeline,
  triggerLabel,
} from "../src/app/reviewer/session/session";

// A review's session page: where a PR's "Coderhelm review" check links. Every
// API call is answered here; nothing reaches a real backend.

const ID = "3f2c9a1e-5b7d-4c8e-9a0b-1c2d3e4f5a6b";
// Fresh for each test: a shard can reach a test minutes after the file loads,
// and the running elapsed time is measured against the real clock.
let now = Date.now();
test.beforeEach(() => {
  now = Date.now();
});
const iso = (secsAgo: number) => new Date(now - secsAgo * 1000).toISOString();

// ---- The helpers ------------------------------------------------------------

test.describe("session helpers", () => {
  test("only a job id (a UUID) is a session id", () => {
    expect(isSessionId(ID)).toBe(true);
    expect(isSessionId(ID.toUpperCase())).toBe(true);
    for (const bad of ["", "abc", `${ID}x`, "../REVIEW#acme/web", "3f2c9a1e_5b7d_4c8e_9a0b_1c2d3e4f5a6b"]) {
      expect(isSessionId(bad), bad).toBe(false);
    }
    expect(sessionHref(ID)).toBe(`/reviewer/session?id=${ID}`);
  });

  test("every status reads as words with its tone", () => {
    expect(sessionLook("reviewing")).toEqual({ label: "Reviewing", tone: "live", live: true });
    expect(sessionLook("reviewing", "question").label).toBe("Answering");
    expect(sessionLook("done")).toEqual({ label: "Done", tone: "success" });
    expect(sessionLook("skipped").tone).toBe("muted");
    expect(sessionLook("retrying").label).toBe("Sent again");
    expect(sessionLook("failed").tone).toBe("danger");
    expect(sessionLook("stalled")).toEqual({ label: "Stalled", tone: "danger" });
    expect(sessionLook("some_new_state")).toEqual({ label: "Some new state", tone: "muted" });
    expect(statusNote("retrying")).toMatch(/own session/);
    expect(statusNote("done")).toBeNull();
  });

  test("trigger, kind and findings read as plain words", () => {
    expect(triggerLabel("label")).toBe("The review label");
    expect(triggerLabel("push")).toBe("New commits");
    expect(triggerLabel("rerequest")).toBe("Asked for again");
    expect(triggerLabel("reply")).toBe("A reply to the reviewer");
    expect(triggerLabel("new_kind")).toBe("New kind");
    expect(triggerLabel("")).toBe("Unknown");
    expect(kindLabel("question")).toBe("Answer to a comment");
    expect(kindLabel("review")).toBe("Review");
    expect(findingsLabel(undefined)).toBeNull();
    expect(findingsLabel(null)).toBeNull();
    expect(findingsLabel(0)).toBe("No findings");
    expect(findingsLabel(1)).toBe("1 finding");
    expect(findingsLabel(3)).toBe("3 findings");
  });

  test("duration runs to now while in flight and to the finish after", () => {
    const start = "2026-10-22T14:18:00+00:00";
    const end = "2026-10-22T14:20:05+00:00";
    expect(sessionSeconds({ started_at: start, finished_at: end, in_flight: false })).toBe(125);
    const t = new Date(start).getTime() + 42_000;
    expect(sessionSeconds({ started_at: start, finished_at: "", in_flight: true }, t)).toBe(42);
    expect(sessionSeconds({ started_at: start, finished_at: "", in_flight: false })).toBeNull();
    expect(sessionSeconds({ started_at: "", finished_at: end, in_flight: false })).toBeNull();
    expect(stepOffset(start, "2026-10-22T14:18:12+00:00")).toBe(12);
    expect(stepOffset(start, "not a time")).toBeNull();
  });
});

test.describe("review and session", () => {
  test("a review shows a session only when it is that review's", () => {
    const sha = "9fceb02d0ae598e95dc970b74767f19372d61af8";
    const review = { head_sha: sha, created_at: "2026-10-22T14:20:05Z" };
    const latest = { id: ID, head_sha: sha, finished_at: "2026-10-22T14:20:01Z", in_flight: false };
    // The review's own session wins whatever the PR's latest is.
    expect(sessionForReview({ ...review, session_id: ID }, null)).toBe("own");
    // Same commit, finished as the review was kept: this review's session.
    expect(sessionForReview(review, latest)).toBe("latest");
    // Another commit, still running, or hours apart: someone else's session.
    expect(sessionForReview(review, { ...latest, head_sha: "4e1a2b0" })).toBeNull();
    expect(sessionForReview(review, { ...latest, in_flight: true, finished_at: "" })).toBeNull();
    expect(sessionForReview(review, { ...latest, finished_at: "2026-10-22T18:00:00Z" })).toBeNull();
    expect(sessionForReview(review, null)).toBeNull();
    expect(reviewHref("REVIEW#acme/web#000318#2026-10-22T14:20:05Z")).toBe("/reviewer/detail?sk=REVIEW%23acme%2Fweb%23000318%232026-10-22T14%3A20%3A05Z");
  });
});

test.describe("activity helpers", () => {
  test("steps and activity groups merge into one timeline by time", () => {
    const at = (s: number) => `2026-10-22T14:18:${String(s).padStart(2, "0")}.000Z`;
    const steps = [{ at: at(0), text: "Started" }, { at: at(5), text: "Reviewing the code" }, { at: at(40), text: "Posted" }];
    const groups = [
      { started_at: at(5), title: "Checking callers" },
      { started_at: at(9), title: "Search 3 times" },
      { started_at: "not a time", title: "View 2 files" },
    ];
    const order = timeline(steps, groups).map((e) => (e.kind === "step" ? e.step.text : e.group.title));
    // A step and a group at the same second keep the step first; a group
    // without a readable time stays after the one before it.
    expect(order).toEqual(["Started", "Reviewing the code", "Checking callers", "Search 3 times", "View 2 files", "Posted"]);
    expect(timeline([], [])).toEqual([]);
  });

  test("the activity heading and the dropped note read as words", () => {
    expect(activityHeading("reviewing")).toBe("Reviewing pull request");
    expect(activityHeading("done")).toBe("Reviewed pull request");
    expect(activityHeading("reviewing", "question")).toBe("Reading the comment");
    // Over without a result reads in the past tense, never "Reviewing" under a red status.
    expect(activityHeading("failed")).toBe("Review stopped");
    expect(activityHeading("stalled")).toBe("Review stopped");
    expect(droppedNote(0)).toBeNull();
    expect(droppedNote(undefined)).toBeNull();
    expect(droppedNote(1)).toBe("1 more step wasn't recorded.");
    expect(droppedNote(12)).toBe("12 more steps weren't recorded.");
  });
});

// ---- The page ---------------------------------------------------------------

type Session = Record<string, unknown>;

function session(over: Session = {}): Session {
  return {
    id: ID,
    repo: "acme/web",
    pr_number: 318,
    pr_title: "Rate-limit the login form",
    head_sha: "9fceb02d0ae598e95dc970b74767f19372d61af8",
    trigger: "push",
    kind: "review",
    status: "reviewing",
    in_flight: true,
    attempt: 0,
    started_at: iso(90),
    finished_at: "",
    reason: "",
    verdict: "",
    findings: null,
    review_url: "",
    check_run_id: 31337000,
    review_sk: null,
    steps: [
      { at: iso(90), text: "Started reviewing `9fceb02`", detail: "" },
      { at: iso(80), text: "Read the change: 2 files changed", detail: "src/auth/login.ts\nsrc/auth/limits.ts" },
    ],
    ...over,
  };
}

interface Backend {
  calls: string[];
  /** Answers to /api/reviewer/session, in turn; the last one repeats. */
  sessions: (Session | number)[];
  role: string;
  gate?: Record<string, unknown>;
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { calls: [], sessions: [session()], role: "member", ...init };
  let served = 0;
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    db.calls.push(`${req.method()} ${p}${url.search}`);
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: "a-maintainer", email: "someone@example.com", avatar_url: "", role: db.role });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    // Security is off: no count beside it in the sidebar.
    if (p === "/api/security/overview") return json(route, { enabled: false, dry_run: true, counts: { open: 0, p0: 0, p1: 0 } });
    if (p === "/api/support/badge") return json(route, { waiting: 0, queue_open: null });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/skills/used") return json(route, { skills: [], agents: [], sources: [], standards: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "acme/web", enabled: true, ticket_source: "github" }] });
    if (p === "/api/aws-connections") return json(route, { connections: [] });
    if (p === "/api/reviewer/session") {
      const answer = db.sessions[Math.min(served, db.sessions.length - 1)];
      served += 1;
      if (typeof answer === "number") return json(route, { error: "nope" }, answer);
      return json(route, answer);
    }
    if (p === "/api/reviewer/gate" && db.gate) return json(route, db.gate);
    return json(route, { error: `Not mocked: ${req.method()} ${p}` }, 404);
  });
  return db;
}

function watchConsole(page: Page, allowFailedLoads = false) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (text.includes("net::ERR_ABORTED") || text.includes("net::ERR_FAILED")) return;
    if (allowFailedLoads && text.startsWith("Failed to load resource")) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

const sessionCalls = (db: Backend) => db.calls.filter((c) => c.startsWith("GET /api/reviewer/session"));

test("a running review shows its steps live, then its verdict and the posted review", async ({ page }) => {
  const errors = watchConsole(page);
  const done = session({
    status: "done",
    in_flight: false,
    finished_at: iso(5),
    verdict: "REQUEST_CHANGES",
    findings: 2,
    review_url: "https://github.com/acme/web/pull/318#pullrequestreview-2201",
    steps: [
      ...(session().steps as unknown[]),
      { at: iso(5), text: "Posted the review: 2 findings", detail: "" },
    ],
  });
  const db = await mockApi(page, { sessions: [session(), done] });
  await page.goto(`/reviewer/session?id=${ID}`);
  await expect(page.getByRole("heading", { level: 1, name: "Rate-limit the login form" })).toBeVisible();
  await expect(page.getByTestId("session-status")).toHaveText("Reviewing");
  await expect(page.getByRole("link", { name: /Open on GitHub/ })).toHaveAttribute("href", "https://github.com/acme/web/pull/318");
  await expect(page.getByTestId("session-facts")).toContainText("New commits");
  await expect(page.getByTestId("session-facts")).toContainText("Still running");
  await expect(page.getByRole("link", { name: /9fceb02/ })).toHaveAttribute("href", "https://github.com/acme/web/commit/9fceb02d0ae598e95dc970b74767f19372d61af8");
  const steps = page.locator('[data-testid="timeline-entry"][data-kind="step"]');
  await expect(steps).toHaveCount(2);
  await expect(steps.nth(1)).toContainText("Read the change: 2 files changed");
  // A step's detail opens on demand.
  await expect(page.getByText("src/auth/limits.ts")).toBeHidden();
  await steps.nth(1).getByText("More").click();
  await expect(page.getByText(/src\/auth\/limits\.ts/)).toBeVisible();
  await expect(page.getByTestId("session-outcome")).toHaveCount(0);

  // The page refreshes on its own while the review runs, and stops when it ends.
  await expect(page.getByTestId("session-status")).toHaveText("Done", { timeout: 10_000 });
  await expect(steps).toHaveCount(3);
  const outcome = page.getByTestId("session-outcome");
  await expect(outcome).toContainText("Changes requested");
  await expect(page.getByTestId("session-findings")).toHaveText("2 findings");
  await expect(outcome.getByRole("link", { name: /See the review on GitHub/ })).toHaveAttribute(
    "href",
    "https://github.com/acme/web/pull/318#pullrequestreview-2201",
  );
  await expect(page.getByTestId("session-duration")).toHaveText("1m 25s");
  const calls = sessionCalls(db).length;
  await page.waitForTimeout(5_000);
  expect(sessionCalls(db).length).toBe(calls);

  // Phone width: nothing scrolls sideways.
  await page.setViewportSize({ width: 390, height: 800 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test("a hidden tab stops refreshing until it is visible again", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto(`/reviewer/session?id=${ID}`);
  await expect(page.getByTestId("session-status")).toHaveText("Reviewing");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const calls = sessionCalls(db).length;
  await page.waitForTimeout(9_000);
  expect(sessionCalls(db).length).toBe(calls);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => sessionCalls(db).length).toBeGreaterThan(calls);
});

test("a skipped or retried review says why", async ({ page }) => {
  await mockApi(page, {
    sessions: [session({ status: "skipped", in_flight: false, finished_at: iso(60), reason: "Only lockfile changes." })],
  });
  await page.goto(`/reviewer/session?id=${ID}`);
  await expect(page.getByTestId("session-status")).toHaveText("Skipped");
  await expect(page.getByTestId("session-notice")).toContainText("Only lockfile changes.");
  await expect(page.getByTestId("session-outcome")).toHaveCount(0);

  await mockApi(page, { sessions: [session({ status: "retrying", in_flight: false, finished_at: iso(60), attempt: 1 })] });
  await page.goto(`/reviewer/session?id=${ID}`);
  await expect(page.getByTestId("session-status")).toHaveText("Sent again");
  await expect(page.getByTestId("session-notice")).toContainText("The new try has its own session.");
  await expect(page.getByTestId("session-facts")).toContainText("Review, try 2");
});

test("a session links back to the review it posted, and a failed one offers a new review", async ({ page }) => {
  const errors = watchConsole(page);
  const sk = "REVIEW#acme/web#000318#2026-10-22T14:20:05Z";
  await mockApi(page, { sessions: [session({ status: "done", in_flight: false, finished_at: iso(5), verdict: "APPROVE", findings: 0, review_sk: sk })] });
  await page.goto(`/reviewer/session?id=${ID}`);
  await expect(page.getByTestId("session-review-link")).toHaveAttribute("href", /\/reviewer\/detail\/?\?sk=REVIEW%23acme%2Fweb%23000318/);
  await expect(page.getByRole("button", { name: /^Review .* again$/ })).toHaveCount(0);

  // An older backend leaves review_sk out: no link.
  await mockApi(page, { sessions: [session({ status: "failed", in_flight: false, finished_at: iso(5), reason: "The model timed out." })] });
  await page.goto(`/reviewer/session?id=${ID}`);
  await expect(page.getByTestId("session-status")).toHaveText("Failed");
  await expect(page.getByTestId("session-review-link")).toHaveCount(0);
  await expect(page.getByTestId("session-activity").getByRole("heading", { name: "Review stopped" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review acme/web #318 again" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a missing, malformed or forbidden session shows nothing to read", async ({ page }) => {
  const errors = watchConsole(page, true);
  const db = await mockApi(page, { sessions: [404] });
  await page.goto(`/reviewer/session?id=${ID}`);
  await expect(page.getByText("Review not found")).toBeVisible();
  // A malformed id never reaches the API.
  const before = sessionCalls(db).length;
  await page.goto("/reviewer/session?id=../REVIEW%23acme");
  await expect(page.getByText("Review not found")).toBeVisible();
  expect(sessionCalls(db).length).toBe(before);

  await mockApi(page, { sessions: [403] });
  await page.goto(`/reviewer/session?id=${ID}`);
  await expect(page.getByText("You can't open this review")).toBeVisible();

  await mockApi(page, { sessions: [500, session()] });
  await page.goto(`/reviewer/session?id=${ID}`);
  await expect(page.getByText("Could not load the review")).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("session-status")).toHaveText("Reviewing");
  expect(errors).toEqual([]);
});

test("the PR page links to its latest review session", async ({ page }) => {
  const gate = { repo: "acme/web", pr_number: 318, pr_title: "Rate-limit the login form", auto_merge: false, status: "reviewing", group: "active", can_control: true, gate: null };
  await mockApi(page, { gate: { ...gate, session_id: ID } });
  await page.goto("/reviewer/pr?repo=acme/web&pr=318");
  const link = page.getByRole("link", { name: "View session" });
  await expect(link).toHaveAttribute("href", new RegExp(`/reviewer/session/?\\?id=${ID}`));
  await link.click();
  await expect(page.getByTestId("session-status")).toHaveText("Reviewing");

  // No session yet: no link.
  await mockApi(page, { gate: { ...gate, session_id: "" } });
  await page.goto("/reviewer/pr?repo=acme/web&pr=318");
  await expect(page.getByRole("heading", { level: 1, name: "Rate-limit the login form" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View session" })).toHaveCount(0);
});

// ---- What the reviewer did, and the overview --------------------------------

const msIso = (secsAgo: number) => new Date(now - secsAgo * 1000).toISOString();

function activity(): unknown[] {
  return [
    { kind: "note", title: "Evaluating rate-limit semantics", started_at: msIso(78), ended_at: msIso(78), text: "The limiter now counts failed logins per address.", items: [] },
    {
      kind: "search",
      title: "Search 3 times",
      started_at: msIso(76),
      ended_at: msIso(70),
      text: "",
      items: [
        { at: msIso(76), label: "checkLimit(", detail: "", failed: false },
        { at: msIso(73), label: "LOGIN_LIMIT", detail: "", failed: false },
        { at: msIso(70), label: "callers of checkLimit", detail: "", failed: false },
      ],
    },
    {
      kind: "view",
      title: "View 2 files",
      started_at: msIso(66),
      ended_at: msIso(60),
      text: "",
      items: [
        { at: msIso(66), label: "src/auth/limits.ts:1-48", detail: "", failed: false },
        { at: msIso(63), label: "src/auth/limits.ts:90-120", detail: "", failed: false },
        { at: msIso(60), label: "src/auth/login.test.ts", detail: "", failed: true },
      ],
    },
  ];
}

function overview(files: number): Record<string, unknown> {
  return {
    summary: "Rate-limits the login form by address.",
    changes: ["Counts failed logins per address", "Locks the form for a minute after five"],
    files: Array.from({ length: files }, (_, i) =>
      i === 0 ? { path: "src/auth/limits.ts", description: "Adds the per-address counter" } : { path: `src/auth/file-${i}.ts`, description: `Change ${i}` },
    ),
    files_total: files,
  };
}

test("the activity timeline shows each step live, grouped like a run log", async ({ page }) => {
  const errors = watchConsole(page);
  const running = session({ activity: activity() });
  const done = session({
    status: "done",
    in_flight: false,
    finished_at: iso(5),
    verdict: "REQUEST_CHANGES",
    findings: 2,
    activity: [
      ...activity(),
      {
        kind: "comment",
        title: "Store 2 comments",
        started_at: msIso(20),
        ended_at: msIso(20),
        text: "",
        items: [
          { at: msIso(20), label: "src/auth/limits.ts:31", detail: "The counter never resets", failed: false },
          { at: msIso(20), label: "src/auth/login.ts:12", detail: "Missing test for the lockout", failed: false },
        ],
      },
    ],
    activity_dropped: 3,
    steps: [...(session().steps as unknown[]), { at: iso(5), text: "Posted the review on GitHub", detail: "" }],
  });
  // Running until the test says the review is done, whatever the poll timing.
  const db = await mockApi(page, { sessions: [running] });
  await page.goto(`/reviewer/session?id=${ID}`);

  const card = page.getByTestId("session-activity");
  await expect(card.getByRole("heading", { name: "Reviewing pull request" })).toBeVisible();
  await expect(page.getByTestId("activity-elapsed")).toHaveText(/^1m \d+s$/);
  const entries = card.getByTestId("timeline-entry");
  // Two setup steps, then a note, the searches and the file views.
  await expect(entries).toHaveCount(5);
  await expect(entries.nth(0)).toHaveAttribute("data-kind", "step");
  await expect(entries.nth(2)).toHaveAttribute("data-kind", "note");
  await expect(entries.nth(2)).toContainText("Evaluating rate-limit semantics");
  await expect(entries.nth(2)).toContainText("The limiter now counts failed logins per address.");
  // A note is a heading over what the reviewer did for it, as on Copilot's session log.
  await expect(entries.nth(2).getByRole("heading", { level: 3, name: "Evaluating rate-limit semantics" })).toBeVisible();
  await expect(entries.nth(2).getByTestId("timeline-entry")).toHaveCount(2);
  // Step text reads code as code, not backticks.
  await expect(entries.nth(0).locator("code", { hasText: "9fceb02" })).toBeVisible();
  await expect(entries.nth(0)).not.toContainText("`");
  // Only the newest entry runs.
  await expect(card.locator('[data-state="running"]')).toHaveCount(1);
  await expect(entries.nth(4)).toHaveAttribute("data-state", "running");

  // A group is one line until opened; then it lists its queries or files.
  const search = entries.nth(3);
  await expect(search).toContainText("Search 3 times");
  await expect(search.getByText("LOGIN_LIMIT")).toBeHidden();
  await search.getByText("Search 3 times").click();
  await expect(search.getByText("LOGIN_LIMIT")).toBeVisible();
  await expect(search.getByText("callers of checkLimit")).toBeVisible();
  const views = entries.nth(4);
  await expect(views).toContainText("1 failed");
  await views.getByText("View 2 files").click();
  await expect(views.getByText("src/auth/limits.ts:90-120")).toBeVisible();
  await expect(views.getByTestId("activity-items").getByRole("listitem").nth(2)).toContainText("(failed)");

  // The whole timeline folds away and back.
  await card.getByRole("heading", { name: "Reviewing pull request" }).click();
  await expect(page.getByTestId("session-timeline")).toBeHidden();
  await card.getByRole("heading", { name: "Reviewing pull request" }).click();
  await expect(page.getByTestId("session-timeline")).toBeVisible();

  // Once the review ends: done, the comments it kept, the step it posted with.
  db.sessions.push(done);
  await expect(card.getByRole("heading", { name: "Reviewed pull request" })).toBeVisible({ timeout: 15_000 });
  await expect(card.locator('[data-state="running"]')).toHaveCount(0);
  await expect(entries).toHaveCount(7);
  const comments = entries.nth(5);
  await expect(comments).toHaveAttribute("data-kind", "comment");
  await comments.getByText("Store 2 comments").click();
  await expect(comments).toContainText("src/auth/limits.ts:31");
  await expect(comments).toContainText("The counter never resets");
  await expect(entries.nth(6)).toContainText("Posted the review on GitHub");
  await expect(page.getByTestId("activity-elapsed")).toHaveText("1m 25s");
  await expect(page.getByTestId("activity-dropped")).toHaveText("3 more steps weren't recorded.");
  expect(errors).toEqual([]);
});

test("the overview says what the PR does, file by file", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page, { sessions: [session({ status: "done", in_flight: false, finished_at: iso(5), verdict: "APPROVE", findings: 0, overview: overview(3) })] });
  await page.goto(`/reviewer/session?id=${ID}`);
  const card = page.getByTestId("session-overview");
  await expect(card.getByRole("heading", { name: "PR overview" })).toBeVisible();
  await expect(card).toContainText("Rate-limits the login form by address.");
  await expect(page.getByTestId("overview-changes").getByRole("listitem")).toHaveText([
    "Counts failed logins per address",
    "Locks the form for a minute after five",
  ]);
  await expect(card).toContainText("3 changed files");
  const table = card.getByRole("table", { name: "Reviewed changes" });
  await expect(table.getByRole("columnheader")).toHaveText(["File", "Description"]);
  await expect(table.getByRole("row")).toHaveCount(4);
  await expect(table.getByRole("row").nth(1)).toContainText("src/auth/limits.ts");
  await expect(table.getByRole("row").nth(1)).toContainText("Adds the per-address counter");
  await expect(card.getByText("Show a summary per file")).toHaveCount(0);

  // A session without an overview (an older review, or one still running) shows none.
  await mockApi(page, { sessions: [session()] });
  await page.goto(`/reviewer/session?id=${ID}`);
  await expect(page.getByTestId("session-status")).toHaveText("Reviewing");
  await expect(page.getByTestId("session-overview")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the file table fits the paths, reads code as code, and stacks on a phone", async ({ page }) => {
  const errors = watchConsole(page);
  const LONG = "src/features/reporting/dashboards/widgets/table/columns/use-fetch-columns-with-a-long-name.ts";
  await mockApi(page, {
    sessions: [
      session({
        status: "done",
        in_flight: false,
        finished_at: iso(5),
        verdict: "APPROVE",
        findings: 0,
        activity: [{ kind: "note", title: "Checking `PHONE_BAR_ITEMS` order", started_at: msIso(78), ended_at: msIso(78), text: "It ends with `More`.", items: [] }],
        overview: {
          summary: "Moves the phone bar's extra links into a `More` menu.",
          changes: ["Adds `PHONE_BAR_ITEMS` with the links in order", "Keeps `fetchColumns` as it was"],
          files: [
            { path: "src/nav/phone-bar.tsx", description: "Reads the links from `PHONE_BAR_ITEMS` and renders the last three inside a `More` menu, so the bar fits a phone screen." },
            { path: "src/nav/items.ts", description: "Adds `PHONE_BAR_ITEMS`." },
            { path: LONG, description: "No behaviour change: `fetchColumns` is only renamed in a comment." },
          ],
          files_total: 3,
        },
      }),
    ],
  });
  await page.goto(`/reviewer/session?id=${ID}`);
  const card = page.getByTestId("session-overview");
  const table = card.getByRole("table", { name: "Reviewed changes" });
  await expect(table.getByRole("columnheader")).toHaveText(["File", "Description"]);
  await expect(table.getByRole("row")).toHaveCount(4);

  // Backticks are code everywhere on the page: the summary, the changes, each file's line, the notes.
  for (const word of ["More", "PHONE_BAR_ITEMS", "fetchColumns"]) await expect(card.locator("code", { hasText: word }).first()).toBeVisible();
  await expect(table.getByRole("row").nth(1).getByRole("cell").nth(1).locator("code")).toHaveText(["PHONE_BAR_ITEMS", "More"]);
  await expect(card).not.toContainText("`");
  await expect(page.getByTestId("session-activity").getByRole("heading", { level: 3 }).locator("code")).toHaveText("PHONE_BAR_ITEMS");
  await expect(page.getByTestId("session-activity")).not.toContainText("`");

  // The directory is muted and the file name plain; the full path is the hover text.
  const longCell = table.getByRole("row").nth(3).getByRole("cell").first();
  await expect(longCell.locator("[title]")).toHaveAttribute("title", LONG);
  await expect(longCell).toHaveText(LONG);

  // The path column is as wide as its paths, at most two fifths: the description gets the rest.
  const widths = async () => {
    const row = table.getByRole("row").nth(1);
    const [file, desc] = await Promise.all([row.getByRole("cell").nth(0).boundingBox(), row.getByRole("cell").nth(1).boundingBox()]);
    const all = await table.boundingBox();
    return { file: file!.width, desc: desc!.width, all: all!.width };
  };
  const desk = await widths();
  expect(desk.file).toBeLessThanOrEqual(desk.all * 0.4 + 1);
  expect(desk.desc).toBeGreaterThan(desk.all * 0.55);

  // On a phone each row stacks: the path, then its description, nothing sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(table.getByRole("columnheader").first()).toBeHidden();
  // The header row is gone on a phone, so the rows are the files alone.
  await expect(table.getByRole("row")).toHaveCount(3);
  const row = table.getByRole("row").filter({ hasText: LONG });
  const [path, desc] = await Promise.all([row.getByRole("cell").nth(0).boundingBox(), row.getByRole("cell").nth(1).boundingBox()]);
  expect(desc!.y).toBeGreaterThanOrEqual(path!.y + path!.height - 1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test("a large PR's file table starts folded, and nothing scrolls sideways on a phone", async ({ page }) => {
  const big = overview(20);
  big.files_total = 140;
  await mockApi(page, { sessions: [session({ status: "done", in_flight: false, finished_at: iso(5), verdict: "APPROVE", overview: big, activity: activity() })] });
  await page.goto(`/reviewer/session?id=${ID}`);
  const card = page.getByTestId("session-overview");
  await expect(card).toContainText("140 changed files");
  await expect(card).toContainText("And 120 more files.");
  const table = card.getByRole("table", { name: "Reviewed changes" });
  await expect(table).toBeHidden();
  await card.getByText("Show a summary per file").click();
  await expect(table).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(21);

  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByTestId("timeline-entry").nth(4).getByText("View 2 files").click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
