import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ECS_MISSING, UPDATE_STACK, permissionsView, roleGroups } from "./aws-permissions-data";

// Connected AWS accounts on a self-hosted install: the role trusts the
// install's own account (never CoderHelm's), and each account shows whether
// its role has this release's read-only permissions, with the one-click
// update, the re-check when the person comes back, and why it failed.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const INSTALL_ACCOUNT = "210987654321";
const HOSTED_ACCOUNT = "654654210434";
const A = "123456789012";
const B = "345678901234";
const EXTERNAL_ID = "1b4e28ba-2fa1-11d2-883f-0016d3cca427";
const TEMPLATE = "https://coderhelm-public.s3.amazonaws.com/launch/v1.4.0/coderhelm-log-reader.yaml";

interface Perm {
  missing: string[];
  /** The problem a check returns once Update was pressed (and the permissions are still missing). */
  afterPress?: { code: string; message: string; fix: string };
  status?: "error";
}

interface Backend {
  accounts: string[];
  perms: Record<string, Perm>;
  checks: { account: string; pressed: boolean }[];
}

function abilities(account: string) {
  return {
    account, region: "us-east-1", role: "CoderHelmLogReader", status: "active", checked_at: new Date().toISOString(), check_error: "",
    logs: { available: true, on: true },
    metrics: { available: true, on: true, switched_off: false },
    airflow: { available: true, on: true, switched_off: false, found: ["prod-airflow"], skipped: [], environments: ["prod-airflow"] },
    missing: [], update_url: null, stack_name: UPDATE_STACK,
  };
}

function connection(account: string) {
  return {
    connection_id: account, role_arn: `arn:aws:iam::${account}:role/CoderHelmLogReader`, external_id: EXTERNAL_ID, region: "us-east-1", status: "active",
    log_groups: [], last_analyzed_at: new Date(Date.now() - 40 * 60_000).toISOString(), created_at: new Date(Date.now() - 9 * 86_400_000).toISOString(),
    abilities: abilities(account),
  };
}

async function selfHosted(page: Page, init: Partial<Backend> = {}): Promise<Backend & { outside: string[] }> {
  const db: Backend & { outside: string[] } = { accounts: [A], perms: {}, checks: [], outside: [], ...init };
  const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.pathname === "/runtime-config.js", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: `window.__CODERHELM_CONFIG__ = ${JSON.stringify({ apiUrl: "", streamUrl: "", selfHosted: true, siteUrl: null, supportEmail: "it@example.org" })};`,
    }),
  );
  await page.route((url) => !["localhost", "127.0.0.1"].includes(url.hostname), (r) => {
    db.outside.push(r.request().url());
    return r.abort();
  });
  await page.route((url) => ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/(api|auth)\//.test(url.pathname), async (r) => {
    const req = r.request();
    const p = new URL(req.url()).pathname;
    if (p === "/api/me") return json(r, { user_id: "u_1", team_id: "t_1", github_login: null, email: "owner@example.org", avatar_url: "", role: "owner", platform_admin: true });
    if (p === "/api/usage") return json(r, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(r, { banners: [] });
    if (p === "/api/teams") return json(r, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/integrations") return json(r, { can_edit: true, items: [], migrated: 0 });
    if (p === "/api/repos") return json(r, { repos: [] });
    if (p === "/api/system/hybrid") return json(r, { available: false });
    if (p === "/api/aws-connections" && req.method() === "GET") return json(r, { connections: db.accounts.map(connection) });
    if (p === "/api/aws-connections/cfn-url") {
      return json(r, {
        cfn_url: `https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate?stackName=CoderHelmLogReader&templateURL=${encodeURIComponent(TEMPLATE)}&param_ExternalId=${EXTERNAL_ID}&param_CoderHelmAccountId=${INSTALL_ACCOUNT}&param_TrustedRolePrefix=coderhelm-prod-`,
        external_id: EXTERNAL_ID,
        template_url: TEMPLATE,
        account_id: INSTALL_ACCOUNT,
        trusted_role_prefix: "coderhelm-prod-",
        self_hosted: true,
        abilities: roleGroups(),
        permissions_id: "3f9a1c2e",
      });
    }
    if (p === "/api/aws-connections/template") {
      return r.fulfill({ status: 200, contentType: "text/yaml", body: `Parameters:\n  CoderHelmAccountId:\n    Default: "${INSTALL_ACCOUNT}"\n` });
    }
    const m = p.match(/^\/api\/aws-connections\/(\d{12})\/permissions\/check$/);
    if (m) {
      const account = m[1];
      const pressed = !!(req.postDataJSON() as { pressed?: boolean } | null)?.pressed;
      db.checks.push({ account, pressed });
      const perm = db.perms[account] ?? { missing: [] };
      const view = permissionsView(account, {
        missing: perm.missing,
        status: perm.status,
        problem: pressed && perm.missing.length ? perm.afterPress ?? null : undefined,
      });
      return json(r, { account: abilities(account), status: "connected", reason: "", last_check: new Date().toISOString(), permissions: view });
    }
    if (/\/log-groups$/.test(p)) return json(r, { log_groups: [] });
    return json(r, { error: `not mocked: ${p}` }, 404);
  });
  return db;
}

/** Full-page screenshots at 1440 and 390 wide, and a check that nothing scrolls sideways. */
async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} at ${width}px scrolls sideways`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

/** Presses Update in AWS: the console opens in a new tab, which the test closes. */
async function pressUpdate(page: Page, scope = page.locator("body")) {
  const popup = page.context().waitForEvent("page");
  await scope.getByRole("link", { name: /Update in AWS/ }).first().click();
  await (await popup).close();
}

/** The person comes back to the dashboard's tab. */
async function comeBack(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}

test("connecting: the role trusts this install's own account, never CoderHelm's", async ({ page }) => {
  const db = await selfHosted(page, { accounts: [] });
  await page.goto("/settings/integrations/aws/");
  const stack = page.getByRole("link", { name: /Open the stack in AWS/ });
  await expect(stack).toHaveAttribute("href", new RegExp(`param_CoderHelmAccountId=${INSTALL_ACCOUNT}`));
  await expect(stack).toHaveAttribute("href", /param_TrustedRolePrefix=coderhelm-prod-/);
  await expect(stack).toHaveAttribute("href", /templateURL=https%3A%2F%2Fcoderhelm-public\.s3\.amazonaws\.com%2Flaunch%2Fv1\.4\.0%2F/);

  await page.getByRole("button", { name: "I'll make it myself" }).click();
  const manual = page.getByTestId("aws-manual-role");
  await expect(manual.getByTestId("aws-trusted-account")).toHaveText(INSTALL_ACCOUNT);
  await expect(manual).toContainText("this install's own AWS account");
  await expect(manual).toContainText("coderhelm-prod-*");
  const trust = manual.getByTestId("aws-trust-policy");
  await expect(trust).toContainText(`arn:aws:iam::${INSTALL_ACCOUNT}:root`);
  await expect(trust).toContainText(EXTERNAL_ID);
  await expect(trust).toContainText(`arn:aws:iam::${INSTALL_ACCOUNT}:role/coderhelm-prod-*`);
  const policy = manual.getByTestId("aws-permissions-policy");
  for (const a of ["ecs:DescribeTasks", "iam:SimulatePrincipalPolicy", "lambda:ListTags", "airflow:InvokeRestApi"]) await expect(policy).toContainText(a);
  // The one stack read is scoped to CoderHelm's own update stacks; nothing reads function configuration.
  await expect(policy).toContainText("stack/CoderHelmLogReaderUpdate-*/*");
  await expect(policy).not.toContainText("lambda:GetFunction");
  await expect(page.getByText(HOSTED_ACCOUNT)).toHaveCount(0);

  const download = page.waitForEvent("download");
  await manual.getByRole("button", { name: "Download the template" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("coderhelm-log-reader.yaml");
  expect(fs.readFileSync((await file.path())!, "utf8")).toContain(INSTALL_ACCOUNT);
  expect(db.outside.filter((u) => u.includes("coderhelm.com"))).toEqual([]);
  await shot(page, "aws-connect-selfhost");
});

test("up to date: a quiet line, checked live", async ({ page }) => {
  const db = await selfHosted(page);
  await page.goto("/settings/integrations/aws/");
  const panel = page.getByTestId(`aws-perms-${A}`);
  await expect(panel.getByText("Permissions up to date")).toBeVisible();
  await expect(panel).toContainText("All 26 read-only permissions this release uses");
  expect(db.checks.some((c) => c.account === A)).toBe(true);
  await expect(page.getByRole("link", { name: /Update in AWS/ })).toHaveCount(0);
  await shot(page, "aws-perms-up-to-date");
});

test("update needed: what each permission reads, one click, and success when the person comes back", async ({ page }) => {
  const db = await selfHosted(page, { perms: { [A]: { missing: ECS_MISSING } } });
  await page.goto("/settings/integrations/aws/");
  const panel = page.getByTestId(`aws-perms-${A}`);
  await expect(panel.getByRole("heading", { name: "Update needed: 3 new read-only permissions" })).toBeVisible();
  await expect(panel).toContainText("Everything stays read-only");
  await expect(panel.getByText("ECS services and tasks")).toBeVisible();
  await expect(panel.getByText("Checking its own permissions")).toBeVisible();
  await expect(panel.getByText("ecs:DescribeTasks", { exact: true }).first()).toBeVisible();
  await expect(panel).toContainText(`Sign in to AWS account ${A}`);
  const link = panel.getByRole("link", { name: /Update in AWS/ });
  await expect(link).toHaveAttribute("href", new RegExp(`stackName=${UPDATE_STACK}`));
  await expect(link).toHaveAttribute("target", "_blank");
  await shot(page, "aws-perms-update-needed");

  await pressUpdate(page, panel);
  await expect(panel.getByText(/Waiting for the update/)).toBeVisible();
  // The stack finished in AWS; the person comes back to the tab.
  db.perms[A] = { missing: [] };
  await comeBack(page);
  await expect(page.getByText("Permissions updated")).toBeVisible();
  await expect(page.getByTestId(`aws-perms-${A}`).getByText("Permissions up to date")).toBeVisible();
  expect(db.checks.filter((c) => c.pressed).length).toBeGreaterThan(0);
  await shot(page, "aws-perms-after-update");
});

test("failed: the reason in one sentence and the fix", async ({ page }) => {
  const db = await selfHosted(page, {
    perms: {
      [A]: {
        missing: ECS_MISSING,
        afterPress: {
          code: "stack_not_found",
          message: `There's no stack named ${UPDATE_STACK} in account ${A}, region us-east-1.`,
          fix: `Sign in to AWS account ${A}, the role's account, and press Update again: the stack must be created there.`,
        },
      },
    },
  });
  await page.goto("/settings/integrations/aws/");
  const panel = page.getByTestId(`aws-perms-${A}`);
  await pressUpdate(page, panel);
  await comeBack(page);
  await expect(panel.getByText(`There's no stack named ${UPDATE_STACK} in account ${A}, region us-east-1.`)).toBeVisible();
  await expect(panel).toContainText("the stack must be created there");
  // Still one click away.
  await expect(panel.getByRole("link", { name: /Update in AWS/ })).toBeVisible();
  expect(db.checks.some((c) => c.pressed)).toBe(true);
  await shot(page, "aws-perms-failed");
});

test("a permissions boundary or an SCP is named, and a role CoderHelm can't take on says so", async ({ page }) => {
  await selfHosted(page, {
    accounts: [A, B],
    perms: {
      [A]: { missing: ["ecs:ListTasks"], afterPress: { code: "scp", message: `An organization policy (SCP) blocks 1 of these permissions in account ${A}.`, fix: "Ask your AWS organization's admin to allow these read-only actions for the CoderHelmLogReader role, then check again." } },
      [B]: { missing: [], status: "error" },
    },
  });
  await page.goto("/settings/integrations/aws/");
  const a = page.getByTestId(`aws-perms-${A}`);
  await pressUpdate(page, a);
  await comeBack(page);
  await expect(a.getByText(/organization policy \(SCP\) blocks 1/)).toBeVisible();
  await expect(page.getByTestId(`aws-perms-${B}`).getByText("Coderhelm can't check this role")).toBeVisible();
});

test("several accounts: one list with every account's state and an update link for each", async ({ page }) => {
  await selfHosted(page, { accounts: [A, B], perms: { [A]: { missing: ECS_MISSING }, [B]: { missing: [] } } });
  await page.goto("/settings/integrations/aws/");
  const list = page.getByTestId("aws-permissions-overview");
  await expect(list).toContainText("1 of 2 accounts need an update.");
  const rowA = list.getByRole("listitem").filter({ hasText: `Account ${A}` });
  const rowB = list.getByRole("listitem").filter({ hasText: `Account ${B}` });
  await expect(rowA).toContainText("Update needed: 3 new read-only permissions");
  await expect(rowA.getByRole("link", { name: /Update in AWS/ })).toHaveAttribute("href", /stackName=CoderHelmLogReaderUpdate-/);
  await expect(rowB).toContainText("Permissions up to date");
  await expect(rowB.getByRole("link", { name: /Update in AWS/ })).toHaveCount(0);
  await shot(page, "aws-perms-several-accounts");
});
