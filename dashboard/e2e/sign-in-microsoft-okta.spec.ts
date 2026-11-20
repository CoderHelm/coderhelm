import { expect, test, type Page, type Route } from "@playwright/test";

// Sign in with Microsoft and with Okta. The sign-in screen shows each button
// only when GET /auth/methods says it works here; Okta asks for the work
// email and posts it (in the body, never the address) to the API, which finds
// the organization's Okta. A failed trip comes back with a short code and
// reads as one plain sentence. Settings, Sign-in rules has the Okta form:
// the callback address to copy, Test sign-in, then Save. Every API call is
// answered here; nothing reaches Microsoft, Okta or a real backend.

type Methods = { password: boolean; google: boolean; github: boolean; microsoft?: boolean; okta?: boolean };

const ME = {
  user_id: "USER#owner",
  team_id: "TEAM#t1",
  github_login: null,
  email: "owner@example.org",
  avatar_url: "",
  role: "owner",
  auth_provider: "email",
  mfa_enabled: true,
};

const CALLBACK = "http://localhost:3111/auth/okta/callback";

type Okta = {
  callback_url: string;
  sign_in_redirect_uri: string;
  sign_out_redirect_uri: string;
  live: Record<string, unknown> | null;
  draft: Record<string, unknown> | null;
  self_hosted: boolean;
  domains?: { domain: string; txt_name: string; txt_value: string; verified_at: string | null; other_team: boolean }[];
};

interface State {
  signedIn: boolean;
  methods: Methods;
  okta: Okta;
  oktaPosts: { body: string; url: string }[];
  tests: Record<string, unknown>[];
  saves: Record<string, unknown>[];
  toggles: Record<string, unknown>[];
  verifies: number;
  /** Refuse the next POST /api/sign-in/okta/test with this error. */
  refuseTest?: string;
}

const EMPTY_OKTA: Okta = {
  callback_url: CALLBACK,
  sign_in_redirect_uri: CALLBACK,
  sign_out_redirect_uri: "http://localhost:3111",
  live: null,
  draft: null,
  self_hosted: false,
};

function setup(over: Record<string, unknown> = {}) {
  return {
    issuer: "https://acme.okta.com",
    client_id: "0oa1example",
    has_secret: true,
    domains: ["example.org"],
    enabled: false,
    tested_at: null,
    tested_email: null,
    updated_at: "2026-11-19T12:00:00Z",
    updated_by: "Olu Owner",
    ...over,
  };
}

async function mock(page: Page, over: Partial<State> = {}): Promise<State> {
  const state: State = {
    signedIn: false,
    methods: { password: true, google: true, github: true, microsoft: true, okta: true },
    okta: EMPTY_OKTA,
    oktaPosts: [],
    tests: [],
    saves: [],
    toggles: [],
    verifies: 0,
    ...over,
  };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const body = () => JSON.parse(req.postData() || "{}");
    if (p === "/auth/methods") return json(route, state.methods);
    // Okta's start is a form post: the email in the body, never the URL.
    if (p === "/auth/okta" && req.method() === "POST") {
      state.oktaPosts.push({ body: req.postData() || "", url: req.url() });
      return route.fulfill({ status: 200, contentType: "text/html", body: "<title>okta</title><h1>Your organization's Okta</h1>" });
    }
    if (p === "/auth/microsoft") {
      return route.fulfill({ status: 200, contentType: "text/html", body: "<title>microsoft</title><h1>Microsoft sign-in</h1>" });
    }
    if (p === "/auth/okta/test") {
      return route.fulfill({ status: 200, contentType: "text/html", body: "<title>okta test</title><h1>Okta test sign-in</h1>" });
    }
    if (p === "/api/me") return state.signedIn ? json(route, ME) : json(route, { error: "unauthorized" }, 401);
    if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "TEAM#t1", org: "Example", status: "active", current: true }] });
    if (p === "/api/users/2fa") return json(route, { self_hosted: false, required: false, held: false, session_has_2fa: true, signed_in_with: "password", set_up: "cognito", fits: "cognito" });
    if (p === "/api/sign-in" && req.method() === "GET") {
      return json(route, { self_hosted: false, is_org: true, domains: [], require_2fa: false, require_2fa_since: null, pending_invites: 0, people: [], without_2fa: 0, api_keys: [], your_session_has_2fa: true });
    }
    if (p === "/api/sign-in/okta" && req.method() === "GET") return json(route, state.okta);
    if (p === "/api/sign-in/okta/test") {
      const b = body();
      state.tests.push(b);
      if (state.refuseTest) {
        const error = state.refuseTest;
        state.refuseTest = undefined;
        return json(route, { error }, 400);
      }
      const draft = setup({ issuer: b.issuer, client_id: b.client_id, domains: b.domains });
      state.okta = { ...state.okta, draft };
      return json(route, { test_url: "http://localhost:3111/auth/okta/test?ticket=t1", draft });
    }
    if (p === "/api/sign-in/okta/domains/verify") {
      state.verifies += 1;
      state.okta = {
        ...state.okta,
        domains: (state.okta.domains ?? []).map((d) => ({ ...d, verified_at: "2026-11-19T12:06:00Z" })),
      };
      return json(route, state.okta);
    }
    if (p === "/api/sign-in/okta/save") {
      state.saves.push(body());
      state.okta = { ...state.okta, live: { ...(state.okta.draft as object), enabled: true }, draft: null };
      return json(route, state.okta);
    }
    if (p === "/api/sign-in/okta" && req.method() === "PUT") {
      const b = body();
      state.toggles.push(b);
      state.okta = { ...state.okta, live: { ...(state.okta.live as object), enabled: b.enabled } };
      return json(route, state.okta);
    }
    // Anything else a page asks for on its way: empty.
    return json(route, {});
  });
  return state;
}

const microsoft = (page: Page) => page.getByRole("link", { name: "Continue with Microsoft" });
const okta = (page: Page) => page.getByRole("button", { name: "Continue with Okta" });

/** Nothing on the page is wider than the window. */
async function noSidewaysScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(1);
}

test("only the ways in the API lists: no Microsoft or Okta button until it says so", async ({ page }) => {
  await mock(page, { methods: { password: true, google: true, github: true } });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
  await expect(microsoft(page)).toHaveCount(0);
  await expect(okta(page)).toHaveCount(0);

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await mock(page, { methods: { password: true, google: false, github: false, microsoft: true, okta: false } });
  await page.goto("/");
  await expect(microsoft(page)).toBeVisible();
  await expect(okta(page)).toHaveCount(0);
  // With only Microsoft, the "or" still separates it from the password form.
  await expect(page.getByText("or", { exact: true })).toBeVisible();
});

test("Microsoft starts at the API's /auth/microsoft", async ({ page }) => {
  await mock(page);
  await page.goto("/");
  await expect(microsoft(page)).toHaveAttribute("href", /\/auth\/microsoft$/);
  await microsoft(page).click();
  await expect(page.getByRole("heading", { name: "Microsoft sign-in" })).toBeVisible();
});

test("Okta asks for the work email and posts it in the body to the API", async ({ page }) => {
  const state = await mock(page);
  await page.goto("/");
  await okta(page).click();
  const form = page.getByTestId("okta-sign-in");
  await expect(form.getByRole("heading", { name: "Sign in with Okta" })).toBeVisible();
  await expect(form.getByRole("button", { name: "Continue to Okta" })).toBeDisabled();
  await form.getByLabel("Work email").fill("ada@example.org");
  await form.getByRole("button", { name: "Continue to Okta" }).click();
  await expect(page.getByRole("heading", { name: "Your organization's Okta" })).toBeVisible();
  expect(state.oktaPosts).toHaveLength(1);
  expect(new URLSearchParams(state.oktaPosts[0].body).get("email")).toBe("ada@example.org");
  expect(state.oktaPosts[0].url).not.toContain("ada");
});

test("Okta's form has a way back to the other ways in", async ({ page }) => {
  await mock(page);
  await page.goto("/");
  await okta(page).click();
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await expect(microsoft(page)).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});

const SENTENCES: [string, string, string, boolean][] = [
  [
    "no_verified_email",
    "microsoft",
    "Microsoft didn't share a verified email address for this account, so Coderhelm can't tell who you are. Ask your IT team to check the Coderhelm app's email claims, or sign in another way.",
    false,
  ],
  ["no_verified_email", "okta", "Okta didn't share a verified email address for this account. Ask your IT team, or sign in another way.", false],
  ["okta_not_found", "okta", "There's no Okta sign-in for that email here. Check the address, or sign in another way. An admin turns Okta on in Settings, Sign-in rules.", false],
  [
    "not_on_team",
    "okta",
    "Okta signed you in, but you aren't a member of the team that uses this Okta. Okta works only for people already on the team: accept your invite with your password, Google, GitHub or Microsoft first.",
    false,
  ],
  [
    "okta_team_only",
    "github",
    "You signed in with your team's Okta, which works for that team only, so it can't link another sign-in. Sign in with your password, Google, GitHub or Microsoft to do this.",
    false,
  ],
  ["not_set_up", "microsoft", "Microsoft sign-in isn't set up on this Coderhelm. Sign in with your email and password.", false],
  ["cancelled", "microsoft", "Sign-in with Microsoft was cancelled before it finished.", true],
  ["provider", "okta", "Okta didn't confirm your sign-in.", true],
];

for (const [code, provider, sentence, retry] of SENTENCES) {
  test(`${provider} ${code} reads as one plain sentence`, async ({ page }) => {
    await mock(page);
    await page.goto(`/?signin_error=${code}&provider=${provider}`);
    const notice = page.getByTestId("sign-in-problem");
    await expect(notice).toHaveText(new RegExp(`^${sentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    await expect(notice.getByRole("link", { name: "Try again" })).toHaveCount(retry ? 1 : 0);
    // The code leaves the address once read.
    await expect(page).toHaveURL(/\/$/);
  });
}

test("Try again after Okta goes back to the work email form, not to a GET of the API", async ({ page }) => {
  await mock(page);
  await page.goto("/?signin_error=expired&provider=okta");
  const again = page.getByTestId("sign-in-problem").getByRole("link", { name: "Try again" });
  await expect(again).toHaveAttribute("href", "/?okta=1");
  await again.click();
  await expect(page.getByTestId("okta-sign-in")).toBeVisible();
  // Microsoft's goes back to the API.
  await page.goto("/?signin_error=expired&provider=microsoft");
  await expect(page.getByTestId("sign-in-problem").getByRole("link", { name: "Try again" })).toHaveAttribute("href", /\/auth\/microsoft$/);
});

for (const width of [1440, 390]) {
  test(`at ${width}px the buttons fit and are big enough to tap`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    await mock(page);
    await page.goto("/");
    for (const b of [microsoft(page), okta(page)]) {
      await expect(b).toBeVisible();
      await expect(b).toBeInViewport({ ratio: 1 });
      const box = await b.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(40);
    }
    await noSidewaysScroll(page);
    await okta(page).click();
    await expect(page.getByLabel("Work email")).toBeInViewport({ ratio: 1 });
    await noSidewaysScroll(page);
  });
}

test.describe("Settings, Sign-in rules: Okta", () => {
  for (const width of [1440, 390]) {
    test(`at ${width}px: the callback to copy, Test sign-in, then Save`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      const state = await mock(page, { signedIn: true });
      await page.goto("/settings/sign-in");
      const section = page.getByTestId("okta-settings");
      await expect(section.getByTestId("okta-callback")).toHaveText(CALLBACK);
      await expect(section.getByRole("button", { name: "Copy" })).toBeVisible();
      // Hosted: the email domains are required.
      await expect(section.getByLabel("Email domains")).toHaveAttribute("required", "");
      await expect(section.getByRole("button", { name: "Save and turn on" })).toHaveCount(0);
      await noSidewaysScroll(page);

      await section.getByLabel("Okta domain or issuer").fill("acme.okta.com");
      await section.getByLabel("Client ID").fill("0oa1example");
      await section.getByLabel("Client secret").fill("s3cret-value");
      await section.getByLabel("Email domains").fill("example.org, example.net");
      await section.getByRole("button", { name: "Test sign-in" }).click();
      await expect(page.getByRole("heading", { name: "Okta test sign-in" })).toBeVisible();
      expect(state.tests).toEqual([
        { issuer: "acme.okta.com", client_id: "0oa1example", client_secret: "s3cret-value", domains: ["example.org", "example.net"] },
      ]);

      // Okta sends the admin back here with the outcome, and each domain shows its TXT record.
      state.okta = {
        ...state.okta,
        draft: setup({ tested_at: "2026-11-19T12:05:00Z", tested_email: "owner@example.org" }),
        domains: [{ domain: "example.org", txt_name: "_coderhelm-okta.example.org", txt_value: "coderhelm-okta=0123456789abcdef0123456789abcdef", verified_at: null, other_team: false }],
      };
      await page.goto("/settings/sign-in?okta_test=passed#okta");
      const domain = section.getByTestId("okta-domain");
      await expect(domain).toContainText("Not verified");
      await expect(domain).toContainText("_coderhelm-okta.example.org");
      await expect(domain).toContainText("coderhelm-okta=0123456789abcdef0123456789abcdef");
      await section.getByRole("button", { name: "Verify domains" }).click();
      await expect.poll(() => state.verifies).toBe(1);
      await expect(domain).toContainText("Verified");
      await expect(domain).not.toContainText("_coderhelm-okta.example.org");
      await expect(section.getByTestId("okta-test-passed")).toHaveText("Test sign-in passed as owner@example.org. Save to turn Okta sign-in on.");
      // The secret is never shown again; an empty box keeps it.
      await expect(section.getByLabel("Client secret")).toHaveValue("");
      await expect(section.getByText("Saved, and never shown again. Leave empty to keep it while the Okta domain and Client ID stay the same.")).toBeVisible();
      await section.getByRole("button", { name: "Save and turn on" }).click();
      await expect.poll(() => state.saves).toEqual([{ enabled: true }]);
      await expect(section.getByTestId("okta-live")).toContainText("On: https://acme.okta.com for example.org");
      await noSidewaysScroll(page);

      // Turning it off asks first.
      await section.getByTestId("okta-enabled").click();
      await page.getByRole("button", { name: "Turn off" }).click();
      await expect.poll(() => state.toggles).toEqual([{ enabled: false }]);
    });
  }

  test("a failed test reads as one sentence, and a refused draft says why", async ({ page }) => {
    const state = await mock(page, { signedIn: true, okta: { ...EMPTY_OKTA, draft: setup() } });
    await page.goto("/settings/sign-in?okta_test=failed&reason=token_exchange#okta");
    const section = page.getByTestId("okta-settings");
    await expect(section.getByTestId("okta-test-failed")).toHaveText(
      "Okta didn't accept the client ID and secret. Check both, and that the app's sign-in redirect URI is the address above.",
    );
    await expect(section.getByRole("button", { name: "Save and turn on" })).toHaveCount(0);
    // The draft's values are back in the form, the secret kept.
    await expect(section.getByLabel("Okta domain or issuer")).toHaveValue("https://acme.okta.com");
    state.refuseTest = "CoderHelm couldn't read the sign-in settings at https://acme.okta.com/.well-known/openid-configuration. Check the Okta domain or issuer.";
    await section.getByRole("button", { name: "Test sign-in" }).click();
    await expect(section.getByTestId("okta-error")).toContainText("couldn't read the sign-in settings");
    // An empty secret box sends no secret: the saved one is kept.
    expect(state.tests.at(-1)).not.toHaveProperty("client_secret");
  });
});
