/** The steps a run's page shows, in order. */
export const PASSES = ["triage", "plan", "implement", "test", "security", "pr", "review"];

const PR = PASSES.indexOf("pr");

export interface RunStepsInput {
  currentPass?: string;
  status: string;
  passHistory?: { pass: string }[];
  /** The run has a pull request on GitHub. */
  hasPr: boolean;
}

export interface RunSteps {
  /** Steps before this index are done. */
  doneIdx: number;
  /** The step the run is on while it works, or -1. */
  activeIdx: number;
}

/**
 * What the steps show and what "Now on the X step" says, from one answer so
 * they can't disagree.
 *
 * - Pull request is done only when a pull request exists. A pass that started
 *   and ended without one is not done, whatever came after it: older runs ran
 *   their checks under `review` before opening one, and that isn't the Review
 *   step either.
 * - Before the pull request, the step is the pass the run is really on, also
 *   when a fix round goes back to Build.
 * - After it, the run is on Review until it ends, fix rounds included: the bar
 *   doesn't go backwards.
 */
export function runSteps({ currentPass, status, passHistory, hasPr }: RunStepsInput): RunSteps {
  const current = PASSES.indexOf(currentPass ?? "");
  const everReached = (passHistory ?? []).reduce((max, e) => Math.max(max, PASSES.indexOf(e.pass)), current);
  const ranPrPass = everReached >= PR;
  const working = status === "running" || status === "awaiting_ci";

  if (hasPr) {
    const doneIdx = ["completed", "merged", "success"].includes(status)
      ? PASSES.length
      : Math.max(everReached, PR + 1);
    return { doneIdx, activeIdx: working ? doneIdx : -1 };
  }

  const reached = Math.min(everReached, PR);
  if (["completed", "merged", "success"].includes(status)) {
    // Finished with nothing to open is finished; a pull request step that
    // opened none is not.
    return { doneIdx: ranPrPass ? PR : PASSES.length, activeIdx: -1 };
  }
  // A run whose fix is outside the code finished its plan and stopped there on purpose.
  if (status === "needs_outside_change") {
    return { doneIdx: Math.max(reached, PASSES.indexOf("plan")) + 1, activeIdx: -1 };
  }
  if (working && current >= 0) {
    const on = Math.min(current, PR);
    return { doneIdx: on, activeIdx: on };
  }
  return { doneIdx: reached, activeIdx: working ? reached : -1 };
}

/** The step's raw name for the page's sentence: the active step when the bar has one. */
export function activePass(steps: RunSteps, currentPass?: string): string {
  return steps.activeIdx >= 0 ? PASSES[steps.activeIdx] : (currentPass ?? "");
}
