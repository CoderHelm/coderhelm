import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Plugins end to end against an invented backend that keeps the same rules
// the gateway does: a second admin approves installs and widening updates,
// a pin stops updates, approvals bind to one draft version, the requester
// never approves, a stop is permanent, and a scheduled publish can be
// cancelled. Every API call is answered here; nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "plugin-shots");
const NOW = new Date().toISOString();
const ADMIN = "admin@example.com";
const OTHER_ADMIN = "second.admin@example.com";
const EDITOR = "editor@example.com";

type Json = Record<string, unknown>;

interface Plugin {
  id: string; name: string; description: string; source_id: string; path: string; status: string;
  version: string; hash: string; sha: string; previous: { version: string; hash: string; sha: string } | null;
  auto_update: boolean; track: { kind: string; value: string }; pending: Json | null;
  can_approve_pending?: boolean; why_not?: string;
  tools: Json[]; triggers: Json[]; outputs: Json[]; settings: Json[]; skills: Json[]; agents: Json[];
  monthly_tokens: number; used_tokens: number; approvers: { members: string[]; min: number };
  installed_by: string; installed_at: string; updated_at: string;
}

interface Draft {
  id: string; plugin_id: string; plugin_name: string; run_id: string; kind: string; title: string; status: string;
  version: number; requested_by: string; publish_at?: string; versions: Json[]; approval: Json | null; can_approve: boolean; why_not?: string;
}

interface Backend {
  me: { email: string; role: string; capabilities?: string[] };
  flag: boolean;
  admins: number;
  plugins: Plugin[];
  drafts: Draft[];
  runs: Json[];
  audit: Json[];
  limitReached: boolean;
  runForbidden: boolean;
  staleOnApprove: boolean;
  calls: { method: string; path: string; body: Json | null }[];
  chat: Json;
}

const TOOLS = [
  { name: "read_release_notes", kind: "builtin", risk: "read" },
  { name: "create_draft", kind: "mcp", ref: "mcp:sanity", allow: ["get_*", "create_draft"], risk: "write" },
];
const PUBLISH_TOOL = { name: "publish_post", kind: "http", risk: "consequential" };
const TRIGGERS = [
  { on: "github.release" },
  { on: "manual", form: { brief: "text", channels: "list" }, channels: ["linkedin", "blog", "email"] },
];
const OUTPUTS = [{ type: "draft", kinds: ["blog", "social", "email"] }, { type: "publish", via: "publish_post", approval: { min: 1 } }];

function marketing(over: Partial<Plugin> = {}): Plugin {
  return {
    id: "marketing", name: "Marketing", description: "Drafts launch posts, emails and blog updates from product changes.",
    source_id: "src_1", path: "plugins/marketing", status: "active", version: "1.2.0", hash: "h120", sha: "aaaaaaaaaaaa1111",
    previous: { version: "1.1.0", hash: "h110", sha: "bbbbbbbbbbbb2222" }, auto_update: true, track: { kind: "branch", value: "main" },
    pending: null, tools: TOOLS, triggers: TRIGGERS, outputs: OUTPUTS,
    settings: [
      { key: "brand_voice_doc", type: "string", sensitive: false, value: "https://docs.example.com/voice", set: true },
      { key: "linkedin", type: "connection", provider: "oauth2", scopes: ["w_member_social"], sensitive: true, set: false },
    ],
    skills: [{ path: "skills/brand-voice/SKILL.md", name: "brand-voice", description: "Tone, banned claims." }],
    agents: [{ path: "agents/launch-writer.md", name: "launch-writer", description: "Turns a release into posts." }],
    monthly_tokens: 2_000_000, used_tokens: 400_000, approvers: { members: [EDITOR], min: 1 },
    installed_by: ADMIN, installed_at: NOW, updated_at: NOW, ...over,
  };
}

function draft(over: Partial<Draft> = {}): Draft {
  return {
    id: "d1", plugin_id: "marketing", plugin_name: "Marketing", run_id: "pr1", kind: "social", title: "Version 2.4 is out", status: "in_review",
    version: 1, requested_by: "someone@example.com",
    versions: [{ version: 1, content: "Version 2.4 brings faster search.", title: "Version 2.4 is out", content_hash: "c1", author: "launch-writer", created_at: NOW }],
    approval: { id: "a1", version: 1, content_hash: "c1", status: "pending", requested_by: "someone@example.com" },
    can_approve: true, ...over,
  };
}

/** What the server says about whether `me` may approve `d`. */
function withPermission(db: Backend, d: Draft): Draft {
  const p = db.plugins.find((x) => x.id === d.plugin_id);
  let why: string | undefined;
  if (d.status === "stopped") why = "stopped";
  else if (d.requested_by === db.me.email) why = "same_person";
  else if (p && p.approvers.members.length && !p.approvers.members.includes(db.me.email)) why = "not_in_group";
  return { ...d, can_approve: !why, why_not: why };
}

function refuse(route: Route, status: number, code: string, error: string) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ error, code }) });
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = {
    me: { email: ADMIN, role: "admin" }, flag: true, admins: 2, plugins: [marketing()], drafts: [draft()], runs: [], audit: [],
    limitReached: false, runForbidden: false, staleOnApprove: false, calls: [], chat: { slack_team_id: "", slack_signing_secret_set: false, teams_webhook_set: false }, ...init,
  };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const log = (action: string, extra: Json = {}) => db.audit.unshift({ id: `e${db.audit.length + 1}`, at: NOW, actor: db.me.email, actor_kind: "person", action, result: "ok", ...extra });
  const pluginJson = (p: Plugin) => {
    if (!p.pending) return p;
    const asker = String(p.pending.requested_by);
    const blocked = db.admins > 1 && asker === db.me.email;
    return { ...p, can_approve_pending: !blocked, why_not: blocked ? "needs_second_admin" : undefined };
  };
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    const body = req.postData() ? (JSON.parse(req.postData() as string) as Json) : null;
    db.calls.push({ method, path: p, body });
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: db.me.email, avatar_url: "", role: db.me.role, capabilities: db.me.capabilities, flags: { plugins: db.flag } });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/support/badge") return json(route, { waiting: 0, queue_open: null });
    if (p === "/api/plugins/flag") return json(route, { enabled: db.flag });
    if (!db.flag && (p.startsWith("/api/plugins/") || p === "/api/audit")) return refuse(route, 403, "flag_off", "Plugins are not turned on for this team.");

    // MCP servers (Connections).
    if (p === "/api/plugins/catalog") {
      return json(route, { plugins: [{ id: "sentry", name: "Sentry", description: "Query error events.", category: "Monitoring", tier: 1, icon: "sentry", credential_fields: [{ key: "auth_token", label: "Auth Token", placeholder: "sntrys_...", secret: true }], docs_url: "https://docs.sentry.io", repo_url: "", default_prompt: "Investigate errors.", recommended_permissions: "Read-only" }] });
    }
    if (p === "/api/plugins" && method === "GET") return json(route, { plugins: [] });
    if (p === "/api/integrations") {
      const sentry = { id: "sentry", name: "Sentry", description: "Query error events.", category: "Monitoring", tier: 1, icon: "sentry", credential_fields: [{ key: "auth_token", label: "Auth Token", placeholder: "sntrys_...", secret: true }], docs_url: "https://docs.sentry.io", repo_url: "", default_prompt: "Investigate errors.", recommended_permissions: "Read-only" };
      return json(route, {
        can_edit: true, migrated: 0,
        items: [{ id: "sentry", section: "other", name: "Sentry", does: "Reads error events.", status: "not_connected", reason: "", action: "connect", last_check: "", manage_href: "", detail: { plugin: sentry, enabled: false, has_credentials: false, custom_prompt: "", remote: null } }],
      });
    }

    if (p === "/api/plugins/settings" && method === "GET") return json(route, { autonomy_cap: "write", admins: db.admins, ...db.chat });
    if (p === "/api/plugins/settings" && method === "PUT") {
      if (body?.slack_team_id !== undefined && !/^T[A-Z0-9]+$/.test(String(body.slack_team_id))) return refuse(route, 400, "invalid", "That isn't a Slack workspace id.");
      if (body?.slack_team_id !== undefined) db.chat.slack_team_id = body.slack_team_id;
      if (body?.slack_signing_secret) db.chat.slack_signing_secret_set = true;
      if (body?.teams_secret) db.chat.teams_webhook_set = true;
      return json(route, { autonomy_cap: "write", teams_webhook_path: db.chat.teams_webhook_set ? "/webhooks/teams/plugins/t_1" : undefined });
    }
    if (p === "/api/plugins/sources" && method === "GET") {
      return json(route, { sources: [{ id: "src_1", url: "https://github.com/example-org/plugins", repo: "example-org/plugins", access: "public", path: "", track: { kind: "branch", value: "main" }, sha: "cccccccccccc", checked_at: NOW, error: "", added_by: ADMIN, added_at: NOW, plugins: [{ path: "plugins/support", name: "Support digest", version: "0.1.0", description: "Weekly support digest." }] }] });
    }
    if (p === "/api/plugins/sources" && method === "POST") {
      return json(route, { source: { id: "src_2", url: body?.url, repo: "example-org/more", access: "public", path: "", track: body?.track, sha: "dddd", checked_at: NOW, error: "", added_by: ADMIN, added_at: NOW, plugins: [] } });
    }
    if (p === "/api/plugins/available") {
      return json(route, {
        plugins: [{ source_id: "src_1", path: "plugins/support", name: "Support digest", version: "0.1.0", description: "Weekly support digest.", installed: db.plugins.some((x) => x.id === "support"), tools: TOOLS.slice(0, 1), triggers: TRIGGERS, outputs: OUTPUTS }],
      });
    }
    if (p === "/api/plugins/install") {
      const pl = marketing({ id: "support", name: "Support digest", path: "plugins/support", version: "0.1.0", hash: "s010", previous: null, status: db.admins > 1 ? "pending_install" : "active" });
      if (db.admins > 1) pl.pending = { kind: "install", hash: "s010", sha: "eeee", version: "0.1.0", requested_by: db.me.email, requested_at: NOW, widened: ["adds tool read_release_notes (read)"], diff: { added: ["tool read_release_notes"], removed: [], changed: [] } };
      db.plugins.push(pl);
      log("plugin.install_requested", { plugin_id: "support" });
      return json(route, { plugin: pluginJson(pl) });
    }
    if (p === "/api/plugins/installed") return json(route, { plugins: db.plugins.map(pluginJson) });
    const pm = p.match(/^\/api\/plugins\/installed\/([^/]+)(?:\/(\w+))?$/);
    if (pm) {
      const pl = db.plugins.find((x) => x.id === decodeURIComponent(pm[1]));
      if (!pl) return json(route, { error: "Not found" }, 404);
      const op = pm[2];
      if (!op && method === "GET") {
        const versions = [
          { hash: pl.hash, sha: pl.sha, version: pl.version, created_at: NOW, approved_by: [ADMIN] },
          ...(pl.previous ? [{ hash: pl.previous.hash, sha: pl.previous.sha, version: pl.previous.version, created_at: NOW, approved_by: [OTHER_ADMIN] }] : []),
        ];
        return json(route, { plugin: pluginJson(pl), versions });
      }
      if (!op && method === "DELETE") {
        db.plugins = db.plugins.filter((x) => x !== pl);
        return json(route, { ok: true });
      }
      if (op === "approve") {
        if (!pl.pending) return json(route, { error: "Nothing waits." }, 409);
        if (db.admins > 1 && pl.pending.requested_by === db.me.email) return refuse(route, 403, "needs_second_admin", "Another admin has to approve this.");
        if (pl.pending.kind === "install") pl.status = "active";
        else {
          pl.previous = { version: pl.version, hash: pl.hash, sha: pl.sha };
          pl.version = String(pl.pending.version);
          pl.hash = String(pl.pending.hash);
          pl.sha = String(pl.pending.sha);
          pl.tools = [...TOOLS, PUBLISH_TOOL];
        }
        pl.pending = null;
        log("plugin.updated", { plugin_id: pl.id });
        return json(route, { plugin: pluginJson(pl) });
      }
      if (op === "decline") {
        if (pl.pending?.kind === "install") db.plugins = db.plugins.filter((x) => x !== pl);
        pl.pending = null;
        return json(route, { plugin: pluginJson(pl) });
      }
      if (op === "rollback") {
        if (!pl.previous) return json(route, { error: "No previous version." }, 409);
        const cur = { version: pl.version, hash: pl.hash, sha: pl.sha };
        Object.assign(pl, pl.previous);
        pl.previous = cur;
        pl.auto_update = false;
        log("plugin.rolled_back", { plugin_id: pl.id });
        return json(route, { plugin: pluginJson(pl) });
      }
      if (op === "options") {
        if (body?.track) pl.track = body.track as Plugin["track"];
        if (pl.track.kind === "sha") pl.auto_update = false;
        else if (typeof body?.auto_update === "boolean") pl.auto_update = body.auto_update;
        return json(route, { plugin: pluginJson(pl) });
      }
      if (op === "sync") {
        if (pl.track.kind === "sha") return refuse(route, 409, "pinned", "This plugin is pinned to one commit, so updates are off.");
        return json(route, { plugin: pluginJson(pl) });
      }
      if (op === "settings" || op === "limit" || op === "approvers" || op === "enabled") {
        if (op === "limit") pl.monthly_tokens = Number(body?.monthly_tokens ?? 0);
        if (op === "approvers") pl.approvers = { members: body?.members as string[], min: Number(body?.min ?? 1) };
        if (op === "enabled") pl.status = body?.enabled ? "active" : "disabled";
        return json(route, { plugin: pluginJson(pl) });
      }
      if (op === "runs" && method === "POST") {
        if (db.runForbidden) return refuse(route, 403, "forbidden", "Your role can't do this.");
        if (db.limitReached) return refuse(route, 429, "limit_reached", "The plugin's monthly token limit is reached.");
        const run = { run_id: `pr${db.runs.length + 2}`, plugin_id: pl.id, plugin_name: pl.name, plugin_version: pl.version, hash: pl.hash, trigger: "manual", status: "queued", requested_by: db.me.email, inputs: body?.inputs ?? {}, repo: body?.repo, created_at: NOW, tokens: 0, artifacts: [] };
        db.runs.unshift(run);
        log("run.started", { plugin_id: pl.id, run_id: run.run_id });
        return json(route, { run });
      }
    }
    if (p === "/api/plugins/runs") return json(route, { runs: db.runs });
    const rm = p.match(/^\/api\/plugins\/runs\/([^/]+)$/);
    if (rm) {
      const run = db.runs.find((r) => r.run_id === rm[1]);
      if (!run) return json(route, { error: "Not found" }, 404);
      return json(route, { run, artifacts: db.drafts.filter((d) => d.run_id === rm[1]).map((d) => withPermission(db, d)), audit: db.audit.filter((e) => e.run_id === rm[1]) });
    }
    if (p === "/api/plugins/drafts") {
      const status = url.searchParams.get("status");
      return json(route, { drafts: db.drafts.filter((d) => status !== "in_review" || d.status === "in_review").map((d) => withPermission(db, d)) });
    }
    const dm = p.match(/^\/api\/plugins\/drafts\/([^/]+)(?:\/(\w+))?$/);
    if (dm) {
      const d = db.drafts.find((x) => x.id === dm[1]);
      if (!d) return json(route, { error: "Not found" }, 404);
      const op = dm[2];
      const out = () => json(route, { draft: withPermission(db, d) });
      if (!op && method === "GET") return out();
      if (!op && method === "PUT") {
        if (d.status === "stopped") return refuse(route, 409, "stopped", "This draft was stopped.");
        d.version += 1;
        d.versions.push({ version: d.version, content: body?.content, title: body?.title ?? d.title, content_hash: `c${d.version}`, author: db.me.email, created_at: NOW });
        if (d.approval) d.approval = { ...d.approval, version: d.version, status: "pending" };
        return out();
      }
      const perm = withPermission(db, d);
      if (op === "approve") {
        if (perm.why_not) return refuse(route, perm.why_not === "stopped" ? 409 : 403, perm.why_not, "Refused.");
        if (db.staleOnApprove || body?.version !== d.version) return refuse(route, 409, "stale_version", "The draft changed since.");
        d.approval = { ...(d.approval ?? {}), status: "approved", decided_by: db.me.email, publish_at: body?.publish_at };
        if (body?.publish_at) {
          d.status = "scheduled";
          d.publish_at = String(body.publish_at);
        } else d.status = "published";
        log("draft.approved", { artifact_id: d.id });
        return out();
      }
      if (op === "reject") {
        if (perm.why_not) return refuse(route, 403, perm.why_not, "Refused.");
        d.status = "rejected";
        return out();
      }
      if (op === "stop") {
        d.status = "stopped";
        log("draft.stopped", { artifact_id: d.id });
        return out();
      }
      if (op === "cancel") {
        if (d.status !== "scheduled") return json(route, { error: "Nothing scheduled." }, 409);
        d.status = "cancelled";
        log("schedule.cancelled", { artifact_id: d.id });
        return out();
      }
      if (op === "submit") {
        d.status = "in_review";
        return out();
      }
    }
    if (p === "/api/audit") {
      const plugin = url.searchParams.get("plugin");
      const action = url.searchParams.get("action");
      const events = db.audit.filter((e) => (!plugin || e.plugin_id === plugin) && (!action || e.action === action));
      const cursor = url.searchParams.get("cursor");
      if (cursor) return json(route, { events: [{ id: "old1", at: NOW, actor: "launch-writer", actor_kind: "agent", action: "tool.called", tool: "publish_post", risk: "consequential", result: "refused: not approved" }], next: null });
      return json(route, { events, next: events.length ? "c2" : null });
    }
    if (method === "GET") return json(route, {});
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true });
}

test.describe.configure({ mode: "parallel" });

test("plugins off: the nav hides them and the pages say so", async ({ page }) => {
  await mockApi(page, { flag: false });
  await page.goto("/plugins");
  await expect(page.getByTestId("plugins-off")).toContainText("Plugins are not turned on for this team");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Plugins", exact: true })).toHaveCount(0);
  await page.goto("/plugins/review");
  await expect(page.getByTestId("plugins-off")).toBeVisible();
  await page.goto("/audit");
  await expect(page.getByTestId("plugins-off")).toBeVisible();
});

test("plugins on: the nav shows Plugins, Review and the audit log", async ({ page }) => {
  await mockApi(page);
  await page.goto("/plugins");
  // Plugins is one destination in the main menu; its pages are tabs above the page.
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Plugins", exact: true })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Plugins pages" });
  await expect(tabs.getByRole("link", { name: "Plugins", exact: true })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Review", exact: true })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Audit log" })).toBeVisible();
  // Connections is a settings page, in Settings' own list.
  await page.goto("/connections");
  await expect(page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Connections" })).toBeVisible();
});

test("install from the catalog waits for a second admin; the asker can't approve, another admin can", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/plugins");
  const row = page.getByTestId("catalog-plugin").filter({ hasText: "Support digest" });
  await row.getByRole("button", { name: "Install" }).click();
  await expect(page.getByTestId("pending-plugin")).toContainText("Install waiting for a second admin");
  await page.getByTestId("pending-plugin").getByRole("link", { name: "Review" }).click();
  await expect(page.getByTestId("pending-card")).toBeVisible();
  // The admin who asked sees why they can't, before clicking.
  await expect(page.getByTestId("refusal")).toHaveAttribute("data-code", "needs_second_admin");
  await expect(page.getByRole("button", { name: "Approve install" })).toBeDisabled();
  // The server refuses too, whatever the button says.
  expect(db.calls.some((c) => c.path.endsWith("/approve"))).toBe(false);

  db.me = { email: OTHER_ADMIN, role: "admin" };
  await page.reload();
  await page.getByRole("button", { name: "Approve install" }).click();
  await expect(page.getByTestId("pending-card")).toHaveCount(0);
  await expect(page.locator("header").getByText("On", { exact: true })).toBeVisible();
});

test("a single admin's install applies at once", async ({ page }) => {
  await mockApi(page, { admins: 1 });
  await page.goto("/plugins");
  await page.getByTestId("catalog-plugin").filter({ hasText: "Support digest" }).getByRole("button", { name: "Install" }).click();
  await expect(page.getByTestId("installed-plugin").filter({ hasText: "Support digest" })).toHaveAttribute("data-status", "active");
});

test("an update that widens tools waits with its diff, then an admin approves it", async ({ page }) => {
  const db = await mockApi(page);
  db.plugins[0].pending = {
    kind: "update", hash: "h130", sha: "ffffffffffff3333", version: "1.3.0", requested_by: "sync", requested_at: NOW,
    widened: ["adds tool publish_post (consequential)"], diff: { added: ["tool publish_post"], removed: [], changed: ["agents/launch-writer.md"] },
  };
  await page.goto("/plugins");
  await expect(page.getByTestId("update-waiting")).toHaveText("Update waiting for approval");
  await page.goto("/plugins/plugin?id=marketing");
  await expect(page.getByTestId("widened")).toContainText("adds tool publish_post (consequential)");
  await expect(page.getByTestId("pending-diff")).toContainText("tool publish_post");
  await expect(page.getByTestId("pending-diff")).toContainText("agents/launch-writer.md");
  // Still on the old version while it waits.
  await expect(page.getByTestId("plugin-version").first()).toContainText("Version 1.2.0");
  await page.getByRole("button", { name: "Approve update" }).click();
  await expect(page.getByTestId("pending-card")).toHaveCount(0);
  await expect(page.getByTestId("plugin-tools")).toContainText("publish_post");
  await expect(page.getByTestId("plugin-tools").locator('[data-risk="consequential"]')).toHaveText("Needs approval");
  await expect(page.getByTestId("plugin-version").first()).toContainText("Version 1.3.0");
});

test("roll back to the previous version in one click", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/plugins/plugin?id=marketing");
  await page.getByRole("button", { name: "Roll back to 1.1.0" }).click();
  await expect(page.getByTestId("plugin-version").first()).toContainText("Version 1.1.0");
  expect(db.plugins[0].version).toBe("1.1.0");
  await expect(page.getByRole("button", { name: "Roll back to 1.2.0" })).toBeVisible();
});

test("pinning to a commit stops updates", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/plugins/plugin?id=marketing");
  const opts = page.getByTestId("update-options");
  await opts.getByRole("button", { name: "Pin to a commit" }).click();
  await expect(opts.getByRole("textbox", { name: "Commit" })).toHaveValue("aaaaaaaaaaaa1111");
  await opts.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("pinned-note")).toContainText("Pinned to commit aaaaaaaaaaaa");
  await expect(opts.getByRole("switch", { name: "Take new versions on their own" })).toBeDisabled();
  await expect(opts.getByRole("button", { name: "Check now" })).toBeDisabled();
  expect(db.plugins[0].auto_update).toBe(false);
  expect(db.plugins[0].track).toEqual({ kind: "sha", value: "aaaaaaaaaaaa1111" });
});

test("run from a brief: the form sends the brief and channels, and the run page opens", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/plugins/plugin?id=marketing");
  const form = page.getByTestId("brief-form");
  await form.getByLabel("Brief").fill("Announce search speedups to customers");
  await form.getByLabel("linkedin").check();
  await form.getByLabel("blog").check();
  await form.getByRole("button", { name: "Start the run" }).click();
  await expect(page).toHaveURL(/\/plugins\/runs\/?\?id=pr2/);
  await expect(page.getByTestId("run-inputs")).toContainText("Announce search speedups to customers");
  await expect(page.getByTestId("run-inputs")).toContainText("linkedin, blog");
  const sent = db.calls.find((c) => c.path === "/api/plugins/installed/marketing/runs");
  expect(sent?.body).toEqual({ inputs: { brief: "Announce search speedups to customers", channels: ["linkedin", "blog"] } });
});

test("a run past the plugin's limit is refused, and says so", async ({ page }) => {
  await mockApi(page, { limitReached: true });
  await page.goto("/plugins/plugin?id=marketing");
  await page.getByTestId("brief-form").getByLabel("Brief").fill("Anything");
  await page.getByRole("button", { name: "Start the run" }).click();
  await expect(page.getByTestId("refusal")).toHaveAttribute("data-code", "limit_reached");
  await expect(page.getByTestId("refusal")).toContainText("monthly token limit is reached");
});

test("forbidden: a refused role is told plainly", async ({ page }) => {
  await mockApi(page, { runForbidden: true, me: { email: "member@example.com", role: "member" } });
  await page.goto("/plugins/plugin?id=marketing");
  await page.getByTestId("brief-form").getByLabel("Brief").fill("Anything");
  await page.getByRole("button", { name: "Start the run" }).click();
  await expect(page.getByTestId("refusal")).toHaveAttribute("data-code", "forbidden");
  await expect(page.getByTestId("refusal")).toContainText("Your role can't do this");
});

test("the review queue lists drafts waiting for review", async ({ page }) => {
  await mockApi(page, { me: { email: EDITOR, role: "member" }, drafts: [draft(), draft({ id: "d2", title: "Old post", status: "published" })] });
  await page.goto("/plugins/review");
  await expect(page.getByTestId("draft-row")).toHaveCount(1);
  await expect(page.getByTestId("draft-row")).toContainText("Version 2.4 is out");
  await page.getByRole("button", { name: "All" }).click();
  await expect(page.getByTestId("draft-row")).toHaveCount(2);
});

test("an editor approves a draft for a set time, and it can be cancelled before then", async ({ page }) => {
  const db = await mockApi(page, { me: { email: EDITOR, role: "member" } });
  await page.goto("/plugins/draft?id=d1");
  await page.getByLabel("At a time").check();
  await page.getByLabel("Goes out at").fill("2030-01-15T10:00");
  await page.getByRole("button", { name: "Approve for that time" }).click();
  await expect(page.getByTestId("draft-status")).toHaveAttribute("data-status", "scheduled");
  await expect(page.getByTestId("scheduled-note")).toContainText("You can cancel until then");
  const sent = db.calls.find((c) => c.path === "/api/plugins/drafts/d1/approve");
  expect(sent?.body?.version).toBe(1);
  expect(String(sent?.body?.publish_at)).toMatch(/^2030-01-15T/);

  await page.getByRole("button", { name: "Cancel the scheduled publish" }).click();
  await page.getByRole("button", { name: "Cancel publish" }).click();
  await expect(page.getByTestId("draft-status")).toHaveAttribute("data-status", "cancelled");
});

test("approve now publishes", async ({ page }) => {
  await mockApi(page, { me: { email: EDITOR, role: "member" } });
  await page.goto("/plugins/draft?id=d1");
  await page.getByRole("button", { name: "Approve and publish now" }).click();
  await expect(page.getByTestId("draft-status")).toHaveAttribute("data-status", "published");
});

test("editing makes a new version; approving the old one is refused as stale", async ({ page }) => {
  await mockApi(page, { me: { email: EDITOR, role: "member" }, staleOnApprove: true });
  await page.goto("/plugins/draft?id=d1");
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Text").fill("Version 2.4 brings much faster search.");
  await page.getByRole("button", { name: "Save new version" }).click();
  await expect(page.getByTestId("draft-version")).toHaveCount(2);
  await expect(page.getByTestId("draft-content")).toHaveText("Version 2.4 brings much faster search.");
  await page.getByRole("button", { name: "Approve and publish now" }).click();
  await expect(page.getByTestId("refusal")).toHaveAttribute("data-code", "stale_version");
});

test("the requester can't approve their own draft", async ({ page }) => {
  await mockApi(page, { me: { email: EDITOR, role: "member" }, drafts: [draft({ requested_by: EDITOR })] });
  await page.goto("/plugins/draft?id=d1");
  await expect(page.getByTestId("refusal")).toHaveAttribute("data-code", "same_person");
  await expect(page.getByRole("button", { name: "Approve and publish now" })).toHaveCount(0);
});

test("someone outside the approvers can't approve", async ({ page }) => {
  await mockApi(page, { me: { email: "outsider@example.com", role: "member" } });
  await page.goto("/plugins/draft?id=d1");
  await expect(page.getByTestId("refusal")).toHaveAttribute("data-code", "not_in_group");
  await expect(page.getByTestId("refusal")).toContainText("not one of this plugin's approvers");
});

test("a stop is permanent: nothing can be approved or edited after it", async ({ page }) => {
  const db = await mockApi(page, { me: { email: EDITOR, role: "member" } });
  await page.goto("/plugins/draft?id=d1");
  await page.getByRole("button", { name: "Stop for good" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Stop for good" }).click();
  await expect(page.getByTestId("draft-status")).toHaveAttribute("data-status", "stopped");
  await expect(page.getByTestId("refusal").first()).toHaveAttribute("data-code", "stopped");
  await expect(page.getByRole("button", { name: "Approve and publish now" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("draft-status")).toHaveAttribute("data-status", "stopped");
  expect(db.drafts[0].status).toBe("stopped");
});

test("a custom role with plugins.install installs; a plain member doesn't see Install", async ({ page }) => {
  const db = await mockApi(page, { me: { email: "lead@example.com", role: "member", capabilities: ["view", "view_team", "own_account", "plugins.view", "plugins.install"] } });
  await page.goto("/plugins");
  const row = page.getByTestId("catalog-plugin").filter({ hasText: "Support digest" });
  await expect(row.getByRole("button", { name: "Install" })).toBeVisible();
  await expect(page.getByTestId("add-source")).toBeVisible();
  db.me = { email: "member@example.com", role: "member" };
  await page.reload();
  await expect(page.getByTestId("catalog-plugin")).toBeVisible();
  await expect(page.getByRole("button", { name: "Install" })).toHaveCount(0);
  await expect(page.getByTestId("add-source")).toHaveCount(0);
});

test("a viewer reads a draft but gets no controls to change or decide it", async ({ page }) => {
  await mockApi(page, { me: { email: EDITOR, role: "viewer" } });
  await page.goto("/plugins/draft?id=d1");
  await expect(page.getByTestId("draft-content")).toBeVisible();
  await expect(page.getByTestId("decide")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
});

test("chat settings: a Slack workspace and secret, a Teams secret, and the webhook path to paste", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/plugins");
  const form = page.getByTestId("chat-settings");
  await form.getByLabel("Slack workspace id").fill("not-an-id");
  await form.getByRole("button", { name: "Save chat settings" }).click();
  await expect(form.getByTestId("refusal")).toHaveAttribute("data-code", "invalid");
  await form.getByLabel("Slack workspace id").fill("T0123ABCD");
  await form.getByLabel("Slack signing secret").fill("slack-secret-value");
  await form.getByLabel("Teams outgoing webhook secret").fill("teams-secret-value");
  await form.getByRole("button", { name: "Save chat settings" }).click();
  await expect(page.getByTestId("teams-webhook-path")).toContainText("/webhooks/teams/plugins/t_1");
  const sent = db.calls.filter((c) => c.path === "/api/plugins/settings" && c.method === "PUT").pop();
  expect(sent?.body).toEqual({ slack_team_id: "T0123ABCD", slack_signing_secret: "slack-secret-value", teams_secret: "teams-secret-value" });
  // Secrets are never shown again: the boxes clear and say they are saved.
  await expect(form.getByLabel("Slack signing secret")).toHaveValue("");
  await expect(form.getByText("Saved. Enter a new one to replace it.").first()).toBeVisible();
});

test("a draft being published says so and offers no decisions", async ({ page }) => {
  await mockApi(page, { me: { email: EDITOR, role: "member" }, drafts: [draft({ status: "publishing" })] });
  await page.goto("/plugins/draft?id=d1");
  await expect(page.getByTestId("draft-status")).toHaveAttribute("data-status", "publishing");
  await expect(page.getByTestId("draft-status")).toHaveText("Publishing");
  await expect(page.getByRole("button", { name: "Approve and publish now" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
});

test("the old Plugins address leads to Connections", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/plugins");
  await expect(page).toHaveURL(/\/connections\/?$/);
  await expect(page.getByTestId("connection-sentry")).toBeVisible();
  await page.getByTestId("connection-sentry").getByRole("button", { name: "Connect" }).click();
  await expect(page.getByLabel("Auth Token")).toBeVisible();
});

test("the audit log filters by plugin and action and loads more", async ({ page }) => {
  const db = await mockApi(page);
  db.audit = [
    { id: "e1", at: NOW, actor: EDITOR, actor_kind: "person", action: "draft.approved", plugin_id: "marketing", plugin_version: "1.2.0", artifact_id: "d1", result: "ok" },
    { id: "e2", at: NOW, actor: "launch-writer", actor_kind: "agent", action: "tool.called", plugin_id: "marketing", tool: "create_draft", risk: "write", result: "ok" },
  ];
  await page.goto("/audit");
  await expect(page.getByTestId("audit-event")).toHaveCount(2);
  await page.getByLabel("What happened").selectOption("draft.approved");
  await expect(page.getByTestId("audit-event")).toHaveCount(1);
  await expect(page.getByTestId("audit-event")).toContainText("Draft approved");
  await page.getByLabel("What happened").selectOption("");
  await expect(page.getByTestId("audit-event")).toHaveCount(2);
  await page.getByRole("button", { name: /load more/i }).click();
  await expect(page.getByTestId("audit-event")).toHaveCount(3);
});

test("members can't open the audit log", async ({ page }) => {
  await mockApi(page, { me: { email: EDITOR, role: "member" } });
  await page.goto("/audit");
  await expect(page.getByText("This page needs a different role")).toBeVisible();
});

test("platform admins switch plugins on for a team", async ({ page }) => {
  await mockApi(page, { me: { email: "admin@coderhelm.com", role: "owner" } });
  let sent: unknown = null;
  const team = {
    team_id: "t_1", name: "your-team", status: "active", plan: "", created_at: NOW, members: 1, invites: 0, repos: 1, runs_total: 3, runs_month: 1,
    reviews_total: 0, reviews_month: 0, cost_month_usd: 0, tokens_month: 0, last_active_at: NOW, github_org: "your-team", has_installation: true,
    jira_site: "", personal: false, active: true, link: "main", flags: { plugins: false },
  };
  const org = {
    key: "your-team", label: "your-team", label_from: "github", domain: "", active: true, team_count: 1, personal_count: 0, members: 1, repos: 1,
    runs_total: 3, runs_month: 1, reviews_total: 0, reviews_month: 0, cost_month_usd: 0, last_active_at: NOW, created_at: NOW, plan: "", teams: [team],
  };
  await page.route(
    (url) => url.hostname === "localhost" && (url.pathname.startsWith("/api/admin/") || url.pathname === "/api/allowlist"),
    (route) => {
      const u = new URL(route.request().url());
      const reply = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      if (u.pathname === "/api/admin/teams/t_1/flags") {
        sent = JSON.parse(route.request().postData() || "{}");
        return reply({ team_id: "t_1", flags: { plugins: true } });
      }
      if (u.pathname === "/api/admin/teams") return reply({ month: "2026-10", orgs: [org], teams: [team], counts: { teams: 1, orgs: 1, active_orgs: 1, inactive_orgs: 0 } });
      if (u.pathname === "/api/admin/beta-signups") return reply({ signups: [], counts: { new: 0, invited: 0, joined: 0, total: 0 } });
      if (u.pathname === "/api/allowlist") return reply({ emails: [] });
      return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Not mocked" }) });
    },
  );
  await page.goto("/admin");
  await page.getByRole("button", { name: "Show teams of your-team" }).click();
  const sw = page.getByTestId("team-plugins-flag").first().getByRole("switch");
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  expect(sent).toEqual({ plugins: true });
});

test.describe("phone layouts", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const [name, addr] of [
    ["plugins", "/plugins"],
    ["plugin", "/plugins/plugin?id=marketing"],
    ["review", "/plugins/review"],
    ["draft", "/plugins/draft?id=d1"],
    ["audit", "/audit"],
    ["connections", "/connections"],
  ] as const) {
    test(`${name} fits a phone`, async ({ page }) => {
      const db = await mockApi(page, { me: { email: EDITOR, role: "admin" } });
      db.audit = [{ id: "e1", at: NOW, actor: EDITOR, actor_kind: "person", action: "draft.approved", plugin_id: "marketing", result: "ok" }];
      db.plugins[0].pending = { kind: "update", hash: "h130", sha: "ffffffffffff3333", version: "1.3.0", requested_by: "sync", requested_at: NOW, widened: ["adds tool publish_post (consequential)"], diff: { added: ["tool publish_post"], removed: [], changed: [] } };
      await page.goto(addr);
      await expect(page.getByTestId("topbar")).toBeVisible();
      await page.waitForLoadState("networkidle").catch(() => {});
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
      await shot(page, `${name}-390`);
    });
  }
});

test.describe("desktop screenshots", () => {
  for (const [name, addr] of [
    ["plugins", "/plugins"],
    ["plugin", "/plugins/plugin?id=marketing"],
    ["review", "/plugins/review"],
    ["draft", "/plugins/draft?id=d1"],
    ["run", "/plugins/runs?id=pr1"],
    ["audit", "/audit"],
    ["connections", "/connections"],
  ] as const) {
    test(`${name} at 1280`, async ({ page }) => {
      const db = await mockApi(page, { me: { email: EDITOR, role: "admin" } });
      db.runs = [{ run_id: "pr1", plugin_id: "marketing", plugin_name: "Marketing", plugin_version: "1.2.0", hash: "h120", trigger: "release", status: "completed", requested_by: "github", inputs: { tag: "v2.4.0" }, repo: "example-org/web", created_at: NOW, tokens: 120_000, artifacts: ["d1"] }];
      db.audit = [
        { id: "e1", at: NOW, actor: "release v2.4.0", actor_kind: "system", action: "run.started", plugin_id: "marketing", plugin_version: "1.2.0", run_id: "pr1", result: "ok" },
        { id: "e2", at: NOW, actor: "launch-writer", actor_kind: "agent", action: "tool.called", plugin_id: "marketing", run_id: "pr1", tool: "create_draft", risk: "write", result: "ok" },
      ];
      db.plugins[0].pending = { kind: "update", hash: "h130", sha: "ffffffffffff3333", version: "1.3.0", requested_by: "sync", requested_at: NOW, widened: ["adds tool publish_post (consequential)"], diff: { added: ["tool publish_post"], removed: [], changed: ["agents/launch-writer.md"] } };
      await page.goto(addr);
      await expect(page.getByTestId("topbar")).toBeVisible();
      await page.waitForLoadState("networkidle").catch(() => {});
      await shot(page, `${name}-1280`);
    });
  }
});
