import { expect, test, type Page, type Route } from "@playwright/test";
import path from "node:path";

// A sign-in carried over from another CoderHelm: the team moved to this
// install, and the person's account there has an authenticator app. The
// password sign-in answers mfa_required with carry_over; the code screen
// then sends the same email and password with the code. Every API call is
// mocked; screenshots at 1440 and 390 go to E2E_SHOTS_DIR.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const WIDTHS = [1440, 390] as const;

const ME = {
  user_id: "USER#pat",
  team_id: "TEAM#org",
  github_login: null,
  email: "pat@example.org",
  avatar_url: "",
  role: "member",
  auth_provider: "email",
  mfa_enabled: false,
};

interface State {
  signedIn: boolean;
  codeTries: { email: string; password: string; code: string }[];
}

async function mock(page: Page): Promise<State> {
  const state: State = { signedIn: false, codeTries: [] };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.pathname === "/runtime-config.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: `window.__CODERHELM_CONFIG__ = ${JSON.stringify({ selfHosted: true, siteUrl: null })};` }),
  );
  await page.route((url) => !["localhost", "127.0.0.1"].includes(url.hostname), (route) => route.abort());
  await page.route((url) => ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const body = () => JSON.parse(req.postData() || "{}");
    if (p === "/api/me") return state.signedIn ? json(route, ME) : json(route, { error: "unauthorized" }, 401);
    if (p === "/api/users/2fa") return json(route, { self_hosted: true, required: false, held: false, session_has_2fa: true, signed_in_with: "password", set_up: null, fits: "cognito" });
    if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "TEAM#org", org: "Example", status: "active", current: true }] });
    if (p === "/auth/login") {
      const b = body();
      if (b.email === "pat@example.org" && b.password === "Secret123!") return json(route, { status: "mfa_required", carry_over: true });
      return json(route, { error: "unauthorized" }, 401);
    }
    if (p === "/auth/login/code") {
      const b = body();
      state.codeTries.push(b);
      if (b.code !== "123456") return json(route, { error: "unauthorized" }, 401);
      state.signedIn = true;
      return json(route, { status: "ok", team_id: "TEAM#org" });
    }
    return json(route, {});
  });
  return state;
}

for (const width of WIDTHS) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: width < 600 ? 844 : 900 } });

    test("a carried-over sign-in asks for the code and sends it with the password", async ({ page }) => {
      const state = await mock(page);
      await page.goto("/");
      await page.getByLabel("Email").fill("pat@example.org");
      await page.getByLabel("Password").fill("Secret123!");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByTestId("carry-over-note")).toContainText("Use the authenticator app you used there.");
      await page.screenshot({ path: path.join(SHOTS_DIR, `sign-in-carry-over-${width}.png`), fullPage: true });

      // A wrong code is refused and can be tried again.
      await page.getByLabel("Six digit code").fill("000000");
      await page.getByRole("button", { name: "Verify" }).click();
      await expect(page.getByText("That code didn't work.", { exact: false })).toBeVisible();

      await page.getByLabel("Six digit code").fill("123456");
      await page.getByRole("button", { name: "Verify" }).click();
      await expect.poll(() => state.codeTries.map((t) => t.code)).toEqual(["000000", "123456"]);
      expect(state.codeTries.every((t) => t.email === "pat@example.org" && t.password === "Secret123!")).toBe(true);
      await expect(page.getByTestId("carry-over-note")).toHaveCount(0);

      // The password is never written to storage.
      const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
      expect(stored).not.toContain("Secret123!");
    });
  });
}
