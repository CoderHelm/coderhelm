import { expect, test, type Page, type Route } from "@playwright/test";
import { shoot } from "./infra-shots";

// Security policy, Infrastructure: the Amazon Inspector switch with its cost,
// and AWS Health as off, its API (Business Support or higher) or an
// EventBridge rule, whose template downloads from the install. Each change
// saves at once with exactly the body the gateway takes.

const POLICY = {
  enabled: true, dry_run: false,
  open_prs: { P0: "now", P1: "hour", P2: "daily", P3: "weekly" },
  post_alerts: { P0: true, P1: true, P2: false, P3: false }, escalate_half: true,
  due_days: { P0: 3, P1: 7, P2: 30, P3: 90 }, use_kev_due: true,
  labels: ["security"], severity_labels: true, reachability_labels: true, ecosystem_labels: true,
  major_bumps: "fix_in_pr", adopt_bot_prs: true, repos: "all", ignore: [],
  max_fix_runs_per_day: 3, max_fix_tokens_per_day: 2_000_000, triage_tokens_per_day: 400_000, max_cards_per_day: 10,
};

async function mockApi(page: Page, role = "admin", configCode = 200) {
  const db = { config: { inspector: false, health: "off" }, puts: [] as unknown[], templates: 0 };
  const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (r) => r.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (r) => {
    const req = r.request();
    const p = new URL(req.url()).pathname;
    if (p === "/api/me") return json(r, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role });
    if (p === "/api/usage") return json(r, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(r, { banners: [] });
    if (p === "/api/teams") return json(r, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/repos") return json(r, { repos: [{ name: "acme/infra" }] });
    if (p === "/api/security/config") return json(r, { config: POLICY, defaults: POLICY });
    if (p === "/api/security/infrastructure/config" && req.method() === "GET") {
      if (configCode !== 200) return json(r, { error: "not found" }, configCode);
      return json(r, {
        config: db.config,
        inspector_cost: "Billed by AWS: about $1.25 per instance a month, $0.09 per image scan and $0.30 per function a month.",
        health_plan: "The Health API needs AWS Business Support or higher. Without it, use the EventBridge rule.",
      });
    }
    if (p === "/api/security/infrastructure/config" && req.method() === "PUT") {
      const body = req.postDataJSON() as typeof db.config;
      db.puts.push(body);
      db.config = body;
      return json(r, { config: body });
    }
    if (p === "/api/security/infrastructure/health-template") {
      db.templates += 1;
      return r.fulfill({ status: 200, contentType: "text/yaml", body: "AWSTemplateFormatVersion: \"2010-09-09\"\nResources: {}\n" });
    }
    return json(r, { error: `not mocked: ${p}` }, 404);
  });
  return db;
}

test("Inspector and Health save at once, with the cost, the plan and the EventBridge template", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/security/policy");
  const section = page.getByTestId("infra-policy");
  await expect(section).toBeVisible();
  await expect(page.getByTestId("inspector-cost")).toContainText("$1.25 per instance a month, $0.09 per image scan and $0.30 per function a month");
  await expect(page.getByTestId("health-plan")).toContainText("Business Support or higher");

  await page.getByTestId("infra-inspector").click();
  await expect.poll(() => db.puts).toContainEqual({ inspector: true, health: "off" });
  await expect(page.getByTestId("infra-inspector")).toBeChecked();

  await expect(page.getByTestId("health-template")).toHaveCount(0);
  await page.getByTestId("health-eventbridge").click();
  await expect.poll(() => db.puts).toContainEqual({ inspector: true, health: "eventbridge" });
  await expect(page.getByTestId("health-eventbridge")).toHaveAttribute("aria-checked", "true");
  const note = page.getByTestId("health-template");
  await expect(note).toContainText("upload it in CloudFormation in each account. It only lets the read-only role receive Health events.");
  const download = page.waitForEvent("download");
  await page.getByTestId("health-download").click();
  expect((await download).suggestedFilename()).toBe("coderhelm-health-events.yaml");
  expect(db.templates).toBe(1);

  await page.getByTestId("health-api").click();
  await expect.poll(() => db.puts.at(-1)).toEqual({ inspector: true, health: "api" });
  await page.getByTestId("health-eventbridge").click();
  await section.scrollIntoViewIfNeeded();
  await shoot(page, "security-policy-infrastructure");
});

test("a member reads the settings but can't change them; an older server shows nothing", async ({ page }) => {
  await mockApi(page, "member");
  await page.goto("/security/policy");
  await expect(page.getByTestId("infra-inspector")).toBeDisabled();
  await expect(page.getByTestId("health-api")).toBeDisabled();
});

test("an install without these settings leaves the section out", async ({ page }) => {
  await mockApi(page, "admin", 404);
  await page.goto("/security/policy");
  await expect(page.getByRole("heading", { name: "Security policy" })).toBeVisible();
  await expect(page.getByTestId("sec-enabled")).toBeVisible();
  await expect(page.getByTestId("infra-policy")).toHaveCount(0);
});
