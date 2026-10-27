import { expect, test, type Page, type Route } from "@playwright/test";
import path from "node:path";

// The hosted deployment: each team's admins can require two-factor sign-in
// for that team, and a person's one second factor is asked for after every
// way in. Settings, Sign-in (no domains, the team's switch, how many have no
// second factor, the emails, a reset that reaches every team), the held
// screen, the Security page after Google, and the code step. Every API call
// is mocked; screenshots at 1440 and 390 go to E2E_SHOTS_DIR.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const WIDTHS = [1440, 390] as const;

const ME = {
  user_id: "USER#owner",
  team_id: "TEAM#acme",
  github_login: null,
  email: "owner@example.org",
  avatar_url: "",
  role: "owner",
  auth_provider: "email",
  mfa_enabled: true,
};

const PEOPLE = [
  { user_id: "owner", email: "owner@example.org", name: "Olu Owner", github_login: "", role: "owner", two_factor: "cognito", is_self: true },
  { user_id: "ann", email: "ann@example.org", name: "Ann Lee", github_login: "", role: "member", two_factor: "app", is_self: false },
  { user_id: "bo", email: "bo@example.org", name: "", github_login: "bo-codes", role: "member", two_factor: null, is_self: false },
];

interface State {
  me: Record<string, unknown> | null;
  mine: Record<string, unknown>;
  settings: Record<string, unknown>;
  puts: Record<string, unknown>[];
  resets: { user: string; body: Record<string, unknown> }[];
  verified: string[];
  /** How many times the page asked for /api/users/2fa. */
  statusReads: number;
}

async function mock(page: Page, over: Partial<State> = {}): Promise<State> {
  const state: State = {
    me: ME,
    mine: { self_hosted: false, required: false, held: false, must_keep: false, session_has_2fa: true, signed_in_with: "password", set_up: "cognito", fits: "cognito" },
    settings: {
      self_hosted: false,
      is_org: true,
      domains: [],
      require_2fa: false,
      require_2fa_since: null,
      pending_invites: 0,
      people: PEOPLE,
      without_2fa: 1,
      api_keys: [
        { id: "k1", name: "Nightly report", created_by: "Olu Owner" },
        { id: "k2", name: "Old export", created_by: "bo-codes", made_before_rule: true, maker_on_team: true, maker_two_factor: null },
      ],
      your_session_has_2fa: true,
    },
    puts: [],
    resets: [],
    verified: [],
    statusReads: 0,
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
    const body = () => JSON.parse(req.postData() || "{}");
    if (p === "/api/me") return state.me ? json(route, state.me) : json(route, { error: "unauthorized" }, 401);
    if (p === "/api/users/2fa") {
      state.statusReads += 1;
      return json(route, state.mine);
    }
    // A held session: the server refuses everything but the setup screens.
    if (state.mine.held && !["/api/me", "/api/users/2fa", "/api/users/2fa/app/setup", "/api/users/2fa/app/verify"].includes(p)) {
      return json(route, { error: "This team requires two-factor sign-in. Set it up to continue.", code: "two_factor_required" }, 403);
    }
    if (p === "/api/usage") return json(route, { month: "2026-10", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") {
      return json(route, {
        teams: [
          { team_id: "TEAM#acme", org: "Acme", status: "active", current: true },
          { team_id: "TEAM#side", org: "Side project", status: "active", current: false },
        ],
      });
    }
    if (p === "/api/sign-in" && req.method() === "GET") return json(route, state.settings);
    if (p === "/api/sign-in" && req.method() === "PUT") {
      const b = body();
      state.puts.push(b);
      state.settings = { ...state.settings, ...b, ...(b.require_2fa ? { require_2fa_since: "2026-10-27T12:00:00Z" } : {}) };
      return json(route, {
        domains: [],
        require_2fa: state.settings.require_2fa,
        require_2fa_since: state.settings.require_2fa_since,
        notified: b.require_2fa ? 1 : 0,
      });
    }
    const reset = /^\/api\/users\/([^/]+)\/2fa\/reset$/.exec(p);
    if (reset) {
      state.resets.push({ user: decodeURIComponent(reset[1]), body: body() });
      return json(route, { status: "reset" });
    }
    if (p === "/api/users/2fa/app/setup") {
      return json(route, { secret: "JBSWY3DPEHPK3PXP", qr_uri: "otpauth://totp/Coderhelm:bo%40example.org?secret=JBSWY3DPEHPK3PXP&issuer=Coderhelm" });
    }
    if (p === "/api/users/2fa/app/verify") {
      state.verified.push(body().code);
      state.mine = { ...state.mine, held: false, session_has_2fa: true, set_up: "app" };
      return json(route, { status: "enabled" });
    }
    if (p === "/auth/2fa/verify") {
      const code = body().code;
      if (code !== "123456") return json(route, { error: "wrong", code: "wrong_code" }, 401);
      state.verified.push(code);
      state.me = { ...ME, email: "ann@example.org", role: "member", auth_provider: "google", mfa_enabled: false };
      state.mine = { ...state.mine, session_has_2fa: true, signed_in_with: "google", set_up: "app", fits: "app" };
      return json(route, { status: "ok", team_id: "TEAM#acme" });
    }
    if (p === "/auth/logout") return json(route, {});
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
  test.describe(`hosted, at ${width}px`, () => {
    test.use({ viewport: { width, height: width < 600 ? 844 : 900 } });

    test("Settings, Sign-in: the team's switch, who has none, the emails and a reset that reaches every team", async ({ page }) => {
      const state = await mock(page);
      await page.goto("/settings/sign-in");
      await expect(page.getByRole("heading", { name: "Sign-in", level: 1 })).toBeVisible();
      await expect(page.getByText("everyone on this team must use two-factor sign-in", { exact: false }).first()).toBeVisible();
      // Hosted has no organization: no domains, no "for self-hosted installs" dead end.
      await expect(page.getByText("Who may join")).toHaveCount(0);
      await expect(page.getByText("for self-hosted installs")).toHaveCount(0);
      await expect(page.getByText("Require two-factor sign-in for this team")).toBeVisible();
      await expect(page.getByTestId("without-2fa")).toHaveText("1 of 3 people hasn't set it up yet.");
      await expect(page.getByTestId("people-2fa")).toContainText("Not set up");
      await expect(page.getByTestId("api-keys").getByTestId("key-review")).toHaveCount(1);
      await noSidewaysScroll(page);
      await shot(page, "hosted-sign-in-settings", width);

      await page.getByTestId("require-2fa").click();
      const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog"));
      await expect(confirm).toContainText("Require two-factor sign-in for everyone on this team?");
      await expect(confirm).toContainText("1 person hasn't set it up yet. We'll email them now.");
      await shot(page, "hosted-sign-in-require-confirm", width);
      await page.getByRole("button", { name: "Require it" }).click();
      await expect.poll(() => state.puts.at(-1)).toEqual({ require_2fa: true });
      await expect(page.getByTestId("require-2fa")).toHaveAttribute("aria-checked", "true");
      await expect(page.getByText("Emailed 1 person who hasn't set it up.", { exact: false })).toBeVisible();

      const ann = page.getByTestId("people-2fa").getByRole("listitem").filter({ hasText: "Ann Lee" });
      await ann.getByRole("button", { name: "Reset" }).click();
      const dialog = page.getByTestId("reset-2fa-dialog");
      await expect(dialog).toContainText("same on every team they're on");
      await dialog.getByLabel("How did you check it's them?").fill("Video call, saw their badge");
      await shot(page, "hosted-sign-in-reset", width);
      await dialog.getByRole("button", { name: "Reset" }).click();
      await expect.poll(() => state.resets).toEqual([{ user: "ann", body: { verified_how: "Video call, saw their badge" } }]);
    });

    test("the switch waits until the admin's own session used a code", async ({ page }) => {
      await mock(page, {
        settings: {
          self_hosted: false, is_org: true, domains: [], require_2fa: false, require_2fa_since: null, pending_invites: 0,
          people: PEOPLE, without_2fa: 1, api_keys: [], your_session_has_2fa: false,
        },
      });
      await page.goto("/settings/sign-in");
      await expect(page.getByTestId("require-2fa")).toBeDisabled();
      await expect(page.getByTestId("set-up-yours-first")).toContainText("require it for everyone on this team");
      await noSidewaysScroll(page);
    });

    test("the Settings hub lists Sign-in on hosted", async ({ page }) => {
      await mock(page);
      await page.goto("/settings");
      await expect(page.getByRole("link", { name: /Sign-in/ }).first()).toBeVisible();
    });

    test("a session that isn't held makes no extra call for it", async ({ page }) => {
      const state = await mock(page);
      await page.goto("/settings");
      await expect(page.getByRole("link", { name: /Sign-in/ }).first()).toBeVisible();
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await expect(page.getByTestId("two-factor-gate")).toHaveCount(0);
      expect(state.statusReads).toBe(0);
    });

    test("a member held by the team's rule sees only the setup screen", async ({ page }) => {
      const state = await mock(page, {
        me: { ...ME, email: "bo@example.org", role: "member", auth_provider: "github", github_login: "bo-codes", mfa_enabled: false },
        mine: { self_hosted: false, required: true, held: true, must_keep: true, session_has_2fa: false, signed_in_with: "github", set_up: null, fits: "app" },
      });
      await page.goto("/settings/security");
      const gate = page.getByTestId("two-factor-gate");
      await expect(gate.getByRole("heading", { name: "Set up two-factor sign-in" })).toBeVisible();
      await expect(gate).toContainText("This team requires two-factor sign-in.");
      await expect(page.getByTestId("main-nav")).toHaveCount(0);
      await noSidewaysScroll(page);
      await shot(page, "hosted-two-factor-gate", width);
      await gate.getByRole("button", { name: "Set up an authenticator app" }).click();
      await gate.getByRole("button", { name: "Next: enter a code" }).click();
      await gate.getByLabel("Code from the app").fill("654321");
      await gate.getByRole("button", { name: "Turn on two-factor sign-in" }).click();
      await expect.poll(() => state.verified).toEqual(["654321"]);
      await expect(page.getByTestId("two-factor-gate")).toHaveCount(0);
    });

    test("Security after Google: the app code, kept on while a team requires it", async ({ page }) => {
      await mock(page, {
        me: { ...ME, email: "ann@example.org", role: "member", auth_provider: "google", mfa_enabled: false },
        mine: { self_hosted: false, required: false, held: false, must_keep: true, session_has_2fa: true, signed_in_with: "google", set_up: "app", fits: "app" },
      });
      await page.goto("/settings/security");
      await expect(page.getByTestId("app-two-step-status")).toHaveText("Two-factor sign-in is on");
      await expect(page.getByText("A team you're on requires it, so it stays on.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Turn off two-factor sign-in" })).toHaveCount(0);
      await noSidewaysScroll(page);
      await shot(page, "hosted-security-google", width);
    });

    test("Security after Google with no factor yet offers the app code", async ({ page }) => {
      await mock(page, {
        me: { ...ME, email: "cy@example.org", role: "member", auth_provider: "google", mfa_enabled: false },
        mine: { self_hosted: false, required: false, held: false, must_keep: false, session_has_2fa: false, signed_in_with: "google", set_up: null, fits: "app" },
      });
      await page.goto("/settings/security");
      await expect(page.getByTestId("app-two-step-status")).toHaveText("Two-factor sign-in is off");
      await expect(page.getByRole("button", { name: "Turn on two-factor sign-in" })).toBeVisible();
      await shot(page, "hosted-security-google-off", width);
    });

    test("Security after Google when the code is on the password account says how to sign in", async ({ page }) => {
      await mock(page, {
        me: { ...ME, email: "owner@example.org", auth_provider: "google", mfa_enabled: false },
        mine: { self_hosted: false, required: false, held: false, must_keep: false, session_has_2fa: false, signed_in_with: "google", set_up: "cognito", fits: "app" },
      });
      await page.goto("/settings/security");
      await expect(page.getByTestId("code-on-password-account")).toContainText("Sign in with your email and password");
      await expect(page.getByRole("button", { name: "Turn on two-factor sign-in" })).toHaveCount(0);
    });

    test("after Google, the code screen comes before the app", async ({ page }) => {
      const state = await mock(page, { me: null });
      await page.goto("/?two_factor=1");
      const form = page.getByTestId("second-step");
      await expect(form).toContainText("Enter the code from your authenticator app to finish signing in.");
      await noSidewaysScroll(page);
      await shot(page, "hosted-second-step", width);
      await form.getByLabel("Six digit code").fill("123456");
      await form.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect.poll(() => state.verified).toEqual(["123456"]);
    });
  });
}
