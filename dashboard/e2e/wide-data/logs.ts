import type { Handler } from "./index";
import { FILE, iso, LOG_GROUP, LONG_URL, PR_URL, REPO, SENTENCE, TITLE, TOKEN } from "./long";

// The Logs page: findings from the team's AWS logs and the automatic fix PR setting.

const DAY_MIN = 24 * 60;

function finding(over: Record<string, unknown>) {
  return {
    rec_id: "rec_wide_1",
    title: TITLE,
    summary: `${SENTENCE} ${TOKEN}`,
    suggested_action: `Add a timeout to the client in ${FILE} and retry once. ${LONG_URL}`,
    severity: "critical",
    status: "new",
    log_group: LOG_GROUP,
    account_id: "123456789012",
    error_pattern: TOKEN,
    error_count: 41_200,
    seen_count: 12,
    first_seen: iso(3 * DAY_MIN),
    last_seen: iso(30),
    suspected_location: FILE,
    plan_id: null,
    repo: null,
    repo_mapped: false,
    console_url: `https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups/log-group/${encodeURIComponent(LOG_GROUP)}`,
    fix: null,
    auto: null,
    ...over,
  };
}

const FINDINGS = [
  finding({}),
  finding({
    rec_id: "rec_wide_2",
    status: "fixing",
    severity: "warning",
    repo: REPO,
    repo_mapped: true,
    fix: { state: "pr_open", ticket_id: "LOG-4F1C2A9E8B7D6C5F", run_id: "01RUNWIDE00000000000000001", run_status: "completed", pr_number: 12345, pr_url: PR_URL, auto: true, started_at: iso(90) },
    auto: { status: "started", reason: "" },
  }),
  finding({ rec_id: "rec_wide_3", severity: "info", auto: { status: "skipped", reason: `daily cap reached for ${LOG_GROUP}` } }),
  // Stopped, with the change that explains it: long values in every field.
  finding({
    rec_id: "rec_wide_4",
    status: "stopped",
    last_seen: iso(35 * 60),
    quiet_days: 1,
    quiet_basis: "change",
    resolves_at: iso(11 * 60),
    resolve: { state: "due", at: iso(11 * 60) },
    activity: {
      state: "stopped",
      quiet_checks: 5,
      normal_checks: 5,
      checked_at: iso(20),
      scanned: 100_800_000,
      minutes: 1440,
      change: { kind: "merge", repo: REPO, at: iso(36 * 60), title: `${TITLE} ${TOKEN}`, url: LONG_URL },
    },
    auto: { status: "waiting", reason: `the error stopped (${SENTENCE}); a fix starts if it comes back` },
  }),
  // The repo is a genuine tie: one click on a candidate.
  finding({
    rec_id: "rec_wide_5",
    auto: { status: "skipped", reason: `the evidence is split on the repo (best guess ${REPO}); choose one` },
    repo_ask: {
      guess: REPO,
      reason: SENTENCE,
      candidates: [
        { repo: REPO, reason: SENTENCE },
        { repo: `${REPO}-with-a-much-longer-name-than-most`, reason: `${SENTENCE} ${TOKEN}` },
      ],
    },
  }),
];

const AUTOFIX = {
  enabled: true,
  min_severity: "critical",
  daily_cap: 3,
  scope: "listed",
  quiet_hours: { start_hour: 22, end_hour: 6 },
  overrides: [{ log_group: LOG_GROUP, repo: REPO, auto: true, min_severity: null }],
  enabled_at: iso(5 * DAY_MIN),
};

export const logsData: Handler = ({ method, path }) => {
  if (method !== "GET") return undefined;
  if (path === "/api/log-findings") {
    return { findings: FINDINGS, counts: { new: 3, acknowledged: 0, fixing: 1, stopped: 1, fixed: 0, ignored: 0 }, log_groups: [LOG_GROUP], aws_connected: true };
  }
  if (path === "/api/log-findings/autofix") return { autofix: AUTOFIX, runs_today: 1 };
  if (/^\/api\/log-findings\/[^/]+\/samples$/.test(path)) return { samples: [{ timestamp: iso(31), message: TOKEN.repeat(3) }] };
  return undefined;
};
