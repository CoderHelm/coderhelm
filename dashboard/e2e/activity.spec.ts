import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The access log on the Skills page and the lookup log on Data sources.
// Every API call is answered here. Nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
// The page groups rows by day, so every test runs at midday: offsets like
// "26 hours ago" then always land on yesterday, whatever the real time is.
const NOW = new Date();
NOW.setHours(12, 0, 0, 0);
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

type Ev = Record<string, unknown> & { id: string; at: string; by: string; action: string; outcome: string; repo: string; path: string };
type Lookup = Record<string, unknown> & { at: string; cursor: string; outcome: string; actor: string; source_id: string };

interface Backend {
  role: string;
  events: Ev[];
  lookups: Lookup[];
  /** Fail the access log call. */
  failLog: boolean;
  calls: { path: string; params: URLSearchParams }[];
}

const SKILL = { repo: "acme/playbook", path: "skills/debug/SKILL.md", kind: "skill", name: "debug" };
const AGENT = { repo: "acme/playbook", path: "agents/spec-checker.md", kind: "agent", name: "spec-checker" };
const COMMAND = { repo: "acme/playbook", path: "commands/release-notes.md", kind: "command", name: "release-notes" };

let seq = 0;
function ev(min: number, over: Partial<Ev> & Record<string, unknown>): Ev {
  seq += 1;
  const id = `01JZ${String(100000 - Math.round(min * 10)).padStart(6, "0")}${String(seq).padStart(4, "0")}`;
  return {
    id, at: ago(min), ...SKILL, action: "read", file: "", by: "coder", origin: "acme/web#41", run_id: "run_41",
    why: "The checkout test fails only in CI; this skill says how to trace it", outcome: "ok", ask_id: "", ms: 0, cursor: `SKILLUSE#${id}`, ...over,
  } as Ev;
}

const EVENTS: Ev[] = [
  ev(4, {}),
  ev(9, { ...AGENT, action: "ask", by: "reviewer", origin: "acme/web#40", run_id: "", why: "Does the refund spec cover partial refunds?", outcome: "answered", ask_id: "01J3", ms: 14200 }),
  ev(30, { action: "read_file", file: "skills/debug/reference.md", by: "planner", origin: "acme/api · ABC-88", run_id: "run_77", why: "Planning: Add partial refunds" }),
  ev(65, { ...COMMAND, by: "coder", outcome: "off", why: "Release notes for the new tag" }),
  ev(70, { ...AGENT, action: "ask", by: "admin@example.com (try)", origin: "", run_id: "", why: "Is \"the page should load fast\" testable?", outcome: "timed_out", ask_id: "01J2", ms: 120000 }),
  ev(60 * 26, { by: "reviewer", origin: "acme/web#39", run_id: "", why: "Reviewing: Retry failed webhooks", outcome: "limit" }),
  ev(60 * 50, { ...COMMAND, by: "planner", why: "Planning: Ship the release", origin: "acme/api · ABC-90", run_id: "run_90" }),
];

function lookup(min: number, over: Partial<Lookup> & Record<string, unknown> = {}): Lookup {
  seq += 1;
  return {
    at: ago(min), cursor: `DSLOG#${ago(min)}#${String(seq).padStart(4, "0")}`, source_id: "ds_db", source_name: "orders-db database",
    actor: "planner", repo: "your-team/backend", pr: 0, summary: "SELECT id, status FROM orders WHERE id = 7", query: "SELECT id, status\nFROM orders\nWHERE id = 7",
    detail: "1 rows", ok: true, outcome: "ok", ms: 120, run_id: "run_77", origin: "your-team/backend · ABC-88", ...over,
  } as Lookup;
}

const TIMEOUT = "The database didn't answer within 10 seconds.";
const LOOKUPS: Lookup[] = [
  lookup(2, { actor: "reviewer", pr: 51, run_id: "", origin: "", summary: "Checked a column exists", query: "SELECT column_name FROM information_schema.columns WHERE table_name = 'orders'", detail: "3 rows" }),
  lookup(5, { outcome: "failed", ok: false, detail: TIMEOUT, ms: 10000 }),
  lookup(6, { outcome: "failed", ok: false, detail: TIMEOUT, ms: 10000 }),
  lookup(7, { outcome: "failed", ok: false, detail: TIMEOUT, ms: 10000 }),
  lookup(12, { actor: "admin@example.com", repo: undefined, pr: undefined, run_id: "", origin: "", summary: "DELETE FROM orders", query: "DELETE FROM orders", outcome: "refused", ok: false, detail: "That lookup would change something, so it was refused before it left Coderhelm." }),
  lookup(40),
];

function summary(db: Backend) {
  const week = db.events.filter((e) => Date.now() - new Date(e.at).getTime() < 7 * 86_400_000);
  const wrong = (e: Ev) => !["ok", "answered", "pending"].includes(e.outcome);
  return {
    days: 7,
    since: ago(7 * 1440),
    skills: {
      reads: week.filter((e) => e.action !== "ask").length,
      asks: week.filter((e) => e.action === "ask").length,
      read_problems: week.filter((e) => e.action !== "ask" && wrong(e)).length,
      ask_problems: week.filter((e) => e.action === "ask" && wrong(e)).length,
    },
    lookups:
      db.role === "admin"
        ? { total: db.lookups.length, ok: db.lookups.filter((l) => l.outcome === "ok").length, refused: db.lookups.filter((l) => l.outcome === "refused").length, failed: db.lookups.filter((l) => l.outcome === "failed").length }
        : null,
  };
}

/** The access log as the gateway filters and pages it. */
function accessPage(db: Backend, q: URLSearchParams) {
  const words = (q.get("q") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const since = q.get("since");
  const list = db.events.filter((e) => {
    if (q.get("repo") && e.repo !== q.get("repo")) return false;
    if (q.get("path") && e.path !== q.get("path")) return false;
    const by = q.get("by");
    if (by === "people" ? ["planner", "coder", "reviewer"].includes(e.by) : by && e.by !== by) return false;
    const action = q.get("action");
    if (action === "read" && !e.action.startsWith("read")) return false;
    if (action === "ask" && e.action !== "ask") return false;
    const outcome = q.get("outcome");
    if (outcome === "problems" ? ["ok", "answered", "pending"].includes(e.outcome) : outcome && e.outcome !== outcome) return false;
    if (since && e.at < since) return false;
    const hay = `${e.kind}:${e.name} ${e.why} ${e.origin} ${e.path}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const limit = Number(q.get("limit") || 50);
  const before = q.get("before");
  const from = before ? list.findIndex((e) => e.cursor === before) + 1 : 0;
  const page = list.slice(from, from + limit);
  return { events: page, next: from + limit < list.length ? page[page.length - 1].cursor : null, kept_days: 180 };
}

function lookupPage(db: Backend, q: URLSearchParams) {
  const outcome = q.get("outcome");
  const who = q.get("who");
  const words = (q.get("q") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const list = db.lookups.filter((l) => {
    if (q.get("source") && l.source_id !== q.get("source")) return false;
    if (outcome === "problems" ? l.outcome === "ok" : outcome && l.outcome !== outcome) return false;
    if (who === "people" ? ["planner", "coder", "reviewer"].includes(l.actor) : who && l.actor !== who) return false;
    const hay = `${l.query} ${l.summary} ${l.detail}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const limit = Number(q.get("limit") || 50);
  const before = q.get("before");
  const from = before ? list.findIndex((l) => l.cursor === before) + 1 : 0;
  const page = list.slice(from, from + limit);
  return { events: page, next: from + limit < list.length ? page[page.length - 1].cursor : null };
}

const ITEMS = [SKILL, AGENT, COMMAND].map((i) => ({
  ...i, description: `About ${i.name}, long enough for the agents to know when it fits.`, sha: "4f2c9a1e7b3d", hash: "h", enabled: true, files: i.kind === "skill" ? ["skills/debug/reference.md"] : [],
  missing_tools: [], uses: 3, last_used_at: ago(4), last_used_by: "coder", updated_at: ago(600), asks: i.kind === "agent" ? 2 : 0, last_asked_at: i.kind === "agent" ? ago(9) : "", switched_by: "", switched_at: "",
}));

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { role: "admin", events: structuredClone(EVENTS), lookups: structuredClone(LOOKUPS), failLog: false, calls: [], ...init };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    db.calls.push({ path: p, params: url.searchParams });
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: db.role });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/skills") {
      return json(route, { repos: [{ repo: "acme/playbook", added_by: "admin@example.com", added_at: ago(9000), sha: "4f2c9a1e7b3d", synced_at: ago(4), error: "", items: 3, skipped: [] }], items: ITEMS, can_manage: db.role === "admin" });
    }
    if (p === "/api/skills/stats") return json(route, { error: "Unavailable" }, 500);
    if (p === "/api/skills/item") {
      const it = ITEMS.find((i) => i.path === url.searchParams.get("path"));
      return it ? json(route, { ...it, body: "---\nname: x\n---\nDo the thing.\n", prompt: "You are one of this team's own agents." }) : json(route, { error: "No such skill." }, 404);
    }
    if (p === "/api/skills/asks") return json(route, { asks: [], tries_per_day: 20, tries_left: 20 });
    if (p === "/api/skills/activity") return db.failLog ? json(route, { error: "Unavailable" }, 500) : json(route, accessPage(db, url.searchParams));
    if (p === "/api/activity/summary") return json(route, summary(db));
    if (p === "/api/data-sources") {
      return json(route, { sources: [{ id: "ds_db", kind: "database", name: "orders-db database", url: "", status: "ready", enabled: true, setup_complete: true, key_hint: "", has_mutations: false, kinds: null, schema_available: true, hidden_fields: [], repos: [], last_checked_at: ago(10), created_at: ago(9000), created_by: "admin@example.com" }] });
    }
    if (p === "/api/data-sources/activity") return json(route, lookupPage(db, url.searchParams));
    return json(route, {});
  });
  return db;
}

const lastCall = (db: Backend, p: string) => [...db.calls].reverse().find((c) => c.path === p);

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

test("skills activity: the week at a glance, then every read and ask by day with who, why, the work and the result", async ({ page }) => {
  await mockApi(page);
  await page.goto("/skills/?tab=activity");
  await expect(page.getByRole("tab", { name: "Activity" })).toHaveAttribute("aria-selected", "true");

  const strip = page.getByTestId("activity-summary");
  await expect(strip.getByRole("link", { name: /Skill reads\s*5/ })).toBeVisible();
  await expect(strip.getByRole("link", { name: /Agent asks\s*2/ })).toBeVisible();
  await expect(strip.getByRole("link", { name: /went wrong\s*3/ })).toBeVisible();
  await expect(strip.getByRole("link", { name: /Failed lookups\s*3/ })).toHaveAttribute("href", /\/data-sources\/activity\/\?outcome=failed/);
  await expect(strip.getByRole("link", { name: /Refused lookups\s*1/ })).toBeVisible();

  const rows = page.getByTestId("skill-activity-row");
  await expect(rows).toHaveCount(7);
  await expect(page.getByRole("heading", { name: "Today", level: 3 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Yesterday", level: 3 })).toBeVisible();

  const first = rows.first();
  await expect(first).toContainText("Coder read skill:debug");
  await expect(first).toContainText("The checkout test fails only in CI");
  await expect(first.getByRole("link", { name: "acme/web#41" })).toHaveAttribute("href", "https://github.com/acme/web/issues/41");
  await expect(first.getByRole("link", { name: "View run" })).toHaveAttribute("href", /\/runs\/detail\/?\?id=run_41/);
  await expect(first.getByText("Read", { exact: true })).toBeVisible();

  const ask = rows.nth(1);
  await expect(ask).toContainText("Reviewer asked agent:spec-checker");
  await expect(ask).toContainText("Does the refund spec cover partial refunds?");
  await expect(ask.getByRole("link", { name: "See the answer" })).toBeVisible();
  await expect(ask).toContainText("14 s");

  await expect(rows.nth(2)).toContainText("Planner read a file of skill:debug: reference.md");
  await expect(rows.nth(2)).toContainText("acme/api · ABC-88");
  await expect(rows.nth(3).getByText("Switched off", { exact: true })).toBeVisible();
  await expect(rows.nth(3)).toContainText("It was switched off or removed, so the agent didn't get it.");
  await expect(rows.nth(4)).toContainText("admin@example.com tried agent:spec-checker");
  await expect(rows.nth(4).getByText("Took too long", { exact: true })).toBeVisible();
  await expect(rows.nth(5)).toContainText("The pass had already made its 20 reads");
  await shot(page, "skills-activity");
});

test("skills activity: filters go to the server, stay in the address, and clear", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/skills/?tab=activity");
  const rows = page.getByTestId("skill-activity-row");
  await expect(rows).toHaveCount(7);

  await page.getByLabel("Who").selectOption("coder");
  await expect(rows).toHaveCount(2);
  expect(lastCall(db, "/api/skills/activity")?.params.get("by")).toBe("coder");
  await expect(page).toHaveURL(/by=coder/);

  await page.getByLabel("Who").selectOption("");
  await page.getByRole("group", { name: "Result" }).getByRole("button", { name: "Went wrong" }).click();
  await expect(rows).toHaveCount(3);
  expect(lastCall(db, "/api/skills/activity")?.params.get("outcome")).toBe("problems");

  await page.getByRole("group", { name: "Result" }).getByRole("button", { name: "All", exact: true }).click();
  await page.getByLabel("Item").selectOption({ label: "agent:spec-checker" });
  await expect(rows).toHaveCount(2);
  expect(lastCall(db, "/api/skills/activity")?.params.get("path")).toBe("agents/spec-checker.md");

  await page.getByLabel("Item").selectOption("");
  await page.getByRole("searchbox", { name: "Search" }).fill("partial refunds");
  await expect(rows).toHaveCount(2);
  expect(lastCall(db, "/api/skills/activity")?.params.get("q")).toBe("partial refunds");
  await expect(page).toHaveURL(/q=partial\+refunds/);

  // A reload keeps the view.
  await page.reload();
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue("partial refunds");
  await expect(rows).toHaveCount(2);

  await page.getByRole("searchbox", { name: "Search" }).fill("nothing like this");
  await expect(page.getByText("Nothing matches these filters.")).toBeVisible();
  await shot(page, "skills-activity-empty-filter");
  await page.getByRole("button", { name: "Clear filters" }).last().click();
  await expect(rows).toHaveCount(7);
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue("");

  await page.getByLabel("When").selectOption("24h");
  await expect(rows).toHaveCount(5);
  expect(lastCall(db, "/api/skills/activity")?.params.get("since")).toBeTruthy();
});

test("skills activity: a summary count opens the log filtered to it", async ({ page }) => {
  await mockApi(page);
  await page.goto("/skills/?tab=activity");
  await page.getByTestId("activity-summary").getByRole("link", { name: /went wrong/ }).click();
  await expect(page.getByRole("group", { name: "Result" }).getByRole("button", { name: "Went wrong" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("When")).toHaveValue("7d");
  await expect(page.getByTestId("skill-activity-row")).toHaveCount(3);
});

test("skills activity: older entries load as the list scrolls, and the end says how long they are kept", async ({ page }) => {
  const many = Array.from({ length: 75 }, (_, i) => ev(10 + i * 3, { why: `Reason number ${i + 1}` }));
  const db = await mockApi(page, { events: many });
  await page.goto("/skills/?tab=activity");
  const rows = page.getByTestId("skill-activity-row");
  await expect(rows).toHaveCount(50);
  await rows.last().scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 4000);
  await expect(rows).toHaveCount(75);
  expect(db.calls.filter((c) => c.path === "/api/skills/activity" && c.params.get("before")).length).toBeGreaterThan(0);
  await expect(page.getByText("That's everything kept. Reads and asks are kept for 180 days.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
});

test("skills activity: nothing yet, and a failed load offers to try again", async ({ page }) => {
  const db = await mockApi(page, { events: [] });
  await page.goto("/skills/?tab=activity");
  await expect(page.getByText(/Nothing read or asked yet/)).toBeVisible();
  await shot(page, "skills-activity-nothing-yet");

  db.failLog = true;
  await page.getByLabel("Who").selectOption("planner");
  await expect(page.getByText("We couldn't load the activity")).toBeVisible();
  db.failLog = false;
  db.events = structuredClone(EVENTS);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("skill-activity-row")).toHaveCount(2);
});

test("an item's own activity: an opened skill and an agent's page show only theirs", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/skills");
  await expect(page.getByRole("tab", { name: "Library" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("link", { name: "skill:debug" }).click();
  const recent = page.locator("#skill-activity");
  // The skill opens on its own page, whose log is the full one for that skill.
  await expect(page).toHaveURL(/\/skills\/item\/?\?repo=acme%2Fplaybook&path=skills%2Fdebug%2FSKILL\.md$/);
  await expect(recent.getByRole("heading", { name: "Every read" })).toBeVisible();
  await expect(recent.getByTestId("skill-activity-row")).toHaveCount(3);
  await expect(recent.getByTestId("skill-activity-row").first()).toContainText("Coder read it");
  await expect(recent.getByLabel("Item")).toHaveCount(0);
  const call = lastCall(db, "/api/skills/activity");
  expect(call?.params.get("path")).toBe("skills/debug/SKILL.md");

  await page.goto(`/skills/agent?repo=acme%2Fplaybook&path=${encodeURIComponent("agents/spec-checker.md")}&tab=asks`);
  const all = page.locator("#skill-activity");
  await expect(all.getByRole("heading", { name: "Every read and ask" })).toBeVisible();
  await expect(all.getByTestId("skill-activity-row")).toHaveCount(2);
  await expect(all.getByTestId("skill-activity-row").last()).toContainText("admin@example.com tried it");
});

test("tabs move with the arrow keys, and members see the summary without lookups", async ({ page }) => {
  await mockApi(page, { role: "member" });
  await page.goto("/skills");
  await page.getByRole("tab", { name: "Library" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Activity" })).toBeFocused();
  await expect(page).toHaveURL(/tab=activity/);
  const strip = page.getByTestId("activity-summary");
  await expect(strip.getByRole("link", { name: /Skill reads/ })).toBeVisible();
  await expect(strip.getByRole("link", { name: /lookups/i })).toHaveCount(0);
});

test("lookup log: summary, the same failure in a row shows once, and a row links to its run", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/data-sources/activity/");
  await expect(page.getByTestId("activity-summary").getByRole("link", { name: /Data lookups\s*6/ })).toBeVisible();
  const activity = page.locator("#activity");
  const rows = activity.getByTestId("activity-row");
  await expect(rows).toHaveCount(4);

  const repeated = rows.nth(1);
  await expect(repeated).toContainText("3 times in a row");
  await expect(repeated).toContainText(TIMEOUT);
  await repeated.getByRole("button").first().click();
  await expect(repeated).toContainText("The same lookup failed 3 times in a row");
  await expect(repeated.getByRole("link", { name: "View run" })).toHaveAttribute("href", /\/runs\/detail\/?\?id=run_77/);
  await expect(repeated).toContainText("During your-team/backend · ABC-88");
  await expect(repeated.locator("pre")).toHaveText("SELECT id, status\nFROM orders\nWHERE id = 7");
  await expect(repeated.getByRole("button", { name: "Copy" })).toBeVisible();
  await shot(page, "lookups-activity");

  await activity.getByRole("group", { name: "Result" }).getByRole("button", { name: "Problems" }).click();
  await expect(rows).toHaveCount(2);
  expect(lastCall(db, "/api/data-sources/activity")?.params.get("outcome")).toBe("problems");
  await expect(page).toHaveURL(/outcome=problems/);
  await expect(activity.getByRole("group", { name: "Result" }).getByRole("button", { name: "Problems" })).toHaveAttribute("aria-pressed", "true");
});

test("lookup log: filters from the address are applied and sent, search goes to the server", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/data-sources/activity/?outcome=refused&range=7d");
  const activity = page.locator("#activity");
  await expect(activity.getByRole("group", { name: "Result" }).getByRole("button", { name: "Refused" })).toHaveAttribute("aria-pressed", "true");
  await expect(activity.getByLabel("When")).toHaveValue("7d");
  await expect(activity.getByTestId("activity-row")).toHaveCount(1);
  const call = lastCall(db, "/api/data-sources/activity");
  expect(call?.params.get("outcome")).toBe("refused");
  expect(call?.params.get("since")).toBeTruthy();

  await activity.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(activity.getByTestId("activity-row")).toHaveCount(4);
  await activity.getByRole("searchbox", { name: "Search" }).fill("information_schema");
  await expect(activity.getByTestId("activity-row")).toHaveCount(1);
  expect(lastCall(db, "/api/data-sources/activity")?.params.get("q")).toBe("information_schema");
  await shot(page, "lookups-activity-search");
});
