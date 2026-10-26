import { expect, test, type BrowserContext, type Route } from "@playwright/test";

// Google Analytics on app.coderhelm.com (components/google-analytics.tsx):
// a page view on the first load and on every client-side route change, with
// the address cut to origin and path. A self-hosted install, and any other
// host, loads nothing. The built dashboard is served as app.coderhelm.com;
// Google's tag is answered here with an empty script, so the page views are
// read from the dataLayer it would have sent.

const APP = "https://app.coderhelm.com";

type Sent = { tag: string[] };

async function serveAsApp(context: BrowserContext, baseURL: string, runtimeConfig: string | null): Promise<Sent> {
  const sent: Sent = { tag: [] };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const api = async (route: Route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: "an-admin", email: "admin@coderhelm.com", avatar_url: "", role: "owner" });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    return json(route, { error: "Not mocked" }, 404);
  };
  await context.route((u) => /^\/(api|auth)\//.test(u.pathname), api);
  await context.route(`${APP}/**`, async (route) => {
    const u = new URL(route.request().url());
    if (/^\/(api|auth)\//.test(u.pathname)) return api(route);
    if (u.pathname === "/runtime-config.js" && runtimeConfig !== null) {
      return route.fulfill({ contentType: "text/javascript", body: runtimeConfig });
    }
    const response = await route.fetch({ url: `${baseURL}${u.pathname}${u.search}` });
    await route.fulfill({ response });
  });
  await context.route("https://www.googletagmanager.com/**", (route) => {
    sent.tag.push(route.request().url());
    return route.fulfill({ contentType: "text/javascript", body: "" });
  });
  await context.route(/google-analytics\.com|analytics\.google\.com/, (route) => {
    sent.tag.push(route.request().url());
    return route.fulfill({ status: 204 });
  });
  return sent;
}

/** The page_view events gtag was given, as page_location values. */
const pageViews = () =>
  ((window as unknown as { dataLayer?: IArguments[] }).dataLayer ?? [])
    .map((a) => Array.from(a))
    .filter((a) => a[0] === "event" && a[1] === "page_view")
    .map((a) => (a[2] as { page_location: string }).page_location);

test("app.coderhelm.com: page views on the first load and on client-side route changes, origin and path only", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  const sent = await serveAsApp(context, baseURL!, null);
  const page = await context.newPage();
  await page.goto(`${APP}/?tab=secret&id=abc#frag`);
  await expect.poll(() => page.evaluate(pageViews)).toEqual([`${APP}/`]);
  expect(sent.tag).toEqual(["https://www.googletagmanager.com/gtag/js?id=G-6C41CN6BC6"]);
  const config = await page.evaluate(() =>
    ((window as unknown as { dataLayer: IArguments[] }).dataLayer).map((a) => Array.from(a)).filter((a) => a[0] === "config").at(-1)?.[2],
  );
  expect(config).toMatchObject({ send_page_view: false, page_location: `${APP}/`, allow_google_signals: false, allow_ad_personalization_signals: false });

  // A client-side route change is a page view of its own, on the same document.
  await page.getByRole("link", { name: /^Settings(\s|$)/ }).first().click();
  await expect(page).toHaveURL(/\/settings\/?/);
  await expect.poll(() => page.evaluate(pageViews)).toEqual([`${APP}/`, expect.stringMatching(new RegExp(`^${APP}/settings/?$`))]);
  expect(sent.tag).toHaveLength(1);
  await context.close();
});

test("a self-hosted install never loads Google's tag, even on app.coderhelm.com", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  const sent = await serveAsApp(context, baseURL!, 'window.__CODERHELM_CONFIG__ = { apiUrl: "", streamUrl: "", selfHosted: true };');
  const page = await context.newPage();
  await page.goto(`${APP}/`);
  await expect(page.locator("body")).toBeVisible();
  await page.waitForTimeout(1500);
  expect(sent.tag).toEqual([]);
  expect(await page.evaluate(pageViews)).toEqual([]);
  await context.close();
});

test("localhost and previews never load Google's tag", async ({ page }) => {
  const tag: string[] = [];
  await page.route(/googletagmanager\.com|google-analytics\.com|analytics\.google\.com/, (route) => {
    tag.push(route.request().url());
    return route.abort();
  });
  await page.route((u) => /^\/(api|auth)\//.test(u.pathname), (route) => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await page.goto("/");
  await page.waitForTimeout(1500);
  expect(tag).toEqual([]);
});
