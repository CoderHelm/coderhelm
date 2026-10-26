import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The API keys page: list, create (the key is shown once), revoke, and who
// may open it. Every API call is answered here.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const TOKEN = "chk_01jbnew0000000000000000000_Zx3vQ9mK2pL7wR4tY8uB1nC6dF0gH5jA9sE2rT7yU4i";

interface Key {
  id: string;
  name: string;
  hint: string;
  scopes: string[];
  rate_limit_per_minute: number;
  created_at: string;
  created_by: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  status: string;
}

const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString();

function key(id: string, name: string, over: Partial<Key> = {}): Key {
  return {
    id, name, hint: `chk_${id.slice(0, 6)}...ab12`, scopes: ["view", "runs"], rate_limit_per_minute: 600,
    created_at: iso(60 * 24 * 3), created_by: "admin@example.com", expires_at: null, last_used_at: iso(12),
    revoked_at: null, revoked_by: null, status: "active", ...over,
  };
}

interface Db {
  keys: Key[];
  calls: { method: string; path: string; body: Record<string, unknown> | null }[];
  me: Record<string, unknown>;
}

async function mockApi(page: Page, me: Record<string, unknown> = { role: "admin" }): Promise<Db> {
  const db: Db = {
    keys: [key("01jb8x6f4m2c9qz3t7v5w1k0ha", "Deploy pipeline"), key("01jb8w0000000000000000000a", "Old script", { status: "revoked", revoked_at: iso(60), revoked_by: "admin@example.com" })],
    calls: [],
    me,
  };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    let body: Record<string, unknown> | null = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    db.calls.push({ method, path: p, body });
    if (p === "/api/me") return json(route, { user_id: "u1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", ...db.me });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme-labs", status: "active", current: true }] });
    if (p === "/api/api-keys" && method === "GET") {
      return json(route, {
        keys: db.keys,
        scopes: [
          { key: "view", label: "See and search runs, plans, reviews, analytics, repos, tests and settings", always: true, allowed: true },
          { key: "plans", label: "Create, edit, approve and run plans and templates", always: false, allowed: true },
          { key: "runs", label: "Retry, re-run, re-review, cancel, close or reopen runs", always: false, allowed: db.me.role !== "custom" },
        ],
        limits: { default_rate_per_minute: 600, min_rate_per_minute: 10, max_rate_per_minute: 3000, max_expiry_days: 365, max_keys: 50 },
      });
    }
    if (p === "/api/api-keys" && method === "POST") {
      const made = key("01jbnew0000000000000000000", String(body?.name), {
        scopes: ["view", ...((body?.scopes as string[]) ?? [])],
        rate_limit_per_minute: Number(body?.rate_limit_per_minute),
        expires_at: body?.expires_in_days ? iso(-60 * 24 * Number(body.expires_in_days)) : null,
        last_used_at: null,
      });
      db.keys.unshift(made);
      return json(route, { key: made, token: TOKEN });
    }
    if (p.startsWith("/api/api-keys/") && method === "DELETE") {
      const id = p.split("/").pop();
      db.keys = db.keys.map((k) => (k.id === id ? { ...k, status: "revoked", revoked_at: iso(0), revoked_by: "admin@example.com" } : k));
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

test("an admin sees the team's keys, live and revoked, without any secret", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/api-keys/");
  await expect(page.getByRole("heading", { level: 1, name: "API keys" })).toBeVisible();
  const live = page.getByRole("list", { name: "Active keys" });
  await expect(live.getByTestId("api-key")).toHaveCount(1);
  await expect(live.getByText("Deploy pipeline")).toBeVisible();
  await expect(live.getByText("chk_01jb8x...ab12")).toBeVisible();
  await expect(live.getByText("600 requests a minute")).toBeVisible();
  // Revoked and expired keys are folded away under one line with their count.
  await expect(page.getByRole("list", { name: "Revoked and expired keys" })).toBeHidden();
  await page.getByTestId("past-keys").locator("summary").click();
  const past = page.getByRole("list", { name: "Revoked and expired keys" });
  await expect(past.getByText("Old script")).toBeVisible();
  await expect(past.getByRole("button", { name: "Revoke" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Read the API reference" })).toHaveAttribute("href", "https://docs.coderhelm.com/api");
  await shot(page, "api-keys.png");
});

test("creating a key sends its scopes, expiry and rate limit, and shows the key once", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const db = await mockApi(page);
  await page.goto("/settings/api-keys/");
  await page.getByRole("button", { name: "Create key" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create an API key" });
  await expect(dialog).toBeVisible();
  // `view` is on every key and can't be turned off.
  await expect(dialog.getByRole("checkbox", { name: /^view / })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /^view / })).toBeDisabled();

  await dialog.getByRole("button", { name: "Create key" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Give the key a name");

  await dialog.getByLabel("Name").fill("Nightly report");
  await dialog.getByRole("checkbox", { name: /^plans / }).check();
  await dialog.getByLabel("Expires after").selectOption("30");
  await dialog.getByLabel("Requests a minute").fill("120");
  await dialog.getByRole("button", { name: "Create key" }).click();

  const post = db.calls.find((c) => c.method === "POST" && c.path === "/api/api-keys");
  expect(post?.body).toEqual({ name: "Nightly report", scopes: ["plans"], expires_in_days: 30, rate_limit_per_minute: 120 });

  const ready = page.getByRole("dialog", { name: 'Key "Nightly report" is ready' });
  await expect(ready.getByText("This is the only time the key is shown")).toBeVisible();
  await expect(ready.getByTestId("new-api-key")).toHaveText(TOKEN);
  await ready.getByRole("button", { name: "Copy key" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(TOKEN);
  await shot(page, "api-keys-created.png");

  // Once closed, the key is gone from the page; only its hint stays.
  await ready.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText(TOKEN)).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Active keys" }).getByText("Nightly report")).toBeVisible();
});

test("a rate limit out of range is refused before anything is sent", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/api-keys/");
  await page.getByRole("button", { name: "Create key" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create an API key" });
  await dialog.getByLabel("Name").fill("Too fast");
  await dialog.getByLabel("Requests a minute").fill("5");
  await dialog.getByRole("button", { name: "Create key" }).click();
  await expect(dialog.getByRole("alert")).toContainText("from 10 to 3000");
  expect(db.calls.some((c) => c.method === "POST")).toBe(false);
});

test("a scope the person's own role lacks can't be given", async ({ page }) => {
  await mockApi(page, { role: "custom", capabilities: ["view", "view_team", "own_account", "api_keys", "plans"], custom_role: { id: "r1", name: "Key keeper" } });
  await page.goto("/settings/api-keys/");
  await page.getByRole("button", { name: "Create key" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create an API key" });
  await expect(dialog.getByRole("checkbox", { name: /^runs / })).toBeDisabled();
  await expect(dialog.getByText("(your role doesn't include this)")).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /^plans / })).toBeEnabled();
});

test("revoking asks first, then the key moves to revoked", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/api-keys/");
  await page.getByRole("list", { name: "Active keys" }).getByRole("button", { name: "Revoke" }).click();
  const confirm = page.getByRole("alertdialog").filter({ hasText: 'Revoke "Deploy pipeline"?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Revoke key" }).click();
  await expect.poll(() => db.calls.some((c) => c.method === "DELETE" && c.path === "/api/api-keys/01jb8x6f4m2c9qz3t7v5w1k0ha")).toBe(true);
  await page.getByTestId("past-keys").locator("summary").click();
  await expect(page.getByRole("list", { name: "Revoked and expired keys" }).getByText("Deploy pipeline")).toBeVisible();
  await expect(page.getByText("No active keys.")).toBeVisible();
});

test("a member can't open the page and isn't offered it", async ({ page }) => {
  const db = await mockApi(page, { role: "member" });
  await page.goto("/settings/api-keys/");
  await expect(page.getByText("This page needs a different role")).toBeVisible();
  expect(db.calls.some((c) => c.path === "/api/api-keys")).toBe(false);
  await page.goto("/settings/");
  await expect(page.getByRole("main").locator('a[href^="/settings/api-keys"]')).toHaveCount(0);
});

test.describe("at 390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("the page and the new-key dialog fit a phone", async ({ page }) => {
    await mockApi(page);
    await page.goto("/settings/api-keys/");
    await expect(page.getByRole("list", { name: "Active keys" })).toBeVisible();
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(wide).toBeLessThanOrEqual(0);
    await shot(page, "api-keys-390.png");
  });
});
