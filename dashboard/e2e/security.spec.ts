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
};

const overview = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  dry_run: false,
  counts: { open: 14, p0: 1, p1: 1, p2: 7, p3: 5, due_7d: 5, fixed_30d: 23, dismissed: 4, noise_removed: 61 },
  median_hours_to_merge_30d: 19,
  next_due_at: iso(41),
  sources: { dependabot: "on", osv: { synced_at: iso(-1), mode: "mirror" }, kev_synced_at: iso(-1), epss_synced_at: iso(-1) },
  permission_missing: false,
  ...over,
});

interface Db {
  role: string;
  overview: unknown;
  findings: unknown;
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
  test("the overview shows the tiles, the findings and the badge, and filters ask the server", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/security");
    await expect(page.getByRole("heading", { name: "Security", exact: true })).toBeVisible();
    await expect(page.getByTestId("tile-now")).toContainText("2");
    await expect(page.getByTestId("tile-now")).toContainText("P0 1, P1 1");
    await expect(page.getByTestId("tile-due")).toContainText("next due in 41 h");
    await expect(page.getByTestId("tile-fixed")).toContainText("median 19 h to merge");
    await expect(page.getByTestId("tile-noise")).toContainText("61");
    // Overview and Policy are the destination's pages, as tabs across the top.
    const tabs = page.getByTestId("section-tabs");
    await expect(tabs.getByRole("link", { name: "Overview" })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Policy" })).toHaveAttribute("href", /^\/security\/policy\/?$/);
    // P0 + P1 open, beside Security in the sidebar.
    await expect(page.getByTestId("main-nav").getByRole("link", { name: /Security/ }).getByTestId("count-badge")).toHaveText(/^2/);

    const rows = page.getByTestId("finding-row");
    await expect(rows).toHaveCount(2);
    const first = rows.first();
    await expect(first.getByTestId("tier-pill")).toHaveText("P0");
    await expect(first).toContainText("Request smuggling in HTTP parser");
    await expect(first).toContainText("CVE-2026-31337 · GHSA-q9fx-2w5c-8m4r · on exploited list · EPSS 0.71");
    await expect(first).toContainText("undici 6.19.2");
    await expect(first).toContainText("web-app");
    await expect(first.getByTestId("verdict-pill")).toHaveText("Reachable");
    await expect(first.getByRole("link", { name: "PR #1532" })).toHaveAttribute("href", "https://github.com/acme/web-app/pull/1532");
    await expect(first.getByTestId("fix-state")).toContainText("CI passing");
    await expect(first.getByTestId("due")).toHaveText("31 h");
    await expect(rows.nth(1).getByTestId("verdict-pill")).toHaveText("Present, not reachable");
    await expect(rows.nth(1).getByTestId("fix-state")).toHaveText("Preview only, no PR");
    await expect(page.getByTestId("permission-banner")).toHaveCount(0);
    expect(call(db, "GET /api/security/findings")[0].url).toBe("/api/security/findings?status=open");

    await page.getByRole("group", { name: "Tier" }).getByRole("button", { name: /^P0/ }).click();
    await expect(page).toHaveURL(/tier=P0/);
    await expect.poll(() => call(db, "GET /api/security/findings").at(-1)?.url).toBe("/api/security/findings?status=open&tier=P0");
    await page.getByRole("group", { name: "Show findings" }).getByRole("button", { name: /^Dismissed/ }).click();
    await expect.poll(() => call(db, "GET /api/security/findings").at(-1)?.url).toBe("/api/security/findings?status=dismissed&tier=P0");

    await page.getByTestId("scan-now").click();
    await expect(page.getByText("Checking every repo now.")).toBeVisible();
    expect(call(db, "POST /api/security/scan")[0].body).toEqual({ repo: null });

    await rows.first().getByRole("link", { name: "Request smuggling in HTTP parser" }).click();
    await expect(page).toHaveURL(/\/security\/detail\/?\?id=sec_1/);
  });

  test("a missing GitHub permission says what to grant and how", async ({ page }) => {
    await mockApi(page, { overview: overview({ permission_missing: true, sources: { dependabot: "no_permission", osv: { synced_at: null, mode: "api" }, kev_synced_at: null, epss_synced_at: null } }) });
    await page.goto("/security");
    const banner = page.getByTestId("permission-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Dependabot alerts: read");
    await expect(banner).toContainText("GitHub Apps, then Coderhelm");
    await expect(banner.getByRole("link", { name: "GitHub integration" })).toHaveAttribute("href", /^\/settings\/integrations\/github\/?$/);
    // The findings still show.
    await expect(page.getByTestId("finding-row")).toHaveCount(2);
  });

  test("with the feature off, the page says so and points at the policy", async ({ page }) => {
    const db = await mockApi(page, { overview: overview({ enabled: false }) });
    await page.goto("/security");
    await expect(page.getByTestId("security-off")).toContainText("Security fixes are off");
    await expect(page.getByRole("link", { name: "Set up the policy" })).toHaveAttribute("href", /^\/security\/policy\/?$/);
    await expect(page.getByTestId("scan-now")).toHaveCount(0);
    expect(call(db, "GET /api/security/findings")).toHaveLength(0);
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
    await expect(page.getByRole("link", { name: "Open PR #1532" })).toHaveAttribute("href", "https://github.com/acme/web-app/pull/1532");
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

  test("the policy saves every field in the exact body, with plain checks first", async ({ page }) => {
    const db = await mockApi(page);
    await page.goto("/security/policy");
    await expect(page.getByRole("heading", { name: "Security policy" })).toBeVisible();

    await page.getByTestId("sec-enabled").click(); // already on: off
    await page.getByTestId("sec-enabled").click(); // and on again
    await page.getByTestId("sec-dry-run").click(); // off
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
    await expect(page.getByTestId("finding-row")).toHaveCount(2);
    await expect(page.getByTestId("scan-now")).toHaveCount(0);
    await page.goto("/security/detail?id=sec_1");
    await expect(page.getByTestId("evidence")).toBeVisible();
    await expect(page.getByTestId("dismiss-open")).toHaveCount(0);
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
    db.findings = { items: "nope" };
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
