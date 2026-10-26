import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The Logs page against a mocked backend. Nothing reaches a real server.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const WEB = "your-team/web";
const API = "your-team/api";
const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

type Finding = Record<string, unknown> & { rec_id: string; status: string };

function finding(over: Partial<Finding> & Pick<Finding, "rec_id" | "status">): Finding {
  return {
    title: "Checkout times out at the payment step",
    summary: "The checkout function hits its 30 second limit while waiting on the payment service.",
    suggested_action: "Add a 10 second timeout to the payment client and retry once.",
    severity: "critical",
    log_group: "/aws/lambda/shop-checkout",
    account_id: "111122223333",
    error_pattern: "Task timed out after 30.00 seconds",
    error_count: 412,
    seen_count: 3,
    first_seen: ago(30 * HOUR),
    last_seen: ago(2 * HOUR),
    suspected_location: "src/payments/client.ts",
    plan_id: null,
    repo: null,
    repo_mapped: false,
    console_url: "https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups/log-group/$252Faws$252Flambda$252Fshop-checkout",
    fix: null,
    auto: null,
    ...over,
  };
}

const NEW = finding({ rec_id: "rec_new", status: "new" });
const FIXING = finding({
  rec_id: "rec_fixing",
  status: "fixing",
  title: "Orders API returns 502 on large carts",
  severity: "warning",
  log_group: "/ecs/orders-api",
  error_count: 57,
  repo: API,
  repo_mapped: true,
  fix: { state: "pr_open", ticket_id: "LOG-1A2B3C4D", run_id: "01JRUN", run_status: "completed", pr_number: 87, pr_url: `https://github.com/${API}/pull/87`, auto: true, started_at: ago(HOUR) },
  auto: { status: "started", reason: "" },
});
const SKIPPED = finding({
  rec_id: "rec_skipped",
  status: "new",
  title: "Image resizer runs out of memory",
  severity: "critical",
  log_group: "/aws/lambda/image-resizer",
  error_count: 9,
  auto: { status: "skipped", reason: "daily cap reached" },
});
const IGNORED = finding({ rec_id: "rec_ignored", status: "ignored", title: "Health check noise", severity: "info", log_group: "/ecs/web" });

interface Call { method: string; path: string; body: unknown }
interface Backend {
  role: string;
  connected: boolean;
  findings: Finding[];
  autofix: Record<string, unknown>;
  calls: Call[];
}

const DEFAULT_AUTOFIX = { enabled: false, min_severity: "critical", daily_cap: 3, scope: "all", quiet_hours: null, overrides: [], enabled_at: "" };

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = {
    role: "admin",
    connected: true,
    findings: [NEW, FIXING, SKIPPED, IGNORED].map((f) => ({ ...f })),
    autofix: { ...DEFAULT_AUTOFIX },
    calls: [],
    ...init,
  };
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
    if (p === "/api/recommendations/notify") return json(route, { notify_mode: "off", webhooks: { teams: { set: false, hint: "" }, slack: { set: false, hint: "" } } });

    if (p === "/api/log-findings") {
      const counts = { new: 0, acknowledged: 0, fixing: 0, fixed: 0, ignored: 0 } as Record<string, number>;
      for (const f of db.findings) counts[f.status] += 1;
      return json(route, {
        findings: db.connected ? db.findings : [],
        counts,
        log_groups: [...new Set(db.findings.map((f) => f.log_group as string))].sort(),
        aws_connected: db.connected,
      });
    }
    if (p === "/api/log-findings/autofix") {
      if (method === "PUT") {
        const sent = body as Record<string, unknown>;
        db.autofix = { ...sent, enabled_at: sent.enabled ? new Date().toISOString() : "" };
        return json(route, { ok: true, autofix: db.autofix });
      }
      return json(route, { autofix: db.autofix, runs_today: 1 });
    }
    const one = p.match(/^\/api\/log-findings\/([^/]+)\/(samples|fix|ignore|acknowledge|reopen)$/);
    if (one) {
      const f = db.findings.find((x) => x.rec_id === decodeURIComponent(one[1]));
      if (!f) return json(route, { error: "That finding is gone.", code: "not_found" }, 404);
      if (one[2] === "samples") {
        return json(route, {
          samples: [
            { timestamp: "2026-01-14 10:02:11.000", message: "Task timed out after 30.00 seconds token=[hidden]" },
            { timestamp: "2026-01-14 09:58:40.000", message: "Task timed out after 30.00 seconds" },
          ],
        });
      }
      if (one[2] === "fix") {
        const sent = body as { repo?: string };
        f.status = "fixing";
        f.repo = sent.repo;
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

test("Logs is its own menu item, with Logs and Alerts as its tabs", async ({ page }) => {
  await mockApi(page);
  await page.goto("/logs/");
  const main = page.getByRole("navigation", { name: "Main" });
  await expect(main.getByRole("link", { name: "Logs", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(main.getByRole("link", { name: "Code review", exact: true })).not.toHaveAttribute("aria-current", "page");
  const tabs = page.getByRole("navigation", { name: "Logs pages" });
  await expect(tabs.getByRole("link")).toHaveText(["Logs", "Alerts"]);
  await expect(page.getByRole("heading", { level: 1, name: "Logs" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Logs" })).toHaveAttribute("aria-current", "page");
});

test("findings list with status toggles, filters and the inline detail", async ({ page }) => {
  await mockApi(page);
  await page.goto("/logs/");

  const row = page.getByTestId("finding-rec_new");
  await expect(row).toContainText("Checkout times out at the payment step");
  // The service's name in the row; the full log group in its title and details.
  await expect(row).toContainText("shop-checkout");
  await expect(row.locator('[title="/aws/lambda/shop-checkout"]')).toBeVisible();
  await expect(row).toContainText("412 lines");
  await expect(row).toContainText("first seen 1 day ago");
  await expect(row).toContainText("Critical");
  await expect(row.getByRole("button", { name: /Create fix PR/ })).toBeVisible();
  // One visible action; Ignore and Open logs wait in the row's menu.
  await expect(row.getByRole("button", { name: /^Ignore/ })).toHaveCount(0);
  await row.getByRole("button", { name: "More actions for Checkout times out at the payment step" }).click();
  await expect(page.getByRole("menuitem", { name: /Ignore/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Open logs in CloudWatch/ })).toBeVisible();
  await page.keyboard.press("Escape");

  // The automatic fix that started links its PR; the one that was skipped says why.
  const fixing = page.getByTestId("finding-rec_fixing");
  await expect(fixing.getByRole("link", { name: /PR #87/ })).toHaveAttribute("href", `https://github.com/${API}/pull/87`);
  await expect(fixing).toContainText("Auto");
  await expect(fixing).toContainText("Started automatically. Pull request open, waiting for review.");
  await expect(fixing.getByRole("button", { name: /Create fix PR/ })).toHaveCount(0);
  await expect(page.getByTestId("finding-rec_skipped")).toContainText("Not started automatically: daily cap reached.");

  const group = page.getByRole("group", { name: "Show findings" });
  for (const [label, n] of [["All", 4], ["New", 2], ["Acknowledged", 0], ["Fixing", 1], ["Fixed", 0], ["Ignored", 1]] as const) {
    await expect(group.getByRole("button", { name: new RegExp(`^${label}\\s*${n}$`) })).toBeVisible();
  }
  await group.getByRole("button", { name: /^Fixing/ }).click();
  await expect(page).toHaveURL(/status=fixing/);
  await expect(page.locator("[data-testid^=finding-]")).toHaveCount(1);
  await group.getByRole("button", { name: /^All/ }).click();

  await page.getByRole("combobox", { name: "Severity" }).selectOption("warning");
  await expect(page.locator("[data-testid^=finding-]")).toHaveCount(1);
  await page.getByRole("combobox", { name: "Severity" }).selectOption("");
  await page.getByRole("combobox", { name: "Log group" }).selectOption("/aws/lambda/image-resizer");
  await expect(page.locator("[data-testid^=finding-]")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear filters" }).first().click();

  await page.getByRole("searchbox", { name: "Search findings" }).fill("orders");
  await expect(page.locator("[data-testid^=finding-]")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Search findings" }).fill("");

  // The detail opens inline with the recommendation, the code location and sample lines.
  await row.getByRole("button", { name: "Show details of Checkout times out at the payment step" }).click();
  await expect(page).toHaveURL(/finding=rec_new/);
  await expect(row).toContainText("Add a 10 second timeout to the payment client and retry once.");
  await expect(row).toContainText("src/payments/client.ts");
  await expect(row.getByTestId("sample-lines")).toContainText("Task timed out after 30.00 seconds token=[hidden]");
  await expect(row.getByRole("link", { name: /Open logs/ })).toHaveAttribute("href", /logsV2:log-groups/);
  await shot(page, "logs-1280");
});

test("Create fix PR starts a run in the chosen repo and the row follows it", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/logs/");
  const row = page.getByTestId("finding-rec_new");
  await row.getByRole("button", { name: /Create fix PR/ }).click();
  const dialog = page.getByRole("dialog", { name: "Create a fix PR" });
  await expect(dialog).toContainText("/aws/lambda/shop-checkout");
  await dialog.getByRole("button", { name: /Repository/ }).click();
  await dialog.getByRole("option", { name: WEB, exact: true }).click();
  await expect(dialog.getByRole("checkbox", { name: /Always use this repo/ })).toBeChecked();
  await dialog.getByRole("button", { name: "Start fix run" }).click();
  await expect(dialog).toBeHidden();

  const fix = db.calls.find((c) => c.method === "POST" && c.path === "/api/log-findings/rec_new/fix");
  expect(fix?.body).toEqual({ repo: WEB, remember: true });
  await expect(row).toContainText("Fixing");
  await expect(row).toContainText("Started by a person, waiting for the run to begin.");
  await expect(row.getByRole("button", { name: /Create fix PR/ })).toHaveCount(0);
});

test("a member who isn't an admin can't remember a repo mapping", async ({ page }) => {
  const db = await mockApi(page, { role: "member" });
  await page.goto("/logs/");
  await page.getByTestId("finding-rec_new").getByRole("button", { name: /Create fix PR/ }).click();
  const dialog = page.getByRole("dialog", { name: "Create a fix PR" });
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await dialog.getByRole("button", { name: /Repository/ }).click();
  await dialog.getByRole("option", { name: API, exact: true }).click();
  await dialog.getByRole("button", { name: "Start fix run" }).click();
  await expect(dialog).toBeHidden();
  expect(db.calls.find((c) => c.path === "/api/log-findings/rec_new/fix")?.body).toEqual({ repo: API, remember: false });
});

test("the automatic fix PR setting saves exactly what was chosen", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/logs/");
  await expect(page.getByTestId("autofix-toggle")).toContainText("Automatic fix PRs: Off");
  await page.getByTestId("autofix-toggle").click();
  const panel = page.getByTestId("autofix-panel");
  await expect(panel).toBeVisible();

  await panel.getByTestId("autofix-enabled").check();
  await panel.getByRole("group", { name: "Minimum severity" }).getByRole("button", { name: "Warning and up" }).click();
  await panel.getByLabel("Most automatic runs per day").fill("2");
  await panel.getByRole("checkbox", { name: "Quiet hours" }).check();
  await panel.getByRole("combobox", { name: "Quiet hours start" }).selectOption("23");
  await panel.getByRole("combobox", { name: "Quiet hours end" }).selectOption("7");

  const checkout = panel.getByTestId("group-/aws/lambda/shop-checkout");
  await checkout.getByRole("button", { name: /Repo for \/aws\/lambda\/shop-checkout/ }).click();
  await page.getByTestId("combo-popover").getByRole("option", { name: WEB, exact: true }).click();
  await panel.getByRole("combobox", { name: "Automatic fixes for /ecs/web" }).selectOption("off");
  await panel.getByRole("combobox", { name: "Minimum severity for /aws/lambda/shop-checkout" }).selectOption("critical");
  await shot(page, "logs-autofix-1280");

  await panel.getByTestId("autofix-save").click();
  await expect(page.getByTestId("autofix-toggle")).toContainText("Automatic fix PRs: On");
  const put = db.calls.find((c) => c.method === "PUT" && c.path === "/api/log-findings/autofix");
  expect(put?.body).toEqual({
    enabled: true,
    min_severity: "warning",
    daily_cap: 2,
    scope: "all",
    quiet_hours: { start_hour: 23, end_hour: 7 },
    overrides: [
      { log_group: "/aws/lambda/shop-checkout", repo: WEB, auto: null, min_severity: "critical" },
      { log_group: "/ecs/web", repo: "", auto: false, min_severity: null },
    ],
  });
});

test("members see the setting but can't change it", async ({ page }) => {
  await mockApi(page, { role: "member" });
  await page.goto("/logs/?auto=1");
  const panel = page.getByTestId("autofix-panel");
  await expect(panel).toContainText("Only an admin or the owner can change these settings.");
  await expect(panel.getByTestId("autofix-enabled")).toBeDisabled();
  await expect(panel.getByTestId("autofix-save")).toHaveCount(0);
});

test("without an AWS connection the page points to Settings", async ({ page }) => {
  await mockApi(page, { connected: false });
  await page.goto("/logs/");
  await expect(page.getByText("Connect AWS to see log findings")).toBeVisible();
  await expect(page.getByRole("link", { name: "Connect AWS in Settings" })).toHaveAttribute("href", /^\/settings\/integrations\/aws\/?$/);
});

test("the old findings links land on the Logs page", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/aws/");
  await expect(page).toHaveURL(/\/logs\/?$/);
  await expect(page.getByRole("heading", { level: 1, name: "Logs" })).toBeVisible();
});

test("phone width: no sideways scroll, actions reachable", async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/logs/?finding=rec_new");
  const row = page.getByTestId("finding-rec_new");
  await expect(row.getByTestId("sample-lines")).toBeVisible();
  await expect(row.getByRole("button", { name: /Create fix PR/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) {
    const wide = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && (el.parentElement?.getBoundingClientRect().right ?? 0) <= document.documentElement.clientWidth + 1)
        .slice(0, 8)
        .map((el) => `${el.tagName}.${(el as HTMLElement).className}`.slice(0, 160)),
    );
    console.log("too wide:", wide);
  }
  expect(overflow).toBeLessThanOrEqual(0);
  await shot(page, "logs-390");
  // On a phone the page's actions sit beside its title, in view.
  await page.getByTestId("autofix-toggle").click();
  await expect(page.getByTestId("autofix-panel")).toBeVisible();
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow2).toBeLessThanOrEqual(0);
  await shot(page, "logs-autofix-390");
});
