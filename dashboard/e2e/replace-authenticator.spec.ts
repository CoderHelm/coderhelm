import { expect, test, type Page, type Route } from "@playwright/test";
import path from "node:path";

// Replacing the authenticator app on a self-hosted install, where the
// organization requires two-step sign-in: it can't be turned off, but it can
// move to a new phone. The old app is proved first, then a code from the new
// one finishes the swap. Lost phone: an admin resets it (Settings, Sign-in).
// Every API call is mocked; screenshots at 1440 and 390 go to E2E_SHOTS_DIR.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const WIDTHS = [1440, 390] as const;

const ME = {
  user_id: "USER#ann",
  team_id: "TEAM#acme",
  github_login: null,
  email: "ann@acme.dev",
  avatar_url: "",
  role: "owner",
  auth_provider: "email",
  mfa_enabled: true,
};

interface State {
  mine: Record<string, unknown>;
  starts: Record<string, unknown>[];
  verifies: string[];
  resets: { user: string; body: Record<string, unknown> }[];
}

async function mock(page: Page, over: Partial<State> = {}): Promise<State> {
  const state: State = {
    mine: { self_hosted: true, required: true, held: false, must_keep: true, session_has_2fa: true, signed_in_with: "password", set_up: "cognito", fits: "cognito" },
    starts: [],
    verifies: [],
    resets: [],
    ...over,
  };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.pathname === "/runtime-config.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: `window.__CODERHELM_CONFIG__ = ${JSON.stringify({ selfHosted: true })};` }),
  );
  await page.route((url) => !["localhost", "127.0.0.1"].includes(url.hostname), (route) => route.abort());
  await page.route((url) => ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const body = () => JSON.parse(req.postData() || "{}");
    if (p === "/api/me") return json(route, ME);
    if (p === "/api/users/2fa") return json(route, state.mine);
    if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "TEAM#acme", org: "Acme", status: "active", current: true }] });
    if (p === "/api/users/2fa/replace/start") {
      const b = body();
      state.starts.push(b);
      if (b.code !== "111111") {
        return json(route, { error: "Your password or that code didn't match. Enter both again.", code: "wrong_code" }, 400);
      }
      return json(route, { secret: "JBSWY3DPEHPK3PXP", qr_uri: "otpauth://totp/Coderhelm:ann%40acme.dev?secret=JBSWY3DPEHPK3PXP&issuer=Coderhelm", expires_in: 600 });
    }
    if (p === "/api/users/2fa/replace/verify") {
      const code = body().code;
      state.verifies.push(code);
      if (code !== "222222") {
        return json(route, { error: "That code didn't match. Enter the current 6-digit code from the new app.", code: "wrong_code" }, 400);
      }
      state.mine = { ...state.mine, set_up: "app" };
      return json(route, { status: "replaced" });
    }
    if (p === "/api/sign-in" && req.method() === "GET") {
      return json(route, {
        self_hosted: true,
        is_org: true,
        domains: [],
        require_2fa: true,
        require_2fa_since: "2026-11-03T02:18:50Z",
        pending_invites: 0,
        people: [
          { user_id: "ann", email: "ann@acme.dev", name: "Ann Lee", github_login: "", role: "owner", two_factor: "cognito", is_self: true },
          { user_id: "bo", email: "bo@acme.dev", name: "Bo Park", github_login: "", role: "member", two_factor: "app", is_self: false },
        ],
        without_2fa: 0,
        api_keys: [],
        your_session_has_2fa: true,
      });
    }
    const reset = /^\/api\/users\/([^/]+)\/2fa\/reset$/.exec(p);
    if (reset) {
      state.resets.push({ user: decodeURIComponent(reset[1]), body: body() });
      return json(route, { status: "reset" });
    }
    return json(route, {});
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
  test.describe(`replace the authenticator app, at ${width}px`, () => {
    test.use({ viewport: { width, height: width < 600 ? 844 : 900 } });

    test("required two-step sign-in can't be turned off, but the app can be replaced", async ({ page }) => {
      const state = await mock(page);
      await page.goto("/settings/security");
      await expect(page.getByTestId("two-step-status")).toHaveText("Two step sign in is on");
      await expect(page.getByTestId("keep-or-replace")).toHaveText(
        "Your organization requires it, so it stays on. You can still move it to a new phone with Replace authenticator app.",
      );
      await expect(page.getByRole("button", { name: /Turn off/ })).toHaveCount(0);
      await shot(page, "replace-app-start", width);

      await page.getByTestId("replace-app").click();
      const flow = page.getByTestId("replace-authenticator");
      await expect(flow.getByTestId("lost-phone")).toHaveText(
        "Lost your phone? Ask an admin to reset your two-step sign-in. You'll set it up again when you next sign in.",
      );
      await flow.getByLabel("Your password").fill("correct horse");
      await flow.getByLabel("Code from your current app").fill("999999");
      await flow.getByRole("button", { name: "Continue" }).click();
      await expect(flow.getByRole("alert")).toHaveText("Your password or that code didn't match. Enter both again.");
      // Nothing to scan until the old app is proved.
      await expect(flow.getByText("JBSWY3DPEHPK3PXP")).toHaveCount(0);

      await flow.getByLabel("Code from your current app").fill("111111");
      await flow.getByRole("button", { name: "Continue" }).click();
      await expect(flow.getByText("JBSWY3DPEHPK3PXP")).toBeVisible();
      expect(state.starts.at(-1)).toEqual({ code: "111111", password: "correct horse" });
      await noSidewaysScroll(page);
      await shot(page, "replace-app-scan", width);

      await flow.getByRole("button", { name: "Next: enter a code" }).click();
      await flow.getByLabel("Code from the new app").fill("333333");
      await flow.getByRole("button", { name: "Replace the app" }).click();
      await expect(flow.getByRole("alert")).toContainText("That code didn't match");
      await flow.getByLabel("Code from the new app").fill("222222");
      await flow.getByRole("button", { name: "Replace the app" }).click();
      await expect(page.getByText("Authenticator app replaced. Your old app no longer works.")).toBeVisible();
      expect(state.verifies).toEqual(["333333", "222222"]);
      // Still on, and still kept on.
      await expect(page.getByTestId("two-step-status")).toHaveText("Two step sign in is on");
      await expect(page.getByTestId("replace-authenticator")).toHaveCount(0);
      await noSidewaysScroll(page);
      await shot(page, "replace-app-done", width);
    });

    test("an app-code account replaces without a password", async ({ page }) => {
      const state = await mock(page, {
        mine: { self_hosted: true, required: true, held: false, must_keep: true, session_has_2fa: true, signed_in_with: "password", set_up: "app", fits: "cognito" },
      });
      await page.goto("/settings/security");
      await page.getByTestId("replace-app").click();
      const flow = page.getByTestId("replace-authenticator");
      await expect(flow.getByLabel("Your password")).toHaveCount(0);
      await flow.getByLabel("Code from your current app").fill("111111");
      await flow.getByRole("button", { name: "Continue" }).click();
      await expect(flow.getByText("JBSWY3DPEHPK3PXP")).toBeVisible();
      expect(state.starts.at(-1)).toEqual({ code: "111111" });
    });

    test("lost phone: an admin resets a member's two-step sign-in", async ({ page }) => {
      const state = await mock(page);
      await page.goto("/settings/sign-in");
      const bo = page.getByTestId("people-2fa").getByRole("listitem").filter({ hasText: "Bo Park" });
      await bo.getByRole("button", { name: "Reset" }).click();
      const dialog = page.getByTestId("reset-2fa-dialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("textbox").fill("Video call, saw their face and badge");
      await dialog.getByRole("button", { name: /Reset/ }).click();
      await expect.poll(() => state.resets.length).toBe(1);
      expect(state.resets[0].user).toBe("bo");
      await noSidewaysScroll(page);
      await shot(page, "replace-app-admin-reset", width);
    });
  });
}
