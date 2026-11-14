import { expect, test, type Page, type Route } from "@playwright/test";
import { shoot } from "./infra-shots";
import { ACCOUNT_MISSING, INFRA_FEEDS, INFRA_INSIGHTS, INFRA_RESOURCES, infraFinding, infraOverview, iso } from "./infra-data";

// Infrastructure vulnerabilities: Security › Infrastructure grouped by fix
// (pull requests, runbook cards, AWS-managed rows collapsed at the bottom),
// an account that lacks the reads, the off state, a page the server can't
// answer, and Insights › Infrastructure's live resources linked to their
// findings. Every API call is answered here; nothing reaches a real backend.
// With E2E_SHOTS_DIR set, each screen is also saved at 1280 and 400 wide.

interface Db {
  role: string;
  overview: unknown;
  overviewCode: number;
  calls: { call: string; body: unknown }[];
}

async function mockApi(page: Page, init: Partial<Db> = {}): Promise<Db> {
  const db: Db = { role: "admin", overview: infraOverview(), overviewCode: 200, calls: [], ...init };
  const json = (route: Route, body: unknown, code = 200) => route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    let body: unknown = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = null;
    }
    if (p.startsWith("/api/security")) db.calls.push({ call: `${method} ${p}`, body });
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: db.role });
    if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "acme/infra" }, { name: "acme/web-app" }] });
    if (p === "/api/security/overview")
      return json(route, {
        enabled: true,
        dry_run: false,
        counts: { open: 3, p0: 0, p1: 1, p2: 2, p3: 0, due_7d: 0, fixed_30d: 0, dismissed: 0, noise_removed: 0 },
        median_hours_to_merge_30d: null,
        next_due_at: null,
        sources: { dependabot: "on", osv: { synced_at: null, mode: "api" }, kev_synced_at: null, epss_synced_at: null },
        permission_missing: false,
      });
    if (p === "/api/security/infrastructure") return json(route, db.overview, db.overviewCode);
    if (p === "/api/security/infrastructure/sources") return json(route, { feeds: INFRA_FEEDS });
    if (p === "/api/security/infrastructure/resources") return json(route, { accounts: (db.overview as { accounts?: unknown }).accounts ?? [], resources: INFRA_RESOURCES, count: INFRA_RESOURCES.length });
    if (p === "/api/security/infrastructure/insights") return json(route, INFRA_INSIGHTS);
    if (p === "/api/security/infrastructure/check") return json(route, { status: "queued" }, 202);
    if (/^\/api\/security\/infrastructure\/findings\/[^/]+\/fix$/.test(p)) return json(route, { status: "started", reason: null });
    if (p === "/api/infra/analysis" || p.startsWith("/api/infra")) return json(route, { analysis: null });
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

const call = (db: Db, c: string) => db.calls.filter((x) => x.call === c);

test.describe("Infrastructure vulnerabilities", () => {
  test("the Infrastructure tab groups by fix: PRs, a runbook card and AWS-managed rows that never count", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/security/infrastructure");
    await expect(page.getByRole("heading", { name: "Infrastructure", exact: true })).toBeVisible();
    await expect(page.getByTestId("section-tabs").getByRole("link", { name: "Infrastructure" })).toBeVisible();
    await expect(page.getByTestId("infra-tile-now")).toContainText("1");
    await expect(page.getByTestId("infra-tile-prs")).toContainText("2");
    await expect(page.getByTestId("infra-tile-runbooks")).toContainText("1");
    await expect(page.getByTestId("infra-tile-aws")).toContainText("2");

    // Open rows: two PRs and the Aurora runbook; AWS-managed rows aren't among them.
    const open = page.getByRole("list", { name: "Infrastructure findings" }).getByTestId("infra-row");
    await expect(open).toHaveCount(3);
    const asg = open.filter({ hasText: "web-asg" });
    await expect(asg.getByTestId("tier-pill")).toHaveText("P1");
    await expect(asg.getByTestId("fix-chip")).toHaveText("Fix PR");
    await expect(asg).toContainText("3 instances");
    await expect(asg.getByTestId("exposure")).toContainText("Internet-facing: behind internet-facing load balancer web-alb");
    await asg.getByRole("button", { name: /details of web-asg/ }).click();
    await expect(asg.getByTestId("from-to")).toHaveText("2023.12.20261020 to 2023.12.20261102");
    await expect(asg.getByRole("link", { name: /acme\/infra · envs\/prod\/main.tf:3 · aws_launch_template.web/ })).toHaveAttribute(
      "href",
      "https://github.com/acme/infra/blob/HEAD/envs/prod/main.tf#L3",
    );
    await expect(asg.getByRole("link", { name: "2026-160-AWS" })).toBeVisible();
    await expect(asg).toContainText("CVE-2026-98432");

    // An admin asks for the PR now.
    await asg.getByTestId("infra-fix").click();
    await expect(asg).toContainText("Fix run started.");
    expect(call(db, "POST /api/security/infrastructure/findings/f_asg/fix")).toHaveLength(1);

    // The node group's PR is open: its link and state, no button.
    const ng = open.filter({ hasText: "prod-ng" });
    await expect(ng.getByTestId("infra-pr")).toHaveAttribute("href", "https://github.com/acme/infra/pull/412");
    await expect(ng.getByTestId("infra-fix")).toHaveCount(0);

    // The Aurora runbook card: the CLI, the console path, AWS's date, never run.
    const db1 = open.filter({ hasText: "orders" });
    await expect(db1.getByTestId("fix-chip")).toHaveText("Runbook");
    await db1.getByRole("button", { name: /details of orders/ }).click();
    await expect(db1.getByTestId("runbook-cli")).toContainText("aws rds apply-pending-maintenance-action");
    await expect(db1).toContainText("Databases > select orders-1 > Actions > Patch at next window");
    // An operating system update carries no CVE: the bulletin is related, and the card says so.
    await expect(db1.getByTestId("finding-cves")).toHaveCount(0);
    await expect(db1.getByTestId("advisory-note")).toContainText("AWS publishes no CVE list for this action");
    await expect(db1.getByTestId("fix-decision")).toContainText("This cannot be expressed in code.");
    await expect(db1.getByTestId("apply-by")).toContainText("Apply by");
    await expect(db1).toContainText("Coderhelm never runs this.");
    // A runbook's target is an action, not a version: no "from to" line.
    await expect(db1.getByTestId("from-to")).toHaveCount(0);
    await shoot(page, "security-infrastructure");

    // AWS-managed, collapsed at the bottom with the bulletin's reason.
    const aws = page.getByTestId("aws-managed");
    await expect(aws).toContainText("AWS-managed, nothing to do (2)");
    await aws.getByText("AWS-managed, nothing to do (2)").click();
    const awsRows = aws.getByTestId("infra-row");
    await expect(awsRows).toHaveCount(2);
    await expect(awsRows.filter({ hasText: "api" }).getByTestId("tier-pill")).toHaveCount(0);
    await expect(awsRows.filter({ hasText: "thumbs" })).toContainText("not affected");

    // The Sources panel names a feed that failed and keeps its last copy.
    const sources = page.getByTestId("infra-source");
    await expect(sources).toHaveCount(7);
    await expect(sources.filter({ hasText: "AWS security bulletins" })).toContainText("Last read failed");

    // Filters.
    await page.getByRole("group", { name: "Fix" }).getByRole("button", { name: /^In AWS/ }).click();
    await expect(open).toHaveCount(1);
    await page.getByRole("group", { name: "Tier" }).getByRole("button", { name: /^P1/ }).click();
    await expect(page.getByTestId("infra-empty")).toContainText("No findings match");

    await page.getByTestId("infra-check-now").click();
    await expect(page.getByText("Reading every account now.")).toBeVisible();
    expect(call(db, "POST /api/security/infrastructure/check")).toHaveLength(1);
  });

  test("a pull request a person closed shows who closed it and when, and the fix is offered again", async ({ page }) => {
    const closed = { number: 412, url: "https://github.com/acme/infra/pull/412", state: "closed", closed_at: iso(-3), closed_by: "octo", closed_by_person: true };
    const ng = infraFinding({ id: "f_ng", name: "prod-ng", title: "EKS node group prod-ng runs v20261015 (fixed in v20261031)", tier: "P2", status: "open", pr: closed });
    const db = await mockApi(page, { overview: infraOverview({ findings: [ng] }) });
    await page.goto("/security/infrastructure");
    const row = page.getByRole("list", { name: "Infrastructure findings" }).getByTestId("infra-row");
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId("infra-pr")).toHaveAttribute("href", "https://github.com/acme/infra/pull/412");
    await expect(row.getByTestId("infra-pr")).toHaveText(/PR #412\s*closed by octo on \w+ \d+/);
    await expect(row.getByTestId("infra-pr-closed")).toHaveText(/PR #412 was closed by octo on \w+ \d+ without merging\. Open a new one when you want the fix/);
    // The fix is offered again, and asking starts it.
    await expect(row.getByTestId("infra-fix")).toHaveText("Open fix PR");
    await row.getByTestId("infra-fix").click();
    await expect(row).toContainText("Fix run started.");
    await expect(row.getByTestId("infra-pr-closed")).toHaveCount(0);
    expect(call(db, "POST /api/security/infrastructure/findings/f_ng/fix")).toHaveLength(1);

    // An older server sends no closer: the page says closed, and still offers the fix.
    db.overview = infraOverview({ findings: [{ ...ng, pr: { number: 412, url: closed.url, state: "closed" } }] });
    await page.reload();
    await expect(row.getByTestId("infra-pr-closed")).toHaveText(/^PR #412 was closed without merging\./);
    await expect(row.getByTestId("infra-fix")).toBeVisible();

    // Still open, merged, or held as a draft by the replacement check: the link, no button.
    for (const state of ["open", "merged", "draft"]) {
      db.overview = infraOverview({ findings: [{ ...ng, status: state === "draft" ? "open" : "pr_open", pr: { number: 412, url: closed.url, state }, fix: { ...ng.fix, kind: state === "draft" ? "runbook" : "pr" } }] });
      await page.reload();
      await expect(page.getByTestId("infra-row")).toHaveCount(1);
      await expect(page.getByTestId("infra-fix")).toHaveCount(0);
      await expect(page.getByTestId("infra-pr-closed")).toHaveCount(0);
    }

    // A closed draft on a finding that fell back to its runbook stays a runbook: no button.
    db.overview = infraOverview({ findings: [{ ...ng, pr: closed, fix: { ...ng.fix, kind: "runbook" } }] });
    await page.reload();
    await expect(page.getByTestId("infra-row")).toHaveCount(1);
    await expect(page.getByTestId("infra-fix")).toHaveCount(0);
    await expect(page.getByTestId("infra-pr-closed")).toHaveCount(0);
  });

  test("a member sees who closed the pull request and no button", async ({ page }) => {
    const closed = { number: 412, url: "https://github.com/acme/infra/pull/412", state: "closed", closed_at: iso(-3), closed_by: "octo", closed_by_person: true };
    await mockApi(page, { role: "member", overview: infraOverview({ findings: [infraFinding({ id: "f_ng", name: "prod-ng", status: "open", pr: closed })] }) });
    await page.goto("/security/infrastructure");
    await expect(page.getByTestId("infra-pr-closed")).toContainText("An admin can open a new one.");
    await expect(page.getByTestId("infra-fix")).toHaveCount(0);
  });

  test("an account switched on without the reads warns, naming the feature, with the one-click update", async ({ page }) => {
    await mockApi(page, { overview: infraOverview({ accounts: [...infraOverview().accounts, ACCOUNT_MISSING] }) });
    await page.goto("/security/infrastructure");
    const warn = page.getByTestId("missing-reads");
    await expect(warn).toContainText("Infrastructure vulnerabilities needs 4 more read-only permissions in account 444455556666");
    await expect(warn).toContainText("ec2:DescribeInstances");
    await expect(warn.getByRole("link", { name: "Update the role in AWS" })).toHaveAttribute("href", /InfrastructureVulnerabilities=on/);
    await shoot(page, "security-infrastructure-missing");
  });

  test("with no account switched on, the page says how to start; a member sees no buttons", async ({ page }) => {
    const db = await mockApi(page, { role: "member", overview: infraOverview({ accounts: [], findings: [] }) });
    await page.goto("/security/infrastructure");
    await expect(page.getByTestId("infra-off")).toContainText("No AWS account is being read yet");
    await expect(page.getByRole("link", { name: "See AWS accounts" })).toHaveAttribute("href", /^\/settings\/integrations\/aws\/?$/);
    await expect(page.getByTestId("infra-check-now")).toHaveCount(0);
    expect(call(db, "POST /api/security/infrastructure/check")).toHaveLength(0);
    await shoot(page, "security-infrastructure-off");
  });

  test("in preview, an admin gets a button to the setting that opens fix PRs; a member is told who to ask", async ({ page }) => {
    await mockApi(page, { overview: infraOverview({ dry_run: true }) });
    await page.goto("/security/infrastructure");
    const note = page.getByTestId("infra-dry-run");
    await expect(note).toContainText("Preview first is on");
    await expect(note.getByTestId("infra-dry-run-turn-on")).toHaveAttribute("href", /^\/security\/policy\/?#mode$/);
    await shoot(page, "security-infrastructure-preview");

    await mockApi(page, { role: "member", overview: infraOverview({ dry_run: true }) });
    await page.goto("/security/infrastructure");
    await expect(page.getByTestId("infra-dry-run")).toContainText("ask an admin");
    await expect(page.getByTestId("infra-dry-run-turn-on")).toHaveCount(0);
  });

  test("an answer the page can't read is a problem with a retry, never a crash", async ({ page }) => {
    await mockApi(page, { overview: { error: "boom" }, overviewCode: 500 });
    await page.goto("/security/infrastructure");
    await expect(page.getByTestId("infra-error")).toBeVisible();
  });

  test("a finding linked from Insights opens on its row", async ({ page }) => {
    await mockApi(page);
    await page.goto("/security/infrastructure?finding=f_db");
    await expect(page.getByRole("list", { name: "Infrastructure findings" }).getByTestId("infra-row").filter({ hasText: "orders" }).getByTestId("runbook-cli")).toBeVisible();
  });

  test("Insights › Infrastructure: what runs in AWS, linked to its findings, next to the code review", async ({ page }) => {
    await mockApi(page);
    await page.goto("/infrastructure?view=running");
    await expect(page.locator('a[href^="/infrastructure"]', { hasText: "Code review" })).toBeVisible();
    await expect(page.locator('a[href*="view=running"]', { hasText: "Running in AWS" })).toBeVisible();
    const rows = page.getByTestId("resource-row");
    await expect(rows).toHaveCount(5);
    await expect(page.getByTestId("resources-summary")).toContainText("5 resources, 3 with something to fix.");
    const asg = rows.filter({ hasText: "Auto Scaling group web-asg" });
    await expect(asg).toContainText("AMI 2023.12.20261020");
    await expect(asg.getByTestId("exposure")).toContainText("Internet-facing");
    await expect(asg.getByTestId("resource-findings")).toHaveAttribute("href", /^\/security\/infrastructure\/?\?finding=f_asg$/);
    const db = rows.filter({ hasText: "Aurora cluster orders" });
    await expect(db).toContainText("Pending in AWS");
    await db.getByRole("button", { name: /details of orders/ }).click();
    await expect(db).toContainText("New Operating System update is available");
    await expect(db).toContainText("apply by Dec 1, 2026");
    await expect(db.getByRole("link", { name: /aws_rds_cluster.orders/ })).toHaveAttribute("href", "https://github.com/acme/infra/blob/HEAD/envs/prod/main.tf#L46");
    await expect(rows.filter({ hasText: "Lambda function thumbs" })).toContainText("From your code");
    await shoot(page, "insights-infrastructure-running");
    await page.getByRole("searchbox", { name: "Search resources" }).or(page.getByLabel("Search resources")).first().fill("thumbs");
    await expect(rows).toHaveCount(1);
  });

  test("with Inspector on, a finding shows a known exploit, Inspector's reachability and its finding as a plain source", async ({ page }) => {
    const withInspector = infraOverview({
      findings: [
        infraFinding({
          id: "f_insp",
          tier: "P0",
          inspector: { exploit_available: true, reachable: true, findings: 3 },
          sources: [{ id: "arn:aws:inspector2:us-east-1:111122223333:finding/0123abcd", kind: "inspector", url: "https://console.aws.amazon.com/inspector", severity: "critical" }],
        }),
      ],
    });
    await mockApi(page, { overview: withInspector });
    await page.goto("/security/infrastructure?finding=f_insp");
    const row = page.getByRole("list", { name: "Infrastructure findings" }).getByTestId("infra-row").first();
    await expect(row.getByTestId("chip-exploit")).toHaveText("Exploit known");
    await expect(row.getByTestId("chip-reachable")).toHaveText("Reachable (Inspector)");
    await expect(row.getByTestId("source-inspector")).toContainText("Amazon Inspector arn:aws:inspector2");
    await expect(row.getByRole("link", { name: /inspector2/ })).toHaveCount(0);
    await shoot(page, "security-infrastructure-inspector");
  });
});
