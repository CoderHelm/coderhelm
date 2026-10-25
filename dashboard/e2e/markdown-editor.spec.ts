import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The shared markdown editor: toolbar, shortcuts, lists, paste-a-link,
// Write/Preview, drafts, and where it is used (the support form, the
// instructions page, the review note). Every API call is answered here.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const NOW = new Date().toISOString();

interface Backend {
  posts: { path: string; body: Record<string, unknown> }[];
  puts: { path: string; body: Record<string, unknown> }[];
}

async function mockApi(page: Page): Promise<Backend> {
  const db: Backend = { posts: [], puts: [] };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    const body = method === "POST" || method === "PUT" ? ((req.postDataJSON() as Record<string, unknown>) ?? {}) : {};
    if (method === "POST") db.posts.push({ path: p, body });
    if (method === "PUT") db.puts.push({ path: p, body });

    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "TEAM#t_1", github_login: "a-person", email: "person@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "TEAM#t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "your-team/web", enabled: true, ticket_source: "github", onboard_status: "done" }] });
    if (p === "/api/support/badge") return json(route, { waiting: 0, queue_open: null });
    if (p === "/api/support/tickets" && method === "POST") {
      const ticket = {
        id: "01TICKETNEW", team_id: "TEAM#t_1", team_name: "your-team", subject: String(body.subject), status: "open", priority: String(body.priority),
        opened_by_id: "USER#u_1", opened_by_email: "person@example.com", opened_by_name: "a-person", role: "admin",
        context: { page: String(body.page ?? ""), item: null, user_agent: "" }, created_at: NOW, updated_at: NOW, last_actor: "customer", message_count: 1,
      };
      return json(route, { ticket, messages: [{ id: "m1", kind: "message", author: "customer", author_email: "person@example.com", author_name: "a-person", body: String(body.body), created_at: NOW }] });
    }
    if (p === "/api/support/tickets/01TICKETNEW") {
      return json(route, {
        ticket: {
          id: "01TICKETNEW", team_id: "TEAM#t_1", team_name: "your-team", subject: "Release notes are empty", status: "open", priority: "high",
          opened_by_id: "USER#u_1", opened_by_email: "person@example.com", opened_by_name: "a-person", role: "admin",
          context: { page: "", item: null, user_agent: "" }, created_at: NOW, updated_at: NOW, last_actor: "customer", message_count: 1,
        },
        messages: [{ id: "m1", kind: "message", author: "customer", author_email: "person@example.com", author_name: "a-person", body: "### What happened\nThe notes were **empty**.\n- one\n- two", created_at: NOW }],
      });
    }
    if (p === "/api/support/tickets") return json(route, { tickets: [] });
    if (p === "/api/instructions/global" && method === "GET") return json(route, { content: "" });
    if (p === "/api/instructions/global") return json(route, { ok: true });
    if (p.startsWith("/api/agents") || p.startsWith("/api/instructions")) return json(route, { content: "" });
    if (p === "/api/settings/support-access") return json(route, { grants: [] });
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true });
}

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|404/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

const NEW_TICKET = "/support?new=1&type=issue&from=%2Freleases";

/** Puts text in the box and selects `select` within it (the first match). */
async function typeAndSelect(page: Page, text: string, select: string) {
  const box = page.getByLabel("What happened?");
  await box.fill(text);
  await box.evaluate(
    (el, [t, sel]) => {
      const ta = el as HTMLTextAreaElement;
      const at = t.indexOf(sel);
      ta.focus();
      ta.setSelectionRange(at, at + sel.length);
    },
    [text, select] as const,
  );
  return box;
}

test.describe("the markdown editor", () => {
  test.beforeEach(async ({ page }) => {
    // Start with no drafts.
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("md-test-started")) {
        sessionStorage.setItem("md-test-started", "1");
        localStorage.clear();
      }
    });
  });

  test("shortcuts wrap the selection and toggle back off", async ({ page }) => {
    const errors = watchConsole(page);
    await mockApi(page);
    await page.goto(NEW_TICKET);
    const box = await typeAndSelect(page, "the notes were empty", "empty");
    await box.press("ControlOrMeta+b");
    await expect(box).toHaveValue("the notes were **empty**");
    // The words stay selected, so the same key takes it off again.
    await box.press("ControlOrMeta+b");
    await expect(box).toHaveValue("the notes were empty");
    await box.press("ControlOrMeta+i");
    await expect(box).toHaveValue("the notes were _empty_");
    await box.press("ControlOrMeta+z");
    await expect(box).toHaveValue("the notes were empty");

    await typeAndSelect(page, "run npm test again", "npm test");
    await box.press("ControlOrMeta+e");
    await expect(box).toHaveValue("run `npm test` again");

    // ⌘K: the words become a link with "url" selected to type over.
    await typeAndSelect(page, "see the run page", "the run page");
    await box.press("ControlOrMeta+k");
    await page.keyboard.type("https://example.com/runs/1");
    await expect(box).toHaveValue("see [the run page](https://example.com/runs/1)");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("pasting a URL over selected words makes a link", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await mockApi(page);
    await page.goto(NEW_TICKET);
    const box = await typeAndSelect(page, "the failed run is here", "failed run");
    await box.evaluate((el) => {
      const data = new DataTransfer();
      data.setData("text/plain", "https://example.com/runs/42");
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect(box).toHaveValue("the [failed run](https://example.com/runs/42) is here");
  });

  test("toolbar buttons format lines, and lists continue on Enter and indent on Tab", async ({ page }) => {
    await mockApi(page);
    await page.goto(NEW_TICKET);
    const toolbar = page.getByRole("toolbar", { name: "Formatting" });
    for (const name of ["Heading", "Bold", "Italic", "Code", "Code block", "Link", "Quote", "Bulleted list", "Numbered list", "Task list"]) {
      await expect(toolbar.getByRole("button", { name, exact: true })).toBeVisible();
    }
    await expect(toolbar.getByRole("button", { name: "Bold" })).toHaveAttribute("title", /Bold \((⌘|Ctrl\+)B\)/);

    const box = page.getByLabel("What happened?");
    await box.click();
    await toolbar.getByRole("button", { name: "Numbered list" }).click();
    await page.keyboard.type("Open the run");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Click retry");
    await expect(box).toHaveValue("1. Open the run\n2. Click retry");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await page.keyboard.type("It spins");
    await expect(box).toHaveValue("1. Open the run\n2. Click retry\n  3. It spins");
    await page.keyboard.press("Shift+Tab");
    await expect(box).toHaveValue("1. Open the run\n2. Click retry\n3. It spins");
    // Enter on an empty item ends the list.
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(box).toHaveValue("1. Open the run\n2. Click retry\n3. It spins\n");

    await toolbar.getByRole("button", { name: "Task list" }).click();
    await page.keyboard.type("check the logs");
    await page.keyboard.press("Enter");
    await expect(box).toHaveValue("1. Open the run\n2. Click retry\n3. It spins\n- [ ] check the logs\n- [ ] ");

    // Tab outside a list moves focus on, as everywhere else.
    await box.fill("plain words");
    await box.press("End");
    await page.keyboard.press("Tab");
    await expect(box).not.toBeFocused();
  });

  test("Preview renders the markdown, with no raw HTML", async ({ page }) => {
    await mockApi(page);
    await page.goto(NEW_TICKET);
    const box = page.getByLabel("What happened?");
    await box.fill("### Steps\n**bold** words\n- [x] tried again\n<script>window.hacked = 1</script><b>raw</b>\n[bad](javascript:alert(1))");
    const preview = page.getByRole("tab", { name: "Preview" });
    await preview.click();
    await expect(preview).toHaveAttribute("aria-selected", "true");
    const panel = page.getByTestId("md-preview");
    await expect(panel.getByRole("heading", { name: "Steps" })).toBeVisible();
    await expect(panel.locator("strong")).toHaveText("bold");
    await expect(panel.getByRole("checkbox", { name: "Done" })).toBeChecked();
    await expect(panel.locator("script, b")).toHaveCount(0);
    await expect(panel.getByRole("link", { name: "bad" })).not.toHaveAttribute("href", /javascript:/);
    expect(await page.evaluate(() => (window as unknown as { hacked?: number }).hacked)).toBeUndefined();
    // The toolbar rests while previewing.
    await expect(page.getByRole("toolbar", { name: "Formatting" }).getByRole("button", { name: "Bold" })).toBeDisabled();
    // Arrow keys move between the tabs.
    await preview.press("ArrowLeft");
    await expect(page.getByRole("tab", { name: "Write" })).toBeFocused();
    await expect(box).toBeVisible();
  });

  test("the box grows with the text up to a limit, and shows a count near the limit", async ({ page }) => {
    await mockApi(page);
    await page.goto(NEW_TICKET);
    const box = page.getByLabel("What happened?");
    const small = (await box.boundingBox())!.height;
    await box.fill(Array.from({ length: 14 }, (_, i) => `line ${i + 1}`).join("\n"));
    const grown = (await box.boundingBox())!.height;
    expect(grown).toBeGreaterThan(small + 50);
    await box.fill(Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join("\n"));
    expect((await box.boundingBox())!.height).toBeLessThanOrEqual(482);
    await expect(page.getByTestId("md-count")).toHaveCount(0);
    await box.fill("x".repeat(6500));
    await expect(page.getByTestId("md-count")).toHaveText("6,500 / 8,000");
  });

  test("a draft is saved, restored after a reload, and cleared when the ticket is sent; the body is sent as written", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto(NEW_TICKET);
    await page.getByLabel("Subject").fill("Release notes are empty");
    const box = page.getByLabel("What happened?");
    await page.getByTestId("md-template").click();
    await expect(box).toHaveValue("### What happened\n\n\n### What you expected\n\n\n### Steps to see it\n1. ");
    await page.keyboard.type("Open a release");
    await expect(page.getByTestId("md-draft-status")).toHaveText("Draft saved");

    await page.reload();
    await expect(page.getByLabel("What happened?")).toHaveValue("### What happened\n\n\n### What you expected\n\n\n### Steps to see it\n1. Open a release");
    await expect(page.getByTestId("md-draft-status")).toHaveText("Draft restored");

    await page.getByLabel("Subject").fill("Release notes are empty");
    await page.getByRole("group", { name: "How urgent is it?" }).getByRole("button", { name: "High" }).click();
    await expect(page.getByTestId("ticket-urgency-means")).toHaveText("It blocks some of our work.");
    await page.getByRole("button", { name: "Send to support" }).click();
    await expect(page).toHaveURL(/\/support\/ticket\/?\?id=01TICKETNEW/);

    const sent = db.posts.find((p) => p.path === "/api/support/tickets");
    expect(sent?.body).toEqual({
      subject: "Release notes are empty",
      body: "### What happened\n\n\n### What you expected\n\n\n### Steps to see it\n1. Open a release",
      priority: "high",
      page: "/releases",
    });
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("coderhelm:draft:")))).toEqual([]);
    // The thread shows the message as markdown.
    const msg = page.getByTestId("support-message-body").first();
    await expect(msg.getByRole("heading", { name: "What happened" })).toBeVisible();
    await expect(msg.locator("strong")).toHaveText("empty");

    await page.goto(NEW_TICKET);
    await expect(page.getByLabel("What happened?")).toHaveValue("");
  });

  test("Tips open from the footer and hold the help that used to float under the box", async ({ page }) => {
    await mockApi(page);
    await page.goto(NEW_TICKET);
    await expect(page.getByText("Markdown supported")).toBeVisible();
    await expect(page.getByTestId("md-tips")).toHaveCount(0);
    const toggle = page.getByTestId("md-tips-toggle");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("md-tips")).toContainText("Leave out passwords, keys and code");
  });

  test("the support form at desktop and phone width", async ({ page }) => {
    await mockApi(page);
    await page.goto(NEW_TICKET);
    const subject = page.getByLabel("Subject");
    await subject.fill("Release notes are empty");
    await page.getByLabel("What happened?").fill("### What happened\nThe notes for **v1.2.0** were empty.\n\n### Steps to see it\n1. Open the release\n2. Look at the notes");
    // Subject and body line up.
    const a = (await subject.boundingBox())!;
    const frame = (await page.getByRole("tablist", { name: "Write or preview" }).locator("xpath=../..").boundingBox())!;
    expect(Math.abs(a.x - frame.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(a.width - frame.width)).toBeLessThanOrEqual(2);
    await page.getByTestId("md-tips-toggle").click();
    await shot(page, "md-editor-support-1280");
    await page.getByRole("tab", { name: "Preview" }).click();
    await shot(page, "md-editor-support-preview-1280");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("tab", { name: "Write" }).click();
    await noSideScroll(page);
    // The toolbar wraps inside the box.
    const tb = (await page.getByRole("toolbar", { name: "Formatting" }).boundingBox())!;
    expect(tb.x + tb.width).toBeLessThanOrEqual(390);
    for (const b of await page.getByRole("toolbar", { name: "Formatting" }).getByRole("button").all()) {
      const r = (await b.boundingBox())!;
      expect(r.x + r.width).toBeLessThanOrEqual(390);
    }
    await shot(page, "md-editor-support-390");
    await page.getByRole("tab", { name: "Preview" }).click();
    await noSideScroll(page);
    await shot(page, "md-editor-support-preview-390");
  });

  test("instructions use the editor with a preview of how agents read it, and save the text as written", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/settings/instructions");
    const box = page.getByLabel("Custom instructions (optional)");
    await box.click();
    await page.getByRole("toolbar", { name: "Formatting" }).getByRole("button", { name: "Heading" }).click();
    await page.keyboard.type("Tests");
    await page.keyboard.press("Enter");
    await page.getByRole("toolbar", { name: "Formatting" }).getByRole("button", { name: "Bulleted list" }).click();
    await page.keyboard.type("Run `npm test` before a PR");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Keep tests next to the code");
    await expect(box).toHaveValue("### Tests\n- Run `npm test` before a PR\n- Keep tests next to the code");
    // No monospace while writing.
    expect(await box.evaluate((el) => getComputedStyle(el).fontFamily)).not.toMatch(/mono/i);
    await shot(page, "md-editor-instructions-1280");
    await page.getByRole("tab", { name: "Preview" }).click();
    await expect(page.getByTestId("md-preview")).toContainText("Coderhelm reads this exactly as written");
    await expect(page.getByTestId("md-preview").getByRole("listitem")).toHaveCount(2);
    await page.getByRole("button", { name: "Save" }).click();
    await expect.poll(() => db.puts.find((p) => p.path === "/api/instructions/global")?.body).toEqual({
      content: "### Tests\n- Run `npm test` before a PR\n- Keep tests next to the code",
    });
  });
});
