import { expect, test, type Page, type Route } from "@playwright/test";

// Signing in and out on a phone. Runs in Chromium and, as the iphone-webkit
// project, in WebKit with an iPhone's screen and user agent. Every API call is
// answered here; nothing reaches a real backend, Google or GitHub.

const ME = { user_id: "u_1", team_id: "t_1", github_login: "a-dev", email: "dev@example.com", avatar_url: "", role: "owner" };

/** Mocks the API. `signedIn` decides what /api/me answers; logging out flips it. */
async function mockApi(page: Page, opts: { signedIn: boolean }) {
  const state = { signedIn: opts.signedIn, logouts: 0 };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/auth/logout" && route.request().method() === "POST") {
      state.logouts += 1;
      state.signedIn = false;
      return route.fulfill({ status: 200, body: "" });
    }
    // The provider's sign-in page, standing in for the redirect chain the API starts.
    if (p === "/auth/google" || p === "/auth/github") {
      return route.fulfill({ status: 200, contentType: "text/html", body: `<title>provider</title><h1>Sign in at ${p.slice(6)}</h1>` });
    }
    if (p === "/api/me") return state.signedIn ? json(route, ME) : json(route, { error: "unauthorized" }, 401);
    if (p === "/api/usage") return json(route, { month: "2026-01", tokens_in: 0, tokens_out: 0, total_runs: 0, total_tokens: 0, max_tokens: 1_000_000 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/support/badge") return json(route, { waiting: 0, queue_open: null });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    return json(route, { error: "Not mocked" }, 404);
  });
  return state;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

test("390 wide: Sign out is a named row in the menu sheet, ends the session and returns to sign-in", async ({ page }) => {
  const api = await mockApi(page, { signedIn: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();
  const sheet = page.getByRole("dialog", { name: "Menu" });
  const signOut = sheet.getByRole("button", { name: "Sign out" });
  await expect(signOut).toBeVisible();
  await expect(signOut).toBeInViewport({ ratio: 1 });
  // A full row with its name, big enough to tap.
  await expect(signOut).toHaveText("Sign out");
  const box = await signOut.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThan(150);
  // The sheet is exactly as tall as the window, so its pinned footer is never under a toolbar.
  const fits = await sheet.getByRole("navigation", { name: "Main" }).evaluate((nav) => Math.abs(nav.getBoundingClientRect().height - window.innerHeight) <= 1);
  expect(fits).toBe(true);

  await signOut.click();
  await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
  expect(api.logouts).toBe(1);
});

test("1280 wide: the sidebar's icon button signs out the same way", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const api = await mockApi(page, { signedIn: true });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Continue with GitHub" })).toBeVisible();
  expect(api.logouts).toBe(1);
});

test("390 wide: Google and GitHub buttons go to the API's sign-in, the same as on a computer", async ({ page }) => {
  await mockApi(page, { signedIn: false });
  for (const [label, path] of [["Continue with Google", "/auth/google"], ["Continue with GitHub", "/auth/github"]] as const) {
    await page.goto("/");
    const link = page.getByRole("link", { name: label });
    await expect(link).toBeVisible();
    // The API's own address, the same link a computer gets: no mobile-only page, no http:// hop.
    await expect(link).toHaveAttribute("href", new RegExp(`^http://localhost:\\d+${path}$`));
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { name: `Sign in at ${path.slice(6)}` })).toBeVisible();
  }
});

test("390 wide: a sign-in that finished in another browser says so, with Try again", async ({ page }) => {
  await mockApi(page, { signedIn: false });
  await page.goto("/?signin_error=expired&provider=github");
  const notice = page.getByTestId("sign-in-problem");
  await expect(notice).toBeVisible();
  await expect(notice).toHaveText(/Sign-in finished in a different browser or app than it started in, or took longer than 10 minutes\./);
  await expect(notice.getByRole("link", { name: "Try again" })).toHaveAttribute("href", /\/auth\/github$/);
  // The code is read once: the address bar no longer carries it.
  await expect(page).toHaveURL(/\/$/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await notice.getByRole("link", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Sign in at github" })).toBeVisible();
});

test("390 wide: each sign-in failure code reads as one sentence", async ({ page }) => {
  await mockApi(page, { signedIn: false });
  const cases: [string, RegExp, boolean][] = [
    ["signin_error=cancelled&provider=google", /^Sign-in with Google was cancelled before it finished\./, true],
    ["signin_error=provider&provider=github", /^GitHub didn't confirm your sign-in\./, true],
    ["signin_error=server&provider=google", /^Something went wrong on our side while signing you in\./, true],
    ["signin_error=whatever", /^Sign-in didn't finish\./, false],
  ];
  for (const [query, text, retry] of cases) {
    await page.goto(`/?${query}`);
    const notice = page.getByTestId("sign-in-problem");
    await expect(notice.locator("p")).toHaveText(text);
    await expect(notice.getByRole("link", { name: "Try again" })).toHaveCount(retry ? 1 : 0);
  }
});

test("390 wide: inside an app's built-in browser it says to open Safari or Chrome and offers the link", async ({ page }) => {
  await mockApi(page, { signedIn: false });
  await page.goto("/?signin_error=in_app_browser&provider=google");
  const notice = page.getByTestId("sign-in-problem");
  await expect(notice.locator("p")).toHaveText("Google sign-in doesn't work in an app's built-in browser, so open this page in Safari or Chrome to continue.");
  // Trying again in the same built-in browser can't work, so it isn't offered.
  await expect(notice.getByRole("link", { name: "Try again" })).toHaveCount(0);
  await expect(notice.getByRole("button", { name: "Copy the link" })).toBeVisible();
  // The other ways to sign in stay on the screen.
  await expect(page.getByRole("link", { name: "Continue with GitHub" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});
