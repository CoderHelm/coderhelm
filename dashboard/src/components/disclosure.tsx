import type { ReactNode } from "react";
import { ChevronRightIcon } from "./icons";
import { focusRing } from "./ui";

/** A styled <details>: collapsed extra reading such as "Technical details". */
export function Disclosure({
  summary,
  children,
  defaultOpen,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group rounded-lg border border-zinc-800 text-sm text-zinc-400">
      <summary
        className={`flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-2 text-zinc-300 hover:text-zinc-100 [&::-webkit-details-marker]:hidden ${focusRing}`}
      >
        <span aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none">
          <ChevronRightIcon />
        </span>
        {summary}
      </summary>
      <div className="flex flex-col gap-2 px-4 pb-4">{children}</div>
    </details>
  );
}
