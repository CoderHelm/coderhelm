import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Connecting an AI app (an MCP client) to Coderhelm: the consent page the app
// sends someone to, and Settings, Connected AI apps. Every API call is
// answered here; the app's own redirect address is caught too, so nothing
// leaves the test.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const REQUEST = "eyJhbGciOiJIUzI1NiJ9.eyJjbGllbnRfaWQiOiJtY3BjXzEifQ.c2lnbmF0dXJlLW9mLXRoZS1yZXF1ZXN0";
const MCP_URL = "https://api.example.org/mcp";
const CALLBACK = "https://claude.ai/api/mcp/auth_callback";

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

interface Db {
  calls: { method: string; path: string; body: Record<string, unknown> | null }[];
  connections: Conn[];
}

interface Opts {
  me?: Record<string, unknown>;
  writeRequested?: boolean;
  canAct?: boolean;
  teamWide?: boolean;
  signedIn?: boolean;
  describeError?: string;
}

async function mockApi(page: Page, o: Opts = {}): Promise<Db> {
  const db: Db = {
    calls: [],
    connections: [
      { id: "01jbgrant00000000000000001", client_name: "Claude", redirect_host: "claude.ai", scopes: ["runs:read", "runs:write"], email: "ann@example.com", mine: true, created_at: iso(60 * 24 * 2), last_used_at: iso(5), revoked_at: null, status: "active" },
      { id: "01jbgrant00000000000000002", client_name: "Cursor", redirect_host: "cursor://anysphere.cursor-retrieval", scopes: ["runs:read"], email: "bob@example.com", mine: false, created_at: iso(60 * 24 * 9), last_used_at: null, revoked_at: null, status: "active" },
    ],
  };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  // The app's callback: answered with a small page, so the test sees where the browser went.
  await page.route((url) => url.hostname === "claude.ai", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Back in the app</h1>" }));
  await page.route((url) => url.hostname !== "localhost" && url.hostname !== "claude.ai", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    let body: Record<string, unknown> | null = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    db.calls.push({ method, path: p, body });
    if (p === "/api/me") {
      if (o.signedIn === false) return json(route, { error: "Sign in" }, 401);
      return json(route, { user_id: "u1", team_id: "t_1", github_login: null, email: "ann@example.com", avatar_url: "", role: "member", ...o.me });
    }
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme-labs", status: "active", current: true }] });
    if (p === "/auth/methods") return json(route, { password: true, google: false, github: false });
    if (p === "/api/mcp/authorize/describe") {
      if (o.describeError) return json(route, { error: o.describeError }, 400);
      return json(route, {
        client_id: "mcpc_1",
        client_name: "Claude",
        client_uri: null,
        redirect_host: "claude.ai",
        registered_at: iso(1),
        scopes: [
          { key: "runs:read", label: "See your team's runs and reviews", requested: true, always: true },
          { key: "runs:write", label: "Start and retry runs, and ask for reviews", requested: o.writeRequested ?? true, always: false },
        ],
        email: "ann@example.com",
        team_id: "t_1",
        can_act: o.canAct ?? true,
        mcp_url: MCP_URL,
      });
    }
    if (p === "/api/mcp/authorize" && method === "POST") {
      const q = body?.approve ? "code=chc_test_code&state=xyz" : "error=access_denied&state=xyz";
      return json(route, { redirect_to: `${CALLBACK}?${q}&iss=https%3A%2F%2Fapi.example.org` });
    }
    if (p === "/api/mcp/connections" && method === "GET") {
      const all = o.teamWide ?? false;
      return json(route, {
        connections: all ? db.connections : db.connections.filter((c) => c.mine),
        team_wide: all,
        mcp_url: MCP_URL,
        scopes: [
          { key: "runs:read", label: "See your team's runs and reviews" },
          { key: "runs:write", label: "Start and retry runs, and ask for reviews" },
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

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.screenshot({ path: path.join(SHOTS_DIR, name), fullPage: true });
}

test("the consent page shows which app is asking, where it goes back to, and what it may do", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto(`/authorize/?request=${REQUEST}`);
  await expect(page.getByRole("heading", { level: 1, name: "Let Claude use Coderhelm as you?" })).toBeVisible();
  await expect(page.getByTestId("consent-app")).toHaveText("Claude");
  await expect(page.getByTestId("consent-host")).toHaveText("claude.ai");
  await expect(page.getByTestId("page-header").getByText("ann@example.com", { exact: true })).toBeVisible();
  const scopes = page.getByRole("list", { name: "What the app may do" });
  await expect(scopes.getByText("See your team's runs and reviews")).toBeVisible();
  // Asked for, and the role can act: on, and it can be turned off.
  const write = page.getByRole("checkbox", { name: /Start and retry runs/ });
  await expect(write).toBeChecked();
  await expect(write).toBeEnabled();
  // The signed request went to the gateway as it came.
  expect(db.calls.find((c) => c.path === "/api/mcp/authorize/describe")?.body).toEqual({ request: REQUEST });
  await shot(page, "consent.png");
});

test("allowing sends the answer and goes back to the app with its code", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto(`/authorize/?request=${REQUEST}`);
  await page.getByRole("checkbox", { name: /Start and retry runs/ }).uncheck();
  await page.getByRole("button", { name: "Allow", exact: true }).click();
  await page.waitForURL(/claude\.ai\/api\/mcp\/auth_callback\?code=chc_test_code/);
  await expect(page.getByRole("heading", { name: "Back in the app" })).toBeVisible();
  const decision = db.calls.find((c) => c.path === "/api/mcp/authorize");
  expect(decision?.body).toEqual({ request: REQUEST, approve: true, allow_write: false });
});

test("not allowing goes back to the app with a refusal", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto(`/authorize/?request=${REQUEST}`);
  await page.getByRole("button", { name: "Don't allow" }).click();
  await page.waitForURL(/error=access_denied/);
  expect(db.calls.find((c) => c.path === "/api/mcp/authorize")?.body).toEqual({ request: REQUEST, approve: false, allow_write: false });
});

test("a role that only reads can't give an app more", async ({ page }) => {
  const db = await mockApi(page, { me: { role: "viewer" }, canAct: false });
  await page.goto(`/authorize/?request=${REQUEST}`);
  const write = page.getByRole("checkbox", { name: /Start and retry runs/ });
  await expect(write).not.toBeChecked();
  await expect(write).toBeDisabled();
  await expect(page.getByTestId("consent-read-only")).toBeVisible();
  await page.getByRole("button", { name: "Allow", exact: true }).click();
  await page.waitForURL(/code=chc_test_code/);
  expect(db.calls.find((c) => c.path === "/api/mcp/authorize")?.body).toMatchObject({ approve: true, allow_write: false });
});

test("an app that asked only to read starts with acting off", async ({ page }) => {
  await mockApi(page, { writeRequested: false });
  await page.goto(`/authorize/?request=${REQUEST}`);
  await expect(page.getByRole("checkbox", { name: /Start and retry runs/ })).not.toBeChecked();
  await expect(page.getByText("The app didn't ask for this.")).toBeVisible();
});

test("an expired or missing link says what to do", async ({ page }) => {
  await mockApi(page, { describeError: "This link has expired or isn't valid. Go back to the app and connect again." });
  await page.goto(`/authorize/?request=${REQUEST}`);
  await expect(page.getByTestId("consent-problem")).toContainText("This link has expired");
  await expect(page.getByRole("button", { name: "Allow", exact: true })).toHaveCount(0);
  await page.goto("/authorize/");
  await expect(page.getByTestId("consent-problem")).toContainText("Go back to the app");
});

test("signed out, the consent link is kept for after signing in", async ({ page }) => {
  await mockApi(page, { signedIn: false });
  await page.goto(`/authorize/?request=${REQUEST}`);
  await expect(page.getByRole("button", { name: /^Sign in/ }).first()).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("ch_consent_return"))).toBe(`?request=${REQUEST}`);
});

test("connected apps lists your apps with the address to add, and removing one stops it", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/connected-apps/");
  await expect(page.getByRole("heading", { level: 1, name: "Connected AI apps" })).toBeVisible();
  await expect(page.getByTestId("mcp-url")).toContainText(MCP_URL);
  const list = page.getByRole("list", { name: "Connected apps" });
  await expect(list.getByTestId("connected-app")).toHaveCount(1);
  await expect(list.getByText("Claude", { exact: true })).toBeVisible();
  await expect(list.getByText("claude.ai", { exact: true })).toBeVisible();
  await expect(list.getByText("Start runs and reviews")).toBeVisible();
  await expect(list.getByText(/Last used/)).toBeVisible();
  await shot(page, "connected-apps.png");

  await list.getByRole("button", { name: "Remove Claude" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove app" }).click();
  await expect(page.getByText("Removed Claude.")).toBeVisible();
  expect(db.calls.some((c) => c.method === "DELETE" && c.path === "/api/mcp/connections/01jbgrant00000000000000001")).toBe(true);
  await expect(page.getByText("No apps connected.")).toBeVisible();
});

test("people who manage API keys see everyone's apps and who connected them", async ({ page }) => {
  await mockApi(page, { me: { role: "admin" }, teamWide: true });
  await page.goto("/settings/connected-apps/");
  await expect(page.getByRole("heading", { name: "Apps connected in this team" })).toBeVisible();
  const list = page.getByRole("list", { name: "Connected apps" });
  await expect(list.getByTestId("connected-app")).toHaveCount(2);
  await expect(list.getByText("Connected by bob@example.com")).toBeVisible();
  await expect(list.getByText("Not used yet")).toBeVisible();
});
