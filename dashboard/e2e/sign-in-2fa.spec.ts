import { expect, test, type Page, type Route } from "@playwright/test";
import path from "node:path";

// A self-hosted install: one organization, who may join, and two-factor
// sign-in. Settings, Sign-in (domains, the switch, who has it, reset), the
// setup screen a held session sees, the code after Google or GitHub, and the
// sign-in screen's words for someone who isn't invited. Every API call is
// mocked; screenshots at 1440 and 390 go to E2E_SHOTS_DIR.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const WIDTHS = [1440, 390] as const;

const ME = {
  user_id: "USER#owner",
  team_id: "TEAM#org",
  github_login: null,
  email: "owner@example.org",
  avatar_url: "",
  role: "owner",
  auth_provider: "email",
  mfa_enabled: true,
  platform_admin: true,
};

const PEOPLE = [
  { user_id: "owner", email: "owner@example.org", name: "Olu Owner", github_login: "", role: "owner", two_factor: "cognito", is_self: true },
  { user_id: "ann", email: "ann@example.org", name: "Ann Lee", github_login: "", role: "member", two_factor: "app", is_self: false },
  { user_id: "bo", email: "bo@example.org", name: "", github_login: "bo-codes", role: "member", two_factor: null, is_self: false },
  { user_id: "cy", email: "cy@example.org", name: "Cy Admin", github_login: "", role: "admin", two_factor: "cognito", is_self: false },
];

interface State {
  me: typeof ME | null;
  mine: Record<string, unknown>;
  settings: Record<string, unknown>;
  puts: Record<string, unknown>[];
  resets: { user: string; body: Record<string, unknown> }[];
  verified: string[];
  setup: string[];
  /** Refuse the next PUT /api/sign-in with this error. */
  refuse?: { status: number; error: string; code?: string };
}

async function mock(page: Page, over: Partial<State> = {}): Promise<State> {
  const state: State = {
    me: ME,
    mine: { self_hosted: true, required: false, held: false, session_has_2fa: true, signed_in_with: "password", set_up: "cognito", fits: "cognito" },
    settings: {
      self_hosted: true,
      is_org: true,
      domains: ["example.org"],
      require_2fa: false,
      require_2fa_since: null,
      pending_invites: 2,
      people: PEOPLE,
      api_keys: [{ id: "k1", name: "Nightly report", created_by: "Olu Owner" }],
      your_session_has_2fa: true,
    },
    puts: [],
    resets: [],
    verified: [],
    setup: [],
    ...over,
  };
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
    if (p === "/api/me") return state.me ? json(route, state.me) : json(route, { error: "unauthorized" }, 401);
    if (p === "/api/users/2fa") return json(route, state.mine);
    if (p === "/api/usage") return json(route, { month: "2026-10", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "TEAM#org", org: "Example", status: "active", current: true }] });
    if (p === "/api/sign-in" && req.method() === "GET") return json(route, state.settings);
    if (p === "/api/sign-in" && req.method() === "PUT") {
      const b = body();
      state.puts.push(b);
      if (state.refuse) {
        const r = state.refuse;
        state.refuse = undefined;
        return json(route, { error: r.error, code: r.code }, r.status);
      }
      state.settings = { ...state.settings, ...b, ...(b.require_2fa ? { require_2fa_since: "2026-10-26T12:00:00Z" } : {}) };
      return json(route, { domains: state.settings.domains, require_2fa: state.settings.require_2fa, require_2fa_since: state.settings.require_2fa_since });
    }
    const reset = /^\/api\/users\/([^/]+)\/2fa\/reset$/.exec(p);
    if (reset) {
      state.resets.push({ user: decodeURIComponent(reset[1]), body: body() });
      state.settings = {
        ...state.settings,
        people: (state.settings.people as typeof PEOPLE).map((x) => (x.user_id === reset[1] ? { ...x, two_factor: null } : x)),
      };
      return json(route, { status: "reset" });
    }
    if (p === "/api/users/2fa/app/setup") {
      state.setup.push("app");
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
      state.me = { ...ME, email: "bo@example.org", role: "member", github_login: "bo-codes" as unknown as null, auth_provider: "github" };
      state.mine = { ...state.mine, held: false, session_has_2fa: true, signed_in_with: "github", set_up: "app", fits: "app" };
      return json(route, { status: "ok", team_id: "TEAM#org" });
    }
    if (p === "/auth/login") return json(route, { error: "This Coderhelm is private to one organization.", code: "not_invited" }, 403);
    if (p === "/auth/signup") return json(route, { error: "private", code: "not_invited" }, 403);
    if (p === "/auth/logout") return json(route, {});
    // Anything else a page asks for on its way: empty.
    return json(route, {});
  });
  return state;
}

async function shot(page: Page, name: string, width: number) {
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`), fullPage: true });
}

/** Nothing on the page is wider than the window. */
async function noSidewaysScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(1);
}

for (const width of WIDTHS) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: width < 600 ? 844 : 900 } });

    test("Settings, Sign-in: domains, the switch, who has it, and a reset with its reason", async ({ page }) => {
      const state = await mock(page);
      await page.goto("/settings/sign-in");
      await expect(page.getByRole("heading", { name: "Sign-in", level: 1 })).toBeVisible();
      await expect(page.getByText("This install is for one organization.", { exact: false }).first()).toBeVisible();
      await expect(page.getByTestId("domains")).toContainText("example.org");
      await expect(page.getByText("2 invites are waiting.")).toBeVisible();
      await expect(page.getByTestId("people-2fa")).toContainText("Not set up");
      await expect(page.getByText("3 of 4 set up.", { exact: false })).toBeVisible();
      await expect(page.getByTestId("api-keys")).toContainText("Nightly report");
      await noSidewaysScroll(page);
      await shot(page, "sign-in-settings", width);

      // A public email service is refused with the server's words.
      state.refuse = { status: 400, error: "gmail.com is a public email service: allowing it would let anyone join. Invite those people instead." };
      await page.getByLabel("Let anyone with an email at").fill("gmail.com");
      await page.getByRole("button", { name: "Allow" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "public email service" })).toBeVisible();
      // A company domain is added.
      await page.getByLabel("Let anyone with an email at").fill("@Corp.Example.org");
      await page.getByRole("button", { name: "Allow" }).click();
      await expect.poll(() => state.puts.at(-1)).toEqual({ domains: ["example.org", "corp.example.org"] });

      // Require it: a confirmation that says how many will be held.
      await page.getByTestId("require-2fa").click();
      await expect(page.getByRole("alertdialog").or(page.getByRole("dialog"))).toContainText("1 person hasn't set it up yet");
      await shot(page, "sign-in-require-confirm", width);
      await page.getByRole("button", { name: "Require it" }).click();
      await expect.poll(() => state.puts.at(-1)).toEqual({ require_2fa: true });
      await expect(page.getByTestId("require-2fa")).toHaveAttribute("aria-checked", "true");

      // Reset needs a reason of 10+ characters; it goes with the request.
      const ann = page.getByTestId("people-2fa").getByRole("listitem").filter({ hasText: "Ann Lee" });
      await ann.getByRole("button", { name: "Reset" }).click();
      const dialog = page.getByTestId("reset-2fa-dialog");
      await expect(dialog).toContainText("Reset two-factor sign-in for Ann Lee?");
      await expect(dialog.getByRole("button", { name: "Reset" })).toBeDisabled();
      await dialog.getByLabel("How did you check it's them?").fill("Video call, saw their badge");
      await shot(page, "sign-in-reset", width);
      await dialog.getByRole("button", { name: "Reset" }).click();
      await expect.poll(() => state.resets).toEqual([{ user: "ann", body: { verified_how: "Video call, saw their badge" } }]);
      // Nobody resets their own.
      await expect(page.getByTestId("people-2fa").getByRole("listitem").filter({ hasText: "(you)" }).getByRole("button", { name: "Reset" })).toHaveCount(0);
    });

    test("the switch waits until your own session used a code", async ({ page }) => {
      await mock(page, {
        settings: {
          self_hosted: true, is_org: true, domains: [], require_2fa: false, require_2fa_since: null, pending_invites: 0,
          people: PEOPLE, api_keys: [], your_session_has_2fa: false,
        },
      });
      await page.goto("/settings/sign-in");
      await expect(page.getByTestId("domains-empty")).toContainText("only people you invite");
      await expect(page.getByTestId("require-2fa")).toBeDisabled();
      await expect(page.getByTestId("set-up-yours-first")).toBeVisible();
      await noSidewaysScroll(page);
    });

    test("a held session sees only the setup screen, and finishes it with a code", async ({ page }) => {
      const state = await mock(page, {
        me: { ...ME, email: "bo@example.org", role: "member", auth_provider: "github", mfa_enabled: false },
        mine: { self_hosted: true, required: true, held: true, session_has_2fa: false, signed_in_with: "github", set_up: null, fits: "app" },
      });
      await page.goto("/settings/security");
      const gate = page.getByTestId("two-factor-gate");
      await expect(gate.getByRole("heading", { name: "Set up two-factor sign-in" })).toBeVisible();
      await expect(gate).toContainText("Your organization requires two-factor sign-in.");
      // No menu, no app behind it.
      await expect(page.getByTestId("main-nav")).toHaveCount(0);
      await noSidewaysScroll(page);
      await shot(page, "two-factor-gate", width);

      await gate.getByRole("button", { name: "Set up an authenticator app" }).click();
      await expect(gate.getByText("JBSWY3DPEHPK3PXP")).toBeVisible();
      await expect(gate.getByRole("img", { name: "Code to scan with your authenticator app" })).toBeVisible();
      await shot(page, "two-factor-gate-scan", width);
      await gate.getByRole("button", { name: "Next: enter a code" }).click();
      await gate.getByLabel("Code from the app").fill("654321");
      await gate.getByRole("button", { name: "Turn on two-factor sign-in" }).click();
      await expect.poll(() => state.verified).toEqual(["654321"]);
      await expect(page.getByTestId("two-factor-gate")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Security", level: 1 })).toBeVisible();
    });

    test("a password account that already has it is asked to sign in again with the code", async ({ page }) => {
      await mock(page, {
        mine: { self_hosted: true, required: true, held: true, session_has_2fa: false, signed_in_with: "password", set_up: "cognito", fits: "cognito" },
      });
      await page.goto("/settings/security");
      const gate = page.getByTestId("two-factor-gate");
      await expect(gate.getByRole("heading", { name: "Sign in again with your code" })).toBeVisible();
      await expect(gate.getByRole("button", { name: "Sign out and sign in again" })).toBeVisible();
      await expect(gate.getByTestId("two-factor-setup")).toHaveCount(0);
      await shot(page, "two-factor-gate-again", width);
    });

    test("after Google or GitHub, the code screen; a wrong code is refused", async ({ page }) => {
      const state = await mock(page, { me: null });
      await page.goto("/settings/security?two_factor=1");
      const form = page.getByTestId("second-step");
      await expect(form).toContainText("Enter the code from your authenticator app to finish signing in.");
      await shot(page, "second-step", width);
      await form.getByLabel("Six digit code").fill("000000");
      await form.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByRole("alert").filter({ hasText: "That code didn't work." })).toBeVisible();
      await form.getByLabel("Six digit code").fill("123456");
      await form.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect.poll(() => state.verified).toEqual(["123456"]);
      await expect(page.getByRole("heading", { name: "Security", level: 1 })).toBeVisible();
    });

    test("someone who isn't invited reads why, with no waitlist or closed beta", async ({ page }) => {
      await mock(page, { me: null });
      await page.goto("/?error=not_invited");
      await expect(page.getByRole("alert").filter({ hasText: "private to one organization" })).toBeVisible();
      await expect(page.getByText("Closed beta")).toHaveCount(0);
      await expect(page.getByText("Join waitlist")).toHaveCount(0);
      await noSidewaysScroll(page);
      await shot(page, "not-invited", width);
      // Email sign-in says the same.
      await page.getByLabel("Email").fill("x@elsewhere.io");
      await page.getByLabel("Password").fill("Secret123!");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByRole("alert").filter({ hasText: "private to one organization" })).toBeVisible();
      // The sign-up form says it's one organization.
      await page.getByRole("button", { name: "Create account" }).click();
      await expect(page.getByTestId("signup-one-org")).toContainText("This Coderhelm is for one organization.");
    });
  });
}
