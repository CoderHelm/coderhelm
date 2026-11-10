import type { RunCheck, RunChecks } from "./api";
import { PASSES } from "./run-steps";

// The run page's timeline: each step the run went through, in plain words,
// with how long it took and the notes it wrote while on it, ending on where
// the run is now. Pure, so the e2e suite checks it directly.

export type StepState = "done" | "running" | "waiting" | "needs_you" | "failed" | "stopped";

export interface TimelineNote {
  message: string;
  timestamp: string;
}

export interface TimelineStep {
  key: string;
  /** The worker's step name, or `end` for where the run is now. */
  pass: string;
  title: string;
  state: StepState;
  started_at?: string;
  /** Empty while it runs. */
  ended_at?: string;
  notes: TimelineNote[];
}

export interface TimelineInput {
  status: string;
  current_pass?: string | null;
  pass_history?: { pass: string; started_at: string }[] | null;
  progress_notes?: TimelineNote[] | null;
  updated_at?: string | null;
  created_at?: string | null;
  pr_number?: number | null;
  /** The run has a pull request on GitHub. */
  hasPr: boolean;
  /** `draft_hold.kind`, when its pull request is still a draft. */
  hold?: string | null;
  questions?: number;
  waitingOn?: string | null;
  closedBy?: string | null;
}

/** A note the worker writes for each tool call. */
export const TOOL_NOTE = /^Tool: /;

const OVER = ["completed", "success", "merged", "failed", "cancelled", "closed", "needs_outside_change", "covered_by_pr", "retried", "archived"];

/** A step's title: done in the past tense, running in the present. */
const TITLES: Record<string, [string, string]> = {
  triage: ["Read the ticket", "Reading the ticket"],
  plan: ["Planned the change", "Planning the change"],
  implement: ["Built the change", "Building the change"],
  test: ["Ran the tests", "Running the tests"],
  security: ["Checked for security problems", "Checking for security problems"],
  review: ["Checked the pull request", "Checking the pull request"],
  ci_fix: ["Fixed a failing check", "Fixing a failing check"],
  feedback: ["Worked on review comments", "Working on review comments"],
};

/** The short name of a step still to come ("Still to come: tests, pull request"). */
const UPCOMING: Record<string, string> = {
  triage: "reading the ticket",
  plan: "the plan",
  implement: "the change",
  test: "tests",
  security: "a security check",
  pr: "the pull request",
  review: "its checks",
};

function words(pass: string): string {
  const w = pass.replace(/[:_]/g, " ").trim();
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : "A step";
}

function title(pass: string, running: boolean, prNumber: number | null | undefined, hasPr: boolean, afterPr: boolean): string {
  const base = pass.split(":")[0];
  if (base === "pr") {
    if (running) return "Opening the pull request";
    return hasPr ? (prNumber ? `Opened pull request #${prNumber}` : "Opened the pull request") : "Prepared the pull request";
  }
  // Building again after the pull request opened is a fix round on it.
  if (afterPr && (base === "implement" || base === "test")) return running ? "Fixing the pull request" : "Fixed the pull request";
  const t = TITLES[base];
  return t ? t[running ? 1 : 0] : words(pass);
}

const ms = (iso?: string | null) => {
  if (!iso) return NaN;
  return new Date(iso).getTime();
};

/** Where the run is now, as the timeline's last entry; null when its last step says it. */
function endStep(i: TimelineInput): Omit<TimelineStep, "key" | "notes"> | null {
  const pr = i.pr_number ? `pull request #${i.pr_number}` : "the pull request";
  const at = i.updated_at ?? undefined;
  if (i.hold) {
    const state: StepState = i.hold === "waiting" ? "waiting" : i.hold === "failed" ? "failed" : "needs_you";
    const t = i.hold === "waiting" ? `Holding ${pr} as a draft until a check finishes` : i.hold === "failed" ? `GitHub refused to mark ${pr} ready` : `Holding ${pr} as a draft`;
    return { pass: "end", title: t, state, started_at: at };
  }
  switch (i.status) {
    case "awaiting_ci":
      return { pass: "end", title: i.hasPr ? `Waiting for the checks on ${pr}` : "Waiting for the checks", state: "waiting", started_at: at };
    case "needs_input":
      return {
        pass: "end",
        title: i.questions ? (i.questions === 1 ? "Waiting for your answer" : `Waiting for your answers to ${i.questions} questions`) : i.waitingOn || "Waiting for more detail",
        state: "needs_you",
        started_at: at,
      };
    case "completed":
    case "success":
      return { pass: "end", title: i.hasPr ? `Handed ${pr} over for review` : "Finished", state: "done", started_at: at };
    case "merged":
      return { pass: "end", title: i.pr_number ? `Pull request #${i.pr_number} merged` : "Pull request merged", state: "done", started_at: at };
    case "needs_outside_change":
      return { pass: "end", title: "Reported the change to make outside the code", state: "done", started_at: at };
    case "covered_by_pr":
      return { pass: "end", title: "Linked the open pull request that already does it", state: "done", started_at: at };
    case "cancelled":
      return { pass: "end", title: "Cancelled", state: "stopped", started_at: at };
    case "closed":
      return { pass: "end", title: i.closedBy ? `Closed by ${i.closedBy}` : "Closed", state: "stopped", started_at: at };
    case "retried":
      return { pass: "end", title: "Continued in a new run", state: "stopped", started_at: at };
    default:
      return null;
  }
}

/**
 * The run's steps in the order they ran, each with its notes and end time,
 * then where the run is now. A failed run's last step is the one that failed;
 * a running run's last step is the one running.
 */
export function runTimeline(i: TimelineInput): TimelineStep[] {
  const history = (i.pass_history ?? []).filter((e) => e && e.pass);
  const running = i.status === "running";
  const end = endStep(i);
  const prAt = history.findIndex((e) => e.pass === "pr");
  const steps: TimelineStep[] = history.map((e, n) => {
    const last = n === history.length - 1;
    const next = history[n + 1]?.started_at;
    const state: StepState = last && running ? "running" : last && i.status === "failed" ? "failed" : "done";
    const ended = next ?? (last && OVER.includes(i.status) ? i.updated_at ?? undefined : undefined);
    return {
      key: `${e.pass}-${n}`,
      pass: e.pass,
      title: title(e.pass, state === "running", i.pr_number, i.hasPr, prAt >= 0 && n > prAt),
      state,
      started_at: e.started_at,
      ended_at: state === "running" ? undefined : ended,
      notes: [],
    };
  });
  if (end) {
    // The run's last step ended when the run reached where it is now.
    const last = steps[steps.length - 1];
    if (last && !last.ended_at && last.state === "done") last.ended_at = end.started_at;
    steps.push({ ...end, key: "end", notes: [] });
  } else if (steps.length === 0 && OVER.includes(i.status)) {
    steps.push({ key: "end", pass: "end", title: i.status === "failed" ? "Stopped before its first step" : "Over", state: i.status === "failed" ? "failed" : "stopped", notes: [] });
  }
  // Each note goes under the step that was running when it was written.
  // "Tool: read_file — …" notes repeat the agent log's steps one by one; the
  // build's digest (from the agent log) says what they add up to instead.
  const notes = [...(i.progress_notes ?? [])].filter((n) => n && n.message && !TOOL_NOTE.test(n.message)).sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));
  for (const note of notes) {
    const t = ms(note.timestamp);
    let target = -1;
    for (let k = 0; k < steps.length; k++) {
      const s = ms(steps[k].started_at);
      if (!Number.isNaN(s) && !Number.isNaN(t) && s <= t) target = k;
    }
    if (target < 0) target = 0;
    steps[target]?.notes.push(note);
  }
  return steps;
}

/** What the run still has ahead while it works, in a few words; empty when nothing is. */
export function stillToCome(i: { status: string; current_pass?: string | null; pass_history?: { pass: string }[] | null; hasPr: boolean }): string[] {
  if (!["running", "pending", "queued"].includes(i.status)) return [];
  if (i.hasPr) return [];
  const reached = Math.max(PASSES.indexOf(i.current_pass ?? ""), ...(i.pass_history ?? []).map((e) => PASSES.indexOf(e.pass)));
  return PASSES.slice(reached + 1).map((p) => UPCOMING[p]).filter(Boolean);
}

/** Seconds between two times, or to `now` when the second is missing. */
export function spanSeconds(from?: string | null, to?: string | null, now = Date.now()): number | null {
  const a = ms(from);
  if (Number.isNaN(a)) return null;
  const b = to ? ms(to) : now;
  if (Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 1000));
}

// ---- Checks ---------------------------------------------------------------

export type CheckGroup = "failed" | "running" | "queued" | "passed" | "skipped";

/** Which group a check is in: the server's own word; anything new reads as still running. */
export function checkGroup(c: Pick<RunCheck, "state">): CheckGroup {
  return (["failed", "running", "queued", "passed", "skipped"] as string[]).includes(c.state) ? (c.state as CheckGroup) : "running";
}

const GROUP_ORDER: CheckGroup[] = ["failed", "running", "queued", "passed", "skipped"];

/** The checks, failures first, then running, queued, passed and skipped; required ones first in each group. */
export function sortedChecks(items: RunCheck[]): RunCheck[] {
  return [...items].sort(
    (a, b) =>
      GROUP_ORDER.indexOf(checkGroup(a)) - GROUP_ORDER.indexOf(checkGroup(b)) ||
      Number(b.required) - Number(a.required) ||
      a.name.localeCompare(b.name),
  );
}

/**
 * The checks in one sentence, as GitHub's merge box says them:
 * "1 failed, 2 running, 1 queued, 12 passed". Counts come from the server;
 * the list is only used when they are missing.
 */
export function checksSentence(c: RunChecks): string {
  const n = c.counts ?? countChecks(c.items ?? []);
  const parts = [
    n.failed > 0 && `${n.failed} failed`,
    n.running > 0 && `${n.running} running`,
    n.queued > 0 && `${n.queued} queued`,
    n.passed > 0 && `${n.passed} passed`,
    n.skipped > 0 && `${n.skipped} skipped`,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "No checks reported yet";
}

export function countChecks(items: RunCheck[]): RunChecks["counts"] {
  const n = { passed: 0, failed: 0, running: 0, queued: 0, skipped: 0 };
  for (const c of items) n[checkGroup(c)] += 1;
  return n;
}

/** The headline for the checks: what is holding the pull request, if anything. */
export function checksHeadline(c: RunChecks): string {
  const n = c.counts ?? countChecks(c.items ?? []);
  if (n.failed > 0) return n.failed === 1 ? "1 check failed" : `${n.failed} checks failed`;
  if (n.running + n.queued > 0) return "Some checks haven't finished yet";
  if (n.passed > 0) return "All checks passed";
  return "No checks reported yet";
}
