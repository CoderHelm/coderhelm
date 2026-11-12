import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { formatTwoLog, RUN_ID } from "./agent-log-data";
import { logRun, mockRunApi } from "./agent-log-mock";

// The run page's Agent log tab: its own tab between Activity and Details,
// deep-linkable, loaded only when opened, and the old links into the log
// (Details with a step or a filter) land on it. Also the Overview's row of
// numbers under the progress card, in every run state.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const runUrl = (q = "") => `/runs/detail/?id=${RUN_ID}${q}`;
const tabRow = (page: Page) => page.getByRole("navigation", { name: "Run views" });

async function noSidewaysScroll(page: Page, name: string, shotName?: string) {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
    if (shotName) {
      fs.mkdirSync(SHOTS_DIR, { recursive: true });
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      await page.screenshot({ path: path.join(SHOTS_DIR, `${shotName}-${width}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

test("the tabs read Overview, Changes, Activity, Agent log, Details; a click opens the log and Back returns", async ({ page }) => {
  const db = await mockRunApi(page, { log: formatTwoLog() });
  await page.goto(runUrl("&tab=details"));
  await expect(page.getByTestId("run-tab-details")).toBeVisible();
  await expect(tabRow(page).getByRole("link")).toHaveText(["Overview", "Changes", "Activity", "Agent log", "Details"]);
  // Details keeps Tokens and Run; the log is no longer folded in there.
  await expect(page.getByRole("heading", { name: "Tokens" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Run" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Agent log" })).toHaveCount(0);
  await expect(page.getByTestId("agent-log-panel")).toHaveCount(0);

  await tabRow(page).getByRole("link", { name: "Agent log" }).click();
  await expect(page).toHaveURL(/[?&]tab=log(&|$)/);
  await expect(tabRow(page).getByRole("link", { name: "Agent log" })).toHaveAttribute("aria-current", "page");
  // Open at once: no disclosure to press first, and the last part is open.
  const panel = page.getByTestId("agent-log-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("log-pass")).toHaveCount(5);
  expect(db.logCalls).toBe(1);
  // The log fills the tab's width.
  const box = await page.getByTestId("run-tab-log").boundingBox();
  const nav = await tabRow(page).boundingBox();
  expect(Math.abs(box!.width - nav!.width)).toBeLessThanOrEqual(1);

  await page.goBack();
  await expect(page).toHaveURL(/[?&]tab=details(&|$)/);
  await expect(page.getByTestId("run-tab-details")).toBeVisible();
  await page.goForward();
  await expect(page.getByTestId("agent-log-panel")).toBeVisible();
});

test("a deep link to ?tab=log opens the log, and survives a reload", async ({ page }) => {
  await mockRunApi(page, { log: formatTwoLog() });
  await page.goto(runUrl("&tab=log"));
  await expect(tabRow(page).getByRole("link", { name: "Agent log" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("agent-log-panel")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("agent-log-panel")).toBeVisible();
  await noSidewaysScroll(page, "agent log tab", "run-log-tab");
});

test("the log is not fetched until its tab opens", async ({ page }) => {
  const db = await mockRunApi(page, { log: formatTwoLog() });
  for (const t of ["changes", "activity", "details"]) {
    await page.goto(runUrl(`&tab=${t}`));
    await expect(tabRow(page).getByRole("link", { name: t[0].toUpperCase() + t.slice(1) })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId(`run-tab-${t}`)).toBeAttached();
    await page.waitForTimeout(500);
    expect(db.logCalls, `the ${t} tab fetched the log`).toBe(0);
  }
  // The Overview reads it only for the build's digest; a run with no build yet doesn't.
  db.run = logRun({ pass_history: [{ pass: "triage", started_at: new Date().toISOString() }] });
  await page.goto(runUrl());
  await expect(page.getByTestId("run-tab-overview")).toBeVisible();
  await page.waitForTimeout(500);
  expect(db.logCalls).toBe(0);
  await tabRow(page).getByRole("link", { name: "Agent log" }).click();
  await expect(page.getByTestId("agent-log-panel")).toBeVisible();
  expect(db.logCalls).toBe(1);
  // Moving between tabs doesn't fetch it again.
  await tabRow(page).getByRole("link", { name: "Details" }).click();
  await tabRow(page).getByRole("link", { name: "Agent log" }).click();
  await expect(page.getByTestId("agent-log-panel")).toBeVisible();
  expect(db.logCalls).toBe(1);
});

test("an empty log and a failed load show on the tab", async ({ page }) => {
  const db = await mockRunApi(page, { log: { passes: [], live_events: [] } });
  await page.goto(runUrl("&tab=log"));
  await expect(page.getByTestId("run-tab-log")).toContainText("No agent log yet. It starts once Coderhelm runs its first tool.");
  await noSidewaysScroll(page, "empty log", "run-log-tab-empty");

  db.logFail = true;
  await page.reload();
  await expect(page.getByTestId("run-tab-log").getByText("Couldn't load the agent log.")).toBeVisible();
  await noSidewaysScroll(page, "failed log", "run-log-tab-error");
  db.logFail = false;
  db.log = formatTwoLog();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("agent-log-panel")).toBeVisible();
});

test("old links into the log on Details land on the Agent log tab", async ({ page }) => {
  await mockRunApi(page, { log: formatTwoLog() });
  await page.goto(runUrl("&tab=details&log_view=structured&step=toolu_build_003"));
  await expect(page).toHaveURL(/[?&]tab=log(&|$)/);
  await expect(page).toHaveURL(/step=toolu_build_003/);
  await expect(tabRow(page).getByRole("link", { name: "Agent log" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#step-toolu_build_003")).toBeVisible();
  await expect(page.getByRole("button", { name: "Structured" })).toHaveAttribute("aria-pressed", "true");
  // A filter link with no tab at all lands there too.
  await page.goto(runUrl("&log_filter=problems"));
  await expect(page).toHaveURL(/[?&]tab=log(&|$)/);
  await expect(page.getByTestId("agent-log-panel").getByTestId("log-filter-count")).toBeVisible();
  // Plain Details stays on Details.
  await page.goto(runUrl("&tab=details"));
  await expect(page.getByTestId("run-tab-details")).toBeVisible();
  await expect(page).toHaveURL(/[?&]tab=details(&|$)/);
});

test("the Overview's 'Open the agent log' goes to the tab, at the build's step", async ({ page }) => {
  await mockRunApi(page, { log: formatTwoLog() });
  await page.goto(runUrl());
  await page.getByTestId("build-digest").getByRole("link", { name: "Open the agent log" }).click();
  await expect(page).toHaveURL(/tab=log&step=toolu_build_/);
  await expect(tabRow(page).getByRole("link", { name: "Agent log" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("agent-log-panel")).toBeVisible();
});

test("on a phone the tabs are a select that opens the log", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockRunApi(page, { log: formatTwoLog() });
  await page.goto(runUrl());
  const select = page.getByRole("combobox", { name: "Run views" });
  await select.click();
  await page.getByRole("option", { name: "Agent log" }).click();
  await expect(page).toHaveURL(/[?&]tab=log(&|$)/);
  await expect(page.getByTestId("agent-log-panel")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

// ── The Overview's numbers under the progress card ───────────────────

const STATES: [string, Record<string, unknown>][] = [
  ["done", {}],
  // No files and no pull request yet: the numbers sit right under the progress card.
  ["running", { status: "running", current_pass: "implement", duration_s: null, files_modified: [], pr_url: null, pr_number: null }],
  ["waiting-no-pr", { status: "needs_input", files_modified: [], pr_url: null, pr_number: null }],
  ["failed", { status: "failed", error: "The checks failed three times." }],
  ["waiting", { status: "needs_input" }],
  ["checks", { status: "awaiting_ci", current_pass: "ci_fix" }],
];

for (const [name, over] of STATES) {
  test(`the numbers under the progress keep the page's gap and line up with the cards' text (${name})`, async ({ page }) => {
    const db = await mockRunApi(page, { log: formatTwoLog() });
    db.run = logRun(over);
    await page.goto(runUrl());
    const stats = page.getByTestId("run-stats");
    await expect(stats).toBeVisible();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(200);
      const m = await page.evaluate(() => {
        const s = document.querySelector('[data-testid="run-stats"]')!;
        const sb = s.getBoundingClientRect();
        // The nearest card above it in the same column.
        const above = Array.from(document.querySelectorAll('[data-testid="run-timeline"], [data-testid="run-files"]'))
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.bottom <= sb.top + 1 && r.left < sb.right && r.right > sb.left)
          .sort((a, b) => b.bottom - a.bottom)[0];
        // Where text starts inside the progress card: its header's left edge plus its padding.
        const header = document.querySelector('[data-testid="run-timeline"] > div')!;
        const cardTextLeft = header.getBoundingClientRect().left + parseFloat(getComputedStyle(header).paddingLeft);
        const firstLabel = s.querySelector("dt")!.getBoundingClientRect();
        const time = getComputedStyle(document.querySelector('[data-testid="stat-time"] dd')!).fontFamily;
        const usage = getComputedStyle(document.querySelector('[data-testid="stat-usage"] dd')!).fontFamily;
        // The page's gap-6 between cards: 1.5rem.
        const gap6 = 1.5 * parseFloat(getComputedStyle(document.documentElement).fontSize);
        return { gap6, gap: above ? sb.top - above.bottom : -1, labelLeft: firstLabel.left, cardTextLeft, time, usage };
      });
      // The same gap-6 as between the page's other cards.
      expect(Math.abs(m.gap - m.gap6), `gap at ${width}px: ${m.gap} against ${m.gap6}`).toBeLessThanOrEqual(1);
      expect(Math.abs(m.labelLeft - m.cardTextLeft), `left edge at ${width}px`).toBeLessThanOrEqual(2);
      expect(m.time).toBe(m.usage);
    }
    await expect(stats.getByRole("link", { name: "See the breakdown" })).toHaveAttribute("href", /tab=details/);
    await noSidewaysScroll(page, `overview ${name}`, `run-overview-stats-${name}`);
  });
}

test("'See the breakdown' opens Details at the token tiles", async ({ page }) => {
  await mockRunApi(page, { log: formatTwoLog() });
  await page.goto(runUrl());
  await page.getByTestId("run-stats").getByRole("link", { name: "See the breakdown" }).click();
  await expect(page).toHaveURL(/[?&]tab=details(&|$)/);
  await expect(page.getByRole("heading", { name: "Tokens" })).toBeVisible();
});
