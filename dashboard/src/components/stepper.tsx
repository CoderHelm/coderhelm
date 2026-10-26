import { CheckIcon } from "./icons";

export interface Step {
  id: string;
  label: string;
}

/**
 * Vertical list of steps. On a phone it is one line, "Step 2 of 5 · Where
 * your API is", over a thin progress bar, instead of a ragged wrapped row.
 */
export function Stepper({ steps, current, label = "Steps" }: { steps: Step[]; current: string; label?: string }) {
  const at = steps.findIndex((s) => s.id === current);
  const shownAt = Math.max(0, at);
  return (
    <>
    <div className="md:hidden" data-testid="stepper-compact">
      <p className="text-sm text-zinc-300">
        <span className="font-semibold text-zinc-100">
          Step {shownAt + 1} of {steps.length}
        </span>
        {steps[shownAt] && <> · {steps[shownAt].label}</>}
      </p>
      <div aria-hidden="true" className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-zinc-200" style={{ width: `${((shownAt + 1) / Math.max(1, steps.length)) * 100}%` }} />
      </div>
    </div>
    <ol aria-label={label} className="hidden flex-col gap-3 md:flex">
      {steps.map((step, i) => {
        const state = i < at ? "done" : i === at ? "current" : "upcoming";
        return (
          <li
            key={step.id}
            aria-current={state === "current" ? "step" : undefined}
            className={`flex items-center gap-2.5 text-sm ${
              state === "current" ? "text-zinc-100 font-semibold" : "text-zinc-400"
            }`}
          >
            <StepDot state={state} number={i + 1} />
            <span>
              {step.label}
              <span className="sr-only">
                {state === "done" ? " (done)" : state === "current" ? " (current step)" : " (not started)"}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
    </>
  );
}

export function StepDot({ state, number }: { state: "done" | "current" | "upcoming"; number: number }) {
  return (
    <span
      aria-hidden="true"
      className={`w-6 h-6 shrink-0 rounded-full border flex items-center justify-center text-xs ${
        state === "done"
          ? "bg-emerald-400 border-emerald-400 text-emerald-950"
          : state === "current"
            ? "border-zinc-100 text-zinc-100"
            : "border-zinc-600 text-zinc-400"
      }`}
    >
      {state === "done" ? <span className="scale-75"><CheckIcon /></span> : number}
    </span>
  );
}
