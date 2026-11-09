import { expect, test, type Page, type Route } from "@playwright/test";

// Bringing in a knowledge base the team already has: a search tool through
// MCP connected in place, an S3 bucket imported (with the one-click role
// update when the bucket isn't named yet), a Bedrock knowledge base's data
// sources imported, an archive upload (warned first, and a newer export to
// the same source), and who can read a base (only some people or roles) with
// the note on who reaches it through agents. Every API call is answered here.

const LIMITS = {
  max_file_bytes: 25 * 1024 * 1024,
  max_files: 500,
  extensions: ["pdf", "md"],
  agents: [{ key: "coder", label: "Coder" }],
  read_roles: ["viewer", "member", "admin"],
  max_items_per_import: 2000,
  max_archive_bytes: 200 * 1024 * 1024,
};

const KB_ARN = "arn:aws:bedrock:us-east-1:111122223333:knowledge-base/ABCDE12345";

type Answer = { status: number; body: Record<string, unknown> };

interface Mock {
  bases: Record<string, unknown>[];
  sources: Record<string, unknown>[];
  /** What each POST /api/knowledge with `connect` answers, in turn. */
  connectAnswers: Answer[];
  /** What each POST .../sources answers, in turn (then it works). */
  sourceAnswers: Answer[];
  bodies: Record<string, unknown>[];
  calls: string[];
  uploads: number;
}

const base = (over: Record<string, unknown> = {}) => ({
  id: "kb_1",
  name: "Handbook",
  description: "",
  read_role: "member",
  attach_team: true,
  agents: [],
  authoritative: false,
  created_at: "2026-11-08T10:00:00Z",
  updated_at: "2026-11-08T10:00:00Z",
  files: 0,
  ready: 0,
  processing: 0,
  failed: 0,
  uploads: 0,
  synced: 0,
  kinds: [],
  sources: [],
  backend: { kind: "local" },
  readers: [],
  agent_access_note: "",
  ...over,
});

const source = (over: Record<string, unknown> = {}) => ({
  id: "src_1",
  kind: "s3",
  label: "Amazon S3",
  name: "team-docs",
  selection: [],
  options: { account: "111122223333", bucket: "team-docs", region: "us-east-1" },
  paused: false,
  status: "ready",
  error: null,
  progress: null,
  items: 12,
  failed_items: 0,
  truncated: false,
  last_sync_at: "2026-11-08T10:00:00Z",
  last_success_at: "2026-11-08T10:00:00Z",
  next_sync_at: "",
  live_updates: false,
  created_at: "2026-11-08T10:00:00Z",
  created_by: "admin@example.com",
  ...over,
});

const MCP_SERVERS = [
  {
    id: "glean",
    name: "Glean",
    url: "https://acme-be.glean.com/mcp/default",
    sharing: "personal",
    connected: true,
    search_tool: "search",
    fetch_tool: "fetch",
    tools: [
      { name: "search", description: "Search company knowledge" },
      { name: "fetch", description: "Read one document" },
      { name: "chat", description: "Ask" },
    ],
  },
  { id: "rovo", name: "Rovo", url: "https://mcp.atlassian.com/v1/sse", sharing: "shared", connected: true, search_tool: "search", fetch_tool: null, tools: [{ name: "search", description: "" }] },
];

async function mockApi(page: Page, init: Partial<Mock> = {}): Promise<Mock> {
  const db: Mock = { bases: [], sources: [], connectAnswers: [], sourceAnswers: [], bodies: [], calls: [], uploads: 0, ...init };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && url.pathname.startsWith("/upload/"), (route) => {
    db.uploads += 1;
    return route.fulfill({ status: 200, body: "" });
  });
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    db.calls.push(`${method} ${p}${url.search}`);
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    if (body) db.bodies.push({ call: `${method} ${p}`, ...body });
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/knowledge" && method === "GET") return json(route, { bases: db.bases, can_manage: true, limits: LIMITS });
    if (p === "/api/knowledge/connectors") return json(route, { connectors: [], visibility_note: "" });
    if (p === "/api/knowledge/search-tools") return json(route, { servers: MCP_SERVERS, connected: [] });
    if (p === "/api/knowledge/bedrock")
      return json(route, { install: false, install_account: "", region: "us-east-1", bases: null, list_error: null, accounts: [{ account: "111122223333", region: "us-east-1" }], connected: [] });
    if (p === "/api/knowledge/bedrock/import") {
      return json(route, {
        name: "Support answers",
        account: "111122223333",
        region: "us-east-1",
        data_sources: [
          { id: "DS1", name: "Help center", type: "S3", status: "AVAILABLE", bucket: "help-center", prefixes: ["articles/"], bucket_account: "111122223333", importable: true, use_instead: "", note: "" },
          {
            id: "DS2",
            name: "Engineering wiki",
            type: "CONFLUENCE",
            status: "AVAILABLE",
            bucket: "",
            prefixes: [],
            bucket_account: "",
            importable: false,
            use_instead: "confluence",
            note: "Bedrock reads this from Confluence. Coderhelm's Confluence connector reads the original pages instead.",
          },
        ],
      });
    }
    if (p === "/api/knowledge/connectors/s3/browse") {
      const parent = url.searchParams.get("parent");
      return json(route, {
        nodes: parent
          ? [{ id: "runbooks/queues/", title: "queues", kind: "prefix", has_children: false, selectable: true, url: "", updated_at: "", detail: "" }]
          : [
              { id: "runbooks/", title: "runbooks", kind: "prefix", has_children: true, selectable: true, url: "", updated_at: "", detail: "" },
              { id: "README.md", title: "README.md", kind: "file", has_children: false, selectable: true, url: "", updated_at: "", detail: "", bytes: 2048 },
            ],
      });
    }
    if (p === "/api/knowledge" && method === "POST") {
      if (body.connect) {
        const a = db.connectAnswers.shift() ?? { status: 200, body: {} };
        if (a.status !== 200) return json(route, a.body, a.status);
        const server = MCP_SERVERS.find((s) => s.id === body.connect.target)!;
        const b = base({
          id: "kb_mcp",
          name: body.name,
          backend: {
            kind: "remote",
            provider: "mcp",
            label: "Search tool (MCP)",
            target: server.id,
            server_name: server.name,
            access: server.sharing === "personal" ? "per_person" : "team",
            per_person: server.sharing === "personal",
            search_tool: body.connect.search_tool ?? "search",
            fetch_tool: body.connect.fetch_tool ?? null,
          },
        });
        db.bases.push(b);
        return json(route, { base: b, source: null, setup: null });
      }
      const b = base({ id: "kb_new", name: body.name, readers: body.readers ?? [] });
      db.bases.push(b);
      let src = null;
      if (body.source) {
        const a = db.sourceAnswers.shift();
        if (a && a.status !== 200) {
          db.bases.pop();
          return json(route, a.body, a.status);
        }
        src = source({ id: `src_${db.sources.length + 1}`, kind: body.source.kind, options: body.source.options, status: "syncing" });
        db.sources.push(src);
      }
      return json(route, { base: b, source: src, setup: null });
    }
    const one = p.match(/^\/api\/knowledge\/([^/]+)$/);
    if (one && method === "GET") {
      const b = db.bases.find((x) => x.id === one[1]);
      if (!b) return json(route, { error: "No such knowledge base." }, 404);
      return json(route, { base: b, files: [], sources: db.sources, can_manage: true, limits: LIMITS, visibility_note: "" });
    }
    if (one && method === "PUT") {
      const i = db.bases.findIndex((x) => x.id === one[1]);
      db.bases[i] = { ...db.bases[i], ...body, updated_at: "2026-11-08T11:00:00Z" };
      return json(route, { base: db.bases[i] });
    }
    const srcs = p.match(/^\/api\/knowledge\/([^/]+)\/sources$/);
    if (srcs && method === "POST") {
      const a = db.sourceAnswers.shift();
      if (a && a.status !== 200) return json(route, a.body, a.status);
      const s = source({ id: `src_${db.sources.length + 1}`, kind: body.kind, name: body.name ?? "import", options: body.options, status: "syncing" });
      db.sources.push(s);
      return json(route, { source: s, setup: null, visibility_note: "" });
    }
    const arch = p.match(/^\/api\/knowledge\/([^/]+)\/archives$/);
    if (arch && method === "POST") {
      const existing = body.replace ? db.sources.find((s) => s.id === body.replace) : null;
      const s = existing ?? source({ id: `src_${db.sources.length + 1}`, kind: "archive", label: "Archive upload", name: body.name.replace(/\.zip$/, ""), options: {} });
      s.options = { file_name: body.name, size: body.size };
      if (!existing) db.sources.push(s);
      return json(route, {
        source: s,
        upload: { url: "/upload/archive", method: "PUT", headers: { "content-type": "application/zip" } },
        note: "Every page in the archive becomes readable by everyone who can read this knowledge base.",
      });
    }
    const up = p.match(/^\/api\/knowledge\/([^/]+)\/archives\/([^/]+)\/uploaded$/);
    if (up && method === "POST") {
      const s = db.sources.find((x) => x.id === up[2])!;
      s.status = "syncing";
      s.progress = { phase: "fetching", done: 3, total: 40 };
      return json(route, { source: s });
    }
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

const zip = (name = "Notion export.zip") => ({ name, mimeType: "application/zip", buffer: Buffer.from("PK\u0003\u0004 fake archive") });

test.describe("bringing in an existing knowledge base", () => {
  test("a search tool through MCP: its test search fails with the fix, then it connects and says it is searched per person", async ({ page }) => {
    const db = await mockApi(page, {
      connectAnswers: [{ status: 400, body: { error: "You aren't signed in to Glean yet.", fix: "Sign in to Glean on Connected accounts, then connect again.", code: "not_signed_in" } }],
    });
    await page.goto("/knowledge/");
    await page.getByTestId("start-knowledge").click();
    await page.getByTestId("tile-mcp").click();
    await expect(page.getByTestId("flow-step")).toHaveAttribute("data-step", "mcp");
    await expect(page.getByTestId("flow-continue")).toBeDisabled();
    await page.getByTestId("mcp-option").filter({ hasText: "Glean" }).click();
    await expect(page.getByTestId("mcp-per-person")).toContainText("Each person's search uses their own sign-in");
    await page.getByTestId("flow-continue").click();
    await expect(page.getByTestId("connect-summary")).toContainText("Connected in place: searched live through Glean, nothing copied.");
    await expect(page.getByTestId("flow-name")).toHaveValue("Glean");
    await page.getByTestId("flow-finish").click();
    const problem = page.getByTestId("connect-problem");
    await expect(problem).toHaveAttribute("data-code", "not_signed_in");
    await expect(problem).toContainText("You aren't signed in to Glean yet.");
    await expect(problem).toContainText("Sign in to Glean on Connected accounts");
    const sent = db.bodies.find((b) => b.call === "POST /api/knowledge")!;
    expect(sent.connect).toEqual({ provider: "mcp", target: "glean", search_tool: "search", fetch_tool: "fetch" });

    await page.getByTestId("flow-finish").click();
    await expect(page).toHaveURL(/\/knowledge\/base\/\?id=kb_mcp/);
    const card = page.getByTestId("connected-in-place");
    await expect(card.getByTestId("connected-line")).toHaveText("Connected in place: searched live through Glean, nothing copied");
    await expect(card.getByTestId("per-person-note")).toContainText("runs nobody started skip it");
    await expect(page.getByTestId("add-source")).toHaveCount(0);
  });

  test("Amazon S3: a folder is picked, the role's missing grant comes back with the one-click update, then it imports", async ({ page }) => {
    const db = await mockApi(page, {
      sourceAnswers: [
        {
          status: 409,
          body: {
            error: "The CoderHelmLogReader role in 111122223333 can't read the bucket team-docs.",
            fix: "Name the bucket in the role's update stack (the link does it), then try again.",
            action: "reconnect",
            code: "access",
            grant: { url: "https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate?stackName=CoderHelmLogReaderUpdate-abcd1234-kb1c2d3e", stack_name: "CoderHelmLogReaderUpdate-abcd1234-kb1c2d3e", account: "111122223333" },
          },
        },
      ],
    });
    await page.goto("/knowledge/");
    await page.getByTestId("start-knowledge").click();
    await page.getByTestId("tile-s3").click();
    const step = page.getByTestId("s3-step");
    await expect(step).toContainText("CoderHelmLogReader role in that account");
    await step.getByTestId("s3-bucket").fill("team-docs");
    await step.getByTestId("s3-browse").click();
    await expect(step.getByTestId("s3-node")).toHaveCount(2);
    await step.getByRole("button", { name: "Open runbooks" }).click();
    await step.getByRole("checkbox", { name: "Bring in queues" }).check();
    expect(db.calls.some((c) => c.includes("/api/knowledge/connectors/s3/browse?") && c.includes("bucket=team-docs") && c.includes("parent=runbooks%2F"))).toBe(true);
    await page.getByTestId("flow-continue").click();
    await expect(page.getByTestId("import-summary")).toContainText("1 item from s3://team-docs");
    await page.getByTestId("flow-name").fill("Runbooks");
    await page.getByTestId("flow-finish").click();
    const problem = page.getByTestId("import-problem");
    await expect(problem).toContainText("can't read the bucket team-docs");
    await expect(problem.getByTestId("import-grant")).toHaveText("Update the role in one click");
    await expect(problem.getByTestId("import-grant")).toHaveAttribute("href", /stackName=CoderHelmLogReaderUpdate-abcd1234-kb1c2d3e/);
    const sent = db.bodies.find((b) => b.call === "POST /api/knowledge")!;
    expect(sent.source).toMatchObject({ kind: "s3", options: { account: "111122223333", bucket: "team-docs", region: "us-east-1" } });
    expect((sent.source as { selection: { id: string }[] }).selection.map((s) => s.id)).toEqual(["runbooks/queues/"]);

    await page.getByTestId("flow-finish").click();
    await expect(page.getByTestId("progress-step")).toBeVisible();
  });

  test("a Bedrock knowledge base's data sources: the S3 one is imported, Confluence points at Coderhelm's own connector", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/knowledge/");
    await page.getByTestId("start-knowledge").click();
    await page.getByTestId("tile-bedrock_import").click();
    const step = page.getByTestId("bedrock-import-step");
    await expect(step).toContainText("indexes them itself. Nothing in Bedrock changes.");
    await step.getByTestId("bedrock-import-arn").fill(KB_ARN);
    await step.getByTestId("bedrock-import-look").click();
    const rows = step.getByTestId("bedrock-data-source");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("s3://help-center/articles/");
    await expect(rows.nth(1)).toContainText("Coderhelm's Confluence connector reads the original pages instead.");
    await expect(rows.nth(1).getByTestId("bedrock-use-instead")).toHaveText("Use Confluence instead");
    await page.getByTestId("flow-continue").click();
    await expect(page.getByTestId("flow-name")).toHaveValue("Support answers");
    await page.getByTestId("flow-finish").click();
    await expect(page.getByTestId("progress-step")).toBeVisible();
    const sent = db.bodies.find((b) => b.call === "POST /api/knowledge")!;
    expect(sent.source).toMatchObject({
      kind: "s3",
      name: "Help center",
      options: { account: "111122223333", bucket: "help-center", region: "us-east-1" },
      selection: [{ id: "articles/", kind: "prefix" }],
    });
    expect(db.calls.some((c) => c.startsWith("GET /api/knowledge/bedrock/import?arn="))).toBe(true);
  });

  test("the Confluence data source opens Coderhelm's Confluence connector", async ({ page }) => {
    await mockApi(page);
    await page.goto("/knowledge/");
    await page.getByTestId("start-knowledge").click();
    await page.getByTestId("tile-bedrock_import").click();
    await page.getByTestId("bedrock-import-arn").fill(KB_ARN);
    await page.getByTestId("bedrock-import-look").click();
    await page.getByTestId("bedrock-use-instead").click();
    await expect(page.getByTestId("flow-step")).not.toHaveAttribute("data-step", "bedrock_import");
    await expect(page.getByRole("dialog")).toContainText("Confluence");
  });

  test("an archive: warned before upload, uploaded and imported, then a newer export goes to the same source", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/knowledge/");
    await page.getByTestId("start-knowledge").click();
    await page.getByTestId("tile-archive").click();
    const step = page.getByTestId("archive-step");
    await expect(step.getByTestId("archive-warning")).toHaveText(
      "Every page in the archive becomes readable by everyone who can read this knowledge base. A Confluence Full Export also includes pages that are restricted in Confluence.",
    );
    await step.getByTestId("archive-input").setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("x") });
    await expect(step.getByTestId("archive-bad")).toContainText("Choose a .zip file");
    await expect(page.getByTestId("flow-continue")).toBeDisabled();
    await step.getByTestId("archive-input").setInputFiles(zip());
    await page.getByTestId("flow-continue").click();
    await expect(page.getByTestId("visibility-note")).toContainText("A Confluence Full Export also includes pages");
    await expect(page.getByTestId("flow-name")).toHaveValue("Notion export");
    await page.getByTestId("flow-finish").click();
    await expect(page.getByTestId("progress-step")).toBeVisible();
    await expect.poll(() => db.calls.includes("POST /api/knowledge/kb_new/archives/src_1/uploaded")).toBe(true);
    expect(db.uploads).toBe(1);
    const started = db.bodies.find((b) => b.call === "POST /api/knowledge/kb_new/archives")!;
    expect(started).toMatchObject({ name: "Notion export.zip" });
    expect(started.replace).toBeUndefined();

    // The base page: the archive source offers a newer export, warned first.
    db.sources[0].status = "ready";
    db.sources[0].progress = null;
    db.sources[0].truncated = true;
    await page.goto("/knowledge/base/?id=kb_new");
    const card = page.getByTestId("source-card").filter({ hasText: "Archive upload" });
    await expect(card.getByTestId("archive-file")).toHaveText("Notion export.zip");
    await expect(card.getByTestId("source-truncated")).toContainText("more than 2,000 documents");
    await expect(card.getByTestId("source-truncated")).toContainText("Connect the knowledge base in place instead");
    await card.getByRole("button", { name: /More for/ }).click();
    await page.getByRole("menuitem", { name: "Upload a newer export" }).click();
    await expect(page.getByRole("alertdialog").or(page.getByRole("dialog"))).toContainText("A Confluence Full Export also includes pages");
    await page.getByRole("button", { name: "Choose the archive" }).click();
    await page.getByTestId("archive-replace-input").setInputFiles(zip("Notion export (1).zip"));
    await expect.poll(() => db.bodies.filter((b) => b.call === "POST /api/knowledge/kb_new/archives").length).toBe(2);
    const again = db.bodies.filter((b) => b.call === "POST /api/knowledge/kb_new/archives")[1];
    expect(again).toMatchObject({ name: "Notion export (1).zip", replace: "src_1" });
    await expect(page.getByText("Uploaded. Reading the newer export now.")).toBeVisible();
  });

  test("who can read it: only some people or roles, and the note on who reaches it through agents", async ({ page }) => {
    const db = await mockApi(page, {
      bases: [base({ agent_access_note: "Everyone who can start an agent run gets results from this base when the agent searches it." })],
    });
    await page.goto("/knowledge/base/?id=kb_1");
    await expect(page.getByTestId("agent-access-note")).toHaveText("Everyone who can start an agent run gets results from this base when the agent searches it.");
    await page.getByRole("button", { name: "Change" }).first().click();
    const form = page.getByTestId("base-form");
    await expect(form.getByTestId("agent-access-form-note")).toContainText("Everyone who can start an agent run");
    const editor = form.getByTestId("readers-editor");
    await editor.getByTestId("reader-input").fill("not an email!");
    await editor.getByTestId("reader-add").click();
    await expect(editor.getByTestId("reader-bad")).toContainText("Type an email address");
    await editor.getByTestId("reader-input").fill("Ada@Example.com");
    await editor.getByTestId("reader-input").press("Enter");
    await editor.getByTestId("reader-input").fill("support");
    await editor.getByTestId("reader-add").click();
    await expect(editor.getByTestId("reader")).toHaveText(["ada@example.com×", "Role: support×"]);
    await form.getByRole("button", { name: "Save" }).click();
    const put = db.bodies.find((b) => b.call === "PUT /api/knowledge/kb_1")!;
    expect(put.readers).toEqual(["user:ada@example.com", "role:support"]);
    await expect(page.getByTestId("readers-line")).toHaveText("Only ada@example.com, Role: support.");
  });

  test("a new knowledge base can be limited to some people from the start", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/knowledge/");
    await page.getByTestId("start-knowledge").click();
    await page.getByTestId("tile-archive").click();
    await page.getByTestId("archive-input").setInputFiles(zip());
    await page.getByTestId("flow-continue").click();
    await page.getByTestId("change-read").click();
    await page.getByTestId("reader-input").fill("ops-lead");
    await page.getByTestId("reader-add").click();
    await page.getByTestId("flow-finish").click();
    await expect(page.getByTestId("progress-step")).toBeVisible();
    const sent = db.bodies.find((b) => b.call === "POST /api/knowledge")!;
    expect(sent.readers).toEqual(["role:ops-lead"]);
  });

  test("adding to an existing base offers the imports but never the search tool (a whole base, connected in place)", async ({ page }) => {
    await mockApi(page, { bases: [base()] });
    await page.goto("/knowledge/base/?id=kb_1");
    await page.getByTestId("add-source").click();
    await expect(page.getByTestId("tile-s3")).toBeVisible();
    await expect(page.getByTestId("tile-archive")).toBeVisible();
    await expect(page.getByTestId("tile-bedrock_import")).toBeVisible();
    await expect(page.getByTestId("tile-mcp")).toHaveCount(0);
  });

  test("phone width: the import steps never scroll sideways", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await mockApi(page);
    const over = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto("/knowledge/");
    await page.getByTestId("start-knowledge").click();
    await page.getByTestId("tile-s3").click();
    await page.getByTestId("s3-bucket").fill("team-docs");
    await page.getByTestId("s3-browse").click();
    await expect(page.getByTestId("s3-node")).toHaveCount(2);
    expect(await over()).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByTestId("tile-mcp").click();
    await page.getByTestId("mcp-option").first().click();
    expect(await over()).toBeLessThanOrEqual(0);
  });
});
