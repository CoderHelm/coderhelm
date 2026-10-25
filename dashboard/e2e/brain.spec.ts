import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Knowledge bases (Chat itself is chat.spec.ts). Every API call is answered
// here; nothing reaches a real backend.

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

const KINDS = [
  { key: "knowledge", label: "Knowledge bases", about: "Documents your team uploaded" },
  { key: "connections", label: "Connections", about: "Connected tools, read live" },
  { key: "code", label: "Repositories", about: "Code search, files and the code graph" },
  { key: "memories", label: "Memories", about: "What Coderhelm learned from past work" },
  { key: "data_sources", label: "Data sources", about: "Logs, databases, metrics and docs" },
  { key: "skills", label: "Team skills", about: "Your written skills and team agents" },
];

const LEAVE_CITATION = {
  id: "S1",
  kind: "knowledge",
  title: "Leave policy.pdf",
  loc: "Page 4",
  as_of: "2026-05-01",
  passage: "Parental leave is sixteen weeks, fully paid, for every employee.",
  href: "/brain/knowledge/base?id=kb_hr",
  authoritative: true,
  base: "HR handbook",
};

interface KFile {
  id: string;
  name: string;
  status: "uploading" | "processing" | "ready" | "failed";
  error: string;
  version: number;
  chunks: number;
}

interface Backend {
  role: string;
  /** What `/api/me` says the person holds (a custom role); unset: from the role. */
  capabilities?: string[];
  calls: string[];
  asks: Record<string, unknown>[];
  files: KFile[];
  /** Polls of the base before a processing file turns ready. */
  readyAfter: number;
  polls: number;
  answer: "cited" | "none";
  uploads: number;
}

const ev = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = {
    role: "admin",
    calls: [],
    asks: [],
    files: [
      { id: "f_ready", name: "Leave policy.pdf", status: "ready", error: "", version: 1, chunks: 42 },
      { id: "f_failed", name: "Scanned contract.pdf", status: "failed", error: "No text found in this PDF. A scanned PDF needs text recognition, which isn't supported yet.", version: 1, chunks: 0 },
    ],
    readyAfter: 1,
    polls: 0,
    answer: "cited",
    uploads: 0,
    ...init,
  };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const base = () => ({
    id: "kb_hr",
    name: "HR handbook",
    description: "Policies and benefits",
    read_role: "member",
    attach_team: false,
    agents: ["planner"],
    authoritative: true,
    created_at: iso(900),
    updated_at: iso(60),
    files: db.files.length,
    ready: db.files.filter((f) => f.status === "ready").length,
    processing: db.files.filter((f) => f.status === "processing" || f.status === "uploading").length,
    failed: db.files.filter((f) => f.status === "failed").length,
  });
  const fileJson = (f: KFile) => ({
    ...f,
    kind: "pdf",
    size: 120_000,
    searchable: f.status === "ready",
    as_of: "2026-05-01",
    uploaded_at: iso(30),
    uploaded_by: "admin@example.com",
    truncated: false,
  });
  const canManage = () => (db.capabilities ? db.capabilities.includes("knowledge_manage") : db.role === "admin" || db.role === "owner");
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  // The signed upload URL points at this origin, so the browser's PUT lands here.
  await page.route((url) => url.hostname === "localhost" && url.pathname.startsWith("/__upload/"), async (route) => {
    db.uploads += 1;
    db.calls.push(`PUT ${new URL(route.request().url()).pathname}`);
    return route.fulfill({ status: 200, body: "" });
  });
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    db.calls.push(`${method} ${p}`);
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: db.role, ...(db.capabilities ? { capabilities: db.capabilities } : {}) });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    const holds = (cap: string) => (db.capabilities ? db.capabilities.includes(cap) : cap === "brain_ask" ? db.role !== "viewer" : canManage());
    if (p === "/api/brain/token") return holds("brain_ask") ? json(route, { token: "t" }) : json(route, { error: "Your role can't ask the brain." }, 403);
    if (p === "/api/brain/threads" && method === "GET") {
      return json(route, {
        threads: [{ id: "th_shared", title: "What is the deploy freeze?", shared: true, mine: false, owner_email: "dana@example.com", created_at: iso(500), updated_at: iso(500), messages: 2 }],
        can_ask: db.role !== "viewer",
      });
    }
    if (p === "/api/brain/threads/th_shared") {
      return json(route, {
        thread: { id: "th_shared", title: "What is the deploy freeze?", shared: true, mine: false, owner_email: "dana@example.com", created_at: iso(500), updated_at: iso(500), messages: 2 },
        messages: [
          { seq: 0, role: "user", content: "What is the deploy freeze?", citations: [], grounded: true, attachments: [], used: [], at: iso(500) },
          { seq: 1, role: "assistant", content: "Deploys stop Friday at noon [S1].", citations: [{ ...LEAVE_CITATION, title: "Release rules.md", passage: "No deploys after Friday noon." }], grounded: true, attachments: [], used: [], at: iso(500) },
        ],
        can_ask: false,
      });
    }
    if (p.startsWith("/api/brain/threads/")) {
      return json(route, {
        thread: { id: "th_new", title: "How long is parental leave?", shared: false, mine: true, owner_email: "admin@example.com", created_at: iso(1), updated_at: iso(1), messages: 2 },
        // What the server kept of the last exchange.
        messages: db.asks.length
          ? [
              { seq: 0, role: "user", content: db.asks[db.asks.length - 1].question, citations: [], grounded: true, attachments: [], used: [], at: iso(1) },
              db.answer === "none"
                ? { seq: 1, role: "assistant", content: "I couldn't find anything in the selected sources that answers this, so I won't guess.", citations: [], grounded: false, attachments: [], used: [], at: iso(1) }
                : { seq: 1, role: "assistant", content: "Parental leave is sixteen weeks, fully paid [S1].", citations: [LEAVE_CITATION], grounded: true, attachments: [], used: [{ kind: "knowledge", label: 'Searched knowledge for "parental leave"' }], at: iso(1) },
            ]
          : [],
        can_ask: true,
      });
    }
    if (p === "/api/brain/sources") {
      return json(route, {
        kinds: KINDS,
        knowledge: [
          { id: "kb_hr", name: "HR handbook", ready: 1, authoritative: true },
          { id: "kb_eng", name: "Engineering runbooks", ready: 3, authoritative: false },
        ],
        connections: [{ id: "notion" }],
        repos: ["your-team/web"],
        can_ask: db.role !== "viewer",
      });
    }
    if (p === "/api/brain/attachments" && method === "POST") {
      return json(route, { id: "att_1", name: body.name, upload: { url: `${url.origin}/__upload/att_1`, method: "PUT", headers: { "content-type": "text/plain" } } });
    }
    if (p === "/api/brain/stream" && method === "POST") {
      db.asks.push(body);
      const stream = (s: string) => route.fulfill({ status: 200, contentType: "text/event-stream", body: s });
      if (db.answer === "none") {
        return stream(
          ev("thread", { id: "th_new", title: body.question }) +
            ev("retrieved", { sources: [] }) +
            ev("answer", { text: "I couldn't find anything in the selected sources that answers this, so I won't guess.", citations: [], grounded: false }) +
            ev("done", {}),
        );
      }
      return stream(
        ev("thread", { id: "th_new", title: body.question }) +
          ev("retrieved", { sources: [LEAVE_CITATION] }) +
          ev("tool_start", { id: "tu1", name: "search_knowledge", kind: "knowledge" }) +
          ev("tool_result", { id: "tu1", name: "search_knowledge", label: 'Searched knowledge for "parental leave"', status: "success", summary: "1 passages" }) +
          ev("text_reset", {}) +
          ev("text_delta", { text: "Parental leave is sixteen weeks [S1]." }) +
          ev("answer", { text: "Parental leave is sixteen weeks, fully paid [S1].", citations: [LEAVE_CITATION], grounded: true }) +
          ev("done", {}),
      );
    }
    if (p === "/api/knowledge" && method === "GET") return json(route, { bases: [base()], can_manage: canManage(), limits: LIMITS });
    if (p === "/api/knowledge" && method === "POST") {
      if (!canManage()) return json(route, { error: "Only admins manage knowledge bases." }, 403);
      return json(route, { base: { ...base(), id: "kb_new", name: body.name } });
    }
    if (p === "/api/knowledge/kb_hr" && method === "GET") {
      db.polls += 1;
      for (const f of db.files) if (f.status === "processing" && db.polls > db.readyAfter + 1) Object.assign(f, { status: "ready", chunks: 12 });
      return json(route, { base: base(), files: db.files.map(fileJson), can_manage: canManage(), limits: LIMITS });
    }
    if (p === "/api/knowledge/kb_hr/files" && method === "POST") {
      const f: KFile = { id: `f_new_${db.files.length}`, name: body.name, status: "uploading", error: "", version: 1, chunks: 0 };
      db.files.unshift(f);
      return json(route, { file: fileJson(f), upload: { url: `${url.origin}/__upload/${f.id}`, method: "PUT", headers: { "content-type": "application/pdf" } } });
    }
    const uploaded = p.match(/^\/api\/knowledge\/kb_hr\/files\/([^/]+)\/uploaded$/);
    if (uploaded) {
      const f = db.files.find((x) => x.id === uploaded[1])!;
      f.status = "processing";
      db.polls = 0;
      return json(route, { file: fileJson(f) });
    }
    const del = p.match(/^\/api\/knowledge\/kb_hr\/files\/([^/]+)$/);
    if (del && method === "DELETE") {
      db.files = db.files.filter((x) => x.id !== del[1]);
      return json(route, { ok: true });
    }
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

test.describe("knowledge bases", () => {
  test("upload states: a new file goes uploading → processing → ready, a failed file shows its reason", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/brain/knowledge/base?id=kb_hr");
    const rows = page.getByTestId("file-row");
    await expect(rows).toHaveCount(2);
    const failed = page.locator('[data-testid="file-row"][data-status="failed"]');
    await expect(failed).toContainText("Failed");
    await expect(failed).toContainText("scanned PDF needs text recognition");

    // A file of an unsupported kind is refused before upload.
    await page.getByTestId("upload-input").setInputFiles({ name: "tool.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") });
    await expect(page.getByTestId("upload-problems")).toContainText("isn't supported");
    expect(db.uploads).toBe(0);

    await page.getByTestId("upload-input").setInputFiles({ name: "Benefits 2026.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 hello") });
    const row = rows.filter({ hasText: "Benefits 2026.pdf" });
    await expect(row).toHaveAttribute("data-status", "processing");
    await expect(row).toContainText("Processing");
    expect(db.uploads).toBe(1);
    expect(db.calls).toContain("POST /api/knowledge/kb_hr/files/f_new_2/uploaded");
    // The page checks again while something is processing; it turns ready.
    await expect(row).toHaveAttribute("data-status", "ready", { timeout: 15_000 });
    await expect(row).toContainText("12 passages");
  });

  test("roles: admins manage, members only read", async ({ page }) => {
    await mockApi(page, { role: "member" });
    await page.goto("/brain/knowledge");
    await expect(page.getByTestId("knowledge-row")).toContainText("HR handbook");
    await expect(page.getByRole("button", { name: "New knowledge base" })).toHaveCount(0);
    await page.goto("/brain/knowledge/base?id=kb_hr");
    await expect(page.getByTestId("file-row").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload files" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
    await expect(page.getByTestId("base-form")).toHaveCount(0);
  });

  test("an admin deletes a file", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/brain/knowledge/base?id=kb_hr");
    await page.locator('[data-testid="file-row"][data-status="failed"]').getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).last().click();
    await expect(page.getByTestId("file-row")).toHaveCount(1);
    expect(db.calls).toContain("DELETE /api/knowledge/kb_hr/files/f_failed");
  });
});
