import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import type { McpServer, McpTool } from "../src/lib/api";

// Remote MCP servers on Settings → Integrations: adding one by address,
// signing in with OAuth (the "vendor" sends the browser straight back to the
// callback page), a static key, a refused private address, the tool picker
// with a second admin's approval, and a connection that needs reconnecting.
// Every API call is answered here; nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const ISSUER = "https://auth.example.com";
const KEY = "sk-live-do-not-show-0123456789";

type Role = "member" | "admin";

function tool(name: string, access: McpTool["access"], description: string): McpTool {
  return { name, title: null, description, access, allowed: false, approved: false, offerable: true };
}

const TOOLS: McpTool[] = [
  tool("search_docs", "read", "Search every page in the docs space."),
  tool("get_page", "read", "Read one page by its id."),
  tool("create_page", "write", "Create a page in a space."),
  tool("rename", "unknown", "Rename a page."),
];

function server(over: Partial<McpServer> = {}): McpServer {
  return {
    id: "docs",
    name: "Docs",
    url: "https://mcp.docs.example.com/mcp",
    catalog_id: "",
    auth: "oauth",
    sharing: "shared",
    header_name: "",
    has_key: false,
    issuer: ISSUER,
    registration: "dynamic",
    needs_client: false,
    has_client: true,
    scopes: ["read"],
    status: "connected",
    status_reason: "",
    status_at: "",
    my_connection: { status: "connected", status_reason: "", connected_at: "" },
    tools: TOOLS.map((t) => ({ ...t })),
    skipped: [],
    tools_listed_at: new Date().toISOString(),
    awaiting_approval: [],
    changed_by: "",
    custom_prompt: "",
    added_by: "dana@example.com",
    added_at: new Date().toISOString(),
    ...over,
  };
}

/** What the list shows for a server, as the gateway works it out. */
function cardFor(s: McpServer) {
  const view = s.auth === "oauth" && s.sharing === "personal"
    ? (s.my_connection ?? { status: "not_connected" as const, status_reason: "Each person connects their own account. You haven't yet." })
    : { status: s.status, status_reason: s.status_reason };
  const status = view.status === "failed" ? "error" : view.status;
  return {
    id: s.catalog_id || `mcp:${s.id}`,
    section: s.catalog_id ? "other" : "mcp",
    name: s.name,
    does: s.catalog_id ? "Create and update issues, query projects, and sync status with Linear." : "A remote MCP server. Agents get only the tools you allow.",
    status,
    reason: view.status_reason,
    action: status === "connected" ? "manage" : status === "needs_reconnect" ? "reconnect" : "connect",
    last_check: s.tools_listed_at,
    manage_href: "",
    detail: s.catalog_id ? { plugin: linearPlugin(), enabled: false, has_credentials: false, custom_prompt: "", remote: s } : { remote: s },
  };
}

function linearPlugin() {
  return {
    id: "linear", name: "Linear", description: "Create and update issues, query projects, and sync status with Linear.", category: "Project Management", tier: 1, icon: "linear",
    credential_fields: [{ key: "api_key", label: "API key", placeholder: "lin_api_...", secret: true }],
    docs_url: "https://example.com/docs", repo_url: "https://example.com/repo", default_prompt: "Read only.", recommended_permissions: "Read-only access",
    remote_url: "https://mcp.linear.example.com/mcp",
  };
}

const linearCard = () => ({
  id: "linear", section: "other", name: "Linear", does: linearPlugin().description, status: "not_connected", reason: "", action: "connect", last_check: "", manage_href: "",
  detail: { plugin: linearPlugin(), enabled: false, has_credentials: false, custom_prompt: "", last_test_ok: null, last_test_message: "", remote: null },
});

interface Backend {
  role: Role;
  me: string;
  admins: number;
  servers: McpServer[];
  calls: { method: string; path: string; body: Record<string, unknown> | null }[];
}

function refresh(s: McpServer) {
  s.awaiting_approval = s.tools.filter((t) => t.allowed && !t.approved).map((t) => t.name);
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { role: "admin", me: "dana@example.com", admins: 1, servers: [], calls: [], ...init };
  const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (r) => {
    const req = r.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    const body = req.postData() ? (JSON.parse(req.postData() as string) as Record<string, unknown>) : null;
    db.calls.push({ method, path: p, body });
    const admin = db.role === "admin";
    if (p === "/api/me") return json(r, { user_id: "u_1", team_id: "t_1", github_login: null, email: db.me, avatar_url: "", role: db.role, auth_provider: "email" });
    if (p === "/api/usage") return json(r, { month: "2026-01", tokens_in: 0, tokens_out: 0, total_runs: 0, total_tokens: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(r, { banners: [] });
    if (p === "/api/teams") return json(r, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/reviewer/org-config") return json(r, { instructions: "", web_domains: [] });
    if (p === "/api/integrations") {
      // The catalog's Linear row carries its remote connection once there is one.
      const linear = db.servers.some((x) => x.catalog_id === "linear") ? [] : [linearCard()];
      return json(r, { can_edit: admin, items: [...linear, ...db.servers.map(cardFor)], migrated: 0 });
    }
    if (p === "/api/mcp-servers" && method === "GET") return json(r, { servers: db.servers, can_edit: admin, redirect_uri: `${url.origin}/settings/integrations/mcp-callback/` });
    if (p === "/api/mcp-servers/detect") {
      const target = String(body?.url ?? "");
      const host = (() => { try { return new URL(target).hostname; } catch { return ""; } })();
      if (!target.startsWith("https://")) return json(r, { error: "The address must start with https://" }, 400);
      if (/^(10\.|127\.|169\.254\.|192\.168\.)|^localhost$|\.internal$/.test(host)) {
        return json(r, { error: "That address is inside a private network, so we can't reach it from here." }, 400);
      }
      const detected = host.includes("key") ? { auth: "header" } : host.includes("open") ? { auth: "none", tool_count: TOOLS.length } : { auth: "oauth", issuer: ISSUER, scopes: ["read"], registration: host.includes("manual") ? "manual" : "automatic" };
      return json(r, { url: target, detected, redirect_uri: `${url.origin}/settings/integrations/mcp-callback/` });
    }
    if (p === "/api/mcp-servers" && method === "POST") {
      if (!admin) return json(r, { error: "Only admins can change MCP servers." }, 403);
      if (body?.catalog_id === "linear") {
        const s = server({ id: "linear", name: "Linear", catalog_id: "linear", url: linearPlugin().remote_url, status: "not_connected", my_connection: null, tools: [], tools_listed_at: "" });
        db.servers.push(s);
        return json(r, { server: s, detected: { auth: "oauth" } });
      }
      const host = new URL(String(body?.url)).hostname;
      const id = String(body?.name ?? "server").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const s = host.includes("key")
        ? server({ id, name: String(body?.name), url: String(body?.url), auth: "header", header_name: String(body?.header_name), has_key: true, issuer: null, my_connection: null })
        : server({ id, name: String(body?.name), url: String(body?.url), sharing: body?.sharing === "personal" ? "personal" : "shared", status: "not_connected", my_connection: null, tools: [], tools_listed_at: "" });
      s.changed_by = db.me;
      db.servers.push(s);
      return json(r, { server: s, detected: { auth: s.auth } });
    }
    const m = p.match(/^\/api\/mcp-servers\/([a-z0-9-]+)(?:\/([a-z]+))?$/);
    if (p === "/api/mcp-servers/oauth/callback") {
      const id = String(body?.state ?? "").replace(/^state-/, "");
      const s = db.servers.find((x) => x.id === id);
      if (!s || body?.iss !== ISSUER) return json(r, { error: "That sign-in was already used or has expired. Start it again." }, 400);
      s.status = "connected";
      s.status_reason = "";
      s.my_connection = { status: "connected", status_reason: "", connected_at: new Date().toISOString() };
      if (s.tools.length === 0) s.tools = TOOLS.map((t) => ({ ...t }));
      s.tools_listed_at = new Date().toISOString();
      return json(r, { server: s, tools_error: null });
    }
    if (m) {
      const s = db.servers.find((x) => x.id === m[1]);
      if (!s) return json(r, { error: "That server isn't set up." }, 404);
      const action = m[2] ?? "";
      if (action === "connect") {
        // The "vendor" approves at once and sends the browser back.
        const back = new URL("/settings/integrations/mcp-callback/", url.origin);
        back.searchParams.set("code", "code-1");
        back.searchParams.set("state", `state-${s.id}`);
        back.searchParams.set("iss", ISSUER);
        return json(r, { authorize_url: back.toString() });
      }
      if (action === "tools") {
        const pick = new Set((body?.allowed as string[]) ?? []);
        for (const t of s.tools) {
          t.allowed = pick.has(t.name);
          if (db.admins <= 1) t.approved = t.allowed;
          else if (!t.allowed) t.approved = false;
        }
        if (s.tools.some((t) => t.allowed && !t.approved)) s.changed_by = db.me;
        refresh(s);
        return json(r, { server: s });
      }
      if (action === "approve") {
        if (s.changed_by === db.me) return json(r, { error: "Another admin has to approve these tools: the person who picked them can't." }, 403);
        for (const t of s.tools) t.approved = t.allowed;
        refresh(s);
        return json(r, { server: s });
      }
      if (action === "activity") return json(r, { calls: [{ tool: "search_docs", actor: "planner, run 01J0000000", ok: true, ms: 420, detail: "", at: new Date().toISOString() }] });
      if (action === "check") return json(r, { server: s, error: null });
      if (action === "connection" && method === "DELETE") {
        s.status = "not_connected";
        s.my_connection = null;
        return json(r, { server: s, revoked: true });
      }
      if (action === "" && method === "DELETE") {
        db.servers = db.servers.filter((x) => x !== s);
        return json(r, { status: "removed" });
      }
    }
    return json(r, { error: `not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 860 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `no sideways scroll at ${width}px`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

const row = (page: Page, id: string) => page.getByTestId(`integration-${id}`);

test("adds a server that signs in with OAuth, comes back from the sign-in, and picks its tools", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/integrations");
  const section = page.locator("#mcp-servers");
  await expect(section.getByRole("heading", { name: "MCP servers" })).toBeVisible();
  await expect(section.getByText("No MCP servers yet")).toBeVisible();

  await page.getByTestId("add-mcp-server-button").click();
  const dialog = page.getByRole("dialog", { name: "Add an MCP server" });
  await dialog.getByLabel("Server address").fill("https://mcp.docs.example.com/mcp");
  await dialog.getByRole("button", { name: "Check address" }).click();
  const found = dialog.getByTestId("mcp-detected");
  await expect(found).toHaveAttribute("data-auth", "oauth");
  await expect(found).toContainText("Signs in with OAuth through auth.example.com");
  await dialog.getByLabel("Name").fill("Docs");
  await expect(dialog.getByRole("group", { name: "Who signs in" })).toBeVisible();
  await shot(page, "mcp-add-oauth");

  await dialog.getByRole("button", { name: "Add and connect" }).click();
  // Back from the sign-in page, on the server's own row with its tools.
  await expect(page).toHaveURL(/\/settings\/integrations\/#integration-mcp:docs$/);
  const callback = db.calls.find((c) => c.path === "/api/mcp-servers/oauth/callback");
  expect(callback?.body).toEqual({ state: "state-docs", code: "code-1", iss: ISSUER });
  const created = db.calls.find((c) => c.path === "/api/mcp-servers" && c.method === "POST");
  expect(created?.body).toMatchObject({ url: "https://mcp.docs.example.com/mcp", name: "Docs", sharing: "shared" });

  const panel = row(page, "mcp:docs").getByTestId("integration-panel");
  await expect(panel.getByTestId("mcp-status")).toContainText("Connected");
  const picker = panel.getByTestId("mcp-tool-picker");
  await expect(picker.getByTestId("mcp-tool")).toHaveCount(4);
  await expect(picker.locator('[data-tool="search_docs"]').getByTestId("mcp-tool-access")).toHaveText("Reads");
  await expect(picker.locator('[data-tool="create_page"]').getByTestId("mcp-tool-access")).toHaveText("Writes");
  await expect(picker.locator('[data-tool="rename"]').getByTestId("mcp-tool-access")).toHaveText("Not said");
  // Nothing is allowed until someone picks.
  await expect(row(page, "mcp:docs")).toHaveAttribute("data-status", "connected");

  await picker.getByRole("button", { name: "Only tools that read" }).click();
  await picker.getByLabel(/create_page/).check();
  await picker.getByRole("button", { name: "Save tools" }).click();
  await expect(page.getByText("Tools saved")).toBeVisible();
  const saved = db.calls.filter((c) => c.path === "/api/mcp-servers/docs/tools").at(-1);
  expect(new Set(saved?.body?.allowed as string[])).toEqual(new Set(["search_docs", "get_page", "create_page"]));
  await expect(picker.getByRole("button", { name: "Save tools" })).toBeDisabled();
  await shot(page, "mcp-connected-tools");
});

test("a server that takes a key checks it, keeps it sealed and never shows it again", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/integrations");
  await page.getByTestId("add-mcp-server-button").click();
  const dialog = page.getByRole("dialog", { name: "Add an MCP server" });
  await dialog.getByLabel("Server address").fill("https://mcp.key.example.com/mcp");
  await dialog.getByRole("button", { name: "Check address" }).click();
  await expect(dialog.getByTestId("mcp-detected")).toHaveAttribute("data-auth", "header");
  await expect(dialog.getByRole("button", { name: "Add server" })).toBeDisabled();
  await dialog.getByLabel("Header").fill("X-API-Key");
  await dialog.getByLabel("Value").fill(KEY);
  await dialog.getByLabel("Name").fill("Search");
  await shot(page, "mcp-add-key");
  await dialog.getByRole("button", { name: "Add server" }).click();
  await expect(dialog).toHaveCount(0);
  const created = db.calls.find((c) => c.path === "/api/mcp-servers" && c.method === "POST");
  expect(created?.body).toMatchObject({ header_name: "X-API-Key", header_value: KEY, name: "Search" });

  const panel = row(page, "mcp:search").getByTestId("integration-panel");
  await expect(panel.getByTestId("mcp-status")).toContainText("Key in X-API-Key");
  await expect(page.locator("body")).not.toContainText(KEY);
  // A key server has no sign-in to start.
  await expect(panel.getByRole("button", { name: /^Connect/ })).toHaveCount(0);
});

test("a private or plain-http address is refused before anything is added", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/integrations");
  await page.getByTestId("add-mcp-server-button").click();
  const dialog = page.getByRole("dialog", { name: "Add an MCP server" });
  await expect(dialog.getByText("Addresses inside a private network are refused.")).toBeVisible();
  for (const [address, message] of [
    ["https://10.0.0.5/mcp", "inside a private network"],
    ["https://169.254.169.254/latest/meta-data", "inside a private network"],
    ["http://mcp.docs.example.com/mcp", "must start with https://"],
  ]) {
    await dialog.getByLabel("Server address").fill(address);
    await dialog.getByRole("button", { name: "Check address" }).click();
    await expect(dialog.getByTestId("mcp-add-error")).toContainText(message);
    await expect(dialog.getByTestId("mcp-detected")).toHaveCount(0);
  }
  await shot(page, "mcp-refused");
  expect(db.calls.filter((c) => c.path === "/api/mcp-servers" && c.method === "POST")).toHaveLength(0);
});

test("with two admins, newly allowed tools wait for the other admin", async ({ page }) => {
  const db = await mockApi(page, { admins: 2, servers: [server()] });
  await page.goto("/settings/integrations/#integration-mcp:docs");
  const panel = row(page, "mcp:docs").getByTestId("integration-panel");
  const picker = panel.getByTestId("mcp-tool-picker");
  await picker.getByLabel(/search_docs/).check();
  await picker.getByRole("button", { name: "Save tools" }).click();
  await expect(page.getByText("Another admin has to approve the new tools.")).toBeVisible();
  await expect(picker.getByText("1 tool waiting for approval")).toBeVisible();
  await expect(picker.getByText("Another admin has to approve them before agents get them.")).toBeVisible();
  await expect(picker.getByRole("button", { name: "Approve" })).toHaveCount(0);

  // The other admin approves.
  db.me = "lee@example.com";
  await page.reload();
  const again = row(page, "mcp:docs").getByTestId("integration-panel").getByTestId("mcp-tool-picker");
  await again.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Tools approved")).toBeVisible();
  await expect(again.getByText("waiting for approval")).toHaveCount(0);
  expect(db.servers[0].tools.find((t) => t.name === "search_docs")?.approved).toBe(true);
});

test("a connection that needs reconnecting says why and reconnects", async ({ page }) => {
  const why = "The sign-in server refused (invalid_grant: refresh token revoked). Reconnect to sign in again.";
  await mockApi(page, {
    servers: [server({ status: "needs_reconnect", status_reason: why, my_connection: { status: "needs_reconnect", status_reason: why, connected_at: "" } })],
  });
  await page.goto("/settings/integrations");
  const r = row(page, "mcp:docs");
  await expect(r).toHaveAttribute("data-status", "needs_reconnect");
  await expect(r.getByTestId("integration-status")).toContainText("Needs reconnect");
  await expect(page.getByTestId("integrations-summary")).toContainText("1 needs reconnecting");
  await r.getByRole("button", { name: /^Docs, Needs reconnecting\. Reconnect/ }).click();
  const panel = r.getByTestId("integration-panel");
  await expect(panel.getByTestId("mcp-status-reason")).toHaveText(why);
  await shot(page, "mcp-needs-reconnect");
  await panel.getByRole("button", { name: "Reconnect" }).click();
  await expect(page).toHaveURL(/#integration-mcp:docs$/);
  await expect(row(page, "mcp:docs")).toHaveAttribute("data-status", "connected");
});

test("a catalog server offers its vendor's sign-in first and keeps the key as a fallback", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/integrations");
  await row(page, "linear").getByRole("button", { name: /^Linear, Not connected/ }).click();
  const panel = row(page, "linear").getByTestId("integration-panel");
  await expect(panel.getByTestId("oauth-offer")).toContainText("nobody pastes a key");
  await expect(panel.getByText("Use a key instead")).toBeVisible();
  await expect(panel.getByLabel("API key")).toBeHidden();
  await shot(page, "mcp-catalog-oauth");
  await panel.getByRole("button", { name: "Connect with Linear" }).click();
  await expect(page).toHaveURL(/#integration-linear$/);
  expect(db.calls.find((c) => c.path === "/api/mcp-servers" && c.method === "POST")?.body).toEqual({ catalog_id: "linear" });
  await expect(row(page, "linear")).toHaveAttribute("data-status", "connected");
  await expect(row(page, "linear").getByTestId("integration-panel").getByTestId("mcp-tool-picker")).toBeVisible();
});

test("a member connects their own account to a server each person signs in to", async ({ page }) => {
  const db = await mockApi(page, { role: "member", me: "sam@example.com", servers: [server({ sharing: "personal", my_connection: null })] });
  await page.goto("/settings/integrations");
  const r = row(page, "mcp:docs");
  await expect(r).toHaveAttribute("data-status", "not_connected");
  await r.getByRole("button", { name: /^Docs, Not connected/ }).click();
  const panel = r.getByTestId("integration-panel");
  await expect(panel.getByTestId("mcp-status-reason")).toHaveText("Each person connects their own account. You haven't yet.");
  // Members don't pick tools or remove servers.
  await expect(panel.getByRole("button", { name: "Save tools" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
  await panel.getByRole("button", { name: "Connect your account" }).click();
  await expect(page).toHaveURL(/#integration-mcp:docs$/);
  expect(db.calls.some((c) => c.path === "/api/mcp-servers/oauth/callback")).toBe(true);
  await expect(row(page, "mcp:docs")).toHaveAttribute("data-status", "connected");
});

test("the callback page explains itself when opened without a sign-in", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/integrations/mcp-callback/");
  await expect(page.getByTestId("mcp-callback")).toHaveAttribute("data-state", "idle");
  await expect(page.getByText(/Nothing to finish here/)).toBeVisible();
});

test("a sign-in that can't be finished says so and keeps no code in the address", async ({ page }) => {
  await mockApi(page, { servers: [server()] });
  await page.goto("/settings/integrations/mcp-callback/?code=c&state=state-docs&iss=https%3A%2F%2Fevil.example.net");
  await expect(page.getByTestId("mcp-callback")).toHaveAttribute("data-state", "failed");
  await expect(page.getByText("That sign-in was already used or has expired.")).toBeVisible();
  expect(page.url()).not.toContain("code=");
});
