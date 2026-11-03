import { test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { mockApi } from "./settings-mock";

// Screenshots of Settings as an admin of a self-hosted install, for the
// settings redesign review. Made-up team and person only.

const DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "redesign");
const LABEL = process.env.SHOTS_LABEL || "after";

async function setUp(page: Page) {
  await mockApi(page, { role: "owner" });
  await page.route((url) => url.pathname === "/runtime-config.js", (r) =>
    r.fulfill({ contentType: "text/javascript", body: `window.__CODERHELM_CONFIG__ = ${JSON.stringify({ selfHosted: true, version: "v0.8.20" })};` }),
  );
  const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.pathname === "/api/me", (r) =>
    r.fulfill(json({ user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@acme.dev", avatar_url: "", role: "owner", auth_provider: "email", mfa_enabled: true, platform_admin: true })),
  );
  await page.route((url) => url.pathname === "/api/teams", (r) =>
    r.fulfill(json({ teams: [{ team_id: "t_1", org: "Acme-Engineering-Platform", status: "active", current: true }] })),
  );
  const now = new Date().toISOString();
  await page.route((url) => url.pathname === "/api/integrations", (r) =>
    r.fulfill(json({ can_edit: true, migrated: 0, items: [
      { id: "github", section: "code", name: "GitHub", does: "Reads code and opens pull requests.", status: "connected", reason: "", action: "manage", last_check: now, manage_href: "/settings/integrations/github", detail: {} },
      { id: "jira", section: "code", name: "Jira", does: "Turns tickets into runs.", status: "error", reason: "The Jira site answered 401: reconnect it.", action: "reconnect", last_check: now, manage_href: "/settings/integrations/jira", detail: {} },
    ] })),
  );
  await page.route((url) => url.pathname === "/api/usage", (r) =>
    r.fulfill(json({ month: "2026-11", total_tokens: 2_700_000, tokens_in: 2_000_000, tokens_out: 700_000, total_runs: 40, max_tokens: 40_000_000 })),
  );
}

async function capture(page: Page, route: string, name: string) {
  fs.mkdirSync(DIR, { recursive: true });
  for (const [width, height] of [[1440, 900], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(DIR, `${LABEL}-${name}-${width}.png`) });
    if (width === 1440 && name === "landing") await page.screenshot({ path: path.join(DIR, `${LABEL}-${name}-full-${width}.png`), fullPage: true });
  }
}

test("settings screenshots", async ({ page }) => {
  test.setTimeout(240_000);
  await setUp(page);
  await capture(page, "/settings", "landing");
  await capture(page, "/settings/repos", "repos");
  await capture(page, "/settings/integrations", "integrations");
  await capture(page, "/settings/guardrails", "guardrails");
  // The phone menu, opened.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/repos");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /menu/i }).first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(DIR, `${LABEL}-menu-390.png`) });
  if (LABEL === "after") {
    // Filtering the settings menu.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("/");
    await page.keyboard.type("jira");
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(DIR, `${LABEL}-filter-1440.png`) });
  }
});
