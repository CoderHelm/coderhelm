import { expect, test, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { BASELINE, CAPABILITY_TABLE, mockRolesApi, storedRole, template } from "./role-editor-data";

// The custom role editor against the gateway's whole capability table: start
// from a built-in role, change a few groups, see what changed, save. Every
// API call is answered by the mock; nothing reaches a real backend.

/** What a built-in role adds to what everyone can do: what the editor ticks. */
const extra = (role: string) => template(role).filter((k) => !BASELINE.includes(k));

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

const openNew = async (page: Page) => {
  await page.goto("/settings/team");
  await page.getByTestId("custom-roles").getByRole("button", { name: "New role" }).click();
  const editor = page.getByTestId("role-editor");
  await expect(editor).toBeVisible();
  return editor;
};
const group = (editor: Locator, id: string) => editor.getByTestId(`role-group-${id}`);
const expand = (editor: Locator, label: string) => editor.getByRole("button", { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).click();
const box = (editor: Locator, name: string) => editor.getByRole("checkbox", { name, exact: true });
const ability = (editor: Locator, name: string) =>
  editor.getByTestId("role-ability").filter({ has: editor.page().getByRole("checkbox", { name, exact: true }) });

async function shots(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
    const editor = page.getByTestId("role-editor");
    const inside = await editor.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(inside, `${name}: the editor scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
    await expect(editor.getByRole("button", { name: /^(Create|Save) role$/ })).toBeInViewport();
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

test("a new role starts from Member, groups say how many are on, and the summary shows what changed", async ({ page }) => {
  const db = await mockRolesApi(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const editor = await openNew(page);
  const member = extra("member");

  // Member is picked; its abilities are on; groups start collapsed.
  await expect(editor.getByRole("radio", { name: /Member/ })).toBeChecked();
  await expect(editor.getByTestId("role-ability")).toHaveCount(0);
  await expect(editor.getByTestId("role-footer-summary")).toHaveText(`${member.length} abilities · same as Member`);
  await expect(group(editor, "runs").getByTestId("role-group-count")).toHaveText("3 of 4");
  await expect(editor.getByTestId("role-diff")).toContainText("Same as Member.");

  // What everyone can do is said once, not offered as a locked checkbox.
  await expect(editor.getByTestId("role-everyone")).toContainText("see the team");
  await expect(box(editor, "See the team")).toHaveCount(0);
  // What stays with built-in roles is named once, by its short label (the
  // gateway describes `system` in two rows; it is named once).
  const leftOut = editor.getByTestId("role-left-out");
  await expect(leftOut).toContainText("manage custom roles");
  await expect(leftOut).toContainText("manage admins and owners");
  expect((await leftOut.textContent())!.match(/system health and updates/g)).toHaveLength(1);

  // One ability: short name, its sentence under it, marked Added.
  await expand(editor, "Repos & integrations");
  const repos = box(editor, "Manage repositories");
  await expect(repos).not.toBeChecked();
  await expect(repos).toHaveAccessibleDescription(/^Sync, turn on, roles, code graph/);
  await repos.check();
  await expect(ability(editor, "Manage repositories")).toContainText("Added");
  await expect(group(editor, "connections").getByTestId("role-group-count")).toHaveText("4 of 7");

  // A whole group at once; partly on reads as mixed.
  const allReviews = editor.getByRole("checkbox", { name: "Allow all in Reviews, releases & tests" });
  expect(await allReviews.evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true);
  await allReviews.check();
  await expect(group(editor, "reviews").getByTestId("role-group-count")).toHaveText("2 of 2");
  expect(await allReviews.evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(false);

  // Take one away.
  await expand(editor, "Runs & plans");
  await box(editor, "Retry and cancel runs").uncheck();
  await expect(ability(editor, "Retry and cancel runs")).toContainText("Removed");

  const diff = editor.getByTestId("role-diff");
  await expect(diff).toContainText("Compared with Member");
  await expect(diff).toContainText("AddedManage repositories");
  await expect(diff).toContainText("AddedManage tests");
  await expect(diff).toContainText("RemovedRetry and cancel runs");
  await expect(editor.getByTestId("role-summary")).toContainText("Manage repositories");
  await expect(editor.getByTestId("role-footer-summary")).toHaveText(`${member.length + 1} abilities · 2 added, 1 removed`);

  await editor.getByRole("textbox", { name: "Name" }).fill("Release manager");
  await editor.getByRole("button", { name: "Add a description" }).click();
  await editor.getByRole("textbox", { name: "Description" }).fill("Ships releases and looks after tests.");
  await shots(page, "role-editor-new");
  await editor.getByRole("button", { name: "Create role" }).click();

  await expect(page.getByText("Release manager created")).toBeVisible();
  const post = db.calls.find((c) => c.method === "POST" && c.path === "/api/roles");
  expect(post?.body?.template).toBe("member");
  expect(post?.body?.description).toBe("Ships releases and looks after tests.");
  const sent = post?.body?.capabilities as string[];
  expect(sent).toEqual(expect.arrayContaining(["plans", "repos", "tests", "reviews"]));
  expect(sent).not.toContain("runs");
  // Nothing everyone already has, nothing a custom role can't hold.
  expect(sent).not.toContain("view_team");
  expect(sent).not.toContain("roles");
  expect(sent).toHaveLength(member.length + 1);
});

test("switching the starting role ticks its abilities, and Allow all turns a group off again", async ({ page }) => {
  await mockRolesApi(page);
  const editor = await openNew(page);
  await editor.getByRole("radio", { name: /Admin/ }).check();
  const admin = extra("admin");
  await expect(editor.getByTestId("role-footer-summary")).toHaveText(`${admin.length} abilities · same as Admin`);
  await expect(group(editor, "plugins").getByTestId("role-group-count")).toHaveText("4 of 4");

  const allPlugins = editor.getByRole("checkbox", { name: "Allow all in Plugins" });
  await allPlugins.uncheck();
  await expect(group(editor, "plugins").getByTestId("role-group-count")).toHaveText("0 of 4");
  await expect(editor.getByTestId("role-diff")).toContainText("RemovedInstall and configure plugins");

  await editor.getByRole("radio", { name: /Viewer/ }).check();
  await expect(editor.getByTestId("role-footer-summary")).toHaveText("0 abilities · same as Viewer");
  await expect(editor.getByTestId("role-summary")).toContainText("Only what everyone on the team can do.");
  // Expand all, then collapse.
  await editor.getByRole("button", { name: "Expand all" }).click();
  await expect(editor.getByTestId("role-ability")).toHaveCount(admin.length);
  await editor.getByRole("button", { name: "Collapse all" }).click();
  await expect(editor.getByTestId("role-ability")).toHaveCount(0);
});

test("search finds an ability by its name or its sentence and opens its group", async ({ page }) => {
  await mockRolesApi(page);
  const editor = await openNew(page);
  const find = editor.getByRole("searchbox", { name: "Find an ability" });
  await find.fill("webhook");
  await expect(editor.getByTestId("role-ability")).toHaveCount(2);
  await expect(box(editor, "Manage webhooks")).toBeVisible();
  // Matched by its sentence ("…(webhooks, relay forwards…)").
  await expect(box(editor, "Resend event deliveries")).toBeVisible();
  await expect(group(editor, "runs")).toHaveCount(0);
  await box(editor, "Manage webhooks").check();
  // The group's count is over the whole group, not the search.
  await expect(group(editor, "api").getByTestId("role-group-count")).toHaveText("1 of 3");

  await find.fill("nothing like this");
  await expect(editor).toContainText("No ability matches “nothing like this”.");
  await find.fill("");
  await expect(editor.getByTestId("role-ability")).toHaveCount(0);
  await expect(editor.getByTestId("role-footer-summary")).toContainText("1 added");
});

test("editing a role compares with what was saved and sends the new list", async ({ page }) => {
  const db = await mockRolesApi(page, { roles: [storedRole({ id: "r1", name: "Release manager", description: "Ships releases.", member_count: 2 })] });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/settings/team");
  await page.getByRole("button", { name: "Edit Release manager" }).click();
  const editor = page.getByTestId("role-editor");
  await expect(editor).toContainText("2 people have this role. Changes reach them within a minute.");
  // A saved role isn't started again from a built-in one.
  await expect(editor.getByRole("radio")).toHaveCount(0);
  await expect(editor.getByRole("textbox", { name: "Description" })).toHaveValue("Ships releases.");
  await expect(editor.getByTestId("role-footer-summary")).toHaveText("2 abilities · no changes");
  await expect(editor.getByTestId("role-diff")).toContainText("Nothing changed yet.");

  await expand(editor, "Repos & integrations");
  await editor.getByRole("checkbox", { name: "Allow all in Repos & integrations" }).check();
  await expand(editor, "Runs & plans");
  await box(editor, "Retry and cancel runs").uncheck();
  await expect(editor.getByTestId("role-diff")).toContainText("Changes since it was saved");
  await expect(editor.getByTestId("role-footer-summary")).toHaveText("8 abilities · 7 added, 1 removed");
  await shots(page, "role-editor-edit");
  await editor.getByRole("button", { name: "Save role" }).click();

  await expect(page.getByText("Release manager saved")).toBeVisible();
  const put = db.calls.find((c) => c.method === "PUT" && c.path === "/api/roles/r1");
  const sent = put?.body?.capabilities as string[];
  expect(sent).toEqual(expect.arrayContaining(["plans", "repos", "integrations", "alerts", "mcp_connect"]));
  expect(sent).not.toContain("runs");
  expect(put?.body?.template).toBeUndefined();
});

test("a gateway without short labels still shows every ability, by its full sentence", async ({ page }) => {
  const table = CAPABILITY_TABLE.map(({ short_label: _, ...c }) => c);
  const db = await mockRolesApi(page, { table });
  const editor = await openNew(page);
  await expand(editor, "Repos & integrations");
  const repos = editor.getByRole("checkbox", { name: /^Manage repositories: sync, turn on/ });
  await expect(repos).toBeVisible();
  await repos.check();
  await editor.getByRole("textbox", { name: "Name" }).fill("Repo keeper");
  await editor.getByRole("button", { name: "Create role" }).click();
  await expect(page.getByText("Repo keeper created")).toBeVisible();
  expect(db.calls.find((c) => c.method === "POST")?.body?.capabilities).toContain("repos");
});

test("on a phone the editor fills the screen and Create role stays on it", async ({ page }) => {
  await mockRolesApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const editor = await openNew(page);
  const body = editor.locator("[data-modal-body]");
  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(editor.getByTestId("role-summary")).toBeInViewport();
  await expect(editor.getByRole("button", { name: "Create role" })).toBeInViewport();
  const width = await editor.evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBe(390);
  const overflow = await body.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
