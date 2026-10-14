import { CheckIcon, XIcon } from "./icons";

export type CheckState = "pending" | "running" | "passed" | "failed";

export interface CheckItem {
  id: string;
  label: string;
  state: CheckState;
  detail?: string;
  /** Shown only for a failed check: the one thing to do next. */
  fix?: string;
}

const STATE_WORD: Record<CheckState, string> = {
  pending: "Waiting",
  running: "Checking…",
  passed: "Passed",
  failed: "Failed",
};

/** Named checks, each with its own state, a detail line and, when failed, what to do. */
export function CheckList({ items, label = "Checks" }: { items: CheckItem[]; label?: string }) {
  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id} data-state={item.state} className="flex items-start gap-3">
          <CheckDot state={item.state} />
          <div className="min-w-0 flex-1 text-sm break-words">
            <p className="font-semibold text-zinc-100">
              {item.label}
              <span
                className={`ml-2 text-xs font-medium ${
                  item.state === "passed" ? "text-emerald-400" : item.state === "failed" ? "text-red-400" : "text-zinc-500"
                }`}
              >
                {STATE_WORD[item.state]}
              </span>
            </p>
            {item.detail && <p className="text-zinc-400">{item.detail}</p>}
            {item.state === "failed" && item.fix && (
              <p role="alert" className="mt-1 text-red-200">
                <span className="font-semibold text-zinc-100">What to do: </span>
                {item.fix}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function CheckDot({ state }: { state: CheckState }) {
  const base = "mt-0.5 w-6 h-6 shrink-0 rounded-full border flex items-center justify-center";
  if (state === "passed") {
    return <span aria-hidden="true" className={`${base} bg-emerald-400 border-emerald-400 text-emerald-950`}><span className="scale-75"><CheckIcon /></span></span>;
  }
  if (state === "failed") {
    return <span aria-hidden="true" className={`${base} bg-red-400 border-red-400 text-red-950`}><span className="scale-75"><XIcon /></span></span>;
  }
  if (state === "running") {
    return <span aria-hidden="true" className={`${base} border-zinc-600 border-t-zinc-100 animate-spin motion-reduce:animate-none`} />;
  }
  return <span aria-hidden="true" className={`${base} border-zinc-600`} />;
}
