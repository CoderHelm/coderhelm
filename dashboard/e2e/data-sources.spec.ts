import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Every API call is answered here. Nothing reaches a real backend.

const API_URL = "https://api.yourcompany.com/graphql";
const GOOD_KEY = "key_readonly_example_9x2k";
const REFUSAL = "This lookup would change data, so it was refused before it left Coderhelm. Ask for something to read instead.";
const KEY_REJECTED = "The new key was not accepted. The old key is still in place.";
const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

interface Source {
  id: string; kind: "api"; name: string; url: string; status: "ready" | "error"; status_message?: string;
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
}

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
  const db: Backend = { sources: [], events: [], calls: [], rejectKey: false, ...init };
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
    if (p === "/api/data-sources/activity") return json(route, { events: db.events });
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
        if (db.rejectKey) return json(route, { error: KEY_REJECTED, ok: false, checks: REJECTED_CHECKS }, 400);
        source.key_hint = String(body?.key).slice(-4);
        return json(route, { source, checks: PASSED_CHECKS });
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
  await expect(page.getByText("Coming next")).toHaveCount(2);
  await expect(page.getByRole("link", { name: /A database/ })).toHaveCount(0);
  await expect(page.getByText("No lookups yet. They appear here the moment the reviewer or a teammate runs one.")).toBeVisible();
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
  await expect(page.getByRole("heading", { level: 1, name: "Paste a key the reviewer can use" })).toBeVisible();
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
  await expect(page.getByRole("heading", { level: 1, name: "Choose what the reviewer may use" })).toBeVisible();
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
  await expect(page.getByRole("heading", { level: 1, name: "Run a lookup the way the reviewer would" })).toBeVisible();
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
  for (const k of ["Connected", "The reviewer can", "The reviewer cannot", "We store", "Turning it off"]) {
    await expect(page.getByRole("term").filter({ hasText: new RegExp(`^${k}$`) })).toBeVisible();
  }
  await expect(page.getByText("your-team/backend")).toBeVisible();
  await shot(page, "connect-5-review");
  await page.getByRole("button", { name: "Turn on fact-checking" }).click();

  // Done
  await expect(page.getByRole("heading", { level: 1, name: "Fact-checking is on" })).toBeVisible();
  await expect(page.getByText("The next review will use it.")).toBeVisible();
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

  const heading = page.getByRole("heading", { level: 1, name: "Paste a key the reviewer can use" });
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
  await expect(page.locator('li[aria-current="step"]')).toContainText("Choose what the reviewer may use");
  await shot(page, "hub-unfinished");
  await card.getByRole("link", { name: "Continue setup" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Choose what the reviewer may use" })).toBeVisible();
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

test("hub: editing what the reviewer can't see sends the new list", async ({ page }) => {
  const db = await mockApi(page, { sources: [makeSource({ enabled: true, setup_complete: true, hidden_fields: ["password", "token"] })] });
  await page.goto("/data-sources");
  const card = page.getByRole("article", { name: "api.yourcompany.com" });

  await card.getByRole("button", { name: "What the reviewer can't see" }).click();
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

test("a source in error status says the reviewer is not using it, and activity explains refusals", async ({ page }) => {
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
  await expect(card.getByText("The reviewer is not using this source until the problem is fixed.")).toBeVisible();
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
  await expect(card.getByText("The reviewer is not using this source until the problem is fixed.")).toHaveCount(0);
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
