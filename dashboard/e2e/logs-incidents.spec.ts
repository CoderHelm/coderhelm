import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The Logs page's incidents and learned repos, against a mocked backend.
// Nothing reaches a real server.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const API = "your-team/ledger-api";
const INFRA = "your-team/infra-live";
const MIN = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

type Finding = Record<string, unknown> & { rec_id: string };

const INCIDENT = {
  id: "INC-7F3A9C21B4E0",
  lead: "rec_dns",
  members: [
    { rec_id: "rec_dns", title: "OpenSearch endpoint DNS ENOTFOUND in /ecs/prod-ledger-api" },
    { rec_id: "rec_idx", title: "OpenSearch class_index index missing (404) in /ecs/prod-ledger-api" },
    { rec_id: "rec_web", title: "Facets failing on OpenSearch errors in /ecs/prod-storefront" },
  ],
  log_groups: ["/ecs/prod-ledger-api", "/ecs/prod-storefront"],
  first_seen: ago(40 * MIN),
  last_seen: ago(33 * MIN),
  action:
    "Started a fix in your-team/infra-live: Set OPENSEARCH_NODE to vpc-ledger-os-opt-abc.us-east-1.es.amazonaws.com where envs/prod/ledger-api.tf sets it. The pull request follows here when it opens.",
  diagnosis: {
    place: "infra",
    service: "opensearch",
    resource: "ledger-os-opt",
    headline: "OpenSearch domain ledger-os-opt2 replaced by ledger-os-opt",
    summary:
      "The OpenSearch domain ledger-os-opt2 was replaced by ledger-os-opt (VPC only) at Nov 12 05:18 UTC; /ecs/prod-ledger-api still reads the old hostname from envs/prod/ledger-api.tf in your-team/infra-live. The new OpenSearch domain ledger-os-opt has no class_index index yet, so /ecs/prod-ledger-api gets 404s.",
    facts: [
      "The domain ledger-os-opt2 no longer exists in the account.",
      "The domain ledger-os-opt exists with the endpoint vpc-ledger-os-opt-abc.us-east-1.es.amazonaws.com (VPC only).",
      "CloudTrail: DeleteDomain on ledger-os-opt2 at Nov 12 05:18 UTC by deploy-bot.",
      "/ecs/prod-ledger-api reads its endpoint from OPENSEARCH_NODE (src/config/search.config.ts in your-team/ledger-api).",
    ],
    fix: {
      repo: INFRA,
      path: "envs/prod/ledger-api.tf",
      change: "Set OPENSEARCH_NODE to vpc-ledger-os-opt-abc.us-east-1.es.amazonaws.com where envs/prod/ledger-api.tf sets it.",
    },
    steps: ["Rerun class_index_sync (dags/class_index_sync.py in your-team/data-jobs) to rebuild the class_index index on ledger-os-opt."],
    recovered_at: "",
    changed_at: ago(41 * MIN),
    permissions: [],
  },
};

function finding(over: Partial<Finding> & Pick<Finding, "rec_id">): Finding {
  return {
    title: "Checkout times out at the payment step",
    summary: "The checkout function hits its 30 second limit.",
    suggested_action: "",
    severity: "critical",
    status: "new",
    log_group: "/ecs/prod-ledger-api",
    account_id: "111122223333",
    error_pattern: "",
    error_count: 12,
    seen_count: 12,
    first_seen: ago(40 * MIN),
    last_seen: ago(33 * MIN),
    suspected_location: null,
    plan_id: null,
    repo: null,
    repo_mapped: false,
    console_url: null,
    fix: null,
    auto: null,
    ...over,
  };
}

const DNS = finding({
  rec_id: "rec_dns",
  title: INCIDENT.members[0].title,
  status: "fixing",
  error_count: 460,
  repo: INFRA,
  fix: { state: "running", ticket_id: "LOG-1A2B3C4D", run_id: "01JRUN", run_status: "running", pr_number: null, pr_url: null, auto: true, started_at: ago(30 * MIN) },
  auto: { status: "started", reason: "" },
  incident_id: INCIDENT.id,
  incident: INCIDENT,
});
const IDX = finding({
  rec_id: "rec_idx",
  title: INCIDENT.members[1].title,
  error_count: 137,
  auto: { status: "skipped", reason: `same cause as "${INCIDENT.members[0].title}"; one fix covers both` },
  incident_id: INCIDENT.id,
  incident: INCIDENT,
});
const WEB = finding({
  rec_id: "rec_web",
  title: INCIDENT.members[2].title,
  severity: "warning",
  log_group: "/ecs/prod-storefront",
  error_count: 180,
  auto: { status: "skipped", reason: "below the minimum severity" },
  incident_id: INCIDENT.id,
  incident: INCIDENT,
});
const LEARNED = { reason: "/ecs/prod-ledger-api-worker, a log group of the same service, is saved to ledger-api.", at: ago(20 * MIN) };
const CODE_BUG = finding({
  rec_id: "rec_bug",
  title: "TypeError in the invoice export",
  log_group: "/ecs/prod-ledger-api",
  repo: API,
  repo_mapped: true,
  repo_learned: LEARNED,
});

interface Backend {
  findings: Finding[];
  autofix: Record<string, unknown>;
  calls: { method: string; path: string; body: unknown }[];
}

async function mockApi(page: Page): Promise<Backend> {
  const db: Backend = {
    findings: [DNS, IDX, WEB, CODE_BUG].map((f) => ({ ...f })),
    autofix: {
      enabled: true,
      min_severity: "critical",
      daily_cap: 3,
      scope: "all",
      quiet_hours: null,
      enabled_at: ago(60 * 60 * MIN),
      overrides: [
        { log_group: "/ecs/prod-ledger-api", repo: API, auto: null, min_severity: null, learned: LEARNED },
        { log_group: "/ecs/prod-ledger-api-worker", repo: API, auto: null, min_severity: null },
      ],
    },
    calls: [],
  };
  const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    let body: unknown = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = null;
    }
    db.calls.push({ method: req.method(), path: p + url.search, body });
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: "admin" });
    if (p === "/api/usage") return json(route, { month: "2026-01", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/integrations") return json(route, { can_edit: false, items: [], migrated: 0 });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "your-team", status: "active", current: true }] });
    if (p === "/api/repos")
      return json(route, { repos: [API, INFRA, "your-team/ops-cli"].map((name) => ({ name, enabled: true, ticket_source: "github" })) });
    if (p === "/api/recommendations/notify") return json(route, { notify_mode: "team", saved: false, webhooks: { teams: { set: false, hint: "" }, slack: { set: false, hint: "" } } });
    if (p === "/api/log-findings") {
      const counts = { new: 0, acknowledged: 0, fixing: 0, fixed: 0, ignored: 0 } as Record<string, number>;
      for (const f of db.findings) counts[f.status as string] += 1;
      return json(route, {
        findings: db.findings,
        counts,
        log_groups: [...new Set(db.findings.map((f) => f.log_group as string))].sort(),
        aws_connected: true,
        analysis_failing: [],
      });
    }
    if (p === "/api/log-findings/autofix") {
      if (req.method() === "PUT") {
        db.autofix = { ...(body as Record<string, unknown>) };
        return json(route, { ok: true, autofix: db.autofix });
      }
      return json(route, { autofix: db.autofix, runs_today: 1, posts_to: { mode: "team", saved: false, channels: ["Microsoft Teams"], team_alerts: true } });
    }
    if (/^\/api\/log-findings\/[^/]+\/samples$/.test(p)) return json(route, { samples: [] });
    return json(route, {});
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true });
}

async function noSideScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(wide).toBeLessThanOrEqual(1);
}

for (const width of [1280, 390]) {
  test(`three findings with one cause are one incident row at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    await mockApi(page);
    await page.goto("/logs");
    const row = page.getByTestId(`incident-${INCIDENT.id}`);
    await expect(row).toBeVisible();
    // One row for the incident; its findings don't repeat as rows.
    for (const id of ["rec_dns", "rec_idx", "rec_web"]) await expect(page.getByTestId(`finding-${id}`)).toHaveCount(0);
    await expect(page.getByTestId("finding-rec_bug")).toBeVisible();
    await expect(row).toContainText("OpenSearch domain ledger-os-opt2 replaced by ledger-os-opt");
    await expect(row).toContainText("3 findings, one cause");
    await expect(row).toContainText("Infrastructure as code");
    await expect(row).toContainText("Started a fix in your-team/infra-live");
    await row.getByRole("button", { name: /details of OpenSearch domain/i }).click();
    const detail = row.getByTestId("incident-detail");
    await expect(detail).toContainText("still reads the old hostname from envs/prod/ledger-api.tf");
    await expect(detail).toContainText("Rerun class_index_sync");
    await expect(detail).toContainText("CloudTrail: DeleteDomain on ledger-os-opt2");
    await noSideScroll(page);
    await shot(page, `logs-incident-row-${width}`);

    // The card's link: the incident above its findings.
    await row.getByRole("button", { name: /Show the findings of/ }).click();
    await expect(page).toHaveURL(/incident=INC-7F3A9C21B4E0/);
    const panel = page.getByTestId("incident-panel");
    await expect(panel).toContainText("3 findings, one cause");
    for (const id of ["rec_dns", "rec_idx", "rec_web"]) await expect(page.getByTestId(`finding-${id}`)).toBeVisible();
    await expect(page.getByTestId("finding-rec_bug")).toHaveCount(0);
    await expect(page.getByTestId("finding-rec_idx")).toContainText("one fix covers both");
    await noSideScroll(page);
    await shot(page, `logs-incident-view-${width}`);
    await panel.getByRole("button", { name: "All findings" }).click();
    await expect(page.getByTestId(`incident-${INCIDENT.id}`)).toBeVisible();
  });

  test(`a learned repo is shown as learned and can be changed at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    const db = await mockApi(page);
    await page.goto("/logs?finding=rec_bug");
    const row = page.getByTestId("finding-rec_bug");
    await expect(row).toContainText(`${API} (learned)`);
    const learned = row.getByTestId("finding-learned");
    await expect(learned).toContainText("Learned");
    await expect(row).toContainText("a log group of the same service, is saved to ledger-api");
    await noSideScroll(page);
    await shot(page, `logs-learned-finding-${width}`);

    // Change: the settings open on the log group, marked learned.
    await learned.getByRole("button", { name: "Change" }).click();
    const group = page.getByTestId("group-/ecs/prod-ledger-api");
    await expect(group.getByTestId("learned-/ecs/prod-ledger-api")).toContainText("Learned");
    await expect(page.getByTestId("group-/ecs/prod-ledger-api-worker").getByText("Learned")).toHaveCount(0);
    await group.scrollIntoViewIfNeeded();
    await noSideScroll(page);
    await shot(page, `logs-learned-settings-${width}`);

    // A person picks another repo: it is theirs now, and saved.
    await group.getByRole("button", { name: /Repo for \/ecs\/prod-ledger-api/ }).click();
    await page.getByTestId(width > 500 ? "combo-popover" : "combo-sheet").getByRole("option", { name: INFRA, exact: true }).click();
    await expect(group.getByTestId("learned-/ecs/prod-ledger-api")).toHaveCount(0);
    await page.getByTestId("autofix-save").click();
    await expect.poll(() => db.calls.filter((c) => c.method === "PUT").length).toBe(1);
    const sent = db.calls.find((c) => c.method === "PUT")!.body as { overrides: { log_group: string; repo: string }[] };
    expect(sent.overrides.find((o) => o.log_group === "/ecs/prod-ledger-api")?.repo).toBe(INFRA);
  });
}
