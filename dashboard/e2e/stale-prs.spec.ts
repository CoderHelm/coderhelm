import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Stale PRs, a tab of Code review (/reviewer/stale): the state and its one
// action at the top, the lists (marked stale, would mark or close, recently
// closed, exempt) across every repository with a repo filter and search, and
// the Settings view with one "Settings for" control. Old links from Reviewer
// settings land here. Every API call is answered here.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

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

const at = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

function plans(dryRun: boolean) {
  return [
    {
      repo: "acme/web",
      computed_at: at(-0.05),
      dry_run: dryRun,
      enabled: true,
      stopped: "",
      items: [
        { pr: 12, title: "Add the export button", author: "ana", url: "https://github.com/acme/web/pull/12", action: "mark", why: "no activity since Oct 1", last_activity: at(-40), last_what: "a comment", next_at: at(7), repo: "acme/web", days_quiet: 40, closes_at: at(7) },
        { pr: 9, title: "Old refactor", author: "bo", url: "https://github.com/acme/web/pull/9", action: "wait", why: "marked stale", last_activity: at(-25), last_what: "a commit", next_at: at(1), repo: "acme/web", days_quiet: 25, closes_at: at(1) },
        { pr: 4, title: "Security patch", author: "cy", url: "https://github.com/acme/web/pull/4", action: "exempt", why: "it is labelled security", last_activity: at(-60), last_what: "opened", repo: "acme/web", days_quiet: 60, closes_at: null },
      ],
    },
    {
      repo: "acme/api",
      computed_at: at(-0.1),
      dry_run: dryRun,
      enabled: true,
      stopped: "",
      items: [
        { pr: 31, title: "Try the new cache", author: "di", url: "https://github.com/acme/api/pull/31", action: "wait", why: "marked stale", last_activity: at(-27), last_what: "a review", next_at: at(3), repo: "acme/api", days_quiet: 27, closes_at: at(3) },
        { pr: 30, title: "Rename the queue", author: "ed", url: "https://github.com/acme/api/pull/30", action: "close", why: "marked stale 7 days ago with no activity since", last_activity: at(-35), last_what: "a commit", next_at: at(0), repo: "acme/api", days_quiet: 35, closes_at: at(0) },
      ],
    },
  ];
}

interface Backend {
  role: string;
  team: Cfg | null;
  repos: Record<string, Cfg | null>;
  puts: { repo?: string; config: Cfg | null }[];
  previews: string[];
  keeps: { repo: string; pr: number; keep: boolean }[];
  kept: { repo: string; pr: number; title: string; url: string; by: string; via: string; at: string }[];
  failActivity: boolean;
  activityCalls: number;
}

async function mockApi(page: Page, opts: { role?: string; team?: Partial<Cfg> | null } = {}): Promise<Backend> {
  const db: Backend = {
    role: opts.role ?? "admin",
    team: opts.team === null || opts.team === undefined ? null : { ...DEFAULTS, ...opts.team },
    repos: {},
    puts: [],
    previews: [],
    keeps: [],
    kept: [{ repo: "acme/api", pr: 2, title: "Long-running migration", url: "https://github.com/acme/api/pull/2", by: "ana", via: "comment", at: at(-3) }],
    failActivity: false,
    activityCalls: 0,
  };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "person@example.com", avatar_url: "", role: db.role, auth_provider: "email", mfa_enabled: false });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "acme/web", enabled: true, ticket_source: "github" }, { name: "acme/api", enabled: true, ticket_source: "github" }] });
    if (p === "/api/aws-connections") return json(route, { connections: [] });
    if (p === "/api/reviewer/org-config") return json(route, { instructions: "Never log secrets.", web_domains: [] });
    if (p === "/api/reviewer/stale/config" && method === "GET") {
      const team = db.team ?? DEFAULTS;
      const r = url.searchParams.get("repo");
      const own = r ? db.repos[r] ?? null : null;
      return json(route, { team, team_saved: !!db.team, repo: own, effective: own ?? team, defaults: DEFAULTS });
    }
    if (p === "/api/reviewer/stale/config" && method === "PUT") {
      if (db.role !== "admin") return json(route, { error: "forbidden" }, 403);
      const body = JSON.parse(req.postData() as string) as Backend["puts"][number];
      db.puts.push(body);
      if (body.repo) db.repos[body.repo] = body.config;
      else db.team = body.config;
      return json(route, { config: body.config });
    }
    if (p === "/api/reviewer/stale" && method === "GET") {
      db.activityCalls += 1;
      if (db.failActivity) return json(route, { error: "boom" }, 500);
      const team = db.team ?? DEFAULTS;
      return json(route, {
        plan: null,
        plans: team.enabled ? plans(team.dry_run) : [],
        kept_open: db.kept,
        log: [
          { at: at(-1), repo: "acme/web", pr: 7, action: "closed", title: "Try the new parser", url: "https://github.com/acme/web/pull/7", author: "fay", why: "marked stale 7 days ago with no activity since", by: "Coderhelm", run_id: "run-7" },
          { at: at(-2), repo: "acme/web", pr: 6, action: "unstaled", title: "Docs", url: "https://github.com/acme/web/pull/6", author: "ana", why: "a comment after it was marked", by: "Coderhelm", run_id: "" },
          { at: at(-4), repo: "acme/api", pr: 5, action: "closed", title: "Drop the old client", url: "https://github.com/acme/api/pull/5", author: "gus", why: "marked stale 7 days ago with no activity since", by: "Coderhelm", run_id: "" },
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
        ? [...db.kept, { repo: body.repo, pr: body.pr, title: body.title, url: body.url, by: "person@example.com", via: "dashboard", at: at(0) }]
        : db.kept.filter((k) => !(k.pr === body.pr && k.repo === body.repo));
      return json(route, { pr: body.pr, keep: body.keep });
    }
    if (p.startsWith("/api/reviewer/config/")) return json(route, { enabled: true, label: "ch-review" });
    if (p === "/api/reviewer/reviews") return json(route, { reviews: [], next: null });
    if (p === "/api/reviewer/live") return json(route, { prs: [] });
    if (p === "/api/reviewer/open-prs") return json(route, { prs: [] });
    return json(route, { error: `not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true });
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(0);
}

const views = (page: Page) => page.getByRole("navigation", { name: "Stale pull request views" });

test("Stale PRs is a Code review tab, beside Reviewer, Tests and Releases", async ({ page }) => {
  await mockApi(page, { team: { enabled: true } });
  await page.goto("/reviewer/stale");
  const tabs = page.getByTestId("section-tabs");
  await expect(tabs.getByRole("link")).toHaveText(["Reviewer", "Stale PRs", "Tests", "Releases"]);
  await expect(tabs.getByRole("link", { name: "Stale PRs" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1, name: "Stale pull requests" })).toBeVisible();
});

test("a dry run: the state, its action, and what it would mark or close across every repo", async ({ page }) => {
  const db = await mockApi(page, { team: { enabled: true, dry_run: true } });
  await page.goto("/reviewer/stale");
  await expect(page.getByTestId("stale-state")).toHaveAttribute("data-state", "dry_run");
  await expect(page.getByTestId("stale-state")).toContainText("Dry run");
  await expect(page.getByTestId("stale-applies")).toContainText("Dry run: shows what it would do and changes nothing.");

  // Marked stale now: the ones waiting out the grace period, soonest first, with the day each closes.
  const rows = page.getByTestId("stale-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("#9 Old refactor");
  await expect(rows.first()).toContainText("Closes tomorrow");
  await expect(rows.first()).toContainText("web");
  await expect(rows.first()).toContainText("bo");
  await expect(rows.first()).toContainText("quiet 25 days");
  await expect(rows.nth(1)).toContainText("Closes in 3 days");
  for (const w of [1280, 400]) {
    await page.setViewportSize({ width: w, height: 900 });
    await noSidewaysScroll(page);
    await shot(page, `stale-dry-run-${w}`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  // The header's action: preview what it would close.
  await page.getByTestId("stale-primary").click();
  await expect(page).toHaveURL(/view=next/);
  await expect(views(page).getByRole("link", { name: /^Would mark or close/ })).toHaveAttribute("aria-current", "page");
  await expect(rows).toHaveCount(2);
  await expect(page.getByTestId("stale-row").filter({ hasText: "#12" })).toContainText("Would mark");
  await expect(page.getByTestId("stale-row").filter({ hasText: "#30" })).toContainText("Would close");
  for (const w of [1280, 400]) {
    await page.setViewportSize({ width: w, height: 900 });
    await noSidewaysScroll(page);
    await shot(page, `stale-dry-run-preview-${w}`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  // Check now reads GitHub again, for every repo or the one picked.
  await page.getByTestId("stale-check").click();
  await expect(page.getByText(/Checking 2 repositories now/)).toBeVisible();
  expect(db.previews.sort()).toEqual(["acme/api", "acme/web"]);

  // Keep open from the list.
  await page.getByTestId("stale-row").filter({ hasText: "#12" }).getByRole("button", { name: "Keep open" }).click();
  await expect(page.getByText("#12 stays open")).toBeVisible();
  expect(db.keeps).toEqual([{ repo: "acme/web", pr: 12, keep: true }]);
});

test("the repo filter and search narrow every list, and clear", async ({ page }) => {
  await mockApi(page, { team: { enabled: true, dry_run: false } });
  await page.goto("/reviewer/stale");
  const rows = page.getByTestId("stale-row");
  await expect(rows).toHaveCount(3);
  await page.goto("/reviewer/stale?repo=acme%2Fapi");
  await expect(rows).toHaveCount(2);
  await expect(page.getByTestId("list-toolbar")).toContainText("api checked");
  await page.getByRole("searchbox", { name: "Search stale pull requests" }).fill("cache");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("#31 Try the new cache");
  await page.getByRole("searchbox", { name: "Search stale pull requests" }).fill("nothing like this");
  await expect(page.getByTestId("list-empty")).toContainText("No marked pull requests match");
  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(rows).toHaveCount(3);
});

test("on: closing now, recently closed with a Reopen link, and what is exempt", async ({ page }) => {
  const db = await mockApi(page, { team: { enabled: true, dry_run: false } });
  await page.goto("/reviewer/stale");
  await expect(page.getByTestId("stale-state")).toHaveAttribute("data-state", "on");
  await expect(page.getByTestId("stale-primary")).toHaveText("Settings");
  await expect(views(page).getByRole("link", { name: /^Up next/ })).toBeVisible();
  // Closing for real on this sweep is marked, not a preview.
  await expect(page.getByTestId("stale-row").filter({ hasText: "#30" })).toContainText("Closing now");
  for (const w of [1280, 400]) {
    await page.setViewportSize({ width: w, height: 900 });
    await noSidewaysScroll(page);
    await shot(page, `stale-on-${w}`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  await views(page).getByRole("link", { name: /^Recently closed/ }).click();
  const closed = page.getByTestId("stale-closed-row");
  await expect(closed).toHaveCount(2);
  await expect(closed.first()).toContainText("#7 Try the new parser");
  await expect(closed.first()).toContainText("its run was closed");
  await expect(closed.first().getByTestId("stale-reopen")).toHaveAttribute("href", "https://github.com/acme/web/pull/7");
  await shot(page, "stale-on-closed-1280");

  await views(page).getByRole("link", { name: /^Exempt/ }).click();
  await expect(page.getByTestId("stale-exempt-row")).toContainText("It is labelled security");
  const kept = page.getByTestId("stale-kept-row");
  await expect(kept).toContainText("kept open by ana (comment)");
  await kept.getByRole("button", { name: "Allow closing" }).click();
  await expect(page.getByText("#2 can be closed again")).toBeVisible();
  expect(db.keeps).toEqual([{ repo: "acme/api", pr: 2, keep: false }]);
  await shot(page, "stale-on-exempt-1280");

  await page.getByTestId("stale-primary").click();
  await expect(page).toHaveURL(/view=settings/);
  await expect(page.getByTestId("stale-section")).toBeVisible();
});

test("off: the state says so, and Turn on starts a dry run", async ({ page }) => {
  const db = await mockApi(page, { team: null });
  await page.goto("/reviewer/stale");
  await expect(page.getByTestId("stale-state")).toHaveAttribute("data-state", "off");
  await expect(page.getByTestId("stale-off")).toContainText("Stale pull request cleanup is off");
  for (const w of [1280, 400]) {
    await page.setViewportSize({ width: w, height: 900 });
    await noSidewaysScroll(page);
    await shot(page, `stale-off-${w}`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByTestId("stale-primary").click();
  await expect(page.getByText(/Turned on as a dry run/)).toBeVisible();
  expect(db.puts).toEqual([{ config: { ...DEFAULTS, enabled: true, dry_run: true } }]);
  await expect(page).toHaveURL(/view=next/);
  await expect(page.getByTestId("stale-state")).toHaveAttribute("data-state", "dry_run");
});

test("settings: one control for all repositories or one, inherited until it is overridden", async ({ page }) => {
  const db = await mockApi(page, { team: { enabled: true } });
  await page.goto("/reviewer/stale?view=settings");
  const scope = page.getByTestId("settings-scope");
  await expect(scope).toHaveAttribute("data-scope", "all");
  await expect(scope).toContainText("All repositories");
  await expect(page.getByTestId("stale-stale_days")).toHaveValue("21");
  await shot(page, "stale-settings-all-1280");

  // One repository: the team's values, read only, until it gets its own.
  await scope.getByTestId("settings-scope-picker").click();
  await page.getByRole("option", { name: /web/ }).click();
  await expect(page).toHaveURL(/repo=acme%2Fweb/);
  await expect(scope).toHaveAttribute("data-scope", "repo");
  const badge = page.getByTestId("scope-badge");
  await expect(badge).toHaveAttribute("data-state", "inherited");
  await expect(badge).toContainText("Inherited from all repositories");
  await expect(page.getByTestId("stale-stale_days")).toBeDisabled();
  await shot(page, "stale-settings-repo-1280");

  await page.getByTestId("scope-override").click();
  await expect(badge).toHaveAttribute("data-state", "overridden");
  await expect(badge).toContainText("Overridden here");
  await page.getByTestId("stale-stale_days").fill("5");
  await page.getByTestId("stale-save-bar").getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Stale pull request settings saved")).toBeVisible();
  expect(db.puts.at(-1)).toMatchObject({ repo: "acme/web", config: { stale_days: 5, enabled: true } });

  // Reset: back to the settings for all repositories.
  await page.getByTestId("scope-reset").click();
  await expect(badge).toHaveAttribute("data-state", "inherited");
  await page.getByTestId("stale-save-bar").getByRole("button", { name: "Save settings" }).click();
  await expect.poll(() => db.puts.at(-1)).toEqual({ repo: "acme/web", config: null });
  await page.setViewportSize({ width: 400, height: 900 });
  await noSidewaysScroll(page);
  await shot(page, "stale-settings-repo-400");
});

test("a member sees the lists and the settings but changes nothing", async ({ page }) => {
  await mockApi(page, { role: "member", team: { enabled: true, dry_run: false } });
  await page.goto("/reviewer/stale");
  await expect(page.getByTestId("stale-row").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Keep open" })).toHaveCount(0);
  await page.goto("/reviewer/stale?view=settings");
  await expect(page.getByTestId("stale-section")).toBeVisible();
  await expect(page.getByTestId("stale-save-bar")).toHaveCount(0);
});

test("a failed load says so and retries; the lists load with a skeleton", async ({ page }) => {
  const db = await mockApi(page, { team: { enabled: true } });
  db.failActivity = true;
  await page.goto("/reviewer/stale");
  await expect(page.getByTestId("list-error")).toContainText("Could not load stale pull requests");
  await shot(page, "stale-error-1280");
  db.failActivity = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("stale-row").first()).toBeVisible();
});

test("old links from Reviewer settings land in the new places", async ({ page }) => {
  await mockApi(page, { team: { enabled: true } });
  await page.goto("/reviewer/config?section=stale&repo=acme%2Fweb");
  await expect(page).toHaveURL(/\/reviewer\/stale\/?\?view=settings&repo=acme%2Fweb/);
  await expect(page.getByTestId("scope-badge")).toHaveAttribute("data-state", "inherited");
  await page.goto("/reviewer/config?section=stale");
  await expect(page).toHaveURL(/\/reviewer\/stale\/?\?view=settings$/);
  await page.goto("/reviewer/config?section=standards");
  await expect(page).toHaveURL(/scope=all/);
  await expect(page.getByTestId("settings-scope")).toHaveAttribute("data-scope", "all");
  await expect(page.getByRole("textbox", { name: "Review standards for every repo" })).toHaveValue("Never log secrets.");
});

test("the Reviewer page says how many are marked and when they close, and links here", async ({ page }) => {
  await mockApi(page, { team: { enabled: true, dry_run: false } });
  await page.goto("/reviewer");
  const line = page.getByTestId("stale-summary-line");
  await expect(line).toContainText("3 pull requests marked stale, 2 closing today or tomorrow");
  await expect(line.getByRole("link")).toHaveAttribute("href", /^\/reviewer\/stale\/?$/);
  await expect(page.getByRole("main").getByRole("link", { name: "Settings", exact: true }).first()).toHaveAttribute("href", /^\/reviewer\/config\/?$/);
});
