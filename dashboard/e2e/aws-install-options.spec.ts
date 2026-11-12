import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { OPTIONAL_GROUPS, UPDATE_STACK, permissionsView } from "./aws-permissions-data";

// The AWS card does it by itself on a self-hosted install: a permission the
// next release adds arrives with "Update now to add it" (the same update as
// Settings, System), the update installing now says so, a version that
// already grants it says why it's missing and the fix, and the optional reads
// switch on the install's own stack after a review of exactly the read-only
// permissions they add. Another account's role keeps its one-click stack
// update in AWS. Every state at 1280 and 390 wide, never scrolling sideways.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const INSTALL = "210987654321";
const OTHER = "123456789012";
const CONFIRM = "a".repeat(64);
type Opt = "InfrastructureVulnerabilities" | "InspectorFindings" | "HealthEvents";
const KEY: Record<Opt, string> = { InfrastructureVulnerabilities: "infra", InspectorFindings: "inspector", HealthEvents: "health" };

interface Pending {
  id: string;
  mode: "update" | "options";
  status: "preparing" | "review" | "running";
  version: string;
  options?: Partial<Record<Opt, { from: string; to: string }>>;
  permission_changes?: string[];
  can_apply?: boolean;
  confirm?: string;
  preflight?: string[];
}

interface Db {
  accounts: string[];
  install: string;
  missing: string[];
  problem: { code: string; message: string; fix: string } | null;
  latest: string | null;
  options: Record<Opt, "on" | "off" | null>;
  blocked: string[];
  pending: Pending | null;
  history: Record<string, unknown>[];
  access: { state: string; link: string } | null;
  failNext: boolean;
  calls: { path: string; body: unknown }[];
}

function connection(account: string) {
  return {
    connection_id: account, role_arn: `arn:aws:iam::${account}:role/CoderHelmLogReader`, external_id: "1b4e28ba-2fa1-11d2-883f-0016d3cca427", region: "us-east-1",
    status: "active", log_groups: [], last_analyzed_at: new Date(Date.now() - 40 * 60_000).toISOString(), created_at: new Date(Date.now() - 9 * 86_400_000).toISOString(),
    abilities: {
      account, region: "us-east-1", role: "CoderHelmLogReader", status: "active", checked_at: new Date().toISOString(), check_error: "",
      logs: { available: true, on: true }, metrics: { available: true, on: true, switched_off: false },
      airflow: { available: true, on: true, switched_off: false, found: [], skipped: [], environments: [] }, missing: [], update_url: null, stack_name: UPDATE_STACK,
    },
  };
}

/** The pending change as the updater moves it on: each read of the version route is one step. */
function advance(db: Db) {
  const p = db.pending;
  if (!p) return;
  if (p.status === "preparing" && p.mode === "options") {
    const k = Object.keys(p.options ?? {})[0] as Opt;
    Object.assign(p, {
      status: "review",
      permission_changes: [`Api.GatewayOwnAccountRead (AWS::IAM::ManagedPolicy Modify: an IAM change)`, `Worker.WorkerOwnAccountRead (AWS::IAM::ManagedPolicy Modify: an IAM change)`],
      can_apply: true,
      confirm: CONFIRM,
      preflight: [],
      hold: `waiting for you to confirm: it changes permissions`,
    });
    void k;
  } else if (p.status === "running" && p.mode === "options") {
    const [k, c] = Object.entries(p.options ?? {})[0] as [Opt, { from: string; to: string }];
    const ok = !db.failNext;
    if (ok) db.options[k] = c.to as "on" | "off";
    db.history.unshift({
      id: p.id, version: p.version, from_version: p.version, actor: "owner@example.org", mode: "options", options: p.options, applied_by: "owner@example.org",
      status: ok ? "succeeded" : "rolled_back",
      ...(ok ? {} : { summary: "The update to v1.4.0 stopped: the Api part of the install could not be updated. AWS put everything back: your install stayed on v1.4.0.", fix: "Press Update again." }),
      started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
    });
    db.pending = null;
  }
}

async function backend(page: Page, init: Partial<Db> = {}): Promise<Db> {
  const db: Db = {
    accounts: [INSTALL], install: INSTALL, missing: [], problem: null, latest: null,
    options: { InfrastructureVulnerabilities: "on", InspectorFindings: "off", HealthEvents: "off" }, blocked: [],
    pending: null, history: [], access: null, failNext: false, calls: [], ...init,
  };
  const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.pathname === "/runtime-config.js", (r) =>
    r.fulfill({ contentType: "text/javascript", body: `window.__CODERHELM_CONFIG__ = ${JSON.stringify({ apiUrl: "", streamUrl: "", selfHosted: true, siteUrl: null, supportEmail: "it@example.org" })};` }),
  );
  await page.route((url) => !["localhost", "127.0.0.1"].includes(url.hostname), (r) => r.abort());
  await page.route((url) => ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/(api|auth)\//.test(url.pathname), async (r) => {
    const req = r.request();
    const p = new URL(req.url()).pathname;
    const body = req.method() === "GET" ? null : (req.postDataJSON() as unknown);
    if (req.method() !== "GET") db.calls.push({ path: p, body });
    if (p === "/api/me") return json(r, { user_id: "u_1", team_id: "t_1", github_login: null, email: "owner@example.org", avatar_url: "", role: "owner", platform_admin: true });
    if (p === "/api/usage") return json(r, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(r, { banners: [] });
    if (p === "/api/teams") return json(r, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/integrations") return json(r, { can_edit: true, items: [], migrated: 0 });
    if (p === "/api/repos") return json(r, { repos: [] });
    if (p === "/api/system/hybrid") return json(r, { available: false });
    if (p === "/api/aws-connections" && req.method() === "GET") return json(r, { connections: db.accounts.map(connection) });
    const m = p.match(/^\/api\/aws-connections\/(\d{12})\/permissions\/check$/);
    if (m) {
      const account = m[1];
      const install = account === db.install;
      const off = install ? (Object.keys(db.options) as Opt[]).filter((k) => db.options[k] !== "on").map((k) => KEY[k]) : ["inspector", "health"];
      const view = permissionsView(account, {
        missing: install ? db.missing : [],
        install,
        problem: install && db.missing.length ? db.problem ?? { code: "install_update", message: "1 read-only permission of this release is not on this install's read role yet.", fix: "They arrive with this install's next version update. Nothing is needed in AWS." } : null,
        optionalOff: off.filter((k) => !db.blocked.includes(k)),
        optionalBlocked: install ? db.blocked : [],
      });
      return json(r, { account: connection(account).abilities, status: "connected", reason: "", last_check: new Date().toISOString(), permissions: view });
    }
    if (p === "/api/system/version") {
      advance(db);
      const running = !!db.pending && db.pending.mode === "update";
      return json(r, {
        self_hosted: true,
        current: { version: "v1.4.0", commit: null, released_at: null, config_fingerprint: null },
        latest: db.latest ? { version: db.latest, notes: "", breaking: false } : null,
        update_available: !!db.latest && !running,
        running,
        history: db.history,
        native: { stack: "coderhelm-prod", can_apply: true, auto_apply: true, pending: db.pending, access: db.access, recovery: null, options: db.options },
      });
    }
    if (p === "/api/system/update") {
      db.pending = { id: "UPDATE#2026-11-11T10:00:00Z#u1", mode: "update", status: "running", version: db.latest ?? "v1.5.0" };
      return json(r, { id: db.pending.id, version: db.pending.version, status: "preparing", state: "started", actor: "owner@example.org" });
    }
    if (p === "/api/system/options") {
      const [k, to] = Object.entries((body as { options: Record<string, string> }).options)[0] as [Opt, string];
      if (db.options[k] === null) return json(r, { error: "v1.4.0 doesn't have this switch yet: it arrives with the next version update" }, 400);
      db.pending = { id: "UPDATE#2026-11-11T10:05:00Z#o1", mode: "options", status: "preparing", version: "v1.4.0", options: { [k]: { from: db.options[k]!, to } } };
      return json(r, { id: db.pending.id, version: "v1.4.0", mode: "options", status: "preparing", actor: "owner@example.org", options: db.pending.options });
    }
    if (p === "/api/system/update/apply") {
      const b = body as { id: string; confirm?: string };
      if (!db.pending || b.id !== db.pending.id || b.confirm !== CONFIRM) return json(r, { error: "confirm the changes it would make first" }, 400);
      db.pending.status = "running";
      return json(r, { id: b.id, version: "v1.4.0", status: "running", actor: "owner@example.org" });
    }
    if (/\/log-groups$/.test(p)) return json(r, { log_groups: [] });
    return json(r, { error: `not mocked: ${p}` }, 404);
  });
  return db;
}

/** Full-page screenshots at 1280 and 390 wide, and nothing scrolls sideways at either. */
async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} at ${width}px scrolls sideways`).toBeLessThanOrEqual(0);
    const card = page.locator("article").first();
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

test("a permission the next release adds: Update now to add it, then it arrives with the update installing now", async ({ page }) => {
  const db = await backend(page, { missing: ["logs:StopQuery"], latest: "v1.5.0" });
  await page.goto("/settings/integrations/aws/");
  const panel = page.getByTestId(`aws-perms-${INSTALL}`);
  await expect(panel.getByRole("heading", { name: "1 permission arrives with the next update" })).toBeVisible();
  await expect(panel.locator("section")).toHaveAttribute("data-case", "install");
  // Needed now is only the missing permission; the optional reads are apart and collapsed.
  const needed = panel.getByTestId(`aws-needed-${INSTALL}`);
  await expect(needed).toContainText("logs:StopQuery");
  await expect(needed).not.toContainText("Amazon Inspector");
  const optional = panel.getByTestId(`aws-optional-${INSTALL}`);
  await expect(optional).toContainText("Optional, off: 2 reads");
  await expect(optional.getByTestId("aws-optional-inspector")).toBeHidden();
  // Never "go to another page and figure it out": the update is right here.
  await expect(panel.getByRole("link", { name: /Open Version and updates/ })).toHaveCount(0);
  await expect(panel.getByTestId("install-needed-update")).toContainText("v1.5.0 adds it");
  await shot(page, "aws-install-update-available");

  await panel.getByRole("button", { name: "Update now to add it" }).click();
  const press = db.calls.find((c) => c.path === "/api/system/update");
  expect(press?.body).toEqual({ accept_permissions: true });
  await expect(panel.getByRole("heading", { name: "1 permission arrives with the update installing now" })).toBeVisible();
  await expect(panel.getByTestId("install-needed-running")).toContainText("Arrives with the update to v1.5.0 installing now");
  await shot(page, "aws-install-update-running");
});

test("this version already grants it: the card says exactly why and offers the fix", async ({ page }) => {
  await backend(page, {
    missing: ["logs:StopQuery"],
    problem: { code: "install_boundary", message: "This install's permission limit doesn't allow 1 of these read-only permissions yet.", fix: "An AWS admin applies the install's access update once (Settings, System, Version, Permissions: one link to the AWS console). No version update can change the limit." },
    access: { state: "pending", link: "https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate?stackName=coderhelm-prod-access" },
  });
  await page.goto("/settings/integrations/aws/");
  const panel = page.getByTestId(`aws-perms-${INSTALL}`);
  await expect(panel.getByRole("heading", { name: "1 permission is blocked by this install's permission limit" })).toBeVisible();
  const why = panel.getByTestId("install-needed-boundary");
  await expect(why).toContainText("v1.4.0 grants it, but this install's permission limit doesn't allow 1");
  await expect(why.getByRole("link", { name: /Open the access update in AWS/ })).toHaveAttribute("href", /stackName=coderhelm-prod-access/);
  await expect(panel.getByRole("button", { name: "Update now to add it" })).toHaveCount(0);
  await shot(page, "aws-install-current-boundary");
});

test("no newer version and nothing blocks it: what IAM says is missing, on which role, never a claim about the stack", async ({ page }) => {
  await backend(page, { missing: ["logs:StopQuery"] });
  await page.goto("/settings/integrations/aws/");
  const panel = page.getByTestId(`aws-perms-${INSTALL}`);
  await expect(panel.getByRole("heading", { name: "1 permission missing from this install's read role" })).toBeVisible();
  const why = panel.getByTestId("install-needed-current");
  await expect(why).toContainText("IAM's policy simulator says coderhelm-prod-ServiceRole-0a1b2c3d isn't allowed logs:StopQuery");
  await expect(why).toContainText("no newer version is out yet");
  // Nothing it didn't read: no "your stack grants it", no drift.
  await expect(why).not.toContainText(/grants it, yet|drift|changed in AWS/);
  await expect(why.getByRole("button", { name: "Check again" })).toBeVisible();
  await shot(page, "aws-install-missing-no-update");
});

test("an optional read switches on the install's own stack: review of exactly what it adds, confirm, progress, result", async ({ page }) => {
  const db = await backend(page);
  await page.goto("/settings/integrations/aws/");
  const panel = page.getByTestId(`aws-perms-${INSTALL}`);
  await expect(panel.getByText("Permissions up to date")).toBeVisible();
  // Nothing is "needed": the optional reads never read as an update.
  await expect(panel.getByRole("heading", { name: /Update needed|arrive/ })).toHaveCount(0);
  const optional = panel.getByTestId(`aws-optional-${INSTALL}`);
  await optional.locator("summary").click();
  await expect(optional.getByTestId("aws-optional-where")).toContainText("This install's own account: Coderhelm switches these on its own stack");
  const inspector = optional.getByTestId("aws-optional-inspector");
  await expect(inspector).toContainText("billed by AWS");
  await expect(optional.getByTestId("aws-optional-health")).toContainText("Business Support");
  await expect(inspector.getByTestId("install-switch-state-InspectorFindings")).toHaveText("Off");
  await shot(page, "aws-install-optional-off");

  await inspector.getByRole("switch", { name: /Amazon Inspector findings: turn on/ }).click();
  expect(db.calls.find((c) => c.path === "/api/system/options")?.body).toEqual({ options: { InspectorFindings: "on" } });
  const review = inspector.getByTestId("install-switch-review-InspectorFindings");
  await expect(review).toBeVisible({ timeout: 20_000 });
  await expect(review).toContainText("These read-only permissions will be added");
  for (const a of OPTIONAL_GROUPS.find((g) => g.key === "inspector")!.actions) await expect(review).toContainText(a);
  await expect(review).toContainText("Only InspectorFindings changes, on v1.4.0");
  await expect(review).toContainText("If it fails, AWS puts everything back");
  await shot(page, "aws-install-optional-review");

  await review.getByRole("button", { name: "Confirm and turn on" }).click();
  expect(db.calls.find((c) => c.path === "/api/system/update/apply")?.body).toEqual({ id: "UPDATE#2026-11-11T10:05:00Z#o1", confirm: CONFIRM });
  await expect(inspector.getByTestId("install-switch-done-InspectorFindings")).toBeVisible({ timeout: 20_000 });
  await expect(inspector.getByTestId("install-switch-done-InspectorFindings")).toContainText("switched on");
  await shot(page, "aws-install-optional-done");
});

test("a switch that AWS rolled back says so, in plain words", async ({ page }) => {
  await backend(page, { failNext: true });
  await page.goto("/settings/integrations/aws/");
  const optional = page.getByTestId(`aws-optional-${INSTALL}`);
  await optional.locator("summary").click();
  const health = optional.getByTestId("aws-optional-health");
  await health.getByRole("switch", { name: /AWS Health events: turn on/ }).click();
  await health.getByRole("button", { name: "Confirm and turn on" }).click({ timeout: 20_000 });
  const failed = health.getByTestId("install-switch-failed-HealthEvents");
  await expect(failed).toBeVisible({ timeout: 20_000 });
  await expect(failed).toContainText("AWS put everything back");
  await expect(health.getByTestId("install-switch-state-HealthEvents")).toHaveText("Off");
});

test("switched on but the install's permission limit blocks it: the card names the AWS admin step", async ({ page }) => {
  await backend(page, {
    options: { InfrastructureVulnerabilities: "on", InspectorFindings: "on", HealthEvents: "off" },
    blocked: ["infra", "inspector"],
    access: { state: "pending", link: "https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate?stackName=coderhelm-prod-access" },
  });
  await page.goto("/settings/integrations/aws/");
  const optional = page.getByTestId(`aws-optional-${INSTALL}`);
  await optional.locator("summary").click();
  const infra = optional.getByTestId("aws-optional-infra");
  await expect(infra.getByTestId("install-switch-state-InfrastructureVulnerabilities")).toHaveText("On, blocked by this install's permission limit");
  await expect(infra.getByTestId("install-switch-blocked-InfrastructureVulnerabilities")).toContainText("An AWS admin applies the install's access update");
  await expect(infra.getByRole("link", { name: "Open the access update in AWS" })).toHaveAttribute("href", /coderhelm-prod-access/);
  await expect(infra.getByRole("switch", { name: /turn off/ })).toBeVisible();
  await shot(page, "aws-install-optional-blocked");
});

test("a release without the switches: it arrives with the next update", async ({ page }) => {
  await backend(page, { options: { InfrastructureVulnerabilities: null, InspectorFindings: null, HealthEvents: null }, latest: "v1.5.0" });
  await page.goto("/settings/integrations/aws/");
  const optional = page.getByTestId(`aws-optional-${INSTALL}`);
  await optional.locator("summary").click();
  await expect(optional.getByTestId("install-switch-later-InspectorFindings")).toContainText("v1.4.0 doesn't have this switch yet: it arrives with the next update");
  await expect(optional.getByRole("switch")).toHaveCount(0);
});

test("another account's role: the optional reads turn on with its one-click stack update in AWS", async ({ page }) => {
  const db = await backend(page, { accounts: [OTHER], install: INSTALL });
  await page.goto("/settings/integrations/aws/");
  const panel = page.getByTestId(`aws-perms-${OTHER}`);
  await expect(panel.getByText("Permissions up to date")).toBeVisible();
  const optional = panel.getByTestId(`aws-optional-${OTHER}`);
  await optional.locator("summary").click();
  await expect(optional.getByTestId("aws-optional-where")).toContainText(`AWS account ${OTHER}: turned on in AWS with the role's one-click stack update`);
  const link = optional.getByTestId("aws-optional-turn-on-inspector");
  await expect(link).toHaveAttribute("href", /param_InspectorFindings=on/);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(optional.getByRole("switch")).toHaveCount(0);
  // Nothing on this install's own stack is offered for another account.
  expect(db.calls.filter((c) => c.path === "/api/system/options")).toEqual([]);
  await shot(page, "aws-account-optional-hosted");
});
