import { expect, test, type Page, type Route } from "@playwright/test";

// A repository's preview access (its address template and the secret a
// protected preview takes), from Settings > Repositories.
// Every API call is answered here; nothing reaches a real backend.

interface Backend {
  role: string;
  saved: Record<string, unknown> | null;
  calls: { method: string; path: string; body: Record<string, unknown> | null }[];
}

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = { role: "admin", saved: null, calls: [], ...init };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route(
    (url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname),
    async (route) => {
      const req = route.request();
      const p = new URL(req.url()).pathname;
      const method = req.method();
      const body = req.postData() ? (JSON.parse(req.postData() as string) as Record<string, unknown>) : null;
      db.calls.push({ method, path: p, body });
      if (p === "/api/me")
        return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "person@example.com", avatar_url: "", role: db.role, auth_provider: "email", mfa_enabled: false });
      if (p === "/api/banners") return json(route, { banners: [] });
      if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
      if (p === "/api/repos")
        return json(route, { repos: [{ name: "your-team/web", enabled: true, ticket_source: "github", onboard_status: "ready" }, { name: "your-team/api", enabled: false, ticket_source: "github" }] });
      if (p === "/api/github/installation-status") return json(route, { status: "connected", github_org: "your-team", installation_id: 7 });
      if (p === "/api/repos/your-team/web/preview-access") {
        if (method === "GET") return json(route, db.saved ?? { configured: false, repo: "your-team/web" });
        if (method === "PUT") {
          db.saved = { configured: true, repo: "your-team/web", kind: body?.kind, address: body?.address, secret_set: body?.kind !== "none" };
          return json(route, db.saved);
        }
        if (method === "DELETE") {
          db.saved = null;
          return json(route, { configured: false, repo: "your-team/web" });
        }
      }
      return json(route, { error: `not mocked: ${method} ${p}` }, 404);
    },
  );
  return db;
}

test("an admin saves a preview address and a header secret that is never shown again", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/settings/repos/");
  await page.getByRole("button", { name: "Preview access for your-team/web" }).click();
  const dialog = page.getByTestId("preview-access-dialog");
  await expect(dialog).toBeVisible();
  // A fixed address is a shared environment, never a pull request's own.
  await dialog.getByLabel(/Preview address/).fill("https://staging.your-domain.example");
  await expect(dialog.getByText(/needs \{pr\}/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
  await dialog.getByLabel(/Preview address/).fill("https://pr-{pr}.preview.your-domain.example");
  await dialog.getByLabel("How the preview is protected").click();
  await page.getByRole("option", { name: /A header/ }).click();
  await dialog.getByLabel("Header name", { exact: true }).fill("X-Preview-Bypass");
  await dialog.getByLabel("Value").first().fill("s3cr3t-value");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  const put = db.calls.find((c) => c.method === "PUT");
  expect(put?.body).toMatchObject({ kind: "header", address: "https://pr-{pr}.preview.your-domain.example", secret: "X-Preview-Bypass: s3cr3t-value" });
  await page.getByRole("button", { name: "Preview access for your-team/web" }).click();
  await expect(dialog.getByLabel("Value").first()).toHaveValue("");
  await expect(dialog.getByRole("button", { name: "Remove" })).toBeVisible();
});

test("a member sees no preview access button", async ({ page }) => {
  await mockApi(page, { role: "member" });
  await page.goto("/settings/repos/");
  await expect(page.getByRole("list", { name: "Repositories" }).getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Preview access for/ })).toHaveCount(0);
});

for (const width of [375, 1440]) {
  test(`the preview access dialog has no horizontal scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page);
    await page.goto("/settings/repos/");
    await page.getByRole("button", { name: "Preview access for your-team/web" }).click();
    await expect(page.getByTestId("preview-access-dialog")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
