import { expect, test } from "@playwright/test";
import { activePass, PASSES, runSteps } from "../src/lib/run-steps";

const history = (...passes: string[]) => passes.map((pass) => ({ pass }));
const label = (i: number) => PASSES[i];

test.describe("run steps", () => {
  test("a pr pass that ended with no pull request is not done", () => {
    const s = runSteps({
      currentPass: "implement",
      status: "running",
      passHistory: history("plan", "implement", "review", "pr", "implement"),
      hasPr: false,
    });
    expect(s.doneIdx).toBeLessThanOrEqual(PASSES.indexOf("pr"));
    // The bar and the sentence name the pass the run is really on.
    expect(label(s.activeIdx)).toBe("implement");
    expect(activePass(s, "implement")).toBe("implement");
  });

  test("checks that ran before a pull request existed are not the Review step", () => {
    const s = runSteps({
      currentPass: "review",
      status: "running",
      passHistory: history("plan", "implement", "review"),
      hasPr: false,
    });
    expect(label(s.activeIdx)).toBe("pr");
    expect(s.doneIdx).toBe(PASSES.indexOf("pr"));
  });

  test("a run that stopped with no pull request doesn't show one as done", () => {
    for (const status of ["needs_input", "failed", "completed"]) {
      const s = runSteps({
        currentPass: "pr",
        status,
        passHistory: history("plan", "implement", "pr"),
        hasPr: false,
      });
      expect(s.doneIdx, status).toBe(PASSES.indexOf("pr"));
      expect(s.activeIdx, status).toBe(-1);
    }
  });

  test("with a pull request it is done, and the run stays on Review through fix rounds", () => {
    for (const currentPass of ["review", "implement", "awaiting_ci"]) {
      const s = runSteps({
        currentPass,
        status: "running",
        passHistory: history("plan", "implement", "pr", "review", "implement"),
        hasPr: true,
      });
      expect(s.doneIdx, currentPass).toBe(PASSES.indexOf("review"));
      expect(label(s.activeIdx), currentPass).toBe("review");
    }
  });

  test("the guard's stop keeps the pull request done and nothing active", () => {
    const s = runSteps({
      currentPass: "done",
      status: "needs_input",
      passHistory: history("plan", "implement", "pr", "review"),
      hasPr: true,
    });
    expect(s.doneIdx).toBe(PASSES.indexOf("review"));
    expect(s.activeIdx).toBe(-1);
  });

  test("ordinary runs read as before", () => {
    expect(runSteps({ currentPass: "plan", status: "running", hasPr: false }).activeIdx).toBe(1);
    expect(runSteps({ status: "completed", passHistory: history("plan"), hasPr: false }).doneIdx).toBe(PASSES.length);
    expect(runSteps({ status: "merged", passHistory: history("pr"), hasPr: true }).doneIdx).toBe(PASSES.length);
    expect(
      runSteps({ currentPass: "plan", status: "needs_outside_change", passHistory: history("plan"), hasPr: false }).doneIdx,
    ).toBe(2);
    expect(activePass({ doneIdx: 0, activeIdx: -1 }, "feedback")).toBe("feedback");
  });
});
