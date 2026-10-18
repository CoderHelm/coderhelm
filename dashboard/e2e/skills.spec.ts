import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Every API call is answered here. Nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

interface Repo { repo: string; added_by: string; added_at: string; sha: string; synced_at: string; error: string; items: number; skipped: string[] }
interface Item {
  repo: string; path: string; kind: "skill" | "agent" | "command"; name: string; description: string; sha: string; hash: string;
  enabled: boolean; files: string[]; uses: number; last_used_at: string; last_used_by: string; updated_at: string;
  asks: number; last_asked_at: string; switched_by: string; switched_at: string;
}
interface Ask {
  id: string; repo: string; path: string; run_id: string; sha: string; by: string; origin: string; question: string; context_chars: number; outcome: string; answer: string;
  model: string; input_tokens: number; output_tokens: number; ms: number; at: string;
}
interface Backend { repos: Repo[]; items: Item[]; asks: Ask[]; stats: unknown; role: string; calls: { method: string; path: string; body: Record<string, unknown> | null }[] }

const SHA = "4f2c9a1e7b3d5c8a9e0f1b2c3d4e5f6a7b8c9d0e";
const REPOS: Repo[] = [
  { repo: "acme/playbook", added_by: "admin@example.com", added_at: ago(3000), sha: SHA, synced_at: ago(4), error: "", items: 6, skipped: ["skills/debug/diagram.png: not text", "commands/huge-export.md: larger than 64 KB"] },
  { repo: "acme/runbooks", added_by: "admin@example.com", added_at: ago(1), sha: "", synced_at: "", error: "", items: 0, skipped: [] },
  { repo: "acme/old-guides", added_by: "lead@example.com", added_at: ago(9000), sha: "9a8b7c6d5e4f", synced_at: ago(25), error: "Coderhelm's GitHub App can't read this repository. Install the app on it, then sync again.", items: 1, skipped: [] },
];
const item = (p: Partial<Item> & Pick<Item, "path" | "kind" | "name" | "description">): Item => ({
  repo: "acme/playbook", sha: SHA, hash: "h", enabled: true, files: [], uses: 0, last_used_at: "", last_used_by: "", updated_at: ago(60),
  asks: 0, last_asked_at: "", switched_by: "", switched_at: "", ...p,
});
const ITEMS: Item[] = [
  item({ path: "skills/debug/SKILL.md", kind: "skill", name: "debug", description: "Find the cause before the fix: reproduce, read the logs around the failure, then follow the data back.", files: ["skills/debug/reference.md", "skills/debug/checklist.md"], uses: 14, last_used_at: ago(42), last_used_by: "planner" }),
  item({ path: "skills/api-conventions/SKILL.md", kind: "skill", name: "api-conventions", description: "How the team names things, structures modules and writes tests.", uses: 31, last_used_at: ago(8), last_used_by: "reviewer" }),
  item({ path: "skills/copy-tone/SKILL.md", kind: "skill", name: "copy-tone", description: "Plain words in user-facing copy and pull request text.", enabled: false }),
  item({ path: "agents/spec-checker.md", kind: "agent", name: "spec-checker", description: "Checks a spec or ticket for gaps, contradictions and untestable requirements before work starts.", uses: 3, last_used_at: ago(120), last_used_by: "reviewer (asked)", asks: 2, last_asked_at: ago(35) }),
  item({ path: "agents/tech-debt-manager.md", kind: "agent", name: "tech-debt-manager", description: "Shortcuts." }),
  item({ path: "commands/release-notes.md", kind: "command", name: "release-notes", description: "Write release notes from the merged pull requests since the last tag.", uses: 2, last_used_at: ago(2000), last_used_by: "coder" }),
  item({ repo: "acme/old-guides", sha: "9a8b7c6d5e4f", path: ".claude/commands/deploy.md", kind: "command", name: "deploy", description: "The old deploy checklist.", enabled: false }),
];
const BODY = `---
name: debug
description: Find the cause before the fix.
---
# Debug

1. Reproduce it. Write down the exact record, page and time.
2. Read the logs around that time for errors that name the record.
3. If the data is wrong, follow it back to the code that wrote it.
4. If the data is right, the bug is in the code that reads or shows it.
`;

const AGENT_BODY = `---
name: spec-checker
description: Checks a spec or ticket for gaps, contradictions and untestable requirements before work starts.
tools: Read, Grep, Bash, WebFetch
model: opus
---
You review specs before work starts. For each requirement, say whether it can be tested,
what is missing, and what contradicts something else. Be specific; quote the line.
`;
const ASKS: Ask[] = [
  { id: "01J3", repo: "acme/playbook", path: "agents/spec-checker.md", run_id: "", sha: SHA, by: "reviewer", origin: "acme/web#412", question: "Does this PR's spec for the refund flow cover partial refunds and what happens when the payment provider is down?", context_chars: 6120, outcome: "answered",
    answer: "Two gaps.\n\n1. Partial refunds: the spec says \"refund the order\" but never says whether a line item can be refunded alone. Untestable as written.\n2. Provider outage: nothing says what the customer sees or whether the refund is retried. Add a retry rule and a message.",
    model: "claude-opus-4-8", input_tokens: 3480, output_tokens: 410, ms: 14200, at: ago(35) },
  { id: "01J2", repo: "acme/playbook", path: "agents/spec-checker.md", run_id: "", sha: SHA, by: "admin@example.com (try)", origin: "", question: "Is \"the page should load fast\" a testable requirement?", context_chars: 0, outcome: "answered",
    answer: "No. Give a number and a condition, for example: the first page of results shows within 1.5 s at the 95th percentile on a mid-range phone.",
    model: "claude-opus-4-8", input_tokens: 610, output_tokens: 95, ms: 4100, at: ago(300) },
  { id: "01J1", repo: "acme/playbook", path: "agents/spec-checker.md", run_id: "run_77", sha: "1111111aaaa", by: "planner", origin: "acme/api · ABC-88", question: "Check this ticket for contradictions before I plan it.", context_chars: 2200, outcome: "timed_out", answer: "",
    model: "claude-opus-4-8", input_tokens: 0, output_tokens: 0, ms: 120000, at: ago(2900) },
];

const day = (back: number) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);
const STATS = {
  days_covered: 30,
  since: day(29),
  reads: 48,
  asks: 5,
  answered: 4,
  no_answer: 1,
  tries: 1,
  input_tokens: 15400,
  output_tokens: 1900,
  median_answer_ms: 12400,
  days: Array.from({ length: 30 }, (_, i) => {
    const back = 29 - i;
    const reads = [0, 3, 1, 4, 0, 6, 2][back % 7] * (back < 20 ? 1 : 0);
    const asks = back === 1 ? 3 : back === 9 ? 2 : 0;
    return { date: day(back), reads, asks, answered: back === 1 ? 2 : asks };
  }),
  by_reader: [
    { reader: "planner", reads: 12, asks: 2 },
    { reader: "coder", reads: 21, asks: 0 },
    { reader: "reviewer", reads: 15, asks: 3 },
  ],
  top: [
    { repo: "acme/playbook", path: "skills/api-conventions/SKILL.md", name: "api-conventions", kind: "skill", reads: 26, asks: 0, answered: 0 },
    { repo: "acme/playbook", path: "skills/debug/SKILL.md", name: "debug", kind: "skill", reads: 14, asks: 0, answered: 0 },
    { repo: "acme/playbook", path: "agents/spec-checker.md", name: "spec-checker", kind: "agent", reads: 0, asks: 5, answered: 4 },
    { repo: "acme/playbook", path: "commands/release-notes.md", name: "release-notes", kind: "command", reads: 2, asks: 0, answered: 0 },
  ],
  unused_count: 1,
  unused: [{ repo: "acme/playbook", path: "agents/tech-debt-manager.md", name: "tech-debt-manager", kind: "agent" }],
};

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { repos: structuredClone(REPOS), items: structuredClone(ITEMS), asks: structuredClone(ASKS), stats: structuredClone(STATS), role: "admin", calls: [], ...init };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    const body = req.postData() ? (JSON.parse(req.postData() as string) as Record<string, unknown>) : null;
    db.calls.push({ method, path: p, body });
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: db.role });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/skills/stats") return db.stats === null ? json(route, { error: "Unavailable" }, 500) : json(route, db.stats);
    if (p === "/api/skills" && method === "GET") return json(route, { repos: db.repos, items: db.items, can_manage: db.role === "admin" || db.role === "owner" });
    if (p === "/api/skills/repos" && method === "POST") {
      const repo = String(body?.repo ?? "");
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return json(route, { error: "Give the repository as owner/name." }, 400);
      db.repos.push({ repo, added_by: "admin@example.com", added_at: new Date().toISOString(), sha: "", synced_at: "", error: "", items: 0, skipped: [] });
      return json(route, { ok: true, repo, syncing: true });
    }
    if (/^\/api\/skills\/repos\/[^/]+\/[^/]+\/sync$/.test(p)) return json(route, { ok: true, syncing: true });
    if (/^\/api\/skills\/repos\/[^/]+\/[^/]+$/.test(p) && method === "DELETE") {
      const repo = p.split("/").slice(4, 6).map(decodeURIComponent).join("/");
      db.repos = db.repos.filter((r) => r.repo !== repo);
      db.items = db.items.filter((i) => i.repo !== repo);
      return json(route, { ok: true });
    }
    if (p === "/api/skills/item" && method === "GET") {
      const it = db.items.find((i) => i.repo === url.searchParams.get("repo") && i.path === url.searchParams.get("path"));
      if (!it) return json(route, { error: "No such skill." }, 404);
      return json(route, it.kind === "agent" ? { ...it, body: AGENT_BODY, prompt: "You are one of this team's own agents, asked a question by Coderhelm's reviewer.\n\n## Your brief\nYou review specs before work starts." } : { ...it, body: BODY });
    }
    if (p === "/api/skills/item" && method === "PUT") {
      const it = db.items.find((i) => i.repo === body?.repo && i.path === body?.path);
      if (!it) return json(route, { error: "No such skill." }, 404);
      it.enabled = Boolean(body?.enabled);
      Object.assign(it, { switched_by: "admin@example.com", switched_at: new Date().toISOString() });
      return json(route, { ok: true, enabled: it.enabled });
    }
    if (p === "/api/runs/run_77") return json(route, { run_id: "run_77", status: "completed", ticket_id: "ABC-88", title: "Add partial refunds", repo: "acme/api", created_at: ago(2900), pass_history: [], progress_notes: [] });
    if (/^\/api\/runs\/run_77\/agent-log$/.test(p)) return json(route, { passes: [], live_events: [] });
    if (/^\/api\/runs\/run_77\/traces$/.test(p)) return json(route, { traces: [] });
    if (p === "/api/skills/asks" && method === "GET") {
      const runId = url.searchParams.get("run_id");
      if (runId) return json(route, { asks: db.asks.filter((a) => a.run_id === runId) });
      const id = url.searchParams.get("id");
      if (!id) return json(route, { asks: db.asks, tries_per_day: 20, tries_left: 20 - db.asks.filter((a) => a.by.endsWith("(try)")).length });
      const a = db.asks.find((x) => x.id === id);
      if (!a) return json(route, { error: "No such ask." }, 404);
      // The worker answers on the second check.
      if (a.outcome === "pending" && db.calls.filter((c) => c.path === p && c.method === "GET").length > 2) {
        Object.assign(a, { outcome: "answered", answer: "Testable once it names a number: say how fast, on what, and how often.", model: "claude-opus-4-8", input_tokens: 520, output_tokens: 60, ms: 3800 });
      }
      return json(route, a);
    }
    if (p === "/api/skills/asks" && method === "POST") {
      const a: Ask = { id: "01J9", repo: String(body?.repo), path: String(body?.path), run_id: "", sha: SHA, by: "admin@example.com (try)", origin: "", question: String(body?.question ?? ""), context_chars: String(body?.context ?? "").length, outcome: "pending", answer: "", model: "", input_tokens: 0, output_tokens: 0, ms: 0, at: new Date().toISOString() };
      db.asks.unshift(a);
      return json(route, { id: a.id });
    }
    return json(route, {});
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

test("no repository yet: the page says what Coderhelm reads and how to connect one", async ({ page }) => {
  await mockApi(page, { repos: [], items: [] });
  await page.goto("/skills");
  await expect(page.getByRole("heading", { name: "Skills", exact: true })).toBeVisible();
  await expect(page.getByText("No repository connected.")).toBeVisible();
  await expect(page.getByLabel("Connect a repository")).toBeVisible();
  await shot(page, "skills-empty");
});

test("repositories in each state, items by kind, agents marked as askable, one open", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/skills");
  await expect(page.getByText("In step")).toBeVisible();
  await expect(page.getByText("Reading…")).toBeVisible();
  await expect(page.getByText("Last sync failed")).toBeVisible();
  await expect(page.getByText("Install the app on it, then sync again.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Skills \(3\)/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Agents \(2\)/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Commands \(2\)/ })).toBeVisible();
  await expect(page.getByText("Agent · can be asked")).toHaveCount(2);
  await expect(page.getByRole("switch", { name: "Let Coderhelm read copy-tone" })).toHaveAttribute("aria-checked", "false");

  await page.getByRole("button", { name: "skill:debug" }).click();
  await expect(page.getByText("Reproduce it. Write down the exact record")).toBeVisible();
  await expect(page.getByText("Files with it: skills/debug/reference.md, skills/debug/checklist.md")).toBeVisible();
  await shot(page, "skills-list");

  await page.getByRole("switch", { name: "Let Coderhelm read copy-tone" }).click();
  await expect(page.getByRole("switch", { name: "Let Coderhelm read copy-tone" })).toHaveAttribute("aria-checked", "true");
  expect(db.calls.some((c) => c.method === "PUT" && c.path === "/api/skills/item" && c.body?.enabled === true)).toBe(true);
});

test("page stats: reads and asks per day, who used them, most used, and what sits unused", async ({ page }) => {
  await mockApi(page);
  await page.goto("/skills");
  const usage = page.getByRole("region", { name: "Use in the last 30 days" });
  await expect(usage).toBeVisible();
  await expect(usage.getByRole("paragraph").filter({ hasText: /^Reads$/ })).toBeVisible();
  await expect(usage.getByText("48", { exact: true })).toBeVisible();
  await expect(usage.getByText("4 answered, 1 not")).toBeVisible();
  await expect(usage.getByText("12 s", { exact: true })).toBeVisible();
  await expect(usage.getByRole("img", { name: /^Busiest day .*: \d+ reads?, \d+ asks?\.$/ })).toBeVisible();
  await expect(usage.getByText("21 reads · 0 asks")).toBeVisible();
  await expect(usage.getByRole("link", { name: "agent:spec-checker" })).toHaveAttribute("href", /\/skills\/agent\/?\?repo=acme%2Fplaybook&path=agents%2Fspec-checker\.md/);
  await expect(usage.getByText("5 asks, 4 answered")).toBeVisible();
  await expect(usage.getByRole("heading", { name: "Switched on but not used" })).toBeVisible();
  await expect(usage.getByRole("link", { name: "agent:tech-debt-manager" })).toBeVisible();
  await expect(usage.getByText("Tries from agent pages (1) aren't counted here.")).toBeVisible();
  await shot(page, "skills-stats");
});

test("page stats: nothing used yet says so, and a failed stats call leaves the page working", async ({ page }) => {
  const db = await mockApi(page, { stats: { ...STATS, reads: 0, asks: 0, answered: 0, no_answer: 0, top: [], days: STATS.days.map((d) => ({ ...d, reads: 0, asks: 0, answered: 0 })) } });
  await page.goto("/skills");
  await expect(page.getByText("Coderhelm hasn't read a skill or asked an agent yet.")).toBeVisible();
  db.stats = null;
  await page.reload();
  await expect(page.getByRole("heading", { name: /Skills \(3\)/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Use in the last 30 days" })).toHaveCount(0);
});

test("connect a repository and sync another", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/skills");
  await page.getByLabel("Connect a repository").fill("acme/handbook");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText("acme/handbook", { exact: true })).toBeVisible();
  expect(db.calls.some((c) => c.method === "POST" && c.path === "/api/skills/repos" && c.body?.repo === "acme/handbook")).toBe(true);
  await page.getByRole("button", { name: "Sync now" }).first().click();
  await expect.poll(() => db.calls.some((c) => c.path === "/api/skills/repos/acme/playbook/sync")).toBe(true);
});

test("members see the items but can't change them", async ({ page }) => {
  await mockApi(page, { role: "member" });
  await page.goto("/skills");
  await expect(page.getByText("In step")).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sync now" })).toHaveCount(0);
  await expect(page.getByLabel("Connect a repository")).toHaveCount(0);
});

const AGENT_URL = "/skills/agent?repo=acme%2Fplaybook&path=agents%2Fspec-checker.md";

test("an agent's page: when it's asked, how it runs, recent asks and its instructions", async ({ page }) => {
  await mockApi(page);
  await page.goto("/skills");
  await expect(page.getByText("asked 2 times, last 35 min ago")).toBeVisible();
  await expect(page.getByText("Short description: Coderhelm's agents decide when to ask it from this line.")).toBeVisible();
  await page.getByRole("region", { name: /Agents \(2\)/ }).getByRole("link", { name: "agent:spec-checker" }).click();
  await expect(page).toHaveURL(/\/skills\/agent\/?\?repo=acme%2Fplaybook&path=agents%2Fspec-checker\.md/);
  await expect(page.getByRole("heading", { name: "spec-checker", level: 1 })).toBeVisible();
  await expect(page.getByText("Coderhelm asks this agent when")).toBeVisible();
  await expect(page.getByText("A Coderhelm setting. It doesn't change the file.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open on GitHub" })).toHaveAttribute("href", `https://github.com/acme/playbook/blob/${SHA}/agents/spec-checker.md`);
  await expect(page.getByText("None when Coderhelm asks it.")).toBeVisible();
  await expect(page.getByText("Read, Grep, Bash, WebFetch", { exact: true })).toBeVisible();
  await expect(page.getByText("Your team's heavy model")).toBeVisible();
  await expect(page.getByRole("link", { name: "acme/web#412" })).toHaveAttribute("href", "https://github.com/acme/web/issues/412");
  await expect(page.getByRole("link", { name: "View run" })).toHaveAttribute("href", /\/runs\/detail\/?\?id=run_77/);
  await expect(page.getByText("(an older version)")).toBeVisible();
  await expect(page.getByText("sent 6,120 characters of context, not kept")).toBeVisible();
  // Instructions render as text, the file's settings fold away.
  await expect(page.getByText("You review specs before work starts.")).toBeVisible();
  await expect(page.getByText("tools: Read, Grep, Bash, WebFetch")).toBeHidden();
  await shot(page, "agent-page");

  await page.getByRole("button", { name: "No answer" }).click();
  await expect(page.getByText("Check this ticket for contradictions before I plan it.")).toBeVisible();
  await expect(page.getByText("Does this PR's spec for the refund flow")).toHaveCount(0);
});

test("an admin tries the agent, sees what gets sent, and asks a past question again", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto(AGENT_URL);
  await expect(page.getByText("19 of 20 tries left today")).toBeVisible();
  await page.getByRole("button", { name: "Ask again" }).first().click();
  await expect(page.getByLabel("Question")).toHaveValue(/refund flow/);
  await page.getByLabel("Question").fill("Is \"the page should load fast\" testable?");
  await page.getByLabel(/Context/).fill("Spec line 4: the page should load fast.");
  await page.getByRole("button", { name: "What gets sent" }).click();
  await expect(page.getByText(/--- The question ---\s+Is "the page should load fast" testable\?/)).toBeVisible();
  await page.getByRole("button", { name: "Ask spec-checker" }).click();
  await expect(page.getByRole("button", { name: "Copy" })).toBeVisible({ timeout: 15_000 });
  const post = db.calls.find((c) => c.method === "POST" && c.path === "/api/skills/asks");
  expect(post?.body).toEqual({ repo: "acme/playbook", path: "agents/spec-checker.md", question: "Is \"the page should load fast\" testable?", context: "Spec line 4: the page should load fast." });
  await shot(page, "agent-try");
});

test("members see an agent's asks but can't try it or switch it", async ({ page }) => {
  await mockApi(page, { role: "member" });
  await page.goto(AGENT_URL);
  await expect(page.getByRole("heading", { name: "spec-checker", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "acme/web#412" })).toBeVisible();
  await expect(page.getByText("Admins can try this agent with a question of their own.")).toBeVisible();
  await expect(page.getByLabel("Question")).toHaveCount(0);
  await expect(page.getByRole("switch")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask again" })).toHaveCount(0);
});

test("an agent with no asks yet, and an unknown agent", async ({ page }) => {
  await mockApi(page, { asks: [] });
  await page.goto(AGENT_URL);
  await expect(page.getByText("Nobody has asked spec-checker anything yet.")).toBeVisible();
  await page.goto("/skills/agent?repo=acme%2Fplaybook&path=agents%2Fgone.md");
  await expect(page.getByText("Agent not found")).toBeVisible();
});

test("a run's page lists the team agents it asked, linked to each agent", async ({ page }) => {
  await mockApi(page);
  await page.goto("/runs/detail?id=run_77");
  await expect(page.getByRole("heading", { name: "Team agents asked (1)" })).toBeVisible();
  await expect(page.getByText("Check this ticket for contradictions before I plan it.")).toBeVisible();
  await expect(page.getByText("Took too long")).toBeVisible();
  await expect(page.getByRole("link", { name: "spec-checker" })).toHaveAttribute("href", /\/skills\/agent\/?\?repo=acme%2Fplaybook&path=agents%2Fspec-checker\.md/);
});
