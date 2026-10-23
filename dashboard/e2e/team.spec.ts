import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Every API call is answered here. Nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

interface Member {
  user_id: string;
  email: string | null;
  name: string | null;
  github_login: string | null;
  github_id: string | null;
  avatar_url: string | null;
  role: string;
  status: "active" | "invited";
  sign_in: "email" | "github" | "email_and_github";
  invited_by: string | null;
  last_active_at: string | null;
  updated_at: string | null;
  invited_at?: string | null;
  invite_expires_at?: string | null;
  invite_expired?: boolean;
  is_self: boolean;
}

const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

function member(p: Partial<Member> & { user_id: string }): Member {
  return {
    email: null, name: null, github_login: null, github_id: null, avatar_url: null, role: "member", status: "active",
    sign_in: "email", invited_by: null, last_active_at: null, updated_at: ago(3 * DAY), is_self: false, ...p,
  };
}

// One team: an owner (you, by default an admin here), email members, their
// GitHub-only duplicates, and pending invites.
function team(selfRole: string): Member[] {
  return [
    member({ user_id: "u-owner", email: "olivia@example.com", name: "Olivia Owner", github_login: "olivia-o", github_id: "100", role: "owner", sign_in: "email_and_github", last_active_at: ago(2 * 3600_000), is_self: selfRole === "owner" }),
    member({ user_id: "u-admin", email: "alex@example.com", name: "Alex Admin", role: "admin", last_active_at: ago(DAY), is_self: selfRole === "admin" }),
    member({ user_id: "u-sam", email: "sam.rivera@example.com", name: "Sam Rivera", role: "member", last_active_at: ago(5 * DAY) }),
    member({ user_id: "u-jo", email: "jo@example.com", name: null, role: "viewer", is_self: selfRole === "viewer" }),
    member({ user_id: "u-mem", email: "mia@example.com", name: "Mia Member", role: "member", is_self: selfRole === "member" }),
    member({ user_id: "4242", email: null, github_login: "samrivera", github_id: "4242", role: "member", sign_in: "github", last_active_at: ago(3600_000) }),
    member({ user_id: "5151", email: null, github_login: "octo-builder", github_id: "5151", role: "viewer", sign_in: "github" }),
    member({ user_id: "invite_01", email: "new.hire@example.com", role: "member", status: "invited", invited_by: "u-admin" }),
    // An owner invited this person as an admin, long enough ago that it expired.
    invite({ user_id: "invite_02", email: "person@example.com", role: "admin", invited_by: "u-owner" }, 62 * DAY),
  ];
}

const INVITE_DAYS = 30;
function invite(p: Partial<Member> & { user_id: string }, sentAgo: number): Member {
  const sent = Date.now() - sentAgo;
  const expires = sent + INVITE_DAYS * DAY;
  return member({
    status: "invited",
    updated_at: new Date(sent).toISOString(),
    invited_at: new Date(sent).toISOString(),
    invite_expires_at: new Date(expires).toISOString(),
    invite_expired: expires <= Date.now(),
    ...p,
  });
}

const ROLES = [
  { key: "viewer", label: "Viewer", level: 0, summary: "Read-only: sees runs, plans, reviews and settings, changes nothing.", assignable: true },
  { key: "member", label: "Member", level: 1, summary: "Works with Coderhelm: plans, runs, reviews and recommendations.", assignable: true },
  { key: "billing", label: "Billing", level: 2, summary: "Older role with the same access as Member.", assignable: false },
  { key: "admin", label: "Admin", level: 3, summary: "Runs the workspace: repos, integrations, agent settings and people.", assignable: true },
  { key: "owner", label: "Owner", level: 4, summary: "Everything, plus budget, account-level changes and managing admins.", assignable: true },
];
const CAPABILITIES = [
  { key: "view", label: "See runs, plans, reviews, analytics, repos, tests and settings", min_role: "viewer" },
  { key: "view_team", label: "See who is on the team", min_role: "viewer" },
  { key: "plans", label: "Create, edit, approve and run plans and templates", min_role: "member" },
  { key: "runs", label: "Retry, re-run, re-review or cancel runs", min_role: "member" },
  { key: "people", label: "Invite people, resend or revoke any pending invite, link GitHub accounts, and change or remove members and viewers", min_role: "admin" },
  { key: "repos", label: "Manage repositories: sync, turn on, roles, code graph and infrastructure scans", min_role: "admin" },
  { key: "manage_admins", label: "Make someone an admin or owner, and change or remove admins and owners", min_role: "owner" },
  { key: "budget", label: "Set the monthly budget", min_role: "owner" },
];
const LEVEL: Record<string, number> = { viewer: 0, member: 1, billing: 2, admin: 3, owner: 4 };
const canManage = (actor: string, target: string) => LEVEL[actor] >= 4 || (LEVEL[actor] >= 3 && LEVEL[target] <= 2);

interface Backend {
  members: Member[];
  calls: { method: string; path: string; body: Record<string, unknown> | null }[];
  failUsers: boolean;
}

async function mockApi(page: Page, selfRole = "admin", init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { members: team(selfRole), calls: [], failUsers: false, ...init };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    const body = req.postData() ? (JSON.parse(req.postData() as string) as Record<string, unknown>) : null;
    db.calls.push({ method, path: p, body });
    const self = db.members.find((m) => m.is_self);
    if (p === "/api/me") return json(route, { user_id: self?.user_id ?? "u-admin", team_id: "t_1", github_login: null, email: self?.email ?? "", avatar_url: "", role: selfRole });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme-labs", status: "active", current: true }] });
    if (p === "/api/users/permissions") {
      return json(route, {
        roles: ROLES,
        capabilities: CAPABILITIES,
        your_role: selfRole,
        grantable_roles: ROLES.filter((r) => r.assignable && canManage(selfRole, r.key)).map((r) => r.key),
        manageable_roles: ROLES.filter((r) => canManage(selfRole, r.key)).map((r) => r.key),
        can_manage_invites: LEVEL[selfRole] >= 3,
      });
    }
    if (p === "/api/users" && method === "GET") {
      if (db.failUsers) return json(route, { error: "The team service is down." }, 500);
      const visible = LEVEL[selfRole] >= 3 ? db.members : db.members.filter((m) => m.status !== "invited");
      return json(route, { users: visible });
    }
    if (p === "/api/users/invite") {
      const email = String(body?.email);
      if (db.members.some((m) => m.email === email)) return json(route, { error: "They're already on the team." }, 409);
      db.members.push(member({ user_id: `invite_${db.members.length}`, email, role: String(body?.role), status: "invited" }));
      return json(route, { status: "invited", user_id: "invite_x" });
    }
    const m = p.match(/^\/api\/users\/([^/]+)(?:\/(role|resend|link-github))?$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      const target = db.members.find((x) => x.user_id === id);
      if (!target) return json(route, { error: "That person isn't on this team." }, 404);
      if (m[2] === "role") {
        target.role = String(body?.role);
        return json(route, { status: "updated", role: target.role });
      }
      // Same rules as the gateway: admins and owners handle every pending
      // invite whatever its role; seated admins and owners are an owner's call.
      if ((m[2] === "resend" || method === "DELETE") && LEVEL[selfRole] < 3) {
        return json(route, { error: "Only admins and owners can do that." }, 403);
      }
      if (method === "DELETE" && target.status !== "invited" && !canManage(selfRole, target.role)) {
        return json(route, { error: "Only an owner can remove an admin or owner." }, 403);
      }
      if (m[2] === "resend") {
        if (target.status !== "invited") return json(route, { error: "They've already joined; there's no invite to resend." }, 400);
        const renewed = invite({ user_id: target.user_id }, 0);
        Object.assign(target, {
          invited_at: renewed.invited_at,
          invite_expires_at: renewed.invite_expires_at,
          invite_expired: false,
          updated_at: renewed.updated_at,
        });
        return json(route, { status: "sent", invited_at: renewed.invited_at, invite_expires_at: renewed.invite_expires_at });
      }
      if (m[2] === "link-github") {
        const gh = db.members.find((x) => x.user_id === body?.github_user_id);
        if (!gh) return json(route, { error: "not found" }, 404);
        Object.assign(target, { github_login: gh.github_login, github_id: gh.github_id, sign_in: "email_and_github" });
        db.members = db.members.filter((x) => x !== gh);
        return json(route, { status: "linked", user_id: target.user_id, github_login: gh.github_login, role: target.role });
      }
      if (method === "DELETE") {
        db.members = db.members.filter((x) => x !== target);
        return json(route, { status: "removed" });
      }
    }
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

const members = (page: Page) => page.getByRole("list", { name: /Members/ });
const row = (page: Page, text: string) => members(page).getByRole("listitem").filter({ hasText: text });

test("admin sees one row per person, GitHub logins, statuses and the permissions table", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/team");
  await expect(page.getByRole("heading", { name: "Team", exact: true })).toBeVisible();
  await expect(members(page).getByRole("listitem")).toHaveCount(7);
  await expect(row(page, "Olivia Owner").getByRole("link", { name: /olivia-o on GitHub/ })).toHaveAttribute("href", "https://github.com/olivia-o");
  await expect(row(page, "samrivera").getByText("GitHub sign-in only")).toBeVisible();
  await expect(row(page, "Sam Rivera").getByText("Active 5 days ago")).toBeVisible();
  await expect(row(page, "Alex Admin").getByText("You", { exact: true })).toBeVisible();
  // Admins can't touch owners or other admins, nor their own row.
  await expect(row(page, "Olivia Owner").getByRole("combobox")).toHaveCount(0);
  await expect(row(page, "Alex Admin").getByRole("combobox")).toHaveCount(0);
  // Admins can grant viewer/member only.
  const select = row(page, "Sam Rivera").getByRole("combobox", { name: "Role for Sam Rivera" });
  await expect(select.locator("option")).toHaveText(["Viewer", "Member"]);
  // Pending invites have their own section.
  const invites = page.getByRole("list", { name: /Pending invites/ });
  await expect(invites.getByText("new.hire@example.com")).toBeVisible();
  // Permissions: a matrix, the viewer's role highlighted.
  await expect(page.getByTestId("role-col-admin")).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("role-summary-admin")).toContainText("Your role");
  await expect(page.getByTestId("perm-people").getByRole("rowheader")).toHaveText(/Invite people, resend or revoke any pending invite/);
  await expect(page.getByTestId("perm-budget").getByRole("cell")).toHaveText([/No$/, /No$/, /No$/, /Yes$/]);
  await shot(page, "team-admin");
});

test("a likely duplicate is suggested, and linking only happens after confirming", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/team");
  const dupes = page.getByRole("region", { name: /Possibly the same person/ });
  await expect(dupes.getByText("samrivera")).toBeVisible();
  await expect(dupes.getByText("Sam Rivera")).toBeVisible();
  await expect(dupes.getByText("octo-builder")).toHaveCount(0);
  expect(db.calls.some((c) => c.path.endsWith("/link-github"))).toBe(false);

  await dupes.getByRole("button", { name: "Review and link" }).click();
  const dialog = page.getByRole("dialog", { name: /Link a GitHub sign-in to Sam Rivera/ });
  await expect(dialog).toBeVisible();
  // The likely match is preselected; the other GitHub record is offered too.
  await expect(dialog.getByRole("radio", { name: /samrivera/ })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: /octo-builder/ })).not.toBeChecked();
  await expect(dialog.getByText("Likely match")).toBeVisible();
  await shot(page, "team-link-dialog");
  await dialog.getByRole("button", { name: "Link accounts" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Linked @samrivera to Sam Rivera")).toBeVisible();
  const call = db.calls.find((c) => c.path.endsWith("/link-github"));
  expect(call?.path).toBe("/api/users/u-sam/link-github");
  expect(call?.body).toEqual({ github_user_id: "4242" });
  await expect(members(page).getByRole("listitem")).toHaveCount(6);
  await expect(row(page, "Sam Rivera").getByRole("link", { name: /samrivera on GitHub/ })).toBeVisible();
  await expect(page.getByRole("region", { name: /Possibly the same person/ })).toHaveCount(0);
});

test("link from a GitHub-only row's menu; cancel leaves everything as it was", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/team");
  await row(page, "octo-builder").getByRole("button", { name: /More actions/ }).click();
  await page.getByRole("menuitem", { name: /Link to a member/ }).click();
  const dialog = page.getByRole("dialog", { name: /Link octo-builder to a member/ });
  await expect(dialog.getByRole("button", { name: "Link accounts" })).toBeDisabled();
  await dialog.getByRole("radio", { name: /Jo|jo@example.com/ }).check();
  await expect(dialog.getByRole("button", { name: "Link accounts" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(db.calls.some((c) => c.path.endsWith("/link-github"))).toBe(false);
});

test("changing a role asks first and sends the new role", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/team");
  await row(page, "Sam Rivera").getByRole("combobox", { name: "Role for Sam Rivera" }).selectOption("viewer");
  await expect(page.getByRole("heading", { name: "Make Sam Rivera a Viewer?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(db.calls.some((c) => c.method === "PUT")).toBe(false);
  await expect(row(page, "Sam Rivera").getByRole("combobox")).toHaveValue("member");

  await row(page, "Sam Rivera").getByRole("combobox").selectOption("viewer");
  await page.getByRole("button", { name: "Make Viewer" }).click();
  await expect(page.getByText("Sam Rivera is now a Viewer")).toBeVisible();
  const put = db.calls.find((c) => c.method === "PUT");
  expect(put?.path).toBe("/api/users/u-sam/role");
  expect(put?.body).toEqual({ role: "viewer" });
});

test("an owner can make admins and owners, but the last owner's role is locked", async ({ page }) => {
  await mockApi(page, "owner");
  await page.goto("/settings/team");
  await expect(row(page, "Alex Admin").getByRole("combobox").locator("option")).toHaveText(["Viewer", "Member", "Admin", "Owner"]);
  // Olivia is the only owner and it's you: no selector, no remove.
  await expect(row(page, "Olivia Owner").getByRole("combobox")).toHaveCount(0);
  await expect(row(page, "Olivia Owner").getByRole("button", { name: /More actions/ })).toHaveCount(0);
});

test("invite: validates the email, then shows the invite as pending; resend and revoke", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/team");
  const form = page.getByRole("form", { name: "Invite someone" });
  await expect(form.getByRole("combobox", { name: "Role" }).locator("option")).toHaveText(["Viewer", "Member"]);
  await form.getByPlaceholder("name@example.com").fill("not-an-email");
  await form.getByRole("button", { name: "Send invite" }).click();
  await expect(form.getByRole("alert")).toHaveText(/Enter a valid email address/);
  expect(db.calls.some((c) => c.path === "/api/users/invite")).toBe(false);

  await form.getByPlaceholder("name@example.com").fill("dev@example.com");
  await form.getByRole("combobox", { name: "Role" }).selectOption("viewer");
  await form.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText("Invite sent to dev@example.com")).toBeVisible();
  expect(db.calls.find((c) => c.path === "/api/users/invite")?.body).toEqual({ email: "dev@example.com", role: "viewer" });
  const invites = page.getByRole("list", { name: /Pending invites/ });
  await expect(invites.getByText("dev@example.com")).toBeVisible();
  await expect(invites.getByText(/Invited as a Viewer/)).toBeVisible();

  // Already on the team: the server's message shows next to the field.
  await form.getByPlaceholder("name@example.com").fill("sam.rivera@example.com");
  await form.getByRole("button", { name: "Send invite" }).click();
  await expect(form.getByRole("alert")).toHaveText("They're already on the team.");

  await invites.getByRole("listitem").filter({ hasText: "new.hire@example.com" }).getByRole("button", { name: "Resend" }).click();
  await expect(page.getByText("Invite sent again to new.hire@example.com")).toBeVisible();
  await invites.getByRole("button", { name: "Revoke invite for new.hire@example.com" }).click();
  await page.getByRole("button", { name: "Revoke invite", exact: true }).click();
  await expect(invites.getByText("new.hire@example.com")).toHaveCount(0);
  expect(db.calls.some((c) => c.method === "DELETE" && c.path === "/api/users/invite_01")).toBe(true);
});

test("an admin can resend and revoke an owner's admin invite, and an expired one says so", async ({ page }) => {
  const db = await mockApi(page, "admin");
  await page.goto("/settings/team");
  const invites = page.getByRole("list", { name: /Pending invites/ });
  const item = invites.getByRole("listitem").filter({ hasText: "person@example.com" });
  await expect(item.getByText(/Invited as an Admin/)).toBeVisible();
  await expect(item.getByText("Expired", { exact: true })).toBeVisible();
  await expect(item.getByText(/expired [A-Z][a-z]{2} \d{1,2}, \d{4}/)).toBeVisible();
  await expect(item.getByText(/The link no longer works/)).toBeVisible();
  await shot(page, "team-expired-invite");

  // Resending renews it.
  await item.getByRole("button", { name: "Resend" }).click();
  await expect(page.getByText(/Invite sent again to person@example.com\. It works until/)).toBeVisible();
  await expect(item.getByText("Invited", { exact: true })).toBeVisible();
  await expect(item.getByText("Expired", { exact: true })).toHaveCount(0);
  await expect(item.getByText(/works until/)).toBeVisible();
  expect(db.calls.some((c) => c.method === "POST" && c.path === "/api/users/invite_02/resend")).toBe(true);

  // And it can be revoked, though it offers the admin role.
  await item.getByRole("button", { name: "Revoke invite for person@example.com" }).click();
  await page.getByRole("button", { name: "Revoke invite", exact: true }).click();
  await expect(page.getByText("Invite for person@example.com revoked")).toBeVisible();
  await expect(invites.getByText("person@example.com")).toHaveCount(0);
  expect(db.calls.some((c) => c.method === "DELETE" && c.path === "/api/users/invite_02")).toBe(true);
});

test("an expired invite can be revoked without resending it", async ({ page }) => {
  const db = await mockApi(page, "owner");
  await page.goto("/settings/team");
  const invites = page.getByRole("list", { name: /Pending invites/ });
  await invites.getByRole("button", { name: "Revoke invite for person@example.com" }).click();
  await page.getByRole("button", { name: "Revoke invite", exact: true }).click();
  await expect(invites.getByText("person@example.com")).toHaveCount(0);
  expect(db.calls.some((c) => c.method === "DELETE" && c.path === "/api/users/invite_02")).toBe(true);
  expect(db.calls.some((c) => c.path.endsWith("/resend"))).toBe(false);
});

test("remove a member from the actions menu", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/team");
  await row(page, "Mia Member").getByRole("button", { name: "More actions for Mia Member" }).click();
  await page.getByRole("menuitem", { name: "Remove from team" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(row(page, "Mia Member")).toHaveCount(0);
  expect(db.calls.some((c) => c.method === "DELETE" && c.path === "/api/users/u-mem")).toBe(true);
});

test("search and filters narrow the list, with a way back", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/team");
  await page.getByRole("combobox", { name: "Filter by sign-in" }).selectOption("github");
  await expect(members(page).getByRole("listitem")).toHaveCount(2);
  await page.getByRole("combobox", { name: "Filter by sign-in" }).selectOption("all");
  await page.getByRole("group", { name: "Filter by role" }).getByRole("button", { name: /Viewer/ }).click();
  await expect(page).toHaveURL(/role=viewer/);
  await expect(members(page).getByRole("listitem")).toHaveCount(2);
  await page.getByRole("searchbox", { name: "Search members" }).fill("nobody-matches");
  await expect(page.getByText("No members match these filters.")).toBeVisible();
  await page.getByTestId("list-empty").getByRole("button", { name: "Clear filters" }).click();
  await expect(members(page).getByRole("listitem")).toHaveCount(7);
});

test("a link from the ⌘K palette opens the team searched for that person", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/team?q=mia%40example.com");
  await expect(page.getByRole("searchbox", { name: "Search members" })).toHaveValue("mia@example.com");
  await expect(members(page).getByRole("listitem")).toHaveCount(1);
  await expect(row(page, "Mia Member")).toBeVisible();
});

test("a member sees the team read-only: no invites, no controls", async ({ page }) => {
  await mockApi(page, "member");
  await page.goto("/settings/team");
  await expect(page.getByText(/You're a Member on this team, so this page is read-only/)).toBeVisible();
  await expect(members(page).getByRole("listitem")).toHaveCount(7);
  await expect(page.getByRole("form", { name: "Invite someone" })).toHaveCount(0);
  await expect(page.getByRole("list", { name: /Pending invites/ })).toHaveCount(0);
  await expect(members(page).getByRole("combobox")).toHaveCount(0);
  await expect(members(page).getByRole("button", { name: /More actions/ })).toHaveCount(0);
  await expect(page.getByRole("region", { name: /Possibly the same person/ })).toHaveCount(0);
  await expect(page.getByTestId("role-col-member")).toHaveAttribute("aria-current", "true");
  await shot(page, "team-member");
});

test("a failed load says so and can retry", async ({ page }) => {
  const db = await mockApi(page, "admin", { failUsers: true });
  await page.goto("/settings/team");
  await expect(page.getByRole("alert").filter({ hasText: "We couldn't load your team" })).toContainText("The team service is down.");
  db.failUsers = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(members(page).getByRole("listitem")).toHaveCount(7);
});
