import { expect, test, type Page } from "@playwright/test";
import { ROUTES } from "../src/lib/routes";
import { CAPABILITIES, mockDemoApi, REVIEW_SK, RUN_ID } from "./topbar-fixtures";

// The one top bar: on every page, with the right trail, a back arrow that
// uses in-app history and falls back to the parent page, the phone layout,
// and the roles matrix on Settings → Team. Every API call is mocked.

const PHONE = { width: 390, height: 844 };

async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await expect(page.getByTestId("topbar")).toBeVisible();
}

const crumbs = (page: Page) => page.getByTestId("breadcrumb").locator("li");

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test("every page has exactly one top bar and exactly one heading", async ({ page }) => {
  test.setTimeout(240_000);
  await mockDemoApi(page);
  const problems: string[] = [];
  for (const path of Object.keys(ROUTES)) {
    await page.goto(path);
    await settle(page);
    const bars = await page.getByTestId("topbar").count();
    const headings = await page.locator("h1:visible").count();
    if (bars !== 1 || headings !== 1) problems.push(`${path}: ${bars} top bars, ${headings} headings`);
  }
  expect(problems).toEqual([]);
});

test("the trail names where you are, ending on the current page", async ({ page }) => {
  await mockDemoApi(page);
  const cases: { url: string; trail: string[] }[] = [
    { url: "/settings/security", trail: ["your-team", "Settings", "Security"] },
    { url: "/settings/integrations/jira", trail: ["your-team", "Settings", "Integrations", "Jira"] },
    { url: "/", trail: ["your-team", "Runs"] },
    { url: `/runs/detail?id=${RUN_ID}`, trail: ["your-team", "Runs", "Show the class schedule on the details page"] },
    { url: `/reviewer/detail?sk=${encodeURIComponent(REVIEW_SK)}`, trail: ["your-team", "Reviewer", "web #130"] },
  ];
  for (const c of cases) {
    await page.goto(c.url);
    await settle(page);
    // The team crumb also carries its initial, for the eye only.
    await expect(crumbs(page)).toHaveText([/your-team$/, ...c.trail.slice(1)]);
    const current = page.getByTestId("breadcrumb-current").locator('[aria-current="page"]');
    await expect(current).toHaveText(c.trail[c.trail.length - 1]);
  }
  // A settings page is named once, by its visible title in the page; the
  // bar's last crumb marks where you are but is not a second heading.
  await page.goto("/settings/security");
  await settle(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Security");
  await expect(page.getByTestId("page-header").getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("breadcrumb-current").locator('[aria-current="page"]')).toHaveText("Security");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Settings" })).toHaveAttribute("href", /^\/settings\/?$/);
  // An item's page shows its title under the bar; the bar's crumb is not a second heading.
  await page.goto(`/runs/detail?id=${RUN_ID}`);
  await settle(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Show the class schedule on the details page");
  await expect(page).toHaveTitle("Show the class schedule on the details page · Coderhelm");
});

test("the page's actions sit beside its title", async ({ page }) => {
  await mockDemoApi(page);
  await page.goto(`/reviewer/detail?sk=${encodeURIComponent(REVIEW_SK)}`);
  await settle(page);
  const actions = page.getByTestId("page-header").getByTestId("page-actions");
  await expect(actions.getByRole("link", { name: /Open PR on GitHub/ })).toBeVisible();
  await expect(actions.getByRole("button", { name: /Review .* again/ })).toBeVisible();
  await expect(page.getByTestId("topbar").getByTestId("open-command-palette")).toBeVisible();
});

test("back goes to the page you came from, or one level up when you came from outside", async ({ page, context }) => {
  await page.setViewportSize(PHONE);
  await mockDemoApi(page);
  // Opened straight from a link: back goes up to Settings.
  await page.goto("/settings/security");
  await settle(page);
  const back = page.getByTestId("topbar-back");
  await expect(back).toHaveAccessibleName("Back to Settings");
  await back.click();
  await expect(page).toHaveURL(/\/settings\/?$/);

  // Came from the reviewer inside the app: back returns there, not to Settings.
  const second = await context.newPage();
  await second.setViewportSize(PHONE);
  await mockDemoApi(second);
  await second.goto("/reviewer");
  await settle(second);
  await second.goto("/settings/security");
  await settle(second);
  await expect(second.getByTestId("topbar-back")).toHaveAccessibleName("Back");
  await second.getByTestId("topbar-back").click();
  await expect(second).toHaveURL(/\/reviewer\/?$/);

  // A top-level page has no back arrow: the logo goes home.
  await expect(second.getByTestId("topbar-back")).toHaveCount(0);
  await expect(second.getByRole("link", { name: "Coderhelm home" })).toBeVisible();
});

test("on a phone the bar is a back arrow and the page's name; the actions stay in view under the title", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await mockDemoApi(page);
  await page.goto(`/reviewer/detail?sk=${encodeURIComponent(REVIEW_SK)}`);
  await settle(page);
  // Only the current crumb shows; the parents hide behind the back arrow.
  await expect(page.getByTestId("breadcrumb").getByRole("link", { name: "Reviewer" })).toBeHidden();
  await expect(page.getByTestId("breadcrumb-current")).toBeVisible();
  await expect(page.getByTestId("topbar-back")).toBeVisible();
  // The main actions are never hidden in a menu on a phone.
  const actions = page.getByTestId("page-actions");
  await expect(actions.getByRole("link", { name: /Open PR on GitHub/ })).toBeVisible();
  await expect(actions.getByRole("button", { name: /Review .* again/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Page actions" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Search" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();

  for (const url of ["/settings/security", `/runs/detail?id=${RUN_ID}`, "/", "/settings/team", "/reviewer"]) {
    await page.goto(url);
    await settle(page);
    await noSidewaysScroll(page);
  }
});

test("roles: a matrix of every capability, your role highlighted, groups fold", async ({ page }) => {
  const caps = [...CAPABILITIES, { key: "brand_new", label: "Something the server added since", min_role: "member" }];
  await mockDemoApi(page, { capabilities: caps });
  await page.goto("/settings/team");
  await settle(page);
  const matrix = page.getByTestId("roles-matrix");
  await expect(matrix).toBeVisible();
  await expect(matrix.locator("thead th")).toHaveText(["Capability", "Viewer", "Member", "Admin You", "Owner"]);
  await expect(page.getByTestId("role-col-admin")).toHaveAttribute("aria-current", "true");
  // Every capability the server lists is a row, once; an unknown one lands in Other.
  await expect(matrix.locator('tbody tr[data-testid^="perm-"]')).toHaveCount(caps.length);
  await expect(page.getByTestId("perm-group-other").getByText("Something the server added since")).toBeVisible();
  // Cells follow the minimum role.
  const row = page.getByTestId("perm-delete_plans");
  await expect(row.getByRole("cell")).toHaveText([/No$/, /No$/, /Yes$/, /Yes$/]);
  // A group folds.
  const group = matrix.getByRole("button", { name: /Runs & plans/ });
  await expect(group).toHaveAttribute("aria-expanded", "true");
  await group.click();
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("perm-delete_plans")).toHaveCount(0);
});

test("roles on a phone: pick a role, see its list", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await mockDemoApi(page, { role: "member" });
  await page.goto("/settings/team");
  await settle(page);
  await expect(page.getByTestId("roles-matrix")).toBeHidden();
  const picker = page.getByRole("group", { name: "Show what this role can do" });
  await expect(picker.getByRole("button", { name: "Member" })).toHaveAttribute("aria-pressed", "true");
  const list = page.getByTestId("roles-phone-list");
  await expect(list).toContainText("Member (your role)");
  await picker.getByRole("button", { name: "Owner" }).click();
  await expect(list).toContainText("Owner");
  await expect(list.getByRole("listitem").filter({ hasText: "Reset account data" })).toContainText("Yes");
  await picker.getByRole("button", { name: "Viewer" }).click();
  await expect(list.getByRole("listitem").filter({ hasText: "Delete plans" })).toContainText("No");
  await noSidewaysScroll(page);
});
