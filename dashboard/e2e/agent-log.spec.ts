import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { buildLog, decodeResult, filterPass, parseInputSummary, splitIntent, type LogStep } from "../src/lib/agent-log";
import { runTimeline } from "../src/lib/run-timeline";
import { formatOneLog, formatTwoLog, liveTail, RUN_ID } from "./agent-log-data";
import { LOG_TRACES, logRun, mockRunApi } from "./agent-log-mock";

// The run page's agent log: the pure model (lib/agent-log.ts) on old and new
// logs, then the panel and the Overview digest in the browser.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");

const allSteps = (m: ReturnType<typeof buildLog>) => m.passes.flatMap((p) => p.steps);
const step = (m: ReturnType<typeof buildLog>, id: string) => allSteps(m).find((s) => s.id === id) as LogStep;

test.describe("buildLog", () => {
  test("a new log: passes in run order with plain labels, rounds, time, cost and tokens", () => {
    const m = buildLog(formatTwoLog(), LOG_TRACES as never);
    expect(m.passes.map((p) => p.label)).toEqual(["Plan (planner)", "Plan (reviewer)", "Build", "CI fix, round 1", "CI fix, round 2"]);
    const build = m.passes[2];
    expect(build.steps.length).toBeGreaterThan(100);
    expect(build.durationMs).toBeGreaterThan(0);
    expect(build.tokens.total).toBeGreaterThan(0);
    // One trace per CI fix round: each round gets its own cost. The plan's two agents share one trace: no cost.
    expect(m.passes[3].costUsd).toBe(0.31);
    expect(m.passes[4].costUsd).toBe(0.18);
    expect(build.costUsd).toBe(1.92);
    expect(m.passes[0].costUsd).toBeUndefined();
  });

  test("every call is paired with its result by id, decoded once, with the tool's own outcome", () => {
    const m = buildLog(formatTwoLog());
    const read = step(m, "toolu_build_002");
    expect(read.verb).toBe("Read");
    expect(read.target).toBe("src/components/more-menu/index.tsx");
    expect(read.summary).toBe("180 lines");
    expect(read.result?.startsWith("// src/components/more-menu/index.tsx\n")).toBe(true);
    expect(read.durationMs).toBe(300);
    const edit = allSteps(m).find((s) => s.tool === "edit_file" && s.status === "ok")!;
    expect(edit.summary).toBe("2 changes, +4 −1");
    expect(edit.diff).toEqual({ add: 4, del: 1 });
    const created = allSteps(m).find((s) => s.tool === "write_file")!;
    expect(`${created.verb} ${created.target} · ${created.summary}`).toBe("Created src/components/more-menu/flag.ts · 22 lines");
  });

  test("soft fails, refusals and errors are problems, never folded, and a retry is the 2nd try", () => {
    const m = buildLog(formatTwoLog());
    const build = m.passes[2];
    const problems = build.problems.map((id) => step(m, id));
    expect(problems.map((s) => [s.tool, s.status])).toEqual([
      ["check_url", "refused"],
      ["edit_file", "soft_fail"],
      ["run_checks", "soft_fail"],
    ]);
    expect(problems[2].summary).toBe("failed: tests");
    for (const s of build.sections) {
      for (const it of s.items) if (it.kind === "group") expect(it.steps.some((x) => x.status !== "ok")).toBe(false);
    }
    const retry = allSteps(m).find((s) => s.tool === "edit_file" && s.files[0] === "src/components/venue-subnav.ts" && s.status === "ok")!;
    expect(retry.attempt).toBe(2);
    expect(retry.retryOf).toBe(problems[1].id);
    const checks = build.steps.filter((s) => s.tool === "run_checks");
    expect(checks[1].attempt).toBe(2);
    expect(m.passes[3].problems).toHaveLength(1);
    expect(step(m, m.passes[3].problems[0]).status).toBe("error");
  });

  test("the agent's words head its work; repeated reads fold into a counted line that names the files", () => {
    const m = buildLog(formatTwoLog());
    const build = m.passes[2];
    expect(build.sections.map((s) => s.heading).filter(Boolean)).toEqual([
      "Finding where the More menu is defined",
      "Checking the CMS query the menu uses",
      "Moving the menu items behind the feature flag",
      "Running the checks",
    ]);
    expect(build.sections[0].prose).toContain("locating the MoreMenu component");
    expect(build.sections[0].thinking[0]).toContain("flag helper lives in lib/flags");
    const group = build.sections[0].items.find((i) => i.kind === "group");
    expect(group && group.kind === "group" && group.title).toBe("Read 3 files and searched once");
    expect(group && group.kind === "group" && group.names).toBe("export function MoreMenu, index.tsx, venue-subnav.ts and 1 more");
    // The second model call is marked, and says why.
    expect(build.sections.find((s) => s.divider)?.divider).toBe("Fixing the failing checks");
    // The worker's notes show as notes, in plain words.
    const notes = build.sections.flatMap((s) => s.items).filter((i) => i.kind === "note");
    expect(notes.map((n) => n.kind === "note" && n.text)).toEqual(["Coderhelm told the agent it had used 30 of its 40 steps", "Time was nearly up: Coderhelm asked the agent to wrap up"]);
    expect(build.final?.text).toContain("Moved the More menu items behind `menuV2`");
    expect(m.passes[3].final?.cutOff).toBe(true);
  });

  test("filters and search narrow to matching steps and keep the headings", () => {
    const m = buildLog(formatTwoLog());
    const build = m.passes[2];
    const changes = filterPass(build, "changes", "", "");
    expect(changes.sections.flatMap((s) => s.items).every((i) => i.kind === "step" && i.step.category === "change")).toBe(true);
    expect(changes.sections.some((s) => s.heading === "Moving the menu items behind the feature flag")).toBe(true);
    const byFile = filterPass(build, "all", "src/components/venue-subnav.ts", "");
    expect(byFile.sections.flatMap((s) => s.items).length).toBe(4);
    const found = filterPass(build, "all", "", "menuitem3");
    expect(found.sections.flatMap((s) => s.items).length).toBeGreaterThan(0);
    expect(m.counts.problems).toBe(4);
  });

  test("an old log (format 1): results decoded, outcomes read from the text, the second call found, times from events", () => {
    const m = buildLog(formatOneLog());
    expect(m.passes).toHaveLength(1);
    const p = m.passes[0];
    expect(p.format).toBe(1);
    expect(p.label).toBe("Build");
    expect(p.steps.map((s) => s.status)).toEqual(["ok", "ok", "ok", "soft_fail", "ok", "soft_fail", "ok", "ok"]);
    expect(p.steps[0].summary).toBe("2 files");
    expect(p.steps[1].result).toBe("export function times() {\n  return [];\n}\n");
    expect(p.steps[4].attempt).toBe(2);
    expect(p.steps[4].summary).toBe("1 change, +1 −1");
    expect(p.steps[5].summary).toBe("failed: tests");
    expect(p.steps[7].summary).toBe("passed");
    // Counts per tool agree with the events, so each step takes its event's time.
    expect(p.steps[5].durationMs).toBe(64_000);
    expect(p.sections.find((s) => s.divider)?.divider).toBe("Fixing the failing checks");
    expect(p.sections[0].heading).toBeNull();
    expect(p.sections[0].prose).toBe("Let me find the schedule table first.");
    expect(m.digest.checks).toBe("Checks passed on the 2nd run");
    expect(m.digest.changed).toBe("Changed 2 files (+2 −1)");
  });

  test("live steps not yet in a stored log show as the part still running", () => {
    const log = formatTwoLog();
    const m = buildLog({ ...log, live_events: [...log.live_events, ...liveTail()] });
    const live = m.passes[m.passes.length - 1];
    expect(live.live).toBe(true);
    expect(live.label).toBe("Checks, working now");
    expect(live.steps.map((s) => `${s.verb} ${s.target}`)).toEqual(["Read src/lib/flags.ts", "Ran the checks"]);
    expect(live.problems).toHaveLength(1);
    // Old events with no logs at all: each event is a step.
    const old = buildLog({ passes: [], live_events: formatOneLog().live_events });
    expect(old.passes[0].steps[0].target).toBe('"ScheduleTable"');
  });

  test("small readers", () => {
    expect(decodeResult({ type: "tool_result", content: '"a\\nb"', content_encoding: "json" }).text).toBe("a\nb");
    expect(decodeResult({ type: "tool_result", content: "plain error", content_encoding: "text" }).text).toBe("plain error");
    expect(parseInputSummary('{"query":"x"}')).toEqual({ query: "x" });
    expect(parseInputSummary("path: a/b.ts, start_line: 3")).toEqual({ path: "a/b.ts", start_line: "3" });
    expect(splitIntent("**Doing it**\nbecause")).toEqual({ heading: "Doing it", prose: "because" });
    expect(splitIntent("Let me check the flags")).toEqual({ heading: "Check the flags", prose: "" });
    expect(splitIntent("This is a sentence.").heading).toBeNull();
  });

  test("the Overview drops the per-tool notes and keeps the rest", () => {
    const steps = runTimeline({ status: "completed", pass_history: logRun().pass_history, progress_notes: logRun().progress_notes, hasPr: true });
    const notes = steps.flatMap((s) => s.notes.map((n) => n.message));
    expect(notes).toEqual(["Plan check: 3 of 3 tasks done"]);
  });
});

// ── In the browser ───────────────────────────────────────────────────

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/favicon|net::ERR_ABORTED|net::ERR_FAILED|Failed to load resource/.test(text)) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

async function shot(page: Page, name: string, widths = [1280, 390]) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  // Paint every section for the full-page picture (a reader's scroll paints them as they come into view).
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}[data-lazy]{content-visibility:visible!important}" });
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

const openLog = async (page: Page, query = "") => {
  await page.goto(`/runs/detail/?id=${RUN_ID}&tab=log${query}`);
  await expect(page.getByTestId("agent-log-panel")).toBeVisible();
};

test("the new log reads as sentences under the agent's words, with problems first and nothing in raw JSON", async ({ page }) => {
  const errors = watchConsole(page);
  await mockRunApi(page, { log: formatTwoLog() });
  await openLog(page);
  const passes = page.getByTestId("log-pass");
  await expect(passes.locator("h3")).toHaveText([/^Plan \(planner\)/, /^Plan \(reviewer\)/, /^Build/, /^CI fix, round 1/, /^CI fix, round 2/]);
  // Time and cost sit on the header, never on the rows.
  await expect(passes.nth(2).getByTestId("log-pass-meta")).toContainText("$1.92");
  await expect(passes.nth(2).getByTestId("log-pass-meta")).toContainText("tokens");
  await expect(page.getByTestId("log-step").filter({ hasText: "tokens" })).toHaveCount(0);
  // The last part opens by itself; Build opens on a click and lists its problems first.
  await passes.nth(2).getByRole("button", { name: /^Build/ }).click();
  const build = passes.nth(2);
  await expect(build.getByTestId("log-problems")).toContainText("3 things didn't work");
  await expect(build.getByRole("heading", { name: "Finding where the More menu is defined" })).toBeVisible();
  await expect(build.getByRole("button", { name: /Read 3 files and searched once · export function MoreMenu, index\.tsx, venue-subnav\.ts and 1 more/ })).toHaveAttribute("aria-expanded", "false");
  // A problem is open by default with its reason.
  const failedEdit = build.locator('[data-testid="log-step"][data-status="soft_fail"][data-tool="edit_file"]');
  await expect(failedEdit).toContainText("Didn't apply: Edited");
  await expect(failedEdit.getByTestId("log-step-detail")).toContainText("the text to replace wasn't found");
  await expect(build.getByText("2nd try").first()).toBeVisible();
  await expect(build.getByRole("button", { name: /^Not allowed: Checked internal\.example\.net\/admin\/menu/ })).toBeVisible();
  await expect(build.getByTestId("log-note").first()).toContainText("used 30 of its 40 steps");
  await expect(build.getByRole("separator", { name: "Fixing the failing checks" })).toBeVisible();
  // No raw JSON or escaped newlines in the plain view.
  await expect(page.getByTestId("agent-log-panel")).not.toContainText('{"');
  await expect(page.getByTestId("agent-log-panel")).not.toContainText("\\n");
  expect(errors).toEqual([]);
  await shot(page, "agent-log-new");
});

test("filters, search and the view are kept in the URL; a step link opens that step", async ({ page }) => {
  await mockRunApi(page, { log: formatTwoLog() });
  await openLog(page);
  const panel = page.getByTestId("agent-log-panel");
  await panel.getByRole("button", { name: /^Problems/ }).click();
  await expect(page).toHaveURL(/log_filter=problems/);
  await expect(panel.getByTestId("log-filter-count")).toContainText("4 of 115 steps");
  await expect(panel.getByTestId("log-step")).toHaveCount(4);
  await panel.getByRole("button", { name: /^Changes/ }).click();
  await expect(panel.getByTestId("log-step").first()).toContainText("Edited");
  await panel.getByRole("button", { name: "Clear" }).click();
  // Search reaches folded steps; Enter steps through the matches.
  await panel.getByRole("searchbox", { name: "Search the agent log" }).fill("menu-query.ts");
  await expect(page).toHaveURL(/log_q=menu-query\.ts/);
  await expect(panel.getByTestId("log-search-count")).toHaveText(/^1 of \d+$/);
  await page.getByRole("button", { name: "Next match" }).click();
  await expect(panel.getByTestId("log-search-count")).toHaveText(/^2 of /);
  await panel.getByRole("searchbox").fill("");
  await expect(page).not.toHaveURL(/log_q=/);
  // Structured and raw views.
  await panel.getByRole("button", { name: "Structured" }).click();
  await expect(page).toHaveURL(/log_view=structured/);
  await page.reload();
  await expect(page.getByTestId("agent-log-panel")).toBeVisible();
  await expect(page.getByRole("button", { name: "Structured" })).toHaveAttribute("aria-pressed", "true");
  // A link to one step opens its part, its group and the step, and scrolls to it.
  await page.goto(`/runs/detail/?id=${RUN_ID}&tab=log&log_view=structured&step=toolu_build_003`);
  const linked = page.locator("#step-toolu_build_003");
  await expect(linked).toBeVisible();
  await expect(linked.getByTestId("log-step-detail")).toBeVisible();
  await expect(linked.getByTestId("log-step-detail")).toContainText("read_file_lines");
  await expect(linked).toBeInViewport();
  // Edits link to the pull request's files.
  await page.getByRole("button", { name: "Plain" }).click();
  const edit = page.locator('[data-testid="log-step"][data-tool="edit_file"][data-status="ok"]').first();
  await edit.getByRole("button").first().click();
  await expect(edit.getByRole("link", { name: /View in diff/ })).toHaveAttribute("href", "https://github.com/your-team/web/pull/212/files");
  // The timeline shows a bar per timed step.
  await page.getByRole("button", { name: "Timeline" }).click();
  await expect(page).toHaveURL(/log_time=1/);
  await shot(page, "agent-log-timeline", [1280]);
});

test("the old log (format 1) still reads, with its problems and times", async ({ page }) => {
  const errors = watchConsole(page);
  await mockRunApi(page, { log: formatOneLog(), traces: [] });
  await openLog(page);
  const pass = page.getByTestId("log-pass");
  await expect(pass).toHaveCount(1);
  await expect(pass.getByRole("heading", { name: /Build/ })).toBeVisible();
  await expect(pass.getByText("Let me find the schedule table first.")).toBeVisible();
  await expect(pass.getByTestId("log-problems")).toContainText("2 things didn't work");
  await expect(pass.locator('[data-tool="run_checks"]').first()).toContainText("1m 4s");
  await expect(pass.locator('[data-tool="run_checks"]').last()).toContainText(/Ran the checks.*· passed/);
  expect(errors).toEqual([]);
  await shot(page, "agent-log-old");
});

test("on a phone a step opens in a sheet, and the page never scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockRunApi(page, { log: formatTwoLog() });
  await openLog(page);
  await page.getByRole("button", { name: /^Build/ }).click();
  const step = page.locator('[data-testid="log-step"][data-tool="run_checks"]').last();
  await step.getByRole("button").first().click();
  const sheet = page.getByTestId("log-step-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Ran the checks");
  await expect(sheet.getByRole("list", { name: "Checks" })).toContainText("Tests");
  await page.waitForTimeout(250);
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS_DIR, "agent-log-sheet-390.png") });
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(step.getByRole("button").first()).toBeFocused();
});

test("a failed load can be retried", async ({ page }) => {
  const db = await mockRunApi(page, { log: formatTwoLog(), logFail: true });
  await page.goto(`/runs/detail/?id=${RUN_ID}&tab=log`);
  await expect(page.getByText("Couldn't load the agent log.")).toBeVisible();
  db.logFail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("agent-log-panel")).toBeVisible();
});

test("the Overview shows the build in three lines instead of a note per tool", async ({ page }) => {
  const errors = watchConsole(page);
  await mockRunApi(page, { log: formatTwoLog() });
  await page.goto(`/runs/detail/?id=${RUN_ID}`);
  const digest = page.getByTestId("build-digest");
  await expect(digest).toContainText("Moving the menu items behind the feature flag · Running the checks");
  await expect(digest).toContainText("Changed 3 files (+28 −3)");
  await expect(digest).toContainText("Checks passed on the 2nd run");
  await expect(page.getByTestId("run-timeline")).not.toContainText("Tool: ");
  await expect(page.getByTestId("run-step").filter({ hasText: "Built the change" })).toContainText("1 note");
  await shot(page, "agent-log-overview");
  await digest.getByRole("link", { name: "Open the agent log" }).click();
  await expect(page).toHaveURL(/tab=log.*step=toolu_build_/);
  await expect(page.getByTestId("agent-log-panel")).toBeVisible();
  expect(errors).toEqual([]);
});
