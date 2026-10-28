import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

// The dashboard's own select box (components/select.tsx), driven by keyboard
// and by pointer on the runs list's "Started by" filter: it opens a listbox
// drawn by the page (never the system's menu), moves with the arrow keys,
// Home, End and type-ahead, picks with Enter, Space or a click, closes with
// Escape without changing anything, and returns focus to its button. On a
// phone it is a bottom sheet. Every API call is answered here.

async function mockApi(page: Page): Promise<string[]> {
  const calls: string[] = [];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    calls.push(`${req.method()} ${p}${url.search}`);
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: "sam", email: "sam@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/support/badge") return json(route, { waiting: 0, queue_open: null });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "your-team/web", enabled: true }] });
    if (p === "/api/plugins/catalog") return json(route, { plugins: [] });
    if (p === "/api/skills/asks") return json(route, { asks: [] });
    if (p === "/api/skills/used") return json(route, { skills: [], agents: [], sources: [], standards: [] });
    if (p === "/api/runs") return json(route, { runs: [], next: null, scanned: 0 });
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  return calls;
}

const filterOf = (page: Page) => page.getByRole("combobox", { name: "Started by" });
const listOf = (page: Page) => page.getByRole("listbox", { name: "Started by" });
/** The option the keyboard is on: the listbox's aria-activedescendant. */
async function activeLabel(list: Locator): Promise<string> {
  const id = await list.getAttribute("aria-activedescendant");
  expect(id).toBeTruthy();
  return (await list.page().locator(`[id="${id}"] [data-option-label]`).textContent()) ?? "";
}

test("by keyboard: arrows, Home, End, type-ahead, Enter, Space and Escape", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  const filter = filterOf(page);
  await expect(filter).toHaveAttribute("aria-haspopup", "listbox");
  await expect(filter).toHaveAttribute("aria-expanded", "false");
  await expect(filter).toHaveText("Started by anyone");

  // ArrowDown opens on the current choice; the list has the focus.
  await filter.focus();
  await page.keyboard.press("ArrowDown");
  const list = listOf(page);
  await expect(list).toBeVisible();
  await expect(list).toBeFocused();
  await expect(filter).toHaveAttribute("aria-expanded", "true");
  await expect(filter).toHaveAttribute("aria-controls", (await list.getAttribute("id"))!);
  await expect(list.getByRole("option")).toHaveCount(8);
  await expect(list.getByRole("option", { name: "Started by anyone" })).toHaveAttribute("aria-selected", "true");
  expect(await activeLabel(list)).toBe("Started by anyone");
  // The source icons are in the list.
  await expect(list.getByRole("option", { name: "Started by Jira" }).locator("svg").first()).toBeVisible();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  expect(await activeLabel(list)).toBe("Started by GitHub");
  await page.keyboard.press("End");
  expect(await activeLabel(list)).toBe("Started by Chat");
  await page.keyboard.press("ArrowDown"); // stays on the last
  expect(await activeLabel(list)).toBe("Started by Chat");
  await page.keyboard.press("Home");
  expect(await activeLabel(list)).toBe("Started by anyone");

  // Escape closes without changing the value; focus is back on the button.
  await page.keyboard.press("End");
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await expect(filter).toBeFocused();
  await expect(filter).toHaveAttribute("data-value", "");
  await expect(page).not.toHaveURL(/started_by/);

  // Enter opens; type-ahead finds "Started by Plans" by its words; Enter picks.
  await page.keyboard.press("Enter");
  await expect(list).toBeVisible();
  await page.keyboard.type("Started by P", { delay: 20 });
  expect(await activeLabel(list)).toBe("Started by Plans");
  await page.keyboard.press("Enter");
  await expect(list).toBeHidden();
  await expect(filter).toBeFocused();
  await expect(filter).toHaveText("Started by Plans");
  await expect(page).toHaveURL(/[?&]started_by=plan/);

  // Space opens and picks too; ArrowUp moves up from the current choice.
  await page.keyboard.press(" ");
  await expect(list).toBeVisible();
  expect(await activeLabel(list)).toBe("Started by Plans");
  await page.keyboard.press("ArrowUp");
  expect(await activeLabel(list)).toBe("Started by Alerts");
  await page.waitForTimeout(700); // let the type-ahead word end, so Space picks
  await page.keyboard.press(" ");
  await expect(list).toBeHidden();
  await expect(page).toHaveURL(/[?&]started_by=alert/);
  await expect(filter).toHaveText("Started by Alerts");

  // Tab closes without picking.
  await page.keyboard.press("ArrowDown");
  await expect(list).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(list).toBeHidden();
  await expect(filter).toHaveAttribute("data-value", "alert");
});

test("by pointer: click opens, hover highlights, click picks, outside click closes", async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto("/");
  const filter = filterOf(page);
  await filter.click();
  const list = listOf(page);
  await expect(list).toBeVisible();
  // Drawn by the page, below the button and inside the window.
  const box = (await list.boundingBox())!;
  const btn = (await filter.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(btn.y + btn.height);
  expect(box.x + box.width).toBeLessThanOrEqual(1280);

  const github = list.getByRole("option", { name: "Started by GitHub" });
  await github.hover();
  expect(await activeLabel(list)).toBe("Started by GitHub");
  await github.click();
  await expect(list).toBeHidden();
  await expect(filter).toHaveText("Started by GitHub");
  await expect(page).toHaveURL(/[?&]started_by=github/);
  await expect.poll(() => calls.some((c) => c.startsWith("GET /api/runs?") && c.includes("started_by=github"))).toBe(true);

  // The chosen one is checked when it opens again; a click outside closes it unchanged.
  await filter.click();
  await expect(list.getByRole("option", { name: "Started by GitHub" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("heading", { name: "Runs" }).click();
  await expect(list).toBeHidden();
  await expect(filter).toHaveAttribute("data-value", "github");

  // Clicking the button again while open closes it.
  await filter.click();
  await expect(list).toBeVisible();
  await filter.click();
  await expect(list).toBeHidden();
});

test("on a phone it opens as a bottom sheet", async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const filter = filterOf(page);
  await filter.click();
  const sheet = page.getByTestId("select-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "Started by" })).toBeVisible();
  const box = (await sheet.boundingBox())!;
  expect(Math.round(box.x)).toBe(0);
  expect(Math.round(box.width)).toBe(390);
  expect(Math.round(box.y + box.height)).toBe(844);
  await sheet.getByRole("option", { name: "Started by Chat" }).click();
  await expect(sheet).toBeHidden();
  await expect(filter).toHaveText("Started by Chat");
  await expect(page).toHaveURL(/[?&]started_by=chat/);
  await expect(filter).toBeFocused();
});
