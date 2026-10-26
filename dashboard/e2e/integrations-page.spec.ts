import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Settings → Integrations. Every API call is answered here; nothing reaches a
// real backend. The backend works out each integration's status; these tests
// check the list shows it, offers one action, and that admins act while
// members only read.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

type Role = "viewer" | "member" | "admin" | "owner";
const LEVEL: Record<Role, number> = { viewer: 0, member: 1, admin: 3, owner: 4 };

const ACCOUNT = "123456789012";
const MIN = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

// What each integration does, as the API words it (services/gateway/src/routes/integrations.rs and plugins.rs).
const DOES: Record<string, string> = {
  github: "Reads your code, opens pull requests, reviews them and follows CI.",
  jira: "Starts work from Jira tickets and keeps their status in step with the pull request.",
  aws: "Reads CloudWatch logs, CloudWatch metrics and Airflow (MWAA) through a read-only role in your account.",
  newrelic: "NRQL queries, entity search, deployment markers and change events, and response time, error rate and throughput before and after a deploy.",
  confluence: "Searches and reads Confluence pages. Optionally adds text to the end of pages you list.",
  teams: "Posts alert cards, pull request links and recoveries to a Teams channel.",
  slack: "Posts alerts, pull request links and recoveries to a Slack channel.",
  sentry: "Query error events, list issues, and resolve incidents from Sentry.",
  figma: "Extract design tokens, inspect components, and pull assets from Figma files.",
  sanity: "Query documents, read schemas, and manage content in Sanity.",
  notion: "Search pages, read databases, and sync documentation from Notion.",
  linear: "Create and update issues, query projects, and sync status with Linear.",
  stripe: "List charges, subscriptions, and customers from your Stripe account.",
};

function plugin(id: string, name: string, category: string) {
  return {
    id, name, description: DOES[id], category, tier: 1, icon: id,
    credential_fields: [{ key: "api_token", label: "API token", placeholder: "tok_...", secret: true }],
    docs_url: "https://example.com/docs", repo_url: "https://github.com/example/mcp", default_prompt: "Read only.", recommended_permissions: "Read-only access",
  };
}

function card(id: string, section: string, name: string, status: string, action: string, over: Record<string, unknown> = {}) {
  return { id, section, name, does: DOES[id.startsWith("aws") ? "aws" : id], status, reason: "", action, last_check: "", manage_href: "", detail: {}, ...over };
}

function awsDetail(over: Record<string, unknown> = {}) {
  return {
    account: ACCOUNT, region: "us-east-1", role: "CoderHelmLogReader", status: "active", checked_at: ago(2 * MIN), check_error: "",
    logs: { available: true, on: true },
    metrics: { available: true, on: true, switched_off: false },
    airflow: { available: true, on: true, switched_off: false, found: ["prod-airflow", "staging-airflow"], skipped: [] as string[], environments: ["prod-airflow", "staging-airflow"] },
    missing: [], update_url: null, stack_name: "CoderHelmLogReaderOps", ...over,
  };
}

function pluginCard(id: string, name: string, section: string, enabled: boolean, creds: boolean) {
  const status = !enabled ? "not_connected" : creds ? "connected" : "needs_credentials";
  const action = !enabled ? "connect" : creds ? "manage" : "add_credentials";
  return card(id, section, name, status, action, {
    reason: status === "needs_credentials" ? "Switched on, but no credentials are saved, so agents don't get it." : "",
    detail: { plugin: plugin(id, name, section), enabled, has_credentials: creds, custom_prompt: "", last_test_ok: null, last_test_message: "" },
  });
}

function items() {
  return [
    card("github", "code", "GitHub", "connected", "manage", { reason: "Installed on your-team.", manage_href: "/settings/integrations/github" }),
    card("jira", "code", "Jira", "not_connected", "connect", { manage_href: "/settings/integrations/jira" }),
    card(`aws-${ACCOUNT}`, "cloud", `AWS account ${ACCOUNT}`, "connected", "manage", { last_check: ago(2 * MIN), manage_href: "/settings/integrations/aws", detail: awsDetail() }),
    card("newrelic", "monitoring", "New Relic", "connected", "manage", { last_check: ago(60 * MIN), detail: { kind: "newrelic", label: "New Relic", connected: true, enabled: true, status: "ready", key_hint: "1234", region: "us", account_ids: [] } }),
    card("confluence", "docs", "Confluence", "not_connected", "connect", { detail: { kind: "confluence", connected: false } }),
    card("teams", "chat", "Microsoft Teams", "not_connected", "connect", { detail: { enabled: false, has_webhook: false } }),
    card("slack", "chat", "Slack", "not_connected", "connect", { detail: { enabled: false, has_webhook: false } }),
    pluginCard("sentry", "Sentry", "monitoring", true, false),
    pluginCard("figma", "Figma", "docs", true, false),
    pluginCard("sanity", "Sanity", "docs", true, false),
    pluginCard("notion", "Notion", "docs", false, false),
    pluginCard("linear", "Linear", "other", true, true),
    pluginCard("stripe", "Stripe", "other", false, false),
  ];
}

interface Backend {
  role: Role;
  items: ReturnType<typeof items>;
  fail: boolean;
  domains: string[];
  calls: { method: string; path: string; body: Record<string, unknown> | null }[];
  /** The team alert channel, as the API shows it: never a URL. */
  notify: { enabled: boolean; webhooks: Record<"teams" | "slack", { set: boolean; hint: string }> };
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = {
    role: "admin",
    items: items(),
    fail: false,
    domains: ["example.com"],
    calls: [],
    notify: { enabled: false, webhooks: { teams: { set: false, hint: "" }, slack: { set: false, hint: "" } } },
    ...init,
  };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const at = (min: Role) => LEVEL[db.role] >= LEVEL[min];
  const forbidden = (r: Route) => json(r, { error: "Forbidden" }, 403);
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (r) => {
    const req = r.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    const body = req.postData() ? (JSON.parse(req.postData() as string) as Record<string, unknown>) : null;
    db.calls.push({ method, path: p, body });
    if (p === "/api/me") return json(r, { user_id: "u_1", team_id: "t_1", github_login: null, email: "person@example.com", avatar_url: "", role: db.role, auth_provider: "email" });
    if (p === "/api/usage") return json(r, { month: "2026-01", tokens_in: 0, tokens_out: 0, total_runs: 0, total_tokens: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(r, { banners: [] });
    if (p === "/api/teams") return json(r, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/integrations") {
      if (!at("member")) return forbidden(r);
      if (db.fail) return json(r, { error: "Something went wrong on our side. Try again." }, 500);
      return json(r, { can_edit: at("admin"), items: db.items, migrated: 0 });
    }
    if (p === "/api/reviewer/org-config" && method === "GET") return json(r, { instructions: "", web_domains: db.domains });
    if (p === "/api/reviewer/org-config" && method === "PUT") {
      if (!at("admin")) return forbidden(r);
      const list = ((body?.web_domains as string[]) ?? []).map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, ""));
      const bad = list.filter((d) => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) || /^[\d.]+$/.test(d));
      if (bad.length) return json(r, { error: `These aren't domain names: ${bad.join(", ")}. List bare domains like example.com.` }, 400);
      db.domains = [...new Set(list)];
      return json(r, { web_domains: db.domains });
    }
    const ab = p.match(/^\/api\/aws-connections\/(\d{12})\/abilities(\/check)?$/);
    if (ab) {
      if (!at("admin")) return forbidden(r);
      const item = db.items.find((i) => i.id === `aws-${ab[1]}`)!;
      const d = item.detail as ReturnType<typeof awsDetail>;
      if (!ab[2] && body) {
        if (typeof body.metrics === "boolean") d.metrics = { ...d.metrics, on: body.metrics, switched_off: !body.metrics };
        if (Array.isArray(body.airflow_environments)) {
          const keep = body.airflow_environments as string[];
          d.airflow = { ...d.airflow, skipped: d.airflow.found.filter((e) => !keep.includes(e)), environments: keep };
        }
      }
      item.last_check = ab[2] ? new Date().toISOString() : item.last_check;
      return json(r, { account: d, status: item.status, reason: item.reason, last_check: item.last_check });
    }
    const en = p.match(/^\/api\/plugins\/([a-z]+)\/enable$/);
    if (en) {
      if (!at("admin")) return forbidden(r);
      db.items = db.items.map((i) => (i.id === en[1] ? pluginCard(i.id, i.name, i.section, true, false) : i));
      return json(r, { status: "enabled", plugin_id: en[1] });
    }
    const cr = p.match(/^\/api\/plugins\/([a-z]+)\/credentials$/);
    if (cr) {
      if (!at("admin")) return forbidden(r);
      db.items = db.items.map((i) => (i.id === cr[1] ? pluginCard(i.id, i.name, i.section, true, true) : i));
      return json(r, { status: "saved" });
    }
    if (/^\/api\/plugins\/[a-z]+\/test$/.test(p)) return json(r, { status: "ok", tool_count: 4 });
    if (p === "/api/alert-notify" && method === "GET") return at("admin") ? json(r, db.notify) : forbidden(r);
    if (p === "/api/alert-notify" && method === "PUT") {
      if (!at("admin")) return forbidden(r);
      db.notify.enabled = !!body?.enabled;
      for (const [kind, name] of [["teams", "Microsoft Teams"], ["slack", "Slack"]] as const) {
        const change = body?.[`${kind}_webhook`] as { url?: string; clear?: boolean } | undefined;
        if (change?.clear) db.notify.webhooks[kind] = { set: false, hint: "" };
        if (change?.url) db.notify.webhooks[kind] = { set: true, hint: `${new URL(change.url).hostname} …${change.url.slice(-4)}` };
        const on = db.notify.webhooks[kind].set;
        db.items = db.items.map((i) => (i.id === kind ? card(kind, "chat", name, on ? "connected" : "not_connected", on ? "manage" : "connect") : i));
      }
      return json(r, { ok: true });
    }
    if (p === "/api/notify/test") return at("admin") ? json(r, { ok: true }) : forbidden(r);
    return json(r, { error: `not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `no sideways scroll at ${width}px`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

const row = (page: Page, id: string) => page.getByTestId(`integration-${id}`);
/** The row's one control, found by the name it starts with. */
const control = (page: Page, id: string, name: string, role: "button" | "link" = "button") =>
  row(page, id).getByRole(role, { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},`) });

test("one list per section, each row with its status in the same column and one action", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/integrations");
  await expect(page.getByRole("heading", { name: "Integrations", level: 1 })).toBeVisible();
  const headings = page.getByRole("main").getByRole("heading", { level: 2 });
  await expect(headings).toHaveText(["Code and tickets", "Cloud", "Monitoring", "Docs and design", "Chat", "Other tools", "MCP servers", "Your websites"]);
  await expect(page.getByTestId("integrations-summary")).toContainText("4 connected · 3 need credentials");
  // Lists, not card grids.
  await expect(page.getByRole("main").getByRole("list", { name: "Monitoring" }).getByRole("listitem")).toHaveCount(2);

  const gh = control(page, "github", "GitHub", "link");
  await expect(gh).toHaveAccessibleName("GitHub, Connected. Manage");
  await expect(gh).toHaveAttribute("href", /\/settings\/integrations\/github\/?$/);
  const jira = control(page, "jira", "Jira", "link");
  await expect(jira).toHaveAccessibleName("Jira, Not connected. Connect");
  await expect(row(page, "jira").getByTestId("integration-action")).toHaveText("Connect");
  await expect(row(page, "newrelic").getByTestId("integration-status")).toContainText("Connected");
  // One "Checked" line for the page; a recent row doesn't repeat it.
  await expect(page.getByTestId("integrations-checked")).toContainText(/Checked \d+ min(utes?)? ago/);
  await expect(row(page, "newrelic").getByTestId("integration-status")).not.toContainText("Checked");

  // Switched on without credentials: the status says it and the action fixes it; the why is inside.
  for (const [id, name] of [["sentry", "Sentry"], ["figma", "Figma"], ["sanity", "Sanity"]]) {
    const r = row(page, id);
    await expect(r).toHaveAttribute("data-status", "needs_credentials");
    await expect(r.getByTestId("integration-status")).toHaveText("Needs credentials");
    await expect(control(page, id, name)).toHaveAccessibleName(`${name}, Needs credentials. Add credentials`);
    await expect(r.getByText("Switched on, but no credentials are saved, so agents don't get it.")).toHaveCount(0);
  }
  // Problems sort to the top of their section.
  await expect(page.getByRole("list", { name: "Docs and design" }).getByRole("listitem").first()).toHaveAttribute("data-status", "needs_credentials");

  // Rows line up: every status column starts at the same x, and rows are one height.
  const boxes = await page.locator('[data-testid^="integration-"][data-status]').evaluateAll((els) =>
    els.map((el) => ({ h: (el as HTMLElement).getBoundingClientRect().height, x: el.querySelector('[data-testid="integration-status"]')!.getBoundingClientRect().left })),
  );
  expect(new Set(boxes.map((b) => Math.round(b.x))).size, "status column is aligned").toBe(1);
  for (const b of boxes) expect(b.h, "rows stay compact").toBeLessThanOrEqual(80);

  await expect(page.getByRole("main").getByRole("link", { name: "Data sources" }).first()).toHaveAttribute("href", /\/data-sources\/?$/);
  await shot(page, "integrations");
});

test("opening a row explains it and holds its settings", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/integrations");
  await control(page, "sentry", "Sentry").click();
  const panel = row(page, "sentry").getByTestId("integration-panel");
  await expect(panel.getByText("Switched on, but no credentials are saved, so agents don't get it.")).toBeVisible();
  await expect(panel.getByText(DOES.sentry)).toBeVisible();
  await expect(panel.getByLabel("API token")).toBeVisible();
  await shot(page, "integrations-open");
});

test("a saved key reads as saved, and a connection keeps a guide for agents", async ({ page }) => {
  const db = await mockApi(page);
  const nr = db.items.find((i) => i.id === "newrelic")!;
  (nr.detail as Record<string, unknown>).instructions = "The api app is the backend.";
  await page.goto("/settings/integrations");
  await control(page, "newrelic", "New Relic").click();
  const panel = row(page, "newrelic").getByTestId("integration-panel");
  await expect(panel.getByLabel("Saved, ending in 1234")).toHaveText("••••••••1234");
  await expect(panel.getByLabel("User key")).toHaveCount(0);
  await expect(panel.getByLabel("Guide for agents")).toHaveValue("The api app is the backend.");
  await shot(page, "integrations-saved-key");
  await panel.getByRole("button", { name: "Replace key" }).click();
  await expect(panel.getByLabel("User key")).toBeVisible();
  await panel.getByLabel("Guide for agents").fill("The api app is the backend; web is the site.");
  await panel.getByRole("button", { name: "Save and test" }).click();
  await expect.poll(() => db.calls.find((c) => c.method === "PUT")?.path).toBe("/api/connectors/newrelic");
  expect(db.calls.find((c) => c.method === "PUT")!.body!.instructions).toBe("The api app is the backend; web is the site.");
});

test("Confluence through the Jira app is connected without a token, and writes stay a choice", async ({ page }) => {
  const db = await mockApi(page);
  db.items = db.items.map((i) =>
    i.id === "confluence"
      ? card("confluence", "docs", "Confluence", "connected", "manage", {
          reason: "Connected through the Jira app.",
          detail: {
            kind: "confluence", label: "Confluence", connected: true, enabled: true, status: "ready",
            site: "https://yourcompany.atlassian.net", via: "jira_app", spaces: [], write_enabled: false, write_pages: [], updated_at: "",
          },
        })
      : i,
  );
  await page.goto("/settings/integrations");
  await expect(row(page, "confluence").getByTestId("integration-status")).toContainText("Connected");
  await control(page, "confluence", "Confluence").click();
  const panel = row(page, "confluence").getByTestId("integration-panel");
  await expect(panel.getByTestId("confluence-via-jira-app")).toContainText("Connected through the Jira app on https://yourcompany.atlassian.net");
  // No address, email or token to fill in, and nothing to remove.
  await expect(panel.getByLabel("API token")).toHaveCount(0);
  await expect(panel.getByLabel("Confluence address")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: /^(Remove|Reset) Confluence/ })).toHaveCount(0);
  await panel.getByLabel(/Allow agents to add text/).check();
  await panel.getByLabel("Writable page ids").fill("42, 43");
  await panel.getByRole("button", { name: "Save and test" }).click();
  await expect.poll(() => db.calls.find((c) => c.method === "PUT")?.path).toBe("/api/connectors/confluence");
  const body = db.calls.find((c) => c.method === "PUT")!.body!;
  expect(body.via).toBe("jira_app");
  expect(body.write_enabled).toBe(true);
  expect(body.write_pages).toEqual(["42", "43"]);
  expect(body.key).toBeUndefined();
  expect(body.site).toBeUndefined();
  // A team can still use its own token.
  await panel.getByRole("button", { name: "Use an API token instead" }).click();
  await expect(panel.getByLabel("Confluence address")).toBeVisible();
  await expect(panel.getByLabel("API token")).toBeVisible();
});

test("an AWS account shows its abilities; an admin switches one off and deselects an environment", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/integrations");
  const aws = row(page, `aws-${ACCOUNT}`);
  await control(page, `aws-${ACCOUNT}`, `AWS account ${ACCOUNT}`).click();
  const summary = aws.getByTestId(`aws-abilities-${ACCOUNT}`);
  await expect(summary.getByText("Logs")).toBeVisible();
  await expect(summary.getByText("CloudWatch, us-east-1")).toBeVisible();
  await expect(summary.getByText("prod-airflow, staging-airflow")).toBeVisible();
  await expect(aws.getByRole("link", { name: "Log groups, findings and more accounts" })).toHaveAttribute("href", /\/settings\/integrations\/aws\/?$/);

  const panel = aws.getByTestId(`aws-panel-${ACCOUNT}`);
  await expect(panel.getByRole("checkbox", { name: "prod-airflow" })).toBeChecked();
  await panel.getByRole("checkbox", { name: "staging-airflow" }).click();
  await expect(panel.getByRole("checkbox", { name: "staging-airflow" })).not.toBeChecked();
  await expect.poll(() => db.calls.find((c) => c.method === "PUT" && c.path.endsWith("/abilities"))?.body).toEqual({ airflow_environments: ["prod-airflow"] });
  await panel.getByRole("switch", { name: "Let agents read Metrics" }).click();
  await expect.poll(() => db.calls.filter((c) => c.method === "PUT").at(-1)?.body).toEqual({ metrics: false });
  await expect(summary.getByText("Off")).toBeVisible();

  await panel.getByRole("button", { name: "Check again" }).click();
  await expect.poll(() => db.calls.some((c) => c.method === "POST" && c.path === `/api/aws-connections/${ACCOUNT}/abilities/check`)).toBe(true);
  await shot(page, "integrations-aws-open");
});

test("an AWS role without the permissions offers the one-click stack", async ({ page }) => {
  const list = items().map((i) =>
    i.id === `aws-${ACCOUNT}`
      ? {
          ...i,
          detail: awsDetail({
            metrics: { available: false, on: false, switched_off: false },
            airflow: { available: false, on: false, switched_off: false, found: [], skipped: [], environments: [] },
            missing: ["metrics", "airflow"],
            update_url: "https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate?stackName=CoderHelmLogReaderOps",
          }),
        }
      : i,
  );
  await mockApi(page, { items: list });
  await page.goto("/settings/integrations");
  const aws = row(page, `aws-${ACCOUNT}`);
  await control(page, `aws-${ACCOUNT}`, `AWS account ${ACCOUNT}`).click();
  await expect(aws.getByTestId(`aws-abilities-${ACCOUNT}`).getByText("No access yet")).toHaveCount(2);
  await expect(aws.getByRole("link", { name: "Add access in AWS" })).toHaveAttribute("href", /stackName=CoderHelmLogReaderOps/);
  await expect(aws.getByRole("switch", { name: "Let agents read Airflow" })).toBeDisabled();
});

test("adding credentials to a switched-on server makes it connected", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/integrations");
  const sentry = row(page, "sentry");
  await control(page, "sentry", "Sentry").click();
  await sentry.getByLabel("API token").fill("sntrys_example");
  await sentry.getByRole("button", { name: "Save and test" }).click();
  await expect(sentry).toHaveAttribute("data-status", "connected");
  expect(db.calls.find((c) => c.path === "/api/plugins/sentry/credentials")?.body).toEqual({ credentials: { api_token: "sntrys_example" } });
  expect(db.calls.some((c) => c.path === "/api/plugins/sentry/test")).toBe(true);
});

test("connecting a server that is off asks for credentials first, then switches it on", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/integrations");
  const notion = row(page, "notion");
  await expect(notion.getByTestId("integration-status")).toHaveText("Not connected");
  await control(page, "notion", "Notion").click();
  // Opening it changes nothing: no half-on server waiting for credentials.
  await expect(notion.getByLabel("API token")).toBeVisible();
  await expect(notion).toHaveAttribute("data-status", "not_connected");
  expect(db.calls.some((c) => c.path === "/api/plugins/notion/enable")).toBe(false);
  await notion.getByLabel("API token").fill("ntn_example");
  await notion.getByRole("button", { name: "Save and test" }).click();
  await expect(notion).toHaveAttribute("data-status", "connected");
  const order = db.calls.map((c) => c.path).filter((x) => x.startsWith("/api/plugins/notion/"));
  expect(order.slice(0, 2)).toEqual(["/api/plugins/notion/enable", "/api/plugins/notion/credentials"]);
});

test("every row says in a short line what Coderhelm does with it, never a placeholder", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/integrations");
  const rows = page.locator('[data-testid^="integration-"][data-status]');
  await expect(rows).toHaveCount(items().length);
  const generic = /^(what coderhelm does with|manage|settings|open|configure|more|details)\b|^[\w ]+ for agents\.?$/i;
  const lines: string[] = [];
  for (const r of await rows.all()) {
    const id = (await r.getAttribute("data-testid"))!.replace("integration-", "");
    const line = r.getByTestId("integration-does");
    const text = (await line.innerText()).trim();
    expect(text.length, `${id} has a line`).toBeGreaterThan(10);
    expect(text.length, `${id}'s line fits one row`).toBeLessThanOrEqual(60);
    expect(text, `${id}'s line is specific`).not.toMatch(generic);
    // The full sentence is there on hover and inside.
    expect((await line.getAttribute("title"))!.length, `${id} has a full description`).toBeGreaterThan(30);
    lines.push(text);
  }
  expect(new Set(lines).size, "no two rows share a line").toBe(lines.length);
});

test("the whole row opens it, from the mouse or the keyboard, and Close folds it back", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/integrations");
  const nr = row(page, "newrelic");
  const ctl = control(page, "newrelic", "New Relic");
  await expect(ctl).toHaveAttribute("aria-expanded", "false");
  await expect(ctl).toHaveAccessibleDescription("Queries, deploy markers and error rates");
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await row(page, "sentry").hover();
  await page.getByRole("main").locator("#monitoring").screenshot({ path: path.join(SHOTS_DIR, "integrations-hover.png") });
  // A click on the status column, not only the name, opens it.
  await nr.getByTestId("integration-status").click();
  await expect(ctl).toHaveAttribute("aria-expanded", "true");
  await expect(nr.getByLabel("Saved, ending in 1234")).toBeVisible();
  await nr.getByRole("button", { name: "Close" }).click();
  await expect(ctl).toHaveAttribute("aria-expanded", "false");
  await ctl.focus();
  await page.keyboard.press("Enter");
  await expect(ctl).toHaveAttribute("aria-expanded", "true");
  // Rows with their own page are links.
  await row(page, "github").getByTestId("integration-does").click();
  await expect(page).toHaveURL(/\/settings\/integrations\/github\/?$/);
});

test("Integrations and Data sources are listed in Settings' own navigation, with no AWS item and no count", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/integrations");
  // The main menu has one Settings entry, marked current on every settings page.
  const main = page.getByRole("navigation", { name: "Main" });
  await expect(main.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(main.getByRole("link", { name: "Integrations", exact: true })).toHaveCount(0);
  const nav = page.getByRole("navigation", { name: "Settings" });
  const integrations = nav.getByRole("link", { name: "Integrations", exact: true });
  await expect(integrations).toHaveAttribute("href", /\/settings\/integrations\/?$/);
  await expect(integrations).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "AWS" })).toHaveCount(0);
  await expect(nav.getByTestId("nav-integrations-attention")).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Data sources" })).toHaveAttribute("href", /\/data-sources\/?$/);
});

test("on the AWS page members see Integrations lit, and no AWS item", async ({ page }) => {
  await mockApi(page, { role: "member" });
  await page.goto("/settings/integrations/aws");
  const nav = page.getByRole("navigation", { name: "Settings" });
  await expect(nav.getByRole("link", { name: "Integrations", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "AWS" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Data sources" })).toHaveCount(0);
});

test("a link to a row opens it (from a skill check)", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/integrations#integration-figma");
  await expect(row(page, "figma").getByLabel("API token")).toBeVisible();
  await page.goto("/settings/integrations#integration-aws");
  await expect(page.getByTestId(`aws-panel-${ACCOUNT}`)).toBeVisible();
});

test("members see every status but no actions", async ({ page }) => {
  await mockApi(page, { role: "member" });
  await page.goto("/settings/integrations");
  await expect(page.getByTestId("integrations-summary")).toContainText("Only admins can connect or change integrations.");
  await expect(row(page, "sentry").getByTestId("integration-status")).toHaveText("Needs credentials");
  await expect(row(page, "sentry").getByTestId("integration-action")).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
  // Members can still open the pages they may read.
  await expect(control(page, `aws-${ACCOUNT}`, `AWS account ${ACCOUNT}`, "link")).toHaveAttribute("href", /\/settings\/integrations\/aws\/?$/);
  await shot(page, "integrations-member");
});

test("viewers are told who can open the page", async ({ page }) => {
  await mockApi(page, { role: "viewer" });
  await page.goto("/settings/integrations");
  await expect(page.getByTestId("integration-github")).toHaveCount(0);
});

test("a failed load offers a retry", async ({ page }) => {
  const db = await mockApi(page, { fail: true });
  await page.goto("/settings/integrations");
  await expect(page.getByText("We couldn't load your integrations")).toBeVisible();
  db.fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("integration-github")).toBeVisible();
});

test("old addresses lead to Integrations", async ({ page }) => {
  await mockApi(page);
  await page.goto("/settings/plugins");
  await expect(page).toHaveURL(/\/settings\/integrations\/?#other-tools$/);
  await expect(page.getByTestId("integration-linear")).toBeVisible();
});

test("your websites: an admin adds and removes domains, and a bad entry says why", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/integrations");
  const card = page.getByTestId("websites-card");
  await expect(page.getByRole("heading", { name: "Your websites", level: 2 })).toBeVisible();
  await expect(page.getByText("Coderhelm can check that links and redirects on these sites work (status and page title only).")).toBeVisible();
  await expect(card.getByRole("list", { name: "Your websites" }).getByTestId("website-name")).toHaveText(["example.com"]);

  await card.getByLabel("Add a domain").fill("https://Docs.Example.org/, shop.example.net");
  await card.getByRole("button", { name: "Add" }).click();
  await expect(card.getByTestId("website-name")).toHaveText(["example.com", "docs.example.org", "shop.example.net"]);
  await expect(card.getByLabel("Add a domain")).toHaveValue("");
  expect(db.calls.filter((c) => c.method === "PUT").at(-1)?.body).toEqual({ web_domains: ["example.com", "docs.example.org", "shop.example.net"] });

  await card.getByLabel("Add a domain").fill("10.0.0.1");
  await card.getByRole("button", { name: "Add" }).click();
  await expect(card.getByRole("alert")).toHaveText("These aren't domain names: 10.0.0.1. List bare domains like example.com.");
  await expect(card.getByLabel("Add a domain")).toHaveValue("10.0.0.1");
  await expect(card.getByRole("listitem")).toHaveCount(3);

  await card.getByRole("button", { name: "Remove docs.example.org" }).click();
  await expect(card.getByTestId("website-name")).toHaveText(["example.com", "shop.example.net"]);
  await expect(card.getByRole("alert")).toHaveCount(0);
  expect(db.domains).toEqual(["example.com", "shop.example.net"]);
  await card.screenshot({ path: path.join(SHOTS_DIR, "integrations-websites.png") });
});

test("your websites: members read the list but can't change it", async ({ page }) => {
  await mockApi(page, { role: "member", domains: ["example.com", "example.org"] });
  await page.goto("/settings/integrations");
  const card = page.getByTestId("websites-card");
  await expect(card.getByTestId("website-name")).toHaveText(["example.com", "example.org"]);
  await expect(card.getByText("Only admins can change this list.")).toBeVisible();
  await expect(card.getByRole("button")).toHaveCount(0);
  await expect(card.getByRole("textbox")).toHaveCount(0);
});

const SLACK_HOOK = "https://hooks.slack.com/services/T0EXAMPLE/B0EXAMPLE/abcdefghijklmnop";

test("Slack sits next to Teams under Chat and connects with an incoming webhook", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/integrations");
  await expect(page.getByRole("main").getByRole("list", { name: "Chat" }).getByRole("listitem")).toHaveCount(2);
  await control(page, "slack", "Slack").click();
  const panel = row(page, "slack").getByTestId("integration-panel");
  await expect(panel.getByText(DOES.slack)).toBeVisible();
  // Only Slack is offered here; Teams has its own row.
  await expect(panel.getByRole("checkbox", { name: "Slack" })).toBeChecked();
  await expect(panel.getByRole("checkbox", { name: "Microsoft Teams" })).toHaveCount(0);
  const field = panel.getByRole("textbox", { name: "Slack webhook address" });
  // A Teams address is not a Slack webhook.
  await field.fill("https://acme.webhook.office.com/webhookb2/abc");
  await expect(panel.getByText("Paste the Incoming Webhook URL Slack shows")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Save" })).toBeDisabled();
  await field.fill(SLACK_HOOK);
  await panel.getByRole("button", { name: "Send test message" }).click();
  await expect(panel.getByText("Test message sent. Check the channel.")).toBeVisible();
  expect(db.calls.find((c) => c.path === "/api/notify/test")!.body).toEqual({ destination: "alerts", channel: "slack", url: SLACK_HOOK });
  await panel.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => db.calls.find((c) => c.method === "PUT" && c.path === "/api/alert-notify")?.body).toEqual({
    enabled: true,
    slack_webhook: { url: SLACK_HOOK },
  });
  await expect(row(page, "slack").getByTestId("integration-status")).toContainText("Connected");
  await shot(page, "integrations-slack");
});

test("a saved webhook shows only as a hint, is tested without the page knowing it, and can be removed", async ({ page }) => {
  const db = await mockApi(page, {
    notify: { enabled: true, webhooks: { teams: { set: false, hint: "" }, slack: { set: true, hint: "hooks.slack.com …mnop" } } },
  });
  db.items = db.items.map((i) => (i.id === "slack" ? card("slack", "chat", "Slack", "connected", "manage") : i));
  await page.goto("/settings/integrations");
  await control(page, "slack", "Slack").click();
  const panel = row(page, "slack").getByTestId("integration-panel");
  await expect(panel.getByText("hooks.slack.com …mnop")).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "Slack webhook address" })).toHaveCount(0);
  await panel.getByRole("button", { name: "Send test message" }).click();
  await expect(panel.getByText("Test message sent. Check the channel.")).toBeVisible();
  // No URL in the request: the server uses the saved one.
  expect(db.calls.find((c) => c.path === "/api/notify/test")!.body).toEqual({ destination: "alerts", channel: "slack" });
  await panel.getByRole("checkbox", { name: "Slack" }).uncheck();
  await panel.getByRole("switch", { name: "Post alerts to the team channel" }).click();
  await panel.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => db.calls.find((c) => c.method === "PUT" && c.path === "/api/alert-notify")?.body).toEqual({
    enabled: false,
    slack_webhook: { clear: true },
  });
});
