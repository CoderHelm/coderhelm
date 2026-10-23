import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// <CodeBlock>: Copy, shell prompts, phone width and highlighting, on the Tests
// setup and in a plan's spec (markdown fences). Every API call is mocked.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const NOW = new Date().toISOString();
const DAY = 86_400_000;

const LONG_LINE = `export const scheduleUrl = "https://example.com/api/classes?day=2026-01-15&location=downtown&include=instructors,rooms,waitlist&sort=start_time";`;

const OPENSPEC = {
  proposal: "# Proposal\n\nMembers ask for the class schedule on the web.\n\n## What changes\n\n- A schedule page under `/schedule`\n- An endpoint that lists classes by day",
  design: [
    "# Design",
    "",
    "The page reads `GET /api/classes?day=` and groups classes by hour.",
    "",
    '```ts title="web/src/lib/classes.ts" {2}',
    "export async function classesFor(day: string) {",
    "  return fetch(`/api/classes?day=${day}`).then((r) => r.json());",
    "}",
    LONG_LINE,
    "```",
    "",
    "Try it locally:",
    "",
    "```bash",
    "$ npm install",
    "$ npm run dev -- \\",
    "    --port 3000",
    "ready on http://localhost:3000",
    "```",
    "",
    "The route changes like this:",
    "",
    "```diff",
    "@@ -1,3 +1,3 @@",
    " export const routes = [",
    '-  "/classes",',
    '+  "/schedule",',
    " ];",
    "```",
  ].join("\n"),
  spec: "# Spec\n\n### Requirement: schedule by day\n\nThe page SHALL show every class for the chosen day, earliest first.",
  tasks: "# Tasks\n\n- [ ] 1. Add the schedule table",
};

async function mockApi(page: Page) {
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/support/badge") return json(route, { waiting: 0, queue_open: null });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "your-team/web", enabled: true, ticket_source: "github" }] });
    if (p === "/api/settings/workflow") return json(route, { commit_openspec: false, default_destination: "github", allow_plan_log_analyzer: false });
    if (p === "/api/tests/settings") return json(route, { enabled: false, auto_quarantine: false, fix_prs: false, tickets: "off", burn_in: false, repos: [], ticket_after_days: 2 });
    if (p === "/api/tests/summary") {
      const trend = Array.from({ length: 30 }, (_, i) => ({ day: new Date(Date.now() - (29 - i) * DAY).toISOString().slice(0, 10), runs: 0, pass_rate: 0, flake_rate: 0 }));
      return json(route, { repos: [], counts: { healthy: 0, flaky: 0, broken: 0, quarantined: 0, fixed: 0 }, prs_blocked_7d: 0, ci_minutes_lost_7d: 0, prs_rescued_7d: 0, runs_7d: 0, pass_rate_7d: 0, flake_rate_7d: 0, trend });
    }
    if (p === "/api/tests/runs") return json(route, { runs: [], next: null });
    if (p === "/api/tests") return json(route, { tests: [], next: null });
    if (/^\/api\/plans\/\w+\/openspec$/.test(p)) return json(route, OPENSPEC);
    const one = p.match(/^\/api\/plans\/(\w+)$/);
    if (one) {
      return json(route, {
        plan_id: one[1], title: "Add a class schedule page", description: "Members can see classes by day.", repo: "your-team/web", status: "draft",
        task_count: 1, destination: "github", created_at: NOW, updated_at: NOW, chat_id: "chat-1",
        tasks: [{ task_id: "T1", plan_id: one[1], title: "Add the schedule table", description: "Do it", acceptance_criteria: "- It works", status: "draft", order: 0, created_at: NOW }],
      });
    }
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
}

/** Records what the page writes to the clipboard. */
async function mockClipboard(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __copied: string[] };
    w.__copied = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (t: string) => void w.__copied.push(t), readText: async () => w.__copied[w.__copied.length - 1] ?? "" },
    });
  });
}
const copied = (page: Page) => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} at ${width}px scrolls sideways`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS_DIR, `code-block-${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

test("code block: the Tests setup copies the exact snippet and highlights it", async ({ page }) => {
  await mockClipboard(page);
  await mockApi(page);
  await page.goto("/tests");
  await expect(page.getByRole("heading", { name: "Turn on E2E tracking" })).toBeVisible();

  const config = page.getByRole("region", { name: "playwright.config.ts" });
  await expect(config).toBeVisible();
  // The filename is the header; the comment that used to name it is gone from the code.
  await expect(config.locator("figcaption")).toHaveText(/playwright\.config\.ts\s*Copy/);
  await expect(config.locator("code")).not.toContainText("// playwright.config.ts");

  // Highlighted: the string and the key get different theme colors.
  const str = config.locator("code span[style]", { hasText: '"test-results/results.json"' }).first();
  await expect(str).toBeVisible();
  const key = config.locator("code span[style]", { hasText: "reporter" }).first();
  const [strColor, keyColor] = await Promise.all([str.evaluate((e) => getComputedStyle(e).color), key.evaluate((e) => getComputedStyle(e).color)]);
  expect(strColor).toBe("rgb(134, 239, 172)");
  expect(keyColor).not.toBe(strColor);

  // The YAML steps say what they are and which language.
  const steps = page.getByRole("region", { name: "GitHub Actions step" });
  await expect(steps.first().locator("figcaption")).toContainText("YAML");

  await config.getByRole("button", { name: /^Copy/ }).click();
  await expect(config.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await copied(page)).toEqual(['reporter: [["html"], ["json", { outputFile: "test-results/results.json" }]],']);

  // Keyboard: focus the code and press Ctrl+C with nothing selected.
  await steps.first().locator("pre").focus();
  await page.keyboard.press("Control+c");
  const last = (await copied(page)).at(-1) ?? "";
  expect(last.startsWith("# in the workflow that runs your E2E tests")).toBe(true);
  expect(last).toContain("if: ${{ !cancelled() }}");

  await shot(page, "tests-setup");
});

test("code block: a plan spec's fences get a language, a filename, prompts that aren't copied and a diff", async ({ page }) => {
  await mockClipboard(page);
  await mockApi(page);
  await page.goto("/plans/detail/?id=PLANA");
  await expect(page.getByTestId("spec")).toBeVisible();

  // ```ts title="web/src/lib/classes.ts" {2}
  const ts = page.getByRole("region", { name: "web/src/lib/classes.ts" });
  await expect(ts).toHaveAttribute("data-lang", "typescript");
  await expect(ts.locator('[data-line="2"]')).toHaveAttribute("data-marked", "true");
  await expect(ts.locator("code span[style]", { hasText: "async" }).first()).toBeVisible();

  // ```bash with $ prompts: shown, never copied; the output line isn't copied either.
  const shell = page.getByRole("region", { name: "Terminal code" });
  await expect(shell.locator("figcaption")).toContainText("Terminal");
  await expect(shell.locator("[data-prompt]")).toHaveCount(2);
  await expect(shell.locator("[data-prompt]").first()).toHaveCSS("user-select", "none");
  await shell.getByRole("button", { name: /^Copy/ }).click();
  await expect(shell.getByRole("button", { name: "Copied" })).toBeVisible();
  expect((await copied(page)).at(-1)).toBe("npm install\nnpm run dev -- \\\n    --port 3000");

  // ```diff: +/- in the gutter, the patch copied as written.
  const diff = page.getByRole("region", { name: "Diff code" });
  await expect(diff.locator('[data-kind="add"]')).toHaveCount(1);
  await expect(diff.locator('[data-kind="del"]')).toHaveCount(1);
  await diff.getByRole("button", { name: /^Copy/ }).click();
  expect((await copied(page)).at(-1)).toBe('@@ -1,3 +1,3 @@\n export const routes = [\n-  "/classes",\n+  "/schedule",\n ];');

  // Inline code in the same markdown stays inline.
  await expect(page.getByTestId("spec").locator("p code", { hasText: "GET /api/classes?day=" })).toBeVisible();

  await shot(page, "plan-spec");
});

test("code block: on a phone a long line scrolls inside the block, not the page", async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/plans/detail/?id=PLANA");
  const ts = page.getByRole("region", { name: "web/src/lib/classes.ts" });
  await expect(ts).toBeVisible();
  await expect(ts.locator("code")).toContainText(LONG_LINE);

  const page_ = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(page_).toBeLessThanOrEqual(0);
  const pre = ts.locator("pre");
  const { scroll, client } = await pre.evaluate((e) => ({ scroll: e.scrollWidth, client: e.clientWidth }));
  expect(scroll).toBeGreaterThan(client);
  const box = await ts.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  // It scrolls.
  await pre.evaluate((e) => (e.scrollLeft = 200));
  expect(await pre.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
});
