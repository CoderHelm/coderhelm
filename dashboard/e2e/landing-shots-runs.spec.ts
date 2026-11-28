import { expect, test, type Page, type Route } from "@playwright/test";
import { capture, prepare, SHOTS_DIR } from "./landing-shots-kit";

// The run page and the Releases page for coderhelm.com, from made up data
// only (team Acme, acme/web, acme/api, invented people). Only runs with
// LANDING_SHOTS_DIR set (see landing-shots-kit.ts).

test.skip(!SHOTS_DIR, "LANDING_SHOTS_DIR not set");
test.use({ deviceScaleFactor: 2, viewport: { width: 1280, height: 800 } });

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

const RUN_ID = "01KACME123RUN0000000000000";

const RUN = {
  run_id: RUN_ID,
  status: "completed",
  ticket_source: "jira",
  ticket_id: "ACME-123",
  title: "Let customers save a shipping address at checkout",
  repo: "acme/web",
  branch: "coderhelm/acme-123-save-shipping-address",
  pr_url: "https://github.com/acme/web/pull/412",
  pr_number: 412,
  pr_urls: null,
  pr_numbers: null,
  branches: null,
  current_pass: "review",
  tokens_in: 1_420_000,
  tokens_out: 51_000,
  cache_read_tokens: 980_000,
  cache_write_tokens: 14_000,
  cost_usd: 3.84,
  files_modified: [
    "src/app/checkout/address-form.tsx",
    "src/app/checkout/address-form.test.tsx",
    "src/lib/addresses.ts",
    "src/lib/addresses.test.ts",
    "src/app/api/addresses/route.ts",
  ],
  mcp_servers: [],
  duration_s: 1_486,
  error: null,
  created_at: iso(48),
  updated_at: iso(6),
  pass_history: [
    { pass: "triage", started_at: iso(48) },
    { pass: "plan", started_at: iso(46) },
    { pass: "implement", started_at: iso(42) },
    { pass: "test", started_at: iso(33) },
    { pass: "security", started_at: iso(30) },
    { pass: "pr", started_at: iso(28) },
    { pass: "ci_fix", started_at: iso(24) },
    { pass: "review", started_at: iso(19) },
    { pass: "feedback", started_at: iso(13) },
  ],
  progress_notes: [
    { message: "Read the ticket and the comment from Priya about the saved address limit", timestamp: iso(47) },
    { message: "Plan check: 4 of 4 tasks done", timestamp: iso(34) },
    { message: "Ran npm test -- src/lib/addresses.test.ts: 18 passed", timestamp: iso(32) },
    { message: "The lint check failed on an unused import in address-form.tsx; removed it and pushed", timestamp: iso(23) },
    { message: "Lena asked for the postcode to be validated on the server too; added the check and a test", timestamp: iso(11) },
  ],
  merge_standing: {
    code: "needs_person_approval",
    text: "This repo's auto-merge setting requires an approving review from a person before CoderHelm merges.",
    next: "Once a person approves this commit, CoderHelm merges it and follows the deploy.",
    needs_person: true,
    link: "/reviewer/config",
  },
  waiting_line: "Waiting on: an approving review from a person on #412. Ready for review: checks passed, review comments answered.",
  checks: {
    sha: "7c3e91ab52d04f6e8b1a9c2d3e4f5a6b7c8d9e0f",
    items: [
      { name: "build", state: "passed", conclusion: "success", required: true, started_at: iso(10), completed_at: iso(8), url: "https://github.com/acme/web/actions/runs/1" },
      { name: "lint", state: "passed", conclusion: "success", required: true, started_at: iso(10), completed_at: iso(9), url: "https://github.com/acme/web/actions/runs/2" },
      { name: "unit tests", state: "passed", conclusion: "success", required: true, started_at: iso(10), completed_at: iso(7), url: "https://github.com/acme/web/actions/runs/3" },
      { name: "e2e (chromium)", state: "passed", conclusion: "success", required: false, started_at: iso(9), completed_at: iso(6), url: "https://github.com/acme/web/actions/runs/4" },
    ],
    counts: { passed: 4, failed: 0, running: 0, queued: 0, skipped: 0 },
  },
  pr_review: {
    verdict: "APPROVE",
    review_sk: "REVIEW#acme/web#000412#2026-11-27T10:00:00Z",
    session_id: null,
    reviewed_sha: "7c3e91ab52d0",
    at: iso(7),
  },
};

const TRACES = [
  { pass: "triage", duration_ms: 6_000, input_tokens: 4_000, output_tokens: 500, cost_usd: 0.02, timestamp: iso(48) },
  { pass: "plan", duration_ms: 140_000, input_tokens: 60_000, output_tokens: 4_000, cost_usd: 0.31, timestamp: iso(46) },
  { pass: "implement", duration_ms: 520_000, input_tokens: 980_000, output_tokens: 36_000, cache_read_tokens: 700_000, cost_usd: 2.2, timestamp: iso(42) },
  { pass: "test", duration_ms: 150_000, input_tokens: 90_000, output_tokens: 3_000, cost_usd: 0.28, timestamp: iso(33) },
  { pass: "ci_fix", duration_ms: 110_000, input_tokens: 70_000, output_tokens: 2_000, cost_usd: 0.21, timestamp: iso(24) },
  { pass: "feedback", duration_ms: 160_000, input_tokens: 110_000, output_tokens: 4_000, cost_usd: 0.34, timestamp: iso(13) },
];

/** Scrolls whatever scrolls (the window or the app's main pane) so `target` sits near the top. */
async function scrollTo(page: Page, target: import("@playwright/test").Locator, below = 108) {
  await target.evaluate((el, below) => {
    let box: HTMLElement | null = el.parentElement;
    while (box && !(box.scrollHeight > box.clientHeight && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
    const top = el.getBoundingClientRect().top - below;
    if (box) box.scrollBy(0, top);
    else window.scrollBy(0, top);
  }, below);
}

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/** Answers the shell's own calls; `more` answers the page's. */
async function mockApi(page: Page, more: (p: string, url: URL, route: Route) => Promise<void> | null) {
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "dana@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/security/overview") return json(route, { enabled: false, dry_run: true, counts: { open: 0, p0: 0, p1: 0 } });
    if (p === "/api/setup") return json(route, { repos: [], new_recommendations: [], auto_setup_new_repos: false });
    if (p === "/api/support/badge") return json(route, { waiting: 0, queue_open: null });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/integrations/jira/app") return json(route, { behind: null });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "acme/web", enabled: true, ticket_source: "jira" }, { name: "acme/api", enabled: true, ticket_source: "jira" }] });
    if (p === "/api/plugins/catalog") return json(route, { plugins: [] });
    if (p === "/api/skills/asks") return json(route, { asks: [] });
    if (p === "/api/skills/used") return json(route, { skills: [], agents: [], sources: [], standards: [] });
    const done = more(p, url, route);
    if (done) return done;
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
}

async function mockRun(page: Page) {
  await prepare(page);
  await mockApi(page, (p, _url, route) => {
    const m = p.match(/^\/api\/runs\/([^/]+)(\/.*)?$/);
    if (!m) return null;
    const sub = m[2] ?? "";
    if (sub === "") return json(route, RUN);
    if (sub === "/openspec") return json(route, {});
    if (sub === "/traces") return json(route, { traces: TRACES });
    if (sub === "/asks") return json(route, { asks: [] });
    if (sub === "/outputs") return json(route, { outputs: [] });
    if (sub === "/activity") {
      const entries = activity();
      return json(route, { entries, earlier: null, total: entries.length });
    }
    if (sub === "/agent-log") return json(route, { passes: [], live_events: [] });
    return null;
  });
}

test("run-activity: the failing check it fixed and the comment it answered", async ({ page }) => {
  await mockRun(page);
  await page.goto(`/runs/detail/?id=${RUN_ID}&tab=activity`);
  const list = page.getByTestId("run-activity-list");
  await expect(list.getByRole("listitem")).toHaveCount(9);
  // The whole story in one picture: the list at its full height, not its own scroll box.
  await page.addStyleTag({ content: "[data-testid=run-activity-scroll]{max-height:none!important}" });
  await scrollTo(page, page.getByRole("navigation", { name: "Run views" }), 60);
  await capture(page, "run-activity");
});

test("run: a Jira ticket that became a pull request, checks green, review answered", async ({ page }) => {
  await mockRun(page);
  await page.goto(`/runs/detail/?id=${RUN_ID}`);
  await expect(page.getByRole("heading", { name: RUN.title })).toBeVisible();
  await expect(page.getByTestId("run-outcome")).toBeVisible();
  await expect(page.getByTestId("run-pr-review")).toBeVisible();
  await expect(page.getByRole("list", { name: "Steps" }).getByTestId("run-step").filter({ hasText: "Fixed a failing check" })).toBeVisible();
  await scrollTo(page, page.getByTestId("run-outcome"));
  await capture(page, "run");
});

/** The Activity tab's story for the same run from its pull request on, oldest first (the page reads it a page at a time). */
function activity() {
  const out: { id: string; at: string; actor: string; who?: string; kind: string; text: string; link?: string; tone: string }[] = [];
  const add = (minsAgo: number, text: string, over: Partial<(typeof out)[number]> = {}) => {
    const at = iso(minsAgo);
    out.push({ id: `${at}#run#${String(out.length).padStart(4, "0")}`, at, actor: "coderhelm", kind: "note", text, tone: "neutral", ...over });
  };
  const PR = "https://github.com/acme/web/pull/412";
  add(28, "Opened pull request #412 in 1m 12s", { kind: "step_done", tone: "good", link: PR });
  add(26, "Check lint failed on 3f2a1b0: 'useEffect' is imported but never used in src/app/checkout/address-form.tsx", { actor: "github", kind: "check_failed", tone: "problem", link: "https://github.com/acme/web/actions/runs/2" });
  add(23, "Pushed 9b4d2e1: Remove the unused import from address-form.tsx", { kind: "push", link: "https://github.com/acme/web/commit/9b4d2e1" });
  add(20, "Checks passed on 9b4d2e1: build, lint, unit tests", { actor: "github", kind: "checks", tone: "good" });
  add(15, "Lena on #412: \"Can we also validate the postcode on the server? The form check alone can be skipped.\"", { actor: "person", who: "Lena", kind: "comment", link: `${PR}#discussion_r1` });
  add(11, "Pushed 7c3e91a: Validate the postcode on the server, with a test for a bad one", { kind: "push", link: "https://github.com/acme/web/commit/7c3e91a" });
  add(10, "Replied to Lena: \"Done in 7c3e91a: the route now rejects a malformed postcode with a 400, covered by addresses.test.ts.\"", { kind: "reply", tone: "good", link: `${PR}#discussion_r2` });
  add(7, "Coderhelm's review of #412 approved 7c3e91a", { kind: "review", tone: "good", link: "/reviewer/detail?sk=REVIEW%23acme%2Fweb%23000412" });
  add(6, "All 4 checks passed on 7c3e91a: build, lint, unit tests, e2e (chromium)", { actor: "github", kind: "checks", tone: "good" });
  return out;
}

const RELEASES = [
  {
    repo: "acme/api", tag: "v3.8.0", prev_tag: "v3.7.2", pr_count: 5, headline: "Saved shipping addresses and faster order lookups",
    entry_md: "Customers can save a shipping address at checkout, and order lookups by email are faster.",
    github_release_md: [
      "## What changed",
      "- Save a shipping address at checkout (#412)",
      "- Validate postcodes on the server (#415)",
      "- Index orders by customer email for faster lookups (#409)",
      "- Retry webhook deliveries with backoff (#407)",
      "- Clearer error when a coupon has expired (#405)",
    ].join("\n"),
    unclear: "",
    github_release_url: "https://github.com/acme/api/releases/tag/v3.8.0", confluence_url: "https://acme.example.com/wiki/changelog/v3.8.0",
    email_sent_at: iso(12), updated_at: iso(12),
  },
  {
    repo: "acme/api", tag: "v3.7.2", prev_tag: "v3.7.1", pr_count: 2, headline: "Webhook retries and a quieter log",
    entry_md: "Webhook deliveries retry.", github_release_md: "- Retry webhooks (#401)\n- Quieter logs (#399)", unclear: "",
    github_release_url: "https://github.com/acme/api/releases/tag/v3.7.2", confluence_url: "https://acme.example.com/wiki/changelog/v3.7.2",
    email_sent_at: iso(1500), updated_at: iso(1500),
  },
  {
    repo: "acme/web", tag: "v5.2.0", prev_tag: "v5.1.4", pr_count: 3, headline: "A shipping address form that remembers you",
    entry_md: "Checkout remembers addresses.", github_release_md: "- Address form (#412)\n- Dark mode fixes (#410)\n- Faster product images (#408)", unclear: "",
    github_release_url: "https://github.com/acme/web/releases/tag/v5.2.0", confluence_url: "https://acme.example.com/wiki/changelog/web-v5.2.0",
    email_sent_at: iso(40), updated_at: iso(40),
  },
  {
    repo: "acme/web", tag: "v5.1.4", prev_tag: "v5.1.3", pr_count: 1, headline: "Fix the cart badge count after sign in",
    entry_md: "Cart badge fixed.", github_release_md: "- Cart badge (#403)", unclear: "",
    github_release_url: "https://github.com/acme/web/releases/tag/v5.1.4", confluence_url: "https://acme.example.com/wiki/changelog/web-v5.1.4",
    email_sent_at: iso(2900), updated_at: iso(2900),
  },
];

const RELEASE_CONFIG = {
  enabled: true, label: "ch-review", killed: false, instructions: "", auto_merge: true, merge_method: "squash",
  require_human_approval: true, auto_tag: true, tag_mode: "semver", tag_prefix: "v", tag_batch_minutes: 15, health_check: true,
  verify_tests: true, require_tests: false, auto_labels: false, auto_label_allow: "", auto_label_requires: "", auto_label_guide: "",
  release_notes: true, release_notes_branch: "", release_notes_confluence_space: "ENG", release_notes_confluence_parent_id: "100",
  release_notes_confluence_container: "Changelog", release_notes_email_webhook_url: "https://hooks.example.com/release", release_notes_email_webhook_secret_set: true,
  release_notes_guide: "", release_notes_instructions: "", graph_enabled: false, deploy_label: "", deploy_workflows: "deploy.yml", health_log_groups: [],
  reminders_enabled: false, reminder_cooldown_hours: 4,
  webhooks: { teams: { set: false, hint: "" }, slack: { set: true, hint: "" } },
};

test("release: a release of acme/api with its notes published everywhere", async ({ page }) => {
  await prepare(page);
  await mockApi(page, (p, url, route) => {
    if (p === "/api/releases") {
      const repo = url.searchParams.get("repo");
      return json(route, { releases: repo ? RELEASES.filter((r) => r.repo === repo) : RELEASES, next: null });
    }
    if (p === "/api/releases/pending") return json(route, { waiting: [], blocked: [] });
    if (p.startsWith("/api/reviewer/config/")) return json(route, RELEASE_CONFIG);
    return null;
  });
  await page.goto("/releases");
  const row = page.getByTestId("release-row").filter({ hasText: "v3.8.0" });
  await expect(row).toBeVisible();
  await row.getByRole("button").first().click();
  await expect(page.getByRole("link", { name: /GitHub release/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "GitHub release", exact: true }).click();
  await expect(page.getByText("Validate postcodes on the server")).toBeVisible();
  await scrollTo(page, page.getByTestId("list-toolbar"));
  await capture(page, "release");
});
