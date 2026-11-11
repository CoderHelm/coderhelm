import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { mockKnowledge, newBackend, source, type State } from "./knowledge-page-data";

// The knowledge base page: one status for the base, four tiles, a problems
// banner only when something is wrong, Connections (how each source
// connects, as whom, its scopes and token, live updates, what was picked,
// what happens when its person leaves, and switching connection), Content
// as a tree the gateway pages and filters, and Access. Every state the
// page designs for (healthy, first sync, an error, empty, connected in
// place) is drawn at desktop and phone widths. The poll while syncing reads
// only the sources, never every item.

const SHOTS = process.env.KB_SHOTS_DIR || path.join("test-results", "kb-shots");

async function noSideways(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(wide, "nothing scrolls sideways").toBeLessThanOrEqual(1);
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

test.describe("knowledge base page", () => {
  test("a healthy base: one status, tiles, connections in detail, the content tree and access", async ({ page }) => {
    const db = newBackend("healthy");
    await mockKnowledge(page, db);
    await page.goto("/knowledge/base/?id=kb_dw");
    await expect(page.getByRole("heading", { level: 1, name: "Data warehouse docs" })).toBeVisible();
    await expect(page.getByTestId("base-status")).toHaveText("Up to date");
    await expect(page.getByTestId("page-header").getByText("Source of truth", { exact: true })).toBeVisible();
    // The base is read without its items; the items come a page at a time.
    expect(db.calls).toContain("GET /api/knowledge/kb_dw?items=none");
    await expect.poll(() => db.calls.some((c) => c.startsWith("GET /api/knowledge/kb_dw/items"))).toBe(true);

    await expect(page.getByTestId("tile-pages")).toContainText("7");
    await expect(page.getByTestId("tile-pages")).toContainText("1 couldn't read");
    await expect(page.getByTestId("tile-pages")).toContainText("1 skipped");
    await expect(page.getByTestId("tile-passages")).toContainText("151");
    await expect(page.getByTestId("tile-fresh")).toContainText("live updates on for 1");
    await expect(page.getByTestId("problems")).toContainText("1 page couldn't be read");

    // Each row says how it connects without opening it.
    const rows = page.getByTestId("source-card");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Confluence · acme.atlassian.net · 412 pages · Team sign-in");
    await expect(rows.nth(1)).toContainText("Saved API token");
    await expect(rows.nth(2)).toContainText("Member sign-in");

    // Opened, a row tells the whole story to someone who manages it.
    await rows.nth(0).getByTestId("connection-toggle").click();
    const panel = rows.nth(0).getByTestId("connection-panel");
    await expect(panel.getByTestId("conn-how")).toContainText("The team's Confluence sign-in (OAuth)");
    await expect(panel.getByTestId("conn-whose")).toContainText("Connected by ada@example.com on");
    await expect(panel.getByTestId("conn-whose")).toContainText("as https://acme.atlassian.net");
    await expect(panel.getByTestId("conn-scopes")).toContainText("read:confluence-content.all");
    await expect(panel.getByTestId("conn-token")).toContainText("Working. It renews on its own");
    await expect(panel.getByTestId("conn-live")).toContainText("Off: Confluence doesn't send change events here, so it's checked every 1 h, next in 56 min.");
    await expect(panel.getByTestId("conn-picked")).toContainText("Data Warehouse, Analytics +1 · includes new pages inside");
    await expect(panel.getByTestId("conn-leaves")).toContainText("belongs to the team");
    await expect(panel.getByTestId("source-reconnect")).toBeVisible();
    await shot(page, "healthy-1280");

    // Change connection: to the saved API token.
    await panel.getByRole("button", { name: "Change connection" }).click();
    await page.getByRole("menuitem", { name: "Use the saved API token" }).click();
    await expect.poll(() => db.bodies.some((b) => b.via === "saved_key")).toBe(true);
    expect(db.calls).toContain("PUT /api/knowledge/kb_dw/sources/src_conf");

    // A Notion source with live updates says when the last change event came.
    await rows.nth(1).getByTestId("connection-toggle").click();
    await expect(rows.nth(1).getByTestId("conn-live")).toContainText("On: changes arrive within a minute (last change event 12 min ago). Full check every 6 h");
    await expect(rows.nth(1).getByRole("button", { name: "Change connection" })).toBeVisible();

    // A member's own sign-in says what happens when they leave.
    await rows.nth(2).getByTestId("connection-toggle").click();
    await expect(rows.nth(2).getByTestId("conn-how")).toContainText("Ada Lovelace's own Sanity sign-in");
    await expect(rows.nth(2).getByTestId("conn-leaves")).toContainText("any admin can sign in again");

    // Content: a tree by source, then space, then parent, states in words.
    const tree = page.getByTestId("items-tree");
    await expect(tree.getByTestId("tree-source")).toHaveCount(2);
    await expect(tree.getByTestId("tree-parent").first()).toBeVisible();
    await expect(tree.getByText("Couldn't read", { exact: true }).first()).toBeVisible();
    await expect(tree.getByText("Skipped", { exact: true })).toBeVisible();
    await expect(tree.getByText("Cut short", { exact: true })).toBeVisible();
    await expect(tree.getByRole("link", { name: /Backfills runbook/ })).toHaveAttribute("href", /atlassian\.net/);

    // The filters and the search are answered by the gateway.
    await page.getByTestId("filter-failed").click();
    await expect.poll(() => db.calls.some((c) => c.includes("/items?") && c.includes("status=failed"))).toBe(true);
    await expect(page.getByTestId("item-row")).toHaveCount(1);
    await page.getByTestId("filter-failed").click();
    await page.getByTestId("items-search").fill("tables orders");
    await expect.poll(() => db.calls.some((c) => c.includes("q=tables+orders"))).toBe(true);
    await expect(page.getByTestId("item-row")).toHaveCount(1);
    await expect(page.getByTestId("item-row")).toContainText("Orders table");

    // Access, last.
    await expect(page.getByTestId("searched-by")).toContainText("Chat, Coder, Reviewer");
    await expect(page.getByTestId("access")).toContainText("even if they can't open it in the app it comes from");
  });

  test("the problems banner's See them filters the content to what couldn't be read", async ({ page }) => {
    const db = newBackend("healthy");
    await mockKnowledge(page, db);
    await page.goto("/knowledge/base/?id=kb_dw");
    await page.getByTestId("problem-see").click();
    await expect(page.getByTestId("filter-failed")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("item-row")).toHaveCount(1);
  });

  test("an error: the banner names the fix, the row turns to it, pages already in stay searchable", async ({ page }) => {
    const db = newBackend("error");
    await mockKnowledge(page, db);
    await page.goto("/knowledge/base/?id=kb_dw");
    await expect(page.getByTestId("base-status")).toHaveText("Needs attention");
    const banner = page.getByTestId("problems");
    await expect(banner).toContainText("Ada's Atlassian sign-in expired. Reconnect Confluence to sign in again.");
    await expect(banner).toContainText("pages already brought in stay searchable");
    await expect(banner.getByTestId("problem-fix")).toHaveText("Reconnect Confluence");
    await page.getByTestId("source-card").getByTestId("connection-toggle").click();
    await expect(page.getByTestId("conn-token")).toContainText("Stopped: The refresh token was revoked");
    await shot(page, "error-1280");
  });

  test("a first sync: the tiles and the status count up, and the poll reads only the sources", async ({ page }) => {
    const db = newBackend("first_sync");
    await mockKnowledge(page, db);
    await page.goto("/knowledge/base/?id=kb_dw");
    await expect(page.getByTestId("base-status")).toHaveText("Syncing 350 of 1,000");
    await expect(page.getByTestId("tile-pages")).toContainText("Bringing in 350 of 1,000");
    await expect(page.getByTestId("source-health")).toContainText("Bringing in 350 of 1000");
    await shot(page, "first-sync-1280");
    // Two polls: each is the sources route; the base with every item is never read again.
    await expect.poll(() => db.calls.filter((c) => c === "GET /api/knowledge/kb_dw/sources").length, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
    expect(db.calls.filter((c) => c.startsWith("GET /api/knowledge/kb_dw?")).length).toBe(1);
    // When it finishes, the items are read again.
    const reads = db.calls.filter((c) => c.includes("/items")).length;
    db.sources[0] = source({ items: 1000, failed_items: 0 });
    await expect.poll(() => db.calls.filter((c) => c.includes("/items")).length, { timeout: 10_000 }).toBeGreaterThan(reads);
    await expect(page.getByTestId("base-status")).toHaveText("Up to date");
  });

  test("an empty base asks for one thing: add where its knowledge lives", async ({ page }) => {
    const db = newBackend("empty");
    await mockKnowledge(page, db);
    await page.goto("/knowledge/base/?id=kb_dw");
    await expect(page.getByTestId("empty-base")).toContainText("Add where this knowledge lives");
    await expect(page.getByTestId("empty-add")).toBeVisible();
    await expect(page.getByTestId("tiles")).toHaveCount(0);
    await expect(page.getByTestId("access")).toBeVisible();
    await shot(page, "empty-1280");
  });

  test("connected in place: the connection, no tiles or content", async ({ page }) => {
    const db = newBackend("in_place");
    await mockKnowledge(page, db);
    await page.goto("/knowledge/base/?id=kb_dw");
    await expect(page.getByTestId("connected-in-place")).toContainText("Connected in place");
    await expect(page.getByTestId("tiles")).toHaveCount(0);
    await expect(page.getByTestId("items-tree")).toHaveCount(0);
    await shot(page, "in-place-1280");
  });

  test("a reader sees how each source connects, never whose token or its scopes", async ({ page }) => {
    const db = newBackend("healthy", "member");
    await mockKnowledge(page, db);
    await page.goto("/knowledge/base/?id=kb_dw");
    const row = page.getByTestId("source-card").first();
    await row.getByTestId("connection-toggle").click();
    await expect(row.getByTestId("conn-how")).toContainText("The team's Confluence sign-in");
    await expect(row.getByTestId("conn-whose")).toHaveCount(0);
    await expect(row.getByTestId("conn-scopes")).toHaveCount(0);
    await expect(row.getByTestId("connection-actions")).toHaveCount(0);
    expect(db.calls.some((c) => c.endsWith("/connection"))).toBe(false);
  });

  test("an older gateway that sends every item still pages and filters them here", async ({ page }) => {
    const db = newBackend("healthy");
    await mockKnowledge(page, db, (p, method, url, route) => {
      if (p === "/api/knowledge/kb_dw" && method === "GET") {
        // An older gateway ignores ?items=none.
        return route
          .fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ base: { ...{ id: "kb_dw" }, name: "Old gateway", description: "", read_role: "member", attach_team: false, agents: [], authoritative: false, created_at: "", updated_at: "", files: 9, ready: 6, processing: 0, failed: 2, uploads: 1, synced: 8, kinds: [], sources: [] }, files: db.items, sources: db.sources, can_manage: true, limits: { max_file_bytes: 1, max_files: 1, extensions: [], agents: [], read_roles: [] }, visibility_note: "" }) })
          .then(() => true);
      }
      if (p.endsWith("/items")) return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Not found" }) }).then(() => true);
      return false;
    });
    await page.goto("/knowledge/base/?id=kb_dw");
    await expect(page.getByTestId("items-tree").getByTestId("tree-source")).toHaveCount(2);
    await page.getByTestId("filter-failed").click();
    await expect(page.getByTestId("item-row")).toHaveCount(1);
  });

  for (const state of ["healthy", "first_sync", "error", "empty", "in_place"] as State[]) {
    test(`phone width, ${state}: everything fits, nothing scrolls sideways`, async ({ page }) => {
      await page.setViewportSize({ width: 400, height: 860 });
      const db = newBackend(state);
      await mockKnowledge(page, db);
      await page.goto("/knowledge/base/?id=kb_dw");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      if (state === "healthy") {
        await page.getByTestId("source-card").first().getByTestId("connection-toggle").click();
        await expect(page.getByTestId("conn-scopes")).toBeVisible();
      }
      if (state !== "empty" && state !== "in_place") await expect(page.getByTestId("tiles")).toBeVisible();
      await noSideways(page);
      await shot(page, `${state.replace("_", "-")}-400`);
    });
  }
});

test.describe("knowledge base page: sync history and reading pages again", () => {
  test("each sync is a row; quiet ones fold; one with problems opens to each item and its fix", async ({ page }) => {
    const db = newBackend("healthy");
    await mockKnowledge(page, db);
    await page.goto("/knowledge/base/?id=kb_dw");
    const history = page.getByTestId("history");
    await expect(history.getByTestId("history-row")).toHaveCount(3);
    await expect(history.getByTestId("history-quiet")).toContainText("3 checks, nothing changed");
    const first = history.getByTestId("history-row").first();
    await expect(first).toContainText("Schedule");
    await expect(first).toContainText("41 s");
    await expect(first).toContainText("Done");
    await expect(first).toContainText("3 updated");
    const big = history.locator('[data-testid="history-row"][data-result="problems"]');
    await expect(big).toContainText("Done with problems");
    await expect(big).toContainText("410 added · 1 couldn't read · 1 skipped");
    await big.getByTestId("history-open").click();
    const problems = history.getByTestId("history-problem");
    await expect(problems).toHaveCount(2);
    await expect(problems.first()).toContainText("Upload a version with selectable text");
    await expect(problems.first().getByRole("link")).toHaveAttribute("href", /atlassian/);
    // One source at a time.
    await history.getByRole("button", { name: "Engineering wiki" }).click();
    await expect.poll(() => db.calls.some((c) => c.includes("/runs?source=src_notion"))).toBe(true);
    await expect(history.getByTestId("history-row")).toHaveCount(1);
    await expect(history.getByTestId("history-row")).toContainText("Change event");
    await shot(page, "history-1280");
  });

  test("a stopped sync says why and what fixes it", async ({ page }) => {
    const db = newBackend("error");
    await mockKnowledge(page, db);
    await page.goto("/knowledge/base/?id=kb_dw");
    const stopped = page.locator('[data-testid="history-row"][data-result="stopped"]');
    await expect(stopped).toContainText("Stopped");
    await stopped.getByTestId("history-open").click();
    await expect(page.getByTestId("history-detail")).toContainText("Reconnect Confluence to sign in again.");
  });

  test("pages that couldn't be read or were skipped can be read again", async ({ page }) => {
    const db = newBackend("healthy");
    await mockKnowledge(page, db);
    await page.goto("/knowledge/base/?id=kb_dw");
    await page.getByTestId("filter-skipped").click();
    await expect(page.getByTestId("item-row")).toHaveCount(1);
    await expect(page.getByTestId("item-row")).toContainText("It has no text to read");
    await page.getByTestId("item-pick").check();
    await page.getByTestId("retry-picked").click();
    await expect.poll(() => db.calls.includes("POST /api/knowledge/kb_dw/sources/src_conf/retry")).toBe(true);
    expect(db.bodies.some((b) => JSON.stringify(b.item_ids) === JSON.stringify(["i6"]))).toBe(true);
    await expect(page.getByText("Reading 1 page again now.")).toBeVisible();
  });

  test("phone width: the history stacks and nothing scrolls sideways", async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 860 });
    const db = newBackend("healthy");
    await mockKnowledge(page, db);
    await page.goto("/knowledge/base/?id=kb_dw");
    await page.getByTestId("history-row").last().getByTestId("history-open").click();
    await expect(page.getByTestId("history-problem")).toHaveCount(2);
    await page.getByTestId("history").scrollIntoViewIfNeeded();
    await noSideways(page);
  });
});
