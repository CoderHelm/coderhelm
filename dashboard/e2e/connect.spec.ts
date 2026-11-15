import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Connect your AI tools (/connect): the team's MCP address, each tool's
// setup, what people can ask, the scopes the server publishes, your own
// connected tools and, for people who manage API keys, who has connected.
// Every API call is answered here, the MCP server's protected resource
// metadata too; nothing leaves the test.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const MCP_URL = "https://api.example.org/mcp";

const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString();

interface Conn {
  id: string;
  client_name: string;
  redirect_host: string;
  scopes: string[];
  email: string;
  mine: boolean;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  status: string;
}

interface Opts {
  role?: string;
  teamWide?: boolean;
  /** What the server publishes; `null` makes the metadata document fail. */
  published?: string[] | null;
  connections?: Conn[];
}

const ALL_SCOPES = ["runs:read", "runs:write", "knowledge:read", "code:read", "work:read", "security:read"];

function conns(): Conn[] {
  return [
    { id: "g1", client_name: "Claude", redirect_host: "claude.ai", scopes: ["runs:read", "knowledge:read", "code:read"], email: "ann@example.com", mine: true, created_at: iso(60 * 24 * 2), last_used_at: iso(5), revoked_at: null, status: "active" },
    { id: "g2", client_name: "Cursor", redirect_host: "cursor://anysphere.cursor-retrieval", scopes: ["runs:read"], email: "bob@example.com", mine: false, created_at: iso(60 * 24 * 9), last_used_at: null, revoked_at: null, status: "active" },
    { id: "g3", client_name: "VS Code", redirect_host: "vscode.dev", scopes: ["runs:read", "work:read"], email: "bob@example.com", mine: false, created_at: iso(60 * 24), last_used_at: iso(30), revoked_at: null, status: "active" },
    { id: "g4", client_name: "Old app", redirect_host: "example.net", scopes: ["runs:read"], email: "ann@example.com", mine: true, created_at: iso(60 * 24 * 90), last_used_at: null, revoked_at: iso(60), status: "revoked" },
  ];
}

async function mockApi(page: Page, o: Opts = {}) {
  const db = { calls: [] as { method: string; path: string }[], connections: o.connections ?? conns() };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth|\.well-known)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    db.calls.push({ method, path: p });
    if (p === "/.well-known/oauth-protected-resource/mcp") {
      if (o.published === null) return json(route, { error: "unavailable" }, 503);
      return json(route, { resource: MCP_URL, authorization_servers: ["https://api.example.org"], scopes_supported: o.published ?? ALL_SCOPES, bearer_methods_supported: ["header"] });
    }
    if (p === "/api/me") return json(route, { user_id: "u1", team_id: "t_1", github_login: null, email: "ann@example.com", avatar_url: "", role: o.role ?? "member" });
    if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "example-team", status: "active", current: true }] });
    if (p === "/auth/methods") return json(route, { password: true, google: false, github: false });
    if (p === "/api/mcp/connections" && method === "GET") {
      const all = o.teamWide ?? false;
      return json(route, {
        connections: all ? db.connections : db.connections.filter((c) => c.mine),
        team_wide: all,
        mcp_url: MCP_URL,
        scopes: [
          { key: "runs:read", label: "See your team's runs and reviews" },
          { key: "runs:write", label: "Start and retry runs, and ask for reviews" },
          { key: "knowledge:read", label: "Search the knowledge bases you can read in Chat" },
        ],
      });
    }
    if (p.startsWith("/api/mcp/connections/") && method === "DELETE") {
      const id = p.split("/").pop();
      db.connections = db.connections.map((c) => (c.id === id ? { ...c, status: "revoked", revoked_at: iso(0) } : c));
      return json(route, { status: "revoked", id });
    }
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

/** Records what the page writes to the clipboard. */
async function mockClipboard(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __copied: string[] };
    w.__copied = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (t: string) => void w.__copied.push(t), readText: async () => w.__copied[w.__copied.length - 1] ?? "" },
    });
  });
}
const lastCopied = async (page: Page) => (await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied)).at(-1);

/** A full-page shot at desktop and phone width; neither may scroll sideways. */
async function shots(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} at ${width}px scrolls sideways`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS_DIR, `connect-${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

const pickTool = (page: Page, name: string) => page.getByRole("group", { name: "AI tool" }).getByRole("button", { name, exact: true }).click();

test("the page shows the team's address, and Copy copies it exactly", async ({ page }) => {
  await mockClipboard(page);
  await mockApi(page);
  await page.goto("/connect/");
  await expect(page.getByRole("heading", { level: 1, name: "Connect your AI tools" })).toBeVisible();
  const address = page.getByTestId("connect-address");
  await expect(address).toContainText(MCP_URL);
  await address.getByRole("button", { name: "Copy address" }).click();
  await expect(address.getByText("Copied")).toBeVisible();
  expect(await lastCopied(page)).toBe(MCP_URL);
  // Every tool is offered, Claude first.
  const tools = page.getByRole("group", { name: "AI tool" }).getByRole("button");
  await expect(tools).toHaveText(["Claude", "Claude Code", "ChatGPT", "Cursor", "VS Code", "Windsurf", "Other apps"]);
  await expect(page.getByRole("button", { name: "Claude", exact: true })).toHaveAttribute("aria-pressed", "true");
  await shots(page, "member");
});

test("Claude: connectors for Free, Pro and Max, and an owner adds it once for Team and Enterprise", async ({ page }) => {
  await mockClipboard(page);
  await mockApi(page);
  await page.goto("/connect/");
  const panel = page.getByTestId("tool-claude");
  await expect(panel).toContainText("Customize, then Connectors");
  await expect(panel).toContainText("Add custom connector");
  await expect(panel).toContainText("Organization settings, Connectors, Add, then Custom and Web");
  await expect(panel).toContainText("Claude Desktop");
  await panel.getByRole("button", { name: "Copy address" }).click();
  expect(await lastCopied(page)).toBe(MCP_URL);
  await expect(panel.getByRole("link", { name: "Claude's own guide" })).toHaveAttribute("href", /support\.claude\.com/);
});

test("Claude Code: the add command and a .mcp.json, each copied exactly", async ({ page }) => {
  await mockClipboard(page);
  await mockApi(page);
  await page.goto("/connect/");
  await pickTool(page, "Claude Code");
  const cmd = page.getByTestId("snippet-claude-code");
  await cmd.getByTestId("code-copy").click();
  expect(await lastCopied(page)).toBe(`claude mcp add --transport http coderhelm ${MCP_URL}`);
  await expect(page.getByTestId("tool-claude-code")).toContainText("/mcp");
  await page.getByTestId("snippet-claude-code-file").getByTestId("code-copy").click();
  expect(JSON.parse((await lastCopied(page)) ?? "")).toEqual({ mcpServers: { coderhelm: { type: "http", url: MCP_URL } } });
});

test("ChatGPT: developer mode for workspace admins, and search and fetch for deep research", async ({ page }) => {
  await mockApi(page);
  await page.goto("/connect/");
  await pickTool(page, "ChatGPT");
  const panel = page.getByTestId("tool-chatgpt");
  await expect(panel).toContainText("developer mode");
  await expect(panel).toContainText("Business, Enterprise and Edu");
  await expect(panel.getByText("search", { exact: true })).toBeVisible();
  await expect(panel.getByText("fetch", { exact: true })).toBeVisible();
});

test("Cursor: the Add to Cursor link carries the address, and the mcp.json matches", async ({ page }) => {
  await mockClipboard(page);
  await mockApi(page);
  await page.goto("/connect/");
  await pickTool(page, "Cursor");
  const href = (await page.getByTestId("add-to-cursor").getAttribute("href")) ?? "";
  expect(href.startsWith("cursor://anysphere.cursor-deeplink/mcp/install?")).toBe(true);
  const q = new URLSearchParams(href.split("?")[1]);
  expect(q.get("name")).toBe("coderhelm");
  expect(JSON.parse(Buffer.from(q.get("config") ?? "", "base64").toString("utf8"))).toEqual({ url: MCP_URL });
  await page.getByTestId("snippet-cursor").getByTestId("code-copy").click();
  expect(JSON.parse((await lastCopied(page)) ?? "")).toEqual({ mcpServers: { coderhelm: { url: MCP_URL } } });
});

test("VS Code: the install link, the command and the file, with the Copilot policy note", async ({ page }) => {
  await mockClipboard(page);
  await mockApi(page);
  await page.goto("/connect/");
  await pickTool(page, "VS Code");
  const href = (await page.getByTestId("add-to-vscode").getAttribute("href")) ?? "";
  expect(href.startsWith("vscode:mcp/install?")).toBe(true);
  expect(JSON.parse(decodeURIComponent(href.slice("vscode:mcp/install?".length)))).toEqual({ name: "coderhelm", type: "http", url: MCP_URL });
  await page.getByTestId("snippet-vscode-command").getByTestId("code-copy").click();
  expect(await lastCopied(page)).toBe(`code --add-mcp '{"name":"coderhelm","type":"http","url":"${MCP_URL}"}'`);
  await page.getByTestId("snippet-vscode").getByTestId("code-copy").click();
  expect(JSON.parse((await lastCopied(page)) ?? "")).toEqual({ mcpServers: { coderhelm: { type: "http", url: MCP_URL } } });
  await expect(page.getByTestId("tool-vscode")).toContainText("MCP servers in Copilot");
  await shots(page, "vscode");
});

test("Windsurf: mcp_config.json with serverUrl; other apps get the address", async ({ page }) => {
  await mockClipboard(page);
  await mockApi(page);
  await page.goto("/connect/");
  await pickTool(page, "Windsurf");
  await page.getByTestId("snippet-windsurf").getByTestId("code-copy").click();
  expect(JSON.parse((await lastCopied(page)) ?? "")).toEqual({ mcpServers: { coderhelm: { serverUrl: MCP_URL } } });
  await pickTool(page, "Other apps");
  await page.getByTestId("tool-other").getByRole("button", { name: "Copy address" }).click();
  expect(await lastCopied(page)).toBe(MCP_URL);
});

test("scopes and questions follow what the server publishes", async ({ page }) => {
  await mockApi(page, { published: ["runs:read", "runs:write", "knowledge:read", "code:read", "work:read"] });
  await page.goto("/connect/");
  const scopes = page.getByRole("list", { name: "Scopes" });
  await expect(scopes.locator('[data-scope="code:read"]')).toHaveAttribute("data-offered", "yes");
  await expect(scopes.locator('[data-scope="work:read"]')).toHaveAttribute("data-offered", "yes");
  // Not published: listed, but not offered.
  const security = scopes.locator('[data-scope="security:read"]');
  await expect(security).toHaveAttribute("data-offered", "no");
  await expect(security).toContainText("Not offered on this server yet");
  // Held by one of your tools.
  await expect(scopes.locator('[data-scope="code:read"]')).toContainText("In your tools");
  await expect(scopes.locator('[data-scope="runs:write"]')).toContainText("Makes changes");
  // Questions only for what is offered.
  const asks = page.getByRole("list", { name: "Example questions" });
  await expect(asks.getByRole("heading", { name: "Code and docs" })).toBeVisible();
  await expect(asks.getByRole("heading", { name: "Work" })).toBeVisible();
  await expect(asks.getByRole("heading", { name: "Security" })).toHaveCount(0);
});

test("when the server's metadata can't be read, the dashboard's scope list is used", async ({ page }) => {
  await mockApi(page, { published: null });
  await page.goto("/connect/");
  const scopes = page.getByRole("list", { name: "Scopes" });
  await expect(scopes.locator('[data-scope="knowledge:read"]')).toHaveAttribute("data-offered", "yes");
  await expect(scopes.locator('[data-scope="code:read"]')).toHaveAttribute("data-offered", "no");
});

test("your connected tools, and removing one stops it", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/connect/");
  const list = page.getByRole("list", { name: "Your connected tools" });
  await expect(list.getByTestId("my-connection")).toHaveCount(1);
  await expect(list.getByText("Claude", { exact: true })).toBeVisible();
  await expect(list.getByText("Code and docs")).toBeVisible();
  await list.getByRole("button", { name: "Remove Claude" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove tool" }).click();
  await expect(page.getByText("Removed Claude.")).toBeVisible();
  expect(db.calls.some((c) => c.method === "DELETE" && c.path === "/api/mcp/connections/g1")).toBe(true);
  await expect(page.getByText("No tools connected.")).toBeVisible();
});

test("a member doesn't see who else has connected", async ({ page }) => {
  await mockApi(page, { role: "member", teamWide: false });
  await page.goto("/connect/");
  await expect(page.getByRole("heading", { name: "Your connected tools (1)" })).toBeVisible();
  await expect(page.getByTestId("connect-admin")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Who has connected/ })).toHaveCount(0);
});

test("people who manage API keys see who has connected, and the settings that control it", async ({ page }) => {
  await mockApi(page, { role: "admin", teamWide: true });
  await page.goto("/connect/");
  await expect(page.getByRole("heading", { name: "Who has connected (2)" })).toBeVisible();
  const people = page.getByRole("list", { name: "People with connected tools" });
  await expect(people.getByTestId("team-connection")).toHaveCount(2);
  const bob = people.getByTestId("team-connection").filter({ hasText: "bob@example.com" });
  await expect(bob).toContainText("2 tools: Cursor, VS Code");
  await expect(bob).toContainText("Last used");
  // Only your own tools in your list, though you see everyone's.
  await expect(page.getByRole("list", { name: "Your connected tools" }).getByTestId("my-connection")).toHaveCount(1);
  const admin = page.locator("#connect-team");
  await expect(admin.getByRole("link", { name: "Manage connected apps" })).toHaveAttribute("href", "/settings/connected-apps/");
  await expect(admin.getByRole("link", { name: "Members and roles", exact: true })).toHaveAttribute("href", "/settings/team/");
  await shots(page, "admin");
});

test("Knowledge and AI tools are pages of one place, and Connected AI apps links here", async ({ page }) => {
  await mockApi(page, { role: "admin" });
  await page.goto("/connect/");
  const tabs = page.getByRole("navigation", { name: "Knowledge pages" });
  await expect(tabs.getByRole("link", { name: "AI tools" })).toHaveAttribute("aria-current", "page");
  await expect(tabs.getByRole("link", { name: "Knowledge" })).toBeVisible();
  await page.goto("/settings/connected-apps/");
  await expect(page.getByRole("link", { name: /Set it up in Claude, ChatGPT/ })).toHaveAttribute("href", "/connect/");
});
