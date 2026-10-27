// The gateway's capability table (services/gateway/src/permissions.rs in
// coderhelm-platform), copied so the role editor is tested against every
// ability a real team sees, in the server's order. Two rows share `system`,
// as on the server.

export interface CapabilityRow {
  key: string;
  label: string;
  short_label?: string;
  min_role: string;
}

export const CAPABILITY_TABLE: CapabilityRow[] = [
  { key: "view", label: "See and search runs, plans, reviews, analytics, repos, tests and settings", short_label: "See runs, plans and settings", min_role: "viewer" },
  { key: "brain_read", label: "Read knowledge open to their role and chats shared with the team", short_label: "Read knowledge and chats", min_role: "viewer" },
  { key: "view_team", label: "See who is on the team", short_label: "See the team", min_role: "viewer" },
  { key: "own_account", label: "Manage your own password, two-factor and notifications", short_label: "Manage your own account", min_role: "viewer" },
  { key: "plugins.view", label: "See installed plugins, their runs, drafts and approvals", short_label: "See plugins", min_role: "viewer" },
  { key: "brain_ask", label: "Ask questions in Chat, attach files, rate answers, and rename, share or delete their own chats", short_label: "Ask questions in Chat", min_role: "member" },
  { key: "plans", label: "Create, edit, approve and run plans and templates", short_label: "Create and run plans", min_role: "member" },
  { key: "mcp_connect", label: "Connect your own account to MCP servers that use personal sign-in", short_label: "Sign in to MCP servers", min_role: "member" },
  { key: "runs", label: "Retry, re-run, re-review, cancel, close or reopen runs", short_label: "Retry and cancel runs", min_role: "member" },
  { key: "reviews", label: "Ask for a re-review, rate reviews, send release notes and release now", short_label: "Act on reviews and releases", min_role: "member" },
  { key: "recommendations", label: "Act on log findings: create fix PRs or plans, read sample lines, acknowledge or ignore them", short_label: "Act on log findings", min_role: "member" },
  { key: "agents.approve", label: "Approve or deny what agents ask to do (once)", short_label: "Approve agent requests", min_role: "member" },
  { key: "view_alerts", label: "See alerts and where they are routed", short_label: "See alerts", min_role: "member" },
  { key: "view_integrations", label: "See integrations, what each can do and whether it works", short_label: "See integrations", min_role: "member" },
  { key: "plugins.run", label: "Start plugin runs from a brief, edit drafts and send them for review", short_label: "Run plugins", min_role: "member" },
  { key: "plugins.approve", label: "Approve, reject, stop or cancel plugin drafts (only for plugins that name you as an approver, or as an admin when a plugin names none)", short_label: "Approve plugin drafts", min_role: "member" },
  { key: "knowledge_manage", label: "Create, change and delete knowledge bases, upload and remove their files, connect apps whose pages stay in sync, and attach them to agents", short_label: "Manage knowledge bases", min_role: "admin" },
  { key: "people", label: "Invite people, resend or revoke any pending invite, link GitHub accounts, and change or remove members and viewers", short_label: "Invite and manage people", min_role: "admin" },
  { key: "sign_in", label: "Require two-factor sign-in for the team, see who has it, reset a person's two-factor sign-in, and on a self-hosted install change who may join (allowed email domains)", short_label: "Set sign-in rules", min_role: "admin" },
  { key: "roles", label: "Create, edit and delete custom roles, give people a custom role, and see the log of role changes", short_label: "Manage custom roles", min_role: "admin" },
  { key: "api_keys", label: "Create and revoke the team's API keys, each with scopes no wider than your own", short_label: "Manage API keys", min_role: "admin" },
  { key: "delete_plans", label: "Delete plans", short_label: "Delete plans", min_role: "admin" },
  { key: "repos", label: "Manage repositories: sync, turn on, roles, code graph (turn off, rebuild) and infrastructure scans", short_label: "Manage repositories", min_role: "admin" },
  { key: "agent_settings", label: "Edit instructions, rules, voice, agent context, workflow, git conventions and reviewer settings, and remove what the reviewer learned", short_label: "Edit agent settings", min_role: "admin" },
  { key: "agents.permissions", label: "Edit agent permissions: rules, presets, the autonomy limit, agent switches, pause all agents, sandbox allowlists, and approve \"always\"", short_label: "Edit agent permissions", min_role: "admin" },
  { key: "learning", label: "Pin a prompt variant, revert or restore what Coderhelm learned, and tune the reward weights", short_label: "Manage what agents learned", min_role: "admin" },
  { key: "memory", label: "Add, edit and delete team memory", short_label: "Edit team memory", min_role: "admin" },
  { key: "integrations", label: "Connect GitHub, Jira, AWS accounts, monitoring and docs tools, Teams and MCP servers (and the tools agents get from each), and choose what each may do", short_label: "Connect integrations", min_role: "admin" },
  { key: "data_sources", label: "Manage data sources, team tools and skills", short_label: "Manage data sources and tools", min_role: "admin" },
  { key: "tests", label: "Change test settings; quarantine, pin and fix tests; open setup pull requests", short_label: "Manage tests", min_role: "admin" },
  { key: "alerts", label: "Configure alert routes, the alert budget, alert notifications and automatic fixes for log findings", short_label: "Configure alerts", min_role: "admin" },
  { key: "model_provider", label: "See and change the model provider key", short_label: "Change the model provider key", min_role: "admin" },
  { key: "system", label: "See system health and retry or clear failed events", short_label: "System health and updates", min_role: "admin" },
  { key: "webhooks", label: "Add, change and delete webhook endpoints, reveal and rotate their signing secrets, and send, resend and replay their events", short_label: "Manage webhooks", min_role: "admin" },
  { key: "deliveries", label: "See every event in and out (webhooks, relay forwards, notifications, email), how they went over time, and send failed ones again", short_label: "Resend event deliveries", min_role: "admin" },
  { key: "budget", label: "Set the monthly token limit", short_label: "Set the token limit", min_role: "admin" },
  { key: "support", label: "Let Coderhelm support into the workspace, and manage every support ticket the team files", short_label: "Manage support access", min_role: "admin" },
  { key: "system", label: "See this install's version, setup checks and update readiness, update it or roll it back, change its domain, use CoderHelm's address, apps and event relay (hybrid), and send a test email (self-hosted installs; install admins only)", short_label: "System health and updates", min_role: "admin" },
  { key: "system.models", label: "Change how this install calls Claude (Amazon Bedrock or Anthropic API keys), after every model it uses answers a test call (self-hosted installs; install admins only)", short_label: "Set how models are called", min_role: "admin" },
  { key: "emails", label: "Choose which optional emails this install sends and whether it sends through its own Amazon SES or CoderHelm (self-hosted installs; install admins only)", short_label: "Choose install emails", min_role: "admin" },
  { key: "platform_admin", label: "See self-hosted installs that use CoderHelm's hosted parts, and pause their email (CoderHelm's own platform admins only)", short_label: "Manage hosted installs", min_role: "admin" },
  { key: "plugins.install", label: "Add plugin sources, install, update, pin or roll back plugins, and set their settings, approvers and limits", short_label: "Install and configure plugins", min_role: "admin" },
  { key: "plugins.audit", label: "Read the audit log", short_label: "Read the audit log", min_role: "admin" },
  { key: "manage_admins", label: "Make someone an admin or owner, and change or remove admins and owners", short_label: "Manage admins and owners", min_role: "owner" },
  { key: "team_name", label: "Rename the team", short_label: "Rename the team", min_role: "owner" },
  { key: "disconnect", label: "Remove the Jira integration or the model provider key", short_label: "Remove Jira or model key", min_role: "owner" },
  { key: "reset", label: "Reset account data", short_label: "Reset account data", min_role: "owner" },
];

// ── A mocked backend for the role editor ─────────────────────────────
//
// Only what Settings, then Team, asks for. Every other call is refused, and
// nothing reaches a real backend. Names and addresses are made up.

import type { Page, Route } from "@playwright/test";

const ROLES = [
  { key: "viewer", label: "Viewer", level: 0, summary: "Read-only: sees runs, plans, reviews and settings, changes nothing.", assignable: true },
  { key: "member", label: "Member", level: 1, summary: "Works with Coderhelm: plans, runs, reviews and recommendations.", assignable: true },
  { key: "billing", label: "Billing", level: 2, summary: "Older role with the same access as Member.", assignable: false },
  { key: "admin", label: "Admin", level: 3, summary: "Runs the workspace: repos, integrations, agent settings and people.", assignable: true },
  { key: "owner", label: "Owner", level: 4, summary: "Everything, plus budget, account-level changes and managing admins.", assignable: true },
];
const LEVEL: Record<string, number> = { viewer: 0, member: 1, billing: 2, admin: 3, owner: 4 };
const NEVER_IN_CUSTOM_ROLES = ["roles", "sign_in", "support", "system", "system.models", "emails", "platform_admin"];

const keys = (rows: CapabilityRow[]) => [...new Set(rows.map((c) => c.key))];
export const customizable = (c: CapabilityRow) => LEVEL[c.min_role] < LEVEL.owner && !NEVER_IN_CUSTOM_ROLES.includes(c.key);
export const BASELINE = keys(CAPABILITY_TABLE.filter((c) => LEVEL[c.min_role] === 0));
export const holds = (role: string) => keys(CAPABILITY_TABLE.filter((c) => LEVEL[c.min_role] <= LEVEL[role]));
export const template = (role: string) => keys(CAPABILITY_TABLE.filter((c) => LEVEL[c.min_role] <= LEVEL[role] && customizable(c)));

export interface StoredRole {
  id: string;
  key: string;
  name: string;
  description: string;
  capabilities: string[];
  acts_as: string;
  template: string | null;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface RoleBackend {
  roles: StoredRole[];
  calls: { method: string; path: string; body: Record<string, unknown> | null }[];
}

export function storedRole(p: Partial<StoredRole> & { id: string; name: string }): StoredRole {
  const at = new Date(Date.now() - 86_400_000).toISOString();
  return {
    key: `custom:${p.id}`, description: "", capabilities: [...BASELINE, "plans", "runs"], acts_as: "viewer", template: "member", member_count: 0,
    created_at: at, updated_at: at, ...p,
  };
}

/**
 * Settings, then Team, for `selfRole`, with the gateway's whole capability
 * table. `table` swaps the table (an older gateway without short labels).
 */
export async function mockRolesApi(
  page: Page,
  { selfRole = "admin", roles = [], table = CAPABILITY_TABLE }: { selfRole?: string; roles?: StoredRole[]; table?: CapabilityRow[] } = {},
): Promise<RoleBackend> {
  const db: RoleBackend = { roles, calls: [] };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const self = { user_id: "u-self", email: "alex@example.com", name: "Alex Admin", github_login: null, github_id: null, avatar_url: null, role: selfRole, status: "active", sign_in: "email", invited_by: null, last_active_at: null, updated_at: null, is_self: true };
  const sam = { ...self, user_id: "u-sam", email: "sam@example.com", name: "Sam Rivera", role: "member", is_self: false };
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    const body = req.postData() ? (JSON.parse(req.postData() as string) as Record<string, unknown>) : null;
    db.calls.push({ method, path: p, body });
    if (p === "/api/me") return json(route, { user_id: self.user_id, team_id: "t_1", github_login: null, email: self.email, avatar_url: "", role: selfRole, capabilities: holds(selfRole) });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "example-org", status: "active", current: true }] });
    if (p === "/api/users") return json(route, { users: [self, sam] });
    if (p === "/api/users/permissions") {
      return json(route, {
        roles: ROLES,
        capabilities: table,
        your_role: selfRole,
        grantable_roles: ["viewer", "member", ...db.roles.map((r) => r.key)],
        manageable_roles: ["viewer", "member", ...db.roles.map((r) => r.key)],
        can_manage_invites: true,
        can_manage_roles: LEVEL[selfRole] >= 3,
      });
    }
    if (p === "/api/roles" && method === "GET") {
      return json(route, {
        roles: db.roles,
        can_manage: LEVEL[selfRole] >= 3,
        max_roles: 30,
        customizable: keys(table.filter(customizable)),
        baseline: BASELINE,
        yours: holds(selfRole),
        templates: { viewer: template("viewer"), member: template("member"), admin: template("admin") },
      });
    }
    if (p === "/api/roles/audit") return json(route, { entries: [] });
    const rm = p.match(/^\/api\/roles(?:\/([^/]+))?$/);
    if (rm && method === "POST") {
      const name = String(body?.name ?? "").trim();
      if (db.roles.some((r) => r.name.toLowerCase() === name.toLowerCase())) return json(route, { error: "Another role already has that name." }, 400);
      const caps = (body?.capabilities as string[]) ?? [];
      const r = storedRole({ id: `r${db.roles.length + 1}`, name, description: String(body?.description ?? ""), capabilities: [...new Set([...BASELINE, ...caps])], template: (body?.template as string) ?? null });
      db.roles.push(r);
      return json(route, { role: r });
    }
    if (rm && method === "PUT") {
      const r = db.roles.find((x) => x.id === rm[1]);
      if (!r) return json(route, { error: "That role doesn't exist." }, 404);
      const caps = (body?.capabilities as string[]) ?? r.capabilities;
      Object.assign(r, { name: String(body?.name ?? r.name), description: String(body?.description ?? r.description), capabilities: [...new Set([...BASELINE, ...caps])], updated_at: new Date().toISOString() });
      return json(route, { role: r, changed: true });
    }
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  return db;
}
