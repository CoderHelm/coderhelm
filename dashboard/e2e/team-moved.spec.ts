import { expect, test, type Page, type Route } from "@playwright/test";
import path from "node:path";

// The hosted deployment, for a team that moved to its own install: the
// server refuses the team's sessions (`team_moved`, with the install's
// address), and the shell shows where the team signs in now, the person's
// other teams and sign out. Every API call is mocked; screenshots at 1440
// and 390 go to E2E_SHOTS_DIR.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const WIDTHS = [1440, 390] as const;
const INSTALL = "https://acme.example.com";

interface State {
  url: unknown;
  teams: { team_id: string; org: string; status: string; current: boolean }[];
  switched: string[];
  logouts: number;
  /** Paths that reached the server, in order. */
  asked: string[];
}

async function mock(page: Page, over: Partial<State> = {}): Promise<State> {
  const state: State = {
    url: INSTALL,
    teams: [
      { team_id: "TEAM#acme", org: "Acme", status: "active", current: true },
      { team_id: "TEAM#side", org: "Side project", status: "active", current: false },
    ],
    switched: [],
    logouts: 0,
    asked: [],
    ...over,
  };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.pathname === "/runtime-config.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: `window.__CODERHELM_CONFIG__ = ${JSON.stringify({ selfHosted: false })};` }),
  );
  await page.route((url) => !["localhost", "127.0.0.1"].includes(url.hostname), (route) => route.abort());
  await page.route((url) => ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    state.asked.push(p);
    if (p === "/auth/logout") {
      state.logouts += 1;
      return json(route, {});
    }
    if (p === "/api/teams") return json(route, { teams: state.teams });
    if (p === "/api/teams/switch") {
      state.switched.push(JSON.parse(req.postData() || "{}").team_id);
      return json(route, { team_id: "TEAM#side" });
    }
    return json(route, { error: `This team now signs in at ${state.url}.`, code: "team_moved", url: state.url }, 403);
  });
  return state;
}

async function shot(page: Page, name: string, width: number) {
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`), fullPage: true });
}

async function noSidewaysScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(1);
}

for (const width of WIDTHS) {
  test.describe(`a moved team on hosted, at ${width}px`, () => {
    test.use({ viewport: { width, height: width < 600 ? 844 : 900 } });

    test("shows where the team signs in now, the other teams and sign out", async ({ page }) => {
      const state = await mock(page);
      await page.goto("/");
      const notice = page.getByTestId("team-moved");
      await expect(notice).toBeVisible();
      await expect(notice.getByRole("heading", { name: "This team moved to its own Coderhelm", level: 1 })).toBeVisible();
      await expect(page.getByTestId("team-moved-link")).toHaveAttribute("href", INSTALL);
      await expect(notice.getByText(INSTALL)).toBeVisible();
      // Never the sign-in screen: the session is real, its team is elsewhere.
      await expect(page.getByRole("button", { name: /sign in with/i })).toHaveCount(0);
      await noSidewaysScroll(page);
      await shot(page, "team-moved", width);

      await notice.getByRole("button", { name: "Switch to Side project" }).click();
      await expect.poll(() => state.switched).toEqual(["TEAM#side"]);
    });

    test("sign out ends the session", async ({ page }) => {
      const state = await mock(page, { teams: [{ team_id: "TEAM#acme", org: "Acme", status: "active", current: true }] });
      await page.goto("/");
      const notice = page.getByTestId("team-moved");
      await expect(notice).toBeVisible();
      await expect(notice.getByText("Or switch to another team:")).toHaveCount(0);
      await notice.getByRole("button", { name: "Sign out" }).click();
      await expect.poll(() => state.logouts).toBe(1);
    });

    test("an address that isn't https is never a link", async ({ page }) => {
      await mock(page, { url: "javascript:alert(1)" });
      await page.goto("/");
      const notice = page.getByTestId("team-moved");
      await expect(notice).toBeVisible();
      await expect(page.getByTestId("team-moved-link")).toHaveCount(0);
      await expect(notice.getByText("javascript:")).toHaveCount(0);
    });
  });
}
