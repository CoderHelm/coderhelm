import { expect, test, type Page, type Route } from "@playwright/test";

// Stopping and re-arming a PR's auto-merge: the PR page the status comment
// links to, and the controls on the Reviewer list rows. Every API call is
// answered here; nothing reaches a real backend.

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();

type Gate = Record<string, unknown> | null;

interface Backend {
  calls: string[];
  posts: Record<string, unknown>[];
  role: string;
  /** Gate per "repo#pr"; a missing key is a repo the team doesn't have (404). */
  gates: Record<string, { pr_title: string; auto_merge: boolean; status: string; gate: Gate }>;
}

const WAITING_GATE = {
  state: "waiting_ci",
  head_sha: "abcdef1234567",
  checklist: [
    { mark: "done", text: "CoderHelm approved" },
    { mark: "done", text: "Approved by @a-reviewer" },
    { mark: "waiting", text: "CI running: build" },
  ],
  stopped: null,
  controls: [],
};

const STOPPED_GATE = {
  state: "stopped",
  head_sha: "abcdef1234567",
  checklist: [{ mark: "done", text: "CoderHelm approved" }],
  stopped: { by: "a-reviewer", is_login: true, via: "comment", at: iso(10) },
  controls: [
    { action: "stop", by: "a-reviewer", is_login: true, via: "comment", at: iso(10), outcome: "stopped" },
    { action: "rearm", by: "someone@example.com", is_login: false, via: "dashboard", at: iso(30), outcome: "rearmed" },
    { action: "stop", by: "someone@example.com", is_login: false, via: "dashboard", at: iso(60), outcome: "stopped" },
  ],
};

async function mockApi(page: Page, init: Partial<Backend> = {}): Promise<Backend> {
  const db: Backend = {
    calls: [],
    posts: [],
    role: "member",
    gates: {
      "your-team/web#101": { pr_title: "Faster checkout", auto_merge: true, status: "waiting_ci", gate: structuredClone(WAITING_GATE) },
      "your-team/web#96": { pr_title: "Upgrade the image pipeline", auto_merge: true, status: "stopped", gate: structuredClone(STOPPED_GATE) },
    },
    ...init,
  };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    db.calls.push(`${req.method()} ${p}${url.search}`);
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: "a-maintainer", email: "someone@example.com", avatar_url: "", role: db.role });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/support/badge") return json(route, { waiting: 0, queue_open: null });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/skills/used") return json(route, { skills: [], agents: [], sources: [], standards: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "your-team/web", enabled: true, ticket_source: "github" }] });
    if (p === "/api/aws-connections") return json(route, { connections: [] });
    if (p === "/api/reviewer/reviews") return json(route, { reviews: [], next: null });
    if (p === "/api/reviewer/live") {
      const prs = Object.entries(db.gates).map(([key, g], i) => {
        const [repo, pr] = key.split("#");
        return { repo, pr_number: Number(pr), pr_title: g.pr_title, status: g.status, group: "waiting", updated_at: iso(i + 1), review: null, gate: g.gate };
      });
      return json(route, { prs });
    }
    if (p === "/api/reviewer/gate" && req.method() === "GET") {
      const key = `${url.searchParams.get("repo")}#${url.searchParams.get("pr")}`;
      const g = db.gates[key];
      if (!g) return route.fulfill({ status: 404, body: "" });
      const [repo, pr] = key.split("#");
      return json(route, { repo, pr_number: Number(pr), ...g, group: "waiting", can_control: true });
    }
    if (p === "/api/reviewer/gate" && req.method() === "POST") {
      const body = JSON.parse(req.postData() || "{}");
      db.posts.push(body);
      const key = `${body.repo}#${body.pr}`;
      const g = db.gates[key];
      if (!g) return route.fulfill({ status: 404, body: "" });
      const gate = g.gate as Record<string, unknown>;
      const entry = { by: "a-maintainer", is_login: true, via: "dashboard", at: new Date().toISOString() };
      if (body.action === "stop") {
        g.status = "stopped";
        gate.state = "stopped";
        gate.stopped = entry;
        gate.controls = [{ action: "stop", outcome: "stopped", ...entry }, ...(gate.controls as unknown[])];
        return json(route, { status: "stopped", ok: true, message: "Auto-merge stopped. It won't merge until someone re-arms it." });
      }
      g.status = "paused";
      gate.state = "paused";
      gate.stopped = null;
      gate.controls = [{ action: "rearm", outcome: "rearmed", ...entry }, ...(gate.controls as unknown[])];
      return json(route, {
        status: "rearmed",
        ok: true,
        message: "Auto-merge re-armed. Before merging it checks CoderHelm's approval of commit abcdef1, the required approvals and CI again.",
      });
    }
    return json(route, { error: `Not mocked: ${req.method()} ${p}` }, 404);
  });
  return db;
}

function watchConsole(page: Page, allowFailedLoads = false) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (text.includes("net::ERR_ABORTED") || text.includes("net::ERR_FAILED")) return;
    if (allowFailedLoads && text.startsWith("Failed to load resource")) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

test("the status comment's stop link asks first, then stops with one click", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/reviewer/pr?repo=your-team/web&pr=101&do=stop");
  await expect(page.getByRole("heading", { level: 1, name: "Faster checkout" })).toBeVisible();
  await expect(page.getByText("CI running: build")).toBeVisible();
  // Opening the link changes nothing: no POST until the person confirms.
  await page.waitForTimeout(300);
  expect(db.posts).toEqual([]);
  expect(db.calls.filter((c) => c.startsWith("POST"))).toEqual([]);
  await expect(page.getByText("New commits don't re-arm it.")).toBeVisible();
  await page.getByRole("button", { name: "Stop auto-merge" }).click();
  await expect(page.getByTestId("gate-result")).toHaveText("Auto-merge stopped. It won't merge until someone re-arms it.");
  expect(db.posts).toEqual([{ repo: "your-team/web", pr: 101, action: "stop" }]);
  // The page reloads the gate: stopped, and the stop is in the history.
  await expect(page.getByText("Auto-merge is stopped")).toBeVisible();
  const history = page.getByTestId("gate-history");
  await expect(history.getByRole("listitem").first()).toContainText("Stopped by @a-maintainer in Coderhelm");
  await expect(page.getByRole("button", { name: "Re-arm auto-merge" })).toBeVisible();
  // Phone width: nothing scrolls sideways.
  await page.setViewportSize({ width: 390, height: 800 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test("a stopped PR shows who stopped it and every stop and re-arm, and re-arms without skipping checks", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/reviewer/pr?repo=your-team/web&pr=96&do=rearm");
  await expect(page.getByTestId("gate-stopped")).toContainText(
    "Stopped by @a-reviewer from a PR comment",
  );
  const items = page.getByTestId("gate-history").getByRole("listitem");
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText("Stopped by @a-reviewer from a PR comment");
  await expect(items.nth(1)).toContainText("Re-armed by someone@example.com in Coderhelm");
  await expect(page.getByText(/checks its approval of the current commit, the required approvals and CI again/)).toBeVisible();
  await page.getByRole("button", { name: "Re-arm auto-merge" }).click();
  await expect(page.getByTestId("gate-result")).toContainText("checks CoderHelm's approval of commit abcdef1");
  expect(db.posts).toEqual([{ repo: "your-team/web", pr: 96, action: "rearm" }]);
  await expect(page.getByRole("button", { name: "Stop auto-merge" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a stop link for a PR outside the team's repos shows nothing to act on", async ({ page }) => {
  const errors = watchConsole(page, true);
  const db = await mockApi(page);
  await page.goto("/reviewer/pr?repo=another-team/api&pr=5&do=stop");
  await expect(page.getByText("Pull request not found")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop auto-merge" })).toHaveCount(0);
  expect(db.posts).toEqual([]);
  // A malformed link never reaches the API.
  await page.goto("/reviewer/pr?repo=../x&pr=abc&do=stop");
  await expect(page.getByText("Pull request not found")).toBeVisible();
  expect(db.calls.some((c) => c.includes("repo=..%2Fx"))).toBe(false);
  expect(errors).toEqual([]);
});

test("viewers can't open the stop page", async ({ page }) => {
  const db = await mockApi(page, { role: "viewer" });
  await page.goto("/reviewer/pr?repo=your-team/web&pr=101&do=stop");
  await expect(page.getByText("This page needs a different role")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop auto-merge" })).toHaveCount(0);
  expect(db.posts).toEqual([]);
});

test("Reviewer rows stop a waiting auto-merge and re-arm a stopped one", async ({ page }) => {
  const errors = watchConsole(page);
  const db = await mockApi(page);
  await page.goto("/reviewer");
  const waiting = page.getByTestId("reviewer-pr").filter({ hasText: "Faster checkout" });
  const stopped = page.getByTestId("reviewer-pr").filter({ hasText: "Upgrade the image pipeline" });
  await expect(stopped.getByText("Auto-merge stopped by @a-reviewer · waits for someone to re-arm it")).toBeVisible();
  await stopped.getByRole("button", { name: "Re-arm auto-merge on your-team/web #96" }).click();
  await expect(page.getByText(/Auto-merge re-armed/)).toBeVisible();
  expect(db.posts).toEqual([{ repo: "your-team/web", pr: 96, action: "rearm" }]);
  await waiting.getByRole("button", { name: "Stop auto-merge on your-team/web #101" }).click();
  await expect.poll(() => db.posts.length).toBe(2);
  expect(db.posts[1]).toEqual({ repo: "your-team/web", pr: 101, action: "stop" });
  // After the refresh the row offers the way back.
  await expect(waiting.getByRole("button", { name: "Re-arm auto-merge on your-team/web #101" })).toBeVisible();
  // Each row links to its auto-merge page.
  await waiting.getByRole("button", { name: /Show details/ }).click();
  await expect(waiting.getByRole("link", { name: "Auto-merge details and history" })).toHaveAttribute(
    "href",
    /\/reviewer\/pr\/?\?repo=your-team%2Fweb&pr=101/,
  );
  expect(errors).toEqual([]);
});

test("a merged or closed PR offers no auto-merge control, whatever the gate last recorded", async ({ page }) => {
  const db = await mockApi(page, {
    gates: {
      "your-team/web#90": { pr_title: "Merged by auto-merge", auto_merge: true, status: "merged", gate: structuredClone(STOPPED_GATE) },
      "your-team/web#91": { pr_title: "Closed without merging", auto_merge: true, status: "closed", gate: { ...structuredClone(WAITING_GATE), state: "paused" } },
      "your-team/web#96": { pr_title: "Upgrade the image pipeline", auto_merge: true, status: "stopped", gate: structuredClone(STOPPED_GATE) },
    },
  });
  await page.goto("/reviewer");
  const merged = page.getByTestId("reviewer-pr").filter({ hasText: "Merged by auto-merge" });
  const closed = page.getByTestId("reviewer-pr").filter({ hasText: "Closed without merging" });
  const stopped = page.getByTestId("reviewer-pr").filter({ hasText: "Upgrade the image pipeline" });
  await expect(merged).toBeVisible();
  await expect(closed).toBeVisible();
  // The open, stopped PR still offers its way back.
  await expect(stopped.getByRole("button", { name: /Re-arm auto-merge/ })).toBeVisible();
  await expect(merged.getByRole("button", { name: /Re-arm auto-merge|Stop auto-merge/ })).toHaveCount(0);
  await expect(closed.getByRole("button", { name: /Re-arm auto-merge|Stop auto-merge/ })).toHaveCount(0);
  expect(db.posts).toEqual([]);
});
