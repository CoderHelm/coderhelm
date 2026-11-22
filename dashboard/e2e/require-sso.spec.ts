import { expect, test, type Page, type Route } from "@playwright/test";

// Require single sign-on, with the team's Okta or its own Microsoft Entra
// tenant. Settings, Sign-in rules shows each provider, what turning it on
// needs, the recovery words before and after, who isn't linked and their
// one-time links. The sign-in screen, for a team that requires it, shows only
// that provider: no password form, and no owner's way around it. Every API
// call is answered here; nothing reaches Okta, Microsoft or a real backend.

const ME = {
  user_id: "USER#owner",
  team_id: "TEAM#t1",
  github_login: null,
  email: "owner@example.org",
  avatar_url: "",
  role: "owner",
  auth_provider: "microsoft",
  mfa_enabled: true,
};

type Provider = "okta" | "microsoft";
interface Option {
  provider: Provider;
  name: string;
  set_up: boolean;
  enabled: boolean;
  domains_verified: boolean;
  session_from_provider: boolean;
  is_owner: boolean;
}
const READY = { set_up: true, enabled: true, domains_verified: true, session_from_provider: true, is_owner: true };
const RECOVERY = (name: string) =>
  `If ${name} is down or misconfigured, nobody can sign in until it's fixed. There is no way around it inside Coderhelm: an owner contacts Coderhelm support from outside the product, support verifies them out of band, and turns only this rule off.`;

interface State {
  signedIn: boolean;
  ended: Provider | null;
  methods: Record<string, unknown>;
  options: Option[];
  required: Provider | null;
  unlinked: { user_id: string; email: string; name: string; role: string }[];
  claims: Record<string, unknown>[];
  puts: Record<string, unknown>[];
  logins: Record<string, unknown>[];
  issued: string[];
  revoked: string[];
  refuseLogin: Provider | null;
}

async function mock(page: Page, over: Partial<State> = {}): Promise<State> {
  const state: State = {
    signedIn: false,
    ended: null,
    methods: { password: true, google: true, github: true, microsoft: true, okta: true },
    options: [
      { provider: "okta", name: "Okta", ...READY, session_from_provider: false },
      { provider: "microsoft", name: "Microsoft Entra", ...READY },
    ],
    required: null,
    unlinked: [],
    claims: [],
    puts: [],
    logins: [],
    issued: [],
    revoked: [],
    refuseLogin: null,
    ...over,
  };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const refusal = (p: Provider) => ({
    code: "sso_required",
    error: `Example requires single sign-on with ${p === "okta" ? "Okta" : "Microsoft Entra"}.`,
    provider: p,
    team: "Example",
    team_id: "TEAM#t1",
  });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const body = () => JSON.parse(req.postData() || "{}");
    if (p === "/auth/methods") return json(route, state.methods);
    if (p === "/auth/login") {
      state.logins.push(body());
      if (state.refuseLogin) {
        const r = state.refuseLogin;
        state.refuseLogin = null;
        return json(route, refusal(r), 403);
      }
      return json(route, { status: "mfa_required", session: "cognito-session" });
    }
    if (p === "/api/me") {
      if (state.ended) {
        const r = state.ended;
        state.ended = null;
        return json(route, refusal(r), 401);
      }
      return state.signedIn ? json(route, ME) : json(route, { error: "unauthorized" }, 401);
    }
    if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "TEAM#t1", org: "Example", status: "active", current: true }] });
    if (p === "/api/users/2fa") return json(route, { self_hosted: false, required: false, held: false, session_has_2fa: true, signed_in_with: "microsoft", set_up: "app", fits: "app" });
    if (p === "/api/sign-in" && req.method() === "GET") {
      return json(route, {
        self_hosted: false,
        is_org: true,
        team_id: "TEAM#t1",
        domains: [],
        require_2fa: false,
        require_2fa_since: null,
        pending_invites: 0,
        people: [
          { user_id: "owner", email: "owner@example.org", name: "Owner", github_login: "", role: "owner", two_factor: "app", is_self: true },
          ...state.unlinked.map((u) => ({ ...u, github_login: "", two_factor: null, is_self: false })),
        ],
        without_2fa: state.unlinked.length,
        api_keys: [],
        your_session_has_2fa: true,
        require_sso: state.required,
        require_sso_since: state.required ? "2026-11-20T09:00:00Z" : null,
        sso_options: state.options.map((o) => ({
          ...o,
          ready: o.set_up && o.enabled && o.domains_verified && o.session_from_provider && o.is_owner,
          unlinked: state.unlinked,
          recovery: RECOVERY(o.name),
          suspended_keys: state.unlinked.length ? [{ name: "nightly-ci", kind: "api" }] : [],
        })),
        claim_links: state.claims,
      });
    }
    if (p === "/api/sign-in" && req.method() === "PUT") {
      const b = body();
      state.puts.push(b);
      if (typeof b.require_sso === "string") state.required = b.require_sso === "" ? null : b.require_sso;
      return json(route, { domains: [], require_2fa: false, require_2fa_since: null, require_sso: state.required, require_sso_since: null });
    }
    if (p === "/api/sign-in/claims" && req.method() === "POST") {
      const b = body();
      state.issued.push(b.user_id);
      state.claims = [{ user_id: b.user_id, email: "ann@example.org", role: "member", provider: state.required, expires_at: "2026-11-24T09:00:00Z", used: false, used_at: null, issued_by: "Owner", issued_at: "2026-11-21T09:00:00Z" }];
      return json(route, { url: "http://localhost:3111/auth/sso/claim?token=abc.def.secret", expires_at: "2026-11-24T09:00:00Z", claim: state.claims[0] });
    }
    if (p.startsWith("/api/sign-in/claims/") && req.method() === "DELETE") {
      state.revoked.push(decodeURIComponent(p.split("/").pop() || ""));
      state.claims = [];
      return json(route, { revoked: true });
    }
    if (p === "/api/sign-in/okta") return json(route, { callback_url: "", sign_in_redirect_uri: "", sign_out_redirect_uri: "", live: null, draft: null, self_hosted: false, domains: [] });
    if (p === "/api/sign-in/microsoft") {
      return json(route, {
        available: true,
        redirect_uri: "http://localhost:3111/auth/microsoft/callback",
        setup: { tenant_id: "11111111-2222-3333-4444-555555555555", domains: ["example.org"], enabled: true, tested_at: "2026-11-21T08:30:00Z", tested_email: "owner@example.org", updated_at: null, updated_by: null },
        self_hosted: false,
        domains: [],
      });
    }
    return json(route, {});
  });
  return state;
}

async function noSidewaysScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(1);
}

for (const width of [1280, 390]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: width < 600 ? 844 : 900 } });

    test("each provider says what turning it on needs; only a ready one can be chosen", async ({ page }) => {
      await mock(page, { signedIn: true });
      await page.goto("/settings/sign-in");
      const okta = page.getByTestId("sso-option-okta");
      await expect(page.getByTestId("require-sso-okta")).toBeDisabled();
      await expect(okta.getByTestId("need-session-okta")).toHaveAttribute("data-ok", "no");
      await expect(page.getByTestId("require-sso-microsoft")).toBeEnabled();
      // Recovery is said next to the choice, before anything is turned on.
      await expect(page.getByTestId("sso-recovery-microsoft")).toContainText("nobody can sign in until it's fixed");
      await expect(page.getByTestId("require-sso-keys")).toContainText("Keys follow their maker");
      await expect(page.getByTestId("require-sso-support")).toContainText("read-only, never a session in your team");
      await noSidewaysScroll(page);
    });

    test("turning it on confirms the recovery and who isn't linked, then sends the provider", async ({ page }) => {
      const state = await mock(page, {
        signedIn: true,
        unlinked: [{ user_id: "ann", email: "ann@example.org", name: "Ann Lee", role: "member" }],
      });
      await page.goto("/settings/sign-in");
      await page.getByTestId("require-sso-microsoft").click();
      const confirm = page.getByTestId("confirm-dialog");
      await expect(confirm).toContainText("Require single sign-on with Microsoft Entra for everyone on this team?");
      await expect(confirm).toContainText("If Microsoft Entra is down or misconfigured, nobody can sign in until it's fixed.");
      await expect(confirm).toContainText("Ann Lee");
      await expect(confirm).toContainText("the owner's included");
      // Keys follow their maker: the ones that will be suspended are named.
      await expect(confirm).toContainText("These keys are suspended until their maker links Microsoft Entra: nightly-ci.");
      await expect(confirm).toContainText("stays ended if you turn this off later");
      await noSidewaysScroll(page);
      await page.getByRole("button", { name: "Require Microsoft Entra" }).click();
      await expect.poll(() => state.puts.at(-1)).toEqual({ require_sso: "microsoft", acknowledge_unlinked: true });
      await expect(page.getByTestId("require-sso-state")).toContainText("Required with Microsoft Entra");
      await expect(page.getByTestId("sso-recovery")).toContainText("support verifies them out of band");
    });

    test("an unlinked member gets a one-time link, shown once, and it can be revoked", async ({ page }) => {
      const state = await mock(page, {
        signedIn: true,
        required: "microsoft",
        unlinked: [{ user_id: "ann", email: "ann@example.org", name: "Ann Lee", role: "member" }],
      });
      await page.goto("/settings/sign-in");
      await expect(page.getByTestId("sso-unlinked-microsoft")).toContainText("never links anyone by email");
      await page.getByTestId("make-claim").click();
      await expect.poll(() => state.issued).toEqual(["ann"]);
      const dialog = page.getByTestId("claim-link-dialog");
      await expect(dialog).toContainText("works once, for 72 hours");
      await expect(page.getByTestId("claim-url")).toHaveValue("http://localhost:3111/auth/sso/claim?token=abc.def.secret");
      await noSidewaysScroll(page);
      await dialog.getByRole("button", { name: "Done" }).click();
      await page.getByTestId("revoke-claim").click();
      await expect.poll(() => state.revoked).toEqual(["ann"]);
    });

    test("a team that requires Microsoft: only its tenant's button, no password, no owner's way in", async ({ page }) => {
      await mock(page);
      // Text in the URL is never shown: a crafted name can't put words on the page.
      await page.goto("/?signin_error=sso_required&sso=microsoft&provider=google&team_id=TEAM%23t2&team=Pay%20here%20first");
      await expect(page.getByTestId("sso-required-words")).toHaveText("Your team requires single sign-on with Microsoft Entra.");
      await expect(page.getByText("Pay here first")).toHaveCount(0);
      await expect(page.getByTestId("sso-microsoft")).toHaveAttribute("href", /\/auth\/microsoft\?team_id=TEAM%23t2$/);
      await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveCount(0);
      await expect(page.getByLabel("Password")).toHaveCount(0);
      await expect(page.getByText(/Owner of this team/)).toHaveCount(0);
      await noSidewaysScroll(page);
    });

    test("a team that requires Okta: only its Okta form", async ({ page }) => {
      await mock(page);
      await page.goto("/?signin_error=sso_required&sso=okta&team_id=TEAM%23t1");
      await expect(page.getByTestId("sso-required-words")).toHaveText("Your team requires single sign-on with Okta.");
      await expect(page.getByTestId("sso-required").getByLabel("Work email")).toBeVisible();
      await expect(page.getByLabel("Password")).toHaveCount(0);
    });

    test("a refused password sign-in turns the screen to the team's provider, with nothing extra sent", async ({ page }) => {
      const state = await mock(page, { refuseLogin: "microsoft" });
      await page.goto("/");
      await page.getByLabel("Email").first().fill("owner@example.org");
      await page.getByLabel("Password").fill("a-password-1!");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByTestId("sso-required-words")).toHaveText("Your team requires single sign-on with Microsoft Entra.");
      expect(state.logins.at(-1)).toEqual({ email: "owner@example.org", password: "a-password-1!" });
    });
  });
}

test("a session the server ended lands on the team's provider", async ({ page }) => {
  await mock(page, { ended: "microsoft" });
  await page.goto("/");
  await expect(page).toHaveURL(/signin_error=sso_required&sso=microsoft&team_id=TEAM%23t1/);
  await expect(page.getByTestId("sso-microsoft")).toBeVisible();
});

test("an unlinked member is told to ask an admin; a used claim link says so", async ({ page }) => {
  await mock(page);
  await page.goto("/?signin_error=sso_ask_admin&provider=microsoft");
  await expect(page.getByTestId("sign-in-problem")).toContainText("Ask an admin for a one-time link.");
  await page.goto("/?signin_error=sso_claim_invalid&reason=used");
  await expect(page.getByTestId("sign-in-problem")).toContainText("That one-time link was already used.");
});

test("on a self-hosted install that requires Microsoft, only its button shows", async ({ page }) => {
  await mock(page, { methods: { password: true, google: false, github: false, microsoft: true, sso_required: "microsoft" } });
  await page.goto("/");
  await expect(page.getByTestId("sso-microsoft")).toHaveAttribute("href", /\/auth\/microsoft$/);
  await expect(page.getByLabel("Password")).toHaveCount(0);
});
