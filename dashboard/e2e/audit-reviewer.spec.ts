import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Reviewer list, review detail, reviewer settings and releases. Every API call
// is answered here; nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

function review(over: Record<string, unknown> = {}) {
  return {
    sk: "REVIEW#your-team/web#000101#2026-01-02T10:00:00Z",
    repo: "your-team/web",
    pr_number: 101,
    head_sha: "abcdef1234567",
    verdict: "APPROVE",
    risk: "LOW",
    body: "## Summary\n\nLooks good. One small note on the retry loop.",
    posted_as: "coderhelm[bot]",
    trigger: "labeled",
    action_summary: "",
    thumbs_up: 2,
    thumbs_down: 0,
    rating_comments: [{ by: "a-person", text: "Right call on the retry.", rating: "up", at: iso(30) }],
    created_at: iso(5),
    ...over,
  };
}

const REVIEWS = [
  review(),
  review({ sk: "REVIEW#your-team/web#000101#2026-01-01T10:00:00Z", verdict: "REQUEST_CHANGES", risk: "HIGH", trigger: "synchronize", created_at: iso(120) }),
  review({ sk: "REVIEW#your-team/backend#000055#2026-01-01T09:00:00Z", repo: "your-team/backend", pr_number: 55, verdict: "QUESTION", risk: "N/A", trigger: "rerequest", thumbs_up: 0, thumbs_down: 1, created_at: iso(300) }),
];

// Where the reviewer is with each PR (GET /api/reviewer/live): two in flight,
// two waiting on auto-merge, one merged.
type LiveRow = { repo: string; pr_number: number; [field: string]: unknown };

function livePrs(): LiveRow[] {
  return [
    {
      repo: "your-team/web", pr_number: 120, pr_title: "Add retries to the payment client", status: "reviewing", group: "active",
      updated_at: iso(1), review: { phase: "reviewing", kind: "review", trigger: "labeled", attempt: 0, reason: "" }, gate: null,
    },
    {
      repo: "your-team/backend", pr_number: 77, pr_title: "Move nightly jobs to the new queue", status: "queued", group: "active",
      updated_at: iso(0), review: { phase: "queued", kind: "review", trigger: "synchronize" }, gate: null,
    },
    {
      repo: "your-team/web", pr_number: 101, pr_title: "Faster checkout with a clearer receipt page", status: "waiting_people", group: "waiting",
      updated_at: iso(4), review: { phase: "done", kind: "review", trigger: "labeled" },
      gate: {
        state: "waiting_approval", detail: "", head_sha: "abcdef1234567",
        checklist: [{ mark: "done", text: "CoderHelm approved" }, { mark: "waiting", text: "Waiting for a person's approval" }],
      },
    },
    {
      repo: "your-team/web", pr_number: 96, pr_title: "Upgrade the image pipeline", status: "ci_failing", group: "waiting",
      updated_at: iso(40), review: null,
      gate: {
        state: "blocked_ci", detail: "",
        checklist: [
          { mark: "done", text: "CoderHelm approved" }, { mark: "done", text: "Approved by @a-person" },
          { mark: "blocked", text: "CI failing: build, e2e (chromium)" },
        ],
      },
    },
    {
      repo: "your-team/backend", pr_number: 55, pr_title: "Explain the cache expiry", status: "merged", group: "done",
      updated_at: iso(200), review: { phase: "done" }, gate: { state: "merged", checklist: [] },
    },
  ];
}

const RELEASES = [
  {
    repo: "your-team/web", tag: "v2.3.0", prev_tag: "v2.2.9", pr_count: 4, headline: "Faster checkout and a clearer receipt page",
    entry_md: "Checkout is faster.", github_release_md: "## Changes\n- Faster checkout (#101)\n- Clearer receipt (#104)", unclear: "",
    github_release_url: "https://github.com/your-team/web/releases/tag/v2.3.0", confluence_url: "", email_sent_at: iso(60), updated_at: iso(60),
  },
  {
    repo: "your-team/backend", tag: "v1.4.2", prev_tag: "v1.4.1", pr_count: 1, headline: "Nightly jobs move to the new queue",
    entry_md: "Nightly jobs run on the new queue.", github_release_md: "## Changes\n- New queue for nightly jobs (#77)", unclear: "",
    github_release_url: "https://github.com/your-team/backend/releases/tag/v1.4.2", confluence_url: "", email_sent_at: "", updated_at: iso(180),
    last_error: "Confluence publish failed (403): no permission on the space", failed_at: iso(170),
  },
  {
    repo: "your-team/web", tag: "v2.2.9", prev_tag: "v2.2.8", pr_count: 2, headline: "Saved carts survive a sign out",
    entry_md: "Carts are kept.", github_release_md: "- Keep carts (#96)", unclear: "",
    github_release_url: "https://github.com/your-team/web/releases/tag/v2.2.9", confluence_url: "", email_sent_at: iso(3000), updated_at: iso(3000),
  },
];

const CONFIG = {
  enabled: true, label: "ch-review", killed: false, instructions: "Watch database changes.", auto_merge: false, merge_method: "squash",
  require_human_approval: true, auto_tag: false, tag_mode: "semver", tag_prefix: "v", tag_batch_minutes: 15, health_check: false,
  verify_tests: false, require_tests: false, auto_labels: false, auto_label_allow: "", auto_label_requires: "", auto_label_guide: "",
  release_notes: false, release_notes_branch: "", release_notes_confluence_space: "", release_notes_confluence_parent_id: "",
  release_notes_confluence_container: "Changelog", release_notes_email_webhook_url: "", release_notes_email_webhook_secret_set: false,
  release_notes_guide: "", release_notes_instructions: "", graph_enabled: false, deploy_label: "", health_log_groups: [],
  reminders_enabled: false, teams_webhook_url: "", reminder_cooldown_hours: 4,
};

/** Release-notes settings per repo (merged over CONFIG). */
const RELEASE_SETTINGS: Record<string, Record<string, unknown>> = {
  "your-team/web": { release_notes: true, release_notes_email_webhook_url: "https://hooks.example.com/release" },
  "your-team/backend": { release_notes: true, release_notes_confluence_space: "ENG", release_notes_confluence_parent_id: "12345" },
};

interface Backend {
  calls: string[];
  bodies: Record<string, unknown>[];
  role: string;
  empty: boolean;
  failList: boolean;
  failMore: boolean;
  failConfig: boolean;
  failOrg: boolean;
  failDetail: boolean;
  missingDetail: boolean;
  /** What GET /api/reviewer/live answers. */
  live: LiveRow[];
  /** The backend has no live endpoint yet (404). */
  noLive: boolean;
  /** Extra reviews listed before the fixtures (a review that just finished). */
  newReviews: ReturnType<typeof review>[];
  /** What GET /api/releases/pending answers. */
  pending: { waiting: unknown[]; blocked: unknown[] };
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = {
    calls: [], bodies: [], role: "admin", empty: false, failList: false, failMore: false,
    failConfig: false, failOrg: false, failDetail: false, missingDetail: false, live: livePrs(), noLive: false,
    newReviews: [], pending: { waiting: [], blocked: [] }, ...init,
  };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    db.calls.push(`${req.method()} ${p}${url.search}`);
    if (req.method() !== "GET") db.bodies.push(JSON.parse(req.postData() || "{}"));
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "someone@example.com", avatar_url: "", role: db.role });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/skills/used") return json(route, { skills: [], agents: [], sources: [], standards: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "your-team/web", enabled: true, ticket_source: "github" }, { name: "your-team/backend", enabled: true, ticket_source: "github" }] });
    if (p === "/api/aws-connections") return json(route, { connections: [] });
    if (p === "/api/reviewer/reviews") {
      const cursor = url.searchParams.get("cursor");
      if (cursor) return db.failMore ? json(route, { error: "boom" }, 500) : json(route, { reviews: [], next: null });
      if (db.failList) return json(route, { error: "boom" }, 500);
      if (db.empty) return json(route, { reviews: [], next: null });
      const repo = url.searchParams.get("repo");
      const all = [...db.newReviews, ...REVIEWS];
      const list = repo ? all.filter((r) => r.repo === repo) : all;
      return json(route, { reviews: list, next: db.failMore ? "page2" : null });
    }
    if (p === "/api/reviewer/live") {
      if (db.noLive) return route.fulfill({ status: 404, body: "" });
      if (db.empty) return json(route, { prs: [] });
      const repo = url.searchParams.get("repo");
      return json(route, { prs: repo ? db.live.filter((r) => r.repo === repo) : db.live });
    }
    if (p === "/api/reviewer/review") {
      if (db.failDetail) return json(route, { error: "boom" }, 500);
      if (db.missingDetail) return route.fulfill({ status: 404, body: "" });
      const sk = url.searchParams.get("sk");
      const r = REVIEWS.find((x) => x.sk === sk);
      return r ? json(route, r) : route.fulfill({ status: 404, body: "" });
    }
    if (p === "/api/reviewer/review/rate") return route.fulfill({ status: 200, body: "" });
    if (p === "/api/reviewer/re-review") return json(route, { status: "queued" });
    if (p === "/api/reviewer/org-config") {
      if (req.method() === "PUT") return route.fulfill({ status: 200, body: "" });
      if (db.failOrg) return json(route, { error: "boom" }, 500);
      return json(route, { instructions: "Never log secrets." });
    }
    if (p.startsWith("/api/reviewer/config/")) {
      if (req.method() === "PUT") return db.role === "member" ? route.fulfill({ status: 403, body: "" }) : route.fulfill({ status: 200, body: "" });
      if (db.failConfig) return json(route, { error: "boom" }, 500);
      // The releases page reads each repo's release-notes settings; other pages get the plain fixture.
      const repo = decodeURIComponent(p.slice("/api/reviewer/config/".length));
      const referer = req.headers()["referer"] || "";
      return json(route, referer.includes("/releases") ? { ...CONFIG, ...RELEASE_SETTINGS[repo] } : CONFIG);
    }
    if (p === "/api/releases") {
      if (url.searchParams.get("cursor")) return db.failMore ? json(route, { error: "boom" }, 500) : json(route, { releases: [], next: null });
      if (db.failList) return json(route, { error: "boom" }, 500);
      if (db.empty) return json(route, { releases: [], next: null });
      const repo = url.searchParams.get("repo");
      return json(route, { releases: repo ? RELEASES.filter((r) => r.repo === repo) : RELEASES, next: db.failMore ? "page2" : null });
    }
    if (p === "/api/releases/send") return json(route, { status: "queued" });
    if (p === "/api/releases/pending") return json(route, db.pending);
    if (p === "/api/releases/now") return json(route, { status: "queued" });
    return json(route, { error: `Not mocked: ${req.method()} ${p}` }, 404);
  });
  return db;
}

/** Console errors and page errors. Deliberately failed responses are logged by the browser; tests that cause them pass `allowFailedLoads`. */
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

// ── Reviewer list ────────────────────────────────────────────────────

test("the reviewer list shows one row per PR: title first, verdict as a badge, what started it in words", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/reviewer");
  await expect(page.getByRole("heading", { level: 1, name: "Reviewer" })).toBeVisible();
  const prLink = page.getByRole("link", { name: "Faster checkout with a clearer receipt page" });
  await expect(prLink).toHaveAttribute("href", /\/reviewer\/detail\/?\?sk=REVIEW%23your-team%2Fweb%23000101/);
  const row = page.getByTestId("reviewer-pr").filter({ has: prLink });
  await expect(row.getByText("your-team/web #101")).toBeVisible();
  await expect(row.getByText("Approved")).toBeVisible();
  await expect(row.getByText("Low risk")).toBeVisible();
  await expect(row.getByText("Label added")).toBeVisible();
  await expect(page.getByText("labeled", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Asked again")).toBeVisible();
  // The state in short words, not the review's boilerplate.
  await expect(row.getByText("Auto-merge armed · waiting for 1 approval")).toBeVisible();
  // The earlier review of the same PR opens under it, with a named toggle.
  const toggle = row.getByRole("button", { name: /Show details and earlier reviews of your-team\/web #101/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toHaveText(/2 reviews/);
  await toggle.click();
  await expect(row.getByRole("button", { name: /Hide details/ })).toHaveAttribute("aria-expanded", "true");
  await expect(row.getByRole("link", { name: "New commits" })).toBeVisible();
  await expect(row.getByText("High risk")).toBeVisible();
  await expect(row.getByText("Waiting for a person's approval")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Pull request number" })).toBeVisible();
  await shot(page, "audit-reviewer-list");
  expect(errors).toEqual([]);
});

test("PRs being reviewed now sit at the top with their live status", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/reviewer");
  const inReview = page.getByRole("region", { name: /In review now/ });
  const waiting = page.getByRole("region", { name: /Waiting/ });
  const done = page.getByRole("region", { name: /Done/ });
  // A first review still running has no review page yet: it links to the PR.
  const running = inReview.getByTestId("reviewer-pr").filter({ hasText: "Add retries to the payment client" });
  await expect(running).toHaveAttribute("data-status", "reviewing");
  await expect(running.getByText("Reviewing", { exact: true })).toBeVisible();
  await expect(running.getByText("Reading the diff and writing the review…")).toBeVisible();
  await expect(running.getByRole("link", { name: "Add retries to the payment client" })).toHaveAttribute(
    "href",
    "https://github.com/your-team/web/pull/120",
  );
  const queued = inReview.getByTestId("reviewer-pr").filter({ hasText: "Move nightly jobs to the new queue" });
  await expect(queued.getByText("Queued", { exact: true })).toBeVisible();
  await expect(queued.getByText("Waits a minute in case more commits land")).toBeVisible();
  // Waiting on people and on CI; the CI failure names the checks.
  await expect(waiting.getByTestId("reviewer-pr")).toHaveCount(2);
  const failing = waiting.getByTestId("reviewer-pr").filter({ hasText: "Upgrade the image pipeline" });
  await expect(failing.getByText("CI failing", { exact: true })).toBeVisible();
  await expect(failing.getByText("Auto-merge armed · CI failing: build, e2e (chromium)")).toBeVisible();
  await expect(done.getByText("Merged", { exact: true })).toBeVisible();
  // In-flight first in the page order too.
  await expect(page.getByTestId("reviewer-pr").first()).toHaveAttribute("data-status", /reviewing|queued/);
  await shot(page, "audit-reviewer-live");
  // The tabs filter to one group.
  await page.getByRole("button", { name: "In review 2" }).click();
  await expect(page.getByTestId("reviewer-pr")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Faster checkout with a clearer receipt page" })).toHaveCount(0);
  await shot(page, "audit-reviewer-tab-in-review");
  await page.getByRole("button", { name: "Waiting 2" }).click();
  await expect(page.getByTestId("reviewer-pr")).toHaveCount(2);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("reviewer-pr")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("the status refreshes on its own while a review runs, and the finished review appears", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/reviewer");
  const running = page.getByTestId("reviewer-pr").filter({ hasText: "Add retries to the payment client" });
  await expect(running).toHaveAttribute("data-status", "reviewing");
  const liveCalls = () => db.calls.filter((c) => c.startsWith("GET /api/reviewer/live")).length;
  const before = liveCalls();
  // The review finishes: the live record says reviewed and a review record exists.
  db.live = db.live.map((p) => (p.pr_number === 120 ? { ...p, status: "reviewed", group: "done", review: { phase: "done", kind: "review" } } : p));
  db.newReviews = [
    review({ sk: "REVIEW#your-team/web#000120#2026-01-03T10:00:00Z", pr_number: 120, verdict: "REQUEST_CHANGES", risk: "MEDIUM", created_at: iso(0) }),
  ];
  await expect(running).toHaveAttribute("data-status", "reviewed", { timeout: 25_000 });
  expect(liveCalls()).toBeGreaterThan(before);
  await expect(running.getByText("Changes requested")).toBeVisible();
  await expect(running.getByRole("link", { name: "Add retries to the payment client" })).toHaveAttribute(
    "href",
    /\/reviewer\/detail\/?\?sk=REVIEW%23your-team%2Fweb%23000120/,
  );
  expect(errors).toEqual([]);
});

test("queueing a review from a row refreshes the status at once", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/reviewer");
  const merged = page.getByTestId("reviewer-pr").filter({ hasText: "Explain the cache expiry" });
  await expect(merged).toHaveAttribute("data-status", "merged");
  db.live = db.live.map((p) => (p.pr_number === 55 ? { ...p, status: "queued", group: "active", review: { phase: "queued", trigger: "rerequest" } } : p));
  await merged.getByRole("button", { name: "Review your-team/backend #55 again" }).click();
  await expect(merged).toHaveAttribute("data-status", "queued");
  await expect(page.getByRole("region", { name: /In review now/ }).getByText("Explain the cache expiry")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a backend without live status still lists the reviews and does not poll", async ({ page }) => {
  const errors = watchConsole(page, true);
  const db = await mockApi(page, { noLive: true });
  await page.goto("/reviewer");
  await expect(page.getByRole("link", { name: "Pull request #101" })).toBeVisible();
  await expect(page.getByText("Approved").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /In review/ })).toHaveCount(0);
  await expect(page.getByTestId("reviewer-pr")).toHaveCount(2);
  await shot(page, "audit-reviewer-no-live");
  const liveCalls = () => db.calls.filter((c) => c.startsWith("GET /api/reviewer/live")).length;
  const asked = liveCalls();
  await page.waitForTimeout(16_000);
  expect(liveCalls()).toBe(asked);
  expect(errors).toEqual([]);
});

test("a failed reviews load says so and retries, instead of claiming there are none", async ({ page }) => {
  const errors = watchConsole(page, true);
  const db = await mockApi(page, { failList: true });
  await page.goto("/reviewer");
  await expect(page.getByText("Could not load reviews")).toBeVisible();
  await expect(page.getByText("No reviews yet")).toHaveCount(0);
  await shot(page, "audit-reviewer-list-error");
  db.failList = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("link", { name: "Faster checkout with a clearer receipt page" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("an empty reviewer list points to the settings", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page, { empty: true });
  await page.goto("/reviewer");
  await expect(page.getByText("No reviews yet")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Configure" }).last()).toHaveAttribute("href", /\/reviewer\/config/);
  await shot(page, "audit-reviewer-empty");
  expect(errors).toEqual([]);
});

test("a failed next page of reviews says so and offers to try again", async ({ page }) => {
  const errors = watchConsole(page, true);
  await mockApi(page, { failMore: true });
  await page.goto("/reviewer");
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByText("The next page did not load.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("?repo= opens the reviewer list filtered to that repo", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/reviewer?repo=your-team%2Fbackend");
  await expect(page.getByRole("link", { name: "Explain the cache expiry" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Faster checkout with a clearer receipt page" })).toHaveCount(0);
  // The repo is the filter, so rows show only the PR number.
  await expect(page.getByTestId("reviewer-pr").filter({ hasText: "Explain the cache expiry" }).getByText("#55", { exact: true })).toBeVisible();
  expect(db.calls.filter((c) => c.startsWith("GET /api/reviewer/reviews")).every((c) => c.includes("repo=your-team%2Fbackend"))).toBe(true);
  expect(db.calls.filter((c) => c.startsWith("GET /api/reviewer/live")).every((c) => c.includes("repo=your-team%2Fbackend"))).toBe(true);
  expect(errors).toEqual([]);
});


// ── Review detail ────────────────────────────────────────────────────

test("a review page shows the verdict, risk and trigger in words and rates once", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto(`/reviewer/detail?sk=${encodeURIComponent(REVIEWS[0].sk)}`);
  await expect(page.getByRole("heading", { level: 1, name: /your-team\/web #101/ })).toBeVisible();
  await expect(page.getByText("Approved")).toBeVisible();
  await expect(page.getByText("Low risk")).toBeVisible();
  await expect(page.getByText(/started by: label added/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Leave a note so the reviewer learns" })).toBeVisible();
  await shot(page, "audit-reviewer-detail");
  const helpful = page.getByRole("button", { name: /Helpful/ }).first();
  await helpful.click();
  await expect(page.getByText("Thanks, your rating is saved.")).toBeVisible();
  // A second press would count the same person twice.
  await expect(helpful).toBeDisabled();
  await expect(page.getByRole("button", { name: /Not helpful/ })).toBeDisabled();
  expect(db.bodies.filter((b) => b.rating === "up")).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("a review page with no ?sk says the link is wrong instead of loading forever", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/reviewer/detail");
  await expect(page.getByText("Review not found")).toBeVisible();
  await expect(page.getByRole("link", { name: "See all reviews" })).toHaveAttribute("href", /\/reviewer\/?$/);
  expect(db.calls.some((c) => c.includes("/api/reviewer/review?"))).toBe(false);
  await shot(page, "audit-reviewer-detail-missing");
  expect(errors).toEqual([]);
});

test("a review that does not exist says not found", async ({ page }) => {
  const errors = watchConsole(page, true);
  await mockApi(page, { missingDetail: true });
  await page.goto("/reviewer/detail?sk=REVIEW%23gone");
  await expect(page.getByText("Review not found")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a review that fails to load offers to try again", async ({ page }) => {
  const errors = watchConsole(page, true);
  const db = await mockApi(page, { failDetail: true });
  await page.goto(`/reviewer/detail?sk=${encodeURIComponent(REVIEWS[0].sk)}`);
  await expect(page.getByText("Could not load this review")).toBeVisible();
  db.failDetail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /your-team\/web #101/ })).toBeVisible();
  expect(errors).toEqual([]);
});

// ── Reviewer settings ────────────────────────────────────────────────

test("reviewer settings load for a repo, with labelled fields and switches", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/reviewer/config?repo=your-team%2Fweb");
  await expect(page.getByRole("heading", { level: 1, name: "Reviewer settings" })).toBeVisible();
  await expect(page.getByRole("switch", { name: /Enable reviewer for this repo/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("textbox", { name: "Trigger label" })).toHaveValue("ch-review");
  await expect(page.getByRole("textbox", { name: "Review standards for every repo" })).toHaveValue("Never log secrets.");
  await page.getByRole("button", { name: /Actions after approval/ }).click();
  await expect(page.getByRole("combobox", { name: "Merge method" })).toBeVisible();
  await shot(page, "audit-reviewer-config");
  expect(errors).toEqual([]);
});

test("reviewer settings with no repo picked explain what to do", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/reviewer/config");
  await expect(page.getByText(/Pick a repository above/)).toBeVisible();
  await shot(page, "audit-reviewer-config-empty");
  expect(errors).toEqual([]);
});

test("a failed settings load hides the form so defaults cannot overwrite saved settings", async ({ page }) => {
  const errors = watchConsole(page, true);
  const db = await mockApi(page, { failConfig: true });
  await page.goto("/reviewer/config?repo=your-team%2Fweb");
  await expect(page.getByText("Could not load the settings for your-team/web")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save settings" })).toHaveCount(0);
  await shot(page, "audit-reviewer-config-error");
  db.failConfig = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("textbox", { name: "Trigger label" })).toHaveValue("ch-review");
  expect(db.calls.some((c) => c.startsWith("PUT /api/reviewer/config/"))).toBe(false);
  expect(errors).toEqual([]);
});

test("a failed load of the shared review standards turns their save off", async ({ page }) => {
  const errors = watchConsole(page, true);
  const db = await mockApi(page, { failOrg: true });
  await page.goto("/reviewer/config");
  await expect(page.getByText("Could not load the review standards")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save standards" })).toHaveCount(0);
  db.failOrg = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("textbox", { name: "Review standards for every repo" })).toHaveValue("Never log secrets.");
  expect(errors).toEqual([]);
});

test("a Teams webhook that is not https is caught before saving", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/reviewer/config?repo=your-team%2Fweb");
  await page.getByRole("switch", { name: /Remind reviewers in Microsoft Teams/ }).click();
  await page.getByRole("textbox", { name: "Teams incoming webhook URL" }).fill("http://example.com/hook");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("The Teams webhook URL must start with https://.")).toBeVisible();
  expect(db.calls.some((c) => c.startsWith("PUT /api/reviewer/config/"))).toBe(false);
  await page.getByRole("textbox", { name: "Teams incoming webhook URL" }).fill("https://example.com/hook");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Reviewer settings saved")).toBeVisible();
  expect(db.calls.some((c) => c.startsWith("PUT /api/reviewer/config/your-team/web"))).toBe(true);
  expect(errors).toEqual([]);
});

test("members see reviewer settings read only, without save buttons that would fail", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page, { role: "member" });
  await page.goto("/reviewer/config?repo=your-team%2Fweb");
  await expect(page.getByText("You can view these settings")).toBeVisible();
  await expect(page.getByRole("switch", { name: /Enable reviewer for this repo/ })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Trigger label" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save settings" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save standards" })).toHaveCount(0);
  await shot(page, "audit-reviewer-config-member");
  expect(errors).toEqual([]);
});

// ── Releases ─────────────────────────────────────────────────────────

test("releases list each tag and open its notes and actions", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/releases");
  await expect(page.getByRole("heading", { level: 1, name: "Releases" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Reviewer settings" })).toHaveAttribute("href", /\/reviewer\/config/);
  const row = page.getByRole("button", { name: /your-team\/web v2\.3\.0/ });
  await expect(row).toHaveAttribute("aria-expanded", "false");
  // Counts read as words: "1 PR", "4 PRs"; the summary is not cut to one line.
  await expect(row).toContainText("4 PRs");
  await expect(page.getByRole("button", { name: /your-team\/backend v1\.4\.2/ })).toContainText("1 PR");
  await expect(page.getByText("1 PRs")).toHaveCount(0);
  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", { name: /GitHub release/ })).toHaveAttribute("href", "https://github.com/your-team/web/releases/tag/v2.3.0");
  await expect(page.getByRole("link", { name: /Changes since v2\.2\.9/ })).toHaveAttribute("href", "https://github.com/your-team/web/compare/v2.2.9...v2.3.0");
  await expect(page.getByRole("link", { name: /^#104/ })).toHaveAttribute("href", "https://github.com/your-team/web/pull/104");
  await expect(page.getByRole("button", { name: "Rewrite the notes" })).toBeVisible();
  await page.getByRole("button", { name: "GitHub release", exact: true }).click();
  await expect(page.getByText("Clearer receipt (#104)")).toBeVisible();
  await page.getByRole("button", { name: "Send the email again" }).click();
  await expect(page.getByText("Email queued for your-team/web v2.3.0")).toBeVisible();
  expect(db.bodies).toContainEqual({ repo: "your-team/web", tag: "v2.3.0", resend: "email" });
  await shot(page, "audit-releases");
  expect(errors).toEqual([]);
});

test("releases are grouped by repo, without the repo name on every row or monospace pickers", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/releases");
  await expect(page.getByRole("heading", { level: 2, name: /^web/ })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /^backend/ })).toBeVisible();
  const web = page.getByRole("region", { name: /^web/ });
  await expect(web.getByTestId("release-row")).toHaveCount(2);
  // The repo is the group heading; rows show only the version.
  const shown = await web.getByTestId("release-row").first().evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll(".sr-only, [title]").forEach((n) => n.remove());
    return copy.textContent || "";
  });
  expect(shown).not.toContain("your-team/web");
  // Only tags and versions are monospace.
  const filter = page.getByTestId("releases-filter");
  const font = await filter.getByRole("button", { name: "All repos" }).evaluate((el) => getComputedStyle(el).fontFamily);
  expect(font).not.toMatch(/mono/i);
  // One filter: picking a repo shows only its releases, without group headings.
  await filter.getByRole("button", { name: "backend" }).click();
  await expect(page.getByTestId("release-row")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 2, name: /^web/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("each destination says its real state: published, not set up, or failed with the reason", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/releases");
  const web = page.getByTestId("release-row").filter({ hasText: "v2.3.0" });
  await expect(web.locator('[data-dest="github"]')).toHaveAttribute("title", "GitHub release: published");
  await expect(web.locator('[data-dest="confluence"]')).toHaveAttribute("title", "Confluence: not set up for this repo");
  await expect(web.locator('[data-dest="email"]')).toHaveAttribute("title", /^Email: sent/);
  const backend = page.getByTestId("release-row").filter({ hasText: "v1.4.2" });
  await expect(backend.locator('[data-dest="confluence"]')).toHaveAttribute(
    "title",
    "Confluence: failed: Confluence publish failed (403): no permission on the space",
  );
  await expect(backend.locator('[data-dest="email"]')).toHaveAttribute("title", "Email: not set up for this repo");
  await expect(backend).toContainText("Confluence failed");
  await backend.getByRole("button").first().click();
  await expect(backend.getByRole("button", { name: "Post to Confluence" })).toBeVisible();
  await expect(backend.getByRole("button", { name: "Send the email again" })).toHaveCount(0);
  await shot(page, "audit-releases-failed");
  expect(errors).toEqual([]);
});

test("a release waiting out its batch window is a slim banner with Release now", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page, {
    pending: { waiting: [{ repo: "your-team/web", fires_at: Math.floor(now / 1000) + 555, merges: 1, base_branch: "main" }], blocked: [] },
  });
  await page.goto("/releases");
  const banner = page.getByTestId("pending-release");
  await expect(banner).toContainText("1 merge waiting");
  await expect(banner).toContainText(/releases from main in \d+:\d\d/);
  await banner.getByRole("button", { name: "Release now" }).click();
  await expect(page.getByText("Releasing your-team/web now")).toBeVisible();
  expect(db.bodies).toContainEqual({ repo: "your-team/web" });
  await shot(page, "audit-releases-pending");
  expect(errors).toEqual([]);
});

test("a failed releases load says so and retries, instead of claiming there are none", async ({ page }) => {
  const errors = watchConsole(page, true);
  const db = await mockApi(page, { failList: true });
  await page.goto("/releases");
  await expect(page.getByText("Could not load release notes")).toBeVisible();
  await expect(page.getByText("No release notes yet")).toHaveCount(0);
  await shot(page, "audit-releases-error");
  db.failList = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: /your-team\/web v2\.3\.0/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("an empty releases list says when notes appear", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page, { empty: true });
  await page.goto("/releases");
  await expect(page.getByText("No release notes yet")).toBeVisible();
  await shot(page, "audit-releases-empty");
  expect(errors).toEqual([]);
});

test("writing notes for a tag opens a small form and catches a tag the backend refuses", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/releases");
  await expect(page.getByRole("textbox", { name: "Release tag" })).toHaveCount(0);
  await page.getByRole("button", { name: "Write notes for a tag" }).click();
  const form = page.locator("#write-notes");
  await form.getByRole("button", { name: /Select repo/ }).click();
  await form.getByRole("button", { name: "your-team/web", exact: true }).click();
  const tag = form.getByRole("textbox", { name: "Release tag" });
  await tag.fill("v2.3.0!");
  await expect(page.getByText("A tag can use letters, numbers and . _ - + / only.")).toBeVisible();
  await expect(form.getByRole("button", { name: "Write notes" })).toBeDisabled();
  await tag.fill("v2.3.1");
  await shot(page, "audit-releases-write");
  await form.getByRole("button", { name: "Write notes" }).click();
  await expect(page.getByText("Release notes queued for your-team/web v2.3.1")).toBeVisible();
  expect(db.bodies).toContainEqual({ repo: "your-team/web", tag: "v2.3.1", resend: "" });
  await expect(page.locator("#write-notes")).toHaveCount(0);
  expect(errors).toEqual([]);
});
