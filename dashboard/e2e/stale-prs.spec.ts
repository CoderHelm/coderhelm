import { expect, test, type Page, type Route } from "@playwright/test";

// Stale pull requests on the reviewer settings page: the settings for every
// repository, one repository's own, the plan (with Check now and Keep open)
// and what Coderhelm did. Every API call is answered here.

const DEFAULTS = {
  enabled: false,
  stale_days: 21,
  close_days: 7,
  label: "stale",
  warn_message: "This pull request has had no activity for {stale_days} days, so Coderhelm marked it stale.",
  close_message: "Coderhelm closed this pull request. To pick it back up, reopen this pull request.",
  exempt_labels: ["keep-open", "pinned", "security", "do-not-close"],
  exempt_drafts: true,
  exempt_authors: [] as string[],
  scope: "all",
  delete_branch: false,
  max_closes_per_run: 10,
  dry_run: true,
};
type Cfg = typeof DEFAULTS;

const PLAN = {
  computed_at: "2026-11-10T11:00:00Z",
  dry_run: true,
  stopped: "",
  items: [
    { pr: 12, title: "Add the export button", author: "ana", url: "https://github.com/acme/web/pull/12", action: "mark", why: "no activity since Oct 1", last_activity: "2026-10-01T00:00:00Z", last_what: "a comment", next_at: "2026-11-17T11:00:00Z" },
    { pr: 9, title: "Old refactor", author: "bo", url: "https://github.com/acme/web/pull/9", action: "close", why: "marked stale 7 days ago with no activity since", last_activity: "2026-09-01T00:00:00Z", last_what: "a commit" },
    { pr: 4, title: "Security patch", author: "cy", url: "https://github.com/acme/web/pull/4", action: "exempt", why: "it is labelled security", last_activity: "2026-08-01T00:00:00Z", last_what: "opened" },
  ],
};

interface Backend {
  role: string;
  team: Cfg | null;
  repo: Cfg | null;
  puts: { repo?: string; config: Cfg | null }[];
  previews: string[];
  keeps: { repo: string; pr: number; keep: boolean }[];
  kept: { pr: number; title: string; url: string; by: string; via: string; at: string }[];
}

async function mockApi(page: Page, role = "admin"): Promise<Backend> {
  const db: Backend = { role, team: null, repo: null, puts: [], previews: [], keeps: [], kept: [] };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "person@example.com", avatar_url: "", role: db.role, auth_provider: "email", mfa_enabled: false });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "acme/web", enabled: true, ticket_source: "github" }] });
    if (p === "/api/aws-connections") return json(route, { connections: [] });
    if (p === "/api/reviewer/org-config") return json(route, { instructions: "", web_domains: [] });
    if (p === "/api/reviewer/stale/config" && method === "GET") {
      const team = db.team ?? DEFAULTS;
      const repo = url.searchParams.get("repo") ? db.repo : null;
      return json(route, { team, team_saved: !!db.team, repo, effective: repo ?? team, defaults: DEFAULTS });
    }
    if (p === "/api/reviewer/stale/config" && method === "PUT") {
      if (db.role !== "admin") return json(route, { error: "forbidden" }, 403);
      const body = JSON.parse(req.postData() as string) as Backend["puts"][number];
      db.puts.push(body);
      if (body.repo) db.repo = body.config;
      else db.team = body.config;
      return json(route, { config: body.config });
    }
    if (p === "/api/reviewer/stale" && method === "GET") {
      return json(route, {
        plan: PLAN,
        kept_open: db.kept,
        log: [
          { at: "2026-11-09T10:00:00Z", repo: "acme/web", pr: 7, action: "closed", title: "Try the new parser", url: "https://github.com/acme/web/pull/7", author: "coderhelm[bot]", why: "marked stale 7 days ago with no activity since", by: "Coderhelm", run_id: "run-7" },
          { at: "2026-11-08T10:00:00Z", repo: "acme/web", pr: 6, action: "unstaled", title: "Docs", url: "https://github.com/acme/web/pull/6", author: "ana", why: "a comment after it was marked", by: "Coderhelm", run_id: "" },
        ],
      });
    }
    if (p === "/api/reviewer/stale/preview") {
      db.previews.push((JSON.parse(req.postData() as string) as { repo: string }).repo);
      return json(route, { queued: true }, 202);
    }
    if (p === "/api/reviewer/stale/keep-open") {
      const body = JSON.parse(req.postData() as string) as Backend["keeps"][number] & { title: string; url: string };
      db.keeps.push({ repo: body.repo, pr: body.pr, keep: body.keep });
      db.kept = body.keep
        ? [...db.kept, { pr: body.pr, title: body.title, url: body.url, by: "person@example.com", via: "dashboard", at: "2026-11-10T12:00:00Z" }]
        : db.kept.filter((k) => k.pr !== body.pr);
      return json(route, { pr: body.pr, keep: body.keep });
    }
    if (p.startsWith("/api/reviewer/config/")) return json(route, {});
    return json(route, { error: `not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

test("the team turns stale pull request cleanup on, as a dry run first", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/reviewer/config/?section=stale");
  const section = page.getByTestId("stale-section");
  await expect(section.getByRole("heading", { name: "Stale pull requests" })).toBeVisible();
  await expect(page.getByTestId("stale-summary")).toContainText("Off. Coderhelm never marks or closes");
  // The defaults: 21 days, then 7, drafts and the usual labels never marked.
  await expect(page.getByTestId("stale-stale_days")).toHaveValue("21");
  await expect(page.getByTestId("stale-close_days")).toHaveValue("7");
  await expect(page.getByTestId("stale-exempt-labels")).toHaveValue("keep-open, pinned, security, do-not-close");

  await page.getByTestId("stale-enabled").click();
  await page.getByTestId("stale-stale_days").fill("30");
  await expect(page.getByTestId("stale-summary")).toContainText("Dry run: shows what it would do and changes nothing. Marks pull requests stale after 30 days");
  const bar = page.getByTestId("stale-save-bar");
  await bar.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Stale pull request settings saved")).toBeVisible();
  expect(db.puts).toHaveLength(1);
  expect(db.puts[0].repo).toBeUndefined();
  expect(db.puts[0].config).toMatchObject({ enabled: true, stale_days: 30, close_days: 7, dry_run: true, delete_branch: false });
  // Without a repository there is no list of pull requests.
  await expect(page.getByTestId("stale-activity")).toHaveCount(0);
});

test("a repository gets its own settings, previews its plan and keeps a pull request open", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/reviewer/config/?section=stale&repo=acme/web");
  await expect(page.getByTestId("stale-summary")).toContainText("acme/web follows the settings for every repository.");

  // Its own settings: shorter timing on this repository only.
  await page.getByTestId("stale-own").click();
  await page.getByTestId("stale-stale_days").fill("5");
  await page.getByTestId("stale-save-bar").getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Stale pull request settings saved")).toBeVisible();
  expect(db.puts.at(-1)).toMatchObject({ repo: "acme/web", config: { stale_days: 5 } });
  await expect(page.getByTestId("stale-summary")).not.toContainText("follows the settings");

  // The plan: what is marked next, what closes, what is kept open and why.
  const plan = page.getByTestId("stale-plan");
  await expect(plan.getByTestId("stale-plan-12")).toContainText("Marks stale");
  await expect(plan.getByTestId("stale-plan-9")).toContainText("Closes");
  await expect(plan.getByTestId("stale-plan-4")).toContainText("it is labelled security");
  await expect(page.getByTestId("stale-activity")).toContainText("Preview, nothing changed.");

  await page.getByTestId("stale-preview").click();
  await expect(page.getByText("Checking now.")).toBeVisible();
  expect(db.previews).toEqual(["acme/web"]);

  await plan.getByTestId("stale-plan-12").getByRole("button", { name: "Keep open" }).click();
  await expect(page.getByText("#12 stays open")).toBeVisible();
  expect(db.keeps).toEqual([{ repo: "acme/web", pr: 12, keep: true }]);
  const kept = page.getByTestId("stale-kept");
  await expect(kept).toContainText("#12 Add the export button");
  await kept.getByRole("button", { name: "Allow closing" }).click();
  await expect(page.getByText("#12 can be closed again")).toBeVisible();
  expect(db.keeps.at(-1)).toEqual({ repo: "acme/web", pr: 12, keep: false });

  // What Coderhelm did, including the run it closed with the pull request.
  const log = page.getByTestId("stale-log");
  await expect(log).toContainText("Closed");
  await expect(log).toContainText("its run was closed");
  await expect(log).toContainText("Un-staled");

  // Back to following the team: the repository's own settings are dropped.
  await page.getByTestId("stale-own").click();
  await page.getByTestId("stale-save-bar").getByRole("button", { name: "Save settings" }).click();
  await expect.poll(() => db.puts.at(-1)).toEqual({ repo: "acme/web", config: null });
});

test("a member sees the settings and the plan but changes nothing", async ({ page }) => {
  await mockApi(page, "member");
  await page.goto("/reviewer/config/?section=stale&repo=acme/web");
  await expect(page.getByTestId("stale-plan")).toBeVisible();
  await expect(page.getByTestId("stale-save-bar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Keep open" })).toHaveCount(0);
});
