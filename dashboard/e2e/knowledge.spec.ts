import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { pickOption } from "./select";

// Knowledge: the guided flow that makes a knowledge base from an app (or
// files), signing in to an app and coming back, the picker, sync status and
// errors with their fix, uploads, roles, the old addresses, and phone width.
// Every API call is answered here; nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

const LIMITS = {
  max_file_bytes: 25 * 1024 * 1024,
  max_files: 500,
  extensions: ["pdf", "docx", "md", "markdown", "txt", "text", "csv", "xlsx", "html", "htm"],
  agents: [
    { key: "planner", label: "Planner" },
    { key: "coder", label: "Coder" },
    { key: "reviewer", label: "Reviewer" },
    { key: "plan_chat", label: "Plan chat" },
  ],
  read_roles: ["viewer", "member", "admin"],
};

type Status = "queued" | "syncing" | "ready" | "error";

interface Src {
  id: string;
  kind: string;
  label: string;
  name: string;
  selection: { id: string; title: string; kind: string; path: string[]; include_children: boolean }[];
  options: Record<string, unknown>;
  paused: boolean;
  status: Status;
  error: { message: string; fix: string; action: string; at: string } | null;
  progress: { phase: string; done: number; total: number } | null;
  items: number;
  failed_items: number;
  truncated: boolean;
  last_sync_at: string;
  last_success_at: string;
  next_sync_at: string;
  live_updates: boolean;
  created_at: string;
  created_by: string;
}

interface KItem {
  id: string;
  name: string;
  kind: string;
  size: number;
  status: "uploading" | "processing" | "ready" | "failed";
  error: string;
  source_id?: string;
  url?: string | null;
  path?: string;
  as_of: string;
}

interface Kb {
  id: string;
  name: string;
  read_role: string;
  sources: Src[];
  items: KItem[];
}

interface Backend {
  role: string;
  calls: string[];
  bodies: Record<string, unknown>[];
  bases: Kb[];
  connected: Record<string, boolean>;
  canSignIn: Record<string, boolean>;
  /** GETs of a base while a new source is importing. */
  ticks: number;
}

const LABEL: Record<string, string> = { notion: "Notion", confluence: "Confluence", sanity: "Sanity", google_drive: "Google Drive", github: "GitHub", web: "Website" };

const TREE: Record<string, { id: string; title: string; kind: string; has_children: boolean; detail?: string }[]> = {
  "": [
    { id: "page:eng", title: "Engineering", kind: "page", has_children: true },
    { id: "page:hr", title: "People and HR", kind: "page", has_children: true },
    { id: "database:roadmap", title: "Roadmap", kind: "database", has_children: true, detail: "Database" },
  ],
  "page:eng": [
    { id: "page:runbooks", title: "Runbooks", kind: "page", has_children: true },
    { id: "page:onboarding", title: "Onboarding", kind: "page", has_children: false },
  ],
};

const source = (over: Partial<Src>): Src => ({
  id: "src_wiki",
  kind: "notion",
  label: "Notion",
  name: "Engineering",
  selection: [{ id: "page:eng", title: "Engineering", kind: "page", path: [], include_children: true }],
  options: {},
  paused: false,
  status: "ready",
  error: null,
  progress: null,
  items: 3,
  failed_items: 0,
  truncated: false,
  last_sync_at: iso(5),
  last_success_at: iso(5),
  next_sync_at: iso(-55),
  live_updates: true,
  created_at: iso(900),
  created_by: "admin@example.com",
  ...over,
});

const item = (over: Partial<KItem>): KItem => ({
  id: "i1",
  name: "Deploy runbook",
  kind: "notion",
  size: 2000,
  status: "ready",
  error: "",
  source_id: "src_wiki",
  url: "https://www.notion.so/Deploy-runbook-0a1b",
  path: "Engineering / Runbooks",
  as_of: "2026-10-20",
  ...over,
});

/** A knowledge base with a source in each state, for the detail page. */
function fullBase(): Kb {
  return {
    id: "kb_eng",
    name: "Engineering handbook",
    read_role: "viewer",
    sources: [
      source({}),
      source({ id: "src_drive", kind: "google_drive", label: "Google Drive", name: "Policies", status: "error", items: 12, error: { message: "Google Drive didn't accept the saved sign-in.", fix: "Reconnect Google Drive to sign in again.", action: "reconnect", at: iso(20) } }),
      source({ id: "src_conf", kind: "confluence", label: "Confluence", name: "Platform space", status: "syncing", items: 8, progress: { phase: "fetching", done: 12, total: 40 } }),
      source({ id: "src_sanity", kind: "sanity", label: "Sanity", name: "Help center", paused: true, items: 41 }),
    ],
    items: [
      item({}),
      item({ id: "i2", name: "Onboarding checklist", url: "https://www.notion.so/Onboarding-2c3d", path: "Engineering" }),
      item({ id: "i3", name: "Leave policy", kind: "google_drive", source_id: "src_drive", url: "https://docs.google.com/document/d/1", path: "Policies" }),
      item({ id: "i4", name: "Incident process", kind: "confluence", source_id: "src_conf", url: "https://acme.atlassian.net/wiki/spaces/PLAT/pages/42", path: "Platform space / Operations" }),
      item({ id: "f1", name: "Benefits 2026.pdf", kind: "pdf", source_id: undefined, url: null, path: undefined, size: 120_000 }),
    ],
  };
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = {
    role: "admin",
    calls: [],
    bodies: [],
    bases: [],
    connected: { notion: true, confluence: true, github: true, web: true, sanity: false, google_drive: false },
    canSignIn: { notion: true, confluence: true, google_drive: true, sanity: false, github: false, web: false },
    ticks: 0,
    ...init,
  };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const canManage = () => db.role === "admin" || db.role === "owner";
  const baseJson = (b: Kb) => ({
    id: b.id,
    name: b.name,
    description: "",
    read_role: b.read_role,
    attach_team: true,
    agents: [],
    authoritative: false,
    created_at: iso(900),
    updated_at: iso(60),
    files: b.items.length,
    ready: b.items.filter((i) => i.status === "ready").length,
    processing: b.items.filter((i) => i.status === "processing").length,
    failed: b.items.filter((i) => i.status === "failed").length,
    uploads: b.items.filter((i) => !i.source_id).length,
    synced: b.items.filter((i) => i.source_id).length,
    kinds: [...(b.items.some((i) => !i.source_id) ? ["upload"] : []), ...b.sources.map((s) => s.kind)],
    sources: b.sources.map((s) => ({ id: s.id, kind: s.kind, name: s.name, status: s.status, paused: s.paused, items: s.items, last_success_at: s.last_success_at })),
  });
  const itemJson = (i: KItem) => ({ version: 1, searchable: i.status === "ready", uploaded_at: iso(30), uploaded_by: "Notion sync", chunks: 4, truncated: false, ...i });
  // A new source brings its pages in over a few polls.
  const advance = (b: Kb) => {
    for (const s of b.sources) {
      if (s.id !== "src_new" || s.status === "ready") continue;
      db.ticks += 1;
      const titles = ["Engineering", "Runbooks", "Onboarding"];
      const done = Math.min(titles.length, db.ticks);
      b.items = b.items.filter((i) => i.source_id !== s.id);
      titles.slice(0, done).forEach((t, n) => b.items.push(item({ id: `new_${n}`, name: t, source_id: s.id, url: `https://www.notion.so/${t}` })));
      s.items = done;
      if (done >= titles.length) {
        s.status = "ready";
        s.progress = null;
        s.last_success_at = new Date().toISOString();
      } else {
        s.status = "syncing";
        s.progress = { phase: "fetching", done, total: titles.length };
      }
    }
  };
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && url.pathname.startsWith("/__upload/"), (route) => {
    db.calls.push(`PUT ${new URL(route.request().url()).pathname}`);
    return route.fulfill({ status: 200, body: "" });
  });
  // Where "Connect" sends the browser: a stand-in for the app's sign-in page.
  await page.route((url) => url.hostname === "localhost" && url.pathname === "/__oauth", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Sign in to Google</h1>" }),
  );
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    db.calls.push(`${method} ${p}${url.search}`);
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    if (body) db.bodies.push({ call: `${method} ${p}`, ...body });
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: db.role });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/mcp-servers/oauth/callback") {
      db.connected[String(body.state).split(":")[0]] = true;
      return json(route, { server: { id: "ks-google-drive", name: "Google Drive (knowledge)", catalog_id: "source:google_drive" }, tools_error: null });
    }
    if (p === "/api/knowledge" && method === "GET") return json(route, { bases: db.bases.map(baseJson), can_manage: canManage(), limits: LIMITS });
    if (p === "/api/knowledge" && method === "POST") {
      const b: Kb = { id: "kb_new", name: body.name, read_role: body.read_role, sources: [], items: [] };
      if (body.source) b.sources.push(source({ id: "src_new", kind: body.source.kind, label: LABEL[body.source.kind], name: body.source.selection[0].title, selection: body.source.selection, status: "queued", items: 0, last_success_at: "" }));
      db.bases.push(b);
      return json(route, { base: baseJson(b), source: b.sources[0] ?? null, setup: null });
    }
    if (p === "/api/knowledge/connectors") {
      return json(route, {
        connectors: Object.keys(LABEL).map((k) => ({
          kind: k,
          label: LABEL[k],
          blurb: k === "notion" ? "Pages and databases, with the pages under them" : `Pick what to bring in from ${LABEL[k]}`,
          connected: !!db.connected[k],
          via: db.connected[k] ? "oauth" : "",
          can_sign_in: !!db.canSignIn[k],
          reconnect_reason: "",
          connected_by: "",
          hint: "",
          live_updates: true,
          picker: k === "web" ? "address" : "tree",
          member_sign_in: k === "sanity",
          signed_in: false,
          signed_in_as: "admin@example.com",
          has_saved_key: false,
        })),
        visibility_note: "Everyone who can read this knowledge base can read what you add, even if they can't open it in the app it comes from.",
      });
    }
    const connect = p.match(/^\/api\/knowledge\/connectors\/([a-z_]+)\/connect$/);
    if (connect) return json(route, { authorize_url: `${url.origin}/__oauth?state=${connect[1]}:abc` });
    const browse = p.match(/^\/api\/knowledge\/connectors\/([a-z_]+)\/browse$/);
    if (browse) {
      if (browse[1] === "web") {
        const q = url.searchParams.get("q") ?? "";
        if (q.includes("localhost")) return json(route, { error: "The address must be a public https address.", fix: "", action: "edit" }, 400);
        const u = q.startsWith("https://") ? q : `https://${q}`;
        const sitemap = u.endsWith(".xml");
        return json(route, { nodes: [{ id: `${sitemap ? "sitemap" : "url"}:${u}`, title: u, kind: sitemap ? "sitemap" : "url", has_children: false, selectable: true, url: u, updated_at: "", detail: "" }], options: {} });
      }
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const parent = url.searchParams.get("parent") ?? "";
      let nodes = TREE[parent] ?? [];
      if (q) nodes = [...TREE[""], ...TREE["page:eng"]].filter((n) => n.title.toLowerCase().includes(q));
      return json(route, { nodes: nodes.map((n) => ({ selectable: true, url: "", updated_at: iso(10), detail: "", ...n })), options: {} });
    }
    const m = p.match(/^\/api\/knowledge\/([^/]+)(\/.*)?$/);
    const b = m ? db.bases.find((x) => x.id === m[1]) : undefined;
    if (b && !m![2] && method === "GET") {
      advance(b);
      return json(route, { base: baseJson(b), files: b.items.map(itemJson), sources: b.sources, can_manage: canManage(), limits: LIMITS, visibility_note: "Everyone who can read this knowledge base can read what you add." });
    }
    if (b && m![2] === "/sources" && method === "POST") {
      const s = source({ id: "src_new", kind: body.kind, label: LABEL[body.kind], name: body.selection[0].title, selection: body.selection, status: "queued", items: 0, last_success_at: "" });
      b.sources.push(s);
      return json(route, { source: s, setup: null, visibility_note: "" });
    }
    const srcPath = m?.[2]?.match(/^\/sources\/([^/]+)(\/sync)?$/);
    if (b && srcPath) {
      const s = b.sources.find((x) => x.id === srcPath[1])!;
      if (srcPath[2] && method === "POST") {
        s.status = "syncing";
        s.progress = { phase: "listing", done: 0, total: 0 };
        return json(route, { source: s });
      }
      if (method === "PUT") {
        Object.assign(s, body.selection ? { selection: body.selection } : {}, body.paused !== undefined ? { paused: body.paused } : {});
        return json(route, { source: s });
      }
      if (method === "DELETE") {
        b.sources = b.sources.filter((x) => x.id !== s.id);
        b.items = b.items.filter((i) => i.source_id !== s.id);
        return json(route, { ok: true, removed: 3 });
      }
    }
    if (b && m![2] === "/files" && method === "POST") {
      const f = item({ id: `up_${b.items.length}`, name: body.name, kind: "pdf", source_id: undefined, url: null, path: undefined, status: "uploading" });
      b.items.unshift(f);
      return json(route, { file: itemJson(f), upload: { url: `${url.origin}/__upload/${f.id}`, method: "PUT", headers: { "content-type": "application/pdf" } } });
    }
    const up = m?.[2]?.match(/^\/files\/([^/]+)\/uploaded$/);
    if (b && up) {
      const f = b.items.find((i) => i.id === up[1])!;
      f.status = "processing";
      return json(route, { file: itemJson(f) });
    }
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOTS_DIR, `knowledge-${name}-${width}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

/** No sideways scroll at the current width. */
async function noSideways(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
}

test.describe("creating a knowledge base", () => {
  test("the whole guided flow: pick Notion, tick pages, name it, watch it arrive", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/knowledge/");
    const empty = page.getByTestId("knowledge-empty");
    await expect(empty).toContainText("Bring in what your team already knows");
    await shot(page, "empty");

    await page.getByTestId("start-knowledge").click();
    const flow = page.getByTestId("add-flow");
    await expect(flow.getByTestId("choose-step")).toBeVisible();
    await expect(flow.getByTestId("tile-notion")).toContainText("Connected");
    await shot(page, "flow-1-choose");

    await flow.getByTestId("tile-notion").click();
    await expect(page.getByTestId("flow-step")).toHaveAttribute("data-step", "pick");
    const tree = flow.getByTestId("picker-tree");
    await expect(tree.getByTestId("picker-row")).toHaveCount(3);
    await flow.getByRole("button", { name: "Open Engineering" }).click();
    await expect(tree.getByTestId("picker-row")).toHaveCount(5);
    // Ticking a parent includes what is inside it.
    await tree.locator('[data-id="page:eng"]').getByTestId("picker-check").check();
    const child = tree.locator('[data-id="page:runbooks"]');
    await expect(child.getByTestId("picker-check")).toBeChecked();
    await expect(child.getByTestId("picker-check")).toBeDisabled();
    await expect(child).toContainText("Included with Engineering");
    await expect(flow.getByTestId("picked-summary")).toContainText("1 selected");
    await shot(page, "flow-2-pick");

    await page.getByTestId("flow-continue").click();
    const name = page.getByTestId("flow-name");
    await expect(name).toHaveValue("Engineering");
    await expect(page.getByTestId("read-sentence")).toContainText("Everyone on your team can read this.");
    await expect(page.getByTestId("visibility-note")).toContainText("can't open it in the app it comes from");
    await shot(page, "flow-3-name");
    await name.fill("Engineering wiki");
    await page.getByTestId("change-read").click();
    await pickOption(page.getByTestId("read-select"), "member");

    await page.getByTestId("flow-finish").click();
    await expect(page.getByTestId("flow-step")).toHaveAttribute("data-step", "progress");
    const sent = db.bodies.find((b) => b.call === "POST /api/knowledge")!;
    expect(sent.name).toBe("Engineering wiki");
    expect(sent.read_role).toBe("member");
    expect(sent.source).toEqual({ kind: "notion", selection: [{ id: "page:eng", title: "Engineering", kind: "page", path: [], include_children: true }] });
    // Per-page progress while it imports.
    await expect(page.getByTestId("progress-words")).toContainText(/Bringing in \d of 3|Done/);
    await shot(page, "flow-4-progress");
    await expect(page.getByTestId("progress-words")).toContainText("Done. 3 pages ready.", { timeout: 20_000 });
    await expect(page.getByTestId("arrived").locator("li")).toHaveCount(3);
    await shot(page, "flow-5-done");

    await page.getByTestId("flow-open").click();
    await expect(page).toHaveURL(/\/knowledge\/base\/\?id=kb_new/);
    await expect(page.getByTestId("source-card")).toContainText("Engineering");
    await expect(page.getByTestId("source-health")).toContainText("Up to date");
  });

  test("an app that isn't connected: one click signs in, and the flow carries on at the picker", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/knowledge/");
    await page.getByTestId("start-google_drive").click();
    const connectStep = page.getByTestId("connect-step");
    await expect(connectStep).toContainText("Connect Google Drive to Coderhelm");
    await shot(page, "flow-connect");
    await page.getByTestId("connect-button").click();
    await expect(page.getByRole("heading", { name: "Sign in to Google" })).toBeVisible();
    expect(db.calls).toContain("POST /api/knowledge/connectors/google_drive/connect");
    // The app sends the browser back to the sign-in page, which returns to Knowledge.
    await page.goto("/settings/integrations/mcp-callback/?state=google_drive:abc&code=xyz");
    await expect(page).toHaveURL(/\/knowledge\/$/, { timeout: 15_000 });
    await expect(page.getByTestId("flow-step")).toHaveAttribute("data-step", "pick");
    await expect(page.getByTestId("picker-tree").getByTestId("picker-row").first()).toBeVisible();
  });

  test("Sanity starts with signing in, not a key (the sign-in flow is in knowledge-signin.spec.ts)", async ({ page }) => {
    await mockApi(page);
    await page.goto("/knowledge/");
    await page.getByTestId("start-sanity").click();
    const step = page.getByTestId("signin-step");
    await expect(step.getByTestId("signin-button")).toHaveText("Sign in with Sanity");
    await expect(step.getByTestId("use-token")).toContainText("Use an API token instead");
    await expect(page.getByTestId("connect-hint")).toHaveCount(0);
  });

  test("files: drop them in, name it, and they upload one by one", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/knowledge/");
    await page.getByTestId("start-upload").click();
    await page.getByTestId("flow-upload-input").setInputFiles([
      { name: "Benefits 2026.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 a") },
      { name: "tool.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") },
    ]);
    await expect(page.getByTestId("upload-step")).toContainText("Benefits 2026.pdf");
    await expect(page.getByTestId("upload-step")).toContainText("isn't supported");
    await shot(page, "flow-upload");
    await page.getByTestId("flow-continue").click();
    await expect(page.getByTestId("flow-name")).toHaveValue("Benefits 2026");
    await page.getByTestId("flow-finish").click();
    await expect(page.getByTestId("progress-step")).toContainText("All files uploaded");
    expect(db.calls.some((c) => c.startsWith("PUT /__upload/"))).toBe(true);
  });

  test("a website takes addresses, and refuses private ones", async ({ page }) => {
    await mockApi(page);
    await page.goto("/knowledge/");
    await page.getByTestId("start-web").click();
    await page.getByTestId("address-input").fill("http://localhost/admin");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByTestId("address-picker")).toContainText("public https address");
    await page.getByTestId("address-input").fill("docs.example.com/sitemap.xml");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByTestId("address-list")).toContainText("Every page in this sitemap");
    await page.getByTestId("flow-continue").click();
    await expect(page.getByTestId("flow-name")).toHaveValue("https://docs.example.com/sitemap.xml");
  });

  test("the picker searches as you type", async ({ page }) => {
    await mockApi(page);
    await page.goto("/knowledge/");
    await page.getByTestId("start-notion").click();
    await page.getByTestId("picker-search").fill("run");
    const rows = page.getByTestId("picker-tree").getByTestId("picker-row");
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Runbooks");
    await page.getByTestId("picker-search").fill("zzz");
    await expect(page.getByTestId("picker-empty")).toContainText('Nothing in Notion matches "zzz"');
  });
});

test.describe("a knowledge base's sources", () => {
  test("each source says where it is in plain words, with the one thing to do", async ({ page }) => {
    const db = await mockApi(page, { bases: [fullBase()] });
    await page.goto("/knowledge/base/?id=kb_eng");
    const cards = page.getByTestId("source-card");
    await expect(cards).toHaveCount(4);
    const ok = cards.filter({ hasText: "Engineering" }).first();
    await expect(ok.getByTestId("source-health")).toContainText("Up to date, checked 5 minutes ago");
    const broken = page.locator('[data-testid="source-card"][data-status="error"]');
    await expect(broken.getByTestId("source-health")).toHaveText("Reconnect Google Drive to sign in again.");
    await expect(broken.getByTestId("source-fix")).toHaveText("Reconnect Google Drive");
    const syncing = page.locator('[data-testid="source-card"][data-status="syncing"]');
    await expect(syncing).toContainText("Bringing in 12 of 40");
    await expect(syncing.getByRole("progressbar")).toBeVisible();
    const paused = page.locator('[data-testid="source-card"][data-kind="sanity"]');
    await expect(paused).toContainText("Paused. Changes in Sanity aren't brought in.");
    await expect(page.getByTestId("read-line")).toContainText("Everyone on your team can read this.");
    await shot(page, "detail");

    // Check for changes on the healthy one.
    await ok.getByTestId("source-sync").click();
    await expect(ok.getByTestId("source-health")).toContainText("Checking for changes");
    expect(db.calls).toContain("POST /api/knowledge/kb_eng/sources/src_wiki/sync");

    // Resume the paused one.
    await paused.getByTestId("source-resume").click();
    expect(db.bodies.some((b) => b.call === "PUT /api/knowledge/kb_eng/sources/src_sanity" && b.paused === false)).toBe(true);

    // The reconnect button signs in again.
    await broken.getByTestId("source-fix").click();
    await expect(page.getByRole("heading", { name: "Sign in to Google" })).toBeVisible();
    expect(db.calls).toContain("POST /api/knowledge/connectors/google_drive/connect");
  });

  test("choose pages again, pause, and remove from a source's menu", async ({ page }) => {
    const db = await mockApi(page, { bases: [fullBase()] });
    await page.goto("/knowledge/base/?id=kb_eng");
    const ok = page.locator('[data-testid="source-card"][data-kind="notion"]');
    await ok.getByRole("button", { name: "More for Engineering" }).click();
    await page.getByRole("menuitem", { name: "Choose pages" }).click();
    const tree = page.getByTestId("picker-tree");
    await expect(tree.locator('[data-id="page:eng"]').getByTestId("picker-check")).toBeChecked();
    await tree.locator('[data-id="page:hr"]').getByTestId("picker-check").check();
    await page.getByTestId("save-selection").click();
    const put = db.bodies.find((b) => b.call === "PUT /api/knowledge/kb_eng/sources/src_wiki")!;
    expect((put.selection as { id: string }[]).map((s) => s.id)).toEqual(["page:eng", "page:hr"]);

    await ok.getByRole("button", { name: "More for Engineering" }).click();
    await page.getByRole("menuitem", { name: /Pause updates/ }).click();
    expect(db.bodies.some((b) => b.call === "PUT /api/knowledge/kb_eng/sources/src_wiki" && b.paused === true)).toBe(true);

    await ok.getByRole("button", { name: "More for Engineering" }).click();
    await page.getByRole("menuitem", { name: "Remove" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Nothing changes in Notion");
    await page.getByRole("button", { name: "Remove", exact: true }).last().click();
    await expect(page.locator('[data-testid="source-card"][data-kind="notion"]')).toHaveCount(0);
    expect(db.calls).toContain("DELETE /api/knowledge/kb_eng/sources/src_wiki");
  });

  test("adding a source to an existing knowledge base", async ({ page }) => {
    const db = await mockApi(page, { bases: [fullBase()] });
    await page.goto("/knowledge/base/?id=kb_eng");
    await page.getByTestId("add-source").click();
    await page.getByTestId("tile-confluence").click();
    await page.getByTestId("picker-tree").locator('[data-id="page:hr"]').getByTestId("picker-check").check();
    await page.getByTestId("flow-continue").click();
    await expect(page.getByTestId("flow-name")).toHaveCount(0);
    await expect(page.getByTestId("visibility-note")).toBeVisible();
    await page.getByTestId("flow-finish").click();
    await expect(page.getByTestId("progress-step")).toBeVisible();
    expect(db.calls).toContain("POST /api/knowledge/kb_eng/sources");
  });

  test("pages: search, filter by source, and links open the original page", async ({ page }) => {
    await mockApi(page, { bases: [fullBase()] });
    await page.goto("/knowledge/base/?id=kb_eng");
    const rows = page.getByTestId("item-row");
    await expect(rows).toHaveCount(5);
    const link = rows.filter({ hasText: "Deploy runbook" }).getByTestId("item-link");
    await expect(link).toHaveAttribute("href", "https://www.notion.so/Deploy-runbook-0a1b");
    await expect(link).toHaveAttribute("target", "_blank");
    await page.getByTestId("items-search").fill("policy");
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Leave policy");
    await page.getByTestId("items-search").fill("");
    await page.getByRole("button", { name: /^Uploaded files/ }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Benefits 2026.pdf");
  });

  test("files dropped anywhere on the page upload, and unsupported ones are refused", async ({ page }) => {
    const db = await mockApi(page, { bases: [fullBase()] });
    await page.goto("/knowledge/base/?id=kb_eng");
    await page.getByTestId("upload-input").setInputFiles({ name: "tool.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") });
    await expect(page.getByTestId("upload-problems")).toContainText("isn't supported");
    await page.getByTestId("upload-input").setInputFiles({ name: "Security policy.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 hi") });
    await expect(page.getByTestId("item-row").filter({ hasText: "Security policy.pdf" })).toBeVisible();
    expect(db.calls.some((c) => c.startsWith("PUT /__upload/"))).toBe(true);
    // Dragging files over the page shows where they go.
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(["x"], "a.md"));
      document.querySelector('[data-testid="knowledge-base-page"] > div')!.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true }));
    });
    await expect(page.getByTestId("drop-overlay")).toContainText("Drop to add to Engineering handbook");
  });
});

test.describe("roles, addresses and phones", () => {
  test("members read but don't manage", async ({ page }) => {
    await mockApi(page, { role: "member", bases: [fullBase()] });
    await page.goto("/knowledge/");
    await expect(page.getByTestId("knowledge-card")).toContainText("Engineering handbook");
    await expect(page.getByTestId("new-knowledge")).toHaveCount(0);
    await page.goto("/knowledge/base/?id=kb_eng");
    await expect(page.getByTestId("source-card").first()).toBeVisible();
    await expect(page.getByTestId("add-source")).toHaveCount(0);
    await expect(page.getByTestId("source-sync")).toHaveCount(0);
    await expect(page.getByTestId("source-fix")).toHaveCount(0);
  });

  test("the list shows each base's apps, size and whether it is up to date", async ({ page }) => {
    await mockApi(page, { bases: [fullBase(), { ...fullBase(), id: "kb_2", name: "Support answers", sources: [source({ id: "s2", kind: "sanity", label: "Sanity", name: "Help center" })] }] });
    await page.goto("/knowledge/");
    const cards = page.getByTestId("knowledge-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.first().getByTestId("knowledge-health")).toContainText("Google Drive needs attention");
    await expect(cards.nth(1).getByTestId("knowledge-health")).toContainText("Up to date");
    await shot(page, "list");
  });

  test("the old addresses go to Knowledge, keeping the query", async ({ page }) => {
    await mockApi(page, { bases: [fullBase()] });
    await page.goto("/brain/knowledge/base?id=kb_eng");
    await expect(page).toHaveURL(/\/knowledge\/base\/\?id=kb_eng$/);
    await expect(page.getByTestId("source-card").first()).toBeVisible();
    await page.goto("/brain/knowledge");
    await expect(page).toHaveURL(/\/knowledge\/$/);
  });

  test("at 390 wide nothing scrolls sideways: the list, a base and every step of the flow", async ({ page }) => {
    await mockApi(page, { bases: [fullBase()] });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/knowledge/");
    await expect(page.getByTestId("knowledge-card")).toBeVisible();
    await noSideways(page);
    await page.goto("/knowledge/base/?id=kb_eng");
    await expect(page.getByTestId("source-card").first()).toBeVisible();
    await noSideways(page);
    // On a phone the page's buttons stay in view under the title (never in a menu).
    await page.goto("/knowledge/");
    await expect(page.getByTestId("knowledge-card")).toBeVisible();
    await expect(page.getByRole("button", { name: "Page actions" })).toHaveCount(0);
    await page.getByTestId("page-actions").getByTestId("new-knowledge").click();
    await expect(page.getByTestId("choose-step")).toBeVisible();
    await noSideways(page);
    await page.getByTestId("tile-notion").click();
    await expect(page.getByTestId("picker-tree")).toBeVisible();
    await noSideways(page);
  });
});
