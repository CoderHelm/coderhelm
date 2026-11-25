import { expect, test, type Page, type Route } from "@playwright/test";

// Scheduled skill runs: an admin schedules a synced skill, presses Run now,
// and reads the run's report on its page. Every API call is answered here;
// nothing reaches a real backend.

const REPORT = `<!doctype html><html><body><h1>Weekly visit count, 2026-11-30</h1>
<ul><li><b>/classes</b> grew from 120 to 400</li></ul><script>document.body.innerHTML = "scripts ran"</script></body></html>`;

interface Backend {
  schedules: Record<string, unknown>[];
  posted: Record<string, unknown>[];
  ran: string[];
  resolves: number;
  polls: number;
}

const SERVER = { id: "traffic-mcp", source: { kind: "git", repo: "acme/traffic-mcp", commit: "0123456789abcdef0123456789abcdef01234567" }, command: ["python3", "server.py"], aws_account: "111122223333", env: {} };
const RESOLUTION = {
  at: "2026-11-30T12:00:00Z",
  tools: [
    { name: "traffic_counts", source: "sandbox:traffic-mcp", tool: "traffic_counts", risk: "read", basis: "model", why: "looks up visit counts" },
    { name: "tag_page", source: "sandbox:traffic-mcp", tool: "tag_page", risk: "write", basis: "annotation", why: "" },
    { name: "set_banner", source: "sandbox:traffic-mcp", tool: "set_banner", risk: "consequential", basis: "annotation", why: "" },
  ],
  missing: [],
  servers: [SERVER],
  problems: [],
  memory: ["snapshots"],
};

async function mockApi(page: Page): Promise<Backend> {
  const db: Backend = { schedules: [], posted: [], ran: [], resolves: 0, polls: 0 };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: "admin", auth_provider: "email", mfa_enabled: false });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/skill-runs/options")
      return json(route, {
        skills: [{ repo: "acme/skills", path: "skills/visit-count/SKILL.md", name: "visit-count", description: "Weekly page-visit count", enabled: true }],
        servers: [{ id: "acme-traffic", name: "Traffic", kind: "remote" }],
        aws_accounts: [],
      });
    if (p === "/api/skill-runs/resolve" && method === "POST") {
      db.resolves += 1;
      return json(route, { id: "01DRAFT" });
    }
    // The worker answers on its second look, as it does after a moment.
    if (p === "/api/skill-runs/resolve/01DRAFT") {
      db.polls += 1;
      return json(route, { draft: { id: "01DRAFT", skill_repo: "acme/skills", skill_path: "skills/visit-count/SKILL.md", skill_name: "visit-count", done: db.polls > 1, resolution: db.polls > 1 ? RESOLUTION : null } });
    }
    if (p === "/api/skill-runs" && method === "GET") return json(route, { schedules: db.schedules, can_edit: true });
    if (p === "/api/skill-runs" && method === "POST") {
      const body = JSON.parse(req.postData() as string) as Record<string, unknown>;
      db.posted.push(body);
      const s = { ...body, id: "01SCHED", next_run: { at: "2026-11-30T12:23:00Z", label: "Mon 30 Nov 07:23 EST" } };
      db.schedules = [s];
      return json(route, { schedule: s });
    }
    if (p === "/api/skill-runs/01SCHED/run" && method === "POST") {
      db.ran.push("01SCHED");
      return json(route, { run_id: "01RUN" });
    }
    if (p === "/api/skill-runs/01SCHED/runs")
      return json(route, {
        runs: db.ran.length
          ? [{ run_id: "01RUN", schedule_id: "01SCHED", trigger: "manual", requested_by: "admin@example.com", status: "completed", started_at: "2026-11-30T12:23:00Z", finished_at: "2026-11-30T12:26:00Z", summary: "Report written", outputs: ["reports/2026-11-30.html", "snapshots/2026-11-30.json"], report: "reports/2026-11-30.html", needs_access: [], cost_usd: 0.4, tokens: 41000 }]
          : [],
      });
    if (p === "/api/runs/01RUN")
      return json(route, { run_id: "01RUN", team_id: "t_1", status: "completed", title: "Skill run: visit-count", ticket_source: "skill_run", ticket_id: "skill:01SCHED", created_at: "2026-11-30T12:23:00Z", updated_at: "2026-11-30T12:26:00Z", progress_notes: [{ message: "Ran count_visits.py build: exit 0", timestamp: "2026-11-30T12:25:00Z" }] });
    if (p === "/api/runs/01RUN/outputs") return json(route, { outputs: [{ name: "reports/2026-11-30.html", bytes: REPORT.length }, { name: "snapshots/2026-11-30.json", bytes: 120 }] });
    if (p === "/api/runs/01RUN/outputs/file" && url.searchParams.get("name") === "reports/2026-11-30.html")
      return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", headers: { "content-disposition": 'attachment; filename="2026-11-30.html"' }, body: REPORT });
    return json(route, { error: `not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

test("an admin picks a skill and a time, presses Run now and reads the run's report on its page", async ({ page }) => {
  const db = await mockApi(page);
  await page.goto("/skills/schedules/");
  await expect(page.getByRole("heading", { name: "Scheduled skill runs" })).toBeVisible();
  await expect(page.getByText("No schedules yet.")).toBeVisible();

  await page.getByRole("button", { name: "New schedule" }).click();
  const form = page.getByRole("form", { name: "Schedule" });
  await form.getByRole("combobox", { name: "Skill" }).click();
  await page.getByRole("option", { name: "visit-count (acme/skills)" }).click();
  await form.getByRole("textbox", { name: "Schedule", exact: true }).fill("23 7 * * MON");
  await form.getByRole("textbox", { name: "Time zone" }).fill("America/New_York");
  // The skill's tools are found for it: nothing to name or tick.
  const found = form.getByTestId("tools-found");
  await expect(found.getByTestId("tool-found")).toHaveCount(3);
  await expect(found.getByTestId("tool-found").nth(0)).toContainText("traffic_counts");
  await expect(found.getByTestId("tool-found").nth(0)).toContainText("acme/traffic-mcp at 0123456, in the run's sandbox");
  await expect(found.getByTestId("tool-found").nth(0)).toContainText("Reads");
  await expect(found.getByTestId("tool-found").nth(0)).toContainText("read from its description: looks up visit counts");
  await expect(found.getByTestId("tool-found").nth(1)).toContainText("Writes: refused");
  await expect(found.getByTestId("tool-found").nth(2)).toContainText("Never runs");
  await expect(found.getByTestId("tool-found").nth(2).getByRole("combobox")).toHaveCount(0);
  expect(db.resolves).toBe(1);
  await expect(form.getByRole("textbox", { name: "Memory folder" })).toHaveValue("snapshots");
  await form.getByRole("button", { name: "Save schedule" }).click();

  await expect(page.getByText("Schedule saved")).toBeVisible();
  expect(db.posted).toHaveLength(1);
  expect(db.posted[0]).toMatchObject({
    skill_repo: "acme/skills",
    skill_path: "skills/visit-count/SKILL.md",
    cron: "23 7 * * MON",
    timezone: "America/New_York",
    tools: [
      { name: "traffic_counts", server: "sandbox:traffic-mcp", tool: "" },
      { name: "tag_page", server: "sandbox:traffic-mcp", tool: "" },
      { name: "set_banner", server: "sandbox:traffic-mcp", tool: "" },
    ],
    stdio: [SERVER],
    auto_tools: true,
    state_dirs: ["snapshots"],
    allow_writes: false,
  });
  const card = page.getByTestId("schedule");
  await expect(card).toContainText("Next: Mon 30 Nov 07:23 EST");
  await expect(card).toContainText("read-only");

  // Run now opens the run's page; its report reads in place, scripts off.
  await card.getByRole("button", { name: "Run now" }).click();
  await expect(page).toHaveURL(/\/runs\/detail\/?\?id=01RUN/);
  expect(db.ran).toEqual(["01SCHED"]);
  const outputs = page.getByTestId("run-outputs");
  await expect(outputs.getByTestId("run-output")).toHaveCount(2);
  await outputs.getByRole("button", { name: "View" }).click();
  const frame = page.frameLocator('iframe[title="Report reports/2026-11-30.html"]');
  await expect(frame.getByRole("heading", { name: "Weekly visit count, 2026-11-30" })).toBeVisible();
  await expect(frame.getByText("/classes")).toBeVisible();
  await expect(frame.getByText("scripts ran")).toHaveCount(0);
  await expect(page.locator("iframe[data-testid=run-output-view]")).toHaveAttribute("sandbox", "");

  // The schedule's history links the run and its report.
  await page.goto("/skills/schedules/");
  await page.getByRole("button", { name: "Show runs" }).click();
  const runs = page.getByTestId("schedule-runs");
  await expect(runs).toContainText("Completed");
  await expect(runs.getByRole("link", { name: "View report" })).toHaveAttribute("href", /id=01RUN&output=reports%2F2026-11-30\.html#outputs/);
});
