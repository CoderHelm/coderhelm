import { expect, test, type Page, type Route } from "@playwright/test";

// Settings, System: one press of Update does the whole job. The button shows
// progress at once and can't be pressed twice; pressing it while the
// release check runs is recorded, never an error; while an update runs a
// newer release is only mentioned, never a second Update button; error
// toasts are kept for real failures and say what to do.

const NOW = Date.now();
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const unix = (min: number) => Math.floor((NOW - min * 60_000) / 1000);
const pass = (key: string, label: string) => ({ key, group: "Install", label, status: "pass", detail: `${label}: fine.` });
const CHECKS = [pass("url", "Web address answers"), pass("github_app", "GitHub accepts the app's keys"), pass("email_identity", "Email sender verified"), pass("model", "Claude answers a test call")];
const NOTES = "## What changed\n\n- Faster reviews on large pull requests (#812)\n- Jira links keep their labels (#815)";
const rel = (v: string, extra: Record<string, unknown> = {}) => ({ version: v, notes: NOTES, published_at: "2026-11-05T16:00:00Z", url: `https://example.org/releases/${v}`, breaking: false, ...extra });
const SETTINGS = { auto: false, channel: "stable", day: "sun", hour: 3, timezone: "UTC", majors: "ask", digest: "weekly" };
const OK_HISTORY = [{ id: "UPDATE#1", version: "v0.8.45", from_version: "v0.8.44", actor: "auto", mode: "update", status: "succeeded", started_at: "2026-11-02T03:00:00Z", finished_at: "2026-11-02T03:14:00Z" }];
const CS_LINK = "https://us-east-1.console.aws.amazon.com/cloudformation/home#/stacks/changesets/changes?stackId=x&changeSetId=y";
const PENDING = (v: string, min = 1) => ({ version: v, checked_at: ago(min), started_at: ago(min), ok: false, pending: true, results: [], progress: { step: "signature", started_at: ago(min), build: "IN_PROGRESS" } });

type V = Record<string, unknown>;
interface World {
  v: V;
  update?: (body: V, w: World) => { status: number; body: unknown };
  rollback?: (w: World) => { status: number; body: unknown };
  apply?: (w: World) => { status: number; body: unknown };
  save?: (body: V, w: World) => { status: number; body: unknown };
  uninstall?: (body: V) => { status: number; body: unknown };
  check?: (w: World) => { status: number; body: unknown };
}


async function setup(page: Page, w: World) {
  const calls: string[] = [];
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.pathname === "/runtime-config.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: `window.__CODERHELM_CONFIG__ = ${JSON.stringify({ apiUrl: "", streamUrl: "", selfHosted: true, version: "v0.8.45" })};` }),
  );
  await page.route((url) => !["localhost", "127.0.0.1"].includes(url.hostname), (route) => route.abort());
  await page.route((url) => ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const p = new URL(route.request().url()).pathname;
    const method = route.request().method();
    calls.push(`${method} ${p}`);
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "admin@acme.example", avatar_url: "", role: "owner", auth_provider: "email", mfa_enabled: true, platform_admin: true });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/system/version" || p === "/api/system/releases/check") {
      return json(route, {
        self_hosted: true,
        current: { version: "v0.8.45", commit: "0123456789abcdef0123456789abcdef01234567", released_at: "2026-11-01T00:00:00Z", config_fingerprint: "0a3bb7ad772e" },
        latest: null, update_available: false, running: false, settings: SETTINGS, history: OK_HISTORY,
        releases: { fetched_at: unix(2), stale: false, reason: null, error: null, behind: null },
        install: { stage: "acme", region: "us-east-1" },
        native: { stack: "coderhelm-acme", can_apply: true, auto_apply: true, pending: null },
        uninstall: { delete_data: false, changed_by: null, changed_at: null },
        ...w.v,
      });
    }
    if (p === "/api/system/preflight") return json(route, { checked_at: ago(0.2), ready: true, current: "v0.8.45", latest: null, blockers: [], checks: CHECKS });
    if (p === "/api/system/update" && w.update) {
      await new Promise((r) => setTimeout(r, 600));
      const r = w.update(route.request().postDataJSON() as V, w);
      return json(route, r.body, r.status);
    }
    if (p === "/api/system/update/apply" && w.apply) { const r = w.apply(w); return json(route, r.body, r.status); }
    if (p === "/api/system/rollback" && w.rollback) { const r = w.rollback(w); return json(route, r.body, r.status); }
    if (p === "/api/system/update-check" && w.check) { const r = w.check(w); return json(route, r.body, r.status); }
    if (p === "/api/system/auto-update" && w.save) { const r = w.save(route.request().postDataJSON() as V, w); return json(route, r.body, r.status); }
    if (p === "/api/system/uninstall-mode" && w.uninstall) { const r = w.uninstall(route.request().postDataJSON() as V); return json(route, r.body, r.status); }
    if (p === "/api/system/hybrid" || p === "/api/hybrid") return json(route, { registered: false });
    if (p === "/api/system/models") return json(route, { provider: "bedrock", inference_prefix: "us.", model_ids: {}, source: "deploy", updated_at: null, updated_by: null, deploy_default: { provider: "bedrock", inference_prefix: "us." }, region: "us-east-1", models: ["claude-opus-5-5", "claude-sonnet-5-5"], bedrock_ids: { "claude-opus-5-5": "us.anthropic.claude-opus-5-5", "claude-sonnet-5-5": "us.anthropic.claude-sonnet-5-5" }, prefixes: ["us.", "eu.", ""] });
    if (p === "/api/system/domain") return json(route, { available: true, status: "aws", code: "aws", domain: { state: "none" }, check: null });
    return json(route, {});
  });
  return calls;
}


const status = (page: Page) => page.getByTestId("update-status");
const toasts = (page: Page) => page.getByTestId("toast");
const updateButtons = (page: Page) => page.getByRole("button", { name: /^Update to / });
const PREPARING = (v: string) => ({
  native: { stack: "coderhelm-acme", can_apply: true, auto_apply: true, pending: { status: "preparing", version: v, id: "UPDATE#2", actor: "admin@acme.example", started_at: ago(0) } },
  history: [{ id: "UPDATE#2", version: v, from_version: "v0.8.45", actor: "admin@acme.example", mode: "update", status: "preparing", started_at: ago(0) }, ...OK_HISTORY],
});
const posts = (calls: string[], p: string) => calls.filter((c) => c === `POST ${p}`).length;

test.describe("Update: one press does the whole job", () => {
  test("pressed while the release check runs: Checking, who pressed, no toast, nothing more to press", async ({ page }) => {
    const w: World = {
      v: { latest: rel("v0.8.46"), update_available: true },
      update: (_b, w) => {
        const request = { version: "v0.8.46", actor: "admin@acme.example", requested_at: ago(0), status: "waiting", waiting_for: "the release check" };
        w.v = { ...w.v, model_check: PENDING("v0.8.46", 0), update_request: request };
        return { status: 200, body: { ok: true, state: "checking", version: "v0.8.46", model_check: PENDING("v0.8.46", 0), request } };
      },
    };
    const calls = await setup(page, w);
    await page.goto("/settings/system/");
    const button = page.getByRole("button", { name: "Update to v0.8.46" });
    await button.click();
    // Progress shows at once, and the button can't be pressed again meanwhile.
    await expect(status(page).getByRole("button", { name: "Starting…" })).toBeDisabled();
    await expect(status(page)).toHaveAttribute("data-state", "checking-release");
    await expect(status(page)).toContainText("Checking v0.8.46 before it can be applied");
    await expect(page.getByTestId("update-requested")).toContainText("admin@acme.example pressed Update");
    await expect(page.getByTestId("update-requested")).toContainText("it starts by itself once the check passes");
    await expect(updateButtons(page)).toHaveCount(0);
    await page.waitForTimeout(800);
    await expect(toasts(page)).toHaveCount(0);
    expect(posts(calls, "/api/system/update")).toBe(1);
    // The check passes and the updater starts it: the card moves on by itself.
    w.v = { ...w.v, model_check: { version: "v0.8.46", checked_at: ago(0), ok: true, results: [] }, update_request: { version: "v0.8.46", status: "started", id: "UPDATE#2" }, ...PREPARING("v0.8.46") };
    await expect(status(page)).toHaveAttribute("data-state", "preparing", { timeout: 20_000 });
    expect(posts(calls, "/api/system/update")).toBe(1);
  });

  test("a double click sends one request and the button never comes back while it starts", async ({ page }) => {
    const w: World = {
      v: { latest: rel("v0.8.46"), update_available: true, model_check: { version: "v0.8.46", checked_at: ago(5), ok: true, results: [] } },
      update: (_b, w) => {
        w.v = { ...w.v, ...PREPARING("v0.8.46") };
        return { status: 200, body: { id: "UPDATE#2", version: "v0.8.46", status: "preparing", state: "started" } };
      },
    };
    const calls = await setup(page, w);
    await page.goto("/settings/system/");
    await page.getByRole("button", { name: "Update to v0.8.46" }).dblclick();
    await expect(status(page)).toHaveAttribute("data-state", "preparing");
    await expect(updateButtons(page)).toHaveCount(0);
    expect(posts(calls, "/api/system/update")).toBe(1);
    await expect(toasts(page)).toHaveCount(0);
  });

  test("a read from before the press never brings the Update button back: Starting until the updater shows it", async ({ page }) => {
    let pressed = false;
    let reads = 0;
    const w: World = {
      v: { latest: rel("v0.8.46"), update_available: true, model_check: { version: "v0.8.46", checked_at: ago(5), ok: true, results: [] } },
      update: () => { pressed = true; return { status: 200, body: { id: "UPDATE#2", version: "v0.8.46", status: "preparing", state: "started" } }; },
    };
    const calls = await setup(page, w);
    await page.route((url) => url.pathname === "/api/system/version", async (route) => {
      if (pressed && ++reads > 2) w.v = { ...w.v, ...PREPARING("v0.8.46") };
      return route.fallback();
    });
    await page.goto("/settings/system/");
    await page.getByRole("button", { name: "Update to v0.8.46" }).click();
    await expect(status(page)).toHaveAttribute("data-state", "starting");
    await expect(status(page)).toContainText("Starting the update to v0.8.46");
    await expect(status(page)).toContainText("there's nothing more to press");
    await expect(updateButtons(page)).toHaveCount(0);
    await expect(status(page)).toHaveAttribute("data-state", "preparing", { timeout: 20_000 });
    expect(posts(calls, "/api/system/update")).toBe(1);
  });

  test("a newer release out while one prepares: mentioned quietly, never a second Update button", async ({ page }) => {
    await setup(page, { v: { latest: rel("v0.8.47"), update_available: true, ...PREPARING("v0.8.46") } });
    await page.goto("/settings/system/");
    await expect(status(page)).toHaveAttribute("data-state", "preparing");
    await expect(status(page)).toContainText("Preparing the update to v0.8.46");
    await expect(page.getByTestId("update-next")).toHaveText("v0.8.47 is out too; it's next after this one.");
    await expect(updateButtons(page)).toHaveCount(0);
    await expect(page.getByTestId("release-notes")).toHaveCount(0);
  });

  test("a newer release out while the pressed one is checked: still Checking the pressed one, the newer one mentioned", async ({ page }) => {
    await setup(page, {
      v: {
        latest: rel("v0.8.47"), update_available: true, model_check: PENDING("v0.8.46", 2),
        update_request: { version: "v0.8.46", actor: "admin@acme.example", requested_at: ago(2), status: "waiting", waiting_for: "the release check" },
      },
    });
    await page.goto("/settings/system/");
    await expect(status(page)).toHaveAttribute("data-state", "checking-release");
    await expect(status(page)).toContainText("Checking v0.8.46");
    await expect(page.getByTestId("update-next")).toContainText("v0.8.47 is out too");
    await expect(updateButtons(page)).toHaveCount(0);
  });

  test("once the update finished, the newer release is offered once", async ({ page }) => {
    await setup(page, { v: { current: { version: "v0.8.46", commit: null, released_at: null, config_fingerprint: null }, latest: rel("v0.8.47"), update_available: true, history: [{ id: "UPDATE#2", version: "v0.8.46", from_version: "v0.8.45", actor: "admin@acme.example", mode: "update", status: "succeeded", started_at: ago(20), finished_at: ago(1) }, ...OK_HISTORY] } });
    await page.goto("/settings/system/");
    await expect(status(page)).toHaveAttribute("data-state", "available");
    await expect(updateButtons(page)).toHaveCount(1);
    await expect(page.getByTestId("update-next")).toHaveCount(0);
  });

  test("a press that ended says why in the card", async ({ page }) => {
    await setup(page, { v: { latest: rel("v0.8.46"), update_available: true, update_request: { version: "v0.8.46", actor: "admin@acme.example", requested_at: ago(30), status: "ended", reason: "the update to v0.8.45 is still running; this one can start once it finishes", ended_at: ago(25) } } });
    await page.goto("/settings/system/");
    await expect(page.getByTestId("update-ended")).toContainText("didn't apply it: the update to v0.8.45 is still running");
  });
});

test.describe("Update: error toasts only for real failures", () => {
  test("a real 500: a toast that says what went wrong and what to do, and Update works again", async ({ page }) => {
    let n = 0;
    const w: World = {
      v: { latest: rel("v0.8.46"), update_available: true },
      update: (_b, w) => {
        n += 1;
        if (n === 1) return { status: 500, body: {} };
        w.v = { ...w.v, ...PREPARING("v0.8.46") };
        return { status: 200, body: { id: "UPDATE#2", version: "v0.8.46", status: "preparing", state: "started" } };
      },
    };
    await setup(page, w);
    await page.goto("/settings/system/");
    await page.getByRole("button", { name: "Update to v0.8.46" }).click();
    await expect(toasts(page)).toHaveText(["Couldn't start the update: the server didn't answer (error 500). Nothing changed; try again in a minute."]);
    await expect(status(page)).toHaveAttribute("data-state", "available");
    await page.getByRole("button", { name: "Update to v0.8.46" }).click();
    await expect(status(page)).toHaveAttribute("data-state", "preparing");
  });

  test("a model the release calls refused: the card shows it with the fix, no toast", async ({ page }) => {
    const mc = { version: "v0.8.46", checked_at: ago(1), ok: false, provider: "bedrock", results: [{ model: "claude-sonnet-5-5", id: "us.anthropic.claude-sonnet-5-5", status: "fail", code: "terms", detail: "The terms for this model haven't been accepted in this AWS account.", fix: "Accept the terms in the Bedrock console.", required: true }] };
    await setup(page, {
      v: { latest: rel("v0.8.46"), update_available: true },
      update: (_b, w) => { w.v = { ...w.v, model_check: mc }; return { status: 409, body: { error: "Update to v0.8.46 needs your action: The terms for this model haven't been accepted in this AWS account.", model_check: mc } }; },
    });
    await page.goto("/settings/system/");
    await page.getByRole("button", { name: "Update to v0.8.46" }).click();
    await expect(status(page)).toHaveAttribute("data-state", "needs-action");
    await page.waitForTimeout(800);
    await expect(toasts(page)).toHaveCount(0);
  });

  test("a refusal with its reason: the toast names it", async ({ page }) => {
    await setup(page, { v: { latest: rel("v0.8.46"), update_available: true }, update: () => ({ status: 400, body: { error: "the update to v0.8.45 is still running; this one can start once it finishes" } }) });
    await page.goto("/settings/system/");
    await page.getByRole("button", { name: "Update to v0.8.46" }).click();
    await expect(toasts(page)).toHaveText(["Couldn't start the update: the update to v0.8.45 is still running; this one can start once it finishes."]);
  });

  test("Apply after it was applied in the AWS console: the card shows it applying, no toast", async ({ page }) => {
    const prepared = { version: "v0.8.46", status: "review", counts: { add: 2, modify: 5, remove: 0 }, parts: ["Api"], link: CS_LINK, id: "UPDATE#2", can_apply: true, data_changes: [], permission_changes: [], admin_changes: [] };
    const calls = await setup(page, {
      v: { latest: rel("v0.8.46"), update_available: true, native: { stack: "coderhelm-acme", can_apply: true, auto_apply: true, pending: prepared } },
      apply: (w) => {
        w.v = { ...w.v, running: true, native: { stack: "coderhelm-acme", can_apply: true, auto_apply: true, pending: { ...prepared, status: "running", execution: "EXECUTE_IN_PROGRESS", applied_by: "someone in the AWS console", executed_at: ago(1) } } };
        return { status: 400, body: { error: "no prepared update is waiting for you (reload the page)" } };
      },
    });
    await page.goto("/settings/system/");
    await page.getByRole("button", { name: "Apply v0.8.46" }).dblclick();
    await expect(status(page)).toHaveAttribute("data-state", "updating");
    await expect(page.getByTestId("native-update-progress")).toContainText("It was applied in the AWS console.");
    await expect(toasts(page)).toHaveCount(0);
    expect(posts(calls, "/api/system/update/apply")).toBe(1);
  });

  test("settings saves: a refusal and a 502 each say what to do; polling never drops an unsaved change", async ({ page }) => {
    let n = 0;
    await setup(page, {
      v: { latest: rel("v0.8.46"), update_available: true, ...PREPARING("v0.8.46") },
      save: (b) => { n += 1; if (n === 1) return { status: 400, body: { error: "timezone: an IANA name such as Europe/Berlin" } }; if (n === 2) return { status: 502, body: {} }; return { status: 200, body: { settings: b } }; },
    });
    await page.clock.install({ time: new Date(NOW) });
    await page.goto("/settings/system/");
    await page.getByTestId("channel-beta").click();
    // The page reads the version route every 10 seconds while it prepares.
    await page.clock.fastForward(21_000);
    await expect(page.getByTestId("channel-beta").getByRole("radio")).toBeChecked();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(toasts(page).last()).toHaveText("Couldn't save the update settings: timezone: an IANA name such as Europe/Berlin.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(toasts(page).last()).toHaveText("Couldn't save the update settings: the server didn't answer (error 502). Nothing changed; try again in a minute.");
    await expect(page.getByTestId("channel-beta").getByRole("radio")).toBeChecked();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(toasts(page).last()).toHaveText("Update settings saved");
  });
});

test.describe("Version and updates: the page", () => {
  test("an old release list never says up to date, and Check for updates is the action", async ({ page }) => {
    await setup(page, { v: { releases: { fetched_at: unix(60 * 80), stale: true, reason: null, error: null, behind: null } } });
    await page.goto("/settings/system/");
    await expect(status(page)).toHaveAttribute("data-state", "stale");
    await expect(status(page)).toContainText("Not checked for updates lately");
    await expect(page.locator("#version")).not.toContainText("up to date");
  });

  test("update sections come first: Version, Automatic updates, Update history, then the install", async ({ page }) => {
    await setup(page, { v: {} });
    await page.goto("/settings/system/");
    await expect(status(page)).toBeVisible();
    const ids = await page.locator("main section[id], main [id]").evaluateAll((els) => els.map((e) => e.id).filter((i) => ["version", "auto", "history", "health", "models", "domain", "hybrid", "uninstall"].includes(i)));
    expect(ids).toEqual(["version", "auto", "history", "health", "models", "domain", "hybrid", "uninstall"]);
  });

  test("nothing to roll back to: a line that says so, no dead button", async ({ page }) => {
    await setup(page, { v: { history: [] } });
    await page.goto("/settings/system/");
    await expect(page.getByTestId("rollback")).toHaveCount(0);
    await expect(page.getByTestId("rollback-note")).toContainText("Nothing to roll back to yet");
  });

  test("the version route doesn't answer: what happened and Try again", async ({ page }) => {
    await setup(page, { v: {} });
    await page.route((url) => url.pathname === "/api/system/version", (route) => route.fulfill({ status: 502, contentType: "application/json", body: "{}" }));
    await page.goto("/settings/system/");
    await expect(page.getByText("Couldn't load this install's version")).toBeVisible();
    await expect(page.getByText("The server didn't answer.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});
