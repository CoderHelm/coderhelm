import { expect, test, type Page, type Route } from "@playwright/test";

// The one OAuth callback page, for every kind of sign-in that comes back to
// it: a knowledge source (Confluence, Notion), an MCP server, a catalog app,
// and a provider refusal. The "provider" is this test: it opens the
// callback address the way the provider would. Every API call is answered
// here; nothing reaches a real backend.

interface Calls {
  callback: Record<string, unknown>[];
}

type Answer = { status: number; body: Record<string, unknown> };

async function mockApi(page: Page, answer: (body: Record<string, unknown>) => Answer): Promise<Calls> {
  const calls: Calls = { callback: [] };
  const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth|hybrid)\//.test(url.pathname), async (r) => {
    const url = new URL(r.request().url());
    const p = url.pathname;
    const body = r.request().postData() ? (JSON.parse(r.request().postData() as string) as Record<string, unknown>) : {};
    if (p === "/api/me") return json(r, { user_id: "u_1", team_id: "t_1", github_login: null, email: "dana@example.com", avatar_url: "", role: "admin", auth_provider: "email" });
    if (p === "/api/usage") return json(r, { month: "2026-01", tokens_in: 0, tokens_out: 0, total_runs: 0, total_tokens: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(r, { banners: [] });
    if (p === "/api/teams") return json(r, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/mcp-servers/oauth/callback") {
      calls.callback.push(body);
      const a = answer(body);
      return json(r, a.body, a.status);
    }
    if (p.startsWith("/api/knowledge")) return json(r, { bases: [], connectors: [], visibility_note: "" });
    if (p.startsWith("/api/integrations")) return json(r, { can_edit: true, items: [], migrated: 0 });
    if (p.startsWith("/api/mcp-servers")) return json(r, { servers: [], can_edit: true, redirect_uri: "" });
    return json(r, {});
  });
  return calls;
}

const confluence = { id: "ks-confluence", name: "Confluence (knowledge)", catalog_id: "source:confluence" };

test("a Confluence sign-in goes back to the Knowledge page that started it", async ({ page }) => {
  const calls = await mockApi(page, () => ({ status: 200, body: { server: confluence, tools_error: null, flow: "ks", return_to: "/knowledge/base/?id=kb1" } }));
  await page.goto("/settings/integrations/mcp-callback/?code=c1&state=ks.abc");
  await expect(page).toHaveURL(/\/knowledge\/base\/\?id=kb1&connected=confluence$/);
  expect(calls.callback).toEqual([{ state: "ks.abc", code: "c1" }]);
});

test("a knowledge refusal shows the provider's own words and leads back to Knowledge", async ({ page }) => {
  const calls = await mockApi(page, () => ({
    status: 400,
    body: {
      error: "Confluence didn't grant access (access_denied). Confluence said: \"The app is not installed on this site\".",
      code: "access_denied",
      flow: "ks",
      return_to: "/knowledge/",
      server_name: "Confluence",
      catalog_id: "source:confluence",
    },
  }));
  await page.goto("/settings/integrations/mcp-callback/?error=access_denied&error_description=The+app+is+not+installed+on+this+site&state=ks.abc");
  const box = page.getByTestId("mcp-callback");
  await expect(box).toHaveAttribute("data-state", "failed");
  await expect(page.getByText("Confluence isn't connected")).toBeVisible();
  await expect(page.getByText(/The app is not installed on this site/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Knowledge" })).toHaveAttribute("href", "/knowledge/");
  // The page asked the API with everything the provider sent, and never said "MCP server".
  expect(calls.callback[0]).toEqual({ state: "ks.abc", error: "access_denied", error_description: "The app is not installed on this site" });
  await expect(page.getByText(/MCP server/)).toHaveCount(0);
  expect(page.url()).not.toContain("error=");
});

test("an expired knowledge state still reads as Knowledge from its tag", async ({ page }) => {
  await mockApi(page, () => ({ status: 400, body: { error: "That sign-in was already used or has expired. Start it again.", code: "", flow: "ks", return_to: "" } }));
  await page.goto("/settings/integrations/mcp-callback/?code=c1&state=ks.gone");
  await expect(page.getByText("The source isn't connected")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Knowledge" })).toBeVisible();
});

test("a state from an older gateway (no kind) still finishes through the API", async ({ page }) => {
  const calls = await mockApi(page, () => ({ status: 200, body: { server: { id: "ks-notion", name: "Notion (knowledge)", catalog_id: "source:notion" }, tools_error: null } }));
  // Knowledge reads ?connected= and takes it out of the address at once, so
  // the arrival is caught as it happens rather than by polling the address.
  const arrived = page.waitForURL(/\/knowledge\/\?connected=notion$/, { waitUntil: "commit" });
  await page.goto("/settings/integrations/mcp-callback/?code=c1&state=plainrandomstate");
  await arrived;
  expect(calls.callback).toHaveLength(1);
});

test("an MCP server sign-in goes back to its row on Integrations", async ({ page }) => {
  await mockApi(page, () => ({ status: 200, body: { server: { id: "docs", name: "Docs", catalog_id: "" }, tools_error: null, flow: "mcp", return_to: "" } }));
  await page.goto("/settings/integrations/mcp-callback/?code=c1&state=mcp.abc&iss=https%3A%2F%2Fauth.example.com");
  await expect(page).toHaveURL(/\/settings\/integrations\/#integration-mcp:docs$/);
});

test("a catalog app sign-in goes back to its catalog row", async ({ page }) => {
  await mockApi(page, () => ({ status: 200, body: { server: { id: "app-figma", name: "Figma", catalog_id: "figma" }, tools_error: null, own_app: true, flow: "app", return_to: "" } }));
  await page.goto("/settings/integrations/mcp-callback/?code=c1&state=app.abc");
  await expect(page).toHaveURL(/\/settings\/integrations\/#integration-figma$/);
});

test("an MCP refusal names the server and its error code", async ({ page }) => {
  await mockApi(page, () => ({
    status: 400,
    body: { error: "Docs refused the permissions Coderhelm asked for (invalid_scope).", code: "invalid_scope", flow: "mcp", server_name: "Docs", catalog_id: "", return_to: "" },
  }));
  await page.goto("/settings/integrations/mcp-callback/?error=invalid_scope&state=mcp.abc");
  await expect(page.getByText("Docs isn't connected")).toBeVisible();
  await expect(page.getByText(/Docs refused the permissions Coderhelm asked for \(invalid_scope\)/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Integrations" })).toBeVisible();
});

test("a provider error with no state is shown as the provider sent it", async ({ page }) => {
  const calls = await mockApi(page, () => ({ status: 500, body: {} }));
  await page.goto("/settings/integrations/mcp-callback/?error=unauthorized_client&error_description=redirect_uri+is+not+registered");
  await expect(page.getByTestId("mcp-callback")).toHaveAttribute("data-state", "failed");
  await expect(page.getByText(/unauthorized_client/)).toBeVisible();
  await expect(page.getByText(/redirect_uri is not registered/)).toBeVisible();
  expect(calls.callback).toHaveLength(0);
});

test("a return path off the dashboard is never followed", async ({ page }) => {
  await mockApi(page, () => ({ status: 200, body: { server: { id: "docs", name: "Docs", catalog_id: "" }, tools_error: null, flow: "mcp", return_to: "//evil.example.net/x" } }));
  await page.goto("/settings/integrations/mcp-callback/?code=c1&state=mcp.abc");
  await expect(page).toHaveURL(/\/settings\/integrations\/#integration-mcp:docs$/);
});
