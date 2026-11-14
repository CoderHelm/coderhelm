import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Settings, Integrations: the opened card, for every state it has, and a
// sign-in from the click to each way it can end. Every API call is answered
// here; nothing reaches a real backend.
//
// - One status per product: a team signed in to Confluence for Knowledge
//   sees "Connected" on Confluence's card, what it is used for, and a switch
//   (no second sign-in) to use it in runs too.
// - One pattern for every card: not connected (one sentence, one action,
//   nothing about tools or history), signing in (progress, Cancel, and an
//   outcome that always arrives), connected (who, when, what for, Manage,
//   Disconnect), needs attention (the reason and one action).

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const FIGMA_DOES = "Extract design tokens, inspect components, and pull assets from Figma files.";
const FIGMA_READS = "Coderhelm reads your Figma files and the name of the account that signs in. It can't change anything in Figma.";
const CONFLUENCE_DOES = "Searches and reads Confluence pages. Optionally adds text to the end of pages you list.";

type Json = Record<string, unknown>;

function plugin(id: string, name: string, over: Json = {}) {
  return {
    id, name, description: `${name} for agents.`, category: "Tools", tier: 1, icon: id,
    credential_fields: [{ key: "api_token", label: "API token", placeholder: "tok_...", secret: true }],
    docs_url: "https://example.com/docs", repo_url: "", default_prompt: "", recommended_permissions: "Read-only access",
    remote_url: "", remote_key: false, key_unavailable: "", ...over,
  };
}

const FIGMA_APP = {
  authorize: "https://www.figma.com/oauth", token: "https://api.figma.com/v1/oauth/token", refresh: "https://api.figma.com/v1/oauth/refresh",
  scopes: ["current_user:read", "file_content:read"], reads: FIGMA_READS, console: "https://www.figma.com/developers/apps", guide: "https://developers.figma.com/docs/rest-api/oauth-apps/",
};

function server(id: string, name: string, over: Json = {}) {
  return {
    id, name, url: `https://mcp.${id}.example/mcp`, catalog_id: "", auth: "oauth", sharing: "shared", header_name: "", has_key: false,
    issuer: `https://auth.${id}.example`, registration: "dynamic", needs_client: false, has_client: true, scopes: [], status: "not_connected", status_reason: "",
    status_at: "", my_connection: null, tools: [], skipped: [], tools_listed_at: "", awaiting_approval: [], changed_by: "", custom_prompt: "",
    added_by: "ada@example.com", added_at: ago(9 * DAY), ...over,
  };
}

const TOOLS = [
  { name: "query_documents", title: null, description: "Run a query and return the documents.", access: "read", allowed: true, approved: true, offerable: true },
  { name: "patch_document", title: null, description: "Change a document.", access: "write", allowed: false, approved: false, offerable: true },
];

interface Card {
  id: string;
  section: string;
  name: string;
  does: string;
  status: string;
  reason: string;
  action: string;
  last_check: string;
  manage_href: string;
  detail: Json;
  uses: Json[];
  how: string;
  connected_by: string;
  connected_at: string;
}

function card(id: string, section: string, name: string, does: string, status: string, action: string, over: Json = {}): Card {
  return { id, section, name, does, status, reason: "", action, last_check: "", manage_href: "", detail: {}, uses: [], how: "", connected_by: "", connected_at: "", ...over };
}

const usedFor = (id: "runs" | "knowledge", state: string, over: Json = {}) => ({
  id, label: id === "runs" ? "Runs and reviews" : "Knowledge", state, how: "", detail: "", action: null, ...over,
});

const knowledge = (kind: string, label: string, over: Json = {}) => ({
  kind, label, server_id: `ks-${kind.replace("_", "-")}`, personal: false, status: "connected", reason: "",
  connected_by: "ada@example.com", connected_at: ago(2 * DAY), sources: 2, ...over,
});

const RUNS_READY = "The same sign-in can read pages during runs and reviews. Turn it on: no second sign-in.";

/** The report: signed in to Confluence for Knowledge, no connection saved for runs. */
function confluenceForKnowledge(over: Json = {}) {
  return card("confluence", "docs", "Confluence", CONFLUENCE_DOES, "connected", "manage", {
    reason: `Connected for Knowledge. ${RUNS_READY}`,
    how: "the team's Atlassian sign-in", connected_by: "ada@example.com", connected_at: ago(2 * DAY),
    uses: [
      usedFor("runs", "ready", { how: "the team's Atlassian sign-in", detail: RUNS_READY, action: { kind: "use_in_runs", label: "Use in runs too", href: "" } }),
      usedFor("knowledge", "on", { how: "the team's Atlassian sign-in" }),
    ],
    detail: { kind: "confluence", connected: false, needs_name: false, knowledge: knowledge("confluence", "Confluence") },
    ...over,
  });
}

/** The report: Figma with a sign-in through Coderhelm's app never finished, an older record for Figma's own server, and the old switch. */
function figmaNotConnected() {
  return card("figma", "docs", "Figma", FIGMA_DOES, "not_connected", "connect", {
    uses: [usedFor("runs", "off")],
    detail: {
      plugin: plugin("figma", "Figma", { description: FIGMA_DOES, own_app: FIGMA_APP, credential_fields: [{ key: "api_token", label: "Personal Access Token", placeholder: "figd_...", secret: true }] }),
      enabled: false, has_credentials: false, custom_prompt: "", coderhelm_app: true,
      own_app_redirect_uri: "https://coderhelm.example.com/settings/integrations/mcp-callback/",
      own_app: { id: "app-figma", source: "coderhelm", client_id: "", has_secret: false, status: "not_connected", status_reason: "", connected_by: "", connected_at: "", redirect_uri: "" },
      remote: null, knowledge: null,
      unused: [{ id: "figma", name: "Figma", kind: "remote", note: "A sign-in through Figma's own server was started and never finished. Coderhelm doesn't use it." }],
    },
  });
}

function figmaConnected(): Card {
  const c = figmaNotConnected();
  const d = c.detail as { own_app: Json };
  d.own_app = { ...d.own_app, status: "connected", connected_by: "ada@example.com", connected_at: new Date().toISOString() };
  return {
    ...c, status: "connected", action: "manage", reason: "Signed in with Coderhelm's app.", how: "Coderhelm's Figma app",
    connected_by: "ada@example.com", connected_at: new Date().toISOString(), uses: [usedFor("runs", "on", { how: "Coderhelm's Figma app" })],
  };
}

function sanityConnected(over: Json = {}) {
  return card("sanity", "docs", "Sanity", "Query documents, read schemas, and manage content in Sanity.", "connected", "manage", {
    last_check: ago(6 * DAY), how: "Sanity's own server", connected_by: "grace@example.com", connected_at: ago(8 * DAY),
    reason: "Connected for runs and reviews. Knowledge can sync with this sign-in: add a source there.",
    uses: [
      usedFor("runs", "on", { how: "Sanity's own server" }),
      usedFor("knowledge", "ready", { how: "Sanity's own server", detail: "Knowledge can sync with this sign-in: add a source there.", action: { kind: "link", label: "Add a source in Knowledge", href: "/knowledge/" } }),
    ],
    detail: {
      plugin: plugin("sanity", "Sanity", { remote_url: "https://mcp.sanity.io" }), enabled: false, has_credentials: false, custom_prompt: "",
      remote: server("sanity", "Sanity", { catalog_id: "sanity", url: "https://mcp.sanity.io", status: "connected", tools: TOOLS, tools_listed_at: ago(6 * DAY), ...over }),
      knowledge: null, unused: [],
    },
  });
}

interface Backend {
  items: Card[];
  calls: { method: string; path: string; body: Json | null }[];
  /** How the sign-in page answers: with a code, with the provider's refusal, or never. */
  signIn: "ok" | "declined" | "never";
  /** Seconds a started sign-in can still be finished in. */
  expires: number;
  activity: Json[];
  /** Applied when a sign-in finishes. */
  onConnected: () => void;
}

async function mockApi(context: BrowserContext, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { items: [], calls: [], signIn: "ok", expires: 600, activity: [], onConnected: () => {}, ...init };
  const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await context.route((url) => url.hostname !== "localhost", (r) => r.abort());
  // The provider's sign-in page, which never answers in the "never" case.
  await context.route((url) => url.hostname === "localhost" && url.pathname === "/provider-sign-in", (r) =>
    r.fulfill({ status: 200, contentType: "text/html", body: "<title>Sign in</title><h1>Sign in to continue</h1>" }),
  );
  await context.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (r) => {
    const req = r.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    const body = req.postData() ? (JSON.parse(req.postData() as string) as Json) : null;
    db.calls.push({ method, path: p, body });
    const authorize = () =>
      db.signIn === "never" ? "/provider-sign-in" : `/settings/integrations/mcp-callback/?state=app.s1&${db.signIn === "ok" ? "code=c1" : "error=access_denied"}`;
    if (p === "/api/me") return json(r, { user_id: "u_1", team_id: "t_1", github_login: null, email: "ada@example.com", avatar_url: "", role: "admin", auth_provider: "email" });
    if (p === "/api/usage") return json(r, { month: "2026-01", tokens_in: 0, tokens_out: 0, total_runs: 0, total_tokens: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(r, { banners: [] });
    if (p === "/api/teams") return json(r, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/integrations") return json(r, { can_edit: true, items: db.items, migrated: 0 });
    if (p === "/api/reviewer/org-config") return json(r, { instructions: "", web_domains: [] });
    if (p === "/api/mcp-servers" && method === "GET") return json(r, { servers: [], can_edit: true, redirect_uri: "http://localhost/settings/integrations/mcp-callback/" });
    if (/^\/api\/mcp-servers\/[\w-]+\/activity$/.test(p)) return json(r, { calls: db.activity });
    if (/^\/api\/mcp-servers\/[\w-]+\/sign-in$/.test(p) && method === "DELETE") return json(r, { cancelled: 1 });
    if (p === "/api/mcp-servers/apps/figma/coderhelm" && method === "POST") {
      return json(r, { authorize_url: authorize(), server_id: "app-figma", expires_in: db.expires, own_app: { id: "app-figma", source: "coderhelm", client_id: "", has_secret: false, status: "not_connected", status_reason: "", connected_by: "", connected_at: "", redirect_uri: "" } });
    }
    if (/^\/api\/mcp-servers\/[\w-]+\/connect$/.test(p)) return json(r, { authorize_url: authorize(), server_id: p.split("/")[3], expires_in: db.expires });
    if (p === "/api/knowledge/connectors/confluence/connect") return json(r, { authorize_url: authorize(), server_id: "ks-confluence", expires_in: db.expires });
    if (p === "/api/mcp-servers/oauth/callback") {
      if (body?.error) {
        return json(r, {
          error: "Figma answered access_denied: access wasn't granted. Either Cancel was chosen on its sign-in page, or Figma doesn't let this account use Coderhelm's app. Start again, and ask an admin of Figma if it keeps happening.",
          code: "access_denied", flow: "app", return_to: "", server_name: "Figma", catalog_id: "app:figma",
        }, 400);
      }
      db.onConnected();
      return json(r, { server: { id: "app-figma", name: "Figma", catalog_id: "figma" }, tools_error: null, own_app: true, flow: "app", return_to: "" });
    }
    if (p === "/api/connectors/confluence" && method === "PUT") {
      db.onConnected();
      return json(r, { connector: { kind: "confluence", id: "confluence", label: "Confluence", connected: true, enabled: true, status: "ready", via: "sign_in", site: "https://example.atlassian.net" } });
    }
    if (/^\/api\/mcp-servers\/[\w-]+\/connection$/.test(p) && method === "DELETE") {
      db.items = db.items.map((i) => (i.id === "figma" ? figmaNotConnected() : i));
      return json(r, { server: server("app-figma", "Figma"), revoked: true });
    }
    return json(r, { error: `not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

const row = (page: Page, id: string) => page.getByTestId(`integration-${id}`);

/** Opens a row from the keyboard, as its one control. */
async function open(page: Page, id: string) {
  const control = row(page, id).getByRole("button").first();
  await control.focus();
  await page.keyboard.press("Enter");
  await expect(row(page, id).getByTestId("integration-panel")).toBeVisible();
}

/** The opened card at desktop and phone width: no sideways scroll, and a picture of each. */
async function shot(page: Page, id: string, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `no sideways scroll at ${width}px`).toBeLessThanOrEqual(0);
    // The whole card, cut from the full page so the fixed top bar isn't drawn over it.
    const box = await row(page, id).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
    });
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`), fullPage: true, clip: box });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

// ── One status per product ───────────────────────────────────────────

test("Confluence signed in for Knowledge reads Connected, says what it is used for, and runs take one switch", async ({ page, context }) => {
  const db = await mockApi(context, { items: [confluenceForKnowledge()] });
  db.onConnected = () => {
    db.items = [
      confluenceForKnowledge({
        reason: "Used in runs and reviews, and in Knowledge. Agents read pages with the team's Atlassian sign-in.",
        uses: [usedFor("runs", "on", { how: "the team's Atlassian sign-in" }), usedFor("knowledge", "on", { how: "the team's Atlassian sign-in" })],
        detail: { kind: "confluence", id: "confluence", label: "Confluence", connected: true, enabled: true, status: "ready", via: "sign_in", site: "https://example.atlassian.net", spaces: [], knowledge: knowledge("confluence", "Confluence") },
      }),
    ];
  };
  await page.goto("/settings/integrations");
  const r = row(page, "confluence");
  // Never "Not connected" for a product the team is signed in to.
  await expect(r).toHaveAttribute("data-status", "connected");
  await expect(r.getByTestId("integration-status")).toHaveText("Connected");
  await expect(r.getByRole("button").first()).toHaveAccessibleName("Confluence, Connected. Manage");
  await open(page, "confluence");

  const facts = r.getByTestId("connection-facts");
  await expect(facts).toContainText("Connected withThe team's Atlassian sign-in");
  await expect(facts).toContainText("Connected byada@example.com");
  await expect(facts).toContainText("Connected2 days ago");
  await expect(r.getByTestId("use-knowledge")).toHaveAttribute("data-state", "on");
  await expect(r.getByTestId("use-knowledge")).toContainText("On");
  const runs = r.getByTestId("use-runs");
  await expect(runs).toHaveAttribute("data-state", "ready");
  await expect(runs).toContainText(RUNS_READY);
  // A token is another way, never beside the switch.
  await expect(r.getByTestId("other-ways").locator("summary")).toHaveText("Other ways to connect");
  await expect(r.getByTestId("other-ways").getByLabel("API token", { exact: true })).toBeHidden();
  await expect(r.getByRole("link", { name: "Manage Confluence sources in Knowledge" })).toHaveAttribute("href", /\/knowledge\/?$/);
  await shot(page, "confluence", "confluence-knowledge-only");

  // One switch, no second sign-in: the same sign-in is saved for runs.
  await runs.getByRole("button", { name: "Use in runs too" }).click();
  await expect(r.getByTestId("use-runs")).toHaveAttribute("data-state", "on");
  expect(db.calls.find((c) => c.method === "PUT" && c.path === "/api/connectors/confluence")?.body).toEqual({ via: "sign_in", enabled: true });
  expect(db.calls.some((c) => c.path.endsWith("/connect")), "nobody signed in again").toBe(false);
  await expect(r.getByTestId("use-runs")).toContainText("with the team's Atlassian sign-in");
  // Its settings name no token, and writes aren't offered: the sign-in only reads.
  await expect(r.getByTestId("confluence-via-sign-in")).toContainText("No token is needed, and it only reads.");
  await expect(r.getByText("Allow agents to add text")).toHaveCount(0);
  await expect(r.getByTestId("connector-remove")).toContainText("Stop using Confluence in runs");
  await shot(page, "confluence", "confluence-both-uses");
});

test("a Knowledge sign-in that has to be renewed says why with one action, beside the use that still works", async ({ page, context }) => {
  await mockApi(context, {
    items: [
      confluenceForKnowledge({
        status: "needs_reconnect", action: "reconnect",
        reason: "Runs and reviews still work. Knowledge: Atlassian ended the sign-in.",
        how: "an API token", connected_by: "grace@example.com",
        uses: [
          usedFor("runs", "on", { how: "an API token" }),
          usedFor("knowledge", "attention", { how: "the team's Atlassian sign-in", detail: "Atlassian ended the sign-in.", action: { kind: "reconnect", label: "Reconnect", href: "" } }),
        ],
        detail: {
          kind: "confluence", id: "confluence", label: "Confluence", connected: true, enabled: true, status: "ready", key_hint: "9f2c", site: "https://example.atlassian.net", email: "bot@example.com",
          knowledge: knowledge("confluence", "Confluence", { status: "needs_reconnect", reason: "Atlassian ended the sign-in." }),
        },
      }),
    ],
  });
  await page.goto("/settings/integrations");
  const r = row(page, "confluence");
  await expect(r.getByTestId("integration-status")).toHaveText("Needs reconnecting");
  await open(page, "confluence");
  const note = r.getByTestId("integration-attention");
  await expect(note).toContainText("Needs reconnecting");
  await expect(note).toContainText("Runs and reviews still work. Knowledge: Atlassian ended the sign-in.");
  // One action, in the note; the use's row repeats no button.
  await expect(note.getByRole("button", { name: "Sign in again" })).toBeVisible();
  await expect(r.getByTestId("use-knowledge").getByRole("button")).toHaveCount(0);
  await expect(r.getByTestId("use-runs")).toHaveAttribute("data-state", "on");
  await shot(page, "confluence", "confluence-needs-attention");
});

test("Google Drive signed in for Knowledge has a card: who, when, what for, and Disconnect", async ({ page, context }) => {
  await mockApi(context, {
    items: [
      card("google_drive", "docs", "Google Drive", "Syncs the folders, Docs, Sheets, Slides and PDFs you pick into Knowledge. It only reads.", "connected", "manage", {
        manage_href: "/knowledge/", how: "the team's Google sign-in", connected_by: "ada@example.com", connected_at: ago(3 * DAY),
        uses: [usedFor("knowledge", "on", { how: "the team's Google sign-in" })],
        detail: { knowledge: knowledge("google_drive", "Google Drive", { sources: 1 }) },
      }),
    ],
  });
  await page.goto("/settings/integrations");
  const r = row(page, "google_drive");
  await expect(r.getByTestId("integration-does")).toHaveText("Folders, Docs, Sheets and PDFs, synced into Knowledge");
  await open(page, "google_drive");
  await expect(r.getByTestId("connection-facts")).toContainText("Used forKnowledge (1 source)");
  await expect(r.getByTestId("connection-facts")).toContainText("Connected byada@example.com");
  await expect(r.getByTestId("disconnect-knowledge")).toContainText("Its 1 source in Knowledge stop syncing until someone signs in again.");
  await shot(page, "google_drive", "google-drive-connected");
});

// ── Not connected ────────────────────────────────────────────────────

test("Figma not connected: one sentence, one action, what happens next, and nothing about tools or history", async ({ page, context }) => {
  await mockApi(context, { items: [figmaNotConnected()] });
  await page.goto("/settings/integrations");
  await open(page, "figma");
  const r = row(page, "figma");
  const panel = r.getByTestId("integration-panel");
  await expect(panel.getByTestId("access")).toHaveText(FIGMA_READS);
  // One primary action, and what happens next.
  await expect(panel.getByRole("button", { name: "Sign in with Figma" })).toHaveCount(1);
  await expect(panel.getByTestId("coderhelm-app-sign-in-note")).toHaveText("Opens Figma in a new tab. You come back here when done.");
  // The button says what it does to a screen reader too.
  const describedBy = await panel.getByRole("button", { name: "Sign in with Figma" }).getAttribute("aria-describedby");
  await expect(page.locator(`[id="${describedBy}"]`)).toHaveText("Opens Figma in a new tab. You come back here when done.");
  // Nothing about tools, instructions or history; no server address; no second sign-in for the older record.
  for (const gone of ["Recent tool calls", "Instructions agents follow", "Its tools are listed", "Stop using Figma's sign-in", "https://mcp.figma.com"]) {
    await expect(panel.getByText(gone)).toHaveCount(0);
  }
  await expect(panel.getByRole("button", { name: "Connect", exact: true })).toHaveCount(0);
  // The technical names wait behind Details.
  await expect(panel.getByTestId("scopes")).toBeHidden();
  await panel.getByTestId("panel-details").locator("summary").click();
  await expect(panel.getByTestId("scopes")).toHaveText("current_user:read, file_content:read");
  await expect(panel.getByTestId("panel-details")).toContainText("Signs in atwww.figma.com");
  await panel.getByTestId("panel-details").locator("summary").click();
  // Every other way sits under one disclosure, closed.
  const other = panel.getByTestId("other-ways");
  await expect(other.locator("summary")).toHaveText("Other ways to connect");
  await expect(other.getByTestId("way-own")).toBeHidden();
  await shot(page, "figma", "figma-not-connected");
  await other.locator("summary").click();
  await expect(other.getByTestId("way-own")).toContainText("Use your own Figma app");
  await expect(other.getByTestId("way-key")).toContainText("Use a key");
  // The older record is kept, said, and removed only by the person.
  await expect(other.getByTestId("unused-record")).toContainText("A sign-in through Figma's own server was started and never finished. Coderhelm doesn't use it.");
  await expect(other.getByTestId("unused-record").getByRole("button", { name: "Remove it" })).toBeVisible();
  await shot(page, "figma", "figma-other-ways");
});

test("the old switch left on with no key is no dead end: the default sign-in, with the key among the other ways", async ({ page, context }) => {
  const c = figmaNotConnected();
  (c.detail as Json).enabled = true;
  await mockApi(context, {
    items: [
      {
        ...c, status: "needs_credentials", action: "add_credentials", reason: "Switched on, but no credentials are saved, so agents don't get it.",
        uses: [usedFor("runs", "attention", { how: "a key", detail: "Switched on, but no credentials are saved, so agents don't get it.", action: { kind: "add_credentials", label: "Add credentials", href: "" } })],
      },
    ],
  });
  await page.goto("/settings/integrations");
  await open(page, "figma");
  const panel = row(page, "figma").getByTestId("integration-panel");
  await expect(panel.getByTestId("integration-attention")).toContainText("Switched on, but no credentials are saved, so agents don't get it.");
  // One primary action: the sign-in. The key form is open among the other ways, and quiet.
  await expect(panel.getByRole("button", { name: "Sign in with Figma", exact: true })).toHaveCount(1);
  await expect(panel.getByTestId("way-key").getByLabel("Personal Access Token")).toBeVisible();
  await shot(page, "figma", "figma-switched-on-no-key");
});

test("a server added by address, not connected: Connect and nothing else yet", async ({ page, context }) => {
  await mockApi(context, {
    items: [card("mcp:wiki", "mcp", "Team wiki", "A remote MCP server at mcp.wiki.example. Agents get only the tools you allow.", "not_connected", "connect", { detail: { remote: server("wiki", "Team wiki") } })],
  });
  await page.goto("/settings/integrations");
  await open(page, "mcp:wiki");
  const panel = row(page, "mcp:wiki").getByTestId("integration-panel");
  await expect(panel.getByRole("button", { name: "Connect", exact: true })).toHaveCount(1);
  await expect(panel.getByTestId("mcp-sign-in-note")).toHaveText("Opens Team wiki in a new tab. You come back here when done.");
  await expect(panel.getByTestId("mcp-manage")).toHaveCount(0);
  await expect(panel.getByText("Recent tool calls")).toHaveCount(0);
  await expect(panel.getByTestId("mcp-disconnect")).toHaveCount(0);
  // The address is a detail, and removing the server is the destructive end.
  await expect(panel.getByText("https://mcp.wiki.example/mcp")).toBeHidden();
  await expect(panel.getByTestId("mcp-remove").getByRole("button", { name: "Remove server" })).toBeVisible();
  await shot(page, "mcp:wiki", "mcp-not-connected");
});

// ── Signing in, and every way it ends ────────────────────────────────

test("signing in opens a new tab, shows it is waiting, and the card becomes Connected when the tab finishes", async ({ page, context }) => {
  const db = await mockApi(context, { items: [figmaNotConnected()] });
  db.onConnected = () => {
    db.items = [figmaConnected()];
  };
  await page.goto("/settings/integrations");
  await open(page, "figma");
  const r = row(page, "figma");
  const tab = context.waitForEvent("page");
  await r.getByRole("button", { name: "Sign in with Figma" }).click();
  const popup = await tab;
  // The sign-in finished in the other tab, which closes itself.
  await popup.waitForEvent("close");
  await expect(r).toHaveAttribute("data-status", "connected");
  await expect(r.getByTestId("connection-facts")).toContainText("Connected withCoderhelm's Figma app");
  await expect(r.getByTestId("connection-facts")).toContainText("Connected byada@example.com");
  await expect(r.getByTestId("connection-facts")).toContainText("Used forRuns and reviews");
  // This tab never left the page.
  await expect(page).toHaveURL(/\/settings\/integrations\/?$/);
  // Disconnect is last, worded and coloured as what it is, and asks first.
  const danger = r.getByTestId("disconnect");
  await expect(danger).toContainText("Disconnect FigmaAgents stop using Figma until someone signs in again.");
  await shot(page, "figma", "figma-connected");
  await danger.getByRole("button", { name: "Disconnect" }).click();
  const sure = page.getByTestId("confirm-dialog");
  await expect(sure).toContainText("Disconnect Figma?");
  await sure.getByRole("button", { name: "Disconnect" }).click();
  await expect(r).toHaveAttribute("data-status", "not_connected");
});

test("while it waits the button says so, and Cancel ends it at once", async ({ page, context }) => {
  const db = await mockApi(context, { items: [figmaNotConnected()], signIn: "never" });
  await page.goto("/settings/integrations");
  await open(page, "figma");
  const r = row(page, "figma");
  const tab = context.waitForEvent("page");
  await r.getByRole("button", { name: "Sign in with Figma" }).click();
  const popup = await tab;
  const waiting = r.getByTestId("coderhelm-app-sign-in-button");
  await expect(waiting).toHaveText("Waiting for Figma…");
  await expect(waiting).toBeDisabled();
  await expect(waiting).toHaveAttribute("aria-busy", "true");
  await expect(r.getByTestId("coderhelm-app-sign-in-note")).toHaveText("Finish signing in in the Figma tab. This page updates on its own; the sign-in stays open for 10 minutes.");
  await expect(r.getByTestId("coderhelm-app-sign-in-note")).toHaveAttribute("role", "status");
  await shot(page, "figma", "figma-signing-in");
  await r.getByRole("button", { name: "Cancel" }).click();
  await expect(r.getByTestId("coderhelm-app-sign-in")).toHaveAttribute("data-outcome", "cancelled");
  await expect(r.getByTestId("coderhelm-app-sign-in-note")).toHaveText("Sign-in cancelled. Nothing was connected.");
  await expect(r.getByRole("button", { name: "Sign in with Figma" })).toBeEnabled();
  // The sign-in's link stops working, and its tab is closed.
  await expect.poll(() => db.calls.some((c) => c.method === "DELETE" && c.path === "/api/mcp-servers/app-figma/sign-in")).toBe(true);
  await expect.poll(() => popup.isClosed()).toBe(true);
});

test("declined at the provider: the card says why and offers Try again", async ({ page, context }) => {
  await mockApi(context, { items: [figmaNotConnected()], signIn: "declined" });
  await page.goto("/settings/integrations");
  await open(page, "figma");
  const r = row(page, "figma");
  const tab = context.waitForEvent("page");
  await r.getByRole("button", { name: "Sign in with Figma" }).click();
  await (await tab).waitForEvent("close");
  const outcome = r.getByTestId("coderhelm-app-sign-in-outcome");
  await expect(r.getByTestId("coderhelm-app-sign-in")).toHaveAttribute("data-outcome", "declined");
  await expect(outcome).toContainText("Figma wasn't connected: access wasn't granted");
  await expect(outcome).toContainText("Figma answered access_denied: access wasn't granted.");
  await expect(r.getByRole("button", { name: "Try again" })).toBeEnabled();
  await expect(r).toHaveAttribute("data-status", "not_connected");
  await shot(page, "figma", "figma-declined");
});

test("a blocked pop-up is said, with the choice to sign in in this tab", async ({ page, context }) => {
  const db = await mockApi(context, { items: [figmaNotConnected()] });
  db.onConnected = () => {
    db.items = [figmaConnected()];
  };
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await page.goto("/settings/integrations");
  await open(page, "figma");
  const r = row(page, "figma");
  await r.getByRole("button", { name: "Sign in with Figma" }).click();
  await expect(r.getByTestId("coderhelm-app-sign-in")).toHaveAttribute("data-outcome", "blocked");
  const outcome = r.getByTestId("coderhelm-app-sign-in-outcome");
  await expect(outcome).toContainText("Your browser blocked the sign-in tab");
  await expect(outcome).toContainText("Allow pop-ups for this site and try again, or sign in to Figma in this tab: you come back here when done.");
  // Nothing was started while the tab was blocked.
  expect(db.calls.some((c) => c.path === "/api/mcp-servers/apps/figma/coderhelm")).toBe(false);
  await shot(page, "figma", "figma-popup-blocked");
  // In this tab: the callback page finishes it and comes back to the card.
  await r.getByRole("button", { name: "Sign in in this tab" }).click();
  await expect(page).toHaveURL(/\/settings\/integrations\/#integration-figma$/);
  await expect(row(page, "figma")).toHaveAttribute("data-status", "connected");
});

test("a sign-in nobody finishes times out, says so, and cancels itself", async ({ page, context }) => {
  const db = await mockApi(context, { items: [figmaNotConnected()], signIn: "never", expires: 2 });
  await page.goto("/settings/integrations");
  await open(page, "figma");
  const r = row(page, "figma");
  const tab = context.waitForEvent("page");
  await r.getByRole("button", { name: "Sign in with Figma" }).click();
  const popup = await tab;
  await expect(r.getByTestId("coderhelm-app-sign-in")).toHaveAttribute("data-outcome", "timed_out");
  const outcome = r.getByTestId("coderhelm-app-sign-in-outcome");
  await expect(outcome).toContainText("The Figma sign-in wasn't finished in time");
  await expect(outcome).toContainText("Nothing was connected. A sign-in has to be finished within 2 seconds. Try again when you're ready.");
  await expect(r.getByRole("button", { name: "Try again" })).toBeEnabled();
  await expect.poll(() => popup.isClosed()).toBe(true);
  expect(db.calls.some((c) => c.method === "DELETE" && c.path === "/api/mcp-servers/app-figma/sign-in")).toBe(true);
  await shot(page, "figma", "figma-timed-out");
});

test("a sign-in the API can't start says why, with the button ready again", async ({ page, context }) => {
  await mockApi(context, { items: [figmaNotConnected()] });
  await context.route("**/api/mcp-servers/apps/figma/coderhelm", (r) =>
    r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "CoderHelm's app isn't set up on this install. Use your own app or a key instead." }) }),
  );
  await page.goto("/settings/integrations");
  await open(page, "figma");
  const r = row(page, "figma");
  await r.getByRole("button", { name: "Sign in with Figma" }).click();
  await expect(r.getByTestId("coderhelm-app-sign-in")).toHaveAttribute("data-outcome", "failed");
  await expect(r.getByTestId("coderhelm-app-sign-in-outcome")).toContainText("The Figma sign-in couldn't start");
  await expect(r.getByRole("button", { name: "Try again" })).toBeEnabled();
});

// ── Connected ────────────────────────────────────────────────────────

test("connected: who and when, what it is used for, and Manage shows only what has something in it", async ({ page, context }) => {
  const db = await mockApi(context, { items: [sanityConnected()] });
  await page.goto("/settings/integrations");
  await open(page, "sanity");
  const r = row(page, "sanity");
  await expect(r.getByTestId("connection-facts")).toContainText("Connected withSanity's own server");
  await expect(r.getByTestId("connection-facts")).toContainText("Connected bygrace@example.com");
  await expect(r.getByTestId("connection-facts")).toContainText("Last checked6 days ago");
  await expect(r.getByTestId("use-runs")).toContainText("On");
  await expect(r.getByTestId("use-knowledge").getByRole("link", { name: "Add a source in Knowledge" })).toHaveAttribute("href", /\/knowledge\/?$/);
  const manage = r.getByTestId("mcp-manage");
  await expect(manage.getByTestId("mcp-tool")).toHaveCount(2);
  // No instructions and no calls yet: one link to add instructions, no empty boxes.
  await expect(manage.getByText("Recent tool calls")).toHaveCount(0);
  await expect(manage.getByRole("button", { name: "Add instructions agents follow with this server" })).toBeVisible();
  await expect(manage.getByLabel("Instructions")).toHaveCount(0);
  await expect(r.getByTestId("disconnect")).toContainText("The tools you allowed stay picked.");
  await shot(page, "sanity", "sanity-connected");

  // With calls and instructions, both show.
  db.items = [sanityConnected({ custom_prompt: "Read only the production dataset." })];
  db.activity = [
    { tool: "query_documents", actor: "coder, run 01J", ok: true, ms: 120, detail: "", at: ago(3_600_000) },
    { tool: "query_documents", actor: "plan chat (ada@example.com)", ok: false, ms: 80, detail: "The server answered 429.", at: ago(7_200_000) },
  ];
  await page.reload();
  await open(page, "sanity");
  await expect(row(page, "sanity").getByTestId("mcp-manage").locator("summary", { hasText: "Recent tool calls (2)" })).toBeVisible();
  await expect(row(page, "sanity").getByTestId("mcp-manage").locator("summary", { hasText: "Instructions agents follow with this server" })).toBeVisible();
  await shot(page, "sanity", "sanity-connected-with-history");
});

test("the whole card works from the keyboard: open, reach the action, close", async ({ page, context }) => {
  await mockApi(context, { items: [figmaNotConnected()] });
  await page.goto("/settings/integrations");
  const control = row(page, "figma").getByRole("button").first();
  await control.focus();
  await expect(control).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(control).toHaveAttribute("aria-expanded", "true");
  // The next stop is the primary action; nothing else comes first.
  await page.keyboard.press("Tab");
  await expect(row(page, "figma").getByRole("button", { name: "Sign in with Figma" })).toBeFocused();
  // Disclosures open from the keyboard.
  await page.keyboard.press("Tab");
  await expect(row(page, "figma").getByTestId("panel-details").locator("summary")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(row(page, "figma").getByTestId("other-ways").locator("summary")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(row(page, "figma").getByTestId("way-own")).toBeVisible();
});
