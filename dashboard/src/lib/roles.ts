// Team roles, lowest to highest. The gateway uses the same order
// (viewer=0 … owner=4) when it checks who may change something.
export type Role = "viewer" | "member" | "billing" | "admin" | "owner";

export const ROLE_LEVEL: Record<Role, number> = {
  viewer: 0,
  member: 1,
  billing: 2,
  admin: 3,
  owner: 4,
};

export const ROLE_LABEL: Record<Role, string> = {
  viewer: "Viewer",
  member: "Member",
  billing: "Billing",
  admin: "Admin",
  owner: "Owner",
};

export function roleLevel(role: string | null | undefined): number {
  return ROLE_LEVEL[(role ?? "") as Role] ?? 0;
}

/** True when `role` is `min` or higher. */
export function hasRole(role: string | null | undefined, min: Role): boolean {
  return roleLevel(role) >= ROLE_LEVEL[min];
}

/** "an admin", "the owner": who to ask for a change. */
export function whoCan(min: Role): string {
  if (min === "owner") return "the team owner";
  if (min === "admin") return "an admin or the owner";
  if (min === "billing") return "a billing member, an admin or the owner";
  return "a team member";
}
