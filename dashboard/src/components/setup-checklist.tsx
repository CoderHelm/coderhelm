import type { ReactNode } from "react";
import { Disclosure } from "./disclosure";
import { CheckIcon, WarningIcon } from "./icons";

// A setup checklist: a few short steps, each with the state Coderhelm
// actually detected. Done steps stay one quiet line; the rest can offer the
// manual path ("Do it myself"), collapsed, with only that step's snippet.

export type SetupStepState = "done" | "missing" | "partial" | "unknown" | "unsupported";

export interface SetupItem {
  id: string;
  label: string;
  state: SetupStepState;
  detail: ReactNode;
  /** The manual path for this step, shown collapsed under "Do it myself". */
  manual?: ReactNode;
}

const STATE_WORD: Record<SetupStepState, string> = {
  done: "Done",
  missing: "Not done",
  partial: "Needs a look",
  unknown: "Unknown",
  unsupported: "Not available",
};

export function SetupChecklist({ items, label }: { items: SetupItem[]; label: string }) {
  return (
    <ul aria-label={label} className="mt-4 divide-y divide-zinc-800/80 border-t border-zinc-800/80">
      {items.map((it) => (
        <SetupChecklistRow key={it.id} item={it} />
      ))}
    </ul>
  );
}

function SetupChecklistRow({ item }: { item: SetupItem }) {
  const done = item.state === "done";
  return (
    <li data-testid="setup-step" data-step={item.id} data-state={item.state} className="flex items-start gap-3 py-2.5">
      <StepDot state={item.state} />
      <div className="min-w-0 flex-1 text-sm">
        <p className={done ? "text-zinc-400" : "text-zinc-100"}>
          <span className="font-medium">{item.label}</span>
          <span className="sr-only">: {STATE_WORD[item.state]}</span>
          <span className={`ml-2 ${done ? "text-zinc-500" : "text-zinc-400"}`}>{item.detail}</span>
        </p>
        {!done && item.manual && (
          <div className="mt-2">
            <Disclosure summary="Do it myself">{item.manual}</Disclosure>
          </div>
        )}
      </div>
    </li>
  );
}

function StepDot({ state }: { state: SetupStepState }) {
  const base = "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border";
  if (state === "done")
    return (
      <span aria-hidden="true" className={`${base} border-emerald-400 bg-emerald-400 text-emerald-950`}>
        <span className="scale-[0.65]"><CheckIcon /></span>
      </span>
    );
  if (state === "partial")
    return (
      <span aria-hidden="true" className={`${base} border-amber-400/60 text-amber-300`}>
        <span className="scale-[0.6]"><WarningIcon /></span>
      </span>
    );
  if (state === "unsupported") return <span aria-hidden="true" className={`${base} border-zinc-700 bg-zinc-800`} />;
  return <span aria-hidden="true" className={`${base} border-zinc-600`} />;
}
