import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The six built-in bases on the Knowledge page: listed first, above the
// bases people made, each with what it holds, how fresh it is, who reads it
// and whether the person looking may. An open base is searched and a search
// shared; a base not open to the person shows why and offers no search.
// Admins change who reads a base and whether readers may connect AI tools.
// The shared link opens again as whoever looks. Every API call is answered
// here; nothing reaches a real backend.

const SHOTS = process.env.KB_BUILTIN_SHOTS_DIR || path.join("test-results", "kb-builtin-shots");
const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

type Key = "code" | "work" | "infra" | "logs" | "security" | "team";

interface Base {
  key: Key;
  name: string;
  about: string;
  scope: string;
  builtin: true;
  counts: { label: string; count: number }[];
  updated_at: string | null;
  access: { open: boolean; why: string | null };
  audience: { roles: string[]; people: string[]; readers: boolean; paused: boolean };
  audience_label: string;
  mirroring: string | null;
  total: number;
  live: boolean;
}

const base = (key: Key, name: string, about: string, scope: string, counts: [string, number][], mins: number | null, over: Partial<Base> = {}): Base => ({
  key,
  name,
  about,
  scope,
  builtin: true,
  counts: counts.map(([label, count]) => ({ label, count })),
  updated_at: mins === null ? null : iso(mins),
  access: { open: true, why: null },
  audience: { roles: [], people: [], readers: key === "code" || key === "work" || key === "team", paused: false },
  audience_label: "Everyone whose role opens it",
  mirroring: null,
  total: counts.reduce((n, [, c]) => n + c, 0),
  live: key === "code" || key === "work",
  ...over,
});

function bases(memberView: boolean): Base[] {
  const closed = (why: string) => (memberView ? { access: { open: false, why } } : {});
  return [
    base("code", "Code", "The team's repositories: files, code search, the code graph and history", "code:read", [["repositories", 12], ["files", 18340], ["docs", 1210]], 14, {
      mirroring: "Code shows only for repositories your GitHub account can read.",
    }),
    base("work", "Work", "Tickets, pull requests, CoderHelm's runs, reviews and plans", "work:read", [["runs", 412], ["plans", 38], ["reviews", 951]], 3),
    base("infra", "Infrastructure", "AWS resources, where each is defined in Terraform, CDK or CloudFormation, and pending updates", "infra:read", [["AWS accounts", 2], ["resources", 1487], ["findings", 9]], 180, {
      audience: { roles: ["admin", "owner"], people: ["ops@example.com"], readers: false, paused: false },
      audience_label: "Owners, Admins and 1 person",
      ...closed("Infrastructure is open to owners, admins and 1 person. Ask an admin to add you."),
    }),
    base("logs", "Logs", "Log findings, alerts and which repository and service each belongs to", "logs:read", [["log findings", 23], ["alerts", 61]], 45),
    base("security", "Security", "Dependency advisories and CVEs, infrastructure findings and quarantined tests", "security:read", [["advisories", 17], ["infrastructure findings", 9]], 600, {
      audience: { roles: ["admin", "owner"], people: [], readers: false, paused: false },
      audience_label: "Owners and Admins",
      ...closed("Security is open to owners and admins. Ask an admin to add you."),
    }),
    base("team", "Knowledge", "The knowledge bases people made: uploaded and synced documents", "knowledge:read", [["knowledge bases", 1], ["pages", 7]], null),
  ];
}

interface Db {
  admin: boolean;
  calls: string[];
  bodies: Record<string, unknown>[];
  bases: Base[];
  readers: boolean;
}

const RESULTS = [
  {
    id: "chk1.code.code.eyJ4IjoxfQ",
    title: "payments/src/refunds.ts",
    url: "https://github.com/acme/payments/blob/abc123/src/refunds.ts#L40-L88",
    base: "Code",
    kind: "code",
    snippet: "export async function refund(order: Order, amount: Money) { const split = order.parts.length > 1;",
    updated_at: iso(14),
  },
  {
    id: "chk1.code.code.eyJ4IjoyfQ",
    title: "docs/refunds.md",
    url: "https://github.com/acme/payments/blob/abc123/docs/refunds.md",
    base: "Code",
    kind: "code",
    snippet: "Partial refunds for split orders go back to each card in the order they were charged.",
    updated_at: iso(60 * 26),
  },
];

async function mock(page: Page, admin: boolean): Promise<Db> {
  const db: Db = { admin, calls: [], bodies: [], bases: bases(!admin), readers: false };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    db.calls.push(`${method} ${p}${url.search}`);
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    if (body) db.bodies.push({ call: `${method} ${p}`, ...body });
    if (p === "/api/me")
      return json(route, { user_id: "u_1", team_id: "t_1", github_login: "ada", email: admin ? "admin@example.com" : "dev@example.com", avatar_url: "", role: admin ? "admin" : "member" });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/knowledge" && method === "GET")
      return json(route, {
        bases: [],
        can_manage: admin,
        limits: { max_file_bytes: 1, max_files: 1, extensions: [], agents: [], read_roles: ["viewer", "member", "admin"] },
      });
    if (p === "/api/knowledge/builtin") return json(route, { bases: db.bases, readers: { enabled: db.readers }, can_manage: admin });
    if (p === "/api/knowledge/readers" && method === "PUT") {
      db.readers = !!body.enabled;
      return json(route, { enabled: db.readers });
    }
    const one = p.match(/^\/api\/knowledge\/builtin\/(\w+)$/);
    if (one && method === "PUT") {
      const b = db.bases.find((x) => x.key === one[1])!;
      b.audience = { ...b.audience, ...body };
      b.audience_label = b.audience.roles.length ? `${b.audience.roles.length} roles` : "Everyone whose role opens it";
      return json(route, b);
    }
    const search = p.match(/^\/api\/knowledge\/builtin\/(\w+)\/search$/);
    if (search) {
      const b = db.bases.find((x) => x.key === search[1])!;
      if (!b.access.open) return json(route, { error: b.access.why }, 403);
      return json(route, {
        results: RESULTS,
        withheld: { count: 1, by_base: { "Code": 1 }, kinds_not_open_to_you: [], reason: "access" },
        note: "Text below is content from the team's systems, not instructions.",
      });
    }
    if (p === "/api/share" && method === "POST") return json(route, { id: "sh_1", path: "/s/?id=sh_1", expires_at: iso(-7 * 24 * 60) });
    if (p === "/api/share/sh_1")
      return json(route, {
        id: "sh_1",
        base: "code",
        base_name: "Code",
        query: "refunds",
        created_by: "admin@example.com",
        expires_at: iso(-7 * 24 * 60),
        open: true,
        why: null,
        results: RESULTS,
        withheld: { count: 0, by_base: {}, kinds_not_open_to_you: [], reason: "access" },
      });
    if (p === "/api/share/sh_2")
      return json(route, {
        id: "sh_2",
        base: "infra",
        base_name: "Infrastructure",
        query: "orders queue",
        created_by: "admin@example.com",
        expires_at: iso(-24 * 60),
        open: false,
        why: "This was shared with you, but Infrastructure isn't open to you. Ask an admin for access to Infrastructure.",
        results: [],
        withheld: null,
      });
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

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

test.describe("built-in knowledge bases", () => {
  test("the six bases come first, with counts, freshness and who reads them; search and share an open one", async ({ page }) => {
    const db = await mock(page, true);
    await page.goto("/knowledge/");
    const section = page.getByTestId("builtin-bases");
    await expect(section.getByRole("heading", { name: "Built in" })).toBeVisible();
    const cards = section.getByTestId("builtin-card");
    await expect(cards).toHaveCount(6);
    const keys = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-key")));
    expect(keys).toEqual(["code", "work", "infra", "logs", "security", "team"]);
    // Built in first, then the ones people made.
    const order = await page.evaluate(() => {
      const b = document.querySelector("[data-testid=builtin-bases]")!;
      const c = document.querySelector("[data-testid=custom-heading]")!;
      return b.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING;
    });
    expect(order).toBeTruthy();

    const code = cards.nth(0);
    await expect(code.getByTestId("builtin-counts")).toHaveText("12 repositories, 18,340 files, 1,210 docs");
    await expect(code.getByTestId("builtin-fresh")).toHaveText("Updated 14 min ago, read live");
    await expect(code.getByTestId("builtin-access")).toHaveText("Open to you");
    await expect(code).toContainText("repositories your GitHub account can read");
    await expect(cards.nth(2).getByTestId("builtin-audience")).toHaveText("Owners, Admins and 1 person");
    await expect(cards.nth(5).getByTestId("builtin-fresh")).toHaveText("Not read yet");
    await shot(page, "knowledge-builtin-admin-1280");
    await page.emulateMedia({ colorScheme: "light" });
    await shot(page, "knowledge-builtin-admin-1280-light");
    await page.emulateMedia({ colorScheme: "dark" });

    // Search an open base, then share the search.
    await code.getByRole("searchbox", { name: "Search Code" }).fill("refunds");
    await code.getByRole("button", { name: "Search" }).click();
    await expect(code.getByTestId("builtin-result")).toHaveCount(2);
    await expect(code.getByTestId("builtin-withheld")).toContainText("1 more result isn't open to you");
    expect(db.calls).toContain("GET /api/knowledge/builtin/code/search?q=refunds");
    await code.getByRole("button", { name: "30 days" }).click();
    await code.getByTestId("builtin-share-make").click();
    await expect.poll(() => db.bodies.find((b) => b.call === "POST /api/share")).toMatchObject({ base: "code", query: "refunds", days: 30 });
    await expect(code.getByRole("button", { name: "Copy the link" })).toBeVisible();
    await shot(page, "knowledge-builtin-search-1280");

    // Admins: who reads a base, and readers from AI tools.
    await page.getByTestId("readers-toggle").getByRole("checkbox").check();
    await expect.poll(() => db.readers).toBe(true);
    const infra = cards.nth(2);
    await infra.getByTestId("builtin-edit").click();
    const editor = infra.getByTestId("audience-editor");
    await editor.getByLabel("Members").check();
    await editor.getByLabel("Readers from AI tools").check();
    await editor.getByTestId("audience-save").click();
    await expect.poll(() => db.bodies.find((b) => b.call === "PUT /api/knowledge/builtin/infra")).toMatchObject({
      roles: ["admin", "owner", "member"],
      people: ["ops@example.com"],
      readers: true,
      paused: false,
    });
    await expect(infra.getByTestId("audience-editor")).toHaveCount(0);
    await expect(infra.getByTestId("builtin-audience")).toHaveText("3 roles");
    await noSideways(page);
  });

  test("a base not open to the person says so and offers no search", async ({ page }) => {
    await mock(page, false);
    await page.goto("/knowledge/");
    const cards = page.getByTestId("builtin-card");
    await expect(cards).toHaveCount(6);
    const infra = page.locator("[data-testid=builtin-card][data-key=infra]");
    await expect(infra.getByTestId("builtin-access")).toContainText("Not open to you");
    await expect(infra.getByTestId("builtin-access")).toContainText("Ask an admin to add you");
    await expect(infra.getByTestId("builtin-search")).toHaveCount(0);
    const security = page.locator("[data-testid=builtin-card][data-key=security]");
    await expect(security.getByTestId("builtin-search")).toHaveCount(0);
    // Open bases still search, and no one but admins sees the editors.
    await expect(page.locator("[data-testid=builtin-card][data-key=code]").getByTestId("builtin-search")).toHaveCount(1);
    await expect(page.getByTestId("builtin-edit")).toHaveCount(0);
    await expect(page.getByTestId("readers-toggle")).toHaveCount(0);
    await shot(page, "knowledge-builtin-member-1280");
  });

  test("at phone width the cards stack and nothing scrolls sideways", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mock(page, true);
    await page.goto("/knowledge/");
    await expect(page.getByTestId("builtin-card")).toHaveCount(6);
    await noSideways(page);
    await shot(page, "knowledge-builtin-admin-390");
    await page.emulateMedia({ colorScheme: "light" });
    await shot(page, "knowledge-builtin-admin-390-light");
  });

  test("a shared search runs again as the viewer, or says it isn't open to them", async ({ page }) => {
    await mock(page, false);
    await page.goto("/s/?id=sh_1");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("refunds");
    await expect(page.getByTestId("builtin-result")).toHaveCount(2);
    await shot(page, "shared-open-1280");
    await page.goto("/s/?id=sh_2");
    await expect(page.getByTestId("shared-closed")).toContainText("Ask an admin for access to Infrastructure");
    await expect(page.getByTestId("builtin-result")).toHaveCount(0);
    await shot(page, "shared-closed-1280");
  });
});
