import { expect, test, type Page, type Route } from "@playwright/test";
import { SHOTS_DIR, capture, prepare } from "./landing-shots-kit";

// Pictures for coderhelm.com: a production alert turned into a fix PR, and
// the reviewer at work on the team's pull requests. Made up data only (team
// Acme, acme/web, acme/api, invented people).
//   LANDING_SHOTS_DIR=/tmp/landing E2E_STATIC=1 npx playwright test e2e/landing-shots-alerts-review.spec.ts

test.skip(!SHOTS_DIR, "LANDING_SHOTS_DIR not set");
test.use({ deviceScaleFactor: 2, viewport: { width: 1280, height: 800 } });

const MIN = 60_000;
const ago = (mins: number) => new Date(Date.now() - mins * MIN).toISOString();
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/** Answers the calls every page makes (sidebar, team, repos); `own` answers the page's. */
async function mockApi(page: Page, own: (p: string, url: URL, route: Route) => Promise<void> | null) {
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const mine = own(p, url, route);
    if (mine) return mine;
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: "dana", email: "dana@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/security/overview") return json(route, { enabled: false, dry_run: true, counts: { open: 0, p0: 0, p1: 0 } });
    if (p === "/api/setup") return json(route, { repos: [], new_recommendations: [], auto_setup_new_repos: false });
    if (p === "/api/support/badge") return json(route, { waiting: 0, queue_open: null });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: ["acme/web", "acme/api"].map((name) => ({ name, enabled: true, ticket_source: "jira" })) });
    if (p === "/api/aws-connections") return json(route, { connections: [] });
    console.log(`[landing-shots] not mocked: ${route.request().method()} ${p}`);
    return json(route, {});
  });
}

// ── The alert: a 5xx spike on checkout, its cause, and the fix PR ───────

const API = "acme/api";
const INCIDENT_ID = "INC-4C21D07E9A13";
const LEAD = "rec_5xx";

const INCIDENT = {
  id: INCIDENT_ID,
  lead: LEAD,
  members: [
    { rec_id: LEAD, title: "POST /checkout returns 502 in /ecs/prod-api" },
    { rec_id: "rec_timeout", title: "PaymentsClient timed out after 2000 ms in /ecs/prod-api" },
  ],
  log_groups: ["/ecs/prod-api"],
  first_seen: ago(26),
  last_seen: ago(4),
  action:
    "Opened acme/api#482, which gives the payments call back its 10 second timeout and retries it once with the same idempotency key. It waits for a person's approval.",
  diagnosis: {
    place: "code",
    service: "ecs",
    resource: "prod-api",
    headline: "Checkout 5xx spike after the payments timeout dropped to 2 seconds",
    summary:
      "Since the 14:05 deploy of acme/api, PaymentsClient gives up after 2 seconds, but the payment provider takes up to 4 at busy times. Each timeout is a 502 on POST /checkout: 6.8% of checkouts in the last 20 minutes.",
    facts: [
      "The 5xx count on the checkout target group crossed its alarm (73 in 5 minutes against a limit of 50).",
      "acme/api#476 (merged 14:01 by Marco) set PAYMENTS_TIMEOUT_MS to 2000 in src/payments/client.ts; it was 10000.",
    ],
    fix: {
      repo: API,
      path: "src/payments/client.ts",
      change: "Restore the 10 second timeout and retry once on a timeout with the same idempotency key",
    },
    steps: [],
    recovered_at: "",
    changed_at: ago(31),
    permissions: [],
  },
};

type Finding = Record<string, unknown> & { rec_id: string };

function finding(over: Partial<Finding> & Pick<Finding, "rec_id">): Finding {
  return {
    title: "",
    summary: "",
    suggested_action: "",
    severity: "critical",
    status: "new",
    log_group: "/ecs/prod-api",
    account_id: "111122223333",
    error_pattern: "",
    error_count: 0,
    seen_count: 0,
    first_seen: ago(26),
    last_seen: ago(4),
    suspected_location: null,
    plan_id: null,
    repo: API,
    repo_mapped: true,
    console_url: null,
    fix: null,
    auto: null,
    ...over,
  };
}

const FINDINGS: Finding[] = [
  finding({
    rec_id: LEAD,
    title: INCIDENT.members[0].title,
    summary: "502 Bad Gateway on POST /checkout, upstream PaymentsClient.",
    status: "fixing",
    error_count: 412,
    seen_count: 412,
    fix: { state: "pr_open", ticket_id: "ACME-1287", run_id: "01JRUNCHECKOUT", run_status: "awaiting_approval", pr_number: 482, pr_url: "https://github.com/acme/api/pull/482", auto: true, started_at: ago(22) },
    auto: { status: "started", reason: "" },
    incident_id: INCIDENT_ID,
    incident: INCIDENT,
  }),
  finding({
    rec_id: "rec_timeout",
    title: INCIDENT.members[1].title,
    error_count: 418,
    seen_count: 418,
    status: "fixing",
    last_seen: ago(5),
    fix: { state: "pr_open", ticket_id: "ACME-1287", run_id: "01JRUNCHECKOUT", run_status: "awaiting_approval", pr_number: 482, pr_url: "https://github.com/acme/api/pull/482", auto: true, started_at: ago(22) },
    auto: { status: "skipped", reason: `same cause as "${INCIDENT.members[0].title}"; one fix covers both` },
    incident_id: INCIDENT_ID,
    incident: INCIDENT,
  }),
  finding({
    rec_id: "rec_img",
    title: "Image resize worker runs out of memory on large uploads",
    severity: "warning",
    status: "fixed",
    log_group: "/ecs/prod-web-worker",
    repo: "acme/web",
    error_count: 0,
    seen_count: 37,
    first_seen: ago(3 * 24 * 60),
    last_seen: ago(2 * 24 * 60),
    fix: { state: "merged", ticket_id: "ACME-1251", run_id: "01JRUNIMG", run_status: "completed", pr_number: 913, pr_url: "https://github.com/acme/web/pull/913", auto: true, started_at: ago(3 * 24 * 60) },
  }),
  finding({
    rec_id: "rec_cache",
    title: "Cart cache misses after the session key rename",
    severity: "warning",
    status: "acknowledged",
    log_group: "/ecs/prod-web",
    repo: "acme/web",
    error_count: 58,
    seen_count: 140,
    first_seen: ago(9 * 60),
    last_seen: ago(35),
  }),
];

test("alert: a checkout 5xx spike, its cause, and the fix PR waiting for approval", async ({ page }) => {
  await prepare(page);
  await mockApi(page, (p, _url, route) => {
    if (p === "/api/log-findings") {
      const counts = { new: 0, acknowledged: 0, fixing: 0, fixed: 0, ignored: 0, stopped: 0 } as Record<string, number>;
      for (const f of FINDINGS) counts[f.status as string] += 1;
      return json(route, {
        findings: FINDINGS,
        counts,
        log_groups: [...new Set(FINDINGS.map((f) => f.log_group as string))].sort(),
        aws_connected: true,
        analysis_failing: [],
      });
    }
    if (p === "/api/log-findings/autofix")
      return json(route, {
        autofix: { enabled: true, min_severity: "critical", daily_cap: 3, scope: "all", quiet_hours: null, enabled_at: ago(30 * 24 * 60), overrides: [] },
        runs_today: 1,
        posts_to: { mode: "team", saved: false, channels: ["Slack"], team_alerts: true },
      });
    if (p === "/api/recommendations/notify") return json(route, { notify_mode: "team", saved: false, webhooks: { teams: { set: false, hint: "" }, slack: { set: true, hint: "#acme-oncall" } } });
    if (/^\/api\/log-findings\/[^/]+\/samples$/.test(p)) return json(route, { samples: [] });
    return null;
  });
  await page.goto(`/logs?incident=${INCIDENT_ID}`);
  const panel = page.getByTestId("incident-panel");
  await expect(panel).toContainText("Checkout 5xx spike");
  await expect(page.getByTestId(`finding-${LEAD}`)).toContainText("PR #482");
  // The incident's read on top, its two findings (one with the open PR) below.
  await panel.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 60));
  await capture(page, "alert");
});

// ── Code review: the reviewer on the team's pull requests ───────────────

function review(over: Record<string, unknown>) {
  return {
    sk: "",
    repo: "acme/web",
    pr_number: 0,
    head_sha: "abcdef1234567",
    verdict: "APPROVE",
    risk: "LOW",
    body: "",
    posted_as: "coderhelm[bot]",
    trigger: "opened",
    action_summary: "",
    thumbs_up: 0,
    thumbs_down: 0,
    rating_comments: [],
    created_at: ago(30),
    session_id: null,
    ...over,
  };
}
const sk = (repo: string, pr: number, mins: number) => `REVIEW#${repo}#${String(pr).padStart(6, "0")}#${ago(mins)}`;

const REVIEWS = [
  review({
    sk: sk("acme/api", 482, 18), repo: "acme/api", pr_number: 482, verdict: "APPROVE", risk: "LOW", trigger: "opened", created_at: ago(18), thumbs_up: 1,
    action_summary: "Approved. The retry reuses the idempotency key, so a slow first answer can't charge twice.",
  }),
  review({ sk: sk("acme/web", 921, 45), pr_number: 921, verdict: "REQUEST_CHANGES", risk: "HIGH", trigger: "synchronize", created_at: ago(45) }),
  review({ sk: sk("acme/web", 921, 130), pr_number: 921, verdict: "REQUEST_CHANGES", risk: "HIGH", trigger: "labeled", created_at: ago(130) }),
  review({ sk: sk("acme/api", 479, 70), repo: "acme/api", pr_number: 479, verdict: "APPROVE", risk: "MEDIUM", trigger: "opened", created_at: ago(70), thumbs_up: 2 }),
  review({ sk: sk("acme/web", 917, 160), pr_number: 917, verdict: "QUESTION", risk: "N/A", trigger: "rerequest", created_at: ago(160) }),
  review({ sk: sk("acme/web", 915, 240), pr_number: 915, verdict: "APPROVE", risk: "LOW", trigger: "opened", created_at: ago(240), thumbs_up: 1 }),
  review({ sk: sk("acme/api", 474, 320), repo: "acme/api", pr_number: 474, verdict: "APPROVE", risk: "LOW", trigger: "synchronize", created_at: ago(320) }),
  review({ sk: sk("acme/web", 912, 400), pr_number: 912, verdict: "REQUEST_CHANGES", risk: "MEDIUM", trigger: "opened", created_at: ago(400) }),
];

// The latest review of acme/web#921, its findings kept as data.
const DETAIL = review({
  sk: sk("acme/web", 921, 44), pr_number: 921, verdict: "REQUEST_CHANGES", risk: "HIGH", trigger: "synchronize", created_at: ago(44),
  head_sha: "9b1e4c7d20aa31f5", posted_as: "REQUEST_CHANGES",
  pr_title: "Move the cart to server components",
  body: "The move is clean and the cart renders on the server now, but the new cache serves one person's cart to another.",
  findings: [
    { severity: "high", kind: "bug", blocks: true, file: "src/app/cart/page.tsx", line: 18, title: "The cart is cached across people", body: "`getCart` is wrapped in `unstable_cache` with no key for the session, so the first cart rendered is served to everyone until it expires. Key it by `session.id`, or read it with `cookies()` so the page stays dynamic." },
    { severity: "medium", kind: "bug", blocks: true, file: "src/app/cart/actions.ts", line: 42, title: "Removing an item doesn't refresh the cart", body: "`removeItem` changes the row but never calls `revalidatePath(\"/cart\")`, so the old total stays on screen." },
    { severity: "low", kind: "concern", blocks: false, file: "src/app/cart/cart-row.tsx", line: 7, title: "The quantity stepper is still a client component", body: "Only the stepper needs `\"use client\"`; the row around it can stay on the server." },
    { severity: "low", kind: "question", blocks: false, file: "src/lib/prices.ts", line: 0, title: "Do prices still round in the browser's locale?", body: "On the server the locale is the machine's. Passing `en-US` from the request keeps totals the same as before." },
  ],
});

const LIVE = [
  {
    repo: "acme/web", pr_number: 924, pr_title: "Show saved addresses first at checkout", status: "reviewing", group: "active",
    updated_at: ago(1), review: { phase: "reviewing", kind: "review", trigger: "labeled", attempt: 0, reason: "" }, gate: null,
  },
  {
    repo: "acme/api", pr_number: 482, pr_title: "Restore the payments timeout and retry once with the same key", status: "waiting_people", group: "waiting",
    updated_at: ago(17), review: { phase: "done", kind: "review", trigger: "opened" },
    gate: {
      state: "waiting_approval", detail: "", head_sha: "abcdef1234567",
      checklist: [{ mark: "done", text: "CI passing" }, { mark: "done", text: "CoderHelm approved" }, { mark: "waiting", text: "Waiting for a person's approval" }],
    },
  },
  {
    repo: "acme/web", pr_number: 921, pr_title: "Move the cart to server components", status: "reviewed", group: "done",
    updated_at: ago(45), review: { phase: "done" }, gate: null,
  },
  {
    repo: "acme/api", pr_number: 479, pr_title: "Paginate the orders export", status: "merged", group: "done",
    updated_at: ago(60), review: { phase: "done" }, gate: { state: "merged", checklist: [] },
  },
  {
    repo: "acme/web", pr_number: 917, pr_title: "Lazy load the product gallery", status: "reviewed", group: "done",
    updated_at: ago(160), review: { phase: "done" }, gate: null,
  },
  {
    repo: "acme/web", pr_number: 915, pr_title: "Fix the focus ring on the coupon field", status: "merged", group: "done",
    updated_at: ago(230), review: { phase: "done" }, gate: { state: "merged", checklist: [] },
  },
  {
    repo: "acme/api", pr_number: 474, pr_title: "Add rate limits to the public search endpoint", status: "merged", group: "done",
    updated_at: ago(300), review: { phase: "done" }, gate: { state: "merged", checklist: [] },
  },
  {
    repo: "acme/web", pr_number: 912, pr_title: "Store the locale in a cookie instead of local storage", status: "reviewed", group: "done",
    updated_at: ago(400), review: { phase: "done" }, gate: null,
  },
];

test("review: the reviewer's pull requests on acme/web and acme/api", async ({ page }) => {
  await prepare(page);
  await mockApi(page, (p, url, route) => {
    if (p === "/api/reviewer/reviews") return json(route, { reviews: REVIEWS, next: null });
    if (p === "/api/reviewer/live") return json(route, { prs: LIVE });
    if (p === "/api/skills/used") return json(route, { skills: [], agents: [], sources: [], standards: [] });
    if (p === "/api/reviewer/stale/config") {
      const off = { enabled: false, stale_days: 21, close_days: 7, label: "stale", warn_message: "", close_message: "", exempt_labels: [], exempt_drafts: true, exempt_authors: [], scope: "all", delete_branch: false, max_closes_per_run: 10, dry_run: true };
      return json(route, { team: off, team_saved: false, repo: null, effective: off, defaults: off });
    }
    if (p === "/api/reviewer/stale") return json(route, { plan: null, plans: [], log: [], kept_open: [] });
    if (p === "/api/reviewer/org-config") return json(route, { instructions: "" });
    if (p === "/api/releases/pending") return json(route, { waiting: [], blocked: [] });
    if (p === "/api/reviewer/review") {
      const r = [...REVIEWS, DETAIL].find((x) => x.sk === url.searchParams.get("sk"));
      return r ? json(route, r) : json(route, { error: "not found" }, 404);
    }
    if (p === "/api/reviewer/gate")
      return json(route, { repo: url.searchParams.get("repo"), pr_number: Number(url.searchParams.get("pr")), pr_title: "", session_id: "", auto_merge: false, status: "reviewed", group: "done", gate: null });
    if (p === "/api/reviewer/session") return json(route, { error: "not found" }, 404);
    return null;
  });
  await page.goto("/reviewer");
  await expect(page.getByRole("link", { name: "Move the cart to server components" })).toBeVisible();
  // The list from its toolbar down: in flight, waiting on a person, done.
  await page.getByRole("searchbox").first().evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 84));
  await capture(page, "review");

  await page.goto(`/reviewer/detail?sk=${encodeURIComponent(DETAIL.sk)}`);
  await expect(page.getByTestId("finding-counts")).toBeVisible();
  await capture(page, "review-findings");
});
