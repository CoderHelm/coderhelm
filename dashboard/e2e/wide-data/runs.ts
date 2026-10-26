import type { Handler } from "./index";
import { PLAN_ID, RUN_ID } from "./ids";
import {
  ARN, BRANCH, EMAIL, FILE, FILE_2, LOG_GROUP, LONG_URL, MARKDOWN, ORG, PR_URL, REPO, REPO_2, SENTENCE, SHA, TICKET, TITLE, TOKEN, iso,
} from "./long";

// Runs, plans, templates, releases, analytics, the code graph,
// infrastructure, memory, system health and the platform admin's pages.

const DAY_MIN = 24 * 60;

// ── Runs ──────────────────────────────────────────────────────

const RUN = {
  run_id: RUN_ID,
  status: "completed",
  ticket_source: "jira",
  ticket_id: TICKET,
  title: TITLE,
  repo: REPO,
  branch: BRANCH,
  pr_url: PR_URL,
  pr_number: 12345,
  pr_urls: [PR_URL, `https://github.com/${REPO_2}/pull/67890`],
  pr_numbers: [12345, 67890],
  branches: [BRANCH, `${BRANCH}-payments-reconciliation-follow-up`],
  current_pass: "review",
  tokens_in: 1_250_000,
  tokens_out: 42_000,
  cache_read_tokens: 800_000,
  cache_write_tokens: 12_000,
  cost_usd: 4.2,
  files_modified: [FILE, FILE_2, "src/lib/schedule.ts"],
  mcp_servers: ["linear", "payments-reconciliation-ledger-readonly-production"],
  duration_s: 754,
  error: TOKEN,
  // Agent permissions on the run: why a loop stopped, and a sign-in prompt.
  policy_note: `Stopped: nobody answered the request to use payments-reconciliation-ledger-mcp-server__create_reconciliation_adjustment_for_customer_account in time. ${TOKEN}`,
  sign_in_prompts: [
    { server_id: "design-system-figma-workspace-for-the-web-platform", server_name: "Design system Figma workspace for the web platform", need: "personal", message: `Sign in to Design system Figma workspace for the web platform to let me use it in this run. ${TOKEN}`, action_label: "Connect", action_path: "/api/mcp-servers/x/connect", link_path: "/settings/integrations/#mcp-servers" },
  ],
  created_at: iso(30),
  updated_at: iso(10),
  pass_history: [
    { pass: "triage", started_at: iso(30) },
    { pass: "plan", started_at: iso(28) },
    { pass: "implement", started_at: iso(25) },
    { pass: "test", started_at: iso(18) },
    { pass: "pr", started_at: iso(14) },
    { pass: "review", started_at: iso(12) },
  ],
  applied_standards: [`${REPO}/.claude/skills/schedule-table-conventions-and-accessibility-rules/SKILL.md`],
  progress_notes: [
    { message: `Read ${FILE}`, timestamp: iso(24) },
    { message: `Ran npm test -- --run ${FILE_2} and every test passed after the change`, timestamp: iso(17) },
    { message: TOKEN, timestamp: iso(16) },
  ],
  fix_location: "both",
  outside_change_report: MARKDOWN,
  lesson: `${SENTENCE} ${LONG_URL}`,
};

const RUNS = [
  { run_id: RUN_ID, status: "completed", ticket_source: "jira", ticket_id: TICKET, title: TITLE, repo: REPO, pr_url: PR_URL, pr_number: 12345, cost_usd: 4.2, created_at: iso(30), duration_s: 754, current_pass: "review" },
  { run_id: "01RUNWIDE00000000000000002", status: "needs_input", ticket_source: "github", ticket_id: `${REPO}#12346`, title: TOKEN, repo: REPO, created_at: iso(65), duration_s: 300, current_pass: "plan" },
  { run_id: "01RUNWIDE00000000000000003", status: "failed", ticket_source: "jira", ticket_id: "PAYMENTSRECONCILIATION-98765", title: SENTENCE, repo: REPO_2, created_at: iso(200), duration_s: 42 },
  { run_id: "01RUNWIDE00000000000000004", status: "merged", ticket_source: "github", ticket_id: `${REPO_2}#67890`, title: `Log the second failure of ${LOG_GROUP}`, repo: REPO_2, pr_url: `https://github.com/${REPO_2}/pull/67890`, pr_number: 67890, created_at: iso(900), duration_s: 4000 },
  { run_id: "01RUNWIDE00000000000000005", status: "running", ticket_source: "jira", ticket_id: TICKET, title: `Update ${FILE}`, repo: REPO, created_at: iso(5), duration_s: 60, current_pass: "implement" },
];

const OPENSPEC = {
  proposal: MARKDOWN,
  design: `# Design\n\n${MARKDOWN}`,
  spec: `# Spec\n\n### Requirement: ${TITLE}\n\nThe page SHALL read ${LONG_URL}.`,
  tasks: `## Implementation\n- [ ] Add the table in \`${FILE}\`\n- [ ] Load times in \`${FILE_2}\`\n## Verification\n- [ ] Run ${TOKEN}`,
};

const TRACES = [
  { pass: "triage", duration_ms: 4000, input_tokens: 2000, output_tokens: 300, timestamp: iso(30) },
  { pass: "implement", duration_ms: 400000, input_tokens: 1_000_000, output_tokens: 30000, cache_read_tokens: 600000, timestamp: iso(25), error: TOKEN },
  { pass: "ci_fix:2", duration_ms: 90000, input_tokens: 0, output_tokens: 0, timestamp: iso(15) },
  {
    pass: "plan_review", duration_ms: 20000, input_tokens: 9000, output_tokens: 900, timestamp: iso(26),
    detail: {
      step: "plan", revised: true, cost_usd: 0.03,
      reviews: [{ agent: ".claude/agents/payments-reconciliation-reviewer.md", repo: REPO, path: ".claude/agents/payments-reconciliation-reviewer.md", outcome: "answered", cost_usd: 0.03 }],
    },
  },
];

const AGENT_LOG = {
  passes: [
    {
      pass: "implement",
      conversation: [
        {
          turn: 1, role: "assistant",
          content: [{ type: "text", text: `${SENTENCE} ${TOKEN}` }, { type: "tool_use", name: "write_file", input: { path: FILE } }],
          usage: { input_tokens: 1200, output_tokens: 300, cache_read: 0, cache_write: 0 },
        },
      ],
    },
  ],
  live_events: [
    { tool: "read_file", input_summary: FILE, duration_ms: 12, is_error: false, timestamp: iso(24) },
    { tool: "run_command", input_summary: `npm test -- --run ${FILE_2} ${TOKEN}`, duration_ms: 4200, is_error: true, timestamp: iso(23) },
  ],
};

const ASKS = [
  {
    id: "ask-wide-1", repo: REPO, path: ".claude/agents/payments-reconciliation-reviewer.md", by: "planner", origin: `${REPO}#12345`,
    run_id: RUN_ID, sha: SHA, question: `${SENTENCE} ${TOKEN}`, context_chars: 5200, outcome: "answered",
    answer: `- ${FILE}: ${SENTENCE}\n- ${LONG_URL}`, model: "claude-sonnet-4-6", input_tokens: 4200, output_tokens: 380, ms: 14200, at: iso(27),
  },
];

const USED = {
  skills: [{ name: "schedule-table-conventions-and-accessibility-rules", kind: "skill", repo: REPO, path: ".claude/skills/schedule-table-conventions-and-accessibility-rules/SKILL.md", count: 2 }],
  agents: [{ name: "payments-reconciliation-reviewer", kind: "agent", repo: REPO, path: ".claude/agents/payments-reconciliation-reviewer.md", count: 1, tools: ["read_file", "search_code"] }],
  sources: [{ id: "s1", name: LOG_GROUP, lookups: 3 }],
  standards: [{ name: "code-standards", kind: "skill", repo: REPO_2, path: `.claude/skills/${TOKEN}/SKILL.md`, count: 1 }],
};

const PLUGINS = [{ id: "linear", name: "Linear", description: SENTENCE, category: "tickets", tier: 1, icon: "", credential_fields: [], docs_url: LONG_URL, repo_url: LONG_URL, default_prompt: "", recommended_permissions: "" }];

// ── Plans ─────────────────────────────────────────────────────

function plan(id: string, title: string, status: string) {
  return {
    plan_id: id, title, description: `${SENTENCE} ${LONG_URL}`, repo: REPO, status, task_count: 3, destination: "github",
    chat_id: "chat-wide-1", tokens_in: 120_000, tokens_out: 9000, mcp_servers: ["payments-reconciliation-ledger-readonly-production"],
    created_at: iso(60), updated_at: iso(30), executed_by: EMAIL,
  };
}

function task(id: string, title: string, status: string, order: number, extra: Record<string, unknown> = {}) {
  return {
    task_id: id, plan_id: PLAN_ID, title, description: MARKDOWN, acceptance_criteria: `- ${SENTENCE}\n- \`${FILE}\` renders ${TOKEN}`,
    status, order, repo: REPO, created_at: iso(60), ...extra,
  };
}

const PLANS = [
  plan(PLAN_ID, TITLE, "draft"),
  plan("plan-01WIDE0000000000000002", TOKEN, "executing"),
  plan("plan-01WIDE0000000000000003", `Move ${REPO_2} to the new API`, "waiting"),
  plan("plan-01WIDE0000000000000004", SENTENCE, "done"),
];

const TASKS = [
  task("task-wide-1", TITLE, "draft", 1),
  task("task-wide-2", TOKEN, "running", 2, { run_id: RUN_ID, issue_number: 12345, issue_url: PR_URL }),
  task("task-wide-3", `Update ${FILE_2}`, "done", 3, { pr_url: PR_URL, jira_ticket_key: TICKET, jira_ticket_url: LONG_URL, destination: "jira", jira_project: "WEBPLATFORM" }),
];

const TEMPLATES = [
  {
    template_id: "tpl-wide-1", title: TITLE, description: `${SENTENCE} ${LONG_URL}`, category: "payments-reconciliation-backend-services",
    tags: ["api", TOKEN, "payments-reconciliation-service"], task_count: 3, usage_count: 12, created_by: EMAIL, created_at: iso(DAY_MIN),
    task_templates: [{ title: TOKEN, description: MARKDOWN, acceptance_criteria: SENTENCE, repo: REPO, order: 1 }],
  },
  { template_id: "tpl-wide-2", title: TOKEN, description: "", tags: [], task_count: 2, usage_count: 0, created_by: EMAIL, created_at: iso(DAY_MIN * 2) },
];

// ── Releases ──────────────────────────────────────────────────

const RELEASES = [
  {
    repo: REPO, tag: "v2026.10.24-release-candidate-with-payments-reconciliation", prev_tag: "v2026.10.23-release-candidate", pr_count: 4, headline: TITLE,
    entry_md: MARKDOWN, github_release_md: MARKDOWN, unclear: TOKEN,
    github_release_url: `https://github.com/${REPO}/releases/tag/v2026.10.24-release-candidate-with-payments-reconciliation`, confluence_url: LONG_URL,
    email_sent_at: iso(60), updated_at: iso(60),
  },
  {
    repo: REPO_2, tag: "v1.4.2", prev_tag: "v1.4.1", pr_count: 1, headline: SENTENCE,
    entry_md: SENTENCE, github_release_md: `## Changes\n- ${TOKEN} (#77)`, unclear: "",
    github_release_url: `https://github.com/${REPO_2}/releases/tag/v1.4.2`, confluence_url: "", email_sent_at: "", updated_at: iso(180),
    last_error: `Confluence publish failed (403): ${TOKEN} ${LONG_URL}`, failed_at: iso(170),
  },
];

const PENDING = {
  waiting: [{ repo: REPO, fires_at: Math.floor(Date.now() / 1000) + 600, merges: 3, base_branch: BRANCH }],
  blocked: [{ repo: REPO_2, error: `${TOKEN} ${LONG_URL}`, failed_at: iso(40), attempts: 3, base_branch: BRANCH }],
};

// ── Analytics ─────────────────────────────────────────────────

function dailyRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    day: new Date(Date.now() - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10),
    runs: i % 3, prs_opened: i % 2, merged: i % 4 === 0 ? 1 : 0, failed: i % 7 === 0 ? 1 : 0, cost_usd: (i % 5) * 1.25, reviews: i % 3,
  }));
}

const SUMMARY = {
  runs: 42, prs_opened: 30, prs_merged: 21, prs_closed: 3, prs_open: 6, merge_rate: 0.7, failed_runs: 4, failure_rate: 0.095,
  cost_usd: 96.4, cost_per_run: 2.3, cost_per_merged_pr: 4.59, tokens_in: 12_000_000, tokens_out: 900_000,
  median_run_minutes: 11.5, median_hours_to_merge: 5.2, time_to_merge_known: 12, merged_untouched: 9, merged_with_edits: 3, edits_known: 12, reviews: 55,
};

const COUNTS = {
  tickets: 45, runs: 62, prs_opened: 50, prs_merged: 30, prs_open: 12, prs_reviewed: 210, reviews_posted: 660,
  approvals: 300, changes_requested: 250, comments: 110, repos: 8, people: 5, runs_with_requester: 30,
};

function analytics(url: URL) {
  const n = url.searchParams.get("period") === "mtd" ? 24 : Number(url.searchParams.get("days") || 30);
  const end = new Date();
  const start = new Date(end.getTime() - n * 86_400_000);
  const prevStart = new Date(start.getTime() - n * 86_400_000);
  return {
    days: n,
    basis: "days",
    period: { start: start.toISOString(), end: end.toISOString() },
    previous_period: { start: prevStart.toISOString(), end: start.toISOString() },
    comparison: {
      current: COUNTS, previous: COUNTS, previous_full: null, previous_full_period: null, people_comparable: true,
      daily: Array.from({ length: n }, (_, i) => ({
        offset: i, day: new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10),
        previous_day: new Date(prevStart.getTime() + i * 86_400_000).toISOString().slice(0, 10),
        tickets: 2 * (i + 1), prs_opened: i + 1, prs_reviewed: 3 * (i + 1),
        previous_tickets: i + 1, previous_prs_opened: i + 1, previous_prs_reviewed: 2 * (i + 1),
      })),
    },
    summary: SUMMARY,
    previous: { ...SUMMARY, prs_merged: 15, merge_rate: 0.6 },
    daily: dailyRows(n),
    sources: [
      { source: "jira", runs: 30, prs: 22, merged: 16, merge_rate: 0.727 },
      { source: "github", runs: 12, prs: 8, merged: 5, merge_rate: 0.625 },
    ],
    repos: [
      { repo: REPO, runs: 28, prs: 20, merged: 15, failed: 2, cost_usd: 60.1, merge_rate: 0.75, reviews: 40 },
      { repo: REPO_2, runs: 14, prs: 10, merged: 6, failed: 2, cost_usd: 36.3, merge_rate: 0.6, reviews: 15 },
    ],
    people: [
      { person: EMAIL, kind: "person", runs: 25, merged: 14 },
      { person: "dana-developer-with-a-long-login-on-github-enterprise", kind: "person", runs: 10, merged: 4 },
      { person: "", kind: "not_recorded", runs: 30, merged: 9 },
    ],
    failures: [
      { reason: TOKEN, count: 3, last_run_id: "01RUNWIDE00000000000000003", last_at: iso(60) },
      { reason: `Branch ${BRANCH} already exists`, count: 1, last_run_id: "01RUNWIDE00000000000000003", last_at: iso(120) },
    ],
    ci: {
      runs_with_red_ci: 8, fixed_by_coderhelm: 6, fix_rate: 0.75, fix_attempts: 11, fix_commits: 9, red_on_base_runs: 1,
      outcomes: { green_after_fix: 6, green_without_fix: 0, flaky: 1, red_on_base: 1, gave_up: 1, running: 0 },
      gave_up_reasons: [{ reason: TOKEN, count: 1 }],
    },
    reviews: {
      posted: 55, approve: 30, request_changes: 5, comment: 20, questions: 4, prs_reviewed: 38, findings: 70,
      findings_fixed: 24, findings_settled_by_person: 8, acted_on_rate: 0.75, outcomes_known_reviews: 20, thumbs_up: 12, thumbs_down: 2,
    },
    lookups: {
      total: 64, refused: 3, failed: 1,
      by_source: [{ source: LOG_GROUP, total: 40, refused: 3, failed: 0 }, { source: "payments-reconciliation-ledger-readonly-production database", total: 24, refused: 0, failed: 1 }],
      by_actor: [{ actor: "planner", total: 30 }, { actor: EMAIL, total: 14 }],
    },
    steps: [
      { step: "implement", count: 40, tokens_in: 8_000_000, tokens_out: 600_000, avg_seconds: 320 },
      { step: "ci_fix", count: 11, tokens_in: 1_500_000, tokens_out: 90_000, avg_seconds: 150 },
    ],
    steps_window_days: 30,
    merged_recent: [
      { run_id: RUN_ID, title: TITLE, repo: REPO, pr_number: 12345, pr_url: PR_URL, hours_to_merge: 3.5, human_commits: 0 },
      { run_id: "01RUNWIDE00000000000000004", title: TOKEN, repo: REPO_2, pr_number: 67890, pr_url: `https://github.com/${REPO_2}/pull/67890`, hours_to_merge: null, human_commits: null },
    ],
    failed_recent: [{ run_id: "01RUNWIDE00000000000000003", title: SENTENCE, repo: REPO_2, reason: TOKEN, at: iso(60) }],
    repo_names: [REPO_2, REPO],
  };
}

// ── Code graph, infrastructure ────────────────────────────────

const GRAPH_REPOS = [
  { repo: REPO, graph_enabled: true, state: "ready", indexed: true, files: 1200, symbols: 9000, branch: BRANCH, indexed_sha: SHA, updated_at: iso(60) },
  { repo: REPO_2, graph_enabled: true, state: "failed", reason: `${TOKEN} ${LONG_URL}`, indexed: false, files: 0, symbols: 0, branch: "main", indexed_sha: "", updated_at: "" },
];

const GRAPH_STATUS = {
  indexed: true, files: 1200, symbols: 9000, names_referenced: 34000, branch: BRANCH, indexed_sha: SHA, updated_at: iso(60),
  top_files: [
    { path: FILE, rank: 0.05, defs: 40 },
    { path: FILE_2, rank: 0.03, defs: 4 },
  ],
};

const INFRA = {
  status: "ready",
  has_infra: true,
  cached_at: iso(30),
  diagram_title: TITLE,
  diagram: "graph LR\n  A[payments-reconciliation-service-nightly-importer] --> B[(payments-reconciliation-ledger-readonly-production)]",
  scanned_repos: [`${REPO}/infra/payments-reconciliation-service-stack-with-a-long-name.ts`, REPO_2],
  suggested_prompt: `${SENTENCE} ${TOKEN}`,
  findings: [
    { severity: "error", category: "security", title: `Bucket ${ARN} allows public reads`, detail: `${SENTENCE} ${LONG_URL}`, file: FILE },
    { severity: "warning", category: "reliability", title: TOKEN, detail: `Failed jobs in ${LOG_GROUP} are dropped.`, file: FILE_2 },
    { severity: "info", category: "cost", title: "Logs kept forever", detail: SENTENCE },
  ],
};

// ── Memory ────────────────────────────────────────────────────

const micros = (minsAgo: number) => (Date.now() - minsAgo * 60_000) * 1000;

function memory(id: string, content: string, topic: string, source: "run" | "person", pinned: boolean, uses: number) {
  return {
    id, content, memory_type: "semantic", tags: [TOKEN], confidence: 0.9, created_at: micros(DAY_MIN * 3), accessed_at: micros(DAY_MIN), access_count: uses,
    topic, topic_label: topic, pinned,
    origin: { source, title: source === "run" ? TITLE : undefined, added_by: source === "person" ? EMAIL : undefined, run_id: source === "run" ? RUN_ID : undefined, ticket_id: TICKET },
    uses, last_used: uses ? { at: iso(DAY_MIN), run_id: RUN_ID, title: TITLE } : null,
  };
}

const MEMORIES = [
  memory("m1", `Run unit tests with \`npm test -- --run ${FILE}\`; the e2e suite needs staging at ${LONG_URL}.`, "procedure", "person", true, 7),
  memory("m2", `${TOKEN} ${SENTENCE}`, "anti-pattern", "run", false, 3),
  memory("m3", MARKDOWN, "code-style-and-component-conventions", "run", false, 0),
];

const PROFILES = [
  {
    id: "reviewer", name: "Reviewer", role: SENTENCE, uses_repo_memory: false,
    knows: [{ label: "Review rules for this repo", detail: `${TOKEN} ${LONG_URL}` }],
    learned: [{ text: SENTENCE, source: `A rating on ${PR_URL}`, at: iso(DAY_MIN * 3), link: PR_URL }],
    activity_label: "reviews in the last 30 days", activity_count: 18,
    recent: [{ title: TITLE, at: iso(DAY_MIN), outcome: "Approved", link: PR_URL }],
  },
  {
    id: "planner", name: "Planner", role: SENTENCE, uses_repo_memory: true,
    knows: [{ label: "Systems it can look things up in", detail: LOG_GROUP }],
    learned: [{ text: TOKEN, source: `Added by ${EMAIL}`, at: iso(DAY_MIN * 20) }],
    activity_label: "tickets planned in the last 30 days", activity_count: 9,
    recent: [{ title: TOKEN, at: iso(DAY_MIN * 5), outcome: "merged", link: LONG_URL }],
  },
  { id: "coder", name: "Coding agent", role: SENTENCE, uses_repo_memory: true, knows: [], learned: [], activity_label: "pull requests merged", activity_count: 6, recent: [] },
  { id: "feedback", name: "Feedback agent", role: SENTENCE, uses_repo_memory: false, knows: [], learned: [], activity_label: "pull requests fixed", activity_count: 2, recent: [] },
];

// ── Health ────────────────────────────────────────────────────

const HEALTH = {
  status: "degraded",
  checked_at: iso(0),
  checks: [
    { name: "crashed_runs", status: "warning", count: 1, items: [{ run_id: RUN_ID, title: TITLE, status: "running", error: TOKEN, created_at: iso(90) }] },
    { name: "stale_queued", status: "ok", count: 0, items: [] },
    { name: "dlq", status: "critical", count: 1, unretryable: 1, oldest_age_secs: 4 * 86_400, oldest_sent_at: iso(4 * DAY_MIN), complete: true },
    { name: "tickets", status: "ok", visible: 1, in_flight: 2 },
    { name: "failed_runs_24h", status: "warning", count: 1, items: [{ run_id: "01RUNWIDE00000000000000003", title: SENTENCE, error: `${TOKEN} ${LONG_URL}`, created_at: iso(60) }] },
  ],
};

const DLQ = [
  {
    message_id: "msg-01WIDE0000000000000000000000001", type: "SkillSync", sent_at: iso(4 * DAY_MIN), age_secs: 4 * 86_400,
    source_queue: "coderhelm-production-ticket-queue-dead-letter-us-east-1", retryable: false, problem: `unknown message type \`${TOKEN}\``,
    body: { type: "SkillSync", team_id: "TEAM#your-team", repo: REPO, path: FILE, sha: SHA },
  },
  {
    message_id: "msg-01WIDE0000000000000000000000002", type: "ticket", sent_at: iso(DAY_MIN), age_secs: 86_400,
    source_queue: "coderhelm-production-ticket-queue-dead-letter-us-east-1", retryable: true, problem: null,
    body: { type: "ticket", team_id: "TEAM#your-team", ticket_id: TICKET, url: LONG_URL },
  },
];

// ── Platform admin ────────────────────────────────────────────

function adminTeam(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    team_id: id, name, status: "active", plan: "", created_at: iso(DAY_MIN * 90), members: 12, invites: 2, repos: 9,
    runs_total: 412, runs_month: 103, reviews_total: 37, reviews_month: 9, cost_month_usd: 1234.5, tokens_month: 98_000_000,
    last_active_at: iso(60), github_org: name, has_installation: true, jira_site: "your-team-engineering-platform.atlassian.net",
    personal: false, active: true, link: "main", ...extra,
  };
}

function adminOrg(key: string, label: string, teams: ReturnType<typeof adminTeam>[]) {
  return {
    key, label, label_from: "github", domain: "engineering-platform.example.com", active: true, team_count: teams.length,
    personal_count: teams.filter((t) => t.personal).length, members: 12, repos: 9, runs_total: 412, runs_month: 103,
    reviews_total: 37, reviews_month: 9, cost_month_usd: 1234.5, last_active_at: iso(60), created_at: iso(DAY_MIN * 200), plan: "", teams,
  };
}

const ORGS = [
  adminOrg("TEAM#wide-1", "your-team-engineering-platform-with-a-long-organisation-name", [
    adminTeam("TEAM#wide-1", "your-team-engineering-platform-with-a-long-organisation-name"),
    adminTeam("TEAM#wide-2", EMAIL, { link: "member", personal: true, github_org: "" }),
  ]),
  adminOrg("TEAM#wide-3", ORG, [adminTeam("TEAM#wide-3", ORG, { link: "domain" })]),
];

function supportTicket(id: string, subject: string, status: string) {
  return {
    id, team_id: "TEAM#wide-1", team_name: "your-team-engineering-platform-with-a-long-organisation-name", subject, status, priority: "high",
    opened_by_id: "USER#u_self", opened_by_email: EMAIL, opened_by_name: "Dana Developer", role: "owner",
    context: {
      page: `/runs/detail?id=${RUN_ID}`,
      item: { kind: "run", id: RUN_ID, label: TITLE, repo: REPO, status: "failed" },
      items: [{ kind: "run", id: RUN_ID, label: TITLE, repo: REPO, status: "failed" }],
      user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    },
    created_at: iso(120), updated_at: iso(30), last_actor: "customer", message_count: 3,
    participants: [{ user_id: "", email: EMAIL, name: "", outside: true, added_by: EMAIL, added_at: iso(100) }],
    last_snippet: `${TOKEN} ${LONG_URL}`, last_author_name: "Dana Developer",
  };
}

const ADMIN_TICKETS = [
  supportTicket("ticket-01WIDE0000000000000001", TITLE, "open"),
  supportTicket("ticket-01WIDE0000000000000002", TOKEN, "waiting"),
];

function adminTicketDetail(id: string) {
  const ticket = ADMIN_TICKETS.find((t) => t.id === id) ?? ADMIN_TICKETS[0];
  return {
    ticket,
    messages: [
      { id: "msg1", kind: "message", author: "customer", author_email: EMAIL, author_name: "Dana Developer", body: MARKDOWN, created_at: iso(120), attachments: ticket.context.items },
      { id: "msg2", kind: "message", author: "support", author_email: "support@example.com", author_name: "Support", body: `${SENTENCE} ${LONG_URL}`, created_at: iso(60) },
    ],
    support_access: { until: null },
    avatars: {},
  };
}

// ── Handler ───────────────────────────────────────────────────

export const runsData: Handler = ({ method, path, url }) => {
  if (method === "POST" && path === "/api/plans/chat/token") return { token: "t" };
  if (method !== "GET") return undefined;

  // Runs
  if (path === "/api/runs") return { runs: RUNS, next: null };
  const run = path.match(/^\/api\/runs\/([^/]+)(\/.*)?$/);
  if (run) {
    const sub = run[2] ?? "";
    if (sub === "") return { ...RUN, run_id: decodeURIComponent(run[1]) };
    if (sub === "/openspec") return OPENSPEC;
    if (sub === "/traces") return { traces: TRACES };
    if (sub === "/agent-log") return AGENT_LOG;
    return undefined;
  }
  if (path === "/api/plugins/catalog") return { plugins: PLUGINS };
  if (path === "/api/skills/asks") return { asks: ASKS };
  if (path === "/api/skills/used") return USED;
  if (path === "/api/activity/summary") {
    return { days: Number(url.searchParams.get("days") || 7), since: iso(7 * DAY_MIN), skills: { reads: 120, asks: 14, read_problems: 2, ask_problems: 1, applies: 30 }, lookups: { total: 64, ok: 60, refused: 3, failed: 1 } };
  }

  // Plans
  if (path === "/api/plans") return { plans: PLANS, next_cursor: null };
  if (path === "/api/plans/templates") return { templates: TEMPLATES, next_cursor: null };
  const tpl = path.match(/^\/api\/plans\/templates\/([^/]+)$/);
  if (tpl) return TEMPLATES.find((t) => t.template_id === tpl[1]) ?? TEMPLATES[0];
  const planOpenspec = path.match(/^\/api\/plans\/([^/]+)\/openspec$/);
  if (planOpenspec) return OPENSPEC;
  const onePlan = path.match(/^\/api\/plans\/([^/]+)$/);
  if (onePlan) return { ...plan(decodeURIComponent(onePlan[1]), TITLE, "draft"), task_count: TASKS.length, tasks: TASKS };

  // Releases
  if (path === "/api/releases") return { releases: url.searchParams.get("cursor") ? [] : RELEASES, next: null };
  if (path === "/api/releases/pending") return PENDING;

  // Analytics
  if (path === "/api/analytics") return analytics(url);
  if (path === "/api/stats") {
    const stats = (n: number) => ({ total_runs: n, completed: n, failed: n, in_progress: n, total_cost_usd: n * 1000, total_tokens_in: n * 1e6, total_tokens_out: n * 1e6, merge_rate: 0.5, estimated_calls: n, recovered_calls: n });
    return { month: stats(1234567), all_time: stats(98765432) };
  }

  // Code graph
  if (path === "/api/graph/repos") return { repos: GRAPH_REPOS };
  if (path === "/api/graph/status") return GRAPH_STATUS;
  if (path === "/api/graph/symbol") {
    return { definitions: [{ name: "submitOrderWithRetryAndBackoff", path: FILE, kind: "function", line: 120, rank: 0.04 }], callers: [FILE_2] };
  }
  if (path === "/api/graph/neighborhood") {
    return { path: url.searchParams.get("path") || FILE, imports: [FILE_2], importers: [FILE], symbols: [{ name: "submitOrderWithRetryAndBackoff", callers: [FILE_2] }] };
  }

  // Infrastructure
  if (path === "/api/infrastructure") return INFRA;
  if (path.startsWith("/api/infrastructure/repo/")) return INFRA;

  // Memory
  if (path === "/api/memories") return { memories: MEMORIES, total: MEMORIES.length, page: 1, page_size: 100 };
  if (path === "/api/memories/agents") return { repo: url.searchParams.get("repo") || REPO, profiles: PROFILES };
  if (path === "/api/memories/stats") return { total: MEMORIES.length, by_type: { semantic: MEMORIES.length } };

  // Health
  if (path === "/api/health") return { ...HEALTH, checked_at: iso(0) };
  if (path === "/api/dlq") return { messages: DLQ, count: 1, unretryable: 1, complete: true };

  // Platform admin
  if (path === "/api/admin/teams") {
    return { month: "2026-10", orgs: ORGS, teams: ORGS.flatMap((o) => o.teams), counts: { teams: 3, orgs: 2, active_orgs: 2, inactive_orgs: 0 } };
  }
  if (path === "/api/admin/beta-signups") {
    return {
      signups: [{ email: EMAIL, original_email: EMAIL, company: "your-team-engineering-platform-with-a-long-name", domain: "engineering-platform.example.com", reason: `${SENTENCE} ${TOKEN}`, created_at: iso(DAY_MIN), status: "new", invited_at: "" }],
      counts: { new: 1, invited: 0, joined: 0, total: 1 },
    };
  }
  if (path === "/api/allowlist") return { emails: [EMAIL, "*@engineering-platform-with-a-long-subdomain.example.com"] };
  if (path === "/api/admin/support/tickets") return { tickets: ADMIN_TICKETS, support_access: {} };
  const adminTicket = path.match(/^\/api\/admin\/support\/tickets\/([^/]+)$/);
  if (adminTicket) return adminTicketDetail(decodeURIComponent(adminTicket[1]));
  if (path === "/api/admin/dlq") {
    return { messages: DLQ.map((m) => ({ ...m, team_id: "TEAM#your-team", global: false, shared_only: false })), count: 1, unretryable: 1, complete: true };
  }
  if (path === "/api/admin/sign-in-apps") {
    const redirect = `https://app.engineering-platform-with-a-long-subdomain.example.com/settings/integrations/mcp-callback/`;
    return {
      secret_name: `coderhelm/prod/${TOKEN}`,
      apps: [
        { kind: "notion", name: "Notion", app: "Notion public connection (OAuth)", configured: false, source: "", id_key: "notion_client_id", secret_key: "notion_client_secret", console: LONG_URL, scopes: [], redirect_uri: redirect },
        { kind: "confluence", name: "Atlassian (Confluence)", app: "Atlassian OAuth 2.0 (3LO) app", configured: true, source: "atlassian_client_id", id_key: "atlassian_client_id", secret_key: "atlassian_client_secret", console: LONG_URL, scopes: ["read:hierarchical-content:confluence", "read:confluence-content.summary", TOKEN], redirect_uri: redirect },
      ],
    };
  }
  if (path === "/api/admin/usage-check") {
    return { state: "ran", checked_at: iso(60), secret: `coderhelm/prod/${TOKEN}`, day: "2026-10-23", teams: 1234567, flagged_models: 12345, failed_teams: 6789 };
  }
  return undefined;
};
