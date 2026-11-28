import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Settings → Integrations: Jira, Confluence and Atlassian's own server are one
// Atlassian row (services/gateway/src/routes/integrations.rs, atlassian_card).
// Each piece keeps its own card under `detail.parts`. Every API call is
// answered here; nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

function card(id: string, section: string, name: string, status: string, action: string, over: Record<string, unknown> = {}) {
  return { id, section, name, does: `${name} does things.`, status, reason: "", action, last_check: "", manage_href: "", detail: {}, ...over };
}

function plugin(id: string, name: string) {
  return {
    id, name, description: "Agent tools for Jira issues and Confluence pages.", category: "Project Management", tier: 2, icon: id,
    credential_fields: [], docs_url: "https://example.com/docs", repo_url: "https://example.com/docs", default_prompt: "Read only.", recommended_permissions: "Read access",
    npx_package: "", remote_url: "https://mcp.example.com/v2/mcp", remote_key: false,
  };
}

interface Parts {
  jira: string;
  confluence: string;
  tools: string;
  reason?: string;
  status?: string;
  action?: string;
}

function atlassian(p: Parts) {
  const jira = card("jira", "code", "Jira", p.jira, p.jira === "connected" ? "manage" : "connect", { manage_href: "/settings/integrations/jira", detail: { app: p.jira === "connected", app_update: null } });
  const confluence = card("confluence", "docs", "Confluence", p.confluence, p.confluence === "connected" ? "manage" : "connect", { detail: { kind: "confluence", connected: false, knowledge: null } });
  const tools = card("atlassian", "code", "Atlassian", p.tools, p.tools === "connected" ? "manage" : "connect", {
    detail: { plugin: plugin("atlassian", "Atlassian"), enabled: false, has_credentials: false, custom_prompt: "", last_test_ok: null, last_test_message: "", remote: null, own_app: null, unused: [] },
  });
  return card("atlassian", "code", "Atlassian", p.status ?? "not_connected", p.action ?? "connect", {
    reason: p.reason ?? "",
    detail: {
      app_update: null,
      parts: [
        { id: "jira", name: "Jira", what: "CoderHelm's Jira app (Forge): tickets start work.", item: jira },
        { id: "confluence", name: "Confluence", what: "Agents read pages and Knowledge syncs them.", item: confluence },
        { id: "agent_tools", name: "Agent tools", what: "Atlassian's own server (Rovo MCP).", item: tools },
      ],
    },
  });
}

async function mockApi(page: Page, items: unknown[], connect: (r: Route) => Promise<void>) {
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const context = page.context();
  await context.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await context.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (r) => {
    const p = new URL(r.request().url()).pathname;
    if (p === "/api/me") return json(r, { user_id: "u_1", team_id: "t_1", github_login: null, email: "person@example.com", avatar_url: "", role: "admin", auth_provider: "email" });
    if (p === "/api/usage") return json(r, { month: "2026-01", tokens_in: 0, tokens_out: 0, total_runs: 0, total_tokens: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(r, { banners: [] });
    if (p === "/api/teams") return json(r, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/integrations") return json(r, { can_edit: true, items, migrated: 0 });
    if (p === "/api/reviewer/org-config") return json(r, { instructions: "", web_domains: [] });
    if (p === "/api/knowledge/connectors/confluence/connect") return connect(r);
    return json(r, { error: `not mocked: ${p}` }, 404);
  });
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width === 1280 ? "desktop" : "phone"}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

const github = card("github", "code", "GitHub", "connected", "manage", { manage_href: "/settings/integrations/github" });

test("one Atlassian row covers Jira, Confluence and agent tools", async ({ page }) => {
  await mockApi(page, [github, atlassian({ jira: "not_connected", confluence: "not_connected", tools: "not_connected" })], (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.goto("/settings/integrations/");
  const rows = page.locator('[data-testid^="integration-"][data-status]');
  await expect(page.getByTestId("integration-atlassian")).toBeVisible();
  // No separate Jira or Confluence row.
  await expect(page.getByTestId("integration-jira")).toHaveCount(0);
  await expect(page.getByTestId("integration-confluence")).toHaveCount(0);
  expect(await rows.count()).toBe(2);

  await page.getByTestId("integration-atlassian").getByRole("button", { name: /Atlassian/ }).click();
  const panel = page.getByTestId("atlassian-panel");
  await expect(panel.getByTestId("atlassian-part-jira")).toBeVisible();
  await expect(panel.getByTestId("atlassian-part-confluence")).toBeVisible();
  await expect(panel.getByTestId("atlassian-part-agent_tools")).toBeVisible();
  await expect(panel.getByRole("link", { name: "Install the Jira app" })).toHaveAttribute("href", /\/settings\/integrations\/jira/);
  // One Connect, for the next piece that takes a sign-in: Confluence first.
  await expect(panel.getByTestId("atlassian-connect")).toHaveAttribute("data-next", "confluence");
  await expect(panel.getByRole("button", { name: "Connect Atlassian" })).toBeVisible();
  await shot(page, "atlassian-one");
});

test("old links to the Jira or Confluence row open the Atlassian row", async ({ page }) => {
  await mockApi(page, [github, atlassian({ jira: "connected", confluence: "connected", tools: "not_connected", status: "connected", action: "manage", reason: "Jira and Confluence are connected. Agent tools isn't set up." })], (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.goto("/settings/integrations/#integration-confluence");
  const panel = page.getByTestId("atlassian-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("atlassian-summary")).toHaveText("Jira and Confluence are connected. Agent tools isn't set up.");
  // Connected Jira and Confluence carry over: the next step is agent tools.
  await expect(panel.getByTestId("atlassian-part-jira")).toHaveAttribute("data-status", "connected");
  await expect(panel.getByTestId("atlassian-connect")).toHaveAttribute("data-next", "agent_tools");
  await expect(panel.getByRole("link", { name: "Manage the Jira app" })).toBeVisible();
});

test("Atlassian's sign-in failing on its side is said in plain words", async ({ page }) => {
  const words = "Confluence's sign-in page is failing on Confluence's side (HTTP 500), so CoderHelm didn't send you there. Nothing on your side needs changing. Try again in a few minutes.";
  await mockApi(page, [github, atlassian({ jira: "not_connected", confluence: "not_connected", tools: "not_connected" })], (r) =>
    r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: words }) }),
  );
  await page.goto("/settings/integrations/#integration-atlassian");
  const panel = page.getByTestId("atlassian-panel");
  await panel.getByRole("button", { name: "Connect Atlassian" }).click();
  await expect(panel.getByText("failing on Confluence's side (HTTP 500)")).toBeVisible();
  // Nobody was sent anywhere.
  await expect(page).toHaveURL(/\/settings\/integrations\//);
});
