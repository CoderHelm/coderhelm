import { expect, test, type Page, type Route } from "@playwright/test";
import { shoot } from "./infra-shots";
import { INFRA_DATABASES, INFRA_FEEDS, infraOverview } from "./infra-data";

// Security › Infrastructure, database updates: every row says why it is a
// pull request or a runbook, where the code that defines the resource is,
// how that was found and how sure it is; a runbook is complete (scope,
// interruption, checks, backup, console, commands, validation, rollback,
// AWS's date) with the page each fact came from; and a change CoderHelm
// refused says why. Every API call is answered here.

async function mockApi(page: Page, overview: unknown) {
  const json = (route: Route, body: unknown, code = 200) => route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "acme/infra" }] });
    if (p === "/api/security/overview")
      return json(route, {
        enabled: true,
        dry_run: false,
        counts: { open: 0, p0: 0, p1: 0, p2: 0, p3: 0, due_7d: 0, fixed_30d: 0, dismissed: 0, noise_removed: 0 },
        median_hours_to_merge_30d: null,
        next_due_at: null,
        sources: { dependabot: "on", osv: { synced_at: null, mode: "api" }, kev_synced_at: null, epss_synced_at: null },
        permission_missing: false,
      });
    if (p === "/api/security/infrastructure") return json(route, overview);
    if (p === "/api/security/infrastructure/sources") return json(route, { feeds: INFRA_FEEDS });
    if (p.startsWith("/api/infra")) return json(route, { analysis: null });
    return json(route, { error: `Not mocked: ${req.method()} ${p}` }, 404);
  });
}

const overview = () =>
  infraOverview({
    findings: INFRA_DATABASES,
    counts: { open: 5, p0: 0, p1: 0, p2: 0, p3: 5, prs: 2, runbooks: 3, aws_managed: 0, fixed_30d: 0 },
  });

const rows = (page: Page) => page.getByRole("list", { name: "Infrastructure findings" }).getByTestId("infra-row");

test.describe("Infrastructure: database updates", () => {
  test("a pull request says why, where the code is and how sure, and what happens when it is applied", async ({ page }) => {
    await mockApi(page, overview());
    await page.goto("/security/infrastructure");
    await expect(rows(page)).toHaveCount(5);
    const up = rows(page).filter({ hasText: "ledger-prod-aurora: engine version upgrade" });
    await expect(up.getByTestId("fix-chip")).toHaveText("Fix PR");
    await up.getByRole("button", { name: /details of ledger-prod-aurora/ }).click();
    await expect(up.getByTestId("fix-decision")).toContainText("A pull request: an engine version change has a code equivalent");
    await expect(up.getByTestId("from-to")).toHaveText("16.4 to 16.6");
    // Where: the module's resource, found through the call, and the line to edit.
    await expect(up.getByRole("link", { name: /acme\/infra · modules\/aurora\/main.tf:4 · module.ledger.aws_rds_cluster.this/ })).toBeVisible();
    await expect(up.getByTestId("location-confidence")).toHaveText("Sure");
    await expect(up.getByTestId("location-how")).toHaveText("Found by a Terraform module call and its inputs (terraform), production.");
    await expect(up.getByTestId("location-edit")).toContainText("engine_version in envs/prod/main.tf:4, now 16.4 (a module call's input).");
    await expect(up.getByTestId("location-evidence")).toContainText("the live name");
    // Order: among the cluster's own actions, and staging first.
    await expect(up.getByTestId("fix-order")).toContainText("1 of 3 pending on this database");
    await expect(up.getByTestId("fix-order")).toContainText("ledger-staging-aurora (staging): do that first");
    // What the pull request carries.
    await expect(up.getByTestId("notes-takes-effect")).toContainText("apply_immediately defaults to false");
    await expect(up.getByTestId("notes-replacement")).toContainText("updates in place");
    await expect(up.getByTestId("notes-rollback")).toContainText("Upgrades are one-way");
    await expect(up).toContainText("CoderHelm ran no plan");
    // No CVE is invented for it.
    await expect(up.getByTestId("finding-cves")).toHaveCount(0);
    await expect(up.getByTestId("advisory-note")).toContainText("carries no CVE list");
    await shoot(page, "security-infrastructure-database-pr");
  });

  test("a runbook is complete and says why it is not a pull request", async ({ page }) => {
    await mockApi(page, overview());
    await page.goto("/security/infrastructure");
    const patch = rows(page).filter({ hasText: "engine patch to 16.4.3" });
    await expect(patch.getByTestId("fix-chip")).toHaveText("Runbook");
    await patch.getByRole("button", { name: /details of ledger-prod-aurora/ }).click();
    // In code, and still a runbook: the card says so.
    await expect(patch.getByTestId("fix-decision")).toContainText("This cannot be expressed in code.");
    await expect(patch.getByTestId("location-confidence")).toHaveText("Sure");
    for (const title of ["Scope", "What it is", "Expected interruption", "You need", "Check first", "Back up", "In the AWS console", "Run this in AWS", "Check after", "Rollback", "If nothing is done", "Where this comes from"]) {
      await expect(patch.getByText(title, { exact: true })).toBeVisible();
    }
    await expect(patch.getByTestId("runbook-scope")).toContainText("AWS account 111122223333, Region us-east-1.");
    await expect(patch.getByTestId("runbook-cli")).toContainText("--resource-identifier arn:aws:rds:us-east-1:111122223333:cluster:ledger-prod-aurora --apply-action system-update --opt-in-type next-maintenance");
    await expect(patch.getByTestId("runbook-backup")).toContainText("create-db-cluster-snapshot --db-cluster-identifier ledger-prod-aurora");
    await expect(patch.getByTestId("runbook-rollback")).toContainText("undo-opt-in");
    await expect(patch.getByTestId("apply-by")).toContainText("AWS's date for this action");
    await expect(patch).toContainText("Coderhelm never runs this.");
    // A patch's target is a version: shown.
    await expect(patch.getByTestId("from-to")).toHaveText("16.4 to 16.4.3");
    // Each fact's page and the day it was read; an old one is flagged.
    const sources = patch.getByTestId("guidance-sources").getByRole("listitem");
    await expect(sources).toHaveCount(2);
    await expect(sources.first()).toContainText("read Nov 13, 2026");
    await expect(sources.nth(1)).toContainText("Not re-read lately");
    await shoot(page, "security-infrastructure-database-runbook");
  });

  test("an unsure match opens no pull request and says what was found; a refused change says why", async ({ page }) => {
    await mockApi(page, overview());
    await page.goto("/security/infrastructure");
    const unsure = rows(page).filter({ hasText: "terraform-20240311094512345600000001" });
    await expect(unsure.getByTestId("fix-chip")).toHaveText("Runbook");
    await unsure.getByRole("button", { name: /details of terraform-/ }).click();
    await expect(unsure.getByTestId("fix-decision")).toContainText("is not sure where this resource is defined, so it opens no pull request");
    await expect(unsure.getByTestId("location-confidence")).toHaveText("Not sure");
    await expect(unsure.getByTestId("location-candidates")).toHaveText("It could also be: acme/infra:db/main.tf aws_db_instance.b.");
    await expect(unsure.getByTestId("code-note")).toContainText("raise its pinned version");
    // Without a full runbook the card still gives the command.
    await expect(unsure.getByTestId("runbook-cli")).toContainText("aws rds modify-db-instance");

    // Refused twice: the pull request is a draft (never closed), the row is a
    // runbook with the reason, the offending line and a way to apply the update.
    const refused = rows(page).filter({ hasText: "audit-prod-aurora" });
    await expect(refused.getByTestId("fix-chip")).toHaveText("Runbook");
    await refused.getByRole("button", { name: /details of audit-prod-aurora/ }).click();
    await expect(refused.getByText("Coderhelm made its pull request a draft")).toBeVisible();
    await expect(refused.getByTestId("fix-refused")).toContainText("modules/aurora/main.tf, line 5");
    await expect(refused.getByTestId("fix-refused")).toContainText("which replaces the resource");
    await expect(refused.getByTestId("fix-refused-note")).toContainText("kept as a draft");
    await expect(refused.getByTestId("fix-refused-note")).not.toContainText("closed");
    await expect(refused.getByRole("link", { name: "The draft pull request #418" })).toHaveAttribute("href", "https://github.com/acme/infra/pull/418");
    await expect(refused.getByTestId("fix-decision")).toContainText("makes no further attempt until the code");
    await expect(refused.getByTestId("runbook-cli")).toContainText("aws rds modify-db-cluster --db-cluster-identifier audit-prod-aurora");

    // Refused once: still a pull request, with the fix round under way.
    const fixing = rows(page).filter({ hasText: "billing-prod-aurora" });
    await expect(fixing.getByTestId("fix-chip")).toHaveText("Fix PR");
    await fixing.getByRole("button", { name: /details of billing-prod-aurora/ }).click();
    await expect(fixing.getByText("Coderhelm is correcting its own change")).toBeVisible();
    await expect(fixing.getByTestId("fix-refused-note")).toContainText("One fix round is correcting the lines below");
  });

  test("the details fit a narrow screen", async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 900 });
    await mockApi(page, overview());
    await page.goto("/security/infrastructure");
    const patch = rows(page).filter({ hasText: "engine patch to 16.4.3" });
    await patch.getByRole("button", { name: /details of ledger-prod-aurora/ }).click();
    await expect(patch.getByTestId("runbook-cli")).toBeVisible();
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(wide).toBeLessThanOrEqual(1);
  });
});
