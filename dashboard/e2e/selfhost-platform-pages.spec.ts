import { expect, test, type Page } from "@playwright/test";
import { mockApi } from "./settings-mock";

// A self-hosted install has none of the hosted service's platform pages: no
// Admin (every team, beta sign-ups, the allowlist), no support queue. Its
// install admins find Sign-in apps in Settings, This install.

async function selfHosted(page: Page) {
  await mockApi(page, { role: "owner" });
  await page.route((url) => url.pathname === "/runtime-config.js", (r) =>
    r.fulfill({ contentType: "text/javascript", body: `window.__CODERHELM_CONFIG__ = ${JSON.stringify({ selfHosted: true, version: "v0.0.1" })};` }),
  );
  const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.pathname === "/api/me", (r) =>
    r.fulfill(json({ user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: "owner", auth_provider: "email", mfa_enabled: true, platform_admin: true })),
  );
  await page.route((url) => url.pathname === "/api/admin/sign-in-apps", (r) =>
    r.fulfill(json({
      secret_name: "coderhelm/prod/secrets",
      apps: [{ kind: "notion", name: "Notion", app: "Notion integration", configured: false, source: "", id_key: "notion_client_id", secret_key: "notion_client_secret", console: "https://www.notion.so/my-integrations", scopes: [], redirect_uri: "http://localhost/settings/integrations/mcp-callback/" }],
    })),
  );
}

test("the Admin and Support queue pages don't exist on a self-hosted install", async ({ page }) => {
  await selfHosted(page);
  for (const path of ["/admin", "/admin/tickets", "/admin/self-host", "/admin/queue"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" }), path).toBeVisible();
    await expect(page.getByRole("tab", { name: /Beta sign-ups|Allowlist/ }), path).toHaveCount(0);
  }
});

test("install admins find Sign-in apps in Settings, This install", async ({ page }) => {
  await selfHosted(page);
  await page.goto("/settings/");
  const menu = page.getByRole("navigation", { name: "Settings" });
  await menu.getByRole("link", { name: /^Sign-in apps/ }).click();
  await expect(page).toHaveURL(/\/settings\/sign-in-apps\/?$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign-in apps" })).toBeVisible();
  await expect(page.getByText("Notion integration")).toBeVisible();
  await expect(menu.getByRole("link", { name: /^Sign-in apps/ })).toHaveAttribute("aria-current", "page");
});
