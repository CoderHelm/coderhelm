"use client";

import { ScrollFade } from "./scroll-fade";
import { focusRing } from "./ui";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** A small set of mutually exclusive choices shown side by side. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  /** Accessible name for the group, e.g. "Use of Orders API". */
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  // A row wider than a phone scrolls sideways, with a fade on the edge that has more.
  return (
    <ScrollFade axis="x" className="inline-block max-w-full align-middle" innerClassName="[scrollbar-width:none]">
    <div role="group" aria-label={label} className="inline-flex shrink-0 rounded-lg border border-zinc-700">
      {options.map((option, i) => {
        const pressed = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`min-h-8 px-3 py-1 text-sm disabled:opacity-50 ${i > 0 ? "border-l border-zinc-700" : ""} ${
              i === 0 ? "rounded-l-[7px]" : ""
            } ${i === options.length - 1 ? "rounded-r-[7px]" : ""} ${
              pressed ? "bg-zinc-100 text-zinc-900 font-semibold" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
            } ${focusRing}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
    </ScrollFade>
  );
}
