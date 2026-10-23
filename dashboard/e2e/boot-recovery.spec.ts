import { expect, test, type Page, type Route } from "@playwright/test";

// A tab whose /_next files are gone (an older page after a deploy) reloads
// once to pick up the new ones, never loops, and the loading screen it shows
// in the meantime is readable without the app's stylesheet. The logic lives
// in src/lib/boot-recovery.ts, inline in every page's <head>.
// Every API call is answered here; nothing reaches a real backend.

const PAGE = "/support/ticket/?id=t_1&new=1";
const RELOAD_KEY = "coderhelm:asset-reload-at";

async function mockApi(page: Page) {
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: "a-member", email: "member@example.com", avatar_url: "", role: "owner" });
    if (p === "/api/usage") return json(route, { month: "2026-01", tokens_in: 0, tokens_out: 0, total_runs: 0, total_tokens: 0, max_tokens: 1_000_000 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    return json(route, { error: "Not mocked" }, 404);
  });
}

/** Counts loads of the page itself, so a reload shows up as a second one. */
function countDocumentLoads(page: Page) {
  const loads = { n: 0 };
  page.on("request", (req) => {
    if (req.resourceType() === "document") loads.n += 1;
  });
  return loads;
}

/** Answers the page's main-app chunk the way the old CloudFront setup did: a 404 page in HTML. */
async function missingMainChunk(page: Page, times?: number) {
  await page.route(/\/_next\/static\/chunks\/main-app-[^/]+\.js$/, (route) =>
    route.fulfill({ status: 404, contentType: "text/html", body: "<!DOCTYPE html><title>Page Not Found</title>" }),
  { times });
}

test("a missing chunk reloads the tab once and the fresh page starts", async ({ page }) => {
  await mockApi(page);
  const loads = countDocumentLoads(page);
  await missingMainChunk(page, 1); // gone on the first load only, like a tab from before a deploy

  await page.goto(PAGE);
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  expect(loads.n).toBe(2);
  expect(await page.evaluate((k) => sessionStorage.getItem(k), RELOAD_KEY)).not.toBeNull();
  await expect(page.locator("html")).toHaveAttribute("data-ch-mounted", "");
});

test("a chunk that stays missing reloads once, then offers Reload instead of looping", async ({ page }) => {
  await mockApi(page);
  const loads = countDocumentLoads(page);
  await missingMainChunk(page);

  await page.goto(PAGE);
  await expect(page.locator("html")).toHaveClass(/ch-boot-failed/);
  const reload = page.getByRole("button", { name: "Reload" });
  await expect(reload).toBeVisible();
  await page.waitForTimeout(1500);
  expect(loads.n).toBe(2);

  // The button works with no React on the page.
  await reload.click();
  await expect.poll(() => loads.n).toBe(3);
});

test("the loading screen is styled without the stylesheet and offers Reload when the app never starts", async ({ page }) => {
  await mockApi(page);
  // The app's styles are absent and its scripts never answer: no error
  // fires, the app just never starts.
  await page.route(/\/_next\/static\/css\//, (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await page.route(/\/_next\/static\/chunks\//, () => {});

  await page.goto(PAGE, { waitUntil: "commit" });
  const screen = page.locator(".ch-boot");
  await expect(screen).toBeVisible();
  await expect(screen).toContainText("Loading...");
  await expect(screen).toHaveCSS("background-color", "rgb(9, 9, 11)");
  const font = await screen.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(font).not.toMatch(/^"?Times/);
  expect(font).toContain("system-ui");

  const reload = page.getByRole("button", { name: "Reload" });
  await expect(reload).toBeHidden();
  await expect(reload).toBeVisible({ timeout: 15_000 });
});

test("a page that starts normally never reloads and never shows Reload", async ({ page }) => {
  await mockApi(page);
  const loads = countDocumentLoads(page);
  await page.goto(PAGE);
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  expect(loads.n).toBe(1);
  expect(await page.evaluate((k) => sessionStorage.getItem(k), RELOAD_KEY)).toBeNull();
});
