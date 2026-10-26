import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Knowledge sources that connect by signing in: Sanity through the member's
// own Sanity sign-in (the one Connected apps uses), run in a small window
// that hands back to the flow, then project, dataset and types as before;
// the source says whose sign-in it syncs with, and when that sign-in stops
// working any admin signs in again from the source. Every API call is
// answered here; nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

const LIMITS = {
  max_file_bytes: 25 * 1024 * 1024,
  max_files: 500,
  extensions: ["pdf", "md", "txt"],
  agents: [{ key: "planner", label: "Planner" }],
  read_roles: ["viewer", "member", "admin"],
};

const LABEL: Record<string, string> = { notion: "Notion", confluence: "Confluence", sanity: "Sanity", google_drive: "Google Drive", github: "GitHub", web: "Website" };

const TREE: Record<string, { id: string; title: string; kind: string; has_children: boolean; selectable: boolean; detail: string }[]> = {
  "": [
    { id: "project:abc123", title: "Help center", kind: "project", has_children: true, selectable: false, detail: "Project abc123" },
    { id: "project:zp7mbokg", title: "Marketing site", kind: "project", has_children: true, selectable: false, detail: "Project zp7mbokg" },
  ],
  "project:abc123": [
    { id: "dataset:abc123:production", title: "production", kind: "dataset", has_children: true, selectable: true, detail: "Every content type" },
    { id: "dataset:abc123:staging", title: "staging", kind: "dataset", has_children: true, selectable: true, detail: "Every content type" },
  ],
  "dataset:abc123:production": [
    { id: "type:abc123:production:article", title: "article", kind: "type", has_children: false, selectable: true, detail: "Document type" },
    { id: "type:abc123:production:faq", title: "faq", kind: "type", has_children: false, selectable: true, detail: "Document type" },
  ],
};

interface Src {
  id: string;
  kind: string;
  label: string;
  name: string;
  selection: { id: string; title: string; kind: string; path: string[]; include_children: boolean }[];
  options: Record<string, unknown>;
  paused: boolean;
  status: "queued" | "syncing" | "ready" | "error";
  error: { message: string; fix: string; action: string; at: string } | null;
  progress: null;
  items: number;
  failed_items: number;
  truncated: boolean;
  last_sync_at: string;
  last_success_at: string;
  next_sync_at: string;
  live_updates: boolean;
  created_at: string;
  created_by: string;
  connection: "sign_in" | "";
  signin: { name: string; email: string; account: string } | null;
}

const sanitySource = (over: Partial<Src> = {}): Src => ({
  id: "src_help",
  kind: "sanity",
  label: "Sanity",
  name: "Help center articles",
  selection: [{ id: "type:abc123:production:article", title: "article", kind: "type", path: ["Help center", "production"], include_children: true }],
  options: { project_id: "abc123" },
  paused: false,
  status: "ready",
  error: null,
  progress: null,
  items: 128,
  failed_items: 0,
  truncated: false,
  last_sync_at: iso(4),
  last_success_at: iso(4),
  next_sync_at: iso(-11),
  live_updates: false,
  created_at: iso(900),
  created_by: "ada@example.com",
  connection: "sign_in",
  signin: { name: "Ada Lovelace", email: "ada@example.com", account: "Ada Lovelace" },
  ...over,
});

const expired = (who = "Ada Lovelace") =>
  sanitySource({
    signin: { name: who, email: "bo@example.com", account: who },
    status: "error",
    error: {
      message: "The sign-in expired and the server gave no way to renew it. Reconnect.",
      fix: `${who}'s Sanity sign-in stopped working. Sign in again to keep this up to date.`,
      action: "sign_in",
      at: iso(30),
    },
  });

interface Backend {
  calls: string[];
  bodies: Record<string, unknown>[];
  signedIn: boolean;
  hasSavedKey: boolean;
  sources: Src[];
}

async function mockApi(context: BrowserContext, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { calls: [], bodies: [], signedIn: false, hasSavedKey: false, sources: [], ...init };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const base = () => ({
    id: "kb_help",
    name: "Support answers",
    description: "",
    read_role: "viewer",
    attach_team: true,
    agents: [],
    authoritative: false,
    created_at: iso(900),
    updated_at: iso(60),
    files: 0,
    ready: 0,
    processing: 0,
    failed: 0,
    uploads: 0,
    synced: 0,
    kinds: db.sources.map((s) => s.kind),
    sources: db.sources.map((s) => ({ id: s.id, kind: s.kind, name: s.name, status: s.status, paused: s.paused, items: s.items, last_success_at: s.last_success_at })),
  });
  await context.route((url) => url.hostname !== "localhost", (route) => route.abort());
  // Sanity's sign-in page, in the small window.
  await context.route((url) => url.hostname === "localhost" && url.pathname === "/__sanity", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<title>Sanity</title><h1>Sign in to Sanity</h1><p>Coderhelm wants to read your content.</p>" }),
  );
  await context.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    db.calls.push(`${method} ${p}${url.search}`);
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    if (body) db.bodies.push({ call: `${method} ${p}`, ...body });
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "ada@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/mcp-servers/oauth/callback") {
      db.signedIn = true;
      return json(route, { server: { id: "ks-sanity", name: "Sanity (knowledge)", catalog_id: "source:sanity" }, tools_error: null });
    }
    if (p === "/api/knowledge/connectors") {
      return json(route, {
        connectors: Object.keys(LABEL).map((k) => {
          const sanity = k === "sanity";
          return {
            kind: k,
            label: LABEL[k],
            blurb: sanity ? "Documents of the types you pick" : `Pick what to bring in from ${LABEL[k]}`,
            connected: sanity ? db.signedIn || db.hasSavedKey : k !== "google_drive",
            via: sanity ? (db.signedIn ? "sign_in" : db.hasSavedKey ? "saved_key" : "") : "oauth",
            can_sign_in: true,
            reconnect_reason: "",
            connected_by: "",
            hint: "",
            live_updates: true,
            picker: k === "web" ? "address" : "tree",
            member_sign_in: sanity,
            signed_in: sanity && db.signedIn,
            signed_in_as: sanity && db.signedIn ? "Ada Lovelace" : "ada@example.com",
            has_saved_key: sanity && db.hasSavedKey,
          };
        }),
        visibility_note: "Everyone who can read this knowledge base can read what you add, even if they can't open it in the app it comes from.",
      });
    }
    if (p === "/api/knowledge/connectors/sanity/signin") {
      return json(route, db.signedIn ? { signed_in: true } : { signed_in: false, authorize_url: `${url.origin}/__sanity?state=sanity:abc` });
    }
    if (p === "/api/knowledge/connectors/sanity/browse") {
      if (url.searchParams.get("via") !== "sign_in") return json(route, { error: "Sanity isn't connected.", fix: "", action: "reconnect" }, 409);
      if (!db.signedIn) return json(route, { error: "You aren't signed in to Sanity yet.", fix: "Sign in with Sanity to continue.", action: "sign_in" }, 409);
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const parent = url.searchParams.get("parent") ?? "";
      let nodes = TREE[parent] ?? [];
      if (q) nodes = TREE[""].filter((n) => n.title.toLowerCase().includes(q));
      return json(route, { nodes: nodes.map((n) => ({ url: "", updated_at: "", ...n })), options: {} });
    }
    if (p === "/api/knowledge" && method === "GET") return json(route, { bases: [base()], can_manage: true, limits: LIMITS });
    if (p === "/api/knowledge/kb_help" && method === "GET") {
      return json(route, { base: base(), files: [], sources: db.sources, can_manage: true, limits: LIMITS, visibility_note: "Everyone who can read this knowledge base can read what you add." });
    }
    if (p === "/api/knowledge/kb_help/sources" && method === "POST") {
      const s = sanitySource({ id: "src_new", name: "article", selection: body.selection, status: "ready", items: 12, connection: body.via === "sign_in" ? "sign_in" : "", signin: body.via === "sign_in" ? { name: "Ada Lovelace", email: "ada@example.com", account: "Ada Lovelace" } : null });
      db.sources.push(s);
      return json(route, { source: s, setup: null, visibility_note: "" });
    }
    const signinAgain = p.match(/^\/api\/knowledge\/kb_help\/sources\/([^/]+)\/signin$/);
    if (signinAgain) {
      if (!db.signedIn) return json(route, { authorize_url: `${url.origin}/__sanity?state=sanity:again` });
      const s = db.sources.find((x) => x.id === signinAgain[1])!;
      Object.assign(s, { status: "queued", error: null, signin: { name: "Ada Lovelace", email: "ada@example.com", account: "Ada Lovelace" } });
      return json(route, { source: s });
    }
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

/** Screenshots at 1440 and 390, in the dark and light color schemes. */
async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const scheme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SHOTS_DIR, `knowledge-signin-${name}-${width}-${scheme}.png`) });
    }
  }
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 1280, height: 800 });
}

async function noSideways(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
}

/** Finishes the sign-in in the small window the way Sanity sends it back. */
async function finishInPopup(popup: Page, state: string) {
  await expect(popup.getByRole("heading", { name: "Sign in to Sanity" })).toBeVisible();
  await popup.goto(`/settings/integrations/mcp-callback/?state=${state}&code=xyz`);
}

test.describe("Sanity by signing in", () => {
  test("sign in with Sanity in a small window, pick project, dataset and types, and the source says whose sign-in it uses", async ({ page, context }) => {
    const db = await mockApi(context);
    await page.goto("/knowledge/base/?id=kb_help");
    await page.getByTestId("add-source").click();
    await page.getByTestId("tile-sanity").click();

    const step = page.getByTestId("signin-step");
    await expect(step).toHaveAttribute("data-state", "choose");
    await expect(step.getByTestId("signin-button")).toHaveText("Sign in with Sanity");
    await expect(step.getByTestId("use-token")).toHaveText("Use an API token instead (adds instant updates)");
    await expect(step).not.toContainText("paste");
    await shot(page, "1-choose");

    const popupPromise = page.waitForEvent("popup");
    await step.getByTestId("signin-button").click();
    const popup = await popupPromise;
    await expect(step).toHaveAttribute("data-state", "signing-in");
    await expect(step).toContainText("A Sanity window is open");
    await shot(page, "2-signing-in");
    expect(db.calls).toContain("POST /api/knowledge/connectors/sanity/signin");

    // The window finishes the sign-in, tells this page, and closes. The page
    // never navigated away.
    const closed = popup.waitForEvent("close");
    await finishInPopup(popup, "sanity:abc");
    await closed;
    await expect(page).toHaveURL(/\/knowledge\/base\/\?id=kb_help$/);
    await expect(step).toHaveAttribute("data-state", "connected");
    await expect(step.getByTestId("signed-in-as")).toHaveText("Connected as Ada Lovelace");
    await shot(page, "3-connected");

    await step.getByTestId("signin-continue").click();
    const tree = page.getByTestId("picker-tree");
    await expect(tree.getByTestId("picker-row")).toHaveCount(2);
    // A project can't be ticked; open it for its datasets, then a dataset for its types.
    await expect(tree.locator('[data-id="project:abc123"]').getByTestId("picker-check")).toHaveCount(0);
    await page.getByRole("button", { name: "Open Help center" }).click();
    await page.getByRole("button", { name: "Open production" }).click();
    await tree.locator('[data-id="type:abc123:production:article"]').getByTestId("picker-check").check();
    await expect(page.getByTestId("picked-summary")).toContainText("1 selected");
    expect(db.calls.filter((c) => c.includes("/connectors/sanity/browse")).every((c) => c.includes("via=sign_in"))).toBe(true);
    await shot(page, "4-picking");

    await page.getByTestId("flow-continue").click();
    await expect(page.getByTestId("signin-note")).toContainText("It stays up to date through your Sanity sign-in");
    await page.getByTestId("flow-finish").click();
    await expect(page.getByTestId("progress-step")).toBeVisible();
    const sent = db.bodies.find((b) => b.call === "POST /api/knowledge/kb_help/sources")!;
    expect(sent.via).toBe("sign_in");
    expect(sent.kind).toBe("sanity");
    expect((sent.selection as { id: string }[]).map((s) => s.id)).toEqual(["type:abc123:production:article"]);

    await page.getByTestId("flow-open").click();
    const card = page.locator('[data-testid="source-card"][data-kind="sanity"]');
    await expect(card.getByTestId("source-signin")).toHaveText("Synced with Ada Lovelace's Sanity sign-in");
    await shot(page, "5-source");
  });

  test("already signed in on Connected apps: the sign-in is reused, no window opens", async ({ page, context }) => {
    const db = await mockApi(context, { signedIn: true });
    await page.goto("/knowledge/base/?id=kb_help");
    await page.getByTestId("add-source").click();
    await page.getByTestId("tile-sanity").click();
    const step = page.getByTestId("signin-step");
    await expect(step).toHaveAttribute("data-state", "connected");
    await expect(step.getByTestId("signed-in-as")).toHaveText("Connected as Ada Lovelace");
    let popups = 0;
    page.on("popup", () => (popups += 1));
    await step.getByTestId("signin-continue").click();
    await expect(page.getByTestId("picker-tree").getByTestId("picker-row")).toHaveCount(2);
    expect(popups).toBe(0);
    expect(db.calls).not.toContain("POST /api/knowledge/connectors/sanity/signin");
  });

  test("the API token is the second choice: explained when the team has none, used when it has one", async ({ page, context }) => {
    await mockApi(context);
    await page.goto("/knowledge/base/?id=kb_help");
    await page.getByTestId("add-source").click();
    await page.getByTestId("tile-sanity").click();
    await page.getByTestId("use-token").click();
    const help = page.getByTestId("token-help");
    await expect(help).toContainText("Viewer is enough");
    await expect(help.getByRole("link", { name: "Open Integrations in a new tab" })).toHaveAttribute("target", "_blank");
    // The flow is still here.
    await expect(page.getByTestId("signin-button")).toBeVisible();
  });

  test("a saved token goes straight to the team's picker", async ({ page, context }) => {
    const db = await mockApi(context, { hasSavedKey: true });
    await page.goto("/knowledge/base/?id=kb_help");
    await page.getByTestId("add-source").click();
    await page.getByTestId("tile-sanity").click();
    await page.getByTestId("use-token").click();
    await expect(page.getByTestId("flow-step")).toHaveAttribute("data-step", "pick");
    await expect.poll(() => db.calls.some((c) => c.startsWith("GET /api/knowledge/connectors/sanity/browse") && !c.includes("via="))).toBe(true);
  });

  test("an expired sign-in: one sentence, Sign in again for any admin, and it picks up again", async ({ page, context }) => {
    const db = await mockApi(context, { sources: [expired("Bo Admin")] });
    await page.goto("/knowledge/base/?id=kb_help");
    const card = page.locator('[data-testid="source-card"][data-kind="sanity"]');
    await expect(card).toHaveAttribute("data-status", "error");
    await expect(card.getByTestId("source-health")).toHaveText("Bo Admin's Sanity sign-in stopped working. Sign in again to keep this up to date.");
    await expect(card.getByTestId("source-fix")).toHaveText("Sign in again");
    await expect(card.getByTestId("source-signin")).toHaveText("Synced with Bo Admin's Sanity sign-in");
    await shot(page, "6-expired");

    const popupPromise = page.waitForEvent("popup");
    await card.getByTestId("source-fix").click();
    const popup = await popupPromise;
    const closed = popup.waitForEvent("close");
    await finishInPopup(popup, "sanity:again");
    await closed;
    await expect(card.getByTestId("source-health")).toContainText("Starting in a moment");
    await expect(card.getByTestId("source-signin")).toHaveText("Synced with Ada Lovelace's Sanity sign-in");
    // Signed in first in the window, then the source switches to the new sign-in.
    expect(db.calls).toContain("POST /api/knowledge/connectors/sanity/signin");
    expect(db.calls.filter((c) => c === "POST /api/knowledge/kb_help/sources/src_help/signin")).toHaveLength(1);
    await expect(page).toHaveURL(/\/knowledge\/base\/\?id=kb_help$/);
  });

  test("Sign in again when you're already signed in switches the source at once", async ({ page, context }) => {
    const db = await mockApi(context, { signedIn: true, sources: [expired()] });
    await page.goto("/knowledge/base/?id=kb_help");
    const card = page.locator('[data-testid="source-card"][data-kind="sanity"]');
    let popups = 0;
    page.on("popup", () => (popups += 1));
    await expect(card.getByTestId("source-fix")).toHaveText("Sign in again");
    // The page learns you're signed in before the click.
    await expect.poll(() => db.calls.includes("GET /api/knowledge/connectors")).toBe(true);
    await card.getByTestId("source-fix").click();
    await expect(card.getByTestId("source-health")).toContainText("Starting in a moment");
    expect(popups).toBe(0);
  });

  test("at 390 wide nothing scrolls sideways at any step", async ({ page, context }) => {
    await mockApi(context, { signedIn: true, sources: [expired()] });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/knowledge/base/?id=kb_help");
    await expect(page.getByTestId("source-card")).toBeVisible();
    await noSideways(page);
    await page.getByTestId("add-source").click();
    await page.getByTestId("tile-sanity").click();
    await expect(page.getByTestId("signin-step")).toBeVisible();
    await noSideways(page);
    await page.getByTestId("signin-continue").click();
    await expect(page.getByTestId("picker-tree")).toBeVisible();
    await noSideways(page);
  });
});
