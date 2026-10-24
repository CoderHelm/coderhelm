import type { Handler } from "./index";
import { ALERT_ID, REVIEW_SK, SUPPORT_TICKET_ID, TEST_ID, TEST_RUN_KEY } from "./ids";
import {
  ARN, BRANCH, EMAIL, FILE, FILE_2, iso, LOG_GROUP, LONG_URL, MARKDOWN, NOTES, ORG, PR_URL, REPO, REPO_2, SENTENCE, SHA, TICKET, TITLE, TOKEN,
} from "./long";

// The reviewer, tests, alerts, support and skills parts of the invented
// backend, with long strings in every free-text field.

const DAY = 24 * 60;

// ---- Reviewer --------------------------------------------------------------

const FINDINGS = [
  { severity: "high", kind: "concern", blocks: true, file: FILE, line: 184, title: TITLE, body: MARKDOWN },
  { severity: "medium", kind: "concern", blocks: false, file: FILE_2, line: 12, title: `\`${TOKEN}\``, body: `${SENTENCE}\n\n\`\`\`\n${TOKEN}${TOKEN}\n\`\`\`` },
  { severity: "low", kind: "suggestion", blocks: false, file: FILE, line: 1, title: "The backoff never grows", body: `See ${LONG_URL}` },
];

function review(i: number) {
  return {
    sk: i === 0 ? REVIEW_SK : `REVIEW#${REPO}#0123${40 + i}#2026-01-0${(i % 8) + 1}T10:00:00Z`,
    repo: i % 2 ? REPO_2 : REPO,
    pr_number: 12345 + i,
    pr_title: TITLE,
    head_sha: SHA,
    verdict: ["REQUEST_CHANGES", "APPROVE", "COMMENT"][i % 3],
    risk: ["HIGH", "MEDIUM", "LOW"][i % 3],
    posted_as: "COMMENT",
    trigger: "synchronize",
    action_summary: SENTENCE,
    thumbs_up: 1,
    thumbs_down: 1,
    rating_comments: [{ by: EMAIL, text: `${SENTENCE} ${TOKEN}`, rating: "down", at: iso(4) }],
    applied_standards: [FILE, ".claude/skills/schedule-table-conventions/SKILL.md"],
    created_at: iso(5 + i * 30),
    body: MARKDOWN,
    findings: FINDINGS,
  };
}

const CHECKLIST = [
  { mark: "done", text: `Coderhelm approved commit ${SHA}` },
  { mark: "done", text: `Approved by @${EMAIL}` },
  { mark: "waiting", text: `CI running: ${TOKEN}` },
  { mark: "blocked", text: `Branch protection on ${BRANCH} needs a review from a code owner of ${FILE}` },
];

const GATE = {
  state: "stopped",
  detail: `${SENTENCE} ${TOKEN}`,
  head_sha: SHA,
  armed_at: iso(90),
  updated_at: iso(10),
  checklist: CHECKLIST,
  stopped: { by: EMAIL, is_login: false, via: "dashboard", at: iso(10) },
  controls: [
    { action: "stop", by: EMAIL, is_login: false, via: "dashboard", at: iso(10), outcome: "stopped" },
    { action: "rearm", by: "dana-developer-with-a-long-login", is_login: true, via: "comment", at: iso(30), outcome: "rearmed" },
  ],
};

function livePr(i: number) {
  const group = ["active", "waiting", "done"][i % 3];
  return {
    repo: i % 2 ? REPO_2 : REPO,
    pr_number: 12345 + i,
    pr_title: TITLE,
    status: ["reviewing", "waiting_ci", "merged"][i % 3],
    group,
    updated_at: iso(i + 1),
    review: { phase: "reviewing", kind: "review", trigger: "synchronize", head_sha: SHA, attempt: 2, reason: `${SENTENCE} ${TOKEN}`, queued_at: iso(20), started_at: iso(18) },
    gate: { ...GATE, state: group === "waiting" ? "waiting_ci" : "stopped" },
  };
}

const REVIEWER_CONFIG = {
  enabled: true, label: "coderhelm-review-please-with-a-very-long-label-name", killed: false, instructions: NOTES, auto_merge: true,
  merge_method: "squash", require_human_approval: true, auto_tag: true, tag_mode: "semver", tag_prefix: "release-candidate-for-production-",
  tag_batch_minutes: 30, health_check: true, verify_tests: true, require_tests: true, auto_labels: true, auto_label_allow: `${TOKEN},${TOKEN}`,
  auto_label_requires: TOKEN, auto_label_guide: MARKDOWN, release_notes: true, release_notes_branch: BRANCH, release_notes_confluence_space: "ENGINEERINGPLATFORMRELEASES",
  release_notes_confluence_parent_id: "123456789012345678", release_notes_confluence_container: "", release_notes_email_webhook_url: LONG_URL,
  release_notes_email_webhook_secret_set: true, release_notes_guide: MARKDOWN, release_notes_instructions: MARKDOWN, deploy_label: "deployed-to-production-us-east-1",
  health_log_groups: [LOG_GROUP], reminders_enabled: true, reminder_cooldown_hours: 24,
  webhooks: { teams: { set: true, hint: `${LONG_URL.slice(0, 60)} …ab12` }, slack: { set: false, hint: "" } },
};

// ---- Tests -----------------------------------------------------------------

function testCase(i: number, state: string) {
  return {
    id: i === 0 ? TEST_ID : `test-wide-${i}`,
    repo: i % 2 ? REPO_2 : REPO,
    framework: "playwright",
    file: FILE,
    title: `${TITLE} ${TOKEN}`,
    project: "chromium-mobile-safari-and-desktop-firefox",
    state,
    flags: ["flaky"],
    owner: "@your-team/web-platform-frontend-owners-and-reviewers",
    cause: { label: "animation_loader", evidence: `${SENTENCE} ${TOKEN}` },
    runs_30d: 120, fail_rate_30d: 0.08, flake_rate_30d: 0.08, flips_14d: 6, prs_blocked_7d: 4, minutes_lost_7d: 96,
    p50_ms: 14_000, p95_ms: 22_000, last_seen: iso(60),
    quarantined_since: state === "quarantined" ? iso(20 * DAY) : null,
    never_quarantine: false,
    ticket_url: `${PR_URL.replace("/pull/", "/issues/")}`,
    fix_pr_url: PR_URL,
    fix_status: "burn_in",
  };
}
const TESTS = ["flaky", "broken", "quarantined", "healthy", "fixed"].map((s, i) => testCase(i, s));

const ATTEMPT_FAIL = {
  retry: 0, status: "failed", duration_ms: 15_000,
  error: { message: `${TOKEN}\n    at ${FILE}:184:22\n    at ${FILE_2}:12:5\n${MARKDOWN}`, signature: `sig_${SHA}` },
  trace_url: LONG_URL, video_url: LONG_URL, screenshot_url: LONG_URL,
};
const ATTEMPT_PASS = { retry: 1, status: "passed", duration_ms: 13_000 };

function testRun(i: number) {
  return {
    run_key: i === 0 ? TEST_RUN_KEY : `testrun-wide-${i}`, repo: REPO, workflow: "End-to-end tests on every pull request (Playwright, sharded)",
    run_id: 900000000 + i, run_attempt: 2, branch: BRANCH, pr: 12345, sha: SHA, event: "pull_request", framework: "playwright",
    started_at: iso(i * 60), duration_ms: 610_000, passed: 40, failed: 1, flaky: 1, skipped: 0, bad_run: false,
    url: `https://github.com/${REPO}/actions/runs/${900000000 + i}/job/123456789012`, status: i % 2 ? "passed" : "failed",
  };
}

function testSummary() {
  return {
    repos: [REPO, REPO_2], counts: { healthy: 1, flaky: 1, broken: 1, quarantined: 1, fixed: 1 },
    prs_blocked_7d: 6, ci_minutes_lost_7d: 136, prs_rescued_7d: 3, runs_7d: 52, pass_rate_7d: 0.93, flake_rate_7d: 0.031,
    trend: Array.from({ length: 30 }, (_, i) => ({ day: iso((29 - i) * DAY).slice(0, 10), runs: 6 + (i % 4), pass_rate: 0.9 + (i % 5) / 100, flake_rate: 0.03 })),
  };
}

// ---- Alerts ----------------------------------------------------------------

const TOPIC = "arn:aws:sns:us-east-1:123456789012:production-payments-reconciliation-alerts-and-nightly-import-failures";

function alert(i: number) {
  return {
    id: i === 0 ? ALERT_ID : `alert-wide-${i}`, received_at: iso(30 + i * 60), topic_arn: TOPIC, repo: i % 2 ? REPO_2 : REPO,
    kind: "cloudwatch_alarm", title: `ALARM: ${TOKEN}`, outcome: ["run_started", "posted", "deduplicated"][i % 3],
    ticket_id: `ALERT-${TICKET}-${SHA}`, recovers_ticket: null,
  };
}

const ALERT_ROUTES = {
  endpoint_path: "/webhooks/alerts/sns/team-0123456789abcdef0123456789abcdef",
  routes: [
    {
      topic_arn: TOPIC, enabled: true, notify_mode: "custom", post_recoveries: true, updated_at: iso(DAY),
      webhooks: { teams: { set: true, hint: "example.environment.api.powerplatform.com …ab12" }, slack: { set: true, hint: "hooks.slack.example.com …cd34" } },
      rules: [
        { id: "r1", alarms: ["production-payments-reconciliation-service-5xx-rate-above-threshold"], terms: [], repo: REPO, instructions: NOTES },
        { id: "r2", alarms: [], terms: [TOKEN, LOG_GROUP], repo: REPO_2, instructions: SENTENCE },
      ],
    },
  ],
};

// ---- Support ---------------------------------------------------------------

function ticket(i: number) {
  return {
    id: i === 0 ? SUPPORT_TICKET_ID : `ticket-wide-${i}`, team_id: "TEAM#t_1", team_name: ORG, subject: `${TITLE} ${TOKEN}`,
    status: ["open", "waiting", "resolved"][i % 3], priority: ["urgent", "high", "normal"][i % 3],
    opened_by_id: "u_self", opened_by_email: EMAIL, opened_by_name: "Dana Developer With A Long Name", role: "owner",
    context: {
      page: `/runs/detail?id=01RUNWIDE00000000000000001&from=${encodeURIComponent(LONG_URL)}`,
      item: { kind: "run", id: "01RUNWIDE00000000000000001", label: TITLE, repo: REPO, status: "failed" },
      items: [
        { kind: "run", id: "01RUNWIDE00000000000000001", label: TITLE, repo: REPO, status: "failed" },
        { kind: "alert", id: ALERT_ID, label: `ALARM: ${TOKEN}`, repo: REPO_2, status: "run_started" },
      ],
      user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    },
    created_at: iso(60 + i * 90), updated_at: iso(10 + i * 30), last_actor: i % 2 ? "support" : "customer", message_count: 3,
    participants: [{ user_id: "USER#u_2", email: EMAIL, name: "Sam Rivera With A Long Name", outside: true, added_by: EMAIL, added_at: iso(50) }],
    last_snippet: `${SENTENCE} ${TOKEN}`, last_author_name: "Dana Developer With A Long Name",
  };
}

const SUPPORT_DETAIL = {
  ticket: ticket(0),
  messages: [
    { id: "m1", kind: "message", author: "customer", author_email: EMAIL, author_name: "Dana Developer", body: MARKDOWN, created_at: iso(60),
      attachments: [{ kind: "run", id: "01RUNWIDE00000000000000001", label: TITLE, repo: REPO, status: "failed" }] },
    { id: "m2", kind: "event", author: "support", author_email: EMAIL, author_name: "Coderhelm support", body: `Added ${EMAIL}`, created_at: iso(40) },
    { id: "m3", kind: "message", author: "support", author_email: EMAIL, author_name: "Coderhelm support", body: `${SENTENCE}\n\n${LONG_URL}\n\n\`${TOKEN}\``, created_at: iso(20) },
  ],
  support_access: { until: iso(-3 * DAY) },
  avatars: {},
};

const SUPPORT_ACCESS = {
  grant: { id: "g1", granted_by_email: EMAIL, granted_at: iso(10), until: iso(-3 * DAY), note: `${SENTENCE} ${TOKEN}`, ticket_id: SUPPORT_TICKET_ID, revoked_at: "", revoked_by_email: "", active: true },
  windows: [24, 72, 168],
  log: [
    { id: "l1", at: iso(5), kind: "read", actor_email: EMAIL, method: "GET", route: `/api/runs/01RUNWIDE00000000000000001/agent-log?cursor=${SHA}${SHA}`, ticket_id: SUPPORT_TICKET_ID, detail: TOKEN },
    { id: "l2", at: iso(10), kind: "granted", actor_email: EMAIL, method: "POST", route: "/api/support/access", ticket_id: SUPPORT_TICKET_ID, detail: SENTENCE },
  ],
};

// ---- Skills ----------------------------------------------------------------

const SKILL_PATH = ".claude/skills/schedule-table-conventions/SKILL.md";
const AGENT_PATH = ".claude/agents/payments-reconciliation-reviewer.md";

function skill(i: number, kind: "skill" | "agent" | "command", path: string) {
  return {
    repo: REPO, path, kind, name: i === 0 ? "schedule-table-conventions-and-accessibility-rules" : `payments-reconciliation-reviewer-${i}`,
    description: `${SENTENCE} ${TOKEN}`, sha: SHA, hash: SHA, enabled: true, files: [path, FILE, FILE_2],
    missing_tools: ["newrelic_query_nrql_for_the_payments_reconciliation_service"], uses: 12, last_used_at: iso(30), last_used_by: EMAIL,
    updated_at: iso(DAY), asks: 3, last_asked_at: iso(40), switched_by: EMAIL, switched_at: iso(2 * DAY),
    compat: { status: "needs_tools", summary: `${SENTENCE} ${TOKEN}`, needs: [TOKEN], need_items: [{ name: TOKEN, action: "connect" }], at: iso(DAY), error: "", current: true },
    always_apply: { on: true, repos: [REPO, REPO_2], passes: ["coder", "reviewer"], paths: [FILE, "src/app/**/*.tsx"], by: EMAIL, at: iso(DAY) },
    suggestion: null,
    reviews: { auto: ["code"], set: false, steps: ["code"], effective: ["code"], by: EMAIL, at: iso(DAY) },
  };
}
const SKILLS = [skill(0, "skill", SKILL_PATH), skill(1, "agent", AGENT_PATH), skill(2, "command", ".claude/commands/reconcile-the-nightly-import-and-open-a-pr.md")];

const SKILL_REPOS = [
  { repo: REPO, added_by: EMAIL, added_at: iso(10 * DAY), sha: SHA, synced_at: iso(60), error: TOKEN, items: 3, skipped: [FILE, FILE_2] },
];

const SKILL_STATS = {
  days_covered: 30, since: iso(30 * DAY), reads: 120, asks: 14, answered: 12, no_answer: 2, tries: 3, input_tokens: 1_200_000, output_tokens: 42_000,
  median_answer_ms: 4200,
  days: Array.from({ length: 30 }, (_, i) => ({ date: iso((29 - i) * DAY).slice(0, 10), reads: 4, asks: 1, answered: 1 })),
  by_reader: [{ reader: "coder", reads: 80, asks: 10 }, { reader: "reviewer", reads: 40, asks: 4 }],
  top: SKILLS.map((s) => ({ repo: s.repo, path: s.path, name: s.name, kind: s.kind, reads: 40, asks: 3, answered: 3 })),
  unused_count: 1,
  unused: [{ repo: REPO, path: FILE, name: TOKEN, kind: "skill" }],
};

function skillItem(path: string) {
  const base = SKILLS.find((s) => s.path === path) ?? SKILLS[0];
  return {
    ...base,
    body: MARKDOWN,
    prompt: MARKDOWN,
    translated: MARKDOWN,
    agent_tools: { declared: ["read_file", TOKEN], granted: ["read_file"], missing: [TOKEN], blocked: ["newrelic_query_nrql_for_the_payments_reconciliation_service"] },
    compat: {
      ...base.compat,
      steps: [
        {
          title: TITLE, does: `${SENTENCE} ${TOKEN}`, dropped: false, status: "missing",
          requirements: [
            { asks: TOKEN, kind: "tool", status: "missing", uses: [TOKEN, LOG_GROUP], write: "none", needs: SENTENCE, fix: `${SENTENCE} ${LONG_URL}`, connect: "plugins", action: "connect", link: LONG_URL },
          ],
        },
      ],
      counts: { steps: 1, as_written: 0, translated: 0, missing: 1, blocked: 0 },
      needs_detail: [{ name: TOKEN, fix: SENTENCE, connect: "plugins", action: "connect", link: LONG_URL, status: "missing", steps: 1 }],
      notes: [`${SENTENCE} ${TOKEN}`],
      model: "model-id-with-a-long-name", input_tokens: 1000, output_tokens: 100, cost_usd: 0.01, ms: 1200,
    },
  };
}

// ---- Handler ---------------------------------------------------------------

export const reviewData: Handler = ({ method, path, url }) => {
  if (method !== "GET") return undefined;

  // Reviewer
  if (path === "/api/reviewer/reviews") return { reviews: Array.from({ length: 6 }, (_, i) => review(i)), next: null };
  if (path === "/api/reviewer/review") return review(0);
  if (path === "/api/reviewer/live") return { prs: Array.from({ length: 6 }, (_, i) => livePr(i)) };
  if (path === "/api/reviewer/gate") {
    return {
      repo: url.searchParams.get("repo") ?? REPO, pr_number: Number(url.searchParams.get("pr") ?? 12345), pr_title: TITLE,
      auto_merge: true, status: "stopped", group: "waiting", can_control: true, gate: GATE,
    };
  }
  if (path === "/api/reviewer/org-config") return { instructions: NOTES, web_domains: ["staging.web-platform-frontend-monorepo.example.com", LONG_URL] };
  if (path.startsWith("/api/reviewer/config/")) return REVIEWER_CONFIG;

  // Tests
  if (path === "/api/tests/settings") return { enabled: true, auto_quarantine: true, fix_prs: true, tickets: "github", burn_in: true, repos: [REPO, REPO_2], ticket_after_days: 2 };
  if (path === "/api/tests/summary") return testSummary();
  if (path === "/api/tests/runs") return { runs: Array.from({ length: 6 }, (_, i) => testRun(i)), next: null };
  if (path.startsWith("/api/tests/runs/")) {
    return {
      run: testRun(0),
      executions: TESTS.slice(0, 3).map((t, i) => ({
        test_id: t.id, title: t.title, file: t.file, project: t.project,
        outcome: ["flaky", "failed", "passed"][i],
        attempts: i === 2 ? [ATTEMPT_PASS] : i === 0 ? [ATTEMPT_FAIL, ATTEMPT_PASS] : [ATTEMPT_FAIL, { ...ATTEMPT_FAIL, retry: 1 }],
      })),
    };
  }
  if (path === "/api/tests/failure-groups") {
    return {
      groups: [
        { signature: `sig_${SHA}`, message: `${TOKEN} ${TOKEN}`, selector: `[data-testid=${TOKEN}]`, step: TITLE, tests: 3, failures_7d: 11, last_seen: iso(60), test_ids: TESTS.map((t) => t.id), cause: "animation_loader" },
      ],
    };
  }
  if (path === "/api/tests/coverage") {
    return {
      areas: [
        { area: "schedule-and-waitlist-badges-for-the-class-details-page", paths: [FILE, "src/app/(dashboard)/classes/**"], tests: [], runs_30d: 0, covered: false },
        { area: "checkout", paths: [FILE_2], tests: [{ id: TEST_ID, title: TITLE }], runs_30d: 120, covered: true },
      ],
      recommendations: [
        {
          id: "rec_1", repo: REPO, area: "schedule", title: TITLE, why: `${SENTENCE} ${TOKEN}`, status: "pr_opened", pr_url: PR_URL,
          evidence: [{ kind: "bug_ticket", text: TITLE, url: LONG_URL }, { kind: "changed_code", text: `${FILE} changed in 3 PRs this month` }],
        },
      ],
    };
  }
  if (path === "/api/tests") return { tests: TESTS, next: null };
  if (path.startsWith("/api/tests/")) {
    return {
      test: TESTS[0],
      history: Array.from({ length: 24 }, (_, i) => {
        const outcome = i % 4 === 1 ? "flaky" : i % 9 === 4 ? "failed" : "passed";
        return {
          run_key: `testrun-wide-${i}`, sha: SHA, branch: BRANCH, pr: 12345, at: iso(i * 60), outcome,
          attempts: outcome === "flaky" ? [ATTEMPT_FAIL, ATTEMPT_PASS] : outcome === "failed" ? [ATTEMPT_FAIL, { ...ATTEMPT_FAIL, retry: 1 }] : [ATTEMPT_PASS],
        };
      }),
      events: [{ at: iso(2 * DAY), from: "healthy", to: "flaky", reason: `${SENTENCE} ${TOKEN}`, actor: EMAIL }],
    };
  }

  // Alerts
  if (path === "/api/alerts") return { alerts: Array.from({ length: 6 }, (_, i) => alert(i)), next: null };
  if (path === "/api/alerts/event") {
    return {
      alert: { ...alert(0), body: `${TOKEN}\n${SENTENCE}\n${ARN}\n${LOG_GROUP}\n${JSON.stringify({ AlarmName: TOKEN, NewStateReason: SENTENCE, Trigger: { MetricName: TOKEN, Namespace: LOG_GROUP } })}` },
      runs: [
        { run_id: "01RUNWIDE00000000000000001", status: "awaiting_ci", title: TITLE, pr_url: PR_URL, created_at: iso(29) },
        { run_id: "01RUNWIDE00000000000000002", status: "completed", title: TOKEN, pr_url: null, created_at: iso(600) },
      ],
    };
  }
  if (path === "/api/alert-routes") return ALERT_ROUTES;
  if (path === "/api/alert-routes/alarms") return { alarms: [{ name: "production-payments-reconciliation-service-5xx-rate-above-threshold", state: "ALARM" }], messages: [] };
  if (path === "/api/alert-budget") return { daily_tokens: 2_000_000, used_24h_tokens: 600_000, open_runs: 1, open_run_reserve_tokens: 50_000, max_runs_per_rule_per_day: 5 };
  if (path === "/api/alert-notify") return { enabled: true, webhooks: { teams: { set: true, hint: "example.environment.api.powerplatform.com …ab12" }, slack: { set: false, hint: "" } } };

  // Support
  if (path === "/api/support/badge") return { waiting: 1, queue_open: 2 };
  if (path === "/api/support/tickets") return { tickets: Array.from({ length: 4 }, (_, i) => ticket(i)) };
  if (path.startsWith("/api/support/tickets/")) return SUPPORT_DETAIL;
  if (path === "/api/support/access") return SUPPORT_ACCESS;
  if (path === "/api/support/view") return { active: false };

  // Skills
  if (path === "/api/skills") return { repos: SKILL_REPOS, items: SKILLS, can_manage: true };
  if (path === "/api/skills/stats") return SKILL_STATS;
  if (path === "/api/skills/item") return skillItem(url.searchParams.get("path") ?? SKILL_PATH);
  if (path === "/api/agents/global") return { content: MARKDOWN };
  if (path === "/api/skills/activity") {
    const p = url.searchParams.get("path") ?? SKILL_PATH;
    return {
      events: [
        { id: "e1", at: iso(5), repo: REPO, path: p, kind: "skill", name: SKILLS[0].name, action: "read", file: FILE, by: "coder", origin: `${REPO}#12345`, run_id: "01RUNWIDE00000000000000001", why: `${SENTENCE} ${TOKEN}`, outcome: "ok", ask_id: "", ms: 120, cursor: "c1" },
        { id: "e2", at: iso(15), repo: REPO, path: p, kind: "agent", name: SKILLS[1].name, action: "ask", file: FILE_2, by: EMAIL, origin: `${REPO}#12345`, run_id: "", why: TOKEN, outcome: "answered", ask_id: "ask1", ms: 4200, cursor: "c2" },
      ],
      next: null,
    };
  }

  return undefined;
};
