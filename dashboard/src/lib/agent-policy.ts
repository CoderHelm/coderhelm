// Agent permissions: the shapes the gateway's /api/agents routes send, and
// the words the settings page, approval cards and sign-in cards show. The
// engine itself lives in the platform (common::agent_policy); nothing here
// decides anything, it only describes.

export type Decision = "allow" | "ask" | "deny";
export type Risk = "read" | "write" | "consequential";
export type Scope = "team" | "repo" | "agent";
export type Autonomy = "read_only" | "standard" | "full";
export type CallKind = "tool" | "mcp" | "data_source" | "command" | "egress" | "outbound";
export type AgentKey =
  | "planner" | "coder" | "reviewer" | "plan_chat" | "brain_chat" | "alert_fixer" | "log_autofix" | "plugin";
export type Preset = "cautious" | "standard" | "autonomous";

export interface Rule {
  id: string;
  scope: Scope;
  repo?: string;
  agent?: AgentKey;
  kind?: CallKind;
  server?: string;
  tool?: string;
  risk?: Risk;
  command?: string;
  decision: Decision;
  locked?: boolean;
  note?: string;
  source?: "manual" | "approval" | "preset";
  created_by?: string;
  created_at?: string;
}

export interface Pause {
  reason: string;
  by: string;
  at: string;
  until?: string;
}

export interface AllowedCommand {
  command: string;
  added_by?: string;
  origin?: string;
}

export interface CommandSuggestion {
  command: string;
  origin: string;
}

export interface TeamPolicy {
  version: number;
  autonomy: Autonomy;
  rules: Rule[];
  switches: { team_off: AgentKey[]; repo_off: Record<string, AgentKey[]> };
  pause?: Pause | null;
  sandbox: {
    commands: Record<string, AllowedCommand[]>;
    suggestions: Record<string, CommandSuggestion[]>;
    egress: string[];
    limit_egress: boolean;
  };
  ask_timeout_secs: number;
  updated_by?: string;
  updated_at?: string;
}

export interface AgentRow {
  key: AgentKey;
  label: string;
  summary: string;
  on: boolean;
  repos_off: string[];
}

export interface PolicyView {
  policy: TeamPolicy;
  agents: AgentRow[];
  preset: Preset | null;
  paused: Pause | null;
  pending: number;
  kinds: CallKind[];
  default_egress: string[];
  can: { edit: boolean; approve: boolean };
  resumed?: number;
}

export type DecidedBy =
  | { by: "rule"; id: string; scope: Scope; label: string }
  | { by: "default"; risk: Risk }
  | { by: "agent_off"; scope: Scope }
  | { by: "paused"; reason: string }
  | { by: "unknown" }
  | { by: "command_allowlist"; command: string }
  | { by: "egress_allowlist" }
  | { by: "grant"; approval_id: string };

export interface Verdict {
  decision: Decision;
  risk?: Risk | null;
  decided_by: DecidedBy;
  reason: string;
  capped?: boolean;
}

export interface Considered {
  id: string;
  label: string;
  matched: boolean;
  note: string;
}

export interface TestResult {
  call: { agent: AgentKey; kind: CallKind; tool: string; server?: string; repo?: string; command?: string };
  risk: Risk | null;
  verdict: Verdict;
  considered: Considered[];
}

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";
export type Choice = "once" | "always_repo" | "always_tool";
export type Via = "run_page" | "chat" | "settings" | "slack" | "teams" | "email";

export interface Approval {
  id: string;
  status: ApprovalStatus;
  agent: AgentKey;
  kind: CallKind;
  tool: string;
  server?: string;
  repo?: string;
  command?: string;
  run_id?: string;
  thread_id?: string;
  requested_for?: string;
  args: unknown;
  args_hash: string;
  risk?: Risk | null;
  why: string;
  asked_because: DecidedBy;
  reason: string;
  created_at: string;
  expires_at: string;
  decided_by?: string;
  decided_via?: Via;
  decided_at?: string;
  choice?: Choice;
  note?: string;
  rule_id?: string;
}

export interface ApprovalCan {
  approve: boolean;
  always: boolean;
}

export interface SignInPrompt {
  server_id: string;
  server_name: string;
  need: "personal" | "team_missing";
  message: string;
  action_label?: string;
  action_path?: string;
  link_path: string;
  ask_admin?: boolean;
}

export interface AgentEvent {
  id: string;
  at: string;
  actor: string;
  actor_kind: "person" | "agent" | "schedule" | "system";
  action: string;
  run_id?: string;
  approval_id?: string;
  tool?: string;
  risk?: string;
  result: string;
  detail?: string;
  policy?: { agent?: string; repo?: string; decision?: string; rule?: string; thread_id?: string };
}

export const AGENT_LABELS: Record<AgentKey, string> = {
  planner: "Planner",
  coder: "Coder",
  reviewer: "Reviewer",
  plan_chat: "Plan chat",
  brain_chat: "Chat",
  alert_fixer: "Alert fixer",
  log_autofix: "Log auto-fix",
  plugin: "Plugin runs",
};

export const AUTONOMY_OPTIONS: { value: Autonomy; label: string; help: string }[] = [
  { value: "read_only", label: "Read only", help: "Agents only read on their own. Every change asks first." },
  { value: "standard", label: "Standard", help: "Agents read and work on their own branch on their own. Anything that reaches people asks first." },
  { value: "full", label: "Full", help: "Rules may let anything run without asking, including what reaches people." },
];

export const PRESETS: { value: Preset; label: string; help: string }[] = [
  { value: "cautious", label: "Cautious", help: "Agents read on their own and ask before every change." },
  { value: "standard", label: "Standard", help: "Agents work on their branch on their own; anything that reaches people asks." },
  { value: "autonomous", label: "Autonomous within the limit", help: "Every change runs on its own, up to the autonomy limit." },
];

export const KIND_LABELS: Record<CallKind, string> = {
  tool: "Built-in tool",
  mcp: "MCP tool",
  data_source: "Data source query",
  command: "Sandbox command",
  egress: "Network request",
  outbound: "Outbound action",
};

export const RISK_LABELS: Record<Risk, string> = {
  read: "Read",
  write: "Write",
  consequential: "Reaches people",
};

export const DECISION_LABELS: Record<Decision, string> = {
  allow: "Allow",
  ask: "Ask",
  deny: "Deny",
};

/** What decided a call, in plain words. */
export function decidedByText(d: DecidedBy): string {
  switch (d.by) {
    case "rule":
      return d.label;
    case "default":
      return `No rule matched, so the default for ${RISK_LABELS[d.risk].toLowerCase()} actions applies`;
    case "agent_off":
      return d.scope === "repo" ? "The agent is switched off for this repository" : "The agent is switched off for the team";
    case "paused":
      return d.reason ? `All agents are paused: ${d.reason}` : "All agents are paused";
    case "unknown":
      return "Nothing says what this tool does, so it is denied";
    case "command_allowlist":
      return `On the repository's command allowlist (${d.command})`;
    case "egress_allowlist":
      return "The sandbox network allowlist";
    case "grant":
      return "A person approved this exact call once";
  }
}

/** The one line an approval card leads with. */
export function approvalHeadline(a: Pick<Approval, "kind" | "tool" | "server" | "command">): string {
  if (a.kind === "command") return `Run \`${a.command ?? ""}\` in the sandbox`;
  if (a.kind === "mcp") {
    const bare = a.tool.includes("__") ? a.tool.split("__").slice(1).join("__") : a.tool;
    return `Use ${bare} on ${a.server ?? "a connection"}`;
  }
  return `Use ${a.tool}`;
}

/** Who answered and how, for a decided card. */
export function decisionLine(a: Approval): string {
  const via: Record<Via, string> = {
    run_page: "the run page",
    chat: "the chat",
    settings: "the approvals queue",
    slack: "Slack",
    teams: "Teams",
    email: "email",
  };
  if (a.status === "expired") return "Nobody answered in time. Nothing was done.";
  if (a.status === "pending") return "Waiting for an answer.";
  const how =
    a.status === "denied"
      ? "Denied"
      : a.choice === "always_repo"
        ? "Approved always for this repository"
        : a.choice === "always_tool"
          ? "Approved always for this tool"
          : "Approved once";
  return `${how} by ${a.decided_by ?? "someone"}${a.decided_via ? ` from ${via[a.decided_via]}` : ""}.`;
}

/** "in 12 minutes" or "2 minutes ago", for a card's deadline. */
export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.round((t - now) / 60_000);
  const abs = Math.abs(mins);
  const unit = abs < 60 ? `${abs} minute${abs === 1 ? "" : "s"}` : abs < 60 * 48 ? `${Math.round(abs / 60)} hours` : `${Math.round(abs / 1440)} days`;
  return mins >= 0 ? `in ${unit}` : `${unit} ago`;
}

/** The rules shown under a scope tab. */
export function rulesFor(rules: Rule[], scope: Scope): Rule[] {
  return rules.filter((r) => r.scope === scope);
}

/** What a rule matches, in plain words. */
export function ruleWhat(r: Rule): string {
  const parts: string[] = [];
  if (r.kind) parts.push(KIND_LABELS[r.kind].toLowerCase() + "s");
  if (r.server) parts.push(`on ${r.server}`);
  if (r.tool) parts.push(`named ${r.tool}`);
  if (r.command) parts.push(`matching "${r.command}"`);
  // "of write risk" alone was a fragment: a risk reads as "anything with write risk".
  if (r.risk) parts.push(`with ${RISK_LABELS[r.risk].toLowerCase()} risk`);
  if (!parts.length) return "everything";
  return r.kind ? parts.join(" ") : `anything ${parts.join(" ")}`;
}

/** Where a rule applies, in plain words. */
export function ruleWhere(r: Rule): string {
  if (r.scope === "team") return r.locked ? "Whole team (locked)" : "Whole team";
  if (r.scope === "repo") return r.repo ?? "A repository";
  const agent = r.agent ? AGENT_LABELS[r.agent] : "An agent";
  return r.repo ? `${agent} in ${r.repo}` : agent;
}

/** Message the chat sends on by itself after a card is answered. */
export function followUpAfterApproval(approved: boolean): string {
  return approved ? "I approved it. Go ahead." : "I denied it. Carry on without it.";
}

export function followUpAfterSignIn(name: string, connected: boolean): string {
  return connected ? `I've connected ${name}. Please continue.` : `Not now. Carry on without ${name}.`;
}

/** "agent:coder" becomes "Coder agent"; a person or anything else shows as sent. */
export function actorLabel(actor: string): string {
  const m = /^agent:(.+)$/.exec(actor);
  if (!m) return actor;
  const label = AGENT_LABELS[m[1] as AgentKey];
  return label ? `${label} agent` : `${m[1].replace(/_/g, " ")} agent`;
}
