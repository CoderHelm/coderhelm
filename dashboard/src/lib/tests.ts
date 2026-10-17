import type {
  AttemptStatus,
  CauseLabel,
  FixStatus,
  RunOutcome,
  TestCase,
  TestRecommendation,
  TestState,
} from "@/lib/api";

// Words and small formatters shared by the Tests pages, so a state or a cause
// reads the same everywhere it appears.

export type Tone = "neutral" | "success" | "warning" | "error";

export const STATE_LABEL: Record<TestState, string> = {
  healthy: "Healthy",
  flaky: "Flaky",
  broken: "Broken",
  quarantined: "Quarantined",
  fixed: "Fixed",
};

export const STATE_TONE: Record<TestState, Tone> = {
  healthy: "success",
  flaky: "warning",
  broken: "error",
  quarantined: "neutral",
  fixed: "success",
};

/** One line on what each state means, for people who haven't read the docs. */
export const STATE_HELP: Record<TestState, string> = {
  healthy: "Passes steadily.",
  flaky: "Passed and failed on the same commit, so the result can't be trusted.",
  broken: "Fails almost every time, across several commits. A real problem, never quarantined.",
  quarantined: "Still runs and is still recorded, but can't fail the build.",
  fixed: "No flaky result for 30 days after a fix.",
};

export const CAUSE_LABEL: Record<CauseLabel, string> = {
  selector_changed: "Selector changed",
  missing_wait: "Missing wait or race",
  test_data_clash: "Test data clash",
  environment: "Environment",
  network: "Network",
  timing: "Timing or clock",
  order_dependence: "Depends on test order",
  animation_loader: "Animation or loader",
  unknown: "Cause unknown",
};

export const FIX_LABEL: Record<FixStatus, string> = {
  reproducing: "Reproducing the failure",
  fixing: "Writing a fix",
  burn_in: "Proving the fix (20 runs)",
  opened: "Fix PR open",
  merged: "Fix merged",
  failed: "Couldn't fix it",
};

export const OUTCOME_LABEL: Record<RunOutcome, string> = {
  passed: "Passed",
  failed: "Failed",
  flaky: "Passed on retry",
  skipped: "Skipped",
};

export const OUTCOME_TONE: Record<RunOutcome, Tone> = {
  passed: "success",
  failed: "error",
  flaky: "warning",
  skipped: "neutral",
};

export const ATTEMPT_LABEL: Record<AttemptStatus, string> = {
  passed: "Passed",
  failed: "Failed",
  timedOut: "Timed out",
  skipped: "Skipped",
  interrupted: "Interrupted",
};

export const RECOMMENDATION_STATUS: Record<TestRecommendation["status"], string> = {
  open: "Suggested",
  accepted: "Accepted",
  generating: "Writing the test",
  pr_opened: "PR open",
  dismissed: "Dismissed",
};

export const EVIDENCE_LABEL: Record<TestRecommendation["evidence"][number]["kind"], string> = {
  bug_ticket: "Bug ticket",
  changed_code: "Changed code",
  route: "Untested page",
  traffic: "Busy journey",
};

/** `0.123` → `12%`; small non-zero rates keep one decimal so they don't read as zero. */
export function pct(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return "—";
  const v = rate * 100;
  if (v > 0 && v < 1) return `${v.toFixed(1)}%`;
  return `${Math.round(v)}%`;
}

export function minutes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 min";
  if (n < 60) return `${Math.round(n)} min`;
  const h = n / 60;
  return `${h < 10 ? h.toFixed(1) : Math.round(h)} h`;
}

export function shortSha(sha: string): string {
  return (sha || "").slice(0, 7);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** A test's name as people say it: the title, with the browser or device when there is one. */
export function testName(t: Pick<TestCase, "title" | "project">): string {
  return t.project ? `${t.title} (${t.project})` : t.title;
}

export function githubPrUrl(repo: string, pr: number): string {
  return `https://github.com/${repo}/pull/${pr}`;
}

export function testHref(id: string): string {
  return `/tests/test?id=${encodeURIComponent(id)}`;
}

export function runHref(runKey: string): string {
  return `/tests/run?key=${encodeURIComponent(runKey)}`;
}

/** The repo picker's value, kept per browser so a team with one main repo picks it once. */
const REPO_KEY = "coderhelm.tests.repo";

export function readRepo(): string {
  try {
    return localStorage.getItem(REPO_KEY) || "";
  } catch {
    return "";
  }
}

export function writeRepo(repo: string) {
  try {
    if (repo) localStorage.setItem(REPO_KEY, repo);
    else localStorage.removeItem(REPO_KEY);
  } catch {}
}
