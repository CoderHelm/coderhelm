import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Every API call is answered here. Nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

interface Repo { repo: string; added_by: string; added_at: string; sha: string; synced_at: string; error: string; items: number; skipped: string[] }
interface Item {
  repo: string; path: string; kind: "skill" | "agent" | "command"; name: string; description: string; sha: string; hash: string;
  enabled: boolean; files: string[]; missing_tools: string[]; uses: number; last_used_at: string; last_used_by: string; updated_at: string;
  asks: number; last_asked_at: string; switched_by: string; switched_at: string;
  compat?: { status: string; summary: string; needs: string[]; need_items?: { name: string; action: string; local?: boolean; instead?: string }[]; at: string; error: string; current: boolean } | null;
  use_translated?: boolean; translated_by?: string; translated_at?: string;
  always_apply?: { on: boolean; repos: string[]; passes: string[]; paths: string[]; by: string; at: string };
  suggestion?: { repos: string[]; passes: string[]; paths: string[]; reason: string; at: string } | null;
  reviews?: { auto: string[]; set: boolean; steps: string[]; effective: string[]; by: string; at: string };
}
interface Ask {
  id: string; repo: string; path: string; run_id: string; sha: string; by: string; origin: string; question: string; context_chars: number; outcome: string; answer: string;
  model: string; input_tokens: number; output_tokens: number; ms: number; at: string;
}
interface Backend { repos: Repo[]; items: Item[]; asks: Ask[]; stats: unknown; role: string; checks: number; calls: { method: string; path: string; body: Record<string, unknown> | null }[] }

const SHA = "4f2c9a1e7b3d5c8a9e0f1b2c3d4e5f6a7b8c9d0e";
const REPOS: Repo[] = [
  { repo: "acme/playbook", added_by: "admin@example.com", added_at: ago(3000), sha: SHA, synced_at: ago(4), error: "", items: 6, skipped: ["skills/debug/diagram.png: not text", "commands/huge-export.md: larger than 64 KB"] },
  { repo: "acme/runbooks", added_by: "admin@example.com", added_at: ago(1), sha: "", synced_at: "", error: "", items: 0, skipped: [] },
  { repo: "acme/old-guides", added_by: "lead@example.com", added_at: ago(9000), sha: "9a8b7c6d5e4f", synced_at: ago(25), error: "Coderhelm's GitHub App can't read this repository. Install the app on it, then sync again.", items: 1, skipped: [] },
];
const item = (p: Partial<Item> & Pick<Item, "path" | "kind" | "name" | "description">): Item => ({
  repo: "acme/playbook", sha: SHA, hash: "h", enabled: true, files: [], missing_tools: [], uses: 0, last_used_at: "", last_used_by: "", updated_at: ago(60),
  asks: 0, last_asked_at: "", switched_by: "", switched_at: "", ...p,
});
// Each need is something to connect, unless named in LOCAL: those assume a
// person's own machine, with what Coderhelm does instead.
const LOCAL: Record<string, string> = { "Local files": "Reads the repository and the team's connected sources instead" };
const checked = (status: string, summary: string, needs: string[] = [], current = true) => ({
  status,
  summary,
  needs,
  at: ago(30),
  error: "",
  current,
  need_items: needs.map((name) => (LOCAL[name] ? { name, action: "none", local: true, instead: LOCAL[name] } : { name, action: "connect" })),
});
const DEBUG_SUMMARY = "1 of 5 steps run as written · 2 translated · 1 needs Monitoring · 1 write blocked";
const ITEMS: Item[] = [
  item({ path: "skills/debug/SKILL.md", kind: "skill", name: "debug", description: "Find the cause before the fix: reproduce, read the logs around the failure, then follow the data back.", files: ["skills/debug/reference.md", "skills/debug/checklist.md"], uses: 14, last_used_at: ago(42), last_used_by: "planner", compat: checked("needs_tools", DEBUG_SUMMARY, ["Monitoring", "Wiki writes"]) }),
  item({ path: "skills/api-conventions/SKILL.md", kind: "skill", name: "api-conventions", description: "How the team names things, structures modules and writes tests.", uses: 31, last_used_at: ago(8), last_used_by: "reviewer", compat: checked("ready", "3 of 3 steps run as written") }),
  item({ path: "skills/copy-tone/SKILL.md", kind: "skill", name: "copy-tone", description: "Plain words in user-facing copy and pull request text.", enabled: false, compat: checked("translated", "1 of 2 steps run as written · 1 translated"), use_translated: true }),
  item({ path: "agents/spec-checker.md", kind: "agent", name: "spec-checker", description: "Checks a spec or ticket for gaps, contradictions and untestable requirements before work starts.", uses: 3, last_used_at: ago(120), last_used_by: "reviewer (asked)", asks: 2, last_asked_at: ago(35), missing_tools: ["Read", "Grep", "Bash", "WebFetch"], reviews: { auto: ["plan"], set: false, steps: [], effective: ["plan"], by: "", at: "" } }),
  item({ path: "agents/tech-debt-manager.md", kind: "agent", name: "tech-debt-manager", description: "Shortcuts." }),
  item({ path: "commands/release-notes.md", kind: "command", name: "release-notes", description: "Write release notes from the merged pull requests since the last tag.", uses: 2, last_used_at: ago(2000), last_used_by: "coder", missing_tools: ["Bash", "mcp__tracker__list_issues"] }),
  item({ repo: "acme/old-guides", sha: "9a8b7c6d5e4f", path: ".claude/commands/deploy.md", kind: "command", name: "deploy", description: "The old deploy checklist.", enabled: false, compat: checked("needs_tools", "0 of 2 steps run as written · 1 needs Monitoring", ["Monitoring", "Local files"]) }),
];

// The full check of the debug skill, as its page gets it.
const req = (asks: string, status: string, uses: string[], extra: Record<string, string> = {}) => ({ asks, kind: "tool", status, uses, write: "none", needs: "", fix: "", connect: "none", ...extra });
const DEBUG_COMPAT = {
  steps: [
    { title: "Reproduce it", does: "Write down the exact record, page and time.", dropped: false, status: "available", requirements: [] },
    { title: "Read the logs", does: "Search the service logs around that time.", dropped: false, status: "translated", requirements: [req("CloudWatch logs", "translated", ["logs_search"], { kind: "data" })] },
    { title: "Check the data", does: "Query the record in the database.", dropped: false, status: "translated", requirements: [req("psql", "translated", ["db_query"], { kind: "command" })] },
    { title: "Check deploy markers", does: "Look for a deploy right before the failure.", dropped: false, status: "missing", requirements: [req("list_change_events", "missing", [], { needs: "Monitoring", fix: "Connect your monitoring tool's MCP server.", connect: "plugins" }), req("git log", "missing", [], { kind: "command", needs: "Commit history", fix: "Coderhelm's GitHub connection doesn't do this yet.", connect: "github", action: "none" })] },
    { title: "Write the lesson", does: "Append what was learned to the team wiki page.", dropped: false, status: "blocked", requirements: [req("updatePage", "blocked", [], { write: "outside", needs: "Wiki writes", fix: "Coderhelm only reads outside systems here." })] },
  ],
  counts: { steps: 5, as_written: 1, translated: 2, missing: 1, blocked: 1 },
  needs: [
    { name: "Monitoring", fix: "Connect your monitoring tool's MCP server.", connect: "plugins", status: "missing", steps: 1 },
    { name: "Wiki writes", fix: "Coderhelm only reads outside systems here.", connect: "none", status: "blocked", steps: 1 },
    { name: "Commit history", fix: "Coderhelm's GitHub connection doesn't do this yet.", connect: "github", action: "none", status: "missing", steps: 1 },
  ],
  notes: ["1 step had no title; it was made from what it does."],
  model: "light-model", input_tokens: 9100, output_tokens: 3200, cost_usd: 0.034, ms: 41000,
};
const DEBUG_TRANSLATED = `# Debug

1. Reproduce it. Write down the exact record, page and time.
2. Search the service logs with \`logs_search\` around that time for errors that name the record.
3. If the data is wrong, query it with \`db_query\` and follow it back to the code that wrote it.
4. If the data is right, the bug is in the code that reads or shows it.
GAP: Deploy markers — look for a recent deploy — not connected in Coderhelm (connect your monitoring tool)`;
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
  const db: Backend = { repos: structuredClone(REPOS), items: structuredClone(ITEMS), asks: structuredClone(ASKS), stats: structuredClone(STATS), role: "admin", checks: 0, calls: [], ...init };
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
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
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
      if (it.kind === "agent") {
        const agent_tools = it.name === "spec-checker"
          ? { declared: ["Read", "Grep", "Bash", "WebFetch", "Write"], granted: ["read_file", "read_file_lines", "search_code"], missing: ["Bash", "WebFetch"], blocked: ["Write"] }
          : { declared: [], granted: [], missing: [], blocked: [] };
        return json(route, { ...it, body: AGENT_BODY, agent_tools, prompt: "You are one of this team's own agents, asked a question by Coderhelm's reviewer.\n\n## Your brief\nYou review specs before work starts.", translated: "" });
      }
      const full = it.name === "debug" && it.compat ? { ...it.compat, ...DEBUG_COMPAT, needs: it.compat.needs, needs_detail: DEBUG_COMPAT.needs } : it.compat;
      return json(route, { ...it, body: BODY, compat: full, translated: it.compat && it.name === "debug" ? DEBUG_TRANSLATED : "" });
    }
    if (p === "/api/skills/recheck" && method === "POST") {
      db.checks++;
      const it = db.items.find((i) => i.repo === body?.repo && i.path === body?.path);
      // The worker lands the new check a moment later.
      if (it?.compat) setTimeout(() => Object.assign(it.compat!, { at: new Date().toISOString() }), 300);
      return json(route, { ok: true, checking: true });
    }
    if (p === "/api/skills/translated" && method === "PUT") {
      const it = db.items.find((i) => i.repo === body?.repo && i.path === body?.path);
      if (!it) return json(route, { error: "No such skill." }, 404);
      Object.assign(it, { use_translated: Boolean(body?.enabled), translated_by: "admin@example.com", translated_at: new Date().toISOString() });
      return json(route, { ok: true, use_translated: it.use_translated });
    }
    if (p === "/api/skills/item" && method === "PUT") {
      const it = db.items.find((i) => i.repo === body?.repo && i.path === body?.path);
      if (!it) return json(route, { error: "No such skill." }, 404);
      it.enabled = Boolean(body?.enabled);
      Object.assign(it, { switched_by: "admin@example.com", switched_at: new Date().toISOString() });
      return json(route, { ok: true, enabled: it.enabled });
    }
    if (p === "/api/skills/always" && method === "PUT") {
      const it = db.items.find((i) => i.repo === body?.repo && i.path === body?.path);
      if (!it) return json(route, { error: "No such skill." }, 404);
      if (it.kind === "agent") return json(route, { error: "Agents are asked, not read, so they can't be always applied." }, 400);
      // The gateway tidies a folder glob the way the worker reads it.
      const paths = ((body?.paths as string[]) ?? []).map((g) => (g.endsWith("/") ? `${g}**` : g));
      it.always_apply = { on: Boolean(body?.on), repos: (body?.repos as string[]) ?? [], passes: (body?.passes as string[]) ?? [], paths, by: "admin@example.com", at: new Date().toISOString() };
      return json(route, { ok: true, always_apply: it.always_apply });
    }
    if (p === "/api/skills/reviews" && method === "PUT") {
      const it = db.items.find((i) => i.repo === body?.repo && i.path === body?.path);
      if (!it) return json(route, { error: "No such skill." }, 404);
      if (it.kind !== "agent") return json(route, { error: "Only team agents run as review steps; skills and commands are read." }, 400);
      const set = Boolean(body?.set);
      const steps = set ? ((body?.steps as string[]) ?? []) : [];
      const auto = it.reviews?.auto ?? [];
      it.reviews = { auto, set, steps, effective: set ? steps : auto, by: "admin@example.com", at: new Date().toISOString() };
      return json(route, { ok: true, reviews: it.reviews });
    }
    if (p === "/api/repos" && method === "GET") return json(route, { repos: [
      { name: "acme/web", enabled: true, ticket_source: "github" },
      { name: "acme/api", enabled: true, ticket_source: "github" },
      { name: "acme/archived", enabled: false, ticket_source: "github" },
    ] });
    if (p === "/api/reviewer/review") return json(route, { sk: "REVIEW#acme/web#000412#t", repo: "acme/web", pr_number: 412, head_sha: SHA, verdict: "APPROVE", risk: "low", body: "Looks good.", posted_as: "COMMENT", trigger: "push", action_summary: "", thumbs_up: 0, thumbs_down: 0, rating_comments: [], created_at: ago(30), applied_standards: ["api-conventions", "copy-tone"] });
    if (p === "/api/runs/run_77") return json(route, { run_id: "run_77", status: "completed", ticket_id: "ABC-88", title: "Add partial refunds", repo: "acme/api", created_at: ago(2900), pass_history: [], progress_notes: [], applied_standards: ["api-conventions"] });
    if (/^\/api\/runs\/run_77\/agent-log$/.test(p)) return json(route, { passes: [], live_events: [] });
    if (/^\/api\/runs\/run_77\/traces$/.test(p)) return json(route, { traces: [] });
    if (p === "/api/skills/used" && method === "GET") {
      const run = url.searchParams.get("run_id");
      return json(route, run === "run_77"
        ? {
            skills: [{ name: "debug", kind: "skill", repo: "acme/playbook", path: "skills/debug/SKILL.md", count: 2 }],
            agents: [{ name: "spec-checker", kind: "agent", repo: "acme/playbook", path: "agents/spec-checker.md", count: 1, tools: ["read_file"] }],
            sources: [{ id: "s1", name: "Orders DB", lookups: 3 }],
            standards: [{ name: "api-conventions", kind: "skill", repo: "acme/playbook", path: "skills/api-conventions/SKILL.md", count: 1 }],
          }
        : { skills: [], agents: [], sources: [], standards: [] });
    }
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
  await expect(page.getByRole("heading", { name: /^Skills\s*3$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Agents\s*2$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Commands\s*2$/ })).toBeVisible();
  await expect(page.getByText("Agent · can be asked")).toHaveCount(2);
  await expect(page.getByRole("switch", { name: "Let Coderhelm read copy-tone" })).toHaveAttribute("aria-checked", "false");

  await expect(page.getByRole("link", { name: "skill:debug" })).toHaveAttribute("href", /\/skills\/item\/?\?repo=acme%2Fplaybook&path=skills%2Fdebug%2FSKILL\.md/);
  await shot(page, "skills-list");

  await page.getByRole("switch", { name: "Let Coderhelm read copy-tone" }).click();
  await expect(page.getByRole("switch", { name: "Let Coderhelm read copy-tone" })).toHaveAttribute("aria-checked", "true");
  expect(db.calls.some((c) => c.method === "PUT" && c.path === "/api/skills/item" && c.body?.enabled === true)).toBe(true);
});

test("an item that asks for tools Coderhelm doesn't have says so, and which ones", async ({ page }) => {
  await mockApi(page);
  await page.goto("/skills");
  const notes = page.getByRole("note");
  await expect(notes).toHaveCount(2);
  const command = page.getByRole("listitem").filter({ hasText: "command:release-notes" });
  await expect(command.getByRole("note")).toContainText("Asks for tools Coderhelm doesn't have: Bash, mcp__tracker__list_issues.");
  await expect(command.getByRole("note")).toContainText("Coderhelm will run it without those tools.");
  const agent = page.getByRole("listitem").filter({ hasText: "agent:spec-checker" });
  await expect(agent.getByRole("note")).toContainText("Lists tools it won't get: Read, Grep, Bash, WebFetch.");
  await expect(agent.getByRole("note")).toContainText("Team agents answer without tools, so Coderhelm will run it without those tools.");
  // An item asking for nothing it lacks shows no warning.
  await expect(page.getByRole("listitem").filter({ hasText: "skill:debug" }).getByRole("note")).toHaveCount(0);
  await shot(page, "skills-missing-tools");
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
  await expect(page.getByRole("heading", { name: /^Skills\s*3$/ })).toBeVisible();
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
  await page.getByRole("region", { name: /^Agents\s*2$/ }).getByRole("link", { name: "agent:spec-checker" }).click();
  await expect(page).toHaveURL(/\/skills\/agent\/?\?repo=acme%2Fplaybook&path=agents%2Fspec-checker\.md/);
  await expect(page.getByRole("heading", { name: "spec-checker", level: 1 })).toBeVisible();
  await expect(page.getByText("Coderhelm asks this agent when")).toBeVisible();
  await expect(page.getByText("A Coderhelm setting. It doesn't change the file.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open on GitHub" })).toHaveAttribute("href", `https://github.com/acme/playbook/blob/${SHA}/agents/spec-checker.md`);
  // It reads with what its own file lists, mapped to Coderhelm's read-only tools.
  const tools = page.getByTestId("agent-tools");
  await expect(tools).toContainText("Read-only, the ones its file lists.");
  await expect(tools.getByRole("list", { name: "Tools it gets" }).getByRole("listitem")).toHaveText(["read_file", "read_file_lines", "search_code"]);
  await expect(tools).toContainText("Not available here: Bash, WebFetch");
  await expect(tools).toContainText("Write blocked: Write");
  await expect(page.getByText(/Up to 12 tool calls and 3 minutes/)).toBeVisible();
  await expect(page.getByText("Your team's heavy model")).toBeVisible();
  // "Not checked yet" once, on the badge; the line under it says when it runs.
  await expect(page.getByTestId("compat-section").getByText(/Not checked yet/)).toHaveCount(1);
  await shot(page, "agent-page");

  // Asks: one list, filtered by the shared toolbar.
  await page.getByRole("navigation", { name: "Agent views" }).getByRole("link", { name: /^Asks/ }).click();
  await expect(page).toHaveURL(/tab=asks/);
  await expect(page.getByTestId("ask-row")).toHaveCount(3);
  await expect(page.getByRole("link", { name: "acme/web#412" })).toHaveAttribute("href", "https://github.com/acme/web/issues/412");
  await expect(page.getByRole("link", { name: "View run" })).toHaveAttribute("href", /\/runs\/detail\/?\?id=run_77/);
  await expect(page.getByText("(an older version)")).toBeVisible();
  await expect(page.getByText("sent 6,120 characters of context, not kept")).toBeVisible();
  await shot(page, "agent-asks");

  await page.getByRole("group", { name: "Show asks" }).getByRole("button", { name: /No answer/ }).click();
  await expect(page.getByText("Check this ticket for contradictions before I plan it.")).toBeVisible();
  await expect(page.getByText("Does this PR's spec for the refund flow")).toHaveCount(0);

  // Instructions render as text, the file's settings fold away.
  await page.getByRole("navigation", { name: "Agent views" }).getByRole("link", { name: "Instructions" }).click();
  await expect(page.getByText("You review specs before work starts.")).toBeVisible();
  await expect(page.getByText("tools: Read, Grep, Bash, WebFetch")).toBeHidden();
  await shot(page, "agent-instructions");
});

test("an admin tries the agent, sees what gets sent, and asks a past question again", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto(AGENT_URL);
  // "Try it" opens a dialog instead of taking a column of the page.
  await page.getByRole("button", { name: "Try it" }).click();
  const dialog = page.getByRole("dialog", { name: "Try spec-checker" });
  await expect(dialog.getByText("19 of 20 tries left today")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try it" })).toBeFocused();
  await page.goto(`${AGENT_URL}&tab=asks`);
  await page.getByRole("button", { name: "Ask again" }).first().click();
  await expect(dialog.getByLabel("Question")).toHaveValue(/refund flow/);
  await page.getByLabel("Question").fill("Is \"the page should load fast\" testable?");
  await page.getByLabel(/Context/).fill("Spec line 4: the page should load fast.");
  await page.getByRole("button", { name: "What gets sent" }).click();
  await expect(page.getByText(/--- The question ---\s+Is "the page should load fast" testable\?/)).toBeVisible();
  await page.getByRole("button", { name: "Ask spec-checker" }).click();
  await expect(dialog.getByRole("button", { name: "Copy" })).toBeVisible({ timeout: 15_000 });
  const post = db.calls.find((c) => c.method === "POST" && c.path === "/api/skills/asks");
  expect(post?.body).toEqual({ repo: "acme/playbook", path: "agents/spec-checker.md", question: "Is \"the page should load fast\" testable?", context: "Spec line 4: the page should load fast." });
  await shot(page, "agent-try");
});

test("members see an agent's asks but can't try it or switch it", async ({ page }) => {
  await mockApi(page, { role: "member" });
  await page.goto(`${AGENT_URL}&tab=asks`);
  await expect(page.getByRole("heading", { name: "spec-checker", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "acme/web#412" })).toBeVisible();
  await expect(page.getByText("Admins can try this agent with a question of their own.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try it" })).toHaveCount(0);
  await expect(page.getByLabel("Question")).toHaveCount(0);
  await expect(page.getByRole("switch")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask again" })).toHaveCount(0);
});

test("an agent with no asks yet, and an unknown agent", async ({ page }) => {
  await mockApi(page, { asks: [] });
  await page.goto(`${AGENT_URL}&tab=asks`);
  await expect(page.getByText("Nobody has asked spec-checker anything yet.")).toBeVisible();
  await page.goto("/skills/agent?repo=acme%2Fplaybook&path=agents%2Fgone.md");
  await expect(page.getByText("Agent not found")).toBeVisible();
});

test("a run's page lists the team agents it asked, linked to each agent", async ({ page }) => {
  await mockApi(page);
  await page.goto("/runs/detail?id=run_77");
  const section = page.getByTestId("team-asks");
  await expect(section.getByRole("heading", { name: "Team agents asked (1)" })).toBeVisible();
  await expect(page.getByTestId("asks-summary")).toHaveText("1 question asked · 1 without an answer");
  const asked = section.getByTestId("ask-row");
  await expect(asked).toContainText("Timed out");
  await expect(asked.getByRole("link", { name: "spec-checker" })).toHaveAttribute("href", /\/skills\/agent\/?\?repo=acme%2Fplaybook&path=agents%2Fspec-checker\.md/);
  await asked.getByRole("button", { name: "Show spec-checker's answer" }).click();
  await expect(section.getByText("Check this ticket for contradictions before I plan it.")).toBeVisible();
});

const DEBUG_URL = "/skills/item?repo=acme%2Fplaybook&path=skills%2Fdebug%2FSKILL.md";

test("the overview counts items by how Coderhelm runs them and filters by what they need", async ({ page }) => {
  await mockApi(page);
  await page.goto("/skills");
  const overview = page.getByTestId("compat-overview");
  await expect(overview.getByRole("heading", { name: "How Coderhelm runs your skills" })).toBeVisible();
  await expect(overview.getByText("4 of 7 checked against what your team has connected · 3 waiting for a check")).toBeVisible();
  await expect(overview.getByRole("button", { name: "1 Ready" })).toBeVisible();
  await expect(overview.getByRole("button", { name: "1 Translated" })).toBeVisible();
  await expect(overview.getByRole("button", { name: "2 Need tools" })).toBeVisible();
  await expect(overview.getByRole("button", { name: "Monitoring needed by 2 items" })).toBeVisible();
  await expect(overview.getByRole("button", { name: "Wiki writes needed by 1 item" })).toBeVisible();
  // A laptop file has nothing to connect: it's its own folded group, with
  // what Coderhelm does instead, never "most needed".
  await expect(overview.getByRole("button", { name: /Local files needed by/ })).toHaveCount(0);
  const local = overview.getByTestId("compat-local");
  await expect(local.getByText("Assumes a local machine (1)")).toBeVisible();
  await expect(local.getByText("Reads the repository and the team's connected sources instead")).toBeHidden();
  await local.getByText("Assumes a local machine (1)").click();
  await expect(local.getByText("Reads the repository and the team's connected sources instead")).toBeVisible();

  // Each item says where it stands, and its summary line links to its page.
  const debug = page.getByRole("listitem").filter({ hasText: "skill:debug" });
  await expect(debug.getByText("Needs tools", { exact: true })).toBeVisible();
  await expect(debug.getByRole("link", { name: DEBUG_SUMMARY })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "skill:copy-tone" }).getByText("agents read the translated version")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "agent:tech-debt-manager" }).getByText("Not checked yet")).toBeVisible();
  await shot(page, "skills-compat-overview");

  await overview.getByRole("button", { name: "Monitoring needed by 2 items" }).click();
  await expect(page.getByText("Showing 2 of 7 items.")).toBeVisible();
  await expect(page.getByRole("link", { name: "skill:debug" })).toBeVisible();
  await expect(page.getByRole("link", { name: "command:deploy" })).toBeVisible();
  await expect(page.getByRole("link", { name: "skill:api-conventions" })).toHaveCount(0);
  await page.getByRole("button", { name: "Show all" }).click();
  await expect(page.getByRole("link", { name: "skill:api-conventions" })).toBeVisible();
  await overview.getByRole("button", { name: "1 Ready" }).click();
  await expect(page.getByText("Showing 1 of 7 items.")).toBeVisible();
});

test("an item's page: each step, what it relies on, what to connect, and the two texts", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto(DEBUG_URL);
  await expect(page.getByRole("heading", { name: "debug", level: 1, exact: true })).toBeVisible();
  const section = page.getByTestId("compat-section");
  await expect(section.getByTestId("compat-summary")).toHaveText(DEBUG_SUMMARY);
  await expect(section.getByText(/Checked 30 min ago with light-model · cost \$0\.034\./)).toBeVisible();

  // What to connect, each with its fix and where.
  const needs = section.getByTestId("compat-needs");
  await expect(needs.getByText("Monitoring", { exact: true })).toBeVisible();
  await expect(needs.getByRole("link", { name: "Connect in Integrations" })).toHaveAttribute("href", /^\/settings\/integrations\/?#other-tools$/);
  await expect(needs.getByText("Coderhelm only reads outside systems here.")).toBeVisible();

  // The steps in order, with their status; gaps open by default.
  const steps = section.getByTestId("compat-step");
  await expect(steps).toHaveCount(5);
  await expect(steps.nth(0)).toHaveAttribute("data-status", "available");
  await expect(steps.nth(0).getByText("Runs as written")).toBeVisible();
  await expect(steps.nth(1).getByText("Translated", { exact: true })).toBeVisible();
  await expect(steps.nth(3).getByText("Needs a tool")).toBeVisible();
  await expect(steps.nth(4).getByText("Write blocked")).toBeVisible();
  await expect(steps.nth(3).getByText("list_change_events")).toBeVisible();
  await expect(steps.nth(3).getByRole("link", { name: "Connect Monitoring in Integrations" })).toHaveAttribute("href", /^\/settings\/integrations\/?#other-tools$/);
  await expect(steps.nth(4).getByText("writes outside")).toBeVisible();
  await steps.nth(1).getByRole("button", { name: "Show what it relies on (1)" }).click();
  await expect(steps.nth(1).getByText("CloudWatch logs")).toBeVisible();
  await expect(steps.nth(1).getByText("logs_search")).toBeVisible();
  await shot(page, "skill-item-compat");

  // The translated text, and what it changed.
  await page.getByRole("button", { name: "Translated", exact: true }).click();
  await expect(page.getByTestId("compat-text").getByText("GAP: Deploy markers")).toBeVisible();
  await page.getByRole("button", { name: "Changes", exact: true }).click();
  await expect(page.getByLabel("Changes from the original")).toContainText("Search the service logs with `logs_search`");
  await expect(page.getByText(/\d+ lines changed\./)).toBeVisible();
  await shot(page, "skill-item-changes");

  // The admin gives agents the translated version.
  const choice = page.getByRole("switch", { name: "Give agents the translated version of debug" });
  await expect(choice).toHaveAttribute("aria-checked", "false");
  await choice.click();
  await expect(choice).toHaveAttribute("aria-checked", "true");
  expect(db.calls.find((c) => c.method === "PUT" && c.path === "/api/skills/translated")?.body).toEqual({ repo: "acme/playbook", path: "skills/debug/SKILL.md", enabled: true });

  // Re-check asks the worker, and the page picks up the new check.
  await section.getByRole("button", { name: "Re-check" }).click();
  await expect.poll(() => db.checks).toBe(1);
  expect(db.calls.find((c) => c.path === "/api/skills/recheck")?.body).toEqual({ repo: "acme/playbook", path: "skills/debug/SKILL.md" });
  await expect(page.getByText("debug checked")).toBeVisible({ timeout: 15_000 });
});

test("a gap on GitHub, which is always connected, offers no connect link; a partial check says why", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto(DEBUG_URL);
  const needs = page.getByTestId("compat-needs");
  const history = needs.getByRole("listitem").filter({ hasText: "Commit history" });
  await expect(history.getByText("Coderhelm's GitHub connection doesn't do this yet.")).toBeVisible();
  await expect(history.getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Connect in GitHub/ })).toHaveCount(0);
  const step = page.getByTestId("compat-step").nth(3);
  await expect(step.getByText("Not available in Coderhelm")).toBeVisible();
  await expect(page.getByTestId("compat-notes")).toContainText("1 step had no title; it was made from what it does.");

  db.items[1].compat = { status: "partial", summary: "Coderhelm couldn't list this item's steps yet", needs: [], at: ago(2), error: "", current: true };
  await page.goto("/skills/item?repo=acme%2Fplaybook&path=skills%2Fapi-conventions%2FSKILL.md");
  await expect(page.getByText("Partly checked", { exact: true })).toBeVisible();
  await expect(page.getByText("Check failed")).toHaveCount(0);
  await expect(page.getByText("No steps were found in this item.")).toHaveCount(0);
});

test("members see how an item runs but can't re-check it or choose its version", async ({ page }) => {
  await mockApi(page, { role: "member" });
  await page.goto(DEBUG_URL);
  await expect(page.getByTestId("compat-summary")).toHaveText(DEBUG_SUMMARY);
  await expect(page.getByRole("button", { name: "Re-check" })).toHaveCount(0);
  await expect(page.getByRole("switch")).toHaveCount(0);
  await expect(page.getByTestId("compat-version").getByText("Off", { exact: true })).toBeVisible();
});

test("an item not checked yet, a changed one, and an agent's page", async ({ page }) => {
  const db = await mockApi(page);
  db.items[1].compat = { ...db.items[1].compat!, current: false };
  await page.goto("/skills/item?repo=acme%2Fplaybook&path=skills%2Fapi-conventions%2FSKILL.md");
  await expect(page.getByText("Checking again", { exact: true })).toBeVisible();
  await expect(page.getByText(/The text changed since the check/)).toBeVisible();
  await page.goto(AGENT_URL);
  const section = page.getByTestId("compat-section");
  await expect(section.getByText("Not checked yet", { exact: true })).toBeVisible();
  await expect(section.getByText(/For an agent, that is the read-only tools its own file lists/)).toBeVisible();
  await page.goto("/skills/item?repo=acme%2Fplaybook&path=skills%2Fgone%2FSKILL.md");
  await expect(page.getByText("Skill not found")).toBeVisible();
});

test.describe("always apply", () => {
  test("an admin sets an item to always apply by repository, pass and path, and the list shows it", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto(DEBUG_URL);
    const section = page.getByTestId("always-section");
    await expect(page.getByRole("heading", { name: "Always apply" })).toBeVisible();
    await expect(section.getByText("Read on demand")).toBeVisible();
    // The compatibility section is still there, above it.
    await expect(page.getByTestId("compat-section")).toBeVisible();

    await section.getByRole("switch", { name: "Always apply debug" }).click();
    // Only switched on repositories are offered; none picked means all.
    await expect(section.getByRole("checkbox", { name: "web" })).toBeVisible();
    await expect(section.getByRole("checkbox", { name: "archived" })).toHaveCount(0);
    await expect(section.getByRole("checkbox", { name: "Coder" })).toBeChecked();
    await expect(section.getByRole("checkbox", { name: "Reviewer" })).toBeChecked();
    await expect(section.getByRole("checkbox", { name: "Planner" })).not.toBeChecked();
    await section.getByRole("checkbox", { name: "web" }).check();
    await section.getByRole("checkbox", { name: "PR descriptions" }).check();
    await section.getByLabel("Paths").fill("apps/web/\n**/*.tsx");
    await shot(page, "skills-always-form");
    await section.getByRole("button", { name: "Save" }).click();

    await expect(section.getByTestId("always-badge")).toHaveText("Always applied · web · Coder, Reviewer, PR descriptions · apps/web/**, **/*.tsx");
    const put = db.calls.find((c) => c.path === "/api/skills/always");
    expect(put?.body).toEqual({ repo: "acme/playbook", path: "skills/debug/SKILL.md", on: true, repos: ["acme/web"], passes: ["coder", "reviewer", "pr"], paths: ["apps/web/", "**/*.tsx"] });

    await page.goto("/skills");
    const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "skill:debug" }) });
    await expect(row.getByTestId("always-badge")).toHaveText("Always applied · web · 3 steps · 2 paths");
    await expect(row.getByTestId("always-badge")).toHaveAttribute("title", /apps\/web\/\*\*, \*\*\/\*\.tsx/);
    await shot(page, "skills-always-list");

    // Switching it off saves at once.
    await page.goto(DEBUG_URL);
    await page.getByRole("switch", { name: "Always apply debug" }).click();
    await expect(page.getByTestId("always-section").getByText("Read on demand")).toBeVisible();
    expect(db.calls.filter((c) => c.path === "/api/skills/always").pop()?.body).toMatchObject({ on: false });
  });

  test("a suggestion is shown, never applied, and can fill the scope", async ({ page }) => {
    const items = structuredClone(ITEMS);
    items[1].suggestion = { repos: ["acme/web"], passes: ["coder", "reviewer"], paths: [], reason: "Names the web app's framework.", at: ago(10) };
    const db = await mockApi(page, { items });
    await page.goto("/skills");
    const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "skill:api-conventions" }) });
    await expect(row.getByTestId("always-suggestion-hint")).toHaveText("Suggested: always apply to web for Coder and Reviewer");
    await expect(row.getByTestId("always-badge")).toHaveCount(0);

    await page.goto("/skills/item?repo=acme%2Fplaybook&path=skills%2Fapi-conventions%2FSKILL.md");
    const section = page.getByTestId("always-section");
    await expect(section.getByText("Names the web app's framework.")).toBeVisible();
    expect(db.calls.some((c) => c.path === "/api/skills/always")).toBe(false);
    await section.getByRole("button", { name: "Use this scope" }).click();
    await expect(section.getByRole("checkbox", { name: "web" })).toBeChecked();
    await section.getByRole("button", { name: "Save" }).click();
    await expect(section.getByTestId("always-badge")).toHaveText("Always applied · web · Coder, Reviewer");
  });

  test("members see the setting but can't change it", async ({ page }) => {
    const items = structuredClone(ITEMS);
    items[0].always_apply = { on: true, repos: [], passes: ["coder", "reviewer"], paths: [], by: "admin@example.com", at: ago(60) };
    await mockApi(page, { role: "member", items });
    await page.goto(DEBUG_URL);
    const section = page.getByTestId("always-section");
    await expect(section.getByTestId("always-badge")).toHaveText("Always applied · all repositories · Coder, Reviewer");
    await expect(section.getByRole("switch")).toHaveCount(0);
  });

  test("a run's and a review's pages name the team standards they were given", async ({ page }) => {
    await mockApi(page);
    await page.goto("/runs/detail?id=run_77");
    // The same block as a review's page: a quiet line that opens to chips.
    const used = page.getByTestId("work-used");
    await expect(used.getByText("1 skill · 1 agent · 1 data source · 1 standard")).toBeVisible();
    await used.getByText("What the run used").click();
    await expect(used.getByRole("link", { name: /^debug/ })).toHaveAttribute("href", /\/skills\/item\/?\?repo=acme%2Fplaybook&path=skills%2Fdebug/);
    await expect(used.getByRole("link", { name: /^debug/ })).toContainText("×2");
    await expect(used.getByRole("link", { name: /spec-checker/ })).toContainText("read with read_file");
    await expect(used.getByRole("link", { name: /spec-checker/ })).toHaveAttribute("href", /\/skills\/agent\/?\?repo=acme%2Fplaybook/);
    await expect(used.getByRole("link", { name: /Orders DB/ })).toHaveAttribute("href", /\/data-sources\/activity\/?$/);
    await expect(used.getByRole("link", { name: /api-conventions/ })).toBeVisible();
    await shot(page, "run-used");
    await page.goto("/reviewer/detail?sk=REVIEW%23acme%2Fweb%23000412%23t");
    const reviewUsed = page.getByTestId("work-used");
    await expect(reviewUsed.getByText("2 standards")).toBeVisible();
    await reviewUsed.getByText("What the reviewer used").click();
    await expect(reviewUsed.getByText("api-conventions")).toBeVisible();
    await expect(reviewUsed.getByText("copy-tone")).toBeVisible();
  });
});

test("an agent's review steps: worked out by its check, set by an admin, and back", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/skills");
  await expect(page.getByRole("listitem").filter({ hasText: "agent:spec-checker" }).getByTestId("reviews-badge")).toHaveText("Reviews: Plan");
  await page.goto("/skills/agent?repo=acme%2Fplaybook&path=agents%2Fspec-checker.md");
  const section = page.getByTestId("reviews-section");
  await expect(section.getByRole("heading", { name: "Reviews: plan / code / prose" })).toBeVisible();
  await expect(section.getByText("Runs in: Plan")).toBeVisible();
  await expect(section.getByText("Worked out by its check from its name and description.")).toBeVisible();
  await section.getByRole("checkbox", { name: /^Code/ }).check();
  await section.getByRole("button", { name: "Save" }).click();
  await expect(section.getByText("Runs in: Plan, Code")).toBeVisible();
  expect(db.calls.find((c) => c.path === "/api/skills/reviews")?.body).toEqual({ repo: "acme/playbook", path: "agents/spec-checker.md", set: true, steps: ["plan", "code"] });
  await expect(section.getByText(/The check says: Plan\./)).toBeVisible();
  await section.getByRole("button", { name: "Use what the check says (Plan)" }).click();
  await expect(section.getByText("Runs in: Plan", { exact: true })).toBeVisible();
  expect(db.calls.filter((c) => c.path === "/api/skills/reviews").pop()?.body).toMatchObject({ set: false });
});

test("members see an agent's review steps but can't change them", async ({ page }) => {
  await mockApi(page, { role: "member" });
  await page.goto("/skills/agent?repo=acme%2Fplaybook&path=agents%2Fspec-checker.md");
  const section = page.getByTestId("reviews-section");
  await expect(section.getByText("Runs in: Plan")).toBeVisible();
  await expect(section.getByRole("checkbox")).toHaveCount(0);
});
