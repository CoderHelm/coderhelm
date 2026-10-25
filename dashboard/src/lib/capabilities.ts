// What the signed-in person may do, as capability keys from the gateway's
// table (services/gateway/src/permissions.rs). `/api/me` sends the keys the
// person holds (`capabilities`), for built-in and custom roles alike, and the
// gateway decides every request from the same keys. Every control the
// dashboard shows or hides by role asks `can(...)` here, so a custom role sees
// exactly what the server lets it do.

import { roleLevel } from "./roles";

/**
 * Anything beyond what everyone on the team can do: the pages a viewer can't
 * open (they only read) but anyone who can change something can.
 */
export const ANY_CHANGE = "any_change";

/** Everyone on the team holds these. */
export const BASELINE = ["view", "brain_read", "view_team", "own_account"];

/**
 * The lowest built-in role of each capability, only for an `/api/me` answer
 * with no `capabilities` (a gateway from before custom roles, while a deploy
 * rolls out). The list served by the gateway always wins.
 */
const BUILT_IN_MIN: Record<string, "viewer" | "member" | "admin" | "owner"> = {
  view: "viewer",
  view_team: "viewer",
  own_account: "viewer",
  brain_read: "viewer",
  brain_ask: "member",
  plans: "member",
  runs: "member",
  reviews: "member",
  recommendations: "member",
  view_alerts: "member",
  view_integrations: "member",
  mcp_connect: "member",
  knowledge_manage: "admin",
  people: "admin",
  roles: "admin",
  api_keys: "admin",
  delete_plans: "admin",
  repos: "admin",
  agent_settings: "admin",
  memory: "admin",
  learning: "admin",
  integrations: "admin",
  data_sources: "admin",
  tests: "admin",
  alerts: "admin",
  model_provider: "admin",
  system: "admin",
  budget: "admin",
  support: "admin",
  manage_admins: "owner",
  team_name: "owner",
  disconnect: "owner",
  reset: "owner",
};

export interface CapabilityHolder {
  role?: string | null;
  capabilities?: string[] | null;
}

/** The capability keys someone holds. */
export function capabilitiesOf(me: CapabilityHolder | null | undefined): Set<string> {
  if (!me) return new Set();
  if (Array.isArray(me.capabilities)) return new Set(me.capabilities);
  const level = roleLevel(me.role);
  return new Set(Object.entries(BUILT_IN_MIN).filter(([, min]) => level >= roleLevel(min)).map(([k]) => k));
}

/** May `me` do `capability` (a key from the table, or `ANY_CHANGE`)? */
export function can(me: CapabilityHolder | null | undefined, capability: string): boolean {
  const caps = capabilitiesOf(me);
  if (capability === ANY_CHANGE) return [...caps].some((k) => !BASELINE.includes(k));
  return caps.has(capability);
}

/** The built-in role a capability starts at, for "Only an admin or the owner can…" copy. */
export function builtInRoleFor(capability: string): "viewer" | "member" | "admin" | "owner" {
  if (capability === ANY_CHANGE) return "member";
  return BUILT_IN_MIN[capability] ?? "admin";
}
