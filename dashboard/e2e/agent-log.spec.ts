import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { buildLog, decodeResult, filterPass, parseInputSummary, splitIntent, type LogStep } from "../src/lib/agent-log";
import { runTimeline } from "../src/lib/run-timeline";
import { at, formatOneLog, formatTwoLog, liveTail, LONG_COMMAND, refusedShellTail, RUN_ID } from "./agent-log-data";
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
    // A problem a later step fixed (the edit applied on its 2nd try, the checks passed on their 2nd run) leaves the count.
    const problems = build.problems.map((id) => step(m, id));
    expect(problems.map((s) => [s.tool, s.status])).toEqual([["check_url", "refused"]]);
    const recovered = build.recovered.map((id) => step(m, id));
    expect(recovered.map((s) => [s.tool, s.status])).toEqual([
      ["edit_file", "soft_fail"],
      ["run_checks", "soft_fail"],
    ]);
    expect(recovered[1].summary).toBe("failed: tests");
    expect(recovered.every((s) => !!s.recoveredBy)).toBe(true);
    for (const s of build.sections) {
      for (const it of s.items) if (it.kind === "group") expect(it.steps.some((x) => x.status !== "ok")).toBe(false);
    }
    const retry = allSteps(m).find((s) => s.tool === "edit_file" && s.files[0] === "src/components/venue-subnav.ts" && s.status === "ok")!;
    expect(retry.attempt).toBe(2);
    expect(retry.retryOf).toBe(recovered[0].id);
    expect(recovered[0].recoveredBy).toBe(retry.id);
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
    // Only the problems nothing after them fixed.
    expect(m.counts.problems).toBe(2);
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

  test("a refused shell command always names its command, and a live refusal carries its reason", () => {
    const log = formatTwoLog();
    const m = buildLog({ ...log, live_events: [...log.live_events, ...refusedShellTail()] });
    const [long, empty, post] = ["toolu_live_sh1", "toolu_live_sh2", "toolu_live_sh3"].map((id) => step(m, id));
    // However long the command, the step names it.
    expect(`${long.verb} ${long.target}`).toBe(`Ran ${LONG_COMMAND}`);
    expect(long.status).toBe("refused");
    // The reason is there while the step runs, not only once it is saved.
    expect(long.result).toBe("Background commands don't run here: send each command on its own call.");
    // A call with no command says so.
    expect(empty.target).toBe("a shell command (none was sent)");
    // An event without a message still says why, from its outcome.
    expect(post.target).toBe("curl -X POST https://www.example.com/api");
    expect(post.summary).toContain("sends a POST request");
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
  // Only what nothing fixed counts, in a neutral note (the run didn't fail because of it).
  await expect(build.getByTestId("log-problems")).toContainText("1 thing didn't work · 2 more worked on a later try");
  await expect(build.getByTestId("log-problems")).toHaveAttribute("data-tone", "neutral");
  await expect(build.getByRole("heading", { name: "Finding where the More menu is defined" })).toBeVisible();
  await expect(build.getByRole("button", { name: /Read 3 files and searched once · export function MoreMenu, index\.tsx, venue-subnav\.ts and 1 more/ })).toHaveAttribute("aria-expanded", "false");
  // A problem is open by default with its reason.
  const failedEdit = build.locator('[data-testid="log-step"][data-status="soft_fail"][data-tool="edit_file"]');
  await expect(failedEdit).toContainText("Didn't apply: Edited");
  // It worked on its 2nd try: closed by default, its reason a click away.
  await expect(failedEdit.getByTestId("log-step-detail")).toHaveCount(0);
  await failedEdit.getByRole("button").first().click();
  await expect(failedEdit.getByTestId("log-step-detail")).toContainText("the text to replace wasn't found");
  await expect(build.getByText("2nd try").first()).toBeVisible();
  await expect(build.getByRole("button", { name: /^Not allowed: Checked internal\.example\.net\/admin\/menu/ })).toBeVisible();
  // A step reminder far from the limit is left out of the plain view.
  await expect(build.getByTestId("log-note").filter({ hasText: "used 30 of its 40 steps" })).toHaveCount(0);
  await expect(build.locator('[data-testid="log-step"][data-tool="edit_file"][data-status="soft_fail"]').getByTestId("log-step-recovered").first()).toBeVisible();
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
  await expect(panel.getByTestId("log-filter-count")).toContainText("2 of 115 steps");
  await expect(panel.getByTestId("log-step")).toHaveCount(2);
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

test("a refused command shows its command and its reason while the step runs", async ({ page }) => {
  const errors = watchConsole(page);
  const log = formatTwoLog();
  await mockRunApi(page, { log: { ...log, live_events: [...log.live_events, ...refusedShellTail()] } });
  await openLog(page);
  const refused = page.locator('[data-testid="log-step"][data-status="refused"][data-tool="bash"]').first();
  await expect(refused).toContainText("Not allowed: Ran cd e2e && pnpm install");
  const detail = refused.getByTestId("log-step-detail");
  if (!(await detail.count())) await refused.getByRole("button").first().click();
  await expect(refused.getByTestId("log-step-command")).toHaveText(LONG_COMMAND);
  await expect(refused.getByTestId("log-step-detail")).toContainText("Background commands don't run here: send each command on its own call.");
  await expect(page.getByTestId("agent-log-panel")).not.toContainText("The full message is shown once");
  expect(errors).toEqual([]);
  await shot(page, "agent-log-refused-command");
});

test("the old log (format 1) still reads, with its problems and times", async ({ page }) => {
  const errors = watchConsole(page);
  await mockRunApi(page, { log: formatOneLog(), traces: [] });
  await openLog(page);
  const pass = page.getByTestId("log-pass");
  await expect(pass).toHaveCount(1);
  await expect(pass.getByRole("heading", { name: /Build/ })).toBeVisible();
  await expect(pass.getByText("Let me find the schedule table first.")).toBeVisible();
  // Both of its problems worked on a later try: no banner, each row says so.
  await expect(pass.getByTestId("log-problems")).toHaveCount(0);
  await expect(pass.getByTestId("log-step-recovered")).toHaveCount(2);
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

// ── A fix round: retried edits, aliases, refusals, budget notes ──────

/** One fix round as the worker logs it: a shell call that ran as a read, an edit that applied on its 2nd try, two looks at an unchanged change, an edit refused outside the round's files, and two step reminders. */
function fixRoundLog() {
  const t = (s: number) => at(s);
  const res = (id: string, tool: string, content: string, status: "ok" | "soft_fail" | "refused", summary: string, extra: Record<string, unknown> = {}) => ({
    type: "tool_result",
    tool_use_id: id,
    tool,
    content: JSON.stringify(content),
    content_encoding: "json",
    started_at: t(10),
    duration_ms: 200,
    outcome: { status, summary },
    ...(status === "ok" ? {} : { is_error: false }),
    ...extra,
  });
  const turn = (n: number, uses: { id: string; name: string; input: Record<string, unknown> }[], results: unknown[]) => [
    { role: "assistant", call: 1, turn: n, started_at: t(n * 10), ended_at: t(n * 10 + 1), content: uses.map((u) => ({ type: "tool_use", ...u })) },
    { role: "tool_results", call: 1, turn: n, started_at: t(n * 10 + 1), ended_at: t(n * 10 + 2), content: results },
  ];
  const conversation = [
    { role: "call_started", call: 1, turn: 0, started_at: t(0), model: "model-large", max_turns: 40 },
    { role: "system_note", call: 1, turn: 5, kind: "turn_budget", text: "[SYSTEM NOTE] You have used 5 of 40 tool-use turns. 35 turns remaining.", started_at: t(5) },
    ...turn(1, [{ id: "tu_sh", name: "bash", input: { command: "cat src/cart/total.ts" } }], [res("tu_sh", "read_file", "export const total = 1;\n", "ok", "1 lines", { called_as: "bash", input: { path: "src/cart/total.ts" } })]),
    ...turn(2, [{ id: "tu_e1", name: "edit_file", input: { path: "src/cart/total.ts", edits: "[]", message: "m" } }], [res("tu_e1", "edit_file", "NO edits applied to src/cart/total.ts", "soft_fail", "no edits applied: 1 of 1 did not match")]),
    ...turn(3, [{ id: "tu_e2", name: "edit_file", input: { path: "src/cart/total.ts", edits: [{ old_text: "1", new_text: "2" }], message: "m" } }], [res("tu_e2", "edit_file", "Edited src/cart/total.ts", "ok", "1 edit(s), +1/-1 lines")]),
    ...turn(4, [{ id: "tu_d1", name: "get_diff", input: {} }], [res("tu_d1", "get_diff", "modified src/cart/total.ts", "ok", "")]),
    ...turn(5, [{ id: "tu_d2", name: "get_diff", input: {} }], [res("tu_d2", "get_diff", "modified src/cart/total.ts", "ok", "")]),
    ...turn(6, [{ id: "tu_out", name: "edit_file", input: { path: "src/theme/colors.ts", edits: [{ old_text: "a", new_text: "b" }], message: "m" } }], [
      res("tu_out", "edit_file", "NOT EDITED: src/theme/colors.ts is outside this round's files.", "soft_fail", "refused: src/theme/colors.ts is outside the round's files (edited once a reason is given)"),
    ]),
    { role: "system_note", call: 1, turn: 38, kind: "turn_budget", text: "[SYSTEM NOTE] You have used 38 of 40 tool-use turns. 2 turns remaining.", started_at: t(380) },
    { role: "assistant", call: 1, turn: 7, started_at: t(390), ended_at: t(391), content: [{ type: "text", text: "Done." }], stop_reason: "end_turn" },
  ];
  return { passes: [{ pass: "ci_fix", id: "ci_fix-1", format: 2, started_at: t(0), ended_at: t(400), conversation }], live_events: [] };
}

test.describe("a fix round's log", () => {
  test("counts only what nothing fixed, draws aliases as the tool that ran, folds repeated looks, keeps far reminders quiet", () => {
    const m = buildLog(fixRoundLog() as never);
    const p = m.passes[0];
    expect(p.problems.map((id) => step(m, id).target)).toEqual(["src/theme/colors.ts"]);
    expect(p.recovered).toEqual(["tu_e1"]);
    const sh = step(m, "tu_sh");
    expect([sh.tool, sh.calledAs, `${sh.verb} ${sh.target}`]).toEqual(["read_file", "bash", "Read src/cart/total.ts"]);
    expect(step(m, "tu_d1").repeats).toBe(1);
    expect(step(m, "tu_d2").repeatOf).toBe("tu_d1");
    const notes = p.sections.flatMap((s) => s.items).filter((i) => i.kind === "note") as { quiet?: boolean; text: string }[];
    expect(notes.map((n) => !!n.quiet)).toEqual([true, false]);
    // Older live events summed a call up as its bare path; newer ones as `path: ...`.
    expect(parseInputSummary("src/cart/total.ts")).toEqual({ path: "src/cart/total.ts" });
    expect(parseInputSummary("path: src/cart/total.ts")).toEqual({ path: "src/cart/total.ts" });
    expect(parseInputSummary("query: scrollWidth <= window.innerWidth")).toEqual({ query: "scrollWidth <= window.innerWidth" });
  });

  test("in the browser: a neutral banner of one, the refusal names its file, reminders only near the limit", async ({ page }) => {
    const errors = watchConsole(page);
    await mockRunApi(page, { log: fixRoundLog(), traces: [] });
    await openLog(page);
    const pass = page.getByTestId("log-pass");
    const banner = pass.getByTestId("log-problems");
    await expect(banner).toContainText("1 thing didn't work · 1 more worked on a later try");
    await expect(banner).toHaveAttribute("data-tone", "neutral");
    await expect(banner).toContainText("src/theme/colors.ts is outside the round's files");
    await expect(pass.getByTestId("log-step-repeats")).toContainText("2 times");
    await expect(pass.locator('[data-testid="log-step"][data-tool="get_diff"]')).toHaveCount(1);
    await expect(pass.getByTestId("log-note")).toHaveCount(1);
    await expect(pass.getByTestId("log-note")).toContainText("used 38 of its 40 steps");
    await page.getByRole("button", { name: "Structured" }).click();
    await expect(pass.getByTestId("log-note")).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test("a failed run draws its problems as a warning", async ({ page }) => {
    await mockRunApi(page, { log: fixRoundLog(), traces: [], run: logRun({ status: "failed" }) });
    await openLog(page);
    await expect(page.getByTestId("log-problems")).toHaveAttribute("data-tone", "warning");
  });
});
