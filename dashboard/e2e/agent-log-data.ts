import type { AgentLog, AgentLogLiveEvent } from "../src/lib/api";

// Agent logs as `GET /api/runs/:id/agent-log` returns them, for the agent log
// specs: an old log (format 1: bare entries, JSON-encoded results, no times)
// and a new one (format 2: every pass and round, timed results with
// structured outcomes, system notes, 100+ steps). Neutral names only.

export const RUN_ID = "01RUNLOG00000000000000000A";
export const REPO = "your-team/web";
export const PR_URL = "https://github.com/your-team/web/pull/212";

const BASE = Date.parse("2026-11-10T09:00:00.000Z");
/** A time `s` seconds after the run started. */
export const at = (s: number) => new Date(BASE + s * 1000).toISOString();

type Json = Record<string, unknown>;

/** Writes a format-2 log one model call at a time, with ids and times that line up. */
class LogWriter {
  entries: Json[] = [];
  private call = 0;
  private turn = 0;
  private n = 0;
  constructor(
    private prefix: string,
    public t: number,
  ) {}

  startCall(maxTurns = 40) {
    this.call += 1;
    this.turn = 0;
    this.entries.push({ role: "call_started", call: this.call, turn: 0, started_at: at(this.t), model: "model-large", max_turns: maxTurns });
  }

  note(kind: "turn_budget" | "wrap_up" | "tools_off", text: string) {
    this.entries.push({ role: "system_note", call: this.call, turn: this.turn, kind, text, started_at: at(this.t) });
  }

  /**
   * One model turn: its words, an optional thought, and its tool calls, each
   * with the result, how long it took and the outcome the tool noted.
   */
  turnWith(opts: {
    text?: string;
    thinking?: string;
    tools?: { name: string; input: Json; result: unknown; ms?: number; status?: "ok" | "soft_fail" | "refused" | "error"; summary?: string; text?: boolean }[];
    final?: string;
    stop?: string;
  }) {
    this.turn += 1;
    const content: Json[] = [];
    if (opts.thinking) content.push({ type: "thinking", thinking: opts.thinking, signature: "sig" });
    if (opts.text) content.push({ type: "text", text: opts.text });
    if (opts.final) content.push({ type: "text", text: opts.final });
    const ids: string[] = [];
    for (const tool of opts.tools ?? []) {
      this.n += 1;
      const id = `toolu_${this.prefix}_${String(this.n).padStart(3, "0")}`;
      ids.push(id);
      content.push({ type: "tool_use", id, name: tool.name, input: tool.input });
    }
    const started = this.t;
    this.t += 4;
    this.entries.push({
      role: "assistant",
      call: this.call,
      turn: this.turn,
      content,
      usage: { input_tokens: 1800, output_tokens: 420, cache_read: 52_000, cache_write: 900 },
      ...(opts.stop || opts.final ? { stop_reason: opts.stop ?? "end_turn" } : {}),
      started_at: at(started),
      ended_at: at(this.t),
    });
    if (!opts.tools?.length) return ids;
    const resultsStart = this.t;
    const results = (opts.tools ?? []).map((tool, i) => {
      const ms = tool.ms ?? 300;
      const r = {
        type: "tool_result",
        tool_use_id: ids[i],
        tool: tool.name,
        content: tool.text ? String(tool.result) : JSON.stringify(tool.result),
        content_encoding: tool.text ? "text" : "json",
        ...(tool.status === "error" || tool.status === "refused" ? { is_error: true } : {}),
        started_at: at(this.t),
        duration_ms: ms,
        outcome: { status: tool.status ?? "ok", ...(tool.summary ? { summary: tool.summary } : {}) },
      };
      this.t += Math.max(1, Math.round(ms / 1000));
      return r;
    });
    this.entries.push({ role: "tool_results", call: this.call, turn: this.turn, content: results, started_at: at(resultsStart), ended_at: at(this.t) });
    return ids;
  }
}

const FILES = [
  "src/components/more-menu/index.tsx",
  "src/components/venue-subnav.ts",
  "src/components/layout/header.tsx",
  "src/lib/flags.ts",
  "src/lib/cms/menu-query.ts",
  "src/components/more-menu/more-menu.test.tsx",
];

const fileText = (path: string, lines: number) =>
  Array.from({ length: lines }, (_, i) => (i === 0 ? `// ${path}` : i % 7 === 0 ? `export function item${i}() {\n  return null;\n}` : `const line${i} = ${i};`)).join("\n");

const read = (path: string, lines = 80) => ({ name: "read_file", input: { path }, result: fileText(path, lines), summary: `${lines} lines` });
const readLines = (path: string, start: number, end: number) => ({
  name: "read_file_lines",
  input: { path, start_line: start, end_line: end },
  result: fileText(path, end - start + 1),
  summary: `lines ${start}-${end}`,
});
const search = (query: string, files: string[]) => ({
  name: "search_code",
  input: { query },
  result: files.length ? files.map((f) => `${f}\n  12: ${query}()\n  40: return ${query};`).join("\n---\n") : "No matches.",
  summary: files.length ? `${files.length * 2} matches in ${files.length} files` : "no matches",
});

/** The new log: plan rounds, a long build with a retry and a second call, and two CI fix rounds. */
export function formatTwoLog() {
  // ── Plan: the planner, then a second plan round after the review ──
  const plan = new LogWriter("plan", 20);
  plan.startCall(20);
  plan.turnWith({
    text: "**Reading the ticket's menu code**\nThe ticket asks for the More menu items to sit behind the `menuV2` flag. I'll find the menu and how flags are read first.",
    tools: [search("MoreMenu", [FILES[0], FILES[2]]), read(FILES[0], 180), read(FILES[3], 40)],
  });
  plan.turnWith({ final: "The plan: gate the three items in `more-menu/index.tsx` on `menuV2`, default it off, and update the menu test." });
  const planEnd = plan.t;

  const planReview = new LogWriter("planrev", planEnd + 5);
  planReview.startCall(10);
  planReview.turnWith({ text: "Checking the plan against the code it names.", tools: [read(FILES[1], 60), read(FILES[5], 90)] });
  planReview.turnWith({ final: "None. The plan covers the menu, the flag and the test." });

  // ── Build: 100+ steps ──
  const build = new LogWriter("build", planReview.t + 10);
  build.startCall(40);
  build.turnWith({
    thinking: "The menu renders from a static list; the flag helper lives in lib/flags. I need both before editing.",
    text: "**Finding where the More menu is defined**\nI'll start by locating the MoreMenu component and the venue sub-nav that renders it.",
    tools: [search("export function MoreMenu", [FILES[0], FILES[2]]), read(FILES[0], 180), readLines(FILES[1], 1, 80), readLines(FILES[2], 40, 140)],
  });
  build.turnWith({
    text: "Checking the CMS query the menu uses",
    tools: [
      { name: "check_url", input: { urls: ["https://cms.example.io/v1/query?menu=main&fields=menuItems"], find: ["menuItems"] }, result: "Found \"menuItems\" on https://cms.example.io/v1/query", ms: 1800, summary: "found" },
      { name: "github_history", input: { kind: "commits", path: "src/components/more-menu" }, result: "abc1234 Move menu items\nbcd2345 Add flag helper", ms: 900 },
      // A refused call: the policy would not let the agent open this host.
      { name: "check_url", input: { urls: ["https://internal.example.net/admin/menu"] }, result: "The agent policy did not allow opening internal.example.net.", text: true, status: "refused", summary: "the agent policy did not allow it", ms: 0 },
    ],
  });
  // A long reading stretch: many reads with no words between them fold into groups.
  for (let k = 0; k < 6; k++) {
    build.turnWith({ tools: [read(`src/components/menu/part-${k + 1}.tsx`, 60 + k), readLines(FILES[4], 1 + k * 20, 20 + k * 20), search(`menuItem${k}`, k % 2 ? [] : [FILES[4]])] });
  }
  build.turnWith({
    text: "**Moving the menu items behind the feature flag**",
    tools: [
      { name: "edit_file", input: { path: FILES[0], edits: [{ old_text: "const items = [a, b, c];", new_text: "const items = flags.menuV2\n  ? [a, b, c]\n  : [];" }, { old_text: "import { a } from './a';", new_text: "import { a } from './a';\nimport { flags } from '@/lib/flags';" }] }, result: `Applied 2 edit(s) to ${FILES[0]}`, summary: "2 edit(s), +4/-1 lines", ms: 400 },
      { name: "edit_file", input: { path: FILES[1], edits: [{ old_text: "renderMore()", new_text: "renderMore(flags)" }] }, result: `NO edits applied to ${FILES[1]} — all edits in one call must succeed atomically, and 1 failed: the text to replace wasn't found. Re-read the current file content.`, status: "soft_fail", summary: "no edits applied: 1 of 1 did not match", ms: 200 },
    ],
  });
  build.turnWith({ tools: [readLines(FILES[1], 1, 120)] });
  build.turnWith({
    tools: [
      { name: "edit_file", input: { path: FILES[1], edits: [{ old_text: "renderMore(items)", new_text: "renderMore(items, flags)" }] }, result: `Applied 1 edit(s) to ${FILES[1]}`, summary: "1 edit(s), +1/-1 lines", ms: 300 },
      { name: "write_file", input: { path: "src/components/more-menu/flag.ts", content: "export const MENU_V2 = true;\n".repeat(22) }, result: "Wrote src/components/more-menu/flag.ts", summary: "created, +22 lines", ms: 500 },
    ],
  });
  // More reading so the log passes 100 steps.
  for (let k = 0; k < 18; k++) {
    build.turnWith({ tools: [read(`src/components/menu/item-${k + 1}.tsx`, 30 + k), readLines(FILES[5], 1 + k * 10, 10 + k * 10), { name: "list_directory", input: { path: "src/components/menu" }, result: "file: index.tsx\nfile: item.tsx\ndir: icons", summary: "3 entries" }, search(`useMenu${k}`, [FILES[0]])] });
  }
  build.note("turn_budget", "[SYSTEM NOTE] You have used 30 of 40 tool-use turns. Finish the change and run the checks.");
  build.turnWith({
    text: "Running the checks",
    tools: [
      {
        name: "run_checks",
        input: {},
        result: "Sandbox checks FAILED ❌ (exit 1)\n- Types: PASS `npm run typecheck`\n- Lint: PASS `npm run lint`\n- Tests: FAIL (exit 1) `npm test`\n--- real output (tail) ---\nmore-menu.test.tsx > hides items when the flag is off\n  expected 3, got 5",
        status: "soft_fail",
        summary: "2 of 3 checks passed, 1 failed",
        ms: 184_000,
      },
    ],
  });
  build.turnWith({ final: "The tests fail: the menu test still expects the old items.", stop: "end_turn" });
  // The second model call: fixing the failing checks.
  build.startCall(15);
  build.turnWith({
    text: "The test still renders the old items; the flag default is wrong.",
    tools: [
      { name: "edit_file", input: { path: "src/components/more-menu/flag.ts", edits: [{ old_text: "export const MENU_V2 = true;", new_text: "export const MENU_V2 = false;" }] }, result: "Applied 1 edit(s) to src/components/more-menu/flag.ts", summary: "1 edit(s), +1/-1 lines", ms: 300 },
      { name: "get_diff", input: {}, result: "src/components/more-menu/index.tsx (modified, +4/-1)\nsrc/components/venue-subnav.ts (modified, +1/-1)\nsrc/components/more-menu/flag.ts (added, +22/-0)", summary: "3 files changed, +27/-2", ms: 700 },
    ],
  });
  build.note("wrap_up", "[SYSTEM NOTE] Time is nearly up. Wrap up now: run the checks once and give your final answer.");
  build.turnWith({
    tools: [{ name: "run_checks", input: {}, result: "Sandbox checks PASSED ✅\n- Types: PASS `npm run typecheck`\n- Lint: PASS `npm run lint`\n- Tests: PASS `npm test`", summary: "3 of 3 checks passed", ms: 171_000 }],
  });
  build.turnWith({ final: "Moved the More menu items behind `menuV2` and updated the test.\n\nThe flag defaults off, so nothing changes until it is turned on.", stop: "end_turn" });

  // ── CI fix, two rounds ──
  const ci1 = new LogWriter("ci1", build.t + 120);
  ci1.startCall(15);
  ci1.turnWith({
    text: "**Reading the failing CI job**",
    tools: [{ name: "github_history", input: { kind: "workflow_runs" }, result: "run 991: failed (lint)", ms: 800 }, read(".github/workflows/ci.yml", 40)],
  });
  ci1.turnWith({
    tools: [{ name: "edit_file", input: { path: FILES[2], edits: [{ old_text: "let unused = 1;", new_text: "" }] }, result: "Something went wrong talking to GitHub: 502 Bad Gateway", text: true, status: "error", ms: 3000 }],
  });
  ci1.turnWith({ final: "GitHub failed while editing; the next round retries.", stop: "max_tokens" });

  const ci2 = new LogWriter("ci2", ci1.t + 200);
  ci2.startCall(15);
  ci2.turnWith({
    text: "Removing the unused variable the linter flags",
    tools: [{ name: "edit_file", input: { path: FILES[2], edits: [{ old_text: "let unused = 1;\n", new_text: "" }] }, result: `Applied 1 edit(s) to ${FILES[2]}`, summary: "1 edit(s), +0/-1 lines", ms: 300 }],
  });
  ci2.note("tools_off", "[SYSTEM NOTE] Tools are now off. Give your final answer now.");
  ci2.turnWith({ final: "Removed the unused variable; lint passes.", stop: "end_turn" });

  const pass = (id: string, name: string, w: LogWriter, round: number, step: string | null) => ({
    id,
    pass: name,
    round,
    step,
    started_at: (w.entries[0] as { started_at: string }).started_at,
    ended_at: at(w.t),
    format: 2,
    conversation: w.entries,
  });
  const passes = [
    pass("plan-1", "plan", plan, 1, "planner"),
    pass("plan-2", "plan", planReview, 2, "reviewer"),
    pass("implement-3", "implement", build, 1, "coder"),
    pass("ci_fix-4", "ci_fix", ci1, 1, "coder"),
    pass("ci_fix-5", "ci_fix", ci2, 2, "coder"),
  ];
  return { passes, live_events: liveEvents(passes), live_events_truncated: false } as unknown as AgentLog & { live_events: AgentLogLiveEvent[] };
}

/** The live events for logged steps, as the worker writes them (with ids). */
function liveEvents(passes: { pass: string; conversation: Json[] }[]) {
  const out: Json[] = [];
  for (const p of passes) {
    for (const e of p.conversation) {
      if (e.role !== "tool_results") continue;
      for (const r of e.content as Json[]) {
        out.push({
          tool: r.tool,
          input_summary: "path: src/components/more-menu/index.tsx",
          duration_ms: r.duration_ms,
          is_error: !!r.is_error,
          timestamp: r.started_at,
          pass: p.pass,
          tool_use_id: r.tool_use_id,
          started_at: r.started_at,
          outcome: r.outcome,
        });
      }
    }
  }
  return out;
}

/** A live tail: steps the worker has reported but not logged yet (the pass is still running). */
export function liveTail(): AgentLogLiveEvent[] {
  return [
    { tool: "read_file", input_summary: "path: src/lib/flags.ts", duration_ms: 120, is_error: false, timestamp: at(4000), pass: "review", tool_use_id: "toolu_live_001", started_at: at(3999), outcome: { status: "ok", summary: "40 lines" } },
    { tool: "run_checks", input_summary: "", duration_ms: 95_000, is_error: false, timestamp: at(4100), pass: "review", tool_use_id: "toolu_live_002", started_at: at(4005), outcome: { status: "soft_fail", summary: "2 of 3 checks passed, 1 failed" } },
  ];
}

/** An old log (format 1): a bare entry array per pass, JSON-encoded results, no times, turns restarting in a second call. */
export function formatOneLog() {
  const enc = (s: string) => JSON.stringify(s);
  const conversation = [
    {
      turn: 1,
      role: "assistant",
      content: [
        { type: "text", text: "Let me find the schedule table first." },
        { type: "tool_use", id: "toolu_old_1", name: "search_code", input: { query: "ScheduleTable" } },
        { type: "tool_use", id: "toolu_old_2", name: "read_file", input: { path: "src/lib/schedule.ts" } },
        { type: "tool_use", id: "toolu_old_3", name: "read_file", input: { path: "src/app/classes/page.tsx" } },
      ],
      usage: { input_tokens: 3000, output_tokens: 200, cache_read: 0, cache_write: 0 },
    },
    {
      turn: 1,
      role: "tool_results",
      content: [
        { type: "tool_result", tool_use_id: "toolu_old_1", content: enc("src/app/classes/page.tsx\n  4: import { ScheduleTable }\n---\nsrc/components/schedule-table.tsx\n  1: export function ScheduleTable") },
        { type: "tool_result", tool_use_id: "toolu_old_2", content: enc("export function times() {\n  return [];\n}\n") },
        { type: "tool_result", tool_use_id: "toolu_old_3", content: enc("export default function Page() {\n  return null;\n}\n") },
      ],
    },
    {
      turn: 2,
      role: "assistant",
      content: [
        { type: "text", text: "Adding the table." },
        { type: "tool_use", id: "toolu_old_4", name: "edit_file", input: { path: "src/lib/schedule.ts", edits: [{ old_text: "return [];", new_text: "return load();" }] } },
      ],
      usage: { input_tokens: 1200, output_tokens: 300, cache_read: 2000, cache_write: 0 },
    },
    {
      turn: 2,
      role: "tool_results",
      content: [{ type: "tool_result", tool_use_id: "toolu_old_4", content: enc("NO edits applied to src/lib/schedule.ts — all edits in one call must succeed atomically, and 1 failed: not found.") }],
    },
    {
      turn: 3,
      role: "assistant",
      content: [{ type: "tool_use", id: "toolu_old_5", name: "edit_file", input: { path: "src/lib/schedule.ts", edits: [{ old_text: "  return [];", new_text: "  return load();" }] } }],
      usage: { input_tokens: 1200, output_tokens: 300, cache_read: 2000, cache_write: 0 },
    },
    { turn: 3, role: "tool_results", content: [{ type: "tool_result", tool_use_id: "toolu_old_5", content: enc("Applied 1 edit(s) to src/lib/schedule.ts") }] },
    {
      turn: 4,
      role: "assistant",
      content: [{ type: "tool_use", id: "toolu_old_6", name: "run_checks", input: {} }],
      usage: { input_tokens: 1200, output_tokens: 100, cache_read: 2000, cache_write: 0 },
    },
    {
      turn: 4,
      role: "tool_results",
      content: [{ type: "tool_result", tool_use_id: "toolu_old_6", content: enc("Sandbox checks FAILED ❌ (exit 1)\n- Types: PASS `tsc`\n- Tests: FAIL (exit 1) `npm test`\n--- real output (tail) ---\nschedule.test.ts: expected 2, got 0") }],
    },
    // The worker called the model again (test remediation): turns start at 1.
    {
      turn: 1,
      role: "assistant",
      content: [
        { type: "text", text: "The test expects two times; load() returns none in tests." },
        { type: "tool_use", id: "toolu_old_7", name: "write_file", input: { path: "src/lib/schedule.test.ts", content: "test('two', () => {});\n" } },
      ],
      usage: { input_tokens: 900, output_tokens: 150, cache_read: 2000, cache_write: 0 },
    },
    { turn: 1, role: "tool_results", content: [{ type: "tool_result", tool_use_id: "toolu_old_7", content: enc("Wrote src/lib/schedule.test.ts") }] },
    {
      turn: 2,
      role: "assistant",
      content: [{ type: "tool_use", id: "toolu_old_8", name: "run_checks", input: {} }],
      usage: { input_tokens: 900, output_tokens: 100, cache_read: 2000, cache_write: 0 },
    },
    { turn: 2, role: "tool_results", content: [{ type: "tool_result", tool_use_id: "toolu_old_8", content: enc("Sandbox checks PASSED ✅\n- Types: PASS `tsc`\n- Tests: PASS `npm test`") }] },
    { turn: 3, role: "assistant", content: [{ type: "text", text: "Added the schedule table and its test." }], usage: { input_tokens: 900, output_tokens: 80, cache_read: 2000, cache_write: 0 }, stop_reason: "end_turn" },
  ];
  // Old events: no pass, no id, and a JSON input summary on the oldest.
  const live_events = [
    { tool: "search_code", input_summary: '{"query":"ScheduleTable"}', duration_ms: 420, is_error: false, timestamp: at(100) },
    { tool: "read_file", input_summary: "path: src/lib/schedule.ts", duration_ms: 90, is_error: false, timestamp: at(101) },
    { tool: "read_file", input_summary: "path: src/app/classes/page.tsx", duration_ms: 80, is_error: false, timestamp: at(102) },
    { tool: "edit_file", input_summary: "path: src/lib/schedule.ts", duration_ms: 150, is_error: false, timestamp: at(110) },
    { tool: "edit_file", input_summary: "path: src/lib/schedule.ts", duration_ms: 160, is_error: false, timestamp: at(115) },
    { tool: "run_checks", input_summary: "", duration_ms: 64_000, is_error: false, timestamp: at(190) },
    { tool: "write_file", input_summary: "path: src/lib/schedule.test.ts", duration_ms: 300, is_error: false, timestamp: at(200) },
    { tool: "run_checks", input_summary: "", duration_ms: 58_000, is_error: false, timestamp: at(260) },
  ];
  return { passes: [{ pass: "implement", conversation }], live_events } as unknown as AgentLog;
}
