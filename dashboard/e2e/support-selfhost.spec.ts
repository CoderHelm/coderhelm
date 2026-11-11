import { expect, test, type Page, type Route } from "@playwright/test";

// A self-hosted install's support tickets go to Coderhelm's support: the form
// says exactly what leaves the install, and a ticket says whether it got
// there ("Sending to Coderhelm…", sent, or why the install couldn't reach
// Coderhelm and the address to write to). Every API call is answered here.

const ME = {
  user_id: "u_1",
  team_id: "t_1",
  github_login: null,
  email: "ann@acme.dev",
  avatar_url: "",
  role: "owner",
  auth_provider: "email",
  mfa_enabled: true,
  platform_admin: false,
};

const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString();

function ticket(coderhelm?: Record<string, string>) {
  return {
    id: "01TICKET000000000000000001",
    team_id: "t_1",
    team_name: "acme",
    subject: "A run stopped before the pull request",
    status: "open",
    priority: "normal",
    opened_by_id: "u_1",
    opened_by_email: "ann@acme.dev",
    opened_by_name: "Ann",
    role: "owner",
    context: { page: "/runs/detail", item: null, items: [], user_agent: "" },
    created_at: iso(5),
    updated_at: iso(5),
    last_actor: "customer",
    message_count: 1,
    participants: [],
    last_snippet: "It stopped.",
    last_author_name: "Ann",
    ...(coderhelm ? { coderhelm } : {}),
  };
}

async function install(page: Page, selfHosted: boolean, coderhelm?: Record<string, string>) {
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.pathname === "/runtime-config.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.__CODERHELM_CONFIG__ = ${JSON.stringify({ apiUrl: "", streamUrl: "", selfHosted, siteUrl: null })};`,
    }),
  );
  await page.route((url) => !["localhost", "127.0.0.1"].includes(url.hostname), (route) => route.abort());
  await page.route((url) => ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/(api|auth)\//.test(url.pathname), (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/me") return json(route, ME);
    if (p === "/api/users/2fa") return json(route, { self_hosted: selfHosted, required: false, held: false, session_has_2fa: true, signed_in_with: "password", set_up: "cognito", fits: "cognito" });
    if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/users") return json(route, { users: [{ user_id: "USER#u_1", email: "ann@acme.dev", name: "Ann", role: "owner", avatar_url: "" }] });
    // Security is off: no count beside it in the sidebar.
    if (p === "/api/security/overview") return json(route, { enabled: false, dry_run: true, counts: { open: 0, p0: 0, p1: 0 } });
    if (p === "/api/setup") return json(route, { repos: [], new_recommendations: [], auto_setup_new_repos: false });
    if (p === "/api/support/badge") return json(route, { waiting: 0 });
    if (p === "/api/support/tickets") return json(route, { tickets: [ticket(coderhelm)] });
    if (p.startsWith("/api/support/tickets/")) {
      return json(route, {
        ticket: ticket(coderhelm),
        messages: [{ id: "01M", kind: "message", author: "customer", author_email: "ann@acme.dev", author_name: "Ann", body: "It stopped.", created_at: iso(5) }],
        avatars: {},
      });
    }
    return json(route, {});
  });
}

test("a self-hosted install's form says what goes to Coderhelm support", async ({ page }) => {
  await install(page, true);
  await page.goto("/support?new=1");
  const sent = page.getByTestId("ticket-attached");
  await expect(sent.getByRole("heading", { name: "Sent to Coderhelm support" })).toBeVisible();
  await expect(page.getByTestId("ticket-sent-to-coderhelm")).toContainText("Your message, your name and email");
  await expect(page.getByTestId("ticket-sent-to-coderhelm")).toContainText("a run's error and step");
});

test("the hosted service's form keeps its own words", async ({ page }) => {
  await install(page, false);
  await page.goto("/support?new=1");
  await expect(page.getByTestId("ticket-attached").getByRole("heading", { name: "Sent with your ticket" })).toBeVisible();
  await expect(page.getByTestId("ticket-sent-to-coderhelm")).toHaveCount(0);
});

test("a ticket the install couldn't send says why, and where to write", async ({ page }) => {
  await install(page, true, { state: "sending", error: "Coderhelm's servers didn't answer" });
  await page.goto("/support/ticket?id=01TICKET000000000000000001");
  const d = page.getByTestId("ticket-delivery");
  await expect(d).toHaveAttribute("data-state", "sending");
  await expect(d).toContainText("Not sent to Coderhelm yet");
  await expect(d).toContainText("Coderhelm's servers didn't answer");
  await expect(d).toContainText("support@coderhelm.com");

  await page.goto("/support");
  await expect(page.getByTestId("support-ticket-row")).toContainText("Sending to Coderhelm…");
});

test("a ticket that reached Coderhelm says so; the hosted service shows nothing", async ({ page }) => {
  await install(page, true, { state: "sent", sent_at: iso(4) });
  await page.goto("/support/ticket?id=01TICKET000000000000000001");
  await expect(page.getByTestId("ticket-delivery")).toHaveText("Sent to Coderhelm support. Its answers come here and by email.");

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await install(page, false);
  await page.goto("/support/ticket?id=01TICKET000000000000000001");
  await expect(page.getByRole("heading", { name: "A run stopped before the pull request" })).toBeVisible();
  await expect(page.getByTestId("ticket-delivery")).toHaveCount(0);
});
