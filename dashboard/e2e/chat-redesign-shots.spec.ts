import { test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Screenshots of Chat for the chat redesign review (made-up team and person).
// Mocks copied from chat.spec.ts.
//
// Chat: the question box, starter questions, @ mentions, a streamed answer
// that reads code (one quiet activity line, numbered citations with a source
// card, each source listed once), the chat list, sharing, rating, roles and
// the phone layout. Every API call is answered here, the answer stream
// included; nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "chat-redesign");
const LABEL = process.env.SHOTS_LABEL || "after";
const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();
const NONE = { knowledge: [], connections: false, code: false, memories: false, data_sources: false, skills: false };

const LEAVE = {
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
const COMMIT = "4a7c1e9d2b";
const code = (id: string, path: string, start: number, end: number, passage: string) => ({
  id,
  kind: "code",
  title: path,
  loc: `web · lines ${start}-${end}`,
  as_of: "",
  passage,
  url: `https://github.com/acme/web/blob/${COMMIT}/${path}#L${start}-L${end}`,
  authoritative: false,
  code: { repo: "acme/web", path, commit: COMMIT, start_line: start, end_line: end },
});
const CODE = code("S2", "src/policies/leave.ts", 1, 3, "export const PARENTAL_LEAVE_WEEKS = 16;\nexport const PAID = true;");
// Two reads of one file: one source in the answer.
const SERVER_A = code("S3", "src/server.ts", 1, 17, 'import express from "express";\nimport { routes } from "./routes";\n\nexport function createServer() {\n  const app = express();\n  app.use("/api", routes);\n  return app;\n}');
const SERVER_B = code("S4", "src/server.ts", 30, 44, "createServer().listen(process.env.PORT ?? 4000);");

const STARTERS = [
  { question: "What should I know from HR handbook?", why: "From HR handbook", sources: { ...NONE, knowledge: ["kb_hr"] } },
  { question: "What's the latest on “Add rate limiting to login”?", why: "From recent work in web", sources: { ...NONE, code: true, repo: "acme/web" } },
  { question: "How is web put together?", why: "From the web code", sources: { ...NONE, code: true, repo: "acme/web" } },
  { question: "What should a new teammate know about web?", why: "From past work in web", sources: { ...NONE, memories: true, repo: "acme/web" } },
];

interface Thread {
  id: string;
  title: string;
  shared: boolean;
  mine: boolean;
  owner_email: string;
  created_at: string;
  updated_at: string;
  messages: number;
}

interface Backend {
  role: string;
  capabilities?: string[];
  calls: string[];
  bodies: Record<string, unknown>[];
  asks: Record<string, unknown>[];
  threads: Thread[];
  answer: "cited" | "none";
  /** Milliseconds the answer stream waits before it answers. */
  streamDelay: number;
  starters: typeof STARTERS;
  knowledge: { id: string; name: string; ready: number; authoritative: boolean }[];
  repos: { name: string; short: string; role: string }[];
  uploads: number;
  /** The saved answer's text. */
  answerText: string;
}

const ev = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;

const thread = (over: Partial<Thread>): Thread => ({
  id: "th_x",
  title: "A chat",
  shared: false,
  mine: true,
  owner_email: "admin@acme.dev",
  created_at: iso(10),
  updated_at: iso(10),
  messages: 2,
  ...over,
});

const ANSWER_TEXT = "Parental leave is **sixteen weeks**, fully paid [S1]. The app reads the same number from code [S2]. The server loads it when it starts [S3][S4].";
const CITED = [LEAVE, CODE, SERVER_A, SERVER_B];
// A longer answer, the shape real ones take, for the screenshots.
const SHOT_TEXT = [
  "`web` is a Next.js site with a small Express server in front of it. Pages live in `app/`; everything that needs data goes through `/api` [S3].",
  "",
  "**How it fits together**",
  "- **Server start:** `src/server.ts` builds the Express app and mounts every route under `/api` [S3][S4].",
  "- **Rules:** policy numbers sit in `src/policies/leave.ts`, which sets `PARENTAL_LEAVE_WEEKS` to 16 [S2].",
  "- **Docs:** the HR handbook says the same: sixteen weeks, fully paid [S1].",
  "",
  '```ts title="src/server.ts"',
  "export function createServer() {",
  "  const app = express();",
  '  app.use("/api", routes);',
  "  return app;",
  "}",
  "```",
  "",
  "To change a policy, update the file and the handbook together [S1, S2].",
].join("\n");

/** The answer stream up to its last words: knowledge, then two code reads. */
const STREAM = (id: string, question: string, text = "Parental leave is **sixteen weeks**, fully paid [S1]. The app reads the same number from code [S2].") =>
  ev("thread", { id, title: question }) +
  ev("retrieved", { sources: [LEAVE] }) +
  ev("tool_start", { id: "tu1", name: "search_knowledge", kind: "knowledge" }) +
  ev("tool_result", { id: "tu1", name: "search_knowledge", label: "Searched knowledge for “parental leave”", kind: "knowledge", status: "success", summary: "1 passage", sources: [] }) +
  ev("tool_start", { id: "tu2", name: "github__read_file", kind: "code" }) +
  ev("tool_result", { id: "tu2", name: "github__read_file", repo: "web", label: "Read src/policies/leave.ts in web", kind: "code", status: "success", summary: "Lines 1-3 of 3", sources: [CODE] }) +
  ev("text_reset", {}) +
  ev("tool_start", { id: "tu3", name: "github__read_file", kind: "code" }) +
  ev("tool_result", { id: "tu3", name: "github__read_file", repo: "web", label: "Read src/server.ts in web", kind: "code", status: "success", summary: "Lines 1-17 of 44", sources: [SERVER_A, SERVER_B] }) +
  ev("text_reset", {}) +
  ev("text_delta", { text });

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = {
    role: "admin",
    calls: [],
    bodies: [],
    asks: [],
    threads: [
      thread({ id: "th_old", title: "Which services call the billing API?", updated_at: iso(60 * 24 * 3) }),
      thread({ id: "th_shared", title: "What is the deploy freeze?", shared: true, mine: false, owner_email: "dana@acme.dev", updated_at: iso(500) }),
    ],
    answer: "cited",
    streamDelay: 0,
    starters: STARTERS,
    knowledge: [
      { id: "kb_hr", name: "HR handbook", ready: 1, authoritative: true },
      { id: "kb_eng", name: "Engineering runbooks", ready: 3, authoritative: false },
    ],
    repos: [
      { name: "acme/api", short: "api", role: "backend" },
      { name: "acme/web", short: "web", role: "web" },
    ],
    uploads: 0,
    answerText: ANSWER_TEXT,
    ...init,
  };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const holds = (cap: string) =>
    db.capabilities ? db.capabilities.includes(cap) : cap === "brain_ask" ? db.role !== "viewer" : cap === "knowledge_manage" ? db.role === "admin" || db.role === "owner" : true;
  const exchange = (question: string) => [
    { seq: 0, role: "user", content: question, citations: [], grounded: true, sources: { ...NONE, knowledge: ["kb_hr"] }, mentions: db.asks[db.asks.length - 1]?.mentions ?? [], attachments: [], used: [], at: iso(1) },
    db.answer === "none"
      ? { seq: 1, role: "assistant", content: "I couldn't find anything in the selected sources that answers this, so I won't guess.", citations: [], grounded: false, attachments: [], used: [], at: iso(1) }
      : {
          seq: 1,
          role: "assistant",
          content: db.answerText,
          citations: CITED,
          grounded: true,
          attachments: [],
          used: [
            { kind: "knowledge", name: "search_knowledge", label: "Searched knowledge for “parental leave”", summary: "1 passage" },
            { kind: "code", name: "github__read_file", repo: "web", label: "Read src/policies/leave.ts in web", summary: "Lines 1-3 of 3" },
            { kind: "code", name: "github__read_file", repo: "web", label: "Read src/server.ts in web", summary: "Lines 1-17 of 44" },
          ],
          at: iso(1),
        },
  ];
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && url.pathname.startsWith("/__upload/"), async (route) => {
    db.uploads += 1;
    return route.fulfill({ status: 200, body: "" });
  });
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    db.calls.push(`${method} ${p}`);
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    if (body) db.bodies.push({ call: `${method} ${p}`, ...body });
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@acme.dev", avatar_url: "", role: db.role, ...(db.capabilities ? { capabilities: db.capabilities } : {}) });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/brain/token") return holds("brain_ask") ? json(route, { token: "t" }) : json(route, { error: "Your role can't ask questions." }, 403);
    if (p === "/api/brain/starters") return json(route, { starters: db.starters });
    if (p === "/api/brain/sources") {
      return json(route, {
        knowledge: db.knowledge,
        connections: [{ id: "notion" }],
        repos: db.repos.map((r) => r.name),
        repositories: db.repos,
        can_ask: holds("brain_ask"),
      });
    }
    if (p === "/api/brain/threads" && method === "GET") {
      const visible = db.threads.filter((t) => t.mine ? db.role !== "viewer" : true);
      return json(route, { threads: visible, can_ask: holds("brain_ask") });
    }
    const fb = p.match(/^\/api\/brain\/threads\/([^/]+)\/messages\/(\d+)\/feedback$/);
    if (fb && method === "PUT") return json(route, { ok: true, feedback: body.rating });
    const one = p.match(/^\/api\/brain\/threads\/([^/]+)$/);
    if (one) {
      const t = db.threads.find((x) => x.id === one[1]);
      if (method === "PUT") {
        if (!t) return json(route, { error: "No such thread." }, 404);
        Object.assign(t, body.title !== undefined ? { title: body.title } : {}, body.shared !== undefined ? { shared: body.shared } : {});
        return json(route, { thread: t });
      }
      if (method === "DELETE") {
        db.threads = db.threads.filter((x) => x.id !== one[1]);
        return json(route, { ok: true });
      }
      if (one[1] === "th_shared") {
        return json(route, {
          thread: db.threads.find((x) => x.id === "th_shared"),
          messages: [
            { seq: 0, role: "user", content: "What is the deploy freeze?", citations: [], grounded: true, attachments: [], used: [], at: iso(500) },
            { seq: 1, role: "assistant", content: "Deploys stop Friday at noon [S1].", citations: [{ ...LEAVE, title: "Release rules.md", passage: "No deploys after Friday noon." }], grounded: true, attachments: [], used: [], at: iso(500) },
          ],
          can_ask: false,
        });
      }
      const last = db.asks[db.asks.length - 1];
      return json(route, {
        thread: t ?? thread({ id: one[1] }),
        messages: exchange(last ? String(last.question) : t?.title ?? "A chat"),
        can_ask: holds("brain_ask"),
      });
    }
    if (p === "/api/brain/attachments" && method === "POST") {
      return json(route, { id: "att_1", name: body.name, upload: { url: `${url.origin}/__upload/att_1`, method: "PUT", headers: { "content-type": "text/plain" } } });
    }
    if (p === "/api/brain/stream" && method === "POST") {
      db.asks.push(body);
      if (db.streamDelay) await new Promise((r) => setTimeout(r, db.streamDelay));
      const id = body.thread_id || "th_new";
      if (!db.threads.some((t) => t.id === id)) db.threads.unshift(thread({ id, title: body.question, updated_at: iso(0) }));
      const stream = (s: string) => route.fulfill({ status: 200, contentType: "text/event-stream", body: s }).catch(() => {});
      if (db.answer === "none") {
        return stream(
          ev("thread", { id, title: body.question }) +
            ev("answer", { text: "I couldn't find anything in the selected sources that answers this, so I won't guess.", citations: [], grounded: false }) +
            ev("done", {}),
        );
      }
      return stream(STREAM(id, String(body.question)) + ev("answer", { text: ANSWER_TEXT, citations: CITED, grounded: true }) + ev("done", {}));
    }
    if (p === "/api/knowledge/kb_hr") {
      return json(route, {
        base: { id: "kb_hr", name: "HR handbook", description: "", read_role: "member", attach_team: false, agents: [], authoritative: true, created_at: iso(900), updated_at: iso(60), files: 1, ready: 1, processing: 0, failed: 0 },
        files: [{ id: "f1", name: "Leave policy.pdf", kind: "pdf", size: 1000, status: "ready", error: "", version: 1, searchable: true, as_of: "2026-05-01", uploaded_at: iso(30), uploaded_by: "admin@acme.dev", chunks: 4, truncated: false }],
        can_manage: holds("knowledge_manage"),
        limits: { max_file_bytes: 25 << 20, max_files: 500, extensions: ["pdf"], agents: [], read_roles: ["viewer", "member", "admin"] },
      });
    }
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

async function shot(page: Page, name: string, widths = [1440, 390]) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 640 ? 844 : 900 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${LABEL}-${name}-${width}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

const box = (page: Page) => page.getByRole("textbox", { name: "Message" });

async function askIt(page: Page, q = "How long is parental leave?") {
  await box(page).fill(q);
  await box(page).press("Enter");
}


const history = () => [
  { id: "th_1", title: "What's the latest on the checkout rewrite?", updated_at: iso(20) },
  { id: "th_2", title: "How is the web app put together?", updated_at: iso(60 * 26) },
  { id: "th_3", title: "Why did the nightly import fail on Tuesday?", updated_at: iso(60 * 24 * 4) },
  { id: "th_4", title: "Which services call the billing API?", updated_at: iso(60 * 24 * 12) },
  { id: "th_5", title: "Onboarding notes for the mobile app", updated_at: iso(60 * 24 * 20), mine: false, shared: true, owner_email: "sam@acme.dev" },
].map((t) => thread(t as Partial<Thread>));

test("chat redesign screenshots", async ({ page }) => {
  test.setTimeout(240_000);
  // The empty page, with history.
  await mockApi(page, { threads: history() });
  await page.goto("/chat");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await shot(page, "empty");

  // Mid-answer: the answer is still being worked on.
  const db = await mockApi(page, { threads: history(), streamDelay: 60_000 });
  void db;
  await page.goto("/chat");
  await page.waitForLoadState("networkidle");
  await askIt(page, "What's the latest on the checkout rewrite?");
  await page.waitForTimeout(3500);
  await shot(page, "progress");

  // A finished answer with citations and sources.
  await mockApi(page, { threads: history() });
  await page.goto("/chat");
  await page.waitForLoadState("networkidle");
  await askIt(page, "How long is parental leave, and where is it set in the code?");
  await page.getByTestId("answer-actions").waitFor();
  await page.waitForTimeout(400);
  await shot(page, "answer");
  await page.getByTestId("activity-toggle").first().click().catch(() => {});
  await page.waitForTimeout(200);
  await shot(page, "answer-steps", [1440]);
});
