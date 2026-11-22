import { expect, test, type Page, type Route } from "@playwright/test";

// Require Okta sign-in. Settings, Sign-in rules has the owner's switch, each
// thing turning it on needs, who hasn't linked Okta yet, and the owner's
// password sign-ins while it is on. The sign-in screen, for a team that
// requires it, shows only the Okta form and a small way in for the owner,
// whose password sign-in carries `break_glass: true` into the code step. A
// session the server ended for it lands back on that screen. Every API call
// is answered here; nothing reaches Okta or a real backend.

const ME = {
  user_id: "USER#owner",
  team_id: "TEAM#t1",
  github_login: null,
  email: "owner@example.org",
  avatar_url: "",
  role: "owner",
  auth_provider: "okta",
  mfa_enabled: true,
};

const LIVE = {
  issuer: "https://acme.okta.com",
  client_id: "0oa1example",
  has_secret: true,
  domains: ["example.org"],
  enabled: true,
  tested_at: "2026-11-19T12:00:00Z",
  tested_email: "owner@example.org",
  updated_at: "2026-11-19T12:00:00Z",
  updated_by: "Owner",
};

type Checks = { set_up: boolean; enabled: boolean; domains_verified: boolean; session_is_okta: boolean; is_owner: boolean };
const ALL_OK: Checks = { set_up: true, enabled: true, domains_verified: true, session_is_okta: true, is_owner: true };

interface State {
  signedIn: boolean;
  /** `/api/me` answers 401 with `okta_required` (the session was ended). */
  ended: boolean;
  methods: Record<string, unknown>;
  checks: Checks;
  requireOkta: boolean;
  unlinked: { user_id: string; email: string; name: string; role: string }[];
  breakGlass: { at: string; who: string; email: string }[];
  puts: Record<string, unknown>[];
  logins: Record<string, unknown>[];
  mfas: Record<string, unknown>[];
  oktaPosts: string[];
  /** Refuse the next password sign-in with `okta_required`. */
  refuseLogin: boolean;
  /** The Okta section's domain proofs. */
  domains: Record<string, unknown>[];
}

async function mock(page: Page, over: Partial<State> = {}): Promise<State> {
  const state: State = {
    signedIn: false,
    ended: false,
    methods: { password: true, google: true, github: true, microsoft: true, okta: true },
    domains: [],
    checks: ALL_OK,
    requireOkta: false,
    unlinked: [],
    breakGlass: [],
    puts: [],
    logins: [],
    mfas: [],
    oktaPosts: [],
    refuseLogin: false,
    ...over,
  };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const body = () => JSON.parse(req.postData() || "{}");
    if (p === "/auth/methods") return json(route, state.methods);
    if (p === "/auth/okta" && req.method() === "POST") {
      state.oktaPosts.push(req.postData() || "");
      return route.fulfill({ status: 200, contentType: "text/html", body: "<title>okta</title><h1>Your team's Okta</h1>" });
    }
    if (p === "/auth/login") {
      state.logins.push(body());
      if (state.refuseLogin) {
        state.refuseLogin = false;
        return json(route, { code: "okta_required", error: "Example requires Okta sign-in.", team: "Example", team_id: "TEAM#t1" }, 403);
      }
      return json(route, { status: "mfa_required", session: "cognito-session" });
    }
    if (p === "/auth/mfa/verify") {
      state.mfas.push(body());
      state.signedIn = true;
      return json(route, { status: "ok", team_id: "TEAM#t1" });
    }
    if (p === "/api/me") {
      if (state.ended) {
        state.ended = false;
        return json(route, { code: "okta_required", error: "Example requires Okta sign-in.", team: "Example", team_id: "TEAM#t1" }, 401);
      }
      return state.signedIn ? json(route, ME) : json(route, { error: "unauthorized" }, 401);
    }
    if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "TEAM#t1", org: "Example", status: "active", current: true }] });
    if (p === "/api/users/2fa") return json(route, { self_hosted: false, required: false, held: false, session_has_2fa: true, signed_in_with: "okta", set_up: "app", fits: "app" });
    if (p === "/api/sign-in" && req.method() === "GET") {
      const c = state.checks;
      return json(route, {
        self_hosted: false,
        is_org: true,
        domains: [],
        require_2fa: false,
        require_2fa_since: null,
        pending_invites: 0,
        people: [
          { user_id: "owner", email: "owner@example.org", name: "Owner", github_login: "", role: "owner", two_factor: "app", is_self: true, okta_linked: true },
          ...state.unlinked.map((u) => ({ ...u, github_login: "", two_factor: null, is_self: false, okta_linked: false })),
        ],
        without_2fa: state.unlinked.length,
        api_keys: [],
        your_session_has_2fa: true,
        require_okta: state.requireOkta,
        require_okta_since: state.requireOkta ? "2026-11-20T09:00:00Z" : null,
        okta: c,
        can_require_okta: c.set_up && c.enabled && c.domains_verified && c.session_is_okta && c.is_owner,
        unlinked: state.unlinked,
        break_glass: state.breakGlass,
      });
    }
    if (p === "/api/sign-in" && req.method() === "PUT") {
      const b = body();
      state.puts.push(b);
      if (b.require_okta === true && state.unlinked.length && b.acknowledge_unlinked !== true) {
        return json(route, { code: "unlinked_members", error: "Some people haven't linked Okta.", unlinked: state.unlinked }, 409);
      }
      if (typeof b.require_okta === "boolean") state.requireOkta = b.require_okta;
      return json(route, {
        domains: [],
        require_2fa: false,
        require_2fa_since: null,
        require_okta: state.requireOkta,
        require_okta_since: state.requireOkta ? "2026-11-21T09:00:00Z" : null,
      });
    }
    if (p === "/api/sign-in/okta" && req.method() === "GET") {
      return json(route, {
        callback_url: "http://localhost:3111/auth/okta/callback",
        sign_in_redirect_uri: "http://localhost:3111/auth/okta/callback",
        sign_out_redirect_uri: "http://localhost:3111",
        live: state.checks.set_up ? { ...LIVE, enabled: state.checks.enabled } : null,
        draft: null,
        self_hosted: false,
        domains: state.domains,
      });
    }
    return json(route, {});
  });
  return state;
}

/** Nothing on the page is wider than the window. */
async function noSidewaysScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(1);
}

for (const width of [1280, 390]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: width < 600 ? 844 : 900 } });

    test("the switch is off until every precondition holds, and each one says what to do", async ({ page }) => {
      await mock(page, {
        signedIn: true,
        checks: { set_up: true, enabled: true, domains_verified: false, session_is_okta: false, is_owner: true },
      });
      await page.goto("/settings/sign-in");
      const section = page.locator("#require-okta");
      await expect(section.getByText("Require Okta sign-in for this team")).toBeVisible();
      await expect(page.getByTestId("require-okta")).toBeDisabled();
      const needs = page.getByTestId("require-okta-needs");
      await expect(needs.getByTestId("need-owner")).toHaveAttribute("data-ok", "yes");
      await expect(needs.getByTestId("need-okta-on")).toHaveAttribute("data-ok", "yes");
      await expect(needs.getByTestId("need-domains")).toHaveAttribute("data-ok", "no");
      await expect(needs.getByTestId("need-okta-session")).toHaveAttribute("data-ok", "no");
      // Signing in with Okta from here posts the owner's own email, in the body.
      await expect(needs.getByTestId("sign-in-with-okta")).toBeVisible();
      await expect(page.getByTestId("require-okta-keys")).toContainText("API keys and CI tokens");
      await noSidewaysScroll(page);
    });

    test("only the owner can turn it on", async ({ page }) => {
      await mock(page, { signedIn: true, checks: { ...ALL_OK, is_owner: false } });
      await page.goto("/settings/sign-in");
      await expect(page.getByTestId("require-okta")).toBeDisabled();
      await expect(page.getByTestId("need-owner")).toHaveAttribute("data-ok", "no");
    });

    test("turning it on warns with the people not linked yet, then sends acknowledge_unlinked", async ({ page }) => {
      const state = await mock(page, {
        signedIn: true,
        unlinked: [{ user_id: "ann", email: "ann@example.org", name: "Ann Lee", role: "member" }],
      });
      await page.goto("/settings/sign-in");
      await expect(page.getByTestId("unlinked-list")).toContainText("Ann Lee");
      await expect(page.getByTestId("require-okta")).toBeEnabled();
      await page.getByTestId("require-okta").click();
      const confirm = page.getByTestId("confirm-dialog");
      await expect(confirm).toContainText("Require Okta sign-in for everyone on this team?");
      await expect(confirm).toContainText("1 person hasn't linked Okta yet and won't be able to sign in: Ann Lee.");
      await noSidewaysScroll(page);
      await page.getByRole("button", { name: "Require Okta" }).click();
      await expect.poll(() => state.puts.at(-1)).toEqual({ require_okta: true, acknowledge_unlinked: true });
      await expect(page.getByTestId("require-okta")).toHaveAttribute("aria-checked", "true");
    });

    test("a failing domain proof shows when it will be released, and the support view policy is stated", async ({ page }) => {
      await mock(page, {
        signedIn: true,
        requireOkta: true,
        domains: [
          {
            domain: "example.org",
            txt_name: "_coderhelm-okta.example.org",
            txt_value: "coderhelm-okta=abc",
            verified_at: "2026-11-01T00:00:00Z",
            other_team: false,
            failing_since: "2026-11-20T00:00:00Z",
            release_after: "2026-11-27T00:00:00Z",
          },
        ],
      });
      await page.goto("/settings/sign-in");
      const st = page.getByTestId("okta-domain-state");
      await expect(st).toContainText("TXT record missing since");
      await expect(st).toContainText("Released on");
      await expect(page.getByTestId("require-okta-support")).toContainText("only from a session of theirs that passed a second factor");
      await noSidewaysScroll(page);
    });

    test("the owner's sign-ins without Okta are listed", async ({ page }) => {
      await mock(page, {
        signedIn: true,
        requireOkta: true,
        breakGlass: [{ at: "2026-11-20T10:00:00Z", who: "Owner", email: "owner@example.org" }],
      });
      await page.goto("/settings/sign-in");
      await expect(page.getByTestId("require-okta-state")).toContainText("Required since");
      await expect(page.getByTestId("break-glass-list")).toContainText("Owner");
      await expect(page.getByTestId("break-glass-list").getByRole("listitem")).toHaveCount(1);
      await noSidewaysScroll(page);
    });

    test("a team that requires Okta: only its Okta form, and the owner's way in posts break_glass", async ({ page }) => {
      const state = await mock(page);
      // Text in the URL is never shown: a crafted name can't put words on
      // the sign-in page.
      await page.goto("/?signin_error=okta_required&provider=google&team_id=TEAM%23t2&team=Pay%20here%20first");
      await expect(page.getByTestId("okta-required-words")).toHaveText("Your team requires Okta sign-in.");
      await expect(page.getByText("Pay here first")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Continue with Microsoft" })).toHaveCount(0);
      await expect(page.getByLabel("Password")).toHaveCount(0);
      await expect(page.getByLabel("Work email")).toBeVisible();
      await noSidewaysScroll(page);

      await page.getByTestId("break-glass-link").click();
      const glass = page.getByTestId("break-glass");
      await glass.getByLabel("Email").fill("owner@example.org");
      await glass.getByLabel("Password").fill("a-password-1!");
      await glass.getByRole("button", { name: "Sign in as the owner" }).click();
      // The team it is for goes with it (an owner of several such teams).
      await expect.poll(() => state.logins.at(-1)).toEqual({
        email: "owner@example.org",
        password: "a-password-1!",
        break_glass: true,
        break_glass_team: "TEAM#t2",
      });
      await page.getByLabel("Six digit code").fill("123456");
      await page.getByRole("button", { name: "Verify" }).click();
      await expect.poll(() => state.mfas.at(-1)).toMatchObject({ code: "123456", break_glass: true, break_glass_team: "TEAM#t2" });
    });

    test("a refused password sign-in turns the screen to the team's Okta", async ({ page }) => {
      const state = await mock(page, { refuseLogin: true });
      await page.goto("/");
      await page.getByLabel("Email").first().fill("ann@example.org");
      await page.getByLabel("Password").fill("a-password-1!");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByTestId("okta-required-words")).toHaveText("Your team requires Okta sign-in.");
      expect(state.logins.at(-1)).toEqual({ email: "ann@example.org", password: "a-password-1!" });
    });
  });
}

test("a session the server ended for Okta lands on the team's Okta sign-in", async ({ page }) => {
  await mock(page, { ended: true });
  await page.goto("/");
  await expect(page).toHaveURL(/signin_error=okta_required&team_id=TEAM%23t1/);
  await expect(page.getByTestId("okta-required-words")).toHaveText("Your team requires Okta sign-in.");
  await expect(page.getByTestId("okta-required").getByLabel("Work email")).toBeVisible();
});

test("an unlinked member's Okta sign-in says to ask an admin", async ({ page }) => {
  await mock(page);
  await page.goto("/?signin_error=okta_ask_admin&provider=okta");
  await expect(page.getByTestId("sign-in-problem")).toContainText(
    "Your team requires Okta sign-in and your account isn't linked to Okta yet. Ask an admin.",
  );
});

test("on a self-hosted install that requires it, the methods say so", async ({ page }) => {
  await mock(page, { methods: { password: true, google: false, github: false, okta: true, okta_required: true } });
  await page.goto("/");
  await expect(page.getByTestId("okta-required")).toBeVisible();
  await expect(page.getByTestId("break-glass-link")).toBeVisible();
});
