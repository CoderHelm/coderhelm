import { expect, test, type Page, type Route } from "@playwright/test";

// GitHub coming back to the GitHub settings page: a repository change made
// on GitHub (no state), an owner-approval request (no installation), a new
// installation (the repository count comes from the list), and what
// "Connect GitHub to link" did. Every API call is answered here.

const REPOS = [
  { name: "acme/api", enabled: true, ticket_source: "github" },
  { name: "acme/web", enabled: false, ticket_source: "github" },
  { name: "acme/docs", enabled: false, ticket_source: "github" },
];

async function mockApi(page: Page): Promise<{ links: number[] }> {
  const seen = { links: [] as number[] };
  const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (r) => {
    const p = new URL(r.request().url()).pathname;
    if (p === "/api/me") return json(r, { user_id: "u_1", team_id: "t_1", github_login: "ada", email: "ada@example.com", avatar_url: "", role: "admin", auth_provider: "email" });
    if (p === "/api/usage") return json(r, { month: "2026-01", tokens_in: 0, tokens_out: 0, total_runs: 0, total_tokens: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(r, { banners: [] });
    if (p === "/api/teams") return json(r, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(r, { repos: REPOS });
    if (p === "/api/github/installation-status") return json(r, { status: "connected", github_org: "acme", installation_id: 7 });
    if (p === "/api/github/link-installation") {
      seen.links.push(JSON.parse(r.request().postData() ?? "{}").installation_id);
      // As the gateway answers: no repository count.
      return json(r, { status: "connected", github_org: "acme", installation_id: 7 });
    }
    if (p === "/api/integrations") return json(r, { can_edit: true, items: [], migrated: 0 });
    return json(r, {});
  });
  return seen;
}

test("a repository change made on GitHub is not reported as a failure", async ({ page }) => {
  const seen = await mockApi(page);
  await page.goto("/settings/integrations/github/?installation_id=7&setup_action=update");
  await expect(page.getByText("Repository access updated on GitHub.")).toBeVisible();
  await expect(page.getByText("The GitHub connection didn't finish")).toHaveCount(0);
  expect(seen.links).toEqual([]);
  await expect(page).toHaveURL(/\/settings\/integrations\/github\/$/);
});

test("a request for an owner's approval says it was sent", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/integrations/github/?setup_action=request&state=s1");
  await expect(page.getByText(/Request sent\./)).toBeVisible();
});

test("a new installation counts the repositories the list has", async ({ page }) => {
  const seen = await mockApi(page);
  await page.addInitScript(() => sessionStorage.setItem("gh_install_state", "s1"));
  await page.goto("/settings/integrations/github/?installation_id=7&setup_action=install&state=s1");
  await expect(page.getByText("Connected to acme. 3 repositories found.")).toBeVisible();
  await expect(page.getByText(/0 repositories/)).toHaveCount(0);
  expect(seen.links).toEqual([7]);
});

test("connecting GitHub says when nothing could be linked", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/integrations/github/?github_link=not_admin");
  await expect(page.getByText("The GitHub installation wasn't linked")).toBeVisible();
  await expect(page.getByText(/only a team owner or admin can link/)).toBeVisible();
  await page.goto("/settings/integrations/github/?github_link=linked");
  await expect(page.getByText(/installation is linked to this team/)).toBeVisible();
});
