import type { Handler } from "./index";
import { EMAIL, FILE, FILE_2, iso, LONG_URL, PR_URL, REPO, REPO_2, SENTENCE, TITLE, TOKEN } from "./long";
import { SECURITY_FINDING_ID } from "./ids";

// Security fixes: findings with long advisory titles, package names, paths
// and evidence lines, in every tier and verdict, the policy with long labels,
// repos and ignores, and the preview.

const HOUR = 60;

const finding = (over: Record<string, unknown>) => ({
  id: SECURITY_FINDING_ID,
  repo: REPO,
  manifest: "packages/web-platform-frontend/apps/customer-portal/pnpm-lock.yaml",
  ecosystem: "npm",
  package: "@your-team/http-client-with-retries-and-circuit-breaker",
  version: "6.19.2-canary.20260101.4f1c2a9e8b7d",
  fixed_version: "6.21.1",
  advisory: {
    ids: ["CVE-2026-31337", "GHSA-q9fx-2w5c-8m4r", "PYSEC-2026-123456789"],
    primary: "CVE-2026-31337",
    title: `Request smuggling in the HTTP parser: ${TITLE}`,
    summary: `${SENTENCE} ${TOKEN}`,
    cvss: 9.1,
    cvss_vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N/E:H/RL:O/RC:C/CR:H/IR:H/AR:H",
    epss: 0.71,
    epss_percentile: 0.993,
    kev: true,
    kev_due: iso(-14 * 24 * HOUR),
    malware: false,
    cwe: ["CWE-444", "CWE-20"],
    published_at: iso(3 * 24 * HOUR),
    urls: [LONG_URL, "https://osv.dev/vulnerability/GHSA-q9fx-2w5c-8m4r"],
    source: "dependabot",
  },
  scope: "runtime",
  relation: "transitive",
  path: ["web-platform-frontend-monorepo-with-a-long-name", "next 15.4.2", "@your-team/http-client-with-retries-and-circuit-breaker 6.19.2"],
  verdict: "reachable",
  evidence: {
    summary: `The vulnerable function Parser.onHeadersComplete runs on every request through the proxy route. ${SENTENCE}`,
    lines: [
      { file: FILE, line: 44, text: "fetch(upstream, { dispatcher: agentWithPipeliningEnabledForTheUpstreamScheduleService })" },
      { file: FILE_2, line: 12, text: `new Agent({ pipelining: 1 }) // ${TOKEN}` },
    ],
    checked: "3 symbols from the fix commit, 2 call sites, the deployment config",
    confidence: "high",
  },
  tier: "P0",
  due_at: iso(-31 * HOUR),
  status: "pr_open",
  pr: { number: 12345, url: PR_URL, ci: "passing", state: "open", adopted: true },
  dependabot_alert: { number: 88, url: `https://github.com/${REPO}/security/dependabot/88` },
  dismissed: null,
  first_seen_at: iso(4 * HOUR),
  updated_at: iso(30),
  ...over,
});

const FINDINGS = [
  finding({}),
  finding({ id: "sec_wide_2", repo: REPO_2, tier: "P1", status: "fixing", pr: { number: 812, url: PR_URL, ci: "failing", state: "open", adopted: false }, due_at: iso(-5 * 24 * HOUR) }),
  finding({ id: "sec_wide_3", tier: "P2", verdict: "not_reachable", status: "open", pr: null, due_at: iso(-27 * 24 * HOUR) }),
  finding({ id: "sec_wide_4", tier: "P3", verdict: "not_loaded", scope: "dev", status: "open", pr: null, due_at: iso(2 * HOUR), advisory: { ...finding({}).advisory, kev: false, malware: true } }),
  finding({ id: "sec_wide_5", tier: "P2", verdict: "unknown", status: "no_fix", fixed_version: null, pr: null }),
];

const CONFIG = {
  enabled: true,
  dry_run: false,
  open_prs: { P0: "now", P1: "hour", P2: "daily", P3: "weekly" },
  post_alerts: { P0: true, P1: true, P2: false, P3: false },
  escalate_half: true,
  due_days: { P0: 3, P1: 7, P2: 30, P3: 90 },
  use_kev_due: true,
  labels: ["security", "dependencies", "needs-review-by-the-platform-security-team-before-merge"],
  severity_labels: true,
  reachability_labels: true,
  ecosystem_labels: true,
  major_bumps: "fix_in_pr",
  adopt_bot_prs: true,
  repos: [REPO, REPO_2],
  ignore: [{ advisory: "GHSA-7fh5-64p2-3v2j", repo: REPO, reason: `Build-time only. ${SENTENCE} ${TOKEN}`, until: "2099-01-31", by: EMAIL }],
  triage_tokens_per_day: 5_000_000,
  max_fix_runs_per_day: 20,
  max_fix_tokens_per_day: 50_000_000,
  max_cards_per_day: 100,
};

// One row per fix: the findings as groups, long package names and every state.
const GROUPS = FINDINGS.map((f, i) => ({
  key: `${f.repo}|npm|${f.package}|${f.version}|${i}`,
  repo: f.repo,
  ecosystem: f.ecosystem,
  package: f.package,
  version: f.version,
  fixed_version: f.fixed_version,
  no_fix: f.fixed_version ? 0 : 3,
  tier: f.tier,
  tier_provisional: i === 2,
  due_at: f.due_at,
  status: f.status,
  verdict: i === 2 ? "pending" : f.verdict,
  scope: f.scope,
  kev: f.advisory.kev,
  malware: f.advisory.malware,
  epss: f.advisory.epss,
  manifests: [f.manifest],
  pr: f.pr,
  finding_ids: [f.id, `${f.id}_b`, `${f.id}_c`],
  advisories: [0, 1, 2].map((k) => ({ finding_id: `${f.id}_${k}`, primary: f.advisory.primary, ids: f.advisory.ids, title: f.advisory.title, tier: f.tier, fixed_version: f.fixed_version, status: f.status })),
  waiting: i === 2 ? `Waiting: today's 20 fix runs are used. Next starts tomorrow. ${TOKEN}` : null,
  evidence: f.evidence,
}));

const SOURCE_ROWS = ["dependabot", "osv", "github_advisory", "kev", "epss"].map((id, i) => ({
  id,
  name: ["Dependabot alerts", "OSV (by API)", "GitHub advisory feed", "CISA known exploited list", "FIRST EPSS"][i],
  gives: `${SENTENCE} ${TOKEN}`,
  state: ["needs_permission", "error", "never", "ok", "ok"][i],
  reason: i < 3 ? `${SENTENCE} ${LONG_URL}` : "",
  synced_at: i === 2 ? null : iso(60),
  count: 123456,
  listed: i === 3 ? 1484 : undefined,
}));

const INVENTORY = [REPO, REPO_2].map((repo, i) => ({
  repo,
  packages: 123456,
  ecosystems: { npm: 120000, "GitHub Actions": 3000, "crates.io-with-a-long-ecosystem-name": 456, docker: 2000 },
  read_at: i ? null : iso(60),
  state: i ? "graph_off" : "ok",
  reason: i ? `GitHub's dependency graph is off for this repo; turn it on in the repo's Settings, Code security. ${LONG_URL}` : "",
  unpinned: 42,
  dependabot: "not_accepted",
  dependabot_reason: `${SENTENCE} ${TOKEN}`,
  osv_error: i ? `OSV answered 503 ${TOKEN}` : null,
}));

export const securityData: Handler = ({ method, path }) => {
  if (method !== "GET") return undefined;
  if (path === "/api/security/overview")
    return {
      enabled: true,
      dry_run: false,
      counts: { open: 14, p0: 1, p1: 1, p2: 7, p3: 5, due_7d: 5, fixed_30d: 23, dismissed: 4, noise_removed: 61 },
      median_hours_to_merge_30d: 19,
      next_due_at: iso(-41 * HOUR),
      groups: { open: 12345, p0: 1234, p1: 1234, p2: 1234, p3: 1234, due_7d: 1234 },
      verdicts: { settled: 12345, checking: 12345 },
      sources: { dependabot: "not_accepted", dependabot_reason: `${SENTENCE} ${LONG_URL}`, osv: { synced_at: iso(60), mode: "api" }, kev_synced_at: iso(60), epss_synced_at: iso(60) },
      source_rows: SOURCE_ROWS,
      repos: INVENTORY,
      spend: {
        triage: { packages_today: 123456, tokens_today: 4_999_999, tokens_limit: 5_000_000, tokens_month: 123_456_789 },
        fix: { runs_today: 20, runs_limit: 20, tokens_today: 49_999_999, tokens_limit: 50_000_000, tokens_month: 987_654_321 },
        cards: { today: 100, limit: 100 },
        tokens_month: 1_111_111_110,
      },
      permission_missing: true,
    };
  if (path === "/api/security/groups") return { groups: GROUPS, total: 12345, next_cursor: "50" };
  if (path === "/api/security/insights")
    return {
      days: Array.from({ length: 30 }, (_, i) => ({ date: iso((29 - i) * 24 * HOUR).slice(0, 10), opened: 12345, fixed: 1234, prs_opened: 123, prs_merged: 120, tokens: 4_999_999 })),
      totals: { opened: 370350, fixed: 37020, prs_opened: 3690, prs_merged: 3600, tokens: 149_999_970, tokens_month: 123_456_789 },
      median_hours_to_fix: { P0: { fixed: 12, median_hours: 20 }, P1: { fixed: 34, median_hours: 52 }, P2: { fixed: 560, median_hours: 700 }, P3: { fixed: 7, median_hours: null } },
      fix_tokens_month: 987_654_321,
      enabled: true,
    };
  if (path === "/api/security/findings") return { findings: FINDINGS, next_cursor: "cursor_wide" };
  if (path.startsWith("/api/security/findings/"))
    return {
      finding: finding({ dismissed: { by: EMAIL, reason: `${SENTENCE} ${TOKEN}`, until: iso(-30 * 24 * HOUR), at: iso(60) } }),
      timeline: [
        { at: iso(4 * HOUR), text: "Dependabot alert #88 received", link: `https://github.com/${REPO}/security/dependabot/88` },
        { at: iso(4 * HOUR), text: `Matched 3 IDs, one finding. ${TOKEN}`, link: null },
        { at: iso(3 * HOUR), text: "Verdict: reachable", link: null },
        { at: iso(2 * HOUR), text: `Pull request #12345 opened on ${REPO}`, link: PR_URL },
      ],
    };
  if (path === "/api/security/config") return { config: CONFIG, defaults: { ...CONFIG, enabled: false, dry_run: true, repos: "all", ignore: [], labels: ["security", "dependencies"] } };
  if (path === "/api/security/preview")
    return { would_open: [{ finding_id: SECURITY_FINDING_ID, repo: REPO, title: TITLE, tier: "P0", branch: "coderhelm/security-at-your-team-http-client-with-retries-and-circuit-breaker-6.21.1", labels: ["security", "dependencies", "needs-review-by-the-platform-security-team-before-merge"] }], would_post: [{ finding_id: SECURITY_FINDING_ID, repo: REPO, title: TITLE, tier: "P0" }] };
  return undefined;
};
