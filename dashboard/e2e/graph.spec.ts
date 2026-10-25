import { expect, test, type Page, type Route } from "@playwright/test";
import path from "node:path";

// The Code graph page: every repo the team works in, with its graph's status
// and the Turn off / Rebuild actions. Every API call is answered here;
// nothing reaches a real backend.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

type Row = Record<string, unknown>;

const row = (repo: string, extra: Row): Row => ({
  repo,
  graph_enabled: true,
  state: "ready",
  reason: "",
  updating: false,
  indexed: false,
  files: 0,
  symbols: 0,
  branch: "",
  indexed_sha: "",
  updated_at: "",
  ...extra,
});

const READY = row("acme/web", {
  indexed: true,
  files: 1284,
  symbols: 9312,
  branch: "main",
  indexed_sha: "4f2a9c1e0b",
  updated_at: new Date(Date.now() - 20 * 60_000).toISOString(),
});

const ALL: Row[] = [
  READY,
  row("acme/api", { state: "indexing" }),
  row("acme/mobile", { state: "queued" }),
  row("acme/infra", { state: "not_built" }),
  row("acme/data", { state: "failed", reason: "GitHub refused access to this repository." }),
  row("acme/legacy", { graph_enabled: false, state: "off" }),
];

interface Backend {
  repos: Row[];
  puts: { repo: string; body: unknown }[];
  rebuilds: string[];
}

async function mockApi(page: Page, opts: { repos: Row[]; role?: string }): Promise<Backend> {
  const db: Backend = { repos: opts.repos.map((r) => ({ ...r })), puts: [], rebuilds: [] };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    if (p === "/api/me")
      return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "person@example.com", avatar_url: "", role: opts.role ?? "admin", auth_provider: "email", mfa_enabled: false });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/graph/repos") return json(route, { repos: db.repos });
    if (p === "/api/graph/status") {
      const r = db.repos.find((x) => x.repo === url.searchParams.get("repo"));
      if (!r?.indexed) return json(route, { indexed: false });
      return json(route, {
        indexed: true,
        files: r.files,
        symbols: r.symbols,
        names_referenced: 4021,
        branch: r.branch,
        indexed_sha: r.indexed_sha,
        updated_at: r.updated_at,
        top_files: [
          { path: "src/lib/api.ts", rank: 0.04, defs: 61 },
          { path: "src/components/ui.ts", rank: 0.03, defs: 14 },
        ],
      });
    }
    if (p === "/api/graph/neighborhood") return json(route, hood(url.searchParams.get("path") ?? ""));
    const config = p.match(/^\/api\/graph\/config\/(.+)$/);
    if (config && method === "PUT") {
      const body = JSON.parse(req.postData() as string) as { enabled: boolean };
      db.puts.push({ repo: config[1], body });
      db.repos = db.repos.map((r) =>
        r.repo === config[1] ? { ...r, graph_enabled: body.enabled, state: body.enabled ? (r.indexed ? "ready" : "queued") : "off" } : r,
      );
      return route.fulfill({ status: 200, body: "" });
    }
    const rebuild = p.match(/^\/api\/graph\/rebuild\/(.+)$/);
    if (rebuild && method === "POST") {
      db.rebuilds.push(rebuild[1]);
      db.repos = db.repos.map((r) => (r.repo === rebuild[1] ? { ...r, state: r.indexed ? "ready" : "queued", updating: !!r.indexed, reason: "" } : r));
      return route.fulfill({ status: 202, body: "" });
    }
    return json(route, { error: `not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

/** The files around one file, for the explorer. */
const hood = (path: string) => ({
  path,
  imports: ["src/lib/http.ts", "src/lib/auth/session.ts", "src/lib/format.ts", "src/lib/routes.ts", "src/types/api.ts", "src/lib/errors.ts"].filter((f) => f !== path),
  importers: ["src/app/runs/page.tsx", "src/app/plans/page.tsx", "src/app/settings/page.tsx", "src/components/top-bar.tsx", "src/app/logs/page.tsx", ...(path === "src/lib/api.ts" ? [] : ["src/lib/api.ts"])],
  symbols: [
    { name: "request", callers: ["src/app/runs/page.tsx", "src/hooks/use-runs.ts"] },
    { name: "ApiError", callers: ["src/components/toast.tsx"] },
  ],
});

const rowOf = (page: Page, repo: string) => page.locator(`[data-testid="graph-repo"][data-repo="${repo}"]`);
/** A row's rarely used actions sit in its "⋯" menu. */
async function rowAction(page: Page, repo: string, action: RegExp) {
  await page.getByRole("button", { name: `Code graph actions for ${repo}` }).click();
  return page.getByRole("menuitem", { name: action });
}

test("every repo is listed with its graph's status, and admins can turn it off or rebuild it", async ({ page }) => {
  const db = await mockApi(page, { repos: ALL });
  await page.goto("/graph/");

  await expect(page.getByText(/The planner, the coding agent, the reviewer and CI fixes all use it/)).toBeVisible();
  // One plain status line for every repo's map.
  await expect(page.getByTestId("graph-summary")).toContainText("Coderhelm has mapped 1 of 5 repositories.");
  await expect(page.getByText(/once the reviewer is set up/)).toHaveCount(0);

  // One row per repo, each with its state.
  await expect(page.getByTestId("graph-repo")).toHaveCount(6);
  const states: Record<string, string> = {
    "acme/web": "Ready",
    "acme/api": "Indexing",
    "acme/mobile": "Queued",
    "acme/infra": "Not built yet",
    "acme/data": "Failed",
    "acme/legacy": "Off",
  };
  for (const [repo, label] of Object.entries(states)) {
    await expect(rowOf(page, repo)).toContainText(label);
  }
  await expect(rowOf(page, "acme/web")).toContainText("1,284 files");
  await expect(rowOf(page, "acme/web")).toContainText("9,312 symbols");
  await expect(rowOf(page, "acme/web")).toContainText("at 4f2a9c1");
  await expect(rowOf(page, "acme/data")).toContainText("GitHub refused access to this repository.");

  // The ready repo opens below the list.
  await expect(page.getByTestId("graph-exploring")).toContainText("acme/web");
  await expect(page.getByRole("button", { name: /src\/lib\/api\.ts/ })).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS_DIR, "graph-states.png"), fullPage: true });

  // A build in progress can't be rebuilt again.
  await expect(await rowAction(page, "acme/api", /^Rebuild/)).toBeDisabled();
  await page.keyboard.press("Escape");
  await rowAction(page, "acme/legacy", /^Turn on/);
  await expect(page.getByRole("menuitem", { name: /^Rebuild/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Rebuild a failed repo.
  await (await rowAction(page, "acme/data", /^Rebuild/)).click();
  await expect(page.getByText("Rebuilding the code graph for acme/data.")).toBeVisible();
  expect(db.rebuilds).toEqual(["acme/data"]);
  await expect(rowOf(page, "acme/data")).toContainText("Queued");

  // Turning one off asks first.
  await (await rowAction(page, "acme/web", /^Turn off/)).click();
  await expect(page.getByRole("alertdialog")).toContainText("stop using it for this repo");
  await page.getByRole("alertdialog").getByRole("button", { name: "Turn off" }).click();
  await expect(rowOf(page, "acme/web")).toContainText("Off");
  expect(db.puts).toEqual([{ repo: "acme/web", body: { enabled: false } }]);

  // And back on without asking.
  await (await rowAction(page, "acme/legacy", /^Turn on/)).click();
  await expect(rowOf(page, "acme/legacy")).toContainText("Queued");
  expect(db.puts.at(-1)).toEqual({ repo: "acme/legacy", body: { enabled: true } });
});

test("with no repos, the page points to connecting repositories, not the reviewer", async ({ page }) => {
  await mockApi(page, { repos: [] });
  await page.goto("/graph/");
  const empty = page.getByTestId("list-empty");
  await expect(empty).toContainText("No repositories yet");
  const link = empty.getByRole("link", { name: "Connect repositories" });
  await expect(link).toHaveAttribute("href", /\/settings\/repos/);
  await expect(page.getByRole("link", { name: "Set up the reviewer" })).toHaveCount(0);
  await page.screenshot({ path: path.join(SHOTS_DIR, "graph-empty.png"), fullPage: true });
});

test("a member sees each repo's status but no Turn off or Rebuild", async ({ page }) => {
  await mockApi(page, { repos: ALL, role: "member" });
  await page.goto("/graph/");
  await expect(page.getByTestId("graph-repo")).toHaveCount(6);
  await expect(rowOf(page, "acme/data")).toContainText("Failed");
  await expect(page.getByRole("button", { name: /Code graph actions/ })).toHaveCount(0);
  await expect(rowOf(page, "acme/web").getByText("Exploring", { exact: true })).toBeVisible();
});

test("an older gateway without states still reads right", async ({ page }) => {
  const legacy = ALL.slice(0, 1).map(({ state: _s, reason: _r, updating: _u, ...r }) => r);
  legacy.push(row("acme/api", { state: undefined }));
  await mockApi(page, { repos: legacy });
  await page.goto("/graph/");
  await expect(rowOf(page, "acme/web")).toContainText("Ready");
  await expect(rowOf(page, "acme/api")).toContainText("Not built yet");
});

test("the list reads on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, { repos: ALL });
  await page.goto("/graph/");
  await expect(page.getByTestId("graph-repo")).toHaveCount(6);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: path.join(SHOTS_DIR, "graph-phone.png"), fullPage: true });
});

// ── The explorer ─────────────────────────────────────────────────────────────

const node = (page: Page, id: string) => page.locator(`[data-testid="graph-node"][data-id="${id}"]`);
const transforms = (page: Page) =>
  page.getByTestId("graph-node").evaluateAll((els) =>
    Object.fromEntries(els.map((el) => [el.getAttribute("data-id"), el.getAttribute("transform")])),
  );
const dot = (page: Page, id: string) => node(page, id).locator("circle").nth(1);
const opacity = (page: Page, id: string) => node(page, id).evaluate((el) => getComputedStyle(el).opacity);

async function openExplorer(page: Page) {
  await mockApi(page, { repos: [READY] });
  await page.goto("/graph/");
  await page.getByRole("button", { name: /src\/lib\/api\.ts/ }).click();
  await expect(page.getByTestId("graph-explorer")).toBeVisible();
  await expect(node(page, "src/lib/api.ts")).toHaveAttribute("data-kind", "center");
}

test.describe("with motion allowed", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the explorer is laid out before it is drawn: nothing moves after the first paint", async ({ page }) => {
    await openExplorer(page);
    const first = await transforms(page);
    expect(Object.keys(first).length).toBeGreaterThan(10);
    await page.waitForTimeout(800);
    expect(await transforms(page)).toEqual(first);
    await expect(page.getByTestId("graph-explorer")).toHaveAttribute("data-motion", "full");
    await page.getByTestId("graph-explorer").screenshot({ path: path.join(SHOTS_DIR, "graph-explorer-canvas.png") });
  });

  test("moving to another file glides once and settles quickly", async ({ page }) => {
    await openExplorer(page);
    const svg = page.getByTestId("graph-explorer");
    await dot(page, "src/lib/http.ts").click();
    await expect(page.getByRole("heading", { name: /Explorer: src\/lib\/http\.ts/ })).toBeVisible();
    await expect(node(page, "src/lib/http.ts")).toHaveAttribute("data-kind", "center");
    // One short transition, not a long simulation.
    await expect(svg).toHaveAttribute("data-moving", "false", { timeout: 600 });
    const settled = await transforms(page);
    await page.waitForTimeout(500);
    expect(await transforms(page)).toEqual(settled);
    // The old center stays on screen as a file that uses the new one.
    await expect(node(page, "src/lib/api.ts")).toHaveAttribute("data-kind", "importer");
  });
});

test("with reduced motion the explorer appears and changes at once", async ({ page }) => {
  await openExplorer(page);
  await expect(page.getByTestId("graph-explorer")).toHaveAttribute("data-motion", "reduced");
  expect(await opacity(page, "src/lib/http.ts")).toBe("1");
  const transition = await node(page, "src/lib/http.ts").evaluate((el) => getComputedStyle(el).transitionProperty);
  expect(transition).toBe("none");
  await dot(page, "src/lib/http.ts").click();
  await expect(page.getByTestId("graph-explorer")).toHaveAttribute("data-moving", "false");
  await expect(node(page, "src/lib/http.ts")).toHaveAttribute("data-kind", "center");
});

test("labels use the page's font at the same size on a laptop and a phone", async ({ page }) => {
  await openExplorer(page);
  const look = () =>
    page.locator('[data-testid="graph-node"][data-kind="center"] text').evaluate((el) => {
      const s = getComputedStyle(el);
      return { family: s.fontFamily, size: s.fontSize, height: Math.round(el.getBoundingClientRect().height), body: getComputedStyle(document.body).fontFamily };
    });
  const wide = await look();
  expect(wide.family).toBe(wide.body);
  expect(wide.size).toBe("12px");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await look()).height).toBe(wide.height);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByTestId("graph-explorer").scrollIntoViewIfNeeded();
  await page.getByTestId("graph-explorer").screenshot({ path: path.join(SHOTS_DIR, "graph-explorer-canvas-phone.png") });
  await page.screenshot({ path: path.join(SHOTS_DIR, "graph-explorer-phone.png"), fullPage: true });
});

test("filtering a kind hides it without moving anything else", async ({ page }) => {
  await openExplorer(page);
  const before = await transforms(page);
  const symbols = page.getByRole("button", { name: "its symbols" });
  await expect(symbols).toHaveAttribute("aria-pressed", "true");
  await symbols.click();
  await expect(symbols).toHaveAttribute("aria-pressed", "false");
  await expect(node(page, "sym:request")).toHaveAttribute("aria-hidden", "true");
  expect(await opacity(page, "sym:request")).toBe("0");
  expect(await transforms(page)).toEqual(before);
  await page.getByRole("button", { name: "files it imports" }).click();
  await expect(page.getByRole("button", { name: "Explore src/lib/http.ts" })).toHaveCount(0);
  expect(await transforms(page)).toEqual(before);
  await symbols.click();
  expect(await opacity(page, "sym:request")).toBe("1");
  await page.screenshot({ path: path.join(SHOTS_DIR, "graph-explorer.png"), fullPage: true });
});

test("hovering a node dims everything but it and its neighbours, without resizing it", async ({ page }) => {
  await openExplorer(page);
  const size = await dot(page, "sym:ApiError").boundingBox();
  await dot(page, "sym:ApiError").hover();
  await expect.poll(() => opacity(page, "src/lib/http.ts")).toBe("0.25");
  expect(await opacity(page, "src/components/toast.tsx")).toBe("1");
  expect(await opacity(page, "src/lib/api.ts")).toBe("1");
  const hovered = await dot(page, "sym:ApiError").boundingBox();
  expect(hovered?.width).toBeCloseTo(size?.width ?? 0, 0);
  // Keyboard focus does the same.
  await page.mouse.move(0, 0);
  await node(page, "src/lib/http.ts").focus();
  await expect.poll(() => opacity(page, "sym:ApiError")).toBe("0.25");
});
