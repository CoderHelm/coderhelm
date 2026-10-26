import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Connecting an app in the Knowledge add flow:
// - choosing an app goes straight to that app's step, with a placeholder
//   while the team's connections load: the list of apps never shows again;
// - without the app's sign-in on this install, Notion and Confluence connect
//   with a token pasted right there (checked, saved, then the page picker);
//   Google Drive says it needs sign-in; people who can't save tokens are
//   told to ask an admin or owner;
// - the copy and the link name the same page (Integrations).
// Every API call is answered here; nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const LABEL: Record<string, string> = { notion: "Notion", confluence: "Confluence", sanity: "Sanity", google_drive: "Google Drive", github: "GitHub", web: "Website" };
const BASELINE = ["view", "view_team", "own_account"];

interface Opts {
  /** Milliseconds before /api/knowledge/connectors answers. */
  delay?: number;
  connected?: Record<string, boolean>;
  canSignIn?: Record<string, boolean>;
  me?: Record<string, unknown>;
  /** What the token check answers: ok (with how many pages it sees) or an error sentence. */
  token?: { shared: number } | { error: string };
}

async function mockApi(page: Page, o: Opts = {}) {
  const db = {
    calls: [] as string[],
    bodies: [] as Record<string, unknown>[],
    connected: { github: true, web: true, ...(o.connected ?? {}) } as Record<string, boolean>,
    canSignIn: { ...(o.canSignIn ?? {}) } as Record<string, boolean>,
  };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    db.calls.push(`${method} ${p}`);
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    if (body) db.bodies.push({ call: `${method} ${p}`, ...body });
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "ada@example.com", avatar_url: "", role: "admin", ...(o.me ?? {}) });
    if (p === "/api/usage") return json(route, { month: "2026-10", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/knowledge" && method === "GET")
      return json(route, { bases: [], can_manage: true, limits: { max_file_bytes: 1 << 24, max_files: 500, extensions: ["pdf", "md"], agents: [], read_roles: ["viewer", "member", "admin"] } });
    if (p === "/api/knowledge/connectors") {
      if (o.delay) await new Promise((r) => setTimeout(r, o.delay));
      return json(route, {
        connectors: Object.keys(LABEL).map((k) => ({
          kind: k,
          label: LABEL[k],
          blurb: `Pick what to bring in from ${LABEL[k]}`,
          connected: !!db.connected[k],
          via: db.connected[k] ? "saved_key" : "",
          can_sign_in: !!db.canSignIn[k],
          reconnect_reason: "",
          connected_by: "",
          hint: "",
          live_updates: true,
          picker: k === "web" ? "address" : "tree",
          member_sign_in: k === "sanity",
          signed_in: false,
          signed_in_as: "ada@example.com",
          has_saved_key: false,
          token_path: k === "notion" || k === "confluence",
        })),
        visibility_note: "Everyone who can read this knowledge base can read what you add.",
      });
    }
    const tok = p.match(/^\/api\/knowledge\/connectors\/([a-z_]+)\/token$/);
    if (tok && method === "POST") {
      const t = o.token ?? { shared: 3 };
      if ("error" in t) return json(route, { error: t.error }, 400);
      db.connected[tok[1]] = true;
      return json(route, { connected: true, shared: t.shared, warning: t.shared ? "" : "The token works, but no pages are shared with it yet: in Notion, open a page, choose ••• at the top right, then Connections, then + Add connection, and pick your connection." });
    }
    if (/^\/api\/knowledge\/connectors\/[a-z_]+\/browse$/.test(p))
      return json(route, {
        nodes: [
          { id: "page:eng", title: "Engineering", kind: "page", has_children: true, selectable: true, url: "", updated_at: "", detail: "" },
          { id: "page:hr", title: "People and HR", kind: "page", has_children: false, selectable: true, url: "", updated_at: "", detail: "" },
        ],
        options: {},
      });
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.waitForTimeout(200);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `${name} scrolls sideways at ${width}`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS_DIR, `knowledge-connect-${name}-${width}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

/** Records whether the list of apps ever appears from now on. */
async function watchForList(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __sawList: boolean };
    w.__sawList = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="choose-step"]')) w.__sawList = true;
    }).observe(document.body, { childList: true, subtree: true, attributes: true });
  });
}
const sawList = (page: Page) => page.evaluate(() => (window as unknown as { __sawList: boolean }).__sawList);

test.describe("no flash of the app list", () => {
  test("a starter tile opens straight at its app, with a placeholder while loading", async ({ page }) => {
    await mockApi(page, { delay: 1500, connected: { notion: true } });
    await page.goto("/knowledge/");
    await expect(page.getByTestId("start-notion")).toBeVisible();
    await watchForList(page);
    await page.getByTestId("start-notion").click();
    // The app's own step at once, saying what it waits for.
    await expect(page.getByTestId("connect-loading")).toBeVisible();
    await expect(page.getByTestId("connect-loading")).toContainText("Checking your Notion connection");
    await expect(page.getByTestId("choose-step")).toHaveCount(0);
    await shot(page, "loading");
    // Then on to the pages, never through the list.
    await expect(page.getByTestId("flow-step")).toHaveAttribute("data-step", "pick");
    await expect(page.getByText("Engineering")).toBeVisible();
    expect(await sawList(page)).toBe(false);
  });

  test("choosing a tile before the connections load never shows the list again", async ({ page }) => {
    await mockApi(page, { delay: 1500, connected: { notion: true } });
    await page.goto("/knowledge/");
    await page.getByTestId("start-knowledge").click();
    await expect(page.getByTestId("choose-step")).toBeVisible();
    await page.getByTestId("tile-notion").click();
    await watchForList(page);
    await expect(page.getByTestId("connect-loading")).toBeVisible();
    await expect(page.getByTestId("flow-step")).toHaveAttribute("data-step", "pick");
    expect(await sawList(page)).toBe(false);
  });

  test("an app that isn't connected lands on its connect step, through the placeholder only", async ({ page }) => {
    await mockApi(page, { delay: 1200 });
    await page.goto("/knowledge/");
    await watchForList(page);
    await page.getByTestId("start-notion").click();
    await expect(page.getByTestId("connect-loading")).toBeVisible();
    await expect(page.getByTestId("connect-step")).toBeVisible();
    expect(await sawList(page)).toBe(false);
  });
});

test.describe("connecting without the app's sign-in", () => {
  test("no Notion sign-in on this install: the token how-to and field are right there", async ({ page }) => {
    await mockApi(page);
    await page.goto("/knowledge/");
    await page.getByTestId("start-notion").click();
    const step = page.getByTestId("connect-step");
    await expect(step).toHaveAttribute("data-state", "token");
    await expect(step.getByTestId("connect-button")).toHaveCount(0);
    const steps = step.getByTestId("token-steps");
    await expect(steps.getByRole("listitem")).toHaveCount(4);
    await expect(steps.getByRole("link", { name: "Notion's integrations page" })).toHaveAttribute("href", "https://www.notion.so/profile/integrations");
    await expect(steps).toContainText("Read content");
    await expect(steps).toContainText("Connections");
    await expect(steps).toContainText("+ Add connection");
    // The page is named the way the link names it.
    const link = step.getByTestId("integrations-link");
    await expect(link).toHaveText("Open the Integrations page");
    await expect(link).toHaveAttribute("href", "/settings/integrations/#integration-notion");
    await expect(page.getByTestId("add-flow")).not.toContainText("Connected apps");
    await expect(page.getByTestId("token-save")).toBeDisabled();
    await shot(page, "notion-no-oauth");
  });

  test("a working token is saved and the flow goes on to the pages", async ({ page }) => {
    const db = await mockApi(page, { token: { shared: 3 } });
    await page.goto("/knowledge/");
    await page.getByTestId("start-notion").click();
    await page.getByTestId("token-input").fill("  ntn_good_token  ");
    await page.getByTestId("token-save").click();
    await expect(page.getByTestId("flow-step")).toHaveAttribute("data-step", "pick");
    await expect(page.getByText("Engineering")).toBeVisible();
    await expect(page.getByTestId("token-note")).toHaveCount(0);
    expect(db.bodies.find((b) => b.call === "POST /api/knowledge/connectors/notion/token")).toMatchObject({ token: "  ntn_good_token  " });
    await shot(page, "notion-token-saved");
  });

  test("a token that sees no pages yet goes on, saying how to share them", async ({ page }) => {
    await mockApi(page, { token: { shared: 0 } });
    await page.goto("/knowledge/");
    await page.getByTestId("start-notion").click();
    await page.getByTestId("token-input").fill("ntn_nothing_shared");
    await page.getByTestId("token-save").click();
    await expect(page.getByTestId("token-note")).toContainText("no pages are shared with it yet");
  });

  test("a refused token stays here with one sentence and its fix", async ({ page }) => {
    const sentence = "Notion didn't accept that token: copy the API token again from the Configuration tab of your Notion connection.";
    await mockApi(page, { token: { error: sentence } });
    await page.goto("/knowledge/");
    await page.getByTestId("start-notion").click();
    await page.getByTestId("token-input").fill("ntn_wrong");
    await page.getByTestId("token-save").click();
    await expect(page.getByTestId("token-form").getByText(sentence)).toBeVisible();
    await expect(page.getByTestId("flow-step")).toHaveAttribute("data-step", "connect");
    await page.getByTestId("token-save").scrollIntoViewIfNeeded();
    await shot(page, "notion-token-invalid");
  });

  test("with Notion sign-in set up, one click signs in and the token is the second choice", async ({ page }) => {
    await mockApi(page, { canSignIn: { notion: true } });
    await page.goto("/knowledge/");
    await page.getByTestId("start-notion").click();
    const step = page.getByTestId("connect-step");
    await expect(step).toHaveAttribute("data-state", "sign-in");
    await expect(step.getByTestId("connect-button")).toHaveText("Connect Notion");
    await expect(step.getByTestId("token-path")).toHaveCount(0);
    await shot(page, "notion-oauth");
    await step.getByTestId("use-token").click();
    await expect(step.getByTestId("token-path")).toBeVisible();
  });

  test("someone who can't save tokens is told to ask an admin or owner", async ({ page }) => {
    await mockApi(page, { me: { role: "custom:editors", capabilities: [...BASELINE, "knowledge_manage"] } });
    await page.goto("/knowledge/");
    await page.getByTestId("start-notion").click();
    const step = page.getByTestId("connect-step");
    await expect(step).toHaveAttribute("data-state", "ask-admin");
    await expect(step.getByTestId("ask-admin")).toContainText("Ask an admin to connect Notion");
    await expect(step.getByTestId("ask-admin")).toContainText("Admins and owners");
    await expect(step.getByTestId("token-form")).toHaveCount(0);
    await shot(page, "notion-ask-admin");
  });

  test("Confluence takes its address, email and API token", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/knowledge/");
    await page.getByTestId("start-confluence").click();
    const step = page.getByTestId("connect-step");
    await expect(step.getByTestId("token-steps")).toContainText("Create API token");
    await expect(step.getByTestId("integrations-link")).toHaveAttribute("href", "/settings/integrations/#integration-confluence");
    await page.getByTestId("token-save").scrollIntoViewIfNeeded();
    await shot(page, "confluence-no-oauth");
    await page.getByTestId("token-site").fill("https://acme.atlassian.net");
    await page.getByTestId("token-email").fill("ada@example.com");
    await page.getByTestId("token-input").fill("ATATT3xFfGF0");
    await page.getByTestId("token-save").click();
    await expect(page.getByTestId("flow-step")).toHaveAttribute("data-step", "pick");
    expect(db.bodies.find((b) => b.call === "POST /api/knowledge/connectors/confluence/token")).toMatchObject({
      site: "https://acme.atlassian.net",
      email: "ada@example.com",
      token: "ATATT3xFfGF0",
    });
  });

  test("Google Drive without its sign-in app says so and who can set it up", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/knowledge/");
    await page.getByTestId("start-google_drive").click();
    const step = page.getByTestId("connect-step");
    await expect(step).toHaveAttribute("data-state", "no-way");
    const box = step.getByTestId("no-token-path");
    await expect(box).toContainText("Google Drive sign-in isn't set up on this Coderhelm yet.");
    await expect(box).toContainText("Ask whoever runs Coderhelm to set up Google Drive sign-in.");
    // Not a platform admin: no steps, and never a sign-in button.
    await expect(box.getByTestId("sign-in-steps")).toHaveCount(0);
    await expect(step.getByTestId("connect-button")).toHaveCount(0);
    await expect(step.getByTestId("token-form")).toHaveCount(0);
    await expect(step.getByTestId("integrations-link")).toHaveCount(0);
    expect(db.calls.some((c) => c.endsWith("/connect"))).toBe(false);
    await shot(page, "drive-no-oauth");
  });

  test("a platform admin also gets the steps to set up Google Drive sign-in", async ({ page }) => {
    await mockApi(page, { me: { platform_admin: true } });
    await page.goto("/knowledge/");
    await page.getByTestId("start-google_drive").click();
    const box = page.getByTestId("connect-step").getByTestId("no-token-path");
    await expect(box).toHaveAttribute("data-admin", "yes");
    await expect(box).toContainText("Ask whoever runs Coderhelm to set up Google Drive sign-in.");
    const steps = box.getByTestId("sign-in-steps");
    await expect(steps.getByRole("link", { name: "Steps to set up Google Drive sign-in" })).toHaveAttribute(
      "href",
      "https://docs.coderhelm.com/self-host/knowledge-sources/#google-drive",
    );
    await expect(steps.getByRole("link", { name: "Open Sign-in apps" })).toHaveAttribute("href", "/admin/#sign-in-apps");
    await shot(page, "drive-no-oauth-admin");
  });
});
