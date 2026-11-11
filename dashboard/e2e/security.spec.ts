import { expect, test, type Page, type Route } from "@playwright/test";
import { pickOption } from "./select";

// Security fixes: the overview with its tiles, filters and findings; the
// banner for a missing GitHub permission; the off state; a finding's page
// with its evidence, fix and timeline; dismissing (reason required, optional
// date) and reopening; the policy (every field, the exact body it saves, the
// plain-words checks, the preview); and an answer the page can't read. Every
// API call is answered here; nothing reaches a real backend or GitHub.

const NOW = Date.now();
const iso = (hoursFromNow: number) => new Date(NOW + hoursFromNow * 3_600_000).toISOString();

const finding = (over: Record<string, unknown> = {}) => ({
  id: "sec_1",
  repo: "acme/web-app",
  manifest: "pnpm-lock.yaml",
  ecosystem: "npm",
  package: "undici",
  version: "6.19.2",
  fixed_version: "6.21.1",
  advisory: {
    ids: ["CVE-2026-31337", "GHSA-q9fx-2w5c-8m4r"],
    primary: "CVE-2026-31337",
    title: "Request smuggling in HTTP parser",
    summary: "A crafted request can smuggle a second request past the proxy.",
    cvss: 9.1,
    cvss_vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N",
    epss: 0.71,
    epss_percentile: 0.99,
    kev: true,
    kev_due: "2026-11-24",
    malware: false,
    cwe: ["CWE-444"],
    published_at: iso(-72),
    urls: ["https://osv.dev/vulnerability/GHSA-q9fx-2w5c-8m4r"],
    source: "dependabot",
  },
  scope: "runtime",
  relation: "transitive",
  path: ["web-app", "next 15.4.2", "undici 6.19.2"],
  verdict: "reachable",
  evidence: {
    summary: "Parser.onHeadersComplete runs on every request through the proxy route.",
    lines: [
      { file: "apps/web/src/server/proxy.ts", line: 44, text: "fetch(upstream, { dispatcher: agent })" },
      { file: "apps/web/src/server/agent.ts", line: 12, text: "new Agent({ pipelining: 1 })" },
    ],
    checked: "3 symbols from the fix commit, 2 call sites",
    confidence: "high",
  },
  tier: "P0",
  due_at: iso(31),
  status: "pr_open",
  pr: { number: 1532, url: "https://github.com/acme/web-app/pull/1532", ci: "passing", state: "open", adopted: false },
  dependabot_alert: { number: 88, url: "https://github.com/acme/web-app/security/dependabot/88" },
  dismissed: null,
  first_seen_at: iso(-5),
  updated_at: iso(-1),
  ...over,
});

const FINDINGS = [
  finding(),
  finding({
    id: "sec_2",
    repo: "acme/api",
    package: "python-multipart",
    version: "0.0.9",
    tier: "P2",
    verdict: "not_reachable",
    status: "open",
    pr: null,
    due_at: iso(27 * 24),
    advisory: { ...finding().advisory, ids: ["CVE-2026-28810"], primary: "CVE-2026-28810", title: "ReDoS in header parsing", kev: false, epss: null },
  }),
];

// One row per fix: a package at one version with every advisory it clears.
const group = (f: ReturnType<typeof finding>, over: Record<string, unknown> = {}) => ({
  key: `${f.repo}|npm|${f.package}|${f.version}`,
  repo: f.repo,
  ecosystem: f.ecosystem,
  package: f.package,
  version: f.version,
  fixed_version: f.fixed_version,
  no_fix: f.fixed_version ? 0 : 1,
  tier: f.tier,
  tier_provisional: f.verdict === "pending",
  due_at: f.due_at,
  status: f.status,
  verdict: f.verdict,
  scope: f.scope,
  kev: f.advisory.kev,
  malware: false,
  epss: f.advisory.epss,
  manifests: [f.manifest],
  pr: f.pr,
  finding_ids: [f.id],
  advisories: [{ finding_id: f.id, primary: f.advisory.primary, ids: f.advisory.ids, title: f.advisory.title, tier: f.tier, fixed_version: f.fixed_version, status: f.status }],
  waiting: null,
  evidence: f.evidence,
  ...over,
});

const TAR = [1, 2, 3].map((i) =>
  finding({
    id: `tar_${i}`,
    package: "tar",
    version: "6.2.1",
    fixed_version: i === 3 ? "7.5.21" : "6.2.2",
    tier: i === 3 ? "P1" : "P2",
    verdict: "unknown",
    status: "open",
    pr: null,
    due_at: iso(i === 3 ? 6 * 24 : 29 * 24),
    evidence: { summary: "tar is imported in 3 files, but the advisory names no functions to look for.", lines: [], checked: "Searched the code for `tar`.", confidence: "low" },
    advisory: { ...finding().advisory, ids: [`GHSA-tar${i}-aaaa-bbbb`], primary: `GHSA-tar${i}-aaaa-bbbb`, title: `tar path traversal ${i}`, kev: false, epss: 0.01 },
  }),
);
const TAR_GROUP = group(TAR[2], {
  finding_ids: TAR.map((f) => f.id),
  fixed_version: "7.5.21",
  advisories: TAR.map((f) => ({ finding_id: f.id, primary: f.advisory.primary, ids: f.advisory.ids, title: f.advisory.title, tier: f.tier, fixed_version: f.fixed_version, status: f.status })).reverse(),
});
const NOFIX = finding({ id: "nofix_1", package: "qs", version: "6.14.0", fixed_version: null, tier: "P3", verdict: "pending", status: "open", pr: null, due_at: iso(80 * 24) });
const GROUPS = [group(FINDINGS[0]), TAR_GROUP, group(FINDINGS[1]), group(NOFIX)];

const CONFIG = {
  enabled: true,
  dry_run: true,
  open_prs: { P0: "now", P1: "hour", P2: "daily", P3: "weekly" },
  post_alerts: { P0: true, P1: true, P2: false, P3: false },
  escalate_half: true,
  due_days: { P0: 3, P1: 7, P2: 30, P3: 90 },
  use_kev_due: true,
  labels: ["security", "dependencies"],
  severity_labels: true,
  reachability_labels: true,
  ecosystem_labels: true,
  major_bumps: "fix_in_pr",
  adopt_bot_prs: true,
  repos: "all",
  ignore: [] as Record<string, unknown>[],
  triage_tokens_per_day: 400_000,
  max_fix_runs_per_day: 3,
  max_fix_tokens_per_day: 2_000_000,
  max_cards_per_day: 10,
};

const overview = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  dry_run: false,
  counts: { open: 14, p0: 1, p1: 1, p2: 7, p3: 5, due_7d: 5, fixed_30d: 23, dismissed: 4, noise_removed: 61 },
  median_hours_to_merge_30d: 19,
  next_due_at: iso(41),
  groups: { open: 4, p0: 1, p1: 1, p2: 1, p3: 1, due_7d: 2 },
  verdicts: { settled: 12, checking: 2 },
  sources: { dependabot: "on", osv: { synced_at: iso(-1), mode: "api" }, kev_synced_at: iso(-1), epss_synced_at: iso(-1) },
  source_rows: [
    { id: "dependabot", name: "Dependabot alerts", gives: "GitHub's own alerts for each repository's dependencies.", state: "ok", reason: "", synced_at: iso(-1), count: 3 },
    { id: "osv", name: "OSV (by API)", gives: "Every package and version matched against advisories.", state: "ok", reason: "", synced_at: iso(-0.5), count: 11 },
    { id: "github_advisory", name: "GitHub advisory feed", gives: "New and changed GitHub advisories as they are published.", state: "never", reason: "No advisory has arrived since Security was turned on.", synced_at: null, count: 0 },
    { id: "kev", name: "CISA known exploited list", gives: "Vulnerabilities attackers are using now.", state: "ok", reason: "", synced_at: iso(-2), count: 1, listed: 1484 },
    { id: "epss", name: "FIRST EPSS", gives: "The chance each vulnerability is exploited in the next 30 days.", state: "ok", reason: "", synced_at: iso(-2), count: 9 },
  ],
  repos: [
    { repo: "acme/web-app", packages: 2712, ecosystems: { npm: 2708, "GitHub Actions": 3, docker: 1 }, read_at: iso(-1), state: "ok", reason: "", unpinned: 2, dependabot: "on", dependabot_reason: "", osv_error: null },
    { repo: "acme/api", packages: 1, ecosystems: { docker: 1 }, read_at: iso(-1), state: "graph_off", reason: "GitHub's dependency graph is off for this repo; turn it on in the repo's Settings, Code security.", unpinned: 0, dependabot: null, dependabot_reason: "", osv_error: null },
  ],
  spend: {
    triage: { packages_today: 38, tokens_today: 92_000, tokens_limit: 400_000, tokens_month: 1_200_000 },
    fix: { runs_today: 1, runs_limit: 3, tokens_today: 310_000, tokens_limit: 2_000_000, tokens_month: 900_000 },
    cards: { today: 2, limit: 10 },
    tokens_month: 2_100_000,
  },
  permission_missing: false,
  ...over,
});

const PLAN = {
  units: [
    { unit: "tar@7.5.21", repo: "acme/web-app", package: "tar", from: "6.2.1", to: "7.5.21", finding_ids: TAR.map((f) => f.id), title: "fix(deps): bump tar 6.2.1 to 7.5.21" },
    { unit: "python-multipart@0.0.18", repo: "acme/api", package: "python-multipart", from: "0.0.9", to: "0.0.18", finding_ids: ["sec_2"], title: "fix(deps): bump python-multipart" },
  ],
  skipped: [],
  runs_today: 1,
  runs_limit: 3,
};

const INSIGHTS = {
  days: Array.from({ length: 30 }, (_, i) => ({ date: new Date(NOW - (29 - i) * 86_400_000).toISOString().slice(0, 10), opened: i === 28 ? 484 : i % 5, fixed: i % 7 === 0 ? 2 : 0, prs_opened: i % 9 === 0 ? 1 : 0, prs_merged: i % 10 === 0 ? 1 : 0, tokens: i > 26 ? 13_516 * (i - 26) : 0 })),
  totals: { opened: 540, fixed: 10, prs_opened: 4, prs_merged: 3, tokens: 81_096, tokens_month: 81_096 },
  median_hours_to_fix: { P0: { fixed: 1, median_hours: 20 }, P1: { fixed: 2, median_hours: 52 }, P2: { fixed: 7, median_hours: null }, P3: { fixed: 0, median_hours: null } },
  fix_tokens_month: 900_000,
  enabled: true,
};

interface Db {
  role: string;
  overview: unknown;
  findings: unknown;
  groups: unknown;
  plan: unknown;
  detail: unknown;
  config: unknown;
  synced: boolean;
  dismissRefuse: string | null;
  calls: { call: string; url: string; body: unknown }[];
}

async function mockApi(page: Page, init: Partial<Db> = {}): Promise<Db> {
  const db: Db = {
    role: "admin",
    overview: overview(),
    findings: { findings: FINDINGS, next_cursor: null },
    groups: { groups: GROUPS, total: GROUPS.length, next_cursor: null },
    plan: PLAN,
    detail: { finding: finding(), timeline: [{ at: iso(-5), text: "Dependabot alert #88 received", link: null }, { at: iso(-4), text: "PR #1532 opened", link: "https://github.com/acme/web-app/pull/1532" }] },
    config: { config: CONFIG, defaults: CONFIG },
    synced: true,
    dismissRefuse: null,
    calls: [],
    ...init,
  };
  const json = (route: Route, body: unknown, code = 200) => route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
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
    if (p.startsWith("/api/security")) db.calls.push({ call: `${method} ${p}`, url: `${p}${url.search}`, body });
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@example.com", avatar_url: "", role: db.role });
    if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "acme/web-app" }, { name: "acme/api" }] });
    if (p === "/api/security/overview") return json(route, db.overview);
    if (p === "/api/security/findings" && method === "GET") return json(route, db.findings);
    if (p === "/api/security/groups") return json(route, db.groups);
    if (p === "/api/security/insights") return json(route, INSIGHTS);
    if (p === "/api/security/fix/plan") return json(route, db.plan);
    if (p === "/api/security/fix") {
      if (db.role !== "admin") return json(route, { error: "Forbidden" }, 403);
      const ids = (body as { finding_ids: string[]; raise_limit: boolean }).finding_ids;
      const raise = (body as { raise_limit: boolean }).raise_limit;
      const units = (db.plan as typeof PLAN).units.filter((u) => u.finding_ids.some((id) => ids.includes(id)));
      const room = raise ? units.length : Math.max(0, 3 - (db.plan as typeof PLAN).runs_today);
      return json(route, {
        started: units.slice(0, room).map((u) => ({ unit: u.unit, ticket: `SEC-${u.package}`, repo: u.repo, package: u.package, finding_ids: u.finding_ids, run_id: null, runs_url: `/?q=SEC-${u.package}` })),
        queued: units.slice(room).map((u) => ({ unit: u.unit, ticket: `SEC-${u.package}`, repo: u.repo, package: u.package, finding_ids: u.finding_ids, reason: "Waiting: today's 3 fix runs are used. Next starts tomorrow." })),
        skipped: [],
        runs_today: (db.plan as typeof PLAN).runs_today + Math.min(units.length, room),
        runs_limit: 3,
      });
    }
    if (/^\/api\/security\/findings\/[^/]+$/.test(p)) return json(route, db.detail);
    if (p.endsWith("/dismiss")) {
      if (db.dismissRefuse) return json(route, { error: db.dismissRefuse }, 400);
      return json(route, { finding: finding({ status: "dismissed" }), synced: db.synced });
    }
    if (p.endsWith("/reopen")) return json(route, { finding: finding(), synced: true });
    if (p === "/api/security/scan") return json(route, { status: "queued" }, 202);
    if (p === "/api/security/config" && method === "GET") return json(route, db.config);
    if (p === "/api/security/config" && method === "PUT") return json(route, { config: body });
    if (p === "/api/security/preview")
      return json(route, {
        would_open: [{ finding_id: "sec_1", repo: "acme/web-app", title: "Bump undici 6.19.2 to 6.21.1", tier: "P0", branch: "coderhelm/security-undici-6.21.1", labels: ["security", "severity:critical"] }],
        would_post: [{ finding_id: "sec_1", repo: "acme/web-app", title: "web-app is affected by CVE-2026-31337", tier: "P0" }],
      });
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

const call = (db: Db, c: string) => db.calls.filter((x) => x.call === c);

test.describe("Security", () => {
  test("the overview shows fixes as rows, the tiles, the spend and the badge, and filters ask the server", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/security");
    await expect(page.getByRole("heading", { name: "Security", exact: true })).toBeVisible();
    // Tiles count fixes first, advisories second.
    await expect(page.getByTestId("tile-now")).toContainText("2");
    await expect(page.getByTestId("tile-now")).toContainText("P0 1, P1 1 · 2 advisories");
    await expect(page.getByTestId("tile-due")).toContainText("next due in 41 h");
    await expect(page.getByTestId("tile-fixed")).toContainText("median 19 h to merge");
    await expect(page.getByTestId("spend")).toContainText("Checked 38 packages today, 92k of 400k tokens");
    await expect(page.getByTestId("spend")).toContainText("Fix runs 1 of 3 today");
    await expect(page.getByTestId("spend")).toContainText("This month 2.1M tokens on security");
    await expect(page.getByTestId("group-count")).toHaveText("4 fixes for 14 advisories");
    const tabs = page.getByTestId("section-tabs");
    await expect(tabs.getByRole("link", { name: "Policy" })).toHaveAttribute("href", /^\/security\/policy\/?$/);
    await expect(page.getByTestId("main-nav").getByRole("link", { name: /Security/ }).getByTestId("count-badge")).toHaveText(/^2/);

    const rows = page.getByTestId("finding-row");
    await expect(rows).toHaveCount(4);
    const first = rows.first();
    await expect(first.getByTestId("tier-pill")).toHaveText("P0");
    await expect(first).toContainText("undici 6.19.2, upgrade to 6.21.1");
    await expect(first).toContainText("Request smuggling in HTTP parser");
    await expect(first).toContainText("CVE-2026-31337 · on exploited list · EPSS 0.71");
    await expect(first.getByTestId("verdict-pill")).toHaveText("Reachable · 2 lines");
    await expect(first.getByRole("link", { name: "PR #1532" })).toHaveAttribute("href", "https://github.com/acme/web-app/pull/1532");
    await expect(first.getByTestId("fix-state")).toContainText("CI passing");
    await expect(first.getByTestId("due")).toContainText("in 31 h");
    // A fix that clears three advisories is one row, expandable.
    const tar = rows.nth(1);
    await expect(tar).toContainText("tar 6.2.1, upgrade to 7.5.21");
    await expect(tar.getByTestId("verdict-pill")).toHaveAttribute("title", /imported in 3 files/);
    await expect(tar.getByTestId("fix-state")).toHaveText("Lockfile update");
    await tar.getByTestId("expand").click();
    const advisories = page.locator('[data-testid="group-advisories"]:visible');
    await expect(advisories).toContainText("tar path traversal 1");
    await expect(advisories.getByRole("link")).toHaveCount(3);
    // Checking is a quiet spinner, and a pending tier is provisional.
    const qs = rows.nth(3);
    await expect(qs.getByTestId("verdict-pill")).toHaveText("Checking");
    await expect(qs.getByTestId("tier-pill")).toHaveAttribute("data-provisional", "true");
    await expect(qs.getByTestId("fix-state")).toHaveText("No fix yet");
    // Two repos: the repo column shows names that never break mid-word.
    await expect(first.getByTestId("repo-cell")).toHaveText("web-app");
    await expect(page.getByTestId("permission-banner")).toHaveCount(0);
    expect(call(db, "GET /api/security/groups")[0].url).toBe("/api/security/groups?status=open");

    await page.getByRole("group", { name: "Tier" }).getByRole("button", { name: /^P0/ }).click();
    await expect(page).toHaveURL(/tier=P0/);
    await expect.poll(() => call(db, "GET /api/security/groups").at(-1)?.url).toBe("/api/security/groups?status=open&tier=P0");
    await page.getByLabel("Search findings").fill("tar");
    await expect.poll(() => call(db, "GET /api/security/groups").at(-1)?.url).toBe("/api/security/groups?status=open&tier=P0&q=tar");
    await pickOption(page.getByLabel("Sort"), "due");
    await expect.poll(() => call(db, "GET /api/security/groups").at(-1)?.url).toBe("/api/security/groups?status=open&tier=P0&q=tar&sort=due");

    await page.getByTestId("scan-now").click();
    await expect(page.getByText("Checking every repo now.")).toBeVisible();
    expect(call(db, "POST /api/security/scan")[0].body).toEqual({ repo: null });

    await rows.first().getByRole("link", { name: "undici 6.19.2" }).click();
    await expect(page).toHaveURL(/\/security\/detail\/?\?id=sec_1/);
  });

  test("one repo picked hides the repo column; a preview is a choice with the recommended way out", async ({ page }) => {
    await mockApi(page, { overview: overview({ dry_run: true }) });
    await page.goto("/security?repo=acme/web-app");
    await expect(page.getByTestId("finding-row").first()).toBeVisible();
    await expect(page.getByTestId("repo-cell")).toHaveCount(0);
    const note = page.getByTestId("dry-run-note");
    await expect(note).toContainText("You chose to preview first");
    await expect(note.getByRole("link", { name: "Open fix PRs (recommended)" })).toHaveAttribute("href", /\/security\/policy\/?#mode$/);
    // The note says it once; the rows say what the fix is.
    await expect(page.getByText("Preview only, no PR")).toHaveCount(0);
  });

  test("the Sources panel says what each source gives, its state, its last read and what came from it", async ({ page }) => {
    await mockApi(page);
    await page.goto("/security");
    const sources = page.getByTestId("sources");
    await expect(sources.getByTestId("source-row")).toHaveCount(5);
    const osv = sources.locator('[data-source="osv"]');
    await expect(osv).toContainText("OSV (by API)");
    await expect(osv).toContainText("On");
    await expect(osv).toContainText("11 open findings");
    await expect(osv).toContainText("Last read");
    const feed = sources.locator('[data-source="github_advisory"]');
    await expect(feed).toContainText("Not synced yet");
    await expect(feed.getByTestId("source-reason")).toContainText("No advisory has arrived");
    await expect(sources.locator('[data-source="kev"]')).toContainText("1 open finding on the list (lists 1,484)");
    const inv = page.getByTestId("inventory");
    await expect(inv.locator('[data-repo="acme/web-app"]')).toContainText("2,712 packages · npm 2,708, GitHub Actions 3, docker 1 · 2 without an exact version");
    await expect(inv.locator('[data-repo="acme/api"]')).toContainText("Dependency graph off");
    await expect(inv.locator('[data-repo="acme/api"]')).toContainText("turn it on in the repo's Settings, Code security");
  });

  test("Dependabot needing a permission shows its state and fix in the Sources panel", async ({ page }) => {
    const reason = "The GitHub App asks for Dependabot alerts: read, but the organization hasn't accepted it yet; an owner accepts it in the organization's Settings, GitHub Apps, then Review request.";
    const o = overview({ permission_missing: true, sources: { dependabot: "not_accepted", dependabot_reason: reason, osv: { synced_at: iso(-1), mode: "api" }, kev_synced_at: null, epss_synced_at: null } });
    (o.source_rows as Record<string, unknown>[])[0] = { id: "dependabot", name: "Dependabot alerts", gives: "GitHub's own alerts.", state: "needs_permission", reason, synced_at: iso(-0.3), count: 0 };
    await mockApi(page, { overview: o });
    await page.goto("/security");
    await expect(page.getByTestId("sources").locator('[data-source="dependabot"]')).toContainText("Needs permission");
    await expect(page.getByTestId("sources").locator('[data-source="dependabot"]')).toContainText("hasn't accepted it yet");
    await expect(page.getByTestId("permission-banner")).toContainText("hasn't accepted it yet");
  });

  test("selecting rows shows the PRs they become, the runs they use, and what started", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/security");
    const rows = page.getByTestId("finding-row");
    await expect(rows).toHaveCount(4);
    // A row with an open PR or no fixed version can't be picked, and says why.
    await expect(rows.nth(0).getByTestId("pick")).toBeDisabled();
    await expect(rows.nth(0).getByTestId("pick")).toHaveAttribute("aria-label", /PR #1532 is already open/);
    await expect(rows.nth(3).getByTestId("pick")).toBeDisabled();
    await expect(rows.nth(3).getByTestId("pick")).toHaveAttribute("aria-label", /No fixed version yet/);
    await page.getByTestId("pick-all").check();
    const bar = page.getByTestId("bulk-bar");
    await expect(bar.getByTestId("bulk-summary")).toHaveText("2 selected (4 advisories): these become 2 PRs (tar, python-multipart)");
    await bar.getByTestId("bulk-open").click();
    const req = page.getByTestId("fix-request");
    await expect(req.getByTestId("fix-units")).toContainText("tar 6.2.1 to 7.5.21 · 3 advisories · web-app");
    await expect(req.getByTestId("fix-budget")).toContainText("Uses 2 of today's 3 fix runs (1 used so far).");
    expect(call(db, "POST /api/security/fix/plan")[0].body).toEqual({ finding_ids: ["tar_1", "tar_2", "tar_3", "sec_2"] });
    await req.getByTestId("fix-confirm").click();
    const res = page.getByTestId("fix-results");
    await expect(res).toContainText("2 started");
    await expect(res.getByTestId("fix-started").first().getByRole("link", { name: "See the run" })).toHaveAttribute("href", "/?q=SEC-tar");
    expect(call(db, "POST /api/security/fix")[0].body).toEqual({ finding_ids: ["tar_1", "tar_2", "tar_3", "sec_2"], raise_limit: false });
  });

  test("past today's limit the rest wait, unless an admin raises it for the request", async ({ page }) => {
    const db = await mockApi(page, { plan: { ...PLAN, runs_today: 2 } });
    await page.goto("/security");
    await page.getByTestId("pick-all").check();
    await page.getByTestId("bulk-open").click();
    const req = page.getByTestId("fix-request");
    await expect(req.getByTestId("fix-budget")).toContainText("Uses 1 of today's 3 fix runs (2 used so far). 1 waits for tomorrow");
    await req.getByTestId("fix-confirm").click();
    await expect(page.getByTestId("fix-queued")).toContainText("Waiting: today's 3 fix runs are used. Next starts tomorrow.");
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByTestId("pick-all").check();
    await page.getByTestId("bulk-open").click();
    await page.getByTestId("raise-limit").check();
    await page.getByTestId("fix-confirm").click();
    await expect(page.getByTestId("fix-results")).toContainText("2 started");
    expect(call(db, "POST /api/security/fix").at(-1)?.body).toEqual({ finding_ids: ["tar_1", "tar_2", "tar_3", "sec_2"], raise_limit: true });
  });

  test("a missing GitHub permission says what to grant and how", async ({ page }) => {
    await mockApi(page, { overview: overview({ permission_missing: true, sources: { dependabot: "no_permission", osv: { synced_at: null, mode: "api" }, kev_synced_at: null, epss_synced_at: null } }) });
    await page.goto("/security");
    const banner = page.getByTestId("permission-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Dependabot alerts aren't read yet");
    await expect(banner).toContainText("Dependabot alerts: read");
    await expect(banner).toContainText("OSV and GitHub's advisory feed still cover your repos");
    await expect(banner.getByRole("link", { name: "GitHub integration" })).toHaveAttribute("href", /^\/settings\/integrations\/github\/?$/);
    // The findings still show.
    await expect(page.getByTestId("finding-row")).toHaveCount(4);
  });

  test("with the feature off, the page says so and points at the policy", async ({ page }) => {
    const db = await mockApi(page, { overview: overview({ enabled: false }) });
    await page.goto("/security");
    await expect(page.getByTestId("security-off")).toContainText("Security fixes are off");
    await expect(page.getByRole("link", { name: "Turn it on" })).toHaveAttribute("href", /^\/security\/policy\/?$/);
    await expect(page.getByTestId("scan-now")).toHaveCount(0);
    expect(call(db, "GET /api/security/groups")).toHaveLength(0);
    await expect(page.getByTestId("main-nav").getByTestId("count-badge")).toHaveCount(0);
  });

  test("a finding shows the advisory, the evidence in file:line lines, the fix and the timeline", async ({ page }) => {
    await mockApi(page);
    await page.goto("/security/detail?id=sec_1");
    await expect(page.getByRole("heading", { level: 1, name: "Request smuggling in HTTP parser" })).toBeVisible();
    await expect(page.getByTestId("page-header")).toContainText("undici 6.19.2 in web-app");
    await expect(page.getByTestId("page-header")).toContainText("On exploited list");
    await expect(page.getByTestId("finding-facts")).toContainText("CVE-2026-31337 · GHSA-q9fx-2w5c-8m4r · CVSS 9.1 · EPSS 0.71 (99th) · due");
    await expect(page.getByRole("heading", { name: "Why we think web-app is affected" })).toBeVisible();
    const lines = page.getByTestId("evidence-lines");
    await expect(lines).toContainText("apps/web/src/server/proxy.ts:44");
    await expect(lines).toContainText("new Agent({ pipelining: 1 })");
    await expect(lines).toContainText("dependency path: web-app > next 15.4.2 > undici 6.19.2 (runtime, transitive)");
    await expect(page.getByTestId("evidence")).toContainText("Confidence high.");
    await expect(page.getByTestId("fix")).toContainText("Fixed in undici 6.21.1");
    await expect(page.getByTestId("fix")).toContainText("is open; CI is passing.");
    await expect(page.getByTestId("fix").getByRole("link", { name: "Dependabot alert #88" })).toBeVisible();
    await expect(page.getByTestId("fix-pr-link")).toHaveText("PR #1532, CI passing");
    await expect(page.getByTestId("fix-pr-link")).toHaveAttribute("href", "https://github.com/acme/web-app/pull/1532");
    await expect(page.getByTestId("open-fix-pr")).toHaveCount(0);
    await expect(page.getByTestId("timeline")).toContainText("Dependabot alert #88 received");
    await expect(page.getByTestId("timeline").getByRole("link", { name: "PR #1532 opened" })).toBeVisible();
    await expect(page.getByTestId("advisory")).toContainText("On CISA's list of exploited vulnerabilities");
  });

  test("dismissing needs a reason, takes an optional date, and is confirmed in the page; reopening undoes it", async ({ page }) => {
    const db = await mockApi(page);
    let dialogs = 0;
    page.on("dialog", (d) => {
      dialogs++;
      void d.dismiss();
    });
    await page.goto("/security/detail?id=sec_1");
    await page.getByTestId("dismiss-open").click();
    const form = page.getByTestId("dismiss-form");
    await expect(form).toContainText("the Dependabot alert is dismissed too");
    await form.getByTestId("dismiss-confirm").click();
    await expect(form.getByRole("alert")).toHaveText("Say why, so the next person who looks knows.");
    expect(call(db, "POST /api/security/findings/sec_1/dismiss")).toHaveLength(0);

    await form.getByLabel("Why").fill("  The pipelining option is off in every environment.  ");
    await form.getByLabel("Bring it back on (optional)").fill("2099-01-31");
    await form.getByTestId("dismiss-confirm").click();
    await expect(page.getByText("Dismissed here and on the Dependabot alert.")).toBeVisible();
    expect(call(db, "POST /api/security/findings/sec_1/dismiss")[0].body).toEqual({ reason: "The pipelining option is off in every environment.", until: "2099-01-31" });
    expect(dialogs).toBe(0);

    // The server's refusal is shown as it said it.
    db.dismissRefuse = "The date it comes back is in the past.";
    await page.getByTestId("dismiss-open").click();
    await page.getByTestId("dismiss-form").getByLabel("Why").fill("Not used.");
    await page.getByTestId("dismiss-form").getByTestId("dismiss-confirm").click();
    await expect(page.getByTestId("dismiss-form").getByRole("alert")).toHaveText("The date it comes back is in the past.");

    // Without a date it goes as null; with only read access, the alert stays open and the page says so.
    db.dismissRefuse = null;
    db.synced = false;
    await page.getByTestId("dismiss-form").getByTestId("dismiss-confirm").click();
    await expect(page.getByText("The Dependabot alert stays open")).toBeVisible();
    expect(call(db, "POST /api/security/findings/sec_1/dismiss")[2]?.body).toEqual({ reason: "Not used.", until: null });

    db.detail = {
      finding: finding({ status: "dismissed", dismissed: { by: "admin@example.com", reason: "Not used.", until: null, at: iso(0) } }),
      timeline: [],
    };
    await page.reload();
    await expect(page.getByTestId("dismissed-note")).toContainText("Not used.");
    await expect(page.getByTestId("dismissed-note")).toContainText("stays dismissed until someone reopens it");
    await expect(page.getByTestId("dismiss-open")).toHaveCount(0);
    await page.getByTestId("reopen").click();
    await expect.poll(() => call(db, "POST /api/security/findings/sec_1/reopen").length).toBe(1);
  });

  test("a finding's page opens a fix PR, or says why it can't", async ({ page }) => {
    const db = await mockApi(page, { detail: { finding: TAR[2], timeline: [] }, plan: { ...PLAN, units: [PLAN.units[0]] } });
    await page.goto("/security/detail?id=tar_3");
    const btn = page.getByTestId("open-fix-pr");
    await expect(btn).toHaveText("Open fix PR");
    await btn.click();
    await expect(page.getByTestId("fix-units")).toContainText("tar 6.2.1 to 7.5.21");
    await expect(page.getByTestId("fix-budget")).toContainText("Uses 1 of today's 3 fix runs");
    await page.getByTestId("fix-confirm").click();
    await expect(page.getByTestId("fix-results")).toContainText("1 started");
    expect(call(db, "POST /api/security/fix")[0].body).toEqual({ finding_ids: ["tar_3"], raise_limit: false });

    db.detail = { finding: NOFIX, timeline: [] };
    await page.goto("/security/detail?id=nofix_1");
    await expect(page.getByTestId("open-fix-pr")).toBeDisabled();
    await expect(page.getByTestId("open-fix-pr")).toHaveText("No fixed version yet");
    await expect(page.getByTestId("fix-cannot")).toContainText("No version of the package fixes this yet");
  });

  test("the policy recommends opening PRs, and saves the daily limits", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/security/policy");
    const mode = page.getByTestId("sec-mode");
    await expect(mode.getByTestId("mode-open")).toContainText("Recommended");
    await expect(mode.getByTestId("mode-preview")).toHaveAttribute("aria-checked", "true");
    await mode.getByTestId("mode-open").click();
    await expect(mode.getByTestId("mode-open")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("limit-max_fix_runs_per_day").fill("21");
    await expect(page.getByText("From 0 to 20.")).toBeVisible();
    await page.getByTestId("limit-max_fix_runs_per_day").fill("5");
    await page.getByTestId("limit-triage_tokens_per_day").fill("200000");
    await page.getByTestId("policy-save-bar").getByRole("button", { name: "Save policy" }).click();
    await expect(page.getByText("Security policy saved")).toBeVisible();
    expect(call(db, "PUT /api/security/config")[0].body).toMatchObject({ dry_run: false, max_fix_runs_per_day: 5, triage_tokens_per_day: 200_000, max_fix_tokens_per_day: 2_000_000, max_cards_per_day: 10 });
  });

  test("turning Security on picks opening PRs unless preview is chosen", async ({ page }) => {
    const db = await mockApi(page, { config: { config: { ...CONFIG, enabled: false }, defaults: { ...CONFIG, enabled: false, dry_run: false } } });
    await page.goto("/security/policy");
    await page.getByTestId("sec-enabled").click();
    await expect(page.getByTestId("mode-open")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("policy-save-bar").getByRole("button", { name: "Save policy" }).click();
    await expect(page.getByText("Security policy saved")).toBeVisible();
    expect(call(db, "PUT /api/security/config")[0].body).toMatchObject({ enabled: true, dry_run: false });
  });

  test("Analytics has a Security view with findings, fix PRs, time to fix and spend", async ({ page }) => {
    await mockApi(page);
    await page.goto("/analytics?tab=security");
    await expect(page.getByTestId("sec-opened")).toContainText("540");
    await expect(page.getByTestId("sec-fixed")).toContainText("3 fix PRs merged of 4 opened");
    await expect(page.getByTestId("sec-ttf")).toContainText("20 h · 2 d");
    await expect(page.getByTestId("sec-tokens")).toContainText("981k");
    await expect(page.getByRole("heading", { name: "Findings opened and fixed per day" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Median time to fix by tier" })).toBeVisible();
  });

  test("the policy saves every field in the exact body, with plain checks first", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/security/policy");
    await expect(page.getByRole("heading", { name: "Security policy" })).toBeVisible();

    await page.getByTestId("sec-enabled").click(); // already on: off
    await page.getByTestId("sec-enabled").click(); // and on again
    await page.getByTestId("mode-open").click(); // from preview to opening PRs
    await page.getByRole("group", { name: "Which repos" }).getByRole("button", { name: "Only these" }).click();
    await page.getByTestId("repo-checklist").getByLabel("acme/web-app").check();

    // P2: never; P3 posts to the alerts channel.
    await pickOption(page.getByTestId("tier-P2").getByLabel("Open a pull request"), "off");
    await page.getByTestId("post-P3").click();
    await page.getByTestId("sec-escalate").click();
    await page.getByRole("group", { name: "Major version bumps" }).getByRole("button", { name: "Open an issue only" }).click();
    await page.getByTestId("sec-adopt").click();

    // A deadline out of range is said in plain words and blocks saving.
    await page.getByTestId("due-P1").fill("0");
    await expect(page.getByText("From 1 to 365.")).toBeVisible();
    await page.getByTestId("policy-save-bar").getByRole("button", { name: "Save policy" }).click();
    await expect(page.getByTestId("policy-save-bar")).toContainText("The P1 deadline must be a whole number of days from 1 to 365.");
    expect(call(db, "PUT /api/security/config")).toHaveLength(0);
    await page.getByTestId("due-P1").fill("10");
    await page.getByTestId("sec-kev-due").click();

    // Labels: a duplicate is refused, a new one added, one removed.
    await page.getByTestId("label-input").fill("security");
    await page.getByTestId("label-add").click();
    await expect(page.getByText('"security" is already on the list.')).toBeVisible();
    await page.getByTestId("label-input").fill("cve-fix");
    await page.getByTestId("label-input").press("Enter");
    await page.getByRole("button", { name: "Remove dependencies" }).click();
    await page.getByTestId("sec-eco-labels").click();

    // Ignores need a reason and an end date.
    await page.getByTestId("ignore-advisory").fill("GHSA-7fh5-64p2-3v2j");
    await page.getByTestId("ignore-add-button").click();
    await expect(page.getByText("Say why it is safe to ignore.")).toBeVisible();
    await expect(page.getByText("Pick the date the ignore ends.")).toBeVisible();
    await page.getByTestId("ignore-reason").fill("Build-time only");
    await page.getByTestId("ignore-until").fill("2099-01-31");
    await page.getByTestId("ignore-add-button").click();
    await expect(page.getByTestId("ignore-list")).toContainText("GHSA-7fh5-64p2-3v2j in every repo");

    await page.getByTestId("policy-save-bar").getByRole("button", { name: "Save policy" }).click();
    await expect(page.getByText("Security policy saved")).toBeVisible();
    expect(call(db, "PUT /api/security/config")[0].body).toEqual({
      enabled: true,
      dry_run: false,
      open_prs: { P0: "now", P1: "hour", P2: "off", P3: "weekly" },
      post_alerts: { P0: true, P1: true, P2: false, P3: true },
      escalate_half: false,
      due_days: { P0: 3, P1: 10, P2: 30, P3: 90 },
      use_kev_due: false,
      labels: ["security", "cve-fix"],
      severity_labels: true,
      reachability_labels: true,
      ecosystem_labels: false,
      major_bumps: "issue_only",
      adopt_bot_prs: false,
      repos: ["acme/web-app"],
      ignore: [{ advisory: "GHSA-7fh5-64p2-3v2j", repo: null, reason: "Build-time only", until: "2099-01-31", by: "admin@example.com" }],
      triage_tokens_per_day: 400_000,
      max_fix_runs_per_day: 3,
      max_fix_tokens_per_day: 2_000_000,
      max_cards_per_day: 10,
    });
    await expect(page.getByTestId("policy-save-bar")).toContainText("All changes saved");
  });

  test("the preview shows what would open and post", async ({ page }) => {
    await mockApi(page);
    await page.goto("/security/policy");
    await page.getByTestId("preview-load").click();
    await expect(page.getByTestId("would-open")).toContainText("Bump undici 6.19.2 to 6.21.1 in web-app");
    await expect(page.getByTestId("would-open")).toContainText("coderhelm/security-undici-6.21.1 · security, severity:critical");
    await expect(page.getByTestId("would-post")).toContainText("web-app is affected by CVE-2026-31337");
  });

  test("someone who isn't an admin reads everything and changes nothing", async ({ page }) => {
    const db = await mockApi(page, { role: "member" });
    await page.goto("/security");
    await expect(page.getByTestId("finding-row")).toHaveCount(4);
    await expect(page.getByTestId("scan-now")).toHaveCount(0);
    await expect(page.getByTestId("pick")).toHaveCount(0);
    await expect(page.getByTestId("pick-all")).toHaveCount(0);
    await page.goto("/security/detail?id=sec_1");
    await expect(page.getByTestId("evidence")).toBeVisible();
    await expect(page.getByTestId("dismiss-open")).toHaveCount(0);
    db.detail = { finding: TAR[2], timeline: [] };
    await page.goto("/security/detail?id=tar_3");
    await expect(page.getByTestId("evidence")).toBeVisible();
    await expect(page.getByTestId("open-fix-pr")).toHaveCount(0);
    expect(call(db, "POST /api/security/fix")).toHaveLength(0);
    await page.goto("/security/policy");
    await expect(page.getByText("Only admins can change the policy")).toBeVisible();
    await expect(page.getByTestId("sec-enabled")).toBeDisabled();
    await expect(page.getByTestId("policy-save-bar")).toHaveCount(0);
    expect(call(db, "PUT /api/security/config")).toHaveLength(0);
  });

  test("a reply the page can't read shows an error, never a crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const db = await mockApi(page, { overview: { status: "ok" } });
    await page.goto("/security");
    await expect(page.getByTestId("security-error")).toContainText("answered in a form this page can't read");

    db.overview = overview();
    db.groups = { items: "nope" };
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByTestId("list-error")).toContainText("answered in a form this page can't read");

    db.detail = { finding: { id: "sec_1" }, timeline: "none" };
    await page.goto("/security/detail?id=sec_1");
    await expect(page.getByTestId("finding-error")).toContainText("answered in a form this page can't read");

    db.config = { config: { enabled: "yes" } };
    await page.goto("/security/policy");
    await expect(page.getByTestId("policy-error")).toContainText("answered in a form this page can't read");
    await expect(page.getByTestId("policy-save-bar")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
