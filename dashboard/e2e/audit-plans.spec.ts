import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { pickOption } from "./select";

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

const counts = (c: Partial<Record<string, number>>) => ({ draft: 0, queued: 0, working: 0, needs_you: 0, failed: 0, in_review: 0, merged: 0, dropped: 0, ...c });

const PLANS = [
  plan("PLANA", "Add a class schedule page", "draft", { state: "drafting", summary: "3 tasks to review, 1 dropped", counts: counts({ draft: 3, dropped: 1 }) }),
  plan("PLANB", "Retry the sync job", "executing", {
    state: "running", summary: "1 of 3 merged, 1 in review, 1 working", counts: counts({ merged: 1, in_review: 1, working: 1 }), cost_usd: 14.2, attempts: 4, last_activity_at: NOW,
  }),
  plan("PLANC", "Move billing to the new API", "executing", {
    state: "needs_you", summary: "2 of 5 merged, 1 needs you, 1 failed, 1 in review", needs_count: 2, counts: counts({ merged: 2, needs_you: 1, failed: 1, in_review: 1 }), cost_usd: 61.9, attempts: 11,
  }),
  plan("PLAND", "Clean up old flags", "done", { state: "done", summary: "2 of 2 merged", counts: counts({ merged: 2 }), cost_usd: 5.1, attempts: 2 }),
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
  /** The detail answer's criteria, needs and estimate. */
  criteria: unknown[];
  needs: unknown[];
  estimate: unknown;
}

function freshTasks() {
  return [
    task("T1", "Add the schedule table", "draft", 0, { state: "draft" }),
    task("T2", "Show the schedule on the page", "rejected", 1, { state: "dropped", state_detail: "Dropped by a-person" }),
    task("T3", "Wire the schedule API", "draft", 2, { state: "draft" }),
    task("T4", "Write the tests", "draft", 3, { state: "draft", depends_on: "T1" }),
  ];
}

const ESTIMATE = { tasks: 3, runs_low: 3, runs_high: 4, cost_low: 6.3, cost_high: 19.8, per_run_low: 2.1, per_run_high: 4.95, sample: 40 };

const pr = (n: number, tone: string, extra: Record<string, unknown> = {}) => ({
  number: n, url: `https://github.com/your-team/web/pull/${n}`, repo: "your-team/web", state: "open", checks: "passed", review: "none", tone, run_id: `RUN${n}`, ...extra,
});

/** A plan at work: one merged, one in review, one needing a person, one failed, one still a draft. */
function runningTasks() {
  return [
    task("T1", "Add the schedule table", "filed", 0, {
      state: "merged", state_detail: "Pull request #41 merged", attempts: 1, cost_usd: 3.4, ticket_filed: true, covers: ["C1"],
      runs: [{ run_id: "RUN41", status: "merged", created_at: NOW, cost_usd: 3.4 }], prs: [pr(41, "merged", { state: "merged", additions: 120, deletions: 8 })],
      issue_url: "https://github.com/your-team/web/issues/40", issue_number: 40,
    }),
    task("T2", "Show the schedule on the page", "filed", 1, {
      state: "in_review", state_detail: "Checks are still running on `9f1c2ab`.", attempts: 1, cost_usd: 4.1, ticket_filed: true, covers: ["C2"],
      runs: [{ run_id: "RUN52", status: "completed", created_at: NOW, cost_usd: 4.1 }],
      prs: [pr(52, "waiting", { checks: "running", additions: 64, deletions: 3 })],
    }),
    task("T3", "Wire the schedule API", "filed", 2, {
      state: "needs_you", state_detail: "Approve pull request #53", attempts: 2, cost_usd: 9.8, ticket_filed: true,
      runs: [{ run_id: "RUN50", status: "retried", created_at: NOW, cost_usd: 5.0 }, { run_id: "RUN53", status: "completed", created_at: NOW, cost_usd: 4.8 }],
      prs: [pr(53, "waiting", { review: "waiting", additions: 210, deletions: 41 }), pr(50, "closed", { state: "closed" })],
      drift: [{ kind: "scope", detail: "The pull request changes files outside the task's planned scope: src/billing/charge.ts", by: "agent" }],
    }),
    task("T4", "Write the tests", "filed", 3, {
      state: "failed", state_detail: "Run timed out (exceeded execution time limit).", state_reason: "Run timed out (exceeded execution time limit).",
      attempts: 1, cost_usd: 2.2, ticket_filed: true, runs: [{ run_id: "RUN60", status: "failed", created_at: NOW, cost_usd: 2.2 }], prs: [],
    }),
    task("T5", "Add the print view", "draft", 4, { state: "draft", created_at: NOW, drift: [{ kind: "added", detail: "Added after the plan was approved", by: "person" }] }),
  ];
}

const RUNNING_NEEDS = [
  { task_id: "T3", kind: "approval", ask: "Approve pull request #53", detail: "This repo's auto-merge setting requires an approving review from a person before Coderhelm merges.", url: "https://github.com/your-team/web/pull/53", run_id: "RUN53", action: "open_pr" },
  { task_id: "T4", kind: "failed", ask: "Task \"Write the tests\" failed", detail: "Run timed out (exceeded execution time limit).", run_id: "RUN60", action: "retry" },
  { task_id: "", kind: "approve_rest", ask: "Approve or drop the 1 task still in draft", action: "approve" },
];

const RUNNING_CRITERIA = [
  { id: "C1", text: "The schedule table stores classes by day", tasks: ["T1"], met: true, evidence: [{ task_id: "T1", run_id: "RUN41", state: "proven", words: "proven", by: "tests with and without the change", tests: ["schedule.test.ts"] }] },
  { id: "C2", text: "The page shows today's classes by default", tasks: ["T2"], met: false, evidence: [{ task_id: "T2", run_id: "RUN52", state: "not_run", words: "not run yet" }] },
  { id: "C3", text: "The page says when a class is full", tasks: [], met: false, evidence: [] },
];

const RUNNING_PLAN = {
  status: "executing", state: "needs_you", summary: "1 of 5 merged, 1 needs you, 1 failed, 1 in review, 1 in draft",
  counts: counts({ merged: 1, needs_you: 1, failed: 1, in_review: 1, draft: 1 }), needs_count: 3, cost_usd: 19.5, attempts: 5,
  criteria_met: 1, criteria_count: 3, executed_at: NOW, executed_by: "a-person", last_activity_at: NOW,
};

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = {
    calls: [], plansEmpty: false, plansFail: false, templatesEmpty: false, planStatus: 200, slowPlan: false,
    tasks: freshTasks(), chatBody: null, chatPosts: 0, created: null, usedQueries: [], planExtra: {}, openspecMissing: false, writes: [],
    criteria: [], needs: [], estimate: ESTIMATE, ...init,
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
    // Security is off: no count beside it in the sidebar.
    if (p === "/api/security/overview") return json(route, { enabled: false, dry_run: true, counts: { open: 0, p0: 0, p1: 0 } });
    if (p === "/api/setup") return json(route, { repos: [], new_recommendations: [], auto_setup_new_repos: false });
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
      return json(route, {
        ...plan(one[1], "Add a class schedule page", "draft", { chat_id: "chat-1", state: "drafting", summary: "3 tasks to review, 1 dropped", ...db.planExtra }),
        task_count: db.tasks.length, tasks: db.tasks, criteria: db.criteria, needs: db.needs, estimate: db.estimate,
      });
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
      // The plan runs and stays open: the approved task is queued, the rest are still drafts.
      db.tasks = db.tasks.map((t) => (t.task_id === approve[1] ? { ...t, status: "queued", state: "queued", state_detail: "Waiting to file its ticket" } : t));
      const drafts = db.tasks.filter((t) => (t as { state?: string }).state === "draft").length;
      db.planExtra = { ...db.planExtra, status: "executing", state: "running", summary: `0 of ${db.tasks.length} merged, 1 queued, ${drafts} in draft` };
      db.needs = drafts ? [{ task_id: "", kind: "approve_rest", ask: `Approve or drop the ${drafts} tasks still in draft`, action: "approve" }] : [];
      return json(route, { dispatched: true, task_id: approve[1] });
    }
    if (/^\/api\/plans\/\w+\/approve-and-execute$/.test(p) && m === "POST") {
      const n = db.tasks.filter((t) => (t as { state?: string }).state === "draft").length;
      db.tasks = db.tasks.map((t) => ((t as { state?: string }).state === "draft" ? { ...t, status: "queued", state: "queued" } : t));
      db.needs = [];
      db.planExtra = { ...db.planExtra, status: "executing", state: "running" };
      return json(route, { status: "executing", tasks_queued: n });
    }
    if (/^\/api\/runs\/\w+\/retry$/.test(p) && m === "POST") {
      db.writes.push({ call: `${m} ${p}`, body: null });
      return json(route, { status: "queued" });
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

test("plans list shows each plan's progress by state, what needs you, and the cost", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/plans/");
  await expect(page.getByRole("heading", { name: "Plans", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add a class schedule page" })).toBeVisible();
  const list = page.getByRole("list", { name: "Plans" });
  await expect(list.getByText("Running", { exact: true })).toBeVisible();
  // A running plan sits above a draft one; New plan stays.
  await expect(page.getByRole("link", { name: "New plan" })).toBeVisible();
  const first = page.getByTestId("plan-row").first();
  await expect(first).toHaveAttribute("data-status", "running");
  await expect(first).toContainText("1 of 3 merged, 1 in review, 1 working");
  await expect(first).toContainText("$14.20");
  await expect(first.getByTestId("state-bar")).toHaveAttribute("aria-label", "Tasks: 1 merged, 1 in review, 1 working");
  // No description clutter on a row.
  await expect(list).not.toContainText("Why: retry the sync job");
  await shot(page, "plans-list");
  expect(errors).toEqual([]);
});

test("Load more sends the cursor encoded; a plan that needs you says how many things", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/plans/");
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("link", { name: "Clean up old flags" })).toBeVisible();
  expect(db.calls).toContain("GET /api/plans?cursor=PLAN%23PLANB");
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  // Needs you is pinned first, with its count.
  const first = page.getByTestId("plan-row").first();
  await expect(first).toHaveAttribute("data-status", "needs_you");
  await expect(first.getByTestId("needs-count")).toHaveText("2 need you");
  await expect(page.getByRole("list", { name: "Plans" }).getByText("Waiting on a merge")).toHaveCount(0);
  await shot(page, "plans-list-all");
  expect(errors).toEqual([]);
});

test("plans toolbar: Active counts running plans, Needs you and Done are their own, kept in the address", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page);
  await page.goto("/plans/");
  const list = page.getByRole("list", { name: "Plans" });
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(4);
  const toggles = page.getByRole("group", { name: "Show plans" });
  await expect(toggles.getByRole("button", { name: /^All\s*4$/ })).toHaveAttribute("aria-pressed", "true");
  await expect(toggles.getByRole("button", { name: /^Active\s*1$/ })).toBeVisible();
  await expect(toggles.getByRole("button", { name: /^Needs you\s*1$/ })).toBeVisible();
  await expect(toggles.getByRole("button", { name: /^Done\s*1$/ })).toBeVisible();
  await toggles.getByRole("button", { name: /^Active/ }).click();
  await expect(page).toHaveURL(/status=active/);
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list.getByRole("link", { name: "Retry the sync job" })).toBeVisible();
  await toggles.getByRole("button", { name: /^Done/ }).click();
  await expect(list.getByRole("link", { name: "Clean up old flags" })).toBeVisible();
  await toggles.getByRole("button", { name: /^All/ }).click();
  await page.getByRole("searchbox", { name: "Search plans" }).fill("class schedule");
  await expect(page).toHaveURL(/q=class/);
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Search plans" }).fill("nothing like this");
  await expect(page.getByText(/No plans match/)).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(list.getByRole("listitem")).toHaveCount(4);
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

test("a draft plan: one status line, the estimate before starting, criteria, tasks, the spec folded below", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page, { criteria: RUNNING_CRITERIA.map((c) => ({ ...c, met: false, evidence: [] })) });
  await page.goto("/plans/detail/?id=PLANA");
  await expect(page.getByRole("heading", { level: 1, name: "Add a class schedule page" })).toBeVisible();
  const summary = page.getByRole("list", { name: "About this plan" });
  await expect(summary).toContainText("Drafting");
  await expect(summary).toContainText("3 tasks to review, 1 dropped");
  await expect(summary).toContainText("your-team/web");
  await expect(summary).toContainText("Sends to GitHub issues");
  // What starting costs, before the button is pressed.
  await expect(page.getByTestId("plan-estimate")).toHaveText(
    "Approving all 3 tasks starts 3 to 4 runs, about $6.30 to $19.80 from your team's last 40 runs.",
  );
  const header = page.getByTestId("page-actions");
  await expect(header.getByRole("button", { name: "Approve and start" })).toBeVisible();
  await header.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Save as template", "Download the spec", "Delete plan"]);
  await page.keyboard.press("Escape");
  // In order: what done means, the tasks, the spec, details.
  const nav = page.getByRole("navigation", { name: "On this page" });
  await expect(nav.getByRole("link")).toHaveText(["What done means3", "Tasks4", "Spec", "Details"]);
  await expect(page.getByTestId("criteria-count")).toContainText("3 criteria, 0 proven");
  await expect(page.getByTestId("criterion")).toHaveCount(3);
  // The spec sits below the tasks, open while the plan is a draft.
  await expect(page.getByText("Why: add a class schedule page")).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Proposal" })).toBeVisible();
  const tasks = page.getByRole("list", { name: "Tasks" });
  await expect(tasks.getByTestId("task")).toHaveCount(4);
  await expect(tasks.getByRole("img", { name: "Dropped" })).toBeVisible();
  await expect(tasks.getByTestId("task").nth(3)).toContainText("after 1");
  await expect(tasks.getByTestId("task").nth(0).getByRole("button", { name: "Approve", exact: true })).toBeVisible();
  await expect(page.getByTestId("needs-strip")).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await shot(page, "plans-detail");
  expect(errors).toEqual([]);
});

test("Approve and start says what it starts and costs, then starts", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/plans/detail/?id=PLANA");
  await page.getByTestId("page-actions").getByRole("button", { name: "Approve and start" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Approve and start 3 tasks?" });
  await expect(dialog).toContainText("3 to 4 runs, about $6.30 to $19.80");
  await dialog.getByRole("button", { name: "Approve and start" }).click();
  await expect.poll(() => db.writes.map((w) => w.call)).toContain("POST /api/plans/PLANA/approve-and-execute");
  expect(errors).toEqual([]);
});

test("approving one task starts it and leaves the other drafts approvable", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/plans/detail/?id=PLANA");
  const heading = page.getByRole("heading", { level: 1, name: "Add a class schedule page" });
  await expect(heading).toBeVisible();
  await page.getByRole("list", { name: "Tasks" }).getByTestId("task").first().getByRole("button", { name: "Approve", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "Approve and start this task?" });
  await expect(dialog).toContainText("Runs like it cost about $2.10 to $4.95. The plan stays open for its other tasks.");
  db.slowPlan = true;
  await dialog.getByRole("button", { name: "Approve and start" }).click();
  // While the reload is in flight, the plan stays on screen.
  await page.waitForTimeout(400);
  await expect(heading).toBeVisible();
  expect(db.writes).toContainEqual({ call: "POST /api/plans/PLANA/tasks/T1/approve", body: null });
  const tasks = page.getByRole("list", { name: "Tasks" });
  await expect(tasks.getByRole("img", { name: "Queued" })).toHaveCount(1);
  // The plan runs and stays open: the two drafts still have their buttons,
  // and the strip asks for them by name.
  await expect(page.getByRole("list", { name: "About this plan" })).toContainText("Running");
  await expect(tasks.getByRole("button", { name: "Approve and start" })).toHaveCount(2);
  await expect(page.getByTestId("needs-item")).toHaveText(/Approve or drop the 2 tasks still in draft/);
  expect(errors).toEqual([]);
});

test("a task opens to what it says; edit sends only what changed, add sends the same body as before", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/plans/detail/?id=PLANA");
  await page.getByRole("button", { name: "Show details of Add the schedule table" }).click();
  await expect(page.getByText("Do add the schedule table")).toBeVisible();
  await expect(page.getByText("Done when", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove task Add the schedule table" })).toBeVisible();
  await shot(page, "plans-detail-task-open");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Title").fill("Add the schedule tables");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => db.writes.find((w) => w.call === "PUT /api/plans/PLANA/tasks/T1")?.body).toEqual({ title: "Add the schedule tables" });

  // Run after, from the open task.
  await page.getByRole("button", { name: "Show details of Show the schedule on the page" }).click();
  await pickOption(page.getByLabel("Run after"), "T1");
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

test("the Needs you strip names each exact ask with its button", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page, { planExtra: RUNNING_PLAN, tasks: runningTasks(), needs: RUNNING_NEEDS, criteria: RUNNING_CRITERIA });
  await page.goto("/plans/detail/?id=PLANA");
  const summary = page.getByRole("list", { name: "About this plan" });
  await expect(summary).toContainText("Needs you");
  await expect(summary).toContainText("1 of 5 merged, 1 needs you, 1 failed, 1 in review, 1 in draft");
  await expect(summary).toContainText("$19.50 over 5 runs");
  // The top action goes to what needs you.
  await expect(page.getByTestId("page-actions").getByRole("link", { name: "3 need you" })).toHaveAttribute("href", "#needs");
  const strip = page.getByTestId("needs-strip");
  const items = strip.getByTestId("needs-item");
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText("3.Approve pull request #53");
  await expect(items.nth(0)).toContainText("requires an approving review from a person");
  await expect(items.nth(0).getByRole("link", { name: /Approve #53/ })).toHaveAttribute("href", "https://github.com/your-team/web/pull/53");
  await expect(items.nth(0).getByRole("link", { name: "Open run" })).toHaveAttribute("href", /RUN53/);
  // A failed task says why, and Retry confirms with what a run costs.
  await expect(items.nth(1)).toContainText("Run timed out (exceeded execution time limit).");
  await items.nth(1).getByRole("button", { name: "Retry" }).click();
  const dialog = page.getByRole("alertdialog", { name: 'Retry "Write the tests"?' });
  await expect(dialog).toContainText("It starts a new run. Runs like it cost about $2.10 to $4.95.");
  await dialog.getByRole("button", { name: "Retry" }).click();
  // Its ticket was filed: the run is retried, no second ticket.
  await expect.poll(() => db.writes.map((w) => w.call)).toContain("POST /api/runs/RUN60/retry");
  expect(db.writes.map((w) => w.call)).not.toContain("POST /api/plans/PLANA/tasks/T4/force-run");
  await expect(items.nth(2)).toContainText("Approve or drop the 1 task still in draft");
  await expect(items.nth(2).getByRole("button", { name: "Approve the rest" })).toBeVisible();
  // Handled: the strip goes.
  db.needs = [];
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Add a class schedule page" })).toBeVisible();
  await expect(page.getByTestId("needs-strip")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("each task shows its pull requests as chips coloured by checks and review, with attempts, cost and drift", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page, { planExtra: RUNNING_PLAN, tasks: runningTasks(), needs: RUNNING_NEEDS, criteria: RUNNING_CRITERIA });
  await page.goto("/plans/detail/?id=PLANA");
  const rows = page.getByRole("list", { name: "Tasks" }).getByTestId("task");
  await expect(rows).toHaveCount(5);
  const chip = (row: number, n: number) => rows.nth(row).getByTestId("pr-chip").filter({ hasText: `#${n}` });
  await expect(chip(0, 41)).toHaveAttribute("data-tone", "merged");
  await expect(chip(0, 41)).toHaveAccessibleName(/Pull request #41, merged, 120 lines added and 8 removed/);
  await expect(chip(1, 52)).toHaveAttribute("data-tone", "waiting");
  await expect(chip(1, 52)).toHaveAccessibleName(/checks running/);
  await expect(chip(2, 53)).toHaveAttribute("data-tone", "waiting");
  await expect(chip(2, 53)).toHaveAccessibleName(/checks pass, waiting on a review/);
  await expect(chip(2, 50)).toHaveAttribute("data-tone", "closed");
  await expect(rows.nth(2)).toContainText("2 attempts");
  await expect(rows.nth(2)).toContainText("$9.80");
  await expect(rows.nth(2).getByTestId("drift-mark")).toHaveText("Out of scope");
  await expect(rows.nth(4).getByTestId("drift-mark")).toHaveText("Added");
  // A merged task is faded and marked merged; a failed one says why and offers Retry and Drop.
  await expect(rows.nth(0).getByRole("img", { name: "Merged" })).toBeVisible();
  await expect(rows.nth(3)).toContainText("Run timed out");
  await expect(rows.nth(3).getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(rows.nth(3).getByRole("button", { name: "Drop" })).toBeVisible();
  // The draft added after approval can still be approved.
  await expect(rows.nth(4).getByRole("button", { name: "Approve and start" })).toBeVisible();
  // Opening a task lists every attempt.
  await page.getByRole("button", { name: "Show details of Wire the schedule API" }).click();
  await expect(page.getByRole("link", { name: "Attempt 2" })).toHaveAttribute("href", /RUN53/);
  await expect(page.getByRole("link", { name: "Attempt 1" })).toHaveAttribute("href", /RUN50/);
  await expect(page.getByText("Changed since approval")).toBeVisible();
  // Once the plan runs, the spec is folded below the work.
  await expect(page.getByText("Why: add a class schedule page")).toBeHidden();
  await page.getByTestId("plan-spec").locator("summary").first().click();
  await expect(page.getByText("Why: add a class schedule page")).toBeVisible();
  // Criteria with their evidence.
  await expect(page.getByTestId("criteria-count")).toContainText("3 criteria, 1 proven");
  await expect(page.getByTestId("criteria-count")).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await shot(page, "plans-detail-running");
  expect(errors).toEqual([]);
});

test("a long plan is grouped by state, finished work folded, and what is open is remembered", async ({ page }) => {
  const errors = watchConsole(page);
  const many = [
    ...runningTasks(),
    ...[6, 7, 8, 9].map((i) =>
      task(`T${i}`, `Merged step ${i}`, "filed", i, { state: "merged", state_detail: `Pull request #${i + 70} merged`, prs: [pr(i + 70, "merged", { state: "merged" })] }),
    ),
  ];
  await mockApi(page, { planExtra: RUNNING_PLAN, tasks: many, needs: RUNNING_NEEDS });
  await page.goto("/plans/detail/?id=PLANA");
  await expect(page.getByTestId("task-group-needs_you")).toBeVisible();
  // Needs you first, merged last and folded.
  const groups = page.locator("[data-testid^=task-group-]");
  await expect(groups.first()).toHaveAttribute("data-testid", "task-group-needs_you");
  await expect(groups.last()).toHaveAttribute("data-testid", "task-group-merged");
  const merged = page.getByTestId("task-group-merged");
  await expect(merged.getByTestId("task")).toHaveCount(0);
  await merged.getByRole("button", { expanded: false }).click();
  await expect(merged.getByTestId("task")).toHaveCount(5);
  await page.getByRole("button", { name: "Show details of Write the tests" }).click();
  await expect(page.getByTestId("task-reason")).toContainText("Run timed out");
  // Reloaded, the same group is open and the same task too.
  await page.reload();
  await expect(page.getByTestId("task-group-merged").getByTestId("task")).toHaveCount(5);
  await expect(page.getByTestId("task-reason")).toContainText("Run timed out");
  await page.getByRole("searchbox", { name: "Search tasks" }).fill("print");
  await expect(page.locator("[data-testid=task]")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("a plan reads Done only when every task merged or was dropped", async ({ page }) => {
  const errors = watchConsole(page);
  await mockApi(page, {
    planExtra: { status: "done", state: "done", summary: "1 of 2 merged, 1 dropped", counts: counts({ merged: 1, dropped: 1 }), cost_usd: 3.4, attempts: 1, destination: "jira", executed_at: NOW, executed_by: "a-person" },
    tasks: [
      task("T1", "Add the schedule table", "filed", 0, {
        state: "merged", state_detail: "Pull request #41 merged", ticket_filed: true, prs: [pr(41, "merged", { state: "merged" })],
        runs: [{ run_id: "RUN41", status: "merged", created_at: NOW, cost_usd: 3.4 }], jira_ticket_key: "WEB-12", jira_ticket_url: "https://your-team.atlassian.net/browse/WEB-12",
      }),
      task("T2", "Show the schedule on the page", "rejected", 1, { state: "dropped" }),
    ],
    estimate: null,
  });
  await page.goto("/plans/detail/?id=PLANA");
  const summary = page.getByRole("list", { name: "About this plan" });
  await expect(summary).toContainText("Done");
  await expect(summary).toContainText("1 of 2 merged, 1 dropped");
  await expect(page.getByTestId("state-bar")).toHaveAttribute("aria-label", "Tasks: 1 merged, 1 dropped");
  // Nothing left to approve or act on.
  await expect(page.getByRole("button", { name: "Approve and start" })).toHaveCount(0);
  await expect(page.getByTestId("needs-strip")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Tasks" }).getByTestId("pr-chip")).toHaveAttribute("data-tone", "merged");
  await page.getByRole("button", { name: "Show details of Add the schedule table" }).click();
  await expect(page.getByRole("link", { name: "WEB-12" })).toBeVisible();
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
  const approve = page.getByTestId("page-actions").getByRole("button", { name: "Approve and start" });
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
