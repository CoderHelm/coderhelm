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
}
interface Backend { repos: Repo[]; items: Item[]; role: string; calls: { method: string; path: string; body: Record<string, unknown> | null }[] }

const SHA = "4f2c9a1e7b3d5c8a9e0f1b2c3d4e5f6a7b8c9d0e";
const REPOS: Repo[] = [
  { repo: "acme/playbook", added_by: "admin@example.com", added_at: ago(3000), sha: SHA, synced_at: ago(4), error: "", items: 6, skipped: ["skills/debug/diagram.png: not text", "commands/huge-export.md: larger than 64 KB"] },
  { repo: "acme/runbooks", added_by: "admin@example.com", added_at: ago(1), sha: "", synced_at: "", error: "", items: 0, skipped: [] },
  { repo: "acme/old-guides", added_by: "lead@example.com", added_at: ago(9000), sha: "9a8b7c6d5e4f", synced_at: ago(25), error: "Coderhelm's GitHub App can't read this repository. Install the app on it, then sync again.", items: 1, skipped: [] },
];
const item = (p: Partial<Item> & Pick<Item, "path" | "kind" | "name" | "description">): Item => ({
  repo: "acme/playbook", sha: SHA, hash: "h", enabled: true, files: [], uses: 0, last_used_at: "", last_used_by: "", updated_at: ago(60), ...p,
});
const ITEMS: Item[] = [
  item({ path: "skills/debug/SKILL.md", kind: "skill", name: "debug", description: "Find the cause before the fix: reproduce, read the logs around the failure, then follow the data back.", files: ["skills/debug/reference.md", "skills/debug/checklist.md"], uses: 14, last_used_at: ago(42), last_used_by: "planner" }),
  item({ path: "skills/api-conventions/SKILL.md", kind: "skill", name: "api-conventions", description: "How the team names things, structures modules and writes tests.", uses: 31, last_used_at: ago(8), last_used_by: "reviewer" }),
  item({ path: "skills/copy-tone/SKILL.md", kind: "skill", name: "copy-tone", description: "Plain words in user-facing copy and pull request text.", enabled: false }),
  item({ path: "agents/spec-checker.md", kind: "agent", name: "spec-checker", description: "Checks a spec or ticket for gaps, contradictions and untestable requirements before work starts.", uses: 3, last_used_at: ago(120), last_used_by: "reviewer (asked)" }),
  item({ path: "agents/tech-debt-manager.md", kind: "agent", name: "tech-debt-manager", description: "Weighs whether a shortcut is worth taking and what it will cost later." }),
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

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { repos: structuredClone(REPOS), items: structuredClone(ITEMS), role: "admin", calls: [], ...init };
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
      return it ? json(route, { ...it, body: BODY }) : json(route, { error: "No such skill." }, 404);
    }
    if (p === "/api/skills/item" && method === "PUT") {
      const it = db.items.find((i) => i.repo === body?.repo && i.path === body?.path);
      if (!it) return json(route, { error: "No such skill." }, 404);
      it.enabled = Boolean(body?.enabled);
      return json(route, { ok: true, enabled: it.enabled });
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
