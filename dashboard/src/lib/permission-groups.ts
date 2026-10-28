// How the team page groups what each role can do.
//
// The capabilities themselves are not listed here. The gateway serves them
// (GET /api/users/permissions) from its CAPABILITIES table in
// services/gateway/src/permissions.rs, the same table its role checks are
// tested against: a test there reads every routed handler's `require_role`
// level and fails when a handler is missing from the table or needs a
// different role. So the matrix always shows what the server enforces, and
// this file only says which area each capability belongs to.
//
// A capability the server adds before it is listed here still shows, under
// "Other", so nothing is ever dropped.

import type { Capability, Permissions, RoleInfo } from "./team";

export interface CapabilityGroup {
  id: string;
  label: string;
  /** Capability keys, in the order the matrix shows them. */
  keys: string[];
}

export const CAPABILITY_GROUPS: CapabilityGroup[] = [
  { id: "runs", label: "Runs & plans", keys: ["view", "plans", "runs", "recommendations", "delete_plans"] },
  { id: "reviews", label: "Reviews, releases & tests", keys: ["reviews", "tests"] },
  { id: "chat", label: "Chat & knowledge", keys: ["brain_read", "brain_ask", "knowledge_manage"] },
  {
    id: "connections",
    label: "Repos & integrations",
    keys: ["repos", "view_integrations", "integrations", "mcp_connect", "data_sources", "view_alerts", "alerts"],
  },
  {
    id: "agent",
    label: "Agent settings",
    keys: ["agent_settings", "agents.permissions", "agents.approve", "memory", "learning", "model_provider"],
  },
  { id: "plugins", label: "Plugins", keys: ["plugins.view", "plugins.run", "plugins.approve", "plugins.install", "plugins.audit"] },
  { id: "api", label: "API keys & events", keys: ["api_keys", "webhooks", "deliveries"] },
  { id: "people", label: "People & team", keys: ["view_team", "people", "sign_in", "roles", "support", "manage_admins", "team_name"] },
  {
    id: "account",
    label: "Billing & account",
    keys: ["own_account", "budget", "system", "system.models", "emails", "platform_admin", "disconnect", "reset"],
  },
];

export const OTHER_GROUP = { id: "other", label: "Other" };

/** The server's capabilities, grouped; a group with nothing in it is left out. */
export function groupCapabilities(caps: Capability[]): { id: string; label: string; items: Capability[] }[] {
  const byKey = new Map(caps.map((c) => [c.key, c]));
  const placed = new Set<string>();
  const groups = CAPABILITY_GROUPS.map((g) => {
    const items = g.keys.map((k) => byKey.get(k)).filter((c): c is Capability => !!c);
    items.forEach((c) => placed.add(c.key));
    return { id: g.id, label: g.label, items };
  });
  const rest = caps.filter((c) => !placed.has(c.key));
  if (rest.length) groups.push({ ...OTHER_GROUP, items: rest });
  return groups.filter((g) => g.items.length > 0);
}

/** May someone with `role` do `cap`? Same rule as the gateway: their level is at least the capability's. */
export function roleCan(p: Permissions, role: RoleInfo, cap: Capability): boolean {
  const need = p.roles.find((r) => r.key === cap.min_role)?.level ?? Number.POSITIVE_INFINITY;
  return role.level >= need;
}
