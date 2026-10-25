import type { Handler } from "./index";
import { RUN_ID } from "./ids";
import { BRANCH, EMAIL, FILE, iso, REPO, REPO_2, SENTENCE, TOKEN } from "./long";

// Agent permissions: the policy, approval cards and the decision log, with
// long repository names, commands, domains and arguments.

const RULES = [
  { id: "preset_write_allow", scope: "team", risk: "write", decision: "allow", source: "preset", note: "Standard: work on the agent's branch runs on its own." },
  { id: "preset_consequential_ask", scope: "team", risk: "consequential", decision: "ask", source: "preset", note: "Standard: actions that reach people ask." },
  { id: "r_wide_repo", scope: "repo", repo: REPO, kind: "mcp", server: "payments-reconciliation-ledger-mcp-server", tool: "create_reconciliation_adjustment_for_customer_*", decision: "deny", source: "manual", created_by: EMAIL, note: SENTENCE },
  { id: "r_wide_agent", scope: "agent", agent: "coder", repo: REPO_2, kind: "command", command: `npm run test:integration -- --filter=${TOKEN}*`, decision: "allow", source: "approval", created_by: EMAIL },
];

export function widePolicy() {
  return {
    policy: {
      version: 7,
      autonomy: "standard",
      rules: RULES,
      switches: { team_off: ["plugin"], repo_off: { [REPO]: ["log_autofix", "alert_fixer"] } },
      pause: { reason: `Release freeze for ${BRANCH}`, by: EMAIL, at: iso(30), until: iso(-120) },
      sandbox: {
        commands: { [REPO]: [{ command: `npm run build:production-bundle-with-source-maps-and-${TOKEN}`, added_by: EMAIL, origin: "manual" }] },
        suggestions: { [REPO]: [{ command: `pnpm --filter @your-team/${BRANCH} run test`, origin: "CI workflow" }] },
        egress: ["registry.npmjs.org", "artifacts.internal.payments-reconciliation.engineering-platform.example.com"],
        limit_egress: true,
      },
      ask_timeout_secs: 900,
      updated_by: EMAIL,
      updated_at: iso(30),
    },
    agents: [
      { key: "planner", label: "Planner", summary: "Reads tickets and code, and writes plans.", on: true, repos_off: [] },
      { key: "coder", label: "Coder", summary: "Writes changes on a branch and opens pull requests.", on: true, repos_off: [] },
      { key: "reviewer", label: "Reviewer", summary: "Reviews pull requests and leaves comments.", on: true, repos_off: [] },
      { key: "plan_chat", label: "Plan chat", summary: "Answers questions and drafts plans in the plan chat.", on: true, repos_off: [] },
      { key: "brain_chat", label: "Chat", summary: "Answers questions from the team's knowledge.", on: true, repos_off: [] },
      { key: "alert_fixer", label: "Alert fixer", summary: "Looks into alerts and proposes fixes.", on: true, repos_off: [REPO] },
      { key: "log_autofix", label: "Log auto-fix", summary: "Fixes log findings on its own when turned on.", on: true, repos_off: [REPO] },
      { key: "plugin", label: "Plugin runs", summary: "Runs the team's installed plugins.", on: false, repos_off: [] },
    ],
    preset: "standard",
    paused: { reason: `Release freeze for ${BRANCH}`, by: EMAIL, at: iso(30), until: iso(-120) },
    pending: 1,
    kinds: ["tool", "mcp", "data_source", "command", "egress", "outbound"],
    default_egress: ["registry.npmjs.org", "pypi.org"],
    can: { edit: true, approve: true },
  };
}

export function wideApproval(over: Record<string, unknown> = {}) {
  return {
    id: "ap_01wide000000000000000001",
    status: "pending",
    agent: "coder",
    kind: "mcp",
    tool: "payments-reconciliation-ledger-mcp-server__create_reconciliation_adjustment_for_customer_account",
    server: "payments-reconciliation-ledger-mcp-server",
    repo: REPO,
    run_id: RUN_ID,
    args: { customer_id: TOKEN, file: FILE, note: SENTENCE, api_token: "(hidden)" },
    args_hash: "h",
    risk: "write",
    why: SENTENCE,
    asked_because: { by: "default", risk: "write" },
    reason: "Changes ask by default.",
    created_at: iso(3),
    expires_at: iso(-12),
    ...over,
  };
}

export const agentsData: Handler = ({ method, path }) => {
  if (method !== "GET") return undefined;
  if (path === "/api/agents/policy") return widePolicy();
  if (path === "/api/agents/approvals") return { approvals: [wideApproval()], can: { approve: true, always: true } };
  if (path.startsWith("/api/agents/approvals/")) return { approval: wideApproval(), can: { approve: true, always: true } };
  if (path === "/api/agents/activity") {
    return {
      events: [
        { id: "e1", at: iso(2), actor: "agent:coder", actor_kind: "agent", action: "tool.queued_for_approval", tool: "payments-reconciliation-ledger-mcp-server__create_reconciliation_adjustment_for_customer_account", risk: "write", result: "waiting", detail: SENTENCE, policy: { agent: "coder", repo: REPO, decision: "ask", rule: "default:write" } },
        { id: "e2", at: iso(9), actor: EMAIL, actor_kind: "person", action: "approval.approved", result: "ok", detail: `Approved always for this repository from Slack: ${TOKEN}`, policy: { decision: "allow" } },
      ],
    };
  }
  return undefined;
};
