import { expect, test, type Page, type Route } from "@playwright/test";

// One status per integration on every page: the Integrations overview, the
// GitHub page and the Jira page all read the overview's card, so they never
// disagree. Every API call is answered here.

type Card = { id: string; status: string; reason?: string };

async function mockApi(page: Page, opts: { cards: Card[]; install: string; repos?: { name: string; enabled: boolean; onboard_status?: string }[] }) {
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (r) => {
    const p = new URL(r.request().url()).pathname;
    if (p === "/api/me") return json(r, { user_id: "u_1", team_id: "t_1", github_login: "a-maintainer", email: "person@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(r, { month: "2026-01", tokens_in: 0, tokens_out: 0, total_runs: 0, total_tokens: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(r, { banners: [] });
    if (p === "/api/teams") return json(r, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/integrations") {
      return json(r, {
        can_edit: true,
        migrated: 0,
        items: opts.cards.map((c) => ({
          id: c.id, section: "code", name: c.id === "github" ? "GitHub" : "Jira", does: "", status: c.status, reason: c.reason ?? "",
          action: c.status === "connected" ? "manage" : "check_again", last_check: "", manage_href: `/settings/integrations/${c.id}`, detail: c.id === "github" ? { org: "your-team" } : {},
        })),
      });
    }
    if (p === "/api/repos") return json(r, { repos: opts.repos ?? [{ name: "your-team/web", enabled: true, onboard_status: "ready" }] });
    if (p === "/api/github/installation-status") return json(r, { status: opts.install });
    if (p === "/api/integrations/jira/check") {
      return json(r, { ready: true, secret_configured: true, configured_repos: { total: 1, enabled: 1 }, enabled_repos: ["your-team/web"], jira_events_seen: true, installation_id: 7, team_id: "t_1", webhook_url: "https://example.com/hook" });
    }
    if (p === "/api/integrations/jira/config") return json(r, { site_url: "https://your-team.atlassian.net", list_projects_url: "https://x/list", create_ticket_url: "https://x/create", add_comment_url: "https://x/comment", projects: [], default_project: "", trigger_label: "coderhelm" });
    if (p === "/api/integrations/jira/events") return json(r, { events: [] });
    if (p === "/api/support/badge") return json(r, { waiting: 0, queue_open: null });
    return json(r, {});
  });
}

test("GitHub: the overview's Connected wins, and a team with active repos is never 'Not installed'", async ({ page }) => {
  // The older installation-status answer disagrees; the overview card decides.
  await mockApi(page, { cards: [{ id: "github", status: "connected" }, { id: "jira", status: "connected" }], install: "not_connected" });
  await page.goto("/settings/integrations/");
  const row = page.getByRole("link", { name: /GitHub/ }).first();
  await expect(row).toContainText("Connected");
  await page.goto("/settings/integrations/github/");
  const app = page.getByTestId("github-app");
  await expect(app).toContainText("Connected");
  await expect(app).not.toContainText("Not installed");
  await expect(page.getByRole("button", { name: /Install/ })).toHaveCount(0);
});

test("Jira: a problem the overview found shows on the Jira page too", async ({ page }) => {
  await mockApi(page, { cards: [{ id: "github", status: "connected" }, { id: "jira", status: "error", reason: "Jira refused the app's key." }], install: "connected" });
  await page.goto("/settings/integrations/");
  await expect(page.getByText("Not working").first()).toBeVisible();
  await page.goto("/settings/integrations/jira/");
  await expect(page.getByText("Not working").first()).toBeVisible();
  await expect(page.getByText("Jira refused the app's key.")).toBeVisible();
});
