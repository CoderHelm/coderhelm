import { expect, test, type Page, type Route } from "@playwright/test";
import { LIMITS, baseJson, iso, mockKnowledge, newBackend, source, type Backend, type Src } from "./knowledge-page-data";

// A big connected source on the knowledge base page: its row counts what is
// searchable while it syncs (never the limit as the total), its button and
// the base's status say the same, a large first sync waits for an admin with
// its embedding estimate, a source past its limit says so plainly with a way
// to raise it, a sync stopped by the monthly token limit links to it, and the
// team's Sync limits are changed by admins and only read by everyone else.
// Every API call is answered here; nothing reaches a real backend.

type Extra = Record<string, unknown>;

const sanity = (over: Extra): Src =>
  source({
    id: "src_big",
    kind: "sanity",
    label: "Sanity",
    name: "Acme Sanity: production, staging +2",
    selection: [{ id: "dataset:abc123:production", title: "production", kind: "dataset", path: ["Acme"], include_children: true }],
    options: {},
    via: "sign_in",
    account: "abc123",
    failed_items: 0,
    items: 0,
    ...over,
  } as Partial<Src>);

interface Opts {
  role?: string;
  approveError?: string;
}

interface Db extends Backend {
  settings: Record<string, unknown>;
}

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function setup(page: Page, sources: Src[], opts: Opts = {}): Promise<Db> {
  const db = newBackend("healthy", opts.role ?? "admin") as Db;
  db.sources = sources;
  db.settings = {
    items_per_source: 50_000,
    default_items_per_source: 50_000,
    min_items_per_source: 1_000,
    max_items_per_source: 100_000,
    items_per_base: 100_000,
    large_sync_items: 2_000,
    embedding: { model: "amazon.titan-embed-text-v2:0", usd_per_million_tokens: 0.02, tokens_per_item: 800 },
    token_budget: { limit: 50_000_000, used: 8_000_000, left: 42_000_000 },
    can_edit: db.role === "admin" || db.role === "owner",
    updated_at: iso(60 * 24),
    updated_by: "ada@example.com",
  };
  const limits = { ...LIMITS, max_items_per_source: 50_000, max_items_per_import: 50_000, default_items_per_source: 50_000, items_per_base: 100_000 };
  await mockKnowledge(page, db, (p, method, url, route) => {
    const admin = db.role === "admin" || db.role === "owner";
    if (p === "/api/knowledge/settings" && method === "GET") return json(route, db.settings).then(() => true);
    if (p === "/api/knowledge/settings" && method === "PUT") {
      if (!admin) return json(route, { error: "Only admins and owners can change this." }, 403).then(() => true);
      const n = Number((JSON.parse(route.request().postData() || "{}") as { items_per_source?: number }).items_per_source);
      if (!Number.isInteger(n) || n < 1_000 || n > 100_000) return json(route, { error: "Pick a number from 1,000 to 100,000." }, 400).then(() => true);
      db.settings = { ...db.settings, items_per_source: n };
      return json(route, db.settings).then(() => true);
    }
    if (p === "/api/knowledge" && method === "GET") return json(route, { bases: [baseJson(db)], can_manage: admin, limits }).then(() => true);
    // The page's own limits carry the team's setting and the base's cap.
    if (p === "/api/knowledge/kb_dw" && method === "GET") {
      return json(route, {
        base: baseJson(db),
        ...(url.searchParams.get("items") === "none" ? {} : { files: db.items }),
        sources: db.sources,
        can_manage: admin,
        limits,
        visibility_note: "Everyone who can read this knowledge base can read what you add.",
      }).then(() => true);
    }
    const approve = p.match(/^\/api\/knowledge\/kb_dw\/sources\/([^/]+)\/approve$/);
    if (approve && method === "POST") {
      if (opts.approveError) return json(route, { error: opts.approveError }, 400).then(() => true);
      const s = db.sources.find((x) => x.id === approve[1])!;
      Object.assign(s, { status: "syncing", progress: { phase: "listing", done: 0, total: 0 } });
      return json(route, { source: s }).then(() => true);
    }
    return false;
  });
  return db;
}

/** A source's row, found by its name. */
const row = (page: Page, name: string) => page.getByTestId("source-card").filter({ has: page.locator(`[title="${name}"]`) });

test.describe("a big source on the knowledge base page", () => {
  test("a first sync counts what is searchable of the real total, and the button and status say the same", async ({ page }) => {
    const db = await setup(page, [sanity({ name: "First sync", status: "syncing", items: 265, total: 4_812, listed: 4_812, last_success_at: "", progress: { phase: "fetching", done: 300, total: 4_812 } })]);
    // The base holds what the sync brought in so far, as the server counts it.
    const one = db.items.find((i) => i.status === "ready")!;
    db.items = Array.from({ length: 265 }, (_, n) => ({ ...one, id: `big_${n}`, name: `Article ${n}`, source_id: "src_big", skipped: "", truncated: false }));
    await page.goto("/knowledge/base/?id=kb_dw");
    await expect(page.getByTestId("tile-pages")).toContainText("265");
    const r = row(page, "First sync");
    await expect(r.getByTestId("connection-meta")).toContainText("265 documents");
    await expect(r.getByTestId("source-health")).toHaveText("Syncing (265 of 4,812)");
    await expect(r.getByTestId("source-sync")).toBeDisabled();
    await expect(r.getByTestId("source-sync")).toHaveText("Syncing (265 of 4,812)");
    await expect(r.getByRole("progressbar")).toBeVisible();
    await expect(page.getByTestId("base-status")).toHaveText("Syncing (265 of 4,812)");
    await expect(page.getByTestId("tile-first-sync")).toHaveText("Syncing (265 of 4,812)");
    // Never the progress against the limit, never "0 documents".
    await expect(page.getByTestId("tiles")).not.toContainText("of 300");
    await expect(r).not.toContainText("0 documents");
  });

  test("a later sync counts the changes it brings in; a slow down continues by itself; no numbers says so", async ({ page }) => {
    await setup(page, [
      sanity({ id: "s1", name: "Changes", status: "syncing", items: 4_812, total: 4_812, listed: 4_812, progress: { phase: "fetching", done: 3, total: 12 } }),
      sanity({ id: "s2", name: "Waiting", status: "syncing", items: 900, total: 4_812, listed: 4_812, last_success_at: "", progress: { phase: "waiting", done: 0, total: 0 } }),
      sanity({ id: "s3", name: "No numbers", status: "syncing", items: 0, total: null, listed: 0, last_success_at: "", progress: { phase: "listing", done: 0, total: 0 } }),
    ]);
    await page.goto("/knowledge/base/?id=kb_dw");
    const changes = row(page, "Changes");
    await expect(changes.getByTestId("source-health")).toHaveText("Bringing in 3 of 12 changes");
    await expect(changes.getByTestId("source-sync")).toHaveText("Syncing (3 of 12)");
    await expect(changes.getByTestId("connection-meta")).toContainText("4,812 documents");
    const wait = row(page, "Waiting");
    await expect(wait.getByTestId("source-health")).toHaveText("Sanity asked us to slow down. Continuing in a moment.");
    await expect(wait.getByTestId("source-sync")).toHaveText("Syncing (900 of 4,812)");
    const none = row(page, "No numbers");
    await expect(none.getByTestId("source-health")).toHaveText("Getting started");
    await expect(none.getByTestId("source-sync")).toHaveText("Syncing…");
  });

  test("a large first sync shows its estimate and starts when an admin says so", async ({ page }) => {
    const db = await setup(page, [
      sanity({ name: "Big", status: "approval", items: 0, total: 4_812, listed: 4_812, last_success_at: "", estimate: { items: 4_812, tokens: 3_900_000, usd: 0.08, token_left: 42_000_000 } }),
    ]);
    await page.goto("/knowledge/base/?id=kb_dw");
    const r = row(page, "Big");
    await expect(r.getByTestId("source-health")).toHaveText(
      "About 4,812 documents to embed: about 3.9M tokens (about $0.08). This counts against your team's monthly token limit. 42M tokens are left this month.",
    );
    await r.getByTestId("source-approve").click();
    await expect.poll(() => db.calls.includes("POST /api/knowledge/kb_dw/sources/src_big/approve")).toBe(true);
    await expect(r.getByTestId("source-sync")).toBeDisabled();
  });

  test("a refused start says why", async ({ page }) => {
    await setup(page, [sanity({ name: "Big", status: "approval", total: 90_000, last_success_at: "", estimate: { items: 90_000, tokens: 72_000_000, usd: 1.44, token_left: 1_000_000 } })], {
      approveError: "This sync needs about 72M tokens; 1M are left this month. Raise the monthly limit or lower the item limit.",
    });
    await page.goto("/knowledge/base/?id=kb_dw");
    await row(page, "Big").getByTestId("source-approve").click();
    await expect(page.getByText("This sync needs about 72M tokens; 1M are left this month.")).toBeVisible();
  });

  test("a source past its limit says so plainly, with a way to raise it", async ({ page }) => {
    const db = await setup(page, [
      sanity({ id: "s1", name: "Over", items: 50_000, total: 63_210, listed: 50_000, item_limit: 50_000, truncated: true, limit_reason: "source" }),
      source({ id: "s2", name: "Base full", items: 20_000, total: null, listed: 20_000, item_limit: 20_000, truncated: true, limit_reason: "base" } as Partial<Src>),
    ]);
    await page.goto("/knowledge/base/?id=kb_dw");
    await expect(row(page, "Over").getByTestId("source-truncated")).toContainText("Holds 50,000 of 63,210 documents; the rest aren't searchable. That is your team's limit per source.");
    await expect(row(page, "Base full").getByTestId("source-truncated")).toContainText(
      "Holds 20,000 pages; there are more than 20,000, and the rest aren't searchable. This knowledge base is at its own cap of 100,000 synced items across its sources.",
    );
    await row(page, "Over").getByTestId("source-raise-limit").click();
    const dialog = page.getByTestId("sync-limits");
    await expect(dialog.getByTestId("items-per-source")).toHaveValue("50000");
    await dialog.getByTestId("items-per-source").fill("80000");
    await dialog.getByTestId("sync-limits-save").click();
    await expect.poll(() => db.bodies.some((b) => b.items_per_source === 80_000)).toBe(true);
    await expect(page.getByText("Saved. Each source keeps up to 80,000 items.")).toBeVisible();
  });

  test("a sync stopped by the monthly token limit says what to do and links to it", async ({ page }) => {
    await setup(page, [
      sanity({
        name: "Capped",
        status: "error",
        items: 1_200,
        error: { message: "Your team's monthly token limit is reached.", fix: "Raise the monthly token limit, or wait for next month. What's indexed stays searchable.", action: "budget", at: iso(3) },
      }),
    ]);
    await page.goto("/knowledge/base/?id=kb_dw");
    const r = row(page, "Capped");
    await expect(r.getByTestId("source-health")).toHaveText("Raise the monthly token limit, or wait for next month. What's indexed stays searchable.");
    await expect(r.getByTestId("source-fix")).toHaveCount(0);
    await expect(r.getByTestId("source-budget")).toHaveAttribute("href", /\/settings\/budget\/?$/);
    await expect(r.getByTestId("connection-meta")).toContainText("1,200 documents");
  });
});

test.describe("Sync limits", () => {
  test("admins see the cost of a full source and can only save a number in range", async ({ page }) => {
    const db = await setup(page, [sanity({ name: "Fine", items: 10 })]);
    await page.goto("/knowledge/");
    await page.getByTestId("sync-limits-open").click();
    const dialog = page.getByTestId("sync-limits");
    const input = dialog.getByTestId("items-per-source");
    await expect(input).toHaveValue("50000");
    await expect(dialog.getByTestId("sync-limits-estimate")).toContainText("A full source of 50,000 items takes about 40M tokens to embed the first time (about $0.80).");
    await expect(dialog.getByTestId("sync-limits-estimate")).toContainText("42M of 50M tokens are left this month.");
    await input.fill("500");
    await expect(dialog.getByTestId("items-per-source-error")).toHaveText("Pick a number from 1,000 to 100,000.");
    await expect(dialog.getByTestId("sync-limits-save")).toBeDisabled();
    await input.fill("abc");
    await expect(dialog.getByTestId("items-per-source-error")).toHaveText("Enter a whole number.");
    await input.fill("20,000");
    await expect(dialog.getByTestId("sync-limits-estimate")).toContainText("A full source of 20,000 items takes about 16M tokens");
    await dialog.getByTestId("sync-limits-save").click();
    await expect.poll(() => db.bodies.some((b) => b.items_per_source === 20_000)).toBe(true);
    await expect(dialog).toBeHidden();
  });

  test("everyone else reads the limit and can't change it", async ({ page }) => {
    const db = await setup(page, [sanity({ name: "Fine", items: 10 })], { role: "member" });
    await page.goto("/knowledge/");
    await page.getByTestId("sync-limits-open").click();
    const dialog = page.getByTestId("sync-limits");
    await expect(dialog.getByTestId("items-per-source-value")).toHaveText("50,000");
    await expect(dialog.getByTestId("items-per-source")).toHaveCount(0);
    await expect(dialog.getByTestId("sync-limits-save")).toHaveCount(0);
    await expect(dialog).toContainText("Admins and owners can change this.");
    expect(db.calls.filter((c) => c.startsWith("PUT /api/knowledge/settings"))).toHaveLength(0);
  });
});
