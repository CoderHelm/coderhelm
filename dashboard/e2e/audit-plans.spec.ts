import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Plans pages: list, detail, new and templates. Every API call is answered
// here; nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const NOW = new Date().toISOString();

function plan(id: string, title: string, status: string, extra: Record<string, unknown> = {}) {
  return {
    plan_id: id, title, description: `Why: ${title.toLowerCase()}`, repo: "your-team/web", status,
    task_count: 3, destination: "github", created_at: NOW, updated_at: NOW, ...extra,
  };
}

function task(id: string, title: string, status: string, order: number, extra: Record<string, unknown> = {}) {
  return {
    task_id: id, plan_id: "PLANA", title, description: `Do ${title.toLowerCase()}`, acceptance_criteria: "- It works",
    status, order, created_at: NOW, ...extra,
  };
}

const PLANS = [
  plan("PLANA", "Add a class schedule page", "draft"),
  plan("PLANB", "Retry the sync job", "executing"),
  plan("PLANC", "Move billing to the new API", "waiting"),
  plan("PLAND", "Clean up old flags", "done"),
];

const TEMPLATES = [
  { template_id: "TPLA", title: "New API endpoint", description: "Route, handler, tests", category: "backend", tags: ["api"], task_count: 3, usage_count: 1, created_by: "a-person", created_at: NOW },
  { template_id: "TPLB", title: "New settings page", description: "", tags: [], task_count: 2, usage_count: 0, created_by: "a-person", created_at: NOW },
];

interface Backend {
  calls: string[];
  plansEmpty: boolean;
  plansFail: boolean;
  templatesEmpty: boolean;
  planStatus: number;
  slowPlan: boolean;
  tasks: ReturnType<typeof task>[];
  chatBody: Record<string, unknown> | null;
  usedQueries: string[];
}

function freshTasks() {
  return [
    task("T1", "Add the schedule table", "draft", 0),
    task("T2", "Show the schedule on the page", "rejected", 1),
    task("T3", "Wire the schedule API", "failed", 2),
    task("T4", "Write the tests", "approved", 3, { depends_on: "T1" }),
  ];
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = {
    calls: [], plansEmpty: false, plansFail: false, templatesEmpty: false, planStatus: 200, slowPlan: false,
    tasks: freshTasks(), chatBody: null, usedQueries: [], ...init,
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
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/support/badge") return json(route, { waiting: 0, queue_open: null });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "your-team/web", enabled: true, ticket_source: "github" }] });
    if (p === "/api/integrations/jira/check") return json(route, { ready: false, secret_configured: false, configured_repos: { total: 0, enabled: 0 }, enabled_repos: [], jira_events_seen: false, installation_id: 1 });
    if (p === "/api/settings/workflow") return json(route, { commit_openspec: false, default_destination: "jira", allow_plan_log_analyzer: false });
    if (p === "/api/plans/chat/token") return json(route, { token: "t" });
    if (p === "/api/plans/chat/stream" && m === "POST") {
      db.chatBody = JSON.parse(req.postData() || "{}");
      const ev = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
      const call = (id: string, name: string, used: unknown) =>
        ev("tool_start", { id, name }) + ev("tool_result", { id, name, status: "success", summary: "Done", used });
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body:
          call("tu1", "read_skill", { kind: "skill", label: "api-conventions", href: "/skills/item?repo=your-team%2Fplaybook&path=skills%2Fapi-conventions%2FSKILL.md" }) +
          call("tu2", "ask_team_agent", { kind: "agent", label: "spec-checker", href: "/skills/agent/?repo=your-team%2Fplaybook&path=agents%2Fspec-checker.md" }) +
          call("tu3", "logs_search", { kind: "source", label: "Service logs", href: "/data-sources/activity" }) +
          call("tu4", "read_skill", { kind: "skill", label: "api-conventions", href: "/skills/item?repo=your-team%2Fplaybook&path=skills%2Fapi-conventions%2FSKILL.md" }) +
          ev("text_delta", { text: "The schedule page needs an endpoint first, the way your API conventions lay out." }) +
          ev("done", {}),
      });
    }
    if (p === "/api/skills/used" && m === "GET") {
      db.usedQueries.push(url.search);
      return json(route, {
        skills: [{ name: "api-conventions", kind: "skill", repo: "your-team/playbook", path: "skills/api-conventions/SKILL.md", count: 2 }],
        agents: [{ name: "spec-checker", kind: "agent", repo: "your-team/playbook", path: "agents/spec-checker.md", count: 1, tools: ["read_file", "search_code"] }],
        sources: [{ id: "s1", name: "Service logs", lookups: 3 }],
        standards: [{ name: "code-standards", kind: "skill", repo: "your-team/playbook", path: "skills/code-standards/SKILL.md", count: 1 }],
      });
    }

    if (p === "/api/plans" && m === "GET") {
      if (db.plansFail) return json(route, { error: "boom" }, 500);
      if (db.plansEmpty) return json(route, { plans: [], next_cursor: null });
      const cursor = url.searchParams.get("cursor");
      if (cursor === "PLAN#PLANB") return json(route, { plans: PLANS.slice(2), next_cursor: null });
      return json(route, { plans: PLANS.slice(0, 2), next_cursor: "PLAN#PLANB" });
    }
    if (p === "/api/plans/templates" && m === "GET") {
      return json(route, { templates: db.templatesEmpty ? [] : TEMPLATES, next_cursor: null });
    }
    const use = p.match(/^\/api\/plans\/templates\/(\w+)\/use$/);
    if (use && m === "POST") return json(route, { plan_id: "PLANA" });
    if (/^\/api\/plans\/templates\/\w+$/.test(p) && m === "DELETE") return route.fulfill({ status: 200, body: "" });
    if (/^\/api\/plans\/templates\/from-plan\/\w+$/.test(p)) return json(route, { template_id: "TPLC" });

    const one = p.match(/^\/api\/plans\/(\w+)$/);
    if (one && m === "GET") {
      if (db.planStatus !== 200) return route.fulfill({ status: db.planStatus, body: "" });
      if (db.slowPlan) await new Promise((r) => setTimeout(r, 1500));
      return json(route, { ...plan(one[1], "Add a class schedule page", "draft", { chat_id: "chat-1" }), task_count: db.tasks.length, tasks: db.tasks });
    }
    const approve = p.match(/^\/api\/plans\/\w+\/tasks\/(\w+)\/approve$/);
    if (approve) {
      db.tasks = db.tasks.map((t) => (t.task_id === approve[1] ? { ...t, status: "approved" } : t));
      return route.fulfill({ status: 200, body: "" });
    }
    if (/^\/api\/plans\/\w+\/openspec$/.test(p)) return route.fulfill({ status: 404, body: "" });
    return json(route, { error: `Not mocked: ${m} ${p}` }, 404);
  });
  return db;
}

/** Console errors and page errors; deliberate failed loads may be allowed. */
function watchConsole(page: Page, allowFailedLoads = false) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (text.includes("net::ERR_ABORTED") || text.includes("net::ERR_FAILED")) return;
    if (allowFailedLoads && text.startsWith("Failed to load resource")) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(err.message));
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

test("plans list shows plain status words and keeps New plan while a plan runs", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/plans/");
  await expect(page.getByRole("heading", { name: "Plans", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add a class schedule page" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Plans" }).getByText("Running", { exact: true })).toBeVisible();
  // A plan is running: both ways forward are offered.
  await expect(page.getByRole("link", { name: "New plan" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue running plan" })).toHaveAttribute("href", /\/plans\/detail\/?\?id=PLANB/);
  await shot(page, "plans-list");
  expect(errors).toEqual([]);
});

test("Load more sends the cursor encoded, so the next page arrives", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/plans/");
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("link", { name: "Clean up old flags" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Plans" }).getByText("Waiting on a merge")).toBeVisible();
  expect(db.calls).toContain("GET /api/plans?cursor=PLAN%23PLANB");
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("plans toolbar: status toggles with counts and a search, kept in the address", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/plans/");
  const list = page.getByRole("list", { name: "Plans" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  const toggles = page.getByRole("group", { name: "Show plans" });
  await expect(toggles.getByRole("button", { name: /^All\s*2$/ })).toHaveAttribute("aria-pressed", "true");
  await toggles.getByRole("button", { name: /^Active/ }).click();
  await expect(page).toHaveURL(/status=active/);
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list.getByRole("link", { name: "Retry the sync job" })).toBeVisible();
  await page.goBack();
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await page.getByRole("searchbox", { name: "Search plans" }).fill("class schedule");
  await expect(page).toHaveURL(/q=class/);
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Search plans" }).fill("nothing like this");
  await expect(page.getByText(/No plans match/)).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(list.getByRole("listitem")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("plans list empty state", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page, { plansEmpty: true });
  await page.goto("/plans/");
  await expect(page.getByText("No plans yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Create your first plan" })).toHaveAttribute("href", /\/plans\/new/);
  await shot(page, "plans-list-empty");
  expect(errors).toEqual([]);
});

test("plans list error offers a retry that works", async ({ page }) => {
  const errors = watchConsole(page, true);
  const db = await mockApi(page, { plansFail: true });
  await page.goto("/plans/");
  await expect(page.getByText("Couldn't load your plans")).toBeVisible();
  db.plansFail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("link", { name: "Add a class schedule page" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("plan detail names every task status in plain words, including failed", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/plans/detail/?id=PLANA");
  await expect(page.getByRole("heading", { name: "Add a class schedule page" })).toBeVisible();
  await expect(page.getByText("Skipped", { exact: true }).first()).toBeVisible();
  // "failed" used to fall back to a grey "failed" chip and had no filter.
  await expect(page.getByRole("button", { name: "Failed (1)" })).toBeVisible();
  await page.getByRole("button", { name: "Failed (1)" }).click();
  await expect(page.getByRole("button", { name: "Failed (1)" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Add the schedule table" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Wire the schedule API" })).toBeVisible();
  await page.getByRole("button", { name: "Failed (1)" }).click();
  await expect(page.getByRole("button", { name: "Approve all and start" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove task Add the schedule table" })).toBeVisible();
  await shot(page, "plans-detail");
  expect(errors).toEqual([]);
});

test("approving a task updates in place instead of blanking the page", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/plans/detail/?id=PLANA");
  const heading = page.getByRole("heading", { name: "Add a class schedule page" });
  await expect(heading).toBeVisible();
  db.slowPlan = true;
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  // While the reload is in flight, the plan stays on screen.
  await page.waitForTimeout(400);
  await expect(heading).toBeVisible();
  await expect(page.getByRole("heading", { name: "Wire the schedule API" })).toBeVisible();
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("plan detail without an id says so", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/plans/detail/");
  await expect(page.getByText("No plan selected")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a missing plan says not found; a failed load offers a retry", async ({ page }) => {
  const errors = watchConsole(page, true);
  const db = await mockApi(page, { planStatus: 404 });
  await page.goto("/plans/detail/?id=GONE");
  await expect(page.getByText("Plan not found")).toBeVisible();

  db.planStatus = 500;
  await page.goto("/plans/detail/?id=PLANA");
  await expect(page.getByText("Couldn't load this plan")).toBeVisible();
  await shot(page, "plans-detail-error");
  db.planStatus = 200;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Add a class schedule page" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("save as template opens a labelled dialog that Escape closes", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/plans/detail/?id=PLANA");
  await page.getByRole("button", { name: "Save as template" }).click();
  const dialog = page.getByRole("dialog", { name: "Save as template" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Title")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("templates list shows the delete button without hovering", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/plans/templates/");
  await expect(page.getByRole("heading", { name: "Plan templates" })).toBeVisible();
  const del = page.getByRole("button", { name: "Delete template New API endpoint" });
  await expect(del).toBeVisible();
  // It used to be opacity 0 until hover: invisible on touch and to keyboard users.
  expect(await del.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  await expect(page.getByText("Used 1 time", { exact: true })).toBeVisible();
  await shot(page, "plans-templates");
  await del.click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("list", { name: "Templates" }).getByText("New API endpoint")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Templates" }).getByText("New settings page")).toBeVisible();
  expect(errors).toEqual([]);
});

test("templates search narrows the list and says when nothing matches", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/plans/templates/");
  const list = page.getByRole("list", { name: "Templates" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  // Tags and categories are searched too.
  await page.getByRole("searchbox", { name: "Search templates" }).fill("backend");
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list.getByText("New API endpoint")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search templates" }).fill("zzz");
  await expect(page.getByText(/No templates match/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("templates empty state", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page, { templatesEmpty: true });
  await page.goto("/plans/templates/");
  await expect(page.getByText("No templates yet")).toBeVisible();
  await shot(page, "plans-templates-empty");
  expect(errors).toEqual([]);
});

test("new plan offers templates on a fresh chat and a template opens its plan", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/plans/new/");
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  // The chat starts with a greeting, which used to hide this block forever.
  await expect(page.getByText("Start from a template")).toBeVisible();
  await shot(page, "plans-new");
  await page.getByRole("button", { name: /New API endpoint/ }).click();
  await expect(page).toHaveURL(/\/plans\/detail\/?\?id=PLANA/);
  await expect(page.getByRole("heading", { name: "Add a class schedule page" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a plan chat answer shows the skills, agents and data sources it used, each linked", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/plans/new/");
  await page.getByRole("textbox", { name: "Message" }).fill("Plan a class schedule page");
  await page.keyboard.press("Enter");
  const chips = page.getByRole("list", { name: "What this answer used" });
  await expect(chips).toBeVisible();
  await expect(chips.getByRole("link")).toHaveCount(3);
  await expect(chips.getByRole("link", { name: "Read skill: api-conventions" })).toHaveAttribute("href", /\/skills\/item\/?\?repo=your-team%2Fplaybook/);
  await expect(chips.getByRole("link", { name: "Asked agent: spec-checker" })).toHaveAttribute("href", /\/skills\/agent\/?\?repo=/);
  await expect(chips.getByRole("link", { name: "Looked up: Service logs" })).toHaveAttribute("href", /^\/data-sources\/activity\/?$/);
  // The chat sends its id, so what it read is logged together.
  expect(String(db.chatBody?.chat_id ?? "")).toMatch(/^[\w-]{8,64}$/);
  await shot(page, "plans-chat-used");
  expect(errors).toEqual([]);
});

test("a plan's page says what the chat it was made in used", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/plans/detail?id=PLANA");
  const used = page.getByTestId("work-used");
  await expect(used.getByText("1 skill · 1 agent · 1 data source · 1 standard")).toBeVisible();
  await used.getByText("What the chat used").click();
  await expect(used.getByRole("link", { name: /^api-conventions/ })).toContainText("×2");
  await expect(used.getByRole("link", { name: /spec-checker/ })).toContainText("read with read_file, search_code");
  await expect(used.getByRole("link", { name: /Service logs/ })).toContainText("×3");
  await expect(used.getByRole("link", { name: /code-standards/ })).toBeVisible();
  await expect(used.getByRole("link", { name: /spec-checker/ })).toHaveAttribute("href", /\/skills\/agent\/?\?repo=your-team%2Fplaybook/);
  expect(db.usedQueries[0]).toContain("origin=plan+chat+chat-1");
  await shot(page, "plans-detail-used");
  expect(errors).toEqual([]);
});
