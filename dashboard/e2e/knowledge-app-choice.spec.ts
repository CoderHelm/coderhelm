import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The app choice in the Knowledge add flow on a self-hosted install with
// hybrid (Notion and Confluence):
// - "Use Coderhelm's app" shows one "Sign in with <app>" button and the
//   choice's one line: no token steps and no form fields;
// - a key stays behind "Use a key instead";
// - fully private, without the install's own app, shows the token steps;
// - there is no per-tool switch: the one Other apps choice lives in Settings;
// - when Coderhelm's app isn't ready yet, it says so, still with no form.
// Every call is answered here; nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const SELF = { apiUrl: "", streamUrl: "", selfHosted: true, version: "v1.2.0" };
const LABEL: Record<string, string> = { notion: "Notion", confluence: "Confluence", google_drive: "Google Drive", sanity: "Sanity", github: "GitHub", web: "Website" };

interface State {
  /** Which tools use Coderhelm's app. */
  coderhelm: Set<string>;
  /** Whether Coderhelm's app answers for a tool that uses it (the broker is ready). */
  brokerReady: boolean;
  puts: Record<string, unknown>[];
}

function hybridStatus(s: State) {
  const row = (id: string, name: string) => ({ id, name, mode: "hosted", through_coderhelm: "The sign-in only.", stays_with_you: "Every page Coderhelm reads.", uses_coderhelm: s.coderhelm.has(id) });
  return {
    apps_mode: s.coderhelm.size > 0 ? "coderhelm" : "private",
    available: true,
    hosted_url: "https://app.coderhelm.com",
    registered: true,
    install_id: "ins_abcdefghijklmnopqrstuvwx",
    cloudfront: "d111test.cloudfront.net",
    verified: true,
    name: null,
    github: { mode: "hosted", links: [], app_slug: "coderhelm" },
    integrations: [row("notion", "Notion"), row("confluence", "Confluence (Atlassian)"), row("google_drive", "Google Drive")],
    sharing: { enabled: false, payloads: false },
    checks: [],
  };
}

async function mockApi(page: Page, s: State) {
  const json = (route: Route, body: unknown, code = 200) => route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.pathname === "/runtime-config.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: `window.__CODERHELM_CONFIG__ = ${JSON.stringify(SELF)};` }),
  );
  await page.route((url) => !["localhost", "127.0.0.1"].includes(url.hostname), (route) => route.abort());
  await page.route((url) => ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/(api|auth|hybrid)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "owner@example.org", avatar_url: "", role: "owner", platform_admin: true });
    if (p === "/api/usage") return json(route, { month: "2026-10", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "example-org", status: "active", current: true }] });
    if (p === "/api/system/hybrid" && method === "GET") return json(route, hybridStatus(s));
    if (p === "/api/system/hybrid/settings" && method === "PUT") {
      s.puts.push(body);
      for (const [id, v] of Object.entries((body?.apps ?? {}) as Record<string, string>)) {
        if (v === "coderhelm") s.coderhelm.add(id);
        else s.coderhelm.delete(id);
      }
      return json(route, hybridStatus(s));
    }
    if (p === "/api/knowledge" && method === "GET")
      return json(route, { bases: [], can_manage: true, limits: { max_file_bytes: 1 << 24, max_files: 500, extensions: ["pdf", "md"], agents: [], read_roles: ["viewer", "member", "admin"] } });
    if (p === "/api/knowledge/connectors")
      return json(route, {
        connectors: Object.keys(LABEL).map((k) => ({
          kind: k,
          label: LABEL[k],
          blurb: `Pick what to bring in from ${LABEL[k]}`,
          connected: k === "github" || k === "web",
          via: "",
          // The install has no app of its own: sign-in only through Coderhelm's.
          can_sign_in: s.coderhelm.has(k) && s.brokerReady,
          reconnect_reason: "",
          connected_by: "",
          hint: "",
          live_updates: true,
          picker: k === "web" ? "address" : "tree",
          member_sign_in: k === "sanity",
          signed_in: false,
          signed_in_as: "owner@example.org",
          has_saved_key: false,
          token_path: k === "notion" || k === "confluence",
        })),
        visibility_note: "Everyone who can read this knowledge base can read what you add.",
      });
    return json(route, {});
  });
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `knowledge-app-choice-${name}.png`) });
}

for (const kind of ["notion", "confluence"] as const) {
  const label = LABEL[kind];

  test.describe(`${label}: the install's Other apps choice decides what the dialog asks for`, () => {
    test(`Coderhelm's app: one sign-in button, no token steps or fields`, async ({ page }) => {
      await mockApi(page, { coderhelm: new Set([kind]), brokerReady: true, puts: [] });
      await page.goto("/knowledge/");
      await page.getByTestId(`start-${kind}`).click();
      const step = page.getByTestId("connect-step");
      await expect(step).toHaveAttribute("data-state", "sign-in");
      await expect(step.getByTestId("hybrid-app-choice")).toHaveAttribute("data-state", "coderhelm");
      await expect(step.getByTestId("connect-button")).toHaveText(`Sign in with ${label}`);
      await expect(step.getByTestId("token-path")).toHaveCount(0);
      await expect(step.locator("input")).toHaveCount(0);
      await shot(page, `${kind}-coderhelm`);
      // A key stays one click away, behind its own link.
      await expect(step.getByTestId("use-token")).toHaveText("Use a key instead");
      await step.getByTestId("use-token").click();
      await expect(step.getByTestId("token-path")).toBeVisible();
    });

    test(`fully private (no own app set up): the token steps, and no sign-in button`, async ({ page }) => {
      await mockApi(page, { coderhelm: new Set(), brokerReady: true, puts: [] });
      await page.goto("/knowledge/");
      await page.getByTestId(`start-${kind}`).click();
      const step = page.getByTestId("connect-step");
      await expect(step.getByTestId("hybrid-app-choice")).toHaveAttribute("data-state", "own");
      await expect(step).toHaveAttribute("data-state", "token");
      await expect(step.getByTestId("connect-button")).toHaveCount(0);
      await expect(step.getByTestId("token-path")).toBeVisible();
      await shot(page, `${kind}-own`);
    });

    test(`no per-tool switch here: the dialog says which app and links to the one choice`, async ({ page }) => {
      const s: State = { coderhelm: new Set(), brokerReady: true, puts: [] };
      await mockApi(page, s);
      await page.goto("/knowledge/");
      await page.getByTestId(`start-${kind}`).click();
      const step = page.getByTestId("connect-step");
      const choice = step.getByTestId("hybrid-app-choice");
      await expect(choice).toContainText(`This install is fully private, so ${label} uses your team's own app.`);
      await expect(choice.getByRole("button")).toHaveCount(0);
      await expect(choice.getByRole("link", { name: "Change it for every tool in Settings, Version and updates, Hybrid" })).toHaveAttribute("href", /\/settings\/system\/?#hybrid/);
      expect(s.puts).toEqual([]);
    });

    test(`Coderhelm's app not ready yet: says so, still no form`, async ({ page }) => {
      await mockApi(page, { coderhelm: new Set([kind]), brokerReady: false, puts: [] });
      await page.goto("/knowledge/");
      await page.getByTestId(`start-${kind}`).click();
      const step = page.getByTestId("connect-step");
      await expect(step).toHaveAttribute("data-state", "app-not-ready");
      await expect(step.getByTestId("app-not-ready")).toContainText(`Coderhelm's ${label} app isn't ready on this install yet`);
      await expect(step.getByTestId("connect-button")).toHaveCount(0);
      await expect(step.getByTestId("token-path")).toHaveCount(0);
    });
  });
}

test.describe("at phone width", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test("Coderhelm's app fits with one button and no sideways scroll", async ({ page }) => {
    await mockApi(page, { coderhelm: new Set(["notion", "confluence"]), brokerReady: true, puts: [] });
    await page.goto("/knowledge/");
    await page.getByTestId("start-confluence").click();
    const step = page.getByTestId("connect-step");
    await expect(step.getByTestId("connect-button")).toHaveText("Sign in with Confluence");
    await expect(step.locator("input")).toHaveCount(0);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(wide).toBe(false);
    await shot(page, "confluence-coderhelm-375");
  });
});
