import type { AgentLog, AgentLogBlock, AgentLogEntry, AgentLogLiveEvent, AgentLogOutcome, AgentLogPass, AgentLogToolResult, AgentLogUsage, PassTrace } from "./api";

// The run page's agent log as people read it: each stored log becomes a pass
// section, the agent's own words head the work that follows them, every tool
// call is one sentence paired with its result and outcome, repeated reads
// fold into one counted line that still names each file, and problems are
// counted, listed first and never folded away. Pure, so the e2e suite checks
// it directly; the panel (app/runs/detail/agent-log.tsx) only draws it.
//
// Two log formats arrive (platform `common/src/agent_log.rs`):
// - format 1: bare entries; results JSON-encoded with no tool name, times or
//   outcome; turns start again at 1 when the worker calls the model again.
// - format 2: `call_started` and `system_note` entries, timed entries, and
//   each result with its tool, id, start, duration and outcome.

export type StepStatus = "ok" | "soft_fail" | "refused" | "error" | "unknown";
/** What a step did, for the filter chips. */
export type StepCategory = "change" | "check" | "read" | "other";

export interface LogStep {
  /** The tool_use id; stable, so it is the step's link. */
  id: string;
  tool: string;
  input: Record<string, unknown>;
  /** The sentence, past tense: "Read", "Searched for", "Edited". */
  verb: string;
  /** What it acted on: a path, a query, a host. Shown after the verb. */
  target: string;
  /** True when `target` is a file path (drawn as one). */
  targetIsPath: boolean;
  /** The outcome in a few words: "80 lines", "2 changes, +4 −1". */
  summary: string;
  status: StepStatus;
  category: StepCategory;
  /** Every path the step names. */
  files: string[];
  diff?: { add: number; del: number };
  /** The result as text (decoded once when it was JSON-encoded); null when none was logged. */
  result: string | null;
  /** The decoded result when it was a JSON object or array, not a string. */
  resultValue?: unknown;
  /** True when the stored result ended in the worker's truncation marker. */
  truncated: boolean;
  startedAt?: string;
  durationMs?: number;
  /** For a retry: the step it tries again, and which try this is (2 = second). */
  retryOf?: string;
  attempt?: number;
  /** The raw call and result as stored, for the raw view. */
  raw: { call: unknown; result: unknown };
  /** Lower-cased text the in-page search matches. */
  haystack: string;
  /** The step is from a live event not yet in a stored log. */
  live?: boolean;
}

export interface LogGroup {
  kind: "group";
  id: string;
  /** "Read 4 files", "Searched 3 times". */
  title: string;
  /** The members' names inline when short: "index.tsx, flags.ts and 2 more". */
  names: string;
  steps: LogStep[];
}

export type LogItem =
  | { kind: "step"; step: LogStep }
  | LogGroup
  | { kind: "note"; id: string; noteKind: string; text: string; raw: string; at?: string };

export interface LogSection {
  id: string;
  /** The agent's own short line, when it wrote one. */
  heading: string | null;
  /** Its words as written (after the heading line). */
  prose: string;
  thinking: string[];
  /** A divider before the section: the worker called the model again. */
  divider?: string;
  items: LogItem[];
}

export interface LogPass {
  id: string;
  /** The worker's name for the step: implement, ci_fix, plan. */
  pass: string;
  /** Plain words: "Build", "CI fix, round 2", "Plan (reviewer)". */
  label: string;
  agent?: string;
  round: number;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  costUsd?: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  format: 1 | 2;
  sections: LogSection[];
  /** Every step, in order. */
  steps: LogStep[];
  /** Ids of the steps with a problem, in order. */
  problems: string[];
  final?: { text: string; cutOff: boolean };
  /** "Used every step (40 of 40)" and the like. */
  endNote?: string;
  live: boolean;
}

export interface LogDigest {
  /** The last few things the agent said it was doing, oldest first. */
  headings: string[];
  /** "Changed 3 files (+27 −2)". */
  changed: string | null;
  /** "Checks passed on the 2nd run". */
  checks: string | null;
  /** The latest heading or step: what it is doing now. */
  now: string | null;
  /** The step the "Open the agent log" link opens: the first under the latest heading. */
  anchor: string | null;
}

export interface LogModel {
  passes: LogPass[];
  stepCount: number;
  /** Every file any step names, sorted. */
  files: string[];
  counts: { changes: number; checks: number; problems: number; reading: number };
  /** The gateway left live events unread. */
  truncated: boolean;
  digest: LogDigest;
}

// ── Words ────────────────────────────────────────────────────────────

const PASS_WORDS: Record<string, string> = {
  triage: "Triage",
  plan: "Plan",
  implement: "Build",
  test: "Test",
  security: "Security review",
  security_fix: "Security fix",
  pr: "Pull request",
  review: "Checks",
  feedback: "Review comments",
  ci_fix: "CI fix",
};

/** "implement" is "Build", "implement_your-team_web" is "Build · your-team_web", "ci_fix:2" is "CI fix". */
export function passWords(pass: string): string {
  const base = pass.split(":")[0];
  if (PASS_WORDS[base]) return PASS_WORDS[base];
  for (const k of ["implement", "security_fix"]) {
    if (base.startsWith(`${k}_`)) return `${PASS_WORDS[k]} · ${base.slice(k.length + 1)}`;
  }
  const w = base.replace(/_/g, " ").trim();
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : "A step";
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "once", "twice", "3 times". */
const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);
const ordinal = (n: number) => (n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

const READ_TOOLS = new Set(["read_file", "read_file_lines", "list_directory", "read_tree", "graph_callers", "graph_definition", "graph_impact", "read_skill", "read_skill_file"]);
const SEARCH_TOOLS = new Set(["search_code", "search_knowledge", "search_org", "search_read"]);
const HISTORY_TOOLS = new Set(["github_history"]);
const CHANGE_TOOLS = new Set(["write_file", "edit_file", "batch_write", "restore_file", "run_codegen"]);

function category(tool: string): StepCategory {
  if (CHANGE_TOOLS.has(tool)) return "change";
  if (tool === "run_checks") return "check";
  if (READ_TOOLS.has(tool) || SEARCH_TOOLS.has(tool) || HISTORY_TOOLS.has(tool) || tool === "get_diff") return "read";
  return "other";
}

/** Reading steps (reads, searches, listings, history) fold together: they are how the agent explored. */
function foldKind(tool: string): "explore" | null {
  return READ_TOOLS.has(tool) || SEARCH_TOOLS.has(tool) || HISTORY_TOOLS.has(tool) ? "explore" : null;
}

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const basename = (p: string) => p.split("/").filter(Boolean).pop() ?? p;
const words = (s: string) => s.replace(/[_-]+/g, " ").trim();

/** "https://cms.example.io/v1/query?x=1" as "cms.example.io/v1/query", decoded. */
function urlWords(u: string): string {
  try {
    const url = new URL(u);
    return decodeURIComponent(`${url.host}${url.pathname === "/" ? "" : url.pathname}`);
  } catch {
    return u;
  }
}

const HISTORY_WORDS: Record<string, string> = {
  commits: "recent commits",
  compare: "the changes between two versions",
  blame: "who changed the lines",
  pull_requests: "past pull requests",
  releases: "recent releases",
  tags: "the tags",
  deployments: "recent deployments",
  workflow_runs: "recent CI runs",
};

/** Lines a text adds and removes when `before` becomes `after` (common head and tail trimmed). */
export function lineDelta(before: string, after: string): { add: number; del: number } {
  const a = before === "" ? [] : before.split("\n");
  const b = after === "" ? [] : after.split("\n");
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  return { add: b.length - head - tail, del: a.length - head - tail };
}

/** "2 edit(s), +4/-1 lines" as "2 changes, +4 −1"; other summaries as written, first letter kept. */
function tidySummary(s: string): string {
  return s
    .replace(/(\d+) edit\(s\)/, (_, n) => plural(Number(n), "change"))
    .replace(/\+(\d+)\/-(\d+)( lines)?/, "+$1 −$2")
    .replace(/^created, \+(\d+) lines$/, "$1 lines")
    .replace(/^rewritten, /, "");
}

function diffFrom(summary: string): { add: number; del: number } | undefined {
  const m = summary.match(/\+(\d+)\/-(\d+)/);
  if (m) return { add: Number(m[1]), del: Number(m[2]) };
  const c = summary.match(/^created, \+(\d+) lines/);
  if (c) return { add: Number(c[1]), del: 0 };
  return undefined;
}

// ── Results ──────────────────────────────────────────────────────────

const TRUNCATED = /\.\.\. \[truncated, \d+ bytes total\]\s*$/;

/** The result as text: a JSON-encoded string parsed once, plain text as is. */
export function decodeResult(r: AgentLogToolResult | undefined): { text: string | null; value?: unknown } {
  if (!r) return { text: null };
  const c = r.content;
  if (typeof c !== "string") {
    if (Array.isArray(c)) {
      // Messages API content blocks: join their text.
      const t = c.map((b) => (b && typeof b === "object" && "text" in b ? str((b as { text: unknown }).text) : "")).join("\n");
      return { text: t };
    }
    return c == null ? { text: null } : { text: JSON.stringify(c, null, 2), value: c };
  }
  const enc = r.content_encoding ?? guessEncoding(c);
  if (enc === "text") return { text: c };
  try {
    const v = JSON.parse(c);
    if (typeof v === "string") return { text: v };
    if (v === null) return { text: "" };
    return { text: JSON.stringify(v, null, 2), value: v };
  } catch {
    return { text: c };
  }
}

function guessEncoding(c: string): "json" | "text" {
  const t = c.trim();
  return (t.startsWith('"') && t.endsWith('"') && t.length >= 2) || t.startsWith("{") || t.startsWith("[") ? "json" : "text";
}

/** Format 1 has no outcome: read the result's own words (the worker's fixed phrases). */
function statusFromText(tool: string, text: string, isError: boolean): StepStatus {
  if (isError) return /agent (?:policy|permissions)|not allowed|refused|GitHub is paused/i.test(text) ? "refused" : "error";
  if (/^NO edits applied|REJECTED|^Cannot modify|^All files skipped/m.test(text)) return "soft_fail";
  if (tool === "run_checks" && /Sandbox checks FAILED|couldn't verify|Sandbox error|isn't available|budget .* reached/i.test(text)) return "soft_fail";
  return "ok";
}

/** The check lines of a run_checks result: "- Tests: FAIL (exit 1) `npm test`". */
export function checkLines(text: string): { label: string; passed: boolean | null; detail: string }[] {
  const out: { label: string; passed: boolean | null; detail: string }[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^- ([^:]+): (PASS|FAIL|no result)(.*)$/);
    if (m) out.push({ label: m[1].trim(), passed: m[2] === "PASS" ? true : m[2] === "FAIL" ? false : null, detail: m[3].replace(/`[^`]*`/g, "").trim() });
  }
  return out;
}

/** The output tail a run_checks result carries after its check lines. */
export function checkOutput(text: string): string {
  const i = text.indexOf("--- real output (tail) ---");
  return i >= 0 ? text.slice(i + "--- real output (tail) ---".length).trim() : "";
}

/** A search result as files and their matching lines. */
export function searchHits(text: string): { path: string; lines: string[] }[] {
  if (!text.trim() || /^no matches/i.test(text.trim())) return [];
  return text
    .split(/\n---\n/)
    .map((block) => {
      const [path, ...lines] = block.split("\n");
      return { path: path.trim(), lines: lines.filter((l) => l.trim()) };
    })
    .filter((h) => h.path);
}

/** A summary from the result text, for format 1 (format 2 has the tool's own). */
function summaryFromText(tool: string, input: Record<string, unknown>, text: string | null, status: StepStatus): string {
  if (text === null) return "";
  if (status === "soft_fail" || status === "error" || status === "refused") return shortReason(text);
  switch (tool) {
    case "read_file":
    case "read_file_lines":
      return plural(text.replace(/\n$/, "").split("\n").length, "line");
    case "search_code": {
      const n = searchHits(text).length;
      return n ? plural(n, "file") : "no matches";
    }
    case "list_directory":
      return plural(text.split("\n").filter(Boolean).length, "entry", "entries");
    case "run_checks": {
      const lines = checkLines(text);
      const ok = lines.filter((l) => l.passed).length;
      return lines.length ? `${ok} of ${lines.length} checks passed` : "";
    }
    case "write_file":
      return plural(str(input.content).split("\n").filter((l, i, a) => l || i < a.length - 1).length, "line");
    default:
      return "";
  }
}

/** The worker's fixed failure phrases in a few words; anything else as its first sentence. */
function shortReason(text: string): string {
  if (/^NO edits applied/.test(text)) return "no edits applied";
  if (/^(?:Write|Edit|Batch write) REJECTED/.test(text)) return "rejected";
  if (/^Cannot modify/.test(text)) return "not changed: a protected file";
  if (/^All files skipped/.test(text)) return "nothing committed: protected files";
  return firstSentence(text);
}

/** The first sentence of a message, for a one-line reason. */
function firstSentence(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.{1,160}?)(?:[.!:]\s|[.!:]$| — )/);
  return m ? m[1] : t.slice(0, 160);
}

// ── One step ─────────────────────────────────────────────────────────

/** The verb, target and the files a call names, from its input alone. */
function describe(tool: string, input: Record<string, unknown>): { verb: string; target: string; isPath: boolean; files: string[] } {
  const path = str(input.path);
  switch (tool) {
    case "read_file":
      return { verb: "Read", target: path, isPath: true, files: [path] };
    case "read_file_lines": {
      const start = Number(input.start_line ?? 1) || 1;
      const end = Number(input.end_line ?? start + 100) || start + 100;
      return { verb: "Read", target: `${path} lines ${start}–${end}`, isPath: true, files: [path] };
    }
    case "search_code":
      return { verb: "Searched for", target: `"${str(input.query)}"`, isPath: false, files: [] };
    case "list_directory":
      return { verb: "Listed", target: path ? `${path.replace(/\/$/, "")}/` : "the top folder", isPath: !!path, files: [] };
    case "read_tree":
      return { verb: "Listed", target: "every file in the repository", isPath: false, files: [] };
    case "write_file":
      return { verb: "Wrote", target: path, isPath: true, files: [path] };
    case "edit_file":
      return { verb: "Edited", target: path, isPath: true, files: [path] };
    case "batch_write": {
      const files = Array.isArray(input.files) ? (input.files as { path?: unknown }[]).map((f) => str(f?.path)).filter(Boolean) : [];
      return { verb: "Committed", target: plural(files.length, "file"), isPath: false, files };
    }
    case "restore_file":
      return { verb: "Restored", target: `${path}${input.from_ref ? ` from ${str(input.from_ref)}` : ""}`, isPath: true, files: [path] };
    case "get_diff":
      return { verb: "Looked at", target: "the change so far", isPath: false, files: [] };
    case "run_checks":
      return { verb: "Ran", target: "the checks", isPath: false, files: [] };
    case "run_codegen":
      return { verb: "Ran", target: "the code generator", isPath: false, files: [] };
    case "check_url": {
      const urls = Array.isArray(input.urls) ? (input.urls as unknown[]).map(str) : str(input.url) ? [str(input.url)] : [];
      const find = Array.isArray(input.find) ? (input.find as unknown[]).map(str).filter(Boolean) : [];
      const what = urls.length > 1 ? plural(urls.length, "page") : urlWords(urls[0] ?? "a page");
      return { verb: "Checked", target: `${what}${find.length ? ` for "${find[0]}"` : ""}`, isPath: false, files: [] };
    }
    case "github_history": {
      const kind = str(input.kind);
      const w = kind === "pull_request" ? `pull request #${str(input.number)}` : HISTORY_WORDS[kind] ?? words(kind || "history");
      return { verb: "Looked at", target: `${w}${path ? ` for ${path}` : input.ref ? ` for ${str(input.ref)}` : ""}`, isPath: false, files: path ? [path] : [] };
    }
    case "graph_callers":
      return { verb: "Found what calls", target: str(input.name), isPath: false, files: [] };
    case "graph_definition":
      return { verb: "Found where", target: `${str(input.name)} is defined`, isPath: false, files: [] };
    case "graph_impact": {
      const paths = Array.isArray(input.paths) ? (input.paths as unknown[]).map(str) : [];
      return { verb: "Checked what depends on", target: paths.length === 1 ? paths[0] : plural(paths.length, "file"), isPath: paths.length === 1, files: paths };
    }
    case "read_skill":
      return { verb: "Read", target: `the team's ${str(input.name)} skill`, isPath: false, files: [] };
    case "read_skill_file":
      return { verb: "Read", target: `${path} from the ${str(input.name)} skill`, isPath: false, files: [] };
    case "ask_team_agent":
      return { verb: "Asked", target: `the ${str(input.agent ?? input.name) || "team's"} agent`, isPath: false, files: [] };
    case "check_package":
      return { verb: "Checked", target: `${str(input.name)} on ${str(input.registry) || "its registry"}`, isPath: false, files: [] };
    case "search_knowledge":
    case "search_org":
    case "search_read":
      return { verb: "Searched", target: `${tool === "search_org" ? "the organization" : "the team's knowledge"} for "${str(input.query ?? input.q)}"`, isPath: false, files: [] };
    case "live_describe":
    case "live_lookup":
      return { verb: "Looked up", target: str(input.source ?? input.name) || "a live source", isPath: false, files: [] };
    default: {
      // A plugin tool ("linear__create_issue") or one this page doesn't know.
      const [plugin, rest] = tool.includes("__") ? tool.split("__", 2) : [null, tool];
      const first = Object.values(input).find((v) => typeof v === "string" && v.length <= 80);
      return { verb: plugin ? `Used ${words(plugin)}:` : "Used", target: `${words(rest)}${first ? ` (${first})` : ""}`, isPath: false, files: path ? [path] : [] };
    }
  }
}

function makeStep(opts: {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  result?: AgentLogToolResult;
  outcome?: AgentLogOutcome | null;
  isError?: boolean;
  durationMs?: number;
  startedAt?: string;
  call: unknown;
  live?: boolean;
  liveSummary?: string;
}): LogStep {
  const { tool, input } = opts;
  const d = describe(tool, input);
  const decoded = decodeResult(opts.result);
  const text = decoded.text;
  const outcome = opts.outcome ?? opts.result?.outcome ?? null;
  const isError = opts.isError ?? !!opts.result?.is_error;
  const status: StepStatus = outcome ? outcome.status : text === null && !opts.live ? (isError ? "error" : "unknown") : statusFromText(tool, text ?? "", isError);
  let summary = outcome?.summary ? tidySummary(outcome.summary) : summaryFromText(tool, input, text, status);
  // A ranged read's target already names its lines.
  if (tool === "read_file_lines" && /^lines \d+-\d+$/.test(summary)) summary = "";
  let diff = outcome?.summary ? diffFrom(outcome.summary) : undefined;
  let verb = d.verb;
  if (tool === "write_file" && outcome?.summary) verb = /^created/.test(outcome.summary) ? "Created" : /^rewritten/.test(outcome.summary) ? "Rewrote" : verb;
  if (!diff && status === "ok") {
    if (tool === "edit_file" && Array.isArray(input.edits)) {
      const edits = input.edits as { old_text?: unknown; new_text?: unknown }[];
      diff = edits.reduce((acc, e) => {
        const x = lineDelta(str(e?.old_text), str(e?.new_text));
        return { add: acc.add + x.add, del: acc.del + x.del };
      }, { add: 0, del: 0 });
      summary = `${plural(edits.length, "change")}, +${diff.add} −${diff.del}`;
    } else if (tool === "write_file") {
      const n = str(input.content).replace(/\n$/, "").split("\n").length;
      diff = { add: n, del: 0 };
    }
  }
  if (tool === "run_checks" && text && status !== "error" && status !== "refused") {
    const failed = checkLines(text).filter((l) => l.passed === false).map((l) => l.label.toLowerCase());
    if (failed.length) summary = `failed: ${failed.join(", ")}`;
    else if (status === "ok" && checkLines(text).length) summary = "passed";
  }
  if (!summary && opts.liveSummary) summary = opts.liveSummary;
  const files = d.files.filter(Boolean);
  const haystack = [verb, d.target, summary, tool, JSON.stringify(input), text ?? ""].join("\n").toLowerCase();
  return {
    id: opts.id,
    tool,
    input,
    verb,
    target: d.target,
    targetIsPath: d.isPath,
    summary,
    status,
    category: category(tool),
    files,
    diff,
    result: text,
    resultValue: decoded.value,
    truncated: !!text && TRUNCATED.test(text),
    startedAt: opts.startedAt ?? opts.result?.started_at,
    durationMs: opts.durationMs ?? opts.result?.duration_ms,
    raw: { call: opts.call, result: opts.result ?? null },
    haystack,
    live: opts.live,
  };
}

/** The key a retry is matched on: the same tool family and the same file. */
function retryKey(s: LogStep): string | null {
  if (s.tool === "run_checks") return "checks";
  if (s.category === "change" && s.files[0]) return `change:${s.files[0]}`;
  return null;
}

export const isProblem = (s: Pick<LogStep, "status">) => s.status === "soft_fail" || s.status === "refused" || s.status === "error";

// ── Sections ─────────────────────────────────────────────────────────

const FILLER = /^(?:okay|ok|great|good|now|alright|perfect|first)[,.!]?\s+|^(?:let me|i'll|i will|i'm going to|i need to)\s+/i;

/** The agent's text as a heading (a short or bold first line) and its prose. */
export function splitIntent(text: string): { heading: string | null; prose: string } {
  const t = text.trim();
  if (!t) return { heading: null, prose: "" };
  const [first, ...rest] = t.split("\n");
  const bold = first.match(/^\s*\*\*(.+?)\*\*\s*:?\s*$/) ?? first.match(/^#{1,4}\s+(.+)$/);
  const line = (bold ? bold[1] : first).trim();
  // A heading is a bold line, or a short first line that isn't a sentence.
  if (bold || (line.length <= 80 && !/[.!?]$/.test(line))) {
    let heading = line.replace(/:$/, "");
    let prev = "";
    while (prev !== heading) {
      prev = heading;
      heading = heading.replace(FILLER, "");
    }
    heading = heading.charAt(0).toUpperCase() + heading.slice(1);
    return { heading, prose: rest.join("\n").trim() };
  }
  return { heading: null, prose: t };
}

/** Plain words for a note the worker put in the conversation. */
export function noteWords(kind: string, text: string): string {
  const m = text.match(/used (\d+) of (\d+)/i);
  if (kind === "turn_budget") return m ? `Coderhelm told the agent it had used ${m[1]} of its ${m[2]} steps` : "Coderhelm reminded the agent of its step budget";
  if (kind === "wrap_up") return "Time was nearly up: Coderhelm asked the agent to wrap up";
  if (kind === "tools_off") return "Coderhelm turned the tools off and asked for the final answer";
  return text.replace(/^\[SYSTEM NOTE\]\s*/i, "");
}

class SectionBuilder {
  sections: LogSection[] = [];
  private cur: LogSection | null = null;
  private n = 0;
  constructor(private passId: string) {}

  open(heading: string | null, prose: string, divider?: string): LogSection {
    this.n += 1;
    this.cur = { id: `${this.passId}-s${this.n}`, heading, prose, thinking: [], items: [], divider };
    this.sections.push(this.cur);
    return this.cur;
  }
  get current(): LogSection {
    return this.cur ?? this.open(null, "");
  }
}

/** Folds runs of two or more reading steps of one kind into a counted group; problems stay out. */
function fold(items: LogItem[], passId: string): LogItem[] {
  const out: LogItem[] = [];
  let run: LogStep[] = [];
  let kind: string | null = null;
  const flush = () => {
    if (run.length >= 2) out.push(group(run, `${passId}-g${run[0].id}`));
    else for (const s of run) out.push({ kind: "step", step: s });
    run = [];
    kind = null;
  };
  for (const it of items) {
    const k = it.kind === "step" && !isProblem(it.step) ? foldKind(it.step.tool) : null;
    if (k && (kind === null || kind === k)) {
      kind = k;
      run.push((it as { step: LogStep }).step);
      continue;
    }
    flush();
    if (k) {
      kind = k;
      run.push((it as { step: LogStep }).step);
    } else out.push(it);
  }
  flush();
  return out;
}

function group(steps: LogStep[], id: string): LogGroup {
  const files = new Set(steps.filter((s) => s.tool.startsWith("read_file") || s.tool === "read_skill_file").map((s) => s.files[0] ?? s.target));
  const searches = steps.filter((s) => SEARCH_TOOLS.has(s.tool)).length;
  const lists = steps.filter((s) => s.tool === "list_directory" || s.tool === "read_tree").length;
  const history = steps.filter((s) => HISTORY_TOOLS.has(s.tool)).length;
  const other = steps.length - steps.filter((s) => s.tool.startsWith("read_file") || s.tool === "read_skill_file").length - searches - lists - history;
  const parts = [
    files.size ? `read ${plural(files.size, "file")}` : "",
    searches ? `searched ${times(searches)}` : "",
    lists ? `listed ${plural(lists, "folder")}` : "",
    history ? `looked at the history ${times(history)}` : "",
    other ? `looked something up ${times(other)}` : "",
  ].filter(Boolean);
  const said = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  const title = said.charAt(0).toUpperCase() + said.slice(1);
  const names = [...new Set(steps.map((s) => (s.files[0] ? basename(s.files[0]) : s.target.replace(/^"|"$/g, ""))))];
  const shown = names.slice(0, 3).join(", ");
  return { kind: "group", id, title, names: names.length > 3 ? `${shown} and ${names.length - 3} more` : shown, steps };
}

// ── Passes ───────────────────────────────────────────────────────────

const usageZero = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 });

function addUsage(t: LogPass["tokens"], u?: AgentLogUsage) {
  if (!u) return;
  t.input += u.input_tokens || 0;
  t.output += u.output_tokens || 0;
  t.cacheRead += u.cache_read || 0;
  t.cacheWrite += u.cache_write || 0;
  t.total = t.input + t.output + t.cacheRead + t.cacheWrite;
}

/** One stored log as a pass section: steps paired with results, grouped under the agent's words. */
function buildPass(p: AgentLogPass, idx: number): LogPass {
  const id = p.id || `${p.pass}-${idx + 1}`;
  const entries = (Array.isArray(p.conversation) ? p.conversation : []) as AgentLogEntry[];
  const format: 1 | 2 = p.format === 2 || entries.some((e) => "call" in e && e.call != null) ? 2 : 1;
  const results = new Map<string, AgentLogToolResult>();
  for (const e of entries) {
    if (e.role !== "tool_results" || !Array.isArray(e.content)) continue;
    for (const r of e.content) if (r && r.tool_use_id) results.set(r.tool_use_id, r);
  }
  // Format 1 tool_use blocks may lack ids (very old logs): pair by position with the next results entry.
  const tokens = usageZero();
  const sb = new SectionBuilder(id);
  const steps: LogStep[] = [];
  let final: LogPass["final"];
  let maxTurns: number | undefined;
  let lastTurn = 0;
  let lastCall: number | undefined;
  let lastChecksFailed = false;
  let n = 0;
  const lastTry = new Map<string, LogStep>();
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e || typeof e !== "object") continue;
    if (e.role === "call_started") {
      if (lastCall !== undefined) sb.open(null, "", lastChecksFailed ? "Fixing the failing checks" : "Picked up again in a new conversation");
      lastCall = e.call ?? (lastCall ?? 0) + 1;
      maxTurns = e.max_turns ?? maxTurns;
      lastTurn = 0;
      continue;
    }
    if (e.role === "system_note") {
      sb.current.items.push({ kind: "note", id: `${id}-n${i}`, noteKind: e.kind, text: noteWords(e.kind, e.text), raw: e.text, at: e.started_at });
      continue;
    }
    if (e.role !== "assistant") continue;
    // Format 1: turns starting again at 1 mean the worker called the model again.
    if (format === 1 && e.turn === 1 && lastTurn > 1) sb.open(null, "", lastChecksFailed ? "Fixing the failing checks" : "Picked up again in a new conversation");
    lastTurn = e.turn;
    addUsage(tokens, e.usage);
    const blocks = (Array.isArray(e.content) ? e.content : []) as AgentLogBlock[];
    const text = blocks.filter((b) => b.type === "text").map((b) => str((b as { text?: unknown }).text)).join("\n\n").trim();
    const thinking = blocks.filter((b) => b.type === "thinking").map((b) => str((b as { thinking?: unknown }).thinking).trim()).filter(Boolean);
    const uses = blocks.filter((b) => b.type === "tool_use") as { id?: string; name: string; input?: Record<string, unknown> }[];
    if (!uses.length && e.stop_reason) {
      final = { text, cutOff: e.stop_reason === "max_tokens" };
      if (thinking.length) sb.current.thinking.push(...thinking);
      continue;
    }
    if (text) {
      const intent = splitIntent(text);
      sb.open(intent.heading, intent.prose);
    }
    if (thinking.length) sb.current.thinking.push(...thinking);
    const next = entries[i + 1];
    const positional = next && next.role === "tool_results" && Array.isArray(next.content) ? next.content : [];
    uses.forEach((u, k) => {
      n += 1;
      const r = u.id ? results.get(u.id) : positional[k];
      const step = makeStep({ id: u.id || r?.tool_use_id || `${id}-t${n}`, tool: u.name || r?.tool || "tool", input: u.input && typeof u.input === "object" ? u.input : {}, result: r, call: u });
      const key = retryKey(step);
      if (key) {
        const prev = lastTry.get(key);
        if (prev && isProblem(prev)) {
          step.retryOf = prev.id;
          step.attempt = (prev.attempt ?? 1) + 1;
        }
        lastTry.set(key, step);
      }
      if (step.tool === "run_checks") lastChecksFailed = step.status === "soft_fail" || step.status === "error";
      steps.push(step);
      sb.current.items.push({ kind: "step", step });
    });
  }
  const sections = sb.sections
    .map((s) => ({ ...s, items: fold(s.items, id) }))
    // A divider with nothing under it still says the model was called again; an empty untitled section says nothing.
    .filter((s) => s.items.length || s.heading || s.prose || s.thinking.length || s.divider);
  let endNote: string | undefined;
  if (maxTurns && lastTurn >= maxTurns) endNote = `Used every step it had (${lastTurn} of ${maxTurns})`;
  return {
    id,
    pass: p.pass,
    label: passWords(p.pass),
    agent: p.step ?? undefined,
    round: p.round ?? 1,
    startedAt: p.started_at ?? undefined,
    endedAt: p.ended_at ?? undefined,
    durationMs: p.started_at && p.ended_at ? Math.max(0, Date.parse(p.ended_at) - Date.parse(p.started_at)) || undefined : undefined,
    tokens,
    format,
    sections,
    steps,
    problems: steps.filter(isProblem).map((s) => s.id),
    final,
    endNote,
    live: false,
  };
}

/** "key: value, key: value" or a JSON object, as the worker summarised a call's input. */
export function parseInputSummary(s: string): Record<string, unknown> {
  const t = (s || "").trim();
  if (!t) return {};
  if (t.startsWith("{")) {
    try {
      const v = JSON.parse(t);
      if (v && typeof v === "object") return v as Record<string, unknown>;
    } catch {
      // Cut at 240 characters: fall through to the key: value reading.
    }
  }
  const out: Record<string, unknown> = {};
  const re = /(?:^|,\s)([A-Za-z_][\w]*): ([\s\S]*?)(?=,\s[A-Za-z_][\w]*: |$)/g;
  for (const m of t.matchAll(re)) out[m[1]] = m[2];
  return out;
}

/** Steps reported live but not in any stored log yet, as passes of their own (the run is still on them). */
function livePasses(events: AgentLogLiveEvent[], logged: Set<string>, hasLogs: boolean): LogPass[] {
  const fresh = events.filter((e) => (e.tool_use_id ? !logged.has(e.tool_use_id) : !hasLogs));
  if (!fresh.length) return [];
  const byPass = new Map<string, AgentLogLiveEvent[]>();
  for (const e of fresh) {
    const k = e.pass || "implement";
    byPass.set(k, [...(byPass.get(k) ?? []), e]);
  }
  return [...byPass.entries()].map(([pass, evs], i) => {
    const id = `live-${pass}-${i}`;
    const steps = evs.map((e, k) =>
      makeStep({
        id: e.tool_use_id || `${id}-t${k + 1}`,
        tool: e.tool,
        input: parseInputSummary(e.input_summary),
        outcome: e.outcome ?? { status: e.is_error ? "error" : "ok" },
        isError: e.is_error,
        durationMs: e.duration_ms,
        startedAt: e.started_at ?? (e.timestamp ? new Date(Date.parse(e.timestamp) - (e.duration_ms || 0)).toISOString() : undefined),
        call: e,
        live: true,
      }),
    );
    const items = fold(steps.map((step) => ({ kind: "step" as const, step })), id);
    return {
      id,
      pass,
      label: passWords(pass),
      round: 1,
      startedAt: steps[0]?.startedAt,
      tokens: usageZero(),
      format: 2 as const,
      sections: [{ id: `${id}-s1`, heading: null, prose: "", thinking: [], items }],
      steps,
      problems: steps.filter(isProblem).map((s) => s.id),
      live: true,
    };
  });
}

/** Old logs have no times: take each call's duration from the live events, matched per tool in order, only when the counts agree. */
function joinOldEvents(passes: LogPass[], events: AgentLogLiveEvent[]) {
  const old = events.filter((e) => !e.tool_use_id);
  if (!old.length) return;
  const steps = passes.filter((p) => p.format === 1 && p.pass.startsWith("implement")).flatMap((p) => p.steps);
  const byTool = (list: { tool: string }[]) => list.reduce((m, x) => m.set(x.tool, (m.get(x.tool) ?? 0) + 1), new Map<string, number>());
  const a = byTool(steps);
  const b = byTool(old);
  for (const [tool, n] of a) {
    if (b.get(tool) !== n) continue;
    const evs = old.filter((e) => e.tool === tool);
    steps.filter((s) => s.tool === tool).forEach((s, k) => {
      const e = evs[k];
      s.durationMs = e.duration_ms;
      if (e.timestamp) s.startedAt = new Date(Date.parse(e.timestamp) - (e.duration_ms || 0)).toISOString();
    });
  }
}

/** Cost and time per pass from the traces, only where a trace can only be that pass's. */
function joinTraces(passes: LogPass[], traces: PassTrace[]) {
  const logsPer = new Map<string, LogPass[]>();
  for (const p of passes) if (!p.live) logsPer.set(p.pass, [...(logsPer.get(p.pass) ?? []), p]);
  for (const [pass, logs] of logsPer) {
    const ts = traces.filter((t) => t.pass.split(":")[0] === pass);
    // Several agents' logs under one pass share its trace: no split is honest, so no cost.
    if (ts.length !== logs.length) continue;
    logs.forEach((l, i) => {
      const t = ts[i];
      if (typeof t.cost_usd === "number") l.costUsd = t.cost_usd;
      if (l.durationMs === undefined && t.duration_ms) l.durationMs = t.duration_ms;
    });
  }
}

/** Plain labels: the agent when a pass has several, the round when the same one ran again. */
function label(passes: LogPass[]) {
  const agents = new Map<string, Set<string>>();
  for (const p of passes) if (!p.live) agents.set(p.pass, (agents.get(p.pass) ?? new Set()).add(p.agent ?? ""));
  const seen = new Map<string, number>();
  const totals = new Map<string, number>();
  for (const p of passes) if (!p.live) totals.set(`${p.pass}|${p.agent ?? ""}`, (totals.get(`${p.pass}|${p.agent ?? ""}`) ?? 0) + 1);
  for (const p of passes) {
    if (p.live) {
      p.label = `${p.label}, working now`;
      continue;
    }
    const key = `${p.pass}|${p.agent ?? ""}`;
    const k = (seen.get(key) ?? 0) + 1;
    seen.set(key, k);
    p.round = k;
    const several = (agents.get(p.pass)?.size ?? 0) > 1;
    p.label = `${p.label}${several && p.agent ? ` (${p.agent})` : ""}${(totals.get(key) ?? 0) > 1 ? `, round ${k}` : ""}`;
  }
}

function firstStep(s: LogSection | undefined): string | null {
  for (const it of s?.items ?? []) {
    if (it.kind === "step") return it.step.id;
    if (it.kind === "group") return it.steps[0]?.id ?? null;
  }
  return null;
}

/** The Overview's three lines about the build, from the same model. */
function digestOf(passes: LogPass[]): LogDigest {
  const build = passes.filter((p) => p.pass.startsWith("implement"));
  const sections = build.flatMap((p) => p.sections).filter((s) => s.heading);
  const steps = build.flatMap((p) => p.steps);
  const changes = steps.filter((s) => s.category === "change" && s.status === "ok");
  const files = new Set(changes.flatMap((s) => s.files));
  const add = changes.reduce((n, s) => n + (s.diff?.add ?? 0), 0);
  const del = changes.reduce((n, s) => n + (s.diff?.del ?? 0), 0);
  const checks = steps.filter((s) => s.tool === "run_checks");
  const lastCheck = checks[checks.length - 1];
  let checkWords: string | null = null;
  if (lastCheck) {
    if (lastCheck.status === "ok") checkWords = checks.length > 1 ? `Checks passed on the ${ordinal(checks.length)} run` : "Checks passed";
    else checkWords = `Checks didn't pass${lastCheck.summary ? ` (${lastCheck.summary})` : ""}`;
  }
  const lastStep = [...passes].reverse().find((p) => p.steps.length)?.steps.slice(-1)[0];
  const lastHeading = [...passes].reverse().flatMap((p) => [...p.sections].reverse()).find((s) => s.heading);
  return {
    headings: sections.slice(-3).map((s) => s.heading as string),
    changed: files.size ? `Changed ${plural(files.size, "file")} (+${add} −${del})` : null,
    checks: checkWords,
    now: lastHeading?.heading ?? (lastStep ? `${lastStep.verb} ${lastStep.target}` : null),
    anchor: firstStep(sections[sections.length - 1]) ?? build[0]?.steps[0]?.id ?? null,
  };
}

/**
 * The whole log, ready to draw: passes in run order (the gateway's order,
 * live steps last), each with its sections, steps, problems, time and cost.
 */
export function buildLog(log: AgentLog | null | undefined, traces: PassTrace[] = []): LogModel {
  const raw = log?.passes ?? [];
  const events = log?.live_events ?? [];
  const passes = raw.map(buildPass);
  const logged = new Set(passes.flatMap((p) => p.steps.map((s) => s.id)));
  joinOldEvents(passes, events);
  joinTraces(passes, traces);
  passes.push(...livePasses(events, logged, passes.length > 0));
  label(passes);
  const steps = passes.flatMap((p) => p.steps);
  return {
    passes,
    stepCount: steps.length,
    files: [...new Set(steps.flatMap((s) => s.files))].sort(),
    counts: {
      changes: steps.filter((s) => s.category === "change").length,
      checks: steps.filter((s) => s.category === "check").length,
      problems: steps.filter(isProblem).length,
      reading: steps.filter((s) => s.category === "read").length,
    },
    truncated: !!log?.live_events_truncated,
    digest: digestOf(passes),
  };
}

// ── Filtering and search ─────────────────────────────────────────────

export type LogFilter = "all" | "changes" | "checks" | "problems";

export function stepMatches(s: LogStep, filter: LogFilter, file: string, q: string): boolean {
  if (filter === "changes" && s.category !== "change") return false;
  if (filter === "checks" && s.category !== "check") return false;
  if (filter === "problems" && !isProblem(s)) return false;
  if (file && !s.files.includes(file)) return false;
  if (q && !s.haystack.includes(q.toLowerCase())) return false;
  return true;
}

/** A pass narrowed to the matching steps; sections keep their headings, groups unfold to their matches. */
export function filterPass(p: LogPass, filter: LogFilter, file: string, q: string): LogPass {
  if (filter === "all" && !file && !q) return p;
  const ql = q.toLowerCase();
  const sections = p.sections
    .map((s) => {
      const items: LogItem[] = [];
      for (const it of s.items) {
        if (it.kind === "note") continue;
        if (it.kind === "step") {
          if (stepMatches(it.step, filter, file, q)) items.push(it);
        } else {
          for (const step of it.steps) if (stepMatches(step, filter, file, q)) items.push({ kind: "step", step });
        }
      }
      const textHit = !!ql && filter === "all" && !file && `${s.heading ?? ""}\n${s.prose}`.toLowerCase().includes(ql);
      return { ...s, items, keep: items.length > 0 || textHit };
    })
    .filter((s) => s.keep)
    .map(({ keep: _keep, ...s }) => s);
  return { ...p, sections };
}
