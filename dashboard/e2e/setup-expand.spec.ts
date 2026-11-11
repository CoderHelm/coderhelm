import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { mockSetup, smartDoneRun, type SetupDb } from "./setup-mock";

// The Setup page's repo rows open to the repo's features: each one on, a
// preview, off or not used here, why, and a link to its settings. And the
// end of a "Do it for me" run: worth a look first, kept settings with who set
// them and Use recommended, team-wide settings once. Made-up team only.

const calls = (db: SetupDb, call: string) => db.calls.filter((c) => c.call === call);
const SHOTS = process.env.E2E_SHOTS_DIR;

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

async function noSideScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
}

test.describe("a repo row opens to its features", () => {
  test("the row says why in one line, and opens on demand to every feature with its state and reason", async ({ page }) => {
    const db = await mockSetup(page);
    await page.goto("/setup");
    const row = page.locator('[data-testid="setup-repo-row"][data-repo="acme/web-app"]');
    // Collapsed, the count explains itself.
    await expect(row.getByTestId("features-cell")).toContainText("5 on · 2 previews · 3 off");
    // The table fits its box, before and after a row opens.
    const table = page.getByRole("table", { name: "Repos" });
    const overflow = () => table.evaluate((el) => (el.parentElement ? el.parentElement.scrollWidth - el.parentElement.clientWidth : 0));
    expect(await overflow()).toBeLessThanOrEqual(0);
    // Below the widest screens the last setup date sits under the repo's name instead of in its own column.
    await expect(row.getByTestId("repo-last-setup")).toHaveText(/^Set up /);
    await expect(row.getByTestId("features-why")).toContainText("Auto-merge (preview waiting)");
    await expect(row.getByTestId("features-cell")).toHaveAttribute("title", /5 on, 2 previews, 3 off/);
    // Nothing is read before it opens.
    expect(calls(db, "GET /api/setup/repos/acme/web-app")).toHaveLength(0);

    const button = row.getByTestId("repo-expand");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toHaveAccessibleName("Show the features of acme/web-app");
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    const panel = page.locator(`#${await button.getAttribute("aria-controls")}`);
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("features-header")).toHaveText("5 on, 2 previews, 3 off of the 10 that fit this repo; 2 not used here");
    expect(calls(db, "GET /api/setup/repos/acme/web-app").length).toBeGreaterThan(0);

    // Grouped: previews first, then on, off, not used here, and the always-on ones.
    await expect(panel.getByTestId("feature-group")).toHaveCount(5);
    const states = await panel.getByTestId("feature-group").evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
    expect(states).toEqual(["preview", "on", "off", "not_used", "always"]);
    const f = (id: string) => panel.locator(`[data-testid="feature-row"][data-feature="${id}"]`);
    await expect(f("reviewer").getByTestId("feature-state")).toHaveText("On");
    await expect(f("reviewer").getByTestId("feature-mark")).toHaveText("Yours");
    await expect(f("reviewer").getByTestId("feature-value")).toHaveText("Reviews pull requests labelled ch-review");
    await expect(f("tests").getByTestId("feature-mark")).toHaveText("Recommended");
    await expect(f("stale_prs").getByTestId("feature-state")).toHaveText("Preview");
    await expect(f("stale_prs").getByTestId("feature-why")).toContainText("7 days with no activity, then closed 7 days later");
    await expect(f("reminders").getByTestId("feature-why")).toHaveText(/^Off: you kept your setting\./);
    await expect(f("tags").getByTestId("feature-why")).toHaveText(/^Off by default/);
    await expect(f("code_graph").getByTestId("feature-why")).toContainText("needs the \"Manage repos\" permission");
    await expect(f("release_notes").getByTestId("feature-state")).toHaveText("Not used here");
    await expect(f("agent_file").getByTestId("feature-state")).toHaveText("On, refreshes by itself");

    // Each feature links to its own settings, on this repo where the page takes one (the static export adds a trailing slash).
    await expect(f("reviewer").getByTestId("feature-settings-link")).toHaveAttribute("href", /^\/reviewer\/config\/?\?section=reviews&repo=acme%2Fweb-app$/);
    await expect(f("stale_prs").getByTestId("feature-settings-link")).toHaveAttribute("href", /^\/reviewer\/stale\/?\?view=settings$/);
    await expect(f("security").getByTestId("feature-settings-link")).toHaveAttribute("href", /^\/security\/policy\/?$/);

    // The settings behind a feature, and the evidence, one more click away; team-wide ones say so.
    await f("tests").getByTestId("feature-detail-toggle").click();
    await expect(f("tests").getByTestId("feature-settings")).toContainText("Quarantine flaky tests");
    await expect(f("tests").getByTestId("feature-settings")).toContainText("team-wide");
    await expect(f("tests").getByTestId("evidence")).toContainText(".github/workflows/e2e.yml:41");
    // The open row never widens the table: every Settings link is on screen.
    expect(await overflow()).toBeLessThanOrEqual(0);
    await expect(f("reviewer").getByTestId("feature-settings-link")).toBeInViewport();
    await f("reviewer").getByTestId("feature-detail-toggle").click();
    await expect(f("reviewer").getByTestId("feature-settings")).toContainText("3 lines · recommended: 5 lines");

    await shot(page, "home-expanded-1280-dark");
    await page.emulateMedia({ colorScheme: "light" });
    await shot(page, "home-expanded-1280-light");

    // Closing it keeps nothing around.
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("repo-features")).toHaveCount(0);
  });

  test("the disclosure works from the keyboard", async ({ page }) => {
    await mockSetup(page);
    await page.goto("/setup");
    const button = page.locator('[data-testid="setup-repo-row"][data-repo="acme/api"]').getByTestId("repo-expand");
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator('[data-testid="repo-features"][data-repo="acme/api"]').getByTestId("features-header")).toBeVisible();
    await page.keyboard.press("Space");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator('[data-testid="repo-features"][data-repo="acme/api"]')).toHaveCount(0);
    // Every row has its own: opening two keeps both open.
    await page.keyboard.press("Enter");
    await page.locator('[data-testid="setup-repo-row"][data-repo="acme/docs-site"]').getByTestId("repo-expand").click();
    await expect(page.getByTestId("repo-features")).toHaveCount(2);
    // Nothing is remembered across a reload.
    await page.reload();
    await expect(page.getByTestId("setup-repos")).toBeVisible();
    await expect(page.getByTestId("repo-features")).toHaveCount(0);
  });

  test("a preview switches on from the row, and a failed read can be retried", async ({ page }) => {
    const db = await mockSetup(page, { repoViewFails: true });
    await page.goto("/setup");
    const row = page.locator('[data-testid="setup-repo-row"][data-repo="acme/web-app"]');
    await row.getByTestId("repo-expand").click();
    const panel = page.locator('[data-testid="repo-features"][data-repo="acme/web-app"]');
    await expect(panel.getByRole("alert")).toContainText("couldn't be loaded");
    db.repoViewFails = false;
    await panel.getByRole("button", { name: "Try again" }).click();
    const stale = panel.locator('[data-testid="feature-row"][data-feature="stale_prs"]');
    await stale.getByTestId("feature-switch-on").click();
    await expect.poll(() => calls(db, "POST /api/setup/runs/run_02/switch-on").length).toBe(1);
    expect(calls(db, "POST /api/setup/runs/run_02/switch-on")[0].body).toEqual({ repo: "acme/web-app", setting_id: "stale_prs.enabled" });
    await expect(stale.getByTestId("feature-state")).toHaveText("On");
  });

  test("a viewer sees the features and the reasons, without Switch on", async ({ page }) => {
    await mockSetup(page, { role: "viewer" });
    await page.goto("/setup");
    await page.locator('[data-testid="setup-repo-row"][data-repo="acme/web-app"]').getByTestId("repo-expand").click();
    const panel = page.locator('[data-testid="repo-features"][data-repo="acme/web-app"]');
    await expect(panel.getByTestId("feature-row")).toHaveCount(14);
    await expect(panel.getByTestId("feature-switch-on")).toHaveCount(0);
  });

  test("390 wide: one card per repo opens in place with no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockSetup(page);
    await page.goto("/setup");
    const card = page.locator('[data-testid="setup-repo-card"][data-repo="acme/web-app"]');
    await expect(card.getByTestId("features-cell")).toContainText("5 on · 2 previews · 3 off of the 10 that fit");
    await card.getByTestId("repo-expand").click();
    const panel = card.getByTestId("repo-features");
    await expect(panel.getByTestId("features-header")).toBeVisible();
    await panel.locator('[data-testid="feature-row"][data-feature="tests"]').getByTestId("feature-detail-toggle").click();
    await noSideScroll(page);
    const box = await panel.boundingBox();
    expect(box && box.x + box.width).toBeLessThanOrEqual(390);
    await shot(page, "home-expanded-390-dark");
    await page.emulateMedia({ colorScheme: "light" });
    await shot(page, "home-expanded-390-light");
  });
});

test.describe("the end of a Do it for me run says why it kept what it kept", () => {
  for (const width of [1280, 390]) {
    test(`worth a look first, kept settings with who set them, team-wide settings once (${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: width > 600 ? 900 : 844 });
      const db = await mockSetup(page, { run: smartDoneRun() });
      await page.goto("/setup/run?id=run_04");
      await expect(page.getByTestId("auto-results")).toBeVisible();
      // The first line says what it did, and the counts agree with the lists.
      await expect(page.getByTestId("auto-totals")).toHaveText("Turned on 3, 1 worth a look, 1 preview to switch on.");
      await expect(page.getByTestId("auto-kept-line")).toContainText("Kept 3 settings someone chose");
      const web = page.locator('[data-testid="auto-repo"][data-repo="acme/web-app"]');
      await expect(web.getByTestId("auto-summary")).toHaveText("Turned on 2, 1 worth a look, 1 preview to switch on, kept 2 settings someone chose");

      // Worth a look is open and first, with the file that argues against the choice.
      const worth = web.getByTestId("group-worth");
      await expect(worth.getByTestId("worth-item")).toHaveCount(1);
      await expect(worth.getByTestId("worth-item")).toContainText("You chose Off, but this repo says otherwise");
      await expect(worth.getByTestId("evidence")).toContainText("package.json:12");
      await expect(worth.getByTestId("kept-why")).toContainText("Set on the Reviewer settings page by sam@example.com on");

      // Turned on: as many rows as the count says.
      await web.getByTestId("group-changed").getByRole("button").first().click();
      await expect(web.getByTestId("changed-item")).toHaveCount(2);
      await expect(web.getByTestId("group-changed").locator("button").first()).toContainText("2");

      // Kept: each says who set it, and offers Use recommended, one or all.
      const kept = web.getByTestId("group-kept");
      await kept.getByRole("button").first().click();
      await expect(kept.getByTestId("kept-item")).toHaveCount(2);
      await expect(kept.locator('[data-testid="kept-item"][data-id="reviewer.label"]').getByTestId("kept-why")).toHaveText("Set on the Reviewer settings page, before Setup tracked who.");
      await expect(kept.locator('[data-testid="kept-item"][data-id="reminders.cooldown_hours"]').getByTestId("kept-why")).toContainText("by dana@example.com");
      await expect(kept.getByTestId("scope-tag").first()).toHaveText("This repository");

      // The team-wide settings, once, apart from the repo, with their own Undo and Use recommended.
      const team = page.getByTestId("team-section");
      await expect(team).toContainText("One value for every repository (all 6 repositories)");
      await team.getByTestId("team-changed").getByRole("button").first().click();
      await expect(team.locator('[data-testid="changed-item"][data-id="tests.auto_quarantine"]').getByTestId("scope-tag")).toHaveText("Team-wide");
      await expect(web.locator('[data-id="tests.auto_quarantine"]')).toHaveCount(0);
      await expect(web.locator('[data-id="security.open_prs"]')).toHaveCount(0);
      await team.getByTestId("team-kept").getByRole("button").first().click();
      await expect(team.locator('[data-testid="kept-item"][data-id="security.open_prs"]')).toContainText("It is one value for every repository.");
      await noSideScroll(page);
      await shot(page, `smart-results-${width}-dark`);
      await page.emulateMedia({ colorScheme: "light" });
      await shot(page, `smart-results-${width}-light`);
      await page.emulateMedia({ colorScheme: "dark" });

      // One click, then the group: the same apply, audit and undo path.
      await kept.locator('[data-testid="kept-item"][data-id="reviewer.label"]').getByTestId("use-recommended").click();
      await expect.poll(() => calls(db, "POST /api/setup/runs/run_04/use-recommended").length).toBe(1);
      expect(calls(db, "POST /api/setup/runs/run_04/use-recommended")[0].body).toEqual({ items: [{ repo: "acme/web-app", setting_id: "reviewer.label" }] });
      await expect(web.getByTestId("auto-summary")).toHaveText("Turned on 3, 1 worth a look, 1 preview to switch on, kept 1 setting someone chose");
      await worth.getByTestId("use-recommended").click();
      await expect.poll(() => calls(db, "POST /api/setup/runs/run_04/use-recommended").length).toBe(2);
      expect(calls(db, "POST /api/setup/runs/run_04/use-recommended")[1].body).toEqual({ items: [{ repo: "acme/web-app", setting_id: "tests.verify_tests" }] });
      await expect(web.getByTestId("group-worth")).toHaveCount(0);
      // A changed one has its own Undo.
      await expect(web.locator('[data-testid="changed-item"][data-id="reviewer.label"]').getByTestId("undo-item")).toBeVisible();
    });
  }

  test("Use recommended for all takes the whole group in one call", async ({ page }) => {
    const db = await mockSetup(page, { run: smartDoneRun() });
    await page.goto("/setup/run?id=run_04");
    const kept = page.locator('[data-testid="auto-repo"][data-repo="acme/web-app"]').getByTestId("group-kept");
    await kept.getByRole("button").first().click();
    await kept.getByTestId("use-recommended-all").click();
    await expect.poll(() => calls(db, "POST /api/setup/runs/run_04/use-recommended").length).toBe(1);
    expect(calls(db, "POST /api/setup/runs/run_04/use-recommended")[0].body).toEqual({
      items: [
        { repo: "acme/web-app", setting_id: "reviewer.label" },
        { repo: "acme/web-app", setting_id: "reminders.cooldown_hours" },
      ],
    });
    await expect(kept).toHaveCount(0);
  });
});
