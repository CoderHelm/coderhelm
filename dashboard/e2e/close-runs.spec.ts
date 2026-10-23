import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Closing runs on purpose: one from its page (a button, the More menu or ⌘K),
// several from the runs list, and reopening. Every API call is answered here;
// nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

type Run = Record<string, unknown> & { run_id: string; status: string; title: string };

function run(over: Partial<Run> & { run_id: string }): Run {
  return {
    status: "completed",
    ticket_source: "jira",
    ticket_id: "ABC-1",
    title: "Fix the login page",
    repo: "your-team/web",
    pr_url: null,
    pr_number: null,
    cost_usd: 1,
    tokens_in: 10,
    tokens_out: 10,
    duration_s: 120,
    current_pass: "review",
    created_at: iso(10),
    updated_at: iso(5),
    ...over,
  };
}

interface Backend {
  runs: Run[];
  role: string;
  calls: string[];
  bodies: Record<string, unknown>[];
  /** Run ids the bulk close refuses, with the reason. */
  refuse: Record<string, string>;
}

const OVER = ["closed", "cancelled", "merged", "retried", "archived"];

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = {
    role: "member",
    calls: [],
    bodies: [],
    refuse: {},
    runs: [
      run({ run_id: "01RUNA", status: "running", ticket_id: "ABC-1", title: "Fix the login page", pr_number: 41, pr_url: "https://github.com/your-team/web/pull/41", created_at: iso(1) }),
      run({ run_id: "01RUNB", status: "needs_input", ticket_id: "ABC-2", title: "Retry the payment client", created_at: iso(2) }),
      run({ run_id: "01RUNC", status: "completed", ticket_id: "ABC-3", title: "Move nightly jobs", pr_number: 43, pr_url: "https://github.com/your-team/web/pull/43", created_at: iso(3) }),
      run({ run_id: "01RUND", status: "merged", ticket_id: "ABC-4", title: "Shipped already", pr_number: 44, created_at: iso(4) }),
      run({ run_id: "01RUNE", status: "closed", ticket_id: "ABC-5", title: "Closed before", closed_by: "A Teammate", close_reason: "Not needed", closed_at: iso(60), closed_from: "failed", created_at: iso(5) }),
    ],
    ...init,
  };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const close = (r: Run, body: Record<string, unknown>) => {
    if (r.status === "closed") return { run_id: r.run_id, outcome: "already_closed", message: "It was closed already." };
    if (OVER.includes(r.status)) return { run_id: r.run_id, outcome: "refused", message: "Not closed: Its pull request merged already." };
    if (db.refuse[r.run_id]) return { run_id: r.run_id, outcome: "refused", message: db.refuse[r.run_id] };
    Object.assign(r, {
      closed_from: r.status,
      status: "closed",
      closed_by: "Sam Lee",
      close_reason: body.reason ?? null,
      closed_at: new Date().toISOString(),
    });
    return { run_id: r.run_id, outcome: "closed", message: "Closed.", ...(body.close_pr && r.pr_number ? { prs_closed: [r.pr_number] } : {}) };
  };
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    db.calls.push(`${req.method()} ${p}${url.search}`);
    const body = req.postData() ? (JSON.parse(req.postData()!) as Record<string, unknown>) : {};
    if (req.method() === "POST") db.bodies.push({ path: p, ...body });
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: "sam", email: "sam@example.com", avatar_url: "", role: db.role });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "your-team/web", enabled: true, ticket_source: "jira" }] });
    if (p === "/api/plugins/catalog") return json(route, { plugins: [] });
    if (p === "/api/search") return json(route, { q: url.searchParams.get("q"), runs: [], reviews: [], releases: [], plans: [] });
    if (p === "/api/runs" && req.method() === "GET") {
      const status = url.searchParams.get("status");
      const runs = db.runs.filter((r) => !status || status.split(",").includes(r.status));
      return json(route, { runs, next: null });
    }
    if (p === "/api/runs/close" && req.method() === "POST") {
      const ids = (body.run_ids as string[]) ?? [];
      const results = ids.map((id) => {
        const r = db.runs.find((x) => x.run_id === id);
        return r ? close(r, body) : { run_id: id, outcome: "not_found", message: "No such run on this team." };
      });
      const n = (o: string) => results.filter((r) => r.outcome === o).length;
      return json(route, { results, closed: n("closed"), already_closed: n("already_closed"), failed: results.length - n("closed") - n("already_closed") });
    }
    const m = p.match(/^\/api\/runs\/([^/]+)(?:\/(.+))?$/);
    if (m) {
      const r = db.runs.find((x) => x.run_id === decodeURIComponent(m[1]));
      if (!r) return json(route, { error: "not found" }, 404);
      const action = m[2];
      if (!action) return json(route, { ...r, pass_history: [], progress_notes: [] });
      if (action === "close") {
        const result = close(r, body);
        return json(route, result, result.outcome === "refused" ? 409 : 200);
      }
      if (action === "reopen") {
        if (r.status !== "closed") return json(route, { message: "It isn't closed." }, 409);
        const from = String(r.closed_from ?? "");
        r.status = ["pending", "queued", "running", "awaiting_ci", ""].includes(from) ? "needs_input" : from;
        delete r.closed_by;
        delete r.close_reason;
        delete r.closed_at;
        return json(route, { status: r.status, message: "Reopened." });
      }
      if (action === "openspec") return json(route, {});
      if (action === "traces") return json(route, { traces: [] });
      if (action === "agent-log") return json(route, { passes: [], live_events: [] });
      if (action === "asks") return json(route, { asks: [] });
    }
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true });
}

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("closing one run", () => {
  test("a running run closes from its button with a reason; the PR stays open unless ticked", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/runs/detail?id=01RUNA");
    await expect(page.getByRole("heading", { name: "Fix the login page" })).toBeVisible();
    await page.getByRole("button", { name: "Close run" }).click();

    const dialog = page.getByRole("dialog", { name: "Close this run?" });
    await expect(dialog).toBeVisible();
    const prBox = dialog.getByRole("checkbox", { name: /Also close PR #41 on GitHub/ });
    await expect(prBox).not.toBeChecked();
    await dialog.getByRole("radio", { name: "Duplicate" }).check();
    await dialog.getByRole("textbox", { name: /Note/ }).fill("Same as ABC-9");
    await shot(page, "close-run-dialog");
    await dialog.getByRole("button", { name: "Close run" }).click();

    await expect(dialog).toBeHidden();
    const sent = db.bodies.find((b) => b.path === "/api/runs/01RUNA/close");
    expect(sent).toMatchObject({ reason: "Duplicate: Same as ABC-9", close_pr: false });
    const note = page.getByTestId("closed-note");
    await expect(note).toContainText("Closed by Sam Lee");
    await expect(note).toContainText("Duplicate: Same as ABC-9");
    await expect(page.getByText("Closed", { exact: true }).first()).toBeVisible();
    // Closed: no Close button, and no re-review that would set it running again.
    await expect(page.getByRole("button", { name: "Close run" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Review again" })).toHaveCount(0);
    await shot(page, "run-closed");
  });

  test("ticking the box closes the PR too", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/runs/detail?id=01RUNA");
    await page.getByRole("button", { name: "Close run" }).click();
    const dialog = page.getByRole("dialog", { name: "Close this run?" });
    await dialog.getByRole("checkbox", { name: /Also close PR #41/ }).check();
    await dialog.getByRole("button", { name: "Close run" }).click();
    await expect(page.getByTestId("closed-note")).toBeVisible();
    expect(db.bodies.find((b) => b.path === "/api/runs/01RUNA/close")).toMatchObject({ close_pr: true, reason: "Not needed" });
  });

  test("a finished run closes from More, and from ⌘K on its page", async ({ page }) => {
    await mockApi(page);
    await page.goto("/runs/detail?id=01RUNC");
    await expect(page.getByRole("heading", { name: "Move nightly jobs" })).toBeVisible();
    // Not a button for a finished run: it sits in More.
    await expect(page.getByRole("button", { name: "Close run", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Close run…" }).click();
    await expect(page.getByRole("dialog", { name: "Close this run?" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Close this run?" })).toBeHidden();

    await page.keyboard.press("Control+k");
    const palette = page.getByTestId("command-palette");
    await expect(palette).toBeVisible();
    await page.keyboard.type("close this");
    await palette.getByRole("option", { name: /Close this run/ }).click();
    await expect(palette).toBeHidden();
    await expect(page.getByRole("dialog", { name: "Close this run?" })).toBeVisible();
  });

  test("Reopen shows the run as it was, without restarting it", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/runs/detail?id=01RUNE");
    const note = page.getByTestId("closed-note");
    await expect(note).toContainText("Closed by A Teammate");
    await expect(note).toContainText("Not needed");
    await note.getByRole("button", { name: "Reopen" }).click();
    await expect(note).toBeHidden();
    expect(db.calls).toContain("POST /api/runs/01RUNE/reopen");
    // It was failed when closed: it is failed again, and Retry is offered.
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    expect(db.calls.some((c) => c.startsWith("POST /api/runs/01RUNE/retry"))).toBe(false);
  });

  test("a run that is over already offers no close, and viewers never see it", async ({ page }) => {
    await mockApi(page);
    await page.goto("/runs/detail?id=01RUND");
    await expect(page.getByRole("heading", { name: "Shipped already" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Close run/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "More" })).toHaveCount(0);

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await mockApi(page, { role: "viewer" });
    await page.goto("/runs/detail?id=01RUNA");
    await expect(page.getByRole("heading", { name: "Fix the login page" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Close run/ })).toHaveCount(0);
  });
});

test.describe("closing several runs", () => {
  test("shift-click picks a range; a refused run is listed while the rest close", async ({ page }) => {
    const db = await mockApi(page, { refuse: { "01RUNB": "Not closed: It changed while closing. Try again." } });
    await page.goto("/");
    const rows = page.getByTestId("run-row");
    await expect(rows).toHaveCount(5);

    // Labelled checkboxes; runs that are over already can't be picked.
    await expect(page.getByRole("checkbox", { name: "Select Shipped already" })).toBeDisabled();
    await expect(page.getByRole("checkbox", { name: "Select Closed before" })).toBeDisabled();
    await page.getByRole("checkbox", { name: "Select Fix the login page" }).click();
    await page.getByRole("checkbox", { name: "Select Move nightly jobs" }).click({ modifiers: ["Shift"] });
    const bar = page.getByRole("region", { name: "Selected runs" });
    await expect(bar.getByRole("status")).toHaveText("3 selected");
    await expect(page.getByRole("checkbox", { name: "Select Retry the payment client" })).toBeChecked();
    await shot(page, "runs-bulk-selected");

    await bar.getByRole("button", { name: "Close" }).click();
    const dialog = page.getByRole("dialog", { name: "Close 3 runs?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("checkbox", { name: /Also close their 2 pull requests on GitHub/ })).not.toBeChecked();
    await dialog.getByRole("radio", { name: "Wrong ticket" }).check();
    await dialog.getByRole("button", { name: "Close 3 runs" }).click();

    const sent = db.bodies.find((b) => b.path === "/api/runs/close");
    expect(sent).toMatchObject({ run_ids: ["01RUNA", "01RUNB", "01RUNC"], reason: "Wrong ticket", close_pr: false });
    const problems = page.getByTestId("close-problems");
    await expect(problems).toContainText("1 run was not closed");
    await expect(problems).toContainText("Retry the payment client");
    await expect(problems).toContainText("It changed while closing");
    // The one that failed stays picked, ready to try again.
    await expect(bar.getByRole("status")).toHaveText("1 selected");
    await expect(page.locator('[data-testid="run-row"][data-status="closed"]')).toHaveCount(3);
    await shot(page, "runs-bulk-partial");

    await bar.getByRole("button", { name: "Clear" }).click();
    await expect(bar).toBeHidden();
  });

  test("select all picks every run on the page that can be closed", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await expect(page.getByTestId("run-row")).toHaveCount(5);
    const all = page.getByRole("checkbox", { name: /Select all 3 that can be closed/ });
    await all.check();
    await expect(page.getByRole("region", { name: "Selected runs" }).getByRole("status")).toHaveText("3 selected");
    // Keyboard: Space on a row's checkbox unpicks it, and select-all shows "some".
    await page.getByRole("checkbox", { name: "Select Fix the login page" }).focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("region", { name: "Selected runs" }).getByRole("status")).toHaveText("2 selected");
    expect(await all.evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true);
  });

  test("Closed is its own filter and never shows under Active", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/");
    const toolbar = page.getByTestId("list-toolbar");
    await toolbar.getByRole("button", { name: /^Closed/ }).click();
    await expect(page).toHaveURL(/status=closed/);
    await expect(page.getByTestId("run-row")).toHaveCount(1);
    await expect(page.getByTestId("run-row")).toContainText("Closed before");
    expect(db.calls.some((c) => c === "GET /api/runs?status=closed")).toBe(true);

    await toolbar.getByRole("button", { name: /^Active/ }).click();
    await expect(page).toHaveURL(/status=active/);
    await expect(page.getByTestId("run-row")).toHaveCount(1);
    await expect(page.getByTestId("run-row")).not.toContainText("Closed before");
    const active = db.calls.filter((c) => c.startsWith("GET /api/runs?status=")).pop() ?? "";
    expect(decodeURIComponent(active)).not.toContain("closed");
  });

  test("viewers get no checkboxes", async ({ page }) => {
    await mockApi(page, { role: "viewer" });
    await page.goto("/");
    await expect(page.getByTestId("run-row")).toHaveCount(5);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
  });

  test("the bar and the dialog fit a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 760 });
    await mockApi(page);
    await page.goto("/");
    await expect(page.getByTestId("run-row")).toHaveCount(5);
    await page.getByRole("checkbox", { name: "Select Fix the login page" }).click();
    await page.getByRole("checkbox", { name: "Select Retry the payment client" }).click();
    const bar = page.getByRole("region", { name: "Selected runs" });
    await expect(bar).toBeVisible();
    await noSideScroll(page);
    await shot(page, "runs-bulk-phone");
    await bar.getByRole("button", { name: "Close" }).click();
    const dialog = page.getByRole("dialog", { name: "Close 2 runs?" });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    await noSideScroll(page);
    await shot(page, "close-dialog-phone");
  });
});
