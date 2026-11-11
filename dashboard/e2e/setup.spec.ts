import { expect, test } from "@playwright/test";
import { HOME, autoDoneRun, mockSetup, readyRun, type SetupDb } from "./setup-mock";

// Setup: the menu badge, the home table and its dismissible new
// recommendations, a run from picking repos to reading them, the review with
// its three choices and the exact decisions Apply sends, the in-page confirm
// before replacing someone's value, a retry of only the failed repos, undo,
// and a reply the page can't read. Every API call is answered by setup-mock.ts.

const calls = (db: SetupDb, c: string) => db.calls.filter((x) => x.call === c);
type Decisions = { choice: string; items: { repo: string; setting_id: string; decision: string; value?: unknown }[] };
const lastDecisions = (db: SetupDb) => calls(db, "PUT /api/setup/runs/run_03/decisions").at(-1)?.body as Decisions;
const decisionOf = (d: Decisions, repo: string, id: string) => d.items.find((i) => i.repo === repo && i.setting_id === id)?.decision;

test.describe("Setup", () => {
  test("the menu puts Setup first with a count of new recommendations plus repos not set up", async ({ page }) => {
    await mockSetup(page);
    await page.goto("/setup");
    const link = page.getByTestId("main-nav").getByRole("link").first();
    // 3 new recommendations + 2 repos not set up.
    await expect(link).toHaveText(/^Setup5 things to set up$/);
    await expect(link).toHaveAttribute("aria-current", "page");

    // Dismissing one recommendation hides it here and takes one off the count.
    const recs = page.getByTestId("new-rec");
    await expect(recs).toHaveCount(3);
    await recs.first().getByTestId("dismiss-rec").click();
    await expect(recs).toHaveCount(2);
    await expect(link.getByTestId("count-badge")).toHaveText(/^4/);
    // It stays dismissed after a reload.
    await page.reload();
    await expect(page.getByTestId("new-rec")).toHaveCount(2);
  });

  test("past nine the badge says 9+", async ({ page }) => {
    const repos = Array.from({ length: 12 }, (_, i) => ({ ...HOME.repos[2], repo: `acme/service-${i + 1}` }));
    await mockSetup(page, { home: { ...HOME, repos } });
    await page.goto("/");
    await expect(page.getByTestId("main-nav").getByRole("link", { name: /^Setup/ }).getByTestId("count-badge")).toHaveText(/^9\+/);
  });

  test("the command palette offers Setup", async ({ page }) => {
    await mockSetup(page);
    await page.goto("/setup");
    await expect(page.getByTestId("setup-repos")).toBeVisible();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
    await page.keyboard.type("set up repos");
    await expect(page.getByRole("option", { name: /Set up repos/ })).toBeVisible();
  });

  test("home lists every repo with its state, features and action, the runs, and the new-repo toggle", async ({ page }) => {
    const db = await mockSetup(page);
    await page.goto("/setup");
    const rows = page.getByTestId("setup-repo-row");
    await expect(rows).toHaveCount(6);
    // Failed first, then the ones waiting on someone.
    await expect(rows.first()).toHaveAttribute("data-repo", "acme/infra");
    await expect(rows.first().getByTestId("repo-state")).toHaveText("Failed");
    await expect(rows.first().getByTestId("repo-error")).toContainText("GitHub App");
    const api = page.locator('[data-testid="setup-repo-row"][data-repo="acme/api"]');
    await expect(api).toContainText("8 of 14 · 2 changed by hand");
    await expect(api.getByTestId("repo-state")).toHaveText("Custom");
    await expect(page.getByTestId("setup-run")).toHaveCount(3);

    // Filtering by state.
    await page.getByRole("group", { name: "Show repos" }).getByRole("button", { name: /Not set up/ }).click();
    await expect(rows).toHaveCount(2);

    // The toggle saves on its own, and starts off.
    const toggle = page.getByTestId("auto-setup");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => calls(db, "PUT /api/setup/settings").at(-1)?.body).toEqual({ auto_setup_new_repos: true });
  });

  test("with no repos, one sentence says what Setup does", async ({ page }) => {
    await mockSetup(page, { home: { repos: [], new_recommendations: [], auto_setup_new_repos: false }, runs: { runs: [] } });
    await page.goto("/setup");
    await expect(page.getByTestId("setup-empty")).toContainText("Coderhelm reads each repo you connect");
    await expect(page.getByTestId("main-nav").getByRole("link", { name: /^Setup/ }).getByTestId("count-badge")).toHaveCount(0);
  });

  test("picking repos starts a run, shows what each repo has found, then moves on to Review", async ({ page }) => {
    const db = await mockSetup(page, { readyAfter: 3 });
    await page.goto("/setup");
    await page.getByTestId("start-guided").click();
    await expect(page.getByTestId("repos-step")).toBeVisible();
    await expect(page.getByTestId("mode-guided").getByRole("radio")).toBeChecked();
    await expect(page.getByTestId("pick-not_set_up").getByRole("radio")).toBeChecked();
    await expect(page.getByTestId("cost-note")).toContainText("monthly budget");
    await page.getByTestId("analyze").click();
    expect(calls(db, "POST /api/setup/runs")[0].body).toEqual({ repos: "not_set_up" });

    await expect(page).toHaveURL(/\/setup\/run\/?\?id=run_03/);
    const step = page.getByTestId("analyze-step");
    await expect(step).toBeVisible();
    await expect(step.getByTestId("tokens")).toContainText("840k tokens");
    const web = page.locator('[data-testid="analyze-repo"][data-repo="acme/web-app"]');
    await expect(web.getByTestId("found")).toContainText("Branch protection on main with 3 required checks");
    await expect(page.getByTestId("analyze-progress")).toHaveAttribute("aria-live", "polite");
    // The polling reaches "ready" and the page moves to Review by itself.
    await expect(page.getByTestId("review-step")).toBeVisible({ timeout: 20_000 });
  });

  test("picking repos by name sends just those", async ({ page }) => {
    const db = await mockSetup(page);
    await page.goto("/setup/run?mode=guided");
    await page.getByTestId("pick-pick").click();
    await page.getByRole("searchbox", { name: "Filter repos by name" }).fill("mobile");
    await page.getByRole("checkbox").first().check();
    await page.getByTestId("analyze").click();
    await expect.poll(() => calls(db, "POST /api/setup/runs").length).toBe(1);
    expect(calls(db, "POST /api/setup/runs")[0].body).toEqual({ repos: ["acme/mobile-app"] });
  });

  test("Do it for me is the first choice, and one click sets the repos up and shows what it did", async ({ page }) => {
    const db = await mockSetup(page, { readyAfter: 2 });
    await page.goto("/setup");
    const chooser = page.getByTestId("start-chooser");
    await expect(chooser.getByTestId("mode-auto")).toContainText("Recommended");
    await expect(chooser.getByTestId("start-guided")).toBeVisible();
    // A repo row offers both too, "Set up for me" first.
    const row = page.locator('[data-testid="setup-repo-row"][data-repo="acme/mobile-app"]');
    await expect(row.getByTestId("row-start").getByRole("link")).toHaveText(["Set up for me", "Review"]);

    await chooser.getByTestId("start-auto").click();
    await expect(page.getByTestId("mode-auto").getByRole("radio")).toBeChecked();
    await expect(page.getByTestId("keep-mine-toggle")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("cost-note")).toContainText("estimate");
    await page.getByTestId("analyze").click();
    expect(calls(db, "POST /api/setup/runs")[0].body).toEqual({ repos: "not_set_up", mode: "auto", overwrite: "keep_mine" });

    // The same live progress while it works, then the results are the review.
    await expect(page.getByTestId("analyze-step")).toBeVisible();
    await expect(page.getByTestId("auto-results")).toBeVisible({ timeout: 20_000 });
    const web = page.locator('[data-testid="auto-repo"][data-repo="acme/web-app"]');
    await expect(web.getByTestId("auto-summary")).toHaveText("Turned on 8 settings, kept 3 of yours, 1 is a preview you can switch on");
    // Previews are open; each change lists its evidence once opened.
    await expect(web.getByTestId("preview-item")).toHaveCount(1);
    await expect(web.locator('[data-testid="preview-item"][data-id="stale_prs.enabled"]')).toContainText("closed 2 in the last 14 days");
    await web.getByTestId("group-changed").getByRole("button").first().click();
    await expect(web.locator('[data-testid="changed-item"][data-id="tests.e2e"]')).toContainText("Playwright in package.json");
    // No guided Apply step, and nothing asked to be applied separately.
    expect(calls(db, "POST /api/setup/runs/run_03/apply")).toHaveLength(0);
    await expect(page.getByTestId("audit-undo")).toBeVisible();
  });

  test("turning Keep my settings off warns, and sends Replace mine", async ({ page }) => {
    const db = await mockSetup(page);
    await page.goto("/setup/run?repos=all&mode=auto");
    await page.getByTestId("keep-mine-toggle").click();
    await expect(page.getByTestId("keep-mine")).toContainText("Replace mine with recommended");
    await expect(page.getByTestId("replace-warning")).toBeVisible();
    await page.getByTestId("analyze").click();
    await expect.poll(() => calls(db, "POST /api/setup/runs").length).toBe(1);
    expect(calls(db, "POST /api/setup/runs")[0].body).toEqual({ repos: "all", mode: "auto", overwrite: "use_recommended" });
  });

  test("after Do it for me, one change can be undone, and a preview opens its setting to switch on", async ({ page }) => {
    const db = await mockSetup(page, { run: autoDoneRun() });
    await page.goto("/setup/run?id=run_03");
    const web = page.locator('[data-testid="auto-repo"][data-repo="acme/web-app"]');
    await web.getByTestId("group-changed").getByRole("button").first().click();
    await web.locator('[data-testid="changed-item"][data-id="reviewer.enabled"]').getByTestId("undo-item").click();
    await expect.poll(() => calls(db, "POST /api/setup/runs/run_03/undo").length).toBe(1);
    expect(calls(db, "POST /api/setup/runs/run_03/undo")[0].body).toEqual({ items: [{ repo: "acme/web-app", setting_id: "reviewer.enabled" }] });
    await expect(web.getByTestId("auto-summary")).toHaveText("Turned on 7 settings, kept 3 of yours, 1 is a preview you can switch on, 1 undone");
    await web.getByTestId("group-undone").getByRole("button").click();
    await expect(web.locator('[data-testid="undone-item"][data-id="reviewer.enabled"]')).toContainText("is back to");
    // The rest of the run stays.
    await expect(page.getByTestId("undo")).toBeVisible();

    // Switching a preview on is turning its dry run off, on its settings page for this repo.
    await expect(web.locator('[data-testid="preview-item"][data-id="stale_prs.enabled"]').getByTestId("switch-on")).toHaveAttribute(
      "href",
      /\/reviewer\/config\/?\?section=stale&repo=acme%2Fweb-app/,
    );
  });

  test("a run that doesn't fit the token limit says so, with the estimate", async ({ page }) => {
    const db = await mockSetup(page);
    await page.route((url) => url.pathname === "/api/setup/runs", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "over the limit", estimate_tokens: 2_400_000 }) })
        : route.fallback(),
    );
    await page.goto("/setup/run?repos=all&mode=auto");
    await page.getByTestId("analyze").click();
    await expect(page.getByTestId("start-problem")).toContainText("about 2.4M tokens");
    void db;
  });

  test("Keep my settings sends keep for every value someone set and use for the rest, with no confirm", async ({ page }) => {
    const db = await mockSetup(page);
    await page.goto("/setup/run?id=run_03");
    await expect(page.getByTestId("choice-keep_mine").getByRole("radio")).toBeChecked();
    // Keep my settings never replaces anything.
    await expect(page.getByTestId("apply-summary")).not.toContainText("will be replaced");
    const focus = page.locator('[data-testid="plan-item"][data-id="reviewer.instructions"]');
    await expect(focus).toHaveAttribute("data-decision", "keep");
    // Text settings show what would change as a diff.
    await expect(focus.getByTestId("item-diff")).toContainText("+3");

    await page.getByTestId("apply").click();
    await expect(page.getByTestId("overwrite-confirm")).toHaveCount(0);
    await expect(page.getByTestId("apply-step")).toBeVisible();
    const d = lastDecisions(db);
    expect(d.choice).toBe("keep_mine");
    expect(decisionOf(d, "acme/web-app", "reviewer.instructions")).toBe("keep");
    expect(decisionOf(d, "acme/web-app", "ci_labels.auto_labels")).toBe("keep");
    expect(decisionOf(d, "acme/web-app", "stale_prs.enabled")).toBe("keep");
    expect(decisionOf(d, "acme/web-app", "reviewer.enabled")).toBe("use");
    expect(decisionOf(d, "acme/web-app", "tests.e2e")).toBe("use");
    expect(decisionOf(d, "acme/api", "reviewer.require_tests")).toBe("keep");
    expect(decisionOf(d, "acme/infra", "security.enabled")).toBe("use");
    expect(calls(db, "POST /api/setup/runs/run_03/apply")).toHaveLength(1);
  });

  test("Use recommended everywhere lists each value it replaces and confirms in the page", async ({ page }) => {
    const db = await mockSetup(page);
    await page.goto("/setup/run?id=run_03");
    await page.getByTestId("choice-use_recommended").click();
    await expect(page.getByTestId("apply-summary")).toContainText("5 of yours will be replaced");
    await expect(page.locator('[data-testid="feature-group"][data-feature="reviewer"]').getByTestId("group-counts")).toContainText("1 replace yours");
    // The setting that acts on its own shows what it would have done.
    await expect(page.locator('[data-testid="plan-item"][data-id="stale_prs.enabled"]').getByTestId("effect")).toContainText("closed 2 in the last 14 days");

    await page.getByTestId("apply").click();
    const confirm = page.getByTestId("overwrite-confirm");
    await expect(confirm).toBeVisible();
    await expect(confirm.getByTestId("overwrite")).toHaveCount(5);
    await expect(confirm).toContainText("Close stale pull requests");
    await expect(confirm).toContainText("Text rewritten");
    // Nothing was sent yet.
    expect(calls(db, "POST /api/setup/runs/run_03/apply")).toHaveLength(0);
    await page.getByRole("button", { name: "Go back" }).click();
    await expect(confirm).toHaveCount(0);

    await page.getByTestId("apply").click();
    await page.getByRole("button", { name: "Replace 5 and apply" }).click();
    await expect(page.getByTestId("apply-step")).toBeVisible();
    const d = lastDecisions(db);
    expect(d.choice).toBe("use_recommended");
    expect(decisionOf(d, "acme/web-app", "reviewer.instructions")).toBe("use");
    expect(decisionOf(d, "acme/api", "reviewer.require_tests")).toBe("use");
  });

  test("one setting can be kept or edited whatever the choice at the top", async ({ page }) => {
    const db = await mockSetup(page);
    await page.goto("/setup/run?id=run_03");
    await page.getByTestId("choice-use_recommended").click();
    const stale = page.locator('[data-testid="plan-item"][data-id="stale_prs.days_to_stale"]');
    await stale.getByRole("button", { name: "Edit" }).click();
    await stale.getByLabel("Your value").fill("10");
    const labels = page.locator('[data-testid="plan-item"][data-id="ci_labels.auto_labels"]');
    await labels.getByRole("button", { name: "Keep" }).click();
    await expect(page.getByTestId("apply-summary")).toContainText("4 of yours will be replaced");
    await page.getByTestId("apply").click();
    await page.getByRole("button", { name: "Replace 4 and apply" }).click();
    await expect(page.getByTestId("apply-step")).toBeVisible();
    const d = lastDecisions(db);
    expect(d.items.find((i) => i.setting_id === "stale_prs.days_to_stale")).toMatchObject({ decision: "edit", value: 10 });
    expect(decisionOf(d, "acme/web-app", "ci_labels.auto_labels")).toBe("keep");
  });

  test("a partial failure retries only the repos that failed, and links the draft PR", async ({ page }) => {
    const db = await mockSetup(page);
    await page.goto("/setup/run?id=run_03");
    await page.getByTestId("apply").click();
    await expect(page.getByTestId("apply-headline")).toHaveText("2 of 3 repos done, 1 failed");
    await expect(page.getByTestId("apply-headline")).toHaveAttribute("aria-live", "polite");
    await expect(page.locator('[data-testid="apply-repo"][data-repo="acme/infra"]')).toContainText("GitHub App");
    await expect(page.getByTestId("draft-pr")).toHaveAttribute("href", "https://github.com/acme/web-app/pull/1102");
    await expect(page.getByTestId("audit-undo")).toContainText("Saved to the audit log");

    await page.getByTestId("retry-failed").click();
    await expect(page.getByTestId("apply-headline")).toHaveText(/^Done: 13 settings changed on 3 repos$/);
    const applies = calls(db, "POST /api/setup/runs/run_03/apply");
    expect(applies).toHaveLength(2);
    expect(applies[1].body).toEqual({ repos: ["acme/infra"] });
  });

  test("undo asks in the page, then lists what it left alone", async ({ page }) => {
    const db = await mockSetup(page, { run: { ...readyRun(), state: "applying" } });
    await page.goto("/setup/run?id=run_03");
    await expect(page.getByTestId("audit-undo")).toBeVisible();
    await page.getByTestId("undo").click();
    const confirm = page.getByTestId("undo-confirm");
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole("heading", { name: "Undo this run?" })).toBeFocused();
    await confirm.getByRole("button", { name: "Keep the changes" }).click();
    await expect(confirm).toHaveCount(0);
    expect(calls(db, "POST /api/setup/runs/run_03/undo")).toHaveLength(0);

    await page.getByTestId("undo").click();
    await page.getByTestId("undo-confirm-button").click();
    await expect(page.getByTestId("undone")).toBeVisible();
    await expect(page.getByTestId("undo-skipped")).toContainText("Days before a pull request is stale on web-app");
    expect(calls(db, "POST /api/setup/runs/run_03/undo")).toHaveLength(1);
    await expect(page.getByTestId("undo")).toHaveCount(0);
  });

  test("a reply the page can't read shows an error, never a crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await mockSetup(page, { homeOverride: { repos: "nope" }, runOverride: { run_id: 4, repos: null } });
    await page.goto("/setup");
    await expect(page.getByTestId("setup-error")).toContainText("can't read");
    // No badge from an answer it can't read.
    await expect(page.getByTestId("main-nav").getByRole("link", { name: /^Setup/ }).getByTestId("count-badge")).toHaveCount(0);
    await page.goto("/setup/run?id=run_03");
    await expect(page.getByTestId("run-error")).toContainText("can't read");
    expect(errors).toEqual([]);
  });
});
