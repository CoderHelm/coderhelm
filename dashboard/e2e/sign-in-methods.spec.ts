import { expect, test, type Page, type Route } from "@playwright/test";

// The sign-in screen shows only the ways in that work on this deployment, as
// the API's GET /auth/methods says. A self-hosted install offers GitHub with
// an OAuth client of its own, or on Coderhelm's GitHub App (hybrid) once it is
// registered: the same /auth/github then goes through Coderhelm's app and the
// install checks the account itself. An install with neither shows no GitHub
// button. Every API call is answered here.

type Methods = { password: boolean; google: boolean; github: boolean; senders?: { setup: string | null; reset_codes: string | null } };
type ForgotReply = { status: string; message: string; email?: string };

async function mockApi(page: Page, opts: { selfHosted: boolean; methods: Methods | "missing"; status?: string; forgot?: ForgotReply }) {
  const calls: string[] = [];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (opts.selfHosted) {
    await page.route((url) => url.pathname === "/runtime-config.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `window.__CODERHELM_CONFIG__ = ${JSON.stringify({ apiUrl: "", streamUrl: "", selfHosted: true, siteUrl: null, supportEmail: "it@acme.example" })};`,
      }),
    );
  }
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), (route) => {
    const p = new URL(route.request().url()).pathname;
    calls.push(p);
    if (p === "/auth/methods") return opts.methods === "missing" ? json(route, { error: "Not found" }, 404) : json(route, opts.methods);
    if (p === "/api/me") {
      return opts.status
        ? json(route, { user_id: "u_1", team_id: "t_1", github_login: "a-dev", email: "dev@acme.example", avatar_url: "", role: "owner", status: opts.status })
        : json(route, { error: "unauthorized" }, 401);
    }
    if (p === "/auth/forgot-password" && opts.forgot) return json(route, opts.forgot);
    if (p === "/auth/signup") return json(route, { status: "verification_required", message: "If that email can join here, we've sent a verification code." });
    if (p === "/api/usage") return json(route, { month: "2026-01", tokens_in: 0, tokens_out: 0, total_runs: 0, total_tokens: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "deactivated", current: true }] });
    return json(route, { error: "Not mocked" }, 404);
  });
  return { calls };
}

const github = (page: Page) => page.getByRole("link", { name: "Continue with GitHub" });
const google = (page: Page) => page.getByRole("link", { name: "Continue with Google" });

test("self-hosted install with no way to GitHub: email and password only, no GitHub button and no 'or'", async ({ page }) => {
  const { calls } = await mockApi(page, { selfHosted: true, methods: { password: true, google: false, github: false } });
  await page.goto("/");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect.poll(() => calls.includes("/auth/methods")).toBe(true);
  await expect(github(page)).toHaveCount(0);
  await expect(google(page)).toHaveCount(0);
  await expect(page.getByTestId("sign-in-providers")).toHaveCount(0);
  await expect(page.getByText("or", { exact: true })).toHaveCount(0);
});

test("self-hosted install with its own GitHub client: the GitHub button goes to the API's sign-in", async ({ page }) => {
  await mockApi(page, { selfHosted: true, methods: { password: true, google: false, github: true } });
  await page.goto("/");
  await expect(github(page)).toBeVisible();
  await expect(github(page)).toHaveAttribute("href", /^\/auth\/github$/);
  await expect(google(page)).toHaveCount(0);
  await expect(page.getByText("or", { exact: true })).toBeVisible();
});

test("hybrid install registered with Coderhelm: GitHub is offered and starts at the install's own /auth/github", async ({ page }) => {
  const { calls } = await mockApi(page, { selfHosted: true, methods: { password: true, google: false, github: true } });
  await page.goto("/");
  await expect.poll(() => calls.includes("/auth/methods")).toBe(true);
  await expect(github(page)).toBeVisible();
  // The install's API starts the trip (it then goes through Coderhelm's app),
  // never a Coderhelm address in the page itself.
  await expect(github(page)).toHaveAttribute("href", "/auth/github");
  await expect(github(page)).not.toHaveAttribute("href", /coderhelm\.com/);
  await expect(google(page)).toHaveCount(0);
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("self-hosted install whose API has no method list yet: no GitHub button", async ({ page }) => {
  await mockApi(page, { selfHosted: true, methods: "missing" });
  await page.goto("/");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(github(page)).toHaveCount(0);
});

test("hosted: the list drives both buttons, and an older API keeps both", async ({ page }) => {
  await mockApi(page, { selfHosted: false, methods: { password: true, google: true, github: true } });
  await page.goto("/");
  await expect(google(page)).toBeVisible();
  await expect(github(page)).toHaveAttribute("href", /\/auth\/github$/);

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await mockApi(page, { selfHosted: false, methods: { password: true, google: true, github: false } });
  await page.goto("/");
  await expect(google(page)).toBeVisible();
  await expect(github(page)).toHaveCount(0);

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await mockApi(page, { selfHosted: false, methods: "missing" });
  await page.goto("/");
  await expect(google(page)).toBeVisible();
  await expect(github(page)).toBeVisible();
});

test("GET /auth/github with no client lands back here with a plain sentence and no Try again", async ({ page }) => {
  await mockApi(page, { selfHosted: true, methods: { password: true, google: false, github: false } });
  await page.goto("/?signin_error=not_set_up&provider=github");
  const notice = page.getByTestId("sign-in-problem");
  await expect(notice).toContainText("GitHub sign-in isn't set up on this Coderhelm. Sign in with your email and password.");
  await expect(notice.getByRole("link", { name: "Try again" })).toHaveCount(0);
  await expect(notice.getByRole("button", { name: "Copy the link" })).toHaveCount(0);
  await expect(github(page)).toHaveCount(0);
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("removed GitHub app: 'sign in with GitHub again' only where GitHub sign-in works", async ({ page }) => {
  await mockApi(page, { selfHosted: true, methods: { password: true, google: false, github: false }, status: "deactivated" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "The GitHub app was removed" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Then sign in with GitHub again" })).toHaveCount(0);

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await mockApi(page, { selfHosted: true, methods: { password: true, google: false, github: true }, status: "deactivated" });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Then sign in with GitHub again" })).toHaveAttribute("href", /^\/auth\/github$/);
});

// Forgot password gives one answer for every email, so the page can't be used to learn who has
// an account here or is on the team. It names both senders, so someone whose mail filter holds
// one back can ask IT to allow it.
const SENDERS = { setup: "coderhelm@acme.example", reset_codes: "no-reply@verificationemail.com" };

async function askForReset(page: Page, email: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

/** The page's error box (not Next's route announcer, which is an alert too). */
const errorBox = (page: Page) => page.getByTestId("auth-error");

/** What the page shows after asking: the message, the sender lines, and what comes next. */
async function shown(page: Page) {
  await expect(page.getByLabel("Reset code")).toBeVisible();
  return {
    message: await page.getByRole("status").innerText(),
    senders: await page.getByTestId("sender-note").locator("p").allInnerTexts(),
    setupNote: await page.getByTestId("setup-link-instead").innerText(),
    errors: await errorBox(page).count(),
  };
}

// Whatever a server answers (the one `sent`, or a per-case status an older gateway gave), the
// page reads the same: has an account, on the team without one, invited, not on this install.
const REPLIES: ForgotReply[] = [
  { status: "sent", message: "If that email can sign in here, we've sent a reset code or a set-up link." },
  { status: "code_sent", message: "We sent a reset code to jo@acme.example.", email: "jo@acme.example" },
  { status: "setup_sent", message: "You don't have an account here yet. We sent you a set-up link instead." },
  { status: "invited", message: "jo@acme.example has an invite here but no account yet." },
  { status: "no_account", message: "There's no account for jo@acme.example on this CoderHelm. Ask an admin to add you." },
];

test("forgot password: the same message, senders and next step for every case", async ({ page }) => {
  const seen = [];
  for (const forgot of REPLIES) {
    const { calls } = await mockApi(page, {
      selfHosted: true,
      methods: { password: true, google: false, github: false, senders: SENDERS },
      forgot,
    });
    await askForReset(page, "jo@acme.example");
    seen.push(await shown(page));
    expect(calls).toContain("/auth/forgot-password");
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
  expect(seen[0]).toEqual({
    message: "If jo@acme.example can sign in here, we've sent a reset code or a set-up link.",
    senders: [
      "Reset codes come from no-reply@verificationemail.com (Amazon Cognito, which signs people in here).",
      "Set-up links come from coderhelm@acme.example.",
      "Not in your inbox after a few minutes? Check spam or quarantine, or ask IT to allow those addresses.",
    ],
    setupNote: "Got a set-up link instead of a code? There's no code to enter: open the link in that email to set up your account.",
    errors: 0,
  });
  for (const s of seen) expect(s).toEqual(seen[0]);
});

test("forgot password with an SES sender for Cognito: that address, not Cognito's", async ({ page }) => {
  await mockApi(page, {
    selfHosted: true,
    methods: { password: true, google: false, github: false, senders: { setup: "coderhelm@acme.example", reset_codes: "noreply@acme.example" } },
    forgot: REPLIES[0],
  });
  await askForReset(page, "jo@acme.example");
  await expect(page.getByTestId("sender-note")).toContainText("Reset codes come from noreply@acme.example.");
  await expect(page.getByTestId("sender-note")).not.toContainText("Amazon Cognito");
});

test("self-hosted sign-up from an invite link: one answer, whoever the email is", async ({ page }) => {
  const { calls } = await mockApi(page, { selfHosted: true, methods: { password: true, google: false, github: false, senders: SENDERS } });
  await page.goto("/?invite=1");
  await page.getByLabel("Email").fill("jo@acme.example");
  await page.getByLabel("Password, at least 8 characters").fill("Acme2026x");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "If jo@acme.example can join here, we've sent a verification code. No code after a few minutes? If you already have an account, sign in or use Forgot password; otherwise ask an admin to invite you.",
  );
  await expect(page.getByLabel("Verification code")).toBeVisible();
  await expect(errorBox(page)).toHaveCount(0);
  expect(calls).toContain("/auth/signup");
});
