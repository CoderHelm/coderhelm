import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// A run that stopped before its pull request because a code generator needed
// public values the repository doesn't set: the run page names them and links
// to the repository's codegen environment, where an admin sets public values
// (secrets are refused). Every API call is answered here.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

const RUN = {
  run_id: "01RUNG",
  status: "failed",
  ticket_source: "jira",
  ticket_id: "ABC-8",
  title: "Add the hero block",
  repo: "your-team/web",
  branch: "abc-8-hero-block",
  cost_usd: 1,
  tokens_in: 10,
  tokens_out: 10,
  duration_s: 600,
  current_pass: "review",
  created_at: iso(30),
  updated_at: iso(2),
  error:
    "Stopped before opening a pull request: regenerating the generated files failed because `pnpm run typegen` needs public values the sandbox doesn't have.",
  pass_history: [],
  progress_notes: [],
  codegen_env_missing: {
    repo: "your-team/web",
    command: "pnpm run typegen",
    vars: ["SANITY_STUDIO_DATASET", "SANITY_STUDIO_PROJECT_ID"],
  },
};

async function mockApi(page: Page, role = "admin") {
  const puts: unknown[] = [];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: "sam", email: "sam@example.com", avatar_url: "", role });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "your-team/web", enabled: true, onboard_status: "ready" }] });
    if (p === "/api/plugins/catalog") return json(route, { plugins: [] });
    if (p === "/api/runs/01RUNG") return json(route, RUN);
    if (/^\/api\/runs\/01RUNG\//.test(p)) return json(route, p.endsWith("traces") ? { traces: [] } : p.endsWith("agent-log") ? { passes: [], live_events: [] } : p.endsWith("asks") ? { asks: [] } : {});
    if (p === "/api/repos/your-team/web/codegen-env" && req.method() === "GET") return json(route, { repo: "your-team/web", vars: [{ name: "SANITY_STUDIO_DATASET", value: "production" }] });
    if (p === "/api/repos/your-team/web/codegen-env" && req.method() === "PUT") {
      const body = JSON.parse(req.postData() ?? "{}");
      puts.push(body);
      const bad = (body.vars as { name: string }[]).find((v) => /TOKEN|SECRET|PASSWORD/.test(v.name));
      if (bad) return json(route, { error: `\`${bad.name}\` looks like a secret. Only public values (ones that already ship to the browser) belong here.` }, 400);
      return json(route, { repo: "your-team/web", count: body.vars.length });
    }
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  return puts;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true });
}

for (const [label, width, height] of [
  ["desktop", 1440, 900],
  ["phone", 390, 844],
] as const) {
  test(`a run stopped for missing codegen values names them and links to where they're set (${label})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const puts = await mockApi(page);
    await page.goto("/runs/detail?id=01RUNG");
    const box = page.getByTestId("codegen-env-missing");
    await expect(box).toContainText("SANITY_STUDIO_PROJECT_ID");
    await expect(box).toContainText("SANITY_STUDIO_DATASET");
    await expect(box).toContainText("Codegen environment");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, `codegen-env-run-${width}`);

    await page.getByTestId("codegen-env-link").click();
    await expect(page).toHaveURL(/\/settings\/repos\/codegen\/?\?repo=your-team%2Fweb&need=/);
    await expect(page.getByTestId("codegen-env-warning")).toContainText("Never put tokens");
    // The one already set is kept; the one the run asked for is pre-filled.
    const names = page.getByRole("textbox", { name: "Name" });
    await expect(names).toHaveCount(2);
    await expect(names.nth(1)).toHaveValue("SANITY_STUDIO_PROJECT_ID");
    await page.getByRole("textbox", { name: "Value" }).nth(1).fill("abc123xy");
    await shot(page, `codegen-env-settings-${width}`);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved. The next run uses these values.")).toBeVisible();
    expect(puts.at(-1)).toEqual({
      vars: [
        { name: "SANITY_STUDIO_DATASET", value: "production" },
        { name: "SANITY_STUDIO_PROJECT_ID", value: "abc123xy" },
      ],
    });
  });
}

test("a secret is refused with the reason", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/repos/codegen?repo=your-team%2Fweb");
  await page.getByRole("button", { name: "Add a variable" }).click();
  await page.getByRole("textbox", { name: "Name" }).last().fill("sanity_auth_token");
  await page.getByRole("textbox", { name: "Value" }).last().fill("x");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("codegen-env-error")).toContainText("looks like a secret");
});

test("the repositories list links each repo to its codegen environment", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/repos");
  await expect(page.getByRole("link", { name: "Codegen environment" })).toHaveAttribute("href", "/settings/repos/codegen?repo=your-team%2Fweb");
});

test("members don't get the settings page", async ({ page }) => {
  await mockApi(page, "member");
  await page.goto("/settings/repos/codegen?repo=your-team%2Fweb");
  await expect(page.getByTestId("codegen-env-form")).toHaveCount(0);
});
