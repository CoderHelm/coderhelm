import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Every API call is answered here. Nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const REPO = "your-team/web";
const now = Date.now();
const micros = (daysAgo: number) => (now - daysAgo * 86_400_000) * 1000;
const iso = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString();

interface Mem {
  id: string; content: string; topic: string; pinned: boolean; source: "run" | "person";
  title?: string; added_by?: string; edited_by?: string; uses: number; created: number;
}

function seed(): Mem[] {
  return [
    { id: "m1", content: "Run unit tests with pnpm test:unit; the e2e suite needs staging.", topic: "procedure", pinned: true, source: "person", added_by: "admin@example.com", uses: 7, created: 20 },
    { id: "m2", content: "Prices come from the pricing service; never hardcode amounts in copy.", topic: "anti-pattern", pinned: false, source: "run", title: "Fix the checkout total after a coupon", uses: 3, created: 5 },
    { id: "m3", content: "Components live in src/components and use the shared Button.", topic: "code-style", pinned: false, source: "run", title: "Add the class filter chips", uses: 0, created: 2 },
  ];
}

function toItem(m: Mem) {
  return {
    id: m.id, content: m.content, memory_type: "semantic", tags: [], confidence: 0.9,
    created_at: micros(m.created), accessed_at: micros(m.created), access_count: 0,
    topic: m.topic, topic_label: m.topic, pinned: m.pinned,
    origin: { source: m.source, title: m.title, added_by: m.added_by, edited_by: m.edited_by, run_id: m.source === "run" ? "01RUN" : undefined },
    uses: m.uses,
    last_used: m.uses ? { at: iso(1), run_id: "01RUNLAST", title: "Show the schedule on the class page" } : null,
  };
}

const PROFILES = [
  {
    id: "reviewer", name: "Reviewer", role: "Reviews pull requests, comments on the exact lines, and approves when nothing is left to change.",
    uses_repo_memory: false,
    knows: [
      { label: "Review rules for this repo", detail: "Prefer small PRs. Flag missing migrations." },
      { label: "Lessons from ratings", detail: "1 note people left on its reviews; it reads them before every review." },
    ],
    learned: [{ text: "Ask for a flow test, not one test per function.", source: "A rating on PR #12", at: iso(3), link: "https://github.com/your-team/web/pull/12" }],
    activity_label: "reviews in the last 30 days (14 approved, 4 asked for changes)", activity_count: 18,
    recent: [{ title: "PR #31", at: iso(1), outcome: "Approved", link: "https://github.com/your-team/web/pull/31" }],
  },
  {
    id: "planner", name: "Planner", role: "Reads a ticket, works out the root cause and writes the plan the coding agent follows.",
    uses_repo_memory: true,
    knows: [{ label: "Memories about this repo", detail: "3 in all: 1 pinned (always used), 1 added by people." }, { label: "Systems it can look things up in", detail: "Production database" }],
    learned: [{ text: "Run unit tests with pnpm test:unit; the e2e suite needs staging.", source: "Added by admin@example.com · used on 7 tickets", at: iso(20) }],
    activity_label: "tickets planned in the last 30 days", activity_count: 9,
    recent: [{ title: "Fix the checkout total after a coupon", at: iso(5), outcome: "merged", link: "https://github.com/your-team/web/pull/29" }],
  },
  {
    id: "coder", name: "Coding agent", role: "Writes the change, runs the checks and opens the pull request. After each ticket it saves what it learned.",
    uses_repo_memory: true, knows: [{ label: "Memories about this repo", detail: "3 in all" }], learned: [],
    activity_label: "pull requests merged in the last 30 days", activity_count: 6, recent: [],
  },
  {
    id: "feedback", name: "Feedback agent", role: "Answers review comments on Coderhelm's pull requests and fixes the CI it broke.",
    uses_repo_memory: false, knows: [{ label: "The pull request's conversation", detail: "Every comment and review thread on the PR, and the CI results." }], learned: [],
    activity_label: "pull requests it pushed fixes to in the last 30 days", activity_count: 2, recent: [],
  },
];

interface Backend { calls: string[]; bodies: Record<string, unknown>[]; mems: Mem[]; role: string; fail: boolean }

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { calls: [], bodies: [], mems: seed(), role: "admin", fail: false, ...init };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    db.calls.push(`${method} ${p}${url.search}`);
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    if (body) db.bodies.push(body);
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: db.role });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: REPO, enabled: true, ticket_source: "jira" }, { name: "your-team/api", enabled: true, ticket_source: "jira" }] });
    if (p === "/api/memories/agents") {
      if (db.fail) return json(route, { error: "boom" }, 500);
      return json(route, { repo: url.searchParams.get("repo"), profiles: PROFILES });
    }
    if (p === "/api/memories/preview") {
      const pinned = db.mems.filter((m) => m.pinned).map(toItem);
      const recalled = /coupon|price/i.test(body?.text ?? "") ? [{ memory: toItem(db.mems.find((m) => m.id === "m2")!), score: 0.06 }] : [];
      return json(route, { pinned, recalled });
    }
    if (p === "/api/memories" && method === "GET") {
      if (db.fail) return json(route, { error: "boom" }, 500);
      if (url.searchParams.get("repo") !== REPO) return json(route, { memories: [], total: 0, page: 1, page_size: 100 });
      let items = [...db.mems];
      const q = url.searchParams.get("search");
      if (q) items = items.filter((m) => m.content.toLowerCase().includes(q.toLowerCase()));
      if (url.searchParams.get("pinned") === "true") items = items.filter((m) => m.pinned);
      const source = url.searchParams.get("source");
      if (source) items = items.filter((m) => m.source === source);
      const topic = url.searchParams.get("topic");
      if (topic) items = items.filter((m) => m.topic === topic);
      if (url.searchParams.get("sort") === "most_used") items.sort((a, b) => b.uses - a.uses);
      return json(route, { memories: items.map(toItem), total: items.length, page: 1, page_size: 100 });
    }
    if (p === "/api/memories" && method === "POST") {
      db.mems.push({ id: `m${db.mems.length + 1}`, content: body.content, topic: body.topic, pinned: body.pinned, source: "person", added_by: "admin@example.com", uses: 0, created: 0 });
      return json(route, { id: "new" });
    }
    const one = p.match(/^\/api\/memories\/([^/]+)$/);
    if (one && method === "PUT") {
      const m = db.mems.find((x) => x.id === one[1])!;
      if (body.content !== undefined) m.content = body.content;
      if (body.topic !== undefined) m.topic = body.topic;
      if (body.pinned !== undefined) m.pinned = body.pinned;
      m.edited_by = "admin@example.com";
      return json(route, { updated: m.id });
    }
    if (one && method === "DELETE") {
      db.mems = db.mems.filter((x) => x.id !== one[1]);
      return json(route, { deleted: one[1] });
    }
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  return db;
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

test("agent profiles say what each agent knows, learned and did", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/memory");
  await expect(page.getByRole("heading", { name: "Memory", exact: true })).toBeVisible();
  const reviewer = page.getByRole("button", { name: /Reviewer/ });
  await expect(reviewer).toContainText("18 reviews in the last 30 days");
  await expect(reviewer).toContainText("Doesn't use repo memories");
  await expect(page.getByRole("button", { name: /Planner/ })).toContainText("Uses this repo's memories");
  await reviewer.click();
  await expect(reviewer).toHaveAttribute("aria-expanded", "true");
  const profile = page.getByRole("region", { name: "Reviewer profile" });
  await expect(profile).toContainText("Review rules for this repo");
  await expect(profile).toContainText("Prefer small PRs. Flag missing migrations.");
  await expect(profile.getByRole("link", { name: "A rating on PR #12" })).toHaveAttribute("href", "https://github.com/your-team/web/pull/12");
  await expect(profile.getByRole("link", { name: "PR #31" })).toBeVisible();
  // The feedback agent keeps no memories, and says so.
  await page.getByRole("button", { name: /Feedback agent/ }).click();
  await expect(page.getByRole("region", { name: "Feedback agent profile" })).toContainText("keeps no memories of its own");
  expect(db.calls).toContain(`GET /api/memories/agents?repo=${encodeURIComponent(REPO)}`);
  await page.getByRole("button", { name: /Reviewer/ }).click();
  await shot(page, "memory-profiles");
});

test("memories are grouped by topic with where they came from and how often they are used", async ({ page }) => {
  await mockApi(page);
  await page.goto("/memory");
  const list = page.getByTestId("memory");
  await expect(list).toHaveCount(3);
  await expect(page.getByRole("heading", { name: /How things are done here/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Things to avoid/ })).toBeVisible();
  const pinned = list.filter({ hasText: "pnpm test:unit" });
  await expect(pinned).toContainText("Pinned");
  await expect(pinned).toContainText("Added by admin@example.com");
  await expect(pinned).toContainText("Used on 7 tickets, last “Show the schedule on the class page”");
  const learned = list.filter({ hasText: "pricing service" });
  await expect(learned).toContainText("Learned on “Fix the checkout total after a coupon”");
  await expect(list.filter({ hasText: "shared Button" })).toContainText("Not used yet");
  // Memories come first; who uses them is one strip under the list.
  const listTop = (await page.getByRole("heading", { name: /^Memories/ }).boundingBox())!.y;
  const stripTop = (await page.getByTestId("memory-agents").boundingBox())!.y;
  expect(listTop).toBeLessThan(stripTop);
  // Topic and sort sit together by the heading, at 1280 and on a phone: neither is alone on a row.
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    const topic = (await page.getByRole("combobox", { name: "Topic" }).boundingBox())!;
    const sortBox = (await page.getByRole("combobox", { name: "Sort" }).boundingBox())!;
    expect(Math.abs(topic.y - sortBox.y), `topic and sort on one row at ${width}`).toBeLessThan(8);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await shot(page, "memory-list");
});

test("filters, sort and search ask the server", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/memory");
  await expect(page.getByTestId("memory")).toHaveCount(3);
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Pinned" }).click();
  await expect(page.getByTestId("memory")).toHaveCount(1);
  await expect.poll(() => db.calls.some((c) => c.includes("pinned=true"))).toBe(true);
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "From tickets" }).click();
  await expect(page.getByTestId("memory")).toHaveCount(2);
  await expect.poll(() => db.calls.some((c) => c.includes("source=run"))).toBe(true);
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "All" }).click();
  await page.getByRole("combobox", { name: "Topic" }).selectOption("code-style");
  await expect(page.getByTestId("memory")).toHaveCount(1);
  await page.getByRole("combobox", { name: "Topic" }).selectOption("");
  // The first row can read the same before and after the sort, so wait for the call itself.
  await page.getByRole("combobox", { name: "Sort" }).selectOption("most_used");
  await expect(page.getByTestId("memory").first()).toContainText("pnpm test:unit");
  await expect.poll(() => db.calls.some((c) => c.includes("sort=most_used"))).toBe(true);
  await page.getByRole("searchbox", { name: "Search memories" }).fill("nothing like this");
  await expect(page.getByText("Nothing matches.")).toBeVisible();
  await expect(page).toHaveURL(/q=nothing/);
  await page.getByTestId("list-empty").getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByTestId("memory")).toHaveCount(3);
  await expect(page).not.toHaveURL(/q=/);
});

test("an admin can pin, edit and forget a memory", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/memory");
  const shared = page.getByTestId("memory").filter({ hasText: "shared Button" });
  // Each row's actions sit in one overflow menu.
  await expect(shared.getByRole("button", { name: "Pin" })).toHaveCount(0);
  await shared.getByRole("button", { name: "Actions for this memory" }).click();
  await page.getByRole("menuitem", { name: /^Pin/ }).click();
  await expect(page.getByTestId("memory").filter({ hasText: "shared Button" })).toContainText("Pinned");
  expect(db.bodies).toContainEqual({ repo: REPO, pinned: true });

  await page.getByTestId("memory").filter({ hasText: "shared Button" }).getByRole("button", { name: "Actions for this memory" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const editor = page.getByTestId("memory").filter({ has: page.getByLabel("Memory", { exact: true }) });
  await editor.getByLabel("Memory", { exact: true }).fill("Components live in src/components and use the shared Button and Card.");
  await editor.getByRole("combobox", { name: "Topic for this memory" }).selectOption("architecture");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  const edited = page.getByTestId("memory").filter({ hasText: "Button and Card" });
  await expect(edited).toContainText("Edited by admin@example.com");
  expect(db.bodies).toContainEqual({ repo: REPO, content: "Components live in src/components and use the shared Button and Card.", topic: "architecture" });

  await page.getByTestId("memory").filter({ hasText: "pricing service" }).getByRole("button", { name: "Actions for this memory" }).click();
  await page.getByRole("menuitem", { name: "Forget" }).click();
  // The shared confirm dialog has no dialog role; find it by its words.
  await expect(page.getByText("Forget this memory?")).toBeVisible();
  await page.getByRole("button", { name: "Forget it" }).click();
  await expect(page.getByTestId("memory")).toHaveCount(2);
  expect(db.calls).toContain(`DELETE /api/memories/m2?repo=${encodeURIComponent(REPO)}`);
});

test("teach it something adds a pinned memory", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/memory");
  await page.getByRole("button", { name: "Teach it something" }).first().click();
  const dialog = page.getByRole("dialog", { name: /Teach Coderhelm something/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Remember this" })).toBeDisabled();
  await dialog.getByLabel("What should it remember?").fill("Feature flags live in LaunchDarkly; never read env vars for them.");
  await dialog.getByLabel("Topic").selectOption("architecture");
  await dialog.getByLabel(/Pin it/).check();
  await shot(page, "memory-teach");
  await dialog.getByRole("button", { name: "Remember this" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("memory").filter({ hasText: "Feature flags" })).toContainText("Pinned");
  expect(db.bodies).toContainEqual({ repo: REPO, content: "Feature flags live in LaunchDarkly; never read env vars for them.", topic: "architecture", pinned: true });
});

test("try it shows what a ticket would bring along", async ({ page }) => {
  await mockApi(page);
  await page.goto("/memory");
  // The preview folds away under the list.
  await expect(page.getByLabel("Describe a ticket, the way someone would write it")).toBeHidden();
  await page.getByText("Preview what a ticket would bring along").click();
  await page.getByLabel("Describe a ticket, the way someone would write it").fill("The checkout total is wrong after a coupon");
  await page.getByRole("button", { name: "Show what it would remember" }).click();
  const section = page.getByRole("region", { name: "What would it remember for a ticket?" }).or(page.locator("section[aria-labelledby=try-heading]"));
  await expect(section).toContainText("Pinned, so always included");
  await expect(section).toContainText("pricing service");
  await expect(section).toContainText("match 75%");
  await page.getByLabel("Describe a ticket, the way someone would write it").fill("Rename the footer link");
  await page.getByRole("button", { name: "Show what it would remember" }).click();
  await expect(section).toContainText("Pinned, so always included");
  await expect(section).not.toContainText("pricing service");
});

test("an empty repo says how memories arrive", async ({ page }) => {
  await mockApi(page);
  await page.goto("/memory");
  await page.getByRole("combobox", { name: "Repository" }).selectOption("your-team/api");
  await expect(page.getByText("Nothing remembered about your-team/api yet")).toBeVisible();
  await expect(page.getByText("saves up to five things it learned")).toBeVisible();
  await shot(page, "memory-empty");
});

test("a member sees memories but can't change them", async ({ page }) => {
  await mockApi(page, { role: "member" });
  await page.goto("/memory");
  await expect(page.getByTestId("memory")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Teach it something" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Actions for this memory" })).toHaveCount(0);
});

test("a failed load says so", async ({ page }) => {
  await mockApi(page, { fail: true });
  await page.goto("/memory");
  await expect(page.getByText("We couldn't load the agents")).toBeVisible();
  await expect(page.getByText("We couldn't load the memories")).toBeVisible();
});

test("the memory icon: before and after", async ({ page }) => {
  // Not a page test: renders the old and new icons side by side for the PR.
  const old = `<path d="M9.5 2A5.5 5.5 0 005 6.36V6.5a4.5 4.5 0 00-.44 8.97A5.5 5.5 0 009.5 20h.5V2h-.5z" /><path d="M14.5 2A5.5 5.5 0 0119 6.36V6.5a4.5 4.5 0 01.44 8.97A5.5 5.5 0 0114.5 20h-.5V2h.5z" /><path d="M12 2v18" />`;
  const neu = `<path d="M6 3h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" /><path d="M8 3v18" /><path d="M13 3v6l2-1.5L17 9V3" />`;
  const svg = (inner: string, size: number) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  await page.setContent(`<body style="margin:0;background:#09090b;color:#d4d4d8;font:14px system-ui;padding:24px;display:flex;gap:48px">
    <div><p>Before</p>${svg(old, 16)} ${svg(old, 48)}</div><div><p>After</p>${svg(neu, 16)} ${svg(neu, 48)}</div></body>`);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.setViewportSize({ width: 360, height: 140 });
  await page.screenshot({ path: path.join(SHOTS_DIR, "memory-icon-before-after.png") });
});
