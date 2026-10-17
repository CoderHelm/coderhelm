import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Every API call is answered here. Nothing reaches a real backend.

const API_URL = "https://api.yourcompany.com/graphql";
const GOOD_KEY = "key_readonly_example_9x2k";
const REFUSAL = "This lookup would change data, so it was refused before it left Coderhelm. Ask for something to read instead.";
const KEY_REJECTED = "The new key was not accepted. The old key is still in place.";
const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

interface Aws {
  account: string; region: string; role_arn: string; log_groups: string[]; cluster: string; database: string;
  engine?: "postgres" | "redshift"; databases?: string[];
}
interface Source {
  id: string; kind: "api" | "logs" | "database"; aws?: Aws | null; name: string; url: string; status: "ready" | "error"; status_message?: string;
  enabled: boolean; setup_complete: boolean; key_hint: string; has_mutations: boolean; kinds: number | null;
  schema_available: boolean; hidden_fields: string[]; repos: string[]; last_checked_at: string;
  created_at: string; created_by: string;
}
interface Call { method: string; path: string; body: Record<string, unknown> | null }
interface Backend {
  sources: Source[];
  events: Record<string, unknown>[];
  calls: Call[];
  rejectKey: boolean;
  /** AWS connections the team already made for log alerts. */
  existing: { role_arn: string; account: string; region: string; log_groups: string[] }[];
  /** The database user can still change tables, so connecting fails its read-only check. */
  dbWritable: boolean;
}

const ACCOUNT = "123456789012";
const ROLE = `arn:aws:iam::${ACCOUNT}:role/CoderhelmReadOnly`;
const DB_CODE = "coderhelm:eyJyb2xlX2FybiI6ImFybjphd3M6aWFtOjoxMjM0NTY3ODkwMTI6cm9sZS9Db2RlcmhlbG1SZWFkT25seSJ9";
/** A pasted line that carries both a PostgreSQL database and a Redshift warehouse. */
const BOTH_CODE = "coderhelm:eyJyb2xlX2FybiI6ImFybjphd3M6aWFtOjoxMjM0NTY3ODkwMTI6cm9sZS9Db2RlcmhlbG1SZWFkT25seSIsImVuZ2luZSI6InJlZHNoaWZ0In0";

const SCRIPT = "coderhelm_setup() (\n  echo example\n)\ncoderhelm_setup\n";
const LOG_GROUPS = [
  { name: "/ecs/api", stored_mb: 2400, retention_days: 30 },
  { name: "/ecs/worker", stored_mb: 310, retention_days: 30 },
  { name: "/aws/lambda/orders-sync", stored_mb: 0.4, retention_days: null },
];
const ROLE_CHECK = { id: "role", label: "Use the role in your AWS account", ok: true, detail: "Coderhelm can use the role, and only with your private ID." };
const AWS_CONNECT_CHECKS = [ROLE_CHECK, { id: "logs", label: "See your log groups", ok: true, detail: "It can see 3 log groups." }];
const DB_PASSED = [
  ROLE_CHECK,
  { id: "sign_in", label: "Sign in to the database", ok: true, detail: "Signed in as coderhelm_readonly." },
  { id: "read_only", label: "The database user can only read", ok: true, detail: "It can't change any table, the database defaults it to read-only, and every lookup is rolled back." },
  { id: "read", label: "Read the list of tables", ok: true, detail: "It can read 42 tables." },
];
const WAREHOUSE_PASSED = [
  ROLE_CHECK,
  { id: "sign_in", label: "Sign in to the warehouse", ok: true, detail: "Signed in as coderhelm_readonly, with no password." },
  { id: "read_only", label: "The user can only read, in every database", ok: true, detail: "It can't change any table in 2 databases." },
  { id: "read", label: "Read the list of tables", ok: true, detail: "It can read 18 tables across dev, marts." },
];
const DB_WRITABLE = [
  ROLE_CHECK,
  DB_PASSED[1],
  {
    id: "read_only", label: "The database user can only read", ok: false,
    detail: "app_admin can change 12 tables.",
    fix: "Run the setup script and choose this database: it creates a user that can only read.",
  },
];

const PASSED_CHECKS = [
  { id: "reach", label: "Reach the address", ok: true, detail: "Your API answered." },
  { id: "sign_in", label: "The key is accepted", ok: true, detail: "Your API accepted the key." },
  { id: "read", label: "Read the list of data", ok: true, detail: "Found 14 kinds of data." },
  { id: "read_only", label: "Only reads are possible", ok: true, detail: "A test write was refused before it left Coderhelm." },
];
const REJECTED_CHECKS = [
  PASSED_CHECKS[0],
  {
    id: "sign_in", label: "The key is accepted", ok: false,
    detail: "Your API said the key is not valid.",
    fix: "Paste the key again, or ask whoever runs your API for a new read-only key.",
  },
];

function warehouseSource(over: Partial<Source> = {}): Source {
  return awsSource("database", {
    id: "ds_wh", name: "analytics-dw warehouse", kinds: 18,
    aws: {
      account: ACCOUNT, region: "us-east-1", role_arn: ROLE, log_groups: [], cluster: "analytics-dw", database: "",
      engine: "redshift", databases: ["dev", "marts"],
    },
    ...over,
  });
}

function awsSource(kind: "logs" | "database", over: Partial<Source> = {}): Source {
  const now = new Date().toISOString();
  return {
    id: kind === "logs" ? "ds_logs" : "ds_db", kind, name: kind === "logs" ? `Logs in AWS account ${ACCOUNT}` : "orders-db database",
    url: "", status: "ready", enabled: false, setup_complete: false, key_hint: "", has_mutations: false,
    kinds: kind === "logs" ? 2 : 42, schema_available: true, hidden_fields: [...SEEDED_HIDDEN], repos: [],
    last_checked_at: now, created_at: now, created_by: "admin@example.com",
    aws: {
      account: ACCOUNT, region: "us-east-1", role_arn: ROLE,
      log_groups: kind === "logs" ? ["/ecs/api", "/ecs/worker"] : [],
      cluster: kind === "database" ? "orders-db" : "", database: kind === "database" ? "orders" : "",
    },
    ...over,
  };
}

const SEEDED_HIDDEN = ["password", "secret", "token", "api_key", "ssn", "card", "cvv", "email", "phone", "address", "birthday"];

function makeSource(over: Partial<Source> = {}): Source {
  const now = new Date().toISOString();
  return {
    id: "ds_1", kind: "api", name: "api.yourcompany.com", url: API_URL, status: "ready", enabled: false,
    setup_complete: false, key_hint: "9x2k", has_mutations: true, kinds: 14, schema_available: true,
    hidden_fields: [...SEEDED_HIDDEN], repos: [], last_checked_at: now, created_at: now, created_by: "admin@example.com",
    ...over,
  };
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { sources: [], events: [], calls: [], rejectKey: false, existing: [], dbWritable: false, ...init };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

  // No third-party requests (analytics and the like) during tests.
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());

  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const p = url.pathname;
    let body: Record<string, unknown> | null = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    db.calls.push({ method, path: p + url.search, body });

    // What the shell needs to get past the sign-in screen as an admin.
    if (p === "/api/me") {
      return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: "admin" });
    }
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") {
      return json(route, { repos: [
        { name: "your-team/web", enabled: true, ticket_source: "github" },
        { name: "your-team/backend", enabled: true, ticket_source: "github" },
      ] });
    }

    // Data sources
    if (p === "/api/data-sources" && method === "GET") return json(route, { sources: db.sources });
    if (p === "/api/data-sources/activity") {
      // Newest first; `before` starts just after the event with that cursor.
      const limit = Number(url.searchParams.get("limit") || 50);
      const before = url.searchParams.get("before");
      const from = before ? db.events.findIndex((e) => e.cursor === before) + 1 : 0;
      return json(route, { events: db.events.slice(from, from + limit) });
    }
    if (p === "/api/data-sources/api/probe") {
      if (String(body?.url).includes("yourcompany.com")) return json(route, { ok: true, kind: "graphql", needs_key: true });
      return json(route, { ok: false, kind: null, needs_key: false, error: {
        step: "reach", message: "Nothing answered at that address.", fix: "Check the spelling, or ask an engineer for the address.",
      } });
    }
    if (p === "/api/data-sources/api/check") {
      if (db.rejectKey) return json(route, { ok: false, checks: REJECTED_CHECKS, kinds: null, has_mutations: false, schema_available: false });
      return json(route, { ok: true, checks: PASSED_CHECKS, kinds: 14, has_mutations: true, schema_available: true });
    }
    if (p === "/api/data-sources/api" && method === "POST") {
      if (db.rejectKey) return json(route, { error: "The key was not accepted.", ok: false, checks: REJECTED_CHECKS }, 400);
      const source = makeSource({ url: String(body?.url) });
      db.sources.push(source);
      return json(route, { source, checks: PASSED_CHECKS });
    }
    if (p === "/api/data-sources/aws/setup") {
      return json(route, { script: SCRIPT, existing: db.existing, role_prefix: "CoderhelmReadOnly" });
    }
    if (p === "/api/data-sources/aws/connect") {
      const viaCode = typeof body?.code === "string";
      return json(route, {
        ok: true, checks: AWS_CONNECT_CHECKS, account: ACCOUNT, region: "us-east-1",
        role_arn: viaCode ? ROLE : String(body?.role_arn), log_groups: LOG_GROUPS,
        database: viaCode ? { cluster: "orders-db", database: "orders" } : null,
        warehouse: body?.code === BOTH_CODE ? { cluster: "analytics-dw", databases: ["dev", "marts"] } : null,
      });
    }
    if (p === "/api/data-sources/logs" && method === "POST") {
      const source = awsSource("logs", { aws: { ...awsSource("logs").aws!, log_groups: body?.log_groups as string[] }, kinds: (body?.log_groups as string[]).length });
      db.sources.push(source);
      return json(route, { source, checks: [ROLE_CHECK] });
    }
    if (p === "/api/data-sources/database" && method === "POST" && body?.engine === "redshift") {
      const source = warehouseSource();
      db.sources.push(source);
      return json(route, { source, checks: WAREHOUSE_PASSED });
    }
    if (p === "/api/data-sources/database" && method === "POST") {
      if (db.dbWritable) return json(route, { error: "The connection checks didn't pass.", checks: DB_WRITABLE }, 400);
      const source = awsSource("database");
      db.sources.push(source);
      return json(route, { source, checks: DB_PASSED });
    }
    const m = p.match(/^\/api\/data-sources\/([^/]+)(?:\/(key|test|samples|try))?$/);
    const source = m && db.sources.find((s) => s.id === m[1]);
    if (m && !source) return json(route, { error: "Data source not found" }, 404);
    if (m && source) {
      const sub = m[2];
      if (!sub && method === "PUT") {
        Object.assign(source, body);
        if (body?.enabled === true) source.setup_complete = true;
        return json(route, { source });
      }
      if (!sub && method === "DELETE") {
        db.sources = db.sources.filter((s) => s.id !== source.id);
        return json(route, { ok: true });
      }
      if (sub === "test") {
        source.status = "ready";
        delete source.status_message;
        return json(route, { ok: true, checks: PASSED_CHECKS, kinds: 14, has_mutations: true, schema_available: true, source });
      }
      if (sub === "key") {
        if (source.kind !== "api") return json(route, { error: "This source has no key." }, 400);
        if (db.rejectKey) return json(route, { error: KEY_REJECTED, ok: false, checks: REJECTED_CHECKS }, 400);
        source.key_hint = String(body?.key).slice(-4);
        return json(route, { source, checks: PASSED_CHECKS });
      }
      if (sub === "samples" && source.aws?.engine === "redshift") {
        return json(route, { samples: [
          { label: "Count rows in public.orders (database dev)", query: "SELECT count(*) FROM public.orders", database: "dev" },
          { label: "Count rows in marts.daily (database marts)", query: "SELECT count(*) FROM marts.daily", database: "marts" },
        ] });
      }
      if (sub === "try" && source.aws?.engine === "redshift") {
        const query = String(body?.query);
        return json(route, {
          ok: true, query, fields: ["marts.daily"], hidden_count: 0, ms: 840, note: `1 row in ${String(body?.database)}`,
          result: JSON.stringify([{ count: 365 }]),
        });
      }
      if (sub === "samples" && source.kind === "database") {
        return json(route, { samples: [
          { label: "Count rows in orders", query: "SELECT count(*) FROM orders" },
          { label: "Look at a few rows of orders", query: "SELECT * FROM orders LIMIT 5" },
        ] });
      }
      if (sub === "samples" && source.kind === "logs") {
        return json(route, { samples: [
          { label: "Latest lines", query: "fields @timestamp, @message | sort @timestamp desc | limit 20", log_groups: ["/ecs/api"], since: "1h" },
          { label: "Errors in the last day", query: "fields @timestamp, @message | filter @message like /error/", log_groups: ["/ecs/api"], since: "24h" },
        ] });
      }
      if (sub === "try" && source.kind === "database") {
        const query = String(body?.query);
        if (/^\s*delete/i.test(query)) {
          return json(route, { ok: false, query, fields: [], hidden_count: 0, ms: 0, refused: "That lookup would change something or is not a query. Only a single SELECT is allowed. Nothing was sent." });
        }
        return json(route, {
          ok: true, query, fields: ["orders"], hidden_count: 2, ms: 96, note: "3 rows",
          result: JSON.stringify([{ id: 3, status: "shipped", email: "[hidden]" }, { id: 2, status: "paid", email: "[hidden]" }, { id: 1, status: "paid", email: null }]),
        });
      }
      if (sub === "try" && source.kind === "logs") {
        const groups = (body?.log_groups as string[]) ?? [];
        return json(route, {
          ok: true, query: String(body?.query), fields: groups, hidden_count: 1, ms: 2100, note: "2 lines, 3.2 MB scanned",
          result: JSON.stringify([{ "@timestamp": "2026-01-31 14:02:11.000", "@message": "ERROR order 1042 failed: timeout" }, { "@timestamp": "2026-01-31 14:01:58.000", "@message": "token=[hidden] retrying" }]),
        });
      }
      if (sub === "samples") {
        return json(route, { samples: [
          { label: "List the kinds of data", query: "{ __schema { types { name } } }" },
          { label: "Look up one order", query: "{ order(id: 1) { id status customer { email } } }" },
        ] });
      }
      if (sub === "try") {
        const query = String(body?.query);
        const refused = /^\s*mutation/.test(query);
        db.events.unshift({
          at: new Date().toISOString(), source_id: source.id, source_name: source.name, actor: "admin@example.com",
          summary: refused ? "A write was attempted" : "Looked up one order", detail: refused ? REFUSAL : "", ok: !refused,
          outcome: refused ? "refused" : "ok", ms: refused ? 2 : 184,
        });
        if (refused) return json(route, { ok: false, query, fields: [], hidden_count: 0, ms: 2, refused: REFUSAL });
        return json(route, {
          ok: true, query, fields: ["order.id", "order.status"], hidden_count: 1, ms: 184,
          result: JSON.stringify({ data: { order: { id: 1, status: "shipped", customer: {} } } }),
        });
      }
    }
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

/** Full-page screenshots at desktop and phone widths, and a check that nothing overflows sideways. */
async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  // Confirmation toasts clear themselves after three seconds; wait so they don't cover the page.
  await expect(page.locator(".animate-toast-in")).toHaveCount(0);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    // Sticky bars are captured where the page is scrolled to, so start from the top.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

const callsTo = (db: Backend, method: string, re: RegExp) => db.calls.filter((c) => c.method === method && re.test(c.path));

test("hub: empty state", async ({ page }) => {
  await mockApi(page);
  await page.goto("/data-sources");

  await expect(page.getByRole("heading", { level: 1, name: "Let Coderhelm check facts against your real systems" })).toBeVisible();
  await expect(page.getByRole("link", { name: /An API/ })).toBeVisible();
  await expect(page.getByText("Coming next")).toHaveCount(1);
  await expect(page.getByRole("link", { name: /Logs in your AWS account/ })).toHaveAttribute("href", /^\/data-sources\/connect\/aws\/?\?for=logs$/);
  await expect(page.getByRole("link", { name: /A database in your AWS account/ })).toHaveAttribute("href", /^\/data-sources\/connect\/aws\/?\?for=database$/);
  await expect(page.getByText("No lookups yet. They appear here the moment Coderhelm or a teammate runs one.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connected" })).toHaveCount(0);
  await expect(page.locator('li[aria-current="step"]')).toContainText("Connect a source");
  await expect(page.getByRole("navigation").getByRole("link", { name: "Data sources" })).toBeVisible();

  const store = page.getByRole("button", { name: "What we store and how to turn this off" });
  await store.click();
  await expect(store).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("We do not store your data.")).toBeVisible();
  await expect(page.getByText("The activity log keeps the text of each lookup (not what came back) for 180 days.")).toBeVisible();
  await shot(page, "hub-empty");
});

test("connect an API: happy path through Turn on fact-checking", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/data-sources");
  await page.getByRole("link", { name: /An API/ }).click();

  // Address
  await expect(page.getByRole("heading", { level: 1, name: "Where is your API?" })).toBeVisible();
  await expect(page.locator('li[aria-current="step"]')).toContainText("Where your API is");
  await page.getByLabel("Web address").fill(API_URL);
  await expect(page.getByText("Found a GraphQL API at that address.")).toBeVisible();
  await shot(page, "connect-1-address");
  await page.getByRole("button", { name: "Continue" }).click();

  // Key
  await expect(page.getByRole("heading", { level: 1, name: "Paste a key Coderhelm can use" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect" })).toBeDisabled();
  await page.getByLabel("API key").fill(GOOD_KEY);
  const checks = page.getByRole("list", { name: "Checks for this key" });
  for (const label of ["Reach the address", "The key is accepted", "Read the list of data", "Only reads are possible"]) {
    await expect(checks.locator('li[data-state="passed"]', { hasText: label })).toBeVisible();
  }
  await expect(page.getByText("This API can also change data.")).toBeVisible();
  await expect(page.getByText("every lookup is checked before it leaves Coderhelm and anything that isn't a pure read is refused.")).toBeVisible();
  await page.getByText("Technical details").click();
  await expect(page.getByText("Only POST requests to this exact address are sent")).toBeVisible();
  await shot(page, "connect-2-key");
  await page.getByRole("button", { name: "Connect" }).click();

  // Choose
  await expect(page.getByRole("heading", { level: 1, name: "Choose what Coderhelm may use" })).toBeVisible();
  expect(callsTo(db, "POST", /\/api\/data-sources\/api$/)[0].body).toEqual({ url: API_URL, key: GOOD_KEY });
  expect(page.url()).toContain("id=ds_1");
  expect(page.url()).not.toContain(GOOD_KEY);
  await expect(page.getByRole("button", { name: "Never" })).toHaveCount(0);
  await expect(page.getByText("It stays off until you turn it on at the last step.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Hidden field names" }).getByRole("listitem")).toHaveCount(11);
  await page.getByRole("button", { name: "Stop hiding birthday" }).click();
  await page.getByLabel("Hide another field name").fill("salary");
  await page.getByRole("button", { name: "Hide it" }).click();
  await page.getByRole("button", { name: "Only some" }).click();
  await page.getByLabel("your-team/backend").check();
  await shot(page, "connect-3-choose");
  await page.getByRole("button", { name: "Continue" }).click();

  // Try
  await expect(page.getByRole("heading", { level: 1, name: "Run a lookup the way Coderhelm would" })).toBeVisible();
  const put = callsTo(db, "PUT", /\/api\/data-sources\/ds_1$/)[0].body!;
  expect(put.repos).toEqual(["your-team/backend"]);
  expect(put.hidden_fields).toContain("salary");
  expect(put.hidden_fields).not.toContain("birthday");
  expect(put).not.toHaveProperty("enabled");
  await page.getByRole("button", { name: "Look up one order" }).click();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What was asked" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What came back" })).toBeVisible();
  await expect(page.getByText('"status": "shipped"')).toBeVisible();
  await expect(page.getByText("1 field hidden")).toBeVisible();
  await expect(page.getByText("Nothing was changed. This lookup is in your activity log.")).toBeVisible();
  await shot(page, "connect-4-try");
  await page.getByRole("button", { name: "Continue" }).click();

  // Review
  await expect(page.getByRole("heading", { level: 1, name: "Check before you turn it on" })).toBeVisible();
  for (const k of ["Connected", "Coderhelm can", "Coderhelm cannot", "We store", "Turning it off"]) {
    await expect(page.getByRole("term").filter({ hasText: new RegExp(`^${k}$`) })).toBeVisible();
  }
  await expect(page.getByText("your-team/backend")).toBeVisible();
  await shot(page, "connect-5-review");
  await page.getByRole("button", { name: "Turn on fact-checking" }).click();

  // Done
  await expect(page.getByRole("heading", { level: 1, name: "Fact-checking is on" })).toBeVisible();
  await expect(page.getByText("Coderhelm uses it from now on")).toBeVisible();
  expect(callsTo(db, "PUT", /\/api\/data-sources\/ds_1$/).at(-1)!.body).toEqual({ enabled: true });
  await shot(page, "connect-6-done");
  await page.getByRole("link", { name: "Back to data sources" }).click();

  // Hub now lists it
  const card = page.getByRole("article", { name: "api.yourcompany.com" });
  await expect(card.getByText("Ready", { exact: true })).toBeVisible();
  await expect(card.getByText("Key ending 9x2k")).toBeVisible();
  await expect(card.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Looked up one order")).toBeVisible();
  await card.getByRole("button", { name: "Test again" }).click();
  await expect(card.getByText("All checks passed.")).toBeVisible();
  await shot(page, "hub-connected");

  await card.getByRole("switch").click();
  await expect(card.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  await expect(card.getByText("Paused", { exact: true })).toBeVisible();
});

test("a rejected key shows the failed check and its fix inline", async ({ page }) => {
  const db = await mockApi(page, { rejectKey: true });
  await page.goto(`/data-sources/connect?step=key&url=${encodeURIComponent(API_URL)}`);

  await page.getByLabel("API key").fill("wrong-key");
  const checks = page.getByRole("list", { name: "Checks for this key" });
  await expect(checks.locator('li[data-state="passed"]', { hasText: "Reach the address" })).toBeVisible();
  const failed = checks.locator('li[data-state="failed"]');
  await expect(failed).toHaveCount(1);
  await expect(failed).toContainText("The key is accepted");
  await expect(failed).toContainText("Your API said the key is not valid.");
  await expect(failed).toContainText("What to do: Paste the key again, or ask whoever runs your API for a new read-only key.");
  await expect(failed.getByRole("alert")).toBeVisible();
  await expect(checks.locator('li[data-state="pending"]')).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Connect" })).toBeDisabled();
  expect(callsTo(db, "POST", /\/api\/data-sources\/api$/)).toHaveLength(0);
  await shot(page, "connect-2-key-rejected");
});

test("trying a write shows the refusal", async ({ page }) => {
  const db = await mockApi(page, { sources: [makeSource({ hidden_fields: ["password"] })] });
  await page.goto("/data-sources/connect?step=try&id=ds_1");

  await page.getByRole("button", { name: "Try a write, to see it refused" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "Refused" });
  await expect(alert).toContainText(REFUSAL);
  await expect(page.locator("pre").first()).toHaveText("mutation { __typename }");
  expect(callsTo(db, "POST", /\/try$/)[0].body).toEqual({ query: "mutation { __typename }" });
  await expect(page.getByText("Nothing was changed. This lookup is in your activity log.")).toBeVisible();
  await shot(page, "connect-4-try-refused");
});

test("the address step can be completed with the keyboard alone", async ({ page }) => {
  await mockApi(page);
  await page.goto("/data-sources/connect?step=address");
  await expect(page.getByRole("heading", { level: 1, name: "Where is your API?" })).toBeVisible();

  const field = page.getByLabel("Web address");
  for (let i = 0; i < 80 && !(await field.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await expect(field).toBeFocused();
  await page.keyboard.type(API_URL);
  await expect(page.getByText("Found a GraphQL API at that address.")).toBeVisible();
  await page.keyboard.press("Enter");

  const heading = page.getByRole("heading", { level: 1, name: "Paste a key Coderhelm can use" });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("API key")).toBeFocused();
});

test("a wrong address shows the failed step and its fix next to the field", async ({ page }) => {
  await mockApi(page);
  await page.goto("/data-sources/connect?step=address");
  const field = page.getByLabel("Web address");
  await field.fill("https://nothing-here.example/graphql");
  await field.blur();
  const error = page.locator("#api-url-error");
  await expect(error).toContainText("Reach the address: Nothing answered at that address.");
  await expect(error).toContainText("Check the spelling, or ask an engineer for the address.");
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await shot(page, "connect-1-address-error");
});

test("an unfinished setup can be resumed from the hub", async ({ page }) => {
  await mockApi(page, { sources: [makeSource({ hidden_fields: ["password", "token"] })] });
  await page.goto("/data-sources");

  const card = page.getByRole("article", { name: "api.yourcompany.com" });
  await expect(card.getByText("Paused — finish setup")).toBeVisible();
  await expect(card.getByRole("switch")).toHaveCount(0);
  await expect(page.locator('li[aria-current="step"]')).toContainText("Choose what Coderhelm may use");
  await shot(page, "hub-unfinished");
  await card.getByRole("link", { name: "Continue setup" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Choose what Coderhelm may use" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Hidden field names" }).getByRole("listitem")).toHaveCount(2);
});

test("replace key: a good key replaces the old one", async ({ page }) => {
  const db = await mockApi(page, { sources: [makeSource({ enabled: true, setup_complete: true })] });
  await page.goto("/data-sources");
  const card = page.getByRole("article", { name: "api.yourcompany.com" });
  await expect(card.getByText("Key ending 9x2k")).toBeVisible();

  await card.getByRole("button", { name: "Replace key" }).click();
  await card.getByRole("textbox", { name: "New key" }).fill("key_readonly_example_7abc");
  await card.getByRole("button", { name: "Check and replace" }).click();

  await expect(card.getByText("Key ending 7abc")).toBeVisible();
  await expect(card.getByRole("list", { name: "Checks for the new key" }).locator('li[data-state="passed"]')).toHaveCount(4);
  await expect(card.getByRole("textbox", { name: "New key" })).toHaveValue("");
  expect(callsTo(db, "POST", /\/api\/data-sources\/ds_1\/key$/)[0].body).toEqual({ key: "key_readonly_example_7abc" });
});

test("replace key: a rejected key keeps the old one and says so", async ({ page }) => {
  await mockApi(page, { rejectKey: true, sources: [makeSource({ enabled: true, setup_complete: true })] });
  await page.goto("/data-sources");
  const card = page.getByRole("article", { name: "api.yourcompany.com" });

  await card.getByRole("button", { name: "Replace key" }).click();
  await card.getByRole("textbox", { name: "New key" }).fill("wrong-key");
  await card.getByRole("button", { name: "Check and replace" }).click();

  await expect(card.locator("#key-ds_1-error")).toHaveText(KEY_REJECTED);
  await expect(card.getByRole("textbox", { name: "New key" })).toHaveAttribute("aria-invalid", "true");
  const failed = card.getByRole("list", { name: "Checks for the new key" }).locator('li[data-state="failed"]');
  await expect(failed).toContainText("The key is accepted");
  await expect(failed).toContainText("What to do:");
  await expect(card.getByText("Key ending 9x2k")).toBeVisible();
  await shot(page, "hub-replace-key-rejected");
});

test("hub: editing what Coderhelm can't see sends the new list", async ({ page }) => {
  const db = await mockApi(page, { sources: [makeSource({ enabled: true, setup_complete: true, hidden_fields: ["password", "token"] })] });
  await page.goto("/data-sources");
  const card = page.getByRole("article", { name: "api.yourcompany.com" });

  await card.getByRole("button", { name: "What Coderhelm can't see" }).click();
  await expect(card.getByRole("button", { name: "Save" })).toBeDisabled();
  await card.getByRole("button", { name: "Stop hiding token" }).click();
  await card.getByLabel("Hide another field name").fill("salary");
  await card.getByLabel("Hide another field name").press("Enter");
  await shot(page, "hub-hidden-fields");
  await card.getByRole("button", { name: "Save" }).click();

  await expect(card.getByRole("list", { name: "Hidden field names" })).toHaveCount(0);
  expect(callsTo(db, "PUT", /\/api\/data-sources\/ds_1$/)[0].body).toEqual({ hidden_fields: ["password", "salary"] });
});

test("remove: confirm, delete, and the card is gone", async ({ page }) => {
  const db = await mockApi(page, { sources: [makeSource({ enabled: true, setup_complete: true })] });
  await page.goto("/data-sources");
  const card = page.getByRole("article", { name: "api.yourcompany.com" });

  await card.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("heading", { name: "Remove api.yourcompany.com?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(card).toBeVisible();
  expect(callsTo(db, "DELETE", /ds_1$/)).toHaveLength(0);

  await card.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).last().click();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Connected" })).toHaveCount(0);
  expect(callsTo(db, "DELETE", /\/api\/data-sources\/ds_1$/)).toHaveLength(1);
});

test("a source in error status says Coderhelm is not using it, and activity explains refusals", async ({ page }) => {
  const now = new Date().toISOString();
  await mockApi(page, {
    sources: [makeSource({ enabled: true, setup_complete: true, status: "error", status_message: "Your API stopped accepting the key.", key_hint: "" })],
    events: [
      { at: now, source_id: "ds_1", source_name: "api.yourcompany.com", actor: "reviewer", repo: "your-team/backend", pr: 123, summary: "Checked the fields of an order", detail: "", ok: true, outcome: "ok", ms: 210 },
      { at: now, source_id: "ds_1", source_name: "api.yourcompany.com", actor: "admin@example.com", summary: "A write was attempted", detail: REFUSAL, ok: false, outcome: "refused", ms: 2 },
      { at: now, source_id: "ds_1", source_name: "api.yourcompany.com", actor: "reviewer", repo: "your-team/web", pr: 7, summary: "Looked up a setting", detail: "Your API did not answer in time.", ok: false, outcome: "failed", ms: 10000 },
      { at: now, source_id: "ds_1", source_name: "api.yourcompany.com", actor: "planner", repo: "your-team/backend", pr: 0, summary: "Checked which fields an order has", detail: "", ok: true, outcome: "ok", ms: 160 },
    ],
  });
  await page.goto("/data-sources");
  const card = page.getByRole("article", { name: "api.yourcompany.com" });

  await expect(card.getByText("Needs attention", { exact: true })).toBeVisible();
  await expect(card.getByText("Coderhelm is not using this source until the problem is fixed.")).toBeVisible();
  await expect(card.getByText("Your API stopped accepting the key.")).toBeVisible();
  await expect(card.getByText("Key saved")).toBeVisible();
  await expect(card.getByText(/Key ending/)).toHaveCount(0);

  const activity = page.locator("#activity");
  await expect(activity.getByText("Reviewer on your-team/backend #123")).toBeVisible();
  await expect(activity.getByText("Planner on your-team/backend", { exact: true })).toBeVisible();
  await expect(activity.getByText("admin@example.com")).toBeVisible();
  await expect(activity.getByText(REFUSAL)).toBeVisible();
  await expect(activity.getByText("Your API did not answer in time.")).toBeVisible();
  await expect(activity.getByText("reviewer", { exact: true })).toHaveCount(0);
  await shot(page, "hub-error-status");

  // Test again returns the fixed source; the card updates without a reload.
  await card.getByRole("button", { name: "Test again" }).click();
  await expect(card.getByText("Ready", { exact: true })).toBeVisible();
  await expect(card.getByText("Coderhelm is not using this source until the problem is fixed.")).toHaveCount(0);
});

test("step ids from the server are shown as their labels, never raw", async ({ page }) => {
  await mockApi(page);
  await page.goto("/data-sources/connect?step=address");
  await page.getByLabel("Web address").fill("https://nothing-here.example/graphql");
  await expect(page.locator("#api-url-error")).toContainText("Reach the address:");
  await expect(page.locator("#api-url-error")).not.toContainText("reach:");
});

test("small screens: the menu opens, navigates and closes with Escape", async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/data-sources");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const menuButton = page.getByRole("button", { name: "Menu" });
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("link", { name: "Reviewer", exact: true })).toBeHidden();

  await menuButton.click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await expect(menu).toHaveAttribute("aria-modal", "true");
  expect(await menu.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.screenshot({ path: path.join(SHOTS_DIR, "mobile-menu-open-390.png") });

  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(menuButton).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");

  await menuButton.click();
  await menu.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/?$/);
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Data sources/ })).toBeVisible();

  // Backdrop click closes too.
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
  await page.mouse.click(370, 400);
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
});

// ── Logs and databases in a team's AWS account ─────────────────────

test("hub: lists APIs, logs and databases, each with its own details", async ({ page }) => {
  await mockApi(page, {
    sources: [
      makeSource({ enabled: true, setup_complete: true }),
      awsSource("logs", { enabled: true, setup_complete: true }),
      awsSource("database", { enabled: true, setup_complete: true }),
    ],
  });
  await page.goto("/data-sources");

  const api = page.getByRole("article", { name: "api.yourcompany.com" });
  await expect(api.getByText("API", { exact: true })).toBeVisible();
  await expect(api.getByText("Key ending 9x2k")).toBeVisible();
  await expect(api.getByRole("button", { name: "Replace key" })).toBeVisible();

  const logs = page.getByRole("article", { name: `Logs in AWS account ${ACCOUNT}` });
  await expect(logs.getByText("Logs", { exact: true })).toBeVisible();
  await expect(logs.getByText(`AWS account ${ACCOUNT}, us-east-1`)).toBeVisible();
  await expect(logs.getByText("2 log groups")).toBeVisible();
  await expect(logs.getByRole("button", { name: "Replace key" })).toHaveCount(0);

  const db = page.getByRole("article", { name: "orders-db database" });
  await expect(db.getByText("Database", { exact: true })).toBeVisible();
  await expect(db.getByText(`orders-db / orders · AWS account ${ACCOUNT}, us-east-1`)).toBeVisible();
  await expect(db.getByText("42 tables")).toBeVisible();
  await expect(db.getByRole("button", { name: "Replace key" })).toHaveCount(0);
  await db.getByRole("button", { name: "What Coderhelm can't see" }).click();
  await expect(db.getByRole("list", { name: "Hidden column names" })).toBeVisible();
  await expect(db.getByLabel("Hide another column name")).toBeVisible();
  await shot(page, "hub-mixed-sources");
});

test("hub: the log groups a logs source may search can be changed", async ({ page }) => {
  const db = await mockApi(page, { sources: [awsSource("logs", { enabled: true, setup_complete: true })] });
  await page.goto("/data-sources");
  const card = page.getByRole("article", { name: `Logs in AWS account ${ACCOUNT}` });

  await card.getByRole("button", { name: "Log groups" }).click();
  await expect(card.getByLabel("/ecs/api")).toBeChecked();
  await expect(card.getByLabel("/aws/lambda/orders-sync")).not.toBeChecked();
  expect(callsTo(db, "POST", /\/aws\/connect$/)[0].body).toEqual({ role_arn: ROLE, region: "us-east-1" });
  await card.getByLabel("/ecs/worker").uncheck();
  await card.getByLabel("/aws/lambda/orders-sync").check();
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByLabel("/ecs/api")).toHaveCount(0);
  expect(callsTo(db, "PUT", /\/api\/data-sources\/ds_logs$/)[0].body).toEqual({ log_groups: ["/ecs/api", "/aws/lambda/orders-sync"] });
});

test("connect logs: reuse the AWS connection the team already has", async ({ page }) => {
  const db = await mockApi(page, {
    existing: [{ role_arn: `arn:aws:iam::${ACCOUNT}:role/CoderHelmLogReader`, account: ACCOUNT, region: "us-east-1", log_groups: ["/ecs/api"] }],
  });
  await page.goto("/data-sources");
  await page.getByRole("link", { name: /Logs in your AWS account/ }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Give Coderhelm read-only access" })).toBeVisible();
  await expect(page.locator('li[aria-current="step"]')).toContainText("Give read-only access");
  const existing = page.getByRole("region", { name: `AWS account ${ACCOUNT}` });
  await expect(existing.getByText("It can only read logs, so there's nothing to run.")).toBeVisible();
  // The script is there for anyone who'd rather set up a new connection.
  await expect(page.getByRole("button", { name: "Copy script" })).toHaveCount(0);
  await shot(page, "connect-aws-logs-existing");
  await existing.getByRole("button", { name: "Use this connection" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Choose which logs Coderhelm may search" })).toBeVisible();
  await expect(page.locator('li[aria-current="step"]')).toContainText("Choose what to share");
  expect(callsTo(db, "POST", /\/aws\/connect$/)[0].body).toEqual({ role_arn: `arn:aws:iam::${ACCOUNT}:role/CoderHelmLogReader`, region: "us-east-1" });
  await expect(page.getByLabel("/ecs/api")).toBeChecked();
  await expect(page.getByText("2.4 GB")).toBeVisible();
  await page.getByLabel("Find a log group").fill("worker");
  await expect(page.getByLabel("/ecs/api")).toHaveCount(0);
  await page.getByLabel("/ecs/worker").check();
  await page.getByLabel("Find a log group").fill("");
  await shot(page, "connect-aws-logs-pick");
  await page.getByRole("button", { name: "Connect these 2 log groups" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Choose what Coderhelm may use" })).toBeVisible();
  expect(page.url()).toContain("id=ds_logs");
  await expect(page.locator('li[aria-current="step"]')).toContainText("Choose what it may use");
  expect(callsTo(db, "POST", /\/api\/data-sources\/logs$/)[0].body).toEqual({
    role_arn: `arn:aws:iam::${ACCOUNT}:role/CoderHelmLogReader`, region: "us-east-1", log_groups: ["/ecs/api", "/ecs/worker"],
  });
  await expect(page.getByText("Secrets, email addresses and card numbers inside log lines are always hidden too.")).toBeVisible();
});

test("connect a database: script, pasted line, and a failed read-only check explains the fix", async ({ page }) => {
  const db = await mockApi(page, { dbWritable: true });
  await page.goto("/data-sources");
  await page.getByRole("link", { name: /A database in your AWS account/ }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Give Coderhelm read-only access" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open AWS CloudShell/ })).toHaveAttribute("href", "https://console.aws.amazon.com/cloudshell/home");
  await expect(page.getByRole("link", { name: /Open AWS CloudShell/ })).toHaveAttribute("target", "_blank");
  await expect(page.getByRole("button", { name: "Copy script" })).toBeVisible();
  await expect(page.getByLabel("Setup script")).toContainText("coderhelm_setup");
  await expect(page.getByText(/lists your PostgreSQL databases first/)).toBeVisible();
  await expect(page.getByText(/Then it lists your Redshift warehouses/)).toBeVisible();
  await page.getByText("What does this script do?").click();
  await expect(page.getByText("creates a database user called coderhelm_readonly that can read every table and change none")).toBeVisible();

  const field = page.getByLabel("The line from CloudShell");
  await field.fill("arn:aws:iam::123");
  await expect(page.getByText("That isn't the line from the script.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await field.fill(DB_CODE);
  await shot(page, "connect-aws-db-access");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Check and connect" })).toBeVisible();
  expect(callsTo(db, "POST", /\/aws\/connect$/)[0].body).toEqual({ code: DB_CODE });
  await expect(page.getByRole("definition").filter({ hasText: /^orders$/ })).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: /^orders-db$/ })).toBeVisible();
  await page.getByRole("button", { name: "Check and connect" }).click();

  const checks = page.getByRole("list", { name: "Checks for this database" });
  const failed = checks.locator('li[data-state="failed"]');
  await expect(failed).toContainText("The database user can only read");
  await expect(failed).toContainText("app_admin can change 12 tables.");
  await expect(failed).toContainText("What to do: Run the setup script and choose this database: it creates a user that can only read.");
  await expect(checks.locator('li[data-state="pending"]', { hasText: "Read the list of tables" })).toBeVisible();
  await expect(page.getByText("The connection checks didn't pass. Nothing was saved.")).toBeVisible();
  await shot(page, "connect-aws-db-not-read-only");

  db.dbWritable = false;
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Choose what Coderhelm may use" })).toBeVisible();
  expect(page.url()).toContain("id=ds_db");
  expect(callsTo(db, "POST", /\/api\/data-sources\/database$/).at(-1)!.body).toEqual({ code: DB_CODE, engine: "postgres" });
  await expect(page.getByRole("list", { name: "Hidden column names" })).toBeVisible();
  await expect(page.getByText("a lookup that asks for one, or filters or sorts by one, is refused")).toBeVisible();
});

test("try a database: a SELECT shows rows and hidden values, a write is refused", async ({ page }) => {
  const db = await mockApi(page, { sources: [awsSource("database")] });
  await page.goto("/data-sources/connect?step=try&id=ds_db");

  await expect(page.locator('li[aria-current="step"]')).toContainText("Try it");
  await expect(page.getByLabel("One SQL SELECT")).toBeVisible();
  await page.getByRole("button", { name: "Look at a few rows of orders" }).click();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText('"status": "shipped"')).toBeVisible();
  await expect(page.getByText("3 rows")).toBeVisible();
  await expect(page.getByText("2 values hidden")).toBeVisible();
  expect(callsTo(db, "POST", /\/try$/)[0].body).toEqual({ query: "SELECT * FROM orders LIMIT 5" });
  await shot(page, "connect-4-try-database");

  await page.getByRole("button", { name: "Try a write, to see it refused" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Refused" })).toContainText("Only a single SELECT is allowed.");
  expect(callsTo(db, "POST", /\/try$/)[1].body).toEqual({ query: "DELETE FROM coderhelm_example" });

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Check before you turn it on" })).toBeVisible();
  await expect(page.getByText(/one SELECT, run as a database user that can only read, inside a transaction that is always rolled back/)).toBeVisible();
  await expect(page.getByText("No passwords, and not your data.", { exact: false })).toBeVisible();
});

test("try logs: the search names its log group and time range", async ({ page }) => {
  const db = await mockApi(page, { sources: [awsSource("logs")] });
  await page.goto("/data-sources/connect?step=try&id=ds_logs");

  await expect(page.getByRole("button", { name: "Try a write, to see it refused" })).toHaveCount(0);
  await page.getByRole("button", { name: "Errors in the last day" }).click();
  await expect(page.getByRole("button", { name: "Last day", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Log group").selectOption("/ecs/worker");
  await page.getByRole("button", { name: "Last 7 days" }).click();
  await page.getByRole("button", { name: "Run", exact: true }).click();

  await expect(page.getByText("ERROR order 1042 failed: timeout")).toBeVisible();
  await expect(page.getByText("2 lines, 3.2 MB scanned")).toBeVisible();
  await expect(page.getByText("In /ecs/worker")).toBeVisible();
  expect(callsTo(db, "POST", /\/try$/)[0].body).toEqual({
    query: "fields @timestamp, @message | filter @message like /error/", log_groups: ["/ecs/worker"], since: "7d",
  });
  await expect(page.getByText("Nothing was changed. This search is in your activity log.")).toBeVisible();
  await shot(page, "connect-4-try-logs");

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Search more than two weeks at a time")).toBeVisible();
  await expect(page.getByText("/ecs/api, /ecs/worker")).toBeVisible();
});

// ── Activity feed ────────────────────────────────────────────────

function lookup(i: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    at: new Date(Date.now() - i * 60_000).toISOString(), cursor: `DSLOG#${String(1000 - i).padStart(4, "0")}`,
    source_id: "ds_db", source_name: "orders-db database", actor: "planner", repo: "your-team/backend", pr: 40 + i,
    summary: `SELECT id, status FROM orders WHERE id = ${i}`, query: `SELECT id, status\nFROM orders\nWHERE id = ${i}`,
    detail: "1 rows", ok: true, outcome: "ok", ms: 120, ...over,
  };
}

test("activity: follows new lookups live, and pausing stops it", async ({ page }) => {
  await page.clock.install();
  const db = await mockApi(page, { sources: [awsSource("database", { enabled: true, setup_complete: true })], events: [lookup(1)] });
  await page.goto("/data-sources");
  const activity = page.locator("#activity");
  await expect(activity.getByText("Following live")).toBeVisible();
  await expect(activity.getByTestId("activity-row")).toHaveCount(1);

  db.events.unshift(lookup(0, { actor: "reviewer", summary: "Checked a new column exists", cursor: "DSLOG#9999" }));
  await page.clock.fastForward(10_500);
  await expect(activity.getByText("Checked a new column exists")).toBeVisible();
  await expect(activity.getByTestId("activity-row").first()).toContainText("Checked a new column exists");

  await activity.getByRole("button", { name: "Pause" }).click();
  await expect(activity.getByText("Paused", { exact: true })).toBeVisible();
  db.events.unshift(lookup(0, { summary: "Searched the logs for a timeout", cursor: "DSLOG#9998", source_id: "ds_logs", source_name: "Logs" }));
  await page.clock.fastForward(30_000);
  await expect(activity.getByText("Searched the logs for a timeout")).toHaveCount(0);
  await activity.getByRole("button", { name: "Resume" }).click();
  await page.clock.fastForward(10_500);
  await expect(activity.getByText("Searched the logs for a timeout")).toBeVisible();
});

test("activity: filters, and a row opens to the full lookup and its pull request", async ({ page }) => {
  await mockApi(page, {
    sources: [awsSource("database", { enabled: true, setup_complete: true }), awsSource("logs", { enabled: true, setup_complete: true })],
    events: [
      lookup(1),
      lookup(2, { actor: "reviewer", source_id: "ds_logs", source_name: `Logs in AWS account ${ACCOUNT}`, summary: "fields @message | filter @message like /timeout/", query: "fields @message | filter @message like /timeout/", detail: "40 lines from /ecs/api" }),
      lookup(3, { actor: "admin@example.com", repo: undefined, pr: undefined, summary: "DELETE FROM orders", query: "DELETE FROM orders", outcome: "refused", ok: false, detail: "That lookup would change something or is not a query." }),
    ],
  });
  await page.goto("/data-sources");
  const activity = page.locator("#activity");
  await expect(activity.getByTestId("activity-row")).toHaveCount(3);

  await activity.getByLabel("Who").selectOption("reviewer");
  await expect(activity.getByTestId("activity-row")).toHaveCount(1);
  await expect(activity.getByText("40 lines from /ecs/api")).toBeVisible();
  await activity.getByLabel("Who").selectOption("people");
  await expect(activity.getByTestId("activity-row")).toHaveCount(1);
  await expect(activity.getByText("That lookup would change something or is not a query.")).toBeVisible();
  await activity.getByLabel("Who").selectOption("all");
  await activity.getByLabel("Result").selectOption("refused");
  await expect(activity.getByTestId("activity-row")).toHaveCount(1);
  await activity.getByLabel("Result").selectOption("all");
  await activity.getByLabel("Source").selectOption({ label: "orders-db database" });
  await expect(activity.getByTestId("activity-row")).toHaveCount(2);
  await activity.getByLabel("Source").selectOption("all");

  const row = activity.getByTestId("activity-row").first();
  await row.getByRole("button").first().click();
  await expect(row.getByRole("button").first()).toHaveAttribute("aria-expanded", "true");
  await expect(row.locator("pre")).toHaveText("SELECT id, status\nFROM orders\nWHERE id = 1");
  await expect(row.getByRole("button", { name: "Copy" })).toBeVisible();
  await expect(row.getByRole("link", { name: "Open your-team/backend #41 on GitHub" })).toHaveAttribute("href", "https://github.com/your-team/backend/pull/41");
  await shot(page, "activity-feed-open");
});

test("activity: older lookups load page by page, on the full activity page too", async ({ page }) => {
  const events = Array.from({ length: 120 }, (_, i) => lookup(i + 1));
  await mockApi(page, { sources: [awsSource("database", { enabled: true, setup_complete: true })], events });
  await page.goto("/data-sources");
  const activity = page.locator("#activity");
  await expect(activity.getByTestId("activity-row")).toHaveCount(50);
  await activity.getByRole("button", { name: "Load older" }).click();
  await expect(activity.getByTestId("activity-row")).toHaveCount(100);
  await activity.getByRole("button", { name: "Load older" }).click();
  await expect(activity.getByTestId("activity-row")).toHaveCount(120);
  await expect(activity.getByRole("button", { name: "Load older" })).toHaveCount(0);

  await activity.getByRole("link", { name: "Open the full activity log" }).click();
  await expect(page.getByRole("heading", { name: "Every lookup, as it happens" })).toBeVisible();
  await expect(page.locator("#activity").getByTestId("activity-row")).toHaveCount(100);
  await shot(page, "activity-page");
});

test("activity: an older server without cursors still lists lookups, with no paging", async ({ page }) => {
  const events = Array.from({ length: 3 }, (_, i) => {
    const e = lookup(i + 1);
    delete e.cursor;
    delete e.query;
    return e;
  });
  await mockApi(page, { sources: [], events });
  await page.goto("/data-sources");
  const activity = page.locator("#activity");
  await expect(activity.getByTestId("activity-row")).toHaveCount(3);
  await expect(activity.getByRole("button", { name: "Load older" })).toHaveCount(0);
  const row = activity.getByTestId("activity-row").first();
  await row.getByRole("button").first().click();
  await expect(row.locator("pre")).toHaveText("SELECT id, status FROM orders WHERE id = 1");
});

test("connect a warehouse and a database from one pasted line", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/data-sources/connect/aws?for=database");
  await page.getByText("What does this script do?").click();
  await expect(page.getByText(/creates a warehouse user called coderhelm_readonly with no password/)).toBeVisible();
  await page.getByLabel("The line from CloudShell").fill(BOTH_CODE);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Check and connect" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "PostgreSQL database" })).toBeVisible();
  const wh = page.getByRole("region", { name: "Redshift warehouse" });
  await expect(wh.getByRole("definition").filter({ hasText: /^analytics-dw$/ })).toBeVisible();
  await expect(wh.getByRole("definition").filter({ hasText: /^dev, marts$/ })).toBeVisible();
  await shot(page, "connect-aws-warehouse-pick");

  await page.getByRole("button", { name: "Check and connect the warehouse" }).click();
  expect(callsTo(db, "POST", /\/api\/data-sources\/database$/)[0].body).toEqual({ code: BOTH_CODE, engine: "redshift" });
  // The database from the same line is still on offer.
  await expect(page.getByText("One source is connected")).toBeVisible();
  await expect(page.getByRole("button", { name: "Check and connect the database" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check and connect the warehouse" })).toHaveCount(0);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Choose what Coderhelm may use" })).toBeVisible();
  expect(page.url()).toContain("id=ds_wh");
});

test("try a warehouse: pick a database, samples set it, and it is sent", async ({ page }) => {
  const db = await mockApi(page, { sources: [warehouseSource()] });
  await page.goto("/data-sources");
  const card = page.getByRole("article", { name: "analytics-dw warehouse" });
  await expect(card).toContainText("Redshift warehouse");
  await expect(card).toContainText("analytics-dw / dev, marts");
  await expect(card).toContainText("18 tables in 2 databases");

  await page.goto("/data-sources/connect?step=try&id=ds_wh");
  const select = page.getByLabel("Database");
  await expect(select).toHaveValue("dev");
  await page.getByRole("button", { name: "Count rows in marts.daily (database marts)" }).click();
  await expect(select).toHaveValue("marts");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText("1 row in marts")).toBeVisible();
  expect(callsTo(db, "POST", /\/try$/)[0].body).toEqual({ query: "SELECT count(*) FROM marts.daily", database: "marts" });
  await shot(page, "connect-4-try-warehouse");

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/run as a warehouse user with no password that can only read/)).toBeVisible();
  await expect(page.getByText(/Read databases you didn't share \(it may read 2 databases\)/)).toBeVisible();
  await expect(page.getByText(/rolled back/)).toHaveCount(0);
});
