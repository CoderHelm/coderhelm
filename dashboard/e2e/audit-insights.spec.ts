import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Infrastructure, Health, Admin and Code graph pages. Every API call is
// answered here; nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

interface Backend {
  calls: string[];
  bodies: Record<string, unknown>[];
  email: string;
  role: string;
  fail: Set<string>;
  allowlist: string[];
  infra: Record<string, unknown>;
  repoInfra: Record<string, unknown>;
  repos: { name: string; enabled: boolean; ticket_source: string }[];
  graphRepos: Record<string, unknown>[];
  graphStatus: Record<string, unknown>;
  dlq: Record<string, unknown>[];
}

const NOW = new Date().toISOString();

const HEALTH = {
  status: "degraded",
  checked_at: NOW,
  checks: [
    { name: "crashed_runs", status: "ok", count: 0, items: [] },
    { name: "stale_queued", status: "ok", count: 0, items: [] },
    { name: "dlq", status: "critical", count: 1, unretryable: 0, oldest_age_secs: 600, complete: true },
    { name: "tickets", status: "ok", visible: 1, in_flight: 2 },
    {
      name: "failed_runs_24h",
      status: "warning",
      count: 1,
      items: [{ run_id: "01RUNFAILED00000000000000A", title: "Update the pricing page", error: "Timed out", created_at: NOW }],
    },
  ],
};

const READY_INFRA = {
  status: "ready",
  has_infra: true,
  cached_at: NOW,
  scanned_repos: ["infra/app-stack.ts", "infra/db-stack.ts"],
  findings: [
    { severity: "error", category: "security", title: "Bucket allows public reads", detail: "The assets bucket has no public access block.", file: "infra/app-stack.ts" },
    { severity: "warning", category: "reliability", title: "Queue has no dead letter queue", detail: "Failed jobs are dropped." },
    { severity: "info", category: "cost", title: "Logs kept forever", detail: "Set a retention period to save cost." },
  ],
};

const GRAPH_STATUS = {
  indexed: true,
  files: 120,
  symbols: 900,
  names_referenced: 3400,
  branch: "main",
  indexed_sha: "abcdef1234567",
  updated_at: NOW,
  top_files: [
    { path: "src/lib/api.ts", rank: 0.05, defs: 40 },
    { path: "src/app/page.tsx", rank: 0.03, defs: 4 },
  ],
};

const HOODS: Record<string, unknown> = {
  "src/lib/api.ts": { path: "src/lib/api.ts", imports: ["src/lib/http.ts"], importers: ["src/app/page.tsx"], symbols: [{ name: "request", callers: ["src/app/page.tsx"] }] },
  "src/app/page.tsx": { path: "src/app/page.tsx", imports: ["src/lib/api.ts", "src/lib/format.ts"], importers: [], symbols: [] },
};

// One organization per team, in the shape the admin page reads since it groups teams.
function adminOrg(id: string, name: string, runs: number, reviews: number, cost: number, created: string) {
  const t = {
    team_id: id, name, status: "active", plan: "", created_at: created, members: 1, invites: 0, repos: 1,
    runs_total: runs, runs_month: Math.floor(runs / 4), reviews_total: reviews, reviews_month: reviews,
    cost_month_usd: cost, tokens_month: 0, last_active_at: NOW, github_org: name, has_installation: true,
    jira_site: "", personal: false, active: true, link: "main",
  };
  return {
    key: id, label: name, label_from: "github", domain: "", active: true, team_count: 1, personal_count: 0,
    members: 1, repos: 1, runs_total: runs, runs_month: t.runs_month, reviews_total: reviews, reviews_month: reviews,
    cost_month_usd: cost, last_active_at: NOW, created_at: created, plan: "", teams: [t],
  };
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = {
    calls: [],
    bodies: [],
    email: "owner@example.com",
    role: "admin",
    fail: new Set(),
    allowlist: ["first@example.com", "*@example.org"],
    infra: READY_INFRA,
    repoInfra: { status: "no_infra", has_infra: false },
    repos: [{ name: "your-team/web", enabled: true, ticket_source: "github" }],
    graphRepos: [
      { repo: "your-team/web", graph_enabled: true, indexed: true, files: 120, symbols: 900, branch: "main", indexed_sha: "abcdef1", updated_at: NOW },
      { repo: "your-team/backend", graph_enabled: false, indexed: false, files: 0, symbols: 0, branch: "", indexed_sha: "", updated_at: "" },
    ],
    graphStatus: GRAPH_STATUS,
    dlq: [],
    ...init,
  };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const m = req.method();
    db.calls.push(`${m} ${p}${url.search}`);
    if (req.postData()) {
      try {
        db.bodies.push(JSON.parse(req.postData() || "{}"));
      } catch {
        /* not json */
      }
    }
    if (db.fail.has(p)) return json(route, { error: "Something broke on our side" }, 500);
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: db.email, avatar_url: "", role: db.role });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/support/badge") return json(route, { waiting: 0, queue_open: null });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/health") return json(route, HEALTH);
    if (p === "/api/dlq") return json(route, { messages: db.dlq, count: db.dlq.length });
    if (p === "/api/dlq/purge" || p === "/api/dlq/delete" || p === "/api/dlq/redrive") return route.fulfill({ status: 200, body: "" });
    // The server decides who is a platform admin.
    if (p === "/api/admin/teams") {
      if (db.email !== "admin@coderhelm.com") return json(route, { error: "Forbidden" }, 403);
      const orgs = [adminOrg("TEAM#b", "beta-co", 140, 120, 310.5, "2026-09-01T00:00:00Z"), adminOrg("TEAM#a", "acme", 12, 0, 4, "2026-07-01T00:00:00Z")];
      return json(route, {
        month: "2026-10",
        orgs,
        teams: orgs.flatMap((o) => o.teams),
        counts: { teams: 2, orgs: 2, active_orgs: 2, inactive_orgs: 0 },
      });
    }
    if (p === "/api/admin/beta-signups") {
      if (db.email !== "admin@coderhelm.com") return json(route, { error: "Forbidden" }, 403);
      return json(route, { signups: [], counts: { new: 0, invited: 0, joined: 0, total: 0 } });
    }
    if (p === "/api/allowlist") {
      if (m === "GET") return json(route, { emails: db.allowlist });
      const body = JSON.parse(req.postData() || "{}") as { email: string };
      const email = body.email.trim().toLowerCase();
      if (m === "POST") {
        if (!db.allowlist.includes(email)) db.allowlist.push(email);
        return json(route, { status: "added", email });
      }
      db.allowlist = db.allowlist.filter((e) => e !== email);
      return json(route, { status: "removed", email });
    }
    if (p === "/api/repos") return json(route, { repos: db.repos });
    if (p === "/api/infrastructure") return json(route, db.infra);
    if (p === "/api/infrastructure/refresh") return json(route, { status: "pending" });
    if (p.startsWith("/api/infrastructure/repo/")) {
      if (p.endsWith("/refresh")) return json(route, { status: "pending" });
      return json(route, db.repoInfra);
    }
    if (p === "/api/graph/repos") return json(route, { repos: db.graphRepos });
    if (p === "/api/graph/status") {
      return json(route, url.searchParams.get("repo") === "your-team/web" ? db.graphStatus : { indexed: false });
    }
    if (p === "/api/graph/symbol") {
      return json(route, { definitions: [{ name: "request", path: "src/lib/api.ts", kind: "function", line: 3, rank: 0.1 }], callers: ["src/app/page.tsx"] });
    }
    if (p === "/api/graph/neighborhood") return json(route, HOODS[url.searchParams.get("path") || ""] ?? { path: url.searchParams.get("path"), imports: [], importers: [], symbols: [] });
    if (p.startsWith("/api/graph/config/")) return route.fulfill({ status: 200, body: "" });
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  return db;
}

/** Collects console errors and page errors; aborted external requests are expected. */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (text.includes("net::ERR_ABORTED") || text.includes("net::ERR_FAILED")) return;
    // A mocked 500 is logged by the browser as a failed resource; that is the test, not a bug.
    if (text.includes("Failed to load resource")) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
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

// ── Infrastructure ────────────────────────────────────────────────────────

test("infrastructure shows every finding, notes included", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/infrastructure");
  await expect(page.getByRole("heading", { name: "Infrastructure", level: 1 })).toBeVisible();
  await expect(page.getByText("Bucket allows public reads")).toBeVisible();
  await expect(page.getByText("Queue has no dead letter queue")).toBeVisible();
  // Bug: info findings were filtered out and never shown.
  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect(page.getByText("Logs kept forever")).toBeVisible();
  await expect(page.getByText("Cost", { exact: true })).toBeVisible();
  await shot(page, "audit-infrastructure");
  expect(errors).toEqual([]);
});

test("infrastructure hides the scan button from members, who cannot start one", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page, { role: "member" });
  await page.goto("/infrastructure");
  await expect(page.getByText("Bucket allows public reads")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Scan/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("infrastructure says 'not scanned yet' instead of 'no infrastructure found' before the first scan", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page, { infra: { status: "no_infra", has_infra: false, suggested_prompt: "Create a stack" } });
  await page.goto("/infrastructure");
  await expect(page.getByTestId("infra-not-scanned")).toBeVisible();
  await expect(page.getByText("No infrastructure code found")).toHaveCount(0);
  await page.getByRole("button", { name: "Scan now" }).click();
  await expect.poll(() => db.calls).toContain("POST /api/infrastructure/refresh");
  await expect(page.getByText("Scanning your infrastructure...")).toBeVisible();
  await shot(page, "audit-infrastructure-pending");
  expect(errors).toEqual([]);
});

test("infrastructure shows a finished empty scan as 'no infrastructure code found'", async ({ page }) => {
  await mockApi(page, { infra: { status: "no_infra", has_infra: false, cached_at: NOW, suggested_prompt: "Create a stack" } });
  await page.goto("/infrastructure");
  await expect(page.getByText("No infrastructure code found")).toBeVisible();
  await expect(page.getByText("Create a stack")).toBeVisible();
  await expect(page.getByRole("link", { name: "Start a plan from this prompt" })).toHaveAttribute("href", /\/plans\/new\/?\?prefill=Create%20a%20stack/);
});

test("infrastructure load failure offers a retry instead of an empty page", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page, { fail: new Set(["/api/infrastructure"]) });
  await page.goto("/infrastructure");
  await expect(page.getByText("Couldn't load the infrastructure review")).toBeVisible();
  db.fail.clear();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Bucket allows public reads")).toBeVisible();
  expect(errors).toEqual([]);
});

test("infrastructure with no repos turned on points to the repos page", async ({ page }) => {
  await mockApi(page, { repos: [] });
  await page.goto("/infrastructure");
  await expect(page.getByRole("link", { name: "Turn on a repo" })).toHaveAttribute("href", /\/settings\/repos/);
});

// ── Health ────────────────────────────────────────────────────────────────

test("health shows checks in plain words and links failed runs", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/health");
  await expect(page.getByRole("heading", { name: "System health" })).toBeVisible();
  await expect(page.getByTestId("health-overall")).toContainText("Degraded");
  // Bug: copy said ">10 min" while the server checks 20 minutes.
  await expect(page.getByText("Running with no update for 20 minutes", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: /Failed runs \(24 hours\)/ }).click();
  await expect(page.getByRole("link", { name: "Update the pricing page" })).toHaveAttribute("href", /\/runs\/detail\/?\?id=01RUNFAILED00000000000000A/);
  // A run's error reads as words, not red code; its start time is the shared relative time.
  const timedOut = page.getByText("Timed out", { exact: true });
  expect(await timedOut.evaluate((el) => getComputedStyle(el).fontFamily)).not.toMatch(/mono/i);
  await expect(page.getByText(/^Started /).locator("time")).toBeVisible();
  await shot(page, "audit-health");
  expect(errors).toEqual([]);
});

test("health asks before deleting failed messages", async ({ page }) => {
  const db = await mockApi(page, {
    dlq: [{ message_id: "m1", type: "ticket", body: { type: "ticket", team_id: "t_1" }, sent_at: NOW, age_secs: 600, source_queue: "", retryable: true, problem: null }],
  });
  await page.goto("/health");
  await page.getByRole("button", { name: /Failed messages/ }).click();
  await page.getByRole("button", { name: "Delete all" }).click();
  await expect(page.getByText("Delete all failed messages?")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(db.calls).not.toContain("POST /api/dlq/purge");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  await expect.poll(() => db.calls).toContain("POST /api/dlq/delete");
});

test("health error offers a retry", async ({ page }) => {
  const db = await mockApi(page, { fail: new Set(["/api/health"]) });
  await page.goto("/health");
  await expect(page.getByText("Couldn't run the health check")).toBeVisible();
  db.fail.clear();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("health-overall")).toBeVisible();
});

// ── Admin ─────────────────────────────────────────────────────────────────

test("admin page is closed to normal users", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  expect(db.calls.some((c) => c.includes("/api/allowlist"))).toBe(false);
  expect(errors).toEqual([]);
});

test("admin allowlist adds once in lower case and asks before removing", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page, { email: "admin@coderhelm.com", role: "owner" });
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Platform admin" })).toBeVisible();
  // Teams are one row per organization, the busiest first.
  const orgs = page.getByTestId("admin-org");
  await expect(orgs).toHaveCount(2);
  await expect(orgs.first()).toContainText("beta-co");
  await orgs.first().getByRole("button", { name: "Show teams of beta-co" }).click();
  await expect(page.getByRole("list", { name: "Teams of beta-co" })).toContainText("$310.50 this month");
  // The allowlist has its own tab.
  await page.getByRole("navigation", { name: "Admin views" }).getByRole("link", { name: /Allowlist/ }).click();
  await expect(page).toHaveURL(/tab=allowlist/);
  await expect(page.getByText("first@example.com")).toBeVisible();
  const input = page.getByLabel("Email or domain to allow");
  // Bug: the raw text was appended, so "First@Example.com" showed as a second entry.
  await input.fill("First@Example.com");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("list", { name: "Allowed emails" }).getByRole("listitem")).toHaveCount(2);
  // The box clears when the first add finishes; type the next one after that.
  await expect(input).toHaveValue("");
  await input.fill("New@Example.com");
  await input.press("Enter");
  await expect(page.getByText("new@example.com", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove new@example.com" }).click();
  await expect(page.getByText("Remove from the allowlist?")).toBeVisible();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText("new@example.com", { exact: true })).toHaveCount(0);
  expect(db.calls).toContain("DELETE /api/allowlist");
  await shot(page, "audit-admin");
  expect(errors).toEqual([]);
});

test("admin teams: search, status and sort sit above the table and live in the address", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page, { email: "admin@coderhelm.com", role: "owner" });
  await page.goto("/admin");
  const orgs = page.getByTestId("admin-org");
  await expect(orgs).toHaveCount(2);
  await page.getByRole("combobox", { name: "Sort" }).selectOption("name");
  await expect(page).toHaveURL(/sort=name/);
  await expect(orgs.first()).toContainText("acme");
  await page.getByRole("searchbox", { name: "Search teams" }).fill("beta");
  await expect(orgs).toHaveCount(1);
  await expect(orgs.first()).toContainText("beta-co");
  await page.getByRole("searchbox", { name: "Search teams" }).fill("nobody-here");
  await expect(page.getByText("No teams match")).toBeVisible();
  await expect(page.getByRole("group", { name: "Show teams" }).getByRole("button", { name: /^All\s*0$/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("admin allowlist load failure is shown, not presented as an empty list", async ({ page }) => {
  await mockApi(page, { email: "admin@coderhelm.com", role: "owner", fail: new Set(["/api/allowlist"]) });
  await page.goto("/admin?tab=allowlist");
  await expect(page.getByText("Couldn't load the allowlist")).toBeVisible();
  await expect(page.getByText("nobody can sign up")).toHaveCount(0);
});

// ── Code graph ────────────────────────────────────────────────────────────

test("code graph shows stats, search and the explorer", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/graph");
  await expect(page.getByRole("heading", { name: "Code graph", level: 1 })).toBeVisible();
  await expect(page.getByTestId("graph-exploring")).toContainText("your-team/web");
  await expect(page.getByText("3,400")).toBeVisible();
  await page.getByLabel("Function, class or type name").fill("request");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Definitions (1)" })).toBeVisible();
  await page.getByRole("button", { name: /src\/lib\/api\.ts/ }).first().click();
  await expect(page.getByRole("group", { name: "Files connected to src/lib/api.ts" })).toBeVisible();
  // Nodes are reachable by keyboard and re-center the explorer.
  const node = page.getByRole("button", { name: "Explore src/app/page.tsx" });
  await node.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "Files connected to src/app/page.tsx" })).toBeVisible();
  await shot(page, "audit-graph");
  expect(errors).toEqual([]);
});

test("code graph asks before turning a repo's graph off and hides the switch from members", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/graph");
  await page.getByRole("button", { name: "Code graph actions for your-team/web" }).click();
  await page.getByRole("menuitem", { name: /^Turn off/ }).click();
  await expect(page.getByText("Turn off the code graph for your-team/web?")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(db.calls.some((c) => c.startsWith("PUT /api/graph/config/"))).toBe(false);

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await mockApi(page, { role: "member" });
  await page.reload();
  await expect(page.getByText("3,400")).toBeVisible();
  await expect(page.getByRole("button", { name: /Code graph actions/ })).toHaveCount(0);
});

test("code graph with no repos explains how to get one", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page, { graphRepos: [] });
  await page.goto("/graph");
  await expect(page.getByTestId("list-empty")).toContainText("No repositories yet");
  await expect(page.getByRole("link", { name: "Connect repositories" })).toHaveAttribute("href", /\/settings\/repos/);
  await shot(page, "audit-graph-empty");
  expect(errors).toEqual([]);
});

test("code graph load failure shows an error with retry, not a blank page", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page, { fail: new Set(["/api/graph/repos"]) });
  await page.goto("/graph");
  await expect(page.getByText("Couldn't load your repos")).toBeVisible();
  db.fail.clear();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("graph-exploring")).toContainText("your-team/web");
  // Bug: rejections were unhandled and surfaced as page errors.
  expect(errors).toEqual([]);
});
