import type { Page, Route } from "@playwright/test";

// An invented team for the Setup specs and screenshots: five repos in every
// state, a run that reads, gets reviewed, applies with one failure, and can be
// undone. Every API call is answered here; nothing reaches a real backend.

const NOW = Date.now();
export const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();

const GH = "https://github.com/acme";

export const REVIEW_FOCUS_NOW = [
  "Check that every API handler validates its input.",
  "Flag SQL built from strings.",
  "Keep comments short.",
].join("\n");

export const REVIEW_FOCUS_REC = [
  "Check that every API handler validates its input with the shared zod schemas in src/schemas.",
  "Flag SQL built from strings.",
  "A change under src/billing needs a test that covers the refund path.",
  "Keep comments short.",
  "Ask for a screenshot when a pull request changes a page in app/.",
].join("\n");

const CODER_NOW = ["Use pnpm.", "Run the unit tests before opening a pull request."].join("\n");
const CODER_REC = [
  "Use pnpm, never npm or yarn.",
  "Run `pnpm test` and `pnpm lint` before opening a pull request.",
  "New pages go in app/ and use the components in src/ui.",
  "Write tests next to the code, in __tests__/.",
].join("\n");

type Item = Record<string, unknown>;

const item = (over: Item): Item => ({
  current: { value: null, set: false },
  recommended: null,
  source: "default",
  evidence: [],
  custom: false,
  decision: null,
  risk: "safe",
  ...over,
});

export function webAppItems(): Item[] {
  return [
    item({
      setting_id: "reviewer.enabled",
      feature: "reviewer",
      title: "Review pull requests",
      help: "Coderhelm reviews each pull request that has the review label.",
      current: { value: false, set: false },
      recommended: true,
      source: "detected",
      evidence: [{ text: "Label ch-review exists and is on 31 merged pull requests" }],
    }),
    item({
      setting_id: "reviewer.require_tests",
      feature: "reviewer",
      title: "Require tests",
      help: "A pull request that changes code without a test is held until one is added.",
      current: { value: false, set: false },
      recommended: true,
      source: "inferred",
      evidence: [{ text: "18 of the last 20 merged pull requests added or changed tests in __tests__/" }],
    }),
    item({
      setting_id: "reviewer.instructions",
      feature: "reviewer",
      title: "Review focus",
      help: "What the reviewer looks for first in this repo.",
      current: { value: REVIEW_FOCUS_NOW, set: true },
      recommended: REVIEW_FOCUS_REC,
      source: "inferred",
      evidence: [
        { text: "From the review guide", file: "CODE_REVIEW_GUIDELINES.md", url: `${GH}/web-app/blob/main/CODE_REVIEW_GUIDELINES.md` },
        { text: "And the 12 review comments repeated most in the last 50 merged pull requests" },
      ],
    }),
    item({
      setting_id: "tests.e2e",
      feature: "tests",
      title: "Read end-to-end test results",
      help: "Coderhelm reads each E2E run's results and opens a ticket for a test that keeps failing.",
      current: { value: false, set: false },
      recommended: true,
      source: "detected",
      evidence: [
        { text: "Playwright in package.json", file: "package.json", line: 41, url: `${GH}/web-app/blob/main/package.json#L41` },
        { text: "2 E2E workflows: e2e.yml and e2e-nightly.yml", file: ".github/workflows/e2e.yml", url: `${GH}/web-app/blob/main/.github/workflows/e2e.yml` },
      ],
    }),
    item({
      setting_id: "ci_labels.auto_labels",
      feature: "ci_labels",
      title: "Add CI labels",
      help: "Coderhelm adds the labels your workflows react to, so the right checks run.",
      current: { value: false, set: true },
      recommended: true,
      source: "detected",
      evidence: [{ text: "Workflow e2e.yml runs when a pull request gets the label E2E:WEB", file: ".github/workflows/e2e.yml", line: 6, url: `${GH}/web-app/blob/main/.github/workflows/e2e.yml#L6` }],
    }),
    item({
      setting_id: "ci_labels.allow",
      feature: "ci_labels",
      title: "Labels it may add",
      current: { value: [], set: false },
      recommended: ["E2E:WEB", "E2E:IOS"],
      source: "detected",
      evidence: [{ text: "Both labels gate a workflow and exist on the repo" }],
    }),
    item({
      setting_id: "auto_merge.enabled",
      feature: "auto_merge",
      title: "Merge when checks pass",
      help: "Coderhelm merges an approved pull request once every required check passes.",
      current: { value: false, set: false },
      recommended: true,
      source: "detected",
      risk: "acts",
      evidence: [
        { text: "Branch protection on main requires 3 checks: build, unit and e2e" },
        { text: "Would have merged 7 pull requests in the last 14 days, each after its checks passed", url: `${GH}/web-app/pulls?q=is%3Amerged` },
      ],
    }),
    item({
      setting_id: "stale_prs.enabled",
      feature: "stale_prs",
      title: "Close stale pull requests",
      help: "Marks a pull request stale after a quiet spell, then closes it a week later.",
      current: { value: false, set: true },
      custom: true,
      recommended: true,
      source: "inferred",
      risk: "acts",
      evidence: [
        { text: "Would have marked 6 pull requests stale and closed 2 in the last 14 days", url: `${GH}/web-app/pulls?q=is%3Aopen+updated%3A%3C2026-10-20` },
        { text: "Pull requests here usually merge in 2 days" },
      ],
    }),
    item({
      setting_id: "stale_prs.days_to_stale",
      feature: "stale_prs",
      title: "Days before a pull request is stale",
      current: { value: 21, set: false },
      recommended: 14,
      source: "inferred",
      evidence: [{ text: "9 in 10 pull requests here merge within 6 days" }],
    }),
    item({
      setting_id: "security.enabled",
      feature: "security",
      title: "Open security fix pull requests",
      current: { value: false, set: false },
      recommended: true,
      source: "detected",
      evidence: [{ text: "npm lockfile with 1,412 packages, and Dependabot alerts are readable", file: "pnpm-lock.yaml" }],
    }),
    item({
      setting_id: "instructions.coder",
      feature: "instructions",
      title: "Coder instructions",
      help: "What Coderhelm follows when it writes code in this repo.",
      current: { value: CODER_NOW, set: true },
      custom: true,
      recommended: CODER_REC,
      source: "inferred",
      evidence: [{ text: "From AGENTS.md and the scripts in package.json", file: "AGENTS.md", url: `${GH}/web-app/blob/main/AGENTS.md` }],
    }),
    item({
      setting_id: "agent_file.auto_refresh",
      feature: "agent_file",
      title: "Keep the agent file up to date",
      current: { value: false, set: false },
      recommended: true,
      source: "default",
    }),
    item({
      setting_id: "git_conventions.branch",
      feature: "git_conventions",
      title: "Branch name",
      current: { value: "coderhelm/{ticket_lower}", set: false },
      recommended: "coderhelm/{ticket_lower}",
      source: "default",
    }),
    item({
      setting_id: "code_graph.enabled",
      feature: "code_graph",
      title: "Code graph",
      current: { value: true, set: false },
      recommended: true,
      source: "default",
    }),
  ];
}

function apiItems(): Item[] {
  return [
    item({ setting_id: "reviewer.enabled", feature: "reviewer", title: "Review pull requests", current: { value: true, set: true }, recommended: true, source: "detected", evidence: [{ text: "Label ch-review is on 54 merged pull requests" }] }),
    item({
      setting_id: "reviewer.require_tests",
      feature: "reviewer",
      title: "Require tests",
      current: { value: false, set: true },
      recommended: true,
      source: "inferred",
      evidence: [{ text: "15 of the last 20 merged pull requests changed tests in tests/" }],
    }),
    item({ setting_id: "tests.e2e", feature: "tests", title: "Read end-to-end test results", current: { value: false, set: false }, recommended: false, source: "detected", evidence: [{ text: "No end-to-end tests found" }] }),
    item({ setting_id: "security.enabled", feature: "security", title: "Open security fix pull requests", current: { value: false, set: false }, recommended: true, source: "detected", evidence: [{ text: "poetry.lock with 212 packages", file: "poetry.lock" }] }),
  ];
}

function infraItems(): Item[] {
  return [
    item({ setting_id: "reviewer.enabled", feature: "reviewer", title: "Review pull requests", current: { value: false, set: false }, recommended: true, source: "default" }),
    item({
      setting_id: "security.enabled",
      feature: "security",
      title: "Open security fix pull requests",
      current: { value: false, set: false },
      recommended: true,
      source: "detected",
      needs: "Manage security fixes",
      evidence: [{ text: "Terraform lock file with 18 providers", file: ".terraform.lock.hcl" }],
    }),
  ];
}

export const HOME = {
  repos: [
    {
      repo: "acme/web-app",
      state: "update_available",
      features_on: 9,
      features_total: 14,
      last_run_at: iso(24 * 7),
      new_count: 2,
      custom_count: 0,
      counts: { on: 5, previews: 2, off: 3, not_used: 2, total: 10 },
      summary: "5 on, 2 previews, 3 off of the 10 that fit this repo: Auto-merge (preview waiting), Stale pull requests (preview waiting), Release tags (off by default) and 4 more",
    },
    { repo: "acme/api", state: "custom", features_on: 8, features_total: 14, last_run_at: iso(24 * 13), new_count: 0, custom_count: 2 },
    { repo: "acme/mobile-app", state: "not_set_up", features_on: 2, features_total: 14, last_run_at: null, new_count: 0, custom_count: 0 },
    { repo: "acme/infra", state: "failed", features_on: 3, features_total: 14, last_run_at: iso(20), new_count: 0, custom_count: 0, error: "The reviewer needs the GitHub App on this repo" },
    { repo: "acme/docs-site", state: "set_up", features_on: 11, features_total: 14, last_run_at: iso(24 * 3), new_count: 0, custom_count: 0 },
    { repo: "acme/billing-worker", state: "not_set_up", features_on: 0, features_total: 14, last_run_at: null, new_count: 0, custom_count: 0 },
  ],
  new_recommendations: [
    { setting_id: "security.enabled", title: "Open security fix pull requests", feature: "security", since: "v0.8.78" },
    { setting_id: "agent_file.auto_refresh", title: "Keep the agent file up to date", feature: "agent_file", since: "v0.8.78" },
    { setting_id: "reviewer.require_tests", title: "A missing test holds the merge when tests are required", feature: "reviewer", since: "v0.8.76" },
  ],
  auto_setup_new_repos: false,
  last_run: { run_id: "run_02", state: "done", created_at: iso(20), by: "dana" },
};

export const RUNS = {
  runs: [
    { run_id: "run_02", state: "failed", created_at: iso(20), by: "dana", repo_count: 2, changed: 6 },
    { run_id: "run_01", state: "done", created_at: iso(24 * 7), by: "sam", repo_count: 3, changed: 23 },
    { run_id: "run_00", state: "undone", created_at: iso(24 * 21), by: "sam", repo_count: 1, changed: 4 },
  ],
};

export interface SetupDb {
  role: string;
  home: unknown;
  runs: unknown;
  /** analyzing, then ready, applying, done (or failed), and undone */
  run: Record<string, unknown>;
  /** The repos the next apply fails on. */
  failOn: string[];
  /** How many reads of the run while analyzing before it is ready (0: stay analyzing). */
  readyAfter: number;
  reads: number;
  calls: { call: string; body: unknown }[];
  /** Answer GET /api/setup with this instead (a reply the page can't read). */
  homeOverride?: unknown;
  runOverride?: unknown;
  /** Keep the run applying (for a picture of it mid-way). */
  holdApply?: boolean;
  /** The estimate says the run doesn't fit the token limit. */
  overBudget?: boolean;
  /** GET /api/setup/repos/:owner/:name answers per repo; made up from `repoView` otherwise. */
  repoViews?: Record<string, unknown>;
  repoViewFails?: boolean;
  /** Features switched on from the expanded row. */
  switchedOn?: string[];
}

export function analyzingRun(): Record<string, unknown> {
  return {
    run_id: "run_03",
    state: "analyzing",
    created_at: iso(0.05),
    by: "dana",
    choice: "keep_mine",
    tokens_used: 212_000,
    estimate_tokens: 840_000,
    repos: [
      {
        repo: "acme/web-app",
        state: "analyzing",
        progress: { done: 7, total: 9, found: ["Playwright, and 2 E2E workflows", "Branch protection on main with 3 required checks", "A review guide in CODE_REVIEW_GUIDELINES.md", "Labels E2E:WEB and E2E:IOS that start workflows"] },
        items: [],
      },
      { repo: "acme/api", state: "analyzing", progress: { done: 3, total: 9, found: ["pytest, and a CI workflow that runs it", "poetry.lock with 212 packages"] }, items: [] },
      { repo: "acme/infra", state: "queued", progress: null, items: [] },
    ],
  };
}

export function readyRun(): Record<string, unknown> {
  return {
    ...analyzingRun(),
    state: "ready",
    tokens_used: 790_000,
    repos: [
      { repo: "acme/web-app", state: "ready", items: webAppItems() },
      { repo: "acme/api", state: "ready", items: apiItems() },
      { repo: "acme/infra", state: "ready", items: infraItems() },
    ],
  };
}

export async function mockSetup(page: Page, init: Partial<SetupDb> = {}): Promise<SetupDb> {
  const db: SetupDb = {
    role: "admin",
    home: HOME,
    runs: RUNS,
    run: readyRun(),
    failOn: ["acme/infra"],
    readyAfter: 0,
    reads: 0,
    calls: [],
    ...init,
  };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route(
    (url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname),
    async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const p = url.pathname;
      const method = req.method();
      let body: unknown = null;
      try {
        body = req.postDataJSON();
      } catch {
        body = null;
      }
      if (p.startsWith("/api/setup")) db.calls.push({ call: `${method} ${p}`, body });
      if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: "dana", email: "dana@example.com", avatar_url: "", role: db.role });
      if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
      if (p === "/api/banners") return json(route, { banners: [] });
      if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
      if (p === "/api/security/overview") return json(route, { enabled: false, dry_run: true, counts: { open: 0, p0: 0, p1: 0 } });
      if (p === "/api/support/badge") return json(route, { waiting: 0, queue_open: null });
      if (p === "/api/repos") return json(route, { repos: (db.home as typeof HOME).repos?.map((r) => ({ name: r.repo })) ?? [] });

      if (p === "/api/setup" && method === "GET") return json(route, db.homeOverride ?? db.home);
      const rv = p.match(/^\/api\/setup\/repos\/([^/]+)\/([^/]+)$/);
      if (rv && method === "GET") {
        const repo = `${decodeURIComponent(rv[1])}/${decodeURIComponent(rv[2])}`;
        if (db.repoViewFails) return json(route, { error: "Something went wrong. Try again." }, 500);
        return json(route, db.repoViews?.[repo] ?? repoView(repo, db.switchedOn ?? []));
      }
      if (p === "/api/setup/runs" && method === "GET") return json(route, db.runs);
      if (p === "/api/setup/estimate" && method === "POST") {
        const reposArg = (body as { repos?: unknown } | null)?.repos;
        const all = (db.home as typeof HOME).repos ?? [];
        const n = Array.isArray(reposArg) ? reposArg.length : reposArg === "not_set_up" ? all.filter((r) => r.state === "not_set_up").length : all.length;
        return json(route, { repos: n, estimate_tokens: 420_000 * n, over_budget: !!db.overBudget, reason: db.overBudget ? "Your team has 300k new tokens left this month." : null });
      }
      if (p === "/api/setup/seen" && method === "POST") {
        const ids = ((body as { setting_ids?: string[] } | null)?.setting_ids ?? []) as string[];
        const h = db.home as typeof HOME;
        db.home = { ...h, new_recommendations: h.new_recommendations.filter((n) => !ids.includes(n.setting_id)) };
        return json(route, { new_recommendations: (db.home as typeof HOME).new_recommendations.map((n) => n.setting_id) });
      }
      if (p === "/api/setup/runs" && method === "POST") {
        const b = (body ?? {}) as { mode?: string };
        db.run = b.mode === "auto" ? { ...analyzingRun(), mode: "auto" } : analyzingRun();
        db.reads = 0;
        return json(route, { run_id: db.run.run_id, estimate_tokens: 840_000 });
      }
      if (p === "/api/setup/settings" && method === "PUT") {
        db.home = { ...(db.home as object), ...(body as object) };
        return json(route, db.home);
      }
      const m = p.match(/^\/api\/setup\/runs\/([^/]+)(\/(decisions|apply|undo|switch-on|use-recommended))?$/);
      if (m) {
        const sub = m[3];
        if (!sub && method === "GET") {
          if (db.runOverride) return json(route, db.runOverride);
          db.reads++;
          if (db.run.state === "analyzing" && db.readyAfter && db.reads >= db.readyAfter) db.run = db.run.mode === "auto" ? autoDoneRun() : readyRun();
          if (db.run.state === "applying" && !db.holdApply) db.run = applied(db);
          return json(route, db.run);
        }
        if (sub === "use-recommended") {
          const items = (body as { items: { repo: string; setting_id: string }[] }).items;
          const repos = (db.run.repos as { repo: string; items: Item[]; changes?: Item[]; summary?: Record<string, unknown> }[]).map((r) => {
            const mine = items.filter((i) => i.repo === r.repo).map((i) => i.setting_id);
            if (!mine.length) return r;
            const s = { ...(r.summary ?? {}) } as Record<string, string[] | number | string>;
            const drop = (k: string) => ((s[k] as string[]) ?? []).filter((x) => !mine.includes(x));
            s.kept_ids = drop("kept_ids");
            s.worth_ids = drop("worth_ids");
            s.changed_ids = [...((s.changed_ids as string[]) ?? []), ...mine];
            const changes = [
              ...(r.changes ?? []),
              ...mine.map((id) => {
                const it = r.items.find((x) => x.setting_id === id) as Item;
                return { setting_id: id, before: { value: (it.current as { value: unknown }).value, stored: true, row: true }, after: it.recommended, at: iso(0), evidence: it.evidence, row_created: false, undone: false };
              }),
            ];
            return { ...r, summary: s, changes };
          });
          db.run = { ...db.run, repos };
          return json(route, { ...db.run, used: items, skipped: [] });
        }
        if (sub === "switch-on") {
          const one = body as { repo: string; setting_id: string };
          // A switch from the expanded row names a run other than the one on screen.
          if (m[1] !== db.run.run_id) {
            db.switchedOn = [...(db.switchedOn ?? []), one.setting_id];
            return json(route, { ...db.run, switched_on: { setting_id: one.setting_id } });
          }
          // Stale closing turns its dry run off; auto-merge turns on.
          const target = one.setting_id.startsWith("stale_prs.") ? "stale_prs.dry_run" : one.setting_id;
          const after = target.endsWith(".dry_run") ? false : true;
          const change = { setting_id: target, before: { value: !after, stored: false, row: null }, after, at: iso(0), evidence: [], row_created: false, undone: false };
          const repos = (db.run.repos as { repo: string; changes?: Item[] }[]).map((r) =>
            r.repo === one.repo ? { ...r, changes: [...(r.changes ?? []).filter((c) => c.setting_id !== target), change] } : r,
          );
          db.run = { ...db.run, repos };
          return json(route, { ...db.run, switched_on: change });
        }
        if (sub === "decisions") {
          const b = (body ?? {}) as { choice?: string };
          if (b.choice) db.run = { ...db.run, choice: b.choice };
          return json(route, { ok: true });
        }
        if (sub === "apply") {
          const repos = (body as { repos?: string[] } | null)?.repos;
          db.run = { ...db.run, state: "applying", retry: repos ?? null };
          return json(route, { ok: true }, 202);
        }
        if (sub === "undo" && (body as { items?: unknown[] } | null)?.items?.length) {
          const one = (body as { items: { repo: string; setting_id: string }[] }).items[0];
          const repos = (db.run.repos as { repo: string; changes?: Item[] }[]).map((r) =>
            r.repo === one.repo ? { ...r, changes: (r.changes ?? []).map((c) => (c.setting_id === one.setting_id ? { ...c, undone: true } : c)) } : r,
          );
          db.run = { ...db.run, repos, undo: { restored: 1, skipped: [], partial: true } };
          return json(route, db.run);
        }
        if (sub === "undo") {
          db.run = {
            ...db.run,
            state: "undone",
            undo: { restored: 12, skipped: [{ repo: "acme/web-app", setting_id: "stale_prs.days_to_stale", title: "Days before a pull request is stale", reason: "changed by sam on Nov 10" }], partial: false },
          };
          return json(route, db.run);
        }
      }
      return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
    },
  );
  return db;
}

/** The results after an apply: every repo done except the ones in `failOn`; a retry fixes them. */
function applied(db: SetupDb): Record<string, unknown> {
  const retry = (db.run.retry as string[] | null) ?? null;
  const prev = (db.run.results as { repo: string; state: string }[] | undefined) ?? [];
  const repos = (db.run.repos as { repo: string }[]).map((r) => r.repo);
  const results = repos.map((repo) => {
    const before = prev.find((x) => x.repo === repo);
    if (retry && !retry.includes(repo) && before) return before;
    if (!retry && db.failOn.includes(repo)) {
      return { repo, state: "failed", changed: 0, error: "The reviewer needs the GitHub App on this repo. Install it on GitHub, then retry.", prs: [] };
    }
    if (repo === "acme/web-app") return { repo, state: "done", changed: 9, failed: [], prs: [] };
    if (repo === "acme/api") return { repo, state: "done", changed: 2, prs: [] };
    return { repo, state: "done", changed: 2, prs: [] };
  });
  const failed = results.some((r) => r.state === "failed");
  return { ...db.run, state: failed ? "failed" : "done", results };
}

/**
 * A "Do it for me" run, finished with Keep my settings: what it changed, with
 * the evidence, and stale pull request closing on as a preview (its dry run on).
 */
export function autoDoneRun(): Record<string, unknown> {
  const ready = readyRun();
  const repos = (ready.repos as { repo: string; items: Item[] }[]).map((r) => {
    let items = r.items.map((it) => {
      // In this run nobody had set stale closing on web-app, so it was turned on, as a preview.
      if (r.repo === "acme/web-app" && it.setting_id === "stale_prs.enabled") return { ...it, current: { value: false, set: false }, custom: false };
      return it;
    });
    if (r.repo === "acme/web-app") {
      items = [
        ...items,
        item({ setting_id: "stale_prs.dry_run", feature: "stale_prs", title: "Dry run", current: { value: true, set: false }, recommended: true, source: "default" }),
      ];
    }
    // Auto-merge is never applied by the run itself: it waits for Switch on. A setting someone lacks the permission for stays as it is.
    const changes = items
      .filter((it) => it.setting_id !== "auto_merge.enabled" && !it.needs)
      .filter((it) => !(it.current as { set: boolean }).set && JSON.stringify((it.current as { value: unknown }).value) !== JSON.stringify(it.recommended))
      .map((it) => ({ setting_id: it.setting_id, before: { value: (it.current as { value: unknown }).value, stored: false, row: null }, after: it.recommended, at: iso(0.01), evidence: it.evidence, row_created: false, undone: false }));
    const kept = items.filter((it) => (it.current as { set: boolean }).set && JSON.stringify((it.current as { value: unknown }).value) !== JSON.stringify(it.recommended)).length;
    // Stale closing is on as a preview (its dry run on) and auto-merge waits off for Switch on: two previews on web-app.
    const previews: number = r.repo === "acme/web-app" ? 2 : 0;
    const turned = changes.filter((c) => !/\.dry_run$/.test(c.setting_id as string)).length - (r.repo === "acme/web-app" ? 1 : 0);
    return {
      ...r,
      items: items.map((it) => ({ ...it, decision: (it.current as { set: boolean }).set || it.needs || it.setting_id === "auto_merge.enabled" ? "keep" : "use" })),
      changes,
      summary: {
        changed: turned,
        kept,
        previews,
        text: `Turned on ${turned} ${turned === 1 ? "setting" : "settings"}, kept ${kept} of yours${previews ? `, ${previews} ${previews === 1 ? "is a preview" : "are previews"} you can switch on` : ""}`,
      },
    };
  });
  return {
    ...ready,
    mode: "auto",
    state: "done",
    repos,
    results: repos.map((r) => ({ repo: r.repo, state: "done", changed: r.changes.length, failed: [], prs: [] })),
  };
}

// ── One repo's features (the expanded row) ─────────────────────────────

const feature = (over: Item): Item => ({
  counted: true,
  matches: true,
  mark: "recommended",
  evidence: [],
  switch_on: null,
  needs: null,
  settings: [],
  short: "",
  value_text: "",
  ...over,
});

/** The features of one made-up repo, as GET /api/setup/repos/:owner/:name answers. */
export function repoView(repo: string, switchedOn: string[] = []): Record<string, unknown> {
  const staleOn = switchedOn.includes("stale_prs.enabled");
  const rc = (s: string) => `/reviewer/config?section=${s}&repo=${encodeURIComponent(repo)}`;
  const features: Item[] = [
    feature({
      feature: "reviewer",
      title: "Code review",
      state: "on",
      value_text: "Reviews pull requests labelled ch-review",
      why: "On, with some settings your own; the recommended values are listed below.",
      evidence: [{ text: "Label ch-review exists, used on 31 of the last 50 merged pull requests" }],
      settings_href: rc("reviews"),
      settings: [
        { setting_id: "reviewer.enabled", title: "Review pull requests", value_text: "On", matches: true, custom: false, scope: "repo" },
        { setting_id: "reviewer.label", title: "Review label", value_text: "ch-review", matches: true, custom: false, scope: "repo" },
        { setting_id: "reviewer.instructions", title: "Review focus", value_text: "3 lines", recommended_text: "5 lines", matches: false, custom: false, scope: "repo" },
      ],
      matches: false,
      mark: "yours",
    }),
    feature({
      feature: "tests",
      title: "Tests",
      state: "on",
      value_text: "Checks tests in reviews, reads test results from CI",
      why: "On, as recommended: workflow .github/workflows/e2e.yml runs Playwright tests in job e2e.",
      evidence: [{ text: "Workflow .github/workflows/e2e.yml runs Playwright tests in job e2e", file: ".github/workflows/e2e.yml", line: 41 }],
      settings_href: rc("tests"),
      settings: [
        { setting_id: "tests.verify_tests", title: "Check the tests in a review", value_text: "On", matches: true, custom: false, scope: "repo" },
        { setting_id: "tests.e2e", title: "Read test results", value_text: "On", matches: true, custom: false, scope: "repo" },
        { setting_id: "tests.auto_quarantine", title: "Quarantine flaky tests", value_text: "On", matches: true, custom: false, scope: "team" },
      ],
    }),
    feature({ feature: "ci_labels", title: "CI labels", state: "on", value_text: "Adds E2E:WEB, E2E:IOS", why: "On, as recommended: workflow e2e.yml runs on label E2E:WEB.", settings_href: rc("labels") }),
    feature({
      feature: "auto_merge",
      title: "Auto-merge",
      state: "preview",
      mark: "preview",
      matches: false,
      short: "preview waiting",
      why: "Preview: recommended here, and nothing merges until you switch it on. Over the last 14 days this would have merged 7 pull requests, each once it was approved and build, e2e passed.",
      settings_href: rc("merge"),
      switch_on: { run_id: "run_02", setting_id: "auto_merge.enabled" },
    }),
    feature(
      staleOn
        ? { feature: "stale_prs", title: "Stale pull requests", state: "on", value_text: "Stale after 7 days, closed 7 days later", why: "On, as recommended.", settings_href: "/reviewer/stale?view=settings" }
        : {
            feature: "stale_prs",
            title: "Stale pull requests",
            state: "preview",
            mark: "preview",
            short: "preview waiting",
            value_text: "Stale after 7 days, closed 7 days later, preview only",
            why: "Preview: stale cleanup starts in Preview only. Over the last 14 days this would have marked 3 and closed 2 of the 9 open pull requests (7 days with no activity, then closed 7 days later).",
            settings_href: "/reviewer/stale?view=settings",
            switch_on: { run_id: "run_02", setting_id: "stale_prs.enabled" },
          },
    ),
    feature({ feature: "security", title: "Security fixes", state: "on", value_text: "Watches dependencies and opens fix pull requests", why: "On, as recommended: npm lockfile package-lock.json.", settings_href: "/security/policy" }),
    feature({ feature: "instructions", title: "Coder instructions", state: "on", value_text: "4 lines of instructions", why: "On, as recommended.", settings_href: "/settings/instructions" }),
    feature({ feature: "tags", title: "Release tags", state: "off", short: "off by default", why: "Off by default: CoderHelm pushes release tags only when you ask it to.", settings_href: rc("after-merge") }),
    feature({
      feature: "reminders",
      title: "Review reminders",
      state: "off",
      mark: "yours",
      matches: false,
      short: "kept yours",
      why: "Off: you kept your setting. Recommended on: reviews here wait 2.4 days on average.",
      settings_href: rc("reminders"),
    }),
    feature({ feature: "code_graph", title: "Code graph", state: "off", mark: null, matches: null, short: "needs permission", why: 'Off: turning it on needs the "Manage repos" permission.', needs: "Manage repos", settings_href: "/graph" }),
    feature({ feature: "release_notes", title: "Release notes", state: "not_used", short: "no release tags", why: "Not used here: notes are written for release tags, and this repo has none.", settings_href: rc("release-notes") }),
    feature({ feature: "alerts", title: "Alerts", state: "not_used", short: "doesn't fit", why: "Not used here: no alert source is connected for this repo.", settings_href: "/settings/alerts" }),
    feature({ feature: "git_conventions", title: "Git conventions", state: "on", counted: false, mark: null, matches: null, value_text: "CoderHelm's default names for branches, commits and pull requests", why: "CoderHelm names its branches, commits and pull requests its own way until you set templates.", settings_href: "/settings/workflow", settings: [{ setting_id: "git_conventions.branch", title: "Branch name", value_text: "CoderHelm's default", matches: null, custom: false, scope: "team" }] }),
    feature({ feature: "agent_file", title: "Agent file", state: "on", counted: false, mark: null, matches: null, value_text: "On, refreshes by itself", why: "Always on: CoderHelm refreshes the repo's agent file by itself after merges.", settings_href: "/settings/instructions" }),
  ];
  const counted = features.filter((f) => f.counted);
  const n = (s: string) => counted.filter((f) => f.state === s).length;
  const counts = { on: n("on"), previews: n("preview"), off: n("off"), not_used: n("not_used"), total: n("on") + n("preview") + n("off") };
  return { repo, counts, summary: "", run_id: "run_02", run_at: iso(20), team_repo_count: 6, features };
}

/**
 * A "Do it for me" run the server finished in smart mode, with its lists:
 * what it turned on, a choice the repo argues against (worth a look), what
 * someone chose that it kept and who set it, a preview, and the team-wide
 * settings once, apart from the repo.
 */
export function smartDoneRun(): Record<string, unknown> {
  const items: Item[] = [
    item({ setting_id: "reviewer.enabled", feature: "reviewer", title: "Review pull requests", scope: "repo", current: { value: false, set: false, deliberate: false }, recommended: true, source: "detected", evidence: [{ text: "Label ch-review exists" }] }),
    item({ setting_id: "tests.e2e", feature: "tests", title: "Read test results", scope: "repo", current: { value: false, set: false, deliberate: false }, recommended: true, source: "detected", evidence: [{ text: "Workflow ci.yml runs jest tests in job test", file: ".github/workflows/ci.yml", line: 41 }] }),
    item({
      setting_id: "tests.verify_tests",
      feature: "tests",
      title: "Check the tests in a review",
      scope: "repo",
      current: { value: false, set: true, deliberate: true, set_by: { page: "Reviewer settings", by: "sam@example.com", at: iso(24 * 9) } },
      recommended: true,
      source: "detected",
      worth_a_look: true,
      evidence: [{ text: "package.json depends on jest", file: "package.json", line: 12 }],
    }),
    item({ setting_id: "reviewer.label", feature: "reviewer", title: "Review label", scope: "repo", current: { value: "needs-review", set: true, deliberate: true, set_by: { page: "Reviewer settings" } }, recommended: "ch-review", source: "default" }),
    item({ setting_id: "reminders.cooldown_hours", feature: "reminders", title: "Hours between reminders", scope: "repo", current: { value: 48, set: true, deliberate: true, set_by: { page: "Reviewer settings", by: "dana@example.com", at: iso(24 * 2) } }, recommended: 12, source: "default" }),
    item({ setting_id: "stale_prs.enabled", feature: "stale_prs", title: "Clean up stale pull requests", scope: "repo", risk: "acts", current: { value: false, set: false }, recommended: true, source: "detected", evidence: [{ text: "Over the last 14 days this would have marked 1 and closed 1 of the 4 open pull requests (7 days with no activity, then closed 7 days later)" }] }),
    item({ setting_id: "security.open_prs", feature: "security", title: "Open fix pull requests", scope: "team", risk: "acts", current: { value: false, set: true, deliberate: true, set_by: { page: "Security policy", by: "lee@example.com", at: iso(24 * 30) } }, recommended: true, source: "default" }),
    item({ setting_id: "tests.auto_quarantine", feature: "tests", title: "Quarantine flaky tests", scope: "team", current: { value: false, set: false }, recommended: true, source: "default" }),
  ];
  const changes = ["reviewer.enabled", "tests.e2e", "stale_prs.enabled", "tests.auto_quarantine"].map((id) => {
    const it = items.find((i) => i.setting_id === id) as Item;
    return { setting_id: id, before: { value: false, stored: false, row: false }, after: it.recommended, at: iso(0.01), evidence: it.evidence, row_created: false, undone: false };
  });
  const summary = {
    changed: 3,
    kept: 3,
    previews: 1,
    worth: 1,
    changed_ids: ["reviewer.enabled", "tests.e2e", "tests.auto_quarantine"],
    kept_ids: ["reviewer.label", "reminders.cooldown_hours", "security.open_prs"],
    preview_ids: ["stale_prs.enabled"],
    worth_ids: ["tests.verify_tests"],
    text: "Turned on 3, 1 worth a look, 1 preview to switch on, kept 3 settings someone chose",
  };
  const qi = items.find((i) => i.setting_id === "tests.auto_quarantine") as Item;
  const so = items.find((i) => i.setting_id === "security.open_prs") as Item;
  return {
    run_id: "run_04",
    state: "done",
    mode: "auto",
    choice: "smart",
    created_at: iso(0.1),
    by: "dana",
    tokens_used: 400_000,
    repos: [{ repo: "acme/web-app", state: "ready", items, changes, summary }],
    results: [{ repo: "acme/web-app", state: "done", changed: 4, failed: [], prs: [], summary }],
    team: {
      repo_count: 6,
      items: [
        { ...qi, changed_in: "acme/web-app", change: changes[3] },
        { ...so, changed_in: null, change: null },
      ],
    },
  };
}
