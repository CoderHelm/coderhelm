import { expect, test, type Page, type Route } from "@playwright/test";
import { shoot } from "./infra-shots";
import { permissionsView } from "./aws-permissions-data";

// Integrations › AWS: the "Infrastructure vulnerabilities" switch on a
// connected account. Switched on while the role lacks the reads, it names
// the feature, the exact actions the update stack adds and the account an
// AWS admin signs in to; it says it never reads Lambda settings or user data.

const A = "123456789012";
const MISSING = ["ec2:DescribeInstances", "ec2:DescribeImages", "eks:DescribeNodegroup", "rds:DescribePendingMaintenanceActions"];

function account(on: boolean, available: boolean | null) {
  const perms = permissionsView(A, { missing: [] });
  return {
    account: A, region: "us-east-1", role: "CoderHelmLogReader", status: "active", checked_at: new Date().toISOString(), check_error: "",
    logs: { available: true, on: true },
    metrics: { available: true, on: true, switched_off: false },
    airflow: { available: false, on: false, switched_off: false, found: [], skipped: [], environments: [] },
    infrastructure: { available, on, missing: on && available === false ? MISSING : [] },
    missing: [], update_url: null, stack_name: "CoderHelmLogReaderUpdate-3f9a1c2e",
    permissions: on && available === false
      ? {
          ...perms,
          abilities: [...perms.abilities, { key: "infra", name: "Infrastructure vulnerabilities", why: "Reads which versions run.", actions: MISSING, missing: MISSING, optional: true }],
          update: {
            url: `https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate?stackName=CoderHelmLogReaderUpdate-3f9a1c2e-kb1&param_RoleName=CoderHelmLogReader&param_InfrastructureVulnerabilities=on`,
            stack_name: "CoderHelmLogReaderUpdate-3f9a1c2e-kb1",
            template_url: "https://example.com/coderhelm-log-reader-update.yaml",
            sign_in_account: A,
            stacks_url: "https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks",
          },
        }
      : perms,
  };
}

async function mockApi(page: Page) {
  const db = { on: false, puts: [] as unknown[] };
  const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (r) => r.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (r) => {
    const req = r.request();
    const p = new URL(req.url()).pathname;
    if (p === "/api/me") return json(r, { user_id: "u_1", team_id: "t_1", github_login: null, email: "owner@example.org", avatar_url: "", role: "owner" });
    if (p === "/api/usage") return json(r, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(r, { banners: [] });
    if (p === "/api/teams") return json(r, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/integrations") return json(r, { can_edit: true, items: [], migrated: 0 });
    if (p === "/api/repos") return json(r, { repos: [] });
    const conn = () => ({
      connection_id: A, role_arn: `arn:aws:iam::${A}:role/CoderHelmLogReader`, region: "us-east-1", status: "active", log_groups: [],
      abilities: account(db.on, db.on ? false : null),
    });
    if (p === "/api/aws-connections" && req.method() === "GET") return json(r, { connections: [conn()] });
    if (p === `/api/aws-connections/${A}/abilities` && req.method() === "PUT") {
      const body = req.postDataJSON() as { infrastructure?: boolean };
      db.puts.push(body);
      if (typeof body.infrastructure === "boolean") db.on = body.infrastructure;
      return json(r, { account: conn().abilities, status: "connected", reason: "", last_check: new Date().toISOString() });
    }
    if (/permissions\/check$/.test(p)) return json(r, { account: conn().abilities, status: "connected", reason: "", last_check: new Date().toISOString(), permissions: conn().abilities.permissions });
    if (/\/log-groups$/.test(p)) return json(r, { log_groups: [] });
    return json(r, { error: `not mocked: ${p}` }, 404);
  });
  return db;
}

test("switching on Infrastructure vulnerabilities names what it reads and the update it needs", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/integrations/aws/");
  const sw = page.getByRole("switch", { name: "Infrastructure vulnerabilities" });
  await expect(sw).toBeVisible();
  await expect(sw).not.toBeChecked();
  await expect(page.getByText("It never reads Lambda function settings, launch template user data or environment variables.")).toBeVisible();
  await sw.click();
  await page.getByRole("button", { name: /^Save/ }).first().click();
  await expect.poll(() => db.puts).toContainEqual({ infrastructure: true });
  const missing = page.getByTestId("infra-reads-missing");
  await expect(missing).toContainText("Infrastructure vulnerabilities needs 4 more read-only permissions.");
  await expect(missing).toContainText("rds:DescribePendingMaintenanceActions");
  await expect(missing.getByRole("link", { name: "creates the update stack" })).toHaveAttribute("href", /InfrastructureVulnerabilities=on/);
  await missing.scrollIntoViewIfNeeded();
  await shoot(page, "aws-infrastructure-switch");
});
