import { expect, test, type Page, type Route } from "@playwright/test";

// The Git conventions section on the Workflow settings page. Every API call is
// answered here; nothing reaches a real backend.

const DEFAULTS = { branch: "coderhelm/{ticket_lower}", commit: "{ticket}: {title}", pr_title: "{ticket}: {title}" };
const TOKENS = ["ticket", "ticket_lower", "slug", "summary", "title"];

interface Backend {
  saved: { branch: string; commit: string; pr_title: string };
  puts: Record<string, string>[];
}

async function mockApi(page: Page): Promise<Backend> {
  const db: Backend = { saved: { branch: "", commit: "", pr_title: "" }, puts: [] };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "person@example.com", avatar_url: "", role: "admin", auth_provider: "email", mfa_enabled: false });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/settings/workflow") return json(route, { commit_openspec: false, default_destination: "github", allow_plan_log_analyzer: false });
    if (p === "/api/integrations/jira/check") return json(route, { ready: false, secret_configured: false });
    if (p === "/api/aws-connections") return json(route, { connections: [] });
    if (p === "/api/settings/git-conventions" && method === "GET") return json(route, { ...db.saved, defaults: DEFAULTS, tokens: TOKENS });
    if (p === "/api/settings/git-conventions" && method === "PUT") {
      const body = JSON.parse(req.postData() as string) as Backend["saved"];
      db.puts.push(body);
      // The gateway has the final word on what git accepts.
      if (body.branch.includes("@{")) return json(route, { error: "That isn't a valid git branch name.", field: "branch" }, 400);
      db.saved = body;
      return json(route, { ...db.saved, defaults: DEFAULTS, tokens: TOKENS });
    }
    return json(route, { error: `not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

test("a team sets its branch, commit and PR title templates with a live preview", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/workflow/");
  await expect(page.getByRole("heading", { name: "Git conventions" })).toBeVisible();

  const branch = page.getByLabel("Branch name");
  const commit = page.getByLabel("Commit message");
  const title = page.getByLabel("Pull request title");
  const save = page.getByRole("button", { name: "Save git conventions" });

  // Empty fields show the defaults, and the preview renders them.
  await expect(branch).toHaveAttribute("placeholder", DEFAULTS.branch);
  await expect(page.getByTestId("git-branch-preview")).toContainText("coderhelm/abc-123");
  await expect(page.getByTestId("git-pr_title-preview")).toContainText("ABC-123: Fix the login redirect after single sign-on");
  await expect(save).toBeDisabled();

  // An unknown token is caught while typing, before any save.
  await commit.fill("{ticket}: {what}");
  await expect(page.getByText("`{what}` is not a token.")).toBeVisible();
  await expect(save).toBeDisabled();

  // A branch template has to name the ticket.
  await branch.fill("feature/{slug}");
  await expect(page.getByText(/needs `\{ticket\}` or `\{ticket_lower\}`/)).toBeVisible();

  await branch.fill("feature/{ticket}-{slug}");
  await commit.fill("{ticket_lower}: {summary}");
  await title.fill("[{ticket}] {title}");
  await expect(page.getByTestId("git-branch-preview")).toContainText("feature/ABC-123-fix-the-login-redirect-after-single-sign");
  await expect(page.getByTestId("git-commit-preview")).toContainText("abc-123: fix the login redirect after single sign-on");
  await expect(page.getByTestId("git-pr_title-preview")).toContainText("[ABC-123] Fix the login redirect after single sign-on");

  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText("Git conventions saved")).toBeVisible();
  expect(db.puts.at(-1)).toEqual({ branch: "feature/{ticket}-{slug}", commit: "{ticket_lower}: {summary}", pr_title: "[{ticket}] {title}" });
  await expect(save).toBeDisabled();

  // What the gateway refuses is shown on its field.
  await branch.fill("feature/{ticket}@{slug}");
  await save.click();
  await expect(page.getByText("That isn't a valid git branch name.")).toBeVisible();
  expect(db.saved.branch).toBe("feature/{ticket}-{slug}");

  // Saved templates come back on reload.
  await page.reload();
  await expect(page.getByLabel("Pull request title")).toHaveValue("[{ticket}] {title}");
});

test("the section fits a phone screen", async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/settings/workflow/");
  await expect(page.getByRole("heading", { name: "Git conventions" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
