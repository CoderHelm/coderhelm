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

const rowOf = (page: Page, repo: string) => page.locator(`[data-testid="graph-repo"][data-repo="${repo}"]`);

test("every repo is listed with its graph's status, and admins can turn it off or rebuild it", async ({ page }) => {
  const db = await mockApi(page, { repos: ALL });
  await page.goto("/graph/");

  await expect(page.getByText("The planner, the coding agent, the reviewer and CI fixes all use it.")).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Rebuild the code graph for acme/api" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Rebuild the code graph for acme/legacy" })).toHaveCount(0);

  // Rebuild a failed repo.
  await page.getByRole("button", { name: "Rebuild the code graph for acme/data" }).click();
  await expect(page.getByText("Rebuilding the code graph for acme/data.")).toBeVisible();
  expect(db.rebuilds).toEqual(["acme/data"]);
  await expect(rowOf(page, "acme/data")).toContainText("Queued");

  // Turning one off asks first.
  await page.getByRole("button", { name: "Turn off the code graph for acme/web" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("stop using it for this repo");
  await page.getByRole("alertdialog").getByRole("button", { name: "Turn off" }).click();
  await expect(rowOf(page, "acme/web")).toContainText("Off");
  expect(db.puts).toEqual([{ repo: "acme/web", body: { enabled: false } }]);

  // And back on without asking.
  await page.getByRole("button", { name: "Turn on the code graph for acme/legacy" }).click();
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
  await expect(page.getByRole("button", { name: /Rebuild the code graph/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Turn (off|on) the code graph/ })).toHaveCount(0);
  await expect(rowOf(page, "acme/web").getByRole("button", { name: "Exploring" })).toBeVisible();
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
