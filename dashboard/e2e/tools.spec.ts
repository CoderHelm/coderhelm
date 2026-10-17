import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Every API call is answered here. Nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

interface Def {
  name: string; use_when: string; source: string; kind: string; read: string;
  inputs: Record<string, Record<string, unknown>>; ask_me_first?: boolean; max_rows?: number;
}
interface Version { hash: string; def: Def; author: string; origin: string; created_at: string; example: string; example_ok: boolean }
interface ToolRec { name: string; enabled: boolean; approved: string; approved_by: string; approved_at: string; latest: string; created_by: string; created_at: string }
interface Backend {
  tools: ToolRec[];
  versions: Record<string, Version[]>;
  asks: Record<string, unknown>[];
  calls: { method: string; path: string; body: Record<string, unknown> | null }[];
  selfApprovalRefused: boolean;
}

const NOW = new Date().toISOString();
const SOURCE = {
  id: "src_db", kind: "database", name: "Orders database", url: "", status: "ready", enabled: true, setup_complete: true, key_hint: "",
  has_mutations: false, kinds: 42, schema_available: true, hidden_fields: ["email"], repos: [], last_checked_at: NOW, created_at: NOW,
  created_by: "admin@example.com",
  aws: { account: "123456789012", region: "us-east-1", role_arn: "arn:aws:iam::123456789012:role/CoderhelmReadOnly", log_groups: [], cluster: "orders-db", database: "orders", engine: "postgres", databases: [] },
};
const ORDER_DEF: Def = {
  name: "find_order_by_number", use_when: "A ticket mentions an order number and you need its status.", source: "Orders database", kind: "sql",
  read: "SELECT o.id, o.status FROM orders o WHERE o.number = :order_number",
  inputs: { order_number: { type: "string", pattern: "[A-Z]{2}-[0-9]{4,10}", example: "OR-102938" } }, max_rows: 20,
};
const EXAMPLE_OK = JSON.stringify({ ok: true, sent: "SELECT * FROM (SELECT o.id, o.status FROM orders AS o WHERE o.number = :order_number) AS coderhelm_lookup LIMIT 20", result: '[\n  { "id": 7, "status": "shipped" }\n]', hidden_count: 0, ms: 140, note: "1 row" });

function hashOf(def: Def) {
  let h = 0;
  for (const c of JSON.stringify(def)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(8, "0") + "deadbeef";
}

function toolJson(db: Backend, t: ToolRec) {
  const vs = db.versions[t.name] ?? [];
  return {
    ...t,
    awaiting_approval: t.latest !== t.approved,
    latest_version: vs.find((v) => v.hash === t.latest) ?? null,
    approved_version: t.approved && t.approved !== t.latest ? vs.find((v) => v.hash === t.approved) ?? null : null,
  };
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { tools: [], versions: {}, asks: [], calls: [], selfApprovalRefused: false, ...init };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    const body = req.postData() ? (JSON.parse(req.postData() as string) as Record<string, unknown>) : null;
    db.calls.push({ method, path: p, body });
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/data-sources") return json(route, { sources: [SOURCE] });
    if (p === "/api/data-sources/activity") {
      return json(route, { events: [{ at: NOW, source_id: "src_db", source_name: "Orders database", actor: "planner", repo: "your-team/web", pr: 41, summary: 'find_order_by_number({"order_number":"OR-555555"})', query: 'find_order_by_number({"order_number":"OR-555555"})', detail: "1 row", ok: true, outcome: "ok", ms: 120 }] });
    }
    if (p === "/api/tools" && method === "GET") return json(route, { tools: db.tools.map((t) => toolJson(db, t)), pending_asks: db.asks.filter((a) => a.status === "pending").length });
    if (p === "/api/tools/validate") {
      const def = body?.def as Def | undefined;
      const text = (body?.definition as string | undefined) ?? def?.read ?? "";
      if (/DELETE|UPDATE/i.test(text)) return json(route, { ok: false, problems: ["That lookup would change something or is not a query."] });
      if (def && Object.keys(def.inputs).some((k) => !def.inputs[k].pattern && !def.inputs[k].allowed && def.inputs[k].type === "string")) {
        return json(route, { ok: false, problems: [`The input ${Object.keys(def.inputs)[0]} needs a pattern or a list of allowed values.`] });
      }
      return json(route, { ok: true, sent: `SELECT * FROM (${text.trim()}) AS coderhelm_lookup LIMIT 50`, hash: "abc", function: `tool_${def?.name ?? "from_yaml"}` });
    }
    if (p === "/api/tools" && method === "POST") {
      const def = (body?.def as Def) ?? { ...ORDER_DEF, name: "from_yaml" };
      const hash = hashOf(def);
      const v: Version = { hash, def, author: "admin@example.com", origin: "dashboard", created_at: NOW, example: EXAMPLE_OK, example_ok: true };
      db.versions[def.name] = [v, ...(db.versions[def.name] ?? [])];
      let t = db.tools.find((x) => x.name === def.name);
      if (!t) {
        t = { name: def.name, enabled: false, approved: "", approved_by: "", approved_at: "", latest: hash, created_by: "admin@example.com", created_at: NOW };
        db.tools.push(t);
      } else t.latest = hash;
      return json(route, { tool: toolJson(db, t), version: v, example: JSON.parse(EXAMPLE_OK) });
    }
    if (p === "/api/tools/asks" && method === "GET") return json(route, { asks: db.asks });
    const askM = p.match(/^\/api\/tools\/asks\/([^/]+)$/);
    if (askM) {
      const a = db.asks.find((x) => x.id === askM[1]);
      if (a) a.status = body?.approve ? "approved" : "denied";
      return json(route, { ok: true });
    }
    const m = p.match(/^\/api\/tools\/([^/]+)(?:\/(approve|preview))?$/);
    if (m) {
      const name = decodeURIComponent(m[1]);
      const t = db.tools.find((x) => x.name === name);
      if (!t) return json(route, { error: "That tool doesn't exist." }, 404);
      if (m[2] === "approve") {
        if (db.selfApprovalRefused) return json(route, { error: "Another admin has to approve this version: the person who wrote it can't." }, 403);
        t.approved = String(body?.hash);
        t.approved_by = "admin@example.com";
        return json(route, { tool: toolJson(db, t) });
      }
      if (m[2] === "preview") {
        const v = (body?.inputs as Record<string, unknown>)?.order_number;
        if (typeof v !== "string" || !/^[A-Z]{2}-[0-9]{4,10}$/.test(v)) return json(route, { ok: false, refused: true, step: "read_only", message: "order_number doesn't match what this tool accepts.", fix: "Nothing was sent." });
        return json(route, { ok: true, sent: "SELECT … LIMIT 20", result: `[\n  { "id": 9, "status": "open", "number": "${v}" }\n]`, hidden_count: 0, ms: 95, note: "1 row" });
      }
      if (method === "PUT") {
        t.enabled = !!body?.enabled;
        return json(route, { tool: toolJson(db, t) });
      }
      if (method === "DELETE") {
        db.tools = db.tools.filter((x) => x.name !== name);
        return json(route, { ok: true });
      }
      return json(route, { tool: toolJson(db, t), versions: db.versions[name] ?? [] });
    }
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

test("the hub offers your own tools, and an empty list says how to start", async ({ page }) => {
  await mockApi(page);
  await page.goto("/data-sources");
  await page.getByRole("link", { name: /Your own tools/ }).click();
  await expect(page.getByRole("heading", { name: "Your own tools" })).toBeVisible();
  await expect(page.getByText("No tools yet.")).toBeVisible();
  await expect(page.getByText("Nothing waiting.")).toBeVisible();
  await shot(page, "tools-empty");
});

test("write a tool: the live check shows what will be sent, saving runs the example", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/data-sources/tools/new");
  await page.getByLabel("Name", { exact: true }).fill("find_order_by_number");
  await page.getByLabel("When to use it").fill("A ticket mentions an order number and you need its status.");
  await page.getByLabel("Source").selectOption("Orders database");
  await page.getByLabel("The read").fill("SELECT o.id, o.status FROM orders o WHERE o.number = :order_number");
  await page.getByLabel("Input 1 name").fill("order_number");
  // A text input with no pattern is caught by the check.
  await page.getByLabel("Input 1 example").fill("OR-102938");
  await expect(page.getByText("needs a pattern or a list of allowed values")).toBeVisible();
  await page.getByLabel("Input 1 pattern").fill("[A-Z]{2}-[0-9]{4,10}");
  await expect(page.getByText("It passes its checks")).toBeVisible();
  await expect(page.getByText("tool_find_order_by_number")).toBeVisible();
  await shot(page, "tools-new");
  await page.getByRole("button", { name: "Save and run the example" }).click();
  await expect(page.getByRole("heading", { name: "find_order_by_number is saved" })).toBeVisible();
  await expect(page.getByText('"status": "shipped"')).toBeVisible();
  const saved = db.calls.find((c) => c.method === "POST" && c.path === "/api/tools");
  expect((saved?.body?.def as Def).inputs.order_number).toMatchObject({ type: "string", pattern: "[A-Z]{2}-[0-9]{4,10}", example: "OR-102938" });
  await shot(page, "tools-saved");
});

test("a tool that would write never passes the check", async ({ page }) => {
  await mockApi(page);
  await page.goto("/data-sources/tools/new");
  await page.getByLabel("Name", { exact: true }).fill("wipe_orders");
  await page.getByLabel("Source").selectOption("Orders database");
  await page.getByLabel("The read").fill("DELETE FROM orders WHERE id = :id");
  await expect(page.getByText("That lookup would change something or is not a query.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save and run the example" })).toBeDisabled();
});

test("YAML works the same as the form", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/data-sources/tools/new");
  await page.getByRole("button", { name: "YAML" }).click();
  await page.getByLabel("Definition").fill("name: from_yaml\nuse_when: x\nsource: Orders database\nkind: sql\nread: SELECT id FROM orders WHERE id = :id\ninputs:\n  id: { type: integer, min: 1, max: 9, example: 1 }\n");
  await expect(page.getByText("It passes its checks")).toBeVisible();
  await page.getByRole("button", { name: "Save and run the example" }).click();
  await expect(page.getByRole("heading", { name: "from_yaml is saved" })).toBeVisible();
  expect(db.calls.find((c) => c.path === "/api/tools/validate")?.body?.definition).toContain("name: from_yaml");
});

test("approve a new version from a repo file: see the diff and the example, then switch it on", async ({ page }) => {
  const v1: Version = { hash: hashOf(ORDER_DEF), def: ORDER_DEF, author: "admin@example.com", origin: "dashboard", created_at: NOW, example: EXAMPLE_OK, example_ok: true };
  const v2def = { ...ORDER_DEF, read: "SELECT o.id, o.status, o.total FROM orders o WHERE o.number = :order_number" };
  const v2: Version = { hash: hashOf(v2def), def: v2def, author: "repo:your-team/web", origin: "repo your-team/web@abc123 .coderhelm/tools/find-order.yaml", created_at: NOW, example: EXAMPLE_OK, example_ok: true };
  const db = await mockApi(page, {
    tools: [{ name: ORDER_DEF.name, enabled: true, approved: v1.hash, approved_by: "lead@example.com", approved_at: NOW, latest: v2.hash, created_by: "admin@example.com", created_at: NOW }],
    versions: { [ORDER_DEF.name]: [v2, v1] },
  });
  await page.goto("/data-sources/tools");
  await expect(page.getByText("New version waiting")).toBeVisible();
  await expect(page.getByText("from your-team/web@abc123")).toBeVisible();
  await page.getByRole("link", { name: ORDER_DEF.name }).click();
  await expect(page.getByRole("heading", { name: "A new version is waiting for approval" })).toBeVisible();
  const diff = page.getByRole("region", { name: "Changes in this version" });
  await expect(diff).toContainText("o.total");
  await expect(diff.getByText(/removed:/).first()).toBeAttached();
  await expect(page.getByText("From your-team/web@abc123 .coderhelm/tools/find-order.yaml").first()).toBeVisible();
  await shot(page, "tools-review");
  await page.getByRole("button", { name: "Approve this version" }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("Approved, on")).toBeVisible();
  expect(db.calls.find((c) => c.path.endsWith("/approve"))?.body?.hash).toBe(v2.hash);
  await page.getByRole("switch", { name: `Let Coderhelm use ${ORDER_DEF.name}` }).click();
  await expect(page.getByText("Approved, off")).toBeVisible();
});

test("the author can't approve their own version", async ({ page }) => {
  const v: Version = { hash: hashOf(ORDER_DEF), def: ORDER_DEF, author: "admin@example.com", origin: "dashboard", created_at: NOW, example: EXAMPLE_OK, example_ok: true };
  await mockApi(page, {
    tools: [{ name: ORDER_DEF.name, enabled: false, approved: "", approved_by: "", approved_at: "", latest: v.hash, created_by: "admin@example.com", created_at: NOW }],
    versions: { [ORDER_DEF.name]: [v] },
    selfApprovalRefused: true,
  });
  await page.goto(`/data-sources/tools/tool?name=${ORDER_DEF.name}`);
  await page.getByRole("button", { name: "Approve this version" }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("Another admin has to approve this version")).toBeVisible();
});

test("try a tool: valid inputs run, invalid ones are refused, runs are listed", async ({ page }) => {
  const v: Version = { hash: hashOf(ORDER_DEF), def: ORDER_DEF, author: "a@example.com", origin: "dashboard", created_at: NOW, example: EXAMPLE_OK, example_ok: true };
  const db = await mockApi(page, {
    tools: [{ name: ORDER_DEF.name, enabled: true, approved: v.hash, approved_by: "b@example.com", approved_at: NOW, latest: v.hash, created_by: "a@example.com", created_at: NOW }],
    versions: { [ORDER_DEF.name]: [v] },
  });
  await page.goto(`/data-sources/tools/tool?name=${ORDER_DEF.name}`);
  await expect(page.getByText('find_order_by_number({"order_number":"OR-555555"})')).toBeVisible();
  const input = page.getByRole("textbox", { name: "order_number" });
  await input.fill("OR-777777");
  await page.getByRole("button", { name: "Run the approved version" }).click();
  await expect(page.getByText('"number": "OR-777777"')).toBeVisible();
  await input.fill("x' OR 1=1 --");
  await page.getByRole("button", { name: "Run the approved version" }).click();
  await expect(page.getByText("Refused, nothing was sent")).toBeVisible();
  expect(db.calls.filter((c) => c.path.endsWith("/preview")).at(-1)?.body?.hash).toBe(v.hash);
  await shot(page, "tools-detail");
});

test("ask me first: a waiting call can be approved or declined", async ({ page }) => {
  const db = await mockApi(page, {
    asks: [
      { id: "ask1", tool: "member_bookings", hash: "h", inputs: { member_id: 4182 }, actor: "planner", repo: "your-team/web", pr: 41, why: "", status: "pending", created_at: NOW, decided_by: "", expires_in_s: 540 },
      { id: "ask2", tool: "member_bookings", hash: "h", inputs: { member_id: 99 }, actor: "reviewer", repo: "your-team/web", pr: 42, why: "", status: "pending", created_at: NOW, decided_by: "", expires_in_s: 300 },
    ],
  });
  await page.goto("/data-sources/tools");
  await expect(page.getByRole("heading", { name: /Waiting for your yes/ })).toContainText("(2)");
  await expect(page.getByText("planner on your-team/web #41 · 9 min left")).toBeVisible();
  await shot(page, "tools-inbox");
  await page.getByRole("button", { name: "Approve this call" }).first().click();
  await expect(page.getByText("(1)")).toBeVisible();
  await page.getByRole("button", { name: "Decline" }).click();
  await expect(page.getByText("Nothing waiting.")).toBeVisible();
  expect(db.calls.filter((c) => c.path.startsWith("/api/tools/asks/")).map((c) => c.body?.approve)).toEqual([true, false]);
});
