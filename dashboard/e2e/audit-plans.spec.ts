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

const OPENSPEC = {
  proposal: "# Proposal\n\nMembers ask for the class schedule on the web. Today it only lives in the app.\n\n## What changes\n\n- A schedule page under `/schedule`\n- An endpoint that lists classes by day",
  design: "# Design\n\nThe page reads `GET /api/classes?day=` and groups classes by hour.\n\n```ts\nexport async function classesFor(day: string) {\n  return fetch(`/api/classes?day=${day}`).then((r) => r.json());\n}\n```",
  spec: "# Spec\n\n### Requirement: schedule by day\n\nThe page SHALL show every class for the chosen day, earliest first.",
  tasks: "# Tasks\n\n- [ ] 1. Add the schedule table\n- [ ] 2. Show the schedule on the page",
};

interface Backend {
  calls: string[];
  plansEmpty: boolean;
  plansFail: boolean;
  templatesEmpty: boolean;
  planStatus: number;
  slowPlan: boolean;
  tasks: ReturnType<typeof task>[];
  chatBody: Record<string, unknown> | null;
  chatPosts: number;
  created: Record<string, unknown> | null;
  usedQueries: string[];
  /** The plan the detail page reads; tasks come from `tasks`. */
  planExtra: Record<string, unknown>;
  openspecMissing: boolean;
  /** Bodies of every write, "METHOD /path" → body, in order. */
  writes: { call: string; body: unknown }[];
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
    tasks: freshTasks(), chatBody: null, chatPosts: 0, created: null, usedQueries: [], planExtra: {}, openspecMissing: false, writes: [], ...init,
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
    if (m !== "GET" && p.startsWith("/api/plans/") && !p.startsWith("/api/plans/chat")) {
      const raw = req.postData();
      db.writes.push({ call: `${m} ${p}`, body: raw ? JSON.parse(raw) : null });
    }
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
      db.chatPosts++;
      const msgs = (db.chatBody?.messages ?? []) as { role: string; content: string }[];
      const last = (msgs[msgs.length - 1]?.content ?? "").toLowerCase();
      const ev = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
      const call = (id: string, name: string, used: unknown) =>
        ev("tool_start", { id, name }) + ev("tool_result", { id, name, status: "success", summary: "Done", used });
      const stream = (body: string) => route.fulfill({ status: 200, contentType: "text/event-stream", body });
      const planJson = (tasks: { title: string; description: string; acceptance_criteria: string }[]) =>
        "```json\n" + JSON.stringify({ title: "Add a class schedule page", description: "Members can see classes by day.", repo: "your-team/web", tasks: tasks.map((t, i) => ({ ...t, order: i })) }, null, 2) + "\n```";
      const T1 = { title: "Add the classes endpoint", description: "GET /api/classes?day= returns classes for a day.", acceptance_criteria: "- Returns classes sorted by time" };
      const T2 = { title: "Show the schedule page", description: "A page at /schedule with a day picker.", acceptance_criteria: "- Shows today by default" };
      if (last.includes("fail")) return stream(ev("error", { message: "The model is busy. Try again." }));
      if (last.includes("plan it")) {
        return stream(
          ev("tool_start", { id: "g1", name: "github__read_file" }) + ev("tool_result", { id: "g1", status: "success", summary: "routes.ts" }) +
          ev("tool_start", { id: "g2", name: "github__read_file" }) + ev("tool_result", { id: "g2", status: "success", summary: "page.tsx" }) +
          ev("tool_start", { id: "g3", name: "github__search_code" }) + ev("tool_result", { id: "g3", status: "success", summary: "4 matches" }) +
          ev("text_delta", { text: "Here is a plan in two steps.\n\n" + planJson([T1, T2]) }) + ev("done", {}),
        );
      }
      if (last.includes("print view")) {
        return stream(
          ev("text_delta", { text: "Added a print view and tightened the page task.\n\n" + planJson([T1, { ...T2, description: T2.description + " Days are tabs." }, { title: "Add a print view", description: "A print stylesheet for the schedule.", acceptance_criteria: "- Prints one day per page" }]) }) +
          ev("done", {}),
        );
      }
      if (last.includes("long")) {
        const para = "The schedule needs an endpoint, a page, and a way to pick a day. ".repeat(6);
        return stream(ev("text_delta", { text: Array.from({ length: 10 }, (_, i) => `### Part ${i + 1}\n\n${para}`).join("\n\n") }) + ev("done", {}));
      }
      return stream(
        call("tu1", "read_skill", { kind: "skill", label: "api-conventions", href: "/skills/item?repo=your-team%2Fplaybook&path=skills%2Fapi-conventions%2FSKILL.md" }) +
          call("tu2", "ask_team_agent", { kind: "agent", label: "spec-checker", href: "/skills/agent/?repo=your-team%2Fplaybook&path=agents%2Fspec-checker.md" }) +
          call("tu3", "logs_search", { kind: "source", label: "Service logs", href: "/data-sources/activity" }) +
          call("tu4", "read_skill", { kind: "skill", label: "api-conventions", href: "/skills/item?repo=your-team%2Fplaybook&path=skills%2Fapi-conventions%2FSKILL.md" }) +
          ev("text_delta", { text: "The schedule page needs an endpoint first, the way your API conventions lay out." }) +
          ev("done", {}),
      );
    }
    if (p === "/api/plans" && m === "POST") {
      db.created = JSON.parse(req.postData() || "{}");
      return json(route, { plan_id: "PLANA" });
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
      return json(route, { ...plan(one[1], "Add a class schedule page", "draft", { chat_id: "chat-1", ...db.planExtra }), task_count: db.tasks.length, tasks: db.tasks });
    }
    const taskOne = p.match(/^\/api\/plans\/\w+\/tasks\/(\w+)$/);
    if (taskOne && (m === "PUT" || m === "DELETE")) return route.fulfill({ status: 200, body: "" });
    if (/^\/api\/plans\/\w+\/tasks$/.test(p) && m === "POST") return json(route, { task_id: "T9" });
    if (/^\/api\/plans\/\w+\/tasks\/\w+\/(reject|force-run)$/.test(p)) return json(route, { status: "queued" });
    if (/^\/api\/plans\/\w+\/openspec\/generate$/.test(p) && m === "POST") {
      db.openspecMissing = false;
      return json(route, { files: ["proposal.md", "design.md", "tasks.md", "spec.md"] });
    }
    const approve = p.match(/^\/api\/plans\/\w+\/tasks\/(\w+)\/approve$/);
    if (approve) {
      db.tasks = db.tasks.map((t) => (t.task_id === approve[1] ? { ...t, status: "approved" } : t));
      return route.fulfill({ status: 200, body: "" });
    }
    if (/^\/api\/plans\/\w+\/openspec$/.test(p)) {
      if (db.openspecMissing) return route.fulfill({ status: 404, body: "" });
      return json(route, OPENSPEC);
    }
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
  // A plan is running: it is pinned to the top of the list, and New plan stays.
  await expect(page.getByRole("link", { name: "New plan" })).toBeVisible();
  await expect(page.getByTestId("plan-row").first()).toHaveAttribute("data-status", "executing");
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
  await expect(page.getByRole("link", { name: "Write your first plan" })).toHaveAttribute("href", /\/plans\/new/);
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

test("plan detail reads as a document: one summary line, one action, the plan, the rest folded", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/plans/detail/?id=PLANA");
  await expect(page.getByRole("heading", { level: 1, name: "Add a class schedule page" })).toBeVisible();
  // One line says where the plan stands.
  const summary = page.getByRole("list", { name: "About this plan" });
  await expect(summary).toContainText("Draft");
  await expect(summary).toContainText("your-team/web");
  await expect(summary).toContainText("4 tasks, 1 to review");
  await expect(summary).toContainText("Sends to GitHub issues");
  // One primary action in the top bar; the rarely used ones sit in More.
  const header = page.getByTestId("page-actions");
  await expect(header.getByRole("button", { name: "Approve all and start" })).toBeVisible();
  await expect(header.getByRole("button", { name: "Save as template" })).toHaveCount(0);
  await expect(header.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await header.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Save as template", "Download the spec", "Delete plan"]);
  await page.keyboard.press("Escape");
  // The document and its section list.
  const nav = page.getByRole("navigation", { name: "On this page" });
  await expect(nav.getByRole("link")).toHaveText(["Overview", "Tasks4", "Spec", "Details"]);
  await expect(page.getByRole("heading", { level: 2, name: "Overview" })).toBeVisible();
  await expect(page.getByText("Why: add a class schedule page")).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Proposal" })).toBeVisible();
  await expect(page.getByText("Members ask for the class schedule on the web.")).toBeVisible();
  // The design and requirements are folded behind "Technical plan".
  await expect(page.getByRole("button", { name: "Copy design.md" })).toBeHidden();
  await page.getByText("Technical plan").click();
  await expect(page.getByRole("button", { name: "Copy design.md" })).toBeVisible();
  // Tasks are a checklist: a mark, a number, a title, a status word.
  const tasks = page.getByRole("list", { name: "Tasks" });
  await expect(tasks.getByTestId("task")).toHaveCount(4);
  await expect(tasks.getByRole("img", { name: "Failed" })).toBeVisible();
  await expect(tasks.getByRole("img", { name: "Skipped" })).toBeVisible();
  await expect(tasks.getByTestId("task").nth(2).getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(tasks.getByTestId("task").nth(3)).toContainText("after 1");
  // No filters for a short plan; details are folded.
  await expect(page.getByRole("searchbox", { name: "Search tasks" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Destination" })).toBeHidden();
  await expect(page.getByText("Do add the schedule table")).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await shot(page, "plans-detail");
  expect(errors).toEqual([]);
});

test("a long plan gets task search and status filters, including failed", async ({ page }) => {
  const errors = watchConsole(page);
  const many = [
    ...freshTasks(),
    task("T5", "Add the empty state", "draft", 4),
    task("T6", "Add the loading state", "draft", 5),
    task("T7", "Link the page from the menu", "draft", 6),
  ];
  await mockApi(page, { tasks: many });
  await page.goto("/plans/detail/?id=PLANA");
  const tasks = page.getByRole("list", { name: "Tasks" });
  await expect(tasks.getByTestId("task")).toHaveCount(7);
  const failed = page.getByRole("group", { name: "Show tasks" }).getByRole("button", { name: "Failed (1)" });
  await failed.click();
  await expect(failed).toHaveAttribute("aria-pressed", "true");
  await expect(tasks.getByTestId("task")).toHaveCount(1);
  await expect(tasks).toContainText("Wire the schedule API");
  await failed.click();
  await page.getByRole("searchbox", { name: "Search tasks" }).fill("loading");
  await expect(tasks.getByTestId("task")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Search tasks" }).fill("nothing like it");
  await expect(page.getByText("No tasks match.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("approving a task updates in place instead of blanking the page", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/plans/detail/?id=PLANA");
  const heading = page.getByRole("heading", { level: 1, name: "Add a class schedule page" });
  await expect(heading).toBeVisible();
  db.slowPlan = true;
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  // While the reload is in flight, the plan stays on screen.
  await page.waitForTimeout(400);
  await expect(heading).toBeVisible();
  await expect(page.getByRole("list", { name: "Tasks" })).toContainText("Wire the schedule API");
  await expect(page.getByRole("list", { name: "Tasks" }).getByRole("img", { name: "Approved" })).toHaveCount(2);
  expect(db.writes).toContainEqual({ call: "POST /api/plans/PLANA/tasks/T1/approve", body: null });
  expect(errors).toEqual([]);
});

test("a task opens to what it says; edit sends only what changed, add sends the same body as before", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/plans/detail/?id=PLANA");
  await page.getByRole("button", { name: "Show details of Add the schedule table" }).click();
  await expect(page.getByText("Do add the schedule table")).toBeVisible();
  await expect(page.getByText("Done when")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove task Add the schedule table" })).toBeVisible();
  await shot(page, "plans-detail-task-open");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Title").fill("Add the schedule tables");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => db.writes.find((w) => w.call === "PUT /api/plans/PLANA/tasks/T1")?.body).toEqual({ title: "Add the schedule tables" });

  // Run after, from the open task.
  await page.getByRole("button", { name: "Show details of Show the schedule on the page" }).click();
  await page.getByLabel("Run after").selectOption("T1");
  await expect.poll(() => db.writes.filter((w) => w.call === "PUT /api/plans/PLANA/tasks/T2").map((w) => w.body)).toEqual([{ depends_on: "T1" }]);

  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Title").fill("Add a print view");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect.poll(() => db.writes.find((w) => w.call === "POST /api/plans/PLANA/tasks")?.body).toEqual({
    title: "Add a print view", description: "", acceptance_criteria: "", repo: "", destination: "github", order: 4,
  });
  expect(errors).toEqual([]);
});

test("the destination sits in Details; the summary line opens it", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/plans/detail/?id=PLANA");
  await page.getByRole("list", { name: "About this plan" }).getByRole("button", { name: "Sends to GitHub issues" }).click();
  const dest = page.getByRole("group", { name: "Destination" });
  await expect(dest).toBeVisible();
  await expect(dest.getByRole("button", { name: "GitHub Issues" })).toHaveAttribute("aria-pressed", "true");
  // Jira is not connected here, so it can't be picked.
  await expect(dest.getByRole("button", { name: "Jira Tickets" })).toBeDisabled();
  await expect(page.getByTestId("plan-details")).toContainText("PLANA");
  await shot(page, "plans-detail-details");
  expect(errors).toEqual([]);
});

test("a finished plan leads with its PR and lists its runs and PRs as rows", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page, {
    planExtra: { status: "done", destination: "jira", executed_at: NOW, executed_by: "a-person" },
    tasks: [
      task("T1", "Add the schedule table", "done", 0, { run_id: "RUN1", pr_url: "https://github.com/your-team/web/pull/41", jira_ticket_key: "WEB-12", jira_ticket_url: "https://your-team.atlassian.net/browse/WEB-12" }),
      task("T2", "Show the schedule on the page", "rejected", 1),
    ],
  });
  await page.goto("/plans/detail/?id=PLANA");
  const header = page.getByTestId("page-actions");
  await expect(header.getByRole("link", { name: /Open PR/ })).toHaveAttribute("href", "https://github.com/your-team/web/pull/41");
  await expect(page.getByRole("list", { name: "About this plan" })).toContainText("1 of 2 done");
  await expect(page.getByRole("progressbar", { name: "Tasks done" })).toHaveAttribute("aria-valuenow", "1");
  const work = page.getByRole("list", { name: "Runs and PRs" });
  await expect(work.getByRole("link", { name: "Add the schedule table" })).toHaveAttribute("href", /\/runs\/detail\/?\?id=RUN1/);
  await expect(work.getByRole("link", { name: "PR #41" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Tasks" }).getByRole("link", { name: "WEB-12" })).toBeVisible();
  // A started plan has nothing to approve.
  await expect(page.getByRole("button", { name: "Approve all and start" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await shot(page, "plans-detail-done");
  expect(errors).toEqual([]);
});

test("a plan with no spec offers to write one, then shows it", async ({ page }) => {
  const errors = watchConsole(page, true);
  const db = await mockApi(page, { openspecMissing: true });
  await page.goto("/plans/detail/?id=PLANA");
  await expect(page.getByText("No spec written yet.")).toBeVisible();
  await shot(page, "plans-detail-no-spec");
  await page.getByRole("button", { name: "Write the spec" }).click();
  await expect(page.getByRole("heading", { level: 3, name: "Proposal" })).toBeVisible();
  expect(db.writes.map((w) => w.call)).toContain("POST /api/plans/PLANA/openspec/generate");
  expect(errors).toEqual([]);
});

test("on a phone the plan's main action is in view, not in a menu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto("/plans/detail/?id=PLANA");
  const approve = page.getByRole("button", { name: "Approve all and start" });
  await expect(approve).toBeVisible();
  const box = await approve.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
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
  await expect(page.getByRole("heading", { level: 1, name: "Add a class schedule page" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("save as template opens from More as a labelled dialog that Escape closes", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/plans/detail/?id=PLANA");
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Save as template" }).click();
  const dialog = page.getByRole("dialog", { name: "Save as template" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Title")).toBeFocused();
  await expect(dialog.getByLabel("Title")).toHaveValue("Add a class schedule page template");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Save as template" }).click();
  await dialog.getByLabel("Tags (optional, separated by commas)").fill("web, schedule");
  await dialog.getByRole("button", { name: "Save template" }).click();
  await expect(dialog).toHaveCount(0);
  expect(db.writes.find((w) => w.call === "POST /api/plans/templates/from-plan/PLANA")?.body).toEqual({
    title: "Add a class schedule page template", description: "Why: add a class schedule page", tags: ["web", "schedule"],
  });
  expect(errors).toEqual([]);
});

test("templates list shows the delete button without hovering", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/plans/templates/");
  await expect(page.getByRole("heading", { level: 1, name: "Templates" })).toBeVisible();
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

test("new plan asks one question first, with templates and the destination folded under More options", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/plans/new/");
  await expect(page.getByRole("heading", { level: 1, name: "What do you want to change?" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  await expect(page.getByText("What happens next")).toBeVisible();
  await expect(page.getByTestId("plan-starter")).toContainText("Reads your-team/web");
  // Folded until asked for.
  await expect(page.getByText("Start from a template")).toBeHidden();
  await expect(page.getByRole("group", { name: "Destination" })).toBeHidden();
  // An example fills the box; it does not send.
  await page.getByRole("button", { name: "Retry failed sync jobs with a backoff" }).click();
  await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue("Retry failed sync jobs with a backoff");
  await page.getByRole("textbox", { name: "Message" }).fill("");
  await shot(page, "plans-new");
  await page.getByText("More options").click();
  await expect(page.getByText("Start from a template")).toBeVisible();
  await expect(page.getByRole("group", { name: "Destination" }).getByRole("button", { name: "Jira Tickets" })).toBeDisabled();
  await shot(page, "plans-new-options");
  await page.getByRole("button", { name: "Use template New API endpoint" }).click();
  await expect(page).toHaveURL(/\/plans\/detail\/?\?id=PLANA/);
  await expect(page.getByRole("heading", { name: "Add a class schedule page" }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("a plan chat answer folds its steps into one line and links what it used", async ({ page }) => {
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
  // Four tool calls, one line.
  const work = page.getByTestId("work-line");
  await expect(work).toHaveCount(1);
  await expect(work).toContainText(/Worked( for \d+s)? · read 2 skills · asked 1 agent · 1 lookup/);
  await work.getByRole("button").click();
  await expect(work.getByRole("button", { name: /read skill/ })).toHaveCount(2);
  // The chat sends its id, so what it read is logged together.
  expect(String(db.chatBody?.chat_id ?? "")).toMatch(/^[\w-]{8,64}$/);
  await expect(page.getByTestId("user-message")).toContainText("Plan a class schedule page");
  await shot(page, "plans-chat-used");
  expect(errors).toEqual([]);
});

test("the draft sits beside the chat, marks what an answer changed, and saves the same body as before", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/plans/new/");
  await page.getByRole("textbox", { name: "Message" }).fill("Plan it: a class schedule page");
  await page.getByRole("button", { name: "Draft a plan" }).click();
  await expect(page.getByTestId("plan-card")).toContainText("Drafted the plan");
  await expect(page.getByTestId("plan-card")).toContainText("2 tasks");
  await expect(page.getByTestId("work-line")).toContainText("read 2 files · ran 1 code search");
  // The JSON is not shown as text.
  await expect(page.getByText('"acceptance_criteria"')).toHaveCount(0);
  const panel = page.getByRole("complementary", { name: "Draft plan" });
  await expect(panel.getByRole("heading", { name: "Add a class schedule page" })).toBeVisible();
  await expect(panel.getByRole("list", { name: "Draft tasks" }).getByRole("listitem")).toHaveCount(2);
  // Suggested replies once a draft exists.
  await expect(page.getByRole("list", { name: "Suggested replies" })).toBeVisible();

  await page.getByRole("textbox", { name: "Message" }).fill("Add a print view");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("plan-card").last()).toContainText("Updated the plan");
  await expect(page.getByTestId("plan-card").last()).toContainText("+1 task · 1 changed");
  await expect(panel.getByTestId("draft-updated")).toHaveText("Updated: +1 task · 1 changed");
  await expect(panel.getByText("New", { exact: true })).toBeVisible();
  await expect(panel.getByText("Changed", { exact: true })).toBeVisible();
  await shot(page, "plans-chat-plan");

  // On a phone the plan is a tab.
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(panel).toBeHidden();
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^Plan \(3\)/ }).click();
  await expect(panel).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS_DIR, "plans-chat-plan-tab-390.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });

  await panel.getByRole("button", { name: "Save plan" }).click();
  await expect(page).toHaveURL(/\/plans\/detail\/?\?id=PLANA/);
  // Same body as before the redesign: the plan, the destination (GitHub, since Jira is not connected), the chat id.
  expect(Object.keys(db.created ?? {}).sort()).toEqual(["chat_id", "description", "destination", "repo", "tasks", "title"]);
  expect(db.created).toMatchObject({ title: "Add a class schedule page", repo: "your-team/web", destination: "github" });
  expect((db.created?.tasks as unknown[]).length).toBe(3);
  expect(errors).toEqual([]);
});

test("a failed answer says so and Retry asks again", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/plans/new/");
  await page.getByRole("textbox", { name: "Message" }).fill("This will fail");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "reply" })).toContainText("Couldn't get a reply: The model is busy. Try again.");
  await shot(page, "plans-chat-error");
  const before = db.chatPosts;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => db.chatPosts).toBe(before + 1);
  expect(errors).toEqual([]);
});

test("a long earlier answer folds under Show more; Start over goes back to the question", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/plans/new/");
  await page.getByRole("textbox", { name: "Message" }).fill("Give me the long version");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Part 10" })).toBeVisible();
  // The newest answer is never folded.
  await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Message" }).fill("Plan it");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("plan-card")).toBeVisible();
  await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(1);
  await page.getByRole("button", { name: "Show more" }).click();
  await expect(page.getByRole("button", { name: "Show less" })).toBeVisible();
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "What do you want to change?" })).toBeVisible();
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

test("the plan chat box keeps Enter to send and Shift+Enter for a new line, with formatting behind Aa", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/plans/new/");
  const box = page.getByRole("textbox", { name: "Message" });
  await box.click();
  await page.keyboard.type("- first line");
  await page.keyboard.press("Shift+Enter");
  // Shift+Enter is a plain new line in a chat box: no list marker added, nothing sent.
  await expect(box).toHaveValue("- first line\n");
  await page.keyboard.type("second line");
  expect(db.chatPosts).toBe(0);

  // The toolbar is folded until Aa opens it.
  await expect(page.getByRole("toolbar", { name: "Formatting" })).toHaveCount(0);
  await page.getByRole("button", { name: "Show formatting" }).click();
  await expect(page.getByRole("toolbar", { name: "Formatting" })).toBeVisible();
  // Both widths, with no sideways scroll.
  await shot(page, "md-editor-plan-chat");
  // ⌘B / Ctrl+B works with the toolbar open or shut.
  await box.press("ControlOrMeta+a");
  await page.getByRole("toolbar", { name: "Formatting" }).getByRole("button", { name: "Bold" }).click();
  await expect(box).toHaveValue("**- first line\nsecond line**");
  await box.press("ControlOrMeta+z");
  await expect(box).toHaveValue("- first line\nsecond line");
  await box.press("End");

  await page.keyboard.press("Enter");
  await expect.poll(() => db.chatPosts).toBe(1);
  const msgs = (db.chatBody?.messages ?? []) as { role: string; content: string }[];
  expect(msgs[msgs.length - 1]?.content).toBe("- first line\nsecond line");
  // What was sent shows as markdown in the thread.
  await expect(page.getByTestId("user-message").getByRole("listitem")).toHaveCount(1);
  await expect(page.getByTestId("user-message").getByRole("listitem")).toContainText("first line");
  expect(errors).toEqual([]);
});
