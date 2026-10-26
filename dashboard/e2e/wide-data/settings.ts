import type { Handler } from "./index";
import { TOOL_NAME } from "./ids";
import { ARN, BRANCH, EMAIL, FILE, iso, LOG_GROUP, LONG_URL, NOTES, ORG, REPO, REPO_2, SENTENCE, SHA, TOKEN } from "./long";

// Settings, integrations, data sources and team tools.

const ACCOUNT = "123456789012";
const ROLE = "CoderhelmReadOnlyAccessRoleForProductionWorkloadsInUsEast1";
const TOPIC = `arn:aws:sns:us-east-1:${ACCOUNT}:payments-reconciliation-service-production-alarms-high-priority`;
const API_URL = "https://internal-api.payments-reconciliation.engineering-platform.example.com/graphql/v2/readonly";

const REPOS = [
  { name: REPO, enabled: true, ticket_source: "github", onboard_status: "ready", role: "The customer-facing web app and its design system" },
  { name: REPO_2, enabled: true, ticket_source: "jira", onboard_status: "failed", onboard_error: TOKEN },
  { name: `${ORG}/infrastructure-as-code-terraform-modules-and-shared-pipelines`, enabled: false, ticket_source: "github" },
];

const USERS = [
  { user_id: "u_owner", email: EMAIL, name: "Olivia Owner-With-A-Very-Long-Double-Barrelled-Surname", github_login: "olivia-owner-with-a-long-github-login", github_id: null, avatar_url: null, role: "owner", status: "active", sign_in: "email", invited_by: null, last_active_at: iso(60), updated_at: iso(600), is_self: false },
  { user_id: "u_self", email: `dana.${EMAIL}`, name: "Dana Developer", github_login: "dana-developer-with-a-long-login", github_id: null, avatar_url: null, role: "owner", status: "active", sign_in: "github", invited_by: null, last_active_at: iso(5), updated_at: iso(600), is_self: true },
  { user_id: "u_inv", email: `invited.person.${EMAIL}`, name: null, github_login: null, github_id: null, avatar_url: null, role: "member", status: "invited", sign_in: "email", invited_by: EMAIL, last_active_at: null, updated_at: iso(60 * 24), is_self: false },
  { user_id: "u_view", email: `viewer.${EMAIL}`, name: "Jo Viewer", github_login: null, github_id: null, avatar_url: null, role: "viewer", status: "active", sign_in: "email", invited_by: null, last_active_at: iso(60 * 24 * 9), updated_at: iso(60 * 24 * 9), is_self: false },
];

const ROLES = [
  { key: "viewer", label: "Viewer", level: 0, summary: "Read-only: sees runs, plans, reviews and settings, changes nothing.", assignable: true },
  { key: "member", label: "Member", level: 1, summary: "Works with Coderhelm: plans, runs, reviews and recommendations.", assignable: true },
  { key: "admin", label: "Admin", level: 3, summary: "Runs the workspace: repos, integrations, agent settings, the token limit and people.", assignable: true },
  { key: "owner", label: "Owner", level: 4, summary: "Everything, plus account-level changes and managing admins.", assignable: true },
];
const CAPABILITIES = [
  { key: "view", label: "See and search runs, plans, reviews, analytics, repos, tests and settings", min_role: "viewer" },
  { key: "plans", label: "Create, edit, approve and run plans and templates", min_role: "member" },
  { key: "people", label: "Invite people, resend or revoke any pending invite, link GitHub accounts, and change or remove members and viewers", min_role: "admin" },
  { key: "integrations", label: "Connect GitHub, Jira, AWS accounts, monitoring and docs tools, Teams and MCP servers, and choose what each may do", min_role: "admin" },
  { key: "manage_admins", label: "Make someone an admin or owner, and change or remove admins and owners", min_role: "owner" },
];

function awsAbilities() {
  return {
    account: ACCOUNT, region: "us-east-1", role: ROLE, status: "active", checked_at: iso(3), check_error: "",
    logs: { available: true, on: true },
    metrics: { available: true, on: true, switched_off: false },
    airflow: {
      available: true, on: true, switched_off: false,
      found: ["payments-reconciliation-production-airflow-environment", "payments-reconciliation-staging-airflow-environment"],
      skipped: [], environments: ["payments-reconciliation-production-airflow-environment", "payments-reconciliation-staging-airflow-environment"],
    },
    missing: ["cloudwatch:GetMetricDataForAllNamespacesInTheAccount"], update_url: LONG_URL, stack_name: "CoderhelmReadOnlyAccessRoleAddOnStackForMetricsAndAirflow",
  };
}

const AWS_CONNECTION = {
  connection_id: ACCOUNT, role_arn: ARN, external_id: "1b4e28ba-2fa1-11d2-883f-0016d3cca427-and-a-long-suffix", region: "us-east-1", status: "active",
  log_groups: [LOG_GROUP, `${LOG_GROUP}-worker`], last_analyzed_at: iso(40), created_at: iso(60 * 24 * 9), updated_at: iso(60 * 24 * 2),
  abilities: awsAbilities(),
};

const DOES = "Reads your code, opens pull requests, reviews them and follows CI.";
function card(id: string, section: string, name: string, status: string, action: string, over: Record<string, unknown> = {}) {
  return { id, section, name, does: DOES, status, reason: "", action, last_check: iso(5), manage_href: "", detail: {}, ...over };
}
function plugin(id: string, name: string, category: string) {
  return {
    id, name, description: SENTENCE, category, tier: 1, icon: id,
    credential_fields: [{ key: "api_token", label: "API token", placeholder: "tok_...", secret: true }],
    docs_url: LONG_URL, repo_url: LONG_URL, default_prompt: "Read only.", recommended_permissions: "Read-only access",
  };
}
// A remote MCP server added by address, with the longest strings it can carry.
const MCP_SERVER = {
  id: "engineering-docs",
  name: "Engineering documentation and runbooks server",
  url: `https://mcp.engineering-platform-documentation-space.example.com/v1/mcp/${SHA}`,
  catalog_id: "",
  auth: "oauth",
  sharing: "personal",
  header_name: "",
  has_key: false,
  issuer: "https://login.engineering-platform-documentation-space.example.com/oauth2/default",
  registration: "dynamic",
  needs_client: false,
  has_client: true,
  scopes: ["docs:read", "runbooks:read"],
  status: "connected",
  status_reason: "",
  status_at: iso(30),
  my_connection: { status: "needs_reconnect", status_reason: TOKEN, connected_at: iso(60 * 24) },
  tools: [
    { name: "search_engineering_documentation_and_runbooks_by_keyword", title: null, description: SENTENCE, access: "read", allowed: true, approved: true, offerable: true },
    { name: "create_runbook_page_in_the_selected_space", title: null, description: SENTENCE, access: "write", allowed: true, approved: false, offerable: true },
  ],
  skipped: [{ name: TOKEN, reason: "a header mark sits somewhere other than a plain property" }],
  tools_listed_at: iso(30),
  awaiting_approval: ["create_runbook_page_in_the_selected_space"],
  changed_by: EMAIL,
  custom_prompt: SENTENCE,
  added_by: EMAIL,
  added_at: iso(60 * 24 * 3),
};

const INTEGRATIONS = [
  card(`mcp:${MCP_SERVER.id}`, "mcp", MCP_SERVER.name, "needs_reconnect", "reconnect", { reason: TOKEN, detail: { remote: MCP_SERVER } }),
  card("github", "code", "GitHub", "connected", "manage", { reason: `Installed on ${ORG}, with access to ${REPO}.`, manage_href: "/settings/integrations/github" }),
  card("jira", "code", "Jira", "error", "check_again", { reason: TOKEN, manage_href: "/settings/integrations/jira" }),
  card(`aws-${ACCOUNT}`, "cloud", `AWS account ${ACCOUNT}`, "connected", "manage", { manage_href: "/settings/integrations/aws", detail: awsAbilities() }),
  card("newrelic", "monitoring", "New Relic", "connected", "manage", { detail: { kind: "newrelic", label: "New Relic", connected: true, enabled: true, status: "ready", key_hint: "1234", region: "us", account_ids: ["1234567", "7654321"] } }),
  card("confluence", "docs", "Confluence", "connected", "manage", { detail: { kind: "confluence", connected: true, site: "https://engineering-platform-documentation-space.atlassian.net/wiki", email: EMAIL, spaces: ["PAYMENTSRECONCILIATION", "PLATFORMENGINEERING"] } }),
  card("teams", "chat", "Microsoft Teams", "connected", "manage", { detail: { enabled: true, has_webhook: true } }),
  card("slack", "chat", "Slack", "not_connected", "connect", { detail: { enabled: false, has_webhook: false } }),
  card("sentry", "monitoring", "Sentry", "needs_credentials", "add_credentials", {
    reason: "Switched on, but no credentials are saved, so agents don't get it.",
    detail: { plugin: plugin("sentry", "Sentry", "monitoring"), enabled: true, has_credentials: false, custom_prompt: "", last_test_ok: false, last_test_message: TOKEN },
  }),
];

const JIRA_CONFIG = {
  default_project: "WEBPLATFORM", trigger_label: "coderhelm-start-work-on-this-ticket-automatically",
  list_projects_url: `${LONG_URL}/list`, create_ticket_url: `${LONG_URL}/create`, add_comment_url: `${LONG_URL}/comment`,
  site_url: "https://engineering-platform-with-a-long-site-name.atlassian.net",
  projects: [
    { key: "WEBPLATFORM", name: "Web platform frontend monorepo and the shared design system", enabled: true, repo: REPO },
    { key: "PAYMENTSRECON", name: "Payments reconciliation", enabled: false, repo: "" },
  ],
};

const SOURCE_BASE = {
  url: "", status: "ready", enabled: true, setup_complete: true, key_hint: "9x2k", has_mutations: false, kinds: 42,
  schema_available: true, hidden_fields: ["password", "secret", "token", "api_key", "customer_email_address_normalized"],
  repos: [REPO, REPO_2], last_checked_at: iso(10), created_at: iso(60 * 24 * 3), created_by: EMAIL,
};
const SOURCES = [
  { ...SOURCE_BASE, id: "ds_api", kind: "api", name: "internal-api.payments-reconciliation.engineering-platform.example.com", url: API_URL, has_mutations: true, kinds: 14 },
  {
    ...SOURCE_BASE, id: "ds_db", kind: "database", name: "payments-reconciliation-ledger-production-database",
    aws: { account: ACCOUNT, region: "us-east-1", role_arn: ARN, log_groups: [], cluster: "payments-reconciliation-ledger-production-aurora-cluster", database: "reconciliation_ledger_production", engine: "postgres", databases: [] },
  },
  {
    ...SOURCE_BASE, id: "ds_logs", kind: "logs", name: `Logs in AWS account ${ACCOUNT}`, status: "error", status_message: TOKEN, kinds: 2,
    aws: { account: ACCOUNT, region: "us-east-1", role_arn: ARN, log_groups: [LOG_GROUP, `${LOG_GROUP}-worker`], cluster: "", database: "" },
  },
  {
    ...SOURCE_BASE, id: "ds_rest", kind: "rest", name: "Class schedule service REST API", url: `${API_URL}/rest`, kinds: null, schema_available: false,
    header_name: "X-Readonly-Api-Key-For-Coderhelm", paths: ["/v1/programs/{programId}/schedule-entries-for-the-selected-location"], instructions: NOTES,
  },
];

const EVENTS = [
  { at: iso(2), cursor: "c2", source_id: "ds_db", source_name: SOURCES[1].name, actor: "planner", repo: REPO, pr: 12345, summary: `${TOOL_NAME}({"customer_id":"${SHA}"})`, query: `SELECT * FROM reconciliation_ledger_entries_with_a_long_name WHERE customer_id = '${SHA}'`, detail: "1 row", ok: true, outcome: "ok", ms: 120 },
  { at: iso(9), cursor: "c1", source_id: "ds_api", source_name: SOURCES[0].name, actor: EMAIL, repo: REPO_2, pr: 7, summary: "A write was attempted", query: "mutation { deleteEverythingInTheReconciliationLedgerForCustomer(id: 1) }", detail: TOKEN, ok: false, outcome: "refused", ms: 2 },
];

const DEF = {
  name: TOOL_NAME, use_when: `${SENTENCE} Use it when a ticket mentions ${FILE}.`, source: SOURCES[1].name, kind: "sql",
  read: `SELECT ledger.id, ledger.status, ledger.amount_in_minor_units, ledger.reconciliation_batch_identifier FROM reconciliation_ledger_entries_with_a_long_name AS ledger WHERE ledger.customer_id = :customer_id AND ledger.created_at BETWEEN :from_date AND :to_date`,
  inputs: {
    customer_id: { type: "string", pattern: "[a-f0-9]{40}", example: SHA, description: SENTENCE },
    from_date: { type: "date", example: "2026-01-01" },
    to_date: { type: "date", example: "2026-01-31" },
  },
  max_rows: 20, repos: [REPO],
};
const EXAMPLE = JSON.stringify({ ok: true, sent: `SELECT * FROM (${DEF.read}) AS coderhelm_lookup LIMIT 20`, result: `[\n  { "id": 7, "status": "reconciled", "reconciliation_batch_identifier": "${SHA}" }\n]`, hidden_count: 1, ms: 140, note: "1 row" });
const VERSION = { hash: `${SHA.slice(0, 16)}`, def: DEF, author: EMAIL, origin: `repo ${REPO}@${SHA} .coderhelm/tools/${TOOL_NAME}.yaml`, created_at: iso(60), example: EXAMPLE, example_ok: true };
const TOOL = {
  name: TOOL_NAME, enabled: true, approved: VERSION.hash, approved_by: EMAIL, approved_at: iso(30), latest: VERSION.hash,
  created_by: EMAIL, created_at: iso(60 * 24), awaiting_approval: false, latest_version: VERSION, approved_version: null,
};
const TOOL_2 = { ...TOOL, name: `${TOOL_NAME}_v2_with_more_columns`, approved: "", approved_by: "", approved_at: "", awaiting_approval: true };
const ASKS = [
  { id: "ask_1", tool: TOOL_NAME, hash: VERSION.hash, inputs: { customer_id: SHA }, actor: "planner", repo: REPO, pr: 12345, why: SENTENCE, status: "pending", created_at: iso(3), decided_by: "", expires_in_s: 3000 },
];

const GIT_DEFAULTS = { branch: "coderhelm/{ticket_lower}", commit: "{ticket}: {title}", pr_title: "{ticket}: {title}" };

const WIDE_DELIVERY_ROW = {
  id: "github:4f1c2a9e-8b7d-6c5f-4e3d-2c1b0a9f8e7d6c5b4a39", direction: "inbound", source: "github", event: "pull_request_review_comment.created_with_a_long_suffix_for_testing",
  target: LONG_URL, status: "failed", outcome: TOKEN, reason: "handler_error", external_id: SHA, repo: REPO, pr: 12345, created_at: iso(31), duration_ms: 40_000, attempts: 2, next_retry_at: null,
};

export const settingsData: Handler = ({ method, path, url }) => {
  if (method !== "GET") return undefined;
  const p = decodeURIComponent(path);

  if (p === "/api/repos") return { repos: REPOS };
  // Deliveries: long ids, a long repository and target, an unbroken error.
  if (p === "/api/deliveries") return { deliveries: [WIDE_DELIVERY_ROW, { ...WIDE_DELIVERY_ROW, id: "relay:01JWIDE0000000000000000002", source: "relay", status: "pending", next_retry_at: iso(-5) }], summary: { total: 120, ok: 117, failed: 2, pending: 1, success_rate: 0.975, oldest_pending_at: iso(12), last_failure_at: iso(30) }, sources: ["github", "relay", "slack"], retention_days: 14, sharing: { available: true, enabled: false, payloads: false }, hybrid: true };
  if (p === `/api/deliveries/${WIDE_DELIVERY_ROW.id}`) {
    return {
      delivery: { ...WIDE_DELIVERY_ROW, attempts: [{ at: iso(31), code: 502, duration_ms: 10_000, error: TOKEN }, { at: iso(30), duration_ms: 30_000, error: SENTENCE }], headers: { "x-github-event": "pull_request", "x-github-delivery": SHA, "x-hub-signature-256": "[redacted]", "user-agent": LONG_URL }, payload_preview: JSON.stringify({ repository: { full_name: REPO }, html_url: LONG_URL, token: TOKEN }), payload_bytes: 48_213, redeliver: "github" },
      reason: { code: "handler_error", message: SENTENCE, fix: `${SENTENCE} ${LONG_URL}` },
      can_redeliver: true,
    };
  }
  if (p === "/api/users") return { users: USERS };
  // Sign-in (self-hosted): long domains, long names and an unbroken email.
  if (p === "/api/sign-in") {
    return {
      self_hosted: true,
      is_org: true,
      domains: ["payments-reconciliation.engineering-platform.example.com", "example.com"],
      require_2fa: true,
      require_2fa_since: iso(60 * 24 * 3),
      pending_invites: 12,
      people: [
        { user_id: "u1", email: EMAIL, name: "", github_login: "", role: "owner", two_factor: "cognito", is_self: true },
        { user_id: "u2", email: EMAIL, name: "Alexandria Montgomery-Fitzwilliam the Third", github_login: "", role: "admin", two_factor: "app", is_self: false },
        { user_id: "u3", email: "", name: "", github_login: "a-very-long-github-login-name-for-testing", role: "member", two_factor: null, is_self: false },
      ],
      api_keys: [{ id: "k1", name: "Nightly-release-notes-and-deploy-pipeline-k1", created_by: EMAIL }],
      your_session_has_2fa: true,
    };
  }
  // API keys: a long name, a long maker, and every scope.
  if (p === "/api/api-keys") {
    const key = (id: string, status: string, over: Record<string, unknown> = {}) => ({
      id, name: `Nightly-release-notes-and-deploy-pipeline-${id}`, hint: "chk_01jb8x...k0ha", scopes: ["view", "plans", "runs"],
      rate_limit_per_minute: 3000, created_at: iso(60 * 24 * 40), created_by: EMAIL, expires_at: iso(-60 * 24 * 300),
      last_used_at: iso(4), revoked_at: null, revoked_by: null, status, ...over,
    });
    return {
      keys: [key("k1", "active"), key("k2", "revoked", { revoked_at: iso(60), revoked_by: EMAIL })],
      scopes: [
        { key: "view", label: "See and search runs, plans, reviews, analytics, repos, tests and settings", always: true, allowed: true },
        { key: "plans", label: "Create, edit, approve and run plans and templates", always: false, allowed: true },
        { key: "runs", label: "Retry, re-run, re-review, cancel, close or reopen runs", always: false, allowed: true },
      ],
      limits: { default_rate_per_minute: 600, min_rate_per_minute: 10, max_rate_per_minute: 3000, max_expiry_days: 365, max_keys: 50 },
    };
  }
  // Custom roles: a long name and description, and a long log line.
  if (p === "/api/roles") {
    return {
      roles: [
        {
          id: "r_wide", key: "custom:r_wide", name: "Release-and-quality-engineering-lead", description: `${SENTENCE} ${TOKEN}`,
          capabilities: ["view", "plans", "people"], acts_as: "viewer", template: "member", member_count: 3, created_at: iso(600), updated_at: iso(60),
        },
      ],
      can_manage: true, max_roles: 30, customizable: ["plans", "people"], baseline: ["view"], yours: ["view", "plans", "people"],
      templates: { viewer: [], member: ["plans"], admin: ["plans", "people"] },
    };
  }
  if (p === "/api/roles/audit") {
    return { entries: [{ at: iso(30), actor: EMAIL, action: "updated", role_id: "r_wide", role_name: "Release-and-quality-engineering-lead", detail: `Added: ${SENTENCE} ${TOKEN}` }] };
  }
  if (p === "/api/users/permissions") {
    return { roles: ROLES, capabilities: CAPABILITIES, your_role: "owner", grantable_roles: ["viewer", "member", "admin", "owner"], manageable_roles: ["viewer", "member", "admin", "owner"], can_manage_invites: true };
  }
  if (p === "/api/notifications") return { email_token_warning: true, email_weekly_summary: true, email_run_complete: false, email_run_failed: true };
  if (p === "/api/github/installation-status") return { status: "connected", github_org: `${ORG}-engineering-platform-organization`, installation_id: 123456789 };

  // Integrations
  if (p === "/api/integrations") return { can_edit: true, items: INTEGRATIONS, migrated: 0 };
  if (p === "/api/mcp-servers") return { servers: [MCP_SERVER], can_edit: true, redirect_uri: "https://app.coderhelm.com/settings/integrations/mcp-callback/" };
  if (p === `/api/mcp-servers/${MCP_SERVER.id}`) return { server: MCP_SERVER };
  if (p === `/api/mcp-servers/${MCP_SERVER.id}/activity`) {
    return { calls: [{ tool: MCP_SERVER.tools[0].name, actor: `planner, run ${SHA}`, ok: false, ms: 1200, detail: TOKEN, at: iso(10) }] };
  }
  if (p === "/api/integrations/jira/check") {
    return { ready: true, secret_configured: true, configured_repos: { total: 2, enabled: 2 }, enabled_repos: [REPO, REPO_2], jira_events_seen: true, last_jira_event_at: iso(120), jira_event_count: 41, installation_id: 7, team_id: "t_1", forge_secret: `forge-secret-${SHA}${SHA}` };
  }
  if (p === "/api/integrations/jira/config") return JIRA_CONFIG;
  if (p === "/api/integrations/jira/events") {
    return { events: [{ event_id: "e1", event_type: "issue_updated", ticket_key: "WEBPLATFORM-123456", title: SENTENCE, status: "processed", repo: REPO, created_at: iso(120) }], total: 1 };
  }
  if (p === "/api/aws-connections") return { connections: [AWS_CONNECTION] };
  if (p === `/api/aws-connections/${ACCOUNT}/log-groups`) {
    return { log_groups: [{ name: LOG_GROUP, stored_bytes: 5_000_000, retention_days: 30 }, { name: `${LOG_GROUP}-worker`, stored_bytes: 1_000_000, retention_days: 14 }] };
  }
  if (p === "/api/recommendations") {
    return { recommendations: [{ rec_id: "rec_1", status: "pending", severity: "critical", title: SENTENCE, summary: TOKEN, suggested_action: `Raise the pool size in ${FILE}.`, source_log_group: LOG_GROUP, error_count: 1204, created_at: iso(180) }] };
  }
  if (p === "/api/recommendations/notify") return { notify_mode: "team", webhooks: { teams: { set: true, hint: "example.environment.api.powerplatform.com …ab12" }, slack: { set: false, hint: "" } } };
  if (p === "/api/connectors") {
    return {
      connectors: [
        { kind: "newrelic", label: "New Relic", connected: true, status: "ready", key_hint: "1234", region: "us", account_ids: ["1234567"] },
        { kind: "confluence", label: "Confluence", connected: true, site: "https://engineering-platform-documentation-space.atlassian.net/wiki", email: EMAIL, spaces: ["PAYMENTSRECONCILIATION"] },
        { kind: "metrics", label: "CloudWatch metrics", connected: false },
        { kind: "airflow", label: "Airflow (MWAA)", connected: false },
      ],
      aws_accounts: [{ account: ACCOUNT, region: "us-east-1", role: ROLE }],
    };
  }

  // Settings
  if (p === "/api/settings/workflow") return { commit_openspec: true, default_destination: "github", allow_plan_log_analyzer: true };
  if (p === "/api/settings/git-conventions") {
    return { branch: "coderhelm/{ticket_lower}-{slug}-and-a-long-suffix-for-the-branch", commit: "{ticket}: {title}", pr_title: "{ticket}: {title}", defaults: GIT_DEFAULTS, tokens: ["ticket", "ticket_lower", "slug", "summary", "title"] };
  }
  if (p === "/api/settings/model-provider") return { provider: "anthropic", api_key_masked: "sk-ant-api03-…AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", primary_model: null, heavy_model: null };
  const scoped = p.match(/^\/api\/(rules|voice|instructions|agents)\/(global|repo\/(.+))$/);
  if (scoped) {
    if (scoped[1] === "rules") return { rules: [`Never edit generated files under ${FILE}`, TOKEN, `Branch names look like ${BRANCH}`] };
    return { content: `${NOTES}\n\nSee ${LONG_URL}.\n\n${TOKEN}` };
  }

  // Data sources
  if (p === "/api/data-sources") return { sources: SOURCES };
  if (p === "/api/data-sources/activity") return { events: EVENTS };
  if (p === "/api/activity/summary") {
    return { days: Number(url.searchParams.get("days") || 7), since: iso(60 * 24 * 7), skills: { reads: 1204, asks: 12, read_problems: 3, ask_problems: 1, applies: 4 }, lookups: { total: 980, ok: 960, refused: 12, failed: 8 } };
  }
  // The install's setup checks and update readiness: long ids, URLs and
  // commands, so Settings, then Setup and System keep to the screen.
  if (p === "/api/system/checks" || p === "/api/system/preflight") {
    const check = {
      key: "email_identity", group: "Email", label: "Email sender verified", status: "fail",
      detail: `${LONG_URL} isn't verified yet (DKIM pending).`,
      why: "Mail without DKIM lands in spam.",
      fix: { text: `Add these DNS records for ${ORG}:`, command: `${TOKEN}._domainkey.${ORG}.example CNAME ${TOKEN}.dkim.amazonses.com`, url: LONG_URL, href: "/settings/alerts" },
    };
    if (p === "/api/system/checks") return { checked_at: "2026-01-01T00:00:00Z", summary: { pass: 0, warn: 0, fail: 1, skip: 0, ready: false }, checks: [check] };
    return { checked_at: "2026-01-01T00:00:00Z", ready: false, current: "v0.7.0", latest: "v0.8.0", blockers: [{ key: "email_identity", severity: "block", detail: check.detail, fix: check.fix }], checks: [check] };
  }
  if (p === "/api/data-sources/aws/setup") {
    return {
      script: `coderhelm_setup() (\n  aws iam create-role --role-name ${ROLE} --assume-role-policy-document file://coderhelm-trust-policy-with-external-id.json --tags Key=managed-by,Value=coderhelm\n)\ncoderhelm_setup\n`,
      existing: [{ role_arn: ARN, account: ACCOUNT, region: "us-east-1", log_groups: [LOG_GROUP] }],
      role_prefix: "CoderhelmReadOnly",
    };
  }
  const hs = p.match(/^\/api\/data-sources\/([^/]+)\/hidden-suggestions$/);
  if (hs) return { suggestions: [{ entry: "customer_email_address_normalized_lowercase", reason: SENTENCE }], dismissed: [], checked_at: iso(60) };
  const ds = p.match(/^\/api\/data-sources\/([^/]+)\/samples$/);
  if (ds) return { samples: [{ label: `Count rows in ${SOURCES[1].name}`, query: DEF.read }] };

  // Team tools
  if (p === "/api/tools") return { tools: [TOOL, TOOL_2], pending_asks: 1 };
  if (p === "/api/tools/asks") return { asks: ASKS };
  const tool = p.match(/^\/api\/tools\/([^/]+)$/);
  if (tool) {
    const t = [TOOL, TOOL_2].find((x) => x.name === tool[1]);
    if (t) return { tool: t, versions: [VERSION], asks: ASKS };
  }
  return undefined;
};
