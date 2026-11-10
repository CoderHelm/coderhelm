import type { Page, Route } from "@playwright/test";
import { at, PR_URL, REPO, RUN_ID } from "./agent-log-data";

// The run page's API for the agent log specs. Every call is answered here;
// nothing reaches a real backend.

export interface LogBackend {
  log: unknown;
  run: Record<string, unknown>;
  traces: unknown[];
  logFail: boolean;
  logCalls: number;
}

export function logRun(over: Record<string, unknown> = {}) {
  return {
    run_id: RUN_ID,
    status: "completed",
    ticket_source: "github",
    ticket_id: `${REPO}#88`,
    title: "Put the More menu items behind the menuV2 flag",
    repo: REPO,
    branch: "coderhelm/web-88-more-menu-flag",
    pr_url: PR_URL,
    pr_number: 212,
    current_pass: "review",
    tokens_in: 900_000,
    tokens_out: 40_000,
    cache_read_tokens: 2_100_000,
    cache_write_tokens: 30_000,
    files_modified: ["src/components/more-menu/index.tsx", "src/components/venue-subnav.ts", "src/components/more-menu/flag.ts"],
    duration_s: 4100,
    created_at: at(0),
    updated_at: at(4100),
    pass_history: [
      { pass: "triage", started_at: at(0) },
      { pass: "plan", started_at: at(20) },
      { pass: "implement", started_at: at(120) },
      { pass: "pr", started_at: at(1300) },
      { pass: "review", started_at: at(1400) },
    ],
    progress_notes: [
      { message: "Tool: read_file — path: src/components/more-menu/index.tsx", timestamp: at(130) },
      { message: "Tool: search_code — query: MoreMenu", timestamp: at(131) },
      { message: "Tool: edit_file — path: src/components/more-menu/index.tsx", timestamp: at(400) },
      { message: "Plan check: 3 of 3 tasks done", timestamp: at(1200) },
    ],
    checks: null,
    pr_review: null,
    ...over,
  };
}

export const LOG_TRACES = [
  { pass: "plan", duration_ms: 90_000, input_tokens: 20_000, output_tokens: 3_000, cost_usd: 0.21, timestamp: at(20) },
  { pass: "implement", duration_ms: 1_100_000, input_tokens: 700_000, output_tokens: 30_000, cache_read_tokens: 1_900_000, cost_usd: 1.92, timestamp: at(120) },
  { pass: "ci_fix", duration_ms: 190_000, input_tokens: 40_000, output_tokens: 2_000, cost_usd: 0.31, timestamp: at(2200) },
  { pass: "ci_fix:2", duration_ms: 120_000, input_tokens: 30_000, output_tokens: 1_000, cost_usd: 0.18, timestamp: at(2600) },
];

export async function mockRunApi(page: Page, init: Partial<LogBackend> & { log: unknown }): Promise<LogBackend> {
  const db: LogBackend = { run: logRun(), traces: LOG_TRACES, logFail: false, logCalls: 0, ...init };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "person@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/support/badge") return json(route, { waiting: 0, queue_open: null });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/plugins/catalog") return json(route, { plugins: [] });
    if (p === "/api/skills/asks") return json(route, { asks: [] });
    if (p === "/api/skills/used") return json(route, { skills: [], agents: [], sources: [], standards: [] });
    const m = p.match(/^\/api\/runs\/([^/]+)(\/.*)?$/);
    if (m) {
      const sub = m[2] ?? "";
      if (sub === "") return json(route, db.run);
      if (sub === "/openspec") return json(route, {});
      if (sub === "/traces") return json(route, { traces: db.traces });
      if (sub === "/asks") return json(route, { asks: [] });
      if (sub === "/agent-log") {
        db.logCalls += 1;
        if (db.logFail) return route.fulfill({ status: 500, body: "" });
        return json(route, db.log);
      }
    }
    return json(route, { error: `Not mocked: ${p}` }, 404);
  });
  return db;
}
