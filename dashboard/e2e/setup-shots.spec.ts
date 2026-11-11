import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { analyzingRun, autoDoneRun, mockSetup, readyRun } from "./setup-mock";

// Screenshots of every Setup screen and state at 1280 and 400 wide, for the
// design review. Made-up team and repos only. Set E2E_SHOTS_DIR to keep them.

const DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "setup-shots");

async function shoot(page: Page, name: string, full = true) {
  fs.mkdirSync(DIR, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(DIR, `${name}.png`), fullPage: full });
}

for (const width of [1280, 400]) {
  test.describe(`setup screens at ${width}`, () => {
    test.use({ viewport: { width, height: width > 600 ? 900 : 860 } });

    test("home", async ({ page }) => {
      await mockSetup(page);
      await page.goto("/setup");
      await expect(page.getByTestId("setup-repos")).toBeVisible();
      await shoot(page, `home-${width}`);
    });

    test("home loading and empty", async ({ page }) => {
      const db = await mockSetup(page, { home: { repos: [], new_recommendations: [], auto_setup_new_repos: false, last_run: null }, runs: { runs: [] } });
      await page.goto("/setup");
      await expect(page.getByTestId("setup-empty")).toBeVisible();
      await shoot(page, `home-empty-${width}`, false);
      void db;
    });

    test("repos step", async ({ page }) => {
      await mockSetup(page);
      await page.goto("/setup/run?repos=not_set_up");
      await expect(page.getByTestId("repos-step")).toBeVisible();
      await shoot(page, `repos-${width}`);
      await page.getByTestId("pick-pick").click();
      await expect(page.getByTestId("repo-picker")).toBeVisible();
      await shoot(page, `repos-pick-${width}`);
    });

    test("analyzing", async ({ page }) => {
      await mockSetup(page, { run: analyzingRun() });
      await page.goto("/setup/run?id=run_03");
      await expect(page.getByTestId("analyze-step")).toBeVisible();
      await shoot(page, `analyzing-${width}`);
    });

    test("review with diffs", async ({ page }) => {
      await mockSetup(page, { run: readyRun() });
      await page.goto("/setup/run?id=run_03");
      await expect(page.getByTestId("review-step")).toBeVisible();
      await shoot(page, `review-${width}`);
      await page.getByTestId("choice-use_recommended").click();
      await shoot(page, `review-use-recommended-${width}`);
      await page.getByTestId("apply").click();
      await expect(page.getByTestId("overwrite-confirm")).toBeVisible();
      await shoot(page, `overwrite-confirm-${width}`, false);
    });

    test("apply partial failure and undo", async ({ page }) => {
      await mockSetup(page, { run: readyRun() });
      await page.goto("/setup/run?id=run_03");
      await page.getByTestId("apply").click();
      await expect(page.getByTestId("apply-headline")).toContainText("failed");
      await shoot(page, `apply-partial-failure-${width}`);
      await page.getByTestId("undo").click();
      await expect(page.getByTestId("undo-confirm")).toBeVisible();
      await shoot(page, `undo-confirm-${width}`);
      await page.getByTestId("undo-confirm-button").click();
      await expect(page.getByTestId("undone")).toBeVisible();
      await shoot(page, `undone-${width}`);
    });

    test("do it for me: chooser, running, results", async ({ page }) => {
      await mockSetup(page, { run: { ...analyzingRun(), mode: "auto" } });
      await page.goto("/setup/run?repos=not_set_up&mode=auto");
      await expect(page.getByTestId("mode-choice")).toBeVisible();
      await shoot(page, `auto-chooser-${width}`);
      await page.getByTestId("keep-mine-toggle").click();
      await expect(page.getByTestId("replace-warning")).toBeVisible();
      await shoot(page, `auto-chooser-replace-${width}`);
      await page.goto("/setup/run?id=run_03");
      await expect(page.getByTestId("analyze-step")).toBeVisible();
      await shoot(page, `auto-running-${width}`);
    });

    test("do it for me: results", async ({ page }) => {
      await mockSetup(page, { run: autoDoneRun() });
      await page.goto("/setup/run?id=run_03");
      await expect(page.getByTestId("auto-results")).toBeVisible();
      const web = page.locator('[data-testid="auto-repo"][data-repo="acme/web-app"]');
      await web.getByTestId("group-changed").getByRole("button").first().click();
      await shoot(page, `auto-results-${width}`);
    });

    test("applying", async ({ page }) => {
      await mockSetup(page, { run: { ...readyRun(), state: "applying" }, holdApply: true });
      await page.goto("/setup/run?id=run_03");
      await expect(page.getByTestId("apply-step")).toBeVisible();
      await shoot(page, `applying-${width}`);
    });
  });
}
