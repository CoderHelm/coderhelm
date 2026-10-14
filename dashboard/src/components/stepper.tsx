import { CheckIcon } from "./icons";

export interface Step {
  id: string;
  label: string;
}

/** Vertical list of steps; wraps into a row on narrow screens. */
export function Stepper({ steps, current, label = "Steps" }: { steps: Step[]; current: string; label?: string }) {
  const at = steps.findIndex((s) => s.id === current);
  return (
    <ol aria-label={label} className="flex flex-row flex-wrap gap-x-4 gap-y-2 md:flex-col md:gap-3">
      {steps.map((step, i) => {
        const state = i < at ? "done" : i === at ? "current" : "upcoming";
        return (
          <li
            key={step.id}
            aria-current={state === "current" ? "step" : undefined}
            className={`flex items-center gap-2.5 text-sm ${
              state === "current" ? "text-zinc-100 font-semibold" : state === "done" ? "text-zinc-400" : "text-zinc-500"
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
            : "border-zinc-600 text-zinc-500"
      }`}
    >
      {state === "done" ? <span className="scale-75"><CheckIcon /></span> : number}
    </span>
  );
}
