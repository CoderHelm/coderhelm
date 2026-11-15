import { expect, test, type Page, type Route } from "@playwright/test";

// A Jira site running an older Coderhelm app: the Integrations page's Jira
// row says which version it runs, the latest, what it lacks and how its admin
// accepts the update; a run on a ticket from that site says its comments may
// be incomplete. Once the site catches up, both are gone. Every API call is
// answered here.

const BEHIND = {
  version: "6.8.0",
  latest: "6.11.0",
  missing: ["mentions", "in-place edits", "extended issue fields", "threaded replies"],
  manage_url: "https://your-team.atlassian.net/plugins/servlet/upm",
  seen_at: "2026-11-14T10:00:00Z",
  message:
    "Your Jira site runs an older Coderhelm app (version 6.8.0, latest 6.11.0). Missing: mentions, in-place edits, extended issue fields, threaded replies. A Jira admin needs to accept the update: Jira Settings, Apps, Manage apps, Coderhelm, Update.",
  run_note:
    "Comments on this ticket may be incomplete: its Jira site runs an older Coderhelm app (version 6.8.0, latest 6.11.0) without mentions, in-place edits, extended issue fields, threaded replies. A Jira admin can accept the update in Manage apps.",
};

const RUN = {
  run_id: "01RUNJ",
  status: "completed",
  ticket_source: "jira",
  ticket_id: "ABC-9",
  title: "Add the pricing table",
  repo: "your-team/web",
  branch: "abc-9-pricing-table",
  pr_url: "https://github.com/your-team/web/pull/52",
  pr_number: 52,
  cost_usd: 1.2,
  tokens_in: 1000,
  tokens_out: 1000,
  duration_s: 900,
  current_pass: "done",
  created_at: "2026-11-14T09:00:00Z",
  updated_at: "2026-11-14T09:30:00Z",
  pass_history: [],
  progress_notes: [],
};

async function mockApi(page: Page, behind: typeof BEHIND | null, run: Record<string, unknown> = RUN) {
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const calls: string[] = [];
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (r) => {
    const p = new URL(r.request().url()).pathname;
    calls.push(p);
    if (p === "/api/me") return json(r, { user_id: "u_1", team_id: "t_1", github_login: "a-maintainer", email: "person@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(r, { month: "2026-01", tokens_in: 0, tokens_out: 0, total_runs: 0, total_tokens: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(r, { banners: [] });
    if (p === "/api/teams") return json(r, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/integrations") {
      return json(r, {
        can_edit: true,
        migrated: 0,
        items: [
          { id: "github", section: "code", name: "GitHub", does: "", status: "connected", reason: "", action: "manage", last_check: "", manage_href: "/settings/integrations/github", detail: { org: "your-team" } },
          { id: "jira", section: "code", name: "Jira", does: "", status: "connected", reason: "", action: "manage", last_check: "", manage_href: "/settings/integrations/jira", detail: { app: true, app_update: behind } },
        ],
      });
    }
    if (p === "/api/integrations/jira/app") return json(r, { behind });
    if (p === "/api/repos") return json(r, { repos: [{ name: "your-team/web", enabled: true, ticket_source: "jira" }] });
    if (p === "/api/plugins/catalog") return json(r, { plugins: [] });
    if (p === `/api/runs/${run.run_id}`) return json(r, run);
    if (p.endsWith("/openspec")) return json(r, {});
    if (p.endsWith("/traces")) return json(r, { traces: [] });
    if (p.endsWith("/agent-log")) return json(r, { passes: [], live_events: [] });
    if (p.endsWith("/asks")) return json(r, { asks: [] });
    if (p === "/api/security/overview") return json(r, { enabled: false, dry_run: true, counts: { open: 0, p0: 0, p1: 0 } });
    if (p === "/api/support/badge") return json(r, { waiting: 0, queue_open: null });
    return json(r, {});
  });
  return calls;
}

test("Integrations: a Jira site on an older app says its version, the latest, what it lacks and how to update", async ({ page }) => {
  await mockApi(page, BEHIND);
  await page.goto("/settings/integrations/");
  const notice = page.getByTestId("jira-app-update");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Your Jira site runs an older Coderhelm app (version 6.8.0, latest 6.11.0).");
  await expect(notice).toContainText("Missing: mentions, in-place edits, extended issue fields, threaded replies.");
  await expect(notice).toContainText("A Jira admin needs to accept the update: Jira Settings, Apps, Manage apps, Coderhelm, Update.");
  const link = notice.getByRole("link", { name: "Open Manage apps in Jira" });
  await expect(link).toHaveAttribute("href", "https://your-team.atlassian.net/plugins/servlet/upm");
  await expect(link).toHaveAttribute("target", "_blank");
  // It sits with the Jira row, not elsewhere on the page.
  await expect(page.getByTestId("integration-jira").getByTestId("jira-app-update")).toBeVisible();
  await expect(page.getByTestId("integration-github").getByTestId("jira-app-update")).toHaveCount(0);
});

test("Integrations: no notice once the site runs the latest app", async ({ page }) => {
  await mockApi(page, null);
  await page.goto("/settings/integrations/");
  await expect(page.getByTestId("integration-jira")).toBeVisible();
  await expect(page.getByTestId("jira-app-update")).toHaveCount(0);
});

test("Run page: a ticket from a behind site gets one quiet line about its comments", async ({ page }) => {
  await mockApi(page, BEHIND);
  await page.goto("/runs/detail?id=01RUNJ");
  const line = page.getByTestId("run-jira-app-note");
  await expect(line).toHaveCount(1);
  await expect(line).toContainText("Comments on this ticket may be incomplete: its Jira site runs an older Coderhelm app (version 6.8.0, latest 6.11.0)");
  await expect(line.getByRole("link", { name: "Open Manage apps" })).toHaveAttribute("href", BEHIND.manage_url);
  // Quiet: a plain line, not a warning box.
  await expect(line).toHaveClass(/text-zinc-400/);
});

test("Run page: no line when the site is current", async ({ page }) => {
  const calls = await mockApi(page, null);
  await page.goto("/runs/detail?id=01RUNJ");
  await expect(page.getByText("Add the pricing table").first()).toBeVisible();
  await expect.poll(() => calls.includes("/api/integrations/jira/app")).toBe(true);
  await expect(page.getByTestId("run-jira-app-note")).toHaveCount(0);
});

test("Run page: a GitHub issue never asks about the Jira app", async ({ page }) => {
  const calls = await mockApi(page, BEHIND, { ...RUN, run_id: "01RUNG", ticket_source: "github", ticket_id: "your-team/web#12" });
  await page.goto("/runs/detail?id=01RUNG");
  await expect(page.getByText("Add the pricing table").first()).toBeVisible();
  await expect(page.getByTestId("run-jira-app-note")).toHaveCount(0);
  expect(calls).not.toContain("/api/integrations/jira/app");
});
