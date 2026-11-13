import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The Logs page for findings whose error stopped, findings nobody can tell
// about, and the one-click repo choice, against a mocked backend. Nothing
// reaches a real server.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const API = "your-team/api";
const WEB = "your-team/web";
const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();

type Finding = Record<string, unknown> & { rec_id: string; status: string };

function finding(over: Partial<Finding> & Pick<Finding, "rec_id" | "status">): Finding {
  return {
    title: "Search endpoint not found",
    summary: "Requests to the search service fail because its hostname no longer resolves.",
    suggested_action: "Point the service at the search endpoint that exists.",
    severity: "critical",
    log_group: "/ecs/orders-api",
    account_id: "111122223333",
    error_pattern: "getaddrinfo ENOTFOUND search.internal.example",
    error_count: 735,
    seen_count: 735,
    first_seen: ago(41 * HOUR),
    last_seen: ago(35 * HOUR),
    suspected_location: null,
    plan_id: null,
    repo: null,
    repo_mapped: false,
    console_url: null,
    fix: null,
    auto: null,
    ...over,
  };
}

/** Five log checks in a row found no matching line while the service kept logging. */
const ACTIVITY = { state: "stopped", quiet_checks: 5, normal_checks: 5, checked_at: ago(2 * HOUR), scanned: 100_800, minutes: 1440, change: null };
const STOPPED = finding({
  rec_id: "rec_stopped",
  status: "stopped",
  quiet_days: 3,
  quiet_basis: "default",
  resolves_at: ahead(37 * HOUR),
  resolve: { state: "scheduled", at: ahead(37 * HOUR) },
  activity: ACTIVITY,
  // What the server says once it stopped; never the stale "choose a repo".
  auto: { status: "waiting", reason: "the error stopped (no matching line since Nov 2, 05:10 UTC: 5 analyses in a row found none while the service kept logging); a fix starts if it comes back" },
});
const LIVE = finding({
  rec_id: "rec_live",
  status: "new",
  title: "Checkout times out at the payment step",
  log_group: "/aws/lambda/shop-checkout",
  error_count: 412,
  last_seen: ago(HOUR),
  activity: { state: "happening", quiet_checks: 0, normal_checks: 0, checked_at: ago(HOUR), scanned: 20_000, minutes: 360, change: null },
});

interface Backend {
  role: string;
  findings: Finding[];
  calls: { method: string; path: string; body: unknown }[];
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { role: "admin", calls: [], ...init, findings: (init.findings ?? [STOPPED, LIVE]).map((f) => ({ ...f })) };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const p = url.pathname;
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    db.calls.push({ method, path: p + url.search, body });

    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: db.role });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: WEB, enabled: true, ticket_source: "github" }, { name: API, enabled: true, ticket_source: "github" }] });
    if (p === "/api/recommendations/notify") return json(route, { notify_mode: "team", saved: false, webhooks: { teams: { set: false, hint: "" }, slack: { set: false, hint: "" } } });
    if (p === "/api/log-findings") {
      const counts = { new: 0, acknowledged: 0, fixing: 0, stopped: 0, fixed: 0, ignored: 0 } as Record<string, number>;
      for (const f of db.findings) counts[f.status] += 1;
      return json(route, { findings: db.findings, counts, log_groups: [...new Set(db.findings.map((f) => f.log_group as string))].sort(), aws_connected: true, analysis_failing: [] });
    }
    if (p === "/api/log-findings/autofix") {
      return json(route, {
        autofix: { enabled: true, min_severity: "critical", daily_cap: 3, scope: "all", quiet_hours: null, overrides: [], enabled_at: ago(100 * HOUR) },
        runs_today: 0,
        posts_to: { mode: "team", saved: false, channels: ["Slack"], team_alerts: true },
      });
    }
    if (/^\/api\/log-findings\/[^/]+\/repo$/.test(p)) {
      return json(route, { repo: null, confidence: "none", source: "resolved", reason: "Nothing ties this to one of the team's repos yet.", decided_by: [], candidates: [], permissions: [], resolved_at: "", cached: false, saved: null });
    }
    const one = p.match(/^\/api\/log-findings\/([^/]+)\/(samples|fix|ignore|acknowledge|reopen)$/);
    if (one) {
      const f = db.findings.find((x) => x.rec_id === decodeURIComponent(one[1]));
      if (!f) return json(route, { error: "That finding is gone.", code: "not_found" }, 404);
      if (one[2] === "samples") return json(route, { samples: [] });
      if (one[2] === "fix") {
        const sent = body as { repo?: string };
        f.status = "fixing";
        f.repo = sent.repo;
        f.repo_ask = null;
        f.fix = { state: "starting", ticket_id: "LOG-9F8E7D6C", run_id: null, run_status: null, pr_number: null, pr_url: null, auto: false, started_at: new Date().toISOString() };
        return json(route, { status: "fixing", ticket_id: "LOG-9F8E7D6C", repo: sent.repo });
      }
      f.status = one[2] === "ignore" ? "ignored" : one[2] === "acknowledge" ? "acknowledged" : "new";
      return json(route, { ok: true });
    }
    return json(route, {});
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true });
}

async function noSideScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(wide).toBeLessThanOrEqual(1);
}

for (const width of [1280, 390]) {
  test(`a finding whose error stopped reads as stopped, not as a live critical, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    await mockApi(page);
    await page.goto("/logs/");

    const row = page.getByTestId("finding-rec_stopped");
    await expect(row).toHaveAttribute("data-status", "stopped");
    // It says what was checked and when it closes.
    await expect(row).toContainText("Stopped: no matching line since");
    await expect(row).toContainText("5 log checks in a row found none while the service kept logging.");
    await expect(row).toContainText("Closes on its own");
    await expect(row).toContainText("unless seen again");
    // Never New, never asking a person to check a repo, never pushing a fix PR.
    await expect(row).not.toContainText("New");
    await expect(row).not.toContainText("Not started automatically");
    await expect(row).not.toContainText("check it");
    await expect(row.getByRole("button", { name: /Create fix PR/ })).toHaveCount(0);
    await expect(row.getByTestId("autofix-hint")).toHaveCount(0);
    // Its severity is history: said, in the quiet tone a resolved finding uses.
    const chip = row.locator('span[title="Critical while it was happening"]');
    await expect(chip).toHaveText("Critical");
    await expect(chip).not.toHaveClass(/text-red/);
    await expect(row.locator('span[title="Critical"]')).toHaveCount(0);
    // The live one beside it still reads as live, and comes first.
    const live = page.getByTestId("finding-rec_live");
    await expect(live.locator('span[title="Critical"]')).toHaveClass(/text-red/);
    await expect(live.getByRole("button", { name: /Create fix PR/ })).toBeVisible();
    const ids = await page.locator('[data-testid^="finding-rec_"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(ids).toEqual(["finding-rec_live", "finding-rec_stopped"]);

    // Counted as stopped, not as new.
    const group = page.getByRole("group", { name: "Show findings" });
    for (const [label, n] of [["All", 2], ["New", 1], ["Stopped", 1]] as const) {
      await expect(group.getByRole("button", { name: new RegExp(`^${label}\\s*${n}$`) })).toBeVisible();
    }

    // The detail lists the evidence.
    await row.getByRole("button", { name: "Show details of Search endpoint not found" }).click();
    const detail = row.getByTestId("finding-stopped");
    await expect(detail).toContainText("The last matching line was");
    await expect(detail).toContainText("5 log checks in a row since found none");
    await expect(detail).toContainText("In the last check (about 24 hours of logs) the service wrote 100,800 lines, none matching.");
    await expect(detail).toContainText("Closes on its own");
    await expect(detail).toContainText("If a matching line is seen again, it is a live finding again.");
    await expect(row).toContainText("Not started: the error stopped");
    await noSideScroll(page);
    await shot(page, `logs-stopped-${width}`);

    // A person can still start a fix, or close it now, from the menu.
    await row.getByRole("button", { name: "More actions for Search endpoint not found" }).click();
    await expect(page.getByRole("menuitem", { name: /Close now/ })).toBeVisible();
    await page.getByRole("menuitem", { name: /Create fix PR anyway/ }).click();
    await expect(page.getByRole("dialog", { name: "Create a fix PR" })).toBeVisible();
  });
}

test("a change in the repo as it stopped is shown as why it closes sooner", async ({ page }) => {
  const explained = {
    ...STOPPED,
    quiet_days: 1,
    quiet_basis: "change",
    resolves_at: ago(11 * HOUR),
    resolve: { state: "due", at: ago(11 * HOUR) },
    activity: { ...ACTIVITY, change: { kind: "merge", repo: API, at: ago(36 * HOUR), title: "Point search at the new endpoint", url: `https://github.com/${API}/commit/0a1b2c3` } },
  };
  await mockApi(page, { findings: [explained] });
  await page.goto("/logs/?finding=rec_stopped");
  const row = page.getByTestId("finding-rec_stopped");
  // Past its day: the next check closes it; no date that has passed is promised.
  await expect(row).toContainText("Closes at the next log check (every 6 hours) unless seen again.");
  await expect(row).not.toContainText("Closes on its own");
  const detail = row.getByTestId("finding-stopped");
  await expect(detail).toContainText(`It stopped after a change merged in ${API} (Point search at the new endpoint) on`);
  await expect(detail).toContainText("so it closes after 1 day without a line instead of 3.");
  await expect(detail.getByRole("link", { name: /See the change/ })).toHaveAttribute("href", `https://github.com/${API}/commit/0a1b2c3`);
});

test("when the service itself went quiet the page says it can't tell, and the finding stays live", async ({ page }) => {
  const silent = finding({
    rec_id: "rec_silent",
    status: "new",
    activity: { state: "unknown", quiet_checks: 3, normal_checks: 0, checked_at: ago(HOUR), scanned: 0, minutes: 360, change: null },
  });
  await mockApi(page, { findings: [silent] });
  await page.goto("/logs/?finding=rec_silent");
  const row = page.getByTestId("finding-rec_silent");
  await expect(row).toHaveAttribute("data-status", "new");
  await expect(row).toHaveAttribute("data-activity", "unknown");
  await expect(row.getByTestId("finding-cant-tell")).toContainText(
    "No matching line in the last 3 log checks, but the service itself wrote little or nothing then, so Coderhelm can't tell whether the error stopped.",
  );
  await expect(row).not.toContainText("Stopped:");
  await expect(row.locator('span[title="Critical"]')).toHaveClass(/text-red/);
  await expect(row.getByRole("button", { name: /Create fix PR/ })).toBeVisible();
});

const ASK = finding({
  rec_id: "rec_ask",
  status: "new",
  last_seen: ago(HOUR),
  auto: { status: "skipped", reason: `the evidence is split on the repo (best guess ${API}); choose one` },
  repo_ask: {
    guess: API,
    reason: "Two repos name this service.",
    candidates: [
      { repo: API, reason: "From the service's name" },
      { repo: WEB, reason: "From code that names the resource" },
    ],
  },
});

for (const width of [1280, 390]) {
  test(`a genuine tie on the repo is one click, and the choice is remembered, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    const db = await mockApi(page, { findings: [ASK] });
    await page.goto("/logs/");
    const row = page.getByTestId("finding-rec_ask");
    await expect(row).toContainText("Which repo is this log group's code in? Two repos name this service.");
    // The best guess is the row's one visible action; the other waits in the menu.
    const choice = row.getByTestId("repo-choice");
    await expect(choice).toHaveText(`Fix in ${API}`);
    await expect(row.getByRole("button", { name: /Create fix PR/ })).toHaveCount(0);
    await row.getByRole("button", { name: "More actions for Search endpoint not found" }).click();
    await expect(page.getByRole("menuitem", { name: new RegExp(`Fix in ${WEB}`) })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Choose another repo/ })).toBeVisible();
    await page.keyboard.press("Escape");
    // The detail offers every candidate with why.
    await row.getByRole("button", { name: "Show details of Search endpoint not found" }).click();
    const ask = row.getByTestId("repo-ask");
    await expect(ask).toContainText("From the service's name");
    await expect(ask).toContainText("From code that names the resource");
    await noSideScroll(page);
    await shot(page, `logs-repo-ask-${width}`);

    await choice.click();
    await expect(row).toContainText("Fixing");
    expect(db.calls.find((c) => c.method === "POST" && c.path === "/api/log-findings/rec_ask/fix")?.body).toEqual({ repo: API, remember: true });
    await expect(row.getByTestId("repo-choice")).toHaveCount(0);
  });
}

test("a member's one-click choice starts the fix without saving the mapping", async ({ page }) => {
  const db = await mockApi(page, { findings: [ASK], role: "member" });
  await page.goto("/logs/?finding=rec_ask");
  const row = page.getByTestId("finding-rec_ask");
  await row.getByTestId("repo-ask").getByRole("button", { name: `Fix in ${WEB}` }).click();
  await expect(row).toContainText("Fixing");
  expect(db.calls.find((c) => c.path === "/api/log-findings/rec_ask/fix")?.body).toEqual({ repo: WEB, remember: false });
});

test("a stopped finding never offers the repo question it was asked while live", async ({ page }) => {
  const both = { ...STOPPED, repo_ask: ASK.repo_ask };
  await mockApi(page, { findings: [both] });
  await page.goto("/logs/?finding=rec_stopped");
  const row = page.getByTestId("finding-rec_stopped");
  await expect(row).toContainText("Stopped: no matching line since");
  await expect(row.getByTestId("repo-choice")).toHaveCount(0);
  await expect(row.getByTestId("repo-ask")).toHaveCount(0);
});

test("an incident whose findings all stopped reads Stopped, not as a live incident", async ({ page }) => {
  const incident = {
    id: "INC-0A1B2C3D4E5F",
    lead: "rec_stopped",
    members: [
      { rec_id: "rec_stopped", title: "Search endpoint not found" },
      { rec_id: "rec_index", title: "Search index missing (404)" },
    ],
    log_groups: ["/ecs/orders-api"],
    first_seen: ago(41 * HOUR),
    last_seen: ago(35 * HOUR),
    action: "",
    diagnosis: {
      place: "config", service: "opensearch", resource: "orders-search", headline: "Search domain replaced",
      summary: "The search domain was replaced; the service still read the old hostname.",
      facts: [], fix: null, steps: [], recovered_at: "", changed_at: "", permissions: [],
    },
  };
  const a = { ...STOPPED, incident_id: incident.id, incident };
  const b = { ...STOPPED, rec_id: "rec_index", title: "Search index missing (404)", incident_id: incident.id, incident };
  await mockApi(page, { findings: [a, b] });
  await page.goto("/logs/");
  const row = page.getByTestId(`incident-${incident.id}`);
  await expect(row).toHaveAttribute("data-state", "stopped");
  await expect(row).toContainText("Stopped: no matching line since");
  await expect(row).toContainText("5 log checks in a row found none while the service kept logging.");
  await expect(row.locator('span[title="Critical"]')).not.toHaveClass(/text-red/);
  // One of them is still live: the incident is live, with its own words.
  await mockApi(page, { findings: [a, { ...b, status: "new", activity: null }] });
  await page.reload();
  const live = page.getByTestId(`incident-${incident.id}`);
  await expect(live).toHaveAttribute("data-state", "live");
  await expect(live).toContainText("The search domain was replaced; the service still read the old hostname.");
  await expect(live).not.toContainText("Stopped:");
  await expect(live.locator('span[title="Critical"]')).toHaveClass(/text-red/);
});
