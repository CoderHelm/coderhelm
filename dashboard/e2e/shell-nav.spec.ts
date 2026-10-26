import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The menu on a short window and on a phone: every link can be reached, the
// menu shows that it scrolls, and help and the person stay in view. The
// platform admin sees every item, so this is the longest menu there is.
// Every API call is answered here; nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

const LINKS = ["Runs", "Plans", "Code review", "Insights", "Settings", "Admin", "Support queue"];

async function mockApi(page: Page) {
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: "an-admin", email: "admin@coderhelm.com", avatar_url: "", role: "owner" });
    if (p === "/api/usage") return json(route, { month: "2026-01", tokens_in: 0, tokens_out: 0, total_runs: 0, total_tokens: 400_000, max_tokens: 1_000_000 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/support/badge") return json(route, { waiting: 1, queue_open: 2 });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/admin/beta-signups") return json(route, { signups: [], counts: { new: 0, invited: 0, joined: 0, total: 0 } });
    return json(route, { error: "Not mocked" }, 404);
  });
}

/** A menu link by its label; a count badge after the label is part of the name. */
const menuLink = (nav: Locator, name: string) => nav.getByRole("link", { name: new RegExp(`^${name}(\\s|$)`) });

/** The link is on screen, inside the menu's scroll area, and nothing covers its middle. */
async function expectReachable(page: Page, link: Locator, name: string) {
  await link.scrollIntoViewIfNeeded();
  await expect(link, `${name} is visible`).toBeVisible();
  const box = await link.boundingBox();
  expect(box, `${name} has a box`).not.toBeNull();
  const vp = page.viewportSize()!;
  expect(box!.y, `${name} is below the top of the window`).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, `${name} is above the bottom of the window`).toBeLessThanOrEqual(vp.height);
  const onTop = await link.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  });
  expect(onTop, `${name} is not covered by the pinned footer or a fade`).toBe(true);
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`) });
}

test("1280×800: the whole menu fits without scrolling, and help and the person stay in view", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApi(page);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Runs", exact: true })).toBeVisible();
  const area = nav.locator("[data-scroll-fade]");
  // A short menu: nothing hides below the fold.
  await expect(area).not.toHaveAttribute("data-more-end", "true");
  await shot(page, "shell-1280x800-top");
  await expectReachable(page, nav.getByTestId("nav-help"), "Help");
  await expect(nav.getByRole("button", { name: "Sign out" })).toBeInViewport();
  for (const name of LINKS) await expect(menuLink(nav, name), name).toBeInViewport();

  // A settings page marks Settings in the menu and itself in Settings' own list.
  await page.goto("/settings/budget");
  await expect(nav.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Token limit", exact: true })).toHaveAttribute("aria-current", "page");
});

test("390 wide: the menu drawer reaches every link and keeps help and the person in view", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();
  const nav = page.getByRole("dialog", { name: "Menu" }).getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Runs", exact: true })).toBeVisible();
  await shot(page, "shell-390-menu");

  await expectReachable(page, nav.getByTestId("nav-help"), "Help");
  await expect(nav.getByRole("button", { name: "Sign out" })).toBeInViewport();
  for (const name of LINKS) await expectReachable(page, menuLink(nav, name), name);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Following a link closes the drawer and opens the page.
  await nav.getByRole("link", { name: "Insights", exact: true }).click();
  await expect(page).toHaveURL(/\/analytics\/?$/);
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
});

test("390 wide: more than five tabs become a select; chips that don't fit wrap", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto("/tests");
  const views = page.getByRole("navigation", { name: "Tests views" });
  const select = views.getByRole("combobox", { name: "Tests views" });
  await expect(select).toBeVisible();
  await expect(views.getByRole("link")).toHaveCount(0);
  await select.selectOption({ label: "Trends" });
  await expect(page).toHaveURL(/view=trends/);
  await expect(select).toHaveValue("trends");
  await shot(page, "tabs-390-select");

  // Filter chips wider than a phone wrap onto a second line: every option
  // stays in view, and nothing pushes the page sideways.
  await page.goto("/");
  const chips = page.getByRole("group", { name: "Show runs" });
  await expect(chips).toBeVisible();
  for (const b of await chips.getByRole("button").all()) {
    const box = await b.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  }
  await expect(chips.getByRole("button", { name: /^Failed/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await shot(page, "chips-390");
  await page.goto("/tests?view=trends");

  // At 1280 the same views are a row of tabs again.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(views.getByRole("link", { name: "Trends" })).toHaveAttribute("aria-current", "page");
  await expect(select).toBeHidden();
});
