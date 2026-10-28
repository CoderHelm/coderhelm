import { expect, test, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { pickOption } from "./select";

// Settings, then Deliveries: every webhook in and notice out. Every API call
// is answered here; nothing reaches a real backend. Names are made up.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const MIN = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const ME = { user_id: "u_1", team_id: "t_1", github_login: "dana", email: "dana@example.org", avatar_url: "", role: "admin", mfa_enabled: false };

const ROWS = [
  {
    id: "gh_01JD000000000000000000001", direction: "inbound", source: "github", event: "pull_request.opened", target: "/webhooks/github",
    status: "failed", outcome: "handler error", reason: "handler_error", external_id: "8f3c2a10-1111-4b8e-9c3d-000000000001",
    repo: "example-org/web", pr: 42, created_at: ago(5 * MIN), duration_ms: 10_020, attempts: 2, next_retry_at: null,
  },
  {
    id: "relay:01JD000000000000000000002", direction: "inbound", source: "relay", event: "issues.labeled", target: "helm.example.com",
    status: "pending", outcome: "", reason: "relay_unreachable", external_id: "", repo: "example-org/api", pr: null,
    created_at: ago(12 * MIN), duration_ms: 3_000, attempts: 3, next_retry_at: new Date(Date.now() + 4 * MIN).toISOString(),
  },
  {
    id: "alert:01JD000000000000000000003", direction: "outbound", source: "slack", event: "run.finished", target: "#deploys",
    status: "handled", outcome: "posted", reason: "", external_id: "", repo: "", pr: null, created_at: ago(40 * MIN), duration_ms: 230, attempts: 1, next_retry_at: null,
  },
  {
    id: "jira:01JD000000000000000000004", direction: "inbound", source: "jira", event: "jira:issue_updated", target: "/webhooks/jira",
    status: "ignored", outcome: "no trigger label", reason: "", external_id: "", repo: "", pr: null, created_at: ago(90 * MIN), duration_ms: 40, attempts: 1, next_retry_at: null,
  },
];

const SUMMARY = { total: 120, ok: 117, failed: 2, pending: 1, success_rate: 0.975, oldest_pending_at: ago(12 * MIN), last_failure_at: ago(5 * MIN) };

function detail(id: string) {
  const row = ROWS.find((r) => r.id === id)!;
  return {
    delivery: {
      ...row,
      attempts: [
        { at: ago(6 * MIN), code: 502, duration_ms: 10_000, error: "Bad gateway from the worker" },
        { at: ago(5 * MIN), duration_ms: 20, error: "Timed out after 10 seconds" },
      ],
      headers: { "x-github-event": "pull_request", "x-github-delivery": row.external_id || "none", "x-hub-signature-256": "[redacted]", "content-type": "application/json" },
      payload_preview: JSON.stringify({ action: "opened", repository: { full_name: row.repo || "example-org/web" }, number: 42 }),
      payload_bytes: 18_432,
      redeliver: row.source === "relay" ? "relay" : "github",
    },
    reason:
      row.status === "failed"
        ? { code: "handler_error", message: "Coderhelm took too long to answer GitHub.", fix: "Check System health for a slow worker, then redeliver." }
        : row.status === "pending"
          ? { code: "relay_unreachable", message: "Your install didn't answer.", fix: "Make sure the install is running; Coderhelm keeps trying." }
          : null,
    can_redeliver: row.status !== "handled" && row.status !== "ignored",
  };
}

interface Backend {
  empty: boolean;
  lists: URLSearchParams[];
  redelivered: string[];
}

type Sharing = { available: boolean; enabled: boolean; payloads: boolean } | undefined;

async function setup(page: Page, opts: { empty?: boolean; sharing?: Sharing | "absent" } = {}): Promise<Backend> {
  const db: Backend = { empty: !!opts.empty, lists: [], redelivered: [] };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.pathname === "/runtime-config.js", (route) => route.fulfill({ contentType: "text/javascript", body: "window.__CODERHELM_CONFIG__ = {};" }));
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const p = decodeURIComponent(u.pathname);
    if (p === "/api/me") return json(route, ME);
    if (p === "/api/usage") return json(route, { month: "2026-10", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "example-org", status: "active", current: true }] });
    if (p === "/api/deliveries") {
      db.lists.push(u.searchParams);
      const st = u.searchParams.get("status");
      const src = u.searchParams.get("source");
      const q = u.searchParams.get("q");
      let rows = db.empty ? [] : ROWS;
      if (st) rows = rows.filter((r) => r.status === st);
      if (src) rows = rows.filter((r) => r.source === src);
      if (q) rows = rows.filter((r) => [r.id, r.external_id, r.repo, String(r.pr ?? "")].some((x) => x.includes(q)));
      return json(route, {
        deliveries: rows,
        summary: db.empty ? { total: 0, ok: 0, failed: 0, pending: 0, success_rate: null, oldest_pending_at: null, last_failure_at: null } : SUMMARY,
        sources: db.empty ? [] : ["github", "jira", "relay", "slack"],
        retention_days: 14,
        ...(opts.sharing === "absent" ? {} : { sharing: opts.sharing ?? { available: true, enabled: false, payloads: false } }),
        hybrid: true,
      });
    }
    const m = p.match(/^\/api\/deliveries\/(.+?)(\/redeliver)?$/);
    if (m) {
      const id = m[1];
      if (m[2] && req.method() === "POST") {
        db.redelivered.push(u.pathname);
        if (id.startsWith("relay:")) return json(route, { code: "install_offline", error: "Your install isn't answering, so there is nowhere to send it yet." }, 409);
        return json(route, { ok: true, message: "GitHub is sending it again." });
      }
      if (!ROWS.some((r) => r.id === id)) return json(route, { code: "not_found", error: "No such delivery (they're kept 14 days)." }, 404);
      return json(route, detail(id));
    }
    return json(route, {});
  });
  return db;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true });
}

test("list: health summary, relay note, sharing note and every row", async ({ page }) => {
  await setup(page);
  await page.goto("/settings/deliveries/");
  await expect(page.getByRole("heading", { name: "Deliveries", level: 1 })).toBeVisible();
  await expect(page.getByTestId("stat-success")).toContainText("97.5%");
  await expect(page.getByTestId("stat-failed")).toContainText("2");
  await expect(page.getByTestId("stat-failed")).toContainText("Last one 5 min ago");
  await expect(page.getByTestId("stat-pending")).toContainText("Oldest from 12 min ago");
  await expect(page.getByTestId("relay-note")).toBeVisible();
  await expect(page.getByTestId("sharing-note")).toHaveAttribute("data-enabled", "false");
  await expect(page.getByTestId("sharing-note")).toHaveText(/Not shared with Coderhelm support/);
  await expect(page.getByTestId("sharing-note").getByRole("link", { name: /Change/ })).toHaveAttribute("href", /\/settings\/system\/?#hybrid-sharing$/);
  const rows = page.getByTestId("delivery-row");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText("pull_request.opened");
  await expect(rows.nth(0)).toContainText("Failed");
  await expect(rows.nth(1)).toContainText("Retrying");
  await expect(rows.nth(1)).toContainText(/at \d/);
  await expect(rows.nth(2)).toContainText("Handled");
  await expect(rows.nth(3)).toContainText("Ignored");
  // The exact time is on hover.
  await expect(rows.nth(0).locator("time")).toHaveAttribute("title", /\d/);
});

test("filters: source, status, time range and search go to the server and the address", async ({ page }) => {
  const db = await setup(page);
  await page.goto("/settings/deliveries/");
  await expect(page.getByTestId("delivery-row")).toHaveCount(4);

  await pickOption(page.getByRole("combobox", { name: "Source" }), "github");
  await expect.poll(() => db.lists.at(-1)?.get("source")).toBe("github");
  await expect(page).toHaveURL(/source=github/);
  await expect(page.getByTestId("delivery-row")).toHaveCount(1);

  await pickOption(page.getByRole("combobox", { name: "Source" }), "all");
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Failed" }).click();
  await expect.poll(() => db.lists.at(-1)?.get("status")).toBe("failed");
  await expect.poll(() => db.lists.at(-1)?.get("source")).toBeNull();
  await expect(page).toHaveURL(/status=failed/);

  await pickOption(page.getByRole("combobox", { name: "Time range" }), "1h");
  await expect.poll(() => db.lists.at(-1)?.get("since") ?? "").toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  const since = Date.parse(db.lists.at(-1)!.get("since")!);
  expect(Math.abs(Date.now() - 3_600_000 - since)).toBeLessThan(5 * MIN);

  await page.getByRole("searchbox", { name: "Search deliveries" }).fill("8f3c2a10");
  await expect.poll(() => db.lists.at(-1)?.get("q")).toBe("8f3c2a10");
  await expect(page).toHaveURL(/q=8f3c2a10/);
  await expect(page.getByTestId("delivery-row")).toHaveCount(1);

  // Filters that hide everything say so and offer to clear them.
  await page.getByRole("searchbox", { name: "Search deliveries" }).fill("nothing-matches");
  await expect(page.getByTestId("list-empty")).toContainText("No deliveries match these filters.");
  await page.getByTestId("list-empty").getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByTestId("delivery-row")).toHaveCount(4);
  await expect(page).not.toHaveURL(/status=|q=|range=/);
});

test("detail: reason and fix, attempts, headers, payload, copy id; Escape closes", async ({ page }) => {
  await setup(page);
  await page.goto("/settings/deliveries/");
  await page.getByTestId("delivery-row").first().getByRole("button", { name: "pull_request.opened" }).click();
  const drawer = page.getByTestId("delivery-drawer");
  await expect(drawer).toBeVisible();
  await expect(page).toHaveURL(/id=gh_01JD000000000000000000001/);
  await expect(drawer.getByTestId("delivery-reason")).toContainText("Coderhelm took too long to answer GitHub.");
  await expect(drawer.getByTestId("delivery-fix")).toContainText("Check System health for a slow worker");
  await expect(drawer.getByTestId("delivery-attempt")).toHaveCount(2);
  await expect(drawer.getByTestId("delivery-attempts")).toContainText("HTTP 502");
  await expect(drawer.getByTestId("delivery-attempts")).toContainText("Timed out after 10 seconds");
  await expect(drawer.getByTestId("delivery-headers")).toContainText("x-github-event");
  await expect(drawer.getByTestId("delivery-headers")).toContainText("Hidden");
  await expect(drawer.getByTestId("delivery-headers")).not.toContainText("[redacted]");
  await expect(drawer.getByTestId("delivery-payload")).toContainText("full_name");
  await expect(drawer.getByTestId("delivery-payload")).toContainText("18.0 KB");
  await expect(drawer.getByRole("button", { name: "Copy id" })).toBeVisible();
  await expect(drawer.getByRole("link", { name: "example-org/web #42" })).toHaveAttribute("href", /github\.com\/example-org\/web\/pull\/42/);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(page).not.toHaveURL(/id=/);
});

test("a delivery opens straight from the address", async ({ page }) => {
  await setup(page);
  await page.goto(`/settings/deliveries/?id=${encodeURIComponent("jira:01JD000000000000000000004")}`);
  const drawer = page.getByTestId("delivery-drawer");
  await expect(drawer.getByTestId("delivery-detail")).toHaveAttribute("data-status", "ignored");
  // Nothing to send again for a delivery that was ignored on purpose.
  await expect(drawer.getByTestId("redeliver")).toHaveCount(0);
});

test("redeliver: confirm, then a toast; the id is encoded in the path", async ({ page }) => {
  const db = await setup(page);
  await page.goto("/settings/deliveries/");
  await page.getByTestId("delivery-row").first().click();
  const drawer = page.getByTestId("delivery-drawer");
  await drawer.getByTestId("redeliver").click();
  const confirm = page.getByTestId("confirm-dialog");
  await expect(confirm).toContainText("GitHub sends this event again");
  await confirm.getByRole("button", { name: "Redeliver from GitHub" }).click();
  await expect(page.getByTestId("toast").filter({ hasText: "GitHub is sending it again." })).toBeVisible();
  expect(db.redelivered).toEqual(["/api/deliveries/gh_01JD000000000000000000001/redeliver"]);
});

test("redeliver refused: the reason shows in the drawer", async ({ page }) => {
  const db = await setup(page);
  await page.goto("/settings/deliveries/");
  await page.getByTestId("delivery-row").nth(1).click();
  const drawer = page.getByTestId("delivery-drawer");
  await expect(drawer.getByTestId("delivery-reason")).toContainText("Your install didn't answer.");
  await drawer.getByTestId("redeliver").click();
  await page.getByTestId("confirm-dialog").getByRole("button", { name: "Redeliver" }).click();
  await expect(drawer.getByTestId("redeliver-refusal")).toContainText("Your install isn't answering");
  expect(db.redelivered).toEqual(["/api/deliveries/relay%3A01JD000000000000000000002/redeliver"]);
});

test("empty: what will show up here, and how long it is kept", async ({ page }) => {
  await setup(page, { empty: true });
  await page.goto("/settings/deliveries/");
  const empty = page.getByTestId("deliveries-empty");
  await expect(empty).toContainText("No deliveries yet");
  await expect(empty).toContainText("kept for 14 days");
  await expect(page.getByTestId("stat-success")).toContainText("None yet");
});

test("the Settings hub lists Deliveries", async ({ page }) => {
  await setup(page);
  await page.goto("/settings/");
  await expect(page.getByRole("link", { name: /Deliveries/ }).first()).toHaveAttribute("href", /\/settings\/deliveries\/?$/);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("stacked cards, a full-screen drawer, nothing scrolls sideways", async ({ page }) => {
    await setup(page);
    await page.goto("/settings/deliveries/");
    await expect(page.getByTestId("delivery-card")).toHaveCount(4);
    await expect(page.getByTestId("delivery-row").first()).toBeHidden();
    const fits = () => page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth);
    expect(await fits()).toBe(true);
    await page.getByTestId("delivery-card").first().getByRole("button").click();
    const drawer = page.getByTestId("delivery-drawer");
    await expect(drawer.getByTestId("delivery-reason")).toBeVisible();
    const box = await drawer.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(390);
    expect(await fits()).toBe(true);
  });
});

// Screenshots for review: E2E_SHOTS_DIR=… npx playwright test deliveries -g screenshots
for (const [label, viewport] of [["1440", { width: 1440, height: 1000 }], ["390", { width: 390, height: 844 }]] as const) {
  test.describe(`screenshots at ${label}`, () => {
    test.use({ viewport });
    test(`deliveries screenshots ${label}`, async ({ page }) => {
      await setup(page);
      await page.goto("/settings/deliveries/");
      await expect(page.getByTestId(label === "390" ? "delivery-card" : "delivery-row")).toHaveCount(4);
      await shot(page, `deliveries-list-${label}`);
      await (label === "390" ? page.getByTestId("delivery-card").first().getByRole("button") : page.getByTestId("delivery-row").first()).click();
      await expect(page.getByTestId("delivery-drawer").getByTestId("delivery-payload")).toBeVisible();
      await page.screenshot({ path: path.join(SHOTS_DIR, `deliveries-detail-${label}.png`) });
    });
    test(`deliveries empty screenshot ${label}`, async ({ page }) => {
      await setup(page, { empty: true });
      await page.goto("/settings/deliveries/");
      await expect(page.getByTestId("deliveries-empty")).toBeVisible();
      await shot(page, `deliveries-empty-${label}`);
    });
  });
}

// The one line at the top: shared or not, and how much; left out on the hosted
// product (sharing isn't available there, or the answer has no sharing at all).
for (const [name, sharing, words] of [
  ["details only", { available: true, enabled: true, payloads: false }, "Failed deliveries are shared with Coderhelm support (details only)"],
  ["details and payloads", { available: true, enabled: true, payloads: true }, "Failed deliveries are shared with Coderhelm support (details and payload previews)"],
  ["not shared", { available: true, enabled: false, payloads: false }, "Not shared with Coderhelm support"],
] as const) {
  test(`sharing line: ${name}`, async ({ page }) => {
    await setup(page, { sharing: { ...sharing } });
    await page.goto("/settings/deliveries/");
    const note = page.getByTestId("sharing-note");
    await expect(note).toContainText(words);
    if (sharing.payloads) await expect(note).not.toContainText("details only");
    const link = note.getByRole("link", { name: /Change/ });
    await expect(link).toHaveAttribute("href", /\/settings\/system\/?#hybrid-sharing$/);
    // It sits above the health tiles.
    const noteBox = await note.boundingBox();
    const tileBox = await page.getByTestId("stat-success").boundingBox();
    expect(noteBox!.y).toBeLessThan(tileBox!.y);
    if (name === "details only") {
      fs.mkdirSync(SHOTS_DIR, { recursive: true });
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(250);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `deliveries scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
        await page.screenshot({ path: path.join(SHOTS_DIR, `deliveries-sharing-${width}.png`), fullPage: true });
      }
    }
  });
}

for (const [name, sharing] of [
  ["hosted (not available)", { available: false, enabled: false, payloads: false }],
  ["absent from the answer", "absent"],
] as const) {
  test(`sharing line: left out when ${name}`, async ({ page }) => {
    await setup(page, { sharing: sharing === "absent" ? "absent" : { ...sharing } });
    await page.goto("/settings/deliveries/");
    await expect(page.getByTestId("stat-success")).toBeVisible();
    await expect(page.getByTestId("sharing-note")).toHaveCount(0);
  });
}
