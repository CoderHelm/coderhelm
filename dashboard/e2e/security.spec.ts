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

const NEXT_READ = "Read again whenever a dependency file changes on the default branch, and daily; new GitHub advisories are checked against it as they arrive.";

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
  bundle: "per_repo",
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
    { id: "github_advisory", name: "GitHub advisory feed", gives: "New and changed GitHub advisories as they are published.", state: "ok", reason: "Waiting for GitHub's first webhook; checked by polling at Nov 11, 06:00 UTC.", synced_at: iso(-1), count: 0 },
    { id: "kev", name: "CISA known exploited list", gives: "Vulnerabilities attackers are using now.", state: "ok", reason: "", synced_at: iso(-2), count: 1, listed: 1484 },
    { id: "epss", name: "FIRST EPSS", gives: "The chance each vulnerability is exploited in the next 30 days.", state: "ok", reason: "", synced_at: iso(-2), count: 9 },
  ],
  repos: [
    { repo: "acme/web-app", packages: 2712, ecosystems: { npm: 2708, "GitHub Actions": 3, docker: 1 }, read_at: iso(-1), state: "ok", reason: "", unpinned: 2, dependabot: "on", dependabot_reason: "", osv_error: null, branch: "main", next_read: NEXT_READ },
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

const bump = (pkg: string, from: string, to: string, ids: string[], over: Record<string, unknown> = {}) => ({
  package: pkg,
  from,
  to,
  major: from.split(".")[0] !== to.split(".")[0],
  manifest: "pnpm-lock.yaml",
  verdict: "unknown",
  tier: "P2",
  finding_ids: ids,
  advisories: ids.map((id) => `GHSA-${id}`),
  ...over,
});
const unit = (repo: string, title: string, bumps: ReturnType<typeof bump>[], over: Record<string, unknown> = {}) => ({
  unit: `bundle:ask:${repo}`,
  ticket: `SEC-${repo.split("/")[1].toUpperCase()}`,
  repo,
  title,
  branch: `coderhelm/security-updates-2026-11-11-${repo.split("/")[1]}`,
  labels: ["security", "dependencies", "severity:high", "javascript"],
  tier: "P1",
  bundle: true,
  finding_ids: bumps.flatMap((b) => b.finding_ids),
  advisories: bumps.reduce((n, b) => n + b.advisories.length, 0),
  majors: bumps.filter((b) => b.major).length,
  bumps,
  joins: null,
  estimated_tokens: 120_000 + 60_000 * bumps.filter((b) => b.major).length,
  package: bumps.length === 1 ? bumps[0].package : `${bumps.length} packages`,
  from: bumps[0].from,
  to: bumps[0].to,
  ...over,
});
const PLAN = {
  units: [
    unit("acme/web-app", "fix(deps): bump tar 6.2.1 to 7.5.21", [bump("tar", "6.2.1", "7.5.21", TAR.map((f) => f.id), { tier: "P1" })], { unit: "tar@7.5.21", package: "tar", bundle: false }),
    unit("acme/api", "fix(deps): bump python-multipart", [bump("python-multipart", "0.0.9", "0.0.18", ["sec_2"])], { unit: "python-multipart@0.0.18", package: "python-multipart", bundle: false }),
  ],
  skipped: [] as { finding_id: string; reason: string; pr_url?: string }[],
  runs_today: 1,
  runs_limit: 3,
  pr_count: 2,
  joins: 0,
  tokens_today: 310_000,
  tokens_limit: 2_000_000,
  estimated_tokens: 300_000,
};

const INSIGHTS = {
  days: Array.from({ length: 30 }, (_, i) => ({ date: new Date(NOW - (29 - i) * 86_400_000).toISOString().slice(0, 10), opened: i === 28 ? 484 : i % 5, fixed: i % 7 === 0 ? 2 : 0, prs_opened: i % 9 === 0 ? 1 : 0, prs_merged: i % 10 === 0 ? 1 : 0, tokens: i > 26 ? 13_516 * (i - 26) : 0 })),
  totals: { opened: 540, fixed: 10, prs_opened: 4, prs_merged: 3, tokens: 81_096, tokens_month: 81_096 },
  median_hours_to_fix: { P0: { fixed: 1, median_hours: 20 }, P1: { fixed: 2, median_hours: 52 }, P2: { fixed: 7, median_hours: null }, P3: { fixed: 0, median_hours: null } },
  fix_tokens_month: 900_000,
  enabled: true,
};

interface Select {
  all: true;
  filters: { status: string; tier: string; repo: string; q: string };
  except_ids: string[];
}

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
  /** Plans by the request: the panel asks again when a row is removed. `select`: the filter form. */
  planFor?: (ids: string[], combine: string, select?: Select) => unknown;
  /** The plan answers this error (400) instead. */
  planError?: string | null;
  slowFix?: boolean;
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
    if (p === "/api/security/groups") return json(route, typeof db.groups === "function" ? db.groups(url) : db.groups);
    if (p === "/api/security/insights") return json(route, INSIGHTS);
    if (p === "/api/security/fix/plan") {
      if (db.planError) return json(route, { error: db.planError }, 400);
      const b = body as { finding_ids?: string[]; select?: Select; combine: string };
      return json(route, db.planFor ? db.planFor(b.finding_ids ?? [], b.combine, b.select) : db.plan);
    }
    if (p === "/api/security/fix") {
      if (db.role !== "admin") return json(route, { error: "Forbidden" }, 403);
      const b = body as { finding_ids?: string[]; select?: Select; raise_limit: boolean; combine: string };
      const ids = b.finding_ids ?? [];
      const raise = b.raise_limit;
      const plan = (db.planFor ? db.planFor(ids, b.combine, b.select) : db.plan) as typeof PLAN;
      const units = b.select ? plan.units : plan.units.filter((u) => u.finding_ids.some((id) => ids.includes(id)));
      const room = raise ? units.length : Math.max(0, 3 - plan.runs_today);
      if (db.slowFix) await new Promise((r) => setTimeout(r, 400));
      return json(route, {
        started: units.slice(0, room).map((u) => ({ unit: u.unit, ticket: `SEC-${u.package}`, repo: u.repo, package: u.package, finding_ids: u.finding_ids, run_id: null, runs_url: `/?q=SEC-${u.package}`, joins: (u.joins as { number: number } | null)?.number ?? null })),
        queued: units.slice(room).map((u) => ({ unit: u.unit, ticket: `SEC-${u.package}`, repo: u.repo, package: u.package, finding_ids: u.finding_ids, reason: "Waiting: today's 3 fix runs are used. Next starts tomorrow." })),
        skipped: [],
        runs_today: plan.runs_today + Math.min(units.length, room),
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
        would_open: [
          { finding_id: "sec_1", repo: "acme/web-app", title: "fix(deps): security updates for web-app (2 packages, 2 advisories)", tier: "P0", branch: "coderhelm/security-updates-2026-11-11-a1b2c3", labels: ["security", "severity:critical"] },
          { finding_id: "tar_1", repo: "acme/web-app", title: "fix(deps): security updates for web-app (2 packages, 2 advisories)", tier: "P0", branch: "coderhelm/security-updates-2026-11-11-a1b2c3", labels: ["security", "severity:critical"] },
          { finding_id: "sec_2", repo: "acme/api", title: "fix(deps): security updates for api (1 package, 1 advisory)", tier: "P2", branch: "coderhelm/security-updates-2026-11-11-d4e5f6", labels: ["security"] },
        ],
        would_post: [{ finding_id: "sec_1", repo: "acme/web-app", title: "web-app is affected by CVE-2026-31337", tier: "P0" }],
        prs: [
          { ...unit("acme/web-app", "fix(deps): security updates for web-app (2 packages, 2 advisories)", [bump("undici", "6.19.2", "6.21.1", ["sec_1"]), bump("tar", "6.2.1", "6.2.2", ["tar_1"])]), tier: "P0", branch: "coderhelm/security-updates-2026-11-11-a1b2c3", labels: ["security", "severity:critical"] },
          { ...unit("acme/api", "fix(deps): security updates for api (1 package, 1 advisory)", [bump("python-multipart", "0.0.9", "0.0.18", ["sec_2"])]), tier: "P2", joins: { number: 812, url: "https://github.com/acme/api/pull/812" } },
        ],
        pr_count: 1,
      });
    return json(route, { error: `Not mocked: ${method} ${p}` }, 404);
  });
  return db;
}

const call = (db: Db, c: string) => db.calls.filter((x) => x.call === c);

// Screenshots for a person to look at: SECURITY_SHOTS=<dir> writes them.
const SHOTS = process.env.SECURITY_SHOTS;
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  // The bar at the top of the view (below the page's top bar), as a person who just used it sees it.
  await page.getByTestId("bulk-bar").evaluate((e) => e.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

/** The bar and every message in it sit in the page's flow: none of it covers a row, and nothing scrolls sideways. */
async function expectClearOfRows(page: Page) {
  const r = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="bulk-bar"]')!.getBoundingClientRect();
    const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="finding-row"], [data-testid="finding-card"]')]
      .map((e) => e.getBoundingClientRect())
      .filter((b) => b.width > 0 && b.height > 0);
    const hits = rows.filter((b) => b.left < bar.right && bar.left < b.right && b.top < bar.bottom && bar.top < b.bottom).length;
    const doc = document.documentElement;
    return { hits, rows: rows.length, barBottom: bar.bottom, firstRowTop: rows[0]?.top ?? Infinity, sideways: doc.scrollWidth - doc.clientWidth };
  });
  expect(r.rows).toBeGreaterThan(0);
  expect(r.hits).toBe(0);
  expect(r.barBottom).toBeLessThanOrEqual(r.firstRowTop);
  expect(r.sideways).toBeLessThanOrEqual(0);
}

// A long list for "select all": fixes in three repos, 50 a page, as the server pages them.
const REPOS3 = ["acme/web-app", "acme/api", "acme/docs"];
function manyGroups(n: number, idsEach = 1) {
  return Array.from({ length: n }, (_, i) => {
    const pkg = `pkg-${String(i).padStart(3, "0")}`;
    const f = finding({
      id: `f${i}`,
      repo: REPOS3[i % 3],
      package: pkg,
      version: "1.0.0",
      fixed_version: "1.0.1",
      tier: "P2",
      verdict: "unknown",
      status: "open",
      pr: null,
      due_at: iso(20 * 24 + i),
      advisory: { ...finding().advisory, ids: [`GHSA-${pkg}`], primary: `GHSA-${pkg}`, title: `${pkg} advisory`, kev: false, epss: 0.01 },
    });
    const ids = Array.from({ length: idsEach }, (_, k) => (k === 0 ? f.id : `${f.id}_${k}`));
    return group(f, { finding_ids: ids });
  });
}
function paged(all: ReturnType<typeof manyGroups>) {
  return (url: URL) => {
    const at = Number(url.searchParams.get("cursor") || 0);
    const next = at + 50 < all.length ? String(at + 50) : null;
    return { groups: all.slice(at, at + 50), total: all.length, fixable_total: all.length, next_cursor: next };
  };
}
/** The server's plan for a long selection: one PR per repo; past today's runs the last repo waits for tomorrow. */
function repoPlan(selected: number, note: string | null = null) {
  return () => {
    const units = REPOS3.map((r, i) =>
      unit(r, `fix(deps): security updates for ${r.split("/")[1]} (${Math.ceil(selected / 3)} packages)`, [bump(`pkg-00${i}`, "1.0.0", "1.0.1", [`f${i}`])], {
        starts_now: i < 2,
        waits: i < 2 ? null : "Waiting: today's 3 fix runs are used. Next starts tomorrow.",
      }),
    );
    return {
      units,
      skipped: [],
      runs_today: 1,
      runs_limit: 3,
      pr_count: 3,
      joins: 0,
      starting_now: 2,
      waiting: 1,
      tokens_today: 310_000,
      tokens_limit: 2_000_000,
      estimated_tokens: 360_000,
      selection: { by_filter: true, fixes: selected, findings: selected, matched: selected, left_fixes: 0, left_findings: 0, limit: 1000, note },
    };
  };
}


// A fix still being checked, in the same repo as tar: the mixed list.
const WS = finding({ id: "ws_1", package: "ws", version: "8.17.0", fixed_version: "8.17.1", tier: "P2", verdict: "pending", status: "open", pr: null, due_at: iso(20 * 24), advisory: { ...finding().advisory, ids: ["GHSA-ws01-aaaa-bbbb"], primary: "GHSA-ws01-aaaa-bbbb", title: "ws denial of service", kev: false, epss: 0.02 } });
const MIXED = [group(FINDINGS[0]), TAR_GROUP, group(WS), group(FINDINGS[1]), group(NOFIX)];

/** The plan for what is asked: one bundle per repo, one unit per package when asked so, an open PR that takes it. */
function planFor(joins: { number: number; url: string } | null = null) {
  return (ids: string[], combine: string) => {
    const web = [
      ids.some((id) => id.startsWith("tar_")) ? bump("tar", "6.2.1", "7.5.21", TAR.map((f) => f.id).filter((id) => ids.includes(id)), { tier: "P1" }) : null,
      ids.includes("ws_1") ? bump("ws", "8.17.0", "8.17.1", ["ws_1"], { verdict: "pending" }) : null,
    ].filter((b): b is ReturnType<typeof bump> => !!b);
    const api = ids.includes("sec_2") ? [bump("python-multipart", "0.0.9", "0.0.18", ["sec_2"], { verdict: "not_reachable" })] : [];
    const title = (name: string, n: number, a: number) => `fix(deps): security updates for ${name} (${n} package${n === 1 ? "" : "s"}, ${a} advisor${a === 1 ? "y" : "ies"})`;
    const units =
      combine === "per_package"
        ? [...web, ...api].map((b) => unit(b.package === "python-multipart" ? "acme/api" : "acme/web-app", `fix(deps): bump ${b.package} ${b.from} to ${b.to} [SECURITY]`, [b], { unit: `${b.package}@${b.to}`, bundle: false }))
        : [
            ...(web.length ? [unit("acme/web-app", title("web-app", web.length, web.reduce((n, b) => n + b.advisories.length, 0)), web, { joins })] : []),
            ...(api.length ? [unit("acme/api", title("api", 1, 1), api)] : []),
          ];
    const skipped = ids.includes("nofix_1") ? [{ finding_id: "nofix_1", reason: "no fixed version" }] : [];
    const estimated = units.reduce((n, u) => n + u.estimated_tokens, 0);
    return { units, skipped, runs_today: 1, runs_limit: 3, pr_count: units.filter((u) => !u.joins).length, joins: units.filter((u) => u.joins).length, tokens_today: 310_000, tokens_limit: 2_000_000, estimated_tokens: estimated };
  };
}

// The side panel's plan: two repos, bumps in several tiers, an advisory the
// server listed twice (older servers did, once per manifest), and majors.
const DUP_GHSA = "GHSA-9q82-xgwf-vj6h";
const DUP_CVE = "CVE-2026-104852";
function panelPlan() {
  const asked = ["tar_1", "tar_2", "tar_3", "sec_2"];
  // A bump stays while one of its findings is asked for; the extra ones are always in.
  const keep = (ids: string[]) => (b: ReturnType<typeof bump>) => b.finding_ids.some((id) => ids.includes(id)) || !b.finding_ids.some((id) => asked.includes(id));
  return (ids: string[]) => {
    const web = [
      bump("tar", "6.2.1", "7.5.21", TAR.map((f) => f.id), {
        tier: "P1",
        verdict: "not_reachable",
        advisories: [DUP_GHSA, DUP_GHSA, DUP_CVE, DUP_CVE, "GHSA-3xv7-q2mf-8r4c", "GHSA-h5wq-7c9p-jv2m"],
      }),
      bump("next", "14.1.0", "15.2.3", ["x_next"], { tier: "P0", verdict: "reachable" }),
      bump("ws", "8.17.0", "8.17.1", ["x_ws"], { tier: "P1", verdict: "reachable" }),
      bump("semver", "5.7.1", "7.5.2", ["x_semver"], { tier: "P2", verdict: "unknown" }),
      bump("lodash", "4.17.20", "4.17.21", ["x_lodash"], { tier: "P2", verdict: "not_loaded" }),
    ].filter(keep(ids));
    const api = [
      bump("python-multipart", "0.0.9", "0.0.18", ["sec_2"], { tier: "P1", verdict: "not_reachable" }),
      bump("jinja2", "3.1.2", "3.1.6", ["x_jinja"], { tier: "P3", verdict: "not_reachable" }),
    ].filter(keep(ids));
    const count = (bs: ReturnType<typeof bump>[]) => new Set(bs.flatMap((b) => b.advisories)).size;
    const units = [
      unit("acme/web-app", `fix(deps): security updates for web-app (${web.length} packages, ${count(web)} advisories)`, web, {
        advisories: count(web),
        labels: ["security", "dependencies", "severity:critical", "reachable", "breaking", "javascript"],
        verdict: "reachable",
        starts_now: true,
        waits: null,
      }),
      unit("acme/api", `fix(deps): security updates for api (${api.length} packages, ${count(api)} advisories)`, api, {
        advisories: count(api),
        labels: ["security", "dependencies", "severity:high", "not-reachable", "python"],
        verdict: "not_reachable",
        starts_now: false,
        waits: "Waiting: today's 3 fix runs are used. Next starts tomorrow.",
      }),
    ];
    return { units, skipped: [], runs_today: 2, runs_limit: 3, pr_count: 2, joins: 0, starting_now: 1, waiting: 1, tokens_today: 310_000, tokens_limit: 2_000_000, estimated_tokens: 420_000 };
  };
}

const rowOf = (page: Page, pkg: string) => page.getByTestId("finding-row").filter({ has: page.getByRole("link", { name: new RegExp(`^${pkg} `) }) });

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
    await expect(feed).toContainText("Last read");
    await expect(feed.getByTestId("source-reason")).toContainText("Waiting for GitHub's first webhook; checked by polling at");
    await expect(sources.locator('[data-source="kev"]')).toContainText("1 open finding on the list (lists 1,484)");
    const inv = page.getByTestId("inventory");
    await expect(inv.locator('[data-repo="acme/web-app"]')).toContainText("2,712 packages · npm 2,708, GitHub Actions 3, docker 1 · 2 without an exact version");
    await expect(inv.locator('[data-repo="acme/api"]')).toContainText("Dependency graph off");
    await expect(inv.locator('[data-repo="acme/api"]')).toContainText("turn it on in the repo's Settings, Code security");
    await expect(inv.locator('[data-repo="acme/web-app"]').getByTestId("read-as-of")).toHaveText("Matches main as of 1 h ago");
    await expect(inv.locator('[data-repo="acme/web-app"]').getByTestId("next-read")).toHaveText(NEXT_READ);
    await expect(inv.locator('[data-repo="acme/api"]').getByTestId("next-read")).toHaveCount(0);
  });

  // The GitHub advisory feed: up to date, catching up, or failed; never
  // "Not synced yet" once a poll has read anything.
  const feedRow = (poll: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
    id: "github_advisory",
    name: "GitHub advisory feed",
    gives: "New and changed GitHub advisories (the security_advisory webhook, and GitHub's advisory database read about hourly), matched against the dependency lists.",
    state: "ok",
    reason: "",
    synced_at: iso(-0.2),
    count: 2,
    poll: { run_at: iso(-0.2), synced_at: iso(-0.2), caught_up: false, read_up_to: null, error: null, ...poll },
    ...over,
  });
  const withFeed = (row: Record<string, unknown>) => {
    const o = overview();
    (o.source_rows as Record<string, unknown>[])[2] = row;
    return o;
  };
  const feedShot = async (page: Page, name: string) => {
    const feed = page.getByTestId("sources").locator('[data-source="github_advisory"]');
    await page.setViewportSize({ width: 1280, height: 900 });
    await feed.scrollIntoViewIfNeeded();
    await page.locator("#sources").screenshot({ path: `test-results/shots/sources-${name}-1280.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await feed.scrollIntoViewIfNeeded();
    await page.locator("#sources").screenshot({ path: `test-results/shots/sources-${name}-390.png` });
  };

  test("the advisory feed, caught up: synced and up to date", async ({ page }) => {
    await mockApi(page, { overview: withFeed(feedRow({ caught_up: true }, { reason: "Waiting for GitHub's first webhook; checked by polling at Nov 11, 06:00 UTC." })) });
    await page.goto("/security");
    const feed = page.getByTestId("sources").locator('[data-source="github_advisory"]');
    await expect(feed).toContainText("On");
    await expect(feed.getByTestId("feed-status")).toHaveText("Synced 12 min ago · up to date");
    await expect(feed.getByTestId("feed-status")).toHaveAttribute("data-poll", "caught_up");
    await expect(feed).not.toContainText("Not synced yet");
    await expect(feed.getByTestId("source-reason")).toHaveCount(0);
    await feedShot(page, "caught-up");
  });

  test("the advisory feed, behind: catching up, with how far it has read", async ({ page }) => {
    const upTo = "2026-11-10T17:42:00Z";
    await mockApi(page, { overview: withFeed(feedRow({ read_up_to: upTo }, { reason: "Catching up on GitHub's advisory database: read up to Nov 10, 17:42 UTC." })) });
    await page.goto("/security");
    const feed = page.getByTestId("sources").locator('[data-source="github_advisory"]');
    await expect(feed).toContainText("Catching up");
    await expect(feed).not.toContainText("Not synced yet");
    const status = feed.getByTestId("feed-status");
    await expect(status).toHaveAttribute("data-poll", "behind");
    const shown = await page.evaluate((t) => new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }), upTo);
    await expect(status).toHaveText(`Catching up: read up to ${shown}`);
    await feedShot(page, "behind");
  });

  test("the advisory feed, failed: the error, and how far it had read", async ({ page }) => {
    const upTo = "2026-11-10T17:42:00Z";
    await mockApi(page, {
      overview: withFeed(feedRow({ read_up_to: upTo, error: "GitHub answered 502: Server Error" }, { state: "error", reason: "The last read of GitHub's advisory database failed (GitHub answered 502: Server Error); it is tried again within the hour." })),
    });
    await page.goto("/security");
    const feed = page.getByTestId("sources").locator('[data-source="github_advisory"]');
    await expect(feed).toContainText("Error");
    const status = feed.getByTestId("feed-status");
    await expect(status).toHaveAttribute("data-poll", "error");
    await expect(status).toContainText("The last read failed: GitHub answered 502: Server Error. It is tried again within the hour; read up to");
    await feedShot(page, "error");
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
    // Two repos: a PR lives in one, so one PR each.
    await expect(bar.getByTestId("bulk-summary")).toHaveText("2 fixes selected in 2 repos: 2 pull requests · 4 advisories · 2 major upgrades");
    await expect(bar.getByTestId("bulk-open")).toHaveText("Fix in 2 PRs, one per repo");
    await bar.getByTestId("bulk-open").click();
    const req = page.getByTestId("fix-request");
    await expect(req.getByTestId("fix-unit")).toHaveCount(2);
    // Two pull requests start collapsed: open the first to see its bumps.
    await req.getByTestId("fix-unit-toggle").first().click();
    await expect(req.getByTestId("fix-bump").first()).toContainText("tar6.2.1 to 7.5.21Major");
    await expect(req.getByTestId("fix-budget")).toContainText("Uses 2 of today's 3 fix runs (1 used so far) · estimated 300k of 2M tokens (310k used today).");
    expect(call(db, "POST /api/security/fix/plan")[0].body).toEqual({ finding_ids: ["tar_1", "tar_2", "tar_3", "sec_2"], combine: "one_pr" });
    await req.getByTestId("fix-confirm").click();
    const res = page.getByTestId("fix-results");
    await expect(res).toContainText("2 started");
    await expect(res.getByTestId("fix-started").first().getByRole("link", { name: "See the run" })).toHaveAttribute("href", "/?q=SEC-tar");
    expect(call(db, "POST /api/security/fix")[0].body).toEqual({ finding_ids: ["tar_1", "tar_2", "tar_3", "sec_2"], raise_limit: false, combine: "one_pr" });
  });

  test("past today's limit the rest wait, unless an admin raises it for the request", async ({ page }) => {
    const db = await mockApi(page, { plan: { ...PLAN, runs_today: 2 } });
    await page.goto("/security");
    await page.getByTestId("pick-all").check();
    await page.getByTestId("bulk-open").click();
    const req = page.getByTestId("fix-request");
    await expect(req.getByTestId("fix-budget")).toContainText("Uses 1 of today's 3 fix runs (2 used so far) · estimated 300k of 2M tokens (310k used today). 1 waits for tomorrow");
    await req.getByTestId("fix-confirm").click();
    await expect(page.getByTestId("fix-queued")).toContainText("Waiting: today's 3 fix runs are used. Next starts tomorrow.");
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByTestId("pick-all").check();
    await page.getByTestId("bulk-open").click();
    await page.getByTestId("raise-limit").check();
    await page.getByTestId("fix-confirm").click();
    await expect(page.getByTestId("fix-results")).toContainText("2 started");
    expect(call(db, "POST /api/security/fix").at(-1)?.body).toEqual({ finding_ids: ["tar_1", "tar_2", "tar_3", "sec_2"], raise_limit: true, combine: "one_pr" });
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

  test("without Repository security advisories the page says what isn't read and how to add it", async ({ page }) => {
    const note =
      "Your repositories' own advisories and private vulnerability reports aren't read because CoderHelm can't read Repository security advisories on this installation; add Repository security advisories: read to the GitHub App.";
    await mockApi(page, {
      overview: overview({
        sources: { dependabot: "on", osv: { synced_at: iso(-1), mode: "mirror" }, kev_synced_at: iso(-1), epss_synced_at: iso(-1), repository_advisories: { state: "no_permission", note } },
      }),
    });
    await page.goto("/security");
    await expect(page.getByTestId("advisories-note")).toHaveText(note);
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
    await expect(page.getByTestId("page-header")).toContainText("undici 6.19.2 · fixed in 6.21.1 · web-app");
    await expect(page.getByTestId("page-header")).toContainText("On exploited list");
    await expect(page.getByTestId("finding-facts")).toContainText("CVE-2026-31337 · GHSA-q9fx-2w5c-8m4r · due");
    await expect(page.getByTestId("severity")).toContainText("CVSS9.1 critical");
    await expect(page.getByTestId("severity")).toContainText("0.71 (99th)");
    await expect(page.getByRole("heading", { name: "Why we think web-app is affected" })).toBeVisible();
    const lines = page.getByTestId("evidence-lines");
    await expect(lines).toContainText("apps/web/src/server/proxy.ts:44");
    await expect(lines).toContainText("new Agent({ pipelining: 1 })");
    await expect(page.getByTestId("dependency-path").getByRole("listitem")).toHaveText([/web-app$/, /next 15\.4\.2$/, /undici 6\.19\.2$/]);
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

  test("a private report against the repository's own code says it stays out of public pull requests and channels", async ({ page }) => {
    const priv = finding({
      private_report: true,
      ecosystem: "repository",
      manifest: "(this repository's code)",
      package: "web-app",
      version: "",
      pr: null,
      dependabot_alert: null,
      status: "open",
      advisory: { ...finding().advisory, source: "repository_advisory", ids: ["GHSA-aaaa-bbbb-cccc"], primary: "GHSA-aaaa-bbbb-cccc" },
    });
    await mockApi(page, { detail: { finding: priv, timeline: [] } });
    await page.goto("/security/detail?id=sec_1");
    await expect(page.getByTestId("private-report")).toContainText("never posted to a channel and never fixed in a public pull request or issue");
    await expect(page.getByTestId("advisory")).toContainText("Advisory data: the repository's own security advisory");
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
    expect(call(db, "POST /api/security/fix")[0].body).toEqual({ finding_ids: ["tar_3"], raise_limit: false, combine: "per_package" });

    db.detail = { finding: NOFIX, timeline: [] };
    await page.goto("/security/detail?id=nofix_1");
    // No fixed version: no button to press, the card says why and what happens next.
    await expect(page.getByTestId("open-fix-pr")).toHaveCount(0);
    await expect(page.getByTestId("fix")).toContainText("No fixed version is out yet. Coderhelm checks again when the advisory gets one.");
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
    await page.getByRole("group", { name: "Pull requests" }).getByRole("button", { name: "One per ecosystem" }).click();
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
      bundle: "per_repo_ecosystem",
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
    // One entry per PR, counted as new PRs: the api fixes join its open PR.
    await expect(page.getByTestId("would-open-count")).toHaveText("1");
    await expect(page.getByTestId("would-open").getByRole("listitem")).toHaveCount(2);
    await expect(page.getByTestId("would-open")).toContainText("fix(deps): security updates for web-app (2 packages, 2 advisories) in web-app");
    await expect(page.getByTestId("would-open")).toContainText("coderhelm/security-updates-2026-11-11-a1b2c3 · security, severity:critical");
    await expect(page.getByTestId("would-open")).toContainText("(added to PR #812)");
    await expect(page.getByText("3 fixes in 1 new PR")).toBeVisible();
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

  test("picking fixes for one PR: quick selects, x, shift-click and Esc, a bar clear of the last row, the review and the result", async ({ page }) => {
    const db = await mockApi(page, { groups: { groups: MIXED, total: MIXED.length, next_cursor: null }, planFor: planFor(), slowFix: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/security");
    const bar = page.getByTestId("bulk-bar");
    const summary = bar.getByTestId("bulk-summary");
    await page.getByTestId("select-urgent").click();
    await expect(summary).toHaveText("1 fix selected in web-app: 1 pull request · 3 advisories · 1 major upgrade");
    await page.keyboard.press("Escape");
    await expect(bar).toHaveCount(0);
    await page.getByTestId("select-fixable").click();
    await expect(summary).toHaveText("3 fixes selected in 2 repos: 2 pull requests · 5 advisories · 2 major upgrades · 1 still being checked");
    await page.getByTestId("select-repo").click();
    await page.getByRole("option", { name: "web-app (2)" }).click();
    await expect(summary).toHaveText("2 fixes selected in web-app: 1 pull request · 4 advisories · 1 major upgrade · 1 still being checked");
    // x toggles the row under the pointer.
    await rowOf(page, "python-multipart").hover();
    await page.keyboard.press("x");
    await expect(summary).toContainText("3 fixes selected in 2 repos");
    await page.keyboard.press("x");
    await expect(summary).toContainText("2 fixes selected in web-app");
    // Shift-click picks the range, skipping rows that can't be fixed.
    await page.keyboard.press("Escape");
    await rowOf(page, "undici").hover();
    await rowOf(page, "tar").getByTestId("pick").click();
    await rowOf(page, "ws").getByTestId("pick").click({ modifiers: ["Shift"] });
    await expect(summary).toContainText("3 fixes selected in 2 repos");
    await expect(rowOf(page, "undici").getByTestId("pick")).not.toBeChecked();
    // The bar sits in the flow above the list: it never covers a row.
    await expectClearOfRows(page);

    // One repo: one PR, reviewed in the page.
    await page.keyboard.press("Escape");
    await page.getByTestId("select-repo").click();
    await page.getByRole("option", { name: "web-app (2)" }).click();
    await expect(bar.getByTestId("bulk-open")).toHaveText("Fix in one PR");
    await bar.getByTestId("bulk-open").click();
    const req = page.getByTestId("fix-request");
    await expect(req.getByTestId("fix-heading")).toHaveText("Open a fix pull request");
    await expect(req.getByTestId("fix-summary")).toHaveText("web-app · 4 advisories · 1 major upgrade");
    await expect(req.getByTestId("fix-title")).toHaveText("fix(deps): security updates for web-app (2 packages, 4 advisories)");
    await expect(req.getByTestId("fix-branch")).toHaveText("coderhelm/security-updates-2026-11-11-web-app");
    await expect(req.getByTestId("fix-label")).toHaveText(["security", "dependencies", "severity:high", "javascript"]);
    await expect(req.getByTestId("fix-bump")).toHaveCount(2);
    await expect(req.getByTestId("warn-major")).toContainText("tar moves to a new major version. It may need code changes; Coderhelm fixes CI in the same PR");
    await expect(req.getByTestId("fix-budget")).toContainText("Uses 1 of today's 3 fix runs (1 used so far) · estimated 180k of 2M tokens (310k used today).");
    expect(call(db, "POST /api/security/fix/plan").at(-1)?.body).toEqual({ finding_ids: ["tar_1", "tar_2", "tar_3", "ws_1"], combine: "one_pr" });
    // Removing a row changes the request.
    await req.locator('[data-package="ws"]').getByRole("button", { name: "Remove ws from this request" }).click();
    await expect(req.getByTestId("fix-bump")).toHaveCount(1);
    expect(call(db, "POST /api/security/fix/plan").at(-1)?.body).toEqual({ finding_ids: ["tar_1", "tar_2", "tar_3"], combine: "one_pr" });
    await req.getByTestId("fix-confirm").click();
    await expect(page.getByTestId("fix-progress")).toContainText("Starting the fix run");
    const res = page.getByTestId("fix-results");
    await expect(res).toContainText("1 started");
    await expect(res.getByRole("link", { name: "See the run" })).toBeVisible();
    expect(call(db, "POST /api/security/fix").at(-1)?.body).toEqual({ finding_ids: ["tar_1", "tar_2", "tar_3"], raise_limit: false, combine: "one_pr" });
  });

  test("an open security PR takes the selection, what can't be fixed is left out with why, and one PR per package is a choice", async ({ page }) => {
    const db = await mockApi(page, { groups: { groups: MIXED, total: MIXED.length, next_cursor: null }, planFor: planFor({ number: 812, url: "https://github.com/acme/web-app/pull/812" }) });
    await page.goto("/security");
    await page.getByTestId("select-repo").click();
    await page.getByRole("option", { name: "web-app (2)" }).click();
    await page.getByTestId("bulk-open").click();
    const req = page.getByTestId("fix-request");
    await expect(req.getByTestId("fix-heading")).toHaveText("Add to PR #812");
    await expect(req.getByTestId("fix-unit")).toContainText("Adds to PR #812");
    await expect(req.getByTestId("warn-join")).toContainText("Added to PR #812, the open security PR for web-app, instead of a second one.");
    await expect(req.getByTestId("fix-confirm")).toHaveText("Add to PR #812");
    await req.getByTestId("fix-confirm").click();
    await expect(page.getByTestId("fix-started")).toContainText("added to PR #812");
    await expect(page.getByTestId("fix-started").getByRole("link", { name: "PR #812" })).toHaveAttribute("href", "https://github.com/acme/web-app/pull/812");
    await page.getByRole("button", { name: "Done" }).click();

    // One PR per package, from the menu.
    await page.getByTestId("select-fixable").click();
    await page.getByTestId("bulk-more").click();
    await expect(page.getByTestId("bulk-per-package")).toContainText("3 pull requests");
    await page.getByTestId("bulk-per-package").click();
    await expect(page.getByTestId("fix-heading")).toHaveText("Open 3 fix pull requests");
    expect(call(db, "POST /api/security/fix/plan").at(-1)?.body).toMatchObject({ combine: "per_package" });
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("fix-request")).toHaveCount(0);
  });

  test("a finding's page adds its fix to the repo's open security PR", async ({ page }) => {
    const db = await mockApi(page, { detail: { finding: TAR[2], timeline: [] }, planFor: planFor({ number: 812, url: "https://github.com/acme/web-app/pull/812" }) });
    await page.goto("/security/detail?id=tar_3");
    await page.getByTestId("add-to-pr").click();
    await expect(page.getByTestId("fix-unit")).toContainText("Adds to PR #812");
    await page.getByTestId("fix-confirm").click();
    await expect(page.getByTestId("fix-results")).toContainText("1 started");
    expect(call(db, "POST /api/security/fix/plan")[0].body).toEqual({ finding_ids: ["tar_3"], combine: "one_pr" });
    expect(call(db, "POST /api/security/fix")[0].body).toEqual({ finding_ids: ["tar_3"], raise_limit: false, combine: "one_pr" });
  });

  test("select all: the header box takes the page, then every fix that matches, sent as the list's filters; the plan says which repos wait", async ({ page }) => {
    const all = manyGroups(350);
    const db = await mockApi(page, { groups: paged(all), planFor: repoPlan(349) });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/security?tier=P2");
    await expect(page.getByTestId("finding-row")).toHaveCount(50);
    const bar = page.getByTestId("bulk-bar");
    const summary = bar.getByTestId("bulk-summary");
    // A few rows: the count is in the bar.
    await page.getByTestId("finding-row").nth(0).getByTestId("pick").click();
    await page.getByTestId("finding-row").nth(1).getByTestId("pick").click();
    await expect(summary).toHaveText(/^2 fixes selected in 2 repos: 2 pull requests/);
    await expect(page.getByTestId("pick-all")).toHaveJSProperty("indeterminate", true);
    await expect(bar.getByTestId("select-all-matching")).toHaveCount(0);
    await expectClearOfRows(page);
    await shot(page, "1280-selection-bar");
    // The header box: every fix on the page, then Gmail's offer.
    await page.getByTestId("pick-all").check();
    await expect(summary).toHaveText(/^50 fixes selected in 3 repos: 3 pull requests · 50 advisories/);
    const offer = bar.getByTestId("select-all-matching");
    await expect(offer).toContainText("All 50 fixes on this page are selected.");
    await expect(offer.getByRole("button", { name: "Select all 350 fixes that match" })).toBeVisible();
    await expectClearOfRows(page);
    await shot(page, "1280-select-page-offer");
    await offer.getByRole("button", { name: "Select all 350 fixes that match" }).click();
    await expect(summary).toHaveText("350 fixes selected: every fix that matches the filters · one pull request per repo");
    await expect(offer).toContainText("All 350 fixes that match the filters are selected.");
    await expect(bar.getByTestId("bulk-open")).toHaveText("Fix in one PR per repo");
    await expectClearOfRows(page);
    await shot(page, "1280-select-all-matching-bar");
    // A row unticked by hand is an exception.
    await page.getByTestId("finding-row").nth(4).getByTestId("pick").click();
    await expect(summary).toHaveText("349 fixes selected: every fix that matches the filters, less 1 unticked · one pull request per repo");
    await expect(offer).toHaveCount(0);
    await page.getByTestId("finding-row").nth(4).getByTestId("pick").click();
    await expect(summary).toHaveText(/^350 fixes selected/);
    await page.getByTestId("finding-row").nth(4).getByTestId("pick").click();
    await expectClearOfRows(page);
    await bar.getByTestId("bulk-open").click();
    const req = page.getByTestId("fix-request");
    await expect(req.getByTestId("fix-unit")).toHaveCount(3);
    expect(call(db, "POST /api/security/fix/plan").at(-1)?.body).toEqual({
      select: { all: true, filters: { status: "open", tier: "P2", repo: "", q: "" }, except_ids: ["f4"] },
      combine: "one_pr",
    });
    // One PR per repo; which start now and which wait for tomorrow, said plainly.
    await expect(req.getByTestId("fix-heading")).toHaveText("Open 3 fix pull requests");
    expect(await req.getByTestId("fix-unit").evaluateAll((els) => els.map((e) => e.getAttribute("data-repo")))).toEqual(["acme/web-app", "acme/api", "acme/docs"]);
    await expect(req.getByTestId("fix-when")).toHaveText(["Starts now", "Starts now", "Waits for tomorrow's limit"]);
    await req.getByTestId("fix-unit-toggle").nth(2).click();
    await expect(req.getByTestId("fix-waits")).toHaveText("Waiting: today's 3 fix runs are used. Next starts tomorrow.");
    await expect(req.getByTestId("fix-budget")).toContainText("Uses 2 of today's 3 fix runs (1 used so far)");
    await expect(req.getByTestId("fix-budget")).toContainText("1 waits for tomorrow unless you raise today's limit.");
    await expectClearOfRows(page);
    await shot(page, "1280-plan");
    await req.getByTestId("fix-confirm").click();
    await expect(page.getByTestId("fix-results")).toContainText("2 started, 1 waiting");
    expect(call(db, "POST /api/security/fix").at(-1)?.body).toEqual({
      select: { all: true, filters: { status: "open", tier: "P2", repo: "", q: "" }, except_ids: ["f4"] },
      raise_limit: false,
      combine: "one_pr",
    });
    await page.getByRole("button", { name: "Done" }).click();
    // Clear is one click.
    await page.getByTestId("pick-all").check();
    await bar.getByTestId("select-all-matching-button").click();
    await bar.getByTestId("bulk-clear").click();
    await expect(bar).toHaveCount(0);
    await expect(page.getByTestId("pick-all")).not.toBeChecked();
  });

  test("picked rows past 200 finding ids are sent as the list's filters less every row not picked", async ({ page }) => {
    // 120 fixes of 5 advisories: the first page alone is 250 ids.
    const all = manyGroups(120, 5);
    const db = await mockApi(page, { groups: paged(all), planFor: repoPlan(50) });
    await page.goto("/security");
    await page.getByTestId("pick-all").check();
    await page.getByTestId("finding-row").nth(0).getByTestId("pick").click();
    await expect(page.getByTestId("bulk-summary")).toHaveText(/^49 fixes selected/);
    await page.getByTestId("bulk-open").click();
    await expect(page.getByTestId("fix-unit")).toHaveCount(3);
    // The pages not loaded were read, so their rows are excepted too.
    expect(call(db, "GET /api/security/groups").map((c) => new URL(c.url, "http://x").searchParams.get("cursor"))).toEqual(expect.arrayContaining(["50", "100"]));
    const body = call(db, "POST /api/security/fix/plan").at(-1)?.body as { select: Select; finding_ids?: string[] };
    expect(body.finding_ids).toBeUndefined();
    expect(body.select.filters).toEqual({ status: "open", tier: "", repo: "", q: "" });
    const except = new Set(body.select.except_ids);
    expect(except.size).toBe((120 - 49) * 5);
    expect(except.has("f0") && except.has("f0_4") && except.has("f50") && except.has("f119_4")).toBe(true);
    expect(except.has("f1")).toBe(false);
  });

  test("an error from the plan shows in the side panel, in its flow; trying again works", async ({ page }) => {
    const all = manyGroups(350);
    const db = await mockApi(page, { groups: paged(all), planFor: repoPlan(350), planError: "finding_ids is at most 200 finding ids; to ask for more, send select with the list's filters" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/security");
    await page.getByTestId("pick-all").check();
    await page.getByTestId("select-all-matching-button").click();
    await page.getByTestId("bulk-open").click();
    const req = page.getByTestId("fix-request");
    const err = req.getByTestId("fix-error");
    await expect(err).toContainText("We couldn't work out the fix PRs");
    await expect(err).toContainText("finding_ids is at most 200 finding ids");
    await expect(err).toHaveAttribute("role", "alert");
    expect(await err.evaluate((e) => getComputedStyle(e).position)).toBe("static");
    await expectClearOfRows(page);
    await shot(page, "1280-error");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("finding-card").first()).toBeVisible();
    await expectClearOfRows(page);
    await shot(page, "390-error");
    db.planError = null;
    await req.getByRole("button", { name: "Try again" }).click();
    await expect(req.getByTestId("fix-unit")).toHaveCount(3);
    await expect(req.getByTestId("fix-error")).toHaveCount(0);
  });

  test("at 390 wide: select all on the page, every fix that matches, the plan; nothing covers a row or scrolls sideways", async ({ page }) => {
    const all = manyGroups(350);
    await mockApi(page, {
      groups: paged(all),
      planFor: repoPlan(350, "This request takes the first 1000 fixes (1000 findings), the most urgent first. The other 12 fixes (12 findings) are left for the next request: select every fix that matches again once these have started."),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/security");
    await expect(page.getByTestId("finding-card")).toHaveCount(50);
    const bar = page.getByTestId("bulk-bar");
    await page.getByTestId("finding-card").nth(0).getByTestId("pick").click();
    await expect(bar.getByTestId("bulk-summary")).toHaveText(/^1 fix selected in web-app/);
    await expectClearOfRows(page);
    await shot(page, "390-selection-bar");
    await page.getByTestId("pick-all-cards").check();
    await expect(bar.getByTestId("select-all-matching")).toContainText("All 50 fixes on this page are selected.");
    await expectClearOfRows(page);
    await shot(page, "390-select-page-offer");
    await bar.getByTestId("select-all-matching-button").click();
    await expect(bar.getByTestId("bulk-summary")).toHaveText(/^350 fixes selected/);
    await expectClearOfRows(page);
    await shot(page, "390-select-all-matching-bar");
    await bar.getByTestId("bulk-open").click();
    const req = page.getByTestId("fix-request");
    await expect(req.getByTestId("fix-unit")).toHaveCount(3);
    await expect(req.getByTestId("fix-selection-note")).toContainText("This request takes the first 1000 fixes");
    // On a phone the panel fills the screen, as the other side panels do.
    expect(await req.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
    await expectClearOfRows(page);
    await shot(page, "390-plan");
  });

  test("the plan opens in the side panel: repos collapse, bumps by tier with each advisory once, remove and undo, the footer stays, Esc closes", async ({ page }) => {
    const db = await mockApi(page, { planFor: panelPlan() });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/security");
    await page.getByTestId("pick-all").check();
    const bar = page.getByTestId("bulk-bar");
    await bar.getByTestId("bulk-open").click();
    const req = page.getByTestId("fix-request");
    await expect(req).toHaveAttribute("role", "dialog");
    // On the right, the width of the other side panels; the bar and the list stay on the left.
    const panelWidth = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize) * 40);
    expect(await req.boundingBox()).toEqual({ x: 1280 - panelWidth, y: 0, width: panelWidth, height: 800 });
    const barBox = await bar.boundingBox();
    expect(barBox!.x).toBeLessThan(1280 - panelWidth);
    await expect(bar.getByTestId("bulk-summary")).toBeVisible();
    await expect(req.getByTestId("fix-heading")).toHaveText("Open 2 fix pull requests");
    await expect(req.getByTestId("fix-summary")).toHaveText("2 repos, one PR each · 10 advisories · 3 major upgrades");
    // More than one PR: each starts collapsed, with what it holds and when it starts.
    const units = req.getByTestId("fix-unit");
    await expect(units).toHaveCount(2);
    await expect(units.nth(0)).toHaveAttribute("data-open", "false");
    await expect(units.nth(1)).toHaveAttribute("data-open", "false");
    await expect(req.getByTestId("fix-bump")).toHaveCount(0);
    await expect(req.getByTestId("fix-unit-facts")).toHaveText(["New pull request · 5 packages · 8 advisories · 3 major", "New pull request · 2 packages · 2 advisories"]);
    await expect(req.getByTestId("fix-when")).toHaveText(["Starts now", "Waits for tomorrow's limit"]);
    await expect(req.getByTestId("fix-limit-line")).toHaveText("Uses 1 of the 1 fix run left today · 1 waits for tomorrow");
    await shot(page, "1280-plan-panel");

    // Expanding a repo: its title in plain text, the branch, labels, the reachability sum, bumps by tier.
    const web = units.nth(0);
    await web.getByTestId("fix-unit-toggle").click();
    await expect(web.getByTestId("fix-unit-toggle")).toHaveAttribute("aria-expanded", "true");
    await expect(web.getByTestId("fix-title")).toHaveText("fix(deps): security updates for web-app (5 packages, 8 advisories)");
    expect(await web.getByTestId("fix-title").evaluate((e) => getComputedStyle(e).fontFamily)).not.toMatch(/mono/i);
    await expect(web.getByTestId("fix-branch")).toHaveText("coderhelm/security-updates-2026-11-11-web-app");
    await expect(web.getByTestId("fix-label")).toHaveText(["security", "dependencies", "severity:critical", "reachable", "breaking", "javascript"]);
    await expect(web.getByTestId("fix-reachability")).toHaveText("Reachability: 2 reachable, 1 unknown, 1 not reachable, 1 not loaded");
    expect(await web.getByTestId("fix-tier").evaluateAll((els) => els.map((e) => e.getAttribute("data-tier")))).toEqual(["P0", "P1", "P2"]);
    await expect(web.getByTestId("fix-tier-count")).toHaveText(["1 package", "2 packages", "2 packages"]);
    // Most urgent first: by tier, then reachable before the rest.
    expect(await web.getByTestId("fix-bump").evaluateAll((els) => els.map((e) => e.getAttribute("data-package")))).toEqual(["next", "ws", "tar", "semver", "lodash"]);
    const tar = web.locator('[data-package="tar"]');
    // Each advisory once, three shown, then how many more.
    await expect(tar.getByTestId("fix-advisories")).toHaveText(`4 advisories: ${DUP_GHSA}, ${DUP_CVE}, GHSA-3xv7-q2mf-8r4c +1`);
    await expect(tar.getByTestId("verdict-pill")).toHaveAttribute("data-verdict", "not_reachable");
    await expect(tar.getByTestId("verdict-pill")).toHaveText("Present, not reachable");
    await expect(tar.getByTestId("fix-major")).toHaveText("Major");
    await expect(web.locator('[data-package="ws"]').getByTestId("fix-major")).toHaveCount(0);
    await shot(page, "1280-plan-expanded");

    // The footer stays in view however far the panel scrolls.
    const footerInView = async () => {
      const b = await req.getByTestId("fix-confirm").boundingBox();
      const vh = page.viewportSize()!.height;
      return !!b && b.y >= 0 && b.y + b.height <= vh;
    };
    await units.nth(1).getByTestId("fix-unit-toggle").click();
    expect(await footerInView()).toBe(true);
    await req.locator("[data-drawer-body]").evaluate((e) => e.scrollTo(0, e.scrollHeight));
    expect(await footerInView()).toBe(true);
    await expect(req.getByTestId("fix-confirm")).toHaveText("Open 2 fix PRs");
    await expect(req.getByTestId("fix-cancel")).toBeVisible();

    // Collapse and expand all.
    await expect(req.getByTestId("fix-expand-all")).toHaveText("Collapse all");
    await req.getByTestId("fix-expand-all").click();
    await expect(req.getByTestId("fix-bump")).toHaveCount(0);
    await req.getByTestId("fix-expand-all").click();
    await expect(req.getByTestId("fix-bump")).toHaveCount(7);

    // Remove a package: the plan is asked again without it, the row in the list unticks, and Undo puts it back.
    await tar.getByRole("button", { name: "Remove tar from this request" }).click();
    await expect(web.locator('[data-package="tar"]')).toHaveCount(0);
    expect(call(db, "POST /api/security/fix/plan").at(-1)?.body).toEqual({ finding_ids: ["sec_2"], combine: "one_pr" });
    const undo = req.getByTestId("fix-undo");
    await expect(undo).toHaveText("Removed tar from the request.Undo");
    await expect(req.getByTestId("fix-undo-button")).toBeFocused();
    // The list behind the panel is hidden from the accessibility tree while it is open: find the row by its key.
    const tarRow = page.locator('[data-testid="finding-row"][data-key*="|tar|"]').getByTestId("pick");
    await expect(tarRow).not.toBeChecked();
    await shot(page, "1280-plan-undo");
    await req.getByTestId("fix-undo-button").click();
    await expect(web.locator('[data-package="tar"]')).toHaveCount(1);
    await expect(undo).toHaveCount(0);
    expect(call(db, "POST /api/security/fix/plan").at(-1)?.body).toEqual({ finding_ids: ["tar_1", "tar_2", "tar_3", "sec_2"], combine: "one_pr" });
    await expect(tarRow).toBeChecked();

    // Esc closes the panel; the selection stays, to change and ask again.
    await page.keyboard.press("Escape");
    await expect(req).toHaveCount(0);
    await expect(bar.getByTestId("bulk-summary")).toContainText("2 fixes selected");
    await expect(bar.getByTestId("bulk-open")).toBeFocused();

    // At 390 wide: full screen like the other panels, nothing sideways, the footer in view.
    await page.setViewportSize({ width: 390, height: 844 });
    await bar.getByTestId("bulk-open").click();
    await expect(req.getByTestId("fix-unit")).toHaveCount(2);
    expect(await req.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
    await shot(page, "390-plan-panel");
    await req.getByTestId("fix-unit-toggle").first().click();
    await expect(req.getByTestId("fix-bump")).toHaveCount(5);
    const sideways = await req.evaluate((e) => {
      const body = e.querySelector<HTMLElement>("[data-drawer-body]")!;
      const wide = [...e.querySelectorAll<HTMLElement>("*")].filter((x) => x.getBoundingClientRect().right > window.innerWidth + 0.5).length;
      return { body: body.scrollWidth - body.clientWidth, wide, doc: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    expect(sideways).toEqual({ body: 0, wide: 0, doc: 0 });
    expect(await footerInView()).toBe(true);
    await shot(page, "390-plan-expanded");
    await req.locator("[data-drawer-body]").evaluate((e) => e.scrollTo(0, e.scrollHeight));
    expect(await footerInView()).toBe(true);
    await req.getByTestId("fix-cancel").click();
    await expect(req).toHaveCount(0);
  });

  test("a tier still being checked is a muted pill with a clock, never a question mark, and sorts below settled rows", async ({ page }) => {
    await mockApi(page, { groups: { groups: MIXED, total: MIXED.length, next_cursor: null } });
    await page.goto("/security");
    const ws = rowOf(page, "ws").getByTestId("tier-pill");
    await expect(ws).toHaveAttribute("data-provisional", "true");
    await expect(ws).toHaveAttribute("title", "Likely P2. Still checking whether your code uses this package; the tier can change.");
    await expect(ws.locator(".sr-only")).toHaveText("Likely P2. Still checking whether your code uses this package; the tier can change.");
    await expect(page.getByTestId("tier-pill").filter({ hasText: "?" })).toHaveCount(0);
    const keys = await page.getByTestId("finding-row").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-key")));
    expect(keys.indexOf("acme/web-app|npm|ws|8.17.0")).toBeGreaterThan(keys.indexOf("acme/api|npm|python-multipart|0.0.9"));
  });
});
